/**
 * Cloud persistence for the editor (issue #76).
 *
 * When a signed-in user selects a paired device, the editor's saves are routed
 * here instead of to localStorage: state changes schedule a debounced PUT of the
 * current config to /api/device/<id>/config, and the device's stored config is
 * loaded back into the editor on selection. The session cookie authenticates;
 * the server enforces account ownership.
 *
 * The editor↔core translation lives in config-map.ts; this module owns the
 * network plumbing, the 500 ms debounce, and the account/device API helpers the
 * header-menu components call.
 */

import type { BentoConfig } from '@infobento/core';
import { toBentoConfig, fromBentoConfig } from './config-map';
import { enterCloudMode, exitToLocalMode, getActiveDeviceId, onCloudPersist } from './state';

export interface SessionInfo {
  authenticated: boolean;
  accountId?: string;
}

export interface DeviceSummary {
  id: string;
  pairCode: string;
  hasConfig: boolean;
}

const SAVE_DEBOUNCE_MS = 500;
let _saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Read the current auth session. Network failures read as "signed out". */
export async function getSession(): Promise<SessionInfo> {
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!res.ok) return { authenticated: false };
    const data = (await res.json()) as { authenticated?: boolean; accountId?: string };
    return {
      authenticated: data.authenticated === true,
      ...(data.accountId ? { accountId: data.accountId } : {}),
    };
  } catch {
    return { authenticated: false };
  }
}

/** List the signed-in account's paired devices (empty on error / signed out). */
export async function listDevices(): Promise<DeviceSummary[]> {
  try {
    const res = await fetch('/api/me/devices', { credentials: 'same-origin' });
    if (!res.ok) return [];
    const data = (await res.json()) as { devices?: DeviceSummary[] };
    return data.devices ?? [];
  } catch {
    return [];
  }
}

/** Unpair a device (release this account's claim). Returns true on success. */
export async function unpairDevice(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/device/${encodeURIComponent(id)}/owner`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    // If the device we just unpaired was the active one, drop back to local.
    if (res.ok && getActiveDeviceId() === id) exitToLocalMode();
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Make `deviceId` the active device: fetch its stored config and switch the
 * editor into cloud mode. A device with no config yet (404) still becomes
 * active — the editor keeps its current boxes and the first edit creates the
 * config. Returns false only if the request itself failed or was unauthorized.
 */
export async function selectDevice(deviceId: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`/api/device/${encodeURIComponent(deviceId)}/config`, {
      credentials: 'same-origin',
    });
  } catch {
    return false;
  }

  if (res.status === 404) {
    // `deviceId` came from the ownership-gated /api/me/devices list, so the
    // device is known to exist and be ours — a 404 from this firmware-facing
    // GET therefore means "no config stored yet". Adopt the editor's current
    // content; the first edit creates the config.
    enterCloudMode(deviceId);
    return true;
  }
  if (!res.ok) return false;

  try {
    const config = (await res.json()) as BentoConfig;
    enterCloudMode(deviceId, fromBentoConfig(config));
  } catch {
    // Stored config didn't parse — still enter cloud mode so edits overwrite it.
    enterCloudMode(deviceId);
  }
  return true;
}

/** Sign out: clear the server session, then restore the local editor buffer. */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Even if the network call fails, drop the client back to local mode.
  }
  exitToLocalMode();
}

/** Push the current editor config to the active device. */
async function saveNow(): Promise<void> {
  const deviceId = getActiveDeviceId();
  if (!deviceId) return;
  try {
    const res = await fetch(`/api/device/${encodeURIComponent(deviceId)}/config`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toBentoConfig()),
    });
    if (res.ok) return;
    // The device can no longer accept this account's writes — session expired
    // (401), or the device is gone / no longer ours (opaque 404 from the
    // ownership check). Fall back to local mode so the user keeps editing
    // locally instead of silently losing writes.
    if (res.status === 401 || res.status === 404) {
      exitToLocalMode();
      return;
    }
    // Rate limited (429) — retry the latest config after the server cooldown
    // rather than dropping this write. The retry re-reads current editor state.
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000;
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => void saveNow(), delayMs);
    }
    // Other 5xx: transient; the next edit reschedules a save.
  } catch {
    // Network hiccup — the next edit reschedules a save.
  }
}

/** Debounced cloud save, registered as the state module's cloud-persist hook. */
function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
}

/** Wire cloud saving into the state module. Call once at editor init. */
export function initCloudSync(): void {
  onCloudPersist(scheduleSave);
}
