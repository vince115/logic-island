# R7：數位設計與網頁應用開發群島

> 2026-11-12。接續 R6（`main` `6d62e33`，CI 與 Vercel 正式部署皆通過）。分支 `r7/design-web`。

## 1. 盤點：已存在的部分（不重做）

| 項目 | 現況 | 來源 |
|---|---|---|
| 區域 | `design` 數位設計群島（order 3）、`web` 網頁與應用開發群島（order 4），沿用唯一的 `regions` registry | P1b（`src/content/world/islands.ts`） |
| 主題島 | Design：UI 15、UX 15、IXD 14、DSY 12（56 堂）；Web：WEB 15、FE 15、RWD 12、MOB 13（55 堂） | `curriculum-blueprint.json` → `planning-data.json` |
| 大綱內容 | 每堂課有標題（中英）、難度、學習目標、概念、必要／建議先修、活動 id；跨島引用單向（cs → ai → design → web） | IA v2 §2.4–2.5、§9 |
| 狀態 | 111 堂全部 `planned`：沒有頁面、沒有連結、標「規劃中」 | `catalog.ts`、`contentStatusOf` |
| 導覽 | 首頁「更多學習群島」、`/regions/design`、`/regions/web`、`/curriculum` 區域段落與總覽連結、側欄區域→島→難度→課（停用列） | P2、R6 |
| 3D | 不變：只有 `cs`、`ai` 有區域佈局；`design`、`web` 在旗標建置 `/world` 清單中標「尚無 3D 地圖」並連到總覽 | P3、R6 |

驗證器（`validate.ts`）以結構規則檢查區域、島、分組與課數；taxonomy 合約固定 cs 8/160、ai 7/160、design 4/56、web 4/55。R7 沒有改動區域或島的資料。

## 2. R7 新增

### 2.1 學習路線 G、H（IA v2 §2.7 的候選，隨 R7 寫入）

| 路線 | targets | 必要先修（自動補） | 共 | 已開放 |
|---|---|---|---|---|
| G 前端工程 `G-frontend-engineering` | WEB、RWD、FE、MOB 全部 55 堂 | 基礎程式島 F01–F05、F07、F13 | 62 | 7（皆為 F 島） |
| H 產品設計 `H-product-design` | UI、UX、IXD、DSY 全部 56 堂 | 無 | 56 | 0 |

- 寫入 `docs/planning/data/learning-paths.json`，以 `scripts/planning-data.mjs` 重新產生 `planning-data.json`；`validatePaths` 通過（先修在前、只含 targets 與其必要先修，建議課不上路線）。
- 順序依 catalog（UI → UX → IXD → DSY）：跨島先修只指向較前面的島，所以 UX 不能排在 UI 之前；§2.7 的「UX → UI」是教學敘事，不是資料順序。
- 路線依 targets 多數所在區域歸屬：G 出現在 `/regions/web`、H 出現在 `/regions/design`。
- 路線 I（AI 產品開發）仍是候選：targets 多在 AI 區域，與路線 F 重疊，待 AI 島開課後再定。

### 2.2 互動實驗對應

| 實驗 | 活動 id | 使用的課 | R7 狀態 |
|---|---|---|---|
| 色彩與無障礙實驗室 `/learn/color-contrast` | `color-contrast` | UI08、UI09、UI10、UI13 | 已上線（P4），沿用 |
| **Flexbox Playground `/learn/flexbox-playground`** | `flexbox-playground` | RWD03、RWD04 | **R7 實作**：真實 Flexbox 容器、5 個常用版面、只列與預設不同的 CSS、主軸／交錯軸的文字解讀（aria-live） |
| CSS Grid Playground | `grid-playground` | UI05、RWD05、RWD06 | 登錄為 planned（自 `responsive-layout` 拆出） |
| Responsive Layout Simulator | `responsive-sim` | RWD01、RWD02、RWD07–RWD10、MOB06 | planned（原 Playground 改名，只對應 responsive-sim） |
| Mobile Navigation Simulator | `mobile-nav-sim` | IXD07、RWD11、MOB02、MOB03 | planned（原 Mobile UX Simulator 改名） |
| Accessibility Checker | `a11y-checker` | IXD08、IXD09、DSY07、WEB13、FE13、MOB11 | planned（不變） |

- 原本 `responsive-layout` 一個實驗包三個活動；拆成一個活動一個實驗，課與實驗的對應才精確（多對多仍由 `lessonsUsingLab` 推導）。
- 沒有獨立實驗、只在課內使用的活動：`visual-hierarchy`（UI02–03）、`design-token-board`（DSY02–04）、`dom-explorer`（WEB02–09、MOB04）、`react-state-flow`（FE05–09）。
- 優先順序建議：Grid（3 堂、與 Flexbox 共用控制面板）→ Responsive Simulator（7 堂最多）→ Mobile Navigation（4 堂）。

## 3. 不變

- 80 堂正式課程、AI 七座島與其 ID、使用者進度格式。
- 3D 世界與 GLB、`LOGIC_ISLAND_TRIALS`／`LOGIC_ISLAND_REGIONAL_WORLD` 旗標。
- 考試引擎、題庫、答案、審核與發布狀態。

## 4. 驗證

見 `MULTI_ARCHIPELAGO_IA_V2.md` §10 的 R7 列。

## 5. 發布（2026-11-12）

| 項目 | 結果 |
|---|---|
| PR [#4](https://github.com/vince115/logic-island/pull/4) | `1e14d85`；CI 全部必要步驟通過（compare 模式）、Vercel Preview 成功；以 merge commit 合併為 `main` **`aaf1d0a`** |
| 正式部署 | Vercel Production `aaf1d0a` 成功，https://logic-island-psi.vercel.app |
| 正式站 smoke（1440 桌機、iPhone 13） | `/regions/design`、`/regions/web` 各 4 座島皆規劃中、無課程連結；路線 H 56 堂（已開放 0）、G 62 堂（已開放 7）；`/learn/flexbox-playground` 可操作（選項與預設版面即時改變真實容器與 CSS）；工具卡連結只有色彩與 Flexbox，Grid／Responsive／Mobile Navigation 等 7 張為規劃中且無連結，網址 404；首頁 3D canvas、GLB 200；`/curriculum` 80 堂；`/regions/ai` 7 島皆規劃中；`/trials`、`/world` 404；無水平溢出、無 console 錯誤 |
| 洩漏掃描 | 正式站回應（296 份 HTML／JS）、提交範圍與 `.next` 皆乾淨 |
| 後續修正 | 路線卡原寫「62 堂 · 已開放 7 堂 · 規劃中」，總數可能被讀成已完成教材數；改為「路線共 62 堂 · 已開放 7 堂 · 其餘 55 堂規劃中」並加 E2E 斷言（本記錄所在的 PR） |

