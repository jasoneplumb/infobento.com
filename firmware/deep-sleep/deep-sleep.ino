// InfoBento firmware — Phase 4: deep sleep + RTC wake (reTerminal E1001).
//
// This is the "first working firmware" milestone — it makes the 1–2 refreshes/day
// solar/battery budget real. The whole device lifecycle is ONE wake cycle:
//
//   power-on / RTC-timer wake
//     -> connect Wi-Fi
//     -> GET /api/device/<id>/frame?orientation=landscape with If-Modified-Since
//     -> 304: panel untouched (the expensive op is skipped) -> deep sleep
//     -> 200: read frame, translate, draw, cache Last-Modified  -> deep sleep
//     -> esp_deep_sleep_start() for IB_SLEEP_SECONDS
//
// ESP32 deep sleep clears RAM and reboots into setup() on wake, so there is no
// loop(): the cycle lives entirely in setup() and ends in deep sleep. Only
// RTC_DATA_ATTR variables survive a sleep — the framebuffer does NOT, so it is
// re-fetched fresh on every 200 wake (no stale-buffer carryover to worry about).
//
// The cached Last-Modified token DOES survive in RTC slow memory, so a wake that
// gets a 304 returns straight to sleep without an eInk refresh — that 304-skip is
// the entire power win, and it depends on the RTC token persisting correctly.
//
// UC8179 grayscale driver is vendored from the Phase 3 device-pull sketch
// (Seeed_GxEPD2 GxEPD2_reTerminal_E1001_Gray4), with ONE deliberate divergence for
// battery safety: checkBusy() is bounded by a timeout (see below) instead of looping
// forever — a stuck panel must not drain the cell on an unattended device. The init
// sequence, LUTs, and waveform polarity are otherwise unchanged. It is still duplicated
// across the
// bench sketches; see firmware/README.md "Forward plan" for why the shared-library
// extraction is deferred (no way to share a header across sibling sketch folders
// without breaking the documented zero-flag `arduino-cli compile firmware/<sketch>`).
//
// Board:  esp32:esp32:esp32s3
// Upload: arduino-cli upload -p /dev/cu.usbserial-1430 \
//           --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/deep-sleep

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <esp_sleep.h>
#include "secrets.h"

#define EPD_SCK_PIN 7
#define EPD_MOSI_PIN 9
#define EPD_CS_PIN 10
#define EPD_DC_PIN 11
#define EPD_RES_PIN 12
#define EPD_BUSY_PIN 13
#define EPD_W 800
#define EPD_H 480
#define IB_FRAME_LEN (EPD_W * EPD_H / 4)  // 96000

// Wake cadence FALLBACK — used only until the server tells us otherwise. The
// frame response's X-Refresh-Interval header (driven by the editor's Refresh
// setting, issue #152) overrides this at runtime via g_sleepSeconds, so a unit's
// cadence can change with no reflash. This build constant applies on cold boot
// before the first pull, and whenever the server omits the header (refresh
// disabled / pre-#152 server). Bench: short, to watch the cycle live on serial.
// Production default: 28800 (8h, 3×/day). Stored in seconds; → µs below.
#ifndef IB_SLEEP_SECONDS
#define IB_SLEEP_SECONDS 30  // bench default. Production: 28800 (8h).
#endif

// Transport — HTTPS (production, default) vs plain HTTP (LAN dev server).
// Production (www.infobento.com) is HTTPS-only; a LAN dev API on
// http://<mac-ip>:4000 needs IB_API_TLS 0. Override in secrets.h.
// Note: deep sleep clears RAM, so every wake does a full TLS handshake (~1-3 s
// of active draw, no session reuse). Negligible at 1-2 wakes/day; if cadence
// ever rises, persist the TLS session ticket in RTC memory to resume.
#ifndef IB_API_TLS
#define IB_API_TLS 1  // 1 = https + WiFiClientSecure; 0 = http + WiFiClient
#endif

// ----- persisted across deep sleep (RTC slow memory, retained while RAM is cleared) -----
// HTTP-date Last-Modified is at most ~29 chars ("Wed, 21 Oct 2015 07:28:00 GMT");
// a fixed RTC buffer replaces the Phase 3 heap-allocated String, which cannot live
// in RTC memory. Zero-initialized on cold boot only (empty -> no If-Modified-Since
// -> first wake always 200-draws); retained verbatim across timer wakes.
RTC_DATA_ATTR char g_lastModified[48] = {0};
RTC_DATA_ATTR uint32_t g_bootCount = 0;
// Server-driven wake cadence (X-Refresh-Interval, seconds), adopted from the
// frame response so the editor's Refresh setting controls this device without a
// reflash. 0 = not yet learned -> fall back to the IB_SLEEP_SECONDS build
// default. Retained across deep sleep; clamped to [15s, 24h] on adoption.
RTC_DATA_ATTR uint32_t g_sleepSeconds = 0;

SPIClass hspi(HSPI);
SPISettings spiSet(2000000, MSBFIRST, SPI_MODE0);

static const uint8_t LUT_VCOM_GRAY[] = {
  0x00,0x00,0x06,0x08,0x07,0x01, 0x00,0x06,0x0A,0x0B,0x0A,0x01,
  0x00,0x03,0x03,0x00,0x00,0x03, 0x00,0x05,0x09,0x06,0x06,0x01,
  0x00,0x02,0x02,0x0A,0x0A,0x01, 0x00,0x0A,0x11,0x06,0x07,0x01,
  0x00,0x02,0x01,0x02,0x01,0x01 };
static const uint8_t LUT_WW_GRAY[] = {
  0x15,0x00,0x06,0x08,0x07,0x01, 0x54,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x2A,0x05,0x09,0x06,0x06,0x01,
  0xAA,0x02,0x02,0x0A,0x0A,0x01, 0x00,0x0A,0x11,0x06,0x07,0x01,
  0x28,0x02,0x01,0x02,0x01,0x01 };
static const uint8_t LUT_KW_GRAY[] = {
  0x2A,0x00,0x06,0x08,0x07,0x01, 0x59,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x5A,0x05,0x09,0x06,0x06,0x01,
  0xA8,0x02,0x02,0x0A,0x0A,0x01, 0x45,0x0A,0x11,0x06,0x07,0x01,
  0xA8,0x02,0x01,0x02,0x01,0x01 };
static const uint8_t LUT_WK_GRAY[] = {
  0x16,0x00,0x06,0x08,0x07,0x01, 0xA0,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x99,0x05,0x09,0x06,0x06,0x01,
  0xA0,0x02,0x02,0x0A,0x0A,0x01, 0x40,0x0A,0x11,0x06,0x07,0x01,
  0x20,0x02,0x01,0x02,0x01,0x01 };
static const uint8_t LUT_KK_GRAY[] = {
  0x26,0x00,0x06,0x08,0x07,0x01, 0x6A,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x65,0x05,0x09,0x06,0x06,0x01,
  0x50,0x02,0x02,0x0A,0x0A,0x01, 0x10,0x0A,0x11,0x06,0x07,0x01,
  0x10,0x02,0x01,0x02,0x01,0x01 };
static const uint8_t CMD_USER_GRAY[] = { 0x17,0x3F,0x3F,0x07,0x06,0x12 };

static uint8_t* g_fb = nullptr;  // 96000-byte frame buffer (RAM; not persisted across sleep)

// BUSY high = panel idle. Bounded wait (the vendored driver looped forever): on a
// deep-sleep battery device a stuck panel — hardware fault, brownout mid-sequence —
// would otherwise drain the cell with no recovery. 10 s covers the slowest documented
// full refresh; on timeout we warn and CONTINUE the sequence (no clean abort here —
// that is Phase 5 resilience scope). Continuing is safe across wakes: this cycle may
// produce a botched refresh, but the next wake's hardware reset (RES toggle in
// initGrayMode) re-initializes the panel, so no corrupted state persists. The point
// of the bound is solely to stop the infinite loop from killing the battery.
void checkBusy(uint16_t timeoutMs = 10000) {
  delay(10);
  unsigned long t0 = millis();
  while (!digitalRead(EPD_BUSY_PIN)) {
    if (millis() - t0 > timeoutMs) { Serial.println("[IB] WARN: BUSY timeout, continuing"); break; }
    delay(10);
  }
}
void writeCommand(uint8_t c) {
  hspi.beginTransaction(spiSet);
  digitalWrite(EPD_DC_PIN, LOW); digitalWrite(EPD_CS_PIN, LOW);
  hspi.transfer(c);
  digitalWrite(EPD_CS_PIN, HIGH); digitalWrite(EPD_DC_PIN, HIGH);
  hspi.endTransaction();
}
void writeData(uint8_t d) {
  hspi.beginTransaction(spiSet);
  digitalWrite(EPD_CS_PIN, LOW); hspi.transfer(d); digitalWrite(EPD_CS_PIN, HIGH);
  hspi.endTransaction();
}
void writeLUT(uint8_t c, const uint8_t* l, uint16_t n) { writeCommand(c); for (uint16_t i=0;i<n;i++) writeData(l[i]); }

void initGrayMode() {
  digitalWrite(EPD_RES_PIN, LOW); delay(10); digitalWrite(EPD_RES_PIN, HIGH); delay(10); checkBusy();
  writeCommand(0x01); writeData(0x07);
  writeData(CMD_USER_GRAY[0]); writeData(CMD_USER_GRAY[1]); writeData(CMD_USER_GRAY[2]); writeData(CMD_USER_GRAY[3]);
  writeCommand(0x30); writeData(CMD_USER_GRAY[4]);
  writeCommand(0x82); writeData(CMD_USER_GRAY[5]);
  writeCommand(0x06); writeData(0x27); writeData(0x27); writeData(0x28); writeData(0x17);
  writeCommand(0x04); delay(100); checkBusy();
  writeCommand(0x00); writeData(0x3F);
  writeCommand(0xE3); writeData(0x88);
  writeCommand(0x50); writeData(0x10); writeData(0x07);
  writeCommand(0x52); writeData(0x00);
  writeCommand(0x61); writeData(EPD_W>>8); writeData(EPD_W&0xFF); writeData(EPD_H>>8); writeData(EPD_H&0xFF);
  writeLUT(0x20, LUT_VCOM_GRAY, sizeof(LUT_VCOM_GRAY)); checkBusy();
  writeLUT(0x21, LUT_WW_GRAY, sizeof(LUT_WW_GRAY)); checkBusy();
  writeLUT(0x22, LUT_KW_GRAY, sizeof(LUT_KW_GRAY)); checkBusy();
  writeLUT(0x23, LUT_WK_GRAY, sizeof(LUT_WK_GRAY));
  writeLUT(0x24, LUT_KK_GRAY, sizeof(LUT_KK_GRAY));
}

// fb is panel-convention (0=black..3=white); upload keeps the example's internal
// `3 - gray` waveform inversion. Caller flips InfoBento->panel before this.
void uploadFrame(const uint8_t* fb) {
  const uint32_t bpr = EPD_W / 4;
  for (uint8_t plane = 0; plane < 2; plane++) {
    writeCommand(plane == 0 ? 0x10 : 0x13);
    hspi.beginTransaction(spiSet); digitalWrite(EPD_CS_PIN, LOW);
    for (uint16_t row = 0; row < EPD_H; row++) {
      const uint8_t* rp = fb + uint32_t(row) * bpr;
      for (uint16_t c8 = 0; c8 < EPD_W/8; c8++) {
        uint8_t out = 0;
        for (uint8_t b = 0; b < 8; b++) {
          uint16_t px = c8*8 + b;
          uint8_t sh = (3 - (px & 3)) * 2;
          uint8_t gray = 3 - ((rp[px/4] >> sh) & 0x03);
          uint8_t want = (plane == 0) ? (gray & 0x01) : (gray & 0x02);
          if (want) out |= (0x80 >> b);
        }
        hspi.transfer(out);
      }
    }
    digitalWrite(EPD_CS_PIN, HIGH); hspi.endTransaction();
  }
}
void refreshDisplay() { writeCommand(0x12); delay(100); checkBusy(); }
void sleepDisplay() { writeCommand(0x02); checkBusy(); writeCommand(0x07); writeData(0xA5); }

void drawFrame() {
  // InfoBento native (0=white..3=black) -> panel canvas (0=black..3=white): per-byte NOT.
  // In-place flip is safe here: g_fb was just filled from this wake's 200 response,
  // the RTC Last-Modified token was already cached (below) from the *header* (not the
  // buffer), and the buffer is freed + re-fetched next wake — nothing reads the
  // pre-flip bytes again.
  for (uint32_t i = 0; i < IB_FRAME_LEN; i++) g_fb[i] = ~g_fb[i];
  unsigned long t0 = millis();
  initGrayMode();
  uploadFrame(g_fb);
  refreshDisplay();
  sleepDisplay();
  Serial.printf("[IB] drew frame in %lu ms\n", millis() - t0);
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("[IB] Wi-Fi connecting to '%s' ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  // Clear any stuck/failed association state before re-begin — a radio left
  // half-connected (esp. on a cold deep-sleep wake) can otherwise fail to associate.
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) { Serial.print("[IB] Wi-Fi OK, IP "); Serial.println(WiFi.localIP()); return true; }
  Serial.println("[IB] Wi-Fi FAILED");
  return false;
}

// Read exactly len bytes from an active HTTP stream into buf. Bounded by BOTH a
// per-chunk idle timeout (resets on each chunk) and a hard total deadline, so a
// server trickling one byte just under the idle limit can't stall forever.
bool readExact(WiFiClient* s, uint8_t* buf, int len) {
  int got = 0;
  unsigned long idle = millis();
  const unsigned long start = millis();
  while (got < len && millis() - idle < 15000 && millis() - start < 60000) {
    int avail = s->available();
    if (avail > 0) { int n = (int)s->readBytes(buf + got, (size_t)min(avail, len - got)); got += n; idle = millis(); }
    else delay(1);
  }
  return got == len;
}

// Adopt the server's wake cadence from the X-Refresh-Interval header (seconds),
// if present and sane. Clamped to [15s, 24h] (matching the editor's range);
// absent/garbage leaves the prior cadence untouched, so a one-off missing header
// can't reset a configured device to the build default.
void adoptRefreshInterval(HTTPClient& http) {
  String ri = http.header("X-Refresh-Interval");
  if (!ri.length()) return;
  long secs = ri.toInt();
  if (secs <= 0) return;
  if (secs < 15) secs = 15;
  if (secs > 86400) secs = 86400;
  g_sleepSeconds = (uint32_t)secs;
  Serial.printf("[IB] refresh interval -> %lu s\n", (unsigned long)secs);
}

void pullOnce() {
  if (!ensureWifi()) return;
#if IB_API_TLS
  String url = String("https://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frame?orientation=landscape";
  WiFiClientSecure client;
  // Skip TLS cert validation — acceptable for a single device on a trusted
  // network. The device id is the bearer secret in the URL, so an on-path
  // attacker on the device's Wi-Fi could capture it without verification;
  // pin the ISRG Root X1 CA via client.setCACert(...) to harden (see #145).
  client.setInsecure();
#else
  String url = String("http://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frame?orientation=landscape";
  WiFiClient client;
#endif
  HTTPClient http;
  http.begin(client, url);
  const char* collect[] = { "Last-Modified", "X-Refresh-Interval" };
  http.collectHeaders(collect, 2);
  if (g_lastModified[0]) http.addHeader("If-Modified-Since", g_lastModified);
  int code = http.GET();
  Serial.printf("[IB] GET -> %d\n", code);
  // Adopt the server's wake cadence regardless of 200/304 — the device should
  // re-time its sleep even when the frame itself is unchanged.
  adoptRefreshInterval(http);
  if (code == 200) {
    int len = http.getSize();
    // A KNOWN Content-Length that doesn't match means this isn't our frame (e.g. an
    // error page served as 200). Skip the draw outright: an oversized body would let
    // readExact fill g_fb with the first 96 KB of garbage and flash it to the panel,
    // and an undersized one would burn the full readExact idle timeout in active mode
    // — both waste the once-or-twice-daily power budget. len == -1 (chunked/unknown)
    // falls through to the length-checked readExact below.
    if (len != -1 && len != (int)IB_FRAME_LEN) {
      Serial.printf("[IB] WARN bad size %d (want %d) -> skip draw\n", len, (int)IB_FRAME_LEN);
    } else {
      WiFiClient* stream = http.getStreamPtr();
      if (stream == nullptr) {
        // Connection dropped between GET and read — getStreamPtr returns null;
        // dereferencing it in readExact would crash.
        Serial.println("[IB] ERROR: null stream (connection closed)");
      } else if (readExact(stream, g_fb, IB_FRAME_LEN)) {
        // Cache the new Last-Modified into RTC BEFORE drawFrame's in-place flip — the
        // token comes from the response header, not the buffer, so the flip can't
        // corrupt it. Only adopt a non-empty value; if the server omits the header,
        // keep the prior token so conditional GETs (304 skip) stay enabled.
        String lm = http.header("Last-Modified");
        if (lm.length()) { strncpy(g_lastModified, lm.c_str(), sizeof(g_lastModified) - 1); g_lastModified[sizeof(g_lastModified) - 1] = '\0'; }
        Serial.printf("[IB] frame OK, Last-Modified: %s\n", g_lastModified);
        drawFrame();
      } else {
        Serial.println("[IB] ERROR: short read");
      }
    }
  } else if (code == 304) {
    Serial.println("[IB] 304 not modified -> skip refresh");
  } else {
    Serial.printf("[IB] unexpected status %d\n", code);
  }
  http.end();
}

void goToSleep() {
  // Drop the radio before sleeping (it is powered down in deep sleep regardless,
  // but an explicit disconnect avoids a dirty association lingering in NVS).
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // Server-driven cadence (X-Refresh-Interval) once learned; else the build default.
  uint32_t secs = g_sleepSeconds ? g_sleepSeconds : (uint32_t)IB_SLEEP_SECONDS;
  esp_sleep_enable_timer_wakeup((uint64_t)secs * 1000000ULL);
  Serial.printf("[IB] deep sleep for %u s\n", (unsigned)secs);
  Serial.flush();  // drain UART before the core powers down
  esp_deep_sleep_start();  // does not return; chip reboots into setup() on wake
}

void setup() {
  Serial.begin(115200);
  delay(200);
  g_bootCount++;
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  Serial.printf("[IB E1001] Phase 4 deep-sleep pull — boot #%u, wake cause %d %s\n",
                (unsigned)g_bootCount, (int)cause,
                cause == ESP_SLEEP_WAKEUP_TIMER ? "(RTC timer)" : "(cold boot)");

  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);

  g_fb = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!g_fb) {
    // Don't busy-hang (that would drain the battery) — sleep and retry next wake.
    Serial.println(F("[IB] FATAL: alloc 96KB failed -> sleep & retry"));
    goToSleep();
    return;  // goToSleep() is noreturn in practice; guard against fallthrough to pullOnce(nullptr)
  }

  pullOnce();

  free(g_fb);
  g_fb = nullptr;
  goToSleep();
}

void loop() {}  // unreachable: setup() always ends in deep sleep
