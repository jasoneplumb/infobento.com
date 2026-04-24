/**
 * Intent: Font metrics for body text — derived from Inter Regular via opentype.js
 * Context: Box renderers use these constants for layout calculations
 * Pattern: TTF rendering happens in draw.ts; this module exports metrics only
 */

import { BODY_FONT_SIZE, BODY_LINE_HEIGHT, measureText } from './ttf-font.js';

/** Height of body text in pixels (used for vertical spacing in box renderers) */
export const FONT_HEIGHT = BODY_FONT_SIZE;

/** Line height for body text (font height + leading) */
export const LINE_HEIGHT = BODY_LINE_HEIGHT;

/** Average character advance width — approximated from 'M' width for layout */
export const CHAR_ADVANCE = measureText('M', BODY_FONT_SIZE);
