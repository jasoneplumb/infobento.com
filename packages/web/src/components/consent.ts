/**
 * First-load consent dialog — privacy policy + terms of use.
 * Persists acceptance in localStorage so it only shows once per browser per
 * version. Bump CONSENT_VERSION to force re-prompt after material changes.
 */

const STORAGE_KEY = 'infobento-consent';
const CONSENT_VERSION = 1;

interface StoredConsent {
  version: number;
  acceptedAt: string;
}

function isAccepted(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    return parsed.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

function persistAcceptance(): void {
  try {
    const data: StoredConsent = {
      version: CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable — proceed anyway; consent will reappear next visit
  }
}

function buildDialog(onAccept: () => void): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'consent-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'consent-title');

  const card = document.createElement('div');
  card.className = 'consent-card';

  card.innerHTML = `
    <h2 id="consent-title">Welcome to InfoBento</h2>
    <p class="consent-tagline">See what matters. Skip the spiral.</p>

    <section class="consent-section">
      <h3>Privacy</h3>
      <ul>
        <li>No accounts, no logins, no tracking, no analytics.</li>
        <li>Your bento configuration is stored only in this browser's
          <code>localStorage</code> on this device. It never leaves your
          browser unless you explicitly click <strong>Export JSON</strong>.</li>
        <li>When you use a Weather or 3hr Forecast box, the location string
          you type is sent to OpenStreetMap's Nominatim geocoder and to
          Open-Meteo's weather API to fetch conditions. When you use a Quote
          box, a request is proxied through our server to ZenQuotes. We do
          not log these requests or attach identifiers.</li>
        <li>Each of those third-party services has its own privacy practices
          governed by them, not us.</li>
      </ul>
    </section>

    <section class="consent-section">
      <h3>Terms</h3>
      <ul>
        <li>This editor is a pre-release demo for the InfoBento dual-eInk
          display, which is still in development. The product, its features,
          and this web editor may change at any time without notice.</li>
        <li>Provided <strong>as-is</strong>, with no warranties of any kind.
          Use at your own risk. We do not guarantee uptime, data
          preservation, or backward compatibility.</li>
        <li>Don't abuse the geocoding, weather, or quote endpoints — they
          are free public services with usage policies of their own.</li>
        <li>Your configuration data is yours. We claim no rights to the
          content you create.</li>
      </ul>
    </section>

    <div class="consent-actions">
      <button type="button" class="btn-primary" id="consent-accept">
        Accept &amp; Continue
      </button>
    </div>
  `;

  overlay.appendChild(card);

  const acceptBtn = card.querySelector<HTMLButtonElement>('#consent-accept');
  acceptBtn?.addEventListener('click', () => {
    persistAcceptance();
    overlay.remove();
    onAccept();
  });

  return overlay;
}

/**
 * If consent has already been recorded for the current version, returns
 * a resolved promise immediately. Otherwise, mounts the dialog into <body>
 * and resolves when the user accepts.
 */
export function requireConsent(): Promise<void> {
  if (isAccepted()) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const dialog = buildDialog(() => {
      resolve();
    });
    document.body.appendChild(dialog);

    // Move focus into the dialog for keyboard users / screen readers
    requestAnimationFrame(() => {
      dialog.querySelector<HTMLButtonElement>('#consent-accept')?.focus();
    });
  });
}
