/**
 * Intent: Render a sun (sunrise/sunset) bento box — stacked rise/set/day-length
 * Context: Called by the main render() dispatcher for boxes with type 'sun'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, SunBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

export function renderSunBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: SunBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const contentWidth = width - metrics.pad * 2;
  const contentEnd = y + height - metrics.pad;
  if (contentWidth <= 0) return;

  if (config.data) {
    renderSunData(fb, x + metrics.pad, cy, contentWidth, contentEnd, config.data, metrics);
  } else {
    renderPlaceholder(fb, x + metrics.pad, cy, contentWidth, contentEnd, config.city, metrics);
  }
}

function renderSunData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  data: { sunrise: string; sunset: string; dayLength: string },
  metrics: FontMetrics,
): number {
  const labelCol = 5 * metrics.bodyAdvance;
  const rowHeight = metrics.bodySize + metrics.rowGap;
  let cy = y;
  const valueX = x + labelCol;
  const valueW = maxWidth - labelCol;

  // Sunrise
  if (cy + metrics.bodySize > maxY) return cy;
  drawText(fb, x, cy, 'RISE', labelCol, GRAY_DARK, metrics.bodySize, metrics.weight);
  drawText(
    fb,
    valueX,
    cy,
    data.sunrise.slice(0, 5),
    valueW,
    undefined,
    metrics.bodySize,
    metrics.weight,
  );
  cy += rowHeight;

  // Sunset
  if (cy + metrics.bodySize > maxY) return cy;
  drawText(fb, x, cy, 'SET', labelCol, GRAY_DARK, metrics.bodySize, metrics.weight);
  drawText(
    fb,
    valueX,
    cy,
    data.sunset.slice(0, 5),
    valueW,
    undefined,
    metrics.bodySize,
    metrics.weight,
  );
  cy += rowHeight;

  // Day length
  if (cy + metrics.bodySize > maxY) return cy;
  drawText(fb, x, cy, 'DAY', labelCol, GRAY_DARK, metrics.bodySize, metrics.weight);
  drawText(fb, valueX, cy, data.dayLength, valueW, undefined, metrics.bodySize, metrics.weight);
  cy += metrics.bodySize + metrics.pad;

  return cy;
}

function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  city: string,
  metrics: FontMetrics,
): number {
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
  if (cy + metrics.bodySize > maxY) return cy;
  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
  cy += metrics.bodySize + metrics.pad;
  return cy;
}
