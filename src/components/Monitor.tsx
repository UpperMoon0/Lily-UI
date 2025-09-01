import React, { useState, useEffect } from "react";
import styles from "./Monitor.module.css";

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

const Monitor: React.FC = () => {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchMonitoringData();
    const intervalId = setInterval(fetchMonitoringData, 5000);
    return () => clearInterval(intervalId);
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
                  .filter(service => service.name !== "Tool Discovery Service")
                  .map((service, index) => (
                    <div key={index} className="service-card">
                      <div className="service-header">
                        <h3>{service.name}</h3>
                        <div className={`status-indicator ${getStatusColor(service.status)}`}>
                          <span className="status-dot"></span>
                          <span className="status-text">{service.status}</span>
                        </div>
                      </div>
                      <div className="service-details">
                        {service.details && Object.keys(service.details).length > 0 ? (
                          <ul>
                            {Object.entries(service.details).map(([key, value]) => (
                              <li key={key}>
                                <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {String(value)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No additional details</p>
                        )}
                      </div>
                      <div className="service-footer">
                        Last updated: {new Date(service.last_updated).toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Modern Tools Servers and Tools Section */}
          {monitoringData.services && monitoringData.services.some(service => service.name === "Tool Discovery Service") && (
            <div className="services-section">
              <h2>Tool Discovery Service</h2>
              {monitoringData.services
                .filter(service => service.name === "Tool Discovery Service")
                .map((service, serviceIndex) => {
                  const toolServers = parseToolServersAndTools(service.details);

                  return (
                    <div key={serviceIndex} style={{ marginBottom: "30px" }}>
                      {/* Tool Discovery Service Header */}
                      <div className="service-card" style={{ marginBottom: "20px" }}>
                        <div className="service-header">
                          <h3>{service.name}</h3>
                          <div className={`status-indicator ${getStatusColor(service.status)}`}>
                            <span className="status-dot"></span>
                            <span className="status-text">{service.status}</span>
                          </div>
                        </div>
                        <div className="service-details">
                          <div style={{ display: "flex", gap: "20px", marginBottom: "10px" }}>
                            <div><strong>Active Servers:</strong> {toolServers.length}</div>
                            <div><strong>Total Tools:</strong> {toolServers.reduce((sum, server) => sum + server.toolCount, 0)}</div>
                          </div>
                        </div>
                        <div className="service-footer">
                          Last updated: {new Date(service.last_updated).toLocaleString()}
                        </div>
                      </div>

                      {/* Tool Servers Grid */}
                      {toolServers.length > 0 && (
                        <div style={{ marginTop: "20px" }}>
                          <h3 style={{ marginBottom: "15px", color: "var(--text-primary)" }}>Connected Tool Servers</h3>
                          <div className="services-grid">
                            {toolServers.map((server, serverIndex) => (
                              <div key={serverIndex} className="service-card" style={{ borderLeft: server.isOnline ? '4px solid var(--success-color)' : '4px solid var(--error-color)' }}>
                                <div className="service-header">
                                  <h4 style={{ margin: "0", fontSize: "1rem" }}>🔗 Tool Server</h4>
                                  <div className={`status-indicator ${getStatusColor(server.isOnline ? "healthy" : "down")}`}>
                                    <span className="status-dot"></span>
                                    <span className="status-text">{server.isOnline ? "Online" : "Offline"}</span>
                                  </div>
                                </div>
                                <div className="service-details">
                                  <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "10px" }}>
                                    <strong>URL:</strong> {server.url}
                                  </p>
                                  <p style={{ marginBottom: "15px" }}>
                                    <strong>Tools:</strong> {server.toolCount}
                                  </p>

                                  {/* Tools within this server */}
                                  <div>
                                    <strong>Available Tools:</strong>
                                    <div style={{ marginTop: "10px" }}>
                                      {server.tools.map((tool, toolIndex) => (
                                        <div key={toolIndex} style={{
                                          backgroundColor: "var(--background-tertiary)",
                                          borderRadius: "8px",
                                          padding: "12px",
                                          marginBottom: "8px",
                                          border: "1px solid var(--border-color)"
                                        }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}>
                                                <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>🔧</span>
                                                <strong style={{ color: "var(--text-primary)" }}>{tool.name}</strong>
                                              </div>
                                              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "4px 0" }}>
                                                {tool.description}
                                              </p>
                                              {tool.inputSchema && tool.inputSchema.properties && (
                                                <div style={{ marginTop: "8px" }}>
                                                  <strong style={{ fontSize: "0.8rem", color: "var(--accent-color)" }}>Parameters:</strong>
                                                  <ul style={{ margin: "4px 0 0 16px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                                                    {Object.entries(tool.inputSchema.properties).map(([paramName, paramDetails]: [string, any]) => (
                                                      <li key={paramName}>
                                                        <code>{paramName}</code>
                                                        {paramDetails.description && ` - ${paramDetails.description}`}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Monitor;