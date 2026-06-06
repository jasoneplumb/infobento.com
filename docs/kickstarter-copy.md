# InfoBento — Kickstarter Copy

# InfoBento — _See what matters. Skip the spiral._

A calm 5.76" B&W eInk bento dashboard that senses the room. Glance at what matters — weather, your next event, a countdown — on a still, reflective screen that never glows or pulls at you. And because InfoBento carries a Core AQ + Presence sensor bundle, it quietly watches the air you breathe and takes over the screen only when the room actually needs you.

---

## Hero subhead

> Most of the time your phone holds your whole life beautifully. Sometimes you just want to know if it's going to rain — or whether the air in the room you've been sitting in for two hours is still good — without opening five apps and resurfacing twenty minutes later. **InfoBento is the calm B&W screen for that moment.**

---

## What it is

InfoBento is a small B&W eInk display in a thin white frame that sits on a kitchen counter, a desk, or a shelf. It shows the things you check most often — weather, your next meeting, the countdown to your trip, a quote that lifts the room — in calm B&W eInk, visible from across the room. Build a glanceable multi-box grid of up to ten boxes, configured once in a browser at infobento.com.

It runs on light. The upper portion of the back is a small solar panel. Set it near a window with indirect light and the device charges itself. No cable. No outlet. No batteries to swap. It refreshes once or twice a day — by design. Stillness is the feature.

But InfoBento does one thing no calm dashboard has done before: **it senses the room.** Inside is a Core AQ + Presence sensor bundle — CO2, VOC/IAQ, and particulate matter, paired with presence detection. When the air goes bad and someone is actually in the room breathing it, InfoBento escalates: a high-priority box, then a full-screen alert takeover. When the room is empty, it stays calm.

**See what matters. Skip the spiral.**

---

## The one thing every other air-quality monitor gets wrong

Air-quality monitors alarm at the air, not at you. They light up an empty kitchen at 3am. They miss the child sitting still in their bedroom because a cheap PIR motion sensor sees no movement.

InfoBento is **presence-aware.** Alerts escalate only when someone has actually been breathing the bad air for **30 minutes or more.** An mmWave radar sees the still child a PIR misses. An empty room never triggers. You get alerted to real exposure — not noise.

That's the moat. Everyone else measures air. InfoBento contextualizes exposure by occupancy.

---

## How it compares

We're not competing with pixel-art dashboards. We're the calmest, cheapest, smartest member of the air-quality monitor set — and the only one that knows whether anyone is in the room.

| Monitor             | Price        | CO2 | VOC/IAQ | PM  | Presence-aware | Dashboard |
| ------------------- | ------------ | --- | ------- | --- | -------------- | --------- |
| **InfoBento**       | **$129–179** | Yes | Yes     | Yes | **Yes**        | **Yes**   |
| Aranet4             | $249         | Yes | No      | No  | No             | No        |
| AirGradient ONE     | $269         | Yes | Yes     | Yes | No             | No        |
| Awair Element       | $299         | Yes | Yes     | Yes | No             | No        |
| AirThings View Plus | $299         | Yes | Yes     | Yes | No             | No        |

The cheapest, the most attractive, the only one that escalates by occupancy — and it doubles as a glanceable dashboard the rest of the day.

---

## What's inside

- **Display:** Good Display GDEH0576T81 — 5.76" B&W eInk, 920×680 px, 198 DPI, SSD2677 driver, 2-bit grayscale (4 levels)
- **Air quality:** Sensirion **SCD41** (CO2 / temperature / humidity), Bosch **BME688** (VOC / IAQ), Sensirion **SEN54** (PM1 / PM2.5 / PM10)
- **Presence:** HLK-LD2410C **mmWave** radar (sees stillness) + **AM312 PIR** (motion)
- **Interaction:** LIS3DH accelerometer for **knock-to-dismiss**, tactile button for alert acknowledgment, SK6812 RGB LED for across-room glance
- **Connectivity:** ESP32-C3 Wi-Fi — configured from any web browser, no companion app
- **Power:** solar panel + ~2000 mAh LiPo, runs cable-free; refreshes 1–2× per day
- **Form factor:** monolithic white body, thin bezel, body-as-stand with a fold-out kickstand for a ~12–15° tilt

---

## What you can put on it

Build your grid from up to ten boxes, configured once at infobento.com:

- **Weather** — current conditions for any location worldwide
- **3-hour forecast** — next three hours of temperature and conditions
- **Next event** — your next meeting or appointment
- **Countdown** — days, hours, minutes to a date that matters
- **Quote** — pick your own or pull a random one
- **QR code** — for your portfolio, business card, or wifi password
- **Plain text** — write your own

And always-on in the background: a **CO2 / air-quality box** that surfaces an alert and takes over the screen when the room needs attention.

Mix and match. A few boxes for a calm layout, ten for a dense one.

---

## Privacy is hardware-enforced

A monitor that watches the room you breathe in had better take privacy seriously. InfoBento does — in hardware, not promises.

- **Readings stay on-device.** Air-quality and presence data are processed locally. The cloud renderer that draws your dashboard never sees a sensor reading.
- **A physical kill switch.** A slider on the back panel physically cuts power to the radar. Off is off — not a software toggle.
- **No accounts. No telemetry. No subscriptions. No app.** Ever.

---

## Pledge tiers

| Tier            | Pledge | What you get                                                                                        |
| --------------- | ------ | --------------------------------------------------------------------------------------------------- |
| **Early Bird**  | $129   | One InfoBento + free worldwide shipping. First 500 backers.                                         |
| **Standard**    | $159   | One InfoBento + free worldwide shipping.                                                            |
| **Gift Pair**   | $299   | Two InfoBentos + free worldwide shipping.                                                           |
| **Studio Pack** | $999   | Eight InfoBentos + free worldwide shipping. For an office, a school, a thoughtful gesture at scale. |

---

## Risks & honesty

- **Hardware:** off-the-shelf parts throughout — the GDEH0576T81 panel, ESP32-C3, named Sensirion/Bosch sensors, and a standard solar harvester — with documented sourcing. No custom silicon, no exotic materials.
- **Software:** the web editor and rendering pipeline already work at infobento.com. You can use it today before you back. The cloud API is a single small stateless server — boring, well-understood, repairable.
- **Long-term:** if InfoBento ever winds down, the device keeps showing its last frame indefinitely, and the cloud architecture is documented and minimal so a third party (or you) could rehost it. We don't want to be a Pebble.

---

## Try it now

[**Open the editor at infobento.com →**](https://infobento.com)

Configure boxes, see the live B&W preview, save. No account, no signup, no email capture. This is the actual editor that will configure the production device.

---

## FAQ

**Do I need an app?** No. Everything is configured in a web browser. There's no app to install and no account to create.

**Does it need to be plugged in?** No. The solar panel tops up a rechargeable battery. Set it near a window with indirect light and it runs cable-free.

**How often does the screen change?** Once or twice a day for the dashboard — by design. Air-quality alerts can take over the screen the moment real exposure is detected.

**Will it alarm at an empty room?** No. Alerts escalate only when someone has actually been in the room breathing the bad air for 30 minutes or more.

**Where does my sensor data go?** Nowhere. Air-quality and presence readings stay on-device. A physical slider on the back cuts radar power entirely.
