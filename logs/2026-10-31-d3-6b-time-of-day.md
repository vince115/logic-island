# D.3-6b 四種時間情境（Lab Only）（2026-10-31）

> 授權範圍：只在 37 格實驗室頁 `/islands/hex/scale/37` 加入清晨／中午（預設）／黃昏／傍晚四種整體光照情境與原生選單；擴充 `environments.ts`、沿用 `HexEnvironment`。不加 PointLight、Bloom／後製、Fog（無量測證據前）；不改 GLB、GLB 共用材質、地形、幾何、島嶼配置、教材、資產庫；不加套件、不用 localStorage；燈塔／窗戶／路燈的發光強化留給 D.3-6c。不推進候選頁、不改正式 `/islands`、不 merge、不 push。基準：`63f972e`（D.3-6a）。驗收採 **Fast Iteration Mode Level 2**；`HexEnvironment` 是各路由共用的元件，陰影相機設定經過新程式，所以這一段另外做了 Level 3 的關鍵路由逐像素 A/B（§6）。

## 1. 結果摘要

- 四種情境都是可 JSON 往返的資料（背景、環境光、半球光、太陽位置／顏色／強度、陰影設定、海面色調；霧一律 `null`、`glow` 一律 1）。**中午逐值保留 D.3-6a**（只多了明寫的 `fit: 'map'` 與白色海面色調，畫出的數值相同）。
- 陰影：中午維持 D.2c 的陰影相機；其他三個情境用新的 `shadowBox` 依太陽方向把地圖包圍盒投影到光空間，算出左右上下、near／far 與太陽距離（§3.2）。黃昏太陽仰角 27.1°、傍晚月光 40.0°（2026-10-30 已決定的約 40°）、清晨 35.1°。
- 海面色調只乘在自然海面的兩個材質顏色上（uniform，不重編 shader）；白色時不動材質、不要求重畫。
- UI：實驗室頁地圖下方的操作列加入原生 `<select aria-label="時間情境">`（清晨、中午、黃昏、傍晚），預設中午，不存任何狀態；黃昏與傍晚時地圖標題加上底板以維持對比（§3.4）。
- 驗收（§4～§7）：中午與 `63f972e` 在 6 條路由、桌機＋手機共 22 個狀態 **0 像素差**；四情境 draw call 與三角形都不比中午多；每次切換只重畫一次陰影，之後閒置 0；切換不產生新的 WebGL program。效能 smoke 見 §7。

## 2. 修改的檔案

| 檔案 | 變更 |
|---|---|
| `src/lib/islands/environments.ts` | `EnvironmentId` 增為四個；`WorldEnvironment` 加 `sea.tint`、`shadow.fit`（`'map'` 帶 `far`／`'sun'`）；`morning`、`sunset`、`dusk` 三份資料；`SHADOW_HEIGHTS`、`ShadowBox`、`shadowBox()` |
| `src/components/islands/hex-world/hex-environment.tsx` | 太陽位置與陰影相機改由 `shadowBox()` 取得（中午結果與原本相同，`near` 明寫 0.5＝three 預設）；重畫陰影的判斷鍵改為整個陰影盒 |
| `src/components/islands/hex-world/hex-ocean.tsx` | `HexNaturalOcean` 接受 `tint`，乘在深海外框與海面材質顏色上；與現值相同時什麼都不做 |
| `src/components/islands/hex-world/hex-world-scene.tsx` | 場景選項 `timeOfDay`、屬性 `environmentId`；只有 `lighting: 'contrast'` 且 `timeOfDay` 時才採用所選情境；海面色調傳給自然海面 |
| `src/components/islands/hex-world/hex-scene-presets.ts` | `lab` 加 `timeOfDay: true`（`production` 不變） |
| `src/components/islands/hex-world/hex-world-explorer.tsx` | 情境狀態（預設中午、只在記憶體）；`timeOfDay` 時才顯示選單並在地圖區塊加 `data-environment` |
| `src/components/islands/islands.module.css` | 選單樣式（與旁邊按鈕一致）；黃昏、傍晚的標題底板 |
| `src/components/islands/hex-world/hex-perf-probe.tsx` | `__hexEnvironment()` 多回報陰影相機 near（放在最後）與每個材質的顏色 |
| `tests/environments.test.ts` | 中午新形狀；新增 5 項（§4） |
| `tests/scene-presets.test.ts`、`tests/islands-routes.test.ts` | 實驗室 preset 多了 `timeOfDay`；只有 `lab` 有，候選頁沒有 |
| `e2e/hex-environment.spec.ts` | 加 console 守衛；中午測試加 near；新增 7 項 D.3-6b（§4） |
| 文件 | 本檔；ROADMAP、IMPLEMENTATION_STATUS、NEXT_STEPS、TESTING_STATUS、KNOWN_ISSUES；分析紀錄 §6 標註 D.3-6b 完成 |

未修改：GLB 與 `glb-parts.ts`／`hex-glb-buildings.tsx`（共用材質不動）、`hex-plaza.tsx`、`hex-camera.tsx`、`StaticShadows` 與 `STATIC_SHADOW_MAP`、Canvas／renderer 設定、地形、海面幾何與烘焙貼圖、`islands-world-explorer.tsx`、`/islands`、`/islands/candidate`、`/islands/legacy` 頁面、教材、資產庫、`package.json`／lockfile。

## 3. 設計重點

### 3.1 四種情境

相機從 +x +z 看地圖，所以光從這一側才會照亮看得到的面。

| 情境 | 太陽（仰角） | 補光 | 海面色調 | 意圖 |
|---|---|---|---|---|
| 清晨 | `#fff0d8` 2.6，`[21, 15.5, 6.7]`（35.1°，東側） | 環境光 `#eef3ff` .6、半球 `#e6f1ff`／`#c3d6ae` .9 | `#f2f7ff` | 淡暖陽光、冷而清的補光 |
| 中午 | D.3-6a 原值（54.7°） | D.3-6a 原值 | `#ffffff` | 不變 |
| 黃昏 | `#ffb27a` 3.0，`[-19.2, 12.3, 14.4]`（27.1°，與中午同側） | 環境光 `#ffe3d1` .7、半球 `#c8c2ec`／`#a08c84` 1.0 | `#f4dce6` | 長影、暖色地表、偏紫的天光 |
| 傍晚 | `#d6defa` 1.6，`[4.1, 17.4, 20.3]`（40.0°） | 環境光 `#9aa3c4` .55、半球 `#8e98c0`／`#3a4058` .7 | `#b8b4c4` | 柔和月光、暗藍灰補光 |

- 調整過程：第一版黃昏的半球光是橘色，藍色海面在橘光下變成混濁的綠色，標題也看不清；改為「頭頂偏紫、太陽橘」後海面成為帶灰的藍。第一版傍晚的補光與月光偏藍，與藍色海面相乘變成飽和的寶藍；改為接近中性的月光並以海面色調降低彩度。第一版傍晚月光用了約 60°，後依 2026-10-30 的決定改為約 40°。
- 背景色：正交等角視角下幾乎看不到背景（分析紀錄 §0.1），仍依情境設定，供拉遠或日後使用。
- 霧：四個情境都沒有（D.3-6a §3.4 的建議：不在情境之間有／無切換，避免重編所有 shader）。
- 發光：`glow` 都是 1，燈塔與燈籠維持模型自己的強度；傍晚燈光留給 D.3-6c。

### 3.2 依太陽方向取陰影範圍（`shadowBox`）

- `fit: 'map'`（中午、A2 預覽）：回傳 D.2c 的盒子與資料中的太陽位置，與 D.3-6a 完全相同。
- `fit: 'sun'`：只取太陽方向。以 three 的陰影相機朝向（從太陽看向地圖中心，+y 為上）建立光空間座標軸，把地圖包圍盒（±陰影範圍、高度 `SHADOW_HEIGHTS` = 海面下 0.5 到 8）的 8 個角投影上去：左右上下取極值再加 1；太陽放在最靠近它的角之外 2，near = 1、far = 最遠的角再加 1。這同時處理分析紀錄 §0.1 #6 的三件事：低太陽時近平面不再裁掉向光側、陰影貼圖不再浪費在地圖外、far 跟著方向變。
- 單元測試以三個陰影範圍驗證每個角都落在盒子內、太陽方向與資料一致（§4）。
- 重畫：`HexEnvironment` 的判斷鍵改為整個陰影盒；中午掛載時鍵不變，所以不多畫。換情境時在新燈光屬性觸發的那一幀重算陰影相機投影並重畫一次陰影（D.3-6a §3.2 的機制）。
- bias：清晨 −.0003／.06、黃昏 −.0004／.08、傍晚 −.0003／.05，以截圖檢查沒有明顯的陰影痘（shadow acne）或漂浮；只在 SwiftShader 看過，真機待 D.3-4B。

### 3.3 海面色調

- 自然海面的顏色烘焙在貼圖裡；色調乘在 `material.color`（海面四邊形的顏色＝色調本身，深海外框＝原深海色 × 色調），是 uniform 改變，不重建貼圖、不重編 shader。泡沫維持原色（光線本身已會染色）。
- 白色（中午）時與材質現值相同，`useLayoutEffect` 直接返回，不 `invalidate`，所以掛載時不多畫。
- 只有自然海面（實驗室頁與候選頁的 preset）接色調；19 格的連續海面與 A2 的六角海面沒有時間情境，不接。

### 3.4 UI 與對比

- 選單放在地圖下方操作列（與「自動旋轉」「返回全景」並排），手機上與 D.3-5b 一樣單獨一列靠右，360／390 px 不溢出（§4）。原生 `<select>`：可 Tab 到達，鍵盤與螢幕閱讀器使用瀏覽器內建行為，名稱「時間情境」。
- 只在 `timeOfDay` 時顯示選單與加 `data-environment`，所以候選頁與 A2 預覽的 DOM 不變（§6）。
- 狀態在 explorer 裡：切換時間不碰自動旋轉、聚焦、鏡頭飛行或「返回全景」；「返回全景」也不改時間；切到清單再回 3D 仍保留所選情境。
- 對比：黃昏與傍晚的海面變暗，原本直接壓在地圖上的標題會看不清。黃昏給標題白色半透明底板（`#ffffffe6`）並把眉標改成 `#1a4fa0`；傍晚給深色底板（`#121c33d9`）、白字與淺藍眉標。E2E 以「底板疊在白色或黑色上」的最壞情況計算，黃昏與傍晚的標題與眉標都 ≥ 4.5:1（§4）。島嶼名牌、提示與按鈕本來就有白色底，不受影響。

## 4. 測試

（結果見 §5 的表）

- `tests/environments.test.ts`（新增 5 項）：四情境順序與 id；黃昏仰角 25～30°、傍晚約 40°、清晨介於黃昏與中午；全部無霧、`glow` 1、陰影貼圖 1024；中午與 A2 預覽的陰影盒等於 D.2c；`fit: 'sun'` 的盒子在三種範圍都包住地圖 8 角且太陽方向不變。
- `e2e/hex-environment.spec.ts`（新增 7 項 × 桌機／手機）：
  1. 原生選單「時間情境」預設中午、選項順序；候選頁沒有選單也沒有 `data-environment`。
  2. 每個情境的背景、三盞燈、太陽位置、陰影盒（與 `shadowBox` 相同）、bias、海面色調；沒有霧。
  3. 每個情境的 draw call 與三角形：主畫面與中午相同，含陰影 pass 時不多於中午。
  4. 切換時陰影只重畫一次、之後 1.5 秒閒置重畫 0（先切一次讓 P1-29 不干擾）。
  5. 切換不影響自動旋轉、聚焦與返回全景；返回全景不改時間；清單往返保留情境。
  6. 黃昏與傍晚標題對比 ≥ 4.5:1（最壞情況）。
  7. 選單可 Tab 到達，四個情境在桌機與 360／390 px 都不溢出且在地圖內。

## 5. 驗收結果（Level 2）

全部在隔離副本執行（scratchpad 的 `iso`，node_modules 以 clone copy 複製、直接呼叫 node CLI），原工作目錄沒有 build 或 E2E 輸出。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 範圍＝repo 檔案；隔離副本中的 scratch 擷取資料夾 `capture/` 另行排除） |
| Vitest | 188 passed／6 skipped（新增 5 項；`scene-presets`、`islands-routes` 各 1 項改寫） |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/hex`、`/islands/legacy` 仍是靜態頁，`/islands/hex/scale/{19,37}` 仍是 SSG |
| E2E `hex-environment`＋`hex-camera`＋`hex-scale`＋`hex-world`＋`islands-candidate`＋`islands-acceptance`＋`islands`（單次） | 174 passed／20 skipped／0 failed（skipped 依設計：只在桌機或只在手機執行的項目）。這一輪的傍晚月光仍是 60°；改為 40° 後重新建置，再跑 `hex-environment` 18 passed／0 failed、Vitest 188 passed |
| 中午逐像素 A/B（§6） | 6 路由 22 個狀態 0 像素差（最終建置再跑一次，仍是 0） |
| draw call／三角形 | 四情境主畫面相同（每幀 43 個 draw）；含陰影 pass 時不多於中午（E2E 第 3 項） |
| 陰影更新與閒置 | 每次切換剛好 1 次陰影 pass，之後閒置重畫 0（E2E 第 4 項） |
| 效能 smoke | §7 |

未跑：E2E 全套（Level 2 只跑相關 spec；`player.spec.ts` 的 P1-11 既有失敗與本階段無關）、真機（D.3-4B 仍 Not Measured）、iOS Safari、螢幕閱讀器實機（Not Verified；只驗證原生 `<select>` 的名稱與 Tab 可達）。

## 6. 中午逐像素 A/B（與 `63f972e`）

兩份隔離建置（`63f972e` 由 `git archive` 取出、D.3-6b 工作樹）各自 `next start`，同一支 scratch 擷取程式（Reduced Motion，鏡頭直接到位）依序擷取，逐像素比較（任一 RGB 通道不同即算）。實驗室頁只比對 canvas 範圍並在兩邊都隱藏下方操作列（新選單在那裡）；其他頁比對整個 `main`，另外比對 `main` 內所有按鈕、連結與選單的標記。headless Chromium＋SwiftShader，**模擬，不是真機**。

| 路由 | 狀態 | 桌機 | 手機 | 按鈕與連結 |
|---|---|---|---|---|
| `/islands/hex/scale/37`（實驗室頁） | 全景、聚焦、拖曳轉開後（拖曳只在桌機） | 0／0／0 | 0／0 | 只多了時間選單（預期） |
| `/islands/candidate` | 全景、聚焦、拖曳後 | 0／0／0 | 0／0 | 相同 |
| `/islands/hex/scale/19` | 全景、聚焦 | 0／0 | 0／0 | 相同 |
| `/islands/hex`（A2 預覽） | 全景、聚焦 | 0／0 | 0／0 | 相同 |
| `/islands` | 全景 | 0 | 0 | 相同 |
| `/islands/legacy` | 全景 | 0 | 0 | 相同 |

共 22 個狀態 0 像素差。比較程式本身的檢查：中午與清晨兩張截圖有 532,925 個像素不同、同一張比自己為 0。

四情境的代表截圖（scratch，不進 repo）：桌機與手機的全景四張、聚焦後的黃昏與傍晚。

## 7. 效能 smoke

一輪，scratch 程式，實驗室頁，headless Chromium＋SwiftShader（**模擬**）。依序切換中午 → 清晨 → 黃昏 → 傍晚 → 中午：每次量「選擇到該情境第一幀」的時間，再開自動旋轉 2 秒量 FPS；另外計算整頁 `linkProgram` 次數。

| | 桌機 | 手機（iPhone 13 模擬） |
|---|---|---|
| 載入後 WebGL program | 17 | 17 |
| 四情境全部切換過後 | **17（沒有新的 shader 編譯）** | **17** |
| 切換到第一幀 | 清晨 44、黃昏 34、傍晚 29、中午 26 ms | 25、22、21、28 ms |
| 環繞 FPS（第二次以後） | 清晨 38.0、黃昏 38.2、傍晚 37.0、中午 38.5 | 40.6、40.3、40.3、40.0 |
| 每幀主畫面 draw | 43.0（每個情境相同） | 43.0 |

- 載入後**第一次**環繞只有 22～24 fps，之後的中午是 38～40 fps。為確認不是 D.3-6b 造成，做了**一次**有界的配對檢查：同一條件下 `63f972e` 與 D.3-6b 交替各兩次（各開新 context）。桌機 `63f972e` 51.1／23.7、D.3-6b 23.2／25.6；手機 `63f972e` 28.9／25.7、D.3-6b 59.0／58.1。兩個版本都出現約 24 與約 55 兩種結果，屬於載入後第一次環繞的雜訊（同時有其他工作階段使用 CPU），**沒有回歸證據**，依 Fast Iteration Mode 不再追加量測。這不表示新程式沒有成本，只是在本輪量測中觀察不到。
- 結論：無明顯異常。切換不編譯 shader、不增加 draw call，環繞 FPS 在四個情境之間沒有差異。真機數字仍待 D.3-4B。

## 8. 已知限制與後續

1. **手機傍晚／黃昏的標題底板**：底板讓標題可讀，但在手機全景下底板會蓋住基礎程式島燈塔一帶（中午時文字本來就壓在同一處，只是透明）。候選頁推進（D.3-6c）時再決定是否縮小標題或改位置。KNOWN_ISSUES P2。
2. **切換是瞬間的**：沒有過場動畫（本階段範圍外）；選單切換只要一幀。
3. **海面色調只接自然海面**：19 格連續海面、A2 六角海面與非連續海面的備用平面沒有接，因為這些頁面沒有時間情境。
4. **暫代幾何、名牌、提示與按鈕**的配色不隨情境改變（名牌與按鈕有白底，對比不受影響）；tone mapping／曝光維持 Canvas 預設。
5. **陰影品質只在 SwiftShader 截圖檢查**：低太陽的 bias 與陰影貼圖解析度（黃昏的貼圖沿太陽方向拉長）要在真機（D.3-4B）確認。
6. **P1-29（既有，未修改）**：載入後第一次切換可能多畫一次陰影；E2E 先切一次再量。
7. **P1-30（既有，未擴大調查）**：D.3-6a 的 A2 預覽首幀 Inconclusive 照舊追蹤；本階段沒有改 A2 預覽的畫面（0 像素差）。
8. **傍晚的燈光**：燈塔窗戶與燈籠仍是模型自己的強度，傍晚燈光強化屬於 D.3-6c。
9. **候選頁與正式 `/islands`**：沒有選單、畫面與 DOM 與 `63f972e` 相同；推進需另行批准。
