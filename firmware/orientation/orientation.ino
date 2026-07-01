// InfoBento firmware — manual orientation toggle (#160, RFC 0002) on the reTerminal E1001.
//
// Extends the Phase 4 deep-sleep pull with "cache both frames + redraw locally":
//
//   RTC-timer wake / cold boot
//     -> connect Wi-Fi
//     -> GET /api/device/<id>/frames  (BOTH orientations, one response)
//     -> 200: store landscape+portrait to LittleFS, draw the CURRENT orientation
//     -> 304: keep the cached pair, no redraw (the Phase 4 power win, unchanged)
//     -> deep sleep (timer + button wake armed)
//
//   GREEN-BUTTON wake (GPIO3, ext1)
//     -> radio stays OFF
//     -> read the OTHER cached orientation from LittleFS
//     -> draw it, flip the persisted currentOrientation
//     -> deep sleep
//
// The server delivers BOTH frames in the panel's fixed landscape raster (portrait is
// pre-rotated server-side, RFC 0002 §Q1 / PR #164), so uploadFrame is orientation-
// agnostic — no on-device transform. A flip costs one eInk refresh + a flash read, no
// Wi-Fi. The GPIO2 reset pinhole is NOT touched here; factory reset stays in the
// provisioning sketch.
//
// currentOrientation lives in RTC slow memory (survives deep sleep, free) with an NVS
// mirror so a brownout / battery pull (which clears RTC) doesn't silently revert to
// landscape.
//
// Board:  esp32:esp32:esp32s3
// Flash:  built-in 8 MB scheme with a SPIFFS/LittleFS partition (3MB app / 1.5MB FS):
//   arduino-cli compile --fqbn 'esp32:esp32:esp32s3:PartitionScheme=default_8MB' firmware/orientation
//   arduino-cli upload  -p /dev/cu.usbserial-1430 \
//     --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200,PartitionScheme=default_8MB' firmware/orientation
// Provide firmware/orientation/secrets.h (gitignored) mirroring deep-sleep/secrets.h.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <esp_sleep.h>
#include <LittleFS.h>
#include <Preferences.h>
#include "driver/rtc_io.h"
#include "secrets.h"

#define EPD_SCK_PIN 7
#define EPD_MOSI_PIN 9
#define EPD_CS_PIN 10
#define EPD_DC_PIN 11
#define EPD_RES_PIN 12
#define EPD_BUSY_PIN 13
#define EPD_W 800
#define EPD_H 480
// Bytes per orientation. Both frames share the panel raster (portrait pre-rotated
// server-side), so both are exactly this size.
#define IB_FRAME_LEN (EPD_W * EPD_H / 4)  // 96000

// Green "wake/refresh" button on the E1001: GPIO3, active-LOW (INPUT_PULLUP, idle
// HIGH / pressed LOW), and an ESP32-S3 RTC GPIO so it can be an ext1 deep-sleep wake
// source. Distinct from the GPIO2 reset pinhole and the panel SPI bus. Seeed's own
// deep-sleep example wakes on exactly this pin with ext1 ANY_LOW. MCU-specific: the
// Phase 7 ESP32-C3 port re-points this to the production board's button GPIO.
#define TOGGLE_BTN_GPIO 3

// Cached frame pair in flash: landscape at offset 0, portrait at offset IB_FRAME_LEN.
// InfoBento-native bytes exactly as received from /frames (drawFrame does the
// panel flip on the way out, so nothing pre-flipped is ever persisted).
#define ORIENT_FILE "/frames.bin"
#define ORIENT_TMP "/frames.tmp"
#define ORIENT_LANDSCAPE 0
#define ORIENT_PORTRAIT 1

#ifndef IB_SLEEP_SECONDS
#define IB_SLEEP_SECONDS 30  // bench default. Production: 28800 (8h).
#endif
#ifndef IB_API_TLS
#define IB_API_TLS 1  // 1 = https + WiFiClientSecure; 0 = http + WiFiClient
#endif

// ----- persisted across deep sleep (RTC slow memory) -----
RTC_DATA_ATTR char g_lastModified[48] = {0};
RTC_DATA_ATTR uint32_t g_bootCount = 0;
RTC_DATA_ATTR uint32_t g_sleepSeconds = 0;
// Which orientation is currently on the panel (0=landscape, 1=portrait). RTC survives
// deep sleep; the NVS mirror below survives power loss where RTC does not.
RTC_DATA_ATTR uint8_t g_orientation = ORIENT_LANDSCAPE;

Preferences g_prefs;

SPIClass hspi(HSPI);
SPISettings spiSet(2000000, MSBFIRST, SPI_MODE0);

// ----- vendored UC8179 grayscale driver (identical to deep-sleep/; shared-lib
// extraction across sibling sketch folders is deferred — see firmware/README.md) -----
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

// Draw whatever is in g_fb. InfoBento native (0=white..3=black) -> panel canvas
// (0=black..3=white): per-byte NOT, in place. Safe because g_fb is re-read from flash
// (unflipped) before every draw, so the flip is never seen twice.
void drawFrame() {
  for (uint32_t i = 0; i < IB_FRAME_LEN; i++) g_fb[i] = ~g_fb[i];
  unsigned long t0 = millis();
  initGrayMode();
  uploadFrame(g_fb);
  refreshDisplay();
  sleepDisplay();
  Serial.printf("[IB] drew frame in %lu ms\n", millis() - t0);
}

// ----- LittleFS frame store (Phase B) -----
bool mountFS() {
  if (LittleFS.begin(true)) return true;  // format-on-fail: first boot has no FS yet
  Serial.println("[IB] LittleFS mount FAILED");
  return false;
}

// Read one orientation's frame from the cached pair into g_fb. false = missing/short
// (e.g. a button press before the first network wake ever populated the store).
bool readFrameFromFlash(uint8_t orientation) {
  File f = LittleFS.open(ORIENT_FILE, "r");
  if (!f) { Serial.println("[IB] no cached frames yet"); return false; }
  if (f.size() < (size_t)IB_FRAME_LEN * 2) {
    Serial.printf("[IB] cache too small (%u) -> ignore\n", (unsigned)f.size());
    f.close(); return false;
  }
  f.seek((size_t)orientation * IB_FRAME_LEN);
  size_t got = f.read(g_fb, IB_FRAME_LEN);
  f.close();
  if (got != IB_FRAME_LEN) { Serial.printf("[IB] short flash read %u\n", (unsigned)got); return false; }
  return true;
}

// Read a cached orientation from flash and draw it. Shared by the network path and
// the button path so there is exactly one draw route.
bool drawOrientationFromFlash(uint8_t orientation) {
  if (!readFrameFromFlash(orientation)) return false;
  drawFrame();
  return true;
}

void persistOrientation(uint8_t orientation) {
  g_orientation = orientation;
  g_prefs.begin("infobento", false);
  g_prefs.putUChar("orient", orientation);
  g_prefs.end();
}

uint8_t loadOrientation() {
  g_prefs.begin("infobento", true);
  uint8_t o = g_prefs.getUChar("orient", ORIENT_LANDSCAPE);
  g_prefs.end();
  return o;
}

// ----- Wi-Fi + network pull (Phase 4 helpers, retargeted at /frames) -----
bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("[IB] Wi-Fi connecting to '%s' ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print('.'); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) { Serial.print("[IB] Wi-Fi OK, IP "); Serial.println(WiFi.localIP()); return true; }
  Serial.println("[IB] Wi-Fi FAILED");
  return false;
}

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

// Read one IB_FRAME_LEN half from the stream (via g_fb) straight into the open file.
bool streamHalfToFile(WiFiClient* s, File& f) {
  if (!readExact(s, g_fb, IB_FRAME_LEN)) return false;
  return f.write(g_fb, IB_FRAME_LEN) == (size_t)IB_FRAME_LEN;
}

// Fetch BOTH frames, store to flash atomically (tmp + rename), draw the current
// orientation. On 304 the cached pair is kept untouched (the Phase 4 power win).
void pullFrames() {
  if (!ensureWifi()) return;
#if IB_API_TLS
  String url = String("https://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frames";
  WiFiClientSecure client;
  client.setInsecure();  // device id is the bearer secret in the URL; pin ISRG Root X1 to harden (#143)
#else
  String url = String("http://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frames";
  WiFiClient client;
#endif
  HTTPClient http;
  http.begin(client, url);
  const char* collect[] = { "Last-Modified", "X-Refresh-Interval", "X-Frame-Landscape-Bytes", "X-Frame-Portrait-Bytes" };
  http.collectHeaders(collect, 4);
  if (g_lastModified[0]) http.addHeader("If-Modified-Since", g_lastModified);
  int code = http.GET();
  Serial.printf("[IB] GET /frames -> %d\n", code);
  adoptRefreshInterval(http);

  if (code == 304) {
    Serial.println("[IB] 304 -> keep cached frames, no redraw");
    http.end();
    return;
  }
  if (code != 200) {
    Serial.printf("[IB] unexpected status %d -> keep last frame\n", code);
    http.end();
    return;
  }

  // Both halves must be exactly the panel frame size (portrait is pre-rotated
  // server-side, so it matches landscape). Anything else isn't our frame pair.
  long landBytes = http.header("X-Frame-Landscape-Bytes").toInt();
  long portBytes = http.header("X-Frame-Portrait-Bytes").toInt();
  if (landBytes != (long)IB_FRAME_LEN || portBytes != (long)IB_FRAME_LEN) {
    Serial.printf("[IB] WARN bad frame sizes L=%ld P=%ld (want %d) -> skip\n",
                  landBytes, portBytes, (int)IB_FRAME_LEN);
    http.end();
    return;
  }

  WiFiClient* stream = http.getStreamPtr();
  if (stream == nullptr) {
    Serial.println("[IB] ERROR: null stream (connection closed)");
    http.end();
    return;
  }

  // Write to a temp file, then rename over the live pair only on full success — a
  // short read must NOT destroy the previously cached (good) pair.
  bool ok = false;
  {
    File f = LittleFS.open(ORIENT_TMP, "w");
    if (!f) {
      Serial.println("[IB] ERROR: open tmp for write");
    } else {
      ok = streamHalfToFile(stream, f) && streamHalfToFile(stream, f);  // landscape, then portrait
      f.close();
    }
  }
  http.end();

  if (!ok) {
    Serial.println("[IB] ERROR: short read storing frames -> keeping prior cache");
    LittleFS.remove(ORIENT_TMP);
    return;
  }
  LittleFS.remove(ORIENT_FILE);
  if (!LittleFS.rename(ORIENT_TMP, ORIENT_FILE)) {
    Serial.println("[IB] ERROR: rename tmp -> frames.bin failed");
    LittleFS.remove(ORIENT_TMP);
    return;
  }

  String lm = http.header("Last-Modified");
  if (lm.length()) { strncpy(g_lastModified, lm.c_str(), sizeof(g_lastModified) - 1); g_lastModified[sizeof(g_lastModified) - 1] = '\0'; }
  Serial.printf("[IB] stored both frames, Last-Modified: %s\n", g_lastModified);
  if (!drawOrientationFromFlash(g_orientation)) Serial.println("[IB] WARN: draw-after-store failed");
}

// ----- button wake: flip to the other cached orientation, no Wi-Fi (Phase C) -----
void handleButtonWake() {
  // Debounce: the wake means GPIO3 went LOW; confirm it is a real press, not noise.
  pinMode(TOGGLE_BTN_GPIO, INPUT_PULLUP);
  delay(30);
  if (digitalRead(TOGGLE_BTN_GPIO) != LOW) {
    Serial.println("[IB] button glitch (released) -> no-op");
    return;
  }
  uint8_t next = (g_orientation == ORIENT_LANDSCAPE) ? ORIENT_PORTRAIT : ORIENT_LANDSCAPE;
  Serial.printf("[IB] button -> flip %s to %s\n",
                g_orientation == ORIENT_PORTRAIT ? "portrait" : "landscape",
                next == ORIENT_PORTRAIT ? "portrait" : "landscape");
  if (drawOrientationFromFlash(next)) {
    persistOrientation(next);
  } else {
    Serial.println("[IB] no cached frame to flip to (empty store) -> no-op, wait for a network wake");
  }
}

void goToSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // Arm the green button as an ext1 wake source. Keep GPIO3's pull-up powered through
  // deep sleep so it idles HIGH and a press pulls it LOW (ANY_LOW wake).
  rtc_gpio_pullup_en((gpio_num_t)TOGGLE_BTN_GPIO);
  rtc_gpio_pulldown_dis((gpio_num_t)TOGGLE_BTN_GPIO);
  esp_sleep_enable_ext1_wakeup(1ULL << TOGGLE_BTN_GPIO, ESP_EXT1_WAKEUP_ANY_LOW);
  // Scheduled network refresh cadence (server-driven once learned, else build default).
  uint32_t secs = g_sleepSeconds ? g_sleepSeconds : (uint32_t)IB_SLEEP_SECONDS;
  esp_sleep_enable_timer_wakeup((uint64_t)secs * 1000000ULL);
  Serial.printf("[IB] deep sleep %us (or green button)\n", (unsigned)secs);
  Serial.flush();
  esp_deep_sleep_start();  // does not return; chip reboots into setup() on wake
}

void setup() {
  Serial.begin(115200);
  delay(200);
  g_bootCount++;
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool buttonWake = (cause == ESP_SLEEP_WAKEUP_EXT1);
  bool timerWake = (cause == ESP_SLEEP_WAKEUP_TIMER);
  Serial.printf("[IB E1001] orientation — boot #%u, wake cause %d %s\n",
                (unsigned)g_bootCount, (int)cause,
                buttonWake ? "(green button)" : timerWake ? "(RTC timer)" : "(cold boot)");

  // Cold boot clears RTC vars — restore the last orientation from NVS so a brownout /
  // battery pull doesn't silently flip the panel back to landscape.
  if (!buttonWake && !timerWake) g_orientation = loadOrientation();

  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);

  g_fb = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!g_fb) {
    Serial.println(F("[IB] FATAL: alloc 96KB failed -> sleep & retry"));
    goToSleep();
    return;
  }
  if (!mountFS()) {
    free(g_fb); g_fb = nullptr;
    goToSleep();
    return;
  }

  if (buttonWake) {
    handleButtonWake();  // redraw the other cached orientation, radio off
  } else {
    pullFrames();        // fetch both, store, draw current (or 304-skip)
  }

  free(g_fb);
  g_fb = nullptr;
  goToSleep();
}

void loop() {}  // unreachable: setup() always ends in deep sleep
