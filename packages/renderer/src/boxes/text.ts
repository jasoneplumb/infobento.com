/**
 * Intent: Render a text bento box — border, label header, and wrapped text content
 * Context: Called by the main render() dispatcher for boxes with type 'text'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Future: Support center alignment, bold labels
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, TextBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText, drawTextWrapped } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';

/** Padding inside the box border */
const INNER_PAD = 2;

/** Height reserved for the label header (font + padding) */
const HEADER_HEIGHT = FONT_HEIGHT + INNER_PAD * 2;

/**
 * intent: Render a complete text bento box into the frame buffer
 * method: Draw border, render label in header area, render wrapped text in body
 * effect: Fills the allocated LayoutBox region with bordered text content
 */
export function renderTextBox(fb: FrameBuffer, layout: LayoutBox, config: TextBoxConfig): void {
  const { x, y, width, height } = layout;

  // Draw box border
  drawRect(fb, x, y, width, height);

  // Draw label in header area (bold-ish: uppercase)
  const labelY = y + INNER_PAD;
  const labelX = x + INNER_PAD + 1;
  drawText(fb, labelX, labelY, layout.box.label.toUpperCase(), width - INNER_PAD * 2 - 2);

  // Draw dotted divider line below header
  const dividerY = y + HEADER_HEIGHT;
  for (let dx = x + 1; dx < x + width - 1; dx++) {
    if (dx % 2 === 0) setPixel(fb, dx, dividerY);
  }

  // Draw text content in body area
  const bodyX = x + INNER_PAD + 1;
  const bodyY = dividerY + INNER_PAD + 1;
  const bodyWidth = width - INNER_PAD * 2 - 2;
  const bodyHeight = height - HEADER_HEIGHT - INNER_PAD - 2;

  if (bodyHeight > 0 && bodyWidth > 0) {
    drawTextWrapped(fb, bodyX, bodyY, config.text, bodyWidth, bodyHeight);
  }
}

/**
 * intent: Render a generic labeled box for types that don't have a renderer yet
 * method: Draw border and centered type label — placeholder until real renderer exists
 */
export function renderPlaceholderBox(fb: FrameBuffer, layout: LayoutBox): void {
  const { x, y, width, height } = layout;
  drawRect(fb, x, y, width, height);

  // Center the type label
  const label = layout.box.type.toUpperCase();
  const labelWidth = label.length * CHAR_ADVANCE;
  const labelX = x + Math.floor((width - labelWidth) / 2);
  const labelY = y + Math.floor((height - FONT_HEIGHT) / 2);
  drawText(fb, labelX, labelY, label, width - 4);
}
