# P8.2：Multi-Region World Foundation——資料模型、導覽、CS 遷移與五區域總覽原型

> 2026-11-12，Asia/Taipei。分支 `p8/multi-region-world`（worktree `../logic-island-p8`）。
> 上層文件：[P8.1 架構設計](P8_MULTI_REGION_3D_WORLD_ARCHITECTURE.md)（決策 D1–D6 的來源）、[M3.1 Regional World](M3_1_REGIONAL_WORLD_ARCHITECTURE.md)、[P6 Systems & Cloud Region](P6_SYSTEMS_CLOUD_REGION.md)。
> **範圍**：全部在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 的 build 之後；預設 build（正式站）的路由、首頁 `/` 與其 3D 場景沒有改動。沒有 merge `main`、沒有 force push、沒有部署。
> 沒有新增或修改任何 GLB／BLEND；CS 已批准的 M3.1 座標一格未動。AI、DESIGN、WEB、SYS 的區域地圖與五區總覽構圖是**待截圖審核的提案**。
> **同日補充（§11）**：依你的回饋，AI 群島改為**六瓣旋轉狀**（不是放射狀；原 M3.1 配置完整保留、一行可切回）；DESIGN／WEB／SYS 的島改成依課程關聯排列、有關聯的島用橋連接。「群島與群島之間」的放射狀拓樸尚未實作，見 §11.4。本文件 §2.3、§5、§6 的表格已更新為補充後的狀態。

## 0. 結論

1. **五個 Region 都有自己的 3D 區域地圖，29 座主題島各在自己的區域地圖上**：`/world/cs`（8）、`/world/ai`（7）、`/world/design`（4）、`/world/web`（4）、`/world/sys`（6）。互動實驗島不在任何區域地圖上，它是世界總覽中央的共用樞紐。
2. **區域與島嶼的數量不再寫在場景程式裡**。哪些區域有地圖、畫在總覽的哪裡、用什麼顏色，都是資料（§2）；頁面、總覽與測試只讀 `MAPPED_REGION_IDS`。P8.1 列出的寫死處 H1–H8 中，與 `/world` 有關的都已移除（§2.4）。
3. **`/world` 是五區域世界總覽原型**：中央樞紐加五個輪廓各異的區域，1440／1280／375／320 四種寬度標籤互不重疊（§5）。
4. **導覽完整到 Island → 課程**：網址深連結、上一頁／下一頁、Esc 逐層返回並把鍵盤焦點放回原處、鍵盤平移／縮放／旋轉／回全景、相機邊界、手機雙指縮放與平移（§3）。規劃中的島可以聚焦、可以看課程大綱，但沒有任何通往課程頁的連結。
5. **正式站不受影響的證據**：旗標關閉的路由快照沒有變；`/` 與 `/islands*` 用到的共用元件只新增了預設關閉的選項（§6）。

## 1. Git 基線與 Phase 1

| 項目 | 狀態（2026-11-12 實測） |
|---|---|
| `origin/main` | `1f93cc8`（Merge r7/release-record；PR #5）。R5／R6／R7 都在 `main`；Vercel 與 `gates` 檢查為 success |
| P6（SYS）／P7 | `archipelago/p6-sys` @ `89fe1d4`，**merge 已完成並 push**：已含 `main` @ `1f93cc8`，領先 `main` 6 個 commit，PR #6 開啟中（未合併），`gates` 檢查 success，worktree `../logic-island-p6` 乾淨。其歷史沒有任何一個 commit 在 `.git/info/private-history-commits` 中 |
| SYS 是否在 `main` | **否**。正式站仍無 `/regions/sys`、`/learn/linux-terminal`（等 PR #6） |
| P8.1 文件 | commit `3361bf0`（文件＋7 張證據截圖）已 push 到 `origin/p8/multi-region-world` |
| P8 基線（D6） | 以 merge commit `f5a09cd` 把 `origin/archipelago/p6-sys` 併入 P8 分支（merge，不 rebase）。P8 因此建立在「`main` ＋ SYS」上；**P8 的 PR 必須排在 PR #6 之後**，否則會把 P6 的 6 個 commit 一起帶進 `main` |
| 其他 session | `../logic-island`（`nav/unified-sidebar`）、`../logic-island-p6`、`../logic-island-archipelago`、`../logic-island-m3-ring`、`../logic-island-t3j` 全程只讀，沒有 commit、stash、reset、checkout |
| `m3/*` | 沒有 merge、沒有 cherry-pick（D3）。本階段也沒有移植 Ring + Branches 座標：CS／AI 沿用 `main` 上已批准的 M3.1 baseline（見 §8 待決事項） |

P8 分支上本階段的 commit：`f5a09cd`（SYS 基線 merge）、`d862891`（實作：資料模型、區域地圖、導覽、總覽原型與測試）、以及本文件與證據的 commit。實作是一個 commit 而不是每個 Phase 一個：把區域清單改成資料後，所有讀取它的元件必須同時更新才能通過型別檢查，中間狀態無法各自驗證。

## 2. World／Region／Island 資料模型（Phase 2）

### 2.1 原則

- **課程 registry（`src/content/world`）是 ID 與課程狀態的唯一來源**：區域與島嶼的 ID、名稱、順序、課數、開放狀態都只在那裡。
- **3D 層只存空間與外觀**：位置、輪廓、相機、顏色。單元測試檢查區域配置的欄位只有 `regionId／layout／camera／docks／source`，世界總覽配置裡沒有任何課數或名稱。
- **數量一律推導**：島數、課數、已開放／規劃中由 `regionSummaries()` 從 registry 算出；總覽標題的「05 REGIONS」是陣列長度。

### 2.2 檔案

| 登錄／型別 | 檔案 | 內容 |
|---|---|---|
| 型別（schema） | `src/lib/islands/regions/schema.ts` | `RegionLayout`、`CameraPreset`、`RegionTheme`、`IslandPlacement`、`LatticeMapSpec`、`OverviewPlacement`、`WorldMapSpec`、`IslandVisual` |
| **World Layout Registry** | `src/lib/islands/regions/world-map.ts` | `WORLD_MAP`：樞紐與每個區域在總覽上的位置、寬度、標籤方向，各有 `wide`（桌機）與 `tall`（手機）兩套；`validateWorldMap()` 檢查互不重疊 |
| **Region Layout Registry** | `src/lib/islands/regions/region-layouts.ts` | `REGION_LAYOUTS`（以 registry 的區域 ID 為鍵）、`MAPPED_REGION_IDS`（推導）、`regionLayout(id)` |
| **Island Placement Schema** | `src/lib/islands/regions/lattice-layout.ts` | `latticeLayout(spec)`：由 `IslandPlacement[]`（島 ID＋格點座標＋可選的海岸修剪與碼頭）與 `links` 產生區域地圖 |
| **Camera Presets** | `RegionLayout.camera` | 每區的方位角（桌機／手機）與標籤伸展距離 |
| **Region Theme** | `src/lib/islands/regions/region-themes.ts` | 每區在總覽上的陸地、規劃中陸地、橋的顏色；強調色來自 `src/lib/world/region-accents.ts`（2D 頁面與 3D 共用同一份） |
| **Island Visual Status** | `islandVisual(id)`（`src/lib/world/learning-islands.ts`） | 推導而不儲存：`state`＝`open`／`planned`（registry 狀態），`tier`＝`glb`／`landmark`／`outline`（區域配置） |

P8.1 文件曾提議新目錄 `src/lib/world3d/`。實作改放在既有的 `src/lib/islands/regions/`，因為 M3.1 的區域配置、驗證器與測試已經在那裡；另開目錄會形成第二個登錄。

### 2.3 兩種區域地圖

| 來源 | 區域 | 說明 |
|---|---|---|
| `authored` | CS | 手工地形與座標，即 `main` 上已批准的 M3.1 baseline，**沒有任何座標變更**（單元測試仍逐島比對首頁的地塊、橋、GLB 擺放與道路）。AI 的 M3.1 配置保留為 `AI_BASELINE_LAYOUT` |
| `lattice` | AI、DESIGN、WEB、SYS | 每座島是半徑 2 的規劃中島（共用地形），放在間距 7 格的粗六角格點上：相鄰島之間恰好兩格海、橋恰好跨兩格，符合既有的 `validateRegion` 規則。每個 registry 島一筆 `IslandPlacement` |

四個 lattice 區域的輪廓不同（單元測試檢查四者的格點集合互異），配置依課程關聯決定（§11）：

| 區域 | 島數 | 輪廓 | 橋 |
|---|---:|---|---|
| AI 人工智慧 | 7 | 六瓣旋轉狀：六座島同向傾斜、圍著潟湖成環，大型語言模型島是潟湖中央的小六角島 | 石橋 7 座（環 6＋到中央 1），沒有輻射狀的橋 |
| DESIGN 數位設計 | 4 | 菱形：UI 設計與互動設計在中間，UX 研究與設計系統在兩端 | 木橋 5 座 |
| WEB 網頁與應用開發 | 4 | 東西向的菱形：網頁基礎與行動應用在中間，前端與響應式設計在兩端 | 木橋 5 座 |
| SYS 系統與雲端工程 | 6 | Linux 在中央、四座島放射環繞，Kubernetes 在 DevOps 與伺服器之外 | 石橋 8 座 |

`latticeLayout` 遇到無法建出的規格會直接丟錯（非相鄰格卻要架橋、有島沒被橋連到、碼頭緊鄰橋頭、碼頭在被修剪的地塊、兩島同格、沒有碼頭），所以錯誤會讓 build 與單元測試失敗，而不是畫出壞掉的地圖。單元測試另以 1、4、12、30 座島驗證產生器輸出都通過 `validateRegion`。

### 2.4 新增內容時要改什麼

| 要做的事 | 要改的地方 | 不用改 |
|---|---|---|
| 在既有 lattice 區域加一座島 | registry 加島；該區 `LatticeMapSpec` 加一筆 `placements`（與一筆 `links`） | 任何元件、頁面、總覽 |
| 新增一個區域 | registry 加區域與島；`REGION_LAYOUTS` 加一筆；`WORLD_MAP.regions` 加一筆；`region-themes.ts`／`region-accents.ts` 各加一筆顏色（型別會要求） | 任何元件、頁面、路由程式 |
| 島從規劃中變成有課程 | 不用改 3D 就能通過型別檢查，但單元測試會要求區域配置的 `planned` 與 registry 一致，並需要為它決定 T1／T2 的外觀（美術決定） | — |

P8.1 §1.4 的寫死處：H1（`MAPPED_REGION_IDS = ['cs','ai']`）改為推導；H2（總覽 `ANCHORS`、`COLORS`、`extents` 以 cs／ai 為鍵）改讀 `WORLD_MAP` 與 `REGION_THEMES`；H5（`OPTIONS = { cs, ai }`）改由區域配置產生；總覽文案與試煉入口不再列舉區域。H3／H4（`LayoutSpec` 的固定鍵、`D2A_CENTERS`）屬於首頁與 CS 手工地形，D1 決定首頁不動，本階段沒有碰。試煉模組自己的 `'cs' | 'ai'` 型別沒有修改（不影響 Exam Engine）；世界頁面只把區域 ID 傳過去，沒有相關考試的區域拿到空清單。

## 3. World／Region 導覽（Phase 3）

### 3.1 路由（旗標開啟的 build）

| 層級 | 網址 | 說明 |
|---|---|---|
| World | `/world` | 五區域總覽＋右側導覽清單（手機在地圖下方） |
| Region | `/world/<region>` | `cs`、`ai`、`design`、`web`、`sys`；其他值是 404（`dynamicParams = false`） |
| Island | `/world/<region>?island=<id>` | 聚焦一座島；未知的 ID 會從網址移除 |
| Lesson | `/curriculum/<slug>`、`/learn/<slug>` | 既有路由，由島嶼面板的連結進入 |
| 不需 WebGL 的入口 | `/regions/<id>` | 保留不變；總覽的每個區域項目與每張區域地圖的清單都有連過去的連結 |

旗標關閉（預設 build、正式站）時 `/world` 與所有 `/world/*` 都是 404，首頁沒有任何 `/world` 連結；路由契約測試的旗標關閉快照沒有變動。

### 3.2 導覽行為

| 能力 | 做法 |
|---|---|
| URL Deep Link | `?island=<id>` 直接開在該島；其他查詢參數保留 |
| Browser Back／Forward | 選島用 `router.push`，上一頁／下一頁還原聚焦 |
| Escape | 島 → 區域 → 世界總覽，一次一層 |
| Focus Management | 從島按 Esc：焦點回到該島的地圖名牌（3D 不可用時回到清單項目）。從區域回到總覽（Esc 或「世界總覽」連結）：焦點落在該區域的導覽項目。以 `sessionStorage` 傳遞，只在同一分頁有效 |
| Camera Reset | 「返回全景」按鈕；鍵盤 `0` 或 `Home` |
| Keyboard Navigation | 地圖容器可聚焦（有無障礙名稱說明按鍵）：方向鍵平移、`+`／`-` 縮放、`[`／`]` 旋轉 15°；名牌與清單本來就是按鈕，Tab／Enter 可用 |
| 相機邊界 | 視野中心不會離開「所有島嶼的包圍盒＋3 單位」；E2E 連按 40 次方向鍵後地圖中心仍在畫面附近 |
| Mobile Navigation | 單指左右旋轉（上下仍捲動頁面）、雙指縮放與平移；島嶼圖釘與總覽標籤都有 44 px 觸控區；清單在地圖下方 |
| 規劃中的島（D4） | 可聚焦、清單與面板標示「規劃中」與預計堂數，唯一的連結是「查看課程大綱」→ `/regions/<region>#island-<id>`（只有主題，沒有課程頁）。E2E 檢查面板內沒有 `/curriculum/<slug>` 連結 |

平移、鍵盤與相機邊界是 `HexSceneOptions.mapControls` 這個新選項，只有區域地圖開啟；首頁與 `/islands*` 沒有開，行為與原來相同。

## 4. CS Region 遷移（Phase 4）

- `/world/cs` 有 8 座學科島：基礎程式、資料結構、演算法、資料庫應用（4 座已開放，地形、橋、GLB、道路與首頁逐項相同）＋程式語言、計算機網路、系統分析與設計、管理資訊系統（4 座規劃中）。每一座都對應 registry 的一筆記錄，且 `regionId` 是 `cs`（單元測試）。
- **互動實驗島不是 CS 的第九座島**：它在 registry 是 `kind: 'tool'`、沒有 `regionId`，不在任何區域地圖上，是 `WORLD_MAP.hub`。CS 區域地圖的清單下方另有一段：「程式與資訊群島共 8 座學科島。互動實驗島是各群島共用的工具島，不屬於這個群島。」並連到 `/learn`。
- 既有的 CS 場景與資產原樣保留：沒有改 `islands-world.ts`、`hex-layout.ts`、任何 GLB 或地形產生器。
- **首頁 `/` 沒有修改**（D1，以及「不修改 Production 首頁」）。因此首頁清單目前仍把實驗島編為第 04 座、標題仍是「05 ISLANDS」；這個標示問題需要改首頁文案才能解決，列為 §8 的待決事項，沒有自行變更。

## 5. 五區域 World Overview 原型（Phase 5）

### 5.1 構圖（`WORLD_MAP`，提案，待截圖審核）

座標單位是海面上的螢幕對齊單位（`[向右, 向遠方]`），樞紐在原點。不是五等分的圓：各區距離與寬度不同，寬度大致跟著島數走。

| 位置（順時針） | 區域 | 桌機 `at`／寬 | 手機 `at`／寬 | 輪廓來源 |
|---|---|---|---|---|
| 中央 | 樞紐（互動實驗島） | `[0, 0]`／8 | `[0, 0]`／6 | 首頁實驗島的地塊 |
| 上 | CS | `[-4, 30]`／30 | `[-1, 28]`／19 | 8 座不規則島（4 綠、4 淺） |
| 右 | AI | `[27, 10]`／23 | `[13, 9]`／13 | 六瓣旋轉（6 瓣圍著潟湖＋中央小島） |
| 右下 | DESIGN | `[19, -24]`／16 | `[10, -19]`／11 | 4 島菱形 |
| 左下 | WEB | `[-13, -28]`／19 | `[-10, -23]`／13 | 4 島長鏈 |
| 左 | SYS | `[-29, 4]`／20 | `[-13, 4]`／12 | 中央 Linux＋放射的 5 島 |

- 每個區域的輪廓就是它自己區域地圖的地塊縮小而成，所以輪廓與區域地圖永遠一致；顏色來自 `REGION_THEMES`。
- 樞紐到每個區域碼頭有虛線渡輪航線，表示從樞紐可以到任何區域。
- 標籤是 HTML 按鈕，掛在輪廓的指定側；若仍會互相碰到，會依實際量到的按鈕尺寸自動錯開（純函式 `labelNudges`）。手機上標籤縮成一行（名稱＋島數），完整數字在下方清單。
- **29 座島沒有塞進同一個場景**：總覽只畫輪廓（每區最多 3 個 draw call），進入區域頁才載入該區的地圖。

### 5.2 截圖

| 檔案（`docs/planning/evidence/p8-2/`） | 內容 |
|---|---|
| `overview-1440.jpg`、`overview-1280.jpg` | 桌機世界總覽 |
| `overview-375.jpg`、`overview-320.jpg` | 手機世界總覽 |
| `region-sys-1440.jpg`、`region-design-1440.jpg`、`region-web-1440.jpg` | 三個新區域地圖（桌機） |
| `region-cs-1440.jpg` | CS（座標未變） |
| `region-ai-1440.jpg` | AI 六瓣配置（§11） |
| `region-sys-375.jpg`、`region-ai-375.jpg` | 手機區域地圖 |
| `focus-sys-docker-375.jpg` | 手機聚焦一座規劃中的島 |

## 6. 效能與「不影響既有場景」的證據

量測環境：隔離副本的 production build（`LOGIC_ISLAND_REGIONAL_WORLD=1 LOGIC_ISLAND_TRIALS=1`），headless Chromium（Metal），`perf/instrument.mjs` 的 WebGL 計數器；區域頁另由場景自己的 `canvas.__hexPerf()` 交叉確認（兩者數字相同）。手機是桌機 GPU 上的視窗模擬，**不是真機**。

### 6.1 Draw call 與三角形（最後一幀，主畫面）

| 場景 | 1440×1000 | 1280×800 | 375×812 | 320×568 | 暫定預算 |
|---|---|---|---|---|---|
| `/world` 五區域總覽 | 14／16,490 | 14／16,490 | 14／16,106 | 14／16,106 | ≤ 15／20k |
| `/world/cs`（8 島） | 58／45,228 | 同左 | 同左 | 同左 | 桌機 150／手機 100 |
| `/world/ai`（7 島，六瓣配置） | 28／25,302 | 同左 | 同左 | 同左 | 同上 |
| `/world/design`（4 島） | 26／14,849 | 同左 | 同左 | 同左 | 同上 |
| `/world/web`（4 島） | 26／14,807 | 同左 | 同左 | 同左 | 同上 |
| `/world/sys`（6 島） | 37／23,018 | 同左 | 同左 | 同左 | 同上 |
| `/world/ai?island=large-language-models`（聚焦） | 21／24,678 | 21／24,678 | 22／24,246 | 20／24,198 | 同上 |
| `/`（首頁，對照） | 66／49,113 | 66／36,923 | 66／36,923 | 66／36,923 | — |

- `/world/cs` 與 P8.1 盤點時（變更前）的數字完全相同：58／45,228。`/world/ai` 改成六瓣配置後 draw call 仍是 28（與 M3.1 配置相同），三角形由 21,806 增為 25,302（橋由 6 座變 7 座、六瓣各多一塊岬角）。
- 新區域的每座規劃中島比 M3.1 的規劃中島多 2 個 draw call：旗桿與旗面各是一個 mesh，尚未合併或改成 instancing（§9）。
- 五區域總覽比 M3.1 兩區域總覽（8）多 6 個 draw call，仍在暫定預算內；它沒有載入任何區域地圖、GLB、樹或水面效果。

### 6.2 FPS

自動旋轉 4 秒的幀間隔（production build，非 reduced motion）：`/world/cs`、`/world/ai`（六瓣配置）、`/world/sys`、`/world/design`、`/` 在四種視窗下都是 **60 fps，p50／p95 16.7 ms，沒有任何一幀超過 33 ms**。這是 headless 桌機 GPU 的數字，受 vsync 限制，只能說明「沒有觀察到掉幀」，不能代表手機真機。世界總覽是靜態畫面（`frameloop="demand"`，只在版面改變時重畫），沒有持續的幀率可量。

**沒有取得的數字**：首幀時間、可互動時間、JS heap 的前後比較、真機 FPS。儀器記錄的「第一筆 rAF 時間」不是首次繪製時間，不列入。

### 6.3 逐像素前後比對（變更前 `f5a09cd` 對 `d862891`，同為旗標開啟的 build）

| 頁面 | 桌機 1440×1000 | 手機（iPhone 13） |
|---|---|---|
| `/`（地圖畫布） | 0 個像素不同 | 0 |
| `/islands`（地圖畫布） | 0 | 0 |
| `/world/cs`、`/world/cs?island=databases`（3D 區域，隱藏 HTML 疊層） | 0 | 0 |
| `/world/ai`（3D 區域） | 第一個實作 commit `d862891` 為 0；§11 的六瓣配置是刻意的改動，不再相同 | 同左 |

桌機的 `/world/cs` 若連同 HTML 疊層一起比，右側清單下半部會不同：清單多了「共用實驗島／清單總覽」一段，提示文字也改了。3D 內容沒有變。

## 7. 驗證結果（Phase 6）

全部在 repo 之外的隔離副本執行（`rsync` 自 P8 worktree、`node_modules` 以 macOS clone 複製、直接呼叫 node CLI），沒有在任何 worktree 產生 `.next`、cache 或報告。

| 檢查 | 結果 |
|---|---|
| Typecheck（`tsc --noEmit`） | exit 0 |
| ESLint | exit 0 |
| Vitest（全套，JDK 在 PATH） | 第一個實作 commit：1923 passed／9 skipped／0 failed。§11 補充後重跑：**1932 passed**／9 skipped／0 failed（73 個檔案），tsc 與 ESLint 仍為 exit 0；`tests/regional-world.test.ts` 新增 P8.2 的資料模型、世界總覽配置與 lattice 產生器測試，五個區域都通過 `validateRegion` |
| Production Build（旗標開啟） | 成功；`/world` 與 `/world/{cs,ai,design,web,sys}` 皆為靜態頁 |
| Production Build（預設） | 成功；`/world` 是靜態 404、`/world/[region]` 沒有產生任何參數（與變更前相同） |
| Regional World E2E（旗標開啟，桌機＋手機） | 第一個實作 commit：35 passed／6 skipped／0 failed。§11 補充後重跑：**32 passed／6 skipped／0 failed**（skipped 是只在另一種裝置或旗標關閉時執行的測試） |
| 全套 E2E（旗標開啟，546 項） | **451 passed／85 skipped／10 failed**。10 項失敗的歸因見下 |
| E2E（預設 build：regional-world 旗標關閉、navigation、home-databases、islands-acceptance、hex-camera） | **77 passed／53 skipped／0 failed**；`/world` 與五個 `/world/<region>` 皆 404，首頁沒有 `/world` 連結 |
| Route Contract | 旗標關閉的路由快照**沒有變動**；雙旗標開啟的快照只多 `world/[region]` 的 `design`、`sys`、`web` 三項 |
| Mobile Interaction | E2E（iPhone 13 模擬）：總覽標籤 44 px 觸控區、點選進入區域、單指仍可捲動頁面（`touch-action: pan-y`）、清單選島、規劃中島的大綱連結、聚焦寬度 ≥ 88 px（五個區域） |
| Private Question Leak Scan | `scripts/trials/leak-scan.ts`，以本機私有題庫（350 題、18,220 個片段）比對：追蹤中的 622 個檔案、`origin/main..HEAD` 的 110 個文字物件與 commit 訊息、旗標開啟 build 的 `.next`（3,154 個文字檔）——**三者皆 clean** |
| Exam Engine | `src/content/trials`、`src/lib/trials`、`src/components/trials`、`scripts/trials`、trials 的測試與 E2E **沒有任何檔案變更**（`git diff f5a09cd..HEAD` 為空） |

### 7.1 全套 E2E 的 10 項失敗

| 測試 | 數量 | 歸因 |
|---|---:|---|
| `e2e/curriculum.spec.ts`：28、150、229 行（桌機＋手機） | 6 | **既有**。在變更前的 `f5a09cd` build 上同樣失敗；測試仍預期「四座島」等多群島改版前的文字 |
| `e2e/db-activities-f1c.spec.ts`：140 行（桌機＋手機） | 2 | **既有**。在 `f5a09cd` build 上同樣失敗 |
| `e2e/islands.spec.ts`：84 行「燈塔與碼頭只顯示簡短說明」（`/islands`、`/islands/legacy`，桌機） | 2 | **負載下不穩**。全套執行時機器 load average 約 9.7；在 `f5a09cd` 上通過，在本分支單獨重跑 3 輪 6／6 通過（load 1.8） |

本階段沒有修這 8 項既有失敗（不在 P8 範圍，且屬於其他 session 的工作）。

## 8. 待你決定或審核

| # | 事項 | 說明 |
|---|---|---|
| R1 | **五區域總覽構圖**（D2 要求截圖審核） | §5 的位置、寬度與配色是提案；調整只需改 `world-map.ts` 與 `region-themes.ts` 的數字 |
| R2 | **AI／DESIGN／WEB／SYS 區域地圖的輪廓** | §11 的關聯式放射配置是提案；每座島目前是共用的規劃中地形＋強調色旗幟 |
| R3 | **規劃中島的旗幟**（D4 的「可辨識」） | 只加在三個新區域。CS／AI 的規劃中島維持 M3.1 已批准的霧中小島（沒有旗幟），因為那是已核准的外觀；要不要也加，需要你決定 |
| R4 | **首頁清單的標示** | 首頁仍把實驗島編為第 04 座、標題「05 ISLANDS」。建議改為只給 4 座學科島編號、實驗島標「共用」、標題改為「04 座學科島 · 共用實驗島」。這會改到正式站首頁文案，所以沒有自行變更 |
| R5 | **CS 是否改用 Ring + Branches 座標**（D3） | AI 已依你的要求改為六瓣配置（§11），Ring + Branches 對 AI 不再適用。CS 本階段沒有移植。Ring + Branches 只存在於 `m3/*`（含私有歷史，不能 merge）；要移植只能把座標重新當資料寫進 `region-layouts.ts`，而且會改動 `main` 上已核准的 baseline 構圖，需要你確認後再做 |
| R6 | **PR 順序** | P8 分支包含 P6 的 6 個 commit。建議等 PR #6 合併後 P8 再 merge `main` 一次，再開 P8 的 PR |

## 9. 已知限制

- 手機數字都是桌機上的視窗模擬；沒有真機量測。
- 沒有連續的 World ↔ Region 相機轉場：兩者是不同路由、不同場景，切換是換頁。
- 規劃中的島在三個新區域外觀幾乎相同（共用地形，只有海岸修剪與旗幟顏色不同）；區域主題目前只影響總覽，區域地圖本身的地形配色尚未依主題變化。
- 旗桿與旗面各一個 draw call，未合併、未 instancing；島數多的區域應先處理這點。
- 鍵盤平移的方向是相機的左右／前後，地圖旋轉後方向鍵跟著相機轉（與滑鼠拖曳一致）。
- 焦點回復依賴 `sessionStorage`；被瀏覽器停用時只是不回復，不影響導覽。
- P8.1 提出的「每張區域地圖最多 12 座島、超過拆子群島」尚未實作（目前最大的區域是 8 座）。

## 10. 下一階段：各 Region 3D 地圖建置計畫

前提：R1–R3 審核通過；任何 GLB 製作、已核准構圖的更動、首頁切換仍需另行批准。

| 階段 | 內容 | 產出與驗收 | 需要批准 |
|---|---|---|---|
| P8.3a 區域主題落地 | `RegionTheme` 擴充地形配色（草地、沙灘、霧色），套用到區域地圖；規劃中島的標記合併為每區一個 instanced mesh | 每區地圖一眼可辨；draw call 不高於本階段；CS／AI 首頁共用島 0 像素差異 | 配色 |
| P8.3b SYS 區域（6 島） | 依 P6 文件的島嶼主題做 T1 程序化地標套件（機櫃、貨櫃、天線、雲台、輸送帶、舵輪），每島合併 ≤ 2 draw call | 6 座島各有可辨識的地標；手機聚焦 ≥ 88 px；標籤不重疊 | 地標造型 |
| P8.3c WEB、DESIGN 區域（各 4 島） | 同上：瀏覽器視窗／版面格線／裝置架／手機；畫板／便利貼牆／動線軌道／元件庫 | 同上 | 地標造型 |
| P8.3d AI 區域（7 島） | 沿用已批准的「研究園區」方向做 T1 地標；是否採 Ring + Branches（R5） | 同上 | R5、地標造型 |
| P8.3e CS 區域（8 島） | 4 座規劃中島的 T1 地標；4 座已開放島不動 | 已開放 4 島 0 像素差異 | 地標造型 |
| P8.4 效能與擴充 | 區域地圖 LOD（遠景用輪廓）、子群島（`Region.groups` → `/world/<region>/<group>`）、真機量測（iPhone／Android 各一）並定案預算 | 20／50 島壓力測試在預算內；真機 FPS 與首幀數字 | 預算定案 |
| P8.5 整合與切換 | 首頁右側面板改為五區域、`/` 是否改為世界總覽（D1）、`/?island=` 轉址、回退路由、全套 E2E 與逐像素比對 | 驗收後才切換 | **首頁切換、merge、部署** |

每區 1–2 座代表島的 GLB（T2）不在上表內：屬於「大規模重製 3D 模型」，需要你另外批准範圍、預算與美術方向。

## 11. 同日補充：AI 六瓣旋轉配置與依關聯排列的區域地圖

依三則回饋修改（2026-11-12）：

1. 「人工智慧群島外型的排列應該比較類似 OpenAI 的 logo」
2. 「群島之間有相關的應該比較像是拓樸的放射狀，有關聯的都用橋樑連接」
3. 「AI 群島是六瓣旋轉狀，不是放射狀」

我一開始把第 2 則讀成「AI 群島內部要放射狀」，做了一版中央島加六條輻射橋的配置；第 3 則更正後已改掉。現況如下。

### 11.1 AI 人工智慧群島：六瓣旋轉狀

- **六瓣圍著潟湖成環**，每一瓣朝同一個方向傾斜：外側一邊是三格的岬角，另一邊與內側各缺一格（海灣）。單元測試檢查「第 j 瓣就是第 0 瓣繞中心轉 j×60°」，而且單瓣不是左右對稱（所以有旋轉方向）。
- **沒有輻射狀的橋**。六瓣之間以六座橋首尾相接；順序是 AI 基礎 → 生成式 AI → 深度學習 → 機器學習 → AI 工程與 MLOps → AI 代理 → 回到 AI 基礎，相鄰兩座在課程上都有關聯。
- **第七座島在潟湖中央**：大型語言模型島是一座小六角島，只用一座橋接到與它關聯最強的 AI 代理島（地圖上每座島都必須走得到）。
- 相機預設轉 30°，桌機標籤伸展距離縮為 6：總覽狀態桌機每座島 ≥ 180 px。**手機總覽的最小島寬由 M3.1 配置的 85 px 降為 74 px**（六瓣的外形比原本的長環寬），E2E 的手機下限由 80 改為 70，與 CS 相同；手機的目標是聚焦後 ≥ 88 px（D5），仍通過。
- 這是「六重旋轉對稱的島嶼排列」，用來呼應那個標誌的外形，不是標誌本身的複製。
- **原配置沒有刪除**：M3.1 已批准的 AI 配置完整保留為 `AI_BASELINE_LAYOUT`（單元測試仍驗證它有效），在 `REGION_LAYOUTS` 改一行即可切回。AI 的規劃中島維持 M3.1 的霧中外觀，沒有加旗幟。

### 11.2 「關聯」從哪裡來

沒有為地圖另外宣告關聯。`src/lib/world/island-relations.ts` 從課程目錄推導：**一座島的某堂課把另一座島的課列為先修或建議先修，兩座島就是有關聯**。同一份資料也能算出區域之間的關聯強度（§11.4）。

| 區域 | 區內有關聯的島對 | 有橋 | 說明 |
|---|---:|---:|---|
| DESIGN | 5 | 5 | UI 設計與互動設計並排在中間，UX 研究與設計系統在兩端 |
| WEB | 5 | 5 | 網頁基礎與行動應用在中間，前端與響應式設計在兩端，東西向 |
| SYS | 10 | 8 | Linux 在中央，伺服器、DevOps、Docker、雲端環繞，Kubernetes 在外側；沒有橋的是 Docker—Kubernetes、雲端基礎設施—DevOps |
| AI | 15 | 7 | 依你的指示是旋轉狀而非放射狀，所以只有環上的六座橋與到中央的一座；其餘 8 個關聯（其中 5 個是與大型語言模型島）沒有橋 |
| CS | — | — | 沿用已批准的 M3.1 手工配置，本次沒有依關聯重排 |

單元測試固定：四個 lattice 區域的**每一座橋都連接兩座有關聯的島**（沒有無關聯的橋）；DESIGN／WEB 全部關聯有橋，SYS 沒有橋的兩個關聯被釘住。DESIGN 與 WEB 的關聯結構相同（都是「兩個中心＋兩端」），所以輪廓同為菱形，以方向、海岸與配色區分。

lattice 新增 `extend`（三格的岬角）；產生器會拒絕朝向鄰島、位於被修剪地塊、或擋住碼頭的岬角。

### 11.3 這一版需要你確認的地方

- 我把第 2 則回饋套用在 DESIGN／WEB／SYS 的**島與島之間**。如果你指的只是群島（區域）與群島之間，這三張區域地圖可以維持這個依關聯的排法，或改回前一版（菱形／長鏈／三層堆疊），都只是資料。
- AI 的六瓣目前是「六角形的島加岬角與海灣」，旋轉感來自六瓣同向的缺口與突出；若要更像相扣的環（更細長、更明顯的重疊），需要做專用的島形，屬於美術決定。

### 11.4 尚未實作：世界總覽上「群島與群島之間」的關聯

區域之間的關聯強度（跨區的先修／建議先修數）：AI—CS 77、CS—SYS 30、DESIGN—WEB 15、CS—WEB 14、CS—DESIGN 5、AI—SYS 5、AI—WEB 2、SYS—WEB 1。只有 AI—DESIGN、DESIGN—SYS 沒有關聯；CS 與其他四區都有關聯。

目前總覽仍是 D2 批准的「中央樞紐（互動實驗島）＋五區環繞」，只有樞紐到各區的渡輪虛線，**沒有畫區域之間的橋**。要把「有關聯的群島用橋連接、呈放射狀」做到總覽上，有兩種做法，會改動已批准的總覽構圖，需要你選：

- **(a) 保留中央樞紐**：渡輪虛線改成橋；環上相鄰且有關聯的區域之間再加橋（CS—AI、DESIGN—WEB、WEB—SYS、SYS—CS）；不相鄰的關聯（CS—WEB、CS—DESIGN、AI—SYS、AI—WEB）經由中央樞紐。
- **(b) 以關聯為準的放射狀**：CS 與四區都有關聯，會落在中央，其他四區向外放射，互動實驗島另外安置。這會改動 D2。

## 附錄：本輪沒有做的事

- 沒有修改首頁 `/`、`/islands*`、`islands-world.ts`、`hex-layout.ts`、任何 GLB／BLEND、任何地形產生器。
- 沒有 merge `main`、沒有 merge 或 cherry-pick `m3/*`、沒有 force push、沒有部署、沒有開 PR。
- 沒有修改試煉（Exam Engine）的任何檔案，沒有把私有題庫帶進分支或 build。
- 沒有真機測試；沒有跑預設 build 的全套 E2E（只跑了 §7 表列的旗標關閉相關 spec）。
