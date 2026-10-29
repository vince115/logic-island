# 測試與品質狀態

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 本輪執行邊界

所有應用程式檢查都在完整來源與依賴的隔離副本執行：`/private/tmp/logiclab-handoff-20261029-4t4fgojd/isolated`，而非原始專案。來源逐檔複製、node_modules 以 macOS clone copy 複製，不是可寫連回原資料的 symlink；未執行 install 來修改正式專案。

Next.js build 會產生 `.next`、型別與可能的設定輸出；Vitest／ESLint／Playwright 也可能寫 cache／報告，所以未在原工作目錄跑。原 `.next` 不被清除或沿用。獨立資產測試本輪僅重新跑 Khronos bytes validation，JSON 寫入 `/private/tmp` 再作為文件證據複製，不重寫模型／GLB。

第一份暫存副本直接呼叫 pnpm 時，pnpm 12 的依賴驗證自動嘗試 install，因 snapshot store／網路限制失敗，甚至暫存 node_modules 被重整；**那不是 lint／unit 的產品測試結果**。後續建立第二份完整副本，直接呼叫 node CLI，避免自動 install。原專案的依賴與 lockfile 不變。未下載新工具或安裝 JDK；本輪不將 wrapper 網路失敗冒充應用錯誤。

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
