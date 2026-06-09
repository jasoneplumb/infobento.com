/**
 * Intent: Render a horoscope bento box — sign + date header, wrapped reading body
 * Context: Called by the main render() dispatcher for boxes with type 'horoscope'
 * Pattern: Mirrors the quote box layout — header line in light grey, wrapped body in dark
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, HoroscopeBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawTextWrapped } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render a horoscope bento box into the frame buffer
 * method: Optional uppercase header (sign · date), wrapped reading body in dark grey
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderHoroscopeBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: HoroscopeBoxConfig,
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
