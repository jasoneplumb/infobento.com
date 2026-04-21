/**
 * Generate Config F (Busy Parent) with different hero bitmap fonts:
 * 1. Current 2x-scaled 5x7 (baseline)
 * 2. Spleen 8x16
 * 3. Tamzen 8x16
 * 4. Tamzen 10x20
 *
 * Parses BDF font files and renders each variant for comparison.
 */

import { createFrameBuffer, frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import { setPixel, drawText, drawHLine } from '../packages/renderer/src/draw.js';
import { FONT_DATA, FONT_WIDTH, FONT_HEIGHT } from '../packages/renderer/src/font.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 4;
const W = 240;
const H = 200;

// ============================================================
// BDF font parser — extracts glyph bitmaps from BDF files
// ============================================================

interface BDFGlyph {
  width: number;
  height: number;
  xoff: number;
  yoff: number;
  rows: number[]; // each row is a bitmask
}

interface BDFFont {
  name: string;
  width: number;
  height: number;
  glyphs: Record<string, BDFGlyph>;
}

function parseBDF(path: string): BDFFont {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const glyphs: Record<string, BDFGlyph> = {};
  let fontWidth = 0;
  let fontHeight = 0;
  let currentChar = -1;

  let inBitmap = false;
  let bitmapRows: number[] = [];
  let bbxW = 0,
    bbxH = 0,
    bbxXoff = 0,
    bbxYoff = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('FONTBOUNDINGBOX ')) {
      const parts = trimmed.split(/\s+/);
      fontWidth = parseInt(parts[1] ?? '0', 10);
      fontHeight = parseInt(parts[2] ?? '0', 10);
    } else if (trimmed.startsWith('ENCODING ')) {
      currentChar = parseInt(trimmed.split(/\s+/)[1] ?? '-1', 10);
    } else if (trimmed.startsWith('BBX ')) {
      const parts = trimmed.split(/\s+/);
      bbxW = parseInt(parts[1] ?? '0', 10);
      bbxH = parseInt(parts[2] ?? '0', 10);
      bbxXoff = parseInt(parts[3] ?? '0', 10);
      bbxYoff = parseInt(parts[4] ?? '0', 10);
    } else if (trimmed === 'BITMAP') {
      inBitmap = true;
      bitmapRows = [];
    } else if (trimmed === 'ENDCHAR') {
      if (currentChar >= 32 && currentChar < 127) {
        const char = String.fromCharCode(currentChar);
        glyphs[char] = {
          width: bbxW,
          height: bbxH,
          xoff: bbxXoff,
          yoff: bbxYoff,
          rows: bitmapRows,
        };
      }
      inBitmap = false;

      currentChar = -1;
    } else if (inBitmap) {
      bitmapRows.push(parseInt(trimmed, 16));
    }
  }

  return { name: path.split('/').pop() ?? 'unknown', width: fontWidth, height: fontHeight, glyphs };
}

// ============================================================
// Render a BDF glyph at a given position
// ============================================================

function drawBDFChar(fb: FrameBuffer, font: BDFFont, x: number, y: number, char: string): number {
  const glyph = font.glyphs[char];
  if (!glyph) return font.width;

  // BDF hex rows are byte-aligned — figure out how many bytes per row
  const bytesPerRow = Math.ceil(glyph.width / 8);
  const totalBits = bytesPerRow * 8;

  for (let row = 0; row < glyph.height; row++) {
    const rowData = glyph.rows[row];
    if (rowData == null) continue;
    for (let col = 0; col < glyph.width; col++) {
      // Bits are MSB-first, left-aligned in the byte(s)
      const bitPos = totalBits - 1 - col;
      if (rowData & (1 << bitPos)) {
        const px = x + glyph.xoff + col;
        const py = y + (font.height - glyph.height - glyph.yoff) + row;
        setPixel(fb, px, py);
      }
    }
  }

  return glyph.width + 1; // advance = glyph width + 1px spacing
}

function drawBDFText(fb: FrameBuffer, font: BDFFont, x: number, y: number, text: string): void {
  let cx = x;
  for (const char of text) {
    const adv = drawBDFChar(fb, font, cx, y, char);
    cx += adv;
  }
}

// ============================================================
// 2x-scaled built-in font (current baseline)
// ============================================================

const HERO_SCALE = 2;
const HERO_H = FONT_HEIGHT * HERO_SCALE;
const HERO_ADVANCE = (FONT_WIDTH + 1) * HERO_SCALE;

function drawHeroChar(fb: FrameBuffer, x: number, y: number, char: string): void {
  const glyph = FONT_DATA[char];
  if (!glyph) return;
  for (let row = 0; row < FONT_HEIGHT; row++) {
    const rowData = glyph[row];
    if (rowData == null) continue;
    for (let col = 0; col < FONT_WIDTH; col++) {
      if (rowData & (1 << (FONT_WIDTH - 1 - col))) {
        for (let dy = 0; dy < HERO_SCALE; dy++) {
          for (let dx = 0; dx < HERO_SCALE; dx++) {
            setPixel(fb, x + col * HERO_SCALE + dx, y + row * HERO_SCALE + dy);
          }
        }
      }
    }
  }
}

function drawBuiltinHeroText(fb: FrameBuffer, x: number, y: number, text: string): void {
  let cx = x;
  for (const char of text) {
    drawHeroChar(fb, cx, y, char);
    cx += HERO_ADVANCE;
  }
}

// ============================================================
// Render Config F with a given hero text function
// ============================================================

type HeroDrawFn = (fb: FrameBuffer, x: number, y: number, text: string) => void;

function drawLabel(fb: FrameBuffer, x: number, y: number, text: string): void {
  drawText(fb, x, y, text.toUpperCase(), W - x);
}

function drawRule(fb: FrameBuffer, x: number, y: number, width: number): void {
  drawHLine(fb, x, y, width);
}

function renderBusyParent(heroText: HeroDrawFn, heroH: number): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Weather hero
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  heroText(fb, 4, y, '72F');
  drawText(fb, 4 + Math.ceil(heroH * 2.5), y + 2, 'Sunny  UV: High', W - 60);
  y += heroH + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Next event
  drawLabel(fb, 4, y, 'next event');
  y += FONT_HEIGHT + 2;
  heroText(fb, 4, y, '2:30');
  drawText(fb, 4 + Math.ceil(heroH * 3.2), y + 4, 'Soccer practice', W - 80);
  y += heroH + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Countdown
  drawLabel(fb, 4, y, 'countdown');
  y += FONT_HEIGHT + 2;
  heroText(fb, 4, y, '8');
  drawText(fb, 4 + Math.ceil(heroH * 1.2), y + 4, 'days to Spring Break', W - 40);
  y += heroH + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Messages
  drawLabel(fb, 4, y, 'messages');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '2 texts  5 email  0 slack', W - 8);

  return fb;
}

// ============================================================
// Load fonts and generate variants
// ============================================================

const spleen8x16 = parseBDF('/tmp/fonts/spleen-8x16.bdf');
const tamzen8x16 = parseBDF('/tmp/fonts/tamzen-8x16.bdf');
const tamzen10x20 = parseBDF('/tmp/fonts/tamzen-10x20.bdf');

console.log(
  `Loaded: ${spleen8x16.name} (${spleen8x16.width}x${spleen8x16.height}, ${Object.keys(spleen8x16.glyphs).length} glyphs)`,
);
console.log(
  `Loaded: ${tamzen8x16.name} (${tamzen8x16.width}x${tamzen8x16.height}, ${Object.keys(tamzen8x16.glyphs).length} glyphs)`,
);
console.log(
  `Loaded: ${tamzen10x20.name} (${tamzen10x20.width}x${tamzen10x20.height}, ${Object.keys(tamzen10x20.glyphs).length} glyphs)`,
);

const variants: { name: string; heroFn: HeroDrawFn; heroH: number }[] = [
  {
    name: 'F-baseline-2x5x7',
    heroFn: drawBuiltinHeroText,
    heroH: HERO_H,
  },
  {
    name: 'F-spleen-8x16',
    heroFn: (fb, x, y, text) => drawBDFText(fb, spleen8x16, x, y, text),
    heroH: spleen8x16.height,
  },
  {
    name: 'F-tamzen-8x16',
    heroFn: (fb, x, y, text) => drawBDFText(fb, tamzen8x16, x, y, text),
    heroH: tamzen8x16.height,
  },
  {
    name: 'F-tamzen-10x20',
    heroFn: (fb, x, y, text) => drawBDFText(fb, tamzen10x20, x, y, text),
    heroH: tamzen10x20.height,
  },
];

const pngs: { name: string; data: Uint8Array }[] = [];

for (const { name, heroFn, heroH } of variants) {
  const fb = renderBusyParent(heroFn, heroH);
  const png = frameToPng(fb, SCALE);
  const path = `previews/${name}.png`;
  writeFileSync(path, png);
  pngs.push({ name, data: png });
  console.log(`  ${path} (${png.length} bytes)`);
}

// Build contact sheet: 2x2 grid
const COLS = 2;
const ROWS = 2;
const cellW = W * SCALE;
const cellH = H * SCALE;
const gap = 16;
const labelH = 0;
const sheetW = COLS * cellW + (COLS - 1) * gap + gap * 2;
const sheetH = ROWS * (cellH + labelH) + (ROWS - 1) * gap + gap * 2;

const sheet = new PNG({ width: sheetW, height: sheetH, colorType: 2 });

for (let y = 0; y < sheetH; y++) {
  for (let x = 0; x < sheetW; x++) {
    const idx = (y * sheetW + x) * 4;
    sheet.data[idx] = 0xee;
    sheet.data[idx + 1] = 0xee;
    sheet.data[idx + 2] = 0xee;
    sheet.data[idx + 3] = 0xff;
  }
}

for (let i = 0; i < pngs.length; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const offsetX = gap + col * (cellW + gap);
  const offsetY = gap + row * (cellH + labelH + gap);

  const entry = pngs[i];
  if (!entry) continue;
  const img = PNG.sync.read(Buffer.from(entry.data));

  for (let y = 0; y < img.height && y < cellH; y++) {
    for (let x = 0; x < img.width && x < cellW; x++) {
      const srcIdx = (y * img.width + x) * 4;
      const dstIdx = ((offsetY + labelH + y) * sheetW + (offsetX + x)) * 4;
      sheet.data[dstIdx] = img.data[srcIdx] ?? 0;
      sheet.data[dstIdx + 1] = img.data[srcIdx + 1] ?? 0;
      sheet.data[dstIdx + 2] = img.data[srcIdx + 2] ?? 0;
      sheet.data[dstIdx + 3] = 0xff;
    }
  }
}

const sheetPng = PNG.sync.write(sheet);
writeFileSync('previews/F-font-comparison.png', sheetPng);
console.log(`  previews/F-font-comparison.png (${sheetPng.length} bytes)`);
console.log('Done.');
