import type { LessonContent } from '../schema';
import type { BpeTable } from '@/lib/llm/bpe';

/*
 * LLM02 Tokenization 斷詞 (llm-explorer: token-explorer only). Every number on the page is computed in the browser by the
 * byte-level BPE engine (src/lib/llm/bpe.ts) from the small tables below; llmContentProblems retrains every table from its
 * corpus and recomputes every exercise answer. All corpora, merges and the price per 1,000 tokens are illustrative
 * (示意資料), not any real model's tokenizer or any provider's price.
 *
 * Four explorers:
 * - llm02-en: 15 merges trained on a tiny English corpus (low / lower / newest / widest), plus <|endoftext|> (ID 271).
 * - llm02-en-zh: the same table on Chinese text: the corpus has no Chinese, so every character stays as 3 byte tokens.
 * - llm02-zh: 9 merges trained on a short Chinese corpus: 學 is built from its bytes, then 學生 and 學習; rare characters stay bytes.
 * - llm02-code: 17 merges trained on a short Python snippet: identifiers, ` +=` and newline-plus-indentation become tokens.
 *
 * Values used in the text (checked against the engine): ` lowest` → ␣low|est (IDs 260 259); `the newest` → 4 tokens with
 * the English table and 10 with the code table; `我們學習。` → 15 tokens (English table) and 8 (Chinese table);
 * `total += x` → 10 tokens (English table) and 3 (code table).
 */

/** The English corpus: its 15 merges are exactly what training learns (the validator retrains it). */
const EN_CORPUS = 'low low low lower lower newest newest newest widest widest';
const EN_TABLE: BpeTable = {
  merges: [
    ['l', 'o'], ['lo', 'w'], ['e', 's'], ['es', 't'], [' ', 'low'],
    [' ', 'n'], [' n', 'e'], [' ne', 'w'], [' new', 'est'], [' low', 'e'],
    [' lowe', 'r'], [' ', 'w'], [' w', 'i'], [' wi', 'd'], [' wid', 'est'],
  ],
  special: ['<|endoftext|>'],
};

const ZH_CORPUS = '我們學習。學生學習。老師教學生。學生上學。';
const ZH_TABLE: BpeTable = {
  merges: [
    ['<0xE5>', '<0xAD>'], ['<0xE5><0xAD>', '<0xB8>'], ['學', '<0xE7>'], ['<0xE3>', '<0x80>'], ['<0xE3><0x80>', '<0x82>'],
    ['學<0xE7>', '<0x94>'], ['學<0xE7><0x94>', '<0x9F>'], ['學<0xE7>', '<0xBF>'], ['學<0xE7><0xBF>', '<0x92>'],
  ],
};

const CODE_CORPUS = 'total = 0\ncount = 0\nfor x in data:\n    total += x\n    count += 1\nprint(total / count)\n';
const CODE_TABLE: BpeTable = {
  merges: [
    ['t', 'a'], ['n', 't'], [' ', ' '], ['t', 'o'], ['to', 'ta'], ['tota', 'l'], ['c', 'o'], ['co', 'u'], ['cou', 'nt'],
    [' ', '='], [' ', '0'], [' ', 'x'], ['\n', '  '], ['\n  ', ' '], [' ', '+'], [' +', '='], [' ', 'count'],
  ],
};

/** An illustrative price per 1,000 tokens (元), the same for every explorer so their costs compare. */
const PRICE = 0.4;

export const LLM02: LessonContent = {
  lessonId: 'LLM02',
  motivation: 'LLM01 說語言模型一次預測一個 token，可是 token 到底是什麼？模型看不到「字」，它看到的是一串整數：斷詞器（tokenizer）先把文字切成 token，再把每個 token 換成詞彙表裡的編號。切法決定了一切看得見的成本：同一句話的中文版常常比英文版用掉更多 token，一段程式碼的空白與符號也要算錢；模型能讀多長的輸入、一次呼叫要付多少費用，都以 token 計算。這一課從「為什麼不直接用字或單字」談起，親手在小語料上訓練 BPE 的合併規則、依名次一步一步套用，看中文字如何從三個位元組變成一個 token，認識 token ID 與特殊 token，最後比較中文、英文與程式碼的 token 數並估算費用。',
  sections: [
    {
      id: 'llm02-why-subword', title: '為什麼切成子詞：字元、單字與詞彙表大小',
      blocks: [
        { type: 'p', text: '模型的輸入必須是有限詞彙表（vocabulary）中的編號，所以第一個問題是：詞彙表裡放什麼？最直接的兩種想法是一個字元一個 token，或一個單字一個 token。兩者各走一個極端，問題都出在同一個取捨上：詞彙表越小，同一段文字切出的 token 越多、序列越長；詞彙表越大，序列越短，但模型要學的 embedding 列越多，而且總有沒見過的字。' },
        { type: 'table', head: ['切法', '詞彙表', '同一段文字的 token 數', '沒見過的字'], rows: [
          ['字元', '小（英文只要幾十到幾百個符號）', '最多：每個字母一個 token，序列很長', '幾乎不會發生，但每個 token 帶的意義很少'],
          ['單字', '極大：所有單字、變化形與專有名詞都要一個位置', '最少', '常常發生：新詞、錯字、罕見人名只能變成一個代表「未知」的 [UNK]'],
          ['子詞（subword）', '中等，大小由訓練時決定', '介於兩者之間', '不會發生：罕見的字拆成較小的片段，最壞拆到單一字元或位元組'],
        ] },
        { type: 'p', text: '子詞斷詞（subword tokenization）取中間：常見的單字整個是一個 token，罕見的單字拆成幾個常見的片段。例如詞彙表有 low 與 est，就算從沒看過 lowest，也能切成 low ＋ est，而不是變成 [UNK]。片段本身也帶有意義：-est、-er 這類字尾在很多單字中重複出現，模型可以共用學到的東西。今天的大型語言模型幾乎都用子詞斷詞，最常見的是 BPE（Byte Pair Encoding）以及 WordPiece、Unigram 等相近的方法；真實的詞彙表大小通常在數萬到數十萬個 token 之間。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：一個 token 就是一個字或一個單字', text: 'token 既不是字也不是單字，而是斷詞器在訓練時學到的片段。一個英文單字可能是一個 token（low），也可能是好幾個（low ＋ est）；一個中文字可能是一個 token，也可能是兩三個，甚至幾個常見的字合成一個 token。所以「這段話有幾個字」和「這段話有幾個 token」是兩個不同的問題，估算長度與費用時一定要用斷詞器實際數。' },
      ],
    },
    {
      id: 'llm02-train', title: 'BPE 怎麼從語料學出合併規則',
      blocks: [
        { type: 'p', text: 'BPE 原本是 1994 年提出的一種資料壓縮方法：反覆把最常一起出現的一對符號換成一個新符號。2016 年 Sennrich 等人把它用在神經機器翻譯，成為子詞斷詞的標準做法。它的合併規則不是人寫的，而是在一份訓練語料上數出來的：' },
        { type: 'list', ordered: true, items: [
          '預先切分：把語料切成「可選的一個前導空白＋一串字母」、一串數字或一串符號等片段，合併不會跨過片段的邊界。所以 lower 前面的空白和它屬於同一段，寫成 ␣lower。',
          '每個片段從最小的單位開始。本課用位元組層級的 BPE，最小單位是 UTF-8 位元組；英文字母各是一個位元組。',
          '數出所有相鄰 token 組合出現的次數（片段重複出現幾次就算幾次），把次數最多的一組合併成新 token，記下這條合併規則。次數相同時，選在語料中最先出現的一組。',
          '在合併後的語料上重新數，再合併次數最多的一組；重複到合併規則的數量達到目標（也就是想要的詞彙表大小），或沒有任何組合出現至少 2 次為止。',
        ] },
        { type: 'p', text: '下面的探索器用一份只有 10 個單字的英文語料：low 出現 3 次、lower 2 次、newest 3 次、widest 2 次。第 0 輪有五組都出現 5 次（l＋o、o＋w、w＋e、e＋s、s＋t），依同分規則選最先出現的 l＋o。前幾輪的結果如下，第 4 輪之後的規則請在探索器中展開「合併規則從哪裡來」自己對照。' },
        { type: 'table', head: ['輪次（名次）', '合併', '出現次數', '說明'], rows: [
          ['0', 'l ＋ o → lo', '5', '五組同為 5 次，l＋o 在語料中最先出現'],
          ['1', 'lo ＋ w → low', '5', '和 w＋e、e＋s、s＋t 同分，low 這個片段最先出現'],
          ['2', 'e ＋ s → es', '5', '來自 newest 3 次與 widest 2 次；和 s＋t 同分，e＋s 先出現'],
          ['3', 'es ＋ t → est', '5', '兩個字尾 -est 都完成了'],
        ] },
        { type: 'callout', tone: 'note', title: '探索器的資料是示意資料', text: '本課四個探索器的語料、合併規則、token ID 與每 1,000 個 token 的價格，都是課程為了說明原理寫的示意資料，不是任何真實模型的斷詞器或任何供應商的報價。真實的斷詞器在大量文字上訓練出數萬條以上的合併規則，原理和這裡相同。' },
        { type: 'example', id: 'llm02-en' },
        { type: 'p', text: '注意語料開頭的 low 前面沒有空白，後面的 low 都有，所以訓練學到的是 ␣low（第 4 條），句首的 low 則由第 1 條做出。訓練到第 14 條時，語料中的每個片段都已是一個 token（low、␣low、␣lower、␣newest、␣widest），再也沒有出現 2 次以上的組合，訓練就停了。' },
      ],
    },
    {
      id: 'llm02-encode', title: '斷詞：依名次逐步套用合併規則',
      blocks: [
        { type: 'p', text: '斷一段新文字時，BPE 用的是同一份合併表，而且順序和訓練時一樣：先把文字預先切分、變成位元組，然後在所有片段中找出名次最低（最早學到）的可用組合，把它在每個地方都合併；再找下一個名次最低的可用組合，直到沒有任何規則用得上。用探索器的「下一步」可以看到每一步套用哪一條規則。以 ␣lowest 為例：' },
        { type: 'table', head: ['步驟', '套用的規則', '之後的 token', '個數'], rows: [
          ['0', '（還沒合併，每個位元組一個 token）', '␣ | l | o | w | e | s | t', '7'],
          ['1', '第 0 條 l ＋ o', '␣ | lo | w | e | s | t', '6'],
          ['2', '第 1 條 lo ＋ w', '␣ | low | e | s | t', '5'],
          ['3', '第 2 條 e ＋ s', '␣ | low | es | t', '4'],
          ['4', '第 3 條 es ＋ t', '␣ | low | est', '3'],
          ['5', '第 4 條 ␣ ＋ low', '␣low | est', '2'],
        ] },
        { type: 'p', text: '第 5 步之後只剩 ␣low 與 est 兩個 token，合併表裡沒有 ␣low ＋ est，斷詞結束。新單字 lowest 從沒在語料中出現，卻能用學過的兩個片段表示，這就是子詞斷詞處理未知字的方式。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：不照名次合併，或找最長的 token', text: '合併表裡有第 9 條 ␣low ＋ e → ␣lowe，看起來可以把 ␣lowest 切成更長的 ␣lowe。可是第 2 條 e ＋ s 名次更低，會先把 e 用掉；照規則斷詞的結果是 ␣low | est。如果先套用第 9 條，會得到 ␣lowe | s | t，這是這個斷詞器永遠不會產生的切法。BPE 不是「找詞彙表中最長的 token」，而是嚴格依照訓練時學到的順序重播合併。' },
        { type: 'callout', tone: 'tip', title: '開頭的空白是 token 的一部分', text: '預先切分把單字前面的空白和單字放在同一段，所以 low（句首）與 ␣low（句中）是兩個不同的 token，ID 也不同（257 與 260）。探索器把空白畫成 ␣；本課的練習寫 token 時也要把開頭的空白寫成 ␣，例如 ␣low | est。少了這個空白，答案就是另一串 token。' },
      ],
    },
    {
      id: 'llm02-bytes', title: '位元組層級 BPE：一個中文字為什麼是好幾個 token',
      blocks: [
        { type: 'p', text: '位元組層級（byte-level）的 BPE 不從字元開始，而是從 UTF-8 位元組開始，GPT-2 起的許多模型都採用這種做法。好處是詞彙表的前 256 個 token 就涵蓋所有可能的位元組，任何語言、表情符號或亂碼都切得開，永遠不需要 [UNK]。代價是非英文字母的字元要用好幾個位元組表示：' },
        { type: 'table', head: ['字元', 'UTF-8 位元組（十六進位）', '位元組數'], rows: [
          ['a', '61', '1'],
          ['␣（空白）', '20', '1'],
          ['學', 'E5 AD B8', '3'],
          ['生', 'E7 94 9F', '3'],
          ['。（全形句號）', 'E3 80 82', '3'],
        ] },
        { type: 'p', text: '常用的中文字在 UTF-8 中都是 3 個位元組，表情符號多半是 4 個。如果訓練語料裡沒有中文，就不會有任何合併規則把這 3 個位元組合起來，每個中文字就是 3 個 token。下面的探索器用的是和上一個探索器同一份英文合併表，打開「顯示每個 token 的位元組」可以看到每個 token 都只是一個位元組，探索器把它寫成 <0xE5> 這種形式。' },
        { type: 'example', id: 'llm02-en-zh' },
        { type: 'p', text: '換一份有中文的語料，情況就不同了。下面的斷詞器在四個短句上訓練：學 出現 6 次，所以第 0、1 條規則先把 E5 ＋ AD、再把 E5AD ＋ B8 合成「學」；接著學到「學生」與「學習」這兩個常見的詞，連同句號也變成一個 token。可是語料裡只出現一次的字（我、們、上）和沒出現過的字（例如校）都沒有任何規則，仍然各是 3 個位元組 token。' },
        { type: 'example', id: 'llm02-zh' },
        { type: 'p', text: '第 2 條規則做出的 token 是「學」加上「生」或「習」的第一個位元組，寫成 學<0xE7>：BPE 只看位元組出現的次數，不知道字元的邊界，所以 token 不一定是完整的字。這不影響正確性，把所有 token 的位元組接起來，仍然能解碼回原文。' },
      ],
    },
    {
      id: 'llm02-ids', title: 'token ID、詞彙表與特殊 token',
      blocks: [
        { type: 'p', text: '斷詞的最後一步是把每個 token 換成整數編號，也就是 token ID；模型真正讀到的是這串 ID，每個 ID 對應 embedding 表中的一列向量（下一課 LLM03 的主題）。本課的詞彙表由合併表決定，編號規則如下：' },
        { type: 'table', head: ['ID 範圍', '內容', '英文探索器中的例子'], rows: [
          ['0–255', '256 種位元組，每個 ID 就是那個位元組的值', '32 是空白，108 是 l，229 是 0xE5'],
          ['256 起', '第 r 條合併規則做出的 token，ID 是 256 ＋ r', '256 是 lo，259 是 est，260 是 ␣low，270 是 ␣widest'],
          ['最後', '特殊 token，依列出的順序編號', '271 是 <|endoftext|>'],
        ] },
        { type: 'p', text: '特殊 token（special token）是有特別用途的符號，例如 <|endoftext|> 標示一份文件的結束，聊天模型也用特殊 token 標出每段訊息由誰說。斷詞器在做任何其他處理之前，先在文字中找出特殊 token，把它整個對應到一個 ID，不拆開、也不和旁邊的 token 合併。所以 ␣lowest<|endoftext|> 是 3 個 token：␣low、est 與 <|endoftext|>。因為特殊 token 會被當成控制訊號，實際系統通常不讓使用者輸入的文字直接變成特殊 token。' },
        { type: 'p', text: '反過來，解碼（decode）就是把每個 ID 的位元組依序接起來，再當成 UTF-8 讀回文字。探索器顯示的「解碼回文字」與原文相同，表示斷詞沒有遺失任何資訊。同一段文字換一個斷詞器，ID 完全不同：「學」在中文探索器是 ID 257，在英文探索器則是三個 ID 229、173、184。所以 token ID 只在同一個斷詞器之內有意義，模型與它的斷詞器必須一起使用。' },
      ],
    },
    {
      id: 'llm02-count-cost', title: '中文、英文與程式碼的 token 數與費用估算',
      blocks: [
        { type: 'p', text: '同一個斷詞器切不同種類的文字，token 數差異很大，原因都在訓練語料：語料中常見的片段才會被合併。英文常見單字（連同前面的空白）多半整個是一個 token；中文要看語料中有多少中文，學到的字越少，越多字停在 2–3 個位元組；程式碼有大量空白、縮排、符號與自訂的變數名稱，在以自然語言為主的語料上訓練的斷詞器處理程式碼時，常常一個符號就是一個 token。下面的探索器在一小段 Python 程式上訓練，學到了 total、count、␣+= 以及「換行＋縮排」這些程式中常見的片段。' },
        { type: 'example', id: 'llm02-code' },
        { type: 'table', head: ['文字', '斷詞器的訓練語料', '字元數', '位元組數', 'token 數'], rows: [
          ['the newest', '英文', '10', '10', '4'],
          ['the newest', '程式碼', '10', '10', '10'],
          ['我們學習。', '英文', '5', '15', '15'],
          ['我們學習。', '中文', '5', '15', '8'],
          ['total += x', '英文', '10', '10', '10'],
          ['total += x', '程式碼', '10', '10', '3'],
        ] },
        { type: 'p', text: '模型的上下文長度與 API 的計費都以 token 計算，所以估算費用的公式是：費用 ＝ token 數 × 每 1,000 個 token 的價格 ÷ 1,000。許多服務對輸入與輸出的 token 分開計價，兩者都要算進去。以本課的示意價格每 1,000 個 token 0.4 元為例，一段 2,000 個 token 的提示加上 500 個 token 的回覆，共 2,500 個 token，費用是 2,500 × 0.4 ÷ 1,000 ＝ 1 元。英文常見的經驗法則是一個 token 約四個字元，但這只是粗估，換一種語言、換一個斷詞器就不準；需要準確的數字時，要用模型實際使用的斷詞器去數。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：用字數或位元組數代替 token 數', text: '「我們學習。」有 5 個字、15 個位元組；英文斷詞器切出 15 個 token，中文斷詞器只切出 8 個。拿字數估算會低估，拿位元組數估算在有中文合併規則的斷詞器上又會高估。另一個常見的計算錯誤是忘了除以 1,000：價格是「每 1,000 個 token」，15 個 token 的費用是 15 × 0.4 ÷ 1,000 ＝ 0.006 元，不是 6 元。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'llm02-q-subword', prompt: '大型語言模型多半用子詞（subword）當 token，而不是用整個單字。主要原因是什麼？',
      options: ['子詞讓詞彙表可以無限擴充，不必事先決定大小', '常見的單字整個保留、罕見的單字拆成常見片段，詞彙表大小固定又不會遇到未知字', '子詞讓每個 token 剛好對應一個字元，方便計算長度', '子詞斷詞不需要任何訓練語料，可以直接套用到所有語言'],
      answer: 1, explanation: '子詞斷詞在詞彙表大小與序列長度之間取中間：常見詞是一個 token，罕見詞拆成學過的片段（最壞拆到位元組），所以不需要 [UNK]。詞彙表大小是訓練時就決定的，不會無限擴充；子詞不一定是一個字元（low 有三個字元）；BPE 的合併規則正是從訓練語料數出來的，不是不用訓練。',
    },
    {
      id: 'llm02-q-cjk', prompt: '用位元組層級的 BPE 斷詞，訓練語料完全沒有中文。一個常用的中文字會變成幾個 token？',
      options: ['1 個，因為一個字就是一個字元', '1 個代表未知字的 [UNK]', '2 個，中文字是雙位元組', '3 個，每個 UTF-8 位元組一個 token'],
      answer: 3, explanation: '常用中文字在 UTF-8 中是 3 個位元組，沒有任何合併規則能把它們合起來，所以是 3 個位元組 token。位元組層級的 BPE 用 256 個位元組 token 涵蓋一切，不需要 [UNK]；「一個字一個 token」要靠語料學到合併規則；「雙位元組」是舊式編碼（如 Big5）的說法，UTF-8 的常用中文字是 3 個位元組。',
    },
    {
      id: 'llm02-q-order', prompt: '英文斷詞器的合併表中第 2 條是 e ＋ s，第 9 條是 ␣low ＋ e。斷詞 ␣lowest 時，字母 e 可以和左邊合成 ␣lowe，也可以和右邊合成 es。照 BPE 的規則會怎麼做？',
      options: ['e ＋ s 先合併，因為名次較低的規則優先，結果是 ␣low | est', '␣low ＋ e 先合併，因為做出的 token 比較長，結果是 ␣lowe | s | t', '由左到右，先遇到的 ␣low ＋ e 先合併，結果是 ␣lowe | s | t', '兩條都套用，e 同時屬於 ␣lowe 與 es 兩個 token'],
      answer: 0, explanation: 'BPE 斷詞時依訓練學到的名次重播合併：每一步選名次最低的可用組合，所以第 2 條 e ＋ s 先用掉 e，結果是 ␣low | est。它不找最長的 token，也不是由左到右先遇到就合併；一個位元組只能屬於一個 token，不可能同時合併到兩邊。',
    },
    {
      id: 'llm02-q-special', prompt: '斷詞器怎麼處理文字中的特殊 token <|endoftext|>？',
      options: ['和一般文字一樣拆成位元組，再依合併規則合併', '直接刪掉，因為它不是人類寫的文字', '在其他處理之前先找出來，整個對應到一個固定的 token ID', '只在英文文字中才會被辨認'],
      answer: 2, explanation: '特殊 token 在預先切分與合併之前就先被找出來，整個對應到詞彙表中的一個 ID（英文探索器中是 271），不拆開也不和旁邊合併。若拆成位元組，模型就看不到這個控制訊號；它不會被刪除，ID 仍然送進模型；辨認特殊 token 與文字是哪種語言無關。',
    },
    {
      id: 'llm02-q-languages', prompt: '同一段內容，中文版常常比英文版用掉更多 token。最主要的原因是什麼？',
      options: ['中文字的筆畫比英文字母多，模型要更多 token 才看得清楚', '斷詞器的訓練語料若中文較少，學到的中文合併規則就少，許多字停在 2–3 個位元組 token', '中文沒有空白，所以斷詞器無法切分中文', '服務商對中文每個 token 收比較高的價格'],
      answer: 1, explanation: 'token 數取決於語料中學到哪些合併：英文常見單字多半是一個 token，中文要看語料有多少中文，沒學到的字是 3 個位元組 token。筆畫與斷詞無關，斷詞器看的是位元組；中文沒有空白一樣能斷詞，只是整句是同一個預先切分的片段；計價以 token 為單位、不分語言，中文貴是因為 token 多，不是單價較高。',
    },
    {
      id: 'llm02-q-cost', prompt: '以示意價格每 1,000 個 token 0.4 元計（輸入與輸出同價），一次呼叫送出 1,500 個 token 的提示、收到 500 個 token 的回覆，費用是多少？',
      options: ['0.8 元', '800 元', '0.6 元', '0.2 元'],
      answer: 0, explanation: '輸入與輸出都要計費：(1,500 ＋ 500) × 0.4 ÷ 1,000 ＝ 0.8 元。800 元是忘了除以 1,000；0.6 元只算了提示；0.2 元只算了回覆。實際估算時要先用模型的斷詞器數出 token 數，再套這個公式。',
    },
    {
      id: 'llm02-q-space', prompt: '在本課的英文斷詞器中，句首的 low 和句中的 ␣low 有什麼關係？',
      options: ['是同一個 token，空白在斷詞前就被丟掉了', '空白永遠自己是一個 token，所以兩者都切成 low 加上空白', '只有大小寫不同時才會是不同的 token，空白不影響', '是兩個不同的 token，開頭的空白是 token 的一部分，ID 也不同'],
      answer: 3, explanation: '預先切分把單字前的空白和單字放在同一段，訓練學到 ␣low（ID 260），句首沒有空白的 low 則是 ID 257。斷詞器不會丟掉空白，否則解碼就無法還原原文；空白也不一定自成一個 token，常見的「空白＋單字」會合併；大小寫不同確實是不同 token，但空白同樣會造成不同 token。',
    },
    {
      id: 'llm02-q-vocab', prompt: '把斷詞器的詞彙表從 1 萬個 token 擴大到 20 萬個，最直接的影響是什麼？',
      options: ['從此再也不會遇到未知字，因為詞彙表夠大', '每個 token 的費用自動降為原本的一半', '同一段文字的 token 數通常變少，但 embedding 表變大，罕見 token 的訓練樣本也變少', '斷詞時不再需要依照合併規則的名次'],
      answer: 2, explanation: '詞彙表越大，能整個保留的片段越多，序列變短；代價是 embedding 表與輸出層多出許多列，而且很多 token 在訓練資料中很少出現，學得不好。位元組層級 BPE 本來就不會有未知字，跟詞彙表大小無關；單價由服務決定，不會因此減半；合併仍然要依名次套用。',
    },
  ],
  llm: {
    tokenizers: [
      {
        id: 'llm02-en', title: '英文小語料訓練出的 BPE',
        description: '在 `low low low lower lower newest newest newest widest widest` 上訓練出 15 條合併規則，另有特殊 token `<|endoftext|>`（示意資料）。輸入新的英文文字，用「下一步」看合併依名次一條一條套用。',
        table: EN_TABLE, text: 'the newest', presets: [' widest<|endoftext|>', 'lowest newest'], pricePer1k: PRICE,
        training: { corpus: EN_CORPUS },
      },
      {
        id: 'llm02-en-zh', title: '同一個英文斷詞器遇到中文',
        description: '和上一個探索器完全相同的合併表（示意資料）。訓練語料沒有中文，所以沒有任何規則能合併中文字的位元組：勾選「顯示每個 token 的位元組」，看每個字變成幾個 token。',
        table: EN_TABLE, text: '我們學習。', presets: ['學生', ' 學生'], pricePer1k: PRICE,
        training: { corpus: EN_CORPUS },
      },
      {
        id: 'llm02-zh', title: '中文短句訓練出的 BPE',
        description: '在四個中文短句上訓練出 9 條合併規則（示意資料）：常見的「學」「學生」「學習」與句號變成 token，只出現一次的字仍是位元組。',
        table: ZH_TABLE, text: '我們學習。', presets: ['學校', '上學'], pricePer1k: PRICE,
        training: { corpus: ZH_CORPUS },
      },
      {
        id: 'llm02-code', title: '一小段程式碼訓練出的 BPE',
        description: '在 6 行 Python 程式上訓練出 17 條合併規則（示意資料）：變數名稱、`␣+=` 與「換行＋縮排」成為 token；沒學過的變數名稱大多一個字母一個 token。',
        table: CODE_TABLE, text: 'total += x', presets: ['for y in data:\n    count += 1\n', 'the newest'], pricePer1k: PRICE,
        training: { corpus: CODE_CORPUS },
      },
    ],
    exercises: [
      {
        id: 'llm02-x-lowest', kind: 'choice', title: '把 the lowest 切成 token',
        statement: '在「英文小語料訓練出的 BPE」中輸入 `the lowest`，用「下一步」一步一步看合併。最後的 token 是哪一串？（token 之間用 | 分開，開頭的空白寫成 ␣。）',
        query: { of: 'tokens', explorer: 'llm02-en', text: 'the lowest' },
        options: ['t|h|e|low|est', 't|h|e|␣lowe|s|t', 't|h|e|␣low|est', 'the|␣lowest'], answer: 2,
        hints: ['預先切分先把文字切成 the 與 ␣lowest 兩段，合併不會跨過這個邊界。', '每一步只看「現在用得上的規則中名次最低的一條」，不是找最長的 token。', '空白和後面的單字屬於同一段，可以被合併進 token。'],
        explanation: 'the 沒有任何規則用得上，t、h、e 各是一個 token。␣lowest 依名次套用：第 0 條 l＋o、第 1 條 lo＋w、第 2 條 e＋s、第 3 條 es＋t、第 4 條 ␣＋low，得到 ␣low | est；之後沒有 ␣low＋est 的規則，斷詞結束。第 9 條 ␣low＋e 雖然存在，但 e 已被名次更低的第 2 條用掉。',
        mistakes: [
          { answer: { choice: '0' }, why: '忘了開頭的空白：句中的 ␣low 和句首的 low 是不同的 token' },
          { answer: { choice: '1' }, why: '先套用第 9 條 ␣low＋e，沒有依名次讓第 2 條 e＋s 先合併' },
          { answer: { choice: '3' }, why: '以為整個英文單字一定是一個 token，但語料裡沒有 the，也沒有 ␣lowest' },
        ],
      },
      {
        id: 'llm02-x-school', kind: 'field', title: '「學校」的 token',
        statement: '在「中文短句訓練出的 BPE」中按範例文字「學校」，依序寫出它的 token，用 | 分開；不是完整字元的位元組照探索器的寫法寫成 <0xHH>。',
        blank: { id: 'tokens', label: 'token（用 | 分開）', query: { of: 'tokens', explorer: 'llm02-zh', text: '學校' }, answer: '學|<0xE6>|<0xA0>|<0xA1>' },
        hints: ['兩個字各 3 個位元組，一開始是 6 個 token。', '語料裡「學」出現很多次，「校」一次也沒有出現。'],
        explanation: '第 0、1 條規則把「學」的 3 個位元組合成一個 token；第 2 條要求「學」後面接 E7 開頭的字，可是「校」的位元組是 E6 A0 A1，沒有任何規則用得上，所以留下 3 個位元組 token，共 4 個 token。',
        mistakes: [
          { answer: { value: '學|校' }, why: '以為每個中文字都是一個 token，但「校」不在訓練語料中' },
          { answer: { value: '學校' }, why: '以為常見的詞一定整個是一個 token' },
          { answer: { value: '<0xE5>|<0xAD>|<0xB8>|<0xE6>|<0xA0>|<0xA1>' }, why: '只拆成位元組，忘了套用把「學」合起來的規則' },
        ],
      },
      {
        id: 'llm02-x-next-merge', kind: 'choice', title: '下一條合併規則',
        statement: '英文語料的前 4 條合併規則是 l＋o、lo＋w、e＋s、es＋t。套用這 4 條之後，語料中的片段變成 low、␣ low、␣ low e r、␣ n e w est、␣ w i d est（各出現 1、2、2、3、2 次）。先自己數一數，第 4 條（名次 4）會合併出哪個 token？再展開探索器的「合併規則從哪裡來」核對。',
        query: { of: 'trained-merge', explorer: 'llm02-en', rank: 4 },
        options: ['␣n', 'lowe', '␣low', '␣w'], answer: 2,
        hints: ['每個組合的次數要乘上片段出現的次數。', '␣ 後面接 low 的不只 ␣low 這個片段，␣lower 裡也有。'],
        explanation: '␣＋low 出現在 ␣low（2 次）與 ␣lower（2 次），共 4 次，是最多的；␣＋n、n＋e、e＋w、w＋est 都來自 ␣newest，各 3 次；low＋e 與 ␣＋w 各 2 次。所以第 4 條是 ␣＋low → ␣low（ID 260）。',
        mistakes: [
          { answer: { choice: '0' }, why: '只數了單獨的 ␣low 片段，漏了 ␣lower 裡也有 ␣＋low，於是以為 3 次的 ␣＋n 最多' },
          { answer: { choice: '1' }, why: '只看 lower 裡的 low＋e，沒有比較各組合的出現次數' },
        ],
      },
      {
        id: 'llm02-x-sentence', kind: 'number', title: '一句英文的 token 數',
        statement: '用「英文小語料訓練出的 BPE」斷詞 `low lower lowest newer`，一共有幾個 token？',
        blank: { id: 'count', label: 'token 數', query: { of: 'token-count', explorer: 'llm02-en', text: 'low lower lowest newer' }, answer: 7, tolerance: 0 },
        hints: ['句首的 low 沒有空白，後面三個單字前面都有空白。', 'newer 不在語料中：看看 ␣new 之後還剩哪些位元組。'],
        explanation: '切成 low | ␣lower | ␣low | est | ␣new | e | r，共 7 個 token。lowest 拆成兩個片段，newer 只有 ␣new 學過，e、r 各是一個 token；4 個單字、22 個字元都不是 token 數。',
        mistakes: [
          { answer: { value: '4' }, why: '數的是單字，以為每個單字一個 token' },
          { answer: { value: '22' }, why: '數的是字元（包含空白），不是 token' },
          { answer: { value: '6' }, why: '以為 newer 會切成 ␣new 與 er，但合併表裡沒有 e＋r' },
        ],
      },
      {
        id: 'llm02-x-ids', kind: 'field', title: 'token ID',
        statement: '在英文探索器中輸入 ` lowest<|endoftext|>`，寫出它的 token ID，用空白分開。',
        blank: { id: 'ids', label: 'token ID（用空白分開）', query: { of: 'token-ids', explorer: 'llm02-en', text: ' lowest<|endoftext|>' }, answer: '260 259 271' },
        hints: ['第 r 條合併規則做出的 token，ID 是 256 ＋ r。', '特殊 token 的 ID 排在所有合併規則之後。'],
        explanation: '␣low 是第 4 條規則（256 ＋ 4 ＝ 260），est 是第 3 條（259）；合併表有 15 條，所以 <|endoftext|> 的 ID 是 256 ＋ 15 ＝ 271。',
        mistakes: [
          { answer: { value: '257 259 271' }, why: '忘了開頭的空白，寫成句首 low 的 ID 257' },
          { answer: { value: '260 259 256' }, why: '以為特殊 token 緊接在位元組之後，ID 是 256' },
          { answer: { value: '260 259' }, why: '漏了特殊 token：它整個是一個 token，也有自己的 ID' },
        ],
      },
      {
        id: 'llm02-x-zh', kind: 'table', title: '中文在兩個斷詞器下的 token 數',
        statement: '把 `學生學習。` 分別輸入「同一個英文斷詞器遇到中文」與「中文短句訓練出的 BPE」，填出它的 UTF-8 位元組數，以及兩個斷詞器各切出幾個 token。',
        blanks: [
          { id: 'bytes', label: 'UTF-8 位元組數', query: { of: 'byte-count', explorer: 'llm02-en-zh', text: '學生學習。' }, answer: 15, tolerance: 0 },
          { id: 'en', label: '英文斷詞器的 token 數', query: { of: 'token-count', explorer: 'llm02-en-zh', text: '學生學習。' }, answer: 15, tolerance: 0 },
          { id: 'zh', label: '中文斷詞器的 token 數', query: { of: 'token-count', explorer: 'llm02-zh', text: '學生學習。' }, answer: 3, tolerance: 0 },
        ],
        hints: ['常用中文字與全形句號在 UTF-8 中都是 3 個位元組。', '英文語料沒有中文，所以沒有規則能合併這些位元組。', '中文語料學到了「學生」「學習」與句號。'],
        explanation: '5 個字元 × 3 ＝ 15 個位元組。英文斷詞器沒有任何中文合併規則，15 個位元組就是 15 個 token；中文斷詞器切成 學生 | 學習 | 。，只有 3 個。同一段文字的 token 數取決於斷詞器的訓練語料。',
        mistakes: [
          { answer: { bytes: '5', en: '5', zh: '3' }, why: '把一個中文字當成一個位元組，以為英文斷詞器也是一個字一個 token' },
          { answer: { bytes: '15', en: '15', zh: '5' }, why: '以為中文斷詞器一個字一個 token，沒注意「學生」「學習」各合成一個 token' },
          { answer: { bytes: '15', en: '5', zh: '3' }, why: '數的是英文斷詞器下的字元數，不是 token 數' },
        ],
      },
      {
        id: 'llm02-x-code', kind: 'table', title: '程式碼的 token 數',
        statement: '把 `mean = total / count` 分別輸入「一小段程式碼訓練出的 BPE」與「英文小語料訓練出的 BPE」，各切出幾個 token？',
        blanks: [
          { id: 'code', label: '程式碼斷詞器的 token 數', query: { of: 'token-count', explorer: 'llm02-code', text: 'mean = total / count' }, answer: 10, tolerance: 0 },
          { id: 'en', label: '英文斷詞器的 token 數', query: { of: 'token-count', explorer: 'llm02-en', text: 'mean = total / count' }, answer: 20, tolerance: 0 },
        ],
        hints: ['預先切分把這行切成 mean、␣=、␣total、␣/、␣count 五段。', '程式碼語料學到的是沒有空白的 total，以及有空白的 ␣count 與 ␣=。'],
        explanation: '程式碼斷詞器切成 m | e | a | n | ␣= | ␣ | total | ␣ | / | ␣count，共 10 個：mean 沒學過，一個字母一個 token；␣total 只學過不帶空白的 total，空白另成一個 token。英文斷詞器沒有任何用得上的規則，20 個字元就是 20 個位元組 token。',
        mistakes: [
          { answer: { code: '5', en: '5' }, why: '以空白切開數片段，以為每段都是一個 token' },
          { answer: { code: '20', en: '20' }, why: '數的是字元，沒有套用程式碼斷詞器學到的合併' },
          { answer: { code: '9', en: '20' }, why: '以為 ␣total 是一個 token：程式碼語料學到的是不帶空白的 total' },
        ],
      },
      {
        id: 'llm02-x-cost', kind: 'table', title: '估算一段中文提示的費用',
        statement: '用「中文短句訓練出的 BPE」斷詞 `老師教學生。`，數出 token 數，再以每 1,000 個 token 0.4 元（示意價格）估算費用（元）。',
        blanks: [
          { id: 'tokens', label: 'token 數', query: { of: 'token-count', explorer: 'llm02-zh', text: '老師教學生。' }, answer: 11, tolerance: 0 },
          { id: 'cost', label: '費用（元）', query: { of: 'cost', explorer: 'llm02-zh', text: '老師教學生。' }, answer: 0.0044, tolerance: 0.0001 },
        ],
        hints: ['老、師、教在語料中只出現一次，沒有合併規則。', '費用 ＝ token 數 × 每 1,000 個 token 的價格 ÷ 1,000。'],
        explanation: '老、師、教各是 3 個位元組 token（9 個），加上「學生」與「。」共 11 個 token；11 × 0.4 ÷ 1,000 ＝ 0.0044 元。',
        mistakes: [
          { answer: { tokens: '6', cost: '0.0024' }, why: '數的是字元，以為一個字一個 token' },
          { answer: { tokens: '18', cost: '0.0072' }, why: '數的是位元組，沒有套用「學生」與句號的合併規則' },
          { answer: { tokens: '11', cost: '4.4' }, why: '忘了除以 1,000：價格是每 1,000 個 token' },
        ],
      },
    ],
  },
};
