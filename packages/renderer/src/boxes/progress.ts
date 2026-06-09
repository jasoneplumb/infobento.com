/**
 * Intent: Render a progress bento box — percentage with visual bar for any date range
 * Context: Called by the main render() dispatcher for boxes with type 'progress'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Hero % text, horizontal progress bar, "Day X of Y" detail
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, ProgressBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawHeroText, setPixel, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Calculate progress through a date range as a fraction (0.0 to 1.0)
 * method: Linear interpolation from start to end using current date
 */
export function calculateProgress(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): { fraction: number; daysCurrent: number; daysTotal: number } {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = today.getTime() - start.getTime();

  if (totalMs <= 0) return { fraction: 1, daysCurrent: 0, daysTotal: 0 };

  const fraction = Math.min(1, Math.max(0, elapsedMs / totalMs));
  const daysTotal = Math.round(totalMs / 86400000);
  const daysCurrent = Math.min(daysTotal, Math.max(0, Math.round(elapsedMs / 86400000)));

  return { fraction, daysCurrent, daysTotal };
}

/**
 * intent: Get default start/end dates for a year progress bar
 * method: Jan 1 and Dec 31 of the current year
 */
function defaultYearRange(now: Date): { startDate: string; endDate: string } {
  const year = now.getFullYear();
  return {
    startDate: `${String(year)}-01-01`,
    endDate: `${String(year)}-12-31`,
  };
}

/**
 * intent: Draw a filled progress bar rectangle
 * method: Outline rect for total, solid fill for completed portion
 */
function drawProgressBar(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
): void {
  // Outline
  for (let px = x; px < x + width; px++) {
    setPixel(fb, px, y);
    setPixel(fb, px, y + height - 1);
  }
  for (let py = y; py < y + height; py++) {
    setPixel(fb, x, py);
    setPixel(fb, x + width - 1, py);
  }

  // Fill interior proportional to fraction
  const innerW = width - 2;
  const filledW = Math.round(innerW * fraction);
  for (let py = y + 1; py < y + height - 1; py++) {
    for (let px = x + 1; px < x + 1 + filledW; px++) {
      setPixel(fb, px, py);
    }
  }
}

/**
 * intent: Render a complete progress bento box into the frame buffer
 * method: Icon + label header, hero percentage, progress bar, "Day X of Y"
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderProgressBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: ProgressBoxConfig,
  metrics: FontMetrics,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const defaultRange = defaultYearRange(now);
  const startDate = config.startDate ?? defaultRange.startDate;
  const endDate = config.endDate ?? defaultRange.endDate;

  const { fraction, daysCurrent, daysTotal } = calculateProgress(startDate, endDate, now);
  const pct = Math.round(fraction * 100);
  const pctStr = `${String(pct)}%`;

  // Hero percentage
  drawHeroText(
    fb,
    x + metrics.pad,
    cy,
    pctStr,
    undefined,
    GRAY_DARK,
    metrics.heroSize,
    metrics.headingWeight,
  );

  const heroWidth = pctStr.length * metrics.heroAdvance;
  cy += metrics.heroSize + 2;

  // Progress bar
  const barY = cy;
  const barHeight = 7;
  const barWidth = width - metrics.pad * 2;
  if (barY + barHeight <= y + height - metrics.pad) {
    drawProgressBar(fb, x + metrics.pad, barY, barWidth, barHeight, fraction);
    cy = barY + barHeight + 3;
  }

  // "Day X of Y" detail
  if (cy + metrics.bodySize <= y + height - metrics.pad && daysTotal > 0) {
    drawText(
      fb,
      x + metrics.pad,
      cy,
      `Day ${String(daysCurrent)} of ${String(daysTotal)}`,
      width - metrics.pad * 2,
      GRAY_LIGHT,
      metrics.bodySize,
      metrics.weight,
    );
    cy += metrics.bodySize + metrics.pad;
  }

  // Suppress unused variable warning
  void heroWidth;
}
