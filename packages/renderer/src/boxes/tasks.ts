/**
 * Intent: Render a tasks/checklist bento box — header, checkbox items, thin rule
 * Context: Called by the main render() dispatcher for boxes with type 'tasks'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Checkbox squares with done/pending state, dimmed text for completed items
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, TasksBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawIcon, setPixel, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/**
 * intent: Render a complete tasks bento box into the frame buffer
 * method: Uppercase label header, checkboxes with text per item, thin rule divider
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderTasksBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: TasksBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) {
    const icon = BOX_ICONS['tasks'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    drawText(
      fb,
      labelX,
      cy,
      layout.box.label.toUpperCase(),
      width - metrics.pad * 2 - ICON_WIDTH - 3,
      undefined,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }

  const bodyX = x + metrics.pad;
  const bodyWidth = width - metrics.pad * 2;
  const bodyEnd = y + height - metrics.pad;
  const cbSize = Math.round(metrics.bodySize * 0.6);
  const textX = bodyX + cbSize + Math.round(metrics.pad * 0.5);
  const textMaxWidth = bodyWidth - cbSize - Math.round(metrics.pad * 0.5);

  if (bodyWidth <= 0 || textMaxWidth <= 0) return;

  for (const item of config.items) {
    if (cy + metrics.bodySize > bodyEnd) break;

    // Vertically center the checkbox relative to the text line
    const cbY = cy + Math.round((metrics.bodySize - cbSize) / 2);
    const cbX = bodyX;

    // Draw checkbox outline
    for (let px = cbX; px < cbX + cbSize; px++) {
      setPixel(fb, px, cbY);
      setPixel(fb, px, cbY + cbSize - 1);
    }
    for (let py = cbY; py < cbY + cbSize; py++) {
      setPixel(fb, cbX, py);
      setPixel(fb, cbX + cbSize - 1, py);
    }

    // Fill interior if done
    if (item.done) {
      for (let py = cbY + 2; py < cbY + cbSize - 2; py++) {
        for (let px = cbX + 2; px < cbX + cbSize - 2; px++) {
          setPixel(fb, px, py);
        }
      }
    }

    // Draw task text — dimmed for done items
    const level = item.done ? GRAY_LIGHT : undefined;
    drawText(fb, textX, cy, item.text, textMaxWidth, level, metrics.bodySize);

    cy += metrics.bodyLineHeight;
  }
}
