# P9.8b：Region Canvas / Content 拆分與 Camera Handover API

> 2026-11-20，分支 `p9/8b-region-content-refactor`（從 `main@91b869d`，即 P9.8a 合併後），worktree `../logic-island-p98b`。這是 P9.8c（Progressive Shared Canvas）的前置工程。
> - 不實作 Shared Canvas，不改路由與導航體驗，不把 World 的相機狀態傳進 Region。
> - 沒有修改 GLB、島嶼座標、地景模型、Exam Engine、題庫、Production 或旗標。
> - P9.7 原型（`p9/7-shared-canvas-proto`）只作參考，沒有合併或 cherry-pick。

## 1. 拆分前後的模組結構

拆分前，`hex-world-scene.tsx` 的 `HexWorldScene` 是一個元件，包含外層 `div`、`<Canvas>` 與 Canvas 內的一切。拆分後：

| 元件 | 負責 |
|---|---|
| `HexCanvasShell` | 地圖外層元素（游標、`isolation`、`data-camera`、`data-camera-handover`）；`<Canvas>`（orthographic、`frameloop="demand"`、DPR、陰影、WebGL 無法建立時的 fallback）；`CanvasLifecycle`（WebGL context 遺失、canvas 的 `aria-label` 與 `role`、相機起始方向） |
| `HexWorldContent` | 地形、海洋、森林、岩石、道路、廣場、`extras`（P9 地景與地標）、GLB 建築與佔位物、光線與環境（`HexEnvironment`）、島嶼標籤、互動目標、`HexCamera`（含 Camera Controls）、聚焦與 hover 狀態；`ContentReady` 回報就緒；`onPointerChange` 告訴外殼游標 |
| `HexWorldScene`（default export） | `HexCanvasShell` 加上 `HexWorldContent`，props 與拆分前相同；`HexWorldExplorer` 不需要改（只多傳一個選用的 `cameraHandover`） |
| `scene-html.tsx`（新） | `useOverlaysReady` 與 `SceneHtml`：Canvas 內 HTML overlay 的掛載時機（第 2 節） |

- 對外 API 不變：`HexSceneProps`（拆分前的 props 原樣抽成 interface）、`HexSceneOptions`、`HexWorldExplorer` 的 props 都不變，只多一個選用的 `cameraHandover`。
- `HexWorldContent` 只依賴「自己在某個 R3F Canvas 裡」，P9.8c 可以把它放進共用的 Canvas，不必複製整個渲染器。

## 2. Scene Ready 與島嶼標籤

### 根因（重現並確認）

只拆分、不做其他處理時，從清單切回 3D 後基礎程式島的名牌消失，桌機與手機各 2 個 E2E 失敗（`hex-world` D.3-2、`hex-camera` D.3-5b）。DOM 中三個 drei `Html` overlay 元素都在，其中一個沒有內容，5 秒後仍是空的。在開發模式下，React 回報 `Attempted to synchronously unmount a root while React was already rendering`，每個名牌一次。

原因在 drei `Html` 與 R3F 的時序：

1. `Html` 在自己的 React root 裡渲染 overlay，root 建立在 `events.connected`（若尚未連接，則是 canvas 的父元素）。
2. R3F 在 Canvas 第一批子元件掛載**之後**，才在 layout effect 裡連接事件；這發生在 React DOM 提交 Canvas 的過程中。
3. 因此第一輪掛載的 `Html` 先在 canvas 父元素建了 root。事件連接後 `target` 改變，它卸載舊 root，在事件元素上再建一個。
4. 卸載發生在 React DOM 仍在提交時，React 會延後執行。延後的卸載真正執行時，會清空新 root 剛畫好的同一個 overlay 元素，名牌就一直是空的，直到有東西讓它重新渲染。

拆分前，`HexWorldExplorer` 的 `setReady` 讓整個場景重新渲染，正好掩蓋了這個問題（程式註解寫著「沒有它第一個 drei Html 名牌是空的」）。P9.7 原型則用「外殼在 ready 時重新渲染」掩蓋。

### 機制（P9.8b）

- `SceneHtml`（取代場景裡的 drei `Html`：島嶼名牌、GLB 錨點、資訊泡泡）只在**事件連接之後**，由一個 passive effect 觸發掛載。這時已離開 React DOM 的提交，每個 overlay 只建立一個 root，而且直接建在最終位置；任何卸載都立即執行，不會被延後。
- `ContentReady`（`HexWorldContent` 內的小元件）在 overlay 可以掛載時回報 `onReady`。所以 ready 代表「地圖與名牌都已就位」，每個 Canvas 只發生一次，不會讓整個 content 重新渲染。
- 沒有固定延遲，也沒有反覆渲染：`connected` 對每個 Canvas 只會改變一次。
- 開發模式（StrictMode 會掛載兩次 effect）也正確：拆分版在 dev 原本仍會丟失名牌，改用 passive effect 後恢復，並且不再出現 React 的卸載警告。

### 回歸測試

- `hex-world.spec.ts`：在 `/islands/hex` 清單與 3D 來回切換三次，每次三座島的名牌都可見，而且沒有任何空白的 overlay（只用 polling，沒有固定等待）。
- `p9-prototype.spec.ts`：World → CS → Back → Forward 三次，每次 8 個 CS 名牌都可見且有內容；桌機與手機都測。
- 既有的 `hex-world` D.3-2 與 `hex-camera` D.3-5b 恢復通過。

## 3. Camera Handover API

```ts
// src/components/islands/hex-world/hex-camera.tsx
export interface CameraHandover {
  target: [number, number, number]; // 地圖場景座標（地圖中心為原點）
  zoom: number;                     // 正交相機 zoom（每單位像素數）
  azimuth: number;                  // camera-controls 角度，弧度：繞垂直軸，從 +z 起算
  polar: number;                    // 從正上方往下的角度
}
<HexCamera handover={pose} onHandover={() => …}/>               // 相機
<HexWorldScene cameraHandover={pose}/>                          // 場景，外殼標示 data-camera-handover="pending|applied"
<HexWorldExplorer cameraHandover={pose}/>                       // explorer 直接傳下去
```

- **套用時機**：掛載時套用一次，在 `useLayoutEffect` 裡呼叫 `setLookAt` 與 `zoomTo`（不做動畫），再 `update(0)`。這在第一個影格之前，也在第一次取景（passive effect）之前。camera-controls 每個影格都會把自己的狀態寫回相機，所以必須直接設定它的內部狀態，不能只改相機。
- **之後**：視為已初始化，所以第一次取景會從 handover 姿態移到區域的開場視角，就像聚焦一座新島嶼（緩動）；Reduced Motion 時直接到位。
- **只讀一次**：handover 與 callback 掛載時存進 ref，之後換值不會有任何作用，也不會和 React state 競態。
- **不變的部分**：縮放與平移的界限、島嶼聚焦、返回動畫、`onArrive`、Back/Forward 都與沒有 handover 時相同。
- **沒有 handover 時**：完全不執行，相機行為與 P9.8a 相同（第 6 節逐區比對）。
- **測試入口**：P9 區域頁接受審查用參數 `?handover=tx,ty,tz,zoom,azimuth,polar`（角度用度）。區域頁只存在於 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置。World 尚未把狀態傳進來，這是 P9.8c 的範圍。

### Handover 測試（`p9-continuity.spec.ts`）

相機姿態直接從影格讀取：在任何頁面腳本之前，記錄渲染器每個影格主畫面 pass（不含陰影 pass）上傳的 `projectionMatrix` 與 `viewMatrix`。這樣連 review hook 尚未載入的第一個影格也看得到。

- **沒有 handover**：第一個影格就是穩定後的開場視角，zoom 差小於 0.01%、角度差小於 0.001°，之後不再移動。
- **有 handover**：
  - 第一個影格就是 handover 姿態，或從它出發的第一個緩動步：往開場視角只走了 0.9–1.5%（上限 5%）；
  - handover 目標在畫面中心，誤差 0.0007（標準化座標）；
  - 之後有中間影格，最後停在區域頁原本的開場視角；
  - `data-camera-handover="applied"`。
- **Reduced Motion**：只有 handover 與開場視角兩種影格，中間沒有。
- **有 handover 時其他行為不變**：縮放界限相同，聚焦島嶼、科目面板與 Back 都正常。
- 三次重複，桌機與手機共 24 次，全部通過。

## 4. Phase E 的兩個發現與修正

### 4.1 靜態陰影圖多畫一次

- **現象**：從 World 飛到 CS 後，CS 的 Canvas 有 16 個 shader program，P9.8a 是 13 個。多出的 3 個是陰影 pass 的 depth program（instanced、instanced color、一般），各被連結了兩次。直接開 `/cs` 時兩版都是 17 個。
- **原因**：靜態陰影的 caster 檢查（`hex-environment.tsx` 的 `StaticShadows`）在 render 更新矩陣**之前**就讀 world matrix。剛掛載的 caster 第一幀被算在原點，下一幀算在實際位置，所以多畫一次陰影圖。
  - 以前 drei `Html` 掛載時會順便更新整個場景的矩陣，名牌與場景同時掛載，所以一直沒被發現；
  - P9.8b 的 overlay 晚一幀掛載，問題就出現了。
- **修正**：檢查前先 `scene.updateMatrixWorld()`。
  - Auto Orbit 每幀的 script 時間沒有可量測的差異：P9.8a 0.34–0.44 ms，修正後 0.345–0.348 ms；
  - 修正後飛行進入是 13 = 13，直接開是 17 = 17。
- **回歸測試**：新增 E2E，World 飛到 CS 後，區域 Canvas 的每個 shader program 只能連結一次。修正前是 3 個重複，修正後 0 個；桌機與手機都測。

### 4.2 既有測試的兩個前提問題

- **P9.6 的「拖曳取消飛行」**：在固定點 (300, 300) 按下，但名牌會隨飛行移動，有時剛好經過那個點，按到的是名牌，飛行沒有被取消。P9.8a 建置上也是 4 次失敗 1 次。改為在當下確實是地圖（canvas）的位置按下，斷言不變；修正後 8/8 通過。
- **`navigation.spec` 的「AI 群島入口」**：從舊首頁的「更多學習群島」開始。旗標開啟時 `/` 是 P9 World，所以在 P9.8a 建置上也會失敗（P9.8a 只跑了旗標關閉）。現在旗標開啟時改為檢查 P9 World 導覽的 AI 入口（連到 `/ai`），再到 `/regions/ai`，之後的斷言全部不變。

## 5. Commit

| 階段 | Commit |
|---|---|
| A：Canvas Shell / Scene Content 拆分，overlay 在事件連接後掛載 | `caed0e7` |
| B：名牌回歸測試；拖曳取消改為按在地圖上 | `893559b` |
| C：Camera Handover API 與測試 | `ba8ba56` |
| E：靜態陰影只畫一次；ready 不重繪整個 content；navigation 測試前提 | `c6810dc` |
| E：快速重複點擊的測試在頁面已換頁時不再等滿逾時 | `52ff648` |
| F：紀錄 | （本文件的 commit） |

## 6. 效能與視覺一致性（P9.8a 對 P9.8b）

**量測條件**：同一台 Mac，本機 production 建置（`next start`），headless Chromium（ANGLE Metal），桌機 1440×1000，手機為模擬的 iPhone 13（390×664）。兩個建置用同一組腳本、在同一時段量測；P9.8a 是 `main@91b869d` 的建置。**不是真機。**

| 項目 | P9.8a | P9.8b |
|---|---|---|
| World → Region 切換跳動（五個區域，桌機與手機，螢幕座標格點最大值） | ≤ 0.2 px、×1.000 | ≤ 0.2 px、×1.000 |
| Region 開場相機（直接開啟，五區 × 桌機與手機：zoom、方位、仰角、focal offset） | — | 10/10 完全相同 |
| 島嶼名牌位置（同上，每個名牌） | — | 位移 0 px |
| 首幀是否完整（第一幀的 draw calls 與三角形數等於穩定後） | 10/10 | 10/10 |
| Draw calls / 三角形（cs、ai、design、web、sys） | 31/73.2k、21/42.5k、17/23.6k、17/21.8k、20/36.7k | 相同 |
| 從 World 飛進 CS 時連結的 shader program | 13 | 13（修正前 16，見 4.1） |
| 直接開 `/cs` 時連結的 shader program | 17 | 17 |
| World 頁的 shader program（存活數；每次回到 World 新連結數） | 11；24 | 9；22（靜態陰影修正也作用在 World） |
| WebGL context（每次往返） | 2 個新的，同時只有 1 個在 DOM | 相同，沒有增加 |
| World ↔ CS 往返 10 次：CS 的 program、buffer、texture | 13、148、8，持平 | 13、148、8，持平 |
| 同上：GC 後 JS heap | 33.2 → 68.3 MB | 33.1 → 68.1 MB |
| JS：World 含 3D 場景（decoded / gzip） | 1816.5 / 542.5 KB | 1817.2 / 542.8 KB（+0.04%） |
| JS：飛到 CS 時再載入 | 119.8 / 41.8 KB | 120.6 / 42.0 KB |
| JS：直接開 `/cs` 含 3D | 1882.5 / 561.9 KB | 1884.1 / 562.4 KB（+0.08%） |
| JS：World 首頁載入時 | 570.8 / 181.0 KB | 570.8 / 181.0 KB |
| Click → 第一個完整的 Region 畫面（10 次中位數：桌機 cs、桌機 sys、手機 cs、手機 sys） | 1272、1253、1271、1253 ms | 1255、1268、1270、1269 ms |
| Auto Orbit 每幀 script 時間（兩輪） | 0.340、0.439 ms | 0.345、0.348 ms |

- **Click → 完整畫面**：在靜態陰影修正之前量測，修正只少了一次陰影 pass；兩組交錯各 10 次，兩個方向的差都在 ±17 ms 內，範圍重疊，屬於雜訊。最終建置量測時，另一個程序讓機器負載達 14–18，計時結果不可靠，所以最終建置只重測了與時間無關的項目（上表其餘各列）。
- **Heap 成長**：兩版每次往返都約增加 3.5 MB，是雙 Canvas 本身的行為（P9.7 已記錄），不是 P9.8b 引入的；P9.8c 的 Shared Canvas 驗收會量測。

## 7. 測試結果

| 檢查 | 結果 |
|---|---|
| TypeScript（strict） | 0 錯誤 |
| ESLint（`src`、`tests`、`e2e`） | 0 錯誤 |
| Vitest | 90 個檔案，1770 通過、288 跳過（私有題庫、Java、SQLite 等環境條件），0 失敗。另有一次在外部高負載下（執行 375 秒，平常約 165–196 秒）有 2 個失敗，沒有保留名稱，之後兩次重跑都是 0 失敗 |
| Production build | 旗標開啟、關閉，以及 `LOGIC_ISLAND_REGIONAL_WORLD=1`，三種都成功 |
| E2E 旗標開啟（`p9-prototype`、`p9-continuity`、`islands`、`hex-camera`、`hex-scale`、`hex-environment`、`hex-world`、`island-interactions`、`navigation`；桌機與手機） | 254 通過、33 跳過、3 失敗，三個都只在高負載下發生（第 7 節下方說明）；同一建置上 P9、hex-camera、hex-world 重跑 129 通過，只有 1 個高負載時序失敗，單獨重複都通過 |
| E2E 旗標關閉（再加上 `curriculum`、`player`、`islands-acceptance`、`home-databases`） | 313 通過、121 跳過、0 失敗；P9 路由為 404，課程頁、互動實驗島與首頁不受影響 |
| E2E Regional World（`regional-world`、`world-topology`、`island-interactions`；`/world/<region>` 用同一個 hex explorer） | 70 通過、22 跳過、0 失敗 |
| 名牌回歸（`hex-world` P9.8b、`p9-prototype` P9.8b、`hex-world` D.3-2、`hex-camera` D.3-5b） | 通過；只拆分、沒有 overlay 機制時，D.3-2 與 D.3-5b 會失敗 4 個 |
| Handover（`p9-continuity` P9.8b，含 Reduced Motion） | 三次重複共 24 次，全部通過 |
| P9.8a 連續性（五區 × 桌機與手機） | 通過 |
| Leak scan | `91b869d..52ff648` 與三個 `.next` 都乾淨 |

**高負載時的失敗分類**（全套旗標開啟執行時，load average 10–18，同時有其他 session 的程序在跑）：

| 失敗 | 根因 | 單獨重複 |
|---|---|---|
| `hex-camera` D.3-5b「自動旋轉與鏡頭飛行不互搶」 | 15 秒內的時序輪詢 | 3/3 通過 |
| `p9-continuity`「cs: 最後一幀與第一幀」 | 點擊後頁面在時限內沒有換頁（時序） | 3/3 通過 |
| `p9-continuity`「quick repeated clicks」 | **測試本身的問題**（P9.8a 時寫的）：額外的點擊在頁面已經換頁時，會等到整個測試逾時。已修正為每次點擊最多等 1 秒，斷言不變 | 修正後 8/8 |
| `p9-prototype` P9.6「switching quickly」（手機，第二次執行） | 時序 | 8/8 通過 |

### 與 main 的整合（PR #30、#31）

PR 建立後，main 合併了另一個 session 的課程第一批（#30，PL01–PL05，課程開放與 3D 地景分離）與第二批（#31，PL06–PL10）。雙方都改了 `e2e/p9-prototype.spec.ts`，文字上可以乾淨合併。我把 `origin/main` 合併進本分支（`5950c9d`，對方的內容全部保留），在合併後的程式碼上重跑：

| 檢查 | 結果 |
|---|---|
| TypeScript、ESLint | 0 錯誤 |
| Vitest | 91 個檔案，1954 通過、347 跳過、0 失敗（含課程批次的新測試） |
| Build | 旗標開啟、關閉、Regional World 都成功 |
| E2E 旗標關閉（同上 13 個 spec） | 313 通過、121 跳過、0 失敗 |
| E2E Regional World | 70 通過、22 跳過、0 失敗 |
| E2E 旗標開啟（同上 9 個 spec） | 第一次在 load average 25 時執行，26 個失敗，全是計時類測試（飛行中的影格數、緩動中間影格、每秒約 6° 的旋轉、飛行時間）。負載降到約 10 後，用 1 個 worker 重跑同一建置：**257 通過、33 跳過、0 失敗** |
| CI（合併後的 commit） | `gates` 通過、Vercel Preview 成功 |
| Leak scan | `91b869d..5950c9d` 與兩個 `.next` 都乾淨 |

## 8. 限制

- **真機**：沒有真機測試（這台機器沒有 Xcode 或 WebKit，也沒有連接裝置）。
- **名牌晚一個影格**：名牌比 3D 場景晚一個 React render 出現（passive effect 之後）。首幀的 WebGL 繪製不受影響（第 6 節）。
- **既有的 drei `Html` 特性**：其他使用 drei `Html` 的舊場景（`/islands` 舊版的 `island.tsx`、`glb-island-model.tsx`）仍是原本的掛載方式，它們不受拆分影響，本階段沒有改。
- **Handover 的限制**：handover 的 zoom 與 target 若超出地圖的縮放或平移界限，camera-controls 會依界限修正，界限本身不變。

## 9. P9.8c 最小實作計畫（只規劃，未實作）

### 範圍

1. **新旗標**：`LOGIC_ISLAND_P9_SHARED_CANVAS`，預設關閉；只在同時有 `LOGIC_ISLAND_P9_PROTOTYPE=1` 時生效；Vercel Production 一律關閉（與 P9 旗標同一套 `VERCEL_ENV` 防護）。
2. **共用 Canvas，只限 `/` 與 `/cs`**：
   - 一個 route group 的 layout（例如 `src/app/(p9-stage)/layout.tsx`）持有一個 `HexCanvasShell` 類型的外殼；
   - 依路徑在同一個 Canvas 裡放 World content 或 `HexWorldContent`（CS），同時間只掛載其中一個；
   - 其他四個區域維持各自的 `HexWorldScene`（P9.8b），不受影響。
3. **World content 拆分**：`p9-world-scene.tsx` 也要拆成外殼與 content（與 P9.8b 相同的切法），World 的標籤與導覽仍是 Canvas 外的 DOM。
4. **場景插槽**：`HexWorldExplorer` 需要一個「外部 Canvas」模式，把 `HexWorldContent` 交給 layout 的 Canvas 渲染（一個小型 context／store 插槽，不新增依賴），自己只保留清單、資訊面板與按鈕。這是最大的設計項目。
5. **相機雙向交接**：
   - World → CS：飛行終點（P9.8a 的開場視角）換算成 `CameraHandover`，用 CS 的 `scenePlacement` 反算，交給 CS content；因為終點本來就是開場視角，交接後不會再移動；
   - CS → World：由 CS 相機反算出 World 的視角（P9.7 已驗證），再飛回總覽。
6. **WebGL Context Loss Fallback**：
   - 共用 Canvas 的 `webglcontextlost` 讓 World 與 CS 都改為清單導航，沿用各頁的 `onUnavailable` 與 `SceneBoundary`；
   - 不嘗試自動恢復；
   - 驗收方式：用 `WEBGL_lose_context` 強制遺失。
7. **保留島嶼清單與資訊面板**：CS 頁的清單、科目面板、`?island=`、Back/Forward 都照舊。

### 驗收條件

- World ↔ CS 往返 10 次：
  - WebGL context 只建立 1 個；
  - 第 1 次之後 shader program 不再增加；
  - 存活的 buffer 與 texture 持平；
  - GC 後 JS heap 增幅小於 2 MB。
- 切換跳動 ≤ 1 px、縮放差小於 0.5%，雙向都要。
- 沒有建築 pop-in（第一幀 = 穩定後）。
- P9.8a、P9.8b 的連續性、名牌、handover 測試，以及 P9.6 的 Escape、拖曳、Reduced Motion、手機區域按鈕測試全部通過。
- context loss 後 1 秒內出現清單導航，沒有 console 錯誤。
- 旗標關閉時，P9.8b 的行為逐項不變；其他四個區域不受影響。
- Bundle 增幅小於 1%。
- 正式啟用前，至少一台 iPhone 與一台 Android 真機通過。

### 風險

| 風險 | 說明與對策 |
|---|---|
| Canvas 尺寸改變 | 手機上 World 與 CS 的 Canvas 位置和大小不同（P9.8a 已量到）。共用 Canvas 必須有固定的舞台，或在交接時一併處理 resize，否則會在交接幀跳動 |
| 陰影與環境 | 靜態陰影的 caster key 會隨 content 交換而改變（P9.8b 已修正矩陣時序），時段環境要在兩種 content 之間保持一致 |
| HTML overlay | content 交換時 `events.connected` 已經為真，`SceneHtml` 會在下一個 render 掛載，要確認不留下舊的 overlay |
| 路由 | layout 在子路由之間會保留，但 Back/Forward、捲動還原與焦點管理都要重新驗證 |
| 記憶體 | World 與 CS content 不能同時常駐；離開時要釋放 geometry 與 material |
| 範圍膨脹 | 只做 CS；其他區域、`/islands`、`/world` 一律不動 |
