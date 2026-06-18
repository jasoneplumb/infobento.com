// InfoBento firmware — Phase 5: resilience (reTerminal E1001).
//
// Builds on Phase 4 deep-sleep. Same one-wake-cycle-in-setup() shape, but every
// failure mode now degrades gracefully instead of crashing, hanging, or getting
// stuck — the "device survives the API being down / wrong creds / unprovisioned"
// milestone.
//
// Failure policy (deliberately simple — "just resume cadence"):
//   - Wi-Fi down / wrong creds      -> don't draw, sleep the normal cadence, retry next wake
//   - 404 (unprovisioned/no config) -> don't draw, sleep the normal cadence
//   - 5xx / transport / short read  -> don't draw, sleep the normal cadence
//   - 429 (rate limited)            -> honor Retry-After (sleep exactly that long)
//   - brownout reset                -> skip the fetch, sleep a longer recovery interval
//   - 200                           -> draw; commit Last-Modified to RTC ONLY on a
//                                      confirmed draw (see below)
//   - 304                           -> skip refresh
//
// Why no flash framebuffer cache: an eInk panel HOLDS its last image at zero power,
// and we only ever redraw on a confirmed 200. So on any failure we simply don't
// redraw and the panel keeps showing the last good frame — "stale content on
// failure" is free, no flash cache needed (cf. FIRMWARE_BRINGUP.md Phase 4 note).
//
// Two correctness fixes over Phase 4:
//   1. checkBusy() records a timeout in g_busyTimedOut; drawFrame() returns false
//      if the panel never went ready, so a stuck panel aborts cleanly instead of
//      pushing SPI at a non-responsive controller forever.
//   2. The cached Last-Modified is committed to RTC only AFTER a confirmed draw.
//      Phase 4 cached it before drawing, so a failed refresh would still record the
//      token -> next wake 304s -> panel stuck on a frame that never rendered.
//
// UC8179 driver is vendored from deep-sleep (Seeed GxEPD2_reTerminal_E1001_Gray4),
// with the bounded-checkBusy divergence carried forward. Still duplicated per-sketch;
// shared-library extraction is deferred to Phase 6/7 (see firmware/README.md).
//
// Board:  esp32:esp32:esp32s3
// Upload: arduino-cli upload -p /dev/cu.usbserial-1430 \
//           --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/resilient

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <esp_sleep.h>
#include <esp_system.h>
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

// Wake cadence — build constants (see Phase 4). Bench: short, to watch the cycle.
#ifndef IB_SLEEP_SECONDS
#define IB_SLEEP_SECONDS 30  // bench default. Production: 43200 (12h).
#endif
// After a brownout reset the supply sagged (low battery / poor solar). Sleep a
// LONGER recovery interval before trying Wi-Fi + a refresh again — both are the
// heaviest loads and would just re-trigger the brownout on a weak supply.
#ifndef IB_BROWNOUT_SLEEP_SECONDS
#define IB_BROWNOUT_SLEEP_SECONDS 60  // bench default. Production: ~1800 (30 min).
#endif
// 429 Retry-After handling. The server sends delta-seconds ("60"); if it's absent
// or non-numeric we fall back to the default, and we clamp a hostile/garbage value.
#define IB_RETRY_AFTER_DEFAULT 60
#define IB_RETRY_AFTER_MAX 3600

// ----- persisted across deep sleep (RTC slow memory) -----
RTC_DATA_ATTR char g_lastModified[48] = {0};
RTC_DATA_ATTR uint32_t g_bootCount = 0;

SPIClass hspi(HSPI);
SPISettings spiSet(2000000, MSBFIRST, SPI_MODE0);

// Set by checkBusy() when the panel never asserts ready within the timeout; read by
// drawFrame() to decide whether the refresh actually completed. Not volatile: it is
// only ever touched synchronously on the main task (checkBusy writes, drawFrame
// reads/resets) — no ISR or second core involved.
static bool g_busyTimedOut = false;

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

static uint8_t* g_fb = nullptr;  // 96000-byte frame buffer (RAM; not persisted)

// BUSY high = panel idle. Bounded wait (the vendored driver looped forever): on a
// deep-sleep battery device a stuck panel would otherwise drain the cell. On timeout
// we set g_busyTimedOut and continue (so we never hang); drawFrame() then treats the
// refresh as failed and the next wake retries. 10 s covers the slowest full refresh.
void checkBusy(uint16_t timeoutMs = 10000) {
  if (g_busyTimedOut) return;  // panel already known stuck this draw — don't burn another full timeout
  delay(10);
  unsigned long t0 = millis();
  while (!digitalRead(EPD_BUSY_PIN)) {
    if (millis() - t0 > timeoutMs) { Serial.println("[IB] WARN: BUSY timeout"); g_busyTimedOut = true; return; }
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

// Returns true only if the refresh completed (panel stayed responsive). On a BUSY
// timeout it returns false so the caller leaves the cached Last-Modified untouched
// and retries on the next wake.
bool drawFrame() {
  g_busyTimedOut = false;
  // InfoBento native (0=white..3=black) -> panel canvas (0=black..3=white): per-byte NOT.
  for (uint32_t i = 0; i < IB_FRAME_LEN; i++) g_fb[i] = ~g_fb[i];
  unsigned long t0 = millis();
  initGrayMode();
  if (g_busyTimedOut) { Serial.println("[IB] draw aborted: panel not ready after init"); return false; }
  uploadFrame(g_fb);
  refreshDisplay();
  sleepDisplay();  // try to low-power the panel regardless of a refresh-phase timeout
  if (g_busyTimedOut) { Serial.println("[IB] draw incomplete: BUSY timeout during refresh"); return false; }
  Serial.printf("[IB] drew frame in %lu ms\n", millis() - t0);
  return true;
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
  Serial.println("[IB] Wi-Fi FAILED");  // wrong creds / AP down -> caller keeps last frame, retries next wake
  return false;
}

// Read exactly len bytes from an active HTTP stream into buf. Bounded by BOTH a
// per-chunk idle timeout (resets on each chunk) and a hard total deadline, so a
// server trickling one byte just under the idle limit can't stall forever.
bool readExact(WiFiClient* s, uint8_t* buf, int len) {
  int got = 0;
  const unsigned long start = millis();
  unsigned long idle = start;
  while (got < len && millis() - idle < 15000 && millis() - start < 60000) {
    int avail = s->available();
    if (avail > 0) { int n = (int)s->readBytes(buf + got, (size_t)min(avail, len - got)); got += n; idle = millis(); }
    else delay(1);
  }
  return got == len;
}

// Performs one fetch cycle and RETURNS how many seconds to deep-sleep before the
// next wake (normal cadence for every path except a 429's Retry-After).
uint32_t pullOnce() {
  if (!ensureWifi()) {
    Serial.println("[IB] Wi-Fi unavailable -> keep last frame, retry next wake");
    return IB_SLEEP_SECONDS;
  }
  String url = String("http://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frame?orientation=landscape";
  WiFiClient client;
  HTTPClient http;
  http.begin(client, url);
  const char* collect[] = { "Last-Modified", "Retry-After" };
  http.collectHeaders(collect, 2);
  if (g_lastModified[0]) http.addHeader("If-Modified-Since", g_lastModified);
  int code = http.GET();
  Serial.printf("[IB] GET -> %d\n", code);

  uint32_t sleepSecs = IB_SLEEP_SECONDS;

  if (code == 200) {
    int len = http.getSize();
    // Require an EXACT Content-Length match before drawing. A mismatch means this
    // isn't our frame (e.g. an error page served as 200): an oversized body would
    // flash garbage, an undersized one would burn the readExact idle timeout. We
    // also reject len == -1 (unknown / chunked): getStreamPtr() hands back the raw
    // WiFiClient, which does NOT decode chunked transfer-encoding, so reading 96000
    // bytes off a chunked body would splice HTTP framing bytes into the frame. The
    // server always sends `Content-Length: 96000`, so this only rejects a
    // misconfigured / proxy-stripped response — exactly when we'd rather not draw.
    if (len != (int)IB_FRAME_LEN) {
      Serial.printf("[IB] WARN bad/unknown size %d (want %d) -> skip draw\n", len, (int)IB_FRAME_LEN);
    } else {
      WiFiClient* stream = http.getStreamPtr();
      if (stream == nullptr) {
        // Connection dropped between GET and read — dereferencing null would crash.
        Serial.println("[IB] ERROR: null stream (connection closed) -> skip draw");
      } else if (readExact(stream, g_fb, IB_FRAME_LEN)) {
        // Capture the token now, but commit it to RTC only after a CONFIRMED draw —
        // otherwise a failed/aborted refresh would still record the token, the next
        // wake would 304, and the panel would be stuck on a frame that never rendered.
        String lm = http.header("Last-Modified");
        if (drawFrame()) {
          if (lm.length()) { strncpy(g_lastModified, lm.c_str(), sizeof(g_lastModified) - 1); g_lastModified[sizeof(g_lastModified) - 1] = '\0'; }
          Serial.printf("[IB] frame OK, Last-Modified: %s\n", g_lastModified);
        } else {
          Serial.println("[IB] draw failed -> Last-Modified NOT updated, retry next wake");
        }
      } else {
        Serial.println("[IB] ERROR: short read -> skip draw");
      }
    }
  } else if (code == 304) {
    Serial.println("[IB] 304 not modified -> skip refresh");
  } else if (code == 404) {
    Serial.println("[IB] 404 not_found -> device unprovisioned / no config; keep last frame");
  } else if (code == 429) {
    // Rate limited (10/min/device). Honor Retry-After exactly so we don't keep
    // hammering — important on the bench, where the cadence is shorter than the limit.
    long ra = http.header("Retry-After").toInt();
    if (ra <= 0) ra = IB_RETRY_AFTER_DEFAULT;
    if (ra > IB_RETRY_AFTER_MAX) ra = IB_RETRY_AFTER_MAX;
    Serial.printf("[IB] 429 rate-limited -> honor Retry-After, sleep %ld s\n", ra);
    sleepSecs = (uint32_t)ra;
  } else {
    // 5xx render error, or a negative HTTPClient transport error (API down, timeout).
    Serial.printf("[IB] status %d -> keep last frame, retry next wake\n", code);
  }
  http.end();
  return sleepSecs;
}

void goToSleep(uint32_t seconds) {
  // Drop the radio before sleeping (powered down in deep sleep regardless, but an
  // explicit disconnect avoids a dirty association lingering in NVS).
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  Serial.printf("[IB] deep sleep for %u s\n", (unsigned)seconds);
  Serial.flush();  // drain UART before the core powers down
  esp_deep_sleep_start();  // does not return; chip reboots into setup() on wake
}

const char* resetReasonStr(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:   return "power-on";
    case ESP_RST_DEEPSLEEP: return "deep-sleep wake";
    case ESP_RST_BROWNOUT:  return "BROWNOUT";
    case ESP_RST_SW:        return "sw-reset";
    case ESP_RST_PANIC:     return "panic";
    case ESP_RST_EXT:       return "ext-reset";
    default:                return "other";
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  g_bootCount++;
  esp_reset_reason_t rr = esp_reset_reason();
  esp_sleep_wakeup_cause_t wc = esp_sleep_get_wakeup_cause();
  Serial.printf("[IB E1001] Phase 5 resilient pull — boot #%u, reset: %s, wake cause %d\n",
                (unsigned)g_bootCount, resetReasonStr(rr), (int)wc);

  if (rr == ESP_RST_BROWNOUT) {
    // Supply sagged. Skip the fetch (Wi-Fi + refresh are the heaviest loads and
    // would re-trigger the brownout) and sleep a longer recovery interval first.
    Serial.printf("[IB] BROWNOUT reset -> recovery sleep %u s (skip fetch)\n", (unsigned)IB_BROWNOUT_SLEEP_SECONDS);
    goToSleep(IB_BROWNOUT_SLEEP_SECONDS);
    return;
  }

  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);

  g_fb = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!g_fb) {
    // Don't busy-hang (that would drain the battery) — sleep and retry next wake.
    Serial.println(F("[IB] FATAL: alloc 96KB failed -> sleep & retry"));
    goToSleep(IB_SLEEP_SECONDS);
    return;  // goToSleep() is noreturn in practice; guard against fallthrough
  }

  uint32_t sleepSecs = pullOnce();

  free(g_fb);
  g_fb = nullptr;
  goToSleep(sleepSecs);
}

void loop() {}  // unreachable: setup() always ends in deep sleep
