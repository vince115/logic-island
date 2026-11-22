import type { LessonContent } from '../schema';

/*
 * LLM03 嵌入向量 (llm-explorer: embedding-space). Three explorers, all 示意資料 written for this lesson (never a real
 * model's embeddings; dimension names are teaching labels):
 * - llm03-token-table: eight rows of a token embedding table (4 dimensions), three clusters (animals, vehicles, fruit).
 *   The tiger row is nearer the dog than the cat by cosine but nearer the cat by dot product (the cat's row is longer).
 * - llm03-sentence-search: a document space (5 dimensions) with six sentences and three queries. Its PCA keeps only about
 *   two thirds of the variance; the query 「下大雨學校會放假嗎」 sits right next to 「早上的捷運又誤點了」 in 2D, but its true
 *   cosine nearest is 「颱風來了，明天停班停課」 (0.910 against 0.337).
 * - llm03-dot-vs-cosine: a document space (3 dimensions) where one long, unnormalised vector wins every dot-product
 *   ranking but not the cosine one.
 * Every exercise answer is recomputed from these vectors by llmContentProblems.
 */
export const LLM03: LessonContent = {
  lessonId: 'LLM03',
  motivation: '上一課把文字切成了 token，每個 token 只是一個 ID，例如 4821。可是 ID 只是編號：4821 和 4822 不代表意思相近，模型也無法拿編號做「貓和狗很像」這種判斷。語言模型做的第一件事，就是把每個 token ID 換成一串數字，也就是向量；專門的 embedding 模型則能把一整句話變成一個向量。只要意思相近的文字得到方向相近的向量，「找出意思最接近的句子」就變成一道算術題。本課從零開始講向量、內積、長度與餘弦相似度，分清模型內部的 embedding 表與句子 embedding 模型，再用三個探索器實際找出最相近的詞與句子，最後看懂 2D 投影圖能告訴你什麼、又會騙你什麼。',
  sections: [
    {
      id: 'llm03-why-vectors', title: '從 token ID 到向量：embedding 是什麼',
      blocks: [
        { type: 'p', text: 'embedding（嵌入向量）是把一個離散的東西，例如一個 token 或一整段文件，對應到一個固定長度的數字清單，也就是向量表示。例如「貓」可能對應到 (0.9, 0.0, 0.1, 0.8)。向量的每個位置叫做一個維度（dimension），向量有幾個數字就是幾維。' },
        { type: 'p', text: '為什麼不直接用 token ID？因為 ID 是斷詞器建立詞彙表時排出來的編號，大小和遠近都沒有意思：ID 913 的「狗」和 ID 4821 的「貓」差了三千多，ID 4821 和 4822 也可能是完全無關的兩個 token。向量則可以讓「意思相近」變成「方向相近」：只要訓練讓常在相似上下文出現的 token 得到相近的向量，模型就能把在「貓」身上學到的規律推廣到「狗」。' },
        { type: 'table', head: ['', 'token ID', 'embedding 向量'], rows: [
          ['是什麼', '詞彙表裡的一個整數編號', '一串實數，例如數百到數千個'],
          ['能不能比較意思', '不能：編號的大小、遠近沒有語意', '可以：用內積或餘弦相似度比較方向'],
          ['從哪裡來', '斷詞器的詞彙表（上一課）', '模型訓練時學到的參數，或 embedding 模型的輸出'],
        ] },
        { type: 'p', text: '本課有兩種 embedding，要分清楚：一種是語言模型內部的 embedding 表，每個 token ID 查出一列向量；另一種是句子 embedding（文件 embedding）模型，讀完一整段文字後輸出一個向量，用來做語意搜尋。兩者都是向量，比較方法也相同，所以先把向量的算術學好。' },
        { type: 'callout', tone: 'note', title: '本課的數字都是示意資料', text: '三個探索器裡的向量都是課程為了說明原理而手寫的示意資料，只有 3 到 5 維，而且替每一維取了「動物」「交通」這類名字方便閱讀。它們不是任何真實模型的輸出；真實模型的向量維度高得多，單獨一維通常也沒有這麼清楚的意思。' },
      ],
    },
    {
      id: 'llm03-vector-math', title: '向量的基本功：內積、長度與餘弦相似度',
      blocks: [
        { type: 'p', text: '先用二維向量練習，因為二維可以畫在紙上：向量 a = (3, 4) 就是從原點 (0, 0) 指向點 (3, 4) 的箭頭。高維向量沒辦法畫，但計算方法完全一樣，只是數字變多。' },
        { type: 'list', ordered: true, items: [
          '內積（dot product）：兩個向量對應位置相乘再全部加起來。a · b = a₁b₁ + a₂b₂ + … + aₙbₙ。兩個向量必須維度相同。',
          '長度（norm，又叫範數）：向量和自己的內積再開根號，|a| = √(a · a)。二維時就是畢氏定理算出的箭頭長度。',
          '餘弦相似度（cosine similarity）：內積除以兩個長度的乘積，cos = (a · b) ÷ (|a| × |b|)。它是兩個箭頭夾角 θ 的 cos θ，只看方向、不看長度。',
        ] },
        { type: 'p', text: '一個完整的手算例子：a = (3, 4)、b = (4, 3)、c = (6, 8)。' },
        { type: 'table', head: ['計算', '算式', '結果'], rows: [
          ['a · b', '3×4 + 4×3', '24'],
          ['|a|、|b|', '√(3² + 4²)、√(4² + 3²)', '5、5'],
          ['cos(a, b)', '24 ÷ (5 × 5)', '0.96'],
          ['b · c', '4×6 + 3×8', '48'],
          ['|c|', '√(6² + 8²)', '10'],
          ['cos(b, c)', '48 ÷ (5 × 10)', '0.96'],
          ['cos(a, c)', '(3×6 + 4×8) ÷ (5 × 10) = 50 ÷ 50', '1'],
        ] },
        { type: 'p', text: 'c 是 a 放大兩倍，方向完全相同，所以 cos(a, c) = 1。b 和 c 的內積是 48，比 b 和 a 的 24 大了一倍，可是餘弦相似度一樣是 0.96：內積會被長度放大，餘弦相似度把長度除掉，只留下方向。把向量除以自己的長度叫做正規化（normalization），得到長度 1 的單位向量，例如 a 正規化後是 (3/5, 4/5) = (0.6, 0.8)。兩個單位向量的內積就等於它們的餘弦相似度。' },
        { type: 'table', head: ['餘弦相似度', '夾角', '意思'], rows: [
          ['1', '0°', '方向完全相同（長度可以不同）'],
          ['0', '90°', '互相垂直，方向上沒有共同的成分'],
          ['−1', '180°', '方向完全相反'],
        ] },
        { type: 'callout', tone: 'warning', title: '「距離」和「相似度」方向相反', text: '相似度越大越像，距離越小越像，兩者不能混在一起排序。有些工具用餘弦距離 1 − cos 表示「不像的程度」：cos = 0.99 的兩個向量，餘弦距離是 0.01。看到一個 0.01，要先確認它是距離（非常像）還是相似度（幾乎無關），否則排序會整個顛倒。' },
      ],
    },
    {
      id: 'llm03-embedding-table', title: '模型內部的 embedding 表：一個 token ID 一列',
      blocks: [
        { type: 'p', text: '語言模型裡有一張 embedding 表（embedding matrix），可以想成一個很大的表格：每個 token ID 對應一列，每一列是一個向量。詞彙表有 V 個 token、向量有 d 維，這張表就是 V 列、每列 d 個數。模型讀入 token ID 序列後，第一步就是逐一查表，把每個 ID 換成它那一列的向量，再交給後面的 Transformer 層處理。' },
        { type: 'p', text: '這張表的數字不是人寫的，而是模型參數的一部分：一開始是亂數，訓練過程中跟著其他參數一起調整，讓整個模型更會預測下一個 token。訓練之後，常出現在相似上下文的 token，例如「貓」和「狗」，往往得到方向相近的向量。下面的探索器是 8 個 token 的示意 embedding 表，選一個 token 就能看到其他 token 和它的相似度排名。' },
        { type: 'example', id: 'llm03-token-table' },
        { type: 'p', text: '在探索器選「貓」：餘弦相似度最高的是「狗」（0.991），其次是「老虎」（0.818），交通工具與水果都很低。散布圖上，動物、交通工具、水果各自聚成一團，這就是「語意相近的詞彼此靠近」。再選「老虎」並切換到內積，會看到排名改變：這正是第五節要談的長度問題。' },
        { type: 'p', text: '向量維度是設計模型時決定的。真實的語言模型，embedding 表的每一列通常有數百到數千維，詞彙表有數萬到數十萬個 token，所以光是這張表就可能有上億個參數。維度越高能容納越多細微的差別，代價是更多的記憶體與計算。本課的 4 維只是為了讓你能用手算。' },
        { type: 'callout', tone: 'note', title: '同一個 token 永遠查到同一列', text: '查表只看 token ID，不看上下文：「蘋果很好吃」和「蘋果發表新手機」裡的「蘋果」查到的是同一列向量。分辨這兩種意思是後面 Transformer 層的工作，它們會依上下文把向量逐層改寫，這會在後面的課程談到。所以 embedding 表的一列只是 token 的起點，不是它在句子中的最終意思。' },
      ],
    },
    {
      id: 'llm03-sentence-embedding', title: '句子 embedding 與語意搜尋：最近鄰',
      blocks: [
        { type: 'p', text: '如果要問「哪一篇文章和使用者的問題最相關」，需要的是整段文字的一個向量，而不是每個 token 各一個。句子 embedding 模型（也叫文件 embedding 或文字 embedding 模型）就是做這件事：輸入一段文字，輸出一個固定維度的向量。常見的做法是讓 Transformer 讀完整段文字，再把各位置的輸出合成一個向量（例如取平均），並用「意思相近的句子向量要靠近、不相關的要遠離」的目標訓練。' },
        { type: 'table', head: ['', '模型內的 embedding 表', '句子 embedding 模型'], rows: [
          ['輸入', '一個 token ID', '一整段文字'],
          ['輸出', '表中那一列向量（每個 token 一個）', '整段文字一個向量'],
          ['看不看上下文', '不看：同一個 token 永遠同一列', '看：整段文字一起讀'],
          ['主要用途', '語言模型處理文字的第一步', '語意搜尋、分群、找重複、檢索增強生成'],
        ] },
        { type: 'p', text: '語意搜尋的步驟是：事先用 embedding 模型把每份文件轉成向量存起來；使用者提問時，把問題也轉成向量（查詢向量）；算出查詢和每份文件的餘弦相似度，由高到低排序，取前 k 名。這叫最近鄰搜尋（nearest neighbour search）。它和關鍵字搜尋的差別在於：「上班通勤遇到交通延誤」和「早上的捷運又誤點了」沒有共同的詞，向量卻可以很接近。' },
        { type: 'example', id: 'llm03-sentence-search' },
        { type: 'p', text: '探索器預設選取查詢「上班通勤遇到交通延誤」，第一名是「早上的捷運又誤點了」（0.984），第二名是「颱風來了，明天停班停課」（0.600），因為颱風也會影響交通。換成查詢「怎麼照顧家裡的寵物」，前兩名是貓和狗的句子。文件有幾百萬份時，逐一計算太慢，實務上會用專門的近似最近鄰索引（向量資料庫常內建），以少量誤差換取速度，但「依相似度取前 k 名」的意思不變。' },
      ],
    },
    {
      id: 'llm03-normalize', title: '內積還是餘弦：為什麼要正規化',
      blocks: [
        { type: 'p', text: '內積 = |a| × |b| × cos θ。所以內積同時受兩件事影響：方向有多接近（cos θ），以及兩個向量有多長。如果向量的長度彼此差很多，一個方向普普通通、但特別長的向量，內積可能贏過方向幾乎完全一致的短向量。長度往往反映的是和語意無關的因素，用內積排序時就會被它干擾。' },
        { type: 'p', text: '下面的探索器刻意放了一個很長的向量：「社區月刊合訂本」什麼主題都談一點，示意資料把它寫成每一維都很大的向量，長度約 2.90，其他句子與查詢的長度都不到 1。選查詢「貓為什麼一直睡」，在餘弦相似度與內積之間切換，看看第一名怎麼變。' },
        { type: 'example', id: 'llm03-dot-vs-cosine' },
        { type: 'table', head: ['和查詢「貓為什麼一直睡」比較', '內積', '餘弦相似度'], rows: [
          ['貓咪白天為什麼愛睡覺（長度 0.911）', '0.73', '0.994'],
          ['社區月刊合訂本（長度 2.902）', '1.36', '0.581'],
        ] },
        { type: 'p', text: '用內積，合訂本以 1.36 排第一；用餘弦相似度，真正談貓睡覺的句子以 0.994 遙遙領先。先把每個向量正規化成長度 1，內積就等於餘弦相似度，長度的干擾也就消失了。不少 embedding 模型或服務輸出的向量已經正規化，這時用內積排序（計算較快）和用餘弦排序結果相同；但這是要查文件或自己算長度確認的事，不能假設。' },
        { type: 'callout', tone: 'warning', title: '「內積越大，意思就越接近」', text: '只有在所有向量長度相同（例如都已正規化成 1）時才成立。向量長短不一時，內積大可能只是因為向量長。在第一個探索器選「老虎」：內積的第一名是「貓」（0.90），因為貓的向量比較長；餘弦相似度的第一名卻是「狗」（0.844 對 0.818）。比較意思之前，先確認用的是餘弦相似度，或向量已經正規化。' },
      ],
    },
    {
      id: 'llm03-projection', title: '2D 投影：看到什麼、失去什麼',
      blocks: [
        { type: 'p', text: '高維向量無法直接畫出來，探索器用主成分分析（PCA，principal component analysis）把它們投影到平面上：先把所有點的平均移到原點，找出點分布得最開的方向當第一軸，再找和第一軸垂直、分布次開的方向當第二軸，每個點在兩軸上的位置就是它的 2D 座標。散布圖讓人一眼看出分群，例如第一個探索器的動物、交通工具、水果三團。' },
        { type: 'p', text: '但兩軸只保留了一部分資訊。每個探索器在圖下寫著兩軸各保留多少變異：embedding 表的兩軸合計保留約 93%，所以圖和真實的相似度大致吻合；句子空間是 5 維，兩軸合計只保留約 67%，有三分之一的差異被壓扁了。真實模型有數百到數千維，壓成兩維失去的比例通常更大。' },
        { type: 'list', items: [
          '圖上很遠：PCA 是把點正投影到平面上，只會把距離縮短、不會拉長，所以原本的距離也很遠；但距離遠不一定代表餘弦相似度低，例如方向相同、長度差很多的兩個向量。',
          '圖上很近，原本一定像：不可靠。在被捨棄的維度上差很多的兩個點，投影後可能疊在一起。',
          '圖的原點是所有點的平均，不是零向量；餘弦相似度看的是從零向量出發的方向，所以圖上的夾角不等於真正的夾角。',
          '加入或刪除幾個點，平均與軸都會改變，同一個點的座標也會跟著變；不同圖之間的座標不能直接比較。',
        ] },
        { type: 'p', text: '回到句子探索器，選查詢「下大雨學校會放假嗎」。在散布圖上，它幾乎貼著「早上的捷運又誤點了」；看相似度表格，第一名卻是「颱風來了，明天停班停課」（0.910），捷運那句只有 0.337。查詢和捷運那句在「天氣」「交通」「學習」上的差別，大部分落在投影捨棄的方向上。' },
        { type: 'callout', tone: 'warning', title: '「散布圖上靠得最近的點，就是最相似的」', text: '散布圖是為了讓人看出大致的分群，不是用來排名的。判斷誰最相似，一律看原始向量算出的餘弦相似度（探索器的相似度表格），把 2D 圖上的遠近當成線索，而不是答案。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    { id: 'llm03-q1', prompt: '一個語言模型的詞彙表有 V 個 token，embedding 向量是 d 維。它的 embedding 表是什麼形狀？',
      options: ['V 列，每列是一個 token 的 d 維向量', 'd 列，每列是一個維度的 V 個 token', '每個句子一列，每列 d 個數', '只有一列，所有 token 共用同一個向量'], answer: 0,
      explanation: '每個 token ID 查表時取出自己的那一列，所以有 V 列、每列 d 個數。以維度為列是把表轉置了，查一個 token 時要跨好幾列；每個句子一列是句子 embedding 的做法，不是模型內的表；所有 token 共用一個向量就無法區分任何 token。' },
    { id: 'llm03-q2', prompt: '向量 (1, 0) 和 (0, 1) 的餘弦相似度是多少？',
      options: ['1', '0', '−1', '0.5'], answer: 1,
      explanation: '內積是 1×0 + 0×1 = 0，所以餘弦相似度是 0，兩個向量互相垂直。1 代表方向相同、−1 代表方向相反，0.5 是 60° 夾角的值，三者都不符合這兩個垂直的向量。' },
    { id: 'llm03-q3', prompt: '向量 a = (3, 4)，b = (6, 8)。它們的內積與餘弦相似度分別是多少？',
      options: ['內積 1，餘弦相似度 50', '內積 25，餘弦相似度 2', '內積 50，餘弦相似度 1', '內積 50，餘弦相似度 0.5'], answer: 2,
      explanation: '內積是 3×6 + 4×8 = 50；長度是 5 和 10，所以餘弦相似度是 50 ÷ 50 = 1：b 是 a 的兩倍，方向完全相同。餘弦相似度不會超過 1，所以 50 和 2 都不可能；0.5 是誤以為長度加倍會讓相似度減半，但 b 只改變長度、不改變方向。' },
    { id: 'llm03-q4', prompt: '某個向量資料庫回傳「餘弦距離」（1 − 餘弦相似度）。四份文件的值如下，哪一份和查詢最相似？',
      options: ['文件 A：0.92', '文件 B：0.40', '文件 C：0.25', '文件 D：0.03'], answer: 3,
      explanation: '餘弦距離越小越相似，0.03 代表餘弦相似度 0.97，方向幾乎相同，所以是文件 D。把距離當成相似度，就會誤選數值最大的文件 A（相似度只有 0.08）；B、C 的距離都比 D 大，相似度分別只有 0.60 與 0.75。' },
    { id: 'llm03-q5', prompt: '在 2D PCA 散布圖上，查詢點和文件 X 幾乎重疊，但相似度表格裡排第一的是文件 Y。該相信哪一個？',
      options: ['相信散布圖，X 最相似', '相信相似度表格，Y 最相似', '兩者都對，X 和 Y 一樣相似', '都不能信，要再加一個維度重畫'], answer: 1,
      explanation: '投影只保留兩個方向的變異，捨棄的維度上差很多的點也可能疊在一起；表格是用原始向量算出的餘弦相似度，才是排名的依據。散布圖上的重疊不代表相似度相同；把投影改成三維仍然會失去資訊，也不能取代直接計算。' },
    { id: 'llm03-q6', prompt: '要從一千篇 FAQ 文章中找出和使用者問題最相關的一篇，應該用哪一種向量？',
      options: ['用句子 embedding 模型替每篇文章和問題各算一個向量', '把問題第一個 token 在 embedding 表中的那一列拿來比較', '直接比較 token ID 的大小', '把問題的 token ID 加總成一個數字'], answer: 0,
      explanation: '語意搜尋需要「一段文字一個向量」，而且要讀過整段文字，這正是句子 embedding 模型的用途。embedding 表的一列只代表單一 token、不看上下文；token ID 只是編號，大小沒有語意，加總後更失去所有資訊。' },
    { id: 'llm03-q7', prompt: '所有向量都已正規化成長度 1 時，下列哪一句正確？',
      options: ['內積一定是 0', '內積永遠大於餘弦相似度', '內積等於餘弦相似度，用哪一個排序結果都相同', '餘弦相似度無法計算'], answer: 2,
      explanation: '餘弦相似度 = 內積 ÷（長度 × 長度），長度都是 1 時兩者相等，排序自然相同。內積只有在互相垂直時才是 0；兩者相等，所以不會一個永遠比較大；只有零向量無法計算餘弦相似度，長度 1 的向量都可以。' },
    { id: 'llm03-q8', prompt: '關於真實語言模型的向量維度，哪一句最恰當？',
      options: ['固定是 2 維，才能畫成散布圖', '和詞彙表的 token 數一樣多', '剛好每一維對應一個人能命名的概念', '常見是數百到數千維，由模型設計決定'], answer: 3,
      explanation: '真實模型的 embedding 通常有數百到數千維，是設計模型時選定的超參數。2 維只是為了畫圖而做的投影；維度和詞彙表大小是兩回事（表有 V 列、每列 d 維）；本課替每一維取名只是教學標籤，真實向量的單一維度通常沒有這麼清楚的意思。' },
  ],
  llm: {
    embeddings: [
      {
        id: 'llm03-token-table', title: '示意的 embedding 表：8 個 token',
        description: '語言模型內 embedding 表的 8 列（示意資料，4 維，維度名稱只是教學標籤；token ID 是示意編號）。選一個 token，看其他 token 和它的相似度排名；切換內積，看排名哪裡不同。',
        space: {
          kind: 'token', dimensions: ['動物', '交通', '食物', '寵物'],
          items: [
            { id: 'cat', token: '貓', tokenId: 4821, vector: [0.9, 0.0, 0.1, 0.8], group: '動物' },
            { id: 'dog', token: '狗', tokenId: 913, vector: [0.9, 0.1, 0.0, 0.7], group: '動物' },
            { id: 'tiger', token: '老虎', tokenId: 15077, vector: [0.9, 0.0, 0.1, 0.1], group: '動物' },
            { id: 'car', token: '汽車', tokenId: 2290, vector: [0.0, 0.9, 0.0, 0.1], group: '交通工具' },
            { id: 'train', token: '火車', tokenId: 7340, vector: [0.0, 0.8, 0.1, 0.0], group: '交通工具' },
            { id: 'bike', token: '腳踏車', tokenId: 30512, vector: [0.1, 0.7, 0.0, 0.3], group: '交通工具' },
            { id: 'apple', token: '蘋果', tokenId: 6610, vector: [0.0, 0.0, 0.9, 0.2], group: '水果' },
            { id: 'banana', token: '香蕉', tokenId: 22158, vector: [0.1, 0.0, 0.8, 0.1], group: '水果' },
          ],
        },
      },
      {
        id: 'llm03-sentence-search', title: '示意的句子 embedding：語意搜尋',
        description: '六個句子與三個查詢的文件 embedding（示意資料，5 維）。選一個查詢，相似度表格就是語意搜尋的排名；再對照散布圖，看 2D 投影和真正的排名哪裡不同。',
        space: {
          kind: 'document', dimensions: ['寵物', '交通', '天氣', '食物', '學習'],
          items: [
            { id: 'd1', text: '我家的貓整天都在睡覺', vector: [0.9, 0.0, 0.1, 0.1, 0.0] },
            { id: 'd2', text: '早上的捷運又誤點了', vector: [0.0, 0.9, 0.2, 0.0, 0.1] },
            { id: 'd3', text: '颱風來了，明天停班停課', vector: [0.0, 0.3, 0.9, 0.0, 0.3] },
            { id: 'd4', text: '夜市的蚵仔煎很好吃', vector: [0.0, 0.1, 0.0, 0.9, 0.0] },
            { id: 'd5', text: '期末考前要複習三章', vector: [0.0, 0.0, 0.0, 0.1, 0.9] },
            { id: 'd6', text: '傍晚帶狗去公園散步', vector: [0.8, 0.1, 0.3, 0.0, 0.0] },
          ],
          queries: [
            { id: 'q1', text: '上班通勤遇到交通延誤', vector: [0.0, 0.8, 0.3, 0.0, 0.0] },
            { id: 'q2', text: '怎麼照顧家裡的寵物', vector: [0.9, 0.0, 0.0, 0.1, 0.1] },
            { id: 'q3', text: '下大雨學校會放假嗎', vector: [0.0, 0.1, 0.7, 0.0, 0.6] },
          ],
        },
      },
      {
        id: 'llm03-dot-vs-cosine', title: '一個很長的向量：內積與餘弦',
        description: '四份文件與一個查詢（示意資料，3 維）。「社區月刊合訂本」的向量刻意寫得特別長（沒有正規化）。在餘弦相似度與內積之間切換，比較排名。',
        space: {
          kind: 'document', dimensions: ['寵物', '交通', '食物'],
          items: [
            { id: 'short', text: '貓咪白天為什麼愛睡覺', vector: [0.9, 0.1, 0.1] },
            { id: 'long', text: '社區月刊合訂本', vector: [1.5, 1.9, 1.6] },
            { id: 'train', text: '火車時刻表更新', vector: [0.1, 0.9, 0.0] },
            { id: 'cake', text: '戚風蛋糕食譜', vector: [0.0, 0.2, 0.8] },
          ],
          queries: [{ id: 'q', text: '貓為什麼一直睡', vector: [0.8, 0.0, 0.1] }],
        },
      },
    ],
    exercises: [
      { id: 'llm03-x-cosine', kind: 'number', title: '手算貓和狗的餘弦相似度',
        statement: '在 embedding 表探索器中，「貓」是 (0.9, 0.0, 0.1, 0.8)，「狗」是 (0.9, 0.1, 0.0, 0.7)。先手算它們的餘弦相似度（四捨五入到小數點後三位），再用探索器核對。',
        blank: { id: 'cos', label: '餘弦相似度', query: { of: 'cosine', explorer: 'llm03-token-table', a: 'cat', b: 'dog' }, answer: 0.991, tolerance: 0.002 },
        hints: ['先算內積：四個維度對應相乘再加總。', '再算兩個向量的長度：各自的平方和開根號。', '餘弦相似度 = 內積 ÷（兩個長度相乘）。'],
        explanation: '內積 = 0.9×0.9 + 0×0.1 + 0.1×0 + 0.8×0.7 = 0.81 + 0.56 = 1.37；|貓| = √(0.81 + 0 + 0.01 + 0.64) = √1.46 ≈ 1.208，|狗| = √(0.81 + 0.01 + 0 + 0.49) = √1.31 ≈ 1.145；1.37 ÷ (1.208 × 1.145) ≈ 1.37 ÷ 1.383 ≈ 0.991。非常接近 1，代表兩個向量方向幾乎相同。',
        mistakes: [
          { answer: { value: '1.37' }, why: '只算了內積，沒有除以兩個長度的乘積；餘弦相似度不會大於 1' },
          { answer: { value: '0.009' }, why: '算成餘弦距離 1 − cos：那是「不像的程度」，和相似度方向相反' },
          { answer: { value: '0.147' }, why: '量的是散布圖上兩點的 2D 距離，不是原始向量的餘弦相似度' },
        ] },
      { id: 'llm03-x-tiger', kind: 'choice', title: '老虎最接近誰',
        statement: '在 embedding 表探索器中選「老虎」，用餘弦相似度排序。哪一個 token 和「老虎」最相似？',
        query: { of: 'nearest', explorer: 'llm03-token-table', item: 'tiger' },
        options: ['貓', '狗', '腳踏車', '香蕉'], answer: 1,
        hints: ['確認相似度選的是「餘弦相似度」，不是內積。', '比較表格中前兩名的分數，差距不大，要看清楚。'],
        explanation: '老虎和狗的餘弦相似度是 0.844，和貓是 0.818，所以第一名是狗。若改用內積，貓（0.90）會勝過狗（0.88），因為貓的向量比較長（1.208 對 1.145）。這份示意的 embedding 表沒有「貓科」這一維，直覺和向量算出來的結果不一定相同，要以計算為準。',
        mistakes: [
          { answer: { choice: '0' }, why: '用內積排序（貓 0.90 比狗 0.88 大），或憑直覺認為同屬貓科一定最接近；餘弦相似度的第一名是狗' },
          { answer: { choice: '2' }, why: '把「腳踏車」在「寵物」維度的 0.3 看得太重，忽略了最大的「動物」維度' },
        ] },
      { id: 'llm03-x-bike', kind: 'field', title: '腳踏車的前三個近鄰',
        statement: '在 embedding 表探索器中選「腳踏車」，用餘弦相似度由高到低寫出最相似的 3 個 token，用 | 分開。',
        blank: { id: 'top3', label: '前三名 token（用 | 分開）', query: { of: 'nearest', explorer: 'llm03-token-table', item: 'bike', k: 3 }, answer: '汽車|火車|狗' },
        hints: ['表格已經依分數由高到低排好，自己不算在內。', '第三名在另一團，看分數決定是哪一個。'],
        explanation: '腳踏車和汽車 0.949、火車 0.904，同屬交通工具；第三名是狗 0.421，比貓 0.356 高，因為狗在「交通」維度有 0.1，向量也比貓短一些（1.145 對 1.208）。最近鄰搜尋就是這樣依分數取前 k 名。',
        mistakes: [
          { answer: { value: '汽車|火車' }, why: '只寫了兩個，題目要前三名' },
          { answer: { value: '火車|汽車|狗' }, why: '順序錯了：汽車 0.949 比火車 0.904 高' },
          { answer: { value: '汽車|火車|貓' }, why: '以為貓和狗一樣：貓 0.356 比狗 0.421 低' },
        ] },
      { id: 'llm03-x-search', kind: 'choice', title: '下大雨，學校會放假嗎',
        statement: '在句子 embedding 探索器中選查詢「下大雨學校會放假嗎」。用餘弦相似度，哪一個句子排第一？（先看散布圖猜一次，再看相似度表格。）',
        query: { of: 'nearest', explorer: 'llm03-sentence-search', item: 'q3' },
        options: ['期末考前要複習三章', '早上的捷運又誤點了', '傍晚帶狗去公園散步', '颱風來了，明天停班停課'], answer: 3,
        hints: ['散布圖上最近的點不一定是答案，看相似度表格的第一名。', '查詢在「天氣」與「學習」兩維最大。'],
        explanation: '查詢與「颱風來了，明天停班停課」的餘弦相似度是 0.910，與「期末考前要複習三章」是 0.643，與「早上的捷運又誤點了」只有 0.337。散布圖上查詢緊貼著捷運那句，是因為兩軸只保留約 67% 的變異，「天氣」與「學習」的差別被投影壓掉了。',
        mistakes: [
          { answer: { choice: '1' }, why: '只看散布圖上最近的點；2D 投影捨棄了部分維度，真正的餘弦相似度只有 0.337' },
          { answer: { choice: '0' }, why: '只看「學習」一維（「學校」聯想到「考試」），忽略查詢最大的「天氣」維度' },
        ] },
      { id: 'llm03-x-projection', kind: 'table', title: '讀投影座標，再對照餘弦',
        statement: '在句子 embedding 探索器中展開「向量與 2D 座標」，讀出查詢「下大雨學校會放假嗎」的 2D 座標（小數點後三位），再寫出它和兩個句子的餘弦相似度。',
        blanks: [
          { id: 'x', label: '查詢的 x 座標', query: { of: 'projection', explorer: 'llm03-sentence-search', item: 'q3', axis: 'x' }, answer: -0.394, tolerance: 0.002 },
          { id: 'y', label: '查詢的 y 座標', query: { of: 'projection', explorer: 'llm03-sentence-search', item: 'q3', axis: 'y' }, answer: -0.263, tolerance: 0.002 },
          { id: 'cosStorm', label: '和「颱風來了，明天停班停課」的餘弦相似度', query: { of: 'cosine', explorer: 'llm03-sentence-search', a: 'q3', b: 'd3' }, answer: 0.910, tolerance: 0.002 },
          { id: 'cosMetro', label: '和「早上的捷運又誤點了」的餘弦相似度', query: { of: 'cosine', explorer: 'llm03-sentence-search', a: 'q3', b: 'd2' }, answer: 0.337, tolerance: 0.002 },
        ],
        hints: ['座標表格的最後兩欄是 x 與 y；查詢那一列標著「（查詢）」。', '餘弦相似度可以在相似度表格讀，也可以手算：內積 ÷（兩個長度相乘）。'],
        explanation: '查詢的座標約是 (−0.394, −0.263)，捷運那句約是 (−0.394, −0.327)，在圖上幾乎重疊；颱風那句約是 (−0.367, −0.474)，看起來反而比較遠。可是餘弦相似度是 0.910 對 0.337：手算颱風那句，內積 = 0.1×0.3 + 0.7×0.9 + 0.6×0.3 = 0.84，長度 √0.86 ≈ 0.927 與 √0.99 ≈ 0.995，0.84 ÷ 0.923 ≈ 0.910。2D 的遠近只是線索，排名要看原始向量。',
        mistakes: [
          { answer: { x: '-0.263', y: '-0.394', cosStorm: '0.910', cosMetro: '0.337' }, why: 'x 與 y 對調了' },
          { answer: { x: '-0.394', y: '-0.327', cosStorm: '0.910', cosMetro: '0.337' }, why: 'y 讀到「早上的捷運又誤點了」那一列' },
          { answer: { x: '-0.394', y: '-0.263', cosStorm: '0.84', cosMetro: '0.29' }, why: '餘弦相似度只算了內積，沒有除以長度' },
        ] },
      { id: 'llm03-x-dot-vs-cosine', kind: 'table', title: '內積與餘弦的排名對決',
        statement: '在「一個很長的向量」探索器中選查詢「貓為什麼一直睡」(0.8, 0.0, 0.1)。寫出「社區月刊合訂本」的長度，以及查詢和兩份文件的內積與餘弦相似度（小數點後三位）。',
        blanks: [
          { id: 'normLong', label: '「社區月刊合訂本」的長度', query: { of: 'norm', explorer: 'llm03-dot-vs-cosine', item: 'long' }, answer: 2.902, tolerance: 0.002 },
          { id: 'dotLong', label: '查詢和「社區月刊合訂本」的內積', query: { of: 'dot', explorer: 'llm03-dot-vs-cosine', a: 'q', b: 'long' }, answer: 1.36, tolerance: 0.002 },
          { id: 'dotShort', label: '查詢和「貓咪白天為什麼愛睡覺」的內積', query: { of: 'dot', explorer: 'llm03-dot-vs-cosine', a: 'q', b: 'short' }, answer: 0.73, tolerance: 0.002 },
          { id: 'cosLong', label: '查詢和「社區月刊合訂本」的餘弦相似度', query: { of: 'cosine', explorer: 'llm03-dot-vs-cosine', a: 'q', b: 'long' }, answer: 0.581, tolerance: 0.002 },
          { id: 'cosShort', label: '查詢和「貓咪白天為什麼愛睡覺」的餘弦相似度', query: { of: 'cosine', explorer: 'llm03-dot-vs-cosine', a: 'q', b: 'short' }, answer: 0.994, tolerance: 0.002 },
        ],
        hints: ['合訂本的向量是 (1.5, 1.9, 1.6)，長度是平方和開根號。', '內積直接對應相乘再加總；餘弦相似度再除以兩個長度。', '查詢的長度是 √(0.64 + 0 + 0.01) ≈ 0.806。'],
        explanation: '|合訂本| = √(2.25 + 3.61 + 2.56) = √8.42 ≈ 2.902。內積：合訂本 0.8×1.5 + 0 + 0.1×1.6 = 1.36，貓那句 0.8×0.9 + 0 + 0.1×0.1 = 0.73，所以用內積排序合訂本第一。餘弦：1.36 ÷ (0.806 × 2.902) ≈ 0.581，0.73 ÷ (0.806 × 0.911) ≈ 0.994，排名反過來。合訂本贏在長度，不是方向；正規化之後它就不再佔便宜。',
        mistakes: [
          { answer: { normLong: '8.42', dotLong: '1.36', dotShort: '0.73', cosLong: '0.581', cosShort: '0.994' }, why: '長度忘了開根號，8.42 是平方和' },
          { answer: { normLong: '2.902', dotLong: '1.36', dotShort: '0.73', cosLong: '1.36', cosShort: '0.73' }, why: '把內積當成餘弦相似度，忘了除以長度（忘了正規化）' },
          { answer: { normLong: '5', dotLong: '1.36', dotShort: '0.73', cosLong: '0.581', cosShort: '0.994' }, why: '長度寫成各維數值直接相加 1.5 + 1.9 + 1.6，不是平方和開根號' },
        ] },
    ],
  },
};
