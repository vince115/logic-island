# LLM-0：大型語言模型島與生成式 AI 島的 `llm-explorer` 課程能力

> 2026-11-22。目標：讓大型語言模型島（`large-language-models`，前綴 LLM）與生成式 AI 島（`generative-ai`，前綴 GEN）的課可以撰寫、驗證、發布。本階段**不寫任何課程內容**，只建立能力、資料格式、驗證、元件與測試，並把兩座島登錄為預備島嶼。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 為什麼需要新能力

藍圖替 LLM 島的前幾堂課指定了三種互動活動：`token-explorer`（LLM02、LLM05、LLM11）、`sampling-explorer`（LLM01、LLM07、GEN01、GEN02）與 `embedding-space`（LLM03、LLM15、GEN08）。既有能力都無法表達它們：

- `python-code` 只有 Python 程式與共用追蹤。分詞、取樣與向量相似度的重點是「學習者改設定、立刻看到數字變化」，用固定的程式輸出做不到；而且 LLM01（analysis）、LLM02（simulation）、LLM03／LLM05（calculation）與 GEN01（quiz-only）的藍圖練習型態本來就不是寫程式。
- 共用視覺化（`TRACE_KINDS`）是固定步驟的追蹤，沒有「改 temperature 看分布」或「輸入文字看 token」的互動。
- [INTERACTIVE_ACTIVITY_ARCHITECTURE](../planning/INTERACTIVE_ACTIVITY_ARCHITECTURE.md) 的 LLM 列：分詞以預先產生的 BPE 表在前端執行（T1），embedding 用預算好的小詞表與 2D 投影（T3），真實模型呼叫屬 T4、不在範圍。

所以另立能力 `llm-explorer`：課程自帶小份的**示意資料**（合併表、錄好的 logits、手寫的向量），所有數字由瀏覽器中的純 TypeScript 算出，練習以數值比對。

## 2. 範圍

| 部分 | 位置 | 內容 |
|---|---|---|
| 分詞 | `src/lib/llm/bpe.ts` | 位元組層級 BPE：UTF-8、合併表與詞彙表、逐步合併的軌跡、特殊 token、解碼、從小語料訓練合併、token 計數與費用、log-loss、交叉熵、困惑度 |
| 取樣 | `src/lib/llm/sampling.ts` | 錄好的玩具模型；softmax、temperature、top-k、top-p、greedy；以種子逐步生成 |
| 亂數 | `src/lib/llm/prng.ts` | Mulberry32，唯一的亂數來源 |
| 向量 | `src/lib/llm/embedding.ts` | token embedding 與文件 embedding；內積、長度、餘弦相似度、最近鄰、決定論的 PCA |
| 課程資料與驗證 | `src/lib/llm/lesson.ts` | `LlmLessonContent`、練習與查詢、`checkLlmAnswer`、`llmContentProblems` |
| 結構描述 | `src/content/curriculum/schema.ts` | 能力 `llm-explorer`、三個活動、`LessonContent.llm`、`validateContent` 的接線、python-code 的配對規則、兩座預備島嶼 |
| 課程大綱 | `src/content/curriculum/lessons.ts` | `llmFromBlueprint` |
| 元件 | `src/components/curriculum/llm-explorer.tsx`、`llm-explorer.module.css`、`llm-lesson.tsx` | 三個探索器與練習框；接進 `database-lesson.tsx`（只有 llm-explorer 的課）與 `lesson-page.tsx`（python-code ＋ llm-explorer 的課） |
| 測試 | `tests/llm-capability.test.ts`、`tests/llm-explorer-dom.test.tsx`、`tests/support/llm-fixture.ts` | 見 §13 |

沒有新增任何執行期套件；沒有 Feature Flag、`mapState`、GLB 或 3D 的改動；既有能力的語意不變。

## 3. 探索器規格

### 3.1 `token-explorer`：位元組層級 BPE（`bpe.ts`）

| 規則 | 內容 |
|---|---|
| 位元組 | 文字先轉成 UTF-8 位元組。英文字母一個位元組，常用中文字三個位元組（「學」是 `E5 AD B8`），所以沒有合併規則時一個中文字是三個 token |
| 詞彙表 | 由合併表決定，課程不另外寫：ID 0–255 是 256 種位元組；第 r 條合併規則（r 從 0 起）做出的 token 是 ID 256 + r；最後依列出的順序是特殊 token |
| token 的寫法 | 完整的 UTF-8 字元照原樣寫，其他位元組寫成 `<0xHH>`（`<0xE5><0xAD>` 是「學」的前兩個位元組）。合併表也用這種寫法；`<0xHH>` 一律代表那個位元組 |
| 特殊 token | 例如 `<\|endoftext\|>`：在其他處理之前先從文字中找出（最左邊的、同位置取最長的），整個對應到一個 ID，不拆開也不合併 |
| 預先切分 | `words`（預設）：GPT-2 的切分規則去掉英文縮寫部分，即「可選的一個前導空白＋一串字母」、「＋一串數字」、「＋一串其他符號」或空白（中文字屬於字母，所以「 學生」是一段）；`none`：整段不切。合併不跨越切分的邊界 |
| 編碼 | 在所有片段中找出合併表名次最低的相鄰組合，把它在每個片段中由左到右、不重疊地全部合併，記為一步；重複到沒有可用的規則。這和逐片段套用 GPT-2 的 `bpe()` 結果相同，但軌跡以「一條規則」為一步，方便逐步呈現 |
| 軌跡 | `Encoding = { ids, start, steps, bytes }`；`start` 是合併前的 ID（位元組與特殊 token），每一步 `{ rank, left, right, merged, count, ids }` |
| 解碼 | ID 對應的位元組接起來讀成 UTF-8；不完整的字元以 `<0xHH>` 顯示，不會拋出錯誤 |
| 訓練 | `trainBpe(語料, 合併數, { minCount = 2 })`：把語料預先切分、每段從位元組開始；每一輪數出所有相鄰組合（重疊的也算，依片段出現次數加權），合併次數最多的一組。**同分時選語料中最先出現的一組**（片段依第一次出現的順序、片段內由左到右）。沒有任何組合達到 `minCount` 次就提前停止 |
| 計數與費用 | `countTokens`；`tokenCost(token 數, 每千 token 的價格) = token 數 × 價格 ÷ 1000`（不捨入，畫面顯示時才格式化）。價格是課程給的示意價格，不是任何供應商的報價 |
| LLM05 用的評分 | `logLoss(p) = −log p`（預設以 2 為底、單位位元；也可用 e、單位 nat）；`crossEntropy(機率) = 平均 log-loss`；`perplexity = e^(以 nat 計的交叉熵) = 2^(以位元計的交叉熵)`。機率是課程錄好的「每個 token 的條件機率」（示意資料） |

### 3.2 `sampling-explorer`：玩具模型與解碼設定（`sampling.ts`）

玩具模型 `ToyModel = { contexts: { context: string[]; candidates: { token, logit? , probability? }[] }[]; end? }`。上文是「最後幾個 token」，`[]` 代表任何上文；查詢時用**最長的、符合結尾的上文**（同長度取先列出的），所以同一份資料可以表達二元模型，也可以表達整段前綴。

解碼的順序與常見實作（Hugging Face 的 logits warper）相同：

1. **temperature** T > 0：p = softmax(logit ÷ T)，先減去最大值以免溢位；T = 0 是 **greedy**：機率最高的一個（同分取先列出的）機率為 1。課程錄的若是機率，視為 logit = ln p（T = 1 時原樣還原）。
2. 依調溫後的機率由大到小排序（同分維持列出的順序）。
3. **top-k**（k ≥ 1；0 表示關閉）：只留前 k 個，重新正規化。
4. **top-p**（0 < p ≤ 1；1 表示關閉）：在 top-k 之後重新正規化的分布上由大到小累加，留下累計**第一次達到** p 的最短前綴（跨過 p 的那一個也留下，至少留一個），再正規化。比較時容許 1e-12 的浮點誤差。

**取樣**：從種子產生器抽一個 u ∈ [0, 1)，沿排好序、留下的候選累加機率，第一個累計值**大於** u 的就是選中的 token。**每一步取樣抽一個 u**（即使只剩一個候選），greedy 不抽，所以同一個種子對應固定的一串選擇。

**逐步生成** `generate(模型, 提示, 設定, 種子, 最多步數)`：每一步找上文、算分布、選 token，記錄 `{ context, rows, u?, token }`；生成結束 token、找不到上文或達到步數上限時停止（`stop` 分別是 `end`、`no-context`、`max-steps`）。

### 3.3 亂數（`prng.ts`）

只有 Mulberry32，種子是 0–4294967295 的整數；狀態 a 從種子開始，每次：

```text
a = (a + 0x6D2B79F5) mod 2^32
t = imul(a ^ (a >>> 15), a | 1)
t = t ^ (t + imul(t ^ (t >>> 7), t | 61))
u = ((t ^ (t >>> 14)) >>> 0) / 2^32
```

全部是 32 位元整數運算與一次精確的除法，任何 JavaScript 引擎都得到同一串數字；測試以獨立的 Python 實作核對（種子 42 的前三個數 0.6011037519…、0.4482905589…、0.8524657934…）。頁面上沒有任何 `Math.random`，伺服器輸出與瀏覽器水合一致。

### 3.4 `embedding-space`：向量與 2D 投影（`embedding.ts`）

| 規則 | 內容 |
|---|---|
| 兩種空間 | `kind: 'token'`：模型內 embedding 表的列，項目是 `{ id, token, tokenId?, vector, group? }`；`kind: 'document'`：embedding 模型為整句或整份文件算出的向量，項目是 `{ id, text, vector, group? }`，只有文件空間可以有 `queries`（查詢向量） |
| 維度 | 2–16 維；`dimensions` 可以替每一維命名（例如「動物」「交通」），只是教學標籤 |
| 相似度 | `dot`、`norm`、`cosine = 內積 ÷（長度相乘）`；零向量沒有方向，驗證時拒絕 |
| 最近鄰 | `nearest(空間, 項目或查詢 id, k, 'cosine' \| 'dot')`：分數由高到低，同分維持項目順序，不含自己 |
| 投影 | PCA：以項目的平均為原點、共變異矩陣 C = XᵀX ÷ n；以**冪迭代＋消去**求前三個特徵向量，起始向量固定為 (1, 1/2, 1/3, …) 正規化，移動量小於 1e-13 時停止（最多 10,000 次）；每一軸的**正負號**固定為「絕對值最大的分量為正」（同大取第一個）。座標是置中後的向量與前兩軸的內積；查詢用項目的平均與軸。另外回傳特徵值與兩軸解釋的變異比例 |
| 投影要定義良好 | 點都在一條線上（第二特徵值≈0）或兩個特徵值幾乎相等（差小於最大特徵值的 1/1000，軸不唯一）時，驗證失敗並要求修改向量；冪迭代沒有收斂（殘差大於 1e-9 × 特徵值）也失敗 |

## 4. 資料格式

```ts
LessonContent.llm = {
  tokenizers?: { id, title, description,
    table: { merges: [string, string][]; special?: string[]; pretokenize?: 'words' | 'none' },
    text: string, presets?: string[], pricePer1k?: number,
    training?: { corpus: string; minCount?: number },
    scoring?: { id, label, text, probabilities: number[] }[] }[];
  samplers?: { id, title, description, model: ToyModel, prompt: string[],
    settings: { temperature, topK?, topP?, seed }, maxSteps: number }[];
  embeddings?: { id, title, description, space: EmbeddingSpace }[];
  exercises: LlmExercise[];
}
```

- 探索器以 `{ type: 'example', id }` 放在段落中，計入範例數（只有 llm-explorer 的課）；python-code ＋ llm-explorer 的課，段落可以同時放程式範例與探索器。
- `training` 存在時，在語料上訓練出的合併必須**正好等於**合併表（數量相同、逐條相同），所以頁面上「合併規則從哪裡來」與實際使用的表一致。
- `scoring` 的機率個數必須等於該文字斷詞後的 token 數，每個機率在 (0, 1]。
- `maxSteps` 為 1–40；預設設定 temperature 在 0–3、top-k 為 ≥ 0 的整數、top-p 在 (0, 1]、種子為 32 位元無號整數；提示必須找得到上文。

完整的例子見 `tests/support/llm-fixture.ts`（三種探索器、兩種向量空間、十道練習）。

## 5. 練習（以數值比對）

每道練習寫出答案，並以 `query` 說明答案從哪裡來；驗證器重新計算，確認答案確實由資料推出。

| `kind` | 學習者填的 | 答案 |
|---|---|---|
| `field` | 一格文字（`value`） | 文字或清單 |
| `number` | 一格數字（`value`） | 數字與 `tolerance` |
| `choice` | 選一個選項（`choice` = 選項序號） | `options[answer]` 必須是唯一符合查詢結果的選項 |
| `table` | 多格（每個 `blank.id` 一格） | 各格自己的文字、清單或數字 |

| 查詢 `of` | 對象 | 值 |
|---|---|---|
| `tokens`、`token-ids` | 斷詞器、文字 | 依序的清單（token 以 `\|` 分隔；ID 可用空白、逗號分隔） |
| `token-count`、`byte-count`、`merge-steps`、`cost` | 斷詞器、文字 | 數字 |
| `decode` | 斷詞器、ID 清單 | 文字 |
| `trained-merge` | 斷詞器、名次 | 該輪合併出的 token |
| `cross-entropy`（底數 2 或 e）、`perplexity` | 斷詞器、評分 | 數字 |
| `probability` | 取樣器、上文、token、設定 | 數字（最終機率） |
| `kept` | 取樣器、上文、設定 | 集合（順序不拘） |
| `greedy` | 取樣器、上文 | 文字 |
| `generate` | 取樣器、設定、種子、步數 | 依序的清單 |
| `cosine`、`dot`、`norm`、`projection` | 向量空間 | 數字 |
| `nearest` | 向量空間、項目或查詢、k | k = 1 時是文字，否則是依序的清單 |

比對規則（`checkLlmAnswer`）：

- 數字：接受全形數字、前後空白、科學記號與百分比（`86.7%` = 0.867）；與答案相差不超過 `tolerance` 即通過。
- 文字：去掉前後空白、連續空白視為一個；`␣`（頁面顯示空白的符號）視為空白。大小寫有差別（`The` 與 `the` 是不同的 token）。
- 清單：每一項依上面的文字規則比較；token 開頭的空白因此不計，只有空白的 token 兩邊都略過。集合（`kept`）不看順序。
- 每道練習都有提示、常見錯誤與解說；常見錯誤以學習者答案的形式寫出，驗證器確認它們**不會通過**。

## 6. 驗證規則（`llmContentProblems`，由 `validateContent` 呼叫）

- 至少一個探索器；探索器與練習的 id 不重複；標題、說明不空白。
- 斷詞器：合併表的每一邊在那一條規則之前已是 token、合併結果不重複、特殊 token 不重複且不含空白；每個 token 的寫法能還原成同樣的位元組；文字不空白；價格為正數；訓練結果等於合併表；評分的機率個數與範圍正確。
- 取樣器：每個上文至少兩個候選、候選不重複、全部給 logit 或全部給機率、logit 有限、機率在 (0, 1] 且總和為 1（容許 1e-6）、上文不重複；預設設定、種子、步數合法；提示找得到上文。
- 向量空間：至少三個項目、維度 2–16 且一致、數值有限、非零向量、id 與文字不重複、token ID 為不重複的非負整數、只有文件空間有查詢、投影定義良好（§3.4）。
- 練習：題目、提示、解說、至少一個常見錯誤；查詢指到存在的探索器與資料；數字答案的查詢必須給數字、文字答案的查詢必須給文字或清單（`number` 題只能是數字、`field` 題不能是數字）；非整數答案需要 `tolerance > 0`，而且**寫下的答案與算出的值相差不超過 tolerance 的一半**（所以學習者算出的精確值一定通過）；`choice` 恰好只有正確選項符合；參考答案通過自己的檢查；每個常見錯誤只回答練習有的欄位，而且不通過。
- 在 `validateContent`：`llm-explorer` 能力與 `content.llm` 必須同時存在；課程的活動必須有對應的探索器（`token-explorer` → `tokenizers`、`sampling-explorer` → `samplers`、`embedding-space` → `embeddings`）；每個探索器都在某個段落中顯示。只有 llm-explorer 的課沿用非程式課的檢查（探索器算範例、至少 3 個；探索練習算練習、至少 1 道）；python-code ＋ llm-explorer 的課沿用程式課的全部檢查（至少 3 個 Python 範例、至少 1 道有測資的 Python 練習），再加上探索器與探索練習的檢查。
- 在 `validateCurriculum`：llm-explorer 的課必須以三個活動之一為 `activity`；活動 `token-explorer`、`sampling-explorer`、`embedding-space` 需要 `llm-explorer` 能力。

## 7. 與 `python-code` 的關係

AIF 的課是只有 Python 的程式課，規則是「python-code 單獨使用」。進度文件的 LLM 列寫的是「python-code + explorers」，藍圖中 LLM11、LLM15、GEN02、GEN08 的練習型態是 `code-python`，同時又指定探索器。所以：

- **放寬的只有一條**：`python-code` 可以和 `llm-explorer`（而且只有它）一起宣告。`python-code` 和任何其他能力（`visualization`、`terminal`…）一起仍被拒絕，訊息仍以「python-code stands alone」開頭（現在是「python-code stands alone (llm-explorer is its only companion)」）。
- 其他規則全部不變：`supportedLanguages` 必須正好是 `['Python']`；`program-code` 仍單獨使用、仍要求 C++、Java、Python；Python 程式只用標準函式庫、輸出不隨雜湊種子改變（`tests/python-capability.test.ts` 的檢查也會涵蓋未來的 LLM 課，因為它找的是所有 `python-code` 課）。
- `llmFromBlueprint` 預設：藍圖練習型態是 `code-python` 的課得到 `['python-code', 'llm-explorer']`，其他得到 `['llm-explorer']`；撰寫者可用第四個參數覆寫（例如讓 LLM02 也附 Python 的 BPE 合併練習）。
- 頁面：只有 llm-explorer 的課走非程式課的版面（段落、探索器、測驗、練習）；兩者都有的課走程式課的版面，探索器放在段落中，探索練習在「程式練習」之後的「探索練習」區塊。

## 8. 課程大綱與島嶼登錄

| 藍圖活動 | 課程活動 | 能力 |
|---|---|---|
| `token-explorer` | `token-explorer` | `llm-explorer`（`code-python` 的課加上 `python-code`） |
| `sampling-explorer` | `sampling-explorer` | 同上 |
| `embedding-space` | `embedding-space` | 同上 |
| 其他（`attention-explorer`、`prompt-lab`、`rag-explorer`、`cost-calculator`、`diffusion-steps`、`latent-space`…） | — | `llmFromBlueprint` 拋出錯誤：這些活動尚未建置，留在 [INTERACTIVE_LAB_ROADMAP](INTERACTIVE_LAB_ROADMAP.md) 的範疇 |

標題、目標、概念、難度、先修取自藍圖；`visualization` 為 `none`。

島嶼登錄（SRV-0 的做法）：`PREPARED_ISLAND_IDS = ['large-language-models', 'generative-ai']`、`LessonPrefixWritten` 加上 `'LLM' | 'GEN'`、`ISLAND_PREFIX` 對應 `LLM`、`GEN`、`UNITS` 兩島為 `[]`。在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕這兩島的任何課（「large-language-models is prepared for authoring, not a curriculum island yet」）；兩島的課仍是規劃中、沒有頁面，已發布的課不變。`docs/curriculum/data/island-capabilities.json` 中兩島改為 `prepared`，`AUTONOMOUS_CURRICULUM_PROGRESS.md` 依它重新產生。

## 9. UI（`src/components/curriculum/llm-explorer.tsx`）

| 元件 | 內容 |
|---|---|
| `TokenExplorerView` | 可編輯的文字框（有標籤）與範例文字按鈕（`aria-pressed`）；字元、位元組、token 數；token 以六種底色輪替的方塊呈現（特殊 token 用虛線框），每塊顯示寫法（空白顯示為 `␣`）與 ID，可勾選顯示十六進位位元組；共用的 `Stepper`（按鈕、方向鍵、Home／End）逐步合併，第 0 步是位元組，說明以 `aria-live` 宣告，這一步做出的 token 加上外框；token ID、解碼結果、費用估算；可展開的「每個字元的 UTF-8 位元組」、「合併規則與特殊 token」、「在語料上訓練」、「每個 token 的機率、交叉熵與困惑度」表格 |
| `SamplingExplorerView` | temperature、top-p 的滑桿與 top-k、種子的輸入框（都有標籤；種子不合法時 `aria-invalid` 並沿用上一個合法種子）、恢復預設；選擇上文後，候選以長條列出（最終機率、被 top-k／top-p 刪去或 greedy 不選的原因、原始與調溫後的機率；細線標出原始機率）；逐步生成用同一個 `Stepper`，說明本步的上文、抽到的 u、以及每個候選對應的累計區間（u 落在哪一段就選哪一個），結束時說明停止的原因 |
| `EmbeddingSpaceView` | 選擇比較對象（查詢與項目分組）、餘弦相似度或內積；SVG 散布圖（`role="img"`，`<title>` 說明選取與最相近的項目；圓點是項目、方塊是查詢，選取的與最近的三個以顏色與連線標出）；**文字替代**：依分數排序的相似度表格，以及每個向量各維數值與 2D 座標的表格；並說明兩軸解釋的變異比例與投影會失去資訊 |
| `LlmExerciseBox` | 依題型顯示文字框、數字框（`inputMode="decimal"`）、單選按鈕或表格；「檢查答案」「清除」；結果以 `aria-live` 宣告。外層的 `LlmExerciseView`（`llm-lesson.tsx`）顯示題目、提示、常見錯誤與參考解答 |

- 每個探索器都標示「示意資料」（§10）。
- 手機寬度 390 px：token 方塊與 ID 清單可換行（`overflow-wrap: anywhere`），控制項在 560 px 以下改為單欄，機率長條的數字移到長條下方，表格放在可水平捲動的容器裡，散布圖以 `viewBox` 縮放，頁面本身不會水平溢出。
- 只有在使用者沒有要求減少動態時，長條才有寬度轉場。
- 所有數值以 `toFixed` 格式化，亂數只來自種子產生器：伺服器輸出與瀏覽器水合一致。

## 10. 示意資料

LLM 島課程中的合併表、logits、機率、向量與價格都是**課程撰寫的示意資料**：用來說明原理的小例子，數值經過驗證器檢查彼此一致，但**不是任何真實、具名模型的輸出**，也不能拿來推論真實模型的行為。規則：

- 不寫「某某模型會把這句話切成…」「某某模型的 embedding 是…」；可以說「真實的斷詞器詞彙表有數萬到數十萬個 token」這類一般性的事實。
- 價格寫成「示意價格」，不引用任何供應商的報價。
- 元件在每個探索器上顯示「示意資料：數值由課程撰寫，用來說明原理，不是任何真實模型的輸出。」

## 11. 不在範圍

- **T4：真實模型呼叫**。沒有任何 API 呼叫、API 金鑰、Token 或後端；`prompt-lab`、`rag-explorer`、`tool-call-trace` 之後若要做，依架構文件先做預錄的模擬。
- 在瀏覽器載入真實的分詞器詞彙表或 embedding 模型。
- `attention-explorer`（LLM04、LLM22）、`cost-calculator`（LLM06、LLM23）、`prompt-lab`、`rag-explorer`、`eval-dashboard`、`guardrail-sim`、`pipeline-diagram`、`training-curves`，以及 GEN 島的 `diffusion-steps`、`latent-space`、`multimodal-pipeline`。資料模型已為它們留下空間：`LlmLessonContent` 以探索器種類分欄，新增種類不影響既有欄位；`token-explorer` 已有 LLM11 需要的 token 計數與費用，`embedding-space` 已有 LLM15、GEN08 需要的查詢與最近鄰。
- beam search、重複懲罰與停止序列（LLM07 會需要；取樣器的設定物件可以再加欄位）。

## 12. 批次計畫

課程編號即位置，依序連續發布；先修都要已發布。

| 批次 | 課程 | 能力 | 說明 |
|---|---|---|---|
| LLM-1 | LLM01 大型語言模型概觀 | `llm-explorer`（`sampling-explorer`） | 先修 AIF01（已發布）。以玩具模型示範「預測下一個 token」與逐步生成；藍圖練習型態是 analysis，用 `probability`、`greedy`、`generate` 與 `choice` 題 |
| LLM-1 | LLM02 Tokenization 斷詞 | `llm-explorer`（`token-explorer`） | 以有訓練語料的合併表示範 BPE、中文三個位元組、特殊 token、token ID 與費用估算（`tests/support/llm-fixture.ts` 是這一堂的形狀） |
| LLM-1 | LLM03 嵌入向量 | `llm-explorer`（`embedding-space`） | token embedding 與文件 embedding 兩個空間、餘弦相似度、最近的句子、2D 投影 |
| GEN-1 | GEN01 生成模型概觀 | `llm-explorer`（`sampling-explorer`） | 先修 AIF01。藍圖是 quiz-only：不附 Python；仍需至少一道探索練習（非程式課的規則不放寬），例如從錄好的分布取樣、比較 temperature |

只有 llm-explorer 的課沿用非程式課的最低數量：至少 3 個探索器（可以同種，例如三個不同的玩具模型或斷詞表）與至少 1 道探索練習。

到此為止：**LLM04 需要 DL18**（深度學習島尚未發布）與尚未建置的 `attention-explorer`，LLM05 需要 LLM04（它的交叉熵與困惑度函式已在本階段完成）。GEN02 需要 LLM01，可在 LLM-1 之後再評估。

發布 LLM-1（或 GEN-1）時：

- 把該島從 `PREPARED_ISLAND_IDS` 移到 `ISLAND_IDS`，加入單元；
- 用 `llmFromBlueprint` 登錄課程；
- 更新路由快照與已發布數；
- `tests/llm-capability.test.ts` 中「兩島只是預備島嶼」與「沒有任何已發布的課使用 llm-explorer」的斷言改為檢查已寫的課，`tests/python-capability.test.ts` 中「只有 AI 基礎島是 python-code」的斷言在第一堂 code-python 的 LLM 課發布時一起更新；
- 更新 `island-capabilities.json` 的狀態並重新產生進度文件。

## 13. 測試

| 檔案 | 內容 |
|---|---|
| `tests/llm-capability.test.ts` | BPE：UTF-8 與 CJK、詞彙表、編碼軌跡與解碼、名次最低者優先、一步合併所有出現、合併表錯誤、訓練的決定論與同分規則、費用、log-loss／交叉熵／困惑度；取樣：softmax 與 temperature、top-k、top-p、先 top-k 再 top-p、greedy、選取區間、Mulberry32 與獨立實作一致、以種子重現生成、最長上文；向量：內積、長度、餘弦、最近鄰、PCA 的手算例子與決定論、投影不良的拒絕；驗證：每一種不一致的資料、推不出的答案、會通過的常見錯誤、重複 id 都被抓到；學習者答案的比對；結構描述：能力與活動、`llmFromBlueprint`、完整範例課通過 `validateContent` 與 `publishProblems`、能力與內容的綁定、python-code 的配對規則；兩島仍是預備島嶼 |
| `tests/llm-explorer-dom.test.tsx` | jsdom：token 方塊與 ID、`Stepper` 與方向鍵逐步合併、輸入與範例文字、位元組顯示；機率長條隨 temperature、top-k、top-p 變化、greedy、逐步生成與種子、不合法的種子；散布圖的標題、相似度與座標表格、切換比較對象與內積；四種練習的檢查 |
| `tests/support/llm-fixture.ts` | 完整的 LLM02 形狀範例課 |

## 14. 改動的既有規則與測試

- `validateCurriculum` 的「python-code stands alone」改為只允許 `llm-explorer` 作為伴隨能力（§7）。`tests/python-capability.test.ts` 對這條規則的斷言以正規表示式比對開頭，不需修改，仍然成立；新增的配對斷言在 `tests/llm-capability.test.ts`。
- 沒有放寬或刪除任何既有測試。
