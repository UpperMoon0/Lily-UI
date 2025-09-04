// WebSocketService.ts
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

class WebSocketService {
  private isConnected: boolean = false;
  private isRegistered: boolean = false;
  private listeners: Array<(message: any) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private isAppClosing: boolean = false;
  private unsubscribeFunctions: Array<() => void> = [];

  // Connect to WebSocket server via Rust
  async connect() {
    console.log("WebSocketService: Initiating connection via Rust backend");
    
    this.isAppClosing = false;
    
    // Set up event listeners for WebSocket status and messages
    try {
      // Listen for WebSocket status events
      const unsubscribeStatus = await listen('websocket-status', (event: any) => {
        const status = event.payload;
        this.isConnected = status.connected;
        this.isRegistered = status.registered;
        this.notifyConnectionListeners(this.isConnected);
      });
      this.unsubscribeFunctions.push(unsubscribeStatus);

      // Listen for WebSocket message events
      const unsubscribeMessage = await listen('websocket-message', (event: any) => {
        console.log("WebSocketService: Message received:", event.payload);
        this.notifyMessageListeners(event.payload);
      });
      this.unsubscribeFunctions.push(unsubscribeMessage);

      // Listen for WebSocket binary events (e.g., audio)
      const unsubscribeBinary = await listen('websocket-binary', (event: any) => {
        console.log("WebSocketService: Binary data received");
        this.notifyMessageListeners(event.payload);
      });
      this.unsubscribeFunctions.push(unsubscribeBinary);
    } catch (error) {
      console.error("WebSocketService: Failed to set up event listeners:", error);
      throw error;
    }

    // Start WebSocket connection through Rust
    try {
      await invoke('connect_websocket');
      console.log("WebSocketService: Connection initiated via Rust");
    } catch (error) {
      console.error("WebSocketService: Failed to connect via Rust:", error);
      throw error;
    }
  }

  // Disconnect from WebSocket server via Rust
  async disconnect() {
    console.log("WebSocketService: Disconnecting WebSocket via Rust");
    this.isAppClosing = true;
    
    // Clean up event listeners
    this.unsubscribeFunctions.forEach(unsubscribe => {
      unsubscribe();
    });
    this.unsubscribeFunctions = [];
    
    // Disconnect through Rust
    try {
      await invoke('disconnect_websocket');
      console.log("WebSocketService: Disconnected via Rust");
    } catch (error) {
      console.error("WebSocketService: Failed to disconnect via Rust:", error);
      throw error;
    }
    
    // Reset status
    this.isConnected = false;
    this.isRegistered = false;
    console.log("WebSocketService: Connection status reset");
  }

  // Send a message through the WebSocket via Rust
  async send(message: string) {
    try {
      await invoke('send_websocket_message', { message });
      console.log("WebSocketService: Message sent via Rust:", message);
    } catch (error) {
      console.error("WebSocketService: Failed to send message via Rust:", error);
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