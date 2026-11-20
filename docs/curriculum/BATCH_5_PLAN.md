# 第五批課綱盤點與視覺化策略（PL20）

> 2026-11-20，課程生產流程第五批的 Phase A／B。大綱取自 `docs/planning/data/curriculum-blueprint.json`（標題、目標、概念、先修以藍圖為準，不得偏離）；規格見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)。基準：`main` `fd01b1d`，已發布 99 堂。

## 0. 範圍

第五批只做 PL20「程式語言島綜合挑戰：打造迷你語言」。它是程式語言島最後一堂課；發布後全島 20 堂都已開放，島嶼的課程狀態由「開放中」（`available`）變成「完整」（`complete`），和資料庫應用島寫完時相同。

不改 3D：程式語言島的 `IslandConfig.mapState` 維持 `'planned'`，GLB、座標、P9 相機都不動（課程開放與 3D 視覺狀態分離）。

## 1. 內容矩陣

| | PL20 程式語言島綜合挑戰：打造迷你語言 |
|---|---|
| slug | `programming-languages-capstone` |
| 難度 | 進階 |
| 先修 | PL12、PL19 |
| 建議 | PL16、PL17、PL18 |
| 學習目標 | 整合 lexer、parser 與直譯器完成含變數、函式與閉包的迷你語言；加入基本型別檢查與清楚的錯誤訊息；以測試驗證作用域、遞迴與錯誤處理；說明自己的語言做了哪些設計取捨 |
| 核心概念 | 綜合應用、語言實作、型別檢查、測試、設計取捨 |
| 四語範例 | 適合：四語各寫同一個迷你語言的各階段（lexer、parser、含閉包的求值器、型別檢查），範例只示範單一階段，完整直譯器是練習的參考解答 |
| 測驗 | 給定迷你語言程式預測輸出或錯誤、閉包捕捉的環境、型別檢查擋下的錯誤、測試案例的設計、設計取捨的後果 |
| 練習 | 從標準輸入讀一段迷你語言程式，執行後輸出結果；遇到語法、名稱或型別錯誤時輸出確定的錯誤訊息（含行號）。語法、型別規則與錯誤格式在題目中明定 |
| 大綱活動 | `challenge-stages`（已實作） |

大綱沒有、因此不加入：完整的靜態型別推論（Hindley–Milner）、垃圾回收器、位元組碼編譯（PL17 已介紹，只在設計取捨中提及）、標準函式庫與模組系統。

## 2. 視覺化策略

| 課程 | 使用的既有視覺化 | 表達方式 | 是否正確表達 |
|---|---|---|---|
| PL20 | `challenge-stages`（綜合挑戰分段） | 依關卡列出 lexer → parser → 環境與閉包 → 型別檢查與錯誤 → 測試與設計取捨，每關標出用到的前面課程（PL10、PL11、PL12、PL06、PL04、PL09、PL19 等） | 是：綜合挑戰就是分關整合前面的課；和 F20、D20、A20、DB20 用同一個元件 |

## 3. 確定性與語言版本

- 範例與練習輸出必須確定：不印位址、雜湊順序或計時結果。
- C++ 以 `-std=c++17 -Wall -Werror` 編譯（CI 為 Ubuntu 的 GNU g++，本機為 Apple clang）；Java 以 `--release 17` 編譯；Python 3；JavaScript 為 Node.js。
- 迷你語言的整數運算規則（除法取整方向、除以零）在題目中明定，四語參考解答必須給出相同輸出；不依賴各語言整數溢位行為（題目限制數值範圍）。
- 錯誤訊息格式固定，四語一致，由執行參考解答產生測資的期望輸出。

## 4. 發布後要調整的測試

PL20 原本是測試裡「仍為規劃中的課」的例子。發布後改用其他仍規劃中的島（系統分析與設計島 SA），不把 PL20 偽裝回規劃中：

- `tests/world-catalog.test.ts`、`tests/world-config.test.ts`、`tests/trials-validate.test.ts`、`e2e/sql.spec.ts`：改用 SA20 `systems-analysis-capstone`。
- `tests/world-navigation.test.ts`：PL20 結束程式語言島（`islandComplete`）；「下一堂仍是大綱、不給連結」改由規劃中島嶼的課驗證。
- `tests/world.test.ts`：程式語言島的課程狀態為 `complete`，`mapState` 仍是 `'planned'`。
