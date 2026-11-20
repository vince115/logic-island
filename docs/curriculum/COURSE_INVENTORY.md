# 課程盤點（Phase 0，2026-11-20）

> 以 `origin/main` `36a8343` 的 Repository 實際資料重新核對（`src/content/world` 的目錄、`src/content/curriculum` 的課綱與內容），不沿用舊報告的數字。分支 `courses/batch-1`，worktree `../logic-island-courses`。

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

規格與佇列見 [COURSE_CONTENT_SPECIFICATION](COURSE_CONTENT_SPECIFICATION.md)，進度見 [COURSE_PRODUCTION_PROGRESS](COURSE_PRODUCTION_PROGRESS.md)。
