/**
 * Intent: Render a weather bento box — border, label header, temperature, condition, high/low
 * Context: Called by the main render() dispatcher for boxes with type 'weather'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Future: Add weather condition icons, hero-sized temperature font
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, WeatherBoxConfig } from '@infobento/core';
import { setPixel, drawRect, drawText, drawTextWrapped } from '../draw.js';
import { FONT_HEIGHT, CHAR_ADVANCE } from '../font.js';

/** Padding inside the box border */
const INNER_PAD = 2;

/** Height reserved for the label header (font + padding) */
const HEADER_HEIGHT = FONT_HEIGHT + INNER_PAD * 2;

/** Line height for body text rows */
const LINE_HEIGHT = FONT_HEIGHT + 2;

/**
 * intent: Render a complete weather bento box into the frame buffer
 * method: Draw border, label header, then either weather data or placeholder
 * effect: Fills the allocated LayoutBox region with weather content
 */
export function renderWeatherBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: WeatherBoxConfig,
): void {
  const { x, y, width, height } = layout;

  // Draw box border
  drawRect(fb, x, y, width, height);

  // Draw label in header area (uppercase)
  const labelY = y + INNER_PAD;
  const labelX = x + INNER_PAD + 1;
  drawText(fb, labelX, labelY, layout.box.label.toUpperCase(), width - INNER_PAD * 2 - 2);

  // Draw dotted divider line below header
  const dividerY = y + HEADER_HEIGHT;
  for (let dx = x + 1; dx < x + width - 1; dx++) {
    if (dx % 2 === 0) setPixel(fb, dx, dividerY);
  }

  // Body area dimensions
  const bodyX = x + INNER_PAD + 1;
  const bodyY = dividerY + INNER_PAD + 1;
  const bodyWidth = width - INNER_PAD * 2 - 2;
  const bodyHeight = height - HEADER_HEIGHT - INNER_PAD - 2;

  if (bodyHeight <= 0 || bodyWidth <= 0) return;

  if (config.data) {
    renderWeatherData(fb, bodyX, bodyY, bodyWidth, bodyHeight, config);
  } else {
    renderPlaceholder(fb, bodyX, bodyY, bodyWidth, bodyHeight, config.city);
  }
}

/**
 * intent: Render weather data — temperature prominent, condition + high/low below
 * method: Temperature on first line, condition on second, H/L on third
 */
function renderWeatherData(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  config: WeatherBoxConfig,
): void {
  // Caller guarantees config.data is present — guard for safety
  const data = config.data;
  if (!data) return;
  let cy = y;

  // Temperature — prominent display (e.g., "72F")
  const tempStr = `${Math.round(data.temperature)}F`;
  drawText(fb, x, cy, tempStr, maxWidth);
  cy += LINE_HEIGHT;

  if (cy + FONT_HEIGHT > y + maxHeight) return;

  // Condition (e.g., "Partly Cloudy")
  drawTextWrapped(fb, x, cy, data.condition, maxWidth, maxHeight - (cy - y));
  // Estimate lines used by condition text
  const condWidth = data.condition.length * CHAR_ADVANCE;
  const condLines = Math.max(1, Math.ceil(condWidth / maxWidth));
  cy += LINE_HEIGHT * condLines;

  if (cy + FONT_HEIGHT > y + maxHeight) return;

  // High / Low (e.g., "H:78 L:62")
  const hlStr = `H:${Math.round(data.high)} L:${Math.round(data.low)}`;
  drawText(fb, x, cy, hlStr, maxWidth);
}

/**
 * intent: Render placeholder when weather data is not yet available
 * method: Show city name and "No data" message
 */
function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  city: string,
): void {
  let cy = y;

  // City name
  drawTextWrapped(fb, x, cy, city, maxWidth, maxHeight);
  cy += LINE_HEIGHT;

  if (cy + FONT_HEIGHT > y + maxHeight) return;

  // "No data" indicator
  drawText(fb, x, cy, 'No data', maxWidth);
}
