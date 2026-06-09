/**
 * Intent: Render an hourly forecast bento box — time / temp / condition per row
 *         (hour count from config.hours, default 3)
 * Context: Called by the main render() dispatcher for boxes with type 'forecast'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, ForecastBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, GRAY_LIGHT } from '../draw.js';
import { measureText } from '../ttf-font.js';
import { drawBoxHeader } from './header.js';

export function renderForecastBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: ForecastBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const pad = metrics.pad;
  const { x, y, width, height } = layout;
  let cy = y + pad;

  const count = config.hours ?? 3;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const contentWidth = width - pad * 2;
  const contentEnd = y + height - pad;
  if (contentWidth <= 0) return;

  const entries = config.entries ?? [];
  if (entries.length === 0) {
    renderPlaceholder(fb, x + pad, cy, contentWidth, contentEnd, config.city, metrics);
  } else {
    renderEntries(fb, x + pad, cy, contentWidth, contentEnd, entries, count, metrics);
  }
}

function renderEntries(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  entries: readonly { time: string; temperature: number; condition: string }[],
  count: number,
  metrics: FontMetrics,
): void {
  const rowGap = metrics.rowGap;
  const timeColWidth = 6 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + rowGap;

  // Size the temp column to the widest temp string actually shown so the
  // condition sits just past the temps (still aligned across rows), instead of
  // a fixed 5-'M' column far wider than the digits/° it holds.
  const rows = entries
    .slice(0, count)
    .map((e) => ({ entry: e, tempStr: `${Math.round(e.temperature)}°` }));
  if (rows.length === 0) return;

  const tempColWidth = Math.max(
    ...rows.map((r) => measureText(r.tempStr, metrics.bodySize, metrics.weight)),
  );
  const gap = Math.round(metrics.bodyAdvance * 0.6); // compact space before condition
  const condX = x + timeColWidth + tempColWidth + gap;
  const condW = maxWidth - timeColWidth - tempColWidth - gap;
  let cy = y;

  for (const { entry, tempStr } of rows) {
    if (cy + metrics.bodySize > maxY) return;

    drawText(fb, x, cy, entry.time, timeColWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
    drawText(
      fb,
      x + timeColWidth,
      cy,
      tempStr,
      tempColWidth,
      undefined,
      metrics.bodySize,
      metrics.weight,
    );

    if (condW > 0) {
      drawText(fb, condX, cy, entry.condition, condW, undefined, metrics.bodySize, metrics.weight);
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
  drawTextWrapped(
    fb,
    x,
    cy,
    city,
    maxWidth,
    maxY - cy,
    GRAY_LIGHT,
    metrics.bodySize,
    metrics.weight,
  );
  cy += metrics.bodySize + 2;
  if (cy + metrics.bodySize > maxY) return;
  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
}
