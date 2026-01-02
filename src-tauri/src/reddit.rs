use crate::settings::RedditCredentials;
use crate::database::with_db;
use crate::topics::extract_topics;
use serde::{Deserialize, Serialize};
use rusqlite::params;

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[allow(dead_code)]
    token_type: String,
    #[allow(dead_code)]
    expires_in: u64,
}

#[derive(Debug, Deserialize)]
struct RedditListing {
    data: RedditListingData,
}

#[derive(Debug, Deserialize)]
struct RedditListingData {
    children: Vec<RedditChild>,
}

#[derive(Debug, Deserialize)]
struct RedditChild {
    data: RedditPostData,
}

#[derive(Debug, Deserialize)]
struct RedditPostData {
    id: String,
    subreddit: String,
    author: String,
    title: String,
    selftext: String,
    score: i64,
    num_comments: i64,
    created_utc: f64,
    #[allow(dead_code)]
    permalink: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CollectionResult {
    pub posts_collected: u32,
    pub topics_extracted: u32,
}

pub async fn test_connection(credentials: &RedditCredentials) -> Result<bool, String> {
    let token = get_access_token(credentials).await?;

    let client = reqwest::Client::new();
    let response = client
        .get("https://oauth.reddit.com/api/v1/me")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Trendr/1.0.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.status().is_success())
}

async fn get_access_token(credentials: &RedditCredentials) -> Result<String, String> {
    let client = reqwest::Client::new();
    let auth = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        format!("{}:{}", credentials.client_id, credentials.client_secret),
    );

    let response = client
        .post("https://www.reddit.com/api/v1/access_token")
        .header("Authorization", format!("Basic {}", auth))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", "Trendr/1.0.0")
        .body(format!(
            "grant_type=password&username={}&password={}",
            credentials.username, credentials.password
        ))
        .send()
        .await
        .map_err(|e| format!("Failed to get token: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Token request failed: {}", response.status()));
    }

    let token_response: TokenResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    Ok(token_response.access_token)
}

pub async fn collect(
    credentials: &RedditCredentials,
    subreddits: &[String],
) -> Result<CollectionResult, String> {
    let token = get_access_token(credentials).await?;
    let client = reqwest::Client::new();

    let mut total_posts = 0u32;
    let mut total_topics = 0u32;

    for subreddit in subreddits {
        match fetch_subreddit_posts(&client, &token, subreddit).await {
            Ok(posts) => {
                for post in posts {
                    match process_post(&post).await {
                        Ok(topics_found) => {
                            total_posts += 1;
                            total_topics += topics_found;
                        }
                        Err(e) => {
                            log::warn!("Failed to process post {}: {}", post.id, e);
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to fetch r/{}: {}", subreddit, e);
            }
        }

        // Rate limiting
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Ok(CollectionResult {
        posts_collected: total_posts,
        topics_extracted: total_topics,
    })
}

async fn fetch_subreddit_posts(
    client: &reqwest::Client,
    token: &str,
    subreddit: &str,
) -> Result<Vec<RedditPostData>, String> {
    let url = format!("https://oauth.reddit.com/r/{}/hot?limit=25", subreddit);

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "Trendr/1.0.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch r/{}: {}", subreddit, response.status()));
    }

    let listing: RedditListing = response.json().await.map_err(|e| e.to_string())?;

    Ok(listing.data.children.into_iter().map(|c| c.data).collect())
}

async fn process_post(post: &RedditPostData) -> Result<u32, String> {
    // Check if post already exists
    let exists = with_db(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM content WHERE platform = 'reddit' AND platform_id = ?1",
            params![&post.id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })?;

    if exists {
        return Ok(0);
    }

    // Get or create creator
    let creator_id = get_or_create_creator(&post.author)?;

    // Insert content
    let content_id = uuid::Uuid::new_v4().to_string();
    let text_content = format!("{}\n\n{}", post.title, post.selftext).trim().to_string();
    let published_at = chrono::DateTime::from_timestamp(post.created_utc as i64, 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_default();

    with_db(|conn| {
        conn.execute(
            r#"INSERT INTO content (id, platform, platform_id, creator_id, content_type, text_content,
               engagement_likes, engagement_comments, published_at)
               VALUES (?1, 'reddit', ?2, ?3, 'post', ?4, ?5, ?6, ?7)"#,
            params![
                &content_id,
                &post.id,
                &creator_id,
                &text_content,
                post.score,
                post.num_comments,
                &published_at
            ],
        )?;
        Ok(())
    })?;

    // Extract topics
    let topics = extract_topics(&text_content)?;
    let topics_count = topics.len() as u32;

    // Link content to topics
    for topic in &topics {
        with_db(|conn| {
            conn.execute(
                "INSERT OR REPLACE INTO content_topics (content_id, topic_id, confidence) VALUES (?1, ?2, ?3)",
                params![&content_id, &topic.topic_id, topic.confidence],
            )?;
            Ok(())
        })?;
    }

    // Update co-occurrences
    if topics.len() > 1 {
        let topic_ids: Vec<String> = topics.iter().map(|t| t.topic_id.clone()).collect();
        update_cooccurrences(&topic_ids)?;
    }

    Ok(topics_count)
}

fn get_or_create_creator(username: &str) -> Result<String, String> {
    // Check if creator exists
    let existing = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id FROM creators WHERE platform = 'reddit' AND username = ?1"
        )?;
        let mut rows = stmt.query(params![username])?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            Ok(Some(id))
        } else {
            Ok(None)
        }
    })?;

    if let Some(id) = existing {
        return Ok(id);
    }

    // Create new creator
    let creator_id = uuid::Uuid::new_v4().to_string();
    with_db(|conn| {
        conn.execute(
            "INSERT INTO creators (id, platform, platform_id, username) VALUES (?1, 'reddit', ?2, ?2)",
            params![&creator_id, username],
        )?;
        Ok(())
    })?;

    Ok(creator_id)
}

fn update_cooccurrences(topic_ids: &[String]) -> Result<(), String> {
    for i in 0..topic_ids.len() {
        for j in (i + 1)..topic_ids.len() {
            let (a, b) = if topic_ids[i] < topic_ids[j] {
                (&topic_ids[i], &topic_ids[j])
            } else {
                (&topic_ids[j], &topic_ids[i])
            };

            with_db(|conn| {
                conn.execute(
                    r#"INSERT INTO topic_cooccurrences (topic_a_id, topic_b_id, frequency, last_seen)
                       VALUES (?1, ?2, 1, CURRENT_TIMESTAMP)
                       ON CONFLICT(topic_a_id, topic_b_id) DO UPDATE SET
                       frequency = frequency + 1, last_seen = CURRENT_TIMESTAMP"#,
                    params![a, b],
                )?;
                Ok(())
            })?;
        }
    }
    Ok(())
}
