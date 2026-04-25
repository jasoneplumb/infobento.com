import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderHoroscopeBox } from './horoscope.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { BentoConfig, LayoutBox, HoroscopeBoxConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

describe('renderHoroscopeBox', () => {
  function makeLayout(config: HoroscopeBoxConfig, label = 'Horoscope'): LayoutBox {
    return {
      box: {
        id: 'h-1',
        type: 'horoscope' as const,
        label,
        config,
      },
      x: 0,
      y: 0,
      width: 200,
      height: 120,
    };
  }

  it('renders with sign, date and reading text', () => {
    const config: HoroscopeBoxConfig = {
      type: 'horoscope',
      sign: 'aries',
      text: 'A bright day for new ventures.',
      date: '2026-04-25',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    renderHoroscopeBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without date', () => {
    const config: HoroscopeBoxConfig = {
      type: 'horoscope',
      sign: 'leo',
      text: 'Trust your instincts today.',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    renderHoroscopeBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('handles long readings (wrapping)', () => {
    const config: HoroscopeBoxConfig = {
      type: 'horoscope',
      sign: 'cancer',
      text: 'With each passing year, your interest in spiritual topics deepens. It is not necessarily about adhering to a specific faith; rather, you are becoming increasingly fascinated by the mystical and the wisdom of ancient practices.',
      date: '2026-04-25',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    const layout = makeLayout(config);

    expect(() => renderHoroscopeBox(fb, layout, config, computeFontMetrics())).not.toThrow();

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'horoscope',
          label: 'Daily Horoscope',
          config: {
            type: 'horoscope',
            sign: 'pisces',
            text: 'Quiet reflection serves you well today.',
            date: '2026-04-25',
          },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
