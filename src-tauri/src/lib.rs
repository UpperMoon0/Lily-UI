// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Arc;

// Domain layer
pub mod domain;
use domain::models::{AppState, WebSocketState};

// Services layer
use crate::services::audio_service::AudioService;

// Application layer
pub mod application;
use application::commands;

// Infrastructure layer
pub mod infrastructure;

// Services layer
pub mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            ws_state: Arc::new(tokio::sync::Mutex::new(WebSocketState::new())),
            audio_service: Arc::new(AudioService::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::save_settings,
            commands::load_settings,
            commands::connect_websocket,
            commands::disconnect_websocket,
            commands::send_websocket_message,
            commands::save_chat_history,
            commands::load_chat_history,
            commands::clear_chat_history,
            commands::add_log_entry,
            commands::get_logs,
            commands::clear_logs,
            commands::send_chat_message,
            commands::get_conversation_history,
            commands::clear_conversation,
            commands::get_monitoring_data,
            commands::send_websocket_audio,
            commands::get_websocket_status,
            commands::start_audio_recording,
            commands::stop_audio_recording,
            commands::get_audio_level,
            commands::get_audio_devices
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}