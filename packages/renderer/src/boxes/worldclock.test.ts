import { describe, it, expect } from 'vitest';
import { renderWorldclockBox, formatZoneTime } from './worldclock.js';
import { createFrameBuffer, render, computeFontMetrics } from '../index.js';
import type { LayoutBox, WorldclockBoxConfig, BentoConfig } from '@infobento/core';

const metrics = computeFontMetrics();

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: WorldclockBoxConfig): LayoutBox {
  return {
    box: { id: 'wc-1', type: 'worldclock' as const, label: 'World Clock', config },
    x: 0,
    y: 0,
    width: 460,
    height: 300,
  };
}

describe('formatZoneTime', () => {
  // Use a fixed UTC time: 2026-01-15 14:30 UTC
  // getTimezoneOffset() returns minutes *behind* UTC, so we construct a date
  // whose UTC representation is known and account for local offset.
  const utcMs = Date.UTC(2026, 0, 15, 14, 30, 0);
  const now = new Date(utcMs);

  it('returns correct HH:MM for UTC+0', () => {
    expect(formatZoneTime(now, 0)).toBe('14:30');
  });

  it('returns correct HH:MM for positive offset (Tokyo, UTC+9 = +540)', () => {
    expect(formatZoneTime(now, 540)).toBe('23:30');
  });

  it('returns correct HH:MM for negative offset (NYC, UTC-5 = -300)', () => {
    expect(formatZoneTime(now, -300)).toBe('09:30');
  });

  it('wraps past midnight correctly', () => {
    // UTC 23:00 + 3 hours = 02:00 next day
    const lateUtc = new Date(Date.UTC(2026, 0, 15, 23, 0, 0));
    expect(formatZoneTime(lateUtc, 180)).toBe('02:00');
  });
});

describe('renderWorldclockBox', () => {
  const now = new Date(Date.UTC(2026, 0, 15, 14, 30, 0));

  it('renders with multiple zones', () => {
    const config: WorldclockBoxConfig = {
      type: 'worldclock',
      zones: [
        { label: 'Tokyo', offsetMinutes: 540 },
        { label: 'NYC', offsetMinutes: -300 },
        { label: 'London', offsetMinutes: 0 },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderWorldclockBox(fb, makeLayout(config), config, metrics, now);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders single zone', () => {
    const config: WorldclockBoxConfig = {
      type: 'worldclock',
      zones: [{ label: 'UTC', offsetMinutes: 0 }],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderWorldclockBox(fb, makeLayout(config), config, metrics, now);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without headers', () => {
    const config: WorldclockBoxConfig = {
      type: 'worldclock',
      zones: [{ label: 'Tokyo', offsetMinutes: 540 }],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderWorldclockBox(fb, makeLayout(config), config, metrics, now, false);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'worldclock',
          label: 'World Clock',
          config: {
            type: 'worldclock',
            zones: [
              { label: 'Tokyo', offsetMinutes: 540 },
              { label: 'NYC', offsetMinutes: -300 },
            ],
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
