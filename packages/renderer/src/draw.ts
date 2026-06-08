/**
 * Intent: Low-level drawing primitives for 2-bit (4-level grayscale) frame buffers
 * Context: Used by box renderers to draw pixels, lines, rectangles, and text
 * Pattern: Pure functions operating on mutable Uint8Array — no allocations per call
 */

import type { FrameBuffer } from './index.js';
import {
  rasterizeText,
  measureText,
  BODY_FONT_SIZE,
  BODY_LINE_HEIGHT,
  HERO_FONT_SIZE,
  HERO_LINE_HEIGHT,
} from './ttf-font.js';
import { ICON_WIDTH, ICON_HEIGHT } from './icons.js';

// Re-export font metrics for box renderers (deprecated — use FontMetrics instead)
export { BODY_FONT_SIZE, BODY_LINE_HEIGHT, HERO_FONT_SIZE, HERO_LINE_HEIGHT };

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

/**
 * Draw an antialiased rounded rectangle border with configurable thickness.
 * Uses signed distance field for smooth corners at 2-bit depth.
 */
export function drawRoundedRect(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  thickness: number = 1,
  level: number = GRAY_BLACK,
): void {
  const r = Math.min(radius, Math.floor(width / 2), Math.floor(height / 2));
  const outerR = r;
  const innerR = Math.max(0, r - thickness);

  // Only scan the border region + 1px for antialiasing
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Signed distance from pixel to the rounded rect edge (negative = inside)
      const dist = roundedRectSDF(px, py, width, height, outerR);
      const innerDist = roundedRectSDF(px, py, width, height, innerR);

      // Skip pixels clearly inside or outside the border band
      if (dist > 1.0 || innerDist < -1.0) continue;

      // Compute coverage: 1.0 = fully in border, 0.0 = fully outside
      const outerCoverage = Math.max(0, Math.min(1, 0.5 - dist));
      const innerCoverage = Math.max(0, Math.min(1, 0.5 + innerDist));
      const coverage = outerCoverage * innerCoverage;

      if (coverage <= 0.01) continue;

      // Map coverage to grey level for antialiasing
      let gray: number;
      if (coverage > 0.66) gray = level;
      else if (coverage > 0.33) gray = Math.max(1, level - 1);
      else gray = Math.max(1, level - 2);

      if (gray > 0) setPixel(fb, x + px, y + py, gray);
    }
  }
}

/**
 * Signed distance field for a rounded rectangle.
 * Standard formulation: smooth at straight-to-arc transitions.
 * Returns negative inside, positive outside, 0 on the edge.
 */
export function roundedRectSDF(px: number, py: number, w: number, h: number, r: number): number {
  // Distance from center to half-size, reduced by radius
  const dx = Math.abs(px - (w - 1) / 2) - ((w - 1) / 2 - r);
  const dy = Math.abs(py - (h - 1) / 2) - ((h - 1) / 2 - r);
  const mx = Math.max(dx, 0);
  const my = Math.max(dy, 0);
  return Math.sqrt(mx * mx + my * my) + Math.min(Math.max(dx, dy), 0) - r;
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
 * Round-threshold for the coverage→level mapping. 0.5 is plain rounding; higher
 * values bias edge pixels darker (slightly bolder strokes — thin antialiased
 * stems can render faint on eInk), lower values thinner/crisper. Tune to taste.
 */
const AA_THRESHOLD = 0.6;

/**
 * Blit a rasterized glyph bitmap into the frame buffer with 4-level grayscale.
 * Coverage (0.0-1.0) maps proportionally to the text color's tonal range
 * (`floor(coverage * level + AA_THRESHOLD)`), so each color gets a real edge ramp.
 * The `level` parameter is the text's target darkness (e.g. GRAY_DARK = dark gray).
 */
function blitRaster(
  fb: FrameBuffer,
  x: number,
  y: number,
  data: Float32Array,
  width: number,
  height: number,
  level: number = GRAY_BLACK,
): void {
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const coverage = data[row * width + col] ?? 0;
      if (coverage <= 0.01) continue; // skip fully transparent
      // Proportional anti-aliasing: ramp coverage across the text color's own
      // tonal range (e.g. dark-grey text fades white→light→dark), instead of
      // mapping to absolute black and clamping — which flattened the AA for any
      // non-black text. AA_THRESHOLD biases edge weight (crisp ↔ bold).
      const gray = Math.min(level, Math.floor(coverage * level + AA_THRESHOLD));
      if (gray > 0) setPixel(fb, x + col, y + row, gray);
    }
  }
}

/**
 * intent: Render a single character using TTF font
 * method: Rasterize with opentype.js, blit anti-aliased result into framebuffer
 */
export function drawChar(
  fb: FrameBuffer,
  x: number,
  y: number,
  char: string,
  level: number = GRAY_BLACK,
  fontSize: number = BODY_FONT_SIZE,
): void {
  const raster = rasterizeText(char, fontSize, false);
  blitRaster(fb, x, y, raster.data, raster.width, raster.height, level);
}

/**
 * intent: Render a string of body text on a single line using TTF
 * method: Rasterize entire string at once (proper kerning), blit into framebuffer
 */
export function drawText(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth?: number,
  level: number = GRAY_BLACK,
  fontSize: number = BODY_FONT_SIZE,
): { charsDrawn: number; width: number } {
  if (!text) return { charsDrawn: 0, width: 0 };
  const raster = rasterizeText(text, fontSize, false, maxWidth);
  blitRaster(fb, x, y, raster.data, raster.width, raster.height, level);
  return { charsDrawn: text.length, width: raster.width };
}

/**
 * intent: Render multi-line text with word wrapping using TTF body font
 * method: Split on \n first so explicit newlines start fresh lines; word-wrap
 *   within each segment at maxWidth.
 */
export function drawTextWrapped(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth: number,
  maxHeight: number,
  level: number = GRAY_BLACK,
  fontSize: number = BODY_FONT_SIZE,
): number {
  const lineHeight = Math.round(fontSize * 1.3);
  let cy = y;

  const flush = (line: string): boolean => {
    if (line) {
      const raster = rasterizeText(line, fontSize, false, maxWidth);
      blitRaster(fb, x, cy, raster.data, raster.width, raster.height, level);
    }
    cy += lineHeight;
    return cy + fontSize <= y + maxHeight;
  };

  const segments = text.split('\n');
  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s] ?? '';
    if (!segment) {
      // Preserve blank lines.
      if (!flush('')) return cy - y;
      continue;
    }
    const words = segment.split(' ');
    let line = '';
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = measureText(testLine, fontSize);
      if (line && testWidth > maxWidth) {
        if (!flush(line)) return cy - y;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      if (!flush(line)) return cy - y;
    }
  }

  return cy - y;
}

/**
 * intent: Render a single character using TTF hero font (Inter Bold)
 */
export function drawHeroChar(
  fb: FrameBuffer,
  x: number,
  y: number,
  char: string,
  level: number = GRAY_BLACK,
  fontSize: number = HERO_FONT_SIZE,
): void {
  const raster = rasterizeText(char, fontSize, true);
  blitRaster(fb, x, y, raster.data, raster.width, raster.height, level);
}

/**
 * intent: Render a string of hero text on a single line using TTF (Inter Bold)
 * method: Rasterize entire string at once, blit into framebuffer
 */
export function drawHeroText(
  fb: FrameBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth?: number,
  level: number = GRAY_BLACK,
  fontSize: number = HERO_FONT_SIZE,
): { charsDrawn: number; width: number } {
  if (!text) return { charsDrawn: 0, width: 0 };
  const raster = rasterizeText(text, fontSize, true, maxWidth);
  blitRaster(fb, x, y, raster.data, raster.width, raster.height, level);
  return { charsDrawn: text.length, width: raster.width };
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

/**
 * intent: Render a square source icon scaled to an arbitrary size
 * method: Nearest-neighbour sample a `srcSize`x`srcSize` bitmap (one srcSize-bit
 *   number per row, bit srcSize-1 = leftmost) into a `target`x`target` block
 * effect: Lets header icons track the font size instead of a fixed pixel grid
 */
export function drawIconScaled(
  fb: FrameBuffer,
  x: number,
  y: number,
  srcRows: readonly number[],
  srcSize: number,
  target: number,
  level: number = GRAY_BLACK,
): void {
  if (target <= 0) return;
  for (let ty = 0; ty < target; ty++) {
    const sr = Math.floor((ty * srcSize) / target);
    const rowData = srcRows[sr];
    if (rowData == null) continue;
    for (let tx = 0; tx < target; tx++) {
      const sc = Math.floor((tx * srcSize) / target);
      if (rowData & (1 << (srcSize - 1 - sc))) {
        setPixel(fb, x + tx, y + ty, level);
      }
    }
  }
}
