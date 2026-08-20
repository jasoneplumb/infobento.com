import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchPollen } from './pollen.js';
import { __setNominatimQueue } from './geocode.js';
import { RateLimitedQueue } from './nominatim-queue.js';

const GEOCODE = [{ lat: '52.5', lon: '13.4', display_name: 'Berlin' }];

function mockByUrl(provider: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.includes('nominatim') ? GEOCODE : provider;
      return { ok: true, json: async () => body } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  __setNominatimQueue(new RateLimitedQueue(0));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPollen', () => {
  it('labels a count on its own species band scale', async () => {
    mockByUrl({ current: { birch_pollen: 50 } });
    expect(await fetchPollen('Berlin')).toEqual({
      allergen: 'Birch',
      count: 50,
      level: 'Moderate',
    });
  });

  it('ranks by risk band, not by raw grain count', async () => {
    // 50 grains of ragweed is High (the band is ≤50); 90 grains of birch is
    // only Moderate. A naive max-count pick would wrongly surface birch here.
    mockByUrl({ current: { birch_pollen: 90, ragweed_pollen: 50 } });
    expect(await fetchPollen('Berlin')).toEqual({
      allergen: 'Ragweed',
      count: 50,
      level: 'High',
    });
  });

  it('breaks a band tie by severity within that band', async () => {
    // Both Moderate: birch 90/1000 = 0.09, grass 18/50 = 0.36. Grass wins.
    mockByUrl({ current: { birch_pollen: 90, grass_pollen: 18 } });
    const out = await fetchPollen('Berlin');
    expect(out?.allergen).toBe('Grass');
    expect(out?.level).toBe('Moderate');
  });

  it('reports "None" when every species reads a genuine zero', async () => {
    mockByUrl({ current: { birch_pollen: 0, grass_pollen: 0, ragweed_pollen: 0 } });
    expect(await fetchPollen('Berlin')).toEqual({ allergen: 'None', count: 0, level: 'Low' });
  });

  it('returns null outside pollen coverage, distinct from a zero reading', async () => {
    // Open-Meteo omits pollen entirely outside Europe / off-season. That must
    // not collapse into "None detected", which would be a false all-clear.
    mockByUrl({ current: { birch_pollen: null, grass_pollen: null } });
    expect(await fetchPollen('Portland')).toBeNull();
  });

  it('returns null when the payload carries no pollen fields at all', async () => {
    mockByUrl({ current: {} });
    expect(await fetchPollen('Portland')).toBeNull();
  });

  it('bands the rounded count, not the raw float', async () => {
    // 50.1 rounds to 50, which is High on the grass/weed scale (≤50).
    // Banding the float would label it Very High while displaying 50.
    mockByUrl({ current: { ragweed_pollen: 50.1 } });
    expect(await fetchPollen('Berlin')).toEqual({
      allergen: 'Ragweed',
      count: 50,
      level: 'High',
    });
  });

  it('treats a sub-0.5 trace as None, not as a named species at zero', async () => {
    // 0.3 is not === 0, so a strict zero check would let it through and emit
    // "Birch 0 Low" — the arbitrary-species-at-zero case the guard prevents.
    mockByUrl({ current: { birch_pollen: 0.3 } });
    expect(await fetchPollen('Berlin')).toEqual({ allergen: 'None', count: 0, level: 'Low' });
  });

  it('rounds fractional grain counts', async () => {
    mockByUrl({ current: { grass_pollen: 12.6 } });
    expect(await fetchPollen('Berlin')).toMatchObject({ count: 13 });
  });

  it('returns null when geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => null }) as unknown as Response),
    );
    expect(await fetchPollen('Nowhere')).toBeNull();
  });
});
