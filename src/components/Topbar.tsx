'use client'

import React from 'react'
import Link from 'next/link'
import { Icon } from './Icon'

interface TopbarProps {
  tenantName: string
  workspaces: Array<{ id: string; name: string }>
  activeWorkspaceId: string
  onSelectWorkspace: (id: string) => void
  title: string
  subtitle?: string
  breadcrumb?: { label: string; href?: string }[]
  actions?: React.ReactNode
}

export function Topbar({
  tenantName,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  title,
  subtitle,
  breadcrumb,
  actions,
}: TopbarProps) {
  const [theme, setTheme] = React.useState<string>('light')

  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
  }, [])

  const changeTheme = (nextTheme: string) => {
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    localStorage.setItem('theme', nextTheme)
  }

  return (
    <header className="topbar" style={{ height: 'auto', minHeight: 56, padding: 'var(--space-4) var(--space-6)', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      <div className="stack-1" style={{ minWidth: 0, flex: '1 1 auto' }}>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="t-small t-3" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                {b.href ? <Link href={b.href} style={{ color: 'inherit' }}>{b.label}</Link> : <span>{b.label}</span>}
                {i < breadcrumb.length - 1 && <span aria-hidden style={{ opacity: 0.5 }}>/</span>}
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 'var(--space-3)', alignItems: 'baseline' }}>
          <h1 className="t-h1" style={{ lineHeight: 1.1 }}>{title}</h1>
          {subtitle && <span className="t-small t-3">{subtitle}</span>}
        </div>
      </div>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <select
          value={activeWorkspaceId}
          onChange={(e) => onSelectWorkspace(e.target.value)}
          className="input btn-sm"
          style={{ height: 32, minWidth: 180, fontSize: 12, fontWeight: 500 }}
          aria-label="Select active workspace"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <div className="badge" title={tenantName}>
          <Icon name="logo" size={11} />
          <span style={{ maxWidth: 120, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{tenantName}</span>
        </div>
        <select
          value={theme}
          onChange={(e) => changeTheme(e.target.value)}
          className="input btn-sm"
          style={{ height: 32, minWidth: 110, fontSize: 12, fontWeight: 500 }}
          aria-label="Select theme"
        >
          <option value="light">Ink Light</option>
          <option value="dark">Ink Dark</option>
          <option value="cyberpunk">Cyberpunk</option>
          <option value="forest">Nordic Forest</option>
          <option value="cobalt">Royal Cobalt</option>
        </select>
        {actions}
      </div>
    </header>
  )
}
