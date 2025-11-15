import React from "react";

interface ServiceStatus {
  name: string;
  status: string;
  details?: Record<string, any>;
  last_updated: string;
}

interface ServiceCardProps {
  service: ServiceStatus;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
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
        <div className={`status-indicator ${getStatusColor(service.status)}`}>
          <span className="status-dot"></span>
          <span className="status-text">{service.status}</span>
        </div>
      </div>
      <div className="service-details">
        {service.details && Object.keys(service.details).length > 0 ? (
          <ul>
            {Object.entries(service.details)
              .filter(([key]) => key !== "tool_count") // Don't show tool count
              .map(([key, value]) => (
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
  );
};

export default ServiceCard;