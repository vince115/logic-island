# P8 Release Checklist——五區域 3D 世界公開發布前的待辦

> 2026-11-16，Asia/Taipei。本文件只盤點，**沒有執行其中任何一項**。
> 前提：P8 以 Flag-off 併入 `main`（PR #10；已獲授權，合併前檢查見 [P8.6](P8_6_HOTFIX_AND_P8_INTEGRATION.md) §3）。正式站沒有 `/world`，首頁仍是 CS 五島場景。
> 獨立決策（不得由 Agent 自行執行）：正式首頁切換、公開開啟 `LOGIC_ISLAND_REGIONAL_WORLD`、破壞性資料操作、任何涉及私有題庫的風險。

## 0. 建議順序

| 階段 | 內容 | 需要的批准 | 可回退方式 |
|---|---|---|---|
| S0 | PR #10 合併到 `main`（Flag-off） | **已批准**（P8.6 §3.2）；不含啟用旗標與切換首頁 | `git revert` 合併 commit |
| S1 | 真機驗收（§3）；V3 測試修正後的全套確認（§6） | 不需要（不改正式站） | 不適用 |
| S2 | 待審項目 R1–R5、R7、R9、R10 定案（§5） | 逐項決定 | 改資料檔的數字即可還原 |
| S3 | 旗標在 Preview 開啟，完整驗收（§2.2） | 需要（Vercel 設定是你的操作） | 移除 Preview 環境變數 |
| S4 | 旗標在 Production 開啟，`/world` 不連結、不索引（§2.3） | **獨立決策** | Vercel Instant Rollback |
| S5 | 首頁切換（§1） | **獨立決策（D1）** | 回退路由＋Instant Rollback |
| S6 | 區域美術（§4） | 每個 Region 各自批准 | `source` 改回 `lattice` |

S4 與 S5 分開的理由：旗標開啟只會**新增** `/world` 路由，不改既有頁面；首頁切換才會改變使用者第一眼看到的畫面。分開做，出問題時能分辨是哪一步造成的。

## 1. 首頁由五島切換至五區域世界（D1，未批准）

現況：`src/app/page.tsx` 呈現 `IslandsWorldExplorer`（CS 四島＋互動實驗島）；`/world` 呈現 `WorldOverview`，只在旗標建置中存在。

建議方式（[P8 架構](P8_MULTI_REGION_3D_WORLD_ARCHITECTURE.md) §4.1 的方案）：

- [ ] 決定切換方式。**建議**：`/` 直接呈現與 `/world` 相同的世界總覽（同一個元件），不是轉址到 `/world`；`/world` 保留為同內容的別名或轉回 `/`（二選一，避免重複內容）。
- [ ] `/?island=<id>` 的相容：側欄預覽卡（`src/lib/nav/site-nav.ts` 的 `mapHref`）與外部連結都使用這個網址。依 world registry 轉到 `/world/<region>?island=<id>`；`labs` 轉到 `/learn`。對照表由 registry 產生並以單元測試釘住，不手寫第二份清單。
- [ ] 實作前讀 `node_modules/next/dist/docs/` 中 redirect 與 `searchParams` 的章節（AGENTS.md 的要求；本版 Next.js 的規約與舊版不同）。
- [ ] 回退路由：五島首頁的畫面保留在固定網址（建議 `/islands/home`，或由 `/world/cs` 接手——四座學科島逐項相同，已有測試）。切換後至少保留一個版本週期。
- [ ] 首頁文案 R4（§5）在同一次變更定案：「05 ISLANDS」與實驗島編號。
- [ ] `/world` 與 `/world/<region>` 目前是 `robots: noindex, nofollow`、標題含「原型」：公開時移除並補正式的 title／description／OG 圖。
- [ ] 主選單「探索群島」的目的地、麵包屑的「世界」層級，與首頁一致。
- [ ] 更新會受影響的 E2E：`home-databases`、`navigation`、`player`（「首頁與主選單導航」）、`islands-candidate` 中以 `/` 為起點的案例；新增 `/?island=` 轉址的 E2E。
- [ ] 驗收：`/world/cs` 對舊首頁四島區域逐像素比對；首頁首幀時間與腳本量不高於目前的首頁（目前 `/` 671 KB／gzip 213 KB）；無 WebGL 時的清單入口等價。
- [ ] 上線判斷需要 §3 的真機數據：世界總覽是所有使用者的第一個畫面。

## 2. Feature Flag 開啟與快速回退

### 2.1 機制（現況）

- `LOGIC_ISLAND_REGIONAL_WORLD=1` 是**建置時**變數（`src/lib/world/flag.ts`）：頁面是靜態預先產生的，`next build` 當下的值決定 `/world` 是否存在。**沒有執行期開關**——改值之後必須重新部署才生效。
- 沒有旗標時，`/world` 與 `/world/<region>` 是靜態 404，沒有任何連結指向它們；client bundle 不含旗標判斷。
- 與 `LOGIC_ISLAND_TRIALS` 互相獨立。只開世界旗標時，總覽的導覽不會出現試煉入口（`trialsEnabled()` 為 false），**不影響 Exam Engine，也不載入題庫**。

### 2.2 Preview 驗收（S3）

- [ ] 在 Vercel 專案的 **Preview** 環境設定 `LOGIC_ISLAND_REGIONAL_WORLD=1`（**不要**同時設定 `LOGIC_ISLAND_TRIALS`）。Vercel connector 與本機 CLI 目前沒有這個專案 scope 的授權，這一步需要你在 Dashboard 操作，或先完成授權。
- [ ] Preview 部署受 Vercel Authentication 保護（302 到登入）：自動化驗收需要 Protection Bypass，或由你登入後人工檢查。
- [ ] 驗收項目：`/world`＋五個 Region 回應 200；七種寬度的遮擋檢查；腳本量；`leak-scan --dir` 對下載的回應；既有頁面與目前 Production 逐頁相同。

### 2.3 Production 開啟（S4，獨立決策）

- [ ] 批准紀錄（誰、何時、範圍）。
- [ ] 開啟前記下目前 Production 的 deployment 與 `main` commit（回退目標）。
- [ ] Production 環境加入 `LOGIC_ISLAND_REGIONAL_WORLD=1` → 重新部署同一個 commit。
- [ ] 第一階段**不加入口連結、保留 noindex**：只有知道網址的人看得到。
- [ ] Smoke：`/` 與既有頁面與開啟前相同；`/world/**` 200；`/trials` 仍是 404；洩漏掃描 clean。

### 2.4 快速回退

| 方式 | 時間 | 何時用 |
|---|---|---|
| Vercel **Instant Rollback**（把前一個 Production deployment 重新指為正式） | 數秒，不重建 | 首選：開啟後發現任何問題 |
| 移除環境變數後重新部署 | 一次建置的時間 | Instant Rollback 之後的收尾，讓下一次 `main` 部署不會再帶旗標 |
| `git revert` 合併 commit | 一次建置＋CI | 只有程式本身有問題時；不改寫歷史 |

- [ ] 回退演練一次（在 Preview 或低流量時段），記錄實際所需時間。
- [ ] 注意：只做 Instant Rollback 而不移除環境變數，下一次 push 到 `main` 會再把旗標版本部署出去。

## 3. 真機驗收（iOS Safari／Android Chrome）

目前全部數據來自 headless Chromium 的視窗尺寸模擬，**不是真機證據**。標準測試機沿用 [DEVICE_ACCEPTANCE](../handoff/DEVICE_ACCEPTANCE.md) §0.2：iPhone SE（第 3 代，最低效能基準）、iPhone 16、中階 Android（Chrome）。量測工具 `perf/device/` 已存在，尚未用於 `/world`。

| # | 項目 | 標準 | iOS Safari | Android Chrome |
|---|---|---|---|---|
| D-01 | `/world` 載入：首幀時間（冷／熱快取） | 熱快取 ≤ 2.5 秒 | Not Measured | Not Measured |
| D-02 | `/world` 與五個 Region 的 FPS（閒置、聚焦飛行、雙指縮放） | 飛行中位數 ≥ 45 | Not Measured | Not Measured |
| D-03 | 總覽輪廓與標籤：五個 Region 與樞紐都完整在畫面內，標籤互不重疊 | 目視＋截圖 | Not Tested | Not Tested |
| D-04 | 觸控目標：標頭工具、Region 標籤、圖釘、清單項目 | ≥ 44 px，無誤觸 | Not Tested | Not Tested |
| D-05 | 區域地圖聚焦：島寬 | ≥ 88 px | Not Tested | Not Tested |
| D-06 | 圖釘與 Bottom Sheet：Sheet 開啟時不蓋住聚焦的島；圖釘在 Sheet 之下 | 目視 | Not Tested | Not Tested |
| D-07 | 手勢：單指水平旋轉、垂直捲頁、雙指縮放、雙指平移；不卡住頁面捲動 | 方案 B（P1-27） | Not Tested | Not Tested |
| D-08 | 網址列收合／展開、直橫向切換後取景仍正確（`dvh`、safe-area、瀏海） | 無裁切、無跳動 | Not Tested | Not Tested |
| D-09 | 返回／前進、`?island=` 深連結、從 Region 回總覽 | 狀態一致 | Not Tested | Not Tested |
| D-10 | WebGL context 遺失（切到背景再回來、低記憶體） | 回到清單或自動恢復 | Not Tested | Not Tested |
| D-11 | 記憶體：連續切換五個 Region 各兩輪 | 不重新載入分頁 | Not Measured | Not Measured |
| D-12 | 減少動態效果、深色模式 | 與桌機行為一致 | Not Tested | Not Tested |
| D-13 | VoiceOver／TalkBack：清單是地圖的完整等價入口 | 每個 Region 與島都可到達 | Not Tested | Not Tested |
| D-14 | 320 px 寬（iPhone SE 的顯示縮放或舊機） | 標頭不換行、無水平捲動 | Not Tested | 不適用 |
| D-15 | 樞紐橋對海面的辨識度（V4：1.28:1，接近下限 1.25:1）在戶外亮度下 | 目視 | Not Tested | Not Tested |

- [ ] 每台裝置記錄：機型、OS、瀏覽器版本、CSS viewport、DPR、WebGL renderer。
- [ ] 任何一項 Fail 都先回到程式修正，不調整標準（[不降低門檻](P8_3_WORLD_TOPOLOGY_AND_NAVIGATION.md)的既有原則）。

## 4. 區域美術（AI／DESIGN／WEB／SYS）

現況：四個 Region 是 `source: 'lattice'`——共用的規劃中地形加每島一個程式產生的標記；只有 CS 是 `authored`（含 `basics-island.v2.1.glb`）。

- [ ] 每個 Region 的美術方向與優先順序（建議先做已有上線課程與實驗的 Region）。
- [ ] 每個 Region 各自的授權：建模、選版、資產搬移、正式整合是不同階段（CLAUDE.md）；**不覆蓋 BLEND／GLB 原檔，不盲跑歷史生成腳本**。
- [ ] GLB 契約：節點名稱、bounds、互動節點、sha256 登記到 `asset-registry.ts`；`tests/glb-island-contract.test.ts` 擴充。
- [ ] 效能預算：目前區域地圖 26–58 個 draw call、1.5–4.5 萬三角形；每個 Region 加入美術後的上限先訂再做。
- [ ] 「世界橋頭」（R9）與區域美術一起決定：樞紐橋目前取最短跨距，不落在各 Region 地圖的碼頭。
- [ ] 規劃中島的標記（R3）在有美術的 Region 是否保留。
- [ ] `lattice` → `authored` 的切換以資料完成，島的座標不因課程數量變動而重排（P8.3 的規則 5）。

## 5. 尚未完成的審核項目

| # | 事項 | 現況 | 需要你決定的事 | 證據 |
|---|---|---|---|---|
| R1 | 五區域總覽構圖 | P8.5 的截圖是最新版本 | 位置、寬度、配色是否定案 | `evidence/p8-5/overview-*.jpg` |
| R2 | AI／DESIGN／WEB／SYS 區域地圖的輪廓 | AI 六瓣已批准；其餘三區是提案 | 三區的放射配置是否定案 | `evidence/p8-2/`、`evidence/p8-4/` |
| R3 | 規劃中島的旗幟 | 只加在 DESIGN／WEB／SYS | CS／AI 的規劃中島要不要也加 | P8.2 §8 |
| R4 | 首頁清單的標示 | 未改（正式站文案） | 「05 ISLANDS」與實驗島編號；與 §1 一起決定 | P8.2 §8 |
| R5 | CS 是否改用 Ring + Branches 座標 | 未移植；來源在 `m3/*`（含私有歷史，**不能 merge**） | 要不要以資料重寫座標（會改動已核准的 CS 構圖） | P8.2 §8 |
| R6 | PR 順序 | **已完成**：PR #6、#8 之後才開 P8 的 PR | — | P8.6 |
| R7 | 世界總覽的橋：顏色、寬度、落點 | V1（移除 WEB—SYS）與 V4（樞紐橋減重）已落地 | 三座關聯橋與五座樞紐橋的外觀是否定案 | `evidence/p8-5/` |
| R8 | WEB—SYS 關聯橋 | **已完成**（P8.5 V1：移除） | — | P8.5 §2 |
| R9 | 樞紐橋落點 | 取最短跨距 | 要不要落在各 Region 的碼頭（建議與區域美術一起做） | P8.3 §9 |
| R10 | 手機總覽的標準 | 輪廓 ≥ 70% 寬、每島 ≥ 44 px、每島一個 44 px 圖釘 | 總覽是否也要更高的島寬下限（要改呈現方式，不是調門檻） | P8.3 §9 |
| R11 | AI 名牌在 1280 px 與清單重疊 | **已完成**（P8.4／P8.5 V2） | — | P8.5 §2 |

## 6. V3 偶發 E2E 失敗：診斷結果與 Trace 保存

**已診斷並修正（P8.6 §5）**：測試同步競態——`reframed()` 的等待條件在「視窗已改、場景還沒跟上」的過渡狀態下也成立。加壓（6 個平行 worker）下修正前 300 次失敗 10 次，修正後 600 次 0 失敗；只改測試的等待條件，產品沒有修改。證據：`evidence/p8-6/v3-resize-race.md`。

還要做的：

- [x] 全套 E2E（旗標開啟）確認 V3 在全套執行下也穩定：合併前重跑兩次，V3 都通過；另有兩次 120 次加壓 0 失敗（P8.6 §3）。
- [ ] 隔離用的 Playwright 設定改為與 repo 的 `playwright.config.ts` 相同：`trace: 'retain-on-failure'`、`screenshot: 'only-on-failure'`。P8.5 那次失敗沒有留下任何資料，就是因為隔離設定是 `trace: 'off'`；這次是在命令列加 `--trace retain-on-failure` 才取得 trace。
- [ ] Trace 保存：輸出目錄以 commit 與時間命名，保留到下一次全套通過。Trace 會記錄頁面內容，旗標建置含 `/trials`，所以**不放進 repo**，只把摘要（讀到的數值、時間、截圖）寫進 `docs/planning/evidence/`。
- [ ] 同一類問題的檢查：其他在 `setViewportSize` 之後檢查 3D 版面的測試，等待條件是否也可能在舊版面下成立。P8.4 的響應式測試是每個尺寸重新載入頁面，不受影響；之後新增「不重新載入就改尺寸」的測試時，沿用 `reframed()`。
- [ ] 重現偶發失敗的做法（這次有效）：`--repeat-each` 加 `--workers 4`～`6`，用平行 worker 製造負載，比單一 worker 重複更快撞到競態。
- [ ] GitHub Actions 目前不跑 E2E（只有 build 與 route probe）。若之後加入，失敗時以 `upload-artifact` 上傳 `test-results/`，保留 14 天，與現有報告一致。
- [ ] 不得：降低斷言、增加固定等待、標記 skip、以 retries 掩蓋。

## 7. 其他發布前事項

- [ ] `docs/handoff/` 的 IMPLEMENTATION_STATUS、TESTING_STATUS、KNOWN_ISSUES 與本清單同步。
- [ ] P1-35（首頁導覽 E2E 偶發失敗）在 PR #8 合併後重測並更新狀態。
- [ ] 舊版 `/islands` 的名牌在選島後有 1–2 幀停在全景位置（P8.5 §3.5，既有行為，未處理）。
- [ ] P1-36：`islands-candidate.spec.ts:129`（手機，3D 點工坊進入 `/learn`）在一次全套執行中失敗，580 次加壓（P8 與 `main` 各 290 次）無法重現。之後的全套 E2E 都保留 trace；再出現時先看 `settled()` 回傳的位置是不是相機移動前的位置（P8.6 §7）。
- [ ] Escape 的焦點回復（P8.6 §6，已修正）目前只有 headless 的證據；真機與螢幕閱讀器下的焦點順序併入 §3 的 D-09、D-13。
- [ ] 隔離測試的暫存目錄會在午夜被清理（P8.6 §3.4）：跨夜的驗收先重建副本，或把副本放在不會被清理的位置。
- [ ] 總覽 → 區域的轉場目前是換頁（兩個 Canvas），沒有連續飛行（架構文件 §4.3）。
