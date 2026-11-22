import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF11 命題邏輯與推論 (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs (the
 * exercise's yes/no answers were also checked against truth-table entailment).
 *
 * The visualization runs TRACE_CODE, which is the e-model-check example: truth-table model checking of
 * KB = (R → W) ∧ (S → W) ∧ (R ∨ S) against the queries W and R, over the 8 models in itertools.product order (the first
 * symbol changes slowest, False before True). modelCheckSteps() repeats that loop on the same symbols, filling one table
 * row per model; its last step's output is checked against TRACE_OUTPUT, the example's output, which the lesson test
 * compares with Python's real output.
 */
const TRACE_CODE = code`from itertools import product

symbols = ['R', 'S', 'W']     # R：下雨  S：灑水器開著  W：草地是濕的

def implies(a, b):
    return (not a) or b

def kb(m):                     # (R → W) ∧ (S → W) ∧ (R ∨ S)
    return implies(m['R'], m['W']) and implies(m['S'], m['W']) and (m['R'] or m['S'])

queries = {'W': lambda m: m['W'], 'R': lambda m: m['R']}
kb_models = 0
counter = {q: None for q in queries}          # 每個查詢的第一個反例
for values in product([False, True], repeat=len(symbols)):
    m = dict(zip(symbols, values))
    if not kb(m):
        continue                               # KB 為假的模型不影響蘊涵
    kb_models += 1
    for q, alpha in queries.items():
        if not alpha(m) and counter[q] is None:
            counter[q] = m                     # KB 為真、α 為假：反例
print('KB 的模型數:', kb_models, '/', 2 ** len(symbols))
for q in queries:
    if counter[q] is None:
        print(f'KB ⊨ {q}')
    else:
        bad = ' '.join(f'{s}={"T" if v else "F"}' for s, v in counter[q].items())
        print(f'KB ⊭ {q}，反例 {bad}')`;
const TRACE_OUTPUT = 'KB 的模型數: 3 / 8\nKB ⊨ W\nKB ⊭ R，反例 R=F S=T W=T';

type Model = Record<'R' | 'S' | 'W', boolean>;
const SYMBOLS = ['R', 'S', 'W'] as const;
const implies = (a: boolean, b: boolean) => !a || b;
const QUERIES: [string, (m: Model) => boolean][] = [['W', m => m.W], ['R', m => m.R]];
const COLS = ['R', 'S', 'W', 'KB', 'α₁ = W', 'α₂ = R'];
const tf = (v: boolean) => (v ? 'T' : 'F');
const modelText = (m: Model) => SYMBOLS.map(s => `${s}=${tf(m[s])}`).join(' ');
/** How Python shows the model dict in the variables panel. */
const pyDict = (m: Model) => `{${SYMBOLS.map(s => `'${s}': ${m[s] ? 'True' : 'False'}`).join(', ')}}`;
function lineOf(text: string): number {
  const i = TRACE_CODE.split('\n').findIndex(l => l.includes(text));
  if (i < 0) throw new Error(`AIF11: the trace code has no line with ${text}`);
  return i + 1;
}
/** Which conjuncts of the KB a model breaks. */
function broken(m: Model): string[] {
  const out: string[] = [];
  if (!implies(m.R, m.W)) out.push('R → W（下雨但草地沒濕）');
  if (!implies(m.S, m.W)) out.push('S → W（灑水但草地沒濕）');
  if (!(m.R || m.S)) out.push('R ∨ S（既沒下雨也沒灑水）');
  return out;
}

function modelCheckSteps(): TraceStep[] {
  const n = SYMBOLS.length, rows = 2 ** n;
  const cells: string[][] = Array.from({ length: rows }, () => COLS.map(() => ''));
  const rowLabels = Array.from({ length: rows }, (_, i) => `m${i}`);
  const counter: Record<string, Model | null> = { W: null, R: null };
  const kbRows: number[] = [];
  const steps: TraceStep[] = [];
  const table = (marks: { at: [number, number]; kind: Mark }[]) =>
    ({ name: '真值表（每一列是一個模型）', cells: cells.map(r => [...r]), marks, rowLabels, colLabels: COLS });
  const vars = (extra: Record<string, string>) => ({ ...extra, kb_models: String(kbRows.length),
    "counter['W']": counter.W ? pyDict(counter.W) : 'None', "counter['R']": counter.R ? pyDict(counter.R) : 'None' });
  steps.push({ line: lineOf('counter = {'), arrays: [table([])], vars: vars({ symbols: "['R', 'S', 'W']" }),
    note: `3 個命題符號有 2^3 = ${rows} 個模型，表格每一列是一個模型，一開始全部空白。KB = (R → W) ∧ (S → W) ∧ (R ∨ S)：「下雨草地會濕、灑水草地會濕、而且不是下雨就是在灑水」。兩個查詢：α₁ = W（草地濕了嗎）、α₂ = R（下過雨嗎）。counter 記錄每個查詢的第一個反例，None 表示還沒找到。` });
  for (let i = 0; i < rows; i++) {
    const values = SYMBOLS.map((_, k) => ((i >> (n - 1 - k)) & 1) === 1);
    const m = Object.fromEntries(SYMBOLS.map((s, k) => [s, values[k]])) as Model;
    values.forEach((v, k) => { cells[i][k] = tf(v); });
    const bad = broken(m);
    cells[i][3] = tf(!bad.length);
    if (bad.length) {
      cells[i][4] = cells[i][5] = '—';
      steps.push({ line: lineOf('continue'), arrays: [table([{ at: [i, 3], kind: 'write' }])], vars: vars({ m: pyDict(m) }),
        note: `模型 m${i}（${modelText(m)}）：${bad.join('、')}不成立，所以 KB 為假，continue。KB 為假的模型不在 KB 的模型集合裡，α 在這裡是真是假都不影響蘊涵，兩個查詢欄填「—」。` });
      continue;
    }
    kbRows.push(i);
    const marks: { at: [number, number]; kind: Mark }[] = [{ at: [i, 3], kind: 'found' }];
    const found: string[] = [];
    QUERIES.forEach(([q, alpha], k) => {
      const v = alpha(m);
      cells[i][4 + k] = tf(v);
      if (!v && counter[q] === null) { counter[q] = m; found.push(q); marks.push({ at: [i, 4 + k], kind: 'bad' }); }
      else marks.push({ at: [i, 4 + k], kind: 'write' });
    });
    const verdicts = QUERIES.map(([q, alpha]) => `${q} 為 ${tf(alpha(m))}`).join('、');
    steps.push({ line: found.length ? lineOf('counter[q] = m') : lineOf('if not alpha(m)'), arrays: [table(marks)], vars: vars({ m: pyDict(m) }),
      note: `模型 m${i}（${modelText(m)}）：三個合取項都成立，KB 為真，這是 KB 的第 ${kbRows.length} 個模型。接著檢查查詢：${verdicts}。` +
        (found.length ? `KB 為真而 ${found.join('、')} 為假，這一列就是反例：存進 counter['${found[0]}']，KB ⊭ ${found[0]} 已經確定。` : '兩個查詢在這一列都沒有出現反例。') });
  }
  /** The model's row: product() counts in binary with the first symbol as the high bit. */
  const rowOf = (m: Model) => SYMBOLS.reduce((acc, s) => acc * 2 + (m[s] ? 1 : 0), 0);
  const finalMarks = (): { at: [number, number]; kind: Mark }[] => [...kbRows.map(r => ({ at: [r, 3] as [number, number], kind: 'found' as Mark })),
    ...QUERIES.flatMap(([q], k) => { const c = counter[q]; return c ? [{ at: [rowOf(c), 4 + k] as [number, number], kind: 'bad' as Mark }] : []; })];
  let output = `KB 的模型數: ${kbRows.length} / ${rows}`;
  steps.push({ line: lineOf("print('KB 的模型數"), arrays: [table(finalMarks())], vars: vars({}), output,
    note: `${rows} 個模型都看完了。KB 只在 ${kbRows.map(r => `m${r}`).join('、')} 這 ${kbRows.length} 列為真，其他 ${rows - kbRows.length} 列在 continue 就跳過了。蘊涵只看這 ${kbRows.length} 列。` });
  for (const [q] of QUERIES) {
    const c = counter[q];
    output += c ? `\nKB ⊭ ${q}，反例 ${modelText(c)}` : `\nKB ⊨ ${q}`;
    steps.push({ line: c ? lineOf("print(f'KB ⊭") : lineOf("print(f'KB ⊨"), arrays: [table(finalMarks())], vars: vars({ q }), output,
      note: c ? `counter['${q}'] 是 ${modelText(c)}：這個模型讓 KB 為真、${q} 為假，所以 KB ⊭ ${q}。知識庫允許「沒下雨、只是灑水」這種情況，沒辦法斷定下過雨；但 KB 也沒有排除下雨（m${kbRows[kbRows.length - 1]} 的 R 是 T），所以 ¬${q} 也推不出來：答案是「不知道」。`
        : `counter['${q}'] 仍是 None：KB 的 ${kbRows.length} 個模型裡 ${q} 都是 T，所以 KB ⊨ ${q}。我們不知道是下雨還是灑水，卻能確定草地是濕的，這就是分情況推理（reasoning by cases）。` });
  }
  if (output !== TRACE_OUTPUT) throw new Error(`AIF11: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  return steps;
}

export const AIF11: LessonContent = {
  lessonId: 'AIF11',
  motivation: 'AIF10 把知識寫成三元組、框架與規則，查詢時沿著邊走、往上繼承。但「從已知可以推出什麼」要嚴格到電腦能檢查，就需要邏輯：一套規定語句怎麼寫（語法）、語句在什麼情況下為真（語意），以及怎麼從已知的語句推出新語句（推論）的規則。命題邏輯（propositional logic）是其中最簡單的一種，卻已經能回答很實際的問題：知道「下雨草地會濕、灑水草地也會濕、而且不是下雨就是在灑水」，能不能斷定草地是濕的？能不能斷定下過雨？這一課用 F06 學過的且、或、非出發，學會以命題與連接詞寫下知識、用真值表與模型定義真假，用模型檢查判斷蘊涵（entailment）、可滿足性與有效性；再學不必列舉所有模型的推論方法：modus ponens 等推論規則、把語句轉成合取範式（CNF）後用歸結（resolution）反證，以及專家系統與 Prolog 背後、對 Horn 子句非常有效率的前向鏈結與後向鏈結。',
  sections: [
    {
      id: 'syntax-semantics', title: '命題與連接詞：語法與語意',
      blocks: [
        { type: 'p', text: '命題（proposition）是一個可以判斷真假的敘述，例如「現在下雨」「草地是濕的」。命題邏輯不管命題的內容，只用符號代表它：R 代表下雨、W 代表草地濕。語法（syntax）規定哪些符號串是合法的語句（sentence）：每個原子命題符號、True 與 False 都是語句；若 α、β 是語句，用五個連接詞（connective）組起來的 ¬α、α ∧ β、α ∨ β、α → β、α ↔ β 也是語句。優先順序由高到低是 ¬、∧、∨、→、↔，所以 ¬P ∨ Q ∧ R 讀作 (¬P) ∨ (Q ∧ R)；不確定時就加括號，和 F06 寫組合條件的習慣一樣。' },
        { type: 'table', head: ['連接詞', '名稱與讀法', 'Python 寫法', '何時為真'], rows: [
          ['¬P', '否定（not）', '`not p`', 'P 為假時'],
          ['P ∧ Q', '合取（and）', '`p and q`', '兩個都真'],
          ['P ∨ Q', '析取（or，可兼）', '`p or q`', '至少一個為真'],
          ['P → Q', '蘊含（implies），「若 P 則 Q」', '`(not p) or q`', '除了 P 真、Q 假之外都為真'],
          ['P ↔ Q', '雙條件（iff），「P 若且唯若 Q」', '`p == q`', 'P、Q 真假相同'],
        ] },
        { type: 'p', text: '語意（semantics）規定語句的真假。一個模型（model）就是給每個命題符號指定 True 或 False 的一種方式，也可以想成「世界可能的一種樣子」；n 個符號共有 2^n 個模型。給定模型，任何語句的真假都能由內往外，依上表的真值表（truth table）一層一層算出來。下面的範例把 P、Q 的 4 個模型列成真值表，並比較 P → Q 和它的逆否命題、逆命題。' },
        { type: 'example', id: 'e-truth-table' },
        { type: 'p', text: 'P → Q 只有在「P 真、Q 假」那一列為假，所以它和 ¬P ∨ Q 的真值表完全一樣，程式裡就用 `(not p) or q` 計算。逆否命題 ¬Q → ¬P 的欄位和 P → Q 一模一樣，兩者等價（logically equivalent）；逆命題 Q → P 在第三列（P 假、Q 真）不同，所以不等價。「兩個語句在每個模型中真假都相同」就是等價的定義，F06 的德摩根定律 ¬(P ∧ Q) ≡ ¬P ∨ ¬Q 也能用同樣的方式驗證。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把 → 讀成因果，或以為前提為假時整句為假', text: '邏輯的 → 是實質蘊含（material implication），只說「不會出現 P 真而 Q 假」，不表示 P 造成 Q，也不要求兩者有關。所以前提為假時 P → Q 一律為真：「如果 2 是奇數，那麼月亮是方的」在命題邏輯裡是真的。另一個常見錯誤是把 P → Q 當成 Q → P：「下雨草地會濕」不代表「草地濕了就是下過雨」，真值表的第三列就是反例。' },
      ],
    },
    {
      id: 'entailment', title: '蘊涵、可滿足性與有效性',
      blocks: [
        { type: 'p', text: '知識庫（knowledge base，KB）是一組語句，視為全部用 ∧ 連起來。讓語句 α 為真的所有模型記作 M(α)。KB 蘊涵（entail）α，寫作 KB ⊨ α，意思是「KB 為真的每一個模型，α 也為真」，也就是 M(KB) ⊆ M(α)。直覺上，KB 每多一條語句，就排除一些可能的世界；剩下的世界若全都滿足 α，α 就是知識庫的必然結論。注意 ⊨ 和 → 不同：→ 是語句裡的連接詞，⊨ 是兩個語句之間、對所有模型而言的關係。' },
        { type: 'table', head: ['概念', '定義', '例子'], rows: [
          ['有效（valid，又稱恆真式 tautology）', '在所有模型中都為真', 'P ∨ ¬P；((P → Q) ∧ P) → Q'],
          ['可滿足（satisfiable）', '至少在一個模型中為真', 'P → Q（4 個模型中 3 個為真）'],
          ['不可滿足（unsatisfiable）', '在任何模型中都為假', 'P ∧ ¬P'],
          ['蘊涵 KB ⊨ α', 'KB 為真的每個模型，α 都為真', '{P → Q, P} ⊨ Q'],
          ['等價 α ≡ β', '每個模型中兩者真假相同', 'P → Q ≡ ¬P ∨ Q'],
        ] },
        { type: 'p', text: '這幾個概念可以互相轉換，後面的方法都建立在這些轉換上：α 有效若且唯若 ¬α 不可滿足；KB ⊨ α 若且唯若 KB → α 有效（演繹定理，deduction theorem）；KB ⊨ α 若且唯若 KB ∧ ¬α 不可滿足。最後一個就是反證法（proof by contradiction）：假設結論不成立，若和知識庫放在一起找不到任何可能的世界，結論就必然成立。判斷一個語句是否可滿足的問題叫 SAT，是 Cook 在 1971 年證明的第一個 NP-complete 問題。' },
        { type: 'example', id: 'e-validity' },
        { type: 'p', text: '範例用同一個函式列舉模型，數出語句為真的有幾個：全部為真是有效、全部為假是不可滿足、其他是可滿足但不是有效。((P → Q) ∧ P) → Q 有效，說的正是「知道 P → Q 與 P，就能推出 Q」永遠成立；(P → Q) → (Q → P) 不是有效的，因為逆命題不一定成立。最後兩行對 KB = (P → Q) ∧ (Q → R) ∧ P 與 α = R 檢查了兩種等價的寫法：KB → R 在 8 個模型中都為真，KB ∧ ¬R 一個模型都沒有，所以 KB ⊨ R。' },
      ],
    },
    {
      id: 'model-checking', title: '模型檢查：列舉 2^n 個模型判斷蘊涵',
      blocks: [
        { type: 'p', text: '依照蘊涵的定義，最直接的判斷方法就是模型檢查（model checking）：列舉所有模型，挑出 KB 為真的那些，逐一檢查 α 是否也為真；只要找到一個「KB 為真而 α 為假」的模型，它就是反例，KB ⊭ α；一個反例都沒有，KB ⊨ α。下面的程式就是這樣做的，知識庫是：下雨（R）草地會濕（W）、灑水器開著（S）草地也會濕，而且不是下雨就是在灑水。程式對兩個查詢 W 與 R 各記錄第一個反例。' },
        { type: 'example', id: 'e-model-check' },
        { type: 'p', text: '8 個模型中只有 3 個讓 KB 為真，W 在這 3 個模型裡都為真，所以 KB ⊨ W：雖然不知道是下雨還是灑水，但兩種情況草地都會濕，這叫分情況推理（reasoning by cases）。R 則不被蘊涵，反例是「沒下雨、只灑水」；而且也有 KB 的模型讓 R 為真，所以 ¬R 也推不出來，正確的回答是「不知道」。下方的視覺化逐列填出這張真值表。' },
        { type: 'table', head: ['命題符號數 n', '模型數 2^n', '每秒檢查一百萬個模型需要'], rows: [
          ['3', '8', '瞬間'],
          ['20', '1,048,576', '約 1 秒'],
          ['40', '約 1.1 × 10^12', '約 13 天'],
          ['50', '約 1.1 × 10^15', '約 36 年'],
        ] },
        { type: 'p', text: '模型檢查對命題邏輯是可靠（sound）且完備（complete）的：它說蘊涵成立就一定成立，蘊涵成立時也一定找得到答案，因為模型的數量有限。代價是時間：每多一個符號，模型數就加倍，時間是 O(2^n)，記憶體卻只要 O(n)，因為一次只需要一個模型。實務上的 SAT 求解器（例如 1962 年發表的 DPLL 演算法及其後代）會在列舉途中提早判斷、剪掉不可能的分支，在許多實際問題上能處理數十萬個以上的符號，但最壞情況仍是指數時間。' },
        { type: 'callout', tone: 'note', title: '洞穴探險的例子', text: 'AI 教科書常用一個洞穴探險遊戲：某些格子有坑，坑的鄰格會感到微風。用 B11 表示格子 [1,1] 有微風、P12 與 P21 表示它的兩個鄰格有坑，規則是 B11 ↔ (P12 ∨ P21)。代理人站在 [1,1] 沒感到微風（¬B11），模型檢查就能確認 KB ⊨ ¬P12：在 B11 為假、規則成立的模型裡，兩個鄰格都沒有坑，可以安全地走過去。' },
      ],
    },
    {
      id: 'inference-rules', title: '推論規則：可靠性與證明',
      blocks: [
        { type: 'p', text: '模型檢查要看所有模型；推論（inference）則像寫證明，從知識庫的語句出發，一步一步套用推論規則，得到新的語句，寫作 KB ⊢ α。推論程序有兩個重要性質：可靠（sound）是只會推出被蘊涵的語句，不會從真的前提推出假的結論；完備（complete）是每個被蘊涵的語句都推得出來。一條推論規則可靠，等於「前提全為真的每個模型，結論也為真」，所以可以用真值表檢查。' },
        { type: 'table', head: ['規則', '從', '推出', '可靠嗎'], rows: [
          ['modus ponens（肯定前件）', 'P → Q，P', 'Q', '可靠'],
          ['and-elimination（且消去）', 'P ∧ Q', 'P（也可以推出 Q）', '可靠'],
          ['modus tollens（否定後件）', 'P → Q，¬Q', '¬P', '可靠'],
          ['雙條件消去', 'P ↔ Q', '(P → Q) ∧ (Q → P)', '可靠（兩邊等價）'],
          ['肯定後件（謬誤）', 'P → Q，Q', 'P', '不可靠'],
          ['否定前件（謬誤）', 'P → Q，¬P', '¬Q', '不可靠'],
        ] },
        { type: 'example', id: 'e-rules' },
        { type: 'p', text: '兩個謬誤的反例都是 P 假、Q 真：前提都成立，結論卻是假的。可靠的規則可以串成證明。知識庫是 A ∧ B、A → C、(B ∧ C) → D，要證明 D：' },
        { type: 'table', head: ['步驟', '語句', '理由'], rows: [
          ['1', 'A ∧ B', '知識庫'],
          ['2', 'A', 'and-elimination，由 1'],
          ['3', 'B', 'and-elimination，由 1'],
          ['4', 'C', 'modus ponens，由 2 與 A → C'],
          ['5', 'B ∧ C', 'and-introduction（且引入），由 3、4'],
          ['6', 'D', 'modus ponens，由 5 與 (B ∧ C) → D'],
        ] },
        { type: 'p', text: '找證明可以看成 AIF04 的搜尋問題：狀態是目前已知的語句集合，動作是套用一條規則，目標是得到 α。證明只寫出相關的 6 步，不必看 2^4 = 16 個模型；符號很多而證明很短時，這就是推論常常比模型檢查快得多的原因。命題邏輯是單調的（monotonic）：知識庫加入新語句，原本推得出的結論仍然推得出；這和 AIF10 企鵝例子的預設推理（加入新事實反而撤回結論）不同。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：肯定後件', text: '「下雨草地會濕；草地濕了；所以下過雨」聽起來很合理，卻是不可靠的推論：灑水器也會讓草地濕。這正是上一段模型檢查裡 KB ⊭ R 的原因。醫療與故障診斷特別容易犯這個錯：「感冒會發燒，他發燒了，所以他感冒了」。從結果推回原因需要機率推理（之後的貝氏定理課），不能用 modus ponens 反著用。' },
      ],
    },
    {
      id: 'cnf-resolution', title: '合取範式（CNF）與歸結',
      blocks: [
        { type: 'p', text: '文字（literal）是一個命題符號或它的否定，例如 P、¬Q；子句（clause）是幾個文字的析取，例如 ¬R ∨ W；合取範式（conjunctive normal form，CNF）是幾個子句的合取。每個命題邏輯語句都能轉成等價的 CNF，步驟如下：' },
        { type: 'list', ordered: true, items: [
          '消去 ↔：α ↔ β 換成 (α → β) ∧ (β → α)。',
          '消去 →：α → β 換成 ¬α ∨ β。',
          '把 ¬ 往內推到符號前面：用德摩根定律 ¬(α ∧ β) ≡ ¬α ∨ ¬β、¬(α ∨ β) ≡ ¬α ∧ ¬β，以及雙重否定 ¬¬α ≡ α。',
          '用分配律把 ∨ 分配到 ∧ 上：α ∨ (β ∧ γ) 換成 (α ∨ β) ∧ (α ∨ γ)。',
        ] },
        { type: 'table', head: ['步驟', '洞穴規則 B11 ↔ (P12 ∨ P21) 的變化'], rows: [
          ['1. 消去 ↔', '(B11 → (P12 ∨ P21)) ∧ ((P12 ∨ P21) → B11)'],
          ['2. 消去 →', '(¬B11 ∨ P12 ∨ P21) ∧ (¬(P12 ∨ P21) ∨ B11)'],
          ['3. ¬ 往內推', '(¬B11 ∨ P12 ∨ P21) ∧ ((¬P12 ∧ ¬P21) ∨ B11)'],
          ['4. 分配律', '(¬B11 ∨ P12 ∨ P21) ∧ (¬P12 ∨ B11) ∧ (¬P21 ∨ B11)'],
        ] },
        { type: 'p', text: '歸結（resolution）規則只有一條：兩個子句中，一個含有文字 ℓ、另一個含有 ¬ℓ，就可以推出把這對互補文字去掉、其餘文字合併的新子句（歸結式，resolvent）。例如 {¬R, W} 與 {R, S} 歸結出 {S, W}。modus ponens 是它的特例：{¬P, Q}（即 P → Q）與 {P} 歸結出 {Q}。歸結反證（resolution refutation）把 KB 與 ¬α 都轉成子句，不斷加入新的歸結式：導出空子句（沒有任何文字、永遠為假）代表 KB ∧ ¬α 不可滿足，所以 KB ⊨ α；再也產生不出新子句而沒有空子句，代表 KB ⊭ α。Robinson 在 1965 年提出歸結原理，它對反證是完備的：只要 KB ⊨ α，一定找得到空子句。' },
        { type: 'example', id: 'e-resolution' },
        { type: 'p', text: '程式用 `~` 表示否定，子句是文字的 frozenset。證明 W 時加入 {~W}，第 8 個歸結式就是空子句；真正用到的只有其中 3 步：{~R, W} 與 {R, S} 得 {S, W}，再和 {~S, W} 得 {W}，最後和 {~W} 得空子句。其他歸結式是「把所有配對都試一遍」順帶產生的，實務上會用策略（例如每一步都至少用到一個來自 ¬α 的子句）減少浪費。證明 R 時，產生 4 個新子句之後就沒有新東西了，沒有空子句，所以 KB ⊭ R，和模型檢查的結論一致。程式也略過恆真子句（同時含 X 與 ~X），因為它在每個模型都為真，對反證沒有幫助。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：一次消去兩對互補文字', text: '{P, Q} 與 {¬P, ¬Q} 有兩對互補文字，直覺上想一次全部消掉，得到空子句，結論是「兩者矛盾」。這是錯的：P 真、Q 假的模型同時滿足兩個子句。正確的歸結一次只消去一對，得到 {Q, ¬Q} 或 {P, ¬P}，兩者都是恆真子句，沒有用處。範例的 resolve 函式對每一對互補文字各產生一個歸結式，正是為了避免這個錯誤。' },
      ],
    },
    {
      id: 'horn-chaining', title: 'Horn 子句：前向鏈結與後向鏈結',
      blocks: [
        { type: 'p', text: '很多知識庫只需要「若這些條件都成立，則某個結論成立」這種規則。Horn 子句（Horn clause）是最多只有一個正文字的子句；恰好有一個正文字的叫確定子句（definite clause），可以寫成規則 A ∧ B → C，或者單獨一個事實 C。沒有正文字的子句 ¬A ∨ ¬B 等於 A ∧ B → False，常用來表示目標或限制。只含確定子句的知識庫，蘊涵可以在和知識庫大小成線性的時間內判斷，不必面對 2^n 個模型。' },
        { type: 'table', head: ['子句', '寫成規則', '種類'], rows: [
          ['¬A ∨ ¬B ∨ C', 'A ∧ B → C', '確定子句（規則）'],
          ['C', 'True → C', '確定子句（事實）'],
          ['¬A ∨ ¬B', 'A ∧ B → False', 'Horn 子句，沒有正文字（目標或限制）'],
          ['R ∨ S', '無法寫成單一結論的規則', '不是 Horn 子句（兩個正文字）'],
        ] },
        { type: 'p', text: '前向鏈結（forward chaining）由資料驅動：從已知事實出發，每條規則記錄還有幾個前提沒成立（count）；一個符號第一次成立時，把含有它的規則的 count 減 1，減到 0 就把結論排進待辦（agenda）。每個符號只處理一次，直到沒有新事實（不動點，fixed point）。後向鏈結（backward chaining）由目標驅動：要證明 q，若 q 是事實就成功；否則找結論是 q 的規則，遞迴證明它的每個前提。正在證明的目標若在同一條路上再次出現，就是迴圈，必須放棄這條路，否則會無限遞迴。兩者對確定子句都是可靠且完備的。' },
        { type: 'example', id: 'e-chaining' },
        { type: 'p', text: '前向鏈結把能推出的全部推出來，包括和 safe_mode 無關的 umbrella；後向鏈結只碰和目標有關的規則，但沒有記錄已證明的子目標，所以 dark 被證明了兩次。證明 ice 時，ice 需要 cold_road，cold_road 又需要 ice，path 檢查發現迴圈就放棄，結果是 False；前向鏈結也同樣推不出 ice，因為這兩條規則沒有任何事實支撐。1972 年出現的 Prolog 語言就是以後向鏈結（加上一階邏輯的變數）執行程式。' },
        { type: 'table', head: ['', '前向鏈結', '後向鏈結'], rows: [
          ['起點', '已知事實', '要回答的目標'],
          ['方向', '條件 → 結論', '結論 → 條件'],
          ['適合', '持續收到新資料、要知道所有後果（監控、專家系統）', '回答特定問題（診斷、查詢、Prolog）'],
          ['多餘的工作', '會推出和問題無關的事實', '可能重複證明同一個子目標（可以加記憶表）'],
          ['迴圈', '每個符號只加入一次，自然停止', '要檢查目前路徑上的目標'],
        ] },
        { type: 'p', text: 'Horn 子句的代價是表達能力：模型檢查那一段的 R ∨ S 有兩個正文字，不是 Horn 子句；只靠前向鏈結，從 R → W、S → W 與 R ∨ S 推不出 W，要用能做分情況推理的方法，例如模型檢查或歸結。本課的練習以「輪」實作前向鏈結：第 0 輪是事實，每一輪觸發前提在上一輪結束時都已成立的規則，輪數就是推出這個事實最少要幾層推論。' },
        { type: 'callout', tone: 'tip', title: '練習的檢查方法', text: '寫完前向鏈結後，可以用本課的真值表程式驗證：對每個查詢列舉所有模型，看「每個子句（事實與規則）都成立的模型中，查詢是否都為真」。對確定子句，兩種方法的 yes／no 必須完全一致；練習的測資就是這樣交叉檢查過的。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-truth-table', title: '五個連接詞的真值表，以及逆否命題與逆命題',
      description: '列出 P、Q 的 4 個模型下每個連接詞的值；P → Q 用 (not p) or q 計算，再檢查它和 ¬Q → ¬P、Q → P 是否等價。',
      code: { Python: code`from itertools import product

def implies(a, b):
    return (not a) or b          # 實質蘊含：只有「前真後假」才是假

def tf(v):
    return 'T' if v else 'F'

columns = {
    '¬P': lambda p, q: not p,
    'P∧Q': lambda p, q: p and q,
    'P∨Q': lambda p, q: p or q,
    'P→Q': lambda p, q: implies(p, q),
    'P↔Q': lambda p, q: p == q,
    '¬Q→¬P': lambda p, q: implies(not q, not p),   # 逆否命題
    'Q→P': lambda p, q: implies(q, p),             # 逆命題
}
print('P Q | ' + ' '.join(f'{name:>5}' for name in columns))
for p, q in product([True, False], repeat=2):
    cells = ' '.join(f'{tf(f(p, q)):>5}' for f in columns.values())
    print(f'{tf(p)} {tf(q)} | {cells}')

same = all(implies(p, q) == implies(not q, not p) for p, q in product([True, False], repeat=2))
print('P→Q 與 ¬Q→¬P 等價:', same)
print('P→Q 與 Q→P 等價:', all(implies(p, q) == implies(q, p) for p, q in product([True, False], repeat=2)))` },
      output: 'P Q |    ¬P   P∧Q   P∨Q   P→Q   P↔Q ¬Q→¬P   Q→P\nT T |     F     T     T     T     T     T     T\nT F |     F     F     T     F     F     F     T\nF T |     T     F     T     T     F     T     F\nF F |     T     F     F     T     T     T     T\nP→Q 與 ¬Q→¬P 等價: True\nP→Q 與 Q→P 等價: False',
    },
    {
      id: 'e-validity', title: '有效、可滿足與不可滿足：數出為真的模型',
      description: '同一個函式列舉 2^n 個模型並分類語句；最後以兩種等價的方式確認 KB ⊨ R：KB → R 有效、KB ∧ ¬R 不可滿足。',
      code: { Python: code`from itertools import product

def implies(a, b):
    return (not a) or b

def classify(symbols, sentence):
    """列舉 2^n 個模型，數出語句為真的有幾個。"""
    rows = [dict(zip(symbols, v)) for v in product([False, True], repeat=len(symbols))]
    t, n = sum(1 for m in rows if sentence(m)), len(rows)
    if t == n:
        return f'有效（valid）：{t}/{n} 個模型為真'
    if t == 0:
        return f'不可滿足（unsatisfiable）：{t}/{n} 個模型為真'
    return f'可滿足但不是有效：{t}/{n} 個模型為真'

sentences = [
    ('P ∨ ¬P', ['P'], lambda m: m['P'] or not m['P']),
    ('P ∧ ¬P', ['P'], lambda m: m['P'] and not m['P']),
    ('P → Q', ['P', 'Q'], lambda m: implies(m['P'], m['Q'])),
    ('((P → Q) ∧ P) → Q', ['P', 'Q'], lambda m: implies(implies(m['P'], m['Q']) and m['P'], m['Q'])),
    ('(P → Q) → (Q → P)', ['P', 'Q'], lambda m: implies(implies(m['P'], m['Q']), implies(m['Q'], m['P']))),
]
for text, symbols, sentence in sentences:
    print(f'{text:20} {classify(symbols, sentence)}')

# KB = (P → Q) ∧ (Q → R) ∧ P，α = R
def kb(m):
    return implies(m['P'], m['Q']) and implies(m['Q'], m['R']) and m['P']

syms = ['P', 'Q', 'R']
print('KB → R  ', classify(syms, lambda m: implies(kb(m), m['R'])))
print('KB ∧ ¬R ', classify(syms, lambda m: kb(m) and not m['R']))` },
      output: 'P ∨ ¬P               有效（valid）：2/2 個模型為真\nP ∧ ¬P               不可滿足（unsatisfiable）：0/2 個模型為真\nP → Q                可滿足但不是有效：3/4 個模型為真\n((P → Q) ∧ P) → Q    有效（valid）：4/4 個模型為真\n(P → Q) → (Q → P)    可滿足但不是有效：3/4 個模型為真\nKB → R   有效（valid）：8/8 個模型為真\nKB ∧ ¬R  不可滿足（unsatisfiable）：0/8 個模型為真',
    },
    {
      id: 'e-model-check', title: '真值表模型檢查：草地濕了，是下過雨嗎？',
      description: '列舉 R、S、W 的 8 個模型，只看 KB 為真的模型；對每個查詢記錄第一個「KB 真而查詢假」的反例。',
      code: { Python: TRACE_CODE },
      output: TRACE_OUTPUT,
    },
    {
      id: 'e-rules', title: '用真值表檢查推論規則是否可靠',
      description: '前提全為真的每個模型裡結論也為真，規則才可靠；否則印出第一個反例。',
      code: { Python: code`from itertools import product

def implies(a, b):
    return (not a) or b

def sound(premises, conclusion):
    """前提全為真的每個模型裡，結論也為真，才可靠；否則回傳第一個反例。"""
    for p, q in product([True, False], repeat=2):
        if all(f(p, q) for f in premises) and not conclusion(p, q):
            return f'不可靠，反例 P={"T" if p else "F"} Q={"T" if q else "F"}'
    return '可靠（sound）'

rules = [
    ('P→Q, P ⊢ Q', 'modus ponens', [lambda p, q: implies(p, q), lambda p, q: p], lambda p, q: q),
    ('P∧Q ⊢ P', 'and-elimination', [lambda p, q: p and q], lambda p, q: p),
    ('P→Q, ¬Q ⊢ ¬P', 'modus tollens', [lambda p, q: implies(p, q), lambda p, q: not q], lambda p, q: not p),
    ('P→Q, Q ⊢ P', '肯定後件', [lambda p, q: implies(p, q), lambda p, q: q], lambda p, q: p),
    ('P→Q, ¬P ⊢ ¬Q', '否定前件', [lambda p, q: implies(p, q), lambda p, q: not p], lambda p, q: not q),
]
for text, name, premises, conclusion in rules:
    print(f'{text:14} {name}：{sound(premises, conclusion)}')` },
      output: 'P→Q, P ⊢ Q     modus ponens：可靠（sound）\nP∧Q ⊢ P        and-elimination：可靠（sound）\nP→Q, ¬Q ⊢ ¬P   modus tollens：可靠（sound）\nP→Q, Q ⊢ P     肯定後件：不可靠，反例 P=F Q=T\nP→Q, ¬P ⊢ ¬Q   否定前件：不可靠，反例 P=F Q=T',
    },
    {
      id: 'e-resolution', title: '歸結反證：加入 ¬α，找空子句',
      description: '子句是文字的 frozenset，依序對每一對子句歸結並加入新子句；導出空子句代表蘊涵成立，沒有新子句可加代表不成立。',
      code: { Python: code`def neg(lit):
    return lit[1:] if lit.startswith('~') else '~' + lit

def show(clause):
    return '{' + ', '.join(sorted(clause, key=lambda x: (x.lstrip('~'), x))) + '}' if clause else '{}（空子句）'

def resolve(a, b):
    """對每一對互補文字各做一次歸結；一次只消去一對。"""
    return [(a - {x}) | (b - {neg(x)}) for x in sorted(a) if neg(x) in b]

def refute(clauses):
    """不斷加入新的歸結式，直到導出空子句（蘊涵成立）或沒有新子句（不成立）。"""
    clauses = [frozenset(c) for c in clauses]
    i = 0
    while i < len(clauses):
        for j in range(i):
            for r in resolve(clauses[j], clauses[i]):
                if any(neg(x) in r for x in r) or r in clauses:
                    continue                    # 恆真子句或已有的子句：略過
                clauses.append(r)
                print(f'  {show(clauses[j])} + {show(clauses[i])} => {show(r)}')
                if not r:
                    return True
        i += 1
    return False

kb = [{'~R', 'W'}, {'~S', 'W'}, {'R', 'S'}]    # (R → W) ∧ (S → W) ∧ (R ∨ S) 的 CNF
for query in ['W', 'R']:
    print(f'證明 KB ⊨ {query}：加入 {show({neg(query)})}')
    print('  結果：' + ('蘊涵成立' if refute(kb + [{neg(query)}]) else '無法導出空子句，蘊涵不成立'))` },
      output: '證明 KB ⊨ W：加入 {~W}\n  {~R, W} + {R, S} => {S, W}\n  {~S, W} + {R, S} => {R, W}\n  {~R, W} + {~W} => {~R}\n  {~S, W} + {~W} => {~S}\n  {~S, W} + {S, W} => {W}\n  {~W} + {S, W} => {S}\n  {~W} + {R, W} => {R}\n  {~W} + {W} => {}（空子句）\n  結果：蘊涵成立\n證明 KB ⊨ R：加入 {~R}\n  {~R, W} + {R, S} => {S, W}\n  {~S, W} + {R, S} => {R, W}\n  {R, S} + {~R} => {S}\n  {~S, W} + {S, W} => {W}\n  結果：無法導出空子句，蘊涵不成立',
    },
    {
      id: 'e-chaining', title: '前向鏈結（count 與 agenda）與後向鏈結（含迴圈檢查）',
      description: '同一組確定子句：前向鏈結依推出的順序印出所有事實；後向鏈結以縮排印出目標的證明樹，遇到正在證明的目標就放棄。',
      code: { Python: code`from collections import deque

rules = [(['rain'], 'wet_road'), (['rain'], 'umbrella'),   # (前提, 結論)
         (['night'], 'dark'), (['wet_road', 'dark'], 'slow_down'),
         (['dark'], 'headlights'), (['slow_down', 'headlights'], 'safe_mode'),
         (['ice'], 'cold_road'), (['cold_road', 'wet_road'], 'ice')]
facts = ['rain', 'night']

def forward():
    count = [len(p) for p, _ in rules]     # 每條規則還有幾個前提沒成立
    known, order, agenda = set(), [], deque(facts)
    while agenda:
        p = agenda.popleft()
        if p in known:
            continue
        known.add(p)
        order.append(p)
        for k, (premises, head) in enumerate(rules):
            if p in premises:
                count[k] -= 1
                if count[k] == 0:          # 前提全部成立：結論排進待辦
                    agenda.append(head)
    return order

def backward(goal, path=()):
    pad = '  ' * len(path)
    if goal in facts:
        print(f'{pad}{goal}：事實')
        return True
    if goal in path:                       # 正在證明 goal 的路上又遇到 goal
        print(f'{pad}{goal}：迴圈，放棄這條路')
        return False
    print(f'{pad}{goal}?')
    return any(all(backward(p, path + (goal,)) for p in premises)
               for premises, head in rules if head == goal)

print('前向鏈結:', ' '.join(forward()))
for goal in ['safe_mode', 'ice']:
    print(f'後向鏈結，目標 {goal}：')
    print('結果:', backward(goal))` },
      output: '前向鏈結: rain night wet_road umbrella dark slow_down headlights safe_mode\n後向鏈結，目標 safe_mode：\nsafe_mode?\n  slow_down?\n    wet_road?\n      rain：事實\n    dark?\n      night：事實\n  headlights?\n    dark?\n      night：事實\n結果: True\n後向鏈結，目標 ice：\nice?\n  cold_road?\n    ice：迴圈，放棄這條路\n結果: False',
    },
  ],
  exercises: [
    {
      id: 'x-forward-chaining', title: 'Horn 子句知識庫的前向鏈結',
      statement: '讀入一個只含確定子句的知識庫，用前向鏈結推出所有能推出的命題，並回答查詢。每個子句一行，是一個事實 `X`，或一條規則 `A B ... -> C`：箭頭左邊是一個以上的前提，右邊恰好一個結論，意思是「前提全部成立時，結論成立」。名稱以英文字母開頭，之後只能是英文字母、數字或底線，區分大小寫；`->` 前後要有空白。請以「輪」進行：第 0 輪是所有事實；第 r 輪（r ≥ 1）觸發所有「前提在第 r − 1 輪結束時都已成立、結論還沒成立」的規則，它們的結論在第 r 輪成立；某一輪沒有新結論就停止。一個命題的輪數就是它第一次成立的那一輪。',
      inputFormat: '第一行整數 N，接著 N 行子句。再一行整數 Q，接著 Q 行查詢，每行一個名稱。結尾的空行會被忽略，`\\r` 也會被忽略。',
      outputFormat: '第一行是 `derived:` 加上所有成立的命題，每個寫成 `名稱:輪數`，依輪數由小到大、同一輪依名稱的字元順序（Python 的 `sorted`，大寫字母排在小寫前面）排序，以一個空白分隔；沒有任何命題成立時印 `derived: none`。接著每個查詢印一行 `名稱: yes` 或 `名稱: no`。查詢行不是恰好一個合法名稱時，那一行印 `bad query`，其餘照常回答。若 N 或 Q 不是 0–100、0–50 的整數，某個子句不合格式（規則沒有前提、箭頭右邊不是恰好一個名稱、出現兩個箭頭、沒有箭頭卻不是單一名稱、名稱含有不允許的字元），或行數和 N、Q 不符：整份輸入只印一行 `invalid input`。',
      constraints: ['0 ≤ N ≤ 100，0 ≤ Q ≤ 50', '每條規則的前提可以重複，結論可以和某個事實相同', '規則可以互相依賴成環，程式必須停下來', '只用 Python 標準函式庫；印出的集合要先排序'],
      samples: [
        { kind: 'normal', input: '9\nrain\nnight\nrain -> wet_road\nnight -> dark\nwet_road dark -> slow_down\ndark -> headlights\nslow_down headlights -> safe_mode\nice -> cold_road\ncold_road wet_road -> ice\n3\nsafe_mode\nice\numbrella\n', output: 'derived: night:0 rain:0 dark:1 wet_road:1 headlights:2 slow_down:2 safe_mode:3\nsafe_mode: yes\nice: no\numbrella: no\n', note: '路況規則：safe_mode 要到第 3 輪才推得出；ice 與 cold_road 互相依賴，沒有事實支撐，推不出' },
        { kind: 'normal', input: '4\na\na -> b\nb -> c\nc -> d\n2\nd\ne\n', output: 'derived: a:0 b:1 c:2 d:3\nd: yes\ne: no\n', note: '一條鏈：每輪只多推出一個' },
      ],
      tests: [
        { kind: 'normal', input: '6\nA\nB\nA -> L\nL -> N\nB N -> M\nA M -> P\n4\nP\nM\nN\nZ\n', output: 'derived: A:0 B:0 L:1 N:2 M:3 P:4\nP: yes\nM: yes\nN: yes\nZ: no\n', note: '前提在不同輪成立：P 要等最晚成立的前提 M（第 3 輪），所以在第 4 輪' },
        { kind: 'normal', input: '6\na\nb\na -> x\nx -> y\ny -> goal\nb -> goal\n2\ngoal\ny\n', output: 'derived: a:0 b:0 goal:1 x:1 y:2\ngoal: yes\ny: yes\n', note: '同一個結論有兩條規則：取先觸發的那一輪（較短的推導）' },
        { kind: 'normal', input: '5\nfever\ncough\nfever cough -> flu_like\nflu_like rash -> measles\nflu_like -> rest\n3\nflu_like\nmeasles\nrest\n', output: 'derived: cough:0 fever:0 flu_like:1 rest:2\nflu_like: yes\nmeasles: no\nrest: yes\n', note: '只有部分前提成立的規則不觸發' },
        { kind: 'edge', input: '0\n2\nrain\nwet\n', output: 'derived: none\nrain: no\nwet: no\n', note: '沒有任何子句：什麼都推不出，查詢一律 no' },
        { kind: 'edge', input: '2\np -> q\nq -> p\n2\np\nq\n', output: 'derived: none\np: no\nq: no\n', note: '規則互相依賴成環但沒有事實：不會無限迴圈，什麼都推不出' },
        { kind: 'edge', input: '5\nb\na\na\na a -> b\nb -> c\n3\nb\nc\na\n', output: 'derived: a:0 b:0 c:1\nb: yes\nc: yes\na: yes\n', note: '事實也是某條規則的結論：仍是第 0 輪；重複的事實與重複的前提不影響結果' },
        { kind: 'edge', input: '2\nx\nx -> y\n0\n', output: 'derived: x:0 y:1\n', note: '沒有查詢：只印 derived 一行' },
        { kind: 'edge', input: '2\nRain\nrain -> wet\n2\nwet\nRain\n', output: 'derived: Rain:0\nwet: no\nRain: yes\n', note: '名稱區分大小寫：Rain 與 rain 是不同的命題' },
        { kind: 'edge', input: '2\r\nsun\r\nsun -> warm\r\n1\r\nwarm\r\n\r\n\n', output: 'derived: sun:0 warm:1\nwarm: yes\n', note: '結尾的空行與 Windows 換行會被忽略' },
        { kind: 'error', input: '2\nsun\nsun -> warm\n4\nwarm\nsun warm\n9lives\nsun\n', output: 'derived: sun:0 warm:1\nwarm: yes\nbad query\nbad query\nsun: yes\n', note: '查詢行不是單一個合法名稱：該行印 bad query，其餘照常回答' },
        { kind: 'error', input: '2\na\n-> c\n1\nc\n', output: 'invalid input\n', note: '規則沒有前提（`-> c`）：整份輸入不合格式' },
        { kind: 'error', input: '2\na\na -> b c\n1\nb\n', output: 'invalid input\n', note: '箭頭右邊有兩個名稱：本題的規則只能有一個結論，整份輸入不合格式' },
        { kind: 'error', input: '2\na b\na -> c\n1\nc\n', output: 'invalid input\n', note: '沒有箭頭卻有兩個名稱：既不是事實也不是規則' },
        { kind: 'error', input: '2\na-b\na-b -> c\n1\nc\n', output: 'invalid input\n', note: '名稱含有不允許的字元' },
        { kind: 'error', input: 'three\na\na -> b\nb -> c\n1\nc\n', output: 'invalid input\n', note: '子句個數不是整數' },
        { kind: 'error', input: '1\na\n2\na\n', output: 'invalid input\n', note: '宣告 2 個查詢，只給 1 個' },
        { kind: 'error', input: '101\na\n0\n', output: 'invalid input\n', note: '子句個數超過 100' },
      ],
      hints: [
        '先寫 parse：任何格式問題都回傳 None，主程式只要印 `invalid input`。把每個子句存成 (前提串列, 結論)，事實的前提串列是空的。',
        '用 dict 記錄每個命題的輪數。每一輪先用「上一輪結束時的 dict」算出這一輪的新結論集合，算完再一起寫入，才不會在同一輪裡連鎖觸發。',
        '某一輪沒有新結論就停：已成立的命題不會再加入，所以規則成環也會停下來。',
        '排序用 `sorted(items, key=lambda kv: (kv[1], kv[0]))`：先比輪數，再比名稱。',
        '用本課的真值表程式交叉檢查：對確定子句，前向鏈結推得出的命題，正好是在所有「每條子句都成立」的模型中都為真的命題。',
      ],
      solution: { Python: code`import re
import sys

SYMBOL = re.compile(r'[A-Za-z][A-Za-z0-9_]*')

def is_symbol(token):
    return SYMBOL.fullmatch(token) is not None

def parse_clause(line):
    """事實 X 回傳 ([], X)，規則 A B -> C 回傳 ([A, B], C)；格式不對回傳 None。"""
    tokens = line.split()
    if '->' not in tokens:
        return ([], tokens[0]) if len(tokens) == 1 and is_symbol(tokens[0]) else None
    if tokens.count('->') != 1 or len(tokens) < 3 or tokens[-2] != '->':
        return None
    premises, head = tokens[:-2], tokens[-1]
    if not all(is_symbol(t) for t in premises + [head]):
        return None
    return premises, head

def parse(lines):
    while lines and not lines[-1].strip():
        lines.pop()                         # 忽略結尾的空行
    def number(i, limit):
        text = lines[i].strip() if i < len(lines) else ''
        if not re.fullmatch(r'[0-9]+', text) or int(text) > limit:
            return None
        return int(text)
    n = number(0, 100)
    if n is None or len(lines) < 2 + n:
        return None
    clauses = [parse_clause(line) for line in lines[1:1 + n]]
    q = number(1 + n, 50)
    if None in clauses or q is None or len(lines) != 2 + n + q:
        return None
    return clauses, lines[2 + n:]

def forward_rounds(clauses):
    """第 0 輪是事實；每一輪觸發「前提在上一輪結束時都已知」的規則。"""
    rounds = {head: 0 for premises, head in clauses if not premises}
    r = 0
    while True:
        r += 1
        new = {head for premises, head in clauses
               if premises and head not in rounds and all(p in rounds for p in premises)}
        if not new:
            return rounds
        for head in new:
            rounds[head] = r

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None:
    print('invalid input')
else:
    clauses, queries = parsed
    rounds = forward_rounds(clauses)
    items = sorted(rounds.items(), key=lambda kv: (kv[1], kv[0]))
    print('derived:', ' '.join(f'{s}:{r}' for s, r in items) if items else 'none')
    for line in queries:
        tokens = line.split()
        if len(tokens) != 1 or not is_symbol(tokens[0]):
            print('bad query')
        else:
            print(f'{tokens[0]}: {"yes" if tokens[0] in rounds else "no"}')` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'dp-table', title: '真值表模型檢查：逐列填出 8 個模型', language: 'Python',
    code: TRACE_CODE,
    steps: modelCheckSteps(),
  },
  quiz: [
    {
      id: 'q-material', prompt: '「如果明天下雨，我就帶傘」寫成 P → Q（P：明天下雨，Q：我帶傘）。結果明天沒下雨，而我帶了傘。依命題邏輯，P → Q 在這個模型中的真值是？',
      options: ['假，因為沒下雨卻帶了傘，和這句話不符', '無法判斷，因為前提沒有發生', '真：前提為假時 P → Q 一律為真', '真，但只是因為 Q 為真；若我沒帶傘就為假'],
      answer: 2, explanation: 'P → Q 只有在 P 真、Q 假時為假；這裡 P 假、Q 真，所以為真。而且前提為假時，不論 Q 真假整句都為真。「和這句話不符」把 → 誤讀成「只有下雨才帶傘」（那是 Q → P）；「無法判斷」錯在命題邏輯的每個模型都有確定的真值；「只是因為 Q 為真」錯在 P 假、Q 假的模型中 P → Q 也是真的。',
    },
    {
      id: 'q-count-models', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`from itertools import product
count = 0
for p, q, r in product([False, True], repeat=3):
    if (p or q) and (not p or r):
        count += 1
print(count)` },
      options: ['4', '3', '5', '8'],
      answer: 0, explanation: '數的是 (P ∨ Q) ∧ (¬P ∨ R) 為真的模型數。P 真時第二項要求 R 真，Q 任意，有 2 個；P 假時第一項要求 Q 真，R 任意，又 2 個；共 4 個（已執行確認）。8 是全部的模型數，等於把語句當成有效；3 漏掉了 P 真、Q 假、R 真這個模型（以為 P ∨ Q 一定要靠 Q 成立）；5 多算了 P 真、R 假這種讓 ¬P ∨ R 為假的模型。',
    },
    {
      id: 'q-entail-equiv', prompt: '下列哪一個條件和「KB ⊨ α」等價？',
      options: ['KB ∧ α 是可滿足的', '至少有一個 KB 為真的模型讓 α 為真', 'KB → α 是可滿足的', 'KB ∧ ¬α 是不可滿足的'],
      answer: 3, explanation: 'KB ⊨ α 表示 KB 為真的每個模型 α 都為真，也就是不存在「KB 真而 α 假」的模型，這正是 KB ∧ ¬α 不可滿足，歸結反證就靠這個等價。「KB ∧ α 可滿足」和「至少一個模型讓 α 為真」只說 α 和 KB 不衝突，本課的 R 就是反例：KB ∧ R 可滿足，KB 卻不蘊涵 R；「KB → α 可滿足」太弱，要的是 KB → α 有效（每個模型都為真）。',
    },
    {
      id: 'q-unsound', prompt: '知識庫有「若灑水器開著（S），草地就會濕（W）」。下列推論何者不可靠（unsound）？',
      options: ['由 S ∧ W 推出 S（and-elimination）', '由 S → W 與 W 推出 S', '由 S → W 與 S 推出 W（modus ponens）', '由 S → W 與 ¬W 推出 ¬S（modus tollens）'],
      answer: 1, explanation: '由 S → W 與 W 推出 S 是「肯定後件」的謬誤：S 假、W 真（例如下雨淋濕了草地）的模型讓兩個前提都為真、結論為假。and-elimination、modus ponens 與 modus tollens 在 e-rules 範例中都檢查過：前提全為真的每個模型，結論也為真，所以都可靠。',
    },
    {
      id: 'q-cnf', prompt: 'P → (Q ∧ R) 轉成 CNF 的正確結果是？',
      options: ['(P ∨ Q) ∧ (P ∨ R)', '¬P ∧ (Q ∨ R)', '(¬P ∨ Q) ∧ (¬P ∨ R)', '¬P ∨ Q ∨ R'],
      answer: 2, explanation: '先消去 → 得到 ¬P ∨ (Q ∧ R)，再用分配律得到 (¬P ∨ Q) ∧ (¬P ∨ R)；8 個模型逐一比對，只有這個選項和原句等價（已用程式確認）。(P ∨ Q) ∧ (P ∨ R) 漏了消去 → 時的否定；¬P ∧ (Q ∨ R) 把 ∨ 和 ∧ 的位置弄反了；¬P ∨ Q ∨ R 把 Q ∧ R 換成 Q ∨ R，P 真、Q 真、R 假時它為真，原句卻為假。',
    },
    {
      id: 'q-resolve-two', prompt: '對子句 {P, Q} 與 {¬P, ¬Q} 做一次歸結，正確的結果是？',
      options: ['空子句：兩對互補文字一起消去，所以兩個子句矛盾', '不能歸結，因為歸結要求恰好只有一對互補文字', '{P, ¬P}，接著它和自己歸結就得到空子句', '{Q, ¬Q} 或 {P, ¬P}：都是恆真子句，對證明沒有幫助'],
      answer: 3, explanation: '歸結一次只消去一對互補文字：消去 P 得 {Q, ¬Q}，消去 Q 得 {P, ¬P}，兩者在每個模型都為真，是恆真子句，不能用來導出矛盾。「空子句」錯在一次消去兩對，而且 P 真、Q 假的模型同時滿足兩個子句，它們並不矛盾；「不能歸結」錯在規則只要求有一對互補文字，有兩對時可以分別對其中一對歸結；{P, ¬P} 與自己歸結得到的仍是 {P, ¬P} 這類恆真子句，不會是空子句。',
    },
    {
      id: 'q-chaining', prompt: '知識庫有上百條和目前問題無關的確定子句，使用者只問「safe_mode 成立嗎？」。下列敘述何者正確？',
      options: ['後向鏈結從目標往回找，只會碰到結論和目標有關的規則；前向鏈結會推出所有能推出的事實', '前向鏈結一定比後向鏈結快，因為它的時間和知識庫大小成線性', '後向鏈結不必檢查迴圈，因為確定子句不會互相依賴', '前向鏈結對 Horn 子句不可靠，只有真值表才可靠'],
      answer: 0, explanation: '後向鏈結是目標驅動的，只展開結論是目前目標的規則，所以和 safe_mode 無關的規則不會被碰到；前向鏈結是資料驅動的，會把所有能推出的事實都推出來，例如範例中的 umbrella。「線性所以一定比較快」錯在線性是對整個知識庫而言，只問一個目標時後向鏈結常常碰到的規則少得多；確定子句可以成環（範例的 ice 與 cold_road），後向鏈結必須檢查目前路徑；前向鏈結對確定子句是可靠且完備的。',
    },
    {
      id: 'q-horn', prompt: '下列哪一個子句不是 Horn 子句？',
      options: ['¬A ∨ ¬B ∨ C', 'A ∨ B ∨ ¬C', '¬A ∨ ¬B', 'D'],
      answer: 1, explanation: 'Horn 子句最多只有一個正文字。A ∨ B ∨ ¬C 有 A、B 兩個正文字，不是 Horn 子句；它等於 C → A ∨ B，結論是析取，不能寫成單一結論的規則。¬A ∨ ¬B ∨ C 有一個正文字，是確定子句 A ∧ B → C；¬A ∨ ¬B 沒有正文字，是 A ∧ B → False 這種目標或限制子句；D 是只有一個正文字的事實。',
    },
  ],
};
