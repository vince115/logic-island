# 正式發布授權清單（T.3I Phase 9）

> 每次正式發布題目前，在發布 PR 的說明裡完整複製本清單並逐項填寫。`pnpm trials:release-gate --targets …` 會依同樣的分類判斷每道關卡（`src/lib/trials/release-gate.ts`）。只要有一項不是它應有的狀態，就**不得發布**。

## 1. 狀態分類

| 狀態 | 意義 | 由誰給 |
|---|---|---|
| Engineering verified | 本機程式已檢查通過（題庫、帳本、Hash、清單、試卷版本、洩漏掃描、演練） | `trials:release-gate`、`trials:preflight` 等指令 |
| Human verified | 授權的人已親自完成並留下紀錄（帳本的核准、合規紀錄、發布授權） | 審核人／擁有者 |
| Remote verified | 在 GitHub 上看得到的結果（這個 commit 的 CI 成功、分支保護已生效） | GitHub 的紀錄，附連結 |
| Not verified | 還沒有證據 | — |
| Blocked | 證據顯示不能發布（決定過期、被要求修改、優先級 1 未核准、檢查失敗、授權不符） | — |

規則：

- **Engineering verified 不等於 Human approved**，本機測試通過也不等於可以發布。
- 每道關卡只接受它自己類型的證據：人工關卡要人，遠端關卡要 GitHub 的紀錄。
- SYNTHETIC 演練的資料（審核人或授權人名稱含 synthetic、fixture、AI、bot）永遠不能作為發布依據。工具會標示 `synthetic: true`，`releasable` 一律為 false。

## 2. 關卡

| # | 關卡 | 類型 | 需要的證據 | T.3I 結束時 |
|---|---|---|---|---|
| 1 | Remote CI passed | Remote | 發布 commit 的 `gates` 成功，附 run 連結與 SHA | Not verified（從未在 GitHub 執行） |
| 2 | Protected branch configured | Remote | `main` 規則已生效，必要檢查為 `gates` | Not verified（只有提案） |
| 3 | Human review completed | Human | 每個目標在帳本裡都有真人的核准，而且是最新的決定 | Not verified（帳本 0 筆） |
| 4 | Compliance review completed | Human | 合規清單由人逐項確認並簽名（日期、範圍） | Not verified |
| 5 | Exact revision/hash approved | Engineering | 目標的 revision 是目前的版本，核准的 hash 等於重新計算的 hash | Not verified（沒有核准） |
| 6 | No unresolved Priority-1 blockers | Engineering | 目標中每一題優先級 1 都已核准 | Blocked（31 題未審） |
| 7 | Unpublished content leak scan passed | Engineering | preflight 的資料、bundle、路由、probe 四項都通過 | Engineering verified（T.3I 本機 build） |
| 8 | Ledger integrity passed | Engineering | `trials:ledger` 通過，CI 也和 base 比對過 | Engineering verified |
| 9 | Paper-version integrity passed | Engineering | `trials:integrity` 的清單與固定卷版本都通過 | Engineering verified |
| 10 | Rollback / revocation procedure tested | Engineering | 撤回與重新發布的演練通過（SYNTHETIC，`tests/trials-release-gate.test.ts`） | Engineering verified（本機） |
| 11 | Explicit release authorization received | Human | 擁有者在 PR 寫明：這些目標、這個 commit、日期，同意發布 | Not verified |

## 3. 發布 PR 的填寫範本

```
## 發布授權
- 目標：<id@rev>, …（共 N 題）
- 發布 commit：<完整 SHA>
- trials:release-gate 報告：附 JSON（只含 id、hash、狀態）
- [ ] 1 Remote CI：<run 連結>（SHA 與上面相同）
- [ ] 2 分支保護：<規則頁連結>
- [ ] 3 人工審核：帳本 eventId <…>，審核人 <id>
- [ ] 4 合規：<確認人>、<日期>、<範圍>
- [ ] 5–10 工程檢查：release-gate 顯示 engineering-verified
- [ ] 11 授權：我，<擁有者>，同意在 <SHA> 發布上列目標。<日期>
```

## 4. 發布之後

1. 等發布 commit 合併，CI 再跑一次（這次會和前一版的帳本比對）。
2. 正式網站部署是另一項授權，不在本清單內。
3. 發現錯誤時，依 `HUMAN_REVIEW_WORKFLOW.md` §8 撤回，不要改寫或刪除帳本紀錄。
