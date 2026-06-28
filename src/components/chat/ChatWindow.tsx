'use client'

import { useChat } from '@/components/chat/ChatContext';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Icon } from '@/components/Icon';

export default function ChatWindow() {
  const { 
    messagesByThread, 
    activeThreadId, 
    loading: sending, 
    error, 
    sendMessage 
  } = useChat();
  
  const messages = activeThreadId ? (messagesByThread[activeThreadId] || []) : [];
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Scroll to bottom when messages change and we are at the bottom
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isAtBottom]);

  // Handle scroll events to track if user is at the bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (!target) return;
    const isBottom = target.scrollHeight - target.scrollTop === target.clientHeight;
    setIsAtBottom(isBottom);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeThreadId) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // Clear error on input change
  useEffect(() => {
    if (error) {
      // Clear error after 5 seconds or on input change?
      // We'll clear on input change for now, but we might want to keep it until the user tries again.
      // For simplicity, we clear on input change.
    }
  }, [inputValue, error]);

  return (
    <div className="app-content">
      {/* Messages container */}
      <div
        className="messages"
        ref={messagesEndRef}
        onScroll={handleScroll}
        style={{
          height: 'calc(100vh - var(--topbar-height, 56px) - var(--input-height, 80px))',
          overflowY: 'auto',
          padding: 'var(--space-6)',
          marginBottom: 'var(--space-6)',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`
              message
              ${msg.role === 'user' ? 'ml-auto max-w-[70%]' : 'max-w-[85%]'}
              ${msg.role === 'assistant' && msg.isStreaming ? 'streaming' : ''}
            `}
          >
            {msg.role === 'user' ? (
              <div className="message-content user">
                <div className="message-text">{msg.content}</div>
              </div>
            ) : (
              <div className="message-content assistant">
                <div className="message-text">
                  {msg.content}
                  {msg.isStreaming && (
                    <span className="cursor-blink" aria-label="typing"></span>
                  )}
                </div>
                {/* Render citations if available and not streaming */}
                {!msg.isStreaming && msg.citations && msg.citations.length > 0 && (
                  <div className="citations">
                    {msg.citations.map((cite) => (
                      <span
                        key={cite.id}
                        className="badge badge-accent citation-badge"
                        title={`Document: ${cite.documentName}\nText: ${cite.text}`}
                      >
                        [{cite.id}]
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="panel badge-danger" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          {error}
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="input-form" style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Ask a question about your documents..."
          className="input"
          disabled={!activeThreadId || sending}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || !activeThreadId || sending}
          className={`btn btn-primary ${sending ? 'opacity-50' : ''}`}
          aria-label={sending ? 'Sending message' : 'Send message'}
        >
          {sending ? (
            <>
              <span className="spinner spinner-sm" style={{ display: 'inline-block' }} />
              <span className="ml-2">Sending...</span>
            </>
          ) : (
            'Send'
          )}
        </button>
      </form>
    </div>
  );
}