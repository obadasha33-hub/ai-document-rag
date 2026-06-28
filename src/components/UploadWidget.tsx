'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Icon } from './Icon'

interface UploadWidgetProps {
  tenantId: string
  workspaceId: string
  token: string
  onUploadSuccess: () => void
}

type Step = 'idle' | 'uploading' | 'parsing' | 'indexed' | 'error'

export function UploadWidget({
  tenantId,
  workspaceId,
  token,
  onUploadSuccess,
}: UploadWidgetProps) {
  const [step, setStep] = useState<Step>('idle')
  const [fileName, setFileName] = useState<string>('')
  const [fileSize, setFileSize] = useState<number>(0)
  const [progress, setProgress] = useState<number>(0)
  const [chunksCount, setChunksCount] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const send = useCallback(async (file: File) => {
    if (!file || file.size === 0) { setStep('error'); setErrorMsg('Empty file.'); return }
    if (file.size > 15 * 1024 * 1024) { setStep('error'); setErrorMsg('File exceeds 15 MB upload limit.'); return }
    setFileName(file.name); setFileSize(file.size); setProgress(8); setStep('uploading'); setErrorMsg('')

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('workspaceId', workspaceId)

      const tick = setInterval(() => setProgress((p) => Math.min(80, p + 8)), 220)
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: form,
      })
      clearInterval(tick)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setStep('error')
        setErrorMsg(data.error || `Ingestion failed (${res.status})`)
        return
      }

      setProgress(92); setStep('parsing')
      const body = await res.json()
      setChunksCount(body.chunksCount ?? 0)
      setProgress(100); setStep('indexed')
      onUploadSuccess()
      setTimeout(() => setStep('idle'), 2400)
    } catch (err: any) {
      setStep('error')
      setErrorMsg(err?.message || 'Network error during upload.')
    }
  }, [tenantId, workspaceId, token, onUploadSuccess])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void send(f)
  }
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void send(f)
    e.target.value = ''
  }
  const reset = () => { setStep('idle'); setProgress(0); setErrorMsg('') }

  const sizeText = (b: number) => b < 1024 ? `${b} B` : b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`

  return (
    <div>
      <input ref={inputRef} type="file" className="sr-only" accept=".pdf,.txt,.docx,.html,.md,.csv"
        onChange={onPick} aria-hidden tabIndex={-1} />

      {step === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="panel"
          style={{
            display: 'block', width: '100%',
            padding: 'var(--space-10)', textAlign: 'center',
            border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-2)'}`,
            background: dragOver ? 'var(--accent-soft)' : 'var(--panel)'
          }}
          aria-label="Upload document"
        >
          <div className="stack-3" style={{ alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="upload" size={20} />
            </div>
            <div>
              <div className="t-h3">Drop a document here</div>
              <div className="t-small t-3" style={{ marginTop: 4 }}>
                PDF, DOCX, TXT, MD, HTML, CSV. Max 15 MB.
              </div>
            </div>
            <span className="btn btn-secondary btn-sm">Browse files</span>
          </div>
        </button>
      )}

      {(step === 'uploading' || step === 'parsing') && (
        <div className="panel" style={{ padding: 'var(--space-6)' }}>
          <div className="row" style={{ gap: 'var(--space-4)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="spinner" size={18} className="spinner" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
              <div className="t-small t-3 numeric">{sizeText(fileSize)} • {step === 'uploading' ? 'Uploading' : 'Parsing & chunking'}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <div style={{ height: 6, background: 'var(--panel-sunken)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width var(--t-base) var(--ease)' }} />
            </div>
            <div className="t-small t-3 numeric" style={{ marginTop: 6, textAlign: 'right' }}>{Math.round(progress)}%</div>
          </div>
        </div>
      )}

      {step === 'indexed' && (
        <div className="panel" style={{ padding: 'var(--space-5)' }}>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--success-100)', color: 'var(--success-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="check" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-h3">{fileName}</div>
              <div className="t-small t-3">
                <span className="badge badge-success badge-dot">{chunksCount} chunks indexed</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="panel" style={{ padding: 'var(--space-5)', borderColor: 'var(--danger-500)' }}>
          <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--danger-100)', color: 'var(--danger-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
              <Icon name="x" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t-h3">Couldn't index {fileName || 'file'}</div>
              <div className="t-small t-2" style={{ marginTop: 6, padding: 'var(--space-2) var(--space-3)', background: 'var(--danger-100)', borderRadius: 'var(--radius-sm)', color: 'var(--danger-600)' }}>{errorMsg}</div>
              <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                <button type="button" onClick={reset} className="btn btn-secondary btn-sm">Try again</button>
                <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-ghost btn-sm">Pick a different file</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
