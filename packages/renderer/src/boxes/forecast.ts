/**
 * Intent: Render an 8-hour forecast bento box — time / temp / condition per row
 * Context: Called by the main render() dispatcher for boxes with type 'forecast'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, ForecastBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

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

  if (showHeaders) {
    const icon = BOX_ICONS['forecast'];
    if (icon) drawIcon(fb, x + pad, cy, icon, GRAY_LIGHT);
    const labelX = x + pad + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} 8HR` : '8HR FCST';
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
  entries: readonly { time: string; temperature: number; condition: string }[],
  metrics: FontMetrics,
): void {
  const rowGap = metrics.rowGap;
  const timeColWidth = 6 * metrics.bodyAdvance;
  const tempColWidth = 5 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + rowGap;
  let cy = y;

  for (const entry of entries.slice(0, 8)) {
    if (cy + metrics.bodySize > maxY) return;

    drawText(fb, x, cy, entry.time, timeColWidth, GRAY_LIGHT, metrics.bodySize);

    const tempStr = `${Math.round(entry.temperature)}F`;
    drawText(fb, x + timeColWidth, cy, tempStr, tempColWidth, undefined, metrics.bodySize);

    const condX = x + timeColWidth + tempColWidth;
    const condW = maxWidth - timeColWidth - tempColWidth;
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
