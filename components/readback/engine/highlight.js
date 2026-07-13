// The reading lamp. Given timed words and their spans, light the word being
// spoken, dim the ones already read, and keep the active line parked high in
// the viewport (teleprompter feel).

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Edge's word offsets land a touch behind what you actually hear; lead slightly
// so the lit word matches the spoken word.
const LEAD_MS = 175;

// When the reader scrolls by hand, back off auto-scroll so we don't yank them
// away from where they're reading.
const SCROLL_SUSPEND_MS = 5000;
let suspendScrollUntil = 0;
const noteUserScroll = () => { suspendScrollUntil = Date.now() + SCROLL_SUSPEND_MS; };
window.addEventListener('wheel', noteUserScroll, { passive: true });
window.addEventListener('touchmove', noteUserScroll, { passive: true });
window.addEventListener('keydown', (e) => {
  if (['PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) noteUserScroll();
}, { passive: true });

export function createHighlighter() {
  let offsets = [];      // ascending offsetMs for timed words
  let spans = [];        // span aligned to `offsets`
  let timeByToken = new Map();
  let active = -1;

  function findActive(t) {
    let lo = 0, hi = offsets.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }

  // The suite shell scrolls a <main> container, not the window — walk up from
  // the span to whichever ancestor actually scrolls.
  function scrollParent(el) {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.scrollHeight > n.clientHeight + 1) {
        const { overflowY } = getComputedStyle(n);
        if (overflowY === 'auto' || overflowY === 'scroll') return n;
      }
    }
    return null;
  }

  function scrollToActive(span) {
    if (Date.now() < suspendScrollUntil) return; // reader is scrolling by hand
    const rect = span.getBoundingClientRect();
    const band = window.innerHeight;
    // Only nudge when the active word drifts out of a comfortable reading band.
    if (rect.top > band * 0.2 && rect.top < band * 0.62) return;
    const delta = rect.top - band * 0.32;
    const container = scrollParent(span);
    if (container) container.scrollBy({ top: delta, behavior: reducedMotion ? 'auto' : 'smooth' });
    else window.scrollBy({ top: delta, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  function setActive(idx) {
    if (idx === active) return;
    const lo = Math.max(Math.min(active, idx), 0);
    const hi = Math.max(active, idx);
    for (let k = lo; k <= hi; k++) {
      const span = spans[k];
      if (!span) continue;
      if (k < idx) { span.classList.add('is-read'); span.classList.remove('is-active'); }
      else if (k === idx) { span.classList.add('is-active'); span.classList.remove('is-read'); }
      else { span.classList.remove('is-read', 'is-active'); }
    }
    active = idx;
    if (idx >= 0 && spans[idx]) scrollToActive(spans[idx]);
  }

  return {
    setWords(words, spanByToken) {
      // Timings are refined every time a background sentence arrives. Preserve
      // the active token instead of repainting every word in the article.
      const activeToken = active >= 0 ? Number(spans[active]?.dataset.i) : null;
      offsets = []; spans = []; timeByToken = new Map(); active = -1;
      for (const w of words) {
        timeByToken.set(w.tokenIndex, w.offsetMs);
        if (w.offsetMs == null) continue;
        const span = spanByToken.get(w.tokenIndex);
        if (!span) continue;
        offsets.push(w.offsetMs);
        spans.push(span);
      }
      if (activeToken != null) {
        active = spans.findIndex((span) => Number(span.dataset.i) === activeToken);
      }
    },
    update(timeMs) { setActive(findActive(timeMs + LEAD_MS)); },
    reset() {
      for (const s of spans) s.classList.remove('is-active', 'is-read');
      active = -1;
    },
    /** Nearest timed offset for a token (for click-to-seek). */
    timeForToken(tokenIndex) {
      const t = timeByToken.get(tokenIndex);
      return t == null ? null : t;
    },
  };
}
