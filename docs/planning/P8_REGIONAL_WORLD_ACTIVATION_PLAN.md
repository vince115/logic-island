# P8 Regional World Activation 計畫

> 2026-11-17，Asia/Taipei。狀態：**計畫，尚未執行任何一項**。
> 前提：P8 已以 Flag-off 併入 `main`（PR #10，Merge Commit `929d638`；[P8.6](P8_6_HOTFIX_AND_P8_INTEGRATION.md) §8）。正式站沒有 `/world`，首頁仍是 CS 五島場景。
> 依據：「P8 PR #10 Merge Authorization」——合併後建立獨立的啟用計畫，先完成下列五項（A1–A5）。
> **未經另外批准，不得啟用正式 3D 世界或取代首頁。** 本計畫的五個關卡都通過，也只代表「可以提出啟用申請」，不代表已獲准啟用。
> 細項清單沿用 [P8 Release Checklist](P8_RELEASE_CHECKLIST.md)，本文件只定義關卡、順序、通過標準與批准點，不重抄清單。
> 進度（2026-11-18）：**A1-L 本機預驗收已完成**（[報告](P8_A1L_LOCAL_PREACCEPTANCE.md)）——它是 A1 之前在本機隔離建置上做的預驗收，以「世界開、試煉關」的組合取證 V-01～V-10，不是本文件定義的 A1（對象是 Preview）。A0 四項仍未完成；A1（Preview）、A2～A5 都沒有開始。
> 進度（2026-11-18，後續）：A1-L 的三項發現已處理並併入 `main`（`b56e7ec`）——審查參數在正式建置無效（P1-37）、實驗數量一致（P1-38）、Next.js 16.4.5（P1-39）。**A1-P 的工具與流程已準備，A1-P 本身尚未執行**，缺的條件見 [P8_A1P_PREVIEW_PREPARATION.md](P8_A1P_PREVIEW_PREPARATION.md) §7。A4、A5 未批准。

## 0. 範圍與不變條件

| 項目 | 內容 |
|---|---|
| 啟用的對象 | `/world`（五區域總覽）與 `/world/<region>`（CS／AI／DESIGN／WEB／SYS 區域地圖） |
| 啟用的方式 | 建置時變數 `LOGIC_ISLAND_REGIONAL_WORLD=1`（`src/lib/world/flag.ts`）。沒有執行期開關，改值後要重新部署 |
| 不在範圍內 | `LOGIC_ISLAND_TRIALS`、Exam Engine、私有題庫、已發布課程的狀態、GLB／BLEND 原檔 |
| 每一關都要成立 | `/`、`/islands`、`/curriculum`、`/learn`、五個 `/regions/<region>` 與啟用前逐頁相同；`/trials` 仍是 404；洩漏掃描 clean |
| 出現 Fail 時 | 回到程式修正後重驗；不降低門檻、不加固定等待、不標記 skip |

關卡與批准點：

| 關卡 | 內容 | 誰執行 | 批准點 |
|---|---|---|---|
| A0 | Preview 環境準備 | 你（Vercel Dashboard）；或先完成 connector／CLI 對這個專案的授權 | 設定 Preview 環境變數 |
| A1 | 五區域 3D 世界的 Preview 視覺驗收 | Agent 蒐證，你定案 | R1、R2、R7 的定案 |
| A2 | 手機與平板互動驗收 | 真機由你操作；Agent 準備量測工具與紀錄表 | 真機結果簽核 |
| A3 | World／Region／Island 導覽驗收 | Agent | 無（結果回報） |
| A4 | 功能旗標啟用與回退策略 | Agent 起草與演練（僅 Preview），你批准 | **Production 開啟旗標：獨立決策** |
| A5 | 首頁切換方案 | Agent 提案，你選擇 | **首頁切換（D1）：獨立決策** |

A1–A3 可以平行進行，都以 A0 為前提。A4 的 Production 開啟要 A1–A3 全部通過。A5 的實作要在 A4 的 Production 觀察期之後；A4 與 A5 不在同一次部署進行，出問題時才能分辨是哪一步造成的。

## A0. Preview 環境準備

目前的限制（P8.6 記錄的事實）：Preview 部署受 Vercel Authentication 保護，未登入一律 302 到登入頁；Preview 環境是否帶旗標，無法從外部確認。所以到目前為止，**沒有任何一項驗收是在 Vercel Preview 上做的**，全部來自本機隔離副本的旗標建置。

- [ ] 在 Vercel 專案的 **Preview** 環境設定 `LOGIC_ISLAND_REGIONAL_WORLD=1`。**不設定** `LOGIC_ISLAND_TRIALS`。**不動 Production 環境。**
- [ ] 從 `main` 開一個只用於驗收的分支（不含程式改動），取得帶旗標的 Preview 部署；記下 deployment URL 與 commit。
- [ ] 自動化存取方式二選一：Protection Bypass for Automation（權杖只放在本機環境變數，不寫進 repo、文件與紀錄），或由你登入後人工檢查。
- [ ] 確認這個 Preview 的 `/world` 是 200、`/trials` 是 404。

通過標準：有一個可重複存取、確定帶旗標且不帶試煉旗標的 Preview URL。

## A1. 五區域 3D 世界的 Preview 視覺驗收

對象是 A0 的 Preview 部署（不是本機建置）。

| # | 項目 | 通過標準 | 既有的本機證據 |
|---|---|---|---|
| V-01 | 總覽構圖：中央樞紐＋五個 Region | 五個 Region 與樞紐完整在畫面內，標籤互不重疊（320／375／390／834／1024／1280／1440 px） | `evidence/p8-5/overview-*.jpg` |
| V-02 | 橋：五座樞紐橋、三座關聯橋（CS—AI、DESIGN—WEB、SYS—CS）；沒有 WEB—SYS | 與 `world-map.ts` 的資料一致 | P8.5 §2 |
| V-03 | 主題島數量 | 五個 Region 合計 29 座主題島；互動實驗島不計入 | P8.3 |
| V-04 | AI 區域地圖 | 六瓣配置與已批准版本相同 | `evidence/p8-2/`、`evidence/p8-4/` |
| V-05 | DESIGN／WEB／SYS 區域地圖 | 放射配置（提案，R2 待定案） | `evidence/p8-4/` |
| V-06 | CS 區域地圖 | 四座學科島與目前首頁的四島逐項相同 | P8.2 |
| V-07 | 名牌、圖釘與清單 | 1240 px 以下用圖釘；任何寬度都沒有名牌被清單遮住 | P8.4、P8.5 V2 |
| V-08 | 規劃中的島 | 沒有壞連結；規劃中島不可點進課程 | P8.2 |
| V-09 | 效能 | draw call 與三角形數不高於 P8.6 的量測（`/world` 15／15,902；區域地圖 26–58／1.5–4.5 萬） | P8.6 §2.2 |
| V-10 | 腳本量 | `/world` 與區域頁的腳本量記錄為基準；既有頁面不變 | P8.6 §1.3 |

- [ ] 每一項在 Preview 重新取得截圖與數值，放進 `docs/planning/evidence/`（不放 trace：旗標建置的 trace 可能含頁面內容）。
- [ ] 你定案的事：R1（總覽構圖）、R2（三區輪廓）、R7（橋的外觀）。未定案的項目不擋 A4 的 Preview 演練，但**擋 Production 開啟**。
- [ ] 區域美術（AI／DESIGN／WEB／SYS 目前是共用地形）是否為啟用的前提，由你決定；建議不是前提，啟用後分 Region 補上（Release Checklist §4）。

## A2. 手機與平板互動驗收

目前全部數據是 headless Chromium 的視窗尺寸模擬，**不是真機證據**。這一關只接受真機結果。

- 測試機沿用 [DEVICE_ACCEPTANCE](../handoff/DEVICE_ACCEPTANCE.md) §0.2：iPhone SE（第 3 代）、iPhone 16、中階 Android（Chrome）；**加一台平板**（iPad，直向 834 px 與橫向）。
- 項目是 Release Checklist §3 的 D-01～D-15；平板另加下列三項。

| # | 平板追加項目 | 通過標準 |
|---|---|---|
| T-01 | 直向與橫向切換後的取景與清單位置 | 無裁切、無名牌在清單下 |
| T-02 | 分割畫面／Slide Over 的窄寬度 | 與同寬度的手機版面一致 |
| T-03 | 外接鍵盤：Tab 順序、Escape 關閉清單、方向鍵 | 與桌機相同 |

- [ ] 每台裝置記錄：機型、OS、瀏覽器版本、CSS viewport、DPR、WebGL renderer。
- [ ] 量測工具 `perf/device/` 目前沒有用在 `/world`；A2 開始前先確認它能對 Preview URL 執行。
- [ ] 通過標準：D-01～D-15 與 T-01～T-03 在每台裝置都是 Pass 或有記錄的「不適用」。任何 Fail 都先修正再重驗。

## A3. World／Region／Island 導覽驗收

| # | 流程 | 通過標準 |
|---|---|---|
| N-01 | `/world` → 點 Region → `/world/<region>` | 五個 Region 都可到達；返回鍵回到總覽 |
| N-02 | `/world/<region>` → 點島 → `?island=<id>` | 網址與聚焦的島一致；重新整理後狀態相同 |
| N-03 | 深連結：直接開 `/world/<region>?island=<id>` | 直接聚焦該島；不存在的 `id` 回到區域全景，不報錯 |
| N-04 | 返回／前進 | 每一步的網址、相機與清單選取一致 |
| N-05 | Escape、相機重設 | 回到區域全景；焦點回到觸發的控制項 |
| N-06 | 島 → 課程 → 返回 | 回到同一個 Region 與同一座島 |
| N-07 | 清單是地圖的完整等價入口 | 鍵盤與螢幕閱讀器可到達每個 Region 與每座島；無 WebGL 時可用 |
| N-08 | 與既有導覽的銜接 | 側欄、麵包屑、`/regions/<region>` 與 `/world/<region>` 的對應一致；沒有指向 404 的連結 |
| N-09 | 總覽 → 區域的轉場 | 目前是換頁（兩個 Canvas），沒有連續飛行：記錄為已知限制，或另案處理 |

- [ ] 本機旗標建置已有 `regional-world`、`world-topology` 兩份 E2E；A3 是在 Preview 上以同一份清單重做一次，並補上 N-06、N-08 兩項目前沒有 E2E 的流程。
- [ ] Escape 的焦點回復在合併前修正過一次時序競態（P8.6 §6）：N-05 在 Preview 與真機上各確認一次焦點落在地圖名牌，不是清單。
- [ ] 全套 E2E（旗標開啟）在啟用前的 commit 上重跑，保留 trace（`--trace retain-on-failure`）；P1-36 若再出現，先處理再啟用。

## A4. 功能旗標啟用與回退策略

### 啟用（分兩步，中間有觀察期）

| 步驟 | 內容 | 對使用者的影響 |
|---|---|---|
| A4-1 | Production 加入 `LOGIC_ISLAND_REGIONAL_WORLD=1`，重新部署**同一個** `main` commit | 新增 `/world/**`；**不加任何入口連結，保留 `noindex`**；既有頁面不變 |
| A4-2 | 觀察期（建議至少一個工作週）後，才加入口連結、移除 `noindex` 與標題的「原型」 | 使用者可以從選單進入 |

- [ ] A4-1 之前：記下目前 Production 的 deployment 與 `main` commit（回退目標）；批准紀錄（誰、何時、範圍）。
- [ ] A4-1 之後的 Smoke：`/` 與既有頁面與開啟前逐頁相同；`/world/**` 200；`/trials` 404；80 堂課程連結 200；洩漏掃描 clean。
- [ ] 只開世界旗標時，總覽的導覽不會出現試煉入口，不載入題庫（`trialsEnabled()` 為 false）；A4-1 的 Smoke 要實測這一點，不只靠推論。

### 回退

| 方式 | 時間 | 何時用 |
|---|---|---|
| Vercel Instant Rollback | 數秒，不重建 | 首選 |
| 移除環境變數後重新部署 | 一次建置 | Instant Rollback 之後的收尾：否則下一次 push 到 `main` 會再把旗標版本部署出去 |
| `git revert` | 一次建置＋CI | 只有程式本身有問題時；不改寫歷史 |

- [ ] **回退演練**：在 Preview 做一次完整的「開啟 → 回退 → 確認 `/world` 回到 404」，記錄實際時間。沒有演練過的回退不算有回退方案。
- [ ] 回退的觸發條件先寫好：既有頁面出現差異、洩漏掃描不是 clean、`/world` 的錯誤率或真機 FPS 低於 A2 的標準、任何與題庫有關的疑慮。
- [ ] 誰可以執行回退：預設是你；是否授權 Agent 在觸發條件成立時先回退再回報，由你決定。

通過標準：回退演練有紀錄；A1–A3 通過；你批准 A4-1。**這是獨立決策。**

## A5. 首頁切換方案

現況：`src/app/page.tsx` 呈現 `IslandsWorldExplorer`（CS 四島＋互動實驗島）。這份計畫不修改它。

| 方案 | 做法 | 優點 | 代價 |
|---|---|---|---|
| H1（建議） | `/` 直接呈現世界總覽（與 `/world` 同一個元件）；`/world` 轉回 `/` | 一個正式網址；沒有重複內容 | 首頁的第一個畫面改變；`/?island=<id>` 要轉到 `/world/<region>?island=<id>` |
| H2 | `/` 轉址到 `/world` | 實作最小 | 首頁多一次轉址；正式網址變成 `/world` |
| H3 | `/` 維持五島，只在選單加入「世界」入口 | 風險最低；隨時可拿掉 | 兩套 3D 入口長期並存；CS 內容在兩處呈現 |

- [ ] 你選擇方案。建議 H1，並以 H3 作為 A4-2 到 A5 之間的過渡狀態（入口先出現，首頁後換）。
- [ ] **既有五島入口保留**在固定網址至少一個版本週期（Release Checklist §1 的回退路由）。
- [ ] `/?island=<id>` 的對照表由 world registry 產生，以單元測試釘住；`labs` 轉到 `/learn`。
- [ ] 首頁文案 R4（「05 ISLANDS」與實驗島編號）在同一次變更定案。
- [ ] 驗收：`/world/cs` 對舊首頁四島區域逐像素比對；首頁首幀時間與腳本量不高於目前（`/` 671 KB／gzip 213 KB）；無 WebGL 時清單入口等價；受影響的 E2E（`home-databases`、`navigation`、`player`、`islands-candidate`）更新並全數通過。
- [ ] 實作前讀 `node_modules/next/dist/docs/` 的 redirect 與 `searchParams` 章節（AGENTS.md）。

通過標準：方案選定、實作與驗收完成、A4-1 的觀察期沒有回退事件、A2 的真機數據支持「世界總覽作為所有使用者的第一個畫面」。**這是獨立決策（D1）。**

## 需要你決定的事（彙整）

| # | 決定 | 影響的關卡 |
|---|---|---|
| 1 | Preview 環境變數由你設定，或授權 connector／CLI | A0 |
| 2 | R1、R2、R7 定案 | A1 |
| 3 | 區域美術是不是啟用的前提 | A1 |
| 4 | 真機與平板的機型清單；由誰操作 | A2 |
| 5 | Production 開啟旗標（A4-1）與公開入口（A4-2） | A4 |
| 6 | 觸發條件成立時，Agent 能不能先回退再回報 | A4 |
| 7 | 首頁方案 H1／H2／H3 與切換時間 | A5 |
