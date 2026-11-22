import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF18 馬可夫決策過程入門 (python-code: Python only, standard library). Every example and the reference solution run in
 * the curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * The running example is one grid world: 3 rows × 4 columns, row 0 at the top. (0, 3) is a terminal worth +10 (the
 * charger), (1, 3) a terminal worth −10 (the stairs), (1, 1) a wall. Every move gives the living reward −1; entering a
 * terminal adds its reward and ends the episode (terminal value 0). The floor slips: the intended direction with 0.8,
 * each perpendicular direction with 0.1; bumping into a wall or the edge leaves the robot where it is. γ = 0.9. Actions
 * are tried in the order ^ > v <, which is also the tie-breaking order.
 *
 * The visualization runs TRACE_CODE (the example e-vi): synchronous value iteration until the largest change δ is below
 * θ = 0.001, then the greedy policy. valueIterationSteps() repeats that program with the same IEEE double arithmetic in
 * the same order (Q sums the intended outcome, then the two slips), formats as Python does, and checks the printed
 * lines against TRACE_OUTPUT, which the lesson test compares with Python's real output.
 */
const GRID = ['...+', '.#.-', '....'];
const TERMINAL: Record<string, number> = { '+': 10, '-': -10 };
const LIVING = -1, GAMMA = 0.9, SLIP = 0.2, THETA = 0.001;
const ACTIONS = ['^', '>', 'v', '<'] as const;
type Action = typeof ACTIONS[number];
const MOVES: Record<Action, [number, number]> = { '^': [-1, 0], '>': [0, 1], 'v': [1, 0], '<': [0, -1] };
const SIDES: Record<Action, [Action, Action]> = { '^': ['<', '>'], '>': ['^', 'v'], 'v': ['>', '<'], '<': ['v', '^'] };
const H = GRID.length, W = GRID[0].length;
const ROW_LABELS = Array.from({ length: H }, (_, r) => `row ${r}`);
const COL_LABELS = Array.from({ length: W }, (_, c) => `col ${c}`);
const STATES: [number, number][] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (GRID[r][c] === '.') STATES.push([r, c]);
const TRACE_OUTPUT = 'sweep 1: delta = 7.00000\nsweep 2: delta = 4.86000\nsweep 3: delta = 3.33720\nsweep 4: delta = 2.25698\nsweep 5: delta = 1.72009\nsweep 6: delta = 1.09106\nsweep 7: delta = 0.65169\nsweep 8: delta = 0.32037\nsweep 9: delta = 0.15205\nsweep 10: delta = 0.06818\nsweep 11: delta = 0.02999\nsweep 12: delta = 0.01287\nsweep 13: delta = 0.00546\nsweep 14: delta = 0.00229\nsweep 15: delta = 0.00095\n  3.777   5.901   8.110       +\n  2.097       #   4.219       -\n  0.616   0.567   2.035  -0.587\n> > > +\n^ # ^ -\n^ > ^ <';

const TRACE_CODE = code`ROWS = ['...+', '.#.-', '....']           # + 與 - 是終點，# 是牆
TERMINAL = {'+': 10.0, '-': -10.0}
LIVING, GAMMA, SLIP, THETA = -1.0, 0.9, 0.2, 0.001
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}  # 平手時依這個順序
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}
H, W = len(ROWS), len(ROWS[0])
states = [(r, c) for r in range(H) for c in range(W) if ROWS[r][c] == '.']

def step(s, a):
    r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
    if 0 <= r < H and 0 <= c < W and ROWS[r][c] != '#':
        return (r, c)
    return s                              # 撞牆或出界：留在原地

def q_value(V, s, a):                     # Σ P(s'|s,a) [R(s,a,s') + γ V(s')]
    total = 0.0
    for p, b in [(1 - SLIP, a), (SLIP / 2, SIDES[a][0]), (SLIP / 2, SIDES[a][1])]:
        t = step(s, b)
        ch = ROWS[t[0]][t[1]]
        total += p * (LIVING + (TERMINAL[ch] if ch in TERMINAL else GAMMA * V[t]))
    return total

V = {s: 0.0 for s in states}              # 終點與牆不在 V 裡
sweep = 0
while True:
    sweep += 1
    new = {s: max(q_value(V, s, a) for a in MOVES) for s in states}
    delta = max(abs(new[s] - V[s]) for s in states)
    V = new                               # 同步更新：整輪都用上一輪的 V
    print(f'sweep {sweep}: delta = {delta:.5f}')
    if delta < THETA:
        break
policy = {}
for s in states:
    qs = {a: q_value(V, s, a) for a in MOVES}
    policy[s] = next(a for a in MOVES if qs[a] >= max(qs.values()) - 1e-9)
for r in range(H):
    print(' '.join(f'{V[(r, c)]:7.3f}' if (r, c) in V else f'{ROWS[r][c]:>7}' for c in range(W)))
for r in range(H):
    print(' '.join(policy.get((r, c), ROWS[r][c]) for c in range(W)))`;

const at = (r: number, c: number) => r * W + c;
const pos = ([r, c]: [number, number]) => `(${r}, ${c})`;
function step([r, c]: [number, number], a: Action): [number, number] {
  const nr = r + MOVES[a][0], nc = c + MOVES[a][1];
  return nr >= 0 && nr < H && nc >= 0 && nc < W && GRID[nr][nc] !== '#' ? [nr, nc] : [r, c];
}
/** q_value in TRACE_CODE: the same terms added in the same order. */
function qValue(V: number[], s: [number, number], a: Action): number {
  let total = 0;
  for (const [p, b] of [[1 - SLIP, a], [SLIP / 2, SIDES[a][0]], [SLIP / 2, SIDES[a][1]]] as [number, Action][]) {
    const t = step(s, b), ch = GRID[t[0]][t[1]];
    total += p * (LIVING + (ch in TERMINAL ? TERMINAL[ch] : GAMMA * V[at(t[0], t[1])]));
  }
  return total;
}

function valueIterationSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const lines: string[] = [];
  type GridMark = { at: [number, number]; kind: Mark };
  const label = (r: number, c: number) => GRID[r][c] === '#' ? '#' : GRID[r][c] === '+' ? '+10' : GRID[r][c] === '-' ? '-10' : '';
  const valueGrid = (V: number[] | null, marks: GridMark[] = []) => ({
    name: 'V：每個狀態的價值（+10、-10 是終點，# 是牆）', marks, rowLabels: ROW_LABELS, colLabels: COL_LABELS,
    cells: GRID.map((row, r) => [...row].map((ch, c) => ch === '.' ? (V ? V[at(r, c)].toFixed(3) : '.') : label(r, c))),
  });
  const policyGrid = (policy: Map<number, Action>, marks: GridMark[] = []) => ({
    name: 'policy：每個狀態的動作', marks, rowLabels: ROW_LABELS, colLabels: COL_LABELS,
    cells: GRID.map((row, r) => [...row].map((ch, c) => ch === '.' ? policy.get(at(r, c)) ?? '' : label(r, c))),
  });
  const push = (line: number, note: string, vars: Record<string, string>, arrays: TraceStep['arrays']) =>
    steps.push({ line, note, vars, arrays, ...(lines.length ? { output: lines.join('\n') } : {}) });

  push(7, '地圖是 3 列 × 4 欄，row 0 在最上面。(0, 3) 是 +10 的充電站、(1, 3) 是 -10 的樓梯口，進入就結束；(1, 1) 是牆。每走一步得到生存獎勵 -1，地板會滑：照意圖走的機率 0.8，滑向左右兩側各 0.1，撞牆或出界留在原地。states 是 9 個可以停留的格子，終點與牆不需要估價值。',
    { H: String(H), W: String(W), 'len(states)': String(STATES.length), LIVING: '-1.0', GAMMA: '0.9', SLIP: '0.2', THETA: '0.001' }, [valueGrid(null)]);
  let V = Array<number>(H * W).fill(0);
  push(23, '價值迭代從 V0 = 0 開始：還沒有任何資訊時，每個狀態的估計都是 0。接下來每一輪（sweep）都用上一輪的 V，對每個狀態算出四個動作的 Q 值並取最大值。',
    { sweep: '0' }, [valueGrid(V)]);
  const s02: [number, number] = [0, 2];
  push(20, '第 1 輪裡的一個計算：狀態 (0, 2) 選 >。0.8 的機率進入 +10，得到 -1 + 10 = 9；0.1 往上滑撞到邊界留在原地，得到 -1 + 0.9 × V(0, 2) = -1；0.1 往下滑到 (1, 2)，得到 -1 + 0.9 × 0 = -1。Q = 0.8 × 9 + 0.1 × (-1) + 0.1 × (-1) = ' + qValue(V, s02, '>').toFixed(3) + '，這是 (0, 2) 四個動作裡最大的。',
    { s: '(0, 2)', a: '>', total: qValue(V, s02, '>').toFixed(3) }, [valueGrid(V, [{ at: [0, 2], kind: 'current' }, { at: [0, 3], kind: 'read' }, { at: [1, 2], kind: 'read' }])]);
  let sweep = 0, delta = Infinity, previous = Infinity;
  while (!(delta < THETA)) {
    sweep++;
    previous = delta;
    const next = [...V];
    for (const s of STATES) next[at(s[0], s[1])] = Math.max(...ACTIONS.map(a => qValue(V, s, a)));
    delta = 0;
    let where: [number, number] = STATES[0];
    for (const s of STATES) { const d = Math.abs(next[at(s[0], s[1])] - V[at(s[0], s[1])]); if (d > delta) { delta = d; where = s; } }
    const changed = STATES.filter(s => next[at(s[0], s[1])] !== V[at(s[0], s[1])]);
    V = next;
    lines.push(`sweep ${sweep}: delta = ${delta.toFixed(5)}`);
    const positive = STATES.filter(s => V[at(s[0], s[1])] > 0).length;
    const why = sweep === 1 ? '只有緊鄰 +10 的 (0, 2) 變成正的 7.000；其他格子最大的 Q 值都是 -1，還沒有任何正的價值可以借用。'
      : sweep === 2 ? '好消息往外傳了一格：(0, 1) 與 (1, 2) 現在看得到 (0, 2) 的價值，也變成正的。'
      : sweep === 3 ? '再往外傳一格。這一輪之後，對 V 取貪婪動作得到的策略已經不再改變，但數值還在調整。'
      : delta < THETA ? `δ < θ = ${THETA}，停止條件成立。`
      : `數值繼續修正，δ 是上一輪的 ${(delta / previous).toFixed(2)} 倍。`;
    push(30, `第 ${sweep} 輪：${STATES.length} 個狀態都用上一輪的 V 更新（同步更新）。變化最大的是 ${pos(where)}，δ = ${delta.toFixed(5)}；V 為正的狀態有 ${positive} 個。${why}`,
      { sweep: String(sweep), delta: delta.toFixed(5), 'V[(2, 0)]': V[at(2, 0)].toFixed(3) },
      [valueGrid(V, changed.map(s => ({ at: s, kind: (s === where ? 'current' : 'write') as Mark })))]);
  }
  const bound = GAMMA * delta / (1 - GAMMA);
  push(32, `第 ${sweep} 輪的 δ = ${delta.toFixed(5)} 小於 θ，跳出迴圈。停止時的保證是 |V(s) − V*(s)| ≤ γδ / (1 − γ) = 0.9 × ${delta.toFixed(5)} / 0.1 ≈ ${bound.toFixed(4)}：每一格離真正的最佳價值都不到 0.01。`,
    { sweep: String(sweep), delta: delta.toFixed(5), 'γδ/(1−γ)': bound.toFixed(4) }, [valueGrid(V)]);
  const policy = new Map<number, Action>();
  for (const s of STATES) {
    const qs = ACTIONS.map(a => qValue(V, s, a));
    const best = Math.max(...qs);
    const choice = ACTIONS[qs.findIndex(q => q >= best - 1e-9)];
    policy.set(at(s[0], s[1]), choice);
    const key = pos(s);
    const why = key === '(1, 2)' ? '往上可以離開 -10 旁邊並接近 +10；> 有 0.8 的機率直接掉進 -10，是四個 Q 值中最低的。'
      : key === '(2, 3)' ? '正上方就是 -10：選 ^ 有 0.8 的機率直接進入 -10；選 < 往左離開，只有 0.1 的機率往上滑進 -10。最佳動作是遠離危險，不是走最短的路。'
      : key === '(2, 1)' ? '往右沿最下排走，比往上（撞牆）或往左繞好。'
      : key === '(0, 2)' ? '直接往右進入 +10。'
      : '';
    push(36, `${key}：Q(^) = ${qs[0].toFixed(3)}、Q(>) = ${qs[1].toFixed(3)}、Q(v) = ${qs[2].toFixed(3)}、Q(<) = ${qs[3].toFixed(3)}，取最大的 ${choice}（相差不到 1e-9 視為平手，依 ^ > v < 的順序取第一個）。${why}`,
      { s: key, 'Q(^)': qs[0].toFixed(3), 'Q(>)': qs[1].toFixed(3), 'Q(v)': qs[2].toFixed(3), 'Q(<)': qs[3].toFixed(3), 'policy[s]': choice },
      [valueGrid(V, [{ at: s, kind: 'current' }]), policyGrid(policy, [{ at: s, kind: 'write' }])]);
  }
  for (let r = 0; r < H; r++) lines.push([...GRID[r]].map((ch, c) => (ch === '.' ? V[at(r, c)].toFixed(3) : ch).padStart(7)).join(' '));
  push(38, '印出收斂後的價值。上排靠近 +10 的格子價值最高；(2, 2) 離 +10 只要 3 步，價值 2.035 卻比要走 4 步的 (1, 0)（2.097）低，因為它的路線經過 -10 旁邊的 (1, 2)，有滑進去的風險。(2, 3) 不是終點，價值卻是負的：它緊貼 -10，要花好幾步才能安全繞開。', {}, [valueGrid(V), policyGrid(policy)]);
  for (let r = 0; r < H; r++) lines.push([...GRID[r]].map((ch, c) => ch === '.' ? policy.get(at(r, c))! : ch).join(' '));
  if (lines.join('\n') !== TRACE_OUTPUT) throw new Error(`AIF18: the trace prints ${lines.join('\n')}, the program prints ${TRACE_OUTPUT}`);
  push(40, '印出最佳策略。它不是一條路線，而是每一格各自的動作：機器人不管滑到哪裡，都知道下一步該怎麼走。', {},
    [valueGrid(V), policyGrid(policy, STATES.map(s => ({ at: s, kind: 'found' as Mark })))]);
  return steps;
}

export const AIF18: LessonContent = {
  lessonId: 'AIF18',
  motivation: '只做一次的決策，比較每個行動的期望效用、選最大的就好。可是倉庫的搬運機器人、掃地機器人或遊戲角色做的是一連串決策：每一步的結果都不確定，這一步停在哪裡會改變下一步能做什麼，獎勵也常常要很多步之後才拿到。馬可夫決策過程（Markov Decision Process，MDP）用狀態、動作、轉移機率、獎勵與折扣因子描述這類問題，它的答案不是一條路線，而是一份「在每個狀態該做什麼」的策略。這一課用一個地板會滑的 3 × 4 格子世界，從定義 MDP、比較計畫與策略、計算折扣報酬，一路推到貝爾曼方程；再用 Python 實作價值迭代與策略迭代求出最佳策略，觀察折扣因子與獎勵設計如何改變代理人的行為，最後說明模型未知時，強化學習要解決的是什麼問題。',
  sections: [
    {
      id: 'mdp', title: '序列決策與 MDP 的五個元件',
      blocks: [
        { type: 'p', text: '單次決策的理性原則是最大期望效用（MEU）：對每個行動算出 Σ P(結果) × U(結果)，選最大的。序列決策（sequential decision）多了兩件事：效用取決於整串經過的狀態，而不是單一結果；每一步行動之後，代理人都能看到自己到了哪裡，再決定下一步。用 AIF03 的環境分類來說，這一課的環境是完全可觀察、隨機、序列的，這正是 MDP 描述的情境。' },
        { type: 'p', text: '本課的例子是倉庫裡的搬運機器人，在 3 列 × 4 欄的格子上移動（row 0 在最上面）。右上角是充電站（+10），它下方是樓梯口（-10），進入任一格就結束這一回合；中間有一個貨架（牆）。每走一步消耗電量，得到 -1 的生存獎勵（living reward）。地板會滑：機器人往想去的方向走的機率是 0.8，滑向左右兩側各 0.1；撞到牆或邊界就留在原地。' },
        { type: 'table', head: ['', 'col 0', 'col 1', 'col 2', 'col 3'], rows: [
          ['row 0', '.', '.', '.', '+ 充電站，+10'],
          ['row 1', '.', '# 貨架', '.', '- 樓梯口，-10'],
          ['row 2', '. 起點', '.', '.', '.'],
        ] },
        { type: 'p', text: '一個 MDP 由五個部分組成。轉移模型 P(s′ | s, a) 是「在狀態 s 做動作 a，下一個狀態是 s′ 的機率」，它只依賴目前的狀態與動作，和怎麼走到這裡無關，這就是馬可夫性質（Markov property）。如果過去的資訊會影響未來，就要把它放進狀態裡，例如把剩餘電量也當成狀態的一部分。' },
        { type: 'table', head: ['元件', '符號', '本課的格子世界'], rows: [
          ['狀態（states）', 's ∈ S', '9 個可以停留的格子，加上 2 個終點；牆不是狀態'],
          ['動作（actions）', 'a ∈ A(s)', '^ > v < 四個方向'],
          ['轉移模型（transition model）', 'P(s′ | s, a)', '照意圖 0.8、滑向兩側各 0.1，撞牆留在原地'],
          ['獎勵（reward）', 'R(s, a, s′)', '每步 -1；進入 + 再加 10，進入 - 再加 -10'],
          ['折扣因子（discount factor）', 'γ，0 ≤ γ < 1', '0.9'],
        ] },
        { type: 'example', id: 'e-model' },
        { type: 'p', text: '輸出中的每個分布加起來都是 1。(0, 0) 選 < 時，往左撞到邊界、往上滑也撞到邊界，兩者都留在原地，所以留在 (0, 0) 的機率是 4/5 + 1/10 = 9/10。(1, 2) 選 > 時有 4/5 的機率進入樓梯口，那一格的獎勵是 -1 + (-10) = -11。轉移模型把「地板會滑」寫成精確的數字，後面所有的計算都建立在它上面。' },
        { type: 'callout', tone: 'note', title: '獎勵的寫法不只一種', text: '有些教科書把獎勵寫成 R(s)，在「處於」某個狀態時拿到，終點的價值就等於它的獎勵；本課用 R(s, a, s′)，在「進入」s′ 時拿到，進入終點後回合結束，終點本身的價值是 0。兩種寫法可以互相轉換，算出來的最佳策略相同；讀別的資料時，先確認它用哪一種。' },
      ],
    },
    {
      id: 'policy', title: '策略：為什麼一條計畫不夠',
      blocks: [
        { type: 'p', text: '在確定性的世界裡，AIF04 的搜尋找到的是一串動作（計畫，plan），照著做就會到達目標。地板會滑時，第一步滑開之後，計畫剩下的動作就全都對不上了。MDP 的解因此是一個策略（policy）π：對每個狀態 s 指定一個動作 π(s)。代理人每走一步都先看自己在哪裡，再查策略決定下一步，這是閉迴路（closed-loop）控制；照計畫做則是開迴路（open-loop），不看結果。' },
        { type: 'p', text: '範例用固定種子模擬 10,000 個回合，從起點 (2, 0) 出發，比較計畫 ^^>>>（沿左邊上去再沿上排往右）與下一節價值迭代算出的策略。每個回合把折扣後的獎勵加總成「報酬」，最後取平均。' },
        { type: 'example', id: 'e-plan' },
        { type: 'p', text: '計畫的 5 步全部照意圖執行的機率只有 0.8⁵ ≈ 0.328，實際到達 +10 的比例是 0.339（有些滑動碰巧仍然到得了）；有 64.7% 的回合在計畫用完時還沒到終點，平均報酬是 -1.966。策略則有 97.5% 到達 +10，平均報酬 0.659，接近下一節算出的 V(2, 0) ≈ 0.617：模擬只是估計，樣本越多越接近。策略也不是零風險，仍有 2.5% 的回合滑進 -10，但它在每一格都選擇了期望報酬最高的動作。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：先找最短路徑，再照著走', text: '在隨機環境中，「最短路徑」既不是完整的答案，也不一定是最好的答案。不完整，是因為機器人可能滑到計畫沒有經過的格子，策略必須告訴它在那裡怎麼辦；不一定最好，是因為最短的路可能緊貼危險：本課的最佳策略在 (2, 3) 選擇往左離開，而不是往上經過樓梯口旁邊。最佳策略衡量的是期望報酬，不是步數。' },
      ],
    },
    {
      id: 'bellman', title: '報酬、折扣與貝爾曼方程',
      blocks: [
        { type: 'p', text: '從時間 t 開始的報酬（return）是之後所有獎勵的折扣和：G = r₁ + γ r₂ + γ² r₃ + …。折扣因子 γ 介於 0 與 1 之間，越晚拿到的獎勵打越多折扣。理由有三個：未來比較不確定，γ 可以解讀成「每一步之後回合還會繼續的機率」；同樣的獎勵通常越早拿到越好；而且只要 γ < 1 且每步獎勵的絕對值不超過 R_max，無限長的報酬也一定有限，|G| ≤ R_max / (1 − γ)。γ = 0 的代理人只在乎下一個獎勵。' },
        { type: 'table', head: ['路徑（滑動機率 0 時）', '獎勵序列', 'γ = 1', 'γ = 0.9', 'γ = 0.5'], rows: [
          ['從 (0, 0) 沿上排走 3 步', '-1, -1, 9', '7', '5.39', '0.75'],
          ['從 (2, 0) 沿左邊與上排走 5 步', '-1, -1, -1, -1, 9', '5', '2.4659', '-1.3125'],
          ['被困住、永遠走不到終點', '-1, -1, -1, …', '-∞', '-10', '-2'],
        ] },
        { type: 'p', text: '狀態價值（state value）V^π(s) 是從 s 出發、一直照策略 π 行動時報酬的期望值；最佳價值 V*(s) 是所有策略中最大的那個。另一個常用的量是 Q 值 Q(s, a)：在 s 先做動作 a、之後照最佳策略行動的期望報酬。把報酬拆成「這一步的獎勵」加上「γ 乘以從下一個狀態開始的報酬」，就得到貝爾曼方程（Bellman equation）：' },
        { type: 'list', items: [
          '固定策略：V^π(s) = Σ_{s′} P(s′ | s, π(s)) [R(s, π(s), s′) + γ V^π(s′)]',
          '最佳價值：V*(s) = max_a Σ_{s′} P(s′ | s, a) [R(s, a, s′) + γ V*(s′)]',
          'Q 值與最佳策略：Q*(s, a) = Σ_{s′} P(s′ | s, a) [R(s, a, s′) + γ V*(s′)]，V*(s) = max_a Q*(s, a)，π*(s) = argmax_a Q*(s, a)',
          '終點：回合結束，之後沒有獎勵，所以終點的價值是 0',
        ] },
        { type: 'p', text: '用下一節算出的價值驗算 (1, 2) 選 ^：照意圖到 (0, 2)，貢獻 0.8 × (-1 + 0.9 × 8.110)；往左滑撞到貨架留在原地，貢獻 0.1 × (-1 + 0.9 × 4.219)；往右滑進入樓梯口，貢獻 0.1 × (-1 - 10)。合計 5.039 + 0.280 - 1.100 = 4.219，正好等於 V(1, 2)。其他三個動作的 Q 值是 Q(<) = 2.950、Q(v) = -0.155、Q(>) = -8.087，都比較小，所以 π*(1, 2) = ^。' },
        { type: 'p', text: '這組方程由 Richard Bellman 提出，他在 1957 年出版的《Dynamic Programming》奠定了這套方法。每個狀態一條方程、一個未知數，本課有 9 條；但因為式子裡有 max，方程不是線性的，不能直接用解線性方程組的方法求解，所以改用反覆代入的迭代法，也就是下一節的價值迭代。固定策略時沒有 max，方程是線性的，這是策略迭代能利用的性質。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：V(s) 就是這一格的獎勵', text: '每一個非終點格子的獎勵都一樣是每步 -1，價值卻從 8.110 到 -0.587 都有。V(s) 是從 s 出發、之後一直做最好選擇的期望折扣報酬，它包含了未來：(0, 2) 價值高，是因為下一步很可能進入 +10；(2, 3) 價值為負，是因為它離 +10 遠，又緊貼著 -10。獎勵是環境給的即時訊號，價值是代理人算出來的長期評估。' },
      ],
    },
    {
      id: 'value-iteration', title: '價值迭代：停止規則與取出策略',
      blocks: [
        { type: 'p', text: '價值迭代（value iteration）把貝爾曼方程當成更新規則：從 V₀ = 0 開始，每一輪（sweep）對每個狀態計算 V_{k+1}(s) = max_a Σ_{s′} P(s′ | s, a) [R(s, a, s′) + γ V_k(s′)]。本課用同步更新：整輪都讀上一輪的 V，算完才一起換掉，所以結果和狀態的處理順序無關。只要 γ < 1，這個更新是一個收縮映射（contraction）：每一輪後兩個價值函數的最大差距至少縮小為 γ 倍，因此不論從哪裡開始，都會收斂到唯一的 V*。' },
        { type: 'p', text: '停止規則：每一輪記下最大變化 δ = max_s |V_{k+1}(s) − V_k(s)|，δ < θ 就停止。這時保證 |V_{k+1}(s) − V*(s)| ≤ γδ / (1 − γ)。本課 θ = 0.001、γ = 0.9，停止時每一格的誤差都小於 0.009；若要求誤差小於 ε，就取 θ = ε(1 − γ) / γ。注意 γ 越接近 1，同樣的 θ 保證的誤差越大，需要的輪數也越多。' },
        { type: 'p', text: '下方的視覺化逐步執行這個程式。第 1 輪只有緊鄰 +10 的 (0, 2) 變成正的，之後好消息逐輪往外傳，第 7 輪起 9 格中有 8 格是正的；δ 從 7 一路縮小，第 15 輪降到 0.00095 時停止。最後對每個狀態算四個 Q 值、取最大者，就是最佳策略。' },
        { type: 'example', id: 'e-vi' },
        { type: 'p', text: '取出策略（policy extraction）只要往前看一步：π(s) = argmax_a Σ P(s′ | s, a) [R + γ V(s′)]。浮點數算出的 Q 值可能只差在最後幾位，所以程式把相差不到 1e-9 的動作視為平手，依 ^ > v < 的順序取第一個；明確寫出平手規則，輸出才會在每台電腦上都一樣。這個程式停在 θ = 0.001，起點的價值印成 0.616；繼續算到 δ < 1e-9（共 31 輪）會是 0.617，差距在上面的保證之內，策略則完全相同。' },
        { type: 'callout', tone: 'tip', title: '策略通常比價值早收斂', text: '在本課的格子世界中，從第 3 輪起，對當時的 V 取貪婪動作得到的策略就已經是最終的最佳策略，價值卻還要 12 輪才達到停止條件。我們真正要的常常是策略而不是精確的價值，這正是下一節策略迭代的出發點：不必把價值算到很精確，只要策略不再改變就可以停。' },
      ],
    },
    {
      id: 'policy-iteration', title: '策略迭代：評估與改進交替',
      blocks: [
        { type: 'p', text: '策略迭代（policy iteration）由 Ronald Howard 在 1960 年的著作中系統化。它從任意一個策略開始，交替做兩件事：策略評估（policy evaluation），算出目前策略的 V^π，因為動作固定、沒有 max，可以解線性方程組，也可以像範例一樣反覆代入到收斂；策略改進（policy improvement），對 V^π 在每個狀態取 Q 值最大的動作。策略不再改變時，它滿足貝爾曼最佳方程，就是最佳策略。' },
        { type: 'p', text: '策略改進定理保證新策略在每個狀態的價值都不會比舊策略差，而有限個狀態與動作只有有限多個策略，所以策略迭代一定會在有限輪內停止。範例故意從很差的「全部往左」開始，並且在目前動作已經是最佳（平手）時不換，避免在平手的動作之間來回。' },
        { type: 'example', id: 'e-pi' },
        { type: 'p', text: '全部往左時，起點永遠走不到終點，V(2, 0) = -1 / (1 − 0.9) = -10。第一次改進只改了 2 格：其他格子在這個策略下都看不到終點，各個動作差不多一樣糟，改進只能從終點附近開始。之後每一輪改進一些格子，第 6 輪沒有任何改變，得到的策略和價值迭代完全相同，起點價值 0.617。' },
        { type: 'table', head: ['', '價值迭代', '策略迭代'], rows: [
          ['每一輪做什麼', '對每個狀態做一次含 max 的貝爾曼更新', '完整評估目前策略，再做一次改進'],
          ['本課的輪數', '15 輪（θ = 0.001），算到 1e-9 要 31 輪', '6 輪，但每次評估要 32 到 198 次代入'],
          ['每一輪的成本', '低：每個狀態、每個動作看一次轉移', '高：評估要解 |S| 條線性方程（約 O(|S|³)）或反覆代入'],
          ['什麼時候停', 'δ < θ，價值只是近似', '策略不再改變，得到精確的最佳策略'],
        ] },
        { type: 'p', text: '兩者的輪數不能直接比較，因為每一輪的工作量不同：策略迭代的輪數通常很少，但每輪都要完整評估；價值迭代每輪便宜，但要很多輪。實務上常用折衷的做法，評估時只代入固定幾次就進行改進，稱為修正策略迭代（modified policy iteration）。' },
      ],
    },
    {
      id: 'design', title: '折扣因子、獎勵設計與強化學習',
      blocks: [
        { type: 'p', text: '最佳策略完全由 MDP 決定，所以改變 γ 或獎勵，代理人的行為就跟著改變。這是獎勵設計（reward design）的核心：設計者不直接寫出行為，而是寫出獎勵，讓最佳化去找行為。範例在同一張地圖上換五組生存獎勵與 γ，每一組都用價值迭代算到 δ < 1e-9，印出三列的策略與起點價值。' },
        { type: 'example', id: 'e-design' },
        { type: 'table', head: ['設定', '策略的變化', '原因'], rows: [
          ['生存獎勵 -1、γ = 0.9', '基準策略', '每一步都有成本，盡快到 +10，但在 (2, 3) 繞開 -10'],
          ['生存獎勵 -0.1', '(2, 1) 改成 <，從左邊繞遠路', '多走幾步很便宜，值得遠離最下排靠近 -10 的路線'],
          ['生存獎勵 -8', '(2, 3) 選 ^，直接走向 -10；(2, 0) 改走 >', '每步 -8 太痛苦，-10 結束回合比繼續走划算'],
          ['生存獎勵 +1', '(1, 2) 選 <、(2, 3) 選 v 故意撞牆，(2, 1)、(2, 2) 也改成往左', '活著有獎勵，-10 旁的格子不急著結束；上排仍走向 +10，因為 1 + 10 比停留的約 10 多'],
          ['γ = 0.1', '(1, 2) 與 (2, 3) 撞牆不動', '遠方的 +10 打了很重的折扣，眼前冒險靠近 -10 不划算'],
        ] },
        { type: 'p', text: '生存獎勵 +1、γ = 0.9 時，永遠不結束的報酬約是 1 / (1 − 0.9) = 10，和進入 +10 差不多，所以代理人在危險附近寧可撞牆拖時間。如果生存獎勵再大一些，連 +10 都不值得進入了。γ 越小，代理人越短視；γ 接近 1，代理人願意為了遠期的獎勵忍受很多步的成本。' },
        { type: 'callout', tone: 'warning', title: '獎勵要描述「想達成什麼」，不是「怎麼做」', text: '代理人只會最大化你寫下的獎勵，不會理解你的本意。若為了鼓勵機器人靠近充電站，替「站在充電站旁邊」每步加分，最佳策略可能是一直待在旁邊而不進去。OpenAI 在 2016 年就報告過賽艇遊戲 CoastRunners 的例子：代理人學會在原地繞圈反覆撞得分目標，分數比完成比賽還高。要加輔助獎勵（reward shaping）時，Ng、Harada 與 Russell 在 1999 年證明，以「位能差」形式加上的獎勵不會改變最佳策略。' },
        { type: 'p', text: '到這裡為止，代理人都知道完整的 P(s′ | s, a) 與 R，價值迭代與策略迭代是在「規劃」。真實世界常常不知道地板有多滑，這時代理人只能一邊行動、一邊從經驗 (s, a, r, s′) 中學習，這就是強化學習（reinforcement learning）。一條路是先從經驗統計出轉移機率與獎勵，再用本課的方法規劃（model-based）；另一條是不建模型，直接學 Q 值（model-free），例如 Watkins 在 1989 年提出的 Q-learning，用每一次經驗做一次「取樣版的貝爾曼更新」：Q(s, a) ← Q(s, a) + α [r + γ max_{a′} Q(s′, a′) − Q(s, a)]。學習時還要在「試試看新動作」（探索）與「用目前最好的動作」（利用）之間取捨。狀態太多時，可以用神經網路近似 Q 值，這就是深度強化學習。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-model', title: '把格子世界寫成 MDP：狀態、動作、轉移與獎勵',
      description: '用字串畫出地圖，step 處理撞牆，transition 以 Fraction 回傳 P(s′ | s, a)，reward 回傳 R(s, a, s′)。印出三組狀態與動作的轉移分布、總和與獎勵。',
      code: { Python: code`from fractions import Fraction

ROWS = ['...+', '.#.-', '....']           # + 與 - 是終點，# 是牆
TERMINAL = {'+': 10, '-': -10}            # 進入終點得到的獎勵
LIVING = -1                               # 每走一步的生存獎勵（這裡是成本）
SLIP = Fraction(1, 5)                     # 滑向左右兩側的總機率
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}
H, W = len(ROWS), len(ROWS[0])
states = [(r, c) for r in range(H) for c in range(W) if ROWS[r][c] != '#']
terminals = [s for s in states if ROWS[s[0]][s[1]] in TERMINAL]

def step(s, a):
    r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
    if 0 <= r < H and 0 <= c < W and ROWS[r][c] != '#':
        return (r, c)
    return s  # 撞牆或出界：留在原地

def transition(s, a):
    """P(s' | s, a)：照意圖走 1 - SLIP，左右各滑 SLIP / 2。"""
    dist = {}
    for p, b in [(1 - SLIP, a), (SLIP / 2, SIDES[a][0]), (SLIP / 2, SIDES[a][1])]:
        t = step(s, b)
        dist[t] = dist.get(t, 0) + p
    return dist

def reward(s, a, t):
    return LIVING + TERMINAL.get(ROWS[t[0]][t[1]], 0)

print('states:', len(states), 'terminals:', terminals)
print('actions:', ' '.join(MOVES))
for s, a in [((2, 0), '^'), ((1, 2), '>'), ((0, 0), '<')]:
    dist = transition(s, a)
    parts = [f'{t}:{p}' for t, p in sorted(dist.items())]
    rewards = [str(reward(s, a, t)) for t in sorted(dist)]
    print(f'P(. | {s}, {a}) =', ' '.join(parts), ' sum =', sum(dist.values()), ' R =', ' '.join(rewards))` },
      output: 'states: 11 terminals: [(0, 3), (1, 3)]\nactions: ^ > v <\nP(. | (2, 0), ^) = (1, 0):4/5 (2, 0):1/10 (2, 1):1/10  sum = 1  R = -1 -1 -1\nP(. | (1, 2), >) = (0, 2):1/10 (1, 3):4/5 (2, 2):1/10  sum = 1  R = -1 -11 -1\nP(. | (0, 0), <) = (0, 0):9/10 (1, 0):1/10  sum = 1  R = -1 -1',
    },
    {
      id: 'e-plan', title: '計畫與策略：固定種子模擬 10,000 個回合',
      description: '開迴路的計畫 ^^>>> 不看目前位置，閉迴路的策略每一步查表。兩者用同一個種子模擬，統計到達 +10、掉進 -10、沒有結束的比例與平均折扣報酬。',
      code: { Python: code`import random

ROWS = ['...+', '.#.-', '....']
TERMINAL = {'+': 10, '-': -10}
LIVING, GAMMA, SLIP = -1, 0.9, 0.2
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}
POLICY = ['>>>+', '^#^-', '^>^<']        # 價值迭代算出的策略（下一節）

def move(s, a, rng):
    x = rng.random()                      # 依轉移模型抽出真正的方向
    if x >= 1 - SLIP:
        a = SIDES[a][0] if x < 1 - SLIP / 2 else SIDES[a][1]
    r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
    return (r, c) if 0 <= r < 3 and 0 <= c < 4 and ROWS[r][c] != '#' else s

def episode(choose, rng, limit=50):
    s, ret, discount = (2, 0), 0.0, 1.0
    for t in range(limit):
        a = choose(s, t)
        if a is None:                     # 計畫用完了，卻還沒到終點
            return 'stuck', ret
        s = move(s, a, rng)
        ch = ROWS[s[0]][s[1]]
        ret += discount * (LIVING + TERMINAL.get(ch, 0))  # 報酬 = 折扣後的獎勵總和
        discount *= GAMMA
        if ch in TERMINAL:
            return ch, ret
    return 'stuck', ret

plan = '^^>>>'                            # 開迴路：不看目前在哪裡
agents = {'plan': lambda s, t: plan[t] if t < len(plan) else None,
          'policy': lambda s, t: POLICY[s[0]][s[1]]}  # 閉迴路：看狀態決定
print('plan works as written:', f'{0.8 ** len(plan):.3f}')
for name, choose in agents.items():
    rng = random.Random(2026)
    counts, total = {'+': 0, '-': 0, 'stuck': 0}, 0.0
    for _ in range(10000):
        end, ret = episode(choose, rng)
        counts[end] += 1
        total += ret
    shown = ' '.join(f'{k}={counts[k] / 10000:.3f}' for k in ['+', '-', 'stuck'])
    print(f'{name:6} {shown}  mean return {total / 10000:.3f}')` },
      output: 'plan works as written: 0.328\nplan   +=0.339 -=0.014 stuck=0.647  mean return -1.966\npolicy +=0.975 -=0.025 stuck=0.000  mean return 0.659',
    },
    {
      id: 'e-vi', title: '價值迭代：同步更新到 δ < θ，再取出最佳策略',
      description: '每一輪用上一輪的 V 對每個狀態取四個 Q 值的最大值，印出 δ；δ < 0.001 時停止，印出價值與貪婪策略（平手依 ^ > v < 的順序）。',
      code: { Python: TRACE_CODE },
      output: TRACE_OUTPUT,
    },
    {
      id: 'e-pi', title: '策略迭代：從全部往左開始',
      description: 'evaluate 反覆代入固定策略的貝爾曼方程直到收斂；改進時對每個狀態取 Q 值最大的動作，已經最佳就不換。印出每一輪被評估的策略、起點價值、評估用了幾次代入與改了幾格。',
      code: { Python: code`ROWS = ['...+', '.#.-', '....']
TERMINAL = {'+': 10.0, '-': -10.0}
LIVING, GAMMA, SLIP = -1.0, 0.9, 0.2
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}
states = [(r, c) for r in range(3) for c in range(4) if ROWS[r][c] == '.']

def step(s, a):
    r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
    return (r, c) if 0 <= r < 3 and 0 <= c < 4 and ROWS[r][c] != '#' else s

def q_value(V, s, a):
    total = 0.0
    for p, b in [(1 - SLIP, a), (SLIP / 2, SIDES[a][0]), (SLIP / 2, SIDES[a][1])]:
        t = step(s, b)
        ch = ROWS[t[0]][t[1]]
        total += p * (LIVING + (TERMINAL[ch] if ch in TERMINAL else GAMMA * V[t]))
    return total

def evaluate(policy):                     # 策略評估：動作固定，沒有 max
    V, sweeps = {s: 0.0 for s in states}, 0
    while True:
        new = {s: q_value(V, s, policy[s]) for s in states}
        sweeps += 1
        delta = max(abs(new[s] - V[s]) for s in states)
        V = new
        if delta < 1e-9:
            return V, sweeps

policy = {s: '<' for s in states}         # 故意從很差的策略開始：全部往左
for it in range(1, 20):
    V, sweeps = evaluate(policy)
    better = {}
    for s in states:                      # 策略改進：對 V 取貪婪動作
        qs = {a: q_value(V, s, a) for a in MOVES}
        best = max(qs.values())
        keep = qs[policy[s]] >= best - 1e-9   # 已經最好就不換，避免在平手之間來回
        better[s] = policy[s] if keep else next(a for a in MOVES if qs[a] >= best - 1e-9)
    changed = sum(better[s] != policy[s] for s in states)
    grid = ' '.join(''.join(policy.get((r, c), ROWS[r][c]) for c in range(4)) for r in range(3))
    print(f'iteration {it}: {grid}  V(2,0) = {V[(2, 0)]:7.3f}  eval sweeps {sweeps}  changed {changed}')
    if changed == 0:
        break
    policy = better` },
      output: 'iteration 1: <<<+ <#<- <<<<  V(2,0) = -10.000  eval sweeps 198  changed 2\niteration 2: <<>+ <#<- <<<v  V(2,0) = -10.000  eval sweeps 198  changed 5\niteration 3: <>>+ <#^- <>^<  V(2,0) = -10.000  eval sweeps 198  changed 2\niteration 4: >>>+ <#^- >>^<  V(2,0) =  -0.928  eval sweeps 73  changed 1\niteration 5: >>>+ ^#^- >>^<  V(2,0) =  -0.442  eval sweeps 32  changed 1\niteration 6: >>>+ ^#^- ^>^<  V(2,0) =   0.617  eval sweeps 32  changed 0',
    },
    {
      id: 'e-design', title: '折扣因子與生存獎勵如何改變策略',
      description: '同一張地圖換五組生存獎勵與 γ，每組都用價值迭代算到收斂，印出三列策略（以空白分隔）與起點的價值。',
      code: { Python: code`ROWS = ['...+', '.#.-', '....']
TERMINAL = {'+': 10.0, '-': -10.0}
SLIP = 0.2
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}
states = [(r, c) for r in range(3) for c in range(4) if ROWS[r][c] == '.']

def step(s, a):
    r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
    return (r, c) if 0 <= r < 3 and 0 <= c < 4 and ROWS[r][c] != '#' else s

def solve(living, gamma):
    def q(V, s, a):
        total = 0.0
        for p, b in [(1 - SLIP, a), (SLIP / 2, SIDES[a][0]), (SLIP / 2, SIDES[a][1])]:
            t = step(s, b)
            ch = ROWS[t[0]][t[1]]
            total += p * (living + (TERMINAL[ch] if ch in TERMINAL else gamma * V[t]))
        return total
    V = {s: 0.0 for s in states}
    while True:
        new = {s: max(q(V, s, a) for a in MOVES) for s in states}
        done = max(abs(new[s] - V[s]) for s in states) < 1e-9
        V = new
        if done:
            break
    policy = {}
    for s in states:
        qs = {a: q(V, s, a) for a in MOVES}
        policy[s] = next(a for a in MOVES if qs[a] >= max(qs.values()) - 1e-9)
    grid = ' '.join(''.join(policy.get((r, c), ROWS[r][c]) for c in range(4)) for r in range(3))
    return grid, V[(2, 0)]

for living, gamma, why in [(-1.0, 0.9, '基準'), (-0.1, 0.9, '步數便宜：繞遠路也要避開 -'),
                           (-8.0, 0.9, '活著太痛苦：寧可跳進 -'), (1.0, 0.9, '活著有獎勵：撞牆拖時間'),
                           (-1.0, 0.1, '只看眼前：不冒險靠近 -')]:
    grid, v = solve(living, gamma)
    print(f'living {living:5.1f} gamma {gamma:.1f}  {grid}  V(2,0) = {v:8.3f}  {why}')` },
      output: 'living  -1.0 gamma 0.9  >>>+ ^#^- ^>^<  V(2,0) =    0.617  基準\nliving  -0.1 gamma 0.9  >>>+ ^#^- ^<^<  V(2,0) =    4.955  步數便宜：繞遠路也要避開 -\nliving  -8.0 gamma 0.9  >>>+ ^#^- >>^^  V(2,0) =  -33.059  活著太痛苦：寧可跳進 -\nliving   1.0 gamma 0.9  >>>+ ^#<- ^<<v  V(2,0) =   10.533  活著有獎勵：撞牆拖時間\nliving  -1.0 gamma 0.1  >>>+ ^#<- ^>^v  V(2,0) =   -1.111  只看眼前：不冒險靠近 -',
    },
  ],
  exercises: [
    {
      id: 'x-gridworld', title: '格子世界求解器：價值迭代與最佳策略',
      statement: '讀入一個格子世界，用價值迭代求出每個狀態的最佳價值與最佳策略。格子有三種：`.` 是一般狀態、`#` 是牆、一個數字是終點（數字是進入它得到的額外獎勵）。每走一步都得到生存獎勵 living；進入終點時再加上終點的獎勵，回合結束，終點的價值是 0。動作是 `^ > v <`（上、右、下、左）：照意圖走的機率是 1 − slip，滑向左右兩側（垂直方向）各 slip / 2；撞到牆或走出邊界就留在原地。從 V = 0 開始做同步更新的價值迭代，V(s) = max_a Σ P(s′ | s, a) [R(s, a, s′) + γ V(s′)]，直到所有狀態的最大變化小於 1e-9。取策略時對每個狀態算四個動作的 Q 值，和最大值相差不超過 1e-6 的動作視為平手，依 `^ > v <` 的順序取第一個。',
      inputFormat: '第一行是列數 R 與欄數 C。接著 R 行，每行 C 個以空白分隔的格子：`.`、`#` 或終點的獎勵（如 `10`、`-10`、`2.5`）。最後一行是三個數：living（生存獎勵）、gamma、slip。數字的寫法是可有負號的整數或小數（如 `-1`、`0.9`），不接受 `1e-1` 這類寫法。結尾的空行會被忽略，Windows 換行也要能處理。',
      outputFormat: '先印一行 `values`，接著 R 行，每行 C 個以空白分隔的格子：一般狀態印價值，保留 3 位小數（`-0.000` 要印成 `0.000`），牆印 `#`，終點印 `T`。再印一行 `policy`，接著 R 行，一般狀態印它的動作，牆與終點同樣印 `#` 與 `T`。輸入格式或範圍不對時，只印一行 `invalid input`。',
      constraints: ['1 ≤ R, C ≤ 5', '終點獎勵的絕對值 ≤ 100，|living| ≤ 10', '0 ≤ gamma ≤ 0.99，0 ≤ slip ≤ 1', '可以沒有終點，也可以沒有一般狀態'],
      samples: [
        { kind: 'normal', input: '3 4\n. . . 10\n. # . -10\n. . . .\n-1 0.9 0.2\n', output: 'values\n3.777 5.901 8.110 T\n2.097 # 4.219 T\n0.617 0.568 2.036 -0.587\npolicy\n> > > T\n^ # ^ T\n^ > ^ <\n', note: '本課的格子世界：右上角 +10、其下 -10，生存獎勵 -1、γ = 0.9、滑動機率 0.2' },
        { kind: 'edge', input: '1 1\n.\n-1 0.5 0\n', output: 'values\n-2.000\npolicy\n^\n', note: '只有一格、沒有終點：每一步都撞牆留在原地，V = -1 / (1 - 0.5) = -2；四個動作平手，取順序第一個 ^' },
      ],
      tests: [
        { kind: 'normal', input: '2 3\n. . 5\n. # -5\n-0.5 0.8 0\n', output: 'values\n3.100 4.500 T\n1.980 # T\npolicy\n> > T\n^ # T\n', note: '滑動機率 0 的確定性世界：價值就是沿最短路徑的折扣報酬' },
        { kind: 'normal', input: '3 4\n. . . 10\n. # . -10\n. . . .\n-0.1 0.9 0.2\n', output: 'values\n6.827 8.034 9.289 T\n5.873 # 6.140 T\n4.955 4.229 4.945 2.704\npolicy\n> > > T\n^ # ^ T\n^ < ^ <\n', note: '同一張圖、生存獎勵改成 -0.1：左下第二格改走 <，寧可繞遠路也不靠近 -10' },
        { kind: 'normal', input: '3 4\n. . . 10\n. # . -10\n. . . .\n1 0.9 0.2\n', output: 'values\n10.701 10.809 10.922 T\n10.616 # 10.429 T\n10.533 10.468 10.413 10.196\npolicy\n> > > T\n^ # < T\n^ < < v\n', note: '生存獎勵 +1：-10 旁邊的格子改成撞牆拖時間（< 與 v），不急著結束' },
        { kind: 'normal', input: '4 4\n. . . 3\n. # . .\n. . # -5\n1 . . .\n-0.2 0.9 0.2\n', output: 'values\n1.520 2.063 2.627 T\n1.091 # 2.119 2.627\n0.699 0.403 # T\nT 0.699 0.370 -0.476\npolicy\n> > > T\n^ # ^ ^\nv v # T\nT < < <\n', note: '兩個正的終點（3 與 1）加一個 -5：左下方的格子選近的 +1，上方的格子選遠一點的 +3' },
        { kind: 'normal', input: '5 5\n. . . . 8\n. # # . .\n. . . # -8\n# . . . .\n. . -2 . .\n-0.3 0.95 0.3\n', output: 'values\n4.520 5.469 6.331 7.259 T\n3.785 # # 6.485 7.259\n2.949 2.187 1.506 # T\n# 1.506 0.960 0.306 -1.020\n-0.053 0.394 T -0.529 -0.929\npolicy\n> > > > T\n^ # # ^ ^\n^ < < # T\n# ^ ^ < v\n> ^ T ^ <\n', note: '5 × 5、三個終點、滑動機率 0.3、γ = 0.95' },
        { kind: 'edge', input: '2 2\n. 4\n. .\n-1 0 0.2\n', output: 'values\n2.200 T\n-1.000 2.200\npolicy\n> T\n^ ^\n', note: 'γ = 0：只看這一步的期望獎勵，未來完全不算' },
        { kind: 'edge', input: '3 3\n. . .\n. . 6\n. . .\n0 0.9 1\n', output: 'values\n3.179 3.885 5.455\n3.885 4.748 T\n3.179 3.885 5.455\npolicy\n^ ^ >\n^ ^ T\n^ ^ >\n', note: '滑動機率 1：一定滑向兩側，想往右得選 ^ 或 v' },
        { kind: 'edge', input: '1 2\n5 #\n0 0.5 0.1\n', output: 'values\nT #\npolicy\nT #\n', note: '沒有非終點的格子：只印 T 與 #' },
        { kind: 'edge', input: '2 2\n. #\n# #\n2 0.75 0.5\n', output: 'values\n8.000 #\n# #\npolicy\n^ #\n# #\n', note: '被牆圍住、正的生存獎勵：V = 2 / (1 - 0.75) = 8' },
        { kind: 'edge', input: '1 3\n5 . 5\n-1 0.9 0\n', output: 'values\nT 4.000 T\npolicy\nT > T\n', note: '中間一格往左往右完全一樣好，依順序 ^ > v < 取 >' },
        { kind: 'edge', input: '1 2\n. 0\n-0.0001 0 0\n', output: 'values\n0.000 T\npolicy\n^ T\n', note: '四個動作平手取 ^；V = -0.0001 四捨五入成 -0.000，要印成 0.000' },
        { kind: 'edge', input: '2 2\r\n. 2.5\r\n0 -1.5\r\n-0.25 0.5 0.4\r\n\r\n\r\n', output: 'values\n1.389 T\nT T\npolicy\n> T\nT T\n', note: '終點獎勵 0 與小數、Windows 換行與結尾空行' },
        { kind: 'error', input: '6 5\n. . . . .\n. . . . .\n. . . . .\n. . . . .\n. . . . .\n. . . . .\n-1 0.9 0.2\n', output: 'invalid input\n', note: '超過 5 列' },
        { kind: 'error', input: '3 4\n. . . 10\n. # -10\n. . . .\n-1 0.9 0.2\n', output: 'invalid input\n', note: '第二列只有 3 格' },
        { kind: 'error', input: '2 2\nS .\n. 5\n-1 0.9 0.2\n', output: 'invalid input\n', note: '不認得的格子 S' },
        { kind: 'error', input: '2 2\n. .\n. 5\n-1 1 0.2\n', output: 'invalid input\n', note: 'γ = 1 超出範圍（0 ≤ γ ≤ 0.99）' },
        { kind: 'error', input: '2 2\n. .\n. 5\n-1 0.9 1.5\n', output: 'invalid input\n', note: '滑動機率 1.5 大於 1' },
        { kind: 'error', input: '2 2\n. .\n. 5\n', output: 'invalid input\n', note: '少了最後一行參數' },
        { kind: 'error', input: '2 2\n. .\n. 150\n-1 0.9 0.2\n', output: 'invalid input\n', note: '終點獎勵 150 超過 100' },
        { kind: 'error', input: '2 2\n. .\n. 5\n-1 0.9 1e-1\n', output: 'invalid input\n', note: '參數不是一般的小數寫法' },
        { kind: 'error', input: '', output: 'invalid input\n', note: '空的輸入' },
        { kind: 'error', input: '2 2\n. .\n. 5\n-1 0.9 0.2\n0\n', output: 'invalid input\n', note: '參數後面多了一行' },
      ],
      hints: [
        '先把格子讀成二維陣列，再用一個字典記下每個終點的獎勵；一般狀態的清單就是所有 `.` 的位置。',
        '寫 `step(s, a)` 處理撞牆與出界，再寫 `q_value(V, s, a)`：照意圖、兩側滑動三個結果，各自乘上機率後加總。進入終點時用終點獎勵取代 γ V(s′)。',
        '同步更新：每一輪先用舊的 V 算出整張新的表，再一起換掉；沒有一般狀態時，最大變化當成 0。',
        '平手規則與 `-0.000` 都會出現在測資裡；用 `max(qs.values())` 找最大值，再依 `^ > v <` 的順序找第一個夠接近的動作。',
      ],
      solution: { Python: code`import re
import sys

NUMBER = re.compile(r'-?[0-9]+(\.[0-9]+)?')
MOVES = {'^': (-1, 0), '>': (0, 1), 'v': (1, 0), '<': (0, -1)}  # 平手時依這個順序
SIDES = {'^': '<>', '>': '^v', 'v': '><', '<': 'v^'}

def parse(lines):
    """回傳 (格子, 終點獎勵, 生存獎勵, γ, 滑動機率)；格式不對時回傳 None。"""
    while lines and not lines[-1].strip():
        lines.pop()
    head = lines[0].split() if lines else []
    if len(head) != 2 or not all(re.fullmatch('[0-9]+', t) for t in head):
        return None
    h, w = int(head[0]), int(head[1])
    if not (1 <= h <= 5 and 1 <= w <= 5) or len(lines) != h + 2:
        return None
    grid, reward = [], {}
    for r, line in enumerate(lines[1:1 + h]):
        tokens = line.split()
        if len(tokens) != w:
            return None
        for c, tok in enumerate(tokens):
            if NUMBER.fullmatch(tok) and abs(float(tok)) <= 100:
                reward[(r, c)] = float(tok)   # 數字是終點，值是進入它得到的獎勵
            elif tok not in ('.', '#'):
                return None
        grid.append(['T' if (r, c) in reward else tok for c, tok in enumerate(tokens)])
    last = lines[1 + h].split()
    if len(last) != 3 or not all(NUMBER.fullmatch(t) for t in last):
        return None
    living, gamma, slip = (float(t) for t in last)
    if abs(living) > 10 or not 0 <= gamma <= 0.99 or not 0 <= slip <= 1:
        return None
    return grid, reward, living, gamma, slip

def solve(grid, reward, living, gamma, slip):
    h, w = len(grid), len(grid[0])
    states = [(r, c) for r in range(h) for c in range(w) if grid[r][c] == '.']

    def step(s, a):
        r, c = s[0] + MOVES[a][0], s[1] + MOVES[a][1]
        return (r, c) if 0 <= r < h and 0 <= c < w and grid[r][c] != '#' else s

    def q_value(V, s, a):
        total = 0.0
        for p, b in [(1 - slip, a), (slip / 2, SIDES[a][0]), (slip / 2, SIDES[a][1])]:
            t = step(s, b)
            future = reward[t] if t in reward else gamma * V[t]   # 進入終點後回合結束
            total += p * (living + future)
        return total

    V = {s: 0.0 for s in states}
    while True:                       # 價值迭代：同步更新，直到最大變化小於 1e-9
        new = {s: max(q_value(V, s, a) for a in MOVES) for s in states}
        delta = max((abs(new[s] - V[s]) for s in states), default=0.0)
        V = new
        if delta < 1e-9:
            break
    policy = {}
    for s in states:
        qs = {a: q_value(V, s, a) for a in MOVES}
        best = max(qs.values())
        policy[s] = next(a for a in MOVES if qs[a] >= best - 1e-6)
    return V, policy

def show(v):
    text = f'{v:.3f}'
    return '0.000' if text == '-0.000' else text

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None:
    print('invalid input')
else:
    grid, reward, living, gamma, slip = parsed
    V, policy = solve(grid, reward, living, gamma, slip)
    print('values')
    for r, row in enumerate(grid):
        print(' '.join(show(V[(r, c)]) if (r, c) in V else ch for c, ch in enumerate(row)))
    print('policy')
    for r, row in enumerate(grid):
        print(' '.join(policy.get((r, c), ch) for c, ch in enumerate(row)))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'dp-table', title: '價值迭代：好消息從 +10 一格一格往外傳', language: 'Python',
    code: TRACE_CODE,
    steps: valueIterationSteps(),
  },
  quiz: [
    {
      id: 'q-components', prompt: '倉庫的地板會滑：機器人往右走時，有 0.8 的機率真的往右，各 0.1 的機率滑向上或下。這項資訊屬於 MDP 的哪一個元件？',
      options: ['獎勵函數 R(s, a, s′)', '轉移模型 P(s′ | s, a)', '折扣因子 γ', '策略 π(s)'],
      answer: 1, explanation: '「做了動作 a 之後會到哪個狀態、機率是多少」正是轉移模型 P(s′ | s, a)。獎勵函數描述到達之後得到多少獎勵，不描述會到哪裡；γ 決定未來的獎勵打幾折，和地板滑不滑無關；策略是代理人要算出來的答案（每個狀態做什麼），不是環境給定的模型。',
    },
    {
      id: 'q-plan', prompt: '在地板會滑的格子世界中，為什麼 MDP 的解是「策略」，而不是「一串動作」？',
      options: ['因為一串動作無法表示超過 5 步的路線', '因為照策略走保證不會掉進 -10', '因為策略走的步數一定比計畫少', '因為滑動之後代理人可能落在計畫沒有預料的狀態，策略為每個狀態都指定了動作'],
      answer: 3, explanation: '隨機的轉移可能讓代理人落在任何狀態，策略 π(s) 對每個狀態都給出動作，代理人看了目前的狀態再決定，所以永遠知道下一步。一串動作可以任意長，長度不是問題；策略也不保證零風險，e-plan 的策略仍有 2.5% 的回合掉進 -10；最佳策略有時反而選擇較長、較安全的路，步數不一定比較少。',
    },
    {
      id: 'q-return', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`rewards = [-1, -1, 9]
gamma = 0.5
G = 0.0
for r in reversed(rewards):
    G = r + gamma * G
print(G)` },
      options: ['0.75', '7.0', '8.25', '3.5'],
      answer: 0, explanation: '從最後一個獎勵往回算：G = 9，接著 G = -1 + 0.5 × 9 = 3.5，再 G = -1 + 0.5 × 3.5 = 0.75，也就是 -1 + 0.5 × (-1) + 0.25 × 9。7.0 是沒有折扣的總和；8.25 把折扣套反了，讓最後的 9 不打折、前面的兩個 -1 打折；3.5 只是迴圈跑到一半時的值。',
    },
    {
      id: 'q-bellman', prompt: '狀態 s 做動作 a：0.8 的機率到價值 V = 5 的狀態，0.2 的機率撞牆留在原地（V(s) = 2）。每走一步的獎勵是 -1，γ = 0.9。Q(s, a) = Σ P(s′ | s, a) [R + γ V(s′)] 是多少？',
      options: ['3.96', '3.5', '2.96', '3.4'],
      answer: 2, explanation: 'Q = 0.8 × (-1 + 0.9 × 5) + 0.2 × (-1 + 0.9 × 2) = 0.8 × 3.5 + 0.2 × 0.8 = 2.8 + 0.16 = 2.96。3.96 漏掉了每步 -1 的獎勵；3.5 只算了機率 0.8 的那個結果（而且沒乘上 0.8），忽略撞牆的情況；3.4 忘了乘上 γ，等於把未來的價值當成不打折。',
    },
    {
      id: 'q-stop', prompt: '價值迭代以 γ = 0.9 執行，某一輪的最大變化 δ = 0.002 小於 θ，於是停止。關於停止時的價值 V，下列何者正確？',
      options: ['V 已經等於最佳價值 V*，誤差是 0', '每個狀態與 V* 的差距不超過 γδ / (1 − γ) = 0.018', '每個狀態與 V* 的差距不超過 δ = 0.002', '只能保證策略最佳，價值的誤差沒有上限'],
      answer: 1, explanation: '收縮的性質給出 |V(s) − V*(s)| ≤ γδ / (1 − γ) = 0.9 × 0.002 / 0.1 = 0.018。迭代只是逼近 V*，有限輪內一般不會剛好相等；δ 只是最後一輪的變化量，之後還會繼續變化並累加，真正的誤差可能比 δ 大；價值的誤差有明確的上限，反而是策略最佳這件事並不由 δ < θ 直接保證。',
    },
    {
      id: 'q-pi', prompt: '關於策略迭代與價值迭代，下列敘述何者正確？',
      options: ['策略迭代交替做策略評估與策略改進，策略不再改變時就得到最佳策略', '策略迭代每一輪都比價值迭代便宜，所以總是比較快', '價值迭代在每一輪結束時都必須先完整評估一個策略', '策略迭代的策略評估同樣要對動作取 max，所以方程是非線性的'],
      answer: 0, explanation: '策略迭代的停止條件就是改進之後策略不變，這時策略滿足貝爾曼最佳方程。它每一輪都要完整評估策略，通常比價值迭代的一輪貴，本課 6 輪中每次評估要 32 到 198 次代入，不能說總是比較快；完整評估策略是策略迭代的步驟，價值迭代每輪只做一次含 max 的更新；評估時動作已由策略固定，沒有 max，方程是線性的。',
    },
    {
      id: 'q-living', prompt: '把本課格子世界的生存獎勵從 -1 改成 -8（γ = 0.9 不變），-10 正下方的 (2, 3) 最佳動作從 < 變成 ^。最好的解釋是什麼？',
      options: ['γ 變小了，代理人變得短視', '-8 讓 +10 的獎勵變成負的，所以代理人不想去 +10', '價值迭代還沒有收斂，策略只是暫時的', '每一步 -8 的成本太高，直接進入 -10 結束回合（這一步共 -18）比繼續繞路付出更多步的成本划算'],
      answer: 3, explanation: '從 (2, 3) 繞到 +10 要好幾步，每步 -8，折扣後的總成本比 -8 + (-10) = -18 更糟，所以最佳策略選擇盡快結束回合。γ 仍然是 0.9，沒有改變；+10 本身的獎勵沒有變，只是走到那裡的路太貴；e-design 每一組都算到 δ < 1e-9，策略是收斂之後的結果。',
    },
    {
      id: 'q-rl', prompt: '機器人換到一間新倉庫，不知道地板有多滑，也就是不知道 P(s′ | s, a)。下列哪個做法最合理？',
      options: ['照樣執行價值迭代，把未知的機率都當成 0', '把 γ 設成 0，就不需要轉移模型', '從實際行動的經驗 (s, a, r, s′) 學習，例如先估計轉移機率再規劃，或用 Q-learning 直接學 Q 值', '只用一條固定的計畫，因為沒有模型就不能有策略'],
      answer: 2, explanation: '模型未知正是強化學習的情境：可以從經驗統計出轉移機率，再用價值迭代規劃（model-based），也可以用 Q-learning 的取樣更新直接學 Q 值（model-free）。把機率都當成 0，每個動作都「哪裡也去不了」，算出的價值沒有意義；γ = 0 只是讓代理人只看下一個獎勵，仍然要知道動作會帶來什麼結果；沒有模型也能學到策略，固定計畫在會滑的地板上本來就不可靠。',
    },
  ],
};
