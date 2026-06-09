/**
 * Intent: Render a daily forecast bento box — single line per day
 *         (day count from config.days, default 3)
 * Context: Called by the main render() dispatcher for boxes with type 'forecast3d'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 *
 * Layout: Mon 72/58 Clear
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, Forecast3DBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, GRAY_LIGHT } from '../draw.js';
import { measureText } from '../ttf-font.js';
import { drawBoxHeader } from './header.js';

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

  const count = config.days ?? 3;

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
  entries: readonly { day: string; high: number; low: number; condition: string }[],
  count: number,
  metrics: FontMetrics,
): void {
  const rowGap = metrics.rowGap;
  const dayColWidth = 4 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + rowGap;

  // Size the temp column to the widest temp string actually shown so the
  // condition sits just past the temps (still aligned across rows), instead of
  // a fixed 7-'M' column far wider than the digits/°// it holds.
  const rows = entries
    .slice(0, count)
    .map((e) => ({ entry: e, tempStr: `${Math.round(e.high)}°/${Math.round(e.low)}°` }));
  if (rows.length === 0) return;

  const tempColWidth = Math.max(
    ...rows.map((r) => measureText(r.tempStr, metrics.bodySize, metrics.weight)),
  );
  const gap = Math.round(metrics.bodyAdvance * 0.6); // compact space before condition
  const condX = x + dayColWidth + tempColWidth + gap;
  const condW = maxWidth - dayColWidth - tempColWidth - gap;
  let cy = y;

  for (const { entry, tempStr } of rows) {
    if (cy + metrics.bodySize > maxY) return;

    drawText(fb, x, cy, entry.day, dayColWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
    drawText(
      fb,
      x + dayColWidth,
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
