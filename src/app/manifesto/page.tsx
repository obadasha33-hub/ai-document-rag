'use client'

import React from 'react'
import Link from 'next/link'

export default function ManifestoPage() {
  return (
    <div 
      className="min-h-screen p-6 md:p-16 flex flex-col items-center justify-between selection:bg-stone-200"
      style={{
        backgroundColor: '#faf6ee', // Premium matte newsprint beige
        color: '#121212', // High-contrast print ink
        fontFamily: "'Public Sans', -apple-system, sans-serif",
      }}
    >
      {/* 1. Dateline Header (Sunday Paper Style) */}
      <header 
        className="w-full max-w-5xl border-b-2 border-stone-800 pb-4 mb-12 flex flex-col sm:flex-row items-center justify-between text-[11px] tracking-[0.2em] font-black uppercase text-stone-600"
        style={{ letterSpacing: '0.25em' }}
      >
        <span>SECTION I: PLATFORM CHRONICLE</span>
        <span>PUBLISHED JUNE 23, 2026</span>
        <span>ACME LABS INC.</span>
      </header>

      {/* 2. Main Essay Layout Container */}
      <article className="w-full max-w-5xl flex-1 flex flex-col">
        
        {/* Oversized Serif Headline (Libre Bodoni Font) */}
        <div className="text-center md:text-left mb-12 space-y-4">
          <h1 
            className="text-5xl md:text-8xl font-bold tracking-tight leading-[0.95] text-stone-900"
            style={{ 
              fontFamily: "'Libre Bodoni', Georgia, serif",
              fontVariantLigatures: 'common-ligatures'
            }}
          >
            Democratizing <span className="line-through decoration-[6px] decoration-red-600/90 text-stone-300">Silent</span> <span className="italic font-normal text-indigo-800">Conversational</span> Enterprise Data
          </h1>
          <div className="w-20 h-1 bg-stone-900 mt-6 md:mx-0 mx-auto" />
          <p className="text-xs uppercase font-extrabold tracking-widest text-stone-500 pt-2">
            An Architectural Manifesto on Verifiable RAG Pipelines
          </p>
        </div>

        {/* 2-Column Body Block (Public Sans Font) */}
        <div 
          className="grid grid-cols-1 md:grid-cols-2 gap-10 border-b-2 border-stone-800 pb-12 text-sm leading-relaxed text-stone-800 text-justify font-normal"
          style={{ maxInlineSize: '100%' }}
        >
          <div className="space-y-4">
            <p className="first-letter:text-5xl first-letter:font-bold first-letter:font-serif first-letter:float-left first-letter:mr-2.5 first-letter:leading-[0.8] first-letter:text-stone-900">
              For decades, corporate knowledge has been held in silent custody. Terabytes of compliance protocols, layout-rich PDF invoices, standard operation procedures, and manual records reside inside isolated folder storage—dormant, unsearchable, and disconnected from daily workflows. Modern business operations demand more than raw keyword lookups; they require conversational cognitive accessibility. Yet, standard solutions introduce the risk of unbounded hallucination. When an artificial intelligence agent constructs responses without citing its references, it remains a liability.
            </p>
          </div>
          <div className="space-y-4">
            <p>
              This platform bridges this critical divide. By combining high-speed layout-preserving parsers with semantic boundary chunking, the document pipeline extracts tabular relationship contexts without corruption. We reject opaque, black-box retrieval models. By fusing dense vector cosine similarity searches with sparse keyword FTS indexes via Reciprocal Rank Fusion, the database retrieves precise text segments, delivering synthesized answers complete with clickable page-level citations.
            </p>
          </div>
        </div>

        {/* 6 Numbered Sections with Annotated Pull-Quote Captions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-12 border-b border-stone-300">
          
          {/* Section 01 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">01.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">Tenant Isolation</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Relational tables, chunk indices, and documents are hard-locked under unique organization IDs, verified at the API routing and database adapter layer.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "We treat tenancy isolation not as a query filter, but as a strict database security boundary."
            </blockquote>
          </div>

          {/* Section 02 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">02.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">Layout-Preserving Parsing</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Supports PDF, DOCX, and scanned image OCR. Automatically maps and indexes tabular cells layout-preservingly in markdown table grid formats.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "Tables must retain their structural columns, or they lose their computational meaning."
            </blockquote>
          </div>

          {/* Section 03 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">03.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">Hybrid Dense-Sparse RRF</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Connects pgvector semantic cosine distances with full-text search lexical ts_rank indexes, merged via Reciprocal Rank Fusion.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "Semantic vectors capture concepts, but lexical keyword search matches precise serial keys."
            </blockquote>
          </div>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-12">

          {/* Section 04 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">04.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">Interactive Citations</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Assistant responses feature inline page tags. Hovering previews document snippets, and clicking opens the visual document viewer.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "Trust is built on auditability. Clicking a citation must guide users straight to the source."
            </blockquote>
          </div>

          {/* Section 05 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">05.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">Free Tier Quotas</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Active tenant usage logs calculate stored document counts and query volumes, with friendly hard limits on the free tier.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "Clear, self-service consumption logs allow enterprise scale without unexpected costs."
            </blockquote>
          </div>

          {/* Section 06 */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-stone-300 font-sans">06.</span>
                <h3 className="font-sans font-black text-xs uppercase tracking-wider text-stone-900">24-Hour GDPR Purging</h3>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                Cascading transaction deletes wipe workspace files, database rows, and chunk vectors within a regulatory-compliant 24h window.
              </p>
            </div>
            <blockquote className="border-l-4 border-indigo-700 pl-3 py-1 italic text-stone-900 text-xs leading-snug font-medium">
              "Data compliance requires physical hard deletes. Erased means permanently forgotten."
            </blockquote>
          </div>

        </div>

      </article>

      {/* 3. Editorial Footer (Sunday Paper Style) */}
      <footer className="w-full max-w-5xl border-t-2 border-stone-800 pt-6 mt-12 flex flex-col sm:flex-row items-center justify-between text-[11px] tracking-widest font-black uppercase text-stone-600">
        <span>© 2026 ACME DATA INTELLIGENCE LABS</span>
        <div className="flex gap-8 mt-4 sm:mt-0">
          <Link 
            href="/dashboard" 
            className="hover:text-stone-900 transition-colors cursor-pointer"
            style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}
          >
            Enter Platform Dashboard →
          </Link>
        </div>
      </footer>
    </div>
  )
}
