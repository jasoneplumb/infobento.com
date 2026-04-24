/**
 * Intent: Render a date bento box — hero day number with day-of-week and month
 * Context: Called by the main render() dispatcher for boxes with type 'date'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Hero font for day number, small font for day-of-week/month, optional extras
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, DateBoxConfig } from '@infobento/core';
import { drawText, drawHeroText, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../hero-font.js';

/** Whitespace padding */
const PAD = 4;

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * intent: Calculate the ISO week number (1-53) for a given date
 * method: Thursday-based ISO 8601 week number calculation
 */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

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
 * intent: Render a complete date bento box into the frame buffer
 * method: Icon + "DATE" header, hero day number, day-of-week + month, optional extras
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderDateBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: DateBoxConfig,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['date'];
    if (icon) drawIcon(fb, x + PAD, cy, icon);
    const labelX = x + PAD + ICON_WIDTH + 3;
    drawText(fb, labelX, cy, 'DATE', width - PAD * 2 - ICON_WIDTH - 3);
    cy += FONT_HEIGHT + PAD;
  }

  const dayNum = now.getDate();
  const dayName = DAYS_OF_WEEK[now.getDay()] ?? 'SUN';
  const monthName = MONTHS[now.getMonth()] ?? 'JAN';

  // Hero day number
  const dayStr = String(dayNum);
  drawHeroText(fb, x + PAD, cy, dayStr);

  // Day-of-week + month beside the hero text
  const heroWidth = dayStr.length * HERO_CHAR_ADVANCE;
  const sideX = x + PAD + heroWidth + PAD;
  const sideMaxW = width - PAD * 2 - heroWidth - PAD;
  if (sideMaxW > 0) {
    drawText(fb, sideX, cy + 2, dayName, sideMaxW);
    if (cy + 2 + FONT_HEIGHT + 3 + FONT_HEIGHT <= y + height - PAD) {
      drawText(fb, sideX, cy + 2 + FONT_HEIGHT + 3, monthName, sideMaxW);
    }
  }
  cy += HERO_FONT_HEIGHT + 2;

  // Optional: week number
  if (config.showWeekNumber && cy + FONT_HEIGHT <= y + height - PAD) {
    const wk = isoWeekNumber(now);
    drawText(fb, x + PAD, cy, `WK ${String(wk)}`, width - PAD * 2);
    cy += FONT_HEIGHT + 2;
  }

  // Optional: day of year
  if (config.showDayOfYear && cy + FONT_HEIGHT <= y + height - PAD) {
    const doy = dayOfYear(now);
    drawText(fb, x + PAD, cy, `DAY ${String(doy)}`, width - PAD * 2);
    cy += FONT_HEIGHT + 2;
  }

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2);
  }
}
