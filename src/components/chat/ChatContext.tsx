'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Types
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ id: string; text: string; documentId: string; documentName: string }>;
  isStreaming?: boolean;
};

type Thread = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

interface ChatContextType {
  threads: Thread[];
  messagesByThread: Record<string, Message[]>;
  activeThreadId: string | null;
  loading: boolean;
  error: string | null;
  loadThreads: () => Promise<void>;
  createThread: (title: string) => Promise<void>;
  loadThread: (id: string) => Promise<void>;
  updateThreadTitle: (id: string, title: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

interface ChatProviderProps {
  children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load threads from the API
  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/threads');
      if (!res.ok) throw new Error(`Failed to fetch threads: ${res.status}`);
      const data = await res.json();
      const fetchedThreads: Thread[] = data.threads || [];
      setThreads(fetchedThreads);
      // Initialize messages for each thread if not present
      const newMessagesByThread: Record<string, Message[]> = {};
      fetchedThreads.forEach(thread => {
        if (!messagesByThread[thread.id]) {
          newMessagesByThread[thread.id] = [];
        } else {
          newMessagesByThread[thread.id] = messagesByThread[thread.id];
        }
      });
      setMessagesByThread(newMessagesByThread);
      // Set active thread to the first one if none is set
      if (!activeThreadId && fetchedThreads.length > 0) {
        setActiveThreadId(fetchedThreads[0].id);
      }
    } catch (err) {
      setError('Failed to load threads');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeThreadId, messagesByThread]);

  // Create a new thread
  const createThread = useCallback(async (title: string) => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
      const newThread: Thread = await res.json();
      setThreads(prev => [newThread, ...prev]);
      setMessagesByThread(prev => ({
        ...prev,
        [newThread.id]: [],
      }));
      setActiveThreadId(newThread.id);
    } catch (err) {
      setError('Failed to create thread');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load a thread (set active and optionally fetch its messages if we want to load from server)
  // For now, we assume messages are already in the state (loaded via loadThreads or created).
  // If we wanted to fetch messages for a thread on demand, we would need an endpoint like /api/threads/:id/messages.
  // Since we don't have that, we'll just set the active thread.
  const loadThread = useCallback(async (id: string) => {
    setActiveThreadId(id);
    // Optionally, we could fetch messages for this thread here if we had an endpoint.
    // For now, we rely on the client-side state.
  }, []);

  // Update thread title
  const updateThreadTitle = useCallback(async (id: string, title: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error(`Failed to update thread: ${res.status}`);
      const updatedThread: Thread = await res.json();
      setThreads(prev =>
        prev.map(t => (t.id === id ? { ...t, title, updatedAt: new Date() } : t))
      );
    } catch (err) {
      setError('Failed to update thread');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a thread
  const deleteThread = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/threads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
      setThreads(prev => prev.filter(t => t.id !== id));
      setMessagesByThread(prev => {
        const newMessages = { ...prev };
        delete newMessages[id];
        return newMessages;
      });
      if (activeThreadId === id) {
        // Set active thread to the first remaining thread, or null if none
        const remainingThreads = threads.filter(t => t.id !== id);
        setActiveThreadId(remainingThreads.length > 0 ? remainingThreads[0].id : null);
      }
    } catch (err) {
      setError('Failed to delete thread');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [threads]);

  // Send a message and handle the response via SSE
  const sendMessage = useCallback(async (content: string) => {
    if (!activeThreadId) return;
    if (!content.trim()) return;
    setLoading(true);
    setError(null);

    // Optimistically add the user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      content,
    };
    setMessagesByThread(prev => ({
      ...prev,
      [activeThreadId]: [...(prev[activeThreadId] || []), userMessage],
    }));

    // Create a placeholder for the assistant's response
    const assistantMessageId = `msg-${Date.now()}-${Math.random()}-assistant`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessagesByThread(prev => ({
      ...prev,
      [activeThreadId]: [...(prev[activeThreadId] || []), assistantMessage],
    }));

    try {
      // Make a POST request to the chat endpoint with the message and threadId
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, threadId: activeThreadId }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      if (!res.body) throw new Error('Response body is empty');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const json = JSON.parse(data);
              if (json.type === 'text') {
                // Append text delta to the assistant's message
                setMessagesByThread(prev => {
                  const currentMessages = [...(prev[activeThreadId] || [])];
                  const lastMessageIndex = currentMessages.length - 1;
                  if (lastMessageIndex >= 0 && currentMessages[lastMessageIndex].id === assistantMessageId) {
                    const updatedMessage = {
                      ...currentMessages[lastMessageIndex],
                      content: currentMessages[lastMessageIndex].content + json.delta,
                    };
                    const updatedMessages = [...currentMessages.slice(0, -1), updatedMessage];
                    return { ...prev, [activeThreadId]: updatedMessages };
                  }
                  return prev;
                });
              } else if (json.type === 'citations') {
                // Update the assistant's message with citations and stop streaming
                setMessagesByThread(prev => {
                  const currentMessages = [...(prev[activeThreadId] || [])];
                  const lastMessageIndex = currentMessages.length - 1;
                  if (lastMessageIndex >= 0 && currentMessages[lastMessageIndex].id === assistantMessageId) {
                    const updatedMessage = {
                      ...currentMessages[lastMessageIndex],
                      content: currentMessages[lastMessageIndex].content, // Keep the accumulated content
                      isStreaming: false,
                      citations: json.citations,
                    };
                    const updatedMessages = [...currentMessages.slice(0, -1), updatedMessage];
                    return { ...prev, [activeThreadId]: updatedMessages };
                  }
                  return prev;
                });
                // Break out of the loop since we've received the final message
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', data, e);
              // If it's not JSON, treat as plain text (fallback)
              setMessagesByThread(prev => {
                const currentMessages = [...(prev[activeThreadId] || [])];
                const lastMessageIndex = currentMessages.length - 1;
                if (lastMessageIndex >= 0 && currentMessages[lastMessageIndex].id === assistantMessageId) {
                  const updatedMessage = {
                    ...currentMessages[lastMessageIndex],
                    content: currentMessages[lastMessageIndex].content + data,
                  };
                  const updatedMessages = [...currentMessages.slice(0, -1), updatedMessage];
                  return { ...prev, [activeThreadId]: updatedMessages };
                }
                return prev;
              });
            }
          }
        }
      }

      // If we exit the loop without getting a 'citations' type, mark the message as done
      setMessagesByThread(prev => {
        const currentMessages = [...(prev[activeThreadId] || [])];
        const lastMessageIndex = currentMessages.length - 1;
        if (lastMessageIndex >= 0 && currentMessages[lastMessageIndex].id === assistantMessageId) {
          const updatedMessage = {
            ...currentMessages[lastMessageIndex],
            isStreaming: false,
          };
          const updatedMessages = [...currentMessages.slice(0, -1), updatedMessage];
          return { ...prev, [activeThreadId]: updatedMessages };
        }
        return prev;
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error in SSE stream:', err);
        setError('Failed to connect to the chat service. Please try again.');
        // Remove the optimistic messages on error
        setMessagesByThread(prev => {
          let currentMessages = [...(prev[activeThreadId] || [])];
          // Remove the last two messages (user and assistant) if they are the ones we just added
          if (currentMessages.length >= 2) {
            const secondLast = currentMessages[currentMessages.length - 2];
            const last = currentMessages[currentMessages.length - 1];
            if (secondLast.role === 'user' && last.role === 'assistant' && last.id === assistantMessageId) {
              currentMessages = currentMessages.slice(0, -2);
            }
          }
          return { ...prev, [activeThreadId]: currentMessages };
        });
      }
    } finally {
      setLoading(false);
    }
  }, [activeThreadId, threads]);

  // Load threads on initial mount
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const value = {
    threads,
    messagesByThread,
    activeThreadId,
    loading,
    error,
    loadThreads,
    createThread,
    loadThread,
    updateThreadTitle,
    deleteThread,
    sendMessage,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}