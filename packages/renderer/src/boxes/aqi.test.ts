import { describe, it, expect } from 'vitest';
import { renderAQIBox } from './aqi.js';
import { createFrameBuffer, render } from '../index.js';
import type { LayoutBox, AQIBoxConfig, BentoConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: AQIBoxConfig): LayoutBox {
  return {
    box: { id: 'aqi-1', type: 'aqi' as const, label: 'AQI', config },
    x: 0,
    y: 0,
    width: 120,
    height: 100,
  };
}

describe('renderAQIBox', () => {
  it('renders with Good AQI (0-50)', () => {
    const config: AQIBoxConfig = {
      type: 'aqi',
      city: 'Portland, OR',
      data: { aqi: 32, category: 'Good', dominantPollutant: 'PM2.5', uvIndex: 3 },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderAQIBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with Moderate AQI (51-100)', () => {
    const config: AQIBoxConfig = {
      type: 'aqi',
      city: 'Portland, OR',
      data: { aqi: 75, category: 'Moderate', dominantPollutant: 'O3', uvIndex: 6 },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderAQIBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with Unhealthy AQI (151-200)', () => {
    const config: AQIBoxConfig = {
      type: 'aqi',
      city: 'Los Angeles, CA',
      data: { aqi: 165, category: 'Unhealthy', dominantPollutant: 'PM10' },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderAQIBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders placeholder when data is missing', () => {
    const config: AQIBoxConfig = { type: 'aqi', city: 'Portland, OR' };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderAQIBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without UV index', () => {
    const config: AQIBoxConfig = {
      type: 'aqi',
      city: 'Portland, OR',
      data: { aqi: 42, category: 'Good', dominantPollutant: 'PM2.5' },
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    renderAQIBox(fb, makeLayout(config), config);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'aqi',
          label: 'AQI',
          config: {
            type: 'aqi',
            city: 'Portland, OR',
            data: { aqi: 32, category: 'Good', dominantPollutant: 'PM2.5', uvIndex: 3 },
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
