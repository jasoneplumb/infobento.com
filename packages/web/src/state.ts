/**
 * Reactive state management for the InfoBento box editor.
 *
 * Both displays (D = Outer / public, P = Inner / private) are always live;
 * actions take an explicit displayId. setState() triggers a synchronous
 * re-render of every panel.
 */

import type { BentoBoxType, DisplayId, WeatherData, ForecastEntry } from '@infobento/core';

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

export type EditorBoxConfig =
  | TextConfig
  | CountdownConfig
  | WeatherConfig
  | ForecastConfig
  | QRConfig
  | QuoteConfig;

export type EditorBoxType = Extract<
  BentoBoxType,
  'text' | 'countdown' | 'weather' | 'forecast' | 'qr' | 'quote'
>;

export interface EditorBox {
  id: number;
  type: EditorBoxType;
  label: string;
  config: EditorBoxConfig;
}

export interface EditorState {
  boxesD: EditorBox[];
  boxesP: EditorBox[];
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
};

const LABELS: Record<EditorBoxType, string> = {
  text: 'Text',
  countdown: 'Countdown',
  weather: 'Weather',
  forecast: '3hr Forecast',
  qr: 'QR Code',
  quote: 'Quote',
};

// -- Default box sets per display -------------------------------------------

function defaultBoxesD(): EditorBox[] {
  return [
    { id: uid(), type: 'weather', label: 'Weather', config: DEFAULTS.weather() },
    { id: uid(), type: 'countdown', label: 'Countdown', config: DEFAULTS.countdown() },
    { id: uid(), type: 'text', label: 'Text', config: DEFAULTS.text() },
  ];
}

function defaultBoxesP(): EditorBox[] {
  return [
    { id: uid(), type: 'quote', label: 'Quote', config: DEFAULTS.quote() },
    { id: uid(), type: 'countdown', label: 'Countdown', config: DEFAULTS.countdown() },
  ];
}

// -- State + render callback ------------------------------------------------

const state: EditorState = {
  boxesD: defaultBoxesD(),
  boxesP: defaultBoxesP(),
};

function boxesFor(displayId: DisplayId): EditorBox[] {
  return displayId === 'D' ? state.boxesD : state.boxesP;
}

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

/** Read the boxes for a specific display */
export function getBoxes(displayId: DisplayId): EditorBox[] {
  return boxesFor(displayId);
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

// -- Box lookup (searches both displays — ids are globally unique) ----------

function findBox(id: number): EditorBox | undefined {
  return state.boxesD.find((b) => b.id === id) ?? state.boxesP.find((b) => b.id === id);
}

// -- Actions ----------------------------------------------------------------

export function addBox(displayId: DisplayId, type: EditorBoxType): void {
  setState(() => {
    boxesFor(displayId).push({
      id: uid(),
      type,
      label: LABELS[type],
      config: DEFAULTS[type](),
    });
  });
}

export function removeBox(displayId: DisplayId, id: number): void {
  setState(() => {
    const arr = boxesFor(displayId);
    const idx = arr.findIndex((b) => b.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  });
}

export function moveBox(displayId: DisplayId, id: number, dir: -1 | 1): void {
  setState(() => {
    const arr = boxesFor(displayId);
    const idx = arr.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    const current = arr[idx];
    const next = arr[target];
    if (current === undefined || next === undefined) return;
    arr[idx] = next;
    arr[target] = current;
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
      version: 1,
      D: state.boxesD.map((b) => ({ type: b.type, label: b.label, config: { ...b.config } })),
      P: state.boxesP.map((b) => ({ type: b.type, label: b.label, config: { ...b.config } })),
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
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      !('D' in parsed) ||
      !('P' in parsed)
    ) {
      return false;
    }
    const obj = parsed as {
      version: number;
      D: Array<{ type: string; label: string; config: Record<string, string> }>;
      P: Array<{ type: string; label: string; config: Record<string, string> }>;
    };
    if (!Array.isArray(obj.D) || !Array.isArray(obj.P)) return false;

    state.boxesD = hydrateBoxes(obj.D);
    state.boxesP = hydrateBoxes(obj.P);
    return true;
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
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          !('version' in parsed) ||
          !('D' in parsed) ||
          !('P' in parsed)
        ) {
          alert('Invalid InfoBento config file: missing required fields.');
          return;
        }
        const obj = parsed as {
          version: number;
          D: {
            displayId?: string;
            boxes: Array<{ type: string; label: string; config: Record<string, string> }>;
          };
          P: {
            displayId?: string;
            boxes: Array<{ type: string; label: string; config: Record<string, string> }>;
          };
        };
        if (!Array.isArray(obj.D?.boxes) || !Array.isArray(obj.P?.boxes)) {
          alert('Invalid InfoBento config file: D and P must contain boxes arrays.');
          return;
        }

        setState((s) => {
          s.boxesD = hydrateBoxes(obj.D.boxes);
          s.boxesP = hydrateBoxes(obj.P.boxes);
        });
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
  const mapBoxes = (boxes: EditorBox[]) =>
    boxes.map((b) => ({
      type: b.type,
      label: b.label,
      config: { ...b.config },
    }));

  const data = {
    version: 1,
    D: { displayId: 'D', boxes: mapBoxes(state.boxesD) },
    P: { displayId: 'P', boxes: mapBoxes(state.boxesP) },
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infobento-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
