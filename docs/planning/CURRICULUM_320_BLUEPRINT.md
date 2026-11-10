# 320 堂課程藍圖（Curriculum Blueprint）

> Phase F.0 規劃文件（2026-11-02）。**260 堂新課只有藍圖（大綱層級），沒有教材、程式範例、測驗或測資**；已完成的 60 堂只列 ID 與標題。
> 資料來源：[`data/curriculum-blueprint.json`](data/curriculum-blueprint.json)（本頁由它產生，修改請改資料檔）。島嶼定位見 [ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)，路線見 [LEARNING_PATHS](LEARNING_PATHS.md)。

## 統計

| 島 | 代碼 | 課數 | 狀態 | 入門 | 中級 | 進階 |
|---|---|---:|---|---:|---:|---:|
| 基礎程式島 Programming Fundamentals | F | 20 | Complete | 12 | 8 | 0 |
| 資料結構島 Data Structures | DS | 20 | Complete | 6 | 11 | 3 |
| 演算法島 Algorithms | AL | 20 | Complete | 2 | 12 | 6 |
| 程式語言島 Programming Languages | PL | 20 | Planned | 3 | 10 | 7 |
| 資料庫應用島 Database Applications | DB | 20 | Planned | 4 | 12 | 4 |
| 計算機網路島 Computer Networks | CN | 20 | Planned | 4 | 11 | 5 |
| 系統分析與設計島 Systems Analysis & Design | SA | 20 | Planned | 5 | 10 | 5 |
| 管理資訊系統島 Management Information Systems | MIS | 20 | Planned | 4 | 10 | 6 |
| AI 基礎島 AI Foundations | AIF | 20 | Planned | 3 | 12 | 5 |
| 機器學習島 Machine Learning | ML | 25 | Planned | 5 | 12 | 8 |
| 深度學習島 Deep Learning | DL | 25 | Planned | 3 | 10 | 12 |
| 大型語言模型島 Large Language Models | LLM | 25 | Planned | 4 | 12 | 9 |
| 生成式 AI 島 Generative AI | GEN | 20 | Planned | 2 | 12 | 6 |
| AI 代理島 AI Agents | AG | 25 | Planned | 3 | 13 | 9 |
| AI 工程與 MLOps 島 AI Engineering & MLOps | OPS | 20 | Planned | 3 | 9 | 8 |
| **合計** | | **320** | Complete 60／Planned 260 | | | |

欄位說明：**必修**＝阻擋性先修（`prerequisites`）；**建議**＝只提示（`recommended`）；**活動**＝建議的互動視覺化（詞彙與實作等級見 [INTERACTIVE_ACTIVITY_ARCHITECTURE](INTERACTIVE_ACTIVITY_ARCHITECTURE.md)）；**練習**＝練習類型；**缺口**＝需要但本課程沒有教的背景（見 [LEARNING_PATHS](LEARNING_PATHS.md#4-課程缺口)）。

## 已完成的 60 堂（不變）

- **基礎程式島 Programming Fundamentals**：F01 程式與演算法入門、F02 變數與資料型別、F03 輸入與輸出、F04 運算子與運算順序、F05 條件判斷、F06 多重條件與邏輯運算、F07 For 迴圈、F08 While 迴圈、F09 巢狀迴圈、F10 字串基礎、F11 一維陣列、F12 二維陣列、F13 函式基礎、F14 參數與回傳值、F15 變數作用域、F16 字串與陣列操作、F17 基本除錯技巧、F18 遞迴入門、F19 時間與空間複雜度入門、F20 基礎程式島綜合挑戰
- **資料結構島 Data Structures**：D01 資料結構概論、D02 Array 與 Dynamic Array、D03 String Processing、D04 Linked List、D05 Stack、D06 Queue、D07 Deque、D08 Set、D09 Map / Dictionary、D10 Hash Table、D11 Tree 基礎、D12 Binary Tree、D13 Tree Traversal、D14 Binary Search Tree、D15 Heap / Priority Queue、D16 Graph 基礎、D17 Adjacency List / Matrix、D18 Disjoint Set Union、D19 資料結構選型與複雜度、D20 資料結構島綜合挑戰
- **演算法島 Algorithms**：A01 演算法分析、A02 Simulation、A03 Linear Search、A04 Binary Search、A05 Bubble / Selection / Insertion Sort、A06 Merge Sort、A07 Quick Sort、A08 Two Pointers、A09 Sliding Window、A10 Prefix Sum、A11 Recursion 與分治、A12 Backtracking、A13 Greedy、A14 BFS、A15 DFS、A16 Graph Shortest Path、A17 Dynamic Programming 入門、A18 Knapsack 基礎、A19 APCS 題型分析與解題策略、A20 演算法島綜合試煉

## Region A — Computer Science（新增 100 堂）

### PL — 程式語言島（Programming Languages，`programming-languages`，20 堂）

以 C++／Java／Python／JavaScript 對照，探討程式語言「為什麼這樣設計、底下怎麼運作」：典範、型別、記憶體、作用域與閉包、語法分析到直譯／編譯、執行環境與 GC、並行模型與語言設計取捨。不重教基礎語法（屬基礎程式島），也不深入作業系統與資料庫內部。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| PL01 | 程式設計典範<br><small>Programming Paradigms · `programming-paradigms`</small> | 入門 | F13 | F01、F16 | `variable-state` | code |
| PL02 | 物件導向：封裝、繼承與介面<br><small>Object-Oriented Programming: Encapsulation, Inheritance, and Interfaces · `object-oriented-programming`</small> | 入門 | PL01、F14 | D01 | `memory-model` | code |
| PL03 | 函數式程式設計<br><small>Functional Programming · `functional-programming`</small> | 入門 | PL01、F18 | F16 | `function-call` | code |
| PL04 | 型別系統<br><small>Type Systems · `type-systems`</small> | 中級 | PL01、F02 | F14 | `type-checker` | code |
| PL05 | 泛型與多型<br><small>Generics and Polymorphism · `generics-and-polymorphism`</small> | 中級 | PL02、PL04 | D02、D09 | `type-checker` | code |
| PL06 | 名稱綁定、作用域鏈與閉包<br><small>Binding, Scope Chains, and Closures · `binding-scope-and-closures`</small> | 中級 | PL03、F15 | D05 | `scope-chain` | code |
| PL07 | 記憶體模型：堆疊與堆積<br><small>Memory Models: Stack and Heap · `memory-models`</small> | 中級 | PL04、F14 | F18、D04、D05 | `memory-model` | code |
| PL08 | 記憶體管理與垃圾回收<br><small>Memory Management and Garbage Collection · `memory-management-and-gc`</small> | 中級 | PL07 | D16、A15 | `gc-visualizer` | simulation |
| PL09 | 錯誤處理模型<br><small>Error Handling Models · `error-handling-models`</small> | 中級 | PL02、PL07 | PL08、F17 | `function-call` | code |
| PL10 | 詞法分析：從字元到 Token<br><small>Lexical Analysis: From Characters to Tokens · `lexical-analysis`</small> | 中級 | PL01、D03 | F10、PL04 | `compiler-pipeline` | code |
| PL11 | 語法分析與抽象語法樹<br><small>Parsing and Abstract Syntax Trees · `parsing-and-ast`</small> | 中級 | PL10、D13 | F04、F18、D05 | `ast-explorer` | code |
| PL12 | 直譯器：走訪 AST 求值<br><small>Tree-Walking Interpreters · `tree-walking-interpreters`</small> | 中級 | PL11、PL06 | D09、A15 | `ast-explorer` | code |
| PL13 | 並行模型<br><small>Concurrency Models · `concurrency-models`</small> | 中級 | PL07 | PL06、D06 | `concurrency-timeline` | simulation |
| PL14 | 執行緒與同步<br><small>Threads and Synchronization · `threads-and-synchronization`</small> | 進階 | PL13 | PL09、D06 | `concurrency-timeline` | code |
| PL15 | 非同步：Promise、async／await 與事件迴圈<br><small>Async Programming: Promises, async/await, and Event Loops · `async-await-and-event-loops`</small> | 進階 | PL13、PL06 | PL14、D06 | `concurrency-timeline` | code |
| PL16 | 編譯流程與中間表示<br><small>The Compiler Pipeline and Intermediate Representations · `compiler-pipeline-and-ir`</small> | 進階 | PL12、PL04 | D17、PL07 | `compiler-pipeline` | analysis |
| PL17 | 虛擬機、位元組碼與 JIT<br><small>Virtual Machines, Bytecode, and JIT Compilation · `virtual-machines-bytecode-and-jit`</small> | 進階 | PL16、PL08 | D05、A01 | `stack-queue` | simulation |
| PL18 | 超程式設計與反射<br><small>Metaprogramming and Reflection · `metaprogramming-and-reflection`</small> | 進階 | PL11、PL05 | PL02、PL12 | `ast-explorer` | code |
| PL19 | 語言設計取捨<br><small>Language Design Trade-offs · `language-design-tradeoffs`</small> | 進階 | PL05、PL08、PL13 | PL09、PL15、PL17 | `case-study-board` | analysis |
| PL20 | 程式語言島綜合挑戰：打造迷你語言<br><small>Programming Languages Capstone: Build a Mini Language · `programming-languages-capstone`</small> | 進階 | PL12、PL19 | PL16、PL17、PL18 | `challenge-stages` | code |

<details><summary>學習目標、核心概念與成果</summary>

- **PL01 程式設計典範** — 目標：區分命令式、程序式、物件導向、函數式與邏輯式典範的核心想法；將同一個問題分別以命令式與函數式風格改寫並比較差異；辨識 C++、Java、Python、JavaScript 各自支援的典範組合；說明宣告式與命令式寫法在可讀性與可變狀態上的取捨。概念：命令式、宣告式、物件導向、函數式、邏輯式、多典範語言。成果：學完後能看懂一段程式屬於哪種典範，並把一個迴圈累加改寫成 map／filter／reduce 風格。
- **PL02 物件導向：封裝、繼承與介面** — 目標：以類別與物件封裝狀態與行為，並設定適當的存取權限；比較 C++、Java、Python、JavaScript 的繼承與介面（含 prototype）機制；追蹤動態分派（virtual／override）在執行時選到哪個方法；判斷何時該用組合而非繼承。概念：封裝、繼承、介面與抽象類別、動態分派、prototype、組合優於繼承。成果：學完後能用四種語言各寫出一組介面與實作類別，並正確預測多型呼叫的結果。
- **PL03 函數式程式設計** — 目標：說明純函式、不可變資料與副作用的意義；使用高階函式 map、filter、reduce 與 lambda 處理資料；把含可變狀態的迴圈重構為無副作用的函式組合；比較遞迴與 reduce 兩種寫法並指出各自的限制。概念：純函式、不可變性、高階函式、lambda、函式組合、副作用。成果：學完後能用高階函式寫出無副作用的資料處理流程，並說明它比迴圈版本好測試在哪裡。
- **PL04 型別系統** — 目標：區分靜態／動態型別與強／弱型別兩條不同的軸；比較名義型別與結構型別，並以 TypeScript 與 Java 舉例；追蹤型別推論如何從表達式推出變數型別；找出隱式轉型造成的錯誤並改寫為型別安全的程式。概念：靜態與動態型別、強與弱型別、型別推論、名義與結構型別、隱式轉型、型別標註。成果：學完後能預測一段程式在四種語言中是編譯期錯誤、執行期錯誤還是悄悄轉型，並說出原因。
- **PL05 泛型與多型** — 目標：區分參數多型、子型別多型與特設多型（多載）；以 Java 泛型、C++ 模板、Python typing 與 TypeScript 泛型寫出通用容器函式；說明型別擦除與模板實例化的差異及其代價；使用型別約束（bounded type、concepts、Protocol）限制泛型參數。概念：參數多型、子型別多型、多載、型別擦除、模板實例化、型別約束。成果：學完後能寫出一個帶約束的泛型函式，並解釋同一段泛型程式在 Java 與 C++ 中被如何處理。
- **PL06 名稱綁定、作用域鏈與閉包** — 目標：區分詞法作用域與動態作用域，並畫出作用域鏈；追蹤閉包如何捕捉外層變數並延長其生命週期；辨識 JavaScript var／let 與 Python late binding 在迴圈中的陷阱；比較 C++ lambda 的值捕捉與參考捕捉。概念：名稱綁定、詞法作用域、作用域鏈、閉包、捕捉、hoisting。成果：學完後能在作用域鏈圖上指出每個名稱解析到哪個綁定，並修正迴圈中閉包捕捉錯值的 bug。
- **PL07 記憶體模型：堆疊與堆積** — 目標：畫出函式呼叫時堆疊框架與堆積物件的配置；區分值型別、參考型別與指標，並預測複製與修改的結果；比較 C++、Java、Python、JavaScript 的物件存放與參數傳遞方式；辨識懸空指標、記憶體洩漏與越界存取等錯誤。概念：堆疊框架、堆積、值與參考、指標、物件生命週期、懸空指標。成果：學完後能為一段四語言對照程式畫出堆疊與堆積狀態，並準確預測修改後誰會受影響。
- **PL08 記憶體管理與垃圾回收** — 目標：比較手動管理、RAII／智慧指標、參考計數與追蹤式 GC；模擬 mark-and-sweep 從根集合標記可達物件的過程；說明循環參考為何讓參考計數失效，以及 Python 如何補救；解釋世代式 GC 的假設與停頓（pause）對程式的影響。概念：RAII、智慧指標、參考計數、mark-and-sweep、世代式 GC、可達性。成果：學完後能在物件圖上標出哪些物件會被回收，並說明 C++、Java、Python、JavaScript 各自的回收策略。
- **PL09 錯誤處理模型** — 目標：比較例外、錯誤碼與 Result／Optional 等錯誤表示方式；追蹤例外拋出後的堆疊回溯與 finally／RAII 清理順序；區分 Java checked 與 unchecked 例外的設計用意；為一段程式設計清楚的錯誤邊界與資源釋放流程。概念：例外、堆疊回溯、finally 與 RAII、checked exception、Result 型別、錯誤邊界。成果：學完後能預測例外穿過多層呼叫時哪些清理程式會執行，並選擇適合情境的錯誤處理方式。
- **PL10 詞法分析：從字元到 Token** — 目標：說明編譯／直譯流程中詞法分析器的角色；定義關鍵字、識別字、數字、運算子等 token 類別；以狀態轉移方式寫出一個小型 lexer；處理空白、註解與非法字元並回報位置。概念：token、lexer、最長匹配、有限狀態機、正規表示式、錯誤位置。成果：學完後能寫出把算式字串切成 token 串列的 lexer，並對非法字元給出含行列號的錯誤訊息。
- **PL11 語法分析與抽象語法樹** — 目標：閱讀以 BNF／EBNF 描述的簡單文法；以遞迴下降法把 token 串列解析成 AST；用文法層次處理運算子優先順序與結合性；比較具體語法樹與 AST，並辨識語法歧義。概念：文法、BNF、遞迴下降、AST、優先順序與結合性、語法歧義。成果：學完後能寫出四則運算的遞迴下降解析器，並在 AST 上看出 1 + 2 * 3 為何先乘後加。
- **PL12 直譯器：走訪 AST 求值** — 目標：以後序走訪 AST 對表達式求值；用環境（environment）表實作變數綁定與巢狀作用域；為小語言加入 if、while 與函式呼叫的求值規則；比較直譯與編譯在啟動速度、執行速度與除錯上的差異。概念：求值、環境、AST 走訪、直譯與編譯、執行期錯誤、REPL。成果：學完後能讓自己的小語言執行含變數、條件與迴圈的程式，並說明每一步環境如何改變。
- **PL13 並行模型** — 目標：區分並行（concurrency）與平行（parallelism）；比較共享記憶體執行緒、事件迴圈非同步與 actor／訊息傳遞三種模型；在時間軸上重現競爭條件並說明交錯執行的結果；說明 Python GIL、JavaScript 單執行緒事件迴圈與 Java 執行緒的差異。概念：並行與平行、執行緒、事件迴圈、actor 模型、競爭條件、GIL。成果：學完後能看懂兩個執行緒交錯的時間軸，找出競爭條件，並為情境選擇合適的並行模型。　缺口：operating-systems
- **PL14 執行緒與同步** — 目標：使用互斥鎖、原子操作保護共享資料；辨識死結的四個條件並以固定鎖順序避免死結；使用條件變數或阻塞佇列實作生產者—消費者；比較 C++ std::thread、Java synchronized／虛擬執行緒與 Python threading 的寫法。概念：互斥鎖、原子操作、死結、條件變數、生產者—消費者、執行緒安全。成果：學完後能修好一個有競爭條件的計數器，並寫出不會死結的生產者—消費者程式。　缺口：operating-systems
- **PL15 非同步：Promise、async／await 與事件迴圈** — 目標：追蹤 JavaScript 事件迴圈中呼叫堆疊、任務佇列與微任務的執行順序；以 Promise／Future 與 async／await 改寫回呼式程式；說明 generator 與協程如何讓函式暫停與恢復；比較 JavaScript、Python asyncio 與 Java CompletableFuture 的非同步模型。概念：事件迴圈、微任務、Promise／Future、async／await、協程、generator。成果：學完後能準確預測混合 setTimeout、Promise 與 await 的程式輸出順序，並寫出並發等待多個工作的非同步函式。
- **PL16 編譯流程與中間表示** — 目標：說明前端、中端、後端各階段的輸入與輸出；描述語意分析（名稱解析、型別檢查）在 AST 上做的事；把簡單表達式轉成三位址碼並畫出控制流程圖；舉例說明常數折疊、死碼消除等最佳化。概念：語意分析、中間表示、三位址碼、控制流程圖、最佳化、程式碼產生。成果：學完後能把一小段程式手動走過編譯流程，寫出其三位址碼並指出可以做的最佳化。
- **PL17 虛擬機、位元組碼與 JIT** — 目標：模擬堆疊式虛擬機逐條執行位元組碼；比較 JVM、CPython、V8 從原始碼到執行的路徑；說明 JIT 如何依熱點與型別回饋產生機器碼，以及何時會去最佳化；分析 AOT 編譯、直譯與 JIT 在啟動時間與峰值效能上的取捨。概念：位元組碼、堆疊式 VM、JIT、熱點、去最佳化、AOT。成果：學完後能手動執行一段位元組碼並說明 Java、Python、JavaScript 程式真正被執行的方式。
- **PL18 超程式設計與反射** — 目標：使用反射在執行期檢查類別、欄位與方法；撰寫 Python 裝飾器與 Java 註解，為函式加上共通行為；說明 C++ 模板與 constexpr 如何在編譯期產生程式；評估 JavaScript Proxy 等動態機制對可讀性與效能的影響。概念：反射、裝飾器、註解、編譯期計算、Proxy、程式產生程式。成果：學完後能寫出一個計時／記錄用的裝飾器或註解處理，並說明它在何時被套用。
- **PL19 語言設計取捨** — 目標：從安全性、效能、表達力與學習成本比較四種語言的設計選擇；分析 null 處理、可變性預設與記憶體管理等設計決策的後果；為指定專案情境選擇語言並寫出理由；閱讀語言新版本特性並判斷它解決了什麼問題。概念：安全與效能、表達力、null 安全、預設不可變、生態系、向後相容。成果：學完後能針對一個專案情境寫出有根據的語言選型分析，指出每個選項的代價。
- **PL20 程式語言島綜合挑戰：打造迷你語言** — 目標：整合 lexer、parser 與直譯器完成一個含變數、函式與閉包的迷你語言；為迷你語言加入基本型別檢查與清楚的錯誤訊息；以測試程式驗證作用域、遞迴與錯誤處理行為；說明自己的語言做了哪些設計取捨。概念：綜合應用、語言實作、型別檢查、測試、設計取捨。成果：學完後能交出一個可執行遞迴函式與閉包的迷你語言直譯器，並以測試證明其行為正確。

</details>

### DB — 資料庫應用島（Database Applications，`databases`，20 堂）

從關聯式模型與 SQL 查詢出發，學會 ER 建模、正規化、索引與查詢計畫、交易與並行控制，再到程式串接資料庫、SQL injection 防護、NoSQL 與備份複寫。著重應用與設計，不做資料庫引擎內部研究；企業系統與商業智慧的管理面向屬管理資訊系統島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| DB01 | 資料庫與 DBMS 概念<br><small>Databases and DBMS Concepts · `database-concepts`</small> | 入門 | F11 | D09、F03 | `sql-playground` | sql |
| DB02 | 關聯式模型：表、鍵與關聯代數<br><small>The Relational Model: Tables, Keys, and Relational Algebra · `relational-model`</small> | 入門 | DB01 | D08 | `sql-playground` | analysis |
| DB03 | 用 SELECT 查詢資料<br><small>Querying with SELECT · `sql-select-queries`</small> | 入門 | DB02 | F06 | `sql-playground` | sql |
| DB04 | 彙總函式與 GROUP BY<br><small>Aggregation and GROUP BY · `sql-aggregation-and-grouping`</small> | 入門 | DB03 | D09 | `sql-playground` | sql |
| DB05 | 多表查詢：JOIN<br><small>Multi-Table Queries with JOIN · `sql-joins`</small> | 中級 | DB03 | DB02、DB04 | `sql-playground` | sql |
| DB06 | 子查詢、CTE 與視窗函式<br><small>Subqueries, CTEs, and Window Functions · `sql-subqueries-ctes-and-window-functions`</small> | 中級 | DB04、DB05 | F18 | `sql-playground` | sql |
| DB07 | 建立與修改資料：DDL、DML 與約束<br><small>Defining and Changing Data: DDL, DML, and Constraints · `sql-ddl-dml-and-constraints`</small> | 中級 | DB03 | DB02、F02 | `sql-playground` | sql |
| DB08 | ER 模型<br><small>Entity-Relationship Modeling · `er-modeling`</small> | 中級 | DB02 | DB07、D16 | `erd-builder` | diagram |
| DB09 | 從 ER 圖到資料表綱要<br><small>Mapping ER Diagrams to Relational Schemas · `er-to-relational-mapping`</small> | 中級 | DB08、DB07 | DB05 | `erd-builder` | design |
| DB10 | 正規化<br><small>Normalization · `normalization`</small> | 中級 | DB09 | DB05 | `normalization-steps` | design |
| DB11 | 索引與 B+ 樹<br><small>Indexes and B+ Trees · `database-indexes`</small> | 中級 | DB03、D14 | D10、A04、DB07 | `query-plan` | sql |
| DB12 | 查詢計畫與效能調校<br><small>Query Plans and Performance Tuning · `query-plans-and-optimization`</small> | 進階 | DB11、DB05 | A01、DB06 | `query-plan` | analysis |
| DB13 | 檢視表、預存程序與觸發器<br><small>Views, Stored Procedures, and Triggers · `views-and-stored-procedures`</small> | 中級 | DB07、DB06 | F13 | `sql-playground` | sql |
| DB14 | 交易與 ACID<br><small>Transactions and ACID · `transactions-and-acid`</small> | 中級 | DB07 | DB13、PL13 | `transaction-timeline` | simulation |
| DB15 | 隔離等級與並行控制<br><small>Isolation Levels and Concurrency Control · `isolation-levels-and-concurrency-control`</small> | 進階 | DB14 | PL14、DB11 | `transaction-timeline` | simulation |
| DB16 | 程式串接資料庫與 ORM<br><small>Database Application Programming and ORMs · `database-application-programming`</small> | 中級 | DB07、PL02 | DB05、DB14、PL09 | `protocol-sequence` | code |
| DB17 | SQL Injection 與資料庫安全<br><small>SQL Injection and Database Security · `sql-injection-and-database-security`</small> | 中級 | DB16 | DB13 | `sql-playground` | code |
| DB18 | NoSQL 資料模型<br><small>NoSQL Data Models · `nosql-data-models`</small> | 中級 | DB10 | D09、D16、DB14 | `ds-comparison` | design |
| DB19 | 備份、複寫與擴展<br><small>Backup, Replication, and Scaling · `backup-replication-and-scaling`</small> | 進階 | DB14 | DB15、DB18 | `architecture-diagram` | case-study |
| DB20 | 資料庫應用島綜合挑戰：設計並實作資料庫系統<br><small>Database Applications Capstone: Design and Build a Database-Backed System · `database-applications-capstone`</small> | 進階 | DB10、DB12、DB17 | DB15、DB18、DB19 | `challenge-stages` | sql |

<details><summary>學習目標、核心概念與成果</summary>

- **DB01 資料庫與 DBMS 概念** — 目標：說明以檔案存資料與使用 DBMS 的差異；區分資料、綱要（schema）與實例，並說明資料獨立性；列出 DBMS 提供的查詢、並行、復原與權限等功能；在 SQL 練習場執行第一個查詢並讀懂結果表。概念：資料庫、DBMS、綱要與實例、資料獨立性、關聯式與 NoSQL、SQL。成果：學完後能說明為何應用程式需要 DBMS，並在練習場對一張表執行簡單查詢。
- **DB02 關聯式模型：表、鍵與關聯代數** — 目標：以關聯、屬性、值域與元組描述一張表；辨識超鍵、候選鍵、主鍵與外鍵；以選擇、投影、合併等關聯代數運算推算查詢結果；說明實體完整性與參考完整性。概念：關聯、元組與屬性、主鍵、外鍵、關聯代數、參考完整性。成果：學完後能在兩張表上標出主鍵與外鍵，並手算選擇、投影與合併的結果。
- **DB03 用 SELECT 查詢資料** — 目標：使用 SELECT、FROM、WHERE 取出指定欄位與資料列；組合比較運算、AND／OR、IN、BETWEEN、LIKE 撰寫條件；以 ORDER BY、LIMIT 與 DISTINCT 排序並裁切結果；正確處理 NULL 與 IS NULL 的判斷。概念：SELECT、WHERE、ORDER BY、LIMIT、DISTINCT、NULL。成果：學完後能依文字需求寫出含條件、排序與筆數限制的 SELECT 查詢。
- **DB04 彙總函式與 GROUP BY** — 目標：使用 COUNT、SUM、AVG、MIN、MAX 計算統計值；以 GROUP BY 分組並以 HAVING 篩選分組結果；區分 WHERE 與 HAVING 的執行時機；說明 NULL 對 COUNT 與 AVG 的影響。概念：彙總函式、GROUP BY、HAVING、WHERE 與 HAVING、COUNT(*) 與 COUNT(欄位)。成果：學完後能寫出「每個類別的平均值且只列出超過門檻者」這類分組查詢。
- **DB05 多表查詢：JOIN** — 目標：使用 INNER JOIN 依外鍵合併兩張以上的表；比較 LEFT、RIGHT、FULL OUTER JOIN 對未配對資料列的處理；撰寫自我合併並使用表別名；找出 JOIN 條件遺漏造成的笛卡兒積錯誤。概念：INNER JOIN、OUTER JOIN、自我合併、表別名、笛卡兒積。成果：學完後能從訂單、顧客、商品三張表查出指定報表，並解釋 LEFT JOIN 結果中 NULL 的來源。
- **DB06 子查詢、CTE 與視窗函式** — 目標：撰寫純量、IN 與 EXISTS 子查詢，並區分相關與非相關子查詢；以 WITH 建立 CTE 拆解複雜查詢，並認識遞迴 CTE；使用 ROW_NUMBER、RANK 與 OVER (PARTITION BY) 計算排名與累計值；把同一需求分別以子查詢與 JOIN 寫出並比較可讀性。概念：子查詢、相關子查詢、EXISTS、CTE、遞迴 CTE、視窗函式。成果：學完後能寫出「每個部門薪資前三名」等需要子查詢或視窗函式的查詢。
- **DB07 建立與修改資料：DDL、DML 與約束** — 目標：以 CREATE TABLE 定義欄位型別、主鍵與外鍵；使用 NOT NULL、UNIQUE、CHECK、DEFAULT 等約束保護資料品質；以 INSERT、UPDATE、DELETE 修改資料並預測影響列數；設定外鍵的 ON DELETE／ON UPDATE 行為並以 ALTER TABLE 調整綱要。概念：DDL、DML、約束、外鍵動作、ALTER TABLE、資料型別。成果：學完後能建立一組有約束的表，並說明一筆違反約束的 INSERT 為何被拒絕。
- **DB08 ER 模型** — 目標：從情境描述中找出實體、屬性與關係；標示一對一、一對多、多對多的基數與參與限制；辨識弱實體、多值屬性與關係上的屬性；以 Chen 或 Crow's Foot 表示法畫出 ER 圖。概念：實體、屬性、關係、基數、弱實體、Crow's Foot。成果：學完後能把一段圖書館或選課系統的需求描述畫成正確標示基數的 ER 圖。
- **DB09 從 ER 圖到資料表綱要** — 目標：將實體與屬性轉換成資料表與欄位；依一對多與多對多關係放置外鍵或建立中介表；處理弱實體、多值屬性與一對一關係的轉換；寫出對應的 CREATE TABLE 敘述並驗證能支援需求查詢。概念：綱要轉換、中介表、複合主鍵、外鍵放置、代理鍵。成果：學完後能把自己畫的 ER 圖轉成可執行的 DDL，並用 JOIN 查詢驗證設計可用。
- **DB10 正規化** — 目標：辨識插入、更新、刪除異常；從資料找出函數相依並判斷候選鍵；將表逐步分解到 1NF、2NF、3NF 與 BCNF；說明何時為了查詢效能刻意反正規化。概念：資料異常、函數相依、1NF／2NF／3NF、BCNF、無損分解、反正規化。成果：學完後能把一張充滿重複資料的表分解到 3NF，並說明每一步消除了哪種異常。
- **DB11 索引與 B+ 樹** — 目標：說明索引如何把全表掃描變成樹狀搜尋；從 BST 延伸理解 B+ 樹的節點分支、葉節點鏈結與範圍查詢；比較 B+ 樹索引與雜湊索引適用的查詢；依查詢條件設計單欄與複合索引，並說明欄位順序的影響。概念：索引、B+ 樹、範圍查詢、雜湊索引、複合索引、寫入成本。成果：學完後能為一組常用查詢建立合適索引，並說明哪些查詢用得到、哪些用不到。
- **DB12 查詢計畫與效能調校** — 目標：使用 EXPLAIN 讀懂查詢計畫中的掃描方式與合併演算法；比較巢狀迴圈、雜湊與合併三種 JOIN 執行方式的成本；找出讓索引失效的寫法（函式包欄位、前綴萬用字元等）並改寫；以實際測量驗證調校前後的效能差異。概念：EXPLAIN、查詢最佳化器、掃描方式、JOIN 演算法、選擇性、統計資訊。成果：學完後能從 EXPLAIN 輸出指出慢查詢的瓶頸，並提出改寫或索引方案。
- **DB13 檢視表、預存程序與觸發器** — 目標：建立檢視表封裝常用查詢並限制可見欄位；撰寫帶參數的預存程序或函式；以觸發器實作稽核紀錄等自動行為；評估把商業邏輯放在資料庫或應用程式的取捨。概念：VIEW、具體化檢視表、預存程序、觸發器、稽核紀錄。成果：學完後能用檢視表與觸發器做出一個自動記錄異動的報表功能，並說明它的維護代價。
- **DB14 交易與 ACID** — 目標：以 BEGIN、COMMIT、ROLLBACK 把多個操作包成一筆交易；以轉帳情境說明原子性、一致性、隔離性與持久性；說明 write-ahead log 如何支援當機後的復原；使用 SAVEPOINT 處理部分回滾。概念：交易、COMMIT／ROLLBACK、ACID、write-ahead log、SAVEPOINT、自動提交。成果：學完後能在時間軸上判斷交易在任一步失敗或當機時資料會變成什麼狀態。
- **DB15 隔離等級與並行控制** — 目標：重現髒讀、不可重複讀、幻讀與遺失更新；比較四種 SQL 隔離等級能防止的異常；說明鎖（共享／排他、兩階段鎖）與 MVCC 快照的運作；以 SELECT … FOR UPDATE 或樂觀鎖修正並發更新錯誤。概念：隔離等級、讀取異常、兩階段鎖、MVCC、死結偵測、樂觀鎖。成果：學完後能看懂兩筆交易交錯的時間軸，指出會發生哪種異常，並選擇足夠的隔離等級。
- **DB16 程式串接資料庫與 ORM** — 目標：使用 Python、Java、JavaScript 的資料庫驅動程式連線並執行參數化查詢；在程式中正確開啟、提交與回滾交易並釋放連線；以 ORM 對映類別與資料表，並讀懂它產生的 SQL；辨識並修正 N+1 查詢問題，說明連線池的用途。概念：資料庫驅動、參數化查詢、ORM、N+1 查詢、連線池、資料庫遷移。成果：學完後能寫出一段以交易安全地新增訂單的程式，並把 N+1 查詢改成單次 JOIN。
- **DB17 SQL Injection 與資料庫安全** — 目標：說明字串拼接 SQL 如何讓輸入改變查詢語意；以參數化查詢與 ORM 安全 API 修正有漏洞的程式；使用 GRANT／REVOKE 與角色落實最小權限；列出密碼雜湊、敏感欄位加密與稽核等資料保護做法。概念：SQL injection、參數化查詢、最小權限、GRANT／REVOKE、密碼雜湊、稽核。成果：學完後能在練習場看出一個登入查詢為何被繞過，並以參數化查詢與權限設定修好它。
- **DB18 NoSQL 資料模型** — 目標：比較鍵值、文件、寬欄與圖形資料庫的資料模型；依存取模式設計文件結構，判斷該內嵌或參照；說明 CAP 取捨與最終一致性的意義；為指定情境選擇關聯式或某類 NoSQL 並說明理由。概念：鍵值資料庫、文件資料庫、寬欄資料庫、圖形資料庫、CAP、最終一致性。成果：學完後能把同一份資料分別設計成關聯表與 JSON 文件，並依查詢需求說明哪一種較合適。
- **DB19 備份、複寫與擴展** — 目標：比較完整、增量與時間點復原等備份策略，並以 RPO／RTO 評估；說明主從複寫、讀寫分離與複寫延遲造成的讀取問題；區分垂直擴展、分割與分片，並指出分片鍵選擇的影響；為一個成長中的應用規劃備份與擴展方案。概念：備份與還原、RPO／RTO、複寫、讀寫分離、分割與分片、高可用。成果：學完後能為指定的服務情境寫出備份、複寫與擴展計畫，並說明遇到故障時如何還原。　缺口：cloud-platforms
- **DB20 資料庫應用島綜合挑戰：設計並實作資料庫系統** — 目標：從需求畫出 ER 圖並轉成符合 3NF 的綱要；撰寫支援主要功能的查詢、檢視表與交易；依查詢計畫加上索引並量測效能；以參數化查詢與權限設定完成安全的程式串接。概念：綜合應用、需求到綱要、查詢與交易、索引調校、安全串接。成果：學完後能交出一個從 ER 圖到可執行查詢、索引與安全串接程式的完整資料庫應用。

</details>

### CN — 計算機網路島（Computer Networks，`networks`，20 堂）

沿著分層模型由下而上：實體與鏈結層、IP 位址與子網路、路由、TCP／UDP 與壅塞控制，再到 DNS、HTTP／HTTPS／TLS、REST API、socket 與即時通訊、CDN、網路安全與除錯工具，最後追蹤一個完整的網頁請求。著重協定原理與實作觀察；系統架構設計屬系統分析與設計島，資安管理與風險面向屬管理資訊系統島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| CN01 | 網路分層模型<br><small>Network Layer Models · `network-layer-models`</small> | 入門 | F01 | — | `packet-journey` | diagram |
| CN02 | 實體層與網路效能：頻寬、延遲與吞吐量<br><small>The Physical Layer and Network Performance: Bandwidth, Latency, and Throughput · `physical-layer-and-network-performance`</small> | 入門 | CN01 | F04 | `packet-journey` | calculation |
| CN03 | 資料鏈結層、Ethernet 與交換器<br><small>The Data Link Layer, Ethernet, and Switches · `data-link-layer-and-ethernet`</small> | 入門 | CN01 | CN02、D10 | `routing-table` | simulation |
| CN04 | Wi-Fi 與行動網路基礎<br><small>Wi-Fi and Mobile Network Basics · `wireless-and-mobile-networks`</small> | 入門 | CN03 | CN02 | `protocol-sequence` | analysis |
| CN05 | IP 位址與子網路<br><small>IP Addressing and Subnets · `ip-addressing-and-subnets`</small> | 中級 | CN01 | F04 | `subnet-calculator` | calculation |
| CN06 | ARP、DHCP 與 NAT<br><small>ARP, DHCP, and NAT · `arp-dhcp-and-nat`</small> | 中級 | CN05、CN03 | D09 | `protocol-sequence` | simulation |
| CN07 | 路由與轉送<br><small>Routing and Forwarding · `routing-and-forwarding`</small> | 中級 | CN05 | CN06、D17 | `routing-table` | calculation |
| CN08 | 路由協定：距離向量與鏈路狀態<br><small>Routing Protocols: Distance Vector and Link State · `routing-protocols`</small> | 進階 | CN07、A16 | D17、A14 | `graph-traversal` | simulation |
| CN09 | TCP 與 UDP<br><small>TCP and UDP · `tcp-and-udp`</small> | 中級 | CN05 | CN06、D06 | `protocol-sequence` | analysis |
| CN10 | TCP 可靠傳輸、流量控制與壅塞控制<br><small>TCP Reliability, Flow Control, and Congestion Control · `tcp-flow-and-congestion-control`</small> | 進階 | CN09 | A09、CN02 | `protocol-sequence` | simulation |
| CN11 | Socket 網路程式設計<br><small>Socket Programming · `socket-programming`</small> | 中級 | CN09 | PL13、PL15、PL09 | `protocol-sequence` | code |
| CN12 | DNS 與 HTTP<br><small>DNS and HTTP · `dns-and-http`</small> | 中級 | CN09 | CN11、D11 | `packet-journey` | analysis |
| CN13 | HTTPS 與 TLS<br><small>HTTPS and TLS · `https-and-tls`</small> | 進階 | CN12 | CN09 | `protocol-sequence` | analysis |
| CN14 | REST API 與 JSON<br><small>REST APIs and JSON · `rest-apis-and-json`</small> | 中級 | CN12 | D09、PL04、DB16 | `protocol-sequence` | code |
| CN15 | 快取、CDN 與 HTTP/2、HTTP/3<br><small>Caching, CDNs, and HTTP/2 and HTTP/3 · `web-caching-cdn-and-modern-http`</small> | 中級 | CN12 | CN13、CN14 | `architecture-diagram` | calculation |
| CN16 | WebSocket 與即時通訊<br><small>WebSockets and Real-Time Communication · `websockets-and-real-time-communication`</small> | 中級 | CN11、CN12 | PL15、CN14 | `protocol-sequence` | code |
| CN17 | 網路除錯工具<br><small>Network Troubleshooting Tools · `network-troubleshooting-tools`</small> | 中級 | CN07、CN12 | F17、CN06、CN10 | `packet-journey` | analysis |
| CN18 | 網路安全基礎<br><small>Network Security Basics · `network-security-basics`</small> | 中級 | CN13 | CN06、DB17 | `packet-journey` | analysis |
| CN19 | 防火牆、VPN 與零信任<br><small>Firewalls, VPNs, and Zero Trust · `firewalls-vpns-and-zero-trust`</small> | 進階 | CN18、CN07 | CN06、CN17 | `routing-table` | config |
| CN20 | 計算機網路島綜合挑戰：追蹤並打造一個網路服務<br><small>Computer Networks Capstone: Trace and Build a Networked Service · `networks-capstone`</small> | 進階 | CN14、CN17、CN18 | CN11、CN15、CN19 | `challenge-stages` | code |

<details><summary>學習目標、核心概念與成果</summary>

- **CN01 網路分層模型** — 目標：說明網路為何分層，以及每層只依賴下一層服務的好處；對照 OSI 七層與 TCP/IP 四層模型並舉出各層代表協定；追蹤資料由上而下封裝、由下而上解封裝的過程；區分訊框、封包、區段等各層資料單位。概念：分層、OSI 模型、TCP/IP 模型、封裝與解封裝、協定、PDU。成果：學完後能畫出一個 HTTP 請求從應用層往下封裝成訊框的過程，並標出每層加上的標頭。
- **CN02 實體層與網路效能：頻寬、延遲與吞吐量** — 目標：說明位元如何以電、光與無線電訊號在不同媒介上傳送；區分頻寬、吞吐量與延遲，並計算傳輸延遲與傳播延遲；計算頻寬延遲乘積並解釋它代表的「管線容量」；比較雙絞線、光纖與無線媒介的特性與用途。概念：訊號與媒介、頻寬、延遲、吞吐量、頻寬延遲乘積、RTT。成果：學完後能算出一個檔案在指定頻寬與距離下的總傳送時間，並說明瓶頸在哪裡。
- **CN03 資料鏈結層、Ethernet 與交換器** — 目標：說明訊框的結構與 MAC 位址的用途；以檢查碼與 CRC 說明錯誤偵測的概念；模擬交換器學習 MAC 位址表並決定轉送或廣播；區分集線器、交換器與路由器的工作層級，並認識 VLAN。概念：訊框、MAC 位址、錯誤偵測、Ethernet、交換器學習、VLAN。成果：學完後能依一串訊框到達順序填出交換器的 MAC 位址表，並預測每個訊框被送往哪些連接埠。
- **CN04 Wi-Fi 與行動網路基礎** — 目標：說明 Wi-Fi 的基地台、SSID 與頻段（2.4／5／6 GHz）概念；比較 Ethernet 的 CSMA/CD 與 Wi-Fi 的 CSMA/CA，並說明隱藏終端問題；描述行動網路中基地台、核心網路與換手的角色；分析訊號強度、干擾與距離對無線效能的影響。概念：Wi-Fi、CSMA/CA、隱藏終端、頻段與通道、行動網路、換手。成果：學完後能解釋為什麼離基地台遠或人多時 Wi-Fi 會變慢，並提出改善做法。
- **CN05 IP 位址與子網路** — 目標：在二進位與點分十進位之間轉換 IPv4 位址；以 CIDR 與子網路遮罩算出網路位址、廣播位址與可用主機數；將一個位址區塊切割成符合需求的多個子網路；說明私有位址的用途，並讀懂 IPv6 位址的表示法。概念：IPv4、子網路遮罩、CIDR、子網路切割、私有位址、IPv6。成果：學完後能依部門人數把 192.168.10.0/24 切成多個子網路，並寫出每段的範圍。
- **CN06 ARP、DHCP 與 NAT** — 目標：說明 ARP 如何把 IP 位址解析成 MAC 位址；追蹤 DHCP 的 Discover／Offer／Request／Ack 流程；模擬 NAT 轉譯表如何讓多台裝置共用一個公有 IP；判斷同網段與跨網段通訊時封包會先送到哪裡（預設閘道）。概念：ARP、DHCP、NAT、連接埠轉譯、預設閘道、廣播。成果：學完後能說出一台筆電連上網路到送出第一個封包之間發生的 DHCP、ARP 與 NAT 步驟。
- **CN07 路由與轉送** — 目標：區分轉送（data plane）與路由（control plane）；讀懂路由表並以最長前綴匹配選出下一跳；設定靜態路由與預設路由；說明 TTL 如何防止封包在迴圈中無限傳遞。概念：路由表、最長前綴匹配、下一跳、靜態路由、預設路由、TTL。成果：學完後能依路由表判斷任一目的位址的封包會從哪個介面送出。
- **CN08 路由協定：距離向量與鏈路狀態** — 目標：以 Bellman-Ford 概念模擬距離向量路由的收斂；以 Dijkstra 演算法說明鏈路狀態路由（OSPF）如何計算路徑；說明計數到無限問題與其緩解方式；區分自治系統內部路由與 BGP 的跨網域路由。概念：距離向量、鏈路狀態、OSPF、BGP、收斂、自治系統。成果：學完後能在一張網路拓樸上算出每台路由器的路由表，並說明鏈路斷掉後如何重新收斂。
- **CN09 TCP 與 UDP** — 目標：說明連接埠與 socket 位址如何區分同一台主機上的程式；比較 TCP 與 UDP 在連線、可靠性、順序與開銷上的差異；追蹤 TCP 三向交握與四次揮手的序號與旗標；為串流影音、檔案下載、DNS 等情境選擇傳輸協定。概念：連接埠、TCP、UDP、三向交握、序號與 ACK、連線關閉。成果：學完後能看懂一段 TCP 交握的序號變化，並解釋某個應用為何選擇 TCP 或 UDP。
- **CN10 TCP 可靠傳輸、流量控制與壅塞控制** — 目標：以滑動視窗模擬確認、逾時重送與快速重傳；說明接收視窗如何做流量控制；追蹤慢啟動、壅塞避免（AIMD）與遺失後的壅塞視窗變化；區分流量控制與壅塞控制要解決的不同問題。概念：滑動視窗、逾時重送、流量控制、壅塞視窗、慢啟動、AIMD。成果：學完後能依封包遺失事件畫出壅塞視窗隨時間的變化，並說明吞吐量為何下降。
- **CN11 Socket 網路程式設計** — 目標：使用 bind、listen、accept、connect 撰寫 TCP 客戶端與伺服器；撰寫 UDP 收發程式並處理遺失與無序；處理位元組串流的訊息邊界與編碼；以執行緒或非同步方式讓伺服器同時服務多個連線。概念：socket、客戶端與伺服器、bind／listen／accept、訊息框架、位元組編碼、並行伺服器。成果：學完後能寫出可同時服務多個客戶端的回聲伺服器，並正確切出每一則訊息。
- **CN12 DNS 與 HTTP** — 目標：追蹤遞迴解析器經由根、TLD 與權威伺服器解析網域名稱的過程；說明 A、AAAA、CNAME、MX 等紀錄與 TTL 快取；讀懂 HTTP 請求與回應的方法、狀態碼、標頭與本文；說明 Cookie 如何在無狀態的 HTTP 上維持工作階段。概念：DNS 解析、DNS 紀錄、HTTP 方法、狀態碼、標頭、Cookie。成果：學完後能說明在瀏覽器輸入網址到收到 HTML 之間的 DNS 查詢與 HTTP 往返。
- **CN13 HTTPS 與 TLS** — 目標：區分對稱加密、非對稱加密與雜湊各自的用途；說明憑證、CA 與信任鏈如何驗證伺服器身分；追蹤 TLS 1.3 交握中金鑰交換與加密通道建立的步驟；辨識憑證錯誤與混合內容警告代表的風險。概念：對稱與非對稱加密、數位憑證、CA 信任鏈、TLS 1.3 交握、前向保密、HSTS。成果：學完後能看懂瀏覽器的憑證資訊，並說明 HTTPS 保護了什麼、沒保護什麼。
- **CN14 REST API 與 JSON** — 目標：以資源與 HTTP 方法設計符合 REST 風格的 API 路徑；撰寫與解析 JSON，並對應到各語言的資料型別；使用 fetch 或 requests 呼叫 API 並處理狀態碼與錯誤；說明冪等性、分頁、API 金鑰驗證與 CORS 的基本概念。概念：REST、資源與端點、JSON、冪等性、API 驗證、CORS。成果：學完後能設計一組待辦事項 API 的端點，並寫程式呼叫它、解析 JSON 並處理錯誤回應。
- **CN15 快取、CDN 與 HTTP/2、HTTP/3** — 目標：以 Cache-Control、ETag 判斷瀏覽器何時重用快取；說明 CDN 邊緣節點如何降低延遲與來源伺服器負載；計算快取命中率對平均回應時間的影響；比較 HTTP/1.1、HTTP/2 多工與 HTTP/3（QUIC）的改進。概念：HTTP 快取、Cache-Control 與 ETag、CDN、快取命中率、HTTP/2 多工、QUIC。成果：學完後能為靜態與動態資源設定合理的快取標頭，並估算加上 CDN 後的延遲改善。
- **CN16 WebSocket 與即時通訊** — 目標：比較輪詢、長輪詢、Server-Sent Events 與 WebSocket；追蹤 WebSocket 從 HTTP 升級到雙向通道的流程；撰寫一個收發訊息的 WebSocket 客戶端與伺服器；處理斷線重連與心跳檢查。概念：輪詢、長輪詢、Server-Sent Events、WebSocket、協定升級、心跳與重連。成果：學完後能做出一個簡易聊天室，並說明為何選擇 WebSocket 而非輪詢。
- **CN17 網路除錯工具** — 目標：使用 ping 與 traceroute 判斷連通性與延遲出現在哪一跳；使用 nslookup／dig 檢查 DNS 解析結果；使用 curl 與瀏覽器開發者工具檢查 HTTP 請求與回應；閱讀 Wireshark 擷取結果並依分層方法定位問題。概念：ping、traceroute、dig／nslookup、curl、封包擷取、分層除錯。成果：學完後能從工具輸出判斷「網站打不開」是 DNS、路由、連接埠還是應用層的問題。
- **CN18 網路安全基礎** — 目標：以機密性、完整性、可用性分析網路威脅；說明竊聽、中間人、偽冒、DoS／DDoS 等攻擊的原理；對應各種攻擊到加密、驗證、防火牆等防禦措施；辨識釣魚網站與公共 Wi-Fi 的常見風險。概念：CIA 三要素、中間人攻擊、偽冒、DoS／DDoS、防火牆、釣魚。成果：學完後能看出一個網路情境中攻擊者可能介入的位置，並對每個風險提出對應防護。
- **CN19 防火牆、VPN 與零信任** — 目標：撰寫以位址、連接埠與連線狀態過濾的防火牆規則並預測比對結果；說明 VPN 通道如何封裝並加密流量；規劃 DMZ 與網段隔離的網路架構；比較傳統邊界防禦與零信任模型的差異。概念：封包過濾、狀態檢查、VPN 通道、DMZ、網段隔離、零信任。成果：學完後能為一個小型公司網路寫出防火牆規則，只開放必要服務並說明每條規則的用意。
- **CN20 計算機網路島綜合挑戰：追蹤並打造一個網路服務** — 目標：完整追蹤一個 HTTPS 網頁請求經過的 DHCP、DNS、ARP、路由、TCP、TLS 與 HTTP 步驟；實作一個提供 REST API 的小型服務並以客戶端呼叫；以除錯工具診斷刻意埋入的網路與設定錯誤；為服務加上 HTTPS、快取與基本存取控制。概念：綜合應用、端到端請求、API 服務、網路除錯、安全設定。成果：學完後能交出一個可運作的 API 服務與一份完整的請求追蹤說明，並修好其中的網路問題。

</details>

### SA — 系統分析與設計島（Systems Analysis & Design，`systems-analysis`，20 堂）

從 SDLC、方法論與需求開始，經過 DFD／BPMN 與 UML 建模、架構與設計模式，到測試、專案管理、上線與維護，學會把問題變成可實作的系統設計。程式語言內部機制交給程式語言島、資料庫正規化交給資料庫應用島，本島只引用不重教。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| SA01 | 系統開發生命週期<br><small>Software Development Life Cycle · `software-development-life-cycle`</small> | 入門 | F13 | F20 | `process-model` | case-study |
| SA02 | 開發方法論：瀑布、迭代與敏捷<br><small>Development Methodologies: Waterfall, Iterative, and Agile · `development-methodologies`</small> | 入門 | SA01 | — | `decision-simulation` | case-study |
| SA03 | 可行性分析與系統提案<br><small>Feasibility Analysis and System Proposals · `feasibility-analysis`</small> | 入門 | SA01 | SA02 | `decision-simulation` | calculation |
| SA04 | 需求擷取<br><small>Requirements Elicitation · `requirements-elicitation`</small> | 入門 | SA01 | SA03 | `requirements-board` | case-study |
| SA05 | 需求規格與使用者故事<br><small>Requirements Specification and User Stories · `requirements-specification`</small> | 入門 | SA04 | — | `requirements-board` | design |
| SA06 | 使用案例建模<br><small>Use Case Modeling · `use-case-modeling`</small> | 中級 | SA05 | — | `uml-designer` | diagram |
| SA07 | 流程建模：DFD 與 BPMN<br><small>Process Modeling with DFD and BPMN · `process-modeling-dfd-bpmn`</small> | 中級 | SA05 | DB08 | `process-model` | diagram |
| SA08 | UML 類別圖<br><small>UML Class Diagrams · `uml-class-diagrams`</small> | 中級 | SA05、PL01 | SA06、DB08 | `uml-designer` | diagram |
| SA09 | UML 循序圖<br><small>UML Sequence Diagrams · `uml-sequence-diagrams`</small> | 中級 | SA08 | SA06 | `uml-designer` | diagram |
| SA10 | UML 活動圖與狀態圖<br><small>UML Activity and State Machine Diagrams · `uml-activity-and-state-diagrams`</small> | 中級 | SA06 | SA07、SA09 | `uml-designer` | diagram |
| SA11 | 物件導向設計原則<br><small>Object-Oriented Design Principles · `object-oriented-design-principles`</small> | 中級 | SA08 | PL04 | `uml-designer` | code |
| SA12 | 軟體架構風格<br><small>Software Architecture Styles · `software-architecture-styles`</small> | 中級 | SA05、SA08 | CN01、CN14、PL13 | `architecture-diagram` | design |
| SA13 | 設計模式概覽<br><small>Design Patterns Overview · `design-patterns-overview`</small> | 進階 | SA11 | SA09、PL01 | `uml-designer` | code |
| SA14 | 使用者介面與體驗設計<br><small>User Interface and User Experience Design · `ui-ux-design`</small> | 中級 | SA06 | SA05 | `case-study-board` | design |
| SA15 | 設計文件與設計審查<br><small>Design Documentation and Reviews · `design-documentation-and-reviews`</small> | 進階 | SA12 | SA13、SA05 | `architecture-diagram` | design |
| SA16 | 測試策略<br><small>Testing Strategy · `testing-strategy`</small> | 中級 | SA05、F17 | SA11 | `conditional-branch` | code |
| SA17 | 專案規劃、估算與風險管理<br><small>Project Planning, Estimation, and Risk Management · `project-planning-and-estimation`</small> | 中級 | SA02 | SA03、SA05 | `decision-simulation` | calculation |
| SA18 | 系統建置、版本管理與上線轉換<br><small>System Implementation, Configuration Management, and Transition · `system-implementation-and-transition`</small> | 進階 | SA16、SA17 | DB01 | `deployment-simulator` | case-study |
| SA19 | 軟體維護與演進<br><small>Software Maintenance and Evolution · `software-maintenance-and-evolution`</small> | 進階 | SA18 | SA11、SA13 | `decision-simulation` | code |
| SA20 | 系統分析與設計島綜合專題<br><small>Systems Analysis and Design Capstone · `systems-analysis-capstone`</small> | 進階 | SA15、SA16、SA19 | SA14、SA17、SA18 | `challenge-stages` | design |

<details><summary>學習目標、核心概念與成果</summary>

- **SA01 系統開發生命週期** — 目標：說明 SDLC 各階段（規劃、分析、設計、實作、測試、部署、維護）的目的與產出；辨識每個階段的主要利害關係人與交付文件；比較在早期與晚期修正錯誤的成本差異；將一個小型系統專案的工作項目歸類到正確階段。概念：SDLC、階段與交付物、利害關係人、缺陷修正成本、系統分析師角色。成果：學完後能把一個校園系統專案的工作清單，依 SDLC 階段排序並標出各階段的交付物。
- **SA02 開發方法論：瀑布、迭代與敏捷** — 目標：比較瀑布、V 模型、螺旋、迭代增量與敏捷方法的流程與適用情境；說明敏捷宣言的價值與原則；描述 Scrum 的角色、事件與產出物，以及 Kanban 的 WIP 限制；依專案條件（需求穩定度、風險、團隊規模）選擇合適的方法論並說明理由。概念：瀑布與 V 模型、迭代增量、敏捷宣言、Scrum 角色與 Sprint、Kanban 與 WIP、方法論選擇。成果：學完後能針對三個不同專案情境，選出合適的開發方法論並寫出取捨理由。
- **SA03 可行性分析與系統提案** — 目標：從技術、經濟、營運與時程四面向評估專案可行性；計算簡單的成本效益指標（回收期、ROI、淨現值）；撰寫包含問題陳述、目標與範圍的系統提案；辨識範圍蔓延的早期徵兆。概念：技術可行性、經濟可行性、成本效益分析、回收期與 NPV、專案範圍。成果：學完後能為一個系統需求算出回收期與 ROI，並寫出一頁可行性結論。
- **SA04 需求擷取** — 目標：規劃訪談、問卷、觀察、工作坊與原型等需求擷取技術的使用時機；設計開放式與封閉式訪談問題並避免誘導；從利害關係人陳述中萃取需求並標示衝突；整理擷取紀錄成需求候選清單。概念：利害關係人分析、訪談與問卷、觀察與工作坊、原型擷取、需求衝突。成果：學完後能從一段訪談逐字稿中整理出需求候選清單，並標示衝突與待確認問題。
- **SA05 需求規格與使用者故事** — 目標：區分功能性與非功能性需求，並寫出可驗證的需求敘述；以 INVEST 原則撰寫使用者故事與 Given-When-Then 驗收條件；使用 MoSCoW 為需求排定優先順序；建立需求追溯矩陣連結需求、設計與測試。概念：功能性需求、非功能性需求、使用者故事 INVEST、驗收條件、MoSCoW 優先順序、需求追溯。成果：學完後能把需求候選清單改寫成具驗收條件、可排序與可追溯的使用者故事集。
- **SA06 使用案例建模** — 目標：辨識系統邊界、參與者與使用案例；繪製使用案例圖並正確使用 include 與 extend 關係；撰寫含主要流程、替代流程與例外流程的使用案例描述；比較使用案例與使用者故事的粒度與用途。概念：參與者、系統邊界、include／extend、主要與替代流程、前置與後置條件。成果：學完後能為圖書借閱系統畫出使用案例圖，並完整撰寫一個使用案例的流程描述。
- **SA07 流程建模：DFD 與 BPMN** — 目標：繪製環境圖（第 0 層 DFD）與分解後的第 1 層 DFD；檢查 DFD 的平衡性與常見錯誤（黑洞、奇蹟、資料流方向）；使用 BPMN 的事件、活動、閘道與泳道描述業務流程；判斷何時使用 DFD、何時使用 BPMN。概念：環境圖、DFD 分層與平衡、資料儲存、BPMN 閘道、泳道、現況與未來流程。成果：學完後能把線上訂單處理流程畫成平衡的兩層 DFD 與一張含泳道的 BPMN 圖。
- **SA08 UML 類別圖** — 目標：從需求敘述中辨識類別、屬性與操作（名詞／動詞分析）；正確標示關聯、多重性、聚合、組合、繼承與相依；區分領域模型（分析）與設計類別圖；將類別圖對應到 C++／Java／Python／JavaScript 的類別骨架。概念：類別與屬性、關聯與多重性、聚合與組合、繼承與介面、領域模型。成果：學完後能為選課系統畫出含多重性與繼承的類別圖，並寫出對應的類別骨架。
- **SA09 UML 循序圖** — 目標：以生命線、訊息與啟動條描述物件之間的互動順序；使用 alt、opt、loop 組合片段表達條件與重複；從使用案例流程推導循序圖並找出缺少的操作；檢查循序圖與類別圖的一致性。概念：生命線、同步與非同步訊息、回傳訊息、組合片段 alt／loop、互動一致性。成果：學完後能把「借書」使用案例轉成循序圖，並據此補齊類別圖缺少的方法。
- **SA10 UML 活動圖與狀態圖** — 目標：以活動圖表達含分支、合併、分叉與匯合的工作流程；以狀態機圖描述物件生命週期的狀態、事件、守衛條件與動作；找出狀態圖中的不可達狀態與未處理事件；將狀態機圖轉寫為 switch 或狀態表程式。概念：活動圖、分叉與匯合、狀態與轉移、事件與守衛條件、狀態表。成果：學完後能畫出訂單狀態機並用狀態表程式模擬合法與非法的狀態轉移。
- **SA11 物件導向設計原則** — 目標：以內聚力與耦合度評估模組設計的好壞；說明 SOLID 五項原則並辨識違反的程式碼；運用職責分配（如 Information Expert、Creator）決定方法放在哪個類別；重構一段高耦合程式使其符合單一職責與相依反轉。概念：內聚與耦合、SOLID、職責分配、介面隔離、相依反轉。成果：學完後能指出一段程式違反哪項 SOLID 原則，並重構成低耦合的設計。
- **SA12 軟體架構風格** — 目標：說明分層、主從、MVC、管線與過濾器、事件驅動與微服務等架構風格；依品質屬性（效能、可擴充性、可維護性、可用性）比較架構取捨；為一個系統繪製元件與連接器的架構圖；判斷單體與微服務在團隊規模與部署複雜度上的取捨。概念：分層架構、MVC、事件驅動、微服務與單體、品質屬性、架構取捨。成果：學完後能依非功能性需求為一個系統選定架構風格，並畫出元件與連接器圖說明取捨。
- **SA13 設計模式概覽** — 目標：說明建立型、結構型與行為型設計模式的分類與意圖；以類別圖與程式實作 Strategy、Observer、Factory Method 與 Adapter；辨識情境中適合套用的模式並說明過度設計的風險；比較同一模式在 C++／Java／Python／JavaScript 的慣用寫法。概念：建立型模式、結構型模式、行為型模式、Strategy／Observer、Factory／Adapter、過度設計。成果：學完後能在一個付款流程中選用合適的設計模式，並以類別圖與程式碼呈現。
- **SA14 使用者介面與體驗設計** — 目標：運用 Nielsen 可用性啟發法評估介面問題；從使用者故事產出使用者流程、線框圖與低保真原型；依 WCAG 檢查色彩對比、鍵盤操作與替代文字等無障礙需求；規劃一次簡單的可用性測試並整理發現。概念：可用性啟發法、使用者流程、線框圖與原型、無障礙 WCAG、可用性測試。成果：學完後能對一個報名表單做啟發式評估，提出改版線框圖與無障礙修正清單。
- **SA15 設計文件與設計審查** — 目標：撰寫包含脈絡、決策、替代方案與後果的架構決策紀錄（ADR）；以 C4 模型（脈絡、容器、元件）分層呈現系統設計；組織系統設計文件的結構並維持與需求的追溯；依檢查清單進行設計審查並記錄待解問題。概念：系統設計文件、架構決策紀錄 ADR、C4 模型、設計審查、文件即程式碼。成果：學完後能為一個架構選擇寫出 ADR，並畫出 C4 脈絡圖與容器圖。
- **SA16 測試策略** — 目標：區分單元、整合、系統與驗收測試的目標與負責角色；以等價類別、邊界值與決策表設計黑箱測試案例；說明敘述涵蓋與分支涵蓋，並計算測試的分支涵蓋率；依測試金字塔與風險規劃一份測試計畫。概念：測試層級、測試金字塔、等價類別與邊界值、分支涵蓋、回歸測試、TDD。成果：學完後能為一個折扣計算函式設計達到完整分支涵蓋的測試案例，並寫出對應的單元測試。
- **SA17 專案規劃、估算與風險管理** — 目標：建立工作分解結構（WBS）並排出甘特圖；以要徑法（CPM）找出要徑與浮時；使用故事點、規劃撲克與速度估算迭代範圍；建立風險登錄表並依機率與影響排序風險。概念：WBS、甘特圖、要徑法、故事點與速度、風險登錄表。成果：學完後能為一個專案計算要徑與總工期，並依團隊速度估算可交付的 Sprint 數。
- **SA18 系統建置、版本管理與上線轉換** — 目標：說明版本控制、分支策略與組態管理在團隊開發中的角色；比較直接、平行、分階段與試點等上線轉換策略的風險；規劃資料轉換、使用者訓練與上線檢查清單；設計回復（rollback）方案並說明觸發條件。概念：版本控制與分支、組態管理、轉換策略、資料轉換、上線檢查清單、回復方案。成果：學完後能為舊系統汰換寫出一份含轉換策略、資料轉換與回復方案的上線計畫。　缺口：software-engineering-practice
- **SA19 軟體維護與演進** — 目標：區分修正性、適應性、完善性與預防性維護；辨識程式碼異味並以小步重構改善且不改變行為；說明技術債的成因、利息與償還策略；以變更請求流程評估變更的影響範圍。概念：維護類型、重構、程式碼異味、技術債、變更管理、遺留系統。成果：學完後能對一段遺留程式做影響分析與安全重構，並說明技術債的償還優先順序。
- **SA20 系統分析與設計島綜合專題** — 目標：從問題陳述完成需求擷取、使用者故事與使用案例；產出類別圖、循序圖、狀態圖與架構圖並保持一致；撰寫 ADR 與測試計畫並建立需求追溯；向利害關係人簡報設計取捨與專案計畫。概念：綜合應用、需求到設計追溯、模型一致性、設計取捨簡報。成果：學完後能為一個中型系統交出從需求、模型、架構到測試與上線計畫的完整分析設計文件。

</details>

### MIS — 管理資訊系統島（Management Information Systems，`information-systems`，20 堂）

以管理者視角學習資訊系統如何支援組織策略、業務流程與決策，涵蓋 ERP／CRM／SCM、電子商務、商業智慧、IT 治理、資安風險、倫理法規與數位轉型。資料庫、系統分析與網路的技術細節分別交給資料庫應用島、系統分析與設計島與計算機網路島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| MIS01 | 資訊系統與組織<br><small>Information Systems in Organizations · `information-systems-in-organizations`</small> | 入門 | F01 | SA01、DB01 | `case-study-board` | case-study |
| MIS02 | 資訊系統的類型<br><small>Types of Information Systems · `types-of-information-systems`</small> | 入門 | MIS01 | — | `case-study-board` | analysis |
| MIS03 | 資訊系統策略與競爭優勢<br><small>IS Strategy and Competitive Advantage · `is-strategy-and-competitive-advantage`</small> | 入門 | MIS01 | MIS02 | `decision-simulation` | analysis |
| MIS04 | 業務流程管理與改善<br><small>Business Process Management and Improvement · `business-process-management`</small> | 入門 | MIS01 | SA07 | `process-model` | diagram |
| MIS05 | IT 基礎建設與雲端服務<br><small>IT Infrastructure and Cloud Services · `it-infrastructure-and-cloud-services`</small> | 中級 | MIS02 | CN01 | `cost-calculator` | calculation |
| MIS06 | 資料治理與資料品質<br><small>Data Governance and Data Quality · `data-governance-and-quality`</small> | 中級 | MIS02、DB01 | DB10 | `data-explorer` | analysis |
| MIS07 | 電子商務與數位平台<br><small>E-Commerce and Digital Platforms · `e-commerce-and-digital-platforms`</small> | 中級 | MIS03 | CN14 | `kpi-dashboard` | analysis |
| MIS08 | 企業資源規劃 ERP<br><small>Enterprise Resource Planning (ERP) · `erp-systems`</small> | 中級 | MIS04 | DB01、SA18 | `process-model` | case-study |
| MIS09 | 顧客關係管理 CRM<br><small>Customer Relationship Management (CRM) · `crm-systems`</small> | 中級 | MIS08 | MIS06 | `kpi-dashboard` | calculation |
| MIS10 | 供應鏈管理 SCM<br><small>Supply Chain Management (SCM) · `supply-chain-management-systems`</small> | 中級 | MIS08 | — | `decision-simulation` | simulation |
| MIS11 | 資料倉儲與 OLAP<br><small>Data Warehousing and OLAP · `data-warehousing-and-olap`</small> | 中級 | MIS06、DB03 | DB08、DB10 | `sql-playground` | sql |
| MIS12 | 商業智慧<br><small>Business Intelligence · `business-intelligence`</small> | 中級 | MIS11 | MIS07 | `kpi-dashboard` | analysis |
| MIS13 | 決策支援系統<br><small>Decision Support Systems · `decision-support-systems`</small> | 進階 | MIS12 | — | `decision-simulation` | calculation |
| MIS14 | IT 治理<br><small>IT Governance · `it-governance`</small> | 中級 | MIS03、MIS05 | — | `case-study-board` | case-study |
| MIS15 | 資訊安全管理與風險<br><small>Information Security Management and Risk · `information-security-management`</small> | 進階 | MIS14 | CN18 | `decision-simulation` | calculation |
| MIS16 | 資訊倫理、隱私與法規<br><small>Information Ethics, Privacy, and Regulation · `privacy-ethics-and-regulation`</small> | 中級 | MIS06 | MIS15 | `case-study-board` | case-study |
| MIS17 | IT 專案組合與投資評估<br><small>IT Project Portfolio and Investment Management · `it-project-portfolio-management`</small> | 進階 | MIS14 | SA03、SA17 | `cost-calculator` | calculation |
| MIS18 | 數位轉型<br><small>Digital Transformation · `digital-transformation`</small> | 進階 | MIS03、MIS04 | MIS12、MIS07 | `case-study-board` | case-study |
| MIS19 | 資訊系統成敗個案分析<br><small>Information Systems Success and Failure Cases · `is-success-and-failure-cases`</small> | 進階 | MIS17 | MIS08、SA01 | `case-study-board` | case-study |
| MIS20 | 管理資訊系統島綜合專題<br><small>Management Information Systems Capstone · `mis-capstone`</small> | 進階 | MIS18、MIS19 | MIS12、MIS15、MIS16 | `challenge-stages` | case-study |

<details><summary>學習目標、核心概念與成果</summary>

- **MIS01 資訊系統與組織** — 目標：區分資料、資訊與知識，並說明資訊系統的組成（人員、流程、資料、軟硬體、網路）；說明資訊系統如何支援組織的作業、管理與決策層級；分析組織結構與文化對資訊系統導入的影響；以一個企業案例描述資訊系統帶來的價值。概念：資料、資訊與知識、資訊系統組成、組織層級、社會技術觀點、資訊系統價值。成果：學完後能為一家連鎖飲料店畫出其資訊系統組成，並說明各系統支援哪個組織層級。
- **MIS02 資訊系統的類型** — 目標：比較交易處理系統（TPS）、管理報告系統、決策支援系統（DSS）與高階主管資訊系統（ESS）；說明協作系統與知識管理系統的用途；區分功能別系統與跨功能的企業系統；將企業中的實際系統歸類並說明其使用者與輸出。概念：TPS、管理報告系統、DSS 與 ESS、協作與知識管理、企業系統。成果：學完後能把一家醫院的十個系統依類型分類，並說明各自的使用者與主要輸出。
- **MIS03 資訊系統策略與競爭優勢** — 目標：以波特五力模型分析產業競爭態勢；以價值鏈找出資訊系統可創造價值的活動；說明成本領導、差異化與聚焦策略如何由資訊系統支援；評估競爭優勢的持續性與網路效應的影響。概念：五力模型、價值鏈、一般性競爭策略、網路效應、策略對齊。成果：學完後能用五力與價值鏈分析一家電商，提出兩個以資訊系統建立優勢的策略。
- **MIS04 業務流程管理與改善** — 目標：辨識核心流程與支援流程並描述其輸入、輸出與負責人；比較流程改善（持續改善、精實）與業務流程再造（BPR）；以流程績效指標（週期時間、成本、錯誤率）找出瓶頸；評估以 RPA 或工作流程系統自動化流程的效益與風險。概念：核心與支援流程、流程再造 BPR、精實與持續改善、流程瓶頸、RPA 與流程自動化。成果：學完後能把採購流程畫成現況與改善後流程，並以週期時間說明改善幅度。
- **MIS05 IT 基礎建設與雲端服務** — 目標：說明 IT 基礎建設的組成（運算、儲存、網路、平台、服務）；從管理角度比較地端、IaaS、PaaS 與 SaaS 的責任分工；計算並比較地端與雲端方案的總擁有成本（TCO）；評估委外、供應商鎖定與服務水準協議（SLA）的風險。概念：IT 基礎建設、IaaS／PaaS／SaaS、共同責任模型、總擁有成本 TCO、SLA 與供應商鎖定。成果：學完後能為一家中小企業計算三年 TCO，並提出地端或雲端的建議與理由。
- **MIS06 資料治理與資料品質** — 目標：說明資料作為組織資產的意義與資料治理的角色（資料擁有者、資料管理員）；以完整性、正確性、一致性、即時性評估資料品質；說明主資料管理（MDM）如何解決跨系統的資料不一致；撰寫一份資料品質問題清單與改善建議。概念：資料治理、資料擁有者與管理員、資料品質維度、主資料管理 MDM、資料生命週期。成果：學完後能從一份客戶資料表找出品質問題，並提出對應的治理規則。
- **MIS07 電子商務與數位平台** — 目標：比較 B2C、B2B、C2C 與 O2O 等電子商務模式；說明平台商業模式、雙邊市場與網路效應；以轉換漏斗指標分析線上銷售表現；說明線上支付、物流與信任機制在電商中的角色。概念：電商模式、平台與雙邊市場、轉換漏斗、線上支付、數位行銷指標。成果：學完後能從一份轉換漏斗數據指出流失最嚴重的階段並提出改善假設。
- **MIS08 企業資源規劃 ERP** — 目標：說明 ERP 以單一資料庫整合財務、採購、生產、銷售與人資的運作方式；追蹤訂單到收款（order-to-cash）與採購到付款（procure-to-pay）的跨模組流程；比較 ERP 客製化與流程配合套裝的取捨；分析 ERP 導入的關鍵成功因素與常見失敗原因。概念：ERP 模組、整合資料庫、order-to-cash、procure-to-pay、客製化與最佳實務、導入風險。成果：學完後能追蹤一張銷售訂單在 ERP 各模組間產生的資料，並評估一個導入案例的風險。
- **MIS09 顧客關係管理 CRM** — 目標：說明作業型、分析型與協同型 CRM 的功能；以 RFM 分析區隔顧客；計算顧客終身價值（CLV）與流失率；設計以 CRM 資料驅動的顧客保留方案。概念：CRM 類型、顧客生命週期、RFM 分析、顧客終身價值、流失率。成果：學完後能以 RFM 與 CLV 為一份顧客名單分群，並為高價值族群設計保留方案。
- **MIS10 供應鏈管理 SCM** — 目標：描述供應鏈的物流、資訊流與金流；以模擬觀察長鞭效應並說明資訊分享如何降低它；比較推式與拉式供應鏈、及時生產（JIT）與安全庫存的取捨；說明 SCM 系統、EDI 與追溯技術（條碼、RFID）的用途。概念：供應鏈三流、長鞭效應、推式與拉式、JIT 與安全庫存、EDI 與 RFID。成果：學完後能在供應鏈模擬中重現長鞭效應，並以資訊分享策略降低庫存波動。
- **MIS11 資料倉儲與 OLAP** — 目標：區分 OLTP 與 OLAP 的用途與資料特性；說明 ETL／ELT 流程與資料倉儲、資料市集、資料湖的差異；設計含事實表與維度表的星狀綱要；以 SQL 執行切片、切塊、上捲與下鑽查詢。概念：OLTP 與 OLAP、ETL／ELT、星狀綱要、事實表與維度表、上捲與下鑽。成果：學完後能為銷售資料設計星狀綱要，並寫出依時間與地區上捲彙總的 SQL 查詢。
- **MIS12 商業智慧** — 目標：說明 BI 從資料來源、倉儲、分析到呈現的架構；依目標設計關鍵績效指標（KPI）並區分領先與落後指標；選擇合適的圖表設計主管儀表板並避免誤導性視覺化；區分描述性、診斷性、預測性與處方性分析。概念：BI 架構、KPI 設計、領先與落後指標、儀表板設計、分析層次。成果：學完後能為門市營運設計一頁儀表板，選定 KPI 與圖表並說明每個指標支援的決策。
- **MIS13 決策支援系統** — 目標：說明 DSS 的資料、模型與使用者介面三大組成；以假設分析（what-if）與敏感度分析評估決策；以期望值與決策樹比較不同方案；說明群體決策支援與決策偏誤的影響。概念：DSS 組成、假設分析、敏感度分析、決策樹與期望值、決策偏誤。成果：學完後能為一個展店決策建立 what-if 模型，並以期望值比較三個方案。　缺口：probability
- **MIS14 IT 治理** — 目標：說明 IT 治理與 IT 管理的差異及業務與 IT 對齊的意義；介紹 COBIT 與 ITIL 等框架的定位與用途；以 RACI 矩陣界定 IT 決策的權責；設計 IT 服務的績效與合規衡量方式。概念：IT 治理、業務與 IT 對齊、COBIT、ITIL 服務管理、RACI 矩陣。成果：學完後能為一家公司的 IT 決策畫出 RACI 矩陣，並指出治理缺口。
- **MIS15 資訊安全管理與風險** — 目標：說明資訊安全管理系統（ISMS）與 ISO/IEC 27001 的架構；以資產、威脅、弱點與衝擊進行風險評鑑並繪製風險矩陣；計算年度預期損失（ALE）並比較控制措施的成本效益；規劃營運持續計畫（BCP）與災難復原的 RTO／RPO。概念：ISMS、風險評鑑、風險矩陣、年度預期損失 ALE、控制措施、BCP 與 RTO／RPO。成果：學完後能為一個線上系統完成風險矩陣與 ALE 計算，並選出成本合理的控制措施。
- **MIS16 資訊倫理、隱私與法規** — 目標：以倫理分析架構討論資訊系統引發的兩難；說明個人資料保護原則（告知、同意、目的限制、最小化）；比較台灣個人資料保護法與歐盟 GDPR 的重點；辨識智慧財產、資料蒐集與監控相關的法律與倫理議題。概念：資訊倫理、個資保護原則、個資法與 GDPR、隱私設計、智慧財產。成果：學完後能評估一個 App 的資料蒐集做法是否符合個資保護原則，並提出隱私設計改善建議。
- **MIS17 IT 專案組合與投資評估** — 目標：撰寫含成本、效益、風險與替代方案的 IT 投資商業個案；以 NPV、ROI 與回收期比較多個 IT 專案；以策略契合度與風險建立專案組合評分矩陣；規劃效益實現追蹤與專案停損條件。概念：商業個案、NPV 與 ROI、專案組合管理、評分矩陣、效益實現。成果：學完後能在預算限制下為五個 IT 專案排出投資組合並說明取捨。
- **MIS18 數位轉型** — 目標：區分數位化、數位優化與數位轉型；分析數位轉型中的商業模式、流程與組織文化變革；以變革管理模型規劃利害關係人溝通與抗拒處理；設計衡量轉型成效的指標與階段里程碑。概念：數位轉型層次、商業模式創新、變革管理、資料驅動組織、轉型路線圖。成果：學完後能為一家傳統製造商提出分階段的數位轉型路線圖與成效指標。
- **MIS19 資訊系統成敗個案分析** — 目標：以 DeLone 與 McLean 資訊系統成功模型評估系統成效；從個案中歸納資訊系統失敗的技術、管理與組織原因；比較使用者接受度（如 TAM）對導入結果的影響；撰寫結構化的個案分析報告與改善建議。概念：資訊系統成功模型、失敗原因分析、科技接受模型 TAM、個案分析方法、經驗學習。成果：學完後能用成功模型分析一個系統導入個案，寫出成因與可行的改善建議。
- **MIS20 管理資訊系統島綜合專題** — 目標：分析一個組織的策略、流程與現有資訊系統；提出整合 ERP／CRM／BI 的資訊系統藍圖與投資組合；評估安全、隱私與治理風險並提出控管措施；以 KPI 與里程碑規劃轉型的執行與衡量。概念：綜合應用、資訊系統藍圖、投資與風險評估、治理與合規、轉型計畫。成果：學完後能為一個組織交出含系統藍圖、投資排序、風險控管與 KPI 的資訊系統策略規劃書。

</details>

## Region B — Artificial Intelligence（新增 160 堂）

### AIF — AI 基礎島（AI Foundations，`ai-foundations`，20 堂）

以經典 AI 為核心，從智慧代理人、問題形式化、啟發式與對抗搜尋、限制滿足、知識表示與邏輯推論，到機率、貝氏網路、決策理論與 MDP，最後談負責任的 AI。BFS／DFS／Dijkstra 直接沿用演算法島，機器學習、深度學習與 LLM 交給後續島嶼。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| AIF01 | AI 是什麼<br><small>What Is AI · `what-is-ai`</small> | 入門 | F01 | F20 | `case-study-board` | analysis |
| AIF02 | AI 的發展史與主要方法<br><small>AI History and Major Approaches · `ai-history-and-approaches`</small> | 入門 | AIF01 | — | `case-study-board` | quiz-only |
| AIF03 | 智慧代理人<br><small>Intelligent Agents · `intelligent-agents`</small> | 入門 | AIF01 | AIF02 | `agent-workflow` | code-python |
| AIF04 | 問題形式化與無資訊搜尋<br><small>Problem Formulation and Uninformed Search · `problem-formulation-and-uninformed-search`</small> | 中級 | AIF03、A14、A15 | A16、A12 | `search-tree` | code-python |
| AIF05 | 啟發式搜尋與 A*<br><small>Informed Search and A* · `informed-search`</small> | 中級 | AIF04、A16 | D15 | `search-tree` | code-python |
| AIF06 | 區域搜尋與最佳化<br><small>Local Search and Optimization · `local-search-and-optimization`</small> | 中級 | AIF04 | AIF05 | `gradient-descent` | code-python |
| AIF07 | 對抗搜尋與 Minimax<br><small>Adversarial Search and Minimax · `minimax-adversarial-search`</small> | 中級 | AIF04 | A12、AIF05 | `game-tree` | code-python |
| AIF08 | Alpha-Beta 剪枝與遊戲 AI<br><small>Alpha-Beta Pruning and Game-Playing AI · `alpha-beta-pruning`</small> | 中級 | AIF07 | — | `game-tree` | code-python |
| AIF09 | 限制滿足問題<br><small>Constraint Satisfaction Problems · `constraint-satisfaction-problems`</small> | 中級 | AIF04、A12 | AIF05 | `search-tree` | code-python |
| AIF10 | 知識表示<br><small>Knowledge Representation · `knowledge-representation`</small> | 中級 | AIF03 | DB08、D16 | `knowledge-graph` | code-python |
| AIF11 | 命題邏輯與推論<br><small>Propositional Logic and Inference · `propositional-logic-and-inference`</small> | 中級 | AIF10、F06 | — | `logic-proof` | code-python |
| AIF12 | 一階邏輯<br><small>First-Order Logic · `first-order-logic`</small> | 進階 | AIF11 | AIF10 | `logic-proof` | analysis |
| AIF13 | AI 的機率基礎<br><small>Probability for AI · `probability-for-ai`</small> | 中級 | AIF01 | AIF03、F16 | `probability-explorer` | calculation |
| AIF14 | 貝氏定理與機率推論<br><small>Bayes' Rule and Probabilistic Inference · `bayes-rule`</small> | 中級 | AIF13 | — | `probability-explorer` | calculation |
| AIF15 | 貝氏網路<br><small>Bayesian Networks · `bayesian-networks`</small> | 進階 | AIF14 | D16、AIF10 | `bayes-net` | calculation |
| AIF16 | 馬可夫鏈與隱馬可夫模型<br><small>Markov Chains and Hidden Markov Models · `markov-chains-and-hmms`</small> | 進階 | AIF14 | AIF15、A17 | `probability-explorer` | code-python |
| AIF17 | 決策理論與效用<br><small>Decision Theory and Utility · `decision-theory-and-utility`</small> | 中級 | AIF13、AIF03 | MIS13 | `decision-simulation` | calculation |
| AIF18 | 馬可夫決策過程入門<br><small>Introduction to Markov Decision Processes · `markov-decision-processes`</small> | 進階 | AIF17 | AIF16、A17 | `mdp-gridworld` | code-python |
| AIF19 | 負責任的 AI<br><small>Responsible AI · `responsible-ai`</small> | 中級 | AIF03 | MIS16、AIF13、AIF17 | `decision-simulation` | case-study |
| AIF20 | AI 基礎島綜合專題<br><small>AI Foundations Capstone · `ai-foundations-capstone`</small> | 進階 | AIF05、AIF08、AIF18 | AIF09、AIF15、AIF19 | `challenge-stages` | code-python |

<details><summary>學習目標、核心概念與成果</summary>

- **AIF01 AI 是什麼** — 目標：比較「像人一樣思考／行動」與「理性思考／行動」四種 AI 定義；說明圖靈測試的設計與限制；區分符號式 AI、機器學習與深度學習的關係；判斷日常系統屬於規則式程式或 AI 系統並說明理由。概念：AI 的四種定義、理性代理人、圖靈測試、弱 AI 與通用 AI、符號式與資料驅動。成果：學完後能把十個日常系統分類為規則式程式或 AI 系統，並以 AI 的定義說明判斷理由。
- **AIF02 AI 的發展史與主要方法** — 目標：說明達特茅斯會議、專家系統、AI 寒冬與深度學習興起等重要階段；比較符號主義、連結主義與統計學習的核心想法；說明運算力、資料與演算法如何共同推動 AI 進展；把本島與機器學習、深度學習、LLM 各島的主題放到 AI 發展脈絡中。概念：達特茅斯會議、專家系統、AI 寒冬、符號主義與連結主義、深度學習與基礎模型。成果：學完後能畫出 AI 發展時間軸，並說明每個階段興起與衰退的原因。
- **AIF03 智慧代理人** — 目標：以 PEAS（績效、環境、致動器、感測器）描述一個代理人的任務；依可觀察性、確定性、序列性、動態性、離散性與代理人數量分類環境；比較簡單反射、模型式反射、目標式、效用式與學習型代理人；以 Python 寫出一個能在簡單環境中行動的反射型代理人。概念：代理人與環境、PEAS、環境性質、代理人類型、理性與績效度量。成果：學完後能為掃地機器人寫出 PEAS 描述，並實作一個在格子環境中運作的反射型代理人。
- **AIF04 問題形式化與無資訊搜尋** — 目標：把謎題與路線問題形式化為初始狀態、動作、轉移模型、目標測試與路徑成本；把演算法島學過的 BFS／DFS 放進通用的樹搜尋與圖搜尋框架中比較；說明一致代價搜尋（UCS）與 Dijkstra 的關係，以及深度限制與迭代加深搜尋（IDS）；以完備性、最佳性、時間與空間複雜度比較各種無資訊搜尋。概念：狀態空間、轉移模型、樹搜尋與圖搜尋、一致代價搜尋、迭代加深搜尋、分支因子。成果：學完後能把八數碼謎題寫成通用搜尋問題，並以同一框架切換 BFS、UCS 與 IDS 比較展開節點數。
- **AIF05 啟發式搜尋與 A*** — 目標：說明啟發函數 h(n) 並比較貪婪最佳優先搜尋與 A* 的 f(n) 定義；判斷啟發函數是否可接受（admissible）與一致（consistent），並說明其對最佳性的影響；以放寬問題設計啟發函數並比較其支配關係；實作以優先佇列為基礎的 A*，並與 Dijkstra 比較展開的節點數。概念：啟發函數、貪婪最佳優先、A* 與 f=g+h、可接受與一致性、放寬問題、有效分支因子。成果：學完後能為格子地圖尋路實作 A*，並以曼哈頓距離與零啟發比較展開節點數與路徑成本。
- **AIF06 區域搜尋與最佳化** — 目標：說明區域搜尋只保留目前狀態的特性及其適用的最佳化問題；實作爬山法並辨識區域最大值、高原與山脊；說明隨機重啟、模擬退火與區域束搜尋如何跳出區域最佳；說明基因演算法的選擇、交配與突變。概念：目標函數地形、爬山法、區域最佳、模擬退火、基因演算法。成果：學完後能以爬山法與模擬退火解 N 皇后問題，並比較兩者成功率與步數。
- **AIF07 對抗搜尋與 Minimax** — 目標：把雙人零和、完全資訊遊戲形式化為賽局搜尋問題；在遊戲樹上逐層計算 minimax 值並選出最佳行動；說明深度限制與評估函數在大型遊戲中的必要性；以 Python 實作井字遊戲的 minimax 對手。概念：零和遊戲、遊戲樹、MAX 與 MIN、minimax 值、深度限制與評估函數。成果：學完後能實作一個不會輸的井字遊戲 AI，並在遊戲樹上解釋它每一步的選擇。
- **AIF08 Alpha-Beta 剪枝與遊戲 AI** — 目標：追蹤 alpha 與 beta 值並標出遊戲樹中被剪掉的分支；說明行動排序如何影響剪枝效率；比較期望 minimax（含機率節點）與確定性遊戲的差異；說明蒙地卡羅樹搜尋（MCTS）的選擇、擴展、模擬與回傳四步驟。概念：alpha 與 beta、剪枝、行動排序、expectiminimax、蒙地卡羅樹搜尋。成果：學完後能在 minimax 實作中加入 alpha-beta 剪枝，並量測在不同行動排序下減少的節點數。
- **AIF09 限制滿足問題** — 目標：把著色、排程與數獨問題形式化為變數、值域與限制；以回溯搜尋解 CSP，並加入前向檢查與 AC-3 弧一致性；運用最少剩餘值（MRV）與最少限制值（LCV）啟發法排序；比較 CSP 解法與一般狀態空間搜尋的差異。概念：變數與值域、限制圖、前向檢查、弧一致性 AC-3、MRV 與 LCV。成果：學完後能實作含前向檢查與 MRV 的 CSP 解題器，解出地圖著色與小型數獨。
- **AIF10 知識表示** — 目標：比較規則、語意網路、框架與本體論等知識表示方式；以主詞—述詞—受詞三元組建立小型知識圖譜；說明類別階層、繼承與預設推理；比較知識圖譜與關聯式 ER 模型在表達能力上的差異。概念：語意網路、框架、本體論、知識圖譜三元組、類別階層與繼承。成果：學完後能用三元組建立一個校園知識圖譜，並寫出查詢回答多步關係問題。
- **AIF11 命題邏輯與推論** — 目標：以命題邏輯的語法與真值表語意表達知識；以模型檢查判斷蘊涵（entailment）與有效性；將語句轉為合取範式（CNF）並進行歸結推論；對 Horn 子句執行前向鏈結與後向鏈結。概念：命題與連接詞、真值表與模型、蘊涵、CNF 與歸結、前向與後向鏈結。成果：學完後能寫出真值表模型檢查器，並用前向鏈結推出知識庫中的新事實。
- **AIF12 一階邏輯** — 目標：以物件、述詞、函數與量詞表達命題邏輯難以描述的知識；正確翻譯含全稱與存在量詞的自然語言敘述；說明合一（unification）並以一階邏輯進行前向鏈結；比較一階邏輯推論與知識圖譜查詢的能力與限制。概念：述詞與函數、全稱與存在量詞、量詞翻譯、合一、一階前向鏈結。成果：學完後能把一段家族關係敘述翻譯成一階邏輯，並以合一推導出隱含的親屬關係。　缺口：discrete-math
- **AIF13 AI 的機率基礎** — 目標：說明為何代理人需要以機率表示不確定的信念；使用隨機變數、聯合分布與邊際化計算機率；計算條件機率並以乘法規則與連鎖規則分解聯合機率；判斷兩事件是否獨立或條件獨立。概念：不確定性與信念、隨機變數、聯合與邊際分布、條件機率、獨立與條件獨立。成果：學完後能從一張聯合機率表算出邊際與條件機率，並判斷變數之間是否獨立。
- **AIF14 貝氏定理與機率推論** — 目標：推導貝氏定理並區分先驗、概似與後驗；計算醫療檢測等情境中的後驗機率並說明基本比率謬誤；以正規化與枚舉從聯合分布回答查詢；說明單純貝氏假設如何簡化多證據推論。概念：先驗與後驗、概似、基本比率謬誤、正規化、單純貝氏假設。成果：學完後能計算檢測陽性時真正患病的機率，並解釋為何結果常與直覺不同。
- **AIF15 貝氏網路** — 目標：以有向無環圖與條件機率表建立貝氏網路；以網路結構判斷條件獨立（d-分離的基本型態）；以枚舉推論計算查詢的後驗機率；說明以抽樣做近似推論的概念。概念：有向無環圖、條件機率表、條件獨立與 d-分離、枚舉推論、抽樣近似推論。成果：學完後能為警報情境建立貝氏網路，並計算在觀察到證據後的事件機率。
- **AIF16 馬可夫鏈與隱馬可夫模型** — 目標：說明馬可夫性質並以轉移矩陣模擬馬可夫鏈；計算多步轉移後的狀態分布與穩態分布的概念；以隱馬可夫模型區分隱藏狀態與觀察；以前向演算法進行濾波，並說明 Viterbi 找最可能狀態序列的想法。概念：馬可夫性質、轉移矩陣、穩態分布、隱馬可夫模型、前向演算法與濾波、Viterbi。成果：學完後能以前向演算法從觀察序列估計天氣的隱藏狀態機率。　缺口：linear-algebra
- **AIF17 決策理論與效用** — 目標：以效用函數表達偏好並計算行動的期望效用；說明最大期望效用原則與風險態度；以決策網路結合機率節點、決策節點與效用節點；計算資訊價值，判斷是否值得先蒐集更多資訊。概念：效用函數、期望效用、風險態度、決策網路、資訊價值。成果：學完後能為一個不確定情境計算各行動的期望效用，並判斷額外資訊是否值得取得。
- **AIF18 馬可夫決策過程入門** — 目標：以狀態、動作、轉移機率、獎勵與折扣因子定義 MDP；說明策略、狀態價值與貝爾曼方程；在格子世界中執行價值迭代並找出最佳策略；說明折扣因子與獎勵設計如何改變代理人行為。概念：MDP、策略、折扣與報酬、貝爾曼方程、價值迭代、獎勵設計。成果：學完後能以價值迭代為格子世界求出最佳策略，並觀察折扣因子改變後的策略差異。
- **AIF19 負責任的 AI** — 目標：說明公平性、可靠與安全、隱私、透明與問責等負責任 AI 原則；以分組錯誤率辨識資料與決策中的偏誤；評估 AI 系統的風險等級並說明以風險分級監管的思路（如歐盟 AI 法）；提出人類監督、文件化與影響評估等治理措施。概念：公平性與偏誤、可靠與安全、隱私、透明與可解釋、問責與治理、風險分級監管。成果：學完後能對一個自動審核系統做風險評估，指出偏誤來源並提出監督與治理措施。
- **AIF20 AI 基礎島綜合專題** — 目標：為一個遊戲或規劃任務選擇合適的問題形式化與代理人設計；整合 A*、對抗搜尋與機率推論解決專題中的子問題；以 MDP 或決策理論處理不確定性下的決策；評估系統的績效與負責任 AI 風險並撰寫設計報告。概念：綜合應用、演算法選擇、不確定性下決策、績效評估、負責任設計。成果：學完後能完成一個結合搜尋、對抗與機率推論的迷宮對戰代理人，並提出效能與風險分析。

</details>

### ML — 機器學習島（Machine Learning，`machine-learning`，25 堂）

以 Python（NumPy、pandas、scikit-learn）教傳統機器學習：資料處理、監督式與非監督式模型、評估、調參與可解釋性；神經網路與深度學習交給深度學習島，機率與推論基礎沿用 AI 基礎島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| ML01 | 機器學習工作流程<br><small>The Machine Learning Workflow · `ml-workflow`</small> | 入門 | AIF01 | F13、AIF03 | `pipeline-diagram` | analysis |
| ML02 | NumPy 與 pandas 資料處理<br><small>Data Handling with NumPy and pandas · `numpy-and-pandas`</small> | 入門 | ML01、F12 | D09、F16 | `data-explorer` | code-python |
| ML03 | 探索式資料分析 EDA<br><small>Exploratory Data Analysis · `exploratory-data-analysis`</small> | 入門 | ML02 | AIF13 | `data-explorer` | code-python |
| ML04 | 資料前處理與資料切分<br><small>Data Preprocessing and Splitting · `data-preprocessing`</small> | 入門 | ML03 | — | `data-explorer` | code-python |
| ML05 | 線性迴歸<br><small>Linear Regression · `linear-regression`</small> | 入門 | ML04 | — | `regression-explorer` | code-python |
| ML06 | 過擬合與欠擬合<br><small>Overfitting and Underfitting · `overfitting-and-underfitting`</small> | 中級 | ML05 | — | `regression-explorer` | analysis |
| ML07 | 正則化：Ridge 與 Lasso<br><small>Regularization: Ridge and Lasso · `ridge-and-lasso-regularization`</small> | 中級 | ML06 | — | `regression-explorer` | code-python |
| ML08 | k-NN 最近鄰分類<br><small>k-Nearest Neighbors · `k-nearest-neighbors`</small> | 中級 | ML04 | A03、D15 | `classification-explorer` | code-python |
| ML09 | 邏輯迴歸<br><small>Logistic Regression · `logistic-regression`</small> | 中級 | ML05 | ML08、AIF13 | `classification-explorer` | code-python |
| ML10 | 單純貝氏分類器<br><small>Naive Bayes Classifier · `naive-bayes-classifier`</small> | 中級 | ML04、AIF13 | ML09 | `probability-explorer` | code-python |
| ML11 | 決策樹<br><small>Decision Trees · `decision-trees`</small> | 中級 | ML04 | D12、F06 | `decision-tree-explorer` | calculation |
| ML12 | 集成學習：Bagging 與隨機森林<br><small>Ensembles: Bagging and Random Forest · `bagging-and-random-forest`</small> | 中級 | ML11 | — | `decision-tree-explorer` | code-python |
| ML13 | 梯度提升<br><small>Gradient Boosting · `gradient-boosting`</small> | 進階 | ML12 | ML05 | `decision-tree-explorer` | code-python |
| ML14 | 支援向量機 SVM<br><small>Support Vector Machines · `support-vector-machines`</small> | 進階 | ML09 | ML07 | `classification-explorer` | code-python |
| ML15 | 特徵工程<br><small>Feature Engineering · `feature-engineering`</small> | 中級 | ML04 | ML07、ML11 | `data-explorer` | code-python |
| ML16 | k-means 分群<br><small>k-Means Clustering · `k-means-clustering`</small> | 中級 | ML04 | — | `clustering-explorer` | code-python |
| ML17 | 階層式分群與 DBSCAN<br><small>Hierarchical and Density-Based Clustering · `hierarchical-and-density-clustering`</small> | 中級 | ML16 | D18 | `clustering-explorer` | code-python |
| ML18 | 主成分分析 PCA<br><small>Principal Component Analysis · `principal-component-analysis`</small> | 進階 | ML04 | ML16 | `data-explorer` | code-python |
| ML19 | 模型評估指標<br><small>Model Evaluation Metrics · `model-evaluation-metrics`</small> | 中級 | ML09 | ML05 | `metric-explorer` | calculation |
| ML20 | 交叉驗證<br><small>Cross-Validation · `cross-validation`</small> | 中級 | ML19 | ML06 | `metric-explorer` | code-python |
| ML21 | 不平衡資料處理<br><small>Handling Imbalanced Data · `imbalanced-data`</small> | 進階 | ML20 | — | `metric-explorer` | code-python |
| ML22 | 超參數調整<br><small>Hyperparameter Tuning · `hyperparameter-tuning`</small> | 進階 | ML20 | ML13 | `metric-explorer` | code-python |
| ML23 | scikit-learn Pipeline 與模型組合<br><small>scikit-learn Pipelines and Model Stacking · `scikit-learn-pipelines`</small> | 進階 | ML15、ML22 | ML12 | `pipeline-diagram` | code-python |
| ML24 | 模型可解釋性<br><small>Model Interpretability · `model-interpretability`</small> | 進階 | ML12、ML19 | AIF19 | `classification-explorer` | analysis |
| ML25 | 機器學習島綜合專題<br><small>Machine Learning Capstone Project · `ml-capstone-project`</small> | 進階 | ML21、ML23、ML24 | — | `challenge-stages` | code-python |

<details><summary>學習目標、核心概念與成果</summary>

- **ML01 機器學習工作流程** — 目標：區分監督式、非監督式與強化學習的任務類型；說出問題定義、資料收集、訓練、評估到部署的流程步驟；判斷一個問題適合寫規則程式還是用機器學習；說明訓練資料與測試資料必須分開的理由。概念：監督式學習、非監督式學習、特徵與標籤、訓練與推論、泛化。成果：學完後能把一個實際問題拆成資料、模型、評估三部分並畫出機器學習流程圖。
- **ML02 NumPy 與 pandas 資料處理** — 目標：建立與切片 NumPy 陣列並用向量化運算取代迴圈；用 pandas 讀取 CSV、選取欄列與條件篩選；以 groupby 彙總資料並檢查缺失值；比較 Python list 與 ndarray 在大量資料上的效能差異。概念：ndarray、broadcasting、向量化、DataFrame、groupby、布林索引。成果：學完後能用 pandas 載入一份資料表並算出分組統計結果。
- **ML03 探索式資料分析 EDA** — 目標：計算平均數、中位數、標準差與分位數描述資料；用直方圖、箱型圖與散佈圖觀察分布與離群值；計算相關係數並說明相關不等於因果；寫出一份列出資料問題與假設的 EDA 摘要。概念：描述統計、分布、離群值、相關係數、資料視覺化。成果：學完後能對一份新資料集產出含圖表與資料問題清單的 EDA 報告。　缺口：statistics
- **ML04 資料前處理與資料切分** — 目標：以刪除或插補處理缺失值並說明取捨；對數值特徵做標準化與 min-max 縮放；對類別特徵做 one-hot 與 ordinal 編碼；切分訓練／驗證／測試集並避免資料洩漏。概念：缺失值插補、特徵縮放、one-hot 編碼、train/test split、資料洩漏。成果：學完後能把一份原始資料整理成可直接訓練、且沒有洩漏的訓練集與測試集。
- **ML05 線性迴歸** — 目標：用最小平方法說明直線如何擬合資料；調整斜率與截距觀察 MSE 的變化；用 scikit-learn 訓練多元線性迴歸並解讀係數；以 MSE 與 R² 比較模型在測試集的表現。概念：最小平方法、MSE、係數與截距、多元迴歸、R²。成果：學完後能訓練一個線性迴歸模型、解讀各係數並報告測試誤差。　缺口：linear-algebra、calculus
- **ML06 過擬合與欠擬合** — 目標：比較不同次數多項式迴歸的訓練誤差與測試誤差；以偏差—變異取捨解釋過擬合與欠擬合；讀懂學習曲線並判斷需要更多資料還是更高的模型容量；提出至少兩種改善過擬合的方法。概念：多項式迴歸、偏差—變異取捨、模型容量、學習曲線、泛化誤差。成果：學完後能從訓練與測試誤差判斷模型是過擬合還是欠擬合並提出改善方向。
- **ML07 正則化：Ridge 與 Lasso** — 目標：說明 L2 與 L1 懲罰項如何限制係數大小；調整 α 觀察 Ridge 係數收縮與 Lasso 係數歸零；判斷何時選用 Ridge、Lasso 或 Elastic Net；解釋正則化前為何需要先做特徵縮放。概念：L2 正則化、L1 正則化、正則化強度 α、係數收縮、Elastic Net。成果：學完後能用正則化降低過擬合，並用 Lasso 找出較重要的特徵。　缺口：linear-algebra
- **ML08 k-NN 最近鄰分類** — 目標：以歐氏距離與曼哈頓距離找出最近的 k 個鄰居；調整 k 觀察決策邊界的平滑程度；說明特徵縮放對距離型模型的影響；分析 k-NN 的預測成本與維度詛咒。概念：距離度量、k 值選擇、決策邊界、惰性學習、維度詛咒。成果：學完後能實作並調整 k-NN 分類器，說明 k 與特徵縮放如何影響結果。
- **ML09 邏輯迴歸** — 目標：用 sigmoid 將線性分數轉換為類別機率；說明交叉熵損失為何適合分類問題；調整決策門檻觀察預測結果的改變；以 softmax 延伸到多類別分類。概念：sigmoid、對數勝算、交叉熵、決策門檻、softmax。成果：學完後能訓練邏輯迴歸分類器並依需求調整決策門檻。　缺口：probability、calculus
- **ML10 單純貝氏分類器** — 目標：套用貝氏定理計算各類別的後驗機率；說明條件獨立假設與其限制；用詞頻特徵訓練一個文字分類器；以拉普拉斯平滑處理訓練時沒看過的特徵值。概念：貝氏定理、條件獨立、先驗與後驗、拉普拉斯平滑、詞袋模型。成果：學完後能做出一個垃圾訊息分類器並手算一筆預測的機率。　缺口：probability
- **ML11 決策樹** — 目標：以 Gini 不純度或資訊增益選擇分裂特徵；手動追蹤一棵小決策樹的預測路徑；以最大深度與最小樣本數控制過擬合；從樹結構讀出可解釋的判斷規則。概念：Gini 不純度、熵與資訊增益、節點分裂、剪枝、樹深度。成果：學完後能手算一次最佳分裂，並用決策樹產出可讀的分類規則。
- **ML12 集成學習：Bagging 與隨機森林** — 目標：說明多數決投票與平均為何能降低模型變異；以 bootstrap 抽樣建立多棵決策樹；調整樹的數量與特徵抽樣比例觀察效果；用 OOB 分數估計泛化表現。概念：集成學習、bootstrap、bagging、特徵隨機抽樣、OOB 誤差、投票法。成果：學完後能訓練隨機森林並說明它為何通常比單棵決策樹穩定。
- **ML13 梯度提升** — 目標：說明 boosting 如何逐輪擬合前一輪的殘差；調整學習率與樹的數量觀察欠擬合與過擬合；比較 bagging 與 boosting 在偏差與變異上的差異；使用 HistGradientBoosting 或 XGBoost／LightGBM 訓練表格資料模型。概念：boosting、殘差擬合、弱學習器、學習率、early stopping。成果：學完後能用梯度提升模型在表格資料上建立強基準並控制過擬合。
- **ML14 支援向量機 SVM** — 目標：說明最大間隔超平面與支援向量；調整 C 觀察軟間隔與誤分類之間的取捨；比較線性、多項式與 RBF 核函數的決策邊界；判斷 SVM 適合與不適合的資料規模。概念：最大間隔、支援向量、軟間隔 C、核函數、RBF 核。成果：學完後能選擇核函數與 C 值訓練 SVM，並解釋決策邊界的形狀。　缺口：linear-algebra
- **ML15 特徵工程** — 目標：從日期、文字與類別欄位建構新特徵；建立交互作用與分箱特徵並比較模型表現；以過濾法、包裝法、嵌入法做特徵選擇；檢查新特徵是否造成資料洩漏。概念：特徵建構、分箱、交互作用項、特徵選擇、目標編碼。成果：學完後能為一份表格資料設計新特徵，並用驗證結果證明它們有幫助。
- **ML16 k-means 分群** — 目標：逐步執行 k-means 的指派與更新步驟；用手肘法與輪廓係數選擇 k；說明初始化對結果的影響與 k-means++ 的改進；辨認 k-means 不適合的群形狀。概念：群中心、指派與更新、慣性、輪廓係數、k-means++。成果：學完後能對無標籤資料做 k-means 分群並為選擇的 k 提出理由。
- **ML17 階層式分群與 DBSCAN** — 目標：以凝聚式方法合併群並讀懂樹狀圖；比較 single、complete、average linkage 的分群結果；調整 eps 與 min_samples 讓 DBSCAN 找出任意形狀的群與雜訊點；依資料特性選擇合適的分群方法。概念：凝聚式分群、樹狀圖、linkage、DBSCAN、雜訊點。成果：學完後能比較 k-means、階層式分群與 DBSCAN，並為一份資料選出合適方法。
- **ML18 主成分分析 PCA** — 目標：說明主成分是資料變異最大的方向；以解釋變異比例決定要保留的維度數；將高維資料投影到 2D 並視覺化；比較 PCA 與 t-SNE／UMAP 的用途差異。概念：主成分、解釋變異比例、投影、降維、t-SNE／UMAP。成果：學完後能用 PCA 壓縮特徵維度並畫出資料的 2D 投影圖。　缺口：linear-algebra
- **ML19 模型評估指標** — 目標：從混淆矩陣計算準確率、精確率、召回率與 F1；繪製 ROC 與 PR 曲線並解讀 AUC；選擇 MAE、RMSE 或 R² 評估迴歸模型；依應用情境判斷最該優化的指標。概念：混淆矩陣、精確率與召回率、F1、ROC-AUC、PR 曲線、MAE／RMSE。成果：學完後能從預測結果算出各項指標，並依情境說明該看哪一個。
- **ML20 交叉驗證** — 目標：執行 k-fold 交叉驗證並報告平均與標準差；對類別比例懸殊的資料使用分層 k-fold；對時間序列資料使用時間順序切分避免偷看未來；說明測試集為何只能在最後使用一次。概念：k-fold、分層抽樣、留一法、時間序列切分、驗證集。成果：學完後能用交叉驗證可靠地比較兩個模型的表現。
- **ML21 不平衡資料處理** — 目標：辨識準確率在不平衡資料上的誤導；比較過採樣、欠採樣與 SMOTE 的效果；以類別權重與門檻調整提升少數類別的召回率；在交叉驗證的每一折內進行重抽樣以避免洩漏。概念：類別不平衡、過採樣與欠採樣、SMOTE、類別權重、門檻調整。成果：學完後能在詐欺或罕見事件資料上建立不被準確率誤導的分類器。
- **ML22 超參數調整** — 目標：區分模型參數與超參數；以網格搜尋與隨機搜尋找出較佳設定；以巢狀交叉驗證或保留測試集避免過度樂觀的分數；比較貝氏最佳化等進階搜尋方法的成本與效益。概念：超參數、GridSearchCV、RandomizedSearchCV、搜尋空間、巢狀交叉驗證。成果：學完後能設計搜尋空間調整模型，並報告不偏頗的最終分數。
- **ML23 scikit-learn Pipeline 與模型組合** — 目標：用 Pipeline 與 ColumnTransformer 串接前處理與模型；把整條 Pipeline 放進交叉驗證以防止資料洩漏；以 VotingClassifier 或 StackingClassifier 組合多個模型；儲存與載入訓練好的 Pipeline 供推論使用。概念：Pipeline、ColumnTransformer、voting、stacking、模型序列化。成果：學完後能把前處理、模型與調參包成一條可重複執行並可存檔的 Pipeline。
- **ML24 模型可解釋性** — 目標：比較模型係數、樹模型特徵重要性與排列重要性；用 SHAP 值解釋單筆預測的特徵貢獻；以部分依賴圖觀察特徵與預測之間的關係；檢查模型是否依賴敏感特徵或洩漏特徵。概念：全域與局部解釋、排列重要性、SHAP、部分依賴圖、公平性檢查。成果：學完後能向非技術人員說明模型為何做出某個預測，並指出可疑的特徵。
- **ML25 機器學習島綜合專題** — 目標：定義一個表格資料預測問題與成功指標；完成 EDA、特徵工程、模型比較與調參的完整流程；以交叉驗證與保留測試集報告可信的結果；撰寫包含限制與風險的模型報告。概念：端到端專案、基準模型、實驗紀錄、模型報告、可重現性。成果：學完後能獨立完成一個從原始資料到模型報告的機器學習專案。

</details>

### DL — 深度學習島（Deep Learning，`deep-learning`，25 堂）

從神經元、梯度下降與反向傳播出發，以 PyTorch 實作 CNN、RNN、注意力與 Transformer，並涵蓋訓練管線、除錯與模型匯出；LLM 的預訓練與應用交給大型語言模型島，線上服務與 MLOps 交給 AI 工程島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| DL01 | 神經網路基礎<br><small>Neural Network Basics · `neural-network-basics`</small> | 入門 | ML09 | ML05 | `nn-forward` | calculation |
| DL02 | 激活函數與損失函數<br><small>Activation and Loss Functions · `activation-and-loss-functions`</small> | 入門 | DL01 | — | `nn-forward` | calculation |
| DL03 | 梯度下降<br><small>Gradient Descent · `gradient-descent`</small> | 入門 | DL02 | ML05 | `gradient-descent` | simulation |
| DL04 | 計算圖與連鎖律<br><small>Computational Graphs and the Chain Rule · `computational-graphs`</small> | 中級 | DL03 | D16 | `backprop-graph` | calculation |
| DL05 | 反向傳播<br><small>Backpropagation · `backpropagation`</small> | 中級 | DL04 | — | `backprop-graph` | calculation |
| DL06 | 從零實作多層感知器<br><small>Building an MLP from Scratch · `mlp-from-scratch`</small> | 中級 | DL05、ML02 | — | `training-curves` | code-python |
| DL07 | 權重初始化與梯度消失<br><small>Weight Initialization and Vanishing Gradients · `weight-initialization`</small> | 中級 | DL06 | — | `training-curves` | simulation |
| DL08 | PyTorch 入門<br><small>PyTorch Basics · `pytorch-basics`</small> | 中級 | DL05、ML02 | DL06 | `backprop-graph` | code-python |
| DL09 | PyTorch 模型與訓練迴圈<br><small>PyTorch Models and the Training Loop · `pytorch-training-loop`</small> | 中級 | DL08 | — | `training-curves` | code-python |
| DL10 | PyTorch 資料集與 DataLoader<br><small>PyTorch Datasets and DataLoaders · `pytorch-datasets-and-dataloaders`</small> | 中級 | DL09 | ML04 | `pipeline-diagram` | code-python |
| DL11 | 最佳化器：SGD、Momentum 與 Adam<br><small>Optimizers: SGD, Momentum, and Adam · `deep-learning-optimizers`</small> | 中級 | DL09 | DL07 | `gradient-descent` | simulation |
| DL12 | 深度學習正則化：Dropout 與 Batch Norm<br><small>Regularization in Deep Learning: Dropout and Batch Norm · `deep-learning-regularization`</small> | 中級 | DL11 | ML06、ML07 | `training-curves` | code-python |
| DL13 | 卷積神經網路 CNN<br><small>Convolutional Neural Networks · `convolutional-neural-networks`</small> | 中級 | DL09 | F12、DL12 | `conv-visualizer` | code-python |
| DL14 | CNN 經典架構與殘差網路<br><small>CNN Architectures and Residual Networks · `cnn-architectures`</small> | 進階 | DL13 | DL12 | `architecture-diagram` | calculation |
| DL15 | 循環神經網路：RNN、LSTM 與 GRU<br><small>Recurrent Neural Networks: RNN, LSTM, and GRU · `recurrent-neural-networks`</small> | 進階 | DL09 | DL07 | `sequence-model` | code-python |
| DL16 | 注意力機制<br><small>The Attention Mechanism · `attention-mechanism`</small> | 進階 | DL15 | — | `attention-explorer` | calculation |
| DL17 | 多頭注意力與位置編碼<br><small>Multi-Head Attention and Positional Encoding · `multi-head-attention`</small> | 進階 | DL16 | — | `attention-explorer` | code-python |
| DL18 | Transformer 架構<br><small>The Transformer Architecture · `transformer-architecture`</small> | 進階 | DL17 | DL12、DL14 | `architecture-diagram` | code-python |
| DL19 | 遷移學習與微調<br><small>Transfer Learning and Fine-Tuning · `transfer-learning`</small> | 進階 | DL14 | DL18 | `training-curves` | code-python |
| DL20 | 序列建模實務<br><small>Sequence Modeling in Practice · `sequence-modeling-in-practice`</small> | 進階 | DL15、DL18 | A09 | `sequence-model` | code-python |
| DL21 | 深度學習訓練管線<br><small>Deep Learning Training Pipelines · `deep-learning-training-pipelines`</small> | 進階 | DL10、DL12 | — | `pipeline-diagram` | code-python |
| DL22 | 訓練除錯與視覺化<br><small>Debugging and Visualizing Training · `debugging-neural-network-training`</small> | 進階 | DL21 | F17 | `training-curves` | analysis |
| DL23 | 神經網路可解釋性<br><small>Interpreting Neural Networks · `interpreting-neural-networks`</small> | 進階 | DL13 | ML24、DL16 | `conv-visualizer` | analysis |
| DL24 | 模型匯出與推論準備<br><small>Model Export and Inference Readiness · `model-export-and-inference`</small> | 進階 | DL21 | — | `deployment-simulator` | code-python |
| DL25 | 深度學習島綜合專題<br><small>Deep Learning Capstone Project · `deep-learning-capstone`</small> | 進階 | DL19、DL22、DL24 | DL20、DL23 | `challenge-stages` | code-python |

<details><summary>學習目標、核心概念與成果</summary>

- **DL01 神經網路基礎** — 目標：說明感知器如何用權重、偏差與門檻做決策；計算一個兩層網路的前向傳播輸出；以矩陣乘法表示一整層神經元的運算；解釋單層感知器無法解 XOR 的原因。概念：神經元、感知器、權重與偏差、層、前向傳播、XOR 問題。成果：學完後能手算一個小型神經網路的輸出，並說明為什麼需要多層。　缺口：linear-algebra
- **DL02 激活函數與損失函數** — 目標：比較 sigmoid、tanh、ReLU 與 GELU 的形狀與飽和問題；說明非線性激活為何讓深層網路有表達力；為迴歸選擇 MSE、為分類選擇交叉熵損失；計算 softmax 與交叉熵在一筆樣本上的值。概念：ReLU、sigmoid／tanh、GELU、MSE、交叉熵、softmax。成果：學完後能依任務選擇輸出層激活與損失函數並算出損失值。
- **DL03 梯度下降** — 目標：以斜率說明梯度如何指出損失下降的方向；調整學習率觀察收斂、震盪與發散；比較批次、隨機與小批次梯度下降；辨認局部極小值與鞍點對訓練的影響。概念：梯度、學習率、小批次、收斂、損失曲面、鞍點。成果：學完後能在損失曲面上預測不同學習率的下降路徑並選出合理的學習率。　缺口：calculus
- **DL04 計算圖與連鎖律** — 目標：將一個運算式拆成計算圖的節點與邊；以連鎖律計算複合函數的偏導數；在計算圖上追蹤局部梯度如何相乘傳遞；區分前向模式與反向模式自動微分。概念：計算圖、連鎖律、偏導數、局部梯度、自動微分。成果：學完後能畫出一個運算式的計算圖並逐節點算出梯度。　缺口：calculus
- **DL05 反向傳播** — 目標：逐層計算兩層網路中每個權重的梯度；說明反向傳播如何重用中間結果節省計算；以數值梯度檢查驗證手算的梯度；用算出的梯度更新權重完成一次訓練步驟。概念：反向傳播、誤差訊號、中間值快取、梯度檢查、參數更新。成果：學完後能完整手算一個小網路的一次前向、反向與權重更新。　缺口：calculus
- **DL06 從零實作多層感知器** — 目標：用 NumPy 實作前向、損失、反向與更新四個步驟；以向量化方式一次處理一個小批次；訓練網路解決 XOR 或月牙形資料分類；繪製訓練損失曲線確認模型正在學習。概念：多層感知器、向量化、訓練迴圈、epoch、決策邊界。成果：學完後能不用框架寫出可訓練的多層感知器並解出非線性分類問題。
- **DL07 權重初始化與梯度消失** — 目標：說明全零初始化為何造成對稱問題；觀察深層網路中梯度消失與梯度爆炸的現象；比較 Xavier 與 He 初始化適用的激活函數；以梯度裁剪處理梯度爆炸。概念：對稱性破缺、梯度消失、梯度爆炸、Xavier 初始化、He 初始化、梯度裁剪。成果：學完後能從各層梯度大小判斷初始化是否恰當並選擇合適的初始化方法。
- **DL08 PyTorch 入門** — 目標：建立與操作 tensor 並在 CPU 與 GPU 之間移動；在 tensor 與 NumPy 陣列之間轉換並使用廣播；用 autograd 自動計算梯度並與手算結果比對；說明 requires_grad、計算圖與 torch.no_grad 的作用。概念：tensor、dtype 與 device、autograd、requires_grad、torch.no_grad。成果：學完後能用 PyTorch tensor 與 autograd 重現手算的梯度。
- **DL09 PyTorch 模型與訓練迴圈** — 目標：用 nn.Module 定義含多層的模型；寫出 forward、loss、backward、step、zero_grad 的完整訓練迴圈；切換 train() 與 eval() 模式並在驗證集上評估；儲存與載入模型的 state_dict。概念：nn.Module、損失函數物件、optimizer、zero_grad、train／eval 模式、state_dict。成果：學完後能用 PyTorch 從零寫出一個可訓練、可評估、可存檔的分類模型。
- **DL10 PyTorch 資料集與 DataLoader** — 目標：實作自訂 Dataset 的 __len__ 與 __getitem__；用 DataLoader 設定 batch_size、shuffle 與 num_workers；以 transforms 做資料正規化與擴增；切分訓練與驗證資料並確認沒有重疊。概念：Dataset、DataLoader、mini-batch、shuffle、transforms、collate_fn。成果：學完後能把自己的資料包成 Dataset 並以 DataLoader 餵給訓練迴圈。
- **DL11 最佳化器：SGD、Momentum 與 Adam** — 目標：比較 SGD、Momentum、RMSProp 與 Adam 在損失曲面上的路徑；說明 Adam 的一階與二階動量估計；以學習率排程（warmup、cosine decay）改善訓練；區分 Adam 的 L2 正則與 AdamW 的解耦權重衰減。概念：SGD、Momentum、Adam／AdamW、學習率排程、warmup。成果：學完後能為一個訓練任務選擇最佳化器與學習率排程並說明理由。　缺口：calculus
- **DL12 深度學習正則化：Dropout 與 Batch Norm** — 目標：以 dropout 與權重衰減降低過擬合；說明 batch normalization 與 layer normalization 的計算與差異；以 early stopping 依驗證損失停止訓練；用資料擴增增加訓練資料的多樣性。概念：dropout、權重衰減、batch normalization、layer normalization、early stopping、資料擴增。成果：學完後能從訓練曲線看出過擬合，並套用適當的正則化把驗證誤差降下來。
- **DL13 卷積神經網路 CNN** — 目標：手算卷積核在影像上滑動產生的特徵圖；說明 stride、padding 與輸出尺寸的關係；比較 max pooling 與 average pooling 的作用；用 PyTorch 建立一個小型 CNN 分類影像。概念：卷積、卷積核、stride／padding、特徵圖、池化、感受野。成果：學完後能計算卷積層輸出尺寸，並訓練一個小 CNN 辨識手寫數字。
- **DL14 CNN 經典架構與殘差網路** — 目標：比較 LeNet、AlexNet 與 VGG 的層數與設計思路；說明殘差連接如何讓很深的網路可以訓練；計算一個卷積層的參數量；依任務規模選擇合適的骨幹網路。概念：LeNet／VGG、ResNet、殘差連接、1×1 卷積、參數量、骨幹網路。成果：學完後能讀懂 ResNet 類架構圖並算出各層的參數量。
- **DL15 循環神經網路：RNN、LSTM 與 GRU** — 目標：展開 RNN 在時間步上的計算並追蹤隱藏狀態；說明時間反向傳播與長序列的梯度消失；比較 LSTM 的門控結構與 GRU 的簡化設計；以 encoder-decoder 架構處理序列到序列任務。概念：隱藏狀態、BPTT、LSTM、GRU、seq2seq。成果：學完後能用 LSTM 處理一個序列任務並解釋隱藏狀態如何攜帶資訊。
- **DL16 注意力機制** — 目標：說明 seq2seq 固定長度向量的瓶頸與注意力的動機；計算 query、key、value 的縮放點積注意力；讀懂注意力權重熱圖代表的對齊關係；說明 self-attention 如何讓每個位置看見整個序列。概念：query／key／value、縮放點積注意力、注意力權重、self-attention、softmax。成果：學完後能手算一個小矩陣的注意力輸出並解讀注意力權重。　缺口：linear-algebra
- **DL17 多頭注意力與位置編碼** — 目標：說明多頭注意力如何讓模型同時關注不同關係；追蹤多頭注意力中張量形狀的變化；比較正弦位置編碼、可學習位置編碼與 RoPE 的概念；用 padding mask 與 causal mask 限制注意力可看的位置。概念：多頭注意力、位置編碼、RoPE、padding mask、causal mask。成果：學完後能用 PyTorch 實作含遮罩的多頭注意力並驗證輸出形狀。　缺口：linear-algebra
- **DL18 Transformer 架構** — 目標：畫出 Transformer encoder block 與 decoder block 的組成；說明殘差連接、LayerNorm 與前饋網路在 block 中的角色；比較 encoder-only、decoder-only 與 encoder-decoder 的用途；用 PyTorch 組出一個迷你 Transformer block。概念：encoder／decoder、前饋網路、殘差與 LayerNorm、pre-norm、cross-attention。成果：學完後能從零組出一個 Transformer block 並說明每個子層的作用。
- **DL19 遷移學習與微調** — 目標：載入預訓練模型並替換分類頭；比較凍結骨幹的特徵擷取與全模型微調；選擇微調時的學習率與逐層解凍策略；評估小資料集上遷移學習相對從零訓練的效益。概念：預訓練模型、特徵擷取、微調、凍結層、領域差距。成果：學完後能用預訓練模型在少量資料上訓練出比從零開始更好的分類器。
- **DL20 序列建模實務** — 目標：把時間序列或文字資料整理成滑動視窗與批次；比較 RNN、1D CNN 與 Transformer encoder 在同一任務的表現；處理變長序列的 padding、packing 與遮罩；選擇適合序列任務的切分與評估方式。概念：滑動視窗、變長序列、padding 與遮罩、1D 卷積、時間序列預測。成果：學完後能為一個序列任務選擇並比較三種模型架構。
- **DL21 深度學習訓練管線** — 目標：設定隨機種子並記錄實驗設定以重現結果；使用 checkpoint 中斷與恢復訓練；以混合精度與梯度累積在有限 GPU 記憶體下訓練；組織訓練、驗證、測試三個階段的程式結構。概念：可重現性、checkpoint、混合精度、梯度累積、實驗追蹤。成果：學完後能寫出可中斷恢復、可重現且有實驗紀錄的訓練程式。　缺口：software-engineering-practice
- **DL22 訓練除錯與視覺化** — 目標：從訓練與驗證曲線診斷過擬合、欠擬合與學習率問題；以「過擬合單一批次」測試檢查模型與資料管線；監看梯度範數與激活分布找出數值問題；用 TensorBoard 類工具記錄並比較多次實驗。概念：損失曲線、過擬合單一批次、梯度範數、NaN 偵錯、學習率搜尋。成果：學完後能依訓練曲線與梯度紀錄找出一個「不收斂」模型的原因。
- **DL23 神經網路可解釋性** — 目標：以梯度顯著圖找出影響預測的輸入區域；說明 Grad-CAM 如何定位 CNN 關注的影像位置；說明把注意力權重當作解釋的限制；檢查模型是否學到資料中的捷徑特徵。概念：saliency map、Grad-CAM、integrated gradients、捷徑學習、注意力解釋的限制。成果：學完後能用 Grad-CAM 等方法檢查影像模型是否看對了地方。
- **DL24 模型匯出與推論準備** — 目標：以 eval 模式與 torch.inference_mode 進行推論；將 PyTorch 模型匯出為 ONNX 或 torch.export 格式；測量推論延遲並觀察批次大小對吞吐量的影響；撰寫與訓練時一致的前後處理推論函式。概念：inference_mode、ONNX、torch.export、延遲與吞吐量、前後處理一致性。成果：學完後能把訓練好的模型匯出成可交給部署環境使用的推論檔案與函式。
- **DL25 深度學習島綜合專題** — 目標：選擇影像或序列任務並建立基準模型；運用遷移學習、正則化與調參提升表現；以訓練曲線與錯誤分析說明模型行為；匯出可推論的模型並撰寫模型卡。概念：端到端專案、基準模型、錯誤分析、模型卡、可重現性。成果：學完後能獨立完成一個從資料、訓練到匯出模型的深度學習專案。

</details>

### LLM — 大型語言模型島（Large Language Models，`large-language-models`，25 堂）

分為模型原理（斷詞、嵌入、預訓練、對齊、微調、推論與量化）與應用開發（API、提示、結構化輸出、RAG、評估與安全）兩條路線，應用路線不需先修機器學習或深度學習；Agent 系統交給 AI 代理島，部署維運交給 AI 工程島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| LLM01 | 大型語言模型概觀<br><small>Large Language Models Overview · `llm-overview`（application）</small> | 入門 | AIF01 | AIF19 | `sampling-explorer` | analysis |
| LLM02 | Tokenization 斷詞<br><small>Tokenization · `tokenization`（model）</small> | 入門 | LLM01 | DL01、D09、F10 | `token-explorer` | simulation |
| LLM03 | 嵌入向量<br><small>Embeddings · `embeddings`（model）</small> | 中級 | LLM02 | DL01 | `embedding-space` | calculation |
| LLM04 | 用 Transformer 做語言模型<br><small>Transformers as Language Models · `transformer-language-models`（model）</small> | 中級 | LLM03、DL18 | — | `attention-explorer` | code-python |
| LLM05 | 預訓練目標與資料<br><small>Pretraining Objectives and Data · `pretraining-objectives`（model）</small> | 中級 | LLM04 | — | `token-explorer` | calculation |
| LLM06 | 規模法則與運算預算<br><small>Scaling Laws and Compute Budgets · `scaling-laws`（model）</small> | 進階 | LLM05 | — | `cost-calculator` | calculation |
| LLM07 | 解碼策略與取樣<br><small>Decoding Strategies and Sampling · `decoding-strategies`（model）</small> | 中級 | LLM02 | LLM04、AIF13 | `sampling-explorer` | simulation |
| LLM08 | 指令微調與聊天模型<br><small>Instruction Tuning and Chat Models · `instruction-tuning`（model）</small> | 進階 | LLM05 | — | `prompt-lab` | analysis |
| LLM09 | 使用 LLM API<br><small>Using LLM APIs · `llm-apis`（application）</small> | 入門 | LLM01、CN14 | LLM02、LLM07 | `prompt-lab` | code-python |
| LLM10 | 提示工程<br><small>Prompt Engineering · `prompt-engineering`（application）</small> | 入門 | LLM09 | — | `prompt-lab` | prompt |
| LLM11 | 上下文與對話管理<br><small>Context and Conversation Management · `context-window-management`（application）</small> | 中級 | LLM10 | LLM02 | `token-explorer` | code-python |
| LLM12 | 結構化輸出<br><small>Structured Outputs · `structured-outputs`（application）</small> | 中級 | LLM10 | PL04、CN14 | `prompt-lab` | code-python |
| LLM13 | 函式呼叫基礎<br><small>Function Calling Basics · `function-calling-basics`（application）</small> | 中級 | LLM12 | AIF03 | `tool-call-trace` | code-python |
| LLM14 | RAG 檢索增強生成<br><small>Retrieval-Augmented Generation · `rag-basics`（application）</small> | 中級 | LLM03、LLM10 | — | `rag-explorer` | code-python |
| LLM15 | 向量檢索<br><small>Vector Retrieval · `vector-retrieval`（application）</small> | 中級 | LLM14 | D10、D15、DB01 | `embedding-space` | code-python |
| LLM16 | 文件切塊與索引<br><small>Document Chunking and Indexing · `document-chunking`（application）</small> | 中級 | LLM15 | — | `rag-explorer` | code-python |
| LLM17 | 混合檢索與重排序<br><small>Hybrid Search and Reranking · `hybrid-search-and-reranking`（application）</small> | 進階 | LLM16 | DB03 | `rag-explorer` | code-python |
| LLM18 | 幻覺與安全<br><small>Hallucination and Safety · `hallucination-and-safety`（application）</small> | 中級 | LLM14 | AIF19、CN18 | `guardrail-sim` | analysis |
| LLM19 | 偏好對齊：RLHF 與 DPO<br><small>Preference Alignment: RLHF and DPO · `preference-alignment`（model）</small> | 進階 | LLM08 | AIF19 | `pipeline-diagram` | analysis |
| LLM20 | LLM 評估<br><small>Evaluating LLMs · `llm-evaluation`（application）</small> | 中級 | LLM10 | LLM05、ML19 | `eval-dashboard` | analysis |
| LLM21 | 微調與 LoRA<br><small>Fine-Tuning and LoRA · `fine-tuning-and-lora`（model）</small> | 進階 | LLM08、DL19 | LLM20 | `training-curves` | code-python |
| LLM22 | 推論與 KV Cache<br><small>Inference and the KV Cache · `kv-cache-and-inference`（model）</small> | 進階 | LLM04、LLM07 | — | `attention-explorer` | calculation |
| LLM23 | 模型量化<br><small>Model Quantization · `quantization`（model）</small> | 進階 | LLM22 | F02、LLM20 | `cost-calculator` | calculation |
| LLM24 | LLM 應用評估<br><small>Evaluating LLM Applications · `llm-app-evaluation`（application）</small> | 進階 | LLM17、LLM20 | SA16 | `eval-dashboard` | analysis |
| LLM25 | 大型語言模型島綜合專題<br><small>Large Language Models Capstone Project · `llm-app-capstone`（application）</small> | 進階 | LLM13、LLM18、LLM24 | LLM11 | `challenge-stages` | code-python |

<details><summary>學習目標、核心概念與成果</summary>

- **LLM01 大型語言模型概觀** — 目標：說明 LLM 以預測下一個 token 逐步生成文字的基本原理；區分基礎模型、指令模型與推理模型的用途；列出 LLM 的常見限制：幻覺、知識截止與上下文長度；判斷一個需求適合直接提示、RAG 或微調。概念：下一個 token 預測、基礎模型與指令模型、上下文視窗、知識截止、幻覺。成果：學完後能向他人解釋 LLM 如何生成文字，並為一個需求選擇合適的使用方式。
- **LLM02 Tokenization 斷詞** — 目標：以 BPE 合併規則逐步把文字切成子詞 token；比較中文、英文與程式碼的 token 數差異；說明詞彙表大小與未知字之間的取捨；估算一段提示的 token 數與費用。概念：子詞斷詞、BPE、詞彙表、token ID、特殊 token。成果：學完後能預測一段中文與英文文字會被切成哪些 token 並估算成本。
- **LLM03 嵌入向量** — 目標：說明 embedding 如何把 token 或文件映射成向量；計算餘弦相似度比較兩段文字的語意；區分模型內部的 token embedding 與文件 embedding 模型；在 2D 投影中觀察語意相近的詞彼此靠近。概念：向量表示、餘弦相似度、embedding 表、句子 embedding、向量維度。成果：學完後能用 embedding 與餘弦相似度找出語意最接近的句子。　缺口：linear-algebra
- **LLM04 用 Transformer 做語言模型** — 目標：追蹤 decoder-only 模型從 token 到 logits 的資料流；說明因果遮罩如何讓模型只看見過去的 token；把 logits 經 softmax 轉成下一個 token 的機率分布；比較 GPT 類與 BERT 類模型的結構與用途。概念：decoder-only、因果遮罩、logits、語言模型頭、自迴歸生成。成果：學完後能用一個小型 decoder-only 模型逐 token 生成文字並解釋每一步。
- **LLM05 預訓練目標與資料** — 目標：比較因果語言模型與遮罩語言模型的訓練目標；計算一段文字的交叉熵損失與困惑度；說明預訓練資料的清理、去重與過濾步驟；辨認資料污染對評估結果的影響。概念：causal LM、masked LM、困惑度、預訓練語料、去重、資料污染。成果：學完後能計算困惑度並說明預訓練資料品質如何影響模型。　缺口：probability
- **LLM06 規模法則與運算預算** — 目標：說明參數量、訓練 token 數與運算量之間的關係；從對數座標圖讀出損失隨規模下降的趨勢；估算訓練一個模型所需的 FLOPs 數量級；討論 compute-optimal 訓練與推論成本對模型大小的影響。概念：參數量、訓練 token 數、FLOPs、compute-optimal、推論成本。成果：學完後能粗估一個模型的訓練運算量並說明為何「更大」不一定更划算。
- **LLM07 解碼策略與取樣** — 目標：比較 greedy、beam search 與隨機取樣的輸出差異；調整 temperature、top-k、top-p 觀察機率分布的變化；說明重複懲罰與停止條件的作用；依任務選擇偏確定或偏多樣的解碼設定。概念：greedy decoding、beam search、temperature、top-k／top-p、停止序列。成果：學完後能依任務設定 temperature 與 top-p，並預測輸出風格的變化。　缺口：probability
- **LLM08 指令微調與聊天模型** — 目標：說明監督式微調（SFT）如何把基礎模型變成指令模型；讀懂聊天模板中 system、user、assistant 的角色標記；評估指令資料集的品質與多樣性；比較基礎模型與指令模型對同一提示的回應。概念：SFT、指令資料集、聊天模板、角色標記、災難性遺忘。成果：學完後能說明聊天模型如何從基礎模型訓練而來，並評估一份指令資料集。
- **LLM09 使用 LLM API** — 目標：以 HTTP 或官方 SDK 送出訊息並解析回應；設定模型名稱、最大輸出 token 數與 temperature 等參數；處理串流回應、速率限制與錯誤重試；用環境變數或密鑰管理工具保護 API 金鑰。概念：messages 格式、串流回應、速率限制、token 計費、API 金鑰管理。成果：學完後能寫出一支穩定呼叫 LLM API、處理錯誤並記錄 token 用量的程式。
- **LLM10 提示工程** — 目標：撰寫包含角色、任務、限制與輸出格式的清楚指示；以 few-shot 範例引導模型產出一致格式；把複雜任務拆成多個步驟或提示鏈；比較不同提示版本的輸出並記錄改進。概念：system prompt、zero-shot／few-shot、分隔符、提示鏈、提示迭代。成果：學完後能把一個模糊需求改寫成輸出穩定、可重複使用的提示。
- **LLM11 上下文與對話管理** — 目標：以 messages 陣列維護多輪對話狀態；估算並控制提示、歷史與輸出的 token 預算；比較截斷、摘要與檢索三種長對話處理策略；說明 prompt caching 如何降低成本與延遲。概念：多輪對話、token 預算、上下文截斷、對話摘要、prompt caching。成果：學完後能做出不會超出上下文長度、且成本可控的多輪對話程式。
- **LLM12 結構化輸出** — 目標：用 JSON Schema 描述期望的輸出結構；讓模型產出可被程式解析的 JSON 並驗證欄位；處理解析失敗、缺欄位與型別錯誤的重試策略；比較提示要求、JSON 模式與受限解碼的可靠度。概念：JSON Schema、結構化輸出、Pydantic／Zod 驗證、受限解碼、錯誤重試。成果：學完後能讓 LLM 穩定輸出符合 schema 的 JSON，並在程式中安全使用。
- **LLM13 函式呼叫基礎** — 目標：為一個函式撰寫名稱、說明與參數 schema；解讀模型回傳的函式呼叫請求並在程式端執行；把函式執行結果回傳給模型產生最終回答；在執行前驗證模型提供的參數。概念：函式定義 schema、函式呼叫請求、執行與回傳結果、參數驗證、單輪呼叫。成果：學完後能讓 LLM 透過一個自訂函式查詢資料並回答使用者。
- **LLM14 RAG 檢索增強生成** — 目標：說明 RAG 的檢索、組合提示、生成三個步驟；判斷何時該用 RAG 而不是微調或長上下文；把檢索到的段落放入提示並要求模型附上來源；區分檢索失敗與生成失敗兩類錯誤。概念：檢索增強生成、知識庫、上下文注入、來源引用、grounding。成果：學完後能做出一個根據指定文件回答並附上出處的問答程式。
- **LLM15 向量檢索** — 目標：用 embedding 與餘弦相似度實作 top-k 檢索；比較暴力搜尋與 HNSW 等近似最近鄰索引；使用向量資料庫存放向量與 metadata 並做過濾；以 recall@k 評估檢索結果。概念：top-k 相似度搜尋、近似最近鄰 ANN、HNSW、向量資料庫、metadata 過濾、recall@k。成果：學完後能為一組文件建立向量索引，並量測檢索的準確度與速度。　缺口：linear-algebra
- **LLM16 文件切塊與索引** — 目標：比較固定長度、遞迴與依標題段落結構的切塊方法；調整 chunk 大小與重疊並觀察檢索品質；從 PDF、HTML 等來源抽取文字並保留 metadata；設計文件更新時的增量重新索引流程。概念：chunk 大小、重疊、結構化切塊、文件解析、增量索引。成果：學完後能為一份真實文件集選擇切塊策略，並用檢索結果證明選擇合理。
- **LLM17 混合檢索與重排序** — 目標：比較關鍵字檢索（BM25）與向量檢索的優缺點；以倒數排名融合（RRF）合併兩種檢索結果；使用 cross-encoder 重排序器提升前幾名的相關性；以查詢改寫處理模糊或口語化的使用者問題。概念：BM25、混合檢索、RRF、cross-encoder 重排序、查詢改寫。成果：學完後能把關鍵字檢索、向量檢索與重排序組合成更準的檢索流程。
- **LLM18 幻覺與安全** — 目標：辨識事實錯誤、捏造引用與不忠於來源三類幻覺；以 grounding、引用檢查與允許回答「不知道」降低幻覺；設計輸入與輸出的內容審核流程處理有害內容與個資；說明越獄與提示注入的風險及基本防護方式。概念：幻覺、忠實度、內容審核、個資保護、越獄、提示注入。成果：學完後能為一個 LLM 應用列出主要風險並設計對應的防護措施。
- **LLM19 偏好對齊：RLHF 與 DPO** — 目標：說明 RLHF 中偏好資料、獎勵模型與策略最佳化的流程；比較 DPO 與 RLHF 在訓練流程上的差異；辨認獎勵駭客與過度拒答等對齊副作用；分析一組成對偏好資料的標註品質。概念：偏好資料、獎勵模型、RLHF、PPO、DPO、獎勵駭客。成果：學完後能畫出 RLHF 與 DPO 的訓練流程並說明兩者的取捨。　缺口：probability
- **LLM20 LLM 評估** — 目標：區分能力基準測試、任務評估集與人工評估；為一個任務建立含標準答案的小型評估集；使用 LLM-as-judge 評分並檢查評審偏誤；說明基準污染與跨模型分數比較的限制。概念：基準測試、評估集、規則評分、LLM-as-judge、人工評估、基準污染。成果：學完後能為自己的任務建立評估集，並用分數比較兩個模型或兩版提示。
- **LLM21 微調與 LoRA** — 目標：比較全參數微調、LoRA 與 QLoRA 的記憶體需求；說明 LoRA 的低秩矩陣如何只訓練少量參數；準備並格式化一份指令微調資料集；以評估集比較微調前後的表現並檢查過擬合。概念：全參數微調、PEFT、LoRA、低秩分解、QLoRA、adapter 合併。成果：學完後能用 LoRA 微調一個小型開源模型，並用評估集證明效果。　缺口：linear-algebra
- **LLM22 推論與 KV Cache** — 目標：區分 prefill 與 decode 兩個推論階段的計算特性；說明 KV cache 如何避免重算並估算其記憶體用量；比較靜態批次與連續批次對吞吐量的影響；說明推測解碼（speculative decoding）加速生成的原理。概念：prefill／decode、KV cache、連續批次、推測解碼、延遲與吞吐量。成果：學完後能估算一次長對話推論的 KV cache 記憶體，並說明加速推論的常見技巧。
- **LLM23 模型量化** — 目標：說明 FP16、BF16、INT8、INT4 等數值格式的記憶體與精度差異；計算一個模型在不同精度下所需的權重記憶體；比較訓練後量化與量化感知訓練；以評估集檢查量化對輸出品質的影響。概念：浮點與整數格式、權重量化、訓練後量化、量化感知訓練、精度損失。成果：學完後能算出一個模型量化後需要多少記憶體，並判斷品質損失是否可接受。
- **LLM24 LLM 應用評估** — 目標：分別評估 RAG 的檢索品質與回答忠實度；建立黃金測試集並在提示或模型變更時做回歸測試；追蹤成本、延遲與失敗率等線上指標；以錯誤分類歸納失敗案例並排定改進優先順序。概念：檢索評估、忠實度與答案相關性、回歸測試、線上指標、錯誤分析。成果：學完後能為一個 RAG 應用建立自動化評估，並用數據決定下一步改進。
- **LLM25 大型語言模型島綜合專題** — 目標：設計一個以 RAG 回答特定文件集問題的應用；整合結構化輸出與函式呼叫完成至少一項動作；以評估集量化系統品質並迭代改進；記錄安全措施、成本估算與已知限制。概念：端到端 LLM 應用、RAG 管線、函式呼叫、評估驅動迭代、成本估算。成果：學完後能交付一個有評估數據、安全措施與成本估算的 LLM 問答應用。

</details>

### GEN — 生成式 AI 島（Generative AI，`generative-ai`，20 堂）

教生成模型家族（自回歸、VAE、GAN、流模型、擴散）與文字生成圖像、條件控制、圖像編輯、影片與語音音樂生成、視覺語言模型、生成結果評估及著作權與浮水印；神經網路與 Transformer 原理在 DL 島、語言模型原理與提示在 LLM 島，本島只引用，Agent 系統屬 AG 島。重運算部分一律以預先計算的步驟模擬呈現。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| GEN01 | 生成模型概觀<br><small>Generative Models Overview · `generative-models-overview`（theory）</small> | 入門 | AIF01 | AIF13、LLM01、DL01 | `sampling-explorer` | quiz-only |
| GEN02 | 自回歸生成模型<br><small>Autoregressive Generative Models · `autoregressive-generative-models`（theory）</small> | 入門 | GEN01、LLM01 | LLM02、AIF13 | `sampling-explorer` | code-python |
| GEN03 | 自編碼器與 VAE<br><small>Autoencoders and Variational Autoencoders · `autoencoders-and-vaes`（theory）</small> | 中級 | GEN01、DL01 | DL08、AIF13 | `latent-space` | simulation |
| GEN04 | GAN 生成對抗網路<br><small>Generative Adversarial Networks · `generative-adversarial-networks`（theory）</small> | 中級 | GEN01、DL03 | DL05、DL08 | `training-curves` | analysis |
| GEN05 | 擴散模型<br><small>Diffusion Models · `diffusion-models`（theory）</small> | 中級 | GEN01 | GEN03、DL03 | `diffusion-steps` | simulation |
| GEN06 | 流模型與 Flow Matching<br><small>Flow Models and Flow Matching · `flow-models-and-flow-matching`（theory）</small> | 進階 | GEN05 | GEN03 | `diffusion-steps` | analysis |
| GEN07 | 擴散取樣器與排程<br><small>Diffusion Samplers and Schedulers · `diffusion-samplers-and-schedulers`（application）</small> | 中級 | GEN05 | — | `diffusion-steps` | simulation |
| GEN08 | CLIP 與圖文對齊<br><small>CLIP and Image-Text Alignment · `clip-image-text-alignment`（theory）</small> | 中級 | GEN01、LLM03 | DL18 | `embedding-space` | code-python |
| GEN09 | 文字生成圖像：潛在擴散<br><small>Text-to-Image with Latent Diffusion · `text-to-image-latent-diffusion`（application）</small> | 中級 | GEN07、GEN08 | GEN03、LLM10、DL18 | `multimodal-pipeline` | prompt |
| GEN10 | 條件生成與 Classifier-Free Guidance<br><small>Conditioning and Classifier-Free Guidance · `classifier-free-guidance`（application）</small> | 中級 | GEN09 | — | `diffusion-steps` | simulation |
| GEN11 | ControlNet 與結構控制<br><small>ControlNet and Structural Control · `controlnet-and-adapters`（application）</small> | 進階 | GEN10 | GEN08 | `multimodal-pipeline` | simulation |
| GEN12 | 圖像編輯與修補<br><small>Image Editing and Inpainting · `image-editing-and-inpainting`（application）</small> | 中級 | GEN10 | GEN11 | `diffusion-steps` | simulation |
| GEN13 | 影片生成<br><small>Video Generation · `video-generation`（theory）</small> | 進階 | GEN09 | DL18、GEN06 | `diffusion-steps` | analysis |
| GEN14 | 語音合成 TTS<br><small>Speech Synthesis (TTS) · `speech-synthesis-tts`（application）</small> | 中級 | GEN02 | LLM02 | `multimodal-pipeline` | analysis |
| GEN15 | 音樂與音訊生成<br><small>Music and Audio Generation · `music-and-audio-generation`（theory）</small> | 進階 | GEN05、GEN14 | — | `sequence-model` | analysis |
| GEN16 | 視覺語言模型<br><small>Vision-Language Models · `vision-language-models`（application）</small> | 中級 | GEN08、LLM10 | LLM12、DL18 | `multimodal-pipeline` | code-python |
| GEN17 | 生成結果評估<br><small>Evaluating Generative Outputs · `evaluating-generative-outputs`（application）</small> | 進階 | GEN09、LLM20 | GEN16 | `eval-dashboard` | analysis |
| GEN18 | 生成式創作工作流程<br><small>Creative Generative Workflows · `creative-generative-workflows`（application）</small> | 中級 | GEN12、GEN16 | GEN11 | `pipeline-diagram` | design |
| GEN19 | 著作權、倫理與浮水印<br><small>Copyright, Ethics, and Watermarking · `generative-copyright-and-watermarking`（application）</small> | 中級 | GEN01、AIF19 | GEN14 | `case-study-board` | case-study |
| GEN20 | 生成式 AI 島綜合專題<br><small>Generative AI Capstone · `generative-ai-capstone`（application）</small> | 進階 | GEN17、GEN18、GEN19 | GEN11、GEN14 | `challenge-stages` | design |

<details><summary>學習目標、核心概念與成果</summary>

- **GEN01 生成模型概觀** — 目標：區分判別式模型與生成式模型的任務差異；說明「學習資料分布再取樣」的生成流程；比較自回歸、VAE、GAN、流模型與擴散模型的核心想法；依任務（文字、圖像、音訊）指出常見的模型家族。概念：判別式 vs 生成式、資料分布、取樣、似然、模型家族地圖。成果：學完後能用一張比較表說出五種生成模型家族各自如何產生新樣本與其取捨。
- **GEN02 自回歸生成模型** — 目標：用機率連鎖律把聯合分布拆成逐步的條件機率；追蹤自回歸模型一次產生一個 token 的取樣過程；說明圖像與音訊如何先離散化成 token 再自回歸生成；比較自回歸生成在速度與品質上的取捨。概念：連鎖律分解、下一個 token 預測、離散 token 化、逐步取樣、生成延遲。成果：學完後能寫出一個字元級的自回歸取樣器，並解釋每一步使用的條件機率。　缺口：probability
- **GEN03 自編碼器與 VAE** — 目標：說明編碼器、潛在向量與解碼器的分工；比較一般自編碼器與 VAE 潛在空間的差異；解釋重建損失與 KL 項如何互相拉扯；在潛在空間內插值並觀察生成結果的變化。概念：編碼器／解碼器、潛在空間、重參數化技巧、KL 散度、潛在插值。成果：學完後能在潛在空間中插值兩個樣本，並說明 VAE 為何能從隨機潛在向量生成新樣本。　缺口：probability、calculus
- **GEN04 GAN 生成對抗網路** — 目標：描述生成器與判別器的對抗訓練流程；從訓練曲線辨識模式崩潰與訓練不穩定；說明條件 GAN 如何控制生成的類別；比較 GAN 與擴散模型在品質、多樣性與穩定性上的取捨。概念：生成器、判別器、極小極大目標、模式崩潰、條件 GAN。成果：學完後能讀懂 GAN 的雙損失曲線，判斷訓練是否出現模式崩潰並提出調整方向。
- **GEN05 擴散模型** — 目標：說明前向加噪過程如何把影像逐步變成雜訊；描述反向去噪網路在每一步預測什麼；逐步追蹤從純雜訊到影像的取樣過程；解釋步數與雜訊排程如何影響品質與速度。概念：前向加噪、反向去噪、雜訊預測、雜訊排程、取樣步數。成果：學完後能在預先計算的擴散步驟中指出每一步的雜訊量，並說明模型如何一步步還原影像。　缺口：probability
- **GEN06 流模型與 Flow Matching** — 目標：說明正規化流以可逆轉換計算精確似然的想法；比較擴散的隨機取樣軌跡與 flow matching 的近直線軌跡；解釋 rectified flow 為何能以較少步數取樣；判斷何時選用流模型而非擴散模型。概念：可逆轉換、變數變換、速度場、flow matching、rectified flow。成果：學完後能比較擴散與 flow matching 的取樣軌跡，說明少步數生成的原理與代價。　缺口：calculus、probability
- **GEN07 擴散取樣器與排程** — 目標：比較 DDPM 與 DDIM 等取樣器在步數與隨機性上的差異；調整步數與雜訊排程並觀察品質與耗時的變化；說明隨機種子如何讓生成結果可重現；為預覽與定稿等不同需求選擇取樣設定。概念：DDPM、DDIM、雜訊排程、隨機種子、步數與品質取捨。成果：學完後能為快速預覽與高品質定稿分別選出取樣器、步數與種子設定並說明理由。
- **GEN08 CLIP 與圖文對齊** — 目標：說明對比學習如何把圖像與文字映射到同一個嵌入空間；用餘弦相似度完成零樣本圖像分類；解釋文字編碼器在文字生成圖像中的角色；辨識圖文嵌入可能帶有的偏誤。概念：對比學習、共享嵌入空間、零樣本分類、餘弦相似度、文字編碼器。成果：學完後能用預先計算的圖文嵌入向量做零樣本分類，並解釋相似度排序的結果。　缺口：linear-algebra
- **GEN09 文字生成圖像：潛在擴散** — 目標：畫出文字編碼器、潛在擴散與 VAE 解碼器組成的管線；說明在潛在空間而非像素空間擴散的效率優勢；撰寫結構清楚的圖像提示並比較預先生成的結果；說明解析度、長寬比與步數對結果的影響。概念：潛在擴散、文字條件、交叉注意力、圖像提示詞、解析度與長寬比。成果：學完後能說明一句提示詞如何經過管線變成圖像，並寫出能穩定得到指定構圖的提示。
- **GEN10 條件生成與 Classifier-Free Guidance** — 目標：說明 classifier-free guidance 如何混合有條件與無條件的預測；調整 guidance scale 並觀察貼合提示與多樣性的取捨；使用負面提示排除不想要的內容；比較文字、類別與圖像等不同條件訊號。概念：條件訊號、classifier-free guidance、guidance scale、負面提示、多樣性取捨。成果：學完後能為一組提示選出合適的 guidance scale，並解釋過高或過低會出現的問題。
- **GEN11 ControlNet 與結構控制** — 目標：說明 ControlNet 如何以邊緣、深度或姿勢圖控制構圖；比較 ControlNet、LoRA 風格適配器與參考圖適配器的用途；組合多個控制條件並調整各自的權重；判斷結構控制何時比改寫提示更有效。概念：ControlNet、邊緣／深度／姿勢條件、LoRA 適配器、參考圖條件、控制權重。成果：學完後能為「固定姿勢、換風格」的需求設計控制組合，並預測調整權重後的變化。
- **GEN12 圖像編輯與修補** — 目標：說明 image-to-image 的加噪強度如何決定保留多少原圖；以遮罩完成局部修補（inpainting）與外擴（outpainting）；比較遮罩修補與指令式編輯的適用情境；檢查編輯結果的接縫與前後一致性問題。概念：image-to-image、加噪強度、遮罩修補、外擴、指令式編輯。成果：學完後能為一張圖選擇遮罩修補或指令式編輯，並設定遮罩與強度得到預期的局部修改。
- **GEN13 影片生成** — 目標：說明影片生成如何在時空潛在表示上進行擴散；辨識閃爍、形變等時間一致性問題；比較文字生成影片、圖像生成影片與影片編輯的流程；估算影片長度與解析度對運算成本的影響。概念：時空潛在表示、Diffusion Transformer、時間一致性、圖像轉影片、運算成本。成果：學完後能分析一段生成影片的時間一致性缺陷，並說明模型結構與設定如何造成或減輕它。
- **GEN14 語音合成 TTS** — 目標：畫出文字前處理、聲學模型與聲碼器組成的 TTS 管線；說明神經音訊編解碼器如何把聲音變成離散 token；比較串流 TTS 在延遲與品質上的取捨；說明語音複製需要的同意與可能的濫用風險。概念：文字正規化、梅爾頻譜、聲碼器、音訊 token、串流合成。成果：學完後能說明一段文字如何一步步變成語音，並為即時對話情境選擇合適的 TTS 設定。
- **GEN15 音樂與音訊生成** — 目標：比較以音訊 token 自回歸與以頻譜擴散生成音訊的方法；說明文字、旋律與節奏如何作為生成條件；辨識長時間結構與音質上的常見缺陷；討論訓練資料授權對音樂生成的影響。概念：音訊 token、頻譜擴散、旋律條件、長程結構、音樂授權。成果：學完後能比較兩種音訊生成方法，為配樂或音效需求選擇方案並說明風險。
- **GEN16 視覺語言模型** — 目標：說明影像編碼器、投影層與語言模型如何組成 VLM；估算圖像轉成 token 後對上下文長度與成本的影響；用多模態 API 完成圖像描述、視覺問答與文件擷取；辨識 VLM 在計數、細節與文字辨識上的常見錯誤。概念：影像編碼器、投影層、圖像 token、視覺問答、多模態提示。成果：學完後能呼叫多模態 API 從截圖或表單擷取結構化資料，並檢查其中的錯誤。
- **GEN17 生成結果評估** — 目標：說明 FID、CLIP score 等自動指標衡量什麼、又忽略什麼；設計人工偏好評估與成對比較流程；以 VLM 擔任評審並檢查其判斷的一致性；綜合多項指標選出較佳的生成設定。概念：FID、CLIP score、人工偏好評估、成對比較、模型評審。成果：學完後能為一組生成設定建立評估表，綜合自動指標與人工判斷做出取捨。　缺口：statistics
- **GEN18 生成式創作工作流程** — 目標：把創作任務拆成構想、草圖、生成、篩選與修飾等階段；以節點式管線串接生成、修補與放大步驟；記錄提示、種子與參數讓結果可以重現；規劃人工審核在流程中的位置。概念：節點式管線、批次生成、參數紀錄、超解析放大、人工篩選。成果：學完後能設計一條可重現的素材生成流程，並說明每個節點的輸入、輸出與審核點。
- **GEN19 著作權、倫理與浮水印** — 目標：說明訓練資料授權與生成內容著作權的主要爭議；辨識深偽及冒用肖像、聲音等濫用風險；比較可見浮水印、隱形浮水印與 C2PA 內容憑證；為生成內容制定揭露與使用政策。概念：訓練資料授權、深偽、隱形浮水印、C2PA 內容憑證、揭露政策。成果：學完後能分析一個生成內容使用案例的法律與倫理風險，並提出浮水印與揭露做法。
- **GEN20 生成式 AI 島綜合專題** — 目標：整合文字生成圖像、圖像編輯與 VLM 檢查完成一條多模態素材流程；以評估表比較不同設定並選出定稿；為產出加上來源標示與使用說明；撰寫報告說明模型選擇、成本與風險。概念：綜合應用、多模態流程、評估與篩選、內容來源標示。成果：學完後能交付一個從提示到定稿、附評估結果與來源標示的生成素材專案。

</details>

### AG — AI 代理島（AI Agents，`ai-agents`，25 堂）

教如何以 LLM 為核心建構 Agent：工具呼叫、推理與規劃、短期與長期記憶、Agent 迴圈、MCP、工作流程與狀態圖編排、多 Agent、人機協作、護欄與安全、評估、可靠性、成本，以及上線一個 Agent；LLM 原理、提示、結構化輸出與 RAG 基礎在 LLM 島，部署、監控與基礎設施在 OPS 島。全島不需先修 ML／DL。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| AG01 | Agent 架構<br><small>Agent Architecture · `agent-architecture`（application）</small> | 入門 | AIF03、LLM10 | LLM01、LLM12 | `agent-workflow` | diagram |
| AG02 | LLM 作為推理核心<br><small>The LLM as Reasoner · `llm-as-reasoner`（application）</small> | 入門 | AG01 | LLM10、AIF05 | `prompt-lab` | prompt |
| AG03 | 工具呼叫<br><small>Tool Calling · `tool-calling`（application）</small> | 入門 | AG01、LLM12 | CN14、F14、LLM13 | `tool-call-trace` | code-python |
| AG04 | 工具介面設計<br><small>Designing Tool Interfaces · `tool-interface-design`（application）</small> | 中級 | AG03 | SA04 | `tool-call-trace` | design |
| AG05 | ReAct：推理與行動交錯<br><small>ReAct: Interleaving Reasoning and Acting · `react-reasoning-and-acting`（application）</small> | 中級 | AG02、AG03 | — | `agent-workflow` | analysis |
| AG06 | Agent 迴圈<br><small>The Agent Loop · `the-agent-loop`（application）</small> | 中級 | AG03、AG05 | F08 | `agent-workflow` | code-python |
| AG07 | 規劃與執行<br><small>Plan-and-Execute Agents · `plan-and-execute-agents`（application）</small> | 中級 | AG06 | AIF05、D16 | `agent-workflow` | design |
| AG08 | 上下文工程與短期記憶<br><small>Context Engineering and Short-Term Memory · `agent-context-engineering`（application）</small> | 中級 | AG06 | LLM02、LLM11 | `memory-inspector` | simulation |
| AG09 | 長期記憶<br><small>Long-Term Agent Memory · `long-term-agent-memory`（application）</small> | 中級 | AG08、LLM15 | LLM14、DB01 | `memory-inspector` | code-python |
| AG10 | Agentic RAG<br><small>Agentic RAG · `agentic-rag`（application）</small> | 中級 | AG06、LLM14 | AG09、DB03 | `rag-explorer` | code-python |
| AG11 | 工作流程模式<br><small>Agentic Workflow Patterns · `agent-workflow-patterns`（application）</small> | 中級 | AG06 | SA12 | `agent-workflow` | design |
| AG12 | MCP 模型上下文協定<br><small>Model Context Protocol (MCP) · `model-context-protocol`（application）</small> | 中級 | AG03、CN14 | AG04、CN12 | `protocol-sequence` | analysis |
| AG13 | 實作 MCP 伺服器<br><small>Building MCP Servers · `building-mcp-servers`（application）</small> | 中級 | AG12 | AG04、CN18 | `tool-call-trace` | code-python |
| AG14 | 以圖與狀態機編排 Agent<br><small>Graph and State-Machine Orchestration · `graph-based-agent-orchestration`（application）</small> | 進階 | AG07、AG11 | D16、SA12 | `agent-workflow` | code-python |
| AG15 | 多 Agent 系統<br><small>Multi-Agent Systems · `multi-agent-systems`（application）</small> | 進階 | AG14 | AG08 | `multi-agent-board` | design |
| AG16 | 人機協作與審批<br><small>Human-in-the-Loop Agents · `human-in-the-loop-agents`（application）</small> | 進階 | AG14 | SA04 | `agent-workflow` | design |
| AG17 | Agent 護欄<br><small>Agent Guardrails · `agent-guardrails`（application）</small> | 中級 | AG06、LLM12 | AIF19 | `guardrail-sim` | config |
| AG18 | 提示注入與防禦<br><small>Prompt Injection and Defenses · `prompt-injection-defense`（application）</small> | 進階 | AG17、CN18 | AG10、AG13、LLM18 | `guardrail-sim` | case-study |
| AG19 | 沙箱與權限：程式與電腦操作 Agent<br><small>Sandboxing and Permissions for Code and Computer-Use Agents · `agent-sandboxing-and-permissions`（application）</small> | 進階 | AG18 | PL07、CN18 | `guardrail-sim` | config |
| AG20 | Agent 評估<br><small>Agent Evaluation · `agent-evaluation`（application）</small> | 中級 | AG06、LLM20 | SA16、AG07 | `eval-dashboard` | analysis |
| AG21 | Agent 基準測試<br><small>Agent Benchmarks · `agent-benchmarks`（application）</small> | 進階 | AG20 | — | `eval-dashboard` | analysis |
| AG22 | Agent 可靠性：重試與冪等<br><small>Agent Reliability: Retries and Idempotency · `agent-reliability`（application）</small> | 進階 | AG06 | AG14、DB14、CN09 | `tool-call-trace` | code-python |
| AG23 | Agent 成本與延遲<br><small>Agent Cost and Latency · `agent-cost-and-latency`（application）</small> | 中級 | AG08 | AG15 | `cost-calculator` | calculation |
| AG24 | Agent 追蹤與除錯<br><small>Agent Tracing and Debugging · `agent-tracing-and-debugging`（application）</small> | 進階 | AG20、AG22 | F17 | `tool-call-trace` | analysis |
| AG25 | AI 代理島綜合專題：上線一個 Agent<br><small>Capstone: Building a Production Agent · `production-agent-capstone`（application）</small> | 進階 | AG16、AG18、AG24 | AG12、AG15、AG21、AG23 | `challenge-stages` | design |

<details><summary>學習目標、核心概念與成果</summary>

- **AG01 Agent 架構** — 目標：說明 LLM Agent 的模型、工具、記憶與環境四個組成；區分固定工作流程與自主 Agent 的差異；依自主程度為 AI 應用分級；判斷一個任務是否真的需要 Agent。概念：感知-決策-行動、LLM 控制器、工具、記憶、工作流程 vs Agent、自主程度。成果：學完後能畫出一個 Agent 的架構圖，並說明某個任務為何適合用工作流程或 Agent。
- **AG02 LLM 作為推理核心** — 目標：說明逐步推理提示與推理模型如何提升多步任務的表現；比較 self-consistency 等多次取樣策略的成本與效益；辨識 LLM 推理的常見失敗：虛構步驟、計算錯誤、過度自信；決定何時把計算交給工具而不是模型。概念：逐步推理、推理模型、self-consistency、推理預算、推理失敗模式。成果：學完後能為多步問題設計推理提示，並指出哪些步驟應改由工具計算。
- **AG03 工具呼叫** — 目標：為多個工具撰寫 JSON Schema 定義，並控制模型的工具選擇模式；追蹤多輪對話中模型提出工具呼叫、程式執行並回傳結果的往返；處理平行工具呼叫與工具錯誤的回傳；在執行前驗證參數並拒絕不合法的呼叫。概念：工具集定義、工具選擇模式、多輪工具往返、平行呼叫、工具錯誤回傳、參數驗證。成果：學完後能讓模型在多個工具間正確選用，並完成含平行呼叫與錯誤回傳的工具往返。
- **AG04 工具介面設計** — 目標：撰寫讓模型能正確選用的工具名稱與說明；決定工具粒度：一個大工具或多個小工具；設計精簡、模型讀得懂的輸出與可行動的錯誤訊息；以測試案例檢查模型選錯工具的情況。概念：工具說明、工具粒度、輸出精簡、可行動的錯誤訊息、工具選擇測試。成果：學完後能改寫一組含糊的工具定義，讓模型更常選對工具並說明原因。
- **AG05 ReAct：推理與行動交錯** — 目標：說明思考、行動、觀察三段循環的 ReAct 模式；閱讀 ReAct 軌跡並找出錯誤的推理或行動；比較 ReAct 與單次提示在需要外部資訊時的差異；設定避免無限循環的停止條件。概念：思考、行動、觀察、軌跡、停止條件。成果：學完後能讀懂一段 ReAct 軌跡，指出走錯的一步並提出修正。
- **AG06 Agent 迴圈** — 目標：實作「呼叫模型→執行工具→附加結果→再次呼叫」的迴圈；設計最大回合數與完成判斷等終止條件；在訊息歷史中正確配對工具請求與工具結果；記錄每一步的輸入輸出以便除錯。概念：迴圈控制、訊息歷史、終止條件、最大回合數、步驟記錄。成果：學完後能用 Python 寫出一個最小可用的 Agent 迴圈，並讓它在完成或超過回合上限時正確停止。
- **AG07 規劃與執行** — 目標：把大型任務拆成有順序與依賴關係的子任務計畫；比較先規劃後執行與逐步反應式決策的優缺點；在執行失敗時觸發重新規劃；用待辦清單追蹤計畫進度。概念：任務分解、計畫表示、依賴關係、重新規劃、進度追蹤。成果：學完後能為一個多步研究任務產生計畫，並在某一步失敗時示範重新規劃。
- **AG08 上下文工程與短期記憶** — 目標：估算長時間 Agent 任務中工具結果與軌跡累積的 token；以工具結果裁剪、軌跡壓縮與外部筆記檔管理長任務上下文；改用需要時才載入資料的方式取代一次塞入全部內容；觀察上下文過長時 Agent 表現下降的現象。概念：上下文工程、工具結果裁剪、軌跡壓縮、外部筆記、即時載入、長上下文退化。成果：學完後能為長時間執行的 Agent 設計上下文縮減策略，讓關鍵資訊不被擠出。
- **AG09 長期記憶** — 目標：區分情節記憶、語意記憶與程序記憶；設計記憶的寫入、檢索與遺忘規則；以向量檢索或結構化儲存實作跨對話記憶；辨識記憶被汙染與資訊過時的風險。概念：情節記憶、語意記憶、記憶寫入策略、記憶檢索、遺忘與更新。成果：學完後能為個人助理 Agent 實作跨對話的記憶存取，並說明何時更新或刪除記憶。
- **AG10 Agentic RAG** — 目標：比較一次性 RAG 與由 Agent 決定何時檢索、檢索什麼的 Agentic RAG；實作由 Agent 判斷資訊是否足夠、再決定是否繼續檢索的多輪檢索；整合網頁搜尋、資料庫查詢等多種檢索工具；要求 Agent 在回答中附上可驗證的來源。概念：檢索作為工具、資訊充分性判斷、多輪檢索、多來源檢索、引用來源。成果：學完後能讓 Agent 自行決定檢索時機，並給出附來源的答案。
- **AG11 工作流程模式** — 目標：說明提示串接、路由與平行化等固定流程模式；比較協調者-工作者與評估者-優化者兩種模式；為一個需求選出最簡單可行的模式；畫出所選模式的資料流與決策點。概念：提示串接、路由、平行化、協調者-工作者、評估者-優化者。成果：學完後能為客服或內容審核需求選出合適的工作流程模式並畫出流程圖。
- **AG12 MCP 模型上下文協定** — 目標：說明 MCP 中主機、客戶端與伺服器的角色；區分 MCP 伺服器提供的工具、資源與提示三類能力；追蹤連線初始化、能力協商與工具呼叫的訊息往來；比較 stdio 與 Streamable HTTP 兩種傳輸方式。概念：MCP 主機／客戶端／伺服器、工具／資源／提示、能力協商、JSON-RPC、傳輸方式。成果：學完後能讀懂一段 MCP 訊息紀錄，說明客戶端如何發現並呼叫伺服器上的工具。
- **AG13 實作 MCP 伺服器** — 目標：用官方 SDK 實作提供工具與資源的 MCP 伺服器；為工具撰寫輸入結構描述與錯誤處理；說明遠端 MCP 伺服器的授權流程與權限範圍；以測試客戶端驗證伺服器的行為。概念：MCP SDK、工具實作、資源公開、OAuth 授權、伺服器測試。成果：學完後能實作並測試一個提供查詢工具的 MCP 伺服器。
- **AG14 以圖與狀態機編排 Agent** — 目標：以節點、邊與共享狀態描述 Agent 流程；設計含條件分支與循環的狀態轉移；使用檢查點讓長流程可以暫停、恢復與重播；比較圖式編排與單一 Agent 迴圈的可控性。概念：狀態圖、節點與邊、共享狀態、條件轉移、檢查點、持久執行。成果：學完後能把一個多步流程改寫成可暫停與恢復的狀態圖。
- **AG15 多 Agent 系統** — 目標：比較協調者-子 Agent、交接與群組協作等多 Agent 架構；設計 Agent 之間傳遞的任務說明與結果格式；分析多 Agent 帶來的效益、額外成本與錯誤傳遞；判斷何時拆成多 Agent、何時維持單一 Agent。概念：協調者與子 Agent、交接、角色分工、上下文隔離、錯誤傳遞。成果：學完後能為研究型任務設計多 Agent 分工，並評估它是否比單一 Agent 更划算。
- **AG16 人機協作與審批** — 目標：找出 Agent 流程中需要人工確認的高風險動作；設計核准、修改與拒絕三種中斷回應；讓流程在等待人工時保存狀態並可恢復；設定把任務升級給人工處理的條件。概念：審批關卡、中斷與恢復、人工修改、升級條件、風險分級。成果：學完後能為會寄信或付款的 Agent 設計人工審批點，並說明中斷後如何恢復。
- **AG17 Agent 護欄** — 目標：在輸入、工具呼叫與輸出三處設置檢查；以結構化驗證與允許清單限制 Agent 的行為；比較規則式檢查與分類模型式檢查的取捨；測試護欄的誤擋與漏擋。概念：輸入檢查、輸出驗證、允許清單、政策分類器、誤擋與漏擋。成果：學完後能為一個客服 Agent 設定多層護欄，並用測試案例量測誤擋與漏擋。
- **AG18 提示注入與防禦** — 目標：區分直接提示注入與藏在網頁、文件中的間接注入；分析私密資料、不可信內容與對外傳送能力同時存在時的外洩風險；套用最小權限、資料與指令分離等防禦設計；以紅隊測試案例評估 Agent 的抵抗力。概念：直接注入、間接注入、資料外洩、最小權限、紅隊測試。成果：學完後能找出一個 Agent 設計中的注入攻擊路徑，並提出可驗證的防禦措施。
- **AG19 沙箱與權限：程式與電腦操作 Agent** — 目標：說明程式執行 Agent 與電腦操作 Agent 的運作方式與風險；設計檔案系統、網路與憑證的隔離範圍；規劃逐項確認、允許清單與唯讀等權限模式；評估沙箱逃逸與誤操作的影響範圍。概念：程式執行 Agent、電腦操作 Agent、沙箱隔離、權限模式、憑證範圍。成果：學完後能為一個會執行程式的 Agent 寫出沙箱與權限設定，並說明每項限制防範的風險。　缺口：operating-systems
- **AG20 Agent 評估** — 目標：為 Agent 任務定義成功條件與評分方式；同時評估最終結果與中間軌跡（工具選擇、步數）；建立含邊界案例的評估資料集；以多次執行衡量 Agent 結果的穩定度。概念：任務成功率、軌跡評估、評估資料集、模型評審、多次執行變異。成果：學完後能為一個 Agent 建立評估集，並解讀成功率與軌跡指標。　缺口：statistics
- **AG21 Agent 基準測試** — 目標：說明 SWE-bench、τ-bench、WebArena 等基準各自衡量的能力；解讀基準分數的限制：資料汙染、環境差異與評分方式；比較公開基準與自建任務評估的用途；依業務需求設計小型自訂基準。概念：公開基準、程式修復任務、網頁操作任務、資料汙染、自訂基準。成果：學完後能批判性解讀一份 Agent 排行榜，並為自己的場景設計小型基準。
- **AG22 Agent 可靠性：重試與冪等** — 目標：為模型與工具呼叫設計逾時、重試與指數退避；讓有副作用的工具具備冪等性，避免重試造成重複動作；設計失敗後的補償與復原步驟；以故障注入測試 Agent 的錯誤處理。概念：逾時、指數退避、冪等鍵、補償動作、故障注入。成果：學完後能讓 Agent 在工具失敗時安全重試，且不會重複下單或重複寄信。
- **AG23 Agent 成本與延遲** — 目標：估算一次 Agent 任務的 token 用量、費用與延遲；以提示快取、模型分級與平行工具呼叫降低成本與延遲；為每個任務設定回合與預算上限；在品質、成本與速度之間做出取捨。概念：token 計費、延遲組成、提示快取、模型分級、預算上限。成果：學完後能估算並降低一個 Agent 工作流程的單次成本與回應時間。
- **AG24 Agent 追蹤與除錯** — 目標：閱讀 Agent 執行追蹤中的模型呼叫、工具呼叫與耗時；依失敗類型分類：選錯工具、參數錯誤、迴圈卡住、提前結束；從失敗案例回推提示、工具或流程的修正；把修正後的案例加入回歸評估。概念：執行追蹤、span、失敗分類、根因分析、回歸測試。成果：學完後能從一段失敗的 Agent 追蹤找出根因，並驗證修正有效。
- **AG25 AI 代理島綜合專題：上線一個 Agent** — 目標：整合工具、記憶、工作流程與人工審批完成一個業務 Agent；為 Agent 加上護欄、權限與可靠性設計；以評估集與執行追蹤證明 Agent 的品質；撰寫涵蓋成本、風險與回復計畫的上線檢查清單。概念：綜合應用、端到端設計、上線檢查清單、評估證據。成果：學完後能交付一個附評估報告與上線檢查清單的可用 Agent。

</details>

### OPS — AI 工程與 MLOps 島（AI Engineering & MLOps，`ai-engineering`，20 堂）

教 AI 系統從原型到上線與維運：服務 API、模型閘道、容器、部署模式、GPU 推論、自動擴展、CI／CD、可觀測性、漂移監控、線上評估、成本、安全法遵、事故應變與 SLO；標記 mlops 的課（模型打包、模型註冊、資料與特徵管線、持續訓練）才需要 ML／DL 背景，其餘課程對只走 AI 應用路徑的學習者開放。Agent 設計在 AG 島，網路與架構基礎在 CN／SA 島。

| ID | 課程 | 難度 | 必修 | 建議 | 活動 | 練習 |
|---|---|---|---|---|---|---|
| OPS01 | AI 工程與 MLOps 概觀<br><small>AI Engineering and MLOps Overview · `ai-engineering-overview`（engineering）</small> | 入門 | SA01、LLM01 | ML01、AG01 | `pipeline-diagram` | diagram |
| OPS02 | 以 API 提供 AI 服務<br><small>Serving AI over HTTP APIs · `serving-ai-over-http`（engineering）</small> | 入門 | OPS01、CN14 | CN12、LLM12 | `protocol-sequence` | code-python |
| OPS03 | 模型閘道與供應商整合<br><small>LLM Gateways and Provider Integration · `llm-gateway-and-provider-routing`（engineering）</small> | 中級 | OPS02 | AG22 | `deployment-simulator` | config |
| OPS04 | 容器與 Docker<br><small>Containers and Docker for AI Services · `containers-for-ai-services`（engineering）</small> | 入門 | OPS02 | PL07 | `pipeline-diagram` | config |
| OPS05 | 模型產出物打包<br><small>Packaging Model Artifacts · `model-artifact-packaging`（mlops）</small> | 中級 | OPS04、DL08 | ML01、DL24 | `pipeline-diagram` | code-python |
| OPS06 | 部署模式<br><small>Deployment Patterns for AI Systems · `model-deployment-patterns`（engineering）</small> | 中級 | OPS04 | SA12 | `deployment-simulator` | simulation |
| OPS07 | GPU 推論與批次處理<br><small>GPU Inference and Batching · `gpu-inference-and-batching`（engineering）</small> | 進階 | OPS02 | LLM02、PL13、DL18、LLM22 | `deployment-simulator` | calculation |
| OPS08 | 自動擴展與負載管理<br><small>Autoscaling and Load Management · `autoscaling-ai-services`（engineering）</small> | 中級 | OPS06 | D06、OPS07 | `deployment-simulator` | simulation |
| OPS09 | 模型註冊與版本管理<br><small>Model Registry and Versioning · `model-registry-and-versioning`（mlops）</small> | 中級 | OPS05、ML20 | ML19、DL21 | `pipeline-diagram` | config |
| OPS10 | 資料與特徵管線<br><small>Data and Feature Pipelines · `data-and-feature-pipelines`（mlops）</small> | 中級 | OPS01、ML02 | DB03、MIS12 | `pipeline-diagram` | code-python |
| OPS11 | AI 系統的 CI／CD<br><small>CI/CD for AI Systems · `ci-cd-for-ai-systems`（engineering）</small> | 中級 | OPS06、SA16 | LLM20、AG20 | `pipeline-diagram` | config |
| OPS12 | 持續訓練與再訓練<br><small>Continuous Training and Retraining · `continuous-training-pipelines`（mlops）</small> | 進階 | OPS09、OPS10、OPS11 | ML20 | `pipeline-diagram` | design |
| OPS13 | AI 系統可觀測性<br><small>Observability for AI Systems · `ai-observability`（engineering）</small> | 中級 | OPS02 | AG24、MIS12 | `monitoring-dashboard` | config |
| OPS14 | 資料漂移與品質監控<br><small>Drift and Quality Monitoring · `drift-and-quality-monitoring`（engineering）</small> | 進階 | OPS13 | ML19、AIF13 | `monitoring-dashboard` | analysis |
| OPS15 | 上線後評估管線<br><small>Evaluation Pipelines in Production · `production-evaluation-pipelines`（engineering）</small> | 進階 | OPS13、LLM20 | AG20、OPS11、LLM24 | `eval-dashboard` | analysis |
| OPS16 | AI 成本最佳化<br><small>Cost Optimization for AI Systems · `ai-cost-optimization`（engineering）</small> | 中級 | OPS03 | OPS07、AG23 | `cost-calculator` | calculation |
| OPS17 | AI 系統安全與法規遵循<br><small>Security and Compliance for AI Systems · `ai-security-and-compliance`（engineering）</small> | 進階 | OPS11、CN18 | AIF19、AG18 | `case-study-board` | case-study |
| OPS18 | AI 系統事故應變<br><small>Incident Response for AI Systems · `ai-incident-response`（engineering）</small> | 進階 | OPS06、OPS13 | OPS14、OPS17 | `decision-simulation` | simulation |
| OPS19 | SLO 與容量規劃<br><small>SLOs and Capacity Planning · `slos-and-capacity-planning`（engineering）</small> | 進階 | OPS08、OPS13 | OPS07、OPS16 | `monitoring-dashboard` | calculation |
| OPS20 | AI 工程島綜合專題：上線一個 AI 系統<br><small>Capstone: Shipping a Production AI System · `production-ai-system-capstone`（engineering）</small> | 進階 | OPS15、OPS17、OPS18 | OPS11、OPS16、OPS19、AG25 | `challenge-stages` | design |

<details><summary>學習目標、核心概念與成果</summary>

- **OPS01 AI 工程與 MLOps 概觀** — 目標：描述 AI 系統從原型、上線到維運的生命週期；比較傳統軟體維運、MLOps 與 LLM 應用維運的差異；列出一個 AI 產品上線需要的元件與角色；辨識「原型能跑」與「可以上線」之間的差距。概念：AI 系統生命週期、MLOps、LLMOps、上線差距、元件地圖。成果：學完後能畫出一個 AI 產品從開發到維運的元件與流程圖。
- **OPS02 以 API 提供 AI 服務** — 目標：用 Python 網頁框架把模型或 LLM 呼叫包裝成 HTTP 端點；定義請求與回應的資料結構並驗證輸入；以串流回應（SSE）即時傳回生成內容；設定逾時、錯誤碼與健康檢查端點。概念：推論端點、請求驗證、串流回應、逾時與錯誤碼、健康檢查。成果：學完後能寫出一個具輸入驗證、串流回應與健康檢查的 AI 服務端點。
- **OPS03 模型閘道與供應商整合** — 目標：在閘道層統一多家供應商的介面、限流處理與錯誤格式；以閘道集中管理金鑰、請求紀錄與各團隊用量配額；設計主要模型失敗時的備援與路由；比較託管 API 與自架開源模型的取捨。概念：模型閘道、統一介面、團隊配額、備援路由、託管 vs 自架。成果：學完後能為 AI 服務設計一層模型閘道，讓供應商故障或限流時仍能回應。
- **OPS04 容器與 Docker** — 目標：撰寫 Dockerfile 把 AI 服務與相依套件打包成映像；利用層快取與多階段建置縮小映像；以環境變數與掛載分離設定、機密與模型檔；在本機用容器重現與正式環境相同的執行環境。概念：映像與容器、Dockerfile、層快取、多階段建置、設定與機密分離。成果：學完後能為 AI 服務寫出精簡、可重現的 Dockerfile 並在本機執行。　缺口：operating-systems
- **OPS05 模型產出物打包** — 目標：把匯出的模型、前處理設定與相依套件定義成一份可部署的產出物；以 safetensors 與校驗碼安全地儲存與發佈大型權重；撰寫產出物中繼資料：輸入輸出規格、版本與模型卡；把模型產出物打包或掛載進服務映像並驗證啟動結果。概念：模型產出物、safetensors、校驗碼、輸入輸出規格、模型卡。成果：學完後能把一個已匯出的 PyTorch 模型整理成附中繼資料與校驗碼的產出物，並打包成可啟動的服務。
- **OPS06 部署模式** — 目標：比較藍綠部署、金絲雀發布與影子部署；說明即時、批次與邊緣三種推論部署的適用情境；為新模型或新提示設計漸進式發布與回滾；以流量比例模擬發布過程中的風險。概念：藍綠部署、金絲雀發布、影子部署、批次推論、回滾。成果：學完後能為一次模型升級選擇部署模式，並規劃漸進放量與回滾條件。
- **OPS07 GPU 推論與批次處理** — 目標：估算模型權重與 KV cache 所需的 GPU 記憶體預算；設定推論伺服器的批次大小與併發上限，並量測吞吐量與延遲；比較單 GPU、張量平行與多副本部署的取捨；依服務目標選擇量化等級與 GPU 規格。概念：GPU 記憶體預算、推論伺服器、批次與併發設定、張量平行、吞吐量基準測試。成果：學完後能估算一個開源模型在指定 GPU 上的併發容量，並選擇合適的批次策略。
- **OPS08 自動擴展與負載管理** — 目標：依 CPU／GPU 使用率或佇列長度設定擴展規則；說明冷啟動與縮放到零對延遲與成本的影響；以佇列與背壓保護下游的模型服務；模擬流量尖峰下的擴展行為。概念：水平擴展、佇列式擴展、冷啟動、縮放到零、背壓。成果：學完後能為 AI 服務設定擴展規則，並在模擬尖峰中維持延遲目標。　缺口：cloud-platforms
- **OPS09 模型註冊與版本管理** — 目標：把實驗追蹤紀錄連結到可註冊的模型版本；以模型註冊管理版本、階段與核准流程；追蹤模型與訓練資料、程式碼之間的血緣；依評估證據選出要晉升到正式環境的版本。概念：實驗追蹤、模型註冊、版本階段、資料血緣、晉升與核准。成果：學完後能為一組實驗建立版本紀錄，並依證據晉升一個模型版本。
- **OPS10 資料與特徵管線** — 目標：設計從原始資料到訓練特徵的批次與串流管線；以資料驗證規則攔截缺值、型別與分布異常；說明特徵庫如何避免訓練與服務之間的偏差；排程並重跑管線以保持資料新鮮。概念：ETL／ELT、資料驗證、特徵庫、訓練-服務偏差、管線排程。成果：學完後能建立一條含資料驗證的特徵管線，並說明如何確保訓練與線上特徵一致。
- **OPS11 AI 系統的 CI／CD** — 目標：在 CI 中執行單元測試、提示回歸測試與評估門檻；自動建置、掃描並推送服務映像；以評估分數決定是否允許部署；把提示、設定與模型版本納入版本控制。概念：持續整合、提示回歸測試、評估門檻、映像建置、設定即程式碼。成果：學完後能寫出一條在評估未達標時自動阻擋部署的 CI／CD 流程設定。　缺口：software-engineering-practice
- **OPS12 持續訓練與再訓練** — 目標：設計依排程、資料量或效能下降觸發的再訓練；把資料驗證、訓練、評估與註冊串成自動管線；以冠軍-挑戰者比較設定自動晉升與人工核准條件；避免再訓練引入資料洩漏或效能回歸。概念：再訓練觸發、訓練管線、冠軍-挑戰者比較、自動晉升、資料洩漏。成果：學完後能設計一條從新資料到模型晉升的自動再訓練管線，並標出人工把關點。
- **OPS13 AI 系統可觀測性** — 目標：區分指標、日誌與追蹤三種遙測資料；為每次 LLM 呼叫記錄 token、延遲、模型版本與錯誤；以分散式追蹤串起使用者請求、檢索與模型呼叫；設計儀表板與告警規則。概念：指標、日誌、分散式追蹤、OpenTelemetry、告警。成果：學完後能為 AI 服務設計遙測欄位與儀表板，並設定延遲與錯誤率告警。
- **OPS14 資料漂移與品質監控** — 目標：區分資料漂移、概念漂移與預測分布改變；以統計檢定或分布距離偵測輸入漂移；監控 LLM 應用的輸入主題與回答品質變化；依漂移警訊決定調查、回滾或再訓練。概念：資料漂移、概念漂移、分布距離、品質訊號、漂移告警。成果：學完後能從監控資料判斷是否發生漂移，並提出對應的處理動作。　缺口：statistics
- **OPS15 上線後評估管線** — 目標：抽樣線上流量進行自動評分與人工標註；設計 A/B 測試比較模型或提示版本；收集使用者回饋並轉成評估資料集；對照離線評估與線上評估的結果。概念：線上評估、流量抽樣、A/B 測試、使用者回饋、評估資料集更新。成果：學完後能設計一條把線上流量變成持續評估與改進依據的管線。　缺口：statistics
- **OPS16 AI 成本最佳化** — 目標：拆解 AI 服務的模型、運算、儲存與網路成本；以提示快取、語意快取與批次 API 降低費用；依任務難度把請求路由到不同大小的模型；建立成本監控與預算告警。概念：單位成本、提示快取、語意快取、模型分級路由、預算告警。成果：學完後能估算一個 AI 服務的月成本，並提出可量化的降本方案。
- **OPS17 AI 系統安全與法規遵循** — 目標：管理 API 金鑰與機密，避免寫進程式碼或日誌；在資料進出模型前處理個資遮罩與保存期限；檢查模型權重與套件的供應鏈風險；對照歐盟 AI 法等規範建立稽核紀錄與文件。概念：機密管理、個資遮罩、供應鏈安全、稽核日誌、AI 法規遵循。成果：學完後能為 AI 服務完成一份安全與法遵檢查，並列出待改善項目。
- **OPS18 AI 系統事故應變** — 目標：為模型故障、品質下降與有害輸出撰寫應變手冊；使用功能開關、降級模式與回滾止血；依時間線協調偵測、處置與對外溝通；撰寫不究責的事後檢討並追蹤改善項目。概念：應變手冊、功能開關、降級模式、事故時間線、事後檢討。成果：學完後能在模擬事故中做出止血決策，並寫出事後檢討與改善項目。
- **OPS19 SLO 與容量規劃** — 目標：為 AI 服務定義延遲、可用性與回答品質的 SLO；以錯誤預算決定發布節奏與改善優先順序；依流量預測規劃運算與 GPU 容量；在成本與服務水準之間做出取捨。概念：SLI／SLO、錯誤預算、百分位延遲、容量預測、服務水準取捨。成果：學完後能為 AI 服務訂出 SLO 與錯誤預算，並據此估算所需容量。　缺口：statistics
- **OPS20 AI 工程島綜合專題：上線一個 AI 系統** — 目標：把一個 AI 應用容器化並以漸進式發布部署；建立監控、線上評估與告警；完成成本估算、安全檢查與事故應變手冊；以上線審查報告說明系統的品質與風險。概念：綜合應用、上線審查、端到端維運、風險評估。成果：學完後能交付一個可部署、可監控、可回復並附上線審查報告的 AI 系統。

</details>

## 驗證

### 機器驗證（`validate.py` 讀資料檔）

```
islands: F=20 DS=20 AL=20 PL=20 DB=20 CN=20 SA=20 MIS=20 AIF=20 ML=25 DL=25 LLM=25 GEN=20 AG=25 OPS=20
regions: {'cs': 160, 'ai': 160} total: 320 status: {'complete': 60, 'planned': 260}
subject islands: 15 (+1 shared lab island, not counted)
difficulty: {'PL': {'Beginner': 3, 'Intermediate': 10, 'Advanced': 7}, 'DB': {'Beginner': 4, 'Intermediate': 12, 'Advanced': 4}, 'CN': {'Beginner': 4, 'Intermediate': 11, 'Advanced': 5}, 'SA': {'Beginner': 5, 'Intermediate': 10, 'Advanced': 5}, 'MIS': {'Beginner': 4, 'Intermediate': 10, 'Advanced': 6}, 'AIF': {'Beginner': 3, 'Intermediate': 12, 'Advanced': 5}, 'ML': {'Beginner': 5, 'Intermediate': 12, 'Advanced': 8}, 'DL': {'Beginner': 3, 'Intermediate': 10, 'Advanced': 12}, 'LLM': {'Beginner': 4, 'Intermediate': 12, 'Advanced': 9}, 'GEN': {'Beginner': 2, 'Intermediate': 12, 'Advanced': 6}, 'AG': {'Beginner': 3, 'Intermediate': 13, 'Advanced': 9}, 'OPS': {'Beginner': 3, 'Intermediate': 9, 'Advanced': 8}}
activities used (new): 61 reused existing: 7
gaps: {'calculus': 8, 'cloud-platforms': 2, 'discrete-math': 1, 'linear-algebra': 12, 'operating-systems': 4, 'probability': 10, 'software-engineering-practice': 3, 'statistics': 6}
path A-apcs-cs-foundations: 60 lessons, islands F→DS→AL
path B-software-engineering: 86 lessons, islands F→DS→PL→DB→SA
path C-network-and-systems: 54 lessons, islands F→DS→AL→PL→DB→CN
path D-enterprise-information-systems: 84 lessons, islands F→DS→PL→DB→SA→MIS
path E-ai-research: 142 lessons, islands F→DS→AL→CN→AIF→ML→DL→LLM→GEN
path F-ai-application-engineering: 89 lessons, islands F→PL→DB→CN→SA→AIF→LLM→AG→OPS
RESULT OK
```

檢查內容：每島課數與 ID 序列、Region 與總數（320／60／260）、ID 以完整前綴解析且對應唯一的島、slug 格式與全站唯一（含既有 60 堂）、難度／活動／練習／缺口在詞彙內、錨點課的 slug、先修存在且只指向依賴順序中更前面的課、先修圖（必修＋建議）無循環、AI 應用路線規則（AG、LLM 應用軌、非 MLOps 的 OPS 的必修鏈中沒有 ML／DL）、學習路線中每堂課的必修先修都在路線內且排在前面。

### 只能人工審核

- 每堂課的內容是否正確、目標是否可達成、難度是否合理、島與島之間是否真的沒有重複（驗證器只檢查結構）。
- 活動是否適合該主題、實作等級的估計是否合理。
- 學習路線是否符合真實學習者的需求。
- 既有 60 堂沒有被修改、受保護的 3D 路徑沒有被修改：以 git 檢查本次提交只包含 `docs/` 規劃檔（見提交訊息與交付報告）。
