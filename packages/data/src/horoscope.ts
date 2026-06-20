/**
 * Intent: Fetch a daily horoscope reading for a zodiac sign.
 * Context: Logic extracted from the /api/horoscope handler (RFC 0001 Phase 1).
 *          The upstream (api-ninjas) is keyed; with no key configured it returns
 *          non-2xx and this yields null, so the api route serves the bundled
 *          fallback — matching the pre-extraction behavior. A server-side key
 *          (RFC 0001 §5) is a later concern.
 * Pattern: Pure `fetch`; returns null on any failure (route layer falls back).
 */

export interface HoroscopeResult {
  readonly sign: string;
  readonly text: string;
  readonly date: string;
}

export const VALID_ZODIAC_SIGNS: ReadonlySet<string> = new Set([
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
]);

export async function fetchHoroscope(sign: string): Promise<HoroscopeResult | null> {
  const normalized = sign.trim().toLowerCase();
  if (!normalized || !VALID_ZODIAC_SIGNS.has(normalized)) return null;

  try {
    const url = `https://api.api-ninjas.com/v1/horoscope?zodiac=${normalized}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { sign?: string; date?: string; horoscope?: string };
    if (!data.horoscope) return null;
    return { sign: normalized, text: data.horoscope, date: data.date ?? '' };
  } catch {
    return null;
  }
}
