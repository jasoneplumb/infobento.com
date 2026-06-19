/**
 * Intent: Fetch a random "On This Day" entry for today's UTC date from
 *         Wikipedia, sampled from the requested category.
 * Context: Logic extracted from the /api/onthisday handler (RFC 0001 Phase 1).
 *          There is no bundled fallback for this provider, so the api route maps
 *          a null here to an error response.
 * Pattern: Pure `fetch`; returns null on any failure.
 */

export interface OnThisDayResult {
  readonly text: string;
  readonly year: string;
  readonly category: string;
}

export const VALID_ONTHISDAY_CATEGORIES: ReadonlySet<string> = new Set([
  'events',
  'births',
  'deaths',
  'holidays',
  'all',
]);

interface WikiOnThisDayEntry {
  text?: string;
  year?: number;
}
interface WikiOnThisDayResponse {
  events?: WikiOnThisDayEntry[];
  births?: WikiOnThisDayEntry[];
  deaths?: WikiOnThisDayEntry[];
  holidays?: WikiOnThisDayEntry[];
}

export async function fetchOnThisDay(categoryInput = 'events'): Promise<OnThisDayResult | null> {
  const requested = categoryInput.trim().toLowerCase();
  const category = VALID_ONTHISDAY_CATEGORIES.has(requested) ? requested : 'events';

  try {
    const now = new Date();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    // Wikipedia's /all endpoint returns the union of categories; we then sample
    // from the requested subset (or across all four for category='all').
    const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${mm}/${dd}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as WikiOnThisDayResponse;
    let pool: WikiOnThisDayEntry[] = [];
    if (category === 'all') {
      pool = [
        ...(data.events ?? []),
        ...(data.births ?? []),
        ...(data.deaths ?? []),
        ...(data.holidays ?? []),
      ];
    } else if (category === 'events') {
      pool = data.events ?? [];
    } else if (category === 'births') {
      pool = data.births ?? [];
    } else if (category === 'deaths') {
      pool = data.deaths ?? [];
    } else if (category === 'holidays') {
      pool = data.holidays ?? [];
    }
    if (pool.length === 0) return null;

    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick?.text) return null;
    return {
      text: pick.text,
      year: pick.year != null ? String(pick.year) : '',
      category,
    };
  } catch {
    return null;
  }
}
