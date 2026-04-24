/**
 * Intent: Render a quote bento box — wrapped quote text, author attribution, thin rule
 * Context: Called by the main render() dispatcher for boxes with type 'quote'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with no borders — body text + right-aligned author
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, QuoteBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHLine, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/** Whitespace padding */
const PAD = 16;

/**
 * intent: Render a complete quote bento box into the frame buffer
 * method: Uppercase label, wrapped quote text, right-aligned author, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderQuoteBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: QuoteBoxConfig,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['quote'];
    if (icon) drawIcon(fb, x + PAD, cy, icon, GRAY_LIGHT);
    const labelX = x + PAD + ICON_WIDTH + 3;
    drawText(fb, labelX, cy, layout.box.label.toUpperCase(), width - PAD * 2 - ICON_WIDTH - 3);
    cy += FONT_HEIGHT + PAD;
  }

  // Body area
  const bodyX = x + PAD;
  const bodyWidth = width - PAD * 2;
  const bodyEnd = y + height - PAD;

  if (bodyWidth <= 0) return;

  // Reserve space for author line if present
  const lineHeight = FONT_HEIGHT + 2; // 2px line spacing (matches drawTextWrapped)
  const authorHeight = config.author ? lineHeight + PAD : 0;
  const quoteMaxHeight = bodyEnd - cy - authorHeight;

  // Draw quote text wrapped in body area
  if (quoteMaxHeight > 0) {
    drawTextWrapped(fb, bodyX, cy, config.text, bodyWidth, quoteMaxHeight);
    cy += quoteMaxHeight;
  }

  // Draw author attribution right-aligned with "-- " prefix
  if (config.author) {
    cy += PAD;
    const authorText = `-- ${config.author}`;
    const authorWidth = authorText.length * CHAR_ADVANCE;
    const authorX = Math.max(bodyX, x + width - PAD - authorWidth);

    if (cy + FONT_HEIGHT <= bodyEnd) {
      drawText(fb, authorX, cy, authorText, bodyWidth);
      cy += FONT_HEIGHT + PAD;
    }
  }

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2, GRAY_DARK);
  }
}
