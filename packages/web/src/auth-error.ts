/**
 * Surface OAuth start failures to the user (#118).
 *
 * The API redirects to `/?auth_error=<code>` when sign-in can't even begin —
 * most importantly `oauth_unconfigured`, when the server is missing its
 * `GOOGLE_CLIENT_ID`/`APPLE_CLIENT_ID`. Before this, the user was bounced
 * silently to the editor with no signal at all. We read that param on load,
 * show a dismissible banner, and strip it from the URL so a refresh or a shared
 * link doesn't resurrect a stale error.
 */

/** Known `auth_error` codes mapped to user-facing copy. Unknown codes → null. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_unconfigured:
    'Sign-in is unavailable right now — this server has no sign-in provider configured. Please contact the site administrator.',
};

/**
 * Resolve the user-facing message for a location search string (e.g.
 * `window.location.search`). Pure and side-effect free so it can be unit-tested
 * without a DOM. Returns null when there is no `auth_error` or it's unrecognized.
 */
export function authErrorMessage(search: string): string | null {
  const code = new URLSearchParams(search).get('auth_error');
  if (code === null) return null;
  return AUTH_ERROR_MESSAGES[code] ?? null;
}

/**
 * If the current URL carries a recognized `auth_error`, render a dismissible
 * banner at the top of the page and remove the param from the address bar.
 * No-ops when there's no error (or no DOM).
 */
export function showAuthErrorBanner(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const message = authErrorMessage(window.location.search);

  // Strip auth_error from the URL regardless of whether we recognized it, so it
  // never lingers across reloads. Keep any other query params intact.
  const url = new URL(window.location.href);
  if (url.searchParams.has('auth_error')) {
    url.searchParams.delete('auth_error');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }

  if (message === null) return;

  const banner = document.createElement('div');
  banner.className = 'auth-error-banner';
  banner.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.textContent = message;
  banner.appendChild(text);

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'auth-error-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => banner.remove());
  banner.appendChild(dismiss);

  document.body.insertBefore(banner, document.body.firstChild);
}
