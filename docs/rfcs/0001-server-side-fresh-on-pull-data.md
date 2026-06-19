# RFC 0001 — Server-side fresh-on-pull data resolution

|                          |                                                                           |
| ------------------------ | ------------------------------------------------------------------------- |
| **Status**               | Draft                                                                     |
| **Issue**                | [#135](https://github.com/jasoneplumb/infobento.com/issues/135)           |
| **Author**               | jasoneplumb                                                               |
| **Created**              | 2026-06-19                                                                |
| **Supersedes / relates** | client-side fetching #55, #58; fresh-on-fetch box types #62 (#59/#60/#61) |

## Summary

Move live box-data fetching (weather, forecast, AQI, stocks, sun/moon, quote, joke,
horoscope, on-this-day) from **the web editor at edit time** to **the API at
device-pull time**, so a device shows current data on each scheduled refresh
without anyone re-opening the editor. The render pipeline and the device firmware
are unchanged; the work is a new shared data layer, a hydrate step in the frame
handler, a cache, and a freshness rule that still respects the deep-sleep budget.

## Motivation

Today data is resolved **client-side** and baked into `config_json` as a snapshot:

- `packages/web/src/api.ts` fetches Open-Meteo (weather/forecast/AQI), Nominatim
  (geocoding), Wikipedia (on-this-day), JokeAPI, etc. in the browser; quotes proxy
  through the Hono API.
- On save, `PUT /api/device/:id/config` stores the resolved values. The box configs
  literally carry the data — `WeatherBoxConfig.data?`, `ForecastBoxConfig.entries?`
  (`packages/core/src/types.ts:24,49`).
- `getDeviceFrameForPull` (`packages/api/src/device.ts:88`) just `JSON.parse`s the
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

Extract the 10 fetchers from `web/src/api.ts` into a new pure package
(`fetchWeather`, `fetchForecast`, `fetchForecast3D`, `fetchSunTimes`,
`fetchAirQuality`, `fetchStocks`, `fetchOnThisDay`, `fetchJoke`, `fetchHoroscope`,
`fetchQuote`). Requirements:

- No DOM/`window`; `fetch` only (Node 18+, edge runtimes, and the browser all
  provide global `fetch`).
- Keep the existing **return-`null`-on-failure** contract — it's already the
  resilience primitive we need.
- `web` imports it for editor previews (no behavior change there); `api` imports it
  for pull-time hydration.

**Module boundary update** (CLAUDE.md): `data` imports nothing from siblings;
`api` and `web` may import `data`. `core` stays leaf.

### 2. Hydration at `GET /frame`

Add a `hydrateConfig(config, deps)` step in `getDeviceFrameForPull`, before
`renderBoth`:

```
getDevice → parse config_json → hydrateConfig(config) → renderBoth(config) → frame
```

`hydrateConfig` walks the boxes; for each live box it resolves data from
`@infobento/data` (via the cache, §4) and fills `data`/`entries`. Pure-ish: it
takes an injected resolver so it stays unit-testable. Static boxes (text,
countdown, qr, date, moon, sun — clock-derived) need no network.

Persisted `config_json` should hold **params only**; any baked `data`/`entries` is
treated as a discardable seed and overwritten on hydrate. (Open question: strip
`data` on `PUT` to keep rows small, vs. ignore-on-read. Lean: ignore-on-read,
strip opportunistically.)

### 3. Caching

A TTL cache keyed by `(provider, normalized-params)` — e.g.
`weather:lat,lon,units` — shared across all devices, so 1,000 devices in the same
city cause one upstream call per window. Per-provider TTLs (weather ~30–60 min,
on-this-day/horoscope ~24 h, stocks ~15 min). Stale-while-revalidate so a slow
upstream never blocks a frame.

**Edge concern:** the API is designed stateless/edge-deployable (Cloudflare/Deno/
Bun). In-process Map cache works for a single Node host now; a durable shared cache
(Workers KV / Deno KV / Redis) is needed if/when horizontally scaled. Phase the
durable cache; ship in-process first behind a small `Cache` interface.

### 4. Freshness / `Last-Modified` (the subtle half)

`isNotModified` (`device.ts:38`) compares `If-Modified-Since` to a single ms
timestamp. Replace `device.last_modified` with an **effective** value:

```
effectiveLastModified = max(config.last_modified, dataBucketBoundary)
dataBucketBoundary    = floor(now / bucket) * bucket   // bucket = device refresh cadence or min data TTL
```

So within a refresh window the device gets `304 → skip` (battery saved); at the
window boundary it gets a new `Last-Modified` → exactly one redraw with fresh data.
This composes with the Phase 4 RTC-cached `Last-Modified`: the device still commits
the token only after a confirmed draw, so a failed wake retries next window.

Bucket source of truth: derive from the config's `refreshesPerDay` (already a
top-level config field) so the freshness window matches what the device is told to
do.

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

### Renderer purity preserved

`@infobento/renderer` still receives a fully-populated `BentoConfig` and draws it.
All fetching/caching lives in `api` + `data`. `renderBoth` is untouched.

## Rollout / phasing

1. **Extract `@infobento/data`** from `web/src/api.ts` — pure move, no behavior
   change, web keeps using it. (Standalone PR; lowest risk.)
2. **Hydrate one box type (weather)** at `GET /frame` behind the existing flow;
   prove end-to-end on the bench (device shows updated temp with no edit).
3. **Freshness bucketing** + `effectiveLastModified`.
4. **Remaining box types.**
5. **Durable cache** for edge/horizontal scale.

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
