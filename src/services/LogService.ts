// LogService.ts
import { invoke } from '@tauri-apps/api/core';

interface LogEntry {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  details?: any;
}

class LogService {
  private listeners: Array<(logs: LogEntry[]) => void> = [];

  // Register a listener to receive log updates
  async registerListener(listener: (logs: LogEntry[]) => void) {
    this.listeners.push(listener);
    // Send current logs to the new listener
    const logs = await this.getLogs();
    listener(logs);
  }

  // Unregister a listener
  unregisterListener(listener: (logs: LogEntry[]) => void) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Add a log entry via Rust
  async addLogEntry(type: string, message: string, details?: any) {
    try {
      await invoke('add_log_entry', { type, message, details });
      // Notify all listeners with updated logs
      const logs = await this.getLogs();
      this.notifyListeners(logs);
    } catch (error) {
      console.error('Failed to add log entry:', error);
      throw error;
    }
  }

  // Get all log entries via Rust
  async getLogs(): Promise<LogEntry[]> {
    try {
      const logs = await invoke<LogEntry[]>('get_logs');
      return logs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp)
      }));
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }

  // Clear all log entries via Rust
  async clearLogs() {
    try {
      await invoke('clear_logs');
      // Notify all listeners with empty logs
      this.notifyListeners([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
      throw error;
    }
  }

  // Notify all listeners
  private notifyListeners(logs: LogEntry[]) {
    this.listeners.forEach(listener => {
      listener(logs);
    });
  }

  // Log chat sent event
  async logChatSent(message: string, details?: any) {
    await this.addLogEntry('chat_sent', `Chat message sent: ${message}`, details);
  }

  // Log chat response received event
  async logChatResponse(response: string, details?: any) {
    await this.addLogEntry('chat_response', `Chat response received: ${response}`, details);
  }

  // Log TTS response received event
  async logTTSResponse(details?: any) {
    await this.addLogEntry('tts_response', 'TTS response received', details);
  }

  // Log info event
  async logInfo(message: string, details?: any) {
    await this.addLogEntry('info', message, details);
  }

  // Log error event
  async logError(message: string, details?: any) {
    await this.addLogEntry('error', message, details);
  }
}

// Create a singleton instance
const logService = new LogService();
export default logService;