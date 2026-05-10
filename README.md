# LED Dance 2026 — 視覺化編舞與 C++ 產生器

為 `light_dance_2026.ino`（ESP32 + FastLED + MQTT）打造的 Web 編舞工具：
**Timeline 編輯舞步 → localStorage 自動儲存 → 排序多首舞 → 一鍵匯出整份 `.ino` 或 C++ 片段**，
可選 **Cloud Mode** 多人共編（Supabase realtime + presence + broadcast）。

底層 Arduino 程式碼維持不動；本工具只產生最上層的 `dance*()` / `play*_*()` 函式，
呼叫 .ino 內既有的 `Animation::*` factories、`fillBodyPart`、`timelineDelay`、
`stopEffect`、`startTimeline` 等 API。Full .ino 匯出模式則會把 generated 區塊
插入到 .ino 模板的對應 marker 之間（`// === GEN-CODE BEGIN/END === ` 等）。

---

## 啟動 Next.js 專案

```bash
npm install            # 第一次執行需要
npm run dev            # http://localhost:3000
npm run build          # production build 驗證
npm test               # 跑全部單元測試（7 組，總計 ~230 cases）
```

需求：Node.js 16.14 以上（Next 13.5 設計支援的版本）。

### Cloud Mode（選用）

如果需要多人即時共編，複製 `.env.local.example` 為 `.env.local` 並填入兩個值：

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

只填 **anon key**；service_role key 不要放進前端。沒填這兩個值時 App 預設停留在
**Local Mode**，所有資料只存在瀏覽器 localStorage，無任何網路依賴。

Supabase 端的資料表 / RLS / RPC 定義在 `supabase/schema.sql`，可直接貼到 Supabase
SQL editor 執行。詳見下方〈[Cloud Mode](#cloud-mode)〉。

---

## 三個頁面

| 路由 | 用途 |
|---|---|
| `/`              | **Editor**——Timeline 編輯一首舞：dancers / sections / events / actions / 視覺 preview |
| `/arrangement`   | **Arrangement**——排序多首舞、設 MQTT command、配置 ExportSettings、匯出整份 `.ino` 或 C++ |
| `/library`       | **Library**——管理匯入的 custom animations |

頂部的 **CloudModeBar**（在 NavBar 下方）顯示目前是 Local 還是 Cloud 模式，
提供 Create / Join program、複製 share code、檢視成員、Push local to cloud、Leave 等操作。

---

## Editor：Timeline 編輯模式

新版 Editor 以**全域 beat 座標的 Timeline** 為主軸，每個 `TimelineEvent` 都有
**絕對的 `startBeat` 與 `durationBeats`**。同一拍的多位舞者事件並排出現在同一個 beat 座標，
所有 dancer track 共用同一條 ruler，方便看出重疊、空檔、與 cross-fade 時序。

舊版的 `sections[].steps[]` 階層仍然支援（舊 dance / 舊匯入仍可運作），第一次載入時會由
`migrateStepsToTimelineEvents()` 自動轉成 timeline events 並補上 `section.startBeat`。

### 建立一首舞的步驟

1. 開 Editor (`/`)，header 點 `+ New` 開一首空舞，或從下拉選單切換現有 dance。
2. 在左側 **Dance Meta** 卡片設定：
   - **Song name**（會 sanitize 成 `dance<SafeName>` C++ 函式名）
   - **BPM**（每分鐘拍數）
   - **Beat unit**：`1` / `1/2` / `1/4`，timeline 拖曳的最小 snap 單位
   - **Dancers**：id 1..N 對應 .ino 中 `DANCER` / `ROLE` 常數，name 是任意字串（中文 OK）；
     刪除 dancer 會自動 remap 所有 action 中的引用。
3. 用 **`+ Section`** 在 timeline 上加章節（純標籤；section 不影響執行時序，
   只決定 codegen 產生的 `play<Dance>_<Section>()` 函式名稱）。
4. 用 **`+ Event`** 加事件，每個事件可包含多個 actions：
   - **Static action**：選 dancers + body parts（多選）+ color
   - **Animation action**：選 dancers + animationId + body part（單選）+ color
5. 點 timeline 上的事件 → 右側 **TimelineEventEditor** 編輯：
   - `startBeat` / `durationBeats`（自動 snap 到 `beatUnit` 網格）
   - `clearBefore`（事件開始時 `fill_solid(leds, NUM_LEDS, CRGB::Black)`）
   - 所屬 section（決定 codegen 函式分組）
   - 加 / 改 / 刪 actions
   - Duplicate / Delete 整個事件
6. **TimelineWarningsPanel** 即時顯示問題：負 beat、duration ≤ 0、空 dancers、
   static 沒選 parts、animation 沒選 part（Rainbow 例外）、同一 dancer 事件重疊…等。
   點警告即可跳到該事件。
7. 編輯時自動存到 localStorage（cloud mode 下會 600ms debounce 同步上雲）。

### ViewModeTabs 與 ghost events

- **All Dancers**：所有 dancer 同時顯示在不同 row。
- **Dancer N**：只顯示有觸及這位 dancer 的事件，避免畫面太擠。
  勾 `show ghost events from other dancers` 可在背景以 0.25 透明度顯示其他 dancer 的事件作為時序參考（不可點）。

### Visual Preview（右側 PreviewPanel）

右側面板有三個 tab：

- **Visual**：以 8 個方塊（hat / body / leftArm / rightArm / leftHand / rightHand / legs / feet）
  組成的 SVG 小人（`DanceFigure`），即時顯示當前 `currentBeat` 每位舞者的顏色與 animation label。
- **C++**：當前這首舞的 generated C++（可切 online / offline 預覽）。
- **JSON**：當前 dance 的 JSON 序列化結果。

頂部 `▶ Play / ⏸ Pause / ↺ Reset` 用 `requestAnimationFrame` 依 BPM 推進 `currentBeat`，
visual preview 會跟著同步（不播音樂）。暫停且選了某事件時，preview 會跳到該事件的 `startBeat`。

### 為什麼 UI 隱藏了 Multi / Sequential

`Multi` / `Sequential` 需要巢狀 sub-animations，第一版編輯器尚未提供巢狀編輯介面。
資料層仍合法（JSON 匯入時會驗證 `subAnimations` 非空），只是下拉選單暫時藏起來。

---

## Arrangement：排序多首舞

1. 從 Editor 點 **Add to Arrangement** 把當前舞加入（會 prompt MQTT command）。
2. 切到 `/arrangement`。
3. 每個 item（`ProgramItemRow`）提供：
   - 編輯 `mqttCommand`（直接改輸入框，verbatim 不正規化）
   - **雲端同步徽章**：☁ green = 已同步到 cloud；💻 yellow = 僅 local
   - **Orphaned 警示**：若 embedded dance snapshot 找不到（紅框），無法 Edit
   - `↑ ↓` 上下移
   - `⧉ Duplicate` 複製一個指向同 dance 的 item
   - `Edit` 跳回 Editor 編輯該 dance（修改 dance 後自動同步回 program 的 snapshot）
   - `Export Dance JSON` 匯出單首
   - `Delete` 移除
4. 右側 **Export Panel** + **ExportSettingsForm** 控制最終匯出。

---

## ExportSettings 與三種匯出模式

`/arrangement` 右側上方是 **ExportSettingsForm**（可摺疊），下方是 **ExportPanel**。

### 三種 ExportType

| 模式 | `exportType` 值 | 產出 | 適用 |
|---|---|---|---|
| **Snippet**         | `snippet`              | 只有 dance functions + custom animations + 註解形式的 MQTT branches；**不含**整份 .ino | 老用法：自己貼到既有 .ino |
| **Full Offline**    | `full-offline-ino`     | 完整可燒錄的 `.ino`，含 `#define OFFLINE_TEST 1`、`timelineDelaySafe()`、`offlineTest()` | 線下排練 / 單機演出，免 MQTT |
| **Full Online MQTT**| `full-online-mqtt-ino` | 完整可燒錄的 `.ino`，含 WiFi / MQTT 連線與 callback 處理 | 多人同步、有中控的正式演出 |

### 匯出參數（ExportSettings）

| 欄位 | 預設 | 說明 |
|---|---|---|
| `exportType`               | `snippet` | 三選一 |
| `includeLegacyExampleDances` | `false` | true → 從現有 `light_dance_2026.ino` 模板插入；false → minimal mode（剝光 legacy songs，重寫 setup/callback/loop body） |
| `wifiSsid` / `wifiPassword`| ⚠️ placeholder | full-online 才會插入 |
| `mqttHost` / `mqttPort` / `mqttTopic` / `mqttClientIdPrefix` | placeholder / 1883 / `LED_TOPIC` / `light` | full-online 用 |
| `dancerId` / `personId` / `roleId` | 1 / 1 / 1 | 該裝置的身份識別，會 patch 到 `#define DANCER/PERSON/ROLE` |
| `ledPin` / `numLeds` / `brightness` | 13 / 1000 / 50 | LED 硬體 |
| `ledType` / `colorOrder`   | `WS2812B` / `GRB` | FastLED 設定 |
| `offlineRunMode`           | `runArrangementOnce` | full-offline 才用：`runArrangementOnce` / `loopArrangement` / `runSelectedDance` |
| `offlineSelectedDanceId`   | —     | 上面選 `runSelectedDance` 時必填 |
| `showReadySignalBeforeDance` / `showEndSignalAfterDance` | true / true | 是否在每首舞前後呼叫 .ino 的 `showReadySignal()` / `showEndSignal()` |
| `loopAfterFinish`          | false | offline 跑完一輪後是否再循環 |

⚠️ `wifiPassword` / `mqttHost` 等預設值是開發用 placeholder，正式燒錄前務必改掉。

### Base .ino 來源

Full 模式需要一份 baseIno 模板：

- 預設 fetch `/api/base-ino`（伺服端從專案 root 讀 `light_dance_2026.ino` 回傳純文字，no-store）。
- 也可手動 **Upload base .ino** 改用自己的版本，或 **Reset** 回預設。
- 若 baseIno 缺失而 ExportType 又是 full-* → ExportPanel 會擋下並顯示錯誤。

### Online MQTT 觸發

Full Online MQTT 匯出後，每首 dance 會在 minimal callback 內加上對應 `else if`：

```cpp
else if (messageTemp == "ON_OPENING") {
    Serial.println("Triggering: My Dance");
    before();
    danceRunning = true;
    danceMyDance();
    showEndSignal();
}
```

對 broker 的 `LED_TOPIC` 發送對應 `mqttCommand` 即可觸發。

### Offline 入口

Full Offline 匯出會自動在 `setup()` 結尾呼叫 `offlineTest()`，由 `offlineRunMode` 決定行為：

- `runArrangementOnce` — 依 arrangement 順序跑一輪後停。
- `loopArrangement` — 持續循環 arrangement。
- `runSelectedDance` — 只跑 `offlineSelectedDanceId` 那首；若同時 `loopAfterFinish`，跑完再來。

WiFi / MQTT 區段自動以 `#if !OFFLINE_TEST` 包起來，flash 後就直接跑、不需 broker。

### 自訂 baseIno 模板的安全 marker

從模板插入時，generator 會在這些 marker 之間覆寫，重複匯出**不會**重複插入：

```
// === GEN-FWD BEGIN ===   ...   // === GEN-FWD END ===
// === GEN-CODE BEGIN ===  ...   // === GEN-CODE END ===
// === GEN-MQTT BEGIN ===  ...   // === GEN-MQTT END ===   （在 callback() 內）
```

`validateGeneratedIno()` 會在輸出前檢查 MQTT 區塊有沒有跑出 callback() 之外、或產生重複 function 定義。

---

## Cloud Mode

### 兩種運行模式

| 模式 | 條件 | 表現 |
|---|---|---|
| **Local Mode** | 沒設 Supabase env 或還沒 Create / Join program | 全部存 `localStorage`，無網路依賴；CloudModeBar 顯示 `Local Mode` 與 Create / Join 按鈕 |
| **Cloud Mode** | 已設 env 且加入了某個 program | localStorage 寫入會 600ms debounce 上同步 Supabase；其他 client 的修改透過 realtime 套回本地 |

兩種模式可隨時切換（Leave 後回到 Local），切換不會破壞既有 localStorage 資料。

### 角色與身份

- 匿名登入（`supabase.auth.signInAnonymously()`），只需提供 **display name**。
- 第一次登入時 trigger 自動建 `profiles` row。
- Program 內角色：`owner` / `editor` / `viewer`。Create 者自動成為 owner，
  以 share code 加入者預設成為 editor。

### Share Code

Create program 時 RPC 會產生 8 位 alphanumeric `share_code`（撞名重試）。
其他人可在 JoinProgramModal 輸入 code（自動轉大寫）加入。
CloudModeBar 顯示目前 code，可一鍵複製。

### 同步什麼

下列五張表會即時雙向同步：

| Table | 對應本地概念 |
|---|---|
| `dances`             | 每首 DanceProject |
| `program_items`      | Arrangement 順序與 mqttCommand |
| `custom_animations`  | 自訂動畫 |
| `export_settings`    | ExportSettings（每個 program 一筆） |
| `program_members`    | 成員清單與角色 |

另外有兩個非持久化通道：

- **Presence** (`presence:<programId>`)：每位 user 廣播 `{currentDanceId, currentEventId, currentView, dancerTab}`，MembersPanel 即時顯示誰在哪一頁。
- **Broadcast** (`broadcast:<programId>`)：editing 訊號（誰正在編某個 event），TimelineEventBlock 上會以金色框 + tooltip 顯示「⟪name⟫ editing」，TTL 6 秒。

`activity_log` 表已建好（program_created / member_joined 會寫一筆），但目前還沒 UI 消費。

### Echo 抑制（兩層）

1. **`recentSelfSaves`**：本地 upsert 後立刻 `recordSelfSave(table, cloudId)`；
   收到 realtime 回聲時若同 id 存在於 5s TTL Map 內就 drop。
2. **`withSuppressedHooks`**：把 realtime 套回 localStorage 的 `saveDance()` 包在
   `withSuppressedHooks(...)` 內，這層寫入**不會**再觸發 cloud-mirror hook，避免無限回波。

### Cloud ID 對映

本地 id（如 `dance-abc123`）與 Supabase 的 cloud uuid 用 `cloudIdMap`（`ld26:cloudIdMap:<programId>`）雙向對映。
首次 save 時 `getOrCreateCloudId()` 產 uuid，後續以同一 row upsert；
load 時也會把 server 端 row id 灌回對映表。

### 資料庫 schema

完整 SQL 在 [`supabase/schema.sql`](supabase/schema.sql)，包含：
- 6 張表（programs / program_members / profiles / dances / program_items / custom_animations / export_settings / activity_log）
- RLS policies 與 helper functions（`is_program_member`, `get_program_role`, `can_edit_program`，皆 SECURITY DEFINER）
- 2 個 RPC（`create_program_with_owner`, `join_program_by_share_code`）
- 5 張表的 `REPLICA IDENTITY FULL`（讓 realtime 帶 oldRow）

### 已知限制

- `program_items` 沒有 atomic reorder：一次 reorder 是「先 delete-all 再 insert-all」，
  其他 client 短暫看到空 list 是預期行為。
- `viewer` 角色靠 RLS 阻擋；前端**沒有**為 viewer disable 按鈕，操作會在 RPC 端報錯。
- 沒有 offline queue／衝突解決，採 last-write-wins。

---

## 把產出貼回 light_dance_2026.ino（Snippet 模式）

> 如果你選的是 Full Online MQTT 或 Full Offline 模式，可直接燒錄產出檔，**不需要**手動貼。
> 以下流程僅針對 `snippet` 模式或想自行整合的進階用法。

### Online MQTT 版

1. 把所有 `// === Dance: ... ===` 區塊（含 `#define BPM_*` / `void dance*()` / `void play*_*()`）
   貼到 .ino 中 `setup()` 之前。
2. 把 custom animation 的 `void <functionName>(...)` 函式貼到同一區塊。
3. 找到 `callback()`，把產出最下面**註解區塊內**的 `else if (...)` 分支貼到既有 `else if (messageTemp == "OFF")` 之後。
4. Build & upload。
5. 在 broker 對 topic `LED_TOPIC` 發布 `ON_OPENING` 等指令觸發舞蹈。

### Offline 版

1. 把所有 dance + custom animation 函式貼到 .ino 中 `setup()` 之前。
2. 額外把產出開頭的 `void timelineDelaySafe(...)` 函式也貼進來。
3. `setup()` 註解掉 WiFi / MQTT；`loop()` 註解掉 `client.loop()` / `reconnect()`。
4. `setup()` 結尾加 `delay(2000); offlineTest();`。
5. Build & upload。

---

## Offline 與 Online 版本差異

| 項目 | Offline | Online MQTT |
|---|---|---|
| 觸發方式 | `setup()` 結尾呼叫 `offlineTest()` 自動跑一次／循環／指定首 | MQTT broker 發送對應 mqttCommand |
| WiFi / MQTT | 不需要、`#if !OFFLINE_TEST` 包起 | 必須保留 .ino 既有的 WiFi/MQTT 連線流程 |
| Beat 計時 | `timelineDelaySafe(...)`（產出內附） | `timelineDelay(...)`（用 .ino 既有的） |
| 動畫 while-loop | `FastLED.show(); delay(1);` | `FastLED.show(); client.loop(); delay(1);` |
| 額外定義 | `#define OFFLINE_TEST 1` | （無） |
| Custom animation 警告 | 若 cppCode 含 `client.*` 會插入 ⚠️ WARNING comment | （無，假設 MQTT 已就緒） |
| 適用場景 | 線下測試、單機演出、離線排練 | 多人同步、有中控的正式演出 |

兩個版本**都不會**重新定義 `LED_PIN` / `NUM_LEDS` / `BodyPart` / `Animation` / `fillBodyPart` 等
.ino 已經存在的底層符號——產出純粹是上層編排函式（minimal 模式下這些 #define 會被 `applyHardwareSettings()` 從 ExportSettings patch）。

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
| `sections`          | `DanceSection[]` | ✓ | 可空陣列；timeline 模式下純粹是命名容器 |
| `customAnimations`  | `CustomAnimation[]` | ✓ | 內嵌快照；沒用到請填 `[]` |
| `timelineEvents`    | `TimelineEvent[]` | optional | 若存在，codegen 與 preview 都以此為準；不存在則由 `sections[].steps[]` 自動 migrate |

**Dancer**

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`   | number | 對應 .ino `DANCER` / `ROLE` 整數 |
| `name` | string | 任意（中文 OK） |

**DanceSection**

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`        | string | 唯一 |
| `name`      | string | 任意；同名 section 在 codegen 階段會自動加 `_1` / `_2` 後綴避免重定義 |
| `steps`     | `DanceStep[]` | timeline 模式可空 |
| `startBeat` | number | optional；migrate 時會自動填，timeline ruler 用來畫 section 分隔線 |

**DanceStep**（legacy 與 timeline migration 後保留）

| 欄位 | 型別 | 規則 |
|---|---|---|
| `id`            | string  | 唯一 |
| `durationBeats` | number  | `> 0`；常用 `0.25` / `0.5` / `1` / `2` / `4` |
| `clearBefore`   | boolean | `true` 才會在 step 開頭 emit `fill_solid(leds, NUM_LEDS, CRGB::Black)`；`false` 表示「保持上一拍狀態」是合法行為 |
| `actions`       | `DanceAction[]` | 同一 step 內的 dancers 必須互斥（同一個 dancer 不能出現在兩個 action） |

**TimelineEvent**

| 欄位 | 型別 | 必填 | 規則 |
|---|---|:---:|---|
| `id`             | string  | ✓ | 唯一 |
| `sectionId`      | string  | ✓ | 對應某個 `DanceSection.id`；只用於分組/codegen 函式名，**不影響執行時序** |
| `startBeat`      | number  | ✓ | `≥ 0`；全域 beat 座標 |
| `durationBeats`  | number  | ✓ | `> 0` |
| `clearBefore`    | boolean | ✓ | 同上 |
| `actions`        | `DanceAction[]` | ✓ | 同一事件內的 dancers 應互斥 |
| `label`          | string  | optional | timeline 上顯示用 |
| `note`           | string  | optional | 編輯者備註 |

> Codegen 把同 `startBeat` 的多個 events 合併成一個 emission step；事件之間的空檔自動補
> wait-only step（純 `timelineDelay`）。實作見 `src/lib/codegen/timelineEmission.ts`。

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

**Library 端額外擋下的衝突**

- 同 `id` 已存在 → 跳出 confirm 詢問是否覆寫
- 同 `functionName` 但不同 `id` → 直接拒絕（C++ link 會撞名）
- `cppCode` 含 `client.loop()` / `setup_wifi(` / `reconnect(` → 紅色警示；offline 匯出時會在該 function 上方插入 ⚠️ WARNING comment

---

### 共用驗證行為

- 任何 number 必須是有限數字（`NaN` / `Infinity` 拒絕）
- 任何 string 必須真的是 string（`null` / 數字 / `undefined` 拒絕，型別錯誤訊息會明確指出）
- 錯誤訊息一律帶 JSON path：

  ```
  Invalid dance file: Color channel out of range 0..255 (got 999)
    (at sections[0].steps[0].actions[0].color.r)
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

> JSON schema 完整規則見上面〈[JSON 匯入格式規格 § 3](#3-custom-animation-json--type-led-animation)〉。
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
3. Editor 儲存時會自動把 referenced custom 嵌入 `dance.customAnimations`，
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
├── .env.local.example                ← Cloud Mode 用 (Supabase URL + anon key)
├── supabase/
│   └── schema.sql                    ← Supabase 表 / RLS / RPC 完整定義
└── src/
    ├── types/                        ← TS 型別 (DanceProject, TimelineEvent, ExportSettings, CloudModeState, ...)
    ├── data/                         ← sample dance + sample program
    ├── lib/
    │   ├── codegen/                  ← C++ 產生器（含 timelineEmission, fullIno minimal/from-template, marker insertion）
    │   ├── io/                       ← JSON import / export 與 strict validation
    │   ├── storage/                  ← localStorage 持久化（KvStore 可注入）+ cloudMirror hooks
    │   ├── supabase/                 ← Supabase client / auth / realtime / presence / broadcast / sync
    │   └── editor/                   ← UI helpers (factories, body-part groups, color convert, customAnim refs, timeline helpers, migration)
    ├── components/
    │   ├── NavBar.tsx
    │   ├── cloud/                    ← CloudModeBar / CloudModeProvider / CreateProgramModal / JoinProgramModal / MembersPanel / SyncStatusBadge
    │   ├── editor/                   ← Editor 頁元件（含 TimelineEditor, DancerTrack, BeatRuler, TimelineEventBlock/Editor/WarningsPanel, ViewModeTabs, VisualPreview, DanceFigure …）
    │   ├── arrangement/              ← ArrangementClient, ExportPanel, ExportSettingsForm, ProgramItemRow
    │   └── library/                  ← BuiltInAnimationsList, CustomAnimationCard, LibraryClient
    ├── app/
    │   ├── layout.tsx                ← 包 CloudModeProvider + NavBar + CloudModeBar
    │   ├── page.tsx                  ← /         → EditorClient
    │   ├── arrangement/page.tsx      ← /arrangement → ArrangementClient
    │   ├── library/page.tsx          ← /library → LibraryClient
    │   └── api/base-ino/route.ts     ← GET：把 light_dance_2026.ino 以 text/plain 回傳給 ExportPanel
    └── scripts/                      ← `npx tsx` 跑的 7 組驗證腳本
```

---

## 測試

| 命令 | 說明 |
|---|---|
| `npm run type-check`     | TypeScript strict mode 檢查 |
| `npm run test:io`        | JSON I/O round-trip 與錯誤路徑 |
| `npm run test:storage`   | localStorage CRUD、refresh persistence、corruption recovery |
| `npm run test:preview`   | 視覺化 preview model 對映 |
| `npm run test:codegen`   | Custom animation 產生與去重 |
| `npm run test:integration` | 對 light_dance_2026.ino 比對 BodyPart / Animation 名稱 + Codebase Contract 檢查 |
| `npm run test:fullino`   | 完整 .ino 產生（snippet / full-offline / full-online）+ idempotent patching + ExportSettings 各欄位生效 |
| `npm run test:timeline`  | TimelineEvent migration / helpers / gap-fill / event-merge / warnings |
| `npm test`               | 跑上面 7 組（總計 ~230 cases） |
| `npm run build`          | Next.js production build |

另有 `src/scripts/verifyEdges.ts` 是 informational printer（手動 `npx tsx ...` 跑），
列印 `sanitizeCppIdentifier` / `durationToCppExpression` / `dancerConditionToCpp` / `colorToCpp`
在邊界情境下的輸出，方便 debug。

---

## Codebase Contract 摘要

> 本節是給未來的 contributor / 二次開發者看的硬規則。

- **BodyPartName**：30 個 string literal union，**完全對應** `light_dance_2026.ino` 中的 `BodyPart <name>;` 宣告。新增 BodyPart 必須**同時**改 .ino 和 `src/types/bodyPart.ts`。
- **BuiltInAnimationId**：`ShowColor / LTR / RTL / Center / Rainbow / Multi / Sequential`，對應 .ino 的 `Animation::*` static factory。
- **Custom animation signature**：第一版固定為 `void f(const BodyPart& part, CRGB color, int duration)`。
- **DanceAction.animationId** 對 custom 存的是 `CustomAnimation.id`，code generator 自行查表得到 `functionName`。
- **TimelineEvent.sectionId** 純粹是 codegen 分組鍵，不影響執行時序；事件先按 `startBeat` 全域排序，再依 sectionId 分桶到 `play<Dance>_<Section>()`。
- **不可重新定義**：`LED_PIN`、`NUM_LEDS`、`BRIGHTNESS`、`LED_TYPE`、`COLOR_ORDER`、`struct BodyPart`、`struct LedRange`、`struct ColorSet`、`struct Animation`、`fillBodyPart`、`fillColorSet`、`setup_wifi`、`reconnect`、`callback`、`setup`、`loop`——全部由 .ino 提供。Snippet 模式 `verifyIntegration.ts` 會檢查產出不違反此規則；Full 模式則由 `applyHardwareSettings()` 對既有 `#define` 做 in-place patch（不重新定義）。
- **timelineDelay 區分**：online 用 .ino 提供的；offline 由 generator 注入 `timelineDelaySafe`，後者不依賴 `client.loop()`。
- **Cloud Mirror 抑制**：所有 realtime 套回 localStorage 的寫入必須包在 `withSuppressedHooks(() => ...)` 內，否則會無限回波。新增任何「localStorage 寫入會觸發 cloud sync」的 hook 點時，都要遵守這個約定。

---

## 已知限制 / 未來工作

- **Multi / Sequential UI**：資料層支援，但編輯器尚未提供巢狀 sub-animation 編輯介面。
- **Custom animation 編輯器**：目前只能透過 JSON 匯入；library 頁不支援直接編輯 cppCode。
- **整場 timeline 累積渲染**：visual preview 每個 event 獨立計算，不會反映前一拍的 LED 殘留狀態（此設計刻意，方便 debugging 單一事件）。
- **多 program 支援**：localStorage 只持久化單一 ProgramArrangement；雲端則 Cloud Mode 下每個 program 都是獨立 row。
- **Cloud 衝突解決**：採 last-write-wins + 5s recentSelfSaves echo 抑制，沒有 OT/CRDT；同步 reorder arrangement 可能短暫看到中間狀態。
- **Activity log**：DB 已記錄 program_created / member_joined，但前端尚未顯示。
- **Viewer 角色**：RLS 阻擋寫入但前端未 disable 按鈕；viewer 操作會在 RPC 層失敗。
