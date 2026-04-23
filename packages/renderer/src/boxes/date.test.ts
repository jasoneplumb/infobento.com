import { describe, it, expect } from 'vitest';
import { isoWeekNumber, dayOfYear, renderDateBox } from './date.js';
import { createFrameBuffer, render } from '../index.js';
import type { LayoutBox, DateBoxConfig, BentoConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: DateBoxConfig): LayoutBox {
  return {
    box: { id: 'date-1', type: 'date' as const, label: 'Date', config },
    x: 0,
    y: 0,
    width: 120,
    height: 100,
  };
}

describe('isoWeekNumber', () => {
  it('returns week 1 for Jan 1 of a year starting on Monday', () => {
    // 2024-01-01 is a Monday
    const wk = isoWeekNumber(new Date(2024, 0, 1));
    expect(wk).toBe(1);
  });

  it('returns week 52 or 53 for Dec 31', () => {
    const wk = isoWeekNumber(new Date(2023, 11, 31));
    expect(wk).toBeGreaterThanOrEqual(52);
  });
});

describe('dayOfYear', () => {
  it('returns 1 for Jan 1', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
  });

  it('returns 365 for Dec 31 of a non-leap year', () => {
    expect(dayOfYear(new Date(2026, 11, 31))).toBe(365);
  });

  it('returns 60 for March 1 of a non-leap year', () => {
    expect(dayOfYear(new Date(2026, 2, 1))).toBe(60);
  });
});

describe('renderDateBox', () => {
  it('renders with default config', () => {
    const config: DateBoxConfig = { type: 'date' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderDateBox(fb, makeLayout(config), config, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with showWeekNumber: true', () => {
    const config: DateBoxConfig = { type: 'date', showWeekNumber: true };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderDateBox(fb, makeLayout(config), config, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with showDayOfYear: true', () => {
    const config: DateBoxConfig = { type: 'date', showDayOfYear: true };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderDateBox(fb, makeLayout(config), config, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with both optional fields enabled', () => {
    const config: DateBoxConfig = { type: 'date', showWeekNumber: true, showDayOfYear: true };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderDateBox(fb, makeLayout(config), config, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const config: BentoConfig = {
      boxes: [{ id: '1', type: 'date', label: 'Date', config: { type: 'date' } }],
      refreshesPerDay: 1,
    };
    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
