# T.3H 歷史作答完整性與 CI 發布準備

> 狀態：本機完成並驗證。**GitHub CI 從未在遠端執行**；以下 CI 相關結果全部來自本機 Git Fixture 與本機模擬事件。沒有 push、merge、deploy、publish，沒有建立任何人工核准。

## 1. 起點與範圍

| 項目 | 值 |
|---|---|
| Branch／起始 HEAD | `trials/mvp`／`3d64399`（T.3G 最後一個 commit，符合預期） |
| 工作樹 | 只有 Theme Session 的 5 個檔案與 `.claude/`（diff checksum `f612b09…`，結束時相同） |
| 帳本 | 0 筆紀錄 |
| 已發布 Hash／評量清單／固定卷 | 57 筆／429 revision／3 份共 53 題 |
| 題庫 | CCAR-F 150 題、iPAS 200 題，全部 `in-review` |

本輪不新增題目、不改既有題目、不發布；T.3G 的帳本順序與固定卷版本照舊，不重做。

## 2. 作答紀錄稽核（Phase 1）

資料流：

```
試卷頁 → startSession（engine.ts）→ localStorage logic-island.trials（store.ts、use-trials.ts）
       → finish → putSession → 錯題本（review.ts）
       → 成績頁（result-report.tsx）、錯題本頁（review-book.tsx）
```

T.3H 之前的資料結構與缺口：

| 項目 | T.3G 時已有 | 缺口 |
|---|---|---|
| Attempt ID | session `id`（UUID） | — |
| Exam ID | 沒有，只能從 paperId 推 | 跨考試無法核對 |
| Paper ID／version | `paperId`、`paperVersion` | — |
| 每題 revision／hash | 有 | 沒有 hash version |
| 題序、選項順序、答案 | `items` 依序、`optionOrder`、`answer` | — |
| 計分快照 | `result`（engineVersion、得分、perItem） | perItem 沒有記錄評分依據的 revision／hash |
| 交卷時間 | `endedAt`、`gradedAt` | — |
| 錯題本 attempt | `sessionId`、`revision`、`correct`、`at` | 沒有 hash、考試、試卷、作答內容；只用題號對應題目 |

另外找到的問題：

1. **成績頁會把新版題目套在舊答案上。** 題目改版後，成績頁仍顯示目前的題幹與選項，並把當時的正確答案標在新選項上，只多一行「有修訂」的提示，等於用新版題目冒充舊題。
2. **讀不出來的紀錄會被直接丟掉。** 形狀不對的 session 或錯題紀錄在讀取時被過濾，下一次寫入就永久消失，沒有保留副本。
3. **已結束的作答可以被覆寫。** `putSession` 會用傳入的 session 取代任何同 id 的紀錄，包括已評分與已放棄的作答。
4. **result 沒有和 items 交叉核對。** 損毀的 perItem 會讓成績頁對錯題目，或直接當掉。

## 3. 作答身份（Phase 2）

新作答（`engine.ts`）：

- session 加上 `examId`；
- 每題加上 `hashVersion`（1 舊版、2 含解析），和 revision、hash 一起固定；
- `result.perItem` 每題記錄評分依據的 `revision`、`hash`；
- Attempt ID 就是 session `id`。

不可變規則（`store.ts`）：

- `putSession` 不取代任何已結束（已交卷、逾時、放棄）的 session，所以不會重新評分、不會改答案、不會復原已放棄的作答。
- 讀取時逐項檢查 session：perItem 的數量、題號順序、revision、hash 都必須和 items 一致，否則隔離。
- `hashVersionOf` 只從 hash 的格式判斷版本（`v2-` 加 16 位、或 8 位十六進位），不會猜。

## 4. 錯題本身份（Phase 3）

每筆 attempt 新增：`hash`、`hashVersion`、`examId`、`paperId`、`paperVersion`、`answer`（選了什麼、正確答案、選項順序，只存選項 id）。

`identityOf` 以最新一筆 attempt 判斷：

| 狀態 | 條件 | 錯題本顯示 |
|---|---|---|
| `current` | 內容 hash 相同。舊版 hash 下只改解析的 revision，hash 不變，所以算同一題 | 照常練習 |
| `revised` | revision 不同，內容也不同 | 說明「你答的是第 a 版，目前是第 b 版」，可以練新版，記為新版本的練習 |
| `legacy` | 同一 revision，但紀錄沒有 hash | 說明無法確認內容相同，可練習 |
| `mismatch` | 同一 revision，hash 卻不同 | 不顯示題目、不能作答 |
| `other-exam` | 紀錄的考試不在題目目前所屬的考試中 | 不顯示題目、不能作答 |
| `withdrawn` | 題目已撤回或下架 | 只顯示保存的紀錄：日期、版本、試卷（含「已退場」）、學員的選擇與當時對錯 |

已撤回的題目**不顯示正確答案**：題目被撤回的原因可能正是答案有誤。

原創題可能同時屬於兩個考試，例如 `orig-apcs-read-06` 同時屬於 APCS 與高普考。所以題目頁面資料記錄 `exams`（題目所屬的全部考試），不是單一考試；這類題目在錯題本重練時不記錄 `examId`。

## 5. 舊資料遷移（Phase 4）

| 要求 | 做法 |
|---|---|
| 版本 | `TRIALS_VERSION` 1 → 2 |
| Copy-on-write | v1 在每次讀取時於記憶體中遷移，讀取本身不寫入。第一次寫入前，先把 v1 原文逐字存到 `logic-island.trials.v1-backup`，之後才寫 v2。備份已存在時不覆蓋；備份寫不進去時不覆寫 v1，這次造訪改在記憶體中進行 |
| Idempotent | 遷移是純函式：同一段原文永遠得到同一個 store；寫回後再讀也相同 |
| 不靜默遺失 | 讀不出來的 session 或錯題紀錄原樣放進 `quarantine`，並記錄原因；不使用、不刪除 |
| 不重新評分 | session（含 result）原樣保留 |
| 版本不明 | 錯題 attempt 只從它指名的、仍保存著、同題同 revision 的 session 取得 hash；否則維持未知（`legacy`），不從今天的題庫補 |
| 回復 | 回到 v1 網站時，v2 資料被視為較新版本，只讀不覆寫（T.0 的規則）；`downgradeToV1` 可產生 v1 格式；備份 key 保有原文 |
| 不清空 | 沒有任何程式清除 localStorage |

舊格式 Fixture（`tests/trials-attempt-history.test.ts`）涵蓋：

- 重複遷移；
- 局部損毀：缺欄位的 session、result 對不上 items 的 session、損毀的 attempt；
- 版本不明：session 已被上限刪除的 attempt、錯題本重練、revision 不同；
- 已撤回的題目；
- 備份失敗；
- 較新版本的資料。

## 6. 固定卷退場政策（Phase 5）

`schema.ts`：

- `paperOriginOf`：fixed、不是改編、全部是官方題 → `official-original`；有 `adaptedFrom` → `adapted`；其餘 → `practice`。
- `paperStatusOf`：`retired`（人工設定）＞`maintenance`（有撤回題）＞`open`。

| 類型 | 規則 |
|---|---|
| 官方原卷（MOEX 114 普考計算機概要） | 保留原卷身份。`planPaperRevision` 拒絕在同一 id 下產生缺題或換題的版本。缺題時維持維護中，頁面說明「缺題的原卷不再是完整的官方原卷」 |
| 改編練習卷 | 由 `planAdaptedPaper` 提出：新 id、`adaptedFrom`（來源試卷與版本）、保留的題目固定到 revision、標題把「原卷」改為「改編練習卷」、不帶入及格線。驗證規則：必須是 fixed、id 不同、來源是同科目的 fixed 試卷、版本 x.y.z、標題不得含「原卷」。頁面標示「改編練習卷：改編自《…》第 v 版，不是完整的官方原卷」 |
| 維護中／已退場 | 不能開始新作答；未完成的作答不接續（可以放棄）；歷史成績可查看 |

MOEX 演練（記憶體中，SYNTHETIC 審核人）：撤回 q05 →

- 原卷進入維護中；
- 同 id 改版被拒；
- 改編卷提案 39 題，每題的 hash 與 1.0.0 版登記一致；
- 提案總分 97.5、沒有及格線；
- 尚未登記，需人工執行 `--append`。

**待人工決策（Pending）**：

- [ ] MOEX 原卷缺題時要維持維護中、退場，還是另外提供改編練習卷；
- [ ] 改編卷的總分、及格線（或不設）、標題、說明與備註文字；
- [ ] 改編卷是否登記（`trials:integrity --append`）。

既有 53 題、57 筆 Hash、3 份已登記的版本都沒有改動；`papers.ts` 沒有任何試卷被設為改編或退場。

## 7. 介面與作答相容（Phase 6）

| 情境 | 結果 |
|---|---|
| 題目撤回後的歷史成績 | 分數不變；撤回題只顯示「已撤回」與當時對錯（T.3G） |
| 題目改版後的歷史成績 | 不顯示新版內容；顯示「你答的是第 a 版，目前是第 b 版，內容不同」，以及當時的選擇與當時的正確答案字母 |
| 另一個考試的 session | 成績頁當作找不到 |
| 已撤回的錯題 | 保存的紀錄，不顯示答案 |
| 固定卷維護中 | 不能開始（T.3G）；官方原卷另有說明 |
| 固定卷已退場 | 標題「已退場」，說明日期與原因，不能開始；未完成的作答不接續；成績頁註明已退場 |
| 改編練習卷 | 開始前與成績頁都有標示；試卷列表顯示「改編練習卷（非完整官方原卷）」 |
| 舊版成績重新開啟 | v1 資料讀取時不變；第一次寫入後，舊 session 逐字保留 |

## 8. CI Base 解析（Phase 7）

### 8.1 稽核發現

舊 workflow 用 `pull_request.base.sha || before` 當 Base，**commit 不存在時就跳過比對**：

- 第一次 push（`before` = 000…）；
- force-push 後舊 tip 沒有被抓下來；
- shallow clone。

這些情況下附加檢查全都不會執行，等於 **fail open**。

### 8.2 新做法

新增 `src/lib/trials/ci-base.ts` 與 `pnpm trials:ci-base`，在任何檢查之前先決定 Base：

| 事件 | Base | 無法確認時 |
|---|---|---|
| pull_request | `base.sha`（是 merge commit 的祖先）；或 `base.sha` 與 HEAD 的 merge-base | 不在歷史中、沒有 SHA、無共同歷史 → 失敗 |
| push | `before`（是 HEAD 的祖先）；`after` 必須等於 HEAD | `before` 不存在 → 失敗 |
| force-push | 仍然是 `before`：遠端原本有的紀錄不得消失。workflow 先用 SHA 抓取舊 tip | 抓不到 → 失敗 |
| 新分支（before = 000…） | 與預設分支的 merge-base | 沒有預設分支或無共同歷史 → 失敗 |
| workflow_dispatch | 與預設分支的 merge-base | 同上 |
| 其他（含 pull_request_target） | — | 一律失敗 |
| shallow clone | — | 一律失敗 |

Base 確定之後，CLI 從 Base 取出 manifest、paper-versions、ledger 三份檔案的副本。Base 沒有某個檔案時，報告寫明「absent」，對應檢查改為不比對 Base 並說明原因。結果寫入 `trials-ci-base.json`（artifact）與 step outputs，後續步驟用 env 取得路徑。

### 8.3 Workflow 其他修改

- `persist-credentials: false`；
- artifact `retention-days: 14`；
- 必要測試清單加入本輪 6 個測試檔；
- 權限維持 `contents: read`。

### 8.4 本機驗證

Git Fixture 的 16 項測試涵蓋：

- 一般 push、新分支、預設分支第一次 push、force-push（有與沒有舊 tip，含沒有標為 forced 的改寫）；
- 缺少 Base、HEAD 與 after 不符；
- PR merge commit、PR head、無共同歷史；
- workflow_dispatch、其他事件、shallow clone；
- CLI 輸出（逐位元組的副本、absent、exit 1）。

本機也用本 repository 模擬兩個事件：

| 模擬事件 | 結果 |
|---|---|
| push：before = `3d64399` | `push-before`，三份檔案都取得 |
| `trials/mvp` 第一次 push | merge-base 為 `origin/main` 的 `f45c867`，三份檔案在該處都不存在 |

`trials/mvp` 第一次 push 時沒有可比對的舊紀錄，從第二次 push 或 PR 開始才真正比對。以上**都不是** GitHub Actions 執行結果。

## 9. 分支保護與人工審核準備（Phase 8–9）

- `docs/exam-system/governance/BRANCH_PROTECTION_PROPOSAL.md`：必要檢查 `gates`、PR 審核、CODEOWNERS、禁止 force-push 與刪除、最小權限、帳本與清單的審核要點、不自動發布。**只是提案，沒有套用到 GitHub**。
- `docs/exam-system/governance/CODEOWNERS.proposed`：提案，沒有放到 `.github/`。
- `docs/exam-system/governance/CCARF_P1_HUMAN_REVIEW.md`：
  - 31 題優先 1 的順序：B35、B42、B46、B48、C72、D97、D100，再來是其餘 6 題只依 Exam Guide 的題目，最後是 18 題官方文件題；
  - 審核清單、官方來源查證、答案歧義、revision／hash 核對；
  - 人工決定欄位（全部空白）、合規檢查清單、非官方練習聲明草稿。
- `tests/trials-review-readiness.test.ts` 確認：
  - 清單正好是佇列的 31 題；
  - revision、hash、hash 版本和題庫與評量清單一致；
  - 決定欄位空白；
  - 不含題幹或選項文字。

AI 預審不是人工核准；本輪沒有宣稱任何合規結論。

## 10. 測試證據（Phase 10–11，本機）

| 檢查 | 結果 |
|---|---|
| TypeScript | 0 錯誤 |
| ESLint | 0 錯誤、0 警告 |
| Trials 測試 | 36 個檔案，474/474 |
| 完整 Vitest | 79 個檔案，2058/2058，0 略過（含 Java、C++、Python 範例） |
| Production build（旗標開啟） | 成功 |
| Release preflight（data＋build＋probe） | 18/18 |
| 外洩掃描 | 834 個檔案、709 個關鍵字，0 命中 |
| 預先產生的路由 | 111 個（/trials 下 11 個） |
| 執行期路由探測 | 38 條 |
| Assessment integrity | `--base` 比對 `3d64399`：429 筆全部符合；429 筆 Base 紀錄都保留 |
| Paper version integrity | `--base-papers`：3 個版本，無問題 |
| Ledger replay | `--base`：0 筆，一致 |
| Volatility（CCAR-F） | ok |
| CCAR-F 品質門檻（10,000 seeds，strict） | 全部成功、10,000 份不重複；0 違規、0 fallback；從未抽到 0 題、每卷都有 0 題；p50 0.178、p95 0.64、p99 0.984、max 5.105 ms |
| iPAS 品質門檻（1,000 seeds） | 通過；s1 p99 0.441 ms、s2 p99 0.661 ms |
| Playwright（真實 build） | 14 通過：trials 10、遷移 4；38 依設計略過（旗標關閉與 fixture） |
| Playwright（fixture build，桌面＋iPhone 13） | 36/36：iPAS 12、CCAR-F 12、APCS 撤回 6、試卷政策 6 |
| 撤回題 id 是否出現在 fixture 頁面 | `orig-apcs-read-03`、`moex-114-pukao-3448-q05` 在相關頁面都是 0 命中 |

Phase 10 的 13 項安全測試分布在下列檔案：

| # | 項目 | 測試檔 |
|---|---|---|
| 1 | 歷史作答不可變 | `trials-attempt-history` |
| 2 | 錯題 revision 身份 | `trials-historical-regression`、`trials-history-dom` |
| 3 | 遷移 idempotency | `trials-attempt-history` |
| 4 | 損毀隔離 | `trials-attempt-history`、`trials-store` |
| 5 | 撤回題歷史 | `trials-history-dom`、`trials-retirement-dom` |
| 6 | 退場試卷歷史 | `trials-history-dom`、`trials-paper-policy`、E2E |
| 7 | 改編卷標示 | 同上 |
| 8 | 跨考試隔離 | `trials-historical-regression`、`trials-history-dom` |
| 9 | Hash 不符拒絕 | `trials-historical-regression` |
| 10 | 未發布答案不外洩 | `trials-historical-regression`、`trials-review-readiness`、preflight |
| 11 | CI Base 解析 | `trials-ci-base` |
| 12 | 缺 Base fail closed | `trials-ci-base` |
| 13 | 帳本／清單相容 | `trials-historical-regression`、integrity／ledger CLI |

隔離方式：

- 驗證在 `git archive` 的暫存副本中執行，`node_modules` 用 `cp -cR` 複製；
- 伺服器只開在 127.0.0.1 的 3123、3124；
- 結束後副本已刪除，port 已釋放。

## 11. 剩餘風險

1. **localStorage 由使用者控制。** 本輪的完整性規則防的是程式錯誤與資料損毀，不防使用者自行竄改；紀錄沒有簽章。
2. **讀不出的整份資料只有一格備份。** `logic-island.trials.backup` 只存第一次的內容，之後再發生時不會覆蓋，第二次的原文會遺失。這是 T.0 的既有行為，本輪沒有改。
3. **每份試卷只保留最近 10 次已結束的作答。** 這是既有上限；錯題本 attempt 仍保有內容身份。
4. **force-push 的舊 tip 要能用 SHA 抓取。** 抓不到時 CI 會失敗（設計如此）。私有 repository 可能需要調整做法。
5. **第一次 push `trials/mvp` 沒有可比對的舊紀錄。** merge-base 上沒有這三份檔案。
6. **GitHub CI 從未執行。** 分支保護與 CODEOWNERS 沒有套用；第三方 Action 沒有固定到 SHA。
7. **人工審核尚未開始，合規尚未確認。** 目前只有一位維護者，不能自己核准自己的 PR。
8. **跨兩個考試的原創題在錯題本重練時不記錄考試。** 舊紀錄沒有考試資訊時，也不做跨考試比對。
9. **沒有在真機與真實螢幕閱讀器上測試。**

## 12. T.3I 建議

1. 依 `CCARF_P1_HUMAN_REVIEW.md` 開始第一輪人工審核，產生第一批有序號的真實核准。
2. Push 一次讓 GitHub CI 實際執行，確認 `trials:ci-base` 的判斷；再依提案設定分支保護與必要檢查。
3. 人工決定 MOEX 原卷政策，以及改編卷的總分、及格線與文字。
4. 小規模真實發布，演練撤回、重新核准、重新發布。
5. 評估帳本事件簽章；讀不出的資料改為多格備份。
6. 第三方 Action 固定到 SHA。
