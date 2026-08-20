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

function makeLayout(config: PollenBoxConfig, y = 0): LayoutBox {
  return {
    box: { id: 'p-1', type: 'pollen' as const, label: 'Pollen', config },
    x: 0,
    y,
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

/**
 * Draw the primary line alone; returns the absolute Y it ends at and its own
 * buffer. `drawTextWrapped` returns the height it consumed, not a row, so the
 * origin has to be added back on.
 */
function primaryAlone(text: string): { endY: number; data: Uint8Array } {
  const fb = createFrameBuffer({ widthPx: W, heightPx: H, deviceId: '' });
  const usedHeight = drawTextWrapped(
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
  return { endY: M.pad + usedHeight, data: fb.data };
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
    // Two lines, not three — a taller wrap leaves no room for the secondary at
    // this box height, and the box correctly suppresses it.
    const city = 'Berlin Germany';
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

  // Regression: renderTwoLine assigned drawTextWrapped's return straight to
  // `cy`. That return is a height delta, not a row, so every box below the top
  // of the panel painted its secondary line near row 0 — into whichever box
  // actually occupies that space. A y = 0 fixture cannot catch it, because
  // there `delta` and `y + delta` are the same number.
  it('keeps the two-line states inside a box that is not at y = 0', () => {
    const OFFSET = 200;
    const TALL = OFFSET + H;
    const tallByteW = Math.ceil(W / 4);

    const inkAbove = (data: Uint8Array, row: number): number => {
      let n = 0;
      for (let r = 0; r < row; r++) {
        for (let b = 0; b < tallByteW; b++) {
          const v = data[r * tallByteW + b] ?? 0;
          for (let shift = 0; shift < 8; shift += 2) {
            if (((v >> shift) & 3) !== 0) n++;
          }
        }
      }
      return n;
    };

    // Both two-line states: no coverage ("No data") and the all-clear. The city
    // must wrap to two lines and no more — at three the secondary is correctly
    // suppressed for want of room, and since only the secondary was misplaced,
    // a suppressed one would make this test vacuous.
    const configs: PollenBoxConfig[] = [
      { type: 'pollen', city: 'Berlin Germany' },
      {
        type: 'pollen',
        city: 'Berlin Germany',
        data: { allergen: 'None', count: 0, level: 'Low' },
      },
    ];

    for (const config of configs) {
      const fb = createFrameBuffer({ widthPx: W, heightPx: TALL, deviceId: '' });
      renderPollenBox(fb, makeLayout(config, OFFSET), config, M, false);

      expect(inkAbove(fb.data, OFFSET)).toBe(0);
      expect(inkBelowIn(fb.data, OFFSET, TALL)).toBeGreaterThan(0);
    }
  });
});

/** `inkBelow`, but for a buffer of arbitrary height. */
function inkBelowIn(data: Uint8Array, row0: number, height: number): number {
  const byteW = Math.ceil(W / 4);
  let n = 0;
  for (let r = row0; r < height; r++) {
    for (let b = 0; b < byteW; b++) {
      const v = data[r * byteW + b] ?? 0;
      for (let shift = 0; shift < 8; shift += 2) {
        if (((v >> shift) & 3) !== 0) n++;
      }
    }
  }
  return n;
}
