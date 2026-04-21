/**
 * Intent: Convert bento box layouts into 1-bit eInk-compatible frame buffers
 * Context: Called by @infobento/api to generate display data sent to the device
 * Pattern: Pure functions — all rendering is deterministic with no side effects
 * Future: Add box renderers for countdown, weather, QR, quote
 */

import type { BentoConfig, DeviceProfile, LayoutBox } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, calculateLayout } from '@infobento/core';
import { renderTextBox, renderPlaceholderBox } from './boxes/text.js';
import { renderWeatherBox } from './boxes/weather.js';
import { renderCountdownBox } from './boxes/countdown.js';
import { renderQRBox } from './boxes/qr.js';
import type { FrameBuffer } from './types.js';

// Re-export PNG conversion and types
export { frameToPng } from './png.js';
export type { FrameBuffer } from './types.js';

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
 * intent: Render a single layout box by dispatching to the appropriate box renderer
 * method: Switch on box type — only 'text' is implemented, others get placeholder
 */
function renderBox(fb: FrameBuffer, layoutBox: LayoutBox): void {
  const { box } = layoutBox;

  // tradeoff: boxes without config fall through to placeholder rather than
  // crashing — the web UI will enforce config presence, but the renderer is lenient
  if (box.type === 'text' && box.config?.type === 'text') {
    renderTextBox(fb, layoutBox, box.config);
  } else if (box.type === 'weather' && box.config?.type === 'weather') {
    renderWeatherBox(fb, layoutBox, box.config);
  } else if (box.type === 'countdown' && box.config?.type === 'countdown') {
    renderCountdownBox(fb, layoutBox, box.config);
  } else if (box.type === 'qr' && box.config?.type === 'qr') {
    renderQRBox(fb, layoutBox, box.config);
  } else {
    renderPlaceholderBox(fb, layoutBox);
  }
}

/**
 * intent: Render a bento config into a 1-bit frame buffer
 * method: Calculate layout, then render each box into the frame buffer
 * effect: Returns device-ready binary data (6000 bytes for 240x200)
 */
export function render(config: BentoConfig, device?: DeviceProfile): FrameBuffer {
  const layout = calculateLayout(config, device);
  const fb = createFrameBuffer(layout.device);

  for (const layoutBox of layout.boxes) {
    renderBox(fb, layoutBox);
  }

  return fb;
}
