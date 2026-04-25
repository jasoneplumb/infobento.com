/**
 * Box list renderer — builds card DOM nodes for the editor column.
 * Handles reorder (up/down), remove, inline label editing, merge/split
 * for horizontal pairs, and delegates type-specific forms to box-config.ts.
 */

import type { EditorBox } from '../state';
import {
  getBoxes,
  moveBox,
  removeBox,
  updateLabel,
  mergeBoxes,
  splitBoxes,
  setWeight,
  setSplitRatio,
} from '../state';
import { buildConfigForm } from './box-config';

// -- Card builder -----------------------------------------------------------

function buildCard(
  box: EditorBox,
  idx: number,
  total: number,
  splitSide?: 'left' | 'right',
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

  header.appendChild(handle);
  header.appendChild(badge);

  if (splitSide) {
    const splitBadge = document.createElement('span');
    splitBadge.className = 'box-split-badge';
    splitBadge.textContent = splitSide === 'left' ? 'L' : 'R';
    header.appendChild(splitBadge);
  }

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = box.label;
  labelInput.className = 'box-label-input';
  labelInput.addEventListener('input', () => updateLabel(box.id, labelInput.value));

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

  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-danger';
  btnRemove.textContent = '\u2715';
  btnRemove.title = 'Remove box';
  btnRemove.addEventListener('click', () => removeBox(box.id));

  orderDiv.appendChild(btnUp);
  orderDiv.appendChild(btnDown);

  // Height weight selector (1=S, 2=M, 3=L)
  const weightDiv = document.createElement('div');
  weightDiv.className = 'box-weight-controls';
  const weightLabels: Array<[1 | 2 | 3, string]> = [
    [1, 'S'],
    [2, 'M'],
    [3, 'L'],
  ];
  for (const [w, label] of weightLabels) {
    const btn = document.createElement('button');
    btn.className = 'btn-weight' + ((box.weight ?? 2) === w ? ' active' : '');
    btn.textContent = label;
    btn.title = `Height: ${label}`;
    btn.type = 'button';
    btn.addEventListener('click', () => setWeight(box.id, w));
    weightDiv.appendChild(btn);
  }

  header.appendChild(labelInput);
  header.appendChild(weightDiv);
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

export function renderBoxList(containerId: string): void {
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

  const boxes = getBoxes();

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
  let i = 0;
  while (i < boxes.length) {
    const box = boxes[i];
    if (!box) {
      i++;
      continue;
    }
    const nextBox = i + 1 < boxes.length ? boxes[i + 1] : undefined;
    const isPair = box.split === 'left' && nextBox?.split === 'right';

    if (isPair && nextBox) {
      // Render paired group
      const group = document.createElement('div');
      group.className = 'box-pair-group';

      group.appendChild(buildCard(box, i, boxes.length, 'left'));
      group.appendChild(buildCard(nextBox, i + 1, boxes.length, 'right'));

      // Split ratio + split apart controls
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'box-pair-controls';

      const ratioDiv = document.createElement('div');
      ratioDiv.className = 'box-ratio-controls';
      const ratioLabel = document.createElement('span');
      ratioLabel.textContent = 'Ratio';
      ratioLabel.className = 'box-ratio-label';
      ratioDiv.appendChild(ratioLabel);
      const ratioOptions: Array<[1 | 2 | 3, string]> = [
        [1, '\u2190'],
        [2, '='],
        [3, '\u2192'],
      ];
      const leftId = box.id;
      for (const [r, label] of ratioOptions) {
        const btn = document.createElement('button');
        btn.className = 'btn-weight' + ((box.splitRatio ?? 2) === r ? ' active' : '');
        btn.textContent = label;
        btn.type = 'button';
        btn.addEventListener('click', () => setSplitRatio(leftId, r));
        ratioDiv.appendChild(btn);
      }
      controlsDiv.appendChild(ratioDiv);

      const splitBtn = document.createElement('button');
      splitBtn.className = 'box-split-btn btn-ghost';
      splitBtn.textContent = 'Split apart';
      splitBtn.addEventListener('click', () => splitBoxes(leftId));
      controlsDiv.appendChild(splitBtn);

      group.appendChild(controlsDiv);

      frag.appendChild(group);
      i += 2;
    } else {
      frag.appendChild(buildCard(box, i, boxes.length));

      // Merge button between unpaired adjacent boxes
      if (i + 1 < boxes.length) {
        const next = boxes[i + 1];
        if (!box.split && next && !next.split) {
          const mergeBtn = document.createElement('button');
          mergeBtn.className = 'box-merge-btn btn-ghost';
          mergeBtn.textContent = '\u2B0C Merge into row';
          const topId = box.id;
          const bottomId = next.id;
          mergeBtn.addEventListener('click', () => mergeBoxes(topId, bottomId));
          frag.appendChild(mergeBtn);
        }
      }
      i++;
    }
  }
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
