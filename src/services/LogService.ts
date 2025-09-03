// LogService.ts
class LogService {
  private logComponent: any = null;

  // Register the log component to receive log entries
  registerLogComponent(component: any) {
    this.logComponent = component;
  }

  // Unregister the log component
  unregisterLogComponent() {
    this.logComponent = null;
  }

  // Add a log entry
  addLogEntry(type: string, message: string, details?: any) {
    if (this.logComponent && typeof this.logComponent.addLogEntry === 'function') {
      this.logComponent.addLogEntry(type, message, details);
    }
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