# P9.8c：Progressive Shared Canvas（CS-only）

> 2026-11-20，分支 `p9/8c-shared-canvas-cs`（從 `main@3092455`，含 P9.8a #29、P9.8b #32、課程 #30/#31/#34），worktree `../logic-island-p98c`。
> - **整合（Release Readiness）**：已合併最新 `main@709c9fc`（課程 Batch 4 #37、Batch 5 #39、worktree 規範 #41）。合併 commit 為 `d541fbc`（`fd01b1d`）與 `a7403a4`（`709c9fc`），都沒有衝突。所有測試與量測都在整合後的程式碼上重做，見第 11 節。
> - 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 與新的 `LOGIC_ISLAND_P9_SHARED_CANVAS=1` 同時設定時生效。
> - 沒有修改 Vercel、Production、旗標設定、GLB、座標、Exam Engine 或題庫。
> - P9.7 原型只作參考，沒有合併或 cherry-pick。
> - **合併（2026-11-21）**：使用者批准以 Merge Commit 將程式碼合併至 `main`，但**不批准在 Production 啟用 Shared Canvas**。啟用前的檢查清單見 [P9_8C_RELEASE_GATE.md](P9_8C_RELEASE_GATE.md)。

## 1. 旗標（Phase A）

| `LOGIC_ISLAND_P9_PROTOTYPE` | `LOGIC_ISLAND_P9_SHARED_CANVAS` | 行為 |
|---|---|---|
| 未設定 | 任意 | 現有 Production（P9 路由 404）。Shared 旗標無法開啟 P9 |
| `1` | 未設定 | P9.8b（每頁各自一個 Canvas） |
| `1` | `1` | `/` 與 `/cs` 共用一個 Canvas；AI、Design、Web、SYS 維持 P9.8b |
| `1` | `1`，但 `VERCEL_ENV=production` | 兩者皆關閉 |

`p9SharedCanvasEnabled()` 在伺服器端、建置時讀取。單元測試涵蓋上表所有組合。

## 2. 架構與 Scene Lifecycle（Phase B）

```
app/layout.tsx（root layout，換頁時保留）
 └─ P9SharedStageSlot（client，next/dynamic ssr:false；只在兩個旗標都開啟時才渲染與下載）
     └─ P9SharedStage（shared-stage.tsx）
         ├─ container：一個 React 之外建立的 <div style="display:contents">，只建立一次
         │   └─ createPortal(<Canvas>…</Canvas>, container)
         │        ├─ Lifecycle：相機姿態讀取器、canvas 的 aria-label、webglcontextlost
         │        │   （Canvas 與 useThree 由第一個登記的 scene 透過 canvas-slot 提供，見下方「R3F 的來源」）
         │        ├─ StageSize：Canvas 尺寸立即跟隨 stage（R3F 自己量會晚一幀）
         │        └─ SlotContent：訂閱 canvas-slot，畫目前頁面登記的 scene（key = scene id）
         └─ layout effect：把 container 移到目前登記的 stage，作為它的第一個子元素

頁面（各自登記到 canvas-slot.ts）
 ├─ `/`：P9WorldScene（sharedCanvas）→ stage = 世界的 wrap（data-shared-stage="world"），content = 世界場景
 └─ `/cs`：HexWorldExplorer → HexWorldScene → SharedHexScene → stage = 地圖的 canvasWrap（data-shared-stage="hex-map"），
          content = HexWorldContent（P9.8b）
```

- **為什麼 Canvas 不會被重建**：Canvas 透過 portal 渲染進一個 React 從不建立、也從不移除的 container。換頁時 host 只是把 container 搬到新頁面的 stage。所以 Canvas 元素、WebGL context、renderer 與 camera 都保留；頁面的標籤與按鈕仍疊在 Canvas 上方，和自己擁有 Canvas 時相同。
- **換頁的一步**：
  1. 舊頁面的 cleanup 呼叫 `release`，host 在這時讀出相機姿態（換算成世界座標）。
  2. 新頁面在同一次 commit 的 layout effect 中呼叫 `register`。
  3. Canvas 內的 `SlotContent` 以 `useSyncExternalStore` 訂閱，所以內容交換是 Canvas root 的同步更新，在瀏覽器繪製之前就提交。
  4. container 的位置與 Canvas 尺寸在同一個 layout effect 中更新；新場景要求的影格在同一個繪製前的 rAF 畫出。
- **離開 `/` 與 `/cs`**：例如前往 `/curriculum` 或 `/ai`，host 不再渲染 Canvas，Canvas 被釋放；AI 等其他區域建立自己的 Canvas（P9.8b）。
- **CS 的島嶼清單**：P9 區域頁的「清單」只是開關側邊清單，地圖仍在同一個 Canvas。
- **R3F 的來源**（整合階段 `dd74271`）：host 不自己 import `@react-three/fiber`，而是使用 scene 登記時附上的 `Canvas` 與 `useThree`（`SlotEntry.fiber`）。原因是 Turbopack 會把 R3F 的入口模組（約 14 KB）再複製一份到 host 的 lazy chunk，而 scene 的 chunk 已經有它。slot 會保留第一次拿到的 R3F，所以 slot 暫時沒有登記（例如 CS 切到清單）時，Canvas 也不會卸載。Canvas 改為在第一個 scene 登記時才建立。
- **沿用 P9.8b**：`HexWorldContent`、`SceneHtml`（事件連接後才掛載 overlay）、`ContentReady`、`CameraHandover`。沒有第二套 CS renderer。
- **其他調整**：
  - `hex-perf-probe` 的 review hook 改為隨地圖卸載而移除；在共用 Canvas 上，舊 hook 會殘留到下一個場景。
  - CS 頁在使用者要回世界時（指向或聚焦回世界的連結、按 Escape）才預先載入世界場景的程式（共用 `world-scene-loader.ts` 的 `loadWorldScene`，不重複下載；它獨立成一個模組，避免把區域資料帶進 `/` 的 entry，見 6.3），所以直接開啟 `/cs` 後由頁面回到世界時，Canvas 不會有一段沒有內容可畫；瀏覽器 Back 例外，見第 10 節限制。

## 3. 雙向 Camera Handover（Phase C）

- **姿態定義**：`StagePose` 是世界座標中的姿態：畫面中心視線上的一點、每世界單位的像素數、相機的 forward/right/up，以及 Canvas 當時在螢幕上的位置。各場景用 `SceneFrame`（`common = offset + scale · scene`）說明自己的座標；CS 的 frame 來自世界總覽的 `scenePlacement`（`world-placements.ts` 的 `regionFrame`）。
- **World → CS**：P9.8a 的飛行終點本來就是 CS 的開場視角。CS 掛載時把 World 留下的姿態轉成 `CameraHandover`（`handoverFor`），在第一個影格前套用（P9.8b API），之後取景時沒有移動。
- **CS → World（Back、「世界總覽」、Esc）**：World 掛載時，用 `worldViewFromPose` 算出能畫出 CS 最後一幀的世界視角，作為第一個視角，再用 700 ms 飛回整個世界的靜止視角（與 P9.5 起 Back 的結果一致）。Reduced Motion 時直接回到靜止視角。CS 相機若被轉過方向，世界無法表示，同樣直接回到靜止視角。
- **手機**：手機上兩頁的 Canvas 位置不同（CS 低 86 px），換算時取「新 Canvas 中心那個螢幕點」所看到的點，所以每個點都留在同一個螢幕像素。
- **其他控制**：飛回途中的滾輪、拖曳、雙指會停在當下，Escape 取消照舊；快速重複點擊由 P9.5 的飛行狀態擋下。

**量測條件**（第 3、4、6 節共用）：本機 production 建置（`next start`），macOS headless Chromium（ANGLE Metal）；桌機 1440×1000，手機為模擬的 iPhone 13（390×664）與 360×740。比較的基準是同一份 P9.8c 原始碼關閉 Shared Canvas 的建置（等於 P9.8b 的行為），同一台機器、同一組腳本，交錯量測。**不是真機。**

| 方向 | 桌機 | 手機 390 | 手機 360 |
|---|---|---|---|
| World → CS（World 最後一幀對 CS 第一幀） | 0 px、×1.000 | 0.1 px、×1.000 | 0.21 px、×1.000 |
| CS → World（Back；CS 最後一幀對 World 第一幀） | 0 px、×1.000 | 0 px、×1.000 | 0 px、×1.000 |
| CS 第一幀的相機矩陣與穩定後相比 | 完全相同（差 0） | 完全相同 | 完全相同 |
| Back 之後 | 飛回整個世界，最後停在靜止視角（1.000, 0, 0） | 同左 | 同左 |

- 量測方法：在兩個畫面都覆蓋的螢幕範圍取 5×5 個點，每點取水面與高 2 單位兩層，比較同一個地圖點的螢幕位置。CS 第一幀用渲染器實際上傳的 projection 與 view matrix 判斷。
- 每種條件量兩次，結果相同；E2E `p9-shared-canvas` 以 ≤ 1 px、縮放差小於 0.5% 驗收。
- P9.8a 已知的 SYS 在 360 px 標題換行問題，不屬於 CS-only 的範圍，沒有處理。

## 4. Scene Switching（Phase D）

| 情境 | 結果（桌機與手機） |
|---|---|
| World → CS → Back → Forward | 同一個 canvas 元素、同一個 WebGL context（整個過程只建立 1 個）；8 個名牌都完整，沒有重複的 Html root；Back 之後 Canvas 內沒有殘留 CS 的 overlay |
| CS 側邊清單關閉再打開 | 同一個 Canvas；8 個名牌都完整 |
| 快速連續 Back/Forward 3 次 | 1 個 Canvas、1 個 context、8 個名牌都完整 |
| 直接開 `/cs` 再回世界（連結） | 同一個 Canvas 繼續使用 |
| World → AI（其他區域） | Shared Canvas 釋放，AI 建立自己的 Canvas（context 共 2 個），不會殘留共用的 container |
| 建築 pop-in | 第一幀就完整：31 次 draw call、73.2k 三角形，與穩定後相同，10/10 |
| Shadow shader 重複編譯 | 同一次進入 CS 時，每個 program 只連結一次（P9.8b 的 E2E 照樣通過） |
| 事件與互動目標 | 拖曳、滾輪、雙指、名牌點擊、Escape 取消、手機區域按鈕：P9.4–P9.6 的 E2E 在 Shared 模式下全部通過 |

## 5. WebGL Context Loss Fallback（Phase E）

- **偵測**：Canvas 的 `webglcontextlost`（`preventDefault`，保留可恢復性），以及 Canvas 無法建立（error boundary）。
- **不凍結畫面**：Canvas 立即卸載，不留下停住的畫面；slot 標記為 lost。
- **替代導航**：
  - 世界：舞台換成提示（`role="status"`），下方「世界導覽」的各群島連結可用鍵盤操作；
  - CS：explorer 切換到島嶼清單，並提示「3D 地圖已停止（WebGL 失效），島嶼清單與課程連結仍可使用」；
  - 在 CS 失去 context 後回到世界，世界直接顯示導覽，不會出現空白舞台。
- **進入已發布課程（鍵盤）**：島嶼清單 → 「不需 3D 程式與資訊群島清單總覽」→ 各島「前往課綱」→ 課程。清單本身不列出課程，這是 region explorer 在 P9.8b 就有的行為（已在 P9.8b 建置上確認），本階段不改。
- **重建**：不會自動重建，`webglcontextrestored` 也不會觸發重建，所以不會有循環。只有使用者按下「重新載入 3D 地圖」時，才建立新的 Canvas 與新的 context。
- **焦點**（整合階段 `1af8c7c`）：焦點在地圖內（名牌或島嶼按鈕）時失去 context，原本焦點會掉到 `body`。現在焦點會移到取代地圖的提示（`role="status"`、`tabIndex=-1`），下一個 Tab 是「重新載入 3D 地圖」。焦點在其他地方時不移動；頁面開啟時 Canvas 已經失效（例如從 CS 返回世界）也不移動焦點。
- **ARIA**：兩個提示都是 `role="status"`（polite）。提示與文字同時插入，螢幕閱讀器不保證朗讀；焦點移到提示時會讀出它的內容。CS 在失效時會同時出現兩個 status（本提示，以及 explorer 原有的「已切換至清單導航」），內容相近，屬於重複但不衝突。
- **E2E**：用 `WEBGL_lose_context` 模擬，驗證上述每一項，包含鍵盤操作、焦點與實際換頁。

## 6. 往返資源與 Bundle（Phase F；整合後重新量測）

量測環境：整合後的程式碼（`main@fd01b1d`／`709c9fc` 之上；P9 程式碼在兩次合併之間沒有變化；30 次往返先在 `1af8c7c` 量兩次桌機與一次手機，最終程式碼 `754221e` 再量一次桌機，數字相同到 0.1 MB），同一台 Mac、headless Chromium（`--use-angle=metal`），load average 約 1–7，沒有其他建置或 E2E 同時執行。比較對象是**同一份程式碼**只關閉 Shared 旗標的建置（即 P9.8b 行為）。World → CS（飛行）→ World（瀏覽器 Back）為一次往返。

### 6.1 WebGL 資源（30 次往返；桌機兩次獨立量測、手機一次，三次結果一致）

| 項目 | Shared 關閉（P9.8b 行為） | Shared 開啟 |
|---|---|---|
| WebGL context 建立數（30 次往返） | 61（每次往返 2 個） | **1** |
| 同時存活的 context／DOM 中的 canvas | 1／1 | 1／1 |
| 存活的 shader program | CS 13、World 9，不變 | CS 15–16、World 14–15，第 2 次起在此範圍，不增加 |
| 每次往返新連結的 program | 22（每次） | 11（第 1 次 12） |
| 存活的 buffer | CS 148、World 258，不變 | CS 148、World 307，不變 |
| 存活的 texture | CS 8、World 13，不變 | CS 8、World 13，不變 |
| 頁面錯誤 | 0 | 0 |

- **World 多 49 個 buffer**：CS 的 GLB 留在 drei 快取，在共用 context 中仍保有它的 buffer，下次進 CS 不必重建。數量固定，不累積。
- **program 的連結**：three 會釋放沒在使用的 program，所以每次往返仍會重新連結 11 個（P9.8b 行為是 22 個）。存活數不增加。
- **GPU 記憶體**：headless Chromium 無法量測，**未量測**。

### 6.2 GC 後 JS heap（每次往返後在 World 強制 GC 三次再讀取）

| 區間 | Shared 關閉 | Shared 開啟（桌機） | Shared 開啟（手機） |
|---|---|---|---|
| 進入成本：開始 → 第 1 次往返後 | +5.7 MB（33.1 → 38.8） | +11.4 MB（33.2 → 44.6） | +11.2 MB |
| **第 1 → 10 次**（原始標準：< 2 MB） | +7.2 MB，**未通過** | +2.8 MB，**未通過** | +2.9 MB，**未通過** |
| 第 5 → 20 次 | +8.2 MB（每次 +0.55 MB） | **+0.9 MB**（每次 +0.058 MB） | +1.0 MB（每次 +0.059 MB） |
| 第 10 → 30 次 | +9.9 MB（每次 +0.49 MB） | **+0.5 MB**（每次 +0.027 MB） | +0.5 MB（每次 +0.027 MB） |
| 第 30 → 60 次（只量 Shared 開啟） | — | +0.74 MB（每次 +0.027 MB） | — |
| 第 30 次往返後的 heap | 55.9 MB | 47.9 MB | 47.6 MB |

（每次 = 該區間的最小平方斜率。）

- **Cold／Warm-up**：
  - Shared 開啟的進入成本比較高（+11.4 MB 對 +5.7 MB），因為世界與 CS 的場景資料都留在同一個 context 的快取中。
  - 原始標準「第 1–10 次 < 2 MB」**兩種模式都沒有通過**（Shared 開啟 +2.8 MB）。
- **Steady State**：
  - Shared 關閉每次往返約 +0.5 MB，30 次內沒有趨緩，在第 12 次左右超過 Shared 開啟。
  - Shared 開啟在暖機後降到每次約 +0.027 MB（約 25 KB）。60 次往返內沒有降到 0，但每次的增量很小而且穩定。
- **增量的來源**：比較第 10 次與第 30 次往返後的 heap snapshot，增加的物件群組共 +645 KB（每次約 32 KB），與上面的斜率一致。
  - 約 450 KB 是 V8 的編譯程式碼（`InstructionStream`、`TrustedByteArray`、`Code` 等，JIT 持續最佳化）；
  - 約 150 KB 是 Chromium 的 Performance Timeline 項目（`LayoutShift` 與它的 `DOMRectReadOnly`、LoAF、EventTiming、soft navigation），由瀏覽器保留；`LayoutShift` 已達 150 個，看起來是瀏覽器的 buffer 上限；
  - 應用程式本身的物件約 8 KB（一般 `Object` +202、一個壓縮後名為 `tj` 的類別 +120）。

  沒有看到 three 物件、React fiber、DOM 節點或 WebGL 資源的累積。
- **結論**：暖機後 Shared 開啟沒有應用程式層級的持續累積。但 heap 讀數仍以每次約 25 KB 緩慢增加（引擎與瀏覽器的部分），所以不宣稱「完全平坦」。這是在**桌機 Chromium** 上的結果；Safari 的 JIT 與 Performance Timeline 不同，需要實機觀察。

### 6.3 JS Bundle（decoded／gzip，KB；`next start` 的 gzip 傳輸量；`754221e` 與 `a7403a4` 量到的數字相同）

**A. Shared 開啟 vs 關閉（同一份程式碼；Shared Canvas 本身的成本）**

| | Shared 關閉 | Shared 開啟 | 差異 |
|---|---|---|---|
| World 首頁載入時（Initial Load） | 572.3 / 181.4 | 572.3 / 181.4 | **0** |
| World 含 3D 場景 | 1823.8 / 545.4 | 1827.1 / 547.2 | +3.3 / +1.8（**+0.18% / +0.33%**） |
| 飛到 CS 時再載入 | 122.0 / 42.4 | 122.0 / 42.4 | 0 |
| World → CS 合計 | 1945.8 / 587.8 | 1949.1 / 589.6 | +3.3 / +1.8（**+0.17% / +0.31%**） |
| 直接開 `/cs` 載入時 | 602.0 / 192.0 | 602.0 / 192.0 | 0 |
| 直接開 `/cs` 含 3D | 1890.0 / 564.7 | 1893.3 / 566.6 | +3.3 / +1.9（**+0.17% / +0.34%**） |

**B. 對 `main`（P9.8b，P9 開啟；`fd01b1d` 與 `709c9fc` 相同）**

| | `main`（P9.8b） | P9.8c Shared 開啟 | 差異 |
|---|---|---|---|
| World 首頁載入時 | 570.8 / 181.0 | 572.3 / 181.4 | +1.5 / +0.4（+0.26% / +0.22%） |
| World 含 3D 場景 | 1817.2 / 542.8 | 1827.1 / 547.2 | +9.9 / +4.4（**+0.54% / +0.81%**） |
| World → CS 合計 | 1937.8 / 584.8 | 1949.1 / 589.6 | +11.3 / +4.8（**+0.58% / +0.82%**） |
| 直接開 `/cs` 載入時 | 595.8 / 190.3 | 602.0 / 192.0 | +6.2 / +1.7（**+1.04%** / +0.89%） |
| 直接開 `/cs` 含 3D | 1884.1 / 562.4 | 1893.3 / 566.6 | +9.2 / +4.2（**+0.49% / +0.75%**） |

**C. P9 關閉的正式頁面（Production 組合），對 `main`（`fd01b1d` 與 `709c9fc` 相同）**

| 頁面 | `main` | P9.8c | 差異 |
|---|---|---|---|
| `/` | 1787.5 / 525.2 | 1787.3 / 525.6 | −0.2（−0.01%） |
| `/islands` | 1984.9 / 591.1 | 1978.4 / 589.0 | −6.5（−0.33%） |
| `/curriculum`、`/regions/cs`、課程頁 | 696.9 / 226.2 | 693.9 / 225.1 | −3.0（−0.43%） |
| `/learn` | 912.8 / 299.5 | 909.8 / 298.5 | −3.0（−0.33%） |

（各頁的量測包含 Next 對 header 連結的預取，例如 `/` 路由的 chunk。）

- **Shared Canvas 增加的 chunk**：只有 host 自己的 lazy chunk（3,359 bytes，gzip 約 1.6 KB），只在兩個旗標都開啟時下載。World 頁的 chunk 清單只差這一個。
- **對 P9.8b 的其他增加**（A 表以外，Shared 開關都有）：CS 頁需要 `regionFrame`（世界配置與 overview 幾何，約 4 KB）、`canvasSlot` 與 stage-pose（約 0.7 KB）、loader 與 host slot（約 0.7 KB）。這是 handover 必要的程式，不是重複。只有「直接開 `/cs` 載入時」超過 1%（+1.04%，P9 開啟才有）。要再縮小，必須把 `regionFrame` 改成非同步取得，等於重構 frame 傳到 scene 的方式，依指示**不做，記錄**。
- **整合階段的兩個修正**：
  - `dd74271`：原本 host chunk 是 17.1 KB，其中 13.8 KB 是 R3F 入口模組的第二份複本（Turbopack 把同一個模組放進 7 個 chunk）。改由 scene 透過 canvas-slot 提供 `Canvas` 與 `useThree` 後，host chunk 降到 3.3 KB；A 表的差異從 +0.93%／+1.3% 降到 +0.18%／+0.33%。
  - `754221e`：**更正先前的紀錄**。先前記錄「P9 關閉的正式頁面 −0.1% 到 −0.5%」是錯的，或是在 Phase F（`ff29ea4`）之前量的。`ff29ea4` 讓 `P9World` 從 `p9-scene-loaders.ts` 取得 `loadWorldScene`，而這個模組會 import 各區域的模型清單與資料。`P9World` 即使在 P9 關閉時也在 `/` 路由的 entry 中，所以每個正式頁面（透過預取）多了約 20 KB（+0.8% 到 +3.0%）。把 `loadWorldScene` 移到只含它的 `world-scene-loader.ts` 後，回到 C 表的 0 到 −0.43%。整合時用 `8788b36` 對 `main@3092455` 重建確認了這個問題，`d541fbc`、`dd74271` 也有同樣的增加。
- 先前已修掉兩處多出的下載：CS 頁預載世界場景時用了另一個 import 來源（+75 KB 重複）；host 引入環境模組。

### 6.4 換頁時間與第一幀（10 次往返，最終程式碼）

| | Shared 關閉 | Shared 開啟 |
|---|---|---|
| Click → 第一個完整 CS 畫面（中位數，桌機／手機） | 938／914 ms | **838／810 ms** |
| Click → Scene Ready（8 個名牌都有內容） | 957／934 ms | **856／830 ms** |
| 第一幀完整（無 pop-in） | 10/10 | 10/10 |

## 7. 測試結果（Phase G；最終程式碼 `a7403a4`，含 `main@709c9fc`）

load average 約 2–7，沒有其他大型建置或 E2E 同時執行；E2E 以 1 個 worker 執行。

| 檢查 | 結果 |
|---|---|
| TypeScript（strict） | 0 錯誤 |
| ESLint（全專案） | 0 錯誤 |
| Vitest（含 Java：以 IntelliJ 內附 JDK 執行） | 91 個檔案，**2529 通過、9 跳過、0 失敗**（`754221e` 為 2509，差異是 Batch 5 的測試） |
| Production build | P9 ON / Shared ON、P9 ON / Shared OFF、P9 OFF、Regional World 四種都成功 |
| E2E，**P9 ON / Shared ON** | **275 通過、33 跳過、0 失敗** |
| E2E，**P9 ON / Shared OFF**（P9.8b 行為） | **257 通過、51 跳過、0 失敗** |
| E2E，**P9 OFF**（Production 組合；另加 `curriculum`、`player`、`islands-acceptance`、`home-databases`） | **315 通過、139 跳過、0 失敗**；P9 路由 404（`754221e` 為 313，差異是 Batch 5 的課程 E2E） |
| E2E，**Regional World**（`regional-world`、`world-topology`、`island-interactions`） | **70 通過、22 跳過、0 失敗**（第一次因 port 3147 被占用沒有執行，換 port 後重跑） |
| 其中 Hex Map（`hex-world` 22、`hex-camera` 28、`hex-scale` 30、`hex-environment` 21，P9 三種模式都有） | 全部通過 |
| 其中 Navigation（`navigation` 28，P9 三種模式都有） | 全部通過 |
| 已發布課程 | 100 堂（`main@709c9fc`，含 Batch 4 的 PL16–PL19 與 Batch 5 的 PL20），課程 E2E 89 個通過 |
| `IslandConfig.mapState` 與課程狀態 | 未修改：本 PR 沒有碰課程資料、world registry 或 `mapState`；合併 `main` 時這些檔案直接取自 `main`（無衝突） |
| Leak scan | 見 PR（commit 範圍與各 `.next`） |

E2E 清單在各模式相同：`p9-prototype`、`p9-continuity`、`p9-shared-canvas`、`hex-world`、`hex-camera`、`hex-scale`、`hex-environment`、`islands`、`island-interactions`、`navigation`；桌機與手機。Shared ON 比上次多 2 個：新的焦點測試（桌機、手機）。跳過的測試都是旗標或環境條件（例如只在 Shared 開啟時執行的 `p9-shared-canvas`），沒有刪除或放寬任何測試。

**過程中的失敗與分類**：
- **整合階段**：沒有測試失敗。有兩次是測試環境問題：自己留下的舊 server 仍在服務已重建的 `.next`，以及 port 3147 被占用；換 port、重啟 server 後重跑。
- **先前（P9.8c 實作時）**：
  - 外部高負載（load 13–38）時曾有 4–26 個計時類失敗，負載降低後全部通過；
  - 本 PR 自己的問題已修正：手勢處理每次 render 重設、CS 預載世界場景時重複下載。
- **既有 E2E 在 Shared 模式下的前提**：
  - P9.8a 的「Region 第一幀」測試也接受「場景接手共用 Canvas」；
  - Back 維持 P9.5 起「回到整個世界的靜止視角」。

## 8. Before / After 截圖

`docs/planning/evidence/p9-8c/`：

| 檔案 | 內容 |
|---|---|
| `before-desktop-cs-to-world.png`、`before-phone-cs-to-world.png` | Shared 關閉（P9.8b）：CS → Back → World。World 第一個可截圖的畫面是空的海面（新的 Canvas 還在建立），之後才出現總覽 |
| `after-desktop-cs-to-world.png`、`after-phone-cs-to-world.png` | Shared 開啟：World 第一個畫面就是 CS 的地圖、在同一個位置，隨後飛回總覽 |
| `after-desktop-context-lost.png`、`after-phone-context-lost.png` | CS 的 WebGL 失效後：島嶼清單與「重新載入 3D 地圖」；回到世界：導覽與重新載入按鈕 |

## 9. 實機驗證

**Pending（未驗證）。** 啟用前的 Release Gate 見 [P9_8C_RELEASE_GATE.md](P9_8C_RELEASE_GATE.md)。可由人工執行的清單見 [P9_8C_DEVICE_CHECKLIST.md](P9_8C_DEVICE_CHECKLIST.md)：World → CS → World、觸控拖曳與縮放、Back／Forward、3D ↔ 清單、背景切換後恢復、長時間使用、畫面凍結與備援導航。

這台 Mac 沒有 Xcode、Playwright WebKit，也沒有連接 iPhone 或 Android 裝置。本文件所有手機數據都是 headless Chromium 的手機模擬（iPhone 13 尺寸、觸控模擬），不能代替實機。

## 10. 建議

**Conditional Go**：
- **可以合併的理由**：旗標預設關閉。P9 關閉（Production 組合）的頁面對 `main` 沒有增加，Shared 關閉的行為與 P9.8b 相同。
- **使用 Shared 旗標之前的條件**：在任何部署（Preview 審查以外）使用 Shared 旗標之前，必須先滿足以下條件。

1. **真機**：至少一台 iPhone（Safari）與一台 Android（Chrome），完成實機清單，特別是：
   - 手機上 Canvas 換位置時的連續性；
   - 切到背景後恢復；
   - 真實的 context loss；
   - Safari 的長時間記憶體。
2. **Heap 驗收的判定**（6.2 節）：
   - **原始標準「第 1–10 次 < 2 MB」沒有通過**（+2.8 MB）；
   - Steady state 在桌機 Chromium 沒有應用程式層級的累積：第 10–30 次每次 +0.027 MB，來源是 V8 編譯碼與瀏覽器 Performance Timeline。

   請決定是否以 steady state 作為驗收。
3. **Bundle**（6.3 節）：
   - Shared Canvas 本身 +0.17–0.18%（gzip +0.31–0.34%）；
   - 對 P9.8b 是 +0.49–0.58%（gzip +0.75–0.82%）；
   - 只有「直接開 `/cs` 載入時」decoded +1.04%（`regionFrame` 等 handover 必要程式，只在 P9 開啟時）。

   請確認是否接受。
4. **合併**：使用者於 2026-11-21 批准合併程式碼（旗標維持關閉）；啟用前的項目見 [P9_8C_RELEASE_GATE.md](P9_8C_RELEASE_GATE.md)。

**限制與已知問題**：
- **fallback 清單不列課程**：CS 的 fallback 島嶼清單本身不列出課程，要經過「不需 3D 清單總覽」→「前往課綱」才能進入課程（三步，都可用鍵盤）。這是 region explorer 在 P9.8b 就有的行為。
- **CS 失效時兩個 status**：本提示與 explorer 原有的「已切換至清單導航」同時出現，內容相近。
- **世界 fallback 的空白區域**：提示下方仍有一塊空白的舞台背景；導覽在下方，可以正常使用。
- **直接開啟 `/cs` 後按瀏覽器 Back**：如果之前沒有指向或聚焦世界連結，世界場景的程式要在那時才載入，會出現短暫的載入狀態（與 P9.8b 相同）。
- **Program 重新連結**：每次往返仍會重新連結 11 個 program。存活數穩定。
- **進入成本**：Shared 開啟時第一次往返後的 heap 比 Shared 關閉多約 5.7 MB（兩個場景的資料都留在快取）。約第 13 次往返後，Shared 關閉反而比較多。
- **其他區域**：其他四個區域與 `/islands`、`/world` 不使用 Shared Canvas。下一步（P9.8d）是依序把其他區域納入同一個機制；本 PR 不開始。

## 11. 最新 main 整合與 Release Readiness（2026-11-20）

| 項目 | 內容 |
|---|---|
| 整合基準 | `main@709c9fc`：課程 Batch 4 #37、Batch 5 #39（在整合期間合併）、worktree 規範 #41 |
| 合併 | `d541fbc`（`fd01b1d`）、`a7403a4`（`709c9fc`）；都沒有衝突，P9.8c 與課程批次、文件沒有共同修改的檔案 |
| 整合後的 commit | `dd74271`：host 不再帶第二份 R3F 入口模組（−13.8 KB）<br>`1af8c7c`：context loss 時焦點移到提示，E2E 涵蓋<br>`754221e`：世界場景 loader 獨立成模組，修正 P9 關閉時正式頁面多 20 KB 的問題 |
| 重新驗證 | 四種旗標模式的建置與 E2E、Vitest、TypeScript、ESLint：在 `754221e`（`fd01b1d` 為基準）與 `a7403a4`（`709c9fc` 為基準）各執行一次，0 失敗（第 7 節） |
| 資源 | 30 次往返（另加 60 次）重新量測（6.1、6.2 節） |
| Bundle | 三種比較（6.3 節） |
| Context loss 驗收 | 無凍結畫面；世界導覽可用；CS 島嶼清單可用；鍵盤可進入已發布課程；重新載入按鈕有效；不會自動重建；失效後 Back 回到世界與再回到 CS 都不留下失效的 Canvas（Forward 的往返另由一般的快速 Back／Forward 測試涵蓋）；其他四個區域不受影響（E2E）。焦點管理已修正；`role="status"`；Reduced Motion（E2E 預設 reduce）；觸控與 360／390 px 版面只在模擬中驗證 |
| 實機 | Pending，見第 9 節與實機清單 |
