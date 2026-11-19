# P9.7：Continuous 3D World／Single Canvas 可行性評估

> 2026-11-19～20，原型分支 `p9/7-shared-canvas-proto`（從 `main@36a8343`），worktree `../logic-island-p97`。本文件與原型只作技術驗證，**不代表已批准正式遷移**；原型不合併到 `main`。原型路由 `/p97`、`/p97/cs` 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置存在，沒有任何頁面連結到它，正式站不受影響。

## 0. P9.6 正式環境驗證（`main@36a8343`）

| 項目 | 結果 |
|---|---|
| `main` CI `gates` | 通過 |
| Vercel Production | 成功 |
| P9 旗標 | 維持關閉：`/cs`、`/ai`、`/design`、`/web`、`/sys`、`/p9`、`/p9/cs`、`/world`、`/trials` 皆 404 |
| 首頁與既有頁面 | `/` 為原首頁；`/curriculum`、`/learn`、`/learn/linux-terminal`、`/islands`、`/regions/sys` 為 200 |
| 80 堂已發布課程 | 全部 200 |
| Console | 桌機與手機（iPhone 13 模擬）各 9 個頁面：沒有 console error、沒有未捕捉例外 |

## 1. 現行 P9.6 架構（依 `main@36a8343` 實際程式碼）

### 1.1 World（`/`）

| 項目 | 位置 |
|---|---|
| Canvas | `src/components/p9/p9-world-scene.tsx` 的 `P9WorldScene` 自己建立 `<Canvas orthographic frameloop="demand">`；`p9-world.tsx` 的 `P9World` 以 `next/dynamic` 載入；頁面 `src/app/page.tsx` → `P9Home` |
| 相機 | 沒有 camera-controls：`Framing` 依 `frameOverview()`（`src/lib/islands/regions/world-overview-geometry.ts`）放好正交相機，再套上視角 `{k, dx, dy}`；方向固定為 `VIEW` |
| Zoom／Pan | `src/lib/p9/world-view.ts`（`zoomAt`、`panBy`、`clampView`）＋ `useWorldGestures` |
| Fly-to | `src/lib/p9/world-fly.ts`（`flyTarget`、`flightView`，700 ms）＋ `useFlyTo`，結束時 `router.push('/<region>')` |
| 區域標籤 | DOM 按鈕；`placeLabels()`（`overview-labels.ts`）＋ `project()` |
| World LOD | `P9RegionMiniature`（`p9-region-miniature.tsx`）：畫各區域自己的 Region Scene Definition，地形合併、`MergedRoutes`、`HexLandmarks`、`P9Landscapes detail="world"`、GLB 以替身代替（不載入 GLB）、低面數樹 |
| 世界座標 | `useWorld()` → `overviewOutlines(P9_WORLD_MAP, sceneLayouts())`；`scenePlacement()`（`src/lib/p9/region-scene.ts`）：`W = anchor + s·(M − c)`，y 降到海平面 |

### 1.2 Region（`/cs` 等）

| 項目 | 位置 |
|---|---|
| Canvas | `src/components/islands/hex-world/hex-world-scene.tsx` 的 `HexWorldScene` 自己建立 `<Canvas>`；`hex-world-explorer.tsx` 的 `HexWorldExplorer` 以 `next/dynamic` 載入；頁面 `src/app/[region]/page.tsx` → `P9RegionExplorer` |
| 相機 | `hex-camera.tsx` 的 `HexCamera`：drei `CameraControls`（smoothTime 0.65）、`frame()`、`explore`、`pan`、P9.6 `onArrive` |
| 島嶼面板 | `HexWorldExplorer` 的 `subjectsFloating` 與 `HexPoiPanel`（P9.6 `panelsOnArrival`） |
| Island Query／History | `P9RegionExplorer`：`?island=`（`useSearchParams`＋`router.push`）、Escape；Next.js 路由歷史 |
| 建築與地形 | `HexTerrainMesh`、`MergedRoutes`、`HexGlbBuildings`（`useGLTF`）、`HexForest`（GLB 樹）、`HexLandmarks`、`HexPlaza`、`HexNaturalOcean`、`P9Landscapes`（`extras`，`lazy`） |

### 1.3 共用引擎

| 項目 | 位置 | World／Region |
|---|---|---|
| S1 IslandSpec／Registry | `src/lib/world/island-registry.ts`、`island-interactions.ts` | 共用資料 |
| Landmark Registry | `src/lib/islands/island-landmarks.ts` | 共用 |
| GLB Asset Registry | `src/lib/islands/asset-registry.ts`（`glbAssets`、`VEGETATION_ASSET`；目前只有 `basics-island.v2.1.glb`） | 只有 Region 載入 GLB |
| Hex World／Region Scene | `src/lib/islands/hex-world.ts`、`src/lib/p9/region-scene.ts` | 共用（World 縮小畫同一份定義） |
| Environment | `src/lib/islands/environments.ts`、`hex-environment.tsx`、`site-time.ts` | 共用元件，各掛各的 Canvas |
| LOD | `P9Landscapes` 的 `detail`、`P9RegionMiniature`、`treeLod`；`island-lod.ts` 的 `islandLods` 目前只有測試使用 | 兩個 LOD 分屬兩個 Canvas |

共用的是資料與座標（同一份定義、同一個 `VIEW`、`P9_REGION_BASE_AZIMUTH = 0`）；獨立的是 Canvas、相機控制器、互動與 UI 狀態。

## 2. 三方案比較

| | A：保留 Route Transition | B：Progressive Shared Canvas | C：Full Single Canvas World |
|---|---|---|---|
| 做法 | 飛行終點對準區域頁開場取景；換頁前後用同色底或最後一幀；預載區域資產 | route group layout 持有一個 Canvas，World／Region 內容輪流掛載，相機在兩個座標系間交接 | 一個長駐場景同時有世界與 29 島，依縮放串流載入／卸載；網址由相機狀態推導 |
| 開發成本 | 小：3–5 天 | 中：2–3 週（先 CS，再其他 4 區） | 大：5–8 週以上 |
| 效能（實測／推估） | 與 P9.6 相同（推估） | 實測見 §6：首次進入區域快約 630 ms、之後快約 90 ms；1 個 Context | 未量測；29 島同時常駐的記憶體是主要風險 |
| 使用者可感知 | 可消除大部分位置跳動，仍有換頁空白 | 位置與比例完全連續、沒有空白幀 | 再加上區域之間直接移動 |
| 風險 | 低 | 中：動到共用 hex 地圖元件與路由結構 | 高：重寫相機、載入與路由模型 |
| 回退 | 不需要 | 旗標＋保留現行頁面 | 困難 |

## 3. 原型實作與實測結果

### 3.1 原型內容（commit 見 §10）

- `src/app/p97/layout.tsx`：持有一個 Canvas（`P97SharedStage`），`/p97`（World）與 `/p97/cs`（CS）兩個空頁只標示路由。
- `src/components/p9/p97-shared-stage.tsx`：World 內容（沿用 `useWorld`、`Framing`、`Sea`、`P9RegionMiniature`、`useWorldGestures`、`flightView`）與 CS 內容（`HexWorldContent`）輪流掛載；相機交接：`R = (W − anchor)/s`（y 加回海平面）、Region 縮放 = World × s。
- `hex-world-scene.tsx`：拆成 `HexWorldContent`（Canvas 內的內容）與外殼；外殼在 ready 時重新 render 一次（與拆分前相同，否則從清單切回 3D 時第一個 drei `Html` 標籤是空的）。
- `hex-camera.tsx`：`from` 交接姿態，以 `useLayoutEffect` 寫入 camera-controls（它每幀套用自己的狀態，第一幀早於 effect）。
- `p9-world-scene.tsx`：只把既有的 `useWorld`、`Framing`、`Sea`、`useWorldGestures` 匯出，行為不變。
- 只有 CS、桌機版面為主（手機以同一版面測觸控），沒有清單、科目面板與 Context Loss 回退。

### 3.2 導航契約（實測：Flag ON production build、headless Chromium）

| # | 項目 | 結果 |
|---|---|---|
| 1 | World → CS | 通過：同一個 `<canvas>`，交接幀 CS 中心位置差 0 px、比例 ×1.00 |
| 2 | CS → World（連結） | 通過：`/p97`，第一幀 World 與最後一幀 Region 位置差 0.4 px、比例 ×1.005，接著飛回 1× |
| 3 | Back／Forward | 通過：`/p97/cs?island=structures` → `/p97/cs` → `/p97` → Forward `/p97/cs`，全程同一 Canvas、1 個 Context |
| 4 | 直接載入 `/p97/cs` | 通過：31 draw calls；連結回 World 正常 |
| 5 | World Zoom／Pan 後進入 CS | 通過：先放大（1.16×）並拖曳，交接仍為 0.00 px |
| 6 | 島嶼 Query | 通過：`?island=structures`，相機在同一 Canvas 上移動 |
| 7 | Reduced Motion | 通過：141 ms 進入 `/p97/cs`，沒有飛行（等兩幀讓相機套用終點後交接） |
| 8 | 快速重複點擊 | 通過：雙擊＋再點，history 只 +1（用 ref 防重入；只看 React state 時同一幀內的第二次點擊會漏掉） |
| 9 | 手機觸控（iPhone 13 模擬） | 通過：點按進入 CS、點島嶼標籤 `?island=foundations`、Back×2 回 `/p97`，無水平溢出 |
| 10 | WebGL Context Loss | **未通過**：原型沒有回退（`onUnavailable` 為空），Context 失去後畫面停住、沒有清單。正式化必須在 layout 層處理 |
| — | Console | 全部情境 0 個錯誤 |

### 3.3 既有測試（原型建置）

最終結果見 §10。過程中發現並修正一個原型造成的回歸：拆分後外殼不再在 ready 時重新 render，`hex-world` D.3-2 與 `hex-camera` D.3-5b（從清單切回 3D 後島嶼標籤不見）失敗；修正後兩項在桌機與手機都通過。`island-interactions` 的「home map (unchanged)」在 P9.6 的 Flag ON 建置也同樣失敗（Flag ON 時 `/` 是 P9 World，不是該測試要的原首頁），屬於旗標組合造成的環境問題，Flag OFF 建置中通過。

## 4. Context 與 Shader 資源分析

量測：在頁面載入前包裝 `getContext` 與 WebGL2 的 `create*`／`delete*`／`linkProgram`，按 Context 計算存活物件；`webglcontextlost` 計算釋放；每個循環後 `gc()` 兩次再讀 JS heap。World → CS → World 連續 5 次，桌機與手機模擬各一輪。

| 指標（5 個循環後） | P9.6 | 原型 |
|---|---|---|
| 累計建立的 WebGL Context | 11（每個循環 +2） | 1 |
| 同時存活的 Context | 1（舊的 Canvas 卸載時以 context loss 釋放：已釋放 10 個） | 1 |
| World → Region 是否新建 Context | 是 | 否 |
| Back 是否新建 Context | 是 | 否 |
| 累計 link 的 shader program | 135（每個循環 +24） | 70（每個循環 +11） |
| 存活的 program（World／CS） | 11／13 | 14／15，不增加 |
| 存活 buffer／texture（World） | 258／13，不增加 | 第 1 個循環後 307／13，之後不增加 |
| 存活 buffer／texture（CS） | 148／8，不增加 | 148／8，不增加 |
| JS heap（GC 後，回到 World） | 41.1 → 54.1 MB（每循環約 +3.3 MB） | 44.4 → 46.1 MB（每循環約 +0.4 MB） |

判讀：

- 原型的 buffer 在第一個循環後多 49 個、之後持平：一次性的快取，不是累積。program 數也持平。
- 原型每循環仍 link 約 11 個 program：卸載的 material 讓 three.js 釋放 program，重新掛載時再 link。存活數不增加，所以不是洩漏；之後可用 material 共用或保留 World 內容減少。
- P9.6 的 JS heap 在 5 個循環內線性成長約 3.3 MB／循環，原因尚未確定（可能是已卸載 renderer 的參考、路由快取或其他）；5 次不足以判定是洩漏，需要 heap snapshot。原型每循環約 +0.4 MB，其中包含原型自己每幀記錄的量測陣列（`__p97Track`），實際更少。
- **GPU 記憶體：無法量測**。WebGL 沒有可靠的 GPU 記憶體 API，headless Chromium 也不代表真機；以上只能說明 WebGL 物件數量不累積。

## 5. 建築 Pop-in：原因與處理

逐幀記錄主畫面的 draw call 與三角形（交接後以路由切換時間為 0）：

| 情況 | 交接後第一幀 | 完整畫面（31 draw calls、73.2k 三角形） |
|---|---|---|
| 原始原型 | 124 ms：28／38.1k | 391 ms |
| 改用靜態 import `P9Landscapes`（未預載 GLB） | 141 ms：30／47.6k | 407 ms |
| 靜態 import＋飛行開始時預載 CS 的 GLB | 140 ms：**31／73.2k** | **140 ms（第一幀就完整）** |

原因有兩個：

1. **`React.lazy` 與 Suspense 的顯示節流**：`P9Landscapes`（地標建築）在原型中是 `lazy()`。模組雖然已被 World 載入，lazy 元件第一次 render 仍會 suspend 一次，React 隨後會延後 Suspense 邊界的顯示（約 300 ms）。改為靜態 import 後地標與第一幀一起出現。
2. **GLB 載入**：CS 的建築與樹來自 `basics-island.v2.1.glb`（880 KB），原本在區域掛載時才下載與解析，`useGLTF` 期間顯示替身。改為飛行開始時 `useGLTF.preload`（只預載 CS 用到的資產：區域 layout 的 `glb` 與 `VEGETATION_ASSET`），交接時已在快取。

排除的原因：Texture（此 GLB 沒有貼圖）、Shader 編譯（交接幀已完整，沒有延遲）、LOD 切換本身（同一 commit 完成）。沒有永久載入 29 座島：只預載即將進入的區域。

## 6. 雙向導航效能

量測：production build、headless Chromium、本機 `next start`；每次新的瀏覽器 context，每個 context 連續 3 個循環，3 次中位數；P9.6 = `main@36a8343` 的 Flag ON 建置（3142），原型 = 本分支（3145）。「完整畫面」= 第一個 draw call 與三角形達到靜止值（±3%）的幀。

| 指標 | 量測方式 | P9.6 | 原型 |
|---|---|---|---|
| 點擊 → 動畫開始 | 第一幀 `data-fly="flying"` | 60 ms | 57 ms |
| 點擊 → CS 完整畫面（第 1 次，桌機） | WebGL 逐幀計數 | 1560 ms | 930 ms |
| 點擊 → CS 完整畫面（第 2、3 次，桌機） | 同上 | 959／949 ms | 865／861 ms |
| 點擊 → CS 完整畫面（第 1 次／之後，手機模擬） | 同上 | 1593／958–982 ms | 885／846–854 ms |
| Back → 第一幀 World（桌機） | 第一幀非 Region 的繪製 | 212–217 ms（65 draw calls） | 103–122 ms（26 draw calls，從 CS 的視角開始） |
| Back → World 1× 完整總覽 | WebGL 逐幀計數 | 214–231 ms | 487–517 ms（包含飛回 1× 的動畫） |
| 交接幀位置偏差 | 同一個 CS 中心點的螢幕位置 | 130 px | 0 px（Back 0.4 px） |
| 交接幀縮放偏差 | 每個 CS 地圖單位的像素 | ×0.81 | ×1.00（Back ×1.005） |
| WebGL Context 建立（World → CS → World） | `getContext` 包裝 | 2 次新建 | 0 次新建 |
| Shader program（每循環 link） | `linkProgram` 計數 | 24 | 11 |
| Draw calls／三角形（World 1×、CS 靜止） | WebGL 逐幀計數 | 65／124.9k、31／73.2k | 相同 |
| JS heap | 見 §4 | | |

判讀：

- **原型確實讓 World → CS 更快**：主要在第一次（約 −630 ms，P9.6 要建立新的 Canvas、Context 並編譯 shader）；第 2 次起 P9.6 有了快取，差距縮小到約 −90 ms。
- **快取效應**：P9.6 第一次進入明顯較慢（1560 → 約 950 ms），原型各次接近（930 → 約 860 ms）。
- **返回 World 並沒有比較慢**：原型的第一幀 World 比 P9.6 早約 100 ms；「完整總覽」較晚是因為原型從 CS 的視角飛回 1×（設計上的連續動畫），飛行中只畫畫面內的區域。
- **手機模擬沒有退化**：數字與桌機同一趨勢。

## 7. 手機風險

- B 把 Context 重建從每個循環 2 次降為 0，對 iOS Safari 較嚴格的 Context 限制有利。
- 若為了返回更快而讓 World 與 Region 同時常駐，GPU 記憶體約為兩者相加；原型沒有這樣做（World 內容卸載）。
- 共用 Canvas 後一次 Context Loss 同時影響 World 與 Region，必須在 layout 層統一回退與重建（原型未做，§3.2 #10）。
- C 需要同時管理 29 島的細節與 GLB，必須先有真機記憶體預算。
- 本機沒有實體裝置、沒有 iOS Simulator（未安裝 Xcode）、沒有 Playwright WebKit；所有手機數字都是 Chromium 的 iPhone 13 模擬，**不代表真機效能**。

## 8. 主要技術阻礙（正式遷移前）

1. **Canvas 綁在元件內**：已證實可用 `HexWorldContent` 拆分解決，但它是 `/islands`、`/world`、所有區域頁共用的元件，正式拆分要以全套地圖 E2E 驗證（原型已修正一個拆分造成的回歸）。
2. **App Router 版面**：`/` 與 `/[region]` 需移到同一個 route group layout（網址不變），且旗標關閉時不能改變原首頁。
3. **Context Loss 回退**：layout 層必須接手（原型未做）。
4. **UI 狀態**：清單、科目面板、caption、`?island=` 目前在 `HexWorldExplorer`／`P9RegionExplorer`（Canvas 外的 DOM）；要改成依路由掛在 layout 旁邊。
5. **資源預載**：只預載即將進入區域的 GLB；地標元件不能用 `lazy()`（或要先 resolve）。
6. **其他 4 區**：AI、Design、Web、SYS 的交接換算與 CS 相同（同一 `scenePlacement`），但尚未驗證。
7. **真機**：Context、記憶體、幀時間未在 iOS Safari／Android Chrome 驗證。

## 9. 推薦方案與決策

**推薦 Option B（Progressive Shared Canvas）**，先做 A 的低成本部分，並以真機驗收作為擴大範圍的閘門。

| 判斷 | 結論 |
|---|---|
| B 技術可行性 | **Go**：CS 原型 10 項契約中 9 項通過，唯一未通過的是原型刻意未做的 Context Loss 回退 |
| 正式進入 B 實作 | **Conditional Go** |
| C Full Single Canvas | **No-Go**（目前） |
| 原型合併到 `main` | **No** |

**Conditional Go 的驗收條件（正式實作前或 CS 階段結束時必須達成）：**

1. 拆出 `HexWorldContent` 後，Flag OFF 與 Flag ON 的全部地圖 E2E 通過，`/islands`、`/world` 行為與像素不變。
2. 新旗標（預設關閉）保護共用 Canvas；關閉時 `/` 與 `/cs` 與 P9.6 完全相同。
3. Context Loss：失去 Context 時回到清單導航，與現行行為一致，有 E2E。
4. 交接幀位置偏差 ≤ 1 px、縮放偏差 ≤ 1%（World → CS 與 Back 兩個方向）。
5. 交接後第一幀即為完整畫面（地標與 GLB 不 pop-in），且只預載即將進入的區域。
6. World → CS → World 10 個循環：Context 不新建、存活 program／buffer／texture 不累積、heap snapshot 無持續成長。
7. 清單、科目面板（P9.6 `panelsOnArrival`）、`?island=`、Escape、Back／Forward、Reduced Motion、手機區域按鈕全部保留。
8. iOS Safari 與 Android Chrome 真機至少各一台：World → CS → World 5 個循環沒有 Context Loss、無明顯卡頓；未達成則不擴到其他 4 區。

## 10. 原型分支、測試結果與 P9.8 建議

- 分支：`p9/7-shared-canvas-proto`（不建立合併 `main` 的 PR）。
- 測試結果：見本節下方「最終測試」。

### 最終測試（原型最終建置；Build：本分支最新 commit 的原始碼，Next 16.4.5 production build；headless Chromium，桌機 1440 × 1000 與 iPhone 13 模擬）

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint（全 repo） | 0／0 |
| Flag ON build | 通過；`/p97`、`/p97/cs` 為靜態路由 |
| Flag ON：`p9-prototype`、`hex-camera`、`hex-world`、`hex-scale`、`hex-environment`、`island-interactions`、`islands` E2E | 192 通過／28 略過／2 失敗；2 項失敗都是 `island-interactions` 的「home map (unchanged)」（桌機、手機），在 P9.6 的 Flag ON 建置同樣失敗（Flag ON 時 `/` 是 P9 World），屬環境問題，不是原型回歸 |
| Flag OFF build | 通過；`/p97`、`/p97/cs`、`/cs` 為 404，`/` 為 200 |
| Flag OFF：P9、Navigation、首頁資料庫、`/islands`、Islands Acceptance、Player、Curriculum、Hex Camera／World／Scale／Environment、Island Interactions E2E | 311 通過／85 略過／0 失敗（與 P9.6 的 Flag OFF 結果同為 311 通過） |
| 洩漏掃描 | 原型 Flag ON `.next` 與本分支 commit：clean |

截圖（`docs/planning/evidence/p9-7/`）：`p97-midflight.png`（飛行中）、`p97-just-switched-before-fix.png`（修正前：交接後建築尚未出現）、`p97-just-switched.png`（修正後：交接後第一刻建築已在）、`p97-region-settled.png`、`p97-island.png`、`p97-back-250ms.png`（Back 後 250 ms，從 CS 視角飛回）、`p97-phone-back.png`、`p97-context-lost.png`（Context Loss 後沒有回退）。

### P9.8 最小分階段遷移（建議）

1. **P9.8a**（A，低風險）：P9.6 的飛行終點改為區域頁開場取景（同一換算），並在飛行開始時預載該區域的 GLB；不改 Canvas 結構。
2. **P9.8b**：`HexWorldScene` → `HexWorldContent` 拆分（行為不變），`HexCamera` 加 `from`；全套地圖 E2E。
3. **P9.8c**：`(world)` route group＋共用 Canvas（新旗標，預設關閉），只接 CS；清單與面板依路由掛載；Context Loss 回退；地標靜態 import。
4. **P9.8d**：真機驗收（條件 8）；通過後依序接 AI、Design、Web、SYS。
