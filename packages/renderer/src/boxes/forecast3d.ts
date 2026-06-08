/**
 * Intent: Render a daily forecast bento box — single line per day
 *         (day count from config.days, default 8)
 * Context: Called by the main render() dispatcher for boxes with type 'forecast3d'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 *
 * Layout: Mon 72/58 Clear
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, Forecast3DBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

export function renderForecast3DBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: Forecast3DBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
  tempUnit: 'F' | 'C' = 'F',
): void {
  const pad = metrics.pad;
  const { x, y, width, height } = layout;
  let cy = y + pad;

  const count = config.days ?? 8;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const contentWidth = width - pad * 2;
  const contentEnd = y + height - pad;
  if (contentWidth <= 0) return;

  const entries = config.entries ?? [];
  if (entries.length === 0) {
    renderPlaceholder(fb, x + pad, cy, contentWidth, contentEnd, config.city, metrics);
  } else {
    renderEntries(fb, x + pad, cy, contentWidth, contentEnd, entries, count, metrics, tempUnit);
  }
}

function renderEntries(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  entries: readonly { day: string; high: number; low: number; condition: string }[],
  count: number,
  metrics: FontMetrics,
  tempUnit: 'F' | 'C',
): void {
  const rowGap = metrics.rowGap;
  const dayColWidth = 4 * metrics.bodyAdvance;
  const tempColWidth = 9 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + rowGap;
  let cy = y;

  for (const entry of entries.slice(0, count)) {
    if (cy + metrics.bodySize > maxY) return;

    drawText(fb, x, cy, entry.day, dayColWidth, GRAY_LIGHT, metrics.bodySize);

    const tempStr = `${Math.round(entry.high)}°/${Math.round(entry.low)}°${tempUnit}`;
    drawText(fb, x + dayColWidth, cy, tempStr, tempColWidth, undefined, metrics.bodySize);

    const condX = x + dayColWidth + tempColWidth;
    const condW = maxWidth - dayColWidth - tempColWidth;
    if (condW > 0) {
      drawText(fb, condX, cy, entry.condition, condW, undefined, metrics.bodySize);
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
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + 2;
  if (cy + metrics.bodySize > maxY) return;
  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize);
}
