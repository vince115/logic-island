import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF14 貝氏定理與機率推論 (python-code: Python only, standard library). Every example and the reference solution run in
 * the curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 * The exercise's printed posteriors were also recomputed exactly with fractions.Fraction to make sure none lies near a
 * rounding boundary of the 4-decimal format.
 *
 * The visualization runs TRACE_CODE (also the example e-sequential): three coins (fair, head-biased, tail-biased),
 * a uniform prior, and four flips H, H, T, H, each one a Bayesian update. updateSteps() repeats the program's loop with
 * exact fractions in the same order, so every prior, likelihood, unnormalized score, total and posterior shown comes
 * from actually running it; the last step's output is checked against TRACE_OUTPUT, which the lesson test compares with
 * Python's real output.
 */
type Frac = [number, number];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d: number): Frac => { const g = gcd(n, d); return [n / g, d / g]; };
const mul = (a: Frac, b: Frac) => frac(a[0] * b[0], a[1] * b[1]);
const add = (a: Frac, b: Frac) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const div = (a: Frac, b: Frac) => frac(a[0] * b[1], a[1] * b[0]);
const show = (a: Frac) => (a[1] === 1 ? String(a[0]) : `${a[0]}/${a[1]}`);
const decimal = (a: Frac) => (a[0] / a[1]).toFixed(3);

const HYPOTHESES = ['fair', 'head', 'tail'] as const;
type Hypothesis = (typeof HYPOTHESES)[number];
const P_HEADS: Record<Hypothesis, Frac> = { fair: [1, 2], head: [3, 4], tail: [1, 4] };
const FLIPS = 'HHTH';
const TRACE_OUTPUT = 'H fair=1/3 head=1/2 tail=1/6\nH fair=2/7 head=9/14 tail=1/14\nT fair=2/5 head=9/20 tail=3/20\nH fair=8/23 head=27/46 tail=3/46\n最可能: head';

const TRACE_CODE = code`from fractions import Fraction as F
p_heads = {'fair': F(1, 2), 'head': F(3, 4), 'tail': F(1, 4)}
belief = {'fair': F(1, 3), 'head': F(1, 3), 'tail': F(1, 3)}  # 先驗
for flip in 'HHTH':
    score = {}
    for h in sorted(belief):
        like = p_heads[h] if flip == 'H' else 1 - p_heads[h]  # 概似
        score[h] = belief[h] * like  # 先驗 × 概似
    total = sum(score.values())  # P(這次的結果 | 之前的證據)
    belief = {h: score[h] / total for h in sorted(score)}  # 正規化
    print(flip, ' '.join(f'{h}={belief[h]}' for h in sorted(belief)))
print('最可能:', max(sorted(belief), key=belief.get))`;

function updateSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const dict = (m: Partial<Record<Hypothesis, Frac>>) => HYPOTHESES.filter(h => m[h]).map(h => `${h}=${show(m[h]!)}`).join(' ') || '{}';
  const pHeads = dict(P_HEADS);
  let belief: Record<Hypothesis, Frac> = { fair: [1, 3], head: [1, 3], tail: [1, 3] };
  const lines: string[] = [];
  steps.push({ line: 2, note: '盒子裡有三枚硬幣：公正的 fair（正面機率 1/2）、偏正面的 head（3/4）與偏反面的 tail（1/4）。隨手拿出一枚，不知道是哪一枚。p_heads 記下每個假設 h 之下擲出正面的機率，這是「如果是這枚硬幣，會看到什麼」的因果方向知識，之後用來算概似 P(結果 | h)。',
    vars: { p_heads: pHeads } });
  steps.push({ line: 3, note: '還沒擲之前，三枚被拿到的機會相同，所以先驗（prior）都是 1/3。belief 永遠是一個機率分布：三個值加起來等於 1。用 Fraction 計算，每一步都是精確的分數，不會有浮點誤差。',
    vars: { p_heads: pHeads, belief: dict(belief) } });
  for (const [k, flip] of [...FLIPS].entries()) {
    const score: Partial<Record<Hypothesis, Frac>> = {};
    steps.push({ line: 5, note: `第 ${k + 1} 次擲出 ${flip === 'H' ? '正面 H' : '反面 T'}。${k === 0 ? '這一輪的先驗就是一開始的 1/3。' : '上一輪算出的後驗，現在當作這一輪的先驗：這就是逐次更新（sequential updating）。'}score 先清空，準備存每個假設的「先驗 × 概似」。`,
      vars: { p_heads: pHeads, flip, score: '{}', belief: dict(belief) } });
    for (const h of HYPOTHESES) {
      const like: Frac = flip === 'H' ? P_HEADS[h] : frac(P_HEADS[h][1] - P_HEADS[h][0], P_HEADS[h][1]);
      score[h] = mul(belief[h], like);
      steps.push({ line: 8, note: `假設 ${h}：概似 P(${flip} | ${h}) = ${show(like)}${flip === 'T' ? `（1 − ${show(P_HEADS[h])}）` : ''}，乘上先驗 ${show(belief[h])}，得到 ${show(score[h]!)}。這是 P(${h}, 這次的結果 | 之前的證據)，還不是後驗：三個 score 加起來不等於 1。`,
        vars: { p_heads: pHeads, flip, h, like: show(like), score: dict(score), belief: dict(belief) } });
    }
    const total = HYPOTHESES.reduce<Frac>((s, h) => add(s, score[h]!), [0, 1]);
    steps.push({ line: 9, note: `total = ${HYPOTHESES.map(h => show(score[h]!)).join(' + ')} = ${show(total)}，就是 P(這次擲出 ${flip} | 之前的證據)。它不必另外去算，把每個假設的 score 加起來就得到了（全機率公式）。`,
      vars: { p_heads: pHeads, flip, score: dict(score), total: show(total), belief: dict(belief) } });
    const before = belief;
    belief = { fair: div(score.fair!, total), head: div(score.head!, total), tail: div(score.tail!, total) };
    const moved = HYPOTHESES.map(h => `${h} ${decimal(before[h])} → ${decimal(belief[h])}`).join('、');
    steps.push({ line: 10, note: `每個 score 除以 total，就是正規化（normalization）：得到後驗 P(h | 到目前的所有結果)，三個值加起來又是 1。以小數看：${moved}。${flip === 'H' ? '擲出正面，偏正面的 head 上升、偏反面的 tail 下降。' : '擲出反面，head 掉下來、tail 回升，但一次反面不足以推翻前面兩次正面。'}`,
      vars: { p_heads: pHeads, flip, score: dict(score), total: show(total), belief: dict(belief) } });
    lines.push(`${flip} ${HYPOTHESES.map(h => `${h}=${show(belief[h])}`).join(' ')}`);
    steps.push({ line: 11, note: `印出這一輪的後驗。${k === FLIPS.length - 1 ? '四次結果 H、H、T、H 都用完了。' : '下一輪開始時，它就是新的先驗。'}`,
      vars: { p_heads: pHeads, flip, total: show(total), belief: dict(belief) }, output: lines.join('\n') });
  }
  const best = HYPOTHESES.reduce((b, h) => (belief[h][0] * belief[b][1] > belief[b][0] * belief[h][1] ? h : b), HYPOTHESES[0]);
  const output = [...lines, `最可能: ${best}`].join('\n');
  if (output !== TRACE_OUTPUT) throw new Error(`AIF14: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  steps.push({ line: 12, note: `最後的後驗 fair = ${show(belief.fair)}（約 ${decimal(belief.fair)}）、head = ${show(belief.head)}（約 ${decimal(belief.head)}）、tail = ${show(belief.tail)}（約 ${decimal(belief.tail)}）。三正一反，最可能是偏正面的 head，但 fair 仍有三成多的機率，證據還不算多。若把四次結果換個順序再算，最後的後驗完全相同：在給定硬幣時各次擲出的結果條件獨立，相乘的順序不影響乘積。`,
    vars: { p_heads: pHeads, belief: dict(belief) }, output });
  return steps;
}

/** The long-query test: 500 and 501 words, whose plain product of probabilities underflows to 0.0. */
const LONG_QUERY_INPUT = ['2', 'x w0 w1 w2 w3 w4 w5 w6 w7 w8 w9', 'y w5 w6 w7 w8 w9 w10 w11 w12 w13 w14', '2', Array(500).fill('w3').join(' '),
  [...Array(250).fill('w3'), ...Array(251).fill('w12')].join(' ')].join('\n') + '\n';

export const AIF14: LessonContent = {
  lessonId: 'AIF14',
  motivation: '一項篩檢的準確率號稱 90%，你的結果是陽性，真正患病的機率是多少？大多數人直覺回答「九成」，正確答案在常見的情境下卻可能不到一成。差距來自一件常被忽略的事：這種病本來就很少見。智慧代理人每天都面對同樣的問題：感測器的讀數、使用者的點擊、信件裡的詞都只是證據，代理人要從證據推回看不見的原因，而且要隨著新證據不斷修正自己的判斷。貝氏定理（Bayes\' rule）就是這種推論的規則。這一課從機率的乘法規則推導它，分清楚先驗、概似、證據與後驗，用精確的分數算出醫療檢測的後驗並說明基本比率謬誤，學會用正規化與枚舉從聯合分布回答查詢，再看單純貝氏假設如何讓多個證據的推論變得簡單，最後用 Python 寫出一個加上 Laplace 平滑與對數機率的垃圾信分類器。',
  sections: [
    {
      id: 'derive', title: '從乘法規則推導貝氏定理',
      blocks: [
        { type: 'p', text: '條件機率的定義 `P(A | B) = P(A ∧ B) / P(B)` 移項，就是乘法規則（product rule）：`P(A ∧ B) = P(A | B) P(B)`。同一個聯合機率也可以從另一邊拆：`P(A ∧ B) = P(B | A) P(A)`。兩式的右邊相等，把 A 換成假設 H（hypothesis）、B 換成證據 E（evidence），兩邊除以 P(E)，就得到貝氏定理：`P(H | E) = P(E | H) P(H) / P(E)`。它只有一行，卻讓我們能把「已知的方向」翻轉成「想知道的方向」。' },
        { type: 'table', head: ['名稱', '符號', '意義', '醫療檢測的例子'], rows: [
          ['先驗（prior）', 'P(H)', '看到證據之前對假設的信念', '盛行率：隨機一個人患病的機率'],
          ['概似（likelihood）', 'P(E | H)', '假設成立時，看到這個證據的機率', '敏感度：患者檢測呈陽性的機率'],
          ['證據（evidence）', 'P(E)', '不論哪個假設，看到這個證據的總機率', '任何人檢測呈陽性的機率'],
          ['後驗（posterior）', 'P(H | E)', '看到證據之後對假設的信念', '檢測陽性的人真正患病的機率'],
        ] },
        { type: 'p', text: '證據的機率通常不是直接知道的，而是由全機率公式把所有互斥的假設加起來：`P(E) = Σ P(E | h) P(h)`。只有兩個假設（病、沒病）時，就是 `P(E) = P(E | 病) P(病) + P(E | 沒病) P(沒病)`。所以完整的計算只需要先驗與每個假設下的概似。後驗與「先驗 × 概似」成正比，常寫成 `後驗 ∝ 概似 × 先驗`。' },
        { type: 'p', text: '這條規則以 Thomas Bayes 命名。他的論文在他過世後，由朋友 Richard Price 整理，1763 年在英國皇家學會發表；法國數學家 Laplace 在 1774 年獨立提出同樣的想法，並把它發展成一般的推論方法。今天的垃圾信過濾、醫學診斷、機器人定位與許多機器學習模型，背後都是這一行式子。' },
        { type: 'callout', tone: 'note', title: '概似不是機率分布', text: '把 P(E | H) 看成 H 的函數時，它叫概似。對固定的證據 E，P(E | 病) 與 P(E | 沒病) 加起來不必等於 1（例如 0.9 與 0.09）；先驗與後驗才是 H 上的機率分布，所有假設加起來等於 1。' },
      ],
    },
    {
      id: 'direction', title: '因果方向與診斷方向',
      blocks: [
        { type: 'p', text: '概似 P(結果 | 原因) 是因果方向（causal direction）：「如果患病，檢測多半陽性」「如果是偏正面的硬幣，四分之三會擲出正面」。後驗 P(原因 | 結果) 是診斷方向（diagnostic direction）：「檢測陽性，那麼他患病嗎？」。我們想回答的通常是診斷方向，手上可靠的知識卻多半是因果方向，貝氏定理就是兩者之間的橋。' },
        { type: 'table', head: ['', '因果方向 P(結果 | 原因)', '診斷方向 P(原因 | 結果)'], rows: [
          ['例子', 'P(陽性 | 患病)：檢測的敏感度', 'P(患病 | 陽性)：陽性的人真正患病的比例'],
          ['從哪裡來', '對已知患者做實驗量測，是檢測本身的性質', '要結合先驗：取決於受測族群的盛行率'],
          ['換一個族群', '通常不變（同一套試劑）', '會改變：疫情爆發時同樣的陽性更可信'],
          ['適合儲存在知識庫', '是，穩定、可重複使用', '否，每個族群都要重算'],
        ] },
        { type: 'p', text: '所以有經驗的系統設計者會儲存因果方向的知識，需要時再用貝氏定理算出診斷方向。若直接記住「陽性的人有 9% 患病」，疫情一來盛行率上升，這個數字就錯了；記住敏感度 90% 與偽陽性率 9%，只要更新先驗，後驗就自動正確。下一節的例子會把盛行率從 0.1% 調到 50%，看同一個檢測的後驗怎麼變化。' },
        { type: 'callout', tone: 'tip', title: '先問「方向對不對」', text: '讀到一個條件機率時，先說出它是「給定什麼、問什麼」。「90% 的患者檢測陽性」是 P(陽性 | 病)，「陽性者有 90% 患病」是 P(病 | 陽性)。兩句話只差語序，數值卻可能差十倍。' },
      ],
    },
    {
      id: 'base-rate', title: '醫療檢測：精確計算與基本比率謬誤',
      blocks: [
        { type: 'p', text: '設某種病的盛行率是 1%，檢測的敏感度（患者呈陽性的機率）是 90%，偽陽性率（沒病的人卻呈陽性的機率）是 9%。代入貝氏定理：`P(病 | 陽性) = 0.9 × 0.01 / (0.9 × 0.01 + 0.09 × 0.99) = 0.009 / 0.0981 = 10/109`，大約 9.17%。陽性的人裡，十個只有不到一個真的患病。範例用 `fractions.Fraction` 算出精確的分數，並換成「10000 人裡有幾個」的自然頻率。' },
        { type: 'example', id: 'e-medical' },
        { type: 'table', head: ['10000 人', '檢測陽性', '檢測陰性', '合計'], rows: [
          ['患病（1%）', '90（真陽性）', '10（偽陰性）', '100'],
          ['沒病（99%）', '891（偽陽性）', '9009（真陰性）', '9900'],
          ['合計', '981', '9019', '10000'],
        ] },
        { type: 'p', text: '表格讓答案一目了然：981 個陽性裡只有 90 個患病，90/981 = 10/109。偽陽性率雖然只有 9%，乘上的是 9900 個健康的人；敏感度雖然高達 90%，乘上的只有 100 個患者。盛行率越低，偽陽性越佔多數。範例最後一行把盛行率改成 0.1%、1%、10%、50%，同一個檢測的後驗從 0.99% 一路升到 90.91%。' },
        { type: 'p', text: '同一個人再做一次檢測又是陽性呢？若兩次檢測在給定病況時彼此條件獨立，第一次的後驗 10/109 就是第二次的先驗，再套一次貝氏定理得到 100/199，約 50.25%。這就是為什麼篩檢陽性之後要做確認檢查：一次陽性把機率從 1% 提高到約 9%，兩次才到一半左右。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：基本比率謬誤', text: '基本比率謬誤（base-rate fallacy）是只看檢測的準確率、忽略基本比率（盛行率、先驗）的錯誤：聽到「敏感度 90%」就認為陽性的人有 90% 患病。這等於把 P(陽性 | 病) 當成 P(病 | 陽性)，在法庭上叫檢察官謬誤（prosecutor\'s fallacy）：「無辜的人符合這項鑑識證據的機率只有萬分之一」不代表「被告無辜的機率只有萬分之一」，還要看全國有多少人也會符合。兩個條件機率只有在先驗與證據的機率相同時才會相等。' },
      ],
    },
    {
      id: 'normalize', title: '正規化與枚舉：從聯合分布回答查詢',
      blocks: [
        { type: 'p', text: '貝氏定理的分母 P(E) 對每個假設都一樣，所以不必先算它。做法是正規化（normalization）：對每個假設 h 算出未正規化的值 `P(E | h) P(h)`，加總後再讓每個值除以總和，結果自然加起來等於 1。課本常寫成 `P(H | E) = α P(E | H) P(H)`，其中正規化常數 `α = 1 / P(E)`。被加起來的總和正好就是 P(E)，免費得到。' },
        { type: 'p', text: '手上若有完整的聯合分布（full joint distribution），任何查詢都能用枚舉推論（inference by enumeration）回答。把變數分成三組：查詢變數 X、已觀察到值的證據變數 e、其他沒提到的隱藏變數 y。`P(X | e) = α P(X, e) = α Σ_y P(X, e, y)`：挑出和證據一致的每一個可能世界（每一列），把隱藏變數加總消去（邊際化），再正規化。' },
        { type: 'example', id: 'e-enumerate' },
        { type: 'p', text: '範例的聯合分布有 Flu（流感）、Fever（發燒）、Cough（咳嗽）三個布林變數，共 8 個可能世界。沒有證據時，P(flu) 就是先驗 1/10；知道發燒後升到 10/19；只知道咳嗽則是 1/3；發燒又咳嗽升到 10/13。每一列的 P(e) 就是被加總的那些世界的機率和，例如發燒的四個世界加起來是 19/125。程式從未單獨計算 P(e)，它是正規化時順便得到的。' },
        { type: 'table', head: ['證據 e', '加總的世界數', 'P(e)', 'P(flu | e)'], rows: [
          ['（無）', '8', '1', '1/10 = 0.100'],
          ['fever', '4', '19/125', '10/19 ≈ 0.526'],
          ['cough', '4', '27/125', '1/3 ≈ 0.333'],
          ['fever 且 cough', '2', '39/500', '10/13 ≈ 0.769'],
        ] },
        { type: 'callout', tone: 'note', title: '枚舉的代價', text: 'n 個布林變數的聯合分布有 2ⁿ 列，需要 2ⁿ − 1 個獨立的數字，枚舉一次查詢也要掃過指數多列。3 個變數只有 8 列，30 個變數就超過十億列：既存不下，也無法從資料估計。下一節的條件獨立，以及下一課的貝氏網路，都是為了避開這個指數爆炸。' },
      ],
    },
    {
      id: 'independence', title: '多個證據：條件獨立與逐次更新',
      blocks: [
        { type: 'p', text: '有兩個證據 e1、e2 時，貝氏定理需要 P(e1, e2 | H)。若給定 H 之後，e1 與 e2 彼此不提供額外的資訊，也就是條件獨立（conditional independence），就能拆開：`P(e1, e2 | H) = P(e1 | H) P(e2 | H)`。於是 `P(H | e1, e2) = α P(H) P(e1 | H) P(e2 | H)`。換個角度看，先用 e1 更新得到後驗，再把它當成先驗用 e2 更新，結果完全相同：這就是逐次貝氏更新（sequential Bayesian updating）。' },
        { type: 'example', id: 'e-sequential' },
        { type: 'p', text: '範例就是下方視覺化執行的程式：三枚硬幣的先驗各 1/3，每擲一次，就把每個假設的信念乘上概似、加總、正規化。三正一反之後，head 的後驗是 27/46，fair 是 8/23，tail 只剩 3/46。各次擲出的結果在給定硬幣時條件獨立，所以四個概似的乘積與順序無關，先擲 T 再擲 H 會得到同樣的結果。' },
        { type: 'p', text: '單純貝氏假設（naive Bayes assumption）把這個想法推到極致：給定類別 C 時，所有特徵彼此條件獨立，所以 `P(C | e1, …, en) = α P(C) Π P(ei | C)`。它讓需要的參數從指數個降到線性個。' },
        { type: 'table', head: ['模型（n 個布林特徵、布林類別）', '需要的獨立參數', 'n = 10', 'n = 30'], rows: [
          ['完整聯合分布', '2ⁿ⁺¹ − 1', '2047', '2147483647'],
          ['單純貝氏', '1 + 2n（P(C)，以及每個特徵在兩個類別下的機率）', '21', '61'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：條件獨立不等於獨立', text: '兩次檢測在給定病況時條件獨立，並不表示兩次結果彼此獨立。不知道一個人有沒有病時，第一次陽性會讓「他患病」更可能，第二次也就更可能陽性，兩個結果是相關的；一旦知道病況，第一次的結果才不再透露第二次的資訊。反過來也成立：兩個原本獨立的原因，在觀察到共同的結果之後可能變成相關。使用單純貝氏前要先想清楚是「給定什麼」而獨立。' },
      ],
    },
    {
      id: 'naive-bayes', title: '單純貝氏文字分類器：Laplace 平滑與對數機率',
      blocks: [
        { type: 'p', text: '把一封信看成一袋詞（bag of words）：不管順序，只看每個詞出現幾次。多項式單純貝氏（multinomial naive Bayes）的分數是 `P(c) × Π P(w | c)`，每個詞出現幾次就乘幾次。先驗 P(c) 是類別 c 的文件佔所有訓練文件的比例；P(w | c) 是 w 在類別 c 所有詞中所佔的比例。訓練只是數數，分類只是查表相乘，所以非常快。2002 年 Paul Graham 的文章〈A Plan for Spam〉讓這類統計式垃圾信過濾廣為流行。' },
        { type: 'example', id: 'e-naive-bayes' },
        { type: 'p', text: '範例有兩個實作上的關鍵。第一是 Laplace 平滑（Laplace smoothing，加一平滑）：`P(w | c) = (count(w, c) + 1) / (類別 c 的總詞數 + V)`，V 是詞彙表的大小。不平滑時，「開會」從沒出現在垃圾信裡，P(開會 | spam) = 0，只要信裡有「開會」，不管其他詞多像垃圾信，spam 的分數都是 0。加一之後每個詞都至少有一點機率，分母加 V 讓所有詞的機率加起來仍是 1。第二是對數機率：把乘積換成 `log P(c) + Σ log P(w | c)`。' },
        { type: 'example', id: 'e-smoothing' },
        { type: 'p', text: '浮點數能表示的最小正數大約是 10⁻³²⁴。一封 400 個詞的信，每個詞的機率約 0.01，乘積是 10⁻⁸⁰⁰，算出來只會是 0.0，兩個類別都是 0 就無從比較。log 是遞增函數，比較對數和等於比較乘積，而對數和只是 −1842 這種普通大小的數。需要真正的機率時，先把每個對數分數減掉最大的那一個再取 exp（log-sum-exp 技巧），就不會下溢；範例的最後一欄就是這樣正規化出來的後驗。' },
        { type: 'table', head: ['步驟', '做法', '為什麼'], rows: [
          ['訓練', '數每類的文件數、每類每個詞的次數、詞彙表', '最大概似估計就是相對頻率'],
          ['平滑', '(次數 + 1) / (總詞數 + V)', '沒看過的組合不會讓整個乘積變成 0'],
          ['沒看過的詞', '不在詞彙表的詞直接略過', '對每個類別都一樣，不影響比較'],
          ['計分', 'log P(c) + Σ log P(w | c)', '避免下溢，相乘變相加'],
          ['輸出機率', '減掉最大分數再 exp、正規化', '得到加起來為 1 的後驗'],
        ] },
        { type: 'callout', tone: 'tip', title: '天真，但好用', text: '「免費」與「中獎」常一起出現，顯然不是條件獨立的，所以單純貝氏算出的機率常常過度自信（太接近 0 或 1）。但分類只需要排名正確，條件獨立的錯誤往往同時影響每個類別，最大的那一類多半仍然正確。它訓練快、需要的資料少，是文字分類很好的第一個基準模型（baseline）。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-medical', title: '醫療檢測的後驗：精確分數、自然頻率與盛行率的影響',
      description: '用 Fraction 計算盛行率 1%、敏感度 90%、偽陽性率 9% 時陽性的後驗，換算成 10000 人的自然頻率，再驗一次陽性，最後比較不同盛行率。',
      code: { Python: code`from fractions import Fraction as F

def posterior(prior, sens, fpr):
    """P(病 | 陽性) = P(陽性 | 病) P(病) / P(陽性)"""
    sick_pos = sens * prior              # 真陽性：P(陽性, 病)
    well_pos = fpr * (1 - prior)         # 偽陽性：P(陽性, 沒病)
    return sick_pos / (sick_pos + well_pos)

sens, fpr = F(9, 10), F(9, 100)          # 敏感度 90%，偽陽性率 9%
p = posterior(F(1, 100), sens, fpr)
print('盛行率 1%，一次陽性:', p, f'= {float(p):.4f}')

# 自然頻率：10000 人裡有幾個真陽性、幾個偽陽性
sick = 10000 * F(1, 100)
print('真陽性', sick * sens, '人，偽陽性', (10000 - sick) * fpr, '人')

# 再驗一次也陽性：上一次的後驗成為新的先驗
p2 = posterior(p, sens, fpr)
print('兩次陽性:', p2, f'= {float(p2):.4f}')

for prior in [F(1, 1000), F(1, 100), F(1, 10), F(1, 2)]:
    q = posterior(prior, sens, fpr)
    print(f'盛行率 {float(prior):6.1%} -> P(病|陽性) = {float(q):.4f}')` },
      output: '盛行率 1%，一次陽性: 10/109 = 0.0917\n真陽性 90 人，偽陽性 891 人\n兩次陽性: 100/199 = 0.5025\n盛行率   0.1% -> P(病|陽性) = 0.0099\n盛行率   1.0% -> P(病|陽性) = 0.0917\n盛行率  10.0% -> P(病|陽性) = 0.5263\n盛行率  50.0% -> P(病|陽性) = 0.9091',
    },
    {
      id: 'e-enumerate', title: '枚舉推論：從聯合分布加總、正規化',
      description: '三個布林變數的完整聯合分布存成 dict；query 挑出符合證據的世界，依查詢變數的值加總，再除以總和 P(e)。',
      code: { Python: code`from fractions import Fraction as F
from itertools import product

# 完整聯合分布 P(Flu, Fever, Cough)，以千分之一為單位
names = ['flu', 'fever', 'cough']
counts = [60, 20, 12, 8, 18, 54, 126, 702]
joint = {world: F(c, 1000)
         for world, c in zip(product([True, False], repeat=3), counts)}

def query(var, evidence):
    """枚舉：符合證據的世界依 var 的值加總（其他變數被加總消去），再正規化。"""
    i = names.index(var)
    unnorm = {True: F(0), False: F(0)}
    for world, p in joint.items():
        if all(world[names.index(v)] == val for v, val in evidence.items()):
            unnorm[world[i]] += p
    p_e = sum(unnorm.values())            # 正規化常數 α = 1 / P(e)
    return {v: p / p_e for v, p in unnorm.items()}, p_e

print('全部機率加總 =', sum(joint.values()))
for ev in [{}, {'fever': True}, {'cough': True}, {'fever': True, 'cough': True}]:
    dist, p_e = query('flu', ev)
    shown = ', '.join(f'{k}={v}' for k, v in ev.items()) or 'none'
    print(f'{shown:22} P(e)={str(p_e):8} P(flu|e)={str(dist[True]):6}'
          f' = {float(dist[True]):.3f}')` },
      output: '全部機率加總 = 1\nnone                   P(e)=1        P(flu|e)=1/10   = 0.100\nfever=True             P(e)=19/125   P(flu|e)=10/19  = 0.526\ncough=True             P(e)=27/125   P(flu|e)=1/3    = 0.333\nfever=True, cough=True P(e)=39/500   P(flu|e)=10/13  = 0.769',
    },
    {
      id: 'e-sequential', title: '逐次貝氏更新：三枚硬幣，四次擲出的結果',
      description: '先驗均等；每擲一次，先驗乘上概似得到 score，加總得到 total，除以 total 得到後驗，再成為下一次的先驗。下方的視覺化逐步執行這段程式。',
      code: { Python: TRACE_CODE },
      output: TRACE_OUTPUT,
    },
    {
      id: 'e-naive-bayes', title: '單純貝氏垃圾信分類器：Laplace 平滑與對數分數',
      description: '六封訓練信件，數出每類的文件數與詞頻；分數是 log 先驗加上每個詞的 log 概似，沒看過的詞略過；最後用 log-sum-exp 換回後驗。',
      code: { Python: code`import math
from collections import Counter

train = [('spam', '免費 中獎 點擊 領取'), ('spam', '免費 優惠 點擊'),
         ('spam', '中獎 通知 領取 獎金'), ('ham', '明天 開會 通知'),
         ('ham', '作業 明天 繳交'), ('ham', '開會 資料 附件')]
docs = Counter(label for label, _ in train)            # 每類幾封信
words = {c: Counter() for c in sorted(docs)}           # 每類的詞頻
for label, text in train:
    words[label].update(text.split())
vocab = set().union(*words.values())               # 詞彙表
V = len(vocab)

def log_score(c, text):
    """log P(c) + Σ log P(w|c)，P(w|c) 用 Laplace 平滑：(次數 + 1) / (總詞數 + V)"""
    total = sum(words[c].values())
    s = math.log(docs[c] / len(train))
    for w in text.split():
        if w in vocab:                                 # 沒看過的詞直接略過
            s += math.log((words[c][w] + 1) / (total + V))
    return s

print('詞彙量', V, '各類詞數', {c: sum(words[c].values()) for c in sorted(words)})
for text in ['免費 通知 開會', '中獎 獎金 附件', '明天 開會', '午餐 免費']:
    scores = {c: log_score(c, text) for c in sorted(docs)}
    best = max(sorted(scores), key=scores.get)
    top = max(scores.values())                          # 先減掉最大值再 exp，避免下溢
    p = math.exp(scores[best] - top) / sum(math.exp(s - top) for s in scores.values())
    shown = ' '.join(f'{c}={scores[c]:.3f}' for c in sorted(scores))
    print(f'{text} | {shown} -> {best} {p:.3f}')` },
      output: '詞彙量 13 各類詞數 {\'ham\': 9, \'spam\': 11}\n免費 通知 開會 | ham=-8.175 spam=-8.436 -> ham 0.565\n中獎 獎金 附件 | ham=-9.273 spam=-8.436 -> spam 0.698\n明天 開會 | ham=-4.678 spam=-7.049 -> ham 0.915\n午餐 免費 | ham=-3.784 spam=-2.773 -> spam 0.733',
    },
    {
      id: 'e-smoothing', title: '為什麼要平滑、為什麼要取對數',
      description: '沒出現過的詞讓不平滑的乘積變成 0；400 個小機率相乘在浮點數中下溢成 0.0，對數和卻保留了大小關係。',
      code: { Python: code`import math
from fractions import Fraction as F

# spam 類別共 11 個詞、詞彙表 13 個詞；「開會」在 spam 裡出現 0 次，「免費」2 次
total, V = 11, 13
for word, n in [('開會', 0), ('免費', 2)]:
    print(word, '不平滑', F(n, total), ' Laplace', F(n + 1, total + V))

# 不平滑時，只要一個詞的機率是 0，整個乘積就是 0，其他證據全部失效
probs = [F(2, 11), F(2, 11), F(0, 11)]          # 免費 中獎 開會
print('不平滑的乘積', math.prod(probs))

# 下溢：400 個詞、每個機率 0.01 與 0.02，浮點數乘積都變成 0.0
for p in [0.01, 0.02]:
    product = 1.0
    for _ in range(400):
        product *= p
    print(p, '乘積', product, ' 對數和', f'{400 * math.log(p):.2f}')
# 對數保留了大小關係：log 是遞增函數，比較對數和就等於比較乘積` },
      output: '開會 不平滑 0  Laplace 1/24\n免費 不平滑 2/11  Laplace 1/8\n不平滑的乘積 0\n0.01 乘積 0.0  對數和 -1842.07\n0.02 乘積 0.0  對數和 -1564.81',
    },
  ],
  exercises: [
    {
      id: 'x-naive-bayes', title: '單純貝氏文字分類器：Laplace 平滑與對數機率',
      statement: '讀入訓練文件與查詢文件，用多項式單純貝氏分類每個查詢。先驗 P(c) = 類別 c 的文件數 / 訓練文件總數；概似用 Laplace 平滑：P(w | c) = (w 在類別 c 出現的次數 + 1) / (類別 c 的總詞數 + V)，V 是所有訓練文件中不同詞的個數。查詢中不在詞彙表裡的詞略過；同一個詞出現幾次就乘幾次。對每個類別計算 log P(c) + Σ log P(w | c)，取分數最大的類別；兩個類別的對數分數相差小於 1e-9 時視為平手，取字典序較小的類別。並印出該類別的後驗機率（所有類別的機率正規化後加起來為 1）。查詢可能很長，直接把機率相乘會下溢，請用對數。',
      inputFormat: '第一行整數 N，接著 N 行訓練文件，每行是「類別 詞 詞 …」，以空白分隔，至少一個詞。再一行整數 Q，接著 Q 行查詢，每行是以空白分隔的詞。',
      outputFormat: '第一行印 `classes`，接著依字典序列出每個類別與它的文件數，格式 `類別(文件數)`，最後是 `vocab=V`，以空白分隔。之後每個查詢印一行：`類別 後驗 (known k/m)`，後驗取 4 位小數，k 是查詢中在詞彙表裡的詞數（重複的詞都算），m 是查詢的總詞數。查詢行沒有任何詞時，那一行印 `empty query`。若 N 不是 1–100 的整數、某筆訓練文件少於一個詞、Q 不是 0–50 的整數，或總行數和 N、Q 不符：整份輸入只印一行 `invalid input`。',
      constraints: ['1 ≤ N ≤ 100，0 ≤ Q ≤ 50', '類別與詞都是不含空白的字串，區分大小寫', '每行最多 1000 個詞', '後驗以 4 位小數印出'],
      samples: [
        { kind: 'normal', input: "6\nspam free prize click now\nspam free offer click\nspam prize claim now\nham meeting tomorrow notes\nham lunch tomorrow\nham project meeting notes\n4\nfree prize\nmeeting tomorrow\nfree lunch tomorrow\nclick here now\n", output: "classes ham(3) spam(3) vocab=11\nspam 0.8805 (known 2/2)\nham 0.9166 (known 2/2)\nham 0.7298 (known 3/3)\nspam 0.8805 (known 2/3)\n", note: "垃圾信與一般信件：click here now 的 here 不在詞彙表，略過（known 2/3）" },
        { kind: 'normal', input: "7\nsports goal team win match\nsports team coach goal\nsports match score win\ntech code python bug\ntech python data model\nfood rice noodle soup\nfood soup spicy noodle\n3\ngoal win\npython model bug\nspicy noodle match\n", output: "classes food(2) sports(3) tech(2) vocab=15\nsports 0.8265 (known 2/2)\ntech 0.8640 (known 3/3)\nfood 0.6207 (known 3/3)\n", note: "三個類別，每個查詢取後驗最大的類別" },
      ],
      tests: [
        { kind: 'normal', input: "5\nrare alpha beta gamma delta epsilon zeta eta theta\ncommon alpha\ncommon beta\ncommon gamma\ncommon delta\n4\nalpha\nzeta\nzeta eta theta\nalpha beta gamma delta\n", output: "classes common(4) rare(1) vocab=8\ncommon 0.8421 (known 1/1)\ncommon 0.7273 (known 1/1)\ncommon 0.5424 (known 3/3)\ncommon 0.9267 (known 4/4)\n", note: "先驗看文件數不是詞數：common 有 4 封信、rare 只有 1 封但詞較多；證據夠強時 rare 才勝出" },
        { kind: 'normal', input: "4\npos good great fun\npos good movie\nneg bad boring movie\nneg bad plot\n4\ngood bad\ngood good bad\ngood bad bad\nmovie\n", output: "classes neg(2) pos(2) vocab=7\nneg 0.5000 (known 2/2)\npos 0.7500 (known 3/3)\nneg 0.7500 (known 3/3)\nneg 0.5000 (known 1/1)\n", note: "good bad 與 movie 兩類完全對稱（兩類都是 5 個詞）：平手取字典序較小的 neg；重複的詞每出現一次就乘一次概似，good good bad 偏向 pos" },
        { kind: 'normal', input: "6\nspam free prize click now\nspam free offer click\nspam prize claim now\nham meeting tomorrow notes\nham lunch tomorrow\nham project meeting notes\n3\nprize\nnotes\nfree free free meeting\n", output: "classes ham(3) spam(3) vocab=11\nspam 0.7308 (known 1/1)\nham 0.7683 (known 1/1)\nspam 0.8578 (known 4/4)\n", note: "只出現在一類的詞：不平滑會讓另一類機率變成 0，Laplace 平滑後仍保留可能性" },
        { kind: 'edge', input: "4\na x y\na x z\na y z\nb w\n2\nunknown words only\nzzz\n", output: "classes a(3) b(1) vocab=4\na 0.7500 (known 0/3)\na 0.7500 (known 0/1)\n", note: "查詢的詞全都沒看過：known 0，只剩先驗 P(a)=3/4" },
        { kind: 'edge', input: "2\ncat meow purr\ndog bark wag\n3\nhello\nmeow bark\npurr wag meow bark\n", output: "classes cat(1) dog(1) vocab=4\ncat 0.5000 (known 0/1)\ncat 0.5000 (known 2/2)\ncat 0.5000 (known 4/4)\n", note: "完全對稱的兩類：對數分數相同視為平手，取字典序較小的 cat，後驗 0.5000" },
        { kind: 'edge', input: "3\nonly one two\nonly two three\nonly three four\n2\none\nfive\n", output: "classes only(3) vocab=4\nonly 1.0000 (known 1/1)\nonly 1.0000 (known 0/1)\n", note: "只有一個類別：後驗一定是 1.0000" },
        { kind: 'edge', input: LONG_QUERY_INPUT, output: "classes x(1) y(1) vocab=15\nx 1.0000 (known 500/500)\ny 0.6667 (known 501/501)\n", note: "500 個詞的查詢：機率直接相乘會下溢成 0.0，對數相加才算得出結果" },
        { kind: 'error', input: "0\n0\n", output: "invalid input\n", note: "沒有訓練資料（N 必須至少 1）" },
        { kind: 'error', input: "3\nspam free prize\nham\nham lunch\n1\nfree\n", output: "invalid input\n", note: "第二筆訓練資料只有類別、沒有詞" },
        { kind: 'error', input: "2\nspam free\nham lunch\n3\nfree\nlunch\n", output: "invalid input\n", note: "宣告 3 個查詢，只給了 2 個" },
        { kind: 'error', input: "two\nspam free\nham lunch\n1\nfree\n", output: "invalid input\n", note: "訓練筆數不是整數" },
        { kind: 'error', input: "2\nspam free prize\nham lunch notes\n3\nfree\n\nlunch notes\n", output: "classes ham(1) spam(1) vocab=4\nspam 0.6667 (known 1/1)\nempty query\nham 0.8000 (known 2/2)\n", note: "中間有一行空白查詢：那一行印 empty query，其他照常" },
      ],
      hints: [
        '先寫 parse：格式有問題就回傳 None，主程式只要印 `invalid input`。',
        '用 `collections.Counter` 數每類的文件數與每類每個詞的次數，詞彙表是所有詞的集合。',
        '分數用 `math.log` 相加，不要先把機率乘起來：500 個約 1/20 的機率相乘會變成 0.0。',
        '後驗：每個類別的對數分數減掉最佳類別的分數再取 `math.exp`，加總後取倒數，就是最佳類別的機率。',
        '平手時取字典序較小的類別：先依字典序排序類別，再找第一個和最大分數相差小於 1e-9 的。',
      ],
      solution: { Python: code`import math
import sys
from collections import Counter

def parse(lines):
    """回傳 (訓練資料, 查詢串列)；格式不對就回傳 None。"""
    def number(i, low, high):
        text = lines[i].strip() if i < len(lines) else ''
        return int(text) if text.isdigit() and low <= int(text) <= high else None
    n = number(0, 1, 100)
    if n is None or len(lines) < 2 + n:
        return None
    train = []
    for line in lines[1:1 + n]:
        parts = line.split()
        if len(parts) < 2:              # 至少要有類別和一個詞
            return None
        train.append((parts[0], parts[1:]))
    q = number(1 + n, 0, 50)
    if q is None or len(lines) != 2 + n + q:
        return None
    return train, lines[2 + n:]

def build(train):
    docs = Counter(label for label, _ in train)
    words = {c: Counter() for c in docs}
    for label, ws in train:
        words[label].update(ws)
    vocab = set().union(*words.values())
    return docs, words, vocab

def classify(model, n, ws):
    docs, words, vocab = model
    known = [w for w in ws if w in vocab]          # 沒看過的詞略過
    scores = {}
    for c in sorted(docs):
        total = sum(words[c].values())
        s = math.log(docs[c] / n)                   # log 先驗
        for w in known:                             # Laplace 平滑的 log 概似
            s += math.log((words[c][w] + 1) / (total + len(vocab)))
        scores[c] = s
    top = max(scores.values())
    best = min(c for c in scores if top - scores[c] < 1e-9)   # 平手取字典序最小
    p = 1 / sum(math.exp(s - scores[best]) for s in scores.values())
    return f'{best} {p:.4f} (known {len(known)}/{len(ws)})'

parsed = parse(sys.stdin.read().splitlines())
if parsed is None:
    print('invalid input')
else:
    train, queries = parsed
    model = build(train)
    docs, words, vocab = model
    print('classes', ' '.join(f'{c}({docs[c]})' for c in sorted(docs)), f'vocab={len(vocab)}')
    for line in queries:
        ws = line.split()
        print(classify(model, len(train), ws) if ws else 'empty query')` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐次貝氏更新：先驗 × 概似 → 正規化 → 後驗', language: 'Python',
    code: TRACE_CODE,
    steps: updateSteps(),
  },
  quiz: [
    {
      id: 'q-terms', prompt: '在貝氏定理 P(H | E) = P(E | H) P(H) / P(E) 中，哪一項是概似（likelihood）？',
      options: ['P(H)', 'P(H | E)', 'P(E | H)', 'P(E)'],
      answer: 2, explanation: '概似是「假設 H 成立時看到證據 E 的機率」P(E | H)，在醫療檢測中就是敏感度。P(H) 是看到證據之前的先驗；P(H | E) 是看到證據之後的後驗，正是我們要算的東西；P(E) 是證據的總機率，作為分母負責正規化，可以由各假設的「概似 × 先驗」加總得到。',
    },
    {
      id: 'q-medical', prompt: '某病盛行率 0.1%，檢測敏感度 99%，偽陽性率 1%。一個人檢測陽性，他真正患病的機率最接近多少？',
      options: ['約 9%', '約 99%', '約 1%', '約 50%'],
      answer: 0, explanation: 'P(病 | 陽性) = 0.99 × 0.001 / (0.99 × 0.001 + 0.01 × 0.999) = 0.00099 / 0.01098 = 11/122 ≈ 9.0%。10 萬人裡約 99 個真陽性，卻有約 999 個偽陽性。99% 是把敏感度 P(陽性 | 病) 當成後驗，正是基本比率謬誤；1% 是偽陽性率，和後驗無關；50% 是把患病與沒病當成同樣可能，忽略了 0.1% 的先驗。',
    },
    {
      id: 'q-normalize', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
prior = {'A': F(1, 2), 'B': F(1, 4), 'C': F(1, 4)}
like = {'A': F(1, 10), 'B': F(2, 5), 'C': F(1, 5)}
score = {h: prior[h] * like[h] for h in sorted(prior)}
total = sum(score.values())
print(max(sorted(score), key=score.get), score['B'] / total)` },
      options: ['A 1/20', 'B 1/10', 'A 1/2', 'B 1/2'],
      answer: 3, explanation: 'score 是先驗 × 概似：A = 1/20、B = 1/10、C = 1/20，total = 1/5，所以最大的是 B，正規化後 B 的後驗是 (1/10) / (1/5) = 1/2。「A 1/20」只看先驗最大的 A，忽略了概似；「B 1/10」選對了 B，卻忘了除以 total，1/10 只是未正規化的值；「A 1/2」把 B 的後驗配給了先驗最大的 A。',
    },
    {
      id: 'q-base-rate', prompt: '某罕見病檢測的敏感度是 99%。有人說：「他檢測陽性，所以他有 99% 的機率患病。」這個推論錯在哪裡？',
      options: ['敏感度要用 1 減掉，才是患病的機率', '把 P(陽性 | 病) 當成 P(病 | 陽性)，忽略了盛行率這個基本比率', '檢測結果是陽性時不能使用貝氏定理', '應該把 99% 除以做過的檢測次數'],
      answer: 1, explanation: '敏感度是 P(陽性 | 病)，問題問的是 P(病 | 陽性)，兩者要靠先驗（盛行率）與偽陽性率才能互相換算；病越罕見，陽性中偽陽性的比例越高，這就是基本比率謬誤。「1 減掉敏感度」得到的是偽陰性率 P(陰性 | 病)，不是後驗；貝氏定理正是處理陽性結果的工具，沒有不能用的道理；除以檢測次數沒有任何機率上的根據。',
    },
    {
      id: 'q-laplace', prompt: '某類別的訓練文件共有 10 個詞，詞彙表有 8 個不同的詞，word 在這個類別出現 2 次。用 Laplace（加一）平滑估計 P(word | 類別) 是多少？',
      options: ['2/10', '1/6', '3/10', '2/18'],
      answer: 1, explanation: 'Laplace 平滑是 (次數 + 1) / (總詞數 + V) = (2 + 1) / (10 + 8) = 3/18 = 1/6。2/10 是沒有平滑的相對頻率；3/10 分子加了一，分母卻沒有加 V，所有詞的機率加起來會超過 1；2/18 分母加了 V，分子卻沒有加一，沒看過的詞仍然是 0。',
    },
    {
      id: 'q-log', prompt: '單純貝氏分類器為什麼通常用對數機率 log P(c) + Σ log P(w | c)，而不是直接把機率相乘？',
      options: ['讓機率變成整數，才能用 Fraction 計算', '取對數後，沒看過的詞機率就不再是 0', '讓分類結果不受先驗 P(c) 影響', '許多小機率相乘會下溢成 0.0；取對數變成相加，而 log 是遞增函數，不改變誰大誰小'],
      answer: 3, explanation: '幾百個 0.01 左右的機率相乘會小於浮點數能表示的最小值而變成 0.0，各類別都是 0 就無法比較；對數把乘積變成普通大小的和，且 log 遞增，比較對數和等於比較乘積。對數值是實數，不會變成整數；log 0 是負無限大，解決零機率要靠 Laplace 平滑而不是取對數；log P(c) 仍在分數裡，先驗照樣影響結果。',
    },
    {
      id: 'q-order', prompt: '下面的程式用兩種順序處理同樣的兩次結果，印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
p_heads = {'fair': F(1, 2), 'head': F(3, 4)}

def update(belief, flip):
    score = {h: belief[h] * (p_heads[h] if flip == 'H' else 1 - p_heads[h])
             for h in sorted(belief)}
    total = sum(score.values())
    return {h: score[h] / total for h in sorted(score)}

b1 = b2 = {'fair': F(1, 2), 'head': F(1, 2)}
for f in 'HT':
    b1 = update(b1, f)
for f in 'TH':
    b2 = update(b2, f)
print(b1['head'], b2['head'], b1 == b2)` },
      options: ['3/7 3/7 True', '3/7 1/3 False', '1/2 1/2 True', '3/4 1/4 False'],
      answer: 0, explanation: '兩種順序的未正規化值都是 fair：1/2 × 1/2 × 1/2 = 1/8、head：1/2 × 3/4 × 1/4 = 3/32，正規化後 head = (3/32) / (7/32) = 3/7。給定硬幣時各次結果條件獨立，概似相乘與順序無關，所以兩個 dict 相等，印出 3/7 3/7 True。「3/7 1/3 False」誤以為後來的證據比較重要；「1/2 1/2 True」以為一正一反互相抵銷，但 head 的正反面機率不對稱；「3/4 1/4 False」把 head 的正反面機率當成了後驗。',
    },
    {
      id: 'q-params', prompt: '有 10 個布林特徵與一個布林類別。完整的聯合分布需要幾個獨立參數？在單純貝氏假設下又需要幾個？',
      options: ['2047 與 2047', '1024 與 20', '2047 與 21', '11 與 21'],
      answer: 2, explanation: '11 個布林變數的聯合分布有 2¹¹ = 2048 列，扣掉「總和為 1」的限制剩 2047 個；單純貝氏只需要 P(C) 一個，加上每個特徵在兩個類別下各一個機率 10 × 2 = 20 個，共 21 個。「2047 與 2047」以為單純貝氏沒有省下參數；「1024 與 20」算的是 2¹⁰，少算了類別變數，也漏了 P(C)；「11 與 21」把聯合分布的參數當成變數個數，忽略了組合是指數成長。',
    },
  ],
};
