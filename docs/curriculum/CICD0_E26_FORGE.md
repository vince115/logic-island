# CICD-0 引擎階段 E26：`forge` profile（`src/lib/terminal/forge*.ts`、`gh*.ts`）

> 2026-11-23。給 DevOps 與 CI/CD 島 CICD02「團隊 Git 工作流程」起的課：功能分支、Pull Request、審查、分支保護、三種合併方式與 repository 設定。模擬 GitHub CLI（gh 約 2.65）連到虛構的 GitHub Enterprise 式主機 `github.example`，建立在 E25 的 `git` 之上。沒有顏色、沒有互動式提問、沒有瀏覽器。E1–E25 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同（`gh` 在 `forge` profile 以下仍是 `command not found`；`git` profile 的 `git push` 沒有任何 GitHub 的 `remote:` 行）。E27–E30（workflow、Actions 的執行、secrets、environments）建立在同一個 forge 上：檢查結果目前由課程宣告，E28 之後由 Actions 的執行產生。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `FORGE_PROFILE`（RANK 26） | `git` 的一切加上指令 `gh`（`E26_COMMANDS`，只有這個 profile 有），feature `forge`。課程機器寫 `profile: 'forge'` |
| profile 以下 | `gh` 是 `command not found`（和改動前相同）；`terminalContentProblems` 對低 profile 機器上的 `gh` 報「gh is not in the … profile」；課程資料的 `forge` 欄位報 `forge needs the forge profile (engine stage E26)`；`pull-request`、`protection` 檢查報需要 forge 機器；變體的 `forge` 同樣需要 profile |
| 說明頁與 help | `gh --help`、`man gh` 印 `GH_MANUAL`；`help` 多一行 `gh auth status \| repo view \| pr …`；`gh --version` 是 `gh version 2.65.0 (2025-01-06)` 加 release 網址；沒有參數的 `gh` 印一段簡短的用法與支援的指令 |
| 不支援的指令 | `issue`、`release`、`run`、`workflow`、`secret`、`variable`、`gist`、`browse` 等說明「模擬環境不支援這個指令」並列出支援的指令（`run`、`workflow`、`secret` 在 E28–E30 加入）；不是 gh 指令的名稱是 gh 的 `unknown command "x" for "gh"` 加一行 `Usage:` |
| 主機與登入 | 機器的 gh 已經以課程的 `forge.login` 登入 `github.example`（等同設定了 `GH_HOST`，所以 `擁有者/儲存庫` 指的是 github.example）。課程的 forge 資料有錯時不建立登入，gh 印 `To get started with GitHub CLI, please run:  gh auth login`（結束碼 4） |

程式的分工：`forge-state.ts`（forge 上每個儲存庫的設定、分支保護、PR、persona 與檢查規則的資料型別；persona 的審查、檢查結果、審查決定與推送的保護判斷，都是純函式）、`forge.ts`（PR 的測試合併、數字、合併狀態與三種合併方式寫出的歷史）、`gh.ts`（選項解析、依 git remote 找儲存庫、`gh auth`、`gh repo view`、分派）、`gh-pr.ts`（`pr create`、`list`、`view`、`diff` 與找 PR）、`gh-pr-act.ts`（`pr checkout`、`review`、`checks`、`close`）、`gh-merge.ts`（`pr merge`）、`gh-api.ts`（`gh api`）、`forge-lesson.ts`（課程資料）、`forge-checks.ts`（檢查）。E25 的 `git-cli-remote.ts` 的 `git push` 在儲存庫有 forge 設定時（只有 forge profile）多做兩件事：分支保護的拒絕與新分支的 GitHub 提示。

## 2. 模型

| 項目 | 內容 |
|---|---|
| 位置 | E25 的 `FsState.git.forge` 每個裸儲存庫多一個 `site`（`ForgeSite`）；`FsState.git.account` 是 gh 登入的帳號（login、名字、email）。forge profile 的機器上每個 forge 儲存庫都有 `site`（課程沒有宣告時是預設值），所以 `gh` 對每個儲存庫都能用。`site` 是不可變的資料，指令以新物件取代，傳入的狀態不會被改動 |
| 儲存庫設定 | 學習者的權限（`admin`、`write`（預設）、`read`）、允許的合併方式（merge、squash、rebase，預設都允許）、合併後刪除分支（delete_branch_on_merge，預設否）、說明文字、預設分支（E25 的 forge head） |
| 分支保護 | 每個分支一組：要求 PR 審查（核准數 0–6、新推送時撤銷舊的核准 dismiss stale reviews）、要求的狀態檢查（contexts、strict：head 要包含 base 最新的 commit）、要求線性歷史、允許強制推送、允許刪除、管理員也適用（enforce_admins）。admin 在沒有 enforce_admins 時不受保護限制（推送與 `--admin` 合併） |
| 推送的保護 | 受保護分支的更新依序檢查：刪除（不允許時 `Cannot delete this protected branch`）、強制推送（`Cannot force-push to this branch`）、要求審查（`At least N approving review is required by reviewers with write access.`，0 個核准時是 `Changes must be made through a pull request.`）、要求檢查（被推送的 commit 已經有成功結果時允許；否則 `Required status check "test" is expected.`）、線性歷史（新的 commit 有合併 commit：`This branch must not contain merge commits.`）。拒絕時先印 `remote: error: GH006: Protected branch update failed for refs/heads/main.` 與原因，再印 git 的 `To 網址`、` ! [remote rejected] main -> main (protected branch hook declined)` 與 `error: failed to push some refs to '網址'`（結束碼 1，沒有 hint 行） |
| 新分支的提示 | 推送一個 forge 上沒有的分支（不是預設分支）時，`To` 之前印 GitHub 的四行：`remote: `、`remote: Create a pull request for 'greet' on GitHub by visiting:`、`remote:      https://github.example/擁有者/儲存庫/pull/new/greet`、`remote: ` |
| Pull Request | 編號（每個儲存庫一個計數器，課程可以設定起點；GitHub 與 issue 共用編號）、標題、內容、作者、head 與 base 分支、狀態（OPEN、CLOSED、MERGED）、建立時間、head 的歷史（每次推送到 head 分支記下新的 commit 與時間）、提交的審查（gh 或課程宣告的）、關閉時間、合併的紀錄（方式、結果 commit、合併者、時間，以及合併當時的 commit 數、增刪行數與 merge base）。刪除 head 分支（`git push --delete`、`gh pr close -d`）會關閉從它出發或合併進它的 open PR |
| persona 的審查 | 課程宣告的審查者：對每個不是自己開的 open PR，在每個 head 出現 `after` 秒後審查那個 head（核准、要求修改或留言；可以加條件：head 的某個檔案包含某段文字才核准，否則用 `otherwise` 的審查）。審查由時鐘推導、不儲存：`sleep 300` 之後 `gh pr view` 就看得到。審查時間晚於下一次推送時就不審查舊的 head；PR 關閉或合併之後不再審查 |
| 審查決定 | 每個審查者最後一個「核准／要求修改」的審查（只留言的不改變決定；只留言過的人顯示 Commented）。分支保護要求撤銷舊核准時，對不是目前 head 的核准視為 DISMISSED（gh 顯示成 Commented）。核准數是 APPROVED 的人數；有人要求修改時不能合併 |
| 檢查結果 | 課程宣告的規則：context、結論（success、failure、pending）、可以只對某個 commit（標籤）、可以加檔案內容的條件、說明與秒數。一個 commit 的每個 context 取第一條符合的規則；沒有規則就沒有那個檢查。E28 起由 Actions 的執行產生 |
| 身分與時間 | GitHub 寫的 commit（合併、squash、rebase）的提交者是 `GitHub <noreply@github.example>`，時間是機器的時鐘、時區 `+0000`；合併 commit 的作者是合併者（gh 帳號的名字與 email），squash 的作者是 PR 的作者，rebase 保留原來的作者 |

### 2.1 合併狀態與合併方式

| 項目 | 內容 |
|---|---|
| 測試合併 | base 分支最新的 commit 與 head 以 E25 的三方合併（merge-ort 的結果、xdiff 的逐行合併）合併；有衝突是 DIRTY |
| 合併狀態 | 依序：base 分支不在了（BLOCKED）、衝突（DIRTY）、要求審查而核准不足或有人要求修改（BLOCKED）、要求的檢查沒有全部成功（BLOCKED）、strict 而 head 沒有包含 base 最新的 commit（BEHIND）、有檢查失敗但不是要求的（UNSTABLE，可以合併）、其他是 CLEAN |
| `--merge` | 新的合併 commit：父 commit 是 base 最新的 commit 與 head（即使可以快轉也一定建立），訊息 `Merge pull request #8 from 擁有者/greet`、空行、PR 標題；樹是測試合併的結果。要求線性歷史的分支不能用 |
| `--squash` | 一個 commit 接在 base 最新的 commit 之後，樹是測試合併的結果。訊息（GitHub 的預設）：PR 只有一個 commit 時是那個 commit 的標題加 ` (#8)`，內容是那個 commit 的內文；多個 commit 時是 PR 標題加 ` (#8)`，內容是每個 commit 的完整訊息前加 `* `，以空行分開 |
| `--rebase` | head 上 base 沒有的 commit（不含合併 commit）依拓撲順序以三方合併一個一個接到 base 最新的 commit 之後，保留作者與作者時間、提交者是 GitHub；變成空的 commit 略過；中途衝突時 GitHub 拒絕（`This branch can't be rebased`）。即使 base 沒有前進也一律寫新的 commit（提交者換成 GitHub） |
| 合併之後 | base 分支移到結果；PR 變成 MERGED 並記下數字；學習者的 clone 要 `git pull`（或 gh 的 `--delete-branch` 代為拉取）才看得到。repository 設定 delete_branch_on_merge 時 GitHub 自動刪除 head 分支 |

## 3. 指令與格式（gh 約 2.65，終端機格式、沒有顏色）

輸出一律是 gh 在終端機（TTY）上的格式，接到管線也一樣（**決定**：真實的 gh 接到管線時改印以 Tab 分隔的機器格式，模擬環境不切換，見 §7）。選項依 pflag：`--title x`、`--title=x`、`-t x`、`-tx`，參數可以在選項之間；未知的選項是 `unknown flag: --x` 或 `unknown shorthand flag: 'x' in -x`，缺值是 `flag needs an argument: …`，都再印空行與一行 `Usage:  gh … [flags]`（結束碼 1）。成功與失敗的符號：`✓`、`X`、`!`、`-`、`+`。

儲存庫：`-R [主機/]擁有者/儲存庫`（也可以是網址）；沒有 `-R` 時依目前儲存庫的 git remote（upstream、github、origin、其他的順序，只看 github.example 的網址）。不在儲存庫裡：`failed to run git: fatal: not a git repository (or any of the parent directories): .git`；沒有 github.example 的 remote：`none of the git remotes configured for this repository point to a known GitHub host. …`；forge 上沒有：`GraphQL: Could not resolve to a Repository with the name '擁有者/儲存庫'. (repository)`；其他主機說明模擬環境只登入了 github.example。

PR 的指定：編號、`#編號`、PR 網址或 head 分支名稱；沒有參數時是目前分支的 PR（open 的優先，再來編號大的）。找不到：`no pull requests found for branch "x"`；編號不存在：`GraphQL: Could not resolve to a PullRequest with the number of 9. (repository.pullRequest)`。

| 指令 | 行為與格式 |
|---|---|
| `gh auth status` | `github.example`，再縮排兩格：`✓ Logged in to github.example account mei-lin (keyring)`、`- Active account: true`、`- Git operations protocol: https`、`- Token: gho_` 加 36 個 `*`、`- Token scopes: 'gist', 'read:org', 'repo', 'workflow'`。`gh auth login`、`logout`、`token` 等說明已經登入、Token 是秘密不顯示（結束碼 1） |
| `gh repo view [儲存庫] [-b 分支]` | 名稱、說明（沒有時 `No description provided`）、空行、README 的原文（不做 Markdown 排版；沒有時 `This repository does not have a README`）、空行、`View this repository on GitHub: 網址` |
| `gh pr create [-B base] [-H head] [-t 標題] [-b 內容] [-f]` | 沒有 `--title` 與 `--body`（或 `--fill`）時是 gh 非互動模式的錯誤（模擬環境沒有提問）。head 預設目前分支、base 預設 forge 的預設分支。head 不在 forge 上：`aborted: you must first push the current branch to a remote, or use the --head flag`；已經有 open PR：`a pull request for branch "x" into branch "main" already exists:` 加網址；沒有新的 commit：`pull request create failed: GraphQL: No commits between main and x (createPullRequest)`。有未提交的變更時先印 `Warning: 1 uncommitted change`。成功：標準錯誤印空行、`Creating pull request for greet into main in island/shop`、空行，標準輸出印 PR 網址。`--fill`：一個 commit 用它的標題與內文；多個 commit 用分支名稱（`-`、`_` 換成空白）當標題、`- 標題` 的清單當內容。`--draft`、`--reviewer`、`--label`、`--web` 說明不支援 |
| `gh pr list [-s open\|closed\|merged\|all] [-L 數量] [-B] [-H] [-A]` | 空行、`Showing 2 of 2 open pull requests in island/shop`（有篩選時 `Showing 1 of 1 pull request in island/shop that match your search`）、空行、表格 `ID  TITLE  BRANCH  CREATED AT`（欄間兩格、最後一欄不補齊），依編號由大到小；時間是 gh 的相對時間（`less than a minute ago`、`about 5 minutes ago`、`about 1 hour ago`、`about 2 days ago`…）。沒有 PR：標準錯誤 `no open pull requests in island/shop`（或 `no pull requests match your search in …`），結束碼 0 |
| `gh pr view [PR] [-c]` | `標題 擁有者/儲存庫#8`、`Open • mei-lin wants to merge 1 commit into main from greet • about 5 minutes ago`（狀態 Open、Closed、Merged）、`+1 -1 • ✓ Checks passing`（`× All checks failing`、`× 1/2 checks failing`、`- Checks pending`、`No checks`）、有審查時 `Reviewers: hua (Approved), wei (Changes requested)`（只留言或被撤銷的核准顯示 Commented）、空行、內容每行縮排兩格（沒有時 `No description provided`）、空行，`--comments` 再列每個審查（`hua requested changes • less than a minute ago` 與縮排的內容），最後 `View this pull request on GitHub: 網址`。commit 數與增刪行數是 merge base 到 head（三點 diff），合併後固定 |
| `gh pr diff [PR] [--name-only]` | merge base（合併後是合併當時的）到 head 的 git diff（E25 的格式） |
| `gh pr checkout PR [-b 分支]` | 等同 `git fetch origin +refs/heads/x:refs/remotes/origin/x`（只印那一個 ref 的 `From` 與更新行），本機沒有分支時建立追蹤分支並切換（git 自己的輸出），有時切換並 `git merge --ff-only`；head 分支已經刪除時從 `refs/pull/N/head` 建立分支 |
| `gh pr review [PR] -a\|-r\|-c [-b 內容]` | 一定要剛好一個（`need exactly one of --approve, --request-changes, or --comment`），要求修改與留言要有內容（`body cannot be blank for request-changes review`）。自己的 PR：`failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)`（要求修改是 `Can not request changes on`），留言可以。成功：`✓ Approved pull request island/shop#8`、`+ Requested changes to pull request …`、`- Reviewed pull request …` |
| `gh pr checks [PR] [--required]` | `All checks were successful`（`Some checks were not successful`、`Some checks are still pending`）、`0 cancelled, 1 failing, 0 successful, 0 skipped, and 0 pending checks`、空行、表格（標頭 `NAME  DESCRIPTION  ELAPSED  URL`，第一欄是 `✓`、`X`、`*`；失敗、等待、成功的順序，再依名稱；URL 空白）。結束碼：有失敗 1、有等待 8、其他 0。沒有檢查：`no checks reported on the 'x' branch`（1）。`--watch` 說明在 E28 |
| `gh pr merge [PR] -m\|-s\|-r [-d] [--admin]` | 一定要給方式（非互動模式）：`--merge, --rebase, or --squash required when not running interactively`；給了兩個：`only one of --merge, --rebase, or --squash can be enabled`。不能合併時：`X Pull request island/shop#8 is not mergeable: the base branch policy prohibits the merge.`（BLOCKED）、`…: the head branch is not up to date with the base branch.`（BEHIND）、`…: the merge commit cannot be cleanly created.`（DIRTY），接著一行 `--auto` 的說明；衝突時再印本機解決的指令（`gh pr checkout 8 && git fetch origin main && git merge origin/main`），BLOCKED／BEHIND 再印 `--admin` 的說明（結束碼 1）。方式不允許：`GraphQL: Squash merges are not allowed on this repository. (mergePullRequest)`；線性歷史的分支用 `--merge`：`GraphQL: Merge commits are not allowed on this protected branch. (mergePullRequest)`。成功：`✓ Merged pull request island/shop#8 (標題)`（`Squashed and merged`、`Rebased and merged`）。`-d`：目前在 head 分支時切到 base（git 的輸出不印）並 `git pull --ff-only origin main`（印 `From`、` * branch            main       -> FETCH_HEAD`、更新行與 `Updating`、`Fast-forward`、diffstat），刪除本機分支：`✓ Deleted local branch greet and switched to branch main`；刪除 forge 上的分支：`✓ Deleted remote branch greet`。已經合併：`! Pull request … was already merged`（仍可刪除分支）；已關閉：`X … can't be merged because it is closed`。`--auto`、`--subject`、`--body` 說明不支援 |
| `gh pr close PR [-d]` | `✓ Closed pull request island/shop#8 (標題)`；`-d` 刪除本機（在那個分支上時先切到預設分支）與 forge 上的分支：`✓ Deleted branch greet and switched to branch main`。已關閉：`! Pull request … is already closed`（0）；已合併：`X Pull request … can't be closed because it was already merged`（1） |
| `gh api 端點 [-X 方法] [-F 鍵=值]… [-f 鍵=值]… [--input 檔案] [--silent]` | 端點可以有開頭的 `/` 或完整的 `https://github.example/api/v3/`；`{owner}`、`{repo}`、`{branch}` 由目前的儲存庫與分支代入。`-F` 轉換 `true`、`false`、`null`、整數與 `@檔案`，`-f` 是字串；`鍵[子鍵]=值` 巢狀、`鍵[]=值` 加入陣列；有欄位或 `--input` 而沒有 `-X` 時是 POST。回應印成縮排兩格的 JSON；錯誤時同樣印回應的 JSON，標準錯誤印 `gh: 訊息 (HTTP 404)`（訊息有換行時照印），結束碼 1。支援：`user`（GET）、`repos/{owner}/{repo}`（GET；PATCH 改 `allow_merge_commit`、`allow_squash_merge`、`allow_rebase_merge`、`delete_branch_on_merge`、`description`、`default_branch`，要 admin：`Must have admin rights to Repository.`（403））、`repos/{owner}/{repo}/branches/{branch}/protection`（GET、PUT、DELETE，見下表）。其他端點說明不支援；`--jq`、`--template`、`--include`、`--verbose` 說明不支援 |

分支保護的 REST API（`gh api …/branches/main/protection`）：

| 方法 | 行為 |
|---|---|
| GET | write 以上的權限可以讀（read 是 404 `Not Found`）。回應依 GitHub 的欄位順序：`url`、有設定時的 `required_status_checks`（`url`、`strict`、`contexts`、`contexts_url`、`checks: [{ context, app_id: null }]`）、有設定時的 `required_pull_request_reviews`（`url`、`dismiss_stale_reviews`、`require_code_owner_reviews: false`、`require_last_push_approval: false`、`required_approving_review_count`）、`required_signatures`、`enforce_admins`（`url`、`enabled`）、`required_linear_history`、`allow_force_pushes`、`allow_deletions`、`block_creations`、`required_conversation_resolution`、`lock_branch`、`allow_fork_syncing`（`{ "enabled": … }`）。`url` 是 `https://github.example/api/v3/repos/擁有者/儲存庫/branches/main/protection`。沒有保護：404 `Branch not protected`；分支不存在：404 `Branch not found` |
| PUT | 要 admin（`Must have admin rights to Repository.`，403）。內容（`--input 檔案.json` 或 `-F` 欄位）一定要有 `required_status_checks`（`null` 或 `{ strict, contexts }`／`{ strict, checks: [{ context }] }`）、`enforce_admins`（布林或 `null`）、`required_pull_request_reviews`（`null` 或 `{ dismiss_stale_reviews, required_approving_review_count }`，數量預設 1、0–6）、`restrictions`（只能 `null`）；可以有 `required_linear_history`、`allow_force_pushes`、`allow_deletions`（布林或 `null`）。驗證錯誤是 422 `Invalid request.` 加空行與原因（`"restrictions" wasn't supplied.`、`For 'properties/enforce_admins', "yes" is not a boolean.`、`… 7 is greater than the maximum of 6.`、`Only organization repositories can have users and team restrictions`）；不是 JSON：400 `Problems parsing JSON`。成功回應同 GET（整個設定被取代） |
| DELETE | 要 admin；成功是 204，沒有輸出；沒有保護時 404 `Branch not protected` |

## 4. 課程資料與檢查

```ts
forge: {
  login: 'mei-lin', name?: 'Mei Lin', email?: 'mei@example.com',            // 預設：git.user 的名字與 email
  repos?: [{
    url: 'https://github.example/island/shop.git',                           // git.remotes 之一
    description?: 'The island shop', permission?: 'write',                    // admin | write | read
    allowMerge?: true, allowSquash?: true, allowRebase?: true, deleteBranchOnMerge?: false,
    protection?: [{ branch: 'main', approvals?: 1, dismissStale?: true, checks?: ['test'], strict?: false,
                    linear?: false, forcePush?: false, deletions?: false, enforceAdmins?: false }],
    personas?: [{ login: 'hua', name?: 'Lin Hua', after: 300, review: 'approve', body?: 'Looks good.',
                  when?: { path: 'app.py', includes: 'hello' }, otherwise?: { review: 'request-changes', body: 'Please greet in full.' } }],
    checks?: [{ context: 'test', conclusion: 'failure', commit?: 'c3', when?: { path: 'app.py', includes: 'TODO' }, description?: 'Tests failed', seconds?: 42 }],
    pulls?: [{ number?: 7, head: 'search', base?: 'main', title: 'Add search', body?: '…', author: 'hua', created: '2026-11-22 03:00:00',
               state?: 'open', reviews?: [{ by: 'wei', review: 'comment', body?: '…', time: '2026-11-22 04:00:00' }] }],
    next?: 8,
  }],
}
```

| 規則 | 內容 |
|---|---|
| 帳號 | `login` 是 GitHub 的登入名稱（英數字與單一連字號，最多 39 字）；名字與 email 預設取 `git.user`，沒有時是 login 與 `login@users.noreply.github.example` |
| 儲存庫 | `url` 要是 `git.remotes` 之一（各一次）；沒有列出的 forge 儲存庫用預設設定（學習者 write、三種方式都允許、沒有保護） |
| 分支保護 | `approvals`（0–6）有寫才要求 PR 審查；`dismissStale` 需要 `approvals`，`strict` 需要 `checks`；布林欄位要是 true／false |
| persona | 不能和學習者同名、彼此不重複；`after` 是 0–30 天的秒數；要求修改與留言要有 `body`；`otherwise` 需要 `when` |
| 檢查規則 | context 與結論（success、failure、pending）；`commit` 是 git 資料的 commit 標籤；`when` 是相對路徑與文字；說明最多 100 字、秒數 0–86400 |
| PR | head 與 base 是那個 forge 儲存庫的兩個不同分支（base 預設預設分支）；作者是學習者或 persona；`created` 是 UTC 的 `YYYY-MM-DD HH:MM:SS`；編號不重複（預設依序，從 1 起）；宣告的審查不能是作者自己；`next` 預設比最大的編號多一 |
| 驗證 | 低於 `forge` profile：`forge needs the forge profile (engine stage E26)`；其他錯誤依 `forge: …`、`forge repo 網址: …`、`forge repo 網址 persona hua: …`、`forge repo 網址 check test: …`、`forge repo 網址 pull #7: …` 的形式。資料有錯時不建立 forge 狀態與登入（只回報錯誤） |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'pull-request', repo, head?, base?, number?, state?, method?, approvals?, checks? }` | `repo` 是 forge 網址或 origin 指向 github.example 的本機儲存庫；以 `number`，或 `head`（加 `base`，預設預設分支）找到最新的那個 PR。`state`（open、closed、merged）、`method`（merge、squash、rebase）、`approvals`（至少幾個核准，依結束時的時鐘與撤銷規則）、`checks`（head 的檢查合起來是 success、failure 或 pending）。訊息例：`沒有從 greet 到 main 的 Pull Request`、`PR #8 是開著的（open）`、`PR #8 是以 merge 合併的`、`PR #8 還沒有合併`、`PR #8 只有 0 個核准`、`PR #8 的檢查結果是 failure`、`PR #8 沒有檢查結果` |
| `{ kind: 'protection', repo, branch, approvals?, checks?, linear?, forcePush?, absent? }` | 分支有保護（`absent`：沒有）、要求的核准數、要求的檢查包含這些 context、線性歷史、允許強制推送。訊息例：`main 沒有分支保護`、`main 的保護要求 1 個核准`、`main 的保護不要求 Pull Request 審查`、`main 的保護沒有要求檢查 lint`、`main 的保護沒有要求線性歷史`、`main 允許強制推送`、`main 還有分支保護` |

檢查都需要 forge 機器；`pull-request` 要有 `head` 或 `number`，`approvals` 是 0–6，`absent` 的 `protection` 只能和 `repo`、`branch` 一起。分支、標籤、合併後的歷史用 E25 的 `branch` 檢查（例如 `linear`、`message: '^Greet in full \\(#8\\)\\n$'`、`absent: true` 確認分支已刪除）。

**參考解答**：等待審查用 `sleep 300`（edge profile 起 `sleep` 讓時鐘前進）；`gh pr create` 一定要給 `--title` 與 `--body`（或 `--fill`），`gh pr merge` 一定要給方式。要從 gh 讀出的答案（例如 `gh api …/protection` 的 JSON）用 `output` 檢查加 `fromCommand`，並以 `TerminalVariant.forge` 給另一份設定，讓答案不能直接打出來（變體需要 forge profile：`variant x: forge needs the forge profile (engine stage E26)`）。

## 5. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e26.test.ts` | profile（git 的指令加 `gh`、多一個 feature）與分界（`git` 以下 `gh` 是 command not found、資料、檢查與變體要 forge profile、低 profile 的課用到 `gh` 時的問題、git profile 的推送沒有 GitHub 的行也沒有保護）、說明頁、help、版本、未知與不支援的指令與選項；`gh auth status` 與 Token 不顯示；依 remote、`-R` 找儲存庫與各種錯誤、`gh repo view`；CICD02 的流程：推送新分支的提示、`pr create`／`list`／`view`／`diff` 的格式、`pr create` 的錯誤（沒有標題、沒推送、已經有 PR、沒有 commit、未提交的變更、`--fill` 的多個 commit）、直接推送到受保護的 main 被拒絕（GH006）、等 persona 核准（299 秒還沒有、300 秒有）、squash 合併並刪除分支（gh 的行、`git pull` 的行、歷史、`git branch -a`）；推送的其他保護（強制推送、刪除、要求的檢查、線性歷史、admin 不受限）；三種合併方式的歷史（父 commit、訊息、作者與提交者、時間與 `+0000`、樹與測試合併相同、多個 commit 的 squash 訊息、rebase 保留作者並一律寫新的 commit）；衝突與解決後再合併；審查（自己的 PR、留言、選項規則、核准同事的 PR 再 rebase 合併、persona 要求修改直到修正、撤銷舊的核准）；檢查（失敗的要求檢查、`--required`、沒有檢查、`--watch`）；設定（不允許的方式、合併後刪除分支、線性歷史、`--admin`、非 admin 的 403）；`pr checkout`、`pr close`、刪除 head 分支關閉 PR；`gh api`（GET 的欄位與順序、404、PUT 的 `--input` 與 `-F` 巢狀欄位、各種 422 與 400、403、DELETE、repository 物件、user、佔位符、不支援的端點與 `--jq`）；三個練習（參考解答通過、典型錯誤以預期的訊息失敗）、兩種檢查的訊息與資料驗證、課程資料的驗證（資料有錯時沒有登入）、變體改變參考輸出、重播的確定性與不改動傳入的狀態 |
| `tests/support/forge-fixture.ts` | 只供測試：dev-03（forge profile、Asia/Taipei、gh 登入 mei-lin）；island/shop（main 在同事的 c3、hua 的分支 search 與 open 的 PR #7；main 受保護：1 個核准、撤銷舊核准、要求檢查 test；hua 在 300 秒後審查：app.py 有 hello 才核准，否則要求修改；app.py 有 TODO 時 test 失敗；下一個 PR 是 #8）；island/tools（沒有保護，學習者是 admin）；`~/shop` 是 c2 時的 clone；三個練習（以 PR squash 合併、讀分支保護、以 PUT 設定分支保護）與一個範例 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `forge`。所有已發布的課的 `terminalContentProblems` 仍是 `[]`，全部 44 堂終端機課在 E26 前後逐一重播比對（範例、參考解答、典型錯誤、變體的重播與檢查的結果），輸出逐位元組相同。

## 6. 只在課文說明、或不模擬的部分

- **互動與畫面**：gh 的互動式提問（沒有選項時真實的 gh 會問標題、內容、合併方式）、`--web` 與瀏覽器、顏色與分頁器、Markdown 的排版（glamour）、GitHub 的網頁畫面。
- **接到管線時的格式**：真實的 gh 在標準輸出不是終端機時改印 Tab 分隔的機器格式（`gh pr list | cat` 是 `8\tGreet in full\tgreet\tOPEN\t2026-…`），`gh api` 印不縮排的 JSON；模擬環境一律印終端機的格式。`--json`、`--jq`、`--template` 不支援（`gh run list --json` 在 E28）。
- **PR 的其他功能**：draft、指定審查者（審查者由課程的 persona 決定）、label、assignee、milestone、留言（與審查分開的 comment）、`gh pr status`／`edit`／`comment`／`ready`／`reopen`／`update-branch`、auto-merge（`--auto`）與 merge queue、自訂合併訊息（`--subject`、`--body`）、fork 與跨儲存庫的 PR、CODEOWNERS、對話解決（conversation resolution）、簽章的 commit、推送限制（組織的 team）、新的 rulesets（只模擬傳統的 branch protection）。
- **GitHub 的其他行為**：直接推送使 PR 的 commit 都進了 base 時自動標成 merged；base 分支被刪除時把 PR 改指到預設分支（模擬環境是關閉）；squash 的 `Co-authored-by:` trailer；合併後的 head commit 數與 diff 在 GitHub 的網頁上的呈現。
- **API 與帳號**：`gh api graphql`、分頁、Issue、release、webhook、`gh auth login` 的裝置流程、Token 的內容與權限範圍、SSH 金鑰；只支援 §3 列出的 REST 端點與欄位子集。
- **Actions**：檢查結果由課程宣告（沒有 check run 的網址、沒有重新執行）；workflow、執行與記錄、secrets、environments 在 E27–E30。

## 7. 沒有把握的地方（依記得的格式寫，並在此註明）

- **版本與登入**：`gh version 2.65.0 (2025-01-06)` 的日期；`gh auth status` 的五行（2.40 起的格式，印在標準輸出）、`(keyring)`、Token 遮罩的長度與 scope 清單；沒有登入時的兩行說明與結束碼 4；`-R` 的格式錯誤訊息；不在儲存庫裡的 `failed to run git: …`；`none of the git remotes …` 的完整句子。
- **選項錯誤**：cobra 在 `unknown flag` 之後印整段用法與選項清單，模擬環境只印一行 `Usage:  gh … [flags]`；`accepts 1 arg(s), received 0`。
- **gh repo view**：README 以 glamour 排版（標題、縮排與寬度），模擬環境印原文；說明與 README 之間的空行；`This repository does not have a README`。
- **gh pr create**：`Creating pull request for … into … in …` 前後的空行；非互動模式的標題錯誤的完整句子（照記得的 2.65 寫）；`Warning: 1 uncommitted change`；`aborted: you must first push …`；`already exists:` 的兩行；`No commits between`、`Title can't be blank`、`Base ref must be a branch` 的 GraphQL 錯誤形式；`--fill` 多個 commit 時的標題（分支名稱，`-`、`_` 換成空白，不改大小寫）與 `- 標題` 清單的順序（舊的在前）。
- **gh pr list**：`Showing … that match your search` 的寫法與單複數；表頭 `ID  TITLE  BRANCH  CREATED AT`；相對時間的分界（FuzzyAgo）；沒有結果時的訊息與結束碼 0；不依終端機寬度截斷標題。
- **gh pr view**：已合併或已關閉時第二行仍寫 `wants to merge`；檢查摘要的四種寫法；審查者的排列順序（依第一次審查的時間）與 `Changes requested`／`Commented` 的寫法；內容的縮排與前後的空行；真實的 gh 預設會顯示最新一則留言（`Not showing N comments` 這類分隔行），模擬環境只在 `--comments` 列出審查，且 `hua requested changes • …` 的格式是依印象寫的。
- **gh pr checks**：第一欄的標頭、`*` 表示等待中、`ELAPSED` 的格式（`1m2s`）、URL 留白、等待中的結束碼 8、`no checks reported on the 'x' branch`。
- **gh pr checkout**：只印那一個 ref 的 fetch 行（真實的是 `git fetch origin +refs/heads/x:refs/remotes/origin/x` 的輸出）；head 分支刪除後 `refs/pull/N/head` 的寫法 ` * [new ref]`。
- **gh pr review／close**：三種審查的成功訊息與符號（`✓`、`+`、`-`）；`body cannot be blank for … review`；對已合併或已關閉的 PR 核准的 GraphQL 錯誤（`Pull request is merged/closed`，依推測）；`already closed`、`can't be closed because it was already merged`、`Deleted branch … and switched to branch …`。
- **gh pr merge**：不能合併的三種原因與 `--auto`、`--admin` 兩行說明的寫法；衝突時的本機指令；方式不允許的 GraphQL 訊息（`Squash merges are not allowed on this repository.` 等）、線性歷史時 `--merge` 的訊息、rebase 衝突的 `This branch can't be rebased`；`was already merged`、`can't be merged because it is closed`；`--delete-branch` 的順序與訊息、`git pull --ff-only origin main` 的輸出是否顯示（模擬環境顯示，並印 ` * branch … -> FETCH_HEAD`）、失敗時的 `! warning: not possible to fast-forward to: "main"`；非 admin 用 `--admin` 時的錯誤（模擬環境當作沒有 `--admin`）；不刪除 `origin/greet`（要 `git fetch --prune`）。
- **推送的保護**：`GH006` 這一行與各原因的寫法（`Cannot force-push to this branch`、`Cannot delete this protected branch`、`At least 1 approving review is required by reviewers with write access.`（2 個以上用 `reviews are`）、`Changes must be made through a pull request.`、`Required status check "test" is expected.`、`2 of 3 required status checks are expected.`、`This branch must not contain merge commits.`）與檢查的順序；`(protected branch hook declined)`；admin 不受限時新的 GitHub 會印 `remote: Bypassed rule violations …`，模擬環境不印；新分支提示的四行（`remote: ` 後面的空白、`on GitHub` 在 Enterprise 主機上的寫法、網址的縮排）。
- **GitHub 寫的 commit**：提交者 `GitHub <noreply@github.example>`（GitHub Enterprise 上可能是別的名字或 email）、時區 `+0000`；合併 commit 的作者是合併者、squash 的作者是 PR 的作者（GitHub 的規則依記憶）；squash 的預設標題與內容（COMMIT_OR_PR_TITLE、COMMIT_MESSAGES）；rebase 即使 base 沒有前進也寫新的 commit；所以這些 commit 的 ID 無法和真實的 GitHub 逐字比對（樹、父 commit 與訊息的結構依 GitHub 的規則）。
- **REST API**：API 的網址 `https://github.example/api/v3`；`documentation_url` 的網址；GET 分支保護要 write 以上（真實的可能要 admin）；PUT／PATCH 的 403 訊息；422 的各種寫法（`Invalid request.` 加原因、`For 'properties/…'`）；400 `Problems parsing JSON`；repository 物件只有欄位子集、`id` 從 101 起、`owner.type`；`user` 的 `id` 1001；錯誤時印回應的 JSON 再印 `gh: … (HTTP 404)`。
- **模型的簡化**：persona 依固定秒數審查每個 head（真實的審查者是人）；被撤銷的核准顯示 Commented；審查與 PR 的時間是機器的時鐘；PR 的編號只在 PR 之間遞增（GitHub 與 issue 共用）。
