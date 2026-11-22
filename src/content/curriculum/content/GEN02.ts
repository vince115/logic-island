import type { LessonContent } from '../schema';
import type { Candidate, ToyContext } from '@/lib/llm/sampling';

const code = String.raw;

/**
 * GEN02 自回歸生成模型. A python-code + llm-explorer lesson (sampling-explorer). Every Python example and reference
 * solution uses the standard library only and was run to produce the outputs written here (the same under
 * PYTHONHASHSEED 0 and 1); randomness comes from random.Random(seed) and only its random() method, which Python keeps
 * stable for an integer seed. The explorers draw with the capability's own Mulberry32 generator, so the same seed gives
 * different numbers in Python and on the page; the lesson says so where it matters.
 *
 * Three recorded toy models (示意資料, not any real model's output):
 * - gen02-sentence: a subject–verb–object sentence with full-prefix contexts for the first two words and the last word
 *   only after that, for the chain rule (P(我 喜歡 貓 。) = 0.144 < P(他 養 狗 。) = 0.1904, so greedy is not the most
 *   probable sentence). The same numbers are in the first Python example.
 * - gen02-chars: the character-level bigram table of the sampler example and the first two exercises.
 * - gen02-repeat: a word-level bigram table where greedy decoding cycles 天氣 很 好 ， forever; the same table is in the
 *   greedy-loop example and exercise (its `*` row is the explorer's [] context).
 * llmContentProblems recomputes every explorer exercise answer from these models.
 */
const ctx = (context: string[], candidates: [string, number][]): ToyContext =>
  ({ context, candidates: candidates.map(([token, probability]): Candidate => ({ token, probability })) });

export const GEN02: LessonContent = {
  lessonId: 'GEN02',
  motivation: '聊天機器人寫出的一整段回答、逐像素畫出的圖、一個樣本接一個樣本合成的語音，背後可以是同一個想法：把「整份輸出的機率」拆成「下一個 token 在前文之下的機率」，再一次預測、選出、接上一個 token。這就是自回歸生成模型。看懂它，就能解釋很多日常現象：為什麼回答是一個字一個字冒出來的、為什麼 temperature 設成 0 時模型有時會一再重複同一句話、為什麼長的輸出比較慢、為什麼模型的錯誤會越滾越大。本課從機率的連鎖律出發，用 Python 寫出一個字元級的自回歸取樣器，親手實作 greedy、temperature、top-k 與 top-p，用 log 機率替整句打分數並看到連乘的下溢，再說明訓練時的 teacher forcing 與推論時的差別，最後看圖像與音訊怎麼先變成 token，以及一次一個 token 在速度與品質上的代價。',
  sections: [
    {
      id: 'gen02-chain', title: '連鎖律分解：把整句的機率拆成逐步的條件機率',
      blocks: [
        { type: 'p', text: 'GEN01 說過，生成模型學的是資料的分布：哪些輸出常見、哪些罕見。對文字來說，一筆資料是一串 token x₁, x₂, …, xₙ，模型要給出整串的聯合機率 P(x₁, …, xₙ)。直接列表是不可能的：詞彙表有 50,000 個 token、長度 20 的句子就有 50,000²⁰ ≈ 9.5 × 10⁹³ 種，比可觀測宇宙的原子數還多。' },
        { type: 'p', text: 'AIF13 的乘法規則 P(a, b) = P(a) P(b | a) 反覆使用，就得到機率的連鎖律：P(x₁, …, xₙ) = P(x₁) × P(x₂ | x₁) × P(x₃ | x₁, x₂) × … × P(xₙ | x₁, …, xₙ₋₁)，簡寫成 ∏ᵢ P(xᵢ | x<ᵢ)，其中 x<ᵢ 是第 i 個 token 之前的全部 token。這個連鎖律分解把一個巨大的聯合分布，換成同一個問題問 n 次：「給定前文，下一個 token 是什麼的機率？」只要有一個模型能回答這個問題，也就是做下一個 token 預測（next-token prediction），它就定義了每一個完整序列的機率。用自己前面的輸出來預測下一個，稱為自回歸（autoregressive）。' },
        { type: 'table', head: ['第幾步', '條件機率', '查到的上文', '機率（示意資料）', '累積乘積'], rows: [
          ['1', 'p(我 | <s>)', '<s>', '0.6', '0.6'],
          ['2', 'p(喜歡 | <s> 我)', '<s> 我', '0.5', '0.3'],
          ['3', 'p(貓 | <s> 我 喜歡)', '喜歡', '0.6', '0.18'],
          ['4', 'p(。 | <s> 我 喜歡 貓)', '（其他任何上文）', '0.8', '0.144'],
        ] },
        { type: 'p', text: '<s> 是「句子開始」的記號，讓第一個 token 也有上文；結束 token「。」的機率也要乘進去，否則分不出「我 喜歡 貓」是完整的句子，還是後面還有字。下面的範例用 Fraction 精確計算同一張表，並把所有「主詞 動詞 受詞 。」的句子加起來。' },
        { type: 'example', id: 'gen02-e-chain' },
        { type: 'p', text: '十二個句子的總和是 4/5，不是 1：剩下的 1/5 屬於受詞之後接「喔」、句子還沒結束的那些序列。把所有長度、所有可能的序列都算進去，總和才是 1。連鎖律保證這件事：每一步的條件分布加起來是 1，整棵「可能的序列樹」的機率就分配得剛剛好。' },
        { type: 'p', text: '在探索器裡，用上文選單看每一步的候選。注意第三步：玩具模型沒有錄下完整的「<s> 我 喜歡」，所以用最長的、符合結尾的上文「喜歡」來回答，這正是下面的警告要說的近似。' },
        { type: 'example', id: 'gen02-sentence' },
        { type: 'callout', tone: 'warning', title: '「連鎖律是一種近似，要假設 token 彼此獨立」', text: '不對。連鎖律對任何聯合分布都精確成立，不需要任何假設；假設 token 互相獨立反而是把每個因子簡化成 P(xᵢ)，丟掉了前文。真正的近似發生在模型只看部分上文的時候：把 p(貓 | <s> 我 喜歡) 換成 p(貓 | 喜歡)，就是只看前一個詞的二元模型（bigram，馬可夫假設）。真實的 Transformer 語言模型看整個上下文視窗內的 token，但視窗有上限，而且每個條件機率都是從資料學來的估計，不是真正的機率。' },
        { type: 'callout', tone: 'note', title: '探索器用的是示意資料', text: '本課三個探索器的機率都是課程撰寫的示意資料：用小例子說明原理，數值經過驗證彼此一致，但不是任何真實模型的輸出。真實模型的詞彙表有數萬到數十萬個 token，每一步都要對全部 token 算出機率。' },
      ],
    },
    {
      id: 'gen02-loop', title: '生成迴圈：下一個 token 預測與逐步取樣',
      blocks: [
        { type: 'p', text: '有了每一步的條件分布，生成就是照連鎖律的順序抽樣：先從 p(x₁ | <s>) 抽出 x₁，再從 p(x₂ | <s> x₁) 抽出 x₂，依此類推。這樣抽出的整串序列，機率正好是那些條件機率的乘積，所以生成的結果服從模型的分布。每一步都是同樣的動作：' },
        { type: 'list', ordered: true, items: [
          '上文：開頭記號加上目前已經生成的 token。',
          '分布：模型替每個候選算出 p(下一個 | 上文)。',
          '選擇：依解碼設定 greedy 或取樣，從分布中選出一個 token。',
          '接上：把選中的 token 接到上文最後面。',
          '重複：回到第 1 步，直到選出結束 token 或達到長度上限。',
        ] },
        { type: 'p', text: '這就是逐步取樣：已經選出的 token 不會被收回，它成為下一步上文的一部分。下面的範例是一個字元級的自回歸取樣器，token 就是單一字元，上文只看前一個字元。取樣時從 random.Random(1) 抽一個 u ∈ [0, 1)，把候選依機率由大到小排好、累加機率，u 落在哪一段就選哪一個：開頭時 b 佔 [0, 0.5)、n 佔 [0.5, 0.8)、a 佔 [0.8, 1)。' },
        { type: 'example', id: 'gen02-e-sampler' },
        { type: 'p', text: '第 2 步的上文是 b，候選 a 佔 [0, 0.8)、o 佔 [0.8, 1)，u = 0.8474 落在 o 的區間，所以得到少見的「bo」開頭。同一個種子永遠抽到同一串 u，換種子就換一個字。「o」那一列的 . 與 n 同分（各 0.5），穩定排序讓它們維持列出的順序，區間仍然固定。' },
        { type: 'example', id: 'gen02-chars' },
        { type: 'callout', tone: 'note', title: 'Python 與探索器的種子不能互相對照', text: '探索器用課程共用的 Mulberry32 亂數產生器，Python 用標準函式庫的 random.Random（Mersenne Twister）。兩者同一個種子抽到的 u 不同：同一張字元表，探索器的種子 8 生成 banana，Python 的 random.Random(4) 也生成 banana，但兩邊的種子 1 結果不同。規則是一樣的：每一步抽一個 u，沿排好序的候選累加機率，第一個累計值大於 u 的就是答案。' },
      ],
    },
    {
      id: 'gen02-decoding', title: '從分布選 token：greedy、temperature、top-k 與 top-p',
      blocks: [
        { type: 'p', text: 'LLM01 介紹過四種解碼設定。這一節用 Python 親手實作，並看清楚 greedy 的兩個問題：它不保證整句最可能，也容易陷入重複。' },
        { type: 'table', head: ['設定', '做法', '效果'], rows: [
          ['greedy（T = 0）', '每一步選機率最高的 token，同分取先列出的', '不抽亂數，同一個上文永遠得到同一個結果'],
          ['temperature T', 'softmax(logits ÷ T)；除的是 logits，不是機率', 'T < 1 讓分布更集中，T > 1 讓分布更平均'],
          ['top-k', '依機率排序，只留前 k 個，重新正規化', '刪掉長尾中很不可能的 token'],
          ['top-p', '在 top-k 之後的分布上由大到小累加，留到累計第一次達到 p，重新正規化', '留下的個數隨分布形狀改變'],
        ] },
        { type: 'example', id: 'gen02-e-decoding' },
        { type: 'p', text: 'T = 0.5 讓「好」從 0.609 升到 0.842，T = 2 讓它降到 0.434；top-k = 2 只留「好」與「不錯」；top-p = 0.9 累加 0.609、0.833 還不到 0.9，加上「棒」到 0.969 才達到，所以留下三個。softmax 前先減去最大值，exp 才不會在 logits 很大時溢位。' },
        { type: 'p', text: 'greedy 每一步選眼前最好的，卻不一定得到整句最可能的序列。回到「句子的連鎖律」：greedy 第一步選「我」（0.6 勝過 0.4），得到 P(我 喜歡 貓 。) = 0.144；但「他 養 狗 。」的機率是 0.4 × 0.85 × 0.7 × 0.8 = 0.1904，更高，只是它第一步落後。要找整句更可能的序列，可以用 beam search：每一步保留機率最高的幾條部分序列，而不是只留一條；它常用在翻譯等有標準答案的任務。' },
        { type: 'p', text: 'greedy 的第二個問題是重複。下面的二元模型只看前一個 token，greedy 又不抽亂數，所以「選出的下一個 token」完全由「上文」決定。一旦某個上文第二次出現，後面的選擇就和上一次一模一樣，生成會陷入迴圈，永遠出不來；即使結束 token「。」在「好」之後有 0.45 的機率，也永遠輸給 0.55 的「，」。' },
        { type: 'example', id: 'gen02-e-greedy-loop' },
        { type: 'example', id: 'gen02-repeat' },
        { type: 'p', text: '在探索器中把 temperature 設成 0，按「下一步」看迴圈形成；再改回 temperature = 1、種子 8，取樣在「好」之後抽中「。」，四步就結束。真實模型看的是整段上文，最後一個 token 重複不代表一定進入迴圈；但用 greedy 生成長文字時，重複同一句或同一段仍是常見的現象。實務上用取樣（搭配 top-p 或 top-k），或對已經出現過的 token 降低分數的重複懲罰（repetition penalty）來減少它。' },
        { type: 'callout', tone: 'warning', title: '「greedy 選出的就是整句機率最高的句子」', text: '不是。greedy 每一步只比較眼前的候選，第一步選了 0.6 的「我」，就再也走不到第一步只有 0.4、但後面都很順的「他 養 狗 。」（0.1904 > 0.144）。要比較整句，得把每條路徑的條件機率連乘起來；可能的序列數隨長度指數成長，所以實務上只能用 beam search 之類的方法近似搜尋。另外，整句機率最高也不代表最好：機率最高的長文字常常平淡、重複，這也是開放式生成多半用取樣的原因。' },
      ],
    },
    {
      id: 'gen02-scoring', title: '替序列打分數：機率連乘與 log 機率',
      blocks: [
        { type: 'p', text: '連鎖律也能反過來用：給一段現成的文字，把每一步的條件機率乘起來，就是模型認為這段文字有多可能。這可以用來比較兩個候選回答、評估模型，也是訓練時的目標。問題是每個因子都小於 1，序列一長，乘積會小到電腦無法表示。Python 的 float 是 64 位元的雙精度浮點數，最小的正規數約 2.2 × 10⁻³⁰⁸，再小一些的次正規數到約 4.9 × 10⁻³²⁴ 為止，更小就變成 0，這稱為下溢（underflow）。' },
        { type: 'p', text: '解法是取對數：log 把乘法變成加法，log P(x₁, …, xₙ) = Σᵢ log P(xᵢ | x<ᵢ)。每一項是一個不大的負數，加起來即使是 −921 也完全沒問題。log 是遞增函數，所以兩個序列用 log 機率比較，大小順序和用機率比較一樣。' },
        { type: 'example', id: 'gen02-e-logprob' },
        { type: 'table', head: ['量', '算法', '用途'], rows: [
          ['log 機率', 'Σ log p(xᵢ | x<ᵢ)', '比較同一段文字在不同模型下、或長度相近的候選'],
          ['平均 log 機率', 'log 機率 ÷ token 數', '長度不同的序列也能比較'],
          ['交叉熵損失', '−平均 log 機率', '訓練時要最小化的量'],
          ['困惑度（perplexity）', 'e^(−平均 log 機率)', '「平均每一步像在幾個選項中猜」，越低越好'],
        ] },
        { type: 'p', text: '每多一個 token 就多乘一個小於 1 的因子，所以較長的序列機率幾乎總是較低：「我 喜歡 貓 喔 。」只多一個「喔」，機率就從 0.144 降到 0.0288。直接比較總機率會偏好短的序列；長度不同時，改看平均 log 機率或困惑度比較公平。' },
      ],
    },
    {
      id: 'gen02-training', title: '訓練與推論：teacher forcing 與 exposure bias',
      blocks: [
        { type: 'p', text: '訓練自回歸模型，就是讓訓練文字的 log 機率盡量高，也就是讓交叉熵損失 −(1/n) Σ log p(xᵢ | x<ᵢ) 盡量低。計算第 i 項時，上文 x<ᵢ 用的是資料中真正的前文，不是模型自己的預測，這稱為 teacher forcing：像老師在每一步都把正確的前半句遞給學生，只問「下一個字是什麼」。' },
        { type: 'p', text: '因為每個位置的上文都已經知道，一段長度 n 的文字可以一次算出 n 個預測：Transformer 用因果遮罩（causal mask）讓每個位置只看得到前面的位置，所有位置就能平行計算。推論時沒有正確答案可以遞，第 i 步的上文是模型自己剛生成的 token，只能一步等一步。' },
        { type: 'table', head: ['', '訓練（teacher forcing）', '推論（生成）'], rows: [
          ['上文從哪裡來', '資料中的真實前文', '模型自己生成的 token'],
          ['計算方式', '一段文字的所有位置可以平行計算', '一次一個 token，下一步要等上一步選完'],
          ['前文出錯時', '不會發生：前文永遠正確', '錯誤留在上文裡，後面每一步都受影響'],
          ['目標', '讓真實的下一個 token 機率高', '從分布中選出一個 token'],
        ] },
        { type: 'p', text: '這個落差稱為 exposure bias：模型在訓練時只看過正確的前文，從沒看過自己的錯誤。推論時一旦取樣到一個不太合適的 token，接下來的上文就和訓練資料不太像，下一步的預測也比較不可靠，錯誤可能一路累積，例如回答越寫越偏題。常見的緩解方式包括：訓練時偶爾改用模型自己的預測當前文、用更大更多樣的資料，以及在預訓練之後，用模型自己生成的回答再訓練（例如依人類偏好調整），讓它學會從自己的輸出接下去。' },
        { type: 'callout', tone: 'tip', title: '上一節的平均 log 機率就是訓練損失', text: '把「我 喜歡 貓 。」當成訓練資料，teacher forcing 下四個位置的 −log p 平均是 0.4845，也就是範例印出的平均 log 機率加上負號。訓練做的事，就是調整參數讓這個數字在大量文字上變小。' },
      ],
    },
    {
      id: 'gen02-beyond', title: '文字以外：離散 token 化、圖像與音訊，以及生成延遲',
      blocks: [
        { type: 'p', text: '連鎖律不在乎 token 代表什麼。任何資料只要能先離散化成一串 token，並排定先後順序，就能用同一套自回歸方法生成，這一步稱為離散 token 化。圖像可以依光柵順序（由上而下、由左而右）一個像素接一個像素生成，每個像素的亮度 0–255 當成 256 個類別之一；2016 年的 PixelRNN 與 PixelCNN 就是這樣做。音訊是一串波形樣本，每秒有數千到數萬個樣本，2016 年的 WaveNet 把每個樣本量化成 256 個值之一，一個樣本接一個樣本地生成。' },
        { type: 'example', id: 'gen02-e-pixels' },
        { type: 'p', text: '範例的黑白小圖中，每個像素是黑的機率取決於左邊與上面已經生成的像素，所以黑點傾向連成一小塊一小塊，而不是均勻散開。下半部的數字是代價：一張 256 × 256 的彩色圖逐像素、逐通道生成要 196,608 步，3 秒的 16 kHz 音訊要 48,000 步。所以較新的做法先訓練一個編碼器（例如 2017 年的 VQ-VAE 這類向量量化方法），把一小塊圖像或一小段音訊壓成碼本（codebook）中的一個代碼，一張圖變成例如 32 × 32 = 1,024 個圖像 token；自回歸模型生成這串代碼，再由解碼器還原成像素或波形。自編碼器是 GEN03 的主題。' },
        { type: 'p', text: '一次一個 token 的代價就是生成延遲：第 i 個 token 必須等第 i − 1 個選出來才能開始算，輸出越長就越慢。大致上，總延遲 ≈ 讀入提示、產生第一個 token 的時間 ＋ 輸出 token 數 × 每個 token 的時間。實作上會把前面位置算過的中間結果存起來重複使用（KV cache），每一步就不必重算整段上文；但它只讓每一步變快，步驟仍然必須一個接一個。' },
        { type: 'table', head: ['選擇', '品質', '速度'], rows: [
          ['token 切得細（逐像素、逐樣本）', '每個細節都由模型決定', '步數極多，生成很慢'],
          ['先壓成較少的代碼 token', '細節取決於編碼器與解碼器還原得多好', '步數少很多'],
          ['較大的模型', '條件機率通常更準確', '每一步更慢、更貴'],
          ['較長的輸出', '能寫出更完整的內容', '延遲與輸出長度大致成正比'],
        ] },
        { type: 'p', text: '自回歸的長處是每一步都能精確算出機率，可以替序列打分數，而且同一套方法適用於文字、程式碼、圖像代碼與音訊代碼。短處是生成必須循序進行，錯誤會留在上文裡。之後 GEN05 的擴散模型走另一條路：反覆修整整份輸出，每一步同時處理所有位置。' },
      ],
    },
  ],
  examples: [
    {
      id: 'gen02-e-chain', title: '連鎖律：逐步相乘條件機率',
      description: '用 Fraction 存「句子的連鎖律」探索器的條件機率；cond 以最長的、符合結尾的上文查表，sequence_prob 依連鎖律逐步相乘。印出 P(我 喜歡 貓 。) 的四個因子，再比較 P(他 養 狗 。) 與所有「主詞 動詞 受詞 。」句子的總和。',
      code: { Python: code`from fractions import Fraction as F

# 玩具模型的條件機率（示意資料），和「句子的連鎖律」探索器相同
model = {
    ('<s>',): {'我': F(6, 10), '他': F(4, 10)},
    ('<s>', '我'): {'喜歡': F(5, 10), '養': F(3, 10), '怕': F(2, 10)},
    ('<s>', '他'): {'養': F(85, 100), '喜歡': F(10, 100), '怕': F(5, 100)},
    ('喜歡',): {'貓': F(6, 10), '狗': F(4, 10)},
    ('養',): {'狗': F(7, 10), '貓': F(3, 10)},
    ('怕',): {'狗': F(7, 10), '貓': F(3, 10)},
    (): {'。': F(8, 10), '喔': F(2, 10)},  # 其他任何上文
}

def cond(prefix, token):
    """用最長的、符合結尾的上文查 p(token | prefix)。"""
    for n in range(len(prefix), -1, -1):
        ctx = tuple(prefix[len(prefix) - n:])
        if ctx in model:
            return ctx, model[ctx].get(token, F(0))

def sequence_prob(tokens, show=False):
    prefix, total = ['<s>'], F(1)
    for t in tokens:
        ctx, p = cond(prefix, t)
        total *= p  # 連鎖律：逐步乘上條件機率
        if show:
            print(f'p({t} | {" ".join(prefix)})  查上文 [{" ".join(ctx)}] = {p}  累積 {total}')
        prefix.append(t)
    return total

p1 = sequence_prob(['我', '喜歡', '貓', '。'], show=True)
print('P(我 喜歡 貓 。) =', p1, '=', float(p1))
p2 = sequence_prob(['他', '養', '狗', '。'])
print('P(他 養 狗 。) =', p2, '=', float(p2))
total = sum(sequence_prob([s, v, o, '。'])
            for s in ['我', '他'] for v in ['喜歡', '養', '怕'] for o in ['貓', '狗'])
print('12 句「主詞 動詞 受詞 。」的機率總和 =', total)` },
      output: 'p(我 | <s>)  查上文 [<s>] = 3/5  累積 3/5\np(喜歡 | <s> 我)  查上文 [<s> 我] = 1/2  累積 3/10\np(貓 | <s> 我 喜歡)  查上文 [喜歡] = 3/5  累積 9/50\np(。 | <s> 我 喜歡 貓)  查上文 [] = 4/5  累積 18/125\nP(我 喜歡 貓 。) = 18/125 = 0.144\nP(他 養 狗 。) = 119/625 = 0.1904\n12 句「主詞 動詞 受詞 。」的機率總和 = 4/5',
    },
    {
      id: 'gen02-e-sampler', title: '字元級的自回歸取樣器',
      description: '字元級的二元模型：上文只看前一個字元，<s> 是開頭、. 是結束。每一步以 random.Random(seed) 抽一個 u，沿由大到小排好的候選累加機率，選出第一個累計值大於 u 的字元，接上後成為下一步的上文。印出種子 1 的每一步，以及種子 1–8 生成的字。',
      code: { Python: code`import random
from fractions import Fraction as F

# 字元級的二元模型（示意資料）：上文只看前一個字元；<s> 是開頭，'.' 是結束
table = {
    '<s>': [('b', F('0.5')), ('n', F('0.3')), ('a', F('0.2'))],
    'b': [('a', F('0.8')), ('o', F('0.2'))],
    'a': [('n', F('0.6')), ('.', F('0.4'))],
    'n': [('a', F('0.7')), ('o', F('0.3'))],
    'o': [('.', F('0.5')), ('n', F('0.5'))],
}

def sample(rng, ctx):
    """抽一個 u ∈ [0, 1)，沿由大到小排好的候選累加機率，第一個累計值大於 u 的就是答案。"""
    u = rng.random()
    acc = 0
    ranked = sorted(table[ctx], key=lambda c: -c[1])  # sorted 是穩定的：同分維持列出的順序
    for ch, p in ranked:
        acc += p
        if u < acc:
            return u, ch
    return u, ranked[-1][0]

def generate(seed, max_len=12, show=False):
    rng = random.Random(seed)  # 固定種子：同一個種子永遠得到同一串 u
    ctx, out = '<s>', []
    for step in range(1, max_len + 1):
        u, ch = sample(rng, ctx)
        if show:
            print(f'第 {step} 步  上文 {ctx:<3}  u = {u:.4f}  → {ch}')
        if ch == '.':
            break
        out.append(ch)
        ctx = ch  # 把選中的字元接上去，成為下一步的上文
    return ''.join(out)

print('生成結果:', generate(1, show=True))
print('種子 1–8:', [generate(seed) for seed in range(1, 9)])` },
      output: '第 1 步  上文 <s>  u = 0.1344  → b\n第 2 步  上文 b    u = 0.8474  → o\n第 3 步  上文 o    u = 0.7638  → n\n第 4 步  上文 n    u = 0.2551  → a\n第 5 步  上文 a    u = 0.4954  → n\n第 6 步  上文 n    u = 0.4495  → a\n第 7 步  上文 a    u = 0.6516  → .\n生成結果: bonana\n種子 1–8: [\'bonana\', \'a\', \'bana\', \'banana\', \'nonono\', \'no\', \'ba\', \'bo\']',
    },
    {
      id: 'gen02-e-decoding', title: 'temperature、top-k 與 top-p',
      description: '對四個 token 的 logits 依序套用 temperature、排序、top-k 與 top-p，每次刪減後重新正規化；T = 0 是 greedy。印出六組設定下每個 token 的最終機率。',
      code: { Python: code`import math

tokens = ['好', '不錯', '棒', '糟']
logits = [2.0, 1.0, 0.5, -1.0]  # 模型最後一層的分數（示意資料）

def softmax(xs, T):
    scaled = [x / T for x in xs]
    m = max(scaled)  # 先減去最大值，exp 才不會溢位
    e = [math.exp(s - m) for s in scaled]
    z = sum(e)
    return [v / z for v in e]

def decode(logits, T=1.0, k=0, p=1.0):
    """temperature → 由大到小排序 → top-k → top-p，每次刪減後重新正規化。"""
    if T == 0:  # greedy：機率最高的一個（同分取先列出的）
        best = logits.index(max(logits))
        return [1.0 if i == best else 0.0 for i in range(len(logits))]
    probs = softmax(logits, T)
    keep = sorted(range(len(probs)), key=lambda i: -probs[i])
    if k > 0:
        keep = keep[:k]
    if p < 1:
        z, acc, nucleus = sum(probs[i] for i in keep), 0.0, []
        for i in keep:
            nucleus.append(i)
            acc += probs[i] / z
            if acc >= p - 1e-12:  # 跨過 p 的那一個也留下
                break
        keep = nucleus
    z = sum(probs[i] for i in keep)
    return [probs[i] / z if i in keep else 0.0 for i in range(len(probs))]

for T, k, p in [(1, 0, 1), (0.5, 0, 1), (2, 0, 1), (0, 0, 1), (1, 2, 1), (1, 0, 0.9)]:
    out = decode(logits, T, k, p)
    print(f'T={T:<3} k={k} p={p:<3} ', '  '.join(f'{t}={q:.3f}' for t, q in zip(tokens, out)))` },
      output: 'T=1   k=0 p=1    好=0.609  不錯=0.224  棒=0.136  糟=0.030\nT=0.5 k=0 p=1    好=0.842  不錯=0.114  棒=0.042  糟=0.002\nT=2   k=0 p=1    好=0.434  不錯=0.263  棒=0.205  糟=0.097\nT=0   k=0 p=1    好=1.000  不錯=0.000  棒=0.000  糟=0.000\nT=1   k=2 p=1    好=0.731  不錯=0.269  棒=0.000  糟=0.000\nT=1   k=0 p=0.9  好=0.629  不錯=0.231  棒=0.140  糟=0.000',
    },
    {
      id: 'gen02-e-greedy-loop', title: 'greedy 的重複迴圈與取樣',
      description: '和「greedy 的重複迴圈」探索器相同的詞級二元模型。greedy 記錄每個用過的上文，上文第二次出現時印出會一直重複的迴圈；同一個模型改用 random.Random(seed) 取樣，三個種子都能抽到結束 token。',
      code: { Python: code`import random

# 詞級的二元模型（示意資料），和「greedy 的重複迴圈」探索器相同；'。' 是結束 token
table = {
    '今天': [('天氣', 0.6), ('我', 0.4)],
    '天氣': [('很', 0.7), ('不錯', 0.3)],
    '很': [('好', 0.5), ('熱', 0.3), ('冷', 0.2)],
    '好': [('，', 0.55), ('。', 0.45)],
    '，': [('天氣', 0.5), ('我', 0.3), ('今天', 0.2)],
    '我': [('很', 0.6), ('想', 0.4)],
    '想': [('出門', 0.6), ('睡覺', 0.4)],
    '熱': [('。', 0.6), ('，', 0.4)],
    '冷': [('。', 0.7), ('，', 0.3)],
}
OTHER = [('。', 0.8), ('，', 0.2)]  # 不錯、出門、睡覺之後：其他任何上文

def greedy(start, max_steps):
    out, seen = [start], {}
    for _ in range(max_steps):
        ctx = out[-1]
        if ctx in seen:  # 上文只有前一個 token：同樣的上文必然選出同樣的下一個
            cycle = out[seen[ctx]:-1]
            return out, '迴圈：' + ' '.join(cycle) + ' 會一直重複'
        seen[ctx] = len(out) - 1
        best = max(table.get(ctx, OTHER), key=lambda c: c[1])[0]  # max 同分取先列出的
        out.append(best)
        if best == '。':
            return out, '生成結束 token'
    return out, '達到步數上限'

def sample(start, max_steps, seed):
    rng, out = random.Random(seed), [start]
    for _ in range(max_steps):
        u, acc = rng.random(), 0.0
        ranked = sorted(table.get(out[-1], OTHER), key=lambda c: -c[1])
        choice = ranked[-1][0]
        for tok, p in ranked:
            acc += p
            if u < acc:
                choice = tok
                break
        out.append(choice)
        if choice == '。':
            break
    return out

text, why = greedy('今天', 12)
print('greedy:', ' '.join(text), '|', why)
for seed in [1, 2, 3]:
    print(f'取樣（種子 {seed}）:', ' '.join(sample('今天', 12, seed)))` },
      output: 'greedy: 今天 天氣 很 好 ， 天氣 | 迴圈：天氣 很 好 ， 會一直重複\n取樣（種子 1）: 今天 天氣 不錯 。\n取樣（種子 2）: 今天 我 想 出門 。\n取樣（種子 3）: 今天 天氣 很 好 。',
    },
    {
      id: 'gen02-e-logprob', title: 'log 機率、平均與困惑度',
      description: '每一步機率都是 0.1 的序列：直接連乘在 330 步時下溢成 0，log 機率的加總仍然正常。再比較三個句子的機率、log 機率、平均 log 機率與困惑度。',
      code: { Python: code`import math

# 每個 token 的條件機率都是 0.1 的序列：連乘會下溢成 0，log 機率的加總不會
for n in [10, 100, 300, 330, 400]:
    prod, logp = 1.0, 0.0
    for _ in range(n):
        prod *= 0.1
        logp += math.log(0.1)  # 乘法變成加法
    print(f'n={n:>3}  連乘 = {prod:.3e}  log 機率 = {logp:9.2f}')

# 兩個句子各 token 的條件機率（示意資料）：比較總 log 機率、平均與困惑度
sentences = {
    '我 喜歡 貓 。': [0.6, 0.5, 0.6, 0.8],
    '他 養 狗 。': [0.4, 0.85, 0.7, 0.8],
    '我 喜歡 貓 喔 。': [0.6, 0.5, 0.6, 0.2, 0.8],
}
for text, probs in sentences.items():
    logp = sum(math.log(p) for p in probs)
    avg = logp / len(probs)  # 每個 token 平均的 log 機率
    print(f'{text}：機率 {math.exp(logp):.4f}  log 機率 {logp:.4f}'
          f'  平均 {avg:.4f}  困惑度 {math.exp(-avg):.4f}')` },
      output: 'n= 10  連乘 = 1.000e-10  log 機率 =    -23.03\nn=100  連乘 = 1.000e-100  log 機率 =   -230.26\nn=300  連乘 = 1.000e-300  log 機率 =   -690.78\nn=330  連乘 = 0.000e+00  log 機率 =   -759.85\nn=400  連乘 = 0.000e+00  log 機率 =   -921.03\n我 喜歡 貓 。：機率 0.1440  log 機率 -1.9379  平均 -0.4845  困惑度 1.6233\n他 養 狗 。：機率 0.1904  log 機率 -1.6586  平均 -0.4147  困惑度 1.5139\n我 喜歡 貓 喔 。：機率 0.0288  log 機率 -3.5474  平均 -0.7095  困惑度 2.0329',
    },
    {
      id: 'gen02-e-pixels', title: '逐像素生成黑白小圖',
      description: '依光柵順序生成 6 × 6 的黑白圖，每個像素是黑的機率取決於左邊與上面兩個已生成的像素（示意資料），以 random.Random(4) 取樣；再計算不同大小的圖像與音訊需要多少步。',
      code: { Python: code`import random

# 黑白小圖的自回歸模型（示意資料）：依「左邊、上面」兩個已生成的像素，給出這一格是黑（1）的機率
# 圖外的格子當成白（0）
p_black = {(0, 0): 0.1, (1, 0): 0.6, (0, 1): 0.6, (1, 1): 0.9}  # 鍵是 (左, 上)

def generate(size, seed):
    rng = random.Random(seed)
    img = [[0] * size for _ in range(size)]
    steps = 0
    for r in range(size):          # 光柵順序：由上而下、由左而右
        for c in range(size):
            left = img[r][c - 1] if c > 0 else 0
            up = img[r - 1][c] if r > 0 else 0
            img[r][c] = 1 if rng.random() < p_black[(left, up)] else 0
            steps += 1             # 每一格都是一步：一次「預測、取樣、接上」
    return img, steps

img, steps = generate(6, 4)
for row in img:
    print(''.join('#' if v else '.' for v in row))
print('6 × 6 的圖需要', steps, '步')

# 一次一個 token 的代價：步數隨輸出大小成長
cases = [('28 × 28 灰階圖，逐像素', 28 * 28),
         ('256 × 256 彩色圖，逐像素逐通道', 256 * 256 * 3),
         ('先壓成 32 × 32 個圖像 token', 32 * 32),
         ('3 秒 16 kHz 音訊，逐樣本', 3 * 16000)]
for name, n in cases:
    print(f'{name}：{n:,} 步；假設每步 10 毫秒，約 {n * 0.01:,.1f} 秒')` },
      output: '....##\n....##\n......\n......\n.#....\n.#....\n6 × 6 的圖需要 36 步\n28 × 28 灰階圖，逐像素：784 步；假設每步 10 毫秒，約 7.8 秒\n256 × 256 彩色圖，逐像素逐通道：196,608 步；假設每步 10 毫秒，約 1,966.1 秒\n先壓成 32 × 32 個圖像 token：1,024 步；假設每步 10 毫秒，約 10.2 秒\n3 秒 16 kHz 音訊，逐樣本：48,000 步；假設每步 10 毫秒，約 480.0 秒',
    },
  ],
  exercises: [
    {
      id: 'gen02-x-sampler', title: '字元級自回歸取樣器',
      statement: '讀入一張字元級的二元機率表與亂數種子，用 `random.Random(seed)` 從開頭記號 `^` 開始逐步生成字元。每一步：(1) 目前的上文是前一個字元（第一步是 `^`）；上文在表中沒有自己的一列時停止（no-context），這一步不抽亂數。(2) 呼叫一次 `rng.random()` 抽出 u，即使這一列只有一個候選也要抽。(3) 把候選依機率由大到小排序（同分維持列出的順序），由前往後累加機率，第一個累計值大於 u 的候選就是選中的字元。(4) 選中結束記號 `$` 時停止（end），`$` 不加進文字；否則把字元接到文字後面，成為下一步的上文。已經抽了 L 次仍沒有選中 `$` 時停止（max-steps）。機率用 `fractions.Fraction` 讀入並累加，float 與 Fraction 的比較是精確的。',
      inputFormat: '第一行兩個整數：種子 seed 與最多步數 L。第二行整數 N，接著 N 行，每行是一個上文與它的候選：上文是單一字元或開頭記號 `^`；候選寫成 `字元:機率`，以空白分隔，字元是單一字元或結束記號 `$`；機率是正的小數（如 0.25）或分數（如 1/4）。結尾的空行會被忽略。',
      outputFormat: '每抽一次 u 印一行 `step i: 上文 -> 選中的字元 (u=…)`，u 取 4 位小數；最後印 `text: "生成的文字"`（不含 `$`，可能是空字串）與 `stop: end`、`stop: max-steps` 或 `stop: no-context`。整份輸入格式錯誤時只印 `invalid input`：第一行不是兩個非負整數、種子大於 10^9、L 不在 1–50、N 不在 1–30、行數和 N 不符、上文不是單一字元或是 `$`、同一個上文出現兩次、某一列沒有候選、候選不是 `字元:機率`、候選是 `^`、同一列的候選重複、機率不是合法的正數或分母為 0，或某一列的機率總和不是 1。',
      constraints: ['0 ≤ seed ≤ 10^9，1 ≤ L ≤ 50，1 ≤ N ≤ 30', '字元是不含空白、不是 `:` 的單一字元，中文字也可以；`^` 只當上文，`$` 只當候選', '每一列的機率總和必須剛好是 1（用分數精確比較）', '只呼叫 `rng.random()`：Python 保證同一個整數種子得到同一串數字'],
      samples: [
        { kind: 'normal', input: '4 12\n5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n', output: 'step 1: ^ -> b (u=0.2360)\nstep 2: b -> a (u=0.1032)\nstep 3: a -> n (u=0.3961)\nstep 4: n -> a (u=0.1550)\nstep 5: a -> n (u=0.0665)\nstep 6: n -> a (u=0.4016)\nstep 7: a -> $ (u=0.9180)\ntext: "banana"\nstop: end\n', note: '課文的字元表，種子 4：生成 banana 後抽到 $' },
        { kind: 'edge', input: '4 3\n5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n', output: 'step 1: ^ -> b (u=0.2360)\nstep 2: b -> a (u=0.1032)\nstep 3: a -> n (u=0.3961)\ntext: "ban"\nstop: max-steps\n', note: '同一個種子，最多 3 步：還沒抽到 $ 就因步數上限停止' },
      ],
      tests: [
        { kind: 'normal', input: '7 10\n4\n^ a:0.2 n:0.3 b:0.5\nb a:0.8 o:0.2\na $:0.4 n:0.6\nn o:0.3 a:0.7\n', output: 'step 1: ^ -> b (u=0.3238)\nstep 2: b -> a (u=0.1508)\nstep 3: a -> $ (u=0.6509)\ntext: "ba"\nstop: end\n', note: '候選不是依機率由大到小列出：要先排序，才知道每個候選的累計區間' },
        { kind: 'normal', input: '2026 15\n4\n^ 我:1/2 你:1/4 他:1/4\n我 們:3/5 $:2/5\n你 們:3/5 $:2/5\n們 好:1\n', output: 'step 1: ^ -> 我 (u=0.1191)\nstep 2: 我 -> 們 (u=0.5025)\nstep 3: 們 -> 好 (u=0.5118)\ntext: "我們好"\nstop: no-context\n', note: '中文字元與分數機率；「好」沒有自己的一列，找不到上文就停止' },
        { kind: 'edge', input: '3 8\n3\n^ q:1\nq u:1\nu a:0.5 i:0.25 $:0.25\n', output: 'step 1: ^ -> q (u=0.2380)\nstep 2: q -> u (u=0.5442)\nstep 3: u -> a (u=0.3700)\ntext: "qua"\nstop: no-context\n', note: '只有一個候選（機率 1）的列仍然抽一個 u，之後的 u 才會對上' },
        { kind: 'edge', input: '5 10\n2\n^ x:0.5 a:0.5\nx x:0.5 a:0.5\n', output: 'step 1: ^ -> a (u=0.6229)\ntext: "a"\nstop: no-context\n', note: '兩個候選同分時維持列出的順序：x 在前，a 在後' },
        { kind: 'edge', input: '9 5\n1\nb a:1\n', output: 'text: ""\nstop: no-context\n', note: '沒有 ^ 這一列：第一步就找不到上文，不抽任何 u' },
        { kind: 'edge', input: '11 1\n2\n^ h:0.9 $:0.1\nh $:1\n', output: 'step 1: ^ -> h (u=0.4524)\ntext: "h"\nstop: max-steps\n', note: '最多 1 步' },
        { kind: 'error', input: '1 10\n2\n^ a:0.5 b:0.4\na $:1\n', output: 'invalid input\n', note: '開頭那一列的機率總和是 0.9' },
        { kind: 'error', input: '1 10\n3\n^ a:1\na $:1\na b:1\n', output: 'invalid input\n', note: '同一個上文 a 列了兩次' },
        { kind: 'error', input: '1 10\n2\n^ a:1 b:0\na $:1\n', output: 'invalid input\n', note: '機率 0 的候選不合法' },
        { kind: 'error', input: '1 10\n2\n^ ab:1\nab $:1\n', output: 'invalid input\n', note: '上文與候選都必須是單一字元' },
        { kind: 'error', input: '1 0\n1\n^ $:1\n', output: 'invalid input\n', note: '最多步數必須是 1–50' },
        { kind: 'error', input: '1 10\n3\n^ a:1\na $:1\n', output: 'invalid input\n', note: '宣告 3 列，只給了 2 列' },
        { kind: 'error', input: '1 10\n1\n^ a:0.5 a:0.5\n', output: 'invalid input\n', note: '同一列中候選 a 出現兩次' },
        { kind: 'error', input: '1 10\n1\n^ a:1/0\n', output: 'invalid input\n', note: '分母是 0' },
      ],
      hints: [
        '先寫 parse：把每一列讀成 [(字元, Fraction), …]，任何一個欄位不對就回傳 None，主程式印 `invalid input`。',
        '`sorted(row, key=lambda c: -c[1])` 依機率由大到小排序；Python 的排序是穩定的，同分時自然維持列出的順序。',
        '每一步先確認上文有沒有自己的一列，再抽 u：印出的 step 行數一定等於抽 u 的次數。',
        '常見錯誤（測資會抓到）：沒有排序就照列出的順序累加、只有一個候選時省略抽亂數、每一步重新建立 `random.Random(seed)`、把 `$` 當成普通字元繼續生成。',
      ],
      solution: { Python: code`import random
import re
import sys
from fractions import Fraction

NUMBER = re.compile(r'\d+(\.\d+)?|\d+/0*[1-9]\d*')  # 0.25 或 1/4，分母不為 0

def parse(lines):
    """回傳 (seed, maxlen, table)；格式不對時回傳 None。table[上文] = [(字元, 機率), ...]，依列出的順序。"""
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    if len(lines) < 2:
        return None
    head = lines[0].split()
    if len(head) != 2 or not all(t.isdigit() for t in head):
        return None
    seed, maxlen = int(head[0]), int(head[1])
    n = int(lines[1]) if lines[1].strip().isdigit() else 0
    if seed > 10 ** 9 or not 1 <= maxlen <= 50 or not 1 <= n <= 30 or len(lines) != 2 + n:
        return None
    table = {}
    for line in lines[2:]:
        ctx, *cands = line.split() or ['']
        if len(ctx) != 1 or ctx == '$' or ctx in table or not cands:
            return None
        row = []
        for item in cands:
            ch, colon, p = item.partition(':')
            if not colon or len(ch) != 1 or ch == '^' or not NUMBER.fullmatch(p):
                return None
            if Fraction(p) == 0 or ch in [c for c, _ in row]:
                return None
            row.append((ch, Fraction(p)))
        if sum(p for _, p in row) != 1:
            return None
        table[ctx] = row
    return seed, maxlen, table

def run(seed, maxlen, table):
    rng = random.Random(seed)
    ctx, text = '^', ''
    for step in range(1, maxlen + 1):
        if ctx not in table:
            return text, 'no-context'
        u = rng.random()  # 每一步抽一個 u，即使只有一個候選
        ranked = sorted(table[ctx], key=lambda c: -c[1])  # 穩定排序：同分維持列出的順序
        choice, acc = ranked[-1][0], 0
        for ch, p in ranked:
            acc += p
            if u < acc:  # float 與 Fraction 的比較是精確的
                choice = ch
                break
        print(f'step {step}: {ctx} -> {choice} (u={u:.4f})')
        if choice == '$':
            return text, 'end'
        text += choice
        ctx = choice
    return text, 'max-steps'

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None:
    print('invalid input')
else:
    text, stop = run(*parsed)
    print(f'text: "{text}"')
    print(f'stop: {stop}')` },
      judge: 'none',
    },
    {
      id: 'gen02-x-logprob', title: '序列的 log 機率與下溢',
      statement: '讀入同樣格式的字元級二元機率表，對每個字串計算它在模型下的機率。依連鎖律，字串 c₁c₂…cₙ 的機率是 p(c₁ | ^) × p(c₂ | c₁) × … × p(cₙ | cₙ₋₁) × p($ | cₙ)，共 n + 1 個因子：開頭的 `^` 與最後的結束記號 `$` 都要算。只要有一個因子在表中查不到（沒有那個上文，或那一列沒有那個候選），機率就是 0，印 `impossible`。否則印出四個數：logp 是各因子自然對數（`math.log`）的總和；avg 是 logp ÷ (n + 1)，每一步平均的 log 機率；ppl 是困惑度 e^(−avg)；prod 是把各因子轉成 float 後依序相乘的結果，用來觀察下溢。',
      inputFormat: '第一行整數 N，接著 N 行機率表，格式和「字元級自回歸取樣器」相同。下一行整數 Q，接著 Q 行，每行一個要評分的字串。結尾的空行會被忽略。',
      outputFormat: '每個字串印一行 `字串: logp=… avg=… ppl=… prod=…`：logp、avg、ppl 取 4 位小數，prod 用 `{:.3e}` 格式；機率為 0 時印 `字串: impossible`。字串是空行、含空白、含 `^` 或 `$`、或超過 1000 個字元時，那一行印 `error: bad text`。機率表格式錯誤（規則和上一題相同）、N 不在 1–30、Q 不在 1–20 或行數不符時只印 `invalid input`。',
      constraints: ['1 ≤ N ≤ 30，1 ≤ Q ≤ 20，每個字串 1–1000 個字元', '每一列的機率總和必須剛好是 1', '用自然對數 `math.log`；很長的字串乘積會下溢成 0，log 機率不會'],
      samples: [
        { kind: 'normal', input: '5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n3\nbanana\nbana\nno\n', output: 'banana: logp=-3.5676 avg=-0.5097 ppl=1.6647 prod=2.822e-02\nbana: logp=-2.7001 avg=-0.5400 ppl=1.7160 prod=6.720e-02\nno: logp=-3.1011 avg=-1.0337 ppl=2.8114 prod=4.500e-02\n', note: '課文的字元表：機率包含開頭的 ^ → b 與最後的 a → $' },
        { kind: 'edge', input: '5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n2\nban\nbx\n', output: 'ban: impossible\nbx: impossible\n', note: '表中沒有 n → $，也沒有 b → x：整串的機率是 0' },
      ],
      tests: [
        { kind: 'normal', input: '5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n4\na\nbonana\nnonono\nbo\n', output: 'a: logp=-2.5257 avg=-1.2629 ppl=3.5355 prod=8.000e-02\nbonana: logp=-5.1362 avg=-0.7337 ppl=2.0829 prod=5.880e-03\nnonono: logp=-6.8953 avg=-0.9850 ppl=2.6779 prod=1.012e-03\nbo: logp=-2.9957 avg=-0.9986 ppl=2.7144 prod=5.000e-02\n', note: '更多由同一張表產生的字串；越長、越少見的字串 log 機率越低' },
        { kind: 'normal', input: '2\n^ 我:3/5 你:2/5\n我 $:1/4 我:3/4\n4\n我\n我我我\n你\n我我我我我我我我我我\n', output: '我: logp=-1.8971 avg=-0.9486 ppl=2.5820 prod=1.500e-01\n我我我: logp=-2.4725 avg=-0.6181 ppl=1.8554 prod=8.437e-02\n你: impossible\n我我我我我我我我我我: logp=-4.4863 avg=-0.4078 ppl=1.5036 prod=1.126e-02\n', note: '中文字元；重複的「我」每一步都乘上 3/4，平均 log 機率反而提高' },
        { kind: 'edge', input: '3\n^ a:1/2 b:1/2\na b:0.1 a:0.8 $:0.1\nb a:0.1 b:0.8 $:0.1\n3\nabababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nab\n', output: 'abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab: logp=-921.7272 avg=-2.2986 ppl=9.9599 prod=0.000e+00\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: logp=-25.0869 avg=-0.2484 ppl=1.2820 prod=1.273e-11\nab: logp=-5.2983 avg=-1.7661 ppl=5.8480 prod=5.000e-03\n', note: '400 個字元：直接連乘下溢成 0，log 機率仍然是有限的 −921.7272' },
        { kind: 'edge', input: '3\n^ a:1/2 b:1/2\na b:0.1 a:0.8 $:0.1\nb a:0.1 b:0.8 $:0.1\n2\nabababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n', output: 'abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab: logp=-691.4687 avg=-2.2972 ppl=9.9467 prod=5.000e-301\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: logp=-36.2441 avg=-0.2400 ppl=1.2713 prod=1.817e-16\n', note: '300 個字元的乘積約 5 × 10^−300，還在 float 的範圍內；150 個 a 的序列' },
        { kind: 'error', input: '5\n^ b:0.5 n:0.3 a:0.2\nb a:0.8 o:0.2\na n:0.6 $:0.4\nn a:0.7 o:0.3\no $:0.5 n:0.5\n4\nba na\nb$\n^b\nbana\n', output: 'error: bad text\nerror: bad text\nerror: bad text\nbana: logp=-2.7001 avg=-0.5400 ppl=1.7160 prod=6.720e-02\n', note: '含空白、^ 或 $ 的字串只影響那一行' },
        { kind: 'error', input: '2\n^ a:0.5 b:0.4\na $:1\n1\na\n', output: 'invalid input\n', note: '機率表的一列總和不是 1' },
        { kind: 'error', input: '2\n^ a:1\na $:1\n0\n', output: 'invalid input\n', note: '字串個數必須是 1–20' },
        { kind: 'error', input: '2\n^ a:1\na $:1\n2\na\n', output: 'invalid input\n', note: '宣告 2 個字串，只給了 1 個' },
        { kind: 'error', input: '1\n$ a:1\n1\na\n', output: 'invalid input\n', note: '$ 是結束記號，不能當上文' },
      ],
      hints: [
        '`zip(\'^\' + s, s + \'$\')` 一次列出 n + 1 個（上文, 下一個）配對。',
        '先把機率全部乘起來再取 log 會在很長的字串上出錯：乘積下溢成 0.0，`math.log(0.0)` 會拋出 ValueError。逐項取 log 再相加。',
        '用課文的表檢查：banana 的 logp 應該是 −3.5676。',
        '常見錯誤（測資會抓到）：漏掉 `^` 或 `$` 那一步、用 `math.log10`、平均時除以 n 而不是 n + 1、把查不到的因子略過而不是當成 0。',
      ],
      solution: { Python: code`import math
import re
import sys
from fractions import Fraction

NUMBER = re.compile(r'\d+(\.\d+)?|\d+/0*[1-9]\d*')  # 0.25 或 1/4，分母不為 0

def parse_table(lines):
    """N 行機率表；回傳 {上文: {字元: 機率}}，格式不對時回傳 None。"""
    table = {}
    for line in lines:
        ctx, *cands = line.split() or ['']
        if len(ctx) != 1 or ctx == '$' or ctx in table or not cands:
            return None
        row = {}
        for item in cands:
            ch, colon, p = item.partition(':')
            if not colon or len(ch) != 1 or ch == '^' or ch in row or not NUMBER.fullmatch(p) or Fraction(p) == 0:
                return None
            row[ch] = Fraction(p)
        if sum(row.values()) != 1:
            return None
        table[ctx] = row
    return table

def score(table, text):
    """每一步的 p(下一個 | 上一個)：^ → 第一個字元 → … → 最後一個字元 → $。"""
    steps = list(zip('^' + text, text + '$'))
    probs = [table.get(a, {}).get(b, 0) for a, b in steps]
    if 0 in probs:
        return 'impossible'
    logp = sum(math.log(p) for p in probs)  # 加總 log，不會下溢
    prod = 1.0
    for p in probs:
        prod *= float(p)  # 直接連乘：很長的序列會下溢成 0
    avg = logp / len(steps)
    return f'logp={logp:.4f} avg={avg:.4f} ppl={math.exp(-avg):.4f} prod={prod:.3e}'

def main(lines):
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    n = int(lines[0]) if lines and lines[0].strip().isdigit() else 0
    if not 1 <= n <= 30 or len(lines) < n + 2 or not lines[n + 1].strip().isdigit():
        return ['invalid input']
    q = int(lines[n + 1])
    table = parse_table(lines[1:n + 1])
    if table is None or not 1 <= q <= 20 or len(lines) != n + 2 + q:
        return ['invalid input']
    out = []
    for text in lines[n + 2:]:
        if not text or any(c.isspace() or c in '^$' for c in text) or len(text) > 1000:
            out.append('error: bad text')
        else:
            out.append(f'{text}: {score(table, text)}')
    return out

print('\n'.join(main(sys.stdin.read().replace('\r', '').split('\n'))))` },
      judge: 'none',
    },
    {
      id: 'gen02-x-decoding', title: 'temperature、top-k 與 top-p',
      statement: '讀入 token 與它們的 logits，對每組設定 `T k p` 算出最終的取樣機率，順序和課文、探索器相同：(1) T = 0 是 greedy：logit 最大的 token（同分取先列出的）機率 1，其他 0，不看 k 與 p。(2) T > 0 時，機率是 softmax(logit ÷ T)，先減去最大值以免 exp 溢位。(3) 依這個機率由大到小排序，同分維持列出的順序。(4) top-k：k ≥ 1 時只留前 k 個；k = 0 表示關閉，k 大於 token 數等於不限制。(5) top-p：p < 1 時，在 top-k 留下、重新正規化的分布上由大到小累加，留到累計第一次達到 p 為止（跨過 p 的那一個也留下，比較時容許 1e−12 的誤差）；p = 1 表示關閉。(6) 留下的 token 重新正規化，其他為 0。',
      inputFormat: '第一行 2–10 個不重複的 token，以空白分隔。第二行同樣個數的 logits，是絕對值不超過 100 的整數或小數（可以是負數）。第三行整數 Q，接著 Q 行，每行一組設定 `T k p`。結尾的空行會被忽略。',
      outputFormat: '每組設定印一行，依 token 列出的順序寫 `token=機率`，機率取 4 位小數，以一個空白分隔。設定不是三個欄位、T 不是 0–10 的數、k 不是非負整數、p 不在 (0, 1] 時，那一行印 `error: bad settings`。token 個數不在 2–10 或有重複、logits 個數不同或不是數字、Q 不在 1–20、行數不符時只印 `invalid input`。',
      constraints: ['2 ≤ token 數 ≤ 10，|logit| ≤ 100，1 ≤ Q ≤ 20', '0 ≤ T ≤ 10，k ≥ 0，0 < p ≤ 1', '只用標準函式庫的 math'],
      samples: [
        { kind: 'normal', input: '好 不錯 棒 糟\n2 1 0.5 -1\n4\n1 0 1\n0.5 0 1\n2 0 1\n0 0 1\n', output: '好=0.6095 不錯=0.2242 棒=0.1360 糟=0.0303\n好=0.8420 不錯=0.1140 棒=0.0419 糟=0.0021\n好=0.4344 不錯=0.2635 棒=0.2052 糟=0.0969\n好=1.0000 不錯=0.0000 棒=0.0000 糟=0.0000\n', note: '課文的 logits：T = 1、0.5、2 與 greedy' },
        { kind: 'normal', input: '好 不錯 棒 糟\n2 1 0.5 -1\n3\n1 2 1\n1 0 0.9\n1 0 0.5\n', output: '好=0.7311 不錯=0.2689 棒=0.0000 糟=0.0000\n好=0.6285 不錯=0.2312 棒=0.1402 糟=0.0000\n好=1.0000 不錯=0.0000 棒=0.0000 糟=0.0000\n', note: 'top-k = 2、top-p = 0.9 與 top-p = 0.5（第一個候選就已達到 0.5）' },
      ],
      tests: [
        { kind: 'normal', input: 'a b c d e\n3 2.5 1 0 -2\n5\n0.7 3 1\n1.5 0 0.8\n1 3 0.8\n2 2 0.6\n0.3 0 0.99\n', output: 'a=0.6464 b=0.3165 c=0.0371 d=0.0000 e=0.0000\na=0.5050 b=0.3619 c=0.1331 d=0.0000 e=0.0000\na=0.6225 b=0.3775 c=0.0000 d=0.0000 e=0.0000\na=0.5622 b=0.4378 c=0.0000 d=0.0000 e=0.0000\na=0.8411 b=0.1589 c=0.0000 d=0.0000 e=0.0000\n', note: '同時設定 temperature、top-k 與 top-p' },
        { kind: 'edge', input: 'w x y z\n0 0 0 0\n5\n1 0 0.5\n1 0 0.75\n3 0 1\n0 0 1\n1 3 1\n', output: 'w=0.5000 x=0.5000 y=0.0000 z=0.0000\nw=0.3333 x=0.3333 y=0.3333 z=0.0000\nw=0.2500 x=0.2500 y=0.2500 z=0.2500\nw=1.0000 x=0.0000 y=0.0000 z=0.0000\nw=0.3333 x=0.3333 y=0.3333 z=0.0000\n', note: '四個 logits 相同：累計剛好等於 p 時就停止；greedy 同分取第一個' },
        { kind: 'edge', input: 'p q r\n1 3 3\n4\n0 0 1\n1 1 1\n1 0 0.1\n1 5 1\n', output: 'p=0.0000 q=1.0000 r=0.0000\np=0.0000 q=1.0000 r=0.0000\np=0.0000 q=1.0000 r=0.0000\np=0.0634 q=0.4683 r=0.4683\n', note: 'q、r 同分：greedy 取先列出的 q；top-p = 0.1 只留排序第一的 q；k 大於候選數等於不限制' },
        { kind: 'edge', input: 'x y\n100 -100\n3\n1 0 1\n10 0 1\n0.1 0 1\n', output: 'x=1.0000 y=0.0000\nx=1.0000 y=0.0000\nx=1.0000 y=0.0000\n', note: 'logits 相差 200：沒有先減去最大值，exp 會溢位' },
        { kind: 'normal', input: 'A B C D\n1 2 3 4\n2\n1 0 0.9\n1 3 0.9\n', output: 'A=0.0000 B=0.0900 C=0.2447 D=0.6652\nA=0.0000 B=0.0000 C=0.2689 D=0.7311\n', note: 'top-p 在 top-k 之後重新正規化的分布上累加：k = 3 時多刪去一個候選' },
        { kind: 'error', input: '好 不錯 棒 糟\n2 1 0.5 -1\n6\n-1 0 1\n1 -2 1\n1 0 0\n1 0 1.5\n1 0\n1 1.5 1\n', output: 'error: bad settings\nerror: bad settings\nerror: bad settings\nerror: bad settings\nerror: bad settings\nerror: bad settings\n', note: '負的 T、負的 k、p = 0、p > 1、少一個數、k 不是整數：只影響那一行' },
        { kind: 'error', input: 'a b\n1\n1\n1 0 1\n', output: 'invalid input\n', note: 'logits 的個數和 token 不同' },
        { kind: 'error', input: 'a a\n1 2\n1\n1 0 1\n', output: 'invalid input\n', note: 'token 重複' },
        { kind: 'error', input: 'a b\n1 x\n1\n1 0 1\n', output: 'invalid input\n', note: 'logit 不是數字' },
      ],
      hints: [
        '先寫 softmax(logits, T)，再寫 decode(logits, T, k, p)，最後才處理輸入輸出。',
        '排序 index 而不是機率：`sorted(range(n), key=lambda i: -probs[i])`，之後的刪減都用 index 表示。',
        'T = 0 要在除以 T 之前處理，否則會除以零。',
        '常見錯誤（測資會抓到）：把 temperature 套在機率上（p ÷ T 再正規化等於沒變）、刪減後忘了重新正規化、top-p 在原始分布而不是 top-k 之後的分布上累加、用「超過 p」而不是「達到 p」、greedy 同分時取了最後一個、softmax 沒有先減去最大值。',
      ],
      solution: { Python: code`import math
import re
import sys

DECIMAL = re.compile(r'-?\d+(\.\d+)?')

def decode(logits, T, k, p):
    """temperature → 由大到小排序（同分維持原順序）→ top-k → top-p，每次刪減後重新正規化。"""
    n = len(logits)
    if T == 0:  # greedy：機率最高的一個，同分取先列出的
        best = logits.index(max(logits))
        return [1.0 if i == best else 0.0 for i in range(n)]
    scaled = [x / T for x in logits]  # 除的是 logits，不是機率
    m = max(scaled)
    e = [math.exp(s - m) for s in scaled]
    probs = [v / sum(e) for v in e]
    keep = sorted(range(n), key=lambda i: -probs[i])
    if k > 0:
        keep = keep[:k]
    if p < 1:
        z, acc, nucleus = sum(probs[i] for i in keep), 0.0, []
        for i in keep:  # 在 top-k 之後重新正規化的分布上累加
            nucleus.append(i)
            acc += probs[i] / z
            if acc >= p - 1e-12:  # 第一次達到 p 就停；跨過 p 的那一個也留下
                break
        keep = nucleus
    z = sum(probs[i] for i in keep)
    return [probs[i] / z if i in keep else 0.0 for i in range(n)]

def settings(line):
    parts = line.split()
    if len(parts) != 3 or not DECIMAL.fullmatch(parts[0]) or not parts[1].isdigit() or not DECIMAL.fullmatch(parts[2]):
        return None
    T, k, p = float(parts[0]), int(parts[1]), float(parts[2])
    if not 0 <= T <= 10 or not 0 < p <= 1:
        return None
    return T, k, p

def main(lines):
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    if len(lines) < 3:
        return ['invalid input']
    tokens, logits = lines[0].split(), lines[1].split()
    q = int(lines[2]) if lines[2].strip().isdigit() else 0
    if not 2 <= len(tokens) <= 10 or len(set(tokens)) != len(tokens) or len(logits) != len(tokens) \
            or not all(DECIMAL.fullmatch(x) and abs(float(x)) <= 100 for x in logits) \
            or not 1 <= q <= 20 or len(lines) != 3 + q:
        return ['invalid input']
    logits = [float(x) for x in logits]
    out = []
    for line in lines[3:]:
        s = settings(line)
        if s is None:
            out.append('error: bad settings')
            continue
        probs = decode(logits, *s)
        out.append(' '.join(f'{t}={q:.4f}' for t, q in zip(tokens, probs)))
    return out

print('\n'.join(main(sys.stdin.read().replace('\r', '').split('\n'))))` },
      judge: 'none',
    },
    {
      id: 'gen02-x-greedy-loop', title: 'greedy 解碼與重複偵測',
      statement: '讀入一張詞級的二元機率表，從開頭的 token 以 greedy 解碼生成，並在陷入重複時停下。每一步開始時，上文是目前最後一個 token：(1) 如果這個上文之前已經當過上文，就停止（loop）：二元模型只看最後一個 token、greedy 又不抽亂數，同樣的上文一定選出同樣的下一個，之後只會重複；迴圈是從這個 token 上次出現的位置起，到目前最後一個 token 之前為止的那一段。(2) 否則記下它，找這個上文的那一列；沒有時改用上文為 `*` 的那一列（其他任何上文）；兩者都沒有就停止（no-context）。(3) 選機率最大的候選（同分取先列出的），接到最後面；選中結束 token 時停止（end）。已經生成 S 個 token 時停止（max-steps），即使最後一個 token 曾經出現過：重複要在下一步開始時才會被偵測。開頭的 token 也算一個上文。',
      inputFormat: '第一行：開頭 token、結束 token 與最多步數 S，以空白分隔。第二行整數 N，接著 N 行：上文 token（或 `*`）與它的候選 `token:機率`，以空白分隔；機率是正的小數或分數。token 不含空白與冒號。結尾的空行會被忽略。',
      outputFormat: '`text: ` 加上開頭 token 與生成的所有 token（以一個空白分隔）；`stop: end`、`stop: loop`、`stop: max-steps` 或 `stop: no-context`；停止原因是 loop 時再印 `cycle: ` 加上迴圈的 token。輸入格式錯誤時只印 `invalid input`：第一行不是三個欄位、S 不在 1–50、開頭與結束 token 相同、含冒號或是 `*`、N 不在 1–30、行數不符、上文重複、上文是結束 token、候選格式錯誤、候選是 `*`、同一列的候選重複、機率不是合法的正數，或某一列的總和不是 1。',
      constraints: ['1 ≤ S ≤ 50，1 ≤ N ≤ 30', '每一列的機率總和必須剛好是 1（用分數精確比較）', '偵測方式只適用於「上文只有最後一個 token」的模型：真實模型看整段上文，最後一個 token 重複不代表進入迴圈'],
      samples: [
        { kind: 'normal', input: '今天 。 12\n10\n今天 天氣:0.6 我:0.4\n天氣 很:0.7 不錯:0.3\n很 好:0.5 熱:0.3 冷:0.2\n好 ，:0.55 。:0.45\n， 天氣:0.5 我:0.3 今天:0.2\n我 很:0.6 想:0.4\n想 出門:0.6 睡覺:0.4\n熱 。:0.6 ，:0.4\n冷 。:0.7 ，:0.3\n* 。:0.8 ，:0.2\n', output: 'text: 今天 天氣 很 好 ， 天氣\nstop: loop\ncycle: 天氣 很 好 ，\n', note: '課文的表：greedy 回到「天氣」，迴圈是「天氣 很 好 ，」' },
        { kind: 'normal', input: '想 。 12\n10\n今天 天氣:0.6 我:0.4\n天氣 很:0.7 不錯:0.3\n很 好:0.5 熱:0.3 冷:0.2\n好 ，:0.55 。:0.45\n， 天氣:0.5 我:0.3 今天:0.2\n我 很:0.6 想:0.4\n想 出門:0.6 睡覺:0.4\n熱 。:0.6 ，:0.4\n冷 。:0.7 ，:0.3\n* 。:0.8 ，:0.2\n', output: 'text: 想 出門 。\nstop: end\n', note: '「出門」沒有自己的一列，用 * 那一列，選出結束 token' },
      ],
      tests: [
        { kind: 'normal', input: '熱 。 12\n10\n今天 天氣:0.6 我:0.4\n天氣 很:0.7 不錯:0.3\n很 好:0.5 熱:0.3 冷:0.2\n好 ，:0.55 。:0.45\n， 天氣:0.5 我:0.3 今天:0.2\n我 很:0.6 想:0.4\n想 出門:0.6 睡覺:0.4\n熱 。:0.6 ，:0.4\n冷 。:0.7 ，:0.3\n* 。:0.8 ，:0.2\n', output: 'text: 熱 。\nstop: end\n', note: '第一步就選出結束 token' },
        { kind: 'normal', input: '<s> </s> 20\n5\n<s> the:0.6 a:0.4\nthe cat:0.5 dog:0.3 end:0.2\ncat sat:0.7 ran:0.3\nsat on:0.9 </s>:0.1\non the:0.8 a:0.2\n', output: 'text: <s> the cat sat on the\nstop: loop\ncycle: the cat sat on\n', note: '英文的詞：迴圈從第二個 token 開始' },
        { kind: 'normal', input: 'A </s> 20\n3\nA B:0.4 C:0.6\nC A:0.7 </s>:0.3\nB </s>:1\n', output: 'text: A C A\nstop: loop\ncycle: A C\n', note: '迴圈回到開頭的 token A：開頭的 token 也是上文' },
        { kind: 'edge', input: 'x . 10\n1\nx x:0.9 .:0.1\n', output: 'text: x x\nstop: loop\ncycle: x\n', note: 'x 之後最可能還是 x：長度 1 的迴圈' },
        { kind: 'edge', input: '今天 。 5\n10\n今天 天氣:0.6 我:0.4\n天氣 很:0.7 不錯:0.3\n很 好:0.5 熱:0.3 冷:0.2\n好 ，:0.55 。:0.45\n， 天氣:0.5 我:0.3 今天:0.2\n我 很:0.6 想:0.4\n想 出門:0.6 睡覺:0.4\n熱 。:0.6 ，:0.4\n冷 。:0.7 ，:0.3\n* 。:0.8 ，:0.2\n', output: 'text: 今天 天氣 很 好 ， 天氣\nstop: max-steps\n', note: '同一張表，最多 5 步：第 6 步才會用到重複的上文，所以是步數上限' },
        { kind: 'edge', input: 'a . 10\n2\na b:0.5 c:0.5\nc a:1/3 b:1/3 .:1/3\n', output: 'text: a b\nstop: no-context\n', note: 'b、c 同分取先列出的 b；b 沒有自己的一列，也沒有 *' },
        { kind: 'edge', input: 'q . 3\n1\nx y:1\n', output: 'text: q\nstop: no-context\n', note: '開頭的 token 找不到上文' },
        { kind: 'error', input: 'a . 10\n1\na b:0.5 c:0.4\n', output: 'invalid input\n', note: '機率總和是 0.9' },
        { kind: 'error', input: 'a a 10\n1\na b:1\n', output: 'invalid input\n', note: '開頭與結束 token 相同' },
        { kind: 'error', input: 'a . 0\n1\na b:1\n', output: 'invalid input\n', note: '步數上限必須是 1–50' },
        { kind: 'error', input: 'a . 10\n2\na b:1\n', output: 'invalid input\n', note: '宣告 2 列，只給了 1 列' },
        { kind: 'error', input: 'a . 10\n1\na b:1 b:0\n', output: 'invalid input\n', note: '同一列中 b 出現兩次，而且機率 0' },
      ],
      hints: [
        '用字典 seen 記錄每個上文第一次出現在 tokens 中的位置；開頭的 token 也要記錄。',
        '迴圈是 `tokens[seen[ctx]:-1]`：不含剛剛第二次出現的那一個。',
        '找最大值時用嚴格的「大於」才換人，同分就會留下先列出的候選。',
        '常見錯誤（測資會抓到）：同分時取了最後一個、忘了 `*` 那一列、只記錄生成的 token 而漏掉開頭的 token、接上 token 後立刻檢查重複（會把 max-steps 誤報成 loop）、迴圈多印了重複的那一個 token。',
      ],
      solution: { Python: code`import re
import sys
from fractions import Fraction

NUMBER = re.compile(r'\d+(\.\d+)?|\d+/0*[1-9]\d*')  # 0.25 或 1/4，分母不為 0

def parse(lines):
    """回傳 (start, end, max_steps, table)；格式不對時回傳 None。table[上文] = [(token, 機率), ...]。"""
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    if len(lines) < 2:
        return None
    head = lines[0].split()
    n = int(lines[1]) if lines[1].strip().isdigit() else 0
    if len(head) != 3 or not head[2].isdigit() or not 1 <= int(head[2]) <= 50 or not 1 <= n <= 30 or len(lines) != 2 + n:
        return None
    start, end, max_steps = head[0], head[1], int(head[2])
    if start == end or ':' in start + end or '*' in (start, end):
        return None
    table = {}
    for line in lines[2:]:
        ctx, *cands = line.split() or ['']
        if not ctx or ':' in ctx or ctx == end or ctx in table or not cands:
            return None
        row = []
        for item in cands:
            tok, colon, p = item.partition(':')
            if not colon or not tok or tok == '*' or not NUMBER.fullmatch(p) or Fraction(p) == 0 or tok in [t for t, _ in row]:
                return None
            row.append((tok, Fraction(p)))
        if sum(p for _, p in row) != 1:
            return None
        table[ctx] = row
    return start, end, max_steps, table

def greedy(start, end, max_steps, table):
    tokens, seen = [start], {}
    for _ in range(max_steps):
        ctx = tokens[-1]
        if ctx in seen:  # 上文只有前一個 token：同樣的上文一定選出同樣的下一個，之後只會重複
            return tokens, 'loop', tokens[seen[ctx]:-1]
        seen[ctx] = len(tokens) - 1
        row = table.get(ctx, table.get('*'))  # * 是「其他任何上文」
        if row is None:
            return tokens, 'no-context', None
        best = row[0]
        for cand in row[1:]:
            if cand[1] > best[1]:  # 嚴格大於：同分時留下先列出的
                best = cand
        tokens.append(best[0])
        if best[0] == end:
            return tokens, 'end', None
    return tokens, 'max-steps', None

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None:
    print('invalid input')
else:
    tokens, stop, cycle = greedy(*parsed)
    print('text:', ' '.join(tokens))
    print('stop:', stop)
    if cycle:
        print('cycle:', ' '.join(cycle))` },
      judge: 'none',
    },
  ],
  quiz: [
    {
      id: 'gen02-q-chain', prompt: '依機率的連鎖律，P(我, 喜歡, 貓) 等於下列哪一個？',
      options: ['P(我) × P(喜歡) × P(貓)', 'P(我) × P(喜歡 | 我) × P(貓 | 我, 喜歡)', 'P(貓 | 我, 喜歡)', 'P(我 | 喜歡, 貓) × P(喜歡 | 貓)'],
      answer: 1, explanation: '連鎖律是反覆使用乘法規則：先 P(我)，再乘上給定前文的 P(喜歡 | 我)，再乘上 P(貓 | 我, 喜歡)。三個邊際機率直接相乘只有在三者互相獨立時才成立；只寫最後一個條件機率少了前兩個因子；最後一個選項少了 P(貓) 這個因子，不是完整的分解。',
    },
    {
      id: 'gen02-q-exact', prompt: '關於連鎖律分解 P(x₁, …, xₙ) = ∏ P(xᵢ | x<ᵢ)，下列哪一個敘述正確？',
      options: ['它只在 token 彼此獨立時成立', '它只適用於文字，不能用在圖像或音訊', '它是一種近似，所以生成的文字才會出錯', '它對任何聯合分布都精確成立；只看最後幾個 token 的上文才是近似'],
      answer: 3, explanation: '連鎖律是機率的恆等式，不需要任何假設；近似發生在模型只看部分上文（例如二元模型只看前一個 token）或條件機率是估計值的時候。token 獨立時每個因子退化成 P(xᵢ)，那是更強的簡化，不是連鎖律的前提；任何能排成序列的資料都適用，包括像素與音訊樣本；生成會出錯是因為模型的條件機率不完美，不是連鎖律本身。',
    },
    {
      id: 'gen02-q-loop', prompt: '一個只看前一個 token 的二元模型用 greedy 生成，得到「天氣 很 好 ， 天氣 很 好 ， …」不斷重複。最主要的原因是什麼？',
      options: ['greedy 不抽亂數，選擇完全由上文決定；同一個上文再次出現時，後面的選擇也一模一樣', 'temperature 設得太高，分布太平均', '結束 token「。」在「好」之後的機率是 0', '亂數種子固定，所以每次抽到同樣的 u'],
      answer: 0, explanation: 'greedy 每一步選機率最高的候選，是上文的決定性函數；二元模型的上文只有前一個 token，「天氣」第二次出現後就只能重複同一段。temperature = 0 才是 greedy，不是太高；探索器中「。」在「好」之後有 0.45，只是永遠輸給「，」的 0.55；greedy 根本不抽亂數，與種子無關。',
    },
    {
      id: 'gen02-q-greedy-best', prompt: '在「句子的連鎖律」探索器中，greedy 生成「我 喜歡 貓 。」（機率 0.144），而「他 養 狗 。」的機率是 0.1904。這說明了什麼？',
      options: ['探索器算錯了，greedy 一定得到機率最高的句子', '「他 養 狗 。」不是合法的句子，所以不算', 'greedy 每一步只選眼前最高的，不保證整句的機率最高', '機率較高的句子一定比較好，應該永遠用 beam search'],
      answer: 2, explanation: 'greedy 第一步選了 0.6 的「我」，就走不到第一步只有 0.4、但後面很順的「他 養 狗 。」，局部最好不等於整句最好。探索器的數字由連鎖律算出，沒有錯；「他 養 狗 。」是模型可以生成的序列；整句機率最高也不代表最好，開放式生成常因機率最高的文字平淡、重複而改用取樣，beam search 不是永遠的答案。',
    },
    {
      id: 'gen02-q-log', prompt: '替一段很長的文字打分數時，為什麼通常把每一步的 log 機率加總，而不是直接把機率連乘？',
      options: ['log 機率會改變句子的排名，比較能找出好句子', '很多小於 1 的數連乘會下溢成 0，log 把乘法變成加法，數值範圍穩定', '連乘的結果會超過 1，不是合法的機率', 'log 讓所有序列的機率總和變成 1'],
      answer: 1, explanation: '每一步的機率都小於 1，幾百個相乘就會小於 float 能表示的最小值而變成 0；log 機率是一串不大的負數相加，不會下溢。log 是遞增函數，不會改變排名；機率連乘只會越乘越小，不會超過 1；取 log 不會改變機率總和，log 機率本身是負數，總和也不是 1。',
    },
    {
      id: 'gen02-q-exposure', prompt: '訓練時每一步都給模型真實的前文（teacher forcing），推論時上文卻是模型自己生成的 token。這個落差可能造成什麼問題？',
      options: ['exposure bias：模型沒看過自己的錯誤，一旦生成了不合適的 token，後面的預測可能越來越偏', '模型在推論時會把參數改回訓練前的值', '上下文視窗在推論時會變小一半', '訓練時無法平行計算，所以模型學不會'],
      answer: 0, explanation: 'teacher forcing 下模型只看過正確的前文；推論時錯誤會留在上文裡，產生訓練中少見的前文，錯誤可能一路累積，這就是 exposure bias。推論不會改變參數；上下文視窗的大小由模型決定，訓練與推論相同；teacher forcing 正好讓訓練可以平行計算所有位置，不是學不會的原因。',
    },
    {
      id: 'gen02-q-image', prompt: '要用自回歸模型生成圖像，常見的做法是什麼？',
      options: ['一次輸出所有像素，每個像素互不依賴', '圖像無法離散化，所以自回歸只能用在文字', '每次用隨機的順序產生像素，不需要固定順序', '先把圖像離散化成 token 序列（逐像素的 0–255 值，或先用編碼器壓成較少的代碼），再依固定順序一次預測一個'],
      answer: 3, explanation: '自回歸需要一串離散的 token 與固定的先後順序：可以逐像素依光柵順序生成，也可以先用向量量化的編碼器把圖像壓成較短的代碼序列。各像素互不依賴就不是自回歸，畫出的圖也不連貫；像素值本來就是 0–255 的離散值，可以當成 token；連鎖律需要固定的順序，每個條件機率才知道前文是哪些 token。',
    },
    {
      id: 'gen02-q-latency', prompt: '同一個自回歸模型，輸出 1,000 個 token 比輸出 100 個 token 慢很多，主要原因是什麼？',
      options: ['訓練時的 teacher forcing 只能一個一個計算', '輸出越長，模型會自動調高 temperature', '每個 token 都要跑一次模型，而且下一步必須等上一步選完才能開始，生成延遲大致隨輸出長度成長', '輸出越長，詞彙表就越大'],
      answer: 2, explanation: '生成是循序的：第 i 個 token 是第 i + 1 步的上文，每一步都要算一次分布，所以延遲大致與輸出 token 數成正比；KV cache 只讓每一步變快，不能讓步驟平行。teacher forcing 是訓練的做法，而且正好可以平行；temperature 是使用者的設定，不會隨長度改變；詞彙表在訓練前就固定了，與輸出長度無關。',
    },
  ],
  llm: {
    samplers: [
      {
        id: 'gen02-sentence', title: '句子的連鎖律',
        description: '「主詞 動詞 受詞 。」的玩具模型（示意資料）。前兩步的上文是完整的前文，之後只看前一個詞。用上文選單讀出每一步的條件機率，把它們相乘就是整句的機率；temperature 設成 0 看 greedy 選出哪一句。',
        model: {
          end: '。',
          contexts: [
            ctx(['<s>'], [['我', 0.6], ['他', 0.4]]),
            ctx(['<s>', '我'], [['喜歡', 0.5], ['養', 0.3], ['怕', 0.2]]),
            ctx(['<s>', '他'], [['養', 0.85], ['喜歡', 0.1], ['怕', 0.05]]),
            ctx(['喜歡'], [['貓', 0.6], ['狗', 0.4]]),
            ctx(['養'], [['狗', 0.7], ['貓', 0.3]]),
            ctx(['怕'], [['狗', 0.7], ['貓', 0.3]]),
            ctx([], [['。', 0.8], ['喔', 0.2]]),
          ],
        },
        prompt: ['<s>'],
        settings: { temperature: 1, topK: 0, topP: 1, seed: 7 },
        maxSteps: 8,
      },
      {
        id: 'gen02-chars', title: '字元級取樣器',
        description: '和 Python 範例相同的字元級二元模型（示意資料）：<s> 是開頭，. 是結束。按「下一步」看每一步的上文、抽到的 u 與每個候選的累計區間；預設的種子 8 生成 banana，換種子會得到別的字。',
        model: {
          end: '.',
          contexts: [
            ctx(['<s>'], [['b', 0.5], ['n', 0.3], ['a', 0.2]]),
            ctx(['b'], [['a', 0.8], ['o', 0.2]]),
            ctx(['a'], [['n', 0.6], ['.', 0.4]]),
            ctx(['n'], [['a', 0.7], ['o', 0.3]]),
            ctx(['o'], [['.', 0.5], ['n', 0.5]]),
          ],
        },
        prompt: ['<s>'],
        settings: { temperature: 1, topK: 0, topP: 1, seed: 8 },
        maxSteps: 12,
      },
      {
        id: 'gen02-repeat', title: 'greedy 的重複迴圈',
        description: '從「今天」開始的詞級二元模型（示意資料），和 Python 範例與練習的表相同。temperature 設成 0 時 greedy 會陷入「天氣 很 好 ，」的迴圈；改回取樣，看抽到的 u 怎麼讓生成跳出迴圈、選到結束 token「。」。',
        model: {
          end: '。',
          contexts: [
            ctx(['今天'], [['天氣', 0.6], ['我', 0.4]]),
            ctx(['天氣'], [['很', 0.7], ['不錯', 0.3]]),
            ctx(['很'], [['好', 0.5], ['熱', 0.3], ['冷', 0.2]]),
            ctx(['好'], [['，', 0.55], ['。', 0.45]]),
            ctx(['，'], [['天氣', 0.5], ['我', 0.3], ['今天', 0.2]]),
            ctx(['我'], [['很', 0.6], ['想', 0.4]]),
            ctx(['想'], [['出門', 0.6], ['睡覺', 0.4]]),
            ctx(['熱'], [['。', 0.6], ['，', 0.4]]),
            ctx(['冷'], [['。', 0.7], ['，', 0.3]]),
            ctx([], [['。', 0.8], ['，', 0.2]]),
          ],
        },
        prompt: ['今天'],
        settings: { temperature: 1, topK: 0, topP: 1, seed: 8 },
        maxSteps: 12,
      },
    ],
    exercises: [
      {
        id: 'gen02-x-chain-factors', kind: 'table', title: '把整句的機率拆成因子',
        statement: '在「句子的連鎖律」探索器中，temperature = 1、top-k = 0、top-p = 1。用上文選單讀出 P(我 喜歡 貓 。) 的四個條件機率，以及 p(養 | <s> 他)；再把 temperature 設成 0，從 <s> 生成到停止，寫出 greedy 生成的 token（用 | 分開）。',
        blanks: [
          { id: 's', label: 'p(我 | <s>)', query: { of: 'probability', explorer: 'gen02-sentence', context: ['<s>'], token: '我', settings: { temperature: 1 } }, answer: 0.6, tolerance: 0.001 },
          { id: 'v', label: 'p(喜歡 | <s> 我)', query: { of: 'probability', explorer: 'gen02-sentence', context: ['<s>', '我'], token: '喜歡', settings: { temperature: 1 } }, answer: 0.5, tolerance: 0.001 },
          { id: 'o', label: 'p(貓 | <s> 我 喜歡)（模型查上文「喜歡」）', query: { of: 'probability', explorer: 'gen02-sentence', context: ['喜歡'], token: '貓', settings: { temperature: 1 } }, answer: 0.6, tolerance: 0.001 },
          { id: 'e', label: 'p(。 | <s> 我 喜歡 貓)（模型查「其他任何上文」）', query: { of: 'probability', explorer: 'gen02-sentence', context: [], token: '。', settings: { temperature: 1 } }, answer: 0.8, tolerance: 0.001 },
          { id: 'h', label: 'p(養 | <s> 他)', query: { of: 'probability', explorer: 'gen02-sentence', context: ['<s>', '他'], token: '養', settings: { temperature: 1 } }, answer: 0.85, tolerance: 0.001 },
          { id: 'g', label: 'greedy 生成的 token', query: { of: 'generate', explorer: 'gen02-sentence', settings: { temperature: 0 }, seed: 7, steps: 8 }, answer: '我|喜歡|貓|。' },
        ],
        hints: ['上文選單只列出錄好的上文。「<s> 我 喜歡」沒有被錄下來，模型用最長的、符合結尾的上文「喜歡」。', '「貓」之後沒有更合適的上文，用「（其他任何上文）」那一列。', 'greedy 每一步選機率最高的候選，生成到結束 token「。」為止。'],
        explanation: '依連鎖律，P(我 喜歡 貓 。) = 0.6 × 0.5 × 0.6 × 0.8 = 0.144；換成「他」開頭，P(他 養 狗 。) = 0.4 × 0.85 × 0.7 × 0.8 = 0.1904，反而更高。greedy 第一步選了機率較高的「我」，之後每一步也選最高的，得到「我 喜歡 貓 。」；它沒有機會走到第一步只有 0.4、但後面都很順的「他 養 狗 。」。每一步局部最好，不保證整句機率最高。',
        mistakes: [
          { answer: { s: '0.6', v: '0.1', o: '0.6', e: '0.8', h: '0.85', g: '我|喜歡|貓|。' }, why: '查錯了上文：0.1 是 p(喜歡 | <s> 他)，主詞是「我」時要查「<s> 我」' },
          { answer: { s: '0.6', v: '0.5', o: '0.6', e: '0.8', h: '0.85', g: '他|養|狗|。' }, why: '以為 greedy 會選出整句機率最高的句子' },
          { answer: { s: '0.6', v: '0.5', o: '0.6', e: '0.144', h: '0.85', g: '我|喜歡|貓|。' }, why: '把整句的機率填進最後一格；每一格都是一個條件機率' },
          { answer: { s: '0.6', v: '0.5', o: '0.6', e: '0.8', h: '0.85', g: '我|喜歡|貓' }, why: '漏掉結束 token「。」：它也是生成出來的一步，它的機率也要乘進整句' },
        ],
      },
      {
        id: 'gen02-x-repeat', kind: 'table', title: '跳出 greedy 的迴圈',
        statement: '在「greedy 的重複迴圈」探索器中：(1) 把 temperature 設成 0，從「今天」生成 8 步，寫出生成的 token；(2) 上文選「好」，寫出 temperature = 0.5 時結束 token「。」的機率；(3) temperature 改回 1、top-k = 0、top-p = 1，種子設成 4，生成到停止，寫出生成的 token。token 用 | 分開。',
        blanks: [
          { id: 'g', label: 'greedy 生成的 8 個 token', query: { of: 'generate', explorer: 'gen02-repeat', settings: { temperature: 0 }, seed: 8, steps: 8 }, answer: '天氣|很|好|，|天氣|很|好|，' },
          { id: 'p', label: 'temperature = 0.5 時「。」的機率', query: { of: 'probability', explorer: 'gen02-repeat', context: ['好'], token: '。', settings: { temperature: 0.5 } }, answer: 0.401, tolerance: 0.001 },
          { id: 's', label: '種子 4 取樣生成的 token', query: { of: 'generate', explorer: 'gen02-repeat', settings: { temperature: 1 }, seed: 4, steps: 12 }, answer: '我|很|好|，|天氣|很|好|。' },
        ],
        hints: ['greedy 在「好」之後選「，」（0.55 勝過 0.45），所以永遠不會選到結束 token。', '錄的是機率時，temperature = 0.5 等於把機率平方再重新正規化：0.55² = 0.3025、0.45² = 0.2025。', '說明區會列出每一步抽到的 u 與各候選的累計區間，u 落在哪一段就選哪一個。'],
        explanation: 'greedy 是上文的決定性函數：回到「天氣」之後，同樣的上文一定選出同樣的下一個，於是「天氣 很 好 ，」一直重複到步數上限。結束 token 在「好」之後有 0.45，卻永遠輸給 0.55 的「，」；把 temperature 降到 0.5，「。」反而降到 0.2025 ÷ 0.505 ≈ 0.401，更難結束。種子 4 的取樣：第一步 u ≈ 0.924 落在「我」[0.6, 1)，之後依序選出 很、好、，、天氣、很、好，最後 u ≈ 0.974 落在「。」[0.55, 1)，生成結束。取樣讓機率較低的接續也有機會出現，所以能跳出迴圈。',
        mistakes: [
          { answer: { g: '天氣|很|好|。', p: '0.401', s: '我|很|好|，|天氣|很|好|。' }, why: '以為 greedy 在「好」之後會選結束 token；「，」的 0.55 比「。」的 0.45 高' },
          { answer: { g: '天氣|很|好|，|天氣|很|好|，', p: '0.45', s: '我|很|好|，|天氣|很|好|。' }, why: '以為 temperature 不會改變機率；0.45 是 temperature = 1 的原始機率' },
          { answer: { g: '天氣|很|好|，|天氣|很|好|，', p: '0.401', s: '天氣|很|好|，|天氣|很|好|，|天氣|很|好|，' }, why: '寫了 greedy 的結果，忽略了種子與抽到的 u' },
        ],
      },
    ],
  },
};
