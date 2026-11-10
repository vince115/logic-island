# 2026-11-02 Phase E.5 Git 工作目錄整併

## 指示範圍

使用者授權：盤點、分類、驗證所有未提交變更，建立可追溯的本地 commit，更新交接文件。**禁止** Merge、Push、Deploy、`git reset --hard`、`git clean`、未確認的 stash、Rebase、Force Push；不新增功能或教材、不改 320 堂藍圖與 Phase F 規劃文件；完成後停止，不開始 Phase F.0。

## 起點

- 分支 `phase-d/basics-glb`，HEAD `cac9b85`（Phase F 規劃 commit）。
- 未提交：**108 筆**（`git status --porcelain`），包含已追蹤檔案的修改，以及 4 筆未追蹤項目：`src/lib/highlight/`（2 個檔案）、`src/components/highlighted.tsx`、`tests/highlight.test.ts`、`.claude/`。沒有 `.env*`、憑證或建置輸出。四個功能 commit 共提交 107 個檔案（103 個修改、4 個新增）；`NEXT_STEPS.md` 放在文件 commit；撤回了 1 個檔案（見下）。
- 四項功能疊在同一批檔案：`lab.tsx`、`lesson.tsx`、`catalog.tsx`、`code.tsx`、`lesson-page.tsx`、`islands.module.css` 等同一行可能同時含兩項功能的變更。

## 分類與依賴

| 群組 | 內容 | 依賴 |
|---|---|---|
| A 首頁面板與相機 | 兩個面板半透明、寬螢幕右側清單浮在地圖上、`HexCamera.frame()` 的 `insetRight`（使用者同意） | 無 |
| B 命名 | 功能區定名「互動實驗島」、「完整課綱」標籤、相關 E2E | 無 |
| C 語言 | C++／Java／Python 順序；六個 Lab 與 60 堂課加入 JavaScript（每堂課自訂語言、驗證規則、四語執行測試） | B（同一行文案） |
| D 語法高亮 | `shiki@4.5.0`、`src/lib/highlight`、`Highlighted`、各程式碼面板 | C（四語 token） |
| E 文件 | `NEXT_STEPS`、狀態文件、本紀錄 | A–D |

`.claude/` 是本機工具設定，不提交。

## 方法

同一檔案含多項功能時，不用互動式 `git add -p`：以腳本（暫存區外的 `stage.py`）從 HEAD 或工作目錄做**精確字串替換**產生中間版本，`git hash-object -w` 寫入物件庫、`git update-index --cacheinfo` 放入暫存區，**工作目錄完全不動**。每個 commit 提交前，把暫存區的樹（`git write-tree` → `git archive`）匯出到隔離目錄，跑 tsc、ESLint 與相關 Vitest。最後一個 commit 後工作目錄與 HEAD 相同（只剩 `NEXT_STEPS` 與 `.claude/`），證明中間版本沒有遺失任何變更。

整併中修正（範圍內）：`layout.tsx`、`learn/page.tsx`、`catalog.tsx` 的 Lab 文案仍寫三種語言，改為四種（併入 C）；撤回 `curriculum.module.css` 一條沒有使用的 `.intro a` 規則。

## Commit

| Commit | 群組 | 檔案 | 快照驗證 |
|---|---|---|---|
| `a6bacfe` feat(home): translucent map panels; the camera frames the islands left of the island list | A | 4 | tsc／ESLint 0；Vitest 26 passed |
| `3632a75` feat(nav): name the lab area 互動實驗島 (Interactive Lab Island); 完整課綱 labels | B | 25 | tsc／ESLint 0；Vitest 23 passed |
| `b525608` feat(lang): C++/Java/Python order; JavaScript in the six labs and all 60 lessons | C | 79 | tsc／ESLint 0；Vitest 1156 passed（四語程式全部執行，JDK 在 PATH） |
| `b52b8e9` feat(code): syntax highlighting with Shiki at build time | D | 14 | tsc／ESLint 0；Vitest 44 passed |
| 本 commit | E | 文件 | — |

## 最終整合驗證（隔離副本，HEAD `b52b8e9`）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest（全部，JDK 在 PATH） | **1343 passed**／0 skipped（23 個檔案） |
| Build | 成功（77 個靜態頁） |
| E2E 全套（單次） | **338 passed／39 skipped／3 failed**：3 項皆為既有 P1-11（`player.spec.ts`：bfs 教材、語言切換（desktop）；播放中更換輸入（desktop、mobile））；沒有新的失敗 |

## 未提交

- `.claude/`（未追蹤，本機設定，不提交）。

## 待決

- 工作目錄沒有安裝 Shiki：`package.json`／`pnpm-lock.yaml` 已提交，本機開發前需 `pnpm install`（安裝只在隔離副本做過）。
- 未 Merge、未 Push、未部署；Phase F.0 未開始。
