/**
 * Intent: Render a quote bento box — border, label header, wrapped quote text, optional author
 * Context: Called by the main render() dispatcher for boxes with type 'quote'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Future: Italic font for quotes, decorative quotation marks
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, QuoteBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText, drawTextWrapped } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';

/** Padding inside the box border */
const INNER_PAD = 2;

/** Height reserved for the label header (font + padding) */
const HEADER_HEIGHT = FONT_HEIGHT + INNER_PAD * 2;

/**
 * intent: Render a complete quote bento box into the frame buffer
 * method: Draw border, render label in header area, render wrapped quote text in body,
 *         optionally render right-aligned author attribution below
 * effect: Fills the allocated LayoutBox region with bordered quote content
 */
export function renderQuoteBox(fb: FrameBuffer, layout: LayoutBox, config: QuoteBoxConfig): void {
  const { x, y, width, height } = layout;

  // Draw box border
  drawRect(fb, x, y, width, height);

  // Draw label in header area (uppercase for consistency with other boxes)
  const labelY = y + INNER_PAD;
  const labelX = x + INNER_PAD + 1;
  drawText(fb, labelX, labelY, layout.box.label.toUpperCase(), width - INNER_PAD * 2 - 2);

  // Draw dotted divider line below header
  const dividerY = y + HEADER_HEIGHT;
  for (let dx = x + 1; dx < x + width - 1; dx++) {
    if (dx % 2 === 0) setPixel(fb, dx, dividerY);
  }

  // Body area below divider
  const bodyX = x + INNER_PAD + 1;
  const bodyY = dividerY + INNER_PAD + 1;
  const bodyWidth = width - INNER_PAD * 2 - 2;
  const bodyHeight = height - HEADER_HEIGHT - INNER_PAD - 2;

  if (bodyHeight <= 0 || bodyWidth <= 0) return;

  // Reserve space for author line if present
  const lineHeight = FONT_HEIGHT + 2; // 2px line spacing (matches drawTextWrapped)
  const authorHeight = config.author ? lineHeight : 0;
  const quoteHeight = bodyHeight - authorHeight;

  // Draw quote text wrapped in body area
  if (quoteHeight > 0) {
    drawTextWrapped(fb, bodyX, bodyY, config.text, bodyWidth, quoteHeight);
  }

  // Draw author attribution right-aligned below quote text
  if (config.author) {
    const authorText = `-- ${config.author}`;
    const authorWidth = authorText.length * CHAR_ADVANCE;
    const authorX = Math.max(bodyX, x + width - INNER_PAD - 1 - authorWidth);
    const authorY = bodyY + quoteHeight;

    if (authorY + FONT_HEIGHT <= y + height - 1) {
      drawText(fb, authorX, authorY, authorText, bodyWidth);
    }
  }
}
