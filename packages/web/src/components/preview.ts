/**
 * eInk preview renderer — renders actual 1-bit frame buffer output to a <canvas>.
 * Converts editor state to a BentoConfig, runs the renderer, and paints pixels.
 */

import type { BentoBox, BentoConfig } from '@infobento/core';
import { render } from '@infobento/renderer';
import type {
  EditorBox,
  CountdownConfig,
  WeatherConfig,
  ForecastConfig,
  TextConfig,
  QRConfig,
  QuoteConfig,
} from '../state';
import { getBoxes } from '../state';

/** Canvas scale factor. SCALE=1 paints each frame buffer pixel as one CSS
 *  pixel — the preview is then physically the same dimensions as the actual
 *  eInk display. The preview panel sizes itself to the canvas via CSS vars,
 *  so bumping SCALE here is the only change needed to enlarge the preview. */
const SCALE = 1;

/**
 * Convert an EditorBox (UI-local model) to a core BentoBox (renderer model).
 * Maps each editor box type to the discriminated union member the renderer expects.
 */
function toBentoBox(editor: EditorBox): BentoBox {
  const base = { id: String(editor.id), label: editor.label };

  switch (editor.type) {
    case 'text': {
      const c = editor.config as TextConfig;
      return { ...base, type: 'text', config: { type: 'text', text: c.content } };
    }
    case 'countdown': {
      const c = editor.config as CountdownConfig;
      return {
        ...base,
        type: 'countdown',
        config: { type: 'countdown', targetDate: c.date, label: c.countdownLabel },
      };
    }
    case 'weather': {
      const c = editor.config as WeatherConfig;
      return {
        ...base,
        type: 'weather',
        config: { type: 'weather', city: c.city, data: c.data },
      };
    }
    case 'forecast': {
      const c = editor.config as ForecastConfig;
      return {
        ...base,
        type: 'forecast',
        config: { type: 'forecast', city: c.city, entries: c.entries },
      };
    }
    case 'qr': {
      const c = editor.config as QRConfig;
      return { ...base, type: 'qr', config: { type: 'qr', url: c.url } };
    }
    case 'quote': {
      const c = editor.config as QuoteConfig;
      return {
        ...base,
        type: 'quote',
        config: { type: 'quote', text: c.content, author: c.author || undefined },
      };
    }
    default:
      return { ...base, type: editor.type, config: undefined } as BentoBox;
  }
}

function toBentoConfig(boxes: readonly EditorBox[]): BentoConfig {
  return {
    boxes: boxes.map(toBentoBox),
    refreshesPerDay: 1,
  };
}

/**
 * Paint a 1-bit FrameBuffer onto a <canvas> element at the given scale.
 * Bit packing: each byte holds 8 horizontal pixels, MSB = leftmost.
 * A set bit (1) = black pixel, unset (0) = white pixel.
 */
function paintFrameBuffer(
  canvas: HTMLCanvasElement,
  data: Uint8Array,
  width: number,
  height: number,
  scale: number,
): void {
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  const byteWidth = Math.ceil(width / 8);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byteIndex = y * byteWidth + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);
      const byte = data[byteIndex];
      if (byte !== undefined && (byte >> bitIndex) & 1) {
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
}

/** Cached canvas element, reused across renders to avoid DOM churn */
let _canvas: HTMLCanvasElement | undefined;

export function renderPreview(containerId: string): void {
  const display = document.getElementById(containerId);
  if (!display) return;

  const boxes = getBoxes();

  if (boxes.length === 0) {
    _canvas = undefined;
    display.innerHTML = '<div class="eink-empty">&lt;Add a box...&gt;</div>';
    return;
  }

  const config = toBentoConfig(boxes);
  const fb = render(config);

  if (!_canvas) {
    _canvas = document.createElement('canvas');
    _canvas.className = 'eink-canvas';
  }

  paintFrameBuffer(_canvas, fb.data, fb.width, fb.height, SCALE);

  // Publish rendered canvas size as unitless CSS variables — surrounding
  // panel sizes itself via these regardless of display dimensions or SCALE.
  display.style.setProperty('--eink-w', String(fb.width * SCALE));
  display.style.setProperty('--eink-h', String(fb.height * SCALE));

  if (_canvas.parentElement !== display) {
    display.innerHTML = '';
    display.appendChild(_canvas);
  }
}
