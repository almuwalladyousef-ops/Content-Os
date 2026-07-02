// Keyboard transport. Inert while typing or when the reader isn't active.
// Keyboard-initiated actions are intentionally NOT animated elsewhere.

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function initShortcuts({ onToggle, onSkip, onSpeed, canControl }) {
  window.addEventListener('keydown', (e) => {
    if (TYPING.has(document.activeElement?.tagName)) return;
    if (!canControl()) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault(); onToggle(); break;
      case 'ArrowLeft':
        e.preventDefault(); onSkip(-1); break;
      case 'ArrowRight':
        e.preventDefault(); onSkip(1); break;
      case 'ArrowUp':
        e.preventDefault(); onSpeed(0.1); break;
      case 'ArrowDown':
        e.preventDefault(); onSpeed(-0.1); break;
      default: break;
    }
  });
}
