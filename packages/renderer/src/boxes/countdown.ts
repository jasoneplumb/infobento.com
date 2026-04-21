/**
 * Intent: Render a countdown bento box — border, label header, days remaining
 * Context: Called by the main render() dispatcher for boxes with type 'countdown'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Future: Hero font for large day count, icon support
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, CountdownBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText, drawTextWrapped } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';

/** Padding inside the box border */
const INNER_PAD = 2;

/** Height reserved for the label header (font + padding) */
const HEADER_HEIGHT = FONT_HEIGHT + INNER_PAD * 2;

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
 * method: Draw border, render label in header area, render day count + subtitle in body
 * effect: Fills the allocated LayoutBox region with bordered countdown content
 */
export function renderCountdownBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: CountdownBoxConfig,
  now?: Date,
): void {
  const { x, y, width, height } = layout;

  // Draw box border
  drawRect(fb, x, y, width, height);

  // Draw label in header area (uppercase for consistency with text box)
  const labelY = y + INNER_PAD;
  const labelX = x + INNER_PAD + 1;
  drawText(fb, labelX, labelY, layout.box.label.toUpperCase(), width - INNER_PAD * 2 - 2);

  // Draw dotted divider line below header
  const dividerY = y + HEADER_HEIGHT;
  for (let dx = x + 1; dx < x + width - 1; dx++) {
    if (dx % 2 === 0) setPixel(fb, dx, dividerY);
  }

  // Calculate days remaining
  const days = daysUntil(config.targetDate, now);
  const daysStr = String(days);

  // Body area below divider
  const bodyX = x + INNER_PAD + 1;
  const bodyY = dividerY + INNER_PAD + 1;
  const bodyWidth = width - INNER_PAD * 2 - 2;
  const bodyHeight = height - HEADER_HEIGHT - INNER_PAD - 2;

  if (bodyHeight <= 0 || bodyWidth <= 0) return;

  // Draw day count centered horizontally
  const daysWidth = daysStr.length * CHAR_ADVANCE;
  const daysX = x + Math.floor((width - daysWidth) / 2);
  drawText(fb, daysX, bodyY, daysStr, bodyWidth);

  // Draw subtitle below: "days to [label]" or "PAST" if 0 days
  const subtitleY = bodyY + FONT_HEIGHT + INNER_PAD;
  if (subtitleY + FONT_HEIGHT <= y + height - 1) {
    const subtitle = days === 0 ? 'PAST' : `days to ${config.label}`;
    drawTextWrapped(
      fb,
      bodyX,
      subtitleY,
      subtitle,
      bodyWidth,
      bodyHeight - FONT_HEIGHT - INNER_PAD,
    );
  }
}
