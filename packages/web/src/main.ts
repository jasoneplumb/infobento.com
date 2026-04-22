/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up toolbar buttons, registers render callbacks, and performs initial render.
 */

import type { DisplayId } from '@infobento/core';
import type { EditorBoxType } from './state';
import {
  addBox,
  exportJSON,
  getActiveDisplay,
  onPreviewRender,
  onRender,
  switchDisplay,
} from './state';
import { renderBoxList } from './components/box-list';
import { renderPreview } from './components/preview';

// -- Register render callbacks ----------------------------------------------

function updateToggleUI(): void {
  const btnD = document.getElementById('btn-display-d');
  const btnP = document.getElementById('btn-display-p');
  const active = getActiveDisplay();
  btnD?.classList.toggle('active', active === 'D');
  btnP?.classList.toggle('active', active === 'P');
}

function render(): void {
  updateToggleUI();
  renderBoxList();
  renderPreview();
}

onRender(render);
onPreviewRender(renderPreview);

// -- Wire up toolbar --------------------------------------------------------

const btnAdd = document.getElementById('btn-add');
const typeSelect = document.getElementById('add-type-select') as HTMLSelectElement | null;
const btnExport = document.getElementById('btn-export');

btnAdd?.addEventListener('click', () => {
  if (!typeSelect) return;
  addBox(typeSelect.value as EditorBoxType);
});

btnExport?.addEventListener('click', exportJSON);

const btnDisplayD = document.getElementById('btn-display-d');
const btnDisplayP = document.getElementById('btn-display-p');

btnDisplayD?.addEventListener('click', () => switchDisplay('D' as DisplayId));
btnDisplayP?.addEventListener('click', () => switchDisplay('P' as DisplayId));

// -- Initial render ---------------------------------------------------------

render();
