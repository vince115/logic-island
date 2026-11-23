# CICD-0 引擎階段 E30：`environments` profile（`environments*.ts`、`gh-environments*.ts`）

> 2026-11-24。給 DevOps 與 CI/CD 島 CICD09「部署管線」（持續交付與持續部署、環境的晉升、人工核准、上線後的檢查、部署紀錄）、CICD13「回滾與發布安全」（以 `workflow_dispatch` 部署較早的 digest、發布前的檢查清單）與 CICD15 總結專案。在 E25 `git`、E26 `forge`／`gh`、E27 workflow 模型、E28 的執行與 E29 的快取、產出物與 secret 之上，加上 GitHub 的部署環境（environment）與保護規則、等待審核的部署、部署分支規則、concurrency group 與部署紀錄。E1–E29 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `ENVIRONMENTS_PROFILE`（RANK 30） | `artifacts` 的一切，沒有新指令，feature `environments`。課程機器寫 `profile: 'environments'` |
| 新的行為 | job 的 `environment:` 有保護規則（必要的審核者、等待時間、部署分支規則）；等待中的 job 與 run（`waiting`）；`gh api` 的 environments、deployment-branch-policies、`pending_deployments`、deployments、`users/{login}`；workflow 與 job 的 `concurrency`（`pending`、`cancel-in-progress`）；部署紀錄與狀態；檢查 `environment`、`deployment`，`run` 的 `status` 多了 `waiting`、`pending` |
| profile 以下 | 行為與 E29 相同：`environment:` 只選擇 secret 與 variable 的範圍，job 不等待；`concurrency` 只解析不生效；`gh api` 的新端點仍是 E26 的「模擬環境只支援…」；課程資料報 `… need the environments profile (engine stage E30)`；新的檢查報需要 environments 機器 |
| 說明頁與 help | `man gh`、`gh --help` 與沒有參數的 `gh` 不變（gh 沒有新指令，只有 `gh api` 多了端點）；不支援的端點的說明句多列出 E30 的端點 |

程式的分工：`environments-model.ts`（環境的規則、approver、審核、job 的關卡 `JobEnv`、分支樣式比對、GitHub 的訊息）、`environments-gate.ts`（job 到達 environment 時的關卡、job 層級的 concurrency）、`environments-run.ts`（新 run 的 concurrency、審核之後重算、`settleEnv`）、`environments-json.ts`（由 job 推導的部署紀錄與狀態、REST 的 JSON）、`environments-lesson.ts`（課程資料與驗證）、`environments-checks.ts`（檢查）、`gh-environments.ts`、`gh-environments-put.ts`（`gh api` 的端點）。`actions.ts`、`actions-model.ts`、`actions-job.ts`、`actions-events.ts`、`actions-checks.ts`、`gh.ts`、`gh-api.ts`、`gh-run.ts`、`gh-run-view.ts`、`forge-state.ts`、`forge-lesson.ts`、`server-lesson.ts`、`lesson.ts`、`shell.ts` 只多了 environments profile 才走到的分支。每個新檔案都不到 150 行。

## 2. 模型

| 項目 | 內容 |
|---|---|
| 環境 | 每個儲存庫的 environment（E29 的 `environments` 名稱）都有規則：必要的審核者（登入名稱，最多 6 個，**一人核准就夠**）、`prevent_self_review`、等待時間（分鐘，0–43200）、部署分支規則（沒有：任何分支與標籤；`protected`：只有受保護的分支；自訂：符合任一樣式的分支）。ID 從 161088001 起依序 |
| 自動建立 | job 指名一個儲存庫還沒有的 environment 時建立它（沒有規則；GitHub 的行為），也加入 E29 的 `environments`，所以 `gh secret set -e` 可以用 |
| approver | 課程宣告的審核者 persona：在每個它是審核者的 environment，部署開始等待後 `after` 秒核准（或 `reject` 拒絕），附上 comment。`prevent_self_review` 時不審核自己觸發的 run |
| 使用者 ID | `gh api users/{login}`：學習者 1001，PR 的 persona 與 approver 依序 2001、2002…（審核者在 REST 裡以 ID 指定） |
| 計算 | 同 E28：run 在建立時算完。job 的關卡在它要開始時決定；審核者的決定若已知（approver），時間就算進去；學習者的審核在 API 呼叫的那一刻**重算**那個 attempt：等待的 job 與依賴它的 job 重新計算，其他 job、ID、快取、artifact 與已發生的效果保留。environments 機器的 attempt 不做記憶（memo），因為結果取決於其他 run |

## 3. 環境的關卡（`environments-gate.ts`）

| 情況 | 結果 |
|---|---|
| 分支規則不允許 | job 立刻失敗，沒有 step，annotation `Branch "feature" is not allowed to deploy to staging due to environment protection rules.`（標籤是 `Tag "v1" …`）；**不建立部署**；依賴它的 job 照 E28 skipped。PR 的 run 以 head 分支判斷；標籤在任何規則下都不允許 |
| 允許 | 建立部署（ID 從 1900000001 起）。沒有審核者也沒有等待時間：立刻開始 |
| 等待時間 | 從 job 到達 environment 的時刻起算（GitHub 文件：job 最初觸發之後）；期間 job 是 `waiting` |
| 必要的審核者 | 等第一個審核：API 的審核（只算在 job 開始等待之後的）或 approver 的時間。核准：在核准時刻與等待時間結束兩者較晚的時刻開始（再加 runner 的 2 秒）；拒絕：在那一刻失敗，annotation `The deployment was rejected or didn't satisfy other protection rules.`；還沒有審核：一直等待（`gh run watch` 說明要用 `pending_deployments` 審核） |
| `environment.url` | 在 job 結束時以那時的 context（含 `steps.*.outputs`）求值，成為部署成功狀態的 `environment_url` |
| 顯示 | job 與 run 的狀態是 `waiting`（`gh run list --json status`、`gh run list -s waiting`）；`gh run view` 在 JOBS 之後列 `production: Waiting for review: production needs approval to start deploying changes.` 或 `production: Waiting for the wait timer of production (4m3s left)` |

## 4. Concurrency（`environments-run.ts`、`environments-gate.ts`）

| 項目 | 內容 |
|---|---|
| workflow 層級 | `concurrency: 群組` 或 `{ group, cancel-in-progress }`，以 `github`、`inputs`、`vars` 求值。新的 run 建立時：`cancel-in-progress: true` 取消群組裡所有還沒完成的 run；否則取消群組裡 `pending` 的 run（**只能有一個在等**），新的 run 是 `pending`，在執行中的那個 run 結束時開始（它的結束還不知道，例如在等審核：沒有 job，直到結束時間確定） |
| 取消的 run | 每個被切斷的 job 有 annotation `Canceling since a higher priority waiting request for 'group' exists`；還沒開始的 run 在那一刻結束（conclusion cancelled） |
| job 層級 | job 的 `concurrency` 以 job 可用的 context 求值；比較的是其他 run 的同群組 job：`cancel-in-progress` 切斷它們，否則切斷還在等的那個、等執行中的那個結束（`pending`，`gh run view` 列 `deploy: Waiting for a job in the concurrency group 'g' to complete`）。被切斷的 job 依賴它的 job 重算（skipped） |
| 連動（`settleEnv`） | 審核、`gh run cancel`、新的 run 之後：等待中的 run 或 job 若前一個的結束時間改變（例如被取消、提早核准），從新的時間重算；直到沒有變化 |
| 不處理 | `gh run rerun` 不經過 concurrency；同一個 run 裡兩個 job 的同一群組不互相等待 |

## 5. 部署紀錄（`environments-json.ts`）

每個通過分支規則的 environment job 是一筆部署：`environment`、`sha`（GITHUB_SHA）、`ref`（run 的分支）、`task: deploy`、`creator` 是 `github-actions[bot]`、建立時間是 job 到達 environment 的時刻；rerun 的新 attempt 有新的部署，沿用的 job 不重複。狀態由 job 與時鐘推導：有規則時先 `waiting`，開始時 `in_progress`，結束時 `success`、`failure`（含被拒絕）或 `error`（被取消）；同一個 environment 之後的部署成功時，較早的成功部署多一個 `inactive`。被 concurrency 取消、還沒到達 environment 的 job 沒有部署。

## 6. `gh api` 的端點（`gh-environments*.ts`）

| 端點 | 內容 |
|---|---|
| `GET users/{login}` | `{ login, id, type, html_url, name }`；不認識：404 |
| `GET repos/{owner}/{repo}/environments` | `{ total_count, environments: [...] }` |
| `GET …/environments/{name}` | GitHub 的形狀：`id`、`name`、`url`、`html_url`、時間、`can_admins_bypass`、`protection_rules`（`wait_timer`、`required_reviewers` 與 `reviewers: [{ type: 'User', reviewer }]`、`branch_policy`）、`deployment_branch_policy`（`{ protected_branches, custom_branch_policies }` 或 null） |
| `PUT …/environments/{name}` | 需要 admin（`Must have admin rights to Repository.`，403）；本文 `wait_timer`、`prevent_self_review`、`reviewers`（`[{ "type": "User", "id": 2001 }]`）、`deployment_branch_policy`；沒寫的欄位不變；沒有這個 environment 時建立。驗證：整數與上限的 422 寫法同 E26、Team 只在組織、未知的使用者、兩種分支規則必須恰好一個 true。審核者陣列建議用 `--input` 檔案 |
| `…/environments/{name}/deployment-branch-policies` | GET `{ total_count, branch_policies: [{ id, name, type }] }`；POST `-f name=release/*`（需要自訂分支規則，只支援 `type: branch`）；`GET`、`DELETE …/{id}` |
| `GET …/actions/runs/{id}/pending_deployments` | 每個等待中的 environment 一項：`environment`、`wait_timer`、`wait_timer_started_at`、`current_user_can_approve`、`reviewers` |
| `POST …/pending_deployments` | 本文 `environment_ids`（`-F 'environment_ids[]=161088002'`）、`state`（`approved`、`rejected`）、`comment`，都是必填；回應是被決定的部署。沒有等待中的：`No pending deployment requests to approve or reject`（422）；學習者不是審核者或 `prevent_self_review`：`There was a problem approving one of the gates`（422） |
| `GET …/deployments[?environment=&sha=&ref=]` | 新的在前（最多 30 筆）；`…/deployments/{id}` 與 `…/deployments/{id}/statuses`（新的在前） |

## 7. 課程資料與檢查（`environments-lesson.ts`、`environments-checks.ts`）

```ts
forge: { repos: [{ url, …E26–E29 的欄位, environments: ['staging', 'production'],
  environmentRules?: [{ name: 'production', reviewers?: ['mei-lin', 'kai'], preventSelfReview?: false, waitTimer?: 0, branches?: 'protected' | ['main', 'release/*'] }],
  approvers?: [{ login: 'kai', name?: 'Kai Chen', after: 1800, decision?: 'approve' | 'reject', comment?: 'LGTM' }] }] },
```

| 規則 | 內容 |
|---|---|
| 驗證 | 需要 environments profile；`environmentRules` 最多 6 個，名稱在 `environments` 裡且不重複；審核者是學習者、PR persona 或 approver 的登入名稱（最多 6 個、不重複）；`waitTimer` 0–43200；`branches` 是 `'protected'` 或 1–10 個不重複的樣式（`*` 不跨 `/`，`**` 跨）；approver 最多 6 個，登入名稱唯一且不是學習者，`after` 0–30 天，comment 最多 2000 字 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'environment', repo, name, reviewers?, waitTimer?, branches? }` | 有這個 environment；審核者（集合相同）、等待分鐘數、分支規則（`'all'`、`'protected'` 或樣式的集合） |
| `{ kind: 'deployment', repo, environment, ref?, tip?, commit?, status?, latest? }` | `latest`：只看最新的部署，否則有任一筆符合；`tip`：是 `ref`（預設的預設分支）目前的 commit；`commit`：git 資料的 commit 標籤；`status`：`waiting`、`in_progress`、`success`、`failure`、`error`、`inactive`。還在等待或執行時提示 `gh run watch` |
| `run` 的 `status` | environments 機器另可寫 `waiting`、`pending` |

說明例：`https://github.example/island/shop.git 最新的 production 部署應該是 預設分支 目前的 commit、狀態是 success`、`… 應該有 environment production（必要的審核者是 kai；等待 10 分鐘；只有符合 main 的分支可以部署）`。訊息例：`最新的部署 1900000002（main 的 2a218ba）還沒有結束（waiting），先用 gh run watch 4100000001 等它完成`、`部署分支的規則是：任何分支都可以部署`、`沒有部署到 qa 的紀錄`。

## 8. 回滾

`workflow_dispatch` 的輸入（例如 `image`）在 environment job 裡照 E27／E28 使用：`gh workflow run deploy.yml -f image=sha256:…` 讓 production 部署指定的 digest（部署紀錄的 sha 仍是 dispatch 的 ref 的 commit）；`run` 檢查以 `logIncludes` 確認部署的是哪個 digest。以 `git revert` 回滾則是一般的 push 觸發。實際把 Image 部署到主機是 E31。

## 9. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e30.test.ts` | profile 與分界（artifacts profile 的資料錯誤、`gh api` 的說明、environment job 不等待）；staging → production：`gh run view` 的等待行、`pending_deployments` 的 GET 與 POST、`environment.url`；approver 在時鐘上核准（`gh run watch` 等到那時）與拒絕；沒有 approver 時 `gh run watch` 的說明；等待時間（與審核者一起時不會提早）；分支規則（自訂樣式、`protected`）；拒絕、沒有等待中的部署、`prevent_self_review`、不是審核者、缺欄位；以 `workflow_dispatch` 輸入回滾；兩個練習的檢查與典型錯誤；`environment`、`deployment` 檢查的訊息與資料驗證；重播的確定性 |
| `tests/terminal-e30-concurrency.test.ts` | workflow 的 concurrency：`pending`、只有一個在等、`cancel-in-progress`、卡在等審核的 run 後面（核准或取消之後開始）、取消等待中的 run；job 層級的群組；PUT environment 的驗證與結果、分支樣式的 POST／GET／DELETE、`users/{login}`、新 environment 與 `gh secret set -e`；部署列表的篩選、狀態（含 `inactive`）、404；自動建立的 environment |
| `tests/support/environments-fixture.ts` | 只供測試：dev-09（environments profile）；island/shop 的 deploy.yml（push 與 dispatch，staging 再 production）、queue.yml、rush.yml；staging（main、release/*）、production（mei-lin 與 approver kai，1800 秒）；兩個練習（核准上線、保護 production） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `environments`。

## 10. 只在課文說明、或不模擬的部分

- 管理員略過保護規則（`can_admins_bypass` 一律 true，但沒有略過的操作）、Team 審核者、組織層級的環境、自訂的部署保護規則（GitHub App）、`gh run view` 與 `gh pr view` 裡的部署與環境連結、網頁的 Deployments 頁。
- 部署的 `payload`、`description`、`node_id`、手動以 API 建立部署（`POST …/deployments`）與狀態、`transient_environment`、環境的刪除。
- 標籤的部署分支規則（`type: tag`）、樣式的字元類別 `[…]`。
- `gh run rerun` 與 concurrency 的互動、同一個 run 裡兩個 job 的同一群組。
- 部署到主機（ssh 與遠端 Docker）、上線後的 `curl` 檢查：E31 `deploy-hosts`。

## 11. 沒有把握的地方（依記得的格式寫，並在此註明）

- **訊息**：`Branch "…" is not allowed to deploy to … due to environment protection rules.`（標籤的 `Tag "…"` 寫法、PR 以 head 分支判斷、是否仍建立部署）；`The deployment was rejected or didn't satisfy other protection rules.` 出現在 annotation；`Canceling since a higher priority waiting request for '…' exists`（cancel-in-progress 時是否同一句、出現在哪個 job）。
- **gh 的顯示**：`gh run view` 的 `Waiting for review: … needs approval to start deploying changes.`、等待時間與 concurrency 的那幾行（真實的 gh 可能不顯示）；`pending` 的 run 在 JOBS 下沒有 job；`gh run list` 的狀態符號。
- **REST**：`pending_deployments` 的錯誤（`No pending deployment requests to approve or reject`、`There was a problem approving one of the gates`、缺欄位與型別的 422 寫法）、只有等待時間的環境能否審核；PUT 的錯誤句子（Team、未知使用者、兩種分支規則）、沒寫的欄位是否保留；branch policy 的 404 與重複名稱；`protection_rules` 的 ID 與順序；部署 JSON 的欄位（省略 `node_id`）、`production_environment` 的判斷、`creator` 是 `github-actions[bot]`、`ref` 是分支名稱。
- **狀態與時間**：部署狀態 `waiting`（REST 文件的列舉沒有它）、被取消是 `error`、被拒絕是 `failure`、`inactive` 的時刻；等待時間從到達 environment 起算（不是從核准起算）、核准後 runner 的 2 秒；`prevent_self_review` 以觸發 run 的人判斷；approver 的審核只算在 job 開始等待之後。
- **concurrency**：取消時 `pending` run 的開始與結束時間、job 層級群組的比較範圍（其他 run 的 job）、`gh run view` 對被取消的 pending run 的顯示。
