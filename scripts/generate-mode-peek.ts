/**
 * Generate a labeled side-view diagram of the InfoBento device in PEEK (90°) mode.
 * Shows the L-shaped profile: solar half lying flat, eInk display opened to 90°.
 * Output: previews/mode-peek.png (400x300 @ scale=2)
 */

import { frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import { setPixel, drawText, drawHLine, drawHeroText } from '../packages/renderer/src/draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../packages/renderer/src/font.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 400;
const H = 300;
const SCALE = 2;

/** Create a 400x300 1-bit frame buffer */
function createFB(): FrameBuffer {
  const byteWidth = Math.ceil(W / 8); // 50
  return {
    width: W,
    height: H,
    data: new Uint8Array(byteWidth * H),
  };
}

/** Draw a line between two arbitrary points (Bresenham's algorithm) */
function drawLine(fb: FrameBuffer, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;

  for (;;) {
    setPixel(fb, cx, cy);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

/** Draw a thick line (multiple parallel lines offset perpendicular) */
function drawThickLine(
  fb: FrameBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  // Perpendicular unit vector
  const px = -dy / len;
  const py = dx / len;

  const half = (thickness - 1) / 2;
  for (let i = -Math.floor(half); i <= Math.ceil(half); i++) {
    drawLine(
      fb,
      Math.round(x0 + px * i),
      Math.round(y0 + py * i),
      Math.round(x1 + px * i),
      Math.round(y1 + py * i),
    );
  }
}

/** Draw a filled rectangle */
function fillRect(fb: FrameBuffer, x: number, y: number, w: number, h: number): void {
  for (let row = 0; row < h; row++) {
    drawHLine(fb, x, y + row, w);
  }
}

/** Draw a filled circle (used for hinge and eye) */
function fillCircle(fb: FrameBuffer, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(fb, cx + dx, cy + dy);
      }
    }
  }
}

/** Draw a circle outline */
function drawCircle(fb: FrameBuffer, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const distSq = dx * dx + dy * dy;
      if (distSq >= (r - 1) * (r - 1) && distSq <= r * r) {
        setPixel(fb, cx + dx, cy + dy);
      }
    }
  }
}

/** Draw an arrowhead pointing in a direction */
function drawArrowhead(
  fb: FrameBuffer,
  tipX: number,
  tipY: number,
  dx: number,
  dy: number,
  size: number,
): void {
  // dx, dy is the direction the arrow points toward
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular
  const px = -uy;
  const py = ux;

  const baseX = tipX - Math.round(ux * size);
  const baseY = tipY - Math.round(uy * size);

  const halfW = Math.round(size * 0.5);
  drawLine(fb, tipX, tipY, baseX + Math.round(px * halfW), baseY + Math.round(py * halfW));
  drawLine(fb, tipX, tipY, baseX - Math.round(px * halfW), baseY - Math.round(py * halfW));
}

/** Measure text width in small font */
function textWidth(text: string): number {
  return text.length * CHAR_ADVANCE;
}

// ============================================================
// Main diagram
// ============================================================

const fb = createFB();

// --- Device geometry ---
// The L-shape: horizontal solar half on bottom, vertical eInk display on the left
// Side view, so the device is shown as thick rectangles (showing ~8px thickness)

const DEVICE_THICKNESS = 8;

// Hinge position (where the two halves meet)
const hingeX = 100;
const hingeY = 195;

// Solar/MagSafe half: horizontal, extending to the right from the hinge
const solarX = hingeX;
const solarY = hingeY;
const solarLen = 140; // length of solar half

// eInk display half: vertical, extending upward from the hinge
const displayX = hingeX - DEVICE_THICKNESS; // left edge of vertical display
const displayY = hingeY - 130; // top of display
const displayLen = 130; // length of display half

// --- Draw surface line ---
const surfaceY = solarY + DEVICE_THICKNESS + 3;
// Dashed surface line
for (let x = 30; x < 340; x += 8) {
  drawHLine(fb, x, surfaceY, 4);
}
drawText(fb, 300, surfaceY - FONT_HEIGHT - 2, 'surface', W - 300);

// --- Draw Solar/MagSafe half (horizontal, lying flat) ---
fillRect(fb, solarX, solarY, solarLen, DEVICE_THICKNESS);
// Add some internal detail — solar cell lines
for (let i = 15; i < solarLen - 5; i += 20) {
  // Clear a thin line to show solar cell segments
  for (let row = 2; row < DEVICE_THICKNESS - 2; row++) {
    setPixel(fb, solarX + i, solarY + row, false);
  }
}

// --- Draw eInk display half (vertical, perpendicular) ---
fillRect(fb, displayX, displayY, DEVICE_THICKNESS, displayLen);
// Add screen area indicator (slightly inset)
for (let row = 8; row < displayLen - 8; row++) {
  setPixel(fb, displayX + 2, displayY + row, false);
  setPixel(fb, displayX + DEVICE_THICKNESS - 3, displayY + row, false);
}
// Top and bottom screen boundary
for (let col = 2; col < DEVICE_THICKNESS - 2; col++) {
  setPixel(fb, displayX + col, displayY + 8, false);
  setPixel(fb, displayX + col, displayY + displayLen - 9, false);
}

// --- Draw hinge ---
fillCircle(fb, hingeX, hingeY, 5);
// Clear inner circle for hinge detail
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy <= 3) {
      setPixel(fb, hingeX + dx, hingeY + dy, false);
    }
  }
}
// Restore center dot
setPixel(fb, hingeX, hingeY);

// --- 90-degree angle indicator ---
// Draw a small arc in the corner between the two halves
const arcR = 18;
const arcCx = hingeX;
const arcCy = hingeY;

// Draw quarter-circle arc from pointing-up to pointing-right
for (let angle = 0; angle <= 90; angle++) {
  const rad = (angle * Math.PI) / 180;
  // 0 deg = pointing right, 90 = pointing down
  // We want from pointing up (-90deg) to pointing right (0deg)
  const adjustedRad = rad - Math.PI / 2;
  const px = Math.round(arcCx + arcR * Math.cos(adjustedRad));
  const py = Math.round(arcCy + arcR * Math.sin(adjustedRad));
  setPixel(fb, px, py);
}
// "90" label near the arc
drawText(fb, hingeX + 8, hingeY - arcR + 2, '90', 30);
// Degree symbol — small circle
drawCircle(fb, hingeX + 8 + textWidth('90') + 2, hingeY - arcR + 2, 2);

// --- Eye icon to the right of the display (viewing direction) ---
// Position the eye to the right of the vertical display, roughly mid-height
const eyeCx = displayX + DEVICE_THICKNESS + 35;
const eyeCy = displayY + displayLen / 2 - 10;

// Draw a simple eye shape: almond outline
// Top arc
for (let i = -10; i <= 10; i++) {
  const curve = Math.round(4 * Math.cos((i * Math.PI) / 20));
  setPixel(fb, eyeCx + i, eyeCy - curve);
}
// Bottom arc
for (let i = -10; i <= 10; i++) {
  const curve = Math.round(4 * Math.cos((i * Math.PI) / 20));
  setPixel(fb, eyeCx + i, eyeCy + curve);
}
// Pupil
fillCircle(fb, eyeCx, eyeCy, 3);
// Clear center for iris highlight
setPixel(fb, eyeCx - 1, eyeCy - 1, false);

// Arrow from eye toward display
drawThickLine(fb, eyeCx - 14, eyeCy, displayX + DEVICE_THICKNESS + 4, eyeCy, 1);
drawArrowhead(fb, displayX + DEVICE_THICKNESS + 4, eyeCy, -1, 0, 5);

// --- Label: title ---
drawHeroText(fb, 110, 18, 'PEEK (90)');
drawText(fb, 110, 38, '-- Quick Glance', W - 110);

// --- Label arrows: "eInk display" on the vertical half ---
const eLabelX = 10;
const eLabelY = displayY + displayLen / 2 - 25;
drawText(fb, eLabelX, eLabelY, 'eInk', 80);
drawText(fb, eLabelX, eLabelY + FONT_HEIGHT + 2, 'display', 80);
// Arrow from label to the display
const arrowStartX = eLabelX + textWidth('display') + 2;
const arrowEndX = displayX - 2;
const arrowY = eLabelY + FONT_HEIGHT;
drawLine(fb, arrowStartX, arrowY, arrowEndX, arrowY);
drawArrowhead(fb, arrowEndX, arrowY, 1, 0, 4);

// --- Label arrows: "Solar + MagSafe" on the horizontal half ---
const sLabelText1 = 'Solar + MagSafe';
const sLabelX = solarX + 20;
const sLabelY = solarY + DEVICE_THICKNESS + 16;
drawText(fb, sLabelX, sLabelY, sLabelText1, W - sLabelX);
// Arrow from label up to the solar half
const sArrowX = sLabelX + textWidth(sLabelText1) / 2;
drawLine(fb, sArrowX, sLabelY - 2, sArrowX, solarY + DEVICE_THICKNESS + 3);
drawArrowhead(fb, sArrowX, solarY + DEVICE_THICKNESS + 3, 0, -1, 4);

// --- Label: mode description at bottom ---
drawText(fb, 80, H - 35, 'Solar half lies flat on phone or surface.', W - 90);
drawText(fb, 80, H - 23, 'Display pops up for a quick glance.', W - 90);

// --- Output ---
mkdirSync('previews', { recursive: true });
const png = frameToPng(fb, SCALE);
writeFileSync('previews/mode-peek.png', png);
console.log(`  previews/mode-peek.png (${png.length} bytes)`);
console.log('Done.');
