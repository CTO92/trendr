use rusqlite::{Connection, params};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::AppHandle;
use directories::ProjectDirs;

pub static DATABASE: once_cell::sync::Lazy<Mutex<Option<Connection>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

fn get_db_path() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "trendr", "Trendr") {
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir).ok();
        data_dir.join("trendr.db")
    } else {
        PathBuf::from("trendr.db")
    }
}

pub fn init_database(_app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    create_tables(&conn)?;
    seed_default_topics(&conn)?;

    let mut db = DATABASE.lock().unwrap();
    *db = Some(conn);

    log::info!("Database initialized at {:?}", db_path);
    Ok(())
}

pub fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, rusqlite::Error>,
{
    let db = DATABASE.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Database not initialized")?;
    f(conn).map_err(|e| e.to_string())
}

fn create_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS creators (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            platform_id TEXT NOT NULL,
            username TEXT NOT NULL,
            display_name TEXT,
            follower_count INTEGER,
            primary_topics TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, platform_id)
        );

        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            parent_topic_id TEXT REFERENCES topics(id),
            aliases TEXT,
            keywords TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS topic_motivations (
            topic_id TEXT REFERENCES topics(id),
            motivation TEXT NOT NULL,
            score REAL NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (topic_id, motivation)
        );

        CREATE TABLE IF NOT EXISTS content (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            platform_id TEXT NOT NULL,
            creator_id TEXT REFERENCES creators(id),
            content_type TEXT NOT NULL,
            text_content TEXT,
            engagement_likes INTEGER DEFAULT 0,
            engagement_comments INTEGER DEFAULT 0,
            engagement_shares INTEGER DEFAULT 0,
            engagement_views INTEGER,
            published_at DATETIME,
            collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(platform, platform_id)
        );

        CREATE TABLE IF NOT EXISTS content_topics (
            content_id TEXT REFERENCES content(id) ON DELETE CASCADE,
            topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
            confidence REAL NOT NULL,
            PRIMARY KEY (content_id, topic_id)
        );

        CREATE TABLE IF NOT EXISTS topic_cooccurrences (
            topic_a_id TEXT REFERENCES topics(id),
            topic_b_id TEXT REFERENCES topics(id),
            frequency INTEGER DEFAULT 1,
            last_seen DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (topic_a_id, topic_b_id)
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            alert_type TEXT NOT NULL,
            topic_id TEXT REFERENCES topics(id),
            message TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_content_platform ON content(platform, published_at);
        CREATE INDEX IF NOT EXISTS idx_content_creator ON content(creator_id, published_at);
        CREATE INDEX IF NOT EXISTS idx_content_collected ON content(collected_at);
        CREATE INDEX IF NOT EXISTS idx_content_topics_topic ON content_topics(topic_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
    "#)?;

    Ok(())
}

fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn seed_default_topics(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM topics", [], |row| row.get(0))?;

    if count == 0 {
        let topics: Vec<(&str, Vec<&str>)> = vec![
            ("Cryptocurrency", vec!["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "defi", "nft"]),
            ("Stocks & Investing", vec!["stock", "invest", "dividend", "portfolio", "etf", "nasdaq", "trading"]),
            ("Real Estate", vec!["real estate", "property", "mortgage", "rental", "landlord", "housing", "reit"]),
            ("Side Hustles", vec!["side hustle", "passive income", "freelance", "gig", "dropshipping", "affiliate"]),
            ("Artificial Intelligence", vec!["ai", "artificial intelligence", "machine learning", "chatgpt", "llm", "openai"]),
            ("Gaming", vec!["gaming", "gamer", "esports", "twitch", "steam", "playstation", "xbox"]),
            ("Fitness & Health", vec!["fitness", "gym", "workout", "health", "nutrition", "diet", "protein"]),
            ("Personal Finance", vec!["budget", "savings", "debt", "fire", "retire", "financial", "credit"]),
            ("Entrepreneurship", vec!["startup", "entrepreneur", "business", "founder", "saas", "bootstrap"]),
            ("Content Creation", vec!["youtube", "content creator", "influencer", "subscriber", "viral", "monetization"]),
        ];

        let topic_count = topics.len();
        for (name, keywords) in topics {
            let id = uuid::Uuid::new_v4().to_string();
            let slug = slugify(name);
            let keywords_json = serde_json::to_string(&keywords).unwrap_or_default();

            conn.execute(
                "INSERT INTO topics (id, name, slug, keywords) VALUES (?1, ?2, ?3, ?4)",
                params![id, name, slug, keywords_json],
            )?;
        }

        log::info!("Seeded {} default topics", topic_count);
    }

    Ok(())
}
