# P8 Activation A1-L 證據索引

> 2026-11-18，Asia/Taipei。對象：`main` `961db2f` 的兩份隔離建置。報告：[P8_A1L_LOCAL_PREACCEPTANCE.md](../../P8_A1L_LOCAL_PREACCEPTANCE.md)。
> 全部是本機 headless Chromium 的結果，**不是 Vercel Preview，也不是真機**。

每張截圖底部都印有：階段、建置（`world-only`）、commit、路徑、viewport。

## 截圖

| 檔案 | 內容 |
|---|---|
| `sheets/sheet-overview.jpg` | `/world` 在 320／375／390／834／1024／1280／1440 px（七張並排） |
| `sheets/sheet-region-{cs,ai,design,web,sys}.jpg` | 五個區域地圖各自的七種寬度 |
| `shots/overview-{375,834,1440}.jpg` | 世界總覽原尺寸 |
| `shots/region-{cs,ai,design,web,sys}-1440.jpg` | 五個區域地圖，桌機原尺寸 |
| `shots/region-{cs,ai,sys}-375.jpg` | 手機圖釘版面原尺寸 |
| `shots/focus-cs-databases-375.jpg` | 手機聚焦資料庫應用島，科目面板（Bottom Sheet）開啟 |
| `shots/focus-cs-databases-375-sheet-closed.jpg` | 同上，關閉面板後 |
| `shots/focus-cs-databases-1440.jpg` | 桌機聚焦資料庫應用島 |

42 張原尺寸截圖（6 頁 × 7 寬度）只提交上表列出的 11 張，其餘由並排圖涵蓋。

## 數據

| 檔案 | 內容 |
|---|---|
| `data/builds.txt` | 兩份建置的環境、Typecheck 與 build 結果、`/world` 與 `/trials` 的路由表、Next.js 升級提示 |
| `data/phase2-{default,world}.jsonl` | 路由狀態碼、每頁的試煉連結／請求／字詞、主選單、`robots`、水平捲動 |
| `data/a1-pages.jsonl` | 6 頁 × 7 寬度：最後一幀的 draw call 與三角形、名牌／圖釘數、清單數、橋、檢查出的問題 |
| `data/a1-interactions.jsonl` | 清單選島、返回／前進、Escape、鍵盤、科目面板位置；29 座島逐一聚焦；連結檢查；CS 四島對首頁 |
| `data/islands.json` | 29 座島各自的面板、連結，以及 125 個站內連結的狀態碼（含錨點是否存在） |
| `data/same-*.jsonl` | 十個既有頁面 × 桌機／手機：文字、連結、導覽結構、整頁截圖雜湊是否相同（Default 對 Production、World-only 對 Production、Default 對 World-only） |
| `data/post-{default,world,production}.jsonl` | 80 堂課程連結、Linux Terminal（真實 Enter）、旗標路由 |
| `data/bundle-*.jsonl` | 每頁 HTML 引用的腳本量（未壓縮／gzip） |
| `data/static-chunks.txt` | 兩份建置 `.next/static` 每個檔案的 sha1 |
| `data/hooks.jsonl` | `/world?without=` 與 `/world/cs?stress=glb` 的實際作用 |
| `data/e2e-{world,default}.txt` | 全套 E2E 的總數與各 spec 的通過／略過數 |
| `data/leak-scan.txt` | 私有題庫洩漏掃描與已發布題目掃描的輸出 |

## 工具（`tools/`）

取證用的腳本，放在這裡是為了讓結果可以重做；不屬於產品，也不在任何 npm script 內。

| 檔案 | 用途 |
|---|---|
| `build.sh` | 清除所有旗標後建置：`default` 不設任何旗標，`world` 只設 `LOGIC_ISLAND_REGIONAL_WORLD=1` |
| `phase2.mjs` | 路由、試煉入口與請求；把所有文字回應存檔供掃描 |
| `pubscan.mjs` | 已發布題目（`src/content/trials/generated`）是否出現在指定資料夾 |
| `a1.mjs`、`sheets.mjs` | 七種寬度的量測、蓋印截圖與並排圖 |
| `hooks.mjs` | 審查用參數的作用 |
| `same.mjs`、`post.mjs`、`bundle.mjs`、`phase4.sh` | 既有功能回歸 |
| `e2e.sh` | 兩份建置各跑一次全套 E2E，保留失敗的 trace |

重做的方式：`git archive <commit> | tar -x` 到兩個資料夾、各自放入 `node_modules`、把 `tools/` 放在兩個資料夾的上一層，依序執行 `build.sh default`、`build.sh world`，以 `next start` 啟動（Default 3131、World-only 3132），再執行各腳本。私有題庫掃描另外需要 `LOGIC_ISLAND_PRIVATE_BANK` 指向私有題庫的 checkout。

## 沒有提交的資料

| 資料 | 位置 | 期限 | 取得方式 |
|---|---|---|---|
| 兩份隔離副本與 `.next` 建置 | 執行這次驗收的 Claude session 的 scratchpad，`a1l/default`、`a1l/world` | 暫存目錄約四天後被系統清理（P8.6 §3.4） | 依上面的方式重建；輸入只有 commit 與旗標 |
| 42 張原尺寸截圖 | 同上，`a1l/a1-world/shots/` | 同上 | `a1.mjs` |
| E2E 的完整輸出與失敗 trace | 同上，`a1l/e2e-*.log`、`a1l/e2e-*-results/` | 同上 | `e2e.sh`。這次兩輪都沒有失敗，所以沒有產生 trace |
| 下載的 HTTP 回應（供洩漏掃描） | 同上，`a1l/resp-*`、`a1l/post-*` | 同上 | `phase2.mjs`、`post.mjs` |

Trace 會記錄頁面內容，所以不放進 repository（Release Checklist §6）。
