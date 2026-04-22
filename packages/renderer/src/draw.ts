/**
 * Intent: Low-level drawing primitives for 1-bit frame buffers
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

/**
 * intent: Set a single pixel in the 1-bit packed frame buffer
 * method: Compute byte index and bit position, then set/clear the bit
 * constraint: Bit 7 of each byte = leftmost pixel (MSB-first packing)
 */
export function setPixel(fb: FrameBuffer, x: number, y: number, on = true): void {
  if (x < 0 || x >= fb.width || y < 0 || y >= fb.height) return;
  const byteWidth = Math.ceil(fb.width / 8);
  const byteIndex = y * byteWidth + Math.floor(x / 8);
  const bitIndex = 7 - (x % 8);
  const current = fb.data[byteIndex];
  if (current == null) return;
  if (on) {
    fb.data[byteIndex] = current | (1 << bitIndex);
  } else {
    fb.data[byteIndex] = current & ~(1 << bitIndex);
  }
}

/** Draw a horizontal line */
export function drawHLine(fb: FrameBuffer, x: number, y: number, width: number): void {
  for (let i = 0; i < width; i++) {
    setPixel(fb, x + i, y);
  }
}

/** Draw a vertical line */
export function drawVLine(fb: FrameBuffer, x: number, y: number, height: number): void {
  for (let i = 0; i < height; i++) {
    setPixel(fb, x, y + i);
  }
}

/** Draw a 1px border rectangle */
export function drawRect(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  drawHLine(fb, x, y, width); // top
  drawHLine(fb, x, y + height - 1, width); // bottom
  drawVLine(fb, x, y, height); // left
  drawVLine(fb, x + width - 1, y, height); // right
}

/**
 * intent: Render a single character from the embedded bitmap font
 * method: Read 7 rows of 5-bit data from FONT_DATA, set pixels accordingly
 * effect: Draws a 5x7 character at (x, y) — top-left corner
 */
export function drawChar(fb: FrameBuffer, x: number, y: number, char: string): void {
  const glyph = FONT_DATA[char];
  if (!glyph) return; // unsupported character — skip silently

  for (let row = 0; row < FONT_HEIGHT; row++) {
    const rowData = glyph[row];
    if (rowData == null) continue;
    for (let col = 0; col < FONT_WIDTH; col++) {
      // Bit 4 = leftmost pixel, bit 0 = rightmost
      if (rowData & (1 << (FONT_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row);
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
): { charsDrawn: number; width: number } {
  let cx = x;
  let drawn = 0;
  const limit = maxWidth != null ? x + maxWidth : fb.width;

  for (const char of text) {
    if (cx + FONT_WIDTH > limit) break;
    drawChar(fb, cx, y, char);
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
      drawChar(fb, cx, cy, char);
      cx += CHAR_ADVANCE;
    }

    // Add space after word
    cx += CHAR_ADVANCE;
  }
}

/**
 * intent: Render a single character from the Spleen 8x16 hero bitmap font
 * method: Read 16 rows of 8-bit data from HERO_FONT_DATA, set pixels accordingly
 * effect: Draws an 8x16 character at (x, y) — top-left corner
 */
export function drawHeroChar(fb: FrameBuffer, x: number, y: number, char: string): void {
  const glyph = HERO_FONT_DATA[char];
  if (!glyph) return; // unsupported character — skip silently

  for (let row = 0; row < HERO_FONT_HEIGHT; row++) {
    const rowData = glyph[row];
    if (rowData == null) continue;
    for (let col = 0; col < HERO_FONT_WIDTH; col++) {
      // Bit 7 = leftmost pixel, bit 0 = rightmost
      if (rowData & (1 << (HERO_FONT_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row);
      }
    }
  }
}

/**
 * intent: Render a string of text in the Spleen 8x16 hero font on a single line
 * method: Draw characters left-to-right with HERO_CHAR_ADVANCE spacing
 * effect: Returns the number of characters drawn and total pixel width used
 */
export function drawHeroText(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth?: number,
): { charsDrawn: number; width: number } {
  let cx = x;
  let drawn = 0;
  const limit = maxWidth != null ? x + maxWidth : fb.width;

  for (const char of text) {
    if (cx + HERO_FONT_WIDTH > limit) break;
    drawHeroChar(fb, cx, y, char);
    cx += HERO_CHAR_ADVANCE;
    drawn++;
  }

  return { charsDrawn: drawn, width: cx - x };
}

/**
 * intent: Render a 7x7 icon from the bitmap icon set
 * method: Read 7 rows of 7-bit data, set pixels accordingly
 * effect: Draws a 7x7 icon at (x, y) — top-left corner
 */
export function drawIcon(fb: FrameBuffer, x: number, y: number, icon: readonly number[]): void {
  for (let row = 0; row < ICON_HEIGHT; row++) {
    const rowData = icon[row];
    if (rowData == null) continue;
    for (let col = 0; col < ICON_WIDTH; col++) {
      // Bit 6 = leftmost pixel, bit 0 = rightmost
      if (rowData & (1 << (ICON_WIDTH - 1 - col))) {
        setPixel(fb, x + col, y + row);
      }
    }
  }
}
