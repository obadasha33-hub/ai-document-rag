import React from 'react'
import { useChat } from '@/components/chat/ChatContext';
import { v4 as uuidv4 } from 'uuid';
import { Icon } from '@/components/Icon';

export default function ThreadSidebar() {
  const {
    threads,
    activeThreadId,
    loading,
    error: _error,
    createThread: handleCreateThread,
    updateThreadTitle: handleUpdateThread,
    deleteThread: handleDeleteThread,
    loadThread: handleLoadThread,
  } = useChat();

  const [newThreadTitle, setNewThreadTitle] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');

  const createThread = async () => {
    if (!newThreadTitle.trim()) return;
    try {
      await handleCreateThread(newThreadTitle);
      setNewThreadTitle('');
    } catch (err) {
      // Error is handled by the context (sets error state)
      console.error('Failed to create thread:', err);
    }
  };

  const loadThread = (id: string) => {
    handleLoadThread(id);
  };

  const updateThreadTitle = async (id: string, title: string) => {
    try {
      await handleUpdateThread(id, title);
    } catch (err) {
      console.error('Failed to update thread:', err);
    }
  };

  const deleteThread = async (id: string) => {
    try {
      await handleDeleteThread(id);
    } catch (err) {
      console.error('Failed to delete thread:', err);
    }
  };

  return (
    <aside className="sidebar">
      <div className="nav-group">
        <NavSectionLabel>Threads</NavSectionLabel>
        {loading ? (
          <div className="panel" style={{ padding: 'var(--space-4)' }}>
            <div className="skeleton" style={{ height: 16, width: '100%' }} />
            <div className="skeleton" style={{ height: 16, width: '80%', marginTop: 4 }} />
          </div>
        ) : (
          <>
            {threads.map(thread => (
              <div
                key={thread.id}
                className="nav-item"
                data-active={activeThreadId === thread.id ? 'true' : 'false'}
                onClick={() => loadThread(thread.id)}
              >
                {editingId === thread.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        updateThreadTitle(thread.id, editTitle);
                        setEditingId(null);
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    onBlur={() => {
                      updateThreadTitle(thread.id, editTitle);
                      setEditingId(null);
                    }}
                    className="input input-sm"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="t-2 flex-1 truncate" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.title}</span>
                    <div className="row" style={{ gap: 'var(--space-1)', flex: '0 0 auto' }}>
                      <button
                        className="btn btn-icon btn-sm"
                        style={{ minWidth: 44, minHeight: 44 }}
                        onClick={e => {
                          e.stopPropagation();
                          setEditingId(thread.id);
                          setEditTitle(thread.title);
                        }}
                        aria-label="Rename thread"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                      <button
                        className="btn btn-icon btn-sm btn-danger"
                        style={{ minWidth: 44, minHeight: 44 }}
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm('Delete this thread?')) {
                            deleteThread(thread.id);
                          }
                        }}
                        aria-label="Delete thread"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="nav-item" style={{ cursor: 'pointer' }}>
              <input
                type="text"
                value={newThreadTitle}
                onChange={e => setNewThreadTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    createThread();
                  }
                }}
                placeholder="New thread name"
                className="input input-sm"
                style={{ width: '100%' }}
              />
              {loading && (
                <span className="pulse-soft" style={{ width: 16, height: 16, display: 'inline-block', marginLeft: 4 }} />
              )}
              {!loading && newThreadTitle && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={createThread}
                  style={{ marginTop: 4, width: '100%' }}
                >
                  Create
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// Helper component for section labels
function NavSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="nav-section-label">
      {children}
    </div>
  );
}