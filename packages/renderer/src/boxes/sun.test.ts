import { describe, it, expect } from 'vitest';
import { renderSunBox } from './sun.js';
import { createFrameBuffer, render } from '../index.js';
import type { LayoutBox, SunBoxConfig, BentoConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: SunBoxConfig): LayoutBox {
  return {
    box: { id: 'sun-1', type: 'sun' as const, label: 'Sun', config },
    x: 0,
    y: 0,
    width: 120,
    height: 100,
  };
}

describe('renderSunBox', () => {
  it('renders with full data', () => {
    const config: SunBoxConfig = {
      type: 'sun',
      city: 'Portland, OR',
      data: { sunrise: '06:12', sunset: '20:04', dayLength: '13h 52m' },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderSunBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders placeholder when data is missing', () => {
    const config: SunBoxConfig = { type: 'sun', city: 'Portland, OR' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderSunBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with times longer than 5 chars (ISO format)', () => {
    const config: SunBoxConfig = {
      type: 'sun',
      city: 'Portland, OR',
      data: { sunrise: '06:12:00', sunset: '20:04:00', dayLength: '13h 52m' },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderSunBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'sun',
          label: 'Sun',
          config: {
            type: 'sun',
            city: 'Portland, OR',
            data: { sunrise: '06:12', sunset: '20:04', dayLength: '13h 52m' },
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
