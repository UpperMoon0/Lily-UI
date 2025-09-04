// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Manager, Emitter};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use futures_util::{SinkExt, StreamExt};
use url::Url;
use log::{info, error};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use reqwest;

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

#[derive(Serialize, Deserialize, Clone)]
struct LogEntry {
    id: String,
    timestamp: DateTime<Utc>,
    type_: String,
    message: String,
    details: Option<serde_json::Value>,
}

// WebSocket state
struct WebSocketState {
    stream: Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
    is_connected: bool,
    is_registered: bool,
    app_handle: Option<tauri::AppHandle>,
}

impl WebSocketState {
    fn new() -> Self {
        Self {
            stream: None,
            is_connected: false,
            is_registered: false,
            app_handle: None,
        }
    }
}

// Global state for WebSocket
struct AppState {
    ws_state: Arc<Mutex<WebSocketState>>,
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

#[tauri::command]
async fn connect_websocket(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let ws_state = state.ws_state.clone();
    
    // Start WebSocket connection in a background task
    tauri::async_runtime::spawn(async move {
        if let Err(e) = websocket_handler(ws_state, app_handle.clone()).await {
            error!("WebSocket handler error: {}", e);
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn disconnect_websocket(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let mut ws_state = state.ws_state.lock().await;
    
    if let Some(mut stream) = ws_state.stream.take() {
        let _ = stream.close(None).await;
    }
    
    ws_state.is_connected = false;
    ws_state.is_registered = false;
    
    // Emit disconnected event
    if let Some(handle) = &ws_state.app_handle {
        let _ = handle.emit("websocket-status", serde_json::json!({
            "connected": false,
            "registered": false
        }));
    }
    
    Ok(())
}

#[tauri::command]
async fn send_websocket_message(message: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let mut ws_state = state.ws_state.lock().await;
    
    if let Some(stream) = &mut ws_state.stream.as_mut() {
        stream.send(Message::Text(message)).await
            .map_err(|e| format!("Failed to send message: {}", e))?;
        Ok(())
    } else {
        Err("WebSocket not connected".to_string())
    }
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
async fn send_chat_message(message: String, tts_enabled: bool, tts_params: Option<TTSParameters>) -> Result<serde_json::Value, String> {
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
async fn get_conversation_history() -> Result<Vec<ChatMessage>, String> {
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
async fn clear_conversation() -> Result<(), String> {
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
async fn get_monitoring_data() -> Result<serde_json::Value, String> {
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

async fn websocket_handler(
    ws_state: Arc<Mutex<WebSocketState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let url = Url::parse("ws://localhost:9002")
        .map_err(|e| format!("Invalid WebSocket URL: {}", e))?;
    
    // Update state with app handle
    {
        let mut state = ws_state.lock().await;
        state.app_handle = Some(app_handle.clone());
    }
    
    loop {
        match connect_async(&url).await {
            Ok((stream, response)) => {
                info!("WebSocket connected successfully: {:?}", response);
                
                {
                    let mut state = ws_state.lock().await;
                    state.stream = Some(stream);
                    state.is_connected = true;
                    state.is_registered = false;
                }
                
                // Emit connected event
                app_handle.emit("websocket-status", serde_json::json!({
                    "connected": true,
                    "registered": false
                })).map_err(|e| format!("Failed to emit event: {}", e))?;
                
                // Start registration process
                start_registration(ws_state.clone()).await;
                
                // Handle messages
                if let Err(e) = handle_messages(ws_state.clone(), app_handle.clone()).await {
                    error!("Error handling messages: {}", e);
                }
            }
            Err(e) => {
                error!("WebSocket connection failed: {}", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
            }
        }
    }
}

async fn start_registration(ws_state: Arc<Mutex<WebSocketState>>) {
    let mut attempts = 0;
    let max_attempts = 10;
    
    while attempts < max_attempts {
        {
            let mut state = ws_state.lock().await;
            if state.is_registered {
                break;
            }
            
            if let Some(stream) = &mut state.stream.as_mut() {
                if let Err(e) = stream.send(Message::Text("register:default_user".to_string())).await {
                    error!("Failed to send registration: {}", e);
                    break;
                }
            }
        }
        
        attempts += 1;
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }
}

async fn handle_messages(
    ws_state: Arc<Mutex<WebSocketState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Take the stream out of the state to avoid holding the mutex guard across await points
    let mut stream = {
        let mut state = ws_state.lock().await;
        state.stream.take().ok_or("No WebSocket stream")?
    };

    while let Some(message) = stream.next().await {
        match message {
            Ok(Message::Text(text)) => {
                if text == "registered" {
                    // Update registration status in state
                    let mut state = ws_state.lock().await;
                    state.is_registered = true;
                    drop(state); // Release the lock immediately after update
                    
                    app_handle.emit("websocket-status", serde_json::json!({
                        "connected": true,
                        "registered": true
                    })).map_err(|e| format!("Failed to emit event: {}", e))?;
                } else if text == "pong" {
                    // Heartbeat response
                    info!("Received heartbeat pong");
                } else {
                    // Forward message to frontend
                    app_handle.emit("websocket-message", text)
                        .map_err(|e| format!("Failed to emit message: {}", e))?;
                }
            }
            Ok(Message::Binary(data)) => {
                // Forward binary data (e.g., audio) to frontend
                app_handle.emit("websocket-binary", data)
                    .map_err(|e| format!("Failed to emit binary data: {}", e))?;
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket closed");
                break;
            }
            Err(e) => {
                error!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    // Connection closed, update state
    {
        let mut state = ws_state.lock().await;
        state.is_connected = false;
        state.is_registered = false;
        state.stream = None; // Stream was already taken, set to None for clarity
    }
    
    app_handle.emit("websocket-status", serde_json::json!({
        "connected": false,
        "registered": false
    })).map_err(|e| format!("Failed to emit event: {}", e))?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            ws_state: Arc::new(tokio::sync::Mutex::new(WebSocketState::new())),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            save_settings,
            load_settings,
            connect_websocket,
            disconnect_websocket,
            send_websocket_message,
            save_chat_history,
            load_chat_history,
            clear_chat_history,
            add_log_entry,
            get_logs,
            clear_logs,
            send_chat_message,
            get_conversation_history,
            clear_conversation,
            get_monitoring_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
