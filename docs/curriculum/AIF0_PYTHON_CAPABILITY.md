# AIF-0：AI 基礎島的 `python-code` 課程能力

> 2026-11-22。目標：讓 AI 基礎島（AIF）的課可以撰寫、驗證、發布；本階段不寫 AIF 課程內容。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 為什麼是新能力

藍圖把 AI 群島的程式練習標成 `code-python`（AIF 12 堂、ML 20、DL 14、LLM 11、AG 7、OPS 3、GEN 3），目標也直接寫「以 Python 實作」。`program-code` 要求 C++、Java、Python（JavaScript 選配），不改它的意思；另立 `python-code`：只有 Python 的程式課。好處：

- 不必為機率、分數與隨機數在四種語言各寫一份 Fraction、LCG，也沒有四語浮點捨入不一致的問題。
- 機器學習、深度學習、大型語言模型島之後沿用同一個能力。

## 2. 規格

| 部分 | 位置 | 內容 |
|---|---|---|
| 能力 | `schema.ts` `LESSON_CAPABILITIES` | `python-code`，單獨使用；`supportedLanguages` 必須正好是 `['Python']` |
| 程式碼型別 | `LessonCode` | 四語型別或 `PythonCode`（只有 `Python`，其他語言不存在，不是空字串） |
| 判斷 | `hasProgramCode(lesson)` | `program-code` 或 `python-code`；課程頁、發布閘門、程式碼測試都用它 |
| 驗證 | `validateContent` | 程式課的檢查照舊（範例、練習、測資），語言改看課程自己的 `supportedLanguages`；測驗的程式片段與視覺化追蹤的語言也必須是課程教的語言 |
| 大綱 | `pythonFromBlueprint`（`lessons.ts`） | 標題、目標、概念、難度、先修取自藍圖；藍圖活動（search-tree、game-tree…）尚未建置，課程改用已實作的共用視覺化，不放替代元件 |
| 島嶼 | `PREPARED_ISLAND_IDS = ['ai-foundations']`、`ISLAND_PREFIX` `AIF` | 和 CN-0 相同：第一堂課寫好、移入 `ISLAND_IDS` 之前不會有頁面 |

## 3. Python 程式的規則（`tests/python-capability.test.ts`）

- 只用標準函式庫：每段 Python 程式的 import 都必須在 `sys.stdlib_module_names` 裡（CI 的 Python 沒有安裝 numpy 等套件）。
- 輸出不隨雜湊種子改變：每段程式在 `PYTHONHASHSEED=0` 與 `1` 下輸出必須相同（字串的 set、dict 順序會變，印出前要排序）。
- 隨機性用固定種子或課內的 LCG；機率用 `fractions` 或固定格式，避免浮點捨入的邊界。
- 語法與標準函式庫不超過 Python 3.12。

測試先證明檢查本身有效（一個依賴雜湊順序的程式在不同種子下輸出不同、`numpy` 被找出來），再對所有 python-code 課程逐段檢查。

## 4. 隔離與不變的部分

- `program-code` 仍要求 C++、Java、Python：把 A14 改成只有 Python 會被拒絕。
- 所有已發布課程的能力與語言不變，`validateCurriculum` 仍是 `[]`，發布閘門全數通過。
- 測驗程式片段的語言檢查從「四種語言之一」收緊為「課程教的語言」，既有課程沒有受影響（F、D、A、PL、CN 的程式課都教 JavaScript；SQL 片段只在資料庫課）。

## 5. AIF 的批次

課程編號即位置，依序連續發布；同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。

| 批次 | 課程 | 說明 |
|---|---|---|
| AIF-1 | AIF01–AIF05 | AI 是什麼、發展史、智慧代理人、無資訊搜尋、A*；AIF01 是 ML01、LLM01、GEN01 的先修 |
| AIF-2 | AIF06–AIF10 | 區域搜尋、Minimax、Alpha-Beta、CSP、知識表示 |
| AIF-3 | AIF11–AIF15 | 命題邏輯、一階邏輯、機率、貝氏定理、貝氏網路；AIF13 是 ML10 的先修 |
| AIF-4 | AIF16–AIF19 | 馬可夫鏈與 HMM、決策理論、MDP、負責任的 AI |
| AIF-5 | AIF20 | 綜合專題，單獨一批 |

視覺化一律用已實作的共用追蹤：樹的走訪（搜尋樹）、圖的走訪（A*、知識圖譜、貝氏網路）、遞迴樹（minimax、CSP）、動態規劃表（HMM、MDP）、變數狀態（機率表、邏輯）。藍圖的互動活動列入 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)。
