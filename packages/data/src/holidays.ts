/**
 * Intent: Next public holiday for a country from the Nager.Date API.
 * Context: Free, no API key. ~100 countries. Returns the first entry of
 *   NextPublicHolidays — already future-scoped and sorted ascending.
 * Pattern: Pure `fetch`; returns null on any failure (HTTP error, empty
 *   array, or malformed payload). Date is stored as-is; the renderer derives
 *   the countdown at draw time so a cached payload never goes stale.
 */

import type { HolidayData } from '@infobento/core';

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
  if (!code) return null;

  try {
    const res = await fetch(`https://date.nager.at/api/v3/NextPublicHolidays/${code}`);
    if (!res.ok) return null;

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0] as NagerHoliday;
    if (!first.date || !first.localName) return null;

    return { name: first.localName, date: first.date };
  } catch {
    return null;
  }
}
