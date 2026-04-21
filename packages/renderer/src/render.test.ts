import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from './index.js';
import type { BentoConfig } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';

describe('render', () => {
  it('produces a 4736-byte frame buffer for default display', () => {
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
    expect(fb.data.length).toBe(4736); // 128/8 * 296
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
    expect(fb.data.length).toBe(4736);

    // Should have pixels in multiple vertical regions
    const topHasPixels = fb.data.slice(0, 160).some((b) => b !== 0); // first ~10 rows
    const bottomHasPixels = fb.data.slice(3936).some((b) => b !== 0); // last ~50 rows
    expect(topHasPixels).toBe(true);
    expect(bottomHasPixels).toBe(true);
  });

  it('renders placeholder for unsupported box types', () => {
    const config: BentoConfig = {
      boxes: [{ id: '1', type: 'weather', label: 'Weather' }],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(4736);
    // Should still render something (placeholder label)
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('handles empty config gracefully', () => {
    const config: BentoConfig = {
      boxes: [],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(4736);
    // Empty config = blank display
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});

describe('createFrameBuffer', () => {
  it('creates buffer with correct dimensions', () => {
    const fb = createFrameBuffer();
    expect(fb.width).toBe(128);
    expect(fb.height).toBe(296);
    expect(fb.data.length).toBe(4736);
  });

  it('creates all-zero buffer', () => {
    const fb = createFrameBuffer();
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});
