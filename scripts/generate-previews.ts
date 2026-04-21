/**
 * Generate preview images for the 128x296 portrait eInk display.
 * Uses the embedded Spleen 8x16 hero font (no external BDF files).
 * Six configs: commuter, desk, networking, kitchen, minimal, busy-parent.
 * Outputs individual PNGs + a 3x2 contact sheet.
 */

import { createFrameBuffer, frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import {
  setPixel,
  drawRect,
  drawText,
  drawTextWrapped,
  drawHLine,
  drawHeroText,
} from '../packages/renderer/src/draw.js';
import { FONT_HEIGHT } from '../packages/renderer/src/font.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../packages/renderer/src/hero-font.js';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 3;
const W = 128;
const H = 296;

const HERO_H = HERO_FONT_HEIGHT;

/** Measure hero text width without drawing */
function heroWidth(text: string): number {
  return text.length * HERO_CHAR_ADVANCE;
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
// Config A: Morning Commuter — weather hero + next event + countdown + inbox
// 4 sections at ~73px each
// ============================================================
function renderCommuter(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Section 1: Weather — hero temp + condition beside, H/L on own line
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '62F');
  const condX = 4 + heroWidth('62F') + 6;
  drawText(fb, condX, y + 2, 'Partly', W - condX);
  drawText(fb, condX, y + 2 + FONT_HEIGHT + 1, 'Cloudy', W - condX);
  y += HERO_H + 2;
  drawText(fb, 4, y, 'H:68 L:55', W - 8);
  y += FONT_HEIGHT + 4;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 2: Next event
  drawLabel(fb, 4, y, 'next');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '9:00');
  y += HERO_H + 2;
  drawText(fb, 4, y, 'Standup w/ team', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 3: Countdown
  drawLabel(fb, 4, y, 'countdown');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '14');
  drawText(fb, 4 + heroWidth('14') + 4, y + 4, 'days to', W - 8);
  y += HERO_H + 2;
  drawText(fb, 4, y, 'Maui', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 4: Inbox counts
  drawLabel(fb, 4, y, 'inbox');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '3 email  7 slack', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '1 teams', W - 8);

  return fb;
}

// ============================================================
// Config B: Desk Display — date hero + focus text + streak
// 3 sections, spacious
// ============================================================
function renderDesk(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 6;

  // Section 1: Date — hero (shortened to fit 14 chars)
  drawLabel(fb, 4, y, 'today');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, 'Mon Apr 21');
  y += HERO_H + 2;
  drawText(fb, 4, y, '2026', W - 8);
  y += FONT_HEIGHT + 16;

  drawRule(fb, 4, y, W - 8);
  y += 10;

  // Section 2: Focus — wrapped text
  drawLabel(fb, 4, y, 'focus');
  y += FONT_HEIGHT + 4;
  drawTextWrapped(fb, 4, y, 'Ship the renderer. Everything else can wait.', W - 8, 60);
  y += 60 + 16;

  drawRule(fb, 4, y, W - 8);
  y += 10;

  // Section 3: Streak — hero number
  drawLabel(fb, 4, y, 'streak');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '12');
  y += HERO_H + 2;
  drawText(fb, 4, y, 'days without', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'skipping a workout', W - 8);

  return fb;
}

// ============================================================
// Config C: Networking Card — name hero, QR right side, links below
// QR ~68px wide (128px total - padding)
// ============================================================
function renderNetworking(): FrameBuffer {
  const fb = createFrameBuffer();
  const qrSize = 80;

  // Name in hero — two lines, full width
  let y = 6;
  drawHeroText(fb, 4, y, 'BENTO');
  y += HERO_H + 2;
  drawHeroText(fb, 4, y, 'MCBOXFACE');
  y += HERO_H + 6;

  // Title — full width, below name
  drawText(fb, 4, y, 'Pixel Wrangler', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '@ InfoBento', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 6;

  // QR centered
  const qrCenterX = Math.floor((W - qrSize) / 2);
  drawFakeQR(fb, qrCenterX, y, qrSize);
  y += qrSize + 6;

  drawRule(fb, 4, y, W - 8);
  y += 6;

  // Links section — manually split to avoid mid-word wrap
  drawLabel(fb, 4, y, 'links');
  y += FONT_HEIGHT + 4;
  drawText(fb, 4, y, 'github.com/', W - 8);
  y += FONT_HEIGHT + 1;
  drawText(fb, 12, y, 'bentomcboxface', W - 16);
  y += FONT_HEIGHT + 3;
  drawText(fb, 4, y, 'linkedin.com/in/', W - 8);
  y += FONT_HEIGHT + 1;
  drawText(fb, 12, y, 'definitely-real', W - 16);

  return fb;
}

// ============================================================
// Config D: Kitchen — weather hero + agenda + groceries + doors
// 4 sections
// ============================================================
function renderKitchen(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Section 1: Weather hero
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '58F');
  drawText(fb, 4 + heroWidth('58F') + 4, y + 4, 'Rainy', W - 8);
  y += HERO_H + 2;
  drawText(fb, 4, y, 'Precip 80%  Wind 12', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 2: Agenda
  drawLabel(fb, 4, y, 'agenda');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '8:30 School dropoff', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '10:00 Dentist', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '3:15 Pickup', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '6:00 Pok Pok dinner', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 3: Groceries
  drawLabel(fb, 4, y, 'groceries');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Eggs Milk Sourdough', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Cilantro Limes', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 4: Doors
  drawLabel(fb, 4, y, 'doors');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Front: Locked', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Garage: Locked', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, 'Back: UNLOCKED', W - 8);

  return fb;
}

// ============================================================
// Config E: Minimal — big quote + days alive hero
// 2 sections, lots of whitespace
// ============================================================
function renderMinimal(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 16;

  // Big quote — generous whitespace
  drawTextWrapped(fb, 6, y, 'Simplicity is the ultimate sophistication.', W - 12, 80);
  y += 75;
  drawText(fb, 6, y, '-- da Vinci', W - 12);
  y += FONT_HEIGHT + 40;

  drawRule(fb, 4, y, W - 8);
  y += 16;

  // Days alive — hero number
  drawLabel(fb, 4, y, 'days alive');
  y += FONT_HEIGHT + 6;
  drawHeroText(fb, 4, y, '13,297');

  return fb;
}

// ============================================================
// Config F: Busy Parent — weather + next event + countdown + messages
// 4 sections with heroes
// ============================================================
function renderBusyParent(): FrameBuffer {
  const fb = createFrameBuffer();
  let y = 4;

  // Section 1: Weather hero
  drawLabel(fb, 4, y, 'weather');
  y += FONT_HEIGHT + 3;
  drawHeroText(fb, 4, y, '72F');
  drawText(fb, 4 + heroWidth('72F') + 4, y + 4, 'Sunny', W - 8);
  y += HERO_H + 2;
  drawText(fb, 4, y, 'UV: High', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 2: Next event — hero time
  drawLabel(fb, 4, y, 'next event');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '2:30');
  y += HERO_H + 2;
  drawText(fb, 4, y, 'Soccer practice', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 3: Countdown — hero number
  drawLabel(fb, 4, y, 'countdown');
  y += FONT_HEIGHT + 2;
  drawHeroText(fb, 4, y, '8');
  drawText(fb, 4 + heroWidth('8') + 4, y + 4, 'days to', W - 8);
  y += HERO_H + 2;
  drawText(fb, 4, y, 'Spring Break', W - 8);
  y += FONT_HEIGHT + 6;

  drawRule(fb, 4, y, W - 8);
  y += 5;

  // Section 4: Messages
  drawLabel(fb, 4, y, 'messages');
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '2 texts  5 email', W - 8);
  y += FONT_HEIGHT + 2;
  drawText(fb, 4, y, '0 slack', W - 8);

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
