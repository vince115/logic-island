# P9.8c：Progressive Shared Canvas（CS-only）

> 2026-11-20，分支 `p9/8c-shared-canvas-cs`（從 `main@3092455`，含 P9.8a #29、P9.8b #32、課程 #30/#31/#34），worktree `../logic-island-p98c`。
> - 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 與新的 `LOGIC_ISLAND_P9_SHARED_CANVAS=1` 同時設定時生效。
> - 沒有修改 Vercel、Production、旗標設定、GLB、座標、Exam Engine 或題庫。
> - P9.7 原型只作參考，沒有合併或 cherry-pick。
> - **本 PR 不合併**：Shared Canvas 改變了 WebGL 的生命週期，而且尚未完成真機驗證。

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
- **沿用 P9.8b**：`HexWorldContent`、`SceneHtml`（事件連接後才掛載 overlay）、`ContentReady`、`CameraHandover`。沒有第二套 CS renderer。
- **其他調整**：
  - `hex-perf-probe` 的 review hook 改為隨地圖卸載而移除；在共用 Canvas 上，舊 hook 會殘留到下一個場景。
  - CS 頁會預先載入世界場景的程式，所以直接開啟 `/cs` 後回到世界時，Canvas 不會有一段沒有內容可畫。

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
- **E2E**：用 `WEBGL_lose_context` 模擬，驗證上述每一項，包含鍵盤操作與實際換頁。

## 6. 10 次往返資源（Phase F）

10 次 World → CS（飛行）→ World（Back）往返；P9.8b 模式是同一份程式碼關閉 Shared Canvas 的建置。

| 項目 | P9.8b 模式（桌機） | P9.8c Shared（桌機） | P9.8c Shared（手機） |
|---|---|---|---|
| WebGL context 建立數 | 21（每次往返 2 個） | **1** | **1** |
| 同時存活的 context | 1 | 1 | 1 |
| 存活的 shader program | CS 13、World 9 | CS 16、World 15，第 2 次起不變 | 相同 |
| 每次往返新連結的 program | 約 22 | 約 11 | 約 11 |
| 存活的 buffer / texture | CS 148/8、World 258/13，不變 | CS 148/8、World 307/13，不變 | 相同 |
| 第一幀完整（無 pop-in） | 10/10 | 10/10 | 10/10 |
| Draw calls / 三角形（CS） | 31 / 73.2k | 31 / 73.2k | 31 / 73.2k |
| Click → 第一個完整 CS 畫面（中位數） | 955 ms | **838 ms** | 844 ms（P9.8b 模式 956 ms） |
| Click → Scene Ready（8 個名牌都有內容，中位數） | 974 ms | **858 ms** | 866 ms（P9.8b 模式 975 ms） |
| GC 後 JS heap，20 次往返（另一組只記錄 heap 的量測） | 33.1 → 50.4 MB；第 5→20 次 +7.8 MB（每次約 +0.5 MB，持續成長） | 33.2 → 47.8 MB；第 5→20 次 **+0.9 MB**（每次約 +0.06 MB，趨於平坦） | — |

- **共用 World 的 buffer 多 49 個**（307 對 258）：CS 的 GLB 留在 drei 快取，在共用 context 中仍保有它的 buffer；下次進 CS 不必重建。數量固定，不會累積。
- **program 的連結**：沒被使用的 program 會被 three 釋放，所以每次往返仍會重新連結約 11 個，P9.8b 模式約 22 個。存活數在暖機後不再增加。
- **Heap 的驗收**：「GC 後淨增長低於 2 MB」要看怎麼讀。
  - 暖機（前 5 次往返）之後是 +0.9 MB，**通過**；
  - 從第 1 次算到第 10 次是 +2.9 MB（暖機中的成長），**沒有通過**。

  P9.8b 模式在同一期間是 +6.9 MB，而且持續成長；Shared Canvas 消除了雙 Canvas 每次往返的成長。
- **無法量測**：GPU 記憶體在 headless Chromium 中無法量測。

**JS Bundle**（decoded / gzip，KB；同一機器，Shared 關閉對開啟）

| | Shared 關閉 | Shared 開啟 | 差異 |
|---|---|---|---|
| World 首頁載入時 | 595.8 / 190.5 | 595.8 / 190.5 | 0 |
| World 含 3D 場景 | 1801.3 / 536.7 | 1818.0 / 543.7 | +16.7 / +7.0（+0.93% / +1.3%） |
| 飛到 CS 時再載入 | 122.1 / 42.5 | 122.1 / 42.5 | 0 |
| World → CS 合計 | 1923.4 / 579.2 | 1940.1 / 586.2 | +16.7（**+0.87%**） / +7.0（+1.2%） |
| 直接開 `/cs` 含 3D | 1885.4 / 562.6 | 1902.1 / 569.6 | +16.7（**+0.89%**） / +7.0（+1.2%） |
| P9 關閉的正式頁面（`/`、`/islands`、`/curriculum`、`/regions/cs`、`/learn`、課程頁），對 `main@3092455` | — | — | −0.1% 到 −0.5%，**沒有增加** |

- 增加的 16.7 KB 是 host 自己的 chunk，只在兩個旗標都開啟時才下載。以 decoded 計算低於 1%；以 gzip 計算約 +1.2–1.3%。
- 過程中修掉兩處多出的下載：
  - CS 頁預載世界場景時用了另一個 import 來源，重複下載了 +75 KB；
  - host 引入環境模組，讓自己的 chunk 變大。

## 7. 測試結果（Phase G）

最終程式碼的建置與測試（load average 約 4–7；以 1 個 worker 執行，避免自身負載影響計時類測試）：

| 檢查 | 結果 |
|---|---|
| TypeScript（strict） | 0 錯誤 |
| ESLint（`src`、`tests`、`e2e`） | 0 錯誤 |
| Vitest | 91 個檔案，2045 通過、377 跳過（私有題庫、Java、SQLite 等環境條件），0 失敗；包含新的旗標組合測試 |
| Production build | P9 ON / Shared ON、P9 ON / Shared OFF、P9 OFF、Regional World（`LOGIC_ISLAND_REGIONAL_WORLD=1`）四種都成功 |
| E2E，P9 ON / Shared ON（`p9-prototype`、`p9-continuity`、`p9-shared-canvas`、`hex-world`、`hex-camera`、`hex-scale`、`hex-environment`、`islands`、`island-interactions`、`navigation`；桌機與手機） | **273 通過、33 跳過、0 失敗** |
| E2E，P9 ON / Shared OFF（同上；應與 P9.8b 相同） | **257 通過、49 跳過、0 失敗** |
| E2E，P9 OFF（同上，再加上 `curriculum`、`player`、`islands-acceptance`、`home-databases`） | **313 通過、137 跳過、0 失敗**：P9 路由為 404；課綱、互動實驗島與首頁不受影響 |
| E2E，Regional World（`regional-world`、`world-topology`、`island-interactions`） | **70 通過、22 跳過、0 失敗** |
| 已發布課程 | 95 堂（`main@3092455`），依 `lessonStatus === 'complete'` 列出 |
| `IslandConfig.mapState` | 未修改（本 PR 沒有碰課程資料與 world registry；`world-*` 的 Vitest 全部通過） |
| Leak scan | 見 PR（commit 範圍與四個 `.next`） |

**過程中的失敗與分類**：
- **外部高負載（load 13–38）**：其他 session 與專案的建置、ESLint、Vitest 同時執行時，曾出現 4–26 個計時類失敗，例如飛行中的影格數、每秒約 6° 的旋轉、飛行時間、緩動的中間影格。負載降到約 5 後重跑，或單獨重複執行，全部通過。
- **本 PR 自己的問題，已修正**：
  - 世界的手勢處理因依賴 `fly` 物件而每次 render 重設，拖曳與雙指中途失效；
  - CS 預載世界場景時重複下載 chunk。
- **既有 E2E 在 Shared 模式下的前提**：
  - P9.8a 的「Region 第一幀」測試原本只用新 context 判斷第一幀，現在也接受「場景接手共用 Canvas」；
  - Back 的結果維持 P9.5 起「回到整個世界的靜止視角」，所以沒有改其他斷言。

## 8. Before / After 截圖

`docs/planning/evidence/p9-8c/`：

| 檔案 | 內容 |
|---|---|
| `before-desktop-cs-to-world.png`、`before-phone-cs-to-world.png` | Shared 關閉（P9.8b）：CS → Back → World。World 第一個可截圖的畫面是空的海面（新的 Canvas 還在建立），之後才出現總覽 |
| `after-desktop-cs-to-world.png`、`after-phone-cs-to-world.png` | Shared 開啟：World 第一個畫面就是 CS 的地圖、在同一個位置，隨後飛回總覽 |
| `after-desktop-context-lost.png`、`after-phone-context-lost.png` | CS 的 WebGL 失效後：島嶼清單與「重新載入 3D 地圖」；回到世界：導覽與重新載入按鈕 |

## 9. 實機驗證

**未驗證。** 這台 Mac 沒有 Xcode、Playwright WebKit，也沒有連接 iPhone 或 Android 裝置；本文件所有手機數據都是 headless Chromium 的手機模擬，不能代替實機。以下項目都尚未在實機上確認：
- iPhone Safari 與 Android Chrome 上的 World → CS → World；
- 觸控、縮放與旋轉；
- 切到背景後恢復；
- 真實的 context loss 與頁面恢復（含 bfcache）；
- 長時間使用。

## 10. 建議

**Conditional Go**：技術上可以合併，因為旗標預設關閉，P9 關閉與 Shared 關閉的行為都不變。但在 Shared 旗標用於任何部署（包括 Preview 審查以外的用途）之前，必須先滿足以下條件：

1. **真機**：至少一台 iPhone（Safari）與一台 Android（Chrome），完成第 9 節的每一項；特別是手機上 Canvas 換位置（stage 不同）時的連續性、切到背景後恢復，以及真實的 context loss。
2. **Heap 驗收的解讀**：暖機後 +0.9 MB 通過，從第 1 次算起 +2.9 MB 沒有通過，請決定採用哪一種。目前比 P9.8b 模式好（後者每次往返約 +0.5 MB，持續成長）。
3. **Bundle 驗收的解讀**：decoded +0.87–0.93% 通過，gzip +1.2–1.3% 沒有通過，請確認以哪一個為準。
4. **合併由使用者決定**（本 PR 不會自動合併）。

**限制與已知問題**：
- **fallback 清單不列課程**：CS 的 fallback 島嶼清單本身不列出課程，要經過「不需 3D 清單總覽」→「前往課綱」才能進入課程（三步，都可用鍵盤）。這是 region explorer 在 P9.8b 就有的行為，可以另外改善。
- **世界 fallback 的空白區域**：世界的 fallback 在提示下方仍有一塊空白的舞台背景；導覽在下方，可以正常使用。
- **直接開啟 `/cs` 後按瀏覽器 Back**：如果之前沒有指向或聚焦世界連結，世界場景的程式要在那時才載入，會出現短暫的載入狀態（與 P9.8b 相同）。
- **Program 重新連結**：每次往返仍會重新連結約 11 個 program（three 會釋放沒在使用的 program）。存活數穩定。
- **其他區域**：其他四個區域與 `/islands`、`/world` 不使用 Shared Canvas。下一步（P9.8d）是依序把其他區域納入同一個機制；每個區域只需要 `regionFrame`，與 CS 相同。
