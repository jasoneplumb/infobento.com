import { describe, it, expect } from 'vitest';
import { render } from '../index.js';
import type { BentoConfig } from '@infobento/core';
import { DEFAULT_FRAME_BYTES } from '@infobento/core';

describe('renderWeatherBox', () => {
  it('renders with full weather data', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'Portland',
            data: {
              temperature: 72,
              condition: 'Partly Cloudy',
              high: 78,
              low: 62,
            },
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    // Should have rendered pixels (not blank)
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('renders placeholder when data is missing', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'Portland',
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    // Should still render something (city name + "No data")
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('renders without config (falls back to placeholder box)', () => {
    const config: BentoConfig = {
      boxes: [{ id: '1', type: 'weather', label: 'Weather' }],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('handles negative temperatures', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'Fairbanks',
            data: {
              temperature: -15,
              condition: 'Snow',
              high: -5,
              low: -25,
            },
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('handles long city names without crashing', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'San Francisco International Airport Area',
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('renders different content with data vs without', () => {
    const withData: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'Portland',
            data: {
              temperature: 72,
              condition: 'Sunny',
              high: 78,
              low: 62,
            },
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const withoutData: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'Weather',
          config: {
            type: 'weather',
            city: 'Portland',
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fbWith = render(withData);
    const fbWithout = render(withoutData);

    // The two renders should produce different frame buffers
    const differs = fbWith.data.some((b, i) => b !== fbWithout.data[i]);
    expect(differs).toBe(true);
  });
});
