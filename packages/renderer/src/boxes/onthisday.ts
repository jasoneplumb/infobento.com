/**
 * Intent: Render an "On This Day" bento box — year + category header, wrapped event text
 * Context: Called by the main render() dispatcher for boxes with type 'onthisday'
 * Pattern: Mirrors the quote/horoscope/joke layout — header line in light grey, body in dark
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, OnThisDayBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

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

  if (showHeaders) {
    const icon = BOX_ICONS['onthisday'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    const cat = config.category ? config.category.toUpperCase() : layout.box.label.toUpperCase();
    const headerLabel = config.year ? `${config.year} \u00b7 ${cat}` : cat;
    drawText(
      fb,
      labelX,
      cy,
      headerLabel,
      width - metrics.pad * 2 - ICON_WIDTH - 3,
      GRAY_DARK,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }

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
