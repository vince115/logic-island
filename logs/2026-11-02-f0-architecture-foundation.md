# 2026-11-02 Phase F.0 Multi-Island Architecture Foundation

## 指示範圍

使用者授權實作 Phase F.0：建立可容納 15 座學科島、1 座共用實驗島、320 堂課（60 堂完整、260 堂規劃）與 6 條學習路線的資料架構。**只做 Registry／Types／Validation／Read Helpers**；不新增教材、不改 3D 世界、不重做 UI、不新增依賴。分批建立本地 commit；禁止 Push、Merge、部署，不開始 F.1。

## 起點

- 分支 `phase-d/basics-glb`，HEAD `7f6cb9f`，工作目錄乾淨（只有未追蹤的 `.claude/`）。沒有其他工作階段在本專案執行。
- `pnpm-lock.yaml` 含 `shiki@4.5.0`，但工作目錄的 `node_modules` 沒有；依授權執行 `pnpm install --frozen-lockfile`（只補 44 個套件，lockfile 不變）。
- 留有 2026-10-31 的孤兒 Playwright Chrome（7 組，父行程為 1），不是本輪產生，未處理。

## 架構決定

| 決定 | 內容 | 理由 |
|---|---|---|
| 位置 | `src/content/world/`（ISLAND_CONFIG_DESIGN §4） | 與 `src/content/curriculum` 並列；3D 的 `src/lib/islands` 不動 |
| 單一來源 | 島嶼名稱與描述只在 `world/islands.ts`；課綱 `registry.ts` 的三座島改由它產生（文字相同，有測試） | 不建立重複 Registry |
| 規劃資料流 | `docs/planning/data/*.json` → `scripts/planning-data.mjs`（純函式轉換）→ `src/content/world/planning-data.json`（產生檔）→ `catalog.ts`／`paths.ts` → 未來的頁面 | 規劃檔仍是來源；產生檔不手改，`tests/world-planning.test.ts` 在不同步時失敗（`node scripts/planning-data.mjs --check` 亦可） |
| 完整與規劃分離 | 60 堂仍由 `lessons.ts` 與 `content/*.ts` 提供；260 堂只有 metadata（沒有內容、測驗、練習、頁面、`href`） | 不建立假的內容模組；`/curriculum/[slug]` 仍只產生 60 頁（`dynamicParams = false`） |
| 推導而非手寫 | 島嶼的先修島、使用的活動、課數統計、路線的先修與缺口、活動的學科與可用輸入都由課程資料推導 | 避免兩份資料不同步 |
| 不寫進度 | 解鎖條件只是規則；`meetsCondition` 的進度由呼叫端提供；`progress.ts` 未改 | 靜態設定、課程、進度、3D 狀態四者分開（ISLAND_CONFIG_DESIGN §1） |
| 型別為主 | 不新增 JSON Schema；TypeScript 型別＋驗證函式是唯一規則 | 避免兩套規則分歧（ROADMAP Phase E 原則） |

## 新的 Registry（`src/content/world/`）

| 檔案 | 內容 |
|---|---|
| `lesson-id.ts` | `LESSON_PREFIXES`（15 個）、`AnyLessonId`、`parseLessonId`（完整前綴、錨定 regex）、`formatLessonId`；無任何 import |
| `types.ts` | `Region`、`IslandConfig`（id、kind、regionId、code、order、name、nameEn、description、lessonPrefix、lessonCount、status、theme、entryPoints、links、unlock、labs、version）、`Condition`、`WorldConfig` |
| `islands.ts` | 2 個區域、16 座島：CS 8 座（F、DS、AL、PL、DB、CN、SA、MIS）、AI 7 座（AIF、ML、DL、LLM、GEN、AG、OPS）、互動實驗島（`kind: 'tool'`、無區域、無編號、0 堂、`available`） |
| `index.ts` | `world`、`getIsland`、`islandsInRegion`、`islandByPrefix`、`islandOfLesson` |
| `validate.ts` | `validateWorld`（數量、唯一性、前綴、課數、區域總數、Lesson ID 序列、狀態與課程一致）、`validateIslandLinks`（入口、連結、解鎖） |
| `catalog.ts` | 320 堂的 `catalogLessons`、查詢（ID、slug、島）、`isLearnable`、`lessonHref`、`validateCatalog`（slug 全站唯一、先修存在、必修與建議不重疊、兩種先修合起來無循環） |
| `paths.ts` | 6 條路線、`validatePaths`、`pathsWithLesson`、`pathProgress` |
| `activities.ts` | 87 項活動 metadata、`validateActivities` |
| `records.ts` | `islandRecord`（設定＋推導欄位）、`worldPages`、`meetsCondition`、`isUnlocked` |

狀態用語：島嶼的 `status` 是**內容狀態**（`complete` 全部完成、`available` 部分可用或工具島可用、`planned` 只有大綱），與學習者的進度（`progress.ts` 的 `not-started`／`in-progress`／`completed`）分開；驗證器要求島嶼狀態與其課程的內容狀態一致。

## Lesson ID 解析

- 規則：`^(F|D|A|PL|DB|CN|SA|MIS|AIF|ML|DL|LLM|GEN|AG|OPS)(\d{2})$`，`00` 無效；`DB01` → `DB`＋1，不會是 `D`＋`B01`。
- 現有程式改動：`schema.ts` 的 `LessonId` 型別由 `` `${'F'|'D'|'A'}${string}` ``（`DB01`、`AG01` 會通過型別檢查）改為 `` `${'F'|'D'|'A'}${LessonNumber}` ``；`validateCurriculum` 的 `startsWith` 與挑戰分段的 `/^[FDA]\d{2}$/` 改用 `parseLessonId`。60 堂的 ID、slug、路由、先修不變。
- 測試：320 個 ID 都解析到自己的島；`DB01`／`DL01`／`AIF01`／`AG01`／`D01`／`A01` 逐一確認；`DS01`、`AL01`（顯示代碼不是前綴）、`D1`、`DB001`、`F00`、小寫等全部拒絕。

## 學習路線

- 6 條：A 60 堂（全部完整，唯一可學）、B 86、C 54、D 84、E 142、F 89。
- 每條路線＝目標＋目標的必修先修遞移閉包，依依賴順序；驗證器確認路線**恰好**是這個閉包，因此建議先修不會被改成必修（B 的 13 堂建議先修只列在旁邊）。
- 路線 F（AI 應用工程）：沒有任何 ML／DL 課，路線上每堂課的整條必修鏈也沒有；LLM02、LLM03（tokenization、embedding）在路線上，DL01 只是建議。路線 E 含 50 堂 ML／DL。
- 完成度：`completion` 是內容就緒度（幾堂已完成製作）；學習者的路線進度由 `pathProgress(path, isCompleted)` 在執行期計算，不儲存。

## Activity 合約

- 欄位：id、type（visualization／lab／activity）、subjects（推導）、tier、runtime（由 tier 決定：T0 shared-player、T1 browser、T2 browser-sandbox、T3 precomputed-assets、T4 server）、availability、inputs、accessibility（鍵盤可操作＋文字替代說明）、version。
- 既有 20 種視覺化（T0）與 6 個 Lab（T1）標為 implemented，資料讀自原本的程式；可用輸入由課程資料推導（例如 `stack-queue` 有 playground，所以可輸入自己的值）。
- 規劃的 61 種：T2 只有 `sql-playground`（需新依賴，屆時另行批准）；T3 8 種（diffusion-steps、latent-space、multimodal-pipeline、training-curves、embedding-space、prompt-lab、rag-explorer、eval-dashboard）；其餘 T1；**沒有 T4**（驗證器禁止，Phase F 不做後端）。

## 向後相容

| 項目 | 結果 |
|---|---|
| 60 堂教材、四種語言、測驗、練習、視覺化 | 內容檔與 `lessons.ts` 0 行差異；全部 Vitest（含四語執行）通過 |
| 進度 | `progress.ts` 0 行差異；key `logic-island.progress`、版本 1；以既有格式紀錄測試讀回完全相同 |
| 路由 | `/curriculum`、60 個課程頁、`/learn`、6 個 Lab、`/visualize` 轉址：`src/app` 與 `next.config.ts` 0 行差異；規劃中 slug 為 404 |
| 3D 首頁與受保護路徑 | `src/lib/islands`、`src/components/islands`、`public`、`perf`、`engine.ts`、`courses.ts`、`lab.tsx` 0 行差異；設定中的橋與首頁地圖的橋一致（測試） |
| 規劃文件 | 藍圖、規劃 JSON 與其他規劃文件 0 行差異；只在 `PHASE_F_ROADMAP.md` 的 F.0 下加一段實作狀態註記（文件 commit） |
| 瀏覽器 bundle | 客戶端元件只透過 `schema.ts` 用到 `lesson-id.ts`（無資料）；建置後 `.next/static` 不含規劃資料（以規劃中的 slug 搜尋確認） |

## 驗證結果

| 檢查（隔離副本，HEAD `a7654d3`） | 結果 |
|---|---|
| tsc／ESLint | exit 0／exit 0 |
| 規劃資料同步 | `node scripts/planning-data.mjs --check`：up to date |
| Vitest（全部，JDK 在 PATH） | **1379 passed**／0 skipped（28 個檔案；新增 6 個 world 測試檔 50 項，原 1343 項全部通過、四語程式全部執行） |
| Build | 成功，77 個靜態頁（與 F.0 前相同：沒有為規劃課程產生頁面） |
| 瀏覽器 bundle | `.next/static` 中含規劃 slug（`programming-paradigms`）的檔案：0 |
| E2E（`curriculum.spec.ts`、`navigation.spec.ts`，desktop＋mobile） | **98 passed／2 skipped／0 failed** |
| 受保護路徑（自 `7f6cb9f`） | 3D、Lab、引擎、進度、60 堂內容、`src/app`、`next.config.ts`、`docs/planning`：0 行差異（文件 commit 前） |

E2E 只跑課綱與導覽：F.0 只改資料層（`schema.ts` 的型別與 ID 解析、`registry.ts` 的三座島來源），兩者只被課綱頁使用；首頁、3D、Lab 的檔案沒有變更，所以沒有重跑 E2E 全套（上一輪 `b52b8e9` 全套結果：只有既有 P1-11 的 3 項失敗）。

## 與規劃文件的差異（向後相容的選擇）

- 狀態值為 `complete`／`available`／`planned`（依本輪指示），規劃草案是 `complete`／`planned`／`unannounced`。
- 欄位名稱沿用網站慣例：`name`／`nameEn`／`description`、`regionId`、平鋪的 `lessonPrefix`／`lessonCount`（草案為 `nameZh`、`region`、`courses{}`）；實驗島沒有區域（草案為 `hub`）。
- 16 座島放在一個 `islands.ts`（草案為每島一檔）；`interactiveObjects`、`assets`、`map` 未實作（屬 3D 整合，M1 之後）。
- `schema.ts` 的 `ISLAND_IDS`、`LESSONS_PER_ISLAND` 保留：課綱驗證器只管有內容的三座島；每島課數（20／25）在 world registry。規劃課程上線時（F.1）才移入課綱並擴充驗證器。
- 規劃課程沒有轉入 `lessons.ts`（草案 §7 說「實際上線時」轉換），留在 world catalog。
- 區域中文名稱（資訊科學群島、人工智慧群島）與 12 座規劃島的主題色是本輪暫定，尚未經視覺審查。

## 已知限制

- 沒有任何頁面讀取新的 registry（本階段不要求 UI）；首頁、課綱頁顯示不變。
- 規劃活動的等級與可用輸入是依規劃文件的估計；無障礙欄位對規劃活動是要求，不是已驗證的能力。
- 修改規劃 JSON 後需手動執行 `node scripts/planning-data.mjs`（測試會提醒）。
- Lesson ID 型別允許 01–29；實際範圍由每島 `lessonCount` 驗證。
- P1-11、P1-32、P1-33、P1-34 未處理（本階段範圍外）。
