import { describe, it, expect } from 'vitest';
import { createFrameBuffer } from './index.js';
import {
  setPixel,
  drawHLine,
  drawRect,
  drawChar,
  drawText,
  drawTextWrapped,
  drawHeroChar,
  drawHeroText,
} from './draw.js';
import { FONT_WIDTH, CHAR_ADVANCE } from './font.js';
import { HERO_FONT_WIDTH, HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from './hero-font.js';

function getPixel(fb: ReturnType<typeof createFrameBuffer>, x: number, y: number): boolean {
  const byteWidth = Math.ceil(fb.width / 8);
  const byteIndex = y * byteWidth + Math.floor(x / 8);
  const bitIndex = 7 - (x % 8);
  return (fb.data[byteIndex]! & (1 << bitIndex)) !== 0;
}

describe('setPixel', () => {
  it('sets a pixel at the given coordinate', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 8, deviceId: '' });
    setPixel(fb, 3, 2);
    expect(getPixel(fb, 3, 2)).toBe(true);
    expect(getPixel(fb, 3, 3)).toBe(false);
  });

  it('ignores out-of-bounds coordinates', () => {
    const fb = createFrameBuffer({ widthPx: 8, heightPx: 8, deviceId: '' });
    setPixel(fb, -1, 0);
    setPixel(fb, 8, 0);
    setPixel(fb, 0, -1);
    setPixel(fb, 0, 8);
    // No crash, all zeros
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });

  it('can clear a pixel', () => {
    const fb = createFrameBuffer({ widthPx: 8, heightPx: 8, deviceId: '' });
    setPixel(fb, 0, 0, true);
    expect(getPixel(fb, 0, 0)).toBe(true);
    setPixel(fb, 0, 0, false);
    expect(getPixel(fb, 0, 0)).toBe(false);
  });
});

describe('drawHLine', () => {
  it('draws a horizontal line of set pixels', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 4, deviceId: '' });
    drawHLine(fb, 2, 1, 5);
    for (let x = 2; x < 7; x++) {
      expect(getPixel(fb, x, 1)).toBe(true);
    }
    expect(getPixel(fb, 1, 1)).toBe(false);
    expect(getPixel(fb, 7, 1)).toBe(false);
  });
});

describe('drawRect', () => {
  it('draws a 1px border rectangle', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 16, deviceId: '' });
    drawRect(fb, 2, 2, 6, 4);

    // Top edge
    expect(getPixel(fb, 2, 2)).toBe(true);
    expect(getPixel(fb, 7, 2)).toBe(true);

    // Bottom edge
    expect(getPixel(fb, 2, 5)).toBe(true);
    expect(getPixel(fb, 7, 5)).toBe(true);

    // Interior should be empty
    expect(getPixel(fb, 4, 3)).toBe(false);
  });
});

describe('drawChar', () => {
  it('renders a character with non-zero pixels', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 16, deviceId: '' });
    drawChar(fb, 0, 0, 'A');

    // 'A' should have pixels set in the character region
    let pixelCount = 0;
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < FONT_WIDTH; x++) {
        if (getPixel(fb, x, y)) pixelCount++;
      }
    }
    expect(pixelCount).toBeGreaterThan(0);
  });

  it('does nothing for unsupported characters', () => {
    const fb = createFrameBuffer({ widthPx: 8, heightPx: 8, deviceId: '' });
    drawChar(fb, 0, 0, '\x01'); // control character
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});

describe('drawText', () => {
  it('draws multiple characters with spacing', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 16, deviceId: '' });
    const result = drawText(fb, 0, 0, 'Hi');
    expect(result.charsDrawn).toBe(2);
    expect(result.width).toBe(2 * CHAR_ADVANCE);
  });

  it('truncates when maxWidth is exceeded', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 16, deviceId: '' });
    // Only room for 2 characters (2 * 6 = 12px)
    const result = drawText(fb, 0, 0, 'Hello', 12);
    expect(result.charsDrawn).toBe(2);
  });
});

describe('drawTextWrapped', () => {
  it('wraps text to multiple lines', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 200, deviceId: '' });
    // 30px wide = 5 chars per line, "Hello World" should wrap
    drawTextWrapped(fb, 0, 0, 'Hello World', 30, 200);

    // Should have pixels on both line 0 (y=0..6) and line 1 (y=9..15)
    let hasLine1 = false;
    let hasLine2 = false;
    for (let x = 0; x < 30; x++) {
      if (getPixel(fb, x, 0)) hasLine1 = true;
      if (getPixel(fb, x, 9)) hasLine2 = true;
    }
    expect(hasLine1).toBe(true);
    expect(hasLine2).toBe(true);
  });
});

describe('hero font dimensions', () => {
  it('has correct dimensions', () => {
    expect(HERO_FONT_WIDTH).toBe(8);
    expect(HERO_FONT_HEIGHT).toBe(16);
    expect(HERO_CHAR_ADVANCE).toBe(9);
  });
});

describe('drawHeroChar', () => {
  it('renders correct pixels for "0"', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 20, deviceId: '' });
    drawHeroChar(fb, 0, 0, '0');

    // Spleen '0' glyph row 2 (0-indexed) = 0x7C = 0b01111100
    // Pixels at (1,2), (2,2), (3,2), (4,2), (5,2) should be on
    expect(getPixel(fb, 0, 2)).toBe(false); // bit 7 off
    expect(getPixel(fb, 1, 2)).toBe(true); // bit 6 on
    expect(getPixel(fb, 2, 2)).toBe(true); // bit 5 on
    expect(getPixel(fb, 3, 2)).toBe(true); // bit 4 on
    expect(getPixel(fb, 4, 2)).toBe(true); // bit 3 on
    expect(getPixel(fb, 5, 2)).toBe(true); // bit 2 on
    expect(getPixel(fb, 6, 2)).toBe(false); // bit 1 off
    expect(getPixel(fb, 7, 2)).toBe(false); // bit 0 off

    // Row 3 = 0xC6 = 0b11000110
    expect(getPixel(fb, 0, 3)).toBe(true); // bit 7
    expect(getPixel(fb, 1, 3)).toBe(true); // bit 6
    expect(getPixel(fb, 2, 3)).toBe(false); // bit 5
    expect(getPixel(fb, 6, 3)).toBe(true); // bit 1
    expect(getPixel(fb, 7, 3)).toBe(false); // bit 0

    // Should have pixels set overall
    let pixelCount = 0;
    for (let y = 0; y < HERO_FONT_HEIGHT; y++) {
      for (let x = 0; x < HERO_FONT_WIDTH; x++) {
        if (getPixel(fb, x, y)) pixelCount++;
      }
    }
    expect(pixelCount).toBeGreaterThan(0);
  });

  it('does nothing for unsupported characters', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 20, deviceId: '' });
    drawHeroChar(fb, 0, 0, '\x01'); // control character
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});

describe('drawHeroText', () => {
  it('draws multiple characters with spacing', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 20, deviceId: '' });
    const result = drawHeroText(fb, 0, 0, 'Hi');
    expect(result.charsDrawn).toBe(2);
    expect(result.width).toBe(2 * HERO_CHAR_ADVANCE);
  });

  it('respects maxWidth', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 20, deviceId: '' });
    // maxWidth=17: char at x=0 (0+8<=17 yes), x=9 (9+8=17<=17 yes), x=18 (18+8=26>17 no)
    // So 2 chars fit in 17px
    const result = drawHeroText(fb, 0, 0, 'Hello', 17);
    expect(result.charsDrawn).toBe(2);
  });

  it('fits exactly when maxWidth allows full characters', () => {
    const fb = createFrameBuffer({ widthPx: 240, heightPx: 20, deviceId: '' });
    // maxWidth=26: char at x=0 (0+8<=26 yes), x=9 (9+8=17<=26 yes), x=18 (18+8=26<=26 yes), x=27 > 26 no
    const result = drawHeroText(fb, 0, 0, 'Hello', 26);
    expect(result.charsDrawn).toBe(3);
  });
});
