import { describe, it, expect } from 'vitest';
import { renderStocksBox } from './stocks.js';
import { createFrameBuffer, render, computeFontMetrics } from '../index.js';
import type { LayoutBox, StocksBoxConfig, BentoConfig } from '@infobento/core';

const metrics = computeFontMetrics();

function popcount(n: number): number {
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function makeLayout(config: StocksBoxConfig): LayoutBox {
  return {
    box: { id: 'stocks-1', type: 'stocks' as const, label: 'Stocks', config },
    x: 0,
    y: 0,
    width: 460,
    height: 200,
  };
}

describe('renderStocksBox', () => {
  it('renders with stock data (price + change)', () => {
    const config: StocksBoxConfig = {
      type: 'stocks',
      symbol: 'AAPL',
      data: { price: 189.45, change: 2.45, changePercent: 1.23 },
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 200, deviceId: '' });
    renderStocksBox(fb, makeLayout(config), config, metrics);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders with no data (shows "No data")', () => {
    const config: StocksBoxConfig = {
      type: 'stocks',
      symbol: 'AAPL',
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 200, deviceId: '' });
    renderStocksBox(fb, makeLayout(config), config, metrics);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('renders negative change', () => {
    const config: StocksBoxConfig = {
      type: 'stocks',
      symbol: 'TSLA',
      data: { price: 245.1, change: -5.32, changePercent: -2.12 },
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 200, deviceId: '' });
    renderStocksBox(fb, makeLayout(config), config, metrics);
    const totalSet = fb.data.reduce((sum, byte) => sum + popcount(byte), 0);
    expect(totalSet).toBeGreaterThan(0);
  });

  it('dispatches through render()', () => {
    const bentoConfig: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'stocks',
          label: 'Stocks',
          config: {
            type: 'stocks',
            symbol: 'BTC',
            data: { price: 67000.0, change: 1200.5, changePercent: 1.82 },
          },
        },
      ],
      refreshesPerDay: 1,
    };
    const fb = render(bentoConfig);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('does not crash with zero-size layout', () => {
    const config: StocksBoxConfig = {
      type: 'stocks',
      symbol: 'GOOG',
      data: { price: 175.25, change: 0.5, changePercent: 0.29 },
    };
    const layout: LayoutBox = {
      box: { id: 'stocks-1', type: 'stocks' as const, label: 'Stocks', config },
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    const fb = createFrameBuffer({ widthPx: 460, heightPx: 200, deviceId: '' });
    expect(() => renderStocksBox(fb, layout, config, metrics)).not.toThrow();
  });
});
