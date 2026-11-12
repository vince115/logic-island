# Shared Trial System — 01 Repository Audit

> 2026-11-03，Asia/Taipei。**只有分析與文件**：沒有修改正式程式碼、沒有新增依賴、沒有修改 Roadmap 或已批准的決策。
> 起點：分支 `phase-d/basics-glb` @ `5fa8726`。工作樹內有其他工作階段尚未提交的修改（Theme：`globals.css`、`layout.tsx`、`header.tsx`、`curriculum.module.css`、`site-time.ts` 等；M3.1 Regional World prototype：`src/app/world/`、`src/components/world/`、`src/lib/world/`、`src/lib/islands/regions/` 等），本文件**只讀取、不改動**。
> 本文件以實際檔案為準。「現有」指檔案裡找得到；「規劃」指只出現在 `docs/`；兩者分開寫。

## 0. 摘要

| 問題 | 結論 |
|---|---|
| 有沒有考試系統？ | **沒有**。現有的是「每堂課的單選測驗」（`QuizQuestion`＋`Quiz` 元件）與各種練習；沒有題庫、試卷、計時、作答紀錄或成績分析。 |
| 有沒有後端？ | **沒有**。沒有 API route、資料庫、登入；全站是靜態預先產生（`dynamicParams = false`）。學習紀錄只存在瀏覽器 localStorage。 |
| 群島設定能不能直接放試煉入口？ | **不能直接放**。`IslandKind` 只有 `subject`／`tool`；`EntryPoint` 的目標由 validator 限制在 `/curriculum…` 與 `/learn…`；`Condition`（解鎖規則）已有型別與判定函式，但只在測試裡被呼叫。 |
| 可以重用什麼？ | 題目資料的型別風格與驗證模式、`Rich`／`Snippet`／Shiki 高亮、`useProgress` 的儲存模式（版本化、備份、不覆寫新版）、`Condition`／`meetsCondition`、world registry、Lesson ID 解析、sql.js 執行環境、build-time feature flag。 |
| 最大的衝突 | ①「各群島自己的考試入口」與已規劃的「中央挑戰島（APCS Trial）」位置不同；② 四項考試的範圍大多落在**尚未開課**的島（AI 七島、CN／SA／MIS／PL 全部 planned）；③ 靜態網站上題目答案會出現在前端；④ APCS 實作題需要程式判題，目前沒有 OJ。 |

## 1. 實際技術架構

### 1.1 版本與工具（`package.json`，鎖定版本，不升級）

| 項目 | 實際值 |
|---|---|
| 框架 | Next.js 16.4.3（App Router）、React 19.3.1 |
| 語言 | TypeScript 5.9.3，`tsconfig.json` `strict: true`，alias `@/*` → `src/*` |
| 套件管理 | pnpm 12.14.0（`packageManager`）、`pnpm-lock.yaml` |
| 3D | three 0.186.1、@react-three/fiber 9.8.2、@react-three/drei 10.7.9 |
| 其他執行期 | shiki 4.5.0（只在伺服器建置時高亮）、sql.js 1.14.2（Web Worker 內的 SQLite WASM）、motion、lucide-react、Radix Slot、CVA、tailwind-merge |
| 樣式 | Tailwind 4.3.3＋CSS Modules |
| 測試 | Vitest 5.0.5＋jsdom 30＋@testing-library/react；Playwright 1.64.1 |

Next.js 16 有本版特有規約（`AGENTS.md`）；實作階段寫路由前要先讀 `node_modules/next/dist/docs/` 的相關指南，本階段沒有寫程式所以未讀。

### 1.2 路由（`src/app/`）

| 路由 | 用途 | 產生方式 |
|---|---|---|
| `/` | 首頁 3D 世界（五島：基礎、資料結構、演算法、資料庫、互動實驗島） | 靜態 |
| `/curriculum` | 課綱目錄（錨點 `#island-<id>`） | 靜態 |
| `/curriculum/[slug]` | 單堂課（教材、範例、測驗、練習） | `generateStaticParams` 只產生完整課程；`dynamicParams = false` |
| `/learn`、`/learn/[slug]` | 互動實驗島的六個 Lab | 同上 |
| `/visualize/*` | 308 轉址到 `/learn/*`（`next.config.ts`） | — |
| `/islands`、`/islands/legacy`、`/islands/candidate`、`/islands/hex`、`/islands/hex/scale/[variant]` | 3D 世界的正式版、回退版、候選版與實驗頁（受保護） | 靜態 |
| `/world`、`/world/[region]` | **M3.1 prototype，未提交**；只有 build 時 `LOGIC_ISLAND_REGIONAL_WORLD=1` 才存在，否則為 static 404 | 靜態＋flag |

**沒有** `src/app/api/`、`route.ts`、`middleware`／`proxy`、`.env*`；沒有伺服器端資料或使用者身分。F.1e 驗證時 build 產生 97 個靜態頁。

### 1.3 資料存放

| 種類 | 位置 | 說明 |
|---|---|---|
| 互動實驗島教材 | `src/content/courses.ts` | 六個 Lab，固定範例與動畫輸入分離（受保護） |
| 演算法快照引擎 | `src/lib/engine.ts`、播放器 `src/components/lab.tsx` | 受保護 |
| 課綱與課程內容 | `src/content/curriculum/`：`schema.ts`（型別＋`validateCurriculum`）、`lessons.ts`（大綱）、`content/*.ts`（80 個完整課程檔：F／D／A 各 20、DB 20） | TS 模組，build 時打包 |
| 世界設定 | `src/content/world/`：區域、16 座島、320 堂 catalog、學習路線、活動、validator、`records.ts`（含解鎖判定） | 伺服器端資料，元件經 props 接收 |
| 規劃資料 | `docs/planning/data/*.json` → `scripts/planning-data.mjs` 產生 `src/content/world/planning-data.json` | 有 `--check` 同步檢查 |
| 學習者進度 | 瀏覽器 localStorage：`logic-island.progress`（版本 1）、`logic-island.progress.backup` | `src/lib/progress.ts`（純函式）＋`src/components/curriculum/use-progress.ts`（store） |
| 3D 資產 | `src/lib/islands/asset-registry.ts`、GLB node contract | 與本系統無直接關係 |

### 1.4 測試框架與現況

| 層級 | 工具與位置 | 最近一次有紀錄的結果 |
|---|---|---|
| Unit／資料驗證 | Vitest，`tests/*.test.ts(x)`（工作樹 43 個檔案，其中 41 個已提交、2 個是 M3.1 未提交；含 `curriculum.test.ts`、`progress.test.ts`、`world-config.test.ts`、`world-paths.test.ts`） | F.1e：**1562 passed**／0 failed／0 skipped（HEAD `2378d7c`＋F.1e 檔案的乾淨副本） |
| DOM | Vitest＋jsdom＋Testing Library（`tests/player.test.tsx`） | 同上 |
| 程式範例實際執行 | `tests/examples.test.ts`、`curriculum-code.test.ts`、`curriculum-driver.test.ts`（C++／Java／Python／JavaScript，需 JDK） | 同上 |
| E2E | Playwright，`e2e/*.spec.ts`，desktop-chromium＋mobile-chromium（iPhone 13 模擬），`pnpm start` 於 3100 埠 | F.1e：**401 passed／40 skipped／3 failed**（3 項為既有 P1-11 `player.spec.ts`） |
| 效能 | `perf/*.perf.ts`、`perf/device/` | 真機 Not Measured（D.3-4B） |

依 TESTING_STATUS 與專案慣例，build／Vitest／Playwright 都在**隔離副本**執行，避免寫入工作目錄的 `.next` 與 cache。本階段只寫文件，沒有執行任何測試。

> 交接文件（2026-10-29）寫「沒有 .git」；目前根目錄**已有 Git**（branch `phase-d/basics-glb`），以實際狀態為準。

## 2. 現有題目、Quiz、Challenge、Progress、Unlock 盤點

### 2.1 Quiz（每堂課的概念測驗）— 現有

- **型別**（`src/content/curriculum/schema.ts:171`）：

  ```ts
  interface QuizQuestion { id; prompt; code?: { language: Language | 'SQL'; text }; options: string[]; answer: number; explanation }
  ```

  只有**單選題**；沒有複選、是非、填空、配合、題組、配分、難度、知識點標籤、出處或版本欄位。
- **數量**：每堂至少 4 題（`MIN_QUIZ = 4`）。以 `grep "prompt: "` 粗估 80 個課程檔約 470 處（含少數非測驗欄位，**未精確計數**）。
- **驗證**：`validateCurriculum`／`validateDatabaseContent` 檢查選項不重複、答案索引在範圍內、有解析、資料庫課只出 SQL 片段。
- **元件**（`src/components/curriculum/quiz.tsx`）：client component，全部作答後送出、在瀏覽器判分，顯示對錯、正解與解析，可重做。作答內容只在元件 state，**不保存每題作答**。
- **與進度的關係**：送出後呼叫 `recordQuiz` 只存「最佳成績」`{ correct, total, at }`。

### 2.2 Exercise／練習 — 現有

| 類型 | 判定方式 | 位置 |
|---|---|---|
| 程式練習 `Exercise` | **不判題**：`judge: 'none'`（60 處）；測資只在 Vitest 對參考解答執行 | `schema.ts:183` |
| SQL 練習 `SqlExercise` | 瀏覽器內 sql.js 執行，比對結果並用 hidden dataset 再檢查；DDL／DML 用 probes；部分檢查查詢計畫與當機一致性 | `src/lib/sql/*`、`sql-playground.tsx` |
| ER、正規化、交易、備份複寫練習 | 由各自的引擎依意義判定（答案由引擎計算，不寫死在資料） | `src/lib/er`、`normalization`、`txn`、`ops` |

這些練習的結果**都沒有寫入進度**（進度只有閱讀與測驗）。

### 2.3 Challenge — 只有名稱相近的東西

- `ChallengeStage` 型別與 `challenge-stages` 視覺化：用於綜合挑戰課（例如 F20、DB20）的「分段說明」，是教材呈現方式，**不是挑戰或考試機制**。
- `apcsRelevance`（`schema.ts:96`）：每堂課標記 `concept`／`implementation`／`foundation`／`none`，課綱頁與課程頁顯示（`APCS_LABELS`）。註解明定「不對應官方題號、級分或分數承諾」。
- 學習路線 `A-apcs-cs-foundations`（`docs/planning/data/learning-paths.json`）：APCS／資訊科學基礎路線，LEARNING_PATHS 註明「未來的 APCS Trial 挑戰島以此路線為範圍」。
- M3.1 prototype（未提交）的世界總覽顯示文字「中央挑戰島（APCS Trial、AI Capstone）尚未開放」（`src/components/world/world-overview.tsx:54`），沒有連結。

### 2.4 Progress — 現有

- `src/lib/progress.ts`：`Progress = { version: 1, lessons: Record<lessonId, { startedAt, readAt?, quiz?, completedAt? }> }`。
- 完成條件：確認已讀＋測驗答對 ≥ 2/3（`PASS_RATIO`）；完成後不會退回。
- 安全規則：無法解析的資料先備份到 `.backup`；**較新版本的資料唯讀、不覆寫**；private mode 寫不進去就不保存。
- `use-progress.ts`：`useSyncExternalStore`，跨元件、跨分頁同步。
- **缺口**：沒有版本遷移（v1 → v2）的實作，只有「拒絕／備份」；沒有每題作答、作答歷史、耗時；沒有帳號或伺服器同步。歷次階段把 `progress.ts` 列為**受保護路徑**（F.1d 驗證「0 行差異」）。

### 2.5 Unlock — 只有資料層

- `src/content/world/types.ts`：`Condition = { completedLessons } | { completedIslands } | { all } | { any }`；`IslandConfig.unlock?`。
- `src/content/world/records.ts`：`meetsCondition`、`isUnlocked`、`ProgressView`（由呼叫端提供，不讀儲存）。
- `src/content/world/validate.ts:120`：學科島不可有 `unlock`（「subject islands are never locked」）。
- **只在 `tests/world-config.test.ts` 被呼叫**；沒有任何頁面或 3D 元件使用。目前沒有島有 `unlock`。

## 3. 群島設定是否支援新增試煉入口

| 需要 | 現況 | 支援度 |
|---|---|---|
| 一種「試煉」島或入口 | `IslandKind = 'subject' \| 'tool'`；規劃文件（ISLAND_CONFIG_DESIGN）的草案有 `challenge`，**實作沒有** | 不支援 |
| 放在樞紐 | `RegionId = 'cs' \| 'ai'`；工具島沒有 `regionId`；「樞紐」只是 M3.1 prototype 的版面位置（`hubSummary()`），不是 registry 的區域 | 不支援（只有版面概念） |
| 從島嶼連到考試 | `EntryPoint { id, label, target }` 存在，但 `worldPages()` 的合法路由只有完整課程、`/learn*`、`/curriculum`、`/curriculum#island-*`；指向 `/trials/...` 會被 validator 判錯 | 需擴充 validator 的路由集合 |
| 3D 場景的互動點 | 規劃有 `interactiveObjects`（`action: 'challenge'`），**實作的型別沒有**；3D 互動靠 `src/lib/islands/` 的 GLB node contract 與 `interaction-targets.ts` | 不支援 |
| 解鎖試煉 | `Condition` 與判定函式可用，validator 允許非學科島有 `unlock` | **可重用** |
| 主題場景（每個試煉自己的視覺） | 島嶼 `theme: { accent, landmark? }`；3D 是 Transitional Art 或 GLB | 只有色彩與文字；場景要走 M3.x 管線 |

**結論**：要放入口，至少需要三處增補（型別、validator 路由、入口資料），且建議**不要**把試煉硬塞成 `IslandConfig` 的一種學科島（會牽動 320 堂計數、`lessonPrefix`、區域內 `order` 等驗證）。比較乾淨的做法在 §4.2 與 §7 的待決事項。

## 4. 可重用元件與需要新增的模組

### 4.1 可直接重用（不改原檔）

| 現有 | 用在 Trial System 的哪裡 |
|---|---|
| `Rich`（行內程式碼）、`Snippet`＋`src/lib/highlight`（Shiki，build 時產生 token） | 題幹、選項與程式碼片段的呈現（程式閱讀題是 APCS 觀念題主力） |
| `QuizQuestion` 的資料形狀與 `validateCurriculum` 的驗證寫法 | 題庫 schema 的基礎型別與題庫 validator 的寫法（新檔，不改原型別） |
| `use-progress.ts` 的 store 模式 | 作答紀錄 store：同樣的版本化、備份、新版唯讀、跨分頁同步（**另一個 storage key**） |
| `src/lib/progress.ts` 的唯讀 API（`statusOf`、`quizPassed`） | 「建議先讀的課是否已完成」的提示 |
| `Condition`／`meetsCondition`／`ProgressView` | 試煉入口的解鎖或推薦條件 |
| world registry（`getIsland`、`islandOfLesson`、`catalogLessons`）與 `parseLessonId` | 題目 → 知識點 → 課程的連結；validator 檢查題目引用的課是否存在、是否已完成製作 |
| 學習路線 `pathProgress` | 「考前複習路線」的進度 |
| sql.js runtime（`src/lib/sql`）與 SQL 判定 | 高普考／銀行資訊類的 SQL 題（實作題型） |
| `apcsRelevance` 標記 | APCS 試煉的範圍與複習連結 |
| build-time feature flag（`src/lib/world/flag.ts` 的模式） | 試煉路由在驗收前不出現在正式 build |
| `curriculum.module.css` 的測驗樣式 | 可參考；**目前是 Theme 工作階段未提交的修改檔**，不要直接改 |

### 4.2 需要新增的模組（建議放在新目錄，不碰受保護檔案）

| 模組 | 內容 | 建議位置（提案） |
|---|---|---|
| **題庫 Schema** | 題型（單選、複選、是非、填空、程式閱讀、題組；APCS 實作題另列）、知識點標籤、難度、對應課程 ID、出處與授權、版本、適用考試 | `src/content/trials/schema.ts` |
| **考試定義（Blueprint）** | 每項考試的科目、題型配比、題數、時間、配分與及格規則、範圍版本與更新日期 | `src/content/trials/exams/<exam-id>.ts` |
| **Exam Engine（純函式）** | 依 blueprint 組卷（固定種子、可重現）、作答狀態機（未開始／作答中／已交卷）、計時、評分、錯題與知識點統計 | `src/lib/trials/` |
| **判題 Adapter** | 介面「題目＋作答 → 結果」；首版：選擇／填空／SQL 前端判定；程式實作題保留介面（ROADMAP Phase G 已要求） | `src/lib/trials/graders/` |
| **作答紀錄（Learning Record）** | 每次作答、每題選擇、耗時、模式（練習／模擬考）；容量上限與清理策略；與課程進度分開 | `src/lib/trials/records.ts`＋新的 localStorage key |
| **題庫 Validator** | ID 唯一、答案合法、解析存在、引用課程存在、出處授權欄位必填、每份 blueprint 可組出 | `src/content/trials/validate.ts`＋`tests/trials-*.test.ts` |
| **路由與 UI** | 試煉大廳、單項考試入口、作答頁、成績與檢討頁 | `src/app/trials/…`（不動既有路由） |
| **入口設定** | 「哪個群島／島有哪些考試入口」的資料，引用 exam ID 與 world island／region ID | `src/content/trials/entries.ts`（不改 `IslandConfig`，或日後再併入） |

## 5. 與 Roadmap、M3.x 的相依關係

### 5.1 既有規劃中與考試相關的內容（不修改，只列出）

| 文件 | 內容 | 狀態 |
|---|---|---|
| ROADMAP（2026-10-29，已被 PHASE_F_ROADMAP 取代為歷史規劃） | Phase G APCS Challenges：原創題、不轉載 APCS 歷屆試題原文；判題以 adapter 隔離；首版判題方式待決；程式自動判題後端需另案批准 | 歷史規劃 |
| PHASE_F_ROADMAP §0、F.6 | 舊 G 併入 **F.6**：中央挑戰島的 APCS Trial、AI Engineering Capstone；只讀進度；獎勵規則要有單元測試；學科不因 RPG 硬鎖；`progress.ts` 版本遷移向後相容 | Planned，未批准 |
| MULTI_ARCHIPELAGO_MASTER_PLAN §5 | APCS Trial 以 F／DS／AL 為範圍、沿用既有練習格式；「練習與正式挑戰分開，挑戰有冷卻但練習沒有」；EXP 只在第一次全對給；解鎖只用於挑戰島 | 規劃 |
| WORLD_EXPANSION_ARCHITECTURE | 樞紐島放互動實驗島與未來的中央挑戰島；M5 RPG 疊加層 → F.6 | 規劃 |
| M3_CS_AI_MASTER_PLAN §10 | 決策 5「互動實驗島規劃為中央樞紐」**批准**；中央挑戰島「先只留位置」 | **已批准** |
| M3_1_REGIONAL_WORLD_ARCHITECTURE | 點中央樞紐 → 互動實驗島與挑戰島（F.6 之前只顯示「規劃中」） | Proposed；prototype 在工作樹、未提交 |

### 5.2 相依關係

```
            （資料與引擎，不依賴 3D）
  題庫 Schema ─→ Exam Engine ─→ 作答紀錄 ─→ /trials 路由與 UI
        │              │
        │              └─ 判題 Adapter（程式實作題：另案、需後端或替代方案）
        └─ 題目 → 課程連結：依賴 Phase F 各島的教材進度（見 5.3）

            （入口與場景，依賴 3D 世界）
  入口設定 ─→ 世界總覽／區域地圖的入口（M3.1 prototype → M3.5 導覽）
          └→ 試煉主題場景的 3D（M3.2 起的 GLB 管線；先用 Transitional Art 或只用清單）

  RPG（EXP、徽章、冷卻）＝ F.6，可以晚於試煉系統，只讀作答紀錄
```

- **不阻擋 M3.x**：試煉系統的核心（題庫、引擎、紀錄、頁面）可以完全不碰 3D；入口先出現在清單與課綱頁，3D 入口等 M3.5。
- **M3.1 進行中**：`/world` 與 `src/lib/world/learning-islands.ts` 是未提交的工作，`hubSummary()` 目前只有互動實驗島。試煉入口若要出現在總覽，需等 M3.1 落地（commit）後再加，避免兩個寫入者改同一檔案。
- **F.6 的關係**：目前 Roadmap 沒有「Shared Trial System」這個階段。它與 F.6 的 APCS Trial 重疊，但範圍更大（四項考試、跨群島入口）。階段編號與 F.6 的切分需要使用者決定（§7）。

### 5.3 考試範圍 vs. 已完成教材

| 考試 | 主要範圍（以一般公開資訊概述，**正式範圍需在下一階段依官方簡章核對**） | 對應的島 | 教材狀態 |
|---|---|---|---|
| APCS | 程式設計觀念、程式實作 | F、DS、AL | **complete**（60 堂，有 `apcsRelevance`） |
| 高普考資訊處理 | 資料結構、演算法、資料庫、網路、資訊管理、系統分析、資安、程式語言 | F、DS、AL、DB、CN、MIS、SA、PL | F／DS／AL／DB complete；**CN、MIS、SA、PL planned（0 堂）** |
| 銀行資訊甄試 | 依各銀行簡章不同，常見資訊概論、程式、資料庫、網路、資安 | 同上 | 同上 |
| iPAS AI 應用規劃師 | AI 概念、生成式 AI 應用、AI 導入規劃 | AIF、ML、LLM、GEN、AG、OPS | **全部 planned（0 堂）** |

影響：題目的「延伸學習」若指向 planned 的課，現有 validator 不讓 planned 課出現為可點頁面；題目可以標知識點，但連結只能指向完整課程或顯示「規劃中」。

## 6. 架構衝突與風險

| # | 衝突／風險 | 說明 | 建議處置 |
|---|---|---|---|
| R1 | **入口位置與已批准規劃不一致** | 新決策「各群島擁有自己的考試入口」；已有規劃把 APCS Trial 放在**中央挑戰島（樞紐）**。M3 §10 已批准的是「互動實驗島為中央樞紐」，挑戰島只「留位置」。 | 兩者可並存（共用引擎在樞紐、各群島有入口），但要使用者決定入口放哪一層（區域、島、樞紐）；不改 §10。 |
| R2 | **考試範圍大多是未開課的島** | iPAS 全落在 AI 群島（0 堂）；高普考／銀行有一半落在 CS planned 島。 | 第一批先做 APCS（教材齊全）；其他考試的題目只標知識點，延伸學習連到已完成教材或顯示「規劃中」。 |
| R3 | **題目著作權** | ROADMAP 已定「APCS 題目原創，不轉載歷屆試題原文」。高普考、銀行、iPAS 的歷屆題授權狀態各不相同，本階段沒有查證。 | 預設全部原創；若要使用官方公開題，逐一確認授權並在題目資料記錄出處；題庫 schema 的出處與授權欄位設為必填。 |
| R4 | **答案在前端** | 靜態網站，題目與答案打包在 JS 或 HTML；現有測驗與 SQL hidden dataset 也是如此。 | 定位為**自我練習**，不宣稱防作弊或正式認證；不做排行榜之類需要可信成績的功能。若需可信成績，要另案的後端。 |
| R5 | **APCS 實作題需要判題** | 程式練習 `judge: 'none'`；沒有 OJ；ROADMAP 註明程式自動判題後端需另案批准。 | 首版只做觀念題與程式閱讀題；實作題只提供題目、範例與參考解答（比照現有 Exercise），判題 adapter 保留介面。 |
| R6 | **進度資料相容性** | `progress.ts` 是受保護路徑，版本 1，沒有遷移實作；舊頁面看到新版會唯讀。 | 試煉紀錄用**獨立 key 與獨立版本**，不改 `Progress` 結構；只讀取課程完成狀態。 |
| R7 | **localStorage 容量** | 每次作答的每題紀錄會累積；瀏覽器約 5 MB，private mode 可能無法寫入。 | 設上限（例如每項考試保留最近 N 次＋最佳成績），超過時摘要化；寫不進去時照常作答、只是不保存（比照現有）。 |
| R8 | **Bundle 與頁數** | 題庫若靜態打包，大題庫會增加 JS；每題一頁會大量增加靜態頁（現在 97 頁）。 | 題庫依考試分 chunk、延遲載入（比照 `sql-lazy.tsx`、`db-lazy.tsx`）；路由以考試為單位，不以題目為單位。實作時量測 bundle（比照 F.1d 的量測方式）。 |
| R9 | **型別擴張觸及世界設定** | 若把試煉做成 `IslandKind: 'challenge'`，會影響 `validateWorld` 的數量、前綴與 order 檢查，以及 M3.1 的 Layout 身分檢查（「Layout 的島嶼集合等於 registry 該區的學科島」）。 | 先以獨立的入口設定引用 world ID；是否在 registry 增加 challenge 島，等 M3.5／F.6 一起決定。 |
| R10 | **多寫入者衝突** | 工作樹有 Theme 與 M3.1 兩組未提交修改（`globals.css`、`layout.tsx`、`header.tsx`、`curriculum.module.css`、`learning-navigation.tsx`、`islands-world.ts`…）。 | 試煉系統首版只新增檔案；需要改共用檔（導覽 header、全域樣式）時，等那些工作提交後再改，並先確認單一寫入者。 |
| R11 | **考試規格會變** | 各考試簡章與範圍會改版（例如 iPAS 為新制考試、APCS 題型與級分制度）。本階段未查官方資料。 | Blueprint 帶「依據的官方文件、版本、核對日期」欄位；頁面標示「非官方模擬」，不承諾分數（比照 `apcsRelevance` 註解）。 |
| R12 | **RPG 規則已有約束** | MASTER_PLAN：練習與正式挑戰分開、挑戰有冷卻、EXP 只在第一次全對給、學科不硬鎖。 | 試煉系統的「練習模式／模擬考模式」直接對應這條規則；EXP 與徽章留給 F.6，只讀試煉紀錄。 |
| R13 | **E2E 既有失敗** | 3 項 P1-11 失敗、多項 3D 測試在高負載下偶發失敗。 | 試煉的 E2E 獨立成 spec，不依賴 3D；驗收時把既有失敗分開報告。 |

## 7. 需要使用者決定的事項（進入下一階段前）

1. **入口的層級**：考試入口放在 (a) 區域（CS／AI 群島各一個試煉入口）、(b) 個別學科島、(c) 中央樞紐的挑戰島＋各區捷徑，或組合？對應四項考試：APCS／高普考／銀行 → CS？iPAS → AI？
2. **階段編號**：Shared Trial System 是新的獨立軌（例如另立代號），還是併入或拆分 F.6？（Roadmap 目前沒有這個階段，本文件不自行編號。）
3. **第一批的順序**：建議先做 APCS（教材齊全、已有 `apcsRelevance` 與學習路線），其餘三項先做 blueprint 與少量原創題驗證 schema。是否同意？
4. **題目來源政策**：全部原創，或允許使用已確認授權的官方公開題？
5. **首版題型**：是否同意首版只做選擇、複選、是非、填空、程式閱讀、SQL 題；程式實作題不判題？
6. **作答紀錄**：是否同意與課程進度分開存（獨立 key），首版只在瀏覽器、沒有帳號同步？
7. **是否解鎖**：試煉是否需要 `Condition` 解鎖，或一律開放、只顯示建議先修？（現有規則：學科不鎖；挑戰島可鎖。）
8. **發布方式**：是否比照 `/world` 使用 build-time feature flag，驗收前不出現在正式 build？

## 8. 本階段的建議

- **把試煉系統分成兩半**：資料＋引擎＋頁面（不依賴 3D、可先做）與入口＋主題場景（依賴 M3.1／M3.5 與 GLB 管線，後做）。
- **不改受保護檔案**：`courses.ts`、`engine.ts`、`lab.tsx`、`progress.ts`、現有 `QuizQuestion` 與課程內容都不動；新功能放在 `src/content/trials/`、`src/lib/trials/`、`src/app/trials/`。
- **下一份文件**（等使用者確認 §7 後）：`02_` 題庫與考試 Blueprint schema 草案、Exam Engine 狀態機與評分規則、作答紀錄格式與容量策略、入口設定與世界 registry 的介接方式、測試計畫（Vitest validator＋引擎；Playwright 作答流程；不依賴 3D）。

## 附錄：本次讀過的主要檔案

- 文件：`CLAUDE.md`、`AGENTS.md`、`docs/handoff/{CLAUDE_HANDOFF,IMPLEMENTATION_STATUS,KNOWN_ISSUES,ROADMAP,TESTING_STATUS}.md`、`docs/planning/{PHASE_F_ROADMAP,MULTI_ARCHIPELAGO_MASTER_PLAN,ISLAND_CONFIG_DESIGN,WORLD_EXPANSION_ARCHITECTURE,M3_CS_AI_MASTER_PLAN,M3_1_REGIONAL_WORLD_ARCHITECTURE,LEARNING_PATHS}.md`、`logs/2026-11-03-m3-1-regional-world-prototype.md`。
- 程式：`package.json`、`next.config.ts`、`playwright.config.ts`、`vitest.config.ts`、`src/app/**/page.tsx`、`src/content/curriculum/schema.ts`、`src/lib/progress.ts`、`src/components/curriculum/{quiz.tsx,use-progress.ts}`、`src/content/world/{types,islands,index,records,validate}.ts`、`src/lib/world/{flag,learning-islands}.ts`、`src/components/world/world-overview.tsx`、`src/lib/islands/types.ts`。
