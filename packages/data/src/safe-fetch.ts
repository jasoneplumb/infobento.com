/**
 * SSRF fetch guard for user-supplied URLs (RFC 0003, Decision 5).
 *
 * Node-only: uses `node:dns/promises` to resolve hostnames and validate that
 * they do not point to private/internal addresses. This makes the module
 * incompatible with edge runtimes (Workers, Deno Deploy) that lack the Node
 * DNS API. Other @infobento/data modules remain edge-safe; this boundary is
 * intentional — see issue #224 for rationale.
 */

import { resolve4, resolve6 } from 'node:dns/promises';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface SafeFetchOptions {
  readonly maxRedirects?: number;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

export interface SafeFetchResult {
  readonly status: number;
  readonly headers: Headers;
  readonly body: string;
  readonly url: string;
}

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets as unknown as [number, number, number, number];
}

function isPrivateIpv4(ip: string): boolean {
  const o = parseIpv4Octets(ip);
  if (!o) return false;

  if (o[0] === 0) return true;
  if (o[0] === 10) return true;
  if (o[0] === 127) return true;
  if (o[0] === 169 && o[1] === 254) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const n = ip.toLowerCase();

  if (n === '::' || n === '::1') return true;
  if (n.startsWith('fc') || n.startsWith('fd')) return true;
  if (/^fe[89ab]/i.test(n)) return true;

  const dotted = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1]) return isPrivateIpv4(dotted[1]);

  const hex = n.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex?.[1] !== undefined && hex?.[2] !== undefined) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateIpv4(
      `${String((hi >> 8) & 0xff)}.${String(hi & 0xff)}.${String((lo >> 8) & 0xff)}.${String(lo & 0xff)}`,
    );
  }

  return false;
}

function isPrivateAddress(ip: string): boolean {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

// ---------------------------------------------------------------------------
// DNS resolution + validation
// ---------------------------------------------------------------------------

async function resolveAndValidate(hostname: string): Promise<void> {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateAddress(hostname)) {
      throw new SsrfError(`Address ${hostname} is private/reserved`);
    }
    return;
  }

  const addresses: string[] = [];
  const settled = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  for (const r of settled) {
    if (r.status === 'fulfilled') addresses.push(...r.value);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`DNS resolution failed for host: ${hostname}`);
  }

  for (const ip of addresses) {
    if (isPrivateAddress(ip)) {
      throw new SsrfError(`Host ${hostname} resolves to private address: ${ip}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Body streaming with size cap
// ---------------------------------------------------------------------------

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new SsrfError(`Response body exceeds ${String(maxBytes)} byte limit`);
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) chunks.push(tail);
    return chunks.join('');
  } catch (err: unknown) {
    if (err instanceof SsrfError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SsrfError('Request timed out');
    }
    throw err;
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function safeFetch(url: string, opts?: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = url;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        throw new SsrfError(`Invalid URL: ${currentUrl}`);
      }

      if (parsed.protocol !== 'https:') {
        throw new SsrfError(
          `Scheme "${parsed.protocol.replace(/:$/, '')}" is not allowed; only https is permitted`,
        );
      }

      if (parsed.username || parsed.password) {
        throw new SsrfError('URLs with embedded credentials are not allowed');
      }

      await resolveAndValidate(parsed.hostname);

      let response: Response;
      try {
        response = await fetch(currentUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'InfoBento/1.0' },
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new SsrfError(`Request timed out after ${String(timeoutMs)}ms`);
        }
        throw new SsrfError(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SsrfError(`Redirect ${String(response.status)} has no Location header`);
        }
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      const body = await readBodyWithLimit(response, maxBytes);
      return { status: response.status, headers: response.headers, body, url: currentUrl };
    }

    throw new SsrfError(`Too many redirects (maximum ${String(maxRedirects)})`);
  } finally {
    clearTimeout(timer);
  }
}
