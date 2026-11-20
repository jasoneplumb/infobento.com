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
import { initCloudSync, restoreActiveDevice, selectDevice, signOut } from './cloud.js';
import {
  addBox,
  getActiveDevice,
  getBoxes,
  getPersistenceMode,
  getRememberedDevice,
  onPersistenceChange,
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

/** A device's stored (core BentoConfig) config: one text box. */
const STORED_CONFIG = {
  boxes: [{ id: '1', label: 'On device', type: 'text', config: { type: 'text', text: 'hello' } }],
};

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

  // Round-2 review (#204) found a double exit to local mode — two repaints, a
  // visible flash — when the seeding write failed. Since #284 the seed is
  // written BEFORE entering cloud mode, so a failed seed changes nothing at
  // all: no repaint, no "Saving to …" flash, and nothing remembered for a
  // device that never accepted a config. The render count IS the symptom.
  it('leaves the editor untouched when the seeding write fails', async () => {
    const failures: Array<() => Response> = [
      () => json({ error: 'nope' }, 401),
      () => json({ error: 'nope' }, 404),
      () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }),
      () => json({ error: 'boom' }, 503),
    ];
    for (const failPut of failures) {
      _resetPersistenceForTesting();
      let renders = 0;
      let modeChanges = 0;
      onRender(() => {
        renders++;
      });
      onPersistenceChange(() => {
        modeChanges++;
      });
      stubFetch((_url, init) => (init?.method === 'PUT' ? failPut() : json({ config: null })));

      const ok = await selectDevice('device-1', 'ABC123');

      expect(ok).toBe(false);
      expect(getPersistenceMode()).toBe('local');
      expect(renders).toBe(0);
      expect(modeChanges).toBe(0);
      expect(getRememberedDevice()).toBeNull();
    }
  });

  it('keeps the current device active when seeding a new one fails', async () => {
    stubFetch((url, init) => {
      if (init?.method === 'PUT') return json({ error: 'boom' }, 503);
      return url.includes('device-1') ? json({ config: STORED_CONFIG }) : json({ config: null });
    });
    expect(await selectDevice('device-1', 'ABC123')).toBe(true);

    expect(await selectDevice('device-2', 'XYZ789')).toBe(false);
    expect(getActiveDevice()).toEqual({ id: 'device-1', label: 'ABC123' });
  });
});

describe('debounced save failures (#284 review)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function editAndSave(putStatus: number): Promise<void> {
    vi.useFakeTimers();
    initCloudSync();
    stubFetch((_url, init) =>
      init?.method === 'PUT' ? json({ error: 'nope' }, putStatus) : json({ config: STORED_CONFIG }),
    );
    expect(await selectDevice('device-1', 'ABC123')).toBe(true);
    addBox('quote');
    await vi.advanceTimersByTimeAsync(600);
  }

  it('keeps the remembered device when the session expired (401)', async () => {
    await editAndSave(401);

    expect(getPersistenceMode()).toBe('local');
    // Signing in again (an OAuth round trip, so a reload) brings the device back.
    expect(getRememberedDevice()).toEqual({ id: 'device-1', label: 'ABC123' });
  });

  it('forgets a device that is gone or no longer ours (404)', async () => {
    await editAndSave(404);

    expect(getPersistenceMode()).toBe('local');
    expect(getRememberedDevice()).toBeNull();
  });
});

describe('restoreActiveDevice: the selection survives a reload (#284)', () => {
  /** A server where device-1 belongs to the account and has STORED as its config. */
  const ownedDevice = (_url: string, init?: RequestInit): Response =>
    init?.method === 'PUT' ? json({ ok: true }) : json({ config: STORED_CONFIG });

  const remember = (id = 'device-1', label = 'ABC123'): void =>
    localStorage.setItem('infobento-active-device', JSON.stringify({ id, label }));

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when no device was remembered', async () => {
    stubFetch(ownedDevice);

    expect(await restoreActiveDevice()).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getPersistenceMode()).toBe('local');
  });

  it("re-selects the device from the device's stored config, without pushing the local buffer", async () => {
    remember();
    stubFetch(ownedDevice);

    expect(await restoreActiveDevice()).toBe(true);

    expect(getPersistenceMode()).toBe('cloud');
    expect(getActiveDevice()).toEqual({ id: 'device-1', label: 'ABC123' });
    // The device's config replaced the editor's local buffer (one quote box)...
    expect(getBoxes().map((b) => b.type)).toEqual(['text']);
    // ...and the local buffer was never written over it.
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(calls[0]?.url).toBe('/api/me/device/device-1/config');
  });

  it('sends edits made after a reload to the previously selected device', async () => {
    vi.useFakeTimers();
    // Page load 1: the user picks a device.
    stubFetch(ownedDevice);
    expect(await selectDevice('device-1', 'ABC123')).toBe(true);

    // Reload: fresh modules, so nothing survives but localStorage.
    vi.resetModules();
    const cloud = await import('./cloud.js');
    const state = await import('./state.js');
    cloud.initCloudSync();
    calls = [];

    expect(await cloud.restoreActiveDevice()).toBe(true);
    state.setRefreshesPerDay(24); // the edit from the bug report
    await vi.advanceTimersByTimeAsync(600); // past the 500 ms save debounce

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toEqual([{ url: '/api/device/device-1/config', method: 'PUT' }]);
  });

  it('forgets a device the server says is no longer ours', async () => {
    for (const status of [403, 404]) {
      remember();
      stubFetch(() => json({ error: 'not_found' }, status));

      expect(await restoreActiveDevice()).toBe(false);
      expect(getPersistenceMode()).toBe('local');
      expect(getRememberedDevice(), `status ${String(status)}`).toBeNull();
      expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    }
  });

  it('keeps the device for the next load when the failure says nothing about ownership', async () => {
    // 401 is an expired session (sign in again and it should come back); a
    // network error or a 5xx is transient.
    const failures: Array<() => Response> = [
      () => json({ error: 'unauthorized' }, 401),
      () => json({ error: 'boom' }, 503),
      () => {
        throw new TypeError('offline');
      },
    ];
    for (const fail of failures) {
      remember();
      stubFetch(fail);

      expect(await restoreActiveDevice()).toBe(false);
      expect(getPersistenceMode()).toBe('local');
      expect(getRememberedDevice()).toEqual({ id: 'device-1', label: 'ABC123' });
    }
  });

  it('does not override a device the user selected while the page was loading', async () => {
    remember('device-1');
    stubFetch(ownedDevice);
    expect(await selectDevice('device-2', 'XYZ789')).toBe(true);
    calls = [];

    expect(await restoreActiveDevice()).toBe(false);
    expect(calls).toHaveLength(0);
    expect(getActiveDevice()).toEqual({ id: 'device-2', label: 'XYZ789' });
  });

  it('only seeds the device from the local buffer when the server has no config for it', async () => {
    remember();
    stubFetch((_url, init) =>
      init?.method === 'PUT' ? json({ ok: true }) : json({ config: null }),
    );
    initCloudSync();

    expect(await restoreActiveDevice()).toBe(true);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  /** A fetch stub whose device-1 read stays pending until `release()` is called. */
  function holdDevice1Read(): () => void {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url === '/api/me/device/device-1/config') await held;
      return ownedDevice(url, init);
    }) as unknown as typeof fetch;
    return release;
  }

  it('does not override a device the user picks while the restore is in flight', async () => {
    remember('device-1');
    const release = holdDevice1Read();

    const restoring = restoreActiveDevice();
    expect(await selectDevice('device-2', 'XYZ789')).toBe(true);
    release();

    expect(await restoring).toBe(false);
    expect(getActiveDevice()).toEqual({ id: 'device-2', label: 'XYZ789' });
    expect(getRememberedDevice()).toEqual({ id: 'device-2', label: 'XYZ789' });
  });

  it('does not re-enter cloud mode when the user signs out during the restore', async () => {
    remember('device-1');
    const release = holdDevice1Read();

    const restoring = restoreActiveDevice();
    await signOut();
    release();

    expect(await restoring).toBe(false);
    expect(getPersistenceMode()).toBe('local');
    expect(getRememberedDevice()).toBeNull();
  });
});

describe('in-flight races (#284 review, round 2)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fetch stub that parks requests matching `pred` until `release(response)`. */
  function holdRequests(
    pred: (url: string, method: string) => boolean,
    otherwise: (url: string, init?: RequestInit) => Response,
  ): (res: Response) => void {
    let release!: (res: Response) => void;
    const held = new Promise<Response>((r) => (release = r));
    globalThis.fetch = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      return pred(url, method) ? held : Promise.resolve(otherwise(url, init));
    }) as unknown as typeof fetch;
    return release;
  }

  it('a stale 401 does not drop a device re-selected after sign-out', async () => {
    vi.useFakeTimers();
    initCloudSync();
    let holdPut = true;
    const releasePut = holdRequests(
      (_url, method) => method === 'PUT' && holdPut,
      (_url, init) =>
        init?.method === 'PUT' ? json({ ok: true }) : json({ config: STORED_CONFIG }),
    );
    expect(await selectDevice('device-1', 'ABC123')).toBe(true);
    addBox('quote');
    await vi.advanceTimersByTimeAsync(600); // the debounced PUT is now in flight
    holdPut = false;

    await signOut();
    expect(await selectDevice('device-1', 'ABC123')).toBe(true);
    releasePut(json({ error: 'unauthorized' }, 401)); // answer for the OLD session
    await vi.advanceTimersByTimeAsync(0);

    expect(getActiveDevice()).toEqual({ id: 'device-1', label: 'ABC123' });
  });

  it('the reload restore yields to a selection the user already started', async () => {
    localStorage.setItem('infobento-active-device', JSON.stringify({ id: 'device-1' }));
    const releaseRead = holdRequests(
      (url) => url === '/api/me/device/device-2/config',
      () => json({ config: STORED_CONFIG }),
    );

    const selecting = selectDevice('device-2', 'XYZ789');
    expect(await restoreActiveDevice()).toBe(false);
    releaseRead(json({ config: STORED_CONFIG }));

    expect(await selecting).toBe(true);
    expect(calls.some((c) => c.url.includes('device-1'))).toBe(false);
    expect(getActiveDevice()).toEqual({ id: 'device-2', label: 'XYZ789' });
  });
});
