# Logic Island 開發路線圖

> 更新日期：2026-10-29，Asia/Taipei。本文件只記錄規劃；**Proposed／Planned 不等於已批准實作**，每個 Phase 開始前都需要當次明確授權。

## 產品方向

2026-10-29 調整為「**程式設計、資料結構、演算法與人工智慧的互動式學習世界**」。現有產品仍只實作程式與演算法教材；AI 部分為 Phase H–J 規劃。

## 階段編號說明

專案有兩套既有編號，新階段沿用字母序列，避免衝突：

- **數字序列（產品前端）**：Phase 1（六教材＋播放器）、Phase 1.1（驗收與配色）、Phase 2A（三島 R3F 原創幾何原型）。README 中的「Phase 2 建議」屬於此序列的舊紀錄。
- **字母序列（3D 資產與後續功能）**：Phase A–C.1 為 Blender 資產管線，Phase D 為正式 GLB 整合；E／F／G（程式學習延伸）與 H／I／J（AI 教學）接續此序列。

不使用 Phase 3、4 等數字，也不重用 A–D。Phase I 指大寫字母 i，不是數字 1。

## 雙群島架構

Logic Islands（邏輯群島）是整個 3D 世界，規劃分成兩個群島，**共用同一套 R3F 場景、鏡頭、asset registry、Phase E schema 與 Phase F 進度系統**，不建立第二套 3D 引擎或地圖：

| 群島 | 內容 | 語言 | 相關 Phase |
|---|---|---|---|
| Coding Archipelago | 八座程式與演算法島（目前已定義 `foundations`／`structures`／`algorithms` 三座，其餘五座待規劃），加上 G 的 APCS 試煉島與中央島 | C++、Python、Java（維持現狀） | D、E、F、G |
| AI Archipelago（AI 群島） | 六座 AI 主題島 AI-01～AI-06（見 Phase H） | Python 為主要實驗語言 | H、I、J |

兩個群島在資料上只是 schema 的分組欄位（例如 `archipelago`），不是兩份程式碼。

## 階段總覽

| Phase | 名稱 | 狀態 | 前置條件 |
|---|---|---|---|
| 1／1.1 | 六教材、共用播放器、純快照引擎 | Implemented；Java 範例與 Web E2E 未驗證 | — |
| 2A | 三島 R3F 原創幾何原型（`/islands`） | Implemented；lint／TS／build 已通過，尚無 islands E2E | Phase 1 |
| A–C | Blender 資產管線、Style Guide、基礎島 v2 | 完成；v2 人工有條件通過 | — |
| C.1 | 基礎島 v2.1 最終微調 | **2026-10-29 人工批准為 Phase D 候選資產**：技術驗收通過，視覺有條件接受 | Phase C |
| D | 正式 GLB 整合（僅基礎程式島）＋六角聚落視覺重設計 | **進行中**：D.0 已驗收；D.1 工程整合已接受；D.2a 工程驗收通過；D.2b 第一階段（只有基礎程式島）試作完成待驗收；D.2b 後續、D.2c、D.3 未批准（分支 `phase-d/basics-glb`） | C.1 |
| E | Data-Driven Islands | **Planned** | D 完成驗收 |
| F | RPG Learning System | **Planned** | E |
| G | APCS Challenges | **Planned** | F |
| H | AI 群島課程規劃、知識依賴、島嶼設定與 schema 擴充 | **Proposed／Planned** | E（島嶼 schema）；任務／進度整合需 F |
| I | 互動式 AI 實驗室、模型展示、資料視覺化與運算服務規劃 | **Proposed／Planned** | H |
| J | AI 專題挑戰、跨島任務、學習成果展示 | **Proposed／Planned** | I、F；判題格式沿用 G |

依賴關係：

```
C.1 → D → E → F → G          （Coding Archipelago）
          E → H → I → J      （AI Archipelago）
              F ─────→ J
                  G ─→ J   （題目格式／判題 adapter）
```

- H 不依賴 G，也**不以完成全部八座 Coding 島為前提**；先修條件依個別 AI 課程設定（以 E 的宣告式解鎖條件表示、由 F 判定）。
- J 的跨島任務可以引用 Coding 島的課程，但只是個別任務的條件，不是整個 AI 群島的門檻。
- J 依賴 G 只是重用題目格式與判題 adapter；若 J 早於 G 開始，需先把這部分抽成共用規格，不能各做一套。

### C.1 驗收決議（2026-10-29）

1. v2.1 技術驗收通過，視覺品質有條件接受；不需立即製作 v2.2。
2. 保留 v2 與 v2.1 原始 BLEND、GLB 及驗證紀錄（保全庫 `/Users/vincelo/dev-hub/assets/logic-island/`）。
3. 屋頂比例、峽谷細節與地形改善列為後續美術工作（不屬於 D）。
4. 手機文字辨識優先由 HTML UI 解決，不增加 GLB 幾何文字。
5. 正式發布的 GLB 不得包含 `blendermcp_server_running` 執行旗標。
6. 保持既有 interaction_id、Anchor、Node Contract 相容。
7. 以獨立資產版本資訊追蹤 v2.1，不依賴舊 `asset_id`（仍為 `logiclab-basics-island-v2`）判斷版本。

## Phase D — 正式 3D 資產整合（分階段批准）

> 2026-10-29 視覺方向調整：D.1 工程整合被接受，但三座分離浮島不符產品構想。目標改為六角地塊組成、以橋樑與道路相連的聚落世界，採方案 A＋（程式生成六角地塊，重用 GLB 建築，日後可換成 Blender 六角組件）。原 D.2 拆成三段，各自批准：
>
> - **D.2a（已完成，待確認視覺方向）**：獨立的六角聚落預覽 `/islands/hex`。axial (q, r)、flat-top，三座 7 格聚落、兩座橋與道路、等距鏡頭；不拆 GLB 建築，也不動 `/islands`。
> - **D.2b 第一階段（有條件批准，試作完成待驗收）**：只在 `/islands/hex` 的基礎程式島，把 GLB 的工坊、燈塔、碼頭與樹木以各自的局部座標放上指定地塊，Anchor 改成相對建築 pivot，互動與 fallback 沿用 D.1。資料結構島、演算法島尚未遷移。
> - **D.2b 第二階段（方案 A2，完成待確認視覺）**：基礎程式島改為 8 格連續地形，地形由純函式產生，包含海岸崖、高低差崖壁、道路坡道；配色採 GLB 粉彩；工坊跨兩格；碼頭改為低岸；手機全景改用圓點名牌。
> - **島嶼尺度與世界構圖原型（2026-10-29，等待選定）**：使用者審查後判定 A2 視覺方向未通過，原因是島太小、缺乏自然環境、海洋像地板、標籤遮擋。已在 `/islands/hex/scale/19` 與 `/37` 比較兩種尺度：森林與岩石、連續水面、精簡標記、三角形世界構圖。見 `logs/2026-10-29-island-scale-prototype.md`。使用者選定 **37 格為優先設計基準**，19 格保留為參考；接著完成 Scale Refinement（手機碼頭可點、HTML 地點入口、道路與橋樑合併後 draw call 241 → 80），等待正式定案，見 `logs/2026-10-29-d2b-scale-refinement.md`。D.2b 最後一項修正「工坊入口道路」已完成：工坊移到 (1, 0)＋(2, 0)，道路由廣場經草地筆直進入門前兩根門廊柱之間，見 `logs/2026-10-29-d2b-workshop-road.md`；等待確認整體視覺方向。
> - **D.2b 工程驗收通過（2026-10-29，`fa3a9a9`）**：37 格作為後續開發的技術基準，視覺美術尚未定案。
> - **D.2c-1 基礎程式島視覺改善試作（2026-10-29 試作；2026-10-30 視覺方向接受，`f99f858`）**：依使用者調整的優先順序，先處理世界構圖與視覺層級：同高地表連續、圓形中央廣場與導覽柱、碼頭 → 廣場 → 燈塔主動線、工坊與燈塔的前庭／平台、群聚森林、依島嶼輪廓取景、名牌移到島外；另有沙灘、岩岸與漸層海面。未加零散裝飾、未改光照。見 `logs/2026-10-29-d2c1-composition.md`。
> - **D.2c-1 視覺方向接受（2026-10-30）**：中央廣場、道路動線、自然海岸、森林群聚與島嶼輪廓接受；不批准其他島嶼遷移或後續美術擴充。
> - **D.2c-2 Rendering Performance Optimization（2026-10-30 驗收通過，獨立 commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」）**：只改 37 格原型的渲染方式，構圖與資料不變。靜態陰影貼圖（只在投影物件改變時重畫）、全景時的樹木 LOD（由 GLB 自己的樹即時產生，陰影仍來自完整的樹）、深海平面改成海面外框。SwiftShader 四場景 FPS 為 D.2b 的 105～116%；聚焦畫面與 D.2c-1 逐像素相同。見 `logs/2026-10-30-d2c2-performance.md`。技術限制見 KNOWN_ISSUES P1-23（靜態陰影只適用靜態場景）、P1-24（LOD 門檻改由場景設定）、P1-25（真機驗收留在 D.3）。
> - **D.3 整合（2026-10-30 批准 D.3-0～D.3-2）**：先補正式版的安全網並建立可重現的效能基準（D.3-0），再統一場景設定（D.3-1）與 Explorer（D.3-2）；正式 `/islands` 暫不切換。**D.3-0～D.3-2 已完成**（安全網與基準、場景 preset、共用 Explorer）。**D.3-3 Preflight 已完成**（2026-10-30 批准）：隱藏的候選頁 `/islands/candidate`（切換後的 `/islands`：正式 preset、正式文案、hover、手機單行工具列）與回退頁 `/islands/legacy`（目前 `/islands` 本身）；正式 `/islands` 不變，見 `logs/2026-10-30-d3-3-preflight.md`。D.3-3 Preflight 有條件驗收通過（`72e3eb6`），正式切換未批准。**D.3-4 真機驗收準備已完成**（Mac 上的量測 proxy `perf/device/`、驗收表 `docs/handoff/DEVICE_ACCEPTANCE.md`、`logs/2026-10-30-d3-4-prep.md`），D.3-4 分為 D.3-4A 自動化驗收（Automated Acceptance Passed，限已執行項目：360／390 px 溢出、鍵盤、無障礙名稱等）與 D.3-4B 真機效能驗收（標準測試機 iPhone SE 第 3 代、iPhone 16、中階 Android；Not Measured）；iOS Safari／Screen Reader Not Verified，D.3-4 整體未判定；B 不阻擋其他開發階段。D.3-3 正式切換、D.3-4 真機執行與判定、D.3-7 清理（移除舊渲染器與原型路由；先前文件稱「D.3-5 清理」，2026-10-30 因編號衝突改名，舊紀錄不改）都需另行批准，切換風險見 `logs/2026-10-30-d3-2-shared-explorer.md` §6。見 `logs/2026-10-30-d3-integration-analysis.md`、`logs/2026-10-30-d3-0-baseline.md`。
> - **D.3-5 Camera Controls／D.3-6 Time-of-Day（2026-10-30 批准規劃，分階段實作）**：規劃與核實後的修正見 `logs/2026-10-30-d3-5-d3-6-analysis.md`。已決定：手機方案 B（單指水平旋轉、垂直捲頁、雙指縮放、仰角固定）、桌機左鍵拖曳旋轉與滾輪直接縮放、傍晚約 40° 月光、Reduced Motion 不自動旋轉但可手動開啟、D.3-4B 在候選頁功能整合後與正式切換前執行。工作項目：D.3-5a 自由相機（Lab Only）→ D.3-5b Auto Orbit → D.3-5c 推進候選頁；D.3-6a 環境抽出 → D.3-6b 四情境與 UI → D.3-6c 傍晚燈光與推進。**D.3-5a 已完成並驗收接受**（`f719f42`，只在 `/islands/hex/scale/37`，見 `logs/2026-10-30-d3-5a-free-camera.md`）；**D.3-5b Auto Orbit 已完成並驗收接受**（`57364a2`，同樣只在實驗室頁，見 `logs/2026-10-30-d3-5b-auto-orbit.md`）；**D.3-6a 環境架構重構已完成**（光源、背景、陰影抽成 `src/lib/islands/environments.ts` 的資料與 `HexEnvironment`；只有中午，每條路由與 `57364a2` 逐像素相同；霧只定義不啟用；GLB 發光材質改為每次掛載自己的複本；效能判定 Inconclusive（輕微，KNOWN_ISSUES P1-30）；見 `logs/2026-10-31-d3-6a-environment.md`）；其餘項目、候選頁與正式 `/islands` 都未授權。
> - **D.2c 後續（未批准）**：其他島嶼的美術、光照。
>
> 分析紀錄見 `logs/2026-10-29-hex-world-analysis.md`。中央島、APCS 島、AI 島與解鎖判定仍屬 E～J。

範圍只有一件事：把基礎程式島的渲染來源由原創幾何換成 v2.1 runtime GLB，其餘兩島、地圖、教材與引擎不變。重點：

- runtime GLB 為清理 metadata 後的衍生檔（BIN chunk 不變），放 `public/`，檔名帶版本；provenance 記錄來源與輸出 SHA。
- registry 擴充 `glb` 來源型別並記錄版本、SHA、縮放；載入失敗或 WebGL 不可用時回退原創幾何與清單導航。
- 互動由 `userData.interaction_id` 向上解析；手機文字以 Anchor 上的 HTML 標籤提供。
- 驗收門檻見 [NEXT_STEPS §5](NEXT_STEPS.md)。

**D 不包含**：資料驅動島嶼 schema、解鎖、進度、NPC、任務、EXP、題目或任何 RPG／挑戰系統。

## Phase E — Data-Driven Islands（Planned）

目標：每座島以同一份型別化 schema 定義，Coding 與 AI 兩個群島的所有島嶼共用同一套渲染與互動架構，新增島嶼不需改 R3F 元件。

### Schema 內容

| 欄位 | 說明 | 與現況的關係 |
|---|---|---|
| `island_id` | 穩定識別碼 | 沿用現有 `IslandDefinition.id`（`foundations`／`structures`／`algorithms`），不改名 |
| 名稱、描述、主題 | 中文名、英文名、描述、主題色、地標 | 由現有 `name`／`englishName`／`description`／`accent`／`landmark` 演進 |
| GLB 資產引用 | 以 registry key＋版本引用，不寫死 URL | 沿用 Phase D 的 asset registry；無 GLB 的島可用原創幾何 |
| 教材與課程對應 | 引用 `src/content/courses.ts` 的 slug | 沿用 `courseSlugs`；BFS 目前未對應任何島，E 需補上歸屬 |
| 互動節點與入口 | `interaction_id` → 行為（路由、說明、任務入口） | **必須相容** GLB extras 的 `interaction_id`、`role`、四個 Anchor 與 Node Contract；schema 只引用，不重新命名節點 |
| 解鎖條件 | 宣告式條件（例如「完成某教材」） | E 只定義資料格式；條件的**判定**屬於 Phase F 進度層 |
| 島嶼關聯 | 島與島之間的連結／航線 | 可對應 GLB 的 `Anchor_Route_Exit`；用於地圖連線與解鎖順序 |
| 所屬群島 | `coding`／`ai` 分組 | E 預留欄位、H 擴充 AI 島欄位；現有三島歸 `coding`，不影響既有 `id` |

### 架構原則

- 以 TypeScript 模組＋`satisfies` 型別檢查為主，必要時再輸出 JSON；不為此引入新的 schema 套件，除非另行批准。
- 場景的 12 個模組（地形、海洋、高低差、植被、建築、道路、橋樑、地標、NPC、任務點、特效、互動）規劃為本 schema 的 `scene` 區塊，不另立第二套 schema，見 [SCENE_MODULES](SCENE_MODULES.md)（規劃，未批准）。
- 位置與邊界由資料計算（延續 `getWorldBounds`／`getFocusBounds`），鏡頭與渲染元件不依島數改寫。
- 每座島的 schema 需有單元測試：課程 slug 存在、interaction_id 能在對應 GLB 中找到、關聯不指向不存在的島。
- 目前只有三座島有定義；其餘島嶼的名稱與主題待產品規劃，不在 E 中預先虛構內容。

## Phase F — RPG Learning System（Planned）

規劃項目：

- NPC 與任務對話
- 答題獲得 EXP
- 玩家等級與學習進度
- 島嶼徽章與成就
- 課程任務與解鎖機制（判定 Phase E 宣告的解鎖條件）

### 架構原則：進度層與 3D 渲染層分離

- 進度、EXP、等級、徽章、任務狀態放在獨立的純資料／領域層（不 import three、R3F 或場景元件），可單獨單元測試。
- 3D 層只接收唯讀的衍生結果（例如「已解鎖島嶼清單」「徽章旗標」），不直接讀寫進度儲存。
- 持久化以 adapter 隔離：可先用瀏覽器儲存，日後再換後端；現況**沒有**登入、API、資料庫，任何後端都需另案批准。
- 對話與任務內容和教材 `courses.ts` 分開管理，不修改既有教材與演算法引擎輸出。

### 待決事項

- 題目來源與題庫格式（README 目前明列「不包含題庫」，需產品決定）。
- 無登入時進度只存在單一瀏覽器，是否可接受。

## Phase G — APCS Challenges（Planned）

規劃項目：

- APCS 試煉島
- 中央島綜合挑戰
- 跨島學習任務
- 題目完成紀錄
- 成就與進階內容解鎖

### 架構原則

- 試煉島與中央島以 Phase E schema 新增，不另建一套地圖或渲染流程。
- 完成紀錄與成就沿用 Phase F 進度層；3D 層只顯示解鎖結果。
- 題目採原創內容，不轉載 APCS 歷屆試題原文。

- **保留自動判題擴充能力**：判題以 adapter 介面隔離（輸入題目＋作答，輸出結果），題目格式預留測資、語言、時間／記憶體限制等欄位；完成紀錄只存結果，不綁定判題方式。初期可以用選擇／填空或前端檢查，日後換成程式碼自動判題系統時，不需改題目資料、進度層或 3D 層。

### 待決事項

- 初期判題方式：現況「網站不會遠端執行程式碼」，也不含 OJ。G 需決定首版採選擇／填空題或前端檢查；程式碼自動判題後端（沙箱執行、資源限制、濫用防護）需另案批准。
- 中央島與試煉島的美術資產需走 Blender 管線（比照 A–C.1 的驗收與保全流程）。

## Phase H — AI 群島課程規劃與 Schema 擴充（Proposed／Planned，未批准）

範圍：AI 群島的課程規劃、知識依賴、島嶼設定與 schema 擴充。只產出資料定義、課程大綱與測試，不做實驗室與挑戰。

### 架構決議（2026-10-29）

1. **Python 基礎教材歸屬 Coding Archipelago**。AI 課程可把其中的必要單元列為先修條件，不要求完成整座 Coding 島。
2. **AI 島嶼程式識別 ID 統一使用小寫 kebab-case**（與現有 `foundations` 等 id 慣例一致）；AI-01～AI-06 只是文件顯示編號，不出現在程式識別碼中。實際 id 字串在 H 開始時定案。
3. **AI 教材採獨立內容模組**，但必須共用既有課程型別、播放器（`lab.tsx`）及進度介面（Phase F），不建立第二套教學系統；`courses.ts` 既有六教材不因此改寫。

### 六座 AI 島（規劃草案）

| 顯示編號 | 主題 | 課程目標 | 先修知識 | 互動實驗（交 Phase I） | 任務 | 完成條件 |
|---|---|---|---|---|---|---|
| AI-01 | Machine Learning | 理解監督／非監督學習、訓練／驗證／測試切分、過擬合與評估指標 | Python 基礎、陣列與迴圈；基礎統計 | 線性迴歸梯度下降、決策樹切分、k-means 分群、混淆矩陣 | 調整超參數讓驗證準確率達標；判斷過擬合 | 完成核心單元與島嶼任務，指標題正確 |
| AI-02 | Deep Learning | 理解神經元、前向／反向傳播、損失與最佳化、CNN／RNN 基本結構 | AI-01；矩陣運算概念 | 小型 MLP 訓練過程、激活函數比較、卷積核視覺化 | 設計網路層數／學習率讓損失收斂 | 完成核心單元，能解釋訓練曲線 |
| AI-03 | Generative AI、LLM、Agentic AI | 理解 token、embedding、注意力、提示設計、RAG 與 Agent 工具呼叫流程 | AI-02（概念層級即可）；字串與資料結構基礎 | tokenizer 切分、注意力權重示意、RAG 檢索流程、Agent 步驟追蹤（模擬資料） | 排出 Agent 工作流程、找出提示錯誤 | 完成核心單元與流程任務 |
| AI-04 | Data Science、Data Analysis、Data Mining、Visualization | 資料清理、探索式分析、關聯規則與視覺化選擇 | Python 基礎；排序與搜尋概念 | 資料清理步驟、分組統計、關聯規則、圖表類型比較 | 從資料集回答指定問題並選對圖表 | 完成分析任務，結論與資料一致 |
| AI-05 | Computer Vision、OpenCV、AOI、人臉辨識、智慧監控、智慧交通 | 影像表示、濾波、邊緣偵測、特徵與物件偵測、AOI 瑕疵檢測流程 | Python 基礎、二維陣列；建議 AI-01 | 卷積濾波、Canny 邊緣、閾值分割、AOI 瑕疵標記、車流計數示意 | 調參數讓瑕疵被正確標出 | 完成影像處理任務；人臉相關單元需通過隱私說明 |
| AI-06 | AIoT、Edge Computing、Edge AI、智慧家庭 | 感測資料流程、邊緣與雲端分工、模型輕量化與延遲取捨 | Python 基礎；建議 AI-01 | 感測資料模擬、量化前後準確率／延遲比較、智慧家庭規則流程 | 為情境選擇邊緣或雲端推論 | 完成情境任務，取捨理由正確 |

上表為規劃草案，具體單元數、題目與門檻在 H 開始時由產品確認。

### 知識依賴

```
Python 基礎（Coding 必要單元） → AI-01 → AI-02 → AI-03
                                 └→ AI-04
                                 AI-01 ─(建議)→ AI-05、AI-06
```

- 「Python 基礎」目前沒有對應教材（六教材是資料結構與演算法）；依決議 1 歸屬 Coding Archipelago，AI 課程只引用其中的必要單元。
- AI 群島**不以完成全部八座 Coding 島為前提**；每門課以 Phase E 的宣告式解鎖條件列出自己的先修（可指向 Coding 島的特定教材），由 Phase F 判定。
- 「建議」先修只提示、不鎖定；「必要」先修才阻擋。兩者在 schema 中分開表示。

### Schema 擴充

- 沿用 Phase E schema，加上 `archipelago: 'ai'`；island_id 依決議 2 使用小寫 kebab-case，`AI-01`～`AI-06` 只作顯示編號欄位。
- 每座島需填：課程目標、先修（必要／建議）、互動實驗引用（I 的實驗 id）、任務引用（F 的任務 id）、完成條件。
- 單元測試：先修無循環、引用的 Coding 教材 slug 存在、實驗與任務 id 存在。

### 架構原則

- 沿用 Phase E 資料驅動島嶼系統，同一套 R3F 渲染、鏡頭、互動與 fallback；**不建立第二套 3D 引擎**。
- 沿用 Phase F 的 EXP、任務、徽章與進度管理，AI 島不另建進度系統。
- AI 課程以 Python 為主要實驗語言；既有六教材與 C++／Python／Java 範例維持不變，不改 `courses.ts` 既有內容與 `engine.ts` 輸出。
- AI 教材放獨立內容模組，共用既有課程型別、播放器與進度介面（決議 3）。
- AI 島美術資產走 Blender 管線（比照 A–C.1 驗收與保全流程），不修改現有 GLB。

## Phase I — 互動式 AI 實驗室與運算服務規劃（Proposed／Planned，未批准）

範圍：互動實驗室、模型展示、資料視覺化，以及運算服務的評估。

### 架構原則

- **瀏覽器優先**：先規劃可在瀏覽器內完成的互動實驗，依序考慮：
  1. 預先計算的步驟快照（延續 `engine.ts` 純快照模式，零執行環境風險）；
  2. 瀏覽器端計算（JS 實作小型演算法、WebAssembly Python、瀏覽器推論函式庫），每個新增套件需另案批准；
  3. 進階模型運算（較大模型訓練、LLM 呼叫）另外評估後端服務，不在 I 預設建立。
- 實驗室從島嶼節點進入，與 3D 場景分離；2D 視覺化與 3D 場景不共用狀態。
- 範例程式以 Python 呈現；資料集採可公開授權或自行產生的資料。
- 實驗結果交給 Phase F 進度層記錄，實驗元件不直接寫入進度儲存。

### 運算服務評估項目

- 執行環境：前端計算的效能上限（手機）、WebAssembly 與模型檔的下載大小。
- 後端（若需要）：沙箱、資源限制、費用、濫用防護；與 Phase G 程式碼自動判題後端是否共用。
- 外部 LLM API：金鑰管理、費用上限、內容安全；預設以模擬資料展示。
- 相機／感測器（AI-05、AI-06）：權限、隱私與不上傳原則。

## Phase J — AI 專題挑戰與成果展示（Proposed／Planned，未批准）

規劃項目：

- AI 專題挑戰
- 跨島任務（AI 島之間，或 AI 島與 Coding 島之間）
- 學習成果與作品展示

### 架構原則

- 挑戰與跨島任務沿用 Phase F 進度層；題目格式與判題 adapter 沿用 Phase G，不另建。
- 跨島任務可引用 Coding 島課程，但只是單一任務的條件，不是整個 AI 群島的門檻。
- 作品展示先限學習者自己可見；公開分享需要登入、儲存與內容審核，屬另案批准。

## 不變的技術基礎

- Next.js（App Router）＋ React Three Fiber ＋ Blender GLB 管線維持不變。
- 教材真實來源 `src/content/courses.ts`、純快照引擎 `src/lib/engine.ts`、共用播放器 `src/components/lab.tsx` 不因 E–J 改寫。
- Phase D 範圍不因 E–J 擴大；E–J 的任何部分都不得在 D 中提前實作。
- 原始 BLEND／GLB 只在保全庫，runtime 只使用衍生並記錄 SHA 的 GLB。
- 每個 Phase 的 commit、push、部署各自需要授權。
