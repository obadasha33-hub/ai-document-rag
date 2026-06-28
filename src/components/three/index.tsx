'use client'

import dynamic from 'next/dynamic'

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: 'var(--bg)',
      }}
      aria-hidden
    />
  ),
})

const PipelineViz = dynamic(() => import('./PipelineViz'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: 'var(--bg)',
      }}
      aria-hidden
    />
  ),
})

const ChatLoading3D = dynamic(() => import('./ChatLoading3D'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: 48,
        height: 48,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span className="spinner spinner-sm" />
    </div>
  ),
})

export { HeroScene, PipelineViz, ChatLoading3D }
