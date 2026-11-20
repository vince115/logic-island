# P9 手機版面修正：首頁標籤與區域頁頁首

> 2026-11-20，分支 `p9/phone-layout-fix`（從 `main@3092455`）。P9 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置生效；沒有修改 Vercel 環境變數、Production 或旗標。修的是 P9.8a 報告第 8 節列出、P9.6 留下的兩個手機版面問題。

## 1. 問題與根因

### 1.1 首頁「網頁與應用開發」標籤點不到

- **現象**：手機首頁（`/`）在世界總覽的初始視角下，`[data-target="web"]` 標籤落在左下角縮放／重設按鈕（`[data-world-controls]`）底下。按鈕的 `z-index` 比標籤高，點標籤其實點到按鈕。P9.8a 的 E2E 因此在手機改用程式觸發的 click。
- **量測（修正前）**：iPhone 13（390×664）標籤 `83,480–150,521`、按鈕 `12,470–208,514`，標籤中心點的元素是按鈕；320×640 同樣被擋住；360×740 中心點剛好露出，但標籤下緣仍壓在按鈕上（標籤 `492–533`、按鈕從 `520` 起）。
- **根因**：標籤位置由 `placeLabels`（`src/lib/islands/regions/overview-labels.ts`）決定，它會避開其他標籤、陸地與連結，但不知道地圖上還有一組按鈕。

### 1.2 區域頁頁首內容超出 88 px

- **現象**：手機的 P9 區域頁（`/cs`、`/ai`、`/design`、`/web`、`/sys`）頁首高度固定 88 px（`--header-h`），但內容排成三列：Logo 被推到頁首上緣外（`y = −14`），返回／清單／時間按鈕單獨一列，主選單落到 `67–101`，超出頁首下緣。
- **根因**：頁首第一列在手機要放品牌（含 `v0.1` 標籤 197 px）與工具（返回 35 px、清單 42 px、時間按鈕 40 px，加間距共 135 px；431 px 以上 `開始學習` 會出現，共 230 px）。在 Chromium／Arial 量到，320 px 到約 490 px 都放不下，工具因 `flex-wrap` 換到自己的一列。414–430 px 剛好放得下，所以先前只在 390 px 以下注意到。P8 的 `/world/<region>` 用同一個返回連結（`.backToWorld`），所以也有同樣的問題。

## 2. 修正

| 問題 | 修改 | 檔案 |
|---|---|---|
| 標籤被按鈕擋住 | `placeLabels` 新增 `keepClear`（一組舞台上的方框），標籤避開它們的方式與避開其他標籤相同；P9 世界場景把縮放／重設按鈕的方框（`offsetLeft/Top/Width/Height`）傳進去 | `overview-labels.ts`、`p9-world-scene.tsx` |
| 頁首超出 | 只在有返回連結的頁首（區域頁）：≤ 780 px 隱藏 `v0.1`、第一列間距 20 → 12 px；≤ 480 px 隱藏 `開始學習`；≤ 360 px 品牌字級 22 → 18 px | `world.module.css` |

- **頁首高度與區域頁版面不變**：頁首仍是 88 px、兩列（品牌與工具一列、主選單一列），標題列仍是 86 px，所以 `src/lib/p9/region-layout.ts` 不需要改；地圖 Canvas 的 top 修正前後都是 174 px（`sys` 在 ≤ 360 px 時英文眉標換行，仍是 188 px，與 P9.8a 記錄的情況相同）。
- **標籤位置的影響範圍**：1440、1280、1024、834、600 px 的首頁標籤位置與修正前完全相同；768 px 的 `web` 標籤上移 18 px（原本下緣壓到按鈕）；430 px 以下 `web` 改放到群島上方，`sys` 因此讓位到更上方。所有標籤仍不壓陸地、連結與其他標籤（既有的 `regional-world.test.ts` 與 E2E 檢查）。
- **P9.4／P9.6／P9.8a**：縮放、平移、手機區域按鈕列都沒有改；按鈕本身位置與大小不變。飛行終點由區域頁的開場視角決定，與標籤位置無關。
- **測試的配合修改**：`e2e/p9-continuity.spec.ts` 的 `openFromLabel` 原本在手機用程式觸發 click（因為 `web` 標籤點不到），現在改成真正的 `tap()`。

## 3. 截圖（修正前 → 修正後）

證據在 `docs/planning/evidence/p9-phone-layout/`，都是隔離副本的 headless Chromium：

- `home-390-before.png` → `home-390-after.png`：iPhone 13 首頁，「網頁與應用開發」從按鈕底下移到群島上方。
- `home-320-before.png` → `home-320-after.png`：320×640 首頁。
- `header-cs-390-before.png` → `header-cs-390-after.png`：iPhone 13 `/cs` 頁首（上方 220 px）。
- `header-sys-320-before.png` → `header-sys-320-after.png`：320 px `/sys` 頁首。

## 4. 新增與修改的測試

- `e2e/p9-prototype.spec.ts`「P9 phone layout」（只在手機 project 執行）：
  - iPhone 13、360×740、320×640 各一個：首頁六個標籤都不與縮放按鈕重疊、每個標籤中心點收到的是標籤本身；然後以 `tap()`（Playwright 會確認點擊落在標籤上，不是程式 click）點「網頁與應用開發」，進入 `/web`。
  - 區域頁頁首：五個區域在 390 px，`/cs` 在 320、360、375、431、480、600、780 px。頁首高 88 px；品牌與所有工具在頁首內、在主選單之上、與品牌同一列；主選單在頁首內；頁面沒有橫向溢出。
- `tests/regional-world.test.ts`：`placeLabels` 的 `keepClear`（標籤避開按鈕；空的 `keepClear` 結果與不傳相同）。

## 5. 驗證

全部在隔離副本（`git archive` 與 rsync 的副本、clone 的 `node_modules`、直接呼叫 node CLI）執行，headless Chromium。執行時其他工作讓這台機器的 load average 在 12–45 之間。

| 檢查 | 結果 |
|---|---|
| TypeScript、ESLint | 0 錯誤 |
| Vitest（IntelliJ 內建 JDK 在 PATH） | 91 個檔案，2413 通過、9 略過、0 失敗 |
| Build | 旗標開啟（`LOGIC_ISLAND_P9_PROTOTYPE=1`）、旗標關閉、Regional World（`LOGIC_ISLAND_REGIONAL_WORLD=1`）都成功 |
| E2E 旗標開啟（`p9-prototype`、`p9-continuity`、`hex-world`、`hex-camera`、`hex-scale`、`hex-environment`、`islands`、`islands-acceptance`，2 workers） | 237 通過、37 略過、4 失敗。4 個都是桌機的飛行計時測試（取消飛行、連點、handover 緩動），P9.8b 記錄過它們在高負載下不穩；load average 降到約 12 後用 1 個 worker 重跑，4 個都通過。手機的 `p9-continuity`（改用 `tap()`）與新的版面測試另外完整重跑：19 通過、1 略過、0 失敗，飛行終點 ≤ 1 px 的檢查都通過 |
| E2E 旗標關閉（同上 8 個 spec） | 158 通過、119 略過、1 失敗：`hex-camera` D.3-5b 環繞重畫次數 14（門檻 > 15），與 Vitest 同時執行；單獨重跑通過。這個頁面不受本次修改影響 |
| E2E Regional World（`world-topology`、`regional-world`） | 62 通過、20 略過、0 失敗（含 P8 `/world`、`/world/cs` 在 320／375／390 px 的頁首測試） |
| Leak scan | 旗標開啟、關閉兩份 `.next` 與追蹤檔案、`origin/main..HEAD` 都乾淨 |
| 首頁標籤位置對照（修正前後） | 1440、1280、1024、834、600 px 相同；768 px 與手機寬度依第 2 節改變 |

## 6. 限制

- **真機**：沒有真機測試（這台機器沒有 Xcode 或 WebKit，也沒有連接裝置）。頁首的寬度是 Chromium＋Arial 量到的；iOS Safari 的字型寬度若差很多，320 px 的品牌與工具之間只剩約 8 px，要在真機確認。
- **縮放之後**：修正只保證首頁初始視角（`HOME_VIEW`）的標籤不在按鈕底下。縮放或平移後，標籤隨地圖移動，仍可能經過按鈕底下；那時手機會顯示 P9.6 的區域按鈕列，任何區域仍是一次點擊可達。
