import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
(globalThis as any).__TAURI__ = {};

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