/**
 * Generate a labeled side-view diagram of the InfoBento device in COUNTER (~100°) mode.
 * The device stands on a surface with the solar/MagSafe half as the base (foot),
 * and the eInk display angled back at ~100° from the base, facing the user.
 *
 * Output: previews/mode-counter.png (400x300 at scale=2)
 */

import { frameToPng } from '@infobento/renderer';
import type { FrameBuffer } from '@infobento/renderer';
import { setPixel, drawText, drawHLine } from '../packages/renderer/src/draw.js';
import { CHAR_ADVANCE, FONT_HEIGHT } from '../packages/renderer/src/font.js';
import { writeFileSync } from 'node:fs';

const W = 400;
const H = 300;
const SCALE = 2;

function createFb(): FrameBuffer {
  const byteWidth = Math.ceil(W / 8);
  return { width: W, height: H, data: new Uint8Array(byteWidth * H) };
}

// --- Drawing helpers not in the core draw module ---

/** Bresenham line from (x0,y0) to (x1,y1) */
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

/** Draw a thick line (draw the line at several offsets perpendicular to direction) */
function drawThickLine(
  fb: FrameBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): void {
  const half = Math.floor(thickness / 2);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;

  // Normal vector (perpendicular to line direction)
  const nx = -dy / len;
  const ny = dx / len;

  for (let i = -half; i <= half; i++) {
    drawLine(
      fb,
      Math.round(x0 + nx * i),
      Math.round(y0 + ny * i),
      Math.round(x1 + nx * i),
      Math.round(y1 + ny * i),
    );
  }
}

/** Draw a filled circle at (cx, cy) with given radius */
function drawFilledCircle(fb: FrameBuffer, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(fb, cx + dx, cy + dy);
      }
    }
  }
}

/** Draw an arrowhead at the tip (tx,ty) pointing toward that point from (fx,fy) */
function drawArrowhead(
  fb: FrameBuffer,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  size: number,
): void {
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular
  const px = -uy;
  const py = ux;

  const bx = tx - ux * size;
  const by = ty - uy * size;

  drawLine(fb, tx, ty, Math.round(bx + px * size * 0.4), Math.round(by + py * size * 0.4));
  drawLine(fb, tx, ty, Math.round(bx - px * size * 0.4), Math.round(by - py * size * 0.4));
}

/** Draw an arrow (line + arrowhead) from (x0,y0) to (x1,y1) */
function drawArrow(
  fb: FrameBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  headSize = 8,
): void {
  drawLine(fb, x0, y0, x1, y1);
  drawArrowhead(fb, x0, y0, x1, y1, headSize);
}

/** Center text at a given x position */
function drawTextCentered(fb: FrameBuffer, centerX: number, y: number, text: string): void {
  const textWidth = text.length * CHAR_ADVANCE;
  drawText(fb, Math.round(centerX - textWidth / 2), y, text);
}

// ============================================================
// Main rendering
// ============================================================

const fb = createFb();

// --- Coordinate system ---
// Side view: hinge at bottom-center. Solar base extends right along the surface.
// Display extends up-left, angled back ~100° from the base, facing the user.
//
// The ~100° interior angle between the two halves means:
//   - Solar base: ~20° above horizontal (faces upward toward light)
//   - Display: tilts back leftward at ~80° from horizontal (100° - 20° = 80°)

// Surface (table/counter) — horizontal line near the bottom
const surfaceY = 248;
drawHLine(fb, 15, surfaceY, W - 30);
drawHLine(fb, 15, surfaceY + 1, W - 30);

// Surface label
drawTextCentered(fb, W / 2, surfaceY + 10, 'TABLE / COUNTER SURFACE');

// --- Device geometry (hand-tuned for visual clarity) ---
// Hinge sits on the surface, center-left of the image.
// The two halves open upward like a tent/V shape.
const hingeX = 185;
const hingeY = 238;

// Solar panel (base): extends RIGHT from hinge, tilted ~15° up from horizontal.
// This makes the solar surface face UP toward light.
// In screen coords: goes right (positive x) and slightly up (negative y).
const solarLen = 120;
const solarEndX = Math.round(hingeX + solarLen * 0.966); // cos(15°)
const solarEndY = Math.round(hingeY - solarLen * 0.259); // sin(15°)

// eInk display: extends LEFT from hinge, angled steeply upward.
// Interior angle between the halves ≈ 100° (measured on the open/upper side).
// Solar dir from hinge = 15° above horizontal to the right.
// Display dir = 180° - 15° - (180° - 100°) = 180° - 15° - 80° = 85° above horizontal to the LEFT.
// → cos(180° - 85°) = cos(95°) = -0.087, sin(95°) = 0.996 ... that's almost vertical.
//
// Let me use a more readable angle: display at ~65° above horizontal to the left.
// Interior angle = 15° + (180° - 65°) = 15° + 115° ≈ 130° ... too wide.
//
// Actually for ~100°: display angle above horizontal to the left = 180° - (100° - 15°) = 95° from horizontal.
// That's 5° past vertical. So 100° really does make the display nearly vertical.
// For visual clarity, let's use the exact 100° geometry but shorten the display
// and add clear width to the panels to make them look like slabs.
const displayLen = 120;
// 100° interior angle: display direction in screen coords
// Solar screen angle: atan2(-sin15, cos15) = atan2(-0.259, 0.966)
// Display = solar angle - 100° (going CCW in screen coords = upward)
// screen angle of solar = -15° (slightly above horizontal right)
// display screen angle = -15° - 100° = -115°
// cos(-115°) = -0.4226, sin(-115°) = -0.9063 → goes LEFT and UP
const displayEndX = Math.round(hingeX + displayLen * -0.4226);
const displayEndY = Math.round(hingeY + displayLen * -0.9063);

// Draw the two halves with thickness (thick enough to look like a slab/panel)
const deviceThickness = 6;

// Solar panel half (base)
drawThickLine(fb, hingeX, hingeY, solarEndX, solarEndY, deviceThickness);

// eInk display half
drawThickLine(fb, hingeX, hingeY, displayEndX, displayEndY, deviceThickness);

// Hinge circle
drawFilledCircle(fb, hingeX, hingeY, 5);

// --- Add hatching/detail to distinguish the two halves ---

// Solar panel cross-hatching (short perpendicular marks along the panel)
{
  const dx = solarEndX - hingeX;
  const dy = solarEndY - hingeY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  for (let t = 15; t < solarLen - 10; t += 12) {
    const cx = Math.round(hingeX + ux * t);
    const cy = Math.round(hingeY + uy * t);
    drawLine(
      fb,
      Math.round(cx + nx * 5),
      Math.round(cy + ny * 5),
      Math.round(cx - nx * 5),
      Math.round(cy - ny * 5),
    );
  }
}

// Display screen rectangle (inner border on the display half)
{
  const dx = displayEndX - hingeX;
  const dy = displayEndY - hingeY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // Draw a rectangular outline inset from the display edges
  const startT = 15;
  const endT = displayLen - 10;
  const halfW = 6;

  const corners = [
    { x: hingeX + ux * startT + nx * halfW, y: hingeY + uy * startT + ny * halfW },
    { x: hingeX + ux * endT + nx * halfW, y: hingeY + uy * endT + ny * halfW },
    { x: hingeX + ux * endT - nx * halfW, y: hingeY + uy * endT - ny * halfW },
    { x: hingeX + ux * startT - nx * halfW, y: hingeY + uy * startT - ny * halfW },
  ];

  for (let i = 0; i < 4; i++) {
    const c1 = corners[i];
    const c2 = corners[(i + 1) % 4];
    if (!c1 || !c2) continue;
    drawLine(fb, Math.round(c1.x), Math.round(c1.y), Math.round(c2.x), Math.round(c2.y));
  }

  // Draw a few horizontal "text lines" inside the screen to suggest content
  for (let t = startT + 8; t < endT - 8; t += 10) {
    const lx1 = Math.round(hingeX + ux * t + nx * 3);
    const ly1 = Math.round(hingeY + uy * t + ny * 3);
    const lx2 = Math.round(hingeX + ux * t - nx * 3);
    const ly2 = Math.round(hingeY + uy * t - ny * 3);
    drawLine(fb, lx1, ly1, lx2, ly2);
  }
}

// --- Label: "eInk display" with arrow ---
{
  const midDisplayX = Math.round((hingeX + displayEndX) / 2);
  const midDisplayY = Math.round((hingeY + displayEndY) / 2);

  const labelX = 10;
  const labelY = 55;
  drawText(fb, labelX, labelY, 'eInk display');
  drawText(fb, labelX, labelY + FONT_HEIGHT + 2, '(faces user)');

  // Arrow from label to midpoint of display
  drawArrow(fb, labelX + 60, labelY + FONT_HEIGHT + 14, midDisplayX + 10, midDisplayY + 5, 8);
}

// --- Label: "Solar panel (face up)" with arrow ---
{
  const midSolarX = Math.round((hingeX + solarEndX) / 2);
  const midSolarY = Math.round((hingeY + solarEndY) / 2);

  const labelX = 280;
  const labelY = 175;
  drawText(fb, labelX, labelY, 'Solar panel');
  drawText(fb, labelX, labelY + FONT_HEIGHT + 2, '(face up)');

  // Arrow from label to solar panel midpoint
  drawArrow(fb, labelX - 4, labelY + 8, midSolarX + 10, midSolarY + 4, 8);
}

// --- Sun/light arrows from above pointing at solar panel ---
{
  const midSolarX = Math.round((hingeX + solarEndX) / 2);
  const sunCenterX = midSolarX;

  // Three downward arrows representing sunlight hitting the solar panel
  const midSolarY = Math.round((hingeY + solarEndY) / 2);
  for (let i = -1; i <= 1; i++) {
    const arrowX = sunCenterX + i * 30;
    drawArrow(fb, arrowX, midSolarY - 130, arrowX, midSolarY - 80, 7);
  }

  // Label above the arrows
  drawTextCentered(fb, sunCenterX, midSolarY - 148, 'SUNLIGHT');
}

// --- Hinge label ---
drawText(fb, hingeX - 48, hingeY - 2, 'hinge');
drawArrow(fb, hingeX - 18, hingeY + 1, hingeX - 8, hingeY + 1, 5);

// --- Angle arc indicator (~100°) ---
{
  const arcR = 30;
  // Direction angles in screen coords from hinge to each endpoint
  const solarScreenAngle = Math.atan2(solarEndY - hingeY, solarEndX - hingeX);
  const displayScreenAngle = Math.atan2(displayEndY - hingeY, displayEndX - hingeX);

  // We want the interior arc between the two halves
  const steps = 40;
  // Go from display angle to solar angle, choosing the short arc
  let startA = displayScreenAngle;
  let endA = solarScreenAngle;
  while (endA < startA) endA += 2 * Math.PI;
  if (endA - startA > Math.PI) {
    const tmp = startA;
    startA = endA - 2 * Math.PI;
    endA = tmp;
  }

  for (let i = 0; i <= steps; i++) {
    const t = startA + ((endA - startA) * i) / steps;
    const px = Math.round(hingeX + arcR * Math.cos(t));
    const py = Math.round(hingeY + arcR * Math.sin(t));
    setPixel(fb, px, py);
    setPixel(fb, px + 1, py);
    setPixel(fb, px, py + 1);
  }

  // Label the angle along the arc
  const midAngle = (startA + endA) / 2;
  const labelR = arcR + 14;
  const angleLabelX = Math.round(hingeX + labelR * Math.cos(midAngle));
  const angleLabelY = Math.round(hingeY + labelR * Math.sin(midAngle));
  drawText(fb, angleLabelX - 8, angleLabelY - 3, '~100');
}

// --- Title label at the top ---
drawTextCentered(fb, W / 2, 4, 'COUNTER (~100) -- Solar Charging');

// --- "User" indicator on the left side ---
{
  // Label with arrow pointing toward the display
  const userX = 15;
  const userY = 195;
  drawText(fb, userX, userY, 'USER');
  // Arrow pointing right toward the display
  drawArrow(
    fb,
    userX + 4 * CHAR_ADVANCE + 4,
    userY + 3,
    userX + 4 * CHAR_ADVANCE + 25,
    userY + 3,
    6,
  );
}

// ============================================================
// Output
// ============================================================

const png = frameToPng(fb, SCALE);
writeFileSync('previews/mode-counter.png', png);
console.log(`  previews/mode-counter.png (${png.length} bytes)`);
console.log('Done.');
