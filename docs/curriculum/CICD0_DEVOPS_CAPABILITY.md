# CICD-0：DevOps 與 CI/CD 島的 `devops-explorer` 課程能力

> 2026-11-23。目標：讓 DevOps 與 CI/CD 島（`devops-cicd`，前綴 CICD，15 堂）可以撰寫、驗證、發布。本階段**不寫任何課程內容**，只把島嶼登錄為預備島嶼、建立逐課的活動對應，並建好新能力 `devops-explorer` 的 **D1**（部署紀錄與 DORA 指標）與 **D2**（部署模擬，`deployment-simulator` 活動）。本文件是終端機引擎階段 **E25–E31** 與 `devops-explorer` 階段 **D1–D6** 的唯一說明處：D1、D2 在此完整規定（§5–§9），**D3**（監控儀表板與告警規則，`monitoring-dashboard` 活動，CICD-4）在 §10.3，**D4**（集中式日誌，同一個活動，CICD-5）在 §10.4，**D5**（分散式追蹤、取樣與基數，同一個活動，給 KUB13，KUB-4）在 §10.5，**D6**（SLI、SLO、SLA、錯誤預算與消耗率告警，同一個活動，給 KUB14，KUB-4）在 §10.6，其餘是規劃中的階段與範圍（§10）。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| CICD-0（登錄） | `PREPARED_ISLAND_IDS = ['devops-cicd']`、前綴 `CICD`、`UNITS['devops-cicd'] = []`、`cicdFromBlueprint` 與逐課的 `CICD_SHAPES`；沒有課程、頁面、旗標、3D、GLB 或 `mapState` 的改動 |
| 新能力 `devops-explorer` | `content.devops`（`src/lib/devops/types.ts`）、`devopsContentProblems`（`check.ts`，由 `validateContent` 呼叫）、元件 `src/components/curriculum/devops-explorer.tsx` 與 `devops-lesson.tsx`；可以和 `terminal`、`visualization` 一起宣告，不和其他能力配對 |
| D1 `history`（已完成，§5） | 課程撰寫的部署紀錄（每次部署的變更提交時間、上線時間、是否造成故障、偵測與恢復時間），算出四個 DORA 指標；時間軸圖與等效表格 |
| D2 `rollout`（已完成，§6） | 部署模擬：一組相同的執行個體從舊版本換到新版本，逐分鐘模擬重建、滾動更新、藍綠部署、金絲雀發布（含閘門與中止）、資料庫的擴充與收縮、功能旗標；三張圖與逐分鐘的表格 |
| D3 `dashboards`（已完成，§10.3） | 監控儀表板（`monitoring-dashboard`）：每分鐘的時間序列（標註黃金訊號，可由種子產生器產生）、事故期間、告警規則逐分鐘評估（未觸發、等待中、觸發中、已恢復）、偵測延遲、漏掉的事故、誤報與通知數；事故時間線與嚴重等級矩陣 |
| D4 `logs`（已完成，§10.4） | 集中式日誌（`monitoring-dashboard` 的一部分）：結構化紀錄（時間、服務、主機、等級、訊息、欄位，可由種子產生器補上一般流量）與原始行；以控制項篩選（服務、最低等級、欄位條件、時間範圍）、分組計數、以關聯 ID 追蹤跨服務的請求、遮蔽規則（欄位名稱或固定的樣式）與 `redact` 檢查、保留容量的整數計算 |
| D5 `traces`（已完成，§10.5） | 分散式追蹤（`monitoring-dashboard` 的一部分，給 KUB13、KUB15）：span 的樹（16 碼 id、父 span、服務、操作、整數毫秒的開始與持續、狀態、種類、屬性，可由種子產生器依呼叫結構產生）；自身時間、關鍵路徑、瓶頸服務、跨追蹤的百分位數；日誌的 trace_id 與儀表板的範例追蹤連到追蹤；頭部與尾端取樣（自訂的 trace id 門檻規則）與 `sampling-plan` 題；基數（標籤不同值的乘積） |
| D6 `slo`（已完成，§10.6） | SLO（`monitoring-dashboard` 的一部分，給 KUB14、KUB15）：以 1、5 或 60 分鐘的時段記錄好事件與全部事件（可由 D3 的產生器產生）、萬分比的目標與視窗、可選的 SLA 補償表；SLI、錯誤預算（事件）、用掉與剩下的預算、消耗率、預算用完的時刻與還能撐的時間、SLA 的補償；長短兩個視窗的消耗率告警沿用 D3 的狀態機與事故對應，`burn-alert` 題 |
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
- **CICD11、CICD12** 對應到 `monitoring-dashboard`，這個活動在 D3（CICD-4）登錄（§10.3）；登錄之前 `cicdFromBlueprint` 拋出「the monitoring-dashboard activity is not registered yet (it is built with D3)」。D3 之後 CICD11 可以建立；CICD12 另外需要 D4，D3 時 `DEVOPS_STAGES_BUILT` 還沒有 D4，所以拋出「CICD12: the devops-explorer stage D4 is not built yet (the monitoring-dashboard activity needs D3 and D4)」。**D4（CICD-5）之後** `DEVOPS_STAGES_BUILT = ['D1', 'D2', 'D3', 'D4']`，CICD12 可以建立：活動 `monitoring-dashboard`、能力照對應是 `devops-explorer` 與 `terminal`（終端機的部分由寫課的人用既有的 E2、E7 指令對 JSON Lines 檔案撰寫）。
- `pipeline-sim`、`case-study-board`、`decision-simulation` 只是藍圖的名稱，**不加入** `LESSON_ACTIVITIES`（登錄它們會被當成已實作的活動）。`/learn` 上規劃中的 `cicd-pipeline` 實驗室（活動 `pipeline-sim`）保持規劃中。
- 其他島的 `deployment-simulator` 課（SA18、DL24、OPS03／06／07／08、CLD03／10／11）與 `monitoring-dashboard` 課（OPS13／14／19、KUB12）之後會沿用同一個模型，所以模型保持通用（版本、執行個體、流量），不為本島過度設計。
- `cicdFromBlueprint` 對其他島的課回報「not a DevOps and CI/CD lesson」；標題、目標、概念、難度、先修取自藍圖。

## 3. 島嶼與活動的登錄

- `src/content/curriculum/schema.ts`：`PREPARED_ISLAND_IDS = ['devops-cicd']`、`LessonPrefixWritten` 加上 `'CICD'`、`ISLAND_PREFIX['devops-cicd'] = 'CICD'`。**不**移入 `ISLAND_IDS`（CICD-1 才移入，放在 `network-servers` 之後，系統區的順序）。
- `src/content/curriculum/units.ts`：`'devops-cicd': []`。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 CICD 課（「devops-cicd is prepared for authoring, not a curriculum island yet」）。15 堂仍是規劃中、沒有頁面；已發布的課與頁面不變。
- `LESSON_CAPABILITIES` 加上 `devops-explorer`；`LESSON_ACTIVITIES` 加上 **`deployment-simulator`**（CICD-0 只有它），`CAPABILITY_ACTIVITY['deployment-simulator'] = 'devops-explorer'`，`DEVOPS_ACTIVITIES = ['deployment-simulator']`。**D3** 加上 **`monitoring-dashboard`**：`CAPABILITY_ACTIVITY['monitoring-dashboard'] = 'devops-explorer'`、`DEVOPS_ACTIVITIES = ['deployment-simulator', 'monitoring-dashboard']`；它和 `deployment-simulator` 的先例相同，在活動登錄中維持 `planned`（版本 0.1.0、說明是「必要：…」），直到第一堂用它的完整課（CICD11）發布；`IMPLEMENTED_TEXT['monitoring-dashboard']` 已寫好，屆時才採用。OPS13／14／19 與 KUB12 之後沿用同一個活動。
- **活動登錄的影響**（`src/content/world/activities.ts`）：活動是否「已實作」的既有規則是「有完整的課使用它」（或它是已實作的單一工具實驗室）。`deployment-simulator` 本來就因為藍圖的 10 堂課出現在登錄中，狀態是 `planned`；加入 `LESSON_ACTIVITIES` **不改變**它的狀態、版本或科目，要等第一堂用它的完整課（CICD01）發布才變成 `implemented`。`IMPLEMENTED_TEXT` 加上它的文字說明，同時規則改為「說明只在活動已實作時採用，規劃中的活動一律寫『必要：實作時提供與畫面等效的文字說明』」；其他有說明的活動全部已實作，所以登錄的其他內容逐字不變（`tests/devops-capability.test.ts` 斷言）。
- `tests/llm-capability.test.ts` 原本斷言「沒有預備中的島」（`[]`），現在改成恰好是 `['devops-cicd']`（同樣嚴格）。

## 4. 批次與階段

課程編號即位置，依序連續發布；每一批先完成它需要的階段，再寫課。

| 批次 | 課程 | 先完成的階段 |
|---|---|---|
| CICD-0 | 無 | 登錄與對應（§2、§3）、本文件、**D1**、**D2**（已完成） |
| CICD-1 | CICD01–02 | E25 `git`、E26 `forge`（已完成） |
| CICD-2 | CICD03–05 | E27 `workflows`、E28 `actions`（已完成） |
| CICD-3 | CICD06–08 | E29 `artifacts`（已完成） |
| CICD-4 | CICD09–11 | E30 `environments`、E31 `deploy-hosts`、D3（登錄 `monitoring-dashboard`，**已完成**，§10.3） |
| CICD-5 | CICD12–14 | D4（**已完成**，§10.4） |
| CICD-6 | CICD15 | 無（綜合專題單獨一批，和 DKR-6 相同；已完成，全島 15／15） |

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
| `rollout-plan` | 策略參數（滾動：`maxSurge`、`maxUnavailable`；藍綠：`verifyMinutes`、`keepBlueMinutes`；金絲雀：`steps`，寫成 `10/5, 50/5, 100/5`） | 用學習者的參數重新模擬，逐項檢查條件（`maxErrors`、`maxDropped`、`maxAffected`、`maxPeakInstances`、`maxExtraInstanceMinutes`、`completeBy`、`outcome`，都含等號；CICD-5 加上金絲雀專用的 `gateFailed`：回滾必須是閘門在足夠的樣本上判定失敗造成的，樣本不足而中止不算，否則「把第一步設得很小」也能以很少的錯誤通過）；符合的設定都通過。`reference` 是其中一種設定，作為參考解答顯示，驗證器確認它通過 |

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
| E27 `workflows`（**已完成**，見 [CICD0_E27_WORKFLOWS](CICD0_E27_WORKFLOWS.md)） | workflow 檔案的模型（不執行）：YAML 子集加上欄位與結構化的錯誤（Compose 的訊息不變）、GitHub 風格的驗證訊息、push／pull_request／workflow_dispatch／schedule 觸發與 GitHub 的過濾樣式、`${{ }}` 運算式與函式（文字代換在 Bash 之前，script injection 是真的）、matrix 展開、GITHUB_TOKEN 權限的解析；`gh workflow list`／`view` | `workflow` |
| E28 `actions`（**已完成**，見 [CICD0_E28_ACTIONS](CICD0_E28_ACTIONS.md)） | push、PR（opened／synchronize，在試合併 commit 上執行）、workflow_dispatch 與 schedule 產生 run；依 `needs` 執行的 job、平行的時間、matrix 與 fail-fast、`if`、timeout、continue-on-error；每個 job 一台全新的 runner，`actions/checkout@v4` 寫入檔案與 git 儲存庫，`run:` 先代換運算式再交給 Bash（沒寫 `shell:` 是 `bash -e {0}`，`shell: bash` 才加上 `--noprofile --norc -eo pipefail`）；`GITHUB_*` 環境與 `GITHUB_OUTPUT` 等檔案、workflow 指令與遮蔽；依工作區檔案決定結果的 CI 工具（含不穩定的測試）；job 結果成為 PR 的狀態檢查；`gh run list／view／watch／rerun／cancel`、`gh workflow run／enable／disable` | `run` |
| E29 `artifacts`（**已完成**，見 [CICD0_E29_ARTIFACTS](CICD0_E29_ARTIFACTS.md)） | `actions/cache@v4`（key、restore-keys、分支範圍）與依快取縮短的 CI 工具、`upload-artifact`／`download-artifact@v4` 與 `gh run download`、runner 上的 Docker（建置並以 `--password-stdin` 推送到課程的 Registry）、儲存庫與 environment 層級的 secret 與 variable（`gh secret`／`gh variable`，日誌遮蔽成 `***`）、GITHUB_TOKEN 對 `git push` 與 `gh` 的影響；E28 的 `rerun --failed` 改為逐片重新執行、workflow 檔案的 `|+`／`>+` | `secret`、`variable`；`run` 的 `cacheHit`、`artifact`；`registry` 的 `commit` |
| E30 `environments`（**已完成**，見 [CICD0_E30_ENVIRONMENTS](CICD0_E30_ENVIRONMENTS.md)） | 必要審查者、等待計時、部署分支政策；等待中的 run 與核准端點；concurrency 與 cancel-in-progress；部署紀錄；以 `workflow_dispatch` 的輸入回滾到較早的 digest | `environment`、`deployment` |
| E31 `deploy-hosts`（**已完成**，見 [CICD0_E31_DEPLOY_HOSTS](CICD0_E31_DEPLOY_HOSTS.md)） | 遠端機器可宣告 Docker daemon；`ssh deploy@prod-01 'docker pull …@sha256 && docker run …'`；runner 可連到課程宣告的主機，`curl -fsS http://staging-01:8000/healthz` 的冒煙測試是真的 | `container`、`http` 加上 `host?` |

資料：`TerminalMachine.forge`、`TerminalVariant.forge`（變體讓從 `gh` 輸出讀到的答案無法直接打出來）、`TerminalRemote.docker`。尚待決定（產品負責人）：學習者怎麼改儲存庫設定（`gh api` 的 JSON、設定面板或唯讀）；`/learn` 的 `cicd-pipeline` 實驗室要不要在 E28 之後成為終端機實驗室。

### 10.2 `devops-explorer` 階段 D3–D6

| 階段 | 範圍 | 練習 |
|---|---|---|
| D3 `dashboards`（`monitoring-dashboard`，CICD-4 登錄；**已完成**，見 §10.3） | 每分鐘的時間序列，標註黃金訊號；事故區間；告警規則（指標、運算子、門檻、可選的視窗平均或最大值、`for` 分鐘、嚴重度）；逐分鐘評估 pending、firing、resolved（語意類似常見的告警系統但保持中立）；結果：偵測延遲、漏掉的事故、誤報、通知數（告警疲勞）；事故時間線（CICD14）：依序的事件、偵測與恢復時間、依課程給的矩陣判定嚴重等級；約 180 點的序列用重用 `src/lib/llm/prng.ts` 的種子產生器 | `alert-eval`、`alert-rule`（例如「每個事故 5 分鐘內偵測、最多 1 次誤報」）、`incident` |
| D4 `logs`（`monitoring-dashboard`；**已完成**，見 §10.4） | 紀錄（時間、服務、主機、等級、訊息、欄位，可選原始行）；欄位與等級篩選（只用欄位／值的控制項，不發明查詢語言）；以關聯 ID 串起跨服務的請求；分組計數；遮蔽規則（欄位名稱或樣式）；保留容量（量 × 天數） | `correlate`、`redact`（mustHide、mustKeep）、`retention` |
| D5 `traces`（`monitoring-dashboard`，KUB-4；**已完成**，見 §10.5） | 追蹤與 span、產生器、自身時間、關鍵路徑、瓶頸、p95；日誌與範例追蹤的連結；頭部與尾端取樣、每天的 span；基數 | `trace`、`sampling`、`cardinality` 查詢；`sampling-plan` |
| D6 `slo`（`monitoring-dashboard`，KUB-4；**已完成**，見 §10.6） | 時段的好事件與全部事件、萬分比的目標與視窗、SLI、錯誤預算、消耗率、預算用完的時刻與剩下的時間、SLA 的補償表；長短兩個視窗的消耗率告警（D3 的狀態機） | `slo`、`burn` 查詢；`burn-alert` |

### 10.3 D3：監控儀表板與告警規則（`monitoring-dashboard`，**已完成**）

`src/lib/devops/series.ts`、`alerts.ts`、`incident.ts`、`dashboard.ts`、`dashboard-check.ts`；元件 `dashboard-view.tsx`（加上 `dashboard-chart.tsx`、`alert-rule-fields.tsx`、`alert-results.tsx`、`incident-timeline.tsx`）。和 D1、D2 一樣是**自創的教學模型**：等待（pending）再觸發（firing）的想法類似常見的監控系統，但規則是本課程自己的，不宣稱符合任何產品的語意，文字也不提任何產品。模型只有「序列、訊號、規則、事故」，沒有 CICD 專屬的欄位，所以 OPS13／14／19 與 KUB12 之後可以沿用。

#### 10.3.1 資料（`content.devops.dashboards`）

```ts
interface DashboardExplorer { id; title; description; dashboard: Dashboard }
interface Dashboard {
  service: string;
  minutes: number;                      // 1–360；第 t 分鐘涵蓋 [t, t + 1)
  series: MetricSeries[];               // 至少一條
  incidents?: Incident[];               // 依時間、不重疊
  rules?: AlertRule[];                  // 課程的規則；探索器從第一條開始
  severity?: SeverityMatrix;            // 事故的嚴重等級矩陣（CICD14）
}
interface MetricSeries { id; label; unit; signal: 'latency' | 'traffic' | 'errors' | 'saturation'; values?: number[]; shape?: SeriesShape }
interface SeriesShape { seed; baseline; noise?; changes?: ({ kind: 'step'; at; delta } | { kind: 'ramp'; from; to; delta } | { kind: 'spike'; at; minutes; delta })[] }
interface AlertRule { id; label; series; op: '>' | '>=' | '<' | '<='; threshold; window?: { agg: 'avg' | 'max' | 'min'; minutes }; forMinutes; severity: 'critical' | 'warning' | 'info' }
interface Incident { id; label; start; end; usersPercent?; events?: { at; kind: 'detected' | 'acknowledged' | 'mitigated' | 'resolved' | 'note'; text }[] }
interface SeverityMatrix { rows: { label; minUsersPercent }[]; columns: { label; minMinutes }[]; levels: string[][] }
```

- 每條序列每分鐘一個 **≥ 0 的整數**，標註一個黃金訊號（延遲、流量、錯誤、飽和度）與單位。可以逐點寫出（`values`，長度必須等於 `minutes`），或寫成**形狀**（`shape`）由產生器算出，作者不必手寫約 180 個點。
- **產生器**（決定性）：第 t 分鐘的值 = `baseline` + 雜訊 + 各個變化（依宣告順序），最後小於 0 的改成 0。
  - 雜訊：⌊u_t × (2 × noise + 1)⌋ − noise，u_t 是 `mulberry32(seed)`（`src/lib/llm/prng.ts`）的第 t 個數，每分鐘抽一次（noise 為 0 時不抽），所以範圍是 −noise…noise。
  - `step`：從第 `at` 分鐘起加 delta。`ramp`：第 from ≤ t < to 分鐘加 ⌊delta × (t − from + 1) ÷ (to − from)⌋（負數也向下取整，例如 ⌊−5 ÷ 2⌋ = −3），第 `to` 分鐘起加 delta。`spike`：第 at ≤ t < at + minutes 分鐘加 delta，之後不加。
- 事故是使用者受影響的期間 [start, end)；`usersPercent` 與 `events` 只有事故時間線與嚴重等級用得到。

#### 10.3.2 告警規則的評估（`evaluateAlert`）

1. **規則的值**：沒有視窗時是序列在第 t 分鐘的值；有視窗時是第 t − W + 1 到 t 分鐘（W = `window.minutes`）的平均、最大值或最小值。視窗還沒滿（t < W − 1）時**沒有值，條件不成立**。
2. **比較**：門檻是整數；平均**不先取整**，以 sum op threshold × W 精確比較（15 ÷ 3 = 5：`> 5` 不成立、`>= 5` 成立）。畫面與 `value-at` 查詢把平均寫到小數點後一位，四捨五入（§5.3 的 roundHalfUp）。
3. **狀態**（每分鐘一個）：條件不成立 → `inactive`（未觸發），但觸發中之後的第一個不成立的分鐘是 `resolved`（已恢復）；條件成立 → 連續成立的分鐘數 ≤ `forMinutes` 時是 `pending`（等待中），第 forMinutes + 1 個連續成立的分鐘起是 `firing`（觸發中）。`for` 為 0 時第一個成立的分鐘就觸發；等待中的條件中斷就回到未觸發，不發通知。
4. **觸發期間** [start, end)：從第一個觸發中的分鐘到已恢復的那一分鐘；到儀表板結束仍在觸發就記 end = minutes、`open`。**每個觸發期間是一次通知**（恢復的通知不算）。
5. **事故的偵測**：事故 [start, end) 的偵測時刻是 start ≤ t < end 之中第一個觸發中的分鐘，**偵測延遲** = t − start；事故期間內沒有任何觸發中的分鐘就是**漏掉**。觸發期間和任何事故都不重疊（iv.start < i.end 且 i.start < iv.end 都不成立）就是**誤報**。在事故開始前就觸發、一路延續到事故期間的，延遲是 0，也不算誤報；事故結束後才觸發的（視窗與持續時間造成的延遲）同時是「漏掉」與「誤報」。
6. 結果（`AlertResult`）：每分鐘的值、條件、狀態；觸發期間與對應的事故；每個事故的偵測時刻與延遲；第一次觸發與第一次恢復的分鐘；通知、誤報、漏掉、偵測到的事故數與觸發中的分鐘數。

手算的例子（`tests/support/dashboard-fixture.ts` 的 `tiny`：12 分鐘的錯誤率 1 1 2 9 9 9 1 1 8 1 1 1‰，事故 [3, 6)）：

| 規則 | 觸發期間 | 通知 | 誤報 | 偵測延遲 |
|---|---|---|---|---|
| 錯誤率 > 5，立即 | 第 3–5、8 分鐘 | 2 | 1（第 8 分鐘） | 0 |
| 錯誤率 > 5，持續 2 分鐘 | 第 5 分鐘（第 3、4、8 分鐘等待中） | 1 | 0 | 2 |
| 3 分鐘平均 > 5 | 第 4–6 分鐘（20 ÷ 3 = 6.7、9、6.3） | 1 | 0 | 1 |

#### 10.3.3 事故時間線與嚴重等級（`incident.ts`，給 CICD14）

- 偵測時間 = detected − start；確認時間 = acknowledged − detected；止血時間 = mitigated − start；**恢復時間 = end − start**（影響的期間，不是結案）。事件依時間排列、不早於 start；detected、acknowledged、mitigated、resolved 各最多一次，且依這個順序。
- 嚴重等級：矩陣的列由影響最多的使用者往下排到 `minUsersPercent` 0，欄由最長的影響往下排到 `minMinutes` 0；事故落在第一個 minUsersPercent ≤ usersPercent 的列、第一個 minMinutes ≤ 恢復時間的欄。分級的定義由課程提供（每個組織不同），模型只查表。
- 事故時間線**不和告警規則連動**：detected 是課程記錄的時刻（可以寫成和某條規則第一次觸發的分鐘相同，但驗證不檢查）。

#### 10.3.4 練習

| 查詢 `task` | 值 |
|---|---|
| `series`（`metric`：`value-at`（要 `minute`）、`max`、`min`、`max-at`、`signal`） | 數字（序列的單位），或文字（`signal`：英文名稱或延遲、流量、錯誤、飽和度等中文） |
| `alert`（`rule`：課程規則的 id，或直接寫一條條件；`metric`：`first-firing`、`first-resolved`、`notifications`、`false-alerts`、`missed`、`detected`、`firing-minutes`、`detection-delay`（要 `incident`）、`state-at`、`value-at`（要 `minute`）） | 數字（分鐘、次、個；`value-at` 的平均有一位小數），或文字（`state-at`：未觸發、等待中、觸發中、已恢復，也接受英文） |
| `incident`（`metric`：`time-to-detect`、`time-to-acknowledge`、`time-to-mitigate`、`time-to-recover`、`severity`） | 分鐘，或嚴重等級的文字 |

- **alert-eval** 就是 `number`／`field`／`table`／`choice` 題配上 `alert` 查詢（例如第一次觸發在第幾分鐘、發了幾次通知、某分鐘是什麼狀態）；**黃金訊號的分類**用 `choice` 或 `table` 配上 `series` 的 `signal`；**事故時間線**用 `table` 配上 `incident` 查詢。不需要新的填答形式。
- 新的填答形式 **`alert-rule`**（規劃題）：學習者設定指標、比較、門檻、視窗計算（不用、平均、最大值、最小值）、視窗長度、持續時間（欄位 `series`、`op`、`threshold`、`agg`、`window`、`for`），檢查器用這條規則在儀表板上逐分鐘評估，逐項檢查條件：`detectWithin`（每個事故都要偵測到，且延遲 ≤ N）、`maxMissed`、`maxFalseAlerts`、`maxNotifications`（都含等號）。符合條件的規則都通過；`reference` 是其中一條，驗證器確認它通過。訊息寫出違反了什麼，例如「誤報有 1 次，超過上限 0。」、「事故「資料庫連線耗盡」第 130 分鐘開始，第 140 分鐘才觸發，延遲 10 分鐘，超過 3 分鐘。」。
- 驗證（`dashboardProblems`、`alertPlanProblems`，由 `devopsContentProblems` 呼叫）：服務名稱、`minutes` 1–360；序列的 id 不重複（和事故、規則共用 id 空間）、名稱與單位不空白、訊號合法、恰好有 values 或 shape 之一、values 的長度與範圍、種子、基準、雜訊、每個變化的時間在儀表板內且 delta ≠ 0；事故在儀表板內、依時間不重疊、usersPercent 0–100、事件的順序；矩陣的列與欄遞減到 0、等級的形狀；規則的序列存在、比較合法、門檻是 ≥ 0 的整數、視窗 1–min(60, minutes) 分鐘、`for` 0–60、嚴重度合法；`alert-rule` 的參考規則合法、至少一個條件且都是 ≥ 0 的整數、偵測類的條件需要事故、參考規則符合全部條件；參考答案通過、常見錯誤不通過（同 §9）。
- `validateContent`：活動是 `monitoring-dashboard` 時至少要有一個儀表板（D4 之後改為儀表板或日誌，「the monitoring-dashboard activity needs at least one of content.devops.dashboards or content.devops.logs」，§10.4.7）。

#### 10.3.5 UI（`dashboard-view.tsx`）

- 每條序列一張 SVG 折線圖（不用圖表套件）：事故期間是底色，所選規則監看的那條序列畫出門檻的虛線，規則有視窗時再畫一條細虛線表示視窗的值，選取的分鐘有底色；每張圖有 `<title>`（最大值與它的分鐘、事故數、門檻）與 `<desc>`，下面是等效的表格（每列 10 分鐘，選取的分鐘標出）。
- 告警規則編輯器：「課程的規則」選單載入一條規則；指標、比較、視窗計算是下拉選單，門檻、視窗長度、持續時間是輸入欄（不用視窗時視窗長度停用）；改了任何欄位就成為「自訂」。不合法時每個欄位 `aria-invalid` 並以 `aria-describedby` 指向 `role="alert"` 的錯誤清單，不畫狀態列與結果；「恢復課程的規則」。
- 結果：總計卡片（通知、誤報、偵測到與漏掉的事故、觸發中的分鐘，`aria-live`）、每分鐘的狀態列（SVG，四種狀態四種顏色加上事故期間的橫條）與圖例、事故的偵測表、觸發期間的表（每列一次通知，標出對應的事故或「誤報」）、「狀態的變化（狀態列的文字版）」表（每段相同狀態的分鐘）。
- 共用的步進器（方向鍵、Home、End）逐分鐘移動，`aria-live` 說明這一分鐘每條序列的值、規則的值、條件是否成立、告警狀態與進行中的事故。
- 事故時間線：有事件或 usersPercent 的事故各一段，事件表、四個時間（寫出算式）、嚴重等級矩陣表（落在的格子標出）。
- 練習：`alert-rule` 用和探索器相同的欄位元件，按「檢查」後寫出你的規則的通知、誤報、漏掉與每個事故的偵測延遲；參考解答寫出參考規則與它的評估結果。
- 文字全是繁體中文；在 390 px 寬時控制項變成單欄、圖隨欄寬縮放、表格在自己的框裡捲動，頁面沒有水平捲動（暫時頁面在瀏覽器中以 390 × 844 量過 `scrollWidth` = 390，量完即刪除）。

#### 10.3.6 只在課文說明的部分

- 真實的監控與告警系統（查詢語言、抓取間隔、告警分組與靜音、通知路由、重複通知）、值班排班與呼叫、狀態頁；百分位數怎麼由請求算出（序列直接給 p95）。
- 多條規則的組合（同時觸發的去重、相依的告警）、SLO 與錯誤預算的消耗率告警、異常偵測與動態門檻。
- 事故指揮、對外溝通與不究責的事後檢討（CICD14 以課文與終端機演練教，探索器只提供時間與嚴重等級）。

#### 10.3.7 沒有把握的地方

- **pending／for 的邊界**：「條件連續成立 for 分鐘之後（第 for + 1 個分鐘）才觸發」是本模型逐分鐘評估時的選擇；真實系統以評估間隔與時間戳記判定，邊界可能差一個評估週期，課文不宜把分鐘數說成任何產品的行為。
- **誤報與漏掉的定義**：以「觸發期間是否和事故期間重疊」判定；真實的值班團隊會依事後檢討人工判定（例如事故結束後才觸發的告警），本模型把這種情況同時算成漏掉與誤報，課文要說明。
- **恢復時間**：本模型用影響期間（end − start）；DORA 的失敗部署復原時間（§5）與常見的 MTTR 有不同的起點與終點定義，課文要點明是哪一個。
- **嚴重等級**：矩陣與 SEV 名稱由課程提供，沒有通用標準。
- **D4**：D3 建好時 D4 還沒建，`cicdFromBlueprint('CICD12')` 拒絕；D4 已在 CICD-5 建好（§10.4），CICD12 可以建立。

### 10.4 D4：集中式日誌（`monitoring-dashboard` 的一部分，**已完成**）

`src/lib/devops/logs.ts`（資料、產生器、驗證）、`log-query.ts`（篩選、分組、關聯、保留容量、行的格式）、`redact.ts`（遮蔽規則）、`logs-check.ts`（查詢與 `redact` 題）；元件 `log-viewer.tsx`（加上 `log-filters.tsx`、`log-tables.tsx`、`log-masking.tsx`）。和 D1–D3 一樣是**自創的教學模型**：沒有查詢語言，只有控制項與固定的運算；不宣稱符合任何日誌產品、收集器或格式標準，文字也不提任何產品。模型只有「紀錄、欄位、服務、關聯 ID」，OPS、KUB 的課之後可以沿用。

#### 10.4.1 資料（`content.devops.logs`）

```ts
interface LogsExplorer { id; title; description; logs: LogSet; masking?: string[]; checks?: { mustHide: string[]; mustKeep: string[] } }
interface LogSet {
  correlationField?: string;            // 關聯 ID 的欄位，預設 request_id
  records: LogRecordInput[];            // 課程寫的紀錄，至少一筆
  traffic?: LogTraffic;                 // 以種子產生的一般流量
  raw?: { id; text }[];                 // 程式直接印出的原始行（純文字、JSON 或 key=value）
  perDay?: number;                      // 正式環境每天的筆數（保留容量用）
}
interface LogRecordInput { ts: number | string /* 整數秒或 "分:秒" */; service; host; level: 'debug' | 'info' | 'warn' | 'error'; message; fields?: Record<string, string | number> }
interface LogTraffic { seed; count /* 1–3000 */; from; to /* 秒 [from, to) */; services: string[]; hosts? /* 每個服務 1–9，預設 2 */; paths: string[]; users? /* 預設 500 */; durationMs: { min; max }; idPrefix? /* 預設 "req-" */ }
```

- 時間是從日誌開始算起的**整數秒**（最多 7 天），可以寫成 `605` 或 `"10:05"`；畫面寫成「分:秒」，一小時以上寫成「時:分:秒」。等級的順序是 debug < info < warn < error。欄位名稱是英數字、`_`、`.`，不能是 ts、service、host、level、message；值是字串或安全整數。
- **產生器**（決定性，`mulberry32(seed)`，`src/lib/llm/prng.ts`）：第 k 筆（k = 0…count − 1）依序抽六個數 u：時間 = from + ⌊u × (to − from)⌋、服務 = services[⌊u × S⌋]、主機 = `服務-${⌊u × hosts⌋ + 1}`、路徑 = paths[⌊u × P⌋]、user_id = `u-${1000 + ⌊u × users⌋}`、duration_ms = min + ⌊u × (max − min + 1)⌋；等級 info、訊息 `GET 路徑 200`，欄位 request_id（`req-0001` 起，至少四位數）、user_id、path、status 200、duration_ms。所以產生的紀錄都是正常流量，事故的紀錄由課程寫出。
- 全部紀錄依時間排序；同一秒時課程寫的在前，各自保持原來的順序；每筆得到 1 起算的序號 `n`。最多 5,000 筆。
- 一筆紀錄的 **JSON 行**依序是 ts、service、host、level、message，再接欄位（宣告的順序）。

#### 10.4.2 篩選、分組與關聯（`log-query.ts`）

- **篩選**（全部可選，同時成立才符合）：服務（等於）、最低等級（這個等級以上）、欄位條件 `{ name, op, value }`、時間範圍 [from, to)。`=`、`!=` 比較值的文字（200 等於 "200"）；`>`、`>=`、`<`、`<=` 兩邊都要是數字。**沒有這個欄位的紀錄不符合任何條件，連 `!=` 也不符合**。
- **分組計數**：依服務、等級、主機或某個欄位的值計數，筆數多的在前，同數依值的文字順序；沒有這個欄位的紀錄另外計為「沒有這個欄位」。
- **關聯**：帶某個關聯 ID 的紀錄依時間排列（同一秒保持日誌的順序），每筆有 Δ（和前一筆相差的秒數，第一筆是 0）與距第一筆的秒數；**經過的服務**依序列出，同一個服務只在中間換過別的服務後才再列一次（gateway → orders → payments → orders → gateway）；**經過時間** = 最後一筆 − 第一筆；第一個 error 等級的紀錄是**第一個出錯的服務**。
- **原始行的格式**：能解析成 JSON 物件，或由兩段以上、每一段都是 `key=value`（值可加雙引號）組成的行是**結構化**的，欄位數是鍵的個數；其他都是**非結構化**（只能用文字搜尋）。

#### 10.4.3 遮蔽（`redact.ts`）

- 規則一行一條：`field 欄位名稱`（整個欄位的值換成 `***`）、`pattern 樣式名稱`（訊息、欄位值與原始行裡每個符合的片段換成 `***`）；也接受 `field:名稱`，空行與 `#` 開頭的行略過；依序套用，最多 20 條。時間、服務、主機、等級不遮蔽。
- 樣式是**固定的**（學習者不寫正規表示式）：`email`（電子郵件地址）、`card`（13–19 位數字，可夾空格或連字號，前後不能再接數字或連字號）、`token`（`Bearer` 之後的字串，或 `sk_`、`tok_` 開頭、8 個字元以上的字串）、`ipv4`、`digits`（任何連續 4 位以上的數字，**刻意太寬**，用來示範過度遮蔽）。
- 看不懂的行、不存在的樣式、不能遮蔽的欄位名稱、沒有任何紀錄有的欄位、重複的規則都是錯誤，逐行說明。
- **`redact` 檢查**：套用規則後，`mustHide` 的每個值在任何訊息、欄位值或原始行都**不能再出現**（回報第一個仍看得到的位置）；`mustKeep` 的每個值，**每一次出現都要保留**（遮蔽後出現的次數少於原本就是過度遮蔽）。`field user_email` 遮不到訊息裡的電子郵件；`pattern digits` 會連訂單編號 A-1001 一起遮掉。

#### 10.4.4 保留容量（整數運算）

- 平均每筆大小 = 全部紀錄的 JSON 行（每行加換行 1 位元組）的 UTF-8 位元組總和 ÷ 筆數，**四捨五入**到整數位元組（§5.3 的 roundHalfUp；UTF-8 依碼位計算，瀏覽器與 Node 相同）。
- 每天的位元組 = 每天筆數 × 平均大小；總計 = 每天的位元組 × 天數。MB、GB 用十進位（10⁶、10⁹ 位元組）：MB 四捨五入到整數，GB 四捨五入到小數點後一位（以十分之一 GB 的整數保存）。例：2,000,000 筆 × 250 位元組 × 30 天 = 15,000,000,000 位元組 = 15,000 MB = 15.0 GB；1,500,000 位元組是 2 MB（1.5 進位）、150,000,000 位元組是 0.2 GB。
- 範圍：每天 1–100,000,000 筆、平均 1–100,000 位元組、1–3,650 天，總計不超過 4 × 10¹⁵（整數運算仍精確）。

#### 10.4.5 練習

| 查詢 `task` | 值 |
|---|---|
| `logs`（`filter` 可選；`metric`：`count`、`first-ts`、`last-ts`、`max`（要 `field`）、`max-by`（要 `field`，回報 `report` 欄位，預設是關聯 ID 欄位；最大值必須唯一）、`top`（要 `group`：service、level、host 或欄位；最多的值必須唯一）、`distinct`（要 `field`）） | 筆數、數字，或文字（時間寫成「分:秒」，也接受秒數，例如 `10:08`、`608`、`608 秒`） |
| `correlate`（`id`；`metric`：`services`、`elapsed`、`records`、`first-error-service`、`last-service`） | 服務的**有序清單**（用逗號、空白、`→` 或 `->` 分開都可以，順序與個數都要對）、秒、筆數或服務名稱 |
| `retention`（`days`；`perDay`、`avgBytes` 可寫在查詢裡，否則取日誌的 `perDay` 與平均大小；`metric`：`avg-bytes`、`bytes-per-day`、`total-bytes`、`total-mb`、`total-gb`） | 位元組、MB 或 GB（一位小數） |
| `log-format`（`line`：原始行的 id；`metric`：`format`、`fields`） | 結構化／非結構化（也接受 structured、unstructured、raw、純文字），或欄位數 |

- 日誌查詢、`correlate`、`retention` 與結構化的分類都是既有的 `number`／`field`／`table`／`choice` 題，配上這些查詢；篩選寫錯（沒有的服務或欄位、範圍顛倒、比較文字與數字）時驗證拒絕。
- 新的填答形式 **`redact`**：`{ logs, mustHide, mustKeep, reference }`，學習者寫規則（答案的欄位 `rules`），檢查器套用規則後檢查 §10.4.3 的兩個條件；符合的規則都通過，`reference` 是其中一組。訊息例如「遮蔽後，第 8 筆紀錄的 password仍看得到必須隱藏的「hunter2」。」、「「A-1001」被遮掉了（原本出現 4 次，剩 0 次）：它是查問題需要的值，必須保留。」。

#### 10.4.6 UI（`log-viewer.tsx`）

- 開頭的事實：筆數、時間範圍、服務、各等級的筆數、其中有多少是產生的一般流量；標示「示意資料」。
- **篩選**：服務、最低等級、欄位、比較、值、時間的「從」與「到（不含）」都是有標籤的表單控制項（沒選欄位時比較與值停用）；讀不懂時值與時間欄位 `aria-invalid`，以 `aria-describedby` 指向 `role="alert"` 的錯誤清單，不列結果；「清除篩選」。
- **結果**：符合的紀錄依時間列成表格，**固定每頁 20 筆**（伺服器與瀏覽器的分頁相同，不需要虛擬捲動），第一頁、上一頁、下一頁、最後一頁按鈕，`aria-live` 說明「符合幾筆、第幾頁、第幾到第幾筆」；等級以文字（「錯誤（error）」）加顏色標示。
- **分組計數**：分組依據的選單（服務、等級、主機、各欄位），表格列出值、筆數、比例（整數 %，四捨五入），最多 30 組並註明總組數。
- **關聯**：選單列出出現在兩筆以上紀錄的關聯 ID，`aria-live` 說明經過的服務、經過時間與第一個錯誤，表格列出每筆的時間、Δ、距第一筆、服務、主機、等級、訊息。
- **原始行**：表格列出原始行；「解析的結果」放在 `<details>` 裡（避免直接透露分類題的答案）。
- **遮蔽**：規則的文字框（`aria-invalid`、`role="alert"` 的逐行錯誤）、可用樣式的清單、「恢復課程的規則」；結果寫出規則改動了幾個值，課程有 `checks` 時逐項列出「必須隱藏……已隱藏／仍看得到（位置）」與「必須保留……仍保留／被遮掉了」；遮蔽後的 JSON Lines（課程寫的紀錄與原始行）放在可以鍵盤捲動的區塊。
- 練習：`redact` 題用相同的規則文字框，寫出必須隱藏與保留的值，檢查後寫出規則改動了幾個值；參考解答列出參考規則。用到 D4 查詢的填答題，說明改為「日誌的時間寫成「分:秒」或秒數」；有日誌的課，練習上方的說明改用 `DEVOPS_LOGS_NOTICE`（`devopsExerciseNotice`），沒有日誌的課（已發布的 CICD01）逐字沿用原本的說明與提示。
- 文字全是繁體中文；顏色只用主題的 token（`--cur-bad`，以及 D4 新增、有深色值的 `--cur-warn`；D3 等待中的顏色也改用 `--cur-warn`，不再寫死色碼）。在 390 px 寬時控制項變成單欄，表格與 JSON Lines 在自己的框裡捲動，頁面沒有水平捲動（暫時頁面在瀏覽器中以 390 × 844 量過 `scrollWidth` = 390，量完即刪除）。

#### 10.4.7 驗證與登錄

- `logsExplorerProblems`、`logSetProblems`（由 `devopsContentProblems` 呼叫，訊息加上「logs 探索器 id」）：關聯欄位是合法的欄位名稱；至少一筆課程寫的紀錄；時間、等級、服務、主機、訊息、欄位名稱與值；產生器的種子、筆數、範圍、服務、路徑、主機數、使用者數、時間長度；有產生器時關聯欄位必須是 request_id，且課程寫的 request_id 不能看起來像產生的（`req-` 加數字）；總筆數；原始行的 id 不重複；`perDay` 的範圍；探索器的 `masking` 規則看得懂；`checks` 的值都在日誌裡、不能同時在兩個清單。
- `redactTaskProblems`：日誌存在；mustHide 至少一個；每個值都出現在日誌裡、不能同時在兩個清單；參考規則看得懂而且通過。參考答案通過、常見錯誤不通過（同 §9）。
- `validateContent`：活動是 `monitoring-dashboard` 時至少要有一個儀表板**或日誌**（「the monitoring-dashboard activity needs at least one of content.devops.dashboards or content.devops.logs」）；`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard or logs)」。
- `DEVOPS_STAGES_BUILT = ['D1', 'D2', 'D3', 'D4']`，`cicdFromBlueprint('CICD12')` 可以建立（§2）。`monitoring-dashboard` 在活動登錄中仍是規劃中，直到第一堂用它的完整課發布（既有規則）；`IMPLEMENTED_TEXT['monitoring-dashboard']` 加上日誌的文字說明（規劃中時不採用）。

#### 10.4.8 只在課文說明的部分

- 真實的日誌收集器、傳送代理與儲存（索引、分片、查詢語言、全文檢索）、日誌輪替、取樣、壓縮比、副本與冷熱分層；日誌、指標與分散式追蹤（span、trace context 標頭）的分工。
- 時間同步與時區、毫秒以下的時間精度、同一秒內真正的先後順序。
- 部分遮蔽（例如卡號只留後四碼）、雜湊化或代號化、在收集端或儲存端遮蔽的取捨、法規與個資的保存規定。
- CICD12 的終端機部分：在 ssh 主機上以既有的 E2、E7 指令（`grep`、`wc` 等）處理 JSON Lines 檔案，由寫課的人撰寫。

#### 10.4.9 沒有把握的地方

- **時間精度**：本模型以整數秒排序，同一秒內依日誌的順序；真實系統的時鐘不同步、毫秒精度與到達順序都可能讓追蹤的順序和這裡不同，課文要說明「依時間排列」的前提。
- **經過時間**：以第一筆到最後一筆紀錄的時間差當作請求的總延遲，是示意的算法；真實的延遲應看閘道記錄的 duration 或追蹤系統的 span，兩者在題目中都有（`elapsed` 與 `max` duration_ms），課文要分清楚。
- **樣式的涵蓋範圍**：固定的 email、card、token、ipv4 樣式只涵蓋常見的寫法（例如沒有國際化的電子郵件地址、沒有 Luhn 檢查、只認 `Bearer`、`sk_`、`tok_` 的權杖），不能當成完整的偵測；課文要說明遮蔽是縱深防禦的一層，最好的做法是一開始就不要記下敏感資料。
- **過度遮蔽的判定**：以 mustKeep 的「出現次數」判定，值的一部分被遮掉也算；這是本課程為了能檢查而固定的規則。
- **保留容量**：只計算未壓縮的 JSON 行；實際的儲存量受壓縮、索引與副本影響很大，題目的數字是量級的估計。

### 10.5 D5：分散式追蹤、取樣與基數（`monitoring-dashboard` 的一部分，**已完成**）

`src/lib/devops/traces.ts`（資料、產生器、驗證）、`trace-query.ts`（自身時間、關鍵路徑、瓶頸、百分位數）、`sampling.ts`（頭部與尾端取樣、每天的 span、基數）、`traces-check.ts`（`trace`、`sampling`、`cardinality` 查詢與探索器的連結驗證）、`sampling-check.ts`（`sampling-plan` 題）；元件 `trace-view.tsx`（加上 `trace-waterfall.tsx`、`sampling-form.tsx`、`trace-cardinality.tsx`）。給 KUB13（三大支柱、分散式追蹤、OpenTelemetry 的概念、取樣、高基數）與之後的 KUB15。和 D1–D4 一樣是**自創的教學模型**：沒有任何追蹤產品、SDK 或 Collector 的行為，文字也不提任何廠商；trace id 與 span id 的長度（32 與 16 個十六進位數字）和常見的 trace context 相同，但取樣規則是本課程自己的，**不宣稱**符合 OpenTelemetry 的位元配置。不登錄新活動：`metric-explorer` 仍是藍圖的名稱（ML19–22 之後另有用途），KUB13 的活動是 `monitoring-dashboard`。

#### 10.5.1 資料（`content.devops.traces`）

```ts
interface TracesExplorer { id; title; description; traces: TraceSet; links?: { logs?; field?; dashboard? }; labels?: string[] }
interface TraceSet {
  traces?: { id /* 32 個小寫十六進位數字 */; spans: SpanInput[] }[];   // 課程寫的追蹤，每個 1–200 個 span
  generate?: { seed; count /* 1–2000 */; root: CallShape; users? /* 1–1000000 */ };
  perDay?: number;                          // 正式環境每天的請求（追蹤）數，1–10⁹
  exemplars?: { series; minute; trace }[];  // D3 儀表板某一分鐘的範例追蹤
}
interface SpanInput { id /* 16 個十六進位數字 */; parent?; service; name; start; duration /* 整數毫秒 */; status?: 'ok' | 'error'; kind?: 'server' | 'client' | 'internal' | 'producer' | 'consumer'; attributes?: Record<string, string | number> }
interface CallShape { service; name; kind?; selfMs: { min; max }; calls?: CallShape[]; parallel?; errorPermille?; slowPermille?; slowMs?; attributes? }
```

- 一個追蹤恰好一個根 span（沒有 parent），其他 span 的 parent 都在同一個追蹤裡、一路連到根；子 span 不早於父 span 開始，**可以晚於父 span 結束**（非同步的工作），分析時裁到父 span 的期間。時間是從追蹤開始算起的整數毫秒（最多一小時）。狀態預設 ok，種類預設 internal（產生的根是 server）。span 依深度優先排列，同一層依開始時間（同時開始時保持寫的順序）。
- **追蹤的時間** = 最晚的結束 − 最早的開始（可能比根 span 長）；有任何 span 的狀態是 error 的追蹤是「有錯誤的追蹤」。
- **產生器**（決定性，`mulberry32(seed)`）：第 k 個追蹤依序抽：trace id 四次（每次 ⌊u × 2³²⌋ 寫成 8 個十六進位數字）；呼叫結構的每個 span，深度優先（先自己、再依序它的呼叫）：span id 兩次、自身時間一次（min + ⌊u × (max − min + 1)⌋）、`errorPermille` > 0 時一次（u × 1000 < errorPermille 就是 error）、`slowPermille` > 0 時一次（成立就在自身時間加上 slowMs）；最後有 `users` 時一次，根 span 的 `user_id` = `u-${1000 + ⌊u × users⌋}`。時間：一個 span 先做 ⌊自身 ÷ 2⌋ 毫秒，再做它的呼叫（依序一個接一個，`parallel` 時同時開始），再做剩下的自身時間；所以它的自身時間恰好是抽到的值。
- 範圍：最多 2,000 個追蹤；呼叫結構最多 40 個 span、8 層，產生的 span 總數（count × 結構的 span 數）最多 20,000；trace id 不重複（課程寫的與產生的一起檢查）。
- **連結**：`links.logs` 是同一堂課的日誌探索器，它的紀錄在 `links.field`（預設是那份日誌的關聯欄位，D4 已可設定，例如 `trace_id`）帶著 trace id；`links.dashboard` 是同一堂課的儀表板，`exemplars` 的序列與分鐘必須在它上面。

#### 10.5.2 自身時間、關鍵路徑與瓶頸（`trace-query.ts`）

- **自身時間** = 持續時間 − 子 span 期間的**聯集**長度（每個子 span 先裁到父 span 的 [start, end)，重疊的部分只算一次）。例：POST /orders [10, 310) 的子 span [20, 70)、[30, 90)、[80, 280) 聯集是 [20, 280) = 260，自身時間 40。
- **關鍵路徑**（在根 span 的期間內）：從根的結束往回走；在游標之前開始的子 span 中，取（裁到游標後）**最晚結束**的那一個（同時結束取先開始的），它結束到游標之間的時間屬於父 span，然後走進這個子 span（到它裁過的結束），游標移到它的開始，再找下一個；沒有子 span 的時間屬於父 span。所有片段加起來恰好是根 span 的持續時間。
- **經過的服務**：關鍵路徑經過的 span 依開始時間排列，取服務名稱，連續相同的只寫一次（和 D4 的關聯相同）。**瓶頸**：各服務在關鍵路徑上屬於自己的片段加總，最多的那個；平手時沒有瓶頸（查詢拒絕）。平行的呼叫只有最晚結束的那個在路徑上。
- **百分位數**（跨追蹤，最近排名法）：追蹤的時間由小到大排序，取第 ⌈p × N ÷ 100⌉ 個（p 是 1–100 的整數，預設 95）。

手算的例子（`tests/support/traces-fixture.ts` 的 T_OK，400 ms、7 個 span）：自身時間 94、6、40、50、60、20、180；關鍵路徑 gateway 310–400 → orders 280–310 → payments 270–280 → provider.charge 90–270 → payments 80–90 → cache.get 30–80（裁到 POST /charge 的開始）→ db.query 20–30 → orders 10–20 → gateway 8–10 → auth 2–8 → gateway 0–2；payments 200、orders 100、gateway 94、auth 6，瓶頸是 payments，經過 gateway → auth → orders → payments。

#### 10.5.3 取樣與基數（`sampling.ts`）

- 比例以千分比保存（0–1000；1000 是全部保留），畫面與作答寫成百分比，最多一位小數（0.5% = 5‰）。
- **門檻規則**（本課程自訂）：從 trace id 取 8 個十六進位數字成為 r（0…2³² − 1），**r × 1000 < 比例 × 2³²** 時保留。同一個 trace id 在每個服務得到相同的決定；比例越大保留的追蹤包含比例小時保留的全部。整數運算，瀏覽器與 Node 相同。
- **頭部取樣**：在根 span 開始時決定，還不知道結果；用 trace id 的**最後** 8 個數字與頭部比例。
- **尾端取樣**：在整個追蹤完成後、只對頭部留下的追蹤決定，依序：`keepErrors` 時有錯誤就保留；有 `slowerThanMs` 時時間 **>** X 就保留；否則 trace id 的**前** 8 個數字落在 `restPermille` 之下就保留（和頭部用不同的數字，兩個比例互相獨立）。
- **每天的 span**（估計）= perDay × 保留的 span 數 ÷ 追蹤數，四捨五入（§5.3 的 roundHalfUp）；不取樣時用全部的 span 數。例：303 個追蹤、1,515 個 span、每天 2,000,000 個請求 → 10,000,000 個 span；頭部 10% 留下 132 個 span → 871,287。
- **基數**：一個以 span 產生的指標，序列數最多是各標籤**不同值個數的乘積**（以 bigint 精確計算）。標籤是 service、name、status、kind 與各屬性；不同值在所有有這個標籤的 span 上計算。加上一個有 5,000 個值的 `user_id`，序列數就乘上 5,000。這是上限；實際出現的組合可能較少（課文說明）。

#### 10.5.4 練習

| 查詢 `task` | 值 |
|---|---|
| `trace`（`trace` 是 trace id；`metric`：`spans`、`duration`、`self-time`（要 `span`：span id，或在這個追蹤裡唯一的操作名稱）、`critical-services`、`bottleneck`、`bottleneck-time`、`error-spans`、`log-records`（經由探索器的 `links.logs`）；不需要 `trace` 的：`percentile`（`p`，預設 95）、`slowest`（必須唯一）、`exemplar`（要 `series`、`minute`）） | 毫秒、個、筆；服務的**有序清單**；服務名稱；trace id（完整的 32 碼，或在這組追蹤裡唯一的前 8 碼） |
| `sampling`（`policy` 可選，預設全部保留；`metric`：`traces`、`error-traces`、`slow-traces`、`kept`、`kept-errors`、`kept-slow`（slow 兩種要 `slowerThan`）、`spans`、`kept-spans`、`spans-per-day`、`kept-spans-per-day`（要追蹤組的 `perDay`）） | 個 |
| `cardinality`（`labels`：標籤名稱（在 `traces` 的 span 上計數）或 `{ name, values }`；`metric`：`series`（乘積，條）、`distinct`（恰好一個標籤）） | 條或個 |

- 追蹤的讀法、取樣的數字與基數都是既有的 `number`／`field`／`table`／`choice` 題配上這些查詢；查詢寫錯（沒有的追蹤、span、標籤、範例，沒有連結的日誌，比例超出範圍，乘積超過安全整數）時驗證拒絕。數字可以帶「ms、毫秒、個、條、span」等單位。
- 新的填答形式 **`sampling-plan`**：`{ traces, constraints: { keepAllErrors?: true; keepSlowerThan?; maxSpansPerDay? }, reference: SamplingPolicy }`。學習者填頭部比例（%）、尾端取樣（用或不用）、尾端是否保留有錯誤的追蹤、慢於幾毫秒（空白表示不用）、其餘的比例（%）（答案的欄位 `head`、`tail`、`errors`、`slower`、`rest`）；檢查器用這個設定把課程的追蹤重新取樣，逐項檢查：有錯誤的追蹤全部保留、時間 > X 的追蹤全部保留、估計每天的 span ≤ N。符合的設定都通過，`reference` 是其中一種。訊息例如「有錯誤的追蹤有 5 個，只保留了 0 個；題目要全部保留。」、「估計每天保留 10,000,000 個 span，超過上限 1,200,000。」。
- 驗證（`tracesExplorerProblems`、`samplingPlanProblems`，由 `devopsContentProblems` 呼叫，訊息加上「traces 探索器 id」）：追蹤組的每項規則（§10.5.1）；連結的日誌存在、有那個欄位、至少一筆紀錄帶著這組的某個 trace id；連結的儀表板存在、範例的序列存在、分鐘在儀表板內；有範例就要連結儀表板；`labels` 都是 span 有的標籤；`sampling-plan` 至少一個條件、`maxSpansPerDay` 需要 perDay、`keepAllErrors` 需要有錯誤的追蹤、`keepSlowerThan` 需要至少一個更慢的追蹤、參考設定合法且符合全部條件。參考答案通過、常見錯誤不通過（同 §9）。
- `validateContent`：活動是 `monitoring-dashboard` 時至少要有儀表板、日誌**或追蹤**（「the monitoring-dashboard activity needs at least one of content.devops.dashboards, content.devops.logs or content.devops.traces」）；`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard, logs or traces)」。`DEVOPS_STAGES_BUILT = ['D1', 'D2', 'D3', 'D4', 'D5']`。`IMPLEMENTED_TEXT['monitoring-dashboard']` 加上追蹤的文字說明（活動已實作，所以登錄的說明跟著更新）。已發布的 CICD11、CICD12 沒有改動；它們沒有追蹤，練習上方的說明逐字不變（有追蹤的課改用 `DEVOPS_TRACES_NOTICE`）。

#### 10.5.5 UI（`trace-view.tsx`）

- 開頭的事實：追蹤數、span 數、有錯誤的追蹤數、追蹤時間的 p50／p95／p99（最近排名法）、其中有幾個是產生的、每天的請求數；標示「示意資料」。
- **選追蹤**：下拉選單分組列出課程寫的追蹤、產生的有錯誤的追蹤（最多 20 個）、產生的最慢的 10 個（選項寫出 trace id 的前 8 碼、入口的服務與操作、時間、是否有錯誤）；由範例或日誌開啟的其他追蹤另成一組。下方寫出完整的 trace id。
- **瀑布圖**（`trace-waterfall.tsx`）：每個 span 一列，左邊是依深度縮排的按鈕（服務：操作、持續時間），右邊是共用時間軸上的 CSS 長條（錯誤的 span 用 `--cur-bad`，關鍵路徑上屬於它自己的片段畫成細線），下方是時間軸的刻度；按鈕採 roving tabindex，方向鍵（上下左右）、Home、End 移動並聚焦，`aria-pressed` 標出選取的 span，`aria-live` 說明它的服務、種類、狀態、開始與結束、持續、自身時間、是否在關鍵路徑上。上方以文字寫出關鍵路徑經過的服務、各服務在路徑上的時間與瓶頸。等效的表格：#、span、種類、狀態、開始、持續、自身時間、關鍵路徑（「在路徑上（自己 N ms）」或「—」）。
- **範例追蹤**：連結儀表板時列出每個範例（第幾分鐘、序列的名稱），按鈕開啟那個追蹤。**日誌**：連結日誌時，表格列出帶著所選 trace id 的紀錄（時間、服務、等級、訊息）。
- **取樣**（`sampling-form.tsx`）：頭部比例、尾端取樣（選單）、保留有錯誤的追蹤（選單）、慢於幾毫秒、其餘的比例，加上「列為慢的門檻」（預設 p95，只用來計數）；不用尾端時尾端的欄位停用。讀不懂時欄位 `aria-invalid`，以 `aria-describedby` 指向 `role="alert"` 的錯誤清單，不列結果；「恢復預設（頭部 10%）」。結果以 `aria-live` 總結，表格列出追蹤、有錯誤的、慢的、span 與每天的 span（全部、保留、比例），並寫出頭部丟掉幾個、尾端因錯誤、因為慢、依比例各保留幾個。
- **基數**（`trace-cardinality.tsx`）：表格列出每個標籤與不同值的個數，每列一個有標籤的勾選框；「假設再加一個標籤」的名稱與個數（例如 user_id、50,000，不合法時 `aria-invalid` 與 `role="alert"`）；`aria-live` 寫出算式（8 × 11 × 2 = 176 條）與加上後的乘積與倍數。
- 練習：`sampling-plan` 用相同的欄位元件，寫出條件，檢查後列出你的設定取樣的結果表；參考解答寫出參考設定與它的結果。用到 D5 查詢的填答題，說明改為「追蹤的時間一律以毫秒計，trace id 可以只填前 8 碼」。
- 文字全是繁體中文；顏色只用主題的 token（`--accent`、`--cur-bad`、`--text`、`--soft`、`--border`）。在 390 px 寬時瀑布圖的每列改成上下兩段（按鈕在上、長條在下），控制項變成單欄，表格在自己的框裡捲動，頁面沒有水平捲動（暫時頁面在瀏覽器中以 390 × 844 量過 `scrollWidth` = 390，量完即刪除）。

#### 10.5.6 只在課文說明的部分

- OpenTelemetry 的 SDK、自動 instrumentation、Collector 的設定（receiver、processor、exporter、tail sampling processor 的設定檔）、OTLP 協定、trace context 標頭（`traceparent`）的格式與跨服務的傳遞、baggage。
- 任何廠商或開源的追蹤後端與它們的儲存、查詢、保留與計價；span 事件與 links、多個父 span、跨追蹤的關聯。
- 由 span 產生 RED 指標的實作、exemplar 的實際儲存方式；基數造成的記憶體與費用、標籤的白名單與彙整；實際出現的組合數（本模型只算上限）。
- 取樣比例在多個服務間的協調（parent-based、一致性取樣的機率傳遞）、依延遲或錯誤的動態取樣、取樣後的計數補正。

#### 10.5.7 沒有把握的地方

- **取樣的位元**：門檻規則（後 8 碼給頭部、前 8 碼給尾端的比例，r × 1000 < 比例 × 2³²）是本課程為了能手算而定的；OpenTelemetry 的機率取樣規格以 trace id 的隨機位元與 rejection threshold 判定，細節不同，課文不能說成任何規格或產品的行為。
- **關鍵路徑**：「最晚結束的子 span」演算法是常見的教學版本；非同步的 span（晚於父 span 結束、producer／consumer）裁到父 span 的期間，真實的工具可能把它們另外顯示或不列入。平手的處理（先開始的）是本模型的選擇。
- **瓶頸的定義**：以「服務在關鍵路徑上的自身片段加總」判定；也有工具用整個追蹤的自身時間或最長的 span，課文要說明是哪一種。
- **每天的 span**：以樣本的平均推估，假設正式環境的追蹤和樣本相同分布；真實的量會隨流量與錯誤率變動。
- **基數**：乘積是上限；實際的序列數是出現過的組合，通常較少，但高基數標籤（user_id、request id）仍會讓它失控。

### 10.6 D6：SLI、SLO、SLA、錯誤預算與消耗率告警（`monitoring-dashboard` 的一部分，**已完成**）

`src/lib/devops/slo.ts`（資料、事件、SLI、錯誤預算、SLA、驗證）、`burn.ts`（消耗率、剩下的時間、多視窗告警的評估）、`slo-check.ts`（`slo`、`burn` 查詢與 `burn-alert` 題）；元件 `slo-view.tsx`（加上 `budget-chart.tsx`、`burn-form.tsx`，並沿用 D3 的 `alert-results.tsx`）。給 KUB14（SLI、SLO、SLA、錯誤預算、以 SLO 為基礎的告警）與之後的 KUB15。和 D1–D5 一樣是**自創的教學模型**：「多個視窗、多個消耗率門檻」的告警是 SRE 實務中常見的說法，但這裡的規則（取整、時段、沒有 `for`）是本課程自己的，不宣稱符合任何產品或文件，文字也不提任何廠商。不登錄新活動：KUB14 的活動仍是 `monitoring-dashboard`。

#### 10.6.1 資料（`content.devops.slos`）

```ts
interface SloExplorer { id; title; description; slo: SloScenario }
interface SloScenario {
  service: string;
  sli: string;                                   // 好事件的定義（文字，例如「回應碼不是 5xx 的請求」）
  bucketMinutes: 1 | 5 | 60;                     // 時段 t 涵蓋第 [t × B, (t + 1) × B) 分鐘
  buckets: number;                               // 1–720（720 個小時是 30 天）
  total: EventSeries;                            // 每個時段的全部事件
  good?: EventSeries; bad?: EventSeries;         // 恰好給一個；另一個由 total 相減
  objective: { targetPermyriad; windowMinutes; windowTotal? };   // 9990 = 99.9%
  sla?: { targetPermyriad; credits: { belowPermyriad; creditPercent }[] };
  incidents?: Incident[];                        // 宣告的事故，以時段計 [start, end)
  alerts?: BurnAlertRule[];                      // 課程的消耗率告警；探索器從第一條開始
}
interface EventSeries { values?: number[]; shape?: SeriesShape }   // D3 的產生器（§10.3.1），以時段為單位
interface BurnAlertRule { id; label; longMinutes; shortMinutes; factorTenths; severity }      // 14.4 倍 = 144
```

- 事件是每個時段 0–10,000,000 的整數；逐點寫出（長度等於 `buckets`）或用 D3 的形狀（`at`、`from`、`to`、尖峰長度都以時段計）。好事件或壞事件不能超過全部事件。
- **期間** = buckets × bucketMinutes。**視窗**是 bucketMinutes 的倍數、不短於期間、最多 90 天。期間比視窗短時，情境是視窗的開頭，課程必須寫出 `windowTotal`（整個視窗預計的事件數，不少於期間的總數）；期間等於視窗時不能寫。

#### 10.6.2 算術（全部是精確的整數運算；乘積用 BigInt）

| 量 | 算法 | 顯示 |
|---|---|---|
| SLI（一段時段 [from, to)） | 好 ÷ 全部 | 百分比、三位小數，四捨五入（§5.3）：roundHalfUp(好 × 100000, 全部) ÷ 1000 |
| 是否達成 SLO | 好 × 10000 ≥ 目標 × 全部（交叉相乘，**不用**顯示的取整值） | 達成／未達成 |
| 錯誤預算（事件） | ⌊視窗總數 × (10000 − 目標) ÷ 10000⌋：仍能達成 SLO 的最多壞事件（壞事件是整數，壞 ≤ ⌊x⌋ ⇔ 壞 ≤ x） | 整數；必須 ≥ 1 |
| 用掉的預算（第 t 個時段之後） | 時段 0…t 的壞事件累計；用掉 % = 累計 × 100 ÷ 預算 | 一位小數，四捨五入 |
| 剩下的預算 | 預算 − 累計（可以是負數）；剩下 % = 100 − 用掉 %（用顯示的一位小數相減，兩者相加恰好 100） | 整數；一位小數 |
| 預算用完 | 第一個累計 ≥ 預算的時段，答案是它開始的分鐘 | 分鐘 |
| 消耗率（第 t 個時段、W 分鐘的視窗） | 時段 [t − k + 1, t]（k = W ÷ bucketMinutes）的 (壞 ÷ 全部) ÷ (1 − 目標) = 壞 × 10000 ÷ (全部 × (10000 − 目標))；視窗未滿沒有值；沒有事件是 0 | 一位小數，四捨五入（十分位整數 roundHalfUp(壞 × 100000, 全部 × (10000 − 目標))） |
| 預算還能撐幾小時 | 剩下的預算 ÷ 視窗裡每小時的壞事件 = 剩下 × W ÷ (壞 × 60)；已用完是 0，視窗沒有壞事件就「不會用完」（查詢拒絕） | 一位小數 |
| SLA 的補償 | 補償表由 SLA 的目標往下（belowPermyriad 遞減、補償遞增，第一段的 below 就是 SLA 的目標）；取 SLI **低於**的最低一段：好 × 10000 < below × 全部 | 整數 %；不低於任何一段是 0% |

- **消耗率告警**（`evaluateBurn`）：第 t 個時段，長、短兩個視窗都已滿、而且兩者的消耗率都 ≥ factor ÷ 10（精確比較：壞 × 100000 ≥ factorTenths × 全部 × (10000 − 目標)）時條件成立。狀態、觸發期間與事故的對應**直接使用 D3 的狀態機**（`alerts.ts` 抽出的 `runAlert`，`evaluateAlert` 也改用它，行為不變），每個時段一步，`for` 固定為 0（短視窗讓問題停止後很快恢復，扮演了等待的角色）。偵測延遲、誤報、漏掉的定義同 §10.3.2；對外的時間（第一次觸發、延遲、觸發中的時間、訊息）一律換算成**分鐘**（時段 × bucketMinutes）。
- 視窗是 bucketMinutes 的倍數、在 bucketMinutes 到期間之間，短視窗不長於長視窗；門檻 0.1–1000 倍。

手算的例子（`tests/support/slo-fixture.ts`）：

- `tiny`：12 個 1 分鐘的時段，每個 1,000 個事件，目標 99%（視窗就是這 12 分鐘），壞事件 2 3 5 40 50 30 5 2 20 3 2 2，事故 [3, 6)。預算 ⌊12,000 × 1%⌋ = 120；第 4 分鐘之後用掉 100（83.3%），第 5 分鐘累計 130，預算用完；最後 164（136.7%），剩 −44（−36.7%）；SLI 11,836 ÷ 12,000 = 98.633%（未達成）。消耗率：第 3 分鐘 1 分鐘視窗 4.0、第 4 分鐘 3 分鐘視窗 95 ÷ 3,000 ÷ 1% = 3.2、5 分鐘視窗 2.0。

| 告警（長／短 ≥ 門檻） | 觸發 | 通知 | 誤報 | 偵測延遲 |
|---|---|---|---|---|
| 5／1 分鐘 ≥ 2（2.0 ≥ 2.0 成立） | 第 4–5、8 分鐘 | 2 | 1（第 8 分鐘） | 1 分鐘 |
| 3／1 分鐘 ≥ 2 | 第 4–5 分鐘（第 8 分鐘的 3 分鐘消耗率只有 0.9） | 1 | 0 | 1 分鐘 |
| 1／1 分鐘 ≥ 2（等於單一視窗） | 第 3–5、8 分鐘 | 2 | 1 | 0 |
| 5／1 分鐘 ≥ 3 | 沒有（5 分鐘的消耗率最高 2.6） | 0 | 0 | 漏掉 |

- `month`：720 個小時（30 天，就是視窗），每小時 10,000 個事件，目標 99.9%；壞事件每小時 5，第 300–303 小時 605，第 500 小時起 10（形狀產生，沒有雜訊）。預算 7,200；用掉 7,100（98.6%），剩 100；SLI 99.901%（達成）。第 303 小時之後用掉 3,920（54.4%），照最近 1 小時的速率還能撐 3,280 ÷ 605 = 5.4 小時，照最近 6 小時是 8.1 小時。「1 小時 ≥ 14.4」只抓到尖峰；「24 小時／6 小時 ≥ 1」在第 300–308 小時與第 523 小時起觸發，緩慢的錯誤延遲 23 小時（1,380 分鐘）才偵測到。第 300–323 小時的可用度 98.95%，落在 SLA 的「低於 99%」，補償 25%。

#### 10.6.3 練習

| 查詢 `task` | 值 |
|---|---|
| `slo`（`metric`：`sli`、`slo-met`、`total-events`、`bad-events`、`sla-credit`（可選 `from`、`to`，時段的範圍，預設全部）；`budget-events`；`consumed`、`consumed-pct`、`remaining`、`remaining-pct`（可選 `at`，預設最後一個時段）；`burn-rate-at`、`hours-left`（要 `at` 與 `window` 分鐘）；`exhausted-at`） | 百分比（SLI 三位小數，預算一位小數）、個、倍（一位小數）、小時（一位小數）、分鐘，或文字（`slo-met`：達成、未達成，也接受 met、missed） |
| `burn`（`rule`：情境的告警 id，或直接寫一個條件；`metric`：`first-firing`、`first-resolved`、`notifications`、`false-alerts`、`missed`、`detected`、`firing-minutes`、`detection-delay`（要 `incident`）、`state-at`（要 `at`）） | 分鐘、次、個，或狀態的文字（同 D3） |

- 讀 SLO 的題目都是既有的 `number`／`field`／`table`／`choice` 題配上這些查詢；查詢寫錯（沒有的情境、告警或事故、範圍顛倒、時段超出、視窗未滿、沒有 SLA、預算從未用完）時驗證拒絕。數字可以帶「%、個、事件、倍、×、x、小時、分鐘」等單位。
- 新的填答形式 **`burn-alert`**：`{ slo, constraints, reference }`，條件和 `alert-rule` 相同（`detectWithin` 以**分鐘**計、`maxMissed`、`maxFalseAlerts`、`maxNotifications`，都含等號）。學習者填長視窗、短視窗（分鐘，也可以寫成「1 小時」、「6h」）與門檻（倍，最多一位小數，可帶「倍」或 x）（答案的欄位 `long`、`short`、`factor`）；檢查器把每個時段重新評估一次，逐項檢查。符合條件的設定都通過，`reference` 是其中一種。訊息沿用 D3，例如「誤報有 1 次，超過上限 0。」、「事故「新版本的緩慢錯誤」第 30000 分鐘開始，第 31380 分鐘才觸發，延遲 1380 分鐘，超過 60 分鐘。」。
- 驗證（`sloProblems`、`burnAlertProblems`，由 `devopsContentProblems` 呼叫，訊息加上「slo 探索器 id」）：服務與 SLI 的文字；時段長度與個數；恰好有好或壞事件之一；事件序列（D3 的檢查，訊息改寫成時段）；好或壞事件不超過全部；目標 1–9999；視窗與 `windowTotal`；預算至少 1 個事件；SLA 的目標低於 SLO、第一段等於 SLA 的目標、區間遞減、補償遞增；事故（D3 的檢查）；告警的 id 不重複（和事故共用）、名稱、嚴重度與條件；`burn-alert` 至少一個條件且都是 ≥ 0 的整數、偵測類的條件需要事故、參考設定合法且符合全部條件。參考答案通過、常見錯誤不通過（同 §9）。
- `validateContent`：活動是 `monitoring-dashboard` 時至少要有儀表板、日誌、追蹤**或 SLO**（「the monitoring-dashboard activity needs at least one of content.devops.dashboards, content.devops.logs, content.devops.traces or content.devops.slos」）；`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard, logs, traces or an SLO)」。`DEVOPS_STAGES_BUILT = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']`。`IMPLEMENTED_TEXT['monitoring-dashboard']` 加上 SLO 的文字說明。已發布的 CICD11、CICD12 沒有改動；它們沒有 SLO，練習上方的說明逐字不變（有 SLO 的課改用 `DEVOPS_SLO_NOTICE`）。

#### 10.6.4 UI（`slo-view.tsx`）

- 開頭：標示「示意資料」；四張卡片（`SLO 與錯誤預算`）寫出目標與視窗、好事件的定義、整段的 SLI（好 ÷ 全部，是否達成）、錯誤預算與算式（⌊總數 × 允許的比例⌋，有 `windowTotal` 時註明）、期間結束時剩下與用掉的預算；時段的長度、期間是否只是視窗的開頭、事故。
- **兩張 SVG**（`budget-chart.tsx`，不用圖表套件）：每個時段的 SLI 與目標的虛線、剩下的錯誤預算（%）與 0% 的實線；事故是底色，選取的時段有底色；每張有 `<title>`（最低的 SLI 與時段、低於目標的時段數；最後剩下多少、在哪個時段用完）與 `<desc>`。等效的表格（`<details>`）每列一個時段：時段（1 分鐘寫「第 t 分鐘」，5 與 60 分鐘寫分鐘範圍，60 分鐘另加「第 d 天 hh:mm」）、全部、好、壞、SLI、累計的壞事件、剩下的預算（個與 %），低於目標與用完的格子以 `--cur-bad` 標出。
- 共用的步進器（方向鍵、Home、End）逐時段移動，`aria-live` 說明這個時段的事件與 SLI、累計用掉與剩下的預算、目前告警的兩個視窗的消耗率與狀態、進行中的事故。
- **各視窗的消耗率表**：課程告警與目前設定用到的每個視窗，在選取的時段寫出壞事件、全部事件、錯誤率、消耗率（是否達到門檻）與照這個速率預算還能撐幾小時（「已用完」、「這個速率不會用完」）；視窗未滿時寫出還需要幾個時段。
- **消耗率告警**（`burn-form.tsx`）：「課程的告警」選單、長視窗、短視窗、門檻三個有標籤的輸入欄；讀不懂或不合法時每個欄位 `aria-invalid`，以 `aria-describedby` 指向 `role="alert"` 的錯誤清單，不畫狀態列與結果；「恢復課程的告警」。結果沿用 D3：總計卡片（`aria-live`，時間換成分鐘）、每個時段的狀態列（SVG）與圖例、事故的偵測表、觸發期間表與狀態變化表（`AlertTables` 加上可選的 `bucketMinutes`，把時段寫成分鐘；D3 的預設是 1，輸出不變）。
- **SLA**：`aria-live` 寫出整段的可用度、承諾與落在的區間與補償；補償表每列一個區間（「99% 以上、低於 99.5%」），落在的那一列以 `data-current` 標出並寫「（這段期間）」。
- 練習：`burn-alert` 用相同的欄位元件，寫出條件，檢查後寫出你的告警的通知、誤報、漏掉與每個事故的偵測延遲（分鐘）；參考解答寫出參考設定與它的評估結果。用到 D6 查詢的填答題，說明改為「時間一律以分鐘計（時段的開始）」。
- 文字全是繁體中文；顏色只用主題的 token（沿用 `devops-explorer.module.css` 既有的類別，沒有新的樣式）。在 390 px 寬時卡片與控制項變成單欄、圖隨欄寬縮放、表格在自己的框裡捲動，頁面沒有水平捲動（暫時頁面在瀏覽器中以 390 × 844 量過 `scrollWidth` = 390，展開全部表格後仍是 390，量完即刪除）。

#### 10.6.5 只在課文說明的部分

- 真實的 SLO 工具與監控系統的設定、記錄規則（recording rules）與查詢語言、告警路由與值班呼叫；以時間（好的分鐘數）而不是事件計算的 SLI、延遲 SLI 的百分位數怎麼由請求算出。
- 滾動視窗與日曆視窗的差別、錯誤預算政策（預算用完時凍結發布、事後檢討）的組織流程、多個 SLI 的組合、依賴服務的 SLO。
- SLA 的法律與合約內容（量測方式、排除條款、申請補償的流程、補償的上限）；本模型只查表。
- 常見的多視窗門檻組合（例如 1 小時／5 分鐘 14.4 倍、6 小時／30 分鐘 6 倍、3 天／6 小時 1 倍）可以在課文說明為「常見的起點」，數字的由來（例如 1 小時用掉 30 天預算的 2%）以算式說明；探索器的時段若是一小時，就無法表示 5 分鐘的短視窗。

#### 10.6.6 沒有把握的地方

- **錯誤預算取整**：⌊總數 × (1 − 目標)⌋ 是本課程為了讓「最多幾個壞事件」是整數而定的；有些文件把預算寫成小數或以時間表示，題目要用本模型的定義。
- **用掉的百分比以預算的整數為分母**，而消耗率用精確的 1 − 目標；兩者在預算不是整數時有極小的差異，「剩下幾小時」的手算若用顯示的取整值可能差在最後一位，題目宜選整除的數字。
- **剩下的時間**以「視窗裡每小時的壞事件」推估（假設流量不變），不是以消耗率乘上視窗長度；兩者在流量平均時相同。
- **沒有 `for`**：多視窗告警以短視窗取代等待時間是常見的說法；本模型固定 `for` 0，告警每個時段評估一次，時段為 60 分鐘時偵測的粒度就是一小時。
- **期間比視窗短**時，預算來自課程寫的 `windowTotal`（預計的流量），用掉的百分比是「相對整個視窗的預算」，而 SLI 只算期間內的事件；課文要說明兩者的差別。
- **SLA 的補償表**由課程提供，沒有通用標準；可用度用好事件 ÷ 全部事件，真實合約常以可用的分鐘數計算。

## 11. 測試

| 檔案 | 內容 |
|---|---|
| `tests/devops-capability.test.ts` | `CICD_SHAPES` 15 列逐一斷言（活動、能力、需要的階段、CICD10 的可選終端機、CICD11／12 在 D3 前無法建立）、其他島的課被拒絕；島嶼登錄（預備、沒有單元與頁面、15 堂規劃中、被 `validateCurriculum` 拒絕）；只登錄 `deployment-simulator`、它在活動登錄中仍是規劃中、其他活動不變；四捨五入與中位數；兩個團隊的 DORA 指標（手算）；紀錄的每種驗證錯誤；整數分配、maxSurge／maxUnavailable 的取整、錯誤餘數；四種策略逐分鐘的執行個體與承接量、總計；藍綠的立即回滾；金絲雀的閘門未通過、樣本不足、p95、沒有閘門；擴充與收縮（太早收縮、正確順序、忘了擴充）與驗證；功能旗標；情境的驗證錯誤；每種查詢、數字與文字的比對、每道練習的參考答案通過、常見錯誤不通過；規劃題的模擬與訊息、參數解析；`devopsContentProblems` 的各種錯誤；合成的 CICD10 通過 `validateContent` 與發布閘門、內容與能力的綁定、能力的配對規則；`validateCurriculum(curriculum)` 是 `[]` |
| `tests/devops-explorer-dom.test.tsx` | 部署紀錄的指標文字、時間軸與等效表格、中位數標記、選取部署的說明；部署模擬的總計、三張圖與逐分鐘表格、改策略與參數重新模擬、不合法參數的警示、閘門開關、步進器的方向鍵與 Home／End、旗標；數字、選擇、表格、規劃題的檢查；參考解答由資料算出 |
| `tests/devops-capability.test.ts`（D3） | 產生器的手算值（step、ramp、spike、負的 ramp、取 0）、雜訊和 `draws(seed)` 逐點相同且可重現、換種子就不同；序列與儀表板的驗證錯誤；`tiny` 三條規則逐分鐘的狀態、觸發期間、通知、誤報、延遲；平均的精確比較（15 ÷ 3 = 5）與一位小數；最大值、最小值視窗、到最後仍觸發；事故後才觸發（漏掉且誤報）；`api` 的告警疲勞與偵測延遲；事故時間與嚴重等級；`series`、`alert`、`incident` 每種查詢與錯誤；每道 D3 練習的參考答案通過、常見錯誤不通過；`alert-rule` 的評估、訊息與欄位解析；驗證錯誤；合成的 CICD11 通過 `validateContent` 與發布閘門，活動與內容的綁定；CICD11 可以建立、CICD12 因 D4 被拒絕；`monitoring-dashboard` 在活動登錄中仍是規劃中 |
| `tests/devops-explorer-dom.test.tsx`（D3） | 四張折線圖與每列 10 分鐘的等效表格、事故的底色、門檻只畫在規則的序列；選規則與改欄位重新評估（總計、偵測表、觸發期間表、視窗線）；不合法的門檻 `aria-invalid` 與警示；步進器的方向鍵與 Home／End 及每分鐘的說明；狀態變化表；事故時間線與矩陣；`alert-rule` 練習的檢查與結果、黃金訊號表、算出的參考解答 |
| `tests/support/dashboard-fixture.ts` | 只供測試：`tiny`（12 分鐘逐點寫出）與 `api`（180 分鐘、四個黃金訊號、兩次事故與一次尖峰，全部由產生器產生）、七道 D3 練習與一堂合成的 CICD11 課 |
| `tests/devops-capability.test.ts`（D4） | 紀錄依時間排序與編號、`分:秒`；產生器和 `draws(seed)` 逐筆相同（每筆六次抽樣）、可重現、換種子就不同、同一秒課程寫的在前；UTF-8 位元組和 Node 的 `Buffer.byteLength` 相同、JSON 行；日誌的驗證錯誤；`small` 的篩選（等級、服務、欄位、時間範圍、沒有欄位的紀錄）、分組、關聯（Δ、經過的服務、經過時間、第一個錯誤）、原始行的格式；遮蔽規則的解析與錯誤、欄位與樣式的遮蔽（卡號、IP、權杖）、洩漏與過度遮蔽；保留容量的手算值與四捨五入；`logs`、`correlate`、`retention`、`log-format` 每種查詢與錯誤（含有序清單與時間的比對）；每道 D4 練習的參考答案通過、常見錯誤不通過；`redact` 題的訊息；驗證錯誤；CICD12 可以建立；CICD12 大綱的日誌課（只有 devops-explorer）通過 `validateContent` 與發布閘門，完整形狀需要終端機內容 |
| `tests/devops-explorer-dom.test.tsx`（D4） | 日誌檢視器的事實、分頁（第一頁到最後一頁、按鈕停用）、篩選（等級、服務、欄位、時間）與分組表、不合法篩選的 `aria-invalid` 與警示、關聯選單與 Δ 表、遮蔽編輯器（課程的規則、遮蔽後的 JSON Lines、必須隱藏與保留的結果、過度遮蔽、不合法規則的警示、恢復）、原始行的解析結果；`redact` 練習的檢查與結果、`correlate` 表的檢查、算出的參考解答、日誌以 id 顯示 |
| `tests/support/logs-fixture.ts` | 只供測試：`small`（九筆手寫紀錄、四行原始行，含電子郵件、卡號、權杖與密碼）、`shop`（400 筆產生的流量與兩次付款逾時）、三個日誌探索器、七道 D4 練習與一份 CICD12 大綱的日誌課內容 |
| `tests/devops-capability.test.ts`（D5） | 追蹤依深度優先排列、時間與錯誤、晚於父 span 結束的子 span；產生器和 `draws(seed)` 逐個相同（每個追蹤 22 次抽樣）、可重現、換種子就不同；追蹤組的每種驗證錯誤；聯集長度；T_OK、T_FAIL、T_PAR 手算的自身時間、關鍵路徑片段（加起來等於根）、經過的服務、各服務的時間與瓶頸；裁切、平手、沒有瓶頸；最近排名法；頭部取樣的門檻（10%、19.9%、20% 手算）、尾端的規則與順序、比例越大保留越多、和 BigInt 的獨立計算相同、每天的 span；`policyText`；不同值與乘積；`trace`、`sampling`、`cardinality` 每種查詢與錯誤；每道 D5 練習的參考答案通過、常見錯誤不通過；`sampling-plan` 的欄位解析與訊息；驗證錯誤（連結、範例、標籤、任務）；以 KUB13 的概念合成的 `monitoring-dashboard` 課（只有追蹤也可以）通過 `validateContent` 與發布閘門；`DEVOPS_STAGES_BUILT` 有 D5、`monitoring-dashboard` 的說明提到追蹤 |
| `tests/devops-explorer-dom.test.tsx`（D5） | 追蹤探索器的事實、選單的分組、瀑布圖的按鈕與等效表格（自身時間、關鍵路徑）、換追蹤、錯誤的 span；方向鍵、Home、End 與點選移動並聚焦、`aria-live` 的說明；範例追蹤開啟追蹤、帶著 trace id 的日誌表；取樣的結果表與總結、尾端的欄位、讀不懂的比例 `aria-invalid` 與警示、恢復預設；基數的表格、勾選、假設的 user_id 與警示；`sampling-plan` 練習的檢查與結果表、追蹤表的檢查、算出的參考解答、追蹤以 id 顯示、`DEVOPS_TRACES_NOTICE` |
| `tests/devops-capability.test.ts`（D6） | 整數的輔助函式（向下取整、BigInt 的四捨五入、萬分比與十分位的文字）；`tiny` 的 SLI、預算、逐時段累計、用完的時段、精確比較（99.8996% 顯示 99.900% 但未達成）；`month` 與 `shopDay` 的事件和 D3 的產生器相同、`windowTotal` 的預算；SLA 補償的區間與邊界；情境的每種驗證錯誤（訊息以時段計）；各視窗的消耗率與精確的門檻比較（2.0 ≥ 2.0）、剩下的小時數；`tiny` 四種多視窗告警逐時段的狀態、觸發期間、通知、誤報、延遲，和 `runAlert` 的結果相同；`month` 的快速與緩慢告警、換算成分鐘；`slo`、`burn` 每種查詢、單位與錯誤；每道 D6 練習的參考答案通過、常見錯誤不通過；`burn-alert` 的欄位解析與訊息（分鐘）；驗證錯誤；以 KUB14 的概念合成的 `monitoring-dashboard` 課（只有 SLO）通過 `validateContent` 與發布閘門；已發布的 CICD11、CICD12 沒有 SLO；`DEVOPS_STAGES_BUILT` 有 D6、`monitoring-dashboard` 的說明提到 SLO |
| `tests/devops-explorer-dom.test.tsx`（D6） | SLO 探索器的卡片、兩張圖的 `<title>`、事故的底色與每時段的表格；方向鍵、Home、End 與每個時段的 `aria-live` 說明、各視窗的消耗率表（已用完）；課程的告警的結果、觸發期間表、改視窗重新評估、讀不懂與短視窗比長視窗長的 `aria-invalid` 與警示、恢復；每小時的時段寫成分鐘與日期、偵測表與觸發期間表以分鐘計、換成緩慢消耗的告警；SLA 補償表標出落在的區間；`burn-alert` 練習的檢查與結果、SLO 表的檢查、算出的參考解答、SLO 以 id 顯示、`DEVOPS_SLO_NOTICE` 與其他課的說明不變 |
| `tests/support/slo-fixture.ts` | 只供測試：`tiny`（12 分鐘逐點寫出，有 SLA 與一條告警）、`month`（30 天、每小時，形狀產生，兩次事故、兩條告警、SLA）、`shopDay`（一天、每 5 分鐘，有雜訊，30 天視窗的開頭，寫出 `windowTotal`）、三個 SLO 探索器、七道 D6 練習與一份 `monitoring-dashboard` 課的內容（數字在註解裡手算） |
| `tests/support/traces-fixture.ts` | 只供測試：三個手寫的追蹤（成功的結帳、逾時的結帳、平行的搜尋，數字在註解裡手算）、300 個產生的追蹤（種子 2026）、帶著 trace_id 的三筆日誌與十分鐘的延遲儀表板、兩個追蹤探索器、八道 D5 練習與一份 `monitoring-dashboard` 課的內容 |
| `tests/support/devops-fixture.ts` | 只供測試：兩個團隊的部署紀錄、四個部署情境（結帳服務、有問題的金絲雀、結構變更、功能旗標）、八道練習與一堂合成的 CICD10 課（沒有真實的課程檔案） |

## 12. 只在課文說明的部分

- 文化與團隊結構的模型、DORA 的效能分級、`git flow` 工具、CODEOWNERS、合併佇列、簽章的 commit。
- 網頁介面的畫面、自架的 runner、可重用或複合的 workflow、五個支援的 action 之外的 action、`pull_request_target` 與 fork PR 的 secret、OIDC `id-token`。
- 真實的測試框架與覆蓋率（工具的結果由課程宣告）、BuildKit 的快取匯出。
- Vault 與雲端的 secret 儲存、改寫 git 歷史來清除 secret。
- 服務網格與負載平衡器產品、真實的監控與日誌系統、值班呼叫與狀態頁。
- `gh --jq`／`--template`、終端機動畫。
- D3 沒有模擬的部分見 §10.3.6；D4 見 §10.4.8；D5 見 §10.5.6（OpenTelemetry 的 SDK 與 Collector 設定、廠商的後端只在課文說明）；D6 見 §10.6.5（SLO 工具、錯誤預算政策、SLA 的合約內容）。
- D2 沒有模擬：流量隨時間變化（rpm 固定）、自動擴展、影子部署、多於兩個版本同時存在、請求重試、工作階段黏著、延遲隨負載變化（p95 是宣告的數字）、資料回填的耗時（expand 視為立即可用）。

## 13. 沒有把握的地方

- **DORA 的名稱**：四個指標用 2023–2024 年報告的說法（deployment frequency、change lead time、change fail rate、failed deployment recovery time；2023 年起以 failed deployment recovery time 取代舊稱 MTTR）。之後的報告可能再增加或改名（例如 rework rate），中文譯名是本課程自訂的。
- **算法的細節**：DORA 報告以問卷的區間回答，沒有規定中位數、四捨五入或「每週平均」的算法；§5.3 的規則是本課程為了能手算而固定的。
- **maxSurge／maxUnavailable**：百分比的取整與「兩者都是 0 時 unavailable 改為 1」依 Kubernetes 的 deployment 控制器（`ResolveFenceposts`）的行為撰寫，沒有逐字核對最新版本的原始碼；控制迴圈的時間與先縮後擴的順序是本模型自己的規則，不是 Kubernetes 的。
- **E25–E31 的輸出格式**：gh、runner 日誌、GitHub 的 YAML 與驗證訊息、`hashFiles` 與快取的文字都無法離線核對；這些階段建置時要逐項列在本節，教學上最關鍵的（結束碼的註記、`***`、403 與保護規則的錯誤）優先。git 的合併與 rebase 衝突處理簡化為一段。
- **D3**：pending／for 的邊界、誤報與漏掉的判定、恢復時間的定義、嚴重等級沒有通用標準，見 §10.3.7。
- **D4**：整數秒的時間精度、以紀錄時間差當作延遲、固定樣式的涵蓋範圍、過度遮蔽以出現次數判定、保留容量不含壓縮，見 §10.4.9。
- **D5**：自訂的取樣門檻（不是 OpenTelemetry 的位元配置）、關鍵路徑對非同步 span 與平手的處理、瓶頸的定義、每天 span 的推估、基數只算上限，見 §10.5.7。
- **D6**：錯誤預算向下取整、用掉的百分比與消耗率的分母、剩下時間的推估、沒有 `for`、期間比視窗短時的 `windowTotal`、SLA 補償表沒有標準，見 §10.6.6。

## 14. 改動的既有規則與測試

- `schema.ts`：新能力、新活動、預備島嶼、前綴、`content.devops` 與它的驗證接線、配對規則（§9）。
- `activities.ts`：`IMPLEMENTED_TEXT` 的說明只在活動已實作時採用（§3）；其他活動的登錄內容不變。
- `lessons.ts`：`cicdFromBlueprint` 與 `CICD_SHAPES`；其他島的對應與錯誤不變。D3 加上 `DEVOPS_STAGES_BUILT`：課需要的 devops-explorer 階段（D1–D4）沒有全部建好時拒絕建立（CICD12 等 D4）。
- D3（§10.3）：`schema.ts` 登錄 `monitoring-dashboard`，`validateCurriculum` 的訊息改為「names deployment-simulator or monitoring-dashboard as its activity」，`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout or a dashboard)」，`tests/devops-capability.test.ts` 對應的斷言同步更新（同樣嚴格）；`activities.ts` 加上 `monitoring-dashboard` 的 `IMPLEMENTED_TEXT`（規劃中時不採用）。
- D4（§10.4）：`lessons.ts` 的 `DEVOPS_STAGES_BUILT` 加上 D4（CICD12 可以建立），`tests/devops-capability.test.ts` 原本斷言 CICD12 被拒絕，改為斷言它的形狀（同樣嚴格）；`schema.ts` 的 `monitoring-dashboard` 改為需要儀表板或日誌、`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard or logs)」，對應的斷言同步更新；`check.ts` 的數字可以帶「秒、筆、位元組、MB、GB」單位、文字值可以是有序清單、沒有單位時不加空白；`curriculum.module.css` 加上 `--cur-warn`（淺色與深色），D3 等待中的顏色改用它；`activities.ts` 的 `monitoring-dashboard` 說明加上日誌（規劃中時不採用）。
- D5（§10.5）：`lessons.ts` 的 `DEVOPS_STAGES_BUILT` 加上 D5，`tests/devops-capability.test.ts` 對應的斷言同步更新；`schema.ts` 的 `monitoring-dashboard` 改為需要儀表板、日誌或追蹤，`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard, logs or traces)」，對應的兩個斷言同步更新（同樣嚴格）；`check.ts` 的數字可以帶「條、span」單位；`activities.ts` 的 `monitoring-dashboard` 說明加上追蹤；`devops-lesson.tsx` 加上追蹤探索器與 `DEVOPS_TRACES_NOTICE`（沒有追蹤的課說明不變）；`devops-explorer.module.css` 加上瀑布圖的樣式（只用主題 token）。沒有新的活動、旗標、`mapState` 或 3D 改動；已發布的 CICD11、CICD12 不變。
- D6（§10.6）：`lessons.ts` 的 `DEVOPS_STAGES_BUILT` 加上 D6，`tests/devops-capability.test.ts` 對應的斷言同步更新；`schema.ts` 的 `monitoring-dashboard` 改為需要儀表板、日誌、追蹤或 SLO，`devopsContentProblems` 沒有探索器時的訊息改為「(a history, a rollout, a dashboard, logs, traces or an SLO)」，對應的三個斷言同步更新（同樣嚴格）；`alerts.ts` 把狀態機與事故對應抽成 `runAlert`（`evaluateAlert` 改用它，D3 的測試全部不變地通過），新增型別 `AlertRun`（沒有規則值的結果），`alert-results.tsx` 的元件改收 `AlertRun`，`AlertTables` 加上可選的 `bucketMinutes`（預設 1，D3 的輸出不變）；`dashboard-check.ts` 匯出 `STATE_ALIASES`、`alertViolations` 改收 `AlertRun`；`check.ts` 的數字可以帶「事件、個事件、倍、×、x」單位；`activities.ts` 的 `monitoring-dashboard` 說明加上 SLO；`devops-lesson.tsx` 加上 SLO 探索器、`burn-alert` 的參考解答與 `DEVOPS_SLO_NOTICE`（沒有 SLO 的課說明不變）；`devops-explorer.tsx` 的練習框加上 `burn-alert`。沒有新的活動、旗標、`mapState`、3D 或 CSS 改動。
- `database-lesson.tsx`：加入 devops 的探索器、練習與說明；其他課的頁面不變。
- `tests/llm-capability.test.ts`：預備島嶼的斷言由 `[]` 改為 `['devops-cicd']`。
- `docs/curriculum/data/island-capabilities.json`：`devops-cicd` 改為 `prepared`，`AUTONOMOUS_CURRICULUM_PROGRESS.md` 依它以 `scripts/curriculum-queue.ts` 重新產生；`COURSE_CONTENT_SPECIFICATION.md` 加上 DevOps 的範例形式與 CICD-0 的列。`COURSE_INVENTORY.md` 只記發布的批次，沒有改動（沒有課發布）。
