'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useDashboard } from '../layout'
import { getThreadHistory, getThreadMessages } from '../actions'
import { Icon } from '@/components/Icon'

interface Message {
  id: string
  role: 'USER' | 'ASSISTANT' | string
  content: string
  citations?: Array<{
    docId: string
    docName: string
    pageNumber: number | null
    snippet: string
  }>
  createdAt: string
}

interface Thread {
  id: string
  title: string
  createdAt: string
}

export default function ChatPage() {
  const { data, activeWorkspaceId } = useDashboard()
  const { tenant, token } = data

  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeCitations, setActiveCitations] = useState<any[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load threads history on workspace change
  useEffect(() => {
    const fetchThreads = async () => {
      setErrorMsg(null)
      try {
        const history = await getThreadHistory(tenant.id, activeWorkspaceId)
        setThreads(history)
        if (history.length > 0) {
          // Default to the most recent thread
          setActiveThreadId(history[0].id)
        } else {
          setActiveThreadId(null)
          setMessages([])
          setActiveCitations([])
        }
      } catch (err) {
        console.error('Failed to load threads:', err)
        setErrorMsg('Error loading conversation threads.')
      }
    }
    void fetchThreads()
  }, [activeWorkspaceId, tenant.id])

  // Load messages when active thread changes
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([])
      setActiveCitations([])
      return
    }

    const fetchMessages = async () => {
      setErrorMsg(null)
      try {
        const list = await getThreadMessages(tenant.id, activeThreadId)
        setMessages(list)
        // Set citations to the latest assistant message's citations if any
        const assistantMsgs = list.filter((m) => m.role === 'ASSISTANT')
        if (assistantMsgs.length > 0) {
          const latestCitations = assistantMsgs[assistantMsgs.length - 1].citations || []
          setActiveCitations(latestCitations)
        } else {
          setActiveCitations([])
        }
        setTimeout(scrollToBottom, 50)
      } catch (err) {
        console.error('Failed to load thread messages:', err)
        setErrorMsg('Error loading conversation history.')
      }
    }
    void fetchMessages()
  }, [activeThreadId, tenant.id])

  // Handles starting a fresh conversation
  const startNewConversation = () => {
    setActiveThreadId(null)
    setMessages([])
    setActiveCitations([])
    setInput('')
    setErrorMsg(null)
  }

  // Handles sending query and parsing the SSE stream
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isGenerating) return

    const query = input.trim()
    setInput('')
    setIsGenerating(true)
    setErrorMsg(null)

    // Add local optimistic User message
    const userMsgId = `user-${Date.now()}`
    const userMsg: Message = {
      id: userMsgId,
      role: 'USER',
      content: query,
      createdAt: new Date().toISOString()
    }
    
    // Add temporary assistant placeholder
    const assistantMsgId = `assistant-${Date.now()}`
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: 'ASSISTANT',
      content: '',
      citations: [],
      createdAt: new Date().toISOString()
    }

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
    setTimeout(scrollToBottom, 50)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          message: query,
          threadId: activeThreadId || undefined
        })
      })

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP error ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No readable response body.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() || ''

        for (const line of lines) {
          const cleanLine = line.trim()
          if (!cleanLine || !cleanLine.startsWith('data: ')) continue

          const dataStr = cleanLine.substring(6)
          try {
            const parsed = JSON.parse(dataStr)
            
            if (parsed.type === 'thread') {
              // Update local thread ID and trigger history refresh
              setActiveThreadId(parsed.threadId)
              const updatedHistory = await getThreadHistory(tenant.id, activeWorkspaceId)
              setThreads(updatedHistory)
            } else if (parsed.type === 'citations') {
              // Stream citations list and pin them on the side panel
              setActiveCitations(parsed.citations)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, citations: parsed.citations } : m
                )
              )
            } else if (parsed.type === 'token') {
              // Append tokens to the active response message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + parsed.token } : m
                )
              )
              scrollToBottom()
            } else if (parsed.type === 'error') {
              setErrorMsg(parsed.error)
            } else if (parsed.type === 'done') {
              // Generation successfully completed
              setIsGenerating(false)
            }
          } catch (_) {
            // Ignore incomplete chunks
          }
        }
      }
    } catch (err: any) {
      console.error('Chat error:', err)
      setErrorMsg(err.message || 'An unexpected error occurred during streaming.')
      setIsGenerating(false)
      // Clean up empty placeholder if error occurred at start
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId || m.content !== ''))
    }
  }

  return (
    <main className="app-content">
      <div className="stack-6">

        {/* Header section */}
        <header className="row-between">
          <div className="stack-1">
            <div className="t-small t-3">Multi-Tenant Document RAG</div>
            <h1 className="t-h1">Ask VeritasDoc</h1>
          </div>
          <Link href="/dashboard" className="btn btn-secondary">
            <Icon name="arrow-left" size={14} />
            Back to overview
          </Link>
        </header>

        {/* Global system alert error feedback */}
        {errorMsg && (
          <div className="badge badge-danger row" style={{ gap: 'var(--space-2)', width: '100%', padding: 'var(--space-3)' }}>
            <Icon name="logo" size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="split">
          
          {/* Main conversation section */}
          <section className="panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 520 }}>
            
            {/* Context title */}
            <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border-1)' }} className="row-between">
              <div className="row" style={{ gap: 'var(--space-3)' }}>
                <Icon name="quote" size={18} />
                <span className="t-h3">Conversation</span>
              </div>
              <span className="badge">Streaming · Citations enabled</span>
            </div>

            {/* Conversation Messages */}
            <div style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto', maxHeight: '480px' }} className="stack-6">
              {messages.length === 0 ? (
                <div style={{ minHeight: 320, display: 'grid', placeItems: 'center', color: 'var(--text-3)', textAlign: 'center' }} className="stack-3">
                  <Icon name="quote" size={28} />
                  <div className="t-body">Ask anything about the documents in this workspace.</div>
                  <div className="t-small">Responses compile context and cite source segments in real-time.</div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className={`stack-2 ${msg.role === 'USER' ? 'msg-user' : 'msg-assistant'}`}
                    style={{
                      alignSelf: msg.role === 'USER' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: 'var(--space-4) var(--space-5)',
                      borderRadius: 'var(--radius-lg)',
                      background: msg.role === 'USER' ? 'var(--accent)' : 'var(--panel-sunken)',
                      color: msg.role === 'USER' ? 'var(--on-accent)' : 'var(--text-1)',
                      border: msg.role === 'USER' ? 'none' : '1px solid var(--border-1)',
                      marginTop: 'var(--space-3)'
                    }}
                  >
                    <div className="row" style={{ gap: 'var(--space-2)', borderBottom: '1px solid color-mix(in srgb, currentColor 15%, transparent)', paddingBottom: 'var(--space-2)' }}>
                      <Icon name={msg.role === 'USER' ? 'shield' : 'spark'} size={12} />
                      <strong className="t-small" style={{ textTransform: 'capitalize' }}>
                        {msg.role === 'USER' ? 'You' : 'Assistant'}
                      </strong>
                    </div>
                    <div className="t-body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {msg.content || (isGenerating && msg.role === 'ASSISTANT' && <span className="spinner spinner-sm" style={{ display: 'inline-block' }} />)}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <form style={{ padding: 'var(--space-4) var(--space-6)', borderTop: '1px solid var(--border-1)', background: 'var(--panel)' }} className="row" onSubmit={handleSubmit}>
              <input 
                className="input" 
                style={{ flex: 1 }} 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isGenerating ? "Assistant is streaming answer..." : "Ask about the documents in this workspace…"} 
                disabled={isGenerating}
              />
              <button type="submit" className="btn btn-primary" disabled={isGenerating || !input.trim()}>
                {isGenerating ? <span className="spinner spinner-sm" /> : <Icon name="arrow-right" size={14} />}
                Send
              </button>
            </form>
          </section>

          {/* Right sidebar details */}
          <aside className="stack-4">
            
            {/* Thread selector */}
            <section className="panel" style={{ padding: 'var(--space-5) var(--space-6)' }}>
              <div className="row-between">
                <h2 className="t-h3">Conversation History</h2>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={startNewConversation} title="New conversation">
                  <Icon name="plus" size={14} />
                </button>
              </div>
              <div className="stack-2" style={{ marginTop: 'var(--space-4)', maxHeight: '180px', overflowY: 'auto' }}>
                {threads.length === 0 ? (
                  <p className="t-small t-3">No conversations started yet.</p>
                ) : (
                  threads.map((th) => (
                    <button
                      key={th.id}
                      onClick={() => setActiveThreadId(th.id)}
                      className="row"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 'var(--space-2) var(--space-3)',
                        borderRadius: 'var(--radius-sm)',
                        background: activeThreadId === th.id ? 'var(--panel-sunken)' : 'transparent',
                        border: 'none',
                        color: activeThreadId === th.id ? 'var(--accent)' : 'var(--text-2)',
                        cursor: 'pointer',
                        gap: 'var(--space-3)',
                        alignItems: 'center'
                      }}
                    >
                      <Icon name="quote" size={12} />
                      <span className="t-small text-ellipsis" style={{ flex: 1, fontWeight: activeThreadId === th.id ? 600 : 400 }}>
                        {th.title}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>

            {/* Citations panel */}
            <section className="panel" style={{ padding: 'var(--space-5) var(--space-6)' }}>
              <h2 className="t-h3">Retrieved Citations</h2>
              <p className="t-small t-3" style={{ marginTop: 6 }}>
                Active semantic blocks and snippets used to formulate the latest answer.
              </p>
              <div className="stack-3" style={{ marginTop: 'var(--space-4)', maxHeight: '240px', overflowY: 'auto', paddingRight: 'var(--space-1)' }}>
                {activeCitations.length === 0 ? (
                  <span className="badge mono">No citations yet</span>
                ) : (
                  activeCitations.map((cit, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        padding: 'var(--space-3)', 
                        background: 'var(--panel-sunken)', 
                        borderRadius: 'var(--radius-sm)', 
                        borderLeft: '3px solid var(--accent)', 
                        fontSize: 11 
                      }}
                      className="stack-2"
                    >
                      <div className="row-between" style={{ color: 'var(--text-2)', fontWeight: 600 }}>
                        <span>[{idx + 1}] {cit.docName}</span>
                        {cit.pageNumber && <span>Page {cit.pageNumber}</span>}
                      </div>
                      <p className="t-small t-3" style={{ fontStyle: 'italic', wordBreak: 'break-word', marginTop: 4 }}>
                        "{cit.snippet}"
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>

      </div>

      <style jsx>{`
        .split {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-4);
        }
        @media (min-width: 1100px) {
          .split { grid-template-columns: 1.6fr 1fr; align-items: start; }
        }
        .msg-user {
          align-self: flex-end;
        }
        .msg-assistant {
          align-self: flex-start;
        }
        .text-ellipsis {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </main>
  )
}
