/**
 * Intent: Render an 8-hour forecast bento box — time / temp / condition per row
 * Context: Called by the main render() dispatcher for boxes with type 'forecast'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, ForecastBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHLine, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

const PAD = 16;
const ROW_GAP = 8;
const TIME_COL_WIDTH = 36;
const TEMP_COL_WIDTH = 24;

export function renderForecastBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: ForecastBoxConfig,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    const icon = BOX_ICONS['forecast'];
    if (icon) drawIcon(fb, x + PAD, cy, icon, GRAY_LIGHT);
    const labelX = x + PAD + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} 8HR` : '8HR FCST';
    drawText(fb, labelX, cy, headerText, width - PAD * 2 - ICON_WIDTH - 3, GRAY_DARK);
    cy += FONT_HEIGHT + PAD;
  }

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;
  if (contentWidth <= 0) return;

  const entries = config.entries ?? [];
  if (entries.length === 0) {
    renderPlaceholder(fb, x + PAD, cy, contentWidth, contentEnd, config.city);
  } else {
    renderEntries(fb, x + PAD, cy, contentWidth, contentEnd, entries);
  }

  // Bottom rule
  const ruleY = y + height - 2;
  if (ruleY > y) drawHLine(fb, x + PAD, ruleY, width - PAD * 2, GRAY_DARK);
}

function renderEntries(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  entries: readonly { time: string; temperature: number; condition: string }[],
): void {
  const rowHeight = FONT_HEIGHT + ROW_GAP;
  let cy = y;

  for (const entry of entries.slice(0, 8)) {
    if (cy + FONT_HEIGHT > maxY) return;

    drawText(fb, x, cy, entry.time, TIME_COL_WIDTH);

    const tempStr = `${Math.round(entry.temperature)}F`;
    drawText(fb, x + TIME_COL_WIDTH, cy, tempStr, TEMP_COL_WIDTH);

    const condX = x + TIME_COL_WIDTH + TEMP_COL_WIDTH;
    const condW = maxWidth - TIME_COL_WIDTH - TEMP_COL_WIDTH;
    if (condW > 0) {
      drawTextWrapped(fb, condX, cy, entry.condition, condW, FONT_HEIGHT);
    }

    cy += rowHeight;
  }
}

function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  city: string,
): void {
  let cy = y;
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy);
  cy += FONT_HEIGHT + 2;
  if (cy + FONT_HEIGHT > maxY) return;
  drawText(fb, x, cy, 'No data', maxWidth);
}
