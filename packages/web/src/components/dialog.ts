/**
 * Shared modal-dialog shell for the header-menu dialogs (sign-in, devices).
 * Builds a centered card over a dismissable backdrop and returns a `close()`
 * that tears down BOTH the overlay and the document-level keydown listener —
 * so dismissing via backdrop click or a button never leaks the Escape handler.
 */

export interface Dialog {
  readonly overlay: HTMLDivElement;
  readonly card: HTMLDivElement;
  readonly close: () => void;
}

export function makeDialog(): Dialog {
  const overlay = document.createElement('div');
  overlay.className = 'consent-overlay';
  const card = document.createElement('div');
  card.className = 'consent-card';
  overlay.appendChild(card);

  // Function declarations (hoisted) so close ⇄ onKey can reference each other.
  function close(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  return { overlay, card, close };
}
