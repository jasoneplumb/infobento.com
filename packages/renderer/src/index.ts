/**
 * Intent: Convert bento box layouts into 2-bit eInk-compatible frame buffers
 * Context: Called by @infobento/api to generate display data sent to the device
 * Pattern: Pure functions — all rendering is deterministic with no side effects
 */

import type {
  BentoConfig,
  BentoBox,
  DeviceProfile,
  LayoutBox,
  LayoutResult,
} from '@infobento/core';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, calculateLayout, splitLeftFraction } from '@infobento/core';
import { measureText } from './ttf-font.js';
import { roundedRectSDF, setPixel, GRAY_WHITE, GRAY_LIGHT } from './draw.js';
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
import { renderUVBox } from './boxes/uv.js';
import { renderPollenBox } from './boxes/pollen.js';
import { renderProgressBox } from './boxes/progress.js';
import { renderStocksBox } from './boxes/stocks.js';
import { renderHoroscopeBox } from './boxes/horoscope.js';
import { renderOnThisDayBox } from './boxes/onthisday.js';
import type { FrameBuffer } from './types.js';
import type { FontMetrics } from './font-metrics.js';
import { computeFontMetrics } from './font-metrics.js';

// Re-export PNG conversion, types, and font metrics
export { frameToPng } from './png.js';
export { rotateFrameBuffer90 } from './draw.js';
export type { FrameBuffer } from './types.js';
export { computeFontMetrics, DEFAULT_FONT_SIZE } from './font-metrics.js';
export type { FontMetrics } from './font-metrics.js';

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
  } else if (box.type === 'uv' && box.config?.type === 'uv') {
    renderUVBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'pollen' && box.config?.type === 'pollen') {
    renderPollenBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'progress' && box.config?.type === 'progress') {
    renderProgressBox(fb, layoutBox, box.config, metrics, undefined, showHeaders);
  } else if (box.type === 'stocks' && box.config?.type === 'stocks') {
    renderStocksBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'horoscope' && box.config?.type === 'horoscope') {
    renderHoroscopeBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else if (box.type === 'onthisday' && box.config?.type === 'onthisday') {
    renderOnThisDayBox(fb, layoutBox, box.config, metrics, showHeaders);
  } else {
    renderPlaceholderBox(fb, layoutBox);
  }
}

/**
 * intent: Count wrapped lines a body of text would occupy at a given width
 * method: Split on \n first (each newline starts a new line), then word-wrap
 *   each segment using the same metrics as drawTextWrapped.
 */
function countWrappedLines(
  text: string,
  bodyWidth: number,
  fontSize: number,
  weight: number,
): number {
  if (!text) return 1;
  let total = 0;
  for (const segment of text.split('\n')) {
    if (!segment) {
      total += 1; // an empty line still occupies one row
      continue;
    }
    const words = segment.split(' ');
    let line = '';
    let lines = 1;
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = measureText(testLine, fontSize, weight);
      if (line && testWidth > bodyWidth) {
        lines++;
        line = word;
      } else {
        line = testLine;
      }
    }
    total += lines;
  }
  return total;
}

/**
 * intent: Compute the minimum pixel height needed to render a single box without truncation
 * method: Per-type formulas mirroring each renderer's vertical layout (header + content + padding)
 * returns: total box height in pixels, or null when the type isn't height-hinted (qr; unknown)
 */
function computeMinHeight(
  box: BentoBox,
  bodyWidth: number,
  metrics: FontMetrics,
  showHeaders: boolean,
): number | null {
  const lineH = metrics.bodyLineHeight;
  const rowH = metrics.bodySize + metrics.rowGap;
  const padding = 2 * metrics.pad; // top + bottom margins
  const headerH = showHeaders ? metrics.bodySize + metrics.pad : 0;
  const shell = (content: number): number => padding + headerH + content;
  const wrap = (text: string): number =>
    countWrappedLines(text, bodyWidth, metrics.bodySize, metrics.weight);

  if (box.type === 'quote' && box.config?.type === 'quote') {
    const author = box.config.author ? lineH : 0;
    return shell(wrap(box.config.text) * lineH + author);
  }
  if (box.type === 'horoscope' && box.config?.type === 'horoscope') {
    return shell(wrap(box.config.text) * lineH);
  }
  if (box.type === 'onthisday' && box.config?.type === 'onthisday') {
    return shell(wrap(box.config.text) * lineH);
  }
  if (box.type === 'text' && box.config?.type === 'text') {
    return shell(wrap(box.config.text) * lineH);
  }
  if (box.type === 'weather') {
    const c = box.config?.type === 'weather' ? box.config : undefined;
    if (c?.data) return shell(metrics.heroSize + 2 + metrics.bodySize);
    const cityLines = c?.city ? wrap(c.city) : 1;
    return shell(cityLines * lineH + metrics.bodySize);
  }
  if (box.type === 'countdown') {
    return shell(metrics.heroSize + 2 + metrics.bodySize);
  }
  if (box.type === 'date') {
    return shell(2 * metrics.bodySize + 5 + metrics.heroSize + Math.max(metrics.bodySize, 5));
  }
  if (box.type === 'moon') {
    return shell(Math.max(20, 2 * metrics.bodySize + 3));
  }
  if (box.type === 'sun') {
    return shell(3 * metrics.bodySize + 2 * metrics.rowGap);
  }
  if (box.type === 'aqi') {
    return shell(metrics.heroSize + 2 + metrics.bodySize);
  }
  if (box.type === 'uv') {
    return shell(metrics.heroSize + 2 + metrics.bodySize);
  }
  if (box.type === 'pollen') {
    // The "None detected" and "No data" states are two body lines, not a hero
    // row — but the hero form is the taller of the two, so it sets the minimum.
    return shell(metrics.heroSize + 2 + metrics.bodySize);
  }
  if (box.type === 'progress') {
    return shell(metrics.heroSize + 2 + 7 + 3 + metrics.bodySize);
  }
  if (box.type === 'stocks') {
    const c = box.config?.type === 'stocks' ? box.config : undefined;
    if (c?.data) {
      return shell(metrics.heroSize + 2 + metrics.heroSize + 4 + metrics.bodySize);
    }
    return shell(metrics.heroSize + 2 + metrics.bodySize);
  }
  if (box.type === 'forecast' && box.config?.type === 'forecast') {
    const want = box.config.hours ?? 3;
    const n = Math.max(1, Math.min(want, box.config.entries?.length ?? want));
    return shell(n * rowH);
  }
  if (box.type === 'forecast3d' && box.config?.type === 'forecast3d') {
    const want = box.config.days ?? 3;
    const n = Math.max(1, Math.min(want, box.config.entries?.length ?? want));
    return shell(n * rowH);
  }
  // qr is sized by the layout engine itself (QR_HEIGHT_RATIO); no hint.
  return null;
}

/**
 * intent: Compute minimum pixel height per box for content-aware layout
 * method: Walks all boxes; for each type computeMinHeight returns its renderer-specific minimum
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
    if (!box) continue;

    // Determine actual box width (accounts for split pairs)
    let boxWidth = totalWidth;
    if (box.split === 'left') {
      boxWidth = Math.floor((totalWidth - padPx) * splitLeftFraction(box.splitRatio));
    } else if (box.split === 'right') {
      const leftBox = i > 0 ? boxes[i - 1] : undefined;
      boxWidth = Math.floor((totalWidth - padPx) * (1 - splitLeftFraction(leftBox?.splitRatio)));
    }

    const bodyWidth = boxWidth - metrics.pad * 2;
    const minH = computeMinHeight(box, bodyWidth, metrics, showHeaders);
    if (minH == null) continue;
    hints.set(i, minH);
  }

  return hints.size > 0 ? hints : undefined;
}

/**
 * intent: Render a bento config into a frame buffer for a single orientation
 * method: Calculate layout, then render each box into the frame buffer
 * effect: Returns device-ready binary data sized for the target device
 */
/**
 * intent: Build the content-aware layout for a config (shared by render() and
 *   renderedBoxIds() so both see the exact same set of laid-out boxes)
 * method: Compute font metrics, height hints, then calculateLayout
 */
function buildRenderLayout(
  config: BentoConfig,
  device?: DeviceProfile,
): { layout: LayoutResult; metrics: FontMetrics; showHeaders: boolean } {
  // Font Weight: 0.1–0.9 → Inter static weight 100–900 (defaults to 0.4, Regular).
  // round(*10)*100 keeps the conversion integer-clean (0.7*1000 = 700.0000000000001).
  const weightCss = Math.round((config.fontWeight ?? 0.4) * 10) * 100;
  const metrics = computeFontMetrics(config.fontSize, weightCss);
  const baseDevice = device ?? {
    widthPx: DISPLAY_WIDTH,
    heightPx: DISPLAY_HEIGHT,
    deviceId: 'infobento-5.76',
  };
  // Apply per-config dimension overrides — calculateLayout will do the same
  // internally; doing it here keeps height-hint and createFrameBuffer in sync.
  const effectiveDevice: DeviceProfile = {
    ...baseDevice,
    widthPx: config.width ?? baseDevice.widthPx,
    heightPx: config.height ?? baseDevice.heightPx,
  };
  const padPx = (config.padding ?? 4) * 3;
  const layoutWidth = effectiveDevice.widthPx - padPx * 2;
  const showHeaders = config.showHeaders !== false;
  const heightHints = computeHeightHints(config.boxes, metrics, layoutWidth, showHeaders, padPx);
  const layout = calculateLayout(config, effectiveDevice, heightHints);
  return { layout, metrics, showHeaders };
}

export function render(config: BentoConfig, device?: DeviceProfile): FrameBuffer {
  const { layout, metrics, showHeaders } = buildRenderLayout(config, device);
  const fb = createFrameBuffer(layout.device);

  // Fill background (gaps + margins) with dark grey when boxes exist
  if (layout.boxes.length > 0) {
    fb.data.fill(0xaa); // 0b10101010 = GRAY_DARK (2) for all 4 pixels per byte
  }

  const radiusLevel = config.cornerRadius ?? 3;
  const cornerRadius = radiusLevel * 4; // 0=0px, 3=12px (default), 5=20px
  const SS = 3; // 3×3 supersampling for smooth rounded-corner coverage

  for (const layoutBox of layout.boxes) {
    const { x, y, width, height } = layoutBox;
    const r = Math.min(cornerRadius, Math.floor(width / 2), Math.floor(height / 2));

    // Fill the white rounded interior. Each pixel is 3×3 supersampled against
    // the rounded-rect SDF: fully-inside stays white, fully-outside stays dark
    // field, and partially-covered curve pixels become GRAY_LIGHT — a soft band
    // that antialiases the corners. Straight axis-aligned edges are fully in or
    // out (no partial samples), so they stay crisp.
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let inside = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const subX = px + (sx + 0.5) / SS - 0.5;
            const subY = py + (sy + 0.5) / SS - 0.5;
            if (roundedRectSDF(subX, subY, width, height, r) < 0) inside++;
          }
        }
        if (inside === 0) continue; // fully outside → leave the dark field
        setPixel(fb, x + px, y + py, inside === SS * SS ? GRAY_WHITE : GRAY_LIGHT);
      }
    }

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
  // Treat config.width/height (if set) as the panel's native dimensions and
  // derive both orientations from them, so the dual preview matches any panel.
  const w = config.width ?? DISPLAY_WIDTH;
  const h = config.height ?? DISPLAY_HEIGHT;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  // Strip the single-value override so render() uses the per-orientation device.
  const base: BentoConfig = { ...config, width: undefined, height: undefined };
  return {
    landscape: render(base, { widthPx: long, heightPx: short, deviceId: 'infobento' }),
    portrait: render(base, { widthPx: short, heightPx: long, deviceId: 'infobento' }),
  };
}

/**
 * intent: Report which box ids actually render for a config + device, so the
 *   editor can show which boxes fit and which were dropped (don't fit the panel)
 * method: Run the same content-aware layout as render(), return the laid-out ids
 */
export function renderedBoxIds(config: BentoConfig, device?: DeviceProfile): string[] {
  return buildRenderLayout(config, device).layout.boxes.map((b) => b.box.id);
}

/** Rendered box ids for both orientations (mirrors renderBoth's orientation split). */
export function renderBothBoxIds(config: BentoConfig): {
  landscape: string[];
  portrait: string[];
} {
  const w = config.width ?? DISPLAY_WIDTH;
  const h = config.height ?? DISPLAY_HEIGHT;
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const base: BentoConfig = { ...config, width: undefined, height: undefined };
  return {
    landscape: renderedBoxIds(base, { widthPx: long, heightPx: short, deviceId: 'infobento' }),
    portrait: renderedBoxIds(base, { widthPx: short, heightPx: long, deviceId: 'infobento' }),
  };
}
