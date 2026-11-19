# P8.5：Visual Finalization & Performance Hotfix——導覽打包修正、視覺決策落地與 `/islands` E2E 根因

> 2026-11-16，Asia/Taipei。三條工作線，兩個分支：
> - **A（Hotfix）**：分支 `hotfix/nav-client-bundle`，worktree `../logic-island-hotfix-nav`，PR [vince115/logic-island#8](https://github.com/vince115/logic-island/pull/8)。
> - **B、C（P8）**：分支 `p8/multi-region-world`，worktree `../logic-island-p8`，起點 `891d85c`（已核對與 `origin` 一致）。
> 上層文件：[P8.4 Responsive World UX & Visual Review](P8_4_RESPONSIVE_WORLD_UX_AND_VISUAL_REVIEW.md)。
> 沒有 merge `main`、沒有 force push、沒有部署、沒有修改 GLB、沒有切換正式首頁。量測在 headless Chromium（Metal）進行；手機與平板是視窗尺寸模擬，不是真機。

## 0. 結論

1. **Hotfix PR #8 已開，CI 3／3 通過，可合併**（等你合併）。只有 4 個檔案；課綱與側欄與 `main` 逐頁相同；有側欄的頁面腳本由約 2.2 MB 降到約 0.64–0.82 MB。
2. **五項視覺決策都已落地**（§2）：WEB—SYS 橋已從世界總覽移除；AI 保留 6.6 格留白；1240 px 以下用圖釘；樞紐橋調暗調窄；手機 44 px 觸控目標保留並在 320／375／390 px 驗證。
3. **`/islands` E2E 的根因已找到並修正**（§3）：兩個問題疊在一起，一個在產品（舊版 `/islands` 相機聚焦後沒有要求重繪），一個在測試（「等標籤停止移動」實際上沒有等）。
4. **全套 E2E 第一次全部通過**：489 通過／95 略過／0 失敗（P8.4：481／92／1；P8.3：466／90／10）。
5. **既有畫面沒有變**：`/`、`/islands`、`/islands/legacy`、`/islands/candidate` 與五張區域地圖，在桌機與手機都是 0 個差異像素（§4）。

## 1. Workstream A——導覽打包效能修正

| 項目 | 結果 |
|---|---|
| 來源 | `4961b9e`（P8 分支）以 cherry-pick 移植，無衝突；與 `main` 的差異只有 4 個檔案：`src/lib/nav/nav-model.ts`（新增）、`src/lib/nav/site-nav.ts`、`src/components/nav/site-sidebar.tsx`、`tests/site-nav.test.ts` |
| 不含 | P8 的 3D 世界、Layout、旗標、E2E 期望更新，都沒有帶入 |
| 基線 | 分支切出後 PR #6 合併，`origin/main` 由 `1f93cc8` 變為 `3605922`。分支已 push，不能 force push，所以把最新的 `main` 合進分支（無衝突），並對合併後的結果重新驗證 |
| 課綱與側欄一致 | `/curriculum`、`/curriculum/programs-and-algorithms`、`/learn`、`/learn/bfs`、`/learn/linux-terminal`、`/regions/ai`、`/regions/sys`，桌機 1440×1000 與手機（iPhone 13 模擬）：可見文字、所有連結、導覽區塊、整頁截圖，與 `main` 的 build 全部相同（14 組） |
| Typecheck／ESLint | exit 0／exit 0 |
| Vitest | 73 個檔案，1910 通過／9 略過／0 失敗 |
| Production build | 成功 |
| E2E（`navigation`、`db-activities-f1c`、`player`，桌機＋手機） | 58 通過／2 略過／0 失敗；`db-activities-f1c.spec.ts:140` 由失敗變為通過 |
| 洩漏掃描（追蹤檔案、`origin/main..HEAD`、`.next`） | 皆 clean |
| Remote CI | 3 項檢查全部通過；`mergeStateStatus: CLEAN` |

每頁 HTML 引用的腳本總量（預設 production build，未壓縮／gzip）：

| 頁面 | `main`（`3605922`） | Hotfix |
|---|---|---|
| `/curriculum` | 2,228 KB／573 KB | 640 KB／201 KB |
| `/curriculum/programs-and-algorithms` | 2,276 KB／588 KB | 723 KB／229 KB |
| `/learn` | 2,222 KB／571 KB | 634 KB／199 KB |
| `/learn/bfs`、`/learn/linux-terminal` | 2,396 KB／630 KB | 821 KB／262 KB |
| `/regions/ai`、`/regions/sys` | 2,222 KB／571 KB | 634 KB／199 KB |
| `/`（沒有側欄） | 671 KB／213 KB | 671 KB／213 KB |

`.next/static/chunks` 全部 JS：4,100 KB → 2,552 KB。

`e2e/curriculum.spec.ts` 的 3 個測試在 `main` 上本來就失敗（期望過時），不在這個 PR 裡；P8 分支的 `347e43c` 已更新它們。

## 2. Workstream B——視覺決策

| 決策 | 實作 | 驗證 |
|---|---|---|
| **V1** 移除 WEB—SYS 實體關聯橋 | `WORLD_MAP.bridges` 刪掉 `web-sys` 一筆。環序、五個 Region 的座標、五座樞紐橋都沒有動。課程之間的關聯是由課程資料算出來的，沒有受影響 | 單元測試：橋的清單是 `cs-ai`、`design-web`、`sys-cs`；WEB 與 SYS 在環上仍相鄰。E2E：總覽畫出的橋沒有 `web-sys`，`hub-web`、`hub-sys` 都在；導覽文字不再列出這一對；`/world/web` 與 `/world/sys` 互相沒有直達連結，只有「世界總覽」 |
| **V2** 保留 AI 6.6 格留白 | 沒有改動 | E2E：1440 px 每座 AI 島 ≥ 180 px；1280 px 名牌不在清單下。AI 六瓣的格位與橋的固定快照沒有變 |
| **V3** 1240 px 以下用圖釘 | 沒有改動 | 既有測試（834／1024 是圖釘、1280／1440 是名牌）加上新的切換測試：1440 → 1024 → 點圖釘聚焦 → 1440（仍聚焦同一座島、網址不變）→ 390 → 1024（清單選另一座島）→ Esc 回全景 → 收起清單 → 1440（清單仍收起）→ 展開。每一步的聚焦狀態、網址與清單狀態都保持 |
| **V4** 降低樞紐橋視覺重量 | 顏色 `#f1f4f7` → `#d3e3ea`（較暗、較不飽和）；寬度桌機 0.55 → 0.46、手機 0.36 → 0.31。端點與拓樸沒有變，仍是五座，仍比關聯橋寬 | E2E 從畫面取像素量對比：每座樞紐橋對旁邊海面 1.28:1（下限 1.25:1），關聯橋 1.34–1.68:1，都高於樞紐橋 |
| **V5** 保留手機 44 px 觸控目標 | 沒有改動 | 標頭測試由 320 px 擴大到 320、375、390 px 三種寬度；`/curriculum` 的標頭仍未被改到 |

V4 的前後對照：

| | 之前 | 之後 |
|---|---|---|
| 桌機 1440 | [evidence/p8-4/overview-1440-without-web-sys.jpg](evidence/p8-4/overview-1440-without-web-sys.jpg)（已無 WEB—SYS 橋，樞紐橋是原本的亮色） | [evidence/p8-5/overview-1440.jpg](evidence/p8-5/overview-1440.jpg) |
| 手機 375 | [evidence/p8-4/overview-375-without-web-sys.jpg](evidence/p8-4/overview-375-without-web-sys.jpg) | [evidence/p8-5/overview-375.jpg](evidence/p8-5/overview-375.jpg) |

V1 的前後對照：[evidence/p8-4/overview-1440.jpg](evidence/p8-4/overview-1440.jpg)（有橋）對 [evidence/p8-5/overview-1440.jpg](evidence/p8-5/overview-1440.jpg)。七種寬度的新截圖都在 [evidence/p8-5/](evidence/p8-5/)。

樞紐橋的對比 1.28:1 離我設的下限 1.25:1 很近。它是刻意壓低的，但如果你覺得太淡，把顏色調亮一階即可（`LINK_THEME.hub`），不影響其他東西。

世界總覽的效能：15 個 draw call；三角形 15,902（桌機構圖）、15,866（手機構圖），比 P8.4 少了一座橋的量。區域地圖不變。

## 3. Workstream C——`/islands` E2E 不穩定的根因

### 3.1 收集到的證據

| 你要求的項目 | 取得方式與結果 |
|---|---|
| Playwright trace | 以 `--trace retain-on-failure` 重現了一次（依全套順序的桌機前段 14 檔），但那一次沒有失敗，所以沒有留下失敗的 trace |
| Screenshot | 先前三次失敗的截圖都顯示島已聚焦、標籤在聚焦位置——因為截圖是在失敗之後才拍，當時畫面已經更新，所以截圖本身看不出問題 |
| Console errors | 沒有（測試本身就會在 console 有錯誤時失敗） |
| Camera position／target | 頁面沒有公開 R3F 的狀態，無法直接讀。改用「地點標籤在畫面上的位置」當作鏡頭狀態的替代：標籤由場景每一幀依鏡頭投影定位 |
| Animation state | 用 `perf/instrument.mjs` 記錄頁面已畫出的幀數，可以知道某個時刻之後有沒有新的一幀 |
| Pointer hit target | 點擊座標下的元素每次都是 `canvas`；點擊的落點由標籤位置加上固定位移算出 |
| DOM／Canvas state | 每次點擊前後的標籤位置、已畫幀數、已選取的島、說明框 |

完整數據在 [evidence/p8-5/islands-focus-timeline.md](evidence/p8-5/islands-focus-timeline.md)。

### 3.2 成功與失敗的差別

從選取基礎程式島的那一刻起，逐幀記錄「燈塔」標籤的位置（全景時在 `[338, 626]`，聚焦後應在 `[647, 644]`）：

| 條件 | 12 次中到達聚焦位置 | 觀察 |
|---|---:|---|
| 修正前，正常速度 | 12 | 標籤先出現在**全景位置**，1–2 幀（最多 24 ms）後才到位 |
| 修正前，CPU 節流 6 倍 | **6** | 另外 6 次標籤一直停在全景位置，1.5 秒內**沒有畫出任何新的一幀** |
| 修正後，正常速度 | 12 | 仍有 1–2 幀的空窗（最多 23 ms） |
| 修正後，CPU 節流 6 倍 | 12 | |
| 修正後，`/islands/legacy`，節流 6 倍 | 12 | |

另外，修正前的測試在「等標籤停止移動」這一步，記錄到的 8 次點擊**全部在第 1 次輪詢、0 ms 就判定已停止**。

### 3.3 根因

兩個問題，任一個都會讓點擊落在錯的地方：

1. **產品**（`src/components/islands/camera-controller.tsx`，`/islands` 與 `/islands/legacy`）：聚焦時相機下達取景指令，但沒有要求重繪。場景是「有需要才畫」（`frameloop="demand"`）；選島造成的那一幀如果比這個指令早，之後就沒有東西再要求下一幀，地圖停在全景，而聚焦島的地點標籤卻已經顯示（在全景的位置）。機器忙的時候比較容易發生，所以只在連續執行多個 3D 測試檔時出現。這與 P8.3 在 `hex-camera.tsx` 修掉的是同一種問題。
2. **測試**（`e2e/islands.spec.ts` 的 `clickNear`）：它拿「剛讀到的位置」和「幾毫秒前讀到的位置」比較，永遠相同，所以沒有等待；而標籤出現後要 1–2 幀才到位。

P8.4 只補了第 1 項就重跑，仍然失敗，因為第 2 項還在；所以當時撤回了。這次兩項都有獨立的證據。

### 3.4 修正

| 修正 | 內容 | 沒有做的事 |
|---|---|---|
| 產品 | 取景後呼叫 `invalidate()`（一行，加註解） | 沒有改取景的計算、動畫或其他相機行為；`/islands`、`/islands/legacy` 逐像素不變 |
| 測試 | `clickNear` 改為連續兩次、各相隔 100 ms 的讀取都與前一次相同才算停止 | 沒有降低斷言、沒有 skip；這是把原本就想做的「等標籤停止移動」變成真的條件，不是固定等待 |

驗證：修正後的時間軸量測（上表）；`islands.spec.ts` 在最終 build 上 44／44；全套 E2E 489 通過／0 失敗（之前三次全套執行各有 1–2 項失敗）。

### 3.5 仍然存在、沒有處理的現象

標籤出現後有 1–2 幀在全景位置，然後才跳到聚焦位置（正常速度下最多約 24 ms）。這是舊版 `/islands` 場景的既有行為，肉眼幾乎看不到；要消除需要改標籤出現的時機，不在這次的最小修復範圍。

## 4. P8 分支驗收

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint | exit 0／exit 0（0 個問題） |
| Vitest | 73 個檔案，1947 通過／9 略過／0 失敗 |
| Flagged build／Default build | 皆成功 |
| Regional World＋World Topology（含 Mobile Responsive）＋`islands.spec.ts`，旗標開啟，桌機＋手機 | 101 通過／16 略過／1 失敗；失敗的是當時剛寫好的 V3 測試（見表後說明），修正後在全套執行中通過 |
| **全套 E2E**（旗標開啟，桌機＋手機，27 分鐘） | **489 通過／95 略過／0 失敗** |
| Default build E2E：Navigation、Player、Regional World、World Topology、Curriculum、`db-activities-f1c`、`hex-camera`、`home-databases`、`islands-candidate`、`islands` | 254 通過／88 略過／0 失敗 |
| 洩漏掃描：追蹤檔案、旗標開啟的 `.next`、分支歷史 | 皆 clean |

Visual regression（逐像素，隱藏 HTML 覆蓋層）：

| 比對 | 頁面 | 桌機 1440×1000 | 手機（iPhone 13 模擬） |
|---|---|---|---|
| P8.2 之前的 build（`f5a09cd`）對本階段 | `/`、`/islands`、`/islands/legacy`、`/islands/candidate` | 各 0 個差異像素 | 各 0 個差異像素 |
| P8.4（`891d85c`）對本階段 | `/world/cs`、`/world/ai`、`/world/design`、`/world/web`、`/world/sys` | 各 0 個差異像素 | 各 0 個差異像素 |
| 同上 | `/world` | 刻意改變（V1、V4） | 刻意改變 |

七種寬度（320／375／390／834／1024／1280／1440）的遮擋檢查：世界總覽與五張區域地圖全部通過。自動旋轉（CS、AI、SYS，1440 與 390）：60 fps，沒有超過 33 ms 的幀。

V3 的切換測試剛寫好時會在視窗改變後、相機重新取景完成前就檢查；已改為先等待「沒有標籤在清單下」這個狀態。改完後的第一輪 3 次中仍失敗 1 次，那一次我沒有留下失敗訊息；之後單獨重複 51 次（6＋15＋30）與全套執行都通過，沒有再出現。所以它目前是 55 次中 1 次、原因未知的失敗，列為待觀察。

## 5. 正式五區域世界發布的準備程度

| 面向 | 狀態 |
|---|---|
| 五個 Region 的資料與 2D 頁面 | **已在 `main`**（PR #6 於 2026-11-16 合併，SYS 區域與 Linux Terminal 已上線） |
| P8 分支與 `main` 的關係 | P8 已包含 P6 的全部 commit；先前「P8 的 PR 必須排在 PR #6 之後」的條件已滿足。開 PR 前需要把最新的 `main` 合進 P8 並重跑驗收（`main` 之後還有 PR #8 與文件 PR #7） |
| 世界總覽與導覽 | 拓樸、橋、標籤、七種寬度、鍵盤、手機驗收都有測試並通過；仍在旗標之後 |
| E2E 穩定性 | 全套 0 失敗；本階段之前長期存在的 10 項都已處理 |
| 效能 | 總覽 15 個 draw call；區域地圖 26–58；headless 桌機 60 fps。**沒有真機數據**，也沒有首幀時間與記憶體的正式量測 |
| 尚未做（發布前需要決定或完成） | 1. 真機驗收（iOS Safari、Android Chrome）。2. 首頁 `/` 何時由五島場景切換為世界總覽（D1，尚未批准）。3. 旗標在 production 開啟的方式與回退方案。4. 區域地圖的美術：AI／DESIGN／WEB／SYS 目前是共用的規劃中地形與標記，沒有各自的 GLB。5. 總覽 → 區域的轉場、區域地圖上的「世界橋頭」。6. P8.2 的 R1–R6 與 P8.3 的 R7、R9、R10 仍待審 |

我的判斷：**程式與測試面可以進入「開 PR 到 `main`、但旗標維持關閉」的階段**；要對使用者正式開放五區域 3D 世界，還缺真機驗收、首頁切換的決定與區域美術。

## 6. Commit

| 分支 | Commit | 內容 |
|---|---|---|
| `hotfix/nav-client-bundle` | `c2b39c6` | 導覽打包修正（cherry-pick 自 `4961b9e`） |
| | `1de2e33` | 合入最新的 `main`（PR #6） |
| `p8/multi-region-world` | `1eec617` | `/islands` 相機重繪與測試等待條件 |
| | `7776447` | V1–V5 |
| | 本文件與證據的 commit | |
