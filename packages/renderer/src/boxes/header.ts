/**
 * Intent: Shared box-header renderer — type icon + the box's editor label.
 * Context: Called by every box renderer when showHeaders is enabled.
 * Pattern: Pure function — draws into the frame buffer, returns the y at which
 *   box content should begin (below the header).
 *
 * The icon is scaled to the body font size (and vertically aligned with the
 * label) so headers stay proportional at any font size, and the label is drawn
 * verbatim (its own case) — never uppercased.
 */

import type { LayoutBox } from '@infobento/core';
import type { FrameBuffer } from '../types.js';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawIconScaled, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { SOURCE_ICONS, SRC_ICON_SIZE } from '../icons.js';

export function drawBoxHeader(fb: FrameBuffer, layout: LayoutBox, metrics: FontMetrics): number {
  const { box, x, y, width } = layout;
  const pad = metrics.pad;
  const cy = y + pad;

  // Icon matches the font height; the gap to the label scales with it too.
  const iconSize = metrics.bodySize;
  const gap = Math.max(3, Math.round(metrics.bodySize * 0.3));

  let labelX = x + pad;
  const src = SOURCE_ICONS[box.type];
  if (src) {
    drawIconScaled(fb, x + pad, cy, src, SRC_ICON_SIZE, iconSize, GRAY_LIGHT);
    labelX = x + pad + iconSize + gap;
  }

  drawText(fb, labelX, cy, box.label, x + width - pad - labelX, GRAY_DARK, metrics.bodySize);

  return cy + metrics.bodySize + pad;
}
