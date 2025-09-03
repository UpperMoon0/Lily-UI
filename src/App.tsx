import React, { useState } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import Sidebar from "./components/Sidebar";
import Chat from "./components/Chat";
import Monitor from "./components/Monitor";
import Log from "./components/Log";

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

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
          <Route path="/log" element={<Log />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;