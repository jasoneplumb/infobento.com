import { describe, it, expect } from 'vitest';
import { calculateLayout, DISPLAY_WIDTH, DISPLAY_HEIGHT, BOX_DIVIDER_PX } from './index.js';
import type { BentoConfig, BentoBox } from './types.js';

function makeBox(id: string, type: BentoBox['type'] = 'text', split?: 'left' | 'right'): BentoBox {
  return { id, type, label: `Box ${id}`, ...(split !== undefined ? { split } : {}) } as BentoBox;
}

function makeConfig(boxes: BentoBox[]): BentoConfig {
  return { boxes, refreshesPerDay: 1 };
}

describe('calculateLayout', () => {
  it('returns empty layout for empty config', () => {
    const result = calculateLayout(makeConfig([]));
    expect(result.boxes).toHaveLength(0);
  });

  it('single box fills the entire display', () => {
    const result = calculateLayout(makeConfig([makeBox('1')]));
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.x).toBe(0);
    expect(result.boxes[0]!.y).toBe(0);
    expect(result.boxes[0]!.width).toBe(DISPLAY_WIDTH);
    expect(result.boxes[0]!.height).toBe(DISPLAY_HEIGHT);
  });

  it('two boxes split evenly with divider', () => {
    const result = calculateLayout(makeConfig([makeBox('1'), makeBox('2')]));
    expect(result.boxes).toHaveLength(2);

    const [first, second] = result.boxes;
    expect(first!.y).toBe(0);
    expect(second!.y).toBe(first!.height + BOX_DIVIDER_PX);
    expect(first!.height + second!.height + BOX_DIVIDER_PX).toBe(DISPLAY_HEIGHT);
  });

  it('all boxes span full width', () => {
    const result = calculateLayout(makeConfig([makeBox('1'), makeBox('2'), makeBox('3')]));
    for (const lb of result.boxes) {
      expect(lb.width).toBe(DISPLAY_WIDTH);
      expect(lb.x).toBe(0);
    }
  });

  it('QR box gets larger allocation than non-QR boxes', () => {
    const result = calculateLayout(
      makeConfig([makeBox('1', 'text'), makeBox('2', 'qr'), makeBox('3', 'text')]),
    );
    const qrBox = result.boxes.find((lb) => lb.box.type === 'qr')!;
    const textBoxes = result.boxes.filter((lb) => lb.box.type === 'text');

    // QR should be significantly taller than each text box
    for (const tb of textBoxes) {
      expect(qrBox.height).toBeGreaterThan(tb.height);
    }
  });

  it('handles multiple QR boxes without overflow', () => {
    const result = calculateLayout(
      makeConfig([makeBox('1', 'qr'), makeBox('2', 'qr'), makeBox('3', 'text')]),
    );

    // All boxes must fit within display
    const last = result.boxes[result.boxes.length - 1]!;
    expect(last.y + last.height).toBeLessThanOrEqual(DISPLAY_HEIGHT);

    // Non-QR box must have at least MIN_BOX_HEIGHT (24)
    const textBox = result.boxes.find((lb) => lb.box.type === 'text')!;
    expect(textBox.height).toBeGreaterThanOrEqual(24);

    // No negative heights
    for (const lb of result.boxes) {
      expect(lb.height).toBeGreaterThan(0);
    }
  });

  it('boxes do not overlap or exceed display bounds', () => {
    const boxes = [makeBox('1'), makeBox('2'), makeBox('3'), makeBox('4')];
    const result = calculateLayout(makeConfig(boxes));

    for (let i = 1; i < result.boxes.length; i++) {
      const prev = result.boxes[i - 1]!;
      const curr = result.boxes[i]!;
      // Current box starts exactly after previous box + divider
      expect(curr.y).toBe(prev.y + prev.height + BOX_DIVIDER_PX);
    }

    // Last box does not exceed display
    const last = result.boxes[result.boxes.length - 1]!;
    expect(last.y + last.height).toBeLessThanOrEqual(DISPLAY_HEIGHT);
  });

  it('handles 6 boxes (maximum)', () => {
    const boxes = Array.from({ length: 6 }, (_, i) => makeBox(String(i + 1)));
    const result = calculateLayout(makeConfig(boxes));
    expect(result.boxes).toHaveLength(6);

    // Each non-last box should have at least MIN_BOX_HEIGHT (24px)
    for (let i = 0; i < result.boxes.length - 1; i++) {
      expect(result.boxes[i]!.height).toBeGreaterThanOrEqual(24);
    }
  });

  it('truncates to 6 boxes when more are provided', () => {
    const boxes = Array.from({ length: 10 }, (_, i) => makeBox(String(i + 1)));
    const result = calculateLayout(makeConfig(boxes));
    expect(result.boxes).toHaveLength(6);
  });

  it('includes device in result', () => {
    const result = calculateLayout(makeConfig([makeBox('1')]));
    expect(result.device.widthPx).toBe(DISPLAY_WIDTH);
    expect(result.device.heightPx).toBe(DISPLAY_HEIGHT);
  });

  // --- Horizontal split tests ---

  it('two boxes with split left/right get same Y and half width each', () => {
    const left = makeBox('L', 'text', 'left');
    const right = makeBox('R', 'text', 'right');
    const result = calculateLayout(makeConfig([left, right]));

    expect(result.boxes).toHaveLength(2);
    const [lb, rb] = result.boxes;
    expect(lb!.y).toBe(rb!.y); // same Y
    expect(lb!.width).toBe(Math.floor(DISPLAY_WIDTH / 2));
    expect(rb!.width).toBe(DISPLAY_WIDTH - Math.floor(DISPLAY_WIDTH / 2));
    expect(lb!.x).toBe(0);
    expect(rb!.x).toBe(Math.floor(DISPLAY_WIDTH / 2));
  });

  it('mixed split and non-split boxes layout correctly', () => {
    const top = makeBox('T', 'text');
    const left = makeBox('L', 'text', 'left');
    const right = makeBox('R', 'text', 'right');
    const result = calculateLayout(makeConfig([top, left, right]));

    expect(result.boxes).toHaveLength(3);
    // Top box is full width
    expect(result.boxes[0]!.width).toBe(DISPLAY_WIDTH);
    // Split pair shares same Y, each half width
    expect(result.boxes[1]!.y).toBe(result.boxes[2]!.y);
    expect(result.boxes[1]!.width).toBe(Math.floor(DISPLAY_WIDTH / 2));
  });

  it('single split box without a partner renders full-width', () => {
    const lonely = makeBox('L', 'text', 'left');
    const result = calculateLayout(makeConfig([lonely]));

    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.width).toBe(DISPLAY_WIDTH);
  });
});
