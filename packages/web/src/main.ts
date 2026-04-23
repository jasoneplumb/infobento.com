/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks,
 * and performs the initial render.
 */

import type { EditorBoxType } from './state';
import { addBox, exportJSON, importJSON, onPreviewRender, onRender } from './state';
import { renderBoxList } from './components/box-list';
import { renderPreview } from './components/preview';
import { requireConsent } from './components/consent';

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

// -- Version stamp ----------------------------------------------------------

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

// -- Initial render (after consent) -----------------------------------------

// Render once so the editor is visible behind the dialog (greyed by overlay),
// then await consent before the user can interact.
render();
void requireConsent();
