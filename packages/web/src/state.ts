/**
 * Reactive state management for the InfoBento box editor.
 *
 * A plain object + setState() that schedules a synchronous re-render.
 * Same mental model as the winning svelte-editor prototype: mutate via
 * setState(), two-way binding via input listeners + render().
 */

import type { BentoBoxType } from '@infobento/core';

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
}

export interface QRConfig {
  url: string;
}

export interface QuoteConfig {
  content: string;
  author: string;
}

export type EditorBoxConfig = TextConfig | CountdownConfig | WeatherConfig | QRConfig | QuoteConfig;

export type EditorBoxType = Extract<
  BentoBoxType,
  'text' | 'countdown' | 'weather' | 'qr' | 'quote'
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

// -- State + render callback ------------------------------------------------

const state: EditorState = {
  boxes: [],
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

/** Mutate state and trigger a full re-render */
export function setState(mutate: (s: EditorState) => void): void {
  mutate(state);
  _renderFn?.();
}

/** Trigger preview-only re-render (for live typing without full DOM rebuild) */
function renderPreview(): void {
  _previewFn?.();
}

// -- Actions ----------------------------------------------------------------

const DEFAULTS: Record<EditorBoxType, () => EditorBoxConfig> = {
  text: () => ({ content: '' }),
  countdown: () => ({ date: '', countdownLabel: '' }),
  weather: () => ({ city: '' }),
  qr: () => ({ url: '' }),
  quote: () => ({ content: '', author: '' }),
};

const LABELS: Record<EditorBoxType, string> = {
  text: 'Text',
  countdown: 'Countdown',
  weather: 'Weather',
  qr: 'QR Code',
  quote: 'Quote',
};

export function addBox(type: EditorBoxType): void {
  setState((s) => {
    s.boxes.push({
      id: uid(),
      type,
      label: LABELS[type],
      config: DEFAULTS[type](),
    });
  });
}

export function removeBox(id: number): void {
  setState((s) => {
    s.boxes = s.boxes.filter((b) => b.id !== id);
  });
}

export function moveBox(id: number, dir: -1 | 1): void {
  setState((s) => {
    const idx = s.boxes.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= s.boxes.length) return;
    const current = s.boxes[idx];
    const next = s.boxes[target];
    if (current === undefined || next === undefined) return;
    s.boxes[idx] = next;
    s.boxes[target] = current;
  });
}

export function updateConfig(id: number, key: string, value: string): void {
  const box = state.boxes.find((b) => b.id === id);
  if (!box) return;
  (box.config as unknown as Record<string, string>)[key] = value;
  renderPreview();
}

export function updateLabel(id: number, value: string): void {
  const box = state.boxes.find((b) => b.id === id);
  if (!box) return;
  box.label = value;
  renderPreview();
}

// -- Export -----------------------------------------------------------------

export function exportJSON(): void {
  const data = {
    version: 1,
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
