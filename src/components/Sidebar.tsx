'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from './Icon'

interface SidebarProps {
  tenantName: string
  subscriptionStatus: string
  workspaces: Array<{ id: string; name: string }>
  activeWorkspaceId: string
  onSelectWorkspace: (id: string) => void
  currentUser: { name: string; email: string }
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({
  tenantName,
  subscriptionStatus,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  currentUser,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href

  const [theme, setTheme] = React.useState('light')

  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'
    setTheme(savedTheme)
  }, [])

  const changeTheme = (nextTheme: string) => {
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    localStorage.setItem('theme', nextTheme)
  }

  const handleNavClick = () => {
    if (onClose) onClose()
  }

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      {onClose && (
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={onClose}
          aria-label="Close sidebar"
          style={{ alignSelf: 'flex-end', marginBottom: 'var(--space-2)' }}
        >
          <Icon name="arrow-left" size={16} />
        </button>
      )}

      <Link href="/" className="row" style={{ padding: '0 4px', textDecoration: 'none' }} onClick={handleNavClick}>
        <div
          className="row"
          style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'var(--accent)', color: 'var(--on-accent)',
            justifyContent: 'center'
          }}
        >
          <Icon name="logo" size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="t-h3" style={{ lineHeight: 1.1 }}>{tenantName}</div>
          <div className="t-small t-3">
            {subscriptionStatus === 'ACTIVE' ? 'Pro' : 'Free'}
          </div>
        </div>
      </Link>

      <div>
        <div className="nav-section-label">Workspace</div>
        <select
          value={activeWorkspaceId}
          onChange={(e) => onSelectWorkspace(e.target.value)}
          className="input"
          style={{ width: '100%' }}
          aria-label="Select active workspace"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 'var(--space-2)' }}>
        <div className="nav-section-label">Theme</div>
        <select
          value={theme}
          onChange={(e) => changeTheme(e.target.value)}
          className="input"
          style={{ width: '100%' }}
          aria-label="Select theme"
        >
          <option value="light">Ink Light</option>
          <option value="dark">Ink Dark</option>
          <option value="cyberpunk">Cyberpunk</option>
          <option value="forest">Nordic Forest</option>
          <option value="cobalt">Royal Cobalt</option>
        </select>
      </div>

      <nav className="nav-group" aria-label="Main Navigation">
        <div className="nav-section-label">Navigate</div>
        <Link href="/dashboard" className="nav-item" data-active={isActive('/dashboard')} onClick={handleNavClick}>
          <Icon name="cpu" size={16} />
          <span>Overview</span>
        </Link>
        <Link href="/dashboard/chat" className="nav-item" data-active={isActive('/dashboard/chat')} onClick={handleNavClick}>
          <Icon name="quote" size={16} />
          <span>Ask</span>
        </Link>
      </nav>

      <nav className="nav-group" aria-label="Compliance Navigation">
        <div className="nav-section-label">Compliance</div>
        <Link href="/dashboard/gdpr" className="nav-item" data-active={pathname?.startsWith('/dashboard/gdpr')} onClick={handleNavClick}>
          <Icon name="shield" size={16} />
          <span>GDPR purge</span>
        </Link>
      </nav>

      <nav className="nav-group" aria-label="System Navigation" style={{ marginTop: 'auto', marginBottom: 'var(--space-3)' }}>
        <Link href="/" className="nav-item" onClick={handleNavClick}>
          <Icon name="arrow-left" size={16} />
          <span>Exit Workspace</span>
        </Link>
      </nav>

      <div style={{ borderTop: '1px solid var(--border-1)', paddingTop: 'var(--space-4)' }}>
        <div className="row" style={{ minWidth: 0 }}>
          <div
            className="row"
            style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              justifyContent: 'center',
              fontWeight: 600,
              flex: '0 0 auto'
            }}
          >
            {currentUser.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="t-small" style={{ fontWeight: 500 }}>{currentUser.name}</div>
            <div className="t-small t-3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.email}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
