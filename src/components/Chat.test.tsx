import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Chat from './Chat';

// Mock all external dependencies to avoid complex setup
vi.mock('@tauri-apps/api/core');
vi.mock('@tauri-apps/api/event');
vi.mock('../services/LogService');
vi.mock('../services/PersistenceService');

describe('Chat Component', () => {
  it('renders the chat interface with welcome message', () => {
    render(<Chat />);

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Lily AI!')).toBeInTheDocument();
    expect(screen.getByText('Ask me anything and I\'ll do my best to help you.')).toBeInTheDocument();
  });

  it('renders input form and controls', () => {
    render(<Chat />);

    expect(screen.getByPlaceholderText('Type your message here...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /🎤/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('renders TTS toggle button', () => {
    render(<Chat />);

    expect(screen.getByRole('button', { name: /tts: off/i })).toBeInTheDocument();
  });

  it('renders settings button', () => {
    render(<Chat />);

    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders clear chat button', () => {
    render(<Chat />);

    const clearButton = screen.getByRole('button', { name: /clear chat/i });
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toBeDisabled(); // Should be disabled when no messages
  });

  it('renders suggestion prompts in welcome message', () => {
    render(<Chat />);

    expect(screen.getByText('What can you help me with?')).toBeInTheDocument();
    expect(screen.getByText('Tell me a fun fact')).toBeInTheDocument();
    expect(screen.getByText('How does web search work?')).toBeInTheDocument();
  });
});