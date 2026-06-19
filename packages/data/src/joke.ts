/**
 * Intent: Fetch a safe-mode single joke from JokeAPI, optionally filtered by
 *         category.
 * Context: Logic extracted from the /api/joke handler (RFC 0001 Phase 1). The
 *          api route applies the bundled fallback when this returns null.
 * Pattern: Pure `fetch`; returns null on any failure (route layer falls back).
 */

export interface JokeResult {
  readonly text: string;
  readonly category: string;
}

// JokeAPI v2 categories per its live error response (Knock-Knock is NOT one of
// them — the URL path treats hyphens as separators, so it's unreachable).
const VALID_JOKE_CATEGORIES = new Set([
  'Programming',
  'Misc',
  'Pun',
  'Dark',
  'Spooky',
  'Christmas',
]);

/** Title-case a single category input so it matches JokeAPI casing. */
function normalizeJokeCategory(input: string): string {
  const lower = input.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Resolve a raw categories CSV to a JokeAPI path segment — "Any" when nothing
 * usable is supplied, otherwise the comma-joined set of valid categories.
 */
export function resolveJokeCategories(categoriesCsv: string): string {
  const raw = categoriesCsv.trim();
  if (!raw) return 'Any';
  const valid = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(normalizeJokeCategory)
    .filter((s) => VALID_JOKE_CATEGORIES.has(s));
  return valid.length > 0 ? valid.join(',') : 'Any';
}

export async function fetchJoke(categoriesCsv = ''): Promise<JokeResult | null> {
  const categoriesPath = resolveJokeCategories(categoriesCsv);
  const url =
    `https://v2.jokeapi.dev/joke/${categoriesPath}` +
    `?safe-mode&type=single` +
    `&blacklistFlags=nsfw,religious,political,racist,sexist,explicit`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { error?: boolean; joke?: string; category?: string };
    if (data.error || !data.joke) return null;
    const text = data.joke.replace(/\s+/g, ' ').trim();
    return { text, category: data.category ?? '' };
  } catch {
    return null;
  }
}
