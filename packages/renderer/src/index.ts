/**
 * Intent: Convert bento box layouts into 1-bit eInk-compatible frame buffers
 * Context: Called by @infobento/api to generate display data sent to the device
 * Pattern: Pure functions — all rendering is deterministic with no side effects
 * Future: Add bitmap font rendering, icon set, Floyd-Steinberg dithering
 */

import type { BentoConfig, DeviceProfile } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@infobento/core';

/** 1-bit frame buffer: each byte holds 8 horizontal pixels */
export interface FrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * intent: Create an empty (white) frame buffer for the target display
 * method: Allocates a Uint8Array sized for 1-bit-per-pixel packing
 * effect: (width * height) / 8 bytes — 6000 bytes for 240x200
 */
export function createFrameBuffer(
  device: DeviceProfile = { widthPx: DISPLAY_WIDTH, heightPx: DISPLAY_HEIGHT, deviceId: '' },
): FrameBuffer {
  const byteWidth = Math.ceil(device.widthPx / 8);
  return {
    width: device.widthPx,
    height: device.heightPx,
    data: new Uint8Array(byteWidth * device.heightPx),
  };
}

/**
 * intent: Render a bento config into a 1-bit frame buffer
 * method: Placeholder — returns empty frame buffer for now
 * effect: Will produce device-ready binary data in future phases
 */
export function render(_config: BentoConfig, device?: DeviceProfile): FrameBuffer {
  return createFrameBuffer(device);
}
