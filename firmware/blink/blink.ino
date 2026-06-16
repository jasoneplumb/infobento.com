// InfoBento firmware — Phase 1 bring-up sketch (reTerminal E1001, ESP32-S3).
//
// Proves the toolchain + board boot + serial path BEFORE touching the eInk
// panel. Serial routes to UART0 (the onboard USB-UART bridge -> /dev/cu.usbserial-*)
// because the esp32 core's default CDCOnBoot is Disabled. If you ever switch the
// board option to "USB CDC On Boot: Enabled", Serial moves to the native USB
// port (/dev/cu.usbmodem*) instead and these prints vanish from the bridge port.
//
// Board:  esp32:esp32:esp32s3   (ESP32S3 Dev Module)
// Upload: arduino-cli upload -p /dev/cu.usbserial-1430 --fqbn esp32:esp32:esp32s3 firmware/blink

// Generic ESP32S3 Dev Module does not always define LED_BUILTIN. Guard it so the
// sketch compiles regardless; a wrong GPIO just means no visible LED (harmless).
#ifndef LED_BUILTIN
#define LED_BUILTIN 21
#endif

void setup() {
  Serial.begin(115200);
  delay(1000);  // let the bridge enumerate before the first write
  Serial.println();
  Serial.println("InfoBento reTerminal E1001: boot OK");
  Serial.printf("chip: %s rev%d, %d cores, %d MHz\n",
                ESP.getChipModel(), ESP.getChipRevision(),
                ESP.getChipCores(), ESP.getCpuFreqMHz());
  Serial.printf("flash: %u bytes, free heap: %u bytes\n",
                ESP.getFlashChipSize(), ESP.getFreeHeap());
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  static uint32_t n = 0;
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
  Serial.printf("alive #%u (uptime %lus)\n", ++n, millis() / 1000);
}
