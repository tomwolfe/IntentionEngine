import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Home from '../src/app/page';
import React from 'react';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Trash2: () => 'Trash2',
  Calendar: () => 'Calendar',
  MapPin: () => 'MapPin',
  Loader2: () => 'Loader2',
  Cpu: () => 'Cpu',
}));

// Mock useChat
const mockSendMessage = vi.fn();
const mockSetMessages = vi.fn();

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    setMessages: mockSetMessages,
    status: 'idle',
    sendMessage: mockSendMessage,
    addToolOutput: vi.fn(),
  }),
}));

// Mock web-llm
const mockEngine = {
  getSelectedModel: vi.fn(),
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: vi.fn(async () => mockEngine),
}));

describe('Home Page UI and Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should change model via toggle', async () => {
    render(<Home />);
    
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('SmolLM2-135M-Instruct-q4f16_1-MLC');
    
    fireEvent.change(select, { target: { value: 'Phi-3.5-mini-instruct-q4f16_1-MLC' } });
    expect(select).toHaveValue('Phi-3.5-mini-instruct-q4f16_1-MLC');
  });

  it('should route simple task to local model (simulated)', async () => {
    // This is hard to test fully without more complex mocks, 
    // but we can check if sendMessage was NOT called for simple tasks.
    
    render(<Home />);
    const input = screen.getByPlaceholderText(/e.g. Hi there!/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Hi' } });
    fireEvent.click(sendButton);

    // sendMessage (cloud) should NOT be called for 'Hi'
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('should route complex task to cloud model', async () => {
    render(<Home />);
    const input = screen.getByPlaceholderText(/e.g. Hi there!/);
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'search for a pizza restaurant' } });
    fireEvent.click(sendButton);

    // sendMessage (cloud) SHOULD be called for complex task
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
