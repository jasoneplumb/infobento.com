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
} from '@infobento/core';
import { DEFAULT_STOCK_DURATION, DEVICE_PROFILES, DEFAULT_PROFILE_ID } from '@infobento/core';
import { DEFAULT_REFRESHES_PER_DAY, MAX_REFRESHES_PER_DAY } from '@infobento/core';
import { validateBentoConfig } from '@infobento/core';
import type { DeviceProfilePreset, BentoConfig } from '@infobento/core';
// config-map ↔ state form a runtime-only cycle: these are invoked from
// exportJSON/loadConfig, never at module init, so the static import is safe.
import { toBentoConfig, fromBentoConfig } from './config-map';

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
  /** Optional location so the date renders in the device's local timezone (#168). */
  city?: string;
  showYearProgress?: boolean;
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
  | OnThisDayConfig
  | StocksConfig;

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
  | 'onthisday'
  | 'stocks'
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
  /** Scheduled data refreshes per day (0=off … MAX_REFRESHES_PER_DAY≈15s). */
  refreshesPerDay: number;
  profileId: string;
  /** Temperature unit for weather/forecast displays (derived from IP locale). */
  tempUnit: 'F' | 'C';
  /** True when location rows were filled with the UTC+0 fallback guess (#183). */
  locationIsFallback: boolean;
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
  onthisday: () => ({ content: '', category: 'events' }),
  stocks: () => ({ symbol: '', duration: DEFAULT_STOCK_DURATION }),
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
  onthisday: 'On This Day',
  stocks: 'Stocks',
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
  { label: 'Time & Dates', types: ['date', 'countdown', 'progress'] },
  { label: 'Markets', types: ['stocks'] },
  { label: 'Fun & Discovery', types: ['quote', 'horoscope', 'onthisday'] },
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
      config: { city: '' } as DateConfig,
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

/** Clamp a corner-radius level to the stepper's [0, 7] range. */
const clampCornerRadius = (v: number): number => Math.max(0, Math.min(7, v));

/** Clamp refreshes-per-day to an integer in [0, MAX_REFRESHES_PER_DAY]. */
const clampRefreshesPerDay = (v: number): number =>
  Math.max(0, Math.min(MAX_REFRESHES_PER_DAY, Math.floor(v)));

const state: EditorState = {
  boxes: defaultBoxes(),
  showHeaders: false,
  fontSize: DEFAULT_FONT_SIZE,
  fontWeight: DEFAULT_FONT_WEIGHT,
  cornerRadius: DEFAULT_CORNER_RADIUS,
  padding: DEFAULT_PADDING,
  refreshesPerDay: DEFAULT_REFRESHES_PER_DAY,
  profileId: DEFAULT_PROFILE_ID,
  tempUnit: 'F',
  locationIsFallback: false,
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

// Box types whose city is optional but still location-parameterized (#183).
export const OPTIONAL_LOCATION_TYPES: ReadonlySet<EditorBoxType> = new Set(['date']);

/**
 * Every box type that can be parameterized by location — THE canonical set.
 * Detection and the UTC+0 fallback both derive from it, so adding a future
 * location-parameterized type means touching only the sets above.
 */
export const LOCATION_PARAM_TYPES: ReadonlySet<EditorBoxType> = new Set([
  ...LOCATION_TYPES,
  ...OPTIONAL_LOCATION_TYPES,
]);

/**
 * The UTC+0 default city applied when no location can be detected (#183).
 * A guess, not a confirmed location: it is never recorded via noteLocation,
 * and rows still holding it are replaced by a later successful detection.
 */
export const FALLBACK_LOCATION = 'London, UK';

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
  if (!city.trim()) return;
  lastKnownLocation = city;
  // A real location supersedes the UTC+0 guess (#183).
  setLocationFallback(false);
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

// -- Persistence mode (local vs cloud, issue #76) ---------------------------
//
// Default is 'local': every state change writes to localStorage, exactly as
// before. When a signed-in user selects a paired device, the editor switches to
// 'cloud': changes are pushed to PUT /api/device/<id>/config (debounced by the
// registered cloud saver) and localStorage is left UNTOUCHED, so the user's
// local "tinkering" buffer survives intact and is restored on sign-out.

export type PersistenceMode = 'local' | 'cloud';

let _persistenceMode: PersistenceMode = 'local';
let _activeDeviceId: string | null = null;
let _cloudPersistFn: (() => void) | null = null;
// Set while applying a config loaded FROM the cloud, so the load doesn't
// immediately echo back as a save.
let _suppressPersist = false;

/** Register the (debounced) cloud-save function used in cloud mode. */
export function onCloudPersist(fn: () => void): void {
  _cloudPersistFn = fn;
}

export function getPersistenceMode(): PersistenceMode {
  return _persistenceMode;
}

export function getActiveDeviceId(): string | null {
  return _activeDeviceId;
}

/**
 * Switch to cloud persistence for `deviceId`. Subsequent edits push to the
 * device's server-side config instead of localStorage. The local buffer is not
 * written or cleared. Optionally seeds the editor from a config the caller
 * already fetched (applied without triggering a redundant save-back).
 */
export function enterCloudMode(deviceId: string, seed?: unknown): void {
  _persistenceMode = 'cloud';
  _activeDeviceId = deviceId;
  if (seed !== undefined) {
    _suppressPersist = true;
    try {
      loadConfig(seed);
    } finally {
      _suppressPersist = false;
    }
  }
}

/**
 * Leave cloud mode and restore the local-only editor. Reloads the preserved
 * localStorage buffer into the editor so the user's pre-sign-in work reappears
 * exactly as they left it (sign-out must not lose the local edits buffer).
 */
export function exitToLocalMode(): void {
  _persistenceMode = 'local';
  _activeDeviceId = null;
  // Restore the untouched local buffer; if there was none, keep current boxes.
  _suppressPersist = true;
  try {
    loadFromLocalStorage();
  } finally {
    _suppressPersist = false;
  }
  _renderFn?.();
}

/** Test-only: reset persistence mode/hooks between cases. */
export function _resetPersistenceForTesting(): void {
  _persistenceMode = 'local';
  _activeDeviceId = null;
  _cloudPersistFn = null;
  _suppressPersist = false;
}

/** Persist current state via the active mode (localStorage or cloud). */
function persist(): void {
  if (_suppressPersist) return;
  if (_persistenceMode === 'cloud') {
    _cloudPersistFn?.();
  } else {
    persistToLocalStorage();
  }
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
  persist();
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

export function updateConfig(id: number, key: string, value: string | number | boolean): void {
  const box = findBox(id);
  if (!box) return;
  (box.config as unknown as Record<string, string | number | boolean>)[key] = value;
  // Remember the latest location so newly-added location rows can default to it.
  if (key === 'city' && typeof value === 'string' && value.trim()) lastKnownLocation = value;
  renderPreview();
}

export function updateWeatherData(id: number, data: WeatherData): void {
  const box = findBox(id);
  if (!box || box.type !== 'weather') return;
  (box.config as WeatherConfig).data = data;
  persist();
  renderPreview();
}

export function updateForecastEntries(id: number, entries: ForecastEntry[]): void {
  const box = findBox(id);
  if (!box || box.type !== 'forecast') return;
  (box.config as ForecastConfig).entries = entries;
  persist();
  renderPreview();
}

export function updateForecast3DEntries(id: number, entries: Forecast3DEntry[]): void {
  const box = findBox(id);
  if (!box || box.type !== 'forecast3d') return;
  (box.config as Forecast3DConfig).entries = entries;
  persist();
  renderPreview();
}

export function updateSunData(id: number, data: SunData): void {
  const box = findBox(id);
  if (!box || box.type !== 'sun') return;
  (box.config as SunConfig).data = data;
  persist();
  renderPreview();
}

export function updateAQIData(id: number, data: AQIData): void {
  const box = findBox(id);
  if (!box || box.type !== 'aqi') return;
  (box.config as AQIConfig).data = data;
  persist();
  renderPreview();
}

export function updateStocksData(id: number, data: StockData): void {
  const box = findBox(id);
  if (!box || box.type !== 'stocks') return;
  (box.config as StocksConfig).data = data;
  persist();
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
  persist();
  renderPreview();
}

export function getFontSize(): number {
  return state.fontSize;
}

export function setFontSize(value: number): void {
  state.fontSize = Math.max(8, Math.min(42, value));
  persist();
  renderPreview();
}

/** Body font weight (0.1–0.9 → Inter static weight 100–900). */
export function getFontWeight(): number {
  return state.fontWeight;
}

export function setFontWeight(value: number): void {
  state.fontWeight = clampFontWeight(value);
  persist();
  renderPreview();
}

export function getCornerRadius(): number {
  return state.cornerRadius;
}

export function setCornerRadius(value: number): void {
  state.cornerRadius = clampCornerRadius(value);
  persist();
  renderPreview();
}

export function getPadding(): number {
  return state.padding;
}

export function setPadding(value: number): void {
  state.padding = Math.max(0, Math.min(10, value));
  persist();
  renderPreview();
}

/** Scheduled data refreshes per day (0 = off). Interval = 86400 / value. */
export function getRefreshesPerDay(): number {
  return state.refreshesPerDay;
}

export function setRefreshesPerDay(value: number): void {
  state.refreshesPerDay = clampRefreshesPerDay(value);
  persist();
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
    persist();
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
  persist();
  renderPreview();
}

/** Whether location rows currently hold the UTC+0 fallback guess (#183). */
export function isLocationFallback(): boolean {
  return state.locationIsFallback;
}

/** Mark (or clear) the location-is-a-guess flag; persisted so a later visit retries detection. */
export function setLocationFallback(value: boolean): void {
  if (state.locationIsFallback === value) return;
  state.locationIsFallback = value;
  persist();
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
      refreshesPerDay: state.refreshesPerDay,
      profileId: state.profileId,
      tempUnit: state.tempUnit,
      locationIsFallback: state.locationIsFallback,
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
  const boxes: EditorBox[] = raw.map((b) => {
    // config comes from persisted JSON as a flat string map; the runtime shape
    // matches one of the EditorBoxConfig union members it was serialized from, so
    // narrow through `unknown` at this deserialization boundary.
    const box: EditorBox = {
      id: uid(),
      type: b.type as EditorBoxType,
      label: b.label,
      config: { ...b.config } as unknown as EditorBoxConfig,
    };
    if (b.split === 'left' || b.split === 'right') box.split = b.split;
    // Migrate legacy enum ratios (1/2/3) → percentages; accept raw % too.
    const sr = b.splitRatio;
    const pct = sr === 1 ? 33 : sr === 2 ? 50 : sr === 3 ? 67 : typeof sr === 'number' ? sr : 50;
    const clamped = Math.min(80, Math.max(20, Math.round(pct)));
    if (clamped !== 50) box.splitRatio = clamped;
    return box;
  });
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
      if (typeof obj.cornerRadius === 'number')
        state.cornerRadius = clampCornerRadius(obj.cornerRadius);
      if (typeof obj.padding === 'number') state.padding = obj.padding;
      if (typeof obj.refreshesPerDay === 'number')
        state.refreshesPerDay = clampRefreshesPerDay(obj.refreshesPerDay);
      if (
        typeof obj.profileId === 'string' &&
        DEVICE_PROFILES.some((p) => p.id === obj.profileId)
      ) {
        state.profileId = obj.profileId;
      }
      if (obj.tempUnit === 'F' || obj.tempUnit === 'C') state.tempUnit = obj.tempUnit;
      if (typeof obj.locationIsFallback === 'boolean') {
        state.locationIsFallback = obj.locationIsFallback;
      }
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

// -- Config loading (shared by file import + device pairing) ----------------

/**
 * Apply a parsed config object (the export/import schema, version 1 or 2) to
 * state, triggering a full re-render. Returns true if a recognized version was
 * applied, false otherwise. Used by both file import and the device-pairing
 * flow (issue #74), which seeds state from the server response rather than a
 * file or localStorage.
 */
export function loadConfig(parsed: unknown): boolean {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;

  // A drop-in device BentoConfig (what exportJSON emits, and what the device's
  // config_json stores): no `version` field but a boxes array. Validate it, then
  // convert to the version-2 editor shape the rest of this function hydrates.
  if (!('version' in obj) && Array.isArray(obj.boxes)) {
    if (!validateBentoConfig(obj).valid) return false;
    return loadConfig(fromBentoConfig(obj as unknown as BentoConfig));
  }

  if (!('version' in obj)) return false;

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
      if (typeof obj.cornerRadius === 'number')
        s.cornerRadius = clampCornerRadius(obj.cornerRadius);
      if (typeof obj.padding === 'number') s.padding = obj.padding;
      if (typeof obj.refreshesPerDay === 'number')
        s.refreshesPerDay = clampRefreshesPerDay(obj.refreshesPerDay);
    });
    return true;
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
    if (!Array.isArray(dBoxes) || !Array.isArray(pBoxes)) return false;
    setState((s) => {
      s.boxes = hydrateBoxes([...dBoxes, ...pBoxes]);
    });
    return true;
  }

  return false;
}

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
        if (!loadConfig(parsed)) {
          alert('Invalid InfoBento config file: missing or unsupported version.');
        }
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
  // Emit a renderer BentoConfig (includes width/height from the active device
  // profile) so the file drops straight into a device's config_json. importJSON
  // round-trips it back via loadConfig → fromBentoConfig.
  const data = toBentoConfig(state.boxes);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infobento-config.json';
  a.click();
  URL.revokeObjectURL(url);
}
