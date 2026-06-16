// InfoBento firmware — Phase 3: Wi-Fi + device-pull loop (reTerminal E1001).
//
// Connects Wi-Fi (creds in secrets.h), then every IB_POLL_MS:
//   GET http://HOST:PORT/api/device/<id>/frame?orientation=landscape
//   - sends If-Modified-Since from the cached Last-Modified
//   - 200  -> read 96000-byte 2bpp frame, translate, draw, cache Last-Modified
//   - 304  -> unchanged, skip the (expensive) eInk refresh entirely
//
// UC8179 grayscale driver is vendored from the Phase 2 static-frame sketch
// (Seeed_GxEPD2 GxEPD2_reTerminal_E1001_Gray4). TODO: factor into a shared lib
// once the firmware graduates from bench sketches.
//
// Board:  esp32:esp32:esp32s3
// Upload: arduino-cli upload -p /dev/cu.usbserial-1430 \
//           --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/device-pull

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
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
#define IB_POLL_MS 15000                  // Phase 3 cadence (Phase 4 -> deep sleep)

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

static uint8_t* g_fb = nullptr;   // 96000-byte frame buffer (reused each pull)
static String g_lastModified = "";

void checkBusy() { delay(10); while (!digitalRead(EPD_BUSY_PIN)) delay(10); }
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
  // half-connected (esp. after a Phase 4 deep-sleep wake) can otherwise fail to
  // associate.
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
    if (avail > 0) { int n = s->readBytes(buf + got, min(avail, len - got)); got += n; idle = millis(); }
    else delay(1);
  }
  return got == len;
}

void pullOnce() {
  if (!ensureWifi()) return;
  String url = String("http://") + IB_API_HOST + ":" + IB_API_PORT +
               "/api/device/" + IB_DEVICE_ID + "/frame?orientation=landscape";
  WiFiClient client;
  HTTPClient http;
  http.begin(client, url);
  const char* collect[] = { "Last-Modified" };
  http.collectHeaders(collect, 1);
  if (g_lastModified.length()) http.addHeader("If-Modified-Since", g_lastModified);
  int code = http.GET();
  Serial.printf("[IB] GET -> %d\n", code);
  if (code == 200) {
    int len = http.getSize();
    if (len != (int)IB_FRAME_LEN) { Serial.printf("[IB] WARN size %d != %d\n", len, IB_FRAME_LEN); }
    WiFiClient* stream = http.getStreamPtr();
    if (stream == nullptr) {
      // Connection dropped between GET and read — getStreamPtr returns null;
      // dereferencing it in readExact would crash.
      Serial.println("[IB] ERROR: null stream (connection closed)");
    } else if (readExact(stream, g_fb, IB_FRAME_LEN)) {
      // Only adopt a non-empty Last-Modified — if the server omits it, keep the
      // prior token so conditional GETs (304 skip) stay enabled.
      String lm = http.header("Last-Modified");
      if (lm.length()) g_lastModified = lm;
      Serial.printf("[IB] frame OK, Last-Modified: %s\n", g_lastModified.c_str());
      drawFrame();
    } else {
      Serial.println("[IB] ERROR: short read");
    }
  } else if (code == 304) {
    Serial.println("[IB] 304 not modified -> skip refresh");
  } else {
    Serial.printf("[IB] unexpected status %d\n", code);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("[IB E1001] Phase 3 device-pull loop"));
  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);
  g_fb = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!g_fb) { Serial.println(F("[IB] FATAL: alloc 96KB failed")); while (true) delay(1000); }
}

void loop() {
  pullOnce();
  delay(IB_POLL_MS);
}
