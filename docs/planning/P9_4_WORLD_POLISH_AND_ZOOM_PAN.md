# P9.4：P9.3 正式整合、視覺精修與世界地圖 Zoom／Pan

> 2026-11-19，分支 `p9/4-world-polish`（worktree `../logic-island-p9-ds`）。P9 只在 `LOGIC_ISLAND_P9_PROTOTYPE=1` 的建置生效，`VERCEL_ENV=production` 一律關閉；沒有修改 Vercel 環境變數或任何旗標。

## 1. Phase A：P9.3 合併至 `main`

| 項目 | 結果 |
|---|---|
| PR | [vince115/logic-island#25](https://github.com/vince115/logic-island/pull/25)，已合併為 `d983c52`（merge commit，未 rebase、未 force push） |
| 與 #18、#24 的關係 | P9.3 已含 P9.1（#18 的基底）、P9.1b（#24）與等效的 heading 修正；#18、#24 留待人工關閉 |
| CI | PR：`gates` 通過（9m39s）、Vercel Preview 成功；`main`（`d983c52`）：`gates` 通過、Vercel Production 成功 |
| Flag ON 建置＋P9 E2E | 20 通過／4 略過（旗標關閉的案例） |
| Flag OFF 建置＋全套 E2E | 431 通過／199 略過／0 失敗（12.9 分鐘） |
| 洩漏掃描 | `origin/main..e9aafba` 與 P9 `.next`：clean |
| 正式站（旗標關閉） | `/` 仍是原首頁；`/cs`、`/ai`、`/sys`、`/p9`、`/p9/cs`、`/world`、`/trials` 為 404；`/curriculum`、`/learn`、`/learn/linux-terminal`、`/regions/sys` 為 200；80 堂已發布課程連結全部 200 |

## 2. Phase B：視覺精修（`542f2ee`）

- **Design／SYS 建築比例**（`src/components/p9/landmarks/style.ts`）：每個區域有自己的建築比例、主建築再放大一點；Design、SYS 只加高（`tall` 1.35／1.4），佔地不變，所以每棟建築仍在自己的格子內（最寬底座 1.3 × 1.5 × 1.1 < 格寬 2.16）。島嶼中心、地形、橋樑、P9.1b 縮放與相機方位都沒變。
- **夜間照明**：每區一個發光材質（不增加 draw call）：CS 暖色工坊、AI 青藍、Design 柔和展示光、Web 藍紫、SYS 冷白。強度依時段：白天約 0.1、黃昏 0.35、傍晚 0.85；沒有 Bloom。
- **手機**（iPhone 13 模擬，六個頁面）：標籤無重疊、地圖觸控目標 ≥ 44 px、無水平捲動、返回世界總覽可點；未發現需要修正的問題。

## 3. Phase C：World Zoom／Pan（`e7075b9`）

在原本的 World 場景上加一個正交視角變換（`src/lib/p9/world-view.ts`），沒有第二套場景：

| 操作 | 實測結果 |
|---|---|
| 桌機滾輪 | 以游標為中心縮放（4 格 → 1.82×），網址仍是 `/` |
| 桌機拖曳 | 平移；從 CS 陸地開始並結束的拖曳不會進入區域 |
| 純點擊 CS 陸地 | 進入 `/cs` |
| ＋／－ | 每次 1.4 倍，1×–4× |
| 重設視角 | 回到 1×、五個區域完整呈現，不重新整理、網址不變，按鈕變為停用 |
| 手機雙指 | 縮放到 3×，頁面不捲動（`touch-action: none`） |
| 手機單指 | 平移；之後點標籤仍進入 `/cs` |
| 邊界 | 縮放 1×–4×；世界中心不會被拖出舞台中央 80% 範圍 |
| 標籤 | 跟著區域移動；離開舞台或進到右側導覽面板下方時隱藏 |

修正一個實作中發現的問題：觸控拖曳結束後不會產生 click，原本「拖曳中」旗標會殘留而吃掉下一次點擊（例如重設視角）；現在每次手勢結束後立即清除。

## 4. Phase D：地標資料契約（`c86d9bf`）

- `src/lib/islands/island-landmarks.ts`：與 S1 的 `island-interactions.ts` 並列，28 座島（基礎程式島除外，它的地標是 GLB 節點）的地標 ID、名稱、建地序號，可選的 `interactionId`；資料結構島列在第一個。
- `region-scene.ts` 依此列出每個地標與它的建地，World 與 Region 讀到同一份名稱與位置；畫出的零件不變。
- 契約測試（`tests/island-landmarks.test.ts`）：每座學科島都有登錄、每個用到的建地恰好一個地標、地標在自己的建地上；`interactionId` 只能指向該島自己的互動規格，規劃中島嶼只能是 `info`。目前沒有地標設定連結，全部是展示用途；基礎程式島的工坊、燈塔、碼頭不受影響。
- 沒有新增 GLB；若要換成 GLB 需另外的建模授權（S1 §10.2）。

## 5. 驗收

| 檢查 | 結果 |
|---|---|
| Typecheck／ESLint（全 repo） | 0／0 |
| Vitest | 88 個檔案，2041 通過／9 略過／0 失敗 |
| Flag ON 建置＋P9 E2E（含 Zoom／Pan 桌機與手機） | 22 通過／6 略過 |
| Flag OFF 建置＋P9、Navigation、首頁資料庫、`/islands`、Player、Curriculum E2E | 196 通過／30 略過／0 失敗 |
| 洩漏掃描 | `origin/main..c86d9bf` 與 P9 `.next`：clean |

效能（production build、headless Chromium，P9.3 → P9.4）：

| 頁面 | Draw calls | 三角形 | 腳本（KB，未壓縮） |
|---|---|---|---|
| `/` | 65 → 65 | 124.9k → 124.9k | 525 → 531 |
| `/cs` | 31 → 31 | 73.2k → 73.2k | 550 → 553 |
| `/design` | 17 → 17 | 23.6k → 23.6k | 550 → 553 |
| `/sys` | 20 → 20 | 36.7k → 36.7k | 550 → 553 |

World 單幀繪製時間：中位數 0.4 ms、P90 1.0–1.1 ms，前後相同。

## 6. 尚未完成

1. 真機（iOS Safari、Android Chrome）尚未驗收，雙指縮放是以 Pointer Events 模擬。
2. Zoom 時的標籤沿用靜止時的版面，只做位移與隱藏，不會重新避讓。
3. World → Region → Island 的 Camera Fly-to（P9.1c）未整合，依指示延後。
4. 地標目前沒有互動連結；要加入時在 `island-landmarks.ts` 設 `interactionId`，並在 `island-interactions.ts` 新增對應目標。
5. #18、#24 仍開著，待人工關閉。
