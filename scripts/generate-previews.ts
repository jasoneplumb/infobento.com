/**
 * Generate preview images using the new design language:
 * - Two font sizes: hero (Spleen 8x16) and data (built-in 5x7)
 * - Whitespace separation instead of borders
 * - Differentiated visual treatment per box type
 * - 3-4 items max per screen for best readability
 */

import { createFrameBuffer, frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import {
  setPixel,
  drawRect,
  drawText,
  drawTextWrapped,
  drawHLine,
} from '../packages/renderer/src/draw.js';
import { FONT_HEIGHT } from '../packages/renderer/src/font.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 4;
const W = 240;
const H = 200;

// --- BDF font parser ---

interface BDFGlyph {
  width: number;
  height: number;
  xoff: number;
  yoff: number;
  rows: number[];
}

interface BDFFont {
  width: number;
  height: number;
  glyphs: Record<string, BDFGlyph>;
}

function parseBDF(path: string): BDFFont {
  const lines = readFileSync(path, 'utf8').split('\n');
  const glyphs: Record<string, BDFGlyph> = {};
  let fontWidth = 0,
    fontHeight = 0;
  let currentChar = -1;
  let inBitmap = false;
  let bitmapRows: number[] = [];
  let bbxW = 0,
    bbxH = 0,
    bbxXoff = 0,
    bbxYoff = 0;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('FONTBOUNDINGBOX ')) {
      const p = t.split(/\s+/);
      fontWidth = parseInt(p[1] ?? '0', 10);
      fontHeight = parseInt(p[2] ?? '0', 10);
    } else if (t.startsWith('ENCODING ')) {
      currentChar = parseInt(t.split(/\s+/)[1] ?? '-1', 10);
    } else if (t.startsWith('BBX ')) {
      const p = t.split(/\s+/);
      bbxW = parseInt(p[1] ?? '0', 10);
      bbxH = parseInt(p[2] ?? '0', 10);
      bbxXoff = parseInt(p[3] ?? '0', 10);
      bbxYoff = parseInt(p[4] ?? '0', 10);
    } else if (t === 'BITMAP') {
      inBitmap = true;
      bitmapRows = [];
    } else if (t === 'ENDCHAR') {
      if (currentChar >= 32 && currentChar < 127) {
        glyphs[String.fromCharCode(currentChar)] = {
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
      bitmapRows.push(parseInt(t, 16));
    }
  }

  return { width: fontWidth, height: fontHeight, glyphs };
}

// --- Hero font: Spleen 8x16 ---

const heroFont = parseBDF('/tmp/fonts/spleen-8x16.bdf');
const HERO_H = heroFont.height;

function drawBDFChar(fb: FrameBuffer, font: BDFFont, x: number, y: number, char: string): number {
  const glyph = font.glyphs[char];
  if (!glyph) return font.width;
  const bytesPerRow = Math.ceil(glyph.width / 8);
  const totalBits = bytesPerRow * 8;

  for (let row = 0; row < glyph.height; row++) {
    const rowData = glyph.rows[row];
    if (rowData == null) continue;
    for (let col = 0; col < glyph.width; col++) {
      const bitPos = totalBits - 1 - col;
      if (rowData & (1 << bitPos)) {
        setPixel(fb, x + glyph.xoff + col, y + (font.height - glyph.height - glyph.yoff) + row);
      }
    }
  }
  return glyph.width + 1;
}

function drawHeroText(fb: FrameBuffer, x: number, y: number, text: string): number {
  let cx = x;
  for (const char of text) {
    cx += drawBDFChar(fb, heroFont, cx, y, char);
  }
  return cx - x; // return total width drawn
}

/** Measure hero text width without drawing */
function heroWidth(text: string): number {
  return text.length * (heroFont.width + 1);
}

// --- Drawing helpers ---

/** Draw a thin horizontal rule (1px solid line) */
function drawRule(fb: FrameBuffer, x: number, y: number, width: number): void {
  drawHLine(fb, x, y, width);
}

/** Draw small uppercase label text */
function drawLabel(fb: FrameBuffer, x: number, y: number, text: string): void {
  drawText(fb, x, y, text.toUpperCase(), W - x);
}

/** Draw a fake QR code with finder patterns */
function drawFakeQR(fb: FrameBuffer, x: number, y: number, size: number): void {
  drawRect(fb, x, y, size, size);
  const pad = 3;
  const finderSize = Math.min(12, Math.floor(size / 5));
  const inner = finderSize - 4;

  // Three finder patterns: TL, TR, BL
  for (const [fx, fy] of [
    [x + pad, y + pad],
    [x + size - pad - finderSize, y + pad],
    [x + pad, y + size - pad - finderSize],
  ] as const) {
    drawRect(fb, fx, fy, finderSize, finderSize);
    drawRect(fb, fx + 2, fy + 2, finderSize - 4, finderSize - 4);
    for (let dy = 0; dy < inner; dy++) {
      drawHLine(
        fb,
        fx + 2 + Math.floor((finderSize - 4 - inner) / 2),
        fy + 2 + Math.floor((finderSize - 4 - inner) / 2) + dy,
        inner,
      );
    }
  }

  // Scattered data dots
  const dataStart = pad + finderSize + 2;
  const dataEnd = size - pad - 2;
  for (let dy = dataStart; dy < dataEnd; dy += 3) {
    for (let dx = dataStart; dx < dataEnd; dx += 3) {
      if ((dx * 7 + dy * 13) % 5 < 3) {
        setPixel(fb, x + dx, y + dy);
        setPixel(fb, x + dx + 1, y + dy);
        setPixel(fb, x + dx, y + dy + 1);
        setPixel(fb, x + dx + 1, y + dy + 1);
      }
    }
  }
}

// ============================================================
// Config A: Morning Commuter — hero weather, compact data rows
// ============================================================
function renderCommuter(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Weather: hero temperature + conditions
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '62F');
  // Conditions next to hero temp
  drawText(fb, 4 + heroWidth('62F') + 6, y + 2, 'Partly Cloudy', W - 60);
  drawText(fb, 4 + heroWidth('62F') + 6, y + 2 + FONT_HEIGHT + 2, 'H:68  L:55', W - 60);
  y += HERO_H + 6;

  // Thin rule separator
  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Next event
  drawLabel(fb, 4, y, 'next');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '9:00');
  drawText(fb, 4 + heroWidth('9:00') + 6, y + 4, 'Standup w/ team', W - 80);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Countdown
  drawLabel(fb, 4, y, 'countdown');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '14');
  drawText(fb, 4 + heroWidth('14') + 6, y + 4, 'days to Maui', W - 50);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Inbox counts — compact row
  drawLabel(fb, 4, y, 'inbox');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '3 email  7 slack  1 teams', W - 8);

  return fb;
}

// ============================================================
// Config B: Desk Display — spacious, 3 items, big focus text
// ============================================================
function renderDesk(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 6;

  // Date: hero
  drawLabel(fb, 4, y, 'today');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, 'Mon Apr 21');
  y += HERO_H + 2;
  drawText(fb, 4, y, '2026', W - 8);
  y += FONT_HEIGHT + 10;

  drawRule(fb, 4, y, W - 8);
  y += 8;

  // Focus: wrapped text, larger section
  drawLabel(fb, 4, y, 'focus');
  y += FONT_HEIGHT + 4;
  drawTextWrapped(fb, 4, y, 'Ship the renderer. Everything else can wait.', W - 8, 40);
  y += 40 + 10;

  drawRule(fb, 4, y, W - 8);
  y += 8;

  // Streak: hero number
  drawLabel(fb, 4, y, 'streak');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '12');
  drawText(fb, 4 + heroWidth('12') + 6, y + 4, 'days without', W - 50);
  drawText(fb, 4 + heroWidth('12') + 6, y + 4 + FONT_HEIGHT + 2, 'skipping a workout', W - 50);

  return fb;
}

// ============================================================
// Config C: Networking Card — name left, QR right, links below
// ============================================================
function renderNetworking(): FrameBuffer {
  const fb = createFrameBuffer();
  const qrSize = 90;
  const qrX = W - qrSize - 6;
  const textW = qrX - 10;

  // Top section: name + title on left, QR on right
  let y = 8;
  drawHeroText(fb, 6, y, 'BENTO');
  y += HERO_H + 2;
  drawHeroText(fb, 6, y, 'MCBOXFACE');
  y += HERO_H + 6;
  drawText(fb, 6, y, 'Chief Pixel Wrangler', textW);
  y += FONT_HEIGHT + 2;
  drawText(fb, 6, y, '@ InfoBento', textW);

  // QR on the right
  drawFakeQR(fb, qrX, 6, qrSize);

  // Rule across full width
  const ruleY = 8 + qrSize + 4;
  drawRule(fb, 4, ruleY, W - 8);

  // Links section below
  let linkY = ruleY + 6;
  drawLabel(fb, 6, linkY, 'links');
  linkY += FONT_HEIGHT + 4;
  drawText(fb, 6, linkY, 'github.com/bentomcboxface', W - 12);
  linkY += FONT_HEIGHT + 3;
  drawText(fb, 6, linkY, 'linkedin.com/in/definitely-real', W - 12);

  return fb;
}

// ============================================================
// Config D: Kitchen Counter — weather hero + agenda + groceries
// ============================================================
function renderKitchen(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Weather hero
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '58F');
  drawText(fb, 4 + heroWidth('58F') + 6, y + 2, 'Rainy', W - 60);
  drawText(fb, 4 + heroWidth('58F') + 6, y + 2 + FONT_HEIGHT + 2, 'Precip 80%  Wind 12mph', W - 60);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Agenda — compact multi-line
  drawLabel(fb, 4, y, 'agenda');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '8:30  School drop-off', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '10:00 Dentist', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '3:15  Pickup', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '6:00  Dinner @ Pok Pok', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Groceries
  drawLabel(fb, 4, y, 'groceries');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Eggs  Milk  Sourdough', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Cilantro  Limes', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Doors — status row
  drawLabel(fb, 4, y, 'doors');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Front:Locked Garage:Locked', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Back: UNLOCKED', W - 8);

  return fb;
}

// ============================================================
// Config E: Minimal — giant quote, days-alive hero number
// ============================================================
function renderMinimal(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 10;

  // Big quote — take most of the screen
  drawTextWrapped(fb, 8, y, 'Simplicity is the ultimate sophistication.', W - 16, 60);
  y += 55;
  drawText(fb, 8, y, '-- Leonardo da Vinci', W - 16);
  y += FONT_HEIGHT + 20;

  drawRule(fb, 4, y, W - 8);
  y += 10;

  // Days alive — hero number centered
  drawLabel(fb, 4, y, 'days alive');
  y += FONT_HEIGHT + 4;
  drawHeroText(fb, 4, y, '13,297');

  return fb;
}

// ============================================================
// Config F: Busy Parent — 4 items with hero weather (was 6, now 4)
// ============================================================
function renderBusyParent(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Weather hero
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '72F');
  drawText(fb, 4 + heroWidth('72F') + 6, y + 2, 'Sunny  UV: High', W - 60);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Next event — hero time
  drawLabel(fb, 4, y, 'next event');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '2:30');
  drawText(fb, 4 + heroWidth('2:30') + 6, y + 4, 'Soccer practice', W - 80);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Countdown — hero number
  drawLabel(fb, 4, y, 'countdown');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '8');
  drawText(fb, 4 + heroWidth('8') + 6, y + 4, 'days to Spring Break', W - 40);
  y += HERO_H + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Messages — compact counts
  drawLabel(fb, 4, y, 'messages');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '2 texts  5 email  0 slack', W - 8);

  return fb;
}

// ============================================================
// Render all configs and build contact sheet
// ============================================================

const renderers = [
  { name: 'A-commuter', render: renderCommuter },
  { name: 'B-desk', render: renderDesk },
  { name: 'C-networking', render: renderNetworking },
  { name: 'D-kitchen', render: renderKitchen },
  { name: 'E-minimal', render: renderMinimal },
  { name: 'F-maxdensity', render: renderBusyParent },
];

const pngs: { name: string; data: Uint8Array }[] = [];

for (const { name, render } of renderers) {
  const fb = render();
  const png = frameToPng(fb, SCALE);
  const path = `previews/${name}.png`;
  writeFileSync(path, png);
  pngs.push({ name, data: png });
  console.log(`  ${path} (${png.length} bytes)`);
}

// Build contact sheet: 3 columns x 2 rows
const COLS = 3;
const ROWS = 2;
const cellW = W * SCALE;
const cellH = H * SCALE;
const gap = 16;
const labelH = 32;
const sheetW = COLS * cellW + (COLS - 1) * gap + gap * 2;
const sheetH = ROWS * (cellH + labelH) + (ROWS - 1) * gap + gap * 2;

const sheet = new PNG({ width: sheetW, height: sheetH, colorType: 2 });

// Fill with light gray background
for (let y = 0; y < sheetH; y++) {
  for (let x = 0; x < sheetW; x++) {
    const idx = (y * sheetW + x) * 4;
    sheet.data[idx] = 0xee;
    sheet.data[idx + 1] = 0xee;
    sheet.data[idx + 2] = 0xee;
    sheet.data[idx + 3] = 0xff;
  }
}

// Place each preview into the contact sheet
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
writeFileSync('previews/contact-sheet.png', sheetPng);
console.log(`  previews/contact-sheet.png (${sheetPng.length} bytes)`);
console.log('Done.');
