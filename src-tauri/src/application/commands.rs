use crate::domain::interfaces::{FileStorageTrait, WebSocketTrait};
use crate::domain::models::{AppSettings, ChatMessage, LogEntry, TTSParameters};
use crate::infrastructure::file_storage::FileStorage;
use crate::infrastructure::websocket::WebSocketService;
use reqwest;
use serde_json;
use tauri::AppHandle;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    FileStorage::save_settings(settings)
}

#[tauri::command]
pub fn load_settings() -> Result<AppSettings, String> {
    FileStorage::load_settings()
}

#[tauri::command]
pub async fn connect_websocket(app_handle: AppHandle) -> Result<(), String> {
    WebSocketService::connect(app_handle).await
}

#[tauri::command]
pub async fn disconnect_websocket(app_handle: AppHandle) -> Result<(), String> {
    WebSocketService::disconnect(app_handle).await
}

#[tauri::command]
pub async fn send_websocket_message(message: String, app_handle: AppHandle) -> Result<(), String> {
    WebSocketService::send_message(message, app_handle).await
}

#[tauri::command]
pub fn save_chat_history(messages: Vec<ChatMessage>) -> Result<(), String> {
    FileStorage::save_chat_history(messages)
}

#[tauri::command]
pub fn load_chat_history() -> Result<Vec<ChatMessage>, String> {
    FileStorage::load_chat_history()
}

#[tauri::command]
pub fn clear_chat_history() -> Result<(), String> {
    FileStorage::clear_chat_history()
}

#[tauri::command]
pub fn add_log_entry(type_: String, message: String, details: Option<serde_json::Value>) -> Result<(), String> {
    FileStorage::add_log_entry(type_, message, details)
}

#[tauri::command]
pub fn get_logs() -> Result<Vec<LogEntry>, String> {
    FileStorage::get_logs()
}

#[tauri::command]
pub fn clear_logs() -> Result<(), String> {
    FileStorage::clear_logs()
}

#[tauri::command]
pub async fn send_chat_message(message: String, tts_enabled: bool, tts_params: Option<TTSParameters>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut request_body = serde_json::json!({
        "message": message,
        "user_id": "default_user"
    });

    if tts_enabled {
        if let Some(params) = tts_params {
            request_body["tts"] = serde_json::json!({
                "enabled": true,
                "params": params
            });
        } else {
            request_body["tts"] = serde_json::json!({
                "enabled": true,
                "params": {
                    "speaker": 0,
                    "sample_rate": 24000,
                    "model": "edge",
                    "lang": "en-US"
                }
            });
        }
    }

    let response = client.post("http://localhost:8000/chat")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error! status: {}", response.status()));
    }

    let data: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data)
}

#[tauri::command]
pub async fn get_conversation_history() -> Result<Vec<ChatMessage>, String> {
    let client = reqwest::Client::new();
    let response = client.get("http://localhost:8000/conversation/default_user")
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error! status: {}", response.status()));
    }

    let data: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let messages = data["conversation"].as_array()
        .ok_or("Invalid response format: missing conversation array")?
        .iter()
        .map(|msg| {
            Ok(ChatMessage {
                role: msg["role"].as_str().unwrap_or("assistant").to_string(),
                content: msg["content"].as_str().unwrap_or("").to_string(),
                timestamp: msg["timestamp"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect::<Result<Vec<ChatMessage>, String>>()?;

    Ok(messages)
}

#[tauri::command]
pub async fn clear_conversation() -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client.delete("http://localhost:8000/conversation/default_user")
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error! status: {}", response.status()));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_monitoring_data() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let response = client.get("http://localhost:8000/monitoring")
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error! status: {}", response.status()));
    }

    let data: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(data)
}

#[tauri::command]
pub async fn send_websocket_audio(audio_data: Vec<u8>, app_handle: AppHandle) -> Result<(), String> {
    WebSocketService::send_binary_data(audio_data, app_handle).await
}