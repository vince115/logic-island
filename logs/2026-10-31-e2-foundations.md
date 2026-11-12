# Phase E.2：基礎程式島 20／20 完整教材（2026-10-31）

> 授權範圍：完成基礎程式島 F06～F20 的完整教材與互動內容，擴充可重用的視覺化，補驗三語程式碼；分批驗收並建立本地 commit。不降低驗證標準、不只改 lessonStatus；資料結構島與演算法島維持規劃中；60 堂不增減、ID／slug 不變。不修改 GLB、島嶼幾何、相機、Auto Orbit、時間情境、光照、renderer、真機驗收工具與正式 `/islands`；不 merge、不 push、不部署、不開始 E.3。基準：`5c43f98`。採 Fast Iteration Mode，分三批：batch A（F06～F10，`d71cb6a`）、batch B（F11～F15，`618ddd9`）、batch C（F16～F20 與文件，本 commit）。

## 1. 結果摘要

- **基礎程式島 20／20 完整**，資料結構島 20、演算法島 20 仍為規劃中；60 堂、ID 與 slug 不變（`tests/curriculum.test.ts`）。
- 15 堂新教材：F06 多重條件與邏輯運算、F07 For 迴圈、F08 While 迴圈、F09 巢狀迴圈、F10 字串基礎、F11 一維陣列、F12 二維陣列、F13 函式基礎、F14 參數與回傳值、F15 變數作用域、F16 字串與陣列操作、F17 基本除錯技巧、F18 遞迴入門、F19 時間與空間複雜度入門、F20 基礎程式島綜合挑戰。每堂 3～4 段、3 個三語範例、4 題測驗（程式閱讀、執行推理、錯誤辨識）、1 題完整練習、互動視覺化。
- **標準提高（不是降低）**：完整教材必須有 `motivation`、至少 3 個範例、至少 4 題測驗；F01 新增「邏輯錯誤」範例，F01～F05 補上 motivation。
- **Java 補驗**：使用本機已有的 IntelliJ IDEA 附帶 JDK（OpenJDK 25.0.4，未下載或安裝任何東西、未改系統設定），以 `javac --release 17` 編譯。F01～F20 的所有範例、參考解答與起始程式碼在 C++17、Python 3、Java 17 **全部執行通過**（E.1 的 Java Not Executed 已解除）。
- **視覺化擴充**：一個共用的 trace 元件涵蓋變數、迴圈、陣列（一維、二維、越界）、函式呼叫與遞迴呼叫堆疊；條件分支加上短路求值的逐項顯示；新增複雜度示意模型與綜合挑戰分段。沒有為單一課程建立專屬元件。
- **島嶼完成狀態**：目錄與每堂的進度面板顯示「基礎程式島：已完成 x／20 堂」，20 堂都完成時顯示「基礎程式島全部完成！」。

## 2. 新增與修改的檔案

| 檔案 | 內容 |
|---|---|
| `src/content/curriculum/content/F06.ts`～`F20.ts`（新） | 15 堂完整教材 |
| `src/content/curriculum/content/F01.ts`～`F05.ts` | 加入 motivation；F01 加入第三個範例 |
| `src/content/curriculum/schema.ts` | `motivation`；`MIN_EXAMPLES = 3`、`MIN_QUIZ = 4`；`TraceStep` 擴充（`expected`、`loops`、`arrays`、`frames`）；`TRACE_KINDS`；`complexity`、`challenge-stages` 設定；比較加 `mod`；trace 與新類型的驗證 |
| `src/content/curriculum/registry.ts` | 新類型 `function-call`、`recursion-trace`、`complexity`、`challenge-stages`；`loop-execution`、`array-index` 改為 Implemented |
| `src/content/curriculum/lessons.ts` | F06～F20 改為 complete 1.0.0；F13～F15、F17～F20 的視覺化類型（ID、slug、先修不變） |
| `src/content/curriculum/index.ts` | 登記 15 堂內容 |
| `src/components/curriculum/visualizations.tsx` | 共用 `Trace`（取代 E.1 的 `VariableState`）、`ConditionalBranch`（短路）、`Complexity`、`ChallengeStages` |
| `src/components/curriculum/lesson-page.tsx`、`progress.tsx`、`catalog.tsx`、`curriculum.module.css` | motivation、視覺化分派、`IslandProgress`、新面板樣式 |
| `tests/curriculum.test.ts`、`tests/curriculum-code.test.ts` | 完成清單、驗證器測試更新；Java `--release 17`；比對保留開頭空白 |
| `e2e/curriculum.spec.ts` | 新增 12 項（各視覺化、F13 進度、島嶼完成、20 堂溢出） |
| `docs/curriculum/*`、`docs/handoff/*`、本檔 | 課綱規格、資料結構、撰寫指南、交接文件 |

未修改：`src/lib/islands`、`src/components/islands`、`perf/`、`src/content/courses.ts`、`src/lib/engine.ts`（自 `5c43f98` 起 0 行差異）。

## 3. 視覺化（Implemented／Planned／Not Available）

| 類型 | 狀態 | 使用課程 | 呈現 |
|---|---|---|---|
| 變數狀態追蹤 | Implemented | F01～F04、F17 | 目前行、變數表、輸出；F17 加上「預期值」比對並以文字標出不一致 |
| 條件分支 | Implemented | F05、F06 | 每個條件成立／不成立／不再檢查；複合條件逐項列出 true／false／「短路，未計算」 |
| 迴圈執行 | Implemented（共用 trace） | F07～F09 | 每個迴圈的輪次、剛檢查的條件與結果，巢狀迴圈同時顯示內外層 |
| 陣列與字串 | Implemented（共用 trace） | F10～F12、F16 | 格子與索引，讀取／寫入以文字標示，越界時寫出合法範圍；二維顯示列與行 |
| 函式呼叫追蹤 | Implemented（共用 trace） | F13～F15 | 呼叫堆疊（執行中／等待中）、各層變數、回傳值、參考與全域變數 |
| 遞迴呼叫堆疊 | Implemented（共用 trace） | F18 | 堆疊長到終止條件，再逐層回傳 |
| 複雜度比較（示意模型） | Implemented | F19 | 依 n 計算 O(1)～O(n²) 的操作次數，明確標示「不是實測時間」 |
| 綜合挑戰分段 | Implemented | F20 | 五個階段的目標、說明與用到的課程，完成／目前／待做以文字標示 |
| 其餘 10 種（堆疊佇列、樹、排序、圖、鏈結串列、雜湊、堆積、並查集、遞迴樹、DP 表格） | Planned | D、A 島 | 課程頁只寫「Planned，尚未實作」，不顯示假元件 |
| 不使用互動視覺化 | Not Available | 部分 D、A 課程 | — |

既有六份互動實驗仍以 `labs` 連結（F11 → array 等），沒有重複建造。

## 4. 三語言驗證

| 項目 | 數量 | C++17 | Python 3 | Java 17 |
|---|---|---|---|---|
| 範例 | 63 | 通過 | 通過 | 通過 |
| 練習參考解答（每題跑全部測資與範例） | 20 題，140 組測資 | 通過 | 通過 | 通過 |
| 起始程式碼（可執行） | 3 份（F01、F02、F17） | 通過 | 通過 | 通過 |

- 合理的跨語言差異以各語言自己的預期輸出驗證並在教材中說明：F04 負數整數除法、F11 陣列指定（C++ 複製；Python／Java 共用）、F15 區塊作用域（Python 的 for 不產生作用域）。
- C++ 以 `-Wall -Werror` 編譯；輸出比對只去掉結尾空白（F09 金字塔等開頭空白也被檢查）。
- 測驗答案另以人工逐題核對（batch C 中發現並修正 F16 第 3 題的答案與 F20 一組漏掉 Best 行的測資）。

## 5. 各批次驗收

| 批次 | 內容驗證＋三語程式碼（Vitest） | 課程 E2E | ESLint／tsc／build |
|---|---|---|---|
| A（F06～F10） | 149 passed | 27 passed／1 skipped | 通過 |
| B（F11～F15） | 209 passed | 31 passed／1 skipped | 通過 |
| C（F16～F20） | 272 passed | 41 passed／1 skipped（另加 20 堂溢出檢查：6 passed） | 通過 |

驗證器在批次中實際抓到 4 個 section 與 example 同名的 id（F09、F14、F15，E.1 也遇過），都已改名。

## 6. 最終驗收

全部在隔離副本執行（直接呼叫 node CLI；`src`、`e2e`、`tests`、`perf`、`public` 與 repo 逐檔相同）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest（全部，JDK 在 PATH） | **479 passed／0 skipped**（E.1 的 30 項 Java 略過已全部執行） |
| Next Build | 成功；`/curriculum/[slug]` 60 頁 SSG |
| E2E `curriculum`（全套中） | 43 passed／1 skipped（剪貼簿只在桌機）／0 failed |
| E2E 全套（單次，機器負載約 9～14） | 282 passed／38 skipped／4 failed：3 項既有 P1-11（player）；1 項候選頁「自動旋轉…分頁隱藏都會停止」30 秒逾時 |

候選頁的逾時與 E.2 無關的證據：E.2 沒有修改任何 3D 或候選頁程式（上述 0 行差異）；同一測試在 **E.2 之前的 `5c43f98` 建置**上、同樣的機器狀態下（負載約 30，其他工作階段同時執行）重複 3 次也是桌機與手機 6／6 失敗。這項測試在先前較安靜時的全套執行中通過（D.3-7a、E.1 重跑）。已記錄為負載相依的既有問題，未修改 Phase D 測試。

## 7. 進度與學習流程

- F06～F20 的完成狀態可記錄（E2E：F13 全對＋讀完 → 已完成，重新整理後保留）；測驗通過門檻一致（⌈題數 × 2/3⌉，4 題需答對 3 題）。
- 上一堂／下一堂依建議順序（F20 → D01），先修提示正確（只提示不封鎖）。
- 基礎程式島完成：20 堂皆完成時，目錄與 F20 的進度面板都顯示「全部完成」；既有進度資料不被改寫（E2E 驗證）。F01～F05 的進度格式未改變。

## 8. 已知問題

1. 資料結構島與演算法島 40 堂仍是大綱；10 種視覺化 Planned。
2. 程式練習沒有線上評測（設計如此）；進度只在本機瀏覽器。
3. 複雜度示意模型的長條使用線性比例，小的數值長條幾乎看不見（數字都有列出）。
4. Java 驗證依賴本機的 IntelliJ IDEA 附帶 JDK；沒有 JDK 的環境 Java 測試會被略過，CI 需要安裝 JDK 17 以上。
5. 既有：P1-11（player 3 項）；候選頁 Auto Orbit 測試在高負載下逾時（§6）；課綱入口仍只有 `/learn` 的連結。
