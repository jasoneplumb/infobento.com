/**
 * eInk preview renderer — CSS mock matching the svelte-editor prototype.
 * Rebuilds the #eink-display contents from current state.
 */

import type {
  EditorBox,
  CountdownConfig,
  WeatherConfig,
  TextConfig,
  QRConfig,
  QuoteConfig,
} from '../state';
import { getState } from '../state';

function previewValue(box: EditorBox): string {
  switch (box.type) {
    case 'text': {
      const c = box.config as TextConfig;
      return c.content || '(empty)';
    }
    case 'countdown': {
      const c = box.config as CountdownConfig;
      if (!c.date) return '(no date set)';
      const diff = Math.ceil((new Date(c.date).getTime() - Date.now()) / 86_400_000);
      const label = c.countdownLabel || 'Event';
      if (diff > 0) return `${label}: ${diff}d`;
      if (diff === 0) return `${label}: today`;
      return `${label}: past`;
    }
    case 'weather': {
      const c = box.config as WeatherConfig;
      return c.city || '(no city)';
    }
    case 'qr': {
      const c = box.config as QRConfig;
      return c.url ? c.url.replace(/^https?:\/\//, '') : '(no URL)';
    }
    case 'quote': {
      const c = box.config as QuoteConfig;
      return (c.content || '(empty)') + (c.author ? ` \u2014 ${c.author}` : '');
    }
    default:
      return '?';
  }
}

export function renderPreview(): void {
  const display = document.getElementById('eink-display');
  if (!display) return;

  const { boxes } = getState();

  if (boxes.length === 0) {
    display.innerHTML = '<div class="eink-empty">no boxes</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const box of boxes) {
    const div = document.createElement('div');
    div.className = 'eink-box';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'eink-label';
    labelSpan.textContent = box.type.toUpperCase();

    const valueSpan = document.createElement('span');
    valueSpan.className = 'eink-value';
    valueSpan.textContent = previewValue(box);

    div.appendChild(labelSpan);
    div.appendChild(valueSpan);
    fragment.appendChild(div);
  }

  display.innerHTML = '';
  display.appendChild(fragment);
}
