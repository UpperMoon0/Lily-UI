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
  const conversationModeRef = useRef(conversationMode);
  
  // Keep the ref updated with the current state
  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);
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
      logService.logInfo("Conversation mode deactivated", {
        timestamp: new Date().toISOString(),
        reason: "User toggled conversation mode off"
      });
      
      if (mediaRecorder) {
        try {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
          // Stop all tracks in the stream to release microphone
          const tracks = mediaRecorder.stream.getTracks();
          tracks.forEach(track => {
            try {
              track.stop();
            } catch (error) {
              console.warn("Error stopping track:", error);
            }
          });
        } catch (error) {
          console.warn("Error stopping media recorder:", error);
        }
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
        // Check if audio context is already closed before trying to close it
        if (audioContextRef.current.state !== 'closed') {
          try {
            await audioContextRef.current.close();
          } catch (error) {
            console.warn("Error closing audio context:", error);
          }
        }
        audioContextRef.current = null;
      }
    } else {
      // Start recording
      logService.logInfo("Attempting to activate conversation mode", {
        timestamp: new Date().toISOString(),
        reason: "User toggled conversation mode on"
      });
      
      try {
        // Check WebSocket connection before starting recording
        const connected = webSocketService.getIsConnected();
        const registered = webSocketService.getIsRegistered();
        
        logService.logInfo("WebSocket connection status check", {
          connected,
          registered,
          timestamp: new Date().toISOString()
        });
        
        if (!connected || !registered) {
          const errorMsg = "WebSocket not connected or registered, cannot start conversation mode";
          console.warn(errorMsg);
          logService.logError(errorMsg, {
            connected,
            registered,
            timestamp: new Date().toISOString()
          });
          alert("WebSocket connection is not available. Please make sure the backend services are running.");
          return;
        }
        
        const constraints = inputDeviceId
          ? { audio: { deviceId: inputDeviceId } }
          : { audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        logService.logInfo("Microphone access granted", {
          constraints,
          timestamp: new Date().toISOString()
        });
        
        // Use the same stream for both recording and analysis
        // This ensures consistency and avoids potential issues with cloned streams
        const analysisStream = stream;
        
        // Set conversation mode to true before creating the recorder
        // This ensures that when ondataavailable fires, conversationMode is already true
        setConversationMode(true);
        
        logService.logInfo("Conversation mode activated", {
          timestamp: new Date().toISOString()
        });
        
        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            setAudioChunks((prev) => [...prev, event.data]);
            // Send audio chunk via WebSocket
            sendAudioChunk(event.data);
          }
        };
        
        recorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop());
        };
        
        setMediaRecorder(recorder);
        recorder.start(1000); // Capture chunks every second
        
        logService.logInfo("MediaRecorder started", {
          mimeType: 'audio/webm',
          timestamp: new Date().toISOString()
        });
        
        recorder.onerror = (event) => {
          const errorMsg = "MediaRecorder error event";
          console.error(errorMsg, event);
          logService.logError(errorMsg, {
            event,
            timestamp: new Date().toISOString()
          });
        };
        
        // Set up audio analysis for visual feedback
        setupAudioAnalysis(analysisStream);
        
        // Set up periodic WebSocket connection check during recording
        const connectionCheckInterval = setInterval(() => {
          const connected = webSocketService.getIsConnected();
          const registered = webSocketService.getIsRegistered();
          if (!connected || !registered) {
            const warnMsg = "WebSocket connection lost during recording, stopping conversation mode";
            console.warn(warnMsg);
            logService.logError(warnMsg, {
              connected,
              registered,
              timestamp: new Date().toISOString()
            });
            // Stop recording if connection is lost
            toggleConversationMode();
          }
        }, 5000); // Check every 5 seconds
        
        // Clean up the interval when conversation mode is stopped
        const originalStop = recorder.stop.bind(recorder);
        recorder.stop = () => {
          clearInterval(connectionCheckInterval);
          return originalStop();
        };
      } catch (error) {
        const errorMsg = "Error accessing microphone";
        console.error(errorMsg, error);
        logService.logError(errorMsg, {
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
        alert("Microphone access denied. Please allow microphone permissions to use conversation mode.");
      }
    }
  };

  // Send audio chunk via WebSocket
  const sendAudioChunk = async (audioBlob: Blob) => {
    // Don't send audio chunks if conversation mode is off
    if (!conversationModeRef.current) {
      return;
    }
    
    logService.logInfo("Preparing to send audio chunk", {
      conversationMode: conversationModeRef.current,
      blobSize: audioBlob.size,
      timestamp: new Date().toISOString()
    });
    
    // Additional check for WebSocket connection before sending
    const connected = webSocketService.getIsConnected();
    const registered = webSocketService.getIsRegistered();
    
    logService.logInfo("WebSocket connection status before sending audio chunk", {
      connected,
      registered,
      timestamp: new Date().toISOString()
    });
    
    if (!connected || !registered) {
      const warnMsg = "WebSocket not connected or registered in sendAudioChunk, skipping audio chunk send";
      console.warn(warnMsg);
      logService.logError(warnMsg, {
        connected,
        registered,
        blobSize: audioBlob.size,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    try {
      // Check if WebSocket is actually connected and registered
      // Use the WebSocketService directly to get the most up-to-date status
      const connected = webSocketService.getIsConnected();
      const registered = webSocketService.getIsRegistered();
      
      if (!connected || !registered) {
        const warnMsg = "WebSocket not connected or registered, skipping audio chunk send";
        console.warn(warnMsg);
        logService.logError(warnMsg, {
          connected,
          registered,
          blobSize: audioBlob.size,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = new Uint8Array(arrayBuffer);
      
      logService.logInfo("Audio chunk converted to Uint8Array", {
        arrayBufferSize: arrayBuffer.byteLength,
        audioDataSize: audioData.length,
        timestamp: new Date().toISOString()
      });
      
      // Add a small delay to allow the WebSocket connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Final connection check before sending
      if (!webSocketService.getIsConnected() || !webSocketService.getIsRegistered()) {
        const warnMsg = "WebSocket disconnected just before sending. Aborting.";
        console.warn(warnMsg);
        logService.logError(warnMsg, {
          connected: webSocketService.getIsConnected(),
          registered: webSocketService.getIsRegistered(),
          audioDataSize: audioData.length,
          timestamp: new Date().toISOString()
        });
        return;
      }

      logService.logInfo("Sending audio chunk via WebSocket", {
        audioDataSize: audioData.length,
        timestamp: new Date().toISOString()
      });

      // Send via WebSocket using Rust backend
      await invoke('send_websocket_audio', { audioData: Array.from(audioData) });
      
      logService.logInfo("Audio chunk sent successfully via WebSocket", {
        audioDataSize: audioData.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const currentConnected = webSocketService.getIsConnected();
      const currentRegistered = webSocketService.getIsRegistered();
      const errorMsg = "Error sending audio chunk";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        connected: currentConnected,
        registered: currentRegistered,
        blobSize: audioBlob.size,
        timestamp: new Date().toISOString()
      });
      
      // Additional error handling - check if this is a WebSocket connection issue
      if (error instanceof Error && error.toString().includes("WebSocket not connected")) {
        const connErrorMsg = "WebSocket connection was lost during audio transmission";
        console.error(connErrorMsg);
        logService.logError(connErrorMsg, {
          timestamp: new Date().toISOString()
        });
        // We could try to reconnect here or notify the user
      }
    }
  };

  // Set up audio analysis for visual feedback
  const setupAudioAnalysis = (stream: MediaStream) => {
    try {
      logService.logInfo("Setting up audio analysis", {
        streamActive: stream?.active,
        timestamp: new Date().toISOString()
      });
      
      // Check if stream is valid
      if (!stream || !stream.active) {
        const errorMsg = "Invalid or inactive stream provided for audio analysis";
        console.error(errorMsg);
        logService.logError(errorMsg, {
          stream: !!stream,
          streamActive: stream?.active,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Create audio context and analyser
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContext();
      
      logService.logInfo("Audio context created", {
        state: audioContext.state,
        timestamp: new Date().toISOString()
      });
      
      // Ensure audio context is resumed (required for modern browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(error => {
          const errorMsg = "Failed to resume audio context";
          console.error(errorMsg, error);
          logService.logError(errorMsg, {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          });
        });
      }
      
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      logService.logInfo("Audio analyser and source created", {
        timestamp: new Date().toISOString()
      });
      
      // Connect nodes - IMPORTANT: Connect to both analyser AND destination
      // If we only connect to analyser, the audio won't play through speakers
      // If we don't connect to destination, we need to create a destination node
      source.connect(analyser);
      
      // Connect to destination to ensure proper audio flow (but be careful about feedback)
      // For microphone input, connecting to destination is generally safe
      analyser.connect(audioContext.destination);
      
      // Configure analyser
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8; // Add smoothing for better visualization
      const bufferLength = analyser.frequencyBinCount;
      
      const dataArray = new Uint8Array(bufferLength);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      logService.logInfo("Audio analysis setup complete, starting detection loop", {
        bufferLength,
        timestamp: new Date().toISOString()
      });
      
      // Start analysis
      const detectAudio = () => {
        if (!analyserRef.current || !audioContextRef.current) {
          return;
        }
        
        // Check if audio context is still valid
        if (audioContextRef.current.state === 'closed') {
          return;
        }
        
        analyserRef.current.getByteTimeDomainData(dataArray);
        
        // Calculate volume for time domain data (deviation from 128)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] - 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const volume = rms;

        // Set audio active state based on volume threshold
        const isActive = volume > 2;
        
        logService.logDebug(`Audio detected with volume: ${volume.toFixed(2)}`);

        // Log when audio activity changes
        if (isAudioActive !== isActive) {
          logService.logInfo("Audio activity changed", {
            active: isActive,
            volume: volume.toFixed(2),
            threshold: 2,
            timestamp: new Date().toISOString()
          });
        }
        
        setIsAudioActive(isActive);
        
        // Reset activity timeout
        if (activityTimeoutRef.current) {
          clearTimeout(activityTimeoutRef.current);
        }
        
        // Set timeout to turn off activity indicator after a short delay
        if (isActive) {
          activityTimeoutRef.current = setTimeout(() => {
            setIsAudioActive(false);
            logService.logInfo("Audio activity timeout", {
              timestamp: new Date().toISOString()
            });
          }, 500); // Show activity for at least 500ms
        }
        
        animationFrameRef.current = requestAnimationFrame(detectAudio);
      };
      
      // Start the audio detection loop
      animationFrameRef.current = requestAnimationFrame(detectAudio);
    } catch (error) {
      const errorMsg = "Error setting up audio analysis";
      console.error(errorMsg, error);
      logService.logError(errorMsg, {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
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