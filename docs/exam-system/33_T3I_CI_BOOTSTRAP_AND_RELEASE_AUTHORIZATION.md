# T.3I CI Bootstrap 與發布授權準備

> 範圍：遠端 CI 啟用前的最後一輪工程準備。這輪沒有 push、merge、deploy 或 publish，沒有建立人工核准，沒有改動帳本、已發布 Hash、評量清單或固定卷版本，也沒有修改任何 GitHub 遠端設定。所有核准與發布演練都只用明確標示 SYNTHETIC 的記憶體內資料。**GitHub CI 仍然從未在遠端執行過。**

## 1. Baseline

| 項目 | 值 |
|---|---|
| Branch／起點 HEAD | `trials/mvp`／`1c0f7e1`（符合預期） |
| 工作樹 | 只有 Theme Session 的 5 個檔案與 `.claude/`（diff checksum `f612b09…`，結束時相同） |
| 其他 worktree | `logic-island-m3-ring`（`m3/mobile-marker-occlusion-fix`），本輪沒有碰 |
| 評量清單 | 429 筆 revision |
| 已發布 Hash | 57 筆（53 題可作答） |
| 帳本 | 0 筆審核、0 筆發布、0 筆撤回 |
| 固定卷版本 | 3 個（APCS、MOEX、Bank IT） |
| CCAR-F／iPAS | 150／200 題，全部 `in-review` |

## 2. CI bootstrap 的信任邊界

### 2.1 第一次 push `trials/mvp` 時

| 問題 | 答案 |
|---|---|
| 可信的比較基準 | `origin/main` 與分支的 merge-base：`f45c867` |
| 該 commit 已有的發布檔案 | 沒有。四個發布檔案都不存在 |
| 之後才建立的檔案 | `published-hashes.json`、`papers.ts`（2026-11-03）、`ledger.json`（11-04）、`assessment-manifest.json`、`paper-versions.json`（11-09），以及 workflow 本身（11-05） |
| 從 `f45c867` 到 `1c0f7e1` | 152 個 commit（T.3I 再加 5 個），從未 push 過 |

### 2.2 四類驗證

| 類別 | 第一次 push 能做什麼 | 說明 |
|---|---|---|
| 1. 現況驗證 | **能** | 題庫、帳本重放、Hash、清單、固定卷、曝光、跨考試隔離：這些只看 HEAD 本身 |
| 2. 歷史 append-only 驗證 | **不能證明** | base 沒有任何發布檔案可比對。本機歷史可以重放，但只能說明「推上去的歷史本身前後一致」，無法證明推送前沒有被改寫 |
| 3. 建立 bootstrap 基準 | **能，但要明確宣告** | 由 `ci-bootstrap.json` 指定唯一允許的那一次執行，並逐 byte 固定發布檔案 |
| 4. 之後的變更偵測 | **從第二次 push 或第一個 PR 開始** | 每次 push 都和前一個 tip 比對；bootstrap 那個 commit 就是第一個可信基準 |

**第一次 CI 成功，不代表所有歷史紀錄都已經驗證。**

### 2.3 無法驗證的歷史性質

這些也寫在 `trials:ci-bootstrap` 報告的 `unverifiable` 欄位：

1. 第一次 push 之前的歷史可能被改寫過。commit 的日期與作者都沒有簽章。
2. 57 筆已發布 Hash 比帳本更早存在，沒有核准紀錄或審核人，帳本無法重放它們。
3. 已發布的題目是否真的經過人工審核：題庫和 Hash 只說明發布了什麼，不說明誰核准。
4. 宣告的基準是否正確：它可信是因為擁有者審閱了加入它的 commit，不是 CI 證明的。
5. 評量清單最早的幾筆，是 T.3F 時依當時的題庫補登，不是在題目寫成的當下登記。

## 3. Bootstrap 資格

### 3.1 T.3H 留下的缺口

在 T.3H，base 只要缺少某個發布檔案，CI 就「不比對、直接跑」。這對**任何**事件、**任何**分支都成立，而且不會出錯。

T.3I 改成：

- base 必須持有全部三個比對檔案（`mode=compare`）。
- base 只持有其中一部分：失敗。
- base 一個都沒有：只有宣告的那一次執行可以算 bootstrap（`mode=bootstrap`）；其他情況都失敗。

### 3.2 允許 bootstrap 的條件（缺一不可，見 `src/lib/trials/ci-bootstrap.ts`）

1. 已經由 `resolveBase` 解出可信的 base。缺 base、shallow clone、不相干的歷史**永遠不會**變成 bootstrap。
2. HEAD 裡的 `docs/exam-system/governance/ci-bootstrap.json` 格式正確。
3. 事件是宣告的那一次：
   - 宣告的 repository 裡，宣告分支的第一次 push（`before` 為 000…，`created`）；或
   - 從該分支發到預設分支的 PR。
   - 手動觸發、其他分支、fork 都不行。
4. 解出的 base 就是宣告的 `base`（`f45c867`），而且不含任何發布檔案。
5. 宣告的 `anchor`（`1c0f7e1`）在 HEAD 的歷史裡，而且 anchor 的發布檔案和宣告的 sha256 相同。
6. HEAD 的發布檔案和宣告的 sha256 相同。只要改動任何一個，就必須重新宣告，並經過審閱。

### 3.3 怎麼執行

- `pnpm trials:ci-base` 判斷 `mode`，並寫入 workflow 的輸出。
- 只有 `mode=bootstrap` 時才執行 `pnpm trials:ci-bootstrap`。這個步驟會**自己重新判斷資格**，不符就在任何檢查之前拒絕。所以它不可能被拿來繞過失敗或缺少的 base。
- `trials:ci-bootstrap` 檢查的項目：
  - 磁碟上的發布檔案就是 HEAD 的版本。
  - 題庫驗證、帳本、帳本重放、revision／hash、評量清單、固定卷版本、已發布 Hash 回歸、未發布曝光、跨考試隔離。
  - 本機歷史重放（只能說明一致，不能證明）。
- 報告是 machine-readable JSON，格式 `logic-island.trials-ci-bootstrap/1`，欄位有：
  - `verified`
  - `unverifiable`
  - `baseline`：`sha`、`base`、`anchor`、各檔案的 digest
  - `trustAssumptions`
  - `futureComparison`

### 3.4 本機模擬（不是 GitHub 執行）

用第一次 push 的事件 payload 在 HEAD `aa8d8df` 模擬：

- `ci-base` 回報 `mode=bootstrap`，base `f45c867`。
- `ci-bootstrap` 的 11 項檢查全部通過。
- 本機歷史：清單、固定卷版本、帳本各 1 個版本，已發布 Hash 3 個版本，沒有任何中斷。

### 3.5 待人工確認

第一次 push 之前，擁有者要審閱 `ci-bootstrap.json`：base、anchor、四個 digest。這份宣告**不是**任何題目的核准。

## 4. GitHub Actions 固定到 SHA

| Action | 原本 | 固定的版本 | SHA |
|---|---|---|---|
| `actions/checkout` | `@v4` | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` |
| `pnpm/action-setup` | `@v4` | v4.3.0 | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `actions/setup-node` | `@v4` | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/setup-java` | `@v4` | v4.9.1 | `cf277c60eb25467037889841efdb72551f06f6c3` |
| `actions/upload-artifact` | `@v4` | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

- **SHA 的來源**：2026-11-10 用 `git ls-remote` 讀取 tag（annotated tag 取 peeled 值），再用 GitHub REST API 交叉核對，兩邊完全一致。
- **選版原則**：固定到當天 `@v4` 指向的同一個 commit，所以行為與 T.3H 相同；沒有升級，也沒有猜。
- **權限**：
  - 只有 `contents: read`。
  - 沒有 write scope、secrets、`GITHUB_TOKEN` 傳遞、`pull_request_target`、`workflow_run`。
  - checkout 不保留憑證。
  - 事件資料只透過 `env` 進入 shell。
- **Artifact**：
  - 只上傳 JSON 報告，保存 14 天。
  - `tests/trials-ci-artifacts.test.ts` 會實際執行各個 CLI，再用未發布題目的題幹、選項與解析片段掃描報告。
  - 這個掃描發現 `trials-volatility-ccarf.json` 的 `reason` 欄位帶有 5 題未發布題目選項裡也出現的技術名詞（例如 `allowed-tools`）。它不是答案，但會透露題目在考什麼，所以 T.3I 起**未發布題目的 `reason` 不寫進 JSON**。register 與題庫仍保留原文。
- **防止回退**：`tests/trials-ci-workflow.test.ts` 會拒絕：
  - 浮動 tag、短 SHA、與 `ACTION_PINS.md` 不符的 SHA；
  - 任何 write 權限；
  - 可選用、可以不帶的 base 副本。

## 5. CI 事件矩陣（本機 Git fixture，不等於 GitHub）

`tests/trials-ci-event-matrix.test.ts`、`trials-ci-bootstrap.test.ts`、`trials-ci-base.test.ts`：

| 事件 | 結果 |
|---|---|
| 宣告分支的第一次 push | bootstrap（base 為宣告的 base） |
| 第一次 push，之後又多了 commit、發布檔案沒變 | bootstrap |
| 同一段歷史上其他分支的第一次 push | 失敗（event） |
| 一般 push | compare（前一個 tip） |
| 從宣告分支發 PR，main 還沒有發布檔案 | bootstrap |
| 合併宣告的 PR 後 main 的 push（merge commit 或 fast-forward；前一個 tip 正是宣告的 base；R5 2026-11-12 補上） | bootstrap |
| 上述之後 main 的下一次 push | compare（前一個 tip，已有發布檔案） |
| force-push 到 main、前一個 tip 不是宣告的 base、其他 repository、發布檔案已改動 | 失敗 |
| main 已有發布檔案後的 PR（merge-base） | compare |
| 其他分支發 PR 到沒有發布檔案的 main | 失敗 |
| force-push | compare（前一個 tip） |
| force-push 但前一個 tip 抓不到 | 失敗 |
| shallow clone | 失敗（不論事件） |
| 缺少 base | 失敗 |
| 不相干的歷史 | 失敗 |
| base 被刪（遠端預設分支不存在） | 失敗 |
| 分支刪除後重建，且發布檔案已改動 | 失敗（head-files） |
| 手動觸發，merge-base 沒有發布檔案 | 失敗；main 有發布檔案時才 compare |
| payload 不是 JSON 物件（壞掉的 JSON、陣列、null） | 失敗，並寫出 JSON 診斷報告 |
| `pull_request_target`、`schedule` | 失敗 |
| 惡意或不一致的 SHA | 失敗 |
| base 持有部分發布檔案 | 失敗 |
| 判斷過程 | 不寫入任何檔案：專案的發布檔案 digest 前後相同 |

「惡意或不一致的 SHA」包括：`after` 不是 checkout 的 commit、大寫、短 SHA、`HEAD~1`、含換行、別的 repository、謊報預設分支。

## 6. 損毀作答資料的復原（盤點）

| 項目 | T.3H | T.3I |
|---|---|---|
| `logic-island.trials` | 主資料 | 不變 |
| `logic-island.trials.backup` | 整份無法解析時的**唯一**備份，只在空白時寫入 | 只讀，不再寫入，視為一筆舊備份 |
| `logic-island.trials.v1-backup` | 第一版原文，寫一次 | 不變；若已有**其他**第一版原文，新的另存一份 |
| store 內的 `quarantine` | 單筆紀錄原樣保存 | 加上穩定 id，同一筆只留一次 |
| 第二次不同的整份損毀 | **主資料被覆寫、原文遺失** | 另存一份，第一份不變 |
| 讀取時發生例外 | 當成沒有資料，下次寫入會覆寫 | 不寫入，改在記憶體中繼續，並標示原因 |
| 配額不足 | 備份失敗時不寫入主資料 | 相同，另外提供具體狀態 |

## 7. Append-only 隔離區

`src/lib/trials/quarantine.ts`：

- **存放方式**：每份無法讀取的整份文字存成 `logic-island.trials.quarantine.<digest>`，內容是 `{format, id, reason, detectedAt, length, raw}`。`raw` 逐字保存。
- **同一份文字**：同一個 key，再存一次不做任何事（冪等）。
- **既有項目**：永遠不改寫。名稱相同但內容不同（digest 碰撞）時拒絕。
- **寫入順序**：寫完後讀回比對，確認相同，才允許覆寫主資料。
- **上限 8 份**：滿了就不再保存、不刪除任何東西、不覆寫主資料。
- **失敗時**：
  - 原因分為 `quota`、`denied`、`full`、`collision`、`unverified`、`unreadable-storage`。
  - 頁面繼續在記憶體中運作，`recovery.blocked` 說明原因。
  - 作答頁顯示可以理解的訊息，絕不宣稱已經保存。
- **復原**：
  - `quarantineEntries` 只列出保存的資料，不會把它放回 store。
  - 錯題本只顯示「有 N 筆無法讀取的資料原樣保留」，不顯示內容。
- **隱私**：保存的資料可能含作答內容，所以不寫 console、不送出、不進 CI artifact。

## 8. 遷移相容性

`tests/trials-quarantine.test.tsx`（18 項）：

1. 第一份損毀被保存。
2. 第二份不同的損毀和第一份並存，第一份不變。
3. 同一份損毀重複出現不會多存。
4. 第一版資料裡有壞紀錄：壞紀錄放進隔離區，第一版原文逐字備份。
5. 部分寫入（備份成功、主資料失敗）：原文還在，重試時不會多存一份。
6. 配額不足：主資料不變，狀態為 `quota`。
7. 無法讀取 storage：完全不寫入。
8. 拒絕寫入：狀態為 `denied`。
9. 隔離區已滿：不刪除、不覆寫。
10. 列出保存的資料不會改動 storage。
11. 有效作答在寫入前、寫入後、被阻擋時都能讀到。
12. 舊的 backup 與 v1-backup 欄位不被改動。
13. T.3H 的第二版資料（隔離區沒有 id）照常讀取，並補上 id。
14. 遷移與 id 是冪等的。
15. 歷史分數不變。
16. 不輸出任何 log。
17. digest 碰撞時拒絕。
18. 錯題本只顯示筆數。

瀏覽器端：`e2e/trials-history.spec.ts` 新增一項，兩種不同的損毀各保存一份，同一種再出現不多存，錯題本顯示筆數。

## 9. 人工審核流程

- **流程文件**：`docs/exam-system/governance/HUMAN_REVIEW_WORKFLOW.md`，涵蓋 10 個步驟：
  1. 取得完整題目（私人資料夾）
  2. 查核官方文件
  3. 記錄決定（`decisions.json`，先 dry run 再 `--confirm N`）
  4. 確認 revision／hash
  5. 修訂題目（新 revision → 附加清單 → 重審）
  6. 避免使用過期的核准
  7. 發布前 dry run
  8. 撤回
  9. 確認 audit trail
  10. 確認考試內容的使用條款
- **邊界**：
  - 帳本仍是 0 筆紀錄。
  - 決定欄位全部空白（`tests/trials-review-readiness.test.ts`）。
  - 審核人不能是 synthetic、fixture、AI 或 bot。

## 10. 發布授權關卡

- **清單**：`docs/exam-system/governance/RELEASE_AUTHORIZATION_CHECKLIST.md`。
- **工具**：`src/lib/trials/release-gate.ts`、`pnpm trials:release-gate`。
- **11 道關卡分三類**，每道只接受自己類型的證據：
  - **Remote**：Remote CI passed、Protected branch configured。
  - **Human**：Human review completed、Compliance review completed、Explicit release authorization received。
  - **Engineering**：Exact revision/hash approved、No unresolved P1 blockers、Leak scan、Ledger integrity、Paper-version integrity、Rollback tested。
- **狀態**：`engineering-verified`、`human-verified`、`remote-verified`、`not-verified`、`blocked`。
  - Engineering verified ≠ Human approved。
  - 本機沒有任何方式記錄遠端 CI、合規或授權，所以 CLI 在本機**永遠不會**回報「可發布」。
  - 只要有 SYNTHETIC 證據，`releasable` 一律為 false；`wouldRelease` 只用來展示演練結果。
- **目前的結果**（`ccarf-b-35@1,ccarf-a-01@1`）：
  - Ledger 與 Paper-version：Engineering verified。
  - Human review、Exact hash、P1：blocked（B35 目前是第 2 版，而且沒有核准）。
  - 其餘：Not verified。
- **撤回演練**：在 SYNTHETIC 的記憶體世界裡：發布 → 撤回 → 用舊核准重新發布被拒 → 新核准 → 重新發布。

## 11. 跨認證回歸

`tests/trials-cross-certification.test.ts`：

- **CCAR-F**：150 題全部 in-review、都不能作答；一份藍圖抽 60 題，官方規格 120 分鐘、練習 150 分鐘；有單選與複選。
- **iPAS**：200 題全部 in-review；L11 與 L12 各一份藍圖、各 50 題，兩種模式。
- **固定卷**：
  - 三份都已登記版本、都是 open、都只用已發布的題目。
  - MOEX 是官方原卷，另外兩份是練習卷；沒有改編卷或已退場的試卷。
  - 57 筆 Hash 就是可作答題目的內容。
- **作答紀錄**：每份固定卷作答一次後：記下考試、只評分一次、不會重新評分、錯題本的身分判斷為 current。
- **瀏覽器**：Playwright fixture build（§12）。

## 12. 安全驗證

| 檢查 | 結果 |
|---|---|
| TypeScript／ESLint | 0 錯誤／0 錯誤 0 警告（隔離副本） |
| Trials 測試 | 43 個檔案，563 項通過 |
| 完整 Vitest | 86 個檔案，2147 項：第一次 2146 通過、1 失敗（`git archive` 副本沒有 `.git`，`trials:release-gate` 讀 HEAD 時當掉；分類為 Environment，但 CLI 不該當掉，已修正為 fail closed），修正後該檔重跑 8/8 |
| Production build（旗標開啟） | 成功 |
| Release preflight（資料、bundle、路由、probe） | 18/18；834 個檔案、709 個關鍵字 0 命中；111 個預先產生的路由（/trials 11 個）；實際請求 38 個路由 |
| CI bootstrap（模擬第一次 push） | 通過；11 項檢查；5 項無法驗證 |
| 評量清單完整性（`--base 1c0f7e1`） | 429/429 保留 |
| 固定卷版本（`--base-papers`） | 3 個版本，通過 |
| 帳本重放（`--base`） | 0 筆，一致 |
| CCAR-F 品質門檻（10,000 seeds，strict） | 10,000/10,000 成功；10,000 份皆不同；0 違規；0 fallback；沒有從未抽中或每次都抽中的題目；p99 1.718 ms |
| iPAS 品質門檻（1,000 seeds） | s1 p99 0.874 ms、s2 p99 1.035 ms；0 違規 |
| Playwright 桌面／iPhone 13 | 真實 build：16 通過（trials 10、歷史與隔離 6），38 依設計略過；fixture build：36/36（iPAS 12、CCAR-F 12、APCS 撤回 6、試卷政策 6）；撤回題 id 在相關頁面 0 命中 |

新增的安全測試：

- Bootstrap 資格與拒絕被繞過。
- 回報無法驗證的歷史性質。
- 拒絕浮動的 Action 版本。
- 權限回退。
- 隔離區只能附加。
- 配額不足。
- 遷移相容性。
- 歷史成績不可變。
- 人工核准的邊界。
- 發布關卡 fail closed。
- Artifact 不含未發布的題目內容。

## 13. 剩餘風險

- **CI 與遠端設定**：GitHub CI 仍未執行；分支保護未套用；`ci-bootstrap.json` 待擁有者確認。
- **Action 的信任**：只固定了 SHA，Action 的原始碼沒有審查；工具下載仍依賴 Action 的預設唯讀 token。
- **force-push**：抓不到前一個 tip 時會 fail closed，私有 repository 可能需要調整。
- **bootstrap 之前的歷史**：只能證明一致，不能證明沒有被改寫；commit 沒有簽章。
- **瀏覽器端資料**：
  - 本機作答紀錄沒有簽章，使用者可以修改。
  - 隔離區上限 8 份，滿了之後新的損毀只會留在主 key，這次造訪的作答不會保存。
  - digest 是 64 位元名稱，不是安全雜湊；碰撞時會拒絕，不會覆寫。
- **人工與合規**：人工審核未開始，合規未確認，帳本仍是 0 筆。
- **其他**：沒有真機或螢幕閱讀器測試。只有一位維護者時，CODEOWNERS 審核要另外決定做法。

## 14. T.3J 建議

1. 擁有者審閱 `ci-bootstrap.json` 後，push `trials/mvp`，讓 CI 第一次在 GitHub 執行（bootstrap）；再 push 一次，確認 `mode=compare`。
2. 依 `BRANCH_PROTECTION_PROPOSAL.md` 套用分支保護，把 `gates` 設為必要檢查，並決定單人維護時怎麼處理。
3. 依 `HUMAN_REVIEW_WORKFLOW.md`，從 B35 開始第一輪人工審核。
4. 做一次小規模的真實發布演練：1–3 題，完整走過 release-gate 的 11 道關卡；接著撤回、重新核准、重新發布。
5. 決定 MOEX 原卷與改編卷的政策；評估帳本事件簽章；是否用 Dependabot 提醒 Action 更新。

## R5 補充（2026-11-12）：合併到 main 的那一次 push

- **問題**：宣告只涵蓋「`trials/mvp` 第一次 push」與「從它到 `main` 的 PR」。PR 合併時 GitHub 會送出 `main` 的 push，前一個 tip 是宣告的 base `f45c867`（沒有發布檔案），事件又不在宣告中，`ci-base` 依設計 fail closed：`main` 第一次 CI 必定紅燈。
- **修正**（`src/lib/trials/ci-bootstrap.ts` `bootstrapEligibility`）：事件多一種「landing」：`push` 到 `refs/heads/<defaultBranch>`、非 force、`before` **等於**宣告的 base、`ci-base` 策略為 `push-before`。其餘條件不變：解析出的 base 必須是宣告的 base 且沒有任何發布檔案、anchor 在 head 的歷史中、anchor 與 head 的發布檔案與宣告逐位元組相同；bootstrap 模式照樣執行 `trials:ci-bootstrap` 的題庫驗證、資料檢查與歷史重播，之後的 integrity、ledger、quality、build、preflight 都照跑。
- **為何不會讓之後的 push 繞過**：合併後 `main` 有發布檔案，之後每次 push 的 base 都持有全部發布檔案 → compare；`before` 必須正好是 `f45c867`，force-push 不算；發布檔案只要跟宣告不同就失敗（head-files）。
- **回歸測試**：`tests/trials-ci-event-matrix.test.ts` 新增 8 列（merge commit 與 fast-forward 兩種 landing 為 bootstrap；下一次 push 為 compare；force-push、非 main、其他 repository、前一個 tip 不是宣告的 base、發布檔案已改動皆失敗）。拿掉修正時兩列 landing 失敗，其餘不變。
