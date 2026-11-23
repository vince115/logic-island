# CICD-0 引擎階段 E25：`git` profile（`src/lib/terminal/git*.ts`）

> 2026-11-23。給 DevOps 與 CI/CD 島（CICD02 起）的版本控制課：commit、分支、合併與衝突、rebase、還原、標籤，以及推送到模擬的 GitHub（`github.example`）。依 git 2.43.0（Ubuntu 24.04 的套件），沒有顏色、沒有分頁器、沒有編輯器。E1–E24 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的訊息與 `terminalContentProblems` 在改動前後逐一重播比對，輸出相同（`git` 在 `git` profile 以下仍是 `command not found`）。新的行為只在 `git` profile 出現。E26（`gh`、Pull Request、分支保護）建立在這一層之上。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `GIT_PROFILE`（RANK 25） | `runtime` 的一切加上指令 `git`（`E25_COMMANDS`，只有這個 profile 有），feature `git`。課程機器寫 `profile: 'git'` |
| profile 以下 | `git` 是 `command not found`（和改動前相同）；`terminalContentProblems` 對低 profile 機器上的 `git` 報「git is not in the … profile」；課程資料的 `git` 欄位報 `git needs the git profile (engine stage E25)`；`branch`、`worktree`、`tag` 檢查報需要 git 機器 |
| 說明頁與 help | `git --help`、`man git` 印 `GIT_MANUAL`（模擬環境支援的子指令與模型）；`help` 多一行 `git init|clone|status|…`；`git --version` 是 `git version 2.43.0`；沒有參數的 `git` 印用法與支援的子指令 |
| 不支援的子指令 | `stash`、`cherry-pick`、`bisect`、`blame`、`worktree`、`submodule`、`clean`、`reflog` 等說明「模擬環境不支援這個指令」並列出支援的指令；不是 git 指令的名稱是 git 的 `git: 'x' is not a git command. See 'git --help'.` |

程式的分工：`git.ts`（物件、樹、歷史、xdiff 的 diff 與三方合併、`log --graph` 的 graph.c）、`git-state.ts`（機器上的 Git 狀態）、`git-core.ts`（工作目錄、ref 與修訂、設定與身分）、`git-format.ts`（diff、--stat、status 的清單）、`git-cli.ts`（分派與選項解析）、`git-cli-status.ts`、`git-cli-log.ts`、`git-cli-commit.ts`、`git-cli-switch.ts`、`git-cli-branch.ts`、`git-cli-merge.ts`、`git-cli-rebase.ts`、`git-cli-remote.ts`（各子指令）、`git-lesson.ts`（課程資料）、`git-checks.ts`（檢查）。

## 2. 模型

| 項目 | 內容 |
|---|---|
| 物件 | 真正的 Git 物件：blob、tree、commit、附註標籤（tag），依 Git 的格式序列化（tree 的項目是 `<mode> <name>\0<20 位元組>`，資料夾依「名稱加 /」排序），ID 是 `<type> <size>\0<內容>` 的 SHA-1（`tls.ts` 的 sha1）。同樣的內容、作者、時間、時區與訊息，ID 和真實的 Git 相同（測試以手算與真實 Git 的 ID 比對：空 blob `e69de29…`、空 tree `4b825dc…`、一個手算的 commit、課程 fixture 的每個 commit 與附註標籤） |
| 物件庫 | 機器上所有儲存庫與 forge 共用一個物件庫（以內容命名）；每個儲存庫記得自己「有」哪些 commit（clone、fetch、自己做的），所以只在 forge 上的 commit 在 fetch 之前不算本機的（`push` 的 fetch first 判斷用它） |
| 儲存庫 | `FsState.git.repos`：worktree 的路徑、HEAD（`refs/heads/main` 或分離時的 commit ID）、ref（`refs/heads/*`、`refs/tags/*`、`refs/remotes/<遠端>/*`）、symref（`refs/remotes/origin/HEAD`）、index（stage 0）、衝突的路徑（stage 1/2/3）、儲存庫自己的設定（`.git/config` 的內容，以正規化的鍵保存）、進行中的 merge／rebase／revert、ORIG_HEAD、`switch -` 的上一個分支、分離 HEAD 時的名稱 |
| worktree | 就是機器的檔案：儲存庫資料夾裡的檔案與符號連結（連結是 120000，目標是內容；使用者有執行權限的檔案是 100755）；`.git` 是一個佔位的資料夾（Git 自己的檔案是上述的資料，`ls .git` 是空的）；空資料夾不追蹤；裡面另有 `.git` 的資料夾是別的儲存庫，略過。`rm -rf .git` 之後那個儲存庫就不存在了。Git 寫出的檔案屬於使用者（umask），刪除檔案時一併刪除變空的資料夾 |
| `.gitignore` | 各層的 `.gitignore`（外層先、內層後，最後符合的規則決定）：`*`、`?`、`[…]`、`**/`、開頭的 `/`、結尾的 `/`（只比對資料夾）、`!` 否定、被忽略的資料夾裡的一切。`status` 不列、`add .` 不加、明確 `git add` 被忽略的檔案要 `-f` |
| 時間與時區 | commit、標籤的時間是機器的時鐘（`processes` 起固定；edge 起 `sleep` 會讓它前進），時區是機器的時區在那一刻的位移（`Asia/Taipei` 是 `+0800`，沒有設定是 `+0000`）；`git log` 的日期以各自記錄的時區顯示（`Sun Nov 22 10:00:00 2026 +0800`，日不補零） |
| 身分 | `user.name`、`user.email`：儲存庫的設定優先，其次 `~/.gitconfig`（真正的檔案，`git config --global` 依 Git 的格式寫入：`[user]` 與縮排一個 Tab 的 `name = 值`）。沒有 email 時提交失敗：`Author identity unknown` 加 `fatal: unable to auto-detect email address (got 'learner@主機.(none)')`；有 email 沒有名字是 `fatal: empty ident name (for <email>) not allowed`（128）。rebase、標籤用 Committer 的說法 |
| forge | `FsState.git.forge`：`https://github.example/<擁有者>/<儲存庫>.git` 的裸儲存庫（分支、標籤、預設分支），模擬環境的 HTTPS 憑證已經設定好（E26 再加 `gh`）。其他主機是 `Could not resolve host`，SSH 形式的網址說明只支援 https |
| 編輯器 | 沒有：`git commit` 一定要 `-m`（沒有時說明模擬環境沒有編輯器）；合併、revert 的提交採用 Git 準備好的訊息（**決定**：視同在編輯器裡直接存檔，所以 `# Conflicts:` 這類註解行不會留下）；`--amend` 沒有 `-m` 時沿用原來的訊息；rebase 的 `--continue` 沿用原來的訊息 |

### 2.1 diff 與合併

| 項目 | 內容 |
|---|---|
| diff | xdiff 的 Myers 演算法與 change compaction、indent heuristic（Git 2.14 起的預設），unified 3 行上下文、相距 6 行以內的變更合成一個 hunk、hunk 標頭的函式行（行首是英文字母、`_` 或 `$` 的行，最多 80 字元）、`\ No newline at end of file`。檔頭：`diff --git`、`new file mode`、`deleted file mode`、`old mode`／`new mode`、`index 1234567..89abcde 100644`、`---`／`+++`（新檔與刪除是 `/dev/null`）；空的新檔沒有 `---`／`+++` |
| 改名 | 只偵測內容完全相同的改名（`similarity index 100%`、`rename from`／`rename to`、`status` 的 `renamed:`、`--stat` 的 `src/{a => b}`、commit 摘要的 `rename … (100%)`）；內容也改了的改名當成刪除加新增 |
| --stat | 80 欄，Git 的名稱與圖形寬度分配（超過時名稱以 `...` 截斷、圖形依比例縮放）；摘要行 `N files changed, X insertions(+), Y deletions(-)`（兩者都是 0 時都印） |
| 三方合併 | merge-ort 的結果（不偵測改名）：只有一邊改的檔案取那一邊；兩邊都改的以 xdiff 的三方合併（histogram diff、zealous 精簡）逐行合併——改到不同的行自動合併，改到同一區（或相鄰）的行是衝突，標記 `<<<<<<< HEAD`、`=======`、`>>>>>>> 名稱`；兩邊新增同名不同內容是 add/add；一邊刪除一邊修改是 modify/delete（修改的版本留在 worktree） |
| 決定：衝突的模型 | 計畫原本寫「單一衝突區（共同前後綴之間）」的簡化模型；前一位實作者已經把 xdiff 的三方合併移植過來，這次以真實的 Git 2.56 做差異測試（16 組隨機的三方內容與多個手寫情境，diff、--stat、合併結果、衝突標記逐字相同），所以採用真正的逐行合併。差別：分開的修改會自動合併（這正是課程要教的），一個檔案可以有多個衝突區。共同祖先有多個時（交叉合併）只用第一個，不做 recursive |
| 衝突的標籤 | merge：`HEAD` 與打的名稱（`feature`、`origin/main`）；`git pull` 的合併：對方的完整 commit ID；rebase：`HEAD` 與 `1a2b3c4 (訊息)`；revert：`HEAD` 與 `parent of 1a2b3c4 (訊息)` |

## 3. 指令與格式（git 2.43.0）

所有子指令都可以用 `git -C 路徑 子指令`；路徑依 Git 的習慣相對於目前的目錄顯示（`../a.txt`）。選項依 Git 的 parse-options：短選項可以合寫（`-am 訊息`），長選項可以寫 `--message=x`；未知的選項是 ``error: unknown option `x'`` 或 ``error: unknown switch `x'`` 加一行 `usage: git 子指令 …`（129）。不在儲存庫裡是 `fatal: not a git repository (or any of the parent directories): .git`（128）。

| 指令 | 行為與格式 |
|---|---|
| `git init [-b 分支] [-q] [資料夾]` | `Initialized empty Git repository in /路徑/.git/`；已經是儲存庫：`Reinitialized existing Git repository in …`。分支依 `-b`、`init.defaultBranch`，都沒有時是 master，並先印一行 `hint: Using 'master' as the name for the initial branch.`（真實的提示有好幾行，見 §7） |
| `git clone [-b 分支] 網址 [資料夾]` | 標準錯誤印 `Cloning into 'shop'...`（**不印**遠端的進度行，見 §6），建立資料夾、`.git`、`origin` 的設定與 `origin/*`、`origin/HEAD`、標籤，檢出預設分支並設定上游。錯誤：`fatal: destination path 'x' already exists and is not an empty directory.`；`remote: Repository not found.` 加 `fatal: repository '網址/' not found`；`fatal: unable to access '網址/': Could not resolve host: 主機`；空的儲存庫：`warning: You appear to have cloned an empty repository.` |
| `git config [--global\|--local] [--list\|--get\|--unset] 鍵 [值]` | 讀：儲存庫的設定優先，找不到結束碼 1；`--list` 先列 `~/.gitconfig` 再列儲存庫的（`core.repositoryformatversion=0` 等 git init 寫的四項、`remote.origin.*`、`branch.*.remote`／`merge`）；不在儲存庫裡設定 local：`fatal: not in a git directory`；`error: key does not contain a section: x`；`--unset` 找不到結束碼 5。支援的設定：`user.name`、`user.email`、`init.defaultBranch`、`pull.rebase`、`pull.ff`、`branch.<名稱>.rebase`、`fetch.prune`（其他的照樣保存與列出，不影響行為） |
| `git status [-s] [-b]` | 長格式：`On branch main`、上游的狀態（`Your branch is up to date with 'origin/main'.`、`ahead of … by 1 commit.` 加 `(use "git push" …)`、`behind … and can be fast-forwarded.`、`have diverged,` 兩行加提示、`the upstream is gone.`，後面空一行）、`No commits yet`、合併中（`You have unmerged paths.`／`All conflicts fixed but you are still merging.`）、`Changes to be committed:`（標籤寬 12：`new file:   `、`modified:   `、`deleted:    `、`renamed:    a -> b`；合併中不印提示行）、`Unmerged paths:`（寬 17：`both modified:   `、`deleted by them: `…）、`Changes not staged for commit:`、`Untracked files:`（沒有追蹤任何檔案的資料夾只列 `dir/`），最後 `no changes added to commit (…)`、`nothing added to commit but untracked files present (…)`、`nothing to commit, working tree clean`。分離的 HEAD：`HEAD detached at v1.0`（之後又提交是 `from`）。短格式：`XY 路徑`、`?? 路徑`、`R  a -> b`、`UU`／`AA`／`UD`／`DU`；`-b` 的 `## main...origin/main [ahead 1, behind 2]`、`## No commits yet on main`、`## HEAD (no branch)` |
| `git add [-A] [-u] [-f] [路徑…]` | 路徑、資料夾、`.`、引號裡的萬用字元（`'*.txt'`，`*` 跨越 `/`）；刪除的檔案也會加入（記錄刪除）；解決衝突。沒有參數：`Nothing specified, nothing added.` 加 `hint: Maybe you wanted to say 'git add .'?`；`fatal: pathspec 'x' did not match any files`（128）；被忽略：`The following paths are ignored by one of your .gitignore files:`、路徑、`hint: Use -f if you really want to add them.`（1） |
| `git restore [-S] [-W] [-s 修訂] 路徑…` | 預設從 index 還原 worktree；`--staged` 從 HEAD 還原 index（新加的檔案取消暫存）；`error: pathspec 'x' did not match any file(s) known to git`；衝突中的檔案：`error: path 'x' is unmerged` |
| `git rm [-r] [--cached] [-f] 路徑…`、`git mv [-f] 來源… 目的地` | rm 每個檔案印 `rm 'path'`（儲存庫內的路徑）；資料夾要 `-r`；有本機修改或暫存的變更時拒絕（`error: the following file has local modifications:` 等，加一行提示）。mv 移動檔案或資料夾與 index；`fatal: bad source, source=…, destination=…`、`not under version control`、`destination exists` |
| `git commit [-a] [-m 訊息]… [--amend] [--no-edit] [--allow-empty] [-q]` | `[main 1a2b3c4] 訊息`（第一個 commit 加 `(root-commit)`、分離的 HEAD 是 `detached HEAD`），接著 ` 2 files changed, 3 insertions(+), 1 deletion(-)` 與 ` create mode 100644 x`、` delete mode`、` rename a => b (100%)`、` mode change 100644 => 100755 x`；合併 commit 只有第一行；`--amend` 多一行 ` Date: …`（作者日期），作者與提交者不同時多一行 ` Author: …`。多個 `-m` 是不同段落；訊息依 Git 的 whitespace 規則整理。沒有東西可以提交：印長格式的 status，結束碼 1；空訊息：`Aborting commit due to empty commit message.`；還有衝突：先列 `U\t路徑`，再 `error: Committing is not possible because you have unmerged files.`、一行提示、`fatal: Exiting because of an unresolved conflict.`（128）；`-a` 會把衝突的檔案（worktree 的內容）一起加入 |
| `git log [--oneline] [--graph] [--all] [--decorate] [-n N\|-N] [-p] [--stat] [--format=…] [--first-parent] [--reverse] [修訂… \| A..B \| ^A] [-- 路徑…]` | 預設格式 `commit <ID> (HEAD -> main, tag: v1.0, origin/main, origin/HEAD)`、`Merge: a b`、`Author:`、`Date:   `、空行、縮排 4 格的訊息，commit 之間空一行。順序依提交時間（同時間依走到的順序，Git 的優先佇列），`--graph` 依 Git 的拓撲順序並畫 graph.c 的線（`*`、`|\`、`|/`、`|_` 與收合線，含行尾空白）。裝飾在終端機上顯示（log.decorate=auto；接到管線時不顯示）：HEAD 在前，其餘依完整 ref 名稱的反向順序。`-p`、`--stat` 在訊息後空一行（`--oneline` 不空），合併 commit 不印 diff。`--format`：`%H %h %T %t %P %p %an %ae %ad %cn %ce %cd %s %b %B %d %D %n %%`；`--pretty=oneline`。路徑：只列改到那些路徑的 commit（合併 commit 要和每個父 commit 都不同才列）。空的分支：`fatal: your current branch 'main' does not have any commits yet` |
| `git show [--stat] [-s] [--oneline] [--format=…] [修訂… \| 修訂:路徑]` | commit 同 `log -p -1`（合併 commit 只有標頭，見 §6）；附註標籤先印 `tag v1.0`、`Tagger:`、`Date:`、訊息，再印 commit；`HEAD:路徑` 印檔案內容；`fatal: path 'x' does not exist in 'HEAD'` |
| `git diff [--staged\|--cached] [--stat] [--name-only] [--name-status] [--shortstat] [修訂 [修訂] \| A..B \| A...B] [-- 路徑…]` | 預設 index 對 worktree（只看追蹤的檔案），`--staged` HEAD 對 index，一個修訂是它對 worktree，兩個或 `A..B` 是兩者之間，`A...B` 是共同祖先對 B；衝突中的路徑印 `* Unmerged path x`。分不出修訂或路徑：`fatal: ambiguous argument 'x': unknown revision or path not in the working tree.`（見 §7）；`@{u}` 沒有上游：`fatal: no upstream configured for branch 'x'` |
| `git branch [-a] [-r] [-v] [-vv] [--list 樣式]` | `* main`、`  feature`；分離時第一行 `* (HEAD detached at 1a2b3c4)`，rebase 中 `* (no branch, rebasing feature)`；`-a` 的 `  remotes/origin/HEAD -> origin/main`；`-v` 的名稱補齊到同寬、`[ahead 1, behind 2]`，`-vv` 的 `[origin/main: ahead 1]`、`[origin/x: gone]` |
| `git branch 名稱 [起點]`、`-d\|-D`、`-m\|-M`、`-u`、`--unset-upstream`、`--show-current` | 從遠端追蹤分支建立時設定上游並印 `branch 'x' set up to track 'origin/x'.`；`fatal: a branch named 'x' already exists`；`fatal: 'x' is not a valid branch name`。刪除：`Deleted branch x (was 1a2b3c4).`；`error: branch 'x' not found`；`error: cannot delete branch 'main' used by worktree at '/路徑'`；沒有合併進上游（沒有上游時是 HEAD）：`error: the branch 'x' is not fully merged` 加 `hint: If you are sure you want to delete it, run 'git branch -D x'` |
| `git switch [-c\|-C 分支 [起點]] [--detach] [-f] [-q] [分支\|-]` | `Switched to branch 'x'`、`Switched to a new branch 'x'`、`Already on 'x'`（標準錯誤），之後印上游的狀態；帶著的本機修改先列 `M\t路徑`。只有 `origin/x` 時自動建立追蹤分支。修訂不是分支：`fatal: a branch is expected, got commit '…'`（tag、remote branch）加一行提示；`fatal: invalid reference: x`；`switch -` 沒有上一個分支：`fatal: invalid reference: @{-1}`。會覆蓋本機修改：`error: Your local changes to the following files would be overwritten by checkout:`、檔案、`Please commit your changes or stash them before you switch branches.`、`Aborting`；未追蹤的檔案擋路是對應的 `untracked working tree files` 訊息；有衝突：`x: needs merge` 加 `error: you need to resolve your current index first`。離開分離的 HEAD：`Previous HEAD position was 1a2b3c4 訊息`，有 commit 會遺失時是 `Warning: you are leaving N commit(s) behind, …` 與那些 commit |
| `git checkout [-b\|-B 分支] [-f] [--detach] [分支\|修訂]`、`git checkout [修訂] -- 路徑…` | 分支同 switch；修訂是分離的 HEAD：`Note: switching to 'x'.`、空行、`You are in 'detached HEAD' state.`、空行、`HEAD is now at 1a2b3c4 訊息`（真實的說明有十幾行，見 §7）；路徑：`Updated 1 path from the index`、`Updated 1 path from 1a2b3c4` |
| `git merge [--no-ff\|--ff-only] [-m 訊息] [--no-edit] [--abort\|--continue] [修訂]` | 已經包含：`Already up to date.`；快轉：`Updating a..b`、`Fast-forward`、diffstat、create mode 行；三方合併：`Auto-merging x`、`Merge made by the 'ort' strategy.`、diffstat；衝突：`Auto-merging x`、`CONFLICT (content): Merge conflict in x`（`add/add`、`modify/delete: x deleted in feature and modified in HEAD.  Version HEAD of x left in tree.`）、`Automatic merge failed; fix conflicts and then commit the result.`（1）；之後 `git add`／`git rm` 解決、`git commit`（或 `merge --continue`）完成，`merge --abort` 回到合併前（追蹤的檔案；未追蹤的留著）。預設訊息依 fmt-merge-msg：`Merge branch 'x'`、`Merge remote-tracking branch 'origin/x'`、`Merge tag 'v1'`、`Merge commit '…'`，目前的分支不是 main 或 master 時加 ` into 分支`。錯誤：`merge: x - not something we can merge`、`fatal: refusing to merge unrelated histories`、`fatal: Not possible to fast-forward, aborting.`、`error: Merging is not possible because you have unmerged files.`、`fatal: You have not concluded your merge (MERGE_HEAD exists).`、`fatal: There is no merge to abort (MERGE_HEAD missing).`、本機修改擋路（`…would be overwritten by merge:`） |
| `git rebase [上游]`、`--continue`、`--skip`、`--abort` | 分支上游沒有的 commit（不含合併 commit、內容和上游已有的 commit 相同的略過）依序以 cherry-pick 接到上游之後，保留作者與作者時間、提交者是自己。成功：`Successfully rebased and updated refs/heads/x.`（快轉也是）；已經在上游之上：`Current branch x is up to date.`；衝突：`Auto-merging`、`CONFLICT`，`error: could not apply 1a2b3c4... 訊息`、一行提示、`Could not apply 1a2b3c4... 訊息`（1），status 是 `interactive rebase in progress; onto 1a2b3c4` 與 `You are currently rebasing branch 'x' on '1a2b3c4'.`；`--continue` 印 `[detached HEAD 1a2b3c4] 訊息` 與摘要再繼續，還有衝突時 `x: needs merge` 與兩行說明，沒有變更：`No changes - did you forget to use 'git add'?` 加一行提示；`--abort` 回到原來的分支；`fatal: no rebase in progress`；有未提交的變更：`error: cannot rebase: You have unstaged changes.`（或 `Your index contains uncommitted changes.`）與 `error: Please commit or stash them.` |
| `git revert [--no-edit] [-m 父] 修訂`、`--continue`、`--abort` | 新的 commit `Revert "訊息"`、空行、`This reverts commit <完整 ID>.`（合併 commit 加 `, reversing` 換行 `changes made to <父>.`），摘要多一行 ` Date:`；衝突：`error: could not revert 1a2b3c4... 訊息` 加一行提示（1）；合併 commit 沒有 `-m`：`error: commit … is a merge but no -m option was given.` 加 `fatal: revert failed`；有衝突的檔案：`error: Reverting is not possible because you have unmerged files.` |
| `git reset [--soft\|--mixed\|--hard] [修訂]`、`git reset [修訂] -- 路徑…` | `--hard`：`HEAD is now at 1a2b3c4 訊息`；`--mixed`（預設）有未暫存的變更時印 `Unstaged changes after reset:` 與 `M\t路徑`；設定 ORIG_HEAD，結束進行中的 merge 或 revert。`--merge`、`--keep` 說明不支援 |
| `git tag [-l [樣式]] [-n]`、`git tag 名稱 [修訂]`、`git tag -a 名稱 -m 訊息 [修訂]`、`git tag -d 名稱` | 列表依名稱排序，`-n` 補齊到 15 欄加訊息第一行；`-m` 即是附註標籤（需要身分）；`-a` 沒有 `-m` 說明沒有編輯器；`fatal: tag 'v1' already exists`；`Deleted tag 'v1' (was 1a2b3c4)` |
| `git describe [--tags] [--always] [--abbrev=N] [--long] [修訂]` | 最近的標籤（預設只用附註標籤）：剛好在上面是名稱，否則 `v1.0-2-g1a2b3c4`（距離是修訂有而標籤沒有的 commit 數；同距離時附註優先、再來較新的）；`fatal: No names found, cannot describe anything.`、`fatal: No annotated tags can describe '…'.` 加 `However, there were unannotated tags: try --tags.` |
| `git remote [-v]`、`add`、`remove`、`rename`、`set-url`、`get-url` | `origin\t網址 (fetch)`／`(push)`；`error: remote origin already exists.`（3）；`error: No such remote: 'x'`（2） |
| `git fetch [遠端] [--prune] [--tags] [--all]` | 有更新時標準錯誤印 `From https://github.example/擁有者/儲存庫`（去掉 `.git`），再依序印更新的分支 `   a..b  main       -> origin/main`（強制更新是 ` + a...b … (forced update)`）、新分支 ` * [new branch]      x          -> origin/x`、指向已有 commit 的新標籤 ` * [new tag]         v1         -> v1`；名稱欄至少 10 字元；`--prune` 的 ` - [deleted]         (none)     -> origin/x` 在最前面；沒有更新時什麼也不印 |
| `git push [-u] [-f] [--force-with-lease] [--tags] [-d\|--delete] [--all] [遠端 [來源[:目的地]…]]` | 標準錯誤印 `To 網址` 與每個 ref：`   a..b  main -> main`、` * [new branch]      x -> x`、` * [new tag]         v1 -> v1`、` - [deleted]         x`、` + a...b main -> main (forced update)`、` ! [rejected]        main -> main (fetch first)`（遠端有本機沒有的 commit）、`(non-fast-forward)`（本機知道但落後）、`(stale info)`（`--force-with-lease` 而 `origin/x` 不是遠端現在的位置）、`(already exists)`（標籤）；被拒絕時 `error: failed to push some refs to '網址'` 加一行提示（1）。成功後更新 `origin/*`；`-u` 印 `branch 'x' set up to track 'origin/x'.`；都一樣：`Everything up-to-date`。沒有上游：`fatal: The current branch x has no upstream branch.` 加一行 `    git push --set-upstream origin x`（128）；`fatal: No configured push destination.`；`error: src refspec x does not match any` |
| `git pull [--rebase\|--no-rebase] [--ff-only] [--no-ff] [遠端 [分支]]` | 先 fetch（印它的行），再：已經包含 `Already up to date.`；能快轉就快轉（`--rebase` 也是）；分岔時依 `--rebase`／`--no-rebase`／`--ff-only` 或 `pull.rebase`、`pull.ff`、`branch.x.rebase`；都沒有設定：`hint: You have divergent branches and need to specify how to reconcile them.` 加 `fatal: Need to specify how to reconcile divergent branches.`（128；真實的提示有十幾行，見 §7）；合併的訊息 `Merge branch 'main' of https://github.example/擁有者/儲存庫`；沒有上游：`There is no tracking information for the current branch.`、`Please specify which branch you want to merge with.`、`    git branch --set-upstream-to=origin/<branch> x`（1） |
| `git rev-parse [--short] [--abbrev-ref] [--show-toplevel] [--verify] 修訂…`、`git cat-file -t\|-s\|-p 物件` | 給指令稿與好奇的學習者：ID、分支名稱、儲存庫的頂層；物件的類型、大小與內容（tree 以 `100644 blob <ID>\t名稱` 列出） |

修訂的寫法：分支、標籤、`origin/x`、`refs/…`、至少 4 個十六進位字的 ID 前綴、`HEAD`／`@`、`ORIG_HEAD`、`MERGE_HEAD`、`x@{u}`／`@{upstream}`、`~N`、`^N`。ID 縮寫是 7 個字，不唯一時加長。

## 4. 課程資料與檢查

```ts
git: {
  user?: { name: 'Mei Lin', email: 'mei@example.com' },        // 寫成 ~/.gitconfig（課程自己列了這個檔案時不寫）
  commits?: [{ id: 'c1', parents?: ['c0'], message: 'Initial commit', files?: { 'README.md': '# shop\n', 'old.txt': null },
               executable?: ['run.sh'], author?: { name, email }, time: '2026-11-20 01:00:00', tz?: '+0800', committer?: { name, email, time? } }],
  remotes?: [{ url: 'https://github.example/island/shop.git', branches: { main: 'c3', feature: 'f1' }, head?: 'main',
               tags?: [{ name: 'v0.1', at: 'c1', message?: 'First release', tagger?, time? }] }],
  repos?: [{ path: '/home/learner/shop', origin?: 'https://github.example/island/shop.git', branches?: { main: 'c2' }, head?: 'main',
             tracking?: { main: 'c2' }, upstream?: ['main'], tags?: [...], staged?: { 'a.txt': '…' }, config?: { 'pull.rebase': 'false' } }],
}
```

| 規則 | 內容 |
|---|---|
| commit | 以標籤（`id`）命名，引擎算出真正的 ID（作者用 commit 自己的，或 `git.user`，或 `Logic Island <island@github.example>`；提交者預設是作者；時間是 UTC 的 `YYYY-MM-DD HH:MM:SS`；時區預設是機器的時區）。`parents` 預設是前一個列出的 commit，`[]` 是新的根；`files` 是相對第一個父 commit 的變更（內容或 `null` 刪除），快照由引擎算出。最多 60 個 commit、每個 40 個檔案；路徑是相對、正規化、不含 `.git` 的路徑，不能同時是檔案與資料夾 |
| forge | 網址必須是 `https://github.example/<擁有者>/<儲存庫>.git`；`branches` 可以是空的（空的儲存庫）；`head` 預設 main（沒有就是第一個分支） |
| 儲存庫 | `path` 是絕對路徑（不能互相包含），資料夾沒有列出時由引擎建立（家目錄裡的屬於使用者）；worktree 是 HEAD 的檔案加上 `staged`，課程自己列出的同路徑檔案就是本機的修改；有 `origin` 時 `branches` 預設是 forge 的預設分支、`tracking`（`origin/*` 上次 fetch 到的位置）預設是 forge 現在的分支、`upstream` 預設是 HEAD 的分支、`tags` 預設是 forge 上指向儲存庫已有 commit 的標籤；`head` 可以是 commit 的標籤（分離的 HEAD） |
| 驗證 | 低於 `git` profile：`git needs the git profile (engine stage E25)`；其他錯誤依 `git commit c1: …`、`git remote 網址: …`、`git repo 路徑: …` 的形式（標籤重複、父 commit 不存在、時間或時區格式、路徑、執行檔不是寫出的檔案、名字或 email、分支與標籤名稱、URL、head、origin、upstream、staged、config 的鍵）。資料有錯時不建立 Git 狀態（只回報錯誤） |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'branch', repo, name, remote?, absent?, file?: { path, content \| includes }, message?, parents?, linear?, includes? }` | `repo` 是 worktree 的路徑或 forge 的網址；`remote: true` 看這個儲存庫的 origin 在 forge 上的分支。分支存在（`absent`：不存在）、最新 commit 的檔案內容（全文或包含的文字）、訊息符合正規表示式、父 commit 的數目（2 是合併 commit）、`linear`（true：歷史沒有合併 commit；false：至少有一個）、`includes`（包含這個 commit：課程 commit 的標籤，或在那個儲存庫裡解析的名稱）。訊息例：`它的最新 commit 裡 config.yml 的內容不同`、`它沒有包含 c3`、`它的歷史有合併 commit`、`它最新的 commit 是「…」`、`沒有分支 x`、`分支 x 還在` |
| `{ kind: 'worktree', repo, clean?, branch? }` | `clean: true`：`git status` 是 working tree clean（沒有暫存、未暫存、衝突、未追蹤的檔案，也沒有進行中的 merge／rebase／revert）；`branch`：HEAD 在這個分支上。訊息例：`還有沒提交的變更`、`合併還沒有完成`、`還有沒追蹤的檔案`、`目前在分支 topic`、`HEAD 是分離的（detached HEAD）` |
| `{ kind: 'tag', repo, name, at?, remote?, annotated?, absent? }` | 標籤存在、指向的 commit（附註標籤取它指向的 commit）、是否附註標籤。訊息例：`它是輕量標籤`、`它指向 1a2b3c4 訊息`、`沒有標籤 v1.0` |

檢查都需要 git 機器；名稱要是合法的 ref 名稱、`message` 要是正規表示式、`file` 要有相對路徑與 `content` 或 `includes` 之一、`parents` 是 0–2、`absent` 只能和 `repo`、`name`、`remote` 一起、`worktree` 要是本機的儲存庫並且有 `clean` 或 `branch`。

**參考解答的結束碼**：`remote` profile 起參考解答的每個指令都要成功（結束碼 0），所以會產生衝突的步驟寫成 `git merge topic || true`（scripting 起提示字元就是 Bash 直譯器），再編輯檔案、`git add`、`git commit --no-edit`。答案要從輸出讀出時用既有的 `output` 檢查（例如 `git log --format=%h -1`），commit ID 由引擎依資料算出，作者照 Docker digest 的方式從重播的輸出抄進課文。

**變體**：`TerminalVariant.git` 以另一份 git 資料取代機器的（例如另一個 commit 訊息，ID 就不同），讓從 `git log` 讀出的答案不能直接打出來；需要 `git` profile（`variant x: git needs the git profile (engine stage E25)`）。時間不同的變體用既有的 `now`。

## 5. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e25.test.ts` | profile（runtime 的指令加 `git`、多一個 feature）與分界（`runtime` 以下 `git` 是 command not found、資料與檢查要 `git` profile、低 profile 的課用到 `git` 時的問題）、說明頁、help、版本、未知與不支援的子指令；物件 ID（空 blob、`hello\n`、空 tree、以 Node 的 SHA-1 從物件格式手算的 commit、tree 的排序與 100755、fixture 每個 commit 與附註標籤和真實 Git 相同）；init、status（未追蹤、No commits yet、暫存、未暫存、短格式）、add、commit 的摘要與真實 Git 的 ID、diff、--stat、show、新檔／刪除／空檔／改名／模式的 diff 與 status、commit 的錯誤、`--amend` 的 Date 與 Author 行；switch、快轉合併、branch -v／-d、內容與 modify/delete 衝突（標記、status、-s、diff --cached、commit 被拒、--abort）、解決後的合併 commit（真實 Git 的 ID）與 `log --graph`、不同行的自動合併、--ff-only／--no-ff、合併的各種拒絕、帶著本機修改切換、覆蓋時拒絕、分離的 HEAD；rebase 的衝突（標記的名稱）、--continue（ID 和真實 Git 相同）、--abort、--skip、up to date、未提交的變更；revert（訊息、Date 行、衝突、合併要 -m、`reversing` 的訊息）；reset --soft／--mixed／--hard、restore、`@{u}` 沒有上游；forge：fetch 的行、fetch first 與 non-fast-forward、pull 的分岔錯誤、--ff-only、pull.rebase、快轉、合併的訊息與以 ID 標示的衝突、新分支沒有上游、`push -u`、--tags、--delete、--force-with-lease 的 stale info 與強制更新、clone（檔案、origin/HEAD、錯誤、空的儲存庫、`-b`、SSH 網址）、remote add／-v／rename／remove、推送到空的儲存庫、fetch --prune；身分錯誤與 `~/.gitconfig` 的格式、設定的優先順序與錯誤、config 檔案的解析與寫入；三個練習（參考解答通過、典型錯誤以預期的訊息失敗）、branch／worktree／tag 檢查的各個欄位與訊息、檢查資料的驗證；課程資料的驗證、worktree 的建立（本機修改、staged、執行檔、分離的 HEAD）、不改動傳入的狀態與重播的確定性；變體 |
| `tests/support/git-fixture.ts` | 只供測試：dev-01（`git` profile、Asia/Taipei）；forge 上的 island/shop（main 在同事的 c3、feature、附註標籤 v0.1）與空的 island/empty；`~/shop` 是 c3 之前的 clone（main 與 origin/main 都在 c2）；`~/notes` 沒有遠端，main 與 topic 改了同一行；真實 Git 對這些 commit 算出的 ID（`REAL_IDS`）；三個練習（整合同事的變更後推送、解決合併衝突、發布附註標籤）與一個範例 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `git`。所有已發布的課的 `terminalContentProblems` 仍是 `[]`，全部 44 堂終端機課在 E25 前後逐一重播比對，輸出相同。

開發時另以真實的 Git（2.56）在暫存資料夾做差異比對（不放進儲存庫）：init 到 tag 的基本流程、合併衝突、rebase、revert、reset、改名與模式、`.gitignore`、子資料夾的相對路徑、`log -- 路徑`、`show 修訂:路徑`、`A..B`／`A...B`、branch -m、describe、rev-parse、cat-file，以及 16 組隨機的三方內容（diff、--stat、合併、衝突標記），除了 §7 列出的較新版本的差異與刻意縮短的提示之外逐字相同。

## 6. 只在課文說明、或不模擬的部分

- **進度行**：`clone`、`fetch`、`push` 的 `remote: Enumerating objects…`、`Receiving objects…`、`Writing objects…`、`Delta compression…`，以及 rebase 的 `Rebasing (1/2)`（真實的 Git 在終端機上會印，模擬環境不印）。
- **編輯器與互動**：`git commit` 沒有 `-m`、`git rebase -i`、`git add -p`、`git commit --amend` 的編輯、`git tag -a` 沒有 `-m`；分頁器（`git log` 一次印完）；顏色。
- **合併的細節**：改名偵測（合併、status、diff 只認內容完全相同的改名）、交叉合併的 recursive 共同祖先、octopus 合併、`--squash`（E26 的 PR 合併方式）、合併 commit 的 combined diff（`git show` 合併 commit 只印標頭，`git diff` 在衝突中只印 `* Unmerged path`）、合併時其他已暫存的變更（模擬環境只檢查會被改到的檔案）。
- **指令**：`stash`、`cherry-pick`、`bisect`、`blame`、`reflog`（`HEAD@{1}` 這類寫法）、`worktree`、`submodule`、`clean`、`branch -c`、`^{tree}` 這類修訂寫法、`push --all` 以外的 refspec 萬用字元、SSH 遠端與金鑰（E26 的 `gh auth` 會說明憑證）、GitHub 在 push 新分支時印的 `remote: Create a pull request…`（E26）。
- **檔案系統**：權限（模擬環境的 Git 不檢查資料夾的寫入權限）、`.git` 裡的實際檔案（HEAD、config、objects）、`core.autocrlf` 與換行、二進位檔案、大檔案、移動整個儲存庫資料夾（儲存庫依路徑記錄，`mv` 之後就找不到）。

## 7. 沒有把握的地方（依記得的格式寫，並在此註明）

- **刻意縮短的提示（真實的 Git 印好幾行）**：`git init` 預設分支的提示（只印第一句）；`git checkout <commit>` 的 detached HEAD 說明（只印 `You are in 'detached HEAD' state.`）；推送被拒的 hint（以一行自己的話說明：先整合再推送）；`git pull` 分岔的 hint（只印第一行）；沒有上游時 `git push` 的說明（只印 `git push --set-upstream …` 那一行）；`git pull` 沒有追蹤資訊（三行）；rebase 與 revert 衝突的 hint（各一行）；`git commit` 有衝突時的 hint（只印第一行）；`git switch` 期待分支時的 hint；`git status` 在 rebase 中的 `Last command done`、`Next command to do` 等列表與 `--skip`／`--abort` 的提示行；`advice.*` 的 `Disable this message with …` 行一律不印。
- **2.43 與較新版本的差異**：比對用的是 Git 2.56。依記憶 2.43 的 rebase 待辦清單沒有 `# `（`Could not apply 1a2b3c4... 訊息`，模擬環境照這個寫，2.56 是 `... # 訊息`）；`fatal: no rebase in progress`（舊版是 `No rebase in progress?`）；`error: cannot delete branch 'main' used by worktree at …`、`error: branch 'x' not found`、`error: the branch 'x' is not fully merged` 的大小寫與 hint 的形式；`git config` 沒有 section 的鍵的結束碼（照 2.56 的 1）；分岔時 status 的提示 `(use "git pull" if you want to integrate the remote branch with yours)`（較舊的版本是另一句）；`git revert` 的摘要有 ` Date:` 行、`git commit --amend` 的第一個 commit 不標 `(root-commit)`，都是照 2.56 觀察到的。
- **remote 的格式**：`git fetch` 名稱欄的寬度（至少 10，依最長的名稱）、更新／新分支／標籤的順序；`git clone` 經由 HTTPS 時的訊息；`remote: Repository not found.` 與 `fatal: repository '…/' not found`（GitHub 的回應）；`Could not resolve host`；SSH 形式的網址在模擬環境的錯誤；`--force-with-lease` 被拒時的 `(stale info)`；推送已存在的標籤 `(already exists)`；推送時遠端有本機已知但不包含的 commit 時是 `non-fast-forward`、本機不知道時是 `fetch first` 的判斷；推送後一併更新 `origin/*`。
- **其他訊息**：`fatal: empty ident name (for <…>) not allowed`（Ubuntu 上沒有 GECOS 名字時）；`Author identity unknown` 之後只印 `fatal: unable to auto-detect email address (got '使用者@主機.(none)')`（真實的中間有一段設定說明）；rm 的 `staged content different from both the file and the HEAD`；`git mv` 的 `destination '…' is not a directory`；`git reset` 帶路徑的 `Cannot do soft reset with paths.`；`fatal: Cannot do a soft reset in the middle of a merge.`；`merge --continue` 沒有合併時的訊息；`git merge` 被本機修改擋下時的結束碼（模擬環境：三方合併是 2、快轉是 1）；`Warning: you are leaving N commits behind` 之後真實的建議段落（不印）；`git describe` 同距離時的選擇（附註優先，再來較新的 commit）。
- **行為的簡化**：status 的未追蹤資料夾依「沒有任何追蹤的檔案」收合；`log -- 路徑` 不做 Git 的歷史簡化與父 commit 改寫（合併 commit 要和每個父 commit 都不同才列）；rebase 略過「內容與上游的某個 commit 完全相同」的 commit（真實的用 patch-id，並可能印 `skipped previously applied commit`），變成空的 commit 直接略過；`reset --mixed` 列出的 `Unstaged changes after reset:` 以 HEAD 比較；`.gitignore` 的萬用字元是常用的子集。
