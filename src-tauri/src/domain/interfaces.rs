use crate::domain::models::{AppSettings, ChatMessage, LogEntry};
use serde_json;
use tauri::AppHandle;
use std::future::Future;

pub trait FileStorageTrait {
    fn save_settings(settings: AppSettings) -> Result<(), String>;
    fn load_settings() -> Result<AppSettings, String>;
    fn save_chat_history(messages: Vec<ChatMessage>) -> Result<(), String>;
    fn load_chat_history() -> Result<Vec<ChatMessage>, String>;
    fn clear_chat_history() -> Result<(), String>;
    fn add_log_entry(type_: String, message: String, details: Option<serde_json::Value>) -> Result<(), String>;
    fn get_logs() -> Result<Vec<LogEntry>, String>;
    fn clear_logs() -> Result<(), String>;
}

pub trait WebSocketTrait {
    fn connect(app_handle: AppHandle) -> impl Future<Output = Result<(), String>> + Send;
    fn disconnect(app_handle: AppHandle) -> impl Future<Output = Result<(), String>> + Send;
    fn send_message(message: String, app_handle: AppHandle) -> impl Future<Output = Result<(), String>> + Send;
}