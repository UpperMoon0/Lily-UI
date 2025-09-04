use crate::domain::interfaces::FileStorageTrait;
use crate::domain::models::{AppSettings, ChatMessage, LogEntry, TTSParameters};
use serde_json;
use std::fs;
use uuid::Uuid;
use chrono::Utc;

pub struct FileStorage;

impl FileStorageTrait for FileStorage {
    fn save_settings(settings: AppSettings) -> Result<(), String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Create directories if they don't exist
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
        
        // Write settings to file
        let settings_path = app_data_dir.join("settings.json");
        let json = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        
        fs::write(&settings_path, json)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;
        
        Ok(())
    }

    fn load_settings() -> Result<AppSettings, String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Read settings from file
        let settings_path = app_data_dir.join("settings.json");
        
        if !settings_path.exists() {
            // Return default settings if file doesn't exist
            return Ok(AppSettings {
                tts_params: TTSParameters {
                    speaker: 0,
                    sample_rate: 24000,
                    model: "edge".to_string(),
                    lang: "en-US".to_string(),
                },
                tts_enabled: false,
            });
        }
        
        let json = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;
        
        let settings: AppSettings = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;
        
        Ok(settings)
    }

    fn save_chat_history(messages: Vec<ChatMessage>) -> Result<(), String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Create directories if they don't exist
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
        
        // Write chat history to file
        let history_path = app_data_dir.join("chat_history.json");
        let json = serde_json::to_string_pretty(&messages)
            .map_err(|e| format!("Failed to serialize chat history: {}", e))?;
        
        fs::write(&history_path, json)
            .map_err(|e| format!("Failed to write chat history file: {}", e))?;
        
        Ok(())
    }

    fn load_chat_history() -> Result<Vec<ChatMessage>, String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Read chat history from file
        let history_path = app_data_dir.join("chat_history.json");
        
        if !history_path.exists() {
            // Return empty vector if file doesn't exist
            return Ok(Vec::new());
        }
        
        let json = fs::read_to_string(&history_path)
            .map_err(|e| format!("Failed to read chat history file: {}", e))?;
        
        let messages: Vec<ChatMessage> = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse chat history: {}", e))?;
        
        Ok(messages)
    }

    fn clear_chat_history() -> Result<(), String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Remove chat history file
        let history_path = app_data_dir.join("chat_history.json");
        
        if history_path.exists() {
            fs::remove_file(&history_path)
                .map_err(|e| format!("Failed to remove chat history file: {}", e))?;
        }
        
        Ok(())
    }

    fn add_log_entry(type_: String, message: String, details: Option<serde_json::Value>) -> Result<(), String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Create directories if they don't exist
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create directories: {}", e))?;
        
        // Read existing logs
        let logs_path = app_data_dir.join("logs.json");
        let mut logs: Vec<LogEntry> = if logs_path.exists() {
            let json = fs::read_to_string(&logs_path)
                .map_err(|e| format!("Failed to read logs file: {}", e))?;
            serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse logs: {}", e))?
        } else {
            Vec::new()
        };
        
        // Add new log entry
        let new_log = LogEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            type_,
            message,
            details,
        };
        
        logs.push(new_log);
        
        // Keep only the last 1000 logs to prevent file from growing too large
        if logs.len() > 1000 {
            logs.drain(0..logs.len() - 1000);
        }
        
        // Write logs back to file
        let json = serde_json::to_string_pretty(&logs)
            .map_err(|e| format!("Failed to serialize logs: {}", e))?;
        
        fs::write(&logs_path, json)
            .map_err(|e| format!("Failed to write logs file: {}", e))?;
        
        Ok(())
    }

    fn get_logs() -> Result<Vec<LogEntry>, String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Read logs from file
        let logs_path = app_data_dir.join("logs.json");
        
        if !logs_path.exists() {
            // Return empty vector if file doesn't exist
            return Ok(Vec::new());
        }
        
        let json = fs::read_to_string(&logs_path)
            .map_err(|e| format!("Failed to read logs file: {}", e))?;
        
        let logs: Vec<LogEntry> = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse logs: {}", e))?;
        
        Ok(logs)
    }

    fn clear_logs() -> Result<(), String> {
        // Get the app data directory
        let app_data_dir = dirs::data_dir()
            .ok_or("Could not determine app data directory")?
            .join("NsTut")
            .join("LilyUI");
        
        // Remove logs file
        let logs_path = app_data_dir.join("logs.json");
        
        if logs_path.exists() {
            fs::remove_file(&logs_path)
                .map_err(|e| format!("Failed to remove logs file: {}", e))?;
        }
        
        Ok(())
    }
}