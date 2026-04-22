/**
 * Generate a contact sheet showing 4 side-view diagrams of the InfoBento
 * with dual displays (eInk on both sides of the display half).
 *
 * Surfaces: D=Display(outer), P=Display(inner), S=Solar, M=MagSafe
 * Layout: 2x2 grid, each cell 400x400, total 800x800
 *
 * Output: previews/dual-display-modes.png (800x800 @ scale=2)
 * Run:    npx tsx scripts/generate-dual-modes.ts
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
import { HERO_CHAR_ADVANCE } from '../packages/renderer/src/hero-font.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const W = 800;
const H = 800;
const CELL = 400;
const SCALE = 2;

// Create the 800x800 frame buffer
const byteWidth = Math.ceil(W / 8);
const fb: FrameBuffer = { width: W, height: H, data: new Uint8Array(byteWidth * H) };

// ===================== HELPERS =====================

function fillRect(x: number, y: number, w: number, h: number): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      setPixel(fb, col, row);
    }
  }
}

/** Bresenham line */
function drawLine(x0: number, y0: number, x1: number, y1: number): void {
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

/** Draw thick rectangle (border of given thickness) */
function drawThickRect(x: number, y: number, w: number, h: number, thickness: number): void {
  for (let t = 0; t < thickness; t++) {
    drawRect(fb, x + t, y + t, w - 2 * t, h - 2 * t);
  }
}

/** Fill with D pattern: solid black edge (3px thick border, inner lighter) */
function fillD(x: number, y: number, w: number, h: number): void {
  drawThickRect(x, y, w, h, 3);
  // Inner vertical lines to suggest display
  for (let row = y + 4; row < y + h - 4; row++) {
    setPixel(fb, x + 4, row);
    if (w > 12) setPixel(fb, x + w - 5, row);
  }
}

/** Fill with P pattern: dashed/striped (horizontal stripes) */
function fillP(x: number, y: number, w: number, h: number): void {
  drawThickRect(x, y, w, h, 2);
  // Horizontal stripes every 4px
  for (let row = y + 3; row < y + h - 2; row += 4) {
    for (let col = x + 3; col < x + w - 3; col++) {
      setPixel(fb, col, row);
    }
  }
}

/** Fill with S pattern: cross-hatched */
function fillS(x: number, y: number, w: number, h: number): void {
  drawThickRect(x, y, w, h, 2);
  for (let row = y + 2; row < y + h - 2; row++) {
    for (let col = x + 2; col < x + w - 2; col++) {
      if ((row + col) % 5 === 0 || (row - col + 200) % 5 === 0) {
        setPixel(fb, col, row);
      }
    }
  }
}

/** Fill with M pattern: dotted */
function fillM(x: number, y: number, w: number, h: number): void {
  drawThickRect(x, y, w, h, 2);
  for (let row = y + 3; row < y + h - 2; row += 3) {
    for (let col = x + 3; col < x + w - 2; col += 3) {
      setPixel(fb, col, row);
    }
  }
}

/** Draw a thick line (Bresenham with thickness) */
function drawThickLine(x0: number, y0: number, x1: number, y1: number, thickness: number): void {
  const half = Math.floor(thickness / 2);
  // Determine perpendicular direction
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const nx = -dy / len;
  const ny = dx / len;
  for (let t = -half; t <= half; t++) {
    drawLine(
      Math.round(x0 + nx * t),
      Math.round(y0 + ny * t),
      Math.round(x1 + nx * t),
      Math.round(y1 + ny * t),
    );
  }
}

/** Center hero text within a horizontal span */
function drawHeroTextCentered(x: number, y: number, w: number, text: string): void {
  const textW = text.length * HERO_CHAR_ADVANCE;
  const tx = x + Math.floor((w - textW) / 2);
  drawHeroText(fb, tx, y, text);
}

/** Draw hinge circle/arc at a point */
function drawHingeCircle(cx: number, cy: number, r: number): void {
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    const px = Math.round(cx + r * Math.cos(rad));
    const py = Math.round(cy + r * Math.sin(rad));
    setPixel(fb, px, py);
  }
  // Fill center
  fillRect(cx - 1, cy - 1, 3, 3);
}

/** Label a surface with a big letter */
function drawBigLabel(x: number, y: number, letter: string): void {
  drawHeroText(fb, x, y, letter);
}

// ===================== CELL BORDERS =====================

// Draw grid lines separating 4 cells
drawHLine(fb, 0, CELL, W); // horizontal divider
drawVLine(fb, CELL, 0, H); // vertical divider

// ===================== TOP-LEFT: CLOSED (0 deg) — Phone Mounted =====================
{
  const ox = 0;
  const oy = 0;

  drawHeroTextCentered(ox, oy + 8, CELL, 'CLOSED - D visible');

  // iPhone body (right side)
  const phoneW = 18;
  const phoneH = 180;
  const phoneX = ox + 270;
  const phoneY = oy + 70;
  drawRect(fb, phoneX, phoneY, phoneW, phoneH);
  // Stipple fill for phone
  for (let row = phoneY + 1; row < phoneY + phoneH - 1; row++) {
    for (let col = phoneX + 1; col < phoneX + phoneW - 1; col++) {
      if ((row + col) % 4 === 0) setPixel(fb, col, row);
    }
  }
  drawText(fb, phoneX + 22, phoneY + phoneH / 2 - 3, 'iPhone');

  // Device closed flat against phone
  // M-side touching phone (right/inner face of solar half)
  // S-side is outer face of solar half
  // D-side is outer face of display half (leftmost)
  // P-side is inner face of display half (between D and S)

  const halfThick = 10; // thickness of each half in side view
  const deviceH = 140;
  const deviceX = phoneX - halfThick * 2; // two halves side by side
  const deviceY = phoneY + (phoneH - deviceH) / 2;

  // M-side (touching phone) — rightmost surface of device
  fillM(deviceX + halfThick, deviceY, halfThick, deviceH);
  // S-side (outer face of solar half, facing left) — left face of solar half
  // P and S are hidden between halves — shown as thin gap
  // D-side (outermost face, facing away from phone)
  fillD(deviceX, deviceY, halfThick, deviceH);

  // Label D prominently on outer face
  drawBigLabel(deviceX - 18, deviceY + deviceH / 2 - 8, 'D');

  // Thin line for P and S hidden between halves
  drawVLine(fb, deviceX + halfThick, deviceY, deviceH);
  // Label P S between halves
  drawText(fb, deviceX + halfThick - 20, deviceY + deviceH + 8, 'P S');
  drawText(fb, deviceX + halfThick - 30, deviceY + deviceH + 20, '(hidden)');

  // Label M facing phone
  drawText(fb, deviceX + halfThick + 3, deviceY - 14, 'M');

  // Hinge at bottom
  const hingeY2 = deviceY + deviceH;
  drawHingeCircle(deviceX + halfThick, hingeY2 + 4, 4);
  drawText(fb, deviceX + halfThick - 14, hingeY2 + 14, 'hinge');

  // Arrow from D label
  drawHLine(fb, deviceX - 12, deviceY + deviceH / 2, 10);
}

// ===================== TOP-RIGHT: PEEK (90 deg) — Quick Glance =====================
{
  const ox = CELL;
  const oy = 0;

  drawHeroTextCentered(ox, oy + 8, CELL, 'PEEK 90 - P visible');

  // Solar half lies horizontal (M-side down on surface)
  const halfThick = 12;
  const halfLen = 130;

  const baseY = oy + 270; // surface line
  const hingeX = ox + 150;
  const hingeY = baseY - halfThick;

  // Surface line
  drawHLine(fb, ox + 20, baseY + 2, CELL - 40);
  drawText(fb, ox + CELL - 70, baseY + 6, 'surface');

  // Solar half — horizontal, M down, S up
  fillM(hingeX, baseY - halfThick, halfLen, halfThick);
  // S on top
  drawHLine(fb, hingeX, baseY - halfThick - 1, halfLen);
  // Labels
  drawText(fb, hingeX + halfLen / 2 - 6, baseY - halfThick - 14, 'S');
  drawText(fb, hingeX + halfLen / 2 - 6, baseY + 6, 'M');

  // Display half — vertical (opened 90 degrees up from hinge)
  // P-side faces left (toward user), D-side faces right
  const displayH = halfLen;
  const displayTop = hingeY - displayH;

  fillP(hingeX - halfThick, displayTop, halfThick, displayH);
  fillD(hingeX, displayTop, halfThick, displayH);

  // Label P prominently (facing user = left side)
  drawBigLabel(hingeX - halfThick - 20, displayTop + displayH / 2 - 8, 'P');
  // Label D on back
  drawText(fb, hingeX + halfThick + 4, displayTop + displayH / 2 - 3, 'D');

  // Hinge
  drawHingeCircle(hingeX, hingeY, 5);
  drawText(fb, hingeX - 28, hingeY + 10, 'hinge');

  // User direction arrow
  drawText(fb, ox + 30, displayTop + displayH / 2 - 3, 'User ->');
}

// ===================== BOTTOM-LEFT: COUNTER (~100 deg) =====================
{
  const ox = 0;
  const oy = CELL;

  drawHeroTextCentered(ox, oy + 8, CELL, 'COUNTER - P visible');

  // V-shape tent, hinge at bottom
  const hingeX = ox + 200;
  const hingeY = oy + 310;
  const halfLen = 120;
  const halfThick = 12;

  // Surface line
  drawHLine(fb, ox + 20, hingeY + 8, CELL - 40);
  drawText(fb, ox + CELL - 70, hingeY + 12, 'surface');

  // Solar half: angled slightly from hinge toward bottom-right
  // M-side as base touching surface, S-side faces up
  const solarAngle = (10 * Math.PI) / 180; // ~10 degrees from horizontal
  const solarEndX = hingeX + Math.round(halfLen * Math.cos(solarAngle));
  const solarEndY = hingeY - Math.round(halfLen * Math.sin(solarAngle));

  // Solar half — draw as thick angled rectangle
  // Bottom edge (M-side, touching surface)
  const sNx = Math.round(-Math.sin(solarAngle) * halfThick);
  const sNy = Math.round(-Math.cos(solarAngle) * halfThick);

  // Four corners of solar half
  const s0x = hingeX;
  const s0y = hingeY;
  const s1x = solarEndX;
  const s1y = solarEndY;
  const s2x = solarEndX + sNx;
  const s2y = solarEndY - sNy;
  const s3x = hingeX + sNx;
  const s3y = hingeY - sNy;

  // Fill solar half with cross-hatch (S on top)
  for (let row = Math.min(s0y, s2y) - 2; row <= Math.max(s0y, s2y) + 2; row++) {
    for (let col = Math.min(s0x, s1x) - 2; col <= Math.max(s1x, s3x) + 2; col++) {
      // Point-in-quad test (simplified: use parametric bounds)
      const dx = col - s0x;
      const dy = row - s0y;
      const along = dx * Math.cos(solarAngle) - dy * Math.sin(solarAngle);
      const across = dx * Math.sin(solarAngle) + dy * Math.cos(solarAngle);
      if (along >= 0 && along <= halfLen && across >= -halfThick && across <= 0) {
        if ((row + col) % 5 === 0 || (row - col + 200) % 5 === 0) {
          setPixel(fb, col, row);
        }
      }
    }
  }
  // Outline
  drawLine(s0x, s0y, s1x, s1y);
  drawLine(s1x, s1y, s2x, s2y);
  drawLine(s2x, s2y, s3x, s3y);
  drawLine(s3x, s3y, s0x, s0y);

  // Labels for solar half
  drawText(fb, solarEndX - 30, solarEndY - halfThick - 16, 'S');
  drawText(fb, solarEndX - 10, solarEndY + 8, 'M');

  // Display half: angled back from hinge (leaning back ~100 degrees from solar half)
  // P-side faces user (left/front), D-side faces away/up
  const displayAngle = (70 * Math.PI) / 180; // 70 degrees from horizontal (leaning back)
  const dispEndX = hingeX - Math.round(halfLen * Math.cos(displayAngle));
  const dispEndY = hingeY - Math.round(halfLen * Math.sin(displayAngle));

  const dNx = Math.round(Math.sin(displayAngle) * halfThick);
  const dNy = Math.round(-Math.cos(displayAngle) * halfThick);

  // Four corners of display half
  const d0x = hingeX;
  const d0y = hingeY;
  const d1x = dispEndX;
  const d1y = dispEndY;
  const d2x = dispEndX + dNx;
  const d2y = dispEndY + dNy;
  const d3x = hingeX + dNx;
  const d3y = hingeY + dNy;

  // Fill display half — P side (facing user, left face)
  for (let row = Math.min(d1y, d0y, d2y, d3y) - 2; row <= Math.max(d1y, d0y, d2y, d3y) + 2; row++) {
    for (
      let col = Math.min(d1x, d0x, d2x, d3x) - 2;
      col <= Math.max(d1x, d0x, d2x, d3x) + 2;
      col++
    ) {
      const dx = col - d0x;
      const dy = row - d0y;
      const along = -(dx * Math.cos(displayAngle) + dy * Math.sin(displayAngle));
      const across = dx * Math.sin(displayAngle) - dy * Math.cos(displayAngle);
      if (along >= 0 && along <= halfLen && across >= 0 && across <= halfThick) {
        // P side: stripes (left portion)
        if (across < halfThick / 2) {
          if (Math.round(along) % 4 === 0) setPixel(fb, col, row);
        } else {
          // D side: solid dots
          if (Math.round(along) % 2 === 0 && Math.round(across) % 2 === 0) {
            setPixel(fb, col, row);
          }
        }
      }
    }
  }
  // Outline
  drawThickLine(d0x, d0y, d1x, d1y, 2);
  drawThickLine(d1x, d1y, d2x, d2y, 2);
  drawThickLine(d2x, d2y, d3x, d3y, 2);
  drawThickLine(d3x, d3y, d0x, d0y, 2);

  // Labels for display half
  drawBigLabel(d1x - 25, d1y + 5, 'P');
  drawText(fb, d2x + 5, d2y - 5, 'D');

  // Hinge
  drawHingeCircle(hingeX, hingeY, 5);
  drawText(fb, hingeX - 14, hingeY + 14, 'hinge');

  // Sun arrows pointing at S
  const sunX = solarEndX - 20;
  const sunY = solarEndY - halfThick - 50;
  drawText(fb, sunX - 10, sunY - 14, 'light');
  for (let i = 0; i < 3; i++) {
    const ax = sunX + i * 18;
    drawLine(ax, sunY, ax, sunY + 25);
    // Arrowhead
    setPixel(fb, ax - 1, sunY + 23);
    setPixel(fb, ax + 1, sunY + 23);
    setPixel(fb, ax - 2, sunY + 21);
    setPixel(fb, ax + 2, sunY + 21);
  }

  // User direction
  drawText(fb, ox + 20, d1y + 20, 'User ->');
}

// ===================== BOTTOM-RIGHT: FLAT ON DESK =====================
{
  const ox = CELL;
  const oy = CELL;

  drawHeroTextCentered(ox, oy + 8, CELL, 'DESK - D visible');

  // Device lying flat, closed, on a desk surface
  const surfaceY = oy + 260;
  drawHLine(fb, ox + 30, surfaceY, CELL - 60);
  drawText(fb, ox + CELL - 70, surfaceY + 6, 'desk');

  // Device cross-section: two halves stacked, very thin in side view
  const deviceW = 180;
  const halfThick = 12;
  const deviceX = ox + (CELL - deviceW) / 2;

  // M-side (bottom, touching desk)
  const mY = surfaceY - halfThick;
  fillM(deviceX, mY, deviceW, halfThick);
  drawText(fb, deviceX + deviceW / 2 - 6, surfaceY + 6, 'M');

  // S-side (above M, inner face of solar half)
  // P-side (below D, inner face of display half)
  // These are hidden — draw as thin gap
  const gapY = mY - 2;
  drawHLine(fb, deviceX, gapY, deviceW);
  drawText(fb, deviceX + deviceW / 2 - 12, gapY - 12, 'S  P');
  drawText(fb, deviceX + deviceW / 2 - 20, gapY - 24, '(hidden)');

  // D-side (top, facing up — readable)
  const dY = gapY - halfThick - 2;
  fillD(deviceX, dY, deviceW, halfThick);

  // Label D prominently above
  drawBigLabel(deviceX + deviceW / 2 - 4, dY - 30, 'D');

  // Arrow pointing down to D surface
  const arrowX = deviceX + deviceW / 2;
  drawLine(arrowX, dY - 14, arrowX, dY - 3);
  setPixel(fb, arrowX - 1, dY - 5);
  setPixel(fb, arrowX + 1, dY - 5);
  setPixel(fb, arrowX - 2, dY - 7);
  setPixel(fb, arrowX + 2, dY - 7);

  // Eye/reader above
  drawText(fb, arrowX - 25, dY - 55, 'readable');
  drawText(fb, arrowX - 30, dY - 42, 'like a card');

  // Side profile labels
  drawText(fb, deviceX - 50, dY + 3, 'D ->');
  drawText(fb, deviceX - 50, mY + 3, 'M ->');
}

// ===================== CENTER LEGEND =====================
{
  // Place legend at the intersection of the 4 cells
  const legX = CELL - 95;
  const legY = CELL - 48;
  const legW = 190;
  const legH = 96;

  // White out legend background
  for (let row = legY; row < legY + legH; row++) {
    for (let col = legX; col < legX + legW; col++) {
      setPixel(fb, col, row, false);
    }
  }
  // Border
  drawRect(fb, legX, legY, legW, legH);
  drawRect(fb, legX + 1, legY + 1, legW - 2, legH - 2);

  drawText(fb, legX + 8, legY + 6, '--- LEGEND ---');

  // D swatch
  const swY = legY + 20;
  const swSz = 12;
  const swX = legX + 10;
  fillD(swX, swY, swSz, swSz);
  drawText(fb, swX + swSz + 4, swY + 3, 'D = Display (outer)');

  // P swatch
  fillP(swX, swY + 18, swSz, swSz);
  drawText(fb, swX + swSz + 4, swY + 21, 'P = Display (inner)');

  // S swatch
  fillS(swX, swY + 36, swSz, swSz);
  drawText(fb, swX + swSz + 4, swY + 39, 'S = Solar');

  // M swatch
  fillM(swX, swY + 54, swSz, swSz);
  drawText(fb, swX + swSz + 4, swY + 57, 'M = MagSafe');
}

// ===================== OUTPUT =====================

const pngData = frameToPng(fb, SCALE);
mkdirSync('previews', { recursive: true });
writeFileSync('previews/dual-display-modes.png', pngData);
console.log(
  'Wrote previews/dual-display-modes.png (%d bytes, %dx%d @ %dx)',
  pngData.length,
  W,
  H,
  SCALE,
);
