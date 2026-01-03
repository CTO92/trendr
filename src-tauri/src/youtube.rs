use crate::database::with_db;
use crate::settings::YouTubeCredentials;
use crate::topics::extract_topics;
use rusqlite::params;
use serde::Deserialize;

const BASE_URL: &str = "https://www.googleapis.com/youtube/v3";
const USER_AGENT: &str = "Trendr/1.0.0";

// Response structs for YouTube API v3
#[derive(Debug, Deserialize)]
struct SearchResponse {
    items: Option<Vec<SearchItem>>,
    #[serde(rename = "nextPageToken")]
    #[allow(dead_code)]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchItem {
    id: SearchItemId,
    #[allow(dead_code)]
    snippet: Option<SearchSnippet>,
}

#[derive(Debug, Deserialize)]
struct SearchItemId {
    #[serde(rename = "videoId")]
    video_id: Option<String>,
    #[serde(rename = "channelId")]
    #[allow(dead_code)]
    channel_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchSnippet {
    #[allow(dead_code)]
    title: Option<String>,
    #[allow(dead_code)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VideoResponse {
    items: Option<Vec<VideoItem>>,
}

#[derive(Debug, Deserialize)]
struct VideoItem {
    id: String,
    snippet: Option<VideoSnippet>,
    statistics: Option<Statistics>,
}

#[derive(Debug, Deserialize)]
struct VideoSnippet {
    title: String,
    description: Option<String>,
    #[serde(rename = "channelId")]
    channel_id: String,
    #[serde(rename = "channelTitle")]
    channel_title: String,
    #[serde(rename = "publishedAt")]
    published_at: String,
    #[allow(dead_code)]
    tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct Statistics {
    #[serde(rename = "viewCount")]
    view_count: Option<String>,
    #[serde(rename = "likeCount")]
    like_count: Option<String>,
    #[serde(rename = "commentCount")]
    comment_count: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CollectionResult {
    pub posts_collected: u32,
    pub topics_extracted: u32,
}

/// Test connection to YouTube API using the API key
pub async fn test_connection(api_key: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();

    // Simple test: search for a common term with minimal quota usage (100 units)
    let url = format!(
        "{}/search?part=snippet&q=test&maxResults=1&type=video&key={}",
        BASE_URL, api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to YouTube API: {}", e))?;

    if response.status().is_success() {
        Ok(true)
    } else if response.status() == 400 {
        Err("Invalid API key format".to_string())
    } else if response.status() == 403 {
        // Try to parse error for more details
        let error_text = response.text().await.unwrap_or_default();
        if error_text.contains("quotaExceeded") {
            Err("YouTube API quota exceeded for today".to_string())
        } else if error_text.contains("API key not valid") {
            Err("Invalid API key. Please check your credentials.".to_string())
        } else {
            Err("API key invalid or YouTube Data API v3 not enabled in Google Cloud Console".to_string())
        }
    } else {
        Err(format!("YouTube API error: {}", response.status()))
    }
}

/// Collect videos from YouTube based on search queries
pub async fn collect(
    credentials: &YouTubeCredentials,
    queries: &[String],
) -> Result<CollectionResult, String> {
    let client = reqwest::Client::new();

    let mut total_posts = 0u32;
    let mut total_topics = 0u32;

    for query in queries {
        log::info!("Searching YouTube for: {}", query);

        match search_videos(&client, &credentials.api_key, query).await {
            Ok(video_ids) => {
                if video_ids.is_empty() {
                    log::info!("No videos found for query: {}", query);
                    continue;
                }

                log::info!("Found {} videos for query: {}", video_ids.len(), query);

                // Batch fetch video details (up to 50 at a time for efficiency)
                for chunk in video_ids.chunks(50) {
                    match get_video_details(&client, &credentials.api_key, chunk).await {
                        Ok(videos) => {
                            for video in videos {
                                match process_video(&video).await {
                                    Ok(topics_found) => {
                                        total_posts += 1;
                                        total_topics += topics_found;
                                    }
                                    Err(e) => {
                                        log::warn!("Failed to process video {}: {}", video.id, e);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to get video details: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to search YouTube for '{}': {}", query, e);
            }
        }

        // Small delay between queries to be respectful
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    }

    Ok(CollectionResult {
        posts_collected: total_posts,
        topics_extracted: total_topics,
    })
}

/// Search for videos and return video IDs
async fn search_videos(
    client: &reqwest::Client,
    api_key: &str,
    query: &str,
) -> Result<Vec<String>, String> {
    let url = format!(
        "{}/search?part=snippet&q={}&maxResults=25&type=video&order=relevance&key={}",
        BASE_URL,
        urlencoding::encode(query),
        api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();

    if status.is_success() {
        let search_response: SearchResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse search response: {}", e))?;

        let video_ids = search_response
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| item.id.video_id)
            .collect();

        Ok(video_ids)
    } else if status == 403 {
        Err("YouTube API quota exceeded or access forbidden".to_string())
    } else {
        Err(format!("YouTube API error: {}", status))
    }
}

/// Get full video details for a batch of video IDs (up to 50)
async fn get_video_details(
    client: &reqwest::Client,
    api_key: &str,
    video_ids: &[String],
) -> Result<Vec<VideoItem>, String> {
    let ids = video_ids.join(",");
    let url = format!(
        "{}/videos?part=snippet,statistics&id={}&key={}",
        BASE_URL, ids, api_key
    );

    let response = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("YouTube API error: {}", response.status()));
    }

    let video_response: VideoResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse video response: {}", e))?;

    Ok(video_response.items.unwrap_or_default())
}

/// Process a video and store in database
async fn process_video(video: &VideoItem) -> Result<u32, String> {
    // Check if video already exists
    let exists = with_db(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM content WHERE platform = 'youtube' AND platform_id = ?1",
            params![&video.id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })?;

    if exists {
        return Ok(0);
    }

    let snippet = video.snippet.as_ref().ok_or("Missing video snippet")?;

    // Get or create creator (channel)
    let creator_id = get_or_create_creator(&snippet.channel_id, &snippet.channel_title)?;

    // Build text content from title + description
    let text_content = format!(
        "{}\n\n{}",
        snippet.title,
        snippet.description.as_deref().unwrap_or("")
    )
    .trim()
    .to_string();

    // Parse engagement metrics (YouTube returns these as strings)
    let (views, likes, comments) = match &video.statistics {
        Some(stats) => (
            stats
                .view_count
                .as_ref()
                .and_then(|v| v.parse::<i64>().ok()),
            stats
                .like_count
                .as_ref()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0),
            stats
                .comment_count
                .as_ref()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0),
        ),
        None => (None, 0, 0),
    };

    // Insert content
    let content_id = uuid::Uuid::new_v4().to_string();

    with_db(|conn| {
        conn.execute(
            r#"INSERT INTO content (id, platform, platform_id, creator_id, content_type, text_content,
               engagement_likes, engagement_comments, engagement_views, published_at)
               VALUES (?1, 'youtube', ?2, ?3, 'video', ?4, ?5, ?6, ?7, ?8)"#,
            params![
                &content_id,
                &video.id,
                &creator_id,
                &text_content,
                likes,
                comments,
                views,
                &snippet.published_at
            ],
        )?;
        Ok(())
    })?;

    // Extract topics from video content
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

    // Update co-occurrences if multiple topics found
    if topics.len() > 1 {
        let topic_ids: Vec<String> = topics.iter().map(|t| t.topic_id.clone()).collect();
        update_cooccurrences(&topic_ids)?;
    }

    Ok(topics_count)
}

/// Get or create a creator (YouTube channel)
fn get_or_create_creator(channel_id: &str, channel_title: &str) -> Result<String, String> {
    // Check if creator exists
    let existing = with_db(|conn| {
        let mut stmt =
            conn.prepare("SELECT id FROM creators WHERE platform = 'youtube' AND platform_id = ?1")?;
        let mut rows = stmt.query(params![channel_id])?;
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
            "INSERT INTO creators (id, platform, platform_id, username, display_name) VALUES (?1, 'youtube', ?2, ?2, ?3)",
            params![&creator_id, channel_id, channel_title],
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
