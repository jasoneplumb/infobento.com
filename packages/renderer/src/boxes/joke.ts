/**
 * Intent: Render a joke bento box — optional category header, wrapped joke text
 * Context: Called by the main render() dispatcher for boxes with type 'joke'
 * Pattern: Mirrors the quote/horoscope box layout — header line in light grey, body in dark
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, JokeBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawTextWrapped } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render a joke bento box into the frame buffer
 * method: Optional uppercase category header, wrapped joke text in dark grey
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderJokeBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: JokeBoxConfig,
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
  );
}
