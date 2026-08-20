/**
 * Intent: Render a pollen bento box — worst-risk allergen, its grain count, and
 *         the EAN risk band
 * Context: Called by the main render() dispatcher for boxes with type 'pollen'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Three distinct states, because conflating them would mislead a
 *   sufferer: a reading, a genuine all-clear ("None detected"), and no coverage
 *   at all ("No data"). Open-Meteo serves pollen in Europe during season only.
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, PollenBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawHeroText, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';

/**
 * intent: Render a complete pollen bento box into the frame buffer
 * method: Header, hero grain count with the risk band beside it, allergen and
 *   city below
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderPollenBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: PollenBoxConfig,
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

  // Out of coverage — say nothing rather than imply an all-clear.
  if (!config.data) {
    renderTwoLine(fb, cx, cy, contentWidth, contentEnd, config.city, 'No data', metrics);
    return;
  }

  // In coverage, everything reading zero. A hero "0" would look like a failed
  // fetch, so state the all-clear in words.
  if (config.data.allergen === 'None') {
    renderTwoLine(fb, cx, cy, contentWidth, contentEnd, 'None detected', config.city, metrics);
    return;
  }

  const countStr = String(config.data.count);
  drawHeroText(
    fb,
    cx,
    cy,
    countStr,
    contentWidth,
    GRAY_DARK,
    metrics.heroSize,
    metrics.headingWeight,
  );

  const heroWidth = countStr.length * metrics.heroAdvance;
  const sideX = cx + heroWidth + metrics.pad;
  const sideMaxW = contentWidth - heroWidth - metrics.pad;
  if (sideMaxW > 0) {
    drawTextWrapped(
      fb,
      sideX,
      cy + 2,
      config.data.level,
      sideMaxW,
      metrics.heroSize,
      undefined,
      metrics.bodySize,
      metrics.weight,
    );
  }
  cy += metrics.heroSize + 2;

  if (cy + metrics.bodySize > contentEnd) return;

  drawText(
    fb,
    cx,
    cy,
    `${config.data.allergen} · ${config.city}`,
    contentWidth,
    GRAY_LIGHT,
    metrics.bodySize,
    metrics.weight,
  );
}

/**
 * intent: Render the two non-numeric states (no coverage, all-clear)
 * method: A wrapped primary line with a small secondary line beneath
 */
function renderTwoLine(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  primary: string,
  secondary: string,
  metrics: FontMetrics,
): void {
  // drawTextWrapped returns the height it consumed, NOT an absolute row — so
  // it has to be added to `y`. Assuming a single line overdraws the secondary
  // line on top of a primary that wrapped, which is exactly what a multi-word
  // city in a narrow split box does; using the delta as an absolute Y paints it
  // into a different box entirely for any pollen box not anchored at y = 0.
  let cy =
    y +
    drawTextWrapped(
      fb,
      x,
      y,
      primary,
      maxWidth,
      maxY - y,
      GRAY_LIGHT,
      metrics.bodySize,
      metrics.weight,
    );
  cy += 2;

  if (cy + metrics.bodySize > maxY) return;

  drawText(fb, x, cy, secondary, maxWidth, GRAY_LIGHT, metrics.bodySize, metrics.weight);
}
