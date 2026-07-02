/**
 * Type-specific config form builders.
 * Each builder returns a DocumentFragment of form fields for a box type.
 */

import type {
  EditorBox,
  EditorBoxType,
  ForecastConfig,
  Forecast3DConfig,
  QRConfig,
  QuoteConfig,
  DateConfig,
  WeatherConfig,
  SunConfig,
  AQIConfig,
  ProgressConfig,
  HoroscopeConfig,
  JokeConfig,
  OnThisDayConfig,
  StocksConfig,
  CalendarConfig,
  HabitConfig,
} from '../state';
import {
  updateConfig,
  updateConfigList,
  appendToConfigList,
  removeFromConfigList,
  updateForecastEntries,
  updateForecast3DEntries,
  updateWeatherData,
  updateSunData,
  updateAQIData,
  updateStocksData,
  getTempUnit,
} from '../state';
import type { CalendarEvent, HabitEntry, StockDuration } from '@infobento/core';
import { STOCK_DURATIONS, DEFAULT_STOCK_DURATION } from '@infobento/core';
import { propagateLocationToEmptyBoxes, detectLocationByIP } from '../geolocation.js';
import {
  fetchForecast,
  fetchForecast3D,
  fetchWeather,
  fetchQuote,
  fetchHoroscope,
  fetchJoke,
  fetchOnThisDay,
  fetchStocks,
  fetchSunTimes,
  fetchAirQuality,
} from '../api';

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

// -- Debounce helper --------------------------------------------------------

const _debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();

function debouncedFetch(boxId: number, fn: () => Promise<void>, delayMs = 500): void {
  const existing = _debounceTimers.get(boxId);
  if (existing) clearTimeout(existing);
  _debounceTimers.set(
    boxId,
    setTimeout(() => {
      _debounceTimers.delete(boxId);
      void fn();
    }, delayMs),
  );
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

const LOCATE_ICON =
  `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<path d="M14 2 L2 7 Q7 9 8 14 Z"/>` +
  `</svg>`;

function makeLocationField(
  cityInput: HTMLInputElement,
  onCity: (city: string) => void,
  required = true,
): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';

  const labelRow = document.createElement('div');
  labelRow.className = 'field-label-row';

  const label = document.createElement('label');
  label.textContent = 'Location';

  const locBtn = document.createElement('button');
  locBtn.type = 'button';
  locBtn.className = 'btn-locate';
  locBtn.title = 'Use my location';
  locBtn.setAttribute('aria-label', 'Use my location');
  locBtn.innerHTML = LOCATE_ICON;

  locBtn.addEventListener('click', () => {
    locBtn.disabled = true;
    void detectLocationByIP().then((city) => {
      locBtn.disabled = false;
      if (!city) return;
      cityInput.value = city;
      onCity(city);
      propagateLocationToEmptyBoxes(city);
    });
  });

  labelRow.appendChild(label);
  labelRow.appendChild(locBtn);
  wrapper.appendChild(labelRow);
  wrapper.appendChild(cityInput);
  if (required) attachValidation(cityInput, wrapper, validateRequired('a location'));

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

/**
 * A labeled −/＋ integer stepper field (clamped to [min, max]). `onChange` fires
 * only on user clicks, never on initial build, so it won't trigger a spurious fetch.
 */
function makeStepperField(
  labelText: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrapper.appendChild(label);

  const stepper = document.createElement('div');
  stepper.className = 'field-stepper';

  let current = Math.min(max, Math.max(min, Math.round(value)));

  const dec = document.createElement('button');
  dec.type = 'button';
  dec.className = 'stepper-btn';
  dec.textContent = '−'; // minus sign

  const display = document.createElement('span');
  display.className = 'stepper-value';

  const inc = document.createElement('button');
  inc.type = 'button';
  inc.className = 'stepper-btn';
  inc.textContent = '+';

  const sync = (): void => {
    display.textContent = String(current);
    dec.disabled = current <= min;
    inc.disabled = current >= max;
  };
  const apply = (next: number): void => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === current) return;
    current = clamped;
    sync();
    onChange(current);
  };
  sync();

  dec.addEventListener('click', () => apply(current - 1));
  inc.addEventListener('click', () => apply(current + 1));

  stepper.append(dec, display, inc);
  wrapper.appendChild(stepper);
  return wrapper;
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
    const data = await fetchWeather(city, getTempUnit());
    if (data) {
      updateWeatherData(box.id, data);
      statusEl.textContent = `${data.temperature}\u00b0F, ${data.condition} (H: ${data.high}\u00b0 L: ${data.low}\u00b0)`;
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => {
    updateConfig(box.id, 'city', v);
    debouncedFetch(box.id, doFetch);
  });
  cityInput.placeholder = 'e.g. Portland, OR';

  frag.appendChild(
    makeLocationField(cityInput, (city) => {
      updateConfig(box.id, 'city', city);
      void doFetch();
    }),
  );
  frag.appendChild(statusEl);

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
  ): string => entries.map((e) => `${e.time} ${String(e.temperature)}° ${e.condition}`).join(' · ');

  if (cfg.entries && cfg.entries.length > 0) {
    statusEl.textContent = summarize(cfg.entries);
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching forecast…';
    const entries = await fetchForecast(city, cfg.hours ?? 3, getTempUnit());
    if (entries && entries.length > 0) {
      updateForecastEntries(box.id, entries);
      statusEl.textContent = summarize(entries);
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => {
    updateConfig(box.id, 'city', v);
    debouncedFetch(box.id, doFetch);
  });
  cityInput.placeholder = 'e.g. Portland, OR';

  frag.appendChild(
    makeLocationField(cityInput, (city) => {
      updateConfig(box.id, 'city', city);
      void doFetch();
    }),
  );
  frag.appendChild(
    makeStepperField('Hours', cfg.hours ?? 3, 1, 24, (n) => {
      updateConfig(box.id, 'hours', n);
      debouncedFetch(box.id, doFetch);
    }),
  );
  frag.appendChild(statusEl);

  if (cfg.city.trim() && (!cfg.entries || cfg.entries.length === 0)) {
    void doFetch();
  }

  return frag;
}

function buildForecast3DForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as Forecast3DConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';

  const summarize = (
    entries: readonly { day: string; high: number; low: number; condition: string }[],
  ): string =>
    entries.map((e) => `${e.day} ${String(e.high)}/${String(e.low)}° ${e.condition}`).join(' · ');

  if (cfg.entries && cfg.entries.length > 0) {
    statusEl.textContent = summarize(cfg.entries);
  }

  const doFetch = async (): Promise<void> => {
    const city = cfg.city;
    if (!city.trim()) return;
    statusEl.textContent = 'Fetching daily forecast\u2026';
    const entries = await fetchForecast3D(city, cfg.days ?? 3, getTempUnit());
    if (entries && entries.length > 0) {
      updateForecast3DEntries(box.id, entries);
      statusEl.textContent = summarize(entries);
    } else {
      statusEl.textContent = 'Location not found or fetch failed.';
    }
  };

  const cityInput = inputEl('text', cfg.city, (v) => {
    updateConfig(box.id, 'city', v);
    debouncedFetch(box.id, doFetch);
  });
  cityInput.placeholder = 'e.g. Portland, OR';

  frag.appendChild(
    makeLocationField(cityInput, (city) => {
      updateConfig(box.id, 'city', city);
      void doFetch();
    }),
  );
  frag.appendChild(
    makeStepperField('Days', cfg.days ?? 3, 1, 20, (n) => {
      updateConfig(box.id, 'days', n);
      debouncedFetch(box.id, doFetch);
    }),
  );
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

  const tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.value = cfg.tags ?? '';
  tagsInput.placeholder = 'wisdom, happiness, life';

  const doFetch = async (): Promise<void> => {
    btn.disabled = true;
    btn.textContent = 'Fetching\u2026';
    const result = await fetchQuote(tagsInput.value);
    if (result) {
      quoteTextarea.value = result.text;
      authorInput.value = result.author;
      updateConfig(box.id, 'content', result.text);
      updateConfig(box.id, 'author', result.author);
      btn.textContent = 'Random Quote';
    } else {
      btn.textContent = tagsInput.value.trim() ? 'No quote for those tags' : 'Fetch failed';
      setTimeout(() => {
        btn.textContent = 'Random Quote';
      }, 2000);
    }
    btn.disabled = false;
  };

  tagsInput.addEventListener('input', () => {
    updateConfig(box.id, 'tags', tagsInput.value);
    debouncedFetch(box.id, doFetch);
  });

  btn.addEventListener('click', () => {
    void doFetch();
  });

  frag.appendChild(makeField('Quote Text', quoteTextarea, validateRequired('a quote')));
  frag.appendChild(makeField('Author (optional)', authorInput));
  frag.appendChild(makeField('Tags (optional)', tagsInput));
  frag.appendChild(btn);

  // Auto-fetch a random quote when the box is freshly added (both fields empty)
  if (!cfg.content.trim() && !cfg.author.trim()) {
    void doFetch();
  }

  return frag;
}

function buildDateForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as DateConfig;

  // Optional location: geocoded server-side at pull time to render the date in
  // the device's local timezone (#168). Blank falls back to another location
  // box, then the server clock.
  const cityInput = inputEl('text', cfg.city ?? '', (v) => updateConfig(box.id, 'city', v));
  cityInput.placeholder = 'Optional — e.g. Portland, OR';
  frag.appendChild(
    makeLocationField(cityInput, (city) => updateConfig(box.id, 'city', city), false),
  );

  // Checkbox for year progress visibility
  const checkboxWrapper = document.createElement('div');
  checkboxWrapper.className = 'field';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = cfg.showYearProgress ?? false;
  checkbox.addEventListener('change', () => {
    updateConfig(box.id, 'showYearProgress', checkbox.checked);
  });
  const checkboxLabel = document.createElement('label');
  checkboxLabel.style.display = 'flex';
  checkboxLabel.style.alignItems = 'center';
  checkboxLabel.style.gap = '0.5rem';
  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(document.createTextNode('Show year progress'));
  checkboxWrapper.appendChild(checkboxLabel);
  frag.appendChild(checkboxWrapper);

  const info = document.createElement('div');
  info.className = 'weather-status';
  info.textContent =
    'Date is computed automatically. Set a location to keep the date in that timezone.';
  frag.appendChild(info);
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

  const cityInput = inputEl('text', cfg.city, (v) => {
    updateConfig(box.id, 'city', v);
    debouncedFetch(box.id, doFetch);
  });
  cityInput.placeholder = 'e.g. Portland, OR';

  frag.appendChild(
    makeLocationField(cityInput, (city) => {
      updateConfig(box.id, 'city', city);
      void doFetch();
    }),
  );
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

  const cityInput = inputEl('text', cfg.city, (v) => {
    updateConfig(box.id, 'city', v);
    debouncedFetch(box.id, doFetch);
  });
  cityInput.placeholder = 'e.g. Portland, OR';

  frag.appendChild(
    makeLocationField(cityInput, (city) => {
      updateConfig(box.id, 'city', city);
      void doFetch();
    }),
  );
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

const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

function buildHoroscopeForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as HoroscopeConfig;

  const signSelect = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select your sign\u2026';
  signSelect.appendChild(placeholder);
  for (const sign of ZODIAC_SIGNS) {
    const opt = document.createElement('option');
    opt.value = sign;
    opt.textContent = sign.charAt(0).toUpperCase() + sign.slice(1);
    if (cfg.sign === sign) opt.selected = true;
    signSelect.appendChild(opt);
  }

  const readingTextarea = textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-random-quote';
  btn.textContent = 'Refresh Reading';

  const doFetch = async (): Promise<void> => {
    const sign = signSelect.value;
    if (!sign) {
      btn.textContent = 'Pick a sign first';
      setTimeout(() => {
        btn.textContent = 'Refresh Reading';
      }, 2000);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Fetching\u2026';
    const result = await fetchHoroscope(sign);
    if (result) {
      readingTextarea.value = result.text;
      updateConfig(box.id, 'content', result.text);
      updateConfig(box.id, 'date', result.date);
      btn.textContent = 'Refresh Reading';
    } else {
      btn.textContent = 'Fetch failed';
      setTimeout(() => {
        btn.textContent = 'Refresh Reading';
      }, 2000);
    }
    btn.disabled = false;
  };

  btn.addEventListener('click', () => {
    void doFetch();
  });

  signSelect.addEventListener('change', () => {
    updateConfig(box.id, 'sign', signSelect.value);
    if (signSelect.value && !readingTextarea.value.trim()) {
      void doFetch();
    }
  });

  frag.appendChild(makeField('Zodiac Sign', signSelect));
  frag.appendChild(makeField('Reading', readingTextarea));
  frag.appendChild(btn);

  // Auto-fetch when freshly added with a sign already chosen but no reading yet
  if (cfg.sign && !cfg.content.trim()) {
    void doFetch();
  }

  return frag;
}

function buildJokeForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as JokeConfig;

  const jokeTextarea = textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-random-quote';
  btn.textContent = 'Random Joke';

  const categoriesInput = document.createElement('input');
  categoriesInput.type = 'text';
  categoriesInput.value = cfg.categories ?? '';
  categoriesInput.placeholder = 'Programming, Pun, Misc, Dark, Spooky, Christmas';

  const doFetch = async (): Promise<void> => {
    btn.disabled = true;
    btn.textContent = 'Fetching\u2026';
    const result = await fetchJoke(categoriesInput.value);
    if (result) {
      jokeTextarea.value = result.text;
      updateConfig(box.id, 'content', result.text);
      updateConfig(box.id, 'category', result.category);
      btn.textContent = 'Random Joke';
    } else {
      btn.textContent = categoriesInput.value.trim()
        ? 'No joke for those categories'
        : 'Fetch failed';
      setTimeout(() => {
        btn.textContent = 'Random Joke';
      }, 2000);
    }
    btn.disabled = false;
  };

  categoriesInput.addEventListener('input', () => {
    updateConfig(box.id, 'categories', categoriesInput.value);
    debouncedFetch(box.id, doFetch);
  });

  btn.addEventListener('click', () => {
    void doFetch();
  });

  frag.appendChild(makeField('Joke Text', jokeTextarea, validateRequired('a joke')));
  frag.appendChild(makeField('Categories (optional)', categoriesInput));
  frag.appendChild(btn);

  // Auto-fetch when freshly added (empty body)
  if (!cfg.content.trim()) {
    void doFetch();
  }

  return frag;
}

const ONTHISDAY_CATEGORIES: Array<[string, string]> = [
  ['events', 'Events'],
  ['births', 'Births'],
  ['deaths', 'Deaths'],
  ['holidays', 'Holidays'],
  ['all', 'All'],
];

function buildOnThisDayForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as OnThisDayConfig;

  const categorySelect = document.createElement('select');
  for (const [value, label] of ONTHISDAY_CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if ((cfg.category || 'events') === value) opt.selected = true;
    categorySelect.appendChild(opt);
  }

  const textArea = textareaEl(cfg.content, (v) => updateConfig(box.id, 'content', v));

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-random-quote';
  btn.textContent = 'Refresh';

  const doFetch = async (): Promise<void> => {
    btn.disabled = true;
    btn.textContent = 'Fetching\u2026';
    const result = await fetchOnThisDay(categorySelect.value);
    if (result) {
      textArea.value = result.text;
      updateConfig(box.id, 'content', result.text);
      updateConfig(box.id, 'year', result.year);
      btn.textContent = 'Refresh';
    } else {
      btn.textContent = 'No entry found';
      setTimeout(() => {
        btn.textContent = 'Refresh';
      }, 2000);
    }
    btn.disabled = false;
  };

  categorySelect.addEventListener('change', () => {
    updateConfig(box.id, 'category', categorySelect.value);
    void doFetch();
  });

  btn.addEventListener('click', () => {
    void doFetch();
  });

  frag.appendChild(makeField('Category', categorySelect));
  frag.appendChild(makeField('Entry', textArea));
  frag.appendChild(btn);

  // Auto-fetch when freshly added (empty body)
  if (!cfg.content.trim()) {
    void doFetch();
  }

  return frag;
}

// -- List editor helper -----------------------------------------------------

/**
 * Build a generic add/remove row editor. The caller renders the row's input
 * fields; this helper handles list framing, the remove button per row, and
 * an Add button that triggers a form rebuild via setState.
 */
function buildListField(
  label: string,
  rowCount: number,
  buildRow: (idx: number) => HTMLElement,
  onAdd: () => void,
  onRemove: (idx: number) => void,
  addLabel: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const list = document.createElement('div');
  list.className = 'list-editor';
  for (let idx = 0; idx < rowCount; idx++) {
    const row = document.createElement('div');
    row.className = 'list-editor-row';
    row.appendChild(buildRow(idx));
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-list-remove';
    removeBtn.textContent = '\u2715';
    const removeIdx = idx;
    removeBtn.addEventListener('click', () => {
      onRemove(removeIdx);
    });
    row.appendChild(removeBtn);
    list.appendChild(row);
  }
  wrapper.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-list-add';
  addBtn.textContent = `+ ${addLabel}`;
  addBtn.addEventListener('click', onAdd);
  wrapper.appendChild(addBtn);

  return wrapper;
}

// -- Stocks / Calendar / Habit forms ----------------------------------------

function buildStocksForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as StocksConfig;

  const statusEl = document.createElement('div');
  statusEl.className = 'weather-status';
  if (cfg.data) {
    const sign = cfg.data.change >= 0 ? '+' : '';
    statusEl.textContent =
      `${cfg.data.price.toFixed(2)} ` +
      `(${sign}${cfg.data.change.toFixed(2)}, ` +
      `${sign}${cfg.data.changePercent.toFixed(2)}%)`;
  }

  const doFetch = async (): Promise<void> => {
    const symbol = cfg.symbol;
    if (!symbol.trim()) return;
    statusEl.textContent = 'Fetching quote\u2026';
    const data = await fetchStocks(symbol, cfg.duration ?? DEFAULT_STOCK_DURATION);
    if (data) {
      updateStocksData(box.id, data);
      const sign = data.change >= 0 ? '+' : '';
      statusEl.textContent =
        `${data.price.toFixed(2)} ` +
        `(${sign}${data.change.toFixed(2)}, ` +
        `${sign}${data.changePercent.toFixed(2)}%)`;
    } else {
      statusEl.textContent = 'Symbol not found or fetch failed.';
    }
  };

  const symbolInput = inputEl('text', cfg.symbol, (v) => {
    updateConfig(box.id, 'symbol', v);
    debouncedFetch(box.id, doFetch);
  });
  symbolInput.placeholder = 'e.g. AAPL';

  const durationSelect = document.createElement('select');
  for (const opt of STOCK_DURATIONS) {
    const optEl = document.createElement('option');
    optEl.value = opt.value;
    optEl.textContent = opt.label;
    if (opt.value === (cfg.duration ?? DEFAULT_STOCK_DURATION)) optEl.selected = true;
    durationSelect.appendChild(optEl);
  }
  durationSelect.addEventListener('change', () => {
    updateConfig(box.id, 'duration', durationSelect.value as StockDuration);
    debouncedFetch(box.id, doFetch);
  });

  const row = document.createElement('div');
  row.className = 'field-row';
  row.appendChild(makeField('Symbol', symbolInput, validateRequired('a symbol')));
  row.appendChild(makeField('Duration', durationSelect));
  frag.appendChild(row);
  frag.appendChild(statusEl);

  if (cfg.symbol.trim() && !cfg.data) {
    void doFetch();
  }

  return frag;
}

function buildCalendarForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as CalendarConfig;

  const renderRow = (idx: number): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'list-row-fields';
    const event = cfg.events[idx];
    if (!event) return row;

    const time = inputEl('text', event.time ?? '', (v) => {
      const next = cfg.events.map((e, i) => (i === idx ? { ...e, time: v } : e));
      updateConfigList<CalendarEvent>(box.id, 'events', next);
    });
    time.placeholder = '14:00';
    time.style.width = '5rem';

    const title = inputEl('text', event.title, (v) => {
      const next = cfg.events.map((e, i) => (i === idx ? { ...e, title: v } : e));
      updateConfigList<CalendarEvent>(box.id, 'events', next);
    });
    title.placeholder = 'Event title';

    row.appendChild(time);
    row.appendChild(title);
    return row;
  };

  frag.appendChild(
    buildListField(
      'Events',
      cfg.events.length,
      renderRow,
      () => appendToConfigList<CalendarEvent>(box.id, 'events', { title: '', time: '' }),
      (idx) => removeFromConfigList(box.id, 'events', idx),
      'Add event',
    ),
  );
  return frag;
}

function buildHabitForm(box: EditorBox): DocumentFragment {
  const frag = document.createDocumentFragment();
  const cfg = box.config as HabitConfig;

  const renderRow = (idx: number): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'list-row-fields';
    const habit = cfg.habits[idx];
    if (!habit) return row;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = habit.completedToday;
    checkbox.title = 'Completed today';
    checkbox.addEventListener('change', () => {
      const next = cfg.habits.map((h, i) =>
        i === idx ? { ...h, completedToday: checkbox.checked } : h,
      );
      updateConfigList<HabitEntry>(box.id, 'habits', next);
    });

    const name = inputEl('text', habit.name, (v) => {
      const next = cfg.habits.map((h, i) => (i === idx ? { ...h, name: v } : h));
      updateConfigList<HabitEntry>(box.id, 'habits', next);
    });
    name.placeholder = 'Habit name';

    const streak = document.createElement('input');
    streak.type = 'number';
    streak.min = '0';
    streak.value = String(habit.streak);
    streak.style.width = '4rem';
    streak.title = 'Streak (days)';
    streak.addEventListener('input', () => {
      const n = Math.max(0, parseInt(streak.value, 10) || 0);
      const next = cfg.habits.map((h, i) => (i === idx ? { ...h, streak: n } : h));
      updateConfigList<HabitEntry>(box.id, 'habits', next);
    });

    row.appendChild(checkbox);
    row.appendChild(name);
    row.appendChild(streak);
    return row;
  };

  frag.appendChild(
    buildListField(
      'Habits',
      cfg.habits.length,
      renderRow,
      () =>
        appendToConfigList<HabitEntry>(box.id, 'habits', {
          name: '',
          streak: 0,
          completedToday: false,
        }),
      (idx) => removeFromConfigList(box.id, 'habits', idx),
      'Add habit',
    ),
  );
  return frag;
}

// -- Registry ---------------------------------------------------------------

const formBuilders: Record<EditorBoxType, (box: EditorBox) => DocumentFragment> = {
  text: buildTextForm,
  countdown: buildCountdownForm,
  weather: buildWeatherForm,
  forecast: buildForecastForm,
  forecast3d: buildForecast3DForm,
  qr: buildQRForm,
  quote: buildQuoteForm,
  date: buildDateForm,
  moon: buildMoonForm,
  sun: buildSunForm,
  aqi: buildAQIForm,
  progress: buildProgressForm,
  horoscope: buildHoroscopeForm,
  joke: buildJokeForm,
  onthisday: buildOnThisDayForm,
  stocks: buildStocksForm,
  calendar: buildCalendarForm,
  habit: buildHabitForm,
};

export function buildConfigForm(box: EditorBox): DocumentFragment {
  const builder = formBuilders[box.type];
  return builder(box);
}
