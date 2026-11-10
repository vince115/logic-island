# 06 題庫匯入流程（Shared Trial System T.1）

依 Prompt 7 建立的可重複題目匯入流程：先檢查、產生報告，確認後才寫入。核心是純函式 `src/lib/trials/import.ts`；命令列包裝是 `scripts/trials/import.ts`。

## 用法

```bash
pnpm trials:import src/content/trials/batches/<批次>.json
```

```bash
pnpm trials:import src/content/trials/batches/<批次>.json --write --report docs/exam-system/imports/<批次>.md
```

- 預設是 **dry-run**：只檢查並輸出報告，不寫任何檔案。
- 加 `--write` 才寫入，而且只在全部檢查通過時寫入。寫入內容：
  - `src/content/trials/generated/<批次 id>.json`
  - 重新產生的 `src/content/trials/generated/index.ts`
  - `published-hashes.json`（加入新發布的版本）
- T.1.1 起：
  - `--write` 只接受位於 `src/content/trials/batches/<批次 id>.json` 的批次檔。輸出一律記錄這個路徑；從其他位置執行只能 dry-run，報告會出現警告。
  - 三個檔案先寫成暫存檔，全部成功後才換上；任何一步失敗都會還原，不會只寫入一部分（`scripts/trials/write-files.ts`）。
- `--report <檔案>`：把報告另存成 Markdown。
- 題庫驗證的對照資料（`trialContext`）在 `src/content/trials/context.ts`。T.1.1 把它從 `index.ts` 移出，因為它會載入整套課綱；只有測試與 CLI 需要它。
- 執行方式：Node 24 的 `--experimental-transform-types`，加上 `scripts/trials/hooks.mjs`（處理 `@/` 別名、省略副檔名的 import 與 JSON）。不新增任何套件。
- 不能匯入時，exit code 為 1。

## 檔案

| 位置 | 內容 | 誰改 |
|---|---|---|
| `src/content/trials/batches/*.json` | 批次檔（輸入） | 人工或 AI 準備，經審稿 |
| `src/content/trials/generated/*.json`、`index.ts` | 題庫實際使用的題目（輸出） | **只由匯入流程寫入**，不手改 |
| `src/content/trials/published-hashes.json` | 每個已發布版本的雜湊 | 匯入流程只會新增 |
| `src/content/trials/{sources,tags,papers,exams,entries}.ts` | 來源、標籤、試卷、考試、入口 | 人工（TypeScript） |
| `docs/exam-system/imports/*.md` | 匯入報告 | 匯入流程 |

**順序**：
1. 先在 `sources.ts` 登記來源（官方題還要登記答案來源）。
2. 在 `tags.ts` 登記標籤。
3. 匯入題目。
4. 最後才把題目放進 `papers.ts` 的試卷。

試卷引用尚未匯入的題目時，整體驗證會失敗。

## 批次格式 `logic-island.trials-import/1`

**批次層級**：

| 欄位 | 說明 |
|---|---|
| `batch` | `id`（kebab-case，也是輸出檔名）、`title`、`preparedBy {kind: human\|ai, name}`、`preparedAt` |
| `origin` | `original`／`official-original`／`official-sample`／`adapted-from-official` |
| `source` | `sources.ts` 的來源 id |
| `answerKey` | 官方題必填：`{sourceId, answers: {題號: 字母}}` |
| `paper` | 題目出自的官方試卷 `{subjectId, paperId}`；每題自動得到含題號的 `appeared-in` |
| `skipped` | 原卷沒有匯入的題號與原因（例如有圖、送分） |
| `fidelity` | 轉錄方式與保真度說明 |
| `generatedBy` | AI 撰寫的題目必填 |
| `revisionNote` | 這次匯入的說明 |
| `reviews` | 套用到每一題的審稿紀錄 |

**每題**：
- 必填：`id`、`type`（目前只接受 `single-choice`、`code-reading`）、`stem`（文字或內容區塊）、`options`（依序得到 a、b、c… 的 id）、`tags`。
- 選填：
  - `number`（有答案來源時必填）
  - `code` 與 `stemAfter`（程式片段及其後的文字）
  - `answer`（A 起算的字母；有官方答案時可省略，提供時必須一致）
  - `explanation`、`lessons`、`appearances`、`difficulty`
  - `verifiedBy`、`interpretationNote`、`reviews`
  - `change`（改版時必填，見下方）

## 檢查（全部列在報告中）

1. **結構**：格式版本、必要欄位、題型、選項 2～6 個、內容區塊；不接受圖片（目前沒有資產登錄）。
2. **重複**：
   - 批次內 id 與題號不重複；
   - id 不得和其他批次的題目相同；
   - 題幹＋選項（NFKC、大小寫與空白不計）和題庫中的其他題目相同，視為錯誤；
   - 只有題幹相同，列為警告。
3. **答案**：
   - 單選題恰有一個正解，答案必須對應到一個選項；
   - 官方題逐題對照官方答案；
   - 官方答案不是單一字母（例如「一律給分」）的題目暫緩發布；
   - 原卷的每一題都要匯入，或在 `skipped` 寫明原因。
4. **授權**：
   - 授權未確認的來源不匯入任何題文；
   - 原創題只能引用 original-basis，官方題只能引用官方來源；
   - 改作只限可自由利用或已取得同意的題目；
   - 非原創來源一定要標示出處；
   - 顯示權限依 `LICENSE_DISPLAY` 取上限。
5. **審稿**：
   - 匯入流程不新增審稿紀錄、不提升狀態；
   - AI 撰寫或轉錄、而沒有人工核准的題目，以 `in-review` 匯入（不會出現在試卷上，也不記錄雜湊）；
   - AI 撰寫的題目另外需要答案驗證；
   - 官方題需要 `source-checked`（`validateTrials` 也檢查這一條）；
   - 有 `changes` 或 `reject` 意見的題目暫緩。
6. **版本**：
   - 已發布版本的雜湊不得改變；
   - 學習者看到的內容改變時，必須加上 `change {kind, note, at}`，流程會新增一個版本；
   - 先前匯入過的題目不得從批次中刪除。
7. **整體驗證**：把這個批次放進題庫後，再執行一次 `validateTrials`。

同一個批次再匯入一次，所有題目都會是「未變更」，寫出的檔案逐位元組相同。`tests/trials-import.test.ts` 對每個批次檢查這一點，所以批次檔與輸出不可能不同步。

## 第一批（2026-11-03）

| 批次 | 題數 | 結果 | 報告 |
|---|---:|---|---|
| `2026-11-03-mvp-originals` | 13 | 由 T.0 的 TypeScript 題目模組轉換；版本雜湊與 T.0 記錄相同 | [報告](imports/2026-11-03-mvp-originals.md) |
| `2026-11-03-moex-114-pukao-computer` | 40 | 考選部 114 年普考《計算機概要》測驗題；答案 40/40 與官方相符 | [報告](imports/2026-11-03-moex-114-pukao-computer.md) |

MOEX 題的轉錄方式：
- 從考選部 PDF 的文字層擷取，再把四頁原卷渲染成圖片逐頁對照，修正：
  - 選項標記遺失造成的選項分界；
  - 跨行合併；
  - 英文空白（第 34 題）；
  - 第 17、27 題的程式縮排。
- 第 17（Java）、18（Python）題實際執行過；第 27 題的虛擬碼改寫成 Python 執行過。三題都與官方答案相符。
- 第 27 題原卷的 else 分支沒有 `return`，在 `interpretationNote` 記錄依官方答案的解讀。
- 40 題的解析都是 Logic Island 撰寫，頁面標示「Logic Island 撰寫，非官方解答」。
- 逐題校對與解析審稿屬於這一批的驗收。
