# M3 資訊科學＋人工智慧群島世界規劃（M3.0 Master Plan）

> 2026-11-03，M3.0「規劃與文件」。**只是規劃**：沒有修改 3D 世界、GLB、課綱 ID／slug／進度 key、Theme、受保護的原型路由，也沒有開始 Blender 建模。
> 本文件是 [WORLD_EXPANSION_ARCHITECTURE](WORLD_EXPANSION_ARCHITECTURE.md) §5 的 M3／M4 細化，取代其中「M3 CS 區域地圖、M4 世界總覽＋AI 區域」的粗略分法，改為 M3.0–M3.6。
> 數量與島嶼邊界仍以 [ISLAND_TAXONOMY](ISLAND_TAXONOMY.md) 為唯一來源；美術與 GLB 管線見 [ARCHIPELAGO_GLB_ART_DIRECTION](ARCHIPELAGO_GLB_ART_DIRECTION.md)。

> **2026-11-03 使用者有條件批准**（見 §10 決策紀錄）。M3.1 的架構提案見 [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md)。

標示：**Existing Blueprint**＝已在 [CURRICULUM_320_BLUEPRINT](CURRICULUM_320_BLUEPRINT.md) 與 world registry 中；**Proposed Extension**＝本文件提出、不在 320 堂內；**Needs Approval**＝需要使用者批准才能進入任何實作。

## 1. 盤點（2026-11-03）

| 項目 | 實況 | 證據 |
|---|---|---|
| Git | `phase-d/basics-glb` @ `c560142`；未 push | `git log` |
| 其他 Session | Theme Session 的 5 個未提交檔案（`globals.css`、`layout.tsx`、`curriculum.module.css`、`islands.module.css`、`site-time.ts`）與 `.claude/`；本次不碰，MD5 與 F.1e（原稱 F.2）開始時相同 | `git status`、MD5 |
| 學科島 | 15 座（CS 8、AI 7）＋互動實驗島（工具島） | `src/content/world/islands.ts`、ISLAND_TAXONOMY §1 |
| 課程 | 320 堂藍圖；完整 **80** 堂（F、D、A、DB 各 20），規劃 240 | `docs/planning/data/curriculum-blueprint.json`、registry |
| 學習路線 | 6 條（A–F） | `docs/planning/data/learning-paths.json`、`src/content/world/paths.ts` |
| World Registry | **只有一套**：`src/content/world/`（regions `cs`／`ai`，16 座島，`links` 宣告橋）；3D 程式不讀 registry，由測試保證首頁的橋與 registry 一致 | `tests/world-config.test.ts` |
| Curriculum Registry | `src/content/curriculum/`（已寫好的 80 堂）＋ `src/content/world/catalog.ts`（規劃中的課） | — |
| Hex World | 首頁 `islandsHomeWorld`：5 座島（F (0,0)、DS (8,−8)、AL (10,−2)、DB (2,−9)、實驗島 (3,5)），4 座橋；`/islands/candidate`、scale/37 用 `islandsWorld`（3 島，有指紋測試） | `src/lib/islands/islands-world.ts` |
| 首頁效能 | 總覽 66 draw call、桌機 49,113／手機 36,923 三角形（SwiftShader，F.1e 量測）；真機 **Not Measured** | `logs/2026-11-02-f2-database-island-world.md` |
| GLB | 只有 `basics-island.v2.1.glb`（9,800 tri、46 節點、2 材質、24 draw call、880 KB，比例 0.6）；其他 4 座島是程式產生的 Transitional Art | `src/lib/islands/asset-registry.ts`、`docs/assets/` |
| GLB 管線 | Blender 5.2.2 LTS → glTF（`KHR_materials_emissive_strength`）→ `scripts/assets/derive-runtime-glb.mjs`（只移除 `blendermcp*` extras）→ provenance／validation／node-contract JSON → `asset-registry.ts`（sha256、bytes、root、scale、fallback、nodes）→ 測試 | `docs/assets/*.json`、`tests/islands-glb*.test.ts` |
| M3 Roadmap | WORLD_EXPANSION §5 的 M3／M4 只有一行；F.1e（原稱 F.2）已把首頁改為 5 島，M3 需重新規劃 DB 島的位置 | PHASE_F_ROADMAP F.1e 註記 |

## 2. Computer Science 七大領域對照

你列的七個代碼與既有 registry 的對應。既有 CS 區域是 **8 座**：七個代碼中的 6 個各對應一座島，SPM 沒有獨立島；另外兩座是你沒有列出、但已完成的基礎程式島（F）與演算法島（AL）。

| 代碼 | 領域 | 對應的島（`islandId`） | Lesson ID | 現況 | 分類 | 標示 |
|---|---|---|---|---|---|---|
| DB | Database Systems | 資料庫應用島 `databases` | DB01–DB20 | **Complete**，首頁第 5 島（Transitional Art） | A 獨立島 | Existing Blueprint |
| DS | Data Structures | 資料結構島 `structures` | **D01–D20**（顯示代碼 DS，ID 前綴是 `D`，不改） | **Complete** | A 獨立島 | Existing Blueprint |
| PL | Programming Languages | 程式語言島 `programming-languages` | PL01–PL20 | Planned | A 獨立島 | Existing Blueprint |
| SA | Systems Analysis | 系統分析與設計島 `systems-analysis` | SA01–SA20 | Planned | A 獨立島 | Existing Blueprint |
| CN | Computer Networks | 計算機網路島 `networks` | CN01–CN20 | Planned | A 獨立島 | Existing Blueprint |
| **SPM** | Software Project Management | **沒有獨立島**：SA02（方法論）、SA17（專案規劃、估算與風險）、SA18（版本管理與上線）、SA19（維護與演進）＋ MIS17（IT 專案組合與投資評估） | — | Planned（在 SA／MIS 內） | **B 島內單元**＋C 跨島路線 | Existing Blueprint（單元）；獨立島是 Proposed Extension／Needs Approval |
| MIS | Management Information Systems | 管理資訊系統島 `information-systems` | MIS01–MIS20 | Planned | A 獨立島 | Existing Blueprint |
| （F） | Programming Fundamentals | 基礎程式島 `foundations` | F01–F20 | **Complete**，GLB v2.1 | A | Existing Blueprint |
| （AL） | Algorithms | 演算法島 `algorithms` | A01–A20 | **Complete** | A | Existing Blueprint |

### PL 是否與基礎程式島重複

**不重複，PL 是獨立的程式語言原理島**。逐堂比對藍圖：

- F 教「怎麼寫」：變數、條件、迴圈、陣列、函式、作用域、遞迴、複雜度，四語對照。F 沒有物件導向、型別系統、記憶體模型、語法分析、編譯、GC 或並行。
- PL 教「為什麼這樣設計、底下怎麼運作」：典範、OOP、函數式、型別系統、泛型、閉包、堆疊／堆積、GC、錯誤模型、詞法與語法分析、直譯器、並行與非同步、IR、VM／JIT、反射、語言設計，最後打造迷你語言（PL20）。
- 唯一的交界是作用域：F15「變數作用域」教區域與全域，PL06「名稱綁定、作用域鏈與閉包」以 F15 為先修往下延伸。寫 PL06 時只能引用 F15，不能重教。

### SPM 的處置（建議）

- **建議 B（島內單元）**：在系統分析與設計島內，把 SA02、SA17、SA18、SA19 標為「軟體專案管理」單元，與 MIS17 以跨島連結相接。不增加課數，也不改 ID。
- 地圖上以 SA 島的「專案指揮所」地標呈現（見 ARCHIPELAGO_GLB_ART_DIRECTION §3）。
- 如果要獨立成第 16 座學科島：320 堂與每區 160 堂的驗證都要改，屬 **Proposed Extension／Needs Approval**。

## 3. Artificial Intelligence 領域對照

| 候選主題 | 既有的島與課（藍圖） | 分類 | 標示 |
|---|---|---|---|
| AI Foundations | AI 基礎島 `ai-foundations` AIF01–AIF20（代理人、搜尋、CSP、邏輯、機率、貝氏網路、HMM、MDP、負責任 AI） | **A 獨立島** | Existing Blueprint |
| Machine Learning | 機器學習島 `machine-learning` ML01–ML25 | **A 獨立島** | Existing Blueprint |
| Deep Learning | 深度學習島 `deep-learning` DL01–DL25 | **A 獨立島** | Existing Blueprint |
| Natural Language Processing | **沒有獨立島**。NLP 的核心散在兩座島：<br>• 大型語言模型島 LLM01–LLM08（tokenization、嵌入、語言模型、預訓練、解碼、指令微調）<br>• 深度學習島 DL15–DL18、DL20（RNN／LSTM、注意力、Transformer、序列建模）<br>傳統 NLP（n-gram、詞性標註、NER、TF-IDF、句法剖析）**沒有任何一堂** | **B 島內單元**（LLM「模型原理」軌＋DL 序列單元）＋**C 跨島路線**；傳統 NLP 為 **D 未來擴充** | 單元：Existing Blueprint；傳統 NLP：Proposed Extension／Needs Approval |
| Computer Vision | **沒有獨立島**。分散在：<br>• DL13–DL14（CNN、ResNet）、DL19（遷移學習）<br>• GEN08（CLIP）、GEN11–GEN12（ControlNet、影像編修）、GEN16（視覺語言模型）<br>物件偵測、影像分割、傳統影像處理（OpenCV、AOI）**沒有任何一堂**，已列在 [LEARNING_PATHS §4](LEARNING_PATHS.md#4-課程缺口) 的缺口 | **C 跨島路線**（DL→GEN 的視覺課）＋**D 未來擴充** | 路線：Existing Blueprint 的課；偵測／分割／OpenCV：Proposed Extension／Needs Approval |
| Generative AI | 生成式 AI 島 `generative-ai` GEN01–GEN20 | **A 獨立島** | Existing Blueprint |
| AI Agents | AI 代理島 `ai-agents` AG01–AG25 | **A 獨立島** | Existing Blueprint |
| （AI Engineering & MLOps） | AI 工程與 MLOps 島 `ai-engineering` OPS01–OPS20（你沒有列出，但已在 registry） | **A 獨立島** | Existing Blueprint |

結論：
- 七個候選主題中，5 個已有獨立島：AIF、ML、DL、GEN、AG。
- NLP 與 CV 沒有獨立島：
  - NLP 已在 LLM 與 DL 內有課；
  - CV 只有一部分在 DL 與 GEN 內；
  - 兩者缺的部分都是 Proposed Extension。
- 既有的 LLM 與 OPS 兩座島不在你的候選清單中，但都保留。
- **不增加課數、不改 ID、不把任何規劃中的課標為完成。**

## 4. 最終建議的島嶼數量

| 區域 | 獨立建模的學科島 | 內容 |
|---|---:|---|
| Region A — Computer Science Archipelago | **8** | F、DS、AL、PL、DB、CN、SA（含 SPM 單元）、MIS |
| Region B — Artificial Intelligence Archipelago | **7** | AIF、ML、DL、LLM（含 NLP 模型軌）、GEN（含視覺生成）、AG、OPS |
| 中央樞紐（工具，不計學科） | 1＋1 | 互動實驗島（既有）＋中央挑戰島（F.6 規劃，先只留位置） |
| **合計** | **15 學科島** | 與 registry 相同，課數維持 320 |

Proposed Extension（都不計入 15／320，都 Needs Approval）：傳統 NLP 單元、電腦視覺島或單元、SPM 獨立島、數學補給站（線性代數／機率／微積分／統計）、資料工程與分析路線（§8）。

## 5. 整體世界架構：Single World 與 Regional World

### 方案 A：Single World

16 座島（＋樞紐）放在同一張大型六角地圖，鏡頭以縮放與分區取景切換。

### 方案 B：Regional World

三層：**世界總覽**（兩個區域的低細節輪廓、樞紐、航線）→ **區域地圖**（現有六角群島引擎，每區 ≤ 8 座學科島）→ **島嶼聚焦**（現有聚焦與科目面板）。這就是 WORLD_EXPANSION §4 推薦的 D（Hybrid Navigation）在 CS＋AI 的具體化。

### 比較

| 面向 | A Single World | B Regional World |
|---|---|---|
| 3D 渲染成本 | 全部同時渲染：以 F.1e 實測推估（每座程式產生的島約 +3 draw call、+4.7k 三角形；每座 GLB 島目前約 +24 draw call、+9.8k 三角形），15 座 GLB 島全景約 **200k+ 三角形、300+ draw call**（估算，需實測） | 一次只畫一區：≤ 8 座島，約為現在首頁的 1.5–2 倍（估算）；總覽只畫合併的輪廓，約 10 draw call |
| GLB 載入 | 首次進入就要載入或排隊 15 個 GLB（每個約 1 MB），或做複雜的距離 LOD | **進入區域才載入該區的 GLB**；總覽不載 GLB；載入中與失敗沿用 Transitional Art fallback（既有機制） |
| Camera Navigation | 需要多段縮放、分區取景、名牌分群；自動旋轉在全景失去意義 | 沿用現有取景（依內容與右側清單內距）；多一層「總覽 ↔ 區域」轉場 |
| 手機可用性 | 全景時 16 個名牌必然重疊；GPU 負擔最大 | 每層 ≤ 8 個名牌（現在手機 5 個名牌已驗證不重疊）；總覽只有 3 個大目標，好點 |
| 擴充能力 | 每加一區，全景、效能與取景都要重驗 | 新區域＝新區域地圖＋總覽上的一個位置；既有區域不動 |
| 學習路線導覽 | 整條路線可在同一張圖上高亮 | 區域內以橋與道路高亮；跨區以總覽的航線高亮（路線 E／F 都經過樞紐）；清單與路線頁不依賴 3D |
| 遷移成本 | 起步低（只加座標），但 `islandsHomeWorld` 會越來越大，最後仍要做 LOD／分區 | 中：需要 `assembleLayout` 支援 N 座聚落（M1，本來就要做）、每區一份 LayoutSpec、總覽層與區域狀態（URL）；**既有 4 座學科島的座標與橋可原封保留為 Region A 的一部分** |

### 推薦：方案 B（Regional World）

1. **效能有上限**：每區的成本被「≤ 8 座島」框住，可以用現在首頁的實測當基準；方案 A 會隨島數線性增長，而且真機效能尚未量測。
2. **GLB 可以按區延遲載入**，與現有「GLB＋fallback」機制直接相容，不需要新的串流系統。
3. **手機可行**：現有手機名牌與聚焦行為已在 5 島驗證過，每區最多 8 島只是同一套行為的延伸。
4. **遷移不破壞**：F、DS、AL、DB 的座標、橋、道路、樹木與 GLB 擺放可以完整保留，已有的世界指紋與首頁世界測試可以延續。
5. **未來擴充**：總覽預留位置給其他群島，加區不必重排既有區域。

## 6. 世界與兩大區域的 Hex Layout 草案

> 全部是草案座標（flat-top axial、size 1.25，與現有引擎相同）。**使用者同意作為 M3.1 的驗證起點，座標與橋尚未正式批准。**
> 2026-11-03 已以 repo 的 `validateHexWorld` 在隔離副本檢查（規劃中的島以完整半徑 3 的 37 格估計）：兩區都 0 個問題，島間至少 2 格水；PL 由 (−9, 1) 西移到 (−10, 1)（原位置與基礎程式島只隔 1 格水）。道路、地標與港口的衝突**尚未**檢查，見 [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md) §2。

> **2026-11-03 M3.1 實作**：最終座標與草案不同，原因是港口、道路、地標檢查與手機鏡頭的實測結果；以 `src/lib/islands/regions/region-layouts.ts` 為準，說明見 `logs/2026-11-03-m3-1-regional-world-prototype.md`。**2026-11-03 使用者批准為定案。**

### 6.1 世界總覽（Overview）

```
                 （預留：Region C，例：數學補給站）
                              ·
   Region A  ─── 航線 ───  中央樞紐  ─── 航線 ───  Region B
 資訊科學群島             互動實驗島              人工智慧群島
 （暖色、木石）           ＋中央挑戰島            （冷色、礦石與光）
                              ·
                 （預留：Region D，其他學科群島）
```

- 總覽不是六角地圖，而是三個低細節輪廓：每區把各島外形合併成一個網格，加上名牌與航線。
- **航線（ferry route）** 是水面上的虛線，不是橋：A 區的碼頭 → 樞紐 → B 區的兩個碼頭。
- 北、南各預留一個區域位置。之後加區不必移動 A、B 或樞紐。

### 6.2 Region A — 資訊科學群島

| 島 | 中心 (q, r) | 世界座標約 (x, z) | 來源 |
|---|---|---|---|
| F 基礎程式 | (0, 0) | (0, 0) | **既有，不動** |
| DS 資料結構 | (8, −8) | (15, −9) | **既有，不動** |
| AL 演算法 | (10, −2) | (19, 7) | **既有，不動** |
| DB 資料庫應用 | (2, −9) | (4, −17) | **既有（F.1e），不動** |
| PL 程式語言 | (−10, 1) | (−19, −9) | 新（M3.1 驗證後由 (−9, 1) 西移一格，見下） |
| CN 計算機網路 | (19, −9) | (36, 1) | 新 |
| SA 系統分析與設計 | (6, −18) | (11, −32) | 新 |
| MIS 管理資訊系統 | (16, −19) | (30, −24) | 新 |
| 區域碼頭（往樞紐） | 沿用 F 的 `Dock_Entry`（spur `foundations-dock`） | — | 既有；v2.1 的碼頭本來就是「群島的入口」 |

```
北                 SA ═══ MIS
                  ║        ┊
            DB ═══╝        ┊
 PL ┊          ║           ┊
  ║      DS ═══╝═══ AL ═══ CN
  ╚═ F ══╝
     ║
   碼頭 ～～ 航線 ～～▶ 樞紐
```

- 島嶼的排列跟著依賴順序：F → DS → AL 是既有的三角；PL 在 F 的西側；DB → SA → MIS 向北延伸到「企業與系統」區；CN 在 AL 的東側。
- **橋（草案，都是中心距離 9 以內的直線）**：
  - 既有：F–DS、DS–AL、DS–DB；
  - 新增：F–PL、AL–CN、DB–SA、SA–MIS。
  - CN–MIS（中心距離 13）與 PL–DB（11）不搭橋，以島內道路與區域航線提示。
- **互動實驗島規劃為中央樞紐**（已批准）；Region A 地圖不含實驗島，AL → 實驗島的橋只存在於現在的 5 島首頁。
- 地形分高度：
  - F、DS、AL 是平原與海岸；
  - DB 是抬高的平台（既有）；
  - SA、MIS 是北方的台地「城鎮」；
  - CN 是東側的礁岩群；
  - PL 是西側的山丘。

### 6.3 Region B — 人工智慧群島

| 島 | 中心 (q, r) | 世界座標約 (x, z) | 角色 |
|---|---|---|---|
| AIF AI 基礎 | (0, 0) | (0, 0) | 研究路線的入口 |
| ML 機器學習 | (9, −4) | (17, 1) | — |
| DL 深度學習 | (18, −10) | (34, −2) | — |
| LLM 大型語言模型 | (19, −19) | (36, −21) | 研究與應用兩條路線的交會 |
| GEN 生成式 AI | (28, −21) | (53, −15) | 研究分支的終點 |
| AG AI 代理 | (10, −17) | (19, −26) | 應用分支 |
| OPS AI 工程 | (1, −13) | (2, −27) | 應用分支的終點 |
| 研究碼頭（往樞紐） | AIF 西岸的 spur（驗證時以 (−7, 2) 的小碼頭代替，橋跨 2 格水） | — | 接 AIF |
| 應用碼頭（往樞紐） | OPS 西岸的 spur（驗證時以 (−6, −13) 的小碼頭代替，橋跨 2 格水） | — | 接 OPS／AG，路線 F 直接從這裡登陸 |

```
北  OPS ═══ AG ═══ LLM ═══ GEN
     ┊                ║
應用碼頭               ║
                      ║
研究碼頭 ═ AIF ═══ ML ═══ DL
```

- **馬蹄形，而不是網格**。下排是研究主幹：AIF → ML → DL → LLM。到了 LLM 分成兩支：
  - 研究分支往東到 GEN；
  - 應用分支往西：AG → OPS，回到應用碼頭。
- 這個形狀對應兩條既有路線：
  - **路線 E（AI 研究）**：沿下排走到 LLM，再到 GEN。
  - **路線 F（AI 應用工程，不需要 ML／DL）**：從應用碼頭登陸，經 OPS、AG 到 LLM 的應用軌，不必經過 ML、DL。
- **橋（草案）**：研究碼頭–AIF、AIF–ML、ML–DL、DL–LLM、LLM–GEN、LLM–AG、AG–OPS，中心距離都是 9；DL–GEN（11）不搭橋。
- 範圍約 70×30 世界單位，比 Region A 扁長。桌機橫向適合；手機直向時，以名牌圓點與清單為主，聚焦時只框單島（與現在手機相同）。

### 6.4 兩區的視覺識別（摘要，細節見 ART_DIRECTION）

| | Region A 資訊科學 | Region B 人工智慧 |
|---|---|---|
| 地形 | 草地、沙灘、木與石，暖色 | 玄武岩、礦石、梯田、少量水晶，冷色 |
| 橋 | 既有的木橋與石橋 | 新的石橋，橋面有發光嵌線（需新的 bridge kind，Needs Approval） |
| 海 | 現有色 | 同一套水面，顏色略深、偏青（每區一組 palette 參數） |
| 夜間 | 暖黃窗光、燈籠 | 青、紫的線狀光（電路、嵌線），仍跟四時段的 `useGlow` 強度 |
| 共通 | 同一套光照、四時段、六角地形、樹木 LOD、low-poly flat shading，以及 v2.1 的比例 0.6 | 同左 |

### 6.5 鏡頭層級

| 層級 | 桌機 | 手機 |
|---|---|---|
| 總覽 | 三個區域輪廓＋航線＋名牌；點區域進入 | 同樣三個大目標；預設也可以直接顯示清單 |
| 區域 | 現有取景（依內容＋右側清單內距）；≤ 8 個名牌 | 名牌圓點（現有）；下方清單 |
| 島嶼 | 現有聚焦＋左下科目面板 | 現有聚焦＋底部面板 |
| 返回 | 「返回全景」先回區域，再回總覽；URL 帶區域（例如 `/?region=cs`） | 同左 |

## 7. 學習路線整合（不修改 Learning Path Registry）

| 候選路徑 | 對應的既有路線 | 狀態 |
|---|---|---|
| Programming → Data Structures → Algorithms → AI Foundations → Machine Learning → Deep Learning | **路線 E AI 研究**：F（15 堂）→ DS（9）→ AL（8）→ CN（5，因 LLM09 API）→ AIF → ML → DL → LLM 模型軌 → GEN，共 142 堂 | **已存在**（E 的前半段） |
| Database → Data Preparation → Machine Learning | 沒有對應路線。ML02–ML04（NumPy／pandas、EDA、前處理）的先修是 F12、ML01，**沒有任何 ML 課引用 DB**；DB 只連到 AIF10、LLM15、LLM17、AG09、AG10、AG22、OPS10 | **未來擴充**（Proposed Extension：路線 G「資料工程與分析」，例如 DB01–DB08 → MIS06、MIS11 → ML02–ML04；需要在藍圖加「建議先修」連結，Needs Approval） |
| Programming → APIs → LLM Applications → AI Agents | **路線 F AI 應用工程**：F（12）→ PL01–02 → DB → CN12、CN14（API）→ SA（需求與測試）→ AIF01／03 → LLM 應用軌 → AG → OPS 工程軌，共 89 堂，驗證器確認不含 ML／DL | **已存在** |
| （補充）Programming → PL → DB → SA → 專案管理 | **路線 B 軟體工程**（含 SA17、SA18）；SPM 單元在這條路線內 | 已存在 |
| （補充）NLP 路線：DL15–DL18 → LLM01–LLM08 | 路線 E 已包含這些課，但沒有獨立的 NLP 路線 | 單元 Existing；獨立路線 Proposed Extension |
| （補充）CV 路線：DL13–DL14、DL19 → GEN08、GEN16 | 沒有獨立路線 | Proposed Extension |

在地圖上：
- 區域內的路線用橋與道路高亮；
- 跨區的路線（E、F 都從 CS 進到 AI）在總覽上高亮航線；
- 路線頁與清單不依賴 3D。

這些在 M3.5 實作，資料只讀既有的 `learning-paths.json`／`paths.ts`。

## 8. 分階段實作 Roadmap（M3.0–M3.6）

每一階段都要另行批准才開始。

| 階段 | Scope | Deliverables | Dependencies | Acceptance Criteria | Risks | Rollback |
|---|---|---|---|---|---|---|
| **M3.0** CS＋AI Master Plan | 盤點、課綱對照、區域方案、Layout 草案、美術方向、共用管線、Roadmap | 本文件、ARCHIPELAGO_GLB_ART_DIRECTION、既有文件的指標更新 | 無 | 使用者批准 §10 的決策 | 決策延宕 | 文件 commit 可單獨 revert |
| **M3.1** World Region Architecture | 架構提案（[M3_1](M3_1_REGIONAL_WORLD_ARCHITECTURE.md)）→ 獨立 prototype 路由：Hex Layout Validator（含道路、地標、港口衝突）、島間距、橋與航線、Camera Framing、Desktop／Mobile Layout、GLB Scale Contract、Interaction Anchor Contract、Performance Baseline；未開課島以低細節「霧中小島」呈現並**明確標示「規劃中」** | 區域 Layout 資料與驗證、prototype 路由（feature flag）、量測報告、兩份契約 | M3.0（已有條件批准） | 見 M3_1 §8；既有 4 座學科島與 F.1e 相同（逐項測試）；`islandsWorld` 指紋不變；正式首頁 0 行差異 | 轉場與取景的複雜度；名牌密度 | prototype 路由整個移除即可；首頁不受影響 |
| **M3.2** 共用 GLB Pipeline＋代表性島嶼 Prototype | 把 v2.1 的流程整理成共用規格（命名、材質、anchors、provenance、SHA、預算）；做 **2 座代表島**：CS 一座（建議 DB，節點名稱已預留）、AI 一座（建議 LLM） | 2 個 BLEND＋GLB、node-contract／provenance／validation JSON、asset-registry 條目、截圖、預算報告 | **M3.1 通過＋使用者確認世界架構**（M3_1 §8 的進入條件）；Blender MCP protocol 14／15 相容性已檢查並有升級或替代方案（不直接改既有環境） | glTF validator 0 error；**以實測**符合預算；四時段截圖；fallback 正常；**使用者人工美術驗收**（鎖定 CS 與 AI 的風格） | 美術風格反覆；Blender 工具版本 | GLB 不進 registry＝維持 Transitional Art；原始 BLEND 不覆蓋，新檔另存版本 |
| **M3.3** CS Archipelago GLB 批次 | 其餘 CS 島（DS、AL、PL、CN、SA、MIS；F 已有 v2.1，不改）分 2–3 批 | 每座島一套 GLB＋契約＋驗證；每批獨立 commit | M3.2 的 CS 風格驗收 | 每批：validator、預算、四時段、fallback、人工驗收 | 工作量；與教材階段搶資源 | 每座島可各自退回 Transitional Art |
| **M3.4** AI Archipelago GLB 批次 | AI 7 座島（扣除 M3.2 的代表島）分 2–3 批 | 同 M3.3 | M3.2 的 AI 風格驗收；M3.1 的 Region B 地圖 | 同 M3.3；7 座島的輪廓彼此可辨識（不共用同一種塔） | 同上；AI 主題易流於同一種科技塔 | 同 M3.3 |
| **M3.5** Region Navigation 與跨區學習路線 | 總覽 ↔ 區域 ↔ 島嶼的完整導覽；碼頭與航線互動；路線高亮（區域內與跨區）；互動實驗島作為樞紐；**不切換 `/`** | 導覽元件、路線高亮、清單同步、URL 與返回行為 | M3.1；至少每座島都有 Transitional Art 或 GLB | 滑鼠、hover、鍵盤、觸控、沒有 WebGL 的清單都能到達每一座島與每一條路線；進度 key 不變 | 首頁行為改變影響既有 E2E | 新世界只在 feature flag 之後；關閉即回到 5 島首頁 |
| **M3.6** Desktop／Mobile／Performance／Accessibility Acceptance | 全面驗收 | 驗收報告（桌機、模擬手機、**真機**）、效能對照、無障礙檢查；通過後才**提出** `/` 正式切換的建議（由使用者決定） | M3.3–M3.5 | 每層 draw call／三角形／首畫面在預算內；真機 fps 有數據；名牌不重疊不裁切；四時段；E2E 全綠（或既有 P1 有處置） | 真機不足時要降級 | 不通過的部分維持 flag 關閉 |

### 平行與等待

- **可平行**：
  - M3.1（程式、資料層）與 **M3.2 的準備工作**（Blender MCP 相容性檢查、匯出設定、命名與材質範本）可以同時進行；正式建模要等 M3.1 通過。兩者都只有單一寫入者。
  - M3.5 的清單與路線頁部分（不需要 3D）可以在 M3.1 之後就開始。
  - 真機效能基準可以隨時先量。
  - 教材階段（F.x：CN、SA、MIS、PL、AI 各島的課）與 M3 互不阻擋；地圖顯示的狀態由 registry 自動算出。
- **必須等 M3.1 的世界架構確認**：M3.2 的正式建模（世界座標與模型規格未確認前，不開始批次建模；Blender Pipeline 的準備可以先做）。
- **必須等 GLB 美術驗收**：
  - M3.3 與 M3.4 的批次製作要等 M3.2 鎖定風格，否則每座島都要重做。
  - M3.6 的最終效能數字要等 GLB 到位。
- **Blender 是單一寫入者**：一次只開一個 BLEND。可以重疊的只有「整合前一座已驗收的島」與「製作下一座」。

## 9. 不在本階段

- 不新增或改名任何課程、ID、slug、進度 key；不修改 `learning-paths.json`、`paths.ts`、藍圖資料。
- 不修改 `islandsHomeWorld`、`islandsWorld`、任何 GLB、Theme 檔案或受保護路由。
- 不新增第二套 World Registry：區域與島嶼都在 `src/content/world/`，未來的區域 Layout 只是 3D 的擺放資料，島嶼身分仍讀 registry。

## 10. 決策紀錄（2026-11-03 使用者有條件批准）

| # | 決策 | 結果 |
|---:|---|---|
| 1 | 維持 15 座學科島與 320 堂 Blueprint，不新增重複島嶼 | **批准** |
| 2 | CS 區 8 座、AI 區 7 座 | **批准** |
| 3 | SPM 歸入 SA；NLP 主要歸入 LLM；CV 主要歸入 DL／GEN；未涵蓋內容列為 Proposed Extension | **批准** |
| 4 | Regional World：世界總覽 → 區域地圖 → 學科島 | **批准** |
| 5 | 互動實驗島規劃為中央樞紐 | **批准** |
| 6 | DB 與 LLM 作為兩區的代表性 GLB Prototype | **批准** |
| 7 | CS 工匠城鎮風格、AI 研究實驗場風格，共用同一套 GLB Pipeline | **批准** |
| 8 | 未開課島嶼用低細節霧中小島 | **批准，條件**：必須明確顯示「規劃中」，不得誤導使用者 |
| 9 | NLP、CV、Database → ML 的課程擴充 | **放入 Backlog**；不修改 Curriculum Registry |
| 10 | §6 Hex Layout 草案 | **作為 M3.1 的驗證起點**；座標與橋尚未正式批准 |
| A | 首頁切換 | **調整**：不立即把 `/` 換成世界總覽；以 feature flag 建立 Regional World，五島首頁保留為穩定版本；新世界通過桌機、手機、效能、導覽與 WebGL fallback 驗收後，才提出正式切換建議 |
| B | 階段編號 | **調整**：資料庫島 3D World Integration 歸檔為 **Phase F.1e**；Phase F.2 AI Foundations & ML 教材階段保留；M3.0–M3.6 專門管理世界地圖、GLB 美術與區域導覽 |
| C | GLB 製作順序 | **調整**：先完成 M3.1 的區域架構驗證（Hex Layout Validator、島嶼間距、橋與航線、Camera Framing、Desktop／Mobile Layout、GLB Scale Contract、Interaction Anchor Contract、Performance Baseline），通過後才進入 M3.2 正式建模；Blender Pipeline 可平行準備，但世界座標與模型規格確認前不批次建模 |
| D | 效能預算 | **調整**：每島 10k 三角形／16 draw call、區域總覽桌機 150／手機 100 draw call 只是**暫定目標**；M3.1 必須以實際 prototype 量測，不把估計值當成已驗證的上限 |
| E | Blender MCP | **調整**：M3.2 前檢查 protocol 14／15 相容性並提出升級或替代方案；不直接修改既有可運作的 Blender 環境 |
