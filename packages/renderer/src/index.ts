/**
 * Intent: Convert bento box layouts into 2-bit eInk-compatible frame buffers
 * Context: Called by @infobento/api to generate display data sent to the device
 * Pattern: Pure functions — all rendering is deterministic with no side effects
 */

import type { BentoConfig, BentoBox, DeviceProfile, LayoutBox } from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, calculateLayout } from '@infobento/core';
import { measureText } from './ttf-font.js';
import { drawRoundedRect, roundedRectSDF, setPixel, GRAY_WHITE, GRAY_DARK } from './draw.js';
import { renderTextBox, renderPlaceholderBox } from './boxes/text.js';
import { renderWeatherBox } from './boxes/weather.js';
import { renderForecastBox } from './boxes/forecast.js';
import { renderForecast3DBox } from './boxes/forecast3d.js';
import { renderCountdownBox } from './boxes/countdown.js';
import { renderQRBox } from './boxes/qr.js';
import { renderQuoteBox } from './boxes/quote.js';
import { renderDateBox } from './boxes/date.js';
import { renderMoonBox } from './boxes/moon.js';
import { renderSunBox } from './boxes/sun.js';
import { renderAQIBox } from './boxes/aqi.js';
import { renderProgressBox } from './boxes/progress.js';
import { renderStocksBox } from './boxes/stocks.js';
import { renderTasksBox } from './boxes/tasks.js';
import { renderCalendarBox } from './boxes/calendar.js';
import { renderHabitBox } from './boxes/habit.js';
import { renderWorldclockBox } from './boxes/worldclock.js';
import { renderHoroscopeBox } from './boxes/horoscope.js';
import type { FrameBuffer } from './types.js';
import type { FontMetrics } from './font-metrics.js';
import { computeFontMetrics } from './font-metrics.js';

// Re-export PNG conversion, types, and font metrics
export { frameToPng } from './png.js';
export type { FrameBuffer } from './types.js';
export { computeFontMetrics, DEFAULT_FONT_SIZE } from './font-metrics.js';
export type { FontMetrics } from './font-metrics.js';

/** Landscape device profile (920x680) */
const LANDSCAPE_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_WIDTH,
  heightPx: DISPLAY_HEIGHT,
  deviceId: 'infobento-5.76',
};

/** Portrait device profile (680x920) */
const PORTRAIT_DEVICE: DeviceProfile = {
  widthPx: DISPLAY_HEIGHT,
  heightPx: DISPLAY_WIDTH,
  deviceId: 'infobento-5.76',
};

/**
 * intent: Create an empty (white) frame buffer for the target display
 * method: Allocates a Uint8Array sized for 2-bit-per-pixel packing
 * effect: ceil(width / 4) * height bytes
 */
export function createFrameBuffer(
  device: DeviceProfile = { widthPx: DISPLAY_WIDTH, heightPx: DISPLAY_HEIGHT, deviceId: '' },
): FrameBuffer {
  const byteWidth = Math.ceil(device.widthPx / 4);
  return {
    width: device.widthPx,
    height: device.heightPx,
    data: new Uint8Array(byteWidth * device.heightPx),
  };
}

/**
 * intent: Render a single layout box by dispatching to the appropriate box renderer
 * method: Switch on box type, passing FontMetrics to each renderer
 */
function renderBox(
  fb: FrameBuffer,
  layoutBox: LayoutBox,
  metrics: FontMetrics,
  showHeaders: boolean,
): void {
  const { box } = layoutBox;

  if (box.type === 'text' && box.config?.type === 'text') {
    renderTextBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'weather' && box.config?.type === 'weather') {
    renderWeatherBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'forecast' && box.config?.type === 'forecast') {
    renderForecastBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'forecast3d' && box.config?.type === 'forecast3d') {
    renderForecast3DBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'countdown' && box.config?.type === 'countdown') {
    renderCountdownBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'qr' && box.config?.type === 'qr') {
    renderQRBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'quote' && box.config?.type === 'quote') {
    renderQuoteBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'date' && box.config?.type === 'date') {
    renderDateBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'moon' && box.config?.type === 'moon') {
    renderMoonBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'sun' && box.config?.type === 'sun') {
    renderSunBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'aqi' && box.config?.type === 'aqi') {
    renderAQIBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'progress' && box.config?.type === 'progress') {
    renderProgressBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'stocks' && box.config?.type === 'stocks') {
    renderStocksBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'tasks' && box.config?.type === 'tasks') {
    renderTasksBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'calendar' && box.config?.type === 'calendar') {
    renderCalendarBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'habit' && box.config?.type === 'habit') {
    renderHabitBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'worldclock' && box.config?.type === 'worldclock') {
    renderWorldclockBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'horoscope' && box.config?.type === 'horoscope') {
    renderHoroscopeBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else {
    renderPlaceholderBox(fb, layoutBox);
  }
}

/**
 * intent: Compute minimum pixel height for content-heavy boxes (e.g. quotes)
 * method: Simulate word-wrap to count lines, add space for header + author + padding
 */
function computeHeightHints(
  boxes: readonly BentoBox[],
  metrics: FontMetrics,
  totalWidth: number,
  showHeaders: boolean,
  padPx: number,
): ReadonlyMap<number, number> | undefined {
  const hints = new Map<number, number>();

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (box?.type !== 'quote' || box.config?.type !== 'quote') continue;

    // Determine actual box width (accounts for split pairs)
    let boxWidth = totalWidth;
    if (box.split === 'left') {
      const ratio = box.splitRatio ?? 2;
      const fractions: Record<number, number> = { 1: 1 / 3, 2: 1 / 2, 3: 2 / 3 };
      boxWidth = Math.floor((totalWidth - padPx) * (fractions[ratio] ?? 0.5));
    } else if (box.split === 'right') {
      // Find left partner's ratio
      const leftBox = i > 0 ? boxes[i - 1] : undefined;
      const ratio = leftBox?.splitRatio ?? 2;
      const fractions: Record<number, number> = { 1: 1 / 3, 2: 1 / 2, 3: 2 / 3 };
      const leftFrac = fractions[ratio] ?? 0.5;
      boxWidth = Math.floor((totalWidth - padPx) * (1 - leftFrac));
    }

    const bodyWidth = boxWidth - metrics.pad * 2;
    const lineHeight = Math.round(metrics.bodySize * 1.3); // matches drawTextWrapped

    // Count wrapped lines for quote text only
    let lines = 1;
    const words = box.config.text.split(' ');
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = measureText(testLine, metrics.bodySize);
      if (line && testWidth > bodyWidth) {
        lines++;
        line = word;
      } else {
        line = testLine;
      }
    }

    let needed = metrics.pad; // top padding
    if (showHeaders) {
      needed += metrics.bodySize + metrics.pad; // header row
    }
    needed += lines * lineHeight; // quote text
    if (box.config.author) {
      needed += lineHeight; // author line
    }
    needed += metrics.pad; // bottom padding

    hints.set(i, needed);
  }

  return hints.size > 0 ? hints : undefined;
}

/**
 * intent: Render a bento config into a frame buffer for a single orientation
 * method: Calculate layout, then render each box into the frame buffer
 * effect: Returns device-ready binary data sized for the target device
 */
export function render(config: BentoConfig, device?: DeviceProfile): FrameBuffer {
  const metrics = computeFontMetrics(config.fontSize);
  const effectiveDevice = device ?? {
    widthPx: DISPLAY_WIDTH,
    heightPx: DISPLAY_HEIGHT,
    deviceId: 'infobento-5.76',
  };
  const padPx = (config.padding ?? 4) * 3;
  const layoutWidth = effectiveDevice.widthPx - padPx * 2;
  const showHeaders = config.showHeaders !== false;
  const heightHints = computeHeightHints(config.boxes, metrics, layoutWidth, showHeaders, padPx);
  const layout = calculateLayout(config, effectiveDevice, heightHints);
  const fb = createFrameBuffer(layout.device);

  // Fill background with light grey when boxes exist
  if (layout.boxes.length > 0) {
    fb.data.fill(0x55); // 0b01010101 = GRAY_LIGHT (1) for all 4 pixels per byte
  }

  const radiusLevel = config.cornerRadius ?? 3;
  const cornerRadius = radiusLevel * 4; // 0=0px, 3=12px (default), 5=20px
  const borderPx = 4;

  for (const layoutBox of layout.boxes) {
    const { x, y, width, height } = layoutBox;
    const r = Math.min(cornerRadius, Math.floor(width / 2), Math.floor(height / 2));

    // Fill white interior inside the rounded rect (only where dist < 0)
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const dist = roundedRectSDF(px, py, width, height, r);
        if (dist < 0) {
          setPixel(fb, x + px, y + py, GRAY_WHITE);
        }
      }
    }

    // Antialiased mid-grey rounded border (handles its own edge antialiasing)
    drawRoundedRect(fb, x, y, width, height, r, borderPx, GRAY_DARK);

    renderBox(fb, layoutBox, metrics, showHeaders);
  }

  return fb;
}

/** Result of rendering both orientations */
export interface DualRenderResult {
  readonly landscape: FrameBuffer;
  readonly portrait: FrameBuffer;
}

/**
 * intent: Render both landscape and portrait for a single config
 * method: Call render() twice with different DeviceProfiles
 * effect: Device can switch orientations without an API round-trip
 */
export function renderBoth(config: BentoConfig): DualRenderResult {
  return {
    landscape: render(config, LANDSCAPE_DEVICE),
    portrait: render(config, PORTRAIT_DEVICE),
  };
}
