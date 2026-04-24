import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderQuoteBox } from './quote.js';
import { computeFontMetrics } from '../font-metrics.js';
import type { BentoConfig, LayoutBox, QuoteBoxConfig } from '@infobento/core';

/** Count number of set bits in a byte */
function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

describe('renderQuoteBox', () => {
  function makeLayout(config: QuoteBoxConfig, label = 'Quote'): LayoutBox {
    return {
      box: {
        id: 'q-1',
        type: 'quote' as const,
        label,
        config,
      },
      x: 0,
      y: 0,
      width: 120,
      height: 100,
    };
  }

  it('renders with quote text and author', () => {
    const config: QuoteBoxConfig = {
      type: 'quote',
      text: 'Be yourself.',
      author: 'Oscar Wilde',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    renderQuoteBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders without author', () => {
    const config: QuoteBoxConfig = {
      type: 'quote',
      text: 'Simplicity is the ultimate sophistication.',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    renderQuoteBox(fb, layout, config, computeFontMetrics());

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('handles long quotes (wrapping)', () => {
    const config: QuoteBoxConfig = {
      type: 'quote',
      text: 'The only way to do great work is to love what you do. If you have not found it yet, keep looking. Do not settle.',
      author: 'Steve Jobs',
    };
    const fb = createFrameBuffer({ widthPx: 120, heightPx: 100, deviceId: '' });
    const layout = makeLayout(config);

    // Should not throw even with text that exceeds the body area
    expect(() => renderQuoteBox(fb, layout, config, computeFontMetrics())).not.toThrow();

    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches correctly through render()', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'quote',
          label: 'Daily Quote',
          config: { type: 'quote', text: 'Hello world.', author: 'Dev' },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
