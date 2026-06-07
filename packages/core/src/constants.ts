/**
 * Intent: Display constants and default device profile
 * Context: Imported by layout.ts, index.ts, and downstream packages
 * Pattern: Leaf module — no imports from other core modules (breaks circular deps)
 * Future: Add constants for different device profiles
 */

import type { DeviceProfile } from './types.js';

/** Pixel dimensions of the eInk display.
 *  Source of truth — all renderer/layout/test logic derives from these. */
export const DISPLAY_WIDTH = 920;
export const DISPLAY_HEIGHT = 680;

/** Bytes required to store a 2-bit frame buffer for the given dimensions
 *  (4 horizontal pixels per byte, 2 bits each). */
export function frameBufferBytes(widthPx: number, heightPx: number): number {
  return Math.ceil(widthPx / 4) * heightPx;
}

/** Bytes for the default device frame buffer */
export const DEFAULT_FRAME_BYTES = frameBufferBytes(DISPLAY_WIDTH, DISPLAY_HEIGHT);

/** Default device profile for the 5.76" GDEH0576T81 display */
export const DEFAULT_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-5.76',
};

/** A named display resolution the web simulator can switch between.
 *  `widthPx`/`heightPx` are the native landscape dimensions (long × short).
 *  `widthMm`/`heightMm` are the panel's physical active-area size (same
 *  orientation), so the simulator can render the preview at true physical
 *  size — a lower-resolution 7.5" panel correctly appears larger than a
 *  higher-resolution 5.76" panel. */
export interface DeviceProfilePreset {
  readonly id: string;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Display resolutions selectable in the web simulator. Add new panels here —
 *  the simulator's dropdown is generated from this list. */
export const DEVICE_PROFILES: readonly [DeviceProfilePreset, ...DeviceProfilePreset[]] = [
  {
    id: 'seeed-reterminal-e1001',
    label: 'Seeed reTerminal E1001 — 7.5" 800×480',
    widthPx: 800,
    heightPx: 480,
    widthMm: 163.2,
    heightMm: 97.92,
  },
  {
    id: 'gdeh0576-920x680',
    label: 'Good Display GDEH0576T81 — 5.76" 920×680 (deferred)',
    widthPx: 920,
    heightPx: 680,
    widthMm: 117.7,
    heightMm: 87.0,
  },
];

/** Default simulator profile — the panel currently being prototyped on. */
export const DEFAULT_PROFILE_ID = 'seeed-reterminal-e1001';

/** Left-box width fraction for a split pair, from `splitRatio` (left-side %,
 *  default 50). Clamped to 0.2–0.8 so neither side of the divider collapses. */
export function splitLeftFraction(splitRatio?: number): number {
  const pct = splitRatio ?? 50;
  return Math.min(0.8, Math.max(0.2, pct / 100));
}
