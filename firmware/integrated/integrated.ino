// InfoBento firmware — Phase 7 integrated build (reTerminal E1001, issue #173).
//
// One sketch, no secrets.h. Unifies the previously-separate phases:
//   * captive-portal provisioning (#39 / firmware/provisioning) — now also
//     captures the DEVICE ID, and stores ssid/pass/server/deviceid in NVS,
//   * deep-sleep dual-orientation pull + green-button flip (#160 / #165), driven
//     by the stored NVS config instead of compile-time secrets, and
//   * the resident factory-reset screen + two-white-button reset (#171 / #172).
//
// Boot flow (setup()):
//   not configured (no deviceid/ssid)  -> draw setup screen, AP mode + portal
//   configured, cold/timer wake        -> Wi-Fi -> GET /frames -> draw -> sleep
//   configured, green-button wake       -> flip cached orientation, radio off
//   configured, white-combo wake        -> factory reset (draw screen, wipe NVS)
//
// Reset: hold BOTH white buttons (GPIO4 + GPIO5) 5s — works awake (AP loop) and
// from deep sleep (ext1 wakes on GPIO4, then we poll for the 5s combo). Green =
// GPIO3 (orientation flip when configured; reset-screen flip in AP mode).
//
// ⚠️ BENCH-MVP, NOT hardware-verified. Highest-risk item: reset-from-deep-sleep
// (ext1 GPIO3+GPIO4 + post-wake combo poll). Flash 8 MB:
//   arduino-cli compile -u -p /dev/cu.usbserial-XXXX \
//     --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200,FlashSize=8M,PartitionScheme=default_8MB' firmware/integrated

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <SPI.h>
#include <esp_sleep.h>
#include <LittleFS.h>
#include <Preferences.h>
#include "driver/rtc_io.h"
#include "reset_screen.h"

// ----- Panel (UC8179) + buttons --------------------------------------------
#define EPD_SCK_PIN 7
#define EPD_MOSI_PIN 9
#define EPD_CS_PIN 10
#define EPD_DC_PIN 11
#define EPD_RES_PIN 12
#define EPD_BUSY_PIN 13
#define EPD_W 800
#define EPD_H 480
#define IB_FRAME_LEN (EPD_W * EPD_H / 4)  // 96000

#define GREEN_BTN_GPIO 3    // orientation flip (dashboard) / reset-screen flip (AP)
#define WHITE_BTN_R_GPIO 4  // right white — the only ext1 wake-capable white button
#define WHITE_BTN_L_GPIO 5  // left white
#define RESET_HOLD_MS 5000

#define ORIENT_FILE "/frames.bin"
#define ORIENT_TMP "/frames.tmp"
#define ORIENT_LANDSCAPE 0
#define ORIENT_PORTRAIT 1

#define DNS_PORT 53
#define HTTP_PORT 80
#define JOIN_TIMEOUT_MS 15000
#define IB_SLEEP_SECONDS 28800  // 8h production default; server X-Refresh-Interval overrides

static const char* NVS_NAMESPACE = "infobento";
static const char* DEFAULT_SERVER = "https://www.infobento.com";

// ----- persisted across deep sleep (RTC slow memory) -----
RTC_DATA_ATTR char g_lastModified[48] = {0};
RTC_DATA_ATTR uint32_t g_bootCount = 0;
RTC_DATA_ATTR uint32_t g_sleepSeconds = 0;
RTC_DATA_ATTR uint8_t g_orientation = ORIENT_LANDSCAPE;

// ----- runtime config (loaded from NVS in setup) -----
Preferences g_prefs;
String g_ssid, g_pass, g_server, g_deviceid;
bool g_provisioned = false;

DNSServer dns;
WebServer server(HTTP_PORT);
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_MASK(255, 255, 255, 0);
static bool g_apMode = false;
static bool g_comboDown = false;
static unsigned long g_comboStart = 0;
static bool g_greenDown = false;

SPIClass hspi(HSPI);
SPISettings spiSet(2000000, MSBFIRST, SPI_MODE0);
static uint8_t* g_fb = nullptr;

// ----- vendored UC8179 grayscale driver (identical to firmware/orientation) -----
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

void checkBusy(uint16_t timeoutMs = 10000) {
  delay(10);
  unsigned long t0 = millis();
  while (!digitalRead(EPD_BUSY_PIN)) {
    if (millis() - t0 > timeoutMs) { Serial.println("[IB] WARN: BUSY timeout"); break; }
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

// Draw whatever is in g_fb (native -> panel canvas via per-byte NOT).
void drawFrame() {
  for (uint32_t i = 0; i < IB_FRAME_LEN; i++) g_fb[i] = ~g_fb[i];
  unsigned long t0 = millis();
  initGrayMode(); uploadFrame(g_fb); refreshDisplay(); sleepDisplay();
  Serial.printf("[IB] drew frame in %lu ms\n", millis() - t0);
}

void epdBegin() {
  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);
}

// Draw one baked reset/setup screen from PROGMEM (into g_fb, then drawFrame).
void drawResetScreen(uint8_t orientation) {
  const uint8_t* src = (orientation == ORIENT_PORTRAIT) ? RESET_SCREEN_PORTRAIT : RESET_SCREEN_LANDSCAPE;
  memcpy_P(g_fb, src, IB_FRAME_LEN);
  drawFrame();
  Serial.printf("[IB] drew reset screen (%s)\n", orientation == ORIENT_PORTRAIT ? "portrait" : "landscape");
}

// ----- LittleFS cached frame pair (from firmware/orientation) ---------------
bool mountFS() {
  if (LittleFS.begin(true)) return true;
  Serial.println("[IB] LittleFS mount FAILED");
  return false;
}
bool readFrameFromFlash(uint8_t orientation) {
  File f = LittleFS.open(ORIENT_FILE, "r");
  if (!f) { Serial.println("[IB] no cached frames yet"); return false; }
  if (f.size() < (size_t)IB_FRAME_LEN * 2) { f.close(); return false; }
  f.seek((size_t)orientation * IB_FRAME_LEN);
  size_t got = f.read(g_fb, IB_FRAME_LEN);
  f.close();
  return got == IB_FRAME_LEN;
}
bool drawOrientationFromFlash(uint8_t orientation) {
  if (!readFrameFromFlash(orientation)) return false;
  drawFrame();
  return true;
}

// ----- NVS config -----------------------------------------------------------
void loadConfig() {
  g_prefs.begin(NVS_NAMESPACE, true);
  g_provisioned = g_prefs.getBool("provisioned", false);
  g_ssid = g_prefs.getString("ssid", "");
  g_pass = g_prefs.getString("pass", "");
  g_server = g_prefs.getString("server", "");
  g_deviceid = g_prefs.getString("deviceid", "");
  uint8_t nvsOrient = g_prefs.getUChar("orient", ORIENT_LANDSCAPE);
  g_prefs.end();
  if (g_server.length() == 0) g_server = DEFAULT_SERVER;
  // Cold boot clears RTC — restore orientation from NVS so a battery pull doesn't
  // silently revert to landscape.
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause != ESP_SLEEP_WAKEUP_EXT1 && cause != ESP_SLEEP_WAKEUP_TIMER) g_orientation = nvsOrient;
}
void persistOrientation(uint8_t orientation) {
  g_orientation = orientation;
  g_prefs.begin(NVS_NAMESPACE, false);
  g_prefs.putUChar("orient", orientation);
  g_prefs.end();
}
void saveConfig(const String& ssid, const String& pass, const String& serverUrl, const String& deviceid) {
  g_prefs.begin(NVS_NAMESPACE, false);
  g_prefs.putString("ssid", ssid);
  g_prefs.putString("pass", pass);
  g_prefs.putString("server", serverUrl);
  g_prefs.putString("deviceid", deviceid);
  g_prefs.putBool("provisioned", true);
  g_prefs.end();
}
void clearConfig() {
  g_prefs.begin(NVS_NAMESPACE, false);
  g_prefs.clear();  // wipe the whole namespace so the device boots pristine
  g_prefs.end();
  LittleFS.remove(ORIENT_FILE);  // the cached frames belonged to the old device
}
bool haveConfig() { return g_provisioned && g_deviceid.length() && g_ssid.length(); }

// ----- Wi-Fi + /frames pull (from orientation, NVS-driven) ------------------
bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("[IB] Wi-Fi connecting to '%s' ...\n", g_ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(g_ssid.c_str(), g_pass.c_str());
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
bool streamHalfToFile(WiFiClient* s, File& f) {
  if (!readExact(s, g_fb, IB_FRAME_LEN)) return false;
  return f.write(g_fb, IB_FRAME_LEN) == (size_t)IB_FRAME_LEN;
}
void pullFrames() {
  if (!ensureWifi()) return;
  bool tls = g_server.startsWith("https");
  String url = g_server + "/api/device/" + g_deviceid + "/frames";
  WiFiClientSecure secureClient;
  WiFiClient plainClient;
  WiFiClient* client;
  if (tls) { secureClient.setInsecure(); client = &secureClient; }  // pin ISRG Root X1 to harden (#143)
  else client = &plainClient;

  HTTPClient http;
  http.begin(*client, url);
  const char* collect[] = { "Last-Modified", "X-Refresh-Interval", "X-Frame-Landscape-Bytes", "X-Frame-Portrait-Bytes" };
  http.collectHeaders(collect, 4);
  if (g_lastModified[0]) http.addHeader("If-Modified-Since", g_lastModified);
  int code = http.GET();
  Serial.printf("[IB] GET /frames -> %d\n", code);
  adoptRefreshInterval(http);

  if (code == 304) { Serial.println("[IB] 304 -> keep cached frames"); http.end(); return; }
  if (code != 200) { Serial.printf("[IB] status %d -> keep last frame\n", code); http.end(); return; }

  long landBytes = http.header("X-Frame-Landscape-Bytes").toInt();
  long portBytes = http.header("X-Frame-Portrait-Bytes").toInt();
  if (landBytes != (long)IB_FRAME_LEN || portBytes != (long)IB_FRAME_LEN) {
    Serial.printf("[IB] WARN bad frame sizes L=%ld P=%ld (want %d) -> skip\n", landBytes, portBytes, (int)IB_FRAME_LEN);
    http.end(); return;
  }
  WiFiClient* stream = http.getStreamPtr();
  if (stream == nullptr) { Serial.println("[IB] ERROR: null stream"); http.end(); return; }

  bool ok = false;
  {
    File f = LittleFS.open(ORIENT_TMP, "w");
    if (!f) Serial.println("[IB] ERROR: open tmp");
    else { ok = streamHalfToFile(stream, f) && streamHalfToFile(stream, f); f.close(); }
  }
  http.end();
  if (!ok) { Serial.println("[IB] ERROR: short read -> keep prior cache"); LittleFS.remove(ORIENT_TMP); return; }
  LittleFS.remove(ORIENT_FILE);
  if (!LittleFS.rename(ORIENT_TMP, ORIENT_FILE)) { Serial.println("[IB] ERROR: rename failed"); LittleFS.remove(ORIENT_TMP); return; }

  String lm = http.header("Last-Modified");
  if (lm.length()) { strncpy(g_lastModified, lm.c_str(), sizeof(g_lastModified) - 1); g_lastModified[sizeof(g_lastModified) - 1] = '\0'; }
  Serial.printf("[IB] stored both frames, Last-Modified: %s\n", g_lastModified);
  if (!drawOrientationFromFlash(g_orientation)) Serial.println("[IB] WARN: draw-after-store failed");
}

// ----- Captive portal (streamlined from firmware/provisioning) --------------
String apSsid() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char ssid[16];
  snprintf(ssid, sizeof(ssid), "InfoBento-%02X%02X", mac[4], mac[5]);
  return String(ssid);
}
String htmlEscape(const String& s) {
  String o;
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;";
    else if (c == '"') o += "&quot;"; else o += c;
  }
  return o;
}
String setupPage(const String& err) {
  String h = "<!doctype html><html><head><meta charset='utf-8'>"
             "<meta name='viewport' content='width=device-width,initial-scale=1'>"
             "<title>Set up InfoBento</title><style>"
             "body{background:#fff;color:#000;font-family:ui-monospace,Menlo,Consolas,monospace;max-width:24rem;margin:2rem auto;padding:0 1rem}"
             "h1{font-size:1.2rem;border-bottom:1px solid #000;padding-bottom:.5rem}"
             "label{display:block;margin:1rem 0 .25rem;font-size:.85rem}"
             "input{width:100%;padding:.6rem;font:inherit;background:#fff;border:1px solid #000;box-sizing:border-box}"
             "button{width:100%;margin-top:1.5rem;padding:.6rem;font:inherit;cursor:pointer;font-weight:bold;border:1px solid #000;background:#fff}"
             "button:hover{background:#000;color:#fff}.err{color:#a00;margin-top:1rem}</style></head><body>"
             "<h1>Set up InfoBento</h1>";
  if (err.length()) h += "<div class='err'>" + htmlEscape(err) + "</div>";
  h += "<form method='POST' action='/save'>"
       "<label>Wi-Fi network</label><input name='ssid' placeholder='Your Wi-Fi name'>"
       "<label>Wi-Fi password</label><input name='pass' type='password' placeholder='(blank if open)'>"
       "<label>Device ID (from the sticker / pairing page)</label><input name='deviceid' placeholder='xxxxxxxx-...'>"
       "<label>Server (optional)</label><input name='server' placeholder='https://www.infobento.com'>"
       "<button type='submit'>Connect</button></form></body></html>";
  return h;
}
void redirectToPortal() {
  server.sendHeader("Location", String("http://") + AP_IP.toString() + "/");
  server.send(302, "text/plain", "");
}
void handleRoot() { server.send(200, "text/html", setupPage("")); }
bool tryJoin(const String& ssid, const String& pass) {
  Serial.printf("[IB] joining '%s' ...\n", ssid.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < JOIN_TIMEOUT_MS) { dns.processNextRequest(); delay(50); }
  if (WiFi.status() == WL_CONNECTED) { Serial.print("[IB] joined, IP "); Serial.println(WiFi.localIP()); return true; }
  Serial.println("[IB] join FAILED");
  WiFi.disconnect(false);
  return false;
}
void handleSave() {
  String ssid = server.arg("ssid"); ssid.trim();
  String pass = server.arg("pass");
  String deviceid = server.arg("deviceid"); deviceid.trim();
  String serverUrl = server.arg("server"); serverUrl.trim();
  if (!ssid.length()) { server.send(200, "text/html", setupPage("Enter your Wi-Fi network name.")); return; }
  if (ssid.length() > 32) { server.send(200, "text/html", setupPage("Network name is too long (max 32).")); return; }
  if (pass.length() && (pass.length() < 8 || pass.length() > 63)) { server.send(200, "text/html", setupPage("Password must be 8-63 characters.")); return; }
  if (!deviceid.length()) { server.send(200, "text/html", setupPage("Enter the Device ID from the sticker.")); return; }
  if (serverUrl.length() && !serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
    server.send(200, "text/html", setupPage("Server URL must start with http:// or https://.")); return;
  }
  if (tryJoin(ssid, pass)) {
    saveConfig(ssid, pass, serverUrl, deviceid);
    Serial.println("[IB] provisioned -> config saved, rebooting into dashboard");
    server.send(200, "text/html", "<!doctype html><meta charset=utf-8><h1>Connected</h1><p>Your InfoBento is setting up its display now.</p>");
    delay(1500);
    ESP.restart();
  } else {
    server.send(200, "text/html", setupPage("Could not join that network. Check the password and try again."));
  }
}
void startAP() {
  String ssid = apSsid();
  Serial.printf("[IB] no config -> AP mode, SSID '%s' (open)\n", ssid.c_str());
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(AP_IP, AP_IP, AP_MASK);
  WiFi.softAP(ssid.c_str());
  delay(100);
  dns.start(DNS_PORT, "*", AP_IP);
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/hotspot-detect.html", HTTP_GET, redirectToPortal);
  server.on("/generate_204", HTTP_GET, redirectToPortal);
  server.on("/gen_204", HTTP_GET, redirectToPortal);
  server.on("/ncsi.txt", HTTP_GET, redirectToPortal);
  server.on("/connecttest.txt", HTTP_GET, redirectToPortal);
  server.onNotFound(redirectToPortal);
  server.begin();
  g_apMode = true;
  Serial.println("[IB] captive portal up");
}

// ----- Reset + orientation flip ---------------------------------------------
void factoryReset() {
  Serial.println("[IB] WHITE x2 5s -> factory reset (draw screen, wipe config)");
  drawResetScreen(g_orientation);
  clearConfig();
  delay(200);
  ESP.restart();
}
// Both white buttons held 5s (awake AP-mode polling path).
void checkResetCombo() {
  bool both = (digitalRead(WHITE_BTN_R_GPIO) == LOW) && (digitalRead(WHITE_BTN_L_GPIO) == LOW);
  if (both) {
    if (!g_comboDown) { g_comboDown = true; g_comboStart = millis(); Serial.println("[IB] both white down — hold 5s to reset"); }
    else if (millis() - g_comboStart >= RESET_HOLD_MS) factoryReset();
  } else {
    if (g_comboDown) Serial.println("[IB] white combo released");
    g_comboDown = false;
  }
}
// Green flips the reset screen (AP-mode polling path).
void checkGreenButton() {
  bool pressed = (digitalRead(GREEN_BTN_GPIO) == LOW);
  if (pressed && !g_greenDown) {
    delay(20);
    if (digitalRead(GREEN_BTN_GPIO) == LOW) {
      g_orientation = (g_orientation == ORIENT_LANDSCAPE) ? ORIENT_PORTRAIT : ORIENT_LANDSCAPE;
      drawResetScreen(g_orientation);
    }
  }
  g_greenDown = pressed;
}
// Flip the cached DASHBOARD orientation (deep-sleep green-wake path).
void handleOrientationFlip() {
  uint8_t next = (g_orientation == ORIENT_LANDSCAPE) ? ORIENT_PORTRAIT : ORIENT_LANDSCAPE;
  Serial.printf("[IB] green -> flip to %s\n", next == ORIENT_PORTRAIT ? "portrait" : "landscape");
  if (drawOrientationFromFlash(next)) persistOrientation(next);
  else Serial.println("[IB] no cached frame to flip to -> no-op");
}
// Deep-sleep button wake: distinguish a reset combo (both white, 5s) from a green flip.
void handleWakeButtons() {
  pinMode(GREEN_BTN_GPIO, INPUT_PULLUP);
  pinMode(WHITE_BTN_R_GPIO, INPUT_PULLUP);
  pinMode(WHITE_BTN_L_GPIO, INPUT_PULLUP);
  delay(30);
  if (digitalRead(WHITE_BTN_R_GPIO) == LOW && digitalRead(WHITE_BTN_L_GPIO) == LOW) {
    Serial.println("[IB] both white down on wake — hold 5s to reset");
    unsigned long t0 = millis();
    while (millis() - t0 < RESET_HOLD_MS) {
      if (digitalRead(WHITE_BTN_R_GPIO) != LOW || digitalRead(WHITE_BTN_L_GPIO) != LOW) {
        Serial.println("[IB] combo released early -> no reset"); return;
      }
      delay(20);
    }
    factoryReset();  // does not return
  }
  if (digitalRead(GREEN_BTN_GPIO) == LOW) handleOrientationFlip();
  else Serial.println("[IB] button wake, no actionable button -> no-op");
}

void goToSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // Arm ext1 on green (orientation flip) AND white-right (reset combo entry). Keep
  // both pull-ups powered so they idle HIGH and a press pulls LOW (ANY_LOW wake).
  rtc_gpio_pullup_en((gpio_num_t)GREEN_BTN_GPIO);   rtc_gpio_pulldown_dis((gpio_num_t)GREEN_BTN_GPIO);
  rtc_gpio_pullup_en((gpio_num_t)WHITE_BTN_R_GPIO); rtc_gpio_pulldown_dis((gpio_num_t)WHITE_BTN_R_GPIO);
  esp_sleep_enable_ext1_wakeup((1ULL << GREEN_BTN_GPIO) | (1ULL << WHITE_BTN_R_GPIO), ESP_EXT1_WAKEUP_ANY_LOW);
  uint32_t secs = g_sleepSeconds ? g_sleepSeconds : (uint32_t)IB_SLEEP_SECONDS;
  esp_sleep_enable_timer_wakeup((uint64_t)secs * 1000000ULL);
  Serial.printf("[IB] deep sleep %us (or button)\n", (unsigned)secs);
  Serial.flush();
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  g_bootCount++;
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  bool buttonWake = (cause == ESP_SLEEP_WAKEUP_EXT1);
  bool timerWake = (cause == ESP_SLEEP_WAKEUP_TIMER);
  Serial.printf("[IB E1001] integrated — boot #%u, cause %d %s\n", (unsigned)g_bootCount, (int)cause,
                buttonWake ? "(button)" : timerWake ? "(RTC timer)" : "(cold boot)");

  epdBegin();
  pinMode(GREEN_BTN_GPIO, INPUT_PULLUP);
  pinMode(WHITE_BTN_R_GPIO, INPUT_PULLUP);
  pinMode(WHITE_BTN_L_GPIO, INPUT_PULLUP);

  g_fb = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!g_fb) { Serial.println(F("[IB] FATAL: alloc 96KB failed")); goToSleep(); return; }
  if (!mountFS()) { free(g_fb); g_fb = nullptr; goToSleep(); return; }
  loadConfig();

  if (haveConfig()) {
    if (buttonWake) handleWakeButtons();  // reset combo or orientation flip, radio off
    else pullFrames();                    // cold/timer: fetch both, store, draw current
    free(g_fb); g_fb = nullptr;
    goToSleep();
    return;
  }

  // Not configured -> show setup instructions on the panel and run the portal.
  // Keep g_fb allocated: the AP loop redraws the reset screen on green flips.
  Serial.println("[IB] not configured -> provisioning");
  drawResetScreen(g_orientation);
  startAP();
}

void loop() {
  // Reached only in AP/provisioning mode; the configured path ends in deep sleep.
  if (g_apMode) {
    dns.processNextRequest();
    server.handleClient();
  }
  checkResetCombo();
  checkGreenButton();
  delay(5);
}
