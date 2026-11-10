# 群島 GLB 美術方向與共用管線（CS＋AI Art Direction & Shared GLB Pipeline）

> 2026-11-03，M3.0 規劃文件。**只是規劃**：本文件沒有建立或修改任何 BLEND、GLB，也沒有開始 Blender 建模。所有地標都是**視覺候選**，要經過 M3.2 的代表島驗收才會定案。
> 區域架構與 Roadmap 見 [M3_CS_AI_MASTER_PLAN](M3_CS_AI_MASTER_PLAN.md)；既有資產盤點見 [BLENDER_ASSET_INVENTORY](../handoff/BLENDER_ASSET_INVENTORY.md)。

## 1. 共同原則（沿用 basics-island v2.1）

v2.1 的實際做法（`public/models/islands/basics-island.v2.1.glb`，直接讀 GLB JSON 確認）：

- **2 個材質**：`LLv2_Palette_VertexColor`（頂點顏色、metallic 0）與 `LLv2_Warm_Emission`（`KHR_materials_emissive_strength` 2）。
- **沒有貼圖**；9,800 三角形、24 個 mesh、46 節點、880 KB；執行時比例 0.6。
- 互動節點帶 extras `role`／`interaction_id`（例如 `Anchor_Workshop`：`learn`）。

這套「頂點顏色調色盤＋一個發光材質」也是程式產生的 Transitional Art 的做法（例如資料庫應用島的地標合併成一個頂點顏色網格，加一盞 `useGlow` 狀態燈）。所以 **CS 與 AI 共用同一套渲染路徑，不需要另一套 AI 專用的渲染架構**。區別只在調色盤、地形與造型語言。

| 一致的部分（兩區都相同） | 各島各自不同的部分 |
|---|---|
| low-poly flat shading、約一格大小的建築尺度、比例 0.6 | 地形類型與高度輪廓 |
| 頂點顏色調色盤材質＋單一發光材質 | 調色盤（以 registry 的 accent 為主色） |
| 四時段光照，發光強度由 `useGlow` 依時段調整 | 建築語言與天際線輪廓 |
| 節點命名、anchors、extras 契約 | 夜間燈光的形狀（窗光、線光、點光） |
| 每島預算與 fallback | 地標的數量（3–4 個） |

**避免同一種科技塔**：
- 每座島最多一個「垂直地標」。
- 各島的垂直地標輪廓要不同：圓柱、尖塔、階梯、格架、碟形、拱門。
- 其餘地標以水平建築、廣場、地形改造為主。
- M3.4 驗收時，把 7 座 AI 島的剪影並排比對。

## 2. 區域識別

| | Region A 資訊科學群島 | Region B 人工智慧群島 |
|---|---|---|
| 主題 | 工匠與城鎮：從工坊、港口到市政廳 | 研究所與實驗場：從圖書館、農場、鑄造廠到指揮中心 |
| 材質感（以顏色表現，不用貼圖） | 木、石、紅瓦、帆布、沙 | 玄武岩、礦石、白色陶瓷、少量水晶、青銅 |
| 地形 | 草地、沙灘、海岸、山丘、台地 | 玄武岩柱、梯田、階地、潟湖、礦脈 |
| 夜間 | 暖黃窗光、燈籠、燈塔 | 冷色的線狀嵌燈（青、紫、琥珀），點狀節點燈 |
| 發光材質 | 沿用 `Warm_Emission` | 新增一個冷色發光材質（同一個 extension、同樣的強度控制），每座 AI 島只用一個 |

## 3. Computer Science Archipelago 美術方向

| 島 | 地形與輪廓 | 地標候選（視覺候選，非正式清單） | 色彩 | 夜間 | 現況 |
|---|---|---|---|---|---|
| F 基礎程式 | 岩岸、三層地形 | 燈塔、工坊、碼頭 | `#4285f4`＋暖白 | 燈塔光、工坊窗光 | **GLB v2.1，不改** |
| DS 資料結構 | 台地港口 | 資料港倉庫、堆疊木箱（stack）、排隊碼頭（queue）、樹形起重架 | `#188038` | 倉庫窗光 | Transitional Art |
| AL 演算法 | 山脊 | 山脊觀測站、分岔小徑（搜尋樹）、排序階梯 | `#db4437` | 觀測站圓頂光 | Transitional Art |
| PL 程式語言 | 西側丘陵、梯狀小鎮 | **編譯工坊**（原始碼 → 齒輪 → 機器碼的三段建築）、**語法樹花園**（AST 形狀的修剪樹籬）、**虛擬機引擎房**（煙囪與飛輪）、詞法分析印刷所 | `#5b6ee1` | 工坊爐火 | 規劃 |
| DB 資料庫應用 | 抬高平台＋沙岸 | 資料庫主塔、B+ Tree 索引館、資料複寫雙塔、資料表廣場（**節點名稱已預留**） | `#2f7d6d` | 主塔狀態燈 | Transitional Art（F.2） |
| CN 計算機網路 | 東側礁岩群，小島以纜線相連 | **中繼塔**（格架天線，唯一垂直地標）、**路由十字港**（多向碼頭）、**封包運河**（水道與閘門）、DNS 電話局 | `#1a8fb0` | 天線頂端點光、運河沿岸燈 | 規劃 |
| SA 系統分析與設計 | 北方台地，工地與鷹架 | **藍圖繪圖館**（大窗、斜屋頂）、**UML 庭園**（方框花圃與連線步道）、施工鷹架、**專案指揮所**（甘特圖看板，SPM 單元） | `#b07a1a` | 繪圖館窗光、看板燈 | 規劃 |
| MIS 管理資訊系統 | 北方港埠城 | **市政廳**（鐘樓，治理）、**市集與倉儲**（ERP／SCM）、**BI 瞭望台**（低矮的觀景台，不做高塔）、客戶服務亭（CRM） | `#7a6a58` | 市集燈串、市政廳窗光 | 規劃 |

## 4. Artificial Intelligence Archipelago 美術方向

只為 M3.0 建議獨立建模的 7 座 AI 島提出概念（NLP、CV 沒有獨立島，其候選地標併入下列島嶼）。

| 島 | 地形 | 地標候選 | 唯一的垂直地標（輪廓） | 色彩 | 夜間燈光 |
|---|---|---|---|---|---|
| **AIF** AI 基礎 | 低矮的石台地，刻出**樹籬迷宮** | 智慧核心塔、**搜尋與推理迷宮**（迷宮步道就是搜尋路徑）、**知識表示圖書館**（圓頂、橫向） | 智慧核心塔：**矮胖的圓頂塔**（像天文台，不是尖塔） | `#00897b` 青綠＋石灰白 | 迷宮的路徑燈串（顯示一條搜尋路徑） |
| **ML** 機器學習 | **梯田**與農田（每一列是一列資料） | **資料集農場**（作物列、穀倉）、**模型訓練中心**（溫室）、**特徵工程工坊**（風車與篩選機） | 風車（**旋轉葉片的十字輪廓**，靜態） | `#f29900` 琥珀＋麥黃 | 溫室整體暖光 |
| **DL** 深度學習 | **玄武岩柱**階地，像一層層網路 | **神經網路塔**（節點球＋連桿的**格架**）、**多層感知器建築**（三排高度遞增的柱廳，代表層）、**GPU 計算中心**（有散熱鰭片的鑄造廠）；併入 CV 的**像素矩陣廣場**（CNN 單元） | 神經網路塔：**開放格架** | `#c2185b` 洋紅＋玄武岩灰 | 節點球點光（靜態，依時段強度） |
| **LLM** 大型語言模型（含 NLP 模型軌） | 海崖與書卷形的層狀岩 | **語言符號圖書館**（長廊、書架窗）、**Tokenization Workshop**（把長條切成小方塊的工坊）、**Transformer Tower**（**階梯式金字塔**，每層是一個 block，兩側拱門代表注意力） | Transformer Tower：**階梯金字塔** | `#6a1b9a` 紫＋羊皮紙色 | 圖書館窗光、金字塔每層一條嵌線 |
| **GEN** 生成式 AI（含視覺生成） | 彩色沙丘與潟湖 | **生成模型工坊**、**Diffusion Studio**（一列亭子由散亂方塊漸變到完整造型，代表去噪步驟）、**Multimodal Gallery**（曲面屋頂畫廊）；併入 CV 的**影像辨識觀測站**（CLIP／VLM 單元） | 無高塔；以**曲面屋頂**與沙丘造型為輪廓 | `#e8710a` 橘＋珊瑚粉 | 畫廊聚光燈 |
| **AG** AI 代理 | 港灣與防波堤 | **Agent Command Center**（**碟形雷達**指揮站）、**Tool Integration Hub**（起重機與接頭的工具碼頭）、**Multi-Agent Collaboration Plaza**（圍成一圈的小亭） | 碟形雷達 | `#3949ab` 靛藍＋白 | 雷達頂端信標、廣場環形燈 |
| **OPS** AI 工程與 MLOps | 工業碼頭與礦脈 | **貨櫃部署港**（貨櫃堆＝容器）、**管線水道橋**（拱橋上的管線＝CI／CD 管線）、**監控燈塔**（有螢幕面板的低塔） | 水道橋的**連續拱門**（水平） | `#546e7a` 鋼藍灰＋警示黃 | 管線上一串狀態燈（綠、黃） |

設計要點：
- 7 座島的垂直輪廓各不相同：圓頂、十字風車、格架、階梯金字塔、碟形、低塔；GEN 與 OPS 刻意沒有高塔。
- **NLP 的候選地標**（語言符號圖書館、Tokenization Workshop、Transformer Tower）歸 LLM 島，因為 NLP 的模型原理課都在 LLM01–LLM08。
- **CV 的候選地標**分到兩座島：
  - 像素矩陣廣場 → DL（CNN）；
  - 影像辨識觀測站 → GEN（CLIP、VLM）；
  - 視覺感測塔不採用，以免增加一座同類的塔。
- `frameloop="demand"` 下沒有持續動畫：風車、雷達、燈都是靜態造型，夜間差異只靠發光強度。

## 5. 共用 GLB Asset Pipeline

兩區完全相同的流程。前四步是 v2.1 已走過的，後幾步是要補成規格的部分。

| 步驟 | 內容 | 既有依據 |
|---|---|---|
| 1. 建模規格 | Blender 5.2.2 LTS；公尺制；島嶼原點在中心地面；+Y 向上匯出；一格六角對應的尺寸與 v2.1 相同（執行時比例 0.6）；**不做**地形六角格（地形由引擎產生），GLB 只含建築、地標、碼頭、樹木與 anchors | v2.1 |
| 2. 匯出 | glTF Binary（內建 io_scene_gltf2）；Apply Modifiers；頂點顏色；`KHR_materials_emissive_strength`；不嵌入貼圖、相機、燈光；不壓縮（Draco／meshopt 需要新依賴，需另行批准） | v2.1 |
| 3. 衍生 runtime GLB | `scripts/assets/derive-runtime-glb.mjs`：只移除 `blendermcp*` extras，其他 byte-for-byte 保留；`--check` 驗證已提交的檔案 | 既有 |
| 4. 驗證 | Khronos glTF Validator 0 error、0 warning（info 可接受並記錄） | `docs/assets/*.validation.json` |
| 5. Node Naming Convention | 見 §5.1 | v2.1 節點契約 |
| 6. Material／Emissive Contract | 見 §5.2 | v2.1 材質 |
| 7. Interaction Anchors | 見 §5.3 | `asset-registry.ts` |
| 8. Asset Provenance | `docs/assets/<asset>.provenance.json`：來源 BLEND 的路徑與 SHA256、匯出設定、Blender 與 exporter 版本、衍生腳本版本、日期、作者；**原始 BLEND／GLB 不覆蓋**，新版本另存（`<asset>.v<major>.<minor>`） | 既有格式 |
| 9. SHA256 | `asset-registry.ts` 記錄 runtime GLB 的 sha256 與 bytes；`tests/islands-glb.test.ts` 比對檔案 | 既有 |
| 10. 預算 | 見 §6 | F.1e 量測 |
| 11. Lazy Loading | 只在進入該區域時以 `useGLTF` 載入該區的 GLB；總覽不載入；載入中與失敗時畫 `fallback`（Transitional Art）；可在區域地圖 idle 時預載相鄰島（選用） | `HexGlbBuildings`、fallback 機制 |
| 12. WebGL Fallback | 沒有 WebGL 時不載入任何 GLB，改為清單導航（既有）；每座島的清單描述來自 registry | `e2e/*` 的 withoutWebGL |
| 13. Regression Tests | 見 §5.4 | 既有測試 |
| 14. 人工驗收 | 四時段 × 桌機／手機截圖、剪影比對、使用者批准後才寫入 registry | v2.1 的 Phase C 流程 |

### 5.1 節點命名

| 類別 | 規則 | 例 |
|---|---|---|
| 根節點 | `Island_<Name>_Root`（每個 GLB 一個） | `Island_Basics_Root`（既有，不改名）、`Island_Databases_Root` |
| 互動目標 | `Landmark_*`（地標）、`Building_*`（建築入口）、`Plaza_*`（廣場）、`Dock_*`（碼頭），PascalCase | `Landmark_DatabaseTower`、`Building_IndexHall`、`Dock_Entry` |
| Anchors | 在 `Anchors` 群組下，`Anchor_<Target>`；每座島**必須**有 `Anchor_Entry` 與 `Anchor_Route_Exit` | `Anchor_Workshop` |
| 發光零件 | `Glow_*`，只用發光材質 | `Glow_TowerStatus` |
| 裝飾 | `Decor_*`、`Tree_###`、`Rock_###`；不是程式契約，可合併 | `Tree_001` |
| 規則 | 名稱穩定，改名＝契約變更；輔助群組的 suffix 不可當程式契約（BLENDER_ASSET_INVENTORY 的既有規則） | — |

### 5.2 材質與發光

- 每個 GLB 最多 **3 個材質**：
  1. `LL<區>_Palette_VertexColor`：主材質，頂點顏色；
  2. 一個發光材質：CS 用 `Warm_Emission`，AI 用新的 `Cool_Emission`；
  3. 選用：水或玻璃。
- 發光材質使用 `KHR_materials_emissive_strength`，強度基準 2（同 v2.1）。執行時由 `useGlow` 依四時段縮放：傍晚最亮、中午最暗。GLB 內不寫時段邏輯。
- 不使用貼圖；顏色只來自頂點顏色與調色盤。

### 5.3 Interaction Anchors 與 extras

- 每個互動目標的 extras 帶 `role`、`interaction_id`；需要導向的帶 `route`。
- 動作由 `asset-registry.ts` 的 `nodes` 宣告：`route` 導向某堂課或課綱，`info` 顯示說明；不是寫在 GLB 裡。
- 每座學科島至少 3 個目標：
  - 入口：課綱 `/curriculum#island-<id>`；
  - 代表地標：說明；
  - 碼頭或出口：`route_exit`，接區域航線。
- 規劃中的島沒有可開啟的課，入口改為顯示規劃說明，不導向不存在的頁面。

### 5.4 Regression Tests（每加一個 GLB）

- **檔案**：sha256、bytes 與 registry 相同；`derive-runtime-glb --check` 通過。
- **節點契約**：root、互動目標、anchors 都存在，extras 正確；父子與 transform 與 node-contract JSON 相同。
- **擺放**：GLB settlement 的位置在自己島上，不壓到道路與樹林。
- **預算**：三角形、mesh 數、材質數在 §6 之內，以 GLB JSON 機器檢查。
- **E2E**：
  - 名牌 `data-model-source` 從 `geometry` 變成 `glb`；
  - 載入失敗時顯示 fallback；
  - 四時段沒有 console error；
  - 互動目標可點、鍵盤可達。
- **既有島不變**：世界指紋與首頁世界測試（F.1e 的逐項比對）。

## 6. 多邊形與 Draw Call 預算（暫定目標，尚未驗證）

> 2026-11-03 使用者決定：下表只是**暫定目標**。M3.1 以實際 prototype 量測（方案見 [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md) §7），在量測前不得當成已驗證的效能上限。

依 v2.1 與 F.1e 的實測數字訂定，**真機量測後修正**：

| 範圍 | 三角形 | Draw call | 其他 |
|---|---:|---:|---|
| 每座 GLB 島（桌機） | ≤ 10,000（v2.1：9,800） | ≤ 16（v2.1：24 個 mesh，新島以合併靜態裝飾降低） | ≤ 3 材質、≤ 1 MB、無貼圖 |
| 每座 GLB 島（手機） | 同一個 GLB；有需要時另做 ≤ 5,000 的 LOD 版 | ≤ 16 | 陰影維持靜態（現在 0 個陰影 pass） |
| 區域地圖總覽（桌機） | ≤ 150,000 | ≤ 150 | 現在 5 島首頁：49,113／66 |
| 區域地圖總覽（手機） | ≤ 100,000 | ≤ 100 | 現在：36,923／66 |
| 世界總覽 | ≤ 20,000 | ≤ 15 | 不載入 GLB |
| 首畫面／GLB 就位（SwiftShader） | 不比 F.1e 的 1.5 s／2.2 s 慢超過 50% | — | 真機另訂 |

**M3.1 實測（2026-11-03，SwiftShader）**：

| 頁面 | draw call | 三角形 |
|---|---:|---:|
| CS 區域總覽（現況美術） | 58 | 45,228 |
| 同上，每座島加 v2.1 燈塔＋工坊替身 | 64 | 63,484 |
| AI 區域 | 28 | 21,806 |
| 世界總覽 | 8 | 8,726 |

- **推估**（不是實測）：CS 的 7 座島都換成預算上限的 GLB 時，約 170 draw、115k 三角形，超過上表暫定的 150 draw。
- 正式預算要等 M3.2 的實際 GLB 量測後再定。見 `logs/2026-11-03-m3-1-regional-world-prototype.md`。

## 7. 美術工作的順序

> 2026-11-03：**M3.2 正式建模要等 M3.1 通過**（世界座標、GLB Scale Contract、Interaction Anchor Contract 與效能基準確認後），進入條件見 [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md) §8。之前只做 Blender Pipeline 的準備（不建模）。

1. **M3.2 代表島**：
   - CS 建議 **DB**：教材完整，四個節點名稱已預留，可以直接替換現有 Transitional Art 並比對。
   - AI 建議 **LLM**：路線 E 與 F 的交會，地標造型最有代表性。
   - 兩座都通過人工驗收後，鎖定兩區的調色盤、比例與造型語言。
2. **M3.3 CS 批次**：DS、AL（替換既有 Transitional Art）→ PL、CN → SA、MIS。
3. **M3.4 AI 批次**：AIF、ML → DL、GEN → AG、OPS。
4. 每座島各自可以退回 Transitional Art；原始 BLEND 不覆蓋。
