# D.3-4B 真機驗收準備（2026-10-31）

> 授權範圍：建立讓使用者在實體 iPhone／Android 上驗收 `/islands/candidate` 的流程：測試入口、真機診斷、互動檢查表、可匯出的報告與文件；單一本地 commit。不切換正式 `/islands`、不把候選頁設為正式入口、不改 GLB、地形、教材或資產庫、不 merge、不 push；不得以模擬冒充真機結果、不得宣稱 D.3-4B Passed。基準：`17f002e`（D.3-7a）。採 Fast Iteration Mode。
>
> **狀態：D.3-4B Preparation Complete — Real Device Not Measured。**

## 1. 結果摘要

- 沿用並擴充 D.3-4 準備時的 Mac 量測 proxy（`perf/device/`），**沒有修改應用程式**（`src/` 0 行差異）：未開啟量測時頁面原樣轉送，一般使用者看不到任何測試控制；不需新套件、Tunnel、雲端服務或 API Key。
- 新增（D.3-4B）：
  1. **裝置先行**：控制頁先登記裝置（型號，以及依 User-Agent 預填、由使用者確認的系統與瀏覽器版本；自動偵測 CSS viewport、DPR、螢幕、WebGL renderer），之後的量測、雙指縮放與檢查表都歸到這台裝置。移除「測試者」欄位，不收姓名。
  2. **候選頁的新數字**：四次時間切換（到第一個重畫的時間、重畫幀數、新編譯的 program）、自動旋轉 5 秒的 FPS、全景三角形、shader program 數（`linkProgram` 次數）、量測期間的 WebGL context 遺失。舊版沒有這些控制，顯示 Not Available。
  3. **新的人工檢查表**：相機 6、自動旋轉 4、時間情境 7、版面互動無障礙 8、故障 3，共 28 項；每項 Pass／Fail／Not Tested（預設，工具不會自動填 Pass）＋備註；主觀觀察（流暢度、陰影、傍晚暖光、發熱）與量測分開；問題描述、截圖檔名、是否阻擋上線。檢查表改成手機好填的單欄版面。
  4. **報告與匯出**：每台裝置一份報告（HTML）、`export.json`（schema `logic-island/d3-4b-device-report@1`）與純文字版；每個數字標 measured／not-available／unreliable 與原因；`decision` 永遠是 null。
- 操作指南：`docs/handoff/DEVICE_ACCEPTANCE.md` 改寫為 D.3-4B 版（啟動指令、取得 IP、手機開啟、排查、操作順序、驗收表、量測定義、匯出格式、狀態用語）。
- 自動化預檢見 §5。

## 2. 修改的檔案

| 檔案 | 變更 |
|---|---|
| `perf/instrument.mjs` | 另外計數 `linkProgram`（`window.__perfPrograms`），不改每幀紀錄的格式；桌機 harness 與 E2E 照舊 |
| `perf/device/probe.mjs` | `measure`：載入靜止後的 program 數；候選頁的四次時間切換與 5 秒自動旋轉（之後按返回全景）；`webglcontextlost` 計數 |
| `perf/device/report.mjs` | 每頁與每路由的新數字（自動旋轉 FPS、切換延遲／幀數／新 program、三角形、program、context 遺失）；`context-lost` 旗標；路由中位數忽略取不到的值；匯出旗標清單 |
| `perf/device/checklist.mjs` | D.3-4B 檢查項目（C／O／E／U／F）、主觀觀察、結果與評分選項 |
| `perf/device/export.mjs`（新增） | 每台裝置的報告物件、純文字版、每個數字的狀態；依 User-Agent 預填系統與瀏覽器 |
| `perf/device/server.mjs` | 裝置登記與 cookie、量測／雙指縮放／檢查表都帶裝置；新檢查表頁（單欄）；每台裝置的報告；`/__probe/export.json`、`/__probe/export.txt`；檢查表只存表單提供的欄位；先讀 body 再檢查裝置（16 MB 上限照常） |
| `tests/device-report.test.ts` | 新增 4 項（候選頁新數字與舊版 Not Available、context 遺失／桌機不可靠、報告預設 Not Tested 與 decision null、User-Agent 預填） |
| `e2e/device-tool.spec.ts` | 自測改走裝置登記；自動量測另驗時間切換、自動旋轉、program、三角形、匯出；新檢查表與匯出（JSON、文字、未知裝置 404） |
| `docs/handoff/DEVICE_ACCEPTANCE.md` | 改寫為 D.3-4B 操作指南 |
| 文件 | 本檔；TESTING_STATUS、IMPLEMENTATION_STATUS、ROADMAP、NEXT_STEPS |

未修改：`src/`（`/islands`、候選頁、legacy、實驗室頁）、GLB、地形、教材、資產庫、`package.json`／lockfile。

## 3. 設計決定

- **為什麼不新增 app 內的測試路由或開發旗標**：D.3-4 準備已有 Mac 上的 proxy，量測程式只在開啟量測時注入候選頁與舊版的 HTML，其他時候原樣轉送。這等於一條獨立的測試路由（`/__probe/`），而且完全不碰應用程式：正式 UI、`/islands`、draw call 與 shader 不可能因此改變；一般使用者也碰不到它（只存在 Mac 上、只在量測期間開啟）。
- **測試入口**：`next start` 只聽 `127.0.0.1:3118`，手機只連 proxy（`0.0.0.0:3119`，同一 Wi-Fi）。不用 `next dev`（開發模式的效能沒有意義）。區網內 WebGL 不需要 HTTPS，所以不裝憑證、不開 Tunnel。
- **不判定通過**：工具只在已有門檻（P-01～P-03）上給「達標／未達標／不可靠」，其餘只記錄；任何模擬、桌機或軟體算圖的結果都標不可靠；匯出的 `decision` 是 null，由審核依真機報告標 Real Device Passed／Failed。
- **量測、觀察、未測分開**：量測數字有 `status`；主觀觀察在 `observed`（不是數字）；沒有操作的檢查項是 Not Tested，沒有執行的量測列在 `notMeasured`，取不到的值是 Not Available。
- **隱私**：只收裝置型號、系統、瀏覽器、User-Agent、畫面與 GPU 資訊、結果與備註；不收姓名或帳號；截圖不上傳，只記檔名；結果留在 Mac 的 `test-results/device/`（`.gitignore`）。

## 4. 指標與預期值（桌機 Chromium 自測，SwiftShader，全部標不可靠）

| 指標 | 候選頁 | 舊版 |
|---|---|---|
| 全景／聚焦／全景陰影 draw call | 43／26／0 | 146／82／112 |
| 全景三角形 | 28,569 | 12,086 |
| Shader program（載入後） | 17 | 5 |
| 時間切換 | 每次 1 幀、0 個新 program、15～31 ms（暖身頁） | Not Available |
| 自動旋轉 FPS | 有數值（軟體算圖，不可靠） | Not Available |
| context 遺失 | 0 | 0 |

這些是工具在模擬上能量到同一套數字的證明，不是裝置結果；真機上 draw call、三角形與 program 應相同（同一個場景），FPS 與時間才是真機要量的。

## 5. 自動化預檢

全部在隔離副本執行（直接呼叫 node CLI；`src`、`e2e`、`tests`、`perf` 與 repo 逐檔相同）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| 量測工具嚴格型別檢查（`tsc --checkJs --strict` 對 `perf/device/*.mjs`） | exit 0 |
| Vitest | 194 passed／6 skipped（`device-report` 14 項，含新增 4 項） |
| Next Build | 成功 |
| E2E 全套（單次） | 240 passed／37 skipped／3 failed：只有既有 P1-11（`player.spec.ts` 3 項）。`device-tool` 桌機＋手機全部通過（原樣轉送、區網安全、裝置登記、自動量測含時間切換與自動旋轉、故障注入、雙指縮放、檢查表與匯出） |

- `/islands` 沒有變化：`src/` 0 行差異；E2E 的 `/islands`、legacy、候選頁測試照常通過（上表）。
- 候選頁的一般使用流程沒有變化，診斷功能不影響正式 UI：未開啟量測時 proxy 原樣轉送（E2E 逐位元組相同）；`src/` 沒有任何診斷程式。
- 不增加 draw call 或 shader：一般候選頁不載入任何量測程式；E2E 的 D.3-6d 測試照常（每幀 43、切換不編譯 shader）。
- 沒有新套件或外部服務：`package.json`／lockfile 未變。

## 6. 已知限制

1. **真機：Not Measured**。這台 Mac 沒有實體手機、adb、Xcode 或 iOS 模擬器；工具只在 Chromium 模擬自測。
2. FPS 是 rAF 頻率，不是螢幕更新率或 GPU profiling；iPhone Safari 預設 60 Hz 上限。
3. iOS Safari 的 WebGL renderer 通常只回報「Apple GPU」；取不到的資訊顯示 Not Available。
4. 自動量測用程式按按鈕觸發飛行、切換與旋轉，不是手指；手感由人工項目檢查。
5. proxy 在區網沒有登入；只在受信任的 Wi-Fi、量測期間開啟（指南 §1.4）。
6. 舊格式（D.3-4 準備時）存的結果沒有裝置，不會出現在新的裝置報告，只在 `/__probe/report.json`。
