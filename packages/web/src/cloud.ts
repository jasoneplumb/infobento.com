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
    // Cancel any queued save first — it would otherwise fire against a device
    // this account no longer owns.
    if (res.ok && getActiveDeviceId() === id) {
      cancelPendingSave();
      exitToLocalMode();
    }
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Make `deviceId` the active device: fetch its stored config and switch the
 * editor into cloud mode.
 *
 * A device the server has no config for (200 with `config: null`) is seeded
 * immediately from the editor's current boxes, so it starts serving frames
 * without waiting for an edit (#191).
 *
 * Returns true only when the device is genuinely active: the read succeeded,
 * and for a fresh device the seeding write was accepted. Every failure path —
 * transport error, non-2xx, undecodable body, rejected seed — returns false, so
 * a caller can never present a device as selected when it isn't.
 */
export async function selectDevice(deviceId: string): Promise<boolean> {
  // Drop any debounced save still queued for the PREVIOUS device. Without this,
  // editing device A and immediately selecting device B lets A's timer fire
  // after the switch and PUT the editor's contents to B, clobbering the config
  // we just loaded.
  cancelPendingSave();

  let res: Response;
  try {
    // Session-gated read (#116). Previously this used the firmware-facing
    // GET /api/device/:id/config, where the device id alone is the bearer
    // secret — safe only because the id came from the ownership-gated devices
    // list. This endpoint does its own ownership check, so the editor no longer
    // depends on where it obtained the id.
    res = await fetch(`/api/me/device/${encodeURIComponent(deviceId)}/config`, {
      credentials: 'same-origin',
    });
  } catch {
    return false;
  }

  // 404 now means what it says: not ours, or gone. It is no longer overloaded
  // with "no config yet" — that case is a 200 with config: null.
  if (!res.ok) return false;

  let config: unknown;
  try {
    ({ config } = (await res.json()) as { config: unknown });
  } catch {
    // A body we cannot decode is a TRANSPORT failure, not evidence that the
    // device is unconfigured. Treating it as "no config" would route into the
    // seeding path below and PUT the editor's local boxes over whatever the
    // device really had — silent data loss on a transient blip. Bail instead.
    return false;
  }

  // `== null` deliberately, to catch undefined as well: a body of `{}` yields
  // undefined, which a `=== null` test would let fall through into the mapping
  // path and throw.
  if (config == null) {
    // Never-configured device (#191). Adopt the editor's current boxes and push
    // them immediately rather than waiting for an edit that may never come.
    // Without this the device stays configless, /frames keeps returning 404,
    // and the physical unit sits on the "Set up InfoBento" screen forever even
    // though pairing and Wi-Fi provisioning both succeeded.
    enterCloudMode(deviceId);
    // Report the selection as failed unless the seed was actually accepted.
    // saveNow() reports `failed` for a swallowed network error and for a 429
    // whose retry is merely scheduled — in both cases the device still has no
    // config, so claiming success would leave the user staring at a setup screen
    // while the UI says the device is live.
    //
    // `exited` means saveNow already dropped us to local mode (401/404); exiting
    // again would re-run loadFromLocalStorage() and the render hook for a
    // visible flash.
    const outcome = await saveNow();
    if (outcome !== 'saved') {
      if (outcome === 'failed') exitToLocalMode();
      return false;
    }
    return true;
  }

  try {
    enterCloudMode(deviceId, fromBentoConfig(config as BentoConfig));
  } catch {
    // Stored config didn't map into the editor model — enter cloud mode anyway
    // with the current boxes so the next save overwrites the bad record. The
    // pre-#116 code caught this; dropping the guard turned a recoverable bad
    // record into an unhandled rejection that left the UI mid-transition.
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
  // A queued save must not outlive the session that authorised it.
  cancelPendingSave();
  exitToLocalMode();
}

/**
 * Outcome of a config push.
 *
 * `exited` exists so callers can tell "the save failed" from "the save failed
 * AND I already dropped you to local mode". Collapsing the two into `false` made
 * selectDevice call exitToLocalMode() a second time, re-running
 * loadFromLocalStorage() and the render hook for a visible flash.
 */
type SaveOutcome = 'saved' | 'exited' | 'failed';

/**
 * Push the current editor config to the active device.
 * Returns `saved` only when the server accepted the write — callers that need
 * to report success to a user (selectDevice's initial push) must not treat a
 * scheduled retry or a swallowed network error as a completed save.
 */
async function saveNow(): Promise<SaveOutcome> {
  const deviceId = getActiveDeviceId();
  if (!deviceId) return 'failed';
  try {
    const res = await fetch(`/api/device/${encodeURIComponent(deviceId)}/config`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toBentoConfig()),
    });
    if (res.ok) return 'saved';
    // The device can no longer accept this account's writes — session expired
    // (401), or the device is gone / no longer ours (opaque 404 from the
    // ownership check). Fall back to local mode so the user keeps editing
    // locally instead of silently losing writes.
    if (res.status === 401 || res.status === 404) {
      exitToLocalMode();
      return 'exited';
    }
    // Rate limited (429) — retry the latest config after the server cooldown
    // rather than dropping this write. The retry re-reads current editor state.
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000;
      cancelPendingSave();
      _saveTimer = setTimeout(() => void saveNow(), delayMs);
    }
    // Other 5xx: transient; the next edit reschedules a save.
    return 'failed';
  } catch {
    // Network hiccup — the next edit reschedules a save.
    return 'failed';
  }
}

/**
 * Cancel a queued debounced save. Required whenever the active device changes:
 * the timer captures no device id, so a stale timer writes the editor's current
 * contents to whatever device is active when it fires.
 */
function cancelPendingSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = undefined;
}

/** Debounced cloud save, registered as the state module's cloud-persist hook. */
function scheduleSave(): void {
  cancelPendingSave();
  _saveTimer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
}

/** Wire cloud saving into the state module. Call once at editor init. */
export function initCloudSync(): void {
  onCloudPersist(scheduleSave);
}
