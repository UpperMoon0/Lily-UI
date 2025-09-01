import React, { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface TTSParameters {
  speaker: number;
  sample_rate: number;
  model: string;
  lang: string;
}

const Chat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsParams, setTtsParams] = useState<TTSParameters>({
    speaker: 0,
    sample_rate: 24000,
    model: "edge",
    lang: "en-US"
  });
  const [showTtsSettings, setShowTtsSettings] = useState(false);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation history on component mount
  useEffect(() => {
    loadConversationHistory();
  }, []);

  const loadConversationHistory = async () => {
    try {
      const response = await fetch("http://localhost:8000/conversation/default_user");
      
      if (response.ok) {
        const data = await response.json();
        const historyMessages = data.conversation.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        }));
        setMessages(historyMessages);
      }
    } catch (error) {
      console.error("Error loading conversation history:", error);
    }
  };

  // Send message to Lily-Core API
  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Add user message to UI
    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Prepare request body with TTS parameters if enabled
      const requestBody: any = {
        message: inputValue,
        user_id: "default_user",
      };

      if (ttsEnabled) {
        requestBody.tts = {
          enabled: true,
          params: ttsParams
        };
      }

      // Send message to Lily-Core API
      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add assistant message to UI
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      
      // Add error message to UI
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  // Handle Enter key press (without Shift)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Clear conversation
  const clearConversation = async () => {
    try {
      const response = await fetch("http://localhost:8000/conversation/default_user", {
        method: "DELETE",
      });
      
      if (response.ok) {
        setMessages([]);
      }
    } catch (error) {
      console.error("Error clearing conversation:", error);
    }
  };

  // Handle TTS parameter changes
  const handleTtsParamChange = (param: keyof TTSParameters, value: string | number) => {
    setTtsParams(prev => ({
      ...prev,
      [param]: value
    }));
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-content">
          <h1>Chat</h1>
          <p>A dynamic and intuitive chat interface for seamless communication.</p>
        </div>
        <div className="header-controls">
          <button className="tts-toggle" onClick={() => setTtsEnabled(!ttsEnabled)}>
            TTS: {ttsEnabled ? "ON" : "OFF"}
          </button>
          <button className="tts-settings" onClick={() => setShowTtsSettings(!showTtsSettings)}>
            Settings
          </button>
          <button className="clear-button" onClick={clearConversation} disabled={messages.length === 0}>
            Clear Chat
          </button>
        </div>
      </div>
      
      {showTtsSettings && (
        <div className="tts-settings-panel">
          <h3>TTS Settings</h3>
          <div className="setting-group">
            <label>Speaker:</label>
            <select
              value={ttsParams.speaker}
              onChange={(e) => handleTtsParamChange('speaker', parseInt(e.target.value))}
            >
              <option value="0">Default Male Voice</option>
              <option value="1">Default Female Voice</option>
              <option value="2">Alternative Male Voice</option>
              <option value="3">Alternative Female Voice</option>
            </select>
          </div>
          
          <div className="setting-group">
            <label>Sample Rate:</label>
            <select
              value={ttsParams.sample_rate}
              onChange={(e) => handleTtsParamChange('sample_rate', parseInt(e.target.value))}
            >
              <option value="8000">8000 Hz</option>
              <option value="16000">16000 Hz</option>
              <option value="22050">22050 Hz</option>
              <option value="24000">24000 Hz</option>
              <option value="44100">44100 Hz</option>
              <option value="48000">48000 Hz</option>
            </select>
          </div>
          
          <div className="setting-group">
            <label>Model:</label>
            <select
              value={ttsParams.model}
              onChange={(e) => handleTtsParamChange('model', e.target.value)}
            >
              <option value="edge">Edge TTS</option>
              <option value="zonos">Zonos TTS</option>
            </select>
          </div>
          
          <div className="setting-group">
            <label>Language:</label>
            <select
              value={ttsParams.lang}
              onChange={(e) => handleTtsParamChange('lang', e.target.value)}
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="ja-JP">Japanese</option>
              <option value="zh-CN">Chinese</option>
            </select>
          </div>
        </div>
      )}
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h2>Welcome to Lily AI!</h2>
            <p>Ask me anything and I'll do my best to help you.</p>
            <div className="suggestion-prompts">
              <button onClick={() => setInputValue("What can you help me with?")}>
                What can you help me with?
              </button>
              <button onClick={() => setInputValue("Tell me a fun fact")}>
                Tell me a fun fact
              </button>
              <button onClick={() => setInputValue("How does web search work?")}>
                How does web search work?
              </button>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                <div className="message-text">{message.content}</div>
                <div className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="input-container" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here..."
            disabled={isLoading}
            rows={1}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="send-button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
              <path fill="none" d="M0 0h24v24H0z"/>
              <path d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default Chat;