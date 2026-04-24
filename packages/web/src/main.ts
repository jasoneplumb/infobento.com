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
import { renderPreview } from './components/preview';
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

// -- Wire up Font Size slider -----------------------------------------------

const fontSlider = document.getElementById('font-size-slider') as HTMLInputElement | null;
const fontDisplay = document.getElementById('font-size-display');
if (fontSlider) {
  fontSlider.value = String(getFontSize());
  if (fontDisplay) fontDisplay.textContent = `${String(getFontSize())}px`;
  fontSlider.addEventListener('input', () => {
    const val = parseInt(fontSlider.value, 10);
    setFontSize(val);
    if (fontDisplay) fontDisplay.textContent = `${String(val)}px`;
  });
}

// -- Wire up Corner Radius slider -------------------------------------------

const cornerSlider = document.getElementById('corner-radius-slider') as HTMLInputElement | null;
const cornerDisplay = document.getElementById('corner-radius-display');
if (cornerSlider) {
  cornerSlider.value = String(getCornerRadius());
  if (cornerDisplay) cornerDisplay.textContent = String(getCornerRadius());
  cornerSlider.addEventListener('input', () => {
    const val = parseInt(cornerSlider.value, 10);
    setCornerRadius(val);
    if (cornerDisplay) cornerDisplay.textContent = String(val);
  });
}

// -- Wire up Padding slider -------------------------------------------------

const paddingSlider = document.getElementById('padding-slider') as HTMLInputElement | null;
const paddingDisplay = document.getElementById('padding-display');
if (paddingSlider) {
  paddingSlider.value = String(getPadding());
  if (paddingDisplay) paddingDisplay.textContent = String(getPadding());
  paddingSlider.addEventListener('input', () => {
    const val = parseInt(paddingSlider.value, 10);
    setPadding(val);
    if (paddingDisplay) paddingDisplay.textContent = String(val);
  });
}

// -- Version stamp ----------------------------------------------------------

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

// -- Initial render (after consent) -----------------------------------------

// Render once so the editor is visible behind the dialog (greyed by overlay),
// then await consent before the user can interact.
render();
void requireConsent().then(() => void detectLocation());
