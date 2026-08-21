/**
 * Intent: Next public holiday for a country from the Nager.Date API.
 * Context: Free, no API key. ~100 countries. Returns the first entry of
 *   NextPublicHolidays — already future-scoped and sorted ascending.
 * Pattern: Pure `fetch`; returns null on any failure (HTTP error, empty
 *   array, or malformed payload). Date is stored as-is; the renderer derives
 *   the countdown at draw time so a cached payload never goes stale.
 */

import type { HolidayData } from '@infobento/core';

/** ISO 3166-1 alpha-2: exactly two ASCII letters, no URL-significant characters. */
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

/** Matches HolidayDataSchema in @infobento/core, so a payload that parses here also validates there. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
}

/**
 * Fetch the next public holiday for a country. Returns null when the country
 * code is unrecognised, the request fails, or no upcoming holidays are found.
 */
export async function fetchNextPublicHoliday(countryCode: string): Promise<HolidayData | null> {
  const code = countryCode.trim().toUpperCase();
  // Shape-check here, not only in the Zod schema: `web` imports this function
  // and calls it straight from the browser, so the API's validation layer is
  // not on that path. Anything but two letters could steer the request to a
  // different endpoint on the upstream host.
  if (!COUNTRY_CODE_RE.test(code)) return null;

  try {
    // COUNTRY_CODE_RE above is the security guard, not this encode: [A-Z]{2}
    // contains nothing percent-encodable, so the call is a no-op today. Kept as
    // a second line of defence if that pattern is ever widened.
    const res = await fetch(
      `https://date.nager.at/api/v3/NextPublicHolidays/${encodeURIComponent(code)}`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0] as NagerHoliday;
    if (!first.date || !first.localName) return null;
    // Shape-check the upstream date rather than trusting it. A non-ISO string
    // would otherwise be stored, render as a silent 0-day countdown, and then
    // fail Zod on the next config write — a confusing failure far from here.
    if (!ISO_DATE_RE.test(first.date)) return null;

    return { name: first.localName, date: first.date };
  } catch {
    return null;
  }
}
