# RFC 0003 — Box-type selection: a rubric derived from five removals, and what to add next

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Issue**                | [#221](https://github.com/jasoneplumb/infobento.com/issues/221)                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Author**               | jasoneplumb                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Created**              | 2026-08-20                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Supersedes / relates** | formalises the removal passes in [#84](https://github.com/jasoneplumb/infobento.com/pull/84) and [#210](https://github.com/jasoneplumb/infobento.com/issues/210)/[#211](https://github.com/jasoneplumb/infobento.com/pull/211); documents [#212](https://github.com/jasoneplumb/infobento.com/issues/212)/[#213](https://github.com/jasoneplumb/infobento.com/pull/213) after the fact; provider contract from [RFC 0001](0001-server-side-fresh-on-pull-data.md) |

## Summary

The box-type set has churned three times without a written standard for what
belongs in it. #84 removed two types, #211 removed three more on the strength of
a value-rating pass whose rubric lives only in an issue body, and #212/#213 added
two with no RFC at all. This RFC writes the rubric down, applies it retroactively
to all five removals and both additions so the current set is justified in the
same terms, and evaluates ten candidate providers against it.

Every candidate was probed live on 2026-08-20 rather than recalled, because
"free and keyless" is precisely the kind of claim that rots silently. Three are
recommended, three are conditional on the owner's location, and four are
rejected — two of them on the same reasoning that removed `joke`.

The investigation also surfaced two things that are not about new boxes at all:
the highest-value candidate would introduce this codebase's **first SSRF
surface**, and one already-shipped box depends on an endpoint that appears to
require an API key it is not sending.

## Decisions

| #   | Question                   | Recommendation                                                                                                                                                                                                                                                           |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | What qualifies a box type? | **Six gates, all mandatory** (below). The load-bearing three are the ones that removed `calendar`/`habit` (must have a live provider), `worldclock`/`joke` (must be truthful at the refresh rate), and `tasks` (must not duplicate an existing box).                     |
| 2   | Next box to build          | **Currency / FX**, on ECB data via Frankfurter. It is the only candidate whose upstream cadence _equals_ the device's refresh cadence, and it is 83 bytes on the wire.                                                                                                   |
| 3   | Highest-value box          | **RSS headlines** — one box type covers dozens of use cases and is keyless by construction. Gated on the SSRF work in Decision 5; do not ship it as a naive `fetch(userUrl)`.                                                                                            |
| 4   | Location-specific boxes    | Ship **carbon intensity** (UK) and **marine** (coastal) as explicitly regional. `FALLBACK_LOCATION` is already `London, UK`, so a UK-first energy box is aligned rather than arbitrary. Aurora is deferred — the audience is too thin.                                   |
| 5   | User-supplied URLs         | Requires a **fetch guard** before any box accepts a URL: scheme allowlist, private-range blocking, redirect capping, response size cap, timeout. Shipped as `safeFetch()` (#225, closing #224); no provider calls it yet because none fetches a user-supplied URL today. |
| 6   | Provider durability        | Treat **api-ninjas** (`horoscope`), **Yahoo** (`stocks`), and **kurokeita's quotable mirror** (`quote`) as at-risk dependencies and monitor them. None is a documented free tier or official source.                                                                     |

## Motivation

Three box-set changes have now landed on undocumented reasoning, and the set has
been as large as 20 and as small as 15 without a written account of why.

**#84 removed two types.** Its reasoning was the sharpest of the three and the
least visible, buried in a PR body whose title leads with an unrelated renderer
fix. "A clock that's hours stale isn't a clock" is the single best sentence
anyone has written about this product's constraints, and it exists in one place
that nobody would think to look.

**#211 removed three more.** The issue records the outcome — `calendar` 1/5,
`habit` 1/5, `joke` 2/5 — and the reasoning for those particular scores, but not
the scale that produced them or how the remaining fifteen scored. The insight
buried in that pass is genuinely good: the two lowest scores were not a matter of
taste, but a _structural_ property — `calendar` and `habit` were the only types
with no provider in `packages/data`.

That structural insight had already been applied to `tasks` in #84, 115 days
earlier, and was rediscovered from scratch. Two independent passes reaching the
same conclusion by the same reasoning, with no shared record, is the cost this
RFC is meant to stop paying.

**#212/#213 added two types** with no RFC, on the strength of "the endpoint is
already being called". That happened to be a good reason, but it was never
tested against a standard.

Without a written rubric the next addition is decided by whoever is holding the
keyboard, and the set drifts toward whatever is easy to fetch rather than what
is worth looking at.

## Goals

- A rubric that would have produced both #84's and #211's outcomes, stated
  before the next change rather than after it.
- Retroactive justification for all five removals and both additions in the same
  terms, so the current 17 are defensible as a set and not just individually.
- A ranked, evidence-backed candidate list, with the rejections argued as
  explicitly as the acceptances.
- Surface the security and dependency work that the candidate list implies.

## Non-goals

- Re-litigating #84 or #211. Those five are gone and this RFC does not reopen
  them; it only reconstructs why, to test the rubric against real decisions.
- Committing to build every recommendation. This ranks; it does not schedule.
- Anything requiring an API key, a paid tier, or per-user credentials. The
  product's "free by default, no accounts, no keys" claim is a constraint here,
  not an aspiration.
- Image-bearing boxes. The 4-level grayscale pipeline is out of scope.

## The rubric

Six gates. A candidate must pass **all six**; there is no weighted total, because
the removal passes showed that a single structural failure outweighs any amount
of charm.

Every gate below was _derived_ from a box that actually died on it. This is not a
rubric invented in the abstract and applied backwards — it is the reasoning
already used in #84 and #211, extracted and named.

**1. Live.** It has, or can have, a provider in `packages/data`. A box whose
content changes only when its owner edits config is inert on hardware with no
input device and a 1–2×/day refresh. _Killed `calendar`, `habit`, and `tasks`._

**2. Truthful at the refresh rate.** This has two distinct failure modes, one
found by each removal pass:

- _Content that changes without becoming newly true._ A fresh random joke is
  **different** from yesterday's, not **newer**. The refresh conveys no
  information. _Killed `joke`._
- _Content whose truth decays faster than the device can refresh._ #84 put it
  exactly right: **"a clock that's hours stale isn't a clock."** The box was not
  static — quite the opposite, it was too dynamic. Its correctness had a
  half-life shorter than the pull interval, so the panel could only ever display
  a confident falsehood. _Killed `worldclock`._

The second mode is the sharper test, and the easier one to fail while feeling
clever. Any candidate whose value proposition contains the word "current" at a
resolution finer than hours should be checked against it. Note that this is what
distinguishes `date` (correct all day) from `worldclock` (wrong within minutes),
despite both being clock-adjacent.

**3. Glanceable.** It reduces to a hero value plus a short qualifier, readable
across a kitchen at a glance. Prose that needs to be _read_ rather than _seen_
belongs in `text`.

**4. Not already covered.** A box must not duplicate what an existing box does
adequately. `tasks` was removed because newline-delimited text in a `text` box
does the same job on a passive surface — and #84 shipped the `\n` handling in
`drawTextWrapped` that made the replacement genuinely equivalent rather than
merely arguable. _Killed `tasks`._

**5. Keyless and durable.** Free, no API key, no per-user credential, and served
by an organisation with a reason to keep serving it. An official body publishing
its own data outranks a community wrapper, which outranks an undocumented
endpoint.

**6. Cheap on the wire.** Every byte crosses a battery-powered, solar-charged
link. Payload is a first-class criterion, not an afterthought.

### Applying it retroactively to the five removals

The set has been cut twice. Both cuts are reconstructed here against the gates,
as the check on whether the rubric actually encodes the reasoning that was used.

| Removed      | Pass | Failed gate                              | Reasoning as recorded at the time                                                                                                    |
| ------------ | ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `worldclock` | #84  | **2** truthful at refresh                | "A clock that's hours stale isn't a clock." Reframing it as a colleague-awake presence indicator was considered and rejected.        |
| `tasks`      | #84  | **1** live, **4** not covered            | Static config, and "the checkbox list is overkill on a passive surface" — `text` with newlines does the job.                         |
| `calendar`   | #211 | **1** live                               | No provider in `packages/data`; `CONNECTIVITY.md` already flagged it as a gap pending phone integration. Scored 1/5.                 |
| `habit`      | #211 | **1** live                               | No provider; user-typed config only, so it can change only when the editor is open. Scored 1/5.                                      |
| `joke`       | #211 | **2** truthful at refresh, **5** durable | Live, but the lowest-rated live box; different-but-not-newer content, plus a third-party dep and a bundled fallback set. Scored 2/5. |

Two things fall out of this that were not obvious before writing it down.

**Gate 1 did most of the work.** Three of five removals were structural — the box
had no provider and therefore could not change. That is a property checkable at
design time, from the type definition alone, without any judgement about whether
the content is interesting. It should be the first question asked of any
proposal.

**#84 anticipated #211 by nearly four months and nobody wrote it down.** `tasks` failed
gate 1 for exactly the reason `calendar` and `habit` did — static config on a
device with no input — and the #210 pass rediscovered that insight from scratch
and presented it as new. That is the concrete cost of not having this document,
and the clearest argument for keeping it current.

### Applying it to what shipped

| Type     | 1 Live | 2 Truthful        | 3 Glanceable               | 4 Not covered                 | 5 Durable     | 6 Cheap | Verdict   |
| -------- | ------ | ----------------- | -------------------------- | ----------------------------- | ------------- | ------- | --------- |
| `uv`     | ✅     | ✅ daily cycle    | ✅ number + WHO band       | ✅ `aqi`'s dim secondary line | ✅ Open-Meteo | ✅      | **Holds** |
| `pollen` | ✅     | ✅ daily forecast | ✅ count + allergen + band | ✅                            | ✅ Open-Meteo | ✅      | **Holds** |

Both pass cleanly, which is a useful sanity check: a standard that retroactively
condemned the things just shipped would be suspect.

Gate 4 is worth a note for `uv`. It arguably _was_ already covered — `AQIData`
carried a `uvIndex` field — but only as a secondary `UV:N` line inside the `aqi`
box, styled in a lighter shade rather than surfaced as its own reading. The gate
asks whether an existing box does the job **adequately**, not whether the datum
exists somewhere in the codebase. It did not, so `uv` passes.

`uv` is worth noting as the ideal shape of an addition. `air-quality.ts` was
_already requesting_ `uv_index` and parking it, half-surfaced, on `AQIData`. The
box added a renderer and a config arm over a reading the system was already
paying for — no new provider, no new key, no new failure mode.

`pollen` is the more interesting case, because it passes gate 3 only by
deliberate design. Three states are kept distinct — a reading, a genuine
all-clear ("None detected"), and no coverage at all ("No data") — since
Open-Meteo serves pollen in Europe during season only. Collapsing the last two
would tell a hay-fever sufferer in Oregon that the air is clear when the truth
is that nobody is looking.

## Candidate evaluation

Probed 2026-08-20 with the repo's own User-Agent. Status and payload are
measured, not estimated.

| Candidate            | HTTP | Payload    | Verified response                  |
| -------------------- | ---- | ---------- | ---------------------------------- |
| Frankfurter (ECB) FX | 200  | **83 B**   | `GBP→EUR 1.1665, USD 1.3626`       |
| UK carbon intensity  | 200  | **187 B**  | forecast slot `21:30–22:00Z`       |
| Open-Meteo Marine    | 200  | **381 B**  | wave height + sea surface temp     |
| Nager.Date holidays  | 200  | 2.4 KB     | `Summer Bank Holiday, 2026-08-31`  |
| NOAA Kp forecast     | 200  | 6.9 KB     | 3-day planetary K series           |
| USGS quakes (bbox)   | 200  | 1.2 KB     | radius-scoped query                |
| SpaceDevs launches   | 200  | 1.2 KB     | 363 upcoming                       |
| dictionaryapi.dev    | 200  | 460 B      | definition returned                |
| Wikipedia featured   | 200  | **288 KB** | article + media                    |
| RSS (BBC News)       | 200  | 27 KB      | plain XML, keyless by construction |

Two endpoint choices are already decided by gate 6. NOAA's 1-minute Kp feed is
**28 KB** against **6.9 KB** for the forecast endpoint, and USGS's global feed is
**36 KB** against **1.2 KB** for a radius-scoped query. Both differences are pure
waste on a solar budget.

### Recommended

**Currency / FX — build this first.** The ECB publishes reference rates **once
per day**, around 16:00 CET. That makes it the only candidate whose upstream
cadence _equals_ the device's, rather than exceeding it. Every weather-family box
is throttled by a TTL because upstream moves faster than the panel does; FX has
no such waste — each pull gets exactly one new fact, and there is never a staler
or fresher answer to be had. At 83 bytes it is the cheapest live box in the set
by an order of magnitude, and it reuses the `stocks` hero-plus-delta layout.

Durability is unusually good: Frankfurter is a thin wrapper over ECB data, and if
it disappears the ECB publishes the same series as raw XML. The dependency is on
a central bank, not a hobby project.

Serves expats, cross-border freelancers, and travellers — an audience that
currently has nothing on this device.

**RSS headlines — highest value, highest care.** One box type covers news, a
blog, a podcast, GitHub releases, a council's school-closure feed. It is keyless
_by construction_: the user brings the URL, so there is no provider relationship
to maintain and nothing to revoke. It passes gates 1, 2, 3, 4 and 6 outright,
and gate 5 trivially.

It is nonetheless the only candidate here that is not a small job, for two
reasons. `@infobento/data` is DOM-free by contract (RFC 0001), so XML parsing
needs a small hand-rolled reader or a carefully chosen dependency. And it
introduces a fetch of a user-supplied URL — see the SSRF section, which is the
actual gating work.

**Public holidays.** Cheap, ~100 countries, and _automatic_ where the existing
`countdown` box requires the owner to type a date and maintain it. "Summer Bank
Holiday, in 11 days" appears without anyone tending it. Content changes rarely
but the derived countdown changes daily, which satisfies gate 2 by the same logic
that justifies `countdown` itself.

### Conditional on location

**Carbon intensity (UK).** The most _actionable_ candidate on the list: "Grid: 87
g/kWh — low. Good time to run the dishwasher." It converts a passive display into
something that changes a decision, and it sits naturally beside a solar-powered
product's positioning. Official National Grid ESO data, 187 bytes.

Strictly UK-only. Germany and Austria would need a separate provider
(aWATTar/Energy-Charts); most countries have nothing comparable and keyless. That
argues for shipping it as an explicitly regional box rather than pretending to
global coverage — and `FALLBACK_LOCATION` is already `London, UK`, so the bias is
consistent with the product as it stands.

**Marine — waves and sea temperature.** The lowest marginal cost of any candidate:
same Open-Meteo family, so it reuses the geocode path, the client pattern, and
the `readCurrent` guard added in v0.37.0. Real value for surfers, swimmers,
sailors and coastal residents; none at all inland. A cheap box for a passionate
minority.

**Aurora (Kp) — deferred, not rejected.** Passes every gate on the merits and is
genuinely delightful above roughly 55°N. Deferred purely on audience size: below
that latitude it is a box that says "no" every day, which fails gate 2 in
practice even though the underlying data is changing. Reconsider if the device
sells into Nordic markets.

### Rejected

**Word of the day.** dictionaryapi.dev has no word-of-the-day endpoint — you
define a word you already chose. Shipping it means shipping a word list, which
makes the box semi-static: the `calendar`/`habit` failure, gate 1.

**Space launches.** Fails gate 5. A third-party aggregator with a ~15 req/hour
anonymous limit and a history of instability, wrapped around content that is fun
rather than useful. This is `joke`'s profile almost exactly, and #211 already
answered it.

**Wikipedia featured article.** 288 KB, and the format is prose-and-image that
does not reduce to a hero value — gates 3 and 6. `onthisday` already occupies the
Wikipedia niche at a size that works.

**Earthquakes.** Fails gate 2 for nearly everyone: the honest answer most days,
in most places, is "nothing happened". Value spikes only in seismic regions, and
a box that is blank 360 days a year is worse than no box.

**River discharge (Open-Meteo Flood).** Keyless and working, but it returns m³/s,
which is meaningless to a lay reader without a historical baseline. Could pass
gate 3 with percentile framing ("higher than 90% of days") — reconsider only with
that framing, not as a raw number.

## New risk: user-supplied URLs

Checked specifically: **no current provider fetches a user-supplied URL.** Every
one targets a hardcoded domain — Open-Meteo, Nominatim, Wikimedia, Yahoo,
api-ninjas, quotable, ipapi.co. The RSS box would be the first, and it makes the API server
a request proxy on behalf of an authenticated user.

That is a real SSRF surface, and it matters more here than in a typical web app
because `packages/api` is Node-bound and sits alongside SQLite holding account
and device records. Minimum bar before any box accepts a URL:

- **Scheme allowlist** — `https:` only, no `http:`, `file:`, `gopher:`, `data:`.
- **Address filtering** — resolve first, then reject loopback, link-local
  (169.254.0.0/16, including cloud metadata at 169.254.169.254), and RFC1918
  ranges. Re-check _after_ each redirect, not only on the original URL.
- **Redirect cap** — a small maximum, with the address check reapplied per hop.
- **Response size cap** — stream and abort past a ceiling; do not trust
  `Content-Length`.
- **Timeout** — bounded, so a slow feed cannot occupy a request slot.
- **No credential forwarding** — the fetch carries no session cookie or header
  from the caller.

This belongs in one shared helper in `@infobento/data`, written once and tested
directly, rather than inline in a provider. It is the reason RSS is recommended
_and_ sequenced behind the other two.

This has since shipped as `safeFetch()` in `packages/data/src/safe-fetch.ts`
(#225, closing #224) — ahead of the RSS box itself, since the guard is
independently valuable infrastructure. It is not yet called by any provider;
none of the domains above go through it, since none fetch a user-supplied URL
today. It exists so the RSS box has it on day one.

## Provider durability audit

Three shipped boxes rest on foundations that are not official, documented
sources.

**`horoscope` → api-ninjas.** `packages/data/src/horoscope.ts` sends no
`X-Api-Key` header, yet api-ninjas documents that header as required. The
endpoint returned 200 keyless on 2026-08-20, so the box works today — but this
looks like an unintentional allowance rather than a free tier. If it closes, the
provider returns non-OK, the resolver returns `null`, and the API route falls
back silently to a bundled evergreen reading (`pickFallbackHoroscope()`, marked
`fallback: true`) with nothing in the logs to say why. That failure is subtler
than a genuine absence: the box keeps showing plausible content, so the upstream
outage is invisible to the user rather than surfacing as "No data".

**`stocks` → Yahoo.** `query1.finance.yahoo.com` is an undocumented internal
endpoint with no stability guarantee. It has been reliable for years; that is
not the same as being supported.

**`quote` → kurokeita's quotable mirror.** `packages/data/src/quote.ts` fetches
`api.quotable.kurokeita.dev`, a community-maintained mirror of the defunct
quotable.io. This is exactly the "community wrapper" tier gate 5 ranks below an
official publisher — durable enough to have shipped, but with no
organisation obligated to keep it running.

None needs action today. All three should be listed as at-risk. The `quote`
provider is already the community-wrapper case gate 5 warns about, so the
right reading is not "no precedent exists" but "one already does — do not add
a fourth without mitigations."

## Rollout / phasing

1. **Currency / FX.** Self-contained, no new infrastructure, highest
   cadence-fit. Good first proof of the rubric.
2. **Public holidays.** Also self-contained; can run in parallel.
3. **Fetch guard.** ✅ Shipped as `safeFetch()` in `packages/data/src/safe-fetch.ts`
   (#225, closing #224) — the shared SSRF helper with its own adversarial
   tests, independently valuable enough to land ahead of RSS.
4. **RSS headlines.** Depends on 3.
5. **Regional boxes** — carbon intensity, marine — as demand justifies.

Steps 1 and 2 are the ones that prove whether the rubric is doing real work.

## Alternatives considered

**Weight the gates and take a total.** Rejected: it is exactly what would have
saved `calendar`. A static box can score well on glanceability and cost and
survive on points, when the correct answer is that a box which cannot change is
disqualified regardless of its other merits. Hard gates encode that.

**Only add boxes reusing existing providers.** The `uv` precedent is genuinely
the cheapest kind of addition, and marine would qualify. But it optimises for
implementation cost over user value, and the strongest candidate here — FX —
needs a new provider and would be excluded on a rule that has nothing to do with
whether anyone wants it.

**Generic "webhook/JSON" box** — user supplies a URL and a JSONPath. Maximum
flexibility, and it subsumes RSS. Rejected for now on gate 3: the box's content
becomes whatever the user's expression returns, so nothing can be laid out or
validated ahead of time, and every rendering decision falls to someone editing a
config field. It also carries the same SSRF surface with none of RSS's
predictable shape.

## Open questions

1. **Does FX need a delta?** A rate without a comparison is a number without
   meaning. Previous-close is one extra call — or Frankfurter's time-series
   endpoint in one. Worth confirming the cost before designing the layout.
2. **How does a regional box present itself outside its region?** Carbon
   intensity in Portugal should say so, not render blank or wrong. Does the
   editor hide it, or does the box render an explicit "not available here"?
3. **Should the rubric gate the _existing_ set on a schedule?** #211 was a
   one-off pass. An annual re-score would catch a provider decaying into
   uselessness before a user notices.
4. **RSS item count** — one headline or three? Three is more useful and costs
   height in a layout whose row count is capped by `MAX_ROWS`, a value
   `packages/core/src/layout.ts` derives from display height and font size
   (clamped between 4 and 10) — not a fixed constant.

## Testing

Each new provider follows the `@infobento/data` pattern established in RFC 0001
and reinforced by the v0.37.0 fixes:

- Stubbed `fetch`; no network in unit tests.
- **Explicit coverage of the 200-with-error-payload case.** This is not
  hypothetical — Open-Meteo answers bad requests with HTTP 200 and
  `{"error":true,...}`, which threw a `TypeError` that the outer `catch`
  flattened into an indistinguishable `null`, caching a false negative for a full
  TTL. Every new provider gets that test.
- Renderer tests must place the box at a **non-zero `y`**. The `y = 0` fixture
  masked a real overdraw bug in both new boxes through three review rounds, and
  two pre-existing tests were passing _because_ of it (see #218). The rule is
  not yet enforced: 11 existing renderer test files still use `y: 0`
  (`qr`, `sun`, `moon`, `date`, `onthisday`, `horoscope`, `countdown`,
  `stocks`, `progress`, `aqi`, `quote`). `aqi` is tracked in #218; the other 10
  are tracked in #227.
- The fetch guard gets direct adversarial tests: redirect-to-localhost,
  DNS-rebinding shape, oversized body, slow-loris timeout.

## Security & privacy

- **No keys, still.** Every recommendation is keyless, so nothing here changes
  the "no accounts, no API keys" property or adds a secret to deploy.
- **Location leakage is unchanged in kind but wider in surface.** Each new
  location-scoped box sends a coordinate to one more third party. Marine reuses
  Open-Meteo, so it adds no _new_ party for a user who already runs weather;
  carbon intensity contacts National Grid ESO (`api.carbonintensity.org.uk`), a
  party neither weather nor marine touches; holidays sends a country code only.
- **RSS is the exception and deserves the caution.** The feed URL is
  user-authored data that the server dereferences, and the fetched content is
  rendered onto a device. Both directions need treating as untrusted: the request
  by the fetch guard above, the response by escaping and length-capping before it
  reaches the framebuffer.
- **No new PII at rest.** None of these boxes store anything per-user beyond the
  config already held in SQLite.
