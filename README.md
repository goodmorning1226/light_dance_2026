# LED Dance 2026 — 視覺化編舞與 C++ 產生器

為 `light_dance_2026.ino`（ESP32 + FastLED + MQTT）打造的 Web 編舞工具：
**編輯舞步 → localStorage 自動儲存 → 排序多首舞 → 一鍵匯出 C++ 程式碼**，全程不需後端。

底層 Arduino 程式碼維持不動；本工具只產生最上層的 `dance*()` / `play*_*()` 函式，
呼叫 .ino 內既有的 `Animation::*` factories、`fillBodyPart`、`timelineDelay`、
`stopEffect`、`startTimeline` 等 API。

---

## 啟動 Next.js 專案

```bash
npm install            # 第一次執行需要
npm run dev            # http://localhost:3000
npm run build          # production build 驗證
npm test               # 跑全部單元測試
```

需求：Node.js 16.14 以上（Next 13.5 設計支援的版本）。

---

## 三個頁面

| 路由 | 用途 |
|---|---|
| `/`              | **Editor**——編輯一首舞：dancers / sections / steps / actions / 視覺 preview |
| `/arrangement`   | **Arrangement**——排序多首舞、設 MQTT command、匯出完整 C++ |
| `/library`       | **Library**——管理匯入的 custom animations |

---

## 如何建立一首舞

1. 開 Editor (`/`)，header 點 `+ New` 開一首空舞。
2. 在左側 **Dance Meta** 卡片設定：
   - **Song name**（會 sanitize 成 `dance<SafeName>` C++ 函式名）
   - **BPM**（每分鐘拍數）
   - **Beat unit**：`1` / `1/2` / `1/4`，編輯器最小拍子單位
   - **Dancers**：id 1..7 對應 .ino 中 `DANCER` / `ROLE` 常數，name 是任意字串（中文 OK）
3. 加 **Section**（例：Intro / Verse / Chorus）。每個 section 會產生一個 `play<Dance>_<Section>()` C++ 函式。
4. 在 section 內加 **Step**：
   - **durationBeats**：這 step 持續幾拍（支援 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4 …）
   - **clearBefore**：勾選 → 開始時 `fill_solid(leds, NUM_LEDS, CRGB::Black)`
5. 在 step 內加 **Action**（每 step 可多個）：
   - **Static action**：選 dancers + body parts（多選）+ color
   - **Animation action**：選 dancers + animationId + body part（單選）+ color
6. 編輯時自動存到 localStorage。Header 顯示 `Saved HH:MM:SS`。

### Visual Preview（右側）

- **Visual** tab：以 8 個方塊組成的小人預覽每位舞者該 step 的顏色與 animation label
- 點 step card 上的 `👁` → 把該 step 顯示在 preview
- `▶ Play` → 依 BPM 與 durationBeats 自動播放，preview 跟著移動 selection（不播音樂）
- `↺ Reset` → 回到第一步並暫停

### 為什麼 UI 隱藏了 Multi / Sequential

`Multi` / `Sequential` 需要巢狀 sub-animations，第一版編輯器尚未提供巢狀編輯介面。
資料層仍合法（JSON 匯入時會驗證 `subAnimations` 非空），只是下拉選單暫時藏起來。

---

## 如何匯出單首 Dance JSON

Editor header → **Export JSON** → 下載 `<dance-name>.json`。

或者在 Arrangement 頁，每個 item 卡片右側有 **Export Dance JSON** 按鈕。

---

## 如何匯入別人的 Dance JSON

兩種入口：

1. **Editor** 頁 header → **Import JSON** → 取代目前正在編輯的舞。
2. **Arrangement** 頁 → **Import Dance JSON** → 會 prompt 詢問 MQTT command，匯入後直接放進 arrangement。

匯入失敗時會顯示完整 JSON 路徑的錯誤訊息，例如：

> `Invalid dance file: Unknown body part "nose" (at sections[0].steps[0].actions[0].parts[0])`

JSON 完整 schema、欄位規則、最小可匯入範例請見下方〈[JSON 匯入格式規格](#json-匯入格式規格)〉。

---

## 如何在排舞頁排序多首舞

1. 從 Editor 點 **Add to Arrangement** 把當前舞加入（會 prompt MQTT command）。
2. 切到 `/arrangement`。
3. 每個 item 提供：
   - 編輯 mqttCommand（直接改輸入框）
   - `↑ ↓` 上下移
   - `⧉ Duplicate` 複製一個指向同 dance 的 item
   - `Edit` 跳回 Editor 編輯該 dance（修改 dance 後自動同步回 program 的 snapshot）
   - `Delete` 移除
4. **Export Program JSON** 匯出整套（含所有 dance snapshots）。

---

## 匯出 Offline C++

1. `/arrangement` 右側 **Export Panel**。
2. **mode** 切到 `Offline`。
3. 按 **Copy C++** 或 **Download .ino** / **Download .cpp**。

產出包含：
- 所有 dance functions
- 所有 referenced custom animation functions（去重）
- `void timelineDelaySafe(unsigned long interval)` ─ `timelineDelay` 的 offline 替代版（用 `delay(1)` 取代 `client.loop()`）
- `#define OFFLINE_TEST 1`
- `void offlineTest()` ─ 依 arrangement 順序呼叫每首 dance

⚠️ **如果 custom animation 的 cppCode 含 `client.loop()` 或 `setup_wifi()` 等 MQTT 呼叫**，
產出會在該 function 上方加警告 comment（在 Library 頁也會顯示紅色警示）。

---

## 匯出 Online MQTT C++

1. `/arrangement` → **Export Panel** → **mode** = `Online MQTT`。
2. **Copy C++** / Download。

產出包含：
- 所有 dance functions（內部使用原本的 `timelineDelay()` + 動畫迴圈會 call `client.loop()`）
- 所有 referenced custom animation functions（去重）
- 註解區塊形式的 **callback snippet**：

```cpp
/*
    else if (messageTemp == "ON_OPENING") {
        Serial.println("Triggering: My Dance");
        before();
        danceRunning = true;
        danceMyDance();
        showEndSignal();
    }
*/
```

把這段內容剪貼到 .ino 的 `callback()` 既有 `else if` 鏈尾端即可。

---

## 把產出的 code 貼回 light_dance_2026.ino

### Online MQTT 版

1. 把所有 `// === Dance: ... ===` 區塊（含 `#define BPM_*` / `void dance*()` / `void play*_*()`）
   貼到 .ino 中 `setup()` 之前（任何 global scope 位置）。
2. 把 custom animation 的 `void <functionName>(...)` 函式貼到同一區塊。
3. 找到 `callback()`，把產出最下面**註解區塊內**的 `else if (...)` 分支貼到既有 `else if (messageTemp == "OFF")` 之後。
4. Build & upload。
5. 在 broker 對 topic `LED_TOPIC` 發布 `ON_OPENING` 等指令觸發舞蹈。

### Offline 版

1. 把所有 dance + custom animation 函式貼到 .ino 中 `setup()` 之前（同上）。
2. 額外把產出開頭的 `void timelineDelaySafe(...)` 函式也貼進來。
3. 在 `setup()` **註解掉** WiFi / MQTT 相關呼叫：
   ```cpp
   // setup_wifi();
   // client.setServer(mqtt_server, 1883);
   // client.setCallback(callback);
   ```
4. 在 `setup()` 結尾加：
   ```cpp
   delay(2000);
   offlineTest();
   ```
5. 在 `loop()` 中註解掉 `client.loop()` 與 `reconnect()`（或乾脆讓 loop 空著）。
6. Build & upload，開機後自動跑一輪。

---

## Offline 與 Online 版本差異

| 項目 | Offline | Online MQTT |
|---|---|---|
| 觸發方式 | `setup()` 結尾呼叫 `offlineTest()` 自動跑一次 | MQTT broker 發送對應 mqttCommand |
| WiFi / MQTT | 不需要、可整段註解掉 | 必須保留 .ino 既有的 WiFi/MQTT 連線流程 |
| Beat 計時 | `timelineDelaySafe(...)`（產出內附） | `timelineDelay(...)`（用 .ino 既有的） |
| 動畫 while-loop | `FastLED.show(); delay(1);` | `FastLED.show(); client.loop(); delay(1);` |
| 額外定義 | `#define OFFLINE_TEST 1` | （無） |
| Custom animation 警告 | 若 cppCode 含 `client.*` 會插入 ⚠️ WARNING comment | （無，假設 MQTT 已就緒） |
| 適用場景 | 線下測試、單機演出、離線排練 | 多人同步、有中控的正式演出 |

兩個版本**都不會**重新定義 `LED_PIN` / `NUM_LEDS` / `BodyPart` / `Animation` / `fillBodyPart` 等
.ino 已經存在的底層符號——產出純粹是上層編排函式。

---

## JSON 匯入格式規格

匯入時 io 層會做嚴格驗證：缺欄位、型別錯誤、未列舉值都會立即拒絕，
錯誤訊息含完整 JSON path（例如 `at sections[0].steps[1].actions[0].parts[0]`）。
被拒絕的 JSON **不會**部分匯入，原本 localStorage 內的資料保持不動。

三種 JSON 透過頂層 `type` 欄位辨識：

| `type` 值 | 對應 JSON | 匯入入口 |
|---|---|---|
| `"led-dance"`     | Dance JSON          | Editor → **Import JSON** ／ Arrangement → **Import Dance JSON** |
| `"led-program"`   | Program JSON        | （目前僅匯出；之後可逐 item 匯入單首 Dance JSON） |
| `"led-animation"` | Custom Animation JSON | Library → **Import Custom Animation JSON** |

匯錯類型直接擋下，例如：

```
Invalid dance file: Expected type "led-dance", got "led-program" (at type)
```

---

### 1. Dance JSON  (`type: "led-dance"`)

**頂層欄位**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `schemaVersion`     | number | ✓ | 任意正整數，目前統一為 `1` |
| `type`              | `"led-dance"` | ✓ | 字面常數 |
| `id`                | string | ✓ | 唯一識別 |
| `name`              | string | ✓ | 顯示名稱（會 sanitize 成 `dance<SafeName>` C++ 函式名） |
| `bpm`               | number | ✓ | `> 0` |
| `beatUnit`          | number | ✓ | `> 0`，建議 `1` / `0.5` / `0.25` |
| `dancers`           | `Dancer[]` | ✓ | |
| `sections`          | `DanceSection[]` | ✓ | |
| `customAnimations`  | `CustomAnimation[]` | ✓ | 內嵌快照；沒用到請填 `[]` |

**Dancer**

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`   | number | 對應 .ino `DANCER` / `ROLE` 整數 |
| `name` | string | 任意（中文 OK） |

**DanceSection**

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`    | string | 唯一 |
| `name`  | string | 任意；同名 section 在 codegen 階段會自動加 `_1` / `_2` 後綴避免重定義 |
| `steps` | `DanceStep[]` | |

**DanceStep**

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`            | string  | 唯一 |
| `durationBeats` | number  | `> 0`；常用 `0.25` / `0.5` / `1` / `2` / `4` |
| `clearBefore`   | boolean | `true` 才會在 step 開頭 emit `fill_solid(leds, NUM_LEDS, CRGB::Black)`；`false` 表示「保持上一拍狀態」是合法行為 |
| `actions`       | `DanceAction[]` | 同一 step 內的 dancers 必須互斥（同一個 dancer 不能出現在兩個 action） |

**DanceAction**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `type`           | `"static"` ｜ `"animation"` | ✓ | discriminator |
| `dancers`        | `number[]` | ✓ | dancer.id 列表，可空 |
| `color`          | `ColorRGB` | ✓ | `{ r, g, b }`，每 channel 0..255 |
| `parts`          | `BodyPartName[]` | static 用 | 多選 body parts |
| `part`           | `BodyPartName` | animation 用 | 單選 body part；`Rainbow` 會忽略此欄位 |
| `animationId`    | `BuiltInAnimationId` ｜ `CustomAnimation.id` | animation 必填 | 見下方枚舉 |
| `subAnimations`  | `DanceAction[]` | `Multi` / `Sequential` 必填 | 非空，每個 sub 必須 `type: "animation"` |

跨欄位驗證：

- `static` action 帶 `subAnimations` → 拒絕：`static action cannot have subAnimations`
- `animationId` 是 `Multi` 或 `Sequential` 但 `subAnimations` 缺或空 → 拒絕：`Multi / Sequential animation requires non-empty subAnimations.`
- `animationId` 不是 built-in，也不在父 dance 的 `customAnimations` 裡 → 拒絕：`Unknown animationId "<id>" — not a built-in animation and not declared in customAnimations`

**ColorRGB**

```json
{ "r": 255, "g": 230, "b": 25 }
```

每 channel 必須是有限數字且在 `0..255`，超範圍會被 `Color channel out of range 0..255` 拒絕。

**BodyPartName**（30 個合法值，必須**完全等同** .ino 內 `BodyPart <name>;` 宣告）

```
whole
hat            hatMark         beforeHatMark   afterHatMark
body           shirt           collar          lowerShirt      leftZipper      rightZipper
arms           leftArm         rightArm        leftUpperArm    leftLowerArm    rightUpperArm   rightLowerArm
hands          leftHand        rightHand
legs           leftLeg         rightLeg        crotch          leftCrotch      rightCrotch
feet           leftFoot        rightFoot
```

任何不在此清單的字串會拒絕：`Unknown body part "<name>"`。

**BuiltInAnimationId**

```
ShowColor    LTR    RTL    Center    Rainbow    Multi    Sequential
```

`Multi` / `Sequential` 雖然合法，但編輯器 UI 暫時不開放（必須手寫 JSON 才能用）；`subAnimations` 規則見上。

**最小範例（可直接匯入）**

```json
{
  "schemaVersion": 1,
  "type": "led-dance",
  "id": "dance-demo",
  "name": "Demo Dance",
  "bpm": 120,
  "beatUnit": 0.5,
  "dancers": [
    { "id": 1, "name": "花花" },
    { "id": 2, "name": "小米" }
  ],
  "customAnimations": [],
  "sections": [
    {
      "id": "s-intro",
      "name": "Intro",
      "steps": [
        {
          "id": "s-intro-1",
          "durationBeats": 2,
          "clearBefore": true,
          "actions": [
            {
              "type": "static",
              "dancers": [1, 2],
              "parts": ["whole"],
              "color": { "r": 255, "g": 255, "b": 255 }
            }
          ]
        },
        {
          "id": "s-intro-2",
          "durationBeats": 4,
          "clearBefore": true,
          "actions": [
            {
              "type": "animation",
              "dancers": [1, 2],
              "part": "whole",
              "color": { "r": 0, "g": 0, "b": 0 },
              "animationId": "Rainbow"
            }
          ]
        },
        {
          "id": "s-intro-3",
          "durationBeats": 2,
          "clearBefore": false,
          "actions": [
            {
              "type": "animation",
              "dancers": [1],
              "part": "leftArm",
              "color": { "r": 221, "g": 47, "b": 247 },
              "animationId": "LTR"
            },
            {
              "type": "static",
              "dancers": [2],
              "parts": ["hands"],
              "color": { "r": 255, "g": 10, "b": 10 }
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 2. Program JSON  (`type: "led-program"`)

**頂層欄位**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `schemaVersion` | number | ✓ | 目前統一為 `1` |
| `type`          | `"led-program"` | ✓ | |
| `id`            | string | ✓ | |
| `name`          | string | ✓ | |
| `items`         | `ProgramItem[]` | ✓ | 排序即執行順序 |

**ProgramItem**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `id`          | string | ✓ | 唯一 |
| `danceId`     | string | ✓ | 引用某個 dance 的 `id` |
| `mqttCommand` | string | ✓ | 直接內嵌到 C++ 字串字面量；**完全不正規化**（`ON_OPENINGj` 就會輸出 `ON_OPENINGj`） |
| `dance`       | `DanceProject` | optional | 內嵌快照；若有，`dance.id` 必須等於 `danceId` |

跨欄位驗證：

- `dance.id !== danceId` → 拒絕：`Embedded dance.id "<X>" does not match danceId "<Y>" (at items[i].dance.id)`
- 內嵌的 `dance` 自身會跑完整 DanceProject 驗證（路徑 `at items[i].dance.…`）

**範例**

```json
{
  "schemaVersion": 1,
  "type": "led-program",
  "id": "program-2026-final",
  "name": "正式演出 v1",
  "items": [
    {
      "id": "item-opening",
      "danceId": "dance-demo",
      "mqttCommand": "ON_OPENING",
      "dance": {
        "schemaVersion": 1,
        "type": "led-dance",
        "id": "dance-demo",
        "name": "Demo Dance",
        "bpm": 120,
        "beatUnit": 0.5,
        "dancers": [{ "id": 1, "name": "花花" }],
        "customAnimations": [],
        "sections": []
      }
    }
  ]
}
```

匯出 Program JSON 永遠**內嵌**完整 `dance` 快照，所以一份 Program JSON 是 self-contained 的，不依賴外部 dance registry。

---

### 3. Custom Animation JSON  (`type: "led-animation"`)

**頂層欄位**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `schemaVersion` | string | ✓ | 例：`"1.0"` ⚠️ 注意是字串不是數字 |
| `type`          | `"led-animation"` | ✓ | |
| `kind`          | `"customCppFunction"` | ✓ | 第一版只支援這種 kind |
| `id`            | string | ✓ | 唯一；`DanceAction.animationId` 對應這個 |
| `name`          | string | ✓ | 顯示名稱 |
| `description`   | string | ✓ | 可空字串 |
| `functionName`  | string | ✓ | 必須是合法 C++ identifier `^[A-Za-z_][A-Za-z0-9_]*$`，不可空 |
| `cppCode`       | string | ✓ | 完整 function 定義；不可空 |
| `parameters`    | `CustomAnimationParameter[]` | ✓ | 第一版固定 3 個：`(BodyPart, CRGB, int)` |

**CustomAnimationParameter**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `name`        | string  | ✓ | C++ 參數名；不可空 |
| `type`        | `"BodyPart"` ｜ `"CRGB"` ｜ `"int"` ｜ `"float"` | ✓ | 第一版只支援這 4 種 |
| `required`    | boolean | ✓ | |
| `description` | string  | optional | |

**Function signature 必須是固定形式**

```cpp
void <functionName>(const BodyPart& part, CRGB color, int duration)
```

Code generator 在 action 層產生：

```cpp
<functionName>(<part>, CRGB(r,g,b), <durationExpression>);
```

呼叫站點假設 function **會 block 整個 duration**（毫秒）；如果你的實作提早 return，該 dancer 會跟其他 dancer 失同步。

**範例**

```json
{
  "schemaVersion": "1.0",
  "type": "led-animation",
  "kind": "customCppFunction",
  "id": "custom-sparkle-001",
  "name": "Sparkle",
  "description": "Random sparkle on a body part",
  "functionName": "sparkleBodyPart",
  "cppCode": "void sparkleBodyPart(const BodyPart& part, CRGB color, int duration) {\n    unsigned long start = millis();\n    while (millis() - start < (unsigned long)duration && danceRunning) {\n        // ... user implementation ...\n        FastLED.show();\n        delay(1);\n    }\n}",
  "parameters": [
    { "name": "part",     "type": "BodyPart", "required": true },
    { "name": "color",    "type": "CRGB",     "required": true },
    { "name": "duration", "type": "int",      "required": true, "description": "in milliseconds" }
  ]
}
```

**Library 端額外擋下的衝突**

- 同 `id` 已存在 → 跳出 confirm 詢問是否覆寫
- 同 `functionName` 但不同 `id` → 直接拒絕（C++ link 會撞名）
- `cppCode` 含 `client.loop()` / `setup_wifi(` / `reconnect(` → 紅色警示；offline 匯出時會在該 function 上方插入 ⚠️ WARNING comment

---

### 共用驗證行為

- 任何 number 必須是有限數字（`NaN` / `Infinity` 拒絕）
- 任何 string 必須真的是 string（`null` / 數字 / `undefined` 拒絕，型別錯誤訊息會明確指出）
- 錯誤訊息一律帶 JSON path，方便人工除錯：

  ```
  Invalid dance file: Color channel out of range 0..255 (got 999)
    (at sections[0].steps[0].actions[0].color.r)
  ```

  ```
  Invalid custom animation format: Unknown parameter type "voltage"
    (expected one of BodyPart, CRGB, int, float)
    (at parameters[0].type)
  ```

- 程式中對應 import API：

  | 函式 | 來源 |
  |---|---|
  | `importDanceFromJson(jsonText)`           | `@/lib/io` |
  | `importProgramFromJson(jsonText)`         | `@/lib/io` |
  | `importCustomAnimationFromJson(jsonText)` | `@/lib/io` |

  全部 throw `ImportError`（含 `path` 與 `bareMessage` 屬性），UI 端可以 `instanceof` 抓出來顯示。

---

## Custom Animation Library

> JSON schema 的完整欄位規則 / 驗證行為 / 範例請見上面〈[JSON 匯入格式規格 § 3. Custom Animation JSON](#3-custom-animation-json--type-led-animation)〉。
> 本節聚焦於使用流程與 codegen 行為。

第一版固定的 function signature：

```cpp
void <functionName>(const BodyPart& part, CRGB color, int duration)
```

Code generator 在動作層產生：

```cpp
<functionName>(<part>, CRGB(r,g,b), <durationExpression>);
```

### 使用流程

1. `/library` → **Import Custom Animation JSON** 將 JSON 加入全域 registry。
2. 回 Editor，在 animation action 的下拉選單即可看到 **Custom** 群組，選用該 animation。
3. Editor `commitDance` 會自動把 referenced custom 嵌入 `dance.customAnimations`，
   讓 dance JSON / program JSON 自帶完整定義。
4. 多首舞使用同一個 custom，Code Generator **只輸出一次**函式定義；
   不同 id 用同樣 functionName 會 throw（因為 C++ 連結會撞到）。

---

## 專案結構

```
light_dance_2026/
├── light_dance_2026.ino              ← 既有 ESP32 程式碼，本工具不修改
├── package.json
├── tsconfig.json                     ← strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── next.config.mjs
├── README.md                         ← 本檔
└── src/
    ├── types/                        ← TS 型別 (DanceProject, ColorRGB, BodyPartName, ...)
    ├── data/                         ← sample dance + sample program
    ├── lib/
    │   ├── codegen/                  ← C++ 產生器（純函式，無 DOM 依賴）
    │   ├── io/                       ← JSON import / export 與 strict validation
    │   ├── storage/                  ← localStorage 持久化（KvStore 可注入）
    │   └── editor/                   ← UI helpers (factories, body-part groups, color convert, customAnim refs)
    ├── components/
    │   ├── NavBar.tsx
    │   ├── editor/                   ← Editor 頁元件 (含 VisualPreview, DanceFigure)
    │   ├── arrangement/              ← Arrangement 頁元件
    │   └── library/                  ← Library 頁元件
    ├── app/                          ← Next.js App Router 路由
    └── scripts/                      ← `npx tsx` 跑的測試 / sample 產生器
```

---

## 測試

| 命令 | 說明 |
|---|---|
| `npm run type-check`     | TypeScript strict mode 檢查 |
| `npm run test:io`        | JSON I/O round-trip 與錯誤路徑（30 cases） |
| `npm run test:storage`   | localStorage CRUD、refresh persistence、corruption recovery（45 cases） |
| `npm run test:preview`   | 視覺化 preview model 對映（22 cases） |
| `npm run test:codegen`   | Custom animation 產生與去重（8 cases） |
| `npm run test:integration` | 對 light_dance_2026.ino 比對 BodyPart / Animation 名稱 + Codebase Contract 檢查（61 cases） |
| `npm test`               | 跑上面 5 組（共 **166 cases**） |
| `npm run build`          | Next.js production build |

---

## Codebase Contract 摘要

> 本節是給未來的 contributor / 二次開發者看的硬規則。

- **BodyPartName**：30 個 string literal union，**完全對應** `light_dance_2026.ino` 中的 `BodyPart <name>;` 宣告。新增 BodyPart 必須**同時**改 .ino 和 `src/types/bodyPart.ts`。
- **BuiltInAnimationId**：`ShowColor / LTR / RTL / Center / Rainbow / Multi / Sequential`，對應 .ino 的 `Animation::*` static factory。
- **Custom animation signature**：第一版固定為 `void f(const BodyPart& part, CRGB color, int duration)`。
- **DanceAction.animationId** 對 custom 存的是 `CustomAnimation.id`，code generator 自行查表得到 `functionName`。
- **不可重新定義**：`LED_PIN`、`NUM_LEDS`、`BRIGHTNESS`、`LED_TYPE`、`COLOR_ORDER`、`struct BodyPart`、`struct LedRange`、`struct ColorSet`、`struct Animation`、`fillBodyPart`、`fillColorSet`、`setup_wifi`、`reconnect`、`callback`、`setup`、`loop`——全部由 .ino 提供。`verifyIntegration.ts` 會檢查產出不違反此規則。
- **timelineDelay 區分**：online 用 .ino 提供的；offline 由 generator 注入 `timelineDelaySafe`，後者不依賴 `client.loop()`。

---

## 已知限制 / 未來工作

- **Multi / Sequential UI**：資料層支援，但編輯器尚未提供巢狀 sub-animation 編輯介面。
- **Custom animation 編輯器**：目前只能透過 JSON 匯入；library 頁不支援直接編輯 cppCode。
- **整場 timeline 累積渲染**：visual preview 每個 step 獨立計算，不會反映前一步的 LED 狀態（此設計刻意，方便 debugging 單一 step）。
- **多 program 支援**：目前 localStorage 只持久化單一 ProgramArrangement。多 program 需擴充 storage layer。
