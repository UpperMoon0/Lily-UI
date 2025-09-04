// LogService.ts
interface LogEntry {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  details?: any;
}

class LogService {
  private logs: LogEntry[] = [];
  private listeners: Array<(logs: LogEntry[]) => void> = [];

  // Register a listener to receive log updates
  registerListener(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    // Send current logs to the new listener
    listener(this.logs);
  }

  // Unregister a listener
  unregisterListener(listener: (logs: LogEntry[]) => void) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Add a log entry
  private addLogEntry(type: string, message: string, details?: any) {
    const newLog: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      message,
      details
    };
    
    this.logs.push(newLog);
    
    // Notify all listeners
    this.listeners.forEach(listener => {
      listener(this.logs);
    });
  }

  // Get all log entries
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  // Clear all log entries
  clearLogs() {
    this.logs = [];
    this.listeners.forEach(listener => {
      listener(this.logs);
    });
  }

  // Log chat sent event
  logChatSent(message: string, details?: any) {
    this.addLogEntry('chat_sent', `Chat message sent: ${message}`, details);
  }

  // Log chat response received event
  logChatResponse(response: string, details?: any) {
    this.addLogEntry('chat_response', `Chat response received: ${response}`, details);
  }

  // Log TTS response received event
  logTTSResponse(details?: any) {
    this.addLogEntry('tts_response', 'TTS response received', details);
  }

  // Log info event
  logInfo(message: string, details?: any) {
    this.addLogEntry('info', message, details);
  }

  // Log error event
  logError(message: string, details?: any) {
    this.addLogEntry('error', message, details);
  }
}

// Create a singleton instance
const logService = new LogService();
export default logService;