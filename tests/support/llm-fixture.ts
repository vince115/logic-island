import type { LessonContent } from '@/content/curriculum/schema';
import type { EmbeddingExplorer, LlmExercise, LlmLessonContent, SamplingExplorer, TokenizerExplorer } from '@/lib/llm/lesson';

/*
 * LLM-0: a complete lesson content exercising all three explorers of the llm-explorer capability (a BPE tokenizer with
 * its training corpus and recorded per-token probabilities, a toy next-token model, a token and a document embedding
 * space) and every kind of exercise (field, number, choice, table). Written for an LLM02-shaped lesson
 * (llmFromBlueprint('LLM02', …)): tests/llm-capability.test.ts validates it with validateContent and publishProblems.
 * All numbers are illustrative (示意資料), not any real model's.
 */

/** The table's merges are exactly what training on this corpus learns (the validator checks it). */
export const TRAINING_CORPUS = 'low low low lower lowest 學生 學生 學習';
export const tokenizer = (): TokenizerExplorer => ({
  id: 'toy-bpe', title: '玩具 BPE 斷詞器', description: '用一小段語料學出的 8 條合併規則（示意資料）：先把文字變成 UTF-8 位元組，再依序套用合併。',
  table: {
    merges: [['l', 'o'], ['lo', 'w'], [' ', 'low'], [' ', '<0xE5>'], [' <0xE5>', '<0xAD>'], [' <0xE5><0xAD>', '<0xB8>'], [' 學', '<0xE7>'], [' low', 'e']],
    special: ['<|endoftext|>'],
  },
  text: 'lower 學生<|endoftext|>',
  presets: ['low low', '學校', ' 學習'],
  pricePer1k: 0.5,
  training: { corpus: TRAINING_CORPUS },
  scoring: [
    { id: 'model-a', label: '模型 A（示意）', text: 'low low', probabilities: [0.5, 0.25] },
    { id: 'model-b', label: '模型 B（示意）', text: 'low low', probabilities: [0.8, 0.5] },
  ],
});

export const sampler = (): SamplingExplorer => ({
  id: 'toy-weather', title: '天氣句子的玩具模型', description: '錄好的下一個 token 的 logit（示意資料），不是任何真實模型的輸出。',
  model: {
    end: '<|endoftext|>',
    contexts: [
      { context: ['天氣'], candidates: [{ token: '很好', logit: 2 }, { token: '不錯', logit: 1 }, { token: '很糟', logit: 0 }] },
      { context: ['很好'], candidates: [{ token: '。', probability: 0.5 }, { token: '，', probability: 0.3 }, { token: '！', probability: 0.2 }] },
      { context: ['不錯'], candidates: [{ token: '。', logit: 1 }, { token: '！', logit: 0 }] },
      { context: ['很糟'], candidates: [{ token: '。', logit: 0 }, { token: '…', logit: 0 }] },
      { context: ['，'], candidates: [{ token: '適合散步', logit: 1 }, { token: '但有點熱', logit: 0.5 }] },
      { context: [], candidates: [{ token: '<|endoftext|>', logit: 2 }, { token: '明天呢', logit: 0 }] },
    ],
  },
  prompt: ['今天', '天氣'],
  settings: { temperature: 1, topK: 0, topP: 1, seed: 42 },
  maxSteps: 6,
});

export const tokenSpace = (): EmbeddingExplorer => ({
  id: 'word-vectors', title: '詞的 embedding 表', description: '六個 token 的 embedding（模型內部 embedding 表的列，示意資料）。',
  space: {
    kind: 'token', dimensions: ['動物', '寵物', '交通', '速度', '食物', '甜'],
    items: [
      { id: 'cat', token: '貓', tokenId: 301, vector: [0.9, 0.8, 0.0, 0.1, 0.1, 0.0] },
      { id: 'dog', token: '狗', tokenId: 302, vector: [0.9, 0.7, 0.0, 0.3, 0.0, 0.0] },
      { id: 'car', token: '汽車', tokenId: 303, vector: [0.0, 0.0, 0.9, 0.7, 0.0, 0.0] },
      { id: 'train', token: '火車', tokenId: 304, vector: [0.0, 0.0, 0.8, 0.9, 0.1, 0.0] },
      { id: 'cake', token: '蛋糕', tokenId: 305, vector: [0.0, 0.1, 0.0, 0.0, 0.9, 0.9] },
      { id: 'apple', token: '蘋果', tokenId: 306, vector: [0.1, 0.0, 0.0, 0.0, 0.8, 0.5] },
    ],
  },
});

export const documentSpace = (): EmbeddingExplorer => ({
  id: 'sentence-vectors', title: '句子的 embedding', description: '四個句子與一個查詢的文件 embedding（示意資料）。',
  space: {
    kind: 'document', dimensions: ['寵物', '交通', '天氣', '食物'],
    items: [
      { id: 's1', text: '我家的貓喜歡睡覺', vector: [0.9, 0.0, 0.1, 0.1] },
      { id: 's2', text: '早上的火車誤點了', vector: [0.0, 0.9, 0.2, 0.0] },
      { id: 's3', text: '今天下午會下大雨', vector: [0.1, 0.3, 0.9, 0.0] },
      { id: 's4', text: '這家店的蛋糕很好吃', vector: [0.1, 0.0, 0.0, 0.9] },
    ],
    queries: [{ id: 'q1', text: '通勤時遇到交通延誤', vector: [0.0, 0.8, 0.3, 0.1] }],
  },
});

export const exercises = (): LlmExercise[] => [
  { id: 'x-tokens', kind: 'field', title: '把 lower 切成 token', statement: '用玩具斷詞器把 `lower` 切成 token，依序寫出每個 token，用 | 分開。',
    blank: { id: 'tokens', label: 'token', query: { of: 'tokens', explorer: 'toy-bpe', text: 'lower' }, answer: 'low|e|r' },
    hints: ['先把文字拆成位元組，再依合併規則的順序一條一條套用。', '沒有任何規則能合併的位元組會留下來，自己就是一個 token。'],
    explanation: '`l`＋`o` 先合併成 `lo`，再和 `w` 合併成 `low`；`e`、`r` 沒有合併規則，各自是一個 token。',
    mistakes: [{ answer: { value: 'l|o|w|e|r' }, why: '只拆成位元組，沒有套用合併規則' }, { answer: { value: 'lower' }, why: '以為整個英文單字一定是一個 token' }] },
  { id: 'x-count', kind: 'number', title: '數 token', statement: '`lower 學生<|endoftext|>` 會被切成幾個 token？',
    blank: { id: 'count', label: 'token 數', query: { of: 'token-count', explorer: 'toy-bpe', text: 'lower 學生<|endoftext|>' }, answer: 7, tolerance: 0 },
    hints: ['特殊 token 一整個算一個，不會被拆開。', '「學生」前面有空白，合併規則學到的是「空白＋學」。'],
    explanation: '`low`、`e`、`r`、「 學」加上「生」的第一個位元組合成的 token、「生」剩下的兩個位元組，再加上 `<|endoftext|>`，共 7 個。',
    mistakes: [{ answer: { value: '25' }, why: '數的是位元組，不是 token' }, { answer: { value: '18' }, why: '數的是字元，而且把特殊 token 拆成字元' }] },
  { id: 'x-cost', kind: 'number', title: '估算費用', statement: '以每 1,000 個 token 0.5 元（示意價格）計，`lower 學生<|endoftext|>` 的費用是多少元？',
    blank: { id: 'cost', label: '費用（元）', query: { of: 'cost', explorer: 'toy-bpe', text: 'lower 學生<|endoftext|>' }, answer: 0.0035, tolerance: 0.0001 },
    hints: ['費用 = token 數 × 每 1,000 個 token 的價格 ÷ 1,000。'],
    explanation: '7 個 token × 0.5 ÷ 1,000 = 0.0035 元。',
    mistakes: [{ answer: { value: '3.5' }, why: '忘了除以 1,000' }, { answer: { value: '0.0125' }, why: '用位元組數 25 計價' }] },
  { id: 'x-ids', kind: 'table', title: 'token ID 與位元組', statement: '寫出 `low low` 的 token ID，以及「學生」的 UTF-8 位元組數。',
    blanks: [
      { id: 'ids', label: '`low low` 的 token ID（用空白分開）', query: { of: 'token-ids', explorer: 'toy-bpe', text: 'low low' }, answer: '257 258' },
      { id: 'bytes', label: '「學生」的位元組數', query: { of: 'byte-count', explorer: 'toy-bpe', text: '學生' }, answer: 6, tolerance: 0 },
    ],
    hints: ['ID 0–255 是位元組，第 r 條合併規則做出的 token 是 256 + r。', '一個中文字在 UTF-8 裡是三個位元組。'],
    explanation: '`low` 是第 1 條規則（ID 257），「 low」是第 2 條（ID 258）；「學生」兩個字各 3 個位元組，共 6 個。',
    mistakes: [{ answer: { ids: '257 257', bytes: '6' }, why: '沒注意第二個 low 前面有空白' }, { answer: { ids: '257 258', bytes: '2' }, why: '把字元數當成位元組數' }] },
  { id: 'x-temperature', kind: 'number', title: '降低溫度', statement: '在「天氣」之後，temperature = 0.5 時「很好」的機率是多少？（四捨五入到小數點後三位）',
    blank: { id: 'p', label: '機率', query: { of: 'probability', explorer: 'toy-weather', context: ['天氣'], token: '很好', settings: { temperature: 0.5 } }, answer: 0.867, tolerance: 0.001 },
    hints: ['先把每個 logit 除以 temperature，再做 softmax。'],
    explanation: 'logit ÷ 0.5 = 4、2、0，softmax 後「很好」是 e⁴ ÷ (e⁴ + e² + 1) ≈ 0.867：溫度越低，最高的選項越突出。',
    mistakes: [{ answer: { value: '0.665' }, why: '用的是 temperature = 1 的機率' }, { answer: { value: '0.506' }, why: '把 logit 乘以 temperature，等於 temperature = 2' }] },
  { id: 'x-top-p', kind: 'table', title: 'top-p 留下哪些', statement: '在「很好」之後設定 top-p = 0.8（temperature = 1），哪些 token 會留下？重新正規化後「。」的機率是多少？',
    blanks: [
      { id: 'kept', label: '留下的 token（用 | 分開）', query: { of: 'kept', explorer: 'toy-weather', context: ['很好'], settings: { temperature: 1, topP: 0.8 } }, answer: '。|，' },
      { id: 'p', label: '「。」的新機率', query: { of: 'probability', explorer: 'toy-weather', context: ['很好'], token: '。', settings: { temperature: 1, topP: 0.8 } }, answer: 0.625, tolerance: 0.001 },
    ],
    hints: ['由大到小累加機率，累計第一次達到 0.8 的那一個也要留下。', '留下的機率除以它們的總和。'],
    explanation: '0.5 + 0.3 = 0.8 剛好達到 top-p，所以留下「。」與「，」；0.5 ÷ 0.8 = 0.625。',
    mistakes: [{ answer: { kept: '。', p: '1' }, why: '累計還沒達到 0.8 就停下' }, { answer: { kept: '。|，', p: '0.5' }, why: '忘了重新正規化' }] },
  { id: 'x-generate', kind: 'field', title: '用種子逐步生成', statement: '用探索器的預設設定（temperature = 1、種子 42），從「今天 天氣」生成 2 個 token，依序寫出來，用 | 分開。',
    blank: { id: 'tokens', label: '生成的 token', query: { of: 'generate', explorer: 'toy-weather', settings: { temperature: 1 }, seed: 42, steps: 2 }, answer: '很好|。' },
    hints: ['每一步抽一個亂數 u，沿著由大到小排好的機率累加，第一個累計超過 u 的就是選中的 token。'],
    explanation: '同一個種子一定抽到同一串亂數，所以每次生成的結果都一樣。',
    mistakes: [{ answer: { value: '很好|，' }, why: '第二步用了錯誤的亂數' }] },
  { id: 'x-nearest', kind: 'choice', title: '最接近的句子', statement: '哪一個句子和查詢「通勤時遇到交通延誤」的餘弦相似度最高？',
    query: { of: 'nearest', explorer: 'sentence-vectors', item: 'q1' }, options: ['我家的貓喜歡睡覺', '早上的火車誤點了', '今天下午會下大雨', '這家店的蛋糕很好吃'], answer: 1,
    hints: ['算出查詢和每個句子的餘弦相似度，取最大的。'],
    explanation: '查詢在「交通」維度最大，和「早上的火車誤點了」方向最接近。',
    mistakes: [{ answer: { choice: '2' }, why: '只看「天氣」維度' }] },
  { id: 'x-cosine', kind: 'number', title: '貓和狗', statement: '算出「貓」和「狗」的餘弦相似度（小數點後三位）。',
    blank: { id: 'cos', label: '餘弦相似度', query: { of: 'cosine', explorer: 'word-vectors', a: 'cat', b: 'dog' }, answer: 0.979, tolerance: 0.001 },
    hints: ['餘弦相似度 = 內積 ÷（兩個向量長度的乘積）。'],
    explanation: '兩個向量都集中在「動物」與「寵物」維度，方向幾乎相同。',
    mistakes: [{ answer: { value: '1.4' }, why: '只算了內積，沒有除以長度' }] },
  { id: 'x-perplexity', kind: 'number', title: '困惑度', statement: '模型 A 給 `low low` 兩個 token 的機率是 0.5 與 0.25，困惑度是多少？',
    blank: { id: 'ppl', label: '困惑度', query: { of: 'perplexity', explorer: 'toy-bpe', scoring: 'model-a' }, answer: 2.828, tolerance: 0.001 },
    hints: ['交叉熵是每個 token 的 −log₂ p 的平均，困惑度是 2 的交叉熵次方。'],
    explanation: '−log₂ 0.5 = 1、−log₂ 0.25 = 2，平均 1.5 位元；2^1.5 ≈ 2.828。',
    mistakes: [{ answer: { value: '1.5' }, why: '寫的是交叉熵，不是困惑度' }, { answer: { value: '0.375' }, why: '算成機率的平均' }] },
];

export const llmContent = (): LlmLessonContent => ({ tokenizers: [tokenizer()], samplers: [sampler()], embeddings: [tokenSpace(), documentSpace()], exercises: exercises() });

const p = (text: string) => ({ type: 'p' as const, text });
/** A complete LLM02-shaped lesson (llm-explorer only) that passes validateContent and publishProblems. */
export const llmLesson = (): LessonContent => ({
  lessonId: 'LLM02' as LessonContent['lessonId'],
  motivation: '模型看到的不是字，而是 token：知道文字怎麼被切開，才能估算長度與費用，也才懂為什麼中文常常比英文用掉更多 token。',
  sections: [
    { id: 'bytes', title: '從位元組開始', blocks: [
      p('位元組層級的 BPE 先把文字變成 UTF-8 位元組：英文字母一個位元組，一個中文字三個位元組。詞彙表的前 256 個 token ID 就是這 256 種位元組，所以任何文字都切得開，不會有未知字。'),
      { type: 'example', id: 'toy-bpe' }] },
    { id: 'merges', title: '合併規則與子詞斷詞', blocks: [
      p('BPE 從語料中反覆找出最常一起出現的相鄰 token 合併成新 token，學到的合併規則依序編號；斷詞時依同樣的順序套用，得到子詞斷詞的結果。特殊 token（例如 `<|endoftext|>`）整個保留，不會被拆開。'),
      p('下面的探索器也示範 temperature、top-k 與 top-p 如何改變下一個 token 的機率，以及詞的向量如何彼此靠近。'),
      { type: 'example', id: 'toy-weather' }] },
    { id: 'vectors', title: 'token ID 之後：向量', blocks: [
      p('每個 token ID 在模型裡對應 embedding 表的一列向量；整句話的文件 embedding 則由專門的模型算出。兩者都可以用餘弦相似度比較方向，探索器把它們投影到平面上。'),
      { type: 'example', id: 'word-vectors' }, { type: 'example', id: 'sentence-vectors' }] },
  ],
  examples: [], exercises: [],
  quiz: [
    { id: 'q1', prompt: '一個中文字在 UTF-8 裡是幾個位元組？', options: ['1 個', '2 個', '3 個'], answer: 2, explanation: '常用的中文字在 UTF-8 中都是三個位元組，所以沒有合併規則時一個字會變成三個 token。' },
    { id: 'q2', prompt: '詞彙表的 token ID 0–255 代表什麼？', options: ['256 種位元組', '最常見的 256 個英文單字', '特殊 token'], answer: 0, explanation: '位元組層級的 BPE 以 256 種位元組作為基本詞彙，合併規則做出的 token 從 256 開始編號。' },
    { id: 'q3', prompt: '特殊 token `<|endoftext|>` 會被怎麼處理？', options: ['拆成字元再合併', '整個當成一個 token', '直接刪除'], answer: 1, explanation: '特殊 token 在斷詞前就先被找出來，整個對應到一個固定的 token ID，不會被拆開或合併。' },
    { id: 'q4', prompt: '為什麼同一段話的中文版本常常比英文版本用掉更多 token？', options: ['中文字的位元組多，語料中的合併規則也較少', '中文不能斷詞', '模型不支援中文'], answer: 0, explanation: '每個中文字有三個位元組，如果訓練語料裡的中文合併規則不夠多，一個字就可能要好幾個 token。' },
  ],
  llm: llmContent(),
});
