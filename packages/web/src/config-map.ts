/**
 * Bidirectional mapping between the editor's UI-local model (EditorBox + style
 * state) and the core BentoConfig the renderer/firmware consume.
 *
 *   toBentoConfig   editor state → core BentoConfig   (preview, render, cloud save)
 *   fromBentoConfig core BentoConfig → editor export  (cloud load / device pull)
 *
 * The reverse direction emits the version-2 *export* shape that state.loadConfig
 * already hydrates, so cloud-loaded device configs flow through the same loader
 * as file import and device pairing. Keeping both directions in one module lets
 * a round-trip test guard the field-name translations (text↔content,
 * targetDate↔date, label↔progressLabel, …) that are easy to get subtly wrong.
 */

import type { BentoBox, BentoConfig, BentoBoxType } from '@infobento/core';
import type {
  EditorBox,
  EditorBoxType,
  EditorBoxConfig,
  CountdownConfig,
  WeatherConfig,
  ForecastConfig,
  Forecast3DConfig,
  TextConfig,
  QRConfig,
  QuoteConfig,
  DateConfig,
  SunConfig,
  AQIConfig,
  UVConfig,
  PollenConfig,
  ProgressConfig,
  HoroscopeConfig,
  OnThisDayConfig,
  StocksConfig,
} from './state';
import {
  getBoxes,
  getShowHeaders,
  getFontSize,
  getFontWeight,
  getCornerRadius,
  getPadding,
  getRefreshesPerDay,
  getDeviceProfile,
} from './state';

// -- Editor → core ----------------------------------------------------------

/** Convert an EditorBox (UI-local model) to a core BentoBox (renderer model). */
export function toBentoBox(editor: EditorBox): BentoBox {
  const base = {
    id: String(editor.id),
    label: editor.label,
    ...(editor.split ? { split: editor.split } : {}),
    ...(editor.splitRatio && editor.splitRatio !== 50 ? { splitRatio: editor.splitRatio } : {}),
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
        config: { type: 'forecast', city: c.city, hours: c.hours, entries: c.entries },
      };
    }
    case 'forecast3d': {
      const c = editor.config as Forecast3DConfig;
      return {
        ...base,
        type: 'forecast3d',
        config: { type: 'forecast3d', city: c.city, days: c.days, entries: c.entries },
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
        config: {
          type: 'quote',
          text: c.content,
          author: c.author || undefined,
          tags: c.tags || undefined,
        },
      };
    }
    case 'date': {
      const c = editor.config as DateConfig;
      const city = c.city?.trim();
      return {
        ...base,
        type: 'date',
        config: {
          type: 'date',
          ...(city ? { city } : {}),
          ...(c.showYearProgress !== undefined ? { showYearProgress: c.showYearProgress } : {}),
        },
      };
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
    case 'uv': {
      const c = editor.config as UVConfig;
      return {
        ...base,
        type: 'uv',
        config: { type: 'uv', city: c.city, data: c.data },
      };
    }
    case 'pollen': {
      const c = editor.config as PollenConfig;
      return {
        ...base,
        type: 'pollen',
        config: { type: 'pollen', city: c.city, data: c.data },
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
    default:
      return { ...base, type: editor.type, config: undefined } as BentoBox;
  }
}

/** Build a full core BentoConfig from the current editor boxes + style state. */
export function toBentoConfig(boxes: readonly EditorBox[] = getBoxes()): BentoConfig {
  const profile = getDeviceProfile();
  return {
    boxes: boxes.map(toBentoBox),
    refreshesPerDay: getRefreshesPerDay(),
    showHeaders: getShowHeaders(),
    fontSize: getFontSize(),
    fontWeight: getFontWeight(),
    cornerRadius: getCornerRadius(),
    padding: getPadding(),
    width: profile.widthPx,
    height: profile.heightPx,
  };
}

// -- Core → editor (version-2 export shape consumed by state.loadConfig) -----

/** One box in the version-2 export shape (mirrors serializeBoxes output). */
export interface ExportBox {
  type: EditorBoxType;
  label: string;
  config: EditorBoxConfig;
  split?: 'left' | 'right';
  splitRatio?: number;
}

/** The full version-2 export object that state.loadConfig() hydrates. */
export interface ExportConfig {
  version: 2;
  boxes: ExportBox[];
  showHeaders?: boolean;
  fontSize?: number;
  fontWeight?: number;
  cornerRadius?: number;
  padding?: number;
  refreshesPerDay?: number;
}

/** A core box config is a discriminated union; index it loosely for the inverse. */
type AnyCoreConfig = Record<string, unknown> | undefined;

/** Convert a core BentoBox back into the editor's export shape (inverse of toBentoBox). */
export function fromBentoBox(box: BentoBox): ExportBox {
  const cfg = box.config as AnyCoreConfig;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const base = {
    type: box.type as EditorBoxType,
    label: box.label,
    ...(box.split === 'left' || box.split === 'right' ? { split: box.split } : {}),
    ...(typeof box.splitRatio === 'number' && box.splitRatio !== 50
      ? { splitRatio: box.splitRatio }
      : {}),
  };

  let config: EditorBoxConfig;
  switch (box.type as BentoBoxType) {
    case 'text':
      config = { content: str(cfg?.['text']) } as TextConfig;
      break;
    case 'countdown':
      config = {
        date: str(cfg?.['targetDate']),
        countdownLabel: str(cfg?.['label']),
      } as CountdownConfig;
      break;
    case 'weather':
      config = { city: str(cfg?.['city']), data: cfg?.['data'] } as WeatherConfig;
      break;
    case 'forecast':
      config = {
        city: str(cfg?.['city']),
        hours: cfg?.['hours'] as number | undefined,
        entries: cfg?.['entries'],
      } as ForecastConfig;
      break;
    case 'forecast3d':
      config = {
        city: str(cfg?.['city']),
        days: cfg?.['days'] as number | undefined,
        entries: cfg?.['entries'],
      } as Forecast3DConfig;
      break;
    case 'qr':
      config = { url: str(cfg?.['url']) } as QRConfig;
      break;
    case 'quote':
      config = {
        content: str(cfg?.['text']),
        author: str(cfg?.['author']),
        tags: cfg?.['tags'] as string | undefined,
      } as QuoteConfig;
      break;
    case 'date':
      config = {
        city: str(cfg?.['city']),
        showYearProgress: cfg?.['showYearProgress'] as boolean | undefined,
      } as DateConfig;
      break;
    case 'moon':
      config = { _placeholder: '' };
      break;
    case 'sun':
      config = { city: str(cfg?.['city']), data: cfg?.['data'] } as SunConfig;
      break;
    case 'aqi':
      config = { city: str(cfg?.['city']), data: cfg?.['data'] } as AQIConfig;
      break;
    case 'uv':
      config = { city: str(cfg?.['city']), data: cfg?.['data'] } as UVConfig;
      break;
    case 'pollen':
      config = { city: str(cfg?.['city']), data: cfg?.['data'] } as PollenConfig;
      break;
    case 'progress':
      config = {
        progressLabel: str(cfg?.['label']),
        startDate: str(cfg?.['startDate']),
        endDate: str(cfg?.['endDate']),
      } as ProgressConfig;
      break;
    case 'horoscope':
      config = {
        sign: str(cfg?.['sign']),
        content: str(cfg?.['text']),
        date: str(cfg?.['date']),
      } as HoroscopeConfig;
      break;
    case 'onthisday':
      config = {
        content: str(cfg?.['text']),
        year: cfg?.['year'] as string | undefined,
        // Preserve absent category as undefined (don't inject 'events'), so a
        // round-trip through cloud storage doesn't persist a category the user
        // never set.
        category: cfg?.['category'] as string | undefined,
      } as OnThisDayConfig;
      break;
    case 'stocks':
      config = {
        symbol: str(cfg?.['symbol']),
        duration: cfg?.['duration'] as StocksConfig['duration'],
        data: cfg?.['data'],
      } as StocksConfig;
      break;
    default:
      config = { _placeholder: '' };
  }

  return { ...base, config };
}

/**
 * Convert a core BentoConfig into the version-2 export object that
 * state.loadConfig() understands. Style fields carry over; box-type chip
 * visibility, temp unit, and device profile are editor-only and intentionally
 * not part of the device's stored config.
 */
export function fromBentoConfig(config: BentoConfig): ExportConfig {
  return {
    version: 2,
    boxes: config.boxes.map(fromBentoBox),
    ...(typeof config.showHeaders === 'boolean' ? { showHeaders: config.showHeaders } : {}),
    ...(typeof config.fontSize === 'number' ? { fontSize: config.fontSize } : {}),
    ...(typeof config.fontWeight === 'number' ? { fontWeight: config.fontWeight } : {}),
    ...(typeof config.cornerRadius === 'number' ? { cornerRadius: config.cornerRadius } : {}),
    ...(typeof config.padding === 'number' ? { padding: config.padding } : {}),
    ...(typeof config.refreshesPerDay === 'number'
      ? { refreshesPerDay: config.refreshesPerDay }
      : {}),
  };
}
