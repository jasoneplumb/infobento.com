/**
 * Intent: Fetch a random quote from the Quotable mirror, optionally steered by
 *         tags and bounded by length.
 * Context: Logic extracted from the /api/quote handler (RFC 0001 Phase 1). The
 *          api route is now a thin wrapper that applies the bundled fallback
 *          when this returns null.
 * Pattern: Pure `fetch`; returns null on any failure (route layer falls back).
 */

export interface QuoteResult {
  readonly text: string;
  readonly author: string;
}

export interface FetchQuoteOptions {
  /** Comma-separated tag steer, e.g. "wisdom, happiness". */
  readonly tags?: string;
  /** Upper bound on quote length (characters). */
  readonly maxLength?: number;
}

/**
 * Title-case each comma-separated tag — Quotable expects "Wisdom",
 * "Famous Quotes". Returns a normalized CSV (empty if no usable tags).
 */
export function normalizeQuoteTags(tagsCsv: string): string {
  return tagsCsv
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) =>
      t
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
    .join(',');
}

export async function fetchQuote(opts: FetchQuoteOptions = {}): Promise<QuoteResult | null> {
  const url = new URL('https://api.quotable.kurokeita.dev/api/quotes/random');
  const tags = normalizeQuoteTags((opts.tags ?? '').trim());
  if (tags) url.searchParams.set('tags', tags);
  if (opts.maxLength !== undefined && Number.isInteger(opts.maxLength) && opts.maxLength > 0) {
    url.searchParams.set('maxLength', String(opts.maxLength));
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === 'object' &&
      'quote' in data &&
      (data as { quote: unknown }).quote != null &&
      typeof (data as { quote: unknown }).quote === 'object'
    ) {
      const quote = (data as { quote: { content?: string; author?: { name?: string } } }).quote;
      if (quote.content) {
        return { text: quote.content, author: quote.author?.name ?? '' };
      }
    }
    return null;
  } catch {
    return null;
  }
}
