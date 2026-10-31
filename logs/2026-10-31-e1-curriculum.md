# Phase E.1：60 堂課綱架構與學習引擎（2026-10-31）

> 授權範圍：建立 60 堂課綱（三島各 20 堂）、資料驅動的教材架構與驗證、共用課程頁、視覺化 registry、學習進度，並完成基礎程式島前五堂教材；自動化測試、文件與單一本地 commit。不修改 GLB、3D 島嶼幾何、相機、Auto Orbit、光照／時間情境、環境 preset、renderer、Phase D 效能基準與真機驗收工具；不切換正式 `/islands`；不 merge、不 push、不部署、不開始 E.2。基準：`2772970`。採 Fast Iteration Mode。

## 1. 結果摘要

- **課綱**：60 堂（F01～F20、D01～D20、A01～A20），每堂都有完整大綱（摘要、至少 3 個學習目標、核心概念、先修、難度、時間、APCS 對應、三語、視覺化類型、狀態、版本）。難度 入門 20／中級 31／進階 9。規格與調整理由見 `docs/curriculum/PHASE_E_CURRICULUM.md`。
- **完整教材 5 堂**（F01～F05）：每堂 4～5 個段落、2～4 個三語範例、4 題觀念測驗含解析、1 題程式練習（5～18 組測資）、互動視覺化。其餘 **55 堂為規劃中**，頁面明確標示，不顯示測驗、練習或互動元件。
- **教材驗證**：`validateCurriculum()` 對實際資料回傳 0 個問題；每個範例與參考解答都實際執行：**C++17 與 Python 3 全部通過；Java Not Executed**（本機沒有 JDK）。
- **新路由**：`/curriculum`（課綱目錄）、`/curriculum/[slug]`（60 頁，靜態產生）。`/learn` 只多一個連到課綱的連結。
- **視覺化 registry**：Implemented 2（變數狀態、條件分支）、Planned 12、Not Available 1（`none`）。
- **學習進度**：localStorage，版本 1，Not Started／In Progress／Completed；完成＝確認讀完＋測驗答對 ⌈2/3⌉；無法讀取的資料先備份、較新版本唯讀不覆寫。
- Phase D 未受影響：沒有修改 `src/lib/islands`、`src/components/islands`、`perf/`、`src/content/courses.ts` 或 `src/lib/engine.ts`。

## 2. 現況盤點（開工前）

| 項目 | 盤點結果 | E.1 的做法 |
|---|---|---|
| 教材來源 | `src/content/courses.ts`：六份互動教材（array、stack、queue、binary-search、bubble-sort、bfs），`Course` 型別、三語範例 | 保留不動；課綱的 `Language` 型別沿用它，相關課程以 `labs` 連結 |
| 引擎與播放器 | `src/lib/engine.ts`（快照）、`src/components/lab.tsx` | 不修改；規劃中的 D02、D05、D06、A04、A05、A14、F11 連到既有互動實驗 |
| 路由 | `/learn`、`/learn/[slug]`、`/visualize`、`/visualize/[slug]` | 新增 `/curriculum` 系列，不改既有路由 |
| 三座島 | `src/lib/islands/data.ts`：基礎程式島 0 份、資料結構島 3 份、演算法島 2 份教材 | 不修改（避免改變 `/islands` 與候選頁）；課綱的島嶼 ID 與它相同，日後可串接 |
| 進度 | 沒有（localStorage 只用於主題） | 新增 `src/lib/progress.ts` |
| 範例驗證 | `tests/examples.test.ts` 執行六份教材的 C++／Python，沒有 JDK 時略過 Java | 同一做法驗證課綱程式碼 |

## 3. 修改的檔案

| 檔案 | 內容 |
|---|---|
| `src/content/curriculum/schema.ts`（新） | 型別、常數、`validateCurriculum`、`validateContent`、條件比較 |
| `src/content/curriculum/lessons.ts`（新） | 60 堂大綱 |
| `src/content/curriculum/registry.ts`（新） | 三座島、視覺化類型狀態、中文標籤 |
| `src/content/curriculum/content/F01.ts`～`F05.ts`（新） | 五堂完整教材 |
| `src/content/curriculum/index.ts`（新） | 組合與查詢 |
| `src/lib/progress.ts`（新） | 進度格式、狀態、完成規則、讀取與遷移 |
| `src/components/curriculum/*`（新） | 目錄、課程頁、三語程式碼（切換、複製）、測驗、進度、兩種視覺化、樣式（CSS module） |
| `src/app/curriculum/page.tsx`、`src/app/curriculum/[slug]/page.tsx`（新） | 路由 |
| `src/components/catalog.tsx` | `/learn` 加一個連到 `/curriculum` 的連結（`/visualize` 不顯示） |
| `tests/curriculum.test.ts`、`tests/curriculum-code.test.ts`、`tests/progress.test.ts`（新） | 規則、程式執行、進度 |
| `e2e/curriculum.spec.ts`（新） | 桌機與手機的互動驗收 |
| `docs/curriculum/*`（新）、本檔 | 課綱規格、資料結構、撰寫指南 |
| `docs/handoff/*` | TESTING_STATUS、IMPLEMENTATION_STATUS、ROADMAP、NEXT_STEPS |

## 4. 設計決定

- **不建立第二套教材系統**：既有六份互動教材是「實驗」，課綱是「課程」。課程以 `labs` 指向實驗，不複製其內容；`courses.ts`、引擎與播放器都不動，CLAUDE.md 所說的六份教材路由與結果不受影響。
- **資料驅動**：60 堂的資料都在 `src/content/curriculum/`，元件只負責顯示；驗證規則集中在一個函式，測試與文件都引用它。
- **誠實的狀態**：規劃中的課有大綱、沒有教材；驗證保證「標 complete 就一定有完整內容、標 planned 就一定沒有」。尚未實作的視覺化只顯示文字說明（Planned），不顯示假的元件。
- **不執行使用者程式碼**：沒有安全的執行環境，所以練習只提供題目、測資與參考解答，頁面明確說明沒有線上評測。
- **先修只提示不封鎖**：以「先修必須排在前面」的規則同時保證無循環與可解鎖。
- **進度不覆寫**：localStorage 版本化；無法讀取的資料先備份，較新版本唯讀。
- **語言選擇**：全頁所有程式區塊同步切換，並記在這個瀏覽器（只是方便，不影響內容）。

## 5. 驗收結果

全部在隔離副本執行（直接呼叫 node CLI；`src`、`e2e`、`tests`、`perf`、`public` 與 repo 逐檔相同）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 263 passed／30 skipped：新增 `curriculum`（14）、`curriculum-code`（C++、Python 共 48 項執行通過；Java 24 項因沒有 JDK 略過）、`progress`（7）；30 項略過＝既有 6 項＋新增 24 項 Java |
| Next Build | 成功；`/curriculum` 靜態、`/curriculum/[slug]` 60 頁 SSG |
| E2E `curriculum`（桌機＋手機） | 19 passed／1 skipped（剪貼簿測試只在桌機） |
| E2E 全套（單次，機器負載約 16） | 255 passed／38 skipped／7 failed：3 項既有 P1-11（player）；3 項候選頁測試逾時（30 秒），重跑 `candidate-integration`＋`hex-environment` 時通過；1 項實驗室頁黃昏／傍晚標題對比在高負載下間歇失敗——同一測試在 E.1 與 `250b99f`（E.1 之前）各重複 5 次都失敗 1 次，屬既有的時序問題（選單切換後 React 尚未重繪就讀到舊顏色），與 E.1 無關，未修改 Phase D 測試 |

### 5.1 三語程式碼驗證

| 語言 | 範例（17 個） | 練習參考解答（5 題，共 40 組測資＋範例） | 起始程式碼（2 題） |
|---|---|---|---|
| C++17（Apple clang 21，`-Wall -Werror`） | 全部執行且輸出相符 | 全部通過 | 可編譯執行 |
| Python 3.15 | 全部執行且輸出相符 | 全部通過 | 可執行 |
| Java | **Not Executed**（本機沒有 JDK：`javac` 無法執行） | **Not Executed** | **Not Executed** |

Java 程式碼依各語言慣例撰寫並經人工檢查，但沒有實際編譯；取得 JDK（17 以上）後執行 `tests/curriculum-code.test.ts` 即會補驗。

### 5.2 前五堂教材功能（E2E 驗證）

- 三語範例切換（一次切換全頁、方向鍵切換、記住選擇）、複製（剪貼簿內容正確）。
- 變數狀態視覺化：逐步、上一步、重來、目前行標示、變數表與輸出。
- 條件分支視覺化：85→B、90→A、89→B、60→D、59→F、−1／101→Invalid。
- 觀念測驗：未答完不送出；送出後每題顯示對錯、正確答案與解析；答錯顯示還差幾題；可重新作答。
- 進度：開啟即「進行中」；全對＋按「我已讀完本課內容」→「已完成」；重新整理後保留；目錄與下一課的先修提示都顯示已完成。
- 規劃中課程：只有大綱與「規劃中」標示，沒有測驗、練習、互動元件或進度面板。
- 導覽：上一堂／下一堂依建議順序，跨島相接（F20→D01），A20 沒有下一堂；先修只提示。
- 無障礙：每頁一個 h1；按鈕、連結、輸入都有名稱；測驗以 fieldset／legend 分組；結果與視覺化說明用 live region；手機沒有水平溢出。

## 6. 已知問題與限制

1. **Java Not Executed**：本機沒有 JDK。
2. **沒有線上評測**：程式練習只提供題目、測資與參考解答。
3. **進度只在本機瀏覽器**：沒有帳號同步；清除網站資料就會消失。
4. **55 堂仍是大綱**；12 種視覺化為 Planned。
5. **入口**：課綱只從 `/learn` 的連結進入，網站頂部選單與 3D 島嶼尚未連到 `/curriculum`（避免在 E.1 改動 Phase D 的頁面）；是否加入選單、島嶼名牌是否連到課程，需另行決定。
6. 測驗答案隨頁面送到瀏覽器（在瀏覽器批改的必然結果），不適合當作正式考試。
7. 既有：P1-11 的 3 項 player E2E 失敗與本階段無關，未處理。
8. 既有：`hex-environment` 的黃昏／傍晚標題對比測試在機器高負載時約 1/5 失敗（E.1 前的版本同樣如此）；修正方式是在讀顏色前等待 `data-environment` 改變，屬 Phase D 測試，未在 E.1 處理。
