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

  if (bodyWidth <= 0) return;

  // Reserve space for author line if present
  const lineHeight = metrics.bodySize + 2; // 2px line spacing (matches drawTextWrapped)
  const authorHeight = config.author ? lineHeight + metrics.pad : 0;
  const quoteMaxHeight = bodyEnd - cy - authorHeight;

  // Draw quote text wrapped in body area
  if (quoteMaxHeight > 0) {
    const usedHeight = drawTextWrapped(
      fb,
      bodyX,
      cy,
      config.text,
      bodyWidth,
      quoteMaxHeight,
      undefined,
      metrics.bodySize,
    );
    cy += usedHeight;
  }

  // Draw author attribution right-aligned with "-- " prefix
  if (config.author) {
    cy += metrics.pad;
    const authorText = `-- ${config.author}`;
    const authorWidth = authorText.length * metrics.bodyAdvance;
    const authorX = Math.max(bodyX, x + width - metrics.pad - authorWidth);

    if (cy + metrics.bodySize <= bodyEnd) {
      drawText(fb, authorX, cy, authorText, bodyWidth, GRAY_LIGHT, metrics.bodySize);
      cy += metrics.bodySize + metrics.pad;
    }
  }
}
