import React, { useState, useEffect, useRef } from "react";
import styles from "./Monitor.module.css";
import ServiceCard from "./ServiceCard";
import MCPServiceCard from "./MCPServiceCard";
import logService from "../services/LogService";
import webSocketService from "../services/WebSocketService";
import { listen } from "@tauri-apps/api/event";

interface ServiceStatus {
  name: string;
  status: string;
  details?: Record<string, any>;
  last_updated: string;
}

interface SystemMetrics {
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  uptime?: string;
}

interface MonitoringData {
  status: string;
  service_name: string;
  version: string;
  timestamp: string;
  metrics?: SystemMetrics;
  services?: ServiceStatus[];
  details?: Record<string, any>;
}

interface AgentStep {
  step_number: number;
  type: string;
  reasoning: string;
  tool_name: string;
  tool_parameters: any;
  tool_result: any;
  timestamp: string;
}

interface AgentLoop {
  exists: boolean;
  user_id: string;
  user_message: string;
  final_response: string;
  completed: boolean;
  start_time: string;
  end_time: string;
  duration_seconds?: number;
  steps: AgentStep[];
  message?: string;
}

// Log entry interface
interface LogEntry {
  id: string;
  timestamp: Date;
  type: "chat_sent" | "chat_response" | "tts_response" | "info" | "error";
  message: string;
  details?: any;
}

const Monitor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"general" | "agent" | "log">("general");
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [agentLoopData, setAgentLoopData] = useState<AgentLoop | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [agentLoopLoading, setAgentLoopLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRegistered, setIsRegistered] = useState<boolean>(false);
  
  // Refs to store scroll position and track changes
  const scrollPositionRef = useRef(0);
  const lastNonZeroScrollRef = useRef(0);
  const scrollResetDetectedRef = useRef(false);
  const domMutationObserverRef = useRef<MutationObserver | null>(null);
  const monitorContainerRef = useRef<HTMLDivElement>(null);

  // Set up WebSocket status listener
  useEffect(() => {
    const handleConnectionChange = (connected: boolean) => {
      setIsConnected(connected);
      // If we're connecting, we might not be registered yet
      if (!connected) {
        setIsRegistered(false);
      }
    };

    // Add listener for connection status changes
    webSocketService.addConnectionListener(handleConnectionChange);

    // Get initial status
    setIsConnected(webSocketService.getIsConnected());
    setIsRegistered(webSocketService.getIsRegistered());

    // Set up event listener for registration status
    const unsubscribePromise = listen('websocket-status', (event: any) => {
      const status = event.payload;
      setIsConnected(status.connected);
      setIsRegistered(status.registered);
    }).then(unsubscribe => unsubscribe);

    return () => {
      webSocketService.removeConnectionListener(handleConnectionChange);
      unsubscribePromise.then(unsubscribe => unsubscribe());
    };
  }, []);

  const fetchMonitoringData = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/monitoring");
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: MonitoringData = await response.json();
      // Only update state if data has changed to prevent unnecessary re-renders
      if (JSON.stringify(data) !== JSON.stringify(monitoringData)) {
        setMonitoringData(data);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching monitoring data:", err);
      setError("Failed to connect to Lily-Core. Retrying automatically...");
    } finally {
      setLoading(false);
    }
  };

  // Fetch logs from log service
  useEffect(() => {
    const listener = (updatedLogs: LogEntry[]) => {
      const filtered = logFilter === "all"
        ? updatedLogs
        : updatedLogs.filter(log => log.type === logFilter);
      setLogs(filtered);
    };
    
    logService.registerListener(listener);
    
    return () => {
      logService.unregisterListener(listener);
    };
  }, [logFilter]);

  const fetchAgentLoopData = async () => {
    // Save detailed scroll state before fetch - use container scroll position
    const container = monitorContainerRef.current;
    const preFetchScroll = container ? container.scrollTop : 0;
    const preFetchStored = scrollPositionRef.current;
    const preFetchLastNonZero = lastNonZeroScrollRef.current;
    
    if (activeTab === "agent") {
      scrollPositionRef.current = preFetchScroll;
      if (preFetchScroll > 0) {
        lastNonZeroScrollRef.current = preFetchScroll;
      }
      console.log("Pre-fetch scroll state - current:", preFetchScroll, "stored:", preFetchStored, "lastNonZero:", preFetchLastNonZero, "for agent tab");
    }
    
    console.log("fetchAgentLoopData called - current scrollTop:", preFetchScroll, "activeTab:", activeTab);
    
    // Only set loading if we don't have data yet (initial load)
    if (!agentLoopData) {
      setAgentLoopLoading(true);
    }
    
    try {
      const response = await fetch("http://localhost:8000/agent-loops");
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: AgentLoop = await response.json();
      console.log("Agent loop data fetched:", {
        exists: data.exists,
        steps: data.steps?.length,
        completed: data.completed
      });
      
      // Only update state if data has changed to prevent unnecessary re-renders
      if (JSON.stringify(data) !== JSON.stringify(agentLoopData)) {
        console.log("Agent loop data changed, updating state - current scrollTop:", container ? container.scrollTop : 0);
        setAgentLoopData(prevData => {
          console.log("setAgentLoopData called with new data, triggering re-render");
          return data;
        });
      } else {
        console.log("Agent loop data unchanged, skipping state update");
      }
    } catch (err) {
      console.error("Error fetching agent loop data:", err);
      // Don't set error for agent loop to avoid blocking the main monitoring
    } finally {
      // Only set loading to false if we were loading
      if (agentLoopLoading) {
        setAgentLoopLoading(false);
      }
    }
  };

  useEffect(() => {
    console.log("Monitor component mounted, setting up intervals");
    
    // Initialize scroll position from session storage if available
    const savedScroll = parseInt(sessionStorage.getItem('agentScrollPosition') || '0', 10);
    const savedLastNonZero = parseInt(sessionStorage.getItem('agentLastNonZeroScroll') || '0', 10);
    if (savedScroll > 0) {
      scrollPositionRef.current = savedScroll;
    }
    if (savedLastNonZero > 0) {
      lastNonZeroScrollRef.current = savedLastNonZero;
    }
    
    fetchMonitoringData();
    fetchAgentLoopData();
    
    // Increase intervals to reduce refresh frequency and prevent flashing
    const intervalId = setInterval(() => {
      console.log("Monitoring data interval triggered");
      fetchMonitoringData();
    }, 10000); // Changed from 5000 to 10000 ms
    const agentLoopIntervalId = setInterval(() => {
      console.log("Agent loop data interval triggered");
      fetchAgentLoopData();
    }, 5000); // Changed from 3000 to 5000 ms
    
    // Clean up any existing mutation observer
    if (domMutationObserverRef.current) {
      domMutationObserverRef.current.disconnect();
      domMutationObserverRef.current = null;
    }
    
    return () => {
      console.log("Monitor component unmounting, clearing intervals and observer");
      clearInterval(intervalId);
      clearInterval(agentLoopIntervalId);
      if (domMutationObserverRef.current) {
        domMutationObserverRef.current.disconnect();
      }
    };
  }, [activeTab]);

  // Simplified scroll tracking - just update the ref without complex logic
  useEffect(() => {
    const handleScroll = () => {
      if (activeTab === "agent" && monitorContainerRef.current) {
        const currentScroll = monitorContainerRef.current.scrollTop;
        scrollPositionRef.current = currentScroll;
        if (currentScroll > 0) {
          lastNonZeroScrollRef.current = currentScroll;
        }
      }
    };

    const container = monitorContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [activeTab]);

  // Remove the scroll maintenance effect since we're preventing the root cause

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "healthy":
        return "status-healthy";
      case "degraded":
        return "status-degraded";
      case "down":
        return "status-down";
      default:
        return "status-unknown";
    }
  };

  // Function to clear all logs
  const clearLogs = () => {
    logService.clearLogs();
  };

  const formatUptime = (uptime: string | undefined) => {
    if (!uptime) return "N/A";
    if (uptime.includes(":")) return uptime;
    const seconds = parseInt(uptime, 10);
    if (isNaN(seconds)) return uptime;

    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  };

  // Format timestamp for log display
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

  // Function to parse tool server details and tool information
  const parseToolServersAndTools = (serviceDetails: Record<string, any> | undefined) => {
    if (!serviceDetails) return [];

    const toolServers: Array<{
      url: string;
      toolCount: number;
      toolNames: string[];
      isOnline: boolean;
      tools: Array<{
        name: string;
        description?: string;
        inputSchema?: any;
      }>;
    }> = [];

    // Look for server-specific entries in the details
    for (const [key, value] of Object.entries(serviceDetails)) {
      if (key.startsWith('server_') && key.endsWith('_tools')) {
        // Extract URL from the value string
        const valueStr = String(value);
        const urlMatch = valueStr.match(/^([^:]+:\/\/[^:\s]+)/);
        const countMatch = valueStr.match(/(\d+)\s+tools/);
        const toolNamesMatch = valueStr.match(/\[([^\]]+)\]/);

        if (urlMatch) {
          const toolNames = toolNamesMatch ? toolNamesMatch[1].split(', ') : [];
          const toolCount = countMatch ? parseInt(countMatch[1], 10) : 0;

          toolServers.push({
            url: urlMatch[1],
            toolCount,
            toolNames,
            isOnline: toolCount > 0,
            tools: toolNames.map(name => ({
              name,
              description: "Perform web search and provide summaries",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query to perform"
                  },
                  mode: {
                    type: "string",
                    description: "Response mode: 'summary' or 'detailed'",
                    enum: ["summary", "detailed"]
                  }
                },
                required: ["query"]
              }
            }))
          });
        }
      }
    }

    // If no detailed server info found, create from server_list
    if (toolServers.length === 0) {
      const serverList = serviceDetails.server_list;
      if (serverList && typeof serverList === 'string') {
        const servers = serverList.split(', ');
        servers.forEach((server: string) => {
          const cleanUrl = server.replace(/^\s+|\s+$/g, '');
          toolServers.push({
            url: cleanUrl,
            toolCount: 1,
            toolNames: ['Search Tool'],
            isOnline: true,
            tools: [{
              name: 'Web Search',
              description: "Perform web search and provide summaries",
              inputSchema: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The search query to perform"
                  }
                },
                required: ["query"]
              }
            }]
          });
        });
      }
    }

    return toolServers;
  };

  if (loading && !monitoringData && !error) {
    return (
    <div className="monitor-container" ref={monitorContainerRef}>
        <div className="monitor-header">
          <h1>System Monitoring</h1>
        </div>
        <div className="monitor-content">
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            Loading monitoring data...
          </div>
        </div>
      </div>
    );
  }

  if (error && !monitoringData) {
    return (
      <div className="monitor-container" ref={monitorContainerRef}>
        <div className="monitor-header">
          <h1>System Monitoring</h1>
        </div>
        <div className="monitor-content">
          <div className={styles.errorContainer}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2>Connection Error</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const formatStepIcon = (type: string) => {
    switch (type) {
      case "tool_call":
        return "🛠️";
      case "reasoning":
        return "💭";
      case "response":
        return "💬";
      default:
        return "📝";
    }
  };

  const formatStepType = (type: string) => {
    switch (type) {
      case "tool_call":
        return "Tool Call";
      case "reasoning":
        return "Reasoning";
      case "response":
        return "Response";
      default:
        return type;
    }
  };

  return (
    <div className="monitor-container" ref={monitorContainerRef}>
      <div className="monitor-header">
        <h1>System Monitoring</h1>
        <div className="last-updated">
          Last updated: {monitoringData?.timestamp ? new Date(monitoringData.timestamp).toLocaleString() : "N/A"}
        </div>
      </div>
      
      {/* Tab Navigation */}
      <div className={styles.tabContainer}>
        <div className={styles.tabNav}>
          <button
            className={`${styles.tabButton} ${activeTab === "general" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("general")}
          >
            General
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "agent" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("agent")}
          >
            Agent Loop
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === "log" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("log")}
          >
            Logs
          </button>
        </div>
      </div>
      
      {monitoringData && (
        <div className="monitor-content">
          {/* General Tab Content */}
          {activeTab === "general" && (
            <>
              {/* Overall System Status */}
              <div className="overall-status">
                <h2>Overall System Status</h2>
                <div className={`status-indicator ${getStatusColor(monitoringData.status)}`}>
                  <span className="status-dot"></span>
                  <span className="status-text">{monitoringData.status}</span>
                </div>
                <div className="system-info">
                  <p><strong>Service:</strong> {monitoringData.service_name}</p>
                  <p><strong>Version:</strong> {monitoringData.version}</p>
                </div>
              </div>
              
              {/* WebSocket Connection Status */}
              <div className="overall-status">
                <h2>WebSocket Connection</h2>
                <div className="connection-status">
                  {isConnected ? (
                    <span className="status-connected">
                      ● Connected {isRegistered ? "(Registered)" : "(Not Registered)"}
                    </span>
                  ) : (
                    <span className="status-disconnected">● Disconnected</span>
                  )}
                </div>
              </div>
          
          {/* System Metrics */}
          {monitoringData.metrics && (
            <div className="metrics-section">
              <h2>System Metrics</h2>
              <div className="metrics-grid">
                {monitoringData.metrics.cpu_usage !== undefined && (
                  <div className="metric-card">
                    <h3>CPU Usage</h3>
                    <div className="metric-value">{monitoringData.metrics.cpu_usage.toFixed(1)}%</div>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ width: `${Math.min(monitoringData.metrics.cpu_usage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {monitoringData.metrics.memory_usage !== undefined && (
                  <div className="metric-card">
                    <h3>Memory Usage</h3>
                    <div className="metric-value">{monitoringData.metrics.memory_usage.toFixed(1)}%</div>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ width: `${Math.min(monitoringData.metrics.memory_usage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {monitoringData.metrics.disk_usage !== undefined && (
                  <div className="metric-card">
                    <h3>Disk Usage</h3>
                    <div className="metric-value">{monitoringData.metrics.disk_usage.toFixed(1)}%</div>
                    <div className="metric-bar">
                      <div 
                        className="metric-fill" 
                        style={{ width: `${Math.min(monitoringData.metrics.disk_usage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
                
                {monitoringData.metrics.uptime && (
                  <div className="metric-card">
                    <h3>Uptime</h3>
                    <div className="metric-value">{formatUptime(monitoringData.metrics.uptime)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Services Status */}
          {monitoringData.services && monitoringData.services.length > 0 && (
            <div className="services-section">
              <h2>Services Status</h2>
              <div className="services-grid">
                {monitoringData.services
                  .filter(service => service.name !== "Tool Discovery Service" && service.name !== "MCP Services Summary")
                  .map((service, index) => (
                    <ServiceCard key={index} service={service} />
                  ))}
              </div>
            </div>
          )}
          
          {/* MCP Servers Section */}
          {monitoringData.services && monitoringData.services.some(service => service.name === "MCP Services Summary") && (
            <div className="services-section">
              {monitoringData.services
                .filter(service => service.name === "MCP Services Summary")
                .map((summaryService, summaryIndex) => (
                  <div key={summaryIndex}>
                    <h2>MCP Servers</h2>
                    <div className="service-card" style={{ marginBottom: "20px" }}>
                      <div className="service-header">
                        <h3>{summaryService.name}</h3>
                      </div>
                      <div className="service-details">
                        <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
                          {summaryService.details && summaryService.details.active_mcp_servers && (
                            <div><strong>Active Servers:</strong> {summaryService.details.active_mcp_servers}</div>
                          )}
                          {summaryService.details && summaryService.details.total_tools && (
                            <div><strong>Total Tools:</strong> {summaryService.details.total_tools}</div>
                          )}
                        </div>
                      </div>
                      <div className="service-footer">
                        Last updated: {new Date(summaryService.last_updated).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              
              {/* Individual MCP Server Entries with Tools */}
              <div className="services-grid">
                {monitoringData.services
                  .filter(service => service.name !== "MCP Services Summary" && service.details && service.details.type === "MCP Server")
                  .map((service, index) => (
                    <MCPServiceCard key={index} service={service} showStatus={false} />
                  ))}
              </div>
            </div>
          )}
          
          </>
          )}

          {/* Agent Loop Tab Content */}
          {activeTab === "agent" && (
            <div className="services-section">
              <h2>Agent Loop</h2>
              {agentLoopLoading ? (
                <div className={styles.loadingContainer}>
                  <div className={styles.spinner}></div>
                  Loading agent loop data...
                </div>
              ) : agentLoopData && agentLoopData.exists ? (
                <div className={styles.agentLoopContainer}>
                  <div className={styles.agentLoopHeader}>
                    <h3>Last Agent Loop</h3>
                    <div className={styles.agentLoopMeta}>
                      <span><strong>User:</strong> {agentLoopData.user_id}</span>
                      <span><strong>Started:</strong> {new Date(agentLoopData.start_time).toLocaleString()}</span>
                      <span><strong>Completed:</strong> {agentLoopData.completed ? "Yes" : "No"}</span>
                      {agentLoopData.duration_seconds !== undefined && (
                        <span><strong>Duration:</strong> {agentLoopData.duration_seconds.toFixed(2)} seconds</span>
                      )}
                    </div>
                  </div>

                  <div className={styles.userMessage}>
                    <strong>User Message:</strong> {agentLoopData.user_message}
                  </div>

                  <div className={styles.stepsContainer}>
                    <h4>Steps:</h4>
                    <div className={styles.stepsTimeline}>
                      {agentLoopData.steps.map((step, index) => (
                        <div key={index} className={styles.stepCard}>
                          <div className={styles.stepHeader}>
                            <span className={styles.stepIcon}>{formatStepIcon(step.type)}</span>
                            <span className={styles.stepNumber}>Step {step.step_number}</span>
                            <span className={styles.stepType}>{formatStepType(step.type)}</span>
                          </div>
                          
                          <div className={styles.stepReasoning}>
                            <strong>Reasoning:</strong> {step.reasoning}
                          </div>

                          {step.type === "tool_call" && (
                            <div className={styles.toolDetails}>
                              <div><strong>Tool:</strong> {step.tool_name}</div>
                              {step.tool_parameters && Object.keys(step.tool_parameters).length > 0 && (
                                <div><strong>Parameters:</strong> {JSON.stringify(step.tool_parameters, null, 2)}</div>
                              )}
                              {step.tool_result && (
                                <div><strong>Result:</strong> {JSON.stringify(step.tool_result, null, 2)}</div>
                              )}
                            </div>
                          )}

                          <div className={styles.stepTimestamp}>
                            {new Date(step.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {agentLoopData.completed && (
                    <div className={styles.finalResponse}>
                      <h4>Final Response:</h4>
                      <div className={styles.responseText}>{agentLoopData.final_response}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.noAgentLoop}>
                  <div className={styles.noAgentLoopIcon}>🤖</div>
                  <h3>No Agent Loops Yet</h3>
                  <p>Send a message in the chat to see the agent loop in action!</p>
                </div>
              )}
            </div>
          )}

          {/* Log Tab Content */}
          {activeTab === "log" && (
            <div className="services-section">
              <h2>System Logs</h2>
              <div className={styles.logControls}>
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className={styles.logFilter}
                >
                  <option value="all">All Events</option>
                  <option value="chat_sent">Chat Sent</option>
                  <option value="chat_response">Chat Response</option>
                  <option value="tts_response">TTS Response</option>
                  <option value="info">Info</option>
                  <option value="error">Error</option>
                </select>
                <button className={styles.clearButton} onClick={clearLogs}>
                  Clear Logs
                </button>
              </div>
              
              <div className={styles.logContent}>
                {logs.length === 0 ? (
                  <div className={styles.logEmpty}>
                    <p>No log entries yet. Events will appear here as they occur.</p>
                  </div>
                ) : (
                  <div className={styles.logEntries}>
                    {logs.map((log) => (
                      <div key={log.id} className={`${styles.logEntry} ${styles[getLogTypeClass(log.type)]}`}>
                        <div className={styles.logTimestamp}>
                          {formatTimestamp(log.timestamp)}
                        </div>
                        <div className={styles.logIcon}>
                          {getLogIcon(log.type)}
                        </div>
                        <div className={styles.logMessage}>
                          <div className={styles.logMessageText}>{log.message}</div>
                          {log.details && (
                            <div className={styles.logDetails}>
                              {typeof log.details === "object"
                                ? JSON.stringify(log.details, null, 2)
                                : log.details}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Monitor;