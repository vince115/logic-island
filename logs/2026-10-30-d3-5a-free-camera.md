# D.3-5a 自由相機（Lab Only）（2026-10-30）

> 授權範圍：只在 `/islands/hex/scale/37`（`lab` preset）啟用自由相機。擴充既有 `HexCamera`／drei `CameraControls`（camera-controls 3.1.2），不引入 OrbitControls 或新套件。不做 D.3-5b Auto Orbit、D.3-6 時間情境；候選頁 `/islands/candidate`、正式 `/islands`、`/islands/legacy` 不啟用新控制；不改 GLB、地形、教材、資產庫；不 merge、不 push。基準：`86efe53`（D.3-4A）。規劃與核實後的修正見 `logs/2026-10-30-d3-5-d3-6-analysis.md`。

## 1. 結果摘要

- 37 格實驗室頁：桌機左鍵拖曳旋轉、滾輪縮放；手機單指水平旋轉、垂直捲動頁面、雙指縮放，觸控時仰角固定（方案 B）。
- 限制：仰角 28°～60°，方位角不限；縮放下限＝各方位全景取景 zoom 的最小值 × 0.85，上限＝最近聚焦 zoom × 2（最多 150）。
- 旋轉支點改用 focal offset，地圖繞內容中心旋轉；點名牌或清單聚焦時保留目前方位角、回到預設仰角；「返回全景」恢復預設視角與畫面，全景時只要視角偏離預設就能按；視窗尺寸改變時保留方位角。
- 名牌套用與 3D 點擊相同的 6 px 拖曳判斷；全景名牌掛向在相機停下後依目前方位重算。
- 低仰角＋縮到最遠時，近平面會切到海面（手機模擬重現），改為必要時把相機沿視線往後移；預設視角距離仍是 40。
- 預設全景與聚焦的畫布像素、候選頁與 `/islands` 的畫面，和 `86efe53` 逐像素相同（§4）。

## 2. 修改的檔案

| 檔案 | 變更 |
|---|---|
| `src/components/islands/hex-world/hex-camera.tsx` | 取景抽成 `frame()`；`free` 模式（輸入、俯仰與縮放限制、依目前方位取景、focal offset、`resetKey`、保留方位、`pan-y` 與觸控仰角固定、近平面保護、相機停下後回報）。`free` 關閉時的路徑與原本逐式相同 |
| `src/components/islands/hex-world/hex-world-scene.tsx` | 新選項 `camera: 'fixed' \| 'free'`；`captionPoint` 依目前視角；名牌 6 px 拖曳判斷（只在 `free`）；`data-camera` 屬性；`resetKey`／`onViewChange` 往返 Explorer |
| `src/components/islands/hex-world/hex-world-explorer.tsx` | 「返回全景」：離開聚焦並（自由相機時）重設視角；可用條件加上「視角已偏離預設」；切到清單或 fallback 時清除 |
| `src/components/islands/hex-world/hex-scene-presets.ts` | `lab` 加 `camera: 'free'`；`production` 不變 |
| `src/components/islands/hex-world/hex-scale-explorer.tsx` | 37 格提示文案改為「拖曳旋轉 · 滾輪或雙指縮放 · 點擊名牌聚焦」；19 格不變 |
| `src/components/islands/hex-world/hex-perf-probe.tsx`（只有實驗室頁載入） | `__hexCamera()` 讀方位、仰角、zoom 與上下限、focal offset、距離、`touch-action`；`__hexView` 同時清除 focal offset |
| `src/components/islands/islands.module.css` | `[data-camera='free']`：`cursor: grab`、canvas `touch-action: pan-y`（其他頁的規則不變） |
| `src/app/islands/legacy/page.tsx` | 只改註解：清理階段改稱 D.3-7（行為與輸出不變） |
| `tests/scene-presets.test.ts`、`tests/islands-routes.test.ts` | `lab`＝`production`＋探針＋自由相機；候選頁沒有 `camera`（固定相機） |
| 新增 `e2e/hex-camera.spec.ts` | D.3-5a E2E 9 項 × 2 裝置（§5） |
| 文件 | 本檔；`logs/2026-10-30-d3-5-d3-6-analysis.md` 整合核實後的修正與決策；ROADMAP、IMPLEMENTATION_STATUS、NEXT_STEPS、TESTING_STATUS、KNOWN_ISSUES（P1-21、P1-27）、DEVICE_ACCEPTANCE（D.3-4B 時機、T-06） |

未修改：`camera-controller.tsx`、`island-scene.tsx`、`glb-island-model.tsx`、`islands-world-explorer.tsx`（候選頁）、`/islands` 與 `/islands/candidate` 的 page、`production`／`scale19`／`a2Preview` preset、GLB、地形、教材、資產庫、`package.json`／lockfile。

## 3. 實作重點與發現

| 項目 | 做法與理由 |
|---|---|
| 不換 OrbitControls | camera-controls 已有 `ROTATE`／`ZOOM`／`TOUCH_ROTATE`／`TOUCH_ZOOM`、`min/maxPolarAngle`、`min/maxZoom`、`setFocalOffset`、`normalizeRotations`、事件；既有飛行（`setLookAt`＋`zoomTo`＋`smoothTime`）原樣保留 |
| 固定相機不變 | `free` 關閉時仍用原本的運算順序（target 加位移、距離 40），候選頁的 CameraControls props 與原本完全相同 |
| 旋轉支點 | 版面位移原本加在 target 上；自由模式改成 `setFocalOffset(0, -shift, 0)`，相機位置與方向和原本相同（預設畫面逐像素相同），但旋轉繞內容中心 |
| 方位角累加 | camera-controls 的方位角會累加整圈；`setLookAt` 之後呼叫 `normalizeRotations()`，聚焦與返回全景走短的方向 |
| P1-27（方案 B） | camera-controls 連接時把 R3F 外層 div 設成 `touch-action: none`（名牌也在裡面）；`HexCamera` 在控制器連接後改回 `pan-y`，canvas 也用 `pan-y`。瀏覽器接手垂直捲動時控制器收到 `pointercancel` 結束拖曳。觸控 pointerdown 時 `polarRotateSpeed = 0`（仰角固定），滑鼠為 1 |
| 名牌拖曳 | 名牌在控制器監聽的元素裡，從名牌開始拖曳、在名牌上放開仍會觸發 click。名牌記錄 pointerdown 位置，移動 ≥ 6 px 時忽略 click；鍵盤觸發（`detail === 0`）不受影響 |
| 相機停下的判斷 | camera-controls 在移動剛好停在限制上時不發 `rest`（只發 `sleep`），且滾輪不發 `controlstart`／`controlend`；因此在 `controlend`、`rest`、`sleep` 都回報（拖曳中不回報）。回報內容：方位、仰角（預設視角時為 null）與是否偏離預設 |
| 近平面 | 正交相機距離目標 40；仰角 28°、手機縮到最小（zoom 6.5）時，畫面底邊的近平面低於海面約 5.7，底部露出背景色（手機模擬重現：底部 4 列 2,160 個背景色像素）。每幀在 camera-controls 更新前檢查，必要時把距離加大到讓近平面底邊高於海面 1（正交相機畫面不變）：桌機極限約 41、手機約 60.7；預設視角維持 40 |
| 縮放上下限 | 桌機（898×600 畫布）預設 zoom 20.20、下限 15.19、上限 104.36；手機（iPhone 13 模擬）預設 8.44、下限 6.50、上限 43.28 |

## 4. 與 `86efe53` 的畫面比對

兩份隔離副本（`86efe53` 與本次）各自 build 與啟動（3119／3118），以同一份 scratch 腳本擷取。實驗室頁讀 canvas 像素（不含 HTML 疊層），候選頁與 `/islands` 用 canvas 元素截圖；任何一個色版不同就算一個差異像素。

| 擷取 | 桌機 | 手機（iPhone 13 模擬） |
|---|---|---|
| 實驗室頁全景（canvas 像素） | 898×600，0 | 540×570，0 |
| 實驗室頁聚焦基礎程式島 | 898×600，0 | 540×570，0 |
| 實驗室頁全景名牌掛向 | 相同（left／right／below） | 相同 |
| `/islands/candidate` 載入後／滑鼠拖曳後 | 898×601，0／0 | 1080×1143，0／0 |
| `/islands` 載入後／滑鼠拖曳後 | 898×601，0／0 | 1080×1143，0／0 |
| 候選頁與 `/islands` 的 canvas、外層 `touch-action` | `none`／`none`（相同） | 相同 |

## 5. 測試結果

全部在隔離副本執行（rsync 來源＋clone `node_modules`；直接呼叫 node CLI，不經 pnpm；`next start` 用 3118 埠，基準副本 3119；3100 屬其他專案）。提交前重新同步並確認副本的 `src/`、`e2e/` 與工作目錄完全相同後，乾淨重建再跑。

| 檢查 | 結果 |
|---|---|
| ESLint（repo 的 `eslint.config.mjs`，範圍＝repo 檔案） | exit 0。隔離副本裡另有不進 repo 的舊 scratch 量測腳本（`capture/`），以 `--ignore-pattern 'capture/**'` 排除；repo 沒有該資料夾 |
| TypeScript（`tsc --noEmit`） | exit 0 |
| Vitest | 15 files，177 passed／6 skipped（與 `86efe53` 相同；Java 無 JDK）；`scene-presets`、`islands-routes` 兩項改為 `lab`＝production＋探針＋自由相機、候選頁沒有 `camera` |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/legacy` 仍是靜態頁 |
| E2E 全套（單次） | 173 passed／20 skipped／3 failed；3 個失敗是既有的 `player.spec.ts`（P1-11，與 D.3-2／D.3-3 全套的同 3 項完全相同），與本輪無關 |
| E2E `hex-camera`＋`hex-scale`＋`islands-candidate`＋`islands-acceptance` 重複 3 次 | 228 passed／54 skipped／0 failed（skipped 依設計：各 spec 只在桌機或只在手機執行的項目，與既有 spec 的略過相同） |
| 畫面比對 | §4：實驗室頁、候選頁、`/islands` 與 `86efe53` 0 像素差 |

新增 `e2e/hex-camera.spec.ts`（9 項；桌機 6 項、手機 6 項，另 6 項依裝置略過）：

1. 預設全景沿用原本的視角（方位 33.69°、仰角 36.06°、距離 40），外層與 canvas `touch-action: pan-y`，返回全景初始停用。
2. 滑鼠拖曳旋轉不聚焦、不離開頁面；從名牌開始拖曳不聚焦；單純點擊名牌仍聚焦（桌機）。
3. 滾輪縮放停在上下限、滾輪不捲動頁面；俯仰停在 28°／60°；28°＋最遠時畫面上下 4 列沒有背景色（桌機）。
4. 旋轉後點名牌聚焦並保留方位（仰角回預設）；返回全景後方位、仰角、zoom 回到初始，**canvas 與初始全景 0 像素差**，名牌掛向復原，按鈕回到停用。
5. 從名牌拖曳後，鍵盤 Enter 返回全景可恢復；鍵盤 Enter 聚焦名牌不受拖曳判斷影響（桌機）。
6. 視窗尺寸改變保留方位角與仰角。
7. 觸控（Chromium iPhone 13 模擬，CDP 觸控事件）：水平滑動旋轉且頁面不捲動、偏水平的斜向滑動仰角不變、垂直滑動捲動頁面且相機不變、雙指縮放且頁面不捲動、短按名牌聚焦（手機）。
8. 實驗室頁 360／390 px 沒有水平溢出（手機）。
9. 候選頁維持固定相機：canvas 與外層 `touch-action: none`、沒有 `data-camera`、拖曳後截圖不變、返回全景仍停用、滾輪照常捲動頁面（桌機）。

**觸控結果只代表 Chromium 模擬**：CDP 觸控事件經過 Chromium 的手勢判斷（垂直滑動確實捲頁），但不代表 iOS Safari；iOS 標為**待真機驗證**。

## 6. 效能（與 `86efe53` 比較）

方法同 D.3-0（`perf/world.perf.ts`，`PERF_ROUNDS=3`，路由 `/islands/hex/scale/37,/islands/candidate`），兩份隔離副本各自啟動，**交錯執行 base → new → base → new**，每個版本合計 6 輪取中位數。headless Chromium＋SwiftShader，**不是真機數字**（P1-20）；兩個版本後半輪都比前半輪快（機器負載漂移），FPS 的小幅差異在誤差內。

| 頁面／裝置 | 指標 | `86efe53` | D.3-5a | 差異 |
|---|---|---|---|---|
| 實驗室頁 桌機 | 全景／聚焦 draw call（主畫面／陰影） | 43／26（0／0） | 43／26（0／0） | 相同 |
| | 全景／聚焦三角形 | 28,569／38,339 | 28,569／38,339 | 相同 |
| | 首幀 | 1,657.5 ms | 1,689.5 ms | +1.9% |
| | 鏡頭飛行 FPS | 38.7 | 42.6 | +10%（漂移，見上） |
| 實驗室頁 手機模擬 | draw call／三角形 | 同上 | 同上 | 相同 |
| | 首幀 | 1,630.5 ms | 1,571 ms | −3.6% |
| | 鏡頭飛行 FPS | 55.75 | 55.15 | −1.1% |
| 候選頁 桌機 | draw call／三角形 | 43／26；28,569／38,339 | 相同 | 相同 |
| | 首幀 | 1,595.5 ms | 1,512 ms | −5.2% |
| | 鏡頭飛行 FPS | 39.0 | 41.0 | +5.1% |
| 候選頁 手機模擬 | draw call／三角形 | 同上 | 同上 | 相同 |
| | 首幀 | 1,554 ms | 1,621 ms | +4.3% |
| | 鏡頭飛行 FPS | 55.45 | 54.2 | −2.3% |

新增互動（只有 D.3-5a 有，無基準可比；scratch 腳本，同樣以 `perf/instrument.mjs` 計數，3 輪）：

| 情境 | 桌機 | 手機模擬 |
|---|---|---|
| 拖曳旋轉 FPS（約 2 秒穩定拖曳 × 3 次） | 41.3～43.3（幀間隔中位數 16.7 ms，p95 33.4） | 59.3～59.7（p95 16.8） |
| 滾輪縮放 FPS | 44.0～45.2 | —（手機沒有滾輪） |
| 旋轉後全景每幀 draw call（主畫面／陰影） | 43／0 | 43／0 |
| 停止後 2 秒內的重畫 | 0 | 0 |

- 旋轉、縮放都不會重畫陰影貼圖（靜態陰影只看投影物件，相機移動不影響）。
- 拖曳期間持續重畫，負載與鏡頭飛行同級；另有名牌 DOM 位置的每幀更新（drei `Html`）。真機數字留待 D.3-4B（候選頁整合後）。

## 7. 已知限制

1. **iOS Safari 未驗證**：方案 B 的 `touch-action: pan-y`、單指水平旋轉與垂直捲頁、雙指縮放只在 Chromium（iPhone 13 模擬，CDP 觸控）通過；iOS Safari 對 `pan-y` 與 pointer events 的實際行為需真機確認（DEVICE_ACCEPTANCE T-06、D.3-4B）。**不宣稱通過**。
2. 真機效能未量：拖曳旋轉與滾輪縮放時持續重畫，負載等同鏡頭飛行；數字只有 SwiftShader（headless）。
3. 斜向滑動：瀏覽器在手勢開始時依方向決定捲頁或交給地圖；偏垂直的斜向滑動會捲頁、不旋轉。
4. 滾輪在地圖上時頁面不捲動（產品決定）；縮到上下限後滾輪仍不捲頁。
5. 近平面保護依目前 zoom 計算，縮放過程中有一幀延遲；已留 1 單位邊界，E2E 檢查低仰角＋最遠時畫面上下邊緣沒有背景色。
6. 旋轉後全景的取景仍是預設方位的 zoom；某些方位下世界的外接範圍較大，可能需要稍微縮小才看得到全部（下限已涵蓋各方位）。
7. 名牌掛向在相機停下後才更新，旋轉途中可能短暫蓋到島上。
8. 鍵盤沒有旋轉操作；鍵盤使用者用名牌、清單與「返回全景」，與規劃一致。
9. 候選頁仍是固定相機與 `touch-action: none`（P1-27 在候選頁未改）；推進屬 D.3-5c，需另行批准。
