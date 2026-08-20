import { describe, it, expect } from 'vitest';
import { createFrameBuffer } from '../index.js';
import { renderHolidaysBox, daysUntilHoliday } from './holidays.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { LayoutBox, HolidaysBoxConfig } from '@infobento/core';

const W = 100;
const H = 120;
const M = computeFontMetrics();
const BYTE_W = Math.ceil(W / 4);

function makeLayout(config: HolidaysBoxConfig, y = 0): LayoutBox {
  return {
    box: { id: 'h-1', type: 'holidays' as const, label: 'Holidays', config },
    x: 0,
    y,
    width: W,
    height: H,
  };
}

function inkIn(data: Uint8Array, from: number, to: number): number {
  let n = 0;
  for (let r = from; r < to; r++) {
    for (let b = 0; b < BYTE_W; b++) {
      const v = data[r * BYTE_W + b] ?? 0;
      for (let shift = 0; shift < 8; shift += 2) {
        if (((v >> shift) & 3) !== 0) n++;
      }
    }
  }
  return n;
}

function render(config: HolidaysBoxConfig, now?: Date): Uint8Array {
  const fb = createFrameBuffer({ widthPx: W, heightPx: H, deviceId: '' });
  renderHolidaysBox(fb, makeLayout(config), config, M, now, false);
  return fb.data;
}

describe('daysUntilHoliday', () => {
  it('returns the number of whole days until a future date', () => {
    const now = new Date('2026-08-20T12:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(11);
  });

  it('returns 0 for today', () => {
    const now = new Date('2026-08-31T09:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(0);
  });

  it('returns 0 for past dates, not a negative', () => {
    const now = new Date('2026-09-01T00:00:00');
    expect(daysUntilHoliday('2026-08-31', now)).toBe(0);
  });
});

describe('renderHolidaysBox', () => {
  it('renders a reading with day count and holiday name', () => {
    const now = new Date('2026-08-20T00:00:00');
    const data = render(
      {
        type: 'holidays',
        countryCode: 'GB',
        data: { name: 'Summer Bank Holiday', date: '2026-08-31' },
      },
      now,
    );
    expect(inkIn(data, 0, H)).toBeGreaterThan(0);
  });

  it('renders the "Today" state when the holiday is today', () => {
    const now = new Date('2026-08-31T00:00:00');
    const data = render(
      {
        type: 'holidays',
        countryCode: 'GB',
        data: { name: 'Summer Bank Holiday', date: '2026-08-31' },
      },
      now,
    );
    expect(inkIn(data, 0, H)).toBeGreaterThan(0);
  });

  it('renders the no-data placeholder', () => {
    expect(inkIn(render({ type: 'holidays', countryCode: 'GB' }), 0, H)).toBeGreaterThan(0);
  });

  it('does not draw past the bottom of its box', () => {
    const data = render({ type: 'holidays', countryCode: 'GB' });
    expect(inkIn(data, H, H)).toBe(0);
  });

  // Regression guard: renderPlaceholder must use `y + drawTextWrapped(...)`,
  // not the bare height delta, to position the "No data" line. A box anchored
  // at y = 0 cannot detect this because delta === y + delta there.
  it('keeps the placeholder inside a box that is not at y = 0', () => {
    const OFFSET = 200;
    const TALL = OFFSET + H;
    const tallByteW = Math.ceil(W / 4);

    const inkAbove = (data: Uint8Array, row: number): number => {
      let n = 0;
      for (let r = 0; r < row; r++) {
        for (let b = 0; b < tallByteW; b++) {
          const v = data[r * tallByteW + b] ?? 0;
          for (let shift = 0; shift < 8; shift += 2) {
            if (((v >> shift) & 3) !== 0) n++;
          }
        }
      }
      return n;
    };

    const config: HolidaysBoxConfig = { type: 'holidays', countryCode: 'GB' };
    const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
    renderHolidaysBox(fb, makeLayout(config, OFFSET), config, M, undefined, false);

    expect(inkAbove(fb.data, OFFSET)).toBe(0);
    expect(inkIn(fb.data, OFFSET, TALL)).toBeGreaterThan(0);
  });
});
