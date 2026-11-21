import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF13 AI 的機率基礎 (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * The running example is one small world with three variables: Weather (sunny, cloudy, rainy), Umbrella (whether people
 * coming in carry an umbrella) and Wet (whether the ground at the door is wet). Its full joint distribution is given in
 * thousandths (PER_1000) and was built as P(W) P(U | W) P(Wet | W), so Umbrella and Wet are conditionally independent
 * given Weather but not independent.
 *
 * The visualization runs TRACE_CODE: it builds the 3 × 4 joint table, sums out rows for P(Weather) and columns for
 * P(umbrella), then answers P(Weather | umbrella = yes) by enumeration (summing out Wet) and normalization.
 * enumerationSteps() repeats that program on the same numbers with exact integer arithmetic (every probability is a
 * multiple of 1/1000), formats each fraction as Python's str(Fraction) does, and checks the printed lines against
 * TRACE_OUTPUT, which the lesson test compares with Python's real output.
 */
const WEATHER = ['sunny', 'cloudy', 'rainy'];
/** The columns are (umbrella, wet), in the order of `cols` in TRACE_CODE. */
const COLS = ['yes, yes', 'yes, no', 'no, yes', 'no, no'];
const PER_1000 = [[5, 45, 45, 405], [18, 72, 42, 168], [144, 36, 16, 4]];
const TRACE_OUTPUT = 'sum = 1\nP(W) = [\'1/2\', \'3/10\', \'1/5\']\nP(umbrella) = 8/25\nalpha = 25/8\nP(W | umbrella) = [\'5/32\', \'9/32\', \'9/16\']';

const TRACE_CODE = code`from fractions import Fraction
weather = ['sunny', 'cloudy', 'rainy']
cols = [('yes', 'yes'), ('yes', 'no'), ('no', 'yes'), ('no', 'no')]  # (umbrella, wet)
per_1000 = [[5, 45, 45, 405],      # sunny
            [18, 72, 42, 168],     # cloudy
            [144, 36, 16, 4]]      # rainy
joint = {}
for i, w in enumerate(weather):
    for j, (u, wet) in enumerate(cols):
        joint[(w, u, wet)] = Fraction(per_1000[i][j], 1000)
print('sum =', sum(joint.values()))
p_w = {w: sum(p for (w2, u, wet), p in joint.items() if w2 == w) for w in weather}
print('P(W) =', [str(p_w[w]) for w in weather])
p_u = sum(p for (w, u, wet), p in joint.items() if u == 'yes')
print('P(umbrella) =', p_u)
unnorm = {}
for w in weather:
    unnorm[w] = sum(joint[(w, 'yes', wet)] for wet in ['yes', 'no'])  # 把 wet 加總掉
alpha = 1 / sum(unnorm.values())
post = {w: alpha * unnorm[w] for w in weather}
print('alpha =', alpha)
print('P(W | umbrella) =', [str(post[w]) for w in weather])`;

const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
/** Python's str(Fraction(n, d)): reduced, and a whole number without a denominator. */
const frac = (n: number, d: number) => { const g = gcd(n, d); return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`; };
/** A count in thousandths as an exact three-place decimal (all of them are below 1000). */
const dec = (n: number) => `0.${String(n).padStart(3, '0')}`;
const pyList = (xs: string[]) => `[${xs.map(x => `'${x}'`).join(', ')}]`;

function enumerationSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const cells: string[][] = WEATHER.map(() => COLS.map(() => ''));
  const pw = WEATHER.map(() => ''), unnorm = WEATHER.map(() => ''), post = WEATHER.map(() => '');
  const lines: string[] = [];
  type GridMark = { at: [number, number]; kind: Mark };
  type CellMark = { at: number; kind: Mark };
  const grid = (marks: GridMark[]) => ({ name: 'joint：P(Weather, Umbrella, Wet)，列是 weather，欄是 (umbrella, wet)', cells: cells.map(r => [...r]), marks, rowLabels: WEATHER, colLabels: COLS });
  const vector = (name: string, values: string[], marks: CellMark[] = []) => ({ name, cells: [...values], marks, colLabels: WEATHER });
  const push = (line: number, note: string, vars: Record<string, string>, marks: GridMark[], extra: ReturnType<typeof vector>[]) =>
    steps.push({ line, note, vars, arrays: [grid(marks), ...extra], ...(lines.length ? { output: lines.join('\n') } : {}) });

  push(7, '三個隨機變數：Weather 的值域是 sunny、cloudy、rainy，Umbrella（進門的人帶傘）與 Wet（門口地面濕）的值域都是 yes、no。3 × 2 × 2 = 12 個可能世界，per_1000 是「每 1000 天裡有幾天是這個世界」。joint 先是空的字典。',
    {}, [], []);
  for (const [i, w] of WEATHER.entries()) {
    PER_1000[i].forEach((c, j) => { cells[i][j] = dec(c); });
    push(10, `i = ${i}，w = ${w}：內層迴圈把這一列的 4 個世界寫進 joint，例如 (${w}, yes, yes) 的機率是 Fraction(${PER_1000[i][0]}, 1000) = ${frac(PER_1000[i][0], 1000)}。表格用小數顯示，程式裡存的是約分後的精確分數。`,
      { i: String(i), w, 'len(joint)': String(4 * (i + 1)) }, COLS.map((_, j) => ({ at: [i, j] as [number, number], kind: 'write' as Mark })), []);
  }
  const total = PER_1000.flat().reduce((a, b) => a + b, 0);
  lines.push(`sum = ${frac(total, 1000)}`);
  push(11, `12 個世界的機率加起來剛好是 ${frac(total, 1000)}：一張合法的完整聯合分布，每一格介於 0 與 1 之間，總和為 1。`,
    { 'sum(joint.values())': frac(total, 1000) }, [], []);
  for (const [i, w] of WEATHER.entries()) {
    const s = PER_1000[i].reduce((a, b) => a + b, 0);
    pw[i] = frac(s, 1000);
    push(12, `邊際化：P(Weather = ${w}) 把 ${w} 這一列的 4 格加起來（umbrella 與 wet 是什麼都算），${PER_1000[i].map(dec).join(' + ')} = ${dec(s)} = ${pw[i]}。`,
      { w, [`p_w['${w}']`]: pw[i] }, COLS.map((_, j) => ({ at: [i, j] as [number, number], kind: 'read' as Mark })), [vector('p_w：P(Weather)', pw, [{ at: i, kind: 'write' }])]);
  }
  lines.push(`P(W) = ${pyList(pw)}`);
  push(13, `印出 P(Weather) = ${pw.join('、')}：這就是 Weather 的邊際分布，三個值加起來是 1。`, { p_w: pyList(pw) }, [], [vector('p_w：P(Weather)', pw)]);
  const pu = PER_1000.reduce((a, r) => a + r[0] + r[1], 0);
  push(14, `換一個方向加總：P(umbrella = yes) 是前兩欄（umbrella = yes）全部 6 格的和，把 weather 與 wet 都加總掉，得到 ${dec(pu)} = ${frac(pu, 1000)}。`,
    { p_u: frac(pu, 1000) }, WEATHER.flatMap((_, i) => [0, 1].map(j => ({ at: [i, j] as [number, number], kind: 'read' as Mark }))), [vector('p_w：P(Weather)', pw)]);
  lines.push(`P(umbrella) = ${frac(pu, 1000)}`);
  push(15, '印出 P(umbrella) = ' + frac(pu, 1000) + '。接下來回答查詢 P(Weather | umbrella = yes)：查詢變數是 Weather，證據是 umbrella = yes，wet 是隱藏變數。', { p_u: frac(pu, 1000) }, [], [vector('p_w：P(Weather)', pw)]);
  for (const [i, w] of WEATHER.entries()) {
    const s = PER_1000[i][0] + PER_1000[i][1];
    unnorm[i] = frac(s, 1000);
    push(18, `列舉：w = ${w} 時只看符合證據 umbrella = yes 的兩格，把隱藏變數 wet 加總掉：${dec(PER_1000[i][0])} + ${dec(PER_1000[i][1])} = ${dec(s)}，也就是 P(${w}, umbrella = yes) = ${unnorm[i]}。這還不是條件機率。`,
      { w, [`unnorm['${w}']`]: unnorm[i] }, [0, 1].map(j => ({ at: [i, j] as [number, number], kind: 'read' as Mark })),
      [vector('p_w：P(Weather)', pw), vector('unnorm：P(Weather, umbrella = yes)', unnorm, [{ at: i, kind: 'write' }])]);
  }
  const alpha = frac(1000, pu);
  push(19, `三個未正規化的值加起來是 ${frac(pu, 1000)}，正好是證據的機率 P(umbrella = yes)。α = 1 ÷ (${frac(pu, 1000)}) = ${alpha}，乘上它之後總和才會是 1。`,
    { 'sum(unnorm.values())': frac(pu, 1000), alpha }, [], [vector('p_w：P(Weather)', pw), vector('unnorm：P(Weather, umbrella = yes)', unnorm)]);
  WEATHER.forEach((_, i) => { post[i] = frac(PER_1000[i][0] + PER_1000[i][1], pu); });
  push(20, `正規化：每個值乘上 α，得到 P(Weather | umbrella = yes) = ${post.join('、')}。比例和 unnorm 一樣（1 : 1.8 : 3.6），只是縮放到總和為 1。`,
    { alpha, post: `{${WEATHER.map((w, i) => `'${w}': Fraction(${post[i].replace('/', ', ')})`).join(', ')}}` }, [],
    [vector('p_w：P(Weather)', pw), vector('unnorm：P(Weather, umbrella = yes)', unnorm), vector('post：P(Weather | umbrella = yes)', post, WEATHER.map((_, i) => ({ at: i, kind: 'write' as Mark })))]);
  lines.push(`alpha = ${alpha}`);
  push(21, `印出 alpha = ${alpha}。`, { alpha }, [],
    [vector('p_w：P(Weather)', pw), vector('unnorm：P(Weather, umbrella = yes)', unnorm), vector('post：P(Weather | umbrella = yes)', post)]);
  lines.push(`P(W | umbrella) = ${pyList(post)}`);
  if (lines.join('\n') !== TRACE_OUTPUT) throw new Error(`AIF13: the trace prints ${lines.join('\n')}, the program prints ${TRACE_OUTPUT}`);
  push(22, `印出結果。看到有人帶傘之後，rainy 的機率從先驗的 ${pw[2]} 升到 ${post[2]}，sunny 從 ${pw[0]} 降到 ${post[0]}：證據改變的是代理人的信念，世界本身沒有變。`,
    { 'P(W | umbrella)': pyList(post) }, [], [vector('p_w：P(Weather)', pw), vector('unnorm：P(Weather, umbrella = yes)', unnorm),
      vector('post：P(Weather | umbrella = yes)', post, WEATHER.map((_, i) => ({ at: i, kind: 'found' as Mark })))]);
  return steps;
}

export const AIF13: LessonContent = {
  lessonId: 'AIF13',
  motivation: '邏輯代理人只會說「真」或「假」，可是真實世界的代理人幾乎從來沒有把握：感測器會出錯、看不到全貌、行動的結果也不一定。一個待在室內的服務機器人看不到天空，只看得到進門的人有沒有帶傘、門口的地面濕不濕；「有人帶傘就是在下雨」這條規則顯然不對，但帶傘確實讓下雨變得比較可能。機率讓代理人把「比較可能」寫成數字，並在看到新證據時用一致的規則更新。這一課從為什麼代理人需要機率談起，學會隨機變數、完整聯合分布、邊際化、條件機率、乘法規則與連鎖規則，用列舉與正規化回答查詢，再看獨立與條件獨立怎麼把指數大小的表格縮小，最後用固定種子的模擬驗證機率真的能從資料裡估出來。接下來的貝氏定理與貝氏網路，都建立在這一課的計算上。',
  sections: [
    {
      id: 'why-probability', title: '為什麼代理人需要機率：不確定性與信念',
      blocks: [
        { type: 'p', text: 'AIF03 把環境分成完全可觀察與部分可觀察、確定與隨機。只要環境是部分可觀察或隨機的，代理人就處於不確定性（uncertainty）之中：它不知道世界現在的確切狀態，也不確定行動會帶來什麼結果。命題邏輯與一階邏輯的知識庫只能表達「一定成立」或「一定不成立」，遇到「通常成立」的知識就很吃力。以室內的機器人為例，規則「有人帶傘 ⇒ 下雨」是錯的（有人帶傘是為了遮陽，或因為預報說下午會下），反過來「下雨 ⇒ 有人帶傘」也是錯的（有人忘了帶）。' },
        { type: 'p', text: '要把這類規則修到正確，就得列出所有例外與前提，而這通常做不到。教科書常把原因分成三類：' },
        { type: 'table', head: ['原因', '意思', '天氣的例子'], rows: [
          ['懶惰（laziness）', '完整列出所有前提與例外太費工，規則也會長到無法使用', '「帶傘且不是遮陽且不是預報且不是習慣帶傘…則下雨」永遠寫不完'],
          ['理論上的無知（theoretical ignorance）', '這個領域本身沒有完整的理論', '沒有人知道一個人決定帶傘的完整原因'],
          ['實務上的無知（practical ignorance）', '就算知道所有規則，這一次也缺少需要的觀察', '機器人看不到天空，也不知道今天的預報'],
        ] },
        { type: 'p', text: '機率提供另一種做法：不去寫一定成立的規則，而是用 0 到 1 之間的數字表示代理人對一個命題的信念程度（degree of belief）。P(下雨 | 有人帶傘) = 0.56 的意思是：在代理人目前知道的事情之下，它相信正在下雨的程度是 0.56。機率把懶惰與無知造成的不確定性整理成一個數字；看到新的證據，信念就依機率的規則更新。這些信念再配上效用（utility，代理人對結果的偏好），就是後面決策理論的基礎：理性代理人選擇期望效用最大的行動。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：機率描述的是世界本身', text: '「P(rainy | umbrella) = 9/16」不是說外面正「有 56% 在下雨」。此刻外面要嘛在下雨、要嘛沒有；機率描述的是代理人的知識狀態。兩個代理人看到不同的證據，給同一件事不同的機率，可以都是對的；同一個代理人看到更多證據後改變機率，也不是之前算錯了。所以機率永遠要問「在什麼證據之下」。' },
      ],
    },
    {
      id: 'joint', title: '隨機變數、可能世界與完整聯合分布',
      blocks: [
        { type: 'p', text: '隨機變數（random variable）是世界裡我們關心、但不確定值的量，名稱習慣以大寫開頭，例如 Weather；它可能的值的集合叫值域（domain）。值域可以是布林（yes、no）、有限的離散值（sunny、cloudy、rainy），也可以是連續的實數（溫度）；本課只用離散的值域。Weather = rainy 這種「變數等於某個值」是最基本的命題，可以用且、或、非組合。一個可能世界（possible world）給每個變數都指定一個值，所有可能世界的數量是各值域大小的乘積。' },
        { type: 'table', head: ['隨機變數', '值域', '代理人怎麼知道'], rows: [
          ['Weather', 'sunny、cloudy、rainy', '看不到，只能推論（隱藏變數）'],
          ['Umbrella', 'yes、no', '看得到進門的人有沒有帶傘（證據）'],
          ['Wet', 'yes、no', '看得到門口地面濕不濕（證據）'],
        ] },
        { type: 'p', text: '機率模型給每個可能世界 ω 一個機率 P(ω)，必須滿足兩條公理：每個 0 ≤ P(ω) ≤ 1，而且所有世界的機率總和為 1（Kolmogorov 在 1933 年把機率論建立在這類公理上）。一個命題的機率就是讓它成立的世界的機率總和，由此可以推出 P(a ∨ b) = P(a) + P(b) − P(a ∧ b)。把每個可能世界的機率都列出來的表，叫完整聯合分布（full joint distribution）。下面是本課的表，以「每 1000 天裡有幾天」寫成小數：' },
        { type: 'table', head: ['Weather', 'umbrella, wet', 'umbrella, ¬wet', '¬umbrella, wet', '¬umbrella, ¬wet', '列的和 P(Weather)'], rows: [
          ['sunny', '0.005', '0.045', '0.045', '0.405', '0.500'],
          ['cloudy', '0.018', '0.072', '0.042', '0.168', '0.300'],
          ['rainy', '0.144', '0.036', '0.016', '0.004', '0.200'],
        ] },
        { type: 'p', text: '有了完整聯合分布，任何關於這三個變數的問題都能回答。最常用的操作是邊際化（marginalization）：要一個變數的分布，就把其他變數的所有值加總掉，P(Y) = Σ_z P(Y, z)。表格每一列的和就是 P(Weather)，叫做邊際分布（marginal distribution），名稱來自把這些和寫在表格的邊上。範例用 itertools.product 列出全部可能世界，檢查兩條公理，再算出每個變數的邊際分布，最後用兩種方法算出 P(rainy ∨ wet)。' },
        { type: 'example', id: 'e-joint' },
      ],
    },
    {
      id: 'conditional', title: '條件機率、乘法規則與連鎖規則',
      blocks: [
        { type: 'p', text: '沒有任何證據時的機率 P(a) 叫無條件機率或先驗機率（prior）；知道 b 成立之後 a 的機率叫條件機率（conditional probability）P(a | b)，也叫後驗機率（posterior）。定義是 P(a | b) = P(a ∧ b) / P(b)，只在 P(b) > 0 時有定義。直覺上：知道 b 成立，就把 b 不成立的世界全部劃掉，剩下的世界依原來的比例重新放大到總和為 1。例如 P(rainy | umbrella) = 0.180 / 0.320 = 9/16，比先驗的 1/5 高得多。' },
        { type: 'p', text: '把定義移項就是乘法規則（product rule）：P(a ∧ b) = P(a | b) P(b) = P(b | a) P(a)。對多個變數反覆使用，就得到連鎖規則（chain rule）：P(X1, X2, …, Xn) = P(X1) P(X2 | X1) P(X3 | X1, X2) … P(Xn | X1, …, Xn−1)。連鎖規則對任何順序、任何分布都成立，它本身沒有省下任何數字；但它把一張大表拆成一連串「給定前面，下一個變數怎麼分布」的小問題，下一段的條件獨立就是在這個拆解上簡化。' },
        { type: 'example', id: 'e-chain' },
        { type: 'table', head: ['規則', '式子', '範例中的數字'], rows: [
          ['條件機率', 'P(a | b) = P(a ∧ b) / P(b)，P(b) > 0', 'P(rainy | umbrella) = (9/50) / (8/25) = 9/16'],
          ['乘法規則', 'P(a ∧ b) = P(b | a) P(a)', 'P(rainy, umbrella) = 9/10 × 1/5 = 9/50'],
          ['連鎖規則', 'P(w, u, t) = P(w) P(u | w) P(t | w, u)', 'P(rainy, yes, yes) = 1/5 × 9/10 × 4/5 = 18/125'],
          ['邊際化', 'P(Y) = Σ_z P(Y, z)', 'P(umbrella) = 0.050 + 0.090 + 0.180 = 8/25'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把 P(a | b) 當成 P(b | a)', text: '範例印出 P(umbrella | rainy) = 9/10，但 P(rainy | umbrella) 只有 9/16。「下雨天幾乎人人帶傘」不等於「有人帶傘幾乎一定在下雨」，因為晴天的日子多得多，晴天帶傘的人加起來也不少。把兩個方向弄混，是醫療檢驗、法庭證據裡常見的推理錯誤；兩者之間的換算正是下一課貝氏定理的內容。另外，P(b) = 0 時 P(a | b) 沒有定義，程式要先檢查，不能直接除。' },
      ],
    },
    {
      id: 'enumeration', title: '列舉推論與正規化 α',
      blocks: [
        { type: 'p', text: '代理人的典型問題是：已知證據 e，查詢變數 X 的分布是什麼？其餘既不是查詢也不是證據的變數叫隱藏變數 Y。列舉推論（inference by enumeration）直接用完整聯合分布回答：P(X | e) = α P(X, e) = α Σ_y P(X, e, y)。先對 X 的每個值，把符合證據的世界加總（隱藏變數在這裡被邊際化），得到一組未正規化的數字；它們的總和正好是 P(e)，所以 α = 1 / P(e)，乘上 α 之後總和為 1。' },
        { type: 'p', text: '下方的視覺化逐步執行這個程式：先把 12 個世界填進表格、用列的和得到 P(Weather)、用前兩欄的和得到 P(umbrella)；接著對 P(Weather | umbrella = yes)，每一種天氣只看 umbrella = yes 的兩格並把 wet 加總掉，得到 0.050、0.090、0.180，最後乘上 α = 25/8，得到 5/32、9/32、9/16。注意 α 不必事先知道：未正規化的數字算完，加起來就是它的倒數。' },
        { type: 'example', id: 'e-enum' },
        { type: 'p', text: '範例回答了四個查詢。同時看到帶傘與地面濕，rainy 的機率升到 144/167，約 0.86；兩樣都沒看到，rainy 只剩 4/577。P(Wet | umbrella) 的隱藏變數換成 Weather，做法完全相同。列舉的缺點是成本：n 個布林變數的完整聯合分布有 2ⁿ 格，每個查詢都要掃過整張表，時間與空間都是 O(2ⁿ)；30 個布林變數就超過十億格，表格本身也不可能從資料中估出來。' },
        { type: 'callout', tone: 'tip', title: '先算未正規化，最後再除', text: '手算或寫程式時，先對每個值算出 P(X = x, e)，最後一起除以總和，比分別算 P(e) 與每個 P(x, e) 再相除簡單，也不容易出錯。總和是 0 表示證據本身不可能發生，條件機率沒有定義，要回報出來，練習題就要求這樣做。' },
      ],
    },
    {
      id: 'independence', title: '獨立與條件獨立：讓表格變小',
      blocks: [
        { type: 'p', text: '兩個變數 X、Y 獨立（independent），是指對所有值都有 P(x | y) = P(x)，等價於 P(x, y) = P(x) P(y)：知道 Y 不會改變對 X 的信念。若再加入一個與天氣無關的硬幣 Coin，完整聯合分布從 12 格變成 24 格，但獨立讓它可以寫成 P(Weather, Umbrella, Wet) × P(Coin)，只多存 1 個數字。n 個彼此獨立的布林變數只要 n 個數字，完整的表卻需要 2ⁿ − 1 個。' },
        { type: 'p', text: '真正獨立的變數很少；帶傘與地面濕就不獨立：看到地面濕，代理人更相信在下雨，於是也更預期有人帶傘。但它們之所以相關，完全是因為兩者都受天氣影響。只要知道天氣，帶傘就不再提供關於地面的任何資訊，這叫條件獨立（conditional independence）：對所有值都有 P(u, t | w) = P(u | w) P(t | w)。本課的表正是用 P(W) P(U | W) P(Wet | W) 建出來的，所以 2 + 3 + 3 = 8 個數字就能決定原本要 11 個自由數字的表。' },
        { type: 'example', id: 'e-indep' },
        { type: 'table', head: ['結構（全部是布林變數）', '完整聯合分布的自由數字', '利用獨立性後', 'n = 30 時'], rows: [
          ['n 個彼此獨立的變數', '2ⁿ − 1', 'n', '1,073,741,823 對 30'],
          ['1 個原因、n 個結果，給定原因時結果條件獨立', '2ⁿ⁺¹ − 1', '1 + 2n', '2,147,483,647 對 61'],
          ['本課：Weather 3 值、Umbrella 與 Wet 各 2 值', '3 × 2 × 2 − 1 = 11', '2 + 3 + 3 = 8', '—'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：獨立與條件獨立可以互相推出', text: '兩者沒有互相推出的關係。帶傘與地面濕不獨立，給定天氣卻條件獨立；反過來，兩枚公平硬幣 A、B 互相獨立，若 C 是「兩枚是否不同」（A XOR B），給定 C 之後 A、B 就不獨立了：知道 C 與 A，就能確定 B。練習的測資就有這個例子。判斷時一定要對每一個值的組合實際檢查等式，不能憑直覺。' },
        { type: 'p', text: '「一個原因、多個條件獨立的結果」這個結構，就是單純貝氏（naive Bayes）分類器的假設：垃圾郵件是原因，信裡出現的各個字是結果。把更多條件獨立關係畫成有向圖，就是之後的貝氏網路；它讓上千個變數的機率模型只需要存幾千個數字，而不是 2 的上千次方格。' },
      ],
    },
    {
      id: 'simulation', title: '用固定種子的模擬估計機率',
      blocks: [
        { type: 'p', text: '模型太大、無法列舉時，可以改用抽樣：依連鎖規則的順序，先依 P(W) 抽出天氣，再依 P(U | W) 與 P(Wet | W) 抽出另外兩個變數，就得到一個依模型分布的可能世界。重複 N 次，P(umbrella) 的估計就是「帶傘的樣本數 / N」；條件機率 P(rainy | umbrella) 則只看帶傘的樣本，數其中有幾個是雨天，這叫拒絕抽樣（rejection sampling）：不符合證據的樣本全部丟掉。大數法則保證樣本越多，估計越接近真正的機率。' },
        { type: 'example', id: 'e-sim' },
        { type: 'p', text: '輸出的誤差不是每一次都比上一次小：N = 1000 的誤差 0.0270 反而比 N = 100 的 0.0100 大，這是隨機性本身。真正會穩定下降的是誤差的典型大小 √(p(1 − p) / N)，它和 1/√N 成正比：樣本數變成 100 倍，誤差才縮小為 1/10。拒絕抽樣還有一個代價：只有約 32% 的樣本帶傘而被留下；證據越罕見，丟掉的樣本越多。列舉給出精確的 9/16，模擬只能給出近似值，但它的成本不隨變數個數呈指數成長。' },
        { type: 'callout', tone: 'note', title: '為什麼要固定種子', text: '範例用 random.Random(2026) 建立自己的亂數產生器，並且只呼叫 random()：Python 保證同一個種子下 random() 產生的序列在不同版本間不變，所以每次執行、每台電腦的輸出都相同，課程的自動測試才能比對。實驗時可以換不同的種子，看估計值怎麼在精確值附近擺動；但要比較兩種方法時，應該用同一組種子，才是公平的比較。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-joint', title: '完整聯合分布：可能世界、公理與邊際化',
      description: '用 itertools.product 列出 12 個可能世界，以 Fraction 存每個世界的機率；檢查兩條公理，對每個變數邊際化，並用兩種方法算出 P(rainy ∨ wet)。',
      code: { Python: code`from fractions import Fraction
from itertools import product

names = ['weather', 'umbrella', 'wet']
domains = {'weather': ['sunny', 'cloudy', 'rainy'],
           'umbrella': ['yes', 'no'], 'wet': ['yes', 'no']}
per_1000 = [5, 45, 45, 405, 18, 72, 42, 168, 144, 36, 16, 4]
worlds = list(product(*(domains[n] for n in names)))  # 所有可能世界
joint = {w: Fraction(c, 1000) for w, c in zip(worlds, per_1000)}

print('可能世界', len(worlds), '第一個', worlds[0])
print('都在 0 到 1 之間', all(0 <= p <= 1 for p in joint.values()))
print('總和', sum(joint.values()))

def marginal(var):
    i = names.index(var)
    dist = {v: Fraction(0) for v in domains[var]}
    for world, p in joint.items():
        dist[world[i]] += p  # 其他變數的值不管是什麼，都加進來
    return dist

for var in names:
    dist = marginal(var)
    print(f'P({var})', ' '.join(f'{v}={dist[v]}' for v in domains[var]))

rainy = marginal('weather')['rainy']
wet = marginal('wet')['yes']
both = sum(p for (w, u, t), p in joint.items() if w == 'rainy' and t == 'yes')
either = sum(p for (w, u, t), p in joint.items() if w == 'rainy' or t == 'yes')
print('P(rainy or wet) =', either, '=', rainy + wet - both)` },
      output: '可能世界 12 第一個 (\'sunny\', \'yes\', \'yes\')\n都在 0 到 1 之間 True\n總和 1\nP(weather) sunny=1/2 cloudy=3/10 rainy=1/5\nP(umbrella) yes=8/25 no=17/25\nP(wet) yes=27/100 no=73/100\nP(rainy or wet) = 31/100 = 31/100',
    },
    {
      id: 'e-chain', title: '條件機率、乘法規則與連鎖規則',
      description: 'P(**fixed) 固定某些變數的值並把其餘加總掉；cond(a, b) 依定義計算條件機率。比較兩個方向的條件機率，並在全部 12 個世界上驗證連鎖規則。',
      code: { Python: code`from fractions import Fraction
from itertools import product

per_1000 = [5, 45, 45, 405, 18, 72, 42, 168, 144, 36, 16, 4]
worlds = list(product(['sunny', 'cloudy', 'rainy'], ['yes', 'no'], ['yes', 'no']))
joint = {w: Fraction(c, 1000) for w, c in zip(worlds, per_1000)}

def P(**fixed):
    """固定某些變數的值，把其餘變數加總掉：P(weather='rainy', umbrella='yes')。"""
    keys = ['weather', 'umbrella', 'wet']
    return sum(p for world, p in joint.items()
               if all(world[keys.index(k)] == v for k, v in fixed.items()))

def cond(a, b):
    """條件機率 P(a | b) = P(a, b) / P(b)，只在 P(b) > 0 時有定義。"""
    pb = P(**b)
    if pb == 0:
        return None
    return P(**a, **b) / pb

print('P(rainy) =', P(weather='rainy'))
print('P(rainy | umbrella) =', cond({'weather': 'rainy'}, {'umbrella': 'yes'}))
print('P(umbrella | rainy) =', cond({'umbrella': 'yes'}, {'weather': 'rainy'}))
both = P(weather='rainy', umbrella='yes')
print('乘法規則', both, '=', cond({'umbrella': 'yes'}, {'weather': 'rainy'}) * P(weather='rainy'))

ok = True
for w, u, t in worlds:  # 連鎖規則：P(w, u, t) = P(w) P(u | w) P(t | w, u)
    chain = (P(weather=w) * cond({'umbrella': u}, {'weather': w})
             * cond({'wet': t}, {'weather': w, 'umbrella': u}))
    ok = ok and chain == joint[(w, u, t)]
print('連鎖規則在 12 個世界都成立:', ok)
print('P(rainy, yes, yes) =', P(weather='rainy'), '*',
      cond({'umbrella': 'yes'}, {'weather': 'rainy'}), '*',
      cond({'wet': 'yes'}, {'weather': 'rainy', 'umbrella': 'yes'}), '=', joint[('rainy', 'yes', 'yes')])` },
      output: 'P(rainy) = 1/5\nP(rainy | umbrella) = 9/16\nP(umbrella | rainy) = 9/10\n乘法規則 9/50 = 9/50\n連鎖規則在 12 個世界都成立: True\nP(rainy, yes, yes) = 1/5 * 9/10 * 4/5 = 18/125',
    },
    {
      id: 'e-enum', title: '列舉推論：P(X | e) = α Σ_y P(X, e, y)',
      description: '一個通用的 enumerate_ask：留下符合證據的世界，依查詢變數的值加總（隱藏變數被邊際化），再除以總和 P(e) 正規化。印出四個查詢的 P(e)、α 與後驗分布。',
      code: { Python: code`from fractions import Fraction
from itertools import product

names = ['weather', 'umbrella', 'wet']
domains = {'weather': ['sunny', 'cloudy', 'rainy'],
           'umbrella': ['yes', 'no'], 'wet': ['yes', 'no']}
per_1000 = [5, 45, 45, 405, 18, 72, 42, 168, 144, 36, 16, 4]
joint = {w: Fraction(c, 1000) for w, c in
         zip(product(*(domains[n] for n in names)), per_1000)}

def enumerate_ask(x, evidence):
    """P(X | e) = α Σ_y P(X, e, y)：留下符合證據的世界，依 X 的值加總，再正規化。"""
    unnorm = {v: Fraction(0) for v in domains[x]}
    for world, p in joint.items():
        values = dict(zip(names, world))
        if all(values[k] == v for k, v in evidence.items()):
            unnorm[values[x]] += p  # 隱藏變數在這裡被加總掉
    total = sum(unnorm.values())  # = P(e)
    if total == 0:
        return None, total
    return {v: unnorm[v] / total for v in domains[x]}, total

queries = [('weather', {'umbrella': 'yes'}),
           ('weather', {'umbrella': 'yes', 'wet': 'yes'}),
           ('weather', {'umbrella': 'no', 'wet': 'no'}),
           ('wet', {'umbrella': 'yes'})]
for x, e in queries:
    dist, pe = enumerate_ask(x, e)
    shown = ', '.join(f'{k}={v}' for k, v in e.items())
    print(f'P({x} | {shown})  P(e)={pe}  alpha={1 / pe}')
    print('   ', '  '.join(f'{v}:{dist[v]}' for v in domains[x]))` },
      output: 'P(weather | umbrella=yes)  P(e)=8/25  alpha=25/8\n    sunny:5/32  cloudy:9/32  rainy:9/16\nP(weather | umbrella=yes, wet=yes)  P(e)=167/1000  alpha=1000/167\n    sunny:5/167  cloudy:18/167  rainy:144/167\nP(weather | umbrella=no, wet=no)  P(e)=577/1000  alpha=1000/577\n    sunny:405/577  cloudy:168/577  rainy:4/577\nP(wet | umbrella=yes)  P(e)=8/25  alpha=25/8\n    yes:167/320  no:153/320',
    },
    {
      id: 'e-indep', title: '獨立、條件獨立與表格大小',
      description: '檢查 Umbrella 與 Wet 是否獨立、給定 Weather 時是否條件獨立，再計算「1 個原因、n 個結果」的完整聯合表與分解後各需要多少數字。',
      code: { Python: code`from fractions import Fraction
from itertools import product

W, YN = ['sunny', 'cloudy', 'rainy'], ['yes', 'no']
per_1000 = [5, 45, 45, 405, 18, 72, 42, 168, 144, 36, 16, 4]
joint = {k: Fraction(c, 1000) for k, c in zip(product(W, YN, YN), per_1000)}

def P(w=None, u=None, t=None):
    return sum(p for (w2, u2, t2), p in joint.items()
               if w in (None, w2) and u in (None, u2) and t in (None, t2))

# 獨立：P(u, t) 是否等於 P(u) P(t)？
print('P(umbrella, wet) =', P(u='yes', t='yes'), ' P(umbrella) P(wet) =', P(u='yes') * P(t='yes'))
print('umbrella 與 wet 獨立:', all(P(u=u, t=t) == P(u=u) * P(t=t) for u in YN for t in YN))

# 條件獨立：在每一種 weather 之下，P(u, t | w) 是否等於 P(u | w) P(t | w)？
for w in W:
    pw = P(w=w)
    lhs = P(w, 'yes', 'yes') / pw
    rhs = (P(w, u='yes') / pw) * (P(w, t='yes') / pw)
    print(f'  {w:6} P(u,t|w)={lhs}  P(u|w)P(t|w)={rhs}')
ci = all(P(w, u, t) / P(w=w) == (P(w, u=u) / P(w=w)) * (P(w, t=t) / P(w=w))
         for w in W for u in YN for t in YN)
print('給定 weather 時條件獨立:', ci)

# 表格大小：1 個布林原因加 n 個布林結果，結果在給定原因時彼此條件獨立
for n in [2, 10, 30]:
    cells = 2 ** (n + 1)
    print(f'n={n}: 完整聯合表 {cells:,} 格（{cells - 1:,} 個自由數字），分解後 {1 + 2 * n} 個數字')` },
      output: 'P(umbrella, wet) = 167/1000  P(umbrella) P(wet) = 54/625\numbrella 與 wet 獨立: False\n  sunny  P(u,t|w)=1/100  P(u|w)P(t|w)=1/100\n  cloudy P(u,t|w)=3/50  P(u|w)P(t|w)=3/50\n  rainy  P(u,t|w)=18/25  P(u|w)P(t|w)=18/25\n給定 weather 時條件獨立: True\nn=2: 完整聯合表 8 格（7 個自由數字），分解後 5 個數字\nn=10: 完整聯合表 2,048 格（2,047 個自由數字），分解後 21 個數字\nn=30: 完整聯合表 2,147,483,648 格（2,147,483,647 個自由數字），分解後 61 個數字',
    },
    {
      id: 'e-sim', title: '固定種子的模擬：估計值往精確值收斂',
      description: '依 P(W)、P(U | W)、P(Wet | W) 抽樣，估計 P(umbrella) 與 P(rainy | umbrella)（拒絕抽樣），在 N = 100 到 100000 時和精確值 8/25、9/16 比較。',
      code: { Python: code`import math
import random
from fractions import Fraction

P_W = [('sunny', Fraction(1, 2)), ('cloudy', Fraction(3, 10)), ('rainy', Fraction(1, 5))]
P_U = {'sunny': Fraction(1, 10), 'cloudy': Fraction(3, 10), 'rainy': Fraction(9, 10)}
P_T = {'sunny': Fraction(1, 10), 'cloudy': Fraction(1, 5), 'rainy': Fraction(4, 5)}

def sample(rng):
    """依 P(W)、P(U | W)、P(T | W) 的順序抽出一個世界。"""
    r, acc = rng.random(), 0
    for w, p in P_W:
        acc += p
        if r < acc:
            break
    return w, rng.random() < P_U[w], rng.random() < P_T[w]

rng = random.Random(2026)  # 固定種子：每次執行結果相同
exact_u, exact_rain = Fraction(8, 25), Fraction(9, 16)
n = umb = rain_and_umb = 0
for checkpoint in [100, 1000, 10000, 100000]:
    while n < checkpoint:
        w, u, t = sample(rng)
        n += 1
        if u:
            umb += 1
            rain_and_umb += w == 'rainy'
    est_u, est_rain = umb / n, rain_and_umb / umb
    typical = math.sqrt(exact_u * (1 - exact_u) / n)  # 誤差的典型大小，與 1/√N 成正比
    print(f'N={n:>6}  P(umbrella)≈{est_u:.4f} 誤差 {abs(est_u - exact_u):.4f}'
          f' (典型 {typical:.4f})  P(rainy|umbrella)≈{est_rain:.4f}')
print(f'精確值    P(umbrella)={float(exact_u):.4f}  P(rainy|umbrella)={float(exact_rain):.4f}')` },
      output: 'N=   100  P(umbrella)≈0.3100 誤差 0.0100 (典型 0.0466)  P(rainy|umbrella)≈0.6129\nN=  1000  P(umbrella)≈0.2930 誤差 0.0270 (典型 0.0148)  P(rainy|umbrella)≈0.5802\nN= 10000  P(umbrella)≈0.3153 誤差 0.0047 (典型 0.0047)  P(rainy|umbrella)≈0.5633\nN=100000  P(umbrella)≈0.3189 誤差 0.0011 (典型 0.0015)  P(rainy|umbrella)≈0.5608\n精確值    P(umbrella)=0.3200  P(rainy|umbrella)=0.5625',
    },
  ],
  exercises: [
    {
      id: 'x-joint-query', title: '聯合分布查詢器：邊際、條件機率與獨立性',
      statement: '讀入一張離散隨機變數的聯合機率表，逐一回答查詢，所有機率都要精確（用 `fractions.Fraction`）。表中沒有列出的可能世界，機率是 0。支援兩種查詢：(1) `P X` 或 `P X | A=a B=b ...`：查詢變數 X 的分布，`|` 後面是零個以上的證據；做法是邊際化加上正規化。若證據的機率是 0，條件機率沒有定義。(2) `indep X Y` 或 `indep X Y | Z`：判斷 X 與 Y 是否獨立（對所有值的組合都有 P(x, y) = P(x) P(y)），或給定 Z 時是否條件獨立（對每個 P(z) > 0 的 z 與所有 x、y，都有 P(x, y | z) = P(x | z) P(y | z)；P(z) = 0 的 z 不檢查）。',
      inputFormat: '第一行整數 N（變數個數）；接著 N 行，每行是變數名稱與它的 2–4 個值，以空白分隔。下一行整數 M（表的列數），接著 M 行，每行依變數的順序給每個變數一個值，最後是這個世界的機率：非負的小數（如 0.125）或分數（如 1/8）。再下一行整數 Q，接著 Q 行查詢。結尾的空行會被忽略。',
      outputFormat: '每個查詢印一行。`P` 查詢印 `P(X) = 值:機率 值:機率 ...` 或 `P(X | 證據原樣以空白連接) = ...`，值依 X 的值域在輸入中的順序，機率印成 Python 的 `str(Fraction)`（如 `5/32`、`0`、`1`）；證據機率為 0 時印 `P(X | ...) = undefined (evidence has probability 0)`。`indep` 查詢印 `X, Y independent: yes` 或 `no`，有條件時印 `X, Y independent given Z: yes` 或 `no`。查詢錯誤只影響那一行：查詢種類不是 P 或 indep、變數個數不對、`|` 後面是空的、該寫變數名稱的地方出現 `=`、證據不是 `名稱=值`、同一個變數重複出現（包含查詢變數又出現在證據裡）時印 `error: bad query`；變數名稱不存在印 `error: unknown variable 名稱`；值不在值域裡印 `error: unknown value 名稱=值`。整份輸入格式錯誤（N 不是 1–4、某個變數的值不是 2–4 個或有重複、名稱重複或含 `=`、M 不是 1–256、某列的欄位數不對、值不在值域、同一個世界列出兩次、機率不是合法的非負小數或分母不為 0 的分數、Q 不是 0–50、行數和 M 或 Q 不符）只印一行 `invalid input`；格式正確但機率總和不是 1 時印 `invalid input: total probability 總和`。',
      constraints: ['1 ≤ N ≤ 4，每個變數 2–4 個值，所以最多 256 個可能世界', '1 ≤ M ≤ 256，0 ≤ Q ≤ 50', '名稱與值是不含空白、不含 `=` 的字串，區分大小寫', '機率總和必須剛好等於 1（用分數精確比較，不用浮點數）'],
      samples: [
        { kind: 'normal', input: '3\nWeather sunny cloudy rainy\nUmbrella yes no\nWet yes no\n12\nsunny yes yes 0.005\nsunny yes no 0.045\nsunny no yes 0.045\nsunny no no 0.405\ncloudy yes yes 0.018\ncloudy yes no 0.072\ncloudy no yes 0.042\ncloudy no no 0.168\nrainy yes yes 0.144\nrainy yes no 0.036\nrainy no yes 0.016\nrainy no no 0.004\n5\nP Weather\nP Weather | Umbrella=yes\nP Weather | Umbrella=yes Wet=yes\nindep Umbrella Wet\nindep Umbrella Wet | Weather\n', output: 'P(Weather) = sunny:1/2 cloudy:3/10 rainy:1/5\nP(Weather | Umbrella=yes) = sunny:5/32 cloudy:9/32 rainy:9/16\nP(Weather | Umbrella=yes Wet=yes) = sunny:5/167 cloudy:18/167 rainy:144/167\nUmbrella, Wet independent: no\nUmbrella, Wet independent given Weather: yes\n', note: '本課的天氣表（小數寫法）：邊際、條件、列舉推論，以及不獨立但條件獨立' },
        { kind: 'edge', input: '2\nLight red green\nSensor on off\n3\nred on 1/2\nred off 1/4\ngreen off 1/4\n4\nP Sensor\nP Light | Sensor=on\nP Sensor | Light=green\nindep Light Sensor\n', output: 'P(Sensor) = on:1/2 off:1/2\nP(Light | Sensor=on) = red:1 green:0\nP(Sensor | Light=green) = on:0 off:1\nLight, Sensor independent: no\n', note: '沒列出的 (green, on) 機率是 0；P(Light | Sensor=on) 全部落在 red' },
      ],
      tests: [
        { kind: 'normal', input: '3\nWeather sunny cloudy rainy\nUmbrella yes no\nWet yes no\n12\nsunny yes yes 5/1000\nsunny yes no 45/1000\nsunny no yes 45/1000\nsunny no no 405/1000\ncloudy yes yes 18/1000\ncloudy yes no 72/1000\ncloudy no yes 42/1000\ncloudy no no 168/1000\nrainy yes yes 144/1000\nrainy yes no 36/1000\nrainy no yes 16/1000\nrainy no no 4/1000\n5\nP Wet | Umbrella=yes\nP Umbrella\nP Weather | Umbrella=no Wet=no\nP Weather | Wet=yes Umbrella=yes\nindep Weather Wet\n', output: 'P(Wet | Umbrella=yes) = yes:167/320 no:153/320\nP(Umbrella) = yes:8/25 no:17/25\nP(Weather | Umbrella=no Wet=no) = sunny:405/577 cloudy:168/577 rainy:4/577\nP(Weather | Wet=yes Umbrella=yes) = sunny:5/167 cloudy:18/167 rainy:144/167\nWeather, Wet independent: no\n', note: '同一張表的分數寫法：把 Weather 加總掉的 P(Wet | Umbrella)；證據順序不同，答案相同' },
        { kind: 'normal', input: '2\nCoin H T\nDie one two three\n6\nH one 1/6\nH two 1/6\nH three 1/6\nT one 1/6\nT two 1/6\nT three 1/6\n4\nindep Coin Die\nP Coin | Die=two\nP Coin\nP Die | Coin=T\n', output: 'Coin, Die independent: yes\nP(Coin | Die=two) = H:1/2 T:1/2\nP(Coin) = H:1/2 T:1/2\nP(Die | Coin=T) = one:1/3 two:1/3 three:1/3\n', note: '硬幣與骰子獨立：加上證據不會改變另一個變數的分布' },
        { kind: 'normal', input: '3\nA 0 1\nB 0 1\nC 0 1\n4\n0 0 0 1/4\n0 1 1 1/4\n1 0 1 1/4\n1 1 0 1/4\n5\nindep A B\nindep A C\nindep A B | C\nP A | B=1 C=0\nP C | A=1\n', output: 'A, B independent: yes\nA, C independent: yes\nA, B independent given C: no\nP(A | B=1 C=0) = 0:0 1:1\nP(C | A=1) = 0:1/2 1:1/2\n', note: 'C = A XOR B：A、B 獨立，A、C 也兩兩獨立，但給定 C 之後 A、B 不再獨立' },
        { kind: 'normal', input: '3\nSpam yes no\nFree yes no\nWin yes no\n8\nyes yes yes 0.192\nyes yes no 0.048\nyes no yes 0.128\nyes no no 0.032\nno yes yes 0.006\nno yes no 0.054\nno no yes 0.054\nno no no 0.486\n5\nP Spam\nP Spam | Free=yes\nP Spam | Free=yes Win=yes\nindep Free Win | Spam\nindep Free Win\n', output: 'P(Spam) = yes:2/5 no:3/5\nP(Spam | Free=yes) = yes:4/5 no:1/5\nP(Spam | Free=yes Win=yes) = yes:32/33 no:1/33\nFree, Win independent given Spam: yes\nFree, Win independent: no\n', note: '垃圾郵件：Free 與 Win 在給定 Spam 時條件獨立，兩個證據一起看讓 Spam 的機率更高' },
        { kind: 'edge', input: '3\nX a b\nY a b\nZ a b\n4\na a a 1/4\na b a 1/4\nb a a 1/4\nb b a 1/4\n4\nP X | Z=b\nindep X Y | Z\nP Z\nP Y | X=b Z=a\n', output: 'P(X | Z=b) = undefined (evidence has probability 0)\nX, Y independent given Z: yes\nP(Z) = a:1 b:0\nP(Y | X=b Z=a) = a:1/2 b:1/2\n', note: '證據 Z=b 的機率是 0：條件機率沒有定義；條件獨立只檢查 P(z) > 0 的 z' },
        { kind: 'edge', input: '4\nA x y\nB x y\nC x y\nD x y\n16\nx x x x 1/8\nx x x y 1/8\nx x y x 1/8\nx x y y 1/8\nx y x x 0\nx y x y 0\nx y y x 0\nx y y y 0\ny x x x 0\ny x x y 0\ny x y x 0\ny x y y 0\ny y x x 1/8\ny y x y 1/8\ny y y x 1/8\ny y y y 1/8\n4\nP A | B=y\nindep A B\nindep C D | A\nP D | A=x B=y\n', output: 'P(A | B=y) = x:0 y:1\nA, B independent: no\nC, D independent given A: yes\nP(D | A=x B=y) = undefined (evidence has probability 0)\n', note: '最多 4 個變數、16 個世界，機率 0 的世界也可以列出；A 一定等於 B，所以不獨立' },
        { kind: 'edge', input: '1\nRoll one two three four\n2\none 0.5\nfour 1/2\n2\nP Roll\nindep Roll Roll\n', output: 'P(Roll) = one:1/2 two:0 three:0 four:1/2\nerror: bad query\n', note: '只有一個變數，沒列出的值機率是 0；indep 兩邊是同一個變數屬於格式錯誤' },
        { kind: 'edge', input: '2\nSure yes no\nCoin H T\n2\nyes H 0.50\nyes T 2/4\n3\nindep Sure Coin\nP Coin | Sure=yes\nP Sure | Coin=T\n', output: 'Sure, Coin independent: yes\nP(Coin | Sure=yes) = H:1/2 T:1/2\nP(Sure | Coin=T) = yes:1 no:0\n', note: '必然發生的變數（P(Sure=yes) = 1）和任何變數都獨立；0.50 與 2/4 都化成 1/2' },
        { kind: 'error', input: '3\nWeather sunny cloudy rainy\nUmbrella yes no\nWet yes no\n12\nsunny yes yes 5/1000\nsunny yes no 45/1000\nsunny no yes 45/1000\nsunny no no 405/1000\ncloudy yes yes 18/1000\ncloudy yes no 72/1000\ncloudy no yes 42/1000\ncloudy no no 168/1000\nrainy yes yes 144/1000\nrainy yes no 36/1000\nrainy no yes 16/1000\nrainy no no 4/1000\n12\nP Rain\nP Weather | Umbrella=maybe\nP Weather Wet\nP Weather |\nP Weather | Weather=sunny\nP Weather | Wet=yes Wet=no\nP Weather=rainy\nQ Weather\nindep Umbrella\nindep Umbrella Wet | Weather=rainy\nindep Umbrella Wet | Rain\nP Weather | Umbrella=yes\n', output: 'error: unknown variable Rain\nerror: unknown value Umbrella=maybe\nerror: bad query\nerror: bad query\nerror: bad query\nerror: bad query\nerror: bad query\nerror: bad query\nerror: bad query\nerror: bad query\nerror: unknown variable Rain\nP(Weather | Umbrella=yes) = sunny:5/32 cloudy:9/32 rainy:9/16\n', note: '未知的變數與值、各種格式錯誤的查詢只影響該行；最後一行仍正常回答' },
        { kind: 'error', input: '2\nA x y\nB x y\n4\nx x 1/4\nx y 1/4\ny x 1/4\ny y 0.15\n1\nP A\n', output: 'invalid input: total probability 9/10\n', note: '機率總和是 9/10，不是 1：不是合法的聯合分布' },
        { kind: 'error', input: '1\nA x y\n2\nx 0.7\ny 0.4\n1\nP A\n', output: 'invalid input: total probability 11/10\n', note: '總和 11/10 大於 1' },
        { kind: 'error', input: '2\nA x y\nB x y\n3\nx x 1/2\nx x 1/4\ny y 1/4\n1\nP A\n', output: 'invalid input\n', note: '同一個世界 (x, x) 出現兩次' },
        { kind: 'error', input: '2\nA x y\nB x y\n2\nx z 1/2\ny y 1/2\n1\nP A\n', output: 'invalid input\n', note: '表中的值 z 不在 B 的值域裡' },
        { kind: 'error', input: '1\nA x y\n2\nx -0.5\ny 1.5\n1\nP A\n', output: 'invalid input\n', note: '負的機率：不是合法的數字格式' },
        { kind: 'error', input: '1\nA x y\n2\nx 1/0\ny 1\n1\nP A\n', output: 'invalid input\n', note: '分母是 0' },
        { kind: 'error', input: '1\nA x y\n2\nx 1/2\ny 1/2\n3\nP A\nP A\n', output: 'invalid input\n', note: '宣告 3 個查詢，只給了 2 個' },
        { kind: 'error', input: '5\nA x y\nB x y\nC x y\nD x y\nE x y\n1\nx x x x x 1\n1\nP A\n', output: 'invalid input\n', note: '變數超過 4 個' },
      ],
      hints: [
        '先寫 `prob(fixed)`：固定 fixed 裡的變數，把其餘變數全部加總掉。P 查詢與 indep 查詢都只靠它。',
        '`P X | e` 就是對 X 的每個值算 prob({**e, X: x})，再除以 prob(e)；prob(e) 是 0 時先回報 undefined，不能除。',
        '機率用 `Fraction(text)` 讀進來：`Fraction("0.125")` 與 `Fraction("1/8")` 都是精確的 1/8，總和可以直接和 1 比較。',
        '條件獨立要對每個 P(z) > 0 的 z 分別檢查；用範例的天氣表確認 Umbrella、Wet 不獨立但給定 Weather 時條件獨立。',
      ],
      solution: { Python: code`import re
import sys
from fractions import Fraction

NUMBER = re.compile(r'\d+(\.\d+)?|\d+/0*[1-9]\d*')  # 0.25 或 1/4，分母不為 0

def parse(lines):
    """回傳 (變數名稱, 值域, 聯合分布, 查詢)；格式不對時回傳要印的那一行。"""
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    def count(i, low, high):
        text = lines[i].strip() if i < len(lines) else ''
        return int(text) if text.isdigit() and low <= int(text) <= high else None
    n = count(0, 1, 4)
    if n is None or len(lines) < 2 + n:
        return 'invalid input'
    names, domains = [], {}
    for line in lines[1:1 + n]:
        name, *values = line.split() or ['']
        if not 2 <= len(values) <= 4 or name in domains or len(set(values)) != len(values) \
                or any('=' in t or t == '|' for t in [name, *values]):
            return 'invalid input'
        names.append(name)
        domains[name] = values
    m = count(1 + n, 1, 256)
    if m is None or len(lines) < 3 + n + m:
        return 'invalid input'
    joint = {}
    for line in lines[2 + n:2 + n + m]:
        *world, p = line.split() or ['']
        world = tuple(world)
        if len(world) != n or not NUMBER.fullmatch(p) or world in joint:
            return 'invalid input'
        if any(v not in domains[x] for x, v in zip(names, world)):
            return 'invalid input'
        joint[world] = Fraction(p)
    q = count(2 + n + m, 0, 50)
    if q is None or len(lines) != 3 + n + m + q:
        return 'invalid input'
    total = sum(joint.values())
    if total != 1:
        return f'invalid input: total probability {total}'
    return names, domains, joint, lines[3 + n + m:]

def prob(names, joint, fixed):
    """固定 fixed 裡的變數，其餘變數全部加總掉（邊際化）。"""
    return sum(p for world, p in joint.items()
               if all(world[names.index(x)] == v for x, v in fixed.items()))

def ask(names, domains, joint, head, evidence):
    if len(head) != 1 or '=' in head[0]:
        return 'error: bad query'
    x = head[0]
    if x not in domains:
        return f'error: unknown variable {x}'
    fixed = {}
    for item in evidence:
        y, eq, v = item.partition('=')
        if not eq or not y or not v or y == x or y in fixed:
            return 'error: bad query'
        if y not in domains:
            return f'error: unknown variable {y}'
        if v not in domains[y]:
            return f'error: unknown value {y}={v}'
        fixed[y] = v
    shown = f'P({x} | {" ".join(evidence)})' if evidence else f'P({x})'
    pe = prob(names, joint, fixed)
    if pe == 0:
        return f'{shown} = undefined (evidence has probability 0)'
    return f'{shown} = ' + ' '.join(f'{v}:{prob(names, joint, {**fixed, x: v}) / pe}' for v in domains[x])

def indep(names, domains, joint, head, evidence):
    used = head + evidence
    if len(head) != 2 or len(evidence) > 1 or any('=' in v for v in used) or len(set(used)) != len(used):
        return 'error: bad query'
    for v in used:
        if v not in domains:
            return f'error: unknown variable {v}'
    (a, b), z = head, (evidence[0] if evidence else None)
    ok = True
    for zv in domains[z] if z else [None]:
        given = {z: zv} if z else {}
        pz = prob(names, joint, given)
        if pz == 0:
            continue  # 條件本身不可能發生，不必檢查
        for av in domains[a]:
            for bv in domains[b]:
                pab = prob(names, joint, {**given, a: av, b: bv}) / pz
                pa = prob(names, joint, {**given, a: av}) / pz
                pb = prob(names, joint, {**given, b: bv}) / pz
                ok = ok and pab == pa * pb
    return f'{a}, {b} independent{" given " + z if z else ""}: {"yes" if ok else "no"}'

def answer(names, domains, joint, line):
    parts = line.split()
    if not parts or parts[0] not in ('P', 'indep'):
        return 'error: bad query'
    head, evidence = parts[1:], []
    if '|' in head:
        bar = head.index('|')
        head, evidence = head[:bar], head[bar + 1:]
        if not evidence:
            return 'error: bad query'
    if parts[0] == 'P':
        return ask(names, domains, joint, head, evidence)
    return indep(names, domains, joint, head, evidence)

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if isinstance(parsed, str):
    print(parsed)
else:
    names, domains, joint, queries = parsed
    for line in queries:
        print(answer(names, domains, joint, line))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'dp-table', title: '從完整聯合分布做邊際化、列舉與正規化', language: 'Python',
    code: TRACE_CODE,
    steps: enumerationSteps(),
  },
  quiz: [
    {
      id: 'q-laziness', prompt: '想把「有人帶傘 ⇒ 下雨」修成正確的規則，就得寫成「帶傘、而且不是為了遮陽、而且不是因為預報、而且不是習慣隨身帶傘…才下雨」，例外永遠列不完。這屬於邏輯難以處理不確定性的哪一種原因？',
      options: ['世界本身是隨機的，所以邏輯永遠不適用', '理論上的無知：沒有人知道一個人決定帶傘的完整原因', '懶惰：完整列出所有前提與例外太費工，規則也會長到無法使用', '實務上的無知：機器人這一次看不到天空'],
      answer: 2, explanation: '題目的困難在於例外與前提太多、列不完，這正是「懶惰」（laziness）。理論上的無知指這個領域沒有完整的理論，和規則寫不完是不同的理由；實務上的無知指就算有規則，這一次也缺少觀察，題目說的是規則本身；「世界本身是隨機的」不是三種原因之一，而且機率描述的是代理人的知識狀態，不一定是世界的隨機性。',
    },
    {
      id: 'q-marginal', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
joint = {('rain', 'late'): F(3, 20), ('rain', 'ontime'): F(1, 20),
         ('dry', 'late'): F(1, 10), ('dry', 'ontime'): F(7, 10)}
print(sum(p for (w, t), p in joint.items() if t == 'late'))` },
      options: ['1/4', '3/20', '3/4', '5/20'],
      answer: 0, explanation: '程式把 t == \'late\' 的兩個世界加起來：3/20 + 1/10 = 3/20 + 2/20 = 5/20，Fraction 會自動約分，印出 1/4，這就是把 w 邊際化後的 P(late)。3/20 只算了 rain 的那一格；3/4 是 P(late | rain) 或 P(ontime) 之類的其他量；5/20 是沒有約分的寫法，Fraction 不會這樣印。',
    },
    {
      id: 'q-conditional', prompt: '沿用上一題的 joint（P(rain, late) = 3/20、P(rain, ontime) = 1/20、P(dry, late) = 1/10、P(dry, ontime) = 7/10），P(rain | late) 是多少？',
      options: ['3/20', '3/4', '1/5', '3/5'],
      answer: 3, explanation: 'P(rain | late) = P(rain, late) / P(late) = (3/20) / (1/4) = 3/5。3/20 是聯合機率 P(rain, late)，忘了除以 P(late)；3/4 是反方向的 P(late | rain) = (3/20) / (1/5)，把條件的方向弄反了；1/5 是先驗的 P(rain)，沒有用到「遲到」這個證據。',
    },
    {
      id: 'q-chain', prompt: '對任意三個隨機變數 A、B、C，下列哪一個式子一定等於 P(A, B, C)？',
      options: ['P(A) P(B) P(C)', 'P(A) P(B | A) P(C | A, B)', 'P(A | B) P(B | C) P(C | A)', 'P(C | A, B) P(A, B | C)'],
      answer: 1, explanation: '連鎖規則：P(A, B, C) = P(A) P(B | A) P(C | A, B)，對任何分布都成立。P(A) P(B) P(C) 只有在三者彼此獨立時才成立；P(A | B) P(B | C) P(C | A) 的條件繞成一圈，不是任何規則的結果；P(C | A, B) P(A, B | C) 把 C 同時當成結果與條件，乘法規則應該是 P(C | A, B) P(A, B)。',
    },
    {
      id: 'q-normalize', prompt: '查詢 P(Weather | umbrella = yes) 時，對 sunny、cloudy、rainy 分別把符合證據的世界加總，得到未正規化的值 1/20、9/100、9/50。P(rainy | umbrella = yes) 是多少？',
      options: ['9/50，加總的結果就是答案', '1/3，三種天氣都符合證據，機會均等', '9/16', '1/2'],
      answer: 2, explanation: '三個值的總和 1/20 + 9/100 + 9/50 = 8/25 就是 P(umbrella = yes)，α = 25/8，所以 P(rainy | umbrella) = 9/50 × 25/8 = 9/16。9/50 是聯合機率 P(rainy, umbrella)，還沒正規化；1/3 忽略了各個世界的機率不同；1/2 沒有根據，正規化後的三個值是 5/32、9/32、9/16。',
    },
    {
      id: 'q-table-size', prompt: '一個布林的原因變數，加上 20 個布林的結果變數，而且給定原因時這 20 個結果彼此條件獨立。利用條件獨立分解後，總共需要幾個數字就能決定整個聯合分布？',
      options: ['41', '21', '40', '2,097,151'],
      answer: 0, explanation: 'P(原因) 需要 1 個數字，每個結果需要 P(結果 | 原因) 與 P(結果 | ¬原因) 2 個數字，共 1 + 2 × 20 = 41。21 只給每個結果 1 個數字，忽略了它在兩種原因下的機率不同；40 漏掉了原因本身的先驗；2,097,151 = 2²¹ − 1 是沒有分解時完整聯合分布的自由數字個數。',
    },
    {
      id: 'q-xor', prompt: 'A、B 是兩枚互相獨立的公平硬幣（0 或 1），C = A XOR B（兩枚不同時為 1）。下列敘述何者正確？',
      options: ['給定 C 之後，A 與 B 仍然獨立', 'A 與 C 不獨立，因為 C 是由 A 算出來的', 'A 與 B 不獨立，因為它們一起決定了 C', '給定 C 之後，A 與 B 不再獨立：知道 C 與 A 就能確定 B'],
      answer: 3, explanation: '給定 C = 0 時 B 必須等於 A，給定 C = 1 時 B 必須和 A 不同，所以 P(A, B | C) ≠ P(A | C) P(B | C)，條件獨立不成立。「給定 C 仍獨立」以為獨立會一直保持，但條件可以讓獨立的變數變得相關；A 與 C 其實獨立，因為不論 A 是多少，C 都是 0 或 1 各半；A 與 B 本來就是兩枚獨立的硬幣，共同決定 C 不會改變這件事。',
    },
    {
      id: 'q-sampling', prompt: '用模擬估計機率，誤差的典型大小和 1/√N 成正比（N 是樣本數）。要讓典型誤差縮小為原來的 1/10，樣本數大約要變成幾倍？',
      options: ['10 倍', '100 倍', '√10 倍', '不必增加，固定種子就能讓誤差消失'],
      answer: 1, explanation: '誤差和 1/√N 成正比，要縮小 10 倍需要 √N 變成 10 倍，也就是 N 變成 100 倍，這就是範例中 N 從 100 到 10000 時典型誤差從 0.0466 降到 0.0047 的原因。10 倍只會讓誤差縮小約 3.16 倍；√10 倍更少；固定種子只讓結果可以重現，不會讓估計變得更準。',
    },
  ],
};
