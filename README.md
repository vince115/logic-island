# Logic Island v0.1 — 程式邏輯島

Think · Visualize · Code

## 開始使用

本專案原以 LogicLab（程式邏輯實驗室）名稱建立於 `/Users/vincelo/dev-hub/github/vince115/logic-lab`，現已更名為 Logic Island（程式邏輯島），目前路徑為 `/Users/vincelo/dev-hub/github/vince115/logic-island`，GitHub repository 為 `https://github.com/vince115/logic-island.git`。原指定 `~/Dev/logiclab` 不存在；工作區原為空目錄且沒有 Git 紀錄，未覆蓋既有專案，也未自行初始化 Git。3D 學習群島的名稱為 Logic Islands。

使用 Node.js 24 LTS 與 pnpm 12.14.0：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm test
pnpm build
pnpm start
```

Next.js 16.4.3、React 19.3.1、Tailwind 4.3.3、Motion 14.6.0；版本固定在 package.json 與 pnpm-lock.yaml。採用 TypeScript 5.9.3 / ESLint 9.39.4，符合目前 Next.js ESLint 相依套件的 peer 範圍；不採用 canary。

## 路由與教材

- `/`：產品介紹、學習路線、推薦教材與實驗入口。
- `/learn`：依資料結構、搜尋與排序、圖論分類，列出難度與先備知識。
- `/learn/[slug]`：概念、使用情境、學習目標、複雜度、三語言完整範例與互動實驗。
- `/visualize`：六個互動教材入口。
- `/visualize/[slug]`：以實驗室為主要焦點，也保留概念與複雜度供對照。

僅生成以下六個 slug，不支援的 slug 回傳 404：

| slug | 教材 | 可調整的輸入 |
| --- | --- | --- |
| array | 陣列存取與更新 | 陣列、索引、操作、新值 |
| stack | Push / Pop | 初始堆疊、操作、新值；允許空集合 |
| queue | Enqueue / Dequeue | 初始佇列、操作、新值；允許空集合 |
| binary-search | 二分搜尋 | 遞增陣列、目標；未排序輸入會顯示錯誤 |
| bubble-sort | 氣泡排序 | 陣列；允許負數、重複值與空集合 |
| bfs | 廣度優先搜尋 | 0 起連續節點編號、無向邊、起點；允許有環與不連通圖 |

六份教材均包含概念、使用情境、操作動畫、時間與空間複雜度、學習目標及 C++ / Python / Java 範例。BFS 以編號作為節點標籤，按邊的輸入順序走訪鄰居。重複邊、自環不會造成重複入隊。二分搜尋遇重複值可回傳任一相符索引。

## 架構與責任

- `src/content/courses.ts`：統一 Course / CodeExample Schema、六份靜態原創教材、三語範例、操作對應行號。
- `src/lib/engine.ts`：純 TypeScript 演算法、Input / Step / Phase 型別、輸入解析、游標邊界。每個步驟保存完整且獨立的快照，後退不需要反向執行演算法。
- `src/components/lab.tsx`：六個教材共用的播放、暫停、前進、後退、重置、0.5–2 倍速、進度拖曳、輸入表單、文字解說及語言切換。Scene 依 visualizationType 繪製方格、堆疊、佇列、長條或 SVG 圖形。Motion 負責位置與狀態過渡；支援 reduced motion。
- `src/components/lesson.tsx`：教材版面、目標、複雜度、先備知識與下一課連結。
- `src/components/catalog.tsx`、`course-card.tsx`：課程分類與教材入口。
- `src/components/header.tsx`、`theme-toggle.tsx`：導覽狀態、深淺色切換、localStorage 偏好；初次依系統主題。
- `src/components/ui/button.tsx`、`src/lib/utils.ts`、`components.json`：shadcn/ui Button 的 Slot / CVA 組成方式與設定。
- `src/app/`：App Router Server Components、靜態路由參數、metadata、404、全站樣式。只有導覽狀態、主題與實驗室需要 Client Components。
- `tests/engine.test.ts`：演算法正確性、錯誤輸入、邊界情況與回放快照一致性。
- `tests/examples.test.ts`：實際編譯 / 執行教材範例，驗證相同預期輸出。

## 教學與實作限制

- 按「套用輸入」才會重新產生動畫。控制列的重置回到已套用輸入的第 0 步。
- 程式碼為固定、完整可執行範例；行標示對應目前操作種類，使用者輸入只影響動畫。網站不會遠端執行程式碼。
- 陣列最多 16 個整數（-999 至 999）；BFS 最多 10 個節點，確保畫面可讀。
- 複雜度標示為演算法本身，額外的動畫快照複製、儲存、渲染不計入。Queue 範例採 deque / ArrayDeque；視覺化引擎使用陣列快照與 shift，不宣稱它的移除成本為 O(1)。
- 不包含登入、API、資料庫、OJ、AI、付費、排行、模擬考與題庫。

## 實際驗證紀錄（2026-10-28）

- `pnpm lint`：通過，0 errors、0 warnings。
- `pnpm peers check`：無 peer dependency 衝突。
- `pnpm build`：通過，15 個功能頁面與內建 404，完成靜態預先渲染及 TypeScript 檢查。首次 Build 被沙箱禁止本機子程序連線而失敗，取得授權後重跑成功。
- `pnpm test`：33 passed、6 skipped。21 項引擎測試 + 6 項 Python + 6 項 C++17 範例執行測試通過。
- 已涵蓋：二分搜尋找不到、空陣列、未排序拒絕；排序重複值、已排序、空集合、單一值、負數；空 Stack / Queue 操作；BFS 有環、不連通、自環、重複邊、孤立起點；六個演算法快照的前進 / 後退與輸入不變性。
- Java：本機無 JDK / Java Runtime，六項執行測試明確跳過，不能視為已驗證。提供 Java 17+ 相容程式碼，安裝 JDK 後重跑 `pnpm test` 可自動啟用。
- 瀏覽器預覽遭權限關卡拒絕，未繞過。尚未做實際瀏覽器點擊、跨裝置視覺與 hydration 驗證。已實作響應式與主題，但不能宣稱已完成瀏覽器驗收。

## 後續建議

先補齊 JDK 17+ 範例執行、桌機 / 平板 / 手機瀏覽器驗收，再加入共用播放器的瀏覽器端自動測試（速度、暫停、重置、主題保存與換課狀態）。之後沿用 Course Schema 與 Step 引擎增加教材，不必先導入後端。

技術參考：[Next.js](https://nextjs.org/docs)、[shadcn/ui](https://ui.shadcn.com/docs/installation/manual)、[Motion](https://motion.dev/docs/react-installation)。

## Phase 1.1 驗收與配色調整（2026-10-28）

本次保留六份教材與共用引擎，沒有新增產品功能、教材、後端或初始化 Git。目錄仍未有 `.git`，`git status --short` 回報不是 Git repository，因此無法提供 Git diff。

### 實際修復與修改

- 播放器到達最後一步時，原本會多等一個播放間隔才將「暫停」改回「播放」，這段時間點擊按鈕無法立即重播。新增 DOM 整合測試重現失敗後，修改共用播放器的計時回呼，在前進至最後一步時同步停止。未更動演算法結果或步驟。
- 依後續指示將介面改為藍色主導，搭配紅、黃、綠點綴。主按鈕、導覽與程式碼區為藍色；教材圖示採四色，視窗圓點採紅黃綠；完成 / 訪問保留綠色，交換為黃色。黃色交換格使用深色文字；深色模式的藍色文字與按鈕分開取色，避免文字對比不足。
- `tests/player.test.tsx`：新增 12 項實際 Lab 元件與真實引擎的記憶體 DOM 整合測試，使用 fake timers，不替換演算法或播放器邏輯。包括六份教材前進 / 後退還原、立即結束、暫停、重置 / 重播、播放中更換輸入、錯誤輸入恢復、速度與語言切換。
- `tests/setup.ts`：提供 Motion 使用的 reduced-motion 能力，無網路、無實際瀏覽器。
- `vitest.config.mts`：限制單元 / 整合測試檔案範圍並設定原有 `@` alias，避免 Vitest 誤跑 Playwright。
- `e2e/player.spec.ts`、`playwright.config.ts`：新增桌機 Chromium 與手機 Chromium 設定，共 22 個測試案例。覆蓋首頁 / 課程導航、六教材三語切換、前進 / 後退、播放結束、重置 / 重播、輸入變更、主題保存、水平溢出與 Console / pageerror 檢查。手機設定為 Chromium 裝置模擬，不等同真實 iOS Safari。
- `package.json`、`pnpm-lock.yaml`：固定新增的測試工具版本，新增 `test:e2e`；`.gitignore` 排除測試報告。
- `src/components/lab.tsx`：上述播放結束修復與黃色格文字樣式。
- `src/app/globals.css`、`src/components/course-card.tsx`：四色主題與教材圖示。

### 最終實際執行結果

| 指令 | 結果 |
| --- | --- |
| `pnpm lint` | 通過，0 errors、0 warnings |
| `pnpm test` | 3 個檔案通過，45 passed、6 skipped |
| `pnpm build` | 通過，含 TypeScript 檢查與原有 15 個功能路由 |
| `pnpm peers check` | 無相依版本衝突 |
| `pnpm exec playwright test --list` | 成功載入與列出 22 個案例；此命令沒有啟動瀏覽器，不代表 E2E 已通過 |

45 項通過包括原有 21 項引擎測試、六個 Python / 六個 C++17 實際範例執行，以及新增 12 項播放器 DOM 整合測試。六個 Java 測試仍明確跳過。

### 尚未驗證與執行條件

**Java**：`/usr/libexec/java_home -V` 回報找不到 Runtime，系統與使用者的標準 JVM 目錄、Homebrew 也未找到 JDK；`/usr/bin/javac` 僅為 macOS 轉接程式。本次沒有安裝 JDK、修改 PATH 或修改任何系統設定。建議使用 Temurin 21；由使用者安裝後驗證：

```sh
brew install --cask temurin@21
java -version
javac -version
pnpm test
```

安裝指令來源：[Homebrew Temurin 21](https://formulae.brew.sh/cask/temurin%4021)。

**瀏覽器**：本次再次檢查後，已儲存權限或管理政策仍拒絕存取 `http://127.0.0.1:3000`。沒有改用其他瀏覽器、port、命令或自動化程序繞過。因此未執行 Playwright，未確認首頁 / 六教材的實際導航、瀏覽器語言切換與播放器互動、Light / Dark Mode 呈現、桌機 / 手機版面、Console、hydration 或新配色視覺效果。DOM 測試不能替代這些驗收。

只有在瀏覽器存取政策獲准後，才可執行以下命令。尚未下載瀏覽器；設定使用 port 3100 是為未來測試避免與一般開發伺服器共用，並未用它繞過目前封鎖：

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

**Phase 2 建議**：先完成 JDK 範例執行與真正的瀏覽器驗收，再正式開始 Phase 2。此階段未提前開發後續功能。
