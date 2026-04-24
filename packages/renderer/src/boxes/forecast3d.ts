/**
 * Intent: Render an 8-day daily forecast bento box — single line per day
 * Context: Called by the main render() dispatcher for boxes with type 'forecast3d'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 *
 * Layout: Mon 72/58 Clear
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, Forecast3DBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

const PAD = 4;
const ROW_GAP = 2;
const DAY_COL_WIDTH = 4 * CHAR_ADVANCE; // "Mon " = 4 chars
const TEMP_COL_WIDTH = 6 * CHAR_ADVANCE; // "72/58 " = 6 chars

export function renderForecast3DBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: Forecast3DBoxConfig,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    const icon = BOX_ICONS['forecast3d'];
    if (icon) drawIcon(fb, x + PAD, cy, icon);
    const labelX = x + PAD + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} 8D` : '8-DAY';
    drawText(fb, labelX, cy, headerText, width - PAD * 2 - ICON_WIDTH - 3);
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
  if (ruleY > y) drawHLine(fb, x + PAD, ruleY, width - PAD * 2);
}

function renderEntries(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  entries: readonly { day: string; high: number; low: number; condition: string }[],
): void {
  const rowHeight = FONT_HEIGHT + ROW_GAP;
  let cy = y;

  for (const entry of entries.slice(0, 8)) {
    if (cy + FONT_HEIGHT > maxY) return;

    drawText(fb, x, cy, entry.day, DAY_COL_WIDTH);

    const tempStr = `${Math.round(entry.high)}/${Math.round(entry.low)}`;
    drawText(fb, x + DAY_COL_WIDTH, cy, tempStr, TEMP_COL_WIDTH);

    const condX = x + DAY_COL_WIDTH + TEMP_COL_WIDTH;
    const condW = maxWidth - DAY_COL_WIDTH - TEMP_COL_WIDTH;
    if (condW > 0) {
      drawText(fb, condX, cy, entry.condition, condW);
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
