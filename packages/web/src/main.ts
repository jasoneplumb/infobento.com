/**
 * Entry point for the InfoBento web configuration editor.
 * Wires up Add/Import/Export, registers render callbacks,
 * and performs the initial render.
 *
 * Routing: a single SPA entry. The default route is the editor; `/pair/:code`
 * (the device QR deep link) renders the pairing page instead (issue #74).
 */

import type { EditorBoxType } from './state';
import {
  addBox,
  BOX_TYPE_LABELS,
  CHIP_GROUPS,
  exportJSON,
  LOCATION_TYPES,
  getCornerRadius,
  getFontSize,
  getFontWeight,
  setFontWeight,
  getPadding,
  getShowHeaders,
  getDeviceProfile,
  importJSON,
  onPreviewRender,
  onRender,
  setCornerRadius,
  setFontSize,
  setPadding,
  setShowHeaders,
  setDeviceProfile,
  getRefreshesPerDay,
  setRefreshesPerDay,
} from './state';
import { DEVICE_PROFILES } from '@infobento/core';
import { renderBoxList, decorateBoxList } from './components/box-list';
import {
  renderPreview,
  setPreviewOrientation,
  getPreviewOrientation,
  onRenderedBoxIds,
} from './components/preview';
import { requireConsent } from './components/consent';
import { openSignInDialog } from './components/sign-in';
import { openDevicesDialog } from './components/devices';
import { getSession, signOut, initCloudSync } from './cloud';
import { ensureLocationDefault } from './geolocation';
import { showAuthErrorBanner } from './auth-error';

/** Initialize the box editor (the default route). */
function initEditor(): void {
  // -- Render callbacks -----------------------------------------------------

  function renderAllPreviews(): void {
    renderPreview('eink-display');
  }

  function render(): void {
    renderBoxList('box-list');
    renderAddChips();
    renderAllPreviews();
  }

  onRender(render);
  onPreviewRender(renderAllPreviews);
  // When a preview resolves (or the orientation changes), update the editor's
  // indicator showing which boxes rendered vs. were dropped (don't fit the panel).
  onRenderedBoxIds(decorateBoxList);

  // -- Add chips (grouped by theme; every chip stays available; hide/restore) --

  /** Build one add-chip: "+ Label" plus a hover × to hide it from the palette. */
  /** One palette chip. The whole control is the add action — a single click. */
  function makeChip(type: EditorBoxType): HTMLElement {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn-add-chip';
    add.textContent = `+ ${BOX_TYPE_LABELS[type]}`;
    add.addEventListener('click', () => {
      addBox(type);
      // Location rows auto-detect (IP-based) when no location is known yet.
      if (LOCATION_TYPES.has(type)) void ensureLocationDefault();
    });
    return add;
  }

  function renderAddChips(): void {
    const addChips = document.getElementById('add-chips');
    if (!addChips) return;
    addChips.innerHTML = '';

    // Grouped, always-available chips (a box type can be added more than once).
    for (const group of CHIP_GROUPS) {
      const section = document.createElement('div');
      section.className = 'chip-group';
      const label = document.createElement('div');
      label.className = 'chip-group-label';
      label.textContent = group.label;
      const chips = document.createElement('div');
      chips.className = 'chip-group-chips';
      for (const type of group.types) chips.appendChild(makeChip(type));
      section.append(label, chips);
      addChips.appendChild(section);
    }
  }

  // -- Wire up header menu (Import / Export) -------------------------------

  const menuWrapper = document.getElementById('header-menu');
  const menuTrigger = document.getElementById('btn-menu');
  const menuDropdown = menuWrapper?.querySelector<HTMLElement>('.menu-dropdown') ?? null;

  function setMenuOpen(open: boolean): void {
    if (!menuTrigger || !menuDropdown) return;
    menuTrigger.setAttribute('aria-expanded', String(open));
    menuDropdown.classList.toggle('is-open', open);
  }

  menuTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menuTrigger.getAttribute('aria-expanded') === 'true';
    setMenuOpen(!isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!menuWrapper) return;
    if (!menuWrapper.contains(e.target as Node)) setMenuOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenuOpen(false);
  });

  function wireMenuItem(id: string, action: () => void): void {
    document.getElementById(id)?.addEventListener('click', () => {
      setMenuOpen(false);
      action();
    });
  }

  wireMenuItem('btn-import', importJSON);
  wireMenuItem('btn-export', exportJSON);

  // -- Account / device menu (issue #76) ------------------------------------
  //
  // Sign-in routes through OAuth; once signed in, the Devices panel switches the
  // editor's persistence to a paired device. Visibility reflects session state.
  initCloudSync();

  function setHidden(id: string, hidden: boolean): void {
    document.getElementById(id)?.toggleAttribute('hidden', hidden);
  }

  function refreshAccountMenu(): void {
    void getSession().then((session) => {
      setHidden('btn-signin', session.authenticated);
      setHidden('btn-devices', !session.authenticated);
      setHidden('btn-signout', !session.authenticated);
    });
  }

  wireMenuItem('btn-signin', openSignInDialog);
  wireMenuItem('btn-devices', openDevicesDialog);
  wireMenuItem('btn-signout', () => {
    void signOut().then(refreshAccountMenu);
  });

  refreshAccountMenu();

  // -- Wire up Show Box Headers toggle --------------------------------------

  const headersToggle = document.querySelector<HTMLInputElement>('#toggle-headers input');
  if (headersToggle) {
    headersToggle.checked = getShowHeaders();
    headersToggle.addEventListener('change', () => setShowHeaders(headersToggle.checked));
  }

  // -- Wire up Landscape toggle ---------------------------------------------

  const landscapeToggle = document.querySelector<HTMLInputElement>('#toggle-landscape input');
  if (landscapeToggle) {
    // Restore the persisted per-browser preference (defaults to landscape) so
    // the toggle survives reloads and matches the device's landscape output.
    landscapeToggle.checked = getPreviewOrientation();
    landscapeToggle.addEventListener('change', () =>
      setPreviewOrientation(landscapeToggle.checked),
    );
  }

  // -- Wire up Display (resolution) selector --------------------------------

  const profileSelect = document.querySelector<HTMLSelectElement>('#device-profile-select');
  if (profileSelect) {
    for (const profile of DEVICE_PROFILES) {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = profile.label;
      profileSelect.appendChild(opt);
    }
    profileSelect.value = getDeviceProfile().id;
    profileSelect.addEventListener('change', () => setDeviceProfile(profileSelect.value));
  }

  // -- Wire up Refresh interval selector (#152) -----------------------------
  // Preset ladder: friendly intervals → refreshesPerDay counts (86400 / count).
  // 0 = off; 5760 ≈ a 15s interval, the bench-testing low end.
  const refreshSelect = document.querySelector<HTMLSelectElement>('#refresh-interval-select');
  if (refreshSelect) {
    const REFRESH_PRESETS: ReadonlyArray<[label: string, perDay: number]> = [
      ['Off', 0],
      ['Every 24 hours', 1],
      ['Every 12 hours', 2],
      ['Every 8 hours', 3],
      ['Every 6 hours', 4],
      ['Every 4 hours', 6],
      ['Every 2 hours', 12],
      ['Every hour', 24],
      ['Every 30 min', 48],
      ['Every 15 min', 96],
      ['Every 5 min', 288],
      ['Every minute', 1440],
      ['Every 15 sec (testing)', 5760],
    ];
    for (const [label, perDay] of REFRESH_PRESETS) {
      const opt = document.createElement('option');
      opt.value = String(perDay);
      opt.textContent = label;
      refreshSelect.appendChild(opt);
    }
    // Snap the stored value to the nearest preset so a custom/legacy count still
    // shows a sensible selection.
    const current = getRefreshesPerDay();
    const nearest = REFRESH_PRESETS.reduce(
      (best, [, perDay]) => (Math.abs(perDay - current) < Math.abs(best - current) ? perDay : best),
      REFRESH_PRESETS[0]?.[1] ?? 0,
    );
    refreshSelect.value = String(nearest);
    refreshSelect.addEventListener('change', () => setRefreshesPerDay(Number(refreshSelect.value)));
  }

  // -- Wire up Font Weight slider (1–9 → Inter static weight 100–900) -------

  const weightSlider = document.querySelector<HTMLInputElement>('#font-weight-slider');
  const weightDisplay = document.getElementById('font-weight-display');
  if (weightSlider) {
    const v = Math.round(getFontWeight() * 10);
    weightSlider.value = String(v);
    if (weightDisplay) weightDisplay.textContent = String(v * 100); // show weight (100–900)
    weightSlider.addEventListener('input', () => {
      const n = Number(weightSlider.value);
      if (weightDisplay) weightDisplay.textContent = String(n * 100);
      setFontWeight(n / 10);
    });
  }

  // -- Wire up Font Size stepper --------------------------------------------

  function wireStepper(
    decId: string,
    incId: string,
    displayId: string,
    getter: () => number,
    setter: (v: number) => void,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
  ): void {
    const decBtn = document.getElementById(decId);
    const incBtn = document.getElementById(incId);
    const display = document.getElementById(displayId);
    if (!decBtn || !incBtn || !display) return;

    display.textContent = format(getter());

    decBtn.addEventListener('click', () => {
      const val = Math.max(min, getter() - step);
      setter(val);
      display.textContent = format(val);
    });
    incBtn.addEventListener('click', () => {
      const val = Math.min(max, getter() + step);
      setter(val);
      display.textContent = format(val);
    });
  }

  wireStepper(
    'font-size-dec',
    'font-size-inc',
    'font-size-display',
    getFontSize,
    setFontSize,
    8,
    42,
    2,
    (v) => `${String(v)}px`,
  );
  wireStepper(
    'corner-radius-dec',
    'corner-radius-inc',
    'corner-radius-display',
    getCornerRadius,
    setCornerRadius,
    0,
    7,
    1,
    String,
  );
  wireStepper(
    'padding-dec',
    'padding-inc',
    'padding-display',
    getPadding,
    setPadding,
    0,
    10,
    1,
    String,
  );

  // -- Version stamp --------------------------------------------------------

  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

  // -- Initial render (after consent) ---------------------------------------

  // Render once so the editor is visible behind the dialog (greyed by overlay),
  // then await consent before the user can interact.
  render();
  void requireConsent().then(() => {
    // A failed OAuth start lands back here as /?auth_error=… — surface it once
    // the consent gate is cleared (the user who clicked "Sign in" has already
    // consented, so this fires immediately for them). See #118.
    showAuthErrorBanner();
    void ensureLocationDefault();
  });
}

// -- Route dispatch ---------------------------------------------------------

const pairMatch = /^\/pair\/(.+)$/.exec(window.location.pathname);
if (pairMatch) {
  const raw = pairMatch[1] ?? '';
  // A corrupt/hand-crafted QR can produce malformed percent-encoding, which
  // makes decodeURIComponent throw — fall back to the raw segment so the page
  // still renders (and shows a clean "unknown code" message) rather than
  // crashing SPA init.
  let code = raw;
  try {
    code = decodeURIComponent(raw);
  } catch {
    code = raw;
  }
  void import('./pair').then((m) => m.renderPairPage(code));
} else {
  initEditor();
}
