'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { Icon } from '@/components/Icon'
import { getBootstrapData, BootstrapData } from './actions'

interface Ctx {
  data: BootstrapData
  activeWorkspaceId: string
  setActiveWorkspaceId: (id: string) => void
  refreshData: () => Promise<void>
  setSubscription: (status: 'FREE') => Promise<void>
}

const DashboardCtx = createContext<Ctx | null>(null)
export function useDashboard() {
  const ctx = useContext(DashboardCtx)
  if (!ctx) throw new Error('useDashboard() called outside DashboardLayout')
  return ctx
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()

  const load = async (wsId?: string) => {
    setLoadError(null)
    try {
      const bt = await getBootstrapData(wsId)
      setData(bt)
      setActiveWorkspaceId((cur) => (cur && !wsId) ? cur : bt.activeWorkspaceId)
    } catch (err: any) {
      console.error('Failed to load dashboard bootstrap data:', err)
      const msg: string = err?.message || String(err)
      if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('unauthenticated')) {
        router.push('/')
      } else {
        setLoadError(msg)
      }
    }
  }

  useEffect(() => { void load() }, [])

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [children])

  const refreshData = async () => { await load(activeWorkspaceId) }
  const setSubscription = async () => { void 0 }

  if (!data && !loadError) {
    return (
      <div style={{
        display: 'grid', placeItems: 'center', minHeight: '100vh',
        background: 'var(--bg)', color: 'var(--text-3)', gap: 16, flexDirection: 'column',
      }}>
        <span className="spinner" />
        <p className="t-small">Connecting to your workspace…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{
        display: 'grid', placeItems: 'center', minHeight: '100vh',
        background: 'var(--bg)', padding: 'var(--space-6)',
      }}>
        <div style={{
          maxWidth: 520, width: '100%', background: 'var(--panel)',
          border: '1px solid var(--border-1)', borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-8)', textAlign: 'center', display: 'flex',
          flexDirection: 'column', gap: 'var(--space-4)',
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <h2 className="t-h2">Dashboard Failed to Load</h2>
          <p className="t-small t-3">The server returned an error while loading your workspace data.</p>
          <pre style={{
            background: 'var(--panel-sunken)', borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3)', fontSize: 12, textAlign: 'left',
            overflowX: 'auto', color: 'var(--danger)', whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>{loadError}</pre>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => void load()}>
              Retry
            </button>
            <Link href="/" className="btn btn-secondary">
              Back to Home
            </Link>
          </div>
          <p className="t-small t-3" style={{ marginTop: 4 }}>
            Common cause: PostgreSQL is not running. Make sure your local database is up, or check that <code style={{ background: 'var(--panel-sunken)', padding: '2px 5px', borderRadius: 4 }}>DATABASE_URL</code> in <code style={{ background: 'var(--panel-sunken)', padding: '2px 5px', borderRadius: 4 }}>.env</code> is correct.
          </p>
        </div>
      </div>
    )
  }

  const ctx: Ctx = {
    data: data!,
    activeWorkspaceId,
    setActiveWorkspaceId: (id) => { setActiveWorkspaceId(id); void load(id) },
    refreshData, setSubscription,
  }

  return (
    <DashboardCtx.Provider value={ctx}>
      {/* Mobile top bar with hamburger */}
      <div className="mobile-topbar">
        <button
          className="mobile-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation menu"
        >
          <Icon name="cpu" size={18} />
        </button>
        <span className="t-h3">{data!.tenant.name}</span>
        <div style={{ width: 40 }} />
      </div>

      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="app with-sidebar">
        <Sidebar
          tenantName={data!.tenant.name}
          subscriptionStatus={data!.tenant.subscriptionStatus}
          workspaces={data!.workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={ctx.setActiveWorkspaceId}
          currentUser={data!.currentUser}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        {children}
      </div>
    </DashboardCtx.Provider>
  )
}
