# R5：多群島 v2 發布閘門（Release Gate）

> 2026-11-12。只做驗證與合併準備：**沒有**合併到 `main`、沒有部署、沒有 force push、沒有改 CI 或題庫發布政策。

## 1. 分支關係（遠端，`git fetch` 後）

```
main f45c867 ─(6)→ trials/mvp 4cbe587 ─(11)→ archipelago/v2 034e9c6
```

- `main` 是 `trials/mvp` 的祖先，`trials/mvp` 是 `archipelago/v2` 的祖先：兩段都可 fast-forward，沒有衝突。
- PR [#1](https://github.com/vince115/logic-island/pull/1)：`archipelago/v2` → `trials/mvp`，draft。
- 三個分支都**沒有**分支保護、ruleset；repository 允許 merge commit、squash、rebase。

## 2. 部署關係（R5b）

| 項目 | 結果 | 證據 |
|---|---|---|
| GitHub 預設分支 | `main` | `gh api repos/vince115/logic-island` |
| GitHub Deployments／Environments | 0／無 | `repos/…/deployments`、`environments` |
| GitHub Pages、Webhooks | 無 | `repos/…/pages` 404、`hooks` 空 |
| commit 上的外部檢查 | 只有 `github-actions` 的 `gates`；`main`、`trials/mvp`、PR head 都沒有 Vercel／Netlify／Cloudflare 的 status 或 check | `commits/<sha>/status`、`check-runs` |
| 專案內部署設定 | 無 `vercel.json`／`vercel.ts`／`.vercel`／`netlify.toml`；`next.config.ts` 無 `output` | 檔案盤點 |
| GitHub Actions | `trials-ci` 只讀（`permissions: contents: read`），不部署 | `.github/workflows/trials-ci.yml` |
| Vercel 帳號 | CLI 登入的 scope（另一個帳號）沒有 logic-island 專案；`vince115s-projects` scope 未授權讀取，**尚未確認** | `vercel project list`；MCP 403 |

**補充證據（2026-11-12 R5 後段）**：每個 commit（含 `main` 的 `f45c867`、`trials/mvp`、PR #1）都有 `vercel`、`travis-ci`、`claude` 三個 GitHub App 的 check suite，代表 **Vercel GitHub App 已安裝且有權存取本 repository**；但 `vercel` suite 一律 `queued`、0 個 check run，repository 從未有 deployment 或 commit status（Travis 沒有 `.travis.yml`）。這與「App 已安裝、但沒有 Vercel 專案連到本 repo」一致，**也與**「有專案連結但關閉 Git 部署或以 Ignored Build Step 略過」一致，所以仍不足以排除正式部署。缺少的唯一證據：`vince115s-projects` 中是否有專案的 Git repository 是 `vince115/logic-island`，以及其 Production Branch 與 Git 部署設定。

**結論**：沒有任何證據顯示這個 repository 接了 Git 自動部署（Vercel 的 Git 整合會在每次 push 產生 GitHub deployment 與 status，這裡一次都沒有）。但 `vince115s-projects` 的 Vercel 設定**尚未確認**，因此不能斷言合併 `main` 不會更新正式網站。合併前請確認該 scope 沒有連到 `vince115/logic-island` 的專案（或其 Production Branch 不是 `main`）。

## 3. 兩段 diff 的內容與風險（R5c）

### 3.1 `main` → `trials/mvp`（6 commits，530 檔，+141,719／−148）

`main` 停在 Phase C.1；`trials/mvp` 是 T.3J 的公開快照，包含 Phase D～M3 與考試系統的全部公開成果。這一段才是**主要的發布量**。

| 面向 | 內容 | 風險 |
|---|---|---|
| 路由 | `main` 只有 `/`、`/islands`、`/learn`、`/visualize`。合併後新增 `/curriculum`（80 堂）、`/islands/*` 原型頁（皆 `robots: noindex`）；`/visualize` 移除，`next.config.ts` 以 308 轉到 `/learn` | 舊網址不會 404；原型頁公開可達但不被索引 |
| 公開題庫 | `generated/` 只有 2 批：高普考 40 題、mvp-originals 13 題（共 53）；iPAS、CCAR-F 無題目、無試卷 | 無私人題目（§4） |
| 考試入口 | `/trials/*` 只在 `LOGIC_ISLAND_TRIALS=1` 建置時存在；預設建置為靜態 404 | 正式建置若**沒**設旗標，不會出現考試 |
| 3D | 新增 `basics-island.v2.1.glb`（879,708 bytes，`.gitattributes` 標 binary）與 hex 世界；`/world` 只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 時存在 | 首頁載入 3D；行動裝置效能未在真機驗證（KNOWN_ISSUES P1-25 等） |
| CI | 新增 `trials-ci.yml` | 見 §5 第一次 push 會失敗 |
| 使用者資料 | `main` 只用 `logiclab-theme`；本段保留同一個 key，新增 `logic-island.progress`／`.time`／`.language`／`.trials` 等 | 相容：既有使用者只有主題設定，沿用 |

### 3.2 `trials/mvp` → `archipelago/v2`（11 commits）

| 面向 | 內容 | 風險 |
|---|---|---|
| 公開題庫、考試引擎、CI、治理文件 | `src/content/trials`、`src/lib/trials`、`scripts/trials`、`docs/exam-system`、`.github` **逐檔相同** | 無 |
| 考試旗標 | 不變；課綱頁的考試連結只在 trials 建置、且只連有試卷的考試 | 無 |
| 3D | 只有型別（`MappedRegionId`）與側欄的 `?island=`（可選參數，預設行為不變）；無模型、資產變更 | 低 |
| 課程資料 | 4 區域、23 島、431 堂（80 已開放、351 規劃中，無頁面、無連結） | 低；E2E 爬過所有開放頁面的站內連結 |
| 側欄 | World → Region → Island → Lesson；新增 UI key `logic-island.nav`（只存展開狀態） | 低 |
| 實驗島 | Lab Registry、`/learn/color-contrast`（路由契約唯一新增） | 低 |
| 修復 | P1-11、淺色 `--muted` 達 AA | 低；視覺有些微變深 |
| 使用者進度 | `progress.ts`、`site-time.ts`、`use-progress.ts`、trials store 與 `trials/mvp` 相同 | 無 |

## 4. 私人題庫安全（重新確認）

- `git rev-list origin/main..origin/archipelago/v2` 與 `.git/info/private-history-commits`（157 筆）交集：**0**。
- 該範圍每個 commit 的 tree 都沒有私人題庫路徑（`private/`、iPAS／CCAR-F 批次、審查佇列）。
- T.3J `leak-scan --history origin/main..origin/archipelago/v2`（在含私人題庫的 `logic-island-t3j` 唯讀執行；350 題、18,220 片段；含 commit 訊息）：**乾淨**。旗標建置的 `.next`：**乾淨**。
- 附帶發現：遠端舊分支 `phase-d/basics-glb`（`c316fe0`，2026-11-01）有 41 個 commit 在 private-history 清單上——清單收的是整條原始歷史，這段早於考試系統，tree 中沒有任何 trials 路徑，leak-scan 乾淨。不是外洩；它不在合併路徑上。

## 5. CI：合併到 main 的那一次 push（已修正）

依原本的 `src/lib/trials/ci-bootstrap.ts`，沒有發布檔案的 base 只在「`trials/mvp` 第一次 push」或「從 `trials/mvp` 到 `main` 的 PR」可走 bootstrap；PR 合併後 `main` 的 push（前一個 tip 是 `f45c867`）不在其中，會 fail closed。

使用者選擇修正宣告規則（不接受一次紅燈）。`trials/mvp` 的 `c721e52`：

- 事件新增 landing：push 到 `refs/heads/main`、非 force、`before` 正好是宣告的 base、策略 `push-before`。其餘條件（base 為宣告值且沒有發布檔案、anchor 在歷史中、anchor 與 head 的發布檔案與宣告逐位元組相同）不變，bootstrap 檢查與之後所有 gate 照跑。
- 只能命中一次：之後 `main` 有發布檔案，每次 push 都是 compare。
- 回歸測試：event matrix 新增 8 列；拿掉修正時兩列 landing 失敗。含私人題庫的完整 Vitest 87 檔 2150 通過。
- 端到端預演（暫存 clone，本機把 `trials/mvp` merge commit 到 `main`）：`ci-base` 得到 `push-before`／base `f45c867`／bootstrap；`ci-bootstrap` 11 項全部 PASS；同一個 push 標成 forced 時被拒絕。說明見 `docs/exam-system/33` 末節。
- `archipelago/v2` 以 merge commit 併入（`b7e3127`），未 rebase。

## 6. 兩階段合併計畫（R5d）

前置：PR #1 CI 全綠（不把 pending／skipped 當通過）；§2 的 Vercel scope 確認。

1. **階段一**：開 PR `trials/mvp` → `main`（CI 為宣告的 bootstrap）。用 **Create a merge commit**（或本機 `git merge --ff-only` 後一般 push）。**不要 squash、不要 rebase**：兩者都會產生新 SHA，`archipelago/v2` 就不再是 `main` 的後代，PR #1 會出現重複變更，T.3J 的 anchor 驗證與 leak-scan 範圍也要重做。
2. 合併後 `main` 的 push CI 走 §5 的 landing bootstrap，必須全綠。
3. **階段二**：把 PR #1 的 base 從 `trials/mvp` 改成 `main`（`gh pr edit 1 --base main`）。因為 `trials/mvp` 已在 `main` 裡，PR 只剩 11 個 commit，不需要 rebase 或 force push；CI 以 `main` 為 base（有發布檔案）走 compare。轉為 ready、CI 綠燈後同樣用 merge commit 合併。
4. 兩個階段都不需要 force push；`archipelago/v2`、`trials/mvp` 合併後保留（repository 未開啟自動刪分支）。

## 7. 合併後 smoke tests

在 `main` 的乾淨 checkout（隔離副本）：

1. `pnpm install --frozen-lockfile`、`tsc --noEmit`、`pnpm lint`、`vitest run`（含路由契約與 taxonomy）。
2. 預設建置（不設旗標）＋ `next start`：`/`、`/curriculum`、80 堂 `/curriculum/<slug>` 皆 200；`/learn` 6＋1 個實驗 200；`/visualize`、`/visualize/array` 308 到 `/learn…`；`/trials`、`/world` 404。
3. `e2e/navigation.spec.ts`、`e2e/player.spec.ts`（桌機＋手機）。
4. 旗標建置（兩旗標）：`e2e/regional-world.spec.ts`、`trials.spec.ts`、`trials-history.spec.ts`、`islands.spec.ts`（執行時 Playwright 也要帶同樣旗標）；`/world/design`、`/world/web` 404；iPAS／CCAR-F 顯示「題目準備中」且無連結。
5. 在含私人題庫的 checkout：`leak-scan --history <合併前 main>..origin/main` 與 `--dir .next`。
6. 若確認有部署：正式網址的首頁 3D、側欄抽屜（375 px）、`/learn/color-contrast`、主題切換後舊的 `logiclab-theme` 仍生效。

## 8. Rollback

- **程式**：以 PR 反轉合併：`git revert -m 1 <merge commit>`（階段二先反轉，再視需要反轉階段一）。不重寫歷史、不 force push。若用了 fast-forward（沒有 merge commit），改為 `git revert --no-commit <前 tip>..<新 tip>` 後一次提交。
- **使用者資料**：反轉不會刪除瀏覽器裡的 `logic-island.*` key；`main` 原本只讀 `logiclab-theme`，舊程式忽略新 key，不會出錯。
- **部署**（若 §2 確認有）：用平台的 rollback／promote 回前一個 production deployment，比重新建置快；之後再提交 revert。
- **題庫**：兩段都沒有改發布帳本與 manifest，rollback 不涉及題目撤回。

## 9. 閘門狀態（2026-11-12 08:00 UTC）

| 條件 | 狀態 |
|---|---|
| CI：`trials/mvp` `c721e52`、PR #1 `1df9d30` | 執行中（`034e9c6`、`ea2e28f` 的 PR CI 全綠） |
| 洩漏掃描 `origin/main..origin/archipelago/v2`（673 段文字＋commit 訊息） | 乾淨；私人歷史 commit 0 |
| PR #1 差異 | 14 個 commit＝原 11 個＋R5 的 2 個文件與 1 個 `trials/mvp` merge commit |
| 本機 smoke（`1df9d30` 預設建置，即兩次合併後 `main` 的樹） | build 通過；`/`、`/curriculum`、`/learn`、7 個實驗、`/islands`、課程頁 200；`/trials`、`/world`、規劃中實驗 404；`/visualize*` 308；navigation＋player E2E 38 通過 |
| 部署影響 | **未確認**（§2）：合併暫停 |
