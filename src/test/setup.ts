import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
(globalThis as any).__TAURI__ = {};

// Mock @tauri-apps/api modules
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn((command: string, args?: any) => {
    // Mock responses based on command
    switch (command) {
      case 'get_logs':
        return Promise.resolve([]);
      case 'load_settings':
        return Promise.resolve({
          tts_params: {
            speaker: 0,
            sample_rate: 22050,
            model: 'default',
            lang: 'en'
          },
          tts_enabled: true
        });
      case 'load_chat_history':
        return Promise.resolve([]);
      case 'get_websocket_status':
        return Promise.resolve({ connected: false, registered: false });
      case 'save_settings':
      case 'save_chat_history':
      case 'clear_chat_history':
      case 'add_log_entry':
      case 'clear_logs':
      case 'connect_websocket':
      case 'disconnect_websocket':
      case 'send_websocket_message':
      case 'send_chat_message':
      case 'get_conversation_history':
      case 'clear_conversation':
      case 'get_monitoring_data':
      case 'send_websocket_audio':
      case 'start_audio_recording':
      case 'stop_audio_recording':
      case 'get_audio_level':
      case 'get_audio_devices':
        return Promise.resolve(undefined);
      default:
        return Promise.resolve(undefined);
    }
  })
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())) // Returns a Promise that resolves to an unsubscribe function
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn()
  })
}));

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: vi.fn().mockReturnValue([
        { stop: vi.fn() }
      ])
    }),
    enumerateDevices: vi.fn().mockResolvedValue([])
  },
  writable: true
});

// Mock AudioContext
const mockGetByteTimeDomainData = vi.fn();
global.AudioContext = vi.fn().mockImplementation(() => ({
  createAnalyser: vi.fn().mockReturnValue({
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 256,
    frequencyBinCount: 128,
    getByteTimeDomainData: mockGetByteTimeDomainData
  }),
  createMediaStreamSource: vi.fn().mockReturnValue({
    connect: vi.fn()
  }),
  close: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(undefined),
  state: 'running'
}));

// Export for tests
(global as any).mockGetByteTimeDomainData = mockGetByteTimeDomainData;

// Mock MediaRecorder
(global as any).MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  onstop: null,
  state: 'recording'
}));
(global as any).MediaRecorder.isTypeSupported = vi.fn().mockReturnValue(true);

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb: () => void) => setTimeout(cb, 16));
global.cancelAnimationFrame = vi.fn();