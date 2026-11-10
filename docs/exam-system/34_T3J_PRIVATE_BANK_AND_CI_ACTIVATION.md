# 34 T.3J：私人題庫隔離與 GitHub CI 啟動

`vince115/logic-island` 是公開 repository。T.3J 之前，本機 `trials/mvp` 的 157 個未推送 commit 帶有 350 題未發布題目（CCAR-F 150、iPAS 200）的題文、選項、答案與解析，以及審核佇列與批次審查文件。本階段把這些資料移到私人 repository，公開分支只保留已發布題目，再啟動 GitHub CI。

## 1. 公開與私人的分界

| 位置 | 內容 |
|---|---|
| 公開（本 repository） | 已發布題目（`src/content/trials/generated/` 只有 `2026-11-03-moex-114-pukao-computer.json`、`2026-11-03-mvp-originals.json`，53 題）、`published-hashes.json`、`ledger.json`、`paper-versions.json`、只含這 53 題的 `assessment-manifest.json`、程式、測試與治理文件 |
| 私人（`vince115/logic-island-question-bank`） | 未發布題目的 `generated/`、`batches/`；`data/` 下的兩份審核佇列與 CCAR-F 易變題登記；這些題目的 manifest 條目（`assessment-manifest.json`）；逐題審查文件（原 docs 13–18、21、26–29 與 `governance/CCARF_P1_HUMAN_REVIEW.md`）；以未發布題目為測試對象的 21 個測試檔與其雜湊 fixture |

為什麼 manifest 條目也是私人的：條目對每個部分各算一個雜湊，`answer` 部分的可能值只有少數幾種（單選題只有 A～D），對照程式中公開的雜湊算法就能還原答案。只含內容雜湊（8 hex，涵蓋整題）的資料不能還原答案，但仍一起留在私人端，公開端不提任何未發布題目的內容摘要。

題目 ID、版本與審核狀態都沒有改：私人 repository 的檔案與 T.3I 最後一個 commit `0b01365` 的內容逐位元組相同（manifest 只是拆成兩份，條目內容不變）。

## 2. 載入方式

- `src/content/trials/private-bank.ts`：私人題庫預設在 `private/question-bank`（`.gitignore` 的 `/private/`），或由 `LOGIC_ISLAND_PRIVATE_BANK` 指定。只在 Node／伺服器端以 `fs` 讀取，不會被打包進前端。設 `LOGIC_ISLAND_REQUIRE_PRIVATE_BANK=1` 時，找不到題庫就直接失敗。
- `generated/index.ts`：公開批次是靜態 import，私人批次在有題庫時加入，再依批次 ID 排序，所以題目順序和以前完全一樣（抽題指紋不變）。
- 匯入器：私人題庫 `batches/` 下的批次會寫進私人題庫的 `generated/`，公開的 `generated/index.ts` 只列公開批次。
- CLI 一起讀兩份 manifest（`scripts/trials/ledger-io.ts` 的 `readManifest`），`--append` 依題目所在位置分寫回兩份檔案。沒有私人題庫時，若要寫入未發布題目的條目，CLI 會拒絕。
- 審核佇列（`REVIEW_QUEUES`）與易變題登記（`VOLATILITY_REGISTERS`）的路徑都相對於私人題庫。題庫中沒有某考試的題目時，不要求那份登記；有題目卻沒有登記時，照樣失敗。
- 衝突題組（`conflictPairs`）在沒有私人題庫時，只保留兩題都在題庫中的組合。

取得私人題庫：

```bash
git clone https://github.com/vince115/logic-island-question-bank.git private/question-bank
```

## 3. 測試的兩種模式

| 模式 | 內容 |
|---|---|
| 公開（CI、沒有 `private/`） | `tests/` 全部；以未發布題目為對象的測試標為 skip，並由 `tests/trials-public-bank.test.ts` 檢查公開題庫只有已發布題目、每個已發布雜湊都對得到公開題目、公開 manifest 只有自己的條目且全部吻合 |
| 私人（有 `private/question-bank`） | 另外執行私人題庫的 `tests/`（`vitest.config.mts` 的 include），包括 lifecycle、帳本順序、release gate 與 preflight 演練、integrity guard、易變題、各批次測試 |

品質關卡（`trials:quality`）在沒有私人題庫、該考試又沒有任何題目時，回報 `passed: null` 與「not run」並以 0 結束；這不代表通過，關卡要在私人模式下執行。

## 4. CI 的變更

- 新增「No private bank in this checkout」步驟：CI 永遠不 checkout 私人題庫，也沒有任何 secret 或 token。
- 明列的 trials 測試改為公開模式能執行的檔案。
- **修正 fork PR bootstrap 漏洞**：`bootstrapEligibility` 現在要求 `pull_request.head.repo.full_name` 等於宣告的 repository。在 `pull_request` 事件中，`repository` 是 base repository，只有 `head.repo` 才能看出 head 來自哪裡；fork 中同名的 `trials/mvp` 不再算是宣告的分支。`tests/trials-ci-bootstrap.test.ts` 與事件矩陣都加了 fork 的案例。
- `ci-bootstrap.json` 重新宣告：base 仍是 `f45c867`，anchor 改為公開快照 commit，四個檔案的 sha256 改為公開版本（manifest 已拆分）。

## 5. Git 歷史

- 原本的 157 個 commit 不推送。本機保留 `trials/mvp`（Theme Session 仍在使用）與 `backup/trials-mvp-0b01365` 兩個指向 `0b01365` 的分支作為備份。
- 公開分支從 `f45c867` 起算：一個公開快照 commit（`0b01365` 的檔案扣除私人資料，再加上 T.3J 的變更），再加一個 bootstrap 宣告 commit。逐 commit 改寫歷史時，每個中間版本都要另外證明乾淨，所以採用單一快照。原本的完整歷史留在本機備份分支。
- 推送前以 `pnpm trials:leak-scan --history origin/main..<分支>` 掃描公開分支可達的每個 blob 與每則 commit 訊息：比對私人題目的題文、選項、解析與選項解析（去除空白後連續 24 字元），以及「私人題目 ID 與答案用語同一行」。這個工具需要私人題庫，只會讀取。
- 本機 `.git/hooks/pre-push`（不進版控）會拒絕推送原始 trials 歷史中的 commit 及其後代，也會拒絕含私人題庫路徑的 commit。
- 遠端分支名稱沿用 `trials/mvp`。本機的 `trials/mvp` 和遠端的歷史沒有共同的新 commit，若誤推會因為不是 fast-forward 而被 GitHub 拒絕；pre-push hook 是第二道防線。

## 6. 未完成與注意事項

1. **發布私人題目的流程還沒定**：題目發布後要從私人題庫搬到公開的 `generated/`（與 manifest 條目一起）。現在的檢查是 fail closed：公開 CI 會要求每個已發布雜湊都對得到公開題目，否則失敗。
2. **私人題庫沒有自己的 CI**：私人模式的測試與品質關卡目前只在本機執行。
3. **Fixture E2E**：`e2e/fixtures/*` 會把審核中的題目改為已發布再建置，所以需要私人題庫。在隔離副本中要另外複製 `private/question-bank`，或設定 `LOGIC_ISLAND_PRIVATE_BANK`。
4. **Theme Session**：Theme 的變更要另外 cherry-pick 到公開分支。它的 commit 不能直接從本機 `trials/mvp` 推送；pre-push hook 會拒絕。
5. 被搬走的 docs 13–18、21、26–29 仍出現在公開文件與佇列的連結中。這些連結在公開端會失效，內容要到私人題庫的 `docs/` 查看。
