/**
 * Intent: Dynamic font metrics computed from a user-chosen body font size
 * Context: Replaces hardcoded FONT_HEIGHT / CHAR_ADVANCE / HERO_* constants
 * Pattern: Pure factory function — compute once per render(), thread to box renderers
 */

import { measureText, snapWeight, headingWeight, DEFAULT_BODY_WEIGHT } from './ttf-font.js';

/** Default body font size in pixels (matches the original hardcoded BODY_FONT_SIZE) */
export const DEFAULT_FONT_SIZE = 20;

/** Computed font metrics and proportional spacing for a given body font size */
export interface FontMetrics {
  /** Body text size in pixels (user-chosen, 8-24) */
  readonly bodySize: number;
  /** Body text line height (bodySize * 1.3) */
  readonly bodyLineHeight: number;
  /** Body 'M' advance width — used for column calculations */
  readonly bodyAdvance: number;
  /** Body text weight (snapped Inter static weight 100–900) */
  readonly weight: number;
  /** Heading/hero weight — body weight +3 steps, clamped to 900 */
  readonly headingWeight: number;
  /** Hero/heading text size in pixels (bodySize * 2.6) */
  readonly heroSize: number;
  /** Hero text line height (heroSize * 1.15) */
  readonly heroLineHeight: number;
  /** Hero 'M' advance width (bold) */
  readonly heroAdvance: number;
  /** Padding inside boxes — scales with font size */
  readonly pad: number;
  /** Vertical gap between rows in multi-row boxes */
  readonly rowGap: number;
}

/**
 * Compute font metrics from a body font size.
 * At DEFAULT_FONT_SIZE (20), all values match the original hardcoded constants:
 *   pad=16, rowGap=8, heroSize=52
 */
export function computeFontMetrics(fontSize?: number, weight = DEFAULT_BODY_WEIGHT): FontMetrics {
  const bodySize = Math.max(8, Math.min(42, fontSize ?? DEFAULT_FONT_SIZE));
  const heroSize = Math.round(bodySize * 2.6);
  const bodyWeight = snapWeight(weight);
  const headWeight = headingWeight(bodyWeight);
  return {
    bodySize,
    bodyLineHeight: Math.round(bodySize * 1.3),
    bodyAdvance: measureText('M', bodySize, bodyWeight),
    weight: bodyWeight,
    headingWeight: headWeight,
    heroSize,
    heroLineHeight: Math.round(heroSize * 1.15),
    heroAdvance: measureText('M', heroSize, headWeight),
    pad: Math.round(bodySize * 0.8),
    rowGap: Math.round(bodySize * 0.4),
  };
}
