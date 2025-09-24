# Audio Chat Feature - High-Level Design Document

## Overview

This document outlines the high-level design for the audio chat feature in Lily UI, which enables users to have voice conversations with the AI assistant. The feature includes both speech-to-text (STT) for user input and text-to-speech (TTS) for assistant responses.

## System Architecture

The audio chat feature is built on a distributed microservices architecture with the following components:

### Core Components

1. **Lily-UI (Frontend)**
   - React-based desktop application using Tauri framework
   - Handles user interface, audio capture, and playback
   - Communicates with Lily-Core via Tauri commands and WebSocket

2. **Lily-Core (Backend)**
   - C++ application that orchestrates the conversation flow
   - Manages WebSocket connections with clients
   - Routes messages between services
   - Handles conversation memory and agent loop

3. **Echo (Speech-to-Text Service)**
   - Python service using OpenAI Whisper for speech recognition
   - Provides both HTTP and WebSocket APIs for audio transcription
   - Supports real-time streaming transcription

4. **TTS-Provider (Text-to-Speech Service)**
   - Python service providing multiple TTS engines (Edge TTS, Zonos)
   - WebSocket-based API for real-time audio generation
   - Supports multiple voices and languages

### Communication Flow

```
User → Lily-UI → WebSocket → Lily-Core → Echo (STT) → Lily-Core → Agent Loop → Lily-Core → TTS-Provider → Lily-Core → WebSocket → Lily-UI → User
```

## Feature Components

### 1. Audio Input (Speech-to-Text)

#### User Interface
- Microphone button in the chat interface
- Audio activity indicator showing when the user is speaking
- Conversation mode toggle for continuous voice interaction

#### Technical Implementation
- Uses MediaRecorder API to capture audio from the user's microphone
- Audio is captured in WebM format with Opus codec
- Audio chunks are sent to Lily-Core via WebSocket in real-time
- Lily-Core forwards audio data to Echo service for transcription
- Echo service uses Whisper model to convert speech to text
- Transcribed text is processed through the agent loop

### 2. Audio Output (Text-to-Speech)

#### User Interface
- Automatic playback of assistant responses as audio
- Visual indicators when audio is playing
- TTS settings panel for voice customization

#### Technical Implementation
- When TTS is enabled, Lily-Core sends text responses to TTS-Provider
- TTS-Provider generates audio using selected engine (Edge or Zonos)
- Audio is streamed back to Lily-Core via WebSocket
- Lily-Core forwards audio data to Lily-UI via WebSocket
- Lily-UI plays audio using HTML5 Audio API

### 3. Conversation Mode

#### User Interface
- Toggle button to enable/disable continuous conversation mode
- Visual feedback when in conversation mode
- Audio activity detection to automatically start/stop recording

#### Technical Implementation
- Continuous audio capture while in conversation mode
- Real-time audio activity detection using Web Audio API
- Automatic transcription of speech segments
- Context-aware conversation flow management

## Data Flow

### Audio Input Flow
1. User clicks microphone button or activates conversation mode
2. Lily-UI requests microphone access using MediaDevices API
3. Audio is captured using MediaRecorder with 1-second timeslices
4. Audio chunks are sent to Lily-Core via Tauri command over WebSocket
5. Lily-Core forwards audio data to Echo service via HTTP POST
6. Echo service transcribes audio to text using Whisper
7. Transcribed text is sent through agent loop for processing
8. Response is generated and sent back to UI

### Audio Output Flow
1. Assistant response text is received from agent loop
2. If TTS is enabled, text is sent to TTS-Provider via WebSocket
3. TTS-Provider generates audio and streams it back in chunks
4. Audio data is forwarded from Lily-Core to Lily-UI via WebSocket
5. Lily-UI receives audio data and plays it using HTML5 Audio API

## Configuration Options

### TTS Settings
- Speaker selection (multiple voice options)
- Sample rate configuration
- Model selection (Edge TTS or Zonos)
- Language selection

### Audio Device Settings
- Input device selection (microphone)
- Output device selection (speakers/headphones)

## Error Handling

### Audio Input Errors
- Microphone access denied
- Audio capture failures
- Network issues during audio transmission
- Transcription service unavailable

### Audio Output Errors
- Audio playback failures
- TTS service connectivity issues
- Audio data corruption

## Performance Considerations

### Latency Optimization
- Audio chunking for real-time processing
- WebSocket connections for low-latency communication
- Asynchronous processing in backend services

### Resource Management
- Efficient audio encoding/decoding
- Connection pooling for service communication
- Memory management for audio buffers

## Security Considerations

### Data Privacy
- Audio data is processed locally when possible
- No audio data is stored permanently
- Secure WebSocket connections between services

### Access Control
- User authentication for WebSocket connections
- Service-to-service communication security

## Future Enhancements

### Planned Features
- Voice activity detection improvements
- Noise reduction and audio enhancement
- Multi-language support expansion
- Custom voice training capabilities

### Technical Improvements
- Better integration with streaming APIs
- Enhanced error recovery mechanisms
- Improved audio quality options
- Advanced conversation context management

## Dependencies

### External Services
- Whisper model for speech recognition
- Edge TTS or Zonos for text-to-speech generation

### Libraries and Frameworks
- Tauri for desktop application framework
- React for UI components
- WebSocket++ for C++ WebSocket implementation
- FastAPI for Python services
- WebRTC for audio processing (indirectly through browser APIs)

## Testing Considerations

### Functional Testing
- Audio capture and playback verification
- Speech recognition accuracy testing
- TTS quality and performance testing
- Conversation flow validation

### Performance Testing
- Latency measurements for audio processing
- Resource usage monitoring
- Stress testing with multiple concurrent users

### Compatibility Testing
- Cross-platform audio device support
- Browser compatibility for Web Audio APIs
- Different audio format handling

## Deployment Considerations

### System Requirements
- Microphone for audio input
- Speakers or headphones for audio output
- Sufficient CPU/memory for real-time audio processing
- Network connectivity for service communication

### Scaling
- Horizontal scaling of Echo and TTS-Provider services
- Load balancing for Lily-Core instances
- CDN for audio assets if needed

## Monitoring and Logging

### Key Metrics
- Audio processing latency
- Transcription accuracy rates
- TTS generation times
- User engagement with audio features

### Logging
- Audio capture and processing events
- Service communication logs
- Error and exception tracking
- Performance metrics collection