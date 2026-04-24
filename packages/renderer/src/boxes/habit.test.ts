import { describe, it, expect } from 'vitest';
import { renderHabitBox } from './habit.js';
import { createFrameBuffer, render, computeFontMetrics } from '../index.js';
import type { LayoutBox, HabitBoxConfig, BentoConfig } from '@infobento/core';

const metrics = computeFontMetrics();

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: HabitBoxConfig): LayoutBox {
  return {
    box: { id: 'habit-1', type: 'habit' as const, label: 'Habits', config },
    x: 0,
    y: 0,
    width: 460,
    height: 300,
  };
}

function totalSetPixels(data: Uint8Array): number {
  return data.reduce((sum, byte) => sum + popcount(byte), 0);
}

describe('renderHabitBox', () => {
  it('renders with mix of completed/incomplete habits', () => {
    const config: HabitBoxConfig = {
      type: 'habit',
      habits: [
        { name: 'Meditate', streak: 14, completedToday: true },
        { name: 'Exercise', streak: 3, completedToday: false },
        { name: 'Read', streak: 45, completedToday: true },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderHabitBox(fb, makeLayout(config), config, metrics);
    expect(totalSetPixels(fb.data)).toBeGreaterThan(0);
  });

  it('renders habits with various streak lengths', () => {
    const config: HabitBoxConfig = {
      type: 'habit',
      habits: [
        { name: 'Short', streak: 1, completedToday: false },
        { name: 'Medium', streak: 99, completedToday: true },
        { name: 'Long', streak: 365, completedToday: true },
      ],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderHabitBox(fb, makeLayout(config), config, metrics);
    expect(totalSetPixels(fb.data)).toBeGreaterThan(0);
  });

  it('renders single habit', () => {
    const config: HabitBoxConfig = {
      type: 'habit',
      habits: [{ name: 'Drink water', streak: 7, completedToday: true }],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderHabitBox(fb, makeLayout(config), config, metrics);
    expect(totalSetPixels(fb.data)).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'habit',
          label: 'Habits',
          config: {
            type: 'habit',
            habits: [
              { name: 'Walk', streak: 5, completedToday: false },
              { name: 'Journal', streak: 12, completedToday: true },
            ],
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('does not crash with narrow layout', () => {
    const config: HabitBoxConfig = {
      type: 'habit',
      habits: [
        { name: 'Tiny', streak: 1, completedToday: true },
        { name: 'Also tiny', streak: 2, completedToday: false },
      ],
    };
    const layout: LayoutBox = {
      box: { id: 'habit-1', type: 'habit' as const, label: 'Habits', config },
      x: 0,
      y: 0,
      width: 40,
      height: 30,
    };
    const fb = createFrameBuffer({ widthPx: 40, heightPx: 30, deviceId: '' });
    expect(() => renderHabitBox(fb, layout, config, metrics)).not.toThrow();
  });

  it('renders without headers when showHeaders is false', () => {
    const config: HabitBoxConfig = {
      type: 'habit',
      habits: [{ name: 'Test', streak: 3, completedToday: true }],
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 300, deviceId: '' });
    renderHabitBox(fb, makeLayout(config), config, metrics, false);
    expect(totalSetPixels(fb.data)).toBeGreaterThan(0);
  });
});
