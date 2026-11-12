# 分支保護與審核治理提案（T.3H Phase 8）

> 狀態：**提案，尚未套用**。本文件只提出設定建議，沒有修改任何 GitHub 遠端設定，也沒有建立 `.github/CODEOWNERS`。套用需要儲存庫擁有者在 GitHub 設定頁（或以擁有者身分呼叫 API）親自操作。

## 1. 目的

試煉題庫的發布安全靠三件事：帳本只能附加、已發布內容的 Hash 不變、CI 用可信的 Base 比對這兩件事。T.3H 把 CI 的 Base 改為「無法確認就失敗」（`docs/exam-system/32` §8）；分支保護則確保：

- 這些檢查一定要跑，失敗就不能合併；
- 改動帳本、清單、固定卷的 PR 一定經過人工審核；
- 歷史不能被強制改寫；
- 沒有任何自動流程能核准或發布題目。

## 2. 必要狀態檢查（Required status checks）

| 檢查 | 來源 | 說明 |
|---|---|---|
| `gates` | `.github/workflows/trials-ci.yml` 的 job | 包含 Base 解析（T.3I 起含 bootstrap 判斷）、型別、ESLint、測試、完整性、帳本重放、品質門檻、建置與預檢 |

- 勾選「Require branches to be up to date before merging」。PR 的 merge commit 以最新的 base 比對，帳本的附加順序才可信。
- 第一次 push 前 `gates` 還沒有出現過，GitHub 無法把它選為必要檢查。要先 push 一次讓它跑過，再設定。

## 3. 建議規則（Repository rulesets）

### 3.1 `main`

```json
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [{ "context": "gates" }] } }
  ],
  "bypass_actors": []
}
```

### 3.2 `trials/**`

- 禁止刪除，禁止 force-push（`deletion`、`non_fast_forward`）。
- 不要求 PR，日常開發照常 push。
- 如果真的需要改寫歷史，先暫停規則、改寫，再恢復；並在 PR 說明原因。CI 會拿改寫前的 tip 比對（`force-push-before`），帳本或清單少了紀錄就失敗。

### 3.3 單人維護的限制

目前只有一位維護者。`require_code_owner_review` 加上 `required_approving_review_count: 1` 的效果是：作者不能自己核准自己的 PR。可行的選項：

1. 加入第二位審核人。建議做法，也是「人工審核」的實質意義。
2. 暫時設 `required_approving_review_count: 0`，保留 CODEOWNERS 的審核請求與必要檢查，並在 PR 範本記錄自我審查。
3. 由擁有者使用 bypass。不建議：bypass 會繞過一切規則。

選哪一個是**人工決策（Pending）**。

## 4. CODEOWNERS

建議內容在 `docs/exam-system/governance/CODEOWNERS.proposed`，涵蓋：

- 帳本、已發布 Hash、評量清單、固定卷版本、`papers.ts`、`generated/`、`batches/`；
- `src/lib/trials/`、`schema.ts`、`scripts/trials/`；
- `.github/` 與本治理資料夾。

人工確認後再複製到 `.github/CODEOWNERS`。

## 5. 帳本與清單變更的審核要求

改動下列檔案的 PR，審核人要逐項確認：

| 檔案 | 審核要點 |
|---|---|
| `ledger.json` | 只有附加；新紀錄有 `seq` 與 `eventId`；發布紀錄指向一筆真人核准（`reviewers` 不是 synthetic）；撤回紀錄指向被撤回的發布；CI 的 `trials-ledger.json` 為 ok |
| `published-hashes.json` | 只因發布或撤回而變；既有 57 筆不變 |
| `assessment-manifest.json` | 只有附加；`trials-integrity.json` 為 ok，並列出 `--base` 比對結果 |
| `paper-versions.json` | 只有附加；新版本對應一次人工修改的 `papers.ts`；官方原卷不得以同一 id 缺題改版 |
| `papers.ts` | 改編練習卷有自己的 id、`adaptedFrom`、標題不含「原卷」；退場有日期與原因 |

審核時一併檢查 CI artifact `trials-ci-base.json`：它記錄這次比對用的 Base 與判斷方式（strategy）。

## 6. Workflow 權限（最小權限）

| 項目 | 建議 | 目前狀態 |
|---|---|---|
| `permissions` | `contents: read` | 已是 |
| `actions/checkout` | `persist-credentials: false` | T.3H 已加 |
| `pull_request_target` | 不使用 | 未使用；Base 解析遇到這類事件也會失敗 |
| 預設 `GITHUB_TOKEN` 權限（儲存庫設定） | Read repository contents | 待人工在 Settings → Actions 確認 |
| 「Allow GitHub Actions to create and approve pull requests」 | 關閉 | 待人工確認 |
| 第三方 Action 版本 | 固定到 commit SHA | T.3I 已固定，來源與查證方式見 `ACTION_PINS.md`；Action 原始碼未逐行審查 |
| Artifact 保存 | 14 天，只含 id、hash、計數與日期 | T.3H 已設 `retention-days: 14` |

## 7. 不自動發布

- 沒有任何 workflow 寫入帳本、核准或發布題目，CI 只讀。
- 發布只能在本機執行 `scripts/trials/publish.ts`，前提是帳本裡有真人核准，再經 PR 審核合併。
- 不設定以排程或機器人觸發的發布；不啟用 auto-merge 處理帳本 PR。
- AI 審查結果（queue 的 `aiReview`）只是排序建議，不是核准。

## 8. 待人工決策（Pending）

- [ ] 審核人數與單人維護時的做法（§3.3）
- [ ] 是否把 `CODEOWNERS.proposed` 啟用為 `.github/CODEOWNERS`
- [x] 第三方 Action 的固定 SHA（T.3I，`ACTION_PINS.md`；更新時須人工查證）
- [ ] 首次推送前，擁有者確認 `ci-bootstrap.json` 宣告的基準（T.3I，`docs/exam-system/33` §3）
- [ ] 第一次 push 讓 `gates` 出現後，再把它設為必要檢查
