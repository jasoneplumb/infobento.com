/**
 * Intent: Render an air quality bento box — AQI number, category, pollutant, UV index
 * Context: Called by the main render() dispatcher for boxes with type 'aqi'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Pre-fetched AQIData from web API; falls back to "No data" when absent
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, AQIBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import {
  drawText,
  drawTextWrapped,
  drawHeroText,
  drawIcon,
  GRAY_DARK,
  GRAY_LIGHT,
} from '../draw.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';

/**
 * intent: Render a complete AQI bento box into the frame buffer
 * method: Icon + "AIR QUALITY" header, hero AQI, category, UV index, pollutant
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderAQIBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: AQIBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['aqi'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()} AQI` : 'AIR QUALITY';
    drawText(
      fb,
      labelX,
      cy,
      headerText,
      width - metrics.pad * 2 - ICON_WIDTH - 3,
      GRAY_DARK,
      metrics.bodySize,
    );
    cy += metrics.bodySize + metrics.pad;
  }

  const contentWidth = width - metrics.pad * 2;
  const contentEnd = y + height - metrics.pad;

  if (contentWidth <= 0) return;

  if (config.data) {
    cy = renderAQIData(
      fb,
      x + metrics.pad,
      cy,
      contentWidth,
      contentEnd,
      config.data.aqi,
      config.data.category,
      config.data.dominantPollutant,
      config.data.uvIndex,
      metrics,
    );
  } else {
    cy = renderPlaceholder(fb, x + metrics.pad, cy, contentWidth, contentEnd, config.city, metrics);
  }
}

/**
 * intent: Render AQI data — hero AQI number, category label, UV and pollutant below
 * method: Hero AQI with category text beside it, details below
 * returns: current Y position after rendering
 */
function renderAQIData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  aqi: number,
  category: string,
  dominantPollutant: string,
  uvIndex: number | undefined,
  metrics: FontMetrics,
): number {
  let cy = y;

  // Hero AQI number
  const aqiStr = String(aqi);
  drawHeroText(fb, x, cy, aqiStr, maxWidth, GRAY_DARK, metrics.heroSize);

  // Category beside hero text
  const heroWidth = aqiStr.length * metrics.heroAdvance;
  const sideX = x + heroWidth + metrics.pad;
  const sideMaxW = maxWidth - heroWidth - metrics.pad;
  if (sideMaxW > 0) {
    drawTextWrapped(
      fb,
      sideX,
      cy + 2,
      category,
      sideMaxW,
      metrics.heroSize,
      undefined,
      metrics.bodySize,
    );
  }
  cy += metrics.heroSize + 2;

  if (cy + metrics.bodySize > maxY) return cy;

  // UV index + dominant pollutant
  const uvStr = uvIndex != null ? `UV:${String(Math.round(uvIndex))} ` : '';
  drawText(fb, x, cy, `${uvStr}${dominantPollutant}`, maxWidth, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + metrics.pad;

  return cy;
}

/**
 * intent: Render placeholder when AQI data is not yet available
 * method: Show city name and "No data" in small text
 * returns: current Y position after rendering
 */
function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  city: string,
  metrics: FontMetrics,
): number {
  let cy = y;

  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + 2;

  if (cy + metrics.bodySize > maxY) return cy;

  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + metrics.pad;

  return cy;
}
