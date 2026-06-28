'use client'

import React, { useEffect, useState } from 'react'
import { Icon } from './Icon'

export interface Citation {
  docId: string
  docName: string
  pageNumber: number | null
  snippet: string
  similarity?: number
}

interface CitationDrawerProps {
  citation: Citation | null
  onClose: () => void
}

export function CitationDrawer({ citation, onClose }: CitationDrawerProps) {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (citation) {
      const t = setTimeout(() => setVisible(true), 16)
      return () => { clearTimeout(t); setVisible(false); setCopied(false) }
    } else {
      setVisible(false)
      return undefined
    }
  }, [citation])

  if (!citation) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation.snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {/* ignore */}
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'var(--overlay)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity var(--t-base) var(--ease)'
      }}
      aria-modal
      role="dialog"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="panel"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(560px, 100vw)',
          borderRadius: 0,
          borderTop: 0, borderRight: 0, borderBottom: 0,
          transform: visible ? 'translateX(0)' : 'translateX(40px)',
          transition: 'transform var(--t-slow) var(--ease)',
          overflowY: 'auto'
        }}
      >
        <div className="row-between" style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border-1)' }}>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <Icon name="quote" size={18} />
            <span className="t-h3">Source</span>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-6)' }} className="stack-6">
          <div>
            <div className="t-small t-3" style={{ marginBottom: 'var(--space-2)' }}>Document</div>
            <div className="t-h3" style={{ wordBreak: 'break-all' }}>{citation.docName}</div>
          </div>

          <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {citation.pageNumber != null && (
              <span className="badge badge-accent badge-dot">Page {citation.pageNumber}</span>
            )}
            <span className="badge mono" style={{ fontSize: 11 }}>{citation.docId.slice(0, 8)}</span>
            {citation.similarity != null && (
              <span className="badge numeric" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {(citation.similarity * 100).toFixed(1)}% match
              </span>
            )}
          </div>

          <div>
            <div className="t-small t-3" style={{ marginBottom: 'var(--space-2)' }}>Matched excerpt</div>
            <div
              className="panel-flush"
              style={{ padding: 'var(--space-4)', borderLeft: '3px solid var(--accent)' }}
            >
              <p className="t-body" style={{ whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>{citation.snippet}</p>
            </div>
          </div>

          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <button type="button" className="btn btn-primary" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copied' : 'Copy excerpt'}
            </button>
            <a
              href={`/dashboard/keys`}
              className="btn btn-secondary"
              onClick={onClose}
            >
              <Icon name="key" size={14} />
              Reuse as API context
            </a>
          </div>

          <details className="disclosure" style={{ marginTop: 'var(--space-4)' }}>
            <summary className="t-small t-3 row" style={{ gap: 'var(--space-2)', cursor: 'pointer', listStyle: 'none' }}>
              <Icon name="chevron-down" size={12} style={{ flex: '0 0 auto' }} />
              <span>Provenance: how this citation was retrieved</span>
            </summary>
            <div className="t-small t-3" style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', background: 'var(--panel-sunken)' }}>
              This excerpt was returned by the hybrid lexical + semantic search (reciprocal-rank fusion) and was passed to the model in the prompt context. Every claim in the answer is anchored to a specific chunk ID for verifiability.
            </div>
          </details>
        </div>
      </aside>
    </div>
  )
}
