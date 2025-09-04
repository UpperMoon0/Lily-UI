use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

#[derive(Serialize, Deserialize, Clone)]
pub struct TTSParameters {
    pub speaker: i32,
    pub sample_rate: i32,
    pub model: String,
    pub lang: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub tts_params: TTSParameters,
    pub tts_enabled: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub type_: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

// WebSocket state
pub struct WebSocketState {
    pub stream: Option<WebSocketStream<MaybeTlsStream<TcpStream>>>,
    pub is_connected: bool,
    pub is_registered: bool,
    pub app_handle: Option<tauri::AppHandle>,
}

impl WebSocketState {
    pub fn new() -> Self {
        Self {
            stream: None,
            is_connected: false,
            is_registered: false,
            app_handle: None,
        }
    }
}

// Global state for WebSocket
pub struct AppState {
    pub ws_state: Arc<Mutex<WebSocketState>>,
}