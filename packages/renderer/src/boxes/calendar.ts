/**
 * Intent: Render a calendar bento box — list of upcoming events with times
 * Context: Called by the main render() dispatcher for boxes with type 'calendar'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with no borders — event list + thin rule divider
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, CalendarBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render a complete calendar bento box into the frame buffer
 * method: Uppercase label header, then event rows with time + title, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderCalendarBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: CalendarBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const bodyX = x + metrics.pad;
  const bodyWidth = width - metrics.pad * 2;
  const bodyEnd = y + height - metrics.pad;

  if (bodyWidth <= 0) return;

  const events = config.events;
  if (!events || events.length === 0) {
    // Show "No events" placeholder
    if (cy + metrics.bodySize <= bodyEnd) {
      drawText(fb, bodyX, cy, 'No events', bodyWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
      cy += metrics.bodySize + metrics.pad;
    }
  } else {
    const rowHeight = metrics.bodySize + metrics.rowGap;

    for (const event of events) {
      if (cy + metrics.bodySize > bodyEnd) break;

      if (event.time) {
        // Draw time in GRAY_DARK, then title in default (black)
        const timeText = event.time;
        const { width: timeWidth } = drawText(
          fb,
          bodyX,
          cy,
          timeText,
          bodyWidth,
          GRAY_DARK,
          metrics.bodySize,
          metrics.weight,
        );
        const gap = metrics.bodyAdvance; // one 'M' width gap between time and title
        const titleX = bodyX + timeWidth + gap;
        const titleWidth = bodyWidth - timeWidth - gap;
        if (titleWidth > 0) {
          drawText(
            fb,
            titleX,
            cy,
            event.title,
            titleWidth,
            undefined,
            metrics.bodySize,
            metrics.weight,
          );
        }
      } else {
        // No time — just draw the title
        drawText(
          fb,
          bodyX,
          cy,
          event.title,
          bodyWidth,
          undefined,
          metrics.bodySize,
          metrics.weight,
        );
      }

      cy += rowHeight;
    }
  }
}
