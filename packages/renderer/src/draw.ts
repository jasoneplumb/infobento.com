/**
 * Intent: Low-level drawing primitives for 2-bit (4-level grayscale) frame buffers
 * Context: Used by box renderers to draw pixels, lines, rectangles, and text
 * Pattern: Pure functions operating on mutable Uint8Array — no allocations per call
 * Future: Add filled rectangles, bitmap blitting for icons
 */

import type { FrameBuffer } from './index.js';
import { FONT_DATA, FONT_WIDTH, FONT_HEIGHT, CHAR_ADVANCE } from './font.js';
import {
  HERO_FONT_DATA,
  HERO_FONT_WIDTH,
  HERO_FONT_HEIGHT,
  HERO_CHAR_ADVANCE,
} from './hero-font.js';
import { ICON_WIDTH, ICON_HEIGHT } from './icons.js';

/** Gray level constants for 2-bit rendering (0=white, 3=black) */
export const GRAY_WHITE = 0;
export const GRAY_LIGHT = 1;
export const GRAY_DARK = 2;
export const GRAY_BLACK = 3;

/**
 * intent: Set a single pixel in the 2-bit packed frame buffer
 * method: Compute byte index and 2-bit shift, then mask and set the level
 * constraint: Each byte holds 4 pixels, MSB-first (pixel 0 at bits 7-6)
 * level: 0=white, 1=light gray, 2=dark gray, 3=black (default)
 */
export function setPixel(fb: FrameBuffer, x: number, y: number, level: number = GRAY_BLACK): void {
  if (x < 0 || x >= fb.width || y < 0 || y >= fb.height) return;
  const byteWidth = Math.ceil(fb.width / 4);
  const byteIndex = y * byteWidth + Math.floor(x / 4);
  const shift = (3 - (x % 4)) * 2;
  const current = fb.data[byteIndex];
  if (current == null) return;
  const mask = 0x03 << shift;
  fb.data[byteIndex] = (current & ~mask) | ((level & 0x03) << shift);
}

/**
 * intent: Read a single pixel level from the 2-bit packed frame buffer
 * method: Compute byte index and 2-bit shift, extract the 2-bit value
 * returns: 0=white, 1=light gray, 2=dark gray, 3=black
 */
export function getPixel(fb: FrameBuffer, x: number, y: number): number {
  if (x < 0 || x >= fb.width || y < 0 || y >= fb.height) return 0;
  const byteWidth = Math.ceil(fb.width / 4);
  const byteIndex = y * byteWidth + Math.floor(x / 4);
  const shift = (3 - (x % 4)) * 2;
  const current = fb.data[byteIndex];
  if (current == null) return 0;
  return (current >> shift) & 0x03;
}

/** Draw a horizontal line */
export function drawHLine(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  level: number = GRAY_BLACK,
): void {
  for (let i = 0; i < width; i++) {
    setPixel(fb, x + i, y, level);
  }
}

/** Draw a vertical line */
export function drawVLine(
  fb: FrameBuffer,
  x: number,
  y: number,
  height: number,
  level: number = GRAY_BLACK,
): void {
  for (let i = 0; i < height; i++) {
    setPixel(fb, x, y + i, level);
  }
}

/** Draw a 1px border rectangle */
export function drawRect(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  level: number = GRAY_BLACK,
): void {
  drawHLine(fb, x, y, width, level); // top
  drawHLine(fb, x, y + height - 1, width, level); // bottom
  drawVLine(fb, x, y, height, level); // left
  drawVLine(fb, x + width - 1, y, height, level); // right
}

/**
 * intent: Render a single character from the native-resolution body font
 * method: Read FONT_HEIGHT rows of FONT_WIDTH-bit data, set pixels directly
 * effect: Draws a 20x28 character at (x, y) — 1:1 pixel mapping, no scaling
 */
export function drawChar(
  fb: FrameBuffer,
  x: number,
  y: number,
  char: string,
  level: number = GRAY_BLACK,
): void {
  const glyph = FONT_DATA[char];
  if (!glyph) return;

  for (let row = 0; row < FONT_HEIGHT; row++) {
    const rowData = glyph[row];
    if (rowData == null) continue;
    for (let col = 0; col < FONT_WIDTH; col++) {
      if (rowData & (1 << (FONT_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row, level);
      }
    }
  }
}

/**
 * intent: Render a string of text on a single line
 * method: Draw characters left-to-right with CHAR_ADVANCE spacing
 * effect: Returns the number of characters drawn and total pixel width used
 */
export function drawText(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth?: number,
  level: number = GRAY_BLACK,
): { charsDrawn: number; width: number } {
  let cx = x;
  let drawn = 0;
  const limit = maxWidth != null ? x + maxWidth : fb.width;

  for (const char of text) {
    if (cx + FONT_WIDTH > limit) break;
    drawChar(fb, cx, y, char, level);
    cx += CHAR_ADVANCE;
    drawn++;
  }

  return { charsDrawn: drawn, width: cx - x };
}

/**
 * intent: Render multi-line text with word wrapping within a bounded region
 * method: Split on spaces, accumulate words per line, wrap when width exceeded
 * effect: Fills the region top-to-bottom, stops when height is exceeded
 */
export function drawTextWrapped(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth: number,
  maxHeight: number,
  level: number = GRAY_BLACK,
): void {
  const lineHeight = FONT_HEIGHT + 2; // 2px line spacing
  const words = text.split(' ');
  let cx = x;
  let cy = y;

  for (const word of words) {
    const wordWidth = word.length * CHAR_ADVANCE;

    // Check if word fits on current line
    if (cx > x && cx + wordWidth > x + maxWidth) {
      // Wrap to next line
      cx = x;
      cy += lineHeight;
      if (cy + FONT_HEIGHT > y + maxHeight) return; // out of vertical space
    }

    // Draw word character by character
    for (const char of word) {
      if (cx + FONT_WIDTH > x + maxWidth) {
        // Hard break mid-word if word is longer than line
        cx = x;
        cy += lineHeight;
        if (cy + FONT_HEIGHT > y + maxHeight) return;
      }
      drawChar(fb, cx, cy, char, level);
      cx += CHAR_ADVANCE;
    }

    // Add space after word
    cx += CHAR_ADVANCE;
  }
}

/**
 * intent: Render a single character from the native-resolution hero font
 * method: Read HERO_FONT_HEIGHT rows of HERO_FONT_WIDTH-bit data, set pixels directly
 * effect: Draws a 32x64 character at (x, y) — 1:1 pixel mapping, no scaling
 */
export function drawHeroChar(
  fb: FrameBuffer,
  x: number,
  y: number,
  char: string,
  level: number = GRAY_BLACK,
): void {
  const glyph = HERO_FONT_DATA[char];
  if (!glyph) return;

  for (let row = 0; row < HERO_FONT_HEIGHT; row++) {
    const rowData = glyph[row];
    if (rowData == null) continue;
    for (let col = 0; col < HERO_FONT_WIDTH; col++) {
      if (rowData & (1 << (HERO_FONT_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row, level);
      }
    }
  }
}

/**
 * intent: Render a string of text in the 8x16 hero font on a single line
 * method: Draw characters left-to-right with HERO_CHAR_ADVANCE spacing
 * effect: Returns the number of characters drawn and total pixel width used
 */
export function drawHeroText(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth?: number,
  level: number = GRAY_BLACK,
): { charsDrawn: number; width: number } {
  let cx = x;
  let drawn = 0;
  const limit = maxWidth != null ? x + maxWidth : fb.width;

  for (const char of text) {
    if (cx + HERO_FONT_WIDTH > limit) break;
    drawHeroChar(fb, cx, y, char, level);
    cx += HERO_CHAR_ADVANCE;
    drawn++;
  }

  return { charsDrawn: drawn, width: cx - x };
}

/**
 * intent: Render an icon from the native-resolution icon set
 * method: Read ICON_HEIGHT rows of ICON_WIDTH-bit data, set pixels directly
 * effect: Draws a 28x28 icon at (x, y) — 1:1 pixel mapping, no scaling
 */
export function drawIcon(
  fb: FrameBuffer,
  x: number,
  y: number,
  icon: readonly number[],
  level: number = GRAY_BLACK,
): void {
  for (let row = 0; row < ICON_HEIGHT; row++) {
    const rowData = icon[row];
    if (rowData == null) continue;
    for (let col = 0; col < ICON_WIDTH; col++) {
      if (rowData & (1 << (ICON_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row, level);
      }
    }
  }
}
