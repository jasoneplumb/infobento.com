/**
 * Intent: the Landscape toggle is a per-browser *view* preference (issue #159),
 * not part of BentoConfig. Verify it defaults to landscape and round-trips
 * through its own localStorage key across a simulated reload — the persistence
 * contract main.ts relies on to seed the toggle checkbox. The DOM-mounting
 * paths (mountActivePreview etc.) are out of scope here; they're verified by
 * manual UI testing, as noted in state.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The web tests run in a bare Node environment (no DOM). Provide the same
// minimal in-memory localStorage shim used by state.test.ts so the persistence
// paths run for real rather than silently no-op'ing.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const ORIENTATION_KEY = 'infobento-landscape';

// Re-import preview.ts fresh so its module-load `_showLandscape = loadOrientation()`
// re-runs against the current localStorage — this simulates a page reload.
async function freshPreview() {
  vi.resetModules();
  return import('./preview.js');
}

beforeEach(() => {
  localStorage.clear();
});

describe('landscape orientation preference (issue #159)', () => {
  it('defaults to landscape on first load (nothing persisted)', async () => {
    const { getPreviewOrientation } = await freshPreview();
    expect(getPreviewOrientation()).toBe(true);
  });

  it('persists a switch to portrait across a reload', async () => {
    const first = await freshPreview();
    first.setPreviewOrientation(false); // user unchecks Landscape
    expect(localStorage.getItem(ORIENTATION_KEY)).toBe('false');

    // Simulate a reload: the restored preference is portrait, not the default.
    const { getPreviewOrientation } = await freshPreview();
    expect(getPreviewOrientation()).toBe(false);
  });

  it('persists an explicit landscape choice across a reload', async () => {
    const first = await freshPreview();
    first.setPreviewOrientation(true);
    expect(localStorage.getItem(ORIENTATION_KEY)).toBe('true');

    const { getPreviewOrientation } = await freshPreview();
    expect(getPreviewOrientation()).toBe(true);
  });
});
