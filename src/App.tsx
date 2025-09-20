import React, { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Monitor from "./components/Monitor";
import webSocketService from "./services/WebSocketService";

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Initialize WebSocket connection when app starts
  useEffect(() => {
    console.log("App: Initializing WebSocket connection");
    // Connect to WebSocket server
    webSocketService.connect().catch(error => {
      console.error("App: Failed to connect to WebSocket:", error);
    });

    // Cleanup function to disconnect when app closes
    return () => {
      console.log("App: Disconnecting WebSocket");
      webSocketService.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      <div className="main-content">
        <div className="mobile-header">
          <button className="menu-button" onClick={toggleSidebar}>
            ☰
          </button>
          <h1>Lily</h1>
        </div>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/monitor" element={<Monitor />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;