/**
 * Intent: Render an air quality bento box — AQI number, category, pollutant, UV index
 * Context: Called by the main render() dispatcher for boxes with type 'aqi'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Pre-fetched AQIData from web API; falls back to "No data" when absent
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, AQIBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHeroText, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../hero-font.js';

/** Whitespace padding */
const PAD = 4;

/**
 * intent: Render a complete AQI bento box into the frame buffer
 * method: Icon + "AIR QUALITY" header, hero AQI, category, UV index, pollutant
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderAQIBox(fb: FrameBuffer, layout: LayoutBox, config: AQIBoxConfig): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  // Icon + uppercase label (5x7 font)
  const icon = BOX_ICONS['aqi'];
  if (icon) drawIcon(fb, x + PAD, cy, icon);
  const labelX = x + PAD + ICON_WIDTH + 3;
  drawText(fb, labelX, cy, 'AIR QUALITY', width - PAD * 2 - ICON_WIDTH - 3);
  cy += FONT_HEIGHT + PAD;

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;

  if (contentWidth <= 0) return;

  if (config.data) {
    cy = renderAQIData(
      fb,
      x + PAD,
      cy,
      contentWidth,
      contentEnd,
      config.data.aqi,
      config.data.category,
      config.data.dominantPollutant,
      config.data.uvIndex,
    );
  } else {
    cy = renderPlaceholder(fb, x + PAD, cy, contentWidth, contentEnd, config.city);
  }

  // Thin rule at bottom as section divider
  if (cy + 2 <= y + height) {
    drawHLine(fb, x + PAD, cy, width - PAD * 2);
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
): number {
  let cy = y;

  // Hero AQI number
  const aqiStr = String(aqi);
  drawHeroText(fb, x, cy, aqiStr, maxWidth);

  // Category beside hero text
  const heroWidth = aqiStr.length * HERO_CHAR_ADVANCE;
  const sideX = x + heroWidth + PAD;
  const sideMaxW = maxWidth - heroWidth - PAD;
  if (sideMaxW > 0) {
    drawTextWrapped(fb, sideX, cy + 2, category, sideMaxW, HERO_FONT_HEIGHT);
  }
  cy += HERO_FONT_HEIGHT + 2;

  if (cy + FONT_HEIGHT > maxY) return cy;

  // UV index + dominant pollutant
  const uvStr = uvIndex != null ? `UV:${String(Math.round(uvIndex))} ` : '';
  drawText(fb, x, cy, `${uvStr}${dominantPollutant}`, maxWidth);
  cy += FONT_HEIGHT + PAD;

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
): number {
  let cy = y;

  drawTextWrapped(fb, x, cy, city, maxWidth, maxY - cy);
  cy += FONT_HEIGHT + 2;

  if (cy + FONT_HEIGHT > maxY) return cy;

  drawText(fb, x, cy, 'No data', maxWidth);
  cy += FONT_HEIGHT + PAD;

  return cy;
}
