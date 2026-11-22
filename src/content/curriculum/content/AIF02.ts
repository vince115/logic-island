import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * AIF02 AI 的發展史與主要方法. Python only (python-code). Every example and the reference solution run in
 * tests/curriculum-code.test.ts and under two hash seeds in tests/python-capability.test.ts. The blueprint activity
 * (case-study-board) is not built, so the lesson uses timeline and comparison tables instead of a visualization.
 */
export const AIF02: LessonContent = {
  lessonId: 'AIF02',
  motivation: '今天談 AI 幾乎都在談大型語言模型，但 AI 從 1956 年成為研究領域至今，已經歷兩次 AI 寒冬，主流路線也從符號規則換到統計學習，再換到深度學習與基礎模型。知道每一波為什麼興起、為什麼退潮，才能分辨新的宣稱哪些是真正的突破、哪些是歷史上反覆出現的過度承諾；也才看得懂本島的搜尋與邏輯，以及後面機器學習、深度學習、LLM 各島，各自承接了哪一條路線。',
  sections: [
    {
      id: 'dartmouth', title: '1956 年達特茅斯會議、早期符號 AI 與第一次寒冬',
      blocks: [
        { type: 'p', text: '上一課（AIF01）談過「AI 是什麼」，這一課看它怎麼走到今天。1950 年 Alan Turing 發表〈Computing Machinery and Intelligence〉，提出用模仿遊戲判斷機器能否思考。1955 年，John McCarthy、Marvin Minsky、Nathaniel Rochester 與 Claude Shannon 提案在隔年夏天舉辦一場研究會議，「人工智慧（artificial intelligence）」這個詞就出自這份提案。1956 年夏天的達特茅斯會議（Dartmouth workshop）在美國達特茅斯學院舉行，通常被視為 AI 成為獨立研究領域的起點。提案的基本假設是：學習與智慧的每個面向，原則上都能描述得夠精確，讓機器去模擬。' },
        { type: 'p', text: '早期的主流是符號主義（symbolism，也稱 symbolic AI）：把知識寫成符號（例如「蘇格拉底是人」），用規則、邏輯與搜尋來操作這些符號。Allen Newell、Herbert Simon 與 Cliff Shaw 的 Logic Theorist 在會議前後完成，能證明《數學原理》中的定理；他們之後的 General Problem Solver 用「比較目前狀態與目標、選一個縮小差距的動作」來解題。這些程式在棋盤、積木、邏輯證明這類規則清楚的小世界裡表現亮眼，帶來強烈的樂觀。' },
        { type: 'table', head: ['年份', '事件', '代表的想法'], rows: [
          ['1950', 'Turing〈Computing Machinery and Intelligence〉', '用可觀察的行為（模仿遊戲）討論機器能否思考'],
          ['1956', '達特茅斯會議；Logic Theorist', 'AI 成為研究領域；用符號與搜尋證明定理'],
          ['1958', 'Frank Rosenblatt 的感知器（perceptron）', '從資料調整權重，連結主義的起點（第 4 段）'],
          ['1965', 'Stanford 的 DENDRAL 計畫開始', '把化學家的知識寫成規則推斷分子結構，專家系統的先驅'],
          ['1966', 'Joseph Weizenbaum 的 ELIZA', '用模式比對規則模仿對話，沒有真正理解內容'],
        ] },
        { type: 'p', text: '問題在規模變大時出現。第一是組合爆炸（combinatorial explosion）：搜尋的狀態數隨步數指數成長，小世界可以窮舉，真實問題不行（這正是 AIF04、AIF05 的搜尋要用啟發式控制的原因）。第二是常識：機器翻譯要懂語境，規則寫不完。第三是運算與記憶體非常有限。1966 年美國的 ALPAC 報告認為機器翻譯進展不如預期，相關經費被大幅削減；1969 年 Minsky 與 Papert 的書《Perceptrons》指出單層感知器的限制；1973 年英國的 Lighthill 報告批評 AI 沒有兌現承諾、無法處理組合爆炸，英國隨後削減 AI 經費，美國 DARPA 也在 1970 年代前期收緊沒有明確應用的研究。大約從 1970 年代中期到 1980 年左右，就是第一次 AI 寒冬（AI winter）。' },
        { type: 'callout', tone: 'warning', title: '「AI 寒冬就是 AI 研究停止了」', text: '寒冬指的是經費、商業投資與外界期待大幅下降，不是研究消失。第一次寒冬期間，研究轉向特定領域的知識，直接孕育了 1980 年代的專家系統；第二次寒冬前後，1986 年的反向傳播與 1989 年 LeCun 等人用卷積網路辨識手寫郵遞區號都在進行。「AI winter」這個說法本身在 1984 年的 AAAI 年會討論中被提出，用來警告專家系統的熱潮可能重演過去的退潮。' },
        { type: 'callout', tone: 'note', title: '本課的時期年份是教學用的近似', text: '寒冬沒有明確的開始與結束日，不同書籍的劃分會差一兩年。本課為了能寫成程式，把時期定為固定的年份區間（第 6 段的表格與練習）；事件本身的年份（1956、1958、1969、1986、2012、2017）則是公認的。' },
      ],
    },
    {
      id: 'expert-systems', title: '專家系統：把專家知識寫成規則，以及第二次寒冬',
      blocks: [
        { type: 'p', text: '專家系統（expert system）放棄「通用的智慧」，只處理一個狹窄的領域，靠的是大量領域知識。它由三部分組成：知識庫（knowledge base），存放「如果條件成立，就得到結論」的規則；工作記憶，存放目前已知的事實；推論引擎（inference engine），決定哪條規則可以套用。知識工程師訪談專家，把經驗一條條寫成規則。' },
        { type: 'table', head: ['系統', '時間', '做什麼', '推論方式'], rows: [
          ['DENDRAL', '1965 年起，Stanford', '由質譜資料推斷有機分子的結構', '化學規則加上產生候選、逐一檢驗'],
          ['MYCIN', '1970 年代，Stanford', '診斷細菌感染（例如血液感染）並建議抗生素；研究系統，沒有進入日常臨床使用', '後向鏈結（backward chaining）：從要證明的結論往回找需要的條件；用確定因子表示不確定'],
          ['XCON（R1）', '1980 年起在 DEC 實際使用，由 CMU 開發', '依客戶訂單設定 VAX 電腦需要的零件與組合方式', '前向鏈結（forward chaining）：從已知事實出發，套用規則直到沒有新結論；以 OPS5 寫成'],
        ] },
        { type: 'p', text: '下面是一個極小的專家系統，用前向鏈結做教科書常見的動物辨識。推論引擎一輪一輪掃描規則，條件都在事實集合裡、結論還沒出現的規則就「觸發」，把結論加入事實；某一輪沒有任何新事實時停止。規則刻意倒著排列，讓你看到推論需要好幾輪。' },
        { type: 'example', id: 'expert-system' },
        { type: 'p', text: 'case A 第一輪只有 R3 能觸發（得到 mammal），R2 要等到第二輪，R1 要等到第三輪，所以前向鏈結必須重複掃描，不能只掃一遍。case C 給了 has_scales，知識庫沒有任何規則用到它，系統就完全沒有結論：它不會說「我不確定」，只會沉默或在規則外的情況給出錯誤答案。這種脆弱性（brittleness）正是專家系統的致命傷。' },
        { type: 'p', text: '1980 年代專家系統興起，因為它第一次讓 AI 在企業裡省下真金白銀（XCON 是最常被引用的例子）；日本在 1982 年啟動第五代電腦計畫，各國跟著投資，專門執行 Lisp 的 Lisp 機器也成為一門生意。衰退的原因同樣具體：知識擷取瓶頸（knowledge acquisition bottleneck），專家的經驗很難完整說清楚；規則數量增加後彼此衝突，維護成本暴增；遇到規則沒寫到的情況就失效。1987 年 Lisp 機器的市場崩盤，便宜的通用工作站與個人電腦已經能做同樣的事；第五代電腦計畫在 1992 年結束，沒有達成原本的目標。大約 1987 年到 1990 年代初，就是第二次 AI 寒冬。' },
      ],
    },
    {
      id: 'connectionism', title: '連結主義：感知器、XOR 與反向傳播',
      blocks: [
        { type: 'p', text: '和符號主義同時出現的另一條路線是連結主義（connectionism）：智慧來自大量簡單單元之間的連結，知識存在連結的權重裡，而且權重從資料學出來，不是人寫的。1943 年 McCulloch 與 Pitts 提出人工神經元的數學模型，1958 年 Rosenblatt 提出感知器與它的學習規則：' },
        { type: 'list', ordered: true, items: [
          '計算加權和 `w1*x1 + w2*x2 + b`，大於 0 就輸出 1，否則輸出 0（階梯函數）。',
          '誤差 `error = target - 輸出`，只可能是 -1、0、1。',
          '答錯時把每個權重加上 `error * 對應的輸入`，偏差 `b` 加上 `error`；答對就不動。',
          '重複掃描所有樣本，直到某一輪（epoch）完全沒有錯誤。',
        ] },
        { type: 'example', id: 'perceptron-and' },
        { type: 'p', text: '全部用整數，結果完全可以手算驗證。第 6 輪沒有錯誤，最後的 `w=[2, 1] b=-2` 表示 `2*x1 + x2 - 2 > 0`，只有 `(1, 1)` 會得到 1，這就是 AND。感知器收斂定理保證：只要資料能被一條直線（高維時是超平面）分開，也就是線性可分（linearly separable），這個規則一定會在有限步內找到一組能分對的權重。' },
        { type: 'p', text: '1969 年 Minsky 與 Papert 在《Perceptrons》中嚴格分析了單層感知器能做什麼、不能做什麼，最有名的例子是 XOR：輸入相同輸出 0、不同輸出 1。XOR 不是線性可分的，證明只要四行：要分對，必須 `b <= 0`、`w2 + b > 0`、`w1 + b > 0`、`w1 + w2 + b <= 0`；把中間兩式相加得到 `w1 + w2 + 2b > 0`，即 `w1 + w2 + b > -b >= 0`，和第四式矛盾。' },
        { type: 'example', id: 'perceptron-xor' },
        { type: 'p', text: '同樣的學習規則套在 XOR 上，從第 3 輪起每輪 4 個樣本全錯一次，而且從第 2 輪起每一輪結束時權重都回到 `(-1, 0, 1)`，永遠在繞圈。在 -3 到 3 的整數範圍窮舉 7×7×7 = 343 組權重，有 10 組能表示 AND，能表示 XOR 的是 0 組（窮舉只是示意，上面的推導才是證明）。最後一行說明問題不在「神經網路表示不了 XOR」：兩層的網路用 OR 與 NAND 兩個隱藏單元，再取 AND，就能算出 XOR。真正的難題是隱藏層的權重該怎麼學。' },
        { type: 'p', text: '答案是反向傳播（backpropagation）：把階梯函數換成可微分的函數（例如 sigmoid），用連鎖律從輸出層往回算出每個權重對誤差的影響，再用梯度下降調整。類似的想法在 1970 年代已經有人提出，1986 年 Rumelhart、Hinton 與 Williams 在 Nature 發表的論文讓它廣為人知，多層網路從此可以訓練。這段數學會在深度學習島（DL 島）完整推導。' },
        { type: 'callout', tone: 'warning', title: '「感知器學不會 XOR，所以神經網路沒有用」', text: 'Minsky 與 Papert 證明的是單層感知器的限制；範例最後一行就是一個能算 XOR 的兩層網路。1970 年代神經網路研究經費減少，部分原因是很多人把單層的限制誤讀成整個方向的死刑，再加上當時沒有訓練多層網路的實用方法。1986 年反向傳播普及後，連結主義重新回到主流，最終發展成今天的深度學習。' },
      ],
    },
    {
      id: 'statistical-deep', title: '統計學習與深度學習：運算力、資料、演算法一起到位',
      blocks: [
        { type: 'p', text: '1990 年代起，主流轉向統計學習（statistical learning）：不靠人寫規則，而是用機率、統計與最佳化從資料估計模型，並在沒看過的測試資料上量化效果。代表包括 Judea Pearl 在 1988 年的著作中系統化的貝氏網路（AIF15）、1995 年 Cortes 與 Vapnik 的支援向量機（SVM），以及垃圾郵件過濾這類實際應用。同一時期，符號式的搜尋也沒有消失：1997 年 IBM 的 Deep Blue 靠專用硬體與大規模搜尋擊敗西洋棋世界冠軍 Kasparov。' },
        { type: 'table', head: ['路線', '核心想法', '知識從哪裡來', '擅長', '弱點', '代表'], rows: [
          ['符號主義', '智慧是用規則操作符號', '人寫的規則、邏輯與搜尋', '可解釋、能證明、資料很少也能用', '規則寫不完、脆弱，難處理感知與不確定', 'Logic Theorist、MYCIN、XCON、Deep Blue'],
          ['統計學習', '從資料估計機率模型或決策邊界', '資料，加上人設計的特徵', '有理論保證、能量化不確定', '依賴人工特徵，影像與語音的特徵很難設計', '貝氏網路、SVM、垃圾郵件過濾'],
          ['連結主義', '大量簡單單元與權重，從資料學出表示', '大量資料，特徵也自動學出', '影像、語音、語言等感知問題', '需要大量資料與運算，內部難以解釋', '感知器、反向傳播、AlexNet、Transformer'],
        ] },
        { type: 'p', text: '深度學習（deep learning）是多層神經網路的連結主義，它在 2012 年爆發。2009 年發表的 ImageNet 資料集後來擴充到一千多萬張標註影像；從 2010 年起舉辦的影像辨識競賽（ILSVRC）使用其中 1000 個類別、約 120 萬張訓練影像。2012 年 Krizhevsky、Sutskever 與 Hinton 的 AlexNet 用兩張 GPU 訓練深層卷積網路，top-5 錯誤率約 15.3%，第二名約 26.2%，差距大到整個電腦視覺領域在幾年內轉向深度學習。' },
        { type: 'table', head: ['推動力', '1950–1970 年代', '1980 年代', '2012 年前後'], rows: [
          ['運算力', '早期大型主機，運算與記憶體非常有限', '工作站、Lisp 機器', 'GPU 平行計算大量矩陣乘法'],
          ['資料', '幾乎沒有數位化資料', '由專家口述、人工輸入規則', '網際網路與 ImageNet 這類大型標註資料集'],
          ['演算法', '搜尋、邏輯、單層感知器', '規則推論；1986 年反向傳播', '深層卷積網路、ReLU、dropout 等訓練技巧'],
        ] },
        { type: 'p', text: '三者缺一不可：反向傳播 1986 年就普及了，但當時的資料與運算只撐得起小網路；只有 GPU 沒有 ImageNet，深層網路會過度擬合；只有資料沒有好的訓練技巧，深層網路又訓練不起來。AlexNet 的意義在於三者第一次同時到位。2016 年 AlphaGo 以 4 比 1 擊敗李世乭，結合了深度神經網路與蒙地卡羅樹搜尋（Monte Carlo tree search），是連結主義與搜尋合作的例子。' },
      ],
    },
    {
      id: 'foundation-models', title: 'Transformer 與基礎模型（2017 年起）',
      blocks: [
        { type: 'p', text: '2017 年 Vaswani 等人發表〈Attention Is All You Need〉，提出 Transformer：用自注意力（self-attention）讓序列中每個位置直接參考其他所有位置，取代逐字處理的循環網路，因此能在 GPU 上大量平行訓練。之後的模型越做越大：2018 年的 BERT、2020 年有 1750 億個參數的 GPT-3。這些模型先用大量未標註的文字做預訓練，再調整到各種任務上。' },
        { type: 'p', text: '2021 年 Stanford 的研究者在〈On the Opportunities and Risks of Foundation Models〉中提出基礎模型（foundation model）一詞：在大規模、廣泛的資料上訓練，之後能被調整或直接用在許多下游任務的模型。這改變了做 AI 的方式：以前一個任務訓練一個模型；現在先有一個基礎模型，再用微調、提示或檢索把它接到任務上。2022 年 11 月 ChatGPT 公開，讓一般大眾直接接觸到這類模型。' },
        { type: 'table', head: ['年份', '事件', '推動力'], rows: [
          ['2017', 'Transformer', '演算法：可平行化的注意力機制'],
          ['2018', 'BERT', '演算法與資料：在大量文字上預訓練，再微調到各任務'],
          ['2020', 'GPT-3', '運算力與資料：模型與資料規模大幅擴大'],
          ['2021', '「基礎模型」一詞提出', '觀念：一個模型服務許多任務'],
          ['2022', 'ChatGPT 公開', '應用：以對話介面讓大眾使用'],
        ] },
        { type: 'callout', tone: 'warning', title: '「深度學習已經取代了其他所有方法」', text: '路線之間是累積，不是替換。AlphaGo 把神經網路和樹搜尋結合；導航的最短路徑、排程、編譯器、硬體驗證仍然依賴搜尋、限制滿足與邏輯求解器；醫療與金融需要可解釋、可量化不確定的機率模型；LLM 為基礎的 Agent 也要呼叫工具、做規劃與搜尋。所以本島要先學搜尋、邏輯與機率，它們沒有過時。' },
      ],
    },
    {
      id: 'timeline', title: '畫出時間軸：每個時期為什麼興起、為什麼衰退',
      blocks: [
        { type: 'p', text: '把事件放進時期，是用程式整理歷史的基本動作。下面的程式先把事件依年份排序，再用 `bisect_right` 找出每個年份所屬的時期：它回傳「第一個大於 year 的起始年」的位置，減 1 就是最後一個「起始年小於等於 year」的時期，所以邊界年 1987 會落在 second-winter 而不是 expert-systems。`groupby` 只合併相鄰而且鍵相同的元素，資料必須先排序。' },
        { type: 'example', id: 'timeline-eras' },
        { type: 'p', text: '注意輸出沒有 first-winter：`groupby` 只產生實際出現的群組，沒有事件的時期就不會印出。本課練習要求每個時期都要印出（包括 0 筆），所以要改成「逐一走訪時期、各自篩選事件」。另外 `sorted(EVENTS)` 是整個 tuple 的排序，同年時先比類型再比名稱；練習要求同年依名稱排序，要自己指定排序鍵。' },
        { type: 'table', head: ['時期（本課的劃分）', '年份', '興起的原因', '衰退或轉向的原因'], rows: [
          ['birth-of-ai', '1950–1973', '電腦出現、達特茅斯會議、政府資助，小世界的程式表現亮眼', '組合爆炸、缺乏常識；ALPAC（1966）、《Perceptrons》（1969）、Lighthill 報告（1973）'],
          ['first-winter', '1974–1979', '（經費削減期）研究轉向特定領域的知識', '專家系統的商業成功帶來復甦'],
          ['expert-systems', '1980–1986', 'XCON 等商業成功、第五代電腦計畫、Lisp 機器', '知識擷取瓶頸、脆弱、規則維護成本'],
          ['second-winter', '1987–1993', '（經費削減期）反向傳播與卷積網路仍在研究中', 'Lisp 機器市場在 1987 年崩盤，專家系統的期待落空'],
          ['statistical-learning', '1994–2011', '數位資料增加；SVM、機率模型有理論也有實證', '依賴人工設計的特徵，影像與語音遇到瓶頸'],
          ['deep-learning', '2012–2016', 'GPU、ImageNet、深層網路的訓練技巧；AlexNet（2012）', '轉向更大的模型與 Transformer'],
          ['foundation-models', '2017–', 'Transformer 可平行化、網路規模的資料、大規模預訓練', '進行中：成本、幻覺、安全與評估是目前的挑戰'],
        ] },
        { type: 'p', text: '每一輪都有相同的節奏：一個突破在小問題上成功，承諾跑在能力前面，經費湧入，規模變大後限制浮現，經費撤出。每次復甦都來自運算力、資料與演算法的新組合，而不是單一個點子。下表把後續各島放回這條脈絡：' },
        { type: 'table', head: ['島', '主要承接的路線', '會學到'], rows: [
          ['AI 基礎島（本島）', '符號主義與機率推論', '搜尋與賽局（AIF04–AIF09）、知識表示與邏輯（AIF10–AIF12）、機率與貝氏網路（AIF13–AIF15）、決策與 MDP'],
          ['機器學習島（ML）', '統計學習', '從資料訓練與評估模型、特徵處理、可解釋性'],
          ['深度學習島（DL）', '連結主義', '神經元、反向傳播、CNN、RNN、注意力與 Transformer'],
          ['大型語言模型島（LLM）', '基礎模型', '預訓練、對齊、微調、提示與 RAG'],
          ['生成式 AI 島、AI 代理島', '基礎模型的應用', '影像與語音生成；Agent 結合 LLM、工具與規劃'],
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'expert-system', title: '前向鏈結的小型專家系統',
      description: '知識庫是五條規則，推論引擎一輪一輪套用規則直到沒有新事實；印出每條規則在第幾輪觸發，以及排序後的推論結果。',
      output: "case A fired 1:R3 2:R2 3:R1\n  derived: carnivore, mammal, tiger\ncase B fired 1:R5 2:R4\n  derived: bird, penguin\ncase C fired -\n  derived: (no conclusion)",
      code: { Python: code`# 知識庫：每條規則是「條件都成立 → 加入結論」
RULES = [
    ("R1", {"carnivore", "has_stripes"}, "tiger"),
    ("R2", {"mammal", "eats_meat"}, "carnivore"),
    ("R3", {"has_fur"}, "mammal"),
    ("R4", {"bird", "cannot_fly", "swims"}, "penguin"),
    ("R5", {"has_feathers"}, "bird"),
]

def forward_chain(given):
    """推論引擎：一輪一輪掃描規則，直到某一輪沒有新事實。"""
    facts = set(given)
    fired = []
    rounds = 0
    changed = True
    while changed:
        changed = False
        rounds += 1
        for name, needs, conclusion in RULES:
            if needs <= facts and conclusion not in facts:
                facts.add(conclusion)
                fired.append(f"{rounds}:{name}")
                changed = True
    return facts, fired

CASES = [
    ("case A", {"has_fur", "eats_meat", "has_stripes"}),
    ("case B", {"swims", "has_feathers", "cannot_fly"}),
    ("case C", {"has_scales", "swims"}),
]
for label, given in CASES:
    facts, fired = forward_chain(given)
    derived = sorted(facts - given)  # set 的順序不固定，印出前先排序
    print(label, "fired", " ".join(fired) or "-")
    print("  derived:", ", ".join(derived) or "(no conclusion)")` },
    },
    {
      id: 'perceptron-and', title: '整數感知器學會 AND',
      description: '權重與偏差從 0 開始、學習率 1，逐輪印出權重與錯誤數，第 6 輪收斂。',
      output: "epoch 1: w=[1, 1] b=1 mistakes=1\nepoch 2: w=[2, 1] b=0 mistakes=3\nepoch 3: w=[2, 1] b=-1 mistakes=3\nepoch 4: w=[2, 2] b=-1 mistakes=2\nepoch 5: w=[2, 1] b=-2 mistakes=1\nepoch 6: w=[2, 1] b=-2 mistakes=0\nconverged: True\n(0, 0) -> 0 target 0\n(0, 1) -> 0 target 0\n(1, 0) -> 0 target 0\n(1, 1) -> 1 target 1",
      code: { Python: code`def predict(w, b, x):
    """階梯函數：加權和大於 0 輸出 1，否則輸出 0。"""
    return 1 if w[0] * x[0] + w[1] * x[1] + b > 0 else 0

def train(data, max_epochs):
    w, b = [0, 0], 0  # 固定的初始值：全部是 0
    for epoch in range(1, max_epochs + 1):
        mistakes = 0
        for x, target in data:
            error = target - predict(w, b, x)  # 只可能是 -1、0、1
            if error != 0:  # 感知器學習規則：錯了才調整
                w = [w[0] + error * x[0], w[1] + error * x[1]]
                b += error
                mistakes += 1
        print(f"epoch {epoch}: w={w} b={b} mistakes={mistakes}")
        if mistakes == 0:
            return w, b, True
    return w, b, False

AND = [((0, 0), 0), ((0, 1), 0), ((1, 0), 0), ((1, 1), 1)]
w, b, converged = train(AND, 10)
print("converged:", converged)
for x, target in AND:
    print(x, "->", predict(w, b, x), "target", target)` },
    },
    {
      id: 'perceptron-xor', title: '同一個規則學不會 XOR，兩層網路卻算得出來',
      description: '感知器在 XOR 上永遠有錯；窮舉小範圍的整數權重，沒有任何一組能表示 XOR；手動設定權重的兩層網路則能算出 XOR。',
      output: "XOR mistakes per epoch: [2, 3, 4, 4, 4, 4, 4, 4]\nfinal (w1, w2, b): (-1, 0, 1)\nAND fits in -3..3: 10\nXOR fits in -3..3: 0\ntwo-layer XOR: [0, 1, 1, 0]",
      code: { Python: code`from itertools import product

def predict(w1, w2, b, x1, x2):
    return 1 if w1 * x1 + w2 * x2 + b > 0 else 0

def train(data, epochs):
    w1 = w2 = b = 0
    history = []
    for _ in range(epochs):
        mistakes = 0
        for (x1, x2), target in data:
            error = target - predict(w1, w2, b, x1, x2)
            if error != 0:
                w1, w2, b = w1 + error * x1, w2 + error * x2, b + error
                mistakes += 1
        history.append(mistakes)
    return history, (w1, w2, b)

def fitting_weights(data, r):
    """窮舉 -r..r 的整數權重與偏差，數有幾組能把四個點全部分對。"""
    return sum(all(predict(w1, w2, b, x1, x2) == t for (x1, x2), t in data)
               for w1, w2, b in product(range(-r, r + 1), repeat=3))

def two_layer(x1, x2):
    """手動設定權重的兩層網路：XOR = AND(OR, NAND)。"""
    h_or = predict(1, 1, 0, x1, x2)
    h_nand = predict(-1, -1, 2, x1, x2)
    return predict(1, 1, -1, h_or, h_nand)

AND = [((0, 0), 0), ((0, 1), 0), ((1, 0), 0), ((1, 1), 1)]
XOR = [((0, 0), 0), ((0, 1), 1), ((1, 0), 1), ((1, 1), 0)]
history, weights = train(XOR, 8)
print("XOR mistakes per epoch:", history)
print("final (w1, w2, b):", weights)
print("AND fits in -3..3:", fitting_weights(AND, 3))
print("XOR fits in -3..3:", fitting_weights(XOR, 3))
print("two-layer XOR:", [two_layer(x1, x2) for (x1, x2), _ in XOR])` },
    },
    {
      id: 'timeline-eras', title: '事件依年份排序並依時期分組',
      description: '用 bisect_right 把年份對應到時期，排序後以 groupby 分組；沒有事件的時期不會出現。',
      output: "birth-of-ai: 4\n  1956 event   Dartmouth workshop\n  1958 system  Perceptron\n  1969 paper   Perceptrons\n  1973 event   Lighthill report\nexpert-systems: 2\n  1980 system  XCON\n  1986 paper   Backpropagation\nsecond-winter: 1\n  1987 event   Lisp machine market collapse\nstatistical-learning: 2\n  1997 event   Deep Blue beats Kasparov\n  2009 dataset ImageNet\ndeep-learning: 2\n  2012 model   AlexNet\n  2016 event   AlphaGo beats Lee Sedol\nfoundation-models: 2\n  2017 paper   Transformer\n  2022 system  ChatGPT",
      code: { Python: code`from bisect import bisect_right
from itertools import groupby

# (起始年, 時期)：每個時期到下一個時期起始年的前一年為止
ERAS = [
    (1950, "birth-of-ai"), (1974, "first-winter"), (1980, "expert-systems"),
    (1987, "second-winter"), (1994, "statistical-learning"),
    (2012, "deep-learning"), (2017, "foundation-models"),
]
STARTS = [start for start, _ in ERAS]
EVENTS = [
    (2017, "paper", "Transformer"), (1956, "event", "Dartmouth workshop"),
    (1986, "paper", "Backpropagation"), (1958, "system", "Perceptron"),
    (2012, "model", "AlexNet"), (1969, "paper", "Perceptrons"),
    (1980, "system", "XCON"), (1973, "event", "Lighthill report"),
    (1997, "event", "Deep Blue beats Kasparov"), (2009, "dataset", "ImageNet"),
    (1987, "event", "Lisp machine market collapse"),
    (2016, "event", "AlphaGo beats Lee Sedol"), (2022, "system", "ChatGPT"),
]

def era_of(year):
    """bisect_right 找出最後一個「起始年 <= year」的時期。"""
    return ERAS[bisect_right(STARTS, year) - 1][1]

timeline = sorted(EVENTS)  # tuple 依序比較：先年份，同年再比類型、名稱
for era, group in groupby(timeline, key=lambda event: era_of(event[0])):
    members = list(group)
    print(f"{era}: {len(members)}")
    for year, kind, name in members:
        print(f"  {year} {kind:<7} {name}")` },
    },
  ],
  quiz: [
    {
      id: 'q1', prompt: '關於 1956 年的達特茅斯會議，哪一個敘述正確？',
      options: [
        '會議發表了第一個能從資料學習的感知器，開啟了連結主義',
        '會議展示了專家系統 MYCIN，證明規則式 AI 可以用在醫療',
        '「人工智慧」一詞出自 McCarthy 等人為這次會議寫的提案，會議讓 AI 成為一個研究領域',
        '會議的結論是機器智慧無法實現，因此直接引發第一次 AI 寒冬',
      ],
      answer: 2,
      explanation: '1955 年 McCarthy、Minsky、Rochester 與 Shannon 的會議提案使用了 artificial intelligence 一詞，1956 年的會議通常被視為 AI 領域的起點。感知器是 Rosenblatt 在 1958 年提出的，不是在這次會議；MYCIN 是 1970 年代 Stanford 的系統；會議的氣氛是樂觀的，第一次寒冬要到 1970 年代中期，起因是承諾沒有兌現與 Lighthill 報告等經費削減。',
    },
    {
      id: 'q2', prompt: '依本課的感知器學習規則，下面的程式輸出什麼？',
      code: { language: 'Python', text: 'w, b = [0, 0], 0\nx, target = (1, 1), 1\npred = 1 if w[0] * x[0] + w[1] * x[1] + b > 0 else 0\nerror = target - pred\nw = [w[0] + error * x[0], w[1] + error * x[1]]\nb += error\nprint(w, b)' },
      options: ['[1, 1] 1', '[0, 0] 0', '[1, 1] 0', '[-1, -1] -1'],
      answer: 0,
      explanation: '加權和是 0，`0 > 0` 不成立，所以 pred 是 0、error 是 1，兩個權重各加 1×1、偏差加 1，得到 `[1, 1] 1`。`[0, 0] 0` 是把條件誤當成 `>= 0`、以為已經答對；`[1, 1] 0` 忘了更新偏差；`[-1, -1] -1` 把誤差算成 pred - target，方向相反。',
    },
    {
      id: 'q3', prompt: '單層感知器無論訓練多久都學不會 XOR，根本原因是什麼？',
      options: [
        '訓練輪數不夠，把 epoch 加到 1000 就會收斂',
        '學習率 1 太大，改成 0.1 就能收斂',
        'XOR 只有四個樣本，資料太少',
        'XOR 的兩類點無法用一條直線分開，而單層感知器的決策邊界只能是一條直線',
      ],
      answer: 3,
      explanation: '單層感知器的輸出由 `w1*x1 + w2*x2 + b > 0` 決定，邊界是一條直線，而 XOR 線性不可分，要分對所需的四個不等式互相矛盾，所以根本不存在能分對的權重。加再多輪只會像範例一樣繞圈；縮小學習率只是把所有權重等比例縮放，邊界形狀不變；AND 同樣只有四個樣本卻能學會，可見問題不是資料量。',
    },
    {
      id: 'q4', prompt: '下面的前向鏈結程式輸出什麼？',
      code: { language: 'Python', text: 'rules = [({"b"}, "c"), ({"a"}, "b"), ({"c", "d"}, "e")]\nfacts = {"a"}\nchanged = True\nwhile changed:\n    changed = False\n    for needs, conclusion in rules:\n        if needs <= facts and conclusion not in facts:\n            facts.add(conclusion)\n            changed = True\nprint(sorted(facts))' },
      options: ["['a', 'b']", "['a', 'b', 'c']", "['a', 'b', 'c', 'e']", "['a']"],
      answer: 1,
      explanation: '第一輪：規則 1 需要 b，還沒有；規則 2 由 a 得到 b；規則 3 需要 c 與 d，不成立。因為有新事實，再掃第二輪：規則 1 由 b 得到 c。第三輪沒有新事實，停止，結果是 a、b、c。只掃一輪會停在 `[a, b]`；e 需要 d，而 d 從來不在事實中，所以不會出現 e；`[a]` 則是完全沒有套用規則。',
    },
    {
      id: 'q5', prompt: '下列哪一項是 1980 年代末到 1990 年代初第二次 AI 寒冬的主要原因？',
      options: [
        'Minsky 與 Papert 證明了多層神經網路不可能被訓練',
        '反向傳播在 1986 年被發現有錯，神經網路研究全面停止',
        '專家系統的知識難以取得與維護、遇到規則外的情況就失效，加上 Lisp 機器的市場在 1987 年崩盤',
        'Transformer 需要的運算量太大，企業負擔不起',
      ],
      answer: 2,
      explanation: '第二次寒冬是專家系統熱潮的退潮：知識擷取瓶頸、脆弱、維護成本，加上專用 Lisp 機器被便宜的通用電腦取代。Minsky 與 Papert 在 1969 年分析的是單層感知器，而且多層網路後來正是用反向傳播訓練的；反向傳播在 1986 年是被推廣，不是被推翻，1989 年還有卷積網路的成果；Transformer 是 2017 年才出現的，時間對不上。',
    },
    {
      id: 'q6', prompt: '2012 年 AlexNet 在 ImageNet 競賽大幅領先，通常歸功於哪些條件同時到位？',
      options: [
        '全新發明的反向傳播演算法，在那之前沒有任何方法能訓練多層網路',
        'GPU 的運算力、ImageNet 的大量標註影像，以及深層卷積網路與 ReLU、dropout 等訓練技巧',
        'Transformer 的注意力機制讓模型一次看到整張影像',
        '把影像辨識的規則交給專家逐條寫成知識庫',
      ],
      answer: 1,
      explanation: 'AlexNet 用兩張 GPU 在 ImageNet 上訓練深層卷積網路，運算力、資料與演算法三者同時到位。反向傳播在 1986 年就已普及，不是 2012 年才發明；Transformer 是 2017 年的模型，比 AlexNet 晚；人工寫規則是符號主義的做法，正是深度學習在影像上取代的方式。',
    },
    {
      id: 'q7', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: 'from bisect import bisect_right\nstarts = [1950, 1974, 1980, 1987, 1994, 2012, 2017]\nnames = ["birth", "winter1", "expert", "winter2", "stat", "deep", "found"]\nfor year in [1973, 1987, 2016]:\n    print(names[bisect_right(starts, year) - 1], end=" ")' },
      options: ['birth winter2 deep', 'birth expert deep', 'winter1 stat found'],
      answer: 0,
      explanation: '`bisect_right` 回傳第一個大於 year 的位置：1973 得 1、1987 得 4（等於 1987 的元素會排在它左邊）、2016 得 6，各減 1 是 birth、winter2、deep。`birth expert deep` 是改用 `bisect_left` 的結果，邊界年 1987 會被放進前一個時期；`winter1 stat found` 是忘了減 1，每個年份都被放進下一個時期。',
    },
    {
      id: 'q8', prompt: '系統甲由工程師把「如果…就…」規則寫成知識庫，推論過程可以逐條列出；系統乙從大量標註資料調整數百萬個權重。它們分別最接近哪兩條路線？',
      options: [
        '兩者都是連結主義，因為都在電腦上執行運算',
        '甲是連結主義，乙是符號主義',
        '甲是統計學習，乙是專家系統',
        '甲是符號主義，乙是連結主義',
      ],
      answer: 3,
      explanation: '甲的知識是人寫的符號規則，推論可以解釋，是符號主義（專家系統就是其中一種）；乙的知識存在從資料學出的權重裡，是連結主義（神經網路）。「都在電腦上執行」不是區分路線的標準；第二個選項把兩者對調了；統計學習從資料估計模型而不是由人寫規則，專家系統也不是從資料調整權重，所以第三個選項兩邊都錯。',
    },
  ],
  exercises: [
    {
      id: 'x1', title: '把 AI 事件整理成時期時間軸',
      statement: '讀入多行 AI 歷史事件，每行格式為 `year|type|name`，依下列時期（年份都包含兩端）分組後印出時間軸，並回報格式錯誤的行。時期依序為：`birth-of-ai` 1950–1973、`first-winter` 1974–1979、`expert-systems` 1980–1986、`second-winter` 1987–1993、`statistical-learning` 1994–2011、`deep-learning` 2012–2016、`foundation-models` 2017–2029。合法的 type 只有 `event`、`paper`、`system`、`dataset`、`model`（區分大小寫）。每一行先以 `|` 切開，三個欄位各自去掉前後空白，再依序檢查：欄位數不是 3 為 `expected year|type|name`；年份不是剛好 4 個 ASCII 數字為 `bad year`；年份不在 1950–2029 為 `year out of range`；type 不合法為 `unknown type`；名稱是空的為 `empty name`；年份與名稱都和前面某個合法行相同（不看 type）為 `duplicate event`。每行只回報第一個錯誤，錯誤的行不列入時間軸；只含空白的行略過，但仍然佔一個行號。',
      inputFormat: '零或多行，每行一筆事件 `year|type|name`；行號從 1 開始，包含空白行。',
      outputFormat: '依時期順序，每個時期先印一行 `<時期> <起始年>-<結束年>: <事件數>`（事件數為 0 也要印），接著每個事件一行：兩個空白、年份、type、名稱，以一個空白分隔，依年份、再依名稱（Python 字串的預設比較）排序。所有時期印完後，依行號順序每個錯誤一行 `line <行號>: <原因>`。',
      constraints: ['最多 200 行，每行最多 100 個字元', '名稱可以包含空白，但不包含 `|`', '名稱與 type 都區分大小寫：`AlexNet` 與 `alexnet` 是不同的名稱'],
      samples: [
        { kind: 'normal', input: "1956|event|Dartmouth workshop\n1958|system|Perceptron\n1980|system|XCON\n1986|paper|Backpropagation\n2012|model|AlexNet\n2017|paper|Transformer\n", output: "birth-of-ai 1950-1973: 2\n  1956 event Dartmouth workshop\n  1958 system Perceptron\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 2\n  1980 system XCON\n  1986 paper Backpropagation\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 1\n  2012 model AlexNet\nfoundation-models 2017-2029: 1\n  2017 paper Transformer", note: '六個代表事件，七個時期都印出，沒有事件的時期是 0' },
        { kind: 'error', input: "2012|model|AlexNet\n1956|event|Dartmouth workshop\n19x6|event|Logic Theorist\n1966|report|ALPAC report\n2012|event|AlexNet\n", output: "birth-of-ai 1950-1973: 1\n  1956 event Dartmouth workshop\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 1\n  2012 model AlexNet\nfoundation-models 2017-2029: 0\nline 3: bad year\nline 4: unknown type\nline 5: duplicate event", note: '格式錯誤的行回報行號，其他行照常分組；同年同名、type 不同仍算重複' },
      ],
      tests: [
        { kind: 'normal', input: "1956|event|Dartmouth workshop\n1958|system|Perceptron\n1980|system|XCON\n1986|paper|Backpropagation\n2012|model|AlexNet\n2017|paper|Transformer\n", output: "birth-of-ai 1950-1973: 2\n  1956 event Dartmouth workshop\n  1958 system Perceptron\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 2\n  1980 system XCON\n  1986 paper Backpropagation\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 1\n  2012 model AlexNet\nfoundation-models 2017-2029: 1\n  2017 paper Transformer", note: '六個代表事件，七個時期都印出，沒有事件的時期是 0' },
        { kind: 'error', input: "2012|model|AlexNet\n1956|event|Dartmouth workshop\n19x6|event|Logic Theorist\n1966|report|ALPAC report\n2012|event|AlexNet\n", output: "birth-of-ai 1950-1973: 1\n  1956 event Dartmouth workshop\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 1\n  2012 model AlexNet\nfoundation-models 2017-2029: 0\nline 3: bad year\nline 4: unknown type\nline 5: duplicate event", note: '格式錯誤的行回報行號，其他行照常分組；同年同名、type 不同仍算重複' },
        { kind: 'normal', input: "2017|paper|Transformer\n1997|event|Deep Blue beats Kasparov\n2012|model|AlexNet\n2009|dataset|ImageNet\n1969|paper|Perceptrons\n1973|event|Lighthill report\n2012|event|ILSVRC 2012\n1987|event|Lisp machine market collapse\n1995|paper|Support-vector networks\n2016|event|AlphaGo beats Lee Sedol\n", output: "birth-of-ai 1950-1973: 2\n  1969 paper Perceptrons\n  1973 event Lighthill report\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 1\n  1987 event Lisp machine market collapse\nstatistical-learning 1994-2011: 3\n  1995 paper Support-vector networks\n  1997 event Deep Blue beats Kasparov\n  2009 dataset ImageNet\ndeep-learning 2012-2016: 3\n  2012 model AlexNet\n  2012 event ILSVRC 2012\n  2016 event AlphaGo beats Lee Sedol\nfoundation-models 2017-2029: 1\n  2017 paper Transformer", note: '輸入沒有依年份排列；同年的 AlexNet 與 ILSVRC 2012 依名稱排序，不是依 type' },
        { kind: 'normal', input: "1980|system|XCON\n1965|system|DENDRAL\n1982|event|Fifth Generation project\n1986|paper|Backpropagation\n1989|paper|Convolutional net for zip codes\n2018|model|BERT\n2020|model|GPT-3\n2021|paper|Foundation models\n2022|system|ChatGPT\n", output: "birth-of-ai 1950-1973: 1\n  1965 system DENDRAL\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 3\n  1980 system XCON\n  1982 event Fifth Generation project\n  1986 paper Backpropagation\nsecond-winter 1987-1993: 1\n  1989 paper Convolutional net for zip codes\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 4\n  2018 model BERT\n  2020 model GPT-3\n  2021 paper Foundation models\n  2022 system ChatGPT", note: '專家系統、第二次寒冬與基礎模型時期的事件；1989 年的研究落在寒冬期間' },
        { kind: 'edge', input: "", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0", note: '沒有任何輸入：七個時期都印出 0' },
        { kind: 'edge', input: "2029|event|edge-2029\n1950|paper|Computing Machinery and Intelligence\n1973|event|Lighthill report\n1974|event|edge-1974\n1979|event|edge-1979\n1980|system|XCON\n1986|paper|Backpropagation\n1987|event|Lisp machine market collapse\n1993|event|edge-1993\n1994|event|edge-1994\n2011|system|Watson wins Jeopardy\n2012|model|AlexNet\n2016|event|AlphaGo beats Lee Sedol\n2017|paper|Transformer\n", output: "birth-of-ai 1950-1973: 2\n  1950 paper Computing Machinery and Intelligence\n  1973 event Lighthill report\nfirst-winter 1974-1979: 2\n  1974 event edge-1974\n  1979 event edge-1979\nexpert-systems 1980-1986: 2\n  1980 system XCON\n  1986 paper Backpropagation\nsecond-winter 1987-1993: 2\n  1987 event Lisp machine market collapse\n  1993 event edge-1993\nstatistical-learning 1994-2011: 2\n  1994 event edge-1994\n  2011 system Watson wins Jeopardy\ndeep-learning 2012-2016: 2\n  2012 model AlexNet\n  2016 event AlphaGo beats Lee Sedol\nfoundation-models 2017-2029: 2\n  2017 paper Transformer\n  2029 event edge-2029", note: '每個時期的起始年與結束年各一筆，檢查區間兩端都包含；edge-* 是人工的邊界資料' },
        { kind: 'edge', input: "  1956 | event |  Dartmouth workshop  \n\n1958|system|Perceptron\n\n\n2012|model|AlexNet\n", output: "birth-of-ai 1950-1973: 2\n  1956 event Dartmouth workshop\n  1958 system Perceptron\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 1\n  2012 model AlexNet\nfoundation-models 2017-2029: 0", note: '欄位前後的空白要去掉，名稱中間的空白保留；空白行略過但佔行號' },
        { kind: 'edge', input: "2012|model|AlexNet\n2012|event|ILSVRC 2012\n2012|paper|ImageNet classification\n2012|paper|Dropout\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 4\n  2012 model AlexNet\n  2012 paper Dropout\n  2012 event ILSVRC 2012\n  2012 paper ImageNet classification\nfoundation-models 2017-2029: 0", note: '同一年四筆事件，只依名稱排序：AlexNet、Dropout、ILSVRC 2012、ImageNet classification' },
        { kind: 'error', input: "1956|Dartmouth workshop\n1986|paper|Backpropagation|Rumelhart\n1958 system Perceptron\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 1: expected year|type|name\nline 2: expected year|type|name\nline 3: expected year|type|name", note: '欄位太少、太多，或沒有用 | 分隔' },
        { kind: 'error', input: "19x6|event|Dartmouth workshop\n-956|event|Dartmouth workshop\n56|event|Dartmouth workshop\n12345|paper|Transformer\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 1: bad year\nline 2: bad year\nline 3: bad year\nline 4: bad year", note: '年份含字母、負號、只有兩位數或五位數都不是 4 個數字' },
        { kind: 'error', input: "1943|paper|McCulloch-Pitts neuron\n2099|event|Far future\n0956|event|Dartmouth workshop\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 1: year out of range\nline 2: year out of range\nline 3: year out of range", note: '4 位數但不在 1950–2029：1943、2099，以及補零的 0956' },
        { kind: 'error', input: "1956|Event|Dartmouth workshop\n1966|report|ALPAC report\n1958|system|   \n1958||Perceptron\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 1: unknown type\nline 2: unknown type\nline 3: empty name\nline 4: unknown type", note: 'type 區分大小寫、不在清單中的 type、空白的名稱、空的 type' },
        { kind: 'error', input: "2012|model|AlexNet\n2012|event|AlexNet\n2012|model|alexnet\n1956|event|Dartmouth workshop\n1956|event|Dartmouth workshop\n", output: "birth-of-ai 1950-1973: 1\n  1956 event Dartmouth workshop\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 2\n  2012 model AlexNet\n  2012 model alexnet\nfoundation-models 2017-2029: 0\nline 2: duplicate event\nline 5: duplicate event", note: '重複只看年份與名稱且區分大小寫：alexnet 不算重複；同一行寫兩次也是重複' },
        { kind: 'error', input: "\n1956|event|Dartmouth workshop\n\n1969|book|Perceptrons\n1973|event|Lighthill report\n|event|Unknown\n1973|event|Lighthill report\n1969|paper|Perceptrons\n", output: "birth-of-ai 1950-1973: 3\n  1956 event Dartmouth workshop\n  1969 paper Perceptrons\n  1973 event Lighthill report\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 4: unknown type\nline 6: bad year\nline 7: duplicate event", note: '空白行仍計入行號；與錯誤行同名的合法行不算重複，錯誤之後的合法行照常處理' },
        { kind: 'error', input: "abc\nxyz|1|2\n", output: "birth-of-ai 1950-1973: 0\nfirst-winter 1974-1979: 0\nexpert-systems 1980-1986: 0\nsecond-winter 1987-1993: 0\nstatistical-learning 1994-2011: 0\ndeep-learning 2012-2016: 0\nfoundation-models 2017-2029: 0\nline 1: expected year|type|name\nline 2: bad year", note: '整份輸入都錯，時期全部是 0，錯誤依行號列出' },
      ],
      hints: [
        '先寫 `parse(line)`：合法時回傳 `(year, type, name)`，否則回傳錯誤原因字串；主程式只負責行號、空白行與重複檢查。',
        '年份用 `re.fullmatch(r"[0-9]{4}", text)` 檢查。`isdigit()` 太寬鬆，`"²".isdigit()` 是 True，但 `int("²")` 會丟出例外。',
        '每個時期都要印出，所以不要用 `groupby`；改成逐一走訪時期，篩選年份在區間內的事件，再用 `key=lambda e: (e[0], e[2])` 排序，否則同年會先比 type。',
        '重複只和之前的合法行比較：用一個 set 存 `(year, name)`，錯誤的行不要放進去。',
      ],
      solution: { Python: code`import re
import sys

# 題目規定的時期：名稱、起始年、結束年（都包含）
ERAS = [
    ("birth-of-ai", 1950, 1973), ("first-winter", 1974, 1979),
    ("expert-systems", 1980, 1986), ("second-winter", 1987, 1993),
    ("statistical-learning", 1994, 2011), ("deep-learning", 2012, 2016),
    ("foundation-models", 2017, 2029),
]
TYPES = {"event", "paper", "system", "dataset", "model"}

def parse(line):
    """合法時回傳 (year, type, name)，否則回傳錯誤原因（字串）。"""
    parts = [part.strip() for part in line.split("|")]
    if len(parts) != 3:
        return "expected year|type|name"
    year_text, kind, name = parts
    if not re.fullmatch(r"[0-9]{4}", year_text):
        return "bad year"
    year = int(year_text)
    if not ERAS[0][1] <= year <= ERAS[-1][2]:
        return "year out of range"
    if kind not in TYPES:
        return "unknown type"
    if not name:
        return "empty name"
    return (year, kind, name)

events, errors, seen = [], [], set()
for number, line in enumerate(sys.stdin.read().split("\n"), start=1):
    if not line.strip():
        continue  # 空白行略過，但仍然佔一個行號
    result = parse(line)
    if isinstance(result, str):
        errors.append(f"line {number}: {result}")
    elif (result[0], result[2]) in seen:
        errors.append(f"line {number}: duplicate event")
    else:
        seen.add((result[0], result[2]))
        events.append(result)

for era, start, end in ERAS:
    members = sorted((e for e in events if start <= e[0] <= end), key=lambda e: (e[0], e[2]))
    print(f"{era} {start}-{end}: {len(members)}")
    for year, kind, name in members:
        print(f"  {year} {kind} {name}")
for message in errors:
    print(message)` },
      judge: 'none',
    },
  ],
};
