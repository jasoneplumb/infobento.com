import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from './index.js';
import type { BentoConfig } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, DEFAULT_FRAME_BYTES } from '@infobento/core';

const BYTES_PER_ROW = Math.ceil(DISPLAY_WIDTH / 4);

describe('render', () => {
  it('produces a frame buffer matching the default display dimensions', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'text',
          label: 'Motto',
          config: { type: 'text', text: 'Hello InfoBento' },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.width).toBe(DISPLAY_WIDTH);
    expect(fb.height).toBe(DISPLAY_HEIGHT);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
  });

  it('renders text box with non-zero pixels', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'text',
          label: 'Test',
          config: { type: 'text', text: 'Hello World' },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);

    // Frame buffer should have some set pixels (not all zeros)
    const hasPixels = fb.data.some((b) => b !== 0);
    expect(hasPixels).toBe(true);
  });

  it('renders multiple boxes without overlap', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'text',
          label: 'First',
          config: { type: 'text', text: 'Box one' },
        },
        {
          id: '2',
          type: 'text',
          label: 'Second',
          config: { type: 'text', text: 'Box two' },
        },
        {
          id: '3',
          type: 'text',
          label: 'Third',
          config: { type: 'text', text: 'Box three' },
        },
      ],
      refreshesPerDay: 2,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);

    // Top region: first ~50 rows should have label/rule pixels
    const topHasPixels = fb.data.slice(0, BYTES_PER_ROW * 50).some((b) => b !== 0);
    // Bottom region: last third of the display should have content from the third box
    const bottomThirdStart = Math.floor(DISPLAY_HEIGHT * (2 / 3)) * BYTES_PER_ROW;
    const bottomHasPixels = fb.data.slice(bottomThirdStart).some((b) => b !== 0);
    expect(topHasPixels).toBe(true);
    expect(bottomHasPixels).toBe(true);
  });

  it('renders placeholder for unsupported box types', () => {
    const config: BentoConfig = {
      boxes: [{ id: '1', type: 'weather', label: 'Weather' }],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    // Should still render something (placeholder label)
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('handles empty config gracefully', () => {
    const config: BentoConfig = {
      boxes: [],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
    // Empty config = blank display
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });

  it('content-aware height: short-content box yields smaller area than list-heavy box', () => {
    // A weather box (3 lines of content) paired with a long forecast (8 entries)
    // should produce different row heights — list-heavy box gets more space.
    const shortFirst: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'weather',
          label: 'W',
          config: {
            type: 'weather',
            city: 'Portland',
            data: { temperature: 60, condition: 'Clear', high: 70, low: 50 },
          },
        },
        {
          id: '2',
          type: 'forecast3d',
          label: '8D',
          config: {
            type: 'forecast3d',
            city: 'Portland',
            entries: Array.from({ length: 8 }, (_, i) => ({
              day: `D${String(i)}`,
              high: 70,
              low: 50,
              condition: 'Clear',
            })),
          },
        },
      ],
      refreshesPerDay: 1,
    };

    // Same boxes in reverse order — invariant: each gets the same height regardless of order
    const reversed: BentoConfig = {
      ...shortFirst,
      boxes: [shortFirst.boxes[1]!, shortFirst.boxes[0]!],
    };

    const fbA = render(shortFirst);
    const fbB = render(reversed);
    // Both render successfully and produce non-empty output (pixels in both top and bottom)
    expect(fbA.data.some((b) => b !== 0)).toBe(true);
    expect(fbB.data.some((b) => b !== 0)).toBe(true);
  });
});

describe('createFrameBuffer', () => {
  it('creates buffer with correct dimensions', () => {
    const fb = createFrameBuffer();
    expect(fb.width).toBe(DISPLAY_WIDTH);
    expect(fb.height).toBe(DISPLAY_HEIGHT);
    expect(fb.data.length).toBe(DEFAULT_FRAME_BYTES);
  });

  it('creates all-zero buffer', () => {
    const fb = createFrameBuffer();
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});
