# 22 T.2F iPAS 發布準備與審核作業

本輪目標：在不核准、不發布任何題目的前提下，建好 iPAS 200 題正式發布前的工程準備。

- 審核作業：見 §1。
- 發布前檢查（preflight）：見 §2。
- CI 安全關卡：見 §3。
- 瀏覽器驗收：見 §4。

本輪**沒有**做的事：

- 建立任何人工核准紀錄。
- 發布任何題目。
- Push、Merge、Deploy。

## 0. 基準（2026-11-05）

| 項目 | 值 |
|---|---|
| Branch | `trials/mvp` |
| 起點 HEAD | `ec09728` |
| iPAS 題庫 | 200 題：L11 100 題、L12 100 題，全部是 `in-review` 的第 1 版 |
| 審核帳本 | 0 筆審核、0 筆發布 |
| 既有已發布題 | 53 題 |
| `published-hashes.json` | 57 筆。T.2F 起由 `tests/fixtures/published-hashes-baseline.json` 凍結作為回歸基準 |

## 1. 審核作業（A1）

工具：`scripts/trials/review.ts`，對應 `pnpm trials:review`。

純函式放在 `src/lib/trials/review-ops.ts`，不被任何頁面或元件引用；`tests/trials-exposure.test.ts` 檢查這一點。

| 指令 | 用途 | 是否寫入 |
|---|---|---|
| `status [--exam X]` | 各批次進度；各科目、各考綱的配額、題庫數、已核准與已發布數、尚缺發布、未核准配額 | 只讀 |
| `queue [--subject s1] [--syllabus L11302] [--sort risk] [--limit N]` | 待審題目清單，可依科目或考綱篩選、依風險排序 | 只讀 |
| `packet <批次> --out <dir>` | T.2C 原有：依批次產生審核封包 | 只寫到 `--out` |
| `packet --subject s1 [--syllabus …] [--sort risk] --count 10–25 --out <dir>` | 依篩選與風險排序產生 10–25 題的審核封包，附決定檔範本 | 只寫到 `--out` |
| `summary [--out file.md]` | 匯出審核摘要：各科進度、配額表、風險前 25 題。只列題號與數量，不含題幹、選項、答案或解析 | 只寫到 `--out` |
| `apply <決定檔> [--confirm N]` | T.2C 原有：人工決定寫入帳本，全部成功或全部不寫 | 寫入帳本 |

### 1.1 風險分數

風險分數只決定審核順序，不是審核結果。分數由審核佇列 `docs/exam-system/data/ipas-review-queue.json` 的 AI 檢查標記計算：

| 項目 | 加分 |
|---|---:|
| priority 1 | +100 |
| priority 2 | +50 |
| 法規（legal） | +30 |
| 相似性中 | +20 |
| 易變 | +20 |
| 匯入前重新設計 | +15 |
| 每個「避免同卷」的題目 | +5 |
| 有「待人工確認」事項 | +10 |

目前最高分是 165 分，有三題，都是 L12303 的法規加易變題：`d-94`、`h-195`、`h-199`。

### 1.2 不變的保證

- 封包的決定檔範本中，`verdict` 全部是 `null`。只有人工填寫，並經 `apply --confirm N` 寫入帳本後才算數。
- `apply` 仍然逐題比對修訂版與 hash（T.2C）。題目內容一有變動，舊決定就不能套用。
- AI QA 只提供排序建議，沒有任何指令會產生審核紀錄。

### 1.3 目前進度

| 科目 | 題庫 | 審稿中 | 已核准 | 已發布 | 距可組卷尚缺發布 |
|---|---:|---:|---:|---:|---:|
| L11 人工智慧基礎概論 | 100 | 100 | 0 | 0 | 50 |
| L12 生成式 AI 應用與規劃 | 100 | 100 | 0 | 0 | 50 |

- 每個考綱項目的題庫數都是每卷配額的 2 倍。
- 要讓一科能組卷，至少要有「每個考綱項目都達到配額」的 50 題已發布題。
- 這 50 題全部要經過人工核准與發布閘門。

## 2. 發布前檢查（A2）

工具：`scripts/trials/preflight.ts`，對應 `pnpm trials:preflight`；檢查邏輯在 `src/lib/trials/preflight.ts`。

- 只讀：不寫檔，不核准，也不發布。
- 結束碼：
  - **0**：全部通過，可能帶警告。
  - **1**：任一檢查失敗。
  - **2**：參數錯誤，例如基準檔不存在、`--build` 不是完整的 build、`--probe` 指向本機以外的位址。

| 檢查 | 內容 | 失敗條件 |
|---|---|---|
| Bank validates | `validateTrials` | 任何錯誤 |
| Publication ledger | 帳本格式、審核者角色、hash、每筆發布之前都有同版本的人工核准 | 題目狀態與帳本不符；T.2C 之後的題目出現非人工的審核紀錄，或紀錄不是來自帳本 |
| Revision / hash | `published-hashes.json` 的每筆紀錄都等於該修訂版的內容 hash；已發布題就是當時發布的內容 | hash 被竄改、修訂版不存在、發布紀錄過期 |
| Published hash regression | 與基準相比，57 筆既有 hash 一筆不少、一筆不變；新增的每筆都有帳本中的發布紀錄 | 刪除、改值，或繞過閘門新增 |
| Unpublished exposure（資料） | 可遊玩題目全部是已發布題；固定試卷與動態試卷只引用已發布的修訂版 | 未發布題出現在題目清單或試卷中 |
| Syllabus coverage | 各 blueprint 的已發布題池距離配額還差多少 | 只在 `--require-ready <exam>` 時，未達配額才算失敗 |
| Exam assembly | blueprint 健全；以全題庫試算（不發布）每科抽 50 個 seed，以及已就緒的題池 | 配額不符、重複題、抽到題池外的題目 |
| Conflict graph | 75 組，不得自我衝突、重複或跨科 | 任何一項 |
| Volatile review dates | 易變題都有 `reviewBy`；30 天內到期列為警告 | 已發布的易變題過期，或有試卷的考試版本過期 |
| Official brochure version | 官方規格模式的時間、題數、總分與及格分數等於科目的官方格式；及格依據寫明簡章版本（115.04） | 任何不一致；來源超過 180 天未查證時只列警告 |
| Client bundle leakage（`--build`） | 掃描 `.next/static` 與預先產生的頁面，檢查是否含未發布題的 ID、題幹片段、未就緒試卷的 ID 或審核檔名 | 任何命中 |
| Runtime route exposure（`--build`） | 預先產生的 `/trials` 路由只限於可用的考試與試卷；不得有 route handler | 多出的路由或 API |
| Runtime probe（`--probe`） | 向本機伺服器請求允許的路由（應為 200）與未就緒的 iPAS 路由（應為 404），並檢查回應內容 | 狀態碼不符，或回應含有洩漏字串 |

### 2.1 本輪執行結果

- 資料檢查：10 項全部 PASS（包含 Bank validates）。iPAS 兩科都是「尚缺 50 題，維持題目準備中」。
- 全題庫試算抽卷：每科 50 個 seed，0 衝突，題型差距 0。
- 加上 `--require-ready ipas-aiap-basic` 時，正確回傳 exit 1。
- `--build`：結果見 §3.3。

### 2.2 洩漏比對字串的來源

- 比對字串由題庫自動產生：未發布題的 ID、每題題幹第 8 到 24 字，以及未就緒試卷的 ID。
- 已發布題的題幹或選項含有的字串會先剔除，避免把已公開的內容誤判為洩漏。
- 目前共 406 個比對字串。

## 3. CI 安全關卡（A3）

Workflow：`.github/workflows/trials-ci.yml`。

本輪只建立在本機 commit，**沒有 push**，所以 GitHub 上還沒有執行過。

| 步驟 | 指令 |
|---|---|
| TypeScript | `pnpm exec tsc --noEmit` |
| ESLint | `pnpm lint` |
| 帳本完整性、hash 回歸、未發布曝光（測試） | `vitest run` exposure、lifecycle、release-preflight、ipas-expansion |
| Trials tests | `vitest run tests/trials` |
| Full Vitest | `vitest run --maxWorkers=2` |
| Release preflight（資料） | `pnpm trials:preflight` |
| Production build（開啟功能旗標） | `pnpm build` |
| Release preflight（bundle 與路由） | `pnpm trials:preflight --build .next` |
| Release preflight（執行期探測） | `next start` 綁 127.0.0.1:3119 後加 `--probe` |

安全設計：

- `permissions: contents: read`。
- 沒有任何部署、發布或 push 步驟。
- 功能旗標只在 build 與 start 兩步開啟，測試照常在旗標關閉下執行。
- curriculum 測試需要 JDK 25（`actions/setup-java`）；g++ 與 python3 由 runner 內建。

### 3.1 T.2E 的 Full Vitest 1782/1783 逾時分析

| 情況 | `highlight.test.ts`「1904 programs」所需時間 |
|---|---|
| T.2E 全套件，機器高負載 | 5030 ms，超過 5000 ms 上限而失敗 |
| 單獨執行三次 | 3086、2721、2511 ms |
| 全套件 50% workers（本輪第一次，未設 JDK，Java 測試被跳過） | 3812 ms，通過 |

結論：

- 這不是功能缺陷。斷言本身每次都通過，只是單一測試把 1904 支程式都放在同一個 `it` 中，正常耗時就占上限的 50–75%。
- 同一台機器上另有其他 session 同時執行完整 Vitest（執行當下有 2 個其他 vitest 程序，load average 7–10），資源競爭就足以讓它逾時。

修正方式：

- 改為每種語言一個測試（C++、Java、Python、JavaScript、SQL），程式與斷言都完全不變。
- 單獨執行時，最慢的 C++ 約 1.3 s。
- 沒有放寬逾時上限，也沒有刪減任何斷言。

### 3.2 修正後的全套件結果

兩次都在隔離複本中執行，都設定了 JDK 25，0 個跳過：

| 並行度 | 當下狀況 | 結果 | 耗時 | 最慢的語言測試（C++） |
|---|---|---|---|---|
| `maxWorkers=50%`（6 workers） | 另有 2 個其他 session 的 vitest 程序，load 9.7 | **60 個檔案，1804/1804 通過** | 276.8 s | 1711 ms |
| `maxWorkers=25%`（3 workers） | 沒有其他 vitest 程序，load 4.9→9.6 | **60 個檔案，1804/1804 通過** | 234.7 s | 1341 ms |

- 1804 題測試，比 T.2E 多 21 題：新增的 preflight 與審核測試 17 題，加上 highlight 測試拆分後多出的 4 題。
- 兩次都是整套一起跑通過，不是靠單獨重跑。
- 拆分之後，最慢的語言測試在高負載下也只用掉上限的 34%。
- CI 的 runner 有 4 核，所以 CI 用 `--maxWorkers=2`。

### 3.3 本輪完整工程驗證（`08ac725` 的乾淨快照）

驗證環境：

- 以 `git archive HEAD` 建立的複本，不含 Theme Session 未提交的五個檔案。
- 設定 JDK 25。
- 這就是 CI 會執行的同一組關卡，只是在本機跑。

| 關卡 | 結果 |
|---|---|
| TypeScript | TSC_OK |
| ESLint | ESLINT_OK |
| Trials tests | 17 個檔案，220/220 |
| Full Vitest（`maxWorkers=50%`，load 8.8） | 60 個檔案，**1804/1804**，0 跳過，283.7 s |
| Preflight（資料） | 10 項 PASS，exit 0 |
| Production build（開啟功能旗標） | BUILD_OK；build 輸出中沒有任何 iPAS 路由 |
| Preflight `--build .next` | 掃描 834 個 client 與預先產生的檔案，406 個比對字串 0 命中；111 條預先產生路由中，`/trials` 下的 11 條全部在允許清單內 |
| Preflight `--probe http://127.0.0.1:3122` | 21 條路由，狀態碼與回應內容全部符合，exit 0，伺服器已停止 |

## 4. 瀏覽器驗收（A4）

### 4.1 為什麼要用 Fixture

- iPAS 目前沒有任何已發布題，所以真實的 build 不會產生 iPAS 模擬考頁面（路由是 404，這正是預期的安全行為）。
- 要在瀏覽器驗收，只能使用**測試專用的 Fixture build**：
  1. 用 `git archive HEAD` 建立一份**沒有 `.git` 的拋棄式複本**，放在 scratchpad。
  2. 執行 `node e2e/fixtures/ipas-published-fixture.mjs <複本>`。它只修改複本的 `src/content/trials/index.ts`，讓 iPAS 題「視為已發布」。在 git 工作樹上執行會被拒絕（exit 2）。
  3. 以 `LOGIC_ISLAND_TRIALS=1` build，只在 `127.0.0.1:3121` 啟動伺服器，測試完即停止並刪除。
  4. 執行 `IPAS_FIXTURE=1` 的 `e2e/trials-ipas-mock.spec.ts`，跑桌面版（1440×1000）與手機版（iPhone 13）兩個 project。
- 這個 spec 在一般 build 中會自動跳過。
- 正式工作樹、題庫狀態、帳本與 `published-hashes.json` 都**沒有改變**。

### 4.2 涵蓋項目

| 項目 | 測試 |
|---|---|
| 官方規格 75 分鐘、及格依據 | official-style |
| 延長練習 120 分鐘、不顯示通過 | extended practice |
| 動態抽題導覽（上一題、下一題、題號導覽、焦點移動） | extended practice |
| 標記稍後檢查 | extended practice |
| 交卷確認：未作答與標記數、繼續作答 | extended practice |
| 自動逾時交卷（Playwright clock 快轉 75 分鐘） | timeout |
| 重新整理後接續同一份抽題 | extended practice |
| 失效 session 阻擋：題目 hash 不符時不重抽、不評分，可放棄 | invalid session |
| 成績、各考綱表現、錯題篩選與解析、錯題本 | extended practice |
| 桌面版與手機版無水平捲動 | 各測試的 `noSideways` |

### 4.3 結果（2026-11-05）

- **Playwright**：5 個測試 × 2 個 project（desktop-chromium、mobile-chromium iPhone 13），**10/10 通過**，console 沒有錯誤。中途修正了測試本身的 3 處選擇器：
  - 「75 分鐘」與「120 分鐘」兩處文字比對不夠精確。
  - 結果頁的表格要以名稱指定，因為題目內容中也有表格。
  - 延長模式頁面上的「通過」字樣其實出自「不顯示通過與否」的說明。斷言已改為「沒有及格判定」。
  
  產品程式沒有任何修改。
- **陽性對照**：以正式工作樹的 preflight（真實題庫，iPAS 未發布）掃描這份 Fixture build：
  - `bundle-leak` 與 `routes` 兩項都正確判定失敗，exit 1。
  - 抓到多出的 9 條 `/trials` 路由（4 份試卷各有試卷頁與結果頁，再加上考試頁），以及預先產生的頁面中出現的未發布題 ID。
  
  這證明洩漏與路由檢查確實有效。
- **截圖**：桌面版與手機版的作答頁、結果頁各一張，只存在 scratchpad，因為畫面含有未發布的題目內容。
- **清理**：伺服器（127.0.0.1:3121）在測試結束時由 Playwright 停止，Fixture 複本與它的 `.next` 都已刪除。

沒有驗證的項目：

- 真機，包括 iOS Safari 與 Android Chrome：本輪只做模擬手機。
- 正式部署環境。
- 75 分鐘的實際時間流逝：用 Playwright clock 快轉代替。
- 正式（非 Fixture）build 中的 iPAS 頁面：本來就不存在，這是預期行為。

## 5. 已知安全限制

- **作答與計時只在瀏覽器端**：localStorage 加上前端計時，沒有伺服器端驗證。修改瀏覽器資料或系統時間可以影響計時與成績。頁面已註明這點；練習用途可以接受，不能作為正式測驗。
- **洩漏掃描是比對字串，不是語意比對**：改寫過的題目內容不會被抓到。真正的防線仍是「未發布就不進入頁面資料」（exposure 測試與 `playableQuestions`）。
- **伺服器端程式碼本來就含有題庫模組**：題庫模組會出現在 `.next/server` 的 chunk 中，這是預期的（T.2E 已記錄）。只要部署環境不公開 `.next/server`，就不會外流。
- **CI 尚未在 GitHub 上實際執行**：本輪不 push。`pnpm/action-setup` 與 `setup-java@v4` 的 temurin 25 能否取得，要等第一次推送後確認。
- **官方簡章與考綱的查證日期是 2026-11-03**：preflight 在超過 180 天時會發出警告，但官方是否已改版仍須人工查證。

## 6. 正式發布前必須由人類執行的步驟

1. **審核**：
   1. 以 `review.ts packet --subject s1 --sort risk --count 25 --out <私人目錄>` 產生審核封包，從高風險題開始審。
   2. 逐題作答並核對答案、解析與「待人工確認」事項。法規題須經法務確認。
   3. 在決定檔填入 `approve`、`changes` 或 `reject` 與必要的 checks。
2. **寫入帳本**：先執行 `review.ts apply <決定檔>` 做 dry run，再加 `--confirm N` 寫入。
3. **發布**：執行 `publish.ts <id>@<rev> … --by owner --at YYYY-MM-DD`，先 dry run，再加 `--confirm N`。
4. **確認配額**：重複以上步驟，直到 `review.ts status` 顯示某科「可以組卷」，也就是每個考綱項目的已發布題都達到配額。
5. **確認官方資料**：重新查證 115 年度簡章與考綱是否改版。有改版就更新來源與 blueprint。
6. **本機發布前檢查**：
   ```bash
   pnpm trials:preflight --require-ready ipas-aiap-basic
   ```
   接著依序執行 build、`--build .next` 與 `--probe`，全部必須通過。
7. **推送與 CI**：推送分支，確認 CI 全部通過。由人類決定 merge 與部署。
8. **部署後**：以正式網址確認 iPAS 頁面只顯示已發布的題目。
