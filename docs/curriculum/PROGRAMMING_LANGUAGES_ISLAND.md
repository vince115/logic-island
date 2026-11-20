# 程式語言島（Programming Languages Island）

> 2026-11-20 起分批撰寫（課程生產流程，見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)）。大綱（標題、目標、概念、先修）取自藍圖 `docs/planning/data/curriculum-blueprint.json`，由 `lessons.ts` 的 `programFromBlueprint` 讀入，不另寫一份。教學方式與基礎程式島相同：`program-code`，C++、Java、Python、JavaScript 四種語言的範例與練習都由 `tests/curriculum-code.test.ts` 實際執行。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 視覺化 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| PL01 | 程式設計典範<br>`programming-paradigms` | 入門 | 45 分 | F13 | 變數狀態追蹤 | 5 段、4 範例、7 題、練習「加分後的及格總分」（7 組測資） | **完整 v1.0.0** |
| PL02 | 物件導向：封裝、繼承與介面<br>`object-oriented-programming` | 入門 | 55 分 | PL01、F14 | 函式呼叫追蹤 | 6 段、4 範例、6 題、練習「有手續費的帳戶」（8 組測資） | **完整 v1.0.0** |
| PL03 | 函數式程式設計<br>`functional-programming` | 入門 | 50 分 | PL01、F18 | 函式呼叫追蹤 | 5 段、4 範例、6 題、練習「偶數的平方與總和」（7 組測資） | **完整 v1.0.0** |
| PL04 | 型別系統<br>`type-systems` | 中級 | 50 分 | PL01、F02 | 無（表格與逐步說明） | 6 段、5 範例、6 題、練習「嚴格的整數加總」（8 組測資） | **完整 v1.0.0** |
| PL05 | 泛型與多型<br>`generics-and-polymorphism` | 中級 | 60 分 | PL02、PL04 | 無（表格與逐步說明） | 4 段、4 範例、6 題、練習「一個泛型函式，兩種資料」（10 組測資） | **完整 v1.0.0** |
| PL06 | 名稱綁定、作用域鏈與閉包<br>`binding-scope-and-closures` | 中級 | 55 分 | PL03、F15 | 函式呼叫追蹤 | 6 段、6 範例、9 題、練習「共享狀態的計數器工廠」（8 組測資） | **完整 v1.0.0** |
| PL07 | 記憶體模型：堆疊與堆積<br>`memory-models` | 中級 | 55 分 | PL04、F14 | 函式呼叫追蹤 | 6 段、5 範例、7 題、練習「名稱與物件：模擬參考與複本」（10 組測資） | **完整 v1.0.0** |
| PL08 | 記憶體管理與垃圾回收<br>`memory-management-and-gc` | 中級 | 55 分 | PL07 | 圖的走訪 | 5 段、4 範例、7 題、練習「標記與清除：哪些物件會被回收」（10 組測資） | **完整 v1.0.0** |
| PL09 | 錯誤處理模型<br>`error-handling-models` | 中級 | 55 分 | PL02、PL07 | 函式呼叫追蹤 | 5 段、5 範例、7 題、練習「設定檔的錯誤邊界」（7 組測資） | **完整 v1.0.0** |
| PL10 | 詞法分析：從字元到 Token<br>`lexical-analysis` | 中級 | 55 分 | PL01、D03 | 變數狀態追蹤 | 5 段、4 範例、7 題、練習「把一行程式切成 token」（14 組測資） | **完整 v1.0.0** |
| PL11 | 語法分析與抽象語法樹<br>`parsing-and-ast` | 中級 | 55 分 | PL10、D13 | 樹的走訪 | 6 段、4 範例、9 題、練習「解析四則運算並輸出 AST」（26 組測資） | **完整 v1.0.0** |
| PL12 | 直譯器：走訪 AST 求值<br>`tree-walking-interpreters` | 中級 | 55 分 | PL11、PL06 | 遞迴呼叫堆疊 | 7 段、5 範例、8 題、練習「執行一個有變數、條件與迴圈的小語言」（21 組測資） | **完整 v1.0.0** |
| PL13 | 並行模型<br>`concurrency-models` | 中級 | 55 分 | PL07 | 變數狀態追蹤 | 4 段、5 範例、8 題、練習「列舉所有交錯的最終值」（15 組測資） | **完整 v1.0.0** |
| PL14 | 執行緒與同步<br>`threads-and-synchronization` | 進階 | 60 分 | PL13 | 堆疊與佇列 | 5 段、4 範例、7 題、練習「模擬上鎖並偵測死結」（7 組測資） | **完整 v1.0.0** |
| PL15 | 非同步：Promise、async／await 與事件迴圈<br>`async-await-and-event-loops` | 進階 | 60 分 | PL13、PL06 | 堆疊與佇列 | 6 段、5 範例、8 題、練習「模擬事件迴圈」（11 組測資） | **完整 v1.0.0** |
| PL16 | 編譯流程與中間表示<br>`compiler-pipeline-and-ir` | 進階 | 60 分 | PL12、PL04 | 圖的走訪 | 7 段、5 範例、8 題、練習「一行算式的三位址碼與常數折疊」（32 組測資） | **完整 v1.0.0** |
| PL17 | 虛擬機、位元組碼與 JIT<br>`virtual-machines-bytecode-and-jit` | 進階 | 60 分 | PL16、PL08 | 堆疊與佇列 | 6 段、4 範例、8 題、練習「執行一段位元組碼」（13 組測資） | **完整 v1.0.0** |
| PL18 | 超程式設計與反射<br>`metaprogramming-and-reflection` | 進階 | 60 分 | PL11、PL05 | 函式呼叫追蹤 | 7 段、5 範例、7 題、練習「有紀錄的快取包裝器」（8 組測資） | **完整 v1.0.0** |
| PL19 | 語言設計取捨<br>`language-design-tradeoffs` | 進階 | 55 分 | PL05、PL08、PL13 | 無（表格與逐步說明） | 7 段、5 範例、8 題、練習「依需求為語言評分並排序」（17 組測資） | **完整 v1.0.0** |

大綱上的活動 `type-checker`、`memory-model` 尚未實作：PL04、PL05 不放替代的互動元件，改用比較表格與逐步說明（視覺化 `none`）；PL02 以函式呼叫追蹤呈現經由基底參考的動態分派。

第二批（PL06–PL10）的大綱活動 `scope-chain`、`memory-model`、`gc-visualizer`、`compiler-pipeline` 也尚未實作，改用已實作的共用視覺化：PL06 追蹤閉包工廠的呼叫框架、PL07 追蹤呼叫框架並以表格列出堆積物件與參考者、PL09 追蹤例外穿過呼叫堆疊時的回溯與清理（以上為函式呼叫追蹤）；PL08 以圖的走訪呈現 mark-and-sweep 從根集合標記與清除（步驟由課內程式產生）；PL10 以變數狀態追蹤狀態轉移式 lexer 的狀態、位置與目前字元。

第三批（PL11–PL15）的大綱活動 `ast-explorer`、`concurrency-timeline` 尚未實作（見 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)），改用共用追蹤的多面板：PL11 以樹面板呈現 AST 隨遞迴下降函式回傳逐步長出、框架面板呈現解析函式的呼叫堆疊；PL12 以遞迴呼叫堆疊呈現 `run(node, env)`，同時在樹上標出目前節點、以表格列出環境；PL13 以變數狀態與時間軸表格追蹤兩個執行緒的排程模擬；PL14 以佇列容器呈現有界緩衝區與鎖的持有者；PL15 以呼叫堆疊、微任務佇列與任務佇列追蹤一段 JavaScript 程式的事件迴圈。步驟都由課內程式實際執行產生；真實的執行緒交錯不可重現，範例只印確定的結果，交錯以排程模擬呈現。

第四批（PL16–PL19）的大綱活動 `compiler-pipeline`、`ast-explorer`、`case-study-board` 尚未實作（見 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)）：PL16 以圖的走訪呈現切出基本區塊後的控制流程圖、以表格列出三位址碼；PL17 使用大綱指定且已實作的堆疊與佇列，逐條指令呈現 pc、運算元堆疊與區域變數槽；PL18 以函式呼叫追蹤呈現裝飾器包裝後的呼叫鏈（wrapper → 原函式）；PL19 不放替代的互動元件，以比較表格與逐步說明（視覺化 `none`）。步驟都由課內程式實際執行產生；`javap`、`dis` 與 JIT 的真實輸出隨版本改變，只在正文引用，JIT 以確定性的模擬呈現，不寫效能倍數。

## 單元

| 單元 | 課程 |
|---|---|
| 程式設計典範與抽象 | PL01–PL03 |
| 型別與多型 | PL04–PL05 |
| 作用域、記憶體與錯誤處理 | PL06–PL09 |
| 語言處理 | PL10–PL12 |
| 並行與非同步 | PL13–PL15 |
| 編譯、執行與語言設計 | PL16–PL19 |

其餘 1 堂（PL20 綜合挑戰）仍是規劃中，依 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md) §7 的佇列在第五批撰寫。

## 與其他島的關係

- 先修只依賴已開放的課：基礎程式島（F02、F13、F14、F15、F18）、資料結構島（D03）與本島前面的課。
- 已開放的資料庫島 DB16（ORM 與驅動程式）以 PL02 為先修；DB14～DB16 建議 PL09、PL13、PL14（皆已開放）。

## 3D 世界

程式語言島的課程已部分開放（`status: 'available'`），3D 地圖仍是原本的規劃中地景（`mapState: 'planned'`）：沒有 GLB、沒有重新建模、座標與地形不變。島嶼面板與區域頁依課程顯示已開放的課與單元；地形、霧與標記依 `mapState`。兩者分開的原因與規則見 [COURSE_INVENTORY](COURSE_INVENTORY.md) §6。
