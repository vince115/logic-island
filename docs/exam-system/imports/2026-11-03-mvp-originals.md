# 題庫匯入報告：2026-11-03-mvp-originals

- 模式：**寫入**
- 批次檔：`src/content/trials/batches/2026-11-03-mvp-originals.json`
- 名稱：T.0 MVP 原創測試題（APCS 程式識讀 7 題、銀行資訊類 6 題）
- 準備者：AI（claude-opus-5-5），2026-11-03
- 來源：`basis-apcs-reading`；類型：original
- 結果：**可以匯入**（錯誤 0、題庫驗證問題 0、警告 0）
- 題目：13 題｜新增 13、未變更 0、新版本 0、僅更新中繼資料 0｜發布 13、暫緩（審稿中）0

## 錯誤

- 無

## 題庫整體驗證（validateTrials）

- 無

## 警告

- 無

## 暫緩發布

- 無

## 逐題

| 題目 | 原卷題號 | 題型 | 答案 | 答案核對 | 授權 | 狀態 | 變更 | 雜湊 |
|---|---|---|---|---|---|---|---|---|
| `orig-apcs-read-01` | — | code-reading | C | 程式實際執行 | original | 發布 | 新增 | `28dda20a` |
| `orig-apcs-read-02` | — | code-reading | A | 程式實際執行 | original | 發布 | 新增 | `d5a7e142` |
| `orig-apcs-read-03` | — | code-reading | A | 程式實際執行 | original | 發布 | 新增 | `6e1cd90e` |
| `orig-apcs-read-04` | — | code-reading | B | 程式實際執行 | original | 發布 | 新增 | `f1ec129b` |
| `orig-apcs-read-05` | — | code-reading | B | 程式實際執行 | original | 發布 | 新增 | `cdf560d6` |
| `orig-apcs-read-06` | — | code-reading | B | 程式實際執行 | original | 發布 | 新增 | `ffff9a5f` |
| `orig-apcs-read-07` | — | code-reading | C | 程式實際執行 | original | 發布 | 新增 | `61bff231` |
| `orig-bank-01` | — | single-choice | B | 原創題，作者答案 | original | 發布 | 新增 | `a28b091b` |
| `orig-bank-02` | — | single-choice | A | 原創題，作者答案 | original | 發布 | 新增 | `6c299c71` |
| `orig-bank-04` | — | single-choice | B | 原創題，作者答案 | original | 發布 | 新增 | `a1393fec` |
| `orig-bank-05` | — | single-choice | C | 原創題，作者答案 | original | 發布 | 新增 | `02ae774e` |
| `orig-bank-06` | — | code-reading | B | 程式實際執行 | original | 發布 | 新增 | `cb03c0a1` |
| `orig-bank-09` | — | single-choice | B | 原創題，作者答案 | original | 發布 | 新增 | `653c3477` |

## 檢查項目

- 結構：格式版本、必要欄位、題型、選項 2～6 個、內容區塊、審稿紀錄格式。
- 重複：題號與 id 不重複；題幹與選項（全形半形、大小寫與空白不計）和題庫其他題目相同視為重複；只有題幹相同列為警告。
- 答案：單選題恰有一個正解；官方題逐題對照官方答案（批次內的答案必須一致，非單一字母的官方答案暫緩）；原卷每一題都已匯入或列出未匯入原因。
- 授權：來源存在；授權未確認的來源不匯入任何題文；官方題標示出處；顯示權限取授權允許的上限，不放寬。
- 審稿：匯入流程不新增審稿紀錄、不提升狀態；AI 撰寫或轉錄的題目沒有人工核准就暫緩，AI 撰寫的題目還要有答案驗證；官方題要與原卷核對。
- 版本：已發布的版本雜湊不得改變；內容改變必須寫明變更並新增版本；先前匯入的題目不得從批次中刪除。
