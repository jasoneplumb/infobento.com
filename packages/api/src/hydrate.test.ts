import { describe, it, expect } from 'vitest';
import { InMemoryCache } from '@infobento/data';
import type { BentoConfig } from '@infobento/core';
import { hydrateConfig, type HydrateDeps } from './hydrate.js';

const FRESH = { temperature: 70, condition: 'Clear', high: 75, low: 60 } as const;

function weatherConfig(city: string, seed?: unknown): BentoConfig {
  return {
    boxes: [{ id: 'w', type: 'weather', config: { type: 'weather', city, data: seed } }],
    refreshesPerDay: 2,
  } as unknown as BentoConfig;
}

function deps(fetchWeather: HydrateDeps['fetchWeather']): HydrateDeps {
  return { cache: new InMemoryCache(), fetchWeather };
}

describe('hydrateConfig', () => {
  it('replaces weather data with the freshly fetched value', async () => {
    const out = await hydrateConfig(
      weatherConfig('Portland'),
      deps(async () => FRESH),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toEqual(FRESH);
  });

  it('always replaces a stale baked seed, never keeps it (RFC §2 invariant)', async () => {
    const stale = { temperature: -99, condition: 'Old', high: 0, low: 0 };
    const out = await hydrateConfig(
      weatherConfig('Portland', stale),
      deps(async () => FRESH),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toEqual(FRESH);
  });

  it('clears data to undefined when the fetch fails (→ renderer placeholder)', async () => {
    const stale = { temperature: -99, condition: 'Old', high: 0, low: 0 };
    const out = await hydrateConfig(
      weatherConfig('Portland', stale),
      deps(async () => null),
    );
    const box = out.boxes[0];
    if (box?.type !== 'weather') throw new Error('unreachable');
    expect(box.config?.data).toBeUndefined();
  });

  it('does not mutate the input config (immutable transform)', async () => {
    const input = weatherConfig('Portland');
    const out = await hydrateConfig(
      input,
      deps(async () => FRESH),
    );
    expect(out).not.toBe(input);
    const inBox = input.boxes[0];
    if (inBox?.type !== 'weather') throw new Error('unreachable');
    expect(inBox.config?.data).toBeUndefined();
  });

  it('dedups concurrent same-city fetches via the cache (single-flight)', async () => {
    let calls = 0;
    const cfg = {
      boxes: [
        { id: 'a', type: 'weather', config: { type: 'weather', city: 'Portland' } },
        { id: 'b', type: 'weather', config: { type: 'weather', city: 'Portland' } },
      ],
      refreshesPerDay: 2,
    } as unknown as BentoConfig;
    await hydrateConfig(
      cfg,
      deps(async () => {
        calls++;
        return FRESH;
      }),
    );
    expect(calls).toBe(1);
  });

  it('passes non-weather boxes through unchanged', async () => {
    const cfg = {
      boxes: [{ id: 't', type: 'text', config: { type: 'text', text: 'hi' } }],
      refreshesPerDay: 1,
    } as unknown as BentoConfig;
    const out = await hydrateConfig(
      cfg,
      deps(async () => FRESH),
    );
    expect(out.boxes[0]).toEqual(cfg.boxes[0]);
  });
});
