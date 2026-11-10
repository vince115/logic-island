# M3.1 Regional World 架構提案（Architecture Proposal）

> 2026-11-03。依使用者對 [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md) 的有條件批准（§10 決策紀錄）撰寫。**這是提案，尚未實作**：
> - 沒有修改正式首頁 `/`、`islandsHomeWorld`、`islandsWorld`、任何 GLB、Theme 檔案或受保護的原型頁面；
> - 本次唯一執行的是隔離副本中的 Layout 與鏡頭計算（§2、§5），腳本沒有提交。
>
> 待使用者確認本文件的世界架構後，才開始 M3.1 的 prototype 實作；正式 GLB 製作（M3.2）要等 M3.1 通過 §8 的進入條件。

## 1. Regional World Architecture

### 1.1 三層

| 層 | 畫什麼 | 資料 | 渲染 |
|---|---|---|---|
| **世界總覽** | Region A、中央樞紐、Region B 的低細節輪廓；航線；北、南兩個預留位置 | `WorldOverviewLayout`：每區一個錨點、輪廓來源（該區的 Layout）、航線端點 | 新的 `WorldOverviewScene`：每區把島嶼外形合併成一個網格，**不載入 GLB**，不畫樹木與道路 |
| **區域地圖** | 該區的學科島、橋、道路、碼頭 | 每區一份 `RegionLayout`（現有 `LayoutSpec` 的一般化） | 現有 `HexWorldScene`，不另寫一套 |
| **島嶼聚焦** | 單島與科目面板 | 同區域地圖 | 現有聚焦、科目面板、GLB 地點互動 |

### 1.2 資料：不新增第二套 World Registry

- **島嶼身分只讀 registry**（`src/content/world/`）：名稱、代碼、主色、地標文字、狀態（planned／available／complete）、課數、入口。
- 區域 Layout 只放 **3D 擺放資料**：島嶼中心、形狀、樹林與平台格、橋、碼頭 spur、GLB settlement。它不定義島嶼，以 `islandId` 指向 registry。
- 驗證要求：
  - 每區 Layout 的 `islandId` 集合等於 registry 中該區的學科島；
  - 樞紐只有工具島（實驗島）。
- **Registry 的 `links` 暫不更改**：
  - 現在的 `tests/world-config.test.ts` 要求 registry 宣告的橋等於首頁地圖的橋，D20 頁尾也讀它。
  - prototype 的區域橋只存在於 Layout，另以測試檢查它與 registry 的連結相容。
  - 正式切換時才更新 registry 的橋（屆時 D20 等頁尾隨之改變，另行確認）。

### 1.3 程式結構（提案）

| 位置 | 內容 | 與既有程式的關係 |
|---|---|---|
| `src/lib/islands/regions/` | `region-a.ts`、`region-b.ts`、`overview.ts`、`validate-region.ts` | 新檔；Region A **直接引用** `islands-world.ts` 中 F、DS、AL、DB 的形狀、樹林與平台常數，不複製數字 |
| `src/lib/islands/hex-layout.ts` | `assembleLayout` 一般化為接受 N 座聚落（WORLD_EXPANSION 的 M1） | **加法式**修改：既有的 `foundations`／`structures`／`algorithms`／`labs`／`databases` 欄位與輸出不變，由世界指紋與首頁世界測試保證 |
| `src/components/islands/hex-world/` | 新增 `world-overview-scene.tsx`、`regional-world-explorer.tsx` | 共用 `HexWorldScene`、`HexCamera`、科目面板、名牌；既有 explorer 不改行為 |
| `src/app/world/`（見 §4） | prototype 路由 | 新路由；不放在受保護的 `/islands/**` 之下 |

### 1.4 狀態與 URL

| 狀態 | URL（提案） | 說明 |
|---|---|---|
| 世界總覽 | `/world` | — |
| 區域地圖 | `/world/cs`、`/world/ai`（`[region]` 以 `generateStaticParams` 產生兩頁） | 可分享、瀏覽器返回鍵自然運作 |
| 島嶼聚焦 | `/world/cs?island=databases` | 聚焦是區域頁內的狀態，以 query 保存，可分享 |

Next.js 16 的 `params`／`searchParams` 規約，實作前依 `node_modules/next/dist/docs/` 確認（CLAUDE.md 要求）。

### 1.5 未開課島嶼：霧中小島（條件：明確標示「規劃中」）

- **地形**：與正式島相同的六角形狀，降飽和、半透明霧氣層；沒有地標與 GLB，只有一個低矮的「規劃中」標樁。
- **名牌**：名稱＋**「規劃中」標籤**（文字，不只靠顏色）。`aria-label` 例：「聚焦程式語言島（規劃中）」。
- **科目面板**：
  - 顯示「規劃中 · 尚未開放課程」與藍圖單元、預計課數（「預計 20 堂」）；
  - **不顯示**「已開放 X／Y」、「已完成 X／Y」、課程連結或任何進度條；
  - 課綱連結只在 registry 有入口時出現（現在規劃中的島沒有入口）。
- **狀態來源**：registry 的 `status`，由已寫好的課程自動算出。之後寫完一座島的課，它會自動從霧中小島變為正式島，不需要改 Layout。
- **測試**：每座 planned 島的名牌、面板與清單都含「規劃中」，而且不出現課程連結與進度數字。

## 2. CS／AI 區域座標與連接驗證

### 2.1 本次執行的檢查

- **方法**：以 repo 現有的 `validateHexWorld` 驗證兩區草案，在隔離副本（HEAD 的 `src` 與 `1882b6c` 相同）以 Vitest 執行。
- **既有島嶼**：F、DS、AL、DB 用首頁世界的真實格子與三座既有橋。
- **規劃中的島**：以完整半徑 3 的六角形（37 格）估計，這是現有島中最大的形狀。
- **新橋**：用程式搜尋，條件是最短的直線，而且港口靠近兩島中心連線。

| 檢查 | Region A | Region B |
|---|---|---|
| `validateHexWorld` | **0 個問題** | **0 個問題** |
| 島間最少水格 | 2 | 2 |
| 橋（新） | F–PL、AL–CN 各跨 2 格水；DB–SA、SA–MIS 各跨 3 格水；F–碼頭跨 2 格水 | 研究碼頭–AIF、AIF–ML、ML–DL、DL–LLM、LLM–GEN、LLM–AG、AG–OPS、OPS–應用碼頭，都跨 2 格水 |
| 橋（既有，不變） | F–DS、DS–AL、DS–DB | — |
| 橋共用水格 | 無 | 無 |
| 陸地範圍（世界單位） | 65.6 × 53.0 | 73.1 × 44.4 |
| 對照：現在 5 島首頁 | 31.9 × 39.0 | — |

### 2.2 驗證後的修正

- **PL** 由 (−9, 1) 移到 **(−10, 1)**：原位置與基礎程式島只隔 1 格水，因為 F 的實際形狀比半徑 3 大。
- **碼頭**：
  - Region A 改為**沿用 F 既有的 `Dock_Entry`**（spur `foundations-dock`），不另建碼頭島；
  - Region B 的兩個碼頭建議做成 AIF、OPS 西岸的 spur。
  - 驗證時用 (−7, 2)、(−6, −13) 的 7 格小碼頭代替，橋各跨 2 格水。

### 2.3 尚未檢查（M3.1 prototype 必須補上）

| 項目 | 已知風險 |
|---|---|
| 港口與地標、平台格衝突 | 搜尋到的 DB–SA 港口 (2, −11) 是 DB 北側平台格，緊鄰資料庫主塔 (2, −10)。**必須重選**：改用 DB 東北岸，或改由 DS 接 SA |
| 道路經過建築與樹林 | 新港口（F (−4, 1)、AL (13, −3)）到島中心的道路，要避開 F 的工坊與燈塔、AL 的樹林 |
| 規劃中島嶼的實際形狀 | 37 格是上限估計；實際形狀（去掉邊緣格、樹林、平台）要和 GLB 的建築格一起定 |
| 碼頭朝向 | 碼頭 spur 要面向樞紐方向，航線不穿過其他島 |
| 名牌間距（投影後） | 見 §5 |

### 2.4 Region Layout Validator（提案，`validate-region.ts`）

在 `validateHexWorld` 之上，再加這些檢查：

1. **身分**：Layout 的島嶼集合等於 registry 該區的學科島；樞紐只有工具島。
2. **間距**：任兩島之間至少 2 格水（比 `validateHexWorld` 的 1 格嚴格；Region A 中既有的四座島都符合）。
3. **橋的長度**：跨 1–3 格水；跨區連結不用橋，只用航線。
4. **港口**：不在地標格、平台格或樹林上；不與 spur 共用邊（後者已有檢查）。
5. **道路**：從島中心到每個港口的道路（`settlementRoads`）不經過建築格與樹林。
6. **碼頭**：每區至少一個碼頭 spur 面向樞紐；航線線段不穿過陸地。
7. **既有島不變**：Region A 的 F、DS、AL、DB 的格子、橋、道路、樹木、岩石與 GLB 擺放，逐項等於 `islandsHomeWorld`（沿用 F.1e 的測試寫法）。
8. **投影名牌**：總覽層與區域層中，名牌中心之間的螢幕距離不小於名牌寬度（以 §5 的取景計算）。

## 3. 導覽流程：World Overview → Region → Island

```
/world（總覽）
  ├─ 點 Region A 輪廓／名牌、鍵盤 Enter、清單 → /world/cs（區域）
  │     ├─ 點島／名牌／清單 → ?island=<id>（聚焦，科目面板）
  │     │     └─「返回全景」→ 回到區域（不是總覽）
  │     ├─ 點碼頭或「返回世界」→ /world
  │     └─ 跨區連結（例如路線 E 從 AL 到 AIF）→ 以航線提示，點擊後到 /world/ai?island=ai-foundations
  ├─ 點中央樞紐 → 互動實驗島（/learn）與挑戰島（F.6 之前只顯示「規劃中」）
  └─ 點 Region B → /world/ai（同上）
```

| 輸入 | 行為 |
|---|---|
| 滑鼠 | 點輪廓、名牌、島；hover 點亮名牌（沿用 `data-hovered`） |
| 鍵盤 | 名牌依序 Tab；Enter 進入；Esc＝返回上一層；焦點回到原本的名牌 |
| 觸控 | 點名牌圓點；總覽的三個大目標 ≥ 44 px |
| 沒有 WebGL | 每一層都有清單：總覽 → 區域清單 → 島嶼清單，任何課程都不經 3D 也能到達（沿用現有 fallback） |
| Reduced Motion | 層與層之間不做鏡頭飛行，直接切換 |
| 返回鍵 | 由 URL 處理：聚焦 → 區域 → 總覽 |
| 學習路線（M3.5） | 這一階段只預留介面：區域 Layout 提供每座橋與航線的端點，之後路線高亮直接讀 `paths.ts` |

## 4. Feature Flag 與舊首頁共存

| 項目 | 方案 |
|---|---|
| 穩定版本 | `/` 維持現在的五島首頁，**0 行差異**；以測試確認 `src/app/page.tsx` 與 `islandsHomeWorld` 的輸出不變 |
| 新世界 | 新路由 `/world`、`/world/[region]`，比照 `/islands/candidate` 的前例：**不連結**、`robots: noindex, nofollow` |
| Flag | 建置時的環境變數 `LOGIC_ISLAND_REGIONAL_WORLD=1`：沒有設定時，`/world` 回傳 `notFound()`，也就是正式建置完全不暴露；隔離副本的 E2E 與效能量測設定這個變數 |
| 共用程式 | 只做加法：新元件與新 Layout。共用元件（`hex-layout`、`HexCamera`）的既有呼叫行為不變，由既有測試保證 |
| Theme | 新世界讀同一個 site time（`logic-island.time`）與 theme（`logiclab-theme`），四時段沿用 `useGlow`；不修改 Theme Session 的檔案 |
| 受保護頁面 | `/islands`、`/islands/legacy`、`/islands/candidate`、`/islands/hex/**` 不碰 |
| 切換 | 只在 M3.6 驗收通過後**提出建議**，由使用者決定。屆時的選項是 `/` 改為總覽，或改為直接進入 Region A；舊首頁保留一段時間作為回退 |
| 回退 | 移除 `src/app/world/` 與 flag 即完全回到現況 |

## 5. Desktop／Mobile Camera

### 5.1 計算結果

以 `hex-camera.tsx` 的 `frame()` 取景公式，在隔離副本計算總覽的縮放（px／世界單位，數字越大島越大）：

| 世界 | 桌機 1440×1000（右側清單 340 px） | 手機 390×844 | 手機（最佳方位角） |
|---|---:|---:|---:|
| 現在 5 島首頁 | 30.2（100%） | 10.9（100%） | 11.0 |
| Region A 草案 | 15.3（**51%**） | 5.5（**51%**） | 7.2（66%，轉 210°） |
| Region B 草案 | 14.6（**48%**） | 5.3（**48%**） | 8.0（73%，轉 60°） |

換算成畫面上的大小（半徑 3 的島約 13 世界單位寬）：

| | 現在首頁 | 區域總覽（預設方位角） | 區域總覽（手機最佳方位角） |
|---|---:|---:|---:|
| 桌機 | 約 400 px | 約 200 px | — |
| 手機 | 約 140 px | 約 72 px | 約 95–105 px |

這是 M3.1 最主要的設計問題：桌機可以接受；手機的區域總覽偏小。

### 5.2 設計

| 層 | 桌機 | 手機 |
|---|---|---|
| 總覽 | 三個輪廓＋名牌，取景沿用 `frame()` | 同上；三個目標都放大到 ≥ 44 px |
| 區域 | `frame()`＋右側清單內距；預設方位角 VIEW | **每區一個手機用的預設方位角**（讓長軸對齊螢幕高度，例如 Region B 轉 60°）；名牌圓點（現有）；下方清單 |
| 聚焦 | 現有（與 F.1e 相同） | 現有（底部面板） |
| 自動旋轉 | 只在區域層；總覽不轉 | 同左 |

M3.1 prototype 要比較兩種緊湊方案，任一種都要通過 §2.4 的驗證：

1. **縮小規劃中的島**：先用半徑 2（19 格），寫課時再長大。
2. **縮短島距**：中心距離 9 → 8。

**驗收門檻（提案）**：手機區域總覽中每座島 ≥ 88 px 寬、名牌不重疊不裁切；桌機 ≥ 180 px。

## 6. GLB Scale Contract 與 Interaction Anchor Contract

以 v2.1 與資料庫島預留的節點名稱為準，兩區相同。

### 6.1 Scale Contract

| 項目 | 規定 |
|---|---|
| 執行時比例 | **0.6**（所有學科島相同，等於 v2.1）；GLB 內以 Blender 公尺建模，與 v2.1 同尺度 |
| 原點 | 每個建築部件以**自己的底面中心**為原點；放置位置＝所在六角格中心、格頂高度（`BASE_TOP + tileHeight`），與 Transitional Art 的做法相同 |
| 方向 | +Y 向上；正面朝向局部 −Z；擺放時以 yaw 旋轉（現有 GLB placements） |
| 佔地 | 一個地標 ≤ 1 格（大型地標 ≤ 2 格，事先在 Layout 中保留建築格）；不得伸出島外，也不得壓到道路格與港口格 |
| 高度 | 垂直地標 ≤ v2.1 燈塔的高度；其他建築 ≤ 燈塔的一半，避免遮住相鄰島的名牌（**2026-11-03 實作時修正**：v2.1 的工坊就有 3.23 GLB 單位，是燈塔 4.36 的 74%，所以改為「建築 ≤ 3.3（工坊）」，見 §10） |
| 地形 | GLB 不含六角地形，地形由引擎產生 |
| 測試 | 每個節點的包圍盒 × 0.6 在宣告的佔地格內；高度不超過上限 |

### 6.2 Interaction Anchor Contract

| 項目 | 規定 |
|---|---|
| 根節點 | `Island_<Name>_Root`（v2.1 的 `Island_Basics_Root` 不改名） |
| 互動目標 | `Landmark_*`／`Building_*`／`Plaza_*`／`Dock_*`，extras 帶 `role`、`interaction_id` |
| Anchors | `Anchors` 群組下 `Anchor_<Target>`，每個互動目標一個；每座島**必須**有 `Anchor_Entry`、`Anchor_Route_Exit` |
| Anchor 位置 | 目標正面前方、地面以上的名牌高度；聚焦時地點名牌畫在這裡（現有機制） |
| 動作 | 在 `asset-registry.ts` 的 `nodes` 宣告（`route` 或 `info`），不寫在 GLB 裡；`route` 只能指向 registry 中存在的入口 |
| 規劃中的島 | 沒有 GLB，只有霧中小島；不得出現指向不存在課程的入口 |
| 第一個實例 | DB：`Landmark_DatabaseTower`、`Building_IndexHall`、`Landmark_ReplicaTowers`、`Plaza_DataTables`（已預留）＋ `Anchor_Entry`、`Anchor_Route_Exit` |
| 測試 | node-contract JSON 比對（父子、transform、extras）；registry 的 `nodes` 與 GLB 一致；E2E 的鍵盤與點擊可達 |

## 7. 效能預算與量測方案

### 7.1 基準（已有，F.1e 量測，SwiftShader）

5 島首頁 `/`：
- 總覽 66 draw call；三角形桌機 49,113、手機 36,923；
- 首畫面約 1.5 s，GLB 就位約 2.2 s；
- 陰影 pass 0。
- 真機：**Not Measured**。

### 7.2 M3.1 要量的東西

用現有的 `perf/world.perf.ts`（`PERF_BASE_URL`、`PERF_ROUTES`、`PERF_ROUNDS=5`），在隔離副本以 flag 建置：

| 情境 | 路由 | 內容 |
|---|---|---|
| P0 基準 | `/` | 同 F.1e，確認環境一致 |
| P1 總覽 | `/world` | 三個輪廓 |
| P2 Region A（現況美術） | `/world/cs` | F 的 GLB＋DS、AL、DB 的 Transitional Art＋4 座霧中小島 |
| P3 Region B（現況美術） | `/world/ai` | 7 座霧中小島 |
| **P4 GLB 最壞情況** | `/world/cs?stress=glb`（只在 flag 建置中） | 在每座島放一份**唯讀載入**的 v2.1 GLB 作為替身，估計 8 座 GLB 島的成本；**不修改 GLB 檔** |
| P5 聚焦 | 每區各聚焦一座島 | 與 F.1e 的聚焦數字比較 |

- **指標**：每幀 draw call、三角形（主畫面與 offscreen）、首畫面、GLB 就位、鏡頭飛行與 orbit fps（headless fps 只看有無明顯退步，P1-20）、JS heap、GLB 位元組數。
- **桌機與手機**：兩個專案各量；**真機**（D.3-4B）至少一台 iPhone、一台中階 Android，量 P0、P2、P4。真機量測需要使用者協助或另行授權。
- **預算**：ART_DIRECTION §6 的數字仍是**暫定目標**；M3.1 報告以 P2–P4 的實測數字提出正式預算建議，不把估計值當成上限。

## 8. M3.2 正式建模的進入條件

以下全部通過，並經使用者確認世界架構後，才開始 M3.2 的 DB 與 LLM 正式建模：

| # | 條件 | 證據 |
|---:|---|---|
| 1 | Region A、B 的 Layout 通過 §2.4 Region Layout Validator（含港口、道路、地標衝突） | 單元測試 |
| 2 | 島間距、橋與航線、碼頭朝向都確定，**使用者批准座標與橋** | 截圖＋座標表 |
| 3 | Camera Framing：桌機與手機的總覽、區域、聚焦三層都通過 §5.2 的門檻；名牌不重疊不裁切；四時段 | 截圖（桌機、手機 × 四時段） |
| 4 | 導覽：滑鼠、hover、鍵盤、觸控、返回、沒有 WebGL 的清單都能從總覽到任一島 | E2E |
| 5 | 霧中小島明確標示「規劃中」，沒有課程連結與進度數字 | E2E |
| 6 | 五島首頁 `/` 與受保護頁面 0 行差異；世界指紋與首頁世界測試通過 | git diff＋測試 |
| 7 | GLB Scale Contract 與 Interaction Anchor Contract 定稿，DB 與 LLM 的節點清單與佔地格寫進 Layout | 契約文件＋測試骨架 |
| 8 | Performance Baseline：P0–P5 的實測報告；以實測數字訂出正式預算（使用者批准） | 量測報告 |
| 9 | Blender MCP：檢查 protocol 14／15 的相容性（只讀：`get_addon_status`），並提出升級或替代方案。替代方案：(a) 在另一份 Blender 設定或複本中升級 addon，驗證後再切換；(b) M3.2 的匯出改用 Blender 命令列（`blender -b --python`），不依賴 MCP。**不直接修改既有可運作的環境** | 相容性報告 |
| 10 | Blender Pipeline 的準備（可與 M3.1 平行）：匯出設定、命名與材質範本、provenance 範本、驗證腳本；**不開始建模** | 範本檔與說明 |

## 9. 本次範圍

- **做了**：
  - M3.0 文件依決策更新；
  - 本提案；
  - 隔離副本中的 Layout 驗證與鏡頭計算。腳本不在 repo，實作 M3.1 時會改寫為正式的 `validate-region` 測試。
- **沒有做**：任何 prototype 路由、程式、測試、資料、GLB、BLEND 的修改；沒有 build、E2E 或效能量測。

## 10. 實作結果（2026-11-03 prototype）

使用者批准後在 flag 後實作。以下是與本提案不同的地方；完整數據見 `logs/2026-11-03-m3-1-regional-world-prototype.md`。

- **座標**：§6 的草案只作起點，最終座標以 Validator 與實測鏡頭決定。
  - 規劃中的島改為 19 格，位置更緊湊。
  - PL 改由 AL 接（F 沒有可用的港口），CN 改由 DS 接。
  - Region B 改成一個環形。
- **鏡頭**：
  - 方位角改為每區、每種裝置各一個：CS 桌機 295°、手機 105°；AI 都是 0°。
  - 區域圖的名牌加大取景範圍，只對左右兩側生效。
- **§5 門檻（以場景投影實測）**：
  - 桌機 CS 181、AI 209 px，**通過**。
  - 手機 CS 73、AI 85 px，**未通過**。暫以 44 px 觸控區、清單與聚焦替代，列為上線前的限制。
- **§6.1 建築高度**：v2.1 的工坊就超過「≤ 燈塔一半」，改為「≤ 3.3 GLB 單位（工坊）」。
  - 契約在 `src/lib/islands/glb-island-contract.ts`。
- **§4 頁首**：`/world` 的頁首也像首頁一樣浮在地圖上（`header.tsx`）。
- **§7 P4**：替身是 v2.1 的燈塔＋工坊，放在每座島上（`?stress=glb`），不是完整的島嶼 GLB。
- **§8 進入條件**：Pass 5、Fail 1、Pending 4，逐項見 log。區域座標與橋已由使用者批准為定案（#2）。
