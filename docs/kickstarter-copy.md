# InfoBento — Kickstarter Copy (working draft)

> **Status:** working draft, 2026-04-22. Iterate freely; this is the canonical source.
> **Issue:** #38 (Phase 5: campaign rewrite)
> **Cross-references:** `.tux/project.json` → "Market & Distribution" note (high-level positioning), RFC #25 (pivot context)

The draft below is a legacy working artifact. Round 18 (2026-06-06) is now the canonical direction, superseding the Round 17 (2026-05-07) 2.13" "tiny dashboard" pivot: a **5.76" multi-box bento dashboard** with **Core AQ + Presence**, on a Good Display **GDEH0576T81** B&W eInk panel (920×680, 198 DPI, SSD2677, 2-bit grayscale), ESP32-class controller, Wi-Fi.

The framing also incorporates the "Tidbyt vs InfoBento — still vs kinetic" differentiation conversation. Each section is self-contained so you can rearrange or excerpt for the Kickstarter page, pre-launch landing page, or press kit.

---

## Product update — 2026-04-29 (presence-aware AQ-monitor pivot)

> Superseded by Round 18. This Round 14/15/16 AQ-monitor pivot remains useful context for the sensor/privacy story, but no longer defines the display size, product category, or campaign lead — Round 18 restores the 5.76" multi-box bento dashboard as the lead.

As of 2026-04-29 InfoBento is repositioned as a **calm air-quality monitor with a built-in dashboard, not a dashboard with sensors.** Three named sensors carry the pitch — Sensirion **SCD41** (NDIR CO2, the same chip Aranet4 uses), Bosch **BME688** (VOC/IAQ + pressure), and Sensirion **SEN54** (PM1/PM2.5/PM10) — paired with **HLK-LD2410C mmWave presence detection** behind a hardware privacy switch, an **LIS3DH accelerometer** for tap-to-dismiss, one front button for alert acknowledgment, and a dimmable RGB LED for across-room glance. The presence sensor unlocks the single feature no other AQ monitor can match: **alerts escalate only when someone has actually been breathing the bad air for ≥30 minutes.** A child sitting still in their bedroom counts (PIR alone misses them); an unattended kitchen at 3am does not. A pocket SKU is reserved for v2, BLE-paired with the counter unit so a child's away-from-home exposure syncs to the home's daily timeline on return. New competitor set: not TRMNL or Seeed reTerminal E (we concede the dashboard category to them) but **Aranet4** ($249, CO2-only), **AirGradient ONE** ($269, hobby IAQ), **Awair Element** ($299, consumer), and **AirThings View Plus** ($299, +radon). InfoBento at **$129–$179** is the cheapest, the most attractive, and the only one that contextualizes exposure by occupancy.

The body below — solar narrative, Tidbyt comparison, "small B&W eInk decorator" framing — is preserved as a working artifact for excerpting and reference, but the next full rewrite of this file should lead with the Round 18 5.76" bento-dashboard direction.

---

## Product update — 2026-05-07 (Round 17 compact dashboard pivot — SUPERSEDED)

> Superseded by Round 18 (2026-06-06). The 2.13" "tiny dashboard / mini grid" framing below is historical only — InfoBento never moved off the 5.76" panel in firmware or tooling. Retained for context; do not cite as a current spec.

Round 17 briefly reframed InfoBento as a tiny 2.13" mini-grid dashboard. That direction is dropped. The Core AQ + Presence sensor story it introduced is kept, but the display and product shape return to the 5.76" multi-box bento dashboard (see the Round 18 update above).

---

## Product update — 2026-06-06 (Round 18 — 5.76" bento dashboard with Core AQ + Presence)

InfoBento is a **5.76" bento dashboard that senses the room**. The Good Display **GDEH0576T81** B&W eInk panel (920×680 px, 198 DPI, SSD2677 driver, 2-bit grayscale / 4 levels, 156,400-byte framebuffer) gives you a full multi-box grid — up to ten boxes across multiple columns, big glanceable numbers, configured once at infobento.com. When the room needs attention, a high-priority box or a full-screen alert takeover takes over the whole panel. Refreshes 1–2× per day; an ESP32-class controller with Wi-Fi sets up over a captive portal. Solar panel on the upper back tops a rechargeable battery, so it runs cable-free. White housing, ~14×11 cm, thin bezel (≤4 mm), body-as-stand at a ~12–15° tilt.

The Core AQ + Presence bundle carries the sensing story: Sensirion **SCD41** (CO2/T/RH), Bosch **BME688** (VOC/IAQ), and Sensirion **SEN54** (PM1/PM2.5/PM10), paired with an **HLK-LD2410C** mmWave presence sensor and **AM312** PIR behind a hardware privacy switch, an **LIS3DH** accelerometer for knock-to-dismiss, a tactile button for alert acknowledgment, and a dimmable RGB LED for across-room glance. Presence is the differentiator: alerts escalate only when someone has actually been breathing the bad air. Every reading stays on-device — nothing leaves the room. See what matters. Skip the spiral.

---

## Why this isn't a cheaper Tidbyt (positioning preamble — keep out of the page itself)

The price difference ($30-40 vs $179) is real but it's not the differentiator. If you only beat Tidbyt on price, smart shoppers will assume you're a worse Tidbyt. You have to articulate that **you're not in the same product category at all.**

| Dimension        | Tidbyt                              | InfoBento                                      |
| ---------------- | ----------------------------------- | ---------------------------------------------- |
| **Display tech** | RGB LED matrix (emissive, animated) | B&W eInk (reflective, still, 2-bit grayscale)  |
| **Resolution**   | 64×32 = 2,048 pixels (pixel art)    | 920×680 (198 DPI)                              |
| **Refresh**      | Continuous, 30+ fps                 | ~0.75s full / ~0.3s partial, 1-2× per day      |
| **Power**        | Plugged in always (~2-5W LEDs)      | Solar-charged, no cable                        |
| **Aesthetic**    | Retro pixel art, GameBoy/arcade     | Soft printed-poster feel                       |
| **Form factor**  | Wooden box, needs outlet, ~6"×3"    | Vertical white frame, sits anywhere with light |
| **Config**       | Mobile app + marketplace            | Web-only, curated box types                    |
| **Subscription** | Optional $3/mo premium tier         | None                                           |
| **At night**     | Glowing                             | Invisible (no emission)                        |

**The one-liner:** _Tidbyt is a screen. InfoBento is a surface._ Tidbyt is alive — pixels move, content animates, your eye catches the motion. InfoBento doesn't move. The fact that it doesn't change is the feature.

This maps to the tagline. Tidbyt's continuous animation is itself a small spiral. InfoBento's stillness is the antidote.

---

## Headline

# InfoBento — _See what matters. Skip the spiral._

A small B&W eInk decorator for the room. Configure once on the web; sips light from the window for months.

---

## Hero subhead

> Most of the time your phone holds your whole life beautifully. Sometimes you just want to know if it's going to rain — without opening five apps and resurfacing twenty minutes later. **InfoBento is the calm B&W screen for that moment.**

---

## What it is (~250 words)

InfoBento is a small B&W eInk display in a thin white frame that sits on a kitchen counter, a desk, or a shelf. It shows the things you check most often — weather, your next meeting, the countdown to your trip, a quote that lifts the room — in calm B&W eInk, visible from across the room.

It runs on light. The upper portion of the back is a small solar panel. Set it near a window with indirect light and the device charges itself. No cable. No outlet. No batteries to swap.

Configure your boxes once on a web page. Pick what matters to you, drag them where you want, type in your city. Save. The device picks up the new config on its next refresh and shows it. Two years later, if you change your mind, you change it the same way.

There's no app to install. No account to create. No subscription. The device doesn't track you, doesn't learn from you, doesn't push notifications. It refreshes once or twice a day — by design. Stillness is the feature. The fact that it doesn't move when you look at it is exactly why you can leave your phone face-down sometimes.

It's designed to survive a four-foot drop onto a hard floor (we tested), built around a soft polymer bumper and a recessed display. The reset is a recessed pinhole on the back — paperclip, five seconds, done. That's the entire user manual.

**It's not trying to replace your phone or shame you for using it. It's a small calm surface that lets you skip the spiral when all you needed was a glance.**

---

## How it's different

Three honest comparisons. The point isn't that InfoBento is cheaper — it's that it's a different kind of object.

**Compared to LED-matrix displays (Tidbyt, LaMetric, Vestaboard):**
Those are alive. Pixels move, content animates, the screen glows. That's a real choice some people want — a tiny arcade in the kitchen. InfoBento is the opposite. B&W eInk. Doesn't move. Doesn't glow. The stillness is the point.

**Compared to DIY eInk frames (Inkplate, Pimoroni Inky):**
Same aesthetic, but you don't have to write Python or solder anything. InfoBento ships assembled, drop-tested, solar-powered, and configured from a web browser. The DIY kits are wonderful for people who want a project. InfoBento is for people who just want the object on their counter.

**Compared to digital photo frames:**
Smaller, calmer, useful. It doesn't loop your wedding photos — it shows what matters today.

---

## Specs

- **Display:** B&W eInk, 2-bit grayscale (4 levels), 920×680, 198 DPI (GDEH0576T81)
- **Power:** solar panel + 100mAh LiPo (refreshes 1-2× per day)
- **Connectivity:** Wi-Fi (no companion app needed, configured from any web browser)
- **Setup:** captive portal — join the device's network from your phone or laptop, enter your home Wi-Fi, done
- **Recovery:** recessed pinhole reset on the back — paperclip, 5 seconds
- **Form factor:** monolithic body in white, thin bezel (≤4mm), the body is the stand
- **Drop survival:** designed for a four-foot drop onto hardwood (tested)
- **No accounts, no telemetry, no subscriptions, no app — ever**

---

## What you can put on it (day one)

Six core box types, all working today on the demo at infobento.com (shipping with 6 core box types; 17 types available in the web editor):

- **Weather** — current conditions for any location worldwide (try "Mt. St. Helens")
- **3-hour forecast** — next three hours of temperature and conditions
- **Countdown** — days, hours, minutes to a date that matters
- **Quote** — pick your own or pull a random one
- **QR code** — for your portfolio, business card, or wifi password
- **Plain text** — write your own

Mix and match. Three boxes for a calm layout, six boxes for a dense one.

---

## What we're not building (and why)

Honesty up front:

- **No native iPhone or Android app.** Web-only, by design. Adds 6+ months and removes nothing the product needs.
- **No calendar integration in v1.** We're not asking for your Google or Microsoft account. Maybe in v2.
- **No notifications, no message counts, no real-time anything.** Refreshes happen 1-2× per day. If you want a screen that pulls at you continuously, you already have one in your pocket.
- **No marketplace of community apps.** Six box types, curated, all useful. We can add more if backers want, but we're not going to build a developer ecosystem just to have one.

These choices keep the device calm, keep the BOM small, keep the price under $50, and keep the device useful for years instead of dependent on whether we keep a particular API live.

---

## What backing gets you

| Tier            | Pledge | What you get                                                              |
| --------------- | ------ | ------------------------------------------------------------------------- |
| **Early Bird**  | $30    | One InfoBento + free worldwide shipping. Limited to first 500 backers.    |
| **Standard**    | $35    | One InfoBento + free worldwide shipping.                                  |
| **Gift Pair**   | $65    | Two InfoBentos. One for you, one for someone you love.                    |
| **Studio Pack** | $250   | Eight InfoBentos. For an office, a school, a thoughtful gesture at scale. |

_Reward tiers and pricing finalized after manufacturing partner quote. Above is the working draft._

---

## Risks & honesty

We've worked through three categories of risk that have killed similar Kickstarter projects:

- **Hardware:** we've chosen off-the-shelf parts (B&W eInk panel, ESP32-C3, AEM10941 solar harvester) with documented sourcing. No custom silicon. No exotic materials. The hardest engineering bet — getting drop survival on a thin-bezel design — has a documented protocol and prototype budget.
- **Software:** the entire web editor and rendering pipeline is already working at infobento.com. You can use it today before you back. The cloud API is one Hono server on a small DigitalOcean droplet — boring, well-understood, repairable.
- **Long-term:** if InfoBento ever winds down, the device is designed to keep showing its last frame indefinitely. The cloud architecture is documented and minimal so a third party (or you) could rehost it. We don't want to be a Pebble.

Timeline: we've broken the project into explicit phases, each tracked publicly on GitHub. We expect to ship within [X] months of campaign close.

---

## Try it now

[**Open the editor at infobento.com →**](https://infobento.com)

Configure boxes, see the live B&W preview, save, share the JSON. No account, no signup, no email capture. This is the actual editor that will configure the production device.

---

## About us

[Founder bio here — Daily Glancer himself, building for himself first. The story of why this exists at all.]

---

## Notes for iteration

- **Founder bio** needs writing. Should establish credibility (technical depth) without being intimidating.
- **Timeline** depends on the panel SKU decision (#35) and the manufacturing-partner quote.
- **Hero photography** can't be drafted until prototype hardware exists (gated on #34 SCAD + #35 panel order).
- **Tier pricing** is a draft; revisit after the manufacturer quote lands. The $30 early-bird is the strongest signal of "Kickstarter discount" but only works if BOM lands at ~$15-20.
- **Stretch goals** intentionally not specified above — leave them for the campaign team to design once funding momentum is observable.
- **Risks section** could grow into a more substantive "what could go wrong" section if backers reward transparency. Some Kickstarter audiences love seeing the risk register; others find it scary. A/B test the depth.
