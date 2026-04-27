/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks,
 * and performs the initial render.
 */

import type { EditorBoxType } from './state';
import {
  addBox,
  exportJSON,
  getCornerRadius,
  getFontSize,
  getPadding,
  getShowHeaders,
  importJSON,
  onPreviewRender,
  onRender,
  setCornerRadius,
  setFontSize,
  setPadding,
  setShowHeaders,
} from './state';
import { renderBoxList } from './components/box-list';
import { renderPreview, setPreviewOrientation } from './components/preview';
import { requireConsent } from './components/consent';
import { detectLocation } from './geolocation';

// -- Render callbacks -------------------------------------------------------

function renderAllPreviews(): void {
  renderPreview('eink-display');
}

function render(): void {
  renderBoxList('box-list');
  renderAllPreviews();
}

onRender(render);
onPreviewRender(renderAllPreviews);

// -- Wire up Add button -----------------------------------------------------

const addBtn = document.getElementById('btn-add');
const addSelect = document.getElementById('add-type-select') as HTMLSelectElement | null;
addBtn?.addEventListener('click', () => {
  if (!addSelect) return;
  addBox(addSelect.value as EditorBoxType);
});

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
void requireConsent().then(() => void detectLocation());
