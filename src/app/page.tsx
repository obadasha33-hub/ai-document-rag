'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/Icon'
import { HeroScene, PipelineViz } from '@/components/three'
import { SignInButton, useUser, UserButton } from '@clerk/nextjs'

export default function LandingPage() {
  const { user, isLoaded, isSignedIn } = useUser()
  const [showTutorial, setShowTutorial] = useState(false)
  const [theme, setTheme] = useState('light')
  const router = useRouter()

  useEffect(() => {
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

  if (!isLoaded) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-3)' }}>
        <span className="spinner spinner-sm" />
      </div>
    )
  }

  return (
    <main className="surface-marketing" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* 1. Viewport-spanning interactive 3D WebGL cosmic fluid backgrounds */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {isSignedIn ? <PipelineViz /> : <HeroScene />}
      </div>

      {/* 2. Top Navigation Bar (floating above the 3D scene) */}
      <header className="row-between" style={{ 
        maxWidth: 1080, 
        margin: '0 auto', 
        padding: 'var(--space-6) var(--space-4)',
        position: 'relative',
        zIndex: 10,
        width: '100%',
      }}>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <Link href="/" className="row" style={{ gap: 'var(--space-3)' }}>
            <span 
              style={{ 
                width: 32, 
                height: 32, 
                borderRadius: 10, 
                background: 'var(--accent)', 
                color: 'var(--on-accent)', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}
            >
              <Icon name="logo" size={16} />
            </span>
            <span className="t-h3" style={{ fontWeight: 700 }}>VeritasDoc</span>
          </Link>
        </div>
        <nav className="row landing-nav" style={{ gap: 'var(--space-3)', pointerEvents: 'auto' }}>
          <select
            value={theme}
            onChange={(e) => changeTheme(e.target.value)}
            className="input btn-sm"
            style={{ height: 32, minWidth: 110, fontSize: 12, fontWeight: 500, width: 'auto', pointerEvents: 'auto' }}
            aria-label="Select theme"
          >
            <option value="light">Ink Light</option>
            <option value="dark">Ink Dark</option>
            <option value="cyberpunk">Cyberpunk</option>
            <option value="forest">Nordic Forest</option>
            <option value="cobalt">Royal Cobalt</option>
          </select>
          {isSignedIn ? (
            <>
              <span className="t-small t-3 signed-in-label">Signed in as <strong className="t-2">{user.primaryEmailAddress?.emailAddress}</strong></span>
              <UserButton />
            </>
          ) : (
            <span className="t-small t-3">Secure Document Intelligence</span>
          )}
        </nav>
      </header>

      {/* 3. Central Content Overlay Container (sits above background, with pointer-events reset for actions) */}
      <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 5, padding: 'var(--space-12) var(--space-4)' }}>
        {!isSignedIn ? (
          /* =========================================================================
           *  STATE A: Logged Out Landing Page
           *  Volumetric cosmic fluid nebula background with glassmorphic contrast card
           * ========================================================================= */
          <section className="hero" style={{ 
            maxWidth: 820, 
            margin: '0 auto', 
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}>
            {/* Glassmorphic backdrop to ensure high contrast readability over active particles */}
            <div style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              background: 'color-mix(in srgb, var(--panel) 45%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border-1) 25%, transparent)',
              padding: 'var(--space-8) var(--space-6) var(--space-10)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              width: '100%',
            }}>
              <span 
                className="badge badge-accent" 
                style={{ marginBottom: 'var(--space-2)', alignSelf: 'center' }}
              >
                <Icon name="shield" size={11} />
                Isolated Enterprise Knowledge Base
              </span>
              <h1 
                className="t-display" 
                style={{ 
                  lineHeight: 1.1,
                  margin: 0
                }}
              >
                VeritasDoc — Secure Multi-Tenant Semantic RAG Platform
              </h1>
              <p 
                className="t-body t-2" 
                style={{ 
                  maxWidth: 620, 
                  margin: '0 auto var(--space-4)' 
                }}
              >
                Upload PDFs, DOCX, and Markdown into an isolated, per-tenant PostgreSQL schema.
                Retrieve highly context-accurate information and stream answers backed by verifiable citations.
              </p>

              {/* Clerk Sign In / Sign Up Button */}
              <div style={{ display: 'inline-block', margin: '0 auto', pointerEvents: 'auto' }}>
                <SignInButton mode="modal" signUpForceRedirectUrl="/dashboard" fallbackRedirectUrl="/dashboard">
                  <button className="btn btn-primary btn-lg" style={{ minWidth: 240, height: 48, fontSize: 15, cursor: 'pointer' }}>
                    Sign In / Sign Up
                    <Icon name="arrow-right" size={16} style={{ marginLeft: 8 }} />
                  </button>
                </SignInButton>
              </div>
            </div>
          </section>
        ) : (
          /* =========================================================================
           *  STATE B: Logged In Landing Page
           *  Spans active 3D particle data stream background with glassmorphic cockpit console
           * ========================================================================= */
          <section className="hero" style={{ 
            maxWidth: 820, 
            margin: '0 auto', 
            width: '100%',
          }}>
            {/* Cockpit Glassmorphic legible panel */}
            <div style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              background: 'color-mix(in srgb, var(--panel) 45%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border-1) 25%, transparent)',
              padding: 'var(--space-8) var(--space-6) var(--space-10)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-3)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-6)',
              width: '100%',
            }}>
              <div className="stack-2">
                <span 
                  className="badge badge-accent" 
                  style={{ alignSelf: 'center', margin: '0 auto' }}
                >
                  <Icon name="spark" size={11} />
                  Session Authenticated
                </span>
                <h1 
                  className="t-display" 
                  style={{ 
                    lineHeight: 1.1,
                    margin: 0
                  }}
                >
                  Welcome Back! Your Document Intelligence Pipeline is Active.
                </h1>
                <p 
                  className="t-body t-2" 
                  style={{ 
                    maxWidth: 620, 
                    margin: '0 auto' 
                  }}
                >
                  Your tenant-isolated space is ready. You can query ingested files, trace citations back to source paragraphs, and manage workspaces securely.
                </p>
              </div>

              <div className="row" style={{ gap: 'var(--space-4)', justifyContent: 'center', flexWrap: 'wrap', pointerEvents: 'auto' }}>
                <button 
                  onClick={() => setShowTutorial(true)} 
                  className="btn btn-lg" 
                  style={{ 
                    background: 'var(--panel)', 
                    borderColor: 'var(--accent)', 
                    color: 'var(--accent)',
                    borderWidth: 1,
                    borderStyle: 'solid',
                  }}
                >
                  <Icon name="shield" size={14} />
                  Guiding Tutorial
                </button>

                <Link 
                  href="/dashboard" 
                  className="btn btn-primary btn-lg"
                >
                  <Icon name="cpu" size={14} />
                  Start Using
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 4. Tutorial Modal */}
      {showTutorial && (
        <div className="modal-overlay" onClick={() => setShowTutorial(false)} style={{ pointerEvents: 'auto' }}>
          <div className="modal-content panel stack-6" onClick={(e) => e.stopPropagation()}>
            <header className="row-between" style={{ borderBottom: '1px solid var(--border-1)', paddingBottom: 'var(--space-4)' }}>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <Icon name="shield" size={16} />
                <h2 className="t-h2">VeritasDoc System Guide</h2>
              </div>
              <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowTutorial(false)} aria-label="Close guide">
                <Icon name="logo" size={12} />
              </button>
            </header>
            
            <div className="stack-5" style={{ overflowY: 'auto', maxHeight: '60vh', paddingRight: 'var(--space-2)', textAlign: 'left' }}>
              <section className="stack-2">
                <h3 className="t-h3 t-a" style={{ color: 'var(--accent)' }}>What is this system?</h3>
                <p className="t-body t-2">
                  VeritasDoc is a state-of-the-art **Retrieval-Augmented Generation (RAG)** platform designed specifically for secure enterprise document operations. 
                  It parses high-fidelity contents, extracts structured tables, creates semantic context blocks, and stores them in isolated schemas.
                </p>
              </section>

              <section className="stack-2">
                <h3 className="t-h3 t-a" style={{ color: 'var(--accent)' }}>Why was it designed?</h3>
                <p className="t-body t-2">
                  Standard LLM models suffer from hallucinations and data leakage risks. VeritasDoc was architected to solve this:
                </p>
                <ul style={{ paddingLeft: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }} className="t-small t-2">
                  <li><strong>Security & Isolation:</strong> Strict multi-tenant isolation ensures one client can never query or view another client's records.</li>
                  <li><strong>Audit Logs & Compliance:</strong> Keeps track of system mutations with GDPR purge support to securely delete whole workspaces.</li>
                  <li><strong>Verifiable Citations:</strong> Answers trace back to exact source text blocks, giving you absolute confidence in the output.</li>
                </ul>
              </section>

              <section className="stack-2">
                <h3 className="t-h3 t-a" style={{ color: 'var(--accent)' }}>How to use it?</h3>
                <ol style={{ paddingLeft: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }} className="t-small t-2">
                  <li><strong>Ingest:</strong> Open the dashboard and upload files. The backend extracts text and builds embeddings.</li>
                  <li><strong>Chat:</strong> Head to the Ask Workspace panel, query your documents, and click citations to check evidence.</li>
                  <li><strong>Manage:</strong> Generate API keys to query the index from your external applications.</li>
                </ol>
              </section>
            </div>

            <footer className="row-between" style={{ borderTop: '1px solid var(--border-1)', paddingTop: 'var(--space-4)' }}>
              <span className="t-small t-3">Ready to begin?</span>
              <button className="btn btn-primary" onClick={() => { setShowTutorial(false); router.push('/dashboard') }}>
                Enter Dashboard
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 5. Root Footer */}
      <footer 
        style={{ 
          maxWidth: 1080, 
          margin: '0 auto', 
          padding: 'var(--space-8) var(--space-6)', 
          borderTop: '1px solid var(--border-1)',
          width: '100%',
          position: 'relative',
          zIndex: 10,
        }}
        className="row-between"
      >
        <span className="t-small t-3">© VeritasDoc</span>
        <span className="t-small t-3">Next.js · Prisma · PostgreSQL · Gemini SDK</span>
      </footer>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: var(--overlay);
          display: grid;
          place-items: center;
          z-index: 100;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: var(--panel);
          width: 90%;
          max-width: 560px;
          max-height: 85vh;
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-3);
          animation: modal-fade var(--t-base) var(--ease);
        }
        @keyframes modal-fade {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </main>
  )
}
