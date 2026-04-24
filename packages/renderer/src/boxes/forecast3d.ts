/**
 * Intent: Render an 8-day daily forecast bento box — single line per day
 * Context: Called by the main render() dispatcher for boxes with type 'forecast3d'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 *
 * Layout: Mon 72/58 Clear
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, Forecast3DBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

export function renderForecast3DBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: Forecast3DBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const pad = metrics.pad;
  const { x, y, width, height } = layout;
  let cy = y + pad;

  if (showHeaders) {
    const icon = BOX_ICONS['forecast3d'];
    if (icon) drawIcon(fb, x + pad, cy, icon, GRAY_LIGHT);
    const labelX = x + pad + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} 8D` : '8-DAY';
    drawText(
      fb,
      labelX,
      cy,
      headerText,
      width - pad * 2 - ICON_WIDTH - 3,
      GRAY_DARK,
      metrics.bodySize,
    );
    cy += metrics.bodySize + pad;
  }

  const contentWidth = width - pad * 2;
  const contentEnd = y + height - pad;
  if (contentWidth <= 0) return;

  const entries = config.entries ?? [];
  if (entries.length === 0) {
    renderPlaceholder(fb, x + pad, cy, contentWidth, contentEnd, config.city, metrics);
  } else {
    renderEntries(fb, x + pad, cy, contentWidth, contentEnd, entries, metrics);
  }
}

function renderEntries(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  entries: readonly { day: string; high: number; low: number; condition: string }[],
  metrics: FontMetrics,
): void {
  const rowGap = metrics.rowGap;
  const dayColWidth = 4 * metrics.bodyAdvance;
  const tempColWidth = 6 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + rowGap;
  let cy = y;

  for (const entry of entries.slice(0, 8)) {
    if (cy + metrics.bodySize > maxY) return;

    drawText(fb, x, cy, entry.day, dayColWidth, GRAY_DARK, metrics.bodySize);

    const tempStr = `${Math.round(entry.high)}/${Math.round(entry.low)}`;
    drawText(fb, x + dayColWidth, cy, tempStr, tempColWidth, GRAY_DARK, metrics.bodySize);

    const condX = x + dayColWidth + tempColWidth;
    const condW = maxWidth - dayColWidth - tempColWidth;
    if (condW > 0) {
      drawText(fb, condX, cy, entry.condition, condW, GRAY_DARK, metrics.bodySize);
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
  metrics: FontMetrics,
): void {
  let cy = y;
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy, GRAY_DARK, metrics.bodySize);
  cy += metrics.bodySize + 2;
  if (cy + metrics.bodySize > maxY) return;
  drawText(fb, x, cy, 'No data', maxWidth, GRAY_DARK, metrics.bodySize);
}
