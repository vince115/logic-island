import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF17 決策理論與效用 (python-code: Python only, standard library). Every example and the reference solution run in
 * the curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 * The exercise's printed values were also recomputed exactly with fractions.Fraction to make sure none lies near a
 * rounding boundary of the 4-decimal format (and none is a tiny negative number that would print as -0.0000).
 *
 * The visualization runs TRACE_CODE (also the example e-meu): the tent decision table, P(rain) = 2/5, three actions.
 * meuSteps() repeats the program's two loops with exact fractions in the same order (actions sorted, states sorted),
 * so every product P[s] × U[a][s], running sum and comparison shown comes from actually running it; the last step's
 * output is checked against TRACE_OUTPUT, which the lesson test compares with Python's real output.
 */
type Frac = [number, number];
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n: number, d: number): Frac => { const g = gcd(n, d); return [n / g, d / g]; };
const mul = (a: Frac, b: Frac) => frac(a[0] * b[0], a[1] * b[1]);
const add = (a: Frac, b: Frac) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const greater = (a: Frac, b: Frac) => a[0] * b[1] > b[0] * a[1];
const show = (a: Frac) => (a[1] === 1 ? String(a[0]) : `${a[0]}/${a[1]}`);

const STATES = ['rain', 'sun'] as const;
type State = (typeof STATES)[number];
const ACTIONS = ['indoor', 'outdoor', 'tent'] as const;
type Action = (typeof ACTIONS)[number];
const PROB: Record<State, Frac> = { rain: [2, 5], sun: [3, 5] };
const UTIL: Record<Action, Record<State, number>> = { indoor: { rain: 60, sun: 40 }, outdoor: { rain: 0, sun: 100 }, tent: { rain: 50, sun: 80 } };
const TRACE_OUTPUT = 'indoor 48\noutdoor 60\ntent 68\nMEU: tent 68';

const TRACE_CODE = code`from fractions import Fraction as F
P = {'rain': F(2, 5), 'sun': F(3, 5)}  # 機率節點：天氣
U = {'indoor': {'rain': 60, 'sun': 40},
     'outdoor': {'rain': 0, 'sun': 100},
     'tent': {'rain': 50, 'sun': 80}}  # 效用 U(行動, 天氣)
best, best_eu = None, None
for a in sorted(U):
    eu = F(0)
    for s in sorted(P):
        eu += P[s] * U[a][s]  # 機率 × 效用，逐一累加
    print(a, eu)
    if best_eu is None or eu > best_eu:  # 嚴格大於：平手保留先出現的
        best, best_eu = a, eu
print('MEU:', best, best_eu)`;

function meuSteps(): TraceStep[] {
  const steps: TraceStep[] = [];
  const p = STATES.map(s => `${s}=${show(PROB[s])}`).join(' ');
  const row = (a: Action) => STATES.map(s => `${s}=${UTIL[a][s]}`).join(' ');
  const zh: Record<Action, string> = { indoor: '移到室內', outdoor: '照原計畫辦在戶外', tent: '戶外搭帳篷' };
  steps.push({ line: 2, note: '要辦一場戶外活動，明天的天氣是機率節點：下雨 rain 的機率 2/5，晴天 sun 的機率 3/5。用 Fraction 存，之後的乘法與加法都是精確的分數，兩個機率加起來剛好是 1。',
    vars: { P: p } });
  steps.push({ line: 3, note: '效用表 U 記下每個「行動 × 天氣」結果有多好（0 到 100 分）：室內 indoor 不怕雨但氣氛差；戶外 outdoor 晴天最好、下雨最糟；帳篷 tent 兩種天氣都還可以。效用函數把結果變成可以比較的數字，這是代理人的偏好，不是機率。',
    vars: { P: p, U: ACTIONS.map(a => `${a}(${row(a)})`).join(' ') } });
  let best: Action | null = null;
  let bestEu: Frac | null = null;
  const base = () => ({ P: p, best: best ?? 'None', best_eu: bestEu ? show(bestEu) : 'None' });
  steps.push({ line: 6, note: '還沒有評估任何行動，最佳行動 best 與它的期望效用 best_eu 都先設成 None。接著依名稱排序逐一評估每個行動，排序讓輸出與平手時的選擇都固定。', vars: base() });
  const printed: string[] = [];
  for (const [k, a] of ACTIONS.entries()) {
    steps.push({ line: 7, note: `${k === 0 ? '第一個' : k === 1 ? '第二個' : '最後一個'}行動是 ${a}（${zh[a]}），它在兩種天氣下的效用是 ${row(a)}。`,
      vars: { ...base(), a, 'U[a]': row(a) }, output: printed.join('\n') || undefined });
    let eu: Frac = [0, 1];
    steps.push({ line: 8, note: `期望效用 eu 從 0 開始，等一下把每種天氣的「機率 × 效用」加進來。`,
      vars: { ...base(), a, 'U[a]': row(a), eu: show(eu) }, output: printed.join('\n') || undefined });
    for (const s of STATES) {
      const term = mul(PROB[s], [UTIL[a][s], 1]);
      const before = eu;
      eu = add(eu, term);
      steps.push({ line: 10, note: `天氣 ${s}：P[${s}] × U[${a}][${s}] = ${show(PROB[s])} × ${UTIL[a][s]} = ${show(term)}，eu = ${show(before)} + ${show(term)} = ${show(eu)}。${s === 'sun' ? `兩種天氣都加完，EU(${a}) = ${show(eu)}：如果同樣的情況重複很多次，選 ${a} 平均得到的效用。` : '這是「下雨而且選了這個行動」對期望值的貢獻。'}`,
        vars: { ...base(), a, s, 'P[s] × U[a][s]': show(term), eu: show(eu) }, output: printed.join('\n') || undefined });
    }
    printed.push(`${a} ${show(eu)}`);
    steps.push({ line: 11, note: `印出 ${a} 的期望效用 ${show(eu)}。`, vars: { ...base(), a, eu: show(eu) }, output: printed.join('\n') });
    if (bestEu === null || greater(eu, bestEu)) {
      const old = bestEu;
      best = a; bestEu = eu;
      steps.push({ line: 13, note: old === null ? `目前還沒有最佳行動，${a} 先成為 best，best_eu = ${show(eu)}。` : `${show(eu)} 嚴格大於目前的 best_eu ${show(old)}，換成 ${a}。`,
        vars: { ...base(), a, eu: show(eu) }, output: printed.join('\n') });
    } else {
      steps.push({ line: 12, note: `${show(eu)} 沒有大於目前的 best_eu ${show(bestEu)}，best 仍是 ${best}。若相等也不換：平手保留排序較前的行動。`,
        vars: { ...base(), a, eu: show(eu) }, output: printed.join('\n') });
    }
  }
  const output = [...printed, `MEU: ${best} ${show(bestEu!)}`].join('\n');
  if (output !== TRACE_OUTPUT) throw new Error(`AIF17: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  steps.push({ line: 14, note: `三個行動的期望效用是 indoor 48、outdoor 60、tent 68，最大期望效用（MEU）是 ${show(bestEu!)}，理性代理人選 ${best}。注意 tent 在任何一種天氣下都不是最好的（下雨時 indoor 60 較好，晴天時 outdoor 100 較好），但它兩邊都不差，平均起來最高。若事先知道天氣，就能下雨選 indoor、晴天選 outdoor，期望效用升到 84，差距 16 就是完美資訊的價值（VPI）。`,
    vars: { P: p, best: best!, best_eu: show(bestEu!) }, output });
  return steps;
}

export const AIF17: LessonContent = {
  lessonId: 'AIF17',
  motivation: '前幾課讓代理人學會用機率表示「世界可能是什麼樣子」，但知道明天下雨的機率是 40%，並不等於知道該不該把活動移到室內。要做決定，代理人還需要知道每個結果對它「有多好」，並把機率與好壞結合起來。決策理論（decision theory）就是這兩者的結合：機率理論描述代理人相信什麼，效用理論描述代理人想要什麼。這一課用效用函數表達偏好，算出每個行動的期望效用，說明最大期望效用原則與風險態度，再用決策樹與決策網路把多步決策畫出來，最後回答一個很實際的問題：在做決定之前，花成本先蒐集更多資訊值不值得？',
  sections: [
    {
      id: 'utility', title: '理性代理人與效用函數',
      blocks: [
        { type: 'p', text: 'AIF03 把理性代理人定義為「選出預期能讓績效度量最大的動作」。在不確定的環境中，一個行動 a 可能導致好幾種結果，各有機率。決策理論把這個想法寫成精確的式子：效用函數（utility function）U(s) 為每個結果狀態 s 打一個分數，表示代理人有多偏好它；行動在證據 e 之下的期望效用（expected utility）是 `EU(a | e) = Σ P(s | a, e) U(s)`，也就是每個結果的機率乘上它的效用再加總。' },
        { type: 'table', head: ['名稱', '寫法', '意義'], rows: [
          ['偏好', 'A ≻ B、A ∼ B', '代理人比較喜歡 A；兩者一樣好'],
          ['樂透（lottery）', 'L = [p₁, S₁; p₂, S₂; …]', '以機率 p₁ 得到結果 S₁、p₂ 得到 S₂……的一個不確定情況；行動的後果就是一張樂透'],
          ['效用函數', 'U(S)', '把結果映到實數，A ≻ B 恰好在 U(A) > U(B) 時成立'],
          ['期望效用', 'EU(a) = Σ P(s | a) U(s)', '行動的平均效用；樂透的效用是 Σ pᵢ U(Sᵢ)'],
          ['最大期望效用（MEU）', 'a* = argmax_a EU(a)', '理性代理人選期望效用最大的行動'],
        ] },
        { type: 'p', text: '效用不是金錢，也不是機率。效用函數表達的是偏好：同樣多 1000 元，對身上只有 500 元的學生與對富翁的意義不同；一場活動被雨打亂，損失的也不只是錢，還有參加者的心情。決策理論只要求代理人的偏好能用一個數字表示，數字從哪裡來（問卷、成本、設計者的取捨）是建模時要決定的事。' },
        { type: 'callout', tone: 'note', title: '和 AIF03 效用式代理人的關係', text: 'AIF03 列出的效用式代理人（utility-based agent）就是本課的主角：它有一個描述世界如何變化的模型、一個衡量結果好壞的效用函數，並選出期望效用最高的動作。目標式代理人只分「達成／沒達成」，無法比較兩條都能到達目的地、但時間與風險不同的路線；效用函數讓這種取捨變得可以計算。' },
      ],
    },
    {
      id: 'axioms', title: '為什麼是期望效用：公理與人類的偏離',
      blocks: [
        { type: 'p', text: '為什麼要用「機率 × 效用再加總」，而不是別的規則？von Neumann 與 Morgenstern 在《Theory of Games and Economic Behavior》（1944 年初版，1947 年第二版補上完整的證明）中證明：只要代理人對樂透的偏好滿足幾條看起來很合理的公理，就一定存在一個效用函數 U，使得「偏好 A 勝過 B」恰好等於「U(A) > U(B)」，而且樂透的效用就是各結果效用的期望值。這個結果稱為期望效用定理，也叫 von Neumann–Morgenstern（vNM）效用定理。' },
        { type: 'table', head: ['公理', '直觀意義'], rows: [
          ['完備性（completeness，也叫可排序性）', '任兩張樂透都能比較：A ≻ B、B ≻ A 或 A ∼ B 必有一個成立'],
          ['遞移性（transitivity）', 'A ≻ B 且 B ≻ C，則 A ≻ C'],
          ['連續性（continuity）', 'A ≻ B ≻ C 時，存在某個 p，使 [p, A; 1 − p, C] 與確定得到 B 一樣好'],
          ['獨立性（independence，也叫代換性）', 'A ∼ B 時，把某張樂透裡的 A 換成 B，偏好不變（教科書也寫成 A ≻ B 時，以相同機率混入同一個 C 不改變偏好）'],
        ] },
        { type: 'p', text: 'Russell 與 Norvig 的教科書把同一組條件寫成六條（再加上單調性與可分解性），內容等價。違反遞移性的代理人會被「錢幫浦」（money pump）榨乾：它偏好 A 勝過 B、B 勝過 C、C 又勝過 A，就會願意各付 1 元，把 C 換成 B、B 換成 A、A 再換回 C，繞一圈回到原點卻少了 3 元。定理還說明效用只能決定到正的仿射轉換：`U\' = aU + b`（a > 0）代表完全相同的偏好，所以把 0 到 100 分改成 −20 到 280 分，最佳行動不變；但取平方這類非線性的轉換會改變樂透之間的比較。' },
        { type: 'p', text: 'vNM 公理是規範性的（normative）：說明一個前後一致的決策者「應該」怎麼選，不保證人類「實際上」這樣選。最著名的反例是 Maurice Allais 在 1953 年提出的 Allais 悖論。' },
        { type: 'table', head: ['選擇', '選項 A', '選項 B', '多數人的選擇'], rows: [
          ['第一組', '確定得到 100 萬', '89% 得 100 萬、10% 得 500 萬、1% 什麼都沒有', 'A'],
          ['第二組', '11% 得 100 萬、89% 什麼都沒有', '10% 得 500 萬、90% 什麼都沒有', 'B'],
        ] },
        { type: 'p', text: '兩組的差別只是把「89% 得 100 萬」這個共同部分換成「89% 什麼都沒有」。對任何效用函數，`EU(1A) − EU(1B) = 0.11 U(100萬) − 0.10 U(500萬) − 0.01 U(0)`，而 `EU(2A) − EU(2B)` 是完全相同的式子，所以期望效用最大化者在兩組一定做同方向的選擇。多數人第一組選 A、第二組選 B，違反了獨立性公理，常見的解釋是確定性效應（certainty effect）：人們特別看重「確定」。1979 年 Kahneman 與 Tversky 提出的展望理論（prospect theory）就是描述這類行為的模型。對設計 AI 代理人而言，MEU 仍是行為一致、可以分析的基準；但若代理人要預測或服務人類，就不能假設人類一定照 MEU 行動。' },
      ],
    },
    {
      id: 'risk', title: '效用與金錢：風險態度與確定等值',
      blocks: [
        { type: 'p', text: '金錢的效用通常不是直線。1738 年 Daniel Bernoulli 討論聖彼得堡悖論（St. Petersburg paradox）時提出：同樣多一塊錢，對越有錢的人帶來的效用越少，也就是邊際效用遞減，效用函數是凹的（concave）。凹的效用函數讓「確定拿到期望金額」比「冒險」更好，這就是風險態度（risk attitude）中的風險趨避（risk-averse）。' },
        { type: 'p', text: '比較一張樂透 L 與確定的金額，有兩個好用的量。確定等值（certainty equivalent，CE）是讓代理人覺得和樂透一樣好的確定金額：`U(CE) = EU(L)`。風險貼水（risk premium）是金額期望值減去確定等值 `EMV(L) − CE`，代表代理人願意為了消除風險而放棄多少期望金額；保險公司能賺錢、投保人仍願意買保險，靠的正是投保人的風險貼水大於零。' },
        { type: 'example', id: 'e-lottery' },
        { type: 'table', head: ['風險態度', '效用函數的形狀', '確定等值與期望金額', '風險貼水', '範例中的選擇'], rows: [
          ['風險趨避', '凹，例如 √x', 'CE < EMV（2500 < 5000）', '正（2500）', '確定拿 4000'],
          ['風險中立（risk-neutral）', '直線，U(x) = x', 'CE = EMV', '0', '樂透（5000 > 4000）'],
          ['風險追求（risk-seeking）', '凸，例如 x²', 'CE > EMV（約 7071 > 5000）', '負（約 −2071）', '樂透'],
        ] },
        { type: 'p', text: '範例中，樂透有一半機會得到 10000 元、一半什麼都沒有，期望金額 5000 元。√x 的代理人覺得它只值確定的 2500 元，所以寧可確定拿 4000；直線效用的代理人只看期望金額；x² 的代理人覺得它值約 7071 元。對金額很小的賭注，凹的曲線在一小段上幾乎是直線，所以即使風險趨避的人也近似風險中立，這就是許多日常小額決策可以直接比較期望金額的原因。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：最大化期望金額才是理性', text: '理性是最大化期望「效用」，不是期望「金額」。風險趨避的人選擇確定的 4000 元而不是期望值 5000 元的樂透，並不是算錯了，而是他的效用函數是凹的，在他的偏好下確定拿 4000 的期望效用比較高。只有當效用與金額成正比（風險中立）時，兩者才是同一件事。同理，買保險的期望金額是負的，對風險趨避的人卻可能是理性的選擇。' },
      ],
    },
    {
      id: 'meu', title: '最大期望效用原則：決策表',
      blocks: [
        { type: 'p', text: '最大期望效用原則（maximum expected utility，MEU）：理性代理人應該選出期望效用最大的行動。把行動列成列、可能的狀態列成欄、每格寫上效用，就是一張決策表（decision table）。以下是本課一直使用的例子：明天下雨的機率 2/5，活動要辦在室內、照常在戶外，還是在戶外搭帳篷？' },
        { type: 'table', head: ['行動 \\ 天氣', 'rain（2/5）', 'sun（3/5）', '期望效用'], rows: [
          ['indoor（室內）', '60', '40', '2/5 × 60 + 3/5 × 40 = 48'],
          ['outdoor（戶外）', '0', '100', '2/5 × 0 + 3/5 × 100 = 60'],
          ['tent（帳篷）', '50', '80', '2/5 × 50 + 3/5 × 80 = 68'],
        ] },
        { type: 'example', id: 'e-meu' },
        { type: 'p', text: '程式就是下方視覺化逐步執行的那一段：外層迴圈走過每個行動，內層迴圈把每種天氣的「機率 × 效用」累加起來，最後保留最大的。tent 在任何一種天氣下都不是第一名，期望效用卻最高，因為它不會在任何情況下太差。比較時用「嚴格大於」，平手時保留先出現的行動；在程式裡寫明平手規則，同樣的輸入才會得到同樣的輸出。' },
        { type: 'callout', tone: 'tip', title: '好決策不保證好結果', text: '選了 tent 之後，明天若出大太陽，事後看會覺得「早知道就辦在戶外」。但 MEU 評判的是決定當時的資訊下的選擇，不是事後的結果：重複很多次同樣的情況，選 tent 的平均效用最高。用結果的好壞來評判決策，是把運氣當成能力，AIF03 也說過理性不要求全知。' },
      ],
    },
    {
      id: 'trees-networks', title: '決策樹與決策網路',
      blocks: [
        { type: 'p', text: '當決策分好幾步、中間穿插著機率事件時，可以畫成決策樹（decision tree）：方形的決策節點由代理人選擇，圓形的機率節點（chance node）由機率決定，樹葉是結果的效用。求解的方法是由下往上倒推（rollback，也叫 averaging out and folding back）：機率節點取子節點的期望值，決策節點取子節點的最大值。這和 AIF08 的 expectiminimax 是同一個想法，只是沒有對手的 MIN 節點。' },
        { type: 'example', id: 'e-tree' },
        { type: 'p', text: '範例中，走高速公路有 1/4 的機會塞車，塞車時還可以再做一次決定。倒推時先算最底下的決策：等待的期望效用是 30，改走平面道路是 40，所以塞車時會改道，這個子樹的價值是 40；高速公路的期望效用是 3/4 × 90 + 1/4 × 40 = 155/2，高於平面道路的 70。重點是：評估第一步時，已經把「之後會做最好的選擇」算進去了。' },
        { type: 'p', text: '決策樹會隨著步驟與結果數量指數成長。決策網路（decision network，也叫影響圖 influence diagram）用 AIF15 貝氏網路的方式把它壓縮：在貝氏網路上加入決策節點與效用節點。' },
        { type: 'table', head: ['節點', '常見畫法', '代表什麼', '天氣例子'], rows: [
          ['機率節點（chance node）', '橢圓', '隨機變數，帶有條件機率表', 'Weather、Forecast（預報）'],
          ['決策節點（decision node）', '矩形', '代理人可以選擇的值；指向它的邊表示做決定時已經知道的資訊', 'Plan：indoor、outdoor、tent'],
          ['效用節點（utility node）', '菱形', '父節點每種組合的效用', 'U(Plan, Weather)'],
        ] },
        { type: 'p', text: '評估決策網路的演算法：先把觀察到的證據設定好；對決策節點的每一個可能值，把它當成已知，用貝氏網路推論算出效用節點父節點的後驗分布，再算出期望效用；最後選期望效用最大的值。下面的範例在決策前先看預報 Forecast：預報說會下雨時，下雨的後驗從 2/5 升到 8/11，最佳行動仍是 tent；預報說晴天時，下雨的後驗降到 1/7，最佳行動變成 outdoor。每個預報結果對應一個行動，這就是一個策略（policy）。' },
        { type: 'example', id: 'e-network' },
      ],
    },
    {
      id: 'vpi', title: '資訊價值：值不值得先蒐集資訊',
      blocks: [
        { type: 'p', text: '資訊本身不會改變天氣，它的價值來自讓代理人做出更好的決定。資訊價值（value of information）的定義是「先得知變數 E 的值再決定」的期望效用減去「現在就決定」的期望效用：`VPI(E) = Σ_e P(E = e) MEU(e) − MEU`，其中 MEU(e) 是得知 E = e 之後的最大期望效用。VPI 的 P 是 perfect，表示得到的是 E 的確切值；若 E 就是天氣本身，等於事先知道每種狀態，這時 `Σ_s P(s) max_a U(a, s) − MEU` 就是完美資訊的價值。' },
        { type: 'example', id: 'e-vpi' },
        { type: 'table', head: ['資訊', '先取得再決定的期望效用', '資訊價值', '取得後的策略'], rows: [
          ['不取得', '68', '0', '一律 tent'],
          ['完美的天氣資訊', '2/5 × 60 + 3/5 × 100 = 84', '16', 'rain → indoor，sun → outdoor'],
          ['準確率 80% 的預報', '11/25 × 640/11 + 14/25 × 600/7 = 368/5 = 73.6', '28/5 = 5.6', 'say_rain → tent，say_sun → outdoor'],
        ] },
        { type: 'p', text: 'VPI 永遠不會是負的。理由很直接：知道 E 之後，代理人還是可以選原本那個行動，所以每個 MEU(e) 至少是原本行動在 e 之下的期望效用，對 e 加權平均回去剛好是原本的 MEU。VPI 等於 0 的情況有兩種：資訊的每一種可能結果都不會改變最佳行動（例如範例中帳篷在兩種天氣下都最好），或資訊和決定相關的狀態無關（像擲一枚硬幣當預報，練習的測資就有這個例子）。不完美的預報最多只能和完美資訊一樣有價值，所以 5.6 ≤ 16；若取得資訊要付出成本，只有在資訊價值大於成本時才值得，這就是代理人「該收集的資訊要收集」的計算方法。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：資訊價值不為負，代表看了一定變好', text: 'VPI ≥ 0 是看之前、對所有可能結果平均的結論，不是每個結果都讓情況變好。預報說會下雨時，最佳期望效用從 68 降到約 58.18：壞消息讓代理人對結果更悲觀，但這是更準確的評估，而不是資訊有害；平均起來，看預報的期望效用是 73.6，仍高於 68。另外，VPI 也不能相加：兩項資訊一起取得的價值，可能大於或小於各自價值的和，因為它們可能提供重複的資訊，或要合在一起才改變決定。' },
        { type: 'callout', tone: 'note', title: '下一課：連續的決策', text: '本課的決策都只做一兩次。下一課的馬可夫決策過程（MDP）處理代理人在每個時間點都要選行動、每次行動都改變下一步狀態的情況，那時要最大化的是一連串報酬的期望總和，計算方法是本課 MEU 的推廣。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-lottery', title: '樂透、確定等值與三種風險態度',
      description: '同一張樂透（一半機會得 10000 元、一半什麼都沒有）與確定的 4000 元，用凹、直線、凸三種效用函數比較，並用效用函數的反函數算出確定等值與風險貼水。',
      code: { Python: code`import math
from fractions import Fraction as F

# 樂透 L = [1/2, 0 元; 1/2, 10000 元]，另一個選擇是確定拿 4000 元
lottery = [(F(1, 2), 0), (F(1, 2), 10000)]
sure = 4000
ev = sum(p * x for p, x in lottery)          # 金額的期望值
print('EV =', ev)

# 三種效用函數與它們的反函數（用來求確定等值）
kinds = [('averse  U=sqrt(x)', math.sqrt, lambda u: u * u),
         ('neutral U=x      ', lambda x: x, lambda u: u),
         ('seeking U=x*x    ', lambda x: x * x, math.sqrt)]
for name, u, inverse in kinds:
    eu = sum(float(p) * u(x) for p, x in lottery)   # 期望效用
    ce = inverse(eu)                                # 確定等值：U(CE) = EU
    choice = 'lottery' if eu > u(sure) else 'sure'
    print(f'{name} EU={eu:.2f} U(sure)={u(sure):.2f} '
          f'CE={ce:.2f} premium={float(ev) - ce:.2f} -> {choice}')` },
      output: 'EV = 5000\naverse  U=sqrt(x) EU=50.00 U(sure)=63.25 CE=2500.00 premium=2500.00 -> sure\nneutral U=x       EU=5000.00 U(sure)=4000.00 CE=5000.00 premium=0.00 -> lottery\nseeking U=x*x     EU=50000000.00 U(sure)=16000000.00 CE=7071.07 premium=-2071.07 -> lottery',
    },
    {
      id: 'e-meu', title: '決策表：逐一累加機率 × 效用，選出最大期望效用',
      description: '天氣是機率節點，三個行動各有兩種天氣下的效用；內層迴圈逐個結果累加期望效用，外層保留最大的。下方的視覺化逐步執行這段程式。',
      code: { Python: TRACE_CODE },
      output: TRACE_OUTPUT,
    },
    {
      id: 'e-tree', title: '決策樹倒推：機率節點取期望值，決策節點取最大值',
      description: '走高速公路可能塞車，塞車時還能再選一次；遞迴函式由下往上算出每個節點的價值，並印出每個決策節點的選擇。',
      code: { Python: code`from fractions import Fraction as F

# 節點：('U', 效用)、('C', [(機率, 子樹), ...]) 機率節點、('D', 名稱, {選項: 子樹}) 決策節點
jam = ('D', '遇到塞車', {'等待': ('C', [(F(1, 2), ('U', 50)), (F(1, 2), ('U', 10))]),
                      '改走平面道路': ('U', 40)})
root = ('D', '選路線', {'高速公路': ('C', [(F(3, 4), ('U', 90)), (F(1, 4), jam)]),
                     '平面道路': ('U', 70)})

def value(node, depth=0):
    """由下往上倒推：機率節點取期望值，決策節點取最大值。"""
    kind = node[0]
    if kind == 'U':
        return F(node[1])
    if kind == 'C':
        return sum(p * value(child, depth + 1) for p, child in node[1])
    name, options = node[1], node[2]
    scores = {o: value(options[o], depth + 1) for o in sorted(options)}
    best = max(sorted(scores), key=scores.get)
    shown = ', '.join(f'{o}={scores[o]}' for o in sorted(scores))
    print('  ' * depth + f'[{name}] {shown} -> {best}')
    return scores[best]

v = value(root)
print('整棵樹的期望效用:', v, f'= {float(v):.2f}')` },
      output: '    [遇到塞車] 改走平面道路=40, 等待=30 -> 改走平面道路\n[選路線] 平面道路=70, 高速公路=155/2 -> 高速公路\n整棵樹的期望效用: 155/2 = 77.50',
    },
    {
      id: 'e-network', title: '決策網路：看了預報再決定',
      description: 'Weather 與 Forecast 是機率節點、Plan 是決策節點、U(Plan, Weather) 是效用節點；對每個預報結果先用貝氏定理求天氣的後驗，再選期望效用最大的行動。',
      code: { Python: code`from fractions import Fraction as F

# 決策網路：機率節點 Weather、Forecast，決策節點 Plan，效用節點 U(Plan, Weather)
P = {'rain': F(2, 5), 'sun': F(3, 5)}
FC = {'rain': {'say_rain': F(4, 5), 'say_sun': F(1, 5)},   # P(Forecast | Weather)
      'sun': {'say_rain': F(1, 5), 'say_sun': F(4, 5)}}
U = {'indoor': {'rain': 60, 'sun': 40}, 'outdoor': {'rain': 0, 'sun': 100},
     'tent': {'rain': 50, 'sun': 80}}

def best_action(belief):
    eu = {a: sum(belief[s] * U[a][s] for s in sorted(belief)) for a in sorted(U)}
    a = max(sorted(eu), key=eu.get)
    return a, eu[a]

a0, meu = best_action(P)
print('不看預報:', a0, meu)
with_info = F(0)
for f in ['say_rain', 'say_sun']:
    joint = {s: P[s] * FC[s][f] for s in sorted(P)}       # P(Weather, Forecast=f)
    pf = sum(joint.values())                              # P(Forecast=f)
    post = {s: joint[s] / pf for s in sorted(joint)}      # 後驗 P(Weather | f)
    a, eu = best_action(post)
    print(f'{f}: P={pf} rain={post["rain"]} -> {a} {eu} = {float(eu):.2f}')
    with_info += pf * eu
print('看預報再決定:', with_info, '預報的資訊價值:', with_info - meu)` },
      output: '不看預報: tent 68\nsay_rain: P=11/25 rain=8/11 -> tent 640/11 = 58.18\nsay_sun: P=14/25 rain=1/7 -> outdoor 600/7 = 85.71\n看預報再決定: 368/5 預報的資訊價值: 28/5',
    },
    {
      id: 'e-vpi', title: '完美資訊的價值：何時為正、何時為零',
      description: '先對每種天氣取最好的行動再加權平均，減去現在就決定的 MEU；比較帳篷不是處處最好與處處最好的兩種效用表，再讓下雨的機率從 0 變到 1。',
      code: { Python: code`from fractions import Fraction as F

def vpi(P, U):
    """VPI = Σ_s P(s) max_a U(a, s) − max_a Σ_s P(s) U(a, s)"""
    eu = {a: sum(P[s] * U[a][s] for s in sorted(P)) for a in sorted(U)}
    meu = max(eu.values())
    perfect = sum(P[s] * max(U[a][s] for a in sorted(U)) for s in sorted(P))
    return meu, perfect, perfect - meu

P = {'rain': F(2, 5), 'sun': F(3, 5)}
cases = {
    '原本的帳篷問題': {'indoor': {'rain': 60, 'sun': 40},
                'outdoor': {'rain': 0, 'sun': 100}, 'tent': {'rain': 50, 'sun': 80}},
    '帳篷永遠最好': {'indoor': {'rain': 60, 'sun': 40},
                'outdoor': {'rain': 0, 'sun': 100}, 'tent': {'rain': 70, 'sun': 100}},
}
for name, U in cases.items():
    meu, perfect, value = vpi(P, U)
    print(f'{name}: MEU={meu} 完美資訊={perfect} VPI={value}')

# 雨的機率從 0 到 1：VPI 永遠不小於 0
for k in range(0, 11, 2):
    p = F(k, 10)
    print(f'P(rain)={float(p):.1f} VPI={vpi({"rain": p, "sun": 1 - p}, cases["原本的帳篷問題"])[2]}')` },
      output: '原本的帳篷問題: MEU=68 完美資訊=84 VPI=16\n帳篷永遠最好: MEU=88 完美資訊=88 VPI=0\nP(rain)=0.0 VPI=0\nP(rain)=0.2 VPI=12\nP(rain)=0.4 VPI=16\nP(rain)=0.6 VPI=14\nP(rain)=0.8 VPI=12\nP(rain)=1.0 VPI=0',
    },
  ],
  exercises: [
    {
      id: 'x-decision', title: '期望效用、最佳行動與資訊價值',
      statement: '讀入一個決策問題：世界可能處於幾種狀態，各有先驗機率；每個行動在每種狀態下有一個效用；另外可能有一項檢測（例如天氣預報或醫學檢驗），列出每個檢測結果在每種狀態下出現的機率 P(結果 | 狀態)。請計算每個行動的期望效用 EU = Σ P(狀態) × U(行動, 狀態)，找出最佳行動與最大期望效用 MEU；再計算完美資訊下的期望效用 Σ P(狀態) × max U(行動, 狀態)，以及 VPI = 它 − MEU。若有檢測，對每個結果 r 求 P(r) = Σ P(狀態) × P(r | 狀態) 與後驗 P(狀態 | r)，在後驗下選出最佳行動；把各結果的最佳期望效用以 P(r) 加權相加，得到「先做檢測再決定」的期望效用，減掉 MEU 就是這項檢測的資訊價值 VOI。期望效用相同時，取輸入中較早出現的行動（不是字典序最小的）。所有計算都要精確（建議用 fractions.Fraction），只在印出時轉成 4 位小數。',
      inputFormat: '第一行整數 S（狀態數），接著 S 行「狀態名稱 機率」。再一行整數 A（行動數），接著 A 行「行動名稱 U1 … US」，效用依狀態的輸入順序。再一行整數 T（檢測結果數，可以是 0），接著 T 行「結果名稱 L1 … LS」，Li 是 P(這個結果 | 第 i 個狀態)。數字可以寫成整數、小數或分數 a/b。空白行一律忽略。',
      outputFormat: '先依輸入順序印 A 行 `EU 行動 值`，接著 `best 行動 值`、`EU with perfect info 值`、`VPI 值`。若 T > 0，再依輸入順序對每個結果印 `if 結果 P=機率 -> 行動 值`；P(r) = 0 的結果印 `if 結果 P=0.0000 -> impossible`，不計入加總。最後印 `EU with test 值` 與 `VOI 值`。所有數值取 4 位小數。輸入不合法時整份輸出只有一行 `invalid input`：S、A 不是 1–8 的整數或 T 不是 0–8 的整數、行數不符、某行的數字個數不對、同一組裡名稱重複、數字無法解析、機率不在 0 到 1 之間、先驗加總不是 1、T > 0 時某個狀態下各結果的機率加總不是 1，或效用的絕對值超過 1000000。',
      constraints: ['1 ≤ S ≤ 8，1 ≤ A ≤ 8，0 ≤ T ≤ 8', '名稱是不含空白的字串', '先驗加總恰好為 1；T > 0 時，每個狀態下各結果的機率加總恰好為 1', '效用的絕對值不超過 1000000', '數值以 4 位小數印出'],
      samples: [
        { kind: 'normal', input: '2\nrain 2/5\nsun 0.6\n3\nindoor 60 40\noutdoor 0 100\ntent 50 80\n2\nsay_rain 4/5 1/5\nsay_sun 1/5 4/5\n', output: 'EU indoor 48.0000\nEU outdoor 60.0000\nEU tent 68.0000\nbest tent 68.0000\nEU with perfect info 84.0000\nVPI 16.0000\nif say_rain P=0.4400 -> tent 58.1818\nif say_sun P=0.5600 -> outdoor 85.7143\nEU with test 73.6000\nVOI 5.6000\n', note: '課文的帳篷問題：準確率 80% 的預報價值 5.6，小於完美資訊的 16；機率可以寫成分數或小數' },
        { kind: 'normal', input: '3\nboom 1/4\nflat 1/2\nbust 1/4\n3\nstocks 100 40 -60\nbonds 50 40 20\ncash 30 30 30\n0\n', output: 'EU stocks 30.0000\nEU bonds 37.5000\nEU cash 30.0000\nbest bonds 37.5000\nEU with perfect info 52.5000\nVPI 15.0000\n', note: '三種景氣、沒有檢測（T = 0）：效用可以是負的，只印到 VPI' },
      ],
      tests: [
        { kind: 'normal', input: '2\ndisease 1/10\nhealthy 9/10\n2\ntreat 90 85\nwait 20 100\n2\npositive 9/10 1/5\nnegative 1/10 4/5\n', output: 'EU treat 85.5000\nEU wait 92.0000\nbest wait 92.0000\nEU with perfect info 99.0000\nVPI 7.0000\nif positive P=0.2700 -> treat 86.6667\nif negative P=0.7300 -> wait 98.9041\nEU with test 95.6000\nVOI 3.6000\n', note: '醫學檢驗：不檢驗時觀察等待較好；檢驗陽性後改為治療，檢驗的資訊價值 3.6' },
        { kind: 'normal', input: '3\nlow 0.5\nmid 0.3\nhigh 0.2\n3\nsmall -10 20 30\nmedium -40 50 80\nlarge -120 40 200\n2\nsurvey_up 0.1 0.5 0.9\nsurvey_down 0.9 0.5 0.1\n', output: 'EU small 7.0000\nEU medium 11.0000\nEU large -8.0000\nbest medium 11.0000\nEU with perfect info 50.0000\nVPI 39.0000\nif survey_up P=0.3800 -> large 94.7368\nif survey_down P=0.6200 -> small -1.4516\nEU with test 35.1000\nVOI 24.1000\n', note: '三種需求、三個規模：調查結果不同，最佳行動也不同；某個結果下的最佳期望效用可以是負的' },
        { kind: 'edge', input: '2\nrain 1/2\nsun 1/2\n2\nwait 50 50\nact 0 100\n0\n', output: 'EU wait 50.0000\nEU act 50.0000\nbest wait 50.0000\nEU with perfect info 75.0000\nVPI 25.0000\n', note: '兩個行動平手：取輸入中較早的 wait，不是字典序較小的 act' },
        { kind: 'edge', input: '1\nsure 1\n2\nalpha 7\nbeta 3\n1\nping 1\n', output: 'EU alpha 7.0000\nEU beta 3.0000\nbest alpha 7.0000\nEU with perfect info 7.0000\nVPI 0.0000\nif ping P=1.0000 -> alpha 7.0000\nEU with test 7.0000\nVOI 0.0000\n', note: '只有一種狀態：沒有不確定性，任何資訊的價值都是 0' },
        { kind: 'edge', input: '2\nrain 2/5\nsun 3/5\n3\nindoor 60 40\noutdoor 0 100\ntent 70 100\n0\n', output: 'EU indoor 48.0000\nEU outdoor 60.0000\nEU tent 88.0000\nbest tent 88.0000\nEU with perfect info 88.0000\nVPI 0.0000\n', note: '帳篷在每種天氣下都最好：知道天氣也不會改變決定，VPI 為 0' },
        { kind: 'edge', input: '2\nrain 2/5\nsun 3/5\n3\nindoor 60 40\noutdoor 0 100\ntent 50 80\n2\ncoin_heads 1/2 1/2\ncoin_tails 1/2 1/2\n', output: 'EU indoor 48.0000\nEU outdoor 60.0000\nEU tent 68.0000\nbest tent 68.0000\nEU with perfect info 84.0000\nVPI 16.0000\nif coin_heads P=0.5000 -> tent 68.0000\nif coin_tails P=0.5000 -> tent 68.0000\nEU with test 68.0000\nVOI 0.0000\n', note: '擲硬幣當預報：結果與天氣無關，後驗等於先驗，VOI 為 0' },
        { kind: 'edge', input: '2\nrain 2/5\nsun 3/5\n3\nindoor 60 40\noutdoor 0 100\ntent 50 80\n2\noracle_rain 1 0\noracle_sun 0 1\n', output: 'EU indoor 48.0000\nEU outdoor 60.0000\nEU tent 68.0000\nbest tent 68.0000\nEU with perfect info 84.0000\nVPI 16.0000\nif oracle_rain P=0.4000 -> indoor 60.0000\nif oracle_sun P=0.6000 -> outdoor 100.0000\nEU with test 84.0000\nVOI 16.0000\n', note: '完全準確的檢測：VOI 等於 VPI' },
        { kind: 'edge', input: '2\nhere 1\nthere 0\n2\nstay 10 0\ngo 0 10\n2\nseen_here 1 0\nseen_there 0 1\n', output: 'EU stay 10.0000\nEU go 0.0000\nbest stay 10.0000\nEU with perfect info 10.0000\nVPI 0.0000\nif seen_here P=1.0000 -> stay 10.0000\nif seen_there P=0.0000 -> impossible\nEU with test 10.0000\nVOI 0.0000\n', note: '機率為 0 的狀態：seen_there 不可能出現，不能除以 P(r) = 0，印 impossible' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/3\n1\ngo 1 2\n0\n', output: 'invalid input\n', note: '先驗加總是 5/6，不是 1' },
        { kind: 'error', input: '2\nrain -1/5\nsun 6/5\n1\ngo 1 2\n0\n', output: 'invalid input\n', note: '加總是 1，但機率是負的、也大於 1' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/2\n2\ngo 1 2\nstay 5\n0\n', output: 'invalid input\n', note: 'stay 只有一個效用，應該有兩個' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/2\n1\ngo 1 2\n2\nyes 3/4 1/2\nno 1/4 1/4\n', output: 'invalid input\n', note: 'sun 之下兩個檢測結果的機率加總是 3/4，不是 1' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/2\n2\ngo 1 2\ngo 3 4\n0\n', output: 'invalid input\n', note: '行動名稱重複' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/2\n1\ngo abc 2\n0\n', output: 'invalid input\n', note: '效用不是數字' },
        { kind: 'error', input: '2\nrain 1/0\nsun 1/2\n1\ngo 1 2\n0\n', output: 'invalid input\n', note: '分母是 0 的機率' },
        { kind: 'error', input: '2\nrain 1/2\nsun 1/2\n1\ngo 1 2\n', output: 'invalid input\n', note: '少了檢測結果數 T 那一行' },
        { kind: 'error', input: '1\nonly 1\n1\ngo 2000000\n0\n', output: 'invalid input\n', note: '效用的絕對值超過 1000000' },
      ],
      hints: [
        '用 `Fraction(text)` 解析 `2/5`、`0.6`、`7`；遇到 `abc` 會丟出 ValueError、遇到 `1/0` 會丟出 ZeroDivisionError，捕捉後回報不合法。',
        '先驗加總要精確地等於 1：`Fraction(\'0.1\') * 10 == 1` 成立，浮點數的 `0.1 * 3 == 0.3` 卻是 False。',
        '寫一個函式 choose(belief)：回傳每個行動的期望效用與最佳行動。先驗與每個檢測結果的後驗都用它。',
        '完美資訊：對每個狀態先取所有行動中最大的效用，再以先驗加權相加。',
        '檢測結果 r：`joint = P(s) × P(r | s)`，P(r) 是 joint 的總和，後驗是 joint / P(r)；P(r) = 0 時不能除。',
        '平手規則：從第一個行動開始，只有嚴格大於目前的最佳值時才更換。',
      ],
      solution: { Python: code`import sys
from fractions import Fraction

def number(text):
    """整數、小數或 a/b；不是有限的數就回傳 None。"""
    try:
        return Fraction(text)
    except (ValueError, ZeroDivisionError, OverflowError):
        return None

def parse(lines):
    """回傳 (狀態, 先驗, 行動, 效用, 檢測結果, 概似)；格式不對就回傳 None。"""
    pos = 0
    def block(low, high, width):
        nonlocal pos
        if pos >= len(lines) or not lines[pos].isdigit() or not low <= int(lines[pos]) <= high:
            return None
        count, pos = int(lines[pos]), pos + 1
        rows = [line.split() for line in lines[pos:pos + count]]
        pos += count
        if len(rows) != count or any(len(r) != 1 + width for r in rows):
            return None
        names = [r[0] for r in rows]
        values = [[number(v) for v in r[1:]] for r in rows]
        if len(set(names)) != count or any(v is None for r in values for v in r):
            return None
        return names, values
    states = block(1, 8, 1)
    if states is None:
        return None
    n = len(states[0])
    actions = block(1, 8, n)
    tests = block(0, 8, n)
    if actions is None or tests is None or pos != len(lines):
        return None
    prior = [row[0] for row in states[1]]
    if any(not 0 <= p <= 1 for p in prior) or sum(prior) != 1:
        return None
    if any(abs(u) > 10 ** 6 for row in actions[1] for u in row):
        return None
    like = tests[1]
    if any(not 0 <= x <= 1 for row in like for x in row):
        return None
    if like and any(sum(row[i] for row in like) != 1 for i in range(n)):
        return None
    return states[0], prior, actions[0], actions[1], tests[0], like

def choose(names, utils, belief):
    """每個行動的期望效用，以及最佳行動（平手取輸入中較早的）。"""
    eus = [sum(b * u for b, u in zip(belief, row)) for row in utils]
    best = 0
    for i, eu in enumerate(eus):
        if eu > eus[best]:
            best = i
    return eus, names[best], eus[best]

fmt = lambda x: f'{float(x):.4f}'
parsed = parse([line.strip() for line in sys.stdin.read().splitlines() if line.strip()])
if parsed is None:
    print('invalid input')
else:
    states, prior, names, utils, results, like = parsed
    eus, best, meu = choose(names, utils, prior)
    for name, eu in zip(names, eus):
        print('EU', name, fmt(eu))
    print('best', best, fmt(meu))
    perfect = sum(p * max(row[i] for row in utils) for i, p in enumerate(prior))
    print('EU with perfect info', fmt(perfect))
    print('VPI', fmt(perfect - meu))
    if results:
        total = Fraction(0)
        for r, row in zip(results, like):
            joint = [p * x for p, x in zip(prior, row)]        # P(狀態, 結果=r)
            pr = sum(joint)
            if pr == 0:
                print('if', r, 'P=0.0000 -> impossible')
                continue
            _, a, eu = choose(names, utils, [j / pr for j in joint])
            print('if', r, f'P={fmt(pr)} ->', a, fmt(eu))
            total += pr * eu
        print('EU with test', fmt(total))
        print('VOI', fmt(total - meu))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'variable-state', title: '最大期望效用：逐一累加機率 × 效用，再取最大', language: 'Python',
    code: TRACE_CODE,
    steps: meuSteps(),
  },
  quiz: [
    {
      id: 'q-eu-code', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from fractions import Fraction as F
P = {'hit': F(1, 4), 'miss': F(3, 4)}
U = {'bold': {'hit': 100, 'miss': 0}, 'safe': {'hit': 30, 'miss': 30}}
eu = {a: sum(P[s] * U[a][s] for s in sorted(P)) for a in sorted(U)}
print(eu['bold'], max(sorted(eu), key=eu.get))` },
      options: ['25 safe', '25 bold', '50 bold', '30 safe'],
      answer: 0, explanation: 'EU(bold) = 1/4 × 100 + 3/4 × 0 = 25，EU(safe) = 1/4 × 30 + 3/4 × 30 = 30，最大的是 safe，所以印出 25 safe。「25 bold」算對了 bold 卻選了最大效用 100 所在的行動，忽略了它只有 1/4 的機會；「50 bold」把兩個結果當成各一半；「30 safe」選對了行動，但印的是 safe 的期望效用，題目印的是 eu[\'bold\']。',
    },
    {
      id: 'q-ce', prompt: '某人的效用函數是 U(x) = √x（x 是金額）。一張樂透有一半機會得到 3600 元、一半什麼都沒有。這張樂透的確定等值是多少？',
      options: ['1800 元', '900 元', '30 元', '60 元'],
      answer: 1, explanation: 'EU = 1/2 × √3600 + 1/2 × √0 = 1/2 × 60 = 30；確定等值 CE 滿足 U(CE) = 30，所以 CE = 30² = 900 元，低於期望金額 1800 元，風險貼水 900 元，反映凹效用的風險趨避。1800 元是期望金額，只有風險中立的人才以它為確定等值；30 是期望效用，不是金額；60 是得到 3600 元時的效用，忽略了一半什麼都沒有的機會。',
    },
    {
      id: 'q-affine', prompt: '把決策表中每個效用都換成 U\' = 3U − 20，其他都不變。最佳行動會怎樣？',
      options: ['可能改變，因為行動之間的差距被放大了三倍', '一定變成原本最差的行動，因為減掉 20 會讓排序反過來', '只有在出現負的效用時才可能改變', '不會改變：正的仿射轉換表示同一組偏好，每個期望效用都變成 3EU − 20，大小順序不變'],
      answer: 3, explanation: '期望值是線性的：Σ P(s)(3U(s) − 20) = 3 EU − 20，所有行動做同樣的遞增轉換，大小順序不變，這正是 vNM 定理說效用只決定到 aU + b（a > 0）的原因。差距放大三倍不改變誰最大；減掉同一個常數不會讓排序反過來；出現負數也一樣，轉換後的效用正負不影響比較。只有非線性的轉換（例如取平方）或乘上負數才可能改變選擇。',
    },
    {
      id: 'q-tree', prompt: '決策樹：選 A 會進入機率節點，1/2 機會得到效用 80，1/2 機會進入一個決策節點，在那裡可選 B1（效用 20）或 B2（機率節點：1/2 得 60、1/2 得 0）。選 C 直接得到效用 50。倒推後應該選什麼、期望效用多少？',
      options: ['A，52.5', '選 C，50', 'A，55', 'A，70'],
      answer: 2, explanation: '由下往上：B2 的期望效用是 1/2 × 60 + 1/2 × 0 = 30，大於 B1 的 20，所以那個決策節點的價值是 30；A 的期望效用是 1/2 × 80 + 1/2 × 30 = 55 > 50，選 A。「A，52.5」在決策節點把 B1 與 B2 取平均，但決策節點應取最大值；「選 C，50」低估了 A，例如在決策節點選了 B1 就只得 50，等於沒有選最好的；「A，70」在決策節點直接取了 60，忽略 B2 本身是機率節點。',
    },
    {
      id: 'q-network', prompt: '用決策網路評估「先看預報再決定」時，對每一個可能的預報結果 f，應該做什麼？',
      options: ['用貝氏網路推論求出 P(Weather | f)，對 Plan 的每個值算期望效用，選最大的', '仍用先驗 P(Weather) 算期望效用，預報只用來決定要不要出門', '只處理 P(f) 最大的那個預報結果，其他結果不必決定', '把 P(f | Weather) 直接當成天氣的機率代入期望效用'],
      answer: 0, explanation: '決策網路的評估是：設定證據 f，對決策節點的每個值用推論算出效用節點父節點（Weather）的後驗，再算期望效用取最大，每個 f 得到一個行動，合起來就是策略。只用先驗等於沒有用到預報；只處理最可能的結果會讓其他結果出現時沒有行動可用，也算不出資訊價值；P(f | Weather) 是概似，要經過貝氏定理正規化後才是天氣的後驗。',
    },
    {
      id: 'q-vpi', prompt: '兩種狀態各 1/2。行動 X 的效用是（10, 0），行動 Y 的效用是（4, 4）。完美資訊的價值 VPI 是多少？',
      options: ['7', '5', '0', '2'],
      answer: 3, explanation: '現在就決定：EU(X) = 5、EU(Y) = 4，MEU = 5。若事先知道狀態，第一種狀態選 X 得 10、第二種選 Y 得 4，期望效用 1/2 × 10 + 1/2 × 4 = 7，VPI = 7 − 5 = 2。7 是完美資訊下的期望效用，忘了減去 MEU；5 是 MEU 本身；0 是誤以為資訊不改變決定，但第二種狀態下最佳行動從 X 變成了 Y。',
    },
    {
      id: 'q-vpi-zero', prompt: '下列哪一種情況，某項資訊的價值一定是 0？',
      options: ['這項資訊非常準確，幾乎不會出錯', '不論這項資訊出現哪一種結果，最佳行動都和不知道時一樣', '這項資訊要付出很高的成本才能取得', '這項資訊會讓代理人對某些結果更悲觀'],
      answer: 1, explanation: '資訊的價值來自改變決定：若每一種結果下的最佳行動都和原本相同，Σ P(e) MEU(e) 就等於原本的 MEU，價值為 0（例如帳篷在任何天氣都最好）。準確的資訊若會改變決定，價值就是正的；成本高低不影響資訊本身的價值，只影響淨值（價值減成本）是否值得；讓代理人更悲觀的結果也可能讓它改選更好的行動，例如預報下雨時改到室內。',
    },
    {
      id: 'q-observed', prompt: '在帳篷問題中，不看預報時 MEU 是 68；看到「預報說會下雨」後，最佳期望效用變成約 58.18。下列說法哪一個正確？',
      options: ['這份預報的資訊價值是負的，以後不該看預報', '預報一定算錯了，因為多得到資訊不可能讓期望效用下降', 'VPI ≥ 0 是看之前對所有預報結果的平均；個別結果可以讓期望效用下降，平均起來看預報仍是 73.6 > 68', '應該忽略預報，繼續以 68 作為期望效用'],
      answer: 2, explanation: '資訊價值是在知道結果之前，對每個可能結果的 MEU(e) 以 P(e) 加權平均再減去 MEU：11/25 × 640/11 + 14/25 × 600/7 = 73.6，價值 5.6 > 0。壞消息讓評估更悲觀，但那是更準確的評估。說價值是負的，是把單一結果當成平均；說預報算錯，是誤解了 VPI ≥ 0 的意思；忽略預報繼續用 68，是在已知會下雨機率升到 8/11 時仍用過時的先驗。',
    },
  ],
};
