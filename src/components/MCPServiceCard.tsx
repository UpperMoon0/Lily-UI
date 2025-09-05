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
            <h4 style={{ marginBottom: "10px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.1rem" }}>🛠️</span>
              Available Tools ({service.details.tool_count || service.details.tools.split("|").length})
            </h4>
            <div style={{
              backgroundColor: "var(--background-tertiary)",
              borderRadius: "12px",
              padding: "16px",
              border: "1px solid var(--border-color)",
              display: "grid",
              gap: "12px"
            }}>
              {service.details.tools.split("|").map((toolInfo: string, toolIndex: number) => {
                const parts = toolInfo.split(":");
                const name = parts[0] || "Unnamed Tool";
                const description = parts[1] || "";
                return (
                  <div key={toolIndex} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "12px",
                    backgroundColor: "var(--background-secondary)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--background-primary)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--background-secondary)";
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "8px",
                      backgroundColor: "var(--accent-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: "1.2rem", color: "white" }}>🔧</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{
                        color: "var(--text-primary)",
                        fontSize: "1rem",
                        display: "block",
                        marginBottom: "4px"
                      }}>
                        {name}
                      </strong>
                      <p style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.9rem",
                        margin: 0,
                        lineHeight: "1.4",
                        opacity: description ? 0.8 : 0.5
                      }}>
                        {description || "No description available"}
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