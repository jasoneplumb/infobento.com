/**
 * Header-menu sign-in (issue #76). Opens a small dialog that bounces the user
 * through the existing OAuth start endpoints — the same flow the device-pairing
 * page (#74) uses — with `next` set back to the editor so they land here signed
 * in. There is no magic-link/email path: auth shipped as passkey + OAuth (#73).
 */

import { makeDialog } from './dialog';

/** The path OAuth should return to (the editor, preserving the current route). */
function editorNextPath(): string {
  return window.location.pathname + window.location.search;
}

/** Open the sign-in dialog with Google/Apple OAuth entry points. */
export function openSignInDialog(): void {
  const { overlay, card, close } = makeDialog();
  const next = encodeURIComponent(editorNextPath());
  card.innerHTML = `
    <h2>Sign in</h2>
    <p>Sign in to sync your bento to a paired device. Without an account, your
       layout stays saved in this browser.</p>
    <div class="consent-actions" style="flex-direction: column; gap: 0.5rem;">
      <a class="btn-primary" href="/api/auth/oauth/google/start?next=${next}">Sign in with Google</a>
      <a class="btn-secondary" href="/api/auth/oauth/apple/start?next=${next}">Sign in with Apple</a>
      <button type="button" class="btn-secondary" id="signin-cancel">Cancel</button>
    </div>
  `;
  card.querySelector<HTMLButtonElement>('#signin-cancel')?.addEventListener('click', close);
  document.body.appendChild(overlay);
}
