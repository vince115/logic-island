# P3：四區域世界地圖整合——盤點與可行性

> 2026-11-12，多群島 v2 的 P3。這次只做**盤點、可行性分析與最小的清單整合**；沒有新增或修改任何 3D 模型、GLB、場景座標或功能旗標。
> 上層規劃見 [MULTI_ARCHIPELAGO_IA_V2](MULTI_ARCHIPELAGO_IA_V2.md)；區域地圖的既有架構見 [M3_1_REGIONAL_WORLD_ARCHITECTURE](M3_1_REGIONAL_WORLD_ARCHITECTURE.md)。

## 1. 現況盤點（分支 `archipelago/v2`）

| 項目 | 實況 | 證據 |
|---|---|---|
| 世界與區域路由 | `/`（正式首頁，5 島六角地圖，不受旗標控制）；`/world`、`/world/[region]`（M3.1 原型，`LOGIC_ISLAND_REGIONAL_WORLD=1` 才產生，noindex，頁首無連結）；`/islands`、`/islands/hex`、`/islands/candidate`、`/islands/legacy`（原型與受保護路由） | `src/app/page.tsx`、`src/app/world/**`、`src/lib/world/flag.ts` |
| 有 3D 地圖的區域 | **cs、ai**（`MAPPED_REGION_IDS`）。P1a 起 `/world/[region]` 只為這兩區產生頁面，`design`、`web` 一律 404 | `src/lib/islands/regions/region-layouts.ts`；`tests/route-contract.test.ts` 快照 |
| 正式 GLB | 只有基礎程式島 `public/models/islands/basics-island.v2.1.glb`；資料庫島、LLM 島只有節點契約（`PLANNED_GLB_ASSETS`），沒有檔案 | `src/lib/islands/asset-registry.ts`、`glb-island-contract.ts` |
| AI 區地圖 | 7 座「規劃中」聚落，各為 19 格程式生成六角地塊（`PLANNED_SHAPE`），沒有模型；橋與座標已在 M3.1 批准為最終 | `region-layouts.ts:53-80` |
| 世界總覽構圖 | 兩區並排加中央樞紐：`ANCHORS.wide = { cs: [-24, 0], hub: [0, 2], ai: [24, 0] }`；手機為上下排列 | `src/components/world/world-overview-scene.tsx:26-29` |
| 地標與 Marker | 首頁與區域地圖共用 hex-world 的名牌、POI 面板、手機圓點名牌；規劃中聚落顯示「學科代碼 X · 規劃中」 | `src/lib/world/learning-islands.ts:41-48` |
| 相機 | `HexWorldExplorer`：自動取景、拖曳旋轉、縮放、Esc 返回；區域頁有 `baseAzimuth`（桌機／手機各一） | `regional-world-explorer.tsx` |
| 行動裝置 | 手機改用圓點名牌、按鈕列在地圖下方、44 px 觸控目標；真機效能仍未量測（D.3-4B） | `docs/handoff/DEVICE_ACCEPTANCE.md` |
| 島嶼截圖 | `public/images/islands/` 6 張（foundations、structures、algorithms、databases、labs、overview），由首頁 3D 地圖截取 | P2 側欄只對這些島顯示圖片 |

## 2. 這次做了什麼（最小整合）

- `/world` 世界總覽的導覽清單加入 `design`、`web` 兩區：標示「規劃中」、主題島數、大綱堂數與「尚無 3D 地圖」，連到 `/curriculum#region-<id>` 的大綱，**不連到任何地圖頁**。3D 場景本身不變（仍是兩區＋樞紐）。
- 仍在旗標之後；正式首頁 `/` 不變。
- `/curriculum` 與側欄在 P2 已能讓使用者看到四個區域（不需要旗標）。

## 3. DESIGN／WEB 進入 3D 世界的方案

| 方案 | 內容 | 新資產 | 成本（估計） | 風險 |
|---|---|---|---|---|
| A 只有清單（**目前狀態**） | 側欄、`/curriculum`、`/world` 清單中標示規劃中 | 無 | 已完成 | 3D 世界與課綱的區域數不一致（2 對 4），需在清單說明「尚無 3D 地圖」 |
| B 程式生成的規劃中區域 | 比照 AI 區：每島一個 19 格六角聚落、橋與港口，全部 `planned`；`REGION_LAYOUTS` 加兩區；總覽改為四區＋樞紐 | **無 GLB**；只有程式生成的地塊 | 2–4 個工作天：座標與 `validateRegion` 驗證、總覽四區構圖（寬螢幕 2×2 或環狀、手機直排）、相機取景、名牌避讓、`e2e/regional-world.spec.ts` 更新、效能量測 | 總覽 draw call 約增加 40–60%（M3 預算：桌機 150、手機 100，為暫定值）；**改動已批准為最終的 M3.1 總覽構圖**，需要重新批准 |
| C 正式美術 | 為 design／web 製作 GLB（例如設計工作室、網頁港口） | 8 座島的 Blender 建模與 GLB | 數週；依 M3.2 管線 | Blender MCP 協定相容性（M3 決策 E）、資產保全庫流程、真機效能未知 |

## 4. 建議

1. **維持方案 A**，直到 design／web 有第一批已開放的課。目前兩區 0 堂可學，把它們放進 3D 世界只會增加「看得到、進不去」的島。
2. 若要讓 3D 世界與四區一致，下一步是**方案 B 的設計稿**（不寫程式）：四區總覽的寬／窄構圖、兩區的六角座標草案與 `validateRegion` 結果。這會改動已批准為最終的 M3.1 總覽，需先取得批准。
3. 方案 C 依 M3.2 的 GLB 管線另案處理，不在 v2 範圍。
4. 任何方案都不移除 `LOGIC_ISLAND_REGIONAL_WORLD`，也不更換正式首頁（M3 決策 A）。

## 5. 驗證

- `tests/regional-world.test.ts`：只有 cs、ai 有地圖與 `/world/<id>` 連結；design、web 由 `unmappedRegions()` 列為規劃中。
- `tests/route-contract.test.ts`：兩個旗標都開時 `/world/[region]` 仍只有 `ai`、`cs`。
- 旗標建置的 `/world` 頁面以瀏覽器確認清單（見 IA v2 §10 實作紀錄）。
