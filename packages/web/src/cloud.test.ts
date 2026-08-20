/**
 * Intent: pin selectDevice's failure paths. Review on #204 found that a
 *   transient body-decode failure routed into the "device has no config" branch
 *   and PUT the editor's local boxes over the device's real config — silent data
 *   loss on a network blip. These tests exist so that path can't come back.
 * Context: #116 moved the read to the session-gated GET /api/me/device/:id/config,
 *   where "no config yet" is 200 + null rather than a 404, so the null branch is
 *   now reachable on a healthy response and its guards matter.
 * Setup: global fetch is stubbed per-case; no DOM, no server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectDevice } from './cloud.js';
import {
  addBox,
  getPersistenceMode,
  onRender,
  setState,
  _resetPersistenceForTesting,
} from './state.js';

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

/** Records every request so a test can assert a PUT did NOT happen. */
let calls: Array<{ url: string; method: string }>;

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  _resetPersistenceForTesting();
  localStorage.clear();
  setState((s) => {
    s.boxes = [];
  });
  addBox('quote'); // give the editor something that would be pushed
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selectDevice failure paths (#204 review)', () => {
  it('does NOT overwrite a real config when the response body fails to decode', async () => {
    // A 200 whose body is truncated/garbled. Previously this was caught and
    // treated as config === null, which seeded the device from local boxes —
    // destroying whatever config it actually had.
    stubFetch(() => new Response('{ truncated', { status: 200 }));

    const ok = await selectDevice('device-1');

    expect(ok).toBe(false);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(getPersistenceMode()).toBe('local');
  });

  it('treats a body with no config key (undefined) as unconfigured, not as a mapping error', async () => {
    // `{}` destructures to undefined, which a `=== null` check would miss.
    stubFetch((_url, init) => (init?.method === 'PUT' ? json({ ok: true }) : json({})));

    const ok = await selectDevice('device-1');

    expect(ok).toBe(true);
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
    expect(getPersistenceMode()).toBe('cloud');
  });

  it('seeds a never-configured device and reports success (#191)', async () => {
    stubFetch((_url, init) =>
      init?.method === 'PUT' ? json({ ok: true }) : json({ config: null }),
    );

    const ok = await selectDevice('device-1');

    expect(ok).toBe(true);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('reports failure when the seeding write is rejected', async () => {
    // 429: saveNow schedules a retry but the device still has no config, so
    // claiming the device is active would strand the user on a setup screen.
    stubFetch((_url, init) =>
      init?.method === 'PUT'
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })
        : json({ config: null }),
    );

    const ok = await selectDevice('device-1');

    expect(ok).toBe(false);
    expect(getPersistenceMode()).toBe('local');
  });

  it('returns false without pushing when the read is refused', async () => {
    stubFetch(() => json({ error: 'not_found' }, 404));

    const ok = await selectDevice('device-1');

    expect(ok).toBe(false);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('returns false without pushing when the read throws', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const ok = await selectDevice('device-1');

    expect(ok).toBe(false);
    expect(getPersistenceMode()).toBe('local');
  });

  // Round-2 review (#204): saveNow already calls exitToLocalMode() for 401/404,
  // and selectDevice called it a second time on any falsy result. Each call
  // re-runs loadFromLocalStorage() and the render hook, so the user saw the
  // editor repaint twice — a visible flash. The render count IS the symptom.
  it('drops to local mode exactly once when the seeding write is unauthorised', async () => {
    for (const status of [401, 404]) {
      _resetPersistenceForTesting();
      calls = [];
      let renders = 0;
      onRender(() => {
        renders++;
      });

      stubFetch((_url, init) =>
        init?.method === 'PUT' ? json({ error: 'nope' }, status) : json({ config: null }),
      );

      const ok = await selectDevice('device-1');

      expect(ok).toBe(false);
      expect(getPersistenceMode()).toBe('local');
      expect(renders, `status ${String(status)} should exit to local mode once`).toBe(1);
    }
  });

  // The other falsy paths do NOT exit inside saveNow, so selectDevice must still
  // do it — the fix must not swing the bug the other way and strand the user in
  // cloud mode on a device that never accepted a config.
  it('still drops to local mode when the seeding write fails without exiting', async () => {
    _resetPersistenceForTesting();
    let renders = 0;
    onRender(() => {
      renders++;
    });

    // 429: retry scheduled, device still unconfigured, saveNow did not exit.
    stubFetch((_url, init) =>
      init?.method === 'PUT'
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })
        : json({ config: null }),
    );

    const ok = await selectDevice('device-1');

    expect(ok).toBe(false);
    expect(getPersistenceMode()).toBe('local');
    expect(renders).toBe(1);
  });
});
