use crate::domain::interfaces::WebSocketTrait;
use crate::domain::models::{AppState, WebSocketState};
use futures_util::{SinkExt, StreamExt};
use log::{error, info};
use tauri::{AppHandle, Emitter, Manager};
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::connect_async;
use url::Url;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct WebSocketService;

impl WebSocketTrait for WebSocketService {
    async fn connect(app_handle: AppHandle) -> Result<(), String> {
        let state = app_handle.state::<AppState>();
        let ws_state = state.ws_state.clone();
        
        // Start WebSocket connection in a background task
        tauri::async_runtime::spawn(async move {
            if let Err(e) = WebSocketService::websocket_handler(ws_state, app_handle.clone()).await {
                error!("WebSocket handler error: {}", e);
            }
        });
        
        Ok(())
    }

    async fn disconnect(app_handle: AppHandle) -> Result<(), String> {
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

    async fn send_message(message: String, app_handle: AppHandle) -> Result<(), String> {
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

    async fn send_binary_data(data: Vec<u8>, app_handle: AppHandle) -> Result<(), String> {
        let state = app_handle.state::<AppState>();
        let ws_state = state.ws_state.lock().await;
        info!("Checking WebSocket connection status - Connected: {}, Registered: {}", 
              ws_state.is_connected, ws_state.is_registered);
        
        if let Some(stream) = &ws_state.stream.as_ref() {
            drop(ws_state); // Release the lock before sending
            info!("Sending binary data of size: {}", data.len());
            let result = stream.send(Message::Binary(data)).await
                .map_err(|e| format!("Failed to send binary data: {}", e));
            
            if result.is_ok() {
                info!("Binary data sent successfully");
            } else {
                error!("Failed to send binary data: {:?}", result.as_ref().err());
            }
            
            result
        } else {
            error!("WebSocket not connected - No stream available");
            Err("WebSocket not connected".to_string())
        }
    }

}

impl WebSocketService {
    async fn websocket_handler(
        ws_state: Arc<Mutex<WebSocketState>>,
        app_handle: AppHandle,
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
                    WebSocketService::start_registration(ws_state.clone()).await;
                    
                    // Handle messages
                    if let Err(e) = WebSocketService::handle_messages(ws_state.clone(), app_handle.clone()).await {
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
        app_handle: AppHandle,
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
}