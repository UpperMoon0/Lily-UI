import React, { useState, useRef, useEffect } from "react";
import "./Chat.css";
import logService from "../services/LogService";
import persistenceService from "../services/PersistenceService";
import webSocketService from "../services/WebSocketService";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
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
  
  // Audio device state
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputDeviceId, setInputDeviceId] = useState<string>('');
  const [outputDeviceId, setOutputDeviceId] = useState<string>('');

  // Conversation mode state
  const [conversationMode, setConversationMode] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      // Clean up audio analysis
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [currentAudio, mediaRecorder]);

  // Load conversation history and set up event listeners on component mount
  useEffect(() => {
    loadConversationHistory();
    loadPersistedData();

    // Set up event listeners for WebSocket binary data (audio) and status
    const unsubscribePromises: Promise<() => void>[] = [];

    // Listen for WebSocket binary events (audio data)
    const audioListenerPromise = listen('websocket-binary', (event: { payload: Uint8Array }) => {
      console.log("WebSocket binary event received, payload size:", event.payload.length);
      try {
        // Convert to standard Uint8Array to avoid type issues
        const audioData = new Uint8Array(event.payload);
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        
        // Set up audio event listeners
        audio.onplay = () => {
          console.log("Audio playback started");
          setIsPlaying(true);
          setCurrentAudio(audio);
        };
        
        audio.onended = () => {
          console.log("Audio playback ended");
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

    // Set initial connection status from WebSocket service
    setIsConnected(webSocketService.getIsConnected());
    setIsRegistered(webSocketService.getIsRegistered());

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

  // Handle conversation mode toggle
  const toggleConversationMode = async () => {
    if (conversationMode) {
      // Stop recording
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      setConversationMode(false);
      setMediaRecorder(null);
      setAudioChunks([]);
      setIsAudioActive(false);
      // Clean up audio analysis
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } else {
      // Start recording
      try {
        console.log("Requesting microphone access with constraints:", inputDeviceId ? { audio: { deviceId: inputDeviceId } } : { audio: true });
        const constraints = inputDeviceId
          ? { audio: { deviceId: inputDeviceId } }
          : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Microphone access granted, stream active:", stream.active);
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        console.log("MediaRecorder created with state:", recorder.state);
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            console.log("Audio data available, size:", event.data.size);
            setAudioChunks((prev) => [...prev, event.data]);
            // Send audio chunk via WebSocket
            sendAudioChunk(event.data);
          } else {
            console.log("Empty audio data chunk received");
          }
        };
        
        recorder.onstop = () => {
          console.log("MediaRecorder stopped");
          stream.getTracks().forEach(track => track.stop());
        };
        
        setMediaRecorder(recorder);
        setConversationMode(true);
        console.log("Starting MediaRecorder with 1000ms timeslice");
        recorder.start(1000); // Capture chunks every second
        console.log("MediaRecorder started with state:", recorder.state);
        
        // Set up audio analysis for visual feedback
        setupAudioAnalysis(stream);
      } catch (error) {
        console.error("Error accessing microphone:", error);
        alert("Microphone access denied. Please allow microphone permissions to use conversation mode.");
      }
    }
  };

  // Send audio chunk via WebSocket
  const sendAudioChunk = async (audioBlob: Blob) => {
    try {
      console.log("Preparing to send audio chunk, size:", audioBlob.size);
      console.log("WebSocket connection status - Connected:", isConnected, "Registered:", isRegistered);
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      console.log("Audio data converted, length:", audioData.length);
      
      // Send via WebSocket using Rust backend
      console.log("Invoking send_websocket_audio command");
      await invoke('send_websocket_audio', { audioData: Array.from(audioData) });
      console.log("Audio chunk sent successfully");
    } catch (error) {
      console.error("Error sending audio chunk:", error);
      console.error("WebSocket connection status - Connected:", isConnected, "Registered:", isRegistered);
    }
  };

  // Set up audio analysis for visual feedback
  const setupAudioAnalysis = (stream: MediaStream) => {
    try {
      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      // Start analysis
      const detectAudio = () => {
        if (!analyserRef.current) return;
        
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        console.log("Audio analysis - Average volume:", average);
        
        // Set audio active state based on volume threshold
        const isActive = average > 10; // Adjust threshold as needed
        console.log("Audio active state:", isActive);
        setIsAudioActive(isActive);
        
        // Reset activity timeout
        if (activityTimeoutRef.current) {
          clearTimeout(activityTimeoutRef.current);
        }
        
        // Set timeout to turn off activity indicator after a short delay
        if (isActive) {
          activityTimeoutRef.current = setTimeout(() => {
            setIsAudioActive(false);
          }, 500); // Show activity for at least 500ms
        }
        
        animationFrameRef.current = requestAnimationFrame(detectAudio);
      };
      
      animationFrameRef.current = requestAnimationFrame(detectAudio);
    } catch (error) {
      console.error("Error setting up audio analysis:", error);
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
    } catch (error: any) {
      console.error("Error sending message:", error);
      
      let errorContent = "Sorry, I encountered an error while processing your request. Please try again.";
      
      // Check if it's a backend connectivity issue
      if (error.toString().includes("404") || error.toString().includes("Failed to send request")) {
        errorContent = "Backend service is unavailable. Please make sure Lily-Core is running on localhost:8000.";
      } else if (error.toString().includes("ttsEnabled")) {
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
    }
  };

  return (
    <div className="chat-container">
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
      
      {/* Connection status indicator */}
      <div className="connection-status">
        {isConnected ? (
          <span className="status-connected">
            ● Connected {isRegistered ? "(Registered)" : "(Not Registered)"}
          </span>
        ) : (
          <span className="status-disconnected">● Disconnected</span>
        )}
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
    </div>
  );
};

export default Chat;