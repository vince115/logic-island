import type { LessonContent, Mark, TraceStep, TreeNode } from '../schema';

const code = String.raw;

/*
 * AIF15 貝氏網路 (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * The lesson's network is a burglary/alarm-style network with the lesson's own numbers: B (burglary) and E (earthquake)
 * are parents of A (alarm), and A is the parent of N (the neighbour calls) and G (the guard company calls). The
 * visualization runs ENUM_CODE (example e-enumerate): inference by enumeration of P(B | N=T, G=T). traceSteps() repeats
 * that program's recursion call by call with exact fractions (bigint), so every factor, path product and return value
 * comes from actually running the same rule; the printed lines are checked against ENUM_OUTPUT, which the lesson test
 * compares with Python's real output.
 */
const ENUM_CODE = code`from fractions import Fraction as F

# 每個變數：(父節點, CPT)；CPT 的鍵是父節點的值，值是 P(變數=True | 父節點)
NET = {
    'B': ((), {(): F(1, 100)}),
    'E': ((), {(): F(1, 50)}),
    'A': (('B', 'E'), {(True, True): F(19, 20), (True, False): F(9, 10),
                       (False, True): F(3, 10), (False, False): F(1, 100)}),
    'N': (('A',), {(True,): F(9, 10), (False,): F(1, 20)}),
    'G': (('A',), {(True,): F(7, 10), (False,): F(1, 100)}),
}
ORDER = ['B', 'E', 'A', 'N', 'G']  # 拓撲順序：父節點一定排在前面

def prob(var, world):
    parents, cpt = NET[var]
    p = cpt[tuple(world[q] for q in parents)]
    return p if world[var] else 1 - p

def enumerate_all(i, world):
    """從 ORDER[i] 起，乘上已知變數的 CPT 值，把隱藏變數加總掉。"""
    factor = F(1)
    while i < len(ORDER) and ORDER[i] in world:  # 已知的值：乘上 CPT，不分支
        factor *= prob(ORDER[i], world)
        i += 1
    if i == len(ORDER):
        return factor
    y = ORDER[i]  # 隱藏變數：True、False 各走一個分支
    return factor * sum(enumerate_all(i, {**world, y: v}) for v in (True, False))

evidence = {'N': True, 'G': True}
score = {b: enumerate_all(0, {**evidence, 'B': b}) for b in (True, False)}
total = score[True] + score[False]
print('P(B=T, n, g) =', score[True])
print('P(B=F, n, g) =', score[False])
print('P(n, g) =', total)
print(f'P(B=T | n, g) = {score[True] / total} = {float(score[True] / total):.4f}')`;
const ENUM_OUTPUT = 'P(B=T, n, g) = 1135359/200000000\nP(B=F, n, g) = 10341639/1000000000\nP(n, g) = 8009217/500000000\nP(B=T | n, g) = 630755/1779826 = 0.3544';

/** Exact fractions, as Python's fractions.Fraction prints them. */
type Q = readonly [bigint, bigint];
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
const frac = (n: bigint, d: bigint): Q => { const g = gcd(n, d); return [n / g, d / g]; };
const mul = (a: Q, b: Q) => frac(a[0] * b[0], a[1] * b[1]);
const add = (a: Q, b: Q) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const div = (a: Q, b: Q) => frac(a[0] * b[1], a[1] * b[0]);
const show = (a: Q) => (a[1] === 1n ? `${a[0]}` : `${a[0]}/${a[1]}`);
const decimal = (a: Q) => (Number(a[0]) / Number(a[1])).toFixed(4);
const ONE = frac(1n, 1n);

/** The trace program's network: parents and P(X=True | parent values), the key is the parents' values as T/F. */
const ORDER = ['B', 'E', 'A', 'N', 'G'];
const NET: Record<string, { parents: string[]; cpt: Record<string, Q> }> = {
  B: { parents: [], cpt: { '': frac(1n, 100n) } },
  E: { parents: [], cpt: { '': frac(1n, 50n) } },
  A: { parents: ['B', 'E'], cpt: { TT: frac(19n, 20n), TF: frac(9n, 10n), FT: frac(3n, 10n), FF: frac(1n, 100n) } },
  N: { parents: ['A'], cpt: { T: frac(9n, 10n), F: frac(1n, 20n) } },
  G: { parents: ['A'], cpt: { T: frac(7n, 10n), F: frac(1n, 100n) } },
};
type World = Record<string, boolean>;
const tf = (x: boolean) => (x ? 'T' : 'F');
/** b for B=True, ¬b for B=False (the notation of the lesson's text). */
const lit = (v: string, w: World) => `${w[v] ? '' : '¬'}${v.toLowerCase()}`;
const prob = (v: string, w: World): Q => {
  const p = NET[v].cpt[NET[v].parents.map(q => tf(w[q])).join('')];
  return w[v] ? p : frac(p[1] - p[0], p[1]);
};
const term = (v: string, w: World) => `P(${lit(v, w)}${NET[v].parents.length ? `|${NET[v].parents.map(q => lit(q, w)).join(',')}` : ''})`;
/** The dict as Python shows it: keys in insertion order (the evidence N, G first, then B, then each hidden variable). */
const pyWorld = (w: World) => `{${Object.entries(w).map(([k, x]) => `'${k}': ${x ? 'True' : 'False'}`).join(', ')}}`;

const traceSteps: TraceStep[] = (() => {
  const steps: TraceStep[] = [];
  const nodes: TreeNode[] = [];
  for (const b of [true, false]) {
    const root = `b${tf(b)}`;
    nodes.push({ id: root, label: `B=${tf(b)}`, children: [true, false].map(e => `${root}e${tf(e)}`) });
    for (const e of [true, false]) {
      const mid = `${root}e${tf(e)}`;
      nodes.push({ id: mid, label: `E=${tf(e)}`, children: [true, false].map(a => `${mid}a${tf(a)}`) });
      for (const a of [true, false]) nodes.push({ id: `${mid}a${tf(a)}`, label: `A=${tf(a)}`, children: [] });
    }
  }
  const status = new Map<string, Mark>();
  const rows: { id: string; cells: string[] }[] = [];
  const stack: { id: string; name: string; vars: Record<string, string>; returns?: string }[] = [];
  const printed: string[] = [];
  const snap = (line: number, note: string, vars: Record<string, string>) => {
    const current = stack.at(-1)?.id;
    steps.push({
      line, note, vars, ...(printed.length ? { output: printed.join('\n') } : {}),
      tree: { name: '呼叫樹：兩棵樹的根是 B 的兩個值，往下只有隱藏變數 E、A 會分支', nodes: nodes.map(n => ({ ...n, children: [...n.children!] })), roots: ['bT', 'bF'],
        marks: [...status].map(([id, kind]) => ({ id, kind })) },
      table: { name: '每個呼叫：這一層乘上的 CPT 值、從根乘下來的路徑乘積、回傳值', head: ['呼叫（路徑）', '這一層乘上的 CPT 值', '路徑乘積', '回傳值'],
        rows: rows.map(r => [...r.cells]), marks: rows.flatMap((r, i) => r.id === current ? [{ row: i, kind: 'current' as Mark }] : []) },
      frames: stack.map(f => ({ name: f.name, vars: { ...f.vars }, ...(f.returns ? { returns: f.returns } : {}) })),
    });
  };
  const run = (i0: number, world: World, id: string, path: Q, parent?: string): Q => {
    for (const f of stack) status.set(f.id, 'pending');
    status.set(id, 'current');
    let factor = ONE, i = i0;
    const known: string[] = [];
    while (i < ORDER.length && ORDER[i] in world) { factor = mul(factor, prob(ORDER[i], world)); known.push(ORDER[i]); i++; }
    const here = mul(path, factor);
    const factorText = known.length === 1 ? `${term(known[0], world)} = ${show(factor)}`
      : `${known.map(v => term(v, world)).join(' ')} = ${known.map(v => show(prob(v, world))).join(' × ')} = ${show(factor)}`;
    const pathName = ORDER.filter(v => v in world && v !== 'N' && v !== 'G').map(v => `${v}=${tf(world[v])}`).join(' ');
    const row = { id, cells: [pathName, factorText, show(here), '…'] };
    rows.push(row);
    const frame = { id, name: `enumerate_all(${i0}, world)`, vars: { i: String(i), factor: show(factor) } as Record<string, string>, returns: undefined as string | undefined };
    stack.push(frame);
    const vars = { i: String(i), factor: show(factor), world: pyWorld(world) };
    if (i === ORDER.length) {
      row.cells[3] = show(factor);
      frame.returns = show(factor);
      const first = id === 'bTeTaT';
      snap(26, `${pathName}：while 迴圈一口氣乘上 ${known.join('、')} 三個已知變數的 CPT 值，${factorText}。i 走到 5 = len(ORDER)，沒有隱藏變數了，回傳 factor = ${show(factor)}。`
        + (first ? `路徑乘積 ${show(here)} = P(b) × P(e) × ${show(factor)}，正是完整世界 (b, e, a, n, g) 的聯合機率，也就是要加總的其中一項。` : `這個葉子的路徑乘積 ${show(here)} 是完整世界 (${ORDER.map(v => lit(v, world)).join(', ')}) 的聯合機率。`),
      vars);
      stack.pop();
      status.set(id, 'visited');
      if (parent) status.set(parent, 'current');
      return factor;
    }
    const y = ORDER[i];
    snap(27, i0 === 0
      ? `enumerate_all(0, world)：ORDER[0] = B 已經有值，乘上 ${factorText}。ORDER[${i}] = ${y} 不在 world 裡，是隱藏變數：先走 ${y}=True，再走 ${y}=False，兩支的結果相加。`
      : `${pathName} 這一支：${known.join('、')} 剛被指定，while 迴圈乘上 ${factorText}；路徑乘積（從根一路乘下來）= ${show(path)} × ${show(factor)} = ${show(here)}。下一個 ${y} 也是隱藏變數，再分兩支。`,
    { ...vars, y: `'${y}'` });
    const parts = [true, false].map(v => run(i, { ...world, [y]: v }, `${id}${y.toLowerCase()}${tf(v)}`, here, id));
    const result = mul(factor, add(parts[0], parts[1]));
    row.cells[3] = show(result);
    frame.returns = show(result);
    frame.vars = { ...frame.vars, y: `'${y}'` };
    snap(28, i0 === 0
      ? `${pathName} 的兩個 ${y} 分支回傳 ${show(parts[0])} 與 ${show(parts[1])}，相加再乘上 P(${lit('B', world)}) = ${show(factor)}，得到 P(${lit('B', world)}, n, g) = ${show(result)}，等於這棵樹 4 個葉子的路徑乘積之和。`
      : `兩個 ${y} 分支回傳 ${show(parts[0])} 與 ${show(parts[1])}，相加後乘上這一層的 factor ${show(factor)}：回傳 ${show(result)}。乘法放在加總外面，${term(known[0], world)} 只乘一次。`,
    { ...vars, y: `'${y}'` });
    stack.pop();
    status.set(id, 'visited');
    if (parent) status.set(parent, 'current');
    return result;
  };
  const evidence: World = { N: true, G: true };
  snap(30, '證據是鄰居（N）與保全公司（G）都打來電話，查詢是 B。程式對 B=True 和 B=False 各呼叫一次 enumerate_all，算出 P(B, n, g)，最後再正規化。整棵呼叫樹先畫出來：兩棵樹的根是 B 的兩個值，往下會分支的只有隱藏變數 E 與 A；N、G 已知，不分支。',
    { evidence: pyWorld(evidence) });
  const score = new Map<boolean, Q>();
  for (const b of [true, false]) score.set(b, run(0, { ...evidence, B: b }, `b${tf(b)}`, ONE));
  const sT = score.get(true)!, sF = score.get(false)!, total = add(sT, sF);
  snap(32, `score[True] = ${show(sT)}，score[False] = ${show(sF)}。相加得到 P(n, g) = ${show(total)} ≈ ${decimal(total)}：兩通電話同時打來本身就不常見。這個和就是正規化常數 1/α，兩個分數除以它，加起來才會是 1。`,
    { 'score[True]': show(sT), 'score[False]': show(sF), total: show(total) });
  const posterior = div(sT, total);
  printed.push(`P(B=T, n, g) = ${show(sT)}`, `P(B=F, n, g) = ${show(sF)}`, `P(n, g) = ${show(total)}`, `P(B=T | n, g) = ${show(posterior)} = ${decimal(posterior)}`);
  if (printed.join('\n') !== ENUM_OUTPUT) throw new Error(`AIF15: the trace prints ${printed.join(' / ')}, the program prints ${ENUM_OUTPUT}`);
  snap(36, `印出結果：P(b | n, g) = score[True] / total = ${show(posterior)} ≈ ${decimal(posterior)}。先驗只有 1/100，兩通電話把闖空門的機率提高到約 35%；B=F 那棵樹的總和反而比較大，因為 P(¬b) = 99/100，假警報雖然少見，沒有闖空門的情況卻多得多。`,
    { total: show(total), 'score[True] / total': show(posterior) });
  return steps;
})();

export const AIF15: LessonContent = {
  lessonId: 'AIF15',
  motivation: 'AIF13 與 AIF14 用聯合分布與貝氏定理回答「看到證據之後，原因的機率是多少」。可是聯合分布要列出每一種變數組合：5 個是非變數有 32 種，30 個就超過十億種，既存不下也估不出來。貝氏網路（Bayesian network）用一張有向無環圖畫出「誰直接影響誰」，每個變數只存一張以父節點為條件的小表，就能重建整個聯合分布，也能直接從圖上讀出哪些變數彼此獨立。這一課用一個居家警報的情境，算出「鄰居和保全公司都打電話來時，真的有人闖空門」的精確機率：先用枚舉推論，再用變數消去減少重複計算，最後用固定種子的抽樣近似同一個答案，看看近似推論為什麼需要大量樣本。',
  sections: [
    {
      id: 'joint-to-network', title: '聯合分布太大：用一張圖說明誰影響誰',
      blocks: [
        { type: 'p', text: '有了完整的聯合分布（full joint distribution），任何問題都能用邊際化與條件化算出來。問題在於它的大小：n 個是非變數（布林隨機變數）共有 2^n 種組合，每一種都要一個機率，因為總和必須是 1，自由的數字是 2^n − 1 個。這個數量造成三個麻煩：存不下；估不出來，因為每一格都要足夠的資料才能估計；算得慢，因為回答一個查詢要把大量的格子加總。' },
        { type: 'table', head: ['是非變數個數 n', '聯合分布的格數 2^n', '自由參數 2^n − 1'], rows: [
          ['5', '32', '31'],
          ['10', '1,024', '1,023'],
          ['20', '1,048,576', '1,048,575'],
          ['30', '1,073,741,824', '1,073,741,823'],
        ] },
        { type: 'p', text: '現實中的變數通常只受少數幾個變數直接影響。本課的情境改編自 Judea Pearl 的經典警報例子（AIMA 也使用它），數字是本課自訂的：家裡裝了防盜警報，闖空門（B）或地震（E）都可能讓警報（A）響起；警報響時，隔壁鄰居（N）可能打電話來，保全公司（G）也可能打來。鄰居會不會打電話，只看他有沒有聽到警報，不會另外去管有沒有地震。' },
        { type: 'table', head: ['變數', '意義', '直接影響它的變數（父節點）'], rows: [
          ['B', '有人闖空門（burglary）', '無'],
          ['E', '發生地震（earthquake）', '無'],
          ['A', '警報響了（alarm）', 'B、E'],
          ['N', '鄰居打電話來（neighbor）', 'A'],
          ['G', '保全公司打電話來（guard）', 'A'],
        ] },
        { type: 'p', text: '貝氏網路把這個結構寫成有向無環圖（directed acyclic graph，DAG）：每個節點是一個隨機變數，邊 X → Y 表示 X 直接影響 Y，X 稱為 Y 的父節點（parent）。本課的圖有四條邊：B → A、E → A、A → N、A → G。「無環」表示沿著箭頭走永遠回不到起點，所以一定能把變數排成父節點在前、子節點在後的拓撲順序（D16 的有向圖），例如 B、E、A、N、G。Judea Pearl 在 1980 年代提出並推廣了這種表示法，1988 年出版《Probabilistic Reasoning in Intelligent Systems》，並以機率與因果推理的貢獻獲得 2011 年的圖靈獎。' },
        { type: 'p', text: '每個節點附上一張條件機率表（conditional probability table，CPT），列出在父節點的每一種取值下，這個變數為真的機率。下面用小寫表示變數為真、¬ 表示為假：b 是 B=True，¬b 是 B=False。沒有父節點的 B、E 只有一個數字，就是先驗機率：P(b) = 1/100、P(e) = 1/50。' },
        { type: 'table', head: ['B', 'E', 'P(a | B, E)', '說明'], rows: [
          ['T', 'T', '19/20', '闖空門又地震：幾乎一定響'],
          ['T', 'F', '9/10', '只有闖空門'],
          ['F', 'T', '3/10', '只有地震'],
          ['F', 'F', '1/100', '什麼都沒發生：誤報'],
        ] },
        { type: 'table', head: ['A', 'P(n | A)', 'P(g | A)'], rows: [
          ['T', '9/10', '7/10'],
          ['F', '1/20', '1/100'],
        ] },
        { type: 'callout', tone: 'warning', title: 'CPT 是每一列加起來等於 1，不是每一欄', text: 'P(a | B, E) 那一欄是 19/20、9/10、3/10、1/100，加起來是 2.16，這不是錯誤：四個數字分別在四種不同的條件下成立，彼此沒有總和的限制。真正要等於 1 的是同一列的「為真」與「為假」：P(a | b, e) + P(¬a | b, e) = 19/20 + 1/20 = 1。所以表格只存為真的機率，為假的機率用 1 減掉。把一欄硬調成加起來是 1，等於改掉了模型。' },
      ],
    },
    {
      id: 'factorization', title: '因式分解與參數數量',
      blocks: [
        { type: 'p', text: '依拓撲順序寫出機率的連鎖律（chain rule），P(x1, …, xn) = P(x1) P(x2 | x1) … P(xn | x1, …, xn−1)，這對任何分布都成立。貝氏網路的假設是：給定父節點之後，每個變數和它的其他非後代都條件獨立（局部馬可夫性質，local Markov property）。於是連鎖律的每一項都能把條件縮小成父節點，得到貝氏網路的因式分解：P(x1, …, xn) = P(x1 | parents(X1)) × … × P(xn | parents(Xn))，也就是每個變數的 CPT 值連乘。' },
        { type: 'p', text: '例如「沒有闖空門、沒有地震，警報卻響了，兩通電話都打來」這個完整世界的機率是 P(¬b, ¬e, a, n, g) = P(¬b) P(¬e) P(a | ¬b, ¬e) P(n | a) P(g | a) = 99/100 × 49/50 × 1/100 × 9/10 × 7/10 = 305613/50000000 ≈ 0.006112。下面的程式用同一條公式算出全部 32 個世界，確認加起來剛好是 1，並比較參數的數量。' },
        { type: 'example', id: 'e-joint' },
        { type: 'p', text: '一個有 k 個父節點的是非變數需要 2^k 個數字（父節點的每一種組合一列）。本課的網路是 1 + 1 + 4 + 2 + 2 = 10 個數字，完整聯合分布要 31 個。差距隨變數個數急速拉大：30 個變數、每個最多 3 個父節點時，網路最多 240 個數字，聯合分布超過十億個。這就是貝氏網路能用在醫療診斷、故障排除這類有上百個變數的問題上的原因。' },
        { type: 'table', head: ['', '完整聯合分布', '貝氏網路'], rows: [
          ['要存什麼', '每一種組合的機率', '每個變數的 CPT'],
          ['參數個數', '2^n − 1', '每個變數 2^(父節點數) 的總和'],
          ['本課的 5 個變數', '31', '10'],
          ['30 個變數、最多 3 個父節點', '1,073,741,823', '最多 240'],
          ['資料怎麼估', '每一格都要有資料', '每張小表分開估'],
        ] },
        { type: 'p', text: '網路只有在圖夠稀疏時才精簡，而稀疏與否和加入變數的順序有關。依「原因在前、結果在後」的順序（B、E、A、N、G）建圖，每個變數只需要真正的直接原因當父節點。若改成 N、G、A、B、E 的順序：G 要把 N 當父節點（不知道 A 時，兩通電話是相關的），A 要 N、G 兩個父節點，B 要 A，E 要 A 與 B（知道警報響了以後，B 與 E 互相影響），總共 1 + 2 + 4 + 2 + 4 = 13 個數字，邊也多了兩條。兩張圖描述的是同一個分布，但第二張比較難建、也比較難解釋。' },
        { type: 'callout', tone: 'note', title: '箭頭方向不必是因果方向', text: '數學上，任何能用拓撲順序寫出因式分解、而且條件獨立假設成立的 DAG 都是合法的貝氏網路，所以從結果指向原因的網路也能表示同一個分布。依因果方向建圖通常最稀疏、最容易請專家估計 CPT，但「圖上有一條 X → Y」本身並不證明 X 造成 Y。' },
      ],
    },
    {
      id: 'independence', title: '從結構讀出條件獨立：鏈、分叉與對撞',
      blocks: [
        { type: 'p', text: '貝氏網路不只省空間，圖本身就說明了哪些變數條件獨立。任何兩個變數之間的路徑（不管箭頭方向），都由三種基本的三節點型態組成，差別在中間那個節點有沒有被觀察到。' },
        { type: 'table', head: ['型態', '結構', '中間沒被觀察', '中間被觀察', '本課的例子'], rows: [
          ['鏈（chain）', 'X → Y → Z', '相關：資訊沿著鏈傳遞', '獨立：Y 擋住了路徑', 'B → A → N'],
          ['分叉（fork）', 'X ← Y → Z', '相關：有共同原因', '獨立：共同原因已知', 'N ← A → G'],
          ['對撞（collider）', 'X → Y ← Z', '獨立：兩個原因互不相干', '相關：一個原因可以解釋掉另一個', 'B → A ← E'],
        ] },
        { type: 'example', id: 'e-independence' },
        { type: 'p', text: '鏈與分叉的行為一樣：沒有觀察中間節點時，兩端互相提供資訊。知道有人闖空門，鄰居打電話的機率從 0.0710 升到 0.8158；但已經知道警報響了，再知道有沒有闖空門，鄰居打電話的機率仍是 9/10。分叉也一樣，兩通電話在不知道警報時相關（P(g) = 0.0270，P(g | n) = 0.2258），知道警報之後就無關了。' },
        { type: 'p', text: '對撞點相反。B 與 E 沒有共同的原因，一開始互相獨立：P(b | e) = P(b) = 1/100。可是一旦知道警報響了，兩者就變得相關：P(b | a) 約 0.3655，再得知發生了地震，P(b | a, e) 掉到約 0.0310，因為地震已經「解釋」了警報，闖空門就不那麼需要了。這叫做解釋消去（explaining away）。觀察對撞點的後代也有同樣效果：只知道鄰居打來時 P(b | n) 約 0.1150，再知道地震則降到約 0.0276。' },
        { type: 'p', text: '把三種型態合起來就是 d-分離（d-separation）的規則。給定一組已觀察的變數 Z，一條路徑被擋住（blocked），當它經過某個節點 m 符合下列任一條件；X 與 Y 被 Z d-分離，當它們之間的每一條路徑都被擋住。這時對於任何符合這張圖的 CPT，X 與 Y 在給定 Z 時都條件獨立。' },
        { type: 'list', items: [
          'm 是鏈或分叉的中間節點（→ m → 或 ← m →），而且 m 在 Z 裡。',
          'm 是對撞點（→ m ←），而且 m 本身和 m 的所有後代都不在 Z 裡。',
        ] },
        { type: 'p', text: '用這條規則檢查幾個問題：給定 A 時，N 與 B 獨立嗎？唯一的路徑 B → A → N 是鏈，A 被觀察，擋住，所以獨立。給定 N 時，B 與 E 獨立嗎？唯一的路徑 B → A ← E 的 A 是對撞點，它的後代 N 被觀察，路徑打開，所以不獨立。反過來，兩個變數沒有被 d-分離時，一般而言是相關的，但特定的數字仍可能剛好讓它們獨立，所以 d-分離能保證獨立，不能保證相關。' },
        { type: 'callout', tone: 'warning', title: '觀察共同的結果，會讓原本獨立的原因變成相關', text: '常見的直覺是「多觀察一些變數，只會讓變數之間更獨立」。對鏈與分叉來說是對的，對撞點卻正好相反：B 與 E 本來獨立，觀察 A（或 A 的後代 N、G）之後就相關了。在資料分析中，只挑出「警報有響」的紀錄來研究，就會在闖空門與地震之間看到一個負相關，這是挑選樣本造成的，不是兩者真的互相影響。' },
      ],
    },
    {
      id: 'enumeration', title: '枚舉推論：把隱藏變數加總掉',
      blocks: [
        { type: 'p', text: '一個查詢有三種變數：查詢變數 X、已觀察的證據 e，以及其他的隱藏變數 Y。枚舉推論（inference by enumeration）直接套用定義：P(X | e) = α P(X, e) = α Σ_y P(X, e, y)，其中每個 P(X, e, y) 都是一個完整世界，用因式分解算出；α 是正規化常數，讓結果加起來等於 1。' },
        { type: 'p', text: '查詢「兩通電話都打來時，有人闖空門的機率」：X = B，證據 n、g，隱藏變數是 E 與 A。寫成 P(b | n, g) = α Σ_e Σ_a P(b) P(e) P(a | b, e) P(n | a) P(g | a)。和加總變數無關的因子可以移到加總外面：α P(b) Σ_e P(e) Σ_a P(a | b, e) P(n | a) P(g | a)。程式依拓撲順序走過變數：已經有值的變數（查詢值、證據、上一層指定的隱藏變數）乘上它的 CPT 值，不分支；遇到隱藏變數就分成 True、False 兩支遞迴，結果相加。' },
        { type: 'example', id: 'e-enumerate' },
        { type: 'p', text: '下方的視覺化逐步執行這個程式。呼叫樹的兩棵樹分別是 B=True 與 B=False，往下只有 E、A 會分支；表格列出每個呼叫這一層乘上的 CPT 值、從根一路乘下來的路徑乘積，以及回傳值。每個葉子的路徑乘積就是一個完整世界的聯合機率，一棵樹所有葉子的路徑乘積加起來，就是根的回傳值 P(b, n, g)。' },
        { type: 'table', head: ['量', '精確值', '約'], rows: [
          ['P(b, n, g)', '1135359/200000000', '0.005677'],
          ['P(¬b, n, g)', '10341639/1000000000', '0.010342'],
          ['P(n, g) = 1/α', '8009217/500000000', '0.016018'],
          ['P(b | n, g)', '630755/1779826', '0.3544'],
        ] },
        { type: 'p', text: '先驗只有 1%，兩通電話把闖空門的機率拉到約 35%；仍然不到一半，因為誤報（P(a | ¬b, ¬e) = 1/100）發生在 99% 沒有闖空門的日子，總數並不少。這個結果和 AIF14 的基本比率謬誤是同一件事，只是證據要經過警報這個中間變數傳到 B。' },
        { type: 'p', text: '枚舉推論的時間：n 個是非變數最多要列舉 2^n 個世界，每個世界做 n 次乘法，時間是 O(n 2^n)；深度優先遞迴只需要 O(n) 的記憶體。對 5 個變數輕而易舉，但和直接查完整聯合分布的成本是同一個量級，下一節要解決的就是這個問題。' },
      ],
    },
    {
      id: 'elimination', title: '變數消去：重複使用算過的因子',
      blocks: [
        { type: 'p', text: '仔細看枚舉的呼叫樹，P(n | a) P(g | a) 只和 A 的值有關，卻在 (b, e) 的每一種組合下重新算了一次：A=True 時的 9/10 × 7/10 共算了 4 次，A=False 時的 1/20 × 1/100 也算了 4 次。變數消去（variable elimination）把這些中間結果存成因子（factor），也就是以某些變數為索引的小表，算一次、重複使用。' },
        { type: 'list', ordered: true, items: [
          'f1(A) = P(n | A) P(g | A)：A 的兩個值各算一次，f1(T) = 63/100，f1(F) = 1/2000。',
          '消去 E：f2(A, B) = Σ_e P(e) P(A | B, e)，例如 f2(T, b) = 1/50 × 19/20 + 49/50 × 9/10 = 901/1000。',
          '消去 A：P(B, n, g) = P(B) Σ_a f2(a, B) f1(a)，B=True 時是 1/100 × (901/1000 × 63/100 + 99/1000 × 1/2000)，和枚舉的 1135359/200000000 完全相同。',
        ] },
        { type: 'table', head: ['計算 P(B, n, g) 的乘法', '枚舉推論', '變數消去'], rows: [
          ['N、G 的部分', '每個葉子 P(a | b, e) P(n | a) P(g | a)：2 次 × 8 個葉子 = 16 次', 'f1(A) = P(n | A) P(g | A)：1 次 × 2 個值 = 2 次'],
          ['處理 E', 'P(e) 乘上 A 的加總：4 個 E 節點各 1 次 = 4 次', 'f2(A, B)：4 種 (a, b) 各 2 次 = 8 次'],
          ['處理 A', '已經在葉子裡乘過', 'Σ_a f2(a, B) f1(a)：B 的 2 個值各 2 次 = 4 次'],
          ['乘上 P(b)、P(¬b)', '2 次', '2 次'],
          ['合計', '22 次', '16 次'],
        ] },
        { type: 'p', text: '在只有 5 個變數的網路上，22 次對 16 次差距不大。差距在變數多時才明顯：下面的程式用一條 n 個變數的鏈 X1 → X2 → … → Xn 查詢 P(Xn)。枚舉要列出 X1…X(n−1) 的 2^(n−1) 種組合，每種做 n − 1 次乘法；變數消去每次只把前一個變數消掉，產生一個只有 2 個值的因子，每一步 4 次乘法。兩者算出的分數完全相同。' },
        { type: 'example', id: 'e-elimination' },
        { type: 'p', text: '輸出的 n = 2 那一行，變數消去反而多做了 2 次乘法，因為它替 X2 的兩個值都算了一次；到了 n = 12 卻是 22,528 次對 44 次。枚舉的成本隨變數個數指數成長，變數消去在鏈上只是線性成長，所以小網路上看不出差別的優化，在大網路上決定了算不算得出來。' },
        { type: 'p', text: '變數消去的代價取決於過程中產生的最大因子，而最大因子的大小又取決於消去的順序。對每對節點之間最多只有一條路徑的網路（polytree），變數消去的時間和網路的大小成線性；一般的網路則可能產生很大的因子，精確推論在最壞情況下是 NP-hard。另一個簡單又有效的技巧是先刪掉和查詢無關的變數：不是查詢變數或證據變數的祖先的節點，加總之後都等於 1，例如查詢 P(B | n) 時，沒有觀察的 G 可以整個拿掉。' },
      ],
    },
    {
      id: 'sampling', title: '抽樣近似推論：用固定種子模擬世界',
      blocks: [
        { type: 'p', text: '網路很大時，精確推論可能太慢，可以改用抽樣近似推論（approximate inference by sampling）：讓電腦依網路「模擬」許多個世界，用樣本的比例估計機率。最基本的是先驗抽樣（prior sampling）：依拓撲順序，每個變數根據已經抽出的父節點值，以 CPT 的機率抽 True 或 False。這樣抽出一個世界的機率，正好等於因式分解算出的聯合機率。' },
        { type: 'list', items: [
          '拒絕抽樣（rejection sampling）：照常抽出整個世界，和證據不符的樣本丟掉，在留下的樣本中數 B 為真的比例。',
          '似然加權（likelihood weighting）：證據變數不抽樣，直接固定成觀察到的值，樣本的權重乘上「這個證據值在當時父節點下的機率」，最後用加權的比例估計。',
        ] },
        { type: 'example', id: 'e-sampling' },
        { type: 'p', text: '兩種方法都朝精確值 0.3544 靠近，但需要很多樣本。拒絕抽樣的問題一目了然：P(n, g) 只有約 0.016，十萬個樣本只留下 1,589 個，1,000 個樣本時只有 14 個，估計值 0.5714 差得很遠。似然加權每個樣本都用到，但權重差異很大：抽到 A=True 的樣本權重是 9/10 × 7/10 = 0.63，A=False 的只有 1/20 × 1/100 = 0.0005，而 A 的先驗機率約 0.0247，所以只有約 2.5% 的樣本扛起幾乎所有的權重。證據在網路下游、原因又很罕見時，似然加權的優勢就不大。' },
        { type: 'table', head: ['', '拒絕抽樣', '似然加權'], rows: [
          ['證據變數', '照常抽樣，不符就丟掉', '固定成觀察值，不抽樣'],
          ['每個樣本的權重', '1（留下）或 0（丟掉）', '證據的 CPT 值連乘'],
          ['證據很罕見時', '幾乎所有樣本都被丟掉', '每個樣本都用到，但權重集中在少數樣本'],
          ['結果', '樣本數趨於無限時收斂到精確值', '同左'],
        ] },
        { type: 'p', text: '程式用 `random.Random(7)` 建立有固定種子的亂數產生器，所以每次執行的樣本完全相同，結果可以重現、也可以測試；換一個種子，數字會不同，但同樣會隨樣本數增加而接近 0.3544。估計的誤差平均而言大約和 1/√N 成正比，樣本數增加 100 倍，誤差大約縮小成 1/10。' },
        { type: 'callout', tone: 'warning', title: '一次抽樣的結果不保證越來越準', text: '收斂是「平均而言」的性質，單次執行的估計值會上下跳動：e-sampling 的拒絕抽樣在 1 萬與 10 萬個樣本時分別是 0.3588 與 0.3593，後者反而離精確值稍遠。不能只用一次執行的趨勢判斷方法好壞，也不能因為某次剛好很接近就以為樣本夠了；要比較方法，應該用多個種子重複實驗，或者估計誤差的範圍。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-joint', title: '因式分解：由 CPT 重建聯合分布',
      description: '用 P(x1..xn) = 各變數的 P(xi | parents) 連乘算出 32 個世界的機率，確認總和是精確的 1，再比較網路與完整聯合分布的參數數量。輸出用 -b 表示 ¬b（B 為假）。',
      code: { Python: code`from fractions import Fraction as F
from itertools import product

PARENTS = {'B': [], 'E': [], 'A': ['B', 'E'], 'N': ['A'], 'G': ['A']}
CPT = {  # P(變數=True | 父節點的值)
    'B': {(): F(1, 100)}, 'E': {(): F(1, 50)},
    'A': {(True, True): F(19, 20), (True, False): F(9, 10),
          (False, True): F(3, 10), (False, False): F(1, 100)},
    'N': {(True,): F(9, 10), (False,): F(1, 20)},
    'G': {(True,): F(7, 10), (False,): F(1, 100)},
}
ORDER = ['B', 'E', 'A', 'N', 'G']

def joint(world):
    """因式分解：P(x1..xn) = 每個變數的 P(xi | parents(Xi)) 相乘。"""
    result = F(1)
    for v in ORDER:
        p = CPT[v][tuple(world[q] for q in PARENTS[v])]
        result *= p if world[v] else 1 - p
    return result

worlds = [dict(zip(ORDER, values)) for values in product([True, False], repeat=5)]
print('worlds:', len(worlds), 'sum of joint:', sum(joint(w) for w in worlds))
w = {'B': False, 'E': False, 'A': True, 'N': True, 'G': True}
print('P(-b, -e, a, n, g) =', joint(w), '=', f'{float(joint(w)):.6f}')
print('network parameters:', sum(2 ** len(PARENTS[v]) for v in ORDER))
print('full joint parameters:', 2 ** len(ORDER) - 1)
for n in (10, 20, 30):
    print(f'n={n:2}: at most 3 parents -> {n * 2 ** 3:3} numbers, full joint -> {2 ** n - 1}')` },
      output: 'worlds: 32 sum of joint: 1\nP(-b, -e, a, n, g) = 305613/50000000 = 0.006112\nnetwork parameters: 10\nfull joint parameters: 31\nn=10: at most 3 parents ->  80 numbers, full joint -> 1023\nn=20: at most 3 parents -> 160 numbers, full joint -> 1048575\nn=30: at most 3 parents -> 240 numbers, full joint -> 1073741823',
    },
    {
      id: 'e-independence', title: '用數字驗證鏈、分叉與對撞',
      description: '由因式分解建出完整聯合分布，計算條件機率，比較觀察中間節點前後的變化；最後一行用 Fraction 精確檢查三個條件獨立的等式。',
      code: { Python: code`from fractions import Fraction as F
from itertools import product

PARENTS = {'B': [], 'E': [], 'A': ['B', 'E'], 'N': ['A'], 'G': ['A']}
CPT = {'B': {(): F(1, 100)}, 'E': {(): F(1, 50)},
       'A': {(True, True): F(19, 20), (True, False): F(9, 10),
             (False, True): F(3, 10), (False, False): F(1, 100)},
       'N': {(True,): F(9, 10), (False,): F(1, 20)},
       'G': {(True,): F(7, 10), (False,): F(1, 100)}}
ORDER = ['B', 'E', 'A', 'N', 'G']

def joint(w):
    result = F(1)
    for v in ORDER:
        p = CPT[v][tuple(w[q] for q in PARENTS[v])]
        result *= p if w[v] else 1 - p
    return result

WORLDS = [dict(zip(ORDER, vs)) for vs in product([True, False], repeat=5)]

def P(query, given=''):
    """P(query | given)，例如 P('B', 'A E')：條件裡的變數都是 True。"""
    match = lambda w, names: all(w[v] for v in names.split())
    num = sum(joint(w) for w in WORLDS if match(w, query + ' ' + given))
    return num / sum(joint(w) for w in WORLDS if match(w, given))

show = lambda label, p: print(f'{label:12} = {float(p):.4f}')
print('collider B -> A <- E')
show('P(b)', P('B')); show('P(b | e)', P('B', 'E'))
show('P(b | a)', P('B', 'A')); show('P(b | a, e)', P('B', 'A E'))
print('chain B -> A -> N')
show('P(n)', P('N')); show('P(n | b)', P('N', 'B'))
show('P(n | a)', P('N', 'A')); show('P(n | a, b)', P('N', 'A B'))
print('fork N <- A -> G')
show('P(g)', P('G')); show('P(g | n)', P('G', 'N'))
show('P(g | a)', P('G', 'A')); show('P(g | a, n)', P('G', 'A N'))
print('exact checks:', P('B', 'E') == P('B'), P('N', 'A B') == P('N', 'A'), P('G', 'A N') == P('G', 'A'))` },
      output: 'collider B -> A <- E\nP(b)         = 0.0100\nP(b | e)     = 0.0100\nP(b | a)     = 0.3655\nP(b | a, e)  = 0.0310\nchain B -> A -> N\nP(n)         = 0.0710\nP(n | b)     = 0.8158\nP(n | a)     = 0.9000\nP(n | a, b)  = 0.9000\nfork N <- A -> G\nP(g)         = 0.0270\nP(g | n)     = 0.2258\nP(g | a)     = 0.7000\nP(g | a, n)  = 0.7000\nexact checks: True True True',
    },
    {
      id: 'e-enumerate', title: '枚舉推論：兩通電話之後闖空門的機率',
      description: '依拓撲順序遞迴：已知的變數乘上 CPT 值，隱藏變數分成 True 與 False 兩支相加。對 B 的兩個值各算一次 P(B, n, g)，再正規化。',
      code: { Python: ENUM_CODE },
      output: ENUM_OUTPUT,
    },
    {
      id: 'e-elimination', title: '鏈狀網路：枚舉與變數消去的乘法次數',
      description: '在 X1 → X2 → … → Xn 上查詢 P(Xn = True)，分別用枚舉與變數消去計算並數乘法次數，確認兩者的精確答案相同。',
      code: { Python: code`from fractions import Fraction as F
from itertools import product

# 鏈狀網路 X1 -> X2 -> ... -> Xn，查詢 P(Xn = True)，沒有證據
FIRST = F(1, 2)                          # P(X1 = True)
NEXT = {True: F(9, 10), False: F(1, 5)}  # P(Xi = True | X(i-1))

def cpt(x, prev):
    p = FIRST if prev is None else NEXT[prev]
    return p if x else 1 - p

def by_enumeration(n):
    total, mults = F(0), 0
    for xs in product([True, False], repeat=n - 1):  # 隱藏變數 X1..X(n-1) 的每一種組合
        term = cpt(xs[0], None)
        for i in range(1, n):
            term *= cpt(xs[i] if i < n - 1 else True, xs[i - 1])
            mults += 1
        total += term
    return total, mults

def by_elimination(n):
    f = {x: cpt(x, None) for x in (True, False)}  # f(X1) = P(X1)
    mults = 0
    for _ in range(n - 1):  # 消去前一個變數：f(Xi) = sum P(Xi | x) f(x)
        f = {x: sum(cpt(x, prev) * f[prev] for prev in (True, False)) for x in (True, False)}
        mults += 4
    return f[True], mults

for n in (2, 4, 8, 12):
    (pe, me), (pv, mv) = by_enumeration(n), by_elimination(n)
    print(f'n={n:2} P(Xn)={float(pv):.6f} same={pe == pv} enumeration={me:5} elimination={mv:2}')` },
      output: 'n= 2 P(Xn)=0.550000 same=True enumeration=    2 elimination= 4\nn= 4 P(Xn)=0.609500 same=True enumeration=   24 elimination=12\nn= 8 P(Xn)=0.652941 same=True enumeration=  896 elimination=28\nn=12 P(Xn)=0.663371 same=True enumeration=22528 elimination=44',
    },
    {
      id: 'e-sampling', title: '拒絕抽樣與似然加權（固定種子）',
      description: '以 random.Random(7) 抽 10 萬個樣本，在 1,000、10,000、100,000 個樣本時印出用到的樣本數與 P(b | n, g) 的估計值，和精確值 0.3544 比較。',
      code: { Python: code`import random

PARENTS = {'B': [], 'E': [], 'A': ['B', 'E'], 'N': ['A'], 'G': ['A']}
CPT = {'B': {(): 0.01}, 'E': {(): 0.02},
       'A': {(True, True): 0.95, (True, False): 0.9, (False, True): 0.3, (False, False): 0.01},
       'N': {(True,): 0.9, (False,): 0.05}, 'G': {(True,): 0.7, (False,): 0.01}}
ORDER = ['B', 'E', 'A', 'N', 'G']
EVIDENCE = {'N': True, 'G': True}

def sample(rng, weighting):
    """依拓撲順序產生一個世界，回傳 (B 的值, 權重)。"""
    w, weight = {}, 1.0
    for v in ORDER:
        p = CPT[v][tuple(w[q] for q in PARENTS[v])]
        if weighting and v in EVIDENCE:  # 似然加權：證據不抽樣，權重乘上它的機率
            w[v] = EVIDENCE[v]
            weight *= p if w[v] else 1 - p
        else:
            w[v] = rng.random() < p  # 以機率 p 抽到 True
    if any(w[v] != x for v, x in EVIDENCE.items()):
        weight = 0.0  # 拒絕抽樣：和證據不符的樣本丟掉
    return w['B'], weight

print('exact P(b | n, g) = 630755/1779826 = 0.3544')
for weighting, name in ((False, 'rejection'), (True, 'weighting')):
    rng = random.Random(7)  # 固定種子：每次執行結果都一樣
    hit = total = 0.0
    kept = 0
    for i in range(1, 100001):
        b, weight = sample(rng, weighting)
        total += weight
        hit += weight if b else 0.0
        kept += weight > 0
        if i in (1000, 10000, 100000):
            print(f'{name}  N={i:6}  used={kept:6}  estimate={hit / total:.4f}')` },
      output: 'exact P(b | n, g) = 630755/1779826 = 0.3544\nrejection  N=  1000  used=    14  estimate=0.5714\nrejection  N= 10000  used=   170  estimate=0.3588\nrejection  N=100000  used=  1589  estimate=0.3593\nweighting  N=  1000  used=  1000  estimate=0.3961\nweighting  N= 10000  used= 10000  estimate=0.3403\nweighting  N=100000  used=100000  estimate=0.3524',
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: '枚舉推論：兩通電話之後，闖空門的機率', language: 'Python',
    code: ENUM_CODE,
    steps: traceSteps,
  },
  exercises: [
    {
      id: 'x-enumeration', title: '讀入貝氏網路，以枚舉推論計算後驗機率',
      statement: '讀入一個由是非變數（值為 0 或 1）組成的貝氏網路和一個查詢，用枚舉推論算出查詢變數為 0 與為 1 的精確後驗機率。每個變數一行，列出它的父節點與條件機率表；父節點必須在前面的行定義過，所以輸入的順序就是一個拓撲順序，也保證圖沒有環。條件機率表依父節點取值組成的二進位數排列：第一個父節點是最高位，第 j 個數字是「父節點的值組成二進位數 j 時，這個變數為 1 的機率」。例如父節點是 B、E 時，四個數字依序對應 (B, E) = (0, 0)、(0, 1)、(1, 0)、(1, 1)。輸入依下列順序檢查，遇到第一個錯誤就只印一行 `error: 訊息`：整體格式不對（第一行不是單一的非負整數、n 不在 1 到 12、非空白行數不是 n + 2、變數行少於 2 個欄位、名稱不是合法的 Python 識別字、k 不是非負整數、父節點名稱少於 k 個或重複）印 `bad input`；接著逐行檢查變數：名稱已經定義過印 `duplicate variable X`，父節點 P 不是前面定義過的變數印 `unknown parent P of X`，機率個數不是 2^k 印 `X needs m probabilities`（m 是 2^k），機率不是數字、分母為 0 或不在 0 到 1 之間印 `bad probability 原字串`；最後檢查查詢行：證據不是 `名稱=0` 或 `名稱=1` 的形式印 `bad evidence 原字串`，同一個證據變數出現兩次印 `duplicate evidence X`，查詢變數或證據變數不存在印 `unknown variable X`（先查查詢變數，再依名稱順序查證據），查詢變數也出現在證據中印 `X is both query and evidence`，證據的機率是 0 而無法正規化印 `evidence has probability 0`。',
      inputFormat: '第一行是變數個數 n。接著 n 行，每行 `名稱 k 父節點1 … 父節點k p0 p1 … p(2^k − 1)`，機率可以寫成分數 a/b、整數或小數。最後一行是查詢變數名稱，後面接零個或多個 `名稱=值` 的證據。欄位以空白分隔，空白行與多餘的空白都忽略。',
      outputFormat: '兩行，依序是查詢變數為 0 與為 1：`P(X=v | E1=e1, E2=e2) = 分數 (小數)`，證據依名稱排序，沒有證據時寫成 `P(X=v) = 分數 (小數)`。分數是最簡分數，0 與 1 直接寫成 `0`、`1`；小數四捨五入到小數點後 4 位。錯誤時印一行 `error: 訊息`。',
      constraints: ['1 ≤ n ≤ 12，每個變數的父節點都在前面定義', '每個機率都在 0 到 1 之間（含兩端）', '答案用 fractions.Fraction 精確計算，再轉成小數顯示', '最多 2^11 個隱藏變數組合，每個測資都能在一秒內完成'],
      samples: [
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB N=1 G=1\n", output: "P(B=0 | G=1, N=1) = 1149071/1779826 (0.6456)\nP(B=1 | G=1, N=1) = 630755/1779826 (0.3544)\n", note: "書中的警報網路：兩通電話都打來時，闖空門的後驗機率" },
        { kind: "normal", input: "2\nR 0 1/5\nW 1 R 1/10 9/10\nR W=1\n", output: "P(R=0 | W=1) = 4/13 (0.3077)\nP(R=1 | W=1) = 9/13 (0.6923)\n", note: "兩個變數的網路就是貝氏定理：草地濕了，下雨的機率從 1/5 升到 9/13" },
      ],
      tests: [
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB N=1\n", output: "P(B=0 | N=1) = 69773/78838 (0.8850)\nP(B=1 | N=1) = 9065/78838 (0.1150)\n", note: "只有鄰居打來：證據較弱，後驗比兩通電話都打來時低" },
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB N=1 E=1\n", output: "P(B=0 | E=1, N=1) = 12078/12421 (0.9724)\nP(B=1 | E=1, N=1) = 343/12421 (0.0276)\n", note: "解釋消去：又知道發生地震，闖空門的機率大幅下降" },
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nE N=1 G=1\n", output: "P(E=0 | G=1, N=1) = 12149599/16018434 (0.7585)\nP(E=1 | G=1, N=1) = 3868835/16018434 (0.2415)\n", note: "查詢另一個原因：地震的後驗機率" },
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nA\n", output: "P(A=0) = 243837/250000 (0.9753)\nP(A=1) = 6163/250000 (0.0247)\n", note: "沒有證據：印出警報響的邊際機率，要把 B、E、N、G 全部加總" },
        { kind: "normal", input: "4\nCloudy 0 1/2\nSprinkler 1 Cloudy 1/2 1/10\nRain 1 Cloudy 1/5 4/5\nWet 2 Sprinkler Rain 0 9/10 9/10 99/100\nRain Wet=1\n", output: "P(Rain=0 | Wet=1) = 210/719 (0.2921)\nP(Rain=1 | Wet=1) = 509/719 (0.7079)\n", note: "四個變數的花園網路：草地濕了，下雨的機率" },
        { kind: "normal", input: "4\nCloudy 0 1/2\nSprinkler 1 Cloudy 1/2 1/10\nRain 1 Cloudy 1/5 4/5\nWet 2 Sprinkler Rain 0 9/10 9/10 99/100\nSprinkler Wet=1 Rain=1\n", output: "P(Sprinkler=0 | Rain=1, Wet=1) = 410/509 (0.8055)\nP(Sprinkler=1 | Rain=1, Wet=1) = 99/509 (0.1945)\n", note: "已知下雨，灑水器的機率被解釋消去" },
        { kind: "normal", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nG N=0\n", output: "P(G=0 | N=0) = 459027177/464522900 (0.9882)\nP(G=1 | N=0) = 5495723/464522900 (0.0118)\n", note: "證據是 0：鄰居沒打來時，保全來電的機率" },
        { kind: "edge", input: "1\nX 0 3/4\nX\n", output: "P(X=0) = 1/4 (0.2500)\nP(X=1) = 3/4 (0.7500)\n", note: "只有一個變數、沒有證據：直接是它的先驗" },
        { kind: "edge", input: "2\nB 0 1/2\nC 1 B 0 1\nB C=1\n", output: "P(B=0 | C=1) = 0 (0.0000)\nP(B=1 | C=1) = 1 (1.0000)\n", note: "確定性的 CPT：C 完全複製 B，後驗一個是 0、一個是 1" },
        { kind: "edge", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB E=1\n", output: "P(B=0 | E=1) = 99/100 (0.9900)\nP(B=1 | E=1) = 1/100 (0.0100)\n", note: "B 和 E 在沒有觀察 A 時 d-分離：後驗等於先驗 1/100" },
        { kind: "edge", input: "3\nA 0 0.25\nB 1 A 0.5 0.75\nC 1 B 0.1 0.6\nA C=1\n", output: "P(A=0 | C=1) = 42/61 (0.6885)\nP(A=1 | C=1) = 19/61 (0.3115)\n", note: "機率也可以寫成小數，答案仍是精確分數" },
        { kind: "edge", input: "\n  5  \nB 0 1/100\n\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\n   N 1 A 1/20 9/10\nG 1 A 1/100 7/10\n\nB   G=1   N=1  \n\n", output: "P(B=0 | G=1, N=1) = 1149071/1779826 (0.6456)\nP(B=1 | G=1, N=1) = 630755/1779826 (0.3544)\n", note: "空行與多餘的空白都忽略；證據的順序不影響輸出" },
        { kind: "edge", input: "12\nX1 0 1/2\nX2 1 X1 1/5 9/10\nX3 1 X2 1/5 9/10\nX4 1 X3 1/5 9/10\nX5 1 X4 1/5 9/10\nX6 1 X5 1/5 9/10\nX7 1 X6 1/5 9/10\nX8 1 X7 1/5 9/10\nX9 1 X8 1/5 9/10\nX10 1 X9 1/5 9/10\nX11 1 X10 1/5 9/10\nX12 1 X11 1/5 9/10\nX1 X12=1\n", output: "P(X1=0 | X12=1) = 65348448838/132674224419 (0.4925)\nP(X1=1 | X12=1) = 67325775581/132674224419 (0.5075)\n", note: "12 個變數的鏈（上限）：中間 10 個隱藏變數，每個查詢值要加總 1,024 種組合，仍能很快算完" },
        { kind: "error", input: "2\nB 0 1/2\nC 1 B 0 0\nB C=1\n", output: "error: evidence has probability 0\n", note: "證據的機率是 0：無法正規化" },
        { kind: "error", input: "2\nC 1 B 1/10 9/10\nB 0 1/2\nB C=1\n", output: "error: unknown parent B of C\n", note: "父節點必須先定義（這也排除了有向環）" },
        { kind: "error", input: "2\nA 1 A 1/2 1/2\nB 0 1/2\nA\n", output: "error: unknown parent A of A\n", note: "自己是自己的父節點：自我迴圈" },
        { kind: "error", input: "2\nB 0 1/2\nC 1 B 1/2\nC\n", output: "error: C needs 2 probabilities\n", note: "一個父節點的 CPT 需要 2 個數字，只給了 1 個" },
        { kind: "error", input: "2\nB 0 3/2\nC 1 B 0 1\nC\n", output: "error: bad probability 3/2\n", note: "機率大於 1" },
        { kind: "error", input: "2\nB 0 1/0\nC 1 B 0 1\nC\n", output: "error: bad probability 1/0\n", note: "分母是 0 的機率" },
        { kind: "error", input: "2\nB 0 1/2\nB 0 1/3\nB\n", output: "error: duplicate variable B\n", note: "同一個變數定義兩次" },
        { kind: "error", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nX N=1\n", output: "error: unknown variable X\n", note: "查詢的變數不存在" },
        { kind: "error", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB B=1\n", output: "error: B is both query and evidence\n", note: "查詢的變數同時是證據" },
        { kind: "error", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB N=2\n", output: "error: bad evidence N=2\n", note: "證據的值只能是 0 或 1" },
        { kind: "error", input: "5\nB 0 1/100\nE 0 1/50\nA 2 B E 1/100 3/10 9/10 19/20\nN 1 A 1/20 9/10\nG 1 A 1/100 7/10\nB N=1 N=0\n", output: "error: duplicate evidence N\n", note: "同一個證據給了兩次" },
        { kind: "error", input: "3\nB 0 1/2\nC 1 B 0 1\nC\n", output: "error: bad input\n", note: "說有 3 個變數，只定義了 2 個" },
        { kind: "error", input: "", output: "error: bad input\n", note: "沒有任何輸入" },
      ],
      hints: [
        '父節點都在前面定義，所以依輸入的順序走過變數，每個變數的父節點都已經有值，可以直接查 CPT 並連乘，這就是因式分解。',
        'CPT 的列號從 0 開始，對每個父節點做 `row = row * 2 + 值`，第一個父節點就會是最高位。',
        '隱藏變數是不屬於查詢也不屬於證據的變數；用 `itertools.product((0, 1), repeat=len(hidden))` 列出所有組合，對查詢的 0 與 1 各加總聯合機率。',
        '兩個加總相加就是證據的機率 P(e)；它是 0 時無法正規化。用 Fraction 計算，印出時 `str(p)` 會給最簡分數，`f"{float(p):.4f}"` 給小數。',
      ],
      solution: { Python: code`import sys
from fractions import Fraction
from itertools import product

def is_int(text):
    return text.isascii() and text.isdigit()

def parse_prob(text):
    try:
        p = Fraction(text)
    except (ValueError, ZeroDivisionError):
        raise ValueError(f'bad probability {text}')
    if not 0 <= p <= 1:
        raise ValueError(f'bad probability {text}')
    return p

def solve(lines):
    lines = [line.split() for line in lines if line.strip()]
    if not lines or len(lines[0]) != 1 or not is_int(lines[0][0]):
        raise ValueError('bad input')
    n = int(lines[0][0])
    if not 1 <= n <= 12 or len(lines) != n + 2:
        raise ValueError('bad input')
    order, parents, cpt = [], {}, {}
    for tokens in lines[1:n + 1]:
        if len(tokens) < 2 or not tokens[0].isidentifier() or not is_int(tokens[1]):
            raise ValueError('bad input')
        name, k = tokens[0], int(tokens[1])
        if name in parents:
            raise ValueError(f'duplicate variable {name}')
        ps, probs = tokens[2:2 + k], tokens[2 + k:]
        if len(ps) != k or len(set(ps)) != k:
            raise ValueError('bad input')
        for q in ps:
            if q not in parents:  # 父節點必須先定義：保證是有向無環圖
                raise ValueError(f'unknown parent {q} of {name}')
        if len(probs) != 2 ** k:
            raise ValueError(f'{name} needs {2 ** k} probabilities')
        order.append(name)
        parents[name] = ps
        cpt[name] = [parse_prob(t) for t in probs]
    query, evidence = lines[n + 1][0], {}
    for item in lines[n + 1][1:]:
        var, eq, val = item.partition('=')
        if not var or not eq or val not in ('0', '1'):
            raise ValueError(f'bad evidence {item}')
        if var in evidence:
            raise ValueError(f'duplicate evidence {var}')
        evidence[var] = int(val)
    for var in [query, *sorted(evidence)]:
        if var not in parents:
            raise ValueError(f'unknown variable {var}')
    if query in evidence:
        raise ValueError(f'{query} is both query and evidence')

    def joint(world):
        result = Fraction(1)
        for v in order:
            row = 0
            for q in parents[v]:  # 第一個父節點是最高位
                row = row * 2 + world[q]
            p = cpt[v][row]
            result *= p if world[v] else 1 - p
        return result

    hidden = [v for v in order if v != query and v not in evidence]
    score = [Fraction(0), Fraction(0)]
    for x in (0, 1):
        for values in product((0, 1), repeat=len(hidden)):
            score[x] += joint({**evidence, query: x, **dict(zip(hidden, values))})
    total = score[0] + score[1]
    if total == 0:
        raise ValueError('evidence has probability 0')
    given = ', '.join(f'{v}={evidence[v]}' for v in sorted(evidence))
    out = []
    for x in (0, 1):
        p = score[x] / total
        out.append(f'P({query}={x}{" | " + given if given else ""}) = {p} ({float(p):.4f})')
    return out

try:
    print('\n'.join(solve(sys.stdin.read().split('\n'))))
except ValueError as e:
    print(f'error: {e}')` },
      judge: 'none',
    },
  ],
  quiz: [
    {
      id: 'q-parameters', prompt: '一個貝氏網路有 6 個是非變數：X1、X2 沒有父節點；X3 的父節點是 X1、X2；X4 的父節點是 X3；X5 的父節點是 X3、X4；X6 的父節點是 X3、X4、X5。所有 CPT 加起來需要幾個數字？',
      options: ['14 個：每個變數 1 個，每條邊再 1 個', '20 個，完整聯合分布則要 63 個', '40 個：每一列要存為真與為假兩個數字', '63 個：和完整聯合分布一樣多'],
      answer: 1, explanation: '有 k 個父節點的是非變數需要 2^k 個數字：1 + 1 + 4 + 2 + 4 + 8 = 20；完整聯合分布是 2^6 − 1 = 63 個。「每條邊 1 個」低估了，因為一張 CPT 的列數隨父節點個數指數成長（X6 有 3 個父節點就要 8 列）；為假的機率是 1 減去為真的機率，不必另外存，所以不是 40；網路只要不是每個變數都以所有前面的變數為父節點，就會比 63 少。',
    },
    {
      id: 'q-descendant', prompt: '在本課的網路（B → A ← E，A → N，A → G）中，沒有任何觀察時 B 與 E 獨立。如果只觀察到鄰居打電話（N），B 與 E 還獨立嗎？',
      options: ['獨立：B 與 E 之間沒有邊', '獨立：被觀察的是 N，不是對撞點 A 本身', '不獨立：N 是對撞點 A 的後代，觀察它會打開 B → A ← E 這條路徑', '不獨立：B 與 N 之間有一條路徑，所以任何觀察都會讓 B 與 E 相關'],
      answer: 2, explanation: 'd-分離的規則：對撞點本身或它的任何後代被觀察時，路徑就打開。N 是 A 的子節點，所以 B 與 E 變成相關，e-independence 的方法可算出 P(b | n) 約 0.1150、P(b | n, e) 約 0.0276。「沒有邊」不代表獨立，獨立要看所有路徑是否都被擋住；「只看 A 本身」漏掉了後代的規則；最後一項理由錯誤，路徑 B → A → N 和 B 與 E 是否相關無關，關鍵是 B → A ← E 這條路徑上的對撞點。',
    },
    {
      id: 'q-dsep', prompt: '花園網路的結構是 Cloudy → Sprinkler、Cloudy → Rain、Sprinkler → Wet、Rain → Wet。在下列哪一組觀察下，Sprinkler 與 Rain 被 d-分離？',
      options: ['觀察 Cloudy 與 Wet', '只觀察 Wet', '沒有觀察任何變數', '只觀察 Cloudy'],
      answer: 3, explanation: '兩條路徑：Sprinkler ← Cloudy → Rain 是分叉，Cloudy 被觀察時擋住；Sprinkler → Wet ← Rain 的 Wet 是對撞點，Wet 沒被觀察時擋住。只觀察 Cloudy 時兩條都擋住，所以 d-分離。沒有觀察時分叉是通的（共同原因 Cloudy 讓兩者相關）；只觀察 Wet 時兩條都通；觀察 Cloudy 與 Wet 時分叉擋住，但對撞點被觀察，路徑打開，兩者會互相解釋消去。（以練習的花園數字驗算：給定 Cloudy 時 P(sprinkler) 不隨 Rain 改變。）',
    },
    {
      id: 'q-code', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
p_rain = F(1, 4)                              # P(rain)
p_wet = {True: F(4, 5), False: F(1, 10)}      # P(wet | Rain)
num = p_rain * p_wet[True]
den = num + (1 - p_rain) * p_wet[False]
print(num / den)` },
      options: ['8/11', '1/5', '4/5', '11/40'],
      answer: 0, explanation: '這是兩個變數的枚舉推論：num = P(rain, wet) = 1/4 × 4/5 = 1/5，den = P(wet) = 1/5 + 3/4 × 1/10 = 11/40，相除得 P(rain | wet) = (1/5) / (11/40) = 8/11。「1/5」是沒有正規化的聯合機率 num；「4/5」是概似 P(wet | rain)，把條件的方向弄反了；「11/40」是正規化常數 den，也就是證據的機率。（已實際執行：印出 8/11。）',
    },
    {
      id: 'q-rejection', prompt: '本課的網路中 P(n, g) 約為 0.016。用拒絕抽樣估計 P(b | n, g)，抽了 10,000 個樣本，大約有幾個樣本會被留下來使用？',
      options: ['全部 10,000 個', '約 3,544 個', '約 160 個', '約 100 個'],
      answer: 2, explanation: '只有和證據 n、g 都相符的樣本會留下，期望值是 10,000 × 0.016 ≈ 160；e-sampling 用種子 7 實際留下 170 個。「全部」是似然加權的情況，它不丟樣本；3,544 是把後驗 0.3544 當成留下的比例，但後驗是留下的樣本中 B 為真的比例；100 是 10,000 × P(b)，那是抽到闖空門的樣本數，和證據無關。',
    },
    {
      id: 'q-explaining-away', prompt: '已知警報響了（a），P(b | a) 約 0.3655。接著又得知發生了地震（e），闖空門的機率會怎麼變？',
      options: ['下降，約 0.031：地震已經解釋了警報', '不變：B 與 E 互相獨立', '上升：兩件壞事常常一起發生', '變成 0：警報只需要一個原因'],
      answer: 0, explanation: '這是對撞點 B → A ← E 的解釋消去：觀察 A 之後 B 與 E 相關，地震讓「警報因為闖空門而響」變得不必要，e-independence 算出 P(b | a, e) 約 0.0310。B 與 E 只有在沒有觀察 A 及其後代時才獨立；網路中 B、E 是互相獨立的先驗，沒有「一起發生」的依據；機率不會變成 0，因為闖空門又地震時警報響的機率是 19/20，兩個原因仍可能同時存在。',
    },
    {
      id: 'q-weight', prompt: '用似然加權估計 P(b | n, g)。某個樣本抽到 B=False、E=False、A=True，證據 N、G 固定為 True。這個樣本的權重是多少？（P(a | ¬b, ¬e) = 1/100，P(n | a) = 9/10，P(g | a) = 7/10）',
      options: ['63/10000', '1', '9/10', '63/100'],
      answer: 3, explanation: '權重只乘上證據變數在當時父節點下的機率：P(n | a) × P(g | a) = 9/10 × 7/10 = 63/100。A 是抽樣得到的，它的機率已經反映在「抽到它的頻率」裡，再乘上 1/100 會重複計算，所以 63/10000 錯；權重是 1 的是拒絕抽樣留下的樣本，似然加權的證據沒有被抽樣，必須用權重補償；9/10 只乘了第一個證據，漏掉 G。',
    },
    {
      id: 'q-elimination', prompt: '在鏈 X1 → … → X12 上查詢 P(X12)，e-elimination 中枚舉做了 22,528 次乘法，變數消去只做 44 次，而且答案完全相同。主要原因是什麼？',
      options: ['變數消去是抽樣方法，只算近似值，所以比較快', '變數消去把加總往內推，每消去一個變數就存成一個小因子重複使用，不必列出所有組合', '變數消去略過了機率很小的組合', '枚舉多算了證據變數，變數消去沒有證據要處理'],
      answer: 1, explanation: '枚舉要列出 X1…X11 的 2^11 = 2,048 種組合，每種 11 次乘法；變數消去每一步只算 f(Xi) = Σ P(Xi | x) f(x)，兩個值各 2 次乘法，共 11 × 4 = 44 次。它是精確方法，程式印出 same=True；它沒有略過任何組合，只是把相同的部分算一次；這個查詢沒有證據，差距來自隱藏變數的組合數，不是證據。',
    },
  ],
};
