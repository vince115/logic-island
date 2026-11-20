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

大綱上的活動 `type-checker`、`memory-model` 尚未實作：PL04、PL05 不放替代的互動元件，改用比較表格與逐步說明（視覺化 `none`）；PL02 以函式呼叫追蹤呈現經由基底參考的動態分派。

## 單元

| 單元 | 課程 |
|---|---|
| 程式設計典範與抽象 | PL01–PL03 |
| 型別與多型 | PL04–PL05 |

其餘 15 堂（PL06–PL20）仍是規劃中，依 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md) §7 的佇列分批撰寫。

## 與其他島的關係

- 先修只依賴已開放的基礎程式島（F02、F13、F14、F18）。
- 已開放的資料庫島 DB16（ORM 與驅動程式）以 PL02 為先修；DB14～DB16 建議 PL09、PL13、PL14（規劃中）。
