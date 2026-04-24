/**
 * Intent: Render a moon phase bento box — phase name, illumination %, phase bitmap
 * Context: Called by the main render() dispatcher for boxes with type 'moon'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Computed from reference epoch, no API call required
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, MoonBoxConfig } from '@infobento/core';
import { drawText, drawHLine, drawIcon, setPixel, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/** Whitespace padding */
const PAD = 16;

/**
 * Reference epoch: 2000-01-06T18:14Z was a known new moon.
 * Synodic period: 29.53059 days
 */
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0); // 2000-01-06T18:14Z
const SYNODIC_PERIOD_DAYS = 29.53059;

/**
 * intent: Calculate the current lunar phase (0.0 to 1.0) from a given date
 * method: Compute elapsed days since reference new moon epoch, modulo synodic period
 * returns: phase fraction 0.0 = new moon, 0.5 = full moon
 */
export function moonPhase(now: Date = new Date()): number {
  const elapsedMs = now.getTime() - NEW_MOON_EPOCH_MS;
  const elapsedDays = elapsedMs / 86400000;
  const cyclePos =
    ((elapsedDays % SYNODIC_PERIOD_DAYS) + SYNODIC_PERIOD_DAYS) % SYNODIC_PERIOD_DAYS;
  return cyclePos / SYNODIC_PERIOD_DAYS;
}

/**
 * intent: Map a phase fraction to a phase index (0-7) and name
 * method: Divide the 8-phase cycle into equal eighths
 */
export function moonPhaseName(phase: number): {
  index: number;
  name: string;
  illumination: number;
} {
  // 8 phases of 0.125 each
  const idx = Math.floor((phase * 8 + 0.5) % 8);
  const names = [
    'New Moon',
    'Waxing Crescent',
    'First Quarter',
    'Waxing Gibbous',
    'Full Moon',
    'Waning Gibbous',
    'Last Quarter',
    'Waning Crescent',
  ];
  const name = names[idx] ?? 'New Moon';

  // Illumination: 0% at new moon (phase=0), 100% at full moon (phase=0.5)
  // Use cosine model: illum = (1 - cos(phase * 2π)) / 2
  const illumination = Math.round(((1 - Math.cos(phase * 2 * Math.PI)) / 2) * 100);

  return { index: idx, name, illumination };
}

/**
 * 20x20 pixel bitmaps for 8 lunar phases.
 * Stored as arrays of 20 rows; each row is 20 bits packed into a 32-bit number.
 * Bit 19 = leftmost pixel.
 *
 * Phases: 0=New, 1=WaxCrescent, 2=FirstQ, 3=WaxGibbous, 4=Full, 5=WanGibbous, 6=LastQ, 7=WanCrescent
 */
const MOON_BITMAPS: readonly (readonly number[])[] = [
  // 0: New Moon — circle outline only
  [
    0b00000111111100000000, 0b00011000000011000000, 0b00100000000000100000, 0b01000000000000010000,
    0b01000000000000010000, 0b10000000000000001000, 0b10000000000000001000, 0b10000000000000001000,
    0b10000000000000001000, 0b10000000000000001000, 0b10000000000000001000, 0b10000000000000001000,
    0b10000000000000001000, 0b01000000000000010000, 0b01000000000000010000, 0b00100000000000100000,
    0b00011000000011000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 1: Waxing Crescent — left quarter filled on right side
  [
    0b00000111111100000000, 0b00011000000011000000, 0b00100000000100100000, 0b01000000001110010000,
    0b01000000001110010000, 0b10000000011111001000, 0b10000000011111001000, 0b10000000011111001000,
    0b10000000011111001000, 0b10000000011111001000, 0b10000000011111001000, 0b10000000011111001000,
    0b10000000011111001000, 0b01000000001110010000, 0b01000000001110010000, 0b00100000000100100000,
    0b00011000000011000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 2: First Quarter — right half filled
  [
    0b00000111111100000000, 0b00011000000011000000, 0b00100000000100100000, 0b01000000001111110000,
    0b01000000001111110000, 0b10000000011111111000, 0b10000000011111111000, 0b10000000011111111000,
    0b10000000011111111000, 0b10000000011111111000, 0b10000000011111111000, 0b10000000011111111000,
    0b10000000011111111000, 0b01000000001111110000, 0b01000000001111110000, 0b00100000000100100000,
    0b00011000000011000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 3: Waxing Gibbous — mostly filled, small dark left crescent
  [
    0b00000111111100000000, 0b00011111111111000000, 0b00111111111111100000, 0b01111100111111110000,
    0b01111100111111110000, 0b11111001111111111000, 0b11111001111111111000, 0b11111001111111111000,
    0b11111001111111111000, 0b11111001111111111000, 0b11111001111111111000, 0b11111001111111111000,
    0b11111001111111111000, 0b01111100111111110000, 0b01111100111111110000, 0b00111111111111100000,
    0b00011111111111000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 4: Full Moon — all filled
  [
    0b00000111111100000000, 0b00011111111111000000, 0b00111111111111100000, 0b01111111111111110000,
    0b01111111111111110000, 0b11111111111111111000, 0b11111111111111111000, 0b11111111111111111000,
    0b11111111111111111000, 0b11111111111111111000, 0b11111111111111111000, 0b11111111111111111000,
    0b11111111111111111000, 0b01111111111111110000, 0b01111111111111110000, 0b00111111111111100000,
    0b00011111111111000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 5: Waning Gibbous — mostly filled, small dark right crescent
  [
    0b00000111111100000000, 0b00011111111111000000, 0b00111111111111100000, 0b01111111110011110000,
    0b01111111110011110000, 0b11111111110010011000, 0b11111111110010011000, 0b11111111110010011000,
    0b11111111110010011000, 0b11111111110010011000, 0b11111111110010011000, 0b11111111110010011000,
    0b11111111110010011000, 0b01111111110011110000, 0b01111111110011110000, 0b00111111111111100000,
    0b00011111111111000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 6: Last Quarter — left half filled
  [
    0b00000111111100000000, 0b00011111000011000000, 0b00111110000000100000, 0b01111110000000010000,
    0b01111110000000010000, 0b11111110000000001000, 0b11111110000000001000, 0b11111110000000001000,
    0b11111110000000001000, 0b11111110000000001000, 0b11111110000000001000, 0b11111110000000001000,
    0b11111110000000001000, 0b01111110000000010000, 0b01111110000000010000, 0b00111110000000100000,
    0b00011111000011000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
  // 7: Waning Crescent — left quarter filled on left side
  [
    0b00000111111100000000, 0b00011100000011000000, 0b00111000000000100000, 0b01111000000000010000,
    0b01111000000000010000, 0b11110000000000001000, 0b11110000000000001000, 0b11110000000000001000,
    0b11110000000000001000, 0b11110000000000001000, 0b11110000000000001000, 0b11110000000000001000,
    0b11110000000000001000, 0b01111000000000010000, 0b01111000000000010000, 0b00111000000000100000,
    0b00011100000011000000, 0b00000111111100000000, 0b00000000000000000000, 0b00000000000000000000,
  ],
];

const MOON_BITMAP_SIZE = 20;

/**
 * intent: Draw a 20x20 moon phase bitmap at (x, y)
 * method: Row by row, bit by bit, MSB=leftmost pixel (bit 19 of a 20-bit value)
 */
function drawMoonBitmap(fb: FrameBuffer, x: number, y: number, phaseIndex: number): void {
  const bitmap = MOON_BITMAPS[phaseIndex];
  if (!bitmap) return;

  for (let row = 0; row < MOON_BITMAP_SIZE; row++) {
    const rowData = bitmap[row];
    if (rowData == null) continue;
    for (let col = 0; col < MOON_BITMAP_SIZE; col++) {
      if (rowData & (1 << (MOON_BITMAP_SIZE - 1 - col))) {
        setPixel(fb, x + col, y + row);
      }
    }
  }
}

/**
 * intent: Render a complete moon bento box into the frame buffer
 * method: Icon + "MOON" header, phase name, illumination %, bitmap circle
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderMoonBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  _config: MoonBoxConfig,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['moon'];
    if (icon) drawIcon(fb, x + PAD, cy, icon, GRAY_LIGHT);
    const labelX = x + PAD + ICON_WIDTH + 3;
    drawText(fb, labelX, cy, 'MOON', width - PAD * 2 - ICON_WIDTH - 3, GRAY_DARK);
    cy += FONT_HEIGHT + PAD;
  }

  const phase = moonPhase(now);
  const { index, name, illumination } = moonPhaseName(phase);

  // Phase bitmap — draw on left side
  const bitmapX = x + PAD;
  const bitmapY = cy;
  drawMoonBitmap(fb, bitmapX, bitmapY, index);

  // Phase name and illumination to the right of bitmap
  const textX = x + PAD + MOON_BITMAP_SIZE + PAD;
  const textMaxW = width - PAD * 2 - MOON_BITMAP_SIZE - PAD;
  if (textMaxW > 0) {
    drawText(fb, textX, cy, name, textMaxW);
    cy += FONT_HEIGHT + 3;
    if (cy + FONT_HEIGHT <= y + height - PAD) {
      drawText(fb, textX, cy, `${String(illumination)}% lit`, textMaxW);
    }
  }

  cy = bitmapY + MOON_BITMAP_SIZE + 2;

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2, GRAY_DARK);
  }
}
