/**
 * OAuth start handler — operator-misconfiguration visibility (#118).
 *
 * Importing ./server.js must NOT bind a port (the listener is entry-point
 * guarded), so we can drive the live route table with app.request().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from './server.js';

const OAUTH_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
] as const;

describe('GET /api/auth/oauth/:provider/start', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot and clear OAuth env so the unconfigured branch is deterministic.
    for (const k of OAUTH_ENV) {
      saved[k] = process.env[k];
      // Reflect.deleteProperty truly unsets (env values stringify, so `= undefined`
      // would leave the string "undefined") without tripping no-dynamic-delete.
      Reflect.deleteProperty(process.env, k);
    }
    process.env['SESSION_SECRET'] = 'test-secret-at-least-16-chars';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const k of OAUTH_ENV) {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    }
    Reflect.deleteProperty(process.env, 'SESSION_SECRET');
    warnSpy.mockRestore();
  });

  it('redirects to /?auth_error=oauth_unconfigured when GOOGLE_CLIENT_ID is unset', async () => {
    const res = await app.request('/api/auth/oauth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=oauth_unconfigured');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_CLIENT_ID'));
  });

  it('redirects to /?auth_error=oauth_unconfigured when APPLE_CLIENT_ID is unset', async () => {
    const res = await app.request('/api/auth/oauth/apple/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/?auth_error=oauth_unconfigured');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('APPLE_CLIENT_ID'));
  });

  it('keeps an unknown provider a silent redirect to / (no endpoint-existence leak)', async () => {
    const res = await app.request('/api/auth/oauth/bogus/start');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('proceeds to the provider when the client id IS configured (no false trigger)', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'test-client-id.apps.googleusercontent.com';
    const res = await app.request('/api/auth/oauth/google/start');
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location.startsWith('https://accounts.google.com/')).toBe(true);
    expect(location).not.toContain('auth_error');
  });
});
