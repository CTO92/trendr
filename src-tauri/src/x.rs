use crate::database::with_db;
use crate::settings::XCredentials;
use crate::topics::extract_topics;
use rusqlite::params;
use serde::Deserialize;

// X API v2 Response Types
#[derive(Debug, Deserialize)]
struct TweetSearchResponse {
    data: Option<Vec<Tweet>>,
    includes: Option<Includes>,
    meta: Option<Meta>,
}

#[derive(Debug, Deserialize)]
struct Tweet {
    id: String,
    text: String,
    author_id: String,
    created_at: Option<String>,
    public_metrics: Option<PublicMetrics>,
}

#[derive(Debug, Deserialize)]
struct PublicMetrics {
    like_count: i64,
    reply_count: i64,
    retweet_count: i64,
    #[serde(default)]
    impression_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct Includes {
    users: Option<Vec<XUser>>,
}

#[derive(Debug, Deserialize)]
struct XUser {
    id: String,
    username: String,
    name: String,
    public_metrics: Option<UserPublicMetrics>,
}

#[derive(Debug, Deserialize)]
struct UserPublicMetrics {
    followers_count: i64,
    #[allow(dead_code)]
    following_count: i64,
    #[allow(dead_code)]
    tweet_count: i64,
}

#[derive(Debug, Deserialize)]
struct Meta {
    #[allow(dead_code)]
    newest_id: Option<String>,
    #[allow(dead_code)]
    oldest_id: Option<String>,
    result_count: Option<i32>,
    next_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserMeResponse {
    data: Option<UserMeData>,
}

#[derive(Debug, Deserialize)]
struct UserMeData {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    username: String,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    #[allow(dead_code)]
    title: Option<String>,
    detail: Option<String>,
    #[serde(rename = "type")]
    #[allow(dead_code)]
    error_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ErrorResponse {
    errors: Option<Vec<ApiError>>,
    detail: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CollectionResult {
    pub posts_collected: u32,
    pub topics_extracted: u32,
}

const USER_AGENT: &str = "Trendr/1.0.0";
const BASE_URL: &str = "https://api.twitter.com/2";

/// Test connection to X API using the bearer token
pub async fn test_connection(bearer_token: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();

    let response = client
        .get(format!("{}/users/me", BASE_URL))
        .header("Authorization", format!("Bearer {}", bearer_token))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to X API: {}", e))?;

    if response.status().is_success() {
        let user_response: UserMeResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(user_response.data.is_some())
    } else if response.status() == 401 {
        Err("Invalid bearer token. Please check your credentials.".to_string())
    } else if response.status() == 403 {
        Err("Access forbidden. Your API tier may not support this endpoint.".to_string())
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Err(format!("X API error: {}", error_text))
    }
}

/// Collect tweets from X based on search queries
pub async fn collect(
    credentials: &XCredentials,
    queries: &[String],
) -> Result<CollectionResult, String> {
    let client = reqwest::Client::new();

    let mut total_posts = 0u32;
    let mut total_topics = 0u32;

    for query in queries {
        log::info!("Searching X for: {}", query);

        match search_tweets(&client, &credentials.bearer_token, query).await {
            Ok(response) => {
                if let Some(tweets) = response.data {
                    let users_map = build_users_map(&response.includes);

                    for tweet in tweets {
                        let author = users_map.get(&tweet.author_id);

                        match process_tweet(&tweet, author).await {
                            Ok(topics_found) => {
                                total_posts += 1;
                                total_topics += topics_found;
                            }
                            Err(e) => {
                                log::warn!("Failed to process tweet {}: {}", tweet.id, e);
                            }
                        }
                    }
                }

                if let Some(meta) = &response.meta {
                    log::info!(
                        "Query '{}': {} tweets found",
                        query,
                        meta.result_count.unwrap_or(0)
                    );
                }
            }
            Err(e) => {
                log::error!("Failed to search X for '{}': {}", query, e);
            }
        }

        // Rate limiting: ~1 second between requests to stay well under limits
        tokio::time::sleep(tokio::time::Duration::from_millis(1100)).await;
    }

    Ok(CollectionResult {
        posts_collected: total_posts,
        topics_extracted: total_topics,
    })
}

/// Build a map of user_id -> XUser for easy lookup
fn build_users_map(includes: &Option<Includes>) -> std::collections::HashMap<String, &XUser> {
    let mut map = std::collections::HashMap::new();

    if let Some(includes) = includes {
        if let Some(users) = &includes.users {
            for user in users {
                map.insert(user.id.clone(), user);
            }
        }
    }

    map
}

/// Search for recent tweets matching a query
async fn search_tweets(
    client: &reqwest::Client,
    bearer_token: &str,
    query: &str,
) -> Result<TweetSearchResponse, String> {
    // Build search query - exclude retweets for cleaner data
    let search_query = format!("{} -is:retweet", query);

    let url = format!(
        "{}/tweets/search/recent?query={}&tweet.fields=id,text,author_id,created_at,public_metrics&user.fields=id,username,name,public_metrics&expansions=author_id&max_results=100",
        BASE_URL,
        urlencoding::encode(&search_query)
    );

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", bearer_token))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();

    if status.is_success() {
        let tweet_response: TweetSearchResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse tweets: {}", e))?;

        Ok(tweet_response)
    } else if status == 429 {
        // Rate limited
        Err("Rate limited by X API. Please wait before collecting again.".to_string())
    } else if status == 401 {
        Err("Invalid bearer token".to_string())
    } else if status == 403 {
        Err("Access forbidden. Your API tier may not support search.".to_string())
    } else {
        // Try to get error details
        let error_response: Result<ErrorResponse, _> = response.json().await;
        let error_msg = match error_response {
            Ok(err) => {
                if let Some(detail) = err.detail {
                    detail
                } else if let Some(errors) = err.errors {
                    errors
                        .first()
                        .and_then(|e| e.detail.clone())
                        .unwrap_or_else(|| format!("HTTP {}", status))
                } else {
                    format!("HTTP {}", status)
                }
            }
            Err(_) => format!("HTTP {}", status),
        };

        Err(format!("X API error: {}", error_msg))
    }
}

/// Process a single tweet and store it in the database
async fn process_tweet(tweet: &Tweet, author: Option<&&XUser>) -> Result<u32, String> {
    // Check if tweet already exists
    let exists = with_db(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM content WHERE platform = 'x' AND platform_id = ?1",
            params![&tweet.id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })?;

    if exists {
        return Ok(0);
    }

    // Get or create creator
    let creator_id = match author {
        Some(user) => get_or_create_creator(user)?,
        None => get_or_create_creator_by_id(&tweet.author_id)?,
    };

    // Insert content
    let content_id = uuid::Uuid::new_v4().to_string();

    // Parse engagement metrics
    let (likes, comments, shares, views) = match &tweet.public_metrics {
        Some(metrics) => (
            metrics.like_count,
            metrics.reply_count,
            metrics.retweet_count,
            metrics.impression_count,
        ),
        None => (0, 0, 0, None),
    };

    // Parse timestamp
    let published_at = tweet.created_at.clone().unwrap_or_default();

    with_db(|conn| {
        conn.execute(
            r#"INSERT INTO content (id, platform, platform_id, creator_id, content_type, text_content,
               engagement_likes, engagement_comments, engagement_shares, engagement_views, published_at)
               VALUES (?1, 'x', ?2, ?3, 'post', ?4, ?5, ?6, ?7, ?8, ?9)"#,
            params![
                &content_id,
                &tweet.id,
                &creator_id,
                &tweet.text,
                likes,
                comments,
                shares,
                views,
                &published_at
            ],
        )?;
        Ok(())
    })?;

    // Extract topics from tweet text
    let topics = extract_topics(&tweet.text)?;
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

    // Update co-occurrences if multiple topics found
    if topics.len() > 1 {
        let topic_ids: Vec<String> = topics.iter().map(|t| t.topic_id.clone()).collect();
        update_cooccurrences(&topic_ids)?;
    }

    Ok(topics_count)
}

/// Get or create a creator from X user data
fn get_or_create_creator(user: &XUser) -> Result<String, String> {
    // Check if creator exists
    let existing = with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT id FROM creators WHERE platform = 'x' AND platform_id = ?1")?;
        let mut rows = stmt.query(params![&user.id])?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            Ok(Some(id))
        } else {
            Ok(None)
        }
    })?;

    if let Some(id) = existing {
        // Update follower count if we have it
        if let Some(metrics) = &user.public_metrics {
            with_db(|conn| {
                conn.execute(
                    "UPDATE creators SET follower_count = ?1, display_name = ?2, updated_at = CURRENT_TIMESTAMP WHERE platform = 'x' AND platform_id = ?3",
                    params![metrics.followers_count, &user.name, &user.id],
                )?;
                Ok(())
            })?;
        }
        return Ok(id);
    }

    // Create new creator
    let creator_id = uuid::Uuid::new_v4().to_string();
    let follower_count = user
        .public_metrics
        .as_ref()
        .map(|m| m.followers_count)
        .unwrap_or(0);

    with_db(|conn| {
        conn.execute(
            "INSERT INTO creators (id, platform, platform_id, username, display_name, follower_count) VALUES (?1, 'x', ?2, ?3, ?4, ?5)",
            params![&creator_id, &user.id, &user.username, &user.name, follower_count],
        )?;
        Ok(())
    })?;

    Ok(creator_id)
}

/// Get or create a creator when we only have the author_id (no user expansion)
fn get_or_create_creator_by_id(author_id: &str) -> Result<String, String> {
    // Check if creator exists
    let existing = with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT id FROM creators WHERE platform = 'x' AND platform_id = ?1")?;
        let mut rows = stmt.query(params![author_id])?;
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

    // Create placeholder creator (we don't have username without expansion)
    let creator_id = uuid::Uuid::new_v4().to_string();
    with_db(|conn| {
        conn.execute(
            "INSERT INTO creators (id, platform, platform_id, username) VALUES (?1, 'x', ?2, ?2)",
            params![&creator_id, author_id],
        )?;
        Ok(())
    })?;

    Ok(creator_id)
}

/// Update topic co-occurrence counts
fn update_cooccurrences(topic_ids: &[String]) -> Result<(), String> {
    for i in 0..topic_ids.len() {
        for j in (i + 1)..topic_ids.len() {
            // Ensure consistent ordering (smaller id first)
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
