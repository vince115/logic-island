import type { LessonContent, Mark, TraceStep, TreeNode } from '../schema';

const code = String.raw;

/**
 * AIF07 對抗搜尋與 Minimax. Python only (python-code). Every example and the reference solution run in the curriculum
 * code tests; their outputs were produced by running the programs.
 *
 * The textbook-style 2-ply tree (MAX at the root, three MIN children, nine leaves) is example e-two-ply and the
 * visualization's program. Its minimax value is 3: MIN backs up 3, 2 and 2, MAX takes 3 through B.
 */
const TWO_PLY_TREE: Record<string, (string | number)[]> = { A: ['B', 'C', 'D'], B: [3, 12, 8], C: [2, 4, 6], D: [14, 5, 2] };
const TWO_PLY_CODE = code`tree = {'A': ['B', 'C', 'D'], 'B': [3, 12, 8], 'C': [2, 4, 6], 'D': [14, 5, 2]}

def minimax(node, is_max):
    if isinstance(node, int):  # 葉節點：終局的效用值
        return node
    values = [minimax(child, not is_max) for child in tree[node]]
    value = max(values) if is_max else min(values)
    choice = tree[node][values.index(value)]  # 同分取第一個
    print(f'{node} {"MAX" if is_max else "MIN"} {values} -> {value} via {choice}')
    return value

print('value', minimax('A', True))`;
const TWO_PLY_OUTPUT = 'B MIN [3, 12, 8] -> 3 via 3\nC MIN [2, 4, 6] -> 2 via 2\nD MIN [14, 5, 2] -> 2 via 2\nA MAX [3, 2, 2] -> 3 via B\nvalue 3';

/**
 * The trace code's minimax, run here call by call on TWO_PLY_TREE. The whole game tree is drawn from the start (the
 * leaves' utilities are known; the inner nodes show "?" until their value is backed up). Lines: 6 an inner node starts
 * computing its children, 5 a leaf returns its utility, 9 an inner node takes the max or min and prints, 12 the result.
 * Marks: current = the running call, pending = its callers, visited = finished, read = the child an inner node chose,
 * found = the principal variation at the end. The printed lines are checked against the program's real output.
 */
const traceSteps: TraceStep[] = (() => {
  const steps: TraceStep[] = [];
  const nodes: TreeNode[] = [], label = new Map<string, string>(), status = new Map<string, Mark>();
  const leafValue = new Map<string, number>(), kids = new Map<string, string[]>();
  const role = (isMax: boolean) => (isMax ? 'MAX' : 'MIN');
  const build = (id: string, isMax: boolean) => {
    const node: TreeNode = { id, label: '', children: [] };
    nodes.push(node);
    label.set(id, `${id} ${role(isMax)} ?`);
    const children = TWO_PLY_TREE[id].map((c, k) => {
      if (typeof c === 'string') { build(c, !isMax); return c; }
      const leaf = `${id}${k + 1}`;
      nodes.push({ id: leaf, label: String(c), children: [] });
      label.set(leaf, String(c));
      leafValue.set(leaf, c);
      return leaf;
    });
    node.children = children;
    kids.set(id, children);
  };
  build('A', true);
  const stack: { id: string; name: string; values: number[]; leaf: boolean; returns?: string }[] = [];
  const printed: string[] = [];
  const snap = (line: number, note: string, vars: Record<string, string>, extra: { id: string; kind: Mark }[] = []) => {
    const marks = [...status].filter(([id]) => !extra.some(e => e.id === id)).map(([id, kind]) => ({ id, kind }));
    steps.push({
      line, note, vars, ...(printed.length ? { output: printed.join('\n') } : {}),
      tree: { name: '遊戲樹（MAX 在根，葉節點是 MAX 的效用值）', nodes: nodes.map(n => ({ ...n, label: label.get(n.id)!, children: [...n.children!] })), roots: ['A'], marks: [...marks, ...extra] },
      frames: stack.map(f => ({ name: f.name, vars: (f.leaf ? { node: label.get(f.id)! } : { values: `[${f.values.join(', ')}]` }) as Record<string, string>, ...(f.returns ? { returns: f.returns } : {}) })),
    });
  };
  const enter = (id: string, name: string) => {
    for (const f of stack) status.set(f.id, 'pending');
    status.set(id, 'current');
    stack.push({ id, name, values: [], leaf: leafValue.has(id) });
  };
  const run = (id: string, isMax: boolean, parent?: string): number => {
    const name = `minimax(${leafValue.has(id) ? leafValue.get(id) : `'${id}'`}, ${isMax ? 'True' : 'False'})`;
    enter(id, name);
    if (leafValue.has(id)) {
      const v = leafValue.get(id)!;
      stack.at(-1)!.returns = String(v);
      snap(5, `葉節點 ${v}：這裡遊戲已經結束，效用值（utility）就是 ${v}，直接回傳給 ${parent}。`, { node: String(v), is_max: isMax ? 'True' : 'False' });
      stack.pop();
      status.set(id, 'visited');
      status.set(parent!, 'current');
      return v;
    }
    const frame = stack.at(-1)!;
    snap(6, id === 'A'
      ? 'minimax(\'A\', True)：A 不是葉節點，輪到 MAX（我方）。先把每個子節點的 minimax 值算出來（深度優先，一次走完一個分支）。'
      : `${id} 不是葉節點，輪到 MIN（對手）。逐一計算 ${id} 的三個子節點；A 等 ${id} 回傳之後才會去算下一個分支。`,
    { node: id, is_max: isMax ? 'True' : 'False', values: '[]' });
    for (const child of kids.get(id)!) frame.values.push(run(child, !isMax, id));
    const values = frame.values;
    const value = isMax ? Math.max(...values) : Math.min(...values);
    const k = values.indexOf(value);
    const choice = TWO_PLY_TREE[id][k];
    printed.push(`${id} ${role(isMax)} [${values.join(', ')}] -> ${value} via ${choice}`);
    label.set(id, `${id} ${role(isMax)} = ${value}`);
    frame.returns = String(value);
    snap(9, isMax
      ? `A 是 MAX：values = [${values.join(', ')}]，取最大值 ${value}，來自 ${choice}。C 底下的 4、6 和 D 底下的 14、5 都比 3 大，但 MIN 在 C、D 都會選 2，MAX 不能指望對手讓步。`
      : `${id} 是 MIN：values = [${values.join(', ')}]，取最小值 ${value}。對手會選讓 MAX 得分最低的那一步，所以 ${id} 的 minimax 值是 ${value}（從葉節點「倒推」上來）。`,
    { node: id, is_max: isMax ? 'True' : 'False', values: `[${values.join(', ')}]`, value: String(value), choice: String(choice) },
    [{ id, kind: 'current' }, { id: kids.get(id)![k], kind: 'read' }]);
    stack.pop();
    status.set(id, 'visited');
    if (parent) status.set(parent, 'current');
    return value;
  };
  const value = run('A', true);
  printed.push(`value ${value}`);
  if (printed.join('\n') !== TWO_PLY_OUTPUT) throw new Error(`AIF07: the trace prints ${printed.join(' / ')}, the program prints ${TWO_PLY_OUTPUT}`);
  snap(12, `minimax('A', True) 回傳 ${value}，印出 value ${value}。最佳路線（principal variation）是 A → B → 3：MAX 走向 B，MIN 在 B 選 3。這個 3 是保證：不管 MIN 怎麼下，MAX 走 B 至少拿到 3。`,
    { value: String(value) }, [{ id: 'A', kind: 'found' }, { id: 'B', kind: 'found' }, { id: 'B1', kind: 'found' }]);
  return steps;
})();

export const AIF07: LessonContent = {
  lessonId: 'AIF07',
  motivation: 'AIF04 與 AIF05 的搜尋問題只有一個決策者：動作做下去，結果就確定了。下棋不一樣：你下完一步，對手會挑一步最讓你難受的棋。這時「找一條到達目標的路」不再有意義，因為路的一半由對手決定；要找的是一個策略：不管對手怎麼應，都能保證拿到的最好結果。Minimax 就是這個想法的演算法：在遊戲樹上讓 MAX（我方）取最大、MIN（對手）取最小，從終局一層一層倒推回來。這一課從教科書的兩層小樹開始，接著把井字遊戲的完整遊戲樹算出來（549,946 個節點，只有 5,478 個不同盤面），寫出一個永遠不會輸的井字遊戲 AI；最後說明西洋棋這種大遊戲為什麼一定要用深度限制與評估函數，以及這樣做會付出什麼代價。',
  sections: [
    {
      id: 'zero-sum', title: '零和遊戲：把對局寫成搜尋問題',
      blocks: [
        { type: 'p', text: '本課處理的遊戲有四個條件：兩個玩家輪流下；確定性（deterministic），沒有骰子或洗牌；完全資訊（perfect information），雙方都看得到整個盤面；零和（zero-sum），一方得到的就是另一方失去的。井字遊戲、西洋棋、圍棋、五子棋都符合。零和的意思是兩人的得分加起來永遠是同一個常數，例如贏 +1、輸 −1、和 0，所以只要記錄 MAX 一個人的分數就夠了：MAX 想讓它變大，MIN 想讓它變小，兩人的目標完全相反。' },
        { type: 'p', text: '沿用 AIF04 的形式化，一個遊戲由六個部分組成：初始狀態 s0；PLAYER(s)：狀態 s 輪到誰；ACTIONS(s)：合法的走法；RESULT(s, a)：走了 a 之後的狀態（轉移模型）；TERMINAL-TEST(s)：遊戲是否結束；UTILITY(s)：終局 s 對 MAX 的效用值（utility）。和單人搜尋相比，少了「目標測試」與「路徑成本」，多了「輪到誰」與「終局的分數」。' },
        { type: 'table', head: ['', '單人搜尋（AIF04、AIF05）', '雙人零和遊戲（本課）'], rows: [
          ['決策者', '只有代理人', 'MAX 與 MIN 輪流'],
          ['要找什麼', '一條到達目標的動作序列', '一個策略：對手每一種應對都有對策'],
          ['結束條件', '目標測試', 'TERMINAL-TEST（贏、輸、和）'],
          ['評價', '路徑成本，越小越好', 'UTILITY，MAX 要大、MIN 要小'],
          ['典型演算法', 'BFS、UCS、A*', 'minimax，下一課加上 alpha-beta 剪枝'],
        ] },
        { type: 'table', head: ['', '完全資訊', '不完全資訊'], rows: [
          ['確定性', '井字遊戲、西洋棋、圍棋（本課）', '海戰棋（看不到對方的船）'],
          ['有機率', '西洋雙陸棋（擲骰子，AIF08 的期望 minimax）', '撲克、橋牌（有隱藏的牌又有洗牌）'],
        ] },
        { type: 'callout', tone: 'note', title: '「零和」說的是利益完全對立，不是分數加起來剛好是 0', text: '用「贏 1、和 ½、輸 0」計分的西洋棋，兩人分數加起來永遠是 1，也是零和（更精確的說法是常數和 constant-sum）。重點是一方多得一分，另一方一定少一分，所以不存在雙贏的合作空間。囚犯困境就不是零和：兩人都合作時兩人都比互相背叛好，這種遊戲不能只記一個人的分數，也不能直接用 minimax。' },
      ],
    },
    {
      id: 'game-tree', title: '遊戲樹：MAX 與 MIN 輪流',
      blocks: [
        { type: 'p', text: '遊戲樹（game tree）的根是目前的盤面，每條邊是一步合法的走法，子節點是走完之後的盤面；葉節點是終局，標上 UTILITY 的值。樹的層交替屬於兩個玩家：根輪到 MAX，第二層輪到 MIN，第三層又是 MAX。一個玩家走一步叫做一個 ply（半回合），雙方各走一步才是一個完整的回合，所以「搜尋 2 ply」只是「我走一步、對手回一步」。' },
        { type: 'p', text: '教科書（Russell 與 Norvig 的 AIMA）常用一棵只有兩層的小樹說明：根 A 是 MAX，有三個走法通往 MIN 節點 B、C、D；每個 MIN 節點再有三個走法，通往 9 個終局，效用值是 3、12、8、2、4、6、14、5、2。下面的程式把它寫成 dict：內部節點對應子節點的名稱，葉節點直接是整數。' },
        { type: 'example', id: 'e-two-ply' },
        { type: 'p', text: '輸出的順序就是遞迴的順序：B、C、D 先被算完（後序），A 最後。這和 A12 回溯法的搜尋樹、D13 的後序走訪是同一件事：一個節點的值要等所有子節點回傳之後才能決定。下方的視覺化逐步執行這個程式：內部節點一開始顯示「?」，子節點都回傳後才填上值；被選中的子節點會標記出來，最後一步標出最佳路線 A → B → 3。' },
        { type: 'callout', tone: 'tip', title: '效用值一律從 MAX 的角度寫', text: '葉節點的 14 是「MAX 拿到 14」，不是「輪到誰就是誰拿到 14」。整棵樹只用一種角度，MIN 層才能用「取最小」表示「對手讓 MAX 拿最少」。另一種寫法 negamax 讓每一層都從「輪到的人」的角度看，然後回傳時取負號，結果相同；本課為了讓 MAX、MIN 兩種節點看得清楚，不用這種寫法。' },
      ],
    },
    {
      id: 'minimax', title: 'Minimax 值：倒推出來的保證',
      blocks: [
        { type: 'p', text: '節點 n 的 minimax 值定義成：若 n 是終局，就是 UTILITY(n)；若輪到 MAX，是所有子節點 minimax 值的最大值；若輪到 MIN，是最小值。寫成程式就是一個遞迴函數，從葉節點把值一層一層倒推（back up）到根。MAX 在根的最佳行動，是通往 minimax 值最大的那個子節點的走法。' },
        { type: 'list', items: [
          'MINIMAX(n) = UTILITY(n)，若 n 是終局。',
          'MINIMAX(n) = max 所有子節點 c 的 MINIMAX(c)，若輪到 MAX。',
          'MINIMAX(n) = min 所有子節點 c 的 MINIMAX(c)，若輪到 MIN。',
        ] },
        { type: 'p', text: '根的 minimax 值是一個保證：MAX 依 minimax 選擇行動時，不管 MIN 怎麼下，最後至少拿到這個值；如果 MIN 也照 minimax 下（最佳對手），剛好拿到這個值。在範例的樹上，MAX 走 B 保證至少 3；走 D 雖然有機會拿到 14，但只要 MIN 選 2，MAX 就只有 2。Minimax 為最壞情況做打算，這在零和遊戲裡是合理的，因為對手的利益正好和你相反。這個想法可以追溯到馮紐曼（John von Neumann）1928 年的 minimax 定理。' },
        { type: 'p', text: 'Minimax 是對遊戲樹做完整的深度優先搜尋。若每個節點有 b 個合法走法、遊戲最多 m ply，時間是 O(b^m)；記憶體只需要目前這條路徑上的節點，O(bm)（一次產生所有子節點）或 O(m)（一次產生一個），和 AIF04 的 DFS 相同。時間才是瓶頸：西洋棋平均每步約 35 種走法，雙方各下約 50 步時 35^100 大約是 10^154，根本不可能搜完。' },
        { type: 'callout', tone: 'warning', title: 'MIN 節點不是「我」的選擇，不能也取最大值', text: '常見的錯誤是只寫一個 max：每一層都挑「最好的」子節點，等於假設對手會配合你。在範例的樹上這樣算會得到 14（所有葉節點的最大值），程式會滿懷信心地走向 D，結果對手一步就把你壓到 2。另一個相反的誤解是「對手不一定最強，所以 minimax 沒用」：minimax 值是下限，對手犯錯時你只會拿得更多，只是不會主動去「設陷阱」利用對手的弱點。' },
      ],
    },
    {
      id: 'tic-tac-toe', title: '井字遊戲：完整搜尋做得到',
      blocks: [
        { type: 'p', text: '井字遊戲的盤面用 9 個字元的字串表示，格子編號 0–8 由左到右、由上到下（第一列 0 1 2、第二列 3 4 5、第三列 6 7 8），X 先手。輪到誰不必另外記：X 和 O 的數量相同時輪到 X，X 多一個時輪到 O。終局是有人連成一線，或是 9 格都滿了。效用值以 X 為 MAX：X 贏 +1、和局 0、O 贏 −1。' },
        { type: 'example', id: 'e-count' },
        { type: 'table', head: ['數量', '值', '說明'], rows: [
          ['完整遊戲樹的節點數', '549,946', '分出勝負就停；同一個盤面從不同順序到達算不同節點'],
          ['其中的葉節點（不同的對局）', '255,168', 'X 勝 131,184、O 勝 77,904、和局 46,080'],
          ['不同的盤面（可達狀態）', '5,478', '把相同的字串只算一次'],
          ['若分出勝負也不停', '986,410', '1 + 9 + 9×8 + … + 9!，第 9 層有 9! = 362,880 個'],
          ['3^9（每格三種狀態）', '19,683', '包含 X 比 O 多兩個這類不可能出現的盤面'],
        ] },
        { type: 'p', text: '55 萬個節點對電腦很輕鬆，所以井字遊戲可以完整搜尋，算出真正的 minimax 值。更省的做法是記憶化（memoization，A17 的技巧）：用盤面字串當 dict 的鍵，同一個盤面只算一次，搜尋量從 549,946 個節點降到 5,478 個盤面。遊戲樹因此變成一張圖（不同順序走到同一個盤面），這和 AIF04 圖搜尋用已探索集合避免重複，是同一個觀察。' },
        { type: 'example', id: 'e-ttt' },
        { type: 'p', text: '空盤的值是 0：雙方都不犯錯時，井字遊戲一定和局，而且 9 個開局全都是 0，同分規則讓 X 選格 0。每一行最後的分數表就是在遊戲樹上「解釋這一步」：`XX.OO....` 只有格 2 是 +1（立刻連線）；`X.X.O....` 輪到 O，只有擋在格 1 是 0，其他走法都讓 X 贏；`X...O...X` 是經典的陷阱，O 下角落（2、6）會輸，因為 X 會在另一個角落做出雙重威脅（fork），O 必須下邊（1、3、5、7）。' },
        { type: 'callout', tone: 'warning', title: '值相同的走法不一定一樣快：同分取最小格可能拖延勝利', text: '盤面 `XO.OX....` 輪到 X，下格 8 立刻連成對角線，但本課的 best_move 回傳格 2：格 2 做出雙重威脅，兩步後也必勝，值同樣是 +1，而 2 < 8。對 minimax 而言「贏」就是 +1，不分快慢。想要 AI 盡快獲勝、輸也要拖久一點，可以把效用改成和步數有關，例如 X 贏時給 10 − 已下的步數、O 贏時給 −(10 − 已下的步數)；值的大小關係改變了，選出來的走法也會跟著改變。' },
      ],
    },
    {
      id: 'never-lose', title: '一個永遠不會輸的 AI，以及如何驗證它',
      blocks: [
        { type: 'p', text: '「AI 依 minimax 選擇行動」代表：輪到 AI 時，它選 minimax 值對自己最好的走法（AI 是 X 就取最大，是 O 就取最小）。因為井字遊戲雙方最佳時是和局，這個 AI 在任何一局都至少和局。這個說法可以直接驗證：讓 AI 下其中一方，對手的每一步都試遍所有空格，走完所有可能的對局，數一數 AI 輸了幾局。' },
        { type: 'example', id: 'e-never-lose' },
        { type: 'p', text: '兩種執先都是 0 敗。AI 當 X 時，對手所有的應對加起來只有 101 局（AI 每一步只走一種），其中 99 局 AI 贏；當 O 時有 681 局，498 局贏。這也說明 minimax 對犯錯的對手會贏，不只是不輸：對手一旦走出值變差的一步，AI 下一步選的就是對自己更好的值。這個窮舉的檢查只在遊戲樹小的時候做得到，正是井字遊戲適合拿來驗證 minimax 實作的原因。' },
        { type: 'table', head: ['AI 執', '對局數', 'AI 勝', '和局', 'AI 敗'], rows: [
          ['X（先手）', '101', '99', '2', '0'],
          ['O（後手）', '681', '498', '183', '0'],
        ] },
        { type: 'callout', tone: 'tip', title: '解釋 AI 的一步：列出每個走法的值', text: '要說明 AI 為什麼這樣下，就把根節點每個子節點的 minimax 值都印出來（e-ttt 的分數表）：被選中的走法值最好；同分時看同分規則；其他走法比較差的原因，就是對手在那棵子樹裡有一個更好的應對，可以再往下列出對手那一層的值。練習題就要求你印出值與走法，並固定說明同分規則。' },
      ],
    },
    {
      id: 'depth-limit', title: '深度限制與評估函數',
      blocks: [
        { type: 'p', text: '大部分遊戲沒辦法搜到終局。Claude Shannon 在 1950 年討論電腦下西洋棋時，就提出現在仍在用的做法：只往下搜固定的深度（depth limit），到了深度限制還沒結束的盤面，就用評估函數（evaluation function）EVAL(s) 估計它對 MAX 有多好，當成這個節點的值，再照常做 minimax 倒推。也就是把 TERMINAL-TEST 換成 CUTOFF-TEST（終局或深度用完），把 UTILITY 換成 EVAL。' },
        { type: 'list', items: [
          '終局仍用真正的效用值，而且要比任何評估值都極端（下面的範例用 ±100，評估值最多到 ±8），已知的勝負才不會被估計值蓋過。',
          '評估函數要算得快，因為每個截斷的節點都要算一次。',
          '評估值要和獲勝機會一致：越大代表 MAX 越可能贏。西洋棋的傳統做法是子力加權總和，兵 1、馬與象 3、車 5、后 9，再加上位置因素。',
        ] },
        { type: 'p', text: '井字遊戲的一個簡單評估函數：X 還有機會連成的線數（線上沒有 O）減去 O 還有機會連成的線數。空盤上 X 下中央得 4、下角落得 3、下邊得 2，符合一般的經驗。下面的範例在 `X...O...X`（輪到 O）上用不同的深度限制搜尋，分數表是每個走法倒推上來的值，O 取最小值，同分取最小格。' },
        { type: 'example', id: 'e-depth' },
        { type: 'p', text: '深度 1、2 時，O 選角落 2，這正是完整搜尋（深度 9）證明會輸的走法：O 下 2 之後，X 擋在 6 並同時威脅 3 與 7，O 只能擋一個，X 在第 4 ply 獲勝。敗局在 4 ply 之外，深度 1、2 看不到，只看到評估值，而評估函數覺得角落「封掉 X 比較多條線」。深度 3 時六個走法剛好都是 −1，同分規則選了 1，結果正確只是巧合；深度 4 才真正看到角落的值是 +100。這種「壞結果剛好落在搜尋深度之外」的現象叫做地平線效應（horizon effect）。' },
        { type: 'table', head: ['深度限制', '選擇', '展開節點', '角落 2 的值', '說明'], rows: [
          ['1', '2（錯）', '7', '−1', '只看評估值'],
          ['2', '2（錯）', '37', '0', '仍看不到 X 的雙重威脅'],
          ['3', '1', '157', '−1', '所有走法同分，靠同分規則碰巧選對'],
          ['4', '1', '445', '+100', '看到 X 在第 4 ply 獲勝'],
          ['9（完整）', '1', '1,053', '+100', '真正的 minimax 值'],
        ] },
        { type: 'callout', tone: 'warning', title: '「搜得越深一定越好」與「評估函數準就不必搜」都不對', text: '深度增加時展開的節點大約乘上分支因子，時間很快就不夠用，所以實際程式常用 AIF04 的迭代加深：深度 1、2、3… 一輪一輪搜，時間到了就用最後一輪完整的結果。結果也不保證隨深度單調變好：上面的深度 3 選對只是同分的巧合，換一個同分規則就會選錯。反過來，評估函數再好也只是估計；正確的做法是兩者搭配，並在吃子等局勢劇烈變化的盤面多搜幾步（靜止搜尋，quiescence search），減少地平線效應。' },
        { type: 'p', text: '有了深度限制，下一個問題是怎麼在同樣的時間內搜得更深。很多子樹其實不必看完：在範例的兩層樹上，C 的第一個葉節點是 2，MIN 在 C 最多只給 2，已經比 B 的 3 差，C 剩下的 4 和 6 不用看。這就是下一課（AIF08）alpha-beta 剪枝的想法：結果和 minimax 完全相同，但跳過不會影響結果的分支。1997 年擊敗世界冠軍卡斯帕洛夫（Garry Kasparov）的 IBM Deep Blue，核心就是深度限制的 minimax、alpha-beta 剪枝與精心設計的評估函數。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-two-ply', title: '教科書的兩層遊戲樹',
      description: 'MAX 在根，三個 MIN 節點各有三個終局。每個內部節點算完時印出子節點的值、倒推的結果與選中的子節點（同分取第一個）。',
      code: { Python: TWO_PLY_CODE },
      output: TWO_PLY_OUTPUT,
    },
    {
      id: 'e-count', title: '數出井字遊戲的完整遊戲樹',
      description: '不記憶化，從空盤走遍每一種下法，分出勝負或下滿就停。依深度數節點、數三種結局，並記下出現過的不同盤面。',
      code: { Python: code`LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
by_depth = [0] * 10
results = {'X': 0, 'O': 0, 'draw': 0}
seen = set()

def winner(b):
    for i, j, k in LINES:
        if b[i] != '.' and b[i] == b[j] == b[k]:
            return b[i]
    return None

def walk(b, depth):
    """走過完整的遊戲樹：不記憶化，同一個盤面從不同順序到達就算不同節點。"""
    by_depth[depth] += 1
    seen.add(b)
    w = winner(b)
    if w or depth == 9:
        results[w or 'draw'] += 1  # 葉節點：一局結束
        return
    turn = 'X' if depth % 2 == 0 else 'O'
    for i in range(9):
        if b[i] == '.':
            walk(b[:i] + turn + b[i + 1:], depth + 1)

walk('.' * 9, 0)
print('nodes by depth:', by_depth)
print('total nodes:', sum(by_depth))
print('games (leaves):', sum(results.values()), results)
print('distinct positions:', len(seen))` },
      output: "nodes by depth: [1, 9, 72, 504, 3024, 15120, 54720, 148176, 200448, 127872]\ntotal nodes: 549946\ngames (leaves): 255168 {'X': 131184, 'O': 77904, 'draw': 46080}\ndistinct positions: 5478",
    },
    {
      id: 'e-ttt', title: '井字遊戲的 minimax：最佳走法與每一步的值',
      description: '以盤面字串記憶化的 minimax，回傳 (值, 最佳格)。格子依索引由小到大嘗試，同分取最小的格，所以結果完全確定。每個盤面也印出所有走法的值。',
      code: { Python: code`LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
memo = {}

def winner(b):
    for i, j, k in LINES:
        if b[i] != '.' and b[i] == b[j] == b[k]:
            return b[i]
    return None

def best_move(b):
    """回傳 (值, 格)：值以 X 的角度（X 贏 1、和局 0、O 贏 -1），同分取最小的格。"""
    if b not in memo:  # 記憶化：同一個盤面只算一次
        w = winner(b)
        if w or '.' not in b:
            memo[b] = ({'X': 1, 'O': -1}.get(w, 0), None)
        else:
            turn = 'X' if b.count('X') == b.count('O') else 'O'  # X 先手
            options = [(best_move(b[:i] + turn + b[i + 1:])[0], i) for i in range(9) if b[i] == '.']
            value = (max if turn == 'X' else min)(v for v, _ in options)
            memo[b] = (value, min(i for v, i in options if v == value))
    return memo[b]

for b in ['.........', 'XX.OO....', 'X.X.O....', 'X...O...X', 'XO.......']:
    turn = 'X' if b.count('X') == b.count('O') else 'O'
    value, move = best_move(b)
    scores = ' '.join(f'{i}:{best_move(b[:i] + turn + b[i + 1:])[0]}' for i in range(9) if b[i] == '.')
    print(f'{b} turn={turn} value={value} best={move} | {scores}')
print('positions in memo:', len(memo))` },
      output: '......... turn=X value=0 best=0 | 0:0 1:0 2:0 3:0 4:0 5:0 6:0 7:0 8:0\nXX.OO.... turn=X value=1 best=2 | 2:1 5:0 6:-1 7:-1 8:-1\nX.X.O.... turn=O value=0 best=1 | 1:0 3:1 5:1 6:1 7:1 8:1\nX...O...X turn=O value=0 best=1 | 1:0 2:1 3:0 5:0 6:1 7:0\nXO....... turn=X value=1 best=3 | 2:0 3:1 4:1 5:0 6:1 7:0 8:0\npositions in memo: 5478',
    },
    {
      id: 'e-never-lose', title: '驗證：minimax AI 對任何對手都不會輸',
      description: 'AI 下其中一方，每一步都用 best_move；對手的每一步都試遍所有空格。走完所有可能的對局，統計 AI 的勝、和、敗。',
      code: { Python: code`LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
memo = {}

def winner(b):
    for i, j, k in LINES:
        if b[i] != '.' and b[i] == b[j] == b[k]:
            return b[i]
    return None

def best_move(b):
    """回傳 (值, 格)：值以 X 的角度，同分取最小的格；以盤面字串記憶化。"""
    if b not in memo:
        w = winner(b)
        if w or '.' not in b:
            memo[b] = ({'X': 1, 'O': -1}.get(w, 0), None)
        else:
            turn = 'X' if b.count('X') == b.count('O') else 'O'
            options = [(best_move(b[:i] + turn + b[i + 1:])[0], i) for i in range(9) if b[i] == '.']
            value = (max if turn == 'X' else min)(v for v, _ in options)
            memo[b] = (value, min(i for v, i in options if v == value))
    return memo[b]

def play_all(b, ai, tally):
    """AI 下 ai 那一方；對手每一步都試遍所有空格。"""
    w = winner(b)
    if w or '.' not in b:
        tally['draw' if not w else 'win' if w == ai else 'loss'] += 1
        return
    turn = 'X' if b.count('X') == b.count('O') else 'O'
    moves = [best_move(b)[1]] if turn == ai else [i for i in range(9) if b[i] == '.']
    for i in moves:
        play_all(b[:i] + turn + b[i + 1:], ai, tally)

for ai in 'XO':
    tally = {'win': 0, 'draw': 0, 'loss': 0}
    play_all('.' * 9, ai, tally)
    print(f'AI plays {ai}: {tally}')` },
      output: "AI plays X: {'win': 99, 'draw': 2, 'loss': 0}\nAI plays O: {'win': 498, 'draw': 183, 'loss': 0}",
    },
    {
      id: 'e-depth', title: '深度限制的 minimax 與評估函數',
      description: '到了深度限制就用 evaluate（X 的開放線數 − O 的開放線數）代替真正的值，終局給 ±100。在 X...O...X（輪到 O）上比較不同深度選出的走法、每個走法的值與展開的節點數。',
      code: { Python: code`LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]

def winner(b):
    for i, j, k in LINES:
        if b[i] != '.' and b[i] == b[j] == b[k]:
            return b[i]
    return None

def evaluate(b):
    """X 還有機會連成的線數 − O 還有機會連成的線數。"""
    x_open = sum(1 for line in LINES if all(b[i] != 'O' for i in line))
    o_open = sum(1 for line in LINES if all(b[i] != 'X' for i in line))
    return x_open - o_open

def minimax(b, depth, stats):
    stats['nodes'] += 1
    w = winner(b)
    if w:
        return 100 if w == 'X' else -100  # 真的分出勝負：比任何評估值都極端
    if '.' not in b:
        return 0
    if depth == 0:
        return evaluate(b)  # 深度用完：用評估函數代替真正的值
    turn = 'X' if b.count('X') == b.count('O') else 'O'
    values = [minimax(b[:i] + turn + b[i + 1:], depth - 1, stats) for i in range(9) if b[i] == '.']
    return max(values) if turn == 'X' else min(values)

def choose(b, depth):
    turn = 'X' if b.count('X') == b.count('O') else 'O'
    stats = {'nodes': 1}
    scores = {i: minimax(b[:i] + turn + b[i + 1:], depth - 1, stats) for i in range(9) if b[i] == '.'}
    move = (max if turn == 'X' else min)(scores, key=scores.get)  # 同分取最小的格
    return move, scores, stats['nodes']

for i in [4, 0, 1]:
    print(f'X at {i}: evaluate={evaluate("." * i + "X" + "." * (8 - i))}')
for depth in [1, 2, 3, 4, 9]:
    move, scores, nodes = choose('X...O...X', depth)  # 輪到 O
    shown = ' '.join(f'{i}:{v}' for i, v in scores.items())
    print(f'depth={depth} move={move} nodes={nodes:4} | {shown}')` },
      output: 'X at 4: evaluate=4\nX at 0: evaluate=3\nX at 1: evaluate=2\ndepth=1 move=2 nodes=   7 | 1:0 2:-1 3:0 5:0 6:-1 7:0\ndepth=2 move=2 nodes=  37 | 1:1 2:0 3:1 5:1 6:0 7:1\ndepth=3 move=1 nodes= 157 | 1:-1 2:-1 3:-1 5:-1 6:-1 7:-1\ndepth=4 move=1 nodes= 445 | 1:0 2:100 3:0 5:0 6:100 7:0\ndepth=9 move=1 nodes=1053 | 1:0 2:100 3:0 5:0 6:100 7:0',
    },
  ],
  exercises: [
    {
      id: 'x-ttt-minimax', title: '井字遊戲的 minimax 對手',
      statement: '讀入一個井字遊戲的盤面，判斷它是否合法；合法而且還沒結束時，用完整的 minimax 算出盤面的值與輪到的一方的最佳走法。規則：X 先手，所以 X 與 O 一樣多時輪到 X，X 多一個時輪到 O。值以 X 的角度表示：雙方都下最佳時 X 會贏是 1、和局是 0、O 會贏是 -1。輪到 X 時選值最大的走法，輪到 O 時選值最小的走法；同分規則：值相同的走法中，選列最小的，列相同再選行最小的（也就是格子索引 0–8 最小的）。盤面依下列順序檢查，印出第一個符合的訊息：格式不合規定印 `invalid input`；X 的數量不是 O 或 O + 1 印 `invalid board: bad counts`；X 與 O 都連成一線印 `invalid board: two winners`；X 連成一線但 X 不比 O 多一個、或 O 連成一線但 X 與 O 數量不同（有人在分出勝負後還繼續下）印 `invalid board: move after win`；遊戲已經結束時印 `game over: X wins`、`game over: O wins` 或 `game over: draw`（9 格下滿且沒有人連線）。',
      inputFormat: '三行，每行恰好 3 個字元，只能是 `X`、`O` 或 `.`（空格子）。行首行尾的空白與空行會被忽略。',
      outputFormat: '合法且未結束：三行 `turn P`（輪到 X 或 O）、`value V`（1、0 或 -1）、`move r c`（最佳走法的列與行，從 1 開始）。其他情況印上面規定的一行訊息。',
      constraints: ['盤面 3 × 3，格子只會是 X、O 或 .', '值以 X 的角度：1、0、-1', '同分時選格子索引（列 × 3 + 行，從 0 開始）最小的走法', '用盤面字串記憶化，每個測資都能在一秒內完成'],
      samples: [
        { kind: 'normal', input: 'X.X\n.O.\n...\n', output: 'turn O\nvalue 0\nmove 1 2\n', note: 'X 在第一列兩端，O 必須擋在中間；擋住之後雙方最佳是和局' },
        { kind: 'normal', input: 'XX.\nOO.\n...\n', output: 'turn X\nvalue 1\nmove 1 3\n', note: '雙方都差一格就連線，輪到 X，X 先下格 2 獲勝' },
      ],
      tests: [
        { kind: 'normal', input: 'X..\n.O.\n..X\n', output: 'turn O\nvalue 0\nmove 1 2\n', note: '對角陷阱：O 下角落會被雙重威脅，只有下邊才和局，同分選第一列第二行' },
        { kind: 'normal', input: 'XO.\n...\n...\n', output: 'turn X\nvalue 1\nmove 2 1\n', note: 'O 第一步下在角落旁邊的邊，X 可以強迫獲勝' },
        { kind: 'normal', input: 'XO.\nOX.\n...\n', output: 'turn X\nvalue 1\nmove 1 3\n', note: '格 2 做出雙重威脅、格 8 立刻獲勝，值都是 1，同分規則選索引較小的格 2' },
        { kind: 'normal', input: 'OX.\n.X.\n...\n', output: 'turn O\nvalue 0\nmove 3 2\n', note: 'X 在中間一行連兩個，O 必須擋在第三列第二行' },
        { kind: 'normal', input: 'O..\n.X.\n...\n', output: 'turn X\nvalue 0\nmove 1 2\n', note: '盤面不記先後順序，只看數量：X、O 各一個時輪到 X' },
        { kind: 'edge', input: '...\n...\n...\n', output: 'turn X\nvalue 0\nmove 1 1\n', note: '空盤：完整搜尋最多的情況，值 0，九個走法同分選格 0' },
        { kind: 'edge', input: 'X..\n...\n...\n', output: 'turn O\nvalue 0\nmove 2 2\n', note: 'X 佔角落時 O 只有下中央不會輸' },
        { kind: 'edge', input: 'XOX\nXOO\nOX.\n', output: 'turn X\nvalue 0\nmove 3 3\n', note: '只剩一格：唯一的走法，結果和局' },
        { kind: 'edge', input: 'OO.\nX..\nX..\n', output: 'turn X\nvalue -1\nmove 1 3\n', note: '每個走法都輸：值 -1，仍依同分規則選格 2' },
        { kind: 'edge', input: '  XX.\n\nXO.\n OO.  \n', output: 'turn X\nvalue 1\nmove 1 3\n', note: '行首行尾的空白與空行被忽略；X 下格 2 連成第一列' },
        { kind: 'error', input: 'XX.\n...\n...\n', output: 'invalid board: bad counts\n', note: 'X 比 O 多兩個' },
        { kind: 'error', input: 'O..\n...\n...\n', output: 'invalid board: bad counts\n', note: 'O 比 X 多：O 不可能先手' },
        { kind: 'error', input: 'XOX\nOXO\nO..\n', output: 'invalid board: bad counts\n', note: 'O 有 4 個、X 只有 3 個' },
        { kind: 'error', input: 'XO.\nXO.\nXO.\n', output: 'invalid board: two winners\n', note: 'X 連成第一行、O 連成第二行：數量雖然合法也不可能出現' },
        { kind: 'error', input: 'XO.\nXO.\nX.O\n', output: 'invalid board: move after win\n', note: 'X 已經連成第一行，O 卻又多下了一步' },
        { kind: 'error', input: 'OOO\nXX.\nXX.\n', output: 'invalid board: move after win\n', note: 'O 已經連線，X 卻又多下了一步' },
        { kind: 'error', input: 'XO.\nXO.\nX..\n', output: 'game over: X wins\n', note: 'X 已經連成第一行，沒有下一步' },
        { kind: 'error', input: 'OOO\nXX.\nX..\n', output: 'game over: O wins\n', note: 'O 已經贏了，沒有下一步' },
        { kind: 'error', input: 'XOX\nXOO\nOXX\n', output: 'game over: draw\n', note: '9 格下滿，沒有人連線' },
        { kind: 'error', input: 'XAX\n.O.\n...\n', output: 'invalid input\n', note: '出現規定以外的字元 A' },
        { kind: 'error', input: 'X.\n.O.\n...\n', output: 'invalid input\n', note: '第一行只有 2 個字元' },
        { kind: 'error', input: 'X..\n.O.\n', output: 'invalid input\n', note: '只有兩行' },
      ],
      hints: [
        '先寫 `wins(b, p)`：8 條線中是否有一條三格都是 p。合法性的檢查全部用 X、O 的數量與兩個 wins 的結果組合出來。',
        '盤面合成 9 個字元的字串，直接當 memo 的鍵；終局的值是 1、-1 或 0。',
        '格子依 0 到 8 的順序嘗試，記下每個走法的值，取最大（X）或最小（O）的值，再從值相同的走法中取索引最小的。',
        '索引 i 對應的列與行是 `i // 3 + 1` 與 `i % 3 + 1`。',
      ],
      solution: { Python: code`import sys

LINES = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
memo = {}

def wins(b, p):
    return any(b[i] == b[j] == b[k] == p for i, j, k in LINES)

def best_move(b):
    """回傳 (值, 格)：值以 X 的角度，同分取索引最小的格；以盤面字串記憶化。"""
    if b not in memo:
        if wins(b, 'X') or wins(b, 'O') or '.' not in b:
            memo[b] = (1 if wins(b, 'X') else -1 if wins(b, 'O') else 0, None)
        else:
            turn = 'X' if b.count('X') == b.count('O') else 'O'
            options = [(best_move(b[:i] + turn + b[i + 1:])[0], i) for i in range(9) if b[i] == '.']
            value = (max if turn == 'X' else min)(v for v, _ in options)
            memo[b] = (value, min(i for v, i in options if v == value))
    return memo[b]

def solve(lines):
    rows = [line.strip() for line in lines if line.strip()]
    if len(rows) != 3 or any(len(r) != 3 or set(r) - set('XO.') for r in rows):
        return ['invalid input']
    b = ''.join(rows)
    x, o = b.count('X'), b.count('O')
    x_wins, o_wins = wins(b, 'X'), wins(b, 'O')
    if x not in (o, o + 1):
        return ['invalid board: bad counts']
    if x_wins and o_wins:
        return ['invalid board: two winners']
    if (x_wins and x != o + 1) or (o_wins and x != o):
        return ['invalid board: move after win']
    if x_wins or o_wins:
        return [f'game over: {"X" if x_wins else "O"} wins']
    if '.' not in b:
        return ['game over: draw']
    value, move = best_move(b)
    return [f'turn {"X" if x == o else "O"}', f'value {value}', f'move {move // 3 + 1} {move % 3 + 1}']

print('\n'.join(solve(sys.stdin.read().split('\n'))))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: 'Minimax：從葉節點把值倒推回根', language: 'Python',
    code: TWO_PLY_CODE,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-value', prompt: '根 R 是 MAX，下面的程式印出什麼？',
      code: { language: 'Python', text: code`tree = {'R': ['L', 'M'], 'L': [4, 9, 1], 'M': [6, 5, 7]}

def minimax(node, is_max):
    if isinstance(node, int):
        return node
    values = [minimax(child, not is_max) for child in tree[node]]
    return max(values) if is_max else min(values)

print(minimax('R', True))` },
      options: ['9', '1', '5', '6'],
      answer: 2, explanation: 'L 與 M 是 MIN 節點：L 取 min(4, 9, 1) = 1，M 取 min(6, 5, 7) = 5；R 是 MAX，取 max(1, 5) = 5。「9」是所有葉節點的最大值，等於假設對手會配合；「1」是 L 的值，忘了根要取最大；「6」是 M 的第一個葉節點，沒有在 M 取最小值。（已實際執行：印出 5。）',
    },
    {
      id: 'q-zero-sum', prompt: '下列哪一個遊戲符合本課 minimax 直接處理的條件：兩人、零和、確定性、完全資訊？',
      options: ['德州撲克', '西洋雙陸棋（backgammon）', '囚犯困境', '西洋棋'],
      answer: 3, explanation: '西洋棋兩人輪流、沒有隨機性、雙方看得到整個盤面，而且一方贏就是另一方輸。德州撲克有看不到的手牌（不完全資訊）也有洗牌；西洋雙陸棋要擲骰子，需要加入機率節點的期望 minimax（AIF08）；囚犯困境不是零和，兩人都合作時兩人都比互相背叛好，不能只記一個人的分數。',
    },
    {
      id: 'q-bug', prompt: '下面的 minimax 少了一個 not，在教科書的兩層樹上印出什麼？',
      code: { language: 'Python', text: code`tree = {'A': ['B', 'C', 'D'], 'B': [3, 12, 8], 'C': [2, 4, 6], 'D': [14, 5, 2]}

def minimax(node, is_max):
    if isinstance(node, int):
        return node
    values = [minimax(child, is_max) for child in tree[node]]  # 少了 not
    return max(values) if is_max else min(values)

print(minimax('A', True))` },
      options: ['3', '14', '2', '12'],
      answer: 1, explanation: 'is_max 沒有翻轉，每一層都是 MAX：B、C、D 分別取 12、6、14，A 再取最大 14，等於假設對手會幫你走到最好的葉節點。「3」是正確的 minimax 值，要在 MIN 層取最小才得到；「2」是每一層都取最小（傳入 False）時的結果；「12」只是 B 底下的最大值，A 還會比較 C、D。（已實際執行：印出 14。）',
    },
    {
      id: 'q-count', prompt: '井字遊戲從空盤開始、分出勝負就停的完整遊戲樹有幾個節點？以盤面字串記憶化之後，又只需要算幾個不同的盤面？',
      options: ['549,946 個節點，5,478 個盤面', '362,880 個節點，5,478 個盤面', '255,168 個節點，549,946 個盤面', '986,410 個節點，19,683 個盤面'],
      answer: 0, explanation: 'e-count 實際走完整棵樹：各深度加起來 549,946 個節點，出現過的不同字串 5,478 個，e-ttt 的 memo 大小也是 5,478。362,880 = 9! 是「下滿 9 格」的下法數，不是節點數；255,168 是葉節點（不同的對局）數，不是盤面數；986,410 是分出勝負也繼續下的節點數，19,683 = 3^9 還包含 X 比 O 多兩個這類不可達的盤面。',
    },
    {
      id: 'q-tie', prompt: '盤面 `XO.OX....`（第一列 X O .、第二列 O X .、第三列空），輪到 X。本課 e-ttt 的 best_move（值以 X 的角度，同分取最小的格）回傳哪一格？',
      options: ['格 8', '格 2', '格 6', '格 5'],
      answer: 1, explanation: '各走法的值是 2:1、5:0、6:1、7:0、8:1。格 2 和格 6 都做出雙重威脅（O 只能擋一個），格 8 立刻連成對角線，三者的值都是 1，同分取最小的格 2。「格 8」是人會選的立刻獲勝，但 minimax 只看值、不看快慢；「格 6」也是 1，但索引比 2 大；「格 5」的值是 0，只能和局。（已實際執行：回傳 (1, 2)。）',
    },
    {
      id: 'q-horizon', prompt: '在 `X...O...X`（輪到 O）上，深度限制 2 的 minimax（評估函數 = X 的開放線數 − O 的開放線數）選了角落 2，完整搜尋卻證明它會輸。最主要的原因是？',
      options: ['評估函數寫錯了：換成任何正確的評估函數，深度 2 都不會選角落', '同分規則選錯了：改成取最大的格就會選對', 'X 的雙重威脅要到第 4 ply 才分出勝負，深度 2 只看到評估值（地平線效應）', '深度限制的 minimax 不會考慮對手，所以看不到 X 的反擊'],
      answer: 2, explanation: 'O 下 2 之後，X 擋 6 並同時威脅兩條線，O 擋一條、X 在第 4 ply 連線，敗局在搜尋深度之外，深度 2 只能靠評估值判斷，深度 4 才看到 +100。評估函數只是估計，沒有一個簡單的函數能在所有盤面替代搜尋；深度 2 時兩個角落 2、6 的值都是 0，改成取最大的格只會換成同樣會輸的角落 6，問題不在同分規則；深度限制的 minimax 仍然在 MIN、MAX 層交替，只是在截斷處改用評估值。（已實際執行 e-depth 驗證。）',
    },
    {
      id: 'q-meaning', prompt: '根節點（MAX）的 minimax 值是 3，代表什麼？',
      options: ['MAX 依 minimax 行動時，不管 MIN 怎麼下都至少拿到 3；MIN 也下最佳時剛好是 3', 'MAX 在所有可能的對局中平均拿到 3', 'MAX 在最好的情況下能拿到 3，運氣差時會更少', 'MIN 依 minimax 行動時至少拿到 3'],
      answer: 0, explanation: 'Minimax 值是對最壞情況的保證：MAX 照 minimax 選擇時，對手的任何應對都不會讓結果低於 3，而最佳的對手剛好讓它等於 3。它不是平均值，平均要假設對手隨機下（那是機率節點的期望值）；它也不是最好情況，教科書樹上最好情況是 14；效用值從 MAX 的角度寫，MIN 想讓它越小越好，「MIN 至少拿到 3」把方向弄反了。',
    },
  ],
};
