import { describe, it, expect } from 'vitest';
import { createFrameBuffer } from './index.js';
import {
  setPixel,
  getPixel,
  drawHLine,
  drawRect,
  drawChar,
  drawText,
  drawTextWrapped,
  drawHeroChar,
  drawHeroText,
  GRAY_BLACK,
} from './draw.js';
import { FONT_WIDTH, CHAR_ADVANCE } from './font.js';
import { HERO_FONT_WIDTH, HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from './hero-font.js';

describe('setPixel', () => {
  it('sets a pixel at the given coordinate', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 8, deviceId: '' });
    setPixel(fb, 3, 2);
    expect(getPixel(fb, 3, 2)).toBe(GRAY_BLACK);
    expect(getPixel(fb, 3, 3)).toBe(0);
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
    setPixel(fb, 0, 0, GRAY_BLACK);
    expect(getPixel(fb, 0, 0)).toBe(GRAY_BLACK);
    setPixel(fb, 0, 0, 0);
    expect(getPixel(fb, 0, 0)).toBe(0);
  });
});

describe('drawHLine', () => {
  it('draws a horizontal line of set pixels', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 4, deviceId: '' });
    drawHLine(fb, 2, 1, 5);
    for (let x = 2; x < 7; x++) {
      expect(getPixel(fb, x, 1)).toBe(GRAY_BLACK);
    }
    expect(getPixel(fb, 1, 1)).toBe(0);
    expect(getPixel(fb, 7, 1)).toBe(0);
  });
});

describe('drawRect', () => {
  it('draws a 1px border rectangle', () => {
    const fb = createFrameBuffer({ widthPx: 16, heightPx: 16, deviceId: '' });
    drawRect(fb, 2, 2, 6, 4);

    // Top edge
    expect(getPixel(fb, 2, 2)).toBe(GRAY_BLACK);
    expect(getPixel(fb, 7, 2)).toBe(GRAY_BLACK);

    // Bottom edge
    expect(getPixel(fb, 2, 5)).toBe(GRAY_BLACK);
    expect(getPixel(fb, 7, 5)).toBe(GRAY_BLACK);

    // Interior should be empty
    expect(getPixel(fb, 4, 3)).toBe(0);
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
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 64, deviceId: '' });
    // CHAR_ADVANCE=24, FONT_WIDTH=20. Room for 2 chars: 2*24=48px
    const result = drawText(fb, 0, 0, 'Hello', 48);
    expect(result.charsDrawn).toBe(2);
  });
});

describe('drawTextWrapped', () => {
  it('wraps text to multiple lines', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 680, deviceId: '' });
    // CHAR_ADVANCE=24, FONT_WIDTH=20. 120px fits 5 chars. "Hello World" should wrap.
    drawTextWrapped(fb, 0, 0, 'Hello World', 120, 680);

    // Line 1 starts at y=0, line 2 at y=FONT_HEIGHT+2=30
    let hasLine1 = false;
    let hasLine2 = false;
    for (let x = 0; x < 120; x++) {
      if (getPixel(fb, x, 0)) hasLine1 = true;
      if (getPixel(fb, x, 30)) hasLine2 = true;
    }
    expect(hasLine1).toBe(true);
    expect(hasLine2).toBe(true);
  });
});

describe('hero font dimensions', () => {
  it('has correct dimensions', () => {
    // 8x16 glyphs rendered at 4x = 32x64
    expect(HERO_FONT_WIDTH).toBe(32);
    expect(HERO_FONT_HEIGHT).toBe(64);
    expect(HERO_CHAR_ADVANCE).toBe(36);
  });
});

describe('drawHeroChar', () => {
  it('renders correct pixels for "0"', () => {
    const fb = createFrameBuffer({ widthPx: 64, heightPx: 80, deviceId: '' });
    drawHeroChar(fb, 0, 0, '0');

    // '0' source row 2 = 0x3C. At 4x expansion, source row 2 → screen rows 8-11.
    // Source col 2 (bit 5 set) → screen cols 8-11 (4px block).
    expect(getPixel(fb, 7, 8)).toBe(0); // before col 2 block
    expect(getPixel(fb, 8, 8)).toBe(GRAY_BLACK); // col 2 block start
    expect(getPixel(fb, 11, 8)).toBe(GRAY_BLACK); // col 2 block end
    expect(getPixel(fb, 12, 8)).toBe(GRAY_BLACK); // col 3 block start (also set in 0x3C)

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
    const fb = createFrameBuffer({ widthPx: 64, heightPx: 80, deviceId: '' });
    drawHeroChar(fb, 0, 0, '\x01'); // control character
    expect(fb.data.every((b) => b === 0)).toBe(true);
  });
});

describe('drawHeroText', () => {
  it('draws multiple characters with spacing', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    const result = drawHeroText(fb, 0, 0, 'Hi');
    expect(result.charsDrawn).toBe(2);
    expect(result.width).toBe(2 * HERO_CHAR_ADVANCE);
  });

  it('respects maxWidth', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    // HERO_CHAR_ADVANCE=36, HERO_FONT_WIDTH=32. 2 chars: x=0 (0+32<=68 yes), x=36 (36+32=68<=68 yes), x=72 no
    const result = drawHeroText(fb, 0, 0, 'Hello', 68);
    expect(result.charsDrawn).toBe(2);
  });

  it('fits exactly when maxWidth allows full characters', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    // 3 chars: x=0 (0+32<=104 yes), x=36 (36+32=68<=104 yes), x=72 (72+32=104<=104 yes), x=108 no
    const result = drawHeroText(fb, 0, 0, 'Hello', 104);
    expect(result.charsDrawn).toBe(3);
  });
});
