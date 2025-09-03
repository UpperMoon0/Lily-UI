import React from "react";
import { Link, useLocation } from "react-router-dom";

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar }) => {
  const location = useLocation();

  return (
    <>
      {/* Sidebar overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
      
      {/* Sidebar */}
      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h2>Lily</h2>
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            ×
          </button>
        </div>
        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-text">Chat</span>
          </Link>
          <Link
            to="/monitor"
            className={`nav-link ${location.pathname === "/monitor" ? "active" : ""}`}
            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Monitor</span>
          </Link>
          <Link
            to="/log"
            className={`nav-link ${location.pathname === "/log" ? "active" : ""}`}
            onClick={() => window.innerWidth <= 768 && toggleSidebar()}
          >
            <span className="nav-icon">📝</span>
            <span className="nav-text">Log</span>
          </Link>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;