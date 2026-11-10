# 2026-10-29 Phase D.2a 六角聚落地圖原型

> 授權範圍：只做 D.2a。分支 `phase-d/basics-glb`，不 merge、不 push。分析與決議見 [2026-10-29-hex-world-analysis.md](2026-10-29-hex-world-analysis.md)。

## 結果

- 新增獨立預覽路由 `/islands/hex`：
  - 不連到網站導覽，metadata 設為 `noindex`；
  - 正式 `/islands`（D.1）完全沒有更動。
- axial (q, r)、flat-top 六角地塊，外接半徑 R = 1.25。
- 三座 7 格聚落，以兩座橋相連；道路從各聚落中央廣場連到橋頭。
- 等距鏡頭：
  - 從東南方約 40° 俯視；
  - 以正交 zoom 框住全景或選中的聚落；
  - 桌機與手機都能看到全部三座聚落。
- 地塊用程式生成的簡單材質：白色崖面、依地形分色的頂面、淺水六角環。
- 建築是程式產生的暫代物件（燈塔、工坊、倉庫、觀測站等），不使用 GLB；D.2b 才決定 GLB 建築如何上地塊。

## 座標資料（`src/lib/islands/hex-world.ts`）

| 聚落 | 中心 (q, r) | 地塊 | 地形 |
|---|---|---|---|
| 基礎程式島 `foundations` | (0, 0) | 中心加一圈共 7 格 | 廣場＋草地；(-1, 0) 抬高 0.12 |
| 資料結構島 `structures` | (4, -4) | 7 格 | 廣場＋草原；r = -3 的一列為沙岸 |
| 演算法島 `algorithms` | (8, -4) | 7 格 | 廣場＋草地；r = -5 的一列為岩地，抬高 0.22 |

| 橋 | 起點（地塊，邊） | 終點（地塊，邊） | 跨越的水格 | 種類 |
|---|---|---|---|---|
| `foundations-structures` | foundations (1, -1)，邊 1 | structures (3, -3)，邊 4 | (2, -2) | 木棧橋 |
| `structures-algorithms` | structures (5, -4)，邊 0 | algorithms (7, -4)，邊 3 | (6, -4) | 石橋 |

- **邊的編號：** 邊 d 和方向 d 的鄰格共用；俯視時邊 0 朝 -30°，之後逆時針每 60° 一條。
- **橋頭位置：** 橋頭是該邊的中點，兩端距離 √3·R ≈ 2.165。
- **擴充性：**
  - 聚落的地塊清單可以是任意形狀與數量，只要彼此相連；
  - 橋只要求兩端相對且在同一直線上，可以跨一格以上的水；
  - 任一地塊的邊都能再接新路線。

## 修改檔案

| 檔案 | 內容 |
|---|---|
| `src/lib/islands/hex.ts`（新） | 座標、鄰格、距離、spiral、世界座標換算、角點、邊中點 |
| `src/lib/islands/hex-world.ts`（新） | 型別、D.2a 版面資料、`validateHexWorld`、道路與鏡頭框選 |
| `src/components/islands/hex-world/*`（新，6 檔） | instanced 地塊（3 個 draw call）、橋與道路、暫代建築、等距鏡頭、場景、預覽頁元件 |
| `src/app/islands/hex/page.tsx`（新） | 預覽路由 |
| `src/components/islands/islands.module.css` | 新增「回到正式群島地圖」連結樣式 |
| `tests/hex-world.test.ts`（新） | 14 項單元測試 |
| `e2e/hex-world.spec.ts`（新） | 4 個情境 × 2 種裝置 |
| `docs/handoff/*` | IMPLEMENTATION_STATUS、ROADMAP、NEXT_STEPS、KNOWN_ISSUES、TESTING_STATUS |

未改動：教材、演算法引擎、播放器、`/islands` 相關元件、`camera-controller.tsx`、D.0 的 GLB／provenance／registry／契約、套件與 lockfile。

## 驗證（隔離副本）

- ESLint、TypeScript：通過。
- Vitest：81 passed／6 skipped。
- Build：成功。
- `hex-world.spec.ts`：重複 5 次 40/40。
- 全套 E2E：41 passed／3 failed，失敗的是既有的 player 案例（P1-11）。

## 開發中發現

- **鏡頭吸附：** camera-controls 的 `fitToBox` 會轉到最近軸向，造成正側視。預覽改用獨立鏡頭；`/islands` 可能也是正側視，記為 KNOWN_ISSUES P1-15。
- **第一個標籤空白：** drei `Html` 在 Canvas 中第一個掛載的標籤，沒有重新 render 就會空白。預覽改成 onReady 時 setState 避開，記為 P1-14。
- **手機標籤偏大：** 手機上聚落名牌字級大，會遮住部分暫代建築，可在 D.2b 調整。
