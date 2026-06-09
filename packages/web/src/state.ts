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
  StockData,
  StockDuration,
  CalendarEvent,
  HabitEntry,
} from '@infobento/core';
import { DEFAULT_STOCK_DURATION, DEVICE_PROFILES, DEFAULT_PROFILE_ID } from '@infobento/core';
import type { DeviceProfilePreset } from '@infobento/core';

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
  /** Number of upcoming hours to fetch/render (1–24, default 3). */
  hours?: number;
  entries?: ForecastEntry[];
}

export interface Forecast3DConfig {
  city: string;
  /** Number of upcoming days to fetch/render (1–20, default 3). */
  days?: number;
  entries?: Forecast3DEntry[];
}

export interface QRConfig {
  url: string;
}

export interface QuoteConfig {
  content: string;
  author: string;
  tags?: string;
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

export interface HoroscopeConfig {
  sign: string;
  content: string;
  date: string;
}

export interface JokeConfig {
  content: string;
  category?: string;
  categories?: string; // user's CSV input filter
}

export interface OnThisDayConfig {
  content: string;
  year?: string;
  category: string; // events | births | deaths | holidays | all
}

export interface StocksConfig {
  symbol: string;
  duration?: StockDuration;
  data?: StockData;
}

export interface CalendarConfig {
  events: CalendarEvent[];
}

export interface HabitConfig {
  habits: HabitEntry[];
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
  | ProgressConfig
  | HoroscopeConfig
  | JokeConfig
  | OnThisDayConfig
  | StocksConfig
  | CalendarConfig
  | HabitConfig;

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
  | 'horoscope'
  | 'joke'
  | 'onthisday'
  | 'stocks'
  | 'calendar'
  | 'habit'
>;

export interface EditorBox {
  id: number;
  type: EditorBoxType;
  label: string;
  config: EditorBoxConfig;
  split?: 'left' | 'right';
  /** Left-box width % (divider position), 20–80, default 50. */
  splitRatio?: number;
}

export interface EditorState {
  boxes: EditorBox[];
  showHeaders: boolean;
  fontSize: number;
  /** Body font weight (0.1–0.9 → Inter static weight 100–900). */
  fontWeight: number;
  cornerRadius: number;
  padding: number;
  profileId: string;
  /** Temperature unit for weather/forecast displays (derived from IP locale). */
  tempUnit: 'F' | 'C';
  /** Box-type chips the user has hidden from the Add palette. */
  hiddenChips: EditorBoxType[];
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
  forecast: () => ({ city: '', hours: 3 }),
  forecast3d: () => ({ city: '', days: 3 }),
  qr: () => ({ url: '' }),
  quote: () => ({ content: '', author: '' }),
  date: () => ({ _placeholder: '' }),
  moon: () => ({ _placeholder: '' }),
  sun: () => ({ city: '' }),
  aqi: () => ({ city: '' }),
  progress: () => ({ progressLabel: 'Year', startDate: '', endDate: '' }),
  horoscope: () => ({ sign: '', content: '', date: '' }),
  joke: () => ({ content: '' }),
  onthisday: () => ({ content: '', category: 'events' }),
  stocks: () => ({ symbol: '', duration: DEFAULT_STOCK_DURATION }),
  calendar: () => ({ events: [] }),
  habit: () => ({ habits: [{ name: '', streak: 0, completedToday: false }] }),
};

export const BOX_TYPE_LABELS: Record<EditorBoxType, string> = {
  text: 'Text',
  countdown: 'Countdown',
  weather: 'Weather',
  forecast: 'Hourly Forecast',
  forecast3d: 'Daily Forecast',
  qr: 'QR Code',
  quote: 'Quote',
  date: 'Date',
  moon: 'Moon Phase',
  sun: 'Sunrise/Sunset',
  aqi: 'Air Quality',
  progress: 'Progress',
  horoscope: 'Horoscope',
  joke: 'Joke',
  onthisday: 'On This Day',
  stocks: 'Stocks',
  calendar: 'Calendar',
  habit: 'Habits',
};

/**
 * Add-palette chips grouped by theme so related box types are easy to find.
 * Every EditorBoxType appears in exactly one group, in display order.
 */
export const CHIP_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly types: readonly EditorBoxType[];
}> = [
  { label: 'Weather & Sky', types: ['weather', 'forecast', 'forecast3d', 'aqi', 'moon', 'sun'] },
  { label: 'Time & Dates', types: ['date', 'countdown', 'progress', 'calendar'] },
  { label: 'Personal', types: ['habit', 'stocks'] },
  { label: 'Fun & Discovery', types: ['quote', 'joke', 'horoscope', 'onthisday'] },
  { label: 'Utility', types: ['text', 'qr'] },
];

// -- Default box set --------------------------------------------------------

/**
 * First-time-user default layout (Round 12 Q4 decision, 2026-04-25).
 * 5 boxes, zero config required, no wizard:
 *   1. [Date | Weather]  merged top row
 *   2. Daily Forecast    full width
 *   3. Quote             full width
 *   4. On This Day       full width
 * All input fields empty → forms auto-fetch on first render. IP-based
 * detection (geolocation.ts:ensureLocationDefault) fills the city.
 */
function defaultBoxes(): EditorBox[] {
  return [
    {
      id: uid(),
      type: 'date',
      label: 'Date',
      config: { _placeholder: '' } as DateConfig,
      split: 'left',
    },
    {
      id: uid(),
      type: 'weather',
      label: 'Weather',
      config: { city: '' } as WeatherConfig,
      split: 'right',
    },
    {
      id: uid(),
      type: 'forecast3d',
      label: 'Daily Forecast',
      config: { city: '', days: 3 } as Forecast3DConfig,
    },
    {
      id: uid(),
      type: 'quote',
      label: 'Quote',
      config: { content: '', author: '' } as QuoteConfig,
    },
    {
      id: uid(),
      type: 'onthisday',
      label: 'On This Day',
      config: { content: '', category: 'events' } as OnThisDayConfig,
    },
  ];
}

// -- State + render callback ------------------------------------------------

const DEFAULT_FONT_SIZE = 38;
const DEFAULT_FONT_WEIGHT = 0.4; // Inter Regular (400)
const DEFAULT_CORNER_RADIUS = 3;
const DEFAULT_PADDING = 4;

/** Clamp a font weight to the slider's [0.1, 0.9] range AND snap it to the 0.1
 *  step grid, so externally-edited values stay consistent with the slider, the
 *  `multipleOf(0.1)` API contract, and the renderer's `snapWeight`. */
const clampFontWeight = (v: number): number =>
  Math.round(Math.max(0.1, Math.min(0.9, v)) * 10) / 10;

const state: EditorState = {
  boxes: defaultBoxes(),
  showHeaders: false,
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: DEFAULT_FONT_WEIGHT,
  cornerRadius: DEFAULT_CORNER_RADIUS,
  padding: DEFAULT_PADDING,
  profileId: DEFAULT_PROFILE_ID,
  tempUnit: 'F',
  hiddenChips: [],
};

// Location-dependent rows share one location; a new one defaults to it.
export const LOCATION_TYPES: ReadonlySet<EditorBoxType> = new Set([
  'weather',
  'forecast',
  'forecast3d',
  'sun',
  'aqi',
]);

// Most recently set city (from detection, the location button, or typing).
let lastKnownLocation = '';

/** The location currently in use: any populated location row, else the last set. */
export function getKnownLocation(): string {
  for (const box of state.boxes) {
    if (LOCATION_TYPES.has(box.type)) {
      const city = (box.config as { city?: string }).city;
      if (city && city.trim()) return city;
    }
  }
  return lastKnownLocation;
}

/** Record a detected/used location so new location rows can default to it. */
export function noteLocation(city: string): void {
  if (city.trim()) lastKnownLocation = city;
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
    const config = DEFAULTS[type]();
    // Location-dependent rows default to the user's current location so they
    // work out of the box (the config form auto-fetches data on render).
    if (LOCATION_TYPES.has(type)) {
      const loc = getKnownLocation();
      if (loc) (config as unknown as { city: string }).city = loc;
    }
    state.boxes.push({
      id: uid(),
      type,
      label: BOX_TYPE_LABELS[type],
      config,
    });
  });
}

/**
 * Change a box's type in place. Preserves layout (split partner, splitRatio,
 * ordering) and resets `config` to the new type's defaults.
 * The label is overwritten with the new default only if the user has not
 * customized it (i.e. it still matches the old type's default label) —
 * a custom label like "Today" survives a type swap.
 */
export function changeBoxType(id: number, newType: EditorBoxType): void {
  // Guard outside setState so a no-op self-swap doesn't trigger a
  // localStorage write + full re-render. (The browser's change event won't
  // fire for same-option reselection, but a programmatic call could.)
  const box = findBox(id);
  if (!box || box.type === newType) return;
  setState(() => {
    const wasDefaultLabel = box.label === BOX_TYPE_LABELS[box.type];
    box.type = newType;
    box.config = DEFAULTS[newType]();
    if (wasDefaultLabel) box.label = BOX_TYPE_LABELS[newType];
  });
}

export function removeBox(id: number): void {
  setState(() => {
    const idx = state.boxes.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const box = state.boxes[idx];
    state.boxes.splice(idx, 1);
    // Clear orphaned split partner
    if (box?.split === 'left') {
      const partner = state.boxes[idx]; // next box shifted into this position
      if (partner?.split === 'right') delete partner.split;
    } else if (box?.split === 'right') {
      const partner = state.boxes[idx - 1];
      if (partner?.split === 'left') delete partner.split;
    }
  });
}

export function moveBox(id: number, dir: -1 | 1): void {
  setState(() => {
    const idx = state.boxes.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const box = state.boxes[idx];
    if (!box) return;

    // If part of a pair, move both as a unit
    if (box.split === 'left' || box.split === 'right') {
      const leftIdx = box.split === 'left' ? idx : idx - 1;
      const rightIdx = leftIdx + 1;
      if (leftIdx < 0 || rightIdx >= state.boxes.length) return;

      if (dir === -1 && leftIdx === 0) return;
      if (dir === 1 && rightIdx >= state.boxes.length - 1) return;

      // Extract the pair
      const pair = state.boxes.splice(leftIdx, 2);
      // Insert at new position
      const insertAt = dir === -1 ? leftIdx - 1 : leftIdx + 1;
      state.boxes.splice(insertAt, 0, ...pair);
      return;
    }

    const target = idx + dir;
    if (target < 0 || target >= state.boxes.length) return;
    const next = state.boxes[target];
    if (next === undefined) return;

    // If the swap target is part of a split pair, jump over the entire pair
    // instead of swapping into it (which would orphan the pair's split markers).
    if (next.split === 'left' || next.split === 'right') {
      const pairLeftIdx = next.split === 'left' ? target : target - 1;
      const pairRightIdx = pairLeftIdx + 1;
      const insertBefore = dir === -1 ? pairLeftIdx : pairRightIdx + 1;
      state.boxes.splice(idx, 1);
      const adjustedInsert = idx < insertBefore ? insertBefore - 1 : insertBefore;
      state.boxes.splice(adjustedInsert, 0, box);
      return;
    }

    state.boxes[idx] = next;
    state.boxes[target] = box;
  });
}

export function mergeBoxes(topId: number, bottomId: number): void {
  setState(() => {
    const topIdx = state.boxes.findIndex((b) => b.id === topId);
    const bottomIdx = state.boxes.findIndex((b) => b.id === bottomId);
    if (topIdx < 0 || bottomIdx < 0) return;
    // Ensure adjacency
    if (bottomIdx !== topIdx + 1) {
      const [bottomBox] = state.boxes.splice(bottomIdx, 1);
      if (!bottomBox) return;
      state.boxes.splice(topIdx + 1, 0, bottomBox);
    }
    const left = state.boxes[topIdx];
    const right = state.boxes[topIdx + 1];
    if (left) left.split = 'left';
    if (right) right.split = 'right';
  });
}

export function splitBoxes(leftId: number): void {
  setState(() => {
    const idx = state.boxes.findIndex((b) => b.id === leftId);
    if (idx < 0) return;
    const left = state.boxes[idx];
    const right = state.boxes[idx + 1];
    if (left) delete left.split;
    if (right?.split === 'right') delete right.split;
  });
}

/** Set the divider position of a split pair (left-box width %, clamped 20–80). */
export function setSplitRatio(id: number, ratio: number): void {
  setState(() => {
    const box = findBox(id);
    if (!box) return;
    box.splitRatio = Math.min(80, Math.max(20, Math.round(ratio)));
  });
}

export function updateConfig(id: number, key: string, value: string | number): void {
  const box = findBox(id);
  if (!box) return;
  (box.config as unknown as Record<string, string | number>)[key] = value;
  // Remember the latest location so newly-added location rows can default to it.
  if (key === 'city' && typeof value === 'string' && value.trim()) lastKnownLocation = value;
  renderPreview();
}

/** In-row list edits — does not rebuild the form (keeps input focus). */
export function updateConfigList<T>(id: number, key: string, items: T[]): void {
  const box = findBox(id);
  if (!box) return;
  (box.config as unknown as Record<string, T[]>)[key] = items;
  renderPreview();
}

/** Add/remove rows — uses setState so the form rebuilds with the new row count. */
export function appendToConfigList<T>(id: number, key: string, item: T): void {
  setState(() => {
    const box = findBox(id);
    if (!box) return;
    const list = (box.config as unknown as Record<string, T[]>)[key];
    if (Array.isArray(list)) list.push(item);
  });
}

export function removeFromConfigList(id: number, key: string, idx: number): void {
  setState(() => {
    const box = findBox(id);
    if (!box) return;
    const list = (box.config as unknown as Record<string, unknown[]>)[key];
    if (Array.isArray(list) && idx >= 0 && idx < list.length) list.splice(idx, 1);
  });
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

export function updateStocksData(id: number, data: StockData): void {
  const box = findBox(id);
  if (!box || box.type !== 'stocks') return;
  (box.config as StocksConfig).data = data;
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

/** Body font weight (0.1–0.9 → Inter static weight 100–900). */
export function getFontWeight(): number {
  return state.fontWeight;
}

export function setFontWeight(value: number): void {
  state.fontWeight = clampFontWeight(value);
  persistToLocalStorage();
  renderPreview();
}

export function getCornerRadius(): number {
  return state.cornerRadius;
}

export function setCornerRadius(value: number): void {
  state.cornerRadius = Math.max(0, Math.min(10, value));
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

/** The selected display profile (resolution the simulator renders at). */
export function getDeviceProfile(): DeviceProfilePreset {
  return (
    DEVICE_PROFILES.find((p) => p.id === state.profileId) ??
    DEVICE_PROFILES.find((p) => p.id === DEFAULT_PROFILE_ID) ??
    DEVICE_PROFILES[0]
  );
}

export function setDeviceProfile(id: string): void {
  if (DEVICE_PROFILES.some((p) => p.id === id)) {
    state.profileId = id;
    persistToLocalStorage();
    renderPreview();
  }
}

/** The temperature unit (F/C) used by weather & forecast boxes. */
export function getTempUnit(): 'F' | 'C' {
  return state.tempUnit;
}

/** Set the temperature unit (typically from IP-locale detection). */
export function setTempUnit(unit: 'F' | 'C'): void {
  if (state.tempUnit === unit) return;
  state.tempUnit = unit;
  persistToLocalStorage();
  renderPreview();
}

/** Box-type chips the user has hidden from the Add palette. */
export function getHiddenChips(): EditorBoxType[] {
  return state.hiddenChips;
}

/** Hide a chip from the Add palette (still restorable from the Hidden list). */
export function hideChip(type: EditorBoxType): void {
  setState((s) => {
    if (!s.hiddenChips.includes(type)) s.hiddenChips.push(type);
  });
}

/** Restore a previously hidden chip to its group in the Add palette. */
export function restoreChip(type: EditorBoxType): void {
  setState((s) => {
    s.hiddenChips = s.hiddenChips.filter((t) => t !== type);
  });
}

// -- LocalStorage persistence -----------------------------------------------

const STORAGE_KEY = 'infobento-config';

/** Serialize boxes for persistence and export, including merged-row markers. */
export function serializeBoxes(boxes: EditorBox[]) {
  return boxes.map((b) => ({
    type: b.type,
    label: b.label,
    config: { ...b.config },
    ...(b.split ? { split: b.split } : {}),
    ...(b.splitRatio && b.splitRatio !== 50 ? { splitRatio: b.splitRatio } : {}),
  }));
}

function persistToLocalStorage(): void {
  try {
    const data = {
      version: 2,
      boxes: serializeBoxes(state.boxes),
      showHeaders: state.showHeaders,
      fontSize: state.fontSize,
      fontWeight: state.fontWeight,
      cornerRadius: state.cornerRadius,
      padding: state.padding,
      profileId: state.profileId,
      tempUnit: state.tempUnit,
      hiddenChips: state.hiddenChips,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

function hydrateBoxes(
  raw: Array<{
    type: string;
    label: string;
    config: Record<string, string>;
    split?: string;
    splitRatio?: number;
  }>,
): EditorBox[] {
  const boxes = raw.map((b) => ({
    id: uid(),
    type: b.type as EditorBoxType,
    label: b.label,
    config: { ...b.config } as EditorBoxConfig,
    ...(b.split === 'left' || b.split === 'right' ? { split: b.split } : {}),
    ...(() => {
      // Migrate legacy enum ratios (1/2/3) → percentages; accept raw % too.
      const sr = b.splitRatio;
      const pct = sr === 1 ? 33 : sr === 2 ? 50 : sr === 3 ? 67 : typeof sr === 'number' ? sr : 50;
      const clamped = Math.min(80, Math.max(20, Math.round(pct)));
      return clamped !== 50 ? { splitRatio: clamped } : {};
    })(),
  }));
  // Repair orphaned split markers from older bug where reordering split pairs.
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box) continue;
    if (box.split === 'left' && boxes[i + 1]?.split !== 'right') {
      delete box.split;
    } else if (box.split === 'right' && boxes[i - 1]?.split !== 'left') {
      delete box.split;
    }
  }
  return boxes;
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
      if (typeof obj.fontWeight === 'number') state.fontWeight = clampFontWeight(obj.fontWeight);
      if (typeof obj.cornerRadius === 'number') state.cornerRadius = obj.cornerRadius;
      if (typeof obj.padding === 'number') state.padding = obj.padding;
      if (
        typeof obj.profileId === 'string' &&
        DEVICE_PROFILES.some((p) => p.id === obj.profileId)
      ) {
        state.profileId = obj.profileId;
      }
      if (obj.tempUnit === 'F' || obj.tempUnit === 'C') state.tempUnit = obj.tempUnit;
      if (Array.isArray(obj.hiddenChips)) {
        const valid = new Set(Object.keys(BOX_TYPE_LABELS));
        state.hiddenChips = (obj.hiddenChips as unknown[]).filter(
          (t): t is EditorBoxType => typeof t === 'string' && valid.has(t),
        );
      }
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
              obj.boxes as Array<{
                type: string;
                label: string;
                config: Record<string, string>;
                split?: string;
                splitRatio?: number;
              }>,
            );
            if (typeof obj.showHeaders === 'boolean') s.showHeaders = obj.showHeaders;
            if (typeof obj.fontSize === 'number') s.fontSize = obj.fontSize;
            if (typeof obj.fontWeight === 'number') s.fontWeight = clampFontWeight(obj.fontWeight);
            if (typeof obj.cornerRadius === 'number') s.cornerRadius = obj.cornerRadius;
            if (typeof obj.padding === 'number') s.padding = obj.padding;
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
    boxes: serializeBoxes(state.boxes),
    showHeaders: state.showHeaders,
    fontSize: state.fontSize,
    fontWeight: state.fontWeight,
    cornerRadius: state.cornerRadius,
    padding: state.padding,
    tempUnit: state.tempUnit,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infobento-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
