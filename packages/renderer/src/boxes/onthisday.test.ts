import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderOnThisDayBox } from './onthisday.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { BentoConfig, LayoutBox, OnThisDayBoxConfig } from '@infobento/core';

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

describe('renderOnThisDayBox', () => {
  function makeLayout(config: OnThisDayBoxConfig, label = 'On This Day'): LayoutBox {
    return {
      box: {
        id: 'o-1',
        type: 'onthisday' as const,
        label,
        config,
      },
      x: 0,
      y: 0,
      width: 200,
      height: 120,
    };
  }

  it('renders an event with year and category', () => {
    const config: OnThisDayBoxConfig = {
      type: 'onthisday',
      text: 'Magna Carta is sealed by King John of England.',
      year: '1215',
      category: 'events',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    renderOnThisDayBox(fb, makeLayout(config), config, computeFontMetrics());
    expect(fb.data.reduce((s, b) => s + popcount(b), 0)).toBeGreaterThan(0);
  });

  it('renders a holiday without a year', () => {
    const config: OnThisDayBoxConfig = {
      type: 'onthisday',
      text: 'Anzac Day (Australia, New Zealand, Tonga)',
      category: 'holidays',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    renderOnThisDayBox(fb, makeLayout(config), config, computeFontMetrics());
    expect(fb.data.reduce((s, b) => s + popcount(b), 0)).toBeGreaterThan(0);
  });

  it('handles long text (wrapping)', () => {
    const config: OnThisDayBoxConfig = {
      type: 'onthisday',
      text: 'A massive 7.8 magnitude earthquake strikes Nepal, killing at least 8,962 people and injuring more than 21,000 across the region.',
      year: '2015',
      category: 'events',
    };
    const fb = createFrameBuffer({ widthPx: 200, heightPx: 120, deviceId: '' });
    expect(() =>
      renderOnThisDayBox(fb, makeLayout(config), config, computeFontMetrics()),
    ).not.toThrow();
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'onthisday',
          label: 'On This Day',
          config: {
            type: 'onthisday',
            text: 'Wolfgang Amadeus Mozart was born.',
            year: '1756',
            category: 'births',
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
