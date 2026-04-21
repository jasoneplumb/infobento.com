import { describe, it, expect } from 'vitest';
import { render, createFrameBuffer } from '../index.js';
import { renderQRBox } from './qr.js';
import type { BentoConfig, LayoutBox, QRBoxConfig } from '@infobento/core';

/** Helper: count set pixels in a frame buffer region */
function countPixelsInRegion(
  data: Uint8Array,
  fbWidth: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): number {
  const byteWidth = Math.ceil(fbWidth / 8);
  let count = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const byteIndex = y * byteWidth + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);
      const b = data[byteIndex];
      if (b != null && (b & (1 << bitIndex)) !== 0) {
        count++;
      }
    }
  }
  return count;
}

describe('renderQRBox', () => {
  it('renders without throwing for a valid URL', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'qr',
          label: 'Website',
          config: { type: 'qr', url: 'https://infobento.com' },
        },
      ],
      refreshesPerDay: 1,
    };

    expect(() => render(config)).not.toThrow();
  });

  it('produces non-empty frame buffer (QR pixels are set)', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'qr',
          label: 'Website',
          config: { type: 'qr', url: 'https://infobento.com' },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    const hasPixels = fb.data.some((b) => b !== 0);
    expect(hasPixels).toBe(true);
  });

  it('has proper quiet zone (white border around QR data)', () => {
    const fb = createFrameBuffer();
    const qrConfig: QRBoxConfig = { type: 'qr', url: 'https://example.com' };
    const layout: LayoutBox = {
      box: { id: '1', type: 'qr', label: 'QR', config: qrConfig },
      x: 0,
      y: 0,
      width: 128,
      height: 296,
    };

    renderQRBox(fb, layout, qrConfig);

    // The QR code is centered in the body area below the header.
    // The quiet zone ensures a margin of white pixels around the QR data.
    // Check that the very edges of the body area (inside the border) are white.
    // Body starts at y ~12 (header height) and the QR is centered within it.
    // Check a strip just inside the border on the left side of the body
    const bodyY = 12; // HEADER_HEIGHT (11) + 1
    const leftEdgePixels = countPixelsInRegion(fb.data, fb.width, 2, bodyY + 2, 3, 20);

    // The quiet zone means the first few columns inside the body should be white (0 pixels)
    // except for the border itself
    expect(leftEdgePixels).toBe(0);
  });

  it('different URLs produce different QR renderings', () => {
    // Short and long URLs generate different QR codes (different versions/modules)
    const fb1 = createFrameBuffer();
    const shortConfig: QRBoxConfig = { type: 'qr', url: 'hi' };
    const layout1: LayoutBox = {
      box: { id: '1', type: 'qr', label: 'QR', config: shortConfig },
      x: 0,
      y: 0,
      width: 128,
      height: 296,
    };
    renderQRBox(fb1, layout1, shortConfig);

    const fb2 = createFrameBuffer();
    const longConfig: QRBoxConfig = {
      type: 'qr',
      url: 'https://example.com/very/long/path/with/many/segments/to/increase/qr/complexity?param=value&another=thing',
    };
    const layout2: LayoutBox = {
      box: { id: '2', type: 'qr', label: 'QR', config: longConfig },
      x: 0,
      y: 0,
      width: 128,
      height: 296,
    };
    renderQRBox(fb2, layout2, longConfig);

    // Both should produce non-zero output
    const shortPixels = fb1.data.some((b) => b !== 0);
    const longPixels = fb2.data.some((b) => b !== 0);
    expect(shortPixels).toBe(true);
    expect(longPixels).toBe(true);

    // The two renders should produce different frame buffers
    const differs = fb1.data.some((b, i) => b !== fb2.data[i]);
    expect(differs).toBe(true);
  });

  it('renders QR box via render dispatcher', () => {
    const config: BentoConfig = {
      boxes: [
        {
          id: '1',
          type: 'text',
          label: 'Motto',
          config: { type: 'text', text: 'Hello' },
        },
        {
          id: '2',
          type: 'qr',
          label: 'Link',
          config: { type: 'qr', url: 'https://infobento.com' },
        },
      ],
      refreshesPerDay: 1,
    };

    const fb = render(config);
    expect(fb.data.length).toBe(4736);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});
