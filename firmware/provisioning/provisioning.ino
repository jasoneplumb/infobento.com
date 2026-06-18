// InfoBento firmware — Phase 6: captive-portal provisioning (reTerminal E1001).
//
// First-boot Wi-Fi onboarding. On power-on with no saved credentials the device
// comes up as its own open access point, runs a captive portal, and lets the
// user pick their home Wi-Fi and type the password from any phone or laptop —
// no app, no hardcoded secrets. Once it joins the home network the creds are
// persisted to NVS and subsequent boots run the normal pull/deep-sleep firmware
// (Phases 3-5). A 5-second pinhole hold factory-resets back to AP mode.
//
// This is the gate to a shippable out-of-box flow (see docs/hardware/
// CONNECTIVITY.md "First-time setup flow"). Unlike the earlier phases there is
// NO secrets.h: the whole point is that the device has no credentials to begin
// with, so this sketch compiles and runs with nothing pre-baked.
//
// State machine (setup):
//   no creds in NVS                 -> AP mode + captive portal (provisioning)
//   creds in NVS, join succeeds     -> "provisioned"; hand off to the pull loop
//   creds in NVS, join fails        -> fall back to AP mode so a moved/renamed
//                                      network (or a wrong saved password) can be
//                                      re-provisioned without a pinhole reset
//
// Captive portal (AP mode), served from the on-board web server at 192.168.4.1:
//   GET  /            setup page: server-side Wi-Fi scan -> <select>, + manual
//                     SSID field (hidden networks), password, optional custom
//                     server URL (self-host hatch, #80). Pure HTML, no JS.
//   POST /save        persist creds, join the home Wi-Fi (AP+STA), report result
//   OS probe URLs     Apple hotspot-detect.html / Android generate_204 /
//                     Microsoft ncsi.txt + any unknown path -> 302 to / so the
//                     OS auto-opens the captive-portal browser
//
// Bench-checkable, but AP mode + the portal + a phone can't be CI-verified —
// this sketch is COMPILE-CLEAN; the operator bench-check lives in
// firmware/README.md (Phase 6).
//
// UC8179 panel driver is intentionally NOT vendored here: provisioning never
// touches the panel (the eInk holds its last image at zero power), so this
// sketch stays focused on the radio + NVS + HTTP. Panel + provisioning compose
// in the integrated production firmware (Phase 7).
//
// Board:  esp32:esp32:esp32s3
// Build:  arduino-cli compile --fqbn esp32:esp32:esp32s3 firmware/provisioning
// Upload: arduino-cli upload -p /dev/cu.usbserial-XXXX \
//           --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/provisioning

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <esp_system.h>

// ----- MCU-specific (mark for the Phase 7 ESP32-C3 port) -------------------
// Pinhole factory-reset button. Production target is the ESP32-C3, where GPIO9
// is the strapping/boot pin and carries a natural pull-up — that is why #39
// suggests it. On the ESP32-S3 dev board GPIO9 is a normal GPIO; INPUT_PULLUP
// works either way. Phase 7 / SCAD #50 confirm this lands on the recessed
// back-panel pinhole. Pressed reads LOW (button shorts the pin to ground).
#define PINHOLE_GPIO 9
#define PINHOLE_HOLD_MS 5000  // full-press hold that triggers a factory reset

// ----- Captive-portal network ----------------------------------------------
#define DNS_PORT 53
#define HTTP_PORT 80
#define JOIN_TIMEOUT_MS 15000  // how long /save waits for the home Wi-Fi to join

// ----- NVS (survives deep sleep + power loss; cleared by the pinhole) -------
// Keys: ssid / pass (home Wi-Fi), server (optional custom API base, empty =
// default infobento.com), provisioned (bool — set only AFTER a confirmed join).
static const char* NVS_NAMESPACE = "infobento";

Preferences prefs;
DNSServer dns;
WebServer server(HTTP_PORT);
const IPAddress AP_IP(192, 168, 4, 1);
const IPAddress AP_MASK(255, 255, 255, 0);

static bool g_apMode = false;            // true while the captive portal is up
static unsigned long g_pressStart = 0;   // millis() the pinhole went down; 0 = up

// ----- Identity -------------------------------------------------------------

// AP SSID: "InfoBento-XXXX" from the last two MAC bytes (4 hex chars), matching
// CONNECTIVITY.md. Stable per device, so a re-provisioning user sees the same
// network name.
String apSsid() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char ssid[16];
  snprintf(ssid, sizeof(ssid), "InfoBento-%02X%02X", mac[4], mac[5]);
  return String(ssid);
}

// Display id shown on the success page so the buyer can pair from the web. This
// is a MAC-derived PLACEHOLDER: the real device id is the opaque bearer token
// minted server-side and printed on the QR sticker (#78/#80). Phase 7 wires the
// minted id in; until then the full MAC uniquely identifies the dev unit.
String deviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char id[13];
  snprintf(id, sizeof(id), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(id);
}

// ----- NVS helpers ----------------------------------------------------------

void clearCreds() {
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.remove("server");
  prefs.putBool("provisioned", false);
}

// Persist creds and mark the device provisioned. Called ONLY after a confirmed
// join, so a failed attempt never strands bad creds in NVS (the next boot would
// otherwise loop on un-joinable creds before falling back to AP).
void saveCreds(const String& ssid, const String& pass, const String& serverUrl) {
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("server", serverUrl);
  prefs.putBool("provisioned", true);
}

// ----- HTML (white bg, monospace, thin black borders — InfoBento minimal) ---
// Inlined <style>, no JS, no external assets: the page must render on a phone
// that has NO internet (it's talking to the device's AP). Comfortably under the
// 30 KB-gzipped budget — it's a few KB of text even with a full scan list.

const char* PAGE_STYLE =
  "<style>"
  "*{box-sizing:border-box}"
  "body{background:#fff;color:#000;font-family:ui-monospace,Menlo,Consolas,monospace;"
  "max-width:30rem;margin:0 auto;padding:1.5rem;line-height:1.5}"
  "h1{font-size:1.2rem;border-bottom:1px solid #000;padding-bottom:.5rem}"
  "label{display:block;margin:1rem 0 .25rem;font-size:.85rem}"
  "input,select,button{width:100%;padding:.6rem;font:inherit;background:#fff;"
  "color:#000;border:1px solid #000;border-radius:0}"
  "button{margin-top:1.5rem;cursor:pointer;font-weight:bold}"
  "button:hover{background:#000;color:#fff}"
  ".hint{font-size:.75rem;color:#444;margin-top:.25rem}"
  ".err{border:1px solid #000;padding:.75rem;margin-top:1rem}"
  "</style>";

// HTML-escape SSIDs before embedding them in <option>s / attributes so an AP
// named with quotes or angle brackets can't break the markup.
String htmlEscape(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    switch (c) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      case '\'': out += "&#39;"; break;
      default: out += c;
    }
  }
  return out;
}

// Build the setup form. `error` (optional) renders a retry banner after a failed
// join. Scans synchronously so the dropdown is populated without any client JS.
String setupPage(const String& error) {
  int n = WiFi.scanNetworks();

  String html = "<!doctype html><html><head><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>InfoBento setup</title>";
  html += PAGE_STYLE;
  html += "</head><body><h1>InfoBento setup</h1>";
  if (error.length()) {
    html += "<div class='err'>" + htmlEscape(error) + "</div>";
  }
  html += "<p>Connect your InfoBento to Wi-Fi.</p>";
  html += "<form method='POST' action='/save'>";

  html += "<label for='ssid'>Network</label><select id='ssid' name='ssid'>";
  if (n <= 0) {
    html += "<option value=''>(no networks found — use manual entry)</option>";
  } else {
    for (int i = 0; i < n; i++) {
      String s = htmlEscape(WiFi.SSID(i));
      html += "<option value='" + s + "'>" + s + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
  }
  html += "</select>";
  WiFi.scanDelete();

  html += "<label for='manual'>…or hidden network name</label>";
  html += "<input id='manual' name='manual' autocomplete='off' placeholder='leave blank to use the list'>";

  html += "<label for='pass'>Password</label>";
  html += "<input id='pass' name='pass' type='password' autocomplete='off' placeholder='home Wi-Fi password'>";

  html += "<label for='server'>Server URL (optional)</label>";
  html += "<input id='server' name='server' autocomplete='off' placeholder='https://infobento.com'>";
  html += "<div class='hint'>Leave blank unless you self-host.</div>";

  html += "<button type='submit'>Connect</button></form></body></html>";
  return html;
}

String successPage() {
  String id = deviceId();
  String html = "<!doctype html><html><head><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>InfoBento connected</title>";
  html += PAGE_STYLE;
  html += "</head><body><h1>Connected</h1>";
  html += "<p>Your InfoBento joined the network. You can disconnect from the "
          "<b>" + htmlEscape(apSsid()) + "</b> Wi-Fi now.</p>";
  html += "<p>Finish setup in your browser:</p>";
  html += "<p><b>infobento.com/onboard?device=" + id + "</b></p>";
  html += "<div class='hint'>Device id: " + id + "</div>";
  html += "</body></html>";
  return html;
}

// ----- Wi-Fi join -----------------------------------------------------------

// Try to join the home network while the AP stays up (AP_STA), so we can serve
// the result page to the still-connected phone. Returns true on association.
bool tryJoin(const String& ssid, const String& pass) {
  Serial.printf("[IB] joining '%s' ...\n", ssid.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < JOIN_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[IB] joined, IP ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("[IB] join FAILED");
  WiFi.disconnect(false);  // drop the half-open STA attempt; keep the AP up
  return false;
}

// ----- HTTP handlers --------------------------------------------------------

void redirectToPortal() {
  // 302 to the portal root. Captive-network probes that get a redirect (instead
  // of their expected 204/"Success"/ncsi body) make the OS pop the sign-in
  // browser straight onto our setup page.
  server.sendHeader("Location", String("http://") + AP_IP.toString() + "/");
  server.send(302, "text/plain", "");
}

void handleRoot() {
  server.send(200, "text/html", setupPage(""));
}

void handleSave() {
  // Prefer the manually-typed (hidden) SSID; otherwise the scanned selection.
  String manual = server.arg("manual");
  manual.trim();
  String ssid = manual.length() ? manual : server.arg("ssid");
  ssid.trim();
  String pass = server.arg("pass");
  String serverUrl = server.arg("server");
  serverUrl.trim();

  if (!ssid.length()) {
    server.send(200, "text/html", setupPage("Pick a network or type a name."));
    return;
  }

  if (tryJoin(ssid, pass)) {
    // Persist only after the join is confirmed (see saveCreds note).
    saveCreds(ssid, pass, serverUrl);
    Serial.println("[IB] provisioned -> creds saved");
    server.send(200, "text/html", successPage());
    // Give the success page time to flush to the phone, then reboot into the
    // normal provisioned firmware path.
    delay(1500);
    Serial.println("[IB] rebooting into provisioned mode");
    ESP.restart();
  } else {
    server.send(200, "text/html",
                setupPage("Could not join that network. Check the password and try again."));
  }
}

// ----- AP / portal lifecycle ------------------------------------------------

void startAP() {
  String ssid = apSsid();
  Serial.printf("[IB] no creds -> AP mode, SSID '%s' (open)\n", ssid.c_str());

  WiFi.mode(WIFI_AP_STA);  // AP for the portal; STA so /save can test-join
  WiFi.softAPConfig(AP_IP, AP_IP, AP_MASK);
  WiFi.softAP(ssid.c_str());  // open network — the captive portal is the gate
  delay(100);
  Serial.print("[IB] AP IP ");
  Serial.println(WiFi.softAPIP());

  // Wildcard DNS: resolve every name to us so any probe/URL lands on the portal.
  dns.start(DNS_PORT, "*", AP_IP);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  // OS captive-portal probes -> redirect to the setup page.
  server.on("/hotspot-detect.html", HTTP_GET, redirectToPortal);  // Apple
  server.on("/generate_204", HTTP_GET, redirectToPortal);         // Android
  server.on("/gen_204", HTTP_GET, redirectToPortal);              // Android (alt)
  server.on("/ncsi.txt", HTTP_GET, redirectToPortal);             // Microsoft
  server.on("/connecttest.txt", HTTP_GET, redirectToPortal);      // Windows 10+
  server.onNotFound(redirectToPortal);  // anything else -> portal (captive catch-all)
  server.begin();

  g_apMode = true;
  Serial.println("[IB] captive portal up");
}

// ----- Pinhole factory reset ------------------------------------------------

// Clears the saved Wi-Fi credentials and reboots; the device returns to AP mode
// on the next boot. Same effect as the web-side "forget Wi-Fi" (#39).
void factoryReset() {
  Serial.println("[IB] PINHOLE 5s hold -> factory reset (clearing creds)");
  clearCreds();
  delay(200);
  ESP.restart();
}

// Detect a continuous 5-second hold (not just a momentary tap). Debounced by the
// requirement to stay LOW for the whole window; any release resets the timer.
void checkPinhole() {
  bool pressed = (digitalRead(PINHOLE_GPIO) == LOW);
  if (pressed) {
    if (g_pressStart == 0) {
      g_pressStart = millis();
      Serial.println("[IB] pinhole down — hold 5s for factory reset");
    } else if (millis() - g_pressStart >= PINHOLE_HOLD_MS) {
      factoryReset();  // does not return
    }
  } else {
    if (g_pressStart != 0) Serial.println("[IB] pinhole released");
    g_pressStart = 0;
  }
}

// ----- Lifecycle ------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(200);
  prefs.begin(NVS_NAMESPACE, false);
  pinMode(PINHOLE_GPIO, INPUT_PULLUP);

  bool provisioned = prefs.getBool("provisioned", false);
  String ssid = prefs.getString("ssid", "");
  Serial.printf("[IB E1001] Phase 6 provisioning — provisioned=%d, ssid='%s'\n",
                provisioned ? 1 : 0, ssid.c_str());

  if (provisioned && ssid.length()) {
    // Returning device: try the saved network. On success the steady-state
    // pull/deep-sleep firmware (Phases 3-5) takes over from here; on the bench
    // this sketch just proves the join and idles (watching the pinhole). On
    // failure (network moved / password changed) fall back to provisioning.
    WiFi.mode(WIFI_STA);
    if (tryJoin(ssid, prefs.getString("pass", ""))) {
      Serial.println("[IB] provisioned + online -> hand off to pull loop (idle on bench)");
      return;  // loop() keeps watching the pinhole
    }
    Serial.println("[IB] saved creds did not join -> re-entering AP mode");
  }

  startAP();
}

void loop() {
  if (g_apMode) {
    dns.processNextRequest();
    server.handleClient();
  }
  checkPinhole();
  delay(5);  // light yield so a tight AP-idle loop doesn't peg the CPU
}
