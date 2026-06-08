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
  // Carry each glyph forward to the next iteration so each char is resolved once.
  let glyph: opentype.Glyph | undefined;
  for (let i = 0; i < text.length; i++) {
    const current = glyph ?? font.charToGlyph(text[i] ?? ' ');
    width += (current.advanceWidth ?? 0) * scale;
    // Apply kerning
    if (i < text.length - 1) {
      const nextGlyph = font.charToGlyph(text[i + 1] ?? ' ');
      width += font.getKerningValue(current, nextGlyph) * scale;
      glyph = nextGlyph;
    } else {
      glyph = undefined;
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

  // Build path commands per-glyph rather than via Font.getPath. opentype.js 2.x
  // applies GSUB layout features inside Font.getPath and throws on Inter's
  // unsupported lookup type 6 / substFormat 2; positioning each glyph ourselves
  // (mirroring measureText's advance + kerning walk) sidesteps that and matches
  // opentype.js 1.x getPath output — kerning applied, no ligature substitution.
  const cmds = textToPathCommands(font, text, fontSize, ascender);

  // Rasterize: for each pixel, check if it's inside the path using a scanline approach
  // opentype.js gives us path commands — we'll use a simple coverage-based approach
  rasterizePath(cmds, data, width, height);

  return { data, width, height, baseline: ascender };
}

/**
 * Build path commands for a string by positioning each glyph individually.
 * Drives glyph.getPath directly so we never enter Font.getPath's GSUB
 * substitution (unsupported for Inter in opentype.js 2.x). Advance and kerning
 * match measureText so glyph positions stay consistent between measure and raster.
 */
function textToPathCommands(
  font: opentype.Font,
  text: string,
  fontSize: number,
  baseline: number,
): opentype.PathCommand[] {
  const scale = fontSize / font.unitsPerEm;
  const commands: opentype.PathCommand[] = [];
  let penX = 0;
  // Carry each glyph forward to the next iteration so each char is resolved once.
  let glyph: opentype.Glyph | undefined;
  for (let i = 0; i < text.length; i++) {
    const current = glyph ?? font.charToGlyph(text[i] ?? ' ');
    for (const cmd of current.getPath(penX, baseline, fontSize).commands) {
      commands.push(cmd);
    }
    penX += (current.advanceWidth ?? 0) * scale;
    // Apply kerning to the next glyph's pen position
    if (i < text.length - 1) {
      const nextGlyph = font.charToGlyph(text[i + 1] ?? ' ');
      penX += font.getKerningValue(current, nextGlyph) * scale;
      glyph = nextGlyph;
    } else {
      glyph = undefined;
    }
  }
  return commands;
}

/**
 * Flatten path commands into line segments for fast scanline rasterization.
 * Bezier curves are subdivided into straight segments.
 */
function flattenPath(cmds: opentype.PathCommand[]): Array<[number, number, number, number]> {
  const segments: Array<[number, number, number, number]> = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      startX = cmd.x;
      startY = cmd.y;
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'L') {
      segments.push([curX, curY, cmd.x, cmd.y]);
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Q') {
      const steps = 4;
      let prevX = curX;
      let prevY = curY;
      for (let t = 1; t <= steps; t++) {
        const tt = t / steps;
        const invT = 1 - tt;
        const nx = invT * invT * curX + 2 * invT * tt * cmd.x1 + tt * tt * cmd.x;
        const ny = invT * invT * curY + 2 * invT * tt * cmd.y1 + tt * tt * cmd.y;
        segments.push([prevX, prevY, nx, ny]);
        prevX = nx;
        prevY = ny;
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'C') {
      const steps = 6;
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
        segments.push([prevX, prevY, nx, ny]);
        prevX = nx;
        prevY = ny;
      }
      curX = cmd.x;
      curY = cmd.y;
    } else if (cmd.type === 'Z') {
      if (curX !== startX || curY !== startY) {
        segments.push([curX, curY, startX, startY]);
      }
      curX = startX;
      curY = startY;
    }
  }
  return segments;
}

/**
 * Fast scanline rasterizer with 2x supersampling for anti-aliased edges.
 * Pre-flattens beziers, then for each scanline finds edge intersections and fills.
 */
function rasterizePath(
  cmds: opentype.PathCommand[],
  data: Float32Array,
  width: number,
  height: number,
): void {
  const segments = flattenPath(cmds);
  const SS = 2; // supersampling factor
  const subStep = 1 / SS;
  const invSS2 = 1 / (SS * SS);

  for (let py = 0; py < height; py++) {
    // For each sub-scanline, find all x-intersections
    for (let sy = 0; sy < SS; sy++) {
      const scanY = py + (sy + 0.5) * subStep;
      const xHits: number[] = [];

      for (const seg of segments) {
        const [x1, y1, x2, y2] = seg;
        if (y1 > scanY === y2 > scanY) continue;
        const intersectX = x1 + ((scanY - y1) / (y2 - y1)) * (x2 - x1);
        xHits.push(intersectX);
      }

      xHits.sort((a, b) => a - b);

      // Fill between pairs of intersections (even-odd rule)
      for (let i = 0; i + 1 < xHits.length; i += 2) {
        const xStart = xHits[i] ?? 0;
        const xEnd = xHits[i + 1] ?? 0;
        // For each sub-pixel column in the span
        for (let sx = 0; sx < SS; sx++) {
          const pxStart = Math.max(0, Math.floor(xStart));
          const pxEnd = Math.min(width - 1, Math.floor(xEnd));
          for (let px = pxStart; px <= pxEnd; px++) {
            const sampleX = px + (sx + 0.5) * subStep;
            if (sampleX >= xStart && sampleX < xEnd) {
              const idx = py * width + px;
              data[idx] = (data[idx] ?? 0) + invSS2;
            }
          }
        }
      }
    }
  }

  // Clamp to 0-1
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v != null && v > 1) data[i] = 1;
  }
}
