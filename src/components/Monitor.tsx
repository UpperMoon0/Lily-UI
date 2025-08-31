import React, { useState, useEffect } from "react";

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

  useEffect(() => {
    const fetchMonitoringData = async () => {
      try {
        setLoading(true);
        const response = await fetch("http://localhost:8000/monitoring");
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: MonitoringData = await response.json();
        setMonitoringData(data);
      } catch (err) {
        console.error("Error fetching monitoring data:", err);
        setError("Failed to fetch monitoring data. Please check if the Lily-Core service is running.");
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately on component mount
    fetchMonitoringData();
    
    // Set up interval to fetch every 5 seconds
    const intervalId = setInterval(fetchMonitoringData, 5000);
    
    // Clean up interval on component unmount
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
    
    // If it's already formatted, return as is
    if (uptime.includes(":")) return uptime;
    
    // If it's in seconds, convert to human readable format
    const seconds = parseInt(uptime, 10);
    if (isNaN(seconds)) return uptime;
    
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  };

  if (loading && !monitoringData) {
    return (
      <div className="monitor-container">
        <div className="monitor-header">
          <h1>System Monitoring</h1>
        </div>
        <div className="monitor-content">
          <div className="loading">Loading monitoring data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="monitor-container">
        <div className="monitor-header">
          <h1>System Monitoring</h1>
        </div>
        <div className="monitor-content">
          <div className="error-message">{error}</div>
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
                {monitoringData.services.map((service, index) => (
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
                              <strong>{key}:</strong> {String(value)}
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
        </div>
      )}
    </div>
  );
};

export default Monitor;