# 2026-11-03 M3.1 Regional World Prototype

## 指示範圍

- 使用者批准 M3.1 的 Regional World 架構，允許建立 `/world` prototype。
- 範圍：只做世界架構、導覽、Layout、鏡頭與效能驗證。
- **不批准**：正式 GLB 建模、替換首頁。
- 可以有本地 commit，但只 Stage 自己的檔案；不 Push、Merge、Deploy。
- 完成後停止，不開始 M3.2。

## 起點

- `phase-d/basics-glb` @ `5fa8726`。
- Theme Session 的 5 個未提交檔案與 `.claude/` 仍在工作樹：
  - 本次沒有修改、還原或提交；
  - 開始與結束的 MD5 相同。
- 所有 build、測試、截圖與效能都在隔離副本執行，不含 Theme 的修改：
  - `scratchpad/m31/app`：HEAD＋本次檔案，flag on；
  - `scratchpad/m31/off`：同樣的來源，flag off。

## 實作

### Feature Flag 與路由

- **`src/lib/world/flag.ts`**：只在 `LOGIC_ISLAND_REGIONAL_WORLD=1` 時開啟，只在伺服器端讀取。
- **`src/app/world/page.tsx`**：flag 關閉時，prerender 階段呼叫 `notFound()`。
  - 依 Next.js 16 文件，這會產生 static 404：build 輸出 `world.meta` 的 status 是 404。
- **`src/app/world/[region]/page.tsx`**：
  - `dynamicParams = false`；
  - flag 關閉時 `generateStaticParams` 回傳空陣列，所以 `/world/cs`、`/world/ai` 與任何 segment 都是 404。
- **不靠前端隱藏**：路由本身就不存在；頁面 `noindex`，全站沒有任何連結。
- **`?island=<id>`**：在 client 端以 `useSearchParams` 讀取，外層包 `Suspense`。

### 區域 Layout（只有空間資訊）

- **`src/lib/islands/regions/region-layouts.ts`**：
  - CS 區沿用首頁的 `ISLANDS_LAYOUT`／`DATABASES_SPEC`。
  - 用常數 export 取得，數值不變：`islands-world.ts` 只把兩個常數改成 export。
- **`assembleLayout`**：加上選用的 `planned` 聚落，是加法式修改；首頁世界的指紋與首頁測試都通過。
- **身分不重複**：島嶼的名稱、狀態與課數只讀 world registry，沒有第二套 registry。
- **`src/lib/islands/regions/validate-region.ts`**：Region Layout Validator，建立在 `validateHexWorld` 之上，另外檢查：
  - registry 身分；
  - 島間至少 2 格水；
  - 橋跨 1–3 格水；
  - 港口落在平地、非森林／岩石／廣場／海岸、非地標格、非懸崖沙灘、不鄰接碼頭；
  - 道路不穿越地標；
  - 碼頭面向海。
- 地標格不另抄一份：
  - 程式產生的地標，由 `hex-landmarks.tsx` 新增的 `placeholderLandmarkTiles` 提供；
  - GLB 地標取自擺放資料；
  - 資料庫島取自 `DATABASE_LANDMARKS` 與平台格。

### 三層導覽

- **總覽**（`src/components/world/`）：
  - 兩區與樞紐是低細節輪廓（合併網格，不載入 GLB），加航線；
  - 桌機橫排、手機直排；
  - 名牌是 HTML 按鈕，位置由相機投影算出；
  - 「世界導覽」清單一直都在。
- **區域地圖**：共用 `HexWorldExplorer`，加了兩個選用參數，首頁不傳、行為不變：
  - **受控選取**：URL 是唯一來源；選島時 push，返回／前進還原，未知 id 用 replace 移除；
  - **預設方位角**。
- **Escape**：聚焦 → 區域 → 總覽。
- **頁首**：「世界總覽」返回鍵；`/world` 頁首也像首頁一樣浮在地圖上（`header.tsx`）。

### 規劃中島嶼（霧中小島）

- **地形**：19 格低細節島，上面一層半透明霧與測量樁（2 個 draw call）。
- **標示**：
  - 名牌顯示「規劃中」，`aria-label` 加「（規劃中）」；
  - 手機是空心圓點；
  - 清單顯示「規劃中 · 預計 N 堂」。
- **面板**：只有學科簡介與「規劃中預計 N 堂，尚未開放課程」。
  - 沒有課程連結、進度、「已開放」，也沒有地標或 GLB。

## Layout 驗證與 DB–SA 港口

最終座標以 `validateRegion` 驗證，0 個問題；所有島之間至少 2 格水。

| 區 | 島（中心） | 新橋（水格） |
|---|---|---|
| CS | F (0,0)、DS (8,−8)、AL (10,−2)、DB (2,−9)（四島與首頁逐項相同）；PL (5,6)、CN (16,−10)、SA (8,−16)、MIS (7,−22) | AL–PL（2，沿用原本實驗島橋的兩個港口）、DS–CN（3）、DB–SA（3）、SA–MIS（2）；碼頭沿用 F 的 `foundations-dock` |
| AI | AIF (0,0)、ML (−1,−6)、DL (0,−13)、LLM (−7,−10)、GEN (−2,−18)、AG (−8,−3)、OPS (−7,3) | 全部 2 格，只有 LLM–GEN 是 3 格；碼頭在 AIF (1,1) 與 OPS (−7,5) 的南岸 |

- **與 M3.0 草案不同的地方**：
  - F 的四周都已用掉：西邊是丘陵、西南是碼頭、北邊是燈塔、東邊是既有橋，沒有能接 PL 的港口。所以 PL 改由 AL 接，CN 改由 DS 接。
  - 新島放在「仍保留 2 格水、又有合法直橋」的最近位置。
- **DB–SA 港口修正**：
  - 由平台格 (2,−11)（緊鄰資料庫主塔 (2,−10)）改為 DB 東北岸 (4,−10)。
  - 道路是 (2,−9) → (3,−9) → (4,−10)，經過複寫雙塔 (3,−10) 旁，不穿過它。
  - 單元測試驗證了路徑；也有反向測試：放回舊港口時，validator 會報錯。
- **四座既有島的樹木與岩石**：與首頁相同（89 棵、78 顆，逐一比對，snapshot）。新道路沒有移走任何一棵樹或一顆岩石。

## 手機鏡頭方案比較

島寬是最小那座島在畫面上的寬度：

- **定案那兩列**：以 production build 的場景投影（`__hexProject`）**實測**，含名牌所需的空間。
- **其他列**：以相同取景公式**推估**，不含名牌空間。
- **畫面尺寸**：桌機 1440×1000，含右側 340 px 清單；手機是 iPhone 13 的實際舞台 390×434。

| 方案 | 桌機 | 手機 | 來源 |
|---|---:|---:|---|
| 現在 5 島首頁（基準） | 264 | 89 | 推估 |
| CS 草案（37 格、草案座標） | 133 | 48 | 推估 |
| A：規劃島 19 格 | 143 | 52 | 推估 |
| A＋B：19 格＋緊湊座標 | 185 | 63 | 推估 |
| A＋B＋C：再加方位角（桌機 295°、手機 105°） | 240 | 78 | 推估 |
| **CS 定案** | **181** | **73** | **實測** |
| AI 草案（37 格） | 222 | 80 | 推估 |
| AI 19 格＋緊湊 | 261 | 94 | 推估 |
| **AI 定案** | **209** | **85** | **實測** |

- **桌機**：兩區都達到 180 px，名牌都在畫面內、不重疊、不在清單下（E2E 驗證）。
- **手機未達 88 px**：CS 73、AI 85。
  - 使用者暫時接受替代方案：每個圓點 44 px 的觸控區（E2E 驗證）、清單導覽、島嶼聚焦。
  - **列為正式上線前的限制，不是通過。**
  - 沒有為了達標而再壓縮島距或破壞橋。
- **名牌空間**：區域地圖的縮放約為首頁的一半，長名牌需要更多空間。
  - 加了 `labelReach`，只對左右兩側的名牌生效。
  - 桌機的規劃中名牌改為「名稱上、規劃中下」兩行，比較窄。

## GLB 契約（只驗證，不建模）

- **`src/lib/islands/glb-island-contract.ts`**：比例 0.6；根節點、目標、anchor 的命名；`Anchor_Entry`／`Anchor_Route_Exit`；pivot 與尺寸。
- 這是作者端的規則。執行時仍由 Phase D.1 的 `checkGlbContract` 檢查。
- **數值直接從 v2.1 GLB 讀取**（唯讀，檔案沒有改）：
  - 燈塔與工坊：pivot 在底部中心（最低點 y = 0）；
  - 碼頭：pivot 在岸邊端，向下延伸到 −1.4；
  - 燈塔高 4.36、工坊高 3.23（GLB 單位）。
- **建築高度規則修正**：M3.1 提案原本寫「建築 ≤ 燈塔一半」，但 v2.1 的工坊就超過，所以改為「建築 ≤ 3.3」。
- **DB 與 LLM 原型先宣告節點**：
  - DB 沿用 Transitional Art 的四個節點名稱；
  - 兩者都還沒有檔案、沒有 URL，也不在 runtime registry。

## 驗收

### 測試（隔離副本，不含 Theme 修改）

| 檢查 | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| Vitest（全部，JDK 在 PATH） | **1580 passed**／0 failed／0 skipped（F.1e 1562；新增 `regional-world` 12 項、`glb-island-contract` 6 項） |
| Build（flag on） | 成功，100 頁（`/world`、`/world/cs`、`/world/ai`） |
| E2E 全套（flag on，desktop＋mobile） | **417 passed／44 skipped／3 failed**；3 項都是既有 P1-11（`player.spec.ts`，與 F.1e 相同的三項）；新增 16 項通過；skipped 多 4 項（flag-off 2 項、手機 hover、桌機的手機觸控區） |
| Build（flag off） | 成功；`/world` 是 static 404，`/world/[region]` 沒有頁面 |
| E2E（flag off：regional-world、home-databases、islands、islands-candidate、hex-scale） | **111 passed**／23 skipped（flag-on 測試）／0 failed |
| Flag off 直接請求 | `/world`、`/world/cs`、`/world/ai`、`/world/xx`、`/world/cs?island=databases` 都是 404；`/` 是 200，沒有任何 `/world` 連結 |

### 效能（P0–P5，全部是實測）

**量測條件**

- `perf/regions.perf.ts`，與 `world.perf.ts` 相同的 instrument；flag-on production build；SwiftShader；各 5 輪取中位數。
- 桌機與手機兩個專案同時執行。
- 總覽在三次鏡頭飛行之後量測，與 `world.perf.ts` 相同（剛載入時可能還在重畫靜態陰影）。
- **P5** 是各區聚焦一座島：P0、P2、P4 聚焦基礎程式島，P3 聚焦 AI 基礎島。

| 情境 | 裝置 | 總覽 draw（主／陰影） | 總覽三角形 | P5 聚焦 draw／三角形 | 第一畫面 | 就緒（GLB） | 飛行 fps | JS heap |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| P0 五島首頁 | 桌機 | 66／0 | 49,113 | 39／48,301 | 1.87 s | 2.82 s | 15.7 | 29.4 MB |
| P1 世界總覽 | 桌機 | 8／0 | 8,726 | — | 0.61 s | 0.61 s | — | 14.3 MB |
| P2 CS 區域 | 桌機 | 58／0 | 45,228 | 35／50,680 | 1.97 s | 3.01 s | 13.5 | 26.0 MB |
| P3 AI 區域 | 桌機 | 28／0 | 21,806 | 15／15,957 | 1.61 s | 1.72 s | 21.1 | 24.5 MB |
| P4 CS＋GLB 替身 | 桌機 | 64／0 | 63,484 | 35／56,876 | 1.90 s | 2.89 s | 14.3 | 26.0 MB |
| P0 五島首頁 | 手機 | 66／0 | 36,923 | 47／46,486 | 1.76 s | 2.52 s | 27.8 | 26.0 MB |
| P1 世界總覽 | 手機 | 8／0 | 8,798 | — | 0.62 s | 0.63 s | — | 19.3 MB |
| P2 CS 區域 | 手機 | 58／0 | 45,228 | 36／46,896 | 1.99 s | 2.89 s | 25.1 | 29.4 MB |
| P3 AI 區域 | 手機 | 28／0 | 21,806 | 15／15,957 | 1.72 s | 1.98 s | 38.2 | 29.4 MB |
| P4 CS＋GLB 替身 | 手機 | 64／0 | 63,484 | 37／52,364 | 2.09 s | 3.36 s | 19.2 | 33.1 MB |
| 沒有 WebGL：`/world` | 桌機／手機 | 0 | 0 | — | 清單 0.38／0.39 s | — | — | 20.5 MB |
| 沒有 WebGL：`/world/cs` | 桌機／手機 | 0 | 0 | — | 清單 0.90／0.91 s | — | — | 20.5 MB |

**解讀**

- P0 的總覽數字與 F.1e 的量測完全相同（66、49,113／36,923、陰影 0），量測環境一致。
- **P2（8 座島）比五島首頁還少 8 個 draw call**：
  - 少了互動實驗島的地標與廣場；
  - 霧中小島每座只有 2 個 draw call。
- **P4 的替身只是 v2.1 的燈塔＋工坊，不是完整的島嶼 GLB**：每座島約 +2.6k 三角形，合併後只多 6 個 draw call。
- **推估（不是實測）**：若 7 座島都換成預算上限的 GLB（每座 ≤ 16 draw、≤ 10k 三角形），CS 總覽約 58＋7×16 ≈ 170 draw、45k＋7×10k ≈ 115k 三角形。
  - draw call 會超過暫定的桌機 150；
  - 所以正式預算要等 M3.2 的實際 GLB 量測後再定。
- **飛行 fps 不能當效能結論**：headless 的 fps 不可靠（P1-20），而且兩個專案同時執行，比 F.1e 的 23／50 低。只能在同一輪內比較：P2、P4 與 P0 相近，P3 較高。
- **JS heap** 取自 Chromium 的 `performance.memory`，是粗略值，只用於同輪比較。
- **真機：Not Measured。**
- **作廢的量測**：P4 的第一次量測無效。
  - 原因：選島時網址只保留 `island`、丟掉了 `stress`，第一次飛行之後就不是替身場景。
  - 已修正為選島時保留其他參數，並加了 E2E。
  - 上表是修正後重測的結果；前兩次的原始資料保留在隔離副本。

### 截圖（production build；桌機 1440×1000、iPhone 13）

- **範圍**：四個時段 × 桌機／手機 × 總覽、CS、AI、聚焦資料庫應用島、聚焦大型語言模型島，共 40 張，console 0 錯誤。
- **桌機**：
  - 區域名牌都在地圖內，不重疊，也不在右側清單下（量測腳本與 E2E 驗證）；
  - 傍晚可讀。
- **手機**：
  - 名牌是圓點，規劃中是空心；頁首是返回箭頭＋清單；
  - 總覽改為上下排列。
- **聚焦資料庫應用島**：DB–SA 木橋從東北岸出發，道路直接連到廣場，沒有穿過主塔、平台或複寫雙塔。
- **已知觀察**：
  - 左下科目面板會蓋住聚焦島的西側（與首頁相同）。
  - 桌機 295°、手機 105° 的方位角，讓鄰島（基礎程式島的燈塔）出現在聚焦畫面的前景。
  - 手機聚焦時，下方科目面板佔了約一半畫面。

## M3.2 進入條件（M3_1_REGIONAL_WORLD_ARCHITECTURE §8）

| # | 條件 | 狀態 |
|---:|---|---|
| 1 | Region Layout Validator（含港口、道路、地標） | **Pass**（`validateRegion` 0 問題；反向測試會抓到舊 DB 港口與島距不足） |
| 2 | 島距、橋、航線、碼頭確定，使用者批准座標與橋 | **Pass**（2026-11-03 使用者批准 `region-layouts.ts` 的座標與橋為定案） |
| 3 | Camera Framing：三層 × 桌機／手機，名牌不重疊不裁切，四時段 | **Fail**：桌機通過（181／209 px）；手機 73／85 px 低於 88。使用者暫時接受替代方案，但不算通過 |
| 4 | 導覽：滑鼠、hover、鍵盤、觸控、返回、沒有 WebGL 的清單 | **Pass**（E2E） |
| 5 | 霧中小島標示「規劃中」，沒有課程連結與進度 | **Pass**（E2E＋單元測試） |
| 6 | 五島首頁與受保護頁面 0 行差異；世界指紋與首頁測試 | **Pass**：頁面檔 0 行差異；首頁逐像素比對 0 差異（中午，桌機＋手機）；共用元件是加法式修改；測試在兩種 build 都通過 |
| 7 | GLB Scale／Anchor Contract 定稿；DB、LLM 的節點清單與佔地格 | **Pending**：契約與節點清單已實作並驗證；LLM 地標的佔地格還沒寫進 Layout；契約需批准 |
| 8 | P0–P5 實測；正式預算批准 | **Pending**：P0–P5 已實測；正式預算等使用者決定；真機 Not Measured |
| 9 | Blender MCP protocol 14／15 相容性與方案 | **Pending**：本階段未執行 |
| 10 | Blender Pipeline 準備（範本，不建模） | **Pending**：本階段未執行 |

## 未解決的風險

- **手機島寬不足（正式上線前必須解決）**：CS 73、AI 85 px，目標 88。
  - 目前靠 44 px 觸控區、清單與聚焦，只是 prototype 的替代方案。
  - 可能的方向（需決定）：
    - 手機版地圖舞台加高（目前 390×434，標題與按鈕佔了約 230 px）；
    - 手機區域圖分成兩個分區；
    - 手機預設清單優先。
- **方位角的副作用**：CS 桌機轉 295° 與首頁的方向不同；手機與桌機看到的地圖方向不同；聚焦時鄰島會在前景。
- **GLB 成本**：完整的島嶼 GLB 可能讓 CS 總覽超過暫定的 150 draw（推估約 170），M3.2 要實測。
- **飛行 fps 與 heap 都不可靠**（headless、並行），真機未量測。
- **共用元件改動**：`HexWorldExplorer`、`HexWorldScene`、`HexCamera`、`HexLandmarks`、`LearningNavigation`、`header.tsx` 都有加法式改動，首頁沒有傳新參數。
  - 首頁 E2E 在 flag on、flag off 兩種 build 都通過。
  - 首頁逐像素前後比對（HEAD 的 build 對本次的 build，中午、GLB 就位後）：桌機 1440×1000 與手機 1170×1992 px，**0 個像素不同**。
  - 只比對了中午，其他時段靠 E2E 與截圖。
- **flag 是建置時決定**：要開啟必須重新 build；執行時的環境變數不會改變已 prerender 的頁面。
- **選島保留其他參數的修正，晚於全套 E2E**：
  - 這項修正之後重跑了 regional-world spec（16 passed）與效能；
  - 沒有重跑全套 E2E，也沒有重做 flag-off build。修正只動 client 端的選島網址，不影響路由開關。

### 受保護範圍

- 下列都是 0 行差異：
  - `src/app/page.tsx`；
  - `src/app/islands/**`；
  - `public/`（GLB）、`glb-contract.ts`、`asset-registry.ts`、`data.ts`；
  - `src/content/**`、`scripts/**`、`docs/planning/data/**`。
- 共用元件都是加法式修改；首頁、`/islands`、candidate、scale/37 的 E2E 在 flag on、flag off 兩種 build 都通過。
- 中途誤把新契約寫進既有的 `src/lib/islands/glb-contract.ts`，已立即用 HEAD 版本還原（`git status` 無差異），新契約改放 `glb-island-contract.ts`。

## 2026-11-03 後續：座標定案

- 使用者批准 M3.1 的區域座標與橋為定案（`src/lib/islands/regions/region-layouts.ts`）。
- 進入條件 #2 改為 Pass，目前是 Pass 5、Fail 1（手機鏡頭）、Pending 4。
- **M3.2 仍未開始**：等待使用者決定手機島寬方案，以及 #7–#10 這幾個 Pending 項目。
