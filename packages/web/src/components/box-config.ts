/**
 * Type-specific config form builders.
 * Each builder returns a DocumentFragment of form fields for a box type.
 */

import type {
  EditorBox,
  EditorBoxType,
  ForecastConfig,
  QRConfig,
  QuoteConfig,
  WeatherConfig,
  DateConfig,
  SunConfig,
  AQIConfig,
  ProgressConfig,
} from '../state';
import {
  updateConfig,
  updateForecastEntries,
  updateWeatherData,
  updateSunData,
  updateAQIData,
} from '../state';
import { fetchForecast, fetchWeather, fetchQuote, fetchSunTimes, fetchAirQuality } from '../api';

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
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'e.g. Portland, OR';
  cityInput.addEventListener('blur', () => void doFetch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityInput.blur();
    }
  });

  frag.appendChild(makeField('Location', cityInput, validateRequired('a location')));
  frag.appendChild(statusEl);

  // Auto-fetch on mount when location is set but data is missing — keeps the
  // eInk preview live without requiring a manual blur (e.g. after import or
  // localStorage restore).
  if (cfg.city.trim() && !cfg.data) {
    void doFetch();
  }

  return frag;
}

function buildForecastForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as ForecastConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';

  const summarize = (
    entries: readonly { time: string; temperature: number; condition: string }[],
  ): string =>
    entries.map((e) => `${e.time} ${String(e.temperature)}°F ${e.condition}`).join(' · ');

  if (cfg.entries && cfg.entries.length > 0) {
    statusEl.textContent = summarize(cfg.entries);
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching forecast…';
    const entries = await fetchForecast(city);
    if (entries && entries.length > 0) {
      updateForecastEntries(box.id, entries);
      statusEl.textContent = summarize(entries);
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'e.g. Portland, OR';
  cityInput.addEventListener('blur', () => void doFetch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityInput.blur();
    }
  });

  frag.appendChild(makeField('Location', cityInput, validateRequired('a location')));
  frag.appendChild(statusEl);

  if (cfg.city.trim() && (!cfg.entries || cfg.entries.length === 0)) {
    void doFetch();
  }

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

function buildDateForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as DateConfig;

  function makeCheckbox(labelText: string, key: string, checked: boolean): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'field field-checkbox';
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => updateConfig(box.id, key, String(cb.checked)));
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${labelText}`));
    wrapper.appendChild(label);
    return wrapper;
  }

  frag.appendChild(makeCheckbox('Show week number', 'showWeekNumber', cfg.showWeekNumber));
  frag.appendChild(makeCheckbox('Show day of year', 'showDayOfYear', cfg.showDayOfYear));
  return frag;
}

function buildMoonForm(_box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const info = document.createElement('div');
  info.className = 'weather-status';
  info.textContent = 'Moon phase is computed automatically.';
  frag.appendChild(info);
  return frag;
}

function buildSunForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as SunConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';
  if (cfg.data) {
    statusEl.textContent = `Rise: ${cfg.data.sunrise} Set: ${cfg.data.sunset} (${cfg.data.dayLength})`;
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching sun times\u2026';
    const data = await fetchSunTimes(city);
    if (data) {
      updateSunData(box.id, data);
      statusEl.textContent = `Rise: ${data.sunrise} Set: ${data.sunset} (${data.dayLength})`;
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'e.g. Portland, OR';
  cityInput.addEventListener('blur', () => void doFetch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityInput.blur();
    }
  });

  frag.appendChild(makeField('Location', cityInput, validateRequired('a location')));
  frag.appendChild(statusEl);

  if (cfg.city.trim() && !cfg.data) {
    void doFetch();
  }

  return frag;
}

function buildAQIForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as AQIConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';
  if (cfg.data) {
    const uvStr = cfg.data.uvIndex != null ? ` UV:${String(cfg.data.uvIndex)}` : '';
    statusEl.textContent = `AQI ${String(cfg.data.aqi)} (${cfg.data.category})${uvStr} — ${cfg.data.dominantPollutant}`;
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching air quality\u2026';
    const data = await fetchAirQuality(city);
    if (data) {
      updateAQIData(box.id, data);
      const uvStr = data.uvIndex != null ? ` UV:${String(data.uvIndex)}` : '';
      statusEl.textContent = `AQI ${String(data.aqi)} (${data.category})${uvStr} — ${data.dominantPollutant}`;
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'e.g. Portland, OR';
  cityInput.addEventListener('blur', () => void doFetch());
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityInput.blur();
    }
  });

  frag.appendChild(makeField('Location', cityInput, validateRequired('a location')));
  frag.appendChild(statusEl);

  if (cfg.city.trim() && !cfg.data) {
    void doFetch();
  }

  return frag;
}

function buildProgressForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as ProgressConfig;
  const row = document.createElement('div');
  row.className = 'field-row';
  row.appendChild(
    makeField(
      'Label',
      inputEl('text', cfg.progressLabel, (v) => updateConfig(box.id, 'progressLabel', v)),
    ),
  );
  frag.appendChild(row);
  const dateRow = document.createElement('div');
  dateRow.className = 'field-row';
  dateRow.appendChild(
    makeField(
      'Start Date (optional)',
      inputEl('date', cfg.startDate, (v) => updateConfig(box.id, 'startDate', v)),
    ),
  );
  dateRow.appendChild(
    makeField(
      'End Date (optional)',
      inputEl('date', cfg.endDate, (v) => updateConfig(box.id, 'endDate', v)),
    ),
  );
  frag.appendChild(dateRow);
  return frag;
}

// -- Registry ---------------------------------------------------------------

const formBuilders: Record<EditorBoxType, (box: EditorBox) => DocumentFragment> = {
  text: buildTextForm,
  countdown: buildCountdownForm,
  weather: buildWeatherForm,
  forecast: buildForecastForm,
  qr: buildQRForm,
  quote: buildQuoteForm,
  date: buildDateForm,
  moon: buildMoonForm,
  sun: buildSunForm,
  aqi: buildAQIForm,
  progress: buildProgressForm,
};

export function buildConfigForm(box: EditorBox): DocumentFragment {
  const builder = formBuilders[box.type];
  return builder(box);
}
