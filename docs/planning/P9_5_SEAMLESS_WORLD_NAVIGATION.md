# P9.5：World → Region → Island 無縫探索

> 2026-11-19，分支 `p9/5-seamless-navigation`（從 `main@196d208` 開始），worktree `../logic-island-p9-ds`。P9 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置生效；沒有修改 Vercel 環境變數或旗標，也沒有合併舊的 P9.1c 實驗分支。

## 1. Phase A：P9.4 收尾

| 項目 | 結果 |
|---|---|
| PR #26 | CI `gates` 通過（9m4s）、Vercel Preview 成功、CLEAN；diff 只有 P9.4 的 16 個檔案；以 merge commit 合併為 `196d208` |
| `main` CI | `gates` 通過、Vercel Production 成功 |
| 舊 PR | #18、#24 已關閉（未合併），留言說明已被 #25 取代 |
| 正式站（旗標關閉） | `/` 仍是原首頁；`/cs`、`/sys`、`/p9`、`/world` 為 404；`/curriculum`、`/learn` 為 200 |

## 2. 做法：Route Transition，不是 Single Canvas

- **World → Region**：在 World 場景內把 P9.4 的正交視角（縮放 k、平移）從目前位置飛到「該區域填滿可用舞台」的視角，結束後 `router.push('/<region>')`。相機角度不變，只縮放與移動，所以不會穿過地形；縮放走對數尺度、焦點走直線、ease-in-out，950 ms（`src/lib/p9/world-fly.ts`）。
- **一個控制器**（`p9-world-scene.tsx` 的 `useFlyTo`）處理所有區域，狀態為 `idle → flying → navigating`，以及 `cancelled`：
  - 飛行或導航中再點擊（同區或其他區）都忽略，不會重複導航；
  - 飛行中滾輪或拖曳會取消，留在當下視角，不進入任何區域；
  - 畫面停住時（例如分頁在背景），安全計時器仍會進入區域；
  - `prefers-reduced-motion` 直接進入，不飛；
  - 開始飛行時預先載入目標路由；飛行中標籤淡出；
  - 返回時 World 重新以靜止視角開始（`idle`、1×），不會再自動飛。
- **中央樞紐**維持立即開啟互動實驗島，不飛。
- **Region → Island**：區域頁原本就以 camera-controls（0.65 s 平滑）移動到島嶼，同一個 Canvas、`?island=` 同步、上一頁／下一頁會飛回來；本階段把它寫成 E2E 契約，沒有重建場景。

## 3. Commit

| 階段 | Commit |
|---|---|
| A | `196d208`（PR #26 合併） |
| B：CS Fly-to | `cf9d522` |
| C：五區域共用控制器 | `636130f` |
| D：Region → Island 契約 | `c841413` |
| E：本文件 | 本文件所在 commit |

## 4. 驗收

**互動（瀏覽器與 E2E）**

| 情境 | 結果 |
|---|---|
| World → CS／AI／Design／Web／SYS | 每區 58 幀飛行，最終縮放 CS 2.4×、AI 2.6×、Design 4×、Web 3.3×、SYS 2.7×，接著進入該區域 |
| Back | 回到 World，`idle`、1× |
| 快速連點、飛行中點其他區域 | 只進入第一個區域 |
| 飛行中滾輪 | 取消，不進入 |
| Zoom／Pan 之後點區域 | 正常飛行並進入 |
| Reduced Motion | 直接進入（約 80 ms） |
| 手機：雙指縮放＋單指拖曳後點標籤 | 飛行並進入，無水平捲動 |
| World → CS → 資料結構島 | 區域相機的縮放在多個幀內逐步靠近；同一個 Canvas；網址 `?island=structures`；Back 逐步拉遠回區域、Forward 回島嶼 |

**測試**

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint（全 repo） | 0／0 |
| Vitest | 89 個檔案，2043 通過／9 略過 |
| Flag ON 建置＋P9 E2E（桌機＋手機） | 34 通過／12 略過（含 5 個區域的 Fly-to、連點、取消、Reduced Motion、手機、Region → Island） |
| Flag OFF 建置＋P9、Navigation、首頁資料庫、`/islands`、Player、Curriculum E2E | 196 通過／48 略過／0 失敗 |
| 洩漏掃描 | `origin/main..c841413` 與 P9 `.next`：clean |

Fly-to 的 E2E 在頁面內逐幀記錄 `data-fly` 與縮放，所以快速的機器也不會略過飛行；這些測試以 `reducedMotion: 'no-preference'` 執行（整個測試組預設是 reduce）。

**效能（production build、headless Chromium，P9.4 → P9.5）**

| 項目 | P9.4 | P9.5 |
|---|---|---|
| World draw calls／三角形 | 65／124.9k | 65／124.9k |
| `/cs`、`/sys` | 31／73.2k、20／36.7k | 相同 |
| World 單幀時間（中位數／P90） | 0.4／1.1 ms | 0.4／1.0 ms |
| 腳本 | 531 KB | 531 KB（手機 +1 KB） |
| 點擊 → 網址變更（CS、SYS 中位數） | 68、65 ms | 1018、1023 ms |
| 點擊 → 區域場景就緒 | 826、775 ms | 1777、1756 ms |

持續性的成本沒有變。增加的約 950 ms 就是飛行本身（設計上的動畫時間），飛行約 60 fps（950 ms 內 58 幀）。

## 5. 尚未完成

1. **仍是 Route Transition**：飛行在 World 頁內，結束後換頁，區域頁從靜止視角開始；兩頁之間不是同一個 Canvas。
2. **進入區域多約 1 秒**：若覺得太長，可以縮短 `FLY_MS`，不影響其他部分。
3. 手機上大幅縮放後，標籤可能全部移出舞台而隱藏，此時仍可點陸地進入。
4. 真機（iOS Safari、Android Chrome）未驗收。
5. 島嶼的探索面板在點擊時就出現，不等相機抵達。
