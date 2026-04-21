/**
 * Generate a labeled side-view diagram of the InfoBento device
 * in CLOSED (0 deg) mode, mounted on an iPhone via MagSafe.
 *
 * Output: previews/mode-closed.png (400x300 @ scale=2)
 * Run:    npx tsx scripts/generate-mode-closed.ts
 */

import { frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import {
  setPixel,
  drawRect,
  drawText,
  drawHLine,
  drawVLine,
  drawHeroText,
} from '../packages/renderer/src/draw.js';
import { CHAR_ADVANCE } from '../packages/renderer/src/font.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 400;
const H = 300;
const SCALE = 2;

// Create the 400x300 frame buffer
const byteWidth = Math.ceil(W / 8);
const fb: FrameBuffer = { width: W, height: H, data: new Uint8Array(byteWidth * H) };

// --- Helper: filled rectangle ---
function fillRect(fb: FrameBuffer, x: number, y: number, w: number, h: number): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      setPixel(fb, col, row);
    }
  }
}

// --- Helper: draw an arrow (horizontal, pointing right or left) ---
function drawArrowRight(fb: FrameBuffer, x: number, y: number, len: number): void {
  drawHLine(fb, x, y, len);
  const tipX = x + len - 1;
  for (let i = 1; i <= 3; i++) {
    setPixel(fb, tipX - i, y - i);
    setPixel(fb, tipX - i, y + i);
  }
}

function drawArrowLeft(fb: FrameBuffer, x: number, y: number, len: number): void {
  drawHLine(fb, x, y, len);
  for (let i = 1; i <= 3; i++) {
    setPixel(fb, x + i, y - i);
    setPixel(fb, x + i, y + i);
  }
}

// --- Helper: small magnet symbol (horseshoe U-shape) ---
function drawMagnet(fb: FrameBuffer, cx: number, cy: number): void {
  fillRect(fb, cx - 4, cy - 5, 3, 7);
  fillRect(fb, cx + 2, cy - 5, 3, 7);
  drawHLine(fb, cx - 4, cy + 2, 9);
  drawHLine(fb, cx - 3, cy + 3, 7);
}

// ===================== LAYOUT =====================
// Side view: looking at the phone from the side.
// Left = back of phone (InfoBento attached), Right = front of phone (screen).

// iPhone body
const phoneW = 20;
const phoneH = 190;
const phoneX = 210;
const phoneY = 35;

// Solar/MagSafe half (flush against phone back)
const solarW = 16;
const solarH = 120;
const solarX = phoneX - solarW;
const solarY = phoneY + (phoneH - solarH) / 2;

// eInk display half (outer, facing away from phone)
const einkW = 16;
const einkH = 120;
const einkX = solarX - einkW;
const einkY = solarY;

// Hinge at the bottom connecting the two halves
const hingeY = solarY + solarH;
const hingeX = einkX;
const hingeW = einkW + solarW;

// ===================== DRAWING =====================

// 1. Title (hero font)
drawHeroText(fb, 42, 8, 'CLOSED (0) - Phone Mounted');

// 2. iPhone body
drawRect(fb, phoneX, phoneY, phoneW, phoneH);
// Stipple fill
for (let row = phoneY + 1; row < phoneY + phoneH - 1; row++) {
  for (let col = phoneX + 1; col < phoneX + phoneW - 1; col++) {
    if ((row + col) % 3 === 0) setPixel(fb, col, row);
  }
}
// Screen edge on right (front face)
const screenMargin = 18;
drawRect(fb, phoneX + phoneW, phoneY + screenMargin, 4, phoneH - screenMargin * 2);

// 3. Solar/MagSafe half (touching phone back)
drawRect(fb, solarX, solarY, solarW, solarH);
// Diagonal hatching
for (let row = solarY + 1; row < solarY + solarH - 1; row++) {
  for (let col = solarX + 1; col < solarX + solarW - 1; col++) {
    if ((row - col) % 5 === 0) setPixel(fb, col, row);
  }
}
// Magnet symbols
drawMagnet(fb, solarX + solarW / 2, solarY + 25);
drawMagnet(fb, solarX + solarW / 2, solarY + solarH - 25);

// 4. eInk display half (outer face)
drawRect(fb, einkX, einkY, einkW, einkH);
// Dense left-edge fill to indicate active display surface
for (let row = einkY + 2; row < einkY + einkH - 2; row++) {
  setPixel(fb, einkX + 1, row);
  setPixel(fb, einkX + 2, row);
  setPixel(fb, einkX + 3, row);
}

// 5. Hinge at bottom
fillRect(fb, hingeX + 3, hingeY, hingeW - 6, 4);
// Rounded hinge shape
drawHLine(fb, hingeX + 1, hingeY + 4, hingeW - 2);
drawHLine(fb, hingeX + 2, hingeY + 5, hingeW - 4);
fillRect(fb, hingeX + hingeW / 2 - 3, hingeY + 1, 6, 6); // pivot pin

// "Hinge" label
drawText(fb, hingeX - 5, hingeY + 12, 'Hinge');

// ===================== LABEL ARROWS =====================

// "eInk display ->" pointing to the outer (left) face
const einkLabelY = einkY + 25;
const einkLabelText = 'eInk display';
drawText(fb, 8, einkLabelY - 3, einkLabelText);
const einkArrowStart = 8 + einkLabelText.length * CHAR_ADVANCE + 3;
drawArrowRight(fb, einkArrowStart, einkLabelY, einkX - einkArrowStart - 2);

// "Solar + MagSafe ->" pointing to the phone-touching face
const solarLabelY = einkY + solarH - 30;
const solarLabelText = 'Solar + MagSafe';
drawText(fb, 8, solarLabelY - 3, solarLabelText);
const solarArrowStart = 8 + solarLabelText.length * CHAR_ADVANCE + 3;
drawArrowRight(fb, solarArrowStart, solarLabelY, solarX + solarW / 2 - solarArrowStart);

// "iPhone" with arrow pointing left into the phone body
const phoneLabelX = phoneX + phoneW + 25;
const phoneLabelY = phoneY + 40;
drawText(fb, phoneLabelX, phoneLabelY - 3, 'iPhone');
drawArrowLeft(fb, phoneX + phoneW + 6, phoneLabelY, phoneLabelX - (phoneX + phoneW + 6) - 2);

// ===================== DIMENSION BRACKETS =====================

// Phone thickness bracket below phone
const dimY = phoneY + phoneH + 14;
drawHLine(fb, phoneX, dimY, phoneW);
drawVLine(fb, phoneX, dimY - 4, 8);
drawVLine(fb, phoneX + phoneW - 1, dimY - 4, 8);
drawText(fb, phoneX + 1, dimY + 6, '~8mm');

// InfoBento thickness bracket above device
const bentoTopY = einkY - 12;
drawHLine(fb, einkX, bentoTopY, einkW + solarW);
drawVLine(fb, einkX, bentoTopY, 6);
drawVLine(fb, einkX + einkW + solarW - 1, bentoTopY, 6);
drawText(fb, einkX - 12, bentoTopY - 11, 'InfoBento');

// ===================== ANNOTATIONS =====================

// Note at bottom-left
drawText(fb, 15, H - 35, 'Display visible on phone back');

// Side-view badge bottom-right
drawText(fb, W - 90, H - 12, '[ Side View ]');

// Legend bottom-right
drawText(fb, W - 155, H - 58, 'Cross-section legend:');
fillRect(fb, W - 155, H - 44, 8, 8);
drawText(fb, W - 143, H - 44, '= eInk face');
drawRect(fb, W - 155, H - 32, 8, 8);
// hatching in legend swatch
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    if ((r - c) % 5 === 0) setPixel(fb, W - 155 + c, H - 32 + r);
  }
}
drawText(fb, W - 143, H - 32, '= Solar/MagSafe');

// ===================== OUTPUT =====================

const pngData = frameToPng(fb, SCALE);
mkdirSync('previews', { recursive: true });
writeFileSync('previews/mode-closed.png', pngData);
console.log('Wrote previews/mode-closed.png (%d bytes, %dx%d @ %dx)', pngData.length, W, H, SCALE);
