# 31 T.3G 帳本事件排序與既有固定卷退場

日期：2026-11-09。範圍：修正「同一天撤回與重新核准」的授權順序漏洞，為帳本建立可驗證的事件順序與 replay，讓 53 題既有已發布題所在的固定卷可以安全撤回並改版，同時保留歷史考卷、作答紀錄與錯題本。

**本輪沒有任何題目被核准、發布或撤回**，也沒有建立人工核准紀錄。CCAR-F 150 題與 iPAS 200 題全部維持 `in-review`；53 題既有已發布題、57 筆 published hash、429 筆 assessment manifest 逐字不變；真實帳本（`src/content/trials/ledger.json`）仍是 0 筆紀錄，檔案沒有被改寫。所有核准、發布、撤回都是記憶體中的 **SYNTHETIC** 演練。所有 CI 結果都是**本機驗證**：沒有 push，GitHub 上的 CI 沒有執行過。

前置文件：[19 審核與發布流程](19_T2C_REVIEW_PUBLICATION_LIFECYCLE.md)、[21 iPAS 題庫擴充與抽題考卷](21_T2E_IPAS_BANK_EXPANSION.md)、[30 發布治理](30_T3F_RELEASE_GOVERNANCE.md)

## 1. 基準（開始時）

| 項目 | 值 |
|---|---|
| Branch／HEAD | `trials/mvp`／`a20522a`（符合預期）；工作樹只有 Theme Session 的 5 個檔案與 `.claude/`（diff checksum `f612b09…`，結束時相同） |
| 其他 worktree | `logic-island-m3-ring`（另一個 branch，未觸碰；本輪期間它在跑 Playwright，機器 load average 約 13–20） |
| 題目 | 403 題：CCAR-F 150、iPAS 200、既有已發布 53；350 題審稿中、53 題已發布 |
| published hash／manifest | 57 筆／429 個版本（舊版雜湊 387、第 2 版 42） |
| 帳本 | 1 位審核者（`owner`），0 筆審核、0 筆發布、沒有 `revocations` |
| 固定卷 | 3 份，各 `1.0.0`：APCS 程式識讀 7 題、Bank IT 6 題、MOEX 114 普考 40 題，合計正好是 53 題既有已發布題 |

## 2. 帳本狀態機稽核（Phase 1）

以程式與測試確認，不假設它已是事件溯源設計：

| 問題 | T.3F 的實作 | 結論 |
|---|---|---|
| 核准、發布如何綁定版本 | 每筆紀錄有 `questionId`、`revision`、`hash`；核准只對同一內容有效 | 正確 |
| 撤回如何識別被撤回的發布 | 依同一 revision／hash 的發布與撤回「交替次數」推算 | 只能推算，紀錄本身沒有指名 |
| 重新發布如何判斷新核准 | `decision.at >= revoked.at`：核准**日期**不早於撤回日期即可 | **漏洞**：同一天「核准 → 撤回」也會通過 |
| 同日事件如何排序 | 只有日期，無法排序 | **無法分辨** |
| 重複事件 | 計數規則能抓出「發布兩次」「撤回多於發布」 | 無事件 ID，抓不到「同一事件重放」與「核准被重複使用」 |
| 舊帳本相容 | `revocations` 缺少時視為空 | 正確 |
| 撤回對已建立考卷的影響 | 抽題卷：撤回題離開題池；固定卷：題庫驗證拒絕重建 | 固定卷無法撤回（§4） |

T.3F 的允許轉移：`in-review →（人工核准）approved →（發布）published →（撤回）revoked →（核准日期 ≥ 撤回日期）approved →（--republish）published`。漏洞就在最後一段的日期比較。

## 3. 事件排序（Phase 2）

`src/lib/trials/ledger-order.ts`。採最小相容變更：帳本格式版本不變（`logic-island.trials-ledger/1`），沒有重寫任何既有紀錄，只在 T.3G 之後新增的紀錄加上欄位：

| 欄位 | 說明 |
|---|---|
| `seq` | 審核、發布、撤回共用的單調序號，從 1 開始、不得有缺號或重號 |
| `eventId` | `<kind>-<seq>-<16 位 SHA-256>`，雜湊涵蓋整筆紀錄（除了 ID 本身），所以改過或偽造的紀錄對不上 |
| `exam` | 認證 ID（T.3B 起已有；有 exam resolver 時必須正確） |
| `approval`（發布） | 這次發布所依據的核准事件 ID；**一個核准只能授權一次發布** |
| `withdraws`（撤回） | 被撤回的發布事件 ID；T.2C 之前發布的題目寫 `recorded-hash`，T.3G 之前的無序號發布寫 `unsequenced-publication` |

`checkLedger` 新增的檢查：事件 ID 與內容不符、有 ID 沒序號、序號重複、事件 ID 重複、序號缺號、同一清單中序號倒退、已排序事件之後出現無序號紀錄、序號越後日期越早、發布未指名核准、指名的核准不存在／內容不同／認證不同／不在發布之前／已被後來的決定取代、同一核准授權多次發布、撤回指名的發布不對。

順序判斷 `precedes(a, b)`：兩筆都有序號時比序號；否則比日期，**同一天視為未知**。

### 舊紀錄相容策略

- 沒有序號的紀錄（T.3G 之前寫入）保留原意，不補序號、不依檔案順序推定先後、不重寫。
- 只有日期能排序；日期嚴格較晚才算「之後」。同一天、無序號、而順序會決定授權的情況（重新發布、撤回），一律拒絕（fail closed）。
- 唯一保留舊讀法的地方：T.3G 之前「核准與發布同一天」仍視為核准在前（當時的發布閘門已經檢查過這件事）。
- 無序號的舊核准不能再授權新的發布（它沒有事件 ID 可被引用），需要新的人工核准。
- 遷移策略：不遷移。真實帳本目前 0 筆紀錄，所以沒有任何舊紀錄受影響；未來若出現無序號紀錄，`trials:ledger` 與 preflight 會以警告列出，`--base` 比對會拒絕任何「新增但沒有序號」的紀錄。

## 4. 重新發布授權（Phase 3）

`publish.ts --republish` 現在要求：

1. 有有效的撤回事件（目前 revision 已撤回）；
2. 撤回**之後**的人工核准（依序號；舊紀錄依嚴格較晚日期）；
3. 核准綁定相同 exam／question／revision／hash；
4. 撤回之前的核准無效，同一天但順序未知也無效；
5. 核准只能用一次（發布寫入 `approval`，帳本檢查重複引用）；
6. 不可跨認證（決定檔、`--exam`、帳本檢查三層）；
7. 重放帳本（同一事件出現兩次）會因事件 ID 重複與序號重複而失敗，replay 也不會讓它改變狀態。

另外，`planDecisions` 會拒絕「核准仍有效時的重複核准」。

| 測試情境（`tests/trials-ledger-ordering.test.ts`） | 結果 |
|---|---|
| 核准 → 撤回 → 重新發布 | 拒絕 |
| 撤回 → 核准 → 重新發布 | 通過（同一天也可以，依序號） |
| 同日核准在撤回之前 | 拒絕；並證明舊規則 `at >= at` 會放行 |
| 同日核准在撤回之後 | 通過 |
| 舊紀錄同日（無序號） | 拒絕，原因寫明「無法確認先後」 |
| 重複核准／重複發布／重複撤回 | 拒絕或標記；replay 狀態不變 |
| 缺序號、缺號、重號 | 標記 |
| 偽造或修改事件 ID | 標記 |
| 錯版本、錯雜湊 | 決定時拒絕；發布指名其他內容的核准時標記 |
| 錯認證 | 決定檔拒絕；帳本標記；replay 忽略 |
| 核准被重複使用 | 標記；replay 忽略第二次發布 |

## 5. 既有固定卷稽核（Phase 4）

| 項目 | 結果 |
|---|---|
| 固定卷 | `apcs-reading-mock-a`、`bank-it-mock-a`、`moex-114-pukao-3448`，皆 `1.0.0` |
| 題目歸屬 | 7＋6＋40＝53，正好是全部既有已發布題；沒有任何抽題卷含這些題目 |
| 組卷路徑 | `views.ts paperView` 把每個 item 從 `playableById` 取出（非空斷言） |
| Session | 開始時凍結 revision、hash、配分、選項順序與正解；`paperVersion` 存在 session |
| 成績、錯題本 | 成績在交卷時凍結；錯題本只存 questionId 與作答紀錄，題目內容由頁面提供 |
| 撤回失敗的真正原因 | `validateTrials` 把固定卷中任何不能出題的題目都視為錯誤，所以撤回後的重建被拒絕；即使通過，`paperView` 也會因 `playableById.get(...)!` 取不到而在 build 時崩潰 |
| 另一個既有缺口 | 固定卷的題目換版本時，卷的版本號不必跟著改（MOEX q01 已是第 2 版，卷仍是 `1.0.0`）；進行中的固定卷作答也不會偵測題目換版 |

沒有刪除固定卷中的題目，也沒有改動 53 題的 hash 或 revision。

## 6. 固定卷版本化設計（Phase 5）

不另建第二套考卷來源：`papers.ts` 仍是唯一來源，另加一個只能附加的登記檔 `src/content/trials/paper-versions.json`（格式 `logic-island.trials-paper-versions/1`），記錄每份固定卷每個版本的：paper ID、版本、exam、科目、時間、及格線，以及每題的 question／revision／hash／配分。

- 本輪登記了 3 個版本（共 53 題），每題的 hash 都等於 published-hashes 中的紀錄。
- 已登記的版本永遠不變：固定卷若解析出與登記不同的題目、revision、hash 或設定，就失敗（「a change to a fixed paper is a new version, never a silent substitution」）。
- 新版本由人寫入 `papers.ts`，再用 `pnpm trials:integrity --append --confirm N` 登記；CI 用 `--base-papers` 確認沒有改寫或刪除舊版本。
- `planPaperRevision` 只**提議**下一版：同樣題序、去掉已撤回題、每題固定 revision；不補題；並列出需要人決定的事（總分、及格線、官方原卷不再完整）。全部題目都撤回時拒絕提議，維持維護中。

## 7. 撤回行為（Phase 6）

`schema.ts withdrawnItems`：固定卷中狀態為 `revoked` 的題目使該卷進入**維護中**（衍生狀態，不需要人工設定，所以不會忘記）。

| 入口 | 行為 |
|---|---|
| 抽題模擬考（CCAR-F、iPAS） | 撤回題離開題池（T.3F），新 session 抽不到 |
| 固定卷 | 進入維護中：頁面資料不含撤回題（連 ID 都沒有），不提供「開始」，顯示「題目維護中」；試卷列表標示「題目維護中（暫停新作答）」 |
| 錯題本、題庫檢視 | `reviewViews` 只含可出題的題目；撤回題的紀錄保留，顯示「已撤回或下架，不再提供題目內容」 |
| 試煉入口路由 | 維護中的卷仍有路由（才能查看過去的成績），不能開始新作答 |
| 接續作答 | 見 §8 |

所有入口都依同一個判斷：題目狀態由帳本決定（`lifecycleOf` → importer 寫入 `revoked`），頁面只取 `playableById`。撤回題同時成為 exposure needle（ID 與題幹片段），leak scan 會擋下任何外洩。

## 8. Session 語意（Phase 6）

| 時機 | 行為 |
|---|---|
| 撤回在 session 建立之前 | 固定卷維護中，不能開始；抽題卷題池已排除 |
| 建立之後、交卷之前 | 不接續、不計時、不評分、不換題；顯示原因（「其中 N 題已撤回或不是當時的版本」或「試卷改版（第 X 版 → 第 Y 版）」），學習者可放棄 |
| 交卷之後 | 成績不變；結果頁標示「有 N 題之後已撤回…成績不受影響」，撤回題顯示為已撤回，不顯示內容 |
| 重新開啟歷史成績 | 若 session 的版本不是目前版本，標示「這次成績來自第 X 版」；session 的題目、revision、hash、配分與登記檔中該版本完全一致，可回溯 |

新增 `draw.ts unresumable`：固定卷也檢查題目是否仍是當時的版本，並檢查卷版本；抽題卷維持 T.2E 的語意（只看抽到的題目）。這也補上 §5 的既有缺口。

## 9. Replay（Phase 7）

`src/lib/trials/ledger-replay.ts`：獨立的第二種讀法。依序號（舊紀錄依日期，同日依審核 → 發布 → 撤回）逐筆套用狀態機：核准 → 可發布 →（發布，消耗核准）→ 上線 →（撤回，作廢任何核准）→ 已撤回。狀態機不允許的事件（沒有有效核准的發布、重複發布、撤回未上線的版本、別的認證的紀錄、同日無序號的撤回）會被回報並略過，不改變狀態。結果必須與 `lifecycleOf`／`exposureOf` 一致，不一致就代表帳本損壞。

| 驗證 | 結果 |
|---|---|
| 同一組事件 replay 兩次 | 狀態相同 |
| 交換核准與撤回的序號 | 預期中的不同狀態（核准變成在撤回之前，不再有效），兩邊讀法仍一致 |
| 重複事件 | 不改變狀態 |
| 撤回題 | 維持不上線 |
| 重新發布 | 需要撤回之後的新核准 |
| 舊帳本（真實帳本） | 0 事件，一致 |
| 刪掉一筆事件 | 缺號＋replay 違規，fail closed |

工具：`pnpm trials:ledger [--json] [--base base-ledger.json]`，唯讀；`--base` 檢查舊紀錄沒有被改寫、刪除，新紀錄都有序號且排在後面。Preflight 新增 `ledger-replay`。

## 10. 安全測試（Phase 8）

| # | 項目 | 測試 |
|---|---|---|
| 1 | 同日重新發布順序 | `trials-ledger-ordering`（同日前／後、舊紀錄同日） |
| 2 | 核准重複使用 | `trials-ledger-ordering`、`trials-publication-lifecycle` 9 |
| 3 | 重複事件 ID | `trials-ledger-ordering` |
| 4 | 序號碰撞 | `trials-ledger-ordering` |
| 5 | 舊事件順序不明 | `trials-ledger-ordering`（拒絕＋原因） |
| 6 | 跨認證授權 | `trials-ledger-ordering`、`trials-publication-lifecycle` 10、`trials-release-preflight` |
| 7 | 撤回題不進固定卷 | `trials-fixed-papers`、`trials-retirement-dom`、E2E |
| 8 | 固定卷維護中 | `trials-fixed-papers`、`trials-retirement-dom`、E2E |
| 9 | 歷史 session 保留 | `trials-session-retention`、`trials-retirement-dom`、E2E |
| 10 | 進行中 session 失效 | `trials-session-retention`、`trials-retirement-dom`、E2E |
| 11 | 錯題本歷史相容 | `trials-session-retention`、`trials-retirement-dom` |
| 12 | 不外洩未發布答案 | `trials-retirement-dom`（頁面資料不含撤回題 ID 與題幹）、fixture build 掃描 0 命中、leak scan |

另有：靜默換題、同版本換 revision、改寫或刪除登記版本、登記版本指向錯誤認證、登記題目不在 manifest、帳本 `--base` 改寫／刪除／無序號附加／序號重排。

## 11. 跨認證回歸（Phase 9）

CCAR-F、iPAS 與既有已發布考試都在隔離 fixture build 中測試；fixture 只存在於丟棄式副本，不進入正式 build。退場 fixture（`e2e/fixtures/legacy-withdrawal-fixture.mjs`）把 `orig-apcs-read-03` 視為已撤回，可與已發布 fixture 疊加在同一副本（本輪三者疊加，build 一次）。

| 範圍 | 驗證 | 結果（本機） |
|---|---|---|
| CCAR-F 150 題、60 題組卷、120 分鐘官方規格、150 分鐘練習、複選題、接續作答、成績、錯題本 | fixture E2E（桌面＋iPhone 13） | 12／12 |
| CCAR-F 撤回排除 | `trials-publication-lifecycle` 5（300 個 seed 都抽不到） | 通過 |
| CCAR-F 抽卷品質 | 10,000 seeds strict：10,000 成功、10,000 份不同考卷、0 違規、0 fallback、0 從未抽到、0 每卷必出；p50 0.225、p95 0.831、p99 1.342 ms | 通過 |
| iPAS 200 題、L11／L12、官方規格／練習、只用已發布題、成績 | fixture E2E（桌面＋iPhone 13） | 12／12 |
| iPAS 抽卷品質 | 1,000 seeds：s1 p99 0.575 ms、s2 p99 0.844 ms | 通過 |
| APCS、MOEX、Bank IT（真實 build） | `e2e/trials.spec.ts` | 10 通過；32 依設計略過（flag off 2、fixture spec 30） |
| 固定卷退場、歷史成績保留 | 退場 fixture E2E（桌面＋iPhone 13） | 6／6；fixture build 中撤回題 ID 0 命中（對照題有命中） |

## 12. Release Preflight 與 CI（Phase 10）

- Preflight 從 16 項變成 18 項（本機 `--build --probe` 18／18 通過；834 個檔案、709 個關鍵字 0 命中；111 個預先產生路由、/trials 11 個；實際請求 38 個路由）。資料檢查新增 2 項：`ledger-replay`（事件順序與 replay 一致性）、`paper-versions`（固定卷登記、維護中狀態、登記題目必須有 manifest 指紋＝歷史 session 可驗證）。`cross-exam` 加上登記版本的認證檢查。缺少登記檔時判定失敗。
- `trials:integrity` 也驗證固定卷登記檔，`--append` 會一併登記新的固定卷版本，`--base-papers` 檢查只增不改。
- `trials:quality` 的報告與 JSON 加上該考試的帳本段落（紀錄數、序號數、問題），帳本問題會讓 gate 失敗。
- CI 新增 `Ledger order and replay` 步驟（`--base` 取 base commit 的 ledger），integrity 步驟加上 `--base-papers`；新增報告 `trials-ledger.json` 留存為 artifact；測試清單加入 4 個新測試檔。
- 全部唯讀、可重現、fail closed、輸出 JSON；報告只有 ID、版本、hash、事件 ID 與計數，不含題目內容或答案。CI 不核准也不發布。

## 13. 剩餘風險

- 人工審核仍未開始；認證條款合規性仍未確認。
- GitHub CI 從未在遠端執行；`--base` 與 `--base-papers` 要等 push 後才真正比對。
- 事件 ID 綁定內容，但沒有簽章：有權限的人可以重新計算 ID 並在同一個 commit 改寫帳本；`--base` 比對與 code review 是防線。
- 固定卷改版仍需要人工決定總分、及格線，以及官方原卷缺題時是否乾脆維持維護中。
- 維護中的固定卷仍佔用路由與試卷列表位置（才能讀取歷史成績）。
- 錯題本只存 questionId，沒有存 revision 的完整內容；撤回後只能顯示「已撤回」，無法再練習該題。
- 本機驗證期間另一個 Session 造成高負載，CLI 子程序測試在全部平行執行時可能超過 5 秒逾時（單獨執行通過）；GitHub runner 上未驗證。
- 沒有真機與螢幕閱讀器實測。

## 14. T.3H 建議

1. 用 T.3F 的審核包開始人工審核（B35 起），產生第一批有序號的真實核准。
2. 做一次真實的小規模發布，加上撤回、重新核准、重新發布的完整演練（真實帳本、有序號）。
3. Push 一次讓 GitHub CI 實際執行，確認 `--base`／`--base-papers` 與 artifacts，並把 trials-ci 設為必須通過。
4. 決定 MOEX 官方原卷的撤回政策（維持維護中，或改版為「缺題練習卷」）。
5. 評估帳本事件簽章（例如以 commit 簽章或外部時間戳記錄每批事件）。
6. 錯題本記錄作答時的 revision／hash，讓題目改版後能說明「你當時答的是第幾版」。
