use crate::database::with_db;
use regex::Regex;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedTopic {
    pub topic_id: String,
    pub topic_name: String,
    pub confidence: f64,
    pub mentions: u32,
}

#[derive(Debug)]
struct TopicData {
    id: String,
    name: String,
    keywords: Vec<String>,
}

pub fn extract_topics(text: &str) -> Result<Vec<ExtractedTopic>, String> {
    let topics = load_topics()?;
    let normalized_text = text.to_lowercase();
    let mut extracted: Vec<ExtractedTopic> = Vec::new();

    for topic in topics {
        let mut match_count = 0u32;

        for keyword in &topic.keywords {
            let pattern = format!(r"\b{}\b", regex::escape(keyword));
            if let Ok(regex) = Regex::new(&pattern) {
                match_count += regex.find_iter(&normalized_text).count() as u32;
            }
        }

        if match_count > 0 {
            let confidence = (match_count as f64 * 0.2).min(1.0);

            extracted.push(ExtractedTopic {
                topic_id: topic.id,
                topic_name: topic.name,
                confidence,
                mentions: match_count,
            });
        }
    }

    // Sort by confidence descending and take top 5
    extracted.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
    extracted.truncate(5);

    Ok(extracted)
}

fn load_topics() -> Result<Vec<TopicData>, String> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, name, keywords FROM topics")?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let keywords_json: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
            let keywords: Vec<String> = serde_json::from_str(&keywords_json).unwrap_or_default();

            Ok(TopicData { id, name, keywords })
        })?;

        let mut topics = Vec::new();
        for row in rows {
            topics.push(row?);
        }
        Ok(topics)
    })
}
