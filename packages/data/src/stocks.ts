/**
 * Intent: Fetch a stock quote (price + change vs. start-of-range) from Yahoo
 *         Finance for a symbol and duration preset.
 * Context: Logic extracted from the /api/stocks handler (RFC 0001 Phase 1).
 *          There is no bundled fallback for this provider, so the api route maps
 *          a null here to an error response.
 * Pattern: Pure `fetch`; returns null on any failure.
 */

export interface StocksResult {
  readonly price: number;
  readonly change: number;
  readonly changePercent: number;
}

/** Map a duration preset to a Yahoo Finance chart range + interval pair. */
export const STOCK_RANGE_MAP: Record<string, { range: string; interval: string }> = {
  '1d': { range: '2d', interval: '1d' },
  '5d': { range: '5d', interval: '1d' },
  '1mo': { range: '1mo', interval: '1d' },
  '3mo': { range: '3mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y': { range: '1y', interval: '1wk' },
  '5y': { range: '5y', interval: '1mo' },
};

// Allow letters/digits/dots/hyphens — covers AAPL, BRK.A, BTC-USD, etc.
const STOCK_SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** Validate an already-uppercased ticker symbol. */
export function isValidStockSymbol(symbol: string): boolean {
  return STOCK_SYMBOL_RE.test(symbol);
}

interface YahooChartResponse {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
      indicators?: { quote?: { close?: (number | null)[] }[] };
    }[];
  };
}

export async function fetchStocks(
  symbolInput: string,
  durationInput = '1d',
): Promise<StocksResult | null> {
  const symbol = symbolInput.trim().toUpperCase();
  if (!isValidStockSymbol(symbol)) return null;

  const duration = durationInput.trim();
  // An unrecognized duration returns null (the route maps that to a 502) rather
  // than silently degrading to 1d data — the stricter contract that pull-time
  // hydration callers can rely on.
  const ri = STOCK_RANGE_MAP[duration];
  if (!ri) return null;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${ri.interval}&range=${ri.range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfoBento/1.0)' },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;
    if (price == null) return null;

    // Baseline (start-of-range) price:
    //   1d → previous close from meta (today vs. yesterday).
    //   longer → first non-null close in the returned series.
    let baseline: number | undefined;
    if (duration === '1d') {
      baseline = meta?.chartPreviousClose;
    } else {
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      baseline = closes.find((v): v is number => typeof v === 'number' && Number.isFinite(v));
    }
    if (baseline == null) return null;

    const change = price - baseline;
    const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0;
    return { price, change, changePercent };
  } catch {
    return null;
  }
}
