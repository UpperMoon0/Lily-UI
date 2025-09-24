use crate::domain::interfaces::WebSocketTrait;
use crate::domain::models::{AppState, WebSocketState, WebSocketStatus};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
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
        info!("WebSocket disconnect requested");
        
        let state = app_handle.state::<AppState>();
        let mut ws_state = state.ws_state.lock().await;
        
        info!("Current WebSocket state - Connected: {}, Registered: {}",
              ws_state.is_connected, ws_state.is_registered);
        
        if let Some(stream_arc) = ws_state.stream.take() {
            info!("Closing WebSocket stream");
            let mut stream = stream_arc.lock().await;
            let _ = stream.close(None).await;
        }
        
        ws_state.is_connected = false;
        ws_state.is_registered = false;
        
        info!("WebSocket state updated - Connected: false, Registered: false");
        
        // Emit disconnected event
        if let Some(handle) = &ws_state.app_handle {
            info!("Emitting websocket-status event - Connected: false, Registered: false");
            let _ = handle.emit("websocket-status", serde_json::json!({
                "connected": false,
                "registered": false
            }));
        }
        
        Ok(())
    }

    async fn send_message(message: String, app_handle: AppHandle) -> Result<(), String> {
        let state = app_handle.state::<AppState>();
        let ws_state = state.ws_state.lock().await;
        
        if let Some(stream_arc) = ws_state.stream.clone() {
            let mut stream = stream_arc.lock().await;
            stream.send(Message::Text(message)).await
                .map_err(|e| format!("Failed to send message: {}", e))
        } else {
            Err("WebSocket not connected".to_string())
        }
    }

    async fn send_binary_data(data: Vec<u8>, app_handle: AppHandle) -> Result<(), String> {
        let state = app_handle.state::<AppState>();
        let ws_state = state.ws_state.lock().await;
        
        info!("Attempting to send binary data via WebSocket - Data size: {} bytes", data.len());

        if let Some(stream_arc) = ws_state.stream.clone() {
            let mut stream = stream_arc.lock().await;
            debug!("Sending binary data with size: {}", data.len());
            let result = stream.send(Message::Binary(data.clone())).await;
            
            match &result {
                Ok(_) => info!("Successfully sent binary data via WebSocket - Data size: {} bytes", data.len()),
                Err(e) => error!("Failed to send binary data via WebSocket - Data size: {} bytes, Error: {}", data.len(), e),
            }
            
            result.map_err(|e| format!("Failed to send binary data: {}", e))
        } else {
            let error_msg = "WebSocket not connected - No stream available.";
            error!("{}", error_msg);
            Err(error_msg.to_string())
        }
    }

}

impl WebSocketService {
    pub async fn get_status(app_handle: AppHandle) -> Result<WebSocketStatus, String> {
        let state = app_handle.state::<AppState>();
        let ws_state = state.ws_state.lock().await;
        Ok(WebSocketStatus {
            connected: ws_state.is_connected,
            registered: ws_state.is_registered,
        })
    }

    async fn websocket_handler(
        ws_state: Arc<Mutex<WebSocketState>>,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let url = Url::parse("ws://localhost:9002")
            .map_err(|e| format!("Invalid WebSocket URL: {}", e))?;
        
        info!("Starting WebSocket handler for URL: {}", url);
        
        // Update state with app handle
        {
            let mut state = ws_state.lock().await;
            state.app_handle = Some(app_handle.clone());
            info!("WebSocket state updated with app handle");
        }
        
        loop {
            info!("Attempting to connect to WebSocket server at {}", url);
            match connect_async(&url).await {
                Ok((stream, response)) => {
                    info!("WebSocket connected successfully. Response: {:?}", response);
                    
                    {
                        let stream_arc = Arc::new(Mutex::new(stream));
                        let mut state = ws_state.lock().await;
                        state.stream = Some(stream_arc.clone());
                        state.is_connected = true;
                        state.is_registered = false;
                        info!("WebSocket state updated - Connected: true, Registered: false");
                    }
                    
                    // Emit connected event
                    info!("Emitting websocket-status event - Connected: true, Registered: false");
                    app_handle.emit("websocket-status", serde_json::json!({
                        "connected": true,
                        "registered": false
                    })).map_err(|e| format!("Failed to emit event: {}", e))?;
                    
                    // Start registration process
                    info!("Starting registration process");
                    WebSocketService::start_registration(ws_state.clone()).await;
                    
                    // Handle messages
                    info!("Starting message handler");
                    if let Err(e) = WebSocketService::handle_messages(ws_state.clone(), app_handle.clone()).await {
                        error!("Error handling messages: {}", e);
                    }
                    
                    info!("Message handler completed, reconnecting...");
                }
                Err(e) => {
                    error!("WebSocket connection failed: {}. Retrying in 3 seconds...", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                }
            }
        }
    }

    async fn start_registration(ws_state: Arc<Mutex<WebSocketState>>) {
        info!("Starting registration process");
        let mut attempts = 0;
        let max_attempts = 10;
        
        while attempts < max_attempts {
            {
                let state = ws_state.lock().await;
                if state.is_registered {
                    info!("Already registered, exiting registration loop");
                    break;
                }
                
                if let Some(stream_arc) = state.stream.clone() {
                    info!("Sending registration message - Attempt {}/{}", attempts + 1, max_attempts);
                    let mut stream = stream_arc.lock().await;
                    if let Err(e) = stream.send(Message::Text("register:default_user".to_string())).await {
                        error!("Failed to send registration: {}", e);
                        break;
                    }
                    info!("Registration message sent successfully");
                } else {
                    warn!("No WebSocket stream available for registration");
                    break;
                }
            }
            
            attempts += 1;
            info!("Waiting 2 seconds before next registration attempt");
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
        
        if attempts >= max_attempts {
            warn!("Registration attempts exceeded maximum ({})", max_attempts);
        }
    }

    async fn handle_messages(
        ws_state: Arc<Mutex<WebSocketState>>,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        info!("Starting message handler");
        
        let stream_arc = {
            let state = ws_state.lock().await;
            state.stream.clone().ok_or("No WebSocket stream")?
        };

        let mut stream_lock = stream_arc.lock().await;
        info!("WebSocket stream lock acquired, starting message loop");

        while let Some(message) = stream_lock.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    info!("Received text message: {}", text);
                    
                    if text == "registered" {
                        info!("Registration confirmed by server");
                        // Update registration status in state
                        let mut state = ws_state.lock().await;
                        state.is_registered = true;
                        drop(state); // Release the lock immediately after update
                        
                        info!("Emitting websocket-status event - Connected: true, Registered: true");
                        app_handle.emit("websocket-status", serde_json::json!({
                            "connected": true,
                            "registered": true
                        })).map_err(|e| format!("Failed to emit event: {}", e))?;
                    } else if text == "pong" {
                        // Heartbeat response - can be ignored
                        debug!("Received heartbeat response (pong)");
                    } else {
                        info!("Forwarding text message to frontend");
                        // Forward message to frontend
                        app_handle.emit("websocket-message", text)
                            .map_err(|e| format!("Failed to emit message: {}", e))?;
                    }
                }
                Ok(Message::Binary(data)) => {
                    info!("Received binary data - Size: {} bytes", data.len());
                    // Forward binary data (e.g., audio) to frontend
                    app_handle.emit("websocket-binary", data)
                        .map_err(|e| format!("Failed to emit binary data: {}", e))?;
                }
                Ok(Message::Close(_)) => {
                    info!("WebSocket closed by server");
                    break;
                }
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
                _ => {
                    warn!("Received unexpected message type");
                }
            }
        }

        info!("Message loop ended, updating WebSocket state");
        
        // Connection closed, update state
        {
            let mut state = ws_state.lock().await;
            state.is_connected = false;
            state.is_registered = false;
            state.stream = None; // Stream was already taken, set to None for clarity
            info!("WebSocket state updated - Connected: false, Registered: false");
        }
        
        info!("Emitting websocket-status event - Connected: false, Registered: false");
        app_handle.emit("websocket-status", serde_json::json!({
            "connected": false,
            "registered": false
        })).map_err(|e| format!("Failed to emit event: {}", e))?;
        
        Ok(())
    }
}