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
 *  `widthPx`/`heightPx` are the native landscape dimensions (long × short). */
export interface DeviceProfilePreset {
  readonly id: string;
  readonly label: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Display resolutions selectable in the web simulator. Add new panels here —
 *  the simulator's dropdown is generated from this list. */
export const DEVICE_PROFILES: readonly DeviceProfilePreset[] = [
  {
    id: 'seeed-reterminal-e1001',
    label: 'Seeed reTerminal E1001 — 7.5" 800×480',
    widthPx: 800,
    heightPx: 480,
  },
  {
    id: 'gdeh0576-920x680',
    label: 'Good Display GDEH0576T81 — 5.76" 920×680 (deferred)',
    widthPx: 920,
    heightPx: 680,
  },
];

/** Default simulator profile — the panel currently being prototyped on. */
export const DEFAULT_PROFILE_ID = 'seeed-reterminal-e1001';
