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
import {
  enterCloudMode,
  exitToLocalMode,
  forgetRememberedDevice,
  getActiveDeviceId,
  getRememberedDevice,
  onCloudPersist,
} from './state';

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
// Bumped by every activation and by sign-out. An activation or save that finds
// the number changed after an await has been superseded — by a newer selection,
// or by signing out — and must not touch the editor (#284 review).
let _activationGeneration = 0;
// Activations whose fetches have not settled yet. The reload restore yields to
// any of them: a selection the user already started outranks a remembered one.
let _activationsInFlight = 0;

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
 * Outcome of activating a device.
 *
 * `refused` means the server said the device is not this account's (403/404:
 * unpaired, claimed by someone else, or gone) — the only result that justifies
 * forgetting a remembered selection. Everything else that fails is `failed`:
 * a 401 is a session problem, not an ownership answer, a network error or
 * undecodable body says nothing about the device at all, and a superseded
 * activation was simply overtaken by a newer selection or a sign-out.
 */
type ActivateOutcome = 'active' | 'refused' | 'failed';

/**
 * Make `deviceId` the active device: fetch its stored config and switch the
 * editor into cloud mode. `label` is the human-readable name (the pair code)
 * shown in the save-target indicator; the id itself is never displayed.
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
export async function selectDevice(deviceId: string, label?: string): Promise<boolean> {
  return (await activateDevice(deviceId, label)) === 'active';
}

/**
 * Re-select the device chosen before the last reload (#284), if any. Call
 * once at editor init, with an authenticated session.
 *
 * Goes through the same activation as a manual selection, so the device's
 * stored config replaces the editor's local buffer — the local buffer is only
 * ever pushed to a device the server reports as never configured. A device the
 * server refuses is forgotten; a transient failure keeps it for the next load.
 */
export async function restoreActiveDevice(): Promise<boolean> {
  const remembered = getRememberedDevice();
  // Nothing remembered, or the user already picked (or is picking) a device.
  if (!remembered || getActiveDeviceId() !== null || _activationsInFlight > 0) return false;
  const outcome = await activateDevice(remembered.id, remembered.label);
  if (outcome === 'refused') forgetRememberedDevice();
  return outcome === 'active';
}

async function activateDevice(deviceId: string, label?: string): Promise<ActivateOutcome> {
  _activationsInFlight++;
  try {
    return await runActivation(deviceId, label);
  } finally {
    _activationsInFlight--;
  }
}

async function runActivation(deviceId: string, label?: string): Promise<ActivateOutcome> {
  // Drop any debounced save still queued for the PREVIOUS device. Without this,
  // editing device A and immediately selecting device B lets A's timer fire
  // after the switch and PUT the editor's contents to B, clobbering the config
  // we just loaded.
  cancelPendingSave();
  const generation = ++_activationGeneration;
  const superseded = (): boolean => generation !== _activationGeneration;

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
    return 'failed';
  }
  if (superseded()) return 'failed';

  // 404 now means what it says: not ours, or gone. It is no longer overloaded
  // with "no config yet" — that case is a 200 with config: null.
  if (!res.ok) return res.status === 403 || res.status === 404 ? 'refused' : 'failed';

  let config: unknown;
  try {
    ({ config } = (await res.json()) as { config: unknown });
  } catch {
    // A body we cannot decode is a TRANSPORT failure, not evidence that the
    // device is unconfigured. Treating it as "no config" would route into the
    // seeding path below and PUT the editor's local boxes over whatever the
    // device really had — silent data loss on a transient blip. Bail instead.
    return 'failed';
  }
  if (superseded()) return 'failed';

  // `== null` deliberately, to catch undefined as well: a body of `{}` yields
  // undefined, which a `=== null` test would let fall through into the mapping
  // path and throw.
  if (config == null) {
    // Never-configured device (#191). Adopt the editor's current boxes and push
    // them immediately rather than waiting for an edit that may never come.
    // Without this the device stays configless, /frames keeps returning 404,
    // and the physical unit sits on the "Set up InfoBento" screen forever even
    // though pairing and Wi-Fi provisioning both succeeded.
    //
    // The seed is written BEFORE entering cloud mode, and the selection only
    // takes effect once the server accepts it. A swallowed network error, a 429
    // or a 401 all leave the device configless, so claiming success would strand
    // the user on a setup screen while the UI says the device is live. Writing
    // first also means a failure leaves the editor exactly as it was: no
    // "Saving to …" flash, no repaint, and nothing remembered for a device that
    // never accepted a config.
    const { outcome } = await putConfig(deviceId);
    if (superseded()) return 'failed';
    if (outcome !== 'saved') return outcome === 'refused' ? 'refused' : 'failed';
    enterCloudMode(deviceId, { label });
    return 'active';
  }

  try {
    enterCloudMode(deviceId, { label, seed: fromBentoConfig(config as BentoConfig) });
  } catch {
    // Stored config didn't map into the editor model — enter cloud mode anyway
    // with the current boxes so the next save overwrites the bad record. The
    // pre-#116 code caught this; dropping the guard turned a recoverable bad
    // record into an unhandled rejection that left the UI mid-transition.
    enterCloudMode(deviceId, { label });
  }
  return 'active';
}

/** Sign out: clear the server session, then restore the local editor buffer. */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
  } catch {
    // Even if the network call fails, drop the client back to local mode.
  }
  // A queued save must not outlive the session that authorised it, and nor
  // may a device selection still in flight (e.g. the reload restore).
  cancelPendingSave();
  _activationGeneration++;
  exitToLocalMode();
}

/**
 * Result of one config PUT. `unauthorized` (401: the session expired) and
 * `refused` (404: the device is gone or no longer ours) are kept apart because
 * only the second is a reason to forget the remembered device.
 * `retryAfterMs` is set for a 429 so the caller can decide whether to retry.
 */
interface PutResult {
  outcome: 'saved' | 'unauthorized' | 'refused' | 'failed';
  retryAfterMs?: number;
}

/** PUT the editor's current config to `deviceId`. No mode side effects. */
async function putConfig(deviceId: string): Promise<PutResult> {
  try {
    const res = await fetch(`/api/device/${encodeURIComponent(deviceId)}/config`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toBentoConfig()),
    });
    if (res.ok) return { outcome: 'saved' };
    if (res.status === 401) return { outcome: 'unauthorized' };
    if (res.status === 404) return { outcome: 'refused' };
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After'));
      return {
        outcome: 'failed',
        retryAfterMs: Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000,
      };
    }
    // Other 5xx: transient.
    return { outcome: 'failed' };
  } catch {
    // Network hiccup.
    return { outcome: 'failed' };
  }
}

/** Push the current editor config to the active device (the debounced save). */
async function saveNow(): Promise<void> {
  const deviceId = getActiveDeviceId();
  if (!deviceId) return;
  const generation = _activationGeneration;
  const { outcome, retryAfterMs } = await putConfig(deviceId);
  // The user switched devices, or signed out (and perhaps re-selected this
  // same device), while the PUT was in flight: this result describes a save
  // target that no longer exists, so it must not drop the current one.
  if (generation !== _activationGeneration) return;
  // The device can no longer accept this account's writes. Fall back to local
  // mode so the user keeps editing locally instead of silently losing writes.
  // An expired session keeps the remembered device, so it comes back after the
  // user signs in again; a device that is gone or no longer ours is forgotten.
  if (outcome === 'unauthorized') exitToLocalMode({ forgetDevice: false });
  else if (outcome === 'refused') exitToLocalMode();
  // Rate limited (429) — retry the latest config after the server cooldown
  // rather than dropping this write. The retry re-reads current editor state.
  // Any other failure: the next edit reschedules a save.
  else if (retryAfterMs !== undefined) {
    cancelPendingSave();
    _saveTimer = setTimeout(() => void saveNow(), retryAfterMs);
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
