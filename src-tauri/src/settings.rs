use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use directories::ProjectDirs;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RedditCredentials {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "clientSecret")]
    pub client_secret: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub reddit: Option<RedditCredentials>,
    #[serde(rename = "collectionIntervalMinutes")]
    pub collection_interval_minutes: u32,
    pub subreddits: Vec<String>,
    #[serde(rename = "searchQueries")]
    pub search_queries: Vec<String>,
}

impl AppSettings {
    fn default_settings() -> Self {
        AppSettings {
            reddit: None,
            collection_interval_minutes: 30,
            subreddits: vec![
                "cryptocurrency".to_string(),
                "wallstreetbets".to_string(),
                "stocks".to_string(),
                "sidehustle".to_string(),
                "entrepreneur".to_string(),
            ],
            search_queries: vec![],
        }
    }
}

fn get_settings_path() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "trendr", "Trendr") {
        let config_dir = proj_dirs.config_dir();
        fs::create_dir_all(config_dir).ok();
        config_dir.join("settings.json")
    } else {
        PathBuf::from("settings.json")
    }
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                serde_json::from_str(&content).unwrap_or_else(|_| AppSettings::default_settings())
            }
            Err(_) => AppSettings::default_settings(),
        }
    } else {
        AppSettings::default_settings()
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}
