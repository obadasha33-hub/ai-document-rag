'use client'
import React from 'react'
import Link from 'next/link'
import { useDashboard } from './layout'
import { StatCard, Meter } from '@/components/DataPrimitives'
import { UploadWidget } from '@/components/UploadWidget'
import { Icon } from '@/components/Icon'

const formatBytes = (b: number) => {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1_048_576).toFixed(1)} MB`
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const statusBadge: Record<string, { label: string; tone: string }> = {
  INDEXED: { label: 'Ready', tone: 'badge-success' },
  PROCESSING: { label: 'Parsing', tone: 'badge-warning' },
  UPLOADING: { label: 'Ingesting', tone: 'badge badge-accent' },
  ERROR: { label: 'Failed', tone: 'badge-danger' },
}

export default function OverviewPage() {
  const { data, activeWorkspaceId, refreshData } = useDashboard()
  if (!data) return null

  const { tenant, usage, documents, workspaces } = data
  const documentsThisMonth = usage.documentCount
  const documentsLimit = usage.limitDocuments
  const queriesThisMonth = usage.queryCount
  const queriesLimit = usage.limitQueries

  const isOverDocLimit = documentsThisMonth >= documentsLimit
  const isOverQueryLimit = queriesThisMonth >= queriesLimit

  const workspaceName = workspaces.find((w) => w.id === activeWorkspaceId)?.name ?? 'Workspace'

  return (
    <main className="app-content">
      <div className="stack-6">
        <header className="row-between" style={{ alignItems: 'flex-end' }}>
          <div className="stack-2">
            <div className="t-small t-3">{workspaceName}</div>
            <h1 className="t-h1">{tenant.name}</h1>
          </div>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <Link href="/dashboard/chat" className="btn btn-secondary">
              <Icon name="quote" size={14} />
              Ask your workspace
            </Link>
          </div>
        </header>

        <div className="stat-grid">
          <StatCard
            label="Documents indexed"
            value={documentsThisMonth.toLocaleString()}
            hint={`of ${documentsLimit.toLocaleString()} this month`}
            tone={isOverDocLimit ? 'warning' : 'accent'}
            icon={<Icon name="doc" size={16} />}
          />
          <StatCard
            label="Chat queries"
            value={queriesThisMonth.toLocaleString()}
            hint={`of ${queriesLimit.toLocaleString()} this month`}
            tone={isOverQueryLimit ? 'warning' : 'accent'}
            icon={<Icon name="quote" size={16} />}
          />
          <StatCard
            label="Storage"
            value={formatBytes(usage.storageBytes)}
            hint="month-to-date"
            icon={<Icon name="cloud" size={16} />}
          />
          <StatCard
            label="Tier"
            value="FREE"
            hint="100% free platform"
            tone="default"
            icon={<Icon name="shield" size={16} />}
          />
        </div>

        <div className="two-col">
          <section className="panel" style={{ padding: 'var(--space-6)' }}>
            <div className="row-between" style={{ marginBottom: 'var(--space-5)' }}>
              <div>
                <h2 className="t-h2">Add a document</h2>
                <p className="t-small t-3" style={{ marginTop: 6 }}>
                  Ingested files are chunked, embedded and indexed for retrieval across this workspace.
                </p>
              </div>
            </div>
            <UploadWidget
              tenantId={tenant.id}
              workspaceId={activeWorkspaceId}
              token={data.token}
              onUploadSuccess={refreshData}
            />
            <div className="t-small t-3" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--panel-sunken)', borderRadius: 'var(--radius-sm)' }}>
              <strong className="t-2">Free tier quota:</strong> {documentsLimit.toLocaleString()} documents, {queriesLimit.toLocaleString()}/mo queries.
            </div>
          </section>

          <section className="panel" style={{ padding: 'var(--space-6)' }}>
            <div className="row-between" style={{ marginBottom: 'var(--space-5)' }}>
              <div>
                <h2 className="t-h2">Quota</h2>
                <p className="t-small t-3" style={{ marginTop: 6 }}>
                  Current month usage against free tier ceilings.
                </p>
              </div>
            </div>
            <div className="stack-5">
              <div>
                <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="t-small t-2">Documents</span>
                  <span className="t-small t-3 numeric">{documentsThisMonth.toLocaleString()} / {documentsLimit.toLocaleString()}</span>
                </div>
                <Meter used={documentsThisMonth} limit={documentsLimit} />
              </div>
              <div>
                <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="t-small t-2">Chat queries</span>
                  <span className="t-small t-3 numeric">{queriesThisMonth.toLocaleString()} / {queriesLimit.toLocaleString()}</span>
                </div>
                <Meter used={queriesThisMonth} limit={queriesLimit} />
              </div>
              <div>
                <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                  <span className="t-small t-2">Storage</span>
                  <span className="t-small t-3 numeric">{formatBytes(usage.storageBytes)}</span>
                </div>
                <Meter used={usage.storageBytes} limit={50 * 1024 ** 2} valueFormatter={(n) => formatBytes(n)} />
              </div>
            </div>
          </section>
        </div>

        <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row-between" style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border-1)' }}>
            <div>
              <h2 className="t-h2">Documents in this workspace</h2>
              <p className="t-small t-3" style={{ marginTop: 6 }}>
                {documents.length === 0
                  ? 'No documents yet — upload one above.'
                  : `${documents.length} document${documents.length === 1 ? '' : 's'} ready to be asked.`}
              </p>
            </div>
          </div>
          {documents.length === 0 ? (
            <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-3)' }}>
              <Icon name="doc" size={28} />
              <p className="t-small" style={{ marginTop: 8 }}>Nothing here yet.</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Size</th>
                  <th>Added</th>
                  <th>Status</th>
                  <th>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const cfg = statusBadge[d.status] ?? { label: d.status, tone: 'badge' }
                  return (
                    <tr key={d.id}>
                      <td>
                        <div className="row" style={{ gap: 'var(--space-2)' }}>
                          <Icon name="doc" size={14} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                        </div>
                      </td>
                      <td className="num mono">{formatBytes(d.fileSize)}</td>
                      <td className="t-small t-2">{formatDate(d.createdAt)}</td>
                      <td><span className={`badge ${cfg.tone} badge-dot`}>{cfg.label}</span></td>
                      <td className="t-small t-2">{workspaceName}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <style jsx>{`
        .stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: var(--space-4);
        }
        .two-col {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-4);
        }
        /* --bp-xl = 1100px */
        @media (min-width: 1100px) {
          .two-col {
            grid-template-columns: 1.2fr 1fr;
          }
        }
      `}</style>
    </main>
  )
}