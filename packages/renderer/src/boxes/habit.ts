/**
 * Intent: Render a habit tracker bento box — header, habit rows with status circles + streaks
 * Context: Called by the main render() dispatcher for boxes with type 'habit'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Circle status indicator, habit name, right-aligned streak count (e.g. "12d")
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, HabitBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, setPixel, GRAY_DARK } from '../draw.js';
import { drawBoxHeader } from './header.js';
import { measureText } from '../ttf-font.js';

/**
 * intent: Draw a small circle at (cx, cy) with radius r
 * method: Brute-force distance check over bounding box
 * effect: Filled circle for completed habits, outline for incomplete
 */
function drawCircle(fb: FrameBuffer, cx: number, cy: number, r: number, filled: boolean): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (filled ? dist <= r : dist >= r - 1 && dist <= r) {
        setPixel(fb, cx + dx, cy + dy);
      }
    }
  }
}

/**
 * intent: Render a complete habit tracker bento box into the frame buffer
 * method: Uppercase label header, circle + name + streak per row, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderHabitBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: HabitBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const bodyX = x + metrics.pad;
  const bodyWidth = width - metrics.pad * 2;
  const bodyEnd = y + height - metrics.pad;
  const radius = Math.max(2, Math.round(metrics.bodySize * 0.25));
  const circleSpace = radius * 2 + Math.round(metrics.pad * 0.5);
  const textX = bodyX + circleSpace;

  if (bodyWidth <= 0) return;

  for (const habit of config.habits) {
    if (cy + metrics.bodySize > bodyEnd) break;

    // Draw status circle — vertically centered relative to text
    const circleCy = cy + Math.round(metrics.bodySize / 2);
    const circleCx = bodyX + radius;
    drawCircle(fb, circleCx, circleCy, radius, habit.completedToday);

    // Build streak text and measure for right-alignment
    const streakStr = String(habit.streak) + 'd';
    const streakWidth = measureText(streakStr, metrics.bodySize);

    // Habit name — leave room for streak on the right
    const nameMaxWidth = bodyWidth - circleSpace - streakWidth - Math.round(metrics.pad * 0.5);
    if (nameMaxWidth > 0) {
      drawText(
        fb,
        textX,
        cy,
        habit.name,
        nameMaxWidth,
        undefined,
        metrics.bodySize,
        metrics.weight,
      );
    }

    // Streak count right-aligned
    const streakX = x + width - metrics.pad - streakWidth;
    drawText(fb, streakX, cy, streakStr, streakWidth, GRAY_DARK, metrics.bodySize, metrics.weight);

    cy += metrics.bodyLineHeight;
  }
}
