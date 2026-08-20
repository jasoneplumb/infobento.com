/**
 * Intent: Render a UV index bento box — hero UV number with its WHO band label
 * Context: Called by the main render() dispatcher for boxes with type 'uv'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Pre-fetched UVData; falls back to "No data" when absent
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, UVBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawHeroText, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render a complete UV bento box into the frame buffer
 * method: Header, hero UV number with the band label beside it, city below
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderUVBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: UVBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) cy = drawBoxHeader(fb, layout, metrics);

  const contentWidth = width - metrics.pad * 2;
  const contentEnd = y + height - metrics.pad;
  const cx = x + metrics.pad;

  if (contentWidth <= 0) return;

  if (!config.data) {
    renderPlaceholder(fb, cx, cy, contentWidth, contentEnd, config.city, metrics);
    return;
  }

  const uvStr = String(config.data.uvIndex);
  drawHeroText(fb, cx, cy, uvStr, contentWidth, GRAY_DARK, metrics.heroSize, metrics.headingWeight);

  // Band label beside the hero number, wrapped — "Very High" needs two lines
  // in a narrow split box.
  const heroWidth = uvStr.length * metrics.heroAdvance;
  const sideX = cx + heroWidth + metrics.pad;
  const sideMaxW = contentWidth - heroWidth - metrics.pad;
  if (sideMaxW > 0) {
    drawTextWrapped(
      fb,
      sideX,
      cy + 2,
      config.data.category,
      sideMaxW,
      metrics.heroSize,
      undefined,
      metrics.bodySize,
      metrics.weight,
    );
  }
  cy += metrics.heroSize + 2;

  if (cy + metrics.bodySize > contentEnd) return;

  drawText(fb, cx, cy, config.city, contentWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
}

/**
 * intent: Render placeholder when the UV reading is not yet available
 * method: Show city name and "No data" in small text
 */
function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  city: string,
  metrics: FontMetrics,
): void {
  // drawTextWrapped returns the Y it advanced to. Assuming a single line
  // overdraws "No data" on top of a city name that wrapped — which is exactly
  // what a multi-word city in a narrow split box does.
  let cy = drawTextWrapped(
    fb,
    x,
    y,
    city,
    maxWidth,
    maxY - y,
    GRAY_LIGHT,
    metrics.bodySize,
    metrics.weight,
  );
  cy += 2;

  if (cy + metrics.bodySize > maxY) return;

  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
}
