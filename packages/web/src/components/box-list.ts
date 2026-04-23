/**
 * Box list renderer — builds card DOM nodes for one display's editor column.
 * Handles reorder (up/down), remove, inline label editing, and
 * delegates type-specific forms to box-config.ts.
 */

import type { DisplayId } from '@infobento/core';
import type { EditorBox } from '../state';
import { getBoxes, moveBox, removeBox, updateLabel } from '../state';
import { buildConfigForm } from './box-config';

// -- Card builder -----------------------------------------------------------

function buildCard(
  displayId: DisplayId,
  box: EditorBox,
  idx: number,
  total: number,
): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'box-card';
  card.dataset.id = String(box.id);

  const header = document.createElement('div');
  header.className = 'box-card-header';

  const handle = document.createElement('div');
  handle.className = 'box-drag-handle';
  handle.innerHTML = '<span></span><span></span><span></span>';

  const badge = document.createElement('span');
  badge.className = `box-type-badge type-${box.type}`;
  badge.textContent = box.type;

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = box.label;
  labelInput.className = 'box-label-input';
  labelInput.addEventListener('input', () => updateLabel(box.id, labelInput.value));

  const orderDiv = document.createElement('div');
  orderDiv.className = 'box-order-controls';

  const btnUp = document.createElement('button');
  btnUp.className = 'btn-ghost';
  btnUp.textContent = '▲';
  btnUp.title = 'Move up';
  btnUp.disabled = idx === 0;
  btnUp.addEventListener('click', () => moveBox(displayId, box.id, -1));

  const btnDown = document.createElement('button');
  btnDown.className = 'btn-ghost';
  btnDown.textContent = '▼';
  btnDown.title = 'Move down';
  btnDown.disabled = idx === total - 1;
  btnDown.addEventListener('click', () => moveBox(displayId, box.id, 1));

  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-danger';
  btnRemove.textContent = '✕';
  btnRemove.title = 'Remove box';
  btnRemove.addEventListener('click', () => removeBox(displayId, box.id));

  orderDiv.appendChild(btnUp);
  orderDiv.appendChild(btnDown);

  header.appendChild(handle);
  header.appendChild(badge);
  header.appendChild(labelInput);
  header.appendChild(orderDiv);
  header.appendChild(btnRemove);

  const body = document.createElement('div');
  body.className = 'box-card-body';
  body.appendChild(buildConfigForm(box));

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

// -- Public render function -------------------------------------------------

export function renderBoxList(displayId: DisplayId, containerId: string): void {
  const list = document.getElementById(containerId);
  if (!list) return;

  // Capture focus state for restoration after DOM rebuild
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const activeWithinList = active && list.contains(active) ? active : null;
  const activeCard = activeWithinList?.closest?.('[data-id]') as HTMLElement | null;
  const activeCardId = activeCard?.dataset.id ?? null;
  const activeTag = activeWithinList?.tagName.toLowerCase() ?? null;
  const activeType = activeWithinList instanceof HTMLInputElement ? activeWithinList.type : null;
  const activeSelStart =
    activeWithinList && typeof activeWithinList.selectionStart === 'number'
      ? activeWithinList.selectionStart
      : null;
  const activeSelEnd =
    activeWithinList && typeof activeWithinList.selectionEnd === 'number'
      ? activeWithinList.selectionEnd
      : null;

  const boxes = getBoxes(displayId);

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
    frag.appendChild(buildCard(displayId, box, idx, boxes.length));
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
