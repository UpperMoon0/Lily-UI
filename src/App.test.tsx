import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Mock all external dependencies to avoid complex setup
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve([]))
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}));

vi.mock('./services/LogService', () => ({
  default: {
    logChatSent: vi.fn(),
    logChatResponse: vi.fn(),
    logTTSResponse: vi.fn(),
    logInfo: vi.fn(),
    logError: vi.fn(),
    logDebug: vi.fn()
  }
}));

vi.mock('./services/PersistenceService', () => ({
  default: {
    loadSettings: vi.fn(() => Promise.resolve(null)),
    loadChatHistory: vi.fn(() => Promise.resolve([])),
    saveChatHistory: vi.fn(),
    saveSettings: vi.fn(),
    clearChatHistory: vi.fn()
  }
}));

// Mock navigator APIs
Object.defineProperty(window, 'navigator', {
  value: {
    ...window.navigator,
    mediaDevices: {
      getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [] })),
      enumerateDevices: vi.fn(() => Promise.resolve([]))
    },
    permissions: {
      query: vi.fn(() => Promise.resolve({ state: 'granted' }))
    }
  },
  writable: true
});

describe('App', () => {
  it('renders the welcome message', async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Welcome to Lily AI!')).toBeInTheDocument();
    });
  });
});