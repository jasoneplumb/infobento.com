/**
 * Intent: Render a sun (sunrise/sunset) bento box — stacked rise/set/day-length
 * Context: Called by the main render() dispatcher for boxes with type 'sun'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, SunBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHLine, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

const PAD = 16;
const ROW_GAP = 8;
const LABEL_COL = 5 * CHAR_ADVANCE; // "RISE " = 5 chars

export function renderSunBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: SunBoxConfig,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    const icon = BOX_ICONS['sun'];
    if (icon) drawIcon(fb, x + PAD, cy, icon, GRAY_LIGHT);
    const labelX = x + PAD + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} SUN` : 'SUN';
    drawText(fb, labelX, cy, headerText, width - PAD * 2 - ICON_WIDTH - 3, GRAY_DARK);
    cy += FONT_HEIGHT + PAD;
  }

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;
  if (contentWidth <= 0) return;

  if (config.data) {
    cy = renderSunData(fb, x + PAD, cy, contentWidth, contentEnd, config.data);
  } else {
    cy = renderPlaceholder(fb, x + PAD, cy, contentWidth, contentEnd, config.city);
  }

  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, contentWidth, GRAY_DARK);
  }
}

function renderSunData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  data: { sunrise: string; sunset: string; dayLength: string },
): number {
  const rowHeight = FONT_HEIGHT + ROW_GAP;
  let cy = y;
  const valueX = x + LABEL_COL;
  const valueW = maxWidth - LABEL_COL;

  // Sunrise
  if (cy + FONT_HEIGHT > maxY) return cy;
  drawText(fb, x, cy, 'RISE', LABEL_COL, GRAY_DARK);
  drawText(fb, valueX, cy, data.sunrise.slice(0, 5), valueW);
  cy += rowHeight;

  // Sunset
  if (cy + FONT_HEIGHT > maxY) return cy;
  drawText(fb, x, cy, 'SET', LABEL_COL, GRAY_DARK);
  drawText(fb, valueX, cy, data.sunset.slice(0, 5), valueW);
  cy += rowHeight;

  // Day length
  if (cy + FONT_HEIGHT > maxY) return cy;
  drawText(fb, x, cy, 'DAY', LABEL_COL, GRAY_DARK);
  drawText(fb, valueX, cy, data.dayLength, valueW);
  cy += FONT_HEIGHT + PAD;

  return cy;
}

function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  city: string,
): number {
  let cy = y;
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy);
  cy += FONT_HEIGHT + 2;
  if (cy + FONT_HEIGHT > maxY) return cy;
  drawText(fb, x, cy, 'No data', maxWidth);
  cy += FONT_HEIGHT + PAD;
  return cy;
}
