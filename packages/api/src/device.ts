/**
 * Intent: Pure-function helpers for the firmware's device-pull endpoints.
 * Context: Issue #75 — `GET /api/device/:id/{config,frame}`. Server-side
 *   rendering: device sends config to cloud, gets frame back. Device id is the
 *   bearer secret (no auth header — long opaque token treated like an API key).
 * Pattern: Endpoint logic separated from Hono so the cases (200/304/404/500)
 *   can be unit-tested without standing up a server.
 */

import type { BentoConfig } from '@infobento/core';
import { renderBoth } from '@infobento/renderer';
import { getDevice, type DB, type Device } from './db.js';
import { hydrateConfig, type HydrateDeps } from './hydrate.js';

export type Orientation = 'landscape' | 'portrait';

export type DeviceConfigResult =
  | { readonly status: 200; readonly configJson: string; readonly lastModifiedMs: number }
  | { readonly status: 304; readonly lastModifiedMs: number }
  | { readonly status: 404 };

export type DeviceFrameResult =
  | {
      readonly status: 200;
      readonly data: Uint8Array;
      readonly width: number;
      readonly height: number;
      readonly lastModifiedMs: number;
      /** Seconds until the next pull (`X-Refresh-Interval`); null = disabled. */
      readonly refreshIntervalSec: number | null;
    }
  | {
      readonly status: 304;
      readonly lastModifiedMs: number;
      readonly refreshIntervalSec: number | null;
    }
  | { readonly status: 404 }
  | { readonly status: 500; readonly error: string };

/** One rendered orientation's payload — the raw 2bpp buffer and its dimensions. */
export interface FramePayload {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Result of the combined `GET /api/device/:id/frames` pull: BOTH orientations in
 * one response so the device can flip locally (issue #160, RFC 0002). Shares the
 * 304/404/500 shapes with `DeviceFrameResult` so the two endpoints' freshness
 * semantics stay identical.
 */
export type DeviceFramesResult =
  | {
      readonly status: 200;
      readonly landscape: FramePayload;
      readonly portrait: FramePayload;
      readonly lastModifiedMs: number;
      /** Seconds until the next pull (`X-Refresh-Interval`); null = disabled. */
      readonly refreshIntervalSec: number | null;
    }
  | {
      readonly status: 304;
      readonly lastModifiedMs: number;
      readonly refreshIntervalSec: number | null;
    }
  | { readonly status: 404 }
  | { readonly status: 500; readonly error: string };

/**
 * Compare an `If-Modified-Since` header value to a stored ms timestamp.
 * HTTP dates are second-precision, so we floor both sides to seconds before
 * comparing — otherwise a same-second header value would be misread as stale.
 */
export function isNotModified(headerValue: string | null, lastModifiedMs: number): boolean {
  if (!headerValue) return false;
  const headerMs = Date.parse(headerValue);
  if (Number.isNaN(headerMs)) return false;
  return Math.floor(lastModifiedMs / 1000) <= Math.floor(headerMs / 1000);
}

/** Format an ms timestamp as an HTTP-date (RFC 7231 IMF-fixdate). */
export function formatHttpDate(ms: number): string {
  return new Date(ms).toUTCString();
}

const DAY_MS = 86_400_000;

/**
 * Width of the data-freshness bucket, in ms — the device cadence
 * `86400 / refreshesPerDay` (RFC 0001 §4). Returns `null` when scheduled refresh
 * is disabled (`refreshesPerDay` 0/invalid), so the frame changes only on a
 * config edit. `INFOBENTO_DATA_BUCKET_SECONDS` overrides it for bench testing
 * (e.g. 15 → a fresh frame every 15s) and wins even when refresh is disabled.
 */
function dataBucketMs(refreshesPerDay: number): number | null {
  const override = process.env['INFOBENTO_DATA_BUCKET_SECONDS'];
  if (override !== undefined) {
    const secs = Number(override);
    // Require ≥1s so a fractional/typo value can't floor to a 0ms bucket, which
    // would make the boundary `Math.floor(now / 0) * 0` → NaN.
    if (Number.isFinite(secs) && secs >= 1) return Math.floor(secs * 1000);
  }
  // 0 (or anything < 1) disables the scheduled bucket.
  if (!Number.isFinite(refreshesPerDay) || refreshesPerDay < 1) return null;
  return Math.floor(DAY_MS / refreshesPerDay);
}

/**
 * The timestamp the frame's 304-gating compares against: the later of the
 * config's last edit and the current data-bucket boundary. Within a window the
 * device gets 304 (battery saved); at the boundary this advances → 200 → exactly
 * one redraw with freshly hydrated data (RFC 0001 §4). Computed from the
 * denormalized `refreshes_per_day`, so the cheap pre-parse 304 path survives.
 * When refresh is disabled, only a config edit (`last_modified`) advances it.
 */
export function effectiveLastModified(
  device: Pick<Device, 'last_modified' | 'refreshes_per_day'>,
  nowMs: number,
): number {
  const bucket = dataBucketMs(device.refreshes_per_day);
  if (bucket === null) return device.last_modified;
  const boundary = Math.floor(nowMs / bucket) * bucket;
  return Math.max(device.last_modified, boundary);
}

/**
 * The cadence (in whole seconds) the device should sleep before its next pull,
 * sent as the `X-Refresh-Interval` header so the editor's refresh setting drives
 * a real device end-to-end. Mirrors `dataBucketMs` precedence (env override →
 * config), and is `null` when scheduled refresh is disabled — the firmware then
 * keeps its build-time default.
 */
export function refreshIntervalSeconds(refreshesPerDay: number): number | null {
  const bucket = dataBucketMs(refreshesPerDay);
  return bucket === null ? null : Math.floor(bucket / 1000);
}

export function getDeviceConfigForPull(
  db: DB,
  deviceId: string,
  ifModifiedSince: string | null,
): DeviceConfigResult {
  const device = getDevice(db, deviceId);
  if (!device || !device.config_json) return { status: 404 };
  if (isNotModified(ifModifiedSince, device.last_modified)) {
    return { status: 304, lastModifiedMs: device.last_modified };
  }
  return {
    status: 200,
    configJson: device.config_json,
    lastModifiedMs: device.last_modified,
  };
}

/**
 * Shared pull pipeline for the frame endpoints: device lookup → 304 gate →
 * parse → hydrate → `renderBoth`. Both `getDeviceFrameForPull` (one orientation)
 * and `getDeviceFramesForPull` (both) thin-wrap this, so their 304/404/500 paths
 * and freshness semantics are identical by construction — not by copy-paste.
 * On 200 it hands back the full dual render; the caller projects what it needs.
 */
type FramePullResult =
  | {
      readonly status: 200;
      readonly dual: ReturnType<typeof renderBoth>;
      readonly lastModifiedMs: number;
      readonly refreshIntervalSec: number | null;
    }
  | {
      readonly status: 304;
      readonly lastModifiedMs: number;
      readonly refreshIntervalSec: number | null;
    }
  | { readonly status: 404 }
  | { readonly status: 500; readonly error: string };

async function pullDeviceFrames(
  db: DB,
  deviceId: string,
  ifModifiedSince: string | null,
  deps: HydrateDeps,
  nowMs: number,
): Promise<FramePullResult> {
  const device = getDevice(db, deviceId);
  if (!device || !device.config_json) return { status: 404 };
  // Wake-cadence hint, sent on both 304 and 200 so the device's sleep tracks the
  // configured interval even on a battery-saving 304 skip.
  const refreshIntervalSec = refreshIntervalSeconds(device.refreshes_per_day);
  // Gate on the effective timestamp (config edit OR data-bucket boundary). This
  // runs before JSON.parse / hydrate, so a 304 wake stays allocation-free.
  const effectiveMs = effectiveLastModified(device, nowMs);
  if (isNotModified(ifModifiedSince, effectiveMs)) {
    return { status: 304, lastModifiedMs: effectiveMs, refreshIntervalSec };
  }
  let config: BentoConfig;
  try {
    config = JSON.parse(device.config_json) as BentoConfig;
  } catch {
    return { status: 500, error: 'stored config is not valid JSON' };
  }
  // hydrateConfig resolves per-box and swallows provider failures (→ placeholder),
  // so it shouldn't throw; guard anyway so an unexpected error doesn't 500 the
  // whole panel.
  let hydrated: BentoConfig;
  try {
    hydrated = await hydrateConfig(config, deps);
  } catch (e) {
    return { status: 500, error: e instanceof Error ? e.message : 'hydration failed' };
  }
  try {
    const dual = renderBoth(hydrated);
    return { status: 200, dual, lastModifiedMs: effectiveMs, refreshIntervalSec };
  } catch (e) {
    return { status: 500, error: e instanceof Error ? e.message : 'render failed' };
  }
}

export async function getDeviceFrameForPull(
  db: DB,
  deviceId: string,
  orientation: Orientation,
  ifModifiedSince: string | null,
  deps: HydrateDeps,
  nowMs: number = Date.now(),
): Promise<DeviceFrameResult> {
  const r = await pullDeviceFrames(db, deviceId, ifModifiedSince, deps, nowMs);
  if (r.status !== 200) return r;
  const fb = orientation === 'portrait' ? r.dual.portrait : r.dual.landscape;
  return {
    status: 200,
    data: fb.data,
    width: fb.width,
    height: fb.height,
    lastModifiedMs: r.lastModifiedMs,
    refreshIntervalSec: r.refreshIntervalSec,
  };
}

/**
 * Combined pull: render once, return BOTH orientations (issue #160, RFC 0002).
 * Identical 304/404/500 gating to `getDeviceFrameForPull` — the device caches
 * both frames so a manual orientation flip needs no network round trip.
 */
export async function getDeviceFramesForPull(
  db: DB,
  deviceId: string,
  ifModifiedSince: string | null,
  deps: HydrateDeps,
  nowMs: number = Date.now(),
): Promise<DeviceFramesResult> {
  const r = await pullDeviceFrames(db, deviceId, ifModifiedSince, deps, nowMs);
  if (r.status !== 200) return r;
  const toPayload = (fb: ReturnType<typeof renderBoth>['landscape']): FramePayload => ({
    data: fb.data,
    width: fb.width,
    height: fb.height,
  });
  return {
    status: 200,
    landscape: toPayload(r.dual.landscape),
    portrait: toPayload(r.dual.portrait),
    lastModifiedMs: r.lastModifiedMs,
    refreshIntervalSec: r.refreshIntervalSec,
  };
}

/**
 * Parse the `orientation` query param. Defaults to 'landscape' when missing
 * or unrecognized — keeps firmware's URL trivial for the common case.
 */
export function parseOrientation(raw: string | null | undefined): Orientation {
  return raw === 'portrait' ? 'portrait' : 'landscape';
}
