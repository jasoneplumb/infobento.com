/**
 * Box list renderer — builds card DOM nodes for the config panel.
 * Handles reorder (up/down), remove, inline label editing, and
 * delegates type-specific forms to box-config.ts.
 */

import type { EditorBox } from '../state';
import { getState, moveBox, removeBox, updateLabel } from '../state';
import { buildConfigForm } from './box-config';

// -- Card builder -----------------------------------------------------------

function buildCard(box: EditorBox, idx: number, total: number): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'box-card';
  card.dataset.id = String(box.id);

  // -- Header
  const header = document.createElement('div');
  header.className = 'box-card-header';

  // Drag handle (decorative)
  const handle = document.createElement('div');
  handle.className = 'box-drag-handle';
  handle.innerHTML = '<span></span><span></span><span></span>';

  // Type badge
  const badge = document.createElement('span');
  badge.className = `box-type-badge type-${box.type}`;
  badge.textContent = box.type;

  // Label input (inline editable)
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = box.label;
  labelInput.className = 'box-label-input';
  labelInput.addEventListener('input', () => updateLabel(box.id, labelInput.value));

  // Order controls
  const orderDiv = document.createElement('div');
  orderDiv.className = 'box-order-controls';

  const btnUp = document.createElement('button');
  btnUp.className = 'btn-ghost';
  btnUp.textContent = '\u25B2';
  btnUp.title = 'Move up';
  btnUp.disabled = idx === 0;
  btnUp.addEventListener('click', () => moveBox(box.id, -1));

  const btnDown = document.createElement('button');
  btnDown.className = 'btn-ghost';
  btnDown.textContent = '\u25BC';
  btnDown.title = 'Move down';
  btnDown.disabled = idx === total - 1;
  btnDown.addEventListener('click', () => moveBox(box.id, 1));

  // Remove button
  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-danger';
  btnRemove.textContent = '\u2715';
  btnRemove.title = 'Remove box';
  btnRemove.addEventListener('click', () => removeBox(box.id));

  orderDiv.appendChild(btnUp);
  orderDiv.appendChild(btnDown);

  header.appendChild(handle);
  header.appendChild(badge);
  header.appendChild(labelInput);
  header.appendChild(orderDiv);
  header.appendChild(btnRemove);

  // -- Body (type-specific form)
  const body = document.createElement('div');
  body.className = 'box-card-body';
  body.appendChild(buildConfigForm(box));

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// -- Public render function -------------------------------------------------

export function renderBoxList(): void {
  const list = document.getElementById('box-list');
  if (!list) return;

  // Capture focus state for restoration after DOM rebuild
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const activeCard = active?.closest?.('[data-id]') as HTMLElement | null;
  const activeCardId = activeCard?.dataset.id ?? null;
  const activeTag = active?.tagName.toLowerCase() ?? null;
  const activeType = active instanceof HTMLInputElement ? active.type : null;
  const activeSelStart =
    active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const activeSelEnd =
    active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

  const { boxes } = getState();

  list.innerHTML = '';

  if (boxes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const p = document.createElement('p');
    p.textContent = 'No boxes yet.';
    const small = document.createElement('small');
    small.textContent = 'Use "Add Box" above to get started.';
    empty.appendChild(p);
    empty.appendChild(small);
    list.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  boxes.forEach((box, idx) => {
    frag.appendChild(buildCard(box, idx, boxes.length));
  });
  list.appendChild(frag);

  // Restore focus heuristic
  if (activeCardId) {
    const card = list.querySelector(`[data-id="${activeCardId}"]`);
    if (card) {
      let target: HTMLInputElement | HTMLTextAreaElement | null = null;
      if (activeTag === 'textarea') {
        target = card.querySelector('textarea');
      } else if (activeType) {
        target = card.querySelector(`input[type="${activeType}"]`);
      }
      if (target) {
        target.focus();
        if (activeSelStart !== null) {
          try {
            target.setSelectionRange(activeSelStart, activeSelEnd);
          } catch {
            // setSelectionRange not supported on date inputs — ignore
          }
        }
      }
    }
  }
}
