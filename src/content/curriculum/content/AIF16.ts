import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF16 馬可夫鏈與隱馬可夫模型 (python-code: Python only, standard library). Every example and the reference solution
 * run in the curriculum code tests; their outputs and the exercise's expected outputs were produced by running the
 * programs.
 *
 * Two running models. The Markov chain is a three-state weather chain (sunny, cloudy, rainy) whose stationary
 * distribution is exactly 7/18, 1/3, 5/18. The hidden Markov model is the umbrella world: the hidden weather is rain or
 * dry, P(X_1) = 1/2 each, the weather stays the same with 0.7, and the observation is whether the director carries an
 * umbrella, P(umbrella | rain) = 0.9 and P(umbrella | dry) = 0.2.
 *
 * The visualization runs TRACE_CODE (also the example e-forward): the forward algorithm with normalization on five days
 * of evidence, filling the 2 × 5 table of filtered probabilities one column per day. forwardSteps() repeats the program
 * with exact BigInt fractions, formats them as Python's str(Fraction) and f'{float(x):.4f}' do, and checks the printed
 * lines against TRACE_OUTPUT, which the lesson test compares with Python's real output.
 */
const STATES = ['rain', 'dry'] as const;
type State = typeof STATES[number];
const EVIDENCE = ['umbrella', 'umbrella', 'none', 'umbrella', 'umbrella'] as const;
type Observation = typeof EVIDENCE[number];
const TRACE_OUTPUT = 't=1 umbrella rain=0.8182 dry=0.1818\nt=2 umbrella rain=0.8834 dry=0.1166\nt=3 none     rain=0.1907 dry=0.8093\nt=4 umbrella rain=0.7308 dry=0.2692\nt=5 umbrella rain=0.8673 dry=0.1327\nP(rain_5 | e_1:5) = 59505867/68607401\nP(e_1:5) = 68607401/2000000000 ≈ 0.034304';

const TRACE_CODE = code`from fractions import Fraction as F
states = ['rain', 'dry']
start = {'rain': F(1, 2), 'dry': F(1, 2)}   # P(X_1)：第 1 天之前的信念
T = {'rain': {'rain': F(7, 10), 'dry': F(3, 10)},   # 轉移模型 P(X_t | X_t-1)
     'dry':  {'rain': F(3, 10), 'dry': F(7, 10)}}
E = {'rain': {'umbrella': F(9, 10), 'none': F(1, 10)},   # 感測模型 P(e | X)
     'dry':  {'umbrella': F(1, 5), 'none': F(4, 5)}}
evidence = ['umbrella', 'umbrella', 'none', 'umbrella', 'umbrella']
pred, likelihood = dict(start), F(1)
for t, e in enumerate(evidence, start=1):
    unnorm = {x: E[x][e] * pred[x] for x in states}  # 更新：乘上觀察的機率
    total = sum(unnorm.values())  # = P(e_t | e_1:t-1)
    likelihood *= total
    f = {x: unnorm[x] / total for x in states}  # 正規化：濾波結果 P(X_t | e_1:t)
    print(f't={t} {e:8} rain={float(f["rain"]):.4f} dry={float(f["dry"]):.4f}')
    pred = {x: sum(f[p] * T[p][x] for p in states) for x in states}  # 預測明天
print('P(rain_5 | e_1:5) =', f['rain'])
print('P(e_1:5) =', likelihood, f'≈ {float(likelihood):.6f}')`;

/** An exact fraction with BigInt parts, always reduced, with a positive denominator. */
type Q = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
const q = (n: bigint, d = 1n): Q => { const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
/** Python's str(Fraction). */
const str = (x: Q) => x.d === 1n ? `${x.n}` : `${x.n}/${x.d}`;
/** Python's f'{float(x):.Nf}': both parts stay below 2^53 here, so the division gives the same correctly rounded double. */
const fixed = (x: Q, places: number) => (Number(x.n) / Number(x.d)).toFixed(places);

const T: Record<State, Record<State, Q>> = { rain: { rain: q(7n, 10n), dry: q(3n, 10n) }, dry: { rain: q(3n, 10n), dry: q(7n, 10n) } };
const E: Record<State, Record<Observation, Q>> = { rain: { umbrella: q(9n, 10n), none: q(1n, 10n) }, dry: { umbrella: q(1n, 5n), none: q(4n, 5n) } };

function forwardSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const table: string[][] = STATES.map(() => EVIDENCE.map(() => ''));
  const lines: string[] = [];
  type GridMark = { at: [number, number]; kind: Mark };
  type CellMark = { at: number; kind: Mark };
  const both = (kind: Mark): CellMark[] => [{ at: 0, kind }, { at: 1, kind }];
  const column = (i: number, kind: Mark): GridMark[] => [{ at: [0, i], kind }, { at: [1, i], kind }];
  const grid = (marks: GridMark[]) => ({ name: 'f：濾波結果 P(X_t | e_1:t)，列是天氣，欄是第幾天與當天的觀察', cells: table.map(r => [...r]), marks,
    rowLabels: [...STATES], colLabels: EVIDENCE.map((e, i) => `t=${i + 1} ${e}`) });
  const vector = (name: string, values: Q[] | null, marks: CellMark[]) => ({ name, cells: values ? values.map(v => fixed(v, 4)) : ['', ''], marks, colLabels: [...STATES] });
  const show = (pred: Q[] | null, unnorm: Q[] | null, marks: { grid?: GridMark[]; pred?: CellMark[]; unnorm?: CellMark[] } = {}) =>
    [grid(marks.grid ?? []), vector('pred：預測 P(X_t | e_1:t−1)', pred, marks.pred ?? []), vector('unnorm：P(e_t | X_t) × pred', unnorm, marks.unnorm ?? [])];
  const push = (line: number, note: string, vars: Record<string, string>, arrays: ReturnType<typeof show>) =>
    steps.push({ line, note, vars, arrays, ...(lines.length ? { output: lines.join('\n') } : {}) });
  const dec = (x: Q) => fixed(x, 4);

  push(8, '隱藏狀態是天氣 rain 或 dry。警衛整天待在室內看不到天空，只看得到主管進門時有沒有帶傘（umbrella 或 none）。T 是轉移模型（天氣維持不變的機率 0.7），E 是感測模型（下雨天帶傘的機率 0.9，晴天 0.2）。evidence 是連續 5 天的觀察：帶傘、帶傘、沒帶、帶傘、帶傘。表格每一欄是一天，要從左到右一欄一欄填。',
    {}, show(null, null));
  let pred: Q[] = [q(1n, 2n), q(1n, 2n)];
  let likelihood = q(1n);
  push(9, '第 1 天還沒有任何觀察，對天氣的信念就是 start = P(X_1)：rain 與 dry 各 1/2。pred 一律表示「看到當天觀察之前」的預測；likelihood 從 1 開始，之後累乘每天觀察的機率。',
    { pred: "{'rain': Fraction(1, 2), 'dry': Fraction(1, 2)}", likelihood: '1' }, show(pred, null, { pred: both('write') }));
  let f: Q[] = [];
  for (const [i, e] of EVIDENCE.entries()) {
    const t = i + 1;
    const unnorm = STATES.map((x, k) => mul(E[x][e], pred[k]));
    push(11, `t = ${t}，e = ${e}。更新：把預測乘上「這種天氣下看到 ${e} 的機率」。rain：${str(E.rain[e])} × ${dec(pred[0])} = ${dec(unnorm[0])}；dry：${str(E.dry[e])} × ${dec(pred[1])} = ${dec(unnorm[1])}。${e === 'none' ? '下雨天很少有人不帶傘（0.1），所以 rain 那一格變得很小。' : '下雨天帶傘很常見（0.9），所以 rain 那一格相對變大。'}這兩個數加起來不等於 1，還不是機率。`,
      { t: String(t), e, "unnorm['rain']": str(unnorm[0]), "unnorm['dry']": str(unnorm[1]) }, show(pred, unnorm, { pred: both('read'), unnorm: both('write') }));
    const total = add(unnorm[0], unnorm[1]);
    likelihood = mul(likelihood, total);
    push(13, `total = ${dec(unnorm[0])} + ${dec(unnorm[1])} = ${dec(total)}（精確值 ${str(total)}），它就是 ${t === 1 ? 'P(e_1)：第 1 天看到 umbrella 的機率' : `P(e_${t} | e_1:${t - 1})：在之前的觀察之下，今天看到 ${e} 的機率`}。likelihood 乘上它，累積成 P(e_1:${t}) = ${str(likelihood)}。`,
      { total: str(total), likelihood: str(likelihood) }, show(pred, unnorm, { unnorm: both('read') }));
    f = unnorm.map(u => div(u, total));
    STATES.forEach((_, k) => { table[k][i] = dec(f[k]); });
    lines.push(`t=${t} ${e.padEnd(8)} rain=${dec(f[0])} dry=${dec(f[1])}`);
    const remark = t === 1 ? '一次帶傘就讓 rain 從 0.5 升到 9/11 ≈ 0.8182。' : t === 2 ? '第二次帶傘再把它推高到 0.8834，和教科書雨傘世界的數字相同。' : t === 3 ? '只要一天沒帶傘，rain 就從 0.88 掉到 0.19。' : '';
    push(15, `正規化：兩格都除以 total（乘上 α = 1 / total），得到濾波結果 P(X_${t} | e_1:${t})：rain ${dec(f[0])}、dry ${dec(f[1])}，總和為 1。寫進表格第 ${t} 欄並印出。${remark}`,
      { "f['rain']": str(f[0]), "f['dry']": str(f[1]) }, show(pred, unnorm, { grid: column(i, 'write') }));
    pred = STATES.map(x => add(mul(f[0], T.rain[x]), mul(f[1], T.dry[x])));
    const next = t === EVIDENCE.length
      ? `這是第 6 天的預測，程式不會再用到；它比今天的 ${dec(f[0])} 更接近 0.5：沒有新的觀察時，預測會一路往隱藏天氣鏈的穩態分布 (1/2, 1/2) 靠近。`
      : `兩種天氣都可能變成明天的 rain，所以要加總。預測比今天的濾波更接近 0.5，因為天氣可能改變，不確定性變大了。這就是第 ${t + 1} 天的 pred。`;
    push(16, `預測：P(明天 rain) = ${dec(f[0])} × 0.7 + ${dec(f[1])} × 0.3 = ${dec(pred[0])}。${next}`,
      { "pred['rain']": str(pred[0]), "pred['dry']": str(pred[1]) }, show(pred, null, { grid: column(i, 'read'), pred: both('write') }));
  }
  lines.push(`P(rain_5 | e_1:5) = ${str(f[0])}`);
  push(17, `印出第 5 天 rain 的精確機率 ${str(f[0])} ≈ ${dec(f[0])}。整個過程每天只用到前一天的 f 與今天的觀察，不必保存整段歷史，所以濾波可以隨著時間即時進行，每一步的成本固定。`,
    { "f['rain']": str(f[0]) }, show(pred, null, { grid: column(EVIDENCE.length - 1, 'found') }));
  lines.push(`P(e_1:5) = ${str(likelihood)} ≈ ${fixed(likelihood, 6)}`);
  if (lines.join('\n') !== TRACE_OUTPUT) throw new Error(`AIF16: the trace prints ${lines.join('\n')}, the program prints ${TRACE_OUTPUT}`);
  push(18, `印出整段觀察的機率 P(e_1:5) = ${str(likelihood)} ≈ ${fixed(likelihood, 6)}，它是 5 個 total 的乘積。前向演算法在濾波的同時，也回答了 HMM 的評估問題：這個模型產生這段觀察的機率有多大。`,
    { likelihood: str(likelihood) }, show(pred, null));
  return steps;
}

export const AIF16: LessonContent = {
  lessonId: 'AIF16',
  motivation: '貝氏網路描述的是某一個時刻的世界，可是很多問題都會隨時間變化：今天的天氣影響明天的天氣，說話時前一個音影響下一個音，病人昨天的狀況影響今天的狀況。設想一位整天待在地下室的警衛，看不到天空，只看得到主管每天進門時有沒有帶傘；他想知道今天外面是不是在下雨，也想知道這一週最可能的天氣是什麼。這一課先用馬可夫鏈描述會隨時間轉移的狀態：馬可夫性質、轉移矩陣、多步之後的分布與穩態分布，並以固定種子模擬一條鏈；再加上「狀態看不到、只看得到證據」，就是隱馬可夫模型（HMM）。我們用前向演算法做濾波，一天一天更新對隱藏天氣的信念，用 Viterbi 演算法找出最可能的整段天氣序列，最後說明模型的參數怎麼從資料學出來。語音辨識、詞性標注、基因序列分析與 PageRank 都建立在這些想法上。',
  sections: [
    {
      id: 'markov-property', title: '狀態、轉移與馬可夫性質',
      blocks: [
        { type: 'p', text: '要描述會隨時間變化的世界，先把時間切成一格一格（第 0 天、第 1 天…），每一格用一個隨機變數 X_t 表示當時的狀態（state），所有可能狀態的集合叫狀態空間。本課的天氣有 sunny、cloudy、rainy 三種狀態。一般來說，明天的天氣可能和過去每一天都有關，P(X_t | X_0, X_1, …, X_t−1) 的條件會越來越長，表格大小隨時間指數成長，根本存不下。' },
        { type: 'p', text: '馬可夫性質（Markov property）是一個簡化假設：給定現在的狀態，未來和過去條件獨立，即 P(X_t | X_0, …, X_t−1) = P(X_t | X_t−1)。滿足它的隨機過程叫（一階）馬可夫鏈（Markov chain）。再假設轉移的規則不隨時間改變（時間齊次，time-homogeneous），整條鏈就只需要兩樣東西：初始分布 P(X_0)，以及一張「今天是 i、明天是 j」的轉移機率表。這個模型以俄國數學家 Andrey Markov 命名：他在 1906 年開始研究這類相依的隨機序列，1913 年統計普希金《葉甫蓋尼・奧涅金》前 20,000 個字母的母音與子音如何前後相接，是最早的應用之一。' },
        { type: 'table', head: ['名詞', '意思', '天氣的例子'], rows: [
          ['狀態空間', '每個時刻可能處於的狀態', 'sunny、cloudy、rainy'],
          ['初始分布 P(X_0)', '第 0 天各狀態的機率', '已知今天是 sunny：(1, 0, 0)'],
          ['轉移機率 P(X_t = j | X_t−1 = i)', '今天是 i 時，明天是 j 的機率', 'P(rainy | sunny) = 0.1'],
          ['馬可夫性質', '明天只依賴今天，不必知道更早的歷史', '知道今天下雨，就不必再問前天的天氣'],
          ['時間齊次', '每一天都用同一張轉移表', '夏天與冬天用同一組機率（這是簡化）'],
        ] },
        { type: 'p', text: '有了轉移表，就能模擬一條鏈：從今天的狀態出發，依「今天那一列」的機率抽出明天，再以明天為新的今天重複。範例用 random.Random(1) 固定種子，先印出前 14 天，再數 10 萬天裡各種天氣出現的比例；最後把實際發生的轉移次數除以「從 sunny 出發的總次數」，從資料反推出 sunny 那一列的轉移機率，這就是轉移機率的最大概似估計。' },
        { type: 'example', id: 'e-simulate' },
        { type: 'p', text: '100 天時三種天氣的比例還很亂（0.35、0.32、0.33），10 萬天後穩定在 0.3888、0.3327、0.2785 附近，和起點是 sunny 無關；第三節會證明這三個數的精確值是 7/18、1/3、5/18。從資料估出的 sunny 列 0.6026、0.2957、0.1017 也很接近真正的 0.6、0.3、0.1。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：馬可夫性質表示過去不重要', text: '馬可夫性質不是說過去和未來無關。今天是 sunny 會讓兩天後也比較可能是 sunny，過去與未來是相關的；它說的是條件獨立：一旦知道現在的狀態，更早的歷史不再提供額外的資訊（AIF13 的條件獨立）。如果真實世界不符合這個假設，例如明天的天氣其實也受前天影響，常見的做法是把狀態放大，例如令狀態是「(昨天, 今天)」這一對，新的鏈就又滿足一階馬可夫性質；代價是狀態數從 3 變成 9。' },
      ],
    },
    {
      id: 'transition-matrix', title: '轉移矩陣與 n 步之後的分布',
      blocks: [
        { type: 'p', text: '把轉移機率排成 N × N 的轉移矩陣（transition matrix）P：第 i 列第 j 欄是 P(X_t+1 = j | X_t = i)。每一列都是一個機率分布，所以每個元素介於 0 與 1 之間，而且每一列的總和是 1；欄的總和沒有限制。本課的天氣鏈如下：' },
        { type: 'table', head: ['今天 \\ 明天', 'sunny', 'cloudy', 'rainy', '列的和'], rows: [
          ['sunny', '0.6', '0.3', '0.1', '1'],
          ['cloudy', '0.3', '0.4', '0.3', '1'],
          ['rainy', '0.2', '0.3', '0.5', '1'],
        ] },
        { type: 'p', text: '把第 t 天各狀態的機率寫成一個列向量 π_t。明天是 j 的機率，要把「今天是 i 而且明天轉成 j」對所有 i 加總：π_t+1[j] = Σ_i π_t[i] P[i][j]，也就是 π_t+1 = π_t P，這正是 AIF13 的邊際化。重複 n 次得到 π_n = π_0 Pⁿ。矩陣 Pⁿ 的第 i 列第 j 欄就是「n 步之後從 i 到 j」的機率；它滿足 Chapman–Kolmogorov 方程式 Pᵐ⁺ⁿ = Pᵐ Pⁿ：先走 m 步再走 n 步，中間經過哪個狀態都要加總。例如 P(兩天後 rainy | 今天 sunny) = 0.6 × 0.1 + 0.3 × 0.3 + 0.1 × 0.5 = 1/5，三項分別是明天 sunny、cloudy、rainy 三條路。' },
        { type: 'example', id: 'e-nstep' },
        { type: 'p', text: '從 sunny 出發，第 1 天的分布就是 P 的 sunny 列；之後每一步都用 Fraction 精確計算。到第 10 步，從 sunny 和從 rainy 出發的分布只在小數第四位才有差別，兩者都接近 (0.3889, 0.3333, 0.2778)：起點的影響隨步數迅速消失。每一步向量乘矩陣需要 N² 次乘法，算 n 步是 O(n N²)；如果要 Pⁿ 本身，可以用反覆平方在 O(N³ log n) 時間內求出。' },
        { type: 'callout', tone: 'note', title: '列向量還是行向量', text: '本課（也是多數機率與 AI 教科書）用「列是現在、欄是下一步」的矩陣，分布是列向量，寫成 πP。有些線性代數或物理的教材用轉置的慣例：欄是現在、分布是行向量，寫成 Pᵀπ 或 Pπ。兩者描述同一條鏈，讀別人的程式或論文時，先確認「列的和是 1」還是「欄的和是 1」。' },
      ],
    },
    {
      id: 'stationary', title: '穩態分布：什麼時候存在、唯一、會收斂',
      blocks: [
        { type: 'p', text: '如果一個分布 π 滿足 π = πP（而且每個值 ≥ 0、總和為 1），從 π 出發走一步之後分布還是 π，它就叫穩態分布（stationary distribution）。要精確算出來，可以把 π = πP 寫成 N 條線性方程式：它們只有 N − 1 條是獨立的，所以換掉其中一條，改放「總和為 1」，再用 Fraction 做高斯消去法求解。另一個做法是反覆計算 π_t+1 = π_t P，直到變化小於某個門檻（power iteration），得到的是近似值。' },
        { type: 'example', id: 'e-stationary' },
        { type: 'p', text: '天氣鏈的穩態分布精確等於 (7/18, 1/3, 5/18) ≈ (0.3889, 0.3333, 0.2778)，正好是第一節模擬 10 萬天時的出現比例：對這種「好」的鏈，長期下來待在每個狀態的時間比例會收斂到穩態分布（遍歷定理）。反覆計算從 sunny 出發，到第 15 步時每一格和 π 的差距已小於 10⁻⁶。範例最後的翻轉鏈卻不一樣：它的穩態分布是 (1/2, 1/2)，但從狀態 0 出發，分布在 (1, 0) 與 (0, 1) 之間永遠交替，不會收斂。' },
        { type: 'table', head: ['鏈的性質', '意思', '穩態分布'], rows: [
          ['有限個狀態', '狀態空間是有限集合', '至少存在一個'],
          ['不可約（irreducible）', '任兩個狀態都能在有限步內互相到達', '有限且不可約時恰好一個，而且每個值都大於 0'],
          ['不可約且非週期（aperiodic）', '不會被迫依固定週期回到某個狀態', '從任何起點出發，π_t 都收斂到它'],
          ['週期性：翻轉鏈 [[0, 1], [1, 0]]', '每一步一定換狀態，週期是 2', '(1/2, 1/2) 存在，但分布不收斂'],
          ['可約：兩個吸收狀態', '進入其中一個就永遠離不開', '不只一個：(1, 0)、(0, 1) 及它們的任何加權平均都是'],
          ['無限多個狀態：整數線上的對稱隨機漫步', '每步往左或往右各 1/2', '不存在（機率會一直散開）'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：到了穩態，鏈就停下來了', text: '穩態指的是「分布」不再改變，不是狀態不再改變。天氣鏈到了穩態之後，每天仍然會在 sunny、cloudy、rainy 之間轉換，只是「某一天是 rainy 的機率」固定在 5/18。另一個誤解是「有穩態分布就一定會收斂到它」：翻轉鏈有穩態分布，從確定的起點出發卻永遠在兩個分布之間跳動，收斂還需要不可約與非週期。' },
        { type: 'p', text: '穩態分布最有名的應用是 PageRank（Brin 與 Page，1998 年）：想像一位隨機上網的人，每一步依目前網頁的連結隨機點下一頁，網頁的重要性就是這條鏈的穩態機率。真實的網頁圖有死路、也有走不出去的小圈子，所以 PageRank 讓這位使用者以一定機率（常用 0.15）跳到任意網頁；這個「隨機跳轉」讓鏈變成不可約且非週期，於是穩態分布唯一，也能用反覆計算求出來。' },
      ],
    },
    {
      id: 'hmm', title: '隱馬可夫模型：看不到的狀態，看得到的觀察',
      blocks: [
        { type: 'p', text: '在很多問題裡，狀態本身看不到，只能看到和狀態有關的證據：地下室的警衛看不到天氣，只看到主管有沒有帶傘；語音辨識看不到說話者想說的音素，只聽到聲音的特徵；醫生看不到病人的身體狀況，只看到症狀。隱馬可夫模型（hidden Markov model，HMM）把這種情況寫成兩層：底下是一條看不到的馬可夫鏈 X_1, X_2, …（隱藏狀態），每個時刻再依目前的隱藏狀態產生一個看得到的觀察 E_t。' },
        { type: 'p', text: 'HMM 除了馬可夫性質，還有感測器的馬可夫假設：觀察只依賴當時的隱藏狀態，P(E_t | X_1:t, E_1:t−1) = P(E_t | X_t)。所以整個模型由三組參數決定，常寫成 λ = (π, A, B)：初始分布 π = P(X_1)、轉移矩陣 A、觀察機率（emission probability，也叫放射機率或感測模型）B[x][e] = P(E_t = e | X_t = x)。一條隱藏序列與觀察序列同時出現的機率是 P(x_1:T, e_1:T) = π(x_1) B[x_1][e_1] × Π_{t=2..T} A[x_t−1][x_t] B[x_t][e_t]。' },
        { type: 'table', head: ['參數', '雨傘世界的值', '意思'], rows: [
          ['隱藏狀態', 'rain、dry', '警衛看不到，只能推論'],
          ['觀察', 'umbrella、none', '主管有沒有帶傘，每天都看得到'],
          ['初始分布 π', 'rain 1/2、dry 1/2', '第 1 天之前沒有任何資訊'],
          ['轉移矩陣 A', 'rain→rain 0.7、dry→dry 0.7', '天氣傾向維持前一天的樣子'],
          ['觀察機率 B', 'P(umbrella | rain) = 0.9、P(umbrella | dry) = 0.2', '下雨天幾乎都帶傘，晴天偶爾也帶'],
        ] },
        { type: 'p', text: 'Rabiner 在 1989 年發表的 HMM 教學論文整理出評估、解碼、學習三個基本問題，這成為介紹 HMM 的標準架構；AIMA 則從代理人的角度，把隨時間推論分成濾波、預測、平滑與最可能解釋。兩者的對應如下，本課實作其中的濾波（也就解決了評估）與解碼：' },
        { type: 'table', head: ['問題', '問的是什麼', '方法'], rows: [
          ['評估（evaluation）', '這個模型產生這段觀察的機率 P(e_1:T | λ)', '前向演算法：正規化常數的乘積'],
          ['濾波（filtering）', '根據到今天為止的觀察，今天的隱藏狀態 P(X_t | e_1:t)', '前向演算法（本課第五節）'],
          ['預測（prediction）', '未來某一天的隱藏狀態 P(X_t+k | e_1:t)', '濾波後只做轉移、不再更新'],
          ['平滑（smoothing）', '用到全部的觀察，回頭估計過去某一天 P(X_k | e_1:T)', '前向—後向演算法'],
          ['解碼（decoding，最可能解釋）', '最可能的整段隱藏序列 argmax P(x_1:T | e_1:T)', 'Viterbi 演算法（本課第六節）'],
          ['學習（learning）', '只有觀察序列時，找出讓 P(e_1:T | λ) 最大的參數', 'Baum–Welch（EM）演算法'],
        ] },
        { type: 'callout', tone: 'note', title: 'HMM 的位置', text: 'HMM 的隱藏狀態是單一個離散變數。狀態是連續值（例如位置與速度）且模型是線性高斯時，同樣的濾波想法就是 Kalman filter；隱藏狀態由好幾個變數組成時，可以畫成動態貝氏網路（dynamic Bayesian network），HMM 是它最簡單的特例。HMM 在 1970 到 1980 年代成為語音辨識的主流方法，之後也廣泛用在詞性標注與基因序列分析。' },
      ],
    },
    {
      id: 'forward', title: '前向演算法：濾波與正規化',
      blocks: [
        { type: 'p', text: '濾波（filtering）是要算出 P(X_t | e_1:t)：根據到今天為止的所有觀察，今天的隱藏狀態的分布，也叫代理人的信念狀態。直接列舉要對前面每一天的隱藏狀態加總，共有 Nᵗ 條路徑；前向演算法（forward algorithm）改用遞迴，每天只做兩件事。預測（predict）：P(X_t | e_1:t−1) = Σ_x P(X_t | x) P(x | e_1:t−1)，把昨天的信念經過轉移矩陣推到今天。更新（update）：P(X_t | e_1:t) = α P(e_t | X_t) P(X_t | e_1:t−1)，乘上今天觀察的機率，再除以總和正規化。' },
        { type: 'p', text: '以雨傘世界為例。第 1 天看到帶傘：未正規化的值是 rain 0.9 × 0.5 = 0.45、dry 0.2 × 0.5 = 0.1，總和 0.55，正規化後 P(rain_1 | umbrella) = 0.45 / 0.55 = 9/11 ≈ 0.818。第 2 天先預測：0.7 × 9/11 + 0.3 × 2/11 = 69/110 ≈ 0.627，再乘上 0.9 與 0.2 並正規化，得到 621/703 ≈ 0.883。下方的視覺化逐行執行這個程式，每過一天就填好濾波表的一欄。' },
        { type: 'example', id: 'e-forward' },
        { type: 'p', text: '每天的成本是 O(N²)（每個今天的狀態都要對 N 個昨天的狀態加總），T 天是 O(T N²)，而且只需要記住昨天的信念，不必保存整段歷史；列舉全部路徑卻是 O(Nᵀ)。每天的正規化常數 total 正是 P(e_t | e_1:t−1)，把它們全部乘起來就是整段觀察的機率 P(e_1:5) = 68607401/2000000000 ≈ 0.0343，這同時解決了評估問題，可以用來比較兩個模型哪一個比較能解釋同一段觀察。' },
        { type: 'callout', tone: 'tip', title: '為什麼每一步都要正規化', text: '如果不正規化，前向訊息 α_t(x) = P(x_t, e_1:t) 是很多個小於 1 的數相乘，序列一長就會小到浮點數無法表示（下溢成 0.0），所有狀態都變成 0，比較不出大小。每天除以總和，數字一直保持在 0 到 1 之間；需要 P(e_1:T) 時，把每天的 total 取 log 相加，就得到 log P(e_1:T)。本課用 Fraction 精確計算，不會下溢，但分母會越來越大，長序列仍要改用浮點數加正規化。' },
        { type: 'p', text: '預測未來也用同一套：不再有新的觀察時，只做「預測」那一步。視覺化最後一步算出的第 6 天預測已經往 0.5 靠近；預測越遠的未來，信念越接近隱藏天氣鏈的穩態分布 (1/2, 1/2)，這和第三節「起點的影響會消失」是同一件事。若要用今天以後的觀察回頭修正過去某天的估計（平滑），則要再從最後一天往回算一次「後向訊息」，合起來就是前向—後向演算法。' },
      ],
    },
    {
      id: 'viterbi', title: 'Viterbi：最可能的狀態序列與學習參數',
      blocks: [
        { type: 'p', text: '解碼問題要找最可能的整段隱藏序列 argmax_{x_1:T} P(x_1:T | e_1:T)，因為分母 P(e_1:T) 是固定的，等於找讓 P(x_1:T, e_1:T) 最大的序列。路徑有 Nᵀ 條，Viterbi 演算法用動態規劃：令 m_t(x) 是「在第 t 天結束於狀態 x 的所有路徑中，最大的機率」，則 m_1(x) = π(x) B[x][e_1]，m_t(x) = B[x][e_t] × max_p m_t−1(p) A[p][x]。它和前向演算法的遞迴幾乎一樣，只是把對前一個狀態的加總 Σ 換成取最大值 max。這個演算法由 Andrew Viterbi 在 1967 年提出，原本用來為迴旋碼（convolutional code）解碼。' },
        { type: 'p', text: '只記住最大值還不夠，要知道最佳路徑經過哪裡：每一格同時記下達到最大值的前一個狀態，叫 backpointer。最後一天取 m_T 最大的狀態，再沿著 backpointer 一路往回走，就得到整條序列。時間是 O(T N²)，backpointer 需要 O(T N) 的記憶體。範例用列舉全部 2ᵀ 條路徑驗證 Viterbi 的答案。' },
        { type: 'example', id: 'e-viterbi' },
        { type: 'p', text: '長序列要用 log 機率：範例最後一行顯示 0.1 的 400 次方在浮點數裡已經變成 0.0，但 400 × log(0.1) ≈ −921.03 完全可以表示。取 log 之後乘法變加法，因為 log 是遞增函數，比較大小與取 max 的結果不變，所以 Viterbi 可以整個在 log 空間裡做。同分時要事先講好規則，例如「取狀態清單中較前面的那一個」；浮點數的 log 相加可能讓本來相等的兩條路徑出現極小的差距，需要穩定結果時可以像練習一樣用 Fraction 精確比較。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：把每天最可能的狀態串起來，就是最可能的序列', text: '觀察 none、umbrella、none 時，第 2 天單獨濾波的結果是 rain 279/397 ≈ 0.70；就算用上全部三天的觀察做平滑，第 2 天仍是 rain 比較可能（8649/15611 ≈ 0.55）。但 Viterbi 找出的最可能序列是 dry dry dry（機率 98/3125），而把每天最可能的狀態串起來的 dry rain dry 只有 81/3125。原因是 rain 的機率分散在好幾條路徑上，而 dry dry dry 這一條路徑單獨最大。要回答「每一天最可能是什麼」用濾波或平滑；要回答「整段最可能怎麼發生」用 Viterbi。如果某些轉移的機率是 0，逐日串起來的序列甚至可能根本不會發生。' },
        { type: 'p', text: '最後是學習問題：如果訓練資料標好了每一天的隱藏狀態，像第一節那樣數轉移與觀察的次數再除以總數即可。如果只有觀察序列，常用 Baum–Welch 演算法（Baum 與同事在 1970 年前後發表，是 EM 演算法的特例）：先猜一組參數，用前向—後向演算法算出「每個轉移與每個觀察預期發生幾次」，再把這些期望次數正規化成新的參數，重複到收斂。每一輪都不會讓 P(e_1:T | λ) 變小，但它只保證收斂到局部最大值，結果取決於初始參數，隱藏狀態的個數也要事先決定；學到的隱藏狀態只是數學上的分群，不一定對應到我們以為的「天氣」。本課不實作它。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-simulate', title: '轉移表與固定種子的馬可夫鏈模擬',
      description: '檢查轉移表每一列的總和是 1，從 sunny 出發以 random.Random(1) 模擬 10 萬天：印出前 14 天（S、C、R）、三個檢查點的狀態比例，以及由轉移次數估出的 sunny 列。',
      code: { Python: code`import random
from collections import Counter
from fractions import Fraction as F

states = ['sunny', 'cloudy', 'rainy']
P = {'sunny':  {'sunny': F(6, 10), 'cloudy': F(3, 10), 'rainy': F(1, 10)},
     'cloudy': {'sunny': F(3, 10), 'cloudy': F(4, 10), 'rainy': F(3, 10)},
     'rainy':  {'sunny': F(2, 10), 'cloudy': F(3, 10), 'rainy': F(5, 10)}}
for s in states:
    assert sum(P[s].values()) == 1, s  # 每一列都是一個機率分布

def step(rng, now):
    """只看今天的狀態 now，依 P[now] 抽出明天：這就是馬可夫性質。"""
    r, acc = rng.random(), 0
    for nxt in states:
        acc += P[now][nxt]
        if r < acc:
            return nxt
    return states[-1]

rng = random.Random(1)  # 固定種子：每次執行都得到同一條路徑
day, path = 'sunny', ['sunny']
seen, moves = Counter(), Counter()
for n in range(1, 100001):
    nxt = step(rng, day)
    moves[(day, nxt)] += 1  # 數轉移次數，之後可以反推轉移矩陣
    day = nxt
    seen[day] += 1
    if n < 14:
        path.append(day)
    if n == 13:
        print('前 14 天:', ' '.join(s[0].upper() for s in path))
    if n in (100, 10000, 100000):
        print(f'n={n:>6}', '  '.join(f'{s}={seen[s] / n:.4f}' for s in states))
out = sum(moves[('sunny', t)] for t in states)
print('估計的 sunny 列:', '  '.join(f'{t}={moves[("sunny", t)] / out:.4f}' for t in states))` },
      output: '前 14 天: S S C R C C C C R S S C C R\nn=   100 sunny=0.3500  cloudy=0.3200  rainy=0.3300\nn= 10000 sunny=0.3896  cloudy=0.3342  rainy=0.2762\nn=100000 sunny=0.3888  cloudy=0.3327  rainy=0.2785\n估計的 sunny 列: sunny=0.6026  cloudy=0.2957  rainy=0.1017',
    },
    {
      id: 'e-nstep', title: '多步轉移：P² 與 π_n = π_0 Pⁿ',
      description: '用 Fraction 算出兩步轉移矩陣 P² 的 sunny 列，並分別從 sunny 與 rainy 出發，印出第 0 到 3 步的精確分布與第 10 步的小數。',
      code: { Python: code`from fractions import Fraction as F

states = ['sunny', 'cloudy', 'rainy']
P = [[F(6, 10), F(3, 10), F(1, 10)],   # 列：今天；欄：明天
     [F(3, 10), F(4, 10), F(3, 10)],
     [F(2, 10), F(3, 10), F(5, 10)]]

def step(dist):
    """π_{t+1}[j] = Σ_i π_t[i] P[i][j]：列向量乘上轉移矩陣。"""
    return [sum(dist[i] * P[i][j] for i in range(3)) for j in range(3)]

def matmul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

P2 = matmul(P, P)  # 兩步轉移矩陣 P²
print('P(兩天後 rainy | 今天 sunny) =', P2[0][2], '=', ' + '.join(
    f'{P[0][k]}*{P[k][2]}' for k in range(3)))
print('P² 的 sunny 列:', [str(x) for x in P2[0]], '總和', sum(P2[0]))

for start in ['sunny', 'rainy']:
    dist = [F(int(s == start)) for s in states]  # 確定的起點
    for n in range(11):
        if n <= 3:
            print(f'{start} 起 n={n}:', '  '.join(str(p) for p in dist))
        if n == 10:
            print(f'{start} 起 n={n}:', '  '.join(f'{float(p):.6f}' for p in dist))
        dist = step(dist)` },
      output: 'P(兩天後 rainy | 今天 sunny) = 1/5 = 3/5*1/10 + 3/10*3/10 + 1/10*1/2\nP² 的 sunny 列: [\'47/100\', \'33/100\', \'1/5\'] 總和 1\nsunny 起 n=0: 1  0  0\nsunny 起 n=1: 3/5  3/10  1/10\nsunny 起 n=2: 47/100  33/100  1/5\nsunny 起 n=3: 421/1000  333/1000  123/500\nsunny 起 n=10: 0.388941  0.333333  0.277725\nrainy 起 n=0: 0  0  1\nrainy 起 n=1: 1/5  3/10  1/2\nrainy 起 n=2: 31/100  33/100  9/25\nrainy 起 n=3: 357/1000  333/1000  31/100\nrainy 起 n=10: 0.388836  0.333333  0.277830',
    },
    {
      id: 'e-stationary', title: '穩態分布：精確解、反覆計算與不收斂的翻轉鏈',
      description: '用 Fraction 的高斯消去法解 πP = π 與 Σπ = 1，驗證結果，數出反覆計算要幾步才接近它；再看週期為 2 的翻轉鏈有穩態分布卻不收斂。',
      code: { Python: code`from fractions import Fraction as F

def stationary(P):
    """解 πP = π 且 Σπ = 1（假設鏈不可約，解唯一），用 Fraction 做高斯消去法。"""
    n = len(P)
    # 第 j 條方程式：Σ_i π_i (P[i][j] − [i == j]) = 0；最後一條換成 Σ_i π_i = 1
    A = [[P[i][j] - (i == j) for i in range(n)] + [F(0)] for j in range(n - 1)]
    A.append([F(1)] * n + [F(1)])
    for c in range(n):
        r = next(r for r in range(c, n) if A[r][c] != 0)  # 找非零的樞紐
        A[c], A[r] = A[r], A[c]
        A[c] = [x / A[c][c] for x in A[c]]
        for r in range(n):
            if r != c and A[r][c] != 0:
                A[r] = [x - A[r][c] * y for x, y in zip(A[r], A[c])]
    return [row[-1] for row in A]

def step(dist, P):
    return [sum(dist[i] * P[i][j] for i in range(len(P))) for j in range(len(P))]

weather = [[F(6, 10), F(3, 10), F(1, 10)],
           [F(3, 10), F(4, 10), F(3, 10)],
           [F(2, 10), F(3, 10), F(5, 10)]]
pi = stationary(weather)
print('穩態 π =', [str(p) for p in pi], ' πP == π:', step(pi, weather) == pi)

dist, n = [F(1), F(0), F(0)], 0
while max(abs(a - b) for a, b in zip(dist, pi)) >= F(1, 10**6):
    dist, n = step(dist, weather), n + 1
print('從 sunny 出發，第', n, '步時每一格與 π 相差不到 10^-6')

flip = [[F(0), F(1)], [F(1), F(0)]]  # 週期 2：每天一定換狀態
print('翻轉鏈的穩態 =', [str(p) for p in stationary(flip)])
dist = [F(1), F(0)]
for t in range(5):
    print(f'  t={t}:', [str(p) for p in dist])
    dist = step(dist, flip)` },
      output: '穩態 π = [\'7/18\', \'1/3\', \'5/18\']  πP == π: True\n從 sunny 出發，第 15 步時每一格與 π 相差不到 10^-6\n翻轉鏈的穩態 = [\'1/2\', \'1/2\']\n  t=0: [\'1\', \'0\']\n  t=1: [\'0\', \'1\']\n  t=2: [\'1\', \'0\']\n  t=3: [\'0\', \'1\']\n  t=4: [\'1\', \'0\']',
    },
    {
      id: 'e-forward', title: '前向演算法：雨傘世界的濾波',
      description: '每天先用觀察機率更新、正規化成 P(X_t | e_1:t)，再經過轉移矩陣預測明天；印出 5 天的濾波結果、第 5 天的精確值，以及整段觀察的機率 P(e_1:5)。這也是視覺化執行的程式。',
      code: { Python: TRACE_CODE },
      output: TRACE_OUTPUT,
    },
    {
      id: 'e-viterbi', title: 'Viterbi：log 機率、backpointer 與列舉驗證',
      description: '在 log 空間做 Viterbi（u 是帶傘、n 是沒帶），沿 backpointer 還原最可能的序列，並與列舉全部 2ᵀ 條路徑的精確答案比較；最後一行示範機率連乘的下溢。',
      code: { Python: code`import math
from fractions import Fraction as F
from itertools import product

states = ['rain', 'dry']
start = {'rain': F(1, 2), 'dry': F(1, 2)}
T = {'rain': {'rain': F(7, 10), 'dry': F(3, 10)}, 'dry': {'rain': F(3, 10), 'dry': F(7, 10)}}
E = {'rain': {'u': F(9, 10), 'n': F(1, 10)}, 'dry': {'u': F(1, 5), 'n': F(4, 5)}}

def viterbi(obs):
    """m[x]：結束在 x 的最佳路徑的 log 機率；back[t][x]：那條路徑前一天的狀態。"""
    m = {x: math.log(start[x] * E[x][obs[0]]) for x in states}
    back = []
    for e in obs[1:]:
        ptr = {x: max(states, key=lambda p: m[p] + math.log(T[p][x])) for x in states}
        m = {x: m[ptr[x]] + math.log(T[ptr[x]][x] * E[x][e]) for x in states}
        back.append(ptr)
    path = [max(states, key=lambda x: m[x])]  # 同分時 max 取先列出的狀態
    for ptr in reversed(back):  # 沿著 backpointer 往回走
        path.append(ptr[path[-1]])
    return path[::-1], m[path[0]]

def joint(xs, obs):  # P(x_1:T, e_1:T)，精確值
    p = start[xs[0]] * E[xs[0]][obs[0]]
    for a, b, e in zip(xs, xs[1:], obs[1:]):
        p *= T[a][b] * E[b][e]
    return p

for obs in ['uunuu', 'nun']:
    path, logp = viterbi(obs)
    best = max(product(states, repeat=len(obs)), key=lambda xs: joint(xs, obs))
    print(obs, 'Viterbi:', ' '.join(path), f'log P = {logp:.4f}')
    print('    列舉 2^T 條路徑:', ' '.join(best), joint(best, obs), path == list(best))
print('0.1 ** 400 =', 0.1 ** 400, '  400 * log(0.1) =', f'{400 * math.log(0.1):.4f}')` },
      output: 'uunuu Viterbi: rain rain dry rain rain log P = -4.4590\n    列舉 2^T 條路徑: rain rain dry rain rain 2893401/250000000 True\nnun Viterbi: dry dry dry log P = -3.4622\n    列舉 2^T 條路徑: dry dry dry 98/3125 True\n0.1 ** 400 = 0.0   400 * log(0.1) = -921.0340',
    },
  ],
  exercises: [
    {
      id: 'x-hmm-decoder', title: 'HMM 解碼器：濾波與 Viterbi',
      statement: '讀入一個隱馬可夫模型與若干行查詢，用 `fractions.Fraction` 精確回答。`filter o1 o2 … oT` 印出濾波結果 P(X_T | e_1:T)：每一天先把預測乘上觀察機率、再除以總和正規化，然後經過轉移矩陣得到下一天的預測（第 1 天的預測就是起始分布）。任何一天的總和是 0，表示這段觀察不可能發生，濾波沒有定義。`viterbi o1 o2 … oT` 印出最可能的隱藏序列與它的聯合機率 P(x_1:T, e_1:T)，同分規則如下：計算 backpointer 時，若好幾個前一狀態的 m_t−1(p) × A[p][x] 一樣大，取 `states` 行中較前面的狀態；最後一天若好幾個狀態的 m_T 一樣大，也取較前面的狀態。所有比較都用分數精確進行。最大的聯合機率是 0 時，表示沒有任何序列能產生這段觀察。',
      inputFormat: '空白行（含只有空白的行）一律忽略，其餘每行以空白分隔。第 1 行 `states` 加上 N 個狀態名稱；第 2 行 `symbols` 加上 M 個觀察名稱；第 3 行 `start` 加上 N 個機率（依 states 的順序）。接著 N 行 `trans 狀態 p1 … pN`，狀態依 states 的順序，第 i 行第 j 個數是 P(X_t+1 = 第 j 個狀態 | X_t = 第 i 個狀態)。再接著 N 行 `emit 狀態 q1 … qM`，同樣依 states 的順序，第 k 個數是看到第 k 個觀察的機率。剩下的每一行都是一個查詢。機率寫成非負的小數（如 0.7）或分數（如 7/10）。',
      outputFormat: '每個查詢印一行。`filter` 印 `P(X_T | e_1:T) = 狀態:機率 …`（T 換成序列長度，狀態依 states 的順序，機率印成 Python 的 `str(Fraction)`，如 `9/11`、`0`、`1`），證據不可能時印 `P(X_T | e_1:T) = undefined (evidence has probability 0)`。`viterbi` 印 `best path: 狀態 … 狀態 (P = 機率)`，不可能時印 `best path: none (evidence has probability 0)`。查詢錯誤只影響那一行：查詢種類不是 filter 或 viterbi、沒有觀察或超過 12 個觀察時印 `error: bad query`；觀察不在 symbols 裡時印 `error: unknown symbol 名稱`（第一個未知的觀察，區分大小寫）。整份輸入的格式錯誤只印一行 `invalid input`：前三行的關鍵字不對、N 或 M 不是 1–4、名稱重複、數字個數不對、機率不是合法的非負小數或分母不為 0 的分數、trans 或 emit 的行數不夠或狀態名稱與順序不符、查詢超過 20 行。格式正確但某個分布的總和不是 1 時，依 start、各 trans 列、各 emit 列的順序，對第一個出錯的分布印 `invalid model: start sums to 總和`、`invalid model: trans 狀態 sums to 總和` 或 `invalid model: emit 狀態 sums to 總和`。',
      constraints: ['1 ≤ N ≤ 4 個隱藏狀態，1 ≤ M ≤ 4 種觀察；名稱是不含空白的字串，區分大小寫', '最多 20 行查詢，每個查詢 1–12 個觀察', '起始分布、轉移矩陣的每一列、觀察機率的每一列，總和都必須剛好是 1（用分數精確比較）', '只用 Python 標準函式庫'],
      samples: [
        { kind: 'normal', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\nfilter umbrella umbrella\nviterbi umbrella umbrella none umbrella umbrella\n', output: 'P(X_1 | e_1:1) = rain:9/11 dry:2/11\nP(X_2 | e_1:2) = rain:621/703 dry:82/703\nbest path: rain rain dry rain rain (P = 2893401/250000000)\n', note: '本課的雨傘世界：第 1、2 天的濾波（9/11 ≈ 0.818、621/703 ≈ 0.883）與 5 天的最可能天氣序列' },
        { kind: 'edge', input: 'states A B\nsymbols x y\nstart 1/2 1/2\ntrans A 1/2 1/2\ntrans B 1/2 1/2\nemit A 1/2 1/2\nemit B 1/2 1/2\nviterbi x y x\nfilter x y x\n', output: 'best path: A A A (P = 1/64)\nP(X_3 | e_1:3) = A:1/2 B:1/2\n', note: '完全對稱的模型：每條路徑機率都是 1/64，依同分規則取 A A A；濾波結果各半' },
      ],
      tests: [
        { kind: 'normal', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella umbrella none umbrella umbrella\nviterbi none umbrella none\nfilter none umbrella\nfilter none umbrella none\nviterbi umbrella\n', output: 'P(X_5 | e_1:5) = rain:59505867/68607401 dry:9101534/68607401\nbest path: dry dry dry (P = 98/3125)\nP(X_2 | e_1:2) = rain:279/397 dry:118/397\nP(X_3 | e_1:3) = rain:2307/15611 dry:13304/15611\nbest path: rain (P = 9/20)\n', note: '5 天的濾波 P(rain_5) ≈ 0.867；none umbrella none 的最可能序列是三天都 dry，但第 2 天單獨濾波時 rain 比較可能' },
        { kind: 'normal', input: 'states Healthy Fever\nsymbols normal cold dizzy\nstart 0.6 0.4\ntrans Healthy 0.7 0.3\ntrans Fever 0.4 0.6\nemit Healthy 0.5 0.4 0.1\nemit Fever 0.1 0.3 0.6\nviterbi normal cold dizzy\nfilter normal cold dizzy\nviterbi dizzy dizzy normal\n', output: 'best path: Healthy Healthy Fever (P = 189/12500)\nP(X_3 | e_1:3) = Healthy:962/4535 Fever:3573/4535\nbest path: Fever Fever Healthy (P = 54/3125)\n', note: '健康與發燒的經典例子：normal cold dizzy 的最可能序列是 Healthy Healthy Fever，機率 0.01512' },
        { kind: 'normal', input: 'states sunny cloudy rainy\nsymbols none few many\nstart 7/18 1/3 5/18\ntrans sunny 0.6 0.3 0.1\ntrans cloudy 0.3 0.4 0.3\ntrans rainy 0.2 0.3 0.5\nemit sunny 0.8 0.15 0.05\nemit cloudy 0.4 0.4 0.2\nemit rainy 0.1 0.3 0.6\nfilter many many\nviterbi none few many many few none\nfilter none none none\nviterbi many none many none many none many none many none many none\n', output: 'P(X_2 | e_1:2) = sunny:39/995 cloudy:198/995 rainy:758/995\nbest path: sunny cloudy rainy rainy cloudy sunny (P = 567/9765625)\nP(X_3 | e_1:3) = sunny:189744/257021 cloudy:59820/257021 rainy:7457/257021\nbest path: rainy cloudy rainy cloudy rainy cloudy rainy cloudy rainy cloudy rainy sunny (P = 4782969/38146972656250000)\n', note: '三種天氣、起點是穩態分布 7/18 1/3 5/18；長度 12 的序列也能精確計算' },
        { kind: 'edge', input: 'states only\nsymbols a b\nstart 1\ntrans only 1\nemit only 0.25 0.75\nfilter a b b\nviterbi a b b\n', output: 'P(X_3 | e_1:3) = only:1\nbest path: only only only (P = 9/64)\n', note: '只有一個狀態：濾波一定是 1，唯一的路徑機率是放射機率的乘積 1/4 × 3/4 × 3/4' },
        { kind: 'edge', input: 'states A B C\nsymbols x y\nstart 1/3 1/3 1/3\ntrans A 0 1/2 1/2\ntrans B 1/2 0 1/2\ntrans C 1/2 1/2 0\nemit A 1/2 1/2\nemit B 1 0\nemit C 1 0\nviterbi x x\nviterbi y x\nfilter y x\n', output: 'best path: C B (P = 1/6)\nbest path: A B (P = 1/12)\nP(X_2 | e_1:2) = A:0 B:1/2 C:1/2\n', note: '同分規則：x x 的最後一天 B 與 C 同為 1/6，取較前面的 B，再沿 backpointer 回到 C，所以印 C B 而不是 B C；y 只可能由 A 發出' },
        { kind: 'edge', input: 'states up down\nsymbols hi lo\nstart 1 0\ntrans up 0 1\ntrans down 1 0\nemit up 1 0\nemit down 0 1\nfilter hi lo hi\nviterbi hi lo hi\nfilter lo\nviterbi hi hi\nfilter hi hi\n', output: 'P(X_3 | e_1:3) = up:1 down:0\nbest path: up down up (P = 1)\nP(X_1 | e_1:1) = undefined (evidence has probability 0)\nbest path: none (evidence has probability 0)\nP(X_2 | e_1:2) = undefined (evidence has probability 0)\n', note: '機率 0 的起點、轉移與放射：唯一可能的序列機率是 1；不可能的證據印 undefined 與 none' },
        { kind: 'edge', input: '\r\nstates rain dry\r\n\r\nsymbols umbrella none\r\nstart 0.5 0.5\r\ntrans rain 7/10 3/10\r\ntrans dry 3/10 7/10\r\nemit rain 9/10 1/10\r\nemit dry 1/5 4/5\r\n\r\nfilter umbrella umbrella\r\n\r\n', output: 'P(X_2 | e_1:2) = rain:621/703 dry:82/703\n', note: 'Windows 換行與空行會被忽略；0.5 與 7/10 這類小數和分數寫法相同' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella sunny\npredict umbrella\nfilter\nviterbi umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella umbrella\nviterbi Umbrella\nfilter umbrella\n', output: 'error: unknown symbol sunny\nerror: bad query\nerror: bad query\nerror: bad query\nerror: unknown symbol Umbrella\nP(X_1 | e_1:1) = rain:9/11 dry:2/11\n', note: '未知的觀察、未知的查詢種類、空序列、超過 12 天、大小寫不同的符號都只影響該行；最後一行照常回答' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 0.6 0.3\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid model: start sums to 9/10\n', note: '起始分布的總和是 9/10' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.4 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid model: trans dry sums to 11/10\n', note: '轉移矩陣 dry 那一列的總和是 11/10' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.2\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid model: emit rain sums to 11/10\n', note: '放射機率 rain 那一列的總和是 11/10' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans dry 0.3 0.7\ntrans rain 0.7 0.3\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid input\n', note: '轉移的列沒有依 states 的順序' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nfilter umbrella\n', output: 'invalid input\n', note: '少了 emit dry 那一行，查詢行被當成放射的列' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 1.2 -0.2\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid input\n', note: '負的機率不是合法的數字' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/0\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\n', output: 'invalid input\n', note: '分母是 0' },
        { kind: 'error', input: 'states rain rain\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans rain 0.3 0.7\nemit rain 0.9 0.1\nemit rain 0.2 0.8\nfilter umbrella\n', output: 'invalid input\n', note: '狀態名稱重複' },
        { kind: 'error', input: 'states a b c d e\nsymbols x\nstart 0.2 0.2 0.2 0.2 0.2\n', output: 'invalid input\n', note: '狀態超過 4 個' },
        { kind: 'error', input: 'symbols umbrella none\nstates rain dry\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\n', output: 'invalid input\n', note: 'states 與 symbols 兩行的順序顛倒' },
        { kind: 'error', input: 'states rain dry\nsymbols umbrella none\nstart 1/2 1/2\ntrans rain 0.7 0.3\ntrans dry 0.3 0.7\nemit rain 0.9 0.1\nemit dry 0.2 0.8\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\nfilter umbrella\n', output: 'invalid input\n', note: '查詢超過 20 行' },
      ],
      hints: [
        '先把每個機率用 `Fraction(text)` 讀進來，存成 `trans[p][x]` 與 `emit[x][e]` 兩層字典；`Fraction("0.7")` 與 `Fraction("7/10")` 都是精確的 7/10。',
        '濾波照範例 e-forward 的順序：更新、檢查總和是不是 0、正規化、預測下一天。',
        'Viterbi 用 `max(states, key=...)` 選 backpointer：Python 的 max 在同分時回傳第一個最大的元素，正好是「取較前面的狀態」。',
        '把同分規則用一個完全對稱的模型測試：每條路徑的機率都一樣時，答案應該全部是第一個狀態。',
      ],
      solution: { Python: code`import re
import sys
from fractions import Fraction

NUMBER = re.compile(r'\d+(\.\d+)?|\d+/0*[1-9]\d*')  # 0.25 或 1/4，分母不為 0

def numbers(tokens, n):
    if len(tokens) != n or not all(NUMBER.fullmatch(t) for t in tokens):
        return None
    return [Fraction(t) for t in tokens]

def parse(lines):
    """回傳 (states, symbols, start, trans, emit, queries)；有錯時回傳要印的那一行。"""
    if len(lines) < 3:
        return 'invalid input'
    head = [line.split() for line in lines[:2]]
    if [h[:1] for h in head] != [['states'], ['symbols']]:
        return 'invalid input'
    states, symbols = head[0][1:], head[1][1:]
    for names in (states, symbols):
        if not 1 <= len(names) <= 4 or len(set(names)) != len(names):
            return 'invalid input'
    n = len(states)
    first = lines[2].split()
    start = numbers(first[1:], n) if first[:1] == ['start'] else None
    if start is None or len(lines) < 3 + 2 * n:
        return 'invalid input'
    rows = {}
    for k, (kind, width) in enumerate([('trans', n), ('emit', len(symbols))]):
        for i, s in enumerate(states):
            parts = lines[3 + k * n + i].split()
            row = numbers(parts[2:], width) if parts[:2] == [kind, s] else None
            if row is None:
                return 'invalid input'
            rows[(kind, s)] = dict(zip(states if kind == 'trans' else symbols, row))
    queries = lines[3 + 2 * n:]
    if len(queries) > 20:
        return 'invalid input'
    checks = [('start', dict(zip(states, start)))]
    checks += [(f'{k} {s}', rows[(k, s)]) for k in ('trans', 'emit') for s in states]
    for name, dist in checks:
        if sum(dist.values()) != 1:
            return f'invalid model: {name} sums to {sum(dist.values())}'
    trans = {s: rows[('trans', s)] for s in states}
    emit = {s: rows[('emit', s)] for s in states}
    return states, symbols, dict(zip(states, start)), trans, emit, queries

def forward(states, start, trans, emit, obs):
    """濾波：每一天先更新、再正規化；回傳 P(X_T | e_1:T)，證據不可能時回傳 None。"""
    pred = dict(start)
    for e in obs:
        unnorm = {x: emit[x][e] * pred[x] for x in states}
        total = sum(unnorm.values())
        if total == 0:
            return None
        f = {x: unnorm[x] / total for x in states}
        pred = {x: sum(f[p] * trans[p][x] for p in states) for x in states}
    return f

def viterbi(states, start, trans, emit, obs):
    """精確的 Viterbi：同分時取 states 中較前面的狀態（max 回傳第一個最大值）。"""
    m = {x: start[x] * emit[x][obs[0]] for x in states}
    back = []
    for e in obs[1:]:
        ptr = {x: max(states, key=lambda p: m[p] * trans[p][x]) for x in states}
        m = {x: m[ptr[x]] * trans[ptr[x]][x] * emit[x][e] for x in states}
        back.append(ptr)
    path = [max(states, key=lambda x: m[x])]
    if m[path[0]] == 0:
        return None, 0
    for ptr in reversed(back):
        path.append(ptr[path[-1]])
    return path[::-1], m[path[0]]

def answer(model, line):
    states, symbols, start, trans, emit = model
    kind, *obs = line.split()
    if kind not in ('filter', 'viterbi') or not 1 <= len(obs) <= 12:
        return 'error: bad query'
    for o in obs:
        if o not in symbols:
            return f'error: unknown symbol {o}'
    t = len(obs)
    if kind == 'filter':
        f = forward(states, start, trans, emit, obs)
        shown = ' '.join(f'{x}:{f[x]}' for x in states) if f else 'undefined (evidence has probability 0)'
        return f'P(X_{t} | e_1:{t}) = {shown}'
    path, p = viterbi(states, start, trans, emit, obs)
    return f'best path: {" ".join(path)} (P = {p})' if path else 'best path: none (evidence has probability 0)'

lines = [line for line in sys.stdin.read().replace('\r', '').split('\n') if line.strip()]
parsed = parse(lines)
if isinstance(parsed, str):
    print(parsed)
else:
    for line in parsed[5]:
        print(answer(parsed[:5], line))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'dp-table', title: '前向演算法：一天一欄填出濾波表', language: 'Python',
    code: TRACE_CODE,
    steps: forwardSteps(),
  },
  quiz: [
    {
      id: 'q-markov', prompt: '一階馬可夫鏈的馬可夫性質指的是哪一件事？',
      options: ['X_t 與 X_0 互相獨立，過去和未來沒有關係', '給定 X_t−1 之後，更早的 X_0 … X_t−2 不再提供關於 X_t 的任何資訊', '每一天的狀態都服從同一個分布', '轉移矩陣每一欄的總和都是 1'],
      answer: 1, explanation: '馬可夫性質是 P(X_t | X_0:t−1) = P(X_t | X_t−1)：給定現在，未來和過去條件獨立。它不是說過去和未來無關，過去仍透過現在影響未來（今天 sunny 讓兩天後也較可能 sunny）；「每天同一個分布」描述的是已經在穩態、或時間齊次的另一回事；轉移矩陣是每一列（不是每一欄）的總和為 1，而且那是機率分布的要求，不是馬可夫性質。',
    },
    {
      id: 'q-two-steps', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
P = [[F(1, 2), F(1, 2)],
     [F(1, 4), F(3, 4)]]
dist = [F(1), F(0)]
for _ in range(2):
    dist = [sum(dist[i] * P[i][j] for i in range(2)) for j in range(2)]
print(dist[0])` },
      options: ['1/2', '1/4', '3/8', '5/8'],
      answer: 2, explanation: '第一步後 dist = [1/2, 1/2]；第二步 dist[0] = 1/2 × 1/2 + 1/2 × 1/4 = 1/4 + 1/8 = 3/8，兩條路「0→0→0」與「0→1→0」都要加進來。1/2 是只走一步的結果；1/4 只算了「0→0→0」這一條路；5/8 是第二步之後的 dist[1]。',
    },
    {
      id: 'q-stationary', prompt: '兩個狀態的鏈，轉移矩陣是 P = [[0.9, 0.1], [0.5, 0.5]]（列是現在、欄是下一步）。它的穩態分布 π 是什麼？',
      options: ['(5/6, 1/6)', '(1/2, 1/2)', '(9/10, 1/10)', '(7/10, 3/10)'],
      answer: 0, explanation: '穩態要求 π = πP。第一個分量：π0 = 0.9 π0 + 0.5 π1，即 0.1 π0 = 0.5 π1，π0 = 5 π1，再配合 π0 + π1 = 1 得到 (5/6, 1/6)；驗算 5/6 × 0.1 = 1/12 = 1/6 × 0.5，兩邊的流量相等。(1/2, 1/2) 假設每個狀態一樣常出現；(9/10, 1/10) 只是第一列，也就是從狀態 0 出發一步後的分布；(7/10, 3/10) 是兩列的平均，不滿足 π = πP。',
    },
    {
      id: 'q-flip', prompt: '翻轉鏈的轉移矩陣是 [[0, 1], [1, 0]]：每一步一定換到另一個狀態。從狀態 0 出發（π_0 = (1, 0)），下列敘述何者正確？',
      options: ['這條鏈沒有穩態分布', '它有兩個不同的穩態分布', 'π_t 會隨著 t 變大收斂到 (1/2, 1/2)', '穩態分布 (1/2, 1/2) 存在而且唯一，但 π_t 在 (1, 0) 與 (0, 1) 之間交替，不會收斂'],
      answer: 3, explanation: '(1/2, 1/2) × P = (1/2, 1/2)，而且這條鏈不可約，所以穩態分布存在且唯一；但它的週期是 2，從 (1, 0) 出發每一步都整個翻過去，永遠不會收斂。「沒有穩態分布」錯在有限狀態的鏈至少有一個；「兩個穩態分布」是可約的鏈（例如兩個吸收狀態）才會發生；「會收斂」需要非週期，這條鏈不是。',
    },
    {
      id: 'q-filter', prompt: '旱季時，警衛對第 1 天的先驗是 P(rain_1) = 1/5、P(dry_1) = 4/5，觀察機率仍是 P(umbrella | rain) = 0.9、P(umbrella | dry) = 0.2。第 1 天看到主管帶傘，濾波結果 P(rain_1 | umbrella) 是多少？',
      options: ['9/10', '9/17', '0.18', '1/5'],
      answer: 1, explanation: '未正規化的值是 rain 0.9 × 1/5 = 0.18、dry 0.2 × 4/5 = 0.16，總和 0.34，正規化後 0.18 / 0.34 = 9/17 ≈ 0.53。9/10 是 P(umbrella | rain)，把條件的方向弄反了；0.18 是還沒正規化的聯合機率 P(rain, umbrella)；1/5 是先驗，沒有用到帶傘這個證據。',
    },
    {
      id: 'q-viterbi', prompt: '前向演算法與 Viterbi 演算法的遞迴非常相似。要把前向演算法改成 Viterbi，關鍵的改變是什麼？',
      options: ['把轉移矩陣轉置', '每一步都不要正規化', '把對前一個狀態的加總 Σ 換成取最大值 max，並記下是哪一個前一狀態達到最大（backpointer）', '把每天濾波結果最大的狀態依序串起來'],
      answer: 2, explanation: '前向演算法對所有前一狀態加總，得到 P(x_t, e_1:t)；Viterbi 只留最好的那一條路，所以用 max，並記下 backpointer，最後才能沿著它還原整條序列。轉置矩陣只是換成另一種寫法的慣例，算的仍然是加總；不正規化只改變數值的尺度，仍然是加總；把每天濾波最可能的狀態串起來不等於最可能的序列，例如 none、umbrella、none 時逐日串起來是 dry rain dry（81/3125），Viterbi 是 dry dry dry（98/3125）。',
    },
    {
      id: 'q-log', prompt: '對很長的觀察序列做 Viterbi 時，為什麼通常改用 log 機率？',
      options: ['很多個小於 1 的機率相乘會下溢成 0.0；取 log 後乘法變加法，而 log 是遞增函數，取 max 的結果不變', '取 log 之後結果會變成精確的分數', 'log 機率的總和就是後驗機率 P(x_1:T | e_1:T)', '取 log 可以把時間複雜度從 O(T N²) 降到 O(T N)'],
      answer: 0, explanation: '例如 0.1 的 400 次方在浮點數裡是 0.0，所有路徑都變成 0 就比不出大小；400 × log(0.1) ≈ −921 卻可以正常表示，而且 log 保持大小順序，argmax 不變。log 不會讓結果變成分數，它仍是浮點數；log 機率的總和是 log P(x_1:T, e_1:T)，是聯合機率而不是後驗；取 log 不改變要比較的狀態組合數，時間仍是 O(T N²)。',
    },
    {
      id: 'q-learning', prompt: '手上只有很多段觀察序列，不知道 HMM 的轉移機率與觀察機率，也沒有標好的隱藏狀態。下列關於學習這些參數的敘述，何者正確？',
      options: ['用 Viterbi 解碼就能直接得到保證最佳的參數', '前向演算法算出的 P(e_1:T) 本身就是轉移機率', '把每種觀察出現的次數除以總數，就得到轉移矩陣', 'Baum–Welch（EM）用前向—後向算出期望次數再重估參數，每輪不會讓概似變小，但可能停在局部最大值'],
      answer: 3, explanation: 'Baum–Welch 交替做兩步：用目前的參數以前向—後向算出每個轉移與觀察的期望次數，再把它們正規化成新參數；概似 P(e_1:T | λ) 每輪不減少，但只保證到局部最大值，結果依賴初始值。Viterbi 是在參數已知時找序列，不會產生參數；P(e_1:T) 是一個評估用的數字，不是轉移機率；觀察的出現次數只反映觀察的頻率，轉移是隱藏狀態之間的關係，沒有標記就無法直接數。',
    },
  ],
};
