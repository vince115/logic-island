# Dynamic Island Population — Visitor Presence System

> 記錄日期：2026-11-20（Asia/Taipei）。分支 `presence/visitor-population`（基於 `origin/main` `709c9fc`），工作目錄 `../logic-island-presence`。
> 狀態：**原型完成、預設關閉**。兩個 build-time 旗標都不設時，網站沒有 API、沒有 Cookie、不畫 NPC；未合併 `main`、未部署、未在真機驗證。
> 需要使用者決定的事項集中在 §8。
>
> **2026-11-21 第二輪**（NPC 效能、五大群島、共用儲存、安全整合）記錄在 [PRESENCE_ROUND2.md](PRESENCE_ROUND2.md)、[PRESENCE_SHARED_STORE.md](PRESENCE_SHARED_STORE.md)、[PRESENCE_PRIVACY.md](PRESENCE_PRIVACY.md)。本文件是第一輪的記錄，以下幾處已被第二輪取代，以第二輪文件為準：
>
> - §5 的 API：`GET` 的回應多了 `commons`（各群島不在任何島上的人數）；告別請求多了選填的 `at`；帶 GPC／DNT 訊號的瀏覽器不計入；儲存失敗回 503。
> - §6 的 NPC：不再只有基礎程式島，改為每張地圖的每座島與橋（資料驅動）；`NPC_ISLANDS` 已移除；繪製改由單一排程器決定，不再是固定 30／20 fps。
> - §7 的效能表與「已知限制」第 5、7、8 項；§8 的 D1（共用儲存已有實作，尚未佈建）、D3（preflight 已有最小例外，待審閱）、D4（隱私草案與 GPC／DNT 已完成）、D6（其他島與 P8／P9 地圖已完成）。

## 1. 目標與範圍

讓網站依訪客正在探索的學習區域，更新首頁 3D 地圖上對應島嶼的活動人口。追蹤三層：Region（五大學習群島）→ Island（學科島）→ Course（課程或實驗）。

本輪完成：

| 階段 | 內容 | 狀態 |
|---|---|---|
| Phase 1 | 架構盤點 | 完成（§2） |
| Phase 2 | 匿名 Presence Tracking 與 API | 完成（§4、§5） |
| Phase 3 | Population Engine（伺服器聚合＋前端人口→NPC 對應） | 完成（§5、§6） |
| Phase 4 | 3D NPC 原型（基礎程式島）、Mock 資料、Feature Flag | 完成（§6） |
| Phase 5 | 驗證與整合 | 完成本機自動化驗證（§7）；真機與正式環境未做 |

本輪沒有做：正式環境啟用、共用儲存（Redis 等）、人口數字的畫面（名牌徽章／清單）、其他島嶼的 NPC、P8／P9 世界地圖的整合、真機量測。

## 2. Phase 1 盤點結果

| 項目 | 現況（`origin/main` `709c9fc`） | 對設計的影響 |
|---|---|---|
| 路由 | 全站頁面都是靜態預先產生（`○`／`●`）；**沒有任何 route handler、proxy 或 middleware** | Presence API 是本站第一個伺服器端端點 |
| 考試系統的閘門 | `src/lib/trials/preflight.ts` `routeCheck`：build 內只要有任何 route handler 就判定失敗（CI 每次都跑） | API 的 route 檔只在開啟旗標的 build 才被編譯（§3），預設 build 與 CI 維持零 route handler；**閘門本身沒有修改**。開啟旗標的 build 會被這道閘門擋下，是否加白名單需使用者決定（§8 D3） |
| Region／Island／Course | `src/content/world`：5 個 Region（`cs`、`ai`、`design`、`web`、`sys`）、29 座學科島＋工具島 `labs`（沒有 Region）；課程在 `src/content/curriculum/lessons.ts`（`slug`、`lessonId`、`islandId`），實驗在 `src/content/courses.ts` | 對照表不另存，直接讀 registry（§4） |
| 3D 地圖 | 首頁 `/` 是五島六角地圖（`HexWorldExplorer`→`HexWorldContent`，R3F、`frameloop="demand"`、靜態陰影貼圖）；唯一的 GLB 是 `basics-island.v2.1.glb`；場景沒有任何持續動畫，閒置時 0 幀 | NPC 走場景既有的 `extras` 掛載點，不改場景、模型、相機；NPC 不投影（靜態陰影不重畫，KNOWN_ISSUES P1-23） |
| 資料庫／快取／即時通訊 | 都沒有。部署在 Vercel（`main` 自動部署 Production）；Vercel 連接器與本機 CLI 對該專案沒有權限 | 先以行程內記憶體儲存完成整個流程；正式上線需要共用儲存（§8 D1） |
| 訪客統計／Session／Analytics | 都沒有。瀏覽器端只有 `localStorage` 的學習進度與主題 | 新增一個僅供 Presence API 使用的 Session Cookie |
| 首頁與世界旗標 | `/world`（`LOGIC_ISLAND_REGIONAL_WORLD`）與 P9（`LOGIC_ISLAND_P9_PROTOTYPE`）都未在 Production 啟用 | 原型掛在 Production 實際使用的首頁地圖 |

## 3. 架構

```
瀏覽器（每個分頁）                         伺服器（Next.js route handler）              首頁地圖
PresenceTracker ──POST /api/presence──▶  service.ts ─ session.ts（簽章 Cookie）
  place.ts：網址 → 單一位置參照               │         locations.ts（registry 解析 Region→Island→Course）
  可見時每 60 秒一次（P7 前為 30 秒）、切頁立即、背景時告別      ▼
                                          store.ts（PresenceStore；目前為記憶體）
                                              │  engine.ts（一個 Session 一個位置、逾時、聚合）
PopulationLayer ◀──GET /api/presence──────────┘  只回傳聚合數字
  population.ts：在線人數 → NPC 數量（上限）
  npc-paths.ts／npc-sim.ts：安全路網與行走模擬
```

程式位置：`src/lib/presence/`（純邏輯）、`src/components/presence/`（追蹤器與 3D 圖層）、`src/app/api/presence/route.presence.ts`（API）。

### Feature Flag

| 變數（build 時讀取，只在伺服器） | 作用 | 不設時 |
|---|---|---|
| `LOGIC_ISLAND_PRESENCE=1` | 追蹤器（root layout）與 Presence API | 沒有 API（404）、不設 Cookie、不送任何請求 |
| `LOGIC_ISLAND_POPULATION_NPC=mock` | 首頁地圖以產生的假資料畫 NPC；Vercel Production build 一律忽略 | 不畫 NPC，NPC 程式碼不會被下載 |
| `LOGIC_ISLAND_POPULATION_NPC=live` | 首頁地圖讀 Presence API 畫 NPC；需同時有 `LOGIC_ISLAND_PRESENCE=1` | 同上 |
| `LOGIC_ISLAND_PRESENCE_SECRET` | Session Cookie 的簽章金鑰（至少 32 字元）。未設時每個行程自產一把（重啟即失效）；**Vercel Production 未設則 API 回 503** | — |

API 的 route 檔名是 `route.presence.ts`：`next.config.ts` 只有在 `LOGIC_ISLAND_PRESENCE=1` 時才把 `presence.ts` 加進 `pageExtensions`，所以預設 build 不會把它當成 route。實測：預設 build 的 `app-paths-manifest.json` 沒有任何 `/route`，`trials:preflight --build` 的 `routes` 檢查通過。

## 4. Region／Island／Course 對照方式

原則：**瀏覽器只送「一個位置參照」，Region→Island→Course 由伺服器從 registry 推導**。瀏覽器無法自行宣告一組 Region／Island／Course，因此不可能把自己放到不屬於該參照的島上。

| 頁面 | 瀏覽器送出的參照（`place.ts`） | 伺服器解析結果（`locations.ts`） |
|---|---|---|
| `/curriculum/<slug>` | `{t:'lesson', id:<slug>}` | 課程的 `islandId` → 該島的 `regionId`；Course＝`lessonId`（例：`DB01` → 資料庫應用島 → `cs`） |
| `/learn`、`/learn/<slug>` | `{t:'lab'}`、`{t:'lab', id:<slug>}` | 互動實驗島（工具島，沒有 Region）→ 中央樞紐；Course＝`lab:<slug>` |
| `/?island=<id>`、`/world/<r>?island=<id>`、`/<r>?island=<id>` | `{t:'island', id, r?}` | 以島自己的 `regionId` 為準；`r` 只在島不存在時當退路 |
| `/curriculum#island-<id>` | `{t:'island', id}` | 同上（島只出現在 hash，不在路徑） |
| `/regions/<r>`、`/world/<r>`、`/<r>` | `{t:'region', id}` | 該 Region，不屬於任何島 |
| `/`、`/curriculum`、`/world`、`/trials/**`、`/islands/**`、其他 | `{t:'hub'}` | 中央樞紐 |

- 不是所有內容都能由網址判定島嶼：首頁聚焦的島在 query、課綱的島在 hash、考試頁不屬於任何島。判不出來的一律歸中央樞紐。
- 不存在的參照（未知的島、課程、Region）解析為樞紐或該頁的 Region，不會產生 registry 以外的鍵；格式不合的請求回 400。
- 測試：`tests/presence-locations.test.ts` 逐一檢查全部課程頁、29 座島、5 個 Region 與 6 個實驗的解析結果。

## 5. Presence API 設計

端點 `/api/presence`（只存在於開啟旗標的 build）。

### POST：心跳或告別

```jsonc
// 心跳
{ "v": 1, "tab": "<本次頁面載入的隨機標籤>", "since": 1795181949017, "place": { "t": "lesson", "id": "variables-and-types" } }
// 告別（分頁進入背景或離開頁面，以 sendBeacon 送出）
{ "v": 1, "tab": "<同上>", "leave": true }
```

| 回應 | 意義 |
|---|---|
| `200 {ok:true, counted:false, retryMs}`＋`Set-Cookie` | 第一次接觸：發出 Session Cookie，尚不計入；瀏覽器依 `retryMs` 帶 Cookie 再送 |
| `200 {ok:true, counted:true, next:60000}` | 已計入；60 秒後下一次心跳（P7 前為 30 秒） |
| `400`／`403`／`413`／`429`／`503` | 格式錯誤／非本站頁面發出／body 過大／單一 Session 寫入過多／Production 未設金鑰 |

### GET：聚合人口

```json
{ "v": 1, "at": 1795181951678, "ttlMs": 90000, "total": 1, "hub": 0,
  "regions": { "cs": 1, "ai": 0, "design": 0, "web": 0, "sys": 0 }, "islands": { "foundations": 1 } }
```

只有聚合數字：沒有 Session、分頁、時間明細；課程層級的計數只留在伺服器（一堂課上的「1」比地圖需要的資訊更貼近個人）。`Cache-Control: public, max-age=5, s-maxage=5`。

### 行為規則

| 需求 | 做法 |
|---|---|
| 暫時性匿名識別碼 | 伺服器簽發的 Session Cookie `li_presence`：隨機 16 bytes＋簽發時間＋HMAC-SHA256。`HttpOnly`、`SameSite=Strict`、`Path=/api/presence`、沒有到期時間（瀏覽器關閉即消失）；12 小時後伺服器換發 |
| Heartbeat 60 秒、逾時 150 秒（P7；原為 30／90 秒） | `src/lib/presence/config.ts`；分頁可見時才送心跳。理由與量測見 `PRESENCE_P7_PREVIEW_LAUNCH_GATE.md` §3 |
| 同一 Session 不重複計入 | 一個 Session 只有一筆紀錄、一個位置；同瀏覽器的所有分頁共用 Cookie |
| 多分頁 | 位置屬於「最後被使用的分頁」（`since`＝該分頁變為活躍的時間）；其他可見分頁只延長存活、不移動位置；擁有位置的分頁 90 秒沒消息則由其他分頁接手（P7；原為 45 秒）。P7：分頁告別時會通知同一個瀏覽器的其他分頁，還在前景的分頁 1.5 秒後自己回報，訪客立刻算在它那裡 |
| 切換頁面 | 追蹤器跟隨路徑、`?island=` 與 hash，0.6 秒去抖後回報 |
| 背景分頁 | 進入背景立刻送告別並停止心跳；只有擁有位置的分頁能讓 Session 離線；回到前景立刻恢復 |
| 不儲存個資 | API 不讀取 IP 與轉送標頭；User-Agent 只用來比對一次爬蟲名單、不儲存；儲存內容只有隨機 Session id、位置與時間 |
| 防重複計數與簡單灌水 | 沒有帶回 Cookie 的請求不建立任何 Session（不占記憶體）；Cookie 簽發 2 秒後才計入；Session id 必須是伺服器簽章；需為同源請求（`Origin`／`Sec-Fetch-Site`）；每 Session 每分鐘最多 40 次寫入；body 上限 512 bytes；記憶體儲存上限 50,000 個 Session |
| 伺服器驗證位置 | 見 §4 |

## 6. Population Engine 與 NPC 原型

### 人口與 NPC 數量分離（`population.ts`）

- 在線人數是 API 的數字；NPC 數量另外計算：3 人以內一人一個，之後人數每加倍多一個（4→4、8→5、16→6、32→7、64→8），不超過島的上限。
- 上限：基礎程式島 8；手機（寬度 ≤ 780 px 或觸控為主）減半為 4，幀率 30→20。
- 人口變化採平滑動畫：每 0.7 秒最多進出一個；新 NPC 從碼頭或橋頭放大出現並走進島內，離開的在原地縮小消失。

### 安全路徑（`npc-paths.ts`、`npc-sim.ts`）

- 路網直接取自島上既有道路的 3D 中心線（`roadProfiles`，與地圖畫的道路同一份資料）：碼頭路、燈塔路、工坊路與通往資料結構島的橋頭路。
- 每條路只使用「整個身體（含兩側車道）都在本島非樹林地塊上、且離建築足跡有距離」的區段；到海岸、碼頭、門口前就折返。NPC 不上橋、不離島。
- 所有道路在廣場中心會合，中心有路標柱，所以 NPC 繞著中心外圈（半徑 0.7）換路，不穿過中心。
- 同向前方 0.34 內有人就等待；路的盡頭每人有自己的停留位置，不會重疊。
- 驗證：以固定亂數種子讓 8 個 NPC 連走 15 分鐘，每一步的繪製位置都檢查「在本島陸地、不在樹林、離海岸與樹林 ≥ 0.12、不在建築足跡內、不在地面下」；另以 0.1 秒的長幀再跑一次。

### 繪製（`population-layer.tsx`）

- 低多邊形人物：六邊錐形身體＋二十面體頭，粉彩配色，高約 0.45 地圖單位（略低於工坊的門）；腳下一個半透明圓形軟影。
- 三個 InstancedMesh：**+3 draw call、8 個 NPC 約 +430 個三角形**。
- 不修改任何 GLB；不接收指標事件（`raycast` 關閉），不影響島嶼點擊、相機、名牌與橋樑；不投影，靜態陰影貼圖不重畫。
- 地圖原本閒置時不畫任何幀。NPC 只在「有人在走、頁面可見、畫布在畫面內、兩分鐘內有操作」時以上限幀率要求重畫；島上沒人時不要求任何幀。
- Reduced Motion：NPC 立即出現並站在原地，不要求任何持續的幀。
- Mock 資料：`LOGIC_ISLAND_POPULATION_NPC=mock` 時以時鐘產生人口（基礎程式島每 8 秒在 0–40 間切換）；審查與測試可用 `window.__logicIslandPopulation.set({ foundations: 12 })` 指定、`.set(null)` 還原。這個入口只存在於 mock build。

截圖：[桌機聚焦](evidence/presence/npc-focus-desktop.png)、[桌機全景](evidence/presence/npc-overview-desktop.png)、[手機聚焦](evidence/presence/npc-focus-phone.png)。

## 7. 驗證結果（2026-11-20，本機）

**只有本機建置的結果：不是 Vercel Preview、不是 Production、不是真機。** 建置與測試都在本任務自己的 worktree 執行（`.next`、`test-results` 為可重建輸出）；對照用的 `main` 以 `git archive origin/main` 建在 scratch 副本。

| 檢查 | 結果 |
|---|---|
| TypeScript、ESLint（全專案） | 0 錯誤 |
| Vitest（全套，含 Java） | 96 個檔案，2,599 通過／9 略過／0 失敗；其中本功能 5 個檔案 71 項 |
| 預設 build（旗標全關） | `app-paths-manifest.json` 0 個 route handler；`trials:preflight --build` 的 `routes` 與 `bundle-leak` 通過；`/api/presence` 404 |
| 預設 build 與 `main` 逐像素比對 | 9 頁 × 桌機／手機共 18 組，全部 0 差異 |
| 預設 build 的首載腳本 | 每頁 +296 bytes，首頁 +861 bytes（未壓縮）；追蹤器（4.4 KB）與 NPC（11 KB）是獨立 chunk，旗標關閉時不被引用 |
| E2E `e2e/presence.spec.ts`（`--workers=1`，桌機＋手機） | 預設 build 4／4；`PRESENCE=1`＋`NPC=mock` 28／28；`PRESENCE=1`＋`NPC=live` 2／2 |
| 全套 E2E（預設 build） | **437 通過／303 略過／2 失敗**（742 項，8.1 分鐘）。兩項失敗是 `e2e/candidate-integration.spec.ts:179` 與 `:264`（桌機，`/islands/candidate` 回到中午畫面的逐像素比對）；同兩項在未修改的 `main` `709c9fc` 基線上單獨重跑也是 3／3 失敗，本分支單獨重跑同樣 3／3 失敗，判定為 `main` 既有問題、與本變更無關（KNOWN_ISSUES P1-43），本輪未處理 |

`e2e/presence.spec.ts` 涵蓋的行為（真實瀏覽器對真實 API）：

- 訪客進入不同島嶼與群島時人口正確轉移（課程頁、課綱 hash、client-side 導覽、Region 頁）。
- 同一瀏覽器兩個分頁只算一人，位置跟著最後使用的分頁；第二個瀏覽器才算第二人。
- 重新整理後仍只算一人（取樣期間從未出現 2）。
- 背景分頁立即不計入，且期間只送出一次告別、沒有心跳；回到前景恢復。
- 斷線且未告別的訪客在逾時後被移除（實際等待約 95 秒）。
- 未知位置歸樞紐、格式錯誤回 400；宣稱「在 AI 區」的響應式設計島仍計入它自己的 Web Region。
- API 只回聚合欄位；Cookie 為 `HttpOnly`／`SameSite=Strict`／限定路徑／Session Cookie，頁面腳本讀不到；非同源請求 403。
- NPC：人口→數量與上限（桌機 8、手機 4）、Reduced Motion 靜止、逐一進出、行走時每個取樣位置都在陸地、背景頁面停止、地圖的聚焦／地點清單／返回全景照常。
- Live：另一位訪客開著基礎程式島的課程時，首頁地圖出現 1 個 NPC；他離開後消失。

### 3D 效能（`evidence/presence/perf-*.json`，工具 `evidence/presence/tools/npc-perf.mjs`）

首頁全景，人口 40（桌機 8 個 NPC、手機模擬 4 個）。單次量測，機器負載約 3–5。

| 情境 | 桌機 Metal（Apple M6） | 手機模擬 Metal | 桌機 SwiftShader | 手機模擬 SwiftShader |
|---|---|---|---|---|
| 閒置、無 NPC | 0 fps | 0 fps | 0 fps | 0 fps |
| 閒置、有 NPC | 30.4 fps（上限 30） | 20.1 fps（上限 20） | 20.3 fps | 20 fps |
| 自動旋轉、無 NPC | 60 fps | 60 fps | 26.9 fps | 58.8 fps |
| 自動旋轉、有 NPC | 60 fps | 60.1 fps | 27.3 fps | 59 fps |
| 每幀 draw call | 66 → 69 | 66 → 69 | 66 → 69 | 66 → 69 |
| 每幀三角形 | 49,113 → 49,545 | 36,923 → 37,139 | 同左 | 同左 |
| 陰影貼圖重畫 | 0 | 0 | 0 | 0 |

- 相機移動時，有無 NPC 未觀察到幀率差異（不等於「證明零成本」）。
- 主要成本是**閒置時由 0 幀變成持續繪製**（桌機 30 fps、手機 20 fps）。軟體算圖的桌機本來就只有約 27 fps，NPC 的 30 fps 要求在那裡等於全速繪製。這對手機電量與發熱的實際影響**尚未在真機量測**。
- 緩解已內建：無人時不畫、頁面隱藏／畫布離開畫面／Reduced Motion 不畫、兩分鐘無操作後停止。

### 已知限制

1. **記憶體儲存只在單一行程內有效。** `next start` 單機正確；Vercel 多個 instance 會各算各的，冷啟動歸零（§8 D1）。
2. 停用 Cookie 或 JavaScript 的訪客不會被計入（少算）。
3. 分頁保持可見但人已離開，仍會持續計入（心跳持續）；尚未加「長時間無操作即離線」。
4. 各訪客看到的 NPC 位置不同步：每個瀏覽器自己模擬行走，同步的只有數量。
5. 只有基礎程式島有 NPC。其他島的道路經同一套安全檢查（測試涵蓋首頁五島），但島中心的暫代地標與建築足跡尚未逐島檢視，所以未啟用。
6. 人口數字沒有畫面（名牌或清單上的人數）；API 已提供數字。
7. P8 `/world` 與 P9 地圖未整合（同一個場景元件，掛載點相同）。
8. 開啟 `LOGIC_ISLAND_PRESENCE=1` 的 build 會被考試系統 preflight 的「不得有 route handler」擋下（刻意未改，§8 D3）。
9. 沒有真機、iOS Safari、螢幕閱讀器驗證；NPC 是純裝飾，沒有無障礙名稱，也不進入鍵盤順序。

## 8. 正式上線建議與待決事項

以下每一項都需要使用者決定，本輪都沒有執行。

| 編號 | 決定 | 選項 | 建議 |
|---|---|---|---|
| D1 | 共用儲存 | (a) 經 Vercel Marketplace 佈建 Upstash Redis，實作 `PresenceStore` 的 Redis 版本（每個 Session 一筆帶 TTL 的 hash＋依位置的計數；介面已是非同步整體操作）；(b) 維持記憶體儲存，只在單一長駐行程的環境使用；(c) 其他即時服務 | (a)。新增基礎設施與憑證，需先核准 |
| D2 | 簽章金鑰 | 在 Vercel 專案設定 `LOGIC_ISLAND_PRESENCE_SECRET`（Production 與 Preview 分開） | 由使用者建立；不進 repo |
| D3 | 考試系統 preflight | (a) `routeCheck` 改為只允許 `/api/presence/route` 的白名單；(b) Presence 與考試系統永不同時啟用 | (a)，但這是考試系統治理的變更，需另行授權 |
| D4 | 隱私告知 | Cookie 為功能性、匿名、不跨站。是否在頁尾／隱私說明加一段文字，是否尊重 `Sec-GPC`／DNT 而不追蹤 | 加說明文字；GPC 開啟時不送心跳（小改動） |
| D5 | 人口數字的畫面 | 名牌徽章、島嶼清單、或只用 NPC | 名牌的尺寸影響相機取景，需設計後再做 |
| D6 | 擴大範圍 | 其他島的 NPC、樞紐人口畫在互動實驗島、P8／P9 地圖 | 逐島檢視路網後分批啟用 |
| D7 | 平台層防護 | 應用程式不存 IP，所以沒有以 IP 為單位的限流；可用 Vercel Firewall 對 `/api/presence` 限流或 BotID | 上線前設定 |
| D8 | 真機驗收 | iPhone SE（第 3 代）、iPhone 16、中階 Android：NPC 開啟時的 FPS、發熱、耗電、觸控 | 啟用 `NPC=live` 前完成 |
| D9 | 合併 `main` | 旗標全關時與 `main` 逐像素相同；合併即 Production 部署 | 由使用者決定時機 |

建議的啟用順序：D1＋D2 → Preview 上以 `PRESENCE=1` 單獨驗證計數（不開 NPC）→ D3、D4、D7 → Production 開 `PRESENCE=1` 觀察一段時間 → D8 → 開 `NPC=live`。每一步都可以只移除環境變數並重新部署來關閉。

## 9. 重現方式

```bash
# 單元測試
pnpm exec vitest run tests/presence-locations.test.ts tests/presence-engine.test.ts tests/presence-api.test.ts tests/presence-client.test.ts tests/presence-npc.test.ts

# 開啟 Presence 與 mock NPC 的 build（本機）
LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=mock pnpm build
LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=mock pnpm start --hostname 127.0.0.1 --port <port>

# E2E：同一組變數，單獨跑這個檔案、一個 worker（其他測試的頁面也是訪客）
LOGIC_ISLAND_PRESENCE=1 LOGIC_ISLAND_POPULATION_NPC=mock pnpm exec playwright test e2e/presence.spec.ts --workers=1
```

`NPC=live` 的測試需要以 `LOGIC_ISLAND_POPULATION_NPC=live` 重新 build（旗標在 build 時決定）。效能與像素比對的工具在 `docs/planning/evidence/presence/tools/`，從 repository 根目錄執行並以 `BASE`／`BASE_A`／`BASE_B` 指向自己啟動的伺服器。
