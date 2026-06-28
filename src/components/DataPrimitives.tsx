'use client'

import React from 'react'
import { Icon } from './Icon'

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  delta?: { value: string; direction: 'up' | 'down' | 'flat' }
  hint?: string
  icon?: React.ReactNode
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger'
}) {
  const toneClass = `tone-${tone}`
  return (
    <div className={`panel stat-card ${toneClass}`}>
      <div className="row-between">
        <div className="t-small t-3" style={{ fontWeight: 500 }}>{label}</div>
        {icon && <div className={`stat-card-icon tone-${tone}`}>{icon}</div>}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {delta && (
          <span className={`badge tone-${tone}-badge ${directionBadge(delta.direction)}`}>
            <Icon name={delta.direction === 'up' ? 'arrow-up-right' : delta.direction === 'down' ? 'arrow-down' : 'pin'} size={11} />
            {delta.value}
          </span>
        )}
        {hint && <span className="t-small t-3">{hint}</span>}
      </div>

      <style jsx>{`
        .stat-card { padding: var(--space-5); display: grid; gap: var(--space-3); }
        .stat-card-value { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; color: var(--text-1); }
        .stat-card-icon { width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
        .tone-default .stat-card-icon { background: var(--panel-sunken); color: var(--text-2); }
        .tone-accent .stat-card-icon { background: var(--accent-soft); color: var(--accent); }
        .tone-success .stat-card-icon { background: var(--success-100); color: var(--success-600); }
        .tone-warning .stat-card-icon { background: var(--warning-100); color: var(--warning-600); }
        .tone-danger .stat-card-icon { background: var(--danger-100); color: var(--danger-600); }
        .tone-accent-badge { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
        .tone-success-badge { background: var(--success-100); color: var(--success-600); border-color: transparent; }
        .tone-warning-badge { background: var(--warning-100); color: var(--warning-600); border-color: transparent; }
        .tone-danger-badge { background: var(--danger-100); color: var(--danger-600); border-color: transparent; }
        .tone-default-badge { background: var(--panel); color: var(--text-2); }
      `}</style>
    </div>
  )
}

function directionBadge(d: 'up' | 'down' | 'flat') {
  return d === 'up' ? 'tone-success-badge' : d === 'down' ? 'tone-danger-badge' : 'tone-default-badge'
}

// Local "arrow-down" inline svg component since we removed it from Icon set:
function _unused() { return null }

export function Meter({ used, limit, valueFormatter }: { used: number; limit: number; valueFormatter?: (n: number) => string }) {
  const pct = Math.max(0, Math.min(100, Math.round((used / Math.max(1, limit)) * 100)))
  const over = used > limit
  const fmt = valueFormatter ?? ((n: number) => n.toLocaleString())
  return (
    <div className="stack-2">
      <div className="row-between">
        <span className="t-small t-2">{fmt(used)}</span>
        <span className="t-small t-3 numeric">/ {fmt(limit)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--panel-sunken)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: over ? 'var(--danger-500)' : pct > 80 ? 'var(--warning-500)' : 'var(--accent)',
            transition: 'width var(--t-slow) var(--ease)'
          }}
        />
      </div>
    </div>
  )
}
