/**
 * Intent: TrueType font rendering for native-resolution eInk display
 * Context: Uses opentype.js to rasterize Inter (OFL) at any size with 4-level grayscale
 * Pattern: Load font once at module init, export rasterize functions for draw.ts
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '../assets');

/** Load a TTF font file from the assets directory */
function loadFont(filename: string): opentype.Font {
  const buf = readFileSync(resolve(ASSETS, filename));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const regularFont = loadFont('Inter-Regular.ttf');
const boldFont = loadFont('Inter-Bold.ttf');

/** Body text size in pixels (height) — appropriate for 920x680 at ~130-200 DPI */
export const BODY_FONT_SIZE = 20;

/** Hero text size in pixels (height) */
export const HERO_FONT_SIZE = 52;

/** Line height for body text */
export const BODY_LINE_HEIGHT = Math.round(BODY_FONT_SIZE * 1.3);

/** Line height for hero text */
export const HERO_LINE_HEIGHT = Math.round(HERO_FONT_SIZE * 1.15);

/**
 * Measure the width of a string in pixels at the given font size.
 */
export function measureText(text: string, fontSize: number, bold = false): number {
  const font = bold ? boldFont : regularFont;
  const scale = fontSize / font.unitsPerEm;
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = font.charToGlyph(text[i] ?? ' ');
    width += (glyph.advanceWidth ?? 0) * scale;
    // Apply kerning
    if (i < text.length - 1) {
      const nextGlyph = font.charToGlyph(text[i + 1] ?? ' ');
      const kern = font.getKerningValue(glyph, nextGlyph);
      width += kern * scale;
    }
  }
  return Math.round(width);
}

/**
 * Rasterize a string into a 2D grayscale bitmap (0.0-1.0 per pixel).
 * Returns the bitmap data, width, and height.
 */
export interface RasterResult {
  data: Float32Array; // width × height, 0.0 = white, 1.0 = black
  width: number;
  height: number;
  baseline: number; // y offset from top to baseline
}

export function rasterizeText(
  text: string,
  fontSize: number,
  bold = false,
  maxWidth?: number,
): RasterResult {
  const font = bold ? boldFont : regularFont;
  const scale = fontSize / font.unitsPerEm;
  const ascender = Math.round(font.ascender * scale);
  const descender = Math.round(Math.abs(font.descender * scale));
  const height = ascender + descender;
  const measuredWidth = measureText(text, fontSize, bold);
  const width = maxWidth != null ? Math.min(measuredWidth, maxWidth) : measuredWidth;

  if (width <= 0 || height <= 0) {
    return { data: new Float32Array(0), width: 0, height, baseline: ascender };
  }

  const data = new Float32Array(width * height);

  // Get the path for the text
  const path = font.getPath(text, 0, ascender, fontSize);

  // Rasterize: for each pixel, check if it's inside the path using a scanline approach
  // opentype.js gives us path commands — we'll use a simple coverage-based approach
  const cmds = path.commands;
  rasterizePath(cmds, data, width, height);

  return { data, width, height, baseline: ascender };
}

/**
 * Rasterize a path into the data buffer using scanline coverage.
 * Uses 4x supersampling for anti-aliased edges.
 */
function rasterizePath(
  cmds: opentype.PathCommand[],
  data: Float32Array,
  width: number,
  height: number,
): void {
  const SUPERSAMPLE = 4;
  const subStep = 1 / SUPERSAMPLE;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let coverage = 0;
      // Supersample within this pixel
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = px + (sx + 0.5) * subStep;
          const y = py + (sy + 0.5) * subStep;
          if (isInsidePath(cmds, x, y)) {
            coverage++;
          }
        }
      }
      data[py * width + px] = coverage / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
}

/**
 * Test if a point is inside the path using the even-odd winding rule (ray casting).
 */
function isInsidePath(cmds: opentype.PathCommand[], testX: number, testY: number): boolean {
  let inside = false;
  let curX = 0;
  let curY = 0;

  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'L') {
      if (rayCrossesSegment(testX, testY, curX, curY, cmd.x, cmd.y)) {
        inside = !inside;
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Q') {
      // Quadratic bezier — approximate with line segments
      const steps = 8;
      let prevX = curX;
      let prevY = curY;
      for (let t = 1; t <= steps; t++) {
        const tt = t / steps;
        const invT = 1 - tt;
        const nx = invT * invT * curX + 2 * invT * tt * cmd.x1 + tt * tt * cmd.x;
        const ny = invT * invT * curY + 2 * invT * tt * cmd.y1 + tt * tt * cmd.y;
        if (rayCrossesSegment(testX, testY, prevX, prevY, nx, ny)) {
          inside = !inside;
        }
        prevX = nx;
        prevY = ny;
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'C') {
      // Cubic bezier — approximate with line segments
      const steps = 12;
      let prevX = curX;
      let prevY = curY;
      for (let t = 1; t <= steps; t++) {
        const tt = t / steps;
        const invT = 1 - tt;
        const nx =
          invT * invT * invT * curX +
          3 * invT * invT * tt * cmd.x1 +
          3 * invT * tt * tt * cmd.x2 +
          tt * tt * tt * cmd.x;
        const ny =
          invT * invT * invT * curY +
          3 * invT * invT * tt * cmd.y1 +
          3 * invT * tt * tt * cmd.y2 +
          tt * tt * tt * cmd.y;
        if (rayCrossesSegment(testX, testY, prevX, prevY, nx, ny)) {
          inside = !inside;
        }
        prevX = nx;
        prevY = ny;
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Z') {
      // Close path — handled implicitly
    }
  }

  return inside;
}

/** Test if a horizontal ray from (testX, testY) going right crosses a line segment */
function rayCrossesSegment(
  testX: number,
  testY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (y1 > testY === y2 > testY) return false;
  const intersectX = x1 + ((testY - y1) / (y2 - y1)) * (x2 - x1);
  return testX < intersectX;
}
