# 2026-11-02 資料庫應用島 3D 世界整合（使用者稱 Phase F.2）

## 指示範圍與決策

使用者在盤點之後確認方案 B：

- 在 M3 之前，首頁由 4 座島擴充為 5 座島；
- 資料庫應用島的六角座標暫定 `(2, -9)`，以橋連到資料結構島；
- 地標使用程式產生的 low-poly 過渡版（Transitional Art），正式 GLB 留待之後的 Blender 美術階段；
- `/islands`、`/islands/legacy`、`/islands/candidate`、`/islands/hex/scale/37` 不修改；
- 既有四座島的位置、模型與互動不變；
- 可以有本地 commit，但只 Stage 自己的檔案；禁止 Push、Merge、Deploy、Rebase、Reset Hard、Git Clean。

名稱注意：[PHASE_F_ROADMAP](../docs/planning/PHASE_F_ROADMAP.md) 原訂的「Phase F.2」是 AI Foundations & Machine Learning，與本次工作不同；roadmap 已註明。

## 起點

- `phase-d/basics-glb`，HEAD `2378d7c`；DB01–DB20 完整，320 堂中 80 堂完整。
- 另一個工作階段（Theme）有未提交的修改：`src/app/globals.css`、`src/app/layout.tsx`、`src/components/curriculum/curriculum.module.css`、`src/lib/site-time.ts`、`src/components/islands/islands.module.css`。
  - 本次沒有修改、還原或提交它們（開始與結束時比對 MD5）。
  - 新的樣式放在自己的 `island-status.module.css`，避開 `islands.module.css`。
  - 所有建置、截圖、效能與 E2E 都在「HEAD＋本次檔案」的乾淨副本執行，不含 Theme 的修改。

## 實作

### 世界與橋（`src/lib/islands/islands-world.ts`、`hex-layout.ts`）

- 只加在首頁的世界 `islandsHomeWorld`，比照互動實驗島的前例；`islandsWorld`（候選頁、scale/37）不變。
- **位置**：中心 `(2, -9)`，半徑 2 的六角形去掉三個邊緣格，共 16 格。
  - 與基礎程式島、資料結構島都隔兩格水面（最近距離 3）；與演算法島、互動實驗島相距 11。
  - 主塔所在的北側三格抬高 0.35 成平台，西緣三格是樹林，東南岸是沙灘。
- **橋**：`structures-databases`，木橋，從資料結構島 `(6, -8)` 的西側邊跨兩格水面直線接到資料庫島 `(3, -8)`。
  - 資料結構島上的新路從中心 `(8, -8)` 經 `(7, -8)` 到 `(6, -8)`，避開倉庫、木箱與樹林。
  - 資料庫島上的路是 `(2, -9)` → `(3, -9)` → `(3, -8)`。
- **驗證**：`validateHexWorld` 沒有問題。單元測試逐項比對既有四座島：
  - 地形格、三座既有的橋、所有既有道路；
  - 樹木、岩石、廣場、GLB 擺放。
  - 都與加島之前相同。樹木與岩石依位置雜湊產生，新島不影響它們。

### 地標（Transitional Art）

- `src/components/islands/hex-world/hex-database-landmarks.tsx` 定義四個地標：
  - 資料庫主塔：三層磁碟、主色接縫與頂蓋，加一盞狀態燈；
  - B+ Tree 索引館：山牆建築，旁邊是根、兩個子節點與相連的葉節點列；
  - 資料複寫雙塔：主機與複本，以複寫連結相接；
  - 資料表廣場：鋪面加主色的表頭列與格線。
- 造型語言與既有佔位地標相同：flat shading 的基本形體、約一格大小、主色 `#2f7d6d` 配暖白。
- 起初每個零件是一個網格，總覽多 24 個 draw call。改成和 `HexPlaza` 相同的做法：
  - 所有零件以頂點顏色合併成一個網格；
  - 狀態燈另一個網格，用 `useGlow` 跟著環境的發光強度（傍晚較亮）。
  - 結果是 2 個 draw call。
- **未來換 GLB 的介面**：`src/lib/islands/database-island.ts` 的 `DATABASE_LANDMARKS` 以未來 GLB 的節點名稱命名四個地標：`Landmark_DatabaseTower`、`Building_IndexHall`、`Landmark_ReplicaTowers`、`Plaza_DataTables`。
  - 有了 GLB 之後，為這座島加一個 GLB settlement，場景就用 `HexGlbBuildings` 畫它。
  - 過渡地標保留為 GLB 載入中或失敗時的 fallback，這是既有機制。
- `hex-plaza.tsx` 只把 `painted` 改為 export，行為不變。

### 島嶼資料與 registry

- **`src/lib/islands/data.ts`**：新增 `databaseIsland`（名稱、英文名 THE DATA VAULT、簡介、地標文字、主色）。
  - 不放進 `islands`，所以 `/islands` 與候選頁仍是三座。
- **`src/content/world/islands.ts`**（只有一套 world registry）：
  - 資料結構島加一條到 `databases` 的 bridge 連結；
  - 資料庫應用島加上地圖的地標文字。
  - 測試要求 registry 宣告的橋等於首頁地圖畫的橋，名稱、主色、地標與地圖一致。
- **D20 的頁尾**：本島最後一堂 D20 的頁尾，橋的清單多了「資料庫應用島」。
  - 頁尾的橋讀自同一份 registry；這是加橋的直接結果，其他課程頁不變。

### 首頁面板（`src/app/page.tsx`、`learning-navigation.tsx`）

- 島嶼清單順序是基礎、資料結構、演算法、互動實驗、資料庫；既有四座島的編號 01–04 不變，資料庫應用島是 05。
- 選島後的科目面板：
  - 英文名與名稱；
  - 「教材：已開放 20／20 堂」：已寫好的課數，取自 world registry 與目錄，是教材狀態；
  - 學習者自己的「資料庫應用島：已完成 X／20 堂」：沿用原本的 `logic-island.progress`，key 與格式不變；
  - 6 個科目與 DB01–DB20，每一堂連到 `/curriculum/<slug>`；
  - 「查看完整課綱」連到 `/curriculum#island-databases`，取自 registry 的入口。
- 只有提供 `published`／`curriculumHref` 的島才顯示這兩項；其他島的面板維持原樣。
- 首頁畫布的無障礙說明改為「四座學習島嶼（基礎程式、資料結構、演算法、資料庫應用）與互動實驗島」。

## 驗收

### 截圖（production build，HEAD＋本次檔案；desktop 1440×1000、iPhone 13 尺寸）

- 四個時段（清晨、中午、黃昏、傍晚）× 桌機／手機：五個名牌都在、都在畫面內、沒有互相重疊，console 沒有錯誤。
- 資料庫應用島在總覽的上方，木橋接到資料結構島；四座既有的島外觀不變。
- 聚焦資料庫應用島時鏡頭留出右側清單的寬度；左下的科目面板會蓋到島的西側。互動實驗島聚焦時相同，是既有的取景方式。
- 手機：總覽以名牌圓點顯示五座島；聚焦後科目面板由下方出現，與其他島相同。

### 效能（`perf/world.perf.ts`，SwiftShader，各 5 輪，首頁 `/`）

| 項目 | 四島（加島前，`2378d7c` 等價 build） | 五島 |
|---|---:|---:|
| 總覽 draw call（桌機／手機） | 63／63 | 66／66 |
| 總覽三角形（桌機） | 44,360 | 49,113（+10.7%） |
| 總覽三角形（手機） | 33,024 | 36,923（+11.8%） |
| 聚焦基礎程式島 draw call（桌機／手機） | 37／46 | 39／47 |
| 陰影 pass | 0（靜態陰影） | 0 |
| 第一個畫面 | 約 1.5–1.7 秒 | 約 1.5–1.6 秒 |
| GLB 就位 | 約 2.1–2.3 秒 | 約 2.1–2.2 秒 |
| 鏡頭飛行 fps（桌機／手機） | 約 23／50 | 約 24／51 |

- 增加的三角形主要是新島的地形。
- 地標合併前，總覽是 87 個 draw call，已改正。
- headless 的 fps 不可靠（P1-20），只用來確認沒有明顯變化。
- 真機仍未量測。

### 測試（乾淨副本）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest | 1562 passed／0 failed／0 skipped（新增首頁世界的資料庫島 4 項、互動實驗島不變 1 項） |
| Build | 成功，97 個靜態頁 |
| E2E 全套（desktop＋mobile） | 401 passed／40 skipped／3 failed |

- E2E 的 3 項失敗都是既有 P1-11（`player.spec.ts`）。
- skipped 多 1 項，是新的 hover 測試在手機上跳過（觸控沒有 hover）。
- 新的 `e2e/home-databases.spec.ts` 涵蓋：五座島可見且名牌不重疊、點擊與觸控、鍵盤、hover、面板內容與連結、既有進度、沒有 WebGL 時的清單、DB01–DB20 都能開啟。
- 既有的 `islands`、`islands-candidate`、`hex-*`、SQL 練習場與資料庫活動測試全部通過。

### 受保護範圍

- 下列都沒有修改，`tests/world-data.test.ts` 的世界指紋與 `islands-routes` 測試通過：
  - `src/app/islands/**`（`/islands`、`/islands/legacy`、`/islands/candidate`、`/islands/hex`）；
  - `public/` 的 GLB；
  - `islandsWorld`（候選頁、scale/37）；
  - 舊的等角場景元件。
- 共用的 `hex-landmarks.tsx` 多了 `databases` 的分支，只有首頁的世界有這座島，其他路由畫面不變。

## 未完成與限制

- 正式 GLB 尚未製作，需要另行授權（規格見 PHASE_F_ROADMAP）。
- 過渡地標沒有 GLB 的地點互動（地點說明、建築入口）；進入課程靠名牌、地形點擊、清單與科目面板。
- 聚焦時左側科目面板會蓋到島的西側，所有島都一樣，屬於既有取景，未在本次修改。
- 真機效能與觸控仍未量測（D.3-4B）。
- M3（CS 區域地圖）時，資料庫應用島的位置與橋要重新規劃。
