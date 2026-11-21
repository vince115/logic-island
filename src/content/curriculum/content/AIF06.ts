import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF06 區域搜尋與最佳化. Python only (python-code, standard library). Every example and the reference solution run in
 * the curriculum code tests; their outputs were produced by running the programs. Randomness is random.Random(seed)
 * over fixed seed lists, and the examples print aggregates only, so every output is deterministic.
 *
 * The trace runs TRACE_CODE below: deterministic steepest descent on 8 queens from all queens on row 0, moving the
 * queen whose move gives the smallest h (ties: lowest column, then lowest row) until no neighbour is better.
 * hillSteps() applies the same rule (rows[c] is the row of the queen in column c; h counts attacking pairs: same row
 * or same diagonal, blocked or not), so every board, table and variable comes from actually running it. The lesson's
 * test runs TRACE_CODE in Python and checks it prints the last step's output (h 28 21 15 10 6 3 1).
 */
const TRACE_CODE = code`N = 8
rows = [0] * N                      # rows[c]：第 c 行的皇后在第幾列

def h(rows):
    return sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
               for i in range(N) for j in range(i + 1, N))

seq = [h(rows)]
while True:
    best = None
    for c in range(N):
        for r in range(N):
            if r != rows[c]:
                v = h(rows[:c] + [r] + rows[c + 1:])
                if best is None or v < best[0]:
                    best = (v, c, r)
    if best[0] >= seq[-1]:
        break                           # 沒有鄰居比較好：停在這裡
    rows[best[1]] = best[2]
    seq.append(best[0])
print("h", *seq)
print("rows", *rows)`;

const N = 8;
const lineOf = (text: string) => TRACE_CODE.split('\n').findIndex(l => l.includes(text)) + 1;
const attacks = (rows: number[]) => {
  let n = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[i] === rows[j] || Math.abs(rows[i] - rows[j]) === j - i) n++;
  return n;
};
const attackPairs = (rows: number[]) => {
  const pairs: [number, number][] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (rows[i] === rows[j] || Math.abs(rows[i] - rows[j]) === j - i) pairs.push([i, j]);
  return pairs;
};

function hillSteps(): TraceStep[] {
  const rows = Array<number>(N).fill(0);
  const seq = [attacks(rows)];
  const board = () => Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => (rows[c] === r ? 'Q' : '.')));
  const state = (marks: { at: number; kind: Mark }[] = []) => ({ name: 'rows（第 c 格是第 c 行皇后的列）', cells: rows.map(String), marks });
  /** Each column's best move (lowest row on a tie), as the program's double loop meets them. */
  const perColumn = () => rows.map((cur, c) => {
    let best: [number, number] | null = null;
    for (let r = 0; r < N; r++) if (r !== cur) {
      const v = attacks(rows.map((x, i) => (i === c ? r : x)));
      if (!best || v < best[0]) best = [v, r];
    }
    return { c, cur, v: best![0], r: best![1] };
  });
  const table = (cols: ReturnType<typeof perColumn>, chosen: number | null) => ({
    name: '每一行最好的移動（同分取較小的列）', head: ['行 c', '目前列', '最好的新列', '移動後 h'],
    rows: cols.map(x => [String(x.c), String(x.cur), String(x.r), String(x.v)]),
    marks: chosen === null ? cols.map((_, row) => ({ row, col: 3, kind: 'read' as Mark })) : [{ row: chosen, kind: 'found' as Mark }],
  });
  const steps: TraceStep[] = [
    { line: lineOf('rows = [0] * N'), note: '一行放一個皇后，狀態就是長度 8 的串列 rows：rows[c] 是第 c 行（直的）皇后所在的列（橫的）。起點把 8 個皇后都放在第 0 列。這是完整狀態的表示法：每個狀態都是一個完整的擺法，搜尋只是一直修改它。',
      vars: { N: '8', rows: `[${rows.join(', ')}]` }, arrays: [state(), { name: '棋盤（列 r × 行 c）', cells: board() }] },
    { line: lineOf('seq = [h(rows)]'), note: `h 是互相攻擊的皇后對數。8 個皇后都在同一列，任兩個都互相攻擊，所以 h = C(8, 2) = ${seq[0]}，這是 h 可能的最大值。目標是讓 h 降到 0。`,
      vars: { rows: `[${rows.join(', ')}]`, seq: `[${seq.join(', ')}]` }, arrays: [state(), { name: '棋盤（列 r × 行 c）', cells: board() }] },
  ];
  for (;;) {
    const cols = perColumn();
    const best = cols.reduce((a, b) => (b.v < a.v ? b : a));
    const ties = cols.reduce((n, x) => n + Array.from({ length: N }, (_, r) => r).filter(r => r !== x.cur && attacks(rows.map((y, i) => (i === x.c ? r : y))) === best.v).length, 0);
    const cur = seq[seq.length - 1];
    if (best.v >= cur) {
      const pairs = attackPairs(rows);
      const attacked = new Set(pairs.flat());
      steps.push({ line: lineOf('break'), note: `56 個鄰居裡最好的也只有 h = ${best.v}，不比目前的 h = ${cur} 小，迴圈 break。這是區域最小：還剩${pairs.map(([a, b]) => `第 ${a} 行與第 ${b} 行`).join('、')}的皇后互相攻擊（都在第 ${rows[pairs[0][0]]} 列），但移動任何一個皇后都不會讓 h 變小。56 個鄰居裡有 ${ties} 個移動同樣是 h = ${best.v}：它們是「橫移」，允許橫移的版本可以繼續走下去，最陡下降則停在這裡。`,
        vars: { best: `(${best.v}, ${best.c}, ${best.r})`, seq: `[${seq.join(', ')}]` },
        arrays: [state([...attacked].sort((a, b) => a - b).map(at => ({ at, kind: 'bad' as Mark }))),
          { name: '棋盤（列 r × 行 c）', cells: board(), marks: [...attacked].sort((a, b) => a - b).map(c => ({ at: [rows[c], c] as [number, number], kind: 'bad' as Mark })) }],
        table: table(cols, null) });
      break;
    }
    const from = rows[best.c];
    rows[best.c] = best.r;
    seq.push(best.v);
    const k = seq.length - 1;
    const why = ties > 1 ? `共有 ${ties} 個移動都能讓 h 變成 ${best.v}，依規則取行最小、再取列最小的那個` : `只有這一個移動能讓 h 變成 ${best.v}`;
    let note = `第 ${k} 步：試過 56 個鄰居（8 行 × 每行 7 個新位置），最小的 h 是 ${best.v}；${why}：把第 ${best.c} 行的皇后從第 ${from} 列移到第 ${best.r} 列。h 從 ${cur} 降到 ${best.v}。`;
    if (k === 1) note += `注意第 0 行自己最好的移動只到 h = ${cols[0].v}：規則比較的是整個鄰域的 h，行編號只用來打破同分。`;
    steps.push({ line: lineOf('rows[best[1]] = best[2]'), note,
      vars: { best: `(${best.v}, ${best.c}, ${best.r})`, rows: `[${rows.join(', ')}]`, seq: `[${seq.join(', ')}]` },
      arrays: [state([{ at: best.c, kind: 'write' }]), { name: '棋盤（列 r × 行 c）', cells: board(), marks: [{ at: [best.r, best.c], kind: 'write' }, { at: [from, best.c], kind: 'removed' }] }],
      table: table(cols, best.c) });
  }
  steps.push({ line: lineOf('print("rows"'), note: `輸出 h 的序列與最後的狀態。每一步 h 都嚴格變小（${seq.join(' → ')}），但終點不是解：從「全部在第 0 列」出發的最陡下降，在 h = ${seq[seq.length - 1]} 的區域最小卡住。換一個起點、允許橫移或隨機重啟，才有機會到達 h = 0。`,
    vars: { seq: `[${seq.join(', ')}]`, rows: `[${rows.join(', ')}]` }, output: `h ${seq.join(' ')}\nrows ${rows.join(' ')}`,
    arrays: [state(), { name: '棋盤（列 r × 行 c）', cells: board() }] });
  return steps;
}

/** AIF06 區域搜尋與最佳化. Every example and the reference solution run in Python (standard library only). */
export const AIF06: LessonContent = {
  lessonId: 'AIF06',
  motivation: '排課表時，沒有人在乎排課系統是用什麼順序試出這張表，只在乎最後的表有沒有衝堂、老師是不是一天上太多節；晶片佈線、工廠排程、在棋盤上放 8 個互不攻擊的皇后也一樣：要的是一個好的「最終狀態」，不是一條路徑。AIF04 與 AIF05 的搜尋要記住整個邊界與每條路徑，狀態空間一大，記憶體就先用完。區域搜尋反過來，只記得「目前這一個狀態」，每次往附近更好的狀態移動一步，記憶體幾乎是常數，幾百萬甚至無限大的狀態空間也能處理。代價是可能卡在「附近最好、但不是全世界最好」的地方。本課從目標函數地形談起，用 Python 實作爬山法、隨機重啟、模擬退火與基因演算法，用固定的亂數種子在 8 皇后上實際量出它們的成功率與步數。',
  sections: [
    {
      id: 'local-search', title: '區域搜尋：只記得目前的狀態',
      blocks: [
        { type: 'p', text: 'AIF04 的 BFS、UCS 與 AIF05 的 A* 是系統化搜尋：它們保存一個邊界（frontier），最後回傳一條從起點到目標的路徑，而且在有解時保證找得到。可是很多問題的答案就是一個狀態，路徑本身沒有意義：8 皇后要的是一個擺法，課表要的是一張表。這類問題常寫成最佳化問題（optimization problem）：每個狀態有一個目標函數（objective function）的值，要找讓它最大（或最小）的狀態。' },
        { type: 'p', text: '區域搜尋（local search）採用完整狀態的表示法（complete-state formulation）：每個狀態都是一個完整的候選答案，只是可能不好；搜尋就是反覆把目前的狀態改一點點。以 N 皇后為例，每一行（直的）放一個皇后，狀態寫成串列 `rows`，`rows[c]` 是第 c 行皇后所在的列（橫的）。把某一行的皇后移到同一行的另一列，就得到一個鄰居（neighbor）；8 皇后的每個狀態有 8 × 7 = 56 個鄰居，總共有 8^8 = 16,777,216 個狀態。' },
        { type: 'table', head: ['', '系統化搜尋（BFS、UCS、A*）', '區域搜尋（爬山法、模擬退火、基因演算法）'], rows: [
          ['記住什麼', '整個邊界、已探索集合與每個節點的 parent', '目前的狀態（基因演算法是一個族群）'],
          ['記憶體', '隨搜尋過的節點數成長，可能是指數級', '常數（或族群大小）'],
          ['回傳', '從起點到目標的路徑', '一個狀態，只有目標函數值'],
          ['完備性', '有限狀態空間中有解就找得到', '不保證；可能卡在區域最佳'],
          ['適合', '路徑本身就是答案：導航、解謎的步驟', '只要最終狀態：排程、佈線、N 皇后、參數調整'],
        ] },
        { type: 'p', text: '本課 N 皇后的目標函數是 h：互相攻擊的皇后對數，同一列或同一條斜線就算攻擊，中間隔著別的皇后也算。h = 0 就是解，所以要讓 h 最小。「找最大值」與「找最小值」是同一件事：把 h 變號就是最大化 −h。書上多用「爬山」描述最大化，本課程式碼直接最小化 h，也就是往山谷走。' },
        { type: 'callout', tone: 'note', title: '和梯度下降的關係', text: '狀態是連續的數值（例如機器學習模型的參數）時，鄰居有無限多個，沒辦法一一試。這時改用目標函數的梯度（gradient）告訴我們哪個方向下降最快，沿著它走一小步，這就是梯度下降（gradient descent），是爬山法在連續空間的版本，之後的機器學習課程會用到。' },
      ],
    },
    {
      id: 'landscape', title: '目標函數地形：區域最大、高原與山脊',
      blocks: [
        { type: 'p', text: '把每個狀態想成地圖上的一個位置、目標函數值想成那裡的海拔，就得到目標函數地形（state-space landscape）。爬山法只看得到腳邊的地形：周圍沒有更高的地方就停下來。停下的地方可能是下面幾種之一：' },
        { type: 'table', head: ['地形', '意思', '最陡上升會怎樣'], rows: [
          ['全域最大（global maximum）', '整個地形最高的狀態', '這是我們要的答案'],
          ['區域最大（local maximum）', '比所有鄰居都高，但不是全域最高', '停下來，誤以為找到了'],
          ['平頂的區域最大（flat local maximum）', '一片高度相同的平地，四周都比它低', '找不到上坡就停；橫移也走不出去'],
          ['肩部（shoulder）', '平地的另一邊還有上坡', '不橫移就停；允許橫移可以走過去繼續爬'],
          ['山脊（ridge）', '一串彼此不相鄰的區域最大，沿著它的方向其實是上坡', '每個鄰居都比較低，只能停在一個一個的峰上'],
        ] },
        { type: 'p', text: '高原（plateau）是平頂的區域最大與肩部的統稱。下面用一維的地形示範：狀態是 0～14 的整數，鄰居是左右兩格，`f` 是海拔。程式從每個起點各跑一次最陡上升，比較不准橫移與最多連續橫移 3 次兩種版本，並把終點分成 global、local 與 flat（停在一片平地上）。' },
        { type: 'example', id: 'e-landscape' },
        { type: 'p', text: '讀輸出：起點 0～3 都爬到 x = 2 的區域最大（f = 6），全域最大在 x = 13（f = 9）。x = 5～7 是平頂的區域最大，兩側都比 4 低，橫移只是在平地上來回，走不出去。x = 9～11 是肩部：從 8～10 出發、不橫移時會停在平地上，允許橫移就能走到 x = 12 再爬上 13。所以只有 4 個起點能找到全域最大，允許橫移後變成 7 個。山脊在一維看不到：二維時，峰頂可能沿著斜的方向排成一列，但每次只能沿著座標軸移動一格，於是每一步都是下坡。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：「爬山法停下來就是找到最好的答案」', text: '爬山法停下來只代表「附近沒有更好的鄰居」，也就是區域最佳（local optimum），不代表全域最佳。上面的地形有 11 個起點停在不是全域最大的地方，程式完全沒有錯。另一個陷阱是橫移：在平頂的區域最大上無限制地橫移，程式會在平地上來回永遠不停，所以一定要設上限（例如連續 100 次），並且一般只在沒有上坡時才橫移。' },
      ],
    },
    {
      id: 'hill-climbing', title: '爬山法：最陡上升與 8 皇后',
      blocks: [
        { type: 'p', text: '最陡上升爬山法（steepest-ascent hill climbing）是最基本的區域搜尋。以最小化 h 來寫，就是最陡下降：' },
        { type: 'list', ordered: true, items: [
          '從一個完整狀態出發，算出它的 h。',
          '產生所有鄰居並算出每個鄰居的 h。',
          '如果最好的鄰居比目前好（h 更小），就移過去，回到第 2 步。',
          '否則停下，回傳目前的狀態：它是區域最佳，可能是解，也可能不是。',
        ] },
        { type: 'p', text: '視覺化用確定的規則跑一次：從 8 個皇后都在第 0 列出發（h = 28），每步移動讓 h 最小的皇后，同分時取行最小、再取列最小。h 依序是 28、21、15、10、6、3、1，6 步後停在 h = 1：第 2 行與第 6 行的皇后都在第 0 列，但移動任何一個皇后都不會讓 h 變小。表格列出每一行最好的移動，可以看到整個鄰域的比較。' },
        { type: 'p', text: '下面的程式從 50 個固定種子產生的隨機起點各跑一次最陡下降。同分的鄰居用 `rng.choice` 隨機挑，所以不會總是往同一個方向偏。第一輪不准橫移，第二輪允許最多連續 100 次橫移（h 相同的移動）。' },
        { type: 'example', id: 'e-steepest' },
        { type: 'p', text: '不准橫移時只解出 7/50（14%），但很快：成功平均 4.0 步、卡住平均 3.2 步。允許橫移後解出 47/50（94%），成功平均 21.0 步。8 皇后的地形有很多高原，橫移讓搜尋走得過去。教科書 Russell 與 Norvig 的《Artificial Intelligence: A Modern Approach》也報告過 8 皇后上約 14% 與 94% 的成功率；這裡只有 50 個種子，數字會有抽樣誤差，卡住的情況只有 3 次，平均步數尤其不穩。' },
        { type: 'table', head: ['變形', '怎麼選下一步', '特點'], rows: [
          ['最陡上升（steepest ascent）', '看全部鄰居，取最好的', '每步成本是鄰居數；8 皇后每步 56 次評估'],
          ['隨機爬山（stochastic hill climbing）', '在所有更好的鄰居中隨機挑一個', '通常收斂較慢，但有時找到較好的解'],
          ['首選爬山（first-choice hill climbing）', '隨機產生鄰居，遇到第一個更好的就走', '鄰居非常多（成千上萬）時很實用'],
          ['允許橫移（sideways moves）', '沒有上坡時也接受一樣好的鄰居，有次數上限', '能越過肩部與高原'],
          ['隨機重啟（random restart）', '卡住就從新的隨機狀態重新爬', '見下一段；成功機率趨近 1'],
        ] },
      ],
    },
    {
      id: 'restart-and-beam', title: '隨機重啟與區域束搜尋',
      blocks: [
        { type: 'p', text: '既然一次爬山只有 p 的機率成功，就多爬幾次。隨機重啟爬山法（random-restart hill climbing）一直從新的隨機起點重新爬，直到找到解。每次成功機率是 p 時，需要的爬山次數平均是 1/p：8 皇后不橫移時 p 約 0.14，平均約 7 次。只要 p > 0，重啟的次數夠多，找到解的機率就趨近 1。下面每個種子都一直重啟到解出為止，統計爬山次數與總步數。' },
        { type: 'example', id: 'e-restart' },
        { type: 'p', text: '50 個種子平均爬 6.50 次、總共 21.42 步就找到解，和 1/0.14 ≈ 7.1 的估計接近；最倒楣的種子爬了 35 次。每一步要評估 56 個鄰居，所以只算移動的步數，平均就至少要評估 21.42 × 56 ≈ 1,200 次 h。' },
        { type: 'p', text: '區域束搜尋（local beam search）同時保留 k 個狀態：每一輪產生這 k 個狀態的全部鄰居，從所有鄰居中挑出最好的 k 個成為下一輪，有任何一個是解就停。它和「k 次獨立的隨機重啟」不同：好的狀態產生的鄰居會擠掉差的，資訊在 k 個狀態之間流動，搜尋會集中到有希望的區域。缺點是 k 個狀態可能很快擠在同一個小區域，失去多樣性；隨機束搜尋（stochastic beam search）改成依好壞的機率挑選 k 個鄰居，保留一些較差但不同的狀態，這個想法也通往後面的基因演算法。' },
        { type: 'table', head: ['方法', '同時保留', '跳出區域最佳的方法'], rows: [
          ['隨機重啟', '1 個狀態（加上目前最好的紀錄）', '整個丟掉，從新的隨機起點重爬'],
          ['區域束搜尋', 'k 個狀態', '多個起點並行，好的區域吸引更多名額'],
          ['隨機束搜尋', 'k 個狀態', '依機率挑選，保留一點多樣性'],
        ] },
      ],
    },
    {
      id: 'simulated-annealing', title: '模擬退火：有時候接受變差的移動',
      blocks: [
        { type: 'p', text: '爬山法從不往下走，所以會卡住；純粹的隨機漫步則永遠不收斂。模擬退火（simulated annealing）介於兩者之間，名稱來自冶金的退火：把金屬加熱後慢慢冷卻，原子有機會跳出不穩定的排列，最後形成能量較低的結晶。Kirkpatrick、Gelatt 與 Vecchi 在 1983 年把這個想法用在組合最佳化問題上。演算法每一步：' },
        { type: 'list', ordered: true, items: [
          '隨機挑一個鄰居，算出改變量 Δ（本課定義 Δ = 目前的 h − 鄰居的 h，Δ > 0 代表變好）。',
          'Δ > 0 就一定移過去。',
          'Δ ≤ 0 時，以機率 exp(Δ/T) 移過去；T 是目前的溫度。',
          '依溫度排程（schedule）降低 T，例如每步 T = t0 × α^步數，再回到第 1 步。',
        ] },
        { type: 'p', text: '接受機率 exp(Δ/T) 有兩個性質：變差得越多（Δ 越負）越不容易接受；溫度越高越容易接受。T 很高時幾乎什麼都接受，像隨機漫步；T 趨近 0 時只接受不變差的移動，就變成隨機爬山。注意 Δ = 0 時 exp(0) = 1，一樣好的鄰居一定接受，這等於免費的橫移。理論上，如果 T 降得夠慢，模擬退火找到全域最佳的機率趨近 1，但那樣的排程慢到不實用，實務上只能在時間與品質之間取捨。' },
        { type: 'example', id: 'e-annealing' },
        { type: 'table', head: ['Δ', 'T = 2.0', 'T = 1.0', 'T = 0.5'], rows: [
          ['−1', '0.607', '0.368', '0.135'],
          ['−2', '0.368', '0.135', '0.018'],
          ['−3', '0.223', '0.050', '0.002'],
        ] },
        { type: 'p', text: '上限 3000 步、50 個種子：溫度固定在 2.0（α = 1.0）只解出 9/50，太熱了，好不容易降低的 h 又被接受的壞移動推高。α = 0.999 降溫很慢，50/50 全部解出，但平均要 1642.7 步；α = 0.99 解出 48/50，平均 746.0 步；α = 0.9 大約 100 步後溫度就接近 0，之後等於「接受橫移的隨機爬山」，解出 49/50。在 8 皇后上主要的障礙是高原而不是很深的區域最小，所以快速降溫也表現不錯；50 個種子差 1、2 個在抽樣誤差之內。' },
        { type: 'callout', tone: 'warning', title: '比較步數前先問：一步要做多少事', text: '爬山法的一步要評估全部 56 個鄰居，模擬退火的一步只評估 1 個隨機鄰居。允許橫移的爬山法成功平均 21.0 步，約是 21.0 × 56 = 1,176 次評估；α = 0.99 的模擬退火平均 746.0 步，就是 746 次左右的評估。直接拿 21 步和 746 步比，會得出完全錯誤的結論。比較演算法時要用相同的成本單位，例如目標函數的評估次數或執行時間，並寫清楚成功率是在多少次實驗、多少步上限下量的。' },
      ],
    },
    {
      id: 'genetic', title: '基因演算法：選擇、交配與突變',
      blocks: [
        { type: 'p', text: '基因演算法（genetic algorithm, GA）一次維護一個族群（population），每個個體是一個狀態，這裡就是 8 皇后的 `rows`，可以想成長度 8 的「染色體」。John Holland 在 1975 年的著作《Adaptation in Natural and Artificial Systems》系統化地提出這套方法。每一代依序做：' },
        { type: 'list', ordered: true, items: [
          '適應度（fitness）：替每個個體打分數，越大越好。本課用不互相攻擊的皇后對數 28 − h，28 就是解。',
          '選擇（selection）：適應度越高越容易被選為父母。本課用 3 取 1 的錦標賽（tournament）：隨機抽 3 個，取最好的。另一種常見做法是依適應度比例抽選（roulette wheel）。',
          '交配（crossover）：從兩個父母各取一段接成子代。本課用單點交配：隨機切在第 cut 行，前段來自 x、後段來自 y。',
          '突變（mutation）：以小機率隨機改動子代的一個位置，這裡是把某一行的皇后移到隨機的列。',
          '菁英保留（elitism）：把這一代最好的個體直接放進下一代，最好的答案不會在交配中遺失。',
        ] },
        { type: 'example', id: 'e-genetic' },
        { type: 'p', text: '突變機率 0.1 時，20 個種子只解出 6 個；提高到 0.8 解出 14 個。錦標賽選擇加上菁英保留讓族群很快變得相似，這時交配只是把相似的片段換來換去，產生不出新東西；突變把新的列帶進族群，維持多樣性。交配有用的前提是表示法讓「好的片段」有意義：前幾行已經互不攻擊的一段，接上另一個父母後段互不攻擊的一段，有機會得到更好的子代。' },
        { type: 'p', text: '整理四種方法在本課 8 皇后實驗上的結果（都是固定種子、固定上限下的實測，不是一般性的排名）：' },
        { type: 'table', head: ['方法', '成功率', '成本（成功時平均）', '保留的狀態'], rows: [
          ['最陡下降，不橫移', '7/50', '4.0 步，每步 56 次評估', '1'],
          ['最陡下降，最多 100 次橫移', '47/50', '21.0 步，每步 56 次評估', '1'],
          ['隨機重啟（不橫移）', '50/50', '6.50 次爬山、21.42 步', '1'],
          ['模擬退火 t0 = 2.0、α = 0.99', '48/50', '746.0 步，每步 1 次評估', '1'],
          ['基因演算法，突變 0.8', '14/20', '34.5 代，每代 40 個個體', '40'],
        ] },
        { type: 'callout', tone: 'tip', title: '什麼時候選區域搜尋', text: '答案只是一個狀態、路徑不重要；狀態空間太大放不進記憶體；而且「夠好」的解就可以接受，或者能檢查一個狀態是不是解（像 h = 0）時，區域搜尋很合適。如果需要最短路徑、需要證明無解，或者一定要保證最佳，就回到 AIF04、AIF05 的系統化搜尋。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-landscape', title: '一維地形上的最陡上升與橫移',
      description: '從每個起點各爬一次，比較不准橫移與最多連續橫移 3 次的終點：區域最大、平地或全域最大。',
      code: { Python: code`f = [1, 3, 6, 4, 2, 4, 4, 4, 3, 5, 5, 5, 7, 9, 6]   # 目標函數，要找最大值

def climb(x, limit):
    """最陡上升；limit 是最多連續橫移幾次（0 = 不准橫移）。"""
    seen, sideways = {x}, 0
    while True:
        nbrs = [y for y in (x + 1, x - 1) if 0 <= y < len(f)]
        up = [y for y in nbrs if f[y] > f[x]]
        flat = [y for y in nbrs if f[y] == f[x] and y not in seen]
        if up:
            x, sideways = max(up, key=lambda y: f[y]), 0
        elif flat and sideways < limit:
            x, sideways = flat[0], sideways + 1
        else:
            return x
        seen.add(x)

def kind(x):
    if f[x] == max(f):
        return "global"
    if any(0 <= y < len(f) and f[y] == f[x] for y in (x - 1, x + 1)):
        return "flat"
    return "local"

wins = [0, 0]
print("start | no sideways | sideways <= 3")
for s in range(len(f)):
    ends = [climb(s, 0), climb(s, 3)]
    for i, x in enumerate(ends):
        wins[i] += kind(x) == "global"
    print(f"{s:>5} | x={ends[0]:<2} {kind(ends[0]):<6} | x={ends[1]:<2} {kind(ends[1])}")
print("reach the global max:", wins[0], "vs", wins[1], "of", len(f))` },
      output: `start | no sideways | sideways <= 3
    0 | x=2  local  | x=2  local
    1 | x=2  local  | x=2  local
    2 | x=2  local  | x=2  local
    3 | x=2  local  | x=2  local
    4 | x=5  flat   | x=7  flat
    5 | x=5  flat   | x=7  flat
    6 | x=6  flat   | x=7  flat
    7 | x=7  flat   | x=5  flat
    8 | x=9  flat   | x=13 global
    9 | x=9  flat   | x=13 global
   10 | x=10 flat   | x=13 global
   11 | x=13 global | x=13 global
   12 | x=13 global | x=13 global
   13 | x=13 global | x=13 global
   14 | x=13 global | x=13 global
reach the global max: 4 vs 7 of 15`,
    },
    {
      id: 'e-steepest', title: '8 皇后的最陡下降：不橫移與允許橫移',
      description: '50 個固定種子各產生一個隨機起點；統計解出的比例，以及成功與卡住時的平均步數。',
      code: { Python: code`import random

N = 8

def h(rows):
    """互相攻擊的皇后對數：同列或同一條斜線（中間隔著別的皇后也算）。"""
    return sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
               for i in range(N) for j in range(i + 1, N))

def hill_climb(rows, rng, max_sideways):
    """最陡下降：每步看全部 56 個鄰居，走到 h 最小的一個（同分隨機選）。"""
    steps = sideways = 0
    while (cur := h(rows)) > 0:
        moves = [(h(rows[:c] + [r] + rows[c + 1:]), c, r)
                 for c in range(N) for r in range(N) if r != rows[c]]
        best = min(m[0] for m in moves)
        if best > cur or (best == cur and sideways == max_sideways):
            break                               # 區域最小，或橫移次數用完
        sideways = sideways + 1 if best == cur else 0
        _, c, r = rng.choice([m for m in moves if m[0] == best])
        rows[c] = r
        steps += 1
    return h(rows) == 0, steps

for limit in (0, 100):
    steps = {True: [], False: []}
    for seed in range(50):                      # 固定的 50 個種子
        rng = random.Random(seed)
        ok, used = hill_climb([rng.randrange(N) for _ in range(N)], rng, limit)
        steps[ok].append(used)
    avg = {k: f"{sum(v) / len(v):.1f}" if v else "-" for k, v in steps.items()}
    print(f"sideways <= {limit}: solved {len(steps[True])}/50, avg steps "
          f"{avg[True]} when solved, {avg[False]} when stuck")` },
      output: `sideways <= 0: solved 7/50, avg steps 4.0 when solved, 3.2 when stuck
sideways <= 100: solved 47/50, avg steps 21.0 when solved, 36.7 when stuck`,
    },
    {
      id: 'e-restart', title: '隨機重啟：卡住就重新開始',
      description: '每個種子一直從新的隨機起點重新爬山（不橫移），直到解出；統計爬山次數與總步數。',
      code: { Python: code`import random

N = 8

def h(rows):
    return sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
               for i in range(N) for j in range(i + 1, N))

def steepest(rows, rng):
    """不橫移的最陡下降，回傳停下的狀態與步數。"""
    steps = 0
    while True:
        moves = [(h(rows[:c] + [r] + rows[c + 1:]), c, r)
                 for c in range(N) for r in range(N) if r != rows[c]]
        best = min(m[0] for m in moves)
        if best >= h(rows):
            return rows, steps
        _, c, r = rng.choice([m for m in moves if m[0] == best])
        rows[c], steps = r, steps + 1

climbs, total = [], []
for seed in range(50):
    rng = random.Random(seed)
    tries = steps = 0
    while True:                                 # 卡住就從新的隨機狀態重來
        tries += 1
        rows, used = steepest([rng.randrange(N) for _ in range(N)], rng)
        steps += used
        if h(rows) == 0:
            break
    climbs.append(tries)
    total.append(steps)
    if seed < 3:
        print(f"seed {seed}: {tries} climbs, {steps} steps, solution {rows}")
print(f"solved {len(climbs)}/50")
print(f"climbs: avg {sum(climbs) / 50:.2f}, max {max(climbs)}")
print(f"steps:  avg {sum(total) / 50:.2f}, max {max(total)}")` },
      output: `seed 0: 1 climbs, 5 steps, solution [6, 2, 0, 5, 7, 4, 1, 3]
seed 1: 2 climbs, 8 steps, solution [4, 6, 0, 2, 7, 5, 3, 1]
seed 2: 9 climbs, 29 steps, solution [5, 1, 6, 0, 3, 7, 4, 2]
solved 50/50
climbs: avg 6.50, max 35
steps:  avg 21.42, max 103`,
    },
    {
      id: 'e-annealing', title: '模擬退火：接受機率與降溫速度',
      description: '先印出 exp(Δ/T) 的接受機率，再用四種溫度排程在 50 個固定種子上解 8 皇后，上限 3000 步。',
      code: { Python: code`import math
import random

N = 8

def h(rows):
    return sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
               for i in range(N) for j in range(i + 1, N))

def anneal(rng, t0, alpha, max_steps=3000):
    rows = [rng.randrange(N) for _ in range(N)]
    cur = h(rows)
    for step in range(max_steps):
        if cur == 0:
            return step
        T = t0 * alpha ** step                  # 溫度排程：每步乘上 alpha
        c, r = rng.randrange(N), rng.randrange(N - 1)
        nxt = rows[:c] + [r if r < rows[c] else r + 1] + rows[c + 1:]
        delta = cur - h(nxt)                    # > 0：h 變小，是變好的移動
        if delta > 0 or rng.random() < math.exp(delta / T):
            rows, cur = nxt, cur - delta
    return None                                 # 步數用完仍未解出

print("P(accept) = exp(delta / T)")
for T in (2.0, 1.0, 0.5):
    print(f"T = {T}:", ", ".join(f"delta {d} -> {math.exp(d / T):.3f}" for d in (-1, -2, -3)))
for t0, alpha in ((2.0, 1.0), (2.0, 0.999), (2.0, 0.99), (2.0, 0.9)):
    runs = [anneal(random.Random(seed), t0, alpha) for seed in range(50)]
    done = [s for s in runs if s is not None]
    print(f"t0 {t0}, alpha {alpha}: solved {len(done)}/50, "
          f"avg steps {sum(done) / len(done):.1f}")` },
      output: `P(accept) = exp(delta / T)
T = 2.0: delta -1 -> 0.607, delta -2 -> 0.368, delta -3 -> 0.223
T = 1.0: delta -1 -> 0.368, delta -2 -> 0.135, delta -3 -> 0.050
T = 0.5: delta -1 -> 0.135, delta -2 -> 0.018, delta -3 -> 0.002
t0 2.0, alpha 1.0: solved 9/50, avg steps 1313.3
t0 2.0, alpha 0.999: solved 50/50, avg steps 1642.7
t0 2.0, alpha 0.99: solved 48/50, avg steps 746.0
t0 2.0, alpha 0.9: solved 49/50, avg steps 699.9`,
    },
    {
      id: 'e-genetic', title: '基因演算法解 8 皇后：突變率的影響',
      description: '族群 40、最多 300 代，3 取 1 錦標賽選擇、單點交配、菁英保留；比較突變機率 0.1 與 0.8 在 20 個種子上的結果。',
      code: { Python: code`import random

N, PAIRS = 8, 28                                # 8 個皇后共有 C(8, 2) = 28 對

def fitness(rows):
    """不互相攻擊的皇后對數；等於 28 就是解。"""
    return PAIRS - sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
                       for i in range(N) for j in range(i + 1, N))

def evolve(rng, mutation, size=40, generations=300):
    pop = [[rng.randrange(N) for _ in range(N)] for _ in range(size)]
    for gen in range(generations):
        scored = sorted(((fitness(p), p) for p in pop), reverse=True)
        if scored[0][0] == PAIRS:
            return gen, scored[0][1]
        pick = lambda: max(rng.sample(scored, 3))[1]  # 選擇：3 取 1 的錦標賽
        pop = [scored[0][1]]                    # 菁英：最好的個體直接留下
        while len(pop) < size:
            x, y = pick(), pick()
            cut = rng.randrange(1, N)           # 交配：單點切開再接起來
            child = x[:cut] + y[cut:]
            if rng.random() < mutation:         # 突變：隨機改一個皇后的列
                child[rng.randrange(N)] = rng.randrange(N)
            pop.append(child)
    return None, None

gen, best = evolve(random.Random(4), 0.8)
print("seed 4, mutation 0.8: solved at generation", gen, best)
for mutation in (0.1, 0.8):
    runs = [evolve(random.Random(seed), mutation)[0] for seed in range(20)]
    done = [g for g in runs if g is not None]
    print(f"mutation {mutation}: solved {len(done)}/20, "
          f"avg generations {sum(done) / len(done):.1f}")` },
      output: `seed 4, mutation 0.8: solved at generation 29 [6, 2, 7, 1, 4, 0, 5, 3]
mutation 0.1: solved 6/20, avg generations 27.7
mutation 0.8: solved 14/20, avg generations 34.5`,
    },
  ],
  visualization: {
    kind: 'array-index', title: '8 皇后的最陡下降：從全部在第 0 列到區域最小', language: 'Python',
    code: TRACE_CODE,
    steps: hillSteps(),
  },
  quiz: [
    {
      id: 'q1', prompt: '下列哪一個問題最適合用區域搜尋，而不是 AIF04、AIF05 的系統化搜尋？',
      options: ['導航：找出從車站到機場、總距離最短的行車路線', '證明某個 3 × 3 拼圖的起始盤面不可能解開', '替 300 堂課排出沒有衝堂的課表，只要最後的表符合條件', '列出迷宮從入口到出口的每一步走法'],
      answer: 2, explanation: '排課表只在乎最後那張表是否符合條件，路徑沒有意義，狀態空間又極大，正是區域搜尋擅長的：只保留目前的表並反覆修改。最短行車路線與迷宮的每一步走法，答案本身就是路徑；證明無解需要完備性，區域搜尋停下來不代表無解，這三個都該用系統化搜尋。',
    },
    {
      id: 'q2', prompt: '4 皇后的狀態是 rows = [0, 2, 0, 3]（rows[c] 是第 c 行皇后的列）。下面的程式輸出什麼？',
      code: { language: 'Python', text: 'rows = [0, 2, 0, 3]\nn = len(rows)\nprint(sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i\n          for i in range(n) for j in range(i + 1, n)))' },
      options: ['2', '1', '3', '0'],
      answer: 0, explanation: '逐對檢查 6 對：第 0、2 行都在第 0 列，同列攻擊；第 0、3 行列差 3、行差 3，在同一條斜線上；其餘 4 對列差與行差都不相等也不同列，所以 h = 2。答 1 是只算到同列、漏了斜線；答 3 是把第 1、3 行（列差 1、行差 2）誤算成斜線；答 0 是以為沒有攻擊，但同列的那一對就已經互相攻擊。',
    },
    {
      id: 'q3', prompt: '本課模擬退火的程式碼寫成 `if delta > 0 or rng.random() < math.exp(delta / T):`。當鄰居和目前狀態一樣好（delta = 0）時會怎樣？',
      options: ['一定拒絕，因為 delta > 0 不成立', '以機率 exp(−1/T) 接受', '只有在 T 大於 1 時才接受', '一定接受，因為 exp(0) = 1，而 rng.random() 一定小於 1'],
      answer: 3, explanation: 'delta = 0 時第二個條件是 rng.random() < exp(0) = 1，而 random() 回傳 [0, 1) 的數，永遠成立，所以一定接受，相當於免費的橫移。說一定拒絕的忽略了 or 後半；exp(−1/T) 是 delta = −1 的機率，不是 delta = 0；exp(0) = 1 與 T 無關，所以也不是只有 T > 1 才接受。',
    },
    {
      id: 'q4', prompt: '一維地形 f = [1, 3, 6, 4, 2, …] 上，從 x = 0 做最陡上升停在 x = 2（f = 6），但全域最大是 f = 9。下列哪個說法正確？',
      options: ['程式一定有錯，正確的爬山法一定會找到 f = 9', 'x = 2 是區域最大：兩個鄰居都比較低，最陡上升只看鄰居，所以停下', 'x = 2 是肩部，只要允許橫移就能走到 f = 9', 'x = 2 是山脊，因為它是一維的'],
      answer: 1, explanation: 'x = 2 的鄰居 f = 3 與 f = 4 都比 6 低，它是區域最大。爬山法只看鄰居、不回頭，停在這裡是正常行為，不是程式錯誤。肩部是一片平地且另一側還有上坡，x = 2 兩側都是下坡，沒有一樣高的鄰居可以橫移；山脊是多維地形上的現象，一維看不到。',
    },
    {
      id: 'q5', prompt: '某個爬山法從隨機起點出發，每次成功的機率約為 p = 0.14，每次互相獨立。使用隨機重啟直到成功，平均大約要爬幾次？',
      options: ['1 次', '約 7 次', '14 次', '86 次'],
      answer: 1, explanation: '每次成功機率是 p 時，直到第一次成功所需的次數平均是 1/p = 1/0.14 ≈ 7.1，本課 50 個種子實測平均 6.50 次。1 次只在 p = 1 時成立；14 是把百分比直接當成次數；86 是失敗的百分比，也不是次數。',
    },
    {
      id: 'q6', prompt: '本課的基因演算法把突變機率從 0.1 提高到 0.8，20 個種子中解出的數量從 6 變成 14。最合理的解釋是什麼？',
      options: ['突變越多，適應度的計算就越準確', '突變取代了交配，交配在 8 皇后上沒有作用', '錦標賽選擇加上菁英保留讓族群很快變得相似，突變把新的列帶進族群，維持多樣性', '突變率越高越好，設成 1.0 一定能全部解出'],
      answer: 2, explanation: '選擇壓力讓族群收斂成相似的個體後，交配只是在交換相似的片段；突變帶進族群裡沒有的值，讓搜尋還能探索。突變不會改變適應度的計算方式；程式仍然每個子代都做交配，突變是補充而不是取代；突變過多會讓子代接近隨機狀態、破壞好的片段，所以「越高越好、一定全解」沒有根據。',
    },
    {
      id: 'q7', prompt: '區域束搜尋保留 k 個狀態，和「同時跑 k 次獨立的隨機重啟爬山」相比，關鍵差別是什麼？',
      options: ['區域束搜尋從所有 k 個狀態的鄰居中一起挑最好的 k 個，好的區域會得到更多名額', '區域束搜尋保證找到全域最佳', '區域束搜尋只需要 1 個狀態的記憶體', '兩者完全相同，只是名稱不同'],
      answer: 0, explanation: '區域束搜尋每一輪把 k 個狀態的全部鄰居放在一起比較，只留下最好的 k 個，所以有希望的狀態可以佔掉多個名額，資訊在 k 個之間流動；k 次獨立重啟則互不影響。它仍是區域搜尋，不保證全域最佳，也可能擠在同一區失去多樣性；它要保留 k 個狀態，不是 1 個；所以「完全相同」也不對。',
    },
    {
      id: 'q8', prompt: '本課的模擬退火把溫度固定在 T = 2.0（α = 1.0、不降溫），3000 步內只解出 9/50。主要原因是什麼？',
      options: ['溫度太低，幾乎不接受變差的移動，所以卡在區域最小', '溫度一直很高，變差的移動常被接受，好不容易降低的 h 又被推高，近似隨機漫步', '3000 步太多，模擬退火會因為步數太多而失敗', '固定溫度時 exp(Δ/T) 永遠等於 1，所以每個移動都接受'],
      answer: 1, explanation: 'T = 2.0 時 Δ = −1 的移動有 0.607 的機率被接受，變差的移動經常發生，搜尋在地形上亂走，很難停在 h = 0。溫度太低是相反的情況；步數上限只限制搜尋多久，不會讓它失敗；固定溫度時 exp(Δ/T) 只有 Δ = 0 才等於 1，Δ < 0 時都小於 1。',
    },
  ],
  exercises: [
    {
      id: 'n-queens-descent', title: '確定規則的 N 皇后最陡下降',
      statement: '在 N × N 的棋盤上，每一行（直的，編號 0 到 N − 1）放一個皇后，狀態以 N 個整數表示：第 c 個數是第 c 行皇后所在的列（橫的，從 0 開始）。h 是互相攻擊的皇后對數：兩個皇后在同一列，或在同一條斜線上（列差的絕對值等於行差）就算攻擊，中間隔著別的皇后也算。從給定的狀態開始，依下面的確定規則做最陡下降：每一步考慮所有「把某一行的皇后移到同一行的另一列」的鄰居，找出 h 最小的那個；同分時取行編號最小的，再同分取列編號最小的。如果這個鄰居的 h 嚴格小於目前的 h，就移過去並重複；否則停下（包含 h 已經是 0 的情況）。輸出 h 的序列、最後的狀態、最後的棋盤，以及停下的原因。',
      inputFormat: '第一個整數 N，接著 N 個整數，第 c 個是第 c 行皇后的列。整數之間以空白或換行分隔（例如第一行 N、第二行 N 個整數）。',
      outputFormat: '第一行 `h` 後接 h 的序列（起點的 h，以及每一步移動後的 h），以空白分隔。第二行 `rows` 後接最後狀態的 N 個整數。接下來 N 行是最後的棋盤，由第 0 列到第 N − 1 列，每行 N 個字元，第 c 個字元是 `Q`（第 c 行的皇后在這一列）或 `.`。最後一行：h = 0 時是 `solution`，否則是 `local minimum`。輸入不合法時只輸出一行 `Invalid`。',
      constraints: [
        '1 ≤ N ≤ 12；所有數字都必須是十進位非負整數（否則輸出 Invalid）',
        '剛好 N 個列編號，每個在 0 到 N − 1 之間（太多、太少或超出範圍都輸出 Invalid）',
        'h 每一步嚴格變小，所以最多移動 C(N, 2) 次',
      ],
      samples: [{ kind: 'normal', input: '8\n5 2 2 5 6 2 2 2\n', output: 'h 13 8 6 5 4 3 2 1 0\nrows 4 1 3 5 7 2 0 6\n......Q.\n.Q......\n.....Q..\n..Q.....\nQ.......\n...Q....\n.......Q\n....Q...\nsolution\n', note: '8 步把 h 從 13 降到 0，找到一組 8 皇后的解' }],
      tests: [
        { kind: 'normal', input: '8\n0 0 0 0 0 0 0 0\n', output: 'h 28 21 15 10 6 3 1\nrows 1 7 0 6 3 5 0 4\n..Q...Q.\nQ.......\n........\n....Q...\n.......Q\n.....Q..\n...Q....\n.Q......\nlocal minimum\n', note: '與視覺化相同：從全部在第 0 列出發，6 步後卡在 h = 1；第一步有 12 個同分的移動，要取第 1 行第 7 列' },
        { kind: 'normal', input: '8\n2 3 2 5 0 1 2 3\n', output: 'h 17 11 6 4 3 2 1\nrows 0 4 0 5 3 1 7 2\nQ.Q.....\n.....Q..\n.......Q\n....Q...\n.Q......\n...Q....\n........\n......Q.\nlocal minimum\n', note: '隨機起點，卡在 h = 1：第 0 行與第 2 行的皇后同在第 0 列' },
        { kind: 'normal', input: '6\n0 0 0 0 0 0\n', output: 'h 15 10 6 3 1\nrows 1 5 2 0 3 0\n...Q.Q\nQ.....\n..Q...\n....Q.\n......\n.Q....\nlocal minimum\n', note: 'N = 6 全部在第 0 列：h = C(6, 2) = 15，最後卡在 h = 1；同分規則寫錯（先比列、或取最後一個）會得到不同的結果' },
        { kind: 'normal', input: '10\n3 3 7 0 9 9 1 4 4 2\n', output: 'h 7 4 2 1\nrows 6 3 7 0 4 9 1 8 4 2\n...Q......\n......Q...\n.........Q\n.Q........\n....Q...Q.\n..........\nQ.........\n..Q.......\n.......Q..\n.....Q....\nlocal minimum\n', note: 'N = 10 的隨機起點：3 步後卡在 h = 1；行編號取最大的寫法會走到別的狀態' },
        { kind: 'normal', input: '7\n6 5 4 3 2 1 0\n', output: 'h 21 16 11 7 3 2\nrows 1 6 6 3 2 0 5\n.....Q.\nQ......\n....Q..\n...Q...\n.......\n......Q\n.QQ....\nlocal minimum\n', note: '7 個皇后都在同一條反斜線上（h = 21），最後卡在 h = 2' },
        { kind: 'edge', input: '1\n0\n', output: 'h 0\nrows 0\nQ\nsolution\n', note: 'N = 1：沒有任何鄰居，起點 h = 0 就是解' },
        { kind: 'edge', input: '2\n0 0\n', output: 'h 1\nrows 0 0\nQQ\n..\nlocal minimum\n', note: 'N = 2 無解：每個鄰居的 h 也是 1，不比目前小，一步都不走' },
        { kind: 'edge', input: '3\n0 0 0\n', output: 'h 3 1\nrows 0 2 0\nQ.Q\n...\n.Q.\nlocal minimum\n', note: 'N = 3 也無解：一步降到 h = 1 後停下' },
        { kind: 'edge', input: '4\n0 0 0 0\n', output: 'h 6 3 1 0\nrows 1 3 0 2\n..Q.\nQ...\n...Q\n.Q..\nsolution\n', note: 'N = 4 全部在第 0 列，3 步就找到解' },
        { kind: 'edge', input: '8\n0 4 7 5 2 6 1 3\n', output: 'h 0\nrows 0 4 7 5 2 6 1 3\nQ.......\n......Q.\n....Q...\n.......Q\n.Q......\n...Q....\n.....Q..\n..Q.....\nsolution\n', note: '起點已經是解：h 序列只有 0，不移動' },
        { kind: 'edge', input: `12\n${Array(12).fill('0').join(' ')}\n`, output: 'h 66 55 45 36 28 21 15 10 6 4 2\nrows 1 11 8 10 4 9 3 0 7 11 6 0\n.......Q...Q\nQ...........\n............\n......Q.....\n....Q.......\n............\n..........Q.\n........Q...\n..Q.........\n.....Q......\n...Q........\n.Q.......Q..\nlocal minimum\n', note: '最大的 N = 12：h = C(12, 2) = 66，10 步後卡在 h = 2' },
        { kind: 'edge', input: '5\n0 0\n0 0 0\n', output: 'h 10 6 3 1\nrows 1 4 0 3 0\n..Q.Q\nQ....\n.....\n...Q.\n.Q...\nlocal minimum\n', note: '列編號分在兩行輸入：整數之間的換行和空白一樣' },
        { kind: 'error', input: '0\n', output: 'Invalid\n', note: 'N = 0 不在 1～12 之間' },
        { kind: 'error', input: `13\n${Array(13).fill('0').join(' ')}\n`, output: 'Invalid\n', note: 'N = 13 超過上限 12' },
        { kind: 'error', input: '3\n0 1\n', output: 'Invalid\n', note: '只有 2 個列編號，少於 N = 3' },
        { kind: 'error', input: '3\n0 1 2 0\n', output: 'Invalid\n', note: '有 4 個列編號，多於 N = 3' },
        { kind: 'error', input: '3\n0 1 3\n', output: 'Invalid\n', note: '列編號 3 超出 0～2' },
        { kind: 'error', input: '3\n0 -1 2\n', output: 'Invalid\n', note: '負的列編號' },
        { kind: 'error', input: '3\n0 a 2\n', output: 'Invalid\n', note: '列編號不是整數' },
        { kind: 'error', input: '3\n0 1.5 2\n', output: 'Invalid\n', note: '列編號是小數' },
        { kind: 'error', input: '', output: 'Invalid\n', note: '完全沒有輸入' },
      ],
      hints: [
        '先把輸入讀成 token（`sys.stdin.read().split()`），檢查第一個是 1～12 的整數、token 數剛好是 N + 1，每個列編號都在 0～N − 1；任何一項不合法就只印 `Invalid`。',
        '寫一個 `attacks(rows)` 逐對計算 h；鄰居用 `rows[:c] + [r] + rows[c + 1:]` 產生，不要直接改 `rows` 再忘了改回來。',
        '同分規則可以用「外層迴圈跑行 c、內層跑列 r，只在 h 嚴格更小時更新最佳」自然做到：先遇到的就是行最小、列最小的那個。',
        '停止條件是最好的鄰居 h ≥ 目前的 h。寫成 > 的話，遇到一樣好的鄰居會一直橫移，可能永遠不停。N = 1 沒有任何鄰居，要先處理。',
      ],
      solution: { Python: code`import sys

def attacks(rows):
    n = len(rows)
    return sum(rows[i] == rows[j] or abs(rows[i] - rows[j]) == j - i
               for i in range(n) for j in range(i + 1, n))

def number(token, low, high):
    if not (token.isascii() and token.isdigit()) or not low <= int(token) <= high:
        raise ValueError(token)
    return int(token)

def read_state(tokens):
    n = number(tokens[0], 1, 12)
    if len(tokens) != n + 1:
        raise ValueError("token count")
    return [number(t, 0, n - 1) for t in tokens[1:]]

def best_move(rows):
    """h 最小的移動；同分取較小的行，再取較小的列。沒有鄰居時回傳 None。"""
    best = None
    for c in range(len(rows)):
        for r in range(len(rows)):
            if r != rows[c]:
                v = attacks(rows[:c] + [r] + rows[c + 1:])
                if best is None or v < best[0]:
                    best = (v, c, r)
    return best

def main():
    try:
        rows = read_state(sys.stdin.read().split())
    except (ValueError, IndexError):
        print("Invalid")
        return
    seq = [attacks(rows)]
    while seq[-1] > 0:
        move = best_move(rows)
        if move is None or move[0] >= seq[-1]:
            break                               # 沒有鄰居更好：區域最小
        rows[move[1]] = move[2]
        seq.append(move[0])
    print("h", *seq)
    print("rows", *rows)
    for r in range(len(rows)):
        print("".join("Q" if rows[c] == r else "." for c in range(len(rows))))
    print("solution" if seq[-1] == 0 else "local minimum")

main()` },
      judge: 'none',
    },
  ],
};
