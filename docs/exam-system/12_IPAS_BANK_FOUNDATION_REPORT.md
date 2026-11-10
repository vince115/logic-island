# 12 iPAS 原創題庫資料基礎報告（T.2B-1）

- **日期**：2026-11-03
- **分支**：`trials/mvp`，HEAD `bfd3569`
- **狀態**：未 Commit、未 Push、未 Merge、未 Deploy
- **範圍**：只建立資料基礎，**沒有新增任何題目**。
- **依據**：[09](09_IPAS_SOURCE_RESEARCH.md)、[10](10_IPAS_TOPIC_BLUEPRINT.md)、[11](11_IPAS_100_QUESTION_PLAN.md)，以及本階段核准的決策：
  - 官方題文授權未確認；
  - 公開題目 100% 原創；
  - 採用考綱 115.06；
  - 每科 50 題；
  - 題型比例 20／20／60；
  - 新題預設 `in-review`。

**標示說明**：
- 「**官方**」：簡章 115.04 版或評鑑內容範圍參考 115.06 明載的內容；
- 「**LI**」：Logic Island 自行訂定。

## 1. 資料設定

### 1.1 考試資料（Task A，`src/content/trials/exams.ts`）

| 項目 | 設定 | 來源 |
|---|---|---|
| 考試 | `ipas-aiap-basic`「iPAS AI 應用規劃師（初級）」（T.0 已有，未改） | — |
| 版本 | `ipas-aiap-basic-115`，標籤「115 年度（評鑑內容範圍參考 115.06）」 | 依據改為三份：簡章、考綱 115.06、官網學習資源頁，皆標示 2026-11-03 核對 |
| 科目 1 | `ipas-aiap-basic-115.s1`「L11 人工智慧基礎概論」 | 官方 |
| 科目 2 | `ipas-aiap-basic-115.s2`「L12 生成式 AI 應用與規劃」 | 官方 |
| 格式（兩科相同） | 50 題、單選、75 分鐘、100 分、70 分及格 | **官方**（簡章 §2.3、§4.2） |
| 授證規則 | 寫在科目 `note`：兩科同時報考須平均 70 分以上且每科不低於 60 分 | **官方** |
| 模擬計分 | 新欄位 `mockScoring`：每題 2 分、70 分及格 | **LI**。`note` 以「Logic Island 模擬計分規則」開頭，並寫明官方沒有公告每題配分或是否倒扣 |

- **科目 id 維持 `.s1`／`.s2`**：
  - 04 Schema 文件的範例已使用這兩個 id；
  - 目前沒有試卷或作答紀錄引用它們。
  - 改名不會有實際好處，所以只更新名稱與格式。

### 1.2 考綱標籤（Task B，`src/content/trials/tags.ts`）

- **數量**：共 16 個，`ipas.l11101`～`ipas.l12303`。
- **不會出現其他代碼**：代碼只來自一個常數表（`IPAS_SYLLABUS`），表內逐字對照考綱 115.06 原文（scratchpad 中的 PDF 文字）。
- **欄位**：每個標籤的 `syllabus` 欄位包含：

| 欄位 | 範例 |
|---|---|
| 官方代碼 `code` | `L11101` |
| 官方名稱 `name` | `AI 的定義與分類` |
| 所屬科目 `subjectId` | `ipas-aiap-basic-115.s1` |
| 上層分類 `parent` | `{ code: 'L111', name: '人工智慧概念' }` |
| 考綱版本 `version` | `115.06` |
| 官方來源 `sourceId` | `ipas-aiap-syllabus-115-06` |
| 對應課程 `lessons` | **全部不設**（理由見下） |

- **顯示名稱**：標籤 `name` 是「代碼＋官方名稱」，例如「L11101 AI 的定義與分類」，成績報告與錯題本會直接顯示。
- **名稱的空白**：官方 PDF 中「AI」前後的空白不一致，例如「鑑別式 AI與生成式AI」。標籤統一寫成「鑑別式 AI 與生成式 AI」，其餘文字不變。
- **對應課程不設**：
  - 16 項都沒有直接教授的完整課程。
  - 10 §3 記錄的 3 個相關課程只是**間接相關**：L11201 對 DB01／F02，L11203 對 DB17。
  - `lessons` 會讓成績報告顯示「建議先複習」的連結，連到不教這個考點的課會誤導考生，所以暫不設定（見 §6 第 2 點）。

### 1.3 來源紀錄（Task C，`src/content/trials/sources.ts`）

| 角色 | 來源 id | 類型／授權 | 用途 |
|---|---|---|---|
| **官方考綱**（命題範圍依據） | `ipas-aiap-syllabus-115-06` | `official-syllabus`／`unconfirmed`，`version: '115.06'` | 只引用代碼與名稱 |
| 官方簡章（格式依據） | `ipas-aiap-brochure-115` | `official-syllabus`／`unconfirmed`，`version: '115.04'` | 題數、時間、及格與授證規則 |
| **Logic Island 原創題**（實際題目來源） | `basis-ipas-aiap-basic` | `original-basis`／`original`，`basedOn: [考綱 115.06, 簡章]` | iPAS 原創題的 `provenance.sourceId` |
| **官方公告試題**（僅供研究） | `ipas-aiap-basic-paper-{114-4,115-1,115-2,115-3}-{s1,s2}`，共 8 份 | `official-paper`／`unconfirmed`，`researchOnly: true`，`version` 為梯次 | 只供研究與統計；**任何題目都不得引用** |

- **網址**：都是官方的完整網址，前綴為 `https://www.ipas.org.tw/api/proxy/uploads/…`，檔名與 09 §0、§2 相同。
- **保留的舊來源**：T.0 的 `ipas-aiap-official-site`（學習資源頁）仍是考試的官方連結，沒有更動。

## 2. Schema 變更（Task D）

### 2.1 欄位

| 需求 | 結果 | 位置 | 說明 |
|---|---|---|---|
| `reviewBy` | **實作**，但放在題目層級而不是版本 | `Question.reviewBy` | 已發布的 revision 不能修改，複查日期卻需要隨審稿更新。所以把 T.0 版本層級的 `reviewBy`（從未使用）移到題目層級：更新日期不新增版本、不改雜湊 |
| `stemShape` | **實作**，名稱照需求，值為 `concept`／`application`／`scenario` | `Question.stemShape` | T.0 已有同名欄位，但是語意不同：它是版本層級的陣列，值為 `scenario`／`negative`／`regulation`／`matching-in-options`，而且從未使用。為了不讓同名欄位有兩種意思，**舊欄位改名為題目層級的 `stemTraits`**，保留 `negative`／`regulation`／`matching-in-options`；`scenario` 已由 `stemShape` 表達，所以拿掉 |
| `plannedIslandLinks` | **不新增欄位，改用既有的 `links.plannedIslands`**（替代方案） | `Question.links.plannedIslands` | T.0 schema 已有同義欄位，validator 也已檢查島是否存在。缺的只有匯入格式，所以在 `ImportQuestion` 加上 `plannedIslands` |
| 模擬計分（Task A 需要） | 新增 | `ExamSubject.mockScoring` | 見 §1.1 |
| 考綱標籤（Task B 需要） | 新增 | `Tag.syllabus`（`SyllabusItem`） | T.2A 的 G1 原本建議方案 A（只用 tag id，不改程式），但 Task B 要求每個標籤記錄 6 項資訊，所以改採方案 B |
| 來源角色（Task C 需要） | 新增 | `Source.version`、`Source.basedOn`、`Source.researchOnly` | 見 §1.3 |

- **匯入格式**：`ImportQuestion` 新增 `stemShape`、`stemTraits`、`reviewBy`、`plannedIslands`，都是選填。
- **格式版本**：仍是 `logic-island.trials-import/1`，舊批次不受影響。

### 2.2 驗證規則（`validateTrials`；匯入流程另做形狀檢查）

| 對象 | 規則 |
|---|---|
| `stemShape` | 只能是 `concept`、`application`、`scenario` |
| `stemTraits` | 只能是三個值之一，且不重複 |
| `reviewBy` | 必須是真實存在的日期（`YYYY-MM-DD`；`2026-02-30`、`2027-13-01` 都會被拒），且晚於題目第一版的日期 |
| `links.plannedIslands` | 島必須存在（既有規則）、不得重複（新） |
| `mockScoring` | 每題分數大於 0，最多兩位小數；每題分數 × 官方題數 = 官方總分；及格分在總分以內；`note` 必須寫明是 Logic Island 的規則 |
| 試卷（日後組卷） | 試卷的每題分數或及格分和科目的 `mockScoring` 不同時，必須用 `note` 說明 |
| `Tag.syllabus` | 代碼為 L 加 5 位數字，並在 L 加 3 位數字的主題之下；tag id 以小寫代碼結尾；名稱不得空白；科目存在；來源必須是 `official-syllabus`，且 `version` 與來源一致 |
| `Source.basedOn` | 只有 `original-basis` 可以設定；所列來源必須是 `official-syllabus` |
| `Source.researchOnly` | 只能用於授權未確認的官方文件；**任何題目都不得以它為來源**。validator 與匯入流程都會擋 |

### 2.3 到期複查

- **函式**：`overdueReviews(questions, today)` 列出 `reviewBy` 早於今天的題目；已退役的題目不列。
- **匯入時**：匯入 CLI 以本機日期呼叫它，結果只出現在匯入報告的「警告」。
- **不改資料**：警告**不會**改變題目、答案、狀態或任何版本。
- **測試證明**：同一批次在到期前後的輸出完全相同（`trials-ipas-foundation.test.ts`）。
- **歷史成績**：作答紀錄存在瀏覽器，評分依 `revisionHash`；新欄位都不在雜湊內，所以不影響歷史成績。

### 2.4 對既有資料的影響

- **既有 53 題沒有任何改變**：
  - 兩個批次重新 dry-run，結果都是「未變更」（13＋40 題），錯誤、警告與題庫驗證問題都是 0；
  - 隔離副本產生的 `generated/*.json` 與 repo 中的版本逐位元組相同；
  - `published-hashes.json` 也逐位元組相同。
- **雜湊不變**：57 個已發布版本的雜湊全部吻合，不吻合數為 0。
- **被移除或改名的舊欄位**：版本層級的 `stemShape` 與 `reviewBy` 在全部資料與程式中都沒有被使用（以 grep 確認），所以移除或改名不影響任何題目。

## 3. 測試結果（Task E）

- **執行環境**：全部在隔離副本中執行：`git archive HEAD`，再複製本次修改的檔案。不含 Theme Session 的 5 個檔案，也不寫入 repo 的 `.next` 或快取。
- **為何不在 repo 跑 tsc**：repo 的 `.next/types` 有其他 Session 留下的過期型別（`/visualize`），在 repo 直接跑 tsc 會因此失敗，與本次修改無關。

| 檢查 | 結果 |
|---|---|
| TypeScript `tsc --noEmit` | 通過（0 錯誤） |
| ESLint | 通過（0 錯誤、0 警告） |
| Vitest 全套 | **49 檔、1647 測試全部通過**：T.1.1 的 1634 個，加上新的 13 個。耗時 278 秒，機器負載 4.7，worker 50% |
| 新測試 `tests/trials-ipas-foundation.test.ts` | 13 個：資料、標籤、來源、未上架、validator 攔截、匯入流程 |
| `next build`（`LOGIC_ISLAND_TRIALS=1`、`LOGIC_ISLAND_REGIONAL_WORLD=1`） | 通過。產生的 `/trials/*` 路徑只有 apcs、moex-info-processing、bank-it，**沒有 iPAS** |
| E2E：`e2e/trials.spec.ts`、`e2e/regional-world.spec.ts`（桌機＋手機） | 26 通過、6 略過。略過的是測試本身的條件：旗標關閉的情況（這次以旗標開啟建置），以及只限桌機或手機的情況，例如 hover 與 44 px 觸控範圍 |

**五項確認**：

| 項目 | 結果 | 證據 |
|---|---|---|
| 1. 既有 53 題不變 | ✅ | 重新 dry-run 皆「未變更」；generated 檔逐位元組相同 |
| 2. 已發布題目雜湊不變 | ✅ | 57/57 吻合；`published-hashes.json` 相同 |
| 3. iPAS 考試資料通過驗證 | ✅ | `validateTrials` 0 問題；新測試逐項檢查格式、16 個代碼、來源角色 |
| 4. 沒有未審核的 iPAS 題目出現在公開頁面 | ✅ | 題庫中 iPAS 題目 0 題，也沒有 iPAS 試卷；build 不產生 iPAS 路徑。e2e 確認 `/trials/ipas-aiap-basic` 回 404。測試也確認 AI 撰寫的 iPAS 原創題經匯入後為 `in-review`，且不寫入已發布雜湊 |
| 5. AI 群島仍顯示「題目準備中」 | ✅ | `regionTrialEntries('ai')` 為 `[{ label: 'iPAS AI 應用規劃師', detail: '題目準備中' }]`，沒有連結；regional-world e2e 通過 |

**沒有做的檢查**：
- 真機測試；
- 其他 e2e 檔，例如 3D、curriculum。
  - 本次沒有修改任何頁面、元件或 CSS，也沒有修改 3D 世界。

## 4. 與 T.2A 規劃的差異

| 項目 | T.2A（09～11） | T.2B-1 | 原因 |
|---|---|---|---|
| 題型比例 | 基礎／應用／情境 25／30／45 | **20／20／60**（每科 10／10／30） | 本階段核准決策；逐項分配見 §5.2 |
| G1 考綱代碼 | 方案 A：只用 tag id，不改程式 | **方案 B**：`Tag.syllabus` | Task B 要求每個標籤記錄 6 項資訊 |
| G2 `reviewBy` | 加在匯入格式，寫入 revision | 加在匯入格式，寫入**題目層級** | revision 一旦發布就不可修改，而複查日期需要更新 |
| G3 `plannedIslands` | 加在匯入格式 | 相同；沿用既有的 `links.plannedIslands`，沒有新增欄位 | 既有欄位已等同需求 |
| G7 `stemShape` | 在既有的陣列欄位加上否定與情境 | **單一值**的 `stemShape`（concept／application／scenario），另有 `stemTraits` 記錄否定等特徵 | Task D 指定的是三分類；同名舊欄位改名，避免語意衝突 |
| 易變題 | 11 §5 建議加 `meta.volatile` 標籤 | 未建立標籤；以 `reviewBy` 是否存在來表示易變 | 一個欄位就夠；是否還要標籤見 §6 |
| G4 授證規則 | 寫在說明中 | 寫在科目 `note` | 相同 |
| G5、G6 | 資料 | 已完成（§1） | — |
| G8 相似度比對腳本 | T.2B 開始前完成 | **尚未建立** | 本階段只做資料基礎；第一批題目送審前必須完成（§5.4） |
| 內部子主題標籤 `ai.*` | 10 §1 建議 | **尚未建立** | 屬於第一批題目的資料準備，見 §5.3 |

## 5. 下一批 25 題的產製規格（批次 A）

### 5.1 範圍

- **對應**：11 §7 的批次 A：科目 1 的 L111＋L112（19 題），加上 L113 的 L11301 其中 6 題。
- **批次檔**：`src/content/trials/batches/<日期>-ipas-aiap-basic-a.json`。

### 5.2 依 20／20／60 重新分配的全量配置（LI）

| 評鑑內容 | 題數 | 基礎／應用／情境 | | 評鑑內容 | 題數 | 基礎／應用／情境 |
|---|---:|---|---|---|---:|---|
| L11101 | 3 | 1／1／1 | | L12101 | 3 | 1／1／1 |
| L11102 | 4 | 1／1／2 | | L12102 | 3 | 1／0／2 |
| L11201 | 4 | 1／1／2 | | L12201 | 7 | 2／1／4 |
| L11202 | 5 | 1／1／3 | | L12202 | 9 | 2／2／5 |
| L11203 | 3 | 1／0／2 | | L12301 | 10 | 1／2／7 |
| L11301 | 8 | 1／2／5 | | L12302 | 9 | 1／2／6 |
| L11302 | 11 | 2／2／7 | | L12303 | 9 | 2／2／5 |
| L11401 | 6 | 1／1／4 | | | | |
| L11402 | 6 | 1／1／4 | | | | |
| **科目 1** | **50** | **10／10／30** | | **科目 2** | **50** | **10／10／30** |

- 各評鑑內容的題數沿用 11（核准決策 5），只改基礎／應用／情境的分配。
- 11 §2 各評鑑內容的「易變題數」是上限的估計，不是配額：實際是否標記依上表的「易變題」規則逐題判定（T.2B-2B）。

### 5.3 批次 A 的規格

| 項目 | 規格 |
|---|---|
| 題數 | 25 題：L11101 3、L11102 4、L11201 4、L11202 5、L11203 3、L11301 6 |
| 題型分配 | 基礎 6、應用 6、情境 13：L11301 取 1／2／3，其餘 2 題情境題留給批次 B。情境約 52%；全科合計 60% 要靠批次 B 補足（批次 B 情境占 17／25） |
| 題型 | `single-choice`，四個選項，不使用「以上皆是」或「以上皆非」 |
| 答案字母 | A／B／C／D 為 6／6／6／7，事先排定 |
| 難度 | 1～5 分別為 3／7／9／5／1（`author-estimate`）。**T.2B-2B 修訂後實際為 3／7／10／5／0**（Q23 4 → 3、替換後的 Q24 為 4）；使用者決定不為了配額刻意調高其他題目的難度（14 §1） |
| 否定題幹 | 最多 2 題，標記 `stemTraits: ['negative']`，題幹以「不」字標示 |
| 易變題 | **依題目內容判定，不依考點自動標記**（T.2B-2B 修訂；原規格為「L11102 的 4 題與 L11203 的 1 題，共 5 題」）。題目的正解依附會變動的法規、政策或服務條款時，才加 `meta.volatile` 並設定 `reviewBy` 為準備日加 6 個月；考穩定原則（例如可解釋性的意義、偏誤的處置、問責的安排）的題目不標記。只考原則，不考條號或版本細節。批次 A：Q05（以風險為基礎的監管）、Q19（生成式 AI 服務的資料使用條款）標記；Q04、Q06、Q07 不標記 |
| 批次欄位 | `origin: 'original'`、`source: 'basis-ipas-aiap-basic'`；`preparedBy.kind: 'ai'` 並記錄 `generatedBy`；`reviews: []` |
| 每題欄位 | `stemShape`（必填，依本規格）、`tags`、`appearances: [{ kind: 'targets', subjectId: 'ipas-aiap-basic-115.s1' }]`、`plannedIslands`、`difficulty`、`answer`、`explanation` |
| `tags` | 必須有一個官方考點標籤 `ipas.l1xxxx`，再加內部子主題 `ai.*` |
| `plannedIslands` | 依 10 §2：L111／L11201／L11203 → `ai-foundations`；L11202、L11301 → `machine-learning` |
| 解析 | Logic Island 撰寫；說明正解，以及至少一個誘答選項為什麼錯 |
| 狀態 | 匯入後全部為 `in-review`：AI 撰寫且沒有人工核准。逐題人工核准後，才能在下一次匯入時發布 |
| 情境 | 虛構的組織與人物；同一題材在 100 題中最多出現 3 次；不使用真實公司案例 |

**批次 A 開始前的資料準備**（屬於 T.2B-2，需核准）：
- 在 `tags.ts` 新增批次 A 需要的 `ai.*` 內部子主題標籤，依 10 §2 的子主題欄，例如：
  - `ai.foundations.definition`
  - `ai.governance.trustworthy`
  - `ai.data.types`
  - `ai.data.cleaning`
  - `ai.data.privacy`
  - `ai.ml.generalization`
  - `ai.ml.metrics`
- 這些標籤沒有 `syllabus` 欄位，**不得**在網站上標示為官方。

### 5.4 送審前的檢查流程

1. 撰寫時不看官方試題，也不看學習指引的示範題（11 §4）。
2. 建立 G8 相似度比對腳本，放在 `scripts/`，或只放在 scratchpad：
   - 比對對象是 400 題官方題幹，題幹只放在 scratchpad，不進版控；
   - 有 ≥ 12 字的連續相同片段，或 5-gram Jaccard > 0.3，就退回重寫；
   - 結果記錄在審稿紀錄的 note。
3. 執行 `pnpm trials:import <批次檔>` dry-run，產生報告：25 題全部 `in-review`，錯誤 0。
4. 提交題目清單、答案、解析與相似度結果，由使用者逐題審核。
5. 審核通過的題目在批次中加上人工 `approve` 的審稿紀錄（含 `answer-verified`），再以 `--write` 匯入。
6. 兩科 100 題都核准後才組模擬卷：
   - 每題 2 分、70 分及格；
   - 依 `mockScoring` 設定，不需要另寫 `note`。
   - 此時 AI 群島的入口才會改為「N 份試卷」並可點選。

## 6. 尚待確認事項

1. **授權**：iPAS 公告試題與考綱的重製授權仍未確認。是否發函詢問 iPAS 主辦單位 `ipas@itri.org.tw`，由使用者決定。
2. **間接相關課程**：L11201 對 DB01／F02、L11203 對 DB17，是否要掛到標籤的 `lessons`？
   - 掛上後，成績報告會建議複習這些課。
   - 目前**不掛**。
3. **`stemShape` 是否強制**：要不要規定 iPAS 原創題「必須」有 `stemShape`？目前是選填，由批次規格要求，validator 不強制。若要強制，可加一條規則：引用 `basis-ipas-aiap-basic` 的題目必須有 `stemShape`。約 3 行。
4. **易變題的標示**：只用 `reviewBy`，還是另加 11 §5 的 `meta.volatile` 標籤？
5. **模擬及格分**：目前與官方單科及格分同為 70。官方授證另有「平均 70、每科 ≥ 60」的兩科規則，模擬卷只能逐科計分。是否要在試卷說明中提醒？目前已寫在科目 `note`。
6. **官方名稱的空白**：標籤名稱統一了「AI」前後的空白（§1.2）。若要求逐字照抄官方，包括不一致的空白，需改回原樣。
7. **後續才處理**：
   - 考綱若改版（例如 116 年度），要新增 edition 與新版本的標籤 id，例如加版本後綴，這會是新的設計。
   - 目前一個代碼只對應一個 tag id；舊題保留舊標籤。

## 7. 檔案清單

**修改**：

| 檔案 | 內容 |
|---|---|
| `src/content/trials/schema.ts` | `ExamSubject.mockScoring`、`Source.version`／`basedOn`／`researchOnly`、`SyllabusItem`／`Tag.syllabus`、`STEM_SHAPES`／`STEM_TRAITS`、題目層級的 `stemShape`／`stemTraits`／`reviewBy`（取代版本層級未使用的兩個欄位）、`isDate`、`overdueReviews`，以及 §2.2 的驗證規則 |
| `src/content/trials/exams.ts` | iPAS 版本依據、兩科名稱、格式、`note` 與 `mockScoring` |
| `src/content/trials/sources.ts` | 簡章、考綱 115.06、原創依據、8 份僅供研究的公告試題 |
| `src/content/trials/tags.ts` | 16 個 `ipas.l1xxxx` 考綱標籤 |
| `src/lib/trials/import.ts` | 匯入格式新增 4 個選填欄位、形狀檢查、拒絕 `researchOnly` 來源、到期複查警告（`planImport` 新增選填參數 `today`） |
| `scripts/trials/import.ts` | 傳入本機日期 |

**新增**：
- `tests/trials-ipas-foundation.test.ts`
- `docs/exam-system/12_IPAS_BANK_FOUNDATION_REPORT.md`（本文件）

**未提交的 T.2A 文件**（沿用）：`09`、`10`、`11`。

**未變更**：
- `batches/`、`generated/`、`published-hashes.json`、`papers.ts`、`entries.ts`、`index.ts`；
- 所有頁面、元件與 CSS；
- 3D 世界。

**其他 Session 的檔案**：Theme Session 的 5 個檔案與 `.claude/` 都沒有碰。
