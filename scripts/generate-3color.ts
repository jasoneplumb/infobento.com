/**
 * Generate a 3-color (black/white/red) variant of the networking card.
 * Mimics how real 3-color eInk panels work: separate black and red frame buffers.
 */

import { createFrameBuffer } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import { setPixel, drawRect, drawText, drawHLine } from '../packages/renderer/src/draw.js';
import { FONT_DATA, FONT_WIDTH, FONT_HEIGHT } from '../packages/renderer/src/font.js';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SCALE = 4;
const W = 240;

// --- Hero font (2x scale) ---

const HERO_SCALE = 2;
const HERO_W = FONT_WIDTH * HERO_SCALE;
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

function drawHeroText(fb: FrameBuffer, x: number, y: number, text: string): void {
  let cx = x;
  for (const char of text) {
    if (cx + HERO_W > W) break;
    drawHeroChar(fb, cx, y, char);
    cx += HERO_ADVANCE;
  }
}

function drawRule(fb: FrameBuffer, x: number, y: number, width: number): void {
  drawHLine(fb, x, y, width);
}

function drawLabel(fb: FrameBuffer, x: number, y: number, text: string): void {
  drawText(fb, x, y, text.toUpperCase(), W - x);
}

function drawFakeQR(fb: FrameBuffer, x: number, y: number, size: number): void {
  drawRect(fb, x, y, size, size);
  const pad = 3;
  const finderSize = Math.min(12, Math.floor(size / 5));
  const inner = finderSize - 4;

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
// Render networking card into two layers: black and red
// ============================================================

function renderNetworking3Color(): { black: FrameBuffer; red: FrameBuffer } {
  const black = createFrameBuffer();
  const red = createFrameBuffer();

  const qrSize = 90;
  const qrX = W - qrSize - 6;

  // --- RED LAYER: name in hero, rule accents ---
  let y = 8;
  drawHeroText(red, 6, y, 'BENTO');
  y += HERO_H + 2;
  drawHeroText(red, 6, y, 'MCBOXFACE');

  // Red accent rule under name section
  const ruleY = 8 + qrSize + 4;
  drawRule(red, 4, ruleY, W - 8);

  // --- BLACK LAYER: title, QR, links ---
  y = 8 + HERO_H * 2 + 4 + 6;
  drawText(black, 6, y, 'Chief Pixel Wrangler', qrX - 10);
  y += FONT_HEIGHT + 2;
  drawText(black, 6, y, '@ InfoBento', qrX - 10);

  // QR on the right (black)
  drawFakeQR(black, qrX, 6, qrSize);

  // Links section (black)
  let linkY = ruleY + 6;
  drawLabel(black, 6, linkY, 'links');
  linkY += FONT_HEIGHT + 4;
  drawText(black, 6, linkY, 'github.com/bentomcboxface', W - 12);
  linkY += FONT_HEIGHT + 3;
  drawText(black, 6, linkY, 'linkedin.com/in/definitely-real', W - 12);

  return { black, red };
}

// ============================================================
// Composite two 1-bit layers into a 3-color PNG
// ============================================================

function composite3Color(black: FrameBuffer, red: FrameBuffer, scale: number): Uint8Array {
  const outW = black.width * scale;
  const outH = black.height * scale;
  const png = new PNG({ width: outW, height: outH, colorType: 2 }); // RGB

  const byteWidth = Math.ceil(black.width / 8);

  // eInk-accurate colors
  const BG_R = 0xf5,
    BG_G = 0xf0,
    BG_B = 0xeb; // warm off-white (eInk paper)
  const BK_R = 0x1a,
    BK_G = 0x1a,
    BK_B = 0x1a; // near-black
  const RD_R = 0xc8,
    RD_G = 0x28,
    RD_B = 0x28; // eInk red (slightly muted)

  for (let srcY = 0; srcY < black.height; srcY++) {
    for (let srcX = 0; srcX < black.width; srcX++) {
      const byteIndex = srcY * byteWidth + Math.floor(srcX / 8);
      const bitIndex = 7 - (srcX % 8);

      const bByte = black.data[byteIndex];
      const rByte = red.data[byteIndex];
      const isBlack = bByte != null && (bByte & (1 << bitIndex)) !== 0;
      const isRed = rByte != null && (rByte & (1 << bitIndex)) !== 0;

      let r: number, g: number, b: number;
      if (isRed) {
        r = RD_R;
        g = RD_G;
        b = RD_B;
      } else if (isBlack) {
        r = BK_R;
        g = BK_G;
        b = BK_B;
      } else {
        r = BG_R;
        g = BG_G;
        b = BG_B;
      }

      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const outX = srcX * scale + dx;
          const outY = srcY * scale + dy;
          const idx = (outY * outW + outX) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 0xff;
        }
      }
    }
  }

  return PNG.sync.write(png);
}

// ============================================================
// Generate
// ============================================================

const { black, red } = renderNetworking3Color();
const png = composite3Color(black, red, SCALE);
writeFileSync('previews/C-networking-3color.png', png);
console.log(`  previews/C-networking-3color.png (${png.length} bytes)`);
console.log('Done.');
