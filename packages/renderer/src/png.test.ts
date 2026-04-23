import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { render, frameToPng } from './index.js';
import type { BentoConfig } from '@infobento/core';
import type { FrameBuffer } from './types.js';

const textConfig: BentoConfig = {
  boxes: [
    {
      id: '1',
      type: 'text',
      label: 'Test',
      config: { type: 'text', text: 'Hello InfoBento' },
    },
  ],
  refreshesPerDay: 1,
};

describe('frameToPng', () => {
  it('produces valid PNG data (starts with PNG signature)', () => {
    const fb = render(textConfig);
    const png = frameToPng(fb);

    // PNG signature: 0x89 P N G \r \n 0x1A \n
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  });

  it('produces non-trivial output for a rendered config', () => {
    const fb = render(textConfig);
    const png = frameToPng(fb);

    // A rendered text box should produce a PNG larger than just the header
    expect(png.length).toBeGreaterThan(100);
  });

  it('respects scale parameter', () => {
    const fb = render(textConfig);
    const png1x = frameToPng(fb, 1);
    const png3x = frameToPng(fb, 3);

    // 3x scale should produce a larger PNG than 1x
    expect(png3x.length).toBeGreaterThan(png1x.length);
  });

  it('produces output for empty config', () => {
    const emptyConfig: BentoConfig = { boxes: [], refreshesPerDay: 1 };
    const fb = render(emptyConfig);
    const png = frameToPng(fb);

    // Still valid PNG even with no boxes (all white)
    expect(png[0]).toBe(0x89);
    expect(png.length).toBeGreaterThan(0);
  });

  it('renders white pixels for unset bits', () => {
    // All-zero frame buffer = all white (unset)
    const whiteFb: FrameBuffer = { width: 8, height: 1, data: new Uint8Array([0x00]) };
    const pngBytes = frameToPng(whiteFb, 1);
    const decoded = PNG.sync.read(Buffer.from(pngBytes));
    // R channel of pixel 0 should be 0xff (white)
    expect(decoded.data[0]).toBe(0xff);
  });

  it('renders black pixels for set bits', () => {
    // High bit set = pixel 0 is black
    const blackFb: FrameBuffer = { width: 8, height: 1, data: new Uint8Array([0b10000000]) };
    const pngBytes = frameToPng(blackFb, 1);
    const decoded = PNG.sync.read(Buffer.from(pngBytes));
    // pixel (0,0) should be black (R=0), pixel (1,0) should be white (R=255)
    expect(decoded.data[0]).toBe(0x00);
    expect(decoded.data[4]).toBe(0xff);
  });
});
