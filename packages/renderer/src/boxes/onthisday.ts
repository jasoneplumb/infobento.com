/**
 * Intent: Render an "On This Day" bento box — year + category header, wrapped event text
 * Context: Called by the main render() dispatcher for boxes with type 'onthisday'
 * Pattern: Mirrors the quote/horoscope/joke layout — header line in light grey, body in dark
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, OnThisDayBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawTextWrapped } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render an On This Day bento box into the frame buffer
 * method: Optional uppercase header (year · category for events/births/deaths,
 *         category alone for holidays), wrapped body text in dark grey
 */
export function renderOnThisDayBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: OnThisDayBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const bodyX = x + metrics.pad;
  const bodyWidth = width - metrics.pad * 2;
  const bodyEnd = y + height - metrics.pad;
  const bodyMaxHeight = bodyEnd - cy;

  if (bodyWidth <= 0 || bodyMaxHeight <= 0) return;

  drawTextWrapped(
    fb,
    bodyX,
    cy,
    config.text,
    bodyWidth,
    bodyMaxHeight,
    undefined,
    metrics.bodySize,
    metrics.weight,
  );
}
