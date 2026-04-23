/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks for both displays,
 * and performs the initial render.
 */

import type { DisplayId } from '@infobento/core';
import type { EditorBoxType } from './state';
import { addBox, exportJSON, importJSON, onPreviewRender, onRender } from './state';
import { renderBoxList } from './components/box-list';
import { renderPreview } from './components/preview';
import { requireConsent } from './components/consent';

// -- Render callbacks -------------------------------------------------------

const DISPLAYS: readonly DisplayId[] = ['D', 'P'];

function renderAllPreviews(): void {
  for (const id of DISPLAYS) {
    renderPreview(id, `eink-display-${id}`);
  }
}

function render(): void {
  for (const id of DISPLAYS) {
    renderBoxList(id, `box-list-${id}`);
  }
  renderAllPreviews();
}

onRender(render);
onPreviewRender(renderAllPreviews);

// -- Wire up per-display Add buttons ---------------------------------------

for (const id of DISPLAYS) {
  const btn = document.getElementById(`btn-add-${id}`);
  const select = document.getElementById(`add-type-select-${id}`) as HTMLSelectElement | null;
  btn?.addEventListener('click', () => {
    if (!select) return;
    addBox(id, select.value as EditorBoxType);
  });
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

// -- Version stamp ----------------------------------------------------------

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

// -- Initial render (after consent) -----------------------------------------

// Render once so the editor is visible behind the dialog (greyed by overlay),
// then await consent before the user can interact.
render();
void requireConsent();
