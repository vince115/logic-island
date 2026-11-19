# P8.1：Multi-Region 3D World 架構——盤點、設計與分階段方案

> 2026-11-12，Asia/Taipei。分支 `p8/multi-region-world`（worktree `../logic-island-p8`，基於 `origin/main` @ `aaf1d0a`）。
> **本階段只有文件與證據截圖**：沒有修改 `src/`、3D 模型、GLB、場景座標、路由或功能旗標；沒有 merge、push、部署。
> 原型驗證在 repo 之外的隔離副本進行（§8），其程式碼沒有進入任何分支。
> **後續**：D1–D6 已於 2026-11-12 批准方向；P8.2 的實作、量測與驗證見 [P8_2_MULTI_REGION_WORLD_FOUNDATION](P8_2_MULTI_REGION_WORLD_FOUNDATION.md)。本文件 §3 提議的 `src/lib/world3d/` 最後放在既有的 `src/lib/islands/regions/`。P8.3（D7：中央樞紐＋相鄰 Region 的關聯橋、手機驗收）見 [P8_3_WORLD_TOPOLOGY_AND_NAVIGATION](P8_3_WORLD_TOPOLOGY_AND_NAVIGATION.md)。
> 上層文件：[M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md)、[P3_FOUR_REGION_WORLD_FEASIBILITY](P3_FOUR_REGION_WORLD_FEASIBILITY.md)、[MULTI_ARCHIPELAGO_IA_V2](MULTI_ARCHIPELAGO_IA_V2.md)、[ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)；SYS 區見分支 `archipelago/p6-sys` 的 `docs/planning/P6_SYSTEMS_CLOUD_REGION.md`。

## 0. 結論先行

1. **「世界 → 區域 → 島嶼」的三層 3D 世界已經存在一半**，是 M3.1 的 Regional World 原型：`/world`（總覽）、`/world/cs`（8 島）、`/world/ai`（7 島）、`?island=` 深連結、Esc 逐層返回、無 WebGL 時的清單。它只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 的建置存在，**正式站沒有開**（`/world` 為 404），所以使用者看到的仍是五島首頁。P8 的工作是把這個原型**一般化並補完**，不是從零重做。
2. **首頁的五座島不是五個 Region，也不是完整的 CS 區**：它是 4 座 CS 主題島（基礎程式、資料結構、演算法、資料庫應用）加上跨區共用的互動實驗島。介面文案把它稱為「群島全景」「05 ISLANDS」，並把實驗島編為第 04 座，這是「實驗島被算成 CS 主題島」這個觀感的來源；資料層（`kind: 'tool'`、沒有 `regionId`）並沒有算錯。
3. **五區的資料還沒有全部在 `main`**：`main` 是 4 區／23 島／431 堂；SYS 區（6 島 89 堂）與 Linux Terminal Simulator 只在 `archipelago/p6-sys`，正式站 `/regions/sys`、`/learn/linux-terminal` 都是 404。另一個 session 正在該 worktree 進行 `origin/main` 的 merge（已解衝突、尚未 commit）。**P8.2 的前置條件是 P6 落到 `main`。**
4. **目前的 3D 程式有三處把「兩個區域」「五座島」寫死在程式裡**（§1.4），新增區域或島嶼都要改元件。P8 的資料模型（§3）把它們換成清單，新增區域只需要資料。
5. **有四件事必須由使用者決定後才能實作**（§10）：首頁何時換成世界總覽（推翻 M3 決策 A）、五區總覽構圖（改動被記為「已批准為最終」的 M3.1 總覽）、CS／AI 採用哪一版座標（已批准的 Ring + Branches 困在含私有歷史的 `m3/*` 分支）、25 座規劃中的島是否現在就進 3D 世界。

## 1. 現況盤點（P8a）

### 1.1 Git 與整合狀態（2026-11-12 18:00–18:30 實測）

| 項目 | 實況 | 證據 |
|---|---|---|
| `origin/main` | `aaf1d0a`（Merge r7/design-web）。PR #1（archipelago/v2）與 #2（trials/mvp）為 R5 的兩階段釋出，#3（R6）、#4（R7）；四個皆已 MERGED；Vercel commit status：success | `gh pr list --state all`、`gh api …/commits/aaf1d0a/status` |
| R5／R6／R7 | **已完成並在 `main`** | 同上 |
| P6（SYS）／P7（Linux Terminal） | 只在 `archipelago/p6-sys` @ `bba12cb`（已 push，落後 `main` 11 個 commit）。worktree `../logic-island-p6` **正在 merge `origin/main` @ `6d62e33`**：變更已 staged（盤點期間數量仍在變動，18:10 為 23 個、18:40 為 19 個）、`MERGE_HEAD` 存在、「All conflicts fixed but you are still merging」。這個 merge 的對象是 R6，不含 R7（`aaf1d0a`） | `git -C ../logic-island-p6 status`、`.git/worktrees/logic-island-p6/MERGE_HEAD` |
| `../logic-island-archipelago`（`r7/design-web`） | 盤點期間出現 5 個未提交的修改（文件、`e2e/navigation.spec.ts`、`src/components/regions/region-page.tsx`），屬於其他 session | `git status --short` |
| 主工作目錄（`nav/unified-sidebar` @ `0849c3f`） | 7 個已修改、2 個未追蹤，本輪未觸碰 | 起始 `git status` |
| `m3/*`（M3.2：Ring + Branches、DB v0.2、LLM v0.1 GLB、手機地標標籤） | **未在 `main`**，且 109 個 commit 中 99 個列在 `.git/info/private-history-commits`，不能直接 merge | `git merge-base --is-ancestor`、子代理盤點 |
| 本輪新增 | 分支 `p8/multi-region-world`、worktree `../logic-island-p8`（`--no-track`，基於 `origin/main`） | `git worktree list` |

本輪對其他 worktree 只讀；沒有 commit、stash、reset 或 checkout 其他分支。

### 1.2 路由的實際行為

正式站（https://logic-island-psi.vercel.app，建置未設任何旗標）與旗標建置（隔離副本，`LOGIC_ISLAND_REGIONAL_WORLD=1`）的 HTTP 狀態：

| 路由 | 正式站 | 旗標建置 | 內容 |
|---|---:|---:|---|
| `/` | 200 | 200 | 五島六角地圖（`islandsHomeWorld`）＋右側「航行指南 05 ISLANDS」＋ R6 的「更多學習群島 · 地圖之外」 |
| `/world` | **404** | 200 | 世界總覽：CS、AI 兩區的低細節輪廓＋中央樞紐（互動實驗島）；DESIGN、WEB 只在右側清單，標「尚無 3D 地圖」 |
| `/world/cs` | **404** | 200 | CS 區域地圖：8 座（4 座已開放、4 座規劃中的 19 格霧中小島） |
| `/world/ai` | **404** | 200 | AI 區域地圖：7 座，全部規劃中 |
| `/world/design`、`/world/web` | 404 | 404 | `MAPPED_REGION_IDS = ['cs', 'ai']`，沒有地圖的區域不產生頁面 |
| `/regions/{cs,ai,design,web}` | 200 | 200 | R6 的 2D 區域總覽（資料驅動，不需 WebGL） |
| `/regions/sys`、`/learn/linux-terminal` | **404** | 404 | P6／P7 不在 `main` |
| `/islands`、`/islands/candidate`、`/islands/legacy`、`/islands/hex/**` | 200 | 200 | 受保護的原型與回退頁，noindex |
| `/trials` | 404 | 404 | 需要 `LOGIC_ISLAND_TRIALS=1` |

截圖（1440×900 與 iPhone 13 模擬，headless Chromium／Metal）：
[首頁](evidence/p8-1/main-home-desktop.jpg)、[/world](evidence/p8-1/main-flag-world-desktop.jpg)、[/world/cs 桌機](evidence/p8-1/main-flag-world-cs-desktop.jpg)、[/world/cs 手機](evidence/p8-1/main-flag-world-cs-phone.jpg)。

**首頁的五座島是否被當成 World Overview？** 資料與路由上不是：`/` 讀 `islandsHomeWorld`，`/world` 才是總覽，兩者是不同的場景。但介面上是：首頁沒有任何「這是 CS 區的一部分」的說明，標題是「LOGIC ISLANDS ARCHIPELAGO／群島全景」，其他區域被放在清單底部的「地圖之外」。

### 1.3 已有的元件與能力

| 面向 | 現況 | 位置 |
|---|---|---|
| World Registry（課綱身分） | 區域、島嶼、狀態、課數皆為資料；區域狀態與數量由推導而來，不儲存；`tests/world.test.ts` 釘住 taxonomy | `src/content/world/{types,islands,index}.ts` |
| Region Layout（3D 擺放） | `REGION_LAYOUTS: Record<'cs' \| 'ai', RegionLayout>`：六角座標、橋、碼頭、每裝置方位角；`validateRegion` 檢查島數與 registry 一致、島間 ≥ 2 格水、橋 1–3 格、港口不壓地標 | `src/lib/islands/regions/` |
| 區域地圖場景 | 一個 Canvas 畫一個 `HexWorld`；地形每島 1 個合併 mesh、樹／岩／橋 instanced、道路合併、靜態陰影、樹 LOD、`frameloop="demand"`、`next/dynamic` 延遲載入、WebGL 失敗改清單 | `src/components/islands/hex-world/` |
| 世界總覽場景 | 另一個獨立場景：每區 3 個合併 mesh（已開放／規劃中／橋）、樞紐、虛線渡輪航線；固定正交鏡頭、HTML 標籤 | `src/components/world/world-overview-scene.tsx` |
| 相機 | drei `CameraControls`：自動取景、聚焦島嶼、拖曳旋轉、滾輪／雙指縮放、Auto Orbit、返回全景、reduced motion 時不動畫；**沒有平移（Pan）、沒有鍵盤相機控制、沒有相機邊界** | `hex-camera.tsx` |
| Marker | 每島一個 drei `<Html>` 內含真正的 `<button>`；手機改為 12 px 圓點＋44 px 觸控區；規劃中的島是空心圓點與「規劃中」 | `hex-world-scene.tsx`、`island-status.module.css` |
| 導覽與網址 | `?island=<id>`：選島 push、返回／前進還原、未知 id 自動移除、Esc 島 → 區 → 總覽；`/?island=` 由側欄「返回 3D 島嶼」使用（`replaceState`） | `regional-world-explorer.tsx`、`islands-world-explorer.tsx` |
| 島嶼詳情 | 已開放的島：科目、課程、已開放 X／Y、個人進度（localStorage）、完整課綱連結；規劃中的島：只有名稱、說明、「預計 N 堂」，沒有連結 | `learning-navigation.tsx`、`src/lib/world/learning-islands.ts` |
| 旗標 | `LOGIC_ISLAND_REGIONAL_WORLD === '1'`，建置時決定，只在伺服器讀取 | `src/lib/world/flag.ts` |
| GLB | 只有 `basics-island.v2.1.glb`（879,708 bytes）；`GlbAssetId` 是單一字面值型別 | `src/lib/islands/asset-registry.ts`、`types.ts` |
| 側欄／課綱 | 由 registry 產生 World → Region → Island → Lesson；島嶼預覽圖只有 5 張首頁截圖，`mapHref` 一律 `/?island=<id>` | `src/lib/nav/site-nav.ts` |
| 測試 | `e2e/regional-world.spec.ts`（旗標、8 島、標籤不重疊、島寬下限、`?island=` 行為、無 WebGL）、`tests/regional-world.test.ts`（layout 與 registry 一致、CS 四島與首頁逐項相同）、`tests/route-contract.test.ts`（靜態參數快照）、`perf/regions.perf.ts`（P0–P4） | 各檔 |

### 1.4 寫死在程式裡、會擋住擴充的地方

| # | 位置 | 寫死的內容 | 新增區域／島嶼時的後果 |
|---|---|---|---|
| H1 | `hex-layout.ts` `LayoutSpec`／`assembleLayout` | 固定鍵 `foundations`、`structures`、`algorithms`（必填）、`labs`、`databases`；各自的地形產生器（harbor、ridge、lab、vault）；只有 `planned[]` 是清單 | 任何「不是規劃中」的新島都要改型別與函式 |
| H2 | `hex-landmarks.tsx` | `pieces` 以島 ID 為鍵（foundations、structures、algorithms、labs），`databases` 另有 `if` 分支；零件各自是獨立 mesh（每個地標 4–6 個 draw call） | 新島沒有條目就沒有地標；沒有共用零件庫 |
| H3 | `world-overview-scene.tsx`、`world-overview.tsx` | `ANCHORS`、`COLORS`、`ACCENT` 以 `'cs' \| 'ai'` 為鍵；`extents` 直接取 `regions[0]`、`regions[1]` | 第三個區域要改元件 |
| H4 | `regional-world-explorer.tsx` | `OPTIONS = { cs: …, ai: … }` | 同上 |
| H5 | `types.ts` | `GlbAssetId = 'basics-island-v2.1'`；`GlbTargetAction` 的 route 只能是 `'/learn'` | 第二個 GLB 要改型別；地標不能連到課綱 |
| H6 | `hex-nature.tsx`、`hex-natural-scene.ts` | 樹一律取自 basics GLB；`MAIN_ROUTES` 是 foundations 的兩條路 | 任何有樹的區域都會載入 basics GLB |
| H7 | `site-nav.ts`、`more-regions.tsx` | 預覽圖與 `mapHref` 只認首頁的 5 座島；「更多學習群島」寫死排除 `cs` | 切換首頁後側欄的「返回 3D 島嶼」會指到舊位址 |
| H8 | `src/content/trials` | `Exam.archipelago`、`TrialPlace.regionId` 型別為 `'cs' \| 'ai'` | P8 不改；區域地圖的考試入口維持只在 cs、ai |

### 1.5 既有決策（P8 必須遵守，或需重新批准才能改）

| 決策 | 狀態 | 來源 |
|---|---|---|
| A. 不立即把 `/` 換成世界總覽；五島首頁保留為穩定版本；切換只在驗收通過後**提出建議**由使用者決定 | 2026-11-03 批准 | M3_CS_AI_MASTER_PLAN §10、M3_1 §4、P3 §4.4 |
| Regional World 三層；互動實驗島為中央樞紐；CS 8 座、AI 7 座；規劃中的島必須明確標示、不得有指向不存在課程的入口 | 2026-11-03 批准 | M3 §10 |
| CS／AI 區域座標與橋為定案（`main` 上的 baseline 版） | 2026-11-03 批准 | M3_1 §10 |
| Ring + Branches 取代 baseline（CS 多一座 MIS–CN 橋成環；AI 重新排列） | 2026-11-03 批准，**只在 `m3/*`** | `m3:docs/planning/M3_1_LAYOUT_REDESIGN_PROPOSAL.md` |
| M3.1 總覽構圖「已批准為最終」，改動需重新批准 | 記載於 P3、P6（原始批准紀錄只寫到區域座標與橋） | P3 §3、P6 §6.1 |
| 不建立第二套 World Registry；Layout 只是 3D 擺放資料 | 規則 | M3 §9、M3_1 §1.2 |
| `regionId`、`islandId` 發布後不改名；數量只在 `ISLAND_TAXONOMY §1` 與 `tests/world.test.ts` 兩處釘住 | 規則 | IA_V2 §5.4、ISLAND_TAXONOMY §1 |
| 新增區域不代表立即建立 3D 場景；DESIGN／WEB 的 3D 需另案批准；P3 建議等到有第一批已開放的課 | D2（2026-11-12）、P3 建議 | IA_V2 §0.1、P3 §4 |
| 效能預算為**暫定**：每座 GLB 島 ≤ 10k 三角形／16 draw call；區域總覽桌機 150、手機 100 draw call；世界總覽 ≤ 15 draw call／20k 三角形；首幀／就緒不比 1.5 s／2.2 s 慢超過 50% | 暫定目標，真機未量測 | ARCHIPELAGO_GLB_ART_DIRECTION §6 |
| 手機區域總覽每島 ≥ 88 px（`main`：CS 73、AI 85，**未通過**，列為正式上線前的限制） | 未通過 | KNOWN_ISSUES P2、M3.1 log |
| Draco／meshopt 需要新依賴，需另行批准；原始 BLEND／GLB 不覆蓋 | 規則 | ART_DIRECTION §5 |

## 2. 三層世界的定義（P8b）

| 層 | 是什麼 | 3D 內容 | 不放什麼 |
|---|---|---|---|
| **World Overview** | 五個 Region 與中央樞紐 | 每區一個低細節輪廓（色彩與剪影可辨識）、渡輪航線、樞紐 | 不放任何主題島的名稱、課程或進度 |
| **Region Map** | 一個 Region 的全部主題島 | 完整的六角地圖：地形、橋、地標、規劃中的霧中小島 | 不載入其他 Region 的任何資產 |
| **Island Detail** | 一座島的課程入口 | 沿用區域地圖（鏡頭聚焦該島），詳情在面板 | 不為每堂課建立 3D 場景 |

五個 Region 與島數（`sys` 以 P6 分支為準）：

| Region | 名稱 | 主題島 | 規劃課數 | 已發布 | 3D 現況 |
|---|---|---:|---:|---:|---|
| `cs` | 程式與資訊群島 | 8 | 160 | 80 | 有區域地圖（旗標後） |
| `ai` | AI 人工智慧群島 | 7 | 160 | 0 | 有區域地圖（旗標後），全部規劃中 |
| `design` | 數位設計群島 | 4 | 56 | 0 | 無 |
| `web` | 網頁與應用開發群島 | 4 | 55 | 0 | 無 |
| `sys` | 系統與雲端工程群島 | 6 | 89 | 0 | 無；資料不在 `main` |
| 合計 | | **29** | **520** | **80** | |

互動實驗島（`labs`，`kind: 'tool'`）不屬於任何 Region、不計入 29、沒有課號。它在世界總覽是中央樞紐；在每個區域地圖以碼頭與渡輪航線表示「可前往」，在清單底部有固定入口；島嶼詳情的「相關互動實驗」由 `src/content/world/labs.ts` 的對應關係列出。CS 區域地圖上它原本的位置由程式語言島取代（M3.1 已如此）。

**需要誠實面對的一點**：29 座島中只有 4 座有已發布的課，其餘 25 座（86%）是規劃中。五區 3D 世界完成後，絕大部分是「看得到、進不去」的霧中小島，這正是 P3 建議暫緩的理由。§6 的島嶼詳情為規劃中的島列出課程大綱（文字、不可點），讓它不是空的；是否現在就把 25 座規劃島放進 3D，列為 §10 的決策 D4。

## 3. 資料模型（P8c）

原則：**身分只有一份（課綱 registry），3D 只存擺放，狀態在網址與 localStorage。** 四種資料互不複製。

```
課綱 registry  src/content/world/          Region、IslandConfig、Lesson（既有，唯一的 ID 來源）
      │  以 regionId／islandId 參照，測試檢查 1:1
3D 世界配置    src/lib/world3d/（新）
      ├─ world-map.ts        WorldMapSpec：樞紐、各 Region 在總覽的位置
      ├─ region-themes.ts    RegionTheme：配色、發光、地標零件庫、地形預設
      └─ maps/<region>.ts    RegionMapSpec：島的座標與模板、橋、碼頭、相機
執行期狀態     網址（層級與選取）、localStorage（進度）、React state（相機）
```

### 3.1 使用者列出的 Region 欄位如何對應

| 欄位 | 放在哪裡 | 說明 |
|---|---|---|
| Region ID、Name、Description | registry `Region`（既有；`summary` 由 P6 加入） | 不複製 |
| Island Count、Lesson Count、Availability Status | **推導**：`taxonomy()`、`regionStatus()` | 不儲存，永遠與課綱一致 |
| Theme、Visual Identity | `RegionTheme`（新） | `accent` 留在 registry（2D 也用），其餘 3D 專屬 |
| World Position、Camera Preset | `WorldMapSpec.regions[]`、`RegionMapSpec.camera` | 每裝置各一組 |
| Navigation Target | **推導**：有 `RegionMapSpec` → `/world/<id>`，否則 `/regions/<id>` | 沒有地圖的區域不會產生無效連結 |

### 3.2 型別草案

```ts
// src/lib/world3d/types.ts（草案；ID 型別全部來自 src/content/world）
export interface WorldMapSpec {
  hub: { islandId: typeof LAB_ISLAND_ID; scale: number };
  /** 總覽上的位置；順序與 registry 的 Region.order 無關。 */
  regions: { regionId: RegionId; slot: Record<'wide' | 'tall', [x: number, z: number]>; outlineWidth: Record<'wide' | 'tall', number> }[];
}

export interface RegionTheme {
  /** 總覽輪廓與區域地圖共用的配色。 */
  palette: { open: string; planned: string; bridge: string };
  glow: 'warm' | 'cool';
  /** 程式產生的地標零件庫；島的 placement 從中選用。 */
  landmarkKit: LandmarkKitId;
  terrain: TerrainPresetId;
}

export interface RegionMapSpec {
  regionId: RegionId;
  theme: RegionThemeId;
  /** 每座島一筆；測試檢查與 islandsInRegion(regionId) 完全一致。 */
  islands: IslandPlacement[];
  bridges: HexBridge[];
  docks: { islandId: string; spurId: string }[];
  camera: { azimuth: Record<'desktop' | 'phone', number>; bounds?: { margin: number } };
}

export type IslandPlacement =
  /** 手工製作的島（基礎程式島 37 格）：完整的 tile 清單，與現在逐項相同。 */
  | { islandId: string; kind: 'authored'; tiles: HexTile[]; spurs?: HexSpur[]; cliffBeaches?: Axial[]; forest?: Axial[]; glb?: GlbPlacementSet }
  /** 模板島：形狀＋地形模板＋零件。規劃中的島是 template: 'planned'。 */
  | { islandId: string; kind: 'template'; center: Axial; shape: Axial[]; template: TerrainTemplateId;
      forest?: Axial[]; terrace?: Axial[]; spurs?: HexSpur[]; landmarks?: LandmarkPlacement[]; glb?: GlbPlacementSet };
```

- `IslandPlacement` 取代 `LayoutSpec` 的固定鍵（H1）；`harbor`、`ridge`、`lab`、`vault`、`planned` 成為 `TerrainTemplateId` 的值。
- `landmarks` 取代 `hex-landmarks.tsx` 以島 ID 為鍵的表（H2）；零件來自 `RegionTheme.landmarkKit`。
- 島的名稱、課數、狀態、進度**不在這裡**：場景收到的 `LearningIsland` 仍由伺服器端從 registry 與 catalog 組出（既有的 `regionIslands()`）。
- 規劃中或已開放由 registry 的 `status` 決定；placement 的 `template: 'planned'` 只決定地形，測試檢查兩者不矛盾（既有）。

### 3.3 新增內容時要改什麼

| 動作 | 要改的檔案 | 不需要改 |
|---|---|---|
| 新增一座島 | registry 一筆、`maps/<region>.ts` 一筆 placement、taxonomy 兩處數字 | 任何場景元件、相機、路由 |
| 新增一個 Region | registry 一筆、`maps/<region>.ts`、`region-themes.ts` 一筆、`world-map.ts` 一個 slot、`route-contract` 快照 | 任何場景元件 |
| 一座島開始有課 | 寫課（registry 狀態自動變 `available`）；把 placement 的模板從 `planned` 換成有地標的模板 | 路由、面板 |
| 一座島換成 GLB | `asset-registry.ts` 一筆、placement 的 `glb` | 場景元件（`GlbAssetId` 改為由 registry 的鍵推導） |

## 4. 導覽與網址（P8d）

### 4.1 網址規劃（相容既有路由）

| 層級 | 網址 | 狀態 |
|---|---|---|
| World Overview | `/world` | 既有（旗標後），擴為五區 |
| Region Map | `/world/<region>` | 既有 `cs`、`ai`；加入 `design`、`web`、`sys` |
| Island Detail | `/world/<region>?island=<islandId>` | 既有，維持 |
| 區域的 2D 總覽 | `/regions/<region>` | 既有（R6），維持；是無 WebGL、搜尋引擎與「沒有地圖的區域」的入口 |
| 課程 | `/curriculum#island-<id>`、`/curriculum/<slug>`、`/learn/**` | 不變 |
| 首頁 | `/` | **本計畫不自動更動**；切換方式見下 |
| 原型與回退 | `/islands/**` | 不變 |

- **島嶼用查詢參數而不是路徑段**（`/world/cs/databases`）：路徑段會讓每座島成為獨立頁面，切換島嶼時整個 Canvas 重新掛載，失去鏡頭轉場；`?island=` 的行為已有 E2E 釘住。
- **首頁切換（需批准，決策 D1）**：`/` 改為呈現與 `/world` 相同的世界總覽；既有的 `/?island=<id>`（側欄與外部連結）依 registry 轉到 `/world/<region>?island=<id>`，`labs` 轉到 `/learn`。實作前須依 `node_modules/next/dist/docs/` 確認本版 Next.js 的 redirect 規則；五島首頁的畫面由 `/world/cs` 接手（四座島逐項相同），另保留一條回退路由。
- 旗標 `LOGIC_ISLAND_REGIONAL_WORLD` 維持到 P8.5 驗收；正式開啟是獨立的批准。

### 4.2 導覽流程

```
/world ──點 Region（輪廓、標籤或清單）──▶ /world/cs ──點島（地形、名牌或清單）──▶ /world/cs?island=databases
   ▲                                        ▲  │                                       │
   └────── Esc／「世界總覽」／瀏覽器返回 ───┘  └── Esc／「返回全景」／瀏覽器返回 ◀──────┘
                                                                                       └─▶ /curriculum/<slug>、/learn/<lab>
```

### 4.3 相機與互動：已有與待補

| 能力 | 現況 | P8 的做法 |
|---|---|---|
| Zoom、Focus、Reset、Deep Link、Back／Forward、Esc 逐層 | 已有 | 保留 |
| Smooth Transition（島 ↔ 區域） | 已有（camera-controls，`smoothTime .65`；reduced motion 時直接到位） | 保留 |
| Smooth Transition（世界 ↔ 區域） | **沒有**：是兩個頁面、兩個 Canvas | P8.3：總覽鏡頭先向該區推近約 0.4 s 並預先載入區域頁，再以淡入接上區域全景。共用單一 Canvas 的作法（真正的連續飛行）要改寫 Explorer「一個 Canvas 一個世界」的假設，列為後續選項 |
| Pan | **沒有** | P8.2：右鍵拖曳／雙指拖曳平移，範圍限制在區域內容外框加邊距（`camera.bounds`） |
| Keyboard | 只有名牌按鈕與清單可用鍵盤；沒有相機鍵盤控制 | P8.5：方向鍵平移、`+`／`-` 縮放、`0` 返回全景、`[`／`]` 旋轉；清單仍是完整的等價入口 |
| Mobile Touch | 單指水平旋轉、垂直捲頁、雙指縮放；iOS Safari 未驗證 | 沿用；真機驗收在 P8.5 |
| 世界總覽的相機 | 固定取景，不能操作 | 五區時維持固定；Region 超過約 8 個時才加入縮放與平移 |

## 5. 既有 CS 場景的遷移（P8.2）

目標：首頁現有的島與互動一項都不丟，改由 CS Region 承載。

| 首頁現有內容 | 遷移後 | 驗證 |
|---|---|---|
| 基礎程式島（37 格、v2.1 GLB、工坊／燈塔／碼頭互動） | `maps/cs.ts` 的 `authored` placement，tile、道路、GLB placement 逐項相同 | `tests/world-data.test.ts` 的指紋、`tests/regional-world.test.ts` 的 deep-equal（既有） |
| 資料結構島、演算法島、資料庫應用島 | `template` placement（harbor、ridge、vault），座標、橋、森林相同 | 同上；`/world/cs` 對 `/` 的四島區域逐像素比對 |
| 互動實驗島（首頁第 5 座） | 移出 CS：世界總覽的樞紐；CS 地圖由碼頭與渡輪表示 | `islandsInRegion('cs')` 為 8、不含 `labs`（既有測試） |
| 首頁右側「航行指南」五座島清單 | `/world/cs` 的 8 島清單（已有） | E2E |
| `/?island=<id>` | 依 §4.1 轉址 | 新 E2E |
| `basics-island.v2.1.glb` | 不動：同一檔案、同一 sha256、同一 registry 條目 | `asset-registry.ts` 不變、GLB 檔 sha256 比對 |

步驟（每步結束都可回退）：

1. 以「輸出不變」為條件把 `LayoutSpec` 改為 `IslandPlacement[]`：`islandsWorld`、`islandsHomeWorld`、CS、AI 的計算結果與現在逐項相同（既有指紋測試即為驗收）。此步不改任何畫面。
2. 把 H3、H4 的 `Record<'cs' | 'ai', …>` 改為讀 `RegionTheme` 與 `WorldMapSpec`。兩區的畫面不變（逐像素比對 `/world`、`/world/cs`、`/world/ai`）。
3. 加入 Pan 與相機邊界（Level 3：相機核心）。
4. 首頁文案與右側面板的調整屬於 P8.3（需要 D1 的決定），不在這一步。

`/`、`/islands`、`/islands/candidate`、`/islands/legacy`、`/islands/hex/**` 在 P8.2 全程 0 差異。

## 6. UI／UX（P8g）

### 6.1 World Overview（桌機）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ { } Logic Island   探索世界  完整課綱  互動實驗島                 ☼  開始學習 │
├──────────────────────────────────────────────────┬───────────────────────────┤
│                                                  │ ◎ 世界總覽   5 REGIONS    │
│              ░ AI ░                              │ ┌───────────────────────┐ │
│               ▔▔▔                                │ │▌程式與資訊群島       →│ │
│   ▓ CS ▓        ┊        ░ DESIGN ░              │ │ 8 座島 · 160 堂       │ │
│    ▔▔▔ ┄┄┄┄┄ ◉ 互動實驗島 ┄┄┄┄ ▔▔▔▔▔             │ │ 已開放 80 堂          │ │
│               ┊      ┊                           │ ├───────────────────────┤ │
│        ░ SYS ░        ░ WEB ░                    │ │▌AI 人工智慧群島      →│ │
│         ▔▔▔▔           ▔▔▔▔                      │ │ 7 座島 · 160 堂 規劃中│ │
│                                                  │ ├─ DESIGN ─ WEB ─ SYS ──┤ │
│  每個輪廓下方：區名 · 島數 · 已開放／規劃中      │ │◉ 中央樞紐 · 互動實驗島│ │
│                                                  │ └───────────────────────┘ │
└──────────────────────────────────────────────────┴───────────────────────────┘
```

- 右側面板列的是**五個 Region**（島數、課數、已開放堂數、進入區域），不再是 CS 的五座島。
- 已開放的區域用飽和色與實心輪廓；全部規劃中的區域用淡色並標「規劃中」。
- 每個清單項目與輪廓一一對應（既有規則：無 WebGL 時清單是唯一入口）。

### 6.2 Region Map 與 Island Detail（桌機）

```
┌──────────────────────────────────────────────────┬───────────────────────────┐
│ 世界 › 程式與資訊群島            ← 世界總覽  ☰清單│ ◎ 程式與資訊群島 08 ISLANDS│
│ 4 座已開放 · 4 座規劃中                          │ 01 基礎程式島   20 堂   → │
│                                                  │ 02 資料結構島   20 堂   → │
│        (3D 區域地圖：8 座島、橋、碼頭)           │ 03 演算法島     20 堂   → │
│                                                  │ 04 程式語言島  規劃中 20  │
│   ● 已開放的島：名牌                             │ …                         │
│   ○ 規劃中的島：名牌＋「規劃中」                 │ ───────────────────────── │
│                                                  │ ◉ 互動實驗島（共用）    → │
│ 拖曳旋轉 · 右鍵平移 · 滾輪縮放      ⟳自動 ⌂全景 │ 區域總覽（/regions/cs） → │
└──────────────────────────────────────────────────┴───────────────────────────┘

選取一座島後，右側換成 Island Detail：
  已開放的島                         規劃中的島
  ─────────────                      ─────────────
  資料庫應用島  DB                    程式語言島  PL   [規劃中]
  說明文字                            說明文字
  教材：已開放 20／20 堂              預計 20 堂，尚未開放
  我的進度 ▓▓▓░░ 7／20                課程大綱（文字，不可點）
  ▸ 科目一（5 堂）已完成 3              PL01 …  PL02 …
  ▸ 科目二 …                          （沒有進度、沒有連結）
  相關互動實驗：SQL Playground →
  查看完整課綱 →
```

### 6.3 手機

```
World Overview                 Region Map                    Island Detail
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│ { } Logic Island │          │ ← 世界  CS   ☰   │          │ ← CS  資料庫應用島│
├──────────────────┤          ├──────────────────┤          ├──────────────────┤
│    ②             │          │  ○   ●           │          │   (鏡頭聚焦該島) │
│ ①   ◉   ③       │          │    ●   ●  ○      │          │                  │
│   ⑤   ④         │          │  ○   ●           │          │                  │
├──────────────────┤          ├───────━━━────────┤          ├───────━━━────────┤
│ ① 程式與資訊群島 │          │ 08 座島          │          │ 已開放 20／20 堂 │
│ ② AI 人工智慧群島│          │ 01 基礎程式島  → │          │ 我的進度 7／20   │
│ ③ 數位設計群島   │          │ 02 資料結構島  → │          │ ▸ 科目一 …       │
│ ④ ⑤ … ◉ 實驗島  │          │ （可上拉的清單） │          │ 查看完整課綱 →   │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

- **總覽在手機上用編號圓點，名稱放在下方清單。** 原型實測（§8）：五個區域沿用現在的大標籤會互相重疊。
- 區域地圖沿用既有的圓點名牌與 44 px 觸控區；清單改為可收合的 Bottom Sheet（收合時約 116 px，沿用 `m3` 的 D.1 尺寸），避免蓋住下緣的 Marker。
- 手機島寬：沿用 2026-11-03 在 `m3` 批准的原則——88 px 是**聚焦視角**的目標，總覽以圓點、清單與聚焦補足。此原則要套用到所有區域需使用者確認（決策 D5）。

### 6.4 與側欄一致

- 側欄的階層已是 World → Region → Island → Lesson，P8 不改結構，只改三處位址：島嶼預覽卡的 `mapHref` 由 `/?island=` 改為 `/world/<region>?island=`；Breadcrumb 加入「世界 › 區域」；「更多學習群島」併入世界總覽的區域清單。
- `/` 與 `/world` 不掛側欄（IA v2 §5.1 的既有規則），維持。

## 7. 視覺與資產策略（P8e）

**不製作 29 個 GLB。** 分三級，由 placement 決定每座島用哪一級：

| 級別 | 內容 | 成本 | 用於 |
|---|---|---|---|
| T0 規劃中 | 19 格地形＋霧＋測量樁（既有） | 每島 3 draw call、約 3.2k 三角形 | 沒有已發布課程的島（目前 25 座） |
| T1 程式產生的地標 | 地形模板＋零件庫的地標，合併為每島 ≤ 2 個 draw call（資料庫應用島的作法） | 無新檔案 | 有課但沒有 GLB 的島 |
| T2 GLB | Blender 管線的正式美術，≤ 10k 三角形、≤ 16 draw call | 每座需建模與美術驗收 | 每區 1–2 座代表島 |

- **重用**：地形模板（harbor、ridge、vault、planned…）、樹與岩石（已是 InstancedMesh）、橋與道路（已合併）、材質（頂點色，每區一組調色盤）。
- **零件庫**：把 `hex-landmarks.tsx` 裡逐個 mesh 的零件改為「零件幾何 → 依 placement 合併」，現有的燈塔、倉庫、觀測台、穹頂外觀不變，draw call 由每個地標 4–6 個降到每島 ≤ 2 個。
- **Region Theme Preset**（視覺方向，具體配置需另行提案與批准）：

| Region | 方向 | 來源 |
|---|---|---|
| CS | 工匠城鎮：木、石、紅瓦，暖色燈光 | 已批准（ART_DIRECTION §2） |
| AI | 研究實驗場：玄武岩、白陶瓷、晶體，冷色線光 | 已批准（ART_DIRECTION §2） |
| DESIGN | 設計工作室與創意建築：粉彩、畫板、色票塔 | 提案 |
| WEB | 網頁與應用城市：模組化街區、視窗框、導覽塔 | 提案 |
| SYS | 資料中心、伺服器、網路與雲端：終端中心、貨櫃港、通訊塔、浮空資料中心、輸送帶工廠、舵輪叢集 | P6 §6.3 的概念 |

- 既有 CS 五島場景**保留並納入 CS Region**（§5），不刪除重製。`m3/*` 上的 DB v0.2 與 LLM v0.1 GLB 已通過美術批准，但困在私有歷史裡；是否以及如何移植，見決策 D3。
- 區域色的深色模式對比：AI `#3949ab`（2.09）與 DESIGN `#d81b60`（3.27）在深色背景未達 AA（P6 §8）。P8 的標籤以白底深字呈現，不依賴區域色當文字色；修改區域色本身不在本計畫範圍。

## 8. 大規模擴充（P8f）與原型量測

### 8.1 原型（repo 之外，未進任何分支）

在隔離副本（`origin/main` 的複本）做了兩件事：

1. **通用配置產生器**：只給島嶼 ID 清單，把 19 格的規劃島放在間距 7 格的粗格點上，自動產生橋與碼頭。交給既有的 `validateRegion` 檢查：

| 區域 | 島數 | 橋 | `validateRegion` 問題數 | 產生＋驗證時間 |
|---|---:|---:|---:|---:|
| design | 4 | 3 | 0 | 2 ms |
| web | 4 | 3 | 0 | 1 ms |
| sys（P6 的 6 個 ID） | 6 | 5 | 0 | 1 ms |
| 壓力 x10／x20／x50／x100 | 10／20／50／100 | 9／19／49／99 | 0 | 3／5／16／50 ms |

2. **把 H3、H4 改為資料驅動後實際渲染**（7 個既有檔案的暫時修改加 1 個新檔，並暫時關閉建置的型別檢查；`sys` 與壓力區不在 registry，以替身名稱顯示）。draw call 與三角形由 repo 的 `perf/instrument.mjs` 計數，桌機與手機模擬的數字相同：

| 場景 | draw call | 三角形 | 暫定預算 | 備註 |
|---|---:|---:|---|---|
| `/world` 兩區（現況，M3.1 log） | 8 | 8,726 | ≤ 15／20k | |
| `/world` **五區＋樞紐**（原型） | **14** | **15,986** | ≤ 15／20k | 已貼近上限 |
| `/world/cs`（8 島） | 58 | 45,228 | 桌機 150／手機 100 | 與 M3.1 log 完全相同 |
| `/world/ai`（7 島） | 28 | 21,806 | 同上 | 與 M3.1 log 完全相同 |
| `/world/design`、`/world/web`（4 島） | 19 | 12,216 | 同上 | |
| `/world/sys`（6 島） | 25 | 18,772 | 同上 | |
| 壓力：20 座規劃島 | 67 | 62,826 | 同上 | |
| 壓力：50 座規劃島 | **157** | **159,158** | 同上 | 超過桌機 150 |

截圖：[五區總覽 桌機](evidence/p8-1/proto-five-region-overview-desktop.jpg)、[五區總覽 手機](evidence/p8-1/proto-five-region-overview-phone.jpg)、[SYS 區域地圖](evidence/p8-1/proto-sys-region-desktop.jpg)。

**原型證明了什麼**：新增區域地圖可以只靠資料完成，既有的驗證器、場景、相機、名牌、清單、`?island=` 都不需要修改就能運作。

**原型沒有證明、也不該被當成成果的**：

- 構圖不能用。五區總覽的輪廓太小、被標籤壓過；手機上五個標籤互相重疊；產生器把 SYS 排成一直線。這些是需要設計與批准的版面，不是產生器能決定的。
- 只量了 draw call 與三角形。首幀時間、FPS、記憶體沒有可用的數字（headless 的 FPS 不可靠，P1-20）；真機完全沒有量測。
- 沒有跑 E2E、沒有逐像素比對、沒有檢查無 WebGL 路徑。

### 8.2 規模結論

- 規劃島的成本是線性的：約 **7 ＋ 3n** 個 draw call、每島約 3.2k 三角形。以手機 100 draw call 計，一張區域地圖在不做任何合併時可容納約 31 座規劃島。
- **真正的上限是可讀性，不是 GPU**：8 座島的 CS 在 390 px 寬的手機上，最小島寬已經只有 73 px。一張區域地圖以 **12 座島**為上限；超過時拆成子群島。registry 已有 `Region.groups`（AI 區的三個導覽分組），可以直接作為子地圖的單位，網址保留 `/world/<region>/<group>`。
- 5 區 29 島：每區 4–8 座，全部在上限內。50–100 座時：區域數增加或每區拆子群島，任一時刻仍只渲染一張地圖。

### 8.3 策略

| 策略 | 現況 | P8 要做的 |
|---|---|---|
| Region-based Lazy Loading | 區域是獨立頁面，場景以 `next/dynamic` 載入；但 `REGION_LAYOUTS` 是單一模組，總覽也載入全部區域的完整 tile | 每區的 `RegionMapSpec` 各自一個模組，只由該區頁面載入；總覽改讀建置時算好的輪廓資料 |
| 卸載 | 換頁時 Canvas 卸載，各元件釋放自己的 geometry 與 material；drei 的 GLTF 快取不會清除 | 離開區域時清除該區專屬 GLB 的快取 |
| Instancing／合併 | 樹、岩、橋已 instanced；地形每島 1 個 mesh；規劃島的霧與樁每島 2 個 draw call | 霧與樁改為整區各 1 個 InstancedMesh：50 島由 157 降到約 57（估計，待實測） |
| 總覽的細節 | 每個 tile 一個六角柱後合併 | 每座島一個簡化輪廓：三角形可再降一個數量級，五區維持在預算內並留有餘裕 |
| Frustum Culling | three.js 預設逐 mesh；每島一個地形 mesh，粒度合適 | 不需額外工作；合併霧與樁時保留整區的 bounding box |
| LOD | 樹有遠景 LOD | 子群島出現時，遠處的島只畫地形 |
| Camera Bounds | 無 | 隨 Pan 加入（§4.3） |

### 8.4 載入預算（提案；真機量測前都是暫定）

| 場景 | draw call | 三角形 | 首幀 | 就緒 | 傳輸 |
|---|---|---|---|---|---|
| World Overview | ≤ 15 | ≤ 20k | ≤ 1.0 s | 同首幀 | 不載入任何 GLB |
| Region Map（桌機／手機） | ≤ 150／≤ 100 | ≤ 150k／≤ 100k | ≤ 2.25 s | ≤ 3.3 s | 每區 GLB 合計 ≤ 1.5 MB |

首幀與就緒沿用既有規則（不比 1.5 s／2.2 s 慢超過 50%）。量測方式：把 `perf/regions.perf.ts` 的固定路由改為走訪所有有地圖的區域，每區輸出 draw call、三角形、首幀、就緒與無 WebGL 的清單時間；真機沿用 `perf/device/`。每個階段回報實測數字，不以「已最佳化」代替。

## 9. 分階段交付（P8h）

| 階段 | 內容 | 前置 | 驗證等級 | 需要批准 |
|---|---|---|---|---|
| **P8.1**（本文件） | 盤點、資料模型、導覽與網址、遷移方案、擴充策略、Wireframe、風險 | — | Level 1 | — |
| **P8.2** CS Region Migration | `IslandPlacement[]`（輸出不變）、H3／H4 改資料驅動、Pan 與相機邊界、`perf/regions` 走訪所有區域 | P6 落到 `main`（或確認 P8 先不含 sys）；D3 | Level 3：全套 E2E、`/`、`/world*`、`/islands*` 逐像素比對 | 開始前 |
| **P8.3** Five-Region World Overview | 五區總覽構圖、Region Theme、區域清單面板、世界 ↔ 區域轉場、手機編號圓點 | D2；`sys` 在 registry | Level 3 | 構圖需截圖審核 |
| **P8.4** Additional Region Maps | DESIGN、WEB、SYS 的區域地圖（T0 規劃島＋區域主題）；AI 沿用 | D4；每區座標需批准 | Level 2–3 | 每區版面 |
| **P8.5** Performance & Mobile | 霧／樁合併、總覽簡化輪廓、Bottom Sheet、鍵盤相機控制、真機量測、無障礙、E2E 回歸 | 真機可用 | Level 3＋真機 | 首頁切換（D1）、正式開旗標、部署 |

每個階段各自批准才開始（M3 §8 的既有規則）；任何階段都不 merge `main`、不部署、不 force push，除非另行授權。

## 10. 需要使用者決定的事

| # | 決定 | 建議 | 不決定的後果 |
|---|---|---|---|
| **D1** | 首頁 `/` 是否、何時換成世界總覽（推翻 M3 決策 A） | P8.2–P8.4 全部在旗標後完成；P8.5 驗收後再切換，並保留回退路由 | P8 可以做完，但正式站仍是五島首頁 |
| **D2** | 五區總覽構圖：樞紐＋五瓣環狀（P6 的 S1 概念；SYS 在 WEB 與 CS 之間） | 批准方向；實際版面在 P8.3 以截圖審核 | P8.3 無法開始 |
| **D3** | CS／AI 的座標基準：`main` 的 baseline，或 2026-11-03 已批准、但只在 `m3/*` 的 Ring + Branches；以及 DB v0.2／LLM v0.1 GLB 是否移植 | 把 Ring + Branches 的座標以資料移植進 P8.2（不帶入私有歷史）；GLB 的移植另案處理 | P8.2 會以 baseline 為準，之後換座標要重做逐像素基準 |
| **D4** | 25 座規劃中的島（含 DESIGN、WEB、SYS 全部）是否現在就進 3D 世界 | 進，但島嶼詳情列出課程大綱，總覽以淡色區分；這與 P3 的建議相反，需明確確認 | P8.4 無法開始 |
| **D5** | 手機島寬 88 px 改為聚焦視角的目標，並套用到所有區域 | 採用（`m3` 上已對 CS 批准） | 手機驗收標準不明 |
| **D6** | SYS 進 `main` 的時機與 P8 的基準 | 等 P6 的 merge 由其 session 完成並進 `main` 後，P8 再 merge `main` | P8.2 起只能涵蓋四區 |

## 11. 風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| P6 的 merge 仍在另一個 worktree 進行，且對象是 R6（不含 R7） | P8 以 `main` 為基準時沒有 `sys`；之後兩邊都改 `region-layouts`、`world-overview` 會衝突 | P8.2 開始前先確認 P6 已進 `main`；P8 不碰 `archipelago/p6-sys` |
| `m3/*` 的已批准成果困在私有歷史 | Ring + Branches、手機 Marker 修正、兩個 GLB 無法直接取得 | 以資料與檔案移植，逐項標明來源 commit；移植範圍需批准（D3） |
| 86% 的島是規劃中 | 3D 世界看起來大但進不去 | 詳情顯示大綱；總覽區分已開放與規劃中；D4 由使用者確認 |
| 五區總覽已貼近 15 draw call 的暫定預算 | 再加區域會超標 | P8.5 的簡化輪廓；預算本身待真機確認 |
| 真機從未量測（D.3-4B Not Measured） | 所有效能結論都是模擬 | P8.5 列為驗收條件，不得以模擬數字標示通過 |
| `LayoutSpec` 重構動到首頁使用的資料 | 首頁畫面意外改變 | 以「輸出不變」為驗收：既有指紋測試＋逐像素比對 |
| Pan 屬相機核心 | 影響候選頁與首頁的操作 | 只在區域地圖的 preset 啟用；Level 3 驗收 |
| `e2e/regional-world.spec.ts` 依賴量測探針（`__hexProject`） | 區域頁在正式建置也載入探針 | P8.5 改為正式 preset 加 E2E 專用的讀取方式 |
| 首頁切換後的舊連結（`/?island=`） | 側欄與外部連結失效 | §4.1 的轉址與 E2E |

## 12. 驗收標準對照（P8i）

| 標準 | 現況 | 由誰驗證 |
|---|---|---|
| 世界總覽顯示五個 Region，而非五座 CS 島 | 旗標建置是兩區＋樞紐；正式站是五島首頁 | P8.3 E2E；D1 決定正式站 |
| CS 8／AI 7／DESIGN 4／WEB 4／SYS 6 | registry：`main` 上前四區正確，SYS 在 P6 | `tests/world.test.ts` taxonomy；`validateRegion` 的 1:1 檢查 |
| 互動實驗島不算 CS 主題島 | 資料正確；首頁清單把它編為 04 | P8.3 移除首頁編號；既有測試 |
| 既有五島 GLB 不被破壞 | 不動 | sha256 與 registry 條目比對 |
| 既有課程與學習進度正常 | 不動（localStorage 結構不變） | 既有 curriculum E2E |
| 未發布課程不產生無效連結 | 規劃島沒有連結（既有 E2E） | 沿用並擴及新區域 |
| Desktop／Mobile 導覽、無水平捲動、無重大遮擋 | CS／AI 桌機通過；手機島寬未達標 | P8.5 |
| Default／Flagged Build 正常 | `tests/route-contract.test.ts` 快照 | 每階段更新快照並說明 |
| 不影響 Exam Engine、不洩漏私有題庫 | P8 不改 `src/content/trials` 與 `private/`；區域頁的考試入口維持 cs、ai | `trials:leak-scan`、既有 trials E2E |

## 附錄：本輪的檢查範圍

- 讀取：`origin/main` 的原始碼與規劃文件、`archipelago/p6-sys` 與 `m3/*` 的 `git show`；兩個唯讀子代理分別盤點 3D 場景內部與既有決策。
- 執行（都在 scratch 目錄的隔離副本，未寫入任何 worktree 的 `.next` 或快取）：旗標建置兩次、`next start`（port 3128，已停止）、Playwright 截圖與 draw call 量測、一個 Vitest 檔案（7 項通過）。
- 隔離副本複製自 `../logic-island-archipelago`；複製當下該 worktree 有一個未提交的 `region-page.tsx` 修改被一併帶入，只影響 `/regions/*` 的 2D 頁面，與 `/world` 的觀察無關。
- 未執行：全套 E2E、ESLint、TypeScript 檢查（本輪沒有程式變更）、逐像素比對、真機。
