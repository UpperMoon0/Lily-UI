// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize, Clone)]
struct TTSParameters {
    speaker: i32,
    sample_rate: i32,
    model: String,
    lang: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
    timestamp: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct AppSettings {
    tts_params: TTSParameters,
    tts_enabled: bool,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
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

#[tauri::command]
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, save_settings, load_settings])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
