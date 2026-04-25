/**
 * Intent: Render a weather bento box — hero temperature, condition, high/low
 * Context: Called by the main render() dispatcher for boxes with type 'weather'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with hero font for temperature
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, WeatherBoxConfig } from '@infobento/core';
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
 * intent: Render a complete weather bento box into the frame buffer
 * method: Uppercase label, hero temperature, condition + high/low, thin rule
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderWeatherBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: WeatherBoxConfig,
  metrics: FontMetrics,
  showHeaders = true,
): void {
  const { x, y, width, height } = layout;
  let cy = y + metrics.pad;

  if (showHeaders) {
    // Icon + uppercase label (5x7 font)
    const icon = BOX_ICONS['weather'];
    if (icon) drawIcon(fb, x + metrics.pad, cy, icon, GRAY_LIGHT);
    const labelX = x + metrics.pad + ICON_WIDTH + 3;
    const headerText = config.city ? `${config.city.toUpperCase()}` : 'WEATHER';
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
    cy = renderWeatherData(fb, x + metrics.pad, cy, contentWidth, contentEnd, config, metrics);
  } else {
    cy = renderPlaceholder(fb, x + metrics.pad, cy, contentWidth, contentEnd, config.city, metrics);
  }
}

/**
 * intent: Render weather data — hero temperature, condition beside, H/L below
 * method: Hero temp with condition text beside it, high/low on its own line
 * returns: current Y position after rendering
 */
function renderWeatherData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  config: WeatherBoxConfig,
  metrics: FontMetrics,
): number {
  const data = config.data;
  if (!data) return y;
  let cy = y;

  // Hero temperature (e.g., "62F")
  const tempStr = `${Math.round(data.temperature)}F`;
  drawHeroText(fb, x, cy, tempStr, maxWidth, GRAY_DARK, metrics.heroSize);

  // Condition beside hero text (e.g., "Partly Cloudy")
  const heroWidth = tempStr.length * metrics.heroAdvance;
  const condX = x + heroWidth + metrics.pad + 2;
  const condMaxW = maxWidth - heroWidth - metrics.pad - 2;
  if (condMaxW > 0) {
    drawTextWrapped(
      fb,
      condX,
      cy + 2,
      data.condition,
      condMaxW,
      metrics.heroSize,
      undefined,
      metrics.bodySize,
    );
  }
  cy += metrics.heroSize + 2;

  if (cy + metrics.bodySize > maxY) return cy;

  // High / Low (e.g., "H:68 L:55")
  const hlStr = `H:${Math.round(data.high)} L:${Math.round(data.low)}`;
  drawText(fb, x, cy, hlStr, maxWidth, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + metrics.pad;

  return cy;
}

/**
 * intent: Render placeholder when weather data is not yet available
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

  // City name
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + 2;

  if (cy + metrics.bodySize > maxY) return cy;

  // "No data" indicator
  drawText(fb, x, cy, 'No data', maxWidth, GRAY_LIGHT, metrics.bodySize);
  cy += metrics.bodySize + metrics.pad;

  return cy;
}
