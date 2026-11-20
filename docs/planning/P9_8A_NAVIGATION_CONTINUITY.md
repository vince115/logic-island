# P9.8a：World → Region 導航連續性（雙 Canvas）

> 2026-11-20，分支 `p9/8a-navigation-continuity`（從 `main@36a8343`，即 P9.6 合併後），worktree `../logic-island-p98a`。P9 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置生效；沒有修改 Vercel 環境變數、Production 或旗標。
> 保留 P9.6 的雙 Canvas 架構，不做 Shared Canvas。P9.7 原型（`p9/7-shared-canvas-proto`，`0ec5564`、`f4c5829`）只作參考，沒有合併或 cherry-pick；其報告 `docs/planning/P9_7_SINGLE_CANVAS_FEASIBILITY.md` 在該分支上。

## 1. 範圍

1. World Fly-to 的終點等於 Region 相機的初始視角。
2. 消除 World → Region 切換時的位置與縮放跳動。
3. Region GLB 預載。
4. 首次進入 Region 時建築延遲出現（pop-in）。

## 2. P9.6 的問題出在哪裡

| 問題 | 原因（實際程式） |
|---|---|
| 切換時地圖跳動 | Fly-to 終點是「區域外框佔自由舞台 78%」（`flyTarget`，`FILL = .78`），區域頁卻用自己的取景：內容點（`fitPoints`）、桌機右側 340 px 清單、上下保留空間、手機標題列。兩者不同，所以 Canvas 一換就跳。 |
| 終點被拉回 | 飛行每一幀都經過平移限制（`clampView`）。CS 在世界地圖最上方，手機上它的開場視角超出限制約 158 px，終點被拉回。 |
| 最後一幀沒畫出來 | Canvas 內的相機由 R3F 在自己的下一次提交與繪製時更新；P9.6 設定最後視角的同時就導航，負載較高時頁面在最後一幀畫出之前就切換，畫面停在約 98–99% 的位置（E2E 中觀察到 1–7 px、縮放差 0.1–0.6%）。 |
| 地標晚約 300 ms 出現 | 區域頁的 P9 地景（地標建築）是 `React.lazy`，即使模組已下載，第一次渲染仍會暫停，Suspense 會延後約 300 ms 才顯示。 |
| 建築、樹木先是佔位物 | 區域的 GLB 在區域頁掛載後才開始下載，第一幀是佔位建築與圓錐樹，之後才換成 GLB。 |

## 3. 改了什麼

### Phase A：Fly-to 終點 = Region 開場視角（`a8718aa`）

- `src/lib/islands/hex-framing.ts`：把相機取景的純數學（`frame`、`fitPoints`、`captionPoint`、`VIEW`）原封不動從 `hex-camera.tsx`、`hex-world-scene.tsx` 移出，讓 World 不必載入區域場景就能算出區域頁的取景。區域頁與 `/islands`、`/world` 的行為不變。
- `src/lib/p9/region-layout.ts`：區域頁的版面規則（寬版全螢幕、清單 340/300 px、單欄時標題列 86 px 與下方控制列 142 px、圖釘斷點、`PHONE_ROOM`）。區域頁的 `PHONE_ROOM`、`PHONE_PIN_REACH` 改為從這裡讀，同一份數字。
- `src/lib/p9/region-opening.ts`：`regionOpening` 算出區域頁開場時畫在 Canvas 中心的地圖點與縮放；`openingWorldView` 算出 World 的視角，讓同一個地圖點落在同一個螢幕點、每單位同樣的像素數。World 的縮圖就是區域地圖等比例縮小（`scenePlacement`），所以一個視角就能讓所有點同時對齊。
- `p9-world-scene.tsx`：
  - 點擊時用當下的視窗大小、`--header-h` 與 100svh，算出飛行終點；算不出來時（中央樞紐、舞台尚未量好）沿用原本的 `flyTarget`。
  - 飛行中的視角不做平移限制；取消飛行（Escape、滾輪、拖曳）時，視角會回到平移限制內。
  - 最後一個視角畫出後（兩個 frame，約 33 ms）才換頁。
  - 新增 Review hook `canvas.__p9Project(region, x, y, z)` 與 `__p9Unit(region)`，用來和區域頁的 `__hexProject` 比較。
- 飛行時間仍是 700 ms；縮放、平移、Escape、Reduced Motion、手機區域按鈕、Back/Forward 都保留。

### Phase B：Region 資源預載（`897e122`）

- `src/lib/p9/region-models.ts`：區域頁會載入的 GLB 清單。包括每座島的建築組，以及地圖有樹時的植被組，與 `HexGlbBuildings`、`HexForest` 的條件相同。
- `p9-scene-loaders.ts` 與 `p9-region-models.ts`：
  - 飛行開始時，把**目標區域**的 GLB 以區域頁相同的參數（不用 Draco、不用 Meshopt）預先下載並解析，放進 drei 的 `useGLTF` 快取。每個區域只做一次，也不預載其他區域或其他島嶼。
  - 清單在 World 的 chunk 裡算；只有 drei 的 loader 另外成為一個小 chunk。
  - 世界頁暖機時載入的地景模組會保留下來。區域頁的 lazy 地景發現模組已載入時，會立刻完成（React.lazy 接受已完成的 thenable），不再等 Suspense 延後顯示。直接開區域頁時仍是原本的 lazy 載入。
- 預載失敗時：失敗會留在快取，和區域頁自己載入失敗一樣。該島顯示佔位建築（`HexGlbBuildings` 的 fallback），區域頁、標籤與清單照常可用（E2E 驗證）。
- 沒有改 GLB、模型或任何座標。

### Phase C：測試（`ddb078f`）

- `tests/p9-region-opening.test.ts`：
  - 在參考螢幕上，預測的區域頁 Canvas 與 P9.6 建置實測一致：桌機 1440×1000 → (0, 0, 1440, 1000)；手機 390×664 → (0, 174, 390, 434)。
  - 五個區域的飛行終點都在縮放範圍內，且讓開場中心落在區域 Canvas 中心、縮放相同。
  - 預載清單等於區域頁實際載入的 GLB，且沒有重複。
- `e2e/p9-continuity.spec.ts`：
  - 五個區域、桌機與手機：World 最後一幀對 Region 第一幀，以 5×5×2 個螢幕點比較，最大跳動 ≤ 1 px，縮放差 < 0.5%。
  - 先縮放與平移 World 再進入區域（手機用區域按鈕）：同樣的標準。
  - Back、換區域、Forward：同樣的標準，且沒有 GLB 被下載兩次。
  - 快速重複點擊：只開一個區域、只多一筆歷史紀錄。
  - CS 第一幀的 draw calls 與三角形數等於穩定後，基礎程式島的模型來源是 `glb`。
  - Reduced Motion：沒有飛行，立刻進入，模型只下載一次。
  - 所有 GLB 請求都失敗：區域仍可進入，顯示佔位建築與清單，除了預期的 GLB 錯誤外沒有其他 console 錯誤。
- **修正 Flag ON 的 home-map 測試前提**：
  - `island-interactions.spec.ts` 的「home map (unchanged)」檢查舊首頁的島嶼地圖。旗標開啟時 `/` 是 P9 World，沒有那張地圖，所以這個測試只在旗標關閉的建置執行（CI 是旗標關閉）。
  - 另外新增一個旗標開啟時的測試：P9 World 首頁沒有島嶼可聚焦，同一座基礎程式島的工坊在 P9 CS 頁通往該島課綱。
  - 沒有刪除測試或放寬斷言。

## 4. 量測條件

- 本機 production 建置（`next build` 加 `next start`），macOS 上的 headless Chromium（ANGLE Metal）。
- 桌機 1440×1000。手機是模擬的 iPhone 13（390×664、DPR 3、觸控）；手機的 `web` 標籤被縮放按鈕遮住（見第 8 節），所以手機一律以程式觸發標籤的 click。
- 基準：`main@36a8343` 的建置只加上同一個 `__p9Project` 量測 hook（`scratchpad/p96probe`，沒有行為變更）。Bundle 比較用未修改的 `main` 建置。
- **不是真機結果**。P9.7 原型的數字沒有拿來當作 P9.8a 的結果，下列數字都是 P9.8a 建置的實測。

## 5. 結果

### 5.1 Camera Continuity：World 最後一幀 → Region 第一幀

在兩個 Canvas 都覆蓋的螢幕範圍內取 5×5 個點，每點取水面與高 2 單位兩層，比較同一地圖點的螢幕位置（px），以及每單位像素數的比例。

| 區域 | 桌機 P9.6 | 桌機 P9.8a | 手機 P9.6 | 手機 P9.8a |
|---|---|---|---|---|
| cs | 87 px、×1.019 | **0 px、×1.000** | 140 px、×1.146 | **0.1 px、×1.000** |
| ai | 154 px、×0.895 | **0 px、×1.000** | 141 px、×1.042 | **0.1 px、×1.000** |
| design | 747 px、×0.754 | **0 px、×1.000** | 272 px、×0.980 | **0.2 px、×1.000** |
| web | 600 px、×0.912 | **0 px、×1.000** | 181 px、×1.092 | **0.2 px、×1.000** |
| sys | 947 px、×0.671 | **0 px、×1.000** | 151 px、×1.056 | **0.1 px、×1.000** |

- E2E 在兩個 worker 平行執行時，cs、design、sys 各重複 6 次，桌機與手機共 36 次，全部通過。桌機 0 px，手機 0.10–0.25 px。
- **相機座標相同不代表畫面完全相同**，兩個 Canvas 的內容本來就不一樣（見截圖與第 8 節）：
  - World 的縮圖是較低細節，Region 是完整細節；
  - World 顯示區域名牌，Region 顯示島嶼名牌（手機為圖釘）與清單面板；
  - 手機的 Region Canvas 比 World Canvas 往下延伸約 80 px，切換時那一段是新出現的地圖。

  地圖本身（陸地、橋、道路、建築、樹）在截圖的 50% 疊合中沒有雙影。

### 5.2 首幀建築完整性與 Click → Region Ready

Region Ready 指「點擊到區域頁第一個與穩定後相同（draw calls 與三角形）的畫面」。下表是 5 次的中位數。

| | P9.6 | P9.8a |
|---|---|---|
| 桌機 cs | 1567 ms（第一幀 1282 ms 不完整） | **1301 ms（第一幀即完整）** |
| 桌機 sys | 1517 ms（第一幀 1234 ms 不完整） | **1249 ms（第一幀即完整）** |
| 手機 cs | 1584 ms（第一幀 1284 ms 不完整） | **1243 ms（第一幀即完整）** |
| 手機 sys | 1535 ms（第一幀 1252 ms 不完整） | **1270 ms（第一幀即完整）** |
| 第一幀完整的次數 | 0/20 | **20/20** |
| 飛行結束（點擊後） | 約 773–790 ms | 約 771–777 ms（換頁晚兩個 frame） |

各區域第一幀的 draw calls 與三角形數（桌機；穩定後兩版相同）：

| 區域 | P9.6 第一幀 | P9.8a 第一幀 = 穩定後 |
|---|---|---|
| cs | 28 次、38.1k | 31 次、73.2k |
| ai | 15 次、24.2k | 21 次、42.5k |
| design | 11 次、14.1k | 17 次、23.6k |
| web | 11 次、14.1k | 17 次、21.8k |
| sys | 14 次、21.8k | 20 次、36.7k |

### 5.3 GLB 請求

- 每次進入區域，GLB 只請求一次。五個區域目前都只用 `basics-island.v2.1.glb`，所以預載和區域頁讀的是同一份快取，沒有重複下載。
- 進入 CS、Back、再進入 AI，沒有任何 GLB 被下載兩次（E2E）。
- 世界頁的縮圖不載入 GLB。

### 5.4 JS Bundle（decoded / 傳輸後 gzip，KB；桌機，同一台機器的 `next start`）

| | `main`（P9.6） | P9.8a | 差異 |
|---|---|---|---|
| World 首頁載入時 | 570.7 / 180.9 | 570.8 / 181.0 | +0.1 / +0.1 |
| World 含 3D 場景 | 1811.2 / 539.6 | 1816.4 / 542.5 | +5.2 / +2.9 |
| 飛到 CS 時再載入的 JS | 112.2 / 38.2（5 個檔） | 119.8 / 41.8（6 個檔） | +7.6 / +3.6 |
| World → CS 合計 | 1923.4 / 577.8 | 1936.2 / 584.3 | **+12.8 / +6.5（+1.1%）** |
| 直接開 `/cs`（含 3D） | 1880.9 / 560.5 | 1882.5 / 561.9 | +1.6 / +1.4 |

- 初始 bundle 沒有增加。
- 試過兩個寫法都比較大，已改回：
  - World 改從 `hex-framing` 讀 `VIEW`：chunk 重新切分，World 少 72 KB、飛行多 112 KB，合計 +40 KB；
  - 把預載清單連同森林演算法放進 World：World 多 24 KB。

### 5.5 GPU 指標

- 穩定後的 draw calls 與三角形數，兩版完全相同（5.2）。
- 仍是雙 Canvas：每進一次區域頁就建立一個新的 WebGL context，與 P9.6 相同（P9.7 已量過；這不是 P9.8a 的範圍）。
- GPU 記憶體在 headless Chromium **無法量測**。預載的 GLB 解析後留在 drei 快取，與區域頁自己載入相同；同一頁面期間不會釋放，P9.6 的區域頁也是如此。

## 6. Before / After 截圖（`docs/planning/evidence/p9-8a/`）

| 檔案 | 內容 |
|---|---|
| `before-desktop-cs-switch.png`、`after-desktop-cs-switch.png` | 桌機：World 最後一幀、Region 第一幀、兩者 50% 疊合。P9.6 疊合出現雙影，P9.8a 是單一影像。 |
| `before-phone-cs-switch.png`、`after-phone-cs-switch.png` | 手機（390×664），同上。 |
| `before-desktop-cs-first-frame.png`、`after-desktop-cs-first-frame.png` | 桌機：Region 第一幀與穩定後。P9.6 第一幀是圓錐樹、沒有地標；P9.8a 第一幀等於穩定後。 |

拍攝方式：攔下區域頁的路由請求，讓 World 的最後一幀停在畫面上拍照，再放行，拍區域頁的第一幀。

## 7. 測試結果

| 檢查 | 結果 |
|---|---|
| TypeScript（strict） | 0 錯誤 |
| ESLint（`src`、`tests`、`e2e`） | 0 錯誤 |
| Vitest | 90 個檔案，1770 通過、288 跳過（私有題庫、Java、SQLite 等環境條件的測試） |
| Production build | 旗標開啟、關閉都成功 |
| E2E 旗標開啟（`p9-prototype`、`p9-continuity`、`islands`、`hex-camera`、`hex-scale`、`hex-environment`、`hex-world`、`island-interactions`） | 215 通過、31 跳過、0 失敗（P9.7 時是 2 個 home-map 前提失敗，已修正） |
| E2E 旗標關閉（加上 `curriculum`、`navigation`、`player`、`islands-acceptance`、`home-databases`） | 311 通過、109 跳過、0 失敗（P9.7 時跳過 85 個；多出的 24 個是只在旗標開啟時執行的新測試）；`/cs` 等 P9 路由為 404，home-map 測試在這裡執行並通過 |
| Leak scan | `36a8343..ddb078f` 與兩個 `.next` 皆乾淨 |

## 8. 限制與已知問題

- **單欄手機標題換行**：`regionStage` 以標題列 86 px 估計區域 Canvas 的位置。在 360–768 px 量過，只有 `sys` 在 360 px 寬時英文眉標換行（100 px），所以那一種情況飛行終點偏約 14 px（360×740 實測：sys 14.2 px，cs 0.2 px）。若要做到 0 px，需要讓區域頁標題列固定高度，這是區域頁 UI 變更，不在本階段。
- **取消飛行**：飛行接近終點時按 Escape 或拖曳，視角會跳回平移限制內；手機 CS 最多約 158 px，桌機只有幾 px。
- **桌機傳統捲軸**：版面寬度用 `clientWidth`，斷點用 `innerWidth`。有傳統捲軸（約 15 px）且捲軸只出現在其中一頁時，可能差幾 px。沒有量測（headless 沒有捲軸）。
- **真機**：沒有真機測試（這台機器沒有 Xcode 或 WebKit，也沒有連接裝置）。iOS Safari 的 `100svh` 與網址列收合，要在真機上確認手機的對齊。
- **換頁時間**：飛行結束到 Region 第一幀之間仍約 500 ms（換路由、建立第二個 WebGL context、編譯 shader）。這是雙 Canvas 本身的成本，屬於 P9.8c（Shared Canvas）的範圍。
- **P9.6 既有的手機版面問題（本階段未改）**：
  - 手機 World 首頁的「網頁與應用開發」標籤被左下角的縮放按鈕遮住，點不到；
  - 手機區域頁的頁首內容看起來超出 88 px（Logo 被切到）。

  都屬於另外的修正。

## 9. P9.8b 建議範圍（只規劃，未實作）

目標：把 Region 的 Canvas 與內容拆開，讓相機可以從外部接手，為 P9.8c 的 Shared Canvas 做準備。仍是雙 Canvas，不改路由。

1. **拆分 Region Canvas / Content**：`hex-world-scene.tsx` 拆成 Canvas 外殼（狀態、事件、`<Canvas>`）與 `HexWorldContent`（Canvas 內的一切）；外殼在 `onReady` 時重新渲染一次。P9.7 已驗證，這一步若沒做，會讓「清單 → 3D」後島嶼名牌消失（`hex-world` D.3-2、`hex-camera` D.3-5b）。
2. **Camera Handover**：`HexCamera` 加上 `from` 屬性，在 `useLayoutEffect` 中設定 camera-controls 的起始位置。必須在 camera-controls 第一次 update 之前，否則會有一幀錯位。沒有 `from` 時完全照舊。P9.8b 只建立介面與測試，不在雙 Canvas 間傳遞相機；實際接手留給 P9.8c。
3. **保留 Island Label**：名牌、圖釘、聚焦按鈕的數量與位置，在 3D、清單、3D 之間切換後不變。
4. **保留 List ↔ 3D 切換**：模式按鈕、側邊清單、手機面板、`?island=`、Back/Forward 都不變。
5. **完整 Hex Map 回歸**：
   - 旗標開啟與關閉都跑 `hex-world`、`hex-camera`、`hex-scale`、`hex-environment`、`islands`、`islands-acceptance`、`regional-world`（`LOGIC_ISLAND_REGIONAL_WORLD=1`）、`p9-prototype`、`p9-continuity`；
   - `/islands`、`/world/<region>`、P9 區域頁的截圖比對。

- **驗收**：
  - 所有 Hex Map E2E 不失敗、不降低斷言；
  - 沒有 `from` 的頁面相機行為與 P9.8a 逐幀相同；
  - P9.8a 的連續性測試仍通過；
  - Bundle 不增加超過 1%。
- **不在 P9.8b**：Shared Canvas、`(world)` route group、context-loss fallback（屬於 P9.8c），以及其他四個區域的共用 Canvas（屬於 P9.8d）。
