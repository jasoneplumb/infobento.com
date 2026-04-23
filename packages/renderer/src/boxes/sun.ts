/**
 * Intent: Render a sun (sunrise/sunset) bento box — times and day length
 * Context: Called by the main render() dispatcher for boxes with type 'sun'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Pre-fetched SunData from web API; falls back to placeholder when absent
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, SunBoxConfig } from '@infobento/core';
import { drawText, drawTextWrapped, drawHeroText, drawHLine, drawIcon } from '../draw.js';
import { FONT_HEIGHT } from '../font.js';
import { BOX_ICONS, ICON_WIDTH } from '../icons.js';
import { HERO_FONT_HEIGHT, HERO_CHAR_ADVANCE } from '../hero-font.js';

/** Whitespace padding */
const PAD = 4;

/**
 * intent: Render a complete sun bento box into the frame buffer
 * method: Icon + "SUN" header, hero sunrise, sunset, day length; falls back to placeholder
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderSunBox(fb: FrameBuffer, layout: LayoutBox, config: SunBoxConfig): void {
  const { x, y, width, height } = layout;
  let cy = y + PAD;

  // Icon + uppercase label (5x7 font)
  const icon = BOX_ICONS['sun'];
  if (icon) drawIcon(fb, x + PAD, cy, icon);
  const labelX = x + PAD + ICON_WIDTH + 3;
  drawText(fb, labelX, cy, 'SUN', width - PAD * 2 - ICON_WIDTH - 3);
  cy += FONT_HEIGHT + PAD;

  const contentWidth = width - PAD * 2;
  const contentEnd = y + height - PAD;

  if (contentWidth <= 0) return;

  if (config.data) {
    cy = renderSunData(
      fb,
      x + PAD,
      cy,
      contentWidth,
      contentEnd,
      config.data.sunrise,
      config.data.sunset,
      config.data.dayLength,
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
 * intent: Render sun data — hero sunrise, sunset, day length
 * method: Hero sunrise time, sunset beside, day length below
 * returns: current Y position after rendering
 */
function renderSunData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  sunrise: string,
  sunset: string,
  dayLength: string,
): number {
  let cy = y;

  // Hero sunrise time
  const riseStr = sunrise.length > 5 ? sunrise.slice(0, 5) : sunrise;
  drawHeroText(fb, x, cy, riseStr, maxWidth);

  // "to" and sunset beside hero text
  const heroWidth = riseStr.length * HERO_CHAR_ADVANCE;
  const sideX = x + heroWidth + PAD;
  const sideMaxW = maxWidth - heroWidth - PAD;
  if (sideMaxW > 0) {
    drawText(fb, sideX, cy + 2, 'RISE', sideMaxW);
    const setStr = sunset.length > 5 ? sunset.slice(0, 5) : sunset;
    if (cy + 2 + FONT_HEIGHT + 3 + FONT_HEIGHT <= maxY) {
      drawText(fb, sideX, cy + 2 + FONT_HEIGHT + 3, setStr, sideMaxW);
    }
  }
  cy += HERO_FONT_HEIGHT + 2;

  if (cy + FONT_HEIGHT > maxY) return cy;

  // Day length
  drawText(fb, x, cy, `DAY: ${dayLength}`, maxWidth);
  cy += FONT_HEIGHT + PAD;

  return cy;
}

/**
 * intent: Render placeholder when sun data is not yet available
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
