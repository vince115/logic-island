# 互動實驗待開發項目（Interactive Lab Roadmap）

> 2026-11-20，課程生產流程（第一至第四批）。藍圖為程式語言島的課安排了一些尚未實作的活動。已發布的課改用既有的共用視覺化或表格與逐步說明（見各批紀錄），**不放假的互動元件**。下列項目需要新的引擎或元件，屬另案：先評估成可重用的共用元件，再排入開發，不在課程批次的 PR 中實作。

| 活動 | 用到的課 | 目前的替代 | 真正需要的能力 | 可能的重用基礎 |
|---|---|---|---|---|
| `type-checker` | PL04、PL05 | 無（比較表格與逐步說明） | 輸入一段程式，逐步顯示型別推論與錯誤 | 無 |
| `scope-chain` | PL06 | 函式呼叫追蹤 | 自己寫閉包，看作用域鏈與捕捉 | 函式呼叫追蹤的框架面板 |
| `memory-model` | PL07 | 函式呼叫追蹤＋堆積表格 | 堆疊與堆積的箭頭圖，可逐步修改 | 圖面板 |
| `gc-visualizer` | PL08 | 圖的走訪（mark-and-sweep 步驟由課內程式產生） | 自己建物件圖並執行 mark-and-sweep、參考計數、世代 | 圖的走訪引擎 |
| `compiler-pipeline` | PL10、PL16 | 變數狀態追蹤（lexer）；PL16 以圖的走訪呈現控制流程圖、表格列出三位址碼 | 原始碼 → token → AST → 執行的分段檢視 | lexer 與 parser 的課內程式 |
| `ast-explorer` | PL11、PL12、PL18 | 樹面板＋呼叫框架（固定範例）；PL18 以函式呼叫追蹤呈現裝飾器的包裝呼叫鏈 | 自己輸入算式，即時解析並逐步求值 | 樹面板、PL11／PL12 的解析器與直譯器 |
| `packet-journey`、`network-sequence`（CN-0） | 計算機網路島（尚未撰寫） | `network-protocol` 能力已實作：固定情境的訊息順序、由外到內的各層標頭、節點表格與從情境讀出的練習 | 學習者自己改變參數（遺失、延遲、視窗大小）並重新模擬 | `src/lib/network/model.ts` 的情境資料 |
| `routing-table`、`subnet-calculator` | CN03、CN05、CN07、CN19 | 這幾堂以 `network-protocol` 情境的節點表格（路由表、MAC 表）與子網路練習（答案由 `subnetOf` 計算）呈現 | 可編輯的路由表與最長前綴比對、輸入任意位址的子網路計算器 | `subnetOf`、情境的節點表格 |
| `search-tree`、`game-tree`、`probability-explorer`、`bayes-net`、`mdp-gridworld`、`knowledge-graph`、`logic-proof`（AIF-0） | AI 基礎島（尚未撰寫） | `python-code` 課以共用追蹤呈現：樹的走訪、圖的走訪、遞迴樹、動態規劃表、變數狀態 | 學習者自己改起點、啟發函數、機率或報酬，重新執行並比較 | 共用追蹤面板、課內的 Python 程式 |
| `terminal-sim`（LNX-0） | Linux 系統島（尚未撰寫） | `terminal` 能力已實作：課內的機器資料、重播的指令紀錄、嵌入式終端機與以結果檢查的練習；指令只有 P7 實驗的 14 個 | 引擎階段 E1–E9：更多檔案指令、管線與重新導向、使用者與群組、行程、套件、systemd 與日誌、SSH、有界的 Bash 直譯器、cron（見 [LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)） | `src/lib/terminal` 的檔案系統與 Shell（指令組由 profile 選用） |
| `case-study-board`（LNX01） | Linux 系統島（尚未撰寫） | LNX01 改用 `terminal-sim`（在模擬機器上查看發行版資訊與目錄） | 依需求比較發行版並記錄取捨的分析板 | 無 |
| `case-study-board` | PL19 | 無（比較表格與逐步說明） | 依情境需求逐項比較語言並記錄取捨的分析板 | 無 |
| `concurrency-timeline` | PL13、PL14、PL15 | 變數狀態＋時間軸表格、堆疊與佇列容器（固定範例） | 拖曳或選擇排程，看交錯、死結與事件迴圈 | 交易時間軸（`transaction-timeline`）的排程模型 |

優先順序建議：`ast-explorer`（兩堂課共用、引擎可由課內程式擴充）> `concurrency-timeline`（三堂課共用，可評估與資料庫島交易時間軸共用排程引擎）> 其他。
