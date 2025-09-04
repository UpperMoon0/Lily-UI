import React, { useState, useEffect } from "react";
import styles from "./Monitor.module.css";
import ServiceCard from "./ServiceCard";
import MCPServiceCard from "./MCPServiceCard";

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
  steps: AgentStep[];
  message?: string;
}

const Monitor: React.FC = () => {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [agentLoopData, setAgentLoopData] = useState<AgentLoop | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [agentLoopLoading, setAgentLoopLoading] = useState<boolean>(true);

  const fetchMonitoringData = async () => {
    setLoading(true); 
    try {
      const response = await fetch("http://localhost:8000/monitoring");
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: MonitoringData = await response.json();
      setMonitoringData(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching monitoring data:", err);
      setError("Failed to connect to Lily-Core. Retrying automatically...");
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentLoopData = async () => {
    setAgentLoopLoading(true);
    try {
      const response = await fetch("http://localhost:8000/agent-loops");
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: AgentLoop = await response.json();
      setAgentLoopData(data);
    } catch (err) {
      console.error("Error fetching agent loop data:", err);
      // Don't set error for agent loop to avoid blocking the main monitoring
    } finally {
      setAgentLoopLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
    fetchAgentLoopData();
    const intervalId = setInterval(fetchMonitoringData, 5000);
    const agentLoopIntervalId = setInterval(fetchAgentLoopData, 3000);
    return () => {
      clearInterval(intervalId);
      clearInterval(agentLoopIntervalId);
    };
  }, []);

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
      <div className="monitor-container">
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
      <div className="monitor-container">
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
    <div className="monitor-container">
      <div className="monitor-header">
        <h1>System Monitoring</h1>
        <div className="last-updated">
          Last updated: {monitoringData?.timestamp ? new Date(monitoringData.timestamp).toLocaleString() : "N/A"}
        </div>
      </div>
      
      {monitoringData && (
        <div className="monitor-content">
          {/* Overall Status */}
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

          {/* Agent Loop Section */}
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
        </div>
      )}
    </div>
  );
};

export default Monitor;