# 多群島學習架構 v2（資訊架構與分期規劃）

> 初版 2026-11-12；同日依使用者決策（D1–D3）修訂。Asia/Taipei。
> **只有規劃**：沒有修改 `src/`、測試、題庫、套件、3D 資產或部署設定，沒有 commit、push 或部署。
> v2 的整體方向已由使用者**原則批准**。2026-11-12 使用者授權依序實作 P1a → P1b → P2，並進行 P3 盤點、P4 共用實驗架構與第一個實驗、P5 整合盤點；各階段實作紀錄見 §10。
> 相關文件：[MULTI_ARCHIPELAGO_MASTER_PLAN](MULTI_ARCHIPELAGO_MASTER_PLAN.md)、[ISLAND_TAXONOMY](ISLAND_TAXONOMY.md)、[M3_CS_AI_MASTER_PLAN §10](M3_CS_AI_MASTER_PLAN.md#10-決策紀錄2026-11-03-使用者有條件批准)。

## 0. 決策紀錄

### 0.1 已確認（2026-11-12）

| # | 決策 | 結果 |
|---|---|---|
| D1 | AI 群島 | **保留 7 座島**（AIF、ML、DL、LLM、GEN、AG、OPS），不合併、不重新編號、不改任何課程 ID。v2 的 AI 主題只作**導覽分組**，見 §2.2 |
| D2 | 新增區域 | **批准** `design`（數位設計群島）與 `web`（網頁與應用開發群島）。沿用既有 `Region`／`IslandConfig`／Lesson 資料模型，不建立第二套群島設定。新增區域**不代表**立即建立全部課程、3D 場景或公開入口。總數重新計算（§2.6），`validate.ts` 改為以資料與規格驗證（§5.3） |
| D3 | 新島課數 | 暫定每島 15 堂，是**目標上限，不是硬性要求**；依內容價值決定，不湊數。本文件提出的大綱實際為 12–15 堂（§2.4、§2.5） |

### 0.2 架構原則（使用者指定，所有階段適用）

1. 保留現有 80 堂正式課程。
2. 保留 AI 七座島的 ID 與既有規劃。
3. 保留 Exam Engine 共用架構。
4. 不修改 iPAS 或 CCAR-F 題庫內容。
5. 保留現有六個互動實驗。
6. 互動實驗島是跨群島共用學習工具。
7. 共用外層 Sidebar＋頁面專屬課程樹（方案 B）。
8. 新增群島由資料驅動，不硬編碼導覽。
9. 本階段不要求新增 GLB 或其他 3D 資產。
10. 未完成的課程與群島必須清楚標示「規劃中」（Planned／Coming Soon）。

### 0.3 截斷句的解讀

初版需求最後一句「不得把新增群島……」貼上時被截斷。本文件解讀為「**不得把新增群島一次全部實作或直接放上正式首頁**」，與 D2「新增 Region 不代表立即建立全部課程、3D 場景或公開入口」一致。

---

## 1. 現況盤點（Phase 1）

### 1.1 Git 與工作目錄（2026-11-12 實際查詢）

| 項目 | 實況 |
|---|---|
| 分支／HEAD | `nav/unified-sidebar` @ `0849c3f`；比 `main`（`f45c867`）多 159 個 commit |
| 其他 worktree | `logic-island-m3-ring`（`m3/mobile-marker-occlusion-fix`）、`logic-island-t3j`（`public/trials-mvp`） |
| 未提交變更 | `next-env.d.ts`、`src/app/globals.css`、`src/app/layout.tsx`、`curriculum.module.css`、`islands.module.css`、`src/lib/site-time.ts`（時段主題 `data-time`）；未追蹤 `.claude/`。**與本規劃無關，沒有碰** |
| 交接文件時效 | `docs/handoff/CLAUDE_HANDOFF.md` 仍寫「沒有 .git」（2026-10-29 紀錄），已過時 |

### 1.2 八個盤點問題

| # | 問題 | 結論 | 證據 |
|---|---|---|---|
| 1 | Git 狀態 | 見 §1.1 | `git status`、`git worktree list` |
| 2 | 現有群島與課程 | 2 區域、15 座學科島＋1 座工具島。**有教材的只有 F、DS、AL、DB 四座，共 80 堂，全部 complete**；其餘 11 座 planned | `src/content/world/islands.ts:14-17, 51-80`；`src/content/curriculum/schema.ts:36, 43`；`lessons.ts:288` |
| 3 | 群島由什麼驅動 | **TypeScript 靜態設定**＋規劃資料。資料流：`docs/planning/data/curriculum-blueprint.json` → `scripts/planning-data.mjs`（純函式，`--check` 檢查是否過期）→ `src/content/world/planning-data.json` → `catalog.ts`／`islands.ts` | `types.ts:11-66`；`islands.ts:39-47`；`scripts/planning-data.mjs:33-44` |
| 4 | 3D 與課程資料的對應 | 兩套型別以同一個 `id` 對應：課程端 `IslandConfig`（`src/content/world`），3D 端 `IslandDefinition`／`LearningIsland`（`src/lib/islands/types.ts:27-63`）。首頁 `/` 為 5 島；`/world`、`/world/[region]` 由 `LOGIC_ISLAND_REGIONAL_WORLD=1` 控制、noindex | `src/app/page.tsx:5,17,31`；`region-layouts.ts:77-80`；`src/lib/world/flag.ts:7` |
| 5 | AI 群島是否已存在 | **資料存在，正式入口看不到**，詳見 §3 | §3.1 |
| 6 | 互動實驗是否與資料結構耦合 | **是**：`Course.slug: AlgorithmId`、`category` 限三種、`engine.ts` 的步驟型別與 `lab.tsx` 以 slug 分支 | `courses.ts:10`；`engine.ts:1-5, 22-72`；`lab.tsx:16-19, 41` |
| 6b | 課程與實驗的關聯 | 多對多雛形：`LessonMeta.labs?: AlgorithmId[]`（7 堂）、`activities.ts` 87 項活動 metadata | `schema.ts:135`；`activities.ts:57, 80-84`；§4.4 |
| 7 | 側欄可否重用 | 可以，已資料驅動：`AppShell` 用於 `/curriculum`、`/learn`、`/trials`；`courseTree`（島→難度→課）、`labTree`、`examTree`；Accordion、`aria-current`、抽屜、收合、島嶼預覽卡 | `site-nav.ts:45-68`；`site-sidebar.tsx:36-180`；`nav-store.ts:10-47` |
| 8 | Exam Engine | 在 `LOGIC_ISLAND_TRIALS=1` 之後。iPAS 200、CCAR-F 150、高普考 40、APCS＋銀行 13。所有考試共用 `logic-island.trials`，以 `paperId`／`examId` 區分。iPAS 每題 `links.plannedIslands` 指向 AI 島；**CCAR-F 150 題沒有 links**。`Exam.archipelago` 與 `TrialPlace.regionId` 型別寫死 `'cs' \| 'ai'` | `store.ts:28-38`；`trials/schema.ts:45, 198, 307`；`exams.ts:16-21` |

---

## 2. 群島與課程（Phase 2，依 D1–D3 修訂）

### 2.1 四個區域

| `regionId` | 名稱 | 島（`islandId`） | 狀態 |
|---|---|---|---|
| `cs` | 程式與資訊群島（現名「資訊科學群島」，顯示名稱是否改由 P1b 決定） | foundations、structures、algorithms、databases（complete）；programming-languages、networks、systems-analysis、information-systems（planned） | 80 堂可用 |
| `ai` | AI 人工智慧群島 | ai-foundations、machine-learning、deep-learning、large-language-models、generative-ai、ai-agents、ai-engineering（planned） | 資料存在，0 堂可用 |
| `design`（新） | 數位設計群島 | ui-design、ux-research、interaction-design、design-systems | 規劃中 |
| `web`（新） | 網頁與應用開發群島 | web-foundations、frontend、responsive-design、mobile-apps | 規劃中 |

80 堂的 `lessonId`、`slug`、`/curriculum/[slug]`、`islandId`、`logic-island.progress` 的 key 全部不變。

### 2.2 AI 導覽分組（D1）

依 7 座島的**實際課綱**（`planning-data.json` 的 160 堂大綱）分組。規則：**以整座島為單位、每島恰好屬於一組**，不把同一座島的課拆到不同組，避免重複分類。

| 分組 id | 名稱 | 島 | 依據（課綱內容） |
|---|---|---|---|
| `ai-core` | AI 原理與模型 | AIF、ML、DL | 搜尋、邏輯、機率（AIF04–AIF18）；迴歸、分類、分群、評估（ML05–ML24）；神經網路、反向傳播、CNN、RNN、Transformer（DL01–DL18）。共同點是「模型如何運作」 |
| `ai-genai` | 生成式 AI 與大型語言模型 | LLM、GEN | Tokenization、Embedding、預訓練、對齊（LLM02–LLM08、LLM19–LLM23）；提示、RAG、向量檢索（LLM09–LLM17）；擴散、多模態、TTS（GEN01–GEN19） |
| `ai-systems` | AI 應用與系統工程 | AG、OPS | 工具呼叫、Agent 迴圈、MCP、多 Agent、護欄（AG01–AG24）；部署、閘道、監控、成本、安全（OPS01–OPS19） |

和初版 4 個主題的關係：

| 初版主題 | 處理 | 原因 |
|---|---|---|
| AI 基礎（AI 概論、ML、DL） | = `ai-core` | 完全對應 |
| 生成式 AI（Prompt、LLM、Embedding、RAG） | = `ai-genai` | Prompt（LLM10）、Embedding（LLM03）、RAG（LLM14）都在 LLM 島；GEN 一併放入 |
| AI 應用（Agent、Tool Calling、Workflow） | 併入 `ai-systems` | 與「AI 架構」都落在 AG 島；分成兩組就必須把 AG 島切開 |
| AI 架構（模型選型、MCP、系統架構、安全與評估） | **不作導覽分組**，改為候選**學習路線**「AI 架構師」 | 這些課分散在 AG12–AG13（MCP）、AG17–AG24（護欄、注入、評估、可靠性、成本、追蹤）、OPS03、OPS13–OPS19、LLM20、LLM24 三座島。路線本來就是跨島的課程序列（`learning-paths.json`），而導覽分組只能放整座島。此路線也是 CCAR-F 題目內容最接近的範圍 |

已知缺口：「模型選型」沒有獨立的課，最接近的是 OPS03（模型閘道與供應商整合）與 LLM20（LLM 評估）→ 列入課程 backlog，不在本規劃新增。

LLM 島有 `track: 'model' | 'application'` 兩軌（例 LLM10 `track: "application"`）。如果日後需要更細的導覽，可在 LLM 島內依 track 分段，不需要改分組。

### 2.3 Design 與 Web 的歸屬規則

| 主題 | 可能重疊 | 歸屬 |
|---|---|---|
| UI／UX 概論 | SA14 `ui-ux-design` | SA14 保留為系統分析脈絡的一堂概論，`recommended` 連到 UI01、UX01 |
| 無障礙 | IXD（原則）、WEB／FE／MOB（實作） | 原則在 IXD08；HTML／ARIA 在 WEB13；元件在 FE13；行動在 MOB11。互列為 recommended |
| 觸控與手勢 | IXD 與 MOB | 目標尺寸與手勢的**設計**在 IXD10；Pointer Events 與實作在 MOB04 |
| 原型 | IXD 與 FE | 原型與原型測試在 IXD；FE 不教原型 |
| Design Tokens、元件 | DSY 與 FE | 規格在 DSY；React 實作在 FE；DSY10 處理兩者之間的輸出管線 |
| HTTP、快取、WebSocket | CN12、CN15、CN16 與 WEB | 協定在 CN；瀏覽器端使用在 WEB11 |
| JavaScript 語言基礎 | F 島（四語之一，含 JavaScript） | F 教變數、條件、迴圈、函式；WEB 從 DOM 開始，以 F02、F05、F07、F13 為先修，不重教 |
| TypeScript 型別 | PL（型別系統原理） | FE 只教實用型別；PL 的原理以 recommended 連結 |
| 資訊架構、User Flow、Wireframe | UX 與 IXD | 都在 UX（研究到結構）；IXD 從原型開始 |
| AI 介面 | FE 與 AG | 串流 UI 在 FE14；Agent 本身在 AG |

命名衝突：設計的 token 活動不能叫 `token-explorer`（已是 LLM 的分詞活動），改用 `design-token-board`。

### 2.4 數位設計群島（`design`）大綱

難度代號：B＝Beginner（入門）、I＝Intermediate（中級）、A＝Advanced（進階），與現有 `DIFFICULTIES` 相同。
「先修」只列必要先修（`prerequisites`）；跨島的寫在「跨群島」欄（多為 `recommended`，永不鎖課）。
「實驗」欄是課程內建議的活動 id；粗體是新 id，其餘為既有 registry id。

#### UI 設計島 `ui-design`／`UI`（15 堂：B 6、I 6、A 3）

**學習目標**：能用層級、格線、字體與色彩做出清楚、一致、符合 WCAG 對比的介面，並說明每個設計決定的理由。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| UI01 | 介面設計是什麼：好介面的判準 | B | — | SA14 | — |
| UI02 | 視覺層級：大小、對比、位置 | B | UI01 | — | **visual-hierarchy** |
| UI03 | 格式塔原則與分組 | B | UI02 | — | **visual-hierarchy** |
| UI04 | 間距與節奏：4／8 pt 系統 | B | UI03 | — | — |
| UI05 | 版面格線與對齊 | I | UI04 | RWD05 | **grid-playground** |
| UI06 | 字體排印：字級、行高、行長 | B | UI02 | — | — |
| UI07 | 中文與多語排版 | I | UI06 | — | — |
| UI08 | 色彩基礎：色相、明度、彩度 | B | UI01 | — | **color-contrast** |
| UI09 | 色彩系統與語意色 | I | UI08 | DSY02 | **color-contrast** |
| UI10 | 對比與可讀性：WCAG 對比 | I | UI08 | IXD08 | **color-contrast** |
| UI11 | 圖示與圖像 | I | UI03 | — | — |
| UI12 | 元件狀態：懸停、焦點、停用、錯誤 | I | UI09 | IXD04、FE13 | — |
| UI13 | 深色模式與主題 | A | UI09、UI10 | DSY04 | **color-contrast** |
| UI14 | 資料密集介面：表格與儀表板 | A | UI05、UI12 | — | — |
| UI15 | UI 設計島綜合專題：重新設計一個畫面 | A | UI05、UI07、UI12 | — | — |

#### UX 研究島 `ux-research`／`UX`（15 堂：B 5、I 8、A 2）

**學習目標**：能規劃並執行小型使用者研究，把發現整理成人物誌、旅程、資訊架構與 User Flow，並以可用性測試驗證 wireframe。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| UX01 | 使用者體驗與可用性 | B | — | SA14 | — |
| UX02 | 以使用者為中心的設計流程 | B | UX01 | SA01 | — |
| UX03 | 研究問題、研究計畫與研究倫理 | B | UX02 | — | — |
| UX04 | 使用者訪談 | B | UX03 | SA04 | — |
| UX05 | 問卷與量化研究 | I | UX03 | — | — |
| UX06 | 觀察與情境研究 | I | UX04 | — | — |
| UX07 | 研究資料整理：親和圖 | I | UX04 | — | `case-study-board` |
| UX08 | 人物誌與待完成工作（JTBD） | I | UX07 | — | — |
| UX09 | 使用者旅程地圖 | I | UX08 | — | — |
| UX10 | 資訊架構：分類、標籤、導覽 | I | UX08 | — | — |
| UX11 | 卡片分類與樹狀測試 | I | UX10 | — | — |
| UX12 | User Flow 與任務流程 | I | UX10 | SA06 | `process-model` |
| UX13 | Wireframe：從低擬真到中擬真 | B | UX12 | UI04 | — |
| UX14 | 可用性測試與嚴重度評估 | A | UX13 | IXD12 | — |
| UX15 | UX 研究島綜合專題：一個功能的研究報告 | A | UX09、UX11、UX14 | — | — |

#### 互動設計島 `interaction-design`／`IXD`（14 堂：B 3、I 9、A 2）

**學習目標**：能設計有清楚回饋、可預防錯誤、對鍵盤與輔助科技友善的互動，並用原型測試迭代。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| IXD01 | 可供性、訊號與回饋 | B | — | UX01 | — |
| IXD02 | 心智模型與一致性 | B | IXD01 | — | — |
| IXD03 | 原型：低擬真與高擬真 | B | IXD01 | UX13 | — |
| IXD04 | 錯誤預防與錯誤訊息 | I | IXD02 | UI12 | — |
| IXD05 | 表單設計 | I | IXD04 | WEB04 | — |
| IXD06 | 載入、空狀態與進度 | I | IXD01 | — | — |
| IXD07 | 導覽模式 | I | IXD02 | UX10、MOB02 | **mobile-nav-sim** |
| IXD08 | 無障礙原則：POUR 與 WCAG | I | IXD01 | UI10、WEB13 | **a11y-checker** |
| IXD09 | 鍵盤與螢幕閱讀器的使用情境 | I | IXD08 | FE13 | **a11y-checker** |
| IXD10 | 目標尺寸、Fitts 定律與手勢設計 | I | IXD01 | MOB03 | — |
| IXD11 | 動效：時間、緩動與減少動態 | I | IXD06 | — | — |
| IXD12 | 原型測試與迭代 | A | IXD03 | UX14 | — |
| IXD13 | 介面文案與微文案 | I | IXD04 | — | — |
| IXD14 | 互動設計島綜合專題：可存取的互動原型 | A | IXD05、IXD09、IXD12 | — | — |

#### 設計系統島 `design-systems`／`DSY`（12 堂：B 2、I 6、A 4）

**學習目標**：能定義分層的 Design Tokens 與元件規格，撰寫文件並規劃版本與治理，讓設計與程式保持同步。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| DSY01 | 什麼是設計系統 | B | — | UI01 | — |
| DSY02 | Design Tokens：色彩、字體、間距 | B | DSY01 | UI04、UI09 | **design-token-board** |
| DSY03 | Token 分層：基礎、語意、元件 | I | DSY02 | — | **design-token-board** |
| DSY04 | 主題與多品牌 | I | DSY03 | UI13 | **design-token-board** |
| DSY05 | 元件解剖：結構、變體、狀態 | I | DSY02 | UI12 | — |
| DSY06 | 元件 API 規格：屬性與組合 | I | DSY05 | FE06 | — |
| DSY07 | 把無障礙內建到元件 | I | DSY05 | IXD08、FE13 | **a11y-checker** |
| DSY08 | 設計系統文件 | I | DSY05 | — | — |
| DSY09 | 版本、變更紀錄與廢棄 | A | DSY08 | — | — |
| DSY10 | 設計到程式：Token 輸出管線 | A | DSY03 | FE04 | — |
| DSY11 | 治理與貢獻流程 | A | DSY09 | — | — |
| DSY12 | 設計系統島綜合專題：一個迷你設計系統 | A | DSY04、DSY07、DSY10 | — | — |

### 2.5 網頁與應用開發群島（`web`）大綱

#### 網頁基礎島 `web-foundations`／`WEB`（15 堂：B 7、I 6、A 2）

**學習目標**：能用語意 HTML、CSS 與原生 JavaScript 做出可存取、可互動、能向 API 取資料的網頁，並說明瀏覽器如何載入它。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| WEB01 | 網頁如何運作：瀏覽器、HTML、CSS、JS | B | — | CN12 | — |
| WEB02 | HTML 文件結構與語意元素 | B | WEB01 | — | — |
| WEB03 | 文字、連結、圖片與媒體 | B | WEB02 | — | — |
| WEB04 | 表單元素與原生驗證 | B | WEB02 | IXD05 | — |
| WEB05 | CSS 選擇器、串接與特異性 | B | WEB02 | — | — |
| WEB06 | 盒模型與一般排版流 | B | WEB05 | — | — |
| WEB07 | 定位與堆疊順序 | I | WEB06 | — | — |
| WEB08 | JavaScript 與 DOM：選取與修改 | B | WEB02、F13 | F02、F05、F07 | — |
| WEB09 | 事件與事件委派 | I | WEB08 | — | — |
| WEB10 | 非同步 JavaScript：Promise 與 async／await | I | WEB09 | — | — |
| WEB11 | fetch、JSON 與 API | I | WEB10 | CN12、CN14、DB16 | `protocol-sequence` |
| WEB12 | 瀏覽器儲存：localStorage 與 Cookie | I | WEB10 | CN18 | — |
| WEB13 | 語意 HTML 與 ARIA 的無障礙實作 | I | WEB04、WEB09 | IXD08 | **a11y-checker** |
| WEB14 | 網頁效能基礎：載入與 Core Web Vitals | A | WEB07、WEB11 | CN15 | — |
| WEB15 | 網頁基礎島綜合專題：無框架的小型網站 | A | WEB11、WEB13 | — | — |

#### 前端開發島 `frontend`／`FE`（15 堂：B 3、I 8、A 4）

**學習目標**：能用 TypeScript、React 與 Next.js App Router 建立有型別、可測試、可存取的元件與頁面。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| FE01 | 為什麼需要框架與元件 | B | WEB09 | — | — |
| FE02 | TypeScript 基礎型別 | B | WEB08 | — | `type-checker` |
| FE03 | TypeScript 介面、聯集與泛型 | I | FE02 | PL04 | `type-checker` |
| FE04 | 模組與建置工具 | I | FE02 | — | — |
| FE05 | React 元件與 JSX | B | FE01 | — | — |
| FE06 | Props 與 State | I | FE05 | DSY06 | — |
| FE07 | 事件、表單與受控元件 | I | FE06 | IXD05 | — |
| FE08 | Effect 與資料取得 | I | FE07、WEB11 | — | — |
| FE09 | 狀態管理與資料流 | A | FE08 | — | — |
| FE10 | Next.js App Router：路由與版面 | I | FE06 | — | — |
| FE11 | Server／Client Components 與渲染策略 | A | FE10 | WEB14 | — |
| FE12 | 前端測試：單元與元件測試 | I | FE07 | SA16 | — |
| FE13 | 可存取的元件實作 | I | FE07、WEB13 | DSY07、IXD09 | **a11y-checker** |
| FE14 | 串流 UI 與 AI 介面 | A | FE08 | LLM09、AG03 | — |
| FE15 | 前端開發島綜合專題：Next.js 應用 | A | FE11、FE12、FE13 | — | — |

本節與 §2.4 所有跨島課號（例如 PL04 型別系統、SA06 使用案例建模、CN14 REST API 與 JSON、DB16 程式串接資料庫與 ORM）都已以 `planning-data.json` 與 80 堂課綱核對存在；島內先修只指向較小的課號。

#### 響應式設計島 `responsive-design`／`RWD`（12 堂：B 4、I 6、A 2）

**學習目標**：能用 Flexbox、Grid、Media／Container Query 與流體尺寸，做出從手機到桌機都可用的版面。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| RWD01 | 響應式原則與行動優先 | B | WEB06 | — | **responsive-sim** |
| RWD02 | viewport 與相對單位 | B | RWD01 | — | **responsive-sim** |
| RWD03 | Flexbox 基礎：主軸與交錯軸 | B | WEB06 | — | **flexbox-playground** |
| RWD04 | Flexbox 進階：伸縮、換行與對齊 | I | RWD03 | — | **flexbox-playground** |
| RWD05 | CSS Grid 基礎 | B | WEB06 | UI05 | **grid-playground** |
| RWD06 | CSS Grid 進階：區域與自動排列 | I | RWD05 | — | **grid-playground** |
| RWD07 | Media Query 與斷點策略 | I | RWD02 | — | **responsive-sim** |
| RWD08 | Container Query | I | RWD07 | DSY05 | **responsive-sim** |
| RWD09 | 流體字級與 `clamp()` | I | RWD02 | UI06 | — |
| RWD10 | 響應式圖片與媒體 | I | RWD07 | WEB14 | — |
| RWD11 | 響應式導覽與表格 | A | RWD04、RWD07 | IXD07、UI14 | **mobile-nav-sim** |
| RWD12 | 響應式設計島綜合專題：一頁跨裝置版面 | A | RWD06、RWD08、RWD11 | — | — |

#### 行動應用島 `mobile-apps`／`MOB`（13 堂：B 2、I 8、A 3）

**學習目標**：能設計並實作符合行動情境的介面與觸控互動，做出可安裝、可離線的 PWA，並在模擬器與真機上驗證。

| # | 課 | 難度 | 先修 | 跨群島 | 實驗 |
|---|---|---|---|---|---|
| MOB01 | 行動情境與限制 | B | RWD01 | CN04 | — |
| MOB02 | 行動 UI 模式：Tab bar、Drawer、Bottom sheet | B | MOB01 | IXD07 | **mobile-nav-sim** |
| MOB03 | 觸控目標與手勢的實作 | I | MOB02 | IXD10 | — |
| MOB04 | Pointer Events 與觸控事件 | I | MOB03、WEB09 | — | — |
| MOB05 | 行動表單與虛擬鍵盤 | I | MOB02、WEB04 | IXD05 | — |
| MOB06 | 安全區域、方向與動態視窗高度 | I | RWD07 | — | **responsive-sim** |
| MOB07 | 原生、跨平台與 PWA 的選擇 | I | MOB01 | — | — |
| MOB08 | PWA 基礎：Manifest 與安裝 | I | MOB07、WEB11 | — | — |
| MOB09 | Service Worker 與離線 | A | MOB08 | CN15 | — |
| MOB10 | 行動效能與省電 | A | MOB06 | WEB14 | — |
| MOB11 | 行動無障礙：螢幕閱讀器與縮放 | I | MOB02 | IXD08、WEB13 | **a11y-checker** |
| MOB12 | 行動裝置測試：模擬器與真機 | I | MOB06 | FE12 | — |
| MOB13 | 行動應用島綜合專題：一個可離線的 PWA | A | MOB05、MOB09、MOB11 | — | — |

**為什麼沒有填滿 15 堂**：IXD 少 1 堂（觸控的實作併入 MOB）；DSY 少 3 堂（圖示規範併入 UI11、元件程式碼留給 FE，不重複）；RWD 少 3 堂（版面工具只有這些核心主題，再拆會變成同一個屬性各一堂）；MOB 少 2 堂（推播與背景同步受平台限制大、教學價值低，原生 App 開發不在範圍）。

### 2.6 重新計算的數量

| 區域 | 學科島 | 課（規劃） | Complete | Planned |
|---|---:|---:|---:|---:|
| `cs` 程式與資訊 | 8 | 160 | 80 | 80 |
| `ai` AI 人工智慧 | 7 | 160 | 0 | 160 |
| `design` 數位設計 | 4 | 56（15＋15＋14＋12） | 0 | 56 |
| `web` 網頁與應用開發 | 4 | 55（15＋15＋12＋13） | 0 | 55 |
| **合計** | **23**（＋1 互動實驗島） | **431** | **80** | **351** |

- 這是**規劃數量**，不是承諾的教材數。D3：課數可以在藍圖審查時再減少。
- 23／431 只會寫在兩個地方：藍圖資料（每島的課）與 `ISLAND_TAXONOMY.md` 的說明表。程式不再寫死總數（§5.3）。
- 不採用任何「15 islands／320 lessons」常數。

### 2.7 跨群島學習路線（候選，需另行批准後寫入 `learning-paths.json`）

| 路線 | 組成 | 成果 |
|---|---|---|
| G 前端工程 | F（F02、F05、F07、F13）→ WEB → RWD → FE → MOB；建議 UI01–UI10、IXD08 | 可存取、響應式的 Next.js 網站 |
| H 產品設計 | UX → UI → IXD → DSY；建議 WEB01–WEB06、RWD01–RWD07 | 從研究到原型，交付迷你設計系統 |
| I AI 產品開發 | FE01–FE14 → 既有路線 F（AI 應用工程）；建議 UX01–UX04、IXD06 | 有良好介面的 LLM／Agent 應用 |
| J AI 架構師 | AG12–AG13、AG17–AG24、OPS03、OPS13–OPS19、LLM20、LLM24（含先修） | 能做模型與工具的架構決策、安全與評估；對應 CCAR-F 的範圍（§2.2） |

既有 6 條路線（A–F）不變。

---

## 3. AI 群島可見性

### 3.1 四種狀態分開

| 類別 | 內容 | 證據 |
|---|---|---|
| **已存在的資料** | `ai` 區域、7 座島的 `IslandConfig`（名稱、說明、代碼、前綴、課數、`status: 'planned'`）；160 堂大綱 metadata（標題、目標、概念、先修、活動）；6 條路線中的 E、F；AI 區六角佈局；LLM 島 GLB 的節點契約（沒有 GLB 檔） | `islands.ts`；`planning-data.json`；`region-layouts.ts:53-80`；`glb-island-contract.ts:89-100` |
| **已規劃未完成** | 160 堂 AI 課，**0 堂有教材、0 堂有頁面**（`catalog.ts` 只給 complete 的課 `href`） | `catalog.ts:47-52` |
| **已可使用的功能** | 沒有 AI 課程可用。與 AI 相關、可用的只有模擬考試：iPAS（200 題）與 CCAR-F（150 題，非官方練習）——**但也在 trials flag 之後** | `entries.ts:11-12`；`src/lib/trials/flag.ts:6` |
| **受 Feature Flag 控制** | `/world`、`/world/ai`（`LOGIC_ISLAND_REGIONAL_WORLD=1`，noindex，頁首無連結）；`/trials` 全部（`LOGIC_ISLAND_TRIALS=1`） | `src/lib/world/flag.ts:7`；`header.tsx:13` |

使用者在正式入口（`/`、`/curriculum`、`/learn`、側欄）目前**完全看不到 AI 群島**。

### 3.2 最小可行導覽方案（P2-A）

目標：讓使用者知道 AI 群島存在，且一眼看出「規劃中、尚未開放」。不移除、不改任何 Feature Flag。

| # | 位置 | 做法 | 不做 |
|---|---|---|---|
| 1 | `/curriculum` 目錄頁 | 在 4 座已開放島之後加一段「更多群島（規劃中）」，錨點 `#region-ai`；一張區域卡列出 7 座島：代碼、名稱、規劃課數、「規劃中」標籤；3 個導覽分組（§2.2）當小標題 | 不列 160 堂課名（避免看起來像課表）；不產生任何 `/curriculum/<AI slug>` 頁面；頁首「80 堂課」數字不變 |
| 2 | 側欄 `/curriculum` 樹 | 在現有島之後加一列「AI 人工智慧群島 · 規劃中」，展開後是 7 列**停用項目**（沿用考試樹的 `NavDisabled` 樣式與語意），點區域標題到 `/curriculum#region-ai` | 不預設展開；停用列不是連結、不在 Tab 順序中 |
| 3 | 考試（僅 trials flag 開啟的建置） | 區域卡下方一行：「相關模擬考試：iPAS AI 應用規劃師、CCAR-F（題目練習，不是課程）」連到 `/trials/<exam>` | flag 關閉時不出現；不改題庫 |
| 4 | 首頁 `/` 與 `/world` | **不變** | 不在 3D 首頁加 AI 島；不改 `/world` 的 flag |

為什麼可以在 P1 之前做：AI 的資料已經存在，這個方案只讀現有資料（`islandsInRegion('ai')`、`islandOf`），不依賴 P1 的型別變更。P1 完成後，同一段會自動列出 `design`、`web` 兩區（資料驅動），不需另寫。

驗收：沒有新路由（`generateStaticParams` 結果與之前相同）；停用列不可聚焦為連結；畫面文字一律寫「規劃中」或「尚未開放」；80 堂與 6 Lab 的頁面與側欄行為不變；桌機、手機寬度截圖。

---

## 4. 互動實驗島（Phase 3）

### 4.1 定位

`labs` 島在資料上已是跨群島工具島（`types.ts:16`、ISLAND_TAXONOMY §4）。限制在實作：`/learn` 的 Lab 必須是 `Course`（演算法）。v2 的做法是讓新實驗**不經過** `Course`、`engine.ts`、`lab.tsx`；這三個檔案在所有階段都不修改。

### 4.2 五個設計問題

| # | 問題 | 設計 |
|---|---|---|
| 1 | 多對多 | 課程端：既有 `activity`（課內活動）與 `labs`（連到實驗島）。實驗端：`ActivityMeta.subjects` 由課程反推，不在實驗端另存課程清單 |
| 2 | 從不同群島進入 | 一個實驗一個路由 `/learn/<slug>`；各區課程指向它；`?from=<lessonSlug>` 只決定「返回課程」連結 |
| 3 | 重用 | 演算法 Lab 繼續用 `lab.tsx`＋`engine.ts`；新實驗是新元件，以 `next/dynamic` 延遲載入；能用課程端 20 種視覺化的就用（T0） |
| 4 | 新類型 | 見 §4.4：活動 registry 加一個可選欄位描述「在實驗島有獨立入口」，元件依活動 id 對應 |
| 5 | 狀態 | `availability: 'implemented' \| 'planned'`；planned 不產生路由、在 `/learn` 與側欄為停用列 |

### 4.3 實驗清單

| 群島 | 實驗 | tier | 活動 id | 用在哪些課（§2.4–2.5） |
|---|---|---|---|---|
| 程式與資訊 | Array／Stack／Queue、Sorting／Searching、BFS | — | `lab:*`（6 個，已完成） | 不動 |
| | Graph Visualization | T0 | `lab:bfs`＋`graph-traversal` | 先用既有元件 |
| UI／UX | Color Contrast Playground | T1 | **`color-contrast`** | UI08、UI09、UI10、UI13 |
| | Visual Hierarchy Experiment | T1 | **`visual-hierarchy`** | UI02、UI03 |
| | User Flow Simulator | T1 | `process-model`（既有） | UX12 |
| | Accessibility Checker | T1 | **`a11y-checker`** | IXD08、IXD09、DSY07、WEB13、FE13、MOB11（只檢查預備的範例片段） |
| | Design Token Board | T1 | **`design-token-board`** | DSY02–DSY04 |
| 網頁與行動 | Flexbox Playground | T1 | **`flexbox-playground`** | RWD03、RWD04 |
| | CSS Grid Playground | T1 | **`grid-playground`** | UI05、RWD05、RWD06 |
| | Responsive Layout Simulator | T1 | **`responsive-sim`** | RWD01、RWD02、RWD07、RWD08、MOB06 |
| | Mobile Navigation Simulator | T1 | **`mobile-nav-sim`** | IXD07、RWD11、MOB02 |
| AI | Neural Network Visualization | T1 | DL 島大綱既有的活動 id（P5 時核對） | DL01–DL06 |
| | Prompt Playground | T3 | `prompt-lab`（既有） | LLM10（預錄回應，不呼叫真實 LLM） |
| | Embedding Similarity Explorer | T3 | `embedding-space`（既有） | LLM03 |
| | RAG Pipeline Visualization | T3 | `rag-explorer`（既有） | LLM14–LLM17 |

### 4.4 87 項活動 registry 能否支援跨領域實驗

**結論：能，而且應以它為唯一來源；P1 不需要改它，P5 只需加一個可選欄位。** 依據（`src/content/world/activities.ts`）：

| 檢查 | 現況 | 對跨領域的意義 |
|---|---|---|
| 規劃中活動從哪來 | `plannedEntries` 由 `catalogLessons` 的 `activity` 欄位**推導**（`:123-133`），tier／inputs 查 `PLANNED` 表，沒有就用 T1 預設 | 新區域的課只要在藍圖寫 `activity: 'color-contrast'`，registry 就自動出現該活動，**不需另建清單** |
| 與島的關係 | `subjects` 由課程反推，並驗證每個 subject 是存在的島（`:156`） | 多對多已成立；P1 新增島後即可通過驗證 |
| 狀態 | 有任何 complete 的課使用它即 `implemented`，否則 `planned`；版本 0.x／1.x 與狀態互相檢查（`:130-132, 153`） | 「規劃中」由資料決定，不會手寫錯 |
| 輸入類型 | `preset`、`custom-values`、`parameters`、`text`、`sql`、`code`、`diagram` | 本文件的新實驗都能用既有輸入表示（例如 color-contrast 為 `custom-values`、flexbox 為 `parameters`），**不需新增輸入類型** |
| 無障礙 | 每項都要 `textAlternative`，planned 帶「實作時必須提供」的要求 | 適用於設計類實驗 |
| **限制 1** | `type: 'lab'` 只由 `algorithmIds` 產生（`:80-84`），而且驗證規定 lab 不能是 planned（`:151`） | 新實驗**不要**做成 `type: 'lab'`（那會綁回演算法引擎）。P5 改為在 `type: 'activity'` 上加可選的 `standalone?: { slug: string }`，表示「也在實驗島有獨立入口」；`subjects` 再加上 `labs` 島 |
| **限制 2** | registry 是 metadata，不負責對應元件 | 元件對應放在 P5 的實驗頁（依活動 id 延遲載入），不放進 registry，保持「資料不含程式」 |
| 測試的寫死數字 | `tests/world-paths.test.ts:98` 斷言規劃中活動 61 個 | P1b 加入新大綱後會變成 69（新增 8 個 id：color-contrast、visual-hierarchy、a11y-checker、design-token-board、flexbox-playground、grid-playground、responsive-sim、mobile-nav-sim），測試要改成依資料計算或同步更新 |

六個演算法實驗的 `engine.ts`、`lab.tsx`、`courses.ts` **不擴充、不修改**。

---

## 5. 側欄、資料模型與驗證

### 5.1 側欄（方案 B，已確認）

| 方案 | 優點 | 缺點 |
|---|---|---|
| A 全站一棵樹 | 一致 | 至少 5 層；全部課程送到瀏覽器；3D 首頁被擠壓 |
| **B 共用外層＋頁面專屬樹（採用）** | 每頁只送需要的樹；可控制在 3 層；與目前 `AppShell` 相同，增量最小 | 跨區塊要經上段入口 |
| C 群島導覽與課程導覽分離 | 群島切換可視覺化 | 兩套導覽與 ARIA，正是要避免的 |

層級：上段固定為「◀ 返回 3D 世界」「學習群島（4 區，planned 標示）」「學習工具（互動實驗島、模擬考試）」；下段為目前區塊的樹，`/curriculum` 是「區域 → 島 → 難度 → 課」，AI 區多一層分組（§2.2）但預設展開；planned 的島只有一列停用項。首頁 `/` 與 `/world` 不掛側欄。

### 5.2 資料模型變更（P1）

沿用既有型別，不新增 `Archipelago` 或 `LearningIsland` 平行型別。

```ts
// src/content/world/types.ts
export const REGION_IDS = ['cs', 'ai', 'design', 'web'] as const;   // 只附加，不改既有順序

/** 導覽用的分組：整座島為單位、每島至多一組；不影響課號、路由與 3D。 */
export interface RegionGroup { id: string; label: string; islandIds: string[] }
export interface Region { id: RegionId; name: string; nameEn: string; order: number; groups?: RegionGroup[] }

// src/content/world/lesson-id.ts —— 附加 8 個前綴，既有 15 個順序不變
export const LESSON_PREFIXES = [/* 既有 15 個 */, 'UI', 'UX', 'IXD', 'DSY', 'WEB', 'FE', 'RWD', 'MOB'] as const;
```

| v2 概念 | 對應 | 存或推導 |
|---|---|---|
| Archipelago | `Region` | 存 |
| Archipelago.islands | `islandsInRegion(id)` | 推導 |
| Archipelago.status（coming soon） | 區內任一島 available／complete → available，否則 planned | 推導，新 helper `regionStatus(id)` |
| LearningIsland | `IslandConfig` | 存 |
| courseIds | `lessonsOfIsland(id)` | 推導 |
| labIds | 課程 `labs`＋活動 `subjects` | 推導 |
| examIds | 題目 `links` 與 `Exam.archipelago` | 推導（P1 不碰 trials） |

### 5.3 驗證：從固定總數改為資料＋規格

**現況的問題**：`validate.ts:9` 的 `EXPECTED`（15 島、`perRegion: { cs: 8, ai: 7 }`、320、`lessonsPerRegion`）每次擴充都要改全域常數，而且常數本身與藍圖資料是兩個來源。

**建議**：`validateWorld` 只檢查**結構不變式**，數量由資料本身決定；「數量有沒有被意外改掉」交給一個明確的快照測試。

| 保留（結構不變式） | 移除 | 新增 |
|---|---|---|
| region id 與 `REGION_IDS` 一致、order 唯一 | `EXPECTED.subjectIslands`、`perRegion`、`lessons`、`lessonsPerRegion` | 每個 region 至少 1 座學科島 |
| 島 id kebab-case、code／prefix／accent 唯一 | `regions` 必須等於 `['cs','ai']` 的寫法改為等於 `REGION_IDS` | `groups`：只引用同區的島、每島至多一組、id 唯一 |
| 每個 `LESSON_PREFIXES` 恰好被一座學科島使用 | | 每座島的 `lessonCount` 等於藍圖中該島的課數（**藍圖就是規格**） |
| 每區 order 為 1..n | | 區域狀態只能推導、不能手寫 |
| `lessonCount` 1..29；lessonId 01..n 連續；島狀態由課推導 | | — |
| 工具島恰好 1 座（這是架構規則，不是規模數字） | | — |

快照測試（`tests/world.test.ts`）：保留**一個**斷言，列出每區的島數與課數（目前會是 cs 8／160、ai 7／160、design 4／56、web 4／55）。這個斷言是刻意的關卡：taxonomy 改變時必須同時改這一行與 `ISLAND_TAXONOMY.md`，並在 commit 說明批准來源。其他測試中的 320、260、61 等數字改為由資料計算。

### 5.4 相容性規則

| 項目 | 規則 |
|---|---|
| Stable ID | `regionId`、`islandId` 發布後不改名；顯示名稱可改 |
| 路由 | 仍是 `/curriculum/[slug]`；不新增巢狀路由；區域以 `/curriculum#region-<id>` 定位 |
| 進度 | `logic-island.progress` 以 lessonId 為 key，新前綴不衝突；不遷移 |
| 舊連結 | `/learn/<algorithm>`、`/curriculum/<slug>`、`/?island=<id>`、`/curriculum#island-<id>`、`next.config` 的 `/visualize` 轉址都保持 |
| 3D | 只有 `REGION_LAYOUTS` 有佈局的區域才產生 `/world/<region>`（flag 開啟時）；沒有佈局的區域在世界總覽不給連結 |
| Exam Engine | P1 不修改 `src/content/trials`、`src/lib/trials`；`Exam.archipelago`、`TrialPlace.regionId` 維持 `'cs' \| 'ai'`（是 `RegionId` 的子集，型別相容） |
| Coming Soon | 島 `planned`、課 `planned`（無 href）、活動 `planned`、考試 `planned`：介面一律寫「規劃中」並停用 |

---

## 6. P1 具體實作清單（待批准）

P1 拆成兩個可獨立提交、可獨立回滾的子階段。**兩者都不改任何頁面的外觀**：`/curriculum` 只顯示 `ISLAND_IDS` 的四島、側欄樹來自 curriculum、`/world` 在 flag 之後。

### P1a — 區域無關化與驗證改寫（沒有新資料）

| 檔案 | 變更 |
|---|---|
| `src/content/world/validate.ts` | 依 §5.3 改寫；移除 `EXPECTED` 的規模數字；比對 `REGION_IDS` 而非寫死兩區；新增 groups 與區域狀態檢查（groups 尚無資料時為空） |
| `src/content/world/types.ts` | `RegionGroup`、`Region.groups?`（`REGION_IDS` 在 P1b 才加值） |
| `src/content/world/catalog.ts:60` | `regionId === 'cs' ? 0 : 100` 改為依 `Region.order` 排序（結果對 cs／ai 不變） |
| `src/content/world/index.ts` | 新 helper `regionStatus(regionId)` |
| `src/lib/islands/regions/region-layouts.ts:77` | `Record<RegionId, RegionLayout>` 改 `Partial<Record<…>>`，並提供 `regionHasLayout(id)` |
| `src/app/world/[region]/page.tsx` | `generateStaticParams` 只回傳有佈局的區域；flag 關閉時仍回傳空陣列 |
| `src/lib/world/learning-islands.ts`、`src/components/world/regional-world-explorer.tsx`、`world-overview*.tsx` | 只在有佈局時給區域連結；`OPTIONS` 依有佈局的區域建立 |
| `tests/world.test.ts`、`world-catalog.test.ts`、`world-config.test.ts`、`world-planning.test.ts`、`world-paths.test.ts`、`regional-world.test.ts` | 寫死的 320／260／61 改為由資料計算，保留一個 taxonomy 快照斷言；新增 validate 的負面案例（重複 group、跨區 group、手寫區域狀態） |

驗收（P1a）：
- `pnpm lint`、`tsc --noEmit`、`pnpm test`、`pnpm build` 全部通過（建置在隔離副本執行，見 `docs/handoff/TESTING_STATUS.md`，不污染工作目錄的 `.next`）。
- `catalogLessons` 的 lessonId 順序、`activities` 清單、`generateStaticParams` 產生的路由集合（`/curriculum/*`、`/learn/*`、`/world/*`、`/trials/*`）與 P1a 前**逐項相同**（以腳本輸出前後比對）。
- 80 堂的 `lessonId`／`slug` 清單逐字相同。

### P1b — 新區域、新島與大綱資料

| 檔案 | 變更 |
|---|---|
| `docs/planning/data/curriculum-blueprint.json` | `regions` 加 `design`、`web`；`islands` 加 8 座；`lessons` 加 111 堂大綱（id、slug、中英標題、難度、目標、概念、先修、建議、活動、`exerciseType`、`outcome`、`status: 'planned'`），內容來自本文件 §2.4–2.5，經使用者審查 |
| `src/content/world/planning-data.json` | 以 `node scripts/planning-data.mjs` **重新產生**（不手改），`--check` 通過 |
| `src/content/world/types.ts` | `REGION_IDS` 附加 `design`、`web` |
| `src/content/world/lesson-id.ts` | 附加 8 個前綴 |
| `src/content/world/islands.ts` | `regions` 加兩區（中文名）；AI 區加 `groups`（§2.2）；8 座島由既有 `fromPlan()` 產生（status 自動為 planned） |
| `src/content/world/activities.ts` | `PLANNED` 表加 8 個新活動的 tier／inputs（全為 T1） |
| `tests/world*.test.ts` | 快照斷言更新為四區數字；`parseLessonId` 測 23 個前綴，特別是 `FE01`≠`F`、`DSY01`≠`D`、`UX01`／`UI01`；slug 全站唯一 |
| `docs/planning/ISLAND_TAXONOMY.md` | 數量表改為 23 島／431 堂，加 §2.4–2.5 的島嶼定位與邊界 |

驗收（P1b）：
- 同 P1a 的四項自動檢查全部通過；`validateWorld`、`validateIslandLinks`、`validateActivities` 回傳空陣列。
- **路由集合仍與 P1a 相同**（新課全部 planned，沒有頁面）；`/curriculum`、`/learn`、側欄的 DOM 與 P1a 前相同。
- 新 111 堂的先修只指向存在的課、沒有循環；planned 課沒有 `href`。
- 87 項活動變為 95 項（新增 8 個 planned），既有 87 項的 id、tier、availability 不變。

### 型別相容性

| 變更 | 影響 | 處理 |
|---|---|---|
| `RegionId` 由 2 個變 4 個 | 以 `Record<RegionId, …>` 宣告的物件會編譯失敗：已知只有 `REGION_LAYOUTS` | P1a 先改為 `Partial` |
| `LessonPrefix` 增加 | `formatLessonId`／`parseLessonId` 不受影響；curriculum 的 `LessonId`（`F|D|A|DB`）**不變** | — |
| `Region.groups?` 可選 | 既有讀取 `Region` 的程式不受影響 | — |
| trials 的 `'cs' \| 'ai'` | 子集，可指派給 `RegionId` | P1 不改 |

### 風險與回滾

| 風險 | 機率 | 處理 |
|---|---|---|
| 隱藏的「只有兩區」假設（例如 3D 總覽場景 `world-overview-scene.tsx:76` 寫死 `['cs','ai']`） | 中 | P1a 以 `rg "'cs'\|'ai'"` 逐一盤點；flag 內的 3D 頁維持只畫有佈局的兩區 |
| 寫死數字的測試漏改 | 高（6 個檔案） | P1a 先把數字改成由資料計算，P1b 才加資料 |
| `planning-data.json` 手改造成與藍圖不一致 | 低 | 只用腳本產生，測試中的 `--check` 會失敗 |
| 新大綱品質或與既有課重疊 | 中 | P1b 前由使用者審查 §2.3–2.5；重疊規則寫進 review 清單 |
| 工作目錄有無關的未提交變更 | 已知 | P1 在新分支或獨立 worktree 進行，不混入時段主題的變更 |

回滾：P1a、P1b 各為獨立 commit；任一可 `git revert` 單獨撤回。P1 不改 localStorage 格式、不改路由、不改題庫，撤回不需資料遷移。

### P1 之後

P2-A（§3.2，AI 可見性）可以在 P1 之前或之後獨立做；P2（側欄區域層）、P3（AI 教材）、P4（Design／Web 教材）、P5（第一批實驗，建議 `color-contrast`、`flexbox-playground`、`embedding-space`）、P6（3D）沿用初版的分期與驗收，見下節。

---

## 7. P2–P6 摘要

| 階段 | 範圍 | 相依 | 3D 資產 | 可獨立提交 |
|---|---|---|---|---|
| P2-A | AI 群島最小曝光（§3.2） | 無（P1 後自動含新區） | 不需要 | 可以 |
| P2 | 側欄上段（返回 3D、四區、工具）、區域層、AI 分組、planned 停用列、Breadcrumb 加區域；新區域預覽圖用 `overview.webp`＋「規劃中」，不做假截圖 | P1 | 不需要 | 可以 |
| P3 | AI 第一批教材（建議 AIF01–AIF05 或 LLM 應用軌；依 M3 決策 B 為 Phase F.2）；CCAR-F 題目補 `links` 需走題庫審查流程，**不在本規劃範圍** | P1、P2 | 不需要 | 可以 |
| P4 | Design／Web 第一批教材與路線 G–J 的資料 | P1b、路線批准 | 不需要 | 可以 |
| P5 | 活動 registry 的 `standalone` 欄位、`/learn` 依群島分組、第一批 2–3 個新實驗；6 個舊 Lab 不動 | P1 | 不需要 | 可以（每個實驗一個 commit） |
| P6 | `design`、`web` 的區域佈局與世界總覽，仍在 flag 之後、不換首頁 | P1、M3.1 驗證 | **需要**（另案批准） | 可以 |

---

## 8. 仍需使用者決策

| # | 事項 | 建議 |
|---|---|---|
| Q1 | 批准 P1 實作（P1a 與 P1b 是否一起批准） | 先批准 P1a；P1b 等 Q2 |
| Q2 | 審查 §2.4–2.5 的 111 堂大綱（標題、難度、先修、實驗） | 審查後才寫進藍圖 |
| Q3 | 是否核可 AI 分組改為 3 組（§2.2），「AI 架構」改為學習路線 J | 核可 |
| Q4 | `cs` 區顯示名稱是否由「資訊科學群島」改為「程式與資訊群島」 | 保留 `id: 'cs'`，名稱由你決定 |
| Q5 | P2-A（AI 最小曝光）是否排在 P1 之前 | 可以先做，風險最低、使用者可見效益最大 |
| Q6 | P1 的工作位置：新分支（從 `nav/unified-sidebar` 或 `main`）或獨立 worktree | 從目前 HEAD 開新分支或 worktree，避開未提交的時段主題變更 |

---

## 9. P1b 實作時的修正紀錄（2026-11-12）

依「輕微文字或分類問題可依規劃原則修正並記錄」處理；沒有大規模課綱重組。

1. **跨島引用改為單向**。`validateCatalog` 對必要與建議先修**都**做循環檢查，§2.4–2.5 表格中有幾對互相引用的課（例如 UI10 ↔ IXD08、DSY07 ↔ FE13）會形成循環。規則改為：跨島引用只指向更前面的區域或島（`cs` → `ai` → `design` → `web`，區內依島號），原則先、實作後。因此從藍圖移除下列「指向後面」的建議連結（反方向的連結保留）：UI05→RWD05、UI09→DSY02、UI10→IXD08、UI12→IXD04／FE13、UI13→DSY04、UX14→IXD12、IXD05→WEB04、IXD07→MOB02、IXD08→WEB13、IXD09→FE13、IXD10→MOB03、DSY06→FE06、DSY07→FE13、DSY10→FE04。SA14 不新增連到 UI／UX 的建議（會與 UI01、UX01 形成循環，且不改 CS 既有資料）。
2. **每堂課都有活動 id**。藍圖中沒有任何課使用 `none`，§2.4–2.5 標「—」的課改用既有活動（`case-study-board`、`process-model`、`requirements-board`、`data-explorer`、`pipeline-diagram`、`architecture-diagram`、`protocol-sequence`、`concurrency-timeline`、`memory-inspector`、`metric-explorer`、`decision-simulation`、`tool-call-trace`、`type-checker`、綜合專題用 `challenge-stages`），另新增兩個活動 id：`dom-explorer`（WEB02–WEB09、MOB04：DOM 樹、串接、盒模型與事件）、`react-state-flow`（FE05–FE09：元件、props、state 與資料流）。新活動共 10 個，全部 T1、planned。
3. **Neural Network Visualization** 對應 DL 島既有的 `nn-forward`（與 `backprop-graph`、`training-curves`）。
4. **路線 J**：targets 為 LLM20、LLM24、AG12、AG13、AG17–AG24、OPS03、OPS13–OPS19；加上必要先修後共 66 堂，沒有 ML／DL。路線 G、H、I 仍是候選，未寫入資料。
5. **區域名稱**：`cs` 顯示為「程式與資訊群島」、`ai` 顯示為「AI 人工智慧群島」（使用者 2026-11-12 指定）；`/world` 原型頁與 E2E 文字同步更新。

## 10. 實作紀錄

| 階段 | 內容 | 驗證 |
|---|---|---|
| 基線 | worktree `logic-island-archipelago`、分支 `archipelago/v2`，從公開線 `origin/trials/mvp`（`4cbe587`）開始；cherry-pick 本機側欄 commit `0849c3f`（公開題庫沒有自由練習卷，移除 `paper.free` 兩處）。原本機分支含私人題庫歷史，pre-push hook 會拒絕，故不以它為基底 | tsc、ESLint、Vitest（公開模式 67 檔 1848 通過、9 skip）、build（100 個預先產生路由） |
| P1a | 驗證改為結構規則；`Region.order`、`Region.groups`、`regionStatus`、`taxonomy()`；`REGION_LAYOUTS` 只含有 3D 地圖的區域；路由契約快照 | 同上；路由集合與基線相同 |
| P1b | 4 區域、23 島、431 堂（80 complete、351 planned）；AI 三組；路線 J；10 個新活動 | tsc、ESLint、Vitest 68 檔 1856 通過、build；路由集合不變 |
| P2 | 側欄：區域 → （AI 分組）→ 島 → 難度 → 課；規劃中的課為停用列（不可聚焦、無連結）；上段為世界地圖／學習群島／學習工具；預覽卡標示層級（世界、島嶼、共用工具）；麵包屑加區域；`/curriculum` 加四大群島與各區規劃中的島（大綱預設收合、無連結），AI 群島最小曝光（§3.2）一併完成；內容狀態 `ContentStatus`（已開放／製作中／規劃中）與個人進度分開 | tsc、ESLint、Vitest 1859 通過；瀏覽器實測（1280 桌機、375 手機）：只展開目前區域與島、`aria-current`、抽屜 dialog／Esc／焦點返回、無水平捲動、無 console 錯誤；`e2e/navigation.spec.ts` 14 通過（含所有開放頁面的站內連結檢查）；路由契約不變 |
| P3 | 盤點與可行性：[P3_FOUR_REGION_WORLD_FEASIBILITY](P3_FOUR_REGION_WORLD_FEASIBILITY.md)；`/world` 導覽清單加入 design、web（規劃中、尚無 3D 地圖、連到課綱大綱）；3D 場景、GLB、座標與旗標都不變；建議維持方案 A，方案 B（程式生成的規劃中區域）需重新批准總覽構圖 | 旗標建置（兩旗標）瀏覽器確認：清單 4 區、`/world/design` 404、iPAS／CCAR-F 在公開題庫無試卷時不連結；`regional-world.test.ts` 13 通過 |
| P4 | 實驗島 Lab Registry（`src/content/world/labs.ts`）：6 個學習領域、演算法實驗（讀取 `courses.ts`，引擎不變）與工具實驗、課程關聯由資料推導（多對多）、Understand → Experiment → Build／Think → Visualize → Code；活動 registry 加 `lab` 欄位；第一個工具實驗「色彩與無障礙實驗室」`/learn/color-contrast`（WCAG 2.x 公式、一般／大型文字門檻、非文字元件、最接近的合格色與 CSS）；Responsive Layout Playground、Mobile UX Simulator 等為 planned（無路由） | `tests/contrast.test.ts`（參考值 #767676＝4.54 通過、#777777＝4.48 未通過）、`tests/labs.test.ts`；Vitest 70 檔 1871 通過；路由契約**刻意**新增 `/learn/color-contrast`；瀏覽器（1280／375）輸入、套用、交換、錯誤輸入；`navigation.spec` 16 通過；`player.spec` 19 通過、3 項為既有 P1-11 |
| P5 | 考試整合盤點：[P5_EXAM_ENGINE_INTEGRATION](P5_EXAM_ENGINE_INTEGRATION.md)；題庫、引擎、CI 與公開基線逐檔相同；課程頁不會自動公開考試；缺口（私人題目公開流程、CCAR-F 無 links、iPAS 只有 plannedIslands）列為待決策 | `git diff` 空；路由契約預設建置無 `/trials/*` |
| R1 | 發布安全盤點：分支只比公開線多 8＋R2 的 commits，不含 `.git/info/private-history-commits` 列出的任何 commit、不含私人題庫路徑；T.3J `leak-scan --history origin/trials/mvp..34fdd28`（在含私人題庫的 `logic-island-t3j` 以唯讀執行，350 題、18,220 個片段）乾淨；diff 中沒有金鑰／Token；與 `main` 為 fast-forward 關係、無衝突 | leak-scan exit 0 |
| R2a | P1-11：BFS 圖形上限 270 px、佇列資訊並排（播放鍵 1440×1000 底部 1057→986）；「操作」改以 role 定位（label 文字含選項，`getByLabel(exact)` 不可能命中） | `player.spec` 22/22（原 19＋3 失敗） |
| R2b | 淺色 `--muted` `#6d7d94`→`#5b6b82`（3.55～4.19→4.60～5.43）；行號 4.44→4.95；規劃中側欄列與卡片不再用 opacity；工具卡狀態字改 `--muted` | 6 頁 × 淺／深色掃描所有 `--muted` 文字：最低 4.86／6.15 |
| R3 | 整合驗收：taxonomy cs 8/160、ai 7/160、design 4/56、web 4/55；80 堂已開放課 HTTP 200、351 堂規劃中沒有 href、抽樣頁面無連到規劃中 slug；AI 三組；路線 J 66 堂無 ML／DL；6 個演算法實驗＋`/learn/color-contrast` 200、planned 實驗 404；旗標建置 `/world/design`、`/world/web` 404，iPAS／CCAR-F 不連結；旗標建置 `.next` leak-scan 乾淨；3D 只有型別與側欄 `?island=`（可選）變更，無模型／資產變更 | tsc、ESLint 0；Vitest 70 檔 1871 通過、9 skip（Java 與私人題庫條件）；navigation＋player 38 通過（2 個設計上只跑桌機）；旗標建置 regional-world＋trials＋islands 70 通過、trials-history 6 通過；未執行：4 個需私人題庫 fixture 建置的 trials E2E、真機 |

| P6（五區域） | 第五區域 `sys`（分支 `archipelago/p6-sys`）：6 島 89 堂、路線 K／L／M、5 個 T1 活動、實驗領域 `systems-cloud`；側欄與 `/curriculum` 由資料自動帶入；`/world` 清單自動列為規劃中。詳見 [P6_SYSTEMS_CLOUD_REGION](P6_SYSTEMS_CLOUD_REGION.md) | tsc、ESLint 0；Vitest 1872 通過、9 skip；預設與旗標建置；navigation＋player 38、旗標 E2E 76 通過；`.next` leak-scan 乾淨 |

## 11. 本文件的驗證方式

- 每個現況結論都附檔案與行號，來自兩次唯讀盤點與本輪抽查（`validate.ts:9-120`、`activities.ts:85-157`、`catalog.ts:47-62`、`region-layouts.ts:70-80`、`src/app/world/[region]/page.tsx:17-20`、`scripts/planning-data.mjs:33-44`、`curriculum-blueprint.json` 的欄位、`tests/world*.test.ts` 的寫死數字）。
- AI 分組依據是 `planning-data.json` 中 160 堂 AI 大綱的標題與難度。
- 本輪**沒有**執行 lint、TS、測試或 build；§2.6 的數字是本文件大綱的人工加總（56＋55＝111）。
