import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * AIF20 AI 基礎島綜合專題 (batch AIF-5, python-code with challenge-stages). One shared scenario, a maze battle: the
 * explorer crosses a 5 × 7 maze from S to G, and every route crosses column 3, where a guard patrols. Five stages, one
 * program each: A* routes (e-astar), depth-limited alpha-beta against a guard that plays its best (e-alphabeta),
 * HMM filtering of the guard's row from noisy readings and route choice by expected utility (e-filter), the
 * cross-or-wait MDP solved by value iteration (e-mdp), and a seeded evaluation with a decision log (e-evaluate). The
 * exercise plans two routes with A* and chooses by expected utility. Every example and the reference solution run in
 * the curriculum code tests; their outputs, the exercise's expected outputs and every number quoted in the text and
 * the stages were produced by running the programs (Python standard library only, the same output under any hash seed).
 */
export const AIF20: LessonContent = {
  lessonId: 'AIF20',
  motivation: '前面十九堂課把 AI 拆成一個個工具：搜尋、對抗、邏輯、機率、決策與治理。真正的代理人不會只遇到其中一種問題：同一個遊戲角色要找路，要提防會反應的對手，要從不可靠的感測器猜出看不到的東西，要在風險和時間之間取捨，上線之後還要能被檢查、被叫停。這堂綜合專題用一個迷宮對戰情境把整座島接起來：探險者要穿過守衛巡邏的迷宮走到出口。你會為每個子問題選擇合適的模型與演算法，親手執行五個 Python 程式得到每一關的答案，再用模擬評估整個代理人的績效與風險，寫出一份說得清楚「為什麼這樣設計」的設計報告。重點不是再學新演算法，而是學會判斷什麼時候該用哪一個，以及每個模型的假設在哪裡會失效。',
  sections: [
    {
      id: 'project', title: '專題情境：迷宮對戰代理人與演算法選擇',
      blocks: [
        { type: 'p', text: '這是 AI 基礎島的綜合應用：一個 5 × 7 的迷宮，座標寫成 (列, 行)，從 0 開始。探險者從 S = (2, 0) 出發，要走到出口 G = (2, 6)；`#` 是牆，每一步只能上下左右走一格。第 3 行（每列由左數來第 4 格）是守衛的巡邏線：守衛只在 (0, 3) 到 (4, 3) 這五格上下移動。牆的位置讓每一條從 S 到 G 的路都必須穿過第 3 行，而且只能從第 0、2、4 列橫越（(1, 3) 與 (3, 3) 左右都是牆）。探險者走進守衛所在的格子，或守衛走進探險者所在的格子，就算被抓。' },
        { type: 'table', head: ['列＼行', '0', '1', '2', '3', '4', '5', '6'], rows: [
          ['0', '.', '.', '.', '.（巡邏）', '.', '.', '.'],
          ['1', '.', '#', '#', '.（巡邏）', '#', '#', '.'],
          ['2', 'S', '.', '.', '.（巡邏）', '.', '.', 'G'],
          ['3', '.', '#', '#', '.（巡邏）', '#', '#', '.'],
          ['4', '.', '.', '.', '.（巡邏）', '.', '.', '.'],
        ] },
        { type: 'p', text: '先用 AIF03 的 PEAS 描述這個代理人，再判斷環境的性質。性質決定了該用哪一類方法：完全可觀察而且確定的部分用搜尋；有一個會反應的對手就要考慮對抗搜尋；看不到守衛時要用機率推論；結果不確定、又要連續做決定時要用決策理論與 MDP。這一步就是演算法選擇，選錯模型，再好的演算法也會給出錯的答案。' },
        { type: 'table', head: ['PEAS', '本專題'], rows: [
          ['績效（Performance）', '到達出口 +30、被抓 −50、每走一步或等一回合 −1；另外評估被抓率、交給人類的比例與等待時間的尾端'],
          ['環境（Environment）', '5 × 7 迷宮、第 3 行的巡邏線、一個守衛'],
          ['致動器（Actuators）', '上、下、左、右、原地等待（W）'],
          ['感測器（Sensors）', '遠處只有雜訊的列讀數（讀對 3/5、讀成相鄰列各 1/5）；站在第 3 行旁邊時看得到守衛'],
        ] },
        { type: 'table', head: ['子問題', '模型', '演算法', '用到的課', '本課程式'], rows: [
          ['有哪幾條路、各多長', '狀態空間搜尋，成本 = 步數', 'A* 與曼哈頓距離', 'AIF04、AIF05', 'e-astar'],
          ['守衛若是最佳對手，何時能穿越', '兩人零和遊戲', '深度限制 minimax、alpha-beta、評估函數', 'AIF07、AIF08', 'e-alphabeta'],
          ['看不到守衛時，它在哪一列', '隱馬可夫模型', '前向演算法（濾波）與多步預測', 'AIF13、AIF14、AIF16', 'e-filter'],
          ['走哪條路', '決策理論', '最大期望效用', 'AIF17', 'e-filter'],
          ['到了巡邏線：穿越還是等待', 'MDP', '價值迭代', 'AIF18', 'e-mdp'],
          ['整體好不好、能不能上線', '績效評估與治理', '固定種子模擬、決策紀錄、人類監督', 'AIF19', 'e-evaluate'],
        ] },
        { type: 'p', text: '最後交出的成果有三件：五個關卡各自的程式與答案（本課的五個範例）、一個把「規劃」與「期望效用」接在一起的選路程式（本課的練習），以及一份設計報告，寫出每個模型的假設、績效數據、風險與監督機制。下方的「關卡」視覺化列出每一關的目標與用到的課。' },
        { type: 'callout', tone: 'tip', title: '一關一關做，每一關都有可以比對的輸出', text: '不要一開始就寫一個「什麼都會」的代理人。先讓 A* 印出三條路的長度，再讓 alpha-beta 對兩個固定局面印出每個動作的值，再讓濾波器印出每一步的信念分布。每一關的輸出都可以手算或用另一種方法驗證；全部接起來之後出錯，才知道是哪一關的問題。' },
      ],
    },
    {
      id: 'stage-search', title: '第一關：問題形式化與 A* 路線規劃',
      blocks: [
        { type: 'p', text: '先忽略守衛，把找路寫成 AIF04 的搜尋問題：狀態是探險者的格子 (r, c)；動作是上下左右；轉移模型是「目標格不是牆、沒出界就移過去」；目標測試是「在 G」；路徑成本是步數。要比較三種穿越方式，就把其他兩個穿越點當成牆，各做一次 A*。' },
        { type: 'p', text: '啟發函數用曼哈頓距離 h = |r − r_G| + |c − c_G|。走一步最多讓 h 減少 1，而每一步成本是 1，所以 h(n) ≤ c(n, n\') + h(n\')，它是一致的，因此也可接受（AIF05）：A* 回傳的一定是最短路。open 依 (f, h, counter) 排序，鄰居順序是上、下、左、右，所以展開數完全確定。' },
        { type: 'example', id: 'e-astar' },
        { type: 'table', head: ['穿越列', '最短步數', '路徑', 'A*（曼哈頓）展開', 'h = 0（UCS）展開'], rows: [
          ['0（上路）', '10', 'UURRRRRRDD', '13', '16'],
          ['2（走廊）', '6', 'RRRRRR', '6', '14'],
          ['4（下路）', '10', 'DDRRRRRRUU', '16', '16'],
        ] },
        { type: 'p', text: '走廊那條路，曼哈頓距離剛好等於真實距離，A* 只展開路上的 6 格。上路與下路就不同了：h 不知道 (2, 3) 被封住，一直把搜尋往走廊拉，省下的展開數很少；下路甚至和 h = 0 一樣是 16，因為同分時先放進 open 的先取出，而鄰居順序先上後下，上方的格子總是先被展開。這提醒我們：啟發函數越接近真實距離越有用，被它忽略的限制（牆、封鎖）越多，它就越不準。' },
        { type: 'callout', tone: 'warning', title: '「A* 找到的最短路，就是最好的計畫」', text: 'A* 只保證「對你給它的成本函數」最佳。這一關的成本只有步數，所以它說走廊最好；可是走廊正對著守衛最常出現的地方。第三關把被抓的風險算進期望效用之後，最好的選擇變成 10 步的下路。最佳性永遠是相對於某個目標而言：目標寫錯，最佳演算法只會更有效率地做錯事。' },
      ],
    },
    {
      id: 'stage-adversarial', title: '第二關：對抗搜尋——如果守衛是最佳對手',
      blocks: [
        { type: 'p', text: '假設守衛看得到探險者，而且每一步都選對我們最不利的走法。這就是 AIF07 的兩人零和遊戲：探險者是 MAX，守衛是 MIN，輪流移動，探險者先走。終局有兩種：被抓是 −100，到出口是 +100。完整的遊戲樹太深，所以用深度限制：搜尋 6 層（雙方各 3 步）就停，用評估函數估計局面的好壞。' },
        { type: 'p', text: '評估函數本身又是一次搜尋：用 BFS 算「不踏進守衛上下左右的格子，到出口還要幾步」，評估值 = 30 − 步數；完全走不到時步數記為 30。這是組合演算法的典型做法：對抗搜尋負責「對手會怎麼回應」，評估函數裡的路徑搜尋負責「局面離目標多遠」。再加上 AIF08 的 alpha-beta 剪枝，跳過不影響結果的分支。' },
        { type: 'example', id: 'e-alphabeta' },
        { type: 'table', head: ['局面（探險者在 (2, 2)）', 'L', 'R（穿越）', 'W', 'minimax 選擇', '拜訪節點：minimax → alpha-beta'], rows: [
          ['守衛在 (0, 3)，離穿越格 2 步', '20', '29', '20', 'R', '654 → 233'],
          ['守衛在 (1, 3)，離穿越格 1 步', '20', '−100', '20', 'L（與 W 同分，取先列出的）', '864 → 264'],
        ] },
        { type: 'p', text: '結果可以整理成一條規則：守衛離穿越格至少 2 步時才穿越。距離 2 時，探險者踏進 (2, 3)，守衛只能走到 (1, 3)，下一步探險者就離開巡邏線，守衛不能追出第 3 行；距離 1 時，守衛下一步就走進 (2, 3)。alpha-beta 讓拜訪的節點少了六成以上，但每個動作的值和選擇都不變：剪掉的只是不可能改變結果的分支。' },
        { type: 'p', text: '這個模型也暴露了自己的悲觀：第 3 行把地圖切成兩半，一個看得到你、又永遠選最佳回應的守衛，可以一直擋在你要穿越的那一列前面。minimax 給的是「最壞情況下的保證」。真正的守衛如果只是照固定機率巡邏，這個保證就太保守了，接下來兩關改用機率模型。' },
        { type: 'callout', tone: 'note', title: '對手模型決定演算法', text: '同一個守衛，可以被當成最佳對手（minimax）、照機率行動的環境（馬可夫鏈）、或兩者的混合（AIF08 的 expectiminimax 把機率節點放進遊戲樹）。選哪一個不是看哪個演算法比較厲害，而是看對手實際上怎麼行動：照最壞情況設計比較安全，但可能因為過度保守而讓系統幾乎不能用。' },
      ],
    },
    {
      id: 'stage-belief', title: '第三關：機率推論——從雜訊讀數估計守衛的位置',
      blocks: [
        { type: 'p', text: '在起點時，探險者看不到守衛，只有一個會讀錯的感測器。這是部分可觀察的環境，用 AIF16 的隱馬可夫模型描述：隱藏狀態是守衛所在的列 0–4；轉移模型是巡邏規則（停留 1/2，往上、往下各 1/4，撞到邊界就留在原地）；感測模型是讀對 3/5、讀成相鄰列各 1/5（邊界那一格讀對 4/5），從不會讀錯兩列。先驗是五列各 1/5。' },
        { type: 'p', text: '前向演算法每一回合做兩件事：預測（守衛走一步，信念乘上轉移矩陣），再更新（乘上讀數的概似，AIF14 的貝氏定理，最後正規化讓總和是 1）。全部用 Fraction 精確計算，印出時才取三位小數。三次讀數是 2、1、1；之後再往前預測到「探險者抵達穿越格」的那一刻：走廊 3 步後到達，上路與下路 5 步後到達。' },
        { type: 'example', id: 'e-filter' },
        { type: 'table', head: ['時間', '讀數', 'P(列 0)', 'P(列 1)', 'P(列 2)', 'P(列 3)', 'P(列 4)'], rows: [
          ['t = 0', '2', '0', '1/5', '3/5', '1/5', '0'],
          ['t = 1', '1', '1/24', '5/8', '1/3', '0', '0'],
          ['t = 2', '1', '9/83', '117/166', '31/166', '0', '0'],
        ] },
        { type: 'p', text: '踏進穿越格時被抓的機率 = P(守衛已經在那一列) + P(守衛下一步走進那一列)。期望效用 EU = (1 − P(被抓)) × 30 − P(被抓) × 50 − 步數，這是 AIF17 的最大期望效用原則：三條路分別是上路 P = 0.376、EU = −10.08；走廊 P = 0.341、EU = −3.28；下路 P = 0.102、EU = 11.86，所以選下路。讀數說守衛偏向上半部，而且下路要 5 步才到，守衛有時間「擴散」，但機率仍集中在上方。' },
        { type: 'callout', tone: 'warning', title: '「最可能的位置就是守衛的位置」', text: '濾波後最可能的是列 1（117/166 ≈ 0.705），但守衛有約 0.3 的機率在別處。只拿最可能的位置做決定，會把「大概」當成「確定」：例如以為守衛在列 1，就推論走廊的穿越格（列 2）旁邊只差一步、下路完全安全，卻忽略了分布的其他部分。決策要用整個分布算期望值。另外要注意，感測模型把「讀錯兩列」設成機率 0，所以讀到 1 之後，列 3、4 的信念立刻變成精確的 0；如果真實的感測器偶爾會錯兩列，這個 0 就是過度自信，第五關會再談。' },
      ],
    },
    {
      id: 'stage-decision', title: '第四關：不確定性下的決策——穿越還是等待',
      blocks: [
        { type: 'p', text: '依第三關選了下路，探險者走到 (4, 2)，準備穿越 (4, 3)。站在巡邏線旁邊時看得到守衛，於是問題變成 AIF18 的 MDP：狀態是守衛所在的列 0–4；動作是穿越（C）或等待（W）；等待時守衛照巡邏模型移動，每回合付出等待成本；穿越後回合結束，成功 +30，被抓 −50。被抓的機率是 1（守衛就在列 4）、1/4（守衛在列 3，下一步可能走下來）或 0。' },
        { type: 'p', text: '這是一個「一定會結束」的回合式問題：等太久的代價會一直累積，所以折扣因子取 γ = 1。貝爾曼方程是 V(g) = max(Q(穿越), −等待成本 + Σ P(g → g\') V(g\'))。價值迭代從 V = 0 開始同步更新，最大變化小於 θ = 10⁻⁹ 就停，同分時選穿越。' },
        { type: 'example', id: 'e-mdp' },
        { type: 'table', head: ['等待成本', '策略（守衛在列 0–4）', '守衛在列 3：Q(穿越)', '守衛在列 3：Q(等待)', '和 minimax 規則比較'], rows: [
          ['1', 'C C C W W', '10.00', '22.00', '相同：只在守衛離穿越格至少 2 步時穿越'],
          ['4', 'C C C C W', '10.00', '7.00', '不同：守衛離 1 步也穿越，因為隨機巡邏的守衛只有 1/4 的機率走下來'],
        ] },
        { type: 'p', text: 'Q(穿越) 在列 3 永遠是 3/4 × 30 − 1/4 × 50 = 10，變的是等待的價值：等待成本從 1 提高到 4，Q(等待) 從 22 降到 7，穿越就變成比較好的選擇。這是不確定性下決策的核心：同樣的風險，接不接受取決於效用怎麼設定（AIF18 的獎勵設計）。和第二關相比，minimax 把守衛當成一定會走下來（被抓機率 1），MDP 用的是它真實的行為模型（1/4）；兩者在等待便宜時給出同樣的策略，等待昂貴時就分道揚鑣。' },
        { type: 'callout', tone: 'note', title: '把信念當成狀態的簡化', text: '第三關的濾波與第四關的 MDP 是分開解的：先用信念選路，到了巡邏線才把「看到的守衛列」當成完全可觀察的狀態。完整的做法是部分可觀察的 MDP（POMDP），把整個信念分布當成狀態一起規劃，但計算量大得多。分階段處理是工程上常見的取捨，設計報告裡要寫出這個簡化，以及它可能錯在哪裡（例如路上的讀數其實還能修正選路）。' },
      ],
    },
    {
      id: 'stage-evaluation', title: '第五關：績效評估與負責任設計',
      blocks: [
        { type: 'p', text: '一個策略好不好，不能只看一次執行。績效評估用固定種子的模擬：讓守衛從均勻抽樣的列出發，每個策略跑 10,000 回合，記錄成功、被抓與「等了 8 次還沒過、交給人類決定」的比例，以及平均與最多等待次數。固定種子（AIF06 的做法）讓任何人重跑都得到同樣的數字，比較才公平。' },
        { type: 'example', id: 'e-evaluate' },
        { type: 'table', head: ['策略', '成功', '被抓', '交給人類', '平均等待', '最多等待'], rows: [
          ['直接穿越（C C C C C）', '75.56%', '24.44%', '0.00%', '0.00', '0'],
          ['等待成本 1 的最佳策略（C C C W W）', '83.44%', '0.00%', '16.56%', '2.17', '8'],
          ['等待成本 4 的最佳策略（C C C C W）', '88.73%', '9.14%', '2.13%', '0.71', '8'],
        ] },
        { type: 'p', text: '成功率最高的是 C C C C W，但它有 9.14% 被抓；C C C W W 從不被抓，代價是 16.56% 的回合要人類接手。哪個比較好，取決於「被抓」代表什麼：在遊戲裡只是輸一局；如果同一套規劃器拿去控制在人旁邊移動的實體機器人，「被抓」就是碰撞，9% 是不能接受的。這就是 AIF19 的負責任設計：先界定傷害，再選指標；安全限制要寫成硬性條件，而不是只在獎勵裡扣幾分。' },
        { type: 'table', head: ['負責任 AI 原則（AIF19）', '在本專題的做法'], rows: [
          ['可靠與安全', '報告被抓率與等待的尾端（最多 8 次），不只報平均；感測模型不給任何讀數機率 0，並用真實紀錄檢查模型'],
          ['人類監督', '等了 8 次還沒穿越就停下來交給人類（human-in-the-loop），而且人隨時可以叫停'],
          ['透明與可解釋', '每個決定都記錄觀察、信念或 Q 值、選擇的動作與理由，事後可以重播'],
          ['公平', '遊戲 AI 只能用玩家也有的資訊（感測器讀數），不偷看守衛的真實位置'],
          ['隱私', '紀錄只留決策需要的欄位；有玩家資料時做資料最小化，設定保存期限'],
          ['問責與風險分級', '娛樂用的遊戲 AI 在歐盟 AI 法屬於最低風險；若成為機械產品（例如與人共處的機器人）的安全元件，可能被列為高風險，需要風險管理、文件化與合格評估'],
        ] },
        { type: 'p', text: '範例最後印出的決策紀錄就是稽核的起點：每一回合寫下等待次數、看到的守衛列與動作，最後寫結果。實際系統還要加上程式與模型的版本、隨機種子、信念分布或 Q 值，以及人類接手時的處置。設計報告則依序寫：任務與 PEAS、每個子問題的模型與假設、演算法選擇的理由、各關的數字、績效評估（含失敗與尾端）、風險與監督機制，以及已知的簡化與限制。' },
        { type: 'callout', tone: 'warning', title: '「平均成功率高，就代表系統可以上線」', text: '平均值會把不同的失敗混在一起：C C C C W 的成功率比 C C C W W 高 5.29 個百分點，卻多了 9.14% 的被抓；一個從不交給人類的策略，看起來「完全自動」，其實是把風險藏進被抓率。上線前要分開報告每一種失敗、檢查最壞情況，並確認模型假設（守衛真的照機率巡邏嗎？感測器真的不會錯兩列嗎？）在真實環境中成立。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-astar', title: '第一關：三個穿越點的 A* 路線與展開數',
      description: '每次只開放一個穿越點，其他巡邏格當成牆，用 A* 找最短路；比較曼哈頓距離與 h = 0 的展開數。open 依 (f, h, counter) 排序，鄰居順序上、下、左、右。',
      code: { Python: code`import heapq
MAZE = [".......",
        ".##.##.",
        "S.....G",
        ".##.##.",
        "......."]
RAIL = [(r, 3) for r in range(5)]  # 守衛巡邏的第 3 行，每條路都要穿過它
STEPS = {'U': (-1, 0), 'D': (1, 0), 'L': (0, -1), 'R': (0, 1)}

def find(ch):
    return next((r, row.index(ch)) for r, row in enumerate(MAZE) if ch in row)

def astar(start, goal, use_h, blocked):
    h = (lambda p: abs(p[0] - goal[0]) + abs(p[1] - goal[1])) if use_h else (lambda p: 0)
    g, parent, closed, counter = {start: 0}, {start: None}, set(), 0
    pq = [(h(start), h(start), counter, start)]  # (f, h, counter, 格子)
    while pq:
        _, _, _, u = heapq.heappop(pq)
        if u in closed:
            continue
        if u == goal:  # 取出終點才停
            moves = ''
            while parent[u]:
                p = parent[u]
                moves = next(k for k, d in STEPS.items() if (p[0] + d[0], p[1] + d[1]) == u) + moves
                u = p
            return moves, len(closed)
        closed.add(u)
        for dr, dc in STEPS.values():
            v = (u[0] + dr, u[1] + dc)
            if 0 <= v[0] < 5 and 0 <= v[1] < 7 and MAZE[v[0]][v[1]] != '#' and v not in blocked \
                    and v not in closed and g[u] + 1 < g.get(v, 99):
                g[v], parent[v], counter = g[u] + 1, u, counter + 1
                heapq.heappush(pq, (g[v] + h(v), h(v), counter, v))
    return None, len(closed)

S, G = find('S'), find('G')
for row in (0, 2, 4):  # 只開放第 row 列的穿越點，其他巡邏格當成牆
    blocked = {p for p in RAIL if p[0] != row}
    moves, expanded = astar(S, G, True, blocked)
    _, expanded_zero = astar(S, G, False, blocked)
    print(f'穿越列 {row}: 成本 {len(moves):2} 路徑 {moves:10} 展開 曼哈頓 {expanded:2} / h=0 {expanded_zero:2}')` },
      output: code`穿越列 0: 成本 10 路徑 UURRRRRRDD 展開 曼哈頓 13 / h=0 16
穿越列 2: 成本  6 路徑 RRRRRR     展開 曼哈頓  6 / h=0 14
穿越列 4: 成本 10 路徑 DDRRRRRRUU 展開 曼哈頓 16 / h=0 16`,
    },
    {
      id: 'e-alphabeta', title: '第二關：深度限制的 alpha-beta，判斷何時能穿越',
      description: '探險者在 (2, 2)，守衛在第 3 行。雙方各 3 步的 minimax，評估函數是 30 減去「避開守衛周圍」的 BFS 步數；印出每個動作的值、選擇，以及不剪枝與剪枝時拜訪的節點數。',
      code: { Python: code`from collections import deque
MAZE = [".......", ".##.##.", "S.....G", ".##.##.", "......."]
GOAL = (2, 6)
STEPS = {'U': (-1, 0), 'D': (1, 0), 'L': (0, -1), 'R': (0, 1), 'W': (0, 0)}  # W：原地等

def free(p):
    return 0 <= p[0] < 5 and 0 <= p[1] < 7 and MAZE[p[0]][p[1]] != '#'

def moves(p, guard):  # 守衛只能留在第 3 行
    nxt = [(k, (p[0] + d[0], p[1] + d[1])) for k, d in STEPS.items()]
    return [(k, q) for k, q in nxt if free(q) and (not guard or q[1] == 3)]

def steps_left(me, guard):  # 評估用的 BFS：不踏進守衛身邊的格子，到出口還要幾步
    dist, queue = {me: 0}, deque([me])
    while queue:
        u = queue.popleft()
        if u == GOAL:
            return dist[u]
        for _, v in moves(u, False):
            if v not in dist and (v == GOAL or abs(v[0] - guard[0]) + abs(v[1] - guard[1]) > 1):
                dist[v] = dist[u] + 1
                queue.append(v)
    return 30

def value(me, guard, depth, my_turn, alpha, beta, prune, count):
    count[0] += 1
    if me == guard: return -100  # 被抓
    if me == GOAL: return 100
    if depth == 0: return 30 - steps_left(me, guard)
    best = -999 if my_turn else 999
    for _, q in moves(me if my_turn else guard, not my_turn):
        v = value(q, guard, depth - 1, False, alpha, beta, prune, count) if my_turn \
            else value(me, q, depth - 1, True, alpha, beta, prune, count)
        if my_turn: best, alpha = max(best, v), max(alpha, v)
        else: best, beta = min(best, v), min(beta, v)
        if prune and alpha >= beta: break  # 剪枝
    return best

for guard in ((0, 3), (1, 3)):  # 探險者在 (2, 2)，正要穿越 (2, 3)
    scores = {k: value(q, guard, 5, False, -999, 999, True, [0]) for k, q in moves((2, 2), False)}
    full, cut = [0], [0]
    value((2, 2), guard, 6, True, -999, 999, False, full)
    value((2, 2), guard, 6, True, -999, 999, True, cut)
    best = max(scores, key=scores.get)  # 同分取先列出的動作
    print(f'守衛在 {guard}:', ' '.join(f'{k}={v}' for k, v in scores.items()), f'→ {best}，節點 minimax {full[0]} / alpha-beta {cut[0]}')` },
      output: code`守衛在 (0, 3): L=20 R=29 W=20 → R，節點 minimax 654 / alpha-beta 233
守衛在 (1, 3): L=20 R=-100 W=20 → L，節點 minimax 864 / alpha-beta 264`,
    },
    {
      id: 'e-filter', title: '第三關：前向演算法濾出守衛的位置，再以期望效用選路',
      description: '隱馬可夫模型：巡邏是轉移模型，雜訊讀數是感測模型。每回合預測再更新（Fraction 精確計算），然後預測到抵達穿越格的時刻，算出三條路被抓的機率與期望效用。',
      code: { Python: code`from fractions import Fraction as F
ROWS = range(5)  # 守衛在第 3 行的第幾列（0 在最上面）

def move(g, r):  # 巡邏模型：停留 1/2，上、下各 1/4；撞到邊界就留在原地
    p = F(1, 2) * (r == g) + F(1, 4) * (abs(r - g) == 1)
    return p + F(1, 4) * (r == g) * (g in (0, 4))

def sense(o, g):  # 感測模型：讀對 3/5，讀成相鄰列各 1/5；邊界外那 1/5 算讀對
    p = F(3, 5) * (o == g) + F(1, 5) * (abs(o - g) == 1)
    return p + F(1, 5) * (o == g) * (g in (0, 4))

def predict(b):  # 守衛走一步之後的分布
    return [sum(b[g] * move(g, r) for g in ROWS) for r in ROWS]

def update(b, o):  # 乘上概似再正規化
    w = [b[r] * sense(o, r) for r in ROWS]
    return [x / sum(w) for x in w]

belief = [F(1, 5)] * 5  # 先驗：五列一樣可能
for t, reading in enumerate([2, 1, 1]):
    if t:
        belief = predict(belief)
    belief = update(belief, reading)
    print(f't={t} 讀數 {reading}:', ' '.join(f'{float(p):.3f}' for p in belief))

routes = [('上路', 0, 5, 10), ('走廊', 2, 3, 6), ('下路', 4, 5, 10)]  # 名稱、穿越列、幾步後到達、總步數
best = None
for name, row, arrive, length in routes:
    b = belief
    for _ in range(arrive):
        b = predict(b)
    caught = b[row] + sum(b[g] * move(g, row) for g in ROWS if g != row)  # 踏進去時在那裡，或下一步走過來
    eu = (1 - caught) * 30 - caught * 50 - length  # 成功 +30、被抓 -50、每步 -1
    print(f'{name}: {arrive} 步後穿越第 {row} 列，P(被抓) = {float(caught):.3f}，EU = {float(eu):.2f}')
    if best is None or eu > best[1]:
        best = (name, eu)
print('選擇', best[0])` },
      output: code`t=0 讀數 2: 0.000 0.200 0.600 0.200 0.000
t=1 讀數 1: 0.042 0.625 0.333 0.000 0.000
t=2 讀數 1: 0.108 0.705 0.187 0.000 0.000
上路: 5 步後穿越第 0 列，P(被抓) = 0.376，EU = -10.08
走廊: 3 步後穿越第 2 列，P(被抓) = 0.341，EU = -3.28
下路: 5 步後穿越第 4 列，P(被抓) = 0.102，EU = 11.86
選擇 下路`,
    },
    {
      id: 'e-mdp', title: '第四關：穿越還是等待——價值迭代',
      description: '守衛看得到時，狀態是守衛的列，動作是穿越或等待。以 γ = 1 的價值迭代解兩種等待成本，印出每一列的 Q 值、價值與策略。',
      code: { Python: code`ROWS = range(5)  # 狀態：看得到的守衛列；探險者在 (4, 2)，要穿越 (4, 3)
CROSS_ROW, WIN, LOSE = 4, 30, 50

def move(g, r):  # 和濾波用的巡邏模型相同
    p = 0.5 * (r == g) + 0.25 * (abs(r - g) == 1)
    return p + 0.25 * (r == g) * (g in (0, 4))

def caught(g):  # 守衛已在穿越格，或下一步走進來
    return 1.0 if g == CROSS_ROW else move(g, CROSS_ROW)

def value_iteration(wait_cost, theta=1e-9):
    V, sweeps = [0.0] * 5, 0
    while True:
        q_cross = [(1 - caught(g)) * WIN - caught(g) * LOSE for g in ROWS]  # 穿越後回合結束
        q_wait = [-wait_cost + sum(move(g, r) * V[r] for r in ROWS) for g in ROWS]
        new = [max(c, w) for c, w in zip(q_cross, q_wait)]
        delta, V, sweeps = max(abs(a - b) for a, b in zip(new, V)), new, sweeps + 1
        if delta < theta:  # 同步更新，最大變化小於 θ 就停
            return V, q_cross, q_wait, sweeps

for wait_cost in (1, 4):
    V, q_cross, q_wait, sweeps = value_iteration(wait_cost)
    policy = ''.join('C' if c >= w else 'W' for c, w in zip(q_cross, q_wait))  # 同分選穿越
    print(f'等待成本 {wait_cost}（{sweeps} 輪）策略 {policy}')
    for g in ROWS:
        print(f'  守衛在第 {g} 列: Q(穿越) = {q_cross[g]:6.2f}  Q(等待) = {q_wait[g]:6.2f}  V = {V[g]:6.2f}')` },
      output: code`等待成本 1（215 輪）策略 CCCWW
  守衛在第 0 列: Q(穿越) =  30.00  Q(等待) =  29.00  V =  30.00
  守衛在第 1 列: Q(穿越) =  30.00  Q(等待) =  29.00  V =  30.00
  守衛在第 2 列: Q(穿越) =  30.00  Q(等待) =  27.00  V =  30.00
  守衛在第 3 列: Q(穿越) =  10.00  Q(等待) =  22.00  V =  22.00
  守衛在第 4 列: Q(穿越) = -50.00  Q(等待) =  18.00  V =  18.00
等待成本 4（72 輪）策略 CCCCW
  守衛在第 0 列: Q(穿越) =  30.00  Q(等待) =  26.00  V =  30.00
  守衛在第 1 列: Q(穿越) =  30.00  Q(等待) =  26.00  V =  30.00
  守衛在第 2 列: Q(穿越) =  30.00  Q(等待) =  21.00  V =  30.00
  守衛在第 3 列: Q(穿越) =  10.00  Q(等待) =   7.00  V =  10.00
  守衛在第 4 列: Q(穿越) = -50.00  Q(等待) =  -6.00  V =  -6.00`,
    },
    {
      id: 'e-evaluate', title: '第五關：固定種子的績效評估與決策紀錄',
      description: '三個策略各模擬 10,000 回合（種子 2026），統計成功、被抓與交給人類的比例和等待次數；再以種子 19 印出一個回合的決策紀錄。',
      code: { Python: code`import random
CROSS_ROW, LIMIT = 4, 8  # 在 (4, 2) 準備穿越第 4 列；等了 LIMIT 次還沒過就交給人類

def guard_step(g, rng):  # 巡邏模型：停 1/2、上 1/4、下 1/4，撞到邊界留在原地
    x = rng.random()
    return g if x < 0.5 else max(g - 1, 0) if x < 0.75 else min(g + 1, 4)

def episode(policy, rng, log=None):
    g, waits = int(rng.random() * 5), 0  # 守衛的起始列：五列一樣可能
    while True:
        action = policy[g]
        if log is not None:
            log.append(f'等待 {waits} 次，看到守衛在第 {g} 列 → {action}')
        if action == 'C':
            if g == CROSS_ROW:
                return 'caught', waits
            g = guard_step(g, rng)
            return ('caught' if g == CROSS_ROW else 'safe'), waits
        if waits == LIMIT:
            return 'human', waits
        waits, g = waits + 1, guard_step(g, rng)

for name, policy in (('直接穿越', 'CCCCC'), ('等待成本 1', 'CCCWW'), ('等待成本 4', 'CCCCW')):
    rng, counts, total_wait, worst = random.Random(2026), {'safe': 0, 'caught': 0, 'human': 0}, 0, 0
    for _ in range(10000):
        result, waits = episode(policy, rng)
        counts[result] += 1
        total_wait, worst = total_wait + waits, max(worst, waits)
    print(f'{name}（{policy}）: 成功 {counts["safe"] / 100:.2f}%  被抓 {counts["caught"] / 100:.2f}%  '
          f'交給人類 {counts["human"] / 100:.2f}%  平均等待 {total_wait / 10000:.2f}  最多 {worst}')

log = []
result, _ = episode('CCCWW', random.Random(19), log)
print('決策紀錄（策略 CCCWW，種子 19）:')
print('\n'.join('  ' + line for line in log))
print('  結果:', result)` },
      output: code`直接穿越（CCCCC）: 成功 75.56%  被抓 24.44%  交給人類 0.00%  平均等待 0.00  最多 0
等待成本 1（CCCWW）: 成功 83.44%  被抓 0.00%  交給人類 16.56%  平均等待 2.17  最多 8
等待成本 4（CCCCW）: 成功 88.73%  被抓 9.14%  交給人類 2.13%  平均等待 0.71  最多 8
決策紀錄（策略 CCCWW，種子 19）:
  等待 0 次，看到守衛在第 3 列 → W
  等待 1 次，看到守衛在第 4 列 → W
  等待 2 次，看到守衛在第 3 列 → W
  等待 3 次，看到守衛在第 2 列 → C
  結果: safe`,
    },
  ],
  exercises: [
    {
      id: 'x-route-eu', title: '選路代理人：A* 規劃兩條路，再以期望效用選擇',
      statement: '給一張格子地圖，探險者要從 `S` 走到 `G`，每一步只能上、下、左、右移到相鄰格，不能走出地圖、不能進入 `#`。`w` 是守衛看得到的格子：每「進入」一次 `w`，就獨立地有機率 p 被抓（`S`、`G`、`.` 沒有風險）。請規劃兩個計畫：fast 是步數最少的路，若有多條，取其中經過 `w` 次數最少的一條；safe 是完全不進入 `w` 的路中步數最少的一條。對每個存在的計畫，令 k 為它進入 `w` 的次數、L 為步數，成功機率 P = (1 − p)^k，期望效用 EU = P × U − (1 − P) × D − L（U 是成功的獎勵，D 是被抓的懲罰，步數成本不論成敗都要付）。選 EU 較大的計畫；EU 相同時選 safe；只有一個計畫存在就選它；都不存在就選 none。P 與 EU 都以最簡分數印出（Python 的 `Fraction` 轉成字串的格式，例如 `3/4`、`20`、`-13/3`）。',
      inputFormat: '第一行：列數 R 與行數 C。接著 R 行，每行恰好 C 個字元，只能是 `.`、`#`、`S`、`G`、`w`，`S` 與 `G` 各恰好一個。最後一行：p U D，以空白分隔；p 寫成分數 `a/b` 或整數，U、D 是整數。之後不能再有非空白的行。',
      outputFormat: '三行。第一行是 fast、第二行是 safe：計畫存在時印 `名稱: steps L, watched k, success P, EU E`，不存在時印 `名稱: none`。第三行印 `choose fast`、`choose safe` 或 `choose none`。輸入不合規定（第一行格式、R 或 C 超出範圍、列數不足、某列長度不是 C、出現其他字元、S 或 G 不是恰好一個、最後一行不是三個值、p 不在 0 到 1 之間或不是數字、U 或 D 不是非負整數、多出非空白的行）：只印一行 `invalid input`。',
      constraints: ['1 ≤ R, C ≤ 12', '0 ≤ p ≤ 1；U、D 是非負整數', '只能上下左右移動，每步成本 1', '不同的 `w` 被抓與否互相獨立；同一條路經過 k 個 `w`，成功機率是 (1 − p)^k', 'EU 相同時選 safe'],
      samples: [
        { kind: 'normal', input: "5 7\n.......\n.##w##.\nS..w..G\n.##w##.\n.......\n1/4 30 50\n", output: "fast: steps 6, watched 1, success 3/4, EU 4\nsafe: steps 10, watched 0, success 1, EU 20\nchoose safe\n", note: "本課的迷宮：只有走廊的穿越點 (2, 3) 有守衛，捷徑 EU = 4，繞上路 EU = 20" },
        { kind: 'normal', input: "5 7\n.......\n.##w##.\nS..w..G\n.##w##.\n.......\n1/50 30 50\n", output: "fast: steps 6, watched 1, success 49/50, EU 112/5\nsafe: steps 10, watched 0, success 1, EU 20\nchoose fast\n", note: "同一張地圖，被抓機率降到 1/50：捷徑的 EU = 112/5 大於 20，改走捷徑" },
      ],
      tests: [
        { kind: 'normal', input: "5 7\n.......\n.##w##.\nS..w..G\n.##w##.\n.......\n1/20 30 50\n", output: "fast: steps 6, watched 1, success 19/20, EU 20\nsafe: steps 10, watched 0, success 1, EU 20\nchoose safe\n", note: "p = 1/20 時兩條路的 EU 都是 20：同分依規則選 safe" },
        { kind: 'normal', input: "5 7\n...w...\n.##w##.\nS..w..G\n.##w##.\n...w...\n1/4 30 50\n", output: "fast: steps 6, watched 1, success 3/4, EU 4\nsafe: none\nchoose fast\n", note: "整個第 3 行都有守衛，沒有安全路線，只能選 fast" },
        { kind: 'normal', input: "3 5\nS.w..\n.w...\n...wG\n1/20 20 10\n", output: "fast: steps 6, watched 1, success 19/20, EU 25/2\nsafe: steps 8, watched 0, success 1, EU 12\nchoose fast\n", note: "最短路有很多條，有的經過 2 個 w：要選經過最少 w 的那條，EU = 25/2 才會勝過 safe 的 12" },
        { kind: 'normal', input: "3 5\nS.w..\n.w...\n...wG\n1/2 20 10\n", output: "fast: steps 6, watched 1, success 1/2, EU -1\nsafe: steps 8, watched 0, success 1, EU 12\nchoose safe\n", note: "同一張地圖、p = 1/2：捷徑成功機率只剩 1/2，EU = -1，選 safe" },
        { kind: 'normal', input: "3 6\nS.w..G\n.w.w..\n......\n1/10 100 0\n", output: "fast: steps 5, watched 1, success 9/10, EU 85\nsafe: steps 9, watched 0, success 1, EU 91\nchoose safe\n", note: "沒有懲罰（L = 0）時，風險只讓獎勵打九折：85 對 91，仍選 safe" },
        { kind: 'normal', input: "12 12\n......w.....\n.##########.\n.##########.\n.##########.\n.##########.\nS....w.....G\n.##########.\n.##########.\n.##########.\n.##########.\n.##########.\n............\n1/3 40 60\n", output: "fast: steps 11, watched 1, success 2/3, EU -13/3\nsafe: steps 23, watched 0, success 1, EU 17\nchoose safe\n", note: "12 × 12 的大地圖：捷徑穿過中央走廊的一個 w（11 步），上緣也有 w，safe 只能繞下緣（23 步）" },
        { kind: 'edge', input: "1 2\nSG\n1 5 5\n", output: "fast: steps 1, watched 0, success 1, EU 4\nsafe: steps 1, watched 0, success 1, EU 4\nchoose safe\n", note: "S 緊鄰 G：兩個計畫相同、都不經過 w，即使 p = 1 也一定成功，同分選 safe" },
        { kind: 'edge', input: "2 3\nSwG\n...\n0 10 50\n", output: "fast: steps 2, watched 1, success 1, EU 8\nsafe: steps 4, watched 0, success 1, EU 6\nchoose fast\n", note: "p = 0：經過 w 沒有風險，較短的 fast 勝出" },
        { kind: 'edge', input: "3 3\nSw.\n#w#\n.wG\n1 10 5\n", output: "fast: steps 4, watched 3, success 0, EU -9\nsafe: none\nchoose fast\n", note: "唯一的路經過 3 個 w 而 p = 1：成功機率 0，EU = -5 - 4 = -9，safe 不存在，仍印出 choose fast" },
        { kind: 'edge', input: "3 3\nS#.\n##.\n..G\n1/2 10 10\n", output: "fast: none\nsafe: none\nchoose none\n", note: "S 被牆封住：兩個計畫都不存在，印出 choose none" },
        { kind: 'edge', input: "2 2\nS#\n#G\n1/2 0 0\n", output: "fast: none\nsafe: none\nchoose none\n", note: "對角相鄰但不能斜走，U 與 L 都是 0 也照樣判定無路" },
        { kind: 'error', input: "2 3\nS.G\n..\n1/2 10 10\n", output: "invalid input\n", note: "第二列只有 2 個字元，與 C = 3 不符" },
        { kind: 'error', input: "2 3\nS.G\n..G\n1/2 10 10\n", output: "invalid input\n", note: "有兩個 G" },
        { kind: 'error', input: "2 3\nS.x\n..G\n1/2 10 10\n", output: "invalid input\n", note: "出現規定以外的字元 x" },
        { kind: 'error', input: "2 3\nS.G\n...\n3/2 10 10\n", output: "invalid input\n", note: "機率 3/2 大於 1" },
        { kind: 'error', input: "2 3\nS.G\n...\nhalf 10 10\n", output: "invalid input\n", note: "機率不是數字" },
        { kind: 'error', input: "2 3\nS.G\n...\n", output: "invalid input\n", note: "少了最後一行的 p、U、L" },
        { kind: 'error', input: "2 3\nS.G\n...\n1/2 10 -5\n", output: "invalid input\n", note: "懲罰 L 是負數" },
        { kind: 'error', input: "13 1\nS\n.\n.\n.\n.\n.\n.\n.\n.\n.\n.\n.\nG\n1/2 10 10\n", output: "invalid input\n", note: "R = 13 超出 1–12 的範圍" },
      ],
      hints: [
        'safe 很簡單：把 `w` 當成牆，跑一次 A*（曼哈頓距離）就好。',
        'fast 要「先比步數，再比 w 的數目」。把每一步的成本設成 B，進入 `w` 再加 1，其中 B 大於任何路徑可能經過的 `w` 數（例如 B = R × C + 1）。總成本最小，就是步數最少、同步數時 w 最少；啟發函數用 B × 曼哈頓距離，仍然可接受而且一致。',
        '只做普通的 A*（成本只有步數）會在多條最短路中隨同分規則選一條，可能多經過一個 `w`；測資裡有這種地圖。',
        '用 `fractions.Fraction` 讀 p 並計算 P 與 EU：(1 − p) 的 k 次方（`pow(1 - p, k)`）仍是精確的分數，直接用 `str()` 印出即可。',
      ],
      solution: { Python: code`import heapq
import sys
from fractions import Fraction

def parse(lines):
    try:
        rows, cols = map(int, lines[0].split())
        grid = lines[1:1 + rows]
        p_text, reward, penalty = lines[1 + rows].split()
        p, reward, penalty = Fraction(p_text), int(reward), int(penalty)
    except (ValueError, IndexError, ZeroDivisionError):
        return None
    if not (1 <= rows <= 12 and 1 <= cols <= 12) or not 0 <= p <= 1 or reward < 0 or penalty < 0:
        return None
    if any(len(row) != cols or set(row) - set('.#SGw') for row in grid):
        return None
    if ''.join(grid).count('S') != 1 or ''.join(grid).count('G') != 1 or any(line.strip() for line in lines[2 + rows:]):
        return None
    return grid, p, reward, penalty

def plan(grid, start, goal, avoid_watched):
    big = len(grid) * len(grid[0]) + 1  # 一步的成本 big，進入 w 再加 1：先比步數，再比 w 的數目
    h = lambda q: big * (abs(q[0] - goal[0]) + abs(q[1] - goal[1]))
    g, closed, counter = {start: 0}, set(), 0
    pq = [(h(start), counter, start)]
    while pq:
        _, _, u = heapq.heappop(pq)
        if u == goal:
            return divmod(g[u], big)  # (步數, 經過的 w 數)
        if u in closed:
            continue
        closed.add(u)
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            v = (u[0] + dr, u[1] + dc)
            if not (0 <= v[0] < len(grid) and 0 <= v[1] < len(grid[0])) or grid[v[0]][v[1]] == '#':
                continue
            watched = grid[v[0]][v[1]] == 'w'
            if (watched and avoid_watched) or v in closed:
                continue
            cost = g[u] + big + watched
            if cost < g.get(v, cost + 1):
                g[v], counter = cost, counter + 1
                heapq.heappush(pq, (cost + h(v), counter, v))
    return None

parsed = parse(sys.stdin.read().split('\n'))
if parsed is None:
    print('invalid input')
else:
    grid, p, reward, penalty = parsed
    cells = {ch: (r, c) for r, row in enumerate(grid) for c, ch in enumerate(row)}
    best = None
    for name, avoid in (('fast', False), ('safe', True)):
        result = plan(grid, cells['S'], cells['G'], avoid)
        if result is None:
            print(f'{name}: none')
            continue
        steps, k = result
        success = (1 - p) ** k
        eu = success * reward - (1 - success) * penalty - steps
        print(f'{name}: steps {steps}, watched {k}, success {success}, EU {eu}')
        if best is None or eu >= best[1]:  # 期望效用相同時選 safe
            best = (name, eu)
    print('choose', best[0] if best else 'none')` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'challenge-stages', title: '迷宮對戰代理人：五個關卡',
    stages: [
      { title: '形式化與 A* 路線', concepts: ['AIF03', 'AIF04', 'AIF05'], goal: '以 PEAS 描述代理人，把找路寫成搜尋問題，用可接受的曼哈頓距離做 A*，找出三個穿越點各自的最短路。', detail: '狀態是格子、動作是上下左右、成本是步數。走廊（穿越列 2）6 步，上路與下路各 10 步；A* 在走廊只展開 6 格（h = 0 要 14 格），在下路因為 h 忽略被封住的走廊，和 h = 0 一樣展開 16 格。最短不等於最好：成本裡還沒有守衛。' },
      { title: '對抗搜尋：最佳對手下何時能穿越', concepts: ['AIF07', 'AIF08'], goal: '把守衛當成最佳對手，用深度 6 的 alpha-beta 與 BFS 評估函數判斷站在 (2, 2) 時該不該穿越。', detail: '守衛在 (0, 3)：R = 29，穿越；守衛在 (1, 3)：R = −100，退回（L = W = 20）。規則是守衛離穿越格至少 2 步才穿越。alpha-beta 把拜訪節點從 654 降到 233、864 降到 264，選擇不變。第 3 行是切割線，最佳對手永遠擋得住，所以 minimax 偏悲觀。' },
      { title: '機率推論：濾波與選路', concepts: ['AIF13', 'AIF14', 'AIF16', 'AIF17'], goal: '用隱馬可夫模型的前向演算法從讀數 2、1、1 估計守衛的列，預測到抵達時刻，以期望效用選路。', detail: '濾波後的信念是 9/83、117/166、31/166、0、0。被抓機率：上路 0.376、走廊 0.341、下路 0.102；EU 分別是 −10.08、−3.28、11.86，選下路。要用整個分布做決定，不是只看最可能的列。' },
      { title: '不確定性下決策：穿越或等待的 MDP', concepts: ['AIF17', 'AIF18'], goal: '在 (4, 2) 看得到守衛時，以狀態 = 守衛列、動作 = 穿越／等待的 MDP，用價值迭代求最佳策略。', detail: 'γ = 1、θ = 10⁻⁹。等待成本 1 的策略是 C C C W W，與 minimax 規則相同；等待成本 4 時變成 C C C C W：守衛在列 3 時 Q(穿越) = 10 大於 Q(等待) = 7，因為隨機巡邏的守衛只有 1/4 的機率走下來。' },
      { title: '績效評估與負責任設計', concepts: ['AIF19', 'AIF03'], goal: '以固定種子模擬比較策略，報告每一種失敗，設計決策紀錄與人類監督，寫出設計報告。', detail: '10,000 回合：直接穿越被抓 24.44%；C C C W W 從不被抓但 16.56% 交給人類；C C C C W 成功 88.73% 但被抓 9.14%。記錄觀察、信念或 Q 值、動作與版本；等 8 次就交給人類；遊戲 AI 屬最低風險，與人共處的機器人則不然。' },
    ],
  },
  quiz: [
    {
      id: 'q-model', prompt: '本專題的守衛可以用 minimax（AIF07、AIF08）當成最佳對手，也可以用馬可夫鏈（AIF16）當成照機率巡邏。下列何者正確？',
      options: [
        '兩種模型一定給出同樣的策略，差別只在計算方式',
        '若守衛會看著探險者選最壞的走法，用 minimax；若它照固定機率巡邏，用機率模型與期望效用，因為 minimax 會把只有 1/4 的風險當成一定發生',
        '應該一律用 minimax，因為最壞情況的保證在任何情境都是最好的選擇',
        '應該一律用機率模型，因為它算出的期望效用比較高，代表它比較準',
      ],
      answer: 1, explanation: '模型要符合對手實際的行為：會反應的最佳對手用 minimax，照機率行動的守衛用馬可夫鏈。第四關等待成本 4 時，MDP 在守衛離 1 步時穿越（被抓機率 1/4），minimax 卻認為被抓機率是 1。「一定給出同樣的策略」錯：等待成本 4 時兩者不同；「一律用 minimax」錯：太保守，16.56% 的回合要人接手，而且第 3 行是切割線，最佳對手永遠擋得住；「一律用機率模型」錯：若守衛真的會追人，機率模型會低估風險，期望效用高不代表模型對。',
    },
    {
      id: 'q-astar-eu', prompt: '第一關的 A* 說走廊只要 6 步，是最短路；第三關卻選了 10 步的下路。下列何者正確？',
      options: [
        'A* 只對它拿到的成本（步數）最佳；第三關的目標是期望效用，把被抓的風險算進去後，下路的 EU 11.86 高於走廊的 −3.28',
        '曼哈頓距離在這張迷宮裡會高估，所以 A* 找到的 6 步其實不是最短路',
        '第三關算錯了：期望效用最高的路一定也是步數最少的路',
        '把 A* 的啟發函數改成 h = 0，就會找到下路',
      ],
      answer: 0, explanation: '最佳性是相對於目標而言：A*（AIF05）在步數這個成本下最佳，期望效用（AIF17）多考慮了被抓的機率與懲罰，所以兩者的「最好」不同。「曼哈頓距離高估」錯：每步最多讓它減少 1，它一致也可接受，6 步確實最短；「EU 最高一定最短」錯：走廊被抓機率 0.341，EU 只有 −3.28；「改成 h = 0」錯：h = 0 是 UCS，仍以步數為成本，一樣回傳 6 步的走廊，只是展開更多（14 對 6）。',
    },
    {
      id: 'q-filter-code', prompt: '下面的程式是第三關濾波的一回合（AIF14 的貝氏更新加上 AIF16 的預測），印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
ROWS = range(5)

def move(g, r):
    p = F(1, 2) * (r == g) + F(1, 4) * (abs(r - g) == 1)
    return p + F(1, 4) * (r == g) * (g in (0, 4))

def sense(o, g):
    p = F(3, 5) * (o == g) + F(1, 5) * (abs(o - g) == 1)
    return p + F(1, 5) * (o == g) * (g in (0, 4))

b = [F(0), F(1, 5), F(3, 5), F(1, 5), F(0)]  # 讀到 2 之後的信念
b = [sum(b[g] * move(g, r) for g in ROWS) for r in ROWS]  # 預測
w = [b[r] * sense(1, r) for r in ROWS]  # 讀到 1
print(' '.join(str(x / sum(w)) for x in w))` },
      options: ['0 1/2 1/2 0 0', '1/20 1/4 2/5 1/4 1/20', '1/24 5/8 1/3 0 0', '1/100 3/20 2/25 0 0'],
      answer: 2, explanation: '先預測：b 變成 1/20、1/4、2/5、1/4、1/20。再乘上讀到 1 的概似（1/5、3/5、1/5、0、0）得到 1/100、3/20、2/25、0、0，總和 6/25，正規化後是 1/24、5/8、1/3、0、0。「0 1/2 1/2 0 0」漏了預測，直接拿上一回合的信念更新；「1/20 1/4 2/5 1/4 1/20」只做了預測，沒有用讀數更新；「1/100 3/20 2/25 0 0」忘了正規化，總和只有 6/25，不是機率分布。',
    },
    {
      id: 'q-alphabeta', prompt: '第二關的程式把 alpha-beta 剪枝關掉（prune = False，變回純 minimax），守衛在 (1, 3) 的局面會怎樣？',
      options: [
        'R 的值會從 −100 變成 29，因為不剪枝才看得到所有分支',
        '值會更準確，所以選擇可能從 L 變成 W',
        '拜訪的節點會變少，因為不必維護 alpha 與 beta',
        '每個動作的值與選擇都不變，只是拜訪的節點從 264 增加到 864',
      ],
      answer: 3, explanation: 'alpha-beta（AIF08）剪掉的分支都不可能改變根節點的 minimax 值（AIF07），所以 L = W = 20、R = −100、選擇 L 全部不變，差別只在拜訪的節點數：864 對 264。「R 變成 29」錯：守衛下一步就走進 (2, 3)，任何完整的 minimax 都看得到 −100；「值更準確」錯：剪枝不是近似，值完全相同；「節點變少」顛倒了，剪枝才會減少節點。',
    },
    {
      id: 'q-mdp', prompt: '第四關把等待成本從 1 提高到 4，守衛在列 3 時的最佳動作從等待變成穿越。原因是什麼？',
      options: [
        '等待成本提高讓 Q(穿越) 從 10 變大，超過了 Q(等待)',
        'Q(穿越) 一直是 3/4 × 30 − 1/4 × 50 = 10，等待變貴讓 Q(等待) 從 22 降到 7，穿越就比較好',
        '等待成本提高等於把守衛改成最佳對手，所以策略改變',
        '因為折扣因子 γ 從 1 變成 0.9，未來的價值變小',
      ],
      answer: 1, explanation: '穿越後回合就結束，Q(穿越) 只取決於被抓機率 1/4 與 +30、−50，等待成本不影響它；Q(等待) 要一直付等待成本，從 22 降到 7（AIF18 的價值迭代），所以 10 > 7 時改成穿越，這是 AIF17 的最大期望效用。「Q(穿越) 變大」錯：它固定是 10；「守衛變成最佳對手」錯：轉移模型沒有改，仍是 1/4 走下來，若是最佳對手被抓機率會是 1；「γ 變成 0.9」錯：兩次都用 γ = 1，改的只有等待成本。',
    },
    {
      id: 'q-eu-calc', prompt: '依練習的規則：fast 走 6 步、經過 2 個 `w`，p = 1/5；safe 走 10 步、不經過 `w`；U = 30、D = 50。fast 的成功機率與 EU 是多少？最後選哪一個？',
      options: [
        '成功機率 3/5（1 − 2 × 1/5），EU = −8，選 safe',
        '成功機率 4/5（風險只算一次），EU = 8，選 safe',
        '成功機率 16/25，EU = 66/5，選 safe',
        '成功機率 16/25，EU = −24/5，選 safe',
      ],
      answer: 3, explanation: '兩個 w 互相獨立（AIF13 的乘法規則），成功機率 (4/5)² = 16/25；EU = 16/25 × 30 − 9/25 × 50 − 6 = 6/5 − 6 = −24/5，小於 safe 的 30 − 10 = 20，選 safe（AIF17）。「3/5」把機率相減，只在兩個事件互斥時才對；「4/5」只算了一個 w；「66/5」忘了扣被抓時的懲罰 9/25 × 50 = 18。',
    },
    {
      id: 'q-evaluation', prompt: '同一套規劃器要拿去控制在倉庫人員旁邊移動的實體機器人，「被抓」改成代表「與人碰撞」。依第五關的模擬結果，下列哪一個做法最符合負責任設計（AIF19）？',
      options: [
        '選 C C C C W：它的成功率 88.73% 最高，期望效用也最好',
        '選 C C C C C：從不需要人類接手，完全自動最有效率',
        '選 C C C W W 並保留人類接手（16.56% 的回合），把「不碰撞」寫成硬性限制而不是獎勵裡的 −50，分開報告每一種失敗',
        '三個策略都可以，只要平均成功率超過 75% 就符合要求',
      ],
      answer: 2, explanation: '碰撞是不可接受的傷害，應該是硬性限制；C C C W W 在模擬中被抓率 0%，代價是 16.56% 要人接手，這正是人類監督要處理的情況，而且要分開報告每一種失敗與尾端。「選 C C C C W」錯：成功率高但 9.14% 碰撞，−50 是遊戲分數，不是安全標準（AIF17 的效用要反映真正的傷害）；「選 C C C C C」錯：24.44% 碰撞，「不需要人」只是把風險藏起來；「平均成功率超過 75% 就好」錯：平均會把不同嚴重程度的失敗混在一起。',
    },
    {
      id: 'q-zero-prob', prompt: '第三關的感測模型認為讀數「不可能錯兩列」，所以讀到 1 之後，守衛在列 3、4 的機率立刻變成 0。若真實的感測器偶爾會錯兩列，下列何者正確？',
      options: [
        '濾波器會過度自信：只要讀到 1，列 3、4 就被判為不可能，下路的被抓機率可能被低估；應給每種讀錯一個小的正機率，並用真實紀錄驗證感測模型',
        '沒有影響，因為下一回合的預測會把機率補回列 3、4，結果和正確的模型一樣',
        '把讀對的機率從 3/5 提高到 4/5 就能解決，因為感測器越準越好',
        '改用 minimax 就不需要感測器，也就沒有這個問題',
      ],
      answer: 0, explanation: '貝氏更新（AIF14）把先驗乘上概似：概似是 0 的狀態，後驗一定是 0。模型若錯把可能的事設成 0，濾波器（AIF16）就會過度自信，選路的期望效用也跟著失真；做法類似 AIF14 的 Laplace 平滑，再用紀錄檢查，這是 AIF19 的可靠性。「預測會補回」錯：預測確實會移一些機率過去，但下一次讀到 1 又把它乘成 0，和正確模型不同；「提高讀對的機率」讓模型更自信，問題更嚴重；「改用 minimax」錯：它把守衛當成最佳對手，過度保守，而且沒有修正模型錯誤。',
    },
  ],
};
