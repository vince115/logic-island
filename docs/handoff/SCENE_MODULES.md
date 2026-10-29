# 模組化 3D 場景架構規劃（Modular Scene Construction System）

> 2026-10-29，規劃文件，**未實作、未批准**。以 D.0～D.2b 第二階段的實際程式為基礎（分支 `phase-d/basics-glb`）。分成 Phase D 當前必需、Phase E 資料驅動擴充、Phase F 遊戲互動三層。

## 1. 現況盤點：哪些模組已經存在

| 模組 | 目前的實作 | 來源 |
|---|---|---|
| 1 Terrain 地形 | `HexSettlement.tiles`（axial 座標、地形類型）；`hex-terrain.ts` 的 `buildSettlementTerrain` 產生連續頂面 | R3F 程式生成 |
| 2 Ocean 海洋與岸線 | `WATER_LEVEL`、`SEA_FLOOR`、海岸崖（`kind: 'coast'`）、淺水六角環 | R3F |
| 3 Elevation 高低差 | `HexTile.height`；step 崖壁 | R3F |
| 4 Vegetation 植被 | GLB `Tree_00x`（基礎程式島）；暫代的圓錐樹（另兩島） | GLB＋R3F 暫代 |
| 5 Buildings 建築 | `hexGlbSettlements` 放置資料；`extractGlbParts` 取出子樹 | GLB |
| 6 Paths 道路 | `settlementRoads`、`spurs`、`roadProfiles`、坡道 | R3F |
| 7 Bridges 橋樑 | `HexWorld.bridges`（兩端各接在地塊邊上） | R3F |
| 8 Landmarks 地標 | `Landmark_Lighthouse`（role `learning_landmark`）；聚落名牌 | GLB＋HTML |
| 9 NPC | 沒有 | — |
| 10 Quests 任務點 | 沒有 | — |
| 11 Effects 特效 | GLB 的暖光 emission（燈籠、窗光）；說明框 | GLB＋HTML |
| 12 Interactions 互動 | registry 的 `nodes`（target／anchor／action），`resolveTarget`，Anchor HTML 標籤 | 資料＋R3F |

驗證方面也已具備：

- `validateHexWorld`：地塊不重疊、聚落連續、聚落之間有水、橋接在邊上、整張圖連通。
- `checkGlbContract`：以節點名稱檢查互動節點。
- `tests/islands-glb.test.ts`：43 個節點的契約檢查。
- 建築放置與碰撞測試、地形測試。

**結論：** 1～8 和 12 都已有雛形，缺的是統一的「藍圖」格式和一條彙整的驗證流程；9、10 完全屬於 Phase F。

## 2. 核心原則

1. **只有一份島嶼 schema。** 場景模組是 Phase E 島嶼 schema 裡的 `scene` 區塊，不另立第二套 schema。D 現有的 TypeScript 型別（`HexSettlement`、`HexGlbSettlement`、registry `nodes`）會演進成這個區塊。
2. **場景只描述「東西在哪裡、長什麼樣」，不描述「玩家進度」。** 解鎖、任務進度、NPC 對話狀態都屬於 Phase F；場景只接受 F 算好的唯讀顯示狀態（`locked`／`available`／`completed`）。
3. **以節點名稱引用 GLB。** 藍圖用節點名稱指向 GLB 子樹；interaction_id 不當唯一鍵，也不用陣列索引。
4. **生成是確定性的。** 同一份藍圖永遠產生同一個場景：隨機只用座標雜湊，不用 `Math.random`。AI 和測試因此能重現結果。
5. **所有驗證都是純函式。** 輸入藍圖（加上預先算好的資產尺寸），輸出結構化錯誤，不需要 WebGL。

## 3. 藍圖資料結構（Phase E schema 的 `scene` 區塊）

```jsonc
{
  "island_id": "foundations",              // Phase E 既有欄位，沿用
  "archipelago": "coding",                 // Phase E 既有欄位（coding | ai）
  "scene": {
    "version": 1,
    "grid": { "size": 1.25, "origin": { "q": 0, "r": 0 } },
    // 1 Terrain＋3 Elevation：地塊、地形類型、相對高度
    "terrain": {
      "surface": "continuous",
      "tiles": [{ "q": 0, "r": 0, "terrain": "plaza", "height": 0 }, { "q": 0, "r": -1, "terrain": "grass", "height": 0.5 }]
    },
    // 2 Ocean：全世界共用水面；每島只能宣告岸型
    "ocean": { "shore": [{ "tile": { "q": 0, "r": 1 }, "kind": "low" }] },
    // 6 Paths：道路從廣場出發，終點是邊（橋頭或支線）
    "paths": { "hub": { "q": 0, "r": 0 }, "spurs": [{ "id": "foundations-dock", "tile": { "q": 0, "r": 1 }, "edge": 5 }] },
    // 5 Buildings、4 Vegetation、8 Landmarks：同一種放置格式，各自分組
    "placements": [
      { "module": "buildings", "asset": "basics-island-v2.1", "node": "Building_Workshop", "tile": { "q": -1, "r": 1 }, "across": 2 },
      { "module": "landmarks", "asset": "basics-island-v2.1", "node": "Landmark_Lighthouse", "tile": { "q": 0, "r": -1 }, "offset": [0, -0.2] },
      { "module": "vegetation", "asset": "basics-island-v2.1", "node": "Tree_001", "tile": { "q": -2, "r": 1 } }
    ],
    // 12 Interactions：沿用 registry 的 target／anchor，以節點名稱為鍵
    "interactions": [{ "node": "Building_Workshop", "action": { "type": "route", "href": "/learn" }, "anchor": "Anchor_Workshop" }],
    // 9 NPC、10 Quests：只有「位置插槽」，內容與狀態由 Phase F 依 id 對應
    "slots": { "npc": [{ "id": "foundations-keeper", "tile": { "q": 0, "r": 0 } }], "quest": [{ "id": "first-light", "anchor": "Anchor_Lighthouse" }] },
    // 11 Effects：只放宣告式效果，由顯示狀態觸發
    "effects": [{ "kind": "unlock-glow", "target": "settlement", "when": "available" }]
  }
}
```

世界層級另有一份配置，負責各島位置與跨島連線，避免島嶼之間互相耦合：

```jsonc
{ "islands": [{ "island_id": "foundations", "offset": { "q": 0, "r": 0 } }],
  // 7 Bridges：跨島連線屬於世界層級，兩端各接一個島的邊
  "bridges": [{ "id": "foundations-structures", "kind": "wood", "from": { "island": "foundations", "tile": { "q": 1, "r": -1 }, "edge": 1 }, "to": { "island": "structures", "tile": { "q": -1, "r": 1 }, "edge": 4 } }] }
```

每座島的座標都以自己為原點，進入世界時再加上 `offset`。這樣 AI 可以單獨生成或移動一座島，不必改寫其他島的資料。

## 4. 模組職責邊界與依賴

| 模組 | 負責 | 不負責 | 依賴 |
|---|---|---|---|
| Terrain | 地塊集合、地形類型、頂面網格 | 高度規則、建築 | grid |
| Elevation | 每格高度、step 崖壁位置 | 道路坡道的幾何 | Terrain |
| Ocean | 水面、海岸崖、淺水環、岸型 | 碼頭建築 | Terrain、Elevation |
| Paths | 島內道路、支線、坡道與道路剖面 | 跨島橋 | Terrain、Elevation |
| Bridges | 跨島連線、橋型 | 島內道路 | Ocean（兩端必須面水）、世界配置 |
| Buildings | GLB 建築子樹的放置與佔地 | 互動行為 | Terrain、Elevation、Paths、Bridges（避讓） |
| Vegetation | 樹木與植被的放置 | — | 同 Buildings |
| Landmarks | 地標建築、聚落名牌位置 | 任務內容 | Buildings |
| Interactions | 目標節點、Anchor、行為（route／info） | 進度判定 | Buildings、Landmarks |
| Effects | 宣告式效果，依顯示狀態觸發 | 狀態本身 | Interactions，以及 Phase F 的顯示狀態 |
| NPC | 位置插槽（D／E）；角色內容與 AI（F） | 對話與任務狀態（F） | Terrain、Paths |
| Quests | 任務點插槽，掛在 Anchor 或地塊上（D／E） | 任務邏輯（F） | Interactions |

施工順序與驗證順序相同：

```
grid → Terrain → Elevation → Ocean → Paths → Bridges（世界層級）
     → Buildings → Vegetation → Landmarks → Interactions → Effects → NPC／Quests 插槽
```

## 5. AI 如何產生島嶼配置

1. **輸入：** 島嶼主題、課程清單（Phase E）、可用資產清單（registry 與資產尺寸清單）、世界配置中該島的位置。
2. **AI 只輸出藍圖 JSON。** 不輸出程式碼或 mesh。藍圖格式提供 JSON Schema 檔，內容由 TypeScript 型別手寫同步，不為此新增 schema 套件，除非另行批准。
3. **驗證器：** 回傳結構化錯誤 `{ code, module, pointer, severity, message }`，例如：

   ```json
   { "code": "BUILDING_OFF_LEVEL_LAND", "module": "buildings", "pointer": "/scene/placements/0", "severity": "error", "message": "Building_Workshop 有取樣點落在高度不同的地塊上" }
   ```

   AI 依錯誤修正，再送一次，直到沒有 error。
4. **預覽：** 通過後在 `/islands/hex` 類型的預覽頁截圖，由人工驗收。AI 不直接修改正式頁面。
5. **重現性：** 同一份藍圖產生的地形三角形、道路剖面、放置位置完全相同，可做快照測試。

## 6. 自動驗證項目

| 階段 | 規則 | 目前狀態 |
|---|---|---|
| 結構 | 必填欄位、列舉值、id 唯一 | 未做（E） |
| Grid／Terrain | 地塊不重複、聚落連續、聚落之間至少隔一格水 | `validateHexWorld` 已有 |
| Elevation | 高度在允許範圍；step 高差上限；坡道坡度 < 35° | 坡度有測試；範圍上限未做 |
| Ocean | 海岸崖延伸到水面以下；低岸頂面高於水面 | 有測試 |
| Paths | 從廣場可到每個橋頭與支線；跨越高差處必有坡道；不跳躍 | 有測試 |
| Bridges | 兩端面水、兩端相對、同一直線、不跨陸地、全圖連通 | `validateHexWorld` 已有 |
| Buildings／Vegetation | 佔地取樣點落在同高的陸地上；彼此不重疊；與道路、坡道、橋保持距離 | 有測試（基礎程式島） |
| GLB 契約 | 43 節點父子與世界座標；registry 語意節點；取出前先檢查整份 GLB | 已有 |
| Interactions | 每個 target 都有 action 與 Anchor；route 必須是存在的路由；以節點名稱為唯一鍵 | 部分（缺路由存在性） |
| 無障礙 | 每個 3D 互動都有對應的 DOM 操作入口 | 未做（目前工坊有側欄連結，燈塔與碼頭沒有，見 KNOWN_ISSUES P1-13） |
| 效能 | 依模組估算 draw call 與三角形數，對照預算 | 未做 |

建築驗證需要知道 GLB 子樹的尺寸，但驗證器不應為此載入整份 GLB。建議在 `derive-runtime-glb.mjs` 產生衍生檔時，順便輸出一份資產尺寸清單：每個子樹的局部範圍和 Anchor 相對位移，並記錄 SHA。驗證器只讀這份清單，測試再確認清單和實際 GLB 一致。

## 7. 程式生成與 Blender GLB 的分工

| 模組 | 建議來源 | 理由 |
|---|---|---|
| Terrain、Elevation、Ocean | R3F 程式生成（A2）；日後可換成 Blender 六角組件（方案 B），資料不變 | 版面要能隨資料變動，並由驗證器檢查 |
| Paths、Bridges | R3F | 長度與角度由版面決定 |
| Buildings、Landmarks | Blender GLB | 美術品質、節點契約、互動節點 |
| Vegetation | GLB 為主；大量散佈時可做 R3F instancing | 樹木數量增加後，用 instancing 控制 draw call |
| Interactions | 資料（registry／藍圖）＋R3F 解析 | 行為與幾何分離 |
| Effects | R3F（shader、HTML）；必要時使用 GLB emission | 由顯示狀態驅動 |
| NPC | Blender GLB（含骨架動畫），F 才開始 | 需要角色美術，且動畫成本高 |
| Quests | 資料插槽＋HTML／R3F 標記 | 內容在 F |

## 8. 保留 43 節點契約與 D.1／D.2b 成果

- **GLB 本身：** 衍生檔、provenance、43 節點契約檔與測試都不動。每份新 GLB 都要有自己的契約檔、provenance 與 SHA。
- **藍圖的引用方式：** 藍圖只用節點名稱引用子樹。取出子樹前，先對整份 GLB 執行 `checkGlbContract`（D.2b 已這樣做）。
- **D.1 的整島模式：** 正式 `/islands` 的 GLB 整島載入與 fallback 繼續保留，直到 D.2c 決定是否取代。藍圖格式不影響它。
- **D.2b 的資料：** `hexWorld` 與 `hexGlbSettlements` 會遷移成第一份藍圖。遷移時以快照測試確認三角形、道路剖面、放置位置完全一致，現有測試全部保留。

## 9. Coding 與 AI 群島共用同一套架構

- 同一份 `scene` schema、同一個渲染器、同一個驗證器；兩個群島只差 `archipelago` 欄位和世界配置裡的位置。
- AI 群島的主題差異放在資產清單（不同的 GLB 建築）與地形類型（例如資料中心、感測器），不需要新模組。
- 跨群島連線同樣用世界層級的橋或航線。

## 10. 避免重複 Phase E schema 與 Phase F RPG 系統

| 項目 | 歸屬 | 場景模組裡只放 |
|---|---|---|
| 島嶼 id、名稱、課程、群島分組、解鎖條件格式 | Phase E schema 本體 | 不重複，`scene` 只是其中一個區塊 |
| 解鎖判定、EXP、徽章、任務進度 | Phase F 進度層 | 唯讀的顯示狀態 |
| NPC 對話、任務內容 | Phase F 內容 | 插槽 id 與位置 |
| 鎖定橋樑、可前往島嶼的外觀 | 場景（Bridges、Effects） | 依顯示狀態切換樣式 |

## 11. 三個層級的工作、成本、風險與驗收

### Phase D 當前必需（不新增功能）

- **工作：**
  1. 把現有驗證整合成 `validateScene`，錯誤改為結構化格式並附錯誤代碼。
  2. 產生 GLB 資產尺寸清單。
  3. 在型別與註解中標出模組邊界（不改執行行為）。
  4. 把本文件列入 handoff 閱讀順序。
- **遷移成本：** 小到中，主要是重構驗證函式與測試。
- **風險：** 重構時改到現有行為。對策是以快照測試鎖定地形與放置結果。
- **驗收：**
  - 現有全部測試通過；
  - `validateScene` 對目前世界回傳空陣列；
  - 每個模組至少有一個「刻意弄錯就會被擋下」的測試；
  - 資產尺寸清單與 GLB 一致。

### Phase E 資料驅動擴充

- **工作：**
  1. 藍圖 JSON 與 JSON Schema 成為 E 島嶼 schema 的 `scene` 區塊。
  2. 三座島改用藍圖檔載入。
  3. 新增世界配置，涵蓋 8 座 Coding 島與 6 座 AI 島的位置。
  4. 提供驗證 CLI 給 AI 生成流程使用。
  5. 另外兩島遷移到連續地形與 GLB（需要先有對應資產）。
- **遷移成本：** 中到大，取決於新島的資產數量。
- **風險：**
  - schema 反覆修改：用 `scene.version` 與遷移函式處理。
  - AI 生成不合法的版面：用驗證器擋下。
  - 島數增加後效能變差：每島 draw call 有預算，遠景合併幾何。
- **驗收：**
  - 三座島由藍圖產生，結果與 D.2b 快照一致；
  - 加一座新島只需新增藍圖與資產，不改渲染程式；
  - 驗證 CLI 能指出錯誤所在的模組與 JSON 位置。

### Phase F 遊戲互動

- **工作：**
  1. NPC 與任務插槽接上 F 的內容與進度層。
  2. Effects 依顯示狀態切換，例如鎖定的橋、可前往島嶼的光暈。
  3. 互動行為新增任務觸發。
- **遷移成本：** 大。NPC 需要角色美術與動畫，任務需要內容與題庫。
- **風險：**
  - 狀態滲入場景：場景只接受唯讀顯示狀態。
  - 角色骨架動畫吃效能，手機尤其明顯。
  - 任務只能用 3D 觸發，缺少無障礙入口：每個任務點都要有 DOM 入口。
- **驗收：**
  - 進度層的單元測試不依賴 three；
  - 同一份藍圖在不同進度下只改變顯示狀態，幾何與放置結果不變；
  - 每個 NPC 與任務點都有鍵盤可操作的 DOM 入口。

## 12. 待決事項

- 藍圖存成 TypeScript 模組加 `satisfies`，還是 JSON 檔加 JSON Schema？前者型別安全，後者方便 AI 生成，也可兩者並存。
- 資產尺寸清單由 `derive-runtime-glb.mjs` 產生，還是另寫一支腳本？
- 世界配置中各島的相對位置，由人工決定，還是交給 AI 生成後再驗證？
- 是否在 Phase E 就導入 Blender 六角地形組件（方案 B）？
