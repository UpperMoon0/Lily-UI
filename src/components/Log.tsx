import React, { useState, useEffect, useRef } from "react";
import "./Log.css";
import logService from "../services/LogService";

interface LogEntry {
  id: string;
  timestamp: Date;
  type: "chat_sent" | "chat_response" | "tts_response" | "info" | "error";
  message: string;
  details?: any;
}

const Log: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Register with log service on mount
  useEffect(() => {
    logService.registerLogComponent({
      addLogEntry: (type: LogEntry["type"], message: string, details?: any) => {
        const newLog: LogEntry = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp: new Date(),
          type,
          message,
          details
        };
        
        setLogs(prevLogs => [...prevLogs, newLog]);
      }
    });

    return () => {
      logService.unregisterLogComponent();
    };
  }, []);

  // Scroll to bottom when logs change
  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };


  // Function to clear all logs
  const clearLogs = () => {
    setLogs([]);
  };

  // Filter logs based on selected filter
  const filteredLogs = filter === "all" 
    ? logs 
    : logs.filter(log => log.type === filter);

  // Format timestamp for display
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Get icon for log type
  const getLogIcon = (type: LogEntry["type"]) => {
    switch (type) {
      case "chat_sent":
        return "📤";
      case "chat_response":
        return "📥";
      case "tts_response":
        return "🔊";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  // Get class name for log type
  const getLogTypeClass = (type: LogEntry["type"]) => {
    switch (type) {
      case "chat_sent":
        return "log-chat-sent";
      case "chat_response":
        return "log-chat-response";
      case "tts_response":
        return "log-tts-response";
      case "error":
        return "log-error";
      default:
        return "log-info";
    }
  };

  return (
    <div className="log-container">
      <div className="log-header">
        <h1>System Logs</h1>
        <div className="log-controls">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="log-filter"
          >
            <option value="all">All Events</option>
            <option value="chat_sent">Chat Sent</option>
            <option value="chat_response">Chat Response</option>
            <option value="tts_response">TTS Response</option>
            <option value="info">Info</option>
            <option value="error">Error</option>
          </select>
          <button className="clear-button" onClick={clearLogs}>
            Clear Logs
          </button>
        </div>
      </div>
      
      <div className="log-content">
        {filteredLogs.length === 0 ? (
          <div className="log-empty">
            <p>No log entries yet. Events will appear here as they occur.</p>
          </div>
        ) : (
          <div className="log-entries">
            {filteredLogs.map((log) => (
              <div key={log.id} className={`log-entry ${getLogTypeClass(log.type)}`}>
                <div className="log-timestamp">
                  {formatTimestamp(log.timestamp)}
                </div>
                <div className="log-icon">
                  {getLogIcon(log.type)}
                </div>
                <div className="log-message">
                  <div className="log-message-text">{log.message}</div>
                  {log.details && (
                    <div className="log-details">
                      {typeof log.details === "object" 
                        ? JSON.stringify(log.details, null, 2) 
                        : log.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Log;