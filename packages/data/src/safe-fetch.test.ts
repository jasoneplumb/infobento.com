import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:dns/promises before importing the module under test
// ---------------------------------------------------------------------------

const dns = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));
vi.mock('node:dns/promises', () => dns);

import { safeFetch, SsrfError } from './safe-fetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function publicDns(): void {
  dns.resolve4.mockResolvedValue(['93.184.216.34']);
}

function streamOf(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(content));
      c.close();
    },
  });
}

function stubFetchOk(body: string) {
  const fn = vi.fn(
    async () =>
      ({ status: 200, headers: new Headers(), body: streamOf(body) }) as unknown as Response,
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function stubFetchRedirect(location: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          status: 302,
          headers: new Headers({ location }),
        }) as unknown as Response,
    ),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  dns.resolve4.mockReset();
  dns.resolve6.mockReset();
  dns.resolve6.mockRejectedValue(new Error('ENODATA'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Scheme allowlist
// ---------------------------------------------------------------------------

describe('scheme allowlist', () => {
  it.each(['http', 'file', 'gopher', 'data', 'ftp'])('rejects %s: scheme', async (scheme) => {
    await expect(safeFetch(`${scheme}://example.com`)).rejects.toThrow(SsrfError);
    await expect(safeFetch(`${scheme}://example.com`)).rejects.toThrow('not allowed');
  });
});

// ---------------------------------------------------------------------------
// Direct private-IP rejection
// ---------------------------------------------------------------------------

describe('direct private-IP rejection', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.0.0.1', 'RFC1918 class A'],
    ['172.16.0.1', 'RFC1918 class B'],
    ['192.168.1.1', 'RFC1918 class C'],
    ['169.254.169.254', 'cloud metadata'],
    ['0.0.0.0', 'unspecified'],
  ])('rejects %s (%s)', async (ip) => {
    await expect(safeFetch(`https://${ip}/`)).rejects.toThrow(SsrfError);
    await expect(safeFetch(`https://${ip}/`)).rejects.toThrow('private');
  });

  it('rejects [::1] (IPv6 loopback)', async () => {
    await expect(safeFetch('https://[::1]/')).rejects.toThrow(SsrfError);
  });
});

// ---------------------------------------------------------------------------
// DNS-rebinding — hostname resolving to a private address
// ---------------------------------------------------------------------------

describe('DNS-rebinding prevention', () => {
  it('rejects a hostname that resolves to a private IPv4 address', async () => {
    dns.resolve4.mockResolvedValueOnce(['10.0.0.1']);
    await expect(safeFetch('https://evil.example.com')).rejects.toThrow('private');
  });

  it('rejects a hostname that resolves to link-local (169.254.x.x)', async () => {
    dns.resolve4.mockResolvedValueOnce(['169.254.169.254']);
    await expect(safeFetch('https://evil.example.com')).rejects.toThrow('private');
  });
});

// ---------------------------------------------------------------------------
// IPv4-mapped IPv6
// ---------------------------------------------------------------------------

describe('IPv4-mapped IPv6', () => {
  it('rejects ::ffff:127.0.0.1 from DNS', async () => {
    dns.resolve4.mockRejectedValueOnce(new Error('ENODATA'));
    dns.resolve6.mockReset();
    dns.resolve6.mockResolvedValueOnce(['::ffff:127.0.0.1']);
    await expect(safeFetch('https://evil.example.com')).rejects.toThrow('private');
  });

  it('rejects hex-form IPv4-mapped IPv6 (::ffff:7f00:1) in URL', async () => {
    await expect(safeFetch('https://[::ffff:7f00:1]/')).rejects.toThrow(SsrfError);
  });
});

// ---------------------------------------------------------------------------
// Redirect to private addresses (re-check after every redirect)
// ---------------------------------------------------------------------------

describe('redirect to private addresses', () => {
  it('rejects redirect to localhost', async () => {
    dns.resolve4.mockResolvedValueOnce(['93.184.216.34']).mockResolvedValueOnce(['127.0.0.1']);
    stubFetchRedirect('https://localhost/secret');
    await expect(safeFetch('https://example.com')).rejects.toThrow('private');
  });

  it('rejects redirect to 127.0.0.1', async () => {
    dns.resolve4.mockResolvedValueOnce(['93.184.216.34']);
    stubFetchRedirect('https://127.0.0.1/latest/meta-data');
    await expect(safeFetch('https://example.com')).rejects.toThrow('private');
  });

  it('rejects redirect to [::1]', async () => {
    dns.resolve4.mockResolvedValueOnce(['93.184.216.34']);
    stubFetchRedirect('https://[::1]/');
    await expect(safeFetch('https://example.com')).rejects.toThrow(SsrfError);
  });

  it('rejects redirect to 169.254.169.254 (cloud metadata)', async () => {
    dns.resolve4.mockResolvedValueOnce(['93.184.216.34']);
    stubFetchRedirect('https://169.254.169.254/latest/meta-data');
    await expect(safeFetch('https://example.com')).rejects.toThrow('private');
  });

  it('rejects redirect from https to http', async () => {
    dns.resolve4.mockResolvedValueOnce(['93.184.216.34']);
    stubFetchRedirect('http://example.com/downgraded');
    await expect(safeFetch('https://example.com')).rejects.toThrow('not allowed');
  });
});

// ---------------------------------------------------------------------------
// Redirect cap
// ---------------------------------------------------------------------------

describe('redirect cap', () => {
  it('rejects after exceeding the maximum number of redirects', async () => {
    dns.resolve4.mockResolvedValue(['93.184.216.34']);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            status: 302,
            headers: new Headers({ location: 'https://example.com/loop' }),
          }) as unknown as Response,
      ),
    );
    await expect(safeFetch('https://example.com', { maxRedirects: 2 })).rejects.toThrow(
      'Too many redirects',
    );
  });
});

// ---------------------------------------------------------------------------
// Response size cap (do not trust Content-Length)
// ---------------------------------------------------------------------------

describe('response size cap', () => {
  it('rejects oversized body even when Content-Length lies', async () => {
    publicDns();
    const big = 'x'.repeat(2000);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            status: 200,
            headers: new Headers({ 'content-length': '10', 'content-type': 'text/plain' }),
            body: streamOf(big),
          }) as unknown as Response,
      ),
    );

    await expect(safeFetch('https://example.com', { maxBytes: 1024 })).rejects.toThrow('exceeds');
  });

  it('accepts a body within the limit', async () => {
    publicDns();
    stubFetchOk('small body');
    const result = await safeFetch('https://example.com', { maxBytes: 1024 });
    expect(result.body).toBe('small body');
  });
});

// ---------------------------------------------------------------------------
// Timeout (slow-loris prevention)
// ---------------------------------------------------------------------------

describe('timeout', () => {
  it('aborts when the fetch takes longer than the timeout', async () => {
    publicDns();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (
          _url: string,
          init?: { signal?: AbortSignal; redirect?: string; headers?: Record<string, string> },
        ) =>
          new Promise<Response>((_, reject) => {
            if (init?.signal?.aborted) {
              reject(new DOMException('The operation was aborted', 'AbortError'));
              return;
            }
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      ),
    );
    await expect(safeFetch('https://example.com', { timeoutMs: 50 })).rejects.toThrow('timed out');
  }, 5000);
});

// ---------------------------------------------------------------------------
// No credential forwarding
// ---------------------------------------------------------------------------

describe('no credential forwarding', () => {
  it('does not include Authorization, Cookie, or caller-derived headers', async () => {
    publicDns();
    const spy = stubFetchOk('OK');

    await safeFetch('https://example.com');

    const callArgs = spy.mock.calls[0] as unknown as unknown[];
    const init = callArgs?.[1] as { headers?: Record<string, string> } | undefined;
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).toContain('user-agent');
    expect(keys).not.toContain('authorization');
    expect(keys).not.toContain('cookie');
    expect(keys).not.toContain('x-forwarded-for');
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(safeFetch('https://user:pass@example.com/')).rejects.toThrow(
      'embedded credentials',
    );
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('happy path', () => {
  it('fetches a valid HTTPS URL and returns body, status, headers', async () => {
    publicDns();
    stubFetchOk('Hello, World!');

    const result = await safeFetch('https://example.com/feed.xml');

    expect(result.status).toBe(200);
    expect(result.body).toBe('Hello, World!');
    expect(result.url).toBe('https://example.com/feed.xml');
  });

  it('follows redirects and returns the final URL', async () => {
    dns.resolve4.mockResolvedValue(['93.184.216.34']);
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++;
        if (call === 1) {
          return {
            status: 301,
            headers: new Headers({ location: 'https://example.com/final' }),
          } as unknown as Response;
        }
        return {
          status: 200,
          headers: new Headers(),
          body: streamOf('redirected'),
        } as unknown as Response;
      }),
    );

    const result = await safeFetch('https://example.com/old');
    expect(result.url).toBe('https://example.com/final');
    expect(result.body).toBe('redirected');
  });

  it('handles response with no body (e.g. 204)', async () => {
    publicDns();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => ({ status: 204, headers: new Headers(), body: null }) as unknown as Response,
      ),
    );
    const result = await safeFetch('https://example.com');
    expect(result.body).toBe('');
  });
});
