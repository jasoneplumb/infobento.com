/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks,
 * and performs the initial render.
 */

import type { EditorBoxType } from './state';
import {
  addBox,
  BOX_TYPE_LABELS,
  exportJSON,
  getBoxes,
  LOCATION_TYPES,
  getCornerRadius,
  getFontSize,
  getPadding,
  getShowHeaders,
  getDeviceProfile,
  importJSON,
  onPreviewRender,
  onRender,
  setCornerRadius,
  setFontSize,
  setPadding,
  setShowHeaders,
  setDeviceProfile,
} from './state';
import { DEVICE_PROFILES } from '@infobento/core';
import { renderBoxList } from './components/box-list';
import { renderPreview, setPreviewOrientation } from './components/preview';
import { requireConsent } from './components/consent';
import { ensureLocationDefault } from './geolocation';

// -- Render callbacks -------------------------------------------------------

function renderAllPreviews(): void {
  renderPreview('eink-display');
}

function render(): void {
  renderBoxList('box-list');
  renderAddChips();
  renderAllPreviews();
}

onRender(render);
onPreviewRender(renderAllPreviews);

// -- Add chips (one per box type; hidden once that type is in use) -----------

function renderAddChips(): void {
  const addChips = document.getElementById('add-chips');
  if (!addChips) return;
  addChips.innerHTML = '';
  const used = new Set(getBoxes().map((b) => b.type));
  const sorted = (Object.entries(BOX_TYPE_LABELS) as Array<[EditorBoxType, string]>).sort(
    ([, a], [, b]) => a.localeCompare(b),
  );
  for (const [type, label] of sorted) {
    if (used.has(type)) continue; // a box type is only useful once
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-add-chip';
    btn.textContent = `+ ${label}`;
    btn.addEventListener('click', () => {
      addBox(type);
      // Location rows auto-detect (IP-based) when no location is known yet.
      if (LOCATION_TYPES.has(type)) void ensureLocationDefault();
    });
    addChips.appendChild(btn);
  }
}

// -- Wire up header menu (Import / Export) ---------------------------------

const menuWrapper = document.getElementById('header-menu');
const menuTrigger = document.getElementById('btn-menu');
const menuDropdown = menuWrapper?.querySelector<HTMLElement>('.menu-dropdown') ?? null;

function setMenuOpen(open: boolean): void {
  if (!menuTrigger || !menuDropdown) return;
  menuTrigger.setAttribute('aria-expanded', String(open));
  menuDropdown.classList.toggle('is-open', open);
}

menuTrigger?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = menuTrigger.getAttribute('aria-expanded') === 'true';
  setMenuOpen(!isOpen);
});

document.addEventListener('click', (e) => {
  if (!menuWrapper) return;
  if (!menuWrapper.contains(e.target as Node)) setMenuOpen(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenuOpen(false);
});

function wireMenuItem(id: string, action: () => void): void {
  document.getElementById(id)?.addEventListener('click', () => {
    setMenuOpen(false);
    action();
  });
}

wireMenuItem('btn-import', importJSON);
wireMenuItem('btn-export', exportJSON);

// -- Wire up Show Box Headers toggle ----------------------------------------

const headersToggle = document.querySelector<HTMLInputElement>('#toggle-headers input');
if (headersToggle) {
  headersToggle.checked = getShowHeaders();
  headersToggle.addEventListener('change', () => setShowHeaders(headersToggle.checked));
}

// -- Wire up Landscape toggle -----------------------------------------------

const landscapeToggle = document.querySelector<HTMLInputElement>('#toggle-landscape input');
if (landscapeToggle) {
  landscapeToggle.checked = false;
  landscapeToggle.addEventListener('change', () => setPreviewOrientation(landscapeToggle.checked));
}

// -- Wire up Display (resolution) selector ----------------------------------

const profileSelect = document.querySelector<HTMLSelectElement>('#device-profile-select');
if (profileSelect) {
  for (const profile of DEVICE_PROFILES) {
    const opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.label;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = getDeviceProfile().id;
  profileSelect.addEventListener('change', () => setDeviceProfile(profileSelect.value));
}

// -- Wire up Font Size stepper -----------------------------------------------

function wireStepper(
  decId: string,
  incId: string,
  displayId: string,
  getter: () => number,
  setter: (v: number) => void,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
): void {
  const decBtn = document.getElementById(decId);
  const incBtn = document.getElementById(incId);
  const display = document.getElementById(displayId);
  if (!decBtn || !incBtn || !display) return;

  display.textContent = format(getter());

  decBtn.addEventListener('click', () => {
    const val = Math.max(min, getter() - step);
    setter(val);
    display.textContent = format(val);
  });
  incBtn.addEventListener('click', () => {
    const val = Math.min(max, getter() + step);
    setter(val);
    display.textContent = format(val);
  });
}

wireStepper(
  'font-size-dec',
  'font-size-inc',
  'font-size-display',
  getFontSize,
  setFontSize,
  8,
  42,
  2,
  (v) => `${String(v)}px`,
);
wireStepper(
  'corner-radius-dec',
  'corner-radius-inc',
  'corner-radius-display',
  getCornerRadius,
  setCornerRadius,
  0,
  10,
  1,
  String,
);
wireStepper(
  'padding-dec',
  'padding-inc',
  'padding-display',
  getPadding,
  setPadding,
  0,
  10,
  1,
  String,
);

// -- Version stamp ----------------------------------------------------------

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

// -- Initial render (after consent) -----------------------------------------

// Render once so the editor is visible behind the dialog (greyed by overlay),
// then await consent before the user can interact.
render();
void requireConsent().then(() => void ensureLocationDefault());
