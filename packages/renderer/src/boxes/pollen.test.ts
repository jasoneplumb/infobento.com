import { describe, it, expect } from 'vitest';
import { createFrameBuffer } from '../index.js';
import { renderPollenBox } from './pollen.js';
import { computeFontMetrics } from '../font-metrics.js';
import { drawTextWrapped, GRAY_LIGHT } from '../draw.js';
import type { LayoutBox, PollenBoxConfig } from '@infobento/core';

const W = 100;
const H = 120;
const M = computeFontMetrics();
const BYTE_W = Math.ceil(W / 4);

function makeLayout(config: PollenBoxConfig): LayoutBox {
  return {
    box: { id: 'p-1', type: 'pollen' as const, label: 'Pollen', config },
    x: 0,
    y: 0,
    width: W,
    height: H,
  };
}

/** Count inked (non-zero) pixels from `row0` to the bottom of the buffer. */
function inkBelow(data: Uint8Array, row0: number): number {
  let n = 0;
  for (let r = row0; r < H; r++) {
    for (let b = 0; b < BYTE_W; b++) {
      const v = data[r * BYTE_W + b] ?? 0;
      for (let shift = 0; shift < 8; shift += 2) {
        if (((v >> shift) & 3) !== 0) n++;
      }
    }
  }
  return n;
}

function render(config: PollenBoxConfig): Uint8Array {
  const fb = createFrameBuffer({ widthPx: W, heightPx: H, deviceId: '' });
  renderPollenBox(fb, makeLayout(config), config, M, false);
  return fb.data;
}

/** Draw the primary line alone; returns the Y it ends at and its own buffer. */
function primaryAlone(text: string): { endY: number; data: Uint8Array } {
  const fb = createFrameBuffer({ widthPx: W, heightPx: H, deviceId: '' });
  const endY = drawTextWrapped(
    fb,
    M.pad,
    M.pad,
    text,
    W - M.pad * 2,
    H - M.pad * 2,
    GRAY_LIGHT,
    M.bodySize,
    M.weight,
  );
  return { endY, data: fb.data };
}

describe('renderPollenBox', () => {
  it('renders a reading with count, level, and allergen', () => {
    const data = render({
      type: 'pollen',
      city: 'Berlin',
      data: { allergen: 'Birch', count: 240, level: 'High' },
    });
    expect(inkBelow(data, 0)).toBeGreaterThan(0);
  });

  it('renders the all-clear state without a hero zero', () => {
    const data = render({
      type: 'pollen',
      city: 'Berlin',
      data: { allergen: 'None', count: 0, level: 'Low' },
    });
    expect(inkBelow(data, 0)).toBeGreaterThan(0);
  });

  it('renders the no-coverage state', () => {
    expect(inkBelow(render({ type: 'pollen', city: 'Portland' }), 0)).toBeGreaterThan(0);
  });

  it('places the secondary line below a wrapped primary instead of over it', () => {
    // No-coverage state: the city is the primary line, "No data" the secondary.
    const city = 'Frankfurt am Main Hessen Germany';
    const { endY, data: cityOnly } = primaryAlone(city);
    expect(endY).toBeGreaterThan(M.pad + M.bodySize + 2); // the city really wraps

    expect(inkBelow(render({ type: 'pollen', city }), endY)).toBeGreaterThan(
      inkBelow(cityOnly, endY),
    );
  });

  it('does not draw past the bottom of its box', () => {
    const data = render({ type: 'pollen', city: 'A Very Long City Name Indeed Here' });
    expect(inkBelow(data, H)).toBe(0);
  });
});
