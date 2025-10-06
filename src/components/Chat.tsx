import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";
import logService from "../services/LogService";
import persistenceService from "../services/PersistenceService";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface LiveTranscription {
  text: string;
  isInterim: boolean;
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
  const [, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [, setIsConnected] = useState(false);
  const [, setIsRegistered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Live transcription state
  const [liveTranscription, setLiveTranscription] = useState<LiveTranscription | null>(null);
  
  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsParams, setTtsParams] = useState<TTSParameters>({
    speaker: 0,
    sample_rate: 24000,
    model: "edge",
    lang: "en-US"
  });
  const [showTtsSettings, setShowTtsSettings] = useState(false);
  
  // Microphone permission state
  const [micPermission, setMicPermission] = useState<"granted" | "denied" | "prompt">("prompt");
  
  // Audio device state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState<string>('');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('');

  // Conversation mode state
  const [conversationMode, setConversationMode] = useState(false);
  const conversationModeRef = useRef(conversationMode);
  
  // Keep the ref updated with the current state
  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);

  const [isRecording, setIsRecording] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);


  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
        setIsPlaying(false);
      }
      // Clean up conversation mode
      if (isRecording) {
        invoke('stop_audio_recording').catch(error => {
          console.error("Error stopping audio recording on cleanup:", error);
        });
      }
    };
  }, [currentAudio, isRecording]);

  // Load conversation history and set up event listeners on component mount
  useEffect(() => {
    loadConversationHistory();
    loadPersistedData();

    // Set up event listeners for WebSocket binary data (audio) and status
    const unsubscribePromises: Promise<() => void>[] = [];

    // Listen for WebSocket binary events (audio data)
    const audioListenerPromise = listen('websocket-binary', (event: { payload: Uint8Array }) => {
      try {
        // Convert to standard Uint8Array to avoid type issues
        const audioData = new Uint8Array(event.payload);
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        
        // Set up audio event listeners
        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentAudio(audio);
        };
        
        audio.onended = () => {
          setIsPlaying(false);
          setCurrentAudio(null);
          URL.revokeObjectURL(audioUrl);
        };
        
        audio.onerror = (error) => {
          console.error("Audio playback error:", error);
          setIsPlaying(false);
          setCurrentAudio(null);
          URL.revokeObjectURL(audioUrl);
        };
        
        // Play the audio
        audio.play().catch(error => {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
          setCurrentAudio(null);
          URL.revokeObjectURL(audioUrl);
        });
        
        // Log TTS response received event
        logService.logTTSResponse({
          size: blob.size,
          type: blob.type
        });
      } catch (error) {
        console.error("Error processing audio data:", error);
      }
    }).then(unsubscribe => unsubscribe);

    unsubscribePromises.push(audioListenerPromise);

    // Listen for WebSocket status events
    const statusListenerPromise = listen('websocket-status', (event: { payload: { connected: boolean; registered: boolean } }) => {
      const status = event.payload;
      setIsConnected(status.connected);
      setIsRegistered(status.registered);
    }).then(unsubscribe => unsubscribe);

    unsubscribePromises.push(statusListenerPromise);

    // Listen for audio level events from Rust backend
    const audioLevelUnsubscribe = listen('audio-level', (event: { payload: number }) => {
      const rms = event.payload;
      const isActive = rms > 0.025; // Threshold for voice activity
      setIsAudioActive(isActive);
    }).then(unsubscribe => unsubscribe);

    unsubscribePromises.push(audioLevelUnsubscribe);

    // Listen for transcription events from Lily-Core
    const transcriptionUnsubscribe = listen('transcription', (event: { payload: string }) => {
      // Parse the transcription message (format: "transcription:{json}")
      const messageStr = event.payload;
      if (messageStr.startsWith('transcription:')) {
        try {
          const jsonStr = messageStr.substr(14); // Remove "transcription:" prefix
          const transcriptionData = JSON.parse(jsonStr);
          const { type, text } = transcriptionData;

          if (type === 'interim') {
            // Show interim transcription
            setLiveTranscription({
              text: text,
              isInterim: true,
              timestamp: new Date().toISOString()
            });
          } else if (type === 'final') {
            // Convert live transcription to final message and clear live transcription
            if (liveTranscription) {
              const userMessage: Message = {
                role: "user",
                content: text,
                timestamp: new Date().toISOString(),
              };

              setMessages((prev) => {
                const newMessages = [...prev, userMessage];
                // Save chat history whenever it changes
                persistenceService.saveChatHistory(newMessages);
                return newMessages;
              });

              // Clear live transcription
              setLiveTranscription(null);

              // Log chat sent event
              logService.logChatSent(text);
            }
          }
        } catch (error) {
          console.error("Error parsing transcription message:", error);
        }
      }
    }).then(unsubscribe => unsubscribe);

    unsubscribePromises.push(transcriptionUnsubscribe);

    // Fetch initial WebSocket status from the backend
    const fetchWebSocketStatus = async () => {
      try {
        const status = await invoke<{ connected: boolean; registered: boolean }>('get_websocket_status');
        setIsConnected(status.connected);
        setIsRegistered(status.registered);
      } catch (error) {
        console.error("Error fetching WebSocket status:", error);
      }
    };

    fetchWebSocketStatus();

    return () => {
      // Clean up event listeners
      Promise.all(unsubscribePromises).then(unsubscribeFunctions => {
        unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
      });
    };
  }, []);

  // Enumerate audio devices on component mount
  useEffect(() => {
    enumerateAudioDevices();
    checkMicrophonePermission();
  }, []);

  const loadConversationHistory = async () => {
    try {
      const historyMessages = await invoke<Message[]>('get_conversation_history');
      setMessages(historyMessages);
    } catch (error) {
      console.error("Error loading conversation history:", error);
      // If backend is unavailable, fall back to local chat history
      try {
        const localHistory = await persistenceService.loadChatHistory();
        if (localHistory.length > 0) {
          setMessages(localHistory);
        }
      } catch (localError) {
        console.error("Failed to load local chat history:", localError);
      }
    }
  };

  // Load persisted data (TTS settings and chat history)
  const loadPersistedData = async () => {
    try {
      // Load all settings
      const savedSettings = await persistenceService.loadSettings();
      if (savedSettings) {
        // Load TTS settings
        setTtsEnabled(savedSettings.ttsEnabled);
        setTtsParams(savedSettings.ttsParams);
        
        // Load audio device settings
        if (savedSettings.inputDeviceId) {
          setInputDeviceId(savedSettings.inputDeviceId);
        }
        if (savedSettings.outputDeviceId) {
          setOutputDeviceId(savedSettings.outputDeviceId);
        }
      }
      
      // Load chat history
      const savedHistory = await persistenceService.loadChatHistory();
      if (savedHistory.length > 0) {
        setMessages(savedHistory);
      }
    } catch (error) {
      console.error("Error loading persisted data:", error);
    }
  };

  
    // Enumerate audio devices
    const enumerateAudioDevices = async () => {
      try {
        // Request permissions if needed
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device =>
          device.kind === 'audioinput' || device.kind === 'audiooutput'
        );
        setAudioDevices(audioDevices);
        
        // Set default devices if not already set
        if (!inputDeviceId) {
          const defaultInput = audioDevices.find(device =>
            device.kind === 'audioinput' && device.deviceId === 'default'
          ) || audioDevices.find(device => device.kind === 'audioinput');
          if (defaultInput) {
            setInputDeviceId(defaultInput.deviceId);
          }
        }
        
        if (!outputDeviceId) {
          const defaultOutput = audioDevices.find(device =>
            device.kind === 'audiooutput' && device.deviceId === 'default'
          ) || audioDevices.find(device => device.kind === 'audiooutput');
          if (defaultOutput) {
            setOutputDeviceId(defaultOutput.deviceId);
          }
        }
      } catch (error) {
        console.error("Error enumerating audio devices:", error);
      }
    };
  
    // Check microphone permission status
    const checkMicrophonePermission = async () => {
      try {
        if (navigator.permissions) {
          const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
          setMicPermission(permission.state);
          
          permission.onchange = () => {
            setMicPermission(permission.state);
          };
        }
      } catch (error) {
        console.warn("Microphone permission API not supported:", error);
      }
    };
  
    // Request microphone permission
    const requestMicrophonePermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicPermission("granted");
        // Stop the stream immediately as we only needed to request permission
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error("Error requesting microphone permission:", error);
        setMicPermission("denied");
      }
    };

  const toggleConversationMode = async () => {
    console.log("🎤 Toggle conversation mode - current recording state:", isRecording);

    if (isRecording) {
      console.log("Stopping Rust audio recording...");
      try {
        await invoke('stop_audio_recording');
        setIsRecording(false);
        setConversationMode(false);
        setIsAudioActive(false);
        console.log("Rust audio recording stopped");
      } catch (error) {
        console.error("Error stopping audio recording:", error);
      }
    } else {
      console.log("Starting Rust audio recording...");
      try {
        await invoke('start_audio_recording');
        setIsRecording(true);
        setConversationMode(true);
        console.log("Rust audio recording started");
      } catch (error) {
        console.error("Error starting audio recording:", error);
        setIsRecording(false);
        setConversationMode(false);
      }
    }
  };


  // Send message to Lily-Core API via Rust
  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    // Add user message to UI
    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => {
      const newMessages = [...prev, userMessage];
      // Save chat history whenever it changes
      persistenceService.saveChatHistory(newMessages);
      return newMessages;
    });
    
    // Log chat sent event
    logService.logChatSent(inputValue);
    setInputValue("");
    setIsLoading(true);

    try {
      // Send message via Rust command
      const invokeParams = {
        message: inputValue,
        ttsEnabled: ttsEnabled,
        ...(ttsEnabled ? { ttsParams: ttsParams } : {})
      };
      const data = await invoke<{ response: string; timestamp: string }>('send_chat_message', invokeParams);

      // Add assistant message to UI
      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: data.timestamp,
      };

      setMessages((prev) => {
        const newMessages = [...prev, assistantMessage];
        // Save chat history whenever it changes
        persistenceService.saveChatHistory(newMessages);
        return newMessages;
      });
      
      // Log chat response received event
      logService.logChatResponse(data.response, {
        timestamp: data.timestamp,
        user_id: "default_user"
      });
    } catch (error: unknown) {
      console.error("Error sending message:", error);
      
      let errorContent = "Sorry, I encountered an error while processing your request. Please try again.";
      
      // Check if it's a backend connectivity issue
      if (error instanceof Error && (error.toString().includes("404") || error.toString().includes("Failed to send request"))) {
        errorContent = "Backend service is unavailable. Please make sure Lily-Core is running on localhost:8000.";
      } else if (error instanceof Error && error.toString().includes("ttsEnabled")) {
        // Handle parameter serialization issues
        errorContent = "Configuration error. Please check your TTS settings and try again.";
      }
      
      // Add error message to UI
      const errorMessage: Message = {
        role: "assistant",
        content: errorContent,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        const newMessages = [...prev, errorMessage];
        // Save chat history whenever it changes
        persistenceService.saveChatHistory(newMessages);
        return newMessages;
      });
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

  // Clear conversation via Rust
  const clearConversation = async () => {
    try {
      await invoke('clear_conversation');
      setMessages([]);
      // Clear persisted chat history
      persistenceService.clearChatHistory();
      // Stop any playing audio
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Error clearing conversation:", error);
    }
  };

  // Handle TTS parameter changes
  const handleTtsParamChange = (param: keyof TTSParameters, value: string | number) => {
    const newParams = {
      ...ttsParams,
      [param]: value
    };
    setTtsParams(newParams);
    
    // Save all settings whenever they change
    persistenceService.saveSettings(newParams, ttsEnabled, inputDeviceId, outputDeviceId).catch(error => {
      console.error("Failed to save settings:", error);
    });
  };

  // Handle input device change
  const handleInputDeviceChange = (deviceId: string) => {
    setInputDeviceId(deviceId);
    
    // Save all settings whenever they change
    persistenceService.saveSettings(ttsParams, ttsEnabled, deviceId, outputDeviceId).catch(error => {
      console.error("Failed to save settings:", error);
    });
  };

  // Handle output device change
  const handleOutputDeviceChange = (deviceId: string) => {
    setOutputDeviceId(deviceId);
    
    // Save all settings whenever they change
    persistenceService.saveSettings(ttsParams, ttsEnabled, inputDeviceId, deviceId).catch(error => {
      console.error("Failed to save settings:", error);
    });
  };

  // Handle TTS enabled toggle
  const handleTtsToggle = () => {
    const newEnabled = !ttsEnabled;
    setTtsEnabled(newEnabled);
    
    // Save all settings whenever they change
    persistenceService.saveSettings(ttsParams, newEnabled, inputDeviceId, outputDeviceId).catch(error => {
      console.error("Failed to save settings:", error);
    });
  };
  // Handle settings panel toggle
  const toggleSettingsPanel = async () => {
    const newShowSettings = !showTtsSettings;
    setShowTtsSettings(newShowSettings);
    
    // Enumerate audio devices when opening the settings panel
    if (newShowSettings) {
      await enumerateAudioDevices();
      await checkMicrophonePermission();
    }
  };

  // Handle microphone permission toggle
  const handleMicPermissionToggle = async () => {
    if (micPermission === "granted") {
      // We can't revoke permission programmatically, but we can update our state
      // to reflect that the user wants to disable mic access
      setMicPermission("denied");
    } else {
      await requestMicrophonePermission();
    }
  };

  return (
    <div className="chat-container">
      {showTtsSettings ? (
        // Settings view as full window
        <div className="settings-view">
          <div className="settings-header">
            <h1>Settings</h1>
            <button className="back-button" onClick={toggleSettingsPanel}>
              ← Back to Chat
            </button>
          </div>
          <div className="settings-content">
            <div className="setting-group">
              <div className="setting-row">
                <label>Microphone Access</label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    id="mic-toggle"
                    checked={micPermission === "granted"}
                    onChange={handleMicPermissionToggle}
                  />
                  <label htmlFor="mic-toggle" className="toggle-label">
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <p className="setting-description">
                {micPermission === "granted"
                  ? "Microphone access is enabled"
                  : micPermission === "denied"
                  ? "Microphone access is denied. Enable to use voice features."
                  : "Microphone access is not yet granted. Enable to use voice features."}
              </p>
            </div>
            
            <div className="setting-group">
              <div className="setting-row">
                <label>TTS (Text-to-Speech)</label>
                <div className="toggle-switch">
                  <input
                    type="checkbox"
                    id="tts-toggle"
                    checked={ttsEnabled}
                    onChange={handleTtsToggle}
                  />
                  <label htmlFor="tts-toggle" className="toggle-label">
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
            
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
            
            {/* Audio Device Settings */}
            <h3>Audio Device Settings</h3>
            <div className="setting-group">
              <label>Input Device:</label>
              <select
                value={inputDeviceId}
                onChange={(e) => handleInputDeviceChange(e.target.value)}
              >
                {audioDevices
                  .filter(device => device.kind === 'audioinput')
                  .map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId}`}
                    </option>
                  ))}
              </select>
            </div>
            
            <div className="setting-group">
              <label>Output Device:</label>
              <select
                value={outputDeviceId}
                onChange={(e) => handleOutputDeviceChange(e.target.value)}
              >
                {audioDevices
                  .filter(device => device.kind === 'audiooutput')
                  .map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${device.deviceId}`}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      ) : (
        // Chat view
        <>
          <div className="chat-header">
            <div className="header-content">
              <h1>Chat</h1>
              <p>A dynamic and intuitive chat interface for seamless communication.</p>
            </div>
            <div className="header-controls">
              <button className="tts-toggle" onClick={handleTtsToggle}>
                TTS: {ttsEnabled ? "ON" : "OFF"}
              </button>
              <button className="tts-settings" onClick={toggleSettingsPanel}>
                Settings
              </button>
              <button className="clear-button" onClick={clearConversation} disabled={messages.length === 0}>
                Clear Chat
              </button>
            </div>
          </div>
      
      {/* Audio activity indicator */}
      {conversationMode && (
        <div className="audio-activity-indicator">
          <div className={`activity-light ${isAudioActive ? 'active' : ''}`}></div>
          <span className="activity-label">
            {isAudioActive ? 'Audio detected' : 'Listening...'}
          </span>
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

        {/* Live transcription display */}
        {liveTranscription && (
          <div className="message user live-transcription">
            <div className="message-content">
              <div className={`message-text ${liveTranscription.isInterim ? 'interim' : ''}`}>
                {liveTranscription.text}
                {liveTranscription.isInterim && <span className="transcription-cursor">|</span>}
              </div>
              <div className="message-time">
                {liveTranscription.isInterim ? 'Listening...' : 'Processing...'}
              </div>
            </div>
          </div>
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
            type="button"
            className={`mic-button ${conversationMode ? 'active' : ''}`}
            onClick={toggleConversationMode}
          >
            🎤
          </button>
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
        </>
      )}
    </div>
  );
};

export default Chat;