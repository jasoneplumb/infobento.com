import { describe, it, expect } from 'vitest';
import { daysUntil, renderCountdownBox } from './countdown.js';
import { createFrameBuffer, computeFontMetrics } from '../index.js';
import type { LayoutBox, CountdownBoxConfig } from '@infobento/core';

const metrics = computeFontMetrics();

describe('daysUntil', () => {
  it('returns correct day count for a future date', () => {
    const now = new Date('2026-06-01T12:00:00');
    expect(daysUntil('2026-06-11', now)).toBe(10);
  });

  it('returns 0 for a past date', () => {
    const now = new Date('2026-06-15T12:00:00');
    expect(daysUntil('2026-06-01', now)).toBe(0);
  });

  it('returns 0 when target date is today', () => {
    const now = new Date('2026-06-01T08:30:00');
    expect(daysUntil('2026-06-01', now)).toBe(0);
  });

  it('returns 1 for tomorrow', () => {
    const now = new Date('2026-06-01T23:59:00');
    expect(daysUntil('2026-06-02', now)).toBe(1);
  });

  // countdown carried its own copy of this calculation with Math.ceil and no
  // NaN guard until it was folded into the shared days-until helper. Both bugs
  // are pinned here so the two boxes cannot drift apart again.
  it.each(['not-a-date', '', '2026/06/11'])('returns 0 (never NaN) for %o', (bad) => {
    const days = daysUntil(bad, new Date('2026-06-01T12:00:00'));
    expect(Number.isNaN(days)).toBe(false);
    expect(days).toBe(0);
  });

  it('counts a 25-hour DST fall-back night as 1 day, not 2', (ctx) => {
    const prev = process.env['TZ'];
    process.env['TZ'] = 'America/New_York';
    try {
      // Skip where the TZ override does not take effect (small-icu builds):
      // every night would be 24 h and the assertion would be vacuous.
      if (new Date(2026, 0, 15).getTimezoneOffset() === new Date(2026, 6, 15).getTimezoneOffset()) {
        ctx.skip('TZ override did not take effect on this host');
        return;
      }
      expect(daysUntil('2026-11-02', new Date(2026, 10, 1, 12, 0, 0))).toBe(1);
    } finally {
      if (prev === undefined) delete process.env['TZ'];
      else process.env['TZ'] = prev;
    }
  });
});

describe('renderCountdownBox', () => {
  function makeLayout(config: CountdownBoxConfig): LayoutBox {
    return {
      box: {
        id: 'cd-1',
        type: 'countdown' as const,
        label: config.label,
        config,
      },
      x: 0,
      y: 0,
      width: 120,
      height: 100,
    };
  }

  it('renders non-zero pixels for a future date', () => {
    const config: CountdownBoxConfig = {
      type: 'countdown',
      targetDate: '2026-12-31',
      label: 'NYE',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    renderCountdownBox(fb, layout, config, metrics, new Date('2026-06-01T12:00:00'));

    // Frame buffer should have some pixels set (border + text)
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without crashing for a past date', () => {
    const config: CountdownBoxConfig = {
      type: 'countdown',
      targetDate: '2025-01-01',
      label: 'Old Event',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    // Should not throw
    renderCountdownBox(fb, layout, config, metrics, new Date('2026-06-01T12:00:00'));

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without crashing when target is today', () => {
    const config: CountdownBoxConfig = {
      type: 'countdown',
      targetDate: '2026-06-01',
      label: 'Today',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    renderCountdownBox(fb, layout, config, metrics, new Date('2026-06-01T12:00:00'));

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });
});

/** Count number of set bits in a byte */
function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}
