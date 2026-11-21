import type { LessonContent, Mark, TraceStep, TreeNode } from '../schema';

const code = String.raw;

/**
 * AIF08 Alpha-Beta 剪枝與遊戲 AI. Python only (python-code). Every example and the reference solution run in the
 * curriculum code tests; their outputs were produced by running the programs.
 *
 * The visualization's tree: MAX at the root A, MIN at B and C, MAX at D–G, eight leaves. Alpha-beta evaluates 5 6 7 3 2,
 * cuts the leaf 4 under E (β cutoff at a MAX node) and the whole subtree G = [0, 1] under C (α cutoff at a MIN node).
 * C returns 3 although its true minimax value is min(3, 1) = 1: a bound, not the value; the root's 6 is exact.
 */
type GameTree = number | GameTree[];
const VIZ_TREE: GameTree = [[[5, 6], [7, 4]], [[3, 2], [0, 1]]];
const VIZ_OUTPUT = 'value 6 evaluated [5, 6, 7, 3, 2] pruned [4, 0, 1]';

/** The trace code (line numbers are referenced by the steps below). */
const VIZ_CODE = code`tree = [[[5, 6], [7, 4]], [[3, 2], [0, 1]]]
evaluated, pruned = [], []

def leaves(node):
    return [node] if isinstance(node, int) else [x for c in node for x in leaves(c)]

def alphabeta(node, alpha, beta, is_max):
    if isinstance(node, int):
        evaluated.append(node)
        return node
    v = float('-inf') if is_max else float('inf')
    for i, child in enumerate(node):
        score = alphabeta(child, alpha, beta, not is_max)
        if is_max:
            v = max(v, score)
            alpha = max(alpha, v)
        else:
            v = min(v, score)
            beta = min(beta, v)
        if alpha >= beta:  # 剪枝條件
            for rest in node[i + 1:]:
                pruned.extend(leaves(rest))
            break
    return v

value = alphabeta(tree, float('-inf'), float('inf'), True)
print('value', value, 'evaluated', evaluated, 'pruned', pruned)`;

interface VizNode { id: string; name: string; isMax: boolean; kids: VizNode[]; leaf?: number }

/**
 * Runs the trace code's alpha-beta on VIZ_TREE step by step. Lines: 26 the first call, 11 a call on an inner node
 * (v starts at ∓inf, alpha and beta come from the caller), 9 a leaf evaluated, 16 / 19 a MAX / MIN node takes a child's
 * score, 22 a cutoff (the rest of the children are pruned), 24 a node returns, 27 the result printed. The whole game
 * tree is drawn from the start; pruned nodes are marked removed. The last step's output is checked against the
 * program's real output (here, and by the lesson test, which runs VIZ_CODE).
 */
const traceSteps: TraceStep[] = (() => {
  let leafCount = 0;
  const build = (t: GameTree, isMax: boolean): VizNode => typeof t === 'number'
    ? { id: `l${++leafCount}`, name: String(t), isMax, kids: [], leaf: t }
    : { id: '', name: '', isMax, kids: t.map(c => build(c, !isMax)) };
  const root = build(VIZ_TREE, true);
  // Inner nodes are named A, B, C, … level by level (breadth first).
  const inner: VizNode[] = [];
  for (let level = [root]; level.length; level = level.flatMap(n => n.kids)) for (const n of level) if (n.leaf === undefined) inner.push(n);
  inner.forEach((n, i) => { n.name = String.fromCharCode(65 + i); n.id = n.name; });
  const all: VizNode[] = [];
  const walk = (n: VizNode) => { all.push(n); n.kids.forEach(walk); };
  walk(root);
  const leavesOf = (n: VizNode): VizNode[] => n.leaf !== undefined ? [n] : n.kids.flatMap(leavesOf);
  const minimax = (n: VizNode): number => n.leaf ?? (n.isMax ? Math.max(...n.kids.map(minimax)) : Math.min(...n.kids.map(minimax)));

  const fmt = (x: number) => x === Infinity ? 'inf' : x === -Infinity ? '-inf' : String(x);
  const list = (xs: number[]) => `[${xs.join(', ')}]`;
  const state = new Map(inner.map(n => [n.id, { alpha: '—', beta: '—', v: '—', status: '未拜訪' }]));
  const done = new Map<string, Mark>();
  const returned = new Map<string, number>();
  const stack: { node: VizNode; vars: Record<string, string> }[] = [];
  const evaluated: number[] = [], pruned: number[] = [];
  const steps: TraceStep[] = [];

  const snap = (line: number, note: string, focus?: VizNode, extra: { leafNow?: VizNode; output?: string; rootFound?: boolean } = {}) => {
    const marks: { id: string; kind: Mark }[] = all.flatMap(n => {
      if (extra.rootFound && n === root) return [{ id: n.id, kind: 'found' as Mark }];
      if (extra.leafNow === n) return [{ id: n.id, kind: 'current' as Mark }];
      const at = stack.findIndex(f => f.node === n);
      if (at >= 0) return [{ id: n.id, kind: (at === stack.length - 1 && !extra.leafNow ? 'current' : 'pending') as Mark }];
      const kind = done.get(n.id);
      return kind ? [{ id: n.id, kind }] : [];
    });
    const nodes: TreeNode[] = all.map(n => ({ id: n.id, label: n.leaf !== undefined ? n.name : returned.has(n.id) ? `${n.name}=${returned.get(n.id)}` : n.name, children: n.kids.map(k => k.id) }));
    const frames = stack.map(f => ({ name: `alphabeta(${f.node.name})`, vars: { ...f.vars } }));
    if (extra.leafNow) frames.push({ name: `alphabeta(${extra.leafNow.name})`, vars: { node: extra.leafNow.name } });
    steps.push({
      line, note,
      vars: { evaluated: list(evaluated), pruned: list(pruned) },
      tree: { name: '遊戲樹（A 是 MAX，B、C 是 MIN，D–G 是 MAX；「=」後面是回傳值）', nodes, roots: [root.id], marks },
      table: { name: '每個內部節點的 α、β 與 v', head: ['節點', '層', 'α (alpha)', 'β (beta)', 'v', '狀態'],
        rows: inner.map(n => { const s = state.get(n.id)!; return [n.name, n.isMax ? 'MAX' : 'MIN', s.alpha, s.beta, s.v, s.status]; }),
        marks: focus && focus.leaf === undefined ? [{ row: inner.indexOf(focus), kind: 'current' }] : [] },
      frames,
      ...extra.output !== undefined ? { output: extra.output } : {},
    });
  };

  const run = (n: VizNode, alphaIn: number, betaIn: number, parent?: VizNode): number => {
    let alpha = alphaIn, beta = betaIn;
    if (n.leaf !== undefined) {
      evaluated.push(n.leaf);
      snap(9, `評估葉子 ${n.leaf}（傳進來的 α = ${fmt(alpha)}、β = ${fmt(beta)}，葉子不用它們），加進 evaluated，回傳給 ${parent!.name}。`, parent, { leafNow: n });
      done.set(n.id, 'visited');
      return n.leaf;
    }
    let v = n.isMax ? -Infinity : Infinity;
    const s = state.get(n.id)!;
    const sync = () => { Object.assign(s, { alpha: fmt(alpha), beta: fmt(beta), v: fmt(v) }); stack.at(-1)!.vars = { alpha: fmt(alpha), beta: fmt(beta), v: fmt(v), is_max: n.isMax ? 'True' : 'False' }; };
    stack.push({ node: n, vars: {} });
    s.status = '執行中';
    sync();
    snap(11, parent
      ? `進入 ${n.name}（${n.isMax ? 'MAX' : 'MIN'}）：α = ${fmt(alpha)}、β = ${fmt(beta)} 從 ${parent.name} 傳下來，v 從 ${n.isMax ? '-inf' : 'inf'} 開始。${n.isMax ? 'MAX 節點只會提高 α' : 'MIN 節點只會降低 β'}。`
      : '進入根節點 A（MAX）：α = -inf、β = inf，還沒有任何保證。v 從 -inf 開始，之後每看完一個子節點就取較大的值。', n);
    for (const [i, child] of n.kids.entries()) {
      const score = run(child, alpha, beta, n);
      const before = n.isMax ? alpha : beta;
      if (n.isMax) { v = Math.max(v, score); alpha = Math.max(alpha, v); } else { v = Math.min(v, score); beta = Math.min(beta, v); }
      sync();
      const which = n.isMax ? 'α' : 'β', now = n.isMax ? alpha : beta;
      snap(n.isMax ? 16 : 19, `${n.name} 收到${child.leaf !== undefined ? '葉子' : `子節點 ${child.name} 的值`} ${score}：v = ${fmt(v)}，${which} = ${n.isMax ? 'max' : 'min'}(${fmt(before)}, ${fmt(v)}) = ${fmt(now)}。`
        + (alpha >= beta ? '' : `α = ${fmt(alpha)} < β = ${fmt(beta)}，還不能剪枝${i + 1 < n.kids.length ? '，繼續看下一個子節點' : ''}。`), n);
      if (alpha >= beta) {
        const rest = n.kids.slice(i + 1);
        const cut = rest.flatMap(leavesOf);
        pruned.push(...cut.map(l => l.leaf!));
        for (const r of rest) { const mark = (m: VizNode) => { done.set(m.id, 'removed'); if (m.leaf === undefined) state.get(m.id)!.status = '剪枝'; m.kids.forEach(mark); }; mark(r); }
        const whole = rest.some(r => r.leaf === undefined) ? `整棵子樹 ${rest.filter(r => r.leaf === undefined).map(r => r.name).join('、')}（葉子 ${cut.map(l => l.leaf).join('、')}）` : `葉子 ${cut.map(l => l.leaf).join('、')}`;
        const why = n.isMax
          ? `${n.name} 已經能拿到至少 ${fmt(v)}，但路徑上的 MIN 節點已經有不超過 β = ${fmt(beta)} 的選擇，不會讓對局走進 ${n.name}`
          : `${n.name} 最多只給 ${fmt(v)}，但路徑上的 MAX 節點已經保證能拿到 α = ${fmt(alpha)}，不會選 ${n.name}`;
        snap(22, rest.length ? `α = ${fmt(alpha)} ≥ β = ${fmt(beta)}，剪枝：${why}。不必再評估剩下的${whole}：放進 pruned，然後 break。`
          : `α = ${fmt(alpha)} ≥ β = ${fmt(beta)}，但這已是最後一個子節點，沒有可以剪掉的。`, n);
        break;
      }
    }
    stack.pop();
    s.status = '已回傳';
    done.set(n.id, 'visited');
    returned.set(n.id, v);
    const truth = minimax(n);
    snap(24, `${n.name} 回傳 ${fmt(v)} 給${parent ? ` ${parent.name}` : '主程式'}。` + (truth !== v
      ? n.isMax
        ? `注意：${n.name} 真正的 minimax 值是 ${truth}（被剪掉的子樹裡有更大的值），回傳的 ${fmt(v)} 只是下限：${n.name} 的值 ≥ ${fmt(v)} ≥ β，上面的 MIN 不會選它，所以根的值不受影響。`
        : `注意：${n.name} 真正的 minimax 值是 ${truth}（被剪掉的子樹裡有更小的值），回傳的 ${fmt(v)} 只是上限：${n.name} 的值 ≤ ${fmt(v)} ≤ α，上面的 MAX 不會選它，所以根的值不受影響。`
      : ''), parent ?? n);
    return v;
  };

  snap(26, '呼叫 alphabeta(tree, -inf, inf, True)：根節點是 MAX。整棵遊戲樹先畫出來；被剪枝的節點會標成「已移除」，它們的葉子不會被評估。');
  const value = run(root, -Infinity, Infinity);
  const output = `value ${value} evaluated ${list(evaluated)} pruned ${list(pruned)}`;
  if (output !== VIZ_OUTPUT) throw new Error(`AIF08: the trace ends with ${output}, the program prints ${VIZ_OUTPUT}`);
  if (value !== minimax(root)) throw new Error('AIF08: alpha-beta and minimax disagree on the trace tree');
  snap(27, `印出結果：根的值 ${value}，和不剪枝的 minimax 相同（max(min(6, 7), min(3, 1)) = max(6, 1) = 6）。8 片葉子只評估了 ${evaluated.length} 片，剪掉 ${pruned.length} 片：E 底下的 4（β 剪枝），以及 C 底下整棵 G（α 剪枝）。`,
    undefined, { output, rootFound: true });
  return steps;
})();

/** The exercise's 1,001-leaf input (one leaf over the limit). */
const TOO_MANY = `[${Array.from({ length: 1001 }, () => '0').join(',')}]`;
const TOO_DEEP = `${'['.repeat(11)}1${']'.repeat(11)}`;
const DEEPEST = `${'['.repeat(10)}1${']'.repeat(10)}`;

export const AIF08: LessonContent = {
  lessonId: 'AIF08',
  motivation: '上一課（AIF07）的 minimax 會把遊戲樹整棵走完：分支因子 b、深度 d 時要評估 b^d 片葉子。西洋棋每個局面平均約有 35 種合法走法，只往前看 10 步（雙方各 5 步）就有 35^10 ≈ 2.8 × 10^15 個局面，再快的電腦也算不完。Alpha-beta 剪枝根據一個簡單的觀察：只要已經確定某個分支不會被選，就不必算出它的確切值。它算出的值與 minimax 完全相同，在走法排序得好時，只需要看大約 b^(d/2) 個節點，同樣的時間可以看兩倍深。1997 年擊敗世界棋王 Kasparov 的 IBM Deep Blue，核心就是 alpha-beta 搜尋加上專用硬體。這一課還會處理 minimax 不擅長的兩種遊戲：有骰子的遊戲（加上機率節點的 expectiminimax），以及分支多到難以寫出評估函數的遊戲（圍棋，靠蒙地卡羅樹搜尋，2016 年 AlphaGo 就是把它和神經網路結合）。學完後，你能在 minimax 程式中加入剪枝，並量測不同的行動排序能省下多少節點。',
  sections: [
    {
      id: 'alpha-beta', title: 'alpha 與 beta：已經保證的下限與上限',
      blocks: [
        { type: 'p', text: 'Alpha-beta 搜尋在 minimax 的遞迴上多帶兩個數。α（alpha）是「從根走到目前節點的路徑上，MAX 已經確定拿得到的最好值」，是 MAX 的下限；β（beta）是「同一條路徑上，MIN 已經確定能把結果壓到的最低值」，是 MIN 的上限。一開始什麼都不知道，α = −∞、β = +∞。只有落在 α 與 β 之間的值，才可能影響根節點的決定。' },
        { type: 'p', text: 'MAX 節點每看完一個子節點，就用它的值提高 α；MIN 節點則用子節點的值降低 β。一旦 α ≥ β，代表這個節點不可能被選到：對 MAX 節點來說，它已經拿得到 ≥ β 的值，但上面某個 MIN 節點手上已有 ≤ β 的選擇，不會讓對局走到這裡；對 MIN 節點來說，它最多只給 ≤ α，而上面某個 MAX 節點已經保證拿得到 α。這時剩下的子節點都不必看，這就是剪枝（pruning）。' },
        { type: 'table', head: ['節點', '更新什麼', '剪枝條件', '名稱與直覺'], rows: [
          ['MAX', 'v = max(v, 子節點值)，α = max(α, v)', 'α ≥ β（等同 v ≥ β）', 'β 剪枝：MIN 祖先不會讓 MAX 拿到這麼多'],
          ['MIN', 'v = min(v, 子節點值)，β = min(β, v)', 'α ≥ β（等同 v ≤ α）', 'α 剪枝：MAX 祖先已有更好的選擇'],
          ['葉子', '不更新，直接回傳效用值', '—', '只有葉子需要「評估」，剪枝省下的就是這些評估'],
        ] },
        { type: 'p', text: '程式只比 minimax 多兩個參數和一個 if：alpha 與 beta 以參數往下傳給子節點，每個呼叫有自己的一份，在迴圈裡依子節點的回傳值更新，條件成立就 break。下面的範例用同一棵隨機產生的樹（b = 3、d = 4，共 121 個節點），分別跑 minimax 與 alpha-beta，計數器 count 記錄拜訪的節點數。' },
        { type: 'example', id: 'e-count' },
        { type: 'p', text: '兩者算出的值都是 −8，alpha-beta 只拜訪 72 個節點，省下 49 個（約 40%）。這棵樹的子節點是隨機順序；下一節會看到，順序排得好時省下的比例會高得多，而且樹越深越明顯。' },
        { type: 'callout', tone: 'warning', title: 'alpha、beta 只能往下傳，不能做成全域變數', text: '常見的錯誤是把 alpha、beta 寫成全域變數或物件的欄位，讓子節點的更新「漏回」父節點或兄弟節點。α 與 β 描述的是「從根到這個節點的這一條路徑」上的保證；換到另一個分支，路徑變了，保證也不同。共用變數會拿別的分支的界限去剪不該剪的節點，算出錯誤的值。用參數傳遞，每個呼叫有自己的 alpha、beta，子節點改的是自己的副本，回到父節點時自然恢復。' },
      ],
    },
    {
      id: 'trace', title: '追蹤一棵樹：哪些分支被剪掉、值為什麼不變',
      blocks: [
        { type: 'p', text: '下方的視覺化逐步執行一棵三層的小樹：根 A 是 MAX，B、C 是 MIN，D、E、F、G 是 MAX，葉子由左到右是 5 6 | 7 4 | 3 2 | 0 1。表格列出每個內部節點目前的 α、β 與 v，呼叫堆疊顯示正在執行的每一層各自的 alpha、beta；被剪掉的節點標成「已移除」。' },
        { type: 'list', ordered: true, items: [
          'D 看完 5、6，回傳 6。B 是 MIN，β = 6：B 的值不會超過 6。',
          'E 從 B 拿到 α = −∞、β = 6。E 看到 7，α = 7 ≥ β = 6：B 已經有 6 可選，不會讓對局走進值至少 7 的 E，所以 E 的另一片葉子 4 不必看（β 剪枝）。',
          'B 回傳 min(6, 7) = 6，根 A 的 α = 6：MAX 至少拿得到 6。',
          'C 從 A 拿到 α = 6、β = +∞。F 看完 3、2，回傳 3；C 的 β = 3 ≤ α = 6：C 最多只給 3，A 已經有 6，不會選 C，整棵子樹 G（葉子 0、1）不必看（α 剪枝）。',
          'A 回傳 max(6, 3) = 6。8 片葉子只評估了 5 片。',
        ] },
        { type: 'table', head: ['剪枝位置', '條件', '剪掉的葉子', '原因'], rows: [
          ['E（MAX）', 'α = 7 ≥ β = 6', '4', 'MIN 節點 B 已有 6，E 的值至少 7，B 不會選 E'],
          ['C（MIN）', 'α = 6 ≥ β = 3', '0、1（整棵 G）', 'MAX 節點 A 已有 6，C 的值至多 3，A 不會選 C'],
        ] },
        { type: 'p', text: '為什麼根的值不變？被剪掉的子樹只能改變「某個不會被選的節點」的值：E 的值無論是多少都 ≥ 7，B 取最小值時一定選 D 的 6；C 的值無論是多少都 ≤ 3，A 取最大值時一定選 B 的 6。更精確地說：呼叫 alphabeta(n, α, β) 時，若 n 真正的 minimax 值落在 α 與 β 之間，回傳的就是它；若 ≤ α，回傳某個 ≤ α 的上限；若 ≥ β，回傳某個 ≥ β 的下限。根節點以 (−∞, +∞) 呼叫，所以一定拿到真正的值，選出的走法和 minimax 一樣好。' },
        { type: 'callout', tone: 'warning', title: '被剪枝的節點回傳的不是它真正的 minimax 值', text: '視覺化中 C 回傳 3，但 C 真正的 minimax 值是 min(3, max(0, 1)) = 1。3 只是「C ≤ 3」的上限，因為 3 已經 ≤ α = 6，A 不會選 C，確切值無關緊要。只有根節點的值（以及根選的走法）保證正確；把中間節點的回傳值當成精確的評估（例如直接存進表格重複使用、或顯示為某一步的分數）就會出錯。轉置表（transposition table）存這類值時，要一併記下它是精確值、上限還是下限。' },
      ],
    },
    {
      id: 'ordering', title: '行動排序：最好 O(b^(d/2))，最壞 O(b^d)',
      blocks: [
        { type: 'p', text: '剪枝的多寡取決於子節點被檢查的順序。如果每個節點都先看最好的子節點（MAX 先看值最大的、MIN 先看值最小的），α、β 很早就收緊，後面的兄弟幾乎都被剪掉。Knuth 與 Moore 在 1975 年的分析指出：均勻的遊戲樹在完美排序下，alpha-beta 恰好評估 b^⌈d/2⌉ + b^⌊d/2⌋ − 1 片葉子，也就是 O(b^(d/2))，有效分支因子從 b 降到 √b。反過來，若總是先看最差的子節點，幾乎沒有剪枝，仍接近 O(b^d)。Russell 與 Norvig 的教科書指出，隨機順序時大約是 O(b^(3d/4))。' },
        { type: 'example', id: 'e-ordering' },
        { type: 'table', head: ['深度 d', '葉子總數 3^d', '最佳排序', '隨機順序', '反向排序', '公式 3^⌈d/2⌉ + 3^⌊d/2⌋ − 1'], rows: [
          ['2', '9', '5', '8', '9', '5'],
          ['4', '81', '17', '36', '79', '17'],
          ['6', '729', '53', '292', '686', '53'],
        ] },
        { type: 'p', text: '最佳排序的計數與公式完全吻合；d = 6 時只評估 729 片中的 53 片，不到 1/13。反向排序（每個節點都先看最差的子節點）幾乎沒有剪枝：81 片評估了 79 片。它不是剛好 81，因為較深的節點仍會被祖先傳下來的 α、β 剪掉。最佳排序省下的是指數：同樣評估 b^(d/2) 片葉子，minimax 只能看 d/2 層，alpha-beta 可以看 d 層，也就是同樣時間看兩倍深。' },
        { type: 'p', text: '範例中的「最佳排序」先用 minimax 算出真正的值再排序，只是為了量測上限；實際下棋時不可能事先知道。常用的近似做法：先試吃子、將軍等強制走法；殺手走法（killer move），也就是在同一層的其他分支造成過剪枝的走法；迭代加深（iterative deepening），先做淺層搜尋，用它的結果排序下一輪較深的搜尋；以及用轉置表記住上一次在這個局面找到的最佳走法。' },
        { type: 'callout', tone: 'note', title: '等號也可以剪', text: '剪枝條件是 α ≥ β，含等號。對 [[5, 9], [5, 1]]：左邊的 MIN 節點值是 5，α = 5；右邊的 MIN 節點第一片葉子就是 5，β = 5 = α，剩下的 1 不必看。右邊的值頂多是 5，不可能讓根超過 5，所以根的值仍是正確的 5。只用 α > β 也對，只是剪得比較少。' },
      ],
    },
    {
      id: 'expectiminimax', title: '機率節點：expectiminimax',
      blocks: [
        { type: 'p', text: '西洋雙陸棋（backgammon）每一步之前要擲骰子，玩家只能從骰子允許的走法中選。遊戲樹因此多了一種節點：機率節點（chance node），它的子節點是各種擲骰結果，每條邊有一個機率。expectiminimax 保留 MAX 與 MIN 的規則，機率節點取期望值：value = Σ P(結果) × value(子節點)。沒有機率節點時，它就是 minimax。' },
        { type: 'table', head: ['節點', '值', '誰決定'], rows: [
          ['MAX', '子節點的最大值', '我方選擇'],
          ['MIN', '子節點的最小值', '對手選擇'],
          ['機率節點', 'Σ P(r) × 子節點的值', '擲骰、抽牌等隨機事件'],
          ['葉子', '效用值或評估函數', '終局或深度限制'],
        ] },
        { type: 'p', text: '代價是樹更大：若每次擲骰有 n 種不同結果，深度 m 的 expectiminimax 是 O(b^m n^m)。雙陸棋擲兩顆骰子有 21 種不同結果（相同點數的組合只算一種），每種結果下又約有 20 種走法，往前看 3 層就很吃力。alpha-beta 也能用在機率節點上，但要事先知道效用值的上下限，才能在看完全部擲骰結果之前算出期望值的界限。下面的範例用 fractions 計算精確的期望值，避免浮點數捨入。' },
        { type: 'example', id: 'e-expecti' },
        { type: 'p', text: '原本的評分下 a1 的期望值 21/10 大於 a2 的 13/10，選 a1。把每個值改成 10x + 5（正的線性轉換）後，期望值變成 26 與 18，仍選 a1。但只保持大小順序、把 4、5 放大成 40、50（1 < 2 < 3 < 40 < 50 的順序不變）之後，a2 偶爾拿到的 40 把它的期望值拉到 49/10，決定反過來了。' },
        { type: 'callout', tone: 'warning', title: '只保持大小順序的評估函數，遇到機率節點就不夠', text: '在確定性遊戲中，評估函數的確切數字不重要，只要大小順序不變，minimax 與 alpha-beta 選的走法就不變。很多人把這個結論直接搬到有骰子的遊戲，這是錯的：期望值會把數字相乘相加，只有正的線性轉換 a·x + b（a > 0）保證決定不變。所以 expectiminimax 的評估函數必須和「期望的收益」成正比，例如從這個局面獲勝的機率，而不只是排名。' },
      ],
    },
    {
      id: 'mcts', title: '蒙地卡羅樹搜尋（MCTS）與 UCB1',
      blocks: [
        { type: 'p', text: '圍棋的分支因子約 250，而且局面的好壞很難寫成評估函數，深度限制的 alpha-beta 效果不好。蒙地卡羅樹搜尋（Monte Carlo tree search，MCTS）換一個思路：不評估局面，而是從局面開始隨機下到終局很多次，用勝率估計它的價值；搜尋樹也不是固定深度，而是往看起來有希望的方向長得比較深。每一次迭代有四個步驟：' },
        { type: 'list', ordered: true, items: [
          '選擇（selection）：從根開始，在「子節點都已展開」的節點上，用 UCB1 挑一個子節點往下走，直到碰到還有未嘗試走法的節點或終局。',
          '擴展（expansion）：在那個節點加上一個新的子節點（一個還沒試過的走法）。',
          '模擬（simulation，又稱 playout 或 rollout）：從新節點開始，雙方隨機走到終局，得到勝負。',
          '回傳（backpropagation）：沿著剛才的路徑往上，每個節點的拜訪次數加 1，並依「走到這個節點的那一方」是否獲勝更新勝場數。',
        ] },
        { type: 'p', text: '選擇時用的 UCB1 公式是 UCB1(i) = w_i / n_i + c × √(ln N / n_i)，其中 w_i、n_i 是子節點 i 的勝場與拜訪次數，N 是父節點的拜訪次數，c 常取 √2。第一項是利用（exploitation）：勝率高的走法多試；第二項是探索（exploration）：試得少的走法這一項大，不會被永遠冷落。UCB1 由 Auer、Cesa-Bianchi 與 Fischer 在 2002 年提出，2006 年 Kocsis 與 Szepesvári 把它用在樹上（UCT），同年 Coulom 提出 Monte Carlo tree search 這個名稱。' },
        { type: 'example', id: 'e-mcts' },
        { type: 'p', text: '範例的遊戲是取石子：一堆 7 顆，輪流拿 1–3 顆，拿到最後一顆的人贏。剩 4 的倍數時輪到的人必輸，所以正確的第一步是拿 3 顆，留下 4 顆。1000 次迭代後，拿 3 顆被拜訪 928 次，另外兩步只有 38 與 34 次：UCB1 很快發現它的勝率高，把大部分的模擬都花在它上面。最後選拜訪次數最多的走法，比選勝率最高的更穩定，因為拜訪少的節點勝率誤差大。隨機數用固定種子 random.Random(42)，結果才能重現。' },
        { type: 'callout', tone: 'note', title: 'MCTS 隨時可以停', text: 'MCTS 是隨時可停的演算法（anytime algorithm）：時間到了就停，用目前的拜訪次數做決定；給的時間越多，估計越準。2016 年 3 月，DeepMind 的 AlphaGo 以 4 比 1 擊敗李世乭，它的搜尋就是 MCTS，只是用策略網路引導選擇、用價值網路加上學來的快速模擬策略評估新節點，而不是均勻隨機地下到終局。' },
      ],
    },
    {
      id: 'compare', title: '選擇遊戲 AI 的方法',
      blocks: [
        { type: 'p', text: '這幾種方法解決的是同一件事：在對手會反制的情況下選一步。差別在遊戲有沒有隨機性、分支多不多、能不能寫出好的評估函數。下表整理它們的適用情況與代價。' },
        { type: 'table', head: ['方法', '適用的遊戲', '需要什麼', '代價'], rows: [
          ['minimax（AIF07）', '確定性、完全資訊、樹夠小', '效用值或評估函數', 'O(b^d)'],
          ['alpha-beta 剪枝', '同上，但要看得更深', '評估函數，最好再加上行動排序', '最好 O(b^(d/2))，值與 minimax 相同'],
          ['expectiminimax', '有骰子、抽牌等機率事件', '機率，以及與期望收益成正比的評估', 'O(b^m n^m)'],
          ['MCTS', '分支很多、難寫評估函數（圍棋）', '能快速模擬到終局', '迭代次數越多越準，結果是統計估計'],
        ] },
        { type: 'p', text: '實務上的西洋棋程式多半是「深度限制的 alpha-beta + 評估函數 + 行動排序 + 迭代加深」：迭代加深讓每一輪都能用上一輪的最佳走法排序，時間到了就回傳最後一輪的結果。量測剪枝效果的方式很直接：數評估了幾片葉子，和 b^d 以及 b^⌈d/2⌉ + b^⌊d/2⌋ − 1 比較；本課的練習就是這樣做，把每一片被評估與被剪掉的葉子都列出來。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-count', title: '同一棵樹：minimax 與 alpha-beta 的節點數',
      description: '以固定種子產生 b = 3、d = 4 的遊戲樹（葉子是 −20 到 20 的整數），兩種搜尋都從 MAX 開始，count 是拜訪過的節點數（內部節點與葉子都算）。',
      code: { Python: code`import random

def build(depth, rng, branching=3):  # 葉子是整數，內部節點是 list
    if depth == 0:
        return rng.randint(-20, 20)
    return [build(depth - 1, rng, branching) for _ in range(branching)]

def minimax(node, is_max, count):
    count[0] += 1
    if isinstance(node, int):
        return node
    values = [minimax(c, not is_max, count) for c in node]
    return max(values) if is_max else min(values)

def alphabeta(node, alpha, beta, is_max, count):
    count[0] += 1
    if isinstance(node, int):
        return node
    v = float('-inf') if is_max else float('inf')
    for child in node:
        score = alphabeta(child, alpha, beta, not is_max, count)
        if is_max:
            v = max(v, score)
            alpha = max(alpha, v)
        else:
            v = min(v, score)
            beta = min(beta, v)
        if alpha >= beta:  # 剪枝條件
            break
    return v

tree = build(4, random.Random(5))
plain, pruned = [0], [0]
v1 = minimax(tree, True, plain)
v2 = alphabeta(tree, float('-inf'), float('inf'), True, pruned)
print(f'minimax    value={v1} nodes={plain[0]}')
print(f'alpha-beta value={v2} nodes={pruned[0]}')
print(f'saved {plain[0] - pruned[0]} of {plain[0]} nodes')` },
      output: 'minimax    value=-8 nodes=121\nalpha-beta value=-8 nodes=72\nsaved 49 of 121 nodes',
    },
    {
      id: 'e-ordering', title: '行動排序：最佳、隨機與反向',
      description: '每個深度各產生一棵 b = 3 的樹（葉子是不重複的整數），用真正的 minimax 值把子節點排成最佳順序與反向順序，數 alpha-beta 評估的葉子數，並與 Knuth–Moore 的公式比較。',
      code: { Python: code`import random

def build(depth, values, b=3):  # values：不重複的整數，依序當葉子
    if depth == 0:
        return next(values)
    return [build(depth - 1, values, b) for _ in range(b)]

def ordered(node, is_max, best):  # 回傳 (依真正的值重新排列的子樹, minimax 值)
    if isinstance(node, int):
        return node, node
    kids = [ordered(c, not is_max, best) for c in node]
    kids.sort(key=lambda kv: kv[1], reverse=(is_max == best))  # 最佳：MAX 先看大的、MIN 先看小的
    values = [v for _, v in kids]
    return [k for k, _ in kids], (max(values) if is_max else min(values))

def alphabeta(node, alpha, beta, is_max):  # 回傳 (值, 評估的葉子數)
    if isinstance(node, int):
        return node, 1
    v, seen = (float('-inf') if is_max else float('inf')), 0
    for child in node:
        score, n = alphabeta(child, alpha, beta, not is_max)
        seen += n
        if is_max:
            v = max(v, score)
            alpha = max(alpha, v)
        else:
            v = min(v, score)
            beta = min(beta, v)
        if alpha >= beta:
            break
    return v, seen

rng = random.Random(2026)
for d in (2, 4, 6):
    tree = build(d, iter(rng.sample(range(10000), 3 ** d)))
    counts = []
    trees = [('best', ordered(tree, True, True)[0]), ('random', tree), ('worst', ordered(tree, True, False)[0])]
    for name, t in trees:
        counts.append(f'{name}={alphabeta(t, float("-inf"), float("inf"), True)[1]}')
    formula = 3 ** ((d + 1) // 2) + 3 ** (d // 2) - 1  # Knuth 與 Moore：完美排序時的葉子數
    print(f'd={d} leaves={3 ** d:3} ' + ' '.join(counts) + f' formula={formula}')` },
      output: 'd=2 leaves=  9 best=5 random=8 worst=9 formula=5\nd=4 leaves= 81 best=17 random=36 worst=79 formula=17\nd=6 leaves=729 best=53 random=292 worst=686 formula=53',
    },
    {
      id: 'e-expecti', title: 'expectiminimax：用分數計算期望值',
      description: 'MAX 有兩個行動，各接一個機率節點（9/10 與 1/10），再由 MIN 選。比較原本的評分、正的線性轉換，與只保持大小順序的轉換下，MAX 選哪一個行動。',
      code: { Python: code`from fractions import Fraction as F

# 節點：整數是葉子；('max', [...])、('min', [...])；('chance', [(機率, 子節點), ...])
def value(node):
    if isinstance(node, int):
        return F(node)
    kind, kids = node
    if kind == 'max':
        return max(value(c) for c in kids)
    if kind == 'min':
        return min(value(c) for c in kids)
    return sum((p * value(c) for p, c in kids), F(0))  # 機率節點：期望值

def relabel(node, table):  # 把每片葉子換成 table[葉子]
    if isinstance(node, int):
        return table[node]
    kind, kids = node
    if kind == 'chance':
        return (kind, [(p, relabel(c, table)) for p, c in kids])
    return (kind, [relabel(c, table) for c in kids])

def show(name, root):
    scores = [value(c) for c in root[1]]
    best = max(range(len(scores)), key=lambda i: scores[i])
    print(f'{name:9}: ' + ', '.join(f'a{i + 1}={s}' for i, s in enumerate(scores)) + f' -> a{best + 1}')

roll = lambda lo, hi: ('chance', [(F(9, 10), lo), (F(1, 10), hi)])
root = ('max', [roll(('min', [2, 3]), ('min', [3, 4])),   # a1：大多拿到 2，偶爾 3
                roll(('min', [1, 4]), ('min', [4, 5]))])  # a2：大多拿到 1，偶爾 4
show('original', root)
show('x*10+5', relabel(root, {k: 10 * k + 5 for k in range(1, 6)}))
show('monotonic', relabel(root, {1: 1, 2: 2, 3: 3, 4: 40, 5: 50}))` },
      output: 'original : a1=21/10, a2=13/10 -> a1\nx*10+5   : a1=26, a2=18 -> a1\nmonotonic: a1=21/10, a2=49/10 -> a2',
    },
    {
      id: 'e-mcts', title: '固定種子的 MCTS：取石子遊戲',
      description: '一堆 7 顆石子，輪流拿 1–3 顆，拿到最後一顆的人贏。執行 1000 次選擇、擴展、模擬、回傳，只印出根節點每個走法最後的拜訪次數與選出的走法。',
      code: { Python: code`import math
import random

# 取石子：一堆 n 顆，輪流拿 1–3 顆，拿到最後一顆的人贏
class Node:
    def __init__(self, stones, parent=None, move=None):
        self.stones, self.parent, self.move = stones, parent, move
        self.untried = [m for m in (1, 2, 3) if m <= stones]
        self.children, self.wins, self.visits = [], 0, 0

def ucb1(child, c=math.sqrt(2)):  # wins 是「走到 child 的那一方」贏的次數
    return child.wins / child.visits + c * math.sqrt(math.log(child.parent.visits) / child.visits)

def playout(stones, rng):  # 隨機下完；回傳「輪到下的那一方」是否贏
    me = True
    while True:
        stones -= rng.randint(1, min(3, stones))
        if stones == 0:
            return me
        me = not me

def mcts(stones, iterations, rng):
    root = Node(stones)
    for _ in range(iterations):
        node = root
        while not node.untried and node.children:  # 1. 選擇
            node = max(node.children, key=ucb1)
        if node.untried:  # 2. 擴展
            m = node.untried.pop(0)
            node.children.append(Node(node.stones - m, node, m))
            node = node.children[-1]
        mover_won = True if node.stones == 0 else not playout(node.stones, rng)  # 3. 模擬
        while node is not root:  # 4. 回傳
            node.visits += 1
            node.wins += int(mover_won)
            node, mover_won = node.parent, not mover_won
        root.visits += 1
    return root

root = mcts(7, 1000, random.Random(42))
for child in root.children:
    print(f'take {child.move}: visits={child.visits}')
print('best move: take', max(root.children, key=lambda c: c.visits).move)` },
      output: 'take 1: visits=38\ntake 2: visits=34\ntake 3: visits=928\nbest move: take 3',
    },
  ],
  exercises: [
    {
      id: 'x-alphabeta-report', title: 'Alpha-beta 剪枝報告：值、評估與剪掉的葉子',
      statement: '讀入一棵以巢狀中括號表示的遊戲樹，用 alpha-beta 剪枝求根的 minimax 值，並列出被評估與被剪掉的葉子。樹的格式：一棵樹是一個整數（葉子，可以有負號），或是 `[` 子樹 `,` 子樹 … `]`（至少一棵子樹，子樹之間以逗號分隔）。數字、括號與逗號之間可以有空白。根節點是 MAX，往下 MAX 與 MIN 輪流；葉子可以在不同深度。規則必須完全照下面做，評估與剪掉的葉子才會相同：子節點由左到右檢查；MAX 節點 v = max(v, 子節點值)、α = max(α, v)；MIN 節點 v = min(v, 子節點值)、β = min(β, v)；每看完一個子節點，若 α ≥ β（含等號）就停止，這個節點剩下的子樹裡所有葉子都算「被剪掉」。根以 α = −∞、β = +∞ 開始。',
      inputFormat: '一行：整棵樹（格式見題目）。',
      outputFormat: '三行：`value V`（根的值）；`evaluated K: …`（被評估的葉子數，冒號後依評估順序列出葉子值，以空白分隔）；`pruned M: …`（被剪掉的葉子數，冒號後由左到右列出葉子值；沒有就寫 `none`）。K + M 等於葉子總數。格式不合規定或超出限制：一行 `invalid input`。',
      constraints: ['葉子值是整數，絕對值 ≤ 1000000', '葉子最多 1000 片', '每片葉子外面最多 10 層中括號', '空的 `[]`、小數、缺少或多餘的逗號、括號不成對、樹後面還有東西，都是格式錯誤'],
      samples: [
        { kind: 'normal', input: '[[3, 12, 8], [2, 4, 6], [14, 5, 2]]\n', output: 'value 3\nevaluated 7: 3 12 8 2 14 5 2\npruned 2: 4 6\n', note: '教科書常用的兩層樹：第二個 MIN 節點看到 2 ≤ α = 3 後剪掉 4、6' },
        { kind: 'edge', input: '7\n', output: 'value 7\nevaluated 1: 7\npruned 0: none\n', note: '整棵樹只有一片葉子：根就是葉子' },
      ],
      tests: [
        { kind: 'normal', input: '[[[5, 6], [7, 4]], [[3, 2], [0, 1]]]\n', output: 'value 6\nevaluated 5: 5 6 7 3 2\npruned 3: 4 0 1\n', note: '視覺化的三層樹：剪掉一片葉子（β 剪枝）和一整棵子樹（α 剪枝）' },
        { kind: 'normal', input: '[[7, 8, 9], [4, 5, 6], [1, 2, 3]]\n', output: 'value 7\nevaluated 5: 7 8 9 4 1\npruned 4: 5 6 2 3\n', note: '最佳排序：最好的 MIN 節點在最前面，後面兩個都只看一片葉子' },
        { kind: 'normal', input: '[[3, 2, 1], [6, 5, 4], [9, 8, 7]]\n', output: 'value 7\nevaluated 9: 3 2 1 6 5 4 9 8 7\npruned 0: none\n', note: '同樣的值反向排列：完全沒有剪枝，與前一題比較排序的影響' },
        { kind: 'normal', input: '[[5, 9], [5, 1]]\n', output: 'value 5\nevaluated 3: 5 9 5\npruned 1: 1\n', note: 'α = β = 5 時也要剪：區分 ≥ 與 >' },
        { kind: 'normal', input: '[[-4, [10, -8]], [-6, 3], -5]\n', output: 'value -4\nevaluated 4: -4 10 -6 -5\npruned 2: -8 3\n', note: '負數與不同深度的葉子：第三個子節點直接是葉子' },
        { kind: 'normal', input: '[[[7,21,49],[9,7,15],[25,-26,-27]],[[15,10,30],[28,-27,-38],[7,-12,-32]],[[-39,18,38],[31,-45,26],[0,7,33]]]\n', output: 'value 31\nevaluated 25: 7 21 49 9 7 15 25 15 10 30 28 -27 -38 7 -12 -32 -39 18 38 31 -45 26 0 7 33\npruned 2: -26 -27\n', note: '隨機順序的三層樹（沒有空白）：27 片葉子只剪掉 2 片' },
        { kind: 'edge', input: '[3, -1, 8]\n', output: 'value 8\nevaluated 3: 3 -1 8\npruned 0: none\n', note: '只有一層 MAX：β 一直是 +∞，不會剪枝' },
        { kind: 'edge', input: '[[[42]]]\n', output: 'value 42\nevaluated 1: 42\npruned 0: none\n', note: '每層只有一個子節點' },
        { kind: 'edge', input: `${DEEPEST}\n`, output: 'value 1\nevaluated 1: 1\npruned 0: none\n', note: '剛好 10 層中括號，在限制內' },
        { kind: 'edge', input: '-1000000\n', output: 'value -1000000\nevaluated 1: -1000000\npruned 0: none\n', note: '最小的葉子值' },
        { kind: 'error', input: '[[3, 1], [2\n', output: 'invalid input\n', note: '括號不成對' },
        { kind: 'error', input: '[]\n', output: 'invalid input\n', note: '空的子樹列表' },
        { kind: 'error', input: '[1,, 2]\n', output: 'invalid input\n', note: '多餘的逗號' },
        { kind: 'error', input: '[1 2]\n', output: 'invalid input\n', note: '子樹之間少了逗號' },
        { kind: 'error', input: '[1.5, 2]\n', output: 'invalid input\n', note: '葉子不是整數' },
        { kind: 'error', input: '[1, 2]]\n', output: 'invalid input\n', note: '樹後面還有多餘的括號' },
        { kind: 'error', input: '\n', output: 'invalid input\n', note: '空的輸入' },
        { kind: 'error', input: `${TOO_DEEP}\n`, output: 'invalid input\n', note: '11 層中括號，超過深度限制' },
        { kind: 'error', input: '1000001\n', output: 'invalid input\n', note: '葉子值超出範圍' },
        { kind: 'error', input: `${TOO_MANY}\n`, output: 'invalid input\n', note: '1001 片葉子，超過 1000 片的限制' },
      ],
      hints: [
        '先把輸入切成 token：整數、`[`、`]`、`,`；切不出來的字元就是格式錯誤。',
        '用遞迴下降解析：parse(i) 讀一棵樹並回傳下一個 token 的位置；解析完還有剩下的 token 也是錯誤。',
        'alphabeta 多帶兩個 list：評估葉子時 append 到 evaluated；剪枝時把剩下子樹的所有葉子由左到右 extend 到 pruned。',
        '檢查：len(evaluated) + len(pruned) 必須等於葉子總數，而且根的值要和不剪枝的 minimax 相同。',
      ],
      solution: { Python: code`import re
import sys

TOKEN = re.compile(r'\s*(-?\d+|\[|\]|,)')

def tokenize(text):
    tokens, pos = [], 0
    text = text.strip()
    while pos < len(text):
        m = TOKEN.match(text, pos)
        if not m:
            return None
        tokens.append(m.group(1))
        pos = m.end()
    return tokens

def parse(tokens, i, depth):  # 回傳 (樹, 下一個位置)；格式錯誤時丟出 ValueError
    if i >= len(tokens) or depth > 10:
        raise ValueError
    tok = tokens[i]
    if tok not in ('[', ']', ','):
        if abs(int(tok)) > 10 ** 6:
            raise ValueError
        return int(tok), i + 1
    if tok != '[':
        raise ValueError
    kids, i = [], i + 1
    while True:
        child, i = parse(tokens, i, depth + 1)
        kids.append(child)
        if i < len(tokens) and tokens[i] == ',':
            i += 1
        elif i < len(tokens) and tokens[i] == ']':
            return kids, i + 1
        else:
            raise ValueError

def leaves(node):
    return [node] if isinstance(node, int) else [x for c in node for x in leaves(c)]

def alphabeta(node, alpha, beta, is_max, evaluated, pruned):
    if isinstance(node, int):
        evaluated.append(node)
        return node
    v = float('-inf') if is_max else float('inf')
    for i, child in enumerate(node):
        score = alphabeta(child, alpha, beta, not is_max, evaluated, pruned)
        if is_max:
            v = max(v, score)
            alpha = max(alpha, v)
        else:
            v = min(v, score)
            beta = min(beta, v)
        if alpha >= beta:
            for rest in node[i + 1:]:
                pruned.extend(leaves(rest))
            break
    return v

def main():
    tokens = tokenize(sys.stdin.read())
    try:
        tree, end = parse(tokens or [], 0, 0)
        if end != len(tokens) or len(leaves(tree)) > 1000:
            raise ValueError
    except ValueError:
        print('invalid input')
        return
    evaluated, pruned = [], []
    value = alphabeta(tree, float('-inf'), float('inf'), True, evaluated, pruned)
    print(f'value {value}')
    print(f'evaluated {len(evaluated)}: ' + ' '.join(map(str, evaluated)))
    print(f'pruned {len(pruned)}: ' + (' '.join(map(str, pruned)) or 'none'))

main()` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: 'Alpha-beta：每個節點的 α、β 與被剪掉的分支', language: 'Python',
    code: VIZ_CODE,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-condition', prompt: '在 MIN 節點上，alpha-beta 什麼時候可以停止檢查剩下的子節點？',
      options: ['v ≥ β 時', 'v ≤ α 時，也就是 α ≥ β', '只要 v 比上一個子節點的值小', 'MIN 節點不會剪枝，所有子節點都要看完'],
      answer: 1, explanation: 'MIN 節點的 v 只會變小；一旦 v ≤ α，這個節點最多只給 α 以下，路徑上的 MAX 節點已經有 α，不會選它，所以可以停。「v ≥ β」是 MAX 節點的條件；「比上一個子節點小」只是 v 更新了，和祖先的保證無關，不能據此剪枝；「MIN 節點不會剪枝」錯在視覺化的 C 就是 MIN 節點，剪掉了整棵 G。',
    },
    {
      id: 'q-trace', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`def alphabeta(node, alpha, beta, is_max, seen):
    if isinstance(node, int):
        seen.append(node)
        return node
    v = float('-inf') if is_max else float('inf')
    for child in node:
        score = alphabeta(child, alpha, beta, not is_max, seen)
        if is_max:
            v = max(v, score)
            alpha = max(alpha, v)
        else:
            v = min(v, score)
            beta = min(beta, v)
        if alpha >= beta:
            break
    return v

seen = []
value = alphabeta([[3, 12, 8], [2, 4, 6], [14, 5, 2]], float('-inf'), float('inf'), True, seen)
print(value, len(seen), seen[-1])` },
      options: ['3 9 2', '2 7 2', '3 5 14', '3 7 2'],
      answer: 3, explanation: '第一個 MIN 節點看完 3、12、8，值 3，根的 α = 3。第二個看到 2 ≤ 3 就剪掉 4、6。第三個看 14、5 都大於 3，看到 2 才 ≤ 3，但 2 已是最後一片。共評估 7 片，最後一片是 2，根的值 max(3, 2, 2) = 3。「3 9 2」是不剪枝的 minimax；「2 7 2」把根當成 MIN 或取最後一個子節點的值，但根是 MAX；「3 5 14」以為看到 14 就能剪，但 14 > α = 3，MIN 節點還要繼續找更小的值。',
    },
    {
      id: 'q-value', prompt: '關於 alpha-beta 剪枝，下列敘述何者正確？',
      options: ['根節點的值與 minimax 相同，選出的走法一樣好', '為了更快，它偶爾會選出比 minimax 差的走法', '每個被拜訪的內部節點，回傳的都是它真正的 minimax 值', '被剪掉的分支一定是對 MAX 不利的壞棋'],
      answer: 0, explanation: '被剪掉的子樹只影響不會被選到的節點，根以 (−∞, +∞) 呼叫，一定得到真正的 minimax 值。「偶爾選得比較差」錯：剪枝不是近似，結果完全相同；「每個內部節點都是真正的值」錯：視覺化中 C 回傳 3，真正的值是 1，只是上限；「剪掉的都是壞棋」錯：E 底下被剪的 4 是 MAX 的走法，被剪是因為 MIN 在 B 不會讓對局走到 E，和那一步本身好壞無關。',
    },
    {
      id: 'q-depth', prompt: '完美的行動排序讓 alpha-beta 只需評估約 b^(d/2) 片葉子。在相同的時間內，它能搜尋的深度大約是 minimax 的多少？',
      options: ['深度不變，只是每一層算得比較快', '只多 1 層', '約 2 倍深', '約 b 倍深'],
      answer: 2, explanation: 'minimax 評估 b^d 片葉子；同樣的 b^d 片，alpha-beta 在完美排序下能看到深度 2d，因為 b^(2d/2) = b^d，所以約 2 倍深，有效分支因子從 b 變成 √b。「深度不變」忽略了省下的是指數部分；「多 1 層」低估了：多看 1 層只需要多 b 倍的預算，而 alpha-beta 省下的是 b^(d/2) 倍；「b 倍深」高估了，指數只減半，不是除以 b。',
    },
    {
      id: 'q-expecti', prompt: '下面的 expectiminimax 程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F

def value(node):
    if isinstance(node, int):
        return F(node)
    kind, kids = node
    if kind == 'max':
        return max(value(c) for c in kids)
    if kind == 'min':
        return min(value(c) for c in kids)
    return sum(p * value(c) for p, c in kids)  # 機率節點

root = ('max', [('chance', [(F(1, 3), 9), (F(2, 3), ('min', [3, 6]))]),
                ('min', [4, 8])])
print(value(root))` },
      options: ['4', '6', '7', '5'],
      answer: 3, explanation: '機率節點：1/3 × 9 + 2/3 × min(3, 6) = 3 + 2 = 5；右邊 MIN 節點是 4；根取 max(5, 4) = 5。「4」選了 MIN 那一支，以為機率節點的值比較小；「6」把兩個結果平均成 (9 + 3) / 2，忽略了機率 1/3 與 2/3；「7」把內層的 MIN 當成 MAX，用了 6：1/3 × 9 + 2/3 × 6 = 7。',
    },
    {
      id: 'q-ucb1', prompt: 'MCTS 的選擇步驟用 UCB1 = w/n + √2 × √(ln N / n)。父節點拜訪 N = 10 次；子節點 A 勝 6 場、拜訪 8 次，B 勝 1 場、拜訪 2 次（ln 10 ≈ 2.303）。UCB1 會選哪一個？',
      options: ['A：勝率 0.75 比 B 的 0.5 高', 'B：探索項大，UCB1 約 2.02，A 約 1.51', '兩者 UCB1 相同，隨機選一個', '兩個都不選，先做一次模擬'],
      answer: 1, explanation: 'A = 6/8 + √2 × √(2.303 / 8) ≈ 0.75 + 0.76 = 1.51；B = 1/2 + √2 × √(2.303 / 2) ≈ 0.5 + 1.52 = 2.02，所以選 B。「A 勝率高」只看了利用項，忽略了 B 試得少、探索項大；「兩者相同」可以直接算出不同；「先做模擬」錯在選擇發生在模擬之前，兩個子節點都已展開，必須用 UCB1 挑一個往下走。',
    },
    {
      id: 'q-mcts-steps', prompt: '下列哪一個正確描述了 MCTS 一次迭代的四個步驟與順序？',
      options: ['選擇（用 UCB1 往下走）→ 擴展（加一個新子節點）→ 模擬（隨機下到終局）→ 回傳（沿路更新勝場與拜訪次數）', '擴展（展開所有子節點）→ 選擇（挑勝率最高的）→ 回傳 → 模擬', '模擬（從根隨機下到終局）→ 選擇 → 擴展 → 回傳', '選擇 → 模擬 → 擴展（把整條模擬路徑都加進樹）→ 回傳'],
      answer: 0, explanation: '每次迭代先用 UCB1 沿樹往下選，在有未試走法的節點加一個子節點，從那裡隨機模擬到終局，再把結果沿路徑往上回傳。第二個選項把擴展放在選擇之前，而且只挑勝率最高的，沒有探索；第三個從根開始模擬，等於不使用樹裡累積的統計；第四個把順序對調，而且每次只加一個節點，不是把整條模擬路徑放進樹裡。',
    },
    {
      id: 'q-transform', prompt: '在有擲骰子的遊戲中使用 expectiminimax，把評估函數的每個值做哪一種轉換，一定不會改變選出的走法？',
      options: ['任何保持大小順序的遞增函數', '平方（所有值都是正數）', '正的線性轉換 a·x + b（a > 0）', '取對數（所有值都是正數）'],
      answer: 2, explanation: '期望值是加權平均，正的線性轉換會讓每個期望值都變成 a·E + b，大小順序不變，所以決定不變。「任何遞增函數」只在沒有機率節點時成立，範例把 4、5 放大成 40、50 就讓選擇從 a1 變成 a2；平方與取對數都是非線性的遞增函數，同樣可能改變期望值的大小順序。',
    },
  ],
};
