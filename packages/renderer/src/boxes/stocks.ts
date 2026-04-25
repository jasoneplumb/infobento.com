/**
 * Intent: Render a stocks bento box — ticker symbol, price, and change
 * Context: Called by the main render() dispatcher for boxes with type 'stocks'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Header with icon, hero symbol, price in hero font, change line in body font
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, StocksBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawHeroText, drawIcon, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/**
 * intent: Format a price change with sign prefix and percentage
 * method: Prefix with + or - (negative already has -), format to 2 decimal places
 */
function formatChange(change: number, changePercent: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}

/**
 * intent: Render a complete stocks bento box into the frame buffer
 * method: Icon + label header, hero symbol, hero price, change line, bottom rule
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderStocksBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: StocksBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  // Header: icon + label
  if (showHeaders) {
    const icon = BOX_ICONS['stocks'];
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

  // Hero symbol (e.g. "AAPL")
  drawHeroText(fb, x + metrics.pad, cy, config.symbol, undefined, GRAY_DARK, metrics.heroSize);
  cy += metrics.heroSize + 2;

  if (config.data) {
    // Price in hero font
    const priceStr = config.data.price.toFixed(2);
    if (cy + metrics.heroSize <= y + height - metrics.pad) {
      drawHeroText(fb, x + metrics.pad, cy, priceStr, undefined, GRAY_DARK, metrics.heroSize);
      cy += metrics.heroSize + 4;
    }

    // Change line in body font
    const changeStr = formatChange(config.data.change, config.data.changePercent);
    if (cy + metrics.bodySize <= y + height - metrics.pad) {
      drawText(
        fb,
        x + metrics.pad,
        cy,
        changeStr,
        width - metrics.pad * 2,
        GRAY_LIGHT,
        metrics.bodySize,
      );
      cy += metrics.bodySize + metrics.pad;
    }
  } else {
    // No data available
    if (cy + metrics.bodySize <= y + height - metrics.pad) {
      drawText(
        fb,
        x + metrics.pad,
        cy,
        'No data',
        width - metrics.pad * 2,
        GRAY_LIGHT,
        metrics.bodySize,
      );
      cy += metrics.bodySize + metrics.pad;
    }
  }
}
