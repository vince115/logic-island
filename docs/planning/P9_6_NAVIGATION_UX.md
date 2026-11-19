# P9.6：導航體驗改善（Fly-to 延遲、島嶼面板時機、手機區域選擇）

> 2026-11-19，分支 `p9/6-navigation-ux`（從 `main@b234a9f`，即 PR #27 合併後開始），worktree `../logic-island-p9-ds`。P9 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置生效；沒有修改 Vercel 環境變數或旗標。本階段不做 Single Canvas、不重新建模、不改地圖座標與相機方位。

## 1. Phase A：P9.5 合併與部署驗證

| 項目 | 結果 |
|---|---|
| PR #27 | CI `gates` 通過、Vercel Preview 成功、CLEAN；diff 只有 P9.5 的 7 個檔案（沒有旗標、設定、資產或 Exam Engine 變更）；以 merge commit 合併為 `b234a9f` |
| `main` CI | `gates` 通過、Vercel Production 成功 |
| 正式站（旗標關閉） | `/` 仍是原首頁；`/cs`、`/ai`、`/design`、`/web`、`/sys`、`/p9`、`/p9/cs`、`/world`、`/trials` 為 404；`/curriculum`、`/learn`（互動實驗島）、`/learn/linux-terminal`、`/islands`、`/regions/sys` 為 200；80 堂已發布課程全部 200 |

## 2. 改了什麼

### Phase B：Fly-to 時間與預載

- 飛行 950 → **700 ms**（`src/lib/p9/world-fly.ts` 的 `FLY_MS`，在 600–750 ms 範圍內）。
- 預載提前：游標移到區域陸地或標籤上、標籤取得焦點、手指按下時，就預先載入該區域路由（`router.prefetch`），並預先下載區域頁延遲載入的 3D 場景程式（共用的 hex 場景與 P9 地景）；飛行開始時一定會做一次。只在即將進入區域時才下載，不在首頁一開就載入。
- 飛行中按 **Escape** 取消（與滾輪、拖曳相同），留在當下視角，不進入區域。

### Phase C：島嶼面板配合相機抵達

- 區域頁點選島嶼後，島嶼的科目面板（手機為底部面板）先保持隱藏，**相機走完約 92% 的路程**才淡入；GLB 島嶼的目標面板同樣處理。
- 相機的「抵達」由 `HexCamera` 的 `onArrive` 回報：每幀比較相機與目標的中心、縮放、角度與偏移，每一項剩下不到起始差距的 8% 即算抵達（camera-controls 的 `rest` 事件要等平滑完全收尾，比畫面看起來抵達晚約 1.5 秒，所以不用它當主要訊號）；新的聚焦會讓舊的回報失效。若一直沒有回報，2.5 秒後仍會顯示。
- 面板等待時仍在版面上（`visibility: hidden`），手機底部面板的高度一開始就算進相機的取景，所以相機一次就停在面板上方，不會在面板出現後再移動。
- Reduced Motion：面板與島嶼同時出現，不等待。
- 這是 `HexSceneOptions.panelsOnArrival`，只有 P9 區域頁開啟；`/islands`、`/world` 等既有地圖行為不變。

### Phase D：手機高倍率時選擇五大區域

- 手機（窄版）的 World 一旦縮放或平移，地圖上方出現五個區域按鈕（每個至少 44 px，可在列內左右滑動），點一下就從當下視角飛到該區域並進入；回到靜止視角（1×）時按鈕列隱藏，由地圖標籤負責。
- 修正一個 P9.4 起就存在的問題：放大後被隱藏的標籤仍佔版面，使手機頁面寬度從 390 px 變成 562 px；現在地圖舞台會裁切（`overflow: clip`），頁面寬度維持 390 px。

## 3. Commit

| 階段 | Commit |
|---|---|
| A | `b234a9f`（PR #27 合併） |
| B：Fly-to 700 ms、預載、Escape 取消 | `84dcf36` |
| C：島嶼面板配合相機抵達 | `b137dbf` |
| D：手機區域按鈕、舞台裁切 | `37d2aec` |
| E：回歸測試與本文件 | 本文件所在 commit |

## 4. 驗收

**互動（Flag ON production build、headless Chromium；桌機 1440 × 1000、手機 iPhone 13 模擬 390 px 與 360 px）**

| 情境 | 結果 |
|---|---|
| World → CS／AI／Design／Web／SYS | 五區都飛行後進入；飛行實測約 700 ms（E2E 限 560–900 ms） |
| 預載與重複導航 | 同一路由只預載一次；飛行或導航中再點同區、他區或連點，都只進入第一個區域 |
| 飛行中 Escape／拖曳／滾輪 | 取消，停在當下視角，不進入；之後再點區域正常飛行 |
| Back／Forward | Back 回 World 為 `idle`、1×，再點其他區域正常飛行；區域頁 Back／Forward 在島嶼與區域間逐步移動 |
| Reduced Motion | World → Region 立即進入（桌機與手機區域按鈕都是）；島嶼面板與島嶼同時出現 |
| 島嶼面板 | 相機移動中為隱藏（`data-arrival="waiting"`），走完約 92% 才顯示；實測 1.47 s 顯示時相機已走 92%（P9.5 為點擊後 88 ms、相機 0%） |
| 快速切換島嶼 | 第一座島的面板一幀都沒有顯示，最後顯示的是第二座島 |
| 返回區域全景 | 面板關閉；Forward 回島嶼時再次等待相機 |
| 面板永遠不出現的風險 | 每幀判斷用「剩下起始差距的 8%」與最小容許值，不需要精確終點；另有 2.5 s 上限 |
| 手機區域按鈕 | 1× 時不出現；放大到 3.8×、標籤全部隱藏時出現 5 個按鈕，每個高 44 px；點 SYS 飛行並進入 `/sys`，Back 回 1× 後按鈕消失 |
| 360 px 手機 | 按鈕列在舞台內、可在列內橫向捲動到 SYS 並進入；在縮放按鈕上方，不重疊；放大、縮小、重設視角都在畫面內 |
| 水平溢出 | 390 px 與 360 px 放大後 `innerWidth` = `scrollWidth`（修正前 390 px 會變 562 px）；舞台裁切只影響地圖上的標籤，導覽清單、區域頁面板不在此元素內 |

截圖（`docs/planning/evidence/p9-6/`）：桌機飛行 350 ms、點島後 500 ms 面板仍等待、抵達後面板；手機 390 px 與 360 px 放大後的區域按鈕、手機島嶼抵達後的底部面板。

**測試**

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint（全 repo） | 0／0 |
| Vitest | 89 個檔案，2044 通過／9 略過（含 JDK） |
| Flag ON production build | 通過 |
| Flag ON P9 E2E（桌機＋手機） | 43 通過／15 略過；新增的 P9.6 測試另以 `--repeat-each` 跑 3 輪（12 項 × 3）與 2 輪（16 項 × 2）全部通過 |
| Flag OFF production build | 通過 |
| Flag OFF：P9、Navigation、首頁資料庫、`/islands`、Islands Acceptance、Player、Curriculum、Hex Camera／World／Scale／Environment、Island Interactions E2E | 311 通過／81 略過／0 失敗 |
| 洩漏掃描 | `b234a9f..37d2aec`：clean |

新增 E2E：Escape 與拖曳取消、Back 後再飛、飛行長度、手機放大後區域按鈕（390 px）、窄手機（360 px）、Reduced Motion 手機區域按鈕、島嶼面板等待與 Back／Forward、快速切換島嶼、Reduced Motion 面板。

**效能（production build、headless Chromium、本機 `next start`、桌機 1440 × 1000，各 5 次中位數；P9.5 = `main@b234a9f`）**

| 項目 | P9.5 | P9.6 |
|---|---|---|
| 點擊 → 網址變更（CS／SYS） | 1055／1048 ms | 806／809 ms |
| 點擊 → 區域場景就緒（CS／SYS） | 1805／1765 ms | 1572／1534 ms |
| 網址 → 場景就緒（本機） | 763／718 ms | 766／728 ms |
| 慢速網路（150 ms RTT、1.6 Mbit/s，CS，3 次中位數）：點擊 → 場景就緒 | 2030 ms | 1524 ms |
| 慢速網路：網址 → 場景就緒 | 1016 ms | 756 ms |
| 飛行中最長單幀 | 92 ms（CS，換頁那一幀） | 92 ms |
| World 腳本（解壓後） | 1808 KB | 1811 KB |
| 島嶼面板出現 | 點擊後 88 ms（相機 0%） | 1474 ms（相機 92%） |

本機網路沒有延遲，預載看不出差別（網址 → 場景約 750 ms，主要是區域場景的建立）；在慢速網路上預載省下約 260 ms。World 的 draw call、三角形與每幀成本沒有改動。

## 5. 真機測試可行性

這台機器目前無法做真機或接近真機的測試：

- 沒有連接 iPhone／Android 裝置；
- 沒有 iOS Simulator（`xcrun simctl` 不存在，未安裝 Xcode）；
- Playwright 只裝了 Chromium，沒有 WebKit（安裝需要下載，未經授權不下載）。

所以本階段的手機結果都是 Chromium 的 iPhone 13 模擬（觸控以 Pointer Events 模擬），**iOS Safari 與 Android Chrome 真機尚未驗證**。可行的下一步（需使用者決定）：在同一個區域網路以手機開啟 Flag ON 的開發伺服器（`next dev -H 0.0.0.0`）；或安裝 Xcode 用 iOS Simulator 的 Safari；或授權下載 Playwright WebKit 做 WebKit 引擎的自動化檢查。

## 6. 尚未完成

1. 真機（iOS Safari、Android Chrome）未驗證，見上節。
2. 仍是 Route Transition：飛行在 World 頁內，結束後換頁，區域頁從靜止視角開始（Single Canvas 的評估在 P9.7）。
3. 網址 → 區域場景就緒約 750 ms 沒有縮短：時間主要花在區域場景的建立，不是下載。
4. 島嶼面板在相機約 1.5 s 後才出現，比 P9.5 晚；這是本階段要求的行為，若覺得太慢可調 `hex-camera.tsx` 的 `ARRIVED`（目前 0.08）。
5. 手機區域按鈕只在窄版出現；桌機縮放後仍以右側導覽清單（直接連結，不飛行）作為不依賴標籤的入口。
