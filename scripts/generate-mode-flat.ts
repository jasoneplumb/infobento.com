/**
 * Generate a labeled side-view diagram of the InfoBento device in FLAT (180°) mode.
 * Shows both halves lying flat and coplanar — storage / transport orientation.
 * Output: 400x300 1-bit frame buffer, saved as previews/mode-flat.png at 2x scale.
 */

import { frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import {
  drawHLine,
  drawVLine,
  drawRect,
  drawText,
  drawHeroText,
} from '../packages/renderer/src/draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../packages/renderer/src/font.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../packages/renderer/src/hero-font.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 400;
const H = 300;
const SCALE = 2;

/** Measure small-font text width */
function textWidth(text: string): number {
  return text.length * CHAR_ADVANCE;
}

/** Measure hero-font text width */
function heroWidth(text: string): number {
  return text.length * HERO_CHAR_ADVANCE;
}

/** Draw centered small text at a given y */
function _drawCenteredText(fb: FrameBuffer, y: number, text: string): void {
  const w = textWidth(text);
  const x = Math.floor((W - w) / 2);
  drawText(fb, x, y, text, W);
}

/** Draw centered hero text at a given y */
function drawCenteredHeroText(fb: FrameBuffer, y: number, text: string): void {
  const w = heroWidth(text);
  const x = Math.floor((W - w) / 2);
  drawHeroText(fb, x, y, text, W);
}

/** Draw a dashed horizontal line */
function drawDashedHLine(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  dash = 4,
  gap = 3,
): void {
  let cx = x;
  while (cx < x + width) {
    const segLen = Math.min(dash, x + width - cx);
    drawHLine(fb, cx, y, segLen);
    cx += dash + gap;
  }
}

/** Fill a rectangle solid (black pixels) */
function fillRect(fb: FrameBuffer, x: number, y: number, width: number, height: number): void {
  for (let row = 0; row < height; row++) {
    drawHLine(fb, x, y + row, width);
  }
}

// --- Main rendering ---

const byteWidth = Math.ceil(W / 8);
const fb: FrameBuffer = { width: W, height: H, data: new Uint8Array(byteWidth * H) };

// Layout constants for the side-view device
const deviceY = 140; // vertical center of the device cross-section
const deviceThick = 10; // thickness of each half (side view)
const leftHalfX = 50; // left edge of left half
const halfWidth = 130; // width of each half
const hingeWidth = 8; // hinge connector width
const rightHalfX = leftHalfX + halfWidth + hingeWidth;
const totalDeviceW = halfWidth * 2 + hingeWidth;

// Surface line (table)
const surfaceY = deviceY + deviceThick + 12;

// --- Title ---
drawCenteredHeroText(fb, 16, 'FLAT (180)');
const degreeLabel = '-- Storage / Transport';
const degreeLabelW = textWidth(degreeLabel);
drawText(fb, Math.floor((W - degreeLabelW) / 2), 16 + HERO_FONT_HEIGHT + 6, degreeLabel, W);

// --- Draw the device side view ---

// Left half (eInk display face up)
drawRect(fb, leftHalfX, deviceY, halfWidth, deviceThick);
// Add some interior shading lines to distinguish it
for (let i = 2; i < deviceThick - 2; i += 2) {
  drawDashedHLine(fb, leftHalfX + 3, deviceY + i, halfWidth - 6, 6, 4);
}

// Right half (solar panel face down)
drawRect(fb, rightHalfX, deviceY, halfWidth, deviceThick);
// Fill it more densely to visually distinguish from left half
for (let i = 1; i < deviceThick - 1; i++) {
  drawHLine(fb, rightHalfX + 1, deviceY + i, halfWidth - 2);
}

// Hinge in the middle — small filled circle-ish connector
const hingeCx = leftHalfX + halfWidth;
fillRect(fb, hingeCx, deviceY + 1, hingeWidth, deviceThick - 2);
// Top and bottom hinge lines
drawHLine(fb, hingeCx + 1, deviceY, hingeWidth - 2);
drawHLine(fb, hingeCx + 1, deviceY + deviceThick - 1, hingeWidth - 2);

// --- Surface / table line ---
drawHLine(fb, 20, surfaceY, W - 40);
// Small hash marks on surface for texture
for (let x = 30; x < W - 30; x += 20) {
  drawVLine(fb, x, surfaceY, 3);
}

// --- Labels with leader lines ---

// Left half label: "eInk display (face up)"
const leftLabel = 'eInk display';
const leftLabel2 = '(face up)';
const leftLabelX = leftHalfX + Math.floor((halfWidth - textWidth(leftLabel)) / 2);
const leftLabel2X = leftHalfX + Math.floor((halfWidth - textWidth(leftLabel2)) / 2);
const labelAboveY = deviceY - 36;
drawText(fb, leftLabelX, labelAboveY, leftLabel, W);
drawText(fb, leftLabel2X, labelAboveY + FONT_HEIGHT + 3, leftLabel2, W);
// Leader line from label down to device
const leftLeaderX = leftHalfX + Math.floor(halfWidth / 2);
drawVLine(
  fb,
  leftLeaderX,
  labelAboveY + FONT_HEIGHT * 2 + 6,
  deviceY - (labelAboveY + FONT_HEIGHT * 2 + 6) - 1,
);

// Right half label: "Solar panel (face down)"
const rightLabel = 'Solar panel';
const rightLabel2 = '(face down)';
const rightLabelX = rightHalfX + Math.floor((halfWidth - textWidth(rightLabel)) / 2);
const rightLabel2X = rightHalfX + Math.floor((halfWidth - textWidth(rightLabel2)) / 2);
drawText(fb, rightLabelX, labelAboveY, rightLabel, W);
drawText(fb, rightLabel2X, labelAboveY + FONT_HEIGHT + 3, rightLabel2, W);
// Leader line
const rightLeaderX = rightHalfX + Math.floor(halfWidth / 2);
drawVLine(
  fb,
  rightLeaderX,
  labelAboveY + FONT_HEIGHT * 2 + 6,
  deviceY - (labelAboveY + FONT_HEIGHT * 2 + 6) - 1,
);

// Hinge label
const hingeLabel = 'Hinge';
const hingeLabelX = hingeCx + Math.floor((hingeWidth - textWidth(hingeLabel)) / 2);
const hingeLabelY = deviceY + deviceThick + 4;
drawText(fb, hingeLabelX, hingeLabelY, hingeLabel, W);

// Surface label
const surfLabel = 'Surface';
drawText(fb, W - 20 - textWidth(surfLabel), surfaceY + 5, surfLabel, W);

// --- Coplanar annotation: horizontal dimension line above device ---
const dimY = deviceY - 4;
drawHLine(fb, leftHalfX, dimY, totalDeviceW);
// End caps
drawVLine(fb, leftHalfX, dimY - 2, 5);
drawVLine(fb, leftHalfX + totalDeviceW - 1, dimY - 2, 5);

// --- Bottom note ---
const note = 'Both halves coplanar. Not a useful operating mode.';
const noteW = textWidth(note);
drawText(fb, Math.floor((W - noteW) / 2), H - 30, note, W);

// --- Angle callout ---
const angleLabel = '180 flat';
const angleLabelW = textWidth(angleLabel);
drawText(fb, Math.floor((W - angleLabelW) / 2), surfaceY + 20, angleLabel, W);

// --- Write output ---
mkdirSync('previews', { recursive: true });
const png = frameToPng(fb, SCALE);
writeFileSync('previews/mode-flat.png', png);
console.log(`  previews/mode-flat.png (${png.length} bytes, ${W * SCALE}x${H * SCALE}px)`);
console.log('Done.');
