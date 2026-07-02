/**
 * Intent: Render a date bento box — stacked: day-of-week, hero day, month+year, year progress
 * Context: Called by the main render() dispatcher for boxes with type 'date'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, DateBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawHeroText, drawRect, setPixel, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * intent: Calculate the day of year (1-366) for a given date
 * method: Diff from Jan 1 of same year
 */
export function dayOfYear(date: Date, utc = false): number {
  const start = utc
    ? Date.UTC(date.getUTCFullYear(), 0, 0)
    : new Date(date.getFullYear(), 0, 0).getTime();
  const diff = date.getTime() - start;
  return Math.floor(diff / 86400000);
}

/**
 * intent: Total days in year (365 or 366)
 */
function daysInYear(year: number): number {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

/**
 * intent: Draw a filled progress bar
 * method: Outline rect with filled portion
 */
function drawProgressBar(
  fb: FrameBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
): void {
  drawRect(fb, x, y, width, height);
  const fillWidth = Math.round((width - 2) * Math.min(1, Math.max(0, fraction)));
  for (let row = y + 1; row < y + height - 1; row++) {
    for (let col = x + 1; col < x + 1 + fillWidth; col++) {
      setPixel(fb, col, row);
    }
  }
}

export function renderDateBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: DateBoxConfig,
  metrics: FontMetrics,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const contentWidth = width - metrics.pad * 2;
  const contentEnd = y + height - metrics.pad;
  if (contentWidth <= 0) return;

  // Anchor to the device location's timezone (issue #166): shift the instant by
  // the hydrated UTC offset and read UTC fields, so a UTC server still renders
  // the device's *local* date. Without an offset, fall back to server-local time.
  const offsetSec = config.data?.utcOffsetSeconds;
  const useOffset = offsetSec !== undefined;
  const local = useOffset ? new Date(now.getTime() + offsetSec * 1000) : now;

  const dayNum = useOffset ? local.getUTCDate() : local.getDate();
  const dayName = DAYS_OF_WEEK[useOffset ? local.getUTCDay() : local.getDay()] ?? 'SUNDAY';
  const monthName = MONTHS[useOffset ? local.getUTCMonth() : local.getMonth()] ?? 'JAN';
  const year = useOffset ? local.getUTCFullYear() : local.getFullYear();

  // Line 1: Day-of-week (small font)
  if (cy + metrics.bodySize > contentEnd) return;
  drawText(
    fb,
    x + metrics.pad,
    cy,
    dayName,
    contentWidth,
    undefined,
    metrics.bodySize,
    metrics.weight,
  );
  cy += metrics.bodySize + 1;

  // Line 2: Hero day number
  if (cy + metrics.heroSize > contentEnd) return;
  drawHeroText(
    fb,
    x + metrics.pad,
    cy,
    String(dayNum),
    undefined,
    GRAY_DARK,
    metrics.heroSize,
    metrics.headingWeight,
  );
  cy += metrics.heroSize + 1;

  // Line 3: Month + year (small font)
  if (cy + metrics.bodySize > contentEnd) return;
  drawText(
    fb,
    x + metrics.pad,
    cy,
    `${monthName} ${String(year)}`,
    contentWidth,
    undefined,
    metrics.bodySize,
    metrics.weight,
  );
  cy += metrics.bodySize + 3;

  // Year progress: "Day 113/365" with progress bar on same line
  const doy = dayOfYear(local, useOffset);
  const total = daysInYear(year);
  const barHeight = 5;

  if (cy + barHeight > contentEnd) {
    return;
  }

  const progressLabel = `${String(doy)}/${String(total)}`;
  const labelWidth = progressLabel.length * metrics.bodyAdvance;
  const barX = x + metrics.pad + labelWidth + 4;
  const barWidth = contentWidth - labelWidth - 4;

  drawText(
    fb,
    x + metrics.pad,
    cy,
    progressLabel,
    labelWidth,
    GRAY_LIGHT,
    metrics.bodySize,
    metrics.weight,
  );
  if (barWidth > 10) {
    drawProgressBar(fb, barX, cy + 1, barWidth, barHeight, doy / total);
  }
  cy += Math.max(metrics.bodySize, barHeight) + metrics.pad;
}
