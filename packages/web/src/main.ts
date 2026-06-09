/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks,
 * and performs the initial render.
 */

import type { EditorBoxType } from './state';
import {
  addBox,
  BOX_TYPE_LABELS,
  CHIP_GROUPS,
  getHiddenChips,
  hideChip,
  restoreChip,
  exportJSON,
  LOCATION_TYPES,
  getCornerRadius,
  getFontSize,
  getFontWeight,
  setFontWeight,
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
import { renderBoxList, decorateBoxList } from './components/box-list';
import { renderPreview, setPreviewOrientation, onRenderedBoxIds } from './components/preview';
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
// When a preview resolves (or the orientation changes), update the editor's
// indicator showing which boxes rendered vs. were dropped (don't fit the panel).
onRenderedBoxIds(decorateBoxList);

// -- Add chips (grouped by theme; every chip stays available; hide/restore) --

/** Build one add-chip: "+ Label" plus a hover × to hide it from the palette. */
function makeChip(type: EditorBoxType): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chip-wrap';

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn-add-chip';
  add.textContent = `+ ${BOX_TYPE_LABELS[type]}`;
  add.addEventListener('click', () => {
    addBox(type);
    // Location rows auto-detect (IP-based) when no location is known yet.
    if (LOCATION_TYPES.has(type)) void ensureLocationDefault();
  });

  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'chip-hide';
  hide.textContent = '×';
  hide.title = `Hide ${BOX_TYPE_LABELS[type]}`;
  hide.setAttribute('aria-label', `Hide ${BOX_TYPE_LABELS[type]}`);
  hide.addEventListener('click', () => hideChip(type));

  wrap.append(add, hide);
  return wrap;
}

function renderAddChips(): void {
  const addChips = document.getElementById('add-chips');
  if (!addChips) return;
  addChips.innerHTML = '';
  const hidden = new Set(getHiddenChips());

  // Grouped, always-available chips (a box type can be added more than once).
  for (const group of CHIP_GROUPS) {
    const visible = group.types.filter((t) => !hidden.has(t));
    if (visible.length === 0) continue;
    const section = document.createElement('div');
    section.className = 'chip-group';
    const label = document.createElement('div');
    label.className = 'chip-group-label';
    label.textContent = group.label;
    const chips = document.createElement('div');
    chips.className = 'chip-group-chips';
    for (const type of visible) chips.appendChild(makeChip(type));
    section.append(label, chips);
    addChips.appendChild(section);
  }

  // Collapsible "Hidden (N)" list — click a chip to restore it to its group.
  const hiddenList = getHiddenChips();
  if (hiddenList.length > 0) {
    const details = document.createElement('details');
    details.className = 'chips-hidden';
    const summary = document.createElement('summary');
    summary.textContent = `Hidden (${String(hiddenList.length)})`;
    const chips = document.createElement('div');
    chips.className = 'chip-group-chips';
    for (const type of hiddenList) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-restore-chip';
      btn.textContent = BOX_TYPE_LABELS[type];
      btn.title = `Restore ${BOX_TYPE_LABELS[type]}`;
      btn.addEventListener('click', () => restoreChip(type));
      chips.appendChild(btn);
    }
    details.append(summary, chips);
    addChips.appendChild(details);
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

// -- Wire up Font Weight slider (1–9 → Inter static weight 100–900) ---------

const weightSlider = document.querySelector<HTMLInputElement>('#font-weight-slider');
const weightDisplay = document.getElementById('font-weight-display');
if (weightSlider) {
  const v = Math.round(getFontWeight() * 10);
  weightSlider.value = String(v);
  if (weightDisplay) weightDisplay.textContent = String(v * 100); // show weight (100–900)
  weightSlider.addEventListener('input', () => {
    const n = Number(weightSlider.value);
    if (weightDisplay) weightDisplay.textContent = String(n * 100);
    setFontWeight(n / 10);
  });
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
  7,
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
