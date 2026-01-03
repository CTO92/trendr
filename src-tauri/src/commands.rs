use crate::database::with_db;
use crate::reddit;
use crate::x;
use crate::youtube;
use crate::settings::{self, AppSettings};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// Collection state
static COLLECTION_STATE: once_cell::sync::Lazy<Mutex<CollectionState>> =
    once_cell::sync::Lazy::new(|| Mutex::new(CollectionState::default()));

#[derive(Debug, Clone, Serialize, Default)]
struct CollectionState {
    is_running: bool,
    last_run_at: Option<String>,
    last_error: Option<String>,
}

// Response types
#[derive(Debug, Serialize)]
pub struct Topic {
    id: String,
    name: String,
    slug: String,
    #[serde(rename = "parentTopicId")]
    parent_topic_id: Option<String>,
    aliases: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "contentCount")]
    content_count: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct Content {
    id: String,
    platform: String,
    #[serde(rename = "platformId")]
    platform_id: String,
    #[serde(rename = "creatorId")]
    creator_id: Option<String>,
    #[serde(rename = "contentType")]
    content_type: String,
    #[serde(rename = "textContent")]
    text_content: Option<String>,
    #[serde(rename = "engagementLikes")]
    engagement_likes: i64,
    #[serde(rename = "engagementComments")]
    engagement_comments: i64,
    #[serde(rename = "publishedAt")]
    published_at: Option<String>,
    #[serde(rename = "collectedAt")]
    collected_at: String,
}

#[derive(Debug, Serialize)]
pub struct Alert {
    id: String,
    #[serde(rename = "alertType")]
    alert_type: String,
    #[serde(rename = "topicId")]
    topic_id: Option<String>,
    message: String,
    read: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DashboardStats {
    #[serde(rename = "totalContent")]
    total_content: i64,
    #[serde(rename = "totalTopics")]
    total_topics: i64,
    #[serde(rename = "totalCreators")]
    total_creators: i64,
    #[serde(rename = "contentLast7Days")]
    content_last_7_days: i64,
    #[serde(rename = "topTopics")]
    top_topics: Vec<TopicCount>,
}

#[derive(Debug, Serialize)]
pub struct TopicCount {
    name: String,
    count: i64,
}

#[derive(Debug, Serialize)]
pub struct CollectionStatus {
    #[serde(rename = "isRunning")]
    is_running: bool,
    #[serde(rename = "lastRunAt")]
    last_run_at: Option<String>,
    #[serde(rename = "lastError")]
    last_error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CollectionResult {
    #[serde(rename = "postsCollected")]
    posts_collected: u32,
    #[serde(rename = "topicsExtracted")]
    topics_extracted: u32,
}

// Settings commands
#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    Ok(settings::load_settings())
}

#[tauri::command]
pub fn save_settings(settings_data: AppSettings) -> Result<(), String> {
    settings::save_settings(&settings_data)
}

#[tauri::command]
pub async fn test_reddit_connection() -> Result<bool, String> {
    let settings = settings::load_settings();
    match settings.reddit {
        Some(credentials) => reddit::test_connection(&credentials).await,
        None => Err("Reddit credentials not configured".to_string()),
    }
}

#[tauri::command]
pub async fn test_x_connection(bearer_token: String) -> Result<bool, String> {
    x::test_connection(&bearer_token).await
}

#[tauri::command]
pub async fn run_x_collection() -> Result<CollectionResult, String> {
    let settings = settings::load_settings();

    let credentials = settings.x.ok_or("X credentials not configured")?;
    let queries = settings.x_queries;

    if queries.is_empty() {
        return Err("No X search queries configured. Add some topics to search for.".to_string());
    }

    // Check if already running
    {
        let state = COLLECTION_STATE.lock().map_err(|e| e.to_string())?;
        if state.is_running {
            return Err("Collection already in progress".to_string());
        }
    }

    let result = x::collect(&credentials, &queries).await;

    result.map(|r| CollectionResult {
        posts_collected: r.posts_collected,
        topics_extracted: r.topics_extracted,
    })
}

#[tauri::command]
pub async fn test_youtube_connection(api_key: String) -> Result<bool, String> {
    youtube::test_connection(&api_key).await
}

#[tauri::command]
pub async fn run_youtube_collection() -> Result<CollectionResult, String> {
    let settings = settings::load_settings();

    let credentials = settings.youtube.ok_or("YouTube credentials not configured")?;
    let queries = settings.youtube_queries;

    if queries.is_empty() {
        return Err("No YouTube search queries configured. Add some topics to search for.".to_string());
    }

    // Check if already running
    {
        let state = COLLECTION_STATE.lock().map_err(|e| e.to_string())?;
        if state.is_running {
            return Err("Collection already in progress".to_string());
        }
    }

    let result = youtube::collect(&credentials, &queries).await;

    result.map(|r| CollectionResult {
        posts_collected: r.posts_collected,
        topics_extracted: r.topics_extracted,
    })
}

// Collection commands
#[tauri::command]
pub async fn run_collection() -> Result<CollectionResult, String> {
    let settings = settings::load_settings();

    let credentials = settings
        .reddit
        .ok_or("Reddit credentials not configured")?;

    // Update state
    {
        let mut state = COLLECTION_STATE.lock().map_err(|e| e.to_string())?;
        if state.is_running {
            return Err("Collection already in progress".to_string());
        }
        state.is_running = true;
        state.last_error = None;
    }

    let result = reddit::collect(&credentials, &settings.subreddits).await;

    // Update state after completion
    {
        let mut state = COLLECTION_STATE.lock().map_err(|e| e.to_string())?;
        state.is_running = false;
        state.last_run_at = Some(chrono::Utc::now().to_rfc3339());

        match &result {
            Ok(_) => state.last_error = None,
            Err(e) => state.last_error = Some(e.clone()),
        }
    }

    result.map(|r| CollectionResult {
        posts_collected: r.posts_collected,
        topics_extracted: r.topics_extracted,
    })
}

#[tauri::command]
pub fn get_collection_status() -> Result<CollectionStatus, String> {
    let state = COLLECTION_STATE.lock().map_err(|e| e.to_string())?;
    Ok(CollectionStatus {
        is_running: state.is_running,
        last_run_at: state.last_run_at.clone(),
        last_error: state.last_error.clone(),
    })
}

// Topics commands
#[tauri::command]
pub fn get_topics(limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Topic>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT t.id, t.name, t.slug, t.parent_topic_id, t.aliases, t.created_at,
               COUNT(ct.content_id) as content_count
               FROM topics t
               LEFT JOIN content_topics ct ON t.id = ct.topic_id
               GROUP BY t.id
               ORDER BY content_count DESC
               LIMIT ?1 OFFSET ?2"#,
        )?;

        let rows = stmt.query_map(params![limit, offset], |row| {
            let aliases_json: Option<String> = row.get(4)?;
            let aliases: Vec<String> = aliases_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            Ok(Topic {
                id: row.get(0)?,
                name: row.get(1)?,
                slug: row.get(2)?,
                parent_topic_id: row.get(3)?,
                aliases,
                created_at: row.get::<_, String>(5)?,
                content_count: row.get(6)?,
            })
        })?;

        let mut topics = Vec::new();
        for row in rows {
            topics.push(row?);
        }
        Ok(topics)
    })
}

#[tauri::command]
pub fn get_topic_details(topic_id: String) -> Result<Topic, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT t.id, t.name, t.slug, t.parent_topic_id, t.aliases, t.created_at,
               (SELECT COUNT(*) FROM content_topics WHERE topic_id = t.id) as content_count
               FROM topics t WHERE t.id = ?1"#,
        )?;

        stmt.query_row(params![&topic_id], |row| {
            let aliases_json: Option<String> = row.get(4)?;
            let aliases: Vec<String> = aliases_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            Ok(Topic {
                id: row.get(0)?,
                name: row.get(1)?,
                slug: row.get(2)?,
                parent_topic_id: row.get(3)?,
                aliases,
                created_at: row.get(5)?,
                content_count: row.get(6)?,
            })
        })
    })
}

#[tauri::command]
pub fn search_topics(query: String) -> Result<Vec<Topic>, String> {
    let search_term = format!("%{}%", query);

    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT id, name, slug, parent_topic_id, aliases, created_at
               FROM topics
               WHERE name LIKE ?1 OR slug LIKE ?1
               LIMIT 20"#,
        )?;

        let rows = stmt.query_map(params![&search_term], |row| {
            let aliases_json: Option<String> = row.get(4)?;
            let aliases: Vec<String> = aliases_json
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();

            Ok(Topic {
                id: row.get(0)?,
                name: row.get(1)?,
                slug: row.get(2)?,
                parent_topic_id: row.get(3)?,
                aliases,
                created_at: row.get(5)?,
                content_count: None,
            })
        })?;

        let mut topics = Vec::new();
        for row in rows {
            topics.push(row?);
        }
        Ok(topics)
    })
}

// Content commands
#[tauri::command]
pub fn get_content(limit: Option<i64>, offset: Option<i64>) -> Result<Vec<Content>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT id, platform, platform_id, creator_id, content_type, text_content,
               engagement_likes, engagement_comments, published_at, collected_at
               FROM content
               ORDER BY collected_at DESC
               LIMIT ?1 OFFSET ?2"#,
        )?;

        let rows = stmt.query_map(params![limit, offset], |row| {
            Ok(Content {
                id: row.get(0)?,
                platform: row.get(1)?,
                platform_id: row.get(2)?,
                creator_id: row.get(3)?,
                content_type: row.get(4)?,
                text_content: row.get(5)?,
                engagement_likes: row.get(6)?,
                engagement_comments: row.get(7)?,
                published_at: row.get(8)?,
                collected_at: row.get(9)?,
            })
        })?;

        let mut content = Vec::new();
        for row in rows {
            content.push(row?);
        }
        Ok(content)
    })
}

#[tauri::command]
pub fn get_content_by_topic(topic_id: String, limit: Option<i64>) -> Result<Vec<Content>, String> {
    let limit = limit.unwrap_or(20);

    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT c.id, c.platform, c.platform_id, c.creator_id, c.content_type, c.text_content,
               c.engagement_likes, c.engagement_comments, c.published_at, c.collected_at
               FROM content c
               JOIN content_topics ct ON c.id = ct.content_id
               WHERE ct.topic_id = ?1
               ORDER BY c.collected_at DESC
               LIMIT ?2"#,
        )?;

        let rows = stmt.query_map(params![&topic_id, limit], |row| {
            Ok(Content {
                id: row.get(0)?,
                platform: row.get(1)?,
                platform_id: row.get(2)?,
                creator_id: row.get(3)?,
                content_type: row.get(4)?,
                text_content: row.get(5)?,
                engagement_likes: row.get(6)?,
                engagement_comments: row.get(7)?,
                published_at: row.get(8)?,
                collected_at: row.get(9)?,
            })
        })?;

        let mut content = Vec::new();
        for row in rows {
            content.push(row?);
        }
        Ok(content)
    })
}

// Dashboard commands
#[tauri::command]
pub fn get_dashboard_stats() -> Result<DashboardStats, String> {
    with_db(|conn| {
        let total_content: i64 =
            conn.query_row("SELECT COUNT(*) FROM content", [], |row| row.get(0))?;

        let total_topics: i64 =
            conn.query_row("SELECT COUNT(*) FROM topics", [], |row| row.get(0))?;

        let total_creators: i64 =
            conn.query_row("SELECT COUNT(*) FROM creators", [], |row| row.get(0))?;

        let content_last_7_days: i64 = conn.query_row(
            "SELECT COUNT(*) FROM content WHERE collected_at > datetime('now', '-7 days')",
            [],
            |row| row.get(0),
        )?;

        let mut stmt = conn.prepare(
            r#"SELECT t.name, COUNT(ct.content_id) as count
               FROM topics t
               JOIN content_topics ct ON t.id = ct.topic_id
               GROUP BY t.id
               ORDER BY count DESC
               LIMIT 10"#,
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(TopicCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })?;

        let mut top_topics = Vec::new();
        for row in rows {
            top_topics.push(row?);
        }

        Ok(DashboardStats {
            total_content,
            total_topics,
            total_creators,
            content_last_7_days,
            top_topics,
        })
    })
}

// Alerts commands
#[tauri::command]
pub fn get_alerts(limit: Option<i64>) -> Result<Vec<Alert>, String> {
    let limit = limit.unwrap_or(50);

    with_db(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT id, alert_type, topic_id, message, read, created_at
               FROM alerts
               ORDER BY created_at DESC
               LIMIT ?1"#,
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            let read_int: i64 = row.get(4)?;
            Ok(Alert {
                id: row.get(0)?,
                alert_type: row.get(1)?,
                topic_id: row.get(2)?,
                message: row.get(3)?,
                read: read_int != 0,
                created_at: row.get(5)?,
            })
        })?;

        let mut alerts = Vec::new();
        for row in rows {
            alerts.push(row?);
        }
        Ok(alerts)
    })
}

#[tauri::command]
pub fn mark_alert_read(alert_id: String) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE alerts SET read = 1 WHERE id = ?1",
            params![&alert_id],
        )?;
        Ok(())
    })
}
