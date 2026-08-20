import { describe, it, expect } from 'vitest';
import { createFrameBuffer } from '../index.js';
import { renderUVBox } from './uv.js';
import { computeFontMetrics } from '../font-metrics.js';
import { drawTextWrapped, GRAY_LIGHT } from '../draw.js';
import type { LayoutBox, UVBoxConfig } from '@infobento/core';

const W = 100;
const H = 120;
const M = computeFontMetrics();
const BYTE_W = Math.ceil(W / 4);

function makeLayout(config: UVBoxConfig): LayoutBox {
  return {
    box: { id: 'uv-1', type: 'uv' as const, label: 'UV Index', config },
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

function render(config: UVBoxConfig): Uint8Array {
  const fb = createFrameBuffer({ widthPx: W, heightPx: H, deviceId: '' });
  renderUVBox(fb, makeLayout(config), config, M, false);
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

describe('renderUVBox', () => {
  it('renders a reading with its band label', () => {
    const data = render({
      type: 'uv',
      city: 'Reno',
      data: { uvIndex: 8, category: 'Very High' },
    });
    expect(inkBelow(data, 0)).toBeGreaterThan(0);
  });

  it('places "No data" below a wrapped city instead of over it', () => {
    // A multi-word city in a narrow box wraps to several lines. Advancing by a
    // single line draws "No data" back over that wrapped text, so the only ink
    // below where the city ended is the city's own tail. Placing it correctly
    // adds a whole line of ink down there.
    const city = 'San Luis Obispo California';
    const { endY, data: cityOnly } = primaryAlone(city);
    expect(endY).toBeGreaterThan(M.pad + M.bodySize + 2); // the city really wraps

    expect(inkBelow(render({ type: 'uv', city }), endY)).toBeGreaterThan(inkBelow(cityOnly, endY));
  });

  it('does not draw past the bottom of its box', () => {
    const data = render({ type: 'uv', city: 'A Very Long City Name Indeed Here' });
    expect(inkBelow(data, H)).toBe(0);
  });
});
