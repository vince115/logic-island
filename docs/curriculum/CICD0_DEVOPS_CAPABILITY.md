# CICD-0：DevOps 與 CI/CD 島的 `devops-explorer` 課程能力

> 2026-11-23。目標：讓 DevOps 與 CI/CD 島（`devops-cicd`，前綴 CICD，15 堂）可以撰寫、驗證、發布。本階段**不寫任何課程內容**，只把島嶼登錄為預備島嶼、建立逐課的活動對應，並建好新能力 `devops-explorer` 的 **D1**（部署紀錄與 DORA 指標）與 **D2**（部署模擬，`deployment-simulator` 活動）。本文件是終端機引擎階段 **E25–E31** 與 `devops-explorer` 階段 **D1–D4** 的唯一說明處：D1、D2 在此完整規定（§5–§9），其餘是規劃中的階段與範圍（§10）。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| CICD-0（登錄） | `PREPARED_ISLAND_IDS = ['devops-cicd']`、前綴 `CICD`、`UNITS['devops-cicd'] = []`、`cicdFromBlueprint` 與逐課的 `CICD_SHAPES`；沒有課程、頁面、旗標、3D、GLB 或 `mapState` 的改動 |
| 新能力 `devops-explorer` | `content.devops`（`src/lib/devops/types.ts`）、`devopsContentProblems`（`check.ts`，由 `validateContent` 呼叫）、元件 `src/components/curriculum/devops-explorer.tsx` 與 `devops-lesson.tsx`；可以和 `terminal`、`visualization` 一起宣告，不和其他能力配對 |
| D1 `history`（已完成，§5） | 課程撰寫的部署紀錄（每次部署的變更提交時間、上線時間、是否造成故障、偵測與恢復時間），算出四個 DORA 指標；時間軸圖與等效表格 |
| D2 `rollout`（已完成，§6） | 部署模擬：一組相同的執行個體從舊版本換到新版本，逐分鐘模擬重建、滾動更新、藍綠部署、金絲雀發布（含閘門與中止）、資料庫的擴充與收縮、功能旗標；三張圖與逐分鐘的表格 |
| 練習（§7） | `number`、`field`、`choice`、`table` 四種填答形式，查詢 `dora`、`dora-best`、`rollout`、`rollout-best`；以及 `rollout-plan`（學習者設定策略參數，模擬後檢查條件）。答案一律由模擬器算出，**不寫在課程資料裡** |

不新增任何執行期套件；沒有亂數，所有數字是整數運算，伺服器的畫面與瀏覽器一致。D1、D2 是**自創的教學模型**，不宣稱符合任何調度系統、負載平衡器、雲端或監控產品的語意；用到 maxSurge／maxUnavailable 這兩個詞時，只有「百分比怎麼取整」照 Kubernetes 的做法（§6.4），讓之後 KUB 島的 `cluster-sim` 不會互相矛盾。

## 2. 活動對應（`cicdFromBlueprint`，`src/content/curriculum/lessons.ts`）

**刻意的不同**：其他島是「一種藍圖活動對一種課程形狀」，本島改用**逐課的表格** `CICD_SHAPES`（15 列，每一列都在測試中逐一斷言），因為同一個 `case-study-board` 在 CICD01、CICD08、CICD14 需要不同的工具。

| 課 | 藍圖活動 | 課程活動 | 能力 | 需要的階段 | 理由 |
|---|---|---|---|---|---|
| CICD01 | case-study-board | `deployment-simulator` | devops-explorer | D1 | 入門課，沒有 Linux 先修；DORA 指標由部署紀錄算出。終端機課會假設大綱沒有要求的 Shell 能力 |
| CICD02 | decision-simulation | `terminal-sim` | terminal | E25、E26 | 真實的 git 與 Pull Request：merge 或 rebase、保護規則，用做的來決定 |
| CICD03–05 | pipeline-sim | `terminal-sim` | terminal | E25–E28 | 真實的 workflow 檔案，真的執行 |
| CICD06、CICD07 | pipeline-sim | `terminal-sim` | terminal | E25–E29 | 加上快取、產出物、環境變數與 secret |
| CICD08 | case-study-board | `terminal-sim` | terminal | E25–E29 | 和 LNX01、SRV13、DKR12 相同：遮蔽、`gh secret`、外洩、輪替、script injection |
| CICD09 | pipeline-sim | `terminal-sim` | terminal | E25–E31 | 環境、核准與部署主機 |
| CICD10 | deployment-simulator | `deployment-simulator` | devops-explorer（可選加 terminal） | D2 | 比較策略的成本與風險需要「機群隨時間變化」的模擬；可選的終端機例子用 E15 nginx 的 `upstream` 權重接兩個 E20 容器（`cicdFromBlueprint(…, true)`） |
| CICD11 | monitoring-dashboard | `monitoring-dashboard` | devops-explorer | D3 | 時間序列與告警門檻在終端機裡教不好 |
| CICD12 | monitoring-dashboard | `monitoring-dashboard` | devops-explorer、terminal | D3、D4 | 探索器裡的日誌、關聯與遮蔽，加上在 ssh 主機上對 JSON Lines 日誌真的 `grep`（E2、E7 已有） |
| CICD13 | pipeline-sim | `terminal-sim` | terminal、devops-explorer | E25–E30、D2 | 終端機裡以 `workflow_dispatch` 或 `git revert` 回滾；旗標與資料庫遷移在部署模擬器 |
| CICD14 | case-study-board | `terminal-sim` | terminal、devops-explorer | E31、D3 | 終端機裡的止血演練；事故時間線、偵測與恢復時間、嚴重等級取自儀表板資料 |
| CICD15 | challenge-stages | `challenge-stages` | terminal、devops-explorer、visualization | E25–E31、D2、D3 | 和 DKR15 相同的形狀 |

- 每一列都可以**先對應**，即使它需要的階段還沒建好；但課程內容（`content.terminal` 的新 profile、`content.devops` 的儀表板）不存在時課無法發布。
- **CICD11、CICD12** 對應到 `monitoring-dashboard`，這個活動在 D3（CICD-4）才登錄；在那之前 `cicdFromBlueprint` 拋出「the monitoring-dashboard activity is not registered yet (it is built with D3)」。
- `pipeline-sim`、`case-study-board`、`decision-simulation` 只是藍圖的名稱，**不加入** `LESSON_ACTIVITIES`（登錄它們會被當成已實作的活動）。`/learn` 上規劃中的 `cicd-pipeline` 實驗室（活動 `pipeline-sim`）保持規劃中。
- 其他島的 `deployment-simulator` 課（SA18、DL24、OPS03／06／07／08、CLD03／10／11）與 `monitoring-dashboard` 課（OPS13／14／19、KUB12）之後會沿用同一個模型，所以模型保持通用（版本、執行個體、流量），不為本島過度設計。
- `cicdFromBlueprint` 對其他島的課回報「not a DevOps and CI/CD lesson」；標題、目標、概念、難度、先修取自藍圖。

## 3. 島嶼與活動的登錄

- `src/content/curriculum/schema.ts`：`PREPARED_ISLAND_IDS = ['devops-cicd']`、`LessonPrefixWritten` 加上 `'CICD'`、`ISLAND_PREFIX['devops-cicd'] = 'CICD'`。**不**移入 `ISLAND_IDS`（CICD-1 才移入，放在 `network-servers` 之後，系統區的順序）。
- `src/content/curriculum/units.ts`：`'devops-cicd': []`。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 CICD 課（「devops-cicd is prepared for authoring, not a curriculum island yet」）。15 堂仍是規劃中、沒有頁面；已發布的課與頁面不變。
- `LESSON_CAPABILITIES` 加上 `devops-explorer`；`LESSON_ACTIVITIES` 加上 **`deployment-simulator`**（只有它；`monitoring-dashboard` 在 D3 才加入），`CAPABILITY_ACTIVITY['deployment-simulator'] = 'devops-explorer'`，`DEVOPS_ACTIVITIES = ['deployment-simulator']`。
- **活動登錄的影響**（`src/content/world/activities.ts`）：活動是否「已實作」的既有規則是「有完整的課使用它」（或它是已實作的單一工具實驗室）。`deployment-simulator` 本來就因為藍圖的 10 堂課出現在登錄中，狀態是 `planned`；加入 `LESSON_ACTIVITIES` **不改變**它的狀態、版本或科目，要等第一堂用它的完整課（CICD01）發布才變成 `implemented`。`IMPLEMENTED_TEXT` 加上它的文字說明，同時規則改為「說明只在活動已實作時採用，規劃中的活動一律寫『必要：實作時提供與畫面等效的文字說明』」；其他有說明的活動全部已實作，所以登錄的其他內容逐字不變（`tests/devops-capability.test.ts` 斷言）。
- `tests/llm-capability.test.ts` 原本斷言「沒有預備中的島」（`[]`），現在改成恰好是 `['devops-cicd']`（同樣嚴格）。

## 4. 批次與階段

課程編號即位置，依序連續發布；每一批先完成它需要的階段，再寫課。

| 批次 | 課程 | 先完成的階段 |
|---|---|---|
| CICD-0 | 無 | 登錄與對應（§2、§3）、本文件、**D1**、**D2**（已完成） |
| CICD-1 | CICD01–02 | E25 `git`、E26 `forge` |
| CICD-2 | CICD03–05 | E27 `workflows`、E28 `actions` |
| CICD-3 | CICD06–08 | E29 `artifacts` |
| CICD-4 | CICD09–11 | E30 `environments`、E31 `deploy-hosts`、D3（登錄 `monitoring-dashboard`） |
| CICD-5 | CICD12–14 | D4 |
| CICD-6 | CICD15 | 無（綜合專題單獨一批，和 DKR-6 相同） |

- **CICD-1 的調整（2026-11-23）**：CICD-1 只發布 CICD01（D1）並開放島嶼；CICD02 需要 E25、E26，和這兩個階段一起移到下一批（[DEVOPS_CICD_ISLAND](DEVOPS_CICD_ISLAND.md)）。CICD01 發布後 `deployment-simulator` 在活動登錄中改為已實作。
- D2 在 CICD-0 完成，所以 `deployment-simulator` 不會在只有部署紀錄面板時就被標成已實作（CICD01 只用 D1，但它發布時 D1、D2 都已存在）。
- CICD10、CICD13 沿用 D2；CICD14 沿用 D3。
- 先修：LNX13（CICD04）與 DKR11（CICD06）已發布。CICD07 教環境別的設定，用 E29 的環境層級變數與 E24 的 `needsEnv` 提早失敗，不需要 E30。

## 5. D1：部署紀錄與 DORA 指標（`src/lib/devops/history.ts`）

### 5.1 資料

```ts
interface DeploymentHistory {
  service: string;
  days: number;                       // 量測期間 1–366 天
  deployments: {
    id: string;
    commitAt: number[];               // 這次部署帶上的每個變更的提交時間
    deployedAt: number;
    failure?: { startedAt?: number; detectedAt: number; restoredAt: number };  // 造成正式環境故障時
  }[];
}
```

時間一律是**整數分鐘**，從期間的第 1 天 00:00 起算（第 1 天是第 0–1439 分鐘）；畫面寫成「第 d 天 hh:mm」。

### 5.2 指標（名稱用 DORA 目前的說法）

| 指標 | 中文 | 算法 |
|---|---|---|
| deployment frequency | 部署頻率 | 期間內的部署次數 N、有部署的日子數、平均每週 N × 7 ÷ days，**四捨五入到小數點後一位**（內部以十分位整數 `roundHalfUp(N × 70, days)` 保存） |
| change lead time | 變更前置時間 | 每個**變更**（不是每次部署）的 `deployedAt − commitAt`，取中位數 |
| change fail rate | 變更失敗率 | 造成故障的部署 ÷ N，**整數百分比，四捨五入** |
| failed deployment recovery time | 失敗部署復原時間 | 每次失敗部署的 `restoredAt − startedAt`（`startedAt` 省略時就是 `deployedAt`），取中位數；旁邊顯示偵測時間 `detectedAt − startedAt` 的中位數 |

### 5.3 固定的算術規則

- **四捨五入**：a ÷ b（a ≥ 0、b > 0 的整數）四捨五入是 ⌊(2a + b) ÷ 2b⌋，也就是 .5 一律進位（82.5 → 83）。
- **中位數**：由小到大排序；個數是奇數取正中間；偶數取中間兩個的平均，再四捨五入到整數分鐘。
- 沒有失敗的部署時，復原與偵測時間的中位數不存在（畫面寫「—」，練習不能問）。
- 回滾或修正的部署若寫進紀錄，也算一次部署（由課程決定要不要記）。
- **效能分級**（elite、high、medium、low）**不計算**：每年的報告都會調整門檻，只在課文以文字說明。

### 5.4 驗證（`historyProblems`）

服務名稱不空白；`days` 為 1–366 的整數；至少一次部署；id 不重複；`deployedAt` 是期間內的整數分鐘且依序（可相同）；每次部署至少一個變更，變更的提交時間是 ≥ 0 的整數且不晚於部署；故障開始不早於部署、偵測不早於開始、恢復不早於偵測。

## 6. D2：部署模擬（`src/lib/devops/rollout.ts`，`deployment-simulator`）

### 6.1 資料

```ts
interface RolloutScenario {
  fleet: { instances: number; capacityRpm: number; rpm: number };   // 1–20 個執行個體、每個每分鐘的容量、每分鐘的請求（固定）
  from: AppVersion; to: AppVersion;                                 // 舊版本 → 新版本
  strategy: Strategy;
  gate?: { metric: 'error-rate' | 'p95'; max: number; minRequests: number };
  schema?: string[];                                                // 第 0 分鐘資料庫有的欄位
  migrations?: { at: number; kind: 'expand' | 'contract'; columns: string[] }[];
  flags?: { id; label; version; errorPermille; exposure: { at: number; percent: number }[] }[];
  minutes: number;                                                  // 時間軸長度 1–120
}
interface AppVersion { id; label; errorPermille /* 0–1000 */; p95Ms; startSeconds /* 0–3600 */; requires?: string[] }
```

### 6.2 每一分鐘的順序

第 t 分鐘涵蓋 [t, t + 1)：

1. 到期的結構變更（expand 新增欄位、contract 刪除欄位，同一分鐘依宣告順序）與旗標開放比例的改變生效。
2. 策略動作：移除與啟動執行個體、改變路由權重（§6.3）。被移除的執行個體這一分鐘就不服務。
3. 服務這一分鐘的請求（§6.5、§6.6）。
4. 閘門的觀察期間在這一分鐘結束時判定；判定的結果在**下一分鐘開始時**才動作。

- 在第 t 分鐘啟動的執行個體從第 t + ⌈startSeconds ÷ 60⌉ 分鐘起就緒並服務（90 秒 → 2 分鐘後；0 秒 → 當分鐘）。
- **執行中** = 就緒 + 啟動中；**額外的執行個體分鐘** = Σ max(0, 執行中 − instances)；**尖峰** = 執行中的最大值。

### 6.3 四種策略

| 策略 | 參數 | 規則 |
|---|---|---|
| 重建 `recreate` | — | 第 0 分鐘移除全部舊版本、啟動 N 個新版本；新版本就緒前沒有任何執行個體服務，請求全部丟棄 |
| 滾動更新 `rolling` | `maxSurge`、`maxUnavailable`（個數或百分比） | 每分鐘先縮舊、再擴新：舊的移除 k = min(舊, max(0, 舊 + 新就緒 − (N − unavailable)))，新的啟動 c = min(N − 新總數, max(0, N + surge − (舊 − k + 新總數)))；「新就緒」不含這一分鐘才啟動的 |
| 藍綠部署 `blue-green` | `verifyMinutes`（≥ 0）、`keepBlueMinutes`（≥ 1） | 第 0 分鐘啟動 N 個綠色；就緒後再驗證 `verifyMinutes` 分鐘（煙霧測試，沒有使用者流量），在 s = 就緒 + verify 把 100% 流量切到綠色；保留藍色 `keepBlueMinutes` 分鐘以便立即回滾，期間就是閘門的觀察期間；第 s + keep 分鐘：閘門未通過就切回藍色並移除綠色（回滾），否則移除藍色（完成） |
| 金絲雀發布 `canary` | 1–10 步，每步 `weight`（1–100，遞增，最後一步 100）與 `holdMinutes`（≥ 1） | 每步開始時把新版本擴到 ⌈N × weight ÷ 100⌉ 個；新啟動的就緒後（沒有新啟動的就立刻）權重才變成這一步的 weight，觀察 `holdMinutes` 分鐘；觀察期最後一分鐘判定閘門，下一分鐘：未通過 → 權重 0、移除全部新版本（回滾，記下中止的步驟）；通過 → 下一步開始，或最後一步之後移除全部舊版本（完成）。舊版本在整個過程保持 N 個 |

- 完成時刻 `completedAt`：第一個「只有新版本、數量是 N、承接全部流量」的分鐘。回滾時刻 `rolledBackAt`：流量永久回到舊版本、新版本被移除的那一分鐘。藍綠另記切換時刻 `switchAt`。
- 宣告的策略必須在 `minutes` 內完成或回滾（驗證規則）；在探索器裡改參數時沒完成就顯示「N 分鐘內沒有完成」。

### 6.4 maxSurge 與 maxUnavailable

- 個數照用（unavailable 最多 N）；百分比依 Kubernetes 的取整：**surge 無條件進位、unavailable 無條件捨去**（N = 10、25% → surge 3、unavailable 2；N = 3、10% → surge 1、unavailable 0）。
- 兩者都算成 0 時，unavailable 改為 1，讓更新可以前進；兩者都明寫為個數 0 則驗證拒絕。
- 只有取整規則對齊 Kubernetes；控制迴圈的時間（每分鐘一輪、先縮後擴）是本模型自己的規則。

### 6.5 流量與容量

- 每個就緒的執行個體每分鐘最多承接 `capacityRpm` 個請求；超過的請求被**丟棄**（未服務，與錯誤分開計）。
- 重建與滾動更新：承接量 = min(rpm, 就緒總數 × 容量)，依兩個版本的就緒數分配。
- 藍綠與金絲雀：依權重把 rpm 分給新版本（weight %）與舊版本（100 − weight %），各自再受自己的容量限制。
- **整數分配**：每份先得 ⌊總數 × 權重 ÷ 權重和⌋，剩下的請求一個一個給餘數最大的份；餘數相同給前面的（舊版本在新版本前面、一般路徑在旗標路徑前面）。例：1000 依 1：2 → 333、667；5 依 1：1 → 3、2。

### 6.6 錯誤、閘門、遷移與旗標

- **錯誤**：每個（版本、路徑）有自己的錯誤率（‰）與**帶入的餘數**：錯誤 = ⌊(承接 × ‰ + 餘數) ÷ 1000⌋，餘數 = (承接 × ‰ + 餘數) mod 1000。所以錯誤率固定時，總錯誤恰好是 ⌊總承接 × ‰ ÷ 1000⌋（每分鐘 333 個、3‰：0、1、1，三分鐘共 2）。
- **閘門**（只用於金絲雀的每一步與藍綠的保留期；重建、滾動更新忽略它）：觀察期間新版本承接的請求少於 `minRequests` → **樣本不足，視同未通過**（fail closed）；`error-rate`：錯誤 × 1000 ≤ max × 請求才通過；`p95`：新版本宣告的 p95 ≤ max 才通過（p95 是版本宣告的示意數字，不由請求計算）。表格裡的錯誤率是錯誤 × 1000 ÷ 請求，四捨五入到整數 ‰。
- **擴充與收縮**：某個版本 `requires` 的欄位不在目前的結構裡時，它承接的請求**全部失敗**（1000‰）。正確的順序是先 expand、等舊版本完全下線（而且不再需要回滾）才 contract；太早收縮，舊版本立刻出錯；忘了擴充，新版本出錯。驗證要求 expand 只新增不存在的欄位、contract 只刪除存在的欄位、時間在時間軸內。
- **功能旗標**：旗標屬於某個版本的程式；從開放表的時刻起，那個版本承接的請求有 `percent`% 走新功能的路徑（整數分配同 §6.5），用旗標自己的錯誤率。開放比例和部署進度無關：程式可以先部署（0%），之後才發布。每個版本最多一個旗標。

### 6.7 結果

逐分鐘的列：各版本的就緒與啟動中、執行中、權重、承接、旗標路徑、錯誤、丟棄、是否缺欄位、目前的結構、旗標開放比例、事件（文字）。總計：請求、承接、丟棄、錯誤（分版本）、受影響（錯誤 + 丟棄）、尖峰、額外的執行個體分鐘、有丟棄的分鐘數；結果（完成、回滾、進行中）與各時刻；閘門的每次判定（步驟、期間、請求、錯誤、‰、p95、通過／未通過／樣本不足）。

### 6.8 手算的例子（`tests/support/devops-fixture.ts`）

4 個執行個體、每個 300 rpm、每分鐘 1,000 個請求、兩版都 90 秒就緒、v1 1‰、v2 2‰、10 分鐘：

| 策略 | 結果 | 丟棄 | 錯誤 | 尖峰 | 額外執行個體分鐘 |
|---|---|---|---|---|---|
| 滾動 1／0 | 第 8 分鐘完成（舊的在第 2、4、6、8 分鐘各少一個） | 0 | 15（v1 5、v2 10） | 5 | 8 |
| 滾動 0／1 | 第 8 分鐘完成 | 800（8 分鐘 × 100） | 14 | 4 | 0 |
| 重建 | 第 2 分鐘完成 | 2,000 | 16 | 4 | 0 |
| 藍綠（驗證 1、保留 3） | 第 3 分鐘切換、第 6 分鐘完成 | 0 | 17 | 8 | 24 |
| 金絲雀 25% → 100%（各 2 分鐘） | 第 8 分鐘完成 | 0 | 15 | 8 | 20 |

v2 改成 50‰ 的金絲雀：第 1 步觀察第 2–3 分鐘，500 個請求、12 ＋ 13 = 25 個錯誤（50‰ > 5‰），第 4 分鐘回滾。

## 7. 練習（`src/lib/devops/check.ts`）

答案由查詢在課程資料上算出；練習只寫「問什麼」。

| `kind` | 學習者填的 | 比對 |
|---|---|---|
| `number` | 一格數字（`value`） | 查詢的值必須是數字 |
| `field` | 一格文字（`value`） | 查詢的值必須是文字（版本 id、結果） |
| `choice` | 選一個選項（`choice` = 序號） | 每個選項寫它代表的值；資料必須恰好讓一個選項正確 |
| `table` | 多格（每個 `blank.id`） | 各格自己的查詢 |
| `rollout-plan` | 策略參數（滾動：`maxSurge`、`maxUnavailable`；藍綠：`verifyMinutes`、`keepBlueMinutes`；金絲雀：`steps`，寫成 `10/5, 50/5, 100/5`） | 用學習者的參數重新模擬，逐項檢查條件（`maxErrors`、`maxDropped`、`maxAffected`、`maxPeakInstances`、`maxExtraInstanceMinutes`、`completeBy`、`outcome`，都含等號）；符合的設定都通過。`reference` 是其中一種設定，作為參考解答顯示，驗證器確認它通過 |

| 查詢 `task` | 值 |
|---|---|
| `dora`（`metric`：`deployments`、`deploy-days`、`per-week`、`changes`、`lead-time-median`、`failed`、`change-fail-rate`、`recovery-median`、`detect-median`） | 數字（`per-week` 有一位小數，其餘是整數） |
| `dora-best`（兩個以上的紀錄，依 `per-week` 越高越好，或前置時間、失敗率、復原時間越低越好） | 最好的紀錄 id；平手時驗證拒絕 |
| `rollout`（可用 `strategy`、`gate` 取代情境的設定，`gate: null` 拿掉閘門；`metric`：`errors`、`errors-from`、`errors-to`、`dropped`、`affected`、`peak-instances`、`extra-instance-minutes`、`dropped-minutes`、`completed-at`、`rolled-back-at`、`switch-at`、`aborted-step`、`running-at`／`served-to-at`（要 `minute`）、`gate-requests`／`gate-errors`／`gate-permille`（要 `step`，藍綠是 0）、`outcome`、`final-version`） | 數字，或文字（`outcome`：完成、回滾、進行中，也接受英文；`final-version`：版本 id 或名稱） |
| `rollout-best`（兩個以上的候選策略，依 `errors`、`dropped`、`affected`、`peak-instances`、`extra-instance-minutes`、`completed-at` 越低越好） | 最好的候選 id；平手時驗證拒絕 |

比對規則（`checkDevopsAnswer`）：數字接受全形數字、千分位逗號與後面的單位（分鐘、%、‰、個、次…），必須**恰好等於**答案在它的小數位數上的值（`2.5` 與 `2.50` 通過，`2.46` 不通過）；時間一律以分鐘作答。文字去掉前後空白、不分大小寫，比對答案與它的別名。錯誤訊息只指出哪一格不對、該回去看什麼，不透露答案；規劃題的訊息寫出模擬結果違反了哪個條件（例如「丟棄的請求有 800，超過上限 0。」）。

## 8. UI（`src/components/curriculum/devops-explorer.tsx`）

- **部署紀錄**：四個指標卡片（每張寫出算式，例如「5 次 × 7 ÷ 14 天」）、SVG 時間軸（圓點是部署，方塊與紅色橫條是造成故障的部署與故障持續的時間，選取部署的變更以線連到上線時刻）、以下拉選單選一次部署（`aria-live` 說明它的變更與故障）、前置時間的排序清單並標出中位數、等效的表格（每次部署的上線時間、變更數、各變更的前置時間、結果、偵測與復原分鐘）。
- **部署模擬**：策略選單與參數欄位（參數有誤時欄位 `aria-invalid`，錯誤以 `role="alert"` 列出，不畫圖）、閘門開關、恢復課程設定；總計卡片（`aria-live`）；三張 SVG 長條圖（執行個體、請求、錯誤，同一條時間軸，選取的分鐘有底色），每張有 `<title>`；圖例；共用的步進器（方向鍵、Home、End）逐分鐘移動並以 `aria-live` 說明這一分鐘；閘門判定表；「逐分鐘的表格（三張圖的文字版）」。
- 不使用圖表套件；文字全是繁體中文；在 390 px 寬時控制項變成單欄，圖隨欄寬縮放，表格在自己的框裡捲動，頁面沒有水平捲動。每個探索器都標示「示意資料」，部署模擬另說明它不代表任何調度系統或負載平衡器的行為。
- 頁面接線：`devops-lesson.tsx` 的 `devopsExamples` 讓段落以 id 顯示探索器，`DevopsExerciseView` 顯示練習、提示、常見錯誤與**算出的**參考解答；`database-lesson.tsx` 在 `devops-explorer` 能力時加入它們與練習說明（devops 不和程式課配對，所以程式課的版面不變）。

## 9. 驗證規則

- `devopsContentProblems`（由 `validateContent` 呼叫）：至少一個探索器；探索器與練習的 id 不重複、標題與說明不空白；紀錄與情境各自的驗證（§5.4、`rolloutProblems`：數值範圍、版本 id 不同、策略參數、閘門、結構與遷移、旗標、宣告的策略在時間軸內結束）；練習有題目、提示、解說、至少一個常見錯誤；每個查詢都算得出值；`number` 題的值是數字、`field` 題的值是文字；`table` 的格子 id 不重複；`choice` 至少兩個值與文字都不同的選項，且資料恰好讓一個正確；`rollout-plan` 的策略是滾動、藍綠或金絲雀，參考設定同一種、參數合法、至少一個條件且參考設定符合全部條件；參考答案通過自己的檢查；每個常見錯誤只回答練習有的欄位，而且**不通過**。
- `validateContent`：`devops-explorer` 能力與 `content.devops` 必須同時存在；活動是 `deployment-simulator` 時至少要有一個部署紀錄或部署模擬。只有 devops-explorer（或加上 terminal、visualization）的課沿用非程式課的檢查：探索器算範例（每個都要在段落中顯示），devops 練習算練習。
- `validateCurriculum`：`devops-explorer` 只能和 `terminal`、`visualization` 一起宣告；沒有 `terminal` 時，課的活動必須是 `deployment-simulator`；活動 `deployment-simulator` 需要 `devops-explorer` 能力。

## 10. 規劃中的階段（之後的批次，範圍已定，細節屆時寫入本文件）

### 10.1 終端機引擎階段 E25–E31

Profile 延續 `runtime` 之後的線性鏈（RANK 25–31）。每個階段只加一項功能，有自己的 `tests/terminal-eNN.test.ts`，重播每一堂已發布的終端機課並得到逐字相同的輸出，`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上新 profile；較低的 profile 保留 `command not found`。固定的版本：git 2.43.0（Ubuntu 24.04 的套件）、gh 約 2.65、runner image `ubuntu-24.04`、runner 約 2.321。Forge 主機是虛構的 `github.example`（和 `ghcr.example` 的先例相同）；決定模擬真實的 `gh` CLI。

| 階段 | 範圍 | 檢查 |
|---|---|---|
| E25 `git`（**已完成**，見 [CICD0_E25_GIT](CICD0_E25_GIT.md)） | 真實的 blob、tree、commit、annotated tag 與 SHA-1；refs、HEAD、index、工作目錄、remote-tracking refs；`github.example` 上的遠端存在 `FsState.git`；git 2.43 的常用指令，三方合併採用 git 的 xdiff 演算法（和真實 git 逐字比對過），衝突可以有多段 | `branch`、`worktree`、`tag` |
| E26 `forge`（**已完成**，見 [CICD0_E26_FORGE](CICD0_E26_FORGE.md)） | github.example 上的儲存庫設定與分支保護（必要的核准與狀態檢查、線性歷史、force push、刪除）、編號的 Pull Request、課程宣告的審查者（依時鐘審查）、不能核准自己的 PR、merge／squash／rebase 寫出與 GitHub 相同形狀的歷史、違反保護的 push 被 GH006 拒絕；`gh`（auth、repo view、pr create／list／view／diff／checkout／review／merge／checks／close、`gh api` 的 repo 與 branch protection GET／PUT／PATCH／DELETE） | `pull-request`、`protection` |
| E27 `workflows`（`workflow.ts`、`expr.ts`） | `yaml.ts` 加上欄位的 column 與結構化的 `YamlError`；workflow 的結構與 GitHub 的驗證訊息；`push`、`pull_request`、`workflow_dispatch`、`schedule` 觸發與篩選語法；運算式的 context、運算子與函式（含 `hashFiles`）；運算式先以文字代換再交給 Bash，所以 script injection 真的會發生；GITHUB_TOKEN 的有效權限；`gh workflow list/view` | `workflow` |
| E28 `actions`（`runner.ts`、`actions.ts`） | 依 `needs` 執行的 job、平行的時間、matrix 與 fail-fast；每個 job 一台全新的 runner `FsState`；`actions/checkout@v4`、`run:` 以 `bash --noprofile --norc -eo pipefail` 執行；`GITHUB_*` 環境變數與檔案、workflow commands；CI 工具一般化 E23 的 `BuildTool`（依工作目錄的檔案決定結果、`flaky`）；真實的步驟名稱與日誌；`gh run list/view/watch/rerun/cancel`、`gh workflow run`、`gh pr checks`；必要檢查接到 E26 的合併 | `run` |
| E29 `artifacts` | `actions/cache@v4`、`upload-artifact@v4`／`download-artifact@v4`、runner 上的 E20–E24 Docker；repo 與環境層級的 secret 與 variable、`gh secret`／`gh variable`、值必須通過 `FAKE_TOKEN`、日誌遮蔽為 `***`；GITHUB_TOKEN 的寫入權限 | `secret`、`variable`；`run` 加上 `cacheHit`、`artifact` |
| E30 `environments` | 必要審查者、等待計時、部署分支政策；等待中的 run 與核准端點；concurrency 與 cancel-in-progress；部署紀錄；以 `workflow_dispatch` 的輸入回滾到較早的 digest | `environment`、`deployment` |
| E31 `deploy-hosts` | 遠端機器可宣告 Docker daemon；`ssh deploy@prod-01 'docker pull …@sha256 && docker run …'`；runner 可連到課程宣告的主機，`curl -fsS http://staging-01:8000/healthz` 的冒煙測試是真的 | `container`、`http` 加上 `host?` |

資料：`TerminalMachine.forge`、`TerminalVariant.forge`（變體讓從 `gh` 輸出讀到的答案無法直接打出來）、`TerminalRemote.docker`。尚待決定（產品負責人）：學習者怎麼改儲存庫設定（`gh api` 的 JSON、設定面板或唯讀）；`/learn` 的 `cicd-pipeline` 實驗室要不要在 E28 之後成為終端機實驗室。

### 10.2 `devops-explorer` 階段 D3、D4

| 階段 | 範圍 | 練習 |
|---|---|---|
| D3 `dashboards`（`monitoring-dashboard`，CICD-4 登錄） | 每分鐘的時間序列，標註黃金訊號；事故區間；告警規則（指標、運算子、門檻、可選的視窗平均或最大值、`for` 分鐘、嚴重度）；逐分鐘評估 pending、firing、resolved（語意類似常見的告警系統但保持中立）；結果：偵測延遲、漏掉的事故、誤報、通知數（告警疲勞）；事故時間線（CICD14）：依序的事件、偵測與恢復時間、依課程給的矩陣判定嚴重等級；約 180 點的序列用重用 `src/lib/llm/prng.ts` 的種子產生器 | `alert-eval`、`alert-rule`（例如「每個事故 5 分鐘內偵測、最多 1 次誤報」）、`incident` |
| D4 `logs`（`monitoring-dashboard`） | 紀錄（時間、服務、主機、等級、訊息、欄位，可選原始行）；欄位與等級篩選（只用欄位／值的控制項，不發明查詢語言）；以關聯 ID 串起跨服務的請求；分組計數；遮蔽規則（欄位名稱或樣式）；保留容量（量 × 天數） | `correlate`、`redact`（mustHide、mustKeep）、`retention` |

## 11. 測試

| 檔案 | 內容 |
|---|---|
| `tests/devops-capability.test.ts` | `CICD_SHAPES` 15 列逐一斷言（活動、能力、需要的階段、CICD10 的可選終端機、CICD11／12 在 D3 前無法建立）、其他島的課被拒絕；島嶼登錄（預備、沒有單元與頁面、15 堂規劃中、被 `validateCurriculum` 拒絕）；只登錄 `deployment-simulator`、它在活動登錄中仍是規劃中、其他活動不變；四捨五入與中位數；兩個團隊的 DORA 指標（手算）；紀錄的每種驗證錯誤；整數分配、maxSurge／maxUnavailable 的取整、錯誤餘數；四種策略逐分鐘的執行個體與承接量、總計；藍綠的立即回滾；金絲雀的閘門未通過、樣本不足、p95、沒有閘門；擴充與收縮（太早收縮、正確順序、忘了擴充）與驗證；功能旗標；情境的驗證錯誤；每種查詢、數字與文字的比對、每道練習的參考答案通過、常見錯誤不通過；規劃題的模擬與訊息、參數解析；`devopsContentProblems` 的各種錯誤；合成的 CICD10 通過 `validateContent` 與發布閘門、內容與能力的綁定、能力的配對規則；`validateCurriculum(curriculum)` 是 `[]` |
| `tests/devops-explorer-dom.test.tsx` | 部署紀錄的指標文字、時間軸與等效表格、中位數標記、選取部署的說明；部署模擬的總計、三張圖與逐分鐘表格、改策略與參數重新模擬、不合法參數的警示、閘門開關、步進器的方向鍵與 Home／End、旗標；數字、選擇、表格、規劃題的檢查；參考解答由資料算出 |
| `tests/support/devops-fixture.ts` | 只供測試：兩個團隊的部署紀錄、四個部署情境（結帳服務、有問題的金絲雀、結構變更、功能旗標）、八道練習與一堂合成的 CICD10 課（沒有真實的課程檔案） |

## 12. 只在課文說明的部分

- 文化與團隊結構的模型、DORA 的效能分級、`git flow` 工具、CODEOWNERS、合併佇列、簽章的 commit。
- 網頁介面的畫面、自架的 runner、可重用或複合的 workflow、五個支援的 action 之外的 action、`pull_request_target` 與 fork PR 的 secret、OIDC `id-token`。
- 真實的測試框架與覆蓋率（工具的結果由課程宣告）、BuildKit 的快取匯出。
- Vault 與雲端的 secret 儲存、改寫 git 歷史來清除 secret。
- 服務網格與負載平衡器產品、真實的監控與日誌系統、值班呼叫與狀態頁。
- `gh --jq`／`--template`、終端機動畫。
- D2 沒有模擬：流量隨時間變化（rpm 固定）、自動擴展、影子部署、多於兩個版本同時存在、請求重試、工作階段黏著、延遲隨負載變化（p95 是宣告的數字）、資料回填的耗時（expand 視為立即可用）。

## 13. 沒有把握的地方

- **DORA 的名稱**：四個指標用 2023–2024 年報告的說法（deployment frequency、change lead time、change fail rate、failed deployment recovery time；2023 年起以 failed deployment recovery time 取代舊稱 MTTR）。之後的報告可能再增加或改名（例如 rework rate），中文譯名是本課程自訂的。
- **算法的細節**：DORA 報告以問卷的區間回答，沒有規定中位數、四捨五入或「每週平均」的算法；§5.3 的規則是本課程為了能手算而固定的。
- **maxSurge／maxUnavailable**：百分比的取整與「兩者都是 0 時 unavailable 改為 1」依 Kubernetes 的 deployment 控制器（`ResolveFenceposts`）的行為撰寫，沒有逐字核對最新版本的原始碼；控制迴圈的時間與先縮後擴的順序是本模型自己的規則，不是 Kubernetes 的。
- **E25–E31 的輸出格式**：gh、runner 日誌、GitHub 的 YAML 與驗證訊息、`hashFiles` 與快取的文字都無法離線核對；這些階段建置時要逐項列在本節，教學上最關鍵的（結束碼的註記、`***`、403 與保護規則的錯誤）優先。git 的合併與 rebase 衝突處理簡化為一段。

## 14. 改動的既有規則與測試

- `schema.ts`：新能力、新活動、預備島嶼、前綴、`content.devops` 與它的驗證接線、配對規則（§9）。
- `activities.ts`：`IMPLEMENTED_TEXT` 的說明只在活動已實作時採用（§3）；其他活動的登錄內容不變。
- `lessons.ts`：`cicdFromBlueprint` 與 `CICD_SHAPES`；其他島的對應與錯誤不變。
- `database-lesson.tsx`：加入 devops 的探索器、練習與說明；其他課的頁面不變。
- `tests/llm-capability.test.ts`：預備島嶼的斷言由 `[]` 改為 `['devops-cicd']`。
- `docs/curriculum/data/island-capabilities.json`：`devops-cicd` 改為 `prepared`，`AUTONOMOUS_CURRICULUM_PROGRESS.md` 依它以 `scripts/curriculum-queue.ts` 重新產生；`COURSE_CONTENT_SPECIFICATION.md` 加上 DevOps 的範例形式與 CICD-0 的列。`COURSE_INVENTORY.md` 只記發布的批次，沒有改動（沒有課發布）。
