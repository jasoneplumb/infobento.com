import { describe, it, expect } from 'vitest';
import { daysUntil, renderCountdownBox } from './countdown.js';
import { createFrameBuffer } from '../index.js';
import type { LayoutBox, CountdownBoxConfig } from '@infobento/core';

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

    renderCountdownBox(fb, layout, config, new Date('2026-06-01T12:00:00'));

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
    renderCountdownBox(fb, layout, config, new Date('2026-06-01T12:00:00'));

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

    renderCountdownBox(fb, layout, config, new Date('2026-06-01T12:00:00'));

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
