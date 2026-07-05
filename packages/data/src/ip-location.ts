/**
 * Intent: Resolve an approximate "City, Region" + country code from an IP
 *         address via ipapi.co.
 * Context: Issue #183 — tracker blocklists (Firefox ETP, adblockers) block
 *          ipapi.co when called from the browser, so the api proxies the
 *          lookup through /api/geolocate; this resolver stays fetch-only so
 *          the server route and the web editor's direct-call fallback share
 *          one implementation.
 * Pattern: Pure `fetch`; returns null on any failure (callers fall back).
 */

export interface IpLocationResult {
  /** "City, Region" when a region is known, otherwise just "City". */
  readonly city: string;
  /** ISO 3166-1 alpha-2, uppercased — or null when the API omits it. */
  readonly countryCode: string | null;
}

/**
 * Look up the location of `ip`, or of the caller's own egress IP when `ip`
 * is omitted (ipapi.co resolves the requesting address).
 */
export async function fetchIpLocation(ip?: string): Promise<IpLocationResult | null> {
  const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/';
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      city?: string;
      region?: string;
      country_code?: string;
      error?: boolean;
    };
    if (data.error || !data.city) return null;
    return {
      city: data.region ? `${data.city}, ${data.region}` : data.city,
      countryCode: data.country_code ? data.country_code.toUpperCase() : null,
    };
  } catch {
    return null;
  }
}
