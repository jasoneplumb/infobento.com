/**
 * Type-specific config form builders.
 * Each builder returns a DocumentFragment of form fields for a box type.
 */

import type { EditorBox, EditorBoxType, QRConfig, QuoteConfig, WeatherConfig } from '../state';
import { updateConfig, updateWeatherData } from '../state';
import { fetchWeather, fetchQuote } from '../api';

// -- Validation rules -------------------------------------------------------

interface ValidationRule {
  validate: (value: string) => string | null; // returns error message or null
}

function validateRequired(fieldName: string): ValidationRule {
  return {
    validate: (value: string) => (value.trim() === '' ? `Please enter ${fieldName}` : null),
  };
}

function validateUrl(): ValidationRule {
  return {
    validate: (value: string) => {
      if (value.trim() === '') return 'Please enter a URL';
      if (!value.startsWith('http://') && !value.startsWith('https://'))
        return 'URL must start with http:// or https://';
      return null;
    },
  };
}

function validateDate(): ValidationRule {
  return {
    validate: (value: string) => {
      if (value.trim() === '') return 'Please enter a date';
      if (isNaN(Date.parse(value))) return 'Please enter a date';
      return null;
    },
  };
}

// -- Helpers ----------------------------------------------------------------

/**
 * Attach blur/input validation to an input or textarea element.
 * Shows error on blur, clears on input.
 */
function attachValidation(
  el: HTMLInputElement | HTMLTextAreaElement,
  wrapper: HTMLDivElement,
  rule: ValidationRule,
): void {
  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.style.display = 'none';
  wrapper.appendChild(errorEl);

  el.addEventListener('blur', () => {
    const msg = rule.validate(el.value);
    if (msg) {
      el.classList.add('field-error');
      errorEl.textContent = msg;
      errorEl.style.display = '';
    }
  });

  el.addEventListener('input', () => {
    el.classList.remove('field-error');
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  });
}

function makeField(labelText: string, inputEl: HTMLElement, rule?: ValidationRule): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrapper.appendChild(label);
  wrapper.appendChild(inputEl);
  if (rule && (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement)) {
    attachValidation(inputEl, wrapper, rule);
  }
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
      validateRequired('some text'),
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
      validateDate(),
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
  const cfg = box.config as WeatherConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';
  if (cfg.data) {
    statusEl.textContent = `${cfg.data.temperature}\u00b0F, ${cfg.data.condition} (H: ${cfg.data.high}\u00b0 L: ${cfg.data.low}\u00b0)`;
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching weather\u2026';
    const data = await fetchWeather(city);
    if (data) {
      updateWeatherData(box.id, data);
      statusEl.textContent = `${data.temperature}\u00b0F, ${data.condition} (H: ${data.high}\u00b0 L: ${data.low}\u00b0)`;
    } else {
      statusEl.textContent = 'City not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'e.g. Portland';
  cityInput.addEventListener('blur', () => void doFetch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityInput.blur();
    }
  });

  frag.appendChild(makeField('City Name', cityInput, validateRequired('a city name')));
  frag.appendChild(statusEl);
  return frag;
}

function buildQRForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as QRConfig;
  frag.appendChild(
    makeField(
      'URL',
      inputEl('url', cfg.url, (v) => updateConfig(box.id, 'url', v)),
      validateUrl(),
    ),
  );
  return frag;
}

function buildQuoteForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as QuoteConfig;

  const quoteTextarea = textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v));
  const authorInput = inputEl('text', cfg.author, (v) => updateConfig(box.id, 'author', v));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-random-quote';
  btn.textContent = 'Random Quote';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Fetching\u2026';
    const result = await fetchQuote();
    if (result) {
      quoteTextarea.value = result.text;
      authorInput.value = result.author;
      updateConfig(box.id, 'content', result.text);
      updateConfig(box.id, 'author', result.author);
    } else {
      btn.textContent = 'Fetch failed';
      setTimeout(() => {
        btn.textContent = 'Random Quote';
      }, 2000);
    }
    btn.disabled = false;
    if (result) btn.textContent = 'Random Quote';
  });

  frag.appendChild(makeField('Quote Text', quoteTextarea, validateRequired('a quote')));
  frag.appendChild(makeField('Author (optional)', authorInput));
  frag.appendChild(btn);
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
