# Worktree Lifecycle（工作目錄生命週期規範）

適用對象：所有在 Logic Island 上工作的 Claude Session 與人員。
目的：維持一個主工作目錄，同時活躍的 worktree 以 2–3 個為原則，已完成的工作目錄在安全驗證後清理。

實際狀態以 `git worktree list --porcelain` 為準；本文件的清單只是某一天的快照。

本規範只管工作目錄的建立、使用與清理。它不限制正常的 commit、push、PR 流程，也不要求一般修改等待人工批准；那些仍依 [CLAUDE.md](../../CLAUDE.md) 與當前任務授權。

## 1. 使用哪個工作目錄

1. **優先使用既有且安全的工作目錄。** 一般任務在主工作目錄 `logic-island/` 開 feature branch 進行。
2. **建立新 worktree 前先盤點。** 執行 `git worktree list --porcelain` 與 `git branch -vv`，確認沒有可重用的目錄，且建立後同時活躍的 worktree 不超過 3 個。
3. **平行任務才使用獨立 worktree。** 只有兩件工作必須同時進行、且會寫到相同檔案或需要不同 branch 時才建立。
4. **主工作目錄有未提交變更時，不得切換 branch。** 不 stash、不 reset、不 checkout 別的 branch 來「借用」目錄；改在新 branch（從目前 HEAD）或獨立 worktree 進行。
5. **不跨 Session 修改或清理。** 不修改、不切換、不清理其他 Session 的 worktree 與 scratch 副本；不停止別人的 dev server、build、Vitest 或 Playwright。

命名：同層目錄 `logic-island-<任務代號>`（例如 `logic-island-p98c`）。桌面 App 建立的 `.claude/worktrees/*` 由 App 管理，隨 Session 封存而清理，不手動移除。

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
   | 5 | 被忽略的檔案只有可重建的輸出 | `git status --porcelain --ignored` 只出現 `node_modules/`、`.next/`、`test-results/`、`tsconfig.tsbuildinfo` |
   | 6 | 沒有活躍 Session 或程序使用該目錄 | `lsof -n` 與 `ps` 都找不到該路徑（cwd、開啟的檔案、指令列） |
   | 7 | 沒有私有題庫、原始設計素材、憑證 | 見第 2 節 |

10. **清理前必須確認沒有活躍程序及不可重建資料**（上表第 6、7 項）。

誰可以清理：

- 建立該 worktree 的 Session，在自己的 PR 合併且上表七項全部成立後，可以直接清理，不需另外等待批准。
- 其他 Session 建立的、或來源不明的 worktree，只有在使用者明確授權的清理任務中才可處理（見第 5 條）。

清理方式：

```bash
git worktree remove <path>
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

- 私有題庫改用第 2 節的固定路徑。`logic-island-t3j` 與 `logic-island-port` 內的 `private/question-bank` 是舊的 checkout，兩份都已完整推送到 Private GitHub、沒有未提交的內容；`logic-island-t3j` 那份落後最新版 2 個 commit（350 題，最新是 380 題），不再用於外洩掃描。兩個目錄在使用它們的 Session 改用固定路徑、並由使用者確認之前，仍視為高風險，不清理。
- `logic-island-m3-ring` 的三個 `.blend` 原檔與全部本機獨有的 Git 歷史已存入本機備份（同一顆磁碟），尚無異地備份；該目錄仍視為高風險。
