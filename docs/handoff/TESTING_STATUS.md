# 測試與品質狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 本輪執行邊界

所有應用程式檢查都在完整來源與依賴的隔離副本執行：`/private/tmp/logiclab-handoff-20261029-4t4fgojd/isolated`，而非原始專案。來源逐檔複製、node_modules 以 macOS clone copy 複製，不是可寫連回原資料的 symlink；未執行 install 來修改正式專案。

Next.js build 會產生 `.next`、型別與可能的設定輸出；Vitest／ESLint／Playwright 也可能寫 cache／報告，所以未在原工作目錄跑。原 `.next` 不被清除或沿用。獨立資產測試本輪僅重新跑 Khronos bytes validation，JSON 寫入 `/private/tmp` 再作為文件證據複製，不重寫模型／GLB。

第一份暫存副本直接呼叫 pnpm 時，pnpm 12 的依賴驗證自動嘗試 install，因 snapshot store／網路限制失敗，甚至暫存 node_modules 被重整；**那不是 lint／unit 的產品測試結果**。後續建立第二份完整副本，直接呼叫 node CLI，避免自動 install。原專案的依賴與 lockfile 不變。未下載新工具或安裝 JDK；本輪不將 wrapper 網路失敗冒充應用錯誤。

## D.3-4A 自動化驗收（2026-10-30，獨立 commit「automated acceptance for the world map at phone widths and by keyboard (Phase D.3-4A)」）

狀態：**D.3-4A Automated Acceptance Passed**（限已執行的自動化項目）・**D.3-4B Not Measured**・**iOS Safari／Screen Reader Not Verified**。

D.3-4 分為 A 自動化驗收與 B 真機效能驗收（[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md) §0）。A 只在 Chromium（桌機 1440 px、iPhone 13 模擬、360／390 px）執行，**不是**真機證據。

| 檢查 | 結果 |
|---|---|
| 新增 `e2e/islands-acceptance.spec.ts`（兩版：360／390 px 整頁無水平溢出、鍵盤 Tab＋Enter 聚焦與返回全景含焦點框、清單模式全鍵盤進入教材、`main` 內按鈕與連結都有可讀名稱） | 重複 3 次 36 passed／24 skipped／0 failed（skipped：手機不跑鍵盤、桌機不跑窄寬度，依設計） |
| `islands-candidate`＋`islands`＋`device-tool`＋`islands-acceptance` 同一次執行（相容性） | 92 passed／14 skipped／0 failed（106 項） |
| ESLint／TypeScript／Vitest／Build | exit 0／exit 0／177 passed、6 skipped／成功（三條 `/islands` 路由仍是靜態頁） |
| 全套其他 spec | 同一份 `src/` 的上一輪全套：149 passed／6 skipped／3 failed（皆為 P1-11 `player.spec.ts`） |
| **B 真機效能** | **Not Measured**：iPhone SE（第 3 代）、iPhone 16、中階 Android |

## D.3-4 真機驗收準備（2026-10-30，獨立 commit「real-device acceptance tool and checklist for the world map (Phase D.3-4 preparation)」）

提交前在新的隔離副本重跑完整工程驗證（含文件修正與量測工具的區網安全修正；`src/` 與 `72e3eb6` 0 行差異）：

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript／checkJs | 都是 exit 0（`perf/device/*.mjs`、`perf/instrument.mjs` 以 `tsc --allowJs --checkJs --strict` 另外檢查） |
| Vitest | 15 files，177 passed／6 skipped（Java 無 JDK） |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/legacy` 仍是靜態頁 |
| E2E 全套（單次） | 149 passed／6 skipped／3 failed；3 個失敗都是既有的 `player.spec.ts`（P1-11），與本輪無關 |
| E2E `device-tool` 重複 3 次 | 42 passed／6 skipped／0 failed（含新增的區網暴露檢查；skipped：雙指縮放只在手機模擬） |
| **真機** | **未執行**，D.3-4 未通過、未判定 |

以下為準備階段當時的紀錄。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0。ESLint 用 repo 的 `eslint.config.mjs`，沒有額外排除：`perf/device/*.mjs`、`perf/instrument.mjs` 等本輪檔案都在檢查範圍（以 `--print-config` 確認）。D.2c-2／D.3-3 所說的「排除 scratch 量測腳本」指當時放在隔離副本、不進 repo 的暫存腳本，與本輪無關。`perf/device/server.mjs`、`probe.mjs` 另以 `tsc --allowJs --checkJs --strict` 檢查，exit 0 |
| Vitest | 177 passed／6 skipped；新增 `tests/device-report.test.ts` 10 項 |
| Next Build | 成功；三條路由仍是靜態頁 |
| E2E `device-tool` | 重複 3 次 36 passed／6 skipped／0 failed（skipped：雙指縮放只在手機模擬） |
| E2E `islands-candidate`＋`islands`（單次） | 66 passed／4 skipped／0 failed；其餘 spec 本輪未跑（`src/` 無變更） |
| 桌機 harness | 儀器搬到 `perf/instrument.mjs` 前後交錯各 2 次：每幀 draw call 與三角形逐項相同，FPS、首幀在誤差內 |
| 桌機 Safari dry-run | 注入程式在 WebKit 正常計數（每幀成本與 Chromium 相同）；6／8 頁後因視窗在背景而取消，工具正確標為不可靠 |
| **真機** | **未執行**：沒有實體裝置；本機沒有 adb、Xcode／iOS 模擬器。D.3-4 未通過 |

- 真機量測與檢查流程、驗收表、方法：[DEVICE_ACCEPTANCE](DEVICE_ACCEPTANCE.md)。工具是 Mac 上的 proxy（`node perf/device/server.mjs`），不修改應用程式；未開啟量測時頁面逐位元組原樣轉送。
- `e2e/device-tool.spec.ts` 在一般 E2E 中自行以空閒埠啟動 proxy，檢查工具本身（不是真機結果）。數字對照見 `logs/2026-10-30-d3-4-prep.md` §5。

## D.3-3 Preflight 候選頁與回退頁（2026-10-30，獨立 commit「candidate and rollback routes for the world map switch (Phase D.3-3 preflight)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 排除 scratch 量測腳本） |
| Vitest | 167 passed／6 skipped；新增 `tests/islands-routes.test.ts` 3 項（候選頁＝實驗室減探針、候選頁只用共用 Explorer、`/islands/legacy` 就是 `/islands` 且 noindex） |
| Next Build | 成功；`/islands/candidate`、`/islands/legacy` 都是靜態頁 |
| E2E `islands-candidate`＋`islands`＋`hex-scale`＋`hex-world` | 重複 3 次 348 passed／12 skipped／0 failed（skipped：hover 只在桌機、360／390 px 與桌機標題檢查各只在對應裝置） |
| E2E 全套（單次） | 135 passed／3 failed／4 skipped（失敗都是既有 player，P1-11） |
| 渲染成本 | 候選頁與 37 格實驗室的全景／聚焦 draw call、三角形、陰影 draw call 逐項相同（43／28,569、26／38,339、0）；飛行 FPS 與首幀在誤差內，見 `logs/2026-10-30-d3-3-preflight.md` §5 |

- `e2e/islands-candidate.spec.ts`：切換後 `/islands` 的契約（正式文案、無測試控制、3D／清單、BFS、數量、Error Boundary、context 遺失、GLB 失敗、聚焦與返回、hover、手機 360／390 px 工具列、桌機與手機的地圖標題不遮名牌、Skip Link、三條路由互不影響）。
- `e2e/islands.spec.ts` 原有情境改為在 `/islands` 與 `/islands/legacy` 各跑一次。

## D.3-2 共用 Explorer（2026-10-30，獨立 commit「shared hex world explorer with the production safety net (Phase D.3-2)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 164 passed／6 skipped |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 216/216；新增 37 格的清單模式、Error Boundary、context 遺失、聚焦時的島名與返回全景，以及 A2 預覽的清單模式 |
| E2E 全套（單次） | 91 passed／3 failed（既有 player，P1-11） |
| 3D 畫面 | 畫布像素（不含 HTML 疊層）與 `42b32bc` 在桌機與手機的全景、聚焦都是 0 像素差 |
| 效能 | draw call、三角形、依島拆分不變，時間在誤差內，見 `logs/2026-10-30-d3-2-shared-explorer.md` §4 |

## D.3-1 統一場景設定（2026-10-30，獨立 commit「unify the world map data and scene presets (Phase D.3-1)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 164 passed／6 skipped；新增 `tests/scene-presets.test.ts` 4 項；世界資料指紋搬移後不變 |
| Next Build | 成功；量測探針是獨立 chunk，只有 `/islands/hex/scale/37` 會載入 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 186/186 |
| E2E 全套（單次） | 81 passed／3 failed（既有 player，P1-11） |
| 畫面 | 37 格實驗室與 `42b32bc` 同鏡頭截圖逐像素相同（6 張，0 像素差） |
| 效能 | draw call、三角形、依島拆分與基準相同；時間不低於基準 90%，見 `logs/2026-10-30-d3-1-scene-presets.md` §5 |

## D.3-0 正式版安全網與效能基準（2026-10-30，獨立 commit「safety net and rendering baseline for the world map (Phase D.3-0)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 160 passed／6 skipped；新增 `tests/world-data.test.ts`（A2、19 格、37 格世界資料指紋） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 186/186；`islands.spec.ts` 新增清單模式、WebGL 無法建立（Error Boundary）、WebGL context 遺失、BFS 入口 4 項 × 2 裝置 |
| E2E 全套（單次） | 81 passed／3 failed（既有 player，P1-11） |
| 效能基準 | 見 `logs/2026-10-30-d3-0-baseline.md` §4；建議門檻在 §5，待批准 |

### 效能量測方法（D.3-0 起）

在隔離副本 build 並啟動 production server（不要用 port 3100），再執行：

```bash
PERF_BASE_URL=http://127.0.0.1:3118 PERF_ROUNDS=5 node node_modules/@playwright/test/cli.js test -c playwright.perf.config.ts --workers 1 --reporter line > perf.log
```

```bash
node perf/summarize.mjs perf.log
```

- `PERF_GPU=metal` 改用 Mac GPU；`PERF_CPU=4` 讓 CPU 降速 4 倍；`PERF_ROUTES` 指定要量的路由（預設 `/islands,/islands/hex/scale/37`）。
- 量測內容：每幀主畫面與陰影的 draw call 與三角形、鏡頭飛行 FPS 與幀間隔、首幀與 GLB 就緒時間；有實驗室探針的路由另外量強制渲染與依島拆分的 draw call。
- headless 的單次 rAF 數字不能當依據（P1-20），一律看多輪輪流量測的中位數。

## D.2c-2 渲染效能優化實測（37 格，2026-10-30，獨立 commit「static shadow map, tree LOD and deep-sea frame for the 37-tile prototype (Phase D.2c-2)」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0（ESLint 排除 scratch 量測腳本） |
| Vitest | 157 passed／6 skipped；新增 `tests/tree-lod.test.ts` 4 項（只換掉樹冠、樹幹樹枝逐三角形保留、外框與顏色誤差、三角形減半） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 162/162，沒有略過；新增靜態陰影與即時陰影逐像素相同的檢查（全景、聚焦、GLB 載入失敗後的暫代建築） |
| E2E 全套（單次） | 73 passed／3 failed（既有 player，P1-11） |
| 不變性 | 37 格所有資料（世界、樹、岩石、廣場、地形、海面、道路、橋、GLB 配置）hash 與 D.2c-1 相同；A2、19 格、37 格 GLB 配置與橋樑 hash 與 `fa3a9a9` 相同；受保護檔案無差異；保全庫 81/81 SHA 相符 |
| 畫面 | 同鏡頭比對 D.2c-1：桌機與手機聚焦、Retina 桌機全景 0 像素差；DPR 1 桌機全景 1.5%、手機全景 1.3% 像素不同，只在樹冠（LOD） |
| 效能（production，SwiftShader 5 輪輪流量測中位數） | FPS D.2b／D.2c-1／D.2c-2：桌機全景 19.8／11.2／20.9、桌機聚焦 18.2／10.9／19.1、手機模擬全景 30.5／19.5／35.3、手機模擬聚焦 28.2／19.5／31.2；draw call 81 → 43（聚焦 64 → 26）；三角形 74,042 → 28,569（聚焦 38,339）；Apple M6（Metal）三版都在 60 FPS 上限；閒置 rAF 請求 0。條件與距離掃描見 `logs/2026-10-30-d2c2-performance.md` |

## D.2c-1 視覺改善試作實測（37 格，2026-10-29，`f99f858`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 153 passed／6 skipped；新增 `tests/hex-natural.test.ts` 29 項（地形連續性、沙灘、道路與橋接合、廣場與主動線、森林與岩石、A2／19 格不受影響） |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 156/156，沒有略過任何項目；新增全景名牌不遮住地塊、不超出畫面（桌機與手機） |
| E2E 全套（單次） | 71 passed／3 failed（既有 player，P1-11） |
| 不變性 | A2 世界、道路、地形與 GLB 配置，以及整份 19 格原型，計算結果的 hash 與 `fa3a9a9` 相同；37 格 GLB 配置與橋樑相同，只有燈塔步道延伸；GLB、`public/`、`scripts/`、正式 `/islands`、`camera-controller.tsx` 無差異；保全庫 81/81 SHA 相符 |
| 效能（production build，同時段 A/B） | draw call 全景 80 → 81、聚焦 75／71 → 64；三角形 50,316 → 74,042；閒置時兩版 rAF 請求都是 0；連續渲染幀率（5 次中位數）桌機 32.8 → 21.4、手機尺寸 41.9 → 31.0，成本主要來自樹木，見 P1-21 與 `logs/2026-10-29-d2c1-composition.md` |

## D.2b 工坊入口道路實測（37 格，2026-10-29，獨立 commit「add the 37-tile workshop entrance road」）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 124 passed／6 skipped；`hex-scale.test.ts` 新增 5 項工坊道路測試 |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 150/150 |
| E2E 全套（單次） | 69 passed／3 failed（既有 player，P1-11） |
| 不變性 | A2 世界與道路、A2 GLB 配置、整份 19 格原型，以及 37 格的地形三角形、樹木、橋樑，計算結果的 hash 與 `eeea613` 完全相同；GLB、registry、契約、碰撞代理與渲染元件都沒有改動；保全庫 81/81 SHA 相符 |

## D.2b Scale Refinement 實測（37 格，2026-10-29，`eeea613`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 119 passed／6 skipped |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 150/150；沒有略過任何項目（37 格手機版碼頭已可點） |
| E2E 全套（單次） | 69 passed／3 failed（既有 player，P1-11） |
| 效能（同時段 A/B） | 37 格 draw call 241 → 80（聚焦 219 → 75）；每幀時間桌機約少 40～50%、手機模擬（4× CPU）約少 50%；rAF 幀率在 headless 不穩定，不列為依據（P1-20） |

## 島嶼尺度原型實測（2026-10-29，分支 `phase-d/basics-glb`，`34276fe`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 9 files，115 passed／6 skipped；新增 `tests/hex-scale.test.ts` 13 項 |
| Next Build | 成功，新增 `/islands/hex/scale/19`、`/islands/hex/scale/37` |
| E2E `hex-scale.spec.ts`＋`hex-world.spec.ts`＋`islands.spec.ts` | 44 項，重複 3 次 132/132；`hex-scale` 在 37 格手機版略過碼頭點擊（P1-18） |
| E2E 全套（單次） | 62 passed／4 failed：3 個既有 player（P1-11）＋1 個 `islands.spec` 手機版偶發失敗；單獨重複 5 次 70/70（P1-19） |
| 效能（原型內建 `canvas.__hexPerf()`） | 19 格：207 draw call／35k 三角形；37 格：241／50k（含陰影） |
| 受保護檔案 | D.0／D.1 檔案、正式 `/islands`、`camera-controller.tsx` 與 `c14e975` 無差異；保全庫 81/81 SHA 相符 |

## Phase D.2b 第二階段實測（2026-10-29，分支 `phase-d/basics-glb`，`a63217d`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 8 files，102 passed／6 skipped；新增 `tests/hex-terrain.test.ts` 9 項，`hex-buildings.test.ts` 增至 13 項 |
| Next Build | 成功 |
| E2E `hex-world.spec.ts`＋`islands.spec.ts` | 32 項，重複 5 次 160/160 |
| E2E 全套 | 51 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11） |
| 受保護檔案 | D.0／D.1 檔案、`/islands` 頁面、`camera-controller.tsx` 與 `c14e975` 比對無差異；保全庫 81/81 SHA 相符 |

## Phase D.2b 第一階段實測（2026-10-29，分支 `phase-d/basics-glb`，`c14e975`）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 7 files，90 passed／6 skipped；新增 `tests/hex-buildings.test.ts` 9 項 |
| Next Build | 成功 |
| E2E `hex-world.spec.ts`＋`islands.spec.ts` | 30 項，重複 5 次 150/150 |
| E2E 全套 | 49 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11） |
| D.0 資產與 D.1 檔案 | 與 `063f0d4` 比對無差異；保全庫 81/81 SHA 相符 |

## Phase D.2a 實測（2026-10-29，分支 `phase-d/basics-glb`）

同一隔離副本與 Playwright 覆寫設定（127.0.0.1:3118）。

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 6 files，81 passed／6 skipped；新增 `tests/hex-world.test.ts` 14 項 |
| Next Build | 成功，新增靜態路由 `/islands/hex` |
| E2E `hex-world.spec.ts` | 8/8（desktop＋mobile 各 4）；重複 5 次 40/40 |
| E2E 全套 | 41 passed／3 failed；失敗的仍是 `player.spec.ts` 那 3 個既有案例（P1-11）；`islands.spec.ts` 14/14 不變 |

hex 單元測試覆蓋：
- flat-top 角點、鄰格距離 √3·R、邊中點與兩角點一致；
- 地塊不重疊（座標與幾何）；
- 橋頭位於地塊邊緣，兩端相對且跨一格水；
- 道路從廣場連到橋頭；
- 可接受不同格數的聚落與較長的橋；
- 重疊、相鄰、橋不對邊、橋跨陸地、孤島、不連續聚落都會被拒絕；
- 正式 `/islands` 的島嶼資料不變。

## Phase D.1 實測（2026-10-29，分支 `phase-d/basics-glb`）

隔離副本：`/private/tmp/claude-501/-Users-vincelo-dev-hub-github-vince115-logic-island/3691c270-fad4-470d-8a89-a4e7513470b7/scratchpad/iso`（rsync 來源＋clone node_modules）。Playwright 使用副本外的覆寫設定，以 `node node_modules/next/dist/bin/next start` 在 127.0.0.1:3118 啟動，不經 pnpm；:3100 被其他專案占用。

| 檢查 | 結果 |
|---|---|
| ESLint | exit 0 |
| TypeScript | exit 0 |
| Vitest | 5 files，67 passed／6 skipped（Java 無 JDK） |
| Next Build | 成功 |
| E2E `islands.spec.ts` | 14/14 passed（desktop＋mobile 各 7）；連續 5 次重複 70/70 |
| E2E 全套 | 33 passed／3 failed；失敗的 3 個都在 `player.spec.ts`，以 D.0 commit 建立的另一副本重跑同樣失敗，見 KNOWN_ISSUES P1-11 |
| 真實手機 | 未執行 |

islands E2E 覆蓋：GLB 200 載入且無 Draco／外部請求、另外兩島維持原模型與教材連結、Anchor 標籤不攔截點擊且 route_exit 無標籤、燈塔／碼頭說明、工坊導向 `/learn`、GLB 404 與契約節點缺失時回到原創幾何。

以下為交接當時的原始紀錄，保留不改。

## 當前實測結果（2026-10-29）

| 檢查 | 等價工具與本輪指令（隔離副本） | 結果 | 依據 |
|---|---|---|---|
| ESLint | `node node_modules/eslint/bin/eslint.js .` | **失敗，1 error／0 warning** | `evidence/actual-lint.log`；island-scene.tsx:51 react-hooks/immutability |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | **失敗，exit 2** | `evidence/actual-typecheck.log`；3 個 TS7016，three 沒有可解析的宣告 |
| Next Build | `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build` | **失敗，exit 1** | `evidence/actual-build.log`；5 個 islands.module.css module-not-found |
| Unit／DOM／三語範例 | `node node_modules/vitest/vitest.mjs run` | **3 files passed，45 passed／6 skipped** | `evidence/actual-unit.log` |
| E2E 清單 | `node node_modules/@playwright/test/cli.js test --list` | **22 案例成功列出** | `evidence/actual-e2e-list.log`；不啟動 browser |
| Web Browser E2E | 未執行 `test:e2e` | **Blocked：目前 build 失敗，無可驗證的最新 production bundle** | `playwright.config.ts` 需要先 build，再 start :3100；未拿舊 .next 替代 |
| Java 範例 | 系統 java_home／javac 探測，Vitest skipIf | **未驗證，6 skipped** | 本機無 Java Runtime／JDK，`javac` 只存在 shim |
| 三個 GLB 格式 | 以既有 gltf-validator `validateBytes` 讀取實際 bytes | **Verified，全部 0 error／0 warning** | `evidence/glb-current.json` 含當前 SHA-256、bytes、節點統計 |
| Three.js Desktop／Mobile | 本輪讀取歷史報告與 hashes，未重啟 viewer | **歷史報告 Verified，不是本輪 runtime 驗證** | PhaseA／v2／v2.1 的 Browser_Validation JSON，詳資產盤點 |
| 真實手機 WebGL | 未執行 | **Not Started／未驗證** | 沒有真機 Safari／Android GPU／FPS 證據 |
| R3F 正式 GLB 整合 | 未開始且未批准 | **Not Started／Blocked 批准門檻** | 原型使用 local geometry，無 GLB loader |

本輪「通過」的範圍不超過這張表，沒有 peer check／coverage／跨瀏覽器／部署驗證結果。README 的舊 lint/build 成功不能覆蓋本輪失敗。

## Unit 測試拆分

- 21 個演算法／parser／快照／游標案例：`tests/engine.test.ts`。
- 12 個共用 Lab DOM／fake timers 案例：`tests/player.test.tsx`，jsdom setup 在 `tests/setup.ts`，不是 browser rendering。
- 6 Python＋6 C++17 範例實際執行：`tests/examples.test.ts`；編譯檔寫入 OS tmpdir。
- 6 Java 範例 skip：不能標「Java 已可執行」。Java 17+ 語法是內容意圖，需有 JDK 才驗證。
- 合計 51 tests＝45 passed＋6 skipped。無單獨教材 coverage 百分比、沒有生成 HTML coverage。

測試覆蓋細項與每課限制見 [架構](ARCHITECTURE.md)。HTML number min/max 不等於完整 engine API 驗證，新增輸入與教材應補對應測試。

## 瀏覽器與權限

原 README／playwright.config.ts 記錄 2026-10-28 browser 被權限政策擋住，當時未執行。本輪沒有重新測試該政策，**不推斷今天同樣被擋**；因最新 build 不成立，先停在列出 22 案例，沒有更換 port 或瀏覽器繞過問題。現有 E2E 對教材，沒有任何 `/islands`／GLB 整合案例。

本輪讀過安裝內 `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`、`vitest.md`；正式 production E2E 應依該版本指南先取得可建置 bundle。首次修復經授權後，建議順序：lint → tsc → unit → clean build → test:e2e → 新增 islands 整合驗收。禁止直接對 stale .next 開 server 宣稱當前程式通過。

## GLB 與獨立 Three.js 的細節

| 資產 | bytes／triangles／nodes／materials | 本輪 Khronos | 歷史主 pass calls |
|---|---|---|---|
| v1 技術修復 GLB | 74,336／882／49／15 | 0 error、0 warning、0 info | 43 |
| v2 | 828,192／9,324／43／2 | 0 error、0 warning、0 info | 21 |
| v2.1 | 879,748／9,800／46／2 | 0 error、0 warning、**1 info** | 24 |

v2.1 info 為 `UNUSED_OBJECT`，位置 `/meshes/7/primitives/0/attributes/TEXCOORD_0`，不是 warning，但不應隱藏。三份 GLB 皆沒有相機／燈光，沒有 required extension；用到 emissive strength。

歷史 viewer 使用 Three r186、Headless Chrome／SwiftShader，桌面 1600×900、手機視窗 390×844；不等於 iOS Safari 或硬體效能。v2.1 有兩視窗各三地標最近命中 Raycast（lighthouse／learn／entry），前兩版本僅有較小的地標／pivot smoke check；不混用覆蓋程度。原始嚴格共面腳本 exit 1 與 Validator 0/0 並存，詳 [已知問題](KNOWN_ISSUES.md)。

## 重現與證據保全

在新環境需核對 Node／pnpm／編譯器再安裝固定 lockfile，且知道 pnpm 12 會驗證依賴；本輪不更動 workspace.yaml 關閉該行為。若已有完整安裝，直接工具 CLI 可避免 audit 副本自動 install；應先檢查套件可執行，不能使用缺檔的暫存副本。

`evidence/test-summary.json` 記錄 exit codes 與副本位置；`actual-*.log` 是無色彩控制碼的實測輸出。`source-before.json`／`source-protection.json` 證明原始程式未變；暫存路徑可日後失效，關鍵結果已保存至交接文件，不依賴 tmp 永久存在。
