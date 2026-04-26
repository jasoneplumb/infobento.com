/**
 * Bundled local fallback for quote / joke / horoscope API endpoints.
 *
 * When the upstream provider returns a non-2xx response, the proxy falls back
 * to a random matching entry from these in-memory sets. Decided in Round 12 Q3
 * (2026-04-25, see .tux/project.json) after we hit 3 different provider
 * outages in a single session (quotable.io main domain dead, JokeAPI hyphen
 * quirk, Yahoo Finance 429s).
 *
 * Coverage:
 *   - quotes:    ~243 entries from quotable.kurokeita.dev mirror
 *   - jokes:     ~37 entries from JokeAPI (Programming/Misc/Pun — Dark/Spooky/
 *                Christmas + safe-mode return empty upstream)
 *   - horoscopes: 30 evergreen sign-agnostic readings, stamped with the
 *                 requested sign on lookup
 *
 * Other boxes (weather, on-this-day, stocks, AQI, geocoding) accept "No data"
 * on rare failures — those providers are robust or stale data is meaningless.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface QuoteFallback {
  readonly text: string;
  readonly author: string;
  readonly tags: readonly string[];
}

interface JokeFallback {
  readonly text: string;
  readonly category: string;
}

const quotes: readonly QuoteFallback[] = JSON.parse(
  readFileSync(resolve(__dirname, 'quotes.json'), 'utf8'),
) as QuoteFallback[];

const jokes: readonly JokeFallback[] = JSON.parse(
  readFileSync(resolve(__dirname, 'jokes.json'), 'utf8'),
) as JokeFallback[];

const horoscopes: readonly string[] = JSON.parse(
  readFileSync(resolve(__dirname, 'horoscopes.json'), 'utf8'),
) as string[];

function pickRandom<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick a random fallback quote, optionally filtered by tags (case-insensitive,
 * matches the live tag-steering UX). Falls back to the full set if no entry
 * matches the requested tags.
 */
export function pickFallbackQuote(tagsCsv?: string): { text: string; author: string } | null {
  const requested = (tagsCsv ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  let pool: readonly QuoteFallback[] = quotes;
  if (requested.length > 0) {
    const match = quotes.filter((q) => q.tags.some((t) => requested.includes(t)));
    if (match.length > 0) pool = match;
  }
  const pick = pickRandom(pool);
  if (!pick) return null;
  return { text: pick.text, author: pick.author };
}

/**
 * Pick a random fallback joke, optionally filtered by categories (case-
 * insensitive). Falls back to the full set if no entry matches.
 */
export function pickFallbackJoke(
  categoriesCsv?: string,
): { text: string; category: string } | null {
  const requested = (categoriesCsv ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);

  let pool: readonly JokeFallback[] = jokes;
  if (requested.length > 0 && !requested.includes('any')) {
    const match = jokes.filter((j) => requested.includes(j.category.toLowerCase()));
    if (match.length > 0) pool = match;
  }
  const pick = pickRandom(pool);
  if (!pick) return null;
  return { text: pick.text, category: pick.category };
}

/**
 * Pick a random fallback horoscope and stamp it with the requested sign.
 * The bundled set is sign-agnostic (per Round 12 Q3 decision) — variety
 * comes from the random pick, not from per-sign-specific content.
 */
export function pickFallbackHoroscope(sign: string): { sign: string; text: string } | null {
  const text = pickRandom(horoscopes);
  if (!text) return null;
  return { sign, text };
}
