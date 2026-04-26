import { describe, it, expect } from 'vitest';
import { calculateLayout, DISPLAY_WIDTH, DISPLAY_HEIGHT } from './index.js';
import type { BentoConfig, BentoBox } from './types.js';

// Default padding level 4 → 12px edge padding and 12px gap between boxes
const DEFAULT_PAD = 12;
const DEFAULT_GAP = 12;

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

  it('single box fills the entire display (minus padding)', () => {
    const result = calculateLayout(makeConfig([makeBox('1')]));
    const pad = DEFAULT_PAD;
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.x).toBe(pad);
    expect(result.boxes[0]!.y).toBe(pad);
    expect(result.boxes[0]!.width).toBe(DISPLAY_WIDTH - pad * 2);
    expect(result.boxes[0]!.height).toBe(DISPLAY_HEIGHT - pad * 2);
  });

  it('two boxes split evenly with divider', () => {
    const pad = DEFAULT_PAD;
    const result = calculateLayout(makeConfig([makeBox('1'), makeBox('2')]));
    expect(result.boxes).toHaveLength(2);

    const [first, second] = result.boxes;
    expect(first!.y).toBe(pad);
    expect(second!.y).toBe(first!.height + DEFAULT_GAP + pad);
    expect(first!.height + second!.height + DEFAULT_GAP).toBe(DISPLAY_HEIGHT - pad * 2);
  });

  it('all boxes span full width (minus padding)', () => {
    const pad = DEFAULT_PAD;
    const result = calculateLayout(makeConfig([makeBox('1'), makeBox('2'), makeBox('3')]));
    for (const lb of result.boxes) {
      expect(lb.width).toBe(DISPLAY_WIDTH - pad * 2);
      expect(lb.x).toBe(pad);
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
      expect(curr.y).toBe(prev.y + prev.height + DEFAULT_GAP);
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

  it('truncates to MAX_BOXES when more are provided', () => {
    // At default fontSize=20, MAX_BOXES = floor(680/60) = 11 capped to 10
    const boxes = Array.from({ length: 12 }, (_, i) => makeBox(String(i + 1)));
    const result = calculateLayout(makeConfig(boxes));
    expect(result.boxes.length).toBeLessThanOrEqual(10);
    expect(result.boxes.length).toBeLessThan(boxes.length);
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
    const pad = DEFAULT_PAD;
    const innerW = DISPLAY_WIDTH - pad * 2;
    const halfW = Math.floor((innerW - DEFAULT_GAP) / 2);
    expect(lb!.width).toBe(halfW);
    expect(rb!.width).toBe(innerW - halfW - DEFAULT_GAP);
    expect(lb!.x).toBe(pad);
    expect(rb!.x).toBe(pad + halfW + DEFAULT_GAP);
  });

  it('mixed split and non-split boxes layout correctly', () => {
    const top = makeBox('T', 'text');
    const left = makeBox('L', 'text', 'left');
    const right = makeBox('R', 'text', 'right');
    const result = calculateLayout(makeConfig([top, left, right]));

    expect(result.boxes).toHaveLength(3);
    const pad = DEFAULT_PAD;
    const innerW = DISPLAY_WIDTH - pad * 2;
    // Top box is full width (minus padding)
    expect(result.boxes[0]!.width).toBe(innerW);
    // Split pair shares same Y, each half width
    expect(result.boxes[1]!.y).toBe(result.boxes[2]!.y);
    expect(result.boxes[1]!.width).toBe(Math.floor((innerW - DEFAULT_GAP) / 2));
  });

  it('single split box without a partner renders full-width', () => {
    const lonely = makeBox('L', 'text', 'left');
    const result = calculateLayout(makeConfig([lonely]));

    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.width).toBe(DISPLAY_WIDTH - DEFAULT_PAD * 2);
  });

  it('honors per-config width/height overrides over the device profile', () => {
    const config: BentoConfig = {
      boxes: [makeBox('1')],
      refreshesPerDay: 1,
      width: 800,
      height: 480,
    };
    const result = calculateLayout(config);
    const pad = DEFAULT_PAD;
    expect(result.device.widthPx).toBe(800);
    expect(result.device.heightPx).toBe(480);
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]!.width).toBe(800 - pad * 2);
    expect(result.boxes[0]!.height).toBe(480 - pad * 2);
  });

  it('config overrides take precedence over an explicit DeviceProfile', () => {
    const config: BentoConfig = {
      boxes: [makeBox('1')],
      refreshesPerDay: 1,
      width: 600,
    };
    const result = calculateLayout(config, {
      widthPx: 1024,
      heightPx: 768,
      deviceId: 'custom',
    });
    expect(result.device.widthPx).toBe(600); // config wins
    expect(result.device.heightPx).toBe(768); // device fallback when config doesn't override
    expect(result.device.deviceId).toBe('custom');
  });
});
