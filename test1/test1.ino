#include <FastLED.h>

// LED 燈條設定：沿用你原本程式
#define LED_PIN 13
#define NUM_LEDS 910
#define BRIGHTNESS 5
#define LED_TYPE WS2812
#define COLOR_ORDER GRB

CRGB leds[NUM_LEDS];

void setup() {
  Serial.begin(115200);

  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);

  FastLED.clear();
  FastLED.show();

  Serial.println("ESP32 + LED strip loop test start");
}

void loop() {
  // 測試 1：全部紅色
  fill_solid(leds, NUM_LEDS, CRGB::Red);
  FastLED.show();
  Serial.println("All Red");
  delay(2000);

  // 測試 2：全部綠色
  fill_solid(leds, NUM_LEDS, CRGB::Green);
  FastLED.show();
  Serial.println("All Green");
  delay(2000);

  // 測試 3：全部藍色
  fill_solid(leds, NUM_LEDS, CRGB::Blue);
  FastLED.show();
  Serial.println("All Blue");
  delay(2000);

  // 測試 4：全部白色
  fill_solid(leds, NUM_LEDS, CRGB::White);
  FastLED.show();
  Serial.println("All White");
  delay(2000);

  // 測試 5：一顆一顆往後掃，方便找哪裡開始壞
  Serial.println("Single LED scan start");

  for (int i = 0; i < NUM_LEDS; i++) {
    FastLED.clear();
    leds[i] = CRGB::White;
    FastLED.show();

    Serial.print("LED index: ");
    Serial.println(i);

    delay(30);  // 想看慢一點可以改 80 或 100
  }

  // 測試 6：每 10 顆一組掃描，比較容易看長燈條
  Serial.println("10 LED block scan start");

  for (int i = 0; i < NUM_LEDS; i += 10) {
    FastLED.clear();

    for (int j = 0; j < 10; j++) {
      if (i + j < NUM_LEDS) {
        leds[i + j] = CRGB::White;
      }
    }

    FastLED.show();

    Serial.print("LED block start index: ");
    Serial.println(i);

    delay(100);
  }

  // 全暗 1 秒後重新循環
  FastLED.clear();
  FastLED.show();
  Serial.println("Restart loop");
  delay(1000);
}