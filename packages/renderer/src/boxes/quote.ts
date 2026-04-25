/**
 * Intent: Render a quote bento box — wrapped quote text, author attribution, thin rule
 * Context: Called by the main render() dispatcher for boxes with type 'quote'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with no borders — body text + right-aligned author
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, QuoteBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/**
 * intent: Render a complete quote bento box into the frame buffer
 * method: Uppercase label, wrapped quote text, right-aligned author, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderQuoteBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: QuoteBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['quote'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    drawText(
      fb,
      labelX,
      cy,
      layout.box.label.toUpperCase(),
      width - metrics.pad * 2 - ICON_WIDTH - 3,
      GRAY_DARK,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }

  // Body area
  const bodyX = x + metrics.pad;
  const bodyWidth = width - metrics.pad * 2;
  const bodyEnd = y + height - metrics.pad;
  const bodyMaxHeight = bodyEnd - cy;

  if (bodyWidth <= 0 || bodyMaxHeight <= 0) return;

  // Quote text in black
  const usedHeight = drawTextWrapped(
    fb,
    bodyX,
    cy,
    config.text,
    bodyWidth,
    bodyMaxHeight,
    undefined,
    metrics.bodySize,
  );
  cy += usedHeight;

  // Author attribution in light grey on the next line
  if (config.author && cy + metrics.bodySize <= bodyEnd) {
    drawText(fb, bodyX, cy, `\u2014 ${config.author}`, bodyWidth, GRAY_LIGHT, metrics.bodySize);
  }
}
