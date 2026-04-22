/**
 * Intent: Render a weather bento box — hero temperature, condition, high/low
 * Context: Called by the main render() dispatcher for boxes with type 'weather'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Whitespace-based layout with hero font for temperature
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, WeatherBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHeroText, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../hero-font.js';

/** Whitespace padding */
const PAD = 4;

/**
 * intent: Render a complete weather bento box into the frame buffer
 * method: Uppercase label, hero temperature, condition + high/low, thin rule
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderWeatherBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: WeatherBoxConfig,
): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  // Icon + uppercase label (5x7 font)
  const icon = BOX_ICONS['weather'];
  if (icon) drawIcon(fb, x + PAD, cy, icon);
  const labelX = x + PAD + ICON_WIDTH + 3;
  drawText(fb, labelX, cy, 'WEATHER', width - PAD * 2 - ICON_WIDTH - 3);
  cy += FONT_HEIGHT + PAD;

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;

  if (contentWidth <= 0) return;

  if (config.data) {
    cy = renderWeatherData(fb, x + PAD, cy, contentWidth, contentEnd, config);
  } else {
    cy = renderPlaceholder(fb, x + PAD, cy, contentWidth, contentEnd, config.city);
  }

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2);
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
): number {
  const data = config.data;
  if (!data) return y;
  let cy = y;

  // Hero temperature (e.g., "62F")
  const tempStr = `${Math.round(data.temperature)}F`;
  drawHeroText(fb, x, cy, tempStr, maxWidth);

  // Condition beside hero text (e.g., "Partly Cloudy")
  const heroWidth = tempStr.length * HERO_CHAR_ADVANCE;
  const condX = x + heroWidth + PAD + 2;
  const condMaxW = maxWidth - heroWidth - PAD - 2;
  if (condMaxW > 0) {
    drawTextWrapped(fb, condX, cy + 2, data.condition, condMaxW, HERO_FONT_HEIGHT);
  }
  cy += HERO_FONT_HEIGHT + 2;

  if (cy + FONT_HEIGHT > maxY) return cy;

  // High / Low (e.g., "H:68 L:55")
  const hlStr = `H:${Math.round(data.high)} L:${Math.round(data.low)}`;
  drawText(fb, x, cy, hlStr, maxWidth);
  cy += FONT_HEIGHT + PAD;

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
): number {
  let cy = y;

  // City name
  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy);
  cy += FONT_HEIGHT + 2;

  if (cy + FONT_HEIGHT > maxY) return cy;

  // "No data" indicator
  drawText(fb, x, cy, 'No data', maxWidth);
  cy += FONT_HEIGHT + PAD;

  return cy;
}
