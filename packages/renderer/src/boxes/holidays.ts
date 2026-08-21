/**
 * Intent: Render a public holidays bento box — hero day count with the
 *   holiday name below
 * Context: Called by the main render() dispatcher for boxes with type 'holidays'
 * Pattern: Pure function — reads LayoutBox + config, draws into frame buffer
 * Design: Countdown is derived at render time from the stored ISO date, so a
 *   cached payload never bakes in a stale "in N days" value.
 */

import type { FrameBuffer } from '../index.js';
import type { LayoutBox, HolidaysBoxConfig } from '@infobento/core';
import type { FontMetrics } from '../font-metrics.js';
import { drawText, drawTextWrapped, drawHeroText, GRAY_DARK, GRAY_LIGHT } from '../draw.js';
import { drawBoxHeader } from './header.js';
import { daysUntilLocalMidnight } from '../days-until.js';

/**
 * Days from today until an ISO date, 0 when today, past, or unparseable.
 *
 * Kept as a named re-export: the countdown box needs the identical calculation,
 * so the implementation lives in days-until.js to stop the two from drifting
 * (they already had — this one rounded, countdown's floored via ceil).
 *
 * Timezone limitation: both midnights are server-local. Rendering happens on
 * the API host, so on a UTC server a device in New York sees "Today" from about
 * 7 pm the previous evening. The date box takes an explicit UTC offset in its
 * config; holidays does not yet. Fixing it means threading utcOffsetMinutes
 * through HolidaysBoxConfig and shifting `target` to device-local midnight.
 */
export function daysUntilHoliday(isoDate: string, now: Date = new Date()): number {
  return daysUntilLocalMidnight(isoDate, now);
}

/**
 * intent: Render a complete public holidays bento box into the frame buffer
 * method: Header, hero day count with "days" beside it, holiday name below.
 *   When days === 0 the hero reads "Today". No data shows the country code
 *   and a "No data" line.
 * effect: Fills the allocated LayoutBox region without borders
 */
export function renderHolidaysBox(
  fb: FrameBuffer,
  layout: LayoutBox,
  config: HolidaysBoxConfig,
  metrics: FontMetrics,
  now?: Date,
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
    // Uppercase here: the schema accepts "gb" (every consumer normalises before
    // use), so without this the placeholder is the one place a lowercase code
    // would be shown to the user verbatim.
    renderPlaceholder(
      fb,
      cx,
      cy,
      contentWidth,
      contentEnd,
      config.countryCode.toUpperCase(),
      metrics,
    );
    return;
  }

  const days = daysUntilHoliday(config.data.date, now);

  // drawHeroText takes a maxWidth but no maxHeight — it blits unconditionally —
  // so the caller has to bound it. Without this a box shorter than heroSize
  // paints the hero over whatever sits beneath it. Skip the hero when it will
  // not fit and let the name below still render.
  const heroFits = cy + metrics.heroSize <= contentEnd;

  // When the hero does not fit it is skipped entirely (drawHeroText has no
  // maxHeight and blits unconditionally); the name below still renders.
  if (heroFits && days === 0) {
    drawHeroText(
      fb,
      cx,
      cy,
      'Today',
      contentWidth,
      GRAY_DARK,
      metrics.heroSize,
      metrics.headingWeight,
    );
  } else if (heroFits) {
    const daysStr = String(days);
    drawHeroText(
      fb,
      cx,
      cy,
      daysStr,
      contentWidth,
      GRAY_DARK,
      metrics.heroSize,
      metrics.headingWeight,
    );

    // Approximation: assumes every digit is heroAdvance wide, so a wide-glyph
    // count (e.g. "127") can tuck the "days" label against the last digit. The
    // other hero boxes with a side label share this; drawHeroText would need to
    // return its true advance width to do better.
    const heroWidth = daysStr.length * metrics.heroAdvance;
    const sideX = cx + heroWidth + metrics.pad;
    const sideMaxW = contentWidth - heroWidth - metrics.pad;
    if (sideMaxW > 0) {
      drawText(fb, sideX, cy + 4, 'days', sideMaxW, GRAY_LIGHT, metrics.bodySize, metrics.weight);
    }
  }
  // Only advance past the hero if one was drawn; otherwise this would push cy
  // beyond contentEnd and skip the name too, defeating the fall-through above.
  if (heroFits) cy += metrics.heroSize + 2;

  if (cy + metrics.bodySize > contentEnd) return;

  // GRAY_DARK, not the drawText default of GRAY_BLACK: the default renders the
  // name darker than the GRAY_DARK hero above it, inverting the hierarchy.
  drawText(fb, cx, cy, config.data.name, contentWidth, GRAY_DARK, metrics.bodySize, metrics.weight);
}

/**
 * intent: Render placeholder when no holiday data has been fetched yet
 * method: Country code and "No data" in small text, using the same
 *   absolute-Y pattern as uv.ts to avoid overdraw when y > 0
 */
function renderPlaceholder(
  fb: FrameBuffer,
  x: number,
  y: number,
  maxWidth: number,
  maxY: number,
  countryCode: string,
  metrics: FontMetrics,
): void {
  // drawTextWrapped blits its first line before testing the height bound, so a
  // box with no room for even one line still gets painted. Guard at the call
  // site — the shared helper's behaviour is relied on by every other box type.
  if (y + metrics.bodySize > maxY) return;

  let cy =
    y +
    drawTextWrapped(
      fb,
      x,
      y,
      countryCode,
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
