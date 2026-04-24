/**
 * Intent: Render a worldclock bento box — stacked city labels with right-aligned times
 * Context: Called by the main render() dispatcher for boxes with type 'worldclock'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, WorldclockBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { measureText } from '../ttf-font.js';

/**
 * intent: Compute the display time for a timezone given its UTC offset in minutes
 * method: Convert local time to UTC, apply offset, format as HH:MM
 * effect: Returns a 5-character string like "09:30" or "23:15"
 */
export function formatZoneTime(now: Date, offsetMinutes: number): string {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const zoneMs = utcMs + offsetMinutes * 60000;
  const zoneDate = new Date(zoneMs);
  const hours = String(zoneDate.getHours()).padStart(2, '0');
  const minutes = String(zoneDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * intent: Render a complete worldclock bento box into the frame buffer
 * method: Header with icon, then one row per timezone (label left, time right-aligned)
 * effect: Fills the allocated LayoutBox region; shows as many zones as fit vertically
 */
export function renderWorldclockBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: WorldclockBoxConfig,
  metrics: FontMetrics,
  now: Date = new Date(),
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) {
    const icon = BOX_ICONS['worldclock'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    drawText(
      fb,
      labelX,
      cy,
      layout.box.label.toUpperCase(),
      width - metrics.pad * 2 - ICON_WIDTH - 3,
      undefined,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }

  const contentWidth = width - metrics.pad * 2;
  const contentEnd = y + height - metrics.pad;
  if (contentWidth <= 0) return;

  const rowHeight = metrics.bodySize + metrics.rowGap;

  for (const zone of config.zones) {
    if (cy + metrics.bodySize > contentEnd) break;

    const timeStr = formatZoneTime(now, zone.offsetMinutes);
    const timeWidth = measureText(timeStr, metrics.bodySize);

    // City label on the left
    const labelMaxWidth = contentWidth - timeWidth - metrics.pad;
    drawText(fb, x + metrics.pad, cy, zone.label, labelMaxWidth, GRAY_DARK, metrics.bodySize);

    // Time right-aligned
    const timeX = x + width - metrics.pad - timeWidth;
    drawText(fb, timeX, cy, timeStr, timeWidth, undefined, metrics.bodySize);

    cy += rowHeight;
  }
}
