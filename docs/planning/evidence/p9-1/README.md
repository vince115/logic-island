# P9.1 視覺原型的證據

> 2026-11-19。對象：分支 `p9/1-visual-prototype`，程式 commit `0423877`。報告：[P9_1_VISUAL_PROTOTYPE.md](../../P9_1_VISUAL_PROTOTYPE.md)。
> 全部來自本機隔離建置與 headless Chromium（SwiftShader）。不是 Preview，不是真機。

| 資料夾 | 內容 |
|---|---|
| `sheets/` | 九張並排圖：World、CS Region、Basics Island × 1440、834、375 px。左邊是 P8（`/world…`），右邊是 P9.1（`/p9…`），同一個建置、同一個伺服器 |
| `data/render.jsonl` | 每頁最後一幀的 draw call 與三角形（主畫面與陰影） |
| `data/bundle.jsonl` | 每頁 HTML 引用的 script 總量；含這個分支與 `main` 的正式組合建置 |
| `data/same-as-main.jsonl` | 既有頁面在這個分支與 `main` 的像素比較 |
| `tools/` | 取證腳本：`shot.mjs`（截圖）、`measure.mjs`（繪製量）、`compose.mjs`（並排圖）、`same.mjs`（像素比較） |

腳本是在 repository 之外的隔離資料夾執行的：它們從執行位置底下的 `app/` 或 `proto/` 子資料夾載入 Playwright（一份含 `node_modules` 的建置副本），對已經在執行的伺服器取證，不建置、不寫入 repository。腳本量用的是 A1-L 的 [`bundle.mjs`](../p8-a1l/tools/bundle.mjs)。

建置方式：

- 正式組合：清除所有 `LOGIC_ISLAND_*` 變數，只設 `LOGIC_ISLAND_REGIONAL_WORLD=1`。
- 原型建置：`LOGIC_ISLAND_REGIONAL_WORLD=1` 與 `LOGIC_ISLAND_P9_PROTOTYPE=1`。
- `main` 的對照：tree 與 `b56e7ec` 相同的正式組合建置（`070f440` 之後只多了文件）。
