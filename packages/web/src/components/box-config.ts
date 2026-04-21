/**
 * Type-specific config form builders.
 * Each builder returns a DocumentFragment of form fields for a box type.
 */

import type { EditorBox, EditorBoxType, QRConfig, QuoteConfig } from '../state';
import { updateConfig } from '../state';

// -- Helpers ----------------------------------------------------------------

function makeField(labelText: string, inputEl: HTMLElement): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrapper.appendChild(label);
  wrapper.appendChild(inputEl);
  return wrapper;
}

function inputEl(type: string, value: string, onInput: (v: string) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  el.value = value;
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

function textareaEl(value: string, onInput: (v: string) => void): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.value = value;
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

// -- Form builders per type -------------------------------------------------

function buildTextForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as { content: string };
  frag.appendChild(
    makeField(
      'Content',
      textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v)),
    ),
  );
  return frag;
}

function buildCountdownForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as { date: string; countdownLabel: string };
  const row = document.createElement('div');
  row.className = 'field-row';
  row.appendChild(
    makeField(
      'Target Date',
      inputEl('date', cfg.date, (v) => updateConfig(box.id, 'date', v)),
    ),
  );
  row.appendChild(
    makeField(
      'Event Label',
      inputEl('text', cfg.countdownLabel, (v) => updateConfig(box.id, 'countdownLabel', v)),
    ),
  );
  frag.appendChild(row);
  return frag;
}

function buildWeatherForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as { city: string };
  frag.appendChild(
    makeField(
      'City Name',
      inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v)),
    ),
  );
  return frag;
}

function buildQRForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as QRConfig;
  frag.appendChild(
    makeField(
      'URL',
      inputEl('url', cfg.url, (v) => updateConfig(box.id, 'url', v)),
    ),
  );
  return frag;
}

function buildQuoteForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as QuoteConfig;
  frag.appendChild(
    makeField(
      'Quote Text',
      textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v)),
    ),
  );
  frag.appendChild(
    makeField(
      'Author (optional)',
      inputEl('text', cfg.author, (v) => updateConfig(box.id, 'author', v)),
    ),
  );
  return frag;
}

// -- Registry ---------------------------------------------------------------

const formBuilders: Record<EditorBoxType, (box: EditorBox) => DocumentFragment> = {
  text: buildTextForm,
  countdown: buildCountdownForm,
  weather: buildWeatherForm,
  qr: buildQRForm,
  quote: buildQuoteForm,
};

export function buildConfigForm(box: EditorBox): DocumentFragment {
  const builder = formBuilders[box.type];
  return builder(box);
}
