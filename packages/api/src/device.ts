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
import { getDevice, type DB } from './db.js';

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

export function getDeviceFrameForPull(
  db: DB,
  deviceId: string,
  orientation: Orientation,
  ifModifiedSince: string | null,
): DeviceFrameResult {
  const device = getDevice(db, deviceId);
  if (!device || !device.config_json) return { status: 404 };
  if (isNotModified(ifModifiedSince, device.last_modified)) {
    return { status: 304, lastModifiedMs: device.last_modified };
  }
  let config: BentoConfig;
  try {
    config = JSON.parse(device.config_json) as BentoConfig;
  } catch {
    return { status: 500, error: 'stored config is not valid JSON' };
  }
  let dual;
  try {
    dual = renderBoth(config);
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
    lastModifiedMs: device.last_modified,
  };
}

/**
 * Parse the `orientation` query param. Defaults to 'landscape' when missing
 * or unrecognized — keeps firmware's URL trivial for the common case.
 */
export function parseOrientation(raw: string | null | undefined): Orientation {
  return raw === 'portrait' ? 'portrait' : 'landscape';
}
