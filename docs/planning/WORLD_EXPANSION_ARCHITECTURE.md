# 3D 多群島擴充架構（World Expansion Architecture）

> Phase F.0 規劃文件（2026-11-02）。**只是規劃**，不修改 GLB、Camera、Renderer、Island Geometry 或正式 `/islands`。
> 島嶼清單見 [ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)，資料設定見 [ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md)。

## 1. 現況（已實作，保留）

| 項目 | 現況 |
|---|---|
| 首頁 `/` | 全畫面 3D 六角群島（`islandsHomeWorld`）：基礎程式島、資料結構島、演算法島＋**互動實驗島**，三座橋；自由鏡頭、自動旋轉、四個時段、右側半透明航行指南、左下科目面板；鏡頭依內容自動取景（含右側清單內距） |
| 世界資料 | `src/lib/islands/islands-world.ts`、`hex-layout.ts`：`assembleLayout` 目前**寫死三座學科島**（`foundations`／`structures`／`algorithms` 欄位）＋選用的 `labs` |
| 資產 | 只有基礎程式島使用正式 GLB（燈塔、工坊、碼頭，`basics-island-v2.1`）；其他島為程式產生的地形與佔位地標 |
| 其他路由 | `/islands`（正式原型 02A，受保護）、`/islands/candidate`（候選，三島）、`/islands/legacy`、`/islands/hex`（預覽） |
| 已知限制 | 真機效能 D.3-4B **Not Measured**（KNOWN_ISSUES）；Auto Orbit 測試高負載逾時（P1-32） |

## 2. 不能直接把 16 座島塞進現有地圖

15 座學科島＋1 座實驗島放進同一張 3D 地圖：全景時每座島只剩幾十像素、名牌互相重疊；地形、樹木與道路的 draw call 與陰影成本約為現在的 4 倍；手機（目前 3D 已需降級）會更吃力；鏡頭的取景範圍與自動旋轉也會失去意義。

## 3. 四個方案比較

| 方案 | 說明 | UX | 3D 效能 | 手機 | 資產管理 | 鏡頭／導覽複雜度 | 擴充性 | 開發成本 |
|---|---|---|---|---|---|---|---|---|
| A. Single Expanding World | 一張不斷長大的地圖 | 全景失焦、找島困難 | 差（全部同時渲染） | 差 | 單一世界檔越來越大 | 高（分區取景、LOD） | 差 | 一開始低，之後很高 |
| B. Multiple Region Maps | 每個區域一張獨立地圖，用選單切換 | 清楚，但區域間沒有空間關係 | 好（每次 ≤ 8 島） | 好 | 每區獨立、易維護 | 低（沿用現有取景） | 好 | 中 |
| C. Hub Island + Region Maps | 中央樞紐島（實驗島／挑戰島）連到各區域地圖 | 有「世界」的感覺，入口清楚 | 好 | 好 | 樞紐＋區域分開 | 中（多一層轉場） | 好 | 中高 |
| D. Hybrid Navigation | C 的空間結構＋清單／搜尋／路線等非 3D 導覽並列 | 最好：新手用 3D 探索、熟手直接搜尋 | 好 | **最好（手機可以清單優先）** | 同 C | 中 | 最好 | 中高（分階段可控） |

## 4. 推薦：D. Hybrid Navigation（以 C 為空間骨架）

- **三層結構**：世界總覽（低細節，只畫兩個區域與樞紐的輪廓與航線）→ 區域地圖（現在的六角群島引擎，每區 ≤ 8 座學科島）→ 島嶼聚焦（現在的聚焦與科目面板）。
- **樞紐島**：互動實驗島移到兩個區域之間作為樞紐，未來的中央挑戰島（APCS 試煉、AI Capstone，見 [PHASE_F_ROADMAP](PHASE_F_ROADMAP.md) F.6）也放在這裡。
- **非 3D 導覽並列**：航行指南（清單）、課綱頁、學習路線頁、搜尋；任何課程都能不經 3D 抵達。手機預設清單優先，3D 為選用。
- **沿用現有引擎**：區域地圖就是現在的 `HexWorldScene`；鏡頭已依內容取景、支援內距；新增的只是「要畫哪些島」的資料與轉場。

## 5. 分階段遷移

| 步驟 | 內容 | 3D 改動 | 對應 Phase |
|---|---|---|---|
| M0 | 現況：四座島首頁 | — | — |
| M1 | 世界資料改為設定檔驅動（[ISLAND_CONFIG_DESIGN](ISLAND_CONFIG_DESIGN.md)），**畫面完全不變**；`assembleLayout` 從寫死三座島改為接受 N 座聚落 | 資料層 | F.0 |
| M2 | 航行指南改版（見下節）：實驗島置前、無編號；完成／規劃中／尚未開放分明 | 無（只改清單） | E.5 |
| M3 | Computer Science 區域地圖：8 座學科島；尚未開課的島以低細節「霧中小島」呈現（可點、顯示規劃說明） | 新增 5 座程式產生的島 | F.1 |
| M4 | 世界總覽＋樞紐島＋AI 區域地圖（7 座）；區域切換轉場 | 新增總覽層與 AI 區域 | 由 M3.1–M3.5 取代 |
| M5 | RPG 疊加層（徽章、NPC、挑戰島），只讀進度、不改世界資料 | 互動物件 | F.6 |

每一步都可以停在原地上線；M3 之前首頁保持現在的四座島。

> **2026-11-02 變更（使用者確認）**：資料庫應用島完成 20／20 後，在 M3 之前先加入首頁，首頁成為五座島（4 座學科島＋互動實驗島）；只改首頁的世界，`/islands` 與候選頁不變。M3 時資料庫應用島的位置與橋隨區域地圖重新規劃。見 [PHASE_F_ROADMAP](PHASE_F_ROADMAP.md) 與 `logs/2026-11-02-f2-database-island-world.md`。

> **2026-11-03 M3.0**：上表的 M3（CS 區域地圖）與 M4（世界總覽＋AI 區域）細化為 M3.0–M3.6，含兩區的 Hex Layout 草案、Single World／Regional World 比較（推薦 Regional World，即本文 §4 的 D 方案）、GLB 美術與共用管線。見 [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md) 與 [ARCHIPELAGO_GLB_ART_DIRECTION](ARCHIPELAGO_GLB_ART_DIRECTION.md)；尚待批准。

## 6. 航行指南

規劃中的清單結構（M2）：

```
航行指南
├─ 互動實驗島（工具島，無編號）          ← 放在學科前面
├─ Computer Science
│   01 基礎程式島          已完成 · 20 堂
│   02 資料結構島          已完成 · 20 堂
│   03 演算法島            已完成 · 20 堂
│   04 程式語言島          規劃中
│   …
│   08 管理資訊系統島      規劃中
└─ Artificial Intelligence
    01 AI 基礎島           規劃中
    …
    07 AI 工程與 MLOps 島  規劃中
```

- 編號只給學科，**每個區域各自從 01 開始**；實驗島不編號（目前顯示「04 互動實驗島」，M2 修正）。
- 狀態三種：**已完成**（可學）、**規劃中**（看得到大綱與先修，課程尚未上線）、**尚未開放**（只有名稱，連大綱都還沒定）。
- 規劃中的島可以點進去看課綱藍圖與預計活動，但不顯示假的進度或課數已完成。

## 7. 其他規劃項目

| 項目 | 規劃 |
|---|---|
| Region Selection | 總覽地圖點區域／頁首切換；URL 帶區域（例如 `/?region=ai`），可分享 |
| Island Navigation | 區域地圖內沿用現有聚焦、名牌、科目面板；跨區的島以「航線」提示 |
| Unlock Conditions | **不硬鎖學科**；島嶼一律可進入，課程顯示必修／建議先修（見 [LEARNING_PATHS](LEARNING_PATHS.md)）；RPG 的「解鎖」只用於獎勵與挑戰島（F.6） |
| Course Entry Points | 島上互動物件（GLB `interaction_id` 或程式產生地標）→ 課綱、某堂課、某個活動；資料定義見 ISLAND_CONFIG_DESIGN |
| Interactive Objects | 每座島 3–5 個：入口（課綱）、代表活動、挑戰點；沿用 GLB Node Contract，不重新命名節點 |
| Cross-Island Travel | 區域內：橋與道路（現有）；跨區：經樞紐島；學習路線可在地圖上以航線高亮 |
| Mobile | 清單優先；3D 降級（少樹、無陰影、靜態取景）；區域地圖一次只載入一區 |

## 8. 效能與資產

- 每個區域地圖的預算以現有四島首頁為基準（同等的 draw call、陰影、樹木 LOD），超出才分 chunk。
- 新島先用程式產生的地形與佔位地標（與資料結構島、演算法島現況相同）；GLB 美術沿用 Blender 管線（A–C.1 的驗收流程），**不改現有 GLB**。
- 真機效能驗收（目前 Not Measured）是 M3 之前的前置條件，列入 E.5。
