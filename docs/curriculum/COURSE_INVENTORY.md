# 課程盤點（Phase 0，2026-11-20）

> 以 `origin/main` `36a8343` 的 Repository 實際資料重新核對（`src/content/world` 的目錄、`src/content/curriculum` 的課綱與內容），不沿用舊報告的數字。分支 `courses/batch-1`，worktree `../logic-island-courses`。

> **第一批之後（2026-11-20）**：PL01–PL05 發布，已發布 **85**、規劃中 **435**（CS 85／160；PL 5/20，程式語言島從「規劃中」變成「部分開放」）。
> **第二批之後（2026-11-20）**：PL06–PL10 發布，已發布 **90**、規劃中 **430**（CS 90／160；PL 10/20，地景仍為規劃中）。
> **CN-5 之後（2026-11-22）**：計算機網路島 20 堂全部發布（`network-protocol` 能力，CN-0；CN11、CN14、CN16、CN20 為四語程式課），學習路線 C（網路與系統）可完整學完；已發布 **120**、規劃中 **400**（CS 120／160；程式語言島與計算機網路島的地景仍為規劃中）。之後的數字以 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 與 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md) 為準。尚未實作的互動活動見 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md)。下面 §1–§5 保留 Phase 0 盤點當時的數字；之後的數字以產生的 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md) 為準。

## 1. 總數

5 個區域、29 座主題島（另有 1 座共用的互動實驗島）、520 堂課：**已發布 80、規劃中 440**。課程只有這兩種狀態（`contentStatusOf`：published、planned；「製作中」目前沒有任何課）。先前紀錄的 5 區域、29 島、520 課、80／440 經核對無誤。

| 區域 | 島數 | 已發布／總數 | 各島（已發布／總數） |
|---|---|---|---|
| 程式與資訊群島 cs | 8 | 80／160 | F 20/20、DS 20/20、AL 20/20、PL 0/20、DB 20/20、CN 0/20、SA 0/20、MIS 0/20 |
| AI 人工智慧群島 ai | 7 | 0／160 | AIF 0/20、ML 0/25、DL 0/25、LLM 0/25、GEN 0/20、AG 0/25、OPS 0/20 |
| 數位設計群島 design | 4 | 0／56 | UI 0/15、UX 0/15、IXD 0/14、DSY 0/12 |
| 網頁與應用開發群島 web | 4 | 0／55 | WEB 0/15、FE 0/15、RWD 0/12、MOB 0/13 |
| 系統與雲端工程群島 sys | 6 | 0／89 | LNX 0/15、DKR 0/15、SRV 0/14、CLD 0/15、CICD 0/15、KUB 0/15 |

## 2. 缺少教材與內容不完整的課

- **缺少教材**：440 堂規劃中的課只有大綱（標題、目標、概念、先修、活動），沒有頁面與連結。
- **已發布但不完整**：80 堂已發布的課全部有完整內容、測驗與練習，通過課綱驗證器與新的發布閘門（見規格 §6；以它們校準）。唯一的一致性缺口：**已發布的 DB16 以規劃中的 PL02 為先修**（另有 DB14～DB16 建議 PL09、PL13、PL14），學習者會被指向一堂還不存在的課。第一批寫完 PL02 即補上。

## 3. 教材架構（可重用的部分）

| 部分 | 位置 | 說明 |
|---|---|---|
| 課程大綱與順序 | `src/content/curriculum/lessons.ts` | 有內容的島（F、D、A、DB）的課；DB 與 PL 的大綱直接取自藍圖（`fromBlueprint`、`programFromBlueprint`） |
| 教材內容 | `src/content/curriculum/content/*.ts` | 每堂一個 `LessonContent`（段落、範例、測驗、練習、視覺化設定） |
| 課程能力 | `schema.ts` `LESSON_CAPABILITIES` | `program-code`、`sql`、`er-diagram`、`normalization`、`query-plan`、`transaction-timeline`、`driver-code`、`protocol-sequence`、`architecture-diagram`、`visualization` |
| 驗證 | `validateCurriculum`、`tests/curriculum*.test.ts`、`src/lib/curriculum/publish-gate.ts` | 欄位、順序、引用、最低數量；範例與練習實際執行（C++、Java、Python、JavaScript、SQL） |
| 共用視覺化 | `registry.ts`、`simulate.ts`、`simulate-algorithms.ts` | 變數、迴圈、陣列、函式呼叫、遞迴、各種資料結構與演算法的逐步 trace |
| 互動實驗（`/learn`） | `src/content/world/labs.ts` | 已實作：六個演算法實驗、色彩與無障礙、Flexbox、CSS Grid、Responsive Layout、Mobile Navigation、Linux Terminal；規劃中：Accessibility Checker、Embedding、Prompt、RAG、Docker、Network Request、CI/CD |
| 路由與導覽 | `src/app/curriculum/[slug]`、`src/lib/nav/site-nav.ts`、`/regions/[region]` | 已發布的課自動產生頁面與側欄連結；規劃中的課只顯示、不連結 |

## 4. 先修與跨島引用

- 先修（`prerequisites`）必須是已發布、而且排在前面的課；建議課（`recommended`）只是提示。
- 跨島、跨區域引用只指向較前面的區域或島（cs → ai → design → web；sys 依 P6 規則），避免循環。
- 有內容的島依世界目錄的順序排列：PL（CS 第 4 島）排在 DB（第 5 島）之前，DB16 → PL02 才合法。

## 5. 建議製作順序

1. **程式語言島 PL01–PL20**：先修只依賴已發布的基礎程式島，完全重用 `program-code`；同時補上 DB16 的先修缺口。（第一批 PL01–PL05）
2. **計算機網路 CN、Linux LNX**：先新增 capability（協定往返、終端機與設定檔），再開課；可重用 `protocol-sequence` 與 Linux Terminal Simulator。
3. 之後依學習路線完整度排列，讓學習者能完整學完一條路線（路線清單見 `learning-paths.json`）。

## 6. 課程開放與 3D 視覺狀態分離（第一批發布時決定）

一座島「有沒有已發布的課」與「3D 地圖怎麼畫它」是兩件事，分開記錄：

| 狀態 | 欄位 | 由誰決定 | 影響 |
|---|---|---|---|
| 課程開放 | `IslandConfig.status`（planned／available／complete） | 由已寫好的課自動推導 | 課綱、側欄、島嶼面板的課程與單元、區域頁的「已開放」計數、DB16 → PL02 這類先修連結 |
| 3D 地景 | `IslandConfig.mapState`（built／planned） | 手動設定（`src/content/world/islands.ts`），不由課程推導 | 區域地圖的地形（規劃中的霧與標記）、世界總覽的低細節島、`island-registry` 的 `visualSpec`、home map 的橋 |

- 程式語言島：`status: 'available'`（5/20），`mapState: 'planned'`：仍是原本的規劃地景，沒有 GLB、沒有重新建模、座標不變。
- 規則：課程全部規劃中的島一定畫成規劃中（地景可以落後課程，不能超前）；`validateIslandRegistry` 檢查地圖實際畫的狀態與 `mapState` 一致；`validateIslandLinks` 的「橋只連地圖上的島」改看 `mapState`。
- 要讓一座島換成自己的地景（模型選版、建模、GLB 整合）是另外的授權階段，完成時才把 `mapState` 改成 `built`。
- 尚未合併的 P9 分支（`p9/1c-camera-flight`、`p9/1c-seamless-navigation`、`p9/8a-navigation-continuity` 等）沒有新增以課程狀態決定地景的程式；它們的區域標題計數來自頁面資料，rebase 到 main 後會顯示「5 座已開放 · 3 座規劃中」，若其 E2E 寫死「4 座已開放」或把程式語言島當成規劃中的範例，需改用 `mapState` 或改選計算機網路島。

規格與佇列見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)，進度見 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md)。
