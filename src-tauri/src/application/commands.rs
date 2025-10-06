use crate::domain::interfaces::{FileStorageTrait, WebSocketTrait};
use crate::domain::models::{AppSettings, AppState, ChatMessage, LogEntry, TTSParameters, WebSocketStatus};
use crate::infrastructure::file_storage::FileStorage;
use crate::infrastructure::websocket::WebSocketService;
use reqwest;
use serde_json;
use tauri::{AppHandle, State};

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
    log::debug!("Audio data detected, size: {}", audio_data.len());
    log::info!("send_websocket_audio command received - Audio data size: {} bytes", audio_data.len());
    
    let result = WebSocketService::send_binary_data(audio_data, app_handle).await;
    
    match &result {
        Ok(_) => log::info!("send_websocket_audio command completed successfully"),
        Err(e) => log::error!("send_websocket_audio command failed: {}", e),
    }
    
    result
}

#[tauri::command]
pub async fn get_websocket_status(app_handle: AppHandle) -> Result<WebSocketStatus, String> {
    WebSocketService::get_status(app_handle).await
}

#[tauri::command]
pub async fn start_audio_recording(app_handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Starting audio recording");
    state.audio_service.set_app_handle(app_handle);
    state.audio_service.start_recording().await
}

#[tauri::command]
pub async fn stop_audio_recording(state: State<'_, AppState>) -> Result<(), String> {
    log::info!("Stopping audio recording");
    state.audio_service.stop_recording().await
}

#[tauri::command]
pub async fn get_audio_level(_state: State<'_, AppState>) -> Result<f32, String> {
    // This would return the current RMS level, but for now we'll return 0.0
    // In a real implementation, we'd want to get the latest value from the audio service
    Ok(0.0)
}

#[tauri::command]
pub async fn get_audio_devices(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    log::info!("Getting available audio devices");
    state.audio_service.get_available_devices()
}