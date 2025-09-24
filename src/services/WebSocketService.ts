// WebSocketService.ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import logService from './LogService';

class WebSocketService {
  private isConnected: boolean = false;
  private isRegistered: boolean = false;
  private listeners: Array<(message: any) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private isAppClosing: boolean = false;
  private unsubscribeFunctions: Array<() => void> = [];

  constructor() {
    this.init();
  }

  // Initialize the WebSocket service
  async init() {
    console.log("WebSocketService: Initializing");
    logService.logInfo("WebSocketService: Initializing", {
      timestamp: new Date().toISOString()
    });

    // Set up event listeners
    try {
      const unsubscribeStatus = await listen('websocket-status', (event: any) => {
        const status = event.payload;
        console.log("WebSocketService: Status update - Connected:", status.connected, "Registered:", status.registered);
        logService.logInfo("WebSocketService: Status update", {
          connected: status.connected,
          registered: status.registered,
          timestamp: new Date().toISOString()
        });
        this.isConnected = status.connected;
        this.isRegistered = status.registered;
        this.notifyConnectionListeners(this.isConnected);
      });
      this.unsubscribeFunctions.push(unsubscribeStatus);

      const unsubscribeMessage = await listen('websocket-message', (event: any) => {
        console.log("WebSocketService: Message received:", event.payload);
        logService.logInfo("WebSocketService: Message received", {
          payload: event.payload,
          timestamp: new Date().toISOString()
        });
        this.notifyMessageListeners(event.payload);
      });
      this.unsubscribeFunctions.push(unsubscribeMessage);

      const unsubscribeBinary = await listen('websocket-binary', (event: any) => {
        console.log("WebSocketService: Binary data received");
        logService.logInfo("WebSocketService: Binary data received", {
          dataSize: event.payload?.length || 0,
          timestamp: new Date().toISOString()
        });
        this.notifyMessageListeners(event.payload);
      });
      this.unsubscribeFunctions.push(unsubscribeBinary);
    } catch (error) {
      const errorMsg = "WebSocketService: Failed to set up event listeners";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }

    // Check initial status and connect if needed
    this.getStatus(true);
  }

  // Get WebSocket status from Rust
  async getStatus(shouldConnect: boolean = false) {
    try {
      const status = await invoke<{ connected: boolean; registered: boolean }>('get_websocket_status');
      this.isConnected = status.connected;
      this.isRegistered = status.registered;
      this.notifyConnectionListeners(this.isConnected);

      if (shouldConnect && !status.connected) {
        this.connect();
      }
    } catch (error) {
      console.error("WebSocketService: Failed to get status", error);
      if (shouldConnect) {
        this.connect();
      }
    }
  }


  // Connect to WebSocket server via Rust
  async connect() {
    console.log("WebSocketService: Initiating connection via Rust backend");
    logService.logInfo("WebSocketService: Initiating connection via Rust backend", {
      timestamp: new Date().toISOString()
    });
    
    this.isAppClosing = false;

    // Start WebSocket connection through Rust
    try {
      await invoke('connect_websocket');
      const successMsg = "WebSocketService: Connection initiated via Rust";
      console.log(successMsg);
      logService.logInfo(successMsg, {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMsg = "WebSocketService: Failed to connect via Rust";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  // Disconnect from WebSocket server via Rust
  async disconnect() {
    const disconnectMsg = "WebSocketService: Disconnecting WebSocket via Rust";
    console.log(disconnectMsg);
    logService.logInfo(disconnectMsg, {
      timestamp: new Date().toISOString()
    });
    this.isAppClosing = true;
    
    // Clean up event listeners
    logService.logInfo("WebSocketService: Cleaning up event listeners", {
      listenerCount: this.unsubscribeFunctions.length,
      timestamp: new Date().toISOString()
    });
    this.unsubscribeFunctions.forEach(unsubscribe => {
      unsubscribe();
    });
    this.unsubscribeFunctions = [];
    
    // Disconnect through Rust
    try {
      await invoke('disconnect_websocket');
      const successMsg = "WebSocketService: Disconnected via Rust";
      console.log(successMsg);
      logService.logInfo(successMsg, {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMsg = "WebSocketService: Failed to disconnect via Rust";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      throw error;
    }
    
    // Reset status
    this.isConnected = false;
    this.isRegistered = false;
    const resetMsg = "WebSocketService: Connection status reset";
    console.log(resetMsg);
    logService.logInfo(resetMsg, {
      timestamp: new Date().toISOString()
    });
  }

  // Send a message through the WebSocket via Rust
  async send(message: string) {
    try {
      logService.logInfo("WebSocketService: Sending message via Rust", {
        messageLength: message.length,
        timestamp: new Date().toISOString()
      });
      await invoke('send_websocket_message', { message });
      const successMsg = "WebSocketService: Message sent via Rust";
      console.log(successMsg, message);
      logService.logInfo(successMsg, {
        messageLength: message.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMsg = "WebSocketService: Failed to send message via Rust";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        messageLength: message.length,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  // Check if WebSocket is connected
  getIsConnected(): boolean {
    return this.isConnected;
  }

  // Check if WebSocket is registered
  getIsRegistered(): boolean {
    return this.isRegistered;
  }

  // Add a message listener
  addMessageListener(listener: (message: any) => void) {
    this.listeners.push(listener);
  }

  // Remove a message listener
  removeMessageListener(listener: (message: any) => void) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Add a connection status listener
  addConnectionListener(listener: (connected: boolean) => void) {
    this.connectionListeners.push(listener);
  }

  // Remove a connection status listener
  removeConnectionListener(listener: (connected: boolean) => void) {
    const index = this.connectionListeners.indexOf(listener);
    if (index !== -1) {
      this.connectionListeners.splice(index, 1);
    }
  }

  // Notify all message listeners
  private notifyMessageListeners(message: any) {
    this.listeners.forEach(listener => {
      listener(message);
    });
  }

  // Notify all connection listeners
  private notifyConnectionListeners(connected: boolean) {
    this.connectionListeners.forEach(listener => {
      listener(connected);
    });
  }
}

// Create a singleton instance
const webSocketService = new WebSocketService();
export default webSocketService;