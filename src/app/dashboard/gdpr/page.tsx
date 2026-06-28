'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDashboard } from '../layout'
import { Icon } from '@/components/Icon'

export default function GdprPage() {
  const { data, activeWorkspaceId, refreshData, setActiveWorkspaceId } = useDashboard()
  const { tenant, token, workspaces } = data
  const router = useRouter()

  const [confirmText, setConfirmText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const activeWorkspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name || 'Default Workspace'
  const isMatch = confirmText.trim() === activeWorkspaceName

  const handlePurgeWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isMatch || isSubmitting) return

    if (!confirm(`WARNING: This will permanently delete '${activeWorkspaceName}', including all documents, vector database embeddings, and chat history. This action is irreversible. Proceed?`)) return

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/workspace/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenant.id,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ workspaceId: activeWorkspaceId })
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP error ${res.status}`)
      }

      setSuccessMsg(`Workspace '${activeWorkspaceName}' was permanently purged under GDPR regulations.`)
      setConfirmText('')
      
      // Refresh context data
      await refreshData()
      
      // Redirect to overview
      setTimeout(() => {
        setSuccessMsg(null)
        router.push('/dashboard')
      }, 3000)

    } catch (err: any) {
      console.error('Failed to purge workspace:', err)
      setErrorMsg(err.message || 'Failed to perform deep GDPR purge.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-content">
      <div className="stack-6">
        <header>
          <h1 className="t-h1">GDPR hard purge</h1>
          <p className="t-small t-3" style={{ marginTop: 6 }}>
            Cascading delete of workspace, documents, chunks, chat history, and stored files. Irreversible.
          </p>
        </header>

        {/* Global Feedback Banner */}
        {successMsg && (
          <div className="badge badge-success row" style={{ padding: 'var(--space-3)', width: '100%', gap: 'var(--space-2)' }}>
            <Icon name="spark" size={12} />
            <span>{successMsg} Redirecting to overview...</span>
          </div>
        )}

        {errorMsg && (
          <div className="badge badge-danger row" style={{ padding: 'var(--space-3)', width: '100%', gap: 'var(--space-2)' }}>
            <Icon name="logo" size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        <section className="panel" style={{ padding: 'var(--space-6)' }}>
          <ul className="stack-3" style={{ listStyle: 'none', padding: 0 }}>
            <li className="row" style={{ gap: 'var(--space-3)' }}>
              <Icon name="trash" size={14} />
              <span>Documents & indexed vector chunks will be deleted.</span>
            </li>
            <li className="row" style={{ gap: 'var(--space-3)' }}>
              <Icon name="quote" size={14} />
              <span>Chat threads & conversation messages purged.</span>
            </li>
            <li className="row" style={{ gap: 'var(--space-3)' }}>
              <Icon name="cloud" size={14} />
              <span>Stored files on disk removed; remote storage flagged for deletion.</span>
            </li>
            <li className="row" style={{ gap: 'var(--space-3)' }}>
              <Icon name="shield" size={14} />
              <span>An audit log entry is written first; it is permanent.</span>
            </li>
          </ul>
        </section>

        <section
          className="panel"
          style={{ padding: 'var(--space-6)', borderColor: 'var(--danger-500)', borderStyle: 'solid', borderWidth: 1 }}
        >
          <h2 className="t-h3" style={{ color: 'var(--danger-600)' }}>Purge this workspace</h2>
          <p className="t-small t-2" style={{ marginTop: 8 }}>
            Type <strong style={{ color: 'var(--text-1)' }}>{activeWorkspaceName}</strong> below to confirm.
          </p>

          <form onSubmit={handlePurgeWorkspace} className="stack-4" style={{ marginTop: 'var(--space-4)' }}>
            <input
              className="input"
              style={{ width: '100%', maxWidth: 360 }}
              placeholder={activeWorkspaceName}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isSubmitting}
            />

            <button
              type="submit"
              disabled={!isMatch || isSubmitting}
              className="btn btn-danger"
              style={{ display: 'inline-flex', alignSelf: 'flex-start' }}
            >
              {isSubmitting ? (
                <span className="spinner spinner-sm" />
              ) : (
                <Icon name="trash" size={14} />
              )}
              Purge Workspace
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
