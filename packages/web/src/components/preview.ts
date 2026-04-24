/**
 * eInk preview — fetches server-rendered PNG from the API.
 * Converts editor state to BentoConfig, POSTs to /api/preview, displays the PNG.
 */

import type { BentoBox, BentoConfig } from '@infobento/core';
import type {
  EditorBox,
  CountdownConfig,
  WeatherConfig,
  ForecastConfig,
  Forecast3DConfig,
  TextConfig,
  QRConfig,
  QuoteConfig,
  SunConfig,
  AQIConfig,
  ProgressConfig,
} from '../state';
import { getBoxes, getShowHeaders } from '../state';

/**
 * Convert an EditorBox (UI-local model) to a core BentoBox (renderer model).
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
    case 'forecast3d': {
      const c = editor.config as Forecast3DConfig;
      return {
        ...base,
        type: 'forecast3d',
        config: { type: 'forecast3d', city: c.city, entries: c.entries },
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
    case 'date': {
      return { ...base, type: 'date', config: { type: 'date' } };
    }
    case 'moon': {
      return { ...base, type: 'moon', config: { type: 'moon' } };
    }
    case 'sun': {
      const c = editor.config as SunConfig;
      return {
        ...base,
        type: 'sun',
        config: { type: 'sun', city: c.city, data: c.data },
      };
    }
    case 'aqi': {
      const c = editor.config as AQIConfig;
      return {
        ...base,
        type: 'aqi',
        config: { type: 'aqi', city: c.city, data: c.data },
      };
    }
    case 'progress': {
      const c = editor.config as ProgressConfig;
      return {
        ...base,
        type: 'progress',
        config: {
          type: 'progress',
          label: c.progressLabel || undefined,
          startDate: c.startDate || undefined,
          endDate: c.endDate || undefined,
        },
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
    showHeaders: getShowHeaders(),
  };
}

/** Cached img element, reused across renders */
let _img: HTMLImageElement | undefined;
let _pendingRequest: AbortController | undefined;
let _debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function renderPreview(containerId: string): void {
  // Debounce: wait 150ms after last call before fetching
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => renderPreviewNow(containerId), 150);
}

function renderPreviewNow(containerId: string): void {
  const display = document.getElementById(containerId);
  if (!display) return;

  const boxes = getBoxes();

  if (boxes.length === 0) {
    _img = undefined;
    display.innerHTML = '<div class="eink-empty">&lt;Add a box...&gt;</div>';
    return;
  }

  // Clear empty state immediately so it doesn't flash between renders
  const emptyEl = display.querySelector('.eink-empty');
  if (emptyEl) emptyEl.remove();

  const config = toBentoConfig(boxes);

  // Cancel any in-flight request
  if (_pendingRequest) _pendingRequest.abort();
  const controller = new AbortController();
  _pendingRequest = controller;

  // Fetch server-rendered PNG (scale=1 for native resolution)
  fetch('/api/preview?scale=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Preview API returned ${String(res.status)}`);
      return res.blob();
    })
    .then((blob) => {
      if (!_img) {
        _img = document.createElement('img');
        _img.className = 'eink-canvas';
        _img.style.imageRendering = 'pixelated';
      }

      const url = URL.createObjectURL(blob);
      _img.onload = () => URL.revokeObjectURL(url);
      _img.src = url;

      // Set CSS vars for sizing
      display.style.setProperty('--eink-w', '920');
      display.style.setProperty('--eink-h', '680');

      if (_img.parentElement !== display) {
        display.innerHTML = '';
        display.appendChild(_img);
      }
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silently ignore fetch errors (API might not be running)
    });
}
