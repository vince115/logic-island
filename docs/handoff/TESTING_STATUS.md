# 測試與品質狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 本輪執行邊界

所有應用程式檢查都在完整來源與依賴的隔離副本執行：`/private/tmp/logiclab-handoff-20261029-4t4fgojd/isolated`，而非原始專案。來源逐檔複製、node_modules 以 macOS clone copy 複製，不是可寫連回原資料的 symlink；未執行 install 來修改正式專案。

Next.js build 會產生 `.next`、型別與可能的設定輸出；Vitest／ESLint／Playwright 也可能寫 cache／報告，所以未在原工作目錄跑。原 `.next` 不被清除或沿用。獨立資產測試本輪僅重新跑 Khronos bytes validation，JSON 寫入 `/private/tmp` 再作為文件證據複製，不重寫模型／GLB。

第一份暫存副本直接呼叫 pnpm 時，pnpm 12 的依賴驗證自動嘗試 install，因 snapshot store／網路限制失敗，甚至暫存 node_modules 被重整；**那不是 lint／unit 的產品測試結果**。後續建立第二份完整副本，直接呼叫 node CLI，避免自動 install。原專案的依賴與 lockfile 不變。未下載新工具或安裝 JDK；本輪不將 wrapper 網路失敗冒充應用錯誤。

## D.2b Scale Refinement 實測（37 格，2026-10-29，未 commit）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 119 passed／6 skipped |
| Next Build | 成功 |
| E2E `hex-scale`＋`hex-world`＋`islands` | 重複 3 次 150/150；沒有略過任何項目（37 格手機版碼頭已可點） |
| E2E 全套（單次） | 69 passed／3 failed（既有 player，P1-11） |
| 效能（同時段 A/B） | 37 格 draw call 241 → 80（聚焦 219 → 75）；每幀時間桌機約少 40～50%、手機模擬（4× CPU）約少 50%；rAF 幀率在 headless 不穩定，不列為依據（P1-20） |

## 島嶼尺度原型實測（2026-10-29，分支 `phase-d/basics-glb`，未 commit）

| 檢查 | 結果 |
|---|---|
| ESLint／TypeScript | 都是 exit 0 |
| Vitest | 9 files，115 passed／6 skipped；新增 `tests/hex-scale.test.ts` 13 項 |
| Next Build | 成功，新增 `/islands/hex/scale/19`、`/islands/hex/scale/37` |
| E2E `hex-scale.spec.ts`＋`hex-world.spec.ts`＋`islands.spec.ts` | 44 項，重複 3 次 132/132；`hex-scale` 在 37 格手機版略過碼頭點擊（P1-18） |
| E2E 全套（單次） | 62 passed／4 failed：3 個既有 player（P1-11）＋1 個 `islands.spec` 手機版偶發失敗；單獨重複 5 次 70/70（P1-19） |
| 效能（原型內建 `canvas.__hexPerf()`） | 19 格：207 draw call／35k 三角形；37 格：241／50k（含陰影） |
| 受保護檔案 | D.0／D.1 檔案、正式 `/islands`、`camera-controller.tsx` 與 `c14e975` 無差異；保全庫 81/81 SHA 相符 |

## Phase D.2b 第二階段實測（2026-10-29，分支 `phase-d/basics-glb`，未 commit）

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
