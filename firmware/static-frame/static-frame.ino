// InfoBento firmware — Phase 2: push a native InfoBento frame to the E1001 panel.
//
// Proves the framebuffer-translation path end to end:
//   InfoBento renderer 2bpp buffer (0=white..3=black, MSB-first, 4px/byte)
//     -> convention flip to the panel canvas (0=black..3=white)
//     -> UC8179 two-bit-plane upload (Seeed's verified LUTs + encoding)
//
// The frame in ramp_frame.h is a 4-band vertical gray ramp generated in the
// renderer's EXACT native format, so a correct render shows four clean bands
// left->right: WHITE, LIGHT, DARK, BLACK.
//
// UC8179 driver (pins, LUTs, init, two-plane upload, refresh, sleep) is vendored
// from Seeed_GxEPD2's GxEPD2_reTerminal_E1001_Gray4 example. The upload keeps that
// example's internal waveform-polarity inversion (`3 - gray`) UNCHANGED; our only
// added transform is the convention flip below.
//
// Board:  esp32:esp32:esp32s3
// Upload: arduino-cli upload -p /dev/cu.usbserial-1430 \
//           --fqbn 'esp32:esp32:esp32s3:UploadSpeed=115200' firmware/static-frame

#include <SPI.h>
#include "ramp_frame.h"

// ===== Pin mapping (E1001) =====
#define EPD_SCK_PIN   7
#define EPD_MOSI_PIN  9
#define EPD_CS_PIN    10
#define EPD_DC_PIN    11
#define EPD_RES_PIN   12
#define EPD_BUSY_PIN  13

#define EPD_W  800
#define EPD_H  480

SPIClass hspi(HSPI);
SPISettings spiSet(2000000, MSBFIRST, SPI_MODE0);

// UC8179 gray LUTs (verbatim from Seeed_GFX UC8179_Defines.h via Seeed_GxEPD2).
// 7 phases x 6 bytes each.
static const uint8_t LUT_VCOM_GRAY[] = {
  0x00,0x00,0x06,0x08,0x07,0x01, 0x00,0x06,0x0A,0x0B,0x0A,0x01,
  0x00,0x03,0x03,0x00,0x00,0x03, 0x00,0x05,0x09,0x06,0x06,0x01,
  0x00,0x02,0x02,0x0A,0x0A,0x01, 0x00,0x0A,0x11,0x06,0x07,0x01,
  0x00,0x02,0x01,0x02,0x01,0x01,
};
static const uint8_t LUT_WW_GRAY[] = {
  0x15,0x00,0x06,0x08,0x07,0x01, 0x54,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x2A,0x05,0x09,0x06,0x06,0x01,
  0xAA,0x02,0x02,0x0A,0x0A,0x01, 0x00,0x0A,0x11,0x06,0x07,0x01,
  0x28,0x02,0x01,0x02,0x01,0x01,
};
static const uint8_t LUT_KW_GRAY[] = {
  0x2A,0x00,0x06,0x08,0x07,0x01, 0x59,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x5A,0x05,0x09,0x06,0x06,0x01,
  0xA8,0x02,0x02,0x0A,0x0A,0x01, 0x45,0x0A,0x11,0x06,0x07,0x01,
  0xA8,0x02,0x01,0x02,0x01,0x01,
};
static const uint8_t LUT_WK_GRAY[] = {
  0x16,0x00,0x06,0x08,0x07,0x01, 0xA0,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x99,0x05,0x09,0x06,0x06,0x01,
  0xA0,0x02,0x02,0x0A,0x0A,0x01, 0x40,0x0A,0x11,0x06,0x07,0x01,
  0x20,0x02,0x01,0x02,0x01,0x01,
};
static const uint8_t LUT_KK_GRAY[] = {
  0x26,0x00,0x06,0x08,0x07,0x01, 0x6A,0x06,0x0A,0x0B,0x0A,0x01,
  0x90,0x03,0x03,0x00,0x00,0x03, 0x65,0x05,0x09,0x06,0x06,0x01,
  0x50,0x02,0x02,0x0A,0x0A,0x01, 0x10,0x0A,0x11,0x06,0x07,0x01,
  0x10,0x02,0x01,0x02,0x01,0x01,
};
static const uint8_t CMD_USER_GRAY[] = { 0x17, 0x3F, 0x3F, 0x07, 0x06, 0x12 };

// ===== UC8179 SPI helpers =====
void checkBusy() { delay(10); while (!digitalRead(EPD_BUSY_PIN)) delay(10); }

void writeCommand(uint8_t cmd) {
  hspi.beginTransaction(spiSet);
  digitalWrite(EPD_DC_PIN, LOW); digitalWrite(EPD_CS_PIN, LOW);
  hspi.transfer(cmd);
  digitalWrite(EPD_CS_PIN, HIGH); digitalWrite(EPD_DC_PIN, HIGH);
  hspi.endTransaction();
}
void writeData(uint8_t data) {
  hspi.beginTransaction(spiSet);
  digitalWrite(EPD_CS_PIN, LOW);
  hspi.transfer(data);
  digitalWrite(EPD_CS_PIN, HIGH);
  hspi.endTransaction();
}
void writeLUT(uint8_t cmd, const uint8_t* lut, uint16_t len) {
  writeCommand(cmd);
  for (uint16_t i = 0; i < len; i++) writeData(lut[i]);
}

void initGrayMode() {
  digitalWrite(EPD_RES_PIN, LOW); delay(10);
  digitalWrite(EPD_RES_PIN, HIGH); delay(10);
  checkBusy();
  writeCommand(0x01); writeData(0x07);
  writeData(CMD_USER_GRAY[0]); writeData(CMD_USER_GRAY[1]);
  writeData(CMD_USER_GRAY[2]); writeData(CMD_USER_GRAY[3]);
  writeCommand(0x30); writeData(CMD_USER_GRAY[4]);
  writeCommand(0x82); writeData(CMD_USER_GRAY[5]);
  writeCommand(0x06); writeData(0x27); writeData(0x27); writeData(0x28); writeData(0x17);
  writeCommand(0x04); delay(100); checkBusy();
  writeCommand(0x00); writeData(0x3F);
  writeCommand(0xE3); writeData(0x88);
  writeCommand(0x50); writeData(0x10); writeData(0x07);
  writeCommand(0x52); writeData(0x00);
  writeCommand(0x61);
  writeData(EPD_W >> 8); writeData(EPD_W & 0xFF);
  writeData(EPD_H >> 8); writeData(EPD_H & 0xFF);
  writeLUT(0x20, LUT_VCOM_GRAY, sizeof(LUT_VCOM_GRAY)); checkBusy();
  writeLUT(0x21, LUT_WW_GRAY,   sizeof(LUT_WW_GRAY));   checkBusy();
  writeLUT(0x22, LUT_KW_GRAY,   sizeof(LUT_KW_GRAY));   checkBusy();
  writeLUT(0x23, LUT_WK_GRAY,   sizeof(LUT_WK_GRAY));
  writeLUT(0x24, LUT_KK_GRAY,   sizeof(LUT_KK_GRAY));
  Serial.println(F("[IB] UC8179 gray mode init done"));
}

// Upload a panel-convention 2bpp buffer (0=black..3=white) as two bit-planes.
// Keeps the example's internal `3 - gray` waveform-polarity inversion verbatim.
void uploadFrame(const uint8_t* fb) {
  const uint32_t bytesPerRow = EPD_W / 4;  // 200
  for (uint8_t plane = 0; plane < 2; plane++) {
    writeCommand(plane == 0 ? 0x10 : 0x13);  // DTM1 (low bit) / DTM2 (high bit)
    hspi.beginTransaction(spiSet);
    digitalWrite(EPD_CS_PIN, LOW);
    for (uint16_t row = 0; row < EPD_H; row++) {
      const uint8_t* rp = fb + uint32_t(row) * bytesPerRow;
      for (uint16_t col8 = 0; col8 < EPD_W / 8; col8++) {
        uint8_t out = 0;
        for (uint8_t bit = 0; bit < 8; bit++) {
          uint16_t px = col8 * 8 + bit;
          uint8_t shift = (3 - (px & 3)) * 2;
          uint8_t gray = 3 - ((rp[px / 4] >> shift) & 0x03);  // waveform polarity
          uint8_t want = (plane == 0) ? (gray & 0x01) : (gray & 0x02);
          if (want) out |= (0x80 >> bit);
        }
        hspi.transfer(out);
      }
    }
    digitalWrite(EPD_CS_PIN, HIGH);
    hspi.endTransaction();
  }
  Serial.println(F("[IB] Frame uploaded (2 bit planes)"));
}

void refreshDisplay() {
  unsigned long t0 = millis();
  writeCommand(0x12); delay(100); checkBusy();
  Serial.printf("[IB] Refresh %lu ms\n", millis() - t0);
}
void sleepDisplay() {
  writeCommand(0x02); checkBusy();
  writeCommand(0x07); writeData(0xA5);
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println(F("[IB E1001] Static frame: InfoBento ramp"));

  pinMode(EPD_CS_PIN, OUTPUT);  digitalWrite(EPD_CS_PIN, HIGH);
  pinMode(EPD_DC_PIN, OUTPUT);  digitalWrite(EPD_DC_PIN, HIGH);
  pinMode(EPD_RES_PIN, OUTPUT); digitalWrite(EPD_RES_PIN, HIGH);
  pinMode(EPD_BUSY_PIN, INPUT);
  hspi.begin(EPD_SCK_PIN, -1, EPD_MOSI_PIN, -1);

  // Translate InfoBento native (0=white..3=black) -> panel canvas (0=black..3=white).
  // Identical 2bpp MSB-first packing means the per-pixel `3 - level` flip is exactly
  // a per-byte bitwise NOT (0x00<->0xFF, 0x55<->0xAA). Verified against draw.ts.
  uint8_t* canvas = (uint8_t*)malloc(IB_FRAME_LEN);
  if (!canvas) { Serial.println(F("[IB] FATAL: alloc 96KB failed")); while (true) delay(1000); }
  for (uint32_t i = 0; i < IB_FRAME_LEN; i++) canvas[i] = ~IB_FRAME[i];
  Serial.printf("[IB] Translated %u bytes\n", IB_FRAME_LEN);

  initGrayMode();
  uploadFrame(canvas);
  refreshDisplay();
  sleepDisplay();
  free(canvas);
  Serial.println(F("[IB] Done. Expect 4 bands L->R: WHITE LIGHT DARK BLACK"));
}

void loop() {}
