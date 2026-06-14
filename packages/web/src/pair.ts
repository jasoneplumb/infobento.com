/**
 * Device-pairing page (issue #74) — rendered for the `/pair/:code` deep link
 * that the QR sticker on a device encodes.
 *
 * Flow:
 *   1. Check the session (GET /api/auth/session).
 *   2. Unauthenticated → show a sign-in prompt that bounces through the existing
 *      OAuth start endpoints with `next` set back to this pair URL, so the user
 *      lands here again, signed in.
 *   3. Authenticated → show the (pre-filled, editable) code and a "Claim this
 *      device" button that POSTs to /api/pair. On success the returned config is
 *      loaded into the editor (persisted to localStorage) and we redirect to "/".
 */

import { loadConfig } from './state';

interface SessionResponse {
  authenticated: boolean;
}

/** Build the centered card shell (reuses the consent dialog's styling). */
function makeCard(): { overlay: HTMLDivElement; card: HTMLDivElement } {
  const overlay = document.createElement('div');
  overlay.className = 'consent-overlay';
  const card = document.createElement('div');
  card.className = 'consent-card';
  overlay.appendChild(card);
  return { overlay, card };
}

/** The path the OAuth callback should return to (this page, with the code). */
function pairNextPath(code: string): string {
  return `/pair/${encodeURIComponent(code)}`;
}

function renderSignIn(card: HTMLDivElement, code: string): void {
  const next = encodeURIComponent(pairNextPath(code));
  card.innerHTML = `
    <h2>Claim your InfoBento</h2>
    <p>Sign in to bind this device (code <code>${escapeHtml(code)}</code>) to your account.</p>
    <div class="consent-actions" style="flex-direction: column; gap: 0.5rem;">
      <a class="btn-primary" href="/api/auth/oauth/google/start?next=${next}">Sign in with Google</a>
      <a class="btn-secondary" href="/api/auth/oauth/apple/start?next=${next}">Sign in with Apple</a>
    </div>
  `;
}

function renderClaim(card: HTMLDivElement, code: string): void {
  card.innerHTML = `
    <h2>Claim this device</h2>
    <p>Bind this InfoBento to your account. You can edit the code if it's wrong.</p>
    <label class="pair-field">
      Pair code
      <input type="text" id="pair-code" value="${escapeHtml(code)}" autocomplete="off" />
    </label>
    <p class="pair-message" id="pair-message" role="status"></p>
    <div class="consent-actions">
      <button type="button" class="btn-primary" id="pair-claim">Claim this device</button>
    </div>
  `;

  const input = card.querySelector<HTMLInputElement>('#pair-code');
  const button = card.querySelector<HTMLButtonElement>('#pair-claim');
  const message = card.querySelector<HTMLParagraphElement>('#pair-message');
  if (!input || !button || !message) return;

  button.addEventListener('click', () => {
    void claim(input.value.trim(), button, message, card);
  });
}

/** POST /api/pair and act on the result. */
async function claim(
  code: string,
  button: HTMLButtonElement,
  message: HTMLParagraphElement,
  card: HTMLDivElement,
): Promise<void> {
  if (!code) {
    message.textContent = 'Enter a pair code.';
    return;
  }
  button.disabled = true;
  message.textContent = 'Claiming…';

  let res: Response;
  try {
    res = await fetch('/api/pair', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    button.disabled = false;
    message.textContent = 'Network error — please try again.';
    return;
  }

  if (res.status === 401) {
    // Session expired between page load and claim — fall back to sign-in.
    renderSignIn(card, code);
    return;
  }
  if (res.status === 404) {
    button.disabled = false;
    message.textContent = 'No device found with that code. Check the code and try again.';
    return;
  }
  if (res.status === 409) {
    button.disabled = false;
    message.textContent = 'This device is already paired to a different account.';
    return;
  }
  if (!res.ok) {
    button.disabled = false;
    message.textContent = 'Something went wrong — please try again.';
    return;
  }

  // Success: load the device's config into the editor (if any), then redirect.
  try {
    const data = (await res.json()) as { config?: unknown };
    if (data.config != null) loadConfig(data.config);
  } catch {
    // A config that fails to parse shouldn't block the redirect; the editor
    // falls back to whatever was already in localStorage / the defaults.
  }
  window.location.href = '/';
}

/** Minimal HTML-escape for interpolating the code into innerHTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Entry point: render the pairing UI for `code` into the document body. */
export async function renderPairPage(code: string): Promise<void> {
  // Drop the editor chrome — this route owns the whole viewport.
  document.querySelector('header')?.remove();
  document.querySelector('main')?.remove();

  const { overlay, card } = makeCard();
  card.innerHTML = '<h2>Loading…</h2>';
  document.body.appendChild(overlay);

  let authenticated = false;
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (res.ok) {
      const data = (await res.json()) as SessionResponse;
      authenticated = data.authenticated === true;
    }
  } catch {
    authenticated = false;
  }

  if (authenticated) {
    renderClaim(card, code);
  } else {
    renderSignIn(card, code);
  }
}
