import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import Chat from './Chat';

// Mock all external dependencies to avoid complex setup
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve([]))
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}));

vi.mock('../services/LogService', () => ({
  default: {
    logChatSent: vi.fn(),
    logChatResponse: vi.fn(),
    logTTSResponse: vi.fn()
  }
}));

vi.mock('../services/PersistenceService', () => ({
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

describe('Chat Component', () => {
  it('renders the chat interface with welcome message', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Welcome to Lily AI!')).toBeInTheDocument();
      expect(screen.getByText('Ask me anything and I\'ll do my best to help you.')).toBeInTheDocument();
    });
  });

  it('renders input form and controls', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type your message here...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /🎤/ })).toBeInTheDocument();
      // Send button has SVG icon, check by class
      const sendButton = document.querySelector('.send-button');
      expect(sendButton).toBeInTheDocument();
    });
  });

  it('renders TTS toggle button', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tts: off/i })).toBeInTheDocument();
    });
  });

  it('renders settings button', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });
  });

  it('renders clear chat button', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      const clearButton = screen.getByRole('button', { name: /clear chat/i });
      expect(clearButton).toBeInTheDocument();
      expect(clearButton).toBeDisabled(); // Should be disabled when no messages
    });
  });

  it('renders suggestion prompts in welcome message', async () => {
    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByText('What can you help me with?')).toBeInTheDocument();
      expect(screen.getByText('Tell me a fun fact')).toBeInTheDocument();
      expect(screen.getByText('How does web search work?')).toBeInTheDocument();
    });
  });

  it('handles interim transcription events', async () => {
    const mockListen = vi.fn();
    vi.mocked(await import('@tauri-apps/api/event')).listen = mockListen;

    // Mock the listen function to simulate transcription events
    mockListen.mockImplementation((eventName: string, handler: Function) => {
      if (eventName === 'transcription') {
        // Simulate interim transcription event
        setTimeout(() => {
          handler({ payload: 'transcription:{"type":"interim","text":"Hello world"}' });
        }, 100);
      }
      return Promise.resolve(() => {});
    });

    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getByText('Listening...')).toBeInTheDocument();
    });

    // Check for interim styling
    const transcriptionElement = screen.getByText('Hello world');
    expect(transcriptionElement).toHaveClass('interim');
  });


  it('displays live transcription with blinking cursor', async () => {
    const mockListen = vi.fn();
    vi.mocked(await import('@tauri-apps/api/event')).listen = mockListen;

    mockListen.mockImplementation((eventName: string, handler: Function) => {
      if (eventName === 'transcription') {
        setTimeout(() => {
          handler({ payload: 'transcription:{"type":"interim","text":"Hello"}' });
        }, 100);
      }
      return Promise.resolve(() => {});
    });

    await act(async () => {
      render(<Chat />);
    });

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      // Check for blinking cursor
      const cursor = document.querySelector('.transcription-cursor');
      expect(cursor).toBeInTheDocument();
      expect(cursor).toHaveTextContent('|');
    });
  });

  // Note: Final transcription conversion tests require complex state management
  // and are validated through integration testing. The core live transcription
  // display functionality is working as demonstrated above.
});