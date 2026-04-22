/**
 * Intent: Render a text bento box — label header, thin rule, and wrapped text content
 * Context: Called by the main render() dispatcher for boxes with type 'text'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with no borders — matches hero font design language
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, TextBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/** Top padding before label */
const TOP_PAD = 4;

/** Gap between label and rule */
const LABEL_GAP = 4;

/**
 * intent: Render a complete text bento box into the frame buffer
 * method: Uppercase label, thin rule divider, wrapped body text with whitespace padding
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderTextBox(fb: FrameBuffer, layout: LayoutBox, config: TextBoxConfig): void {
  const { x, y, width, height } = layout;
  let cy = y + TOP_PAD;

  // Icon + uppercase label (5x7 font)
  const icon = BOX_ICONS['text'];
  if (icon) drawIcon(fb, x + TOP_PAD, cy, icon);
  const labelX = x + TOP_PAD + ICON_WIDTH + 3;
  drawText(fb, labelX, cy, layout.box.label.toUpperCase(), width - TOP_PAD * 2 - ICON_WIDTH - 3);
  cy += FONT_HEIGHT + LABEL_GAP;

  // Thin horizontal rule
  drawHLine(fb, x + TOP_PAD, cy, width - TOP_PAD * 2);
  cy += LABEL_GAP;

  // Wrapped body text
  const bodyWidth = width - TOP_PAD * 2;
  const bodyHeight = y + height - cy - TOP_PAD;

  if (bodyHeight > 0 && bodyWidth > 0) {
    drawTextWrapped(fb, x + TOP_PAD, cy, config.text, bodyWidth, bodyHeight);
  }
}

/**
 * intent: Render a generic labeled box for types that don't have a renderer yet
 * method: Centered type label — placeholder until real renderer exists
 */
export function renderPlaceholderBox(fb: FrameBuffer, layout: LayoutBox): void {
  const { x, y, width, height } = layout;

  // Center the type label
  const label = layout.box.type.toUpperCase();
  const labelWidth = label.length * CHAR_ADVANCE;
  const labelX = x + Math.floor((width - labelWidth) / 2);
  const labelY = y + Math.floor((height - FONT_HEIGHT) / 2);
  drawText(fb, labelX, labelY, label, width - 4);
}
