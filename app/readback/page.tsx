'use client'
import '@/styles/readback.css'
import { useEffect, useRef } from 'react'

/**
 * Readback, ported into the suite. The framework-free engine modules
 * (components/readback/engine/*) drive the DOM by element id exactly as the
 * original vanilla SPA did; this component renders that markup (scoped under
 * .readback) and calls initReadback() once after mount.
 */
export default function ReadbackPage() {
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    // Engine touches window/document, so import + init only on the client.
    import('@/components/readback/engine/main.js').then(({ initReadback }) => initReadback())
  }, [])

  return (
    <div className="readback" data-theme="dark">
      <div className="app">
        <header className="topbar" id="topbar">
          <button className="brand" id="brand" title="New reading">Readback<span className="dot">.</span></button>
          <div className="topbar-actions">
            <button className="btn btn-ghost" id="nav-library">Library</button>
            <button className="btn btn-icon btn-ghost" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            </button>
          </div>
        </header>

        <main>
          {/* INPUT */}
          <section className="view" id="view-input">
            <div className="input-wrap">
              <div className="input-hero">
                <span className="eyebrow">Read · back</span>
                <h1>Paste it. Drop it. <em>Listen.</em></h1>
                <p>A near-human voice reads your articles aloud and lights up each word as it goes.</p>
              </div>

              <div className="composer" id="composer">
                <textarea id="paste" placeholder="Paste an article, an essay, anything worth reading…" spellCheck={false} />
                <div className="composer-foot">
                  <span className="hint" id="composer-hint">or drop a .txt, .md, .pdf, .html, or .epub</span>
                  <span className="spacer" />
                  <button className="btn" id="pick-file">Choose file</button>
                  <button className="btn btn-primary" id="read-paste">Read it</button>
                </div>
                <div className="drop-note">Drop to read</div>
              </div>

              <div className="url-row">
                <input id="url" type="url" inputMode="url" placeholder="…or paste a link to an article" />
                <button className="btn" id="read-url">Fetch</button>
              </div>

              <div className="input-error" id="input-error" role="status" aria-live="polite" />
              <input id="file-input" type="file" accept=".txt,.md,.markdown,.pdf,.html,.htm,.epub" hidden />
            </div>
          </section>

          {/* READER */}
          <section className="view" id="view-reader" hidden>
            <div className="reader-head">
              <div className="kicker">
                <span className="data" id="reader-meta">—</span>
              </div>
              <h1 id="reader-title">Untitled</h1>
            </div>
            <article className="reading" id="reading" />
          </section>

          {/* LIBRARY */}
          <section className="view" id="view-library" hidden>
            <div className="library-wrap">
              <h2>Library</h2>
              <div id="library-list" />
            </div>
          </section>
        </main>
      </div>

      {/* TRANSPORT (reader only) */}
      <div className="transport" id="transport" hidden>
        <div className="transport-controls">
          <button className="tbtn" id="skip-back" title="Previous sentence (←)" aria-label="Previous sentence">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 6h2v12H7zM20 6v12l-9-6z" /></svg>
          </button>
          <button className="play" id="play" title="Play / pause (space)" aria-label="Play">
            <svg className="i-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            <svg className="i-pause" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          </button>
          <button className="tbtn" id="skip-fwd" title="Next sentence (→)" aria-label="Next sentence">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 6h2v12h-2zM4 6l9 6-9 6z" /></svg>
          </button>
        </div>
        <div className="seek">
          <input type="range" id="seek" min="0" max="1000" defaultValue="0" aria-label="Seek" />
          <span className="time data" id="time">0:00 / 0:00</span>
        </div>
        <div className="transport-extras">
          <button className="speed-pill data" id="speed" title="Playback speed">1.0×</button>
          <select className="select" id="voice" title="Voice" aria-label="Voice" defaultValue="" />
          <label className="volume-control" title="Volume">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M5 10v4h3l4 3V7l-4 3H5zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
            </svg>
            <input type="range" id="volume" min="0" max="100" defaultValue="100" aria-label="Volume" />
          </label>
          <button className="btn btn-icon btn-ghost" id="save" title="Save to library" aria-label="Save">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          </button>
          <button className="btn btn-icon btn-ghost" id="download" title="Download MP3" aria-label="Download MP3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" /></svg>
          </button>
        </div>
      </div>

      <div className="toast" id="toast" hidden />
      <audio id="audio" preload="auto" />
    </div>
  )
}
