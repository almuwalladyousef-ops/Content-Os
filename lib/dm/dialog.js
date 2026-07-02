'use client'

// In-app confirm / alert dialogs. The Content OS desktop shell runs the app in
// a WKWebView that has no handler for native window.confirm/alert, so those
// silently return false and block actions like deleting a rule. These render a
// themed modal instead, so they work both in the desktop view and on the web.

function dialog({ message, withCancel, confirmLabel, cancelLabel, danger }) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(false)

    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;' +
      'background:oklch(0 0 0 / 0.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);'

    const card = document.createElement('div')
    card.style.cssText =
      'width:360px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:14px;' +
      'box-shadow:0 22px 48px oklch(0 0 0 / 0.5);padding:20px;display:flex;flex-direction:column;gap:16px;' +
      'font-family:var(--font-sans);'

    const msg = document.createElement('p')
    msg.textContent = message
    msg.style.cssText = 'margin:0;font-size:14px;line-height:1.5;color:var(--text);white-space:pre-wrap;'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;'

    function close(value) {
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      resolve(value)
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }

    if (withCancel) {
      const cancel = document.createElement('button')
      cancel.textContent = cancelLabel || 'Cancel'
      cancel.style.cssText =
        'padding:8px 16px;border-radius:8px;border:1px solid var(--border);font-size:13px;font-weight:500;' +
        'cursor:pointer;background:var(--surface-2);color:var(--text);'
      cancel.addEventListener('click', () => close(false))
      row.appendChild(cancel)
    }

    const ok = document.createElement('button')
    ok.textContent = confirmLabel || 'OK'
    ok.style.cssText =
      'padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;' +
      'color:var(--on-accent);background:' + (danger ? 'var(--danger)' : 'var(--accent)') + ';'
    ok.addEventListener('click', () => close(true))
    row.appendChild(ok)

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false) })
    document.addEventListener('keydown', onKey)

    card.appendChild(msg)
    card.appendChild(row)
    overlay.appendChild(card)
    document.body.appendChild(overlay)
    ok.focus()
  })
}

export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false } = {}) {
  return dialog({ message, withCancel: true, confirmLabel, danger })
}

export function alertDialog(message) {
  return dialog({ message, withCancel: false, confirmLabel: 'OK' })
}
