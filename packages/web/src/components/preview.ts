/**
 * eInk preview — fetches server-rendered PNGs (landscape + portrait) from the API.
 * Converts editor state to BentoConfig, POSTs to /api/preview?dual=1.
 * Displays one orientation at a time, toggled by the Landscape checkbox.
 */

import { getBoxes, getDeviceProfile, getCornerRadius } from '../state';
import { toBentoConfig } from '../config-map';

/** Cached img elements for landscape and portrait, reused across renders */
let _imgLandscape: HTMLImageElement | undefined;
let _imgPortrait: HTMLImageElement | undefined;
let _pendingRequest: AbortController | undefined;
let _debounceTimer: ReturnType<typeof setTimeout> | undefined;
let _showLandscape = false;
let _containerId: string | undefined;

// Box ids that actually render in each orientation (the rest were dropped — they
// don't fit the panel). Drives the editor's "rendered vs. won't-fit" indicator.
let _renderedIds: { landscape: readonly string[]; portrait: readonly string[] } | null = null;
let _onRenderedIds: ((ids: ReadonlySet<string> | null) => void) | null = null;

/** Register a callback fired when the set of rendered box ids changes. */
export function onRenderedBoxIds(cb: (ids: ReadonlySet<string> | null) => void): void {
  _onRenderedIds = cb;
}

/** The box ids rendered in the currently-shown orientation (null until first fetch). */
export function getActiveRenderedIds(): ReadonlySet<string> | null {
  if (!_renderedIds) return null;
  return new Set(_showLandscape ? _renderedIds.landscape : _renderedIds.portrait);
}

function emitRenderedIds(): void {
  _onRenderedIds?.(getActiveRenderedIds());
}

export function renderPreview(containerId: string): void {
  _containerId = containerId;
  // Debounce: wait 150ms after last call before fetching
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => renderPreviewNow(containerId), 150);
}

export function setPreviewOrientation(landscape: boolean): void {
  _showLandscape = landscape;
  if (_containerId) mountActivePreview(_containerId);
  // The dropped set differs per orientation — refresh the editor indicator.
  emitRenderedIds();
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
    _renderedIds = null;
    emitRenderedIds();
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
      return res.json() as Promise<{
        landscape: string;
        portrait: string;
        landscapeIds?: string[];
        portraitIds?: string[];
      }>;
    })
    .then((data) => {
      _imgLandscape = ensureImg(_imgLandscape, 'eink-canvas eink-landscape');
      _imgPortrait = ensureImg(_imgPortrait, 'eink-canvas eink-portrait');

      // Landscape: data URI from base64
      _imgLandscape.src = `data:image/png;base64,${data.landscape}`;
      _imgPortrait.src = `data:image/png;base64,${data.portrait}`;

      // Size the preview to match the real panel's physical size on screen.
      // The CSS reference (96px = 1in) under-sizes on typical high-DPI monitors,
      // so apply a calibration factor measured against the physical reTerminal
      // E1001 — a 7.5" panel still reads larger than a 5.76" one regardless of
      // pixel count.
      const profile = getDeviceProfile();
      const PREVIEW_CALIBRATION = 1.5; // on-screen size → matches real hardware
      const CSS_PX_PER_MM = (96 / 25.4) * PREVIEW_CALIBRATION;
      const wCss = Math.round(profile.widthMm * CSS_PX_PER_MM);
      const hCss = Math.round(profile.heightMm * CSS_PX_PER_MM);
      display.style.setProperty('--eink-w', String(wCss));
      display.style.setProperty('--eink-h', String(hCss));
      // Match the CSS corner radius to the rendered radius at the on-screen scale.
      const scale = wCss / profile.widthPx;
      const radiusPx = getCornerRadius() * 4;
      display.style.setProperty('--eink-radius', `${String(Math.round(radiusPx * scale))}px`);

      mountActivePreview(containerId);

      // Record which boxes rendered per orientation and refresh the editor's
      // "rendered vs. won't-fit" indicator for the active orientation.
      _renderedIds = { landscape: data.landscapeIds ?? [], portrait: data.portraitIds ?? [] };
      emitRenderedIds();
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silently ignore fetch errors (API might not be running)
    });
}
