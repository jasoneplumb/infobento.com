/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up toolbar buttons, registers render callbacks, and performs initial render.
 */

import type { EditorBoxType } from './state';
import { addBox, exportJSON, onPreviewRender, onRender } from './state';
import { renderBoxList } from './components/box-list';
import { renderPreview } from './components/preview';

// -- Register render callbacks ----------------------------------------------

function render(): void {
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

// -- Initial render ---------------------------------------------------------

render();
