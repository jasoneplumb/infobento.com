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

/** Inter static weights (100–900) for the Font Weight control. */
const WEIGHT_FILES: Record<number, string> = {
  100: 'Inter-Thin.ttf',
  200: 'Inter-ExtraLight.ttf',
  300: 'Inter-Light.ttf',
  400: 'Inter-Regular.ttf',
  500: 'Inter-Medium.ttf',
  600: 'Inter-SemiBold.ttf',
  700: 'Inter-Bold.ttf',
  800: 'Inter-ExtraBold.ttf',
  900: 'Inter-Black.ttf',
};
const regularFont = loadFont('Inter-Regular.ttf'); // guaranteed fallback weight
const weightFonts = new Map<number, opentype.Font>();
for (const [w, file] of Object.entries(WEIGHT_FILES)) {
  weightFonts.set(Number(w), Number(w) === 400 ? regularFont : loadFont(file));
}

/** Body text weight for this render (snapped to a loaded weight). Bold text
 *  (headers/hero) renders ~3 steps heavier, preserving the Regular→Bold gap. */
let bodyWeight = 400;

/** Set the body text weight (100–900), snapped to the nearest loaded weight. */
export function setBodyWeight(weight: number): void {
  bodyWeight = Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
}

// Bold (headers/hero) renders +3 weight steps heavier than body. Above body=600
// the +300 saturates at 900, so the bold/body gap narrows and collapses entirely
// at body=900 (both render Black) — acceptable, since very heavy body text is an
// intentional, uncommon choice and hierarchy is then carried by size alone.
function fontFor(bold: boolean): opentype.Font {
  const w = bold ? Math.min(900, bodyWeight + 300) : bodyWeight;
  return weightFonts.get(w) ?? regularFont;
}

/** Body text size in pixels (height) — appropriate for 920x680 at ~130-200 DPI */
export const BODY_FONT_SIZE = 20;

/** Hero text size in pixels (height) */
export const HERO_FONT_SIZE = 52;

/** Line height for body text */
export const BODY_LINE_HEIGHT = Math.round(BODY_FONT_SIZE * 1.3);

/** Line height for hero text */
export const HERO_LINE_HEIGHT = Math.round(HERO_FONT_SIZE * 1.15);

/**
 * Walk a string glyph-by-glyph, invoking `visit` with each glyph at its pen
 * x-offset (advance and kerning applied). Each character is resolved via
 * charToGlyph exactly once by carrying the glyph forward to the next iteration.
 * Returns the total advance width in pixels. Shared by measureText and
 * textToPathCommands so measurement and rasterization can never drift apart.
 */
function walkGlyphs(
  font: opentype.Font,
  text: string,
  fontSize: number,
  visit?: (glyph: opentype.Glyph, penX: number) => void,
): number {
  const scale = fontSize / font.unitsPerEm;
  let penX = 0;
  let glyph: opentype.Glyph | undefined;
  for (let i = 0; i < text.length; i++) {
    const current = glyph ?? font.charToGlyph(text[i] ?? ' ');
    visit?.(current, penX);
    penX += (current.advanceWidth ?? 0) * scale;
    // Apply kerning to advance the pen toward the next glyph
    if (i < text.length - 1) {
      const nextGlyph = font.charToGlyph(text[i + 1] ?? ' ');
      penX += font.getKerningValue(current, nextGlyph) * scale;
      glyph = nextGlyph;
    }
  }
  return penX;
}

/**
 * Measure the width of a string in pixels at the given font size.
 */
export function measureText(text: string, fontSize: number, bold = false): number {
  const font = fontFor(bold);
  return Math.round(walkGlyphs(font, text, fontSize));
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
  const font = fontFor(bold);
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
  const commands: opentype.PathCommand[] = [];
  walkGlyphs(font, text, fontSize, (glyph, penX) => {
    // Pass `font` so composite/compound glyphs (e.g. some accented chars) can
    // resolve their component glyphs; without it they silently emit empty paths.
    for (const cmd of glyph.getPath(penX, baseline, fontSize, {}, font).commands) {
      commands.push(cmd);
    }
  });
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
 * Fast scanline rasterizer with 3x supersampling for anti-aliased edges.
 * Pre-flattens beziers, then for each scanline finds edge intersections and fills.
 */
function rasterizePath(
  cmds: opentype.PathCommand[],
  data: Float32Array,
  width: number,
  height: number,
): void {
  const segments = flattenPath(cmds);
  const SS = 3; // supersampling factor (3x3 sub-samples → 10 coverage levels)
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
