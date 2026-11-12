# 2026-10-30 Phase D.3：37 格基礎程式島整合進正式 `/islands` 的方案分析

> 授權範圍：D.2c-1（`f99f858`）與 D.2c-2（`42b32bc`）驗收完成；進入 Phase D.3，**本輪只分析與提出方案**，不改程式、不 commit／merge／push。不改 GLB 與保全庫，不提前實作 Phase E／F，不遷移另外兩座島的美術資產，P1-11 只保留追蹤。
>
> 依據：分支 `phase-d/basics-glb` 在 `42b32bc` 的實際程式；`docs/handoff/NEXT_STEPS.md` §5（Phase D 驗收門檻）、`ROADMAP.md`、`SCENE_MODULES.md`、`KNOWN_ISSUES.md`。

## 0. 結論先講

1. **只保留一個渲染器：** 以 `HexWorldScene` 為唯一的世界地圖渲染器。正式 `/islands`、37 格「渲染實驗室」與（過渡期的）預覽頁都用它，只差一組具名的設定（profile）。正式 `/islands` 現有的整島 GLB 渲染器（`IslandScene` 系列）在過渡期保留作回退，D.3 驗收後移除。
2. **只保留一個 Explorer：** 把正式版 `IslandsExplorer` 的「3D／清單切換、錯誤邊界、WebGL 失效轉清單」和 `HexWorldExplorer` 的「HTML 地點入口、共用說明狀態」合成同一個元件。目前 hex 版**缺少錯誤邊界與清單模式**，必須先補齊才能取代正式版。
3. **另外兩島沿用 37 格世界裡已有的六角聚落與暫代地標**（`HexLandmarks`），不新增或搬移美術；教材入口照舊由側欄提供。這會讓這兩島在 `/islands` 的外觀由「原創幾何浮島」變成「六角聚落＋簡單暫代地標」，**需要產品確認**（§7、§10）。
4. **施工順序：** 先建立安全網與基準（D.3-0）→ 抽出正式設定與資料、畫面逐像素不變（D.3-1）→ 合併 Explorer（D.3-2）→ `/islands` 切換、舊版保留回退（D.3-3）→ 正式驗收含真機（D.3-4）→ 移除舊渲染器與預覽頁（D.3-5，另行批准）。每步獨立 commit、可單獨 revert。

## 1. 現況差異

### 1.1 路由與頁面

| 路由 | 元件 | 世界資料 | 索引 | 現況 |
|---|---|---|---|---|
| `/islands` | `IslandsExplorer` → `IslandScene`（`next/dynamic`，`ssr:false`） | `data.ts` 的 `islands`（手填 `position`／`bounds`） | 可索引 | 正式版，D.1 整島 GLB |
| `/islands/hex` | `HexWorldExplorer` → `HexWorldScene` | `hexWorld`（A2，基礎島 8 格） | noindex | D.2a／D.2b 預覽 |
| `/islands/hex/scale/[variant]` | `HexScaleExplorer` → `HexWorldExplorer` → `HexWorldScene` | `scalePrototypes['19'|'37'].world` | noindex，SSG 兩頁 | 尺度原型；37 格＝D.2c 成果 |

三個 page 各自重複一段「`islands` → `learningIslands`」的轉換。網站導覽目前沒有連到 `/islands`（只有預覽頁的返回連結），所以切換不涉及導覽列。

### 1.2 元件與狀態

| 項目 | 正式 `/islands` | 37 格原型 |
|---|---|---|
| Explorer 狀態 | `mode`（3d／list）、`selectedId`、`available`、`ready` | `selectedId`、`available`、`ready`、`infoNode`（3D 與 HTML 共用的說明狀態） |
| 3D／清單切換 | 有；WebGL 不可用時自動切到清單 | **沒有**；只顯示提示，側欄一直在 |
| 錯誤邊界 | `SceneBoundary`：場景丟錯 → 清單模式 | **沒有**：場景元件丟錯會讓整個 Explorer 失效 |
| 島嶼渲染 | `Island`：整島 GLB（`GlbIslandModel`，scale 0.6）或原創幾何（`models/*`）＋選取光環＋名牌 | 六角地形（`HexTerrainMesh`）＋ GLB 子樹放在地塊上（`HexGlbBuildings`）＋暫代地標（`HexLandmarks`） |
| 名牌 | 一直顯示，聚焦時 `aria-pressed=true` | 全景顯示在島外側；**聚焦後隱藏**（工具列顯示島名），`aria-pressed` 固定 false |
| Anchor 標籤 | 完整文字（「工坊 · 學習路線」） | 精簡標記（「工坊」） |
| 說明框 | 3D 泡泡 `role=status`，元件內部狀態 | HTML 地點面板（`role=status`）＋桌機 3D 泡泡鏡像（`aria-hidden`），手機只用面板 |
| 點擊判定 | GLB 網格本身 | GLB 網格＋隱形碰撞代理（手機可點到碼頭） |
| hover | 有（光環變亮） | 沒有 |
| 頁面附註 | BFS 原教材頁連結（BFS 尚未對應任何島） | 沒有 |
| 測試掛勾 | 無 | `PerfProbe`：`canvas.__hexPerf／__hexProject／__hexView／__hexZoom`（**原型專用，不能進正式版**） |

### 1.3 相機

| 項目 | 正式 `CameraController` | 原型 `HexCamera` |
|---|---|---|
| 取景 | `setLookAt` 偏移 (20, 19, 24)＋`fitToBox`（手填 bounds） | 固定視角 `VIEW`＝(16, 21, 24)，依島嶼實際輪廓與建築高度的投影點算 zoom（`fit`），扣掉上方標題與下方提示列 |
| 聚焦範圍 | `getFocusBounds`（手填） | 該島的內容點 |
| 互動 | 不可旋轉／平移；觸控雙指縮放；`minZoom 4`、`maxZoom 150`；reduced motion 時不動畫 | 相同 |

`camera-controller.tsx` 在過去各輪列為受保護檔案；切換後它只服務舊渲染器，移除需另行批准（D.3-5）。

### 1.4 渲染設定

兩邊都是 `orthographic`、`frameloop="demand"`、`dpr={[1,1.5]}`、MSAA、PCF 陰影。37 格另有：靜態陰影貼圖、樹木 LOD、深海外框、自然地形與海面、合併道路、廣場（D.2c-1／D.2c-2）。

## 2. 可直接共用與原型專用的程式

| 類別 | 檔案 | 判定 |
|---|---|---|
| 純資料／演算（lib） | `hex.ts`、`hex-world.ts`、`hex-terrain.ts`、`hex-terrain-natural.ts`、`hex-natural-scene.ts`、`hex-route-parts.ts`、`hex-buildings.ts`、`tree-lod.ts`、`glb-contract.ts`、`glb-parts.ts`、`interaction-targets.ts`、`asset-registry.ts`、`types.ts` | **直接共用**，已有單元測試 |
| 37 格世界資料 | `hex-scale-prototype.ts` 的 37 格部分（世界、GLB 配置、自然配置） | **共用，但要搬家**：目前和 19 格、尺度比較工具寫在同一檔，且模組載入時**同時算出 19 與 37 兩份世界**。正式版應只匯入 37 格（D.3-1） |
| 渲染元件 | `hex-world-scene.tsx`、`hex-camera.tsx`、`hex-terrain-mesh.tsx`、`hex-ocean.tsx`（`HexNaturalOcean`）、`hex-nature.tsx`、`hex-plaza.tsx`、`hex-routes-merged.tsx`、`hex-glb-buildings.tsx`、`hex-landmarks.tsx`、`hex-poi-panel.tsx` | **直接共用** |
| 兩邊都用 | `learning-navigation.tsx`、`islands.module.css` | **已共用** |
| 原型專用 | `hex-scale-explorer.tsx`、`/islands/hex` 與 `/islands/hex/scale/[variant]` 兩個 page、`PerfProbe`、`hex-tiles.tsx` 的地塊模式、`hex-routes.tsx`（逐段道路）、`HexOcean`（連續海面）、`forestInstances`／`coastRocks`（19 格與 A2）、`lighting: 'preview'`、`hexWorld`（A2）、19 格資料 | 保留到 D.3-5，之後退役（git 歷史保留 `fa3a9a9`／`42b32bc`） |
| 舊正式渲染器 | `island-scene.tsx`、`island.tsx`、`glb-island-model.tsx`、`camera-controller.tsx` | 過渡期回退，D.3-5 移除 |
| 原創幾何模型 | `models/*`（`BeaconWorkshop`、`DataHarbor`、`AlgorithmObservatory`、`details`、`terrain`） | 由 `assetRegistry` 與 `IslandDefinition.modelId` 引用。建議**保留到 Phase E schema 定案**，避免先改型別再被 schema 改一次 |

另外 `hex-world-scene.tsx` 的 `HexSceneOptions` 已累積 17 個獨立開關，正式版、實驗室、A2、19 格各自在 Explorer 裡組合。這是「看起來一個渲染器、實際上多套組合」的主要風險，D.3-1 改成具名 profile。

## 3. 如何避免同時維護兩套世界地圖渲染器

1. **具名 profile（D.3-1）：** 新增 `HexSceneProfile`，至少有：
   - `production`：37 格目前在用的全部設定，加上 `shadows: 'static'`、`treeLod: 24`；
   - `lab`：`production`＋`perfProbe`，供渲染檢查；
   - `a2Preview`、`scale19`：只在 D.3-5 前存在。
   
   LOD 門檻由 Explorer 移進 profile，先滿足 P1-24 的「不綁在 Explorer」；Phase E 再移到 schema 的 `scene` 區塊。
2. **單一資料來源（D.3-1）：** 37 格世界與自然配置移到正式資料模組，19 格比較工具改為只在原型頁使用。以資料 hash 單元測試鎖定，搬移後結果必須和 `42b32bc` 完全相同。
3. **單一 Explorer（D.3-2）：** 合併後的 Explorer 只吃 `world`＋`profile`；頁面差異（標題、返回連結、尺度切換）以 props 或 slot 傳入，不再複製元件。
4. **單一 `learningIslands` 轉換：** 抽出 `getLearningIslands()`，三個 page 共用。
5. **退役（D.3-5）：** 正式驗收後移除舊渲染器；`/islands/hex` 與 `/islands/hex/scale/19` 以 `next.config` 的 `redirects` 導回 `/islands`（Next 16：`node_modules/next/dist/docs/01-app/02-guides/redirecting.md`；Next 16 的 middleware 已改名 `proxy`，本案不需要）。`/islands/hex/scale/37` 是否保留為 noindex 實驗室由 §10 決定。

過渡期（D.3-3 到 D.3-5）會同時存在新舊兩條路徑，但舊路徑**凍結不再開發**，只用於回退與對照。

## 4. GLB 契約、Anchor、HTML 地點入口、鍵盤與 fallback 的保留

| 項目 | 目前 37 格怎麼做 | 整合要求 |
|---|---|---|
| Node Contract | `HexGlbBuildings` 先對整份 GLB clone 跑 `checkGlbContract`，才取子樹 | 不變；`tests/islands-glb*.test.ts` 與契約測試全保留 |
| Anchor | 由 GLB 取出 Anchor 相對位移，跟著子樹轉動；精簡標記不攔截點擊；`route_exit` 無標籤 | 不變。正式版的 Anchor 文字由「完整」改為「精簡」，屬 UI 變更，測試改驗「存在、位置、不攔截點擊」 |
| 3D 點擊 | `resolveTarget` 向上找語意節點；碰撞代理放大小目標 | 不變 |
| HTML 地點入口 | `HexPoiPanel`：觸控與鍵盤等價、與 3D 共用 `infoNode` | 併入正式 Explorer。這同時處理了正式版的 P1-13（燈塔／碼頭說明原本只能 3D 點） |
| 鍵盤 | 名牌（Html button）→ 地點面板 → 側欄島嶼按鈕（DOM 順序）；Enter／Space | 補齊 tab 順序與 focus 樣式驗收；reduced motion 時相機不動畫 |
| GLB 載入失敗／契約不符 | 換成 `HexLandmarks` 暫代建築與圓錐樹；地點面板仍可用；靜態陰影跟著更新（E2E 已驗） | 不變；E2E 從 `/islands/hex/scale/37` 移到 `/islands` |
| WebGL 不可用／context lost | Canvas `fallback`＋`onUnavailable` 顯示提示 | **補上**正式版的行為：自動切到清單模式並停用「3D 群島」按鈕 |
| 場景丟錯 | 無 | **補上** `SceneBoundary` |
| 教材可達性 | 側欄 5 份教材＋`/learn` | 保留頁面附註的 BFS 連結（六份教材都可到達，NEXT_STEPS §5.3） |

## 5. 正式環境驗收標準

### 5.1 功能（E2E，在 `/islands`）

- 三座島都能用名牌、點地塊、側欄按鈕聚焦。
- 教材數正確（資料結構島 3、演算法島 2），BFS 連結存在。
- 工坊 3D 點擊與地點面板都前往 `/learn`；燈塔、碼頭的說明在 3D 與面板都能開關。
- 桌機用鍵盤、手機用觸控；Anchor 與名牌不攔截畫布點擊；全景名牌不蓋住地塊、不超出畫面。
- GLB 404 與契約節點缺失時回到暫代建築，地點面板仍可用；WebGL 不可用時自動進入清單模式；reduced motion。
- 只請求本站資源（不抓 Draco decoder）；console 沒有錯誤；**正式頁的 canvas 上沒有 `__hex*` 掛勾**。

### 5.2 畫面（逐像素）

D.3-1 到 D.3-3 不應改變 3D 畫面。在固定鏡頭下，以下畫面和 `42b32bc` 的 37 格逐像素比對，畫布內 0 像素差（頁面外框文字另外比對）：

- 桌機 DPR 1 的全景與聚焦；
- Retina 桌機（DPR 2）；
- 手機模擬（iPhone 13）的全景與聚焦。

截圖存在 scratch，不進 repo（二進位政策，P1-10）。

### 5.3 效能

- **方法：** 沿用 D.2c-2 的量測（production build，SwiftShader 5 輪、Metal 3 輪輪流量測，synced frame time、rAF FPS、draw call、三角形、DPR）。單次 rAF 數字不作依據（P1-20）。
- **門檻：**
  - 四個場景（桌機／手機 × 全景／聚焦）不低於 D.2c-2 紀錄的 95%；
  - 閒置 rAF 請求為 0；
  - 整個場景主 pass 的 draw call：全景 ≤ 45、聚焦 ≤ 30；
  - GLB ≤ 1.5 MiB（目前 879,708 bytes）。
- **單島預算（NEXT_STEPS §5.5：手機 ≤ 25、桌機 ≤ 35 draw calls，材質 ≤ 10）：** 目前只有整個場景的數字（聚焦 26 含部分鄰島）。D.3-0 要先做「依島歸屬」的拆分；若基礎島在手機超過 25，再決定是調整預算定義還是合併靜態網格。另外兩島的 `HexLandmarks` 每個網格各有自己的材質，可能超過材質預算，需同時量測。
- **載入：** 以 4× CPU 降速的手機模擬量「從進頁到第一幀」的主執行緒時間，對照舊 `/islands`。自然地形、海面網格與 LOD 都在載入時計算，19 格世界也會被一起算出來（D.3-1 會移除）。
- **舊版對照：** 同時量舊 `/islands`，只作紀錄不設門檻。舊場景較簡單，數字可能較好，需讓決策者看到差距。

### 5.4 真機（保留在 D.3，P1-25）

- 至少一台 iPhone、一台 Android，分開記錄。
- 量全景、聚焦、雙指縮放時的 FPS（Safari Web Inspector／Chrome 遠端偵錯的 timeline）。
- 確認工坊、燈塔、碼頭的觸控命中、地點面板、旋轉方向、reduced motion，以及長時間操作是否發熱或當掉。
- 需要使用者提供裝置。若要從手機連到本機 production server（區網），或改用預覽部署（屬部署授權），需先決定方式。

### 5.5 回歸

每一步都要有當期結果，含 lint、strict TypeScript、unit、clean build、全套 E2E。P1-11 的 3 項 player 失敗照舊獨立追蹤，不計入本階段。

## 6. 37 格整合後，另外兩座暫代島嶼如何維持既有功能

| 功能 | 做法 |
|---|---|
| 聚焦 | 名牌、點地塊、側欄按鈕（hex 已有） |
| 教材入口 | 側欄 `LearningNavigation`，資料不變（`courseSlugs`） |
| 模型狀態 | 名牌 `data-model-source="geometry"`（與舊版測試同義） |
| 3D 內容 | 37 格世界中已有的六角聚落、自然地形、暫代地標（`HexLandmarks`）、圓錐／GLB 樹與橋樑。**不**搬移 `DataHarbor`／`AlgorithmObservatory` 的幾何，**不**新增建築 |
| 地點面板 | 沒有 GLB 目標，所以不顯示（與現況相同）；Phase E 依 schema 加上 |
| 回退 | 沒有 GLB，不會失敗；WebGL 不可用時同樣進清單 |

外觀會改變：舊版是較精緻的原創幾何浮島，37 格世界中是較簡單的暫代地標。替代方案是讓這兩島沿用舊版的浮島模型，但那會在同一張圖混用兩種風格，且模型自帶浮島地形，無法放上六角地塊，硬放等於美術遷移，不建議。

## 7. 分階段整合方案

| 步驟 | 內容 | 規模 | 會改到的使用者畫面 |
|---|---|---|---|
| **D.3-0 基準與安全網** | ① 補舊 `/islands` 行為的 E2E 契約：清單模式、錯誤邊界、WebGL 不可用、BFS 連結；<br>② 把 scratch 的資料 hash 檢查正式化為單元測試；<br>③ 依島拆分 draw call／材質；<br>④ 舊 `/islands` 與 37 格的效能、載入基準 | 小 | 無 |
| **D.3-1 正式設定與資料** | `HexSceneProfile`（production／lab／a2Preview／scale19）；37 格資料搬到正式模組；`treeLod` 進 profile；`PerfProbe` 只在 lab；`getLearningIslands()` | 小～中 | 無（逐像素相同） |
| **D.3-2 合併 Explorer** | 一個 Explorer：清單模式、`SceneBoundary`、WebGL 失效轉清單、地點面板、共用說明狀態；預覽頁與實驗室改用它 | 中 | 37 格原型多了清單切換與錯誤處理 |
| **D.3-3 切換 `/islands`** | `/islands` 改用 production profile 與 37 格世界；舊渲染器移到過渡用的 noindex 路由（建議 `/islands/legacy`）作回退與對照；E2E 改寫為新契約 | 中 | 是：正式地圖換成 37 格聚落 |
| **D.3-4 正式驗收** | §5 全部項目，含真機；更新 handoff 與測試紀錄 | 中（需使用者參與真機） | 無 |
| **D.3-5 清理（另行批准）** | 移除舊渲染器與 `/islands/legacy`；`/islands/hex`、`/islands/hex/scale/19` 改 redirect；刪除 A2／19 專用程式與測試；`camera-controller.tsx` 一併移除 | 小 | 預覽網址改導向 |

每一步獨立 commit，可單獨 revert。D.3-1、D.3-2 完成後若暫停，正式 `/islands` 仍是舊版，沒有半套狀態。

## 8. 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| hex Explorer 缺錯誤邊界與清單模式 | 場景出錯時整頁失效，比舊版退步 | D.3-2 先補，D.3-3 才切換；E2E 驗證 |
| 測試契約改變（名牌聚焦後隱藏、精簡 Anchor、說明鏡像） | 舊 E2E 會失敗，若隨手改測試可能掩蓋真正的回歸 | 先列「需求層級」清單（§5.1），測試改驗需求而非 DOM 細節；新舊對照表寫進 log |
| 另外兩島外觀變簡單 | 使用者可能覺得退步 | 產品確認（§10）；截圖對照 |
| 真機效能未知（P1-25） | 低階手機可能卡頓 | D.3-4 真機；不足時的選項（移動中暫時降 DPR 等）都會改變畫面，需另行批准 |
| 原型掛勾流入正式版 | 暴露內部函式 | profile 控制，並以 E2E 檢查正式頁沒有 `__hex*` |
| 載入時計算量 | 手機首幀變慢 | D.3-1 移除 19 格的計算；D.3-0 量基準，必要時在建置時預算 |
| 靜態陰影只適用靜態場景（P1-23） | 正式場景目前沒有移動物件，無影響 | 維持限制紀錄 |
| 單島 draw call／材質預算 | 可能超過 NEXT_STEPS §5.5 | D.3-0 先量；超過時另提方案 |
| 雙路徑維護期拉長 | 回到「兩套」 | 舊路徑凍結；D.3-5 設在 D.3-4 驗收之後的固定時點 |

## 9. 回退機制

1. **程式：** 每步獨立 commit，`git revert` 即可。
2. **D.3-3 到 D.3-5 的過渡期：** 舊渲染器保留在 `/islands/legacy`（noindex），舊版 E2E 繼續跑。要回退，只需把 `/islands` 的 page 改回渲染舊 Explorer（單一 commit）。
3. **執行期：** GLB 失敗 → 暫代建築；WebGL 不可用或場景出錯 → 清單模式；教材永遠可從側欄與 `/learn` 到達。
4. **資料：** A2 與 19 格的完整程式保留在 git 歷史（`fa3a9a9`、`42b32bc`），退役後仍可還原。

## 10. 需要批准或決定的事項

1. 是否批准 D.3 依 §7 的順序施工，先做 D.3-0～D.3-2（正式 `/islands` 暫時不變）？
2. 另外兩島在正式 `/islands` 使用 37 格世界中的六角聚落與暫代地標（外觀比舊版簡單）？
3. 名牌行為採 37 格版（聚焦後隱藏名牌、工具列顯示島名），Anchor 採精簡標記？
4. 過渡期以 `/islands/legacy` 保留舊渲染器；D.3-5 時 `/islands/hex/scale/37` 是否保留為 noindex 實驗室？
5. 真機驗收的方式：區網連本機 production server，或預覽部署（部署需另行授權）；以及可用的 iPhone／Android 型號。

## 11. 測試計畫

| 步驟 | 單元 | E2E | 畫面 | 效能 |
|---|---|---|---|---|
| D.3-0 | 資料 hash 測試（A2、19、37） | 舊 `/islands` 的清單模式、錯誤邊界、WebGL 不可用、BFS | 37 格基準截圖（scratch） | 舊版與 37 格的基準；依島 draw call／材質 |
| D.3-1 | profile 內容測試（正式 profile 沒有 `perfProbe`）；資料 hash 不變 | 現有 `hex-*` 全過 | 與 `42b32bc` 逐像素相同 | 與 D.2c-2 相同（±5%） |
| D.3-2 | — | 新 Explorer：清單切換、錯誤邊界（注入錯誤）、WebGL 不可用、地點面板 | 同上 | 同上 |
| D.3-3 | — | `/islands` 依 §5.1 全部改寫；`/islands/legacy` 跑舊版測試；全套 E2E 重複 3 次 | `/islands` 與 37 格實驗室逐像素相同 | 四場景輪流量測 |
| D.3-4 | — | 全套＋手機 360 px 寬、桌機 1280×720、Retina | 驗收截圖 | 真機 iPhone／Android |
| D.3-5 | 移除 A2／19 測試，保留 37 格與共用 lib 測試 | redirect 測試；`/islands` 全過 | — | — |

所有建置、E2E 與量測都在隔離副本執行，不使用 port 3100。
