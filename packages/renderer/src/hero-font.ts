/**
 * Intent: Font metrics for hero/heading text — derived from Inter Bold via opentype.js
 * Context: Box renderers use these constants for layout calculations
 * Pattern: TTF rendering happens in draw.ts; this module exports metrics only
 */

import { HERO_FONT_SIZE, HERO_LINE_HEIGHT, measureText } from './ttf-font.js';

/** Height of hero text in pixels */
export const HERO_FONT_HEIGHT = HERO_FONT_SIZE;

/** Line height for hero text */
export const HERO_LINE_HEIGHT_PX = HERO_LINE_HEIGHT;

/** Average character advance width for hero text — approximated from 'M' */
export const HERO_CHAR_ADVANCE = measureText('M', HERO_FONT_SIZE, true);
