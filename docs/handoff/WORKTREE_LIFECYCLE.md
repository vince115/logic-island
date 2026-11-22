# Worktree Lifecycle（工作目錄生命週期規範）

適用對象：所有在 Logic Island 上工作的 Claude Session 與人員。
目的：維持一個主工作目錄，同時活躍的 worktree 以 2–3 個為原則，已完成的工作目錄在安全驗證後清理。2026-11-22 起，所有額外的 worktree 集中在一個目錄，不再散落於主 repository 的同層（第 6 節）。

實際狀態以 `git worktree list --porcelain`（或 `git wt list`）為準；本文件的清單只是某一天的快照，各自標有日期。

本規範只管工作目錄的建立、使用與清理。它不限制正常的 commit、push、PR 流程，也不要求一般修改等待人工批准；那些仍依 [CLAUDE.md](../../CLAUDE.md) 與當前任務授權。

## 1. 使用哪個工作目錄

1. **優先使用既有且安全的工作目錄。** 一般任務在主工作目錄 `logic-island/` 開 feature branch 進行。
2. **建立新 worktree 前先盤點。** 執行 `git worktree list --porcelain` 與 `git branch -vv`，確認沒有可重用的目錄，且建立後同時活躍的 worktree 不超過 3 個。
3. **平行任務才使用獨立 worktree。** 只有兩件工作必須同時進行、且會寫到相同檔案或需要不同 branch 時才建立。
4. **主工作目錄有未提交變更時，不得切換 branch。** 不 stash、不 reset、不 checkout 別的 branch 來「借用」目錄；改在新 branch（從目前 HEAD）或獨立 worktree 進行。
5. **不跨 Session 修改或清理。** 不修改、不切換、不清理其他 Session 的 worktree 與 scratch 副本；不停止別人的 dev server、build、Vitest 或 Playwright。

位置與命名：`<dev-hub>/.worktrees/logic-island/<任務代號>`（例如 `.worktrees/logic-island/p98c`），用 `git wt new` 建立，規則與指令見第 6 節。2026-11-22 以前的慣例是主 repository 同層的 `logic-island-<任務代號>`；這個慣例已停用，仍留在同層的目錄列在第 7 節，待遷移。桌面 App 建立的 `.claude/worktrees/*` 由 App 管理，隨 Session 封存而清理，不手動移除，也不搬移。

## 2. 不可重建的資料

6. **私有資料與原始設計素材不得依賴可刪除的 worktree。** `git worktree remove` 會連同被 `.gitignore` 忽略的檔案一起刪除。私有題庫（`private/question-bank`）、Blender 原檔（`*.blend`）、`.env*`、憑證與金鑰應放在 worktree 之外的固定位置；仍放在 worktree 內時，該目錄視為高風險，不得清理。

   固定位置（`<dev-hub>` 是主工作目錄往上三層的目錄；主工作目錄是 `<dev-hub>/github/vince115/logic-island`）：

   | 資料 | 位置 | 說明 |
   |---|---|---|
   | 私有題庫 | `<dev-hub>/github/vince115/logic-island-private/question-bank`（與主工作目錄同層） | 唯一的 checkout，commit 與 push 只在這裡做。用法見 [34 T.3J](../exam-system/34_T3J_PRIVATE_BANK_AND_CI_ACTIVATION.md) 第 2 節：CLI 逐指令加 `LOGIC_ISLAND_PRIVATE_BANK=<絕對路徑>`，不寫進 shell 設定檔 |
   | 本機備份 | `<dev-hub>/backups/logic-island/<時間戳>/` | Git bundle、Blender 原檔、SHA-256。每次另建新目錄，不覆寫舊的。與原始資料同一顆磁碟，不是異地備份 |
   | 3D 資產保全庫 | `<dev-hub>/assets/logic-island/` | Blender MCP 產出的原檔與 GLB，附 `MANIFEST.json` 與 `SHA256SUMS`，視為唯讀 |

   這三處都含有不可公開或不可重建的內容：不搬進任何 worktree，不加入公開 repository。

## 3. 測試與 scratch 副本

7. **測試優先使用既有環境，必要時才建立 scratch 副本。** 不為單次測試建立永久 worktree。會寫 `.next`、cache 或報告的檢查依 [TESTING_STATUS](TESTING_STATUS.md) 在隔離副本執行。
8. **Scratch 副本由建立它的 Session 負責清理。** Session 結束前停掉自己啟動的 server，移除自己的副本；不碰其他 Session 的副本。Scratch 副本是暫時的：`/private/tmp` 下的 scratchpad 會被系統定期清空，需要保留的腳本、證據與報告要放進 repository 或固定位置，不留在 scratch。

## 4. 清理已完成的 worktree

9. **PR 合併後安全清理。** 先 `git fetch origin`，下列條件全部成立才可清理；任一條件無法確認就保留並記錄原因。

   | # | 條件 | 檢查方式 |
   |---|---|---|
   | 1 | 仍是本 repository 的已註冊 worktree | `git worktree list --porcelain` |
   | 2 | HEAD 已包含於最新 `origin/main` | `git merge-base --is-ancestor <HEAD> origin/main` |
   | 3 | 沒有未提交或未追蹤的檔案 | `git status --porcelain` 為空 |
   | 4 | 沒有未推送的獨有 commit | `git rev-list --count HEAD --not --remotes` 為 0 |
   | 5 | 被忽略的檔案只有可重建的輸出 | `git status --porcelain --ignored` 只出現 `node_modules/`、`.next/`、`test-results/`、`tsconfig.tsbuildinfo`（macOS 的 `.DS_Store` 不計） |
   | 6 | 沒有活躍 Session 或程序使用該目錄 | `lsof -n` 與 `ps` 都找不到該路徑（cwd、開啟的檔案、指令列） |
   | 7 | 沒有私有題庫、原始設計素材、憑證 | 見第 2 節 |

10. **清理前必須確認沒有活躍程序及不可重建資料**（上表第 6、7 項）。

誰可以清理：

- 建立該 worktree 的 Session，在自己的 PR 合併且上表七項全部成立後，可以直接清理，不需另外等待批准。
- 其他 Session 建立的、或來源不明的 worktree，只有在使用者明確授權的清理任務中才可處理（見第 5 條）。

清理方式：

```bash
git wt remove <名稱或路徑>     # 先跑上表七項，全部成立才執行下面這一行；任何一項不成立就保留
git worktree remove <path>     # 沒有 helper 時的等效指令，七項要自己逐項確認
```

- 不使用 `rm -rf`、`git worktree remove --force`、`git reset --hard`、`git clean -fdx`。Git 拒絕移除時就停下來回報，不強制執行。
- 不刪除已合併的 branch 或 tag；歷史保留。
- 清理後移除 `.claude/launch.json` 內指向該目錄的設定。
- `git worktree prune` 只在確認沒有暫時離線或無法存取、但仍需保留的工作目錄之後才執行；先用 `git worktree prune --dry-run` 檢視。

**任何不確定的目錄一律保留。**

## 5. 快照（2026-11-20，第一波清理後）

第一波清理移除 12 個已合併 PR 的 worktree（23 → 11）。清理後的狀態：

| 目錄 | Branch | 狀態 |
|---|---|---|
| `logic-island` | `nav/unified-sidebar` | 主工作目錄 |
| `logic-island-p98c` | `p9/8c-shared-canvas-cs` | 活躍，PR #38 未合併 |
| `logic-island-courses-b5` | `courses/batch-5` | PR #39 已合併，待安全檢查後清理 |
| `.claude/worktrees/frosty-driscoll-74c96c` | `p9/phone-layout-fix` | 活躍，PR #35 未合併，App 管理 |
| `logic-island-t3j` | `public/trials-mvp` | 高風險：內含私有題庫 |
| `logic-island-port` | `trials/practice-structural` | 高風險：內含較新的私有題庫 |
| `logic-island-m3-ring` | `m3/mobile-marker-occlusion-fix` | 高風險：本機獨有 commit 與 `.blend` 原檔 |
| `logic-island-p8` | `p9/1-visual-prototype` | 未整合（PR #18 已關閉未合併），已完整推送，待決定 |
| `logic-island-p9-1c` | `p9/1c-camera-flight` | 未整合（無 PR），已完整推送，待決定 |
| `logic-island-p9-s0` | `p9/s0-island-visual-standard` | PR #19 未合併，已完整推送，待決定 |
| `logic-island-p97` | `p9/7-shared-canvas-proto` | 未整合（評估用原型），已完整推送，待決定 |

2026-11-21 更新（資料保護，未移除任何 worktree）：

- 上表之後的變動：PR #38 已合併，`logic-island-p98c` 已由該 Session 移除；新增 `logic-island-p98c-docs`（`docs/p98c-post-merge-baseline`，PR #43）與 `logic-island-presence`（`presence/visitor-population`），兩者都在使用中。共 12 個 worktree。
- 私有題庫改用第 2 節的固定路徑。`logic-island-t3j` 與 `logic-island-port` 內的 `private/question-bank` 是舊的 checkout，兩份都已完整推送到 Private GitHub、沒有未提交的內容；`logic-island-t3j` 那份落後最新版 2 個 commit（350 題，最新是 380 題），不再用於外洩掃描。兩個目錄在使用它們的 Session 改用固定路徑、並由使用者確認之前，仍視為高風險，不清理。
- `logic-island-m3-ring` 的三個 `.blend` 原檔與全部本機獨有的 Git 歷史已存入本機備份（同一顆磁碟），尚無異地備份；該目錄仍視為高風險。

## 6. 統一工作目錄（2026-11-22 起）

Logic Island 是一個專案：公開 repository 只有一個主工作目錄，其他工作目錄都放在同一個集中目錄。`<dev-hub>` 的定義同第 2 節（主工作目錄往上三層）。

| 用途 | 位置 |
|---|---|
| 公開主 repository（唯一） | `<dev-hub>/github/vince115/logic-island` |
| 私有 repository（獨立，不是 worktree） | `<dev-hub>/github/vince115/logic-island-private` |
| 所有額外的 worktree | `<dev-hub>/.worktrees/logic-island/<名稱>` |
| 本機備份 | `<dev-hub>/backups/logic-island/<時間戳>/` |
| Blender 與其他獨立資產 | `<dev-hub>/assets/logic-island/` |

11. **新 worktree 一律建在集中目錄。** 用 `git wt new`（下方）。不在主 repository 的同層建立 `logic-island-<功能名稱>` 目錄，也不直接下 `git worktree add ../logic-island-…`。`<名稱>` 是簡短的任務代號（小寫英數、`.`、`-`、`_`），不加 `logic-island-` 前綴。唯一的例外是第 3 節的臨時副本：在系統暫存目錄（`/private/tmp`、`/tmp`、`/var/folders`）下為單次測試建立、用完就移除的 worktree 不受此限，`git wt list` 標為 `scratch`。
12. **開工先盤點，優先重用。** 新 Session 先執行 `git wt list`：已有適合的工作目錄（同一條工作線、沒有其他程序在用）就重用，不另建。同時存在的額外 worktree 以 3 個為限，超過時先清理已完成的。
13. **同一個 branch 同時只由一個 Session 修改。** Git 本身不允許同一個 branch 在兩個 worktree checkout；`git wt list` 標為 `IN USE` 的目錄有其他程序正在使用，不進去寫入、不切換它的 branch。要接手別的 Session 的工作線，先確認那個 Session 已停止。
14. **已合併的 worktree 由建立它的 Session 清理。** PR 合併後執行 `git wt remove <名稱>`：第 4 節七項全部成立才移除，任何一項不成立就保留並回報。Branch 與 tag 不刪。
15. **不為了整理而刪除未合併的工作。** 未合併、未推送、含未提交變更或含不可重建資料的目錄，只能搬移（`git wt move`）或保留，不能移除。搬移只用 `git worktree move`，不用 Finder、`mv` 或 `rsync`。

### 指令

Helper 是 [`scripts/worktree.sh`](../../scripts/worktree.sh)。它不使用 `--force`、`rm -rf`、`reset`、`clean`，不刪 branch，無法確認時一律停下來保留。

```bash
git wt list                                   # 所有 worktree：類別、branch、HEAD、是否乾淨、是否有程序在用
git wt new <名稱> <branch>                    # 建立 <dev-hub>/.worktrees/logic-island/<名稱>；新 branch 從 origin/main 開始
git wt new <名稱> <branch> --from <起點>      # 新 branch 從指定的 commit／branch 開始
git wt check <名稱或路徑>                     # 第 4 節七項，唯讀
git wt remove <名稱或路徑>                    # 七項全部成立才 git worktree remove
git wt move <名稱或路徑> [<新名稱>]           # 把集中目錄以外的 worktree 搬進來，搬移前後核對 HEAD、branch、status、檔案清單
git wt audit                                  # 集中目錄以外還有 worktree 或同層的 logic-island-* 目錄時回傳 1
```

- `git wt new`：`<branch>` 已在別的 worktree checkout 時拒絕；本機已有該 branch 就直接 checkout；只有 `origin` 有就建立追蹤 branch；兩邊都沒有才從 `origin/main`（或 `--from`）開新 branch，不設 upstream。建立前會 `git fetch origin`（`--no-fetch` 略過）。
- `git wt move`：目錄有程序在使用（cwd、開啟的檔案、指令列）、被鎖定、含 submodule，或目的地已存在時拒絕。App 管理的目錄與主工作目錄不搬。
- `git wt` 是本機的 Git alias，執行 `origin/main` 上的 `scripts/worktree.sh`，所以在任何 branch、任何 worktree 都是同一個版本。還沒有 alias 的 clone（新機器、從備份還原）先執行一次：

  ```bash
  git fetch origin && git show origin/main:scripts/worktree.sh > /tmp/worktree.sh && bash /tmp/worktree.sh install
  ```

  沒有 alias 時的等效寫法是 `bash scripts/worktree.sh <指令>`（所在 checkout 要有這個檔案）。
- `install` 另外在 `.git/hooks/post-checkout` 放一個守門 hook：有人在集中目錄以外新建 worktree 時，Git 會在輸出印出警告與修正指令（`git worktree move …`）。它只在「新建 worktree」那一次作用，一般的 checkout、App 管理的目錄與暫存目錄下的臨時 worktree 都不受影響，也不會讓任何指令失敗。Alias 與 hook 都在 `.git/` 內，不進版本控制、不隨 clone 帶走。
- Helper 的自我測試：`bash scripts/worktree.test.sh`（在暫存目錄建立一個假的 repository 來跑，不碰真正的工作目錄；macOS 的 `/bin/bash` 3.2 可執行）。

### 遷移既有的同層目錄

同層的 `logic-island-*` worktree 逐一遷移，不一次搬完：

1. 沒有活躍 Session、沒有程序使用、也沒有其他地方寫死它的絕對路徑：`git wt move <名稱>`。
2. 仍在使用、或有路徑依賴：留在原位，在第 7 節記為 Pending Migration；所屬 Session 完成後再搬。不中斷別人的程序。
3. 搬移後，把仍引用舊路徑的地方改成新路徑（進行中的工作線文件、`.claude/launch.json`、Session 的筆記）。有日期的歷史紀錄保留原文，不改寫。

## 7. 目前狀態（2026-11-22，統一工作目錄整理後）

第 5 節是 2026-11-20／21 的快照，保留原文。以下是 2026-11-22 整理完成時 `git worktree list` 的狀態。

| 目錄 | Branch | 狀態 |
|---|---|---|
| `github/vince115/logic-island` | `nav/unified-sidebar` | 主工作目錄（有未提交變更與本機獨有的歷史，不切換 branch） |
| `.worktrees/logic-island/m3-ring` | `m3/mobile-marker-occlusion-fix` | **已遷移**（原 `logic-island-m3-ring`）。高風險不變：68 個本機獨有 commit、3 個 `.blend` 原檔，不清理 |
| `.worktrees/logic-island/p9-s0` | `p9/s0-island-visual-standard` | **已遷移**（原 `logic-island-p9-s0`）。PR #19 未合併，已完整推送，待決定 |
| `github/vince115/logic-island-cn0` | `srv/2-batch-2`（隨課程批次更換） | **Pending Migration**：課程製作 Session 使用中（有程序以它為 cwd），PR #66 進行中 |
| `github/vince115/logic-island-presence` | `presence/visitor-population` | **Pending Migration**：Draft PR #44，工作線等待使用者決定；該 Session 的 scratch 腳本寫死了這個絕對路徑 |
| `logic-island/.claude/worktrees/frosty-driscoll-74c96c` | `p9/phone-layout-fix` | App 管理，PR #35 未合併；不搬、不手動移除 |

這一輪的變動：

- `logic-island-m3-ring` 與 `logic-island-p9-s0` 以 `git worktree move` 搬到集中目錄。搬移前後 HEAD、branch、`git status --porcelain --ignored`、stash 與檔案清單（大小、修改時間）逐項相同，只有 `.git` 指標檔被 Git 重寫；m3 的三個 `.blend` SHA-256 不變，且與本機備份 `20261121-084804` 內的副本一致。
- `logic-island-p8`（`p9/1-visual-prototype`）已移除：PR #18 關閉未合併，由 #25 取代；branch 本機與 `origin` 都保留在 `0cc94d9`。
- 第 5 節列出的 `logic-island-t3j`、`logic-island-port`、`logic-island-p9-1c`、`logic-island-p97` 與 `logic-island-p98c-docs` 在這一輪開始前已不在 `git worktree list`。`logic-island-cn0` 的 Git 管理名稱是 `logic-island-courses-b5`（同一個 worktree 改名後繼續使用）。
- `github/vince115/logic-lab-snapshots/`（專案更名前的原始碼壓縮檔，不是 worktree）搬到 `backups/logic-island/20261029-101016-logic-lab-pre-build-fix/`，兩個檔案的 SHA-256 搬移前後一致。
- 主 repository 的同層現在只剩 `logic-island-private`（私有 repository 的固定位置）與上面兩個 Pending Migration 目錄。

Pending Migration 的處理：所屬 Session 的工作告一段落、`git wt list` 不再標示 `IN USE` 後，由該 Session（或使用者授權的整理任務）執行 `git wt move cn0`、`git wt move presence`，並把仍引用舊路徑的進行中文件與筆記改成新路徑。
