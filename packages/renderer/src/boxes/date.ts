/**
 * Intent: Render a date bento box — stacked: day-of-week, hero day, month+year, year progress
 * Context: Called by the main render() dispatcher for boxes with type 'date'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, DateBoxConfig } from '@infobento/core';
import {
  drawText,
  drawHeroText,
  drawHLine,
  drawRect,
  drawIcon,
  setPixel,
  GRAY_DARK,
  GRAY_LIGHT,
} from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { HERO_FONT_HEIGHT } from '../hero-font.js';

const PAD = 16;

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * intent: Calculate the day of year (1-366) for a given date
 * method: Diff from Jan 1 of same year
 */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
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
  _config: DateBoxConfig,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    const icon = BOX_ICONS['date'];
    if (icon) drawIcon(fb, x + PAD, cy, icon, GRAY_LIGHT);
    const labelX = x + PAD + ICON_WIDTH + 3;
    drawText(fb, labelX, cy, 'DATE', width - PAD * 2 - ICON_WIDTH - 3, GRAY_DARK);
    cy += FONT_HEIGHT + PAD;
  }

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;
  if (contentWidth <= 0) return;

  const dayNum = now.getDate();
  const dayName = DAYS_OF_WEEK[now.getDay()] ?? 'SUNDAY';
  const monthName = MONTHS[now.getMonth()] ?? 'JAN';
  const year = now.getFullYear();

  // Line 1: Day-of-week (small font)
  if (cy + FONT_HEIGHT > contentEnd) return;
  drawText(fb, x + PAD, cy, dayName, contentWidth);
  cy += FONT_HEIGHT + 1;

  // Line 2: Hero day number
  if (cy + HERO_FONT_HEIGHT > contentEnd) return;
  drawHeroText(fb, x + PAD, cy, String(dayNum));
  cy += HERO_FONT_HEIGHT + 1;

  // Line 3: Month + year (small font)
  if (cy + FONT_HEIGHT > contentEnd) return;
  drawText(fb, x + PAD, cy, `${monthName} ${String(year)}`, contentWidth);
  cy += FONT_HEIGHT + 3;

  // Year progress: "Day 113/365" with progress bar on same line
  const doy = dayOfYear(now);
  const total = daysInYear(year);
  const barHeight = 5;

  if (cy + barHeight > contentEnd) {
    // Bottom rule
    if (cy + 2 <= y + height) drawHLine(fb, x + PAD, cy, contentWidth, GRAY_DARK);
    return;
  }

  const progressLabel = `${String(doy)}/${String(total)}`;
  const labelWidth = progressLabel.length * 6; // CHAR_ADVANCE = 6
  const barX = x + PAD + labelWidth + 4;
  const barWidth = contentWidth - labelWidth - 4;

  drawText(fb, x + PAD, cy, progressLabel, labelWidth);
  if (barWidth > 10) {
    drawProgressBar(fb, barX, cy + 1, barWidth, barHeight, doy / total);
  }
  cy += Math.max(FONT_HEIGHT, barHeight) + PAD;

  // Bottom rule
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, contentWidth, GRAY_DARK);
  }
}
