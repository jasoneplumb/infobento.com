/**
 * First-load consent dialog — privacy policy + terms of use.
 * Persists acceptance in localStorage so it only shows once per browser per
 * version. Bump CONSENT_VERSION to force re-prompt after material changes.
 */

const STORAGE_KEY = 'infobento-consent';
const CONSENT_VERSION = 2;

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
    <h2 id="consent-title">Privacy &amp; Terms</h2>

    <section class="consent-section">
      <h3>Privacy</h3>
      <ul>
        <li>No accounts, no logins, no tracking, no analytics.</li>
        <li>Your configuration is stored only in this browser's
          <code>localStorage</code>. It never leaves your browser unless
          you explicitly click <strong>Export JSON</strong>.</li>
        <li>Weather and forecast boxes send your location string to
          OpenStreetMap Nominatim and Open-Meteo. Quote boxes proxy
          through our server to ZenQuotes. We do not log these requests
          or attach identifiers.</li>
        <li>Third-party services have their own privacy practices.</li>
      </ul>
    </section>

    <section class="consent-section">
      <h3>Terms</h3>
      <ul>
        <li>Pre-release software. Features may change without notice.</li>
        <li>Provided <strong>as-is</strong>, no warranties. We do not
          guarantee uptime, data preservation, or backward compatibility.</li>
        <li>Don't abuse the geocoding, weather, or quote endpoints.</li>
        <li>Your configuration data is yours.</li>
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
