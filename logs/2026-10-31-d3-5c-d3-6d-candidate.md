# D.3-5c／D.3-6d 候選頁整合（2026-10-31）

> 授權範圍：把實驗室頁已完成的 D.3-5（自由相機、Auto Orbit）與 D.3-6（四種時間情境、海面色調、依太陽方向的陰影範圍、暖光倍率）整合到 `/islands/candidate`，含必要的 UI 調整、測試與文件，建立單一 local commit。風險等級 **Level 3**（Fast Iteration Mode）。不 merge、不 push；不改正式 `/islands`、不讓候選頁取代正式入口；不改 GLB、地形、教材、資產庫、套件版本；不開始 D.3-4B。基準：`0cfb146`（D.3-6c）。

## 1. 結果摘要

- **整合方式**：只在 production preset 加上 `camera: 'free'` 與 `timeOfDay: true`。production preset 只有候選頁使用（正式 `/islands` 與 `/islands/legacy` 走舊的 `IslandsExplorer`，不經過六角世界），實驗室頁改為 `production + perfProbe`，兩頁跑**同一套** `HexCamera`、`HexEnvironment`、`useGlow` 與 explorer 控制，沒有複製任何相機或環境實作。19 格與 A2 預覽的 preset 不變（固定相機、中午）。
- **候選頁 UI**：地圖下方操作列多了原生「時間情境」選單與「自動旋轉」（與實驗室頁相同的元件與樣式），提示改為「拖曳旋轉 · 滾輪或雙指縮放 · 點擊島嶼或名牌探索」。單欄版面（≤ 780 px，含手機）地圖標題移到**地圖上方**的一列，不再壓在地圖上。
- **驗收**：候選頁預設中午的 3D 畫面與 `0cfb146` 的候選頁 **0 像素差**（桌機、手機，全景與聚焦）；實驗室頁中午／清晨、`/islands`、`/islands/legacy`、19 格、A2 預覽 0 像素差且按鈕連結相同。draw call、三角形、陰影 draw、WebGL program 與基準相同；閒置重畫 0；每次切換時間 1 幀、1 次陰影 pass。E2E 全套只剩既有的 P1-11（`player.spec.ts`）。

## 2. 盤點：實驗室頁與候選頁的差異（整合前）

| 項目 | 實驗室頁 `/islands/hex/scale/37` | 候選頁 `/islands/candidate`（`0cfb146`） |
|---|---|---|
| explorer | `HexScaleExplorer` → `HexWorldExplorer` | `IslandsWorldExplorer` → `HexWorldExplorer` |
| preset | `lab` = production + `perfProbe` + `camera: 'free'` + `timeOfDay: true` | `production` |
| 世界配置 | `scalePrototypes['37']`（與候選頁的 `islandsWorld` 相同資料，單元測試驗證） | `islandsWorld` |
| 地點清單 | 有（`poiPanel`） | 有 |
| 工具列 | 19／37 格與返回連結 | 無（手機單列） |
| 文案 | 原型文案 | 正式文案 |

結論：差異只有 preset 的兩個旗標（與 probe、文案、工具列）；相機、環境、發光與控制都是共用元件，整合不需要新程式路徑。

## 3. 修改內容

### 3.1 檔案

| 檔案 | 變更 |
|---|---|
| `src/components/islands/hex-world/hex-scene-presets.ts` | `production` 加 `camera: 'free'`、`timeOfDay: true`；`lab` 改為 `production + perfProbe` |
| `src/components/islands/hex-world/islands-world-explorer.tsx` | 提示文案；`captionAbove` |
| `src/components/islands/hex-world/hex-world-explorer.tsx` | 選項 `captionAbove`：地圖標題內容抽成一份，單欄時另畫在地圖上方 |
| `src/components/islands/islands.module.css` | `.stageCaptionAbove`（預設隱藏）；`max-width: 780px` 時顯示它、隱藏地圖上的 `.stageCaptionWide` |
| `tests/scene-presets.test.ts`、`tests/islands-routes.test.ts` | production 帶自由相機與時間情境；lab＝production＋probe；19 格與 A2 不帶 |
| `e2e/candidate-integration.spec.ts`（新增） | 候選頁整合驗收（§4.2） |
| `e2e/hex-camera.spec.ts` | 原「候選頁維持固定相機」改為「候選頁改用同一套自由相機」（同一項，期待值更新） |
| `e2e/hex-environment.spec.ts` | 原「候選頁沒有時間選單」改為「候選頁相同」 |
| `e2e/islands-candidate.spec.ts` | 地圖標題的定位改為「可見的那一份」（單欄時在地圖上方） |
| 文件 | 本檔；ROADMAP、IMPLEMENTATION_STATUS、NEXT_STEPS、TESTING_STATUS、KNOWN_ISSUES |

未修改：`HexCamera`、`HexEnvironment`、`useGlow`／`ownGlowMaterials`、`HexWorldScene`、Canvas／renderer、`/islands` 與 `/islands/legacy` 頁面與 `IslandsExplorer`、候選頁頁面檔、GLB、地形、教材、資產庫、`package.json`／lockfile。沒有刪除或 skip 任何測試。

### 3.2 地圖標題（手機遮擋）

- D.3-6c 的手機精簡標題只保證預設全景；自由相機下，壓在手機尺寸地圖上的任何固定標題，在旋轉或縮放後都可能蓋到島嶼。依授權的優先順序，候選頁在單欄版面（≤ 780 px）把標題移到**地圖外**、地圖正上方的一列：一行眉標＋一行標題（`<br>` 在這裡不換行），用頁面的 `--panel`／`--text` 配色，不受時間情境影響。
- 地圖本身（canvas）的大小不變（舞台高度由 min-height 決定）：手機 360×380、桌機 898×600 與基準相同，所以 3D 畫面可以逐像素比較（§5）。頁面因此多約 60 px 高。
- 兩份標題同時在 DOM，但任何時候只有一份顯示（另一份 `display: none`，螢幕閱讀器也只讀到一份）。
- 桌機（> 780 px）維持地圖上的標題與 D.3-6b 的黃昏／傍晚底板。標題 `pointer-events: none`，從不擋點擊；E2E 另外確認：把標題移到每個島嶼名牌上時，名牌仍疊在標題之上（預設、旋轉後、縮放後）。
- 實驗室頁不使用 `captionAbove`，維持原樣（§5 0 像素差）。

## 4. 測試（隔離副本，直接呼叫 node CLI）

### 4.1 Static／Unit／Build

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 190 passed／6 skipped |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/legacy`、`/islands/hex` 靜態頁，`/islands/hex/scale/{19,37}` SSG |

### 4.2 E2E

（全套結果見 §4.3）

`e2e/candidate-integration.spec.ts`：候選頁不載入量測 probe，所以相機以「島嶼名牌在地圖上的位置」、canvas 像素（隱藏所有 HTML 覆蓋層後只比 WebGL 畫面）與 `perf/instrument.mjs` 的 draw 計數來觀察。

| 項目 | 驗證內容 |
|---|---|
| 載入 | 自由相機（`data-camera="free"`、canvas `touch-action: pan-y`）；載入後 1.5 秒名牌位置不變（首幀不跳）；返回全景停用；自動旋轉關閉；時間預設中午；沒有 probe |
| Free Camera（桌機） | 拖曳旋轉，連續 5 次拖曳都還在轉（360° 無限制）；從名牌開始拖曳超過 6 px 不聚焦；單純點名牌聚焦；滾輪縮放、頁面不捲動 |
| Free Camera（觸控模擬） | 單指水平旋轉、垂直滑動捲頁、雙指縮放、短按名牌聚焦 |
| Camera Flight／Reset | 旋轉後聚焦的畫面與未旋轉聚焦不同（保留方位）；飛行後仍可旋轉；返回全景後名牌位置與載入時相同，3D 畫面逐像素相同 |
| Auto Orbit | 預設關閉、可用鍵盤開啟；拖曳、縮放、分頁隱藏、返回全景（並重設視角）、點名牌（聚焦該島，按鈕離開）、清單模式都會停止 |
| Reduced Motion | 自動旋轉仍預設關閉；聚焦立即到位；可手動開啟 |
| Time-of-Day | 切換不移動相機、不停自動旋轉；四個情境畫面各不相同；兩輪切換後切回中午與載入時逐像素相同（材質沒有漂移）；`linkProgram` 不增加 |
| draw／陰影／閒置 | 每個情境主畫面 draw 與三角形和中午相同；每次切換 1 次陰影 pass；之後 1.5 秒閒置 0 |
| 對比 | 黃昏與傍晚的地圖標題 ≥ 4.5:1（桌機：底板疊在白或黑上；手機：頁面面板上） |
| 手機 360／390／430 px | 四個情境不溢出；時間、自動旋轉、返回全景都在地圖內且互不重疊；預設、旋轉後、縮放後、聚焦（清單觸發的鏡頭飛行）後，標題都在地圖上方；地圖上的標題不顯示 |
| 桌機標題 | 名牌永遠疊在標題之上（預設、旋轉、縮放）；聚焦與返回正常 |
| WebGL Fallback | 無 WebGL 與中途遺失（傍晚時）都改為清單，且沒有留下時間選單、自動旋轉或返回全景 |

`hex-camera` 的觸控測試另外加上「先等捲動停止」（§4.3），期待值不變。

既有測試的期待值更新（沒有刪除或 skip）：`hex-camera` 的候選頁項目由「固定相機」改為「同一套自由相機」；`hex-environment` 的候選頁由「沒有選單」改為「相同選單」；`islands-candidate` 的標題定位改為可見的那一份。其餘候選頁既有項目（正式文案、清單模式、Fallback、GLB 失敗、聚焦與 3D 點擊、hover、手機工具列、桌機標題不遮名牌、Skip link、三條路由互不影響）原樣通過；`islands-acceptance`（360／390 px、鍵盤、無障礙名稱）原樣通過。

驗證途中發現並修正的測試問題（不是產品問題）：只比 WebGL 畫面的截圖輔助會暫時把覆蓋層設為 `visibility: hidden`；Reduced Motion 下全站的 0.01 ms transition 讓 canvas 晚一幀才恢復，若在那一幀做觸控，觸控會落在外層而被取消。輔助函式改為等 canvas 恢復可見。其他：縮放後名牌可能離開地圖，相關檢查只計算仍在地圖內的名牌、聚焦改由清單觸發同一段鏡頭飛行；最長的拖曳測試給 60 秒。

### 4.3 E2E 全套

| 回合 | 結果 |
|---|---|
| 第 1 次全套 | 228 passed／29 skipped／7 failed：3 項既有 P1-11（`player.spec.ts`），4 項是新測試本身的問題（標題定位抓到兩個元素、縮放後點到地圖外的名牌、最長測試超過 30 秒），修正後候選頁兩個 spec 44 passed／0 failed |
| 第 2 次全套（最終） | 231 passed／29 skipped／4 failed：3 項既有 P1-11；1 項 `hex-camera` 的實驗室頁觸控測試（雙指縮放時頁面多捲了 1 px） |
| `hex-camera` 觸控測試定向檢查 | 在 `0cfb146` 同一項 6 次失敗 3 次、本版 6 次失敗 0 次（另 3 次中 1 次）：**既有的測試不穩定**，原因是前一步垂直捲頁的慣性還沒停就量捲動位置。只把測試改為先等捲動停止（期待值不變），之後連續 8 次通過，整個 `hex-camera` 28 passed／0 failed |

skipped 都是依設計（只在桌機或只在手機執行的項目）。

## 5. 視覺 A/B（與 `0cfb146`）

兩份隔離建置各自 `next start`，Reduced Motion，逐像素比較（任一 RGB 通道不同即算）。headless Chromium＋SwiftShader（模擬）。

| 頁面 | 比較方式 | 桌機 | 手機（iPhone 13 模擬） |
|---|---|---|---|
| 候選頁 中午 全景 | 3D 畫面（隱藏 HTML 覆蓋層） | **0** | **0** |
| 候選頁 中午 聚焦基礎程式島 | 3D 畫面 | **0** | **0** |
| 候選頁 中午 全景／聚焦 | 整個 `main` | 8,165／5,341 像素（預期，見下） | 頁面高度不同（標題列，預期） |
| 實驗室頁 中午、清晨 × 全景、聚焦 | 整個 `main` | 0 | 0 |
| `/islands`、`/islands/legacy`、19 格、A2 預覽 | 整個 `main` | 0 | 0 |

- canvas 尺寸兩版相同（桌機 898×600、手機 360×380）。
- 按鈕與連結：實驗室頁、`/islands`、legacy、19 格、A2 完全相同。候選頁**新增**（逐項）：
  1. `<select aria-label="時間情境">`（清晨／中午／黃昏／傍晚，預設中午）。
  2. 「自動旋轉」按鈕（`aria-pressed="false"`，只在全景）。
  沒有移除任何控制。
- 候選頁其他預期的畫面變化：提示文字改為「拖曳旋轉 · 滾輪或雙指縮放 · 點擊島嶼或名牌探索」；返回全景改與自動旋轉並排（D.3-5b 的版面）；單欄版面的地圖標題移到地圖上方一列（一行標題）、地圖上不再有標題；桌機黃昏／傍晚的標題底板（D.3-6b）；滑鼠游標在地圖上為 grab。
- 四個情境的候選頁截圖（桌機、手機、360 px）在 scratch 檢查過：黃昏與傍晚的燈光、海面、陰影與實驗室頁一致；手機標題在地圖外。

## 6. 效能（有界、模擬）

`0cfb146` 與整合後的候選頁各開新 context，Reduced Motion 關閉（飛行有動畫）。

| 指標 | `0cfb146` 候選頁 | 整合後候選頁 |
|---|---|---|
| 全景每幀主畫面 draw／三角形 | 43／28,569 | 43／28,569 |
| 陰影 pass 的 draw | 38 | 38 |
| WebGL program（載入後） | 17 | 17（四個情境切換後仍 17） |
| 閒置 2 秒重畫 | 0 | 0 |
| 鏡頭飛行 FPS（桌機，3 對） | 43.1／43.4／44.6 | 39.5／40.9／50.0 |
| 鏡頭飛行 FPS（手機，1 對） | 59.0 | 58.5 |
| Auto Orbit FPS（桌機／手機） | —（沒有） | 42.6／56.5；環繞期間陰影 draw 0 |
| 時間切換到第一幀（桌機） | — | 清晨 20、黃昏 23、傍晚 36、中午 23 ms；各 1 幀、1 次陰影 pass、主畫面 43 draw |
| 時間切換到第一幀（手機） | — | 25、22、23、24 ms；同上 |

- 桌機飛行 FPS 第一對差 −8%，依規則做了一次有界複測（共 3 對）：平均 43.7 對 43.5，方向不一致，判定為雜訊，**沒有可重現的退化**，不再追加。這不表示新程式沒有成本，只是本輪量測觀察不到。
- 真機數字仍待 D.3-4B。

## 7. Regression Rules 對照

| 規則 | 結果 |
|---|---|
| 首幀不出現非預期相機跳動 | 載入後名牌 1.5 秒內不動；3D 畫面與基準 0 像素差 |
| Reset Overview 不改變中午預設畫面 | 返回全景後 3D 畫面與載入時逐像素相同 |
| Camera Flight 後可以正常旋轉 | 桌機與觸控都通過 |
| Auto Orbit 不干擾選取 | 旋轉中點名牌聚焦被點的島 |
| 切換時間不重設相機 | 名牌位置不變 |
| 切換時間不造成材質洩漏 | 兩輪後中午逐像素相同、program 不增加；材質數由實驗室頁 E2E（D.3-6c）驗證，候選頁跑同一段程式 |
| 陰影更新一次後恢復 Idle | 每次 1 次陰影 pass，之後閒置 0 |
| WebGL Fallback 不顯示無效 3D 控制 | 無時間選單、自動旋轉、返回全景 |

## 8. 未解決問題與後續

1. **真機未驗證**：觸控只有 Chromium CDP 模擬；iOS Safari 的單指水平旋轉／垂直捲頁、雙指縮放、低太陽陰影品質、暖光與真機 GPU FPS 都待 D.3-4B（Not Measured）。螢幕閱讀器 Not Verified。
2. **桌機地圖標題仍在地圖上**：名牌永遠在它之上、它也不擋點擊，但放大或旋轉後可能蓋住部分地形或建築（視覺上）。若 D.3-4B 或審查認為需要，可把 `captionAbove` 的斷點放寬到桌機。
3. **滾輪直接縮放**：在候選頁滑鼠滾輪移到地圖上時會縮放地圖而不捲動頁面（D.3-5 已決定的行為），頁面較長時使用者需移開地圖再捲動。
4. `hex-camera` 的 D.3-5a 觸控測試在 `0cfb146` 也約一半機率失敗（捲動慣性），本次已改為等捲動停止；真機上的捲動慣性與雙指縮放的交互仍待 D.3-4B。
5. 既有：P1-11（`player.spec.ts` 3 項）、P1-28（鏡頭飛行閒置後第一幀）、P1-29（載入後第一次多畫一次陰影）、P1-30（Performance Inconclusive）未處理，也不宣稱已修復。
6. 正式 `/islands` 未切換；候選頁推進正式入口需在 D.3-4B 之後另行批准。
