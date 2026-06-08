/**
 * Intent: Render a countdown bento box — hero day count with label and subtitle
 * Context: Called by the main render() dispatcher for boxes with type 'countdown'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with hero font for day count
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, CountdownBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawHeroText, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

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
  metrics: FontMetrics,
  now?: Date,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  // Calculate days remaining
  const days = daysUntil(config.targetDate, now);
  const daysStr = String(days);

  // Hero day count
  drawHeroText(fb, x + metrics.pad, cy, daysStr, undefined, GRAY_DARK, metrics.heroSize);

  // "days to [label]" beside the hero text
  const heroWidth = daysStr.length * metrics.heroAdvance;
  const subtitleX = x + metrics.pad + heroWidth + metrics.pad;
  const subtitleMaxW = width - metrics.pad * 2 - heroWidth - metrics.pad;
  if (subtitleMaxW > 0) {
    const subtitle = days === 0 ? 'PAST' : `days to`;
    drawText(fb, subtitleX, cy + 4, subtitle, subtitleMaxW, GRAY_LIGHT, metrics.bodySize);
  }
  cy += metrics.heroSize + 2;

  // Label text below hero (e.g., the event name)
  if (days > 0 && cy + metrics.bodySize <= y + height - metrics.pad) {
    drawText(
      fb,
      x + metrics.pad,
      cy,
      config.label,
      width - metrics.pad * 2,
      undefined,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }
}
