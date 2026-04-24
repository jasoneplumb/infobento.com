/**
 * Intent: Font metrics for body text — derived from Inter Regular via opentype.js
 * Context: Legacy module — box renderers now use FontMetrics from font-metrics.ts
 * Pattern: Kept for backward compatibility (scripts/ still import these)
 * @deprecated Use computeFontMetrics() from font-metrics.ts instead
 */

import { BODY_FONT_SIZE, BODY_LINE_HEIGHT, measureText } from './ttf-font.js';

/** Height of body text in pixels (used for vertical spacing in box renderers) */
export const FONT_HEIGHT = BODY_FONT_SIZE;

/** Line height for body text (font height + leading) */
export const LINE_HEIGHT = BODY_LINE_HEIGHT;

/** Average character advance width — approximated from 'M' width for layout */
export const CHAR_ADVANCE = measureText('M', BODY_FONT_SIZE);
