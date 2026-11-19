# P9 S1 證據

報告：[`P9_S1_ENGINE_GENERALIZATION.md`](../../P9_S1_ENGINE_GENERALIZATION.md)。2026-11-19，head `b1a9010`（`p9/s1-3-island-registry`），基線 `main` `070f440`。
全部來自本機的隔離建置（headless Chromium、SwiftShader）。沒有 Preview、沒有真機、沒有 FPS。

| 檔案 | 內容 |
|---|---|
| `data/e2e-summary.txt` | 兩個全套 E2E 的總計 |
| `data/e2e-world.txt`、`data/e2e-default.txt` | 每一項測試的結果（`✓` 通過、`-` 略過），已去掉耗時 |
| `data/cmp-default.jsonl` | Default 建置，`main` 對 head：16 頁 × 桌機與手機。`pixels` 是不同的像素數 |
| `data/cmp-world.jsonl` | World-only 建置，`main` 對 head：13 頁 × 桌機與手機 |
| `data/cmp-routes.jsonl` | 重跑有差異的頁面：按鈕只比文字，另列 `data-route` 屬性（`routesA` 是 `main`，`routesB` 是 head） |
| `data/lessons.jsonl` | 兩個 head 建置的 80 堂課程連結與四個課綱錨點 |
| `data/bundle.jsonl` | 每頁引用的 script 大小，`main` 與 head |
| `data/leak-scan.txt` | 私有題庫洩漏掃描的四個範圍 |

`cmp-default.jsonl` 裡 `/?island=foundations` 的兩列 `buttons: false`，是因為那一次把看不見的 `data-route` 屬性也算進按鈕的比對；`cmp-routes.jsonl` 只比文字時兩列都是 `true`，像素都是 0。

## 重現

`tools/` 是這次用的腳本，在暫存目錄執行，不寫入 repository：

```sh
export S1_WORKTREE=/path/to/checkout          # 要測的 checkout
./mk.sh hd <ref>; ./mk.sh hw <ref>            # 乾淨副本；需要旁邊有一份 base/node_modules 可以 clone
./build.sh hd default; ./build.sh hw world    # 先清掉所有 LOGIC_ISLAND_* 變數；world 只設世界旗標
./e2e.sh hw world 3142; ./e2e.sh hd default 3141
./serve.sh hd default 3145 &                  # 長駐的伺服器，供比對使用（以 port 結束它）
node cmp.mjs <copy> <main-url> <head-url> out.jsonl <path>...
node lessons.mjs <copy> <url>
```
