/**
 * eInk preview — fetches server-rendered PNGs (landscape + portrait) from the API.
 * Converts editor state to BentoConfig, POSTs to /api/preview?dual=1.
 * Displays one orientation at a time, toggled by the Landscape checkbox.
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
  HoroscopeConfig,
  JokeConfig,
  OnThisDayConfig,
  StocksConfig,
  CalendarConfig,
  HabitConfig,
} from '../state';
import {
  getBoxes,
  getShowHeaders,
  getFontSize,
  getCornerRadius,
  getPadding,
  getDeviceProfile,
} from '../state';

/**
 * Convert an EditorBox (UI-local model) to a core BentoBox (renderer model).
 */
function toBentoBox(editor: EditorBox): BentoBox {
  const base = {
    id: String(editor.id),
    label: editor.label,
    ...(editor.split ? { split: editor.split } : {}),
    ...(editor.weight && editor.weight !== 2 ? { weight: editor.weight } : {}),
    ...(editor.splitRatio && editor.splitRatio !== 2 ? { splitRatio: editor.splitRatio } : {}),
  };

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
    case 'horoscope': {
      const c = editor.config as HoroscopeConfig;
      return {
        ...base,
        type: 'horoscope',
        config: {
          type: 'horoscope',
          sign: c.sign,
          text: c.content,
          date: c.date || undefined,
        },
      };
    }
    case 'joke': {
      const c = editor.config as JokeConfig;
      return {
        ...base,
        type: 'joke',
        config: {
          type: 'joke',
          text: c.content,
          category: c.category || undefined,
        },
      };
    }
    case 'onthisday': {
      const c = editor.config as OnThisDayConfig;
      return {
        ...base,
        type: 'onthisday',
        config: {
          type: 'onthisday',
          text: c.content,
          year: c.year || undefined,
          category: c.category || undefined,
        },
      };
    }
    case 'stocks': {
      const c = editor.config as StocksConfig;
      return {
        ...base,
        type: 'stocks',
        config: {
          type: 'stocks',
          symbol: c.symbol,
          ...(c.duration ? { duration: c.duration } : {}),
          data: c.data,
        },
      };
    }
    case 'calendar': {
      const c = editor.config as CalendarConfig;
      return {
        ...base,
        type: 'calendar',
        config: { type: 'calendar', events: c.events },
      };
    }
    case 'habit': {
      const c = editor.config as HabitConfig;
      return {
        ...base,
        type: 'habit',
        config: { type: 'habit', habits: c.habits },
      };
    }
    default:
      return { ...base, type: editor.type, config: undefined } as BentoBox;
  }
}

function toBentoConfig(boxes: readonly EditorBox[]): BentoConfig {
  const profile = getDeviceProfile();
  return {
    boxes: boxes.map(toBentoBox),
    refreshesPerDay: 1,
    showHeaders: getShowHeaders(),
    fontSize: getFontSize(),
    cornerRadius: getCornerRadius(),
    padding: getPadding(),
    width: profile.widthPx,
    height: profile.heightPx,
  };
}

/** Cached img elements for landscape and portrait, reused across renders */
let _imgLandscape: HTMLImageElement | undefined;
let _imgPortrait: HTMLImageElement | undefined;
let _pendingRequest: AbortController | undefined;
let _debounceTimer: ReturnType<typeof setTimeout> | undefined;
let _showLandscape = false;
let _containerId: string | undefined;

export function renderPreview(containerId: string): void {
  _containerId = containerId;
  // Debounce: wait 150ms after last call before fetching
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => renderPreviewNow(containerId), 150);
}

export function setPreviewOrientation(landscape: boolean): void {
  _showLandscape = landscape;
  if (_containerId) mountActivePreview(_containerId);
}

function ensureImg(existing: HTMLImageElement | undefined, className: string): HTMLImageElement {
  if (existing) return existing;
  const img = document.createElement('img');
  img.className = className;
  img.style.imageRendering = 'pixelated';
  return img;
}

function mountActivePreview(containerId: string): void {
  const display = document.getElementById(containerId);
  if (!display || !_imgLandscape || !_imgPortrait) return;
  display.innerHTML = '';
  const div = document.createElement('div');
  div.className = `eink-preview-pair ${_showLandscape ? 'landscape' : 'portrait'}`;
  div.appendChild(_showLandscape ? _imgLandscape : _imgPortrait);
  display.appendChild(div);
}

function renderPreviewNow(containerId: string): void {
  const display = document.getElementById(containerId);
  if (!display) return;

  const boxes = getBoxes();

  if (boxes.length === 0) {
    _imgLandscape = undefined;
    _imgPortrait = undefined;
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

  // Fetch both landscape + portrait PNGs as base64 JSON
  fetch('/api/preview?scale=1&dual=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Preview API returned ${String(res.status)}`);
      return res.json() as Promise<{ landscape: string; portrait: string }>;
    })
    .then((data) => {
      _imgLandscape = ensureImg(_imgLandscape, 'eink-canvas eink-landscape');
      _imgPortrait = ensureImg(_imgPortrait, 'eink-canvas eink-portrait');

      // Landscape: data URI from base64
      _imgLandscape.src = `data:image/png;base64,${data.landscape}`;
      _imgPortrait.src = `data:image/png;base64,${data.portrait}`;

      // Set CSS vars for sizing and corner radius (selected display profile)
      const profile = getDeviceProfile();
      display.style.setProperty('--eink-w', String(profile.widthPx));
      display.style.setProperty('--eink-h', String(profile.heightPx));
      // Match CSS border-radius to framebuffer corner radius (at 0.5x display scale)
      const radiusPx = getCornerRadius() * 4;
      display.style.setProperty('--eink-radius', `${String(Math.round(radiusPx * 0.5))}px`);

      mountActivePreview(containerId);
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silently ignore fetch errors (API might not be running)
    });
}
