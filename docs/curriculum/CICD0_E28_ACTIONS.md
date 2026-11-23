# CICD-0 引擎階段 E28：`actions` profile（`src/lib/terminal/actions*.ts`、`runner.ts`、`ci-tools.ts`、`gh-run*.ts`）

> 2026-11-23。給 DevOps 與 CI/CD 島 CICD03「持續整合」（頻繁整合、自動建置、快速回饋、主線保持綠燈、失敗先修）、CICD04「GitHub Actions 入門」（workflow 與 job、觸發條件、step 與 action、runner、最小權限）、CICD05（pipeline 裡的測試：測試金字塔、單元／整合／端對端、報告、不穩定的測試、平行執行）。在 E25 的 `git`、E26 的 `forge`／`gh` 與 E27 的 workflow 模型（解析、觸發、運算式、權限）之上**真的執行** GitHub Actions：事件建立 run，job 在模擬的 GitHub-hosted runner（ubuntu-24.04 式）上執行，`run:` 的 step 交給模擬環境的 Bash 直譯器，記錄、`gh run …` 與檢查 `run`。E1–E27 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `ACTIONS_PROFILE`（RANK 28） | `workflows` 的一切，沒有新指令，feature `actions`。課程機器寫 `profile: 'actions'` |
| 新的行為 | 推送、Pull Request、`gh workflow run` 與排程建立 run；`gh run list|view|watch|rerun|cancel`；`gh workflow run|enable|disable`；`gh workflow view` 列出最近的 run；`gh pr checks`、`gh pr view` 與分支保護改用真實的執行結果；課程宣告的 CI 工具（`npm test` 這類）；檢查 `run`；機器的 `actions` 資料 |
| profile 以下 | 推送不建立 run；`gh run` 仍是 E26 的「模擬環境不支援這個指令（支援的指令：…）」，`gh workflow run|enable|disable` 仍是 E27 的說明；CI 工具的指令仍是 `command not found`；課程資料的 `actions` 報 `actions needs the actions profile (engine stage E28)`；`run` 檢查報需要 actions 機器；`gh pr checks` 照樣顯示課程宣告的結果（格式不變） |
| 說明頁與 help | `man gh`、`gh --help` 與 `help` 的 gh 那一行不變（**決定**，同 E27）；沒有參數的 `gh` 在 actions profile 列出 `workflow list|view|run|enable|disable、run list|view|watch|rerun|cancel` |

程式的分工：`actions-model.ts`（run、attempt、job、step 的資料型別與依時鐘的狀態、結論、gh 的符號、Actions 的檢查結果）、`actions-events.ts`（事件：推送、Pull Request、排程、`workflow_dispatch`、重新執行與取消）、`actions.ts`（一次 attempt 的計算：needs 的順序、if、matrix、fail-fast、max-parallel、github context 與預設環境變數）、`actions-job.ts`（一個 job：Set up job、各 step、post step、Complete job、job 的 outputs、timeout）、`runner.ts`（runner 的檔案系統、`actions/checkout`、`run:` 的 shell、file command 與 workflow command）、`ci-tools.ts`（CI 工具）、`gh-run.ts`、`gh-run-view.ts`（`gh run` 的指令與格式）、`actions-lesson.ts`（課程資料與 runner image）、`actions-checks.ts`（檢查）。`gh-workflow.ts`、`gh.ts`、`gh-pr-act.ts`、`forge-state.ts`、`shell.ts` 只多了 actions profile 才走到的分支。每個檔案都不到 300 行。

## 2. 事件（`actions-events.ts`）

| 事件 | 怎麼產生 |
|---|---|
| `push` | 每個 `git` 與 `gh` 指令之後比較 forge 的前後：每個移動或新增的分支、標籤都是一次推送（`git push`、`gh pr merge` 讓 base 前進、`--delete-branch` 不算；刪除不觸發）。變更的檔案（給 `paths` 篩選）是舊的 commit 到新的 commit；新的分支是它與預設分支的 merge base 到新的 commit（預設分支第一次推送時是全部檔案）；標籤不看路徑。workflow 檔案讀推送的 commit |
| `pull_request` | 新的 open PR 是 `opened`，open PR 的 head 有新的 commit 是 `synchronize`（同一次推送先建立 push 的 run，再建立 PR 的 run）。GitHub 先建立測試合併 commit（父 commit 是 base 最新的 commit 與 head，提交者 `GitHub <noreply@github.example>`，訊息 `Merge <head> into <base>`），run 在它上面執行，workflow 檔案也讀它；`GITHUB_REF` 是 `refs/pull/N/merge`，檢查結果掛在 PR 的 head commit。有衝突時不建立 run |
| `workflow_dispatch` | `gh workflow run`（§5），在指定的 ref（預設預設分支）上，輸入照 E27 的 `dispatchInputs` 轉型 |
| `schedule` | 時鐘越過 cron 的時間（E27 的 `nextScheduled`，UTC）時建立：下一個 `git`、`gh` 指令之前（或檢查時）補做，每次最多 10 個，用預設分支最新的 workflow 檔案。真實的排程是 GitHub 的時間到了就執行，模擬環境在下一次看的時候才補上，時間仍是 cron 的時間 |
| 無效的 workflow | `push` 與 `pull_request` 時，無效的檔案建立一個失敗的 run，沒有 job，`gh run view` 顯示 `This run likely failed because of a workflow file issue.` 與 E27 的錯誤行（**決定**：真實的 gh 只顯示第一句與網址） |
| 停用的 workflow | `gh workflow disable` 之後不建立任何 run（`gh workflow run` 是 422），`enable` 恢復 |

每個符合 `on` 的 workflow 檔案（`triggers`）建立一個 run。run 的 ID 與 job 的 ID 是機器的計數器（預設 4100000001、11300000001，課程可以設定），run 的編號是那個 workflow 的第幾個 run。標題：推送是 commit 的標題、PR 是 PR 的標題、`workflow_dispatch` 與 `schedule` 是 workflow 的名稱；`run-name` 依 E27 的 context 代換後取代它。觸發的人：推送與 dispatch 是 gh 的帳號、PR 是 PR 的作者。每個儲存庫最多保留 200 個 run。

## 3. run、attempt 與 job（`actions.ts`、`actions-model.ts`）

| 項目 | 內容 |
|---|---|
| 計算的時機 | run 建立時就把每個 job、step、記錄行與時間算完（**決定**：同 E24 的「算得出的轉變時間」）；之後看到的只看時鐘：job 開始前是 queued、結束前是 in_progress、之後 completed。`sleep` 與 `gh run watch` 讓時鐘前進。以（儲存庫、run、commit、事件、attempt、時間、計數器、權限設定、上一次的結果）記住算過的 attempt，重播與變體不重算 |
| 順序與時間 | job 依 `needs` 的順序，時間當作平行執行：job 在它的 needs 都結束（與 run 開始）時排入，runner 固定 2 秒後接手；step 的時間由 runner 的時鐘決定（CI 工具的秒數、`sleep`），Set up job 與 `actions/checkout`、`setup-*` 各 1 秒 |
| `if:` | job 沒有 `if` 時，needs 都成功才執行；有 `if` 時以 E27 的 `evalIf` 求值（`failure()` 是有 need 失敗），沒有呼叫狀態函式而有 need 失敗或略過時不執行。不執行的 job 是 skipped。求值錯誤讓 job 失敗。step 的 `if` 同樣，前面的 step 失敗（而且沒有 `continue-on-error`）就不執行，`always()`、`failure()` 例外 |
| `needs` context | 每個 need 的 `result`（有 job 失敗是 failure、有取消是 cancelled、全部略過是 skipped，其他 success；`continue-on-error` 的 job 失敗算 success）與 `outputs`（matrix 的各個 job 合起來，後面的蓋過前面的） |
| matrix | E27 的 `expandMatrix`（整個 matrix 是運算式時先求值）；job 的名稱是 `test (18)`、`test (ubuntu-latest, 20)`（值以 `, ` 接起來），寫了 `name` 時是代換後的名稱。`max-parallel` 依序佔用空出來的位置；`fail-fast`（預設 true）在第一個失敗的 job 結束的時刻取消還沒結束的兄弟 job（執行中的那個 step 是 cancelled，記錄加 `##[error]The operation was canceled.`，再接 Complete job；還沒開始的 job 沒有 step） |
| `runs-on` | 每個 label 都要有 runner（預設 `ubuntu-latest`、`ubuntu-24.04`、`ubuntu-22.04`，課程可以改）；沒有時 job 一直 queued（真實的行為：Waiting for a runner），run 不會結束，依賴它的 job 也不會開始 |
| 結論 | run：被取消是 cancelled，有 job 失敗（不算 `continue-on-error` 的）是 failure，有 job 被取消是 cancelled，全部略過是 skipped，其他 success。上限：一個 run 最多 12 個 job（超過的 matrix 組合不建立，超過的 job 是 skipped）、每個 job 最多 30 個 step |
| 重新執行 | `gh run rerun` 以現在的時間計算新的 attempt（`GITHUB_RUN_ATTEMPT` 加一，不穩定的工具依它決定）；`--failed` 只重新執行失敗或被取消的 job 和依賴它們的 job，其他 job 保留上一次的結果（記錄、時間與 ID 都不變）。檔案讀 run 的 commit 上的 workflow |
| 修正（E29 一併） | `rerun --failed` 原本以 job 的鍵選擇，matrix 只要有一條失敗就整個重新執行；現在以每一條（鍵加 matrix 的值）為單位：只重新執行失敗與被取消的那幾條，成功的沿用，依賴它們的 job 每一條都重新執行。已發布的 CICD 課都還沒有用到（見 `CICD0_E29_ARTIFACTS.md` §9） |
| 取消 | `gh run cancel` 在現在的時刻把每個還沒結束的 job 截斷（同 fail-fast），run 是 cancelled |

## 4. runner 與 step（`runner.ts`、`actions-job.ts`）

| 項目 | 內容 |
|---|---|
| runner | 每個 job 一台新的 runner：課程的 runner image（`actions-lesson.ts` 的 `runnerMachine`：Ubuntu 24.04 的 `/etc/os-release`、使用者 `runner`（uid 1001，sudo 不用密碼、docker 群組）、`/home/runner/work`、`/opt/hostedtoolcache`、`/tmp`、課程的 `runnerFiles`），以 git profile 建立一次、每個 job 複製；指令是 git profile 的指令去掉 `docker`（runner 上的 Docker 在 E29）。時區 UTC，時鐘是 job 開始的時間 |
| 工作目錄 | `GITHUB_WORKSPACE` 是 `/home/runner/work/<repo>/<repo>`，一開始是空的資料夾 |
| `actions/checkout@v*` | 把 run 的 commit（PR 是測試合併 commit）的檔案寫進工作目錄，並建立一個儲存庫（物件就是 forge 的物件）：推送到分支時在那個分支上（`git checkout --progress --force -B main refs/remotes/origin/main`），PR 與標籤是 detached HEAD。`git log` 等指令可以在 step 裡用 |
| `actions/setup-node@v*`、`setup-python@v*` | 當作工具已經在 runner 上：印 `Found in cache @ /opt/hostedtoolcache/node/20/x64`，沒有其他作用（工具由課程宣告） |
| 其他 `uses:` | step 失敗：`模擬環境不支援 actions/cache@v4（E28 支援 actions/checkout、actions/setup-node、actions/setup-python；cache 與 artifact 在 E29）` |
| `run:` | 先以 E27 的 `interpolate` 把 `${{ }}` 代換成文字（所以 script injection 真的發生），再交給 E8 的 Bash 直譯器。沒有寫 `shell` 時是 `bash -e {0}`（記錄的 `shell: /usr/bin/bash -e {0}`，**沒有** pipefail）；`shell: bash` 是 `bash --noprofile --norc -eo pipefail {0}`；`shell: sh` 是 `sh -e {0}`；其他 shell 讓 step 失敗。`defaults.run` 的 `shell` 與 `working-directory` 適用；工作目錄不存在是 runner 的 `An error occurred trying to start process '/usr/bin/bash' with working directory '…'. No such file or directory`。結束碼不是 0：`##[error]Process completed with exit code 1.` |
| 環境變數 | `CI=true`、`GITHUB_ACTIONS`、`GITHUB_SHA`、`GITHUB_REF`、`GITHUB_REF_NAME`、`GITHUB_REF_TYPE`、`GITHUB_EVENT_NAME`、`GITHUB_REPOSITORY`、`GITHUB_REPOSITORY_OWNER`、`GITHUB_RUN_ID`、`GITHUB_RUN_NUMBER`、`GITHUB_RUN_ATTEMPT`、`GITHUB_WORKSPACE`、`GITHUB_JOB`、`GITHUB_WORKFLOW`、`GITHUB_ACTOR`、`GITHUB_HEAD_REF`、`GITHUB_BASE_REF`、`GITHUB_SERVER_URL`、`GITHUB_API_URL`、`RUNNER_OS=Linux`、`RUNNER_ARCH`、`RUNNER_NAME`、`RUNNER_TEMP`、`RUNNER_TOOL_CACHE`、`HOME`、`PATH`，加上 workflow、job、step 的 `env`（依序覆寫） |
| file command | 每個 step 有新的 `GITHUB_OUTPUT`、`GITHUB_ENV`、`GITHUB_PATH`、`GITHUB_STEP_SUMMARY` 檔案（`$RUNNER_TEMP/_runner_file_commands/`）。`name=value` 與 `name<<分隔字`…`分隔字`；`GITHUB_OUTPUT` 成為 `steps.<id>.outputs`，`GITHUB_ENV` 加到之後的 step，`GITHUB_PATH` 加在之後的 `PATH` 前面；格式錯誤是 `Unable to process file command 'output' successfully.` 與 `Invalid format '…'`。job 的 `outputs` 在最後求值，給 `needs.<job>.outputs` |
| workflow command | 輸出裡的 `::error::`、`::warning::`、`::notice::`（可以有 `file=…,line=…` 這類屬性）變成 `##[error]…` 等行與 annotation；`::group::標題`、`::endgroup::` 是 `##[group]`、`##[endgroup]`；`::add-mask::值` 不顯示，之後的行把那個值換成 `***`；`::debug::` 不顯示（沒有開 debug）。其他 `::…::` 照印 |
| context | `github`（`sha`、`ref`、`event`（推送的 `head_commit`、PR 的 `pull_request.title`／`body`、dispatch 的 `inputs`…）、`run_id` 等，數字是字串）、`env`、`vars`（空，E29）、`secrets`（只有 `GITHUB_TOKEN`，值是 `***`）、`inputs`、`matrix`、`strategy`、`needs`、`steps`、`runner`、`job`；`hashFiles` 讀工作目錄的檔案 |
| step 的名稱 | `name`（代換後）；沒有時 `Run actions/checkout@v4` 或 `Run ` 加 `run:` 原文的第一行（運算式不代換）；記錄裡的 `##[group]Run …` 是代換後的。checkout 之後有 `Post Run actions/checkout@v4`（`Post job cleanup.`），最後是 `Complete job`（`Cleaning up orphan processes`） |
| Set up job | `Current runner version: '2.321.0'`、`Operating System`、`Runner Image` 與 **`GITHUB_TOKEN Permissions`** 三個群組（E27 的 `permissionLines`：job、workflow、儲存庫預設的有效權限）、`Secret source: Actions`、`Prepare workflow directory`、`Prepare all required actions`、用到的 action 的 `Download action repository '…'`、`Complete job name: test`。workflow 與 job 的 `env` 在這裡求值，失敗時 job 失敗 |
| `continue-on-error` | step 的：outcome 是 failure、conclusion 是 success，之後照常；job 的：job 仍是 failure，但不讓 run 失敗，依賴它的 job 看到 success |
| `timeout-minutes` | job 的（預設 360）：step 結束時超過期限的，在期限的時刻截斷（那個 step 是 cancelled、`##[error]The operation was canceled.`），annotation `The job running on runner GitHub Actions 1 has exceeded the maximum execution time of 1 minutes.`，job 是 failure。step 的 `timeout-minutes` 不模擬 |
| 時間戳記 | 群組的開頭幾行在 step 開始的時間，輸出在 step 結束的時間（`2026-11-23T02:00:07.0000000Z`，UTC） |

## 5. `gh` 指令與格式（`gh-run.ts`、`gh-run-view.ts`、`gh-workflow.ts`、`gh-pr-act.ts`）

| 指令 | 行為與格式 |
|---|---|
| `gh run list [-w workflow] [-b 分支] [-e 事件] [-s 狀態或結論] [-u 帳號] [-c commit] [-L 數量] [--json 欄位]` | 新的在前，預設 20 個。表格 `STATUS  TITLE  WORKFLOW  BRANCH  EVENT  ID  ELAPSED  AGE`；狀態是 `✓`（success）、`X`（failure）、`-`（cancelled、skipped）、`*`（queued、in_progress）；ELAPSED 是 `12s`、`1m2s`；AGE 是 gh 的相對時間。`-w` 可以是名稱、檔名、路徑或 workflow ID，找不到：`could not find any workflows named x`。沒有 run：標準錯誤 `no runs found`（結束碼 0）。`--json` 的欄位：`attempt`、`conclusion`、`createdAt`、`databaseId`、`displayTitle`、`event`、`headBranch`、`headSha`、`name`、`number`、`startedAt`、`status`、`updatedAt`、`url`、`workflowDatabaseId`、`workflowName`；印成縮排兩格、鍵依字母排序的 JSON 陣列。`--json` 沒有欄位或未知的欄位：`Specify one or more comma-separated fields for \`--json\`:`、`Unknown JSON field: "x"` 加欄位清單。`--jq`、`--template` 說明不支援 |
| `gh run view [run-id] [-v] [--job id] [--log] [--log-failed] [--exit-status]` | `X main CI · 4100000001`（PR 的 run 加 ` #1`，第二次以後加 ` (Attempt #2)`）、`Triggered via push about 1 minute ago`、空行、`JOBS`、每個 job `X test in 10s (ID 11300000001)`（還沒結束：`* test (ID …)`），`-v`、`--job` 或失敗的 job 列出 step（`  ✓ Set up job`、`  X Run npm test`、`  - …`）；有 annotation 時 `ANNOTATIONS`、`X Process completed with exit code 1.`、`test: .github#5`；最後一行提示（失敗：`To see what failed, try: gh run view 4100000001 --log-failed`；`--job`：`To see the full job log, try: gh run view --log --job=…`；其他：`For more information about a job, try: gh run view --job=<job-id>`）與 `View this run on GitHub: https://github.example/island/shop/actions/runs/…`。`--log` 每行 `job 名稱<Tab>step 名稱<Tab>時間戳記 內容`，`--log-failed` 只有失敗的 job 的失敗 step；run 還沒結束：`run 4100000001 is still in progress; logs will be available when it is complete`（1）。沒有 ID：`run or job ID required when not running interactively`；找不到：`failed to get run: HTTP 404: Not Found (…/actions/runs/42)` |
| `gh run watch <run-id> [--exit-status]` | **決定**：不重複刷新畫面，時鐘直接前進到 run 結束，只印最後的畫面（`Refreshing run status every 3 seconds. Press Ctrl+C to quit.`、空行、run view 的內容（每個 job 都列出 step）、空行、`✓ Run CI (4100000001) completed with 'success'`），同 Compose 的 plain 輸出。已經結束：`Run CI (…) has already completed with 'failure'`。有 job 一直在等 runner 時說明真實的 gh 會一直等（1）。`--exit-status`：結論不是 success 時結束碼 1 |
| `gh run rerun <run-id> [--failed]` | `✓ Requested rerun of run …`、`✓ Requested rerun (failed jobs) of run …`；還在執行：`failed to rerun: HTTP 403: This workflow is already running (…)`；`--failed` 而沒有失敗的 job：`… HTTP 403: This workflow run cannot be retried (…)`。`--job`、`--debug` 說明不支援 |
| `gh run cancel <run-id>` | `✓ Request to cancel workflow … submitted.`；已經結束：`Cannot cancel a workflow run that is completed`（1） |
| `gh run download`、`delete` | 說明不支援（artifact 在 E29） |
| `gh workflow run <workflow> [--ref ref] [-f 鍵=值]… [-F 鍵=值]…` | `✓ Created workflow_dispatch event for build.yml at main`、空行、`To see runs for this workflow, try: gh run list --workflow="build.yml"`。錯誤是 `could not create workflow dispatch event: HTTP 422: … (https://github.example/api/v3/repos/…/actions/workflows/<ID>/dispatches)`：`Workflow does not have 'workflow_dispatch' trigger`、`No ref found for: x`、`Cannot trigger a 'workflow_dispatch' on a disabled workflow` 與 E27 的輸入錯誤；`-f x`：`field "x" requires a value separated by an '=' sign`；沒有參數：`workflow ID, name, or filename required when not running interactively`。`--json`（從標準輸入讀輸入）說明不支援 |
| `gh workflow enable|disable <workflow>` | `✓ Enabled CI`、`✓ Disabled CI`；`gh workflow list` 不列停用的（`-a` 列出，狀態 `disabled_manually`） |
| `gh workflow view` | 有 run 時：`Total runs N`、`Recent runs`、最近五個 run 的表格（`gh run list` 的前六欄），再接 E27 的兩行提示；沒有 run 時同 E27 |
| `gh pr checks`、`gh pr view` | commit 有 Actions 的結果時取代課程宣告的結果：每個（workflow、job、事件）取最新的 run 與 attempt。名稱 `CI/test (pull_request)`、經過時間是 job 的時間、URL 是 `…/actions/runs/<run>/job/<job>`；還沒結束是 pending（`*`），被取消與略過以 `-` 顯示並計入 `cancelled`、`skipped`；只有取消時第一行是 `Some checks were cancelled`。`gh pr checks --watch` 在 actions profile 讓時鐘前進到 head 的 run 都結束，只印最後的表格（同 `gh run watch` 的決定；以下的 profile 仍說明不支援）。分支保護的要求檢查以 job 名稱（`test`）比對，在推送的保護、`gh pr merge` 的合併狀態裡依現在的時間判斷 |

## 6. CI 工具（`ci-tools.ts`）

E23 的 `BuildTool` 推廣成 CI 工具：課程宣告指令的完整字詞（`npm test`）與幾個情況，第一個條件都成立的情況決定輸出（標準輸出、標準錯誤）、結束碼、寫的檔案（例如 JUnit 的報告）與經過的秒數（時鐘前進）。條件是相對於工作目錄的檔案（存在、包含某段文字、不包含、不存在）或環境變數（有值或沒有值），所以修好原始碼就讓測試通過。工具在學習者的機器與 runner 上都能用（`where: 'local'` 只在本機、`'runner'` 只在 runner），所以可以示範「在我的機器上可以跑」（例如沒有提交的檔案）。不穩定的工具在指定的次數失敗：runner 上是 run 的 attempt，學習者的機器上是第幾次執行這個工具。沒有一個情況成立時，工具什麼也不印並成功。工具的比對在指令的分派之前，只有 actions 機器與 runner 有工具。

## 7. 課程資料與檢查（`actions-lesson.ts`、`actions-checks.ts`）

```ts
actions: {
  labels?: ['ubuntu-latest', 'ubuntu-24.04', 'ubuntu-22.04'],          // 有 runner 的 runs-on label
  runnerFiles?: [{ path: '/opt/hostedtoolcache/x', kind: 'dir', mode: 0o755, owner: 'runner' }],
  ids?: { run: 4100000001, job: 11300000001 },
  tools?: [{
    command: 'npm test', where?: 'both',                                 // both | runner | local
    cases: [{ when?: [{ path: 'app.js', includes: 'a + b' } /* | { path, excludes } | { path, absent: true } | { env: 'CI', set?: true } */],
              stdout?: 'PASS …', stderr?: '…', exit?: 0, seconds?: 1, writes?: [{ path: 'reports/junit.xml', content: '…' }] }],
    flaky?: { failOnAttempts: [1], stdout?, stderr?, exit?: 1, seconds?: 1 },
  }],
}
```

| 規則 | 內容 |
|---|---|
| 驗證 | 低於 `actions` profile：`actions needs the actions profile (engine stage E28)`；其他錯誤是 `actions: …`：label 1–8 個、ID 是正整數、`runnerFiles` 最多 20 個絕對路徑、工具最多 12 個（指令 1–8 個字詞、第一個字不能是模擬環境的指令（`… is a command of the simulation`）、同一處不重複）、情況 1–8 個、條件是 `{ path（相對）, includes | excludes | absent }` 或 `{ env, set? }`、輸出最多 4000 字、結束碼 0–255、秒數 0–3600、最多寫 4 個檔案、`failOnAttempts` 是 1–10。一個 step 的輸出最多保留 500 行 |
| 狀態 | `FsState.ci`：工具、runner image（一個 FsState）、label、計數器、排程補到的時間、工具在本機執行的次數；run 在每個 forge 儲存庫的 `site.runs`，停用的 workflow 在 `site.disabled` |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'run', repo, workflow, event?, ref?, tip?, status?, conclusion?, attempt?, job?, step?, logIncludes?, logExcludes? }` | 在結束時的時鐘（先補做排程）找最新的 run：`repo` 是 forge 網址或 origin 在 github.example 的本機儲存庫；`workflow` 是檔名、路徑或名稱；`event`（push、pull_request、workflow_dispatch、schedule）；`ref` 是 run 的分支（PR 的 head 分支）或標籤；`tip` 要求 run 是那個分支（預設預設分支）目前的 commit 的。`status`（queued、in_progress、completed）；`conclusion`（success、failure、cancelled、skipped）是 run 的，有 `job` 時是 job 的、有 `step` 時是 step 的（依名稱；job 是名稱或鍵）；`attempt` 是**至少**第幾次；`logIncludes`／`logExcludes` 是整個 run（或那個 job、step）的記錄文字。結論要求的對象還沒結束時失敗並提示：`最新的 run #2（4100000003）還在執行（in_progress），先用 gh run watch 4100000003 等它完成` |

說明例：`https://github.example/island/shop.git 的 main 目前的 commit 最新的 ci.yml run 應該：結論是 success`。訊息例：`最新的 run #1（4100000001）的結論是 failure`、`… 只執行了 1 次（attempt 1）`、`… 沒有 job lint`、`… 的 step「Run npm ci」的結論是 success`、`… 的日誌沒有「Publishing v1.1.0」`、`沒有 pull_request 觸發的 ci.yml run`。資料的錯誤：`a run check needs an actions machine (engine stage E28) and a repo (…)`、`… needs a workflow (a file name like ci.yml, its path or its name)`、`… event is one of push, pull_request, workflow_dispatch, schedule`、`… with a conclusion expects status completed`、`… step needs a job and is a step name`、`… attempt is 1..10`、`… logIncludes and logExcludes are texts of 1..500 characters`。

**參考解答**：推送之後要等 run 結束：`gh run watch <ID>`（ID 可以用 `gh run list -w ci.yml -L 1 --json databaseId` 讀出）或 `sleep`。典型錯誤「推送了但沒有等」會得到還在執行的提示。要從記錄讀出的答案用 `output` 檢查加 `fromCommand` 與 `TerminalVariant.git`（另一份程式碼），讓答案不能直接打出來。

## 8. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e28.test.ts` | profile 與分界（workflows profile 推送不建立 run、`gh run`／`gh workflow run` 的訊息不變、CI 工具不存在、資料與檢查要 actions profile、`gh pr checks` 照樣顯示宣告的結果）；推送：queued → in progress → completed、失敗的 job 的畫面與 `--log-failed`、Set up job 的權限群組與 checkout、修好之後變綠與檢查；PR：測試合併 commit、`gh pr checks` 的 pending 與結束碼 8、要求的檢查擋住合併、合併後 main 的 push run、synchronize、衝突時沒有 run；matrix 的 fail-fast、`max-parallel` 與 `fail-fast: false`、step output 經 job output 到 needs、略過與 `failure()`／`always()`；不穩定的測試與 `rerun --failed`（保留通過的 job）、還在執行時不能重新執行、取消、等 runner 的 job、排程、無效的檔案、停用與啟用；`gh run list` 的篩選與 `--json`、`--job`、`--log`、錯誤訊息；`gh workflow run` 的 422；`gh workflow view` 的最近 run；runner：預設環境變數、`bash -e` 與 `shell: bash` 的 pipefail、checkout 的檔案、`hashFiles` 與 git、`GITHUB_ENV`／`GITHUB_PATH`／`GITHUB_OUTPUT`、workflow command 與遮罩、`if`、`continue-on-error`、`working-directory`、不支援的 action 與 shell、`timeout-minutes`、script injection；CI 工具（本機與 runner、`where`、不穩定、寫檔案、沒有提交的檔案）；三個練習、檢查的訊息、資料驗證、宣告的 ID 與 label、重播的確定性與不改動傳入的狀態 |
| `tests/support/actions-fixture.ts` | 只供測試：dev-05（actions profile、Asia/Taipei）；island/shop（app.js 有錯、ci.yml、e2e.yml、matrix.yml、build.yml；main 要求檢查 test；學習者是 admin）；CI 工具 `npm ci`、`npm test`、`npm run e2e`（第一次失敗）、`npm run lint`（只在本機）；三個練習（修好紅燈、重新執行失敗的 job、手動觸發）與一個範例 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `actions`。另外依指示修了 `git-lesson.ts` 的 `known`（先把 `tips` 展開成陣列，避免讀兩次可迭代物件），`tests/support/git-fixture.ts` 的範例 `git fetch` 輸出因此少了 ` * [new tag]         v0.1       -> v0.1` 那一行。

## 9. 只在課文說明、或不模擬的部分

- **runner 的範圍**：self-hosted runner、Windows 與 macOS runner（沒有宣告 label 時一直等）、`container`／`services`、可重用與複合 workflow、`docker://` 與本機的 action、`actions/cache`、`upload-artifact`、`download-artifact`（E29）、runner 上的 Docker（E29）、真實的 Node.js 與 Python（工具由課程宣告）、`setup-*` 的版本解析與快取。
- **secrets 與變數**：`vars` 是空的、`secrets` 只有 `GITHUB_TOKEN`（`***`）；secrets 的設定與遮罩、environment 的保護與 concurrency 在 E29、E30。`GITHUB_TOKEN` 的權限只顯示在 Set up job，不影響 step（從 runner 推送是 E29）。
- **GitHub 的其他行為**：`[skip ci]`、`concurrency`、一次推送多個標籤、高負載時排程的延遲、step 的 `timeout-minutes`、`gh run rerun --job`／`--debug`、`gh run view --attempt`／`--web`、`gh run watch` 的刷新畫面、`GITHUB_STEP_SUMMARY` 的顯示（檔案照寫、不顯示）、Actions 分頁與 annotation 在檔案上的位置。
- **淺層 clone**：checkout 的 `fetch-depth: 1` 不模擬，runner 的儲存庫有完整的歷史。

## 10. 沒有把握的地方（依記得的格式寫，並在此註明）

- **gh run 的格式**：`gh run list` 的表頭與欄位（2.40 起有 TITLE 與 AGE）、ELAPSED 從 run 建立算起；`gh run view` 的標題行（`X main CI · ID`、PR 的 ` #1`、`(Attempt #2)`）、`Triggered via …`、失敗的 job 不加 `-v` 也列出 step、step 的符號、`ANNOTATIONS` 的兩行（尤其 `test: .github#5` 的路徑與行號：模擬環境用 step 的編號）、三種提示行；無效的 workflow 時的 `This run likely failed because of a workflow file issue.`；`--log` 的 `job<Tab>step<Tab>時間戳記 內容` 與時間戳記的七位小數；還在執行時的 `run … is still in progress; logs will be available when it is complete`；`no runs found` 的結束碼。
- **gh run watch／rerun／cancel／workflow run**：`Refreshing run status every 3 seconds. Press Ctrl+C to quit.`、`completed with '…'`、`has already completed with '…'`；`Requested rerun (failed jobs) of run`、`This workflow is already running`、`This workflow run cannot be retried`（依推測）；`Request to cancel workflow … submitted.`、`Cannot cancel a workflow run that is completed`；`Created workflow_dispatch event for … at …` 與 `--workflow="…"` 的引號；422 的 `Workflow does not have 'workflow_dispatch' trigger`、`No ref found for:`、`Cannot trigger a 'workflow_dispatch' on a disabled workflow`（依推測）；`field "x" requires a value separated by an '=' sign`；`workflow ID, name, or filename required …`；`disabled_manually`；`gh workflow view` 的 `Recent runs` 表格的欄位。
- **gh pr checks**：Actions 的檢查名稱 `CI/test (pull_request)`（gh 可能印 `CI / test (pull_request)` 或只印 job 名稱）、URL 的寫法、`Some checks were cancelled`、取消的結束碼（模擬環境是 1）、`gh pr view` 的摘要把 cancelled 算成失敗、`--watch` 只印最後的表格；分支保護以 job 名稱比對，同一個 commit 有 push 與 pull_request 兩個結果時取任一個成功的（GitHub 取最新的）。
- **runner 的記錄**：`Current runner version: '2.321.0'`、Operating System 與 Runner Image 群組的內容（真實的還有 Image 版本、Included Software 等）、`Download action repository '…'`（真實的有 SHA）、checkout 的記錄（真實的有很多行：git 版本、`Temporarily overriding HOME`、fetch 的輸出…）、`Found in cache @ …`、`Post job cleanup.`、`Cleaning up orphan processes`、`The operation was canceled.`、timeout 的 annotation 的句子；`setup-node` 也有 post step（模擬環境沒有）。
- **shell**：沒有寫 `shell` 時是 `bash -e {0}`（沒有 pipefail）而 `shell: bash` 是 `--noprofile --norc -eo pipefail`——依 GitHub 文件的記憶；記錄的 `shell:` 行寫法；`command not found` 在 runner 上是 bash 的 `/home/runner/work/_temp/0002.sh: line 1: npm: command not found`（不附模擬環境的指令清單）；指令稿的檔名（真實的是 UUID，模擬環境是 step 的編號）、file command 檔案的名稱。
- **時間**：runner 接手的 2 秒、Set up job 與 checkout 各 1 秒、輸出的時間戳記在 step 結束時、job 的開始時間是 needs 結束時（真實的有排隊的變動）；ELAPSED 與 `in 10s` 的算法。
- **結論與規則**：timeout 的 job 是 failure（GitHub 可能顯示 cancelled）；job 的 `continue-on-error` 失敗時 needs 看到 success；全部略過的 run 是 skipped；被取消的 run 即使有失敗的 job 也是 cancelled；`rerun --failed` 保留的 job 沿用舊的 ID 與時間（GitHub 為新的 attempt 建立新的紀錄）；matrix 的 job 名稱裡物件值的寫法；`max-parallel` 的排程；fail-fast 時還沒開始的 job 沒有 step；`needs` 的 outputs 在 matrix 時的合併；PR 測試合併 commit 的訊息與身分；新分支的路徑比對基準（與預設分支的 merge base）；無效的檔案在 PR 也建立失敗的 run；排程每次最多補 10 個、用目前預設分支的檔案。
- **context 的內容**：`github.event` 只有子集（推送的 `head_commit`、`pusher`、`repository`；PR 的 `pull_request` 的幾個欄位；dispatch 的 `inputs`）；`runner.name` 是 `GitHub Actions N`；`secrets.GITHUB_TOKEN` 直接是 `***`；`hashFiles` 依 E27 的不確定之處。
