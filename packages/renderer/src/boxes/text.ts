/**
 * Intent: Render a text bento box — label header, thin rule, and wrapped text content
 * Context: Called by the main render() dispatcher for boxes with type 'text'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with no borders — matches hero font design language
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, TextBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { computeFontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/**
 * intent: Render a complete text bento box into the frame buffer
 * method: Uppercase label, thin rule divider, wrapped body text with whitespace padding
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderTextBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: TextBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  const labelGap = Math.round(metrics.bodySize * 0.2);
  let cy = y + metrics.pad;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['text'];
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
    cy += metrics.bodySize + labelGap + labelGap;
  }

  // Wrapped body text
  const bodyWidth = width - metrics.pad * 2;
  const bodyHeight = y + height - cy - metrics.pad;

  if (bodyHeight > 0 && bodyWidth > 0) {
    drawTextWrapped(
      fb,
      x + metrics.pad,
      cy,
      config.text,
      bodyWidth,
      bodyHeight,
      GRAY_DARK,
      metrics.bodySize,
    );
  }
}

/**
 * intent: Render a generic labeled box for types that don't have a renderer yet
 * method: Centered type label — placeholder until real renderer exists
 */
export function renderPlaceholderBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  metrics?: FontMetrics,
): void {
  const m = metrics ?? computeFontMetrics();
  const { x, y, width, height } = layout;

  // Center the type label
  const label = layout.box.type.toUpperCase();
  const labelWidth = label.length * m.bodyAdvance;
  const labelX = x + Math.floor((width - labelWidth) / 2);
  const labelY = y + Math.floor((height - m.bodySize) / 2);
  drawText(fb, labelX, labelY, label, width - 4, GRAY_DARK, m.bodySize);
}
