import React from "react";
import styles from "./Monitor.module.css";

interface ServiceStatus {
  name: string;
  status: string;
  details?: Record<string, any>;
  last_updated: string;
}

interface MCPServiceCardProps {
  service: ServiceStatus;
  showStatus?: boolean;
}

const MCPServiceCard: React.FC<MCPServiceCardProps> = ({ service, showStatus = true }) => {
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

  return (
    <div className="service-card">
      <div className="service-header">
        <h3>{service.name}</h3>
        {showStatus && (
          <div className={`status-indicator ${getStatusColor(service.status)}`}>
            <span className="status-dot"></span>
            <span className="status-text">{service.status}</span>
          </div>
        )}
      </div>
      <div className="service-details">
        {service.details && Object.keys(service.details).length > 0 ? (
          <ul>
            {Object.entries(service.details)
              .filter(([key, value]) => key !== "tools") // Filter out tools for now, we'll display them separately
              .map(([key, value]) => (
                <li key={key}>
                  <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {String(value)}
                </li>
              ))}
          </ul>
        ) : (
          <p>No additional details</p>
        )}
        
        {/* Tools section */}
        {service.details && service.details.tools && (
          <div style={{ marginTop: "15px" }}>
            <h4 style={{ marginBottom: "10px", color: "var(--text-primary)" }}>Available Tools</h4>
            <div style={{
              backgroundColor: "var(--background-tertiary)",
              borderRadius: "8px",
              padding: "12px",
              border: "1px solid var(--border-color)"
            }}>
              {service.details.tools.split("|").map((toolInfo, toolIndex) => {
                const [name, description] = toolInfo.split(":");
                return (
                  <div key={toolIndex} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    marginBottom: toolIndex === service.details.tools.split("|").length - 1 ? "0" : "10px"
                  }}>
                    <span style={{ fontSize: "1.2rem", marginRight: "8px" }}>🔧</span>
                    <div>
                      <strong style={{ color: "var(--text-primary)" }}>{name}</strong>
                      <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "2px 0 0 0" }}>
                        {description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="service-footer">
        Last updated: {new Date(service.last_updated).toLocaleString()}
      </div>
    </div>
  );
};

export default MCPServiceCard;