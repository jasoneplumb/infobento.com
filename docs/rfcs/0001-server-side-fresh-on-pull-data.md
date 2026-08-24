# RFC 0001 — Server-side fresh-on-pull data resolution

|                          |                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Status**               | Implemented — shipped as `@infobento/data` + pull-time hydration (PRs #138–#151) |
| **Issue**                | [#135](https://github.com/jasoneplumb/infobento.com/issues/135)                  |
| **Author**               | jasoneplumb                                                                      |
| **Created**              | 2026-06-19                                                                       |
| **Supersedes / relates** | client-side fetching #55, #58; fresh-on-fetch box types #62 (#59/#60/#61)        |

## Summary

Move live box-data fetching (weather, forecast, AQI, stocks, sun/moon, quote, joke,
horoscope, on-this-day) from **the web editor at edit time** to **the API at
device-pull time**, so a device shows current data on each scheduled refresh
without anyone re-opening the editor. The render pipeline and the device firmware
are unchanged; the work is a new shared data layer, a hydrate step in the frame
handler, a cache, and a freshness rule that still respects the deep-sleep budget.

## Motivation

Today data is resolved **client-side** and baked into `config_json` as a snapshot:

- `packages/web/src/api.ts` resolves data two ways: **5 boxes call external
  providers directly from the browser** — weather/forecast/forecast3d/sun/aqi via
  Open-Meteo + Nominatim — and **5 call the Hono API's own proxy routes** —
  joke/horoscope/onthisday/quote/stocks hit `/api/{joke,horoscope,onthisday,quote,
stocks}` (`server.ts:186,235,285,320,375`), whose real provider logic + bundled
  quota fallbacks already live server-side in `api/src/server.ts` and
  `api/src/fallback/`.
- On save, `PUT /api/device/:id/config` stores the resolved values. The box configs
  literally carry the data — `WeatherBoxConfig.data?`, `ForecastBoxConfig.entries?`
  (`packages/core/src/types.ts:24,49`).
- `getDeviceFrameForPull` (`packages/api/src/device.ts:67`) just `JSON.parse`s the
  config and calls `renderBoth(config)` — it draws whatever was baked in.
- `Last-Modified` = `devices.last_modified`, bumped **only** by `setConfig`
  (`packages/api/src/db.ts:252`). So a polling device gets `304 → skip` forever
  until someone edits the config.

**Net:** the display is a static snapshot of the last edit. A device left alone
shows day-old weather.

## Goals

- On each scheduled refresh (production cadence ~1–2×/day), live boxes show current
  data, no manual edit.
- The renderer stays pure (data in → pixels out); no network in `@infobento/renderer`.
- Upstream providers hit at most once per cache window regardless of device count.
- A provider outage never strands the panel — always return a drawable frame.
- The Phase 4 `304`-skip still protects the solar/battery budget between windows.

## Non-goals

- Real-time / streaming / sub-refresh freshness.
- Changing the eInk cadence or the deep-sleep/RTC model.
- Removing the editor's fetching — it stays for live previews.

## Detailed design

### Key enabler: the schema is already split

The box configs already separate **user params** from **resolved data**:

```ts
interface WeatherBoxConfig {
  type: 'weather';
  city: string;
  lat?: number;
  lon?: number;
  data?: WeatherData;
}
interface ForecastBoxConfig {
  type: 'forecast';
  city: string;
  lat?: number;
  lon?: number;
  hours?: number;
  entries?: readonly ForecastEntry[];
}
```

`data?`/`entries?` are optional. So the change is: instead of the **web client**
populating them and persisting them, the **API** populates them at render time
from params. Minimal schema churn — mostly making the optionality the contract
("params are authored; data is server-resolved").

### 1. `@infobento/data` — shared provider package

Consolidate provider logic into a new pure package. **The extraction is
asymmetric** — the 10 fetchers split by where their real logic lives today:

- **5 direct fetchers** (`fetchWeather`, `fetchForecast`, `fetchForecast3D`,
  `fetchSunTimes`, `fetchAirQuality`) call Open-Meteo/Nominatim straight from the
  browser. These move from `web/src/api.ts` into `@infobento/data` as a near-pure
  lift.
- **5 proxy fetchers** (`fetchJoke`, `fetchHoroscope`, `fetchOnThisDay`,
  `fetchQuote`, `fetchStocks`) are thin `fetch('/api/…')` wrappers; their provider
  logic is in `server.ts` handlers + `api/src/fallback/`. The `api` package **cannot
  call its own HTTP routes** for hydration, so the underlying logic must be pulled
  out of those handlers into `@infobento/data`. The `server.ts` routes then become
  thin wrappers over `@infobento/data` (exactly what the web editor calls), and
  `hydrateConfig` calls `@infobento/data` directly. The `fallback/` quota-fallback
  data follows the logic into `@infobento/data` (or stays in `api` as an explicit
  fallback layer above it — decide during Step 1).

So Step 1 is **not** a uniform "pure move": only the 5 direct fetchers are
behavior-neutral; the 5 proxy ones require restructuring `server.ts` (logic out,
routes become wrappers) to avoid a second copy of the provider code.

Requirements:

- No DOM/`window`; `fetch` only (Node 18+, edge runtimes, and the browser all
  provide global `fetch`).
- Keep the existing **return-`null`-on-failure** contract — it's already the
  resilience primitive we need.
- `web` imports it for editor previews; `api` imports it for pull-time hydration
  **and** for its (now thin) proxy routes.

**Module boundary update** (CLAUDE.md): `data` imports nothing from siblings;
`api` and `web` may import `data`. `core` stays leaf.

### 2. Hydration at `GET /frame`

Add a `hydrateConfig(config, deps): Promise<BentoConfig>` step in
`getDeviceFrameForPull`, before `renderBoth`:

```
getDevice → parse config_json → hydratedConfig = await hydrateConfig(config) → renderBoth(hydratedConfig) → frame
```

`hydrateConfig` walks the boxes; for each live box it resolves data from
`@infobento/data` (via the cache, §4) and produces a box that carries the fresh
`data`/`entries`. **Box config fields are `readonly` (`core/src/types.ts`)**, so
this is an immutable transform — `hydrateConfig` returns a **new** `BentoConfig`,
spreading/reconstructing each box that gains data, rather than mutating in place.
It takes an injected resolver so it stays unit-testable.

Which boxes need the network: live boxes are weather, forecast, forecast3d,
**sun** (sunrise/sunset via `fetchSunTimes` → Nominatim + Open-Meteo), aqi, stocks,
quote, joke, horoscope, on-this-day. Genuinely static/computed — no network —
are text, countdown, qr, date, and **moon** (phase is computed from the UTC date
alone).

**Invariant — always replace, never fill-absent.** For every live box,
`hydrateConfig` unconditionally reconstructs the box with fresh `data`/`entries`
from the cache/fetcher, regardless of whether a seed is already present. A
`if (!box.data) …` fill-absent-only implementation would silently keep stale baked
data when a seed exists in `config_json` — the exact bug this RFC exists to kill.
Persisted `config_json` holds **params only**; baked `data`/`entries` is a
discardable seed. (Open question: strip `data` on `PUT` to keep rows small, vs.
ignore-and-overwrite on read. Lean: overwrite on read, strip opportunistically.)

### 3. Caching

A TTL cache keyed by `(provider, normalized-params)` — e.g.
`weather:lat,lon,units` — shared across all devices, so 1,000 devices in the same
city cause one upstream call per window. Per-provider TTLs (weather ~30–60 min,
on-this-day/horoscope ~24 h, stocks ~15 min). Stale-while-revalidate so a slow
upstream never blocks a frame.

**Single-flight (thundering herd).** Devices on the same cadence wake nearly
simultaneously, so at a bucket boundary every concurrent request for the same key
sees an expired entry and fires its own upstream call before any refresh lands.
Stale-while-revalidate alone doesn't fix this. The `Cache` interface must do
**promise deduplication**: if a refresh is already in-flight for a key, later
callers await the same `Promise`.

Per-key dedup is necessary but **not sufficient** for Nominatim, which enforces
1 req/sec (`web/src/api.ts:35`) and backs five fetchers. Devices in N different
cities produce N distinct geocode keys that all cache-miss at a boundary — dedup
doesn't apply across keys, so the herd still exceeds 1 req/sec. `@infobento/data`
needs a **Nominatim-global serial queue / rate limiter** in addition to per-key
dedup: per-key for the same-city case, global throttle for the cross-key case.
(Caching resolved coordinates aggressively — geocodes rarely change — also shrinks
the problem.)

**Edge concern:** the API is designed stateless/edge-deployable (Cloudflare/Deno/
Bun). In-process Map cache works for a single Node host now; a durable shared cache
(Workers KV / Deno KV / Redis) is needed if/when horizontally scaled. Phase the
durable cache; ship in-process first behind a small `Cache` interface (single-flight
included from day one).

### 4. Freshness / `Last-Modified` (the subtle half)

`isNotModified` (`device.ts:38`) compares `If-Modified-Since` to a single ms
timestamp. Replace `device.last_modified` with an **effective** value:

```
effectiveLastModified = max(config.last_modified, dataBucketBoundary)
dataBucketBoundary    = floor(now / bucket) * bucket   // bucket = device cadence from refreshesPerDay
```

The bucket is the **device cadence** (`refreshesPerDay`), full stop — _not_ the min
data TTL. With cadence (`refreshesPerDay=2` → 12 h bucket) the device gets `304`
within each window and `200` at the two daily boundaries — intended. Bucketing on a
provider TTL (stocks ~15 min → 96 boundaries/day) would advance `Last-Modified`
constantly between device wakes, leaking the server's cache rhythm into HTTP
semantics for no benefit. Per-provider TTLs govern how stale the _cache data_ may
be, independently of when `Last-Modified` changes.

So within a window the device gets `304 → skip` (battery saved); at the boundary it
gets a new `Last-Modified` → exactly one redraw with fresh data. This composes with
the Phase 4 RTC-cached `Last-Modified`: the device commits the token only after a
confirmed draw, so a failed wake retries next window.

**Cost note — don't regress the cheap 304 path.** Today `getDeviceFrameForPull`
(`device.ts:67`) calls `isNotModified` _before_ `JSON.parse(config_json)` — a cheap
early exit so 304 wakes never parse. But `dataBucketBoundary` needs
`refreshesPerDay`, which lives inside the JSON, so the naive formula forces a parse
on every request including 304s. Two options:

1. **Denormalize** `refreshes_per_day` into the `devices` table (set on `PUT`), so
   the effective timestamp is computable pre-parse and the early exit survives.
2. **Parse-always** and document it — likely fine given typical config sizes, but
   must be a deliberate, stated tradeoff, not a silent regression.

Lean toward (1) — it keeps the 304 path allocation-free, which matters for the
high-frequency steady state. Two correctness requirements for the denormalized
column:

- **Atomicity:** write `config_json` and `refreshes_per_day` in the **same SQL
  transaction** on `PUT`, and ship a migration that backfills existing rows with a
  default (`refreshes_per_day = 2`) — otherwise `dataBucketBoundary` computes
  against `NULL`/stale cadence until the next `PUT`.
- **Consistency:** derive the column **only** from the parsed config, never accept
  it as a separate `PUT` field, so it can't drift from `config_json`.

### 5. Secrets / keys

Most providers are keyless (Open-Meteo, Nominatim, Wikipedia, JokeAPI). Any keyed
provider (e.g. stocks) needs an API key via env, managed per deploy target. Keys
live server-side only — a win over the current model, where the browser holds
whatever the providers require.

### 6. Failure handling (ties to Phase 5 resilience)

- Provider returns `null`/throws/times out → use last-good cached data; if none,
  render the box in a graceful empty state. **Never** 5xx the frame — the firmware's
  resilient path keeps the last good panel image, but we should still return 200
  with a drawable frame whenever possible.
- Bound every upstream call with a timeout well under the device's HTTP timeout.

**Renderer requirement (lands before Step 2).** "Graceful empty state" pushes a
requirement onto the renderer: with `noUncheckedIndexedAccess`, a live box whose
`data` is `undefined` is a type/runtime hazard, and today the renderer expects a
fully-populated config. Pick one and build it before hydrating any box at
`GET /frame`:

- the renderer gains a defined no-data path per live box type (e.g. weather shows
  `--°` + unknown-condition icon), **or**
- `hydrateConfig` guarantees a non-null synthetic data object on failure, so the
  renderer never sees `undefined`.

Leaning toward the hydration-guarantees-non-null option keeps the renderer purely
data-in/pixels-out, but the empty-state _visuals_ still need design either way.

### Renderer purity preserved

`@infobento/renderer` still receives a fully-populated `BentoConfig` and draws it.
All fetching/caching lives in `api` + `data`. `renderBoth` is untouched.

## Rollout / phasing

1. **Extract `@infobento/data`.** The 5 direct fetchers lift from `web/src/api.ts`
   (behavior-neutral); the 5 proxy fetchers' logic moves out of `server.ts` handlers
   - `api/src/fallback/`, with those routes becoming thin wrappers. Includes the
     `Cache` interface (TTL + single-flight + Nominatim global queue). (Standalone PR.)
2. **Renderer no-data path** — pick the empty-state strategy (§6) and land it, so
   provider-down hydration has somewhere to draw to.
3. **Hydrate one box type (weather)** at `GET /frame`; prove end-to-end on the bench
   (device shows an updated temp with no edit).
4. **Freshness** — denormalize `refreshes_per_day`, `effectiveLastModified` bucketing.
5. **Remaining box types.**
6. **Durable cache** for edge/horizontal scale.

## Alternatives considered

- **Device ignores 304, always redraws on wake.** Simplest firmware change, but
  burns an eInk refresh + Wi-Fi/draw energy every wake even when nothing changed —
  wrong for a 1–2×/day solar budget. Rejected.
- **Keep fetching client-side, add a "refresh" cron in the web app.** Requires the
  editor to be open/served continuously and re-PUT per device — doesn't scale and
  defeats the unattended goal. Rejected.
- **Push model (server pushes new frames).** The device is a deep-sleeping pull
  client by design (Phases 3–5); push contradicts the power model. Rejected.

## Open questions

- Strip `data`/`entries` on `PUT`, or ignore-on-read only?
- Durable cache choice and when to introduce it (tied to the edge-deploy roadmap).
- Per-device vs global cache keys when params include device-specific location.
- Source of truth for units/timezone (config vs per-box).
- Migration of existing baked configs (treat as seed and discard — confirm).

## Testing

- Unit: each resolver (mocked upstream), `hydrateConfig`, the `effectiveLastModified`
  / bucketing math, cache TTL + stale-while-revalidate.
- Integration: `GET /frame` with mocked providers → correct hydrated frame + headers;
  `304` within a window, `200` at the boundary.
- Resilience: provider-down / timeout / keyless-vs-keyed paths still yield a drawable
  frame.

## Security & privacy

- Provider keys move server-side (improvement).
- Device location/params are already in `config_json`; cache keys derived from them
  stay server-internal.
- Upstream calls are made by the API, not the device — the device only ever talks to
  the InfoBento API (unchanged trust boundary).
