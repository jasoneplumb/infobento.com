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
    }
  | { readonly status: 304; readonly lastModifiedMs: number }
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
 * Width of the data-freshness bucket, in ms. Normally the device cadence
 * (refreshesPerDay → 12h or 24h). `INFOBENTO_DATA_BUCKET_SECONDS` overrides it
 * for bench testing (e.g. 60 → a fresh frame every minute instead of every 12h).
 */
function dataBucketMs(refreshesPerDay: number): number {
  const override = process.env['INFOBENTO_DATA_BUCKET_SECONDS'];
  if (override !== undefined) {
    const secs = Number(override);
    // Require ≥1s so a fractional/typo value can't floor to a 0ms bucket, which
    // would make the boundary `Math.floor(now / 0) * 0` → NaN.
    if (Number.isFinite(secs) && secs >= 1) return Math.floor(secs * 1000);
  }
  return Math.floor(DAY_MS / (refreshesPerDay === 1 ? 1 : 2));
}

/**
 * The timestamp the frame's 304-gating compares against: the later of the
 * config's last edit and the current data-bucket boundary. Within a window the
 * device gets 304 (battery saved); at the boundary this advances → 200 → exactly
 * one redraw with freshly hydrated data (RFC 0001 §4). Computed from the
 * denormalized `refreshes_per_day`, so the cheap pre-parse 304 path survives.
 */
export function effectiveLastModified(
  device: Pick<Device, 'last_modified' | 'refreshes_per_day'>,
  nowMs: number,
): number {
  const bucket = dataBucketMs(device.refreshes_per_day);
  const boundary = Math.floor(nowMs / bucket) * bucket;
  return Math.max(device.last_modified, boundary);
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

export async function getDeviceFrameForPull(
  db: DB,
  deviceId: string,
  orientation: Orientation,
  ifModifiedSince: string | null,
  deps: HydrateDeps,
  nowMs: number = Date.now(),
): Promise<DeviceFrameResult> {
  const device = getDevice(db, deviceId);
  if (!device || !device.config_json) return { status: 404 };
  // Gate on the effective timestamp (config edit OR data-bucket boundary). This
  // runs before JSON.parse / hydrate, so a 304 wake stays allocation-free.
  const effectiveMs = effectiveLastModified(device, nowMs);
  if (isNotModified(ifModifiedSince, effectiveMs)) {
    return { status: 304, lastModifiedMs: effectiveMs };
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
  let dual;
  try {
    dual = renderBoth(hydrated);
  } catch (e) {
    return {
      status: 500,
      error: e instanceof Error ? e.message : 'render failed',
    };
  }
  const fb = orientation === 'portrait' ? dual.portrait : dual.landscape;
  return {
    status: 200,
    data: fb.data,
    width: fb.width,
    height: fb.height,
    lastModifiedMs: effectiveMs,
  };
}

/**
 * Parse the `orientation` query param. Defaults to 'landscape' when missing
 * or unrecognized — keeps firmware's URL trivial for the common case.
 */
export function parseOrientation(raw: string | null | undefined): Orientation {
  return raw === 'portrait' ? 'portrait' : 'landscape';
}
