# P9 S1 引擎通用化：工程報告

> 2026-11-19（Asia/Taipei）。依據使用者同日的「P9 S0/S1 島嶼標準定案與引擎通用化」指示。
> 狀態：**S1 完成，等待審查**。沒有合併到 `main`、沒有部署、沒有修改 Production 或 Vercel 環境變數、沒有開啟 `LOGIC_ISLAND_REGIONAL_WORLD`、沒有新增或搬移任何 GLB、沒有建模。
> 標準與決策：[P9 Island Visual Standard](P9_ISLAND_VISUAL_STANDARD.md)（S0，獨立的文件 PR）。
> 所有檢查都在隔離副本執行（`git archive` 的乾淨副本加 clone 的 `node_modules`，headless Chromium，SwiftShader 軟體繪製）。**沒有 Vercel Preview、沒有真機、沒有 FPS 量測。**

## 0. 結論

- 引擎不再假設「只有基礎程式島有 GLB、廣場與互動」。版面、廣場、主路、GLB 資產、互動路由都改成每座島自己的資料，五個區域 29 座島走同一條路徑。
- 新增島嶼登錄（Island Registry）：每座島一筆，含 `islandId`、`regionId`、`publicationStatus`、`visualSpec`、`assetSpec`、`interactionSpec`。它自己不儲存任何東西，每個欄位都讀自原本的擁有者，所以島名、課程狀態、數量沒有第二份。
- 基礎程式島在區域世界（`/world/cs`）的工坊改為通往自己的課綱 `/curriculum#island-foundations`（S0 決策 4）。**首頁不變**：首頁的工坊仍通往 `/learn`（S0 決策 6）。
- 既有畫面沒有變：與 `main` 逐頁比對，Default 建置 16 頁 × 桌機與手機共 32 組：文字、連結、可見的按鈕文字、像素全部相同（0 個不同的像素）；World-only 建置 13 頁共 26 組，其中 24 組完全相同，不同的 2 組是刻意改變的 `/world/cs?island=foundations`（旗標之後，不在 Production；內容見 §6.2）。
- 驗收十項的結果在 §7。
- 一項依賴沒有在這次處理：P9.1 的世界層場景（PR #18）要改讀同一份島嶼資料，才會與區域層一致。S1 提供了它需要的推導（`islandLods`），要改的地方列在 §9。

## 1. 分支與依賴

| 順序 | 分支 | 基底 | 內容 | PR |
|---|---|---|---|---|
| S0 | `p9/s0-island-visual-standard` | `main` | 標準與決策文件（只有文件） | #19 |
| S1-1 | `p9/s1-1-assets-interactions` | `main` | C 多 GLB 資產登錄；D 型別化並經驗證的互動路由 | #20 |
| S1-2 | `p9/s1-2-generic-layout` | S1-1 | B 通用的版面、廣場與主路 | #21 |
| S1-3 | `p9/s1-3-island-registry` | S1-2 | A 島嶼登錄；世界層的低細節推導；三層契約測試 | #22 |
| S1-4 | `p9/s1-4-report` | S1-3 | 本報告與交接文件 | 本 PR |

- S1 的四個 PR 是疊起來的，依序審查與合併；每一個的基底是前一個分支。S0 與 S1 互不依賴。
- 工作目錄：S1 在 `../logic-island-p9-s1`，S0 在 `../logic-island-p9-s0`。沒有寫入 `../logic-island-p8`（P9.1 的工作目錄）；開始時它有 18 個已暫存的檔案，之後由原本的工作階段提交並推送（`06e175f`，PR #18）。
- 與 P9.1（PR #18）的關係：兩者都建在 `main` `070f440` 上。以 `git merge-tree` 試合併（不動任何工作目錄），只有 `hex-world-scene.tsx` 一個檔案有文字衝突（兩邊都改了廣場與 `extras` 附近的幾行），其餘自動合併。先合併哪一個都可以；後合併的那個要解這一處。

## 2. A：統一的島嶼資料契約

`src/lib/world/island-registry.ts`（伺服器端）。

| 欄位 | 來源（唯一的擁有者） |
|---|---|
| `islandId`、`kind`、`regionId` | 世界登錄 `src/content/world/islands.ts` |
| `publicationStatus`（`complete`／`available`／`planned`） | 世界登錄，而它由課綱的已發布課數推導 |
| `lessons.planned`、`lessons.published` | 世界登錄與課程目錄 |
| `visualSpec` | 該島在所屬區域版面裡的聚落（**同一個物件**，不是複本）、森林、GLB 擺放、廣場；以及地塊數、高度層數、道路數 |
| `assetSpec` | GLB 資產登錄（已有檔案的）、已宣告但尚無檔案的資產、備援美術的種類 |
| `interactionSpec` | 該島的互動規格，經過驗證；規劃中的島只留 `info` |

- 一筆登錄不含島名與說明文字；測試檢查序列化後的內容裡找不到島名。
- 區域頁的島嶼資料（`regionIslands`）與 `islandVisual` 改由登錄讀取。
- 已開放的島不再需要手寫的地圖定義：沒有的話由世界登錄推導（原本會丟出錯誤）。
- 三層共享同一個島：
  - **World**：總覽的輪廓直接縮小各區的版面（P8 原本如此，現在由測試固定）；新增 `islandLods`，由區域版面推導每座島在世界層的輪廓、起伏、相鄰關係與地標位置。
  - **Region**：區域地圖畫的聚落就是登錄裡的 `visualSpec.settlement`。
  - **Island**：同一張地圖，相機聚焦在其中一個聚落。
- `validateIslandRegistry()`：每座島只畫在一個地方（學科島在自己的區域、工具島在樞紐），沒有登錄以外的島被畫出來，資產與互動屬於指名它的島，規劃中的島沒有路由。
- `standardReport()`：依 Island Visual Standard 逐項檢查一座島，能由資料判定的四項給出結果，其餘四項標為未檢查。目前只有基礎程式島通過全部可檢查的項目。這是審查與排程用的報告，不擋建置。

## 3. B：通用地形與場景

| 原本 | 現在 |
|---|---|
| `LayoutSpec` 以島名為鍵：`foundations`、`structures`、`algorithms`、`labs`、`databases`、`planned` | `LayoutSpec = { islands: IslandSpec[], bridges, natural }`；`IslandSpec` 是一座島自己的地塊、崖腳沙灘、道路、森林、GLB 擺放、廣場 |
| 地形函式各寫給一座島（`harbor`、`ridge`、`lab`、`vault`） | 仍是同樣的四種地形預設，改以 `shapedIsland(id, preset, …)` 套用到任何島 |
| 一張地圖只有一個廣場（`natural.plaza`），由 `glb[0]` 推導 | `natural.plazas`：每座宣告了廣場的島各一個；場景逐一繪製，用該島的 accent |
| `MAIN_ROUTES = ['foundations-dock', 'foundations-lighthouse']` | 每座島的 `plaza.mainRoutes`；前庭與地標平台也是該島自己的資料（`forecourts`、`terraces`） |
| 建築的避讓範圍寫在版面模組裡，以節點名稱為鍵 | 移到各資產的 `footprints`（資產登錄） |
| 資料庫島的過渡美術以 `islandId === 'databases'` 判斷 | 以島嶼 id 查表（`TRANSITIONAL`），並由 `fallback-art.ts` 的清單對照 |

- 首頁地圖、`/islands`、CS 區域用的是**同一批島嶼規格**（`FOUNDATIONS_ISLAND`、`STRUCTURES_ISLAND`、`ALGORITHMS_ISLAND`、`DATABASES_ISLAND`、`LABS_ISLAND`），測試以物件相等檢查。
- 輸出沒有變：`tests/world-data.test.ts` 的指紋（世界、GLB 擺放、自然配置、地形、海面、道路）全部沿用原值。自然配置的指紋以原本的形狀（單一 `plaza`）重算，仍等於原值。
- 新測試建了一張有兩座「基礎程式島規格」的地圖（用別的 id），兩座都得到建築、廣場、路燈與加寬的主路，證明沒有任何一處依賴 `foundations` 這個名字。
- 世界層：`src/lib/islands/regions/island-lod.ts`。世界層可以畫得比區域層少，但畫的必須是同一座島；所以低細節的島是推導出來的，不是另外寫的。測試檢查輪廓（每格一點）、最高點（基礎程式島是它西側 1.8 的山丘）、相鄰島的方位與距離比例、以及地標站在區域地圖擺放它們的位置。
- 沒有改的：規劃中島嶼目前的畫法（白霧與測量標記）。S0 決策 3 要的是完整的主題世界，那需要模型，屬於 S2 之後；S1 只確保引擎不再把「規劃中」與「沒有建築、沒有廣場」綁在一起（`IslandSpec.planned` 只決定白霧，其餘欄位照樣可以宣告）。

## 4. C：多 GLB 資產系統

- `GlbAssetId` 由單一字面值改為資產登錄的鍵（`keyof typeof glbAssets`）。新增一個資產就是登錄裡多一筆。
- 每個資產記錄它屬於哪座島（`islandId`）、自己的避讓範圍（`footprints`）。`glbAssetOfIsland(id)` 由島找資產；測試檢查一島一資產、區域地圖只把資產放在它的島上。
- 共用的樹來自哪個資產，寫成一行（`VEGETATION_ASSET`），之後換成共用 Kit 只改這一行。
- **保留**：v2.1 的節點命名、Anchor、`interaction_id`、`checkGlbContract`（載入時逐節點檢查，不符就整座改用備援）、`validateGlbEntry`、`validateNodeBounds`、`fallback`。`basics-island.v2.1.glb` 沒有修改，sha256 與 bytes 的比對測試改成對登錄裡的每一個資產執行。
- **沒有新增或搬移任何 GLB**。`PLANNED_GLB_ASSETS`（資料庫島、大型語言模型島的節點宣告）維持「只有宣告、沒有檔案」。

## 5. D：通用互動

- 節點只描述「檔案裡有什麼」（名稱、role、`interaction_id`、anchor）。「點了會怎樣、名牌寫什麼」移到島嶼的互動規格，以 `interactionId` 對應。
- 路由是型別化的三種站內形狀，沒有自由字串：

| 種類 | 連到 | 誰可以用 |
|---|---|---|
| `labs` | `/learn` | 只有工具島（互動實驗島） |
| `syllabus` | `/curriculum#island-<islandId>` | 該島自己，且有已發布的課程 |
| `lesson` | `/curriculum/<slug>` | 該島自己的、已發布的課 |

- 驗證（`src/lib/world/island-interactions.ts`，伺服器端）：id 必須是 kebab-case；目標頁面必須存在於世界登錄的頁面清單；路由必須指向自己的島；課程必須已發布；規劃中的島不得有任何路由；有 GLB 的島，目標與互動必須一一對應。區域頁透過 `islandInteractions()` 取得互動，任何一項不符就丟出錯誤，建置失敗。
- 規劃中島嶼只給說明：驗證會拒絕，頁面端的 `pageInteractions()` 也會再過濾一次。
- 保留：滑鼠點擊、隱形點擊代理、鍵盤（HTML 按鈕）、觸控、HTML 地點清單、說明的開關與焦點行為。沒有互動規格的目標不會攔截點擊，也不會出現在清單。
- 名牌文字由互動規格產生：路由目標是「名稱 · 去處」（`工坊 · 課綱`、`工坊 · 學習路線`），說明目標只有名稱。

### 5.1 決策 4 與決策 6 的處理

| 頁面 | 基礎程式島工坊 | 依據 |
|---|---|---|
| 區域世界 `/world/cs`（旗標之後） | `/curriculum#island-foundations`，按鈕寫「工坊 課綱」 | 決策 4；登錄的正式規格 `ISLAND_INTERACTIONS` |
| 首頁 `/`、`/islands`、`/islands/candidate`、`/islands/hex*` | `/learn`，按鈕寫「工坊 學習路線」（與原本相同） | 決策 6；`HOME_MAP_INTERACTIONS` |
| 中央互動實驗島 | `/learn` | 指示 D |

- 首頁那一組與正式規格只差這一個目標，測試固定這一點；在首頁以外的地方使用它會被驗證拒絕。
- 首頁切換到區域世界時，刪掉 `HOME_MAP_INTERACTIONS` 即可。
- 目標網址的有效性：`/curriculum#island-foundations` 是世界登錄裡基礎程式島自己的入口點；課綱頁以 `<h2 id="island-foundations">` 呈現；E2E 實際前往四座已開放島嶼的錨點，確認標題在可視範圍內。
- GLB 檔案內 `Building_Workshop` 的 extras 仍寫著 `route: '/learn'`。程式從不讀取它（契約只比對 `role` 與 `interaction_id`），而且不得修改原始 GLB，所以保留。下一版基礎程式島的 GLB 應該拿掉這個欄位。

## 6. E：相容性

### 6.1 沒有改變的

- 正式首頁的畫面與導航；`/islands*`、`/learn`、`/curriculum`、`/regions/*`、`/trials`（預設建置為 404）。
- `LOGIC_ISLAND_REGIONAL_WORLD` 沒有開啟；預設建置的 `/world` 與五個 `/world/<region>` 仍是 404。
- 29 座島、5 個區域、中央樞紐、80 堂已發布課程、課程資料與課程 ID。
- `package.json`、lockfile、Vercel 設定、CI 設定。
- 私有題庫：沒有接觸；只以既有的掃描工具唯讀比對。

### 6.2 刻意改變的（都在旗標之後）

| 頁面 | 改變 | 原因 |
|---|---|---|
| `/world/cs?island=foundations` 的地點清單 | 「工坊 學習路線」→「工坊 課綱」，連到 `/curriculum#island-foundations` | 決策 4 |
| 同上，島嶼說明 | 「從這座燈塔出發…此島作為導覽，尚無專屬教材。」→ 世界登錄的說明「從第一支程式到遞迴與複雜度…」 | 區域世界裡它是學科島，不是導覽島；與決策 4 一致 |

### 6.3 像素與內容比對

以 Playwright 對同時執行的四個伺服器取樣（`main` 與 head，各自的 Default 與 World-only 建置）。每頁等場景、模型與名牌就緒，再等連續兩張截圖相同才比對；Reduced Motion；桌機 1440×1000 與模擬 iPhone 13；比對可視範圍的截圖。

| 建置 | 頁面 | 組數 | 文字 | 連結 | 按鈕文字 | 像素 |
|---|---|---:|---|---|---|---|
| Default | `/`、`/?island=` 五座（foundations、structures、algorithms、databases、labs）、`/islands`、`/islands/candidate`、`/islands/hex`、`/islands/hex/scale/19`、`/islands/hex/scale/37`、`/islands/legacy`、`/learn`、`/curriculum`、`/regions/cs`、`/curriculum/programs-and-algorithms` | 32 | 全部相同 | 全部相同 | 全部相同 | 全部 0 個不同 |
| World-only | `/`、`/world`、`/world/cs`、`/world/ai`、`/world/design`、`/world/web`、`/world/sys`、`/world/cs?island=structures`、`?island=databases`、`?island=networks`、`/world/ai?island=large-language-models`、`/world/sys?island=linux-systems` | 24 | 全部相同 | 全部相同 | 全部相同 | 全部 0 個不同 |
| World-only | `/world/cs?island=foundations` | 2 | 兩處不同（§6.2） | 相同 | 一處不同（「學習路線」→「課綱」） | 桌機 4,401 個不同（沒有逐像素定位；文字差異只有下面兩行）；手機可視範圍 0 個 |

- 首頁聚焦基礎程式島（`/?island=foundations`）唯一的差異是工坊按鈕多了一個看不見的屬性 `data-route="labs"`（供測試辨識去處）；文字、連結與像素相同。
- `/world/cs?island=foundations` 的文字差異只有兩行：`學習路線` → `課綱`，以及島嶼說明那一句。
- 腳本量（每頁 HTML 引用的全部 script，原始／gzip）：首頁 673／213 KB → 675／214 KB；`/world` 695／221 → 697／222；`/world/cs` 686／218 → 688／219；`/islands`、`/learn`、`/curriculum`、`/regions/cs` 不變。增加的是互動規格與路由的程式。
- 沒有比對的：捲動到可視範圍以外的部分（手機上的清單）、審查建置的頁面、真機。
- 資料與腳本在 [`evidence/p9-s1`](evidence/p9-s1/README.md)。

## 7. 驗收

對象：疊在最上面的 `p9/s1-3-island-registry`（`b1a9010`，包含 S1-1 與 S1-2）；基線是 `main` `070f440`。

| # | 條件 | 結果 |
|---|---|---|
| 1 | Typecheck、ESLint、Vitest | 通過：Typecheck 0、ESLint 0、Vitest 81 個檔案 2,004 通過／9 略過／0 失敗（本機隔離副本，macOS arm64）。GitHub CI 的 `gates`（Linux x64：Typecheck、ESLint、全套 Vitest、兩個旗標同開的建置、發布前檢查）在 PR #20、#21、#22 都通過 |
| 2 | Default 與 World-only 建置 | 兩者成功（`next build`，Next.js 16.4.5）；預設建置沒有產生任何 `/world/<region>` 頁面，World-only 產生五個 |
| 3 | 桌機、手機 E2E | 全套通過，0 失敗：World-only 493 通過／113 略過（`main` 的紀錄 485／113，多的 8 項是新增的互動測試）；Default 429 通過／177 略過（`main` 425／173）。桌機 1440×1000 與模擬 iPhone 13，4 個 worker。審查建置另跑三個規格：區域世界、世界拓樸、互動，70 通過／20 略過／0 失敗（含 `?stress=glb` 的替身模型與 `/world?without=` 的審查畫面） |
| 4 | 正式首頁及既有路由的視覺回歸 | 與 `main` 逐頁比對，Default 建置 16 頁 × 桌機與手機共 32 組：文字、連結、可見的按鈕文字、像素全部相同（0 個不同的像素）；World-only 建置 13 頁共 26 組，其中 24 組完全相同，不同的 2 組是刻意改變的 `/world/cs?island=foundations`（§6.3） |
| 5 | 80 堂已發布課程入口 | Default 與 World-only 兩個建置：課綱頁列出 80 個課程連結，80 個都回 200 並有標題；四座已開放島嶼的課綱錨點都在頁面上。E2E 的導覽規格另外逐頁開啟 |
| 6 | 規劃中島嶼沒有未發布課程入口 | 單元測試：25 座規劃中島嶼，驗證拒絕任何路由、頁面端再過濾；E2E：五個區域各一座規劃中島嶼，聚焦後沒有地點清單、沒有 `/curriculum` 連結 |
| 7 | 私有題庫洩漏掃描 | clean：追蹤檔案（701 個文字檔）、`origin/main..HEAD` 的歷史、World-only 的 `.next`（2,952）、Default 的 `.next`（2,270），對 350 題私有題目的 18,220 個片段 |
| 8 | GLB v2.1 契約與 fallback | 契約測試（節點、Anchor、`interaction_id`、尺寸、sha256、bytes）通過；E2E 的「GLB 載入失敗時回到暫代建築，HTML 地點入口仍可使用」通過（候選頁與 37 格頁） |
| 9 | 三層共享島嶼 ID、狀態與拓樸的契約測試 | `tests/island-registry.test.ts`：ids、定義（物件相等）、發布狀態、拓樸（橋、碼頭、環、樞紐連結、關聯橋）、地理（輪廓、起伏、相鄰、地標），wide 與 tall 兩種構圖 |
| 10 | S2 資料結構島 L5 Prototype 的準備清單 | §10 |

各階段的單元測試（隔離副本，`main` 的基線是 78 個檔案、1,976 通過、9 略過）：

| 階段 | Typecheck | ESLint | Vitest |
|---|---|---|---|
| `main` `070f440` | 0 | 0 | 78 個檔案，1,976 通過／9 略過／0 失敗 |
| S1-1 `3c80632` | 0 | 0 | 79 個檔案，1,987／9／0 |
| S1-2 `c95c1c0` | 0 | 0 | 80 個檔案，1,991／9／0 |
| S1-3 `b1a9010` | 0 | 0 | 81 個檔案，2,004／9／0 |

新增的測試：`tests/island-interactions.test.ts`（11 項）、`tests/island-layout.test.ts`（4 項）、`tests/island-registry.test.ts`（13 項）、`e2e/island-interactions.spec.ts`（4 項 × 桌機與手機）。

GitHub CI 不執行 Playwright（只有 Typecheck、ESLint、Vitest、建置與發布前檢查），所以 E2E 的結果都來自本機的隔離建置。`e2e/island-interactions.spec.ts` 的區域世界部分只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 的建置執行。

## 8. 已知限制與沒有做的事

1. **P9.1 的世界層還沒有接上**（§9）。`main` 上的 P8 總覽本來就由區域版面縮小而來，所以 `main` 的三層是一致的；不一致的是 P9.1 的程序化世界場景。
2. **規劃中島嶼的畫法沒有變**（白霧與測量標記）。決策 3 的完整主題世界需要模型。
3. **世界總覽的 CS 地標**（決策 5）在 `main` 上不存在（P8 總覽沒有地標）；它是 P9.1 場景的東西，列在 §9。
4. **區域地貌沒有資料**。Island Visual Standard 第 2 項（每區的地形配色、樹種、岩石）還沒有進資料模型；`standardReport` 把它標為未檢查。
5. **`hex-landmarks.tsx` 的佔位地標仍以島嶼 id 查表**。那是每座島自己的備援美術，屬於資料；新增一座島的備援是多一筆，不需要改引擎。
6. **`workshopDoor`、`lighthouseFront`** 仍在版面模組裡，它們是 v2.1 這個資產的量測值（門與基座的位置）。下一個 GLB 會需要同類的資料，屆時移到資產登錄比較合適。
7. **`IslandModelId`（三個舊模型）與 `catalogEntry`** 是舊版 `/islands` 的資料，沒有動。
8. **沒有真機、沒有 Preview、沒有 FPS**。效能預算仍是暫定值（決策 2）；S1 沒有改變任何繪製內容，所以沒有重新量測 draw call 與三角形。
9. **`m3/*` 的模型**只做了唯讀檢查（§10.4），沒有搬入任何分支。
10. 另一個工作階段在 P9.1 報告 §9.5 提出了「P9.2：資料格式、規格檢查器、以基礎程式島驗證、29 座差距表」。S1 已經做了其中的資料格式（`IslandSpec`、島嶼登錄）、檢查器（`standardReport`）與基礎程式島的驗證；差距表在 S0 文件 §4。兩邊的結論一致，沒有發現矛盾。

## 9. P9.1（PR #18）接上 S1 要改的地方

這些都在 P9.1 的檔案裡，需要在它的分支上做，沒有在這次處理。

| 檔案 | 現況 | 要改成 |
|---|---|---|
| `src/components/p9/p9-world-scene.tsx` `useWorld` | `overviewOutlines(P9_WORLD_MAP, REGION_LAYOUTS, shape)`：世界層讀 P8 的版面 | 讀與區域頁相同的版面（CS 是 `P9_CS_REGION`），兩層的海岸線才會對應 |
| `src/lib/p9/world-terrain.ts` `regionField` | 每座島的山丘位置與高度由雜訊決定 | 以 `islandLods()` 的 `summit`、`peak`、`heights` 為準；雜訊只用在海岸的細節 |
| `src/lib/p9/world-map.ts` `LANDMARK_ISLAND` 與 `p9-world-scene.tsx` `landmark('cs')` | CS 的地標是基礎程式島燈塔與工坊的複製品，站在 `foundations` 的島心 | 決策 5：改成 CS 區域自己的代表性設計；不取自任何單一島嶼，不成為第 30 座島。各島自己的地標若要在世界層出現，位置取自 `islandLods().landmarks` |
| `src/lib/p9/cs-region.ts` | 四座規劃中島嶼的地塊寫在這個檔案裡，以 `settlements.map` 替換 | 改寫成四個 `IslandSpec`，放進 CS 的 `LayoutSpec.islands`；之後它們宣告建築與廣場時走同一個建置器 |
| `src/components/p9/p9-landscapes.tsx` | 工地與遺跡 | 決策 3：換成完整的主題建築（需要模型，S2 之後） |
| `hex-world-scene.tsx` | 與 S1 有一處文字衝突 | 合併時保留兩邊：`plazas.map(…)` 與 `{options.extras}` |

## 10. S2 準備清單：資料結構島 L5 Prototype

目標：資料結構島（`structures`）通過 `standardReport` 的全部可檢查項目，並補上人工審查的四項。現況（由 `standardReport` 產生，測試固定）：地形未達（25 格、1 種高度）、建築未達（沒有 GLB）、道路與廣場未達（沒有廣場、0 條通往地點的道路）、互動未達（0 個目標）。

### 10.1 不需要建模、可以先做的（程式與資料）

| # | 工作 | 位置 |
|---|---|---|
| 1 | 地形：把 `STRUCTURES_ISLAND` 從地形預設 `harbor` 改成自己的地塊（至少 3 種高度；保留南岸沙灘；加一處崖壁）。橋頭 `(6,-6)`、`(10,-7)`、`(6,-8)`、`(10,-8)` 必須留在平地 | `src/lib/islands/islands-world.ts` |
| 2 | 版面審查：新地形會改變首頁地圖上的資料結構島（同一份規格）。要先決定：S2 的新地形只出現在審查頁，還是連首頁一起換（決策 6 目前是首頁不變） | 需要你決定（§11） |
| 3 | 道路：為每個目標加一條 `spur`（到倉庫的門、到碼頭、到地標） | 同上 |
| 4 | 廣場：`plaza: { mainRoutes, forecourts, terraces }` | 同上 |
| 5 | 互動規格：`ISLAND_INTERACTIONS.structures`，至少 3 個目標，其中一個 `syllabus` 路由到 `/curriculum#island-structures`（已確認存在） | `src/lib/islands/island-interactions.ts` |
| 6 | 資產宣告：在 `PLANNED_GLB_ASSETS` 宣告 `structures-island` 的根節點與目標節點名稱，讓地圖、備援與測試先對齊 | `src/lib/islands/glb-island-contract.ts` |
| 7 | 區域頁的審查入口：一個只在審查建置出現的頁面或參數，顯示 S2 的資料結構島（比照 P9.1 的 `/p9/cs`） | 新增 |

### 10.2 需要建模授權的

| # | 工作 | 依據 |
|---|---|---|
| 8 | 美術方向定稿：台地港口；地標候選是資料港倉庫、堆疊木箱（stack）、排隊碼頭（queue）、樹形起重架；主色 `#188038`；夜間是倉庫窗光 | `ARCHIPELAGO_GLB_ART_DIRECTION.md` §3 |
| 9 | 建模：1 個地標加至少 2 棟建築或設施（建議 `Landmark_TreeCrane`、`Building_DataWarehouse`、`Dock_Queue`，名稱待你確認），依節點、Anchor、`interaction_id` 契約；每個 Anchor 一個；必備 `Anchor_Entry`、`Anchor_Route_Exit` | `glb-island-contract.ts` |
| 10 | 匯出與衍生：glTF Binary、頂點色、`KHR_materials_emissive_strength`、無貼圖；`derive-runtime-glb.mjs`；Khronos Validator 0 error；來源紀錄與驗證報告 | `ARCHIPELAGO_GLB_ART_DIRECTION.md` §5 |
| 11 | 登錄：在 `glbAssets` 加一筆（`islandId: 'structures'`、sha256、bytes、`footprints`），從 `PLANNED_GLB_ASSETS` 移除 | `asset-registry.ts` |
| 12 | 環境裝飾：共用 Kit 的第一批零件（路燈、招牌、木箱、圍欄）。v2.1 內的同類零件是合併成整塊的 mesh，無法單獨重用 | S0 文件 §6.4 |

### 10.3 驗收（S2）

- `standardReport(structures)` 的四個可檢查項目全部通過；`tests/island-registry.test.ts` 裡「S2 target」那一項隨之更新。
- 人工審查四項：區域地貌、環境裝飾、夜間燈光（四個時段的截圖）、預算（暫定值；量測 draw call 與三角形並記錄，不當作硬限制）。
- GLB 契約測試、載入失敗時的備援、HTML 地點清單、鍵盤與觸控。
- 基礎程式島與其他頁面逐像素不變。
- 桌機與模擬手機的截圖；真機另行安排。

### 10.4 `m3/*` 的唯讀檢查（決策 8）

以 `git show` 取出到暫存區檢視，沒有寫入任何分支，沒有執行任何 Blender 腳本。

| 檔案（`m3/mobile-marker-occlusion-fix`） | 大小 | 三角形 | mesh | 材質 | 目標節點 |
|---|---|---|---|---|---|
| `databases-island.v0.2.glb` | 180,152 bytes | 2,617 | 8 | 2（頂點色、暖色發光） | `Landmark_DatabaseTower`、`Building_IndexHall`、`Landmark_ReplicaTowers`、`Plaza_DataTables` |
| `llm-island.v0.1.glb` | 317,540 bytes | 4,938 | 10 | 2（頂點色、冷色發光） | `Building_SymbolLibrary`、`Building_TokenizationWorkshop`、`Landmark_TransformerTower` |

- 兩者的根節點、目標節點與 Anchor 名稱都符合 `main` 上 `PLANNED_GLB_ASSETS` 的宣告，無貼圖，使用 `KHR_materials_emissive_strength`。
- 兩者都只有建築：`Props` 與 `Vegetation` 群組是空的，沒有碼頭目標。以 Island Visual Standard 衡量，第 3 項（建築）可以滿足，第 5 項（環境裝飾）沒有。
- LLM 的檔案多一個 `Anchor_Route_Exit_Agents`，`main` 的宣告沒有它。
- 該分支另有 Blender 管線（`scripts/blender/island_template.py`、`export_island_glb.py`、`preview_island.py`、各島的模型腳本）與資產文件（`docs/assets/contracts/*`、來源紀錄、驗證報告、美術審查的截圖）。commit 訊息標示兩個模型都在「等待美術審查」。
- 對 S2 的意義：資料結構島沒有現成的模型；可以參考的是那條管線的做法與資料庫島的規模（約 2.6k 個三角形、3 棟建築加 1 個廣場）。是否沿用那條管線需要你另外授權。

## 11. 需要你決定

1. **S1 的四個 PR 是否可以依序合併**（旗標關閉；首頁逐像素不變）。我沒有合併任何一個。
2. **P9.1 的接續**（§9）由誰、在哪個分支做：在 PR #18 上繼續，或等 S1 合併後另開一個分支。
3. **S2 的新地形是否進首頁**（§10.1 第 2 項）：資料結構島的規格是首頁與 CS 區域共用的；改地形會改首頁畫面。可以讓 S2 的規格只在審查頁生效，首頁維持現狀直到你驗收。
4. **S2 的節點名稱與建模授權**（§10.2）。
