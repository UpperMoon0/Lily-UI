// WebSocketService.ts
class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private isRegistered: boolean = false;
  private listeners: Array<(message: any) => void> = [];
  private connectionListeners: Array<(connected: boolean) => void> = [];
  private isAppClosing: boolean = false;
  private registrationAttempts: number = 0;
  private maxRegistrationAttempts: number = 10;
  private registrationInterval: NodeJS.Timeout | null = null;

  // Connect to WebSocket server
  connect() {
    console.log("WebSocketService: Initiating connection to ws://localhost:9002");
    
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear any existing heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear any existing registration interval
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
      this.registrationInterval = null;
    }

    // Reset registration status
    this.isRegistered = false;

    // Close existing connection if present
    if (this.ws) {
      console.log("WebSocketService: Closing existing WebSocket connection");
      this.ws.close();
      this.ws = null;
    }

    console.log("WebSocketService: Creating new WebSocket instance");
    this.ws = new WebSocket("ws://localhost:9002");

    this.ws.onopen = () => {
      if (this.isAppClosing) {
        this.ws?.close();
        return;
      }
      console.log("WebSocketService: Connection established successfully");
      this.isConnected = true;
      this.notifyConnectionListeners(true);
      
      // Reset registration attempts
      this.registrationAttempts = 0;
      
      // Start registration process
      console.log("WebSocketService: Starting registration process");
      this.startRegistration();
      
      // Set up heartbeat to check connection health
      console.log("WebSocketService: Starting heartbeat interval (30s)");
      this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Send a ping message to check connection health
          console.log("WebSocketService: Sending heartbeat ping");
          this.ws.send("ping");
        } else if (this.ws && this.ws.readyState !== WebSocket.CONNECTING) {
          // Connection is not open, clear interval and trigger reconnect
          console.log("WebSocketService: Connection not open, triggering reconnect");
          this.isConnected = false;
          this.isRegistered = false;
          this.notifyConnectionListeners(false);
          if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
          }
          this.ws.close();
        }
      }, 30000); // Send ping every 30 seconds
    };

    this.ws.onmessage = (event) => {
      if (this.isAppClosing) return;
      
      // Handle pong messages for health checking
      if (event.data === "pong") {
        console.log("WebSocketService: Received heartbeat pong - connection healthy");
        return;
      }
      
      // Handle registration confirmation
      if (event.data === "registered") {
        console.log("WebSocketService: Client registered successfully with server");
        this.isRegistered = true;
        // Clear registration interval since we're registered
        if (this.registrationInterval) {
          clearInterval(this.registrationInterval);
          this.registrationInterval = null;
        }
        return;
      }
      
      console.log("WebSocketService: Received message:", event.data);
      
      // Notify all listeners of the message
      this.listeners.forEach(listener => {
        listener(event);
      });
    };

    this.ws.onclose = () => {
      if (this.isAppClosing) return;
      
      console.log("WebSocketService: Connection closed");
      this.isConnected = false;
      this.isRegistered = false;
      this.notifyConnectionListeners(false);
      
      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
        console.log("WebSocketService: Heartbeat interval cleared");
      }
      
      if (this.registrationInterval) {
        clearInterval(this.registrationInterval);
        this.registrationInterval = null;
        console.log("WebSocketService: Registration interval cleared");
      }
      
      // Attempt to reconnect after 3 seconds
      if (!this.isAppClosing) {
        console.log("WebSocketService: Scheduling reconnect in 3 seconds");
        this.reconnectTimeout = setTimeout(() => {
          console.log("WebSocketService: Attempting to reconnect...");
          this.connect();
        }, 3000);
      }
    };

    this.ws.onerror = (error) => {
      if (this.isAppClosing) return;
      
      console.error("WebSocketService: Error occurred:", error);
      this.isConnected = false;
      this.isRegistered = false;
      this.notifyConnectionListeners(false);
      // Close the connection to trigger reconnect
      console.log("WebSocketService: Closing connection due to error");
      this.ws?.close();
    };
  }

  // Start registration process with retries
  private startRegistration() {
    console.log("WebSocketService: Starting registration process with retries");
    
    // Clear any existing registration interval
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
    }
    
    // Send initial registration
    this.sendRegistration();
    
    // Set up periodic registration attempts
    this.registrationInterval = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN && !this.isRegistered) {
        this.registrationAttempts++;
        if (this.registrationAttempts <= this.maxRegistrationAttempts) {
          console.log(`WebSocketService: Registration attempt ${this.registrationAttempts}/${this.maxRegistrationAttempts}`);
          this.sendRegistration();
        } else {
          console.warn("WebSocketService: Max registration attempts reached");
          if (this.registrationInterval) {
            clearInterval(this.registrationInterval);
            this.registrationInterval = null;
          }
        }
      } else if (this.isRegistered) {
        // We're registered, clear the interval
        if (this.registrationInterval) {
          clearInterval(this.registrationInterval);
          this.registrationInterval = null;
          console.log("WebSocketService: Registration interval cleared - client is registered");
        }
      }
    }, 2000); // Retry every 2 seconds
  }

  // Send registration message
  private sendRegistration() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocketService: Sending registration message: register:default_user");
      this.ws.send("register:default_user");
    } else {
      console.log("WebSocketService: Cannot send registration - WebSocket not open");
    }
  }

  // Disconnect from WebSocket server
  disconnect() {
    console.log("WebSocketService: Disconnecting WebSocket");
    this.isAppClosing = true;
    
    // Clean up intervals
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
      console.log("WebSocketService: Reconnect timeout cleared");
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log("WebSocketService: Heartbeat interval cleared");
    }
    
    if (this.registrationInterval) {
      clearInterval(this.registrationInterval);
      this.registrationInterval = null;
      console.log("WebSocketService: Registration interval cleared");
    }
    
    // Clean up WebSocket connection
    if (this.ws) {
      console.log("WebSocketService: Closing WebSocket connection");
      this.ws.close();
      this.ws = null;
    }
    
    // Reset status
    this.isConnected = false;
    this.isRegistered = false;
    console.log("WebSocketService: Connection status reset");
  }

  // Send a message through the WebSocket
  send(message: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocketService: Sending message:", message);
      this.ws.send(message);
    } else {
      console.warn("WebSocketService: WebSocket is not connected. Message not sent:", message);
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