/**
 * Intent: Render a countdown bento box — hero day count with label and subtitle
 * Context: Called by the main render() dispatcher for boxes with type 'countdown'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with hero font for day count
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, CountdownBoxConfig } from '@infobento/core';
import { drawText, drawHeroText, drawHLine } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../hero-font.js';

/** Whitespace padding */
const PAD = 4;

/**
 * intent: Calculate the number of whole days between today and a target date
 * method: Parse ISO date, diff in milliseconds, convert to days (floored)
 * effect: Returns 0 for past dates and today
 */
export function daysUntil(targetDate: string, now: Date = new Date()): number {
  const target = new Date(targetDate + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * intent: Render a complete countdown bento box into the frame buffer
 * method: Uppercase label, hero day count, small subtitle text, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderCountdownBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: CountdownBoxConfig,
  now?: Date,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  // Uppercase label (5x7 font)
  drawText(fb, x + PAD, cy, 'COUNTDOWN', width - PAD * 2);
  cy += FONT_HEIGHT + PAD;

  // Calculate days remaining
  const days = daysUntil(config.targetDate, now);
  const daysStr = String(days);

  // Hero day count
  drawHeroText(fb, x + PAD, cy, daysStr);

  // "days to [label]" beside the hero text
  const heroWidth = daysStr.length * HERO_CHAR_ADVANCE;
  const subtitleX = x + PAD + heroWidth + PAD;
  const subtitleMaxW = width - PAD * 2 - heroWidth - PAD;
  if (subtitleMaxW > 0) {
    const subtitle = days === 0 ? 'PAST' : `days to`;
    drawText(fb, subtitleX, cy + 4, subtitle, subtitleMaxW);
  }
  cy += HERO_FONT_HEIGHT + 2;

  // Label text below hero (e.g., the event name)
  if (days > 0 && cy + FONT_HEIGHT <= y + height - PAD) {
    drawText(fb, x + PAD, cy, config.label, width - PAD * 2);
    cy += FONT_HEIGHT + PAD;
  }

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2);
  }
}
