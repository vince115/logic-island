# 第三批課綱盤點與視覺化策略（PL11–PL15）

> 2026-11-20，課程生產流程第三批的 Phase A／B。大綱取自 `docs/planning/data/curriculum-blueprint.json`（標題、目標、概念、先修以藍圖為準，不得偏離）；規格見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)。基準：`main` `bd0a035`，已發布 90 堂。

## 1. 內容矩陣

| | PL11 語法分析與抽象語法樹 | PL12 直譯器：走訪 AST 求值 | PL13 並行模型 | PL14 執行緒與同步 | PL15 非同步：Promise、async／await 與事件迴圈 |
|---|---|---|---|---|---|
| slug | `parsing-and-ast` | `tree-walking-interpreters` | `concurrency-models` | `threads-and-synchronization` | `async-await-and-event-loops` |
| 難度 | 中級 | 中級 | 中級 | 進階 | 進階 |
| 先修 | PL10、D13 | PL11、PL06 | PL07 | PL13 | PL13、PL06 |
| 建議 | F04、F18、D05 | D09、A15 | PL06、D06 | PL09、D06 | PL14、D06 |
| 學習目標 | 讀 BNF／EBNF 文法；遞迴下降把 token 解析成 AST；用文法層次處理優先順序與結合性；比較具體語法樹與 AST、辨識歧義 | 後序走訪 AST 求值；以環境表實作變數綁定與巢狀作用域；加入 if、while 與函式呼叫；比較直譯與編譯 | 區分並行與平行；比較共享記憶體執行緒、事件迴圈、actor 三種模型；在時間軸上重現競爭條件；說明 GIL、JS 單執行緒事件迴圈與 Java 執行緒 | 互斥鎖與原子操作；死結四條件與固定鎖順序；條件變數或阻塞佇列做生產者—消費者；比較 C++、Java、Python 的寫法 | 追蹤呼叫堆疊、任務佇列與微任務；以 Promise／Future 與 async／await 改寫回呼；generator 與協程的暫停與恢復；比較 JS、asyncio、CompletableFuture |
| 核心概念 | 文法、BNF、遞迴下降、AST、優先順序與結合性、語法歧義 | 求值、環境、AST 走訪、直譯與編譯、執行期錯誤、REPL | 並行與平行、執行緒、事件迴圈、actor 模型、競爭條件、GIL | 互斥鎖、原子操作、死結、條件變數、生產者—消費者、執行緒安全 | 事件迴圈、微任務、Promise／Future、async／await、協程、generator |
| 四語範例 | 適合：四語各寫同一個遞迴下降解析器，輸出 AST（括號式） | 適合：四語各寫同一個走訪求值器與環境 | 部分：執行緒的真實交錯不可重現，範例只印 join 後的確定結果；競爭條件以「排程模擬」程式重現；JS 範例用事件迴圈而非執行緒 | 適合但需註明模型：C++ `std::thread`／`std::mutex`／`std::atomic`，Java `synchronized`／`AtomicInteger`／`BlockingQueue`，Python `threading.Lock`／`queue.Queue`，JS 以單執行緒事件迴圈說明為何不需要鎖（`Atomics` 只在正文提及） | 各語言模型不同：JS Promise 與微任務（輸出順序確定）、Python `asyncio`、Java `CompletableFuture`、C++17 只有 `std::future`／`std::async`（協程是 C++20，只在正文說明） |
| 測驗 | 文法推導、AST 形狀、優先順序與結合性、歧義 | 求值結果、環境查找、執行期錯誤 | 交錯結果、模型選擇、GIL 的影響 | 鎖與原子性、死結條件、虛假喚醒 | 輸出順序（同步、微任務、計時器）、await 的暫停點 |
| 練習 | 解析並輸出 AST（含錯誤位置） | 執行一個小語言程式 | 列舉兩個執行緒「讀—加—寫」的所有交錯與最終值（模擬） | 加鎖後的計數器或有界緩衝區的確定輸出 | 模擬事件迴圈，給定事件序列輸出執行順序 |
| 大綱活動 | `ast-explorer`（未實作） | `ast-explorer`（未實作） | `concurrency-timeline`（未實作） | `concurrency-timeline`（未實作） | `concurrency-timeline`（未實作） |

大綱沒有、因此不加入：編譯器最佳化、記憶體模型（happens-before）的形式定義、分散式一致性。

## 2. 視覺化策略

共用的逐步追蹤（`TraceStep`）每一步可以同時帶多個面板：變數、呼叫框架、堆疊／佇列容器、一般樹（節點有標籤與子節點）、表格與圖；播放器畫出每一步帶的所有面板。因此：

| 課程 | 使用的既有視覺化 | 表達方式 | 是否正確表達 |
|---|---|---|---|
| PL11 | `tree-traversal`（樹面板）＋呼叫框架 | 遞迴下降解析 `1 + 2 * 3`：每一步顯示解析函式的呼叫堆疊，AST 隨著函式回傳逐步長出 | 是：AST 是一般樹，解析器的遞迴就是呼叫框架 |
| PL12 | `recursion-trace` 或 `tree-traversal` | `eval(node)` 的遞迴框架、AST 上標出目前節點、表格列出環境 | 是 |
| PL13 | `variable-state`＋表格 | 排程模擬程式的變數狀態；表格是兩個執行緒的時間軸（哪一步、誰、共享值） | 是：追蹤的是模擬程式，正文明說真實排程不可預測 |
| PL14 | `stack-queue`（佇列容器）或 `variable-state` | 有界緩衝區以佇列容器呈現，變數列出鎖的持有者與等待者 | 是，追蹤確定的模擬 |
| PL15 | `stack-queue`（堆疊＋兩個佇列） | 呼叫堆疊、微任務佇列、任務佇列逐步變化，輸出面板顯示印出順序 | 是：依事件迴圈規則模擬一段固定程式 |

不建立 `ast-explorer`、`concurrency-timeline` 的假元件；可以自己輸入程式並即時解析、或拖曳排程的互動，列入 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)。

## 3. 確定性與語言版本

- 所有範例輸出必須確定：不印真實執行緒交錯的結果、不依賴計時器的先後（除了 JS 規範定義的微任務／計時器順序）、不印位址。
- C++ 以 `-std=c++17 -Wall -Werror` 編譯（CI 為 Ubuntu 的 GNU g++，本機為 Apple clang）：協程、`std::jthread`、`std::latch` 是 C++20，只在正文說明。
- Java 以 `--release 17` 編譯：虛擬執行緒（Java 21）只在正文說明，不寫成可執行範例。
- 死結只以模擬或圖解呈現，不執行會卡住的程式。
