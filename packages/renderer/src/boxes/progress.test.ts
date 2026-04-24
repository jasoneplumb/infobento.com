import { describe, it, expect } from 'vitest';
import { calculateProgress, renderProgressBox } from './progress.js';
import { createFrameBuffer, render, computeFontMetrics } from '../index.js';
import type { LayoutBox, ProgressBoxConfig, BentoConfig } from '@infobento/core';

const metrics = computeFontMetrics();

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: ProgressBoxConfig): LayoutBox {
  return {
    box: { id: 'progress-1', type: 'progress' as const, label: 'Progress', config },
    x: 0,
    y: 0,
    width: 120,
    height: 100,
  };
}

describe('calculateProgress', () => {
  it('returns 0% at the start date', () => {
    const { fraction } = calculateProgress(
      '2026-01-01',
      '2026-12-31',
      new Date('2026-01-01T12:00:00'),
    );
    expect(fraction).toBeCloseTo(0, 3);
  });

  it('returns 100% at the end date', () => {
    const { fraction } = calculateProgress(
      '2026-01-01',
      '2026-12-31',
      new Date('2026-12-31T12:00:00'),
    );
    expect(fraction).toBeCloseTo(1, 1);
  });

  it('returns 0% for dates before start', () => {
    const { fraction } = calculateProgress(
      '2026-06-01',
      '2026-12-31',
      new Date('2026-01-01T12:00:00'),
    );
    expect(fraction).toBe(0);
  });

  it('returns 100% for dates after end', () => {
    const { fraction } = calculateProgress(
      '2026-01-01',
      '2026-06-30',
      new Date('2026-12-31T12:00:00'),
    );
    expect(fraction).toBe(1);
  });

  it('returns approximately 50% at the midpoint', () => {
    // Mid-year: July 2 (day 183 of 365)
    const { fraction } = calculateProgress(
      '2026-01-01',
      '2026-12-31',
      new Date('2026-07-02T12:00:00'),
    );
    expect(fraction).toBeGreaterThan(0.45);
    expect(fraction).toBeLessThan(0.55);
  });

  it('returns correct daysTotal and daysCurrent', () => {
    const { daysCurrent, daysTotal } = calculateProgress(
      '2026-01-01',
      '2026-01-11',
      new Date('2026-01-06T12:00:00'),
    );
    expect(daysTotal).toBe(10);
    expect(daysCurrent).toBe(5);
  });
});

describe('renderProgressBox', () => {
  it('renders year progress', () => {
    const config: ProgressBoxConfig = { type: 'progress' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderProgressBox(fb, makeLayout(config), config, metrics, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders custom label', () => {
    const config: ProgressBoxConfig = { type: 'progress', label: 'Project' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderProgressBox(fb, makeLayout(config), config, metrics, new Date('2026-04-23T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders custom date range', () => {
    const config: ProgressBoxConfig = {
      type: 'progress',
      label: 'Sprint',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderProgressBox(fb, makeLayout(config), config, metrics, new Date('2026-04-15T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('handles 0% boundary without crashing', () => {
    const config: ProgressBoxConfig = {
      type: 'progress',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderProgressBox(fb, makeLayout(config), config, metrics, new Date('2026-01-01T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('handles 100% boundary without crashing', () => {
    const config: ProgressBoxConfig = {
      type: 'progress',
      startDate: '2026-01-01',
      endDate: '2026-04-01',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderProgressBox(fb, makeLayout(config), config, metrics, new Date('2026-12-31T12:00:00'));
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [{ id: '1', type: 'progress', label: 'Year', config: { type: 'progress' } }],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
