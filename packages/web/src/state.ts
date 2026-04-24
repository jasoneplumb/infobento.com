/**
 * Reactive state management for the InfoBento box editor.
 *
 * Single-display model: one preview, one editor column.
 * setState() triggers a synchronous re-render of every panel.
 */

import type {
  BentoBoxType,
  WeatherData,
  ForecastEntry,
  Forecast3DEntry,
  SunData,
  AQIData,
} from '@infobento/core';

// -- Editor box model (UI-local, not the core BentoBox type) ---------------

export interface TextConfig {
  content: string;
}

export interface CountdownConfig {
  date: string;
  countdownLabel: string;
}

export interface WeatherConfig {
  city: string;
  data?: WeatherData;
}

export interface ForecastConfig {
  city: string;
  entries?: ForecastEntry[];
}

export interface Forecast3DConfig {
  city: string;
  entries?: Forecast3DEntry[];
}

export interface QRConfig {
  url: string;
}

export interface QuoteConfig {
  content: string;
  author: string;
}

export interface DateConfig {
  _placeholder: string;
}

export interface MoonConfig {
  _placeholder: string;
}

export interface SunConfig {
  city: string;
  data?: SunData;
}

export interface AQIConfig {
  city: string;
  data?: AQIData;
}

export interface ProgressConfig {
  progressLabel: string;
  startDate: string;
  endDate: string;
}

export type EditorBoxConfig =
  | TextConfig
  | CountdownConfig
  | WeatherConfig
  | ForecastConfig
  | Forecast3DConfig
  | QRConfig
  | QuoteConfig
  | DateConfig
  | MoonConfig
  | SunConfig
  | AQIConfig
  | ProgressConfig;

export type EditorBoxType = Extract<
  BentoBoxType,
  | 'text'
  | 'countdown'
  | 'weather'
  | 'forecast'
  | 'forecast3d'
  | 'qr'
  | 'quote'
  | 'date'
  | 'moon'
  | 'sun'
  | 'aqi'
  | 'progress'
>;

export interface EditorBox {
  id: number;
  type: EditorBoxType;
  label: string;
  config: EditorBoxConfig;
}

export interface EditorState {
  boxes: EditorBox[];
  showHeaders: boolean;
  fontSize: number;
  cornerRadius: number;
  padding: number;
}

// -- UID generator ----------------------------------------------------------

let _nextId = 1;
function uid(): number {
  return _nextId++;
}

// -- Config defaults & labels -----------------------------------------------

const DEFAULTS: Record<EditorBoxType, () => EditorBoxConfig> = {
  text: () => ({ content: '' }),
  countdown: () => ({ date: '', countdownLabel: '' }),
  weather: () => ({ city: '' }),
  forecast: () => ({ city: '' }),
  forecast3d: () => ({ city: '' }),
  qr: () => ({ url: '' }),
  quote: () => ({ content: '', author: '' }),
  date: () => ({ _placeholder: '' }),
  moon: () => ({ _placeholder: '' }),
  sun: () => ({ city: '' }),
  aqi: () => ({ city: '' }),
  progress: () => ({ progressLabel: 'Year', startDate: '', endDate: '' }),
};

const LABELS: Record<EditorBoxType, string> = {
  text: 'Text',
  countdown: 'Countdown',
  weather: 'Weather',
  forecast: '8hr Forecast',
  forecast3d: '8-Day Forecast',
  qr: 'QR Code',
  quote: 'Quote',
  date: 'Date',
  moon: 'Moon Phase',
  sun: 'Sunrise/Sunset',
  aqi: 'Air Quality',
  progress: 'Progress',
};

// -- Default box set --------------------------------------------------------

function defaultBoxes(): EditorBox[] {
  return [
    {
      id: uid(),
      type: 'weather',
      label: 'Weather',
      config: {
        city: 'Portland, OR',
        data: { temperature: 47, condition: 'Partly Cloudy', high: 62, low: 42 },
      } as WeatherConfig,
    },
    {
      id: uid(),
      type: 'forecast3d',
      label: '8-Day Forecast',
      config: {
        city: 'Portland, OR',
        entries: [
          { day: 'Sat', high: 62, low: 43, condition: 'Partly Cloudy' },
          { day: 'Sun', high: 70, low: 46, condition: 'Rain' },
          { day: 'Mon', high: 56, low: 45, condition: 'Partly Cloudy' },
          { day: 'Tue', high: 59, low: 47, condition: 'Rain' },
          { day: 'Wed', high: 74, low: 42, condition: 'Clear' },
          { day: 'Thu', high: 78, low: 49, condition: 'Partly Cloudy' },
          { day: 'Fri', high: 75, low: 53, condition: 'Partly Cloudy' },
          { day: 'Sat', high: 70, low: 48, condition: 'Partly Cloudy' },
        ],
      } as Forecast3DConfig,
    },
    {
      id: uid(),
      type: 'quote',
      label: 'Quote',
      config: {
        content: 'Being wrong brings the opportunity for growth.',
        author: 'Mark Manson',
      } as QuoteConfig,
    },
  ];
}

// -- State + render callback ------------------------------------------------

const DEFAULT_FONT_SIZE = 39;
const DEFAULT_CORNER_RADIUS = 3;
const DEFAULT_PADDING = 4;

const state: EditorState = {
  boxes: defaultBoxes(),
  showHeaders: false,
  fontSize: DEFAULT_FONT_SIZE,
  cornerRadius: DEFAULT_CORNER_RADIUS,
  padding: DEFAULT_PADDING,
};

let _renderFn: (() => void) | null = null;
let _previewFn: (() => void) | null = null;

/** Register the full render function (called once at init) */
export function onRender(fn: () => void): void {
  _renderFn = fn;
}

/** Register the preview-only render function */
export function onPreviewRender(fn: () => void): void {
  _previewFn = fn;
}

/** Read current state (immutable reference — mutate only via setState) */
export function getState(): EditorState {
  return state;
}

/** Read the current boxes */
export function getBoxes(): EditorBox[] {
  return state.boxes;
}

/** Mutate state and trigger a full re-render */
export function setState(mutate: (s: EditorState) => void): void {
  mutate(state);
  persistToLocalStorage();
  _renderFn?.();
}

/** Trigger preview-only re-render (for live typing without full DOM rebuild) */
function renderPreview(): void {
  _previewFn?.();
}

// -- Box lookup -------------------------------------------------------------

function findBox(id: number): EditorBox | undefined {
  return state.boxes.find((b) => b.id === id);
}

// -- Actions ----------------------------------------------------------------

export function addBox(type: EditorBoxType): void {
  setState(() => {
    state.boxes.push({
      id: uid(),
      type,
      label: LABELS[type],
      config: DEFAULTS[type](),
    });
  });
}

export function removeBox(id: number): void {
  setState(() => {
    const idx = state.boxes.findIndex((b) => b.id === id);
    if (idx >= 0) state.boxes.splice(idx, 1);
  });
}

export function moveBox(id: number, dir: -1 | 1): void {
  setState(() => {
    const idx = state.boxes.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= state.boxes.length) return;
    const current = state.boxes[idx];
    const next = state.boxes[target];
    if (current === undefined || next === undefined) return;
    state.boxes[idx] = next;
    state.boxes[target] = current;
  });
}

export function updateConfig(id: number, key: string, value: string): void {
  const box = findBox(id);
  if (!box) return;
  (box.config as unknown as Record<string, string>)[key] = value;
  renderPreview();
}

export function updateWeatherData(id: number, data: WeatherData): void {
  const box = findBox(id);
  if (!box || box.type !== 'weather') return;
  (box.config as WeatherConfig).data = data;
  persistToLocalStorage();
  renderPreview();
}

export function updateForecastEntries(id: number, entries: ForecastEntry[]): void {
  const box = findBox(id);
  if (!box || box.type !== 'forecast') return;
  (box.config as ForecastConfig).entries = entries;
  persistToLocalStorage();
  renderPreview();
}

export function updateForecast3DEntries(id: number, entries: Forecast3DEntry[]): void {
  const box = findBox(id);
  if (!box || box.type !== 'forecast3d') return;
  (box.config as Forecast3DConfig).entries = entries;
  persistToLocalStorage();
  renderPreview();
}

export function updateSunData(id: number, data: SunData): void {
  const box = findBox(id);
  if (!box || box.type !== 'sun') return;
  (box.config as SunConfig).data = data;
  persistToLocalStorage();
  renderPreview();
}

export function updateAQIData(id: number, data: AQIData): void {
  const box = findBox(id);
  if (!box || box.type !== 'aqi') return;
  (box.config as AQIConfig).data = data;
  persistToLocalStorage();
  renderPreview();
}

export function updateLabel(id: number, value: string): void {
  const box = findBox(id);
  if (!box) return;
  box.label = value;
  renderPreview();
}

export function getShowHeaders(): boolean {
  return state.showHeaders;
}

export function setShowHeaders(value: boolean): void {
  state.showHeaders = value;
  persistToLocalStorage();
  renderPreview();
}

export function getFontSize(): number {
  return state.fontSize;
}

export function setFontSize(value: number): void {
  state.fontSize = Math.max(8, Math.min(42, value));
  persistToLocalStorage();
  renderPreview();
}

export function getCornerRadius(): number {
  return state.cornerRadius;
}

export function setCornerRadius(value: number): void {
  state.cornerRadius = Math.max(0, Math.min(5, value));
  persistToLocalStorage();
  renderPreview();
}

export function getPadding(): number {
  return state.padding;
}

export function setPadding(value: number): void {
  state.padding = Math.max(0, Math.min(10, value));
  persistToLocalStorage();
  renderPreview();
}

// -- LocalStorage persistence -----------------------------------------------

const STORAGE_KEY = 'infobento-config';

function persistToLocalStorage(): void {
  try {
    const data = {
      version: 2,
      boxes: state.boxes.map((b) => ({ type: b.type, label: b.label, config: { ...b.config } })),
      showHeaders: state.showHeaders,
      fontSize: state.fontSize,
      cornerRadius: state.cornerRadius,
      padding: state.padding,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function hydrateBoxes(
  raw: Array<{ type: string; label: string; config: Record<string, string> }>,
): EditorBox[] {
  return raw.map((b) => ({
    id: uid(),
    type: b.type as EditorBoxType,
    label: b.label,
    config: { ...b.config } as EditorBoxConfig,
  }));
}

function loadFromLocalStorage(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
      return false;
    }
    const obj = parsed as Record<string, unknown>;

    // Version 2: single boxes array
    if (obj.version === 2 && Array.isArray(obj.boxes)) {
      state.boxes = hydrateBoxes(
        obj.boxes as Array<{ type: string; label: string; config: Record<string, string> }>,
      );
      if (typeof obj.showHeaders === 'boolean') state.showHeaders = obj.showHeaders;
      if (typeof obj.fontSize === 'number') state.fontSize = obj.fontSize;
      if (typeof obj.cornerRadius === 'number') state.cornerRadius = obj.cornerRadius;
      if (typeof obj.padding === 'number') state.padding = obj.padding;
      return true;
    }

    // Version 1 migration: merge D + P boxes into single array
    if (
      obj.version === 1 &&
      'D' in obj &&
      'P' in obj &&
      Array.isArray((obj as { D: unknown }).D) &&
      Array.isArray((obj as { P: unknown }).P)
    ) {
      const v1 = obj as {
        D: Array<{ type: string; label: string; config: Record<string, string> }>;
        P: Array<{ type: string; label: string; config: Record<string, string> }>;
      };
      state.boxes = hydrateBoxes([...v1.D, ...v1.P]);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// Attempt to restore state from localStorage on module load
loadFromLocalStorage();

// -- Import -----------------------------------------------------------------

export function importJSON(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.style.display = 'none';

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(reader.result as string);
        if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
          alert('Invalid InfoBento config file: missing required fields.');
          return;
        }
        const obj = parsed as Record<string, unknown>;

        // Version 2: single boxes array
        if (obj.version === 2 && Array.isArray(obj.boxes)) {
          setState((s) => {
            s.boxes = hydrateBoxes(
              obj.boxes as Array<{ type: string; label: string; config: Record<string, string> }>,
            );
            if (typeof obj.showHeaders === 'boolean') s.showHeaders = obj.showHeaders;
          });
          return;
        }

        // Version 1 migration: merge D + P into single array
        if (obj.version === 1) {
          const v1 = obj as {
            D:
              | { boxes: Array<{ type: string; label: string; config: Record<string, string> }> }
              | Array<{ type: string; label: string; config: Record<string, string> }>;
            P:
              | { boxes: Array<{ type: string; label: string; config: Record<string, string> }> }
              | Array<{ type: string; label: string; config: Record<string, string> }>;
          };
          const dBoxes = Array.isArray(v1.D) ? v1.D : v1.D?.boxes;
          const pBoxes = Array.isArray(v1.P) ? v1.P : v1.P?.boxes;
          if (!Array.isArray(dBoxes) || !Array.isArray(pBoxes)) {
            alert('Invalid InfoBento config file: could not read boxes.');
            return;
          }
          setState((s) => {
            s.boxes = hydrateBoxes([...dBoxes, ...pBoxes]);
          });
          return;
        }

        alert('Invalid InfoBento config file: unsupported version.');
      } catch {
        alert('Failed to parse JSON file. Please check the file format.');
      }
    };
    reader.readAsText(file);
  });

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// -- Export -----------------------------------------------------------------

export function exportJSON(): void {
  const data = {
    version: 2,
    boxes: state.boxes.map((b) => ({
      type: b.type,
      label: b.label,
      config: { ...b.config },
    })),
    showHeaders: state.showHeaders,
    fontSize: state.fontSize,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infobento-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
