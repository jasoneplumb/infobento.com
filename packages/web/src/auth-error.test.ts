import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-error';

describe('authErrorMessage', () => {
  it('maps oauth_unconfigured to a user-facing message', () => {
    const msg = authErrorMessage('?auth_error=oauth_unconfigured');
    expect(msg).not.toBeNull();
    expect(msg).toMatch(/sign-in/i);
    expect(msg).toMatch(/administrator/i);
  });

  it('finds the param among other query params', () => {
    expect(authErrorMessage('?next=%2F&auth_error=oauth_unconfigured')).not.toBeNull();
  });

  it('tolerates a missing leading "?"', () => {
    expect(authErrorMessage('auth_error=oauth_unconfigured')).not.toBeNull();
  });

  it('returns null when there is no auth_error', () => {
    expect(authErrorMessage('')).toBeNull();
    expect(authErrorMessage('?foo=bar')).toBeNull();
  });

  it('returns null for an unrecognized auth_error code', () => {
    expect(authErrorMessage('?auth_error=something_else')).toBeNull();
  });
});
