# P8.6：Hotfix PR #8 與 P8 的整合發布（Flag-off）

> 2026-11-16，Asia/Taipei。上層文件：[P8.5](P8_5_VISUAL_FINALIZATION_AND_PERFORMANCE_HOTFIX.md)。下一階段的待辦：[P8 Release Checklist](P8_RELEASE_CHECKLIST.md)。
> 授權範圍（Continuous Delivery）：程式修改、測試、commit、push、PR，以及通過驗證的 Flag-off merge。
> P8 → `main` 的合併（PR #10，Flag-off）另有明確授權，見 §3。
> **沒有做**：開啟 `LOGIC_ISLAND_REGIONAL_WORLD`、修改 Vercel 環境變數、切換正式首頁、移除既有五島入口、修改 Exam Engine 或私有題庫、改變已發布課程狀態、修改 GLB、force push、squash、改寫歷史。
> 量測在隔離副本與 headless Chromium 進行；手機是視窗尺寸模擬，不是真機。

## 0. 結論

1. **Hotfix PR #8 以 Merge Commit 併入 `main`**。合併前 `main` 又前進了一次（R8 web labs，`6ad79f1`），所以先把最新的 `main` 合進 hotfix 分支並重新驗證，再合併。
2. **正式站有側欄的頁面，腳本量由約 2.2 MB 降到 0.63–0.85 MB**（§1.3）；畫面、文字、連結與導覽逐頁相同。
3. **P8 分支合入最新的 `main`，無衝突**；P8.5 的三個 commit 都在，測試全部重跑（§2）。
4. **P8 → `main` 的 PR #10 是 Flag-off**：預設建置下 `/world` 是 404，首頁仍是 CS 五島場景，與 `main` 逐像素相同（§2.4）。
5. **V3 測試的偶發失敗已找到根因並修正**（測試同步競態；產品沒有問題，§5）。
6. **PR #10 獲准在旗標關閉的條件下合併**：先前兩份指示對「是否合併 `main`」互相衝突，所以曾暫停；之後收到明確授權，八項合併前檢查全部通過（§3）。這項授權**不包含**啟用 Regional World，也不包含切換正式首頁。
7. **合併前重跑全套驗收時找到並修正一個產品的時序問題**：Escape 離開一座島後，焦點偶爾落在清單而不是地圖名牌（只在旗標建置的 `/world/<region>`；§6）。另有一次 `/islands/candidate` 3D 點擊測試的失敗無法重現，記為 P1-36（§7）。
8. 公開發布還缺的條件列在 [Release Checklist](P8_RELEASE_CHECKLIST.md)。

## 1. Phase 1——Hotfix PR #8

### 1.1 合併前的狀態

| 項目 | 結果 |
|---|---|
| PR | [vince115/logic-island#8](https://github.com/vince115/logic-island/pull/8)，`hotfix/nav-client-bundle` → `main` |
| 開始時 | head `1de2e33`，CI 3／3 通過、`mergeStateStatus: CLEAN`；但 `origin/main` 已由 `3605922` 前進到 `6ad79f1`（R8：CSS Grid、Responsive Layout、Mobile Navigation 三個實驗） |
| 是否仍是最新 | **不是**。R8 改了 hotfix 也碰到的 `tests/site-nav.test.ts`，並新增三個有側欄的頁面；CI 的結果是在舊的 `main` 上得到的 |
| 處理 | 把 `origin/main` 合進 hotfix 分支（`c910d92`，無衝突，沒有 force push）。合併後與 `main` 的差異仍只有 4 個檔案：`nav-model.ts`（新增）、`site-nav.ts`、`site-sidebar.tsx`、`tests/site-nav.test.ts` |

### 1.2 合併後重新驗證（隔離副本，`c910d92`）

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint | exit 0／exit 0 |
| Vitest | 76 個檔案，1926 通過／9 略過／0 失敗（含 Java 範例；第一次執行漏了 JDK 的 PATH，279 個 Java 測試被略過，不採計，補上後重跑） |
| Production build（預設，無旗標） | 成功 |
| E2E（`navigation`、`player`、`db-activities-f1c`，桌機＋手機） | 64 通過／2 略過／0 失敗 |
| 課綱與側欄一致 | 11 頁 × 桌機與手機＝22 組，與最新 `main` 的 build 比較：可見文字、所有連結、導覽區塊、整頁截圖全部相同。包含 R8 的三個新頁面 |
| 洩漏掃描（追蹤檔案 627 份、`origin/main..HEAD`、`.next` 2,971 份） | 皆 clean |

### 1.3 Bundle Size

每頁 HTML 引用的腳本總量（預設 production build，未壓縮／gzip；本機 build，`main` 為 `6ad79f1`）：

| 頁面 | `main` | Hotfix | 差異 |
|---|---|---|---|
| `/curriculum` | 2,228 KB／576 KB | 640 KB／201 KB | −71% |
| `/curriculum/programs-and-algorithms` | 2,276 KB／591 KB | 723 KB／230 KB | −68% |
| `/learn` | 2,222 KB／574 KB | 634 KB／199 KB | −71% |
| `/learn/bfs`、`/learn/linux-terminal`、`/learn/css-grid-playground`、`/learn/responsive-layout`、`/learn/mobile-ux` | 2,425 KB／642 KB | 850 KB／272 KB | −65% |
| `/regions/cs`、`/regions/ai`、`/regions/sys` | 2,222 KB／574 KB | 634 KB／199 KB | −71% |
| `/`、`/islands` | 671 KB／631 KB | 不變 | 0 |

原因不變：側欄（client component）從 `site-nav.ts` 匯入值，把整份課綱（1,541 KB 的 chunk）帶進瀏覽器；改為從不匯入任何東西的 `nav-model.ts` 取得型別與小工具之後，那個 chunk 不再出現在任何頁面。

### 1.4 合併與 Production

| 項目 | 結果 |
|---|---|
| PR #8 的 CI（head `c910d92`） | 3／3 通過（`gates`、Vercel、Vercel Preview Comments），`mergeStateStatus: CLEAN` |
| 合併方式 | Merge Commit（`gh pr merge --merge --match-head-commit`），沒有 squash、沒有 rebase |
| Merge Commit | **`9718f89`**（2026-11-16 07:58 UTC；parents `6ad79f1`、`c910d92`）；tree 與驗證過的 `c910d92` 相同 |
| Vercel Production | commit status `Vercel: success`（Deployment has completed），對應 `9718f89` |
| `main` 的 GitHub Actions（`gates`） | 見 §4 |

Production（`https://logic-island-psi.vercel.app`）實測，合併前（`6ad79f1`）與合併後（`9718f89`）：

| 頁面 | 合併前 | 合併後 |
|---|---|---|
| `/curriculum` | 2,228 KB／576 KB | 640 KB／201 KB |
| `/curriculum/programs-and-algorithms` | 2,277 KB／591 KB | 724 KB／230 KB |
| `/learn` | 2,223 KB／574 KB | 635 KB／199 KB |
| `/learn/bfs` 等五個實驗頁 | 2,426 KB／642 KB | 850 KB／272 KB |
| `/regions/cs`、`/regions/ai`、`/regions/sys` | 2,223 KB／574 KB | 635 KB／199 KB |
| `/` | 671 KB／213 KB | 671 KB／213 KB |
| `/islands` | 632 KB／197 KB | 632 KB／197 KB |
| `/world`、`/trials` | 404 | 404 |

合併前每個有側欄的頁面都載入一個 1,541 KB 的 chunk；合併後最大的 chunk 是 202–210 KB。

### 1.5 Production Smoke Test 與 Leak Scan（`9718f89`）

| 檢查 | 結果 |
|---|---|
| 17 個頁面 × 桌機（1440×1000）與手機（iPhone 13 模擬） | 34 次載入全部 200；console error、page error、失敗的請求、4xx／5xx 回應皆 0；無水平捲動 |
| 涵蓋頁面 | `/`、`/curriculum`、課程頁、`/learn` 與七個實驗頁（含 R8 的三個）、五個 `/regions/*`、`/islands` |
| Sidebar | 首頁主選單「完整課綱」→ `/curriculum`；課程頁側欄樹點下一堂課 → 導向該課。桌機與手機皆通過 |
| 旗標路由 | `/world`、`/world/cs`、`/world/ai`、`/world/sys`、`/trials`、`/trials/*` 皆 404 |
| 與合併前的 `main` 比較 | Production 對 `6ad79f1` 的本機 build：15 頁 × 2 裝置＝30 組，可見文字、所有連結、導覽區塊、整頁截圖全部相同 |
| Leak Scan | Smoke 期間下載的 316 份文字回應（HTML、JS、RSC、JSON）：clean |

「首頁 → 完整課綱」的導覽時間（單次量測，僅供參考，不是效能驗收）：桌機 941 ms → 288 ms，手機 700 ms → 242 ms。這是 [KNOWN_ISSUES](../handoff/KNOWN_ISSUES.md) P1-35 記錄的同一條流程。

## 2. Phase 2——P8 Integration

### 2.1 與最新 `main` 的差異

| 項目 | 結果 |
|---|---|
| 整合前 | `p8/multi-region-world` 在 `3ff1ffc`，領先 `main` 14 個 commit、落後 10 個（PR #8 與 R8 web labs） |
| 試算 | 合併前先以 `git merge-tree` 在記憶體中合併（不動任何 worktree）：無衝突，結果 tree `648a776` |
| 整合 | `git merge --no-ff origin/main` → **`be7671c`**，沒有 rebase、沒有 force push。合併後的 tree 就是 `648a776`，所以 §2.2 的驗收是在與分支完全相同的內容上做的 |
| 合併帶進 P8 的內容 | 24 個檔案，全部來自 `main`（R8 的三個實驗與測試、文件）；`src/components/islands`、`src/components/world`、`src/lib/islands`、`src/lib/world`、`src/app/world`、`src/app/page.tsx` **沒有任何變動** |
| P8.5 的三個 commit | `1eec617`、`7776447`、`3ff1ffc` 都是 `be7671c` 的祖先 |
| 其他 worktree | 沒有碰。主工作目錄（`nav/unified-sidebar`，含未提交變更）與其他 session 的 worktree 都維持原狀；本階段只寫入 `../logic-island-p8` 與 `../logic-island-hotfix-nav` |
| PR 的範圍 | 對 `main`：100 個檔案，其中程式與測試 35 個、文件與證據 65 個（證據圖共 7.4 MB）。**不含** `src/content/**`、題庫、Exam Engine、`src/app/page.tsx`、任何 GLB／BLEND |

### 2.2 驗收（隔離副本，tree `648a776`＝`be7671c`）

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint | exit 0／exit 0 |
| Vitest | 76 個檔案，1963 通過／9 略過／0 失敗（含 Java 範例） |
| Flagged build（`LOGIC_ISLAND_REGIONAL_WORLD=1 LOGIC_ISLAND_TRIALS=1`） | 成功 |
| Default build（無旗標，與 Production 相同） | 成功 |
| 全套 E2E，旗標開啟（590 個，桌機＋手機） | **495 通過／95 略過／0 失敗**（28.3 分鐘）。P8.5 是 489／95／0；多出的 6 個是 R8 的導覽測試 |
| 全套 E2E，預設建置（590 個） | **425 通過／165 略過／0 失敗**（23.1 分鐘）。略過的是需要旗標或 fixture 的測試 |
| P8.5 的測試 | V1、V4 在桌機與手機通過；V3 在桌機通過（手機依設計略過）；`islands.spec.ts` 44 個全部通過；`world-topology`＋`regional-world` 58 個通過 |
| 洩漏掃描 | 追蹤檔案（644 份）、`origin/main..HEAD`（104 份）、Flagged build、Default build：皆 clean |

量測沒有重做：合併沒有改到任何 3D 或世界的原始碼（§2.1），P8.5 的 draw call、三角形與 fps 數字仍然適用。

### 2.3 GitHub CI

| 對象 | 結果 |
|---|---|
| PR | [vince115/logic-island#10](https://github.com/vince115/logic-island/pull/10)，`p8/multi-region-world` → `main` |
| `be7671c` | 3／3 通過（`gates`：Typecheck、ESLint、Vitest、題庫完整性與 ledger、旗標開啟的 production build、preflight 與 route probe；Vercel；Vercel Preview Comments），`mergeStateStatus: CLEAN` |
| 文件 commit 之後 | 見 §4 |

### 2.4 Feature Flag 關閉時，正式首頁不變

以 P8 的**預設建置**對 `main`（`9718f89` 的內容）的預設建置：

| 檢查 | 結果 |
|---|---|
| 旗標路由 | `/world`、`/world/cs`、`/world/ai`、`/world/design`、`/world/web`、`/world/sys`、`/trials`：全部 404 |
| 3D 畫面逐像素比對 | `/`、`/?island=basics`、`/?island=databases`、`/islands`、`/islands/legacy`、`/islands/candidate` × 桌機與手機＝12 組，**差異像素 0** |
| 其餘頁面 | 課綱、課程頁、`/learn` 與七個實驗頁、五個 `/regions/*`＝15 頁 × 2 裝置＝30 組：可見文字、連結、導覽區塊、整頁截圖全部相同 |
| 腳本量 | `/` 671 → 672 KB、`/islands/candidate` 671 → 672 KB（共用相機與場景元件多了選項，gzip 同為 213 KB）；其他頁面不變 |
| 原始碼 | PR 沒有修改 `src/app/page.tsx`；首頁元件 `IslandsWorldExplorer` 沒有傳入 P8 新增的任何選項 |

P8 動到的共用元件（`hex-camera.tsx`、`hex-world-scene.tsx`、`hex-world-explorer.tsx`、`camera-controller.tsx`）也被首頁與 `/islands` 使用，所以這項比對是必要的，不能只靠「旗標關閉」推論。

## 3. Phase 3——Merge P8（Flag-off）：授權與合併前檢查

### 3.1 曾經暫停的原因

所有必要檢查通過後（§2），PR #10 一度**沒有合併**，因為收到兩份互相衝突的指示：

| 來源 | 對 P8 → `main` 的指示 |
|---|---|
| 本 Session 收到的簡報「Hotfix PR #8 與 P8 Integration Release」 | 所有必要檢查通過後，以 Merge Commit 合併，旗標維持關閉 |
| 另一個 Session（「Logic Island 五區域架構擴展」）之後轉來的簡報「P8 Release Candidate Handoff」 | 建立 Draft PR，「不要自行合併 main、部署 Production 或切換正式首頁」 |

合併到 `main` 會觸發 Production 部署；兩份指示誰先誰後無法從 Session 內判斷，所以當時停在「PR 已開、CI 通過、未合併」。PR #8 是依本 Session 的明確指示合併的，在第二份簡報送達之前已完成。

### 3.2 授權

之後收到「P8 PR #10 Merge Authorization」（由同一個 Session 逐字轉來）：**批准 PR #10 在功能旗標關閉的條件下合併至 `main`**；不代表批准啟用 Regional World，也不代表批准切換正式首頁。合併時不使用 force push、不重寫歷史、不修改 Vercel Production 環境變數、不啟用 `LOGIC_ISLAND_REGIONAL_WORLD`、不切換首頁、不移除既有五島入口；任何關鍵檢查失敗就暫停並回報。

執行的依據是本 Session 簡報的 Phase 3；當初擋下合併的唯一理由（第二份簡報）已由這份授權解除。

### 3.3 八項合併前檢查

| # | 檢查 | 結果 |
|---|---|---|
| 1 | P8.6 文件與 Release Checklist | 本文件與 [Release Checklist](P8_RELEASE_CHECKLIST.md) 已更新到合併前的最後狀態 |
| 2 | PR HEAD 與遠端一致 | 一致（`git fetch` 後本機與 `origin/p8/multi-region-world` 相同；工作樹乾淨） |
| 3 | `main` 沒有新提交 | `origin/main` 仍是 `9718f89`，是 P8 HEAD 的祖先 |
| 4 | PR #10 最新 CI | 以 PR 頁面為準：合併只在最新 HEAD 的 `gates`、Vercel 檢查全綠之後進行 |
| 5 | V3 Resize 120-run | **120 次 0 失敗**（6 個平行 worker，負載約 31；`affc8d0` 的建置）；加入 §6 的修正後在最後的建置上再跑一次：**120 次 0 失敗**（負載約 24） |
| 6 | 最後一次 private question leak scan | 追蹤檔案（647 份）、分支歷史 `origin/main..HEAD`（115 份）、預設建置（2,134 份）、旗標建置（1,472 份）：皆 clean（18,220 個片段、350 題） |
| 7 | 預設建置的 `/world` 仍受旗標保護 | `/world`、五個 `/world/<region>`、`/trials` 全部 404 |
| 8 | 正式首頁 `/` 的預設行為沒有改變 | PR 沒有修改 `src/app/page.tsx`；P8 預設建置對 `main`（`9718f89`）預設建置：`/`、`/?island=basics`、`/?island=databases`、`/islands`、`/islands/legacy`、`/islands/candidate` × 桌機與手機 12 組整個視窗逐像素比對，差異 0；課綱、課程、`/learn` 與實驗、`/regions/*` 30 組的文字、連結、導覽、整頁截圖全部相同；`/` 腳本量 671 → 672 KB（gzip 同為 213 KB） |

### 3.4 檢查清單以外：合併前重跑全套驗收的結果

§5 的 V3 修正之後全套 E2E 沒有重跑過（上一版 Release Checklist §6 的待辦），所以合併前補跑。這一輪找到一個產品的時序問題並修正（§6），另有一次無法重現的失敗（§7）。最後的 HEAD（`fcaae2e`＝§6 的修正；之後只有文件 commit）：

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint | exit 0／exit 0 |
| Vitest | 1963 通過／9 略過／0 失敗（76 個檔案） |
| Flagged build、Default build | 皆成功 |
| 全套 E2E，旗標開啟（590 個） | **495 通過／95 略過／0 失敗** |
| 全套 E2E，預設建置 | 第一次 424 通過／165 略過／**1 失敗**（§7）；第二次 **425 通過／165 略過／0 失敗** |
| Flag-off 比對、洩漏掃描 | §3.3 的第 6–8 項（在這個 HEAD 上執行） |
| 加壓（6 個平行 worker，各 120 次） | V3：0 失敗；鍵盤控制（§6）：0 失敗 |

執行環境的事故（不是產品問題）：驗收跨過午夜時，暫存目錄的清理程序刪掉了隔離副本裡較舊的檔案（`node_modules` 的頂層連結、隔離用的 Playwright 設定、像素比對腳本），Flag-off 比對與兩個加壓因此沒有執行。之後以 HEAD 的 `git archive`、`main` 副本的 `node_modules`（lockfile 相同）重建副本，像素比對腳本重寫（比對整個視窗；以兩個不同頁面做過反向確認，確實會回報差異），再補跑。上表是補跑後的結果；在事故之前完成的 Typecheck、ESLint、兩種建置、旗標全套 E2E、Vitest 與洩漏掃描不受影響。

### 3.5 合併

合併本身的結果（Merge Commit、`main` 的 CI、Production 部署、Smoke Test、旗標狀態）無法寫進被合併的 commit，由合併後的後續文件 commit 補在本文件 §8；下一階段的 P8 Regional World Activation 計畫也在那個 commit 建立。

## 4. Commit、CI 與部署狀態

| 項目 | 狀態 |
|---|---|
| `main` | `9718f89`（Merge pull request #8） |
| `main` 的 GitHub Actions | `gates`：success（`9718f89`） |
| Vercel Production | success（`9718f89`）；Production 實測見 §1.4、§1.5 |
| `hotfix/nav-client-bundle` | `c2b39c6`（修正）、`1de2e33`（合入 `main`：PR #6）、`c910d92`（合入 `main`：R8）；已合併，分支保留未刪 |
| `p8/multi-region-world` | `be7671c`（合入 `main`）、`bb1c742`（V3 測試等待條件）、`affc8d0`（文件）、`fcaae2e`（§6：Escape 焦點修正）、合併前檢查的文件 commit；已 push |
| PR #10 | 獲准 Flag-off 合併（§3.2）；合併前檢查見 §3.3、§3.4；合併結果記在合併後的文件 |
| PR #7（P6 發布紀錄，文件） | Open，對 `main` 已是 `CONFLICTING`（與本階段無關）；它修改 `docs/handoff/IMPLEMENTATION_STATUS.md`，所以本階段沒有改那個檔案，P8 的狀態記在 TESTING_STATUS 與本文件 |

已知問題的變化：P1-35（首頁導覽 E2E 偶發失敗）在 PR #8 合併後重測 10 輪未再出現；新增 P1-36（§7）（[KNOWN_ISSUES](../handoff/KNOWN_ISSUES.md)）。

## 5. V3 Resize 測試的偶發失敗：根因與修正

P8.5 留下的問題：V3（圖釘與名牌隨視窗寬度切換）55 次裡失敗 1 次，沒有留下訊息。本階段開啟 `--trace retain-on-failure` 重現並取得 trace；完整摘要在 [evidence/p8-6/v3-resize-race.md](evidence/p8-6/v3-resize-race.md)。

| 步驟 | 結果 |
|---|---|
| 重現 | 單一 worker 60 次 0 失敗；4 個平行 worker 120 次 1 失敗；**6 個平行 worker 300 次 10 失敗（3.3%）**，每次都有 trace |
| 失敗位置 | 十次都在同一行：視窗由 1024×768 改回 1440×1000、重新打開清單之後的 `expectLabelsClear()` |
| 失敗當下的 DOM | canvas 沒有一次是 1440×1000：七次仍是 1024×768，三次是 1440×768。名牌已切回大名牌，位置還是舊取景 |
| 成功與失敗的差別 | 成功時 `reframed()` 通過的那一刻 canvas 已是新尺寸、相機已重新取景；失敗的十次裡 `reframed()` 都在第一次輪詢就通過——它等的「沒有名牌在清單下」在過渡狀態下本來就成立 |
| 根因 | **測試同步競態**：等待條件在「視窗已改、場景還沒跟上」時也成立，所以沒有等到重新取景。不是 ResizeObserver 或 `requestAnimationFrame` 沒有觸發，也不是相機沒有重繪：十張失敗截圖都是正確到位的畫面 |
| 產品 | 沒有缺陷，沒有修改 |
| 修正 | 只改 `e2e/world-topology.spec.ts` 的 `reframed()`：視窗是測試設定的尺寸、canvas 等於舞台尺寸、canvas 與所有名牌連續兩個 animation frame 不動、沒有名牌在清單下。沒有固定等待，沒有改斷言，沒有 skip，沒有 retries |
| 修正後 | 同樣的加壓（6 個平行 worker，負載約 32）**600 次 0 失敗**；`world-topology`＋`regional-world` 桌機與手機 58 通過／16 略過／0 失敗；Typecheck、ESLint exit 0 |

修正前 3.3% 的失敗率下，600 次全部通過的機率約為十億分之二，所以這不是運氣。加壓是用平行 worker 模擬的，不是真實的全套執行；合併前另外重跑了全套 E2E（旗標開啟兩次，V3 都通過）與兩次 120 次加壓（皆 0 失敗），見 §3.3、§3.4。

`reframed()` 以外，V3 裡視窗尺寸改變後的其他等待（`expect.poll(widthOf)`、島寬的輪詢）等的是只有在新版面才成立的狀態，沒有這個問題。

## 6. Escape 之後焦點落在清單而不是地圖名牌：產品的時序競態與修正

合併前重跑全套 E2E（旗標開啟，`affc8d0`）：494 通過／95 略過／**1 失敗**——`regional-world.spec.ts`「P8.2 keyboard map controls」，Escape 離開一座島之後，焦點應該回到那座島的地圖名牌，實際在清單項目上。完整摘要在 [evidence/p8-6/escape-focus-race.md](evidence/p8-6/escape-focus-race.md)。

| 步驟 | 結果 |
|---|---|
| 重現 | 只跑這個測試，6 個平行 worker：**120 次失敗 45 次**，全部在同一行 |
| 每一幀的狀態（探針 60 次） | 58 次名牌與島的釋放在同一幀出現，焦點到名牌；2 次名牌晚 3 幀才出現，焦點到了清單項目，之後沒有再移動 |
| 根因 | **產品的時序競態**（不是測試）：`regional-world-explorer.tsx` 只等一個 animation frame 就找名牌，找不到就退回清單項目；名牌由場景自己的 React root 畫出，機器忙時會晚幾幀 |
| 影響 | 只在旗標建置的 `/world/<region>`。焦點沒有遺失，仍在同一座島的入口上，但從地圖跳到清單 |
| 修正（`fcaae2e`） | 有地圖時名牌最多有 30 個 frame 可以出現；沒有地圖時立刻用清單項目，與原本相同。「without WebGL」測試補上沒有地圖時焦點在清單項目的斷言。沒有放寬任何斷言，沒有固定等待、skip、retries |
| 修正後 | 同樣加壓 **120 次 0 失敗**（兩次，負載約 41 與 42）；全套 E2E 旗標開啟 495／95／0 |

這個問題在 P8.2 就存在，之前的全套執行沒有撞到。它不影響正式站（預設建置沒有這個路由），但會在旗標開啟後影響鍵盤使用者，所以在合併前修正而不是記為已知問題。

## 7. `/islands/candidate` 手機版 3D 點擊測試：一次無法重現的失敗

`fcaae2e` 的預設建置全套 E2E 第一次執行：424 通過／165 略過／**1 失敗**——`islands-candidate.spec.ts:129`（手機）最後一步，在 3D 場景點工坊之後網址沒有變成 `/learn`。失敗截圖是正確的聚焦畫面。這一頁正式站也有，所以先確認是不是 P8 造成的：

| 檢查 | 結果 |
|---|---|
| 同一個測試在之前四次全套（P8 的兩種建置） | 桌機與手機共 8 次，全部通過 |
| 加壓重現：P8 預設建置 | 6 個 worker 90 次＋12 個 worker 200 次（負載到 49）：**290 次 0 失敗** |
| 加壓重現：`main`（`9718f89`）預設建置 | 同樣條件（負載到 52）：**290 次 0 失敗** |
| 預設建置全套 E2E 重跑 | **425 通過／165 略過／0 失敗** |
| P8 對這一頁的程式改動 | 共用相機（`hex-camera.tsx`）在移動後多呼叫一次 `invalidate()`，讓 `frameloop="demand"` 下的移動一定會被畫出來；點擊與取景的邏輯沒有改。這一頁對 `main` 的整個視窗逐像素比對差異 0 |

判斷：無法重現，沒有證據指向 P8 的改動；依「能重現才修」沒有修改測試或產品。可能的原因是測試的 `settled()` 只確認標記相隔 100 ms 兩次位置相同，場景晚一拍重繪時會在舊位置點擊（與 P1-19 同類），但**這是推測，沒有 trace 佐證**——那次失敗的執行沒有開 trace。記為 P1-36；之後的全套 E2E 一律加 `--trace retain-on-failure`。

