/**
 * Reactive state management for the InfoBento box editor.
 *
 * Single-display model: one preview, one editor column.
 * setState() triggers a synchronous re-render of every panel.
 */

import type { BentoBoxType, WeatherData, ForecastEntry, SunData, AQIData } from '@infobento/core';

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

export interface QRConfig {
  url: string;
}

export interface QuoteConfig {
  content: string;
  author: string;
}

export interface DateConfig {
  showWeekNumber: boolean;
  showDayOfYear: boolean;
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
  qr: () => ({ url: '' }),
  quote: () => ({ content: '', author: '' }),
  date: () => ({ showWeekNumber: false, showDayOfYear: false }),
  moon: () => ({ _placeholder: '' }),
  sun: () => ({ city: '' }),
  aqi: () => ({ city: '' }),
  progress: () => ({ progressLabel: 'Year', startDate: '', endDate: '' }),
};

const LABELS: Record<EditorBoxType, string> = {
  text: 'Text',
  countdown: 'Countdown',
  weather: 'Weather',
  forecast: '3hr Forecast',
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
    { id: uid(), type: 'weather', label: 'Weather', config: DEFAULTS.weather() },
    { id: uid(), type: 'countdown', label: 'Countdown', config: DEFAULTS.countdown() },
    { id: uid(), type: 'text', label: 'Text', config: DEFAULTS.text() },
  ];
}

// -- State + render callback ------------------------------------------------

const state: EditorState = {
  boxes: defaultBoxes(),
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

// -- LocalStorage persistence -----------------------------------------------

const STORAGE_KEY = 'infobento-config';

function persistToLocalStorage(): void {
  try {
    const data = {
      version: 2,
      boxes: state.boxes.map((b) => ({ type: b.type, label: b.label, config: { ...b.config } })),
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
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infobento-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
