# AI 基礎島（AI Foundations Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `pythonFromBlueprint` 讀入。

教學方式是 `python-code` 能力（[AIF0_PYTHON_CAPABILITY](AIF0_PYTHON_CAPABILITY.md)）：範例與練習只有 Python，由 `tests/curriculum-code.test.ts` 實際執行；只用標準函式庫，在兩個不同的雜湊種子下輸出相同（`tests/python-capability.test.ts`）。藍圖的互動活動（search-tree、game-tree…）尚未建置，課程改用已實作的共用追蹤視覺化，步驟由課內程式實際執行產生。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 視覺化 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| AIF01 | AI 是什麼<br>`what-is-ai` | 入門 | 45 分 | F01 | 條件分支（規則式恆溫器） | 6 段、4 個範例（理性代理人、規則聊天機器人、詞頻分類器、恆溫器）、練習「把系統分類為規則式程式或 AI」（6 組測資）、8 題 | **完整 v1.0.0** |
| AIF02 | AI 的發展史與主要方法<br>`ai-history-and-approaches` | 入門 | 45 分 | AIF01 | 無（時間軸與比較表格） | 6 段、4 個範例（前向鏈結專家系統、學會 AND 的感知器、學不會 XOR 的感知器、依時期分組的時間軸）、練習「AI 時間軸分期」（15 組測資）、8 題 | **完整 v1.0.0** |
| AIF03 | 智慧代理人<br>`intelligent-agents` | 入門 | 50 分 | AIF01 | 陣列與字串（格子世界的吸塵代理人） | 6 段、4 個範例（兩格吸塵世界、PEAS、模型式代理人、績效度量比較）、練習「格子世界的反射型吸塵器」（20 組測資）、8 題 | **完整 v1.0.0** |
| AIF04 | 問題形式化與無資訊搜尋<br>`problem-formulation-and-uninformed-search` | 中級 | 60 分 | AIF03、A14、A15 | 樹的走訪（BFS 搜尋樹與邊界佇列） | 6 段、5 個範例（通用問題類別、樹搜尋與圖搜尋、BFS 與 UCS、迭代加深、八數碼）、練習「以 BFS、UCS、IDS 搜尋路徑」（34 組測資）、8 題 | **完整 v1.0.0** |
| AIF05 | 啟發式搜尋與 A*<br>`informed-search` | 中級 | 60 分 | AIF04、A16 | 圖的走訪（A* 的 open、closed 與 g、h、f） | 6 段、5 個範例（貪婪與 A*、不可接受的啟發函數、格子尋路、八數碼的兩種啟發、有效分支因子）、練習「格子地圖上的 A*」（15 組測資）、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| AI 的定義與歷史 | AIF01–AIF02 |
| 代理人與搜尋 | AIF03–AIF05 |

## 後續批次

其餘 15 堂依編號連續發布（AIF06–AIF10、AIF11–AIF15、AIF16–AIF19、AIF20），理由見 [AIF0_PYTHON_CAPABILITY](AIF0_PYTHON_CAPABILITY.md) §5。

課程狀態與 3D 地景分離：AI 基礎島的 `mapState` 仍是 `'planned'`，地景要另行授權的建模階段才會改變。AI 群島因此第一次有已開放的課（區域狀態 available），其他六座島仍是大綱。
