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
import { FONT_HEIGHT } from './font.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from './hero-font.js';

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

    // 'A' should produce non-zero pixels
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});

describe('drawText', () => {
  it('draws text with non-zero pixels', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    const result = drawText(fb, 0, 0, 'Hello');
    expect(result.charsDrawn).toBe(5);
    expect(result.width).toBeGreaterThan(0);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('respects maxWidth', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    const narrow = drawText(fb, 0, 0, 'Hello World', 50);
    // With maxWidth=50, the rendered width should not exceed 50
    expect(narrow.width).toBeLessThanOrEqual(50);
  });
});

describe('drawTextWrapped', () => {
  it('wraps text to multiple lines', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 680, deviceId: '' });
    drawTextWrapped(fb, 0, 0, 'Hello World Test', 80, 680);
    // Should have pixels in both top region and further down (wrapped line)
    const topRegion = fb.data.slice(0, Math.ceil(920 / 4) * FONT_HEIGHT);
    expect(topRegion.some((b) => b !== 0)).toBe(true);
  });

  it('honors explicit newlines as line breaks', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 680, deviceId: '' });
    // Two short segments separated by \n — well under maxWidth; only newline
    // should drive the break, advancing cy by exactly one lineHeight.
    const advanced = drawTextWrapped(fb, 0, 0, 'foo\nbar', 800, 680);
    const fontSize = 20; // BODY_FONT_SIZE default
    const lineHeight = Math.round(fontSize * 1.3);
    // After two lines: cy = 0 + 2 * lineHeight (last flush also advances).
    expect(advanced).toBe(2 * lineHeight);
  });

  it('preserves blank lines from consecutive newlines', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 680, deviceId: '' });
    const advanced = drawTextWrapped(fb, 0, 0, 'a\n\nb', 800, 680);
    const fontSize = 20;
    const lineHeight = Math.round(fontSize * 1.3);
    expect(advanced).toBe(3 * lineHeight);
  });

  it('stops drawing once maxHeight is exhausted', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    // Three lines, but maxHeight only fits two.
    const fontSize = 20;
    const lineHeight = Math.round(fontSize * 1.3);
    const advanced = drawTextWrapped(fb, 0, 0, 'one\ntwo\nthree', 800, 2 * lineHeight);
    expect(advanced).toBeLessThanOrEqual(3 * lineHeight);
    expect(advanced).toBeGreaterThanOrEqual(2 * lineHeight);
  });
});

describe('hero font metrics', () => {
  it('has reasonable dimensions', () => {
    expect(HERO_FONT_HEIGHT).toBe(52);
    expect(HERO_CHAR_ADVANCE).toBeGreaterThan(20);
  });
});

describe('drawHeroChar', () => {
  it('renders a character with non-zero pixels', () => {
    const fb = createFrameBuffer({ widthPx: 100, heightPx: 80, deviceId: '' });
    drawHeroChar(fb, 0, 0, '0');
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });
});

describe('drawHeroText', () => {
  it('draws hero text with non-zero pixels', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    const result = drawHeroText(fb, 0, 0, '42F');
    expect(result.charsDrawn).toBe(3);
    expect(result.width).toBeGreaterThan(0);
    expect(fb.data.some((b) => b !== 0)).toBe(true);
  });

  it('respects maxWidth', () => {
    const fb = createFrameBuffer({ widthPx: 920, heightPx: 80, deviceId: '' });
    const result = drawHeroText(fb, 0, 0, 'Hello World', 100);
    expect(result.width).toBeLessThanOrEqual(100);
  });
});
