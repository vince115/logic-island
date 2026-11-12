# D.3-5b Auto Orbit（Lab Only）（2026-10-30）

> 授權範圍：只在 `/islands/hex/scale/37`（`lab` preset，自由相機）加入「自動旋轉」。沿用既有 `HexCamera`／drei `CameraControls`，不新增套件。不改候選頁 `/islands/candidate`、正式 `/islands`、`/islands/legacy`；不做 D.3-6；不改 GLB、地形、教材、資產庫；不 merge、不 push。基準：`f719f42`（D.3-5a）。

## 1. 結果摘要

- 地圖下方「返回全景」左邊新增「自動旋轉」按鈕（`aria-pressed`），只在自由相機的全景顯示；預設關閉，reduced motion 時也一樣，使用者可主動開啟。
- 開啟後以約 6°／秒繞內容中心旋轉，保持目前仰角與 zoom；在 `frameloop="demand"` 下，每一幀轉動後才要求下一幀，所以只在旋轉期間持續重畫。
- 停止條件：拖曳（滑鼠、單指）、雙指縮放、滾輪、點名牌或島嶼（聚焦）、從清單聚焦、切換清單模式、WebGL fallback／context 遺失、分頁隱藏、按「返回全景」（同時重設視角），以及再按一次按鈕。停止後不會自動恢復。
- 旋轉期間按下地圖或名牌時，按下的那一刻就停止旋轉，之後的點擊判斷都在靜止的畫面上進行，所以聚焦的是使用者點到的那座島；全景名牌掛向每轉 15° 更新一次。
- 停止後閒置重畫 0；旋轉期間不重畫陰影貼圖，draw call 與靜止全景相同。

## 2. 修改的檔案

| 檔案 | 變更 |
|---|---|
| `src/components/islands/hex-world/hex-camera.tsx` | `orbit`／`onOrbitStop`：每幀 `rotate(6°×delta, 0)`（一幀最多 50 ms，避免分頁回來時跳動）；飛行途中先等降落；`controlstart`（拖曳、單指、雙指）與滾輪（camera-controls 的滾輪不發 `controlstart`，另外監聽）呼叫 `onOrbitStop`；開始時 `invalidate()`；名牌每 15° 回報一次 |
| `src/components/islands/hex-world/hex-world-scene.tsx` | 只在自由相機時把 `orbit`／`onOrbitStop` 交給 `HexCamera` |
| `src/components/islands/hex-world/hex-world-explorer.tsx` | `orbiting` 狀態與按鈕（只在自由相機的全景）；聚焦、返回全景、清單模式、fallback、分頁隱藏時關閉；旋轉時「返回全景」可用。固定相機頁（候選頁等）的提示列 DOM 與原本相同 |
| `src/components/islands/islands.module.css` | `.stageActions`（兩個按鈕並排，手機靠右）與按下狀態（框線、底色、內框，不只靠顏色） |
| `perf/world.perf.ts` | 有「自動旋轉」的頁面另外量 5 秒環繞的 FPS 與停止後 2 秒的重畫數 |
| `e2e/hex-camera.spec.ts` | D.3-5b 9 項（§4）；候選頁的 D.3-5a 測試加上「沒有自動旋轉」 |
| 文件 | 本檔；ROADMAP、IMPLEMENTATION_STATUS、NEXT_STEPS、TESTING_STATUS；`logs/2026-10-30-d3-5-d3-6-analysis.md` §6 標註 D.3-5b 完成 |

未修改：`islands-world-explorer.tsx`（候選頁）、`hex-scene-presets.ts`（`lab` 已是自由相機，沒有新欄位）、`camera-controller.tsx`、`island-scene.tsx`、`glb-island-model.tsx`、`/islands`、`/islands/candidate`、`/islands/legacy`、GLB、地形、教材、資產庫、`package.json`／lockfile。

## 3. 設計重點

| 項目 | 做法與理由 |
|---|---|
| 狀態歸屬 | 沿用 D.3-2 分工：Explorer 持有 `orbiting`（產品狀態：按鈕、聚焦、清單、fallback、分頁），`HexCamera` 只負責轉動與回報「使用者動了地圖」 |
| 只轉需要的幀 | 每幀在 camera-controls 更新前（`useFrame` priority -3）呼叫 `rotate(角度, 0, false)`，camera-controls 更新後發 `update`，drei 隨即 `invalidate()` 下一幀；停止後沒有變化，camera-controls 不再要求重畫 |
| 保持仰角與縮放 | `rotate` 只改方位角；zoom 不動；focal offset 讓旋轉繞內容中心 |
| 點擊正確 | camera-controls 在 pointerdown 就發 `controlstart`（名牌也在它監聽的元素裡），旋轉立即停；R3F 的點擊與名牌的 6 px 判斷都在靜止畫面上進行 |
| 不與鏡頭飛行互搶 | 旋轉中聚焦：Explorer 先關掉旋轉，飛行照常進行。飛行途中開啟（例如按「返回全景」後立刻按「自動旋轉」）：每幀先檢查飛行是否還在途中（方位、仰角與終點差超過約 0.1°，或 target、focal offset 差超過 0.01），是就只要求下一幀、不轉，降落後才開始轉。否則無轉場的 `rotate` 會把飛行的角度直接跳到終點（審查時指出的風險，見下方） |
| 滾輪 | camera-controls 的滾輪不發 `controlstart`，在同一個元素上另外監聽 `wheel`（passive，不影響縮放） |
| 分頁隱藏 | Explorer 在旋轉期間監聽 `visibilitychange`；另外每幀的轉動量最多 50 ms，即使瀏覽器暫停 rAF 也不會在回來時跳一大段 |
| 名牌掛向 | 每轉 15° 回報一次（約 2.5 秒一次），而不是每幀重新 render 整個場景 |
| Reduced Motion | 預設關閉（所有使用者都是）；開啟需要使用者按鈕。旋轉本身不因 reduced motion 改速度 |
| 無障礙 | 原生 `<button aria-pressed>`，可用 Tab／Enter／Space；可隨時暫停（WCAG 2.2.2）；按下狀態有框線與內框 |

### 3.1 飛行與旋轉的驗證（2026-10-30）

審查要求確認 Auto Orbit 與 Camera Flight 是否互搶相機。以 scratch 腳本記錄「從轉開約 90° 的全景按返回全景」每一幀的方位（桌機、動畫開啟）：

| 情境 | 前幾幀的方位（°，時間 ms） | 結果 |
|---|---|---|
| 只有飛行 | −56.3（1）→ −56.3（17）→ −14.9（56）→ −11.4（86）→ −8.9（108）… 2.5 秒後 33.59 | 第一幀大步是既有行為（P1-28），之後平滑接近 33.69 |
| 飛行＋立刻開自動旋轉（修正後） | −56.3（1）→ −56.3（7）→ −15.4（28）→ −13.5（53）→ −11.3（72）… | 與只有飛行相同，降落後才開始轉 |
| 突變測試：拿掉「等降落」 | 38 ms 就到達預設方位 | 飛行被截斷；新 E2E 會失敗（要求 > 300 ms） |

最初的版本沒有「等降落」，飛行途中開啟會在下一幀把角度跳到終點；已修正，並以新增的 E2E 與突變測試確認測試能分辨兩者。第一幀的大步與 Auto Orbit 無關，記為 KNOWN_ISSUES P1-28。

## 4. 測試結果

全部在隔離副本執行（rsync 來源＋clone `node_modules`，直接呼叫 node CLI；`next start` 用 3118，基準副本 `f719f42` 用 3119；3100 屬其他專案）。最終數字都是加入「等降落」修正後、乾淨重建的版本。

| 檢查 | 結果 |
|---|---|
| ESLint（範圍＝repo 檔案；隔離副本裡不進 repo 的 `capture/` 另行排除）／TypeScript | exit 0／exit 0 |
| Vitest | 15 files，177 passed／6 skipped（與 `f719f42` 相同） |
| Next Build | 成功；`/islands`、`/islands/candidate`、`/islands/legacy` 仍是靜態頁 |
| E2E 全套（單次） | 189 passed／22 skipped／3 failed；3 個失敗是既有的 `player.spec.ts`（P1-11），與之前每次全套的同 3 項完全相同，沒有新增回歸 |
| E2E `hex-camera`＋`hex-scale`＋`islands-candidate`＋`islands-acceptance` 重複 3 次 | 276 passed／60 skipped／0 failed（skipped 依設計：只在桌機或只在手機執行的項目） |
| 突變測試 | 拿掉「等降落」後，新的飛行／旋轉測試失敗（38 ms 就到預設方位，要求 > 300 ms）；還原後通過 |
| 與 `f719f42` 比對 | 實驗室頁全景與聚焦的 canvas、候選頁與 `/islands`（載入後與拖曳後）都是 0 像素差；候選頁與 `/islands` 的按鈕與連結（各 11 個）標記與文字完全相同；`touch-action` 相同；`git diff f719f42` 對候選頁、`/islands`、`/islands/legacy`、`islands-world-explorer.tsx`、preset、舊渲染器、`public/`、`src/content`、`src/lib`、相依套件都是 0 |

`e2e/hex-camera.spec.ts` 新增的 D.3-5b 項目（另有候選頁測試加上「沒有自動旋轉」）：

1. 預設關閉（`reduce` 與 `no-preference` 都是），reduced motion 下可主動開啟；鍵盤 Enter 開、Space 關（手機用點按）；速度 3～9°／秒之間（實際約 6°）；仰角與 zoom 不變；只在全景提供，聚焦後按鈕消失，回到全景是關閉。
2. 滑鼠拖曳、滾輪立即停止，停止後 1.2 秒仍不恢復（桌機）。
3. 單指滑動、雙指縮放立即停止（手機，Chromium 觸控模擬）。
4. 旋轉中點移動中的名牌：停止並聚焦那座島（以使用者的方式在當下位置按下）；旋轉中點地圖上的基礎程式島中心：停止並聚焦基礎程式島。
5. 分頁隱藏、返回全景（同時回到預設方位與仰角）、切換清單模式（切回 3D 是關閉且在預設視角）都會停止。
6. 飛行途中開啟會等降落才轉（到達預設方位需 > 300 ms），降落後仰角與 zoom 正確並開始轉；旋轉中從清單聚焦，由飛行接手並停住。
7. 旋轉中 WebGL context 遺失：改為清單導航，按鈕消失。
8. 旋轉 1.5 秒持續重畫（> 15 幀）且陰影 pass 為 0；停止後 2 秒重畫 0。
9. 自動旋轉與返回全景並排在地圖內、不重疊；桌機、360、390 px 沒有水平溢出。

## 5. 效能（與 `f719f42` 比較）

方法同 D.3-0（`perf/world.perf.ts`，`PERF_ROUNDS=3`，路由 `/islands/hex/scale/37,/islands/candidate`）。兩份隔離副本各自啟動，**在所有 E2E 結束後單獨執行**，交錯 base → new → base → new，每個版本合計 6 輪取中位數。headless Chromium＋SwiftShader，**不是真機數字**（P1-20）；本輪機器負載平穩，各輪差異很小。

| 頁面／裝置 | 指標 | `f719f42` | D.3-5b | 差異 |
|---|---|---|---|---|
| 實驗室頁 桌機 | 全景／聚焦 draw call（主畫面／陰影） | 43／26（0／0） | 43／26（0／0） | 相同 |
| | 全景／聚焦三角形 | 28,569／38,339 | 28,569／38,339 | 相同 |
| | 首幀 | 1,403 ms | 1,386 ms | −1.2% |
| | 鏡頭飛行 FPS | 51.15 | 50.7 | −0.9% |
| 實驗室頁 手機模擬 | draw call／三角形 | 同上 | 同上 | 相同 |
| | 首幀 | 1,402.5 ms | 1,394.5 ms | −0.6% |
| | 鏡頭飛行 FPS | 59.65 | 59.45 | −0.3% |
| 候選頁 桌機 | draw call／三角形 | 43／26；28,569／38,339 | 相同 | 相同 |
| | 首幀 | 1,395.5 ms | 1,395 ms | 0% |
| | 鏡頭飛行 FPS | 50.9 | 51.2 | +0.6% |
| 候選頁 手機模擬 | draw call／三角形 | 同上 | 同上 | 相同 |
| | 首幀 | 1,419.5 ms | 1,394.5 ms | −1.8% |
| | 鏡頭飛行 FPS | 59.6 | 59.6 | 0% |

Auto Orbit（只有 D.3-5b 有；5 秒環繞，6 輪中位數）：

| 指標 | 桌機 | 手機模擬 |
|---|---|---|
| 環繞 FPS | 55.3（54.1～55.5） | 59.8（58.6～60） |
| 相對同版本鏡頭飛行 FPS | **109%**（50.7） | **100.6%**（59.45） |
| 幀間隔中位數／p95 | 16.7／33.3 ms | 16.7／16.8 ms |
| 每幀 draw call（主畫面／陰影） | 43／0 | 43／0 |
| 停止後 2 秒的重畫 | 0 | 0 |

- 門檻「環繞 FPS ≥ 同環境鏡頭飛行的 90%」：兩種裝置都達到。環繞的全景每幀成本固定，飛行則會經過三角形較多的聚焦畫面，所以環繞略高。
- 環繞不增加 draw call，也不重畫陰影貼圖；停止後閒置重畫恢復 0（E2E 也檢查）。

## 6. 已知限制與未解決問題

1. **真機未量**：環繞期間持續重畫，負載與鏡頭飛行同級，另有名牌每幀的 DOM 位置更新；數字只有 SwiftShader。D.3-4B（候選頁整合後）需要加入環繞量測（規劃中的 P-10）。
2. **iOS Safari 未驗證**：觸控停止條件只在 Chromium 模擬通過（同 D.3-5a）。
3. **P1-28（既有）**：鏡頭飛行在閒置後的第一幀會跳一大段，所有使用 drei `CameraControls` 的頁面都一樣；本輪不改。
4. 名牌掛向每 15° 更新一次，旋轉途中可能短暫偏向島內，點擊判斷不受影響。
5. 旋轉速度依每幀的時間差計算；若一幀超過 50 ms（低於 20 FPS），實際速度會低於 6°／秒（刻意如此，避免跳動）。
6. 點地圖上的空白海面也會停止旋轉（任何按下都算手動操作）。
7. 旋轉不記憶：重新載入、切回 3D、返回全景後都是關閉。
8. 飛行途中開啟時，要等飛行降落（約 1～2 秒）才開始轉。
9. 候選頁沒有自動旋轉；推進屬 D.3-5c，需另行批准。
