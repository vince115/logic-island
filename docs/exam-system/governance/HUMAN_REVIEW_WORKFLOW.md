# 人工審核操作說明（T.3I Phase 8）

> 本文件只說明流程。T.3I 沒有執行任何真實審核、核准或發布，帳本仍是 0 筆紀錄。每一個決定都必須由帳本裡登記的審核人**親自**做出、親自執行指令。AI 的預審（佇列裡的 `aiReview`）、本機測試、CI 結果都不是核准。

適用範圍：CCAR-F 的 31 題優先級 1（`CCARF_P1_HUMAN_REVIEW.md`），以及之後的 CCAR-F／iPAS 批次。指令都在本機執行，網站沒有審核頁面。

## 0. 開始前

| 項目 | 要求 |
|---|---|
| 審核人身分 | 必須是 `src/content/trials/ledger.json` 的 `reviewers` 裡、角色含 `review` 的人。目前只有 `owner`（專案負責人）。不得用別人的 id，也不得使用名稱含 synthetic／fixture／AI／bot 的 id。 |
| 工作樹 | 在 `trials/mvp`（或之後的發布分支）的乾淨工作樹；`git status` 只能有與審核無關的他人檔案。 |
| 審核資料夾 | 審核包含**未發布題目的答案與解析**，只能寫到網站與版本控制以外的資料夾，例如 `~/logic-island-review/`。不得放進 repository，也不得上傳到聊天室、雲端文件或 issue。 |
| 版本 | 審核針對每題**目前的 revision 與 content hash**；清單 `CCARF_P1_HUMAN_REVIEW.md` 的 revision／hash 欄位和題庫不同時，先停止，重新產生清單。 |

## 1. 取得完整題目資料

```bash
pnpm trials:review packet --exam ccarf --subject foundations --sort risk --priority 1 --first ccarf-b-35,ccarf-b-42,ccarf-b-46,ccarf-b-48,ccarf-c-72,ccarf-d-97,ccarf-d-100 --from 1 --count 25 --out ~/logic-island-review
```

- 第 2 份用 `--from 26 --count 6`（與 `CCARF_P1_HUMAN_REVIEW.md` 相同）。
- 會寫出兩個檔：`<名稱>.md` 是題幹、選項、答案、解析、AI 檢查結果，`<名稱>.decisions.json` 是空白的決定範本（`verdict` 為 null，只能由審核人本人填寫）。
- 每包 10–25 題；B35 和清單上的六題排在最前面。
- 產生審核包只讀題庫，不會改動任何檔案。

## 2. 查核官方文件

1. 依清單的「來源狀態」欄位分組：
   - `exam-guide-primary`（12 題）：只有 Exam Guide 支持，最需要查證。
   - `official-docs`（18 題）：依官方技術文件。
2. 打開題目標示的官方來源（`src/content/trials/sources.ts` 有網址與查核日期），確認：
   - 答案在**今天的**官方文件裡仍然成立；版本敏感的題目也要對照 `ccarf-volatility.json`。
   - 沒有第二個選項也說得通（答案歧義）。
   - 題目沒有照抄官方考題或受版權保護的內容。
3. 把查核結果記在審核資料夾的筆記裡，不要寫進 repository。

## 3. 記錄審核決定

在 `<名稱>.decisions.json` 填入：

| 欄位 | 填法 |
|---|---|
| `by` | 你自己的審核人 id（例如 `owner`） |
| `at` | 審核日期 `YYYY-MM-DD` |
| `decisions[].questionId`、`revision`、`hash` | 照審核包抄寫，不要手改 |
| `decisions[].verdict` | `approve`、`changes` 或 `reject` |
| `decisions[].checks` | 你**實際**做過的檢查，例如 `answer-verified`、`source-checked`、`wording`；核准時必須涵蓋該題要求的全部檢查 |
| `decisions[].note` | `changes`／`reject` 必填原因；`approve` 可留空 |

接著先做 dry run，再確認：

```bash
pnpm trials:review apply ~/logic-island-review/<名稱>.decisions.json
pnpm trials:review apply ~/logic-island-review/<名稱>.decisions.json --confirm <N>
```

- dry run 只檢查，不寫檔。
- `--confirm` 的數字必須等於決定的筆數，才會寫入；寫入是全部成功或全部不寫。
- 寫入的是帳本，以及重新產生的題目狀態（核准後為 `approved`）。**這一步不會發布。**
- 之後用 PR 提交帳本的變更，不要直接推到 `main`。

## 4. 確認 Revision／Hash

- 決定檔的 `revision`、`hash` 必須等於題目**現在**的版本；不同時，`apply` 會拒絕並標示 stale。
- 核准只綁定那一個 hash。之後題目只要改一個字，hash 就不同，舊核准不再適用。
- `pnpm trials:integrity` 會比對評量清單；`CCARF_P1_HUMAN_REVIEW.md` 的 revision／hash 由 `tests/trials-review-readiness.test.ts` 和題庫比對。

## 5. 需要修訂的題目

1. 給 `changes`，`note` 寫清楚要改什麼。
2. 由作者在批次檔修改題目，用 `pnpm trials:import` 匯入，產生**新的 revision**。
3. 用 `pnpm trials:integrity --append` 先 dry run，再用 `--confirm N` 把新 revision 登記到評量清單（只會附加）。
4. 對新 revision 重新產生審核包、重新審核。舊 revision 的決定留在帳本，不刪除。

## 6. 避免使用過期的核准

- `publish.ts` 發布前會重新計算 hash；只有在「最新的人工決定」就是對這個 hash 的核准時才發布。
- 下列情況都不能發布：
  - 核准之後又有 `changes` 或 `reject`。
  - 題目改版後沒有重新核准。
  - 撤回後沒有新的核准。
- 每一筆核准只能用在一次發布。
- `pnpm trials:release-gate --targets <id@rev>,…` 會把過期或不符的情況列為 `blocked`。

## 7. 發布前 Dry Run

```bash
pnpm trials:release-gate --targets <id@rev>,… --json release-gate.json
node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/trials/publish.ts <id@rev> … --by owner --at YYYY-MM-DD
```

- 第一個指令列出發布授權的每一道關卡（`RELEASE_AUTHORIZATION_CHECKLIST.md`）。它只讀檔，在本機永遠不會回報「可發布」，因為遠端 CI、合規與正式授權都要人工補上。
- 第二個指令沒有 `--confirm`，所以只做 dry run，列出會發布的題目。
- 確認無誤、清單全部打勾後，才由授權的人加上 `--confirm N` 執行，再用 PR 提交。

## 8. 撤回錯誤的發布

```bash
node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/trials/revoke.ts <id@rev> --by owner --at YYYY-MM-DD --reason "原因"
node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/trials/revoke.ts <id@rev> --by owner --at YYYY-MM-DD --reason "原因" --confirm 1
```

- 第一個是 dry run，第二個才會撤回。
- 撤回時帳本只**附加**撤回紀錄，原本的發布紀錄保留；`published-hashes.json` 不會改。
- 撤回的題目會離開所有新試卷。學員的歷史成績照常顯示，錯題本只顯示學員當時的作答，不顯示正確答案。
- 要重新發布，必須先有撤回之後的新人工核准，再用 `publish.ts --republish` 發布。

## 9. 確認 Audit Trail

| 檢查 | 指令或位置 |
|---|---|
| 帳本順序與重放 | `pnpm trials:ledger --json trials-ledger.json`，`ok: true` |
| 帳本只有附加 | CI 的 `trials-ledger.json` 有 `base`，且 `failures` 為空 |
| 每筆發布都對應一筆真人核准 | 發布紀錄的 `approval` 指向核准事件的 `eventId`；`reviewers` 不是 synthetic |
| 撤回紀錄 | `withdraws` 指向被撤回的發布 |
| Git 歷史 | 帳本的每次變更都經過 PR，並通過 `gates` 檢查（分支保護生效後） |

## 10. 確認考試內容的使用條款

- 對照 `CCARF_P1_HUMAN_REVIEW.md` 的「合規檢查清單」，逐項由人確認：
  - 題目是原創，沒有照抄官方考題。
  - 沒有使用受保密協議（NDA）保護的考試內容。
  - 有清楚的非官方練習聲明。
  - 沒有暗示 Anthropic 認可。
- 聲明草稿只是草稿，正式用語由人決定。
- 任何一項不確定時，不發布，並記為 `changes` 或待查。**合規確認不能由 AI 代替。**
