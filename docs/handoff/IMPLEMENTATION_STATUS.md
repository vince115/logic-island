# 實作與 Phase 狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 狀態用語

| 標記 | 意義 |
|---|---|
| Implemented | 原始碼／資產實際存在，不能單憑此推定可執行 |
| Verified | 附有本輪執行證據；若僅為舊報告，明記「歷史報告 Verified」 |
| Partial | 部分已實作或驗證，仍有明確缺口 |
| Planned | 有規格／流程規劃，但沒有對應完成實作 |
| Blocked | 有明確阻擋原因，例如建置失敗或缺少批准 |
| Not Started | 未找到對應實作或執行證據 |

「實作」「測試」「人工批准」分開記錄；數字不以平均百分比包裝。

## 功能現況

| 功能 | 實作／驗證狀態 | 依據與缺口 |
|---|---|---|
| 六教材概念／四語範例 | Implemented／Verified（分支） | `src/content/courses.ts`；2026-11-02 起 C++、Java、Python、JavaScript（`LAB_LANGUAGES`），`tests/examples.test.ts` 四語實際執行（JDK 在 PATH） |
| 純演算法快照引擎 | Implemented／Verified | `src/lib/engine.ts`；21 項引擎測試通過 |
| 共用播放器 | Implemented／Verified（jsdom）／Partial（瀏覽器） | `src/components/lab.tsx`；12 項 DOM 測試通過，實際 Web E2E 未跑 |
| 深淺主題／響應式／可存取性 | Implemented／Partial | 原始碼存在，無目前瀏覽器／WCAG 完整驗收 |
| Logic Islands（邏輯群島）原型 | Implemented／Partial／Blocked | `/islands`、三個 local geometry model；CSS 缺檔、型別與 lint 錯誤 |
| GLB 正式載入與功能節點路由 | **Implemented／Verified（分支 `phase-d/basics-glb`，D.1）**：只有基礎程式島 | `glb-island-model.tsx`、`glb-contract.ts`；工坊→`/learn`，燈塔／碼頭顯示說明，Anchor 只放標籤；載入失敗或契約缺失回到原創幾何。尚未 merge main，真機未測 |
| Hex World 六角聚落預覽（D.2a／D.2b 試作） | Implemented／Verified（分支） | `/islands/hex`，不連到網站導覽且設為 noindex；三座 7 格聚落、兩座橋與道路，地塊為程式生成。D.2b：基礎程式島改放 v2.1 GLB 的工坊、燈塔、碼頭與 3 棵樹，互動與 D.1 相同；第二階段改為 8 格連續地形（崖壁、坡道、低岸碼頭、GLB 粉彩配色）；另兩島仍是暫代幾何與獨立六角柱；正式 `/islands` 不讀取這份資料 |
| 原型整島 hover／click／聚焦 | Implemented、未實際驗證 | `island.tsx`／`camera-controller.tsx`；不是 GLB 子建物 click 整合 |
| v2.1 獨立 GLB viewer 三地標 Raycast | 歷史報告 Verified | 外部 `Polish_Browser_Validation.json`；與正式 R3F 系統分離 |
| 60 堂課綱與課程頁（E.1～E.4） | Implemented／Verified（分支） | `/curriculum`、`/curriculum/[slug]`；**完整教材 60／60**（基礎程式島、資料結構島、演算法島各 20 堂；三語範例、視覺化、測驗、練習；C++、Python、Java 皆已執行；2026-11-02 起每堂另有 JavaScript，以 Node.js 執行，`b525608`）。60／60 指教材建置完成，不代表學習者已學完 |
| 程式碼語法高亮（2026-11-02） | Implemented／Verified（分支，`b52b8e9`） | `src/lib/highlight`（Shiki 4.5.0，只在伺服器建置時執行）、`src/components/highlighted.tsx`；Lab、課綱範例、trace、測驗片段；唯讀，沒有可編輯的程式碼區。工作目錄需 `pnpm install` |
| 多群島資料架構（Phase F.0，2026-11-02） | Implemented／Verified（分支，自動化） | `src/content/world/`：2 區域、15 座學科島＋互動實驗島、`parseLessonId`（完整前綴）、`catalogLessons`（320 堂；只有 60 堂有頁面）、`learningPaths`（6 條）、`activities`（20 視覺化＋6 Lab implemented、61 planned）；規劃資料由 `scripts/planning-data.mjs` 產生 `planning-data.json`。只有資料與驗證，畫面不變 |
| 資料庫應用島 MVP（Phase F.1a，2026-11-02） | Implemented／Verified（分支，自動化） | DB01–DB05 完整 SQL 教材（`queryLanguage: 'SQL'`，沒有四語分頁）；SQL Playground：sql.js 1.14.2（SQLite 3.49.1，WebAssembly）在 Web Worker 執行，3 秒逾時終止、200 列上限、重設資料；練習以結果比對並用隱藏資料再檢查（`src/lib/sql`、`sql-playground.tsx`）；DB06–DB20 規劃中、不可點。不是完整安全沙箱（見 log） |
| 資料庫應用島擴充（Phase F.1b，2026-11-02） | Implemented／Verified（分支，自動化） | DB06–DB10 完整教材（子查詢／CTE／視窗函式、DDL／DML／約束、ER 模型、ER 圖到綱要、正規化）；SQL 練習的檢查敘述判定（DDL／DML）；新活動 erd-builder（ER 圖＋ER 建構，依意義檢查）與 normalization-steps（閉包、候選鍵、正規形式、無損與相依保留由引擎計算）；每堂課明確宣告 `capabilities`；上一堂／下一堂只在島內（`src/content/world/navigation.ts`），島的最後一堂改列學習路線與橋。320 堂中 70 完整、250 規劃；DB11–DB20 規劃中、不可點。見 log |
| 資料庫應用島擴充（Phase F.1c，2026-11-02） | Implemented／Verified（分支，自動化） | DB11–DB15 完整教材（索引與 B+ 樹、查詢計畫與調校、檢視表與觸發器、交易與 ACID、隔離等級與並行控制）；新活動 query-plan（EXPLAIN QUERY PLAN 寫成步驟、依計畫要求判定、B+ 樹探索、執行時間）與 transaction-timeline（WAL 時間軸與當機復原、鎖／MVCC 交錯排程與異常偵測）；大型資料集 `sales`；跨島的規劃中建議先修；程式碼測試執行器改用檔案 stdin＋逾時（修正卡住的根因）。320 堂中 75 完整、245 規劃；DB16–DB20 規劃中。見 log |
| 資料庫應用島完成（Phase F.1d，2026-11-02） | Implemented／Verified（分支，自動化） | DB16–DB20 完整教材（程式串接資料庫與 ORM、SQL injection 與資料庫安全、NoSQL 資料模型、備份複寫與擴展、綜合挑戰）；資料庫應用島 **20／20 完整**（狀態由課程推導為 complete）；新能力：參數綁定與參數組練習、當機一致性檢查（DB14 轉帳練習改以此驗證原子性）、protocol-sequence（往返序列，T2）、architecture-diagram（架構圖＋備份／複寫確定性模擬，T1，非自由繪圖）、driver-code（Python／JavaScript 在測試中執行、Java 編譯）、資料庫課程的 visualization（ds-comparison、challenge-stages）；資料集 `auth`、`documents`；查詢時間限制改從查詢開始計算。320 堂中 80 完整、240 規劃。見 log |
| 資料庫應用島 3D 世界整合（**Phase F.1e**，原稱 F.2，2026-11-02） | Implemented／Verified（分支，自動化） | 首頁地圖由 4 座島擴充為 5 座（使用者確認）：資料庫應用島在六角 (2, -9)，木橋接到資料結構島；程式產生的過渡地標（Transitional Art：資料庫主塔、B+ Tree 索引館、資料複寫雙塔、資料表廣場，合併為 2 個 draw call）；科目面板顯示 6 個科目、DB01–DB20、教材已開放 20／20 與個人進度 X／20，完整課綱連到 `/curriculum#island-databases`。`/islands`、legacy、candidate、scale/37 不變；正式 GLB 未製作。見 `logs/2026-11-02-f2-database-island-world.md` |
| M3.0 資訊科學＋人工智慧群島世界規劃（2026-11-03） | Planned（只有文件；2026-11-03 使用者有條件批准，§10 決策紀錄） | 課綱對照（CS 8 座＋AI 7 座維持不變；SPM 為 SA 島內單元，NLP 在 LLM／DL 內，CV 為跨島路線與未來擴充）、Single World／Regional World 比較（推薦 Regional World）、兩區 Hex Layout 草案、CS／AI GLB 美術方向、共用 GLB 管線與預算、M3.1–M3.6 Roadmap；**沒有修改 3D 世界、GLB、課綱或路線資料**，待使用者批准決策。見 `docs/planning/M3_CS_AI_MASTER_PLAN.md`、`docs/planning/ARCHIPELAGO_GLB_ART_DIRECTION.md` |
| M3.1 Regional World 架構提案（2026-11-03） | Proposed（只有文件，待確認） | 三層世界（總覽 → 區域 → 島嶼）、以 `validateHexWorld` 驗證的兩區座標（0 問題、島間 ≥ 2 格水，PL 西移一格；港口與道路衝突待查）、導覽流程、`/world` feature flag 與五島首頁共存、鏡頭計算（區域總覽縮放約為現在首頁的一半）、GLB Scale／Anchor Contract、量測方案、M3.2 進入條件；**沒有修改程式、首頁或 GLB**。見 `docs/planning/M3_1_REGIONAL_WORLD_ARCHITECTURE.md` |
| 統一導覽系統與側欄（2026-11-12，分支 `trials/mvp`） | Implemented／Verified（自動化＋瀏覽器實測） | `/curriculum`、`/learn`、`/trials` 共用側欄（`src/components/nav/`，資料由 `src/lib/nav/` 從課程、實驗與題庫產生，不另存清單）：島嶼預覽卡（首頁 3D 地圖實際截圖 `public/images/islands/*.webp`，返回 `/?island=<id>`）、學習區域、島 → 難度 → 課程的 Accordion（記住展開狀態、不一次展開 80 堂、進度取自 localStorage 實際紀錄）；考試樹依 `family` 分組、只連到有試卷的考試；正式模擬考作答時為專注模式（只隱藏導覽，不動組卷／計分）。Breadcrumb 由路由與資料產生；首頁支援 `?island=`（沿用 explorer 既有受控選取，換島以 `replaceState` 不重建場景）。桌機 ≥1200 展開、1024–1199 預設圖示列、<1024 抽屜。真機未測 |
| 多群島架構 v2（2026-11-12，分支 `archipelago/v2`，worktree `logic-island-archipelago`） | Implemented／Verified（自動化＋瀏覽器實測） | 基底為公開線 `origin/trials/mvp`。P1a 驗證改為結構規則＋taxonomy contract＋路由契約快照；P1b 4 區域（cs、ai、design、web）、23 座學科島、431 堂（80 已開放、351 規劃中）、AI 三個導覽分組、路線 J；P2 側欄 World → Region → Island → Lesson、規劃中課程為停用列、`/curriculum` 四大群島與 AI 最小曝光、內容狀態與個人進度分開；P3 `/world` 清單列出 design／web（無 3D 地圖）與可行性文件；P4 實驗島 Lab Registry 與色彩與無障礙實驗室 `/learn/color-contrast`；P5 考試整合盤點（題庫未變）。見 `docs/planning/MULTI_ARCHIPELAGO_IA_V2.md` §10。R6（2026-11-12）四個區域總覽 `/regions/[region]` 與 AI 群島入口（首頁、側欄、麵包屑、課綱）。R1 發布安全盤點（leak-scan 乾淨）、R2a 修復 P1-11、R2b 淺色 `--muted` 達 WCAG AA、R3 整合驗收。真機未測；trials fixture E2E 需私人題庫，未執行 |
| M3.1 Regional World Prototype（2026-11-03） | Implemented／部分驗收（分支，flag 後；手機島寬未達標） | `/world`、`/world/cs`、`/world/ai`、`?island=`，只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 的 build 存在（否則 static 404）。<br>• **兩區 Layout**：Region Layout Validator 0 問題；DB–SA 港口移到 (4,−10)。<br>• **導覽**：三層導覽與 URL 同步（返回／前進／Esc／deep link）。<br>• **霧中小島**：明確標示「規劃中」。<br>• **GLB 契約**：只驗證，不建模。<br>• **P0–P5**：實測。<br>• **島寬**：桌機達標；**手機 CS 73／AI 85 px，低於 88（暫以 44 px 觸控區、清單與聚焦替代）**。<br>• **首頁**：首頁與受保護頁面不變（逐像素 0 差異）。<br>見 `logs/2026-11-03-m3-1-regional-world-prototype.md` |
| 學習進度（E.1） | Implemented（只在瀏覽器 localStorage） | `src/lib/progress.ts`；版本 1、備份與不覆寫新版；無帳號同步 |
| 後端／登入／OJ／伺服器端進度 | Not Started | 無對應 route／service／資料庫；程式練習沒有線上評測，不補猜產品計畫 |

## Phase 實作、驗證與批准分帳

| Phase | 檔案實況 | 驗證／人工批准 | 交接結論 |
|---|---|---|---|
| Phase 1 | 教材與播放器 Implemented | 本輪 45 passed／6 skipped；Java 與 Web E2E 未完成 | Partial；基礎邏輯已驗證，現有全站建置被後續原型阻擋 |
| Phase 2A | 三島 R3F 幾何原型 Implemented | 沒有對應 E2E；本輪 build／TS／lint 失敗 | Partial／Blocked，不標完成驗收 |
| Phase A | `LogicLab_Island_Pipeline_Validated.blend`＋`logiclab-test-island.glb` | 當日 GLB Validator 再驗證 0/0；歷史獨立 Three.js 成功 | Verified 技術管線；非正式美術 |
| Phase B | `LogicLab_3D_Art_Style_Guide.md`、`LogicLab_Basics_Island_Scene_Plan.md` | 兩文件存在且完整，後續模型依此製作 | Implemented（文件完成）；不表示所有模型與效能項目已達規格 |
| Phase C | `basics-v2/` 完整模型、渲染與 GLB | 使用者於對話給「有條件通過」；0/0 Validator，歷史 viewer 成功 | 製作完成候選；有人工條件，不等於 Phase D 授權 |
| Phase C.1 | **`basics-v2.1/` 實際已存在 BLEND、GLB、兩視圖、驗證與差異報告** | 本輪重新 Validator 0/0＋1 info；**2026-10-29 使用者正式批准 v2.1 為 Phase D 候選資產**（技術通過、視覺有條件接受） | Approved（有條件）；決議與後續美術項見 [ROADMAP](ROADMAP.md) |
| Phase D | D.0：runtime GLB、provenance、registry（`e4e7375`）；D.1：基礎程式島改用 GLB（`9c79937`）；D.2a：獨立的六角聚落預覽 `/islands/hex`（`063f0d4`）；D.2b 第一階段：預覽中的基礎程式島改用 GLB 建築（`c14e975`）；D.2b 第二階段：基礎程式島連續六角地形（方案 A2，`a63217d`）；島嶼尺度原型 `/islands/hex/scale/{19,37}`（`34276fe`）；37 格 Scale Refinement（`eeea613`）；37 格工坊入口道路（`fa3a9a9`）；D.2c-1 基礎程式島視覺改善試作（`f99f858`）；D.2c-2 渲染效能優化（commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」）；D.3-0 正式版安全網與效能基準（commit「safety net and rendering baseline for the world map (Phase D.3-0)」）；D.3-1 統一場景設定（commit「unify the world map data and scene presets (Phase D.3-1)」）；D.3-2 共用 Explorer（commit「shared hex world explorer with the production safety net (Phase D.3-2)」）；D.3-3 Preflight 候選頁 `/islands/candidate` 與回退頁 `/islands/legacy`（commit「candidate and rollback routes for the world map switch (Phase D.3-3 preflight)」）；D.3-5a 自由相機（Lab Only，`f719f42`）；D.3-5b Auto Orbit（Lab Only，`57364a2`）；D.3-6a 環境架構重構（只有中午，`63f972e`）；D.3-6b 四種時間情境（Lab Only，`90a0196`）；D.3-6c 傍晚暖光與手機標題（Lab Only，`0cfb146`）；D.3-5c／D.3-6d 候選頁整合（`250b99f`）；D.3-7a 候選頁手機 UI 修飾（`17f002e`）；D.3-4B 真機驗收準備（commit「real-device acceptance kit for the candidate world map (Phase D.3-4B preparation)」） | D.0 已驗收；D.1 工程整合已接受；D.2a 工程驗收通過；D.2b 第一階段技術驗收通過；第二階段 A2 視覺方向**未通過**，改做 19／37 格尺度原型；**2026-10-29 選定 37 格為優先基準**（19 格保留為參考），Scale Refinement 與工坊入口道路完成後 **D.2b 工程驗收通過**（`fa3a9a9`）。37 格的視覺美術未定案；D.2c-1 已試作（地表連續、中央廣場、主動線、地標構圖、鏡頭取景、沙灘與岩岸），**2026-10-30 視覺方向接受**；D.2c-2 渲染效能優化（靜態陰影貼圖、樹木 LOD、深海外框；四場景回到 D.2b 水準）**2026-10-30 驗收通過**；真機 GPU、觸控與 FPS 驗收留在 D.3；**2026-10-30 批准 D.3-0～D.3-2**（正式 `/islands` 不切換）；D.3-0～D.3-2 完成並接受；**2026-10-30 批准 D.3-3 Preflight**（正式 `/islands` 不變），已完成並有條件驗收通過（`72e3eb6`），**正式切換未批准**；**D.3-4 真機驗收準備已完成**（量測工具 `perf/device/`、驗收表 [DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)），2026-10-30 起 D.3-4 分為 **D.3-4A：Automated Acceptance Passed**（限已執行的自動化項目）與 **D.3-4B：Not Measured**（iPhone SE 第 3 代、iPhone 16、中階 Android）；iOS Safari／Screen Reader：Not Verified，**D.3-4 整體未判定**；B 不阻擋其他階段，正式切換仍需另行批准；**2026-10-30 批准 D.3-5／D.3-6 規劃（分階段）**，**D.3-5a 自由相機已完成並驗收接受**（`f719f42`），**D.3-5b Auto Orbit 已完成並驗收接受**（`57364a2`；都只在 37 格實驗室頁；候選頁、`/islands`、`/islands/legacy` 不變）；**D.3-6a 環境架構重構已完成**（光源、背景、陰影抽成環境資料與 `HexEnvironment`，只有中午；六條 `/islands` 路由與 `57364a2` 逐像素相同；效能判定 Inconclusive（輕微，P1-30））；**D.3-6b 四種時間情境已完成**（只在實驗室頁；清晨／中午／黃昏／傍晚與原生選單，中午與 `63f972e` 逐像素相同，切換不增加 draw call 或 shader，Level 2 驗收）；**D.3-6c 傍晚暖光與 Lab 收尾已完成**（黃昏／傍晚的燈塔與路燈燈籠暖光、手機標題不蓋燈塔；中午、清晨與 `90a0196` 逐像素相同），**D.3-5c／D.3-6d 候選頁整合已完成**（`/islands/candidate` 有自由相機、Auto Orbit 與四種時間情境，中午 3D 畫面與 `0cfb146` 逐像素相同，Level 3 驗收；正式 `/islands` 未切換），**D.3-7a 候選頁手機 UI 修飾已完成**（手機的提示與按鈕移到地圖下方一列、44 px 觸控目標；跳至主要內容的異常顯示查明為截圖 artifact，產品 CSS 不變；候選頁 3D 與 `250b99f` 逐像素相同，Level 2；與先前規劃的「D.3-7 清理」不同項目），**D.3-4B：Preparation Complete — Real Device Not Measured**（量測 proxy 擴充：裝置登記、候選頁的時間切換／自動旋轉／shader／三角形／context 遺失、28 項 Pass／Fail／Not Tested 檢查表、每台裝置的 JSON／文字報告；應用程式未修改；操作指南 [DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)；Real Device Passed／Failed 只能由審核依真機報告標示），D.3-4B 真機驗收與正式切換起未授權；其他兩島的遷移、後續美術擴充、D.3 未批准 | Partial；分支未 merge、未 push，見 [ROADMAP](ROADMAP.md) 與 [TESTING_STATUS](TESTING_STATUS.md) |
| Phase E | **E.1 課綱架構與學習引擎**（commit「60-lesson curriculum, lesson pages and progress (Phase E.1)」）：`src/content/curriculum/` 60 堂課綱（三島各 20）與驗證、`/curriculum` 目錄與 60 個課程頁、視覺化 registry、localStorage 進度；**完整教材 5 堂（F01～F05）、規劃中 55 堂**；**E.2（2026-10-31，三個本地 commit：batch A／B／C）基礎程式島 20／20 完整**（F06～F20 新增，共用 trace 視覺化：迴圈、陣列、函式呼叫、遞迴，另有複雜度示意模型與綜合挑戰分段；三語程式碼含 Java 全部執行通過），**E.3（2026-10-31，四個本地 commit：batch A `fa6a71b`／B `d09f593`／C `ffcf88b`／D `2f7ee0c`，另有文件 commit）資料結構島 20／20 完整**（D01～D20；`simulate.ts` 模擬器實際執行結構操作產生步驟，共用 trace 新增堆疊佇列、鏈結串列、雜湊桶、樹／森林 SVG＋文字大綱、圖（SVG＋鄰接串列＋矩陣）、並查集面板，另有範圍受限的「自己試試」與資料結構比較；全部三語程式碼執行通過）；**E.4（2026-10-31～11-01，四個 batch commit `2ad9116`／`4a7ca2d`／`1bf8abe`／`f2cf961` 與收尾 commit）演算法島 20／20 完整**（`simulate-algorithms.ts` 演算法模擬器，二分搜尋與氣泡排序沿用互動實驗引擎；排序步驟、遞迴樹、DP 表、貪心選擇；12 堂可用自己的輸入執行）。原規劃的島嶼 schema（GLB 引用、互動節點、解鎖條件、島嶼關聯）尚未實作 | E.1：ESLint／TS／Vitest／build 通過，C++／Python 範例與參考解答全部執行通過，**Java Not Executed（無 JDK）**，E2E 見 [TESTING_STATUS](TESTING_STATUS.md)；E.2 起未批准 | E.1～E.3 Implemented（分支未 merge、未 push）；見 `logs/2026-10-31-e1-curriculum.md`、`logs/2026-10-31-e2-foundations.md`、`logs/2026-10-31-e3-structures.md`、`logs/2026-10-31-e4-algorithms.md`、`logs/2026-11-02-e5-consolidation.md`（E.5 工作目錄整併：4 個功能 commit `a6bacfe`／`3632a75`／`b525608`／`b52b8e9`）、[課綱規格](../curriculum/PHASE_E_CURRICULUM.md) |
| Phase F | 2026-11-02 起為 Multi-Archipelago Expansion（[PHASE_F_ROADMAP](../planning/PHASE_F_ROADMAP.md)；舊的 RPG Learning System 改為 F.6）。**F.0 架構基礎 Implemented**（`1497718`／`5a33802`／`52b4d12`／`a7654d3`）：`src/content/world/` 的區域與島嶼 registry（15＋1 座）、完整前綴 Lesson ID、320 堂 catalog（60 complete＋260 planned metadata）、6 條學習路線、87 項活動 metadata、島嶼設定驗證與讀取 helper | 自動化驗證見 [TESTING_STATUS](TESTING_STATUS.md)；未經人工批准；沒有頁面讀取新 registry | F.0 Implemented；**F.1a Implemented**（資料庫應用島 DB01–DB05 與 SQL Playground，`ce8014c`（SQL runtime）、`57309b0`（DB01–DB02）、`375c664`（DB03–DB05）與 `a75e202`（延遲載入、文件））；**F.1b Implemented**（DB06–DB10、檢查敘述、ER 建構與正規化活動、課程能力宣告、島內導覽：`74724b6`、`59c5e8a`、`3792e86`、`b681ca2`、`21af909`、`6b0a3ec`、`9e6009e`）；**F.1c Implemented**（DB11–DB15、查詢計畫與交易時間軸活動、測試執行器修正：`ed4b211`、`581a88c`、`7a93078`、`300f824`、`df0e544`（bundle 修正）與文件 commit）；**F.1d Implemented**（DB16–DB20，資料庫應用島 20／20 完整：`3401857`、`cef3604`、`49a3bfb`、`808da33`、`c2e2c65`、`14911aa`、`cf0e820` 與文件 commit）；分支未 merge、未 push；F.1 其他島未開始、未授權；見 `logs/2026-11-02-f0-architecture-foundation.md`、`logs/2026-11-02-f1a-database-mvp.md`、`logs/2026-11-02-f1b-database-expansion.md`、`logs/2026-11-02-f1c-database-expansion.md`、`logs/2026-11-02-f1d-database-island-completion.md` |
| Phase G | APCS Challenges（試煉島、中央島、跨島任務、完成紀錄） | 無實作 | Planned；依賴 F，判題 adapter 預留自動判題擴充，首版方式待決 |
| Phase H | AI 群島課程規劃、知識依賴、AI-01～AI-06 島嶼設定、schema 擴充 | 無實作 | Proposed／Planned；依賴 E（任務整合需 F）；三項架構決議已定，見 ROADMAP |
| Phase I | 互動式 AI 實驗室、模型展示、資料視覺化、運算服務規劃 | 無實作 | Proposed／Planned；依賴 H，瀏覽器優先 |
| Phase J | AI 專題挑戰、跨島任務、學習成果展示 | 無實作 | Proposed／Planned；依賴 I、F，重用 G 判題格式 |

### C.1 不一致如何處理

> 2026-10-29 更新：此不一致已由使用者決議解除，v2.1 有條件批准為 Phase D 候選；以下段落保留為當時的處理紀錄。

不能把 `basics-v2.1/` 說成不存在或尚未完成製作，也不能用檔案存在推定人工批准。歷史對話包含 v2.1 Final Art Polish 的執行請求與回報；本次指示將其列為「尚未批准執行」。後者是**目前操作限制**，故下一個 Agent 應先呈交現存 v2.1 證據，請使用者決定「採用候選／補驗收／撤回」，不要重跑模型腳本或擅自進 D。檔案不會證明批准，對話也不能替代當前建置結果。

## Git 與工作目錄

- `.git` 不存在；`git rev-parse --show-toplevel`、`git status --short --branch`、`git log -1`、`git remote -v` 均回報 not a git repository。本輪未 init、checkout、reset、clean、commit、push。
- 分支／HEAD commit／remote／未提交變更／未追蹤檔案：**無法以 Git 定義核對**。不是「乾淨工作樹」，也不是把所有檔案虛稱 untracked。
- 本輪前後來源 SHA-256 對照在 `evidence/source-before.json`、`evidence/source-protection.json`；這只是檔案 checkpoint，不是 Git 歷史。
- `.gitignore` 只列 node_modules、.next、out、*.tsbuildinfo、.DS_Store、test-results、playwright-report。沒有 `.env*` 或大型資產策略；當前無 env 檔，不代表未來適合直接 add 全部。
- `.gitattributes` 不存在，未找到 Git LFS；正式 Blender／GLB 尚在 Codex 私有目錄，未移入專案；根目錄也沒有 public/。
- `.next` 約 298 MiB，包含舊 BUILD_ID 與沒有 `/islands` 的 prerender manifest。保留原樣，不能用來證明新原始碼可建置。
- 本輪只允許修改 `docs/handoff/` 與新增根 `CLAUDE.md`，原始程式、套件與資產均未修改。最後差異清單見 `evidence/source-protection.json`。

## README 的時效

`README.md` 的 2026-10-28 lint/build 通過、45 passed／6 skipped 與後續 Phase 2 尚未開始，是較早的階段紀錄；原始碼已出現 `/islands`，且本輪 lint／TS／build 失敗。保留 README 不改寫歷史，以本交接證據作目前狀態。不將歷史的瀏覽器權限拒絕推定成今天仍有相同政策；本輪 Web E2E 因 build 阻擋未啟動。
