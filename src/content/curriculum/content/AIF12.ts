import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF12 一階邏輯 (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * The visualization runs UNIFY_CODE, which is also example e-unify: unification with a to-do list of pairs, walk
 * through the bindings already in θ and the occurs check, on three pairs (a most general unifier, an occurs-check
 * failure, a clash). unifySteps() below repeats that program's loop on the same terms in the same order, so every pair,
 * binding and printed line comes from actually running it; the printed lines are checked against UNIFY_OUTPUT, which
 * the lesson test compares with Python's real output.
 */
type Term = string | Term[];
type Theta = Map<string, Term>;

const UNIFY_CODE = code`def is_var(t):
    return isinstance(t, str) and t[0].islower()  # 小寫開頭是變數

def walk(t, theta):
    while is_var(t) and t in theta:  # 沿著已有的綁定往下找
        t = theta[t]
    return t

def occurs(v, t, theta):
    t = walk(t, theta)
    return t == v or (isinstance(t, tuple) and any(occurs(v, a, theta) for a in t[1:]))

def show(t, theta):
    t = walk(t, theta)
    if isinstance(t, tuple):
        return t[0] + '(' + ', '.join(show(a, theta) for a in t[1:]) + ')'
    return t

def unify(s, t):
    theta, todo = {}, [(s, t)]
    while todo:
        a, b = todo.pop(0)
        a, b = walk(a, theta), walk(b, theta)
        if a == b:
            continue
        if is_var(b) and not is_var(a):
            a, b = b, a  # 讓變數在左邊
        if is_var(a):
            if occurs(a, b, theta):
                return None, f'occurs check: {a} in {show(b, theta)}'
            theta[a] = b
        elif isinstance(a, tuple) and isinstance(b, tuple) and a[0] == b[0] and len(a) == len(b):
            todo = list(zip(a[1:], b[1:])) + todo  # 引數一對一對放到最前面
        else:
            return None, f'clash: {show(a, theta)} vs {show(b, theta)}'
    return theta, ''

pairs = [(('Loves', 'x', ('Mother', 'x')), ('Loves', 'Ann', 'y')),
         (('Loves', 'z', 'z'), ('Loves', 'w', ('Mother', 'w'))),
         (('Parent', 'Ann', 'x'), ('Parent', 'Bob', 'Cid'))]
for s, t in pairs:
    theta, why = unify(s, t)
    head = show(s, {}) + ' = ' + show(t, {})
    if theta is None:
        print(head, '-> fail,', why)
    else:
        print(head, '-> {' + ', '.join(f'{v}/{show(v, theta)}' for v in sorted(theta)) + '}')`;
const UNIFY_OUTPUT = "Loves(x, Mother(x)) = Loves(Ann, y) -> {x/Ann, y/Mother(Ann)}\nLoves(z, z) = Loves(w, Mother(w)) -> fail, occurs check: w in Mother(w)\nParent(Ann, x) = Parent(Bob, Cid) -> fail, clash: Ann vs Bob";
const UNIFY_PAIRS: [Term, Term][] = [
  [['Loves', 'x', ['Mother', 'x']], ['Loves', 'Ann', 'y']],
  [['Loves', 'z', 'z'], ['Loves', 'w', ['Mother', 'w']]],
  [['Parent', 'Ann', 'x'], ['Parent', 'Bob', 'Cid']],
];
/** Lines of UNIFY_CODE: each is checked below to hold the statement it stands for. */
const L = { start: 20, pop: 23, same: 25, swap: 27, occurs: 30, bind: 31, split: 33, clash: 35, done: 36, printFail: 45, printOk: 47 };
const LINE_HOLDS: Record<keyof typeof L, string> = { start: 'theta, todo = {}', pop: 'a, b = walk(a, theta)', same: 'continue', swap: 'a, b = b, a',
  occurs: "return None, f'occurs check", bind: 'theta[a] = b', split: 'todo = list(zip', clash: "return None, f'clash", done: "return theta, ''",
  printFail: "'-> fail,'", printOk: "'-> {'" };

const isVar = (t: Term): t is string => typeof t === 'string' && /^[a-z]/.test(t);
const sameTerm = (a: Term, b: Term) => JSON.stringify(a) === JSON.stringify(b);
function walk(t: Term, theta: Theta): Term {
  let w = t;
  while (isVar(w) && theta.has(w)) w = theta.get(w)!;
  return w;
}
function occurs(v: string, t: Term, theta: Theta): boolean {
  const w = walk(t, theta);
  return w === v || (Array.isArray(w) && w.slice(1).some(a => occurs(v, a, theta)));
}
function show(t: Term, theta: Theta): string {
  const w = walk(t, theta);
  return Array.isArray(w) ? `${w[0] as string}(${w.slice(1).map(a => show(a, theta)).join(', ')})` : w;
}
/** A term as it is written, without applying any binding. */
const raw = (t: Term) => show(t, new Map());

function unifySteps(): TraceStep[] {
  const codeLines = UNIFY_CODE.split('\n');
  for (const [key, line] of Object.entries(L)) if (!codeLines[line - 1].includes(LINE_HOLDS[key as keyof typeof L])) throw new Error(`AIF12: trace line ${line} is not ${key}`);
  const steps: TraceStep[] = [];
  let output = '';
  for (const [s, t] of UNIFY_PAIRS) {
    const theta: Theta = new Map();
    let todo: [Term, Term][] = [[s, t]];
    const head = `${raw(s)} = ${raw(t)}`;
    const push = (line: number, note: string, extra: Record<string, string>, mark?: { v: string; kind: Mark }) => steps.push({
      line, note,
      vars: { s: raw(s), t: raw(t), ...extra, todo: `[${todo.map(([a, b]) => `${raw(a)} = ${raw(b)}`).join(', ')}]`, theta: `{${[...theta].map(([v, x]) => `${v}: ${raw(x)}`).join(', ')}}` },
      table: { name: 'θ：目前的替換（substitution）', head: ['變數', 'θ 裡存的值', '完全代入後'], rows: [...theta].map(([v, x]) => [v, raw(x), show(v, theta)]),
        marks: mark ? [{ row: [...theta.keys()].indexOf(mark.v), kind: mark.kind }] : [] },
      ...(output ? { output: output.trimEnd() } : {}),
    });
    push(L.start, `開始合一 ${head}。θ 是空的替換，todo 是「還要讓它們相等」的項對，一開始只有整個式子這一對。`, {});
    let why = '';
    while (todo.length) {
      const [a0, b0] = todo.shift()!;
      let a = walk(a0, theta), b = walk(b0, theta);
      const walked = ([[a0, a], [b0, b]] as [Term, Term][]).filter(([x, y]) => !sameTerm(x, y));
      push(L.pop, `取出 todo 最前面的一對 ${raw(a0)} = ${raw(b0)}，再用 walk 查 θ。${walked.length
        ? walked.map(([x, y]) => `${raw(x)} 已經綁定，walk 沿著 θ 把它換成 ${raw(y)}`).join('；') + '：之前的決定要算數，不能把同一個變數再綁成別的值。'
        : 'walk 只看最外層是不是已綁定的變數，這兩邊都不是，保持原樣。'}`, { a: raw(a), b: raw(b) });
      if (sameTerm(a, b)) { push(L.same, `兩邊已經完全相同，這一對不需要任何綁定，跳過。`, { a: raw(a), b: raw(b) }); continue; }
      if (isVar(b) && !isVar(a)) {
        [a, b] = [b, a];
        push(L.swap, `右邊的 ${raw(a)} 是變數、左邊不是：交換，讓變數在左邊，後面只要處理「變數 = 項」一種寫法。`, { a: raw(a), b: raw(b) });
      }
      if (isVar(a)) {
        if (occurs(a, b, theta)) {
          why = `occurs check: ${a} in ${show(b, theta)}`;
          push(L.occurs, `${a} 要等於 ${show(b, theta)}，但 ${a} 就出現在 ${show(b, theta)} 裡面。沒有任何有限的項滿足 ${a} = ${show(b, theta)}：代進去會變成 Mother(Mother(Mother(…)))，永遠寫不完，等於要求「有人是自己的母親」。occurs check 讓合一失敗；少了它，程式會綁出一個無窮的項。`, { a: raw(a), b: raw(b) });
          break;
        }
        theta.set(a, b);
        const applied = show(a, theta) !== raw(b) ? `θ 存的是 ${raw(b)}，裡面的變數已經有值，完全代入後是 ${show(a, theta)}；程式不急著改寫，印出時 show 才一路代入。` : '';
        push(L.bind, `${a} 是還沒綁定的變數，occurs check 通過（${a} 不在 ${show(b, theta)} 裡），θ 加入 ${a}/${raw(b)}。${applied}`, { a: raw(a), b: raw(b) }, { v: a, kind: 'write' });
      } else if (Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a.length === b.length) {
        const bb = b;
        todo = [...a.slice(1).map((x, i): [Term, Term] => [x, bb[i + 1]]), ...todo];
        push(L.split, `兩邊都是 ${a[0] as string}(…)，符號相同、引數都是 ${a.length - 1} 個：要相等，就必須每個位置的引數都相等。把引數一對一對放到 todo 最前面，由左到右處理。`, { a: raw(a), b: raw(b) });
      } else {
        why = `clash: ${show(a, theta)} vs ${show(b, theta)}`;
        push(L.clash, `${show(a, theta)} 與 ${show(b, theta)} 是兩個不同的常數：常數代表固定的物件，沒有任何替換能讓它們相等（不同的函數符號或不同的引數個數也一樣），合一失敗（clash）。`, { a: raw(a), b: raw(b) });
        break;
      }
    }
    const ok = !why;
    if (ok) push(L.done, `todo 空了：每一對都處理完，代入 θ 之後兩邊完全相同。θ 只綁定了非綁不可的變數，所以是最一般合一子（most general unifier, MGU）。`, {});
    const printed = ok ? `${head} -> {${[...theta.keys()].sort().map(v => `${v}/${show(v, theta)}`).join(', ')}}` : `${head} -> fail, ${why}`;
    output += `${printed}\n`;
    push(ok ? L.printOk : L.printFail, ok
      ? `印出 MGU：變數依名稱排序，每個值用 show 完全代入。${[...theta].filter(([v, x]) => show(v, theta) !== raw(x)).map(([v, x]) => `θ 裡的 ${v}: ${raw(x)} 印成 ${v}/${show(v, theta)}`).join('；')}。`
      : `unify 回傳 None 與失敗的原因，印出 ${why}。失敗不是程式錯誤，而是告訴推論程序：這兩個式子不可能指同一件事，這條規則用不上。`,
    ok ? {} : { why: `'${why}'` });
  }
  if (output.trimEnd() !== UNIFY_OUTPUT) throw new Error(`AIF12: the trace prints ${output}, the program prints ${UNIFY_OUTPUT}`);
  return steps;
}

export const AIF12: LessonContent = {
  lessonId: 'AIF12',
  motivation: '命題邏輯只看得到一個一個不可分割的命題：「Ann 是 Bob 的父母」和「Bob 是 Cid 的父母」對它來說是兩個毫無關係的符號，它看不出兩句都在說 Bob。要說「父母的父母是祖父母」，家族有 n 個人就得寫 n³ 條規則；要說「每個人都有母親」，人數不知道就根本寫不出來。一階邏輯（first-order logic）把世界看成物件與物件之間的關係，用述詞、函數與常數描述它們，再用全稱與存在量詞一句話說到「所有人」或「某個人」。這一課要學會：用一階邏輯寫下家族關係、正確翻譯含量詞的中文句子（避開 ∀ 配 ∧、∃ 配 ⇒ 這兩個最常見的錯誤）、用合一（unification）決定規則裡的變數該代入什麼，並以 Python 寫出一階前向鏈結，從「誰是誰的父母」推出祖父母、祖先、兄弟姊妹這些沒有寫出來的關係；最後和 AIF10 知識表示課的知識圖譜查詢比較，看推論多給了什麼、又付出什麼代價。',
  sections: [
    {
      id: 'why-fol', title: '命題邏輯不夠的地方：一個人一個符號',
      blocks: [
        { type: 'p', text: '上一課的命題邏輯，最小單位是一個命題符號，例如 Parent_Ann_Bob（Ann 是 Bob 的父母）。符號名稱裡的 Ann、Bob 只是我們看得懂的字，對邏輯來說它和 P17 沒有差別：Parent_Ann_Bob 與 Parent_Bob_Cid 共用了 Bob，命題邏輯完全不知道。結果是每一個「關於某些人」的規則，都要對每一組人各寫一次。下面的程式把一條祖父母規則展開成命題邏輯，數一數需要多少符號與規則。' },
        { type: 'example', id: 'e-ground' },
        { type: 'p', text: '3 個人就要 9 個 Parent 符號、27 條祖父母規則，其中只有一條真的會用到；1000 個人是 10⁹ 條。更根本的問題是有些話根本寫不完：「每個人都有母親」在人數未知或無限時沒辦法逐一列出，「有某個人是 Cid 的老師」也只能寫成「Ann 是或 Bob 是或…」這樣一長串的 ∨，前提是先知道所有可能的人。一階邏輯用變數與量詞解決這兩件事：∀x ∀y ∀z (Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z)) 一條就涵蓋所有人。' },
        { type: 'table', head: ['面向', '命題邏輯', '一階邏輯'], rows: [
          ['世界由什麼組成', '事實：每個命題非真即假', '物件，以及物件之間的關係與函數'],
          ['「Ann 是 Bob 的父母」', '一個不可分割的符號 Parent_Ann_Bob', 'Parent(Ann, Bob)：述詞 Parent 作用在兩個物件上'],
          ['「父母的父母是祖父母」', 'n 個人要 n³ 條規則', '∀x ∀y ∀z (Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z))'],
          ['「每個人都有母親」', '人數未知就寫不出來', '∀x ∃y MotherOf(y, x)'],
          ['推論一定會停嗎', '會：真值表最多 2ⁿ 列', '不一定：半可判定（本課最後一節）'],
        ] },
        { type: 'p', text: '量詞與變數的寫法來自 Gottlob Frege 在 1879 年出版的《概念文字》（Begriffsschrift）。「一階」的意思是量詞只能作用在物件上：可以說「對所有人 x」，不能說「對所有關係 R」；能對述詞或集合使用量詞的是二階邏輯（second-order logic），表達力更強，但沒有完備的證明系統。人工智慧的知識表示與自動推論，大多以一階邏輯或它的片段為基礎。' },
      ],
    },
    {
      id: 'syntax', title: '物件、常數、函數與述詞',
      blocks: [
        { type: 'p', text: '一階邏輯描述的是一個模型（model）：一群物件組成的論域（domain），加上物件之間的關係與函數。符號分成兩類。項（term）指一個物件：常數（constant）如 Ann、Bob 直接指名一個物件；變數（variable）如 x、y 可以代表任何物件；函數（function）如 Mother(x) 把物件對應到另一個物件，Mother(Ann) 就是「Ann 的母親」這個人。述詞（predicate）如 Parent(x, y)、Female(x) 對一組物件回答真或假，套上項之後成為原子語句（atomic sentence），例如 Parent(Ann, Bob)。原子語句再用 ¬、∧、∨、⇒、⇔ 組合，和命題邏輯的連接詞意義相同。' },
        { type: 'table', head: ['符號', '例子', '代表什麼', '結果是'], rows: [
          ['常數', 'Ann、Bob、AI101', '一個特定的物件', '物件（項）'],
          ['變數', 'x、y、who', '任一個物件，範圍由量詞決定', '物件（項）'],
          ['函數', 'Mother(x)、Mother(Mother(Ann))', 'x 的母親：每個物件恰好對應一個值', '物件（項）'],
          ['述詞', 'Parent(x, y)、Female(x)', 'x 是 y 的父母；x 是女性', '真或假（原子語句）'],
          ['等號', 'Mother(Cid) = Bea', '兩個項指同一個物件', '真或假（原子語句）'],
        ] },
        { type: 'p', text: '述詞的引數個數叫元數（arity）：Female 是一元、Parent 是二元。引數的順序是定義的一部分，Parent(x, y) 是「x 是 y 的父母」還是「y 是 x 的父母」要先講好，整份知識庫都照同一個意思寫。本課沿用多數 AI 教科書的寫法：常數、述詞與函數名稱大寫開頭，變數小寫開頭。Prolog 剛好相反（變數大寫開頭），讀不同的資料時要先確認慣例。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把函數當成述詞，或反過來', text: 'Mother(Ann) 是一個人，不是一句話：寫 Mother(Ann) ∧ Female(Bob) 是語法錯誤，就像在命題邏輯裡寫「Ann 的母親 且 Bob 是女性」。反過來，函數必須對每個物件恰好有一個值，所以「孩子」不能寫成函數 Child(x)：一個人可能沒有孩子，也可能有三個。一對多或可能沒有的關係用述詞 Parent(x, y)；恰好一個的才適合用函數，例如每個人恰有一位生母 Mother(x)。' },
      ],
    },
    {
      id: 'quantifiers', title: '全稱與存在量詞：範圍、順序與否定',
      blocks: [
        { type: 'p', text: '全稱量詞（universal quantifier）∀x P(x) 為真，當且僅當把論域裡每一個物件代入 x，P 都為真；存在量詞（existential quantifier）∃x P(x) 為真，當且僅當至少有一個物件代入後為真。量詞的範圍（scope）是緊跟在它後面的式子，通常用括號標出；範圍內的 x 被這個量詞約束（bound），不在任何量詞範圍內的變數叫自由變數（free variable），含自由變數的式子沒有確定的真假。論域有限時，∀ 就是一長串 ∧，∃ 就是一長串 ∨，在 Python 裡分別是 all() 與 any()。' },
        { type: 'example', id: 'e-model' },
        { type: 'p', text: '在這個 4 個人的模型裡，「每個人都有父母」為假，因為 Ann 在模型裡沒有父母；程式也把反例找了出來。量詞的順序會改變意思：∀x ∃y Likes(x, y) 是「每個人都有自己喜歡的人」，每個 x 可以挑不同的 y，在模型裡為真；∃y ∀x Likes(x, y) 是「有一個人被所有人喜歡」，必須是同一個 y，為假。同種量詞相鄰時可以交換（∀x ∀y 等於 ∀y ∀x），不同種的不行。' },
        { type: 'table', head: ['規則', '例子', '讀法'], rows: [
          ['¬∀x P(x) ≡ ∃x ¬P(x)', '¬∀x HasChild(x) ≡ ∃x ¬HasChild(x)', '「不是人人都有孩子」等於「有人沒有孩子」'],
          ['¬∃x P(x) ≡ ∀x ¬P(x)', '¬∃x Parent(x, x) ≡ ∀x ¬Parent(x, x)', '「沒有人是自己的父母」等於「每個人都不是自己的父母」'],
          ['∀x P(x) ≡ ¬∃x ¬P(x)', '∀x Mortal(x) ≡ ¬∃x ¬Mortal(x)', '「人都會死」等於「不存在不會死的人」'],
          ['巢狀時逐層翻轉', '¬∀x ∃y Likes(x, y) ≡ ∃x ∀y ¬Likes(x, y)', '「不是每個人都有喜歡的人」等於「有人誰都不喜歡」'],
        ] },
        { type: 'p', text: '這就是量詞版的 De Morgan 定律：¬ 往裡面推過一個量詞時，∀ 與 ∃ 互換。它和命題邏輯的 ¬(P ∧ Q) ≡ ¬P ∨ ¬Q 是同一件事，因為 ∀ 是一長串 ∧、∃ 是一長串 ∨。範例最後兩行在模型上驗證了這兩條等價。' },
        { type: 'callout', tone: 'note', title: '用 all() 與 any() 驗證只在有限論域成立', text: '範例能逐一檢查，是因為論域只有 4 個人而且全部列出來。一階邏輯的論域可以是無限的，例如所有自然數；那時 ∀x 沒辦法一個一個試，判斷一句話是否成立只能靠推論，這正是後面合一與前向鏈結要做的事。' },
      ],
    },
    {
      id: 'translate', title: '量詞翻譯：把中文句子寫成一階邏輯',
      blocks: [
        { type: 'p', text: '翻譯的步驟：先找出句子裡的物件（哪些是特定的常數，哪些是「所有」或「某個」），再決定述詞與函數以及引數的順序，接著放量詞，最後選連接詞。最後一步最容易錯，有兩條經驗法則：「所有 A 都是 B」用 ∀ 配 ⇒；「有 A 是 B」用 ∃ 配 ∧。' },
        { type: 'table', head: ['中文', '一階邏輯', '說明'], rows: [
          ['所有學生都修了 AI 導論', '∀x (Student(x) ⇒ Takes(x, AI))', '∀ 配 ⇒：只限制學生，其他物件不管'],
          ['有學生修了 AI 導論', '∃x (Student(x) ∧ Takes(x, AI))', '∃ 配 ∧：同一個 x 既是學生又修了課'],
          ['沒有學生修 AI 導論', '¬∃x (Student(x) ∧ Takes(x, AI))', '依 De Morgan 等於 ∀x (Student(x) ⇒ ¬Takes(x, AI))'],
          ['有些鳥不會飛', '∃x (Bird(x) ∧ ¬Flies(x))', '「有些」是 ∃，否定只套在 Flies 上'],
          ['只有學生能借書', '∀x (Borrows(x) ⇒ Student(x))', '「只有 A 能 B」是 B ⇒ A，方向和「所有 A 都能 B」相反'],
          ['每個人都有母親', '∀x ∃y MotherOf(y, x)', '先 ∀ 後 ∃：每個人各有自己的母親'],
          ['父母的父母是祖父母', '∀x ∀y ∀z (Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z))', '等於 ∀x ∀z (∃y (Parent(x, y) ∧ Parent(y, z)) ⇒ Grandparent(x, z))'],
          ['x 與 y 是兄弟姊妹', '∀x ∀y (Sibling(x, y) ⇔ x ≠ y ∧ ∃p (Parent(p, x) ∧ Parent(p, y)))', '少了 x ≠ y，每個人都成了自己的兄弟姊妹'],
        ] },
        { type: 'p', text: '祖父母那一列的兩種寫法等價：y 只出現在 ⇒ 的左邊，「對所有 y，若…則…」和「若存在 y 使得…則…」是同一件事，因為 ∀y (P(y) ⇒ Q) ≡ (∃y P(y)) ⇒ Q。規則通常寫成前一種，所有變數都是全稱量詞，後面的前向鏈結就是處理這種形式。下面的程式在兩個模型上計算正確與錯誤的翻譯，再看兄弟姊妹少了 x ≠ y 的後果。' },
        { type: 'example', id: 'e-translate' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：∀ 配 ∧、∃ 配 ⇒', text: '「所有學生都很聰明」寫成 ∀x (Student(x) ∧ Smart(x))，意思變成「每個東西都是學生，而且都很聰明」：論域裡只要有一隻不是學生的狗 Rex，它就為假，範例的第一個模型就是這樣。「有學生很聰明」寫成 ∃x (Student(x) ⇒ Smart(x))，只要有任何一個不是學生的東西，⇒ 的左邊為假、整個蘊含為真，這句話就成立：第二個模型裡沒有人聰明，它照樣為真。檢查翻譯的方法：想一個有「不相關的物件」的小模型，看式子的真假是否符合原句。' },
        { type: 'p', text: '另外兩個常見錯誤：量詞順序寫反，∃y ∀x MotherOf(y, x) 說的是「有一個人是所有人的母親」；忘了 x ≠ y，範例最後一行在沒有 x ≠ y 時把 (Cid, Cid) 也算成兄弟姊妹。練習題的規則語言沒有 ≠，你會在測資中看到這個錯誤怎麼一路傳下去。' },
      ],
    },
    {
      id: 'unification', title: '替換與合一：讓兩個式子長得一樣',
      blocks: [
        { type: 'p', text: '要用 ∀x ∀y ∀z (Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z)) 這條規則，必須決定 x、y、z 代入什麼。替換（substitution）θ 是一組「變數/項」的綁定，例如 θ = {x/Ann, y/Bob}；SUBST(θ, α) 把 α 裡的變數依 θ 換掉，SUBST({x/Ann, y/Bob}, Parent(x, y)) = Parent(Ann, Bob)。合一（unification）是：給兩個式子 p、q，找一個 θ 使 SUBST(θ, p) = SUBST(θ, q)，這樣的 θ 叫合一子（unifier）。' },
        { type: 'table', head: ['p', 'q', '最一般合一子（MGU）'], rows: [
          ['Parent(Ann, x)', 'Parent(Ann, Bob)', '{x/Bob}'],
          ['Parent(Ann, x)', 'Parent(y, Bob)', '{x/Bob, y/Ann}'],
          ['Parent(Ann, x)', 'Parent(y, Mother(y))', '{x/Mother(Ann), y/Ann}'],
          ['Parent(x, y)', 'Parent(z, z)', '{x/z, y/z}；{x/Ann, y/Ann, z/Ann} 也是合一子，但不是最一般的'],
          ['Parent(Ann, x)', 'Parent(x, Bob)', '失敗：同一個 x 不能既是 Ann 又是 Bob'],
          ['x', 'Mother(x)', '失敗：occurs check'],
        ] },
        { type: 'p', text: '兩個式子可能有很多合一子。最一般合一子（most general unifier, MGU）只綁定非綁不可的變數，其他每個合一子都可以由它再代入得到；不計變數改名，MGU 是唯一的。推論時用 MGU，才不會過早把變數固定成某個值而錯過其他答案。演算法用一個待處理的項對清單 todo：每次取出一對，先用 walk 查 θ 把已綁定的變數換成它的值；兩邊相同就跳過；有一邊是變數就綁定它（先做 occurs check）；兩邊是同一個函數符號、引數個數相同的複合項，就把引數一對一對放進 todo；其他情況（不同的常數、不同的函數符號或引數個數）失敗。' },
        { type: 'example', id: 'e-unify' },
        { type: 'p', text: '第一對得到 θ = {x: Ann, y: Mother(x)}：θ 裡存的 y 的值還含有 x，印出時 show 一路代入成 Mother(Ann)。第二對先綁 z/w，再處理 z = Mother(w) 時 walk 把 z 換成 w，變成 w = Mother(w)：w 出現在自己要等於的項裡，這就是 occurs check 抓到的情況。沒有任何有限的項等於自己的母親，少了這個檢查，演算法會「成功」並得到一個無窮的項，推出錯誤的結論。很多 Prolog 系統為了速度預設省略 occurs check，ISO Prolog 另外提供 unify_with_occurs_check/2。下方的視覺化逐步執行這個程式。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：沒有把兩個句子的變數分開命名', text: '知識庫有 Parent(Ann, x)（「Ann 是某些人的父母」，x 是全稱變數），要和查詢 Parent(x, Bob) 合一：兩邊的 x 寫法一樣，演算法就把它們當成同一個變數，表格第五列失敗了。其實兩個句子的 x 毫無關係，每個句子的變數只在自己的量詞範圍內有效。合一前要先把變數改名分開（standardizing apart），例如把查詢改成 Parent(x2, Bob)，就得到 {x/Bob, x2/Ann}。前向鏈結每次使用規則前也要這樣做，練習題中因為事實沒有變數，這個問題不會出現。' },
      ],
    },
    {
      id: 'forward', title: '一階前向鏈結：一般化肯定前件',
      blocks: [
        { type: 'p', text: '上一課在命題的 Horn 子句上做前向鏈結；一階的版本處理確定子句（definite clause）：前提是幾個正的原子語句的 ∧，結論是一個正的原子語句，所有變數都隱含 ∀。例如 Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z)，事實則是沒有變數的基底原子（ground atom），例如 Parent(Ann, Bob)。推論規則是一般化肯定前件（Generalized Modus Ponens, GMP）：有事實 p1′、…、pn′ 與規則 p1 ∧ … ∧ pn ⇒ q，若某個 θ 讓每個 SUBST(θ, pi′) = SUBST(θ, pi)，就推出 SUBST(θ, q)。它就是肯定前件加上合一。' },
        { type: 'p', text: '前向鏈結（forward chaining）一輪一輪做：每一輪對每條規則，找出所有能讓前提和已知事實合一的 θ，把結論加進來；某一輪沒有新事實（到達不動點 fixed point）就停。事實都是基底的，前提和事實的合一只會綁定前提這一邊的變數，所以程式可以用比較簡單的比對（matching）：前提的變數綁定成事實的常數，同一個變數出現兩次時必須綁到同一個常數。' },
        { type: 'example', id: 'e-fc' },
        { type: 'p', text: '第 1 輪只有 Parent 事實，兩條只需要 Parent 的規則推出 Grandparent 與第一代 Ancestor；遞迴規則 Parent(x, y) ∧ Ancestor(y, z) ⇒ Ancestor(x, z) 要等 Ancestor 事實出現才能用，所以每一輪往上多推一代，第 3 輪推出 Ancestor(Ann, Dan)，第 4 輪沒有新事實就停。命題邏輯要表達「祖先」，得為每一對人各寫規則；一階邏輯兩條就夠，而且家族變大也不必改。' },
        { type: 'table', head: ['性質', '說明'], rows: [
          ['可靠（sound）', '推出的每個事實都被知識庫蘊含，因為 GMP 只是把 ∀ 規則代入特定的物件'],
          ['對確定子句完備', '被知識庫蘊含的基底原子，前向鏈結終究都會推出來'],
          ['沒有函數符號時一定停', '這種知識庫叫 Datalog：k 個常數、元數最多 a 的 p 個述詞，最多只有 p·kᵃ 個可能的事實，每一輪至少多一個，不會無限進行'],
          ['有函數符號時可能不停', 'Nat(Zero) 與 Nat(x) ⇒ Nat(S(x)) 會推出 Nat(S(Zero))、Nat(S(S(Zero)))…永無止境'],
        ] },
        { type: 'callout', tone: 'tip', title: '推不出來不等於為假', text: '前向鏈結停下來時，知識庫中沒推出的事實只是「無法從知識庫推出」，邏輯上它可能成立也可能不成立。練習題查不到時回答 no，意思是「推不出來」；Prolog 等系統把推不出來當成否定（negation as failure），等於加上了封閉世界的假設，和 AIF10 介紹的 RDF 開放世界假設正好相反。' },
      ],
    },
    {
      id: 'resolution-kg', title: '一階歸結、半可判定性，以及和知識圖譜查詢的比較',
      blocks: [
        { type: 'p', text: '前向鏈結只能處理確定子句；一般的一階語句（含 ∨、¬、∃）用歸結（resolution）。步驟和命題邏輯相同：把 KB ∧ ¬α 轉成合取範式（CNF），反覆歸結，推出空子句就證明了 KB ⊨ α。一階版本多了三件事：轉 CNF 時用 Skolem 化（Skolemization）去掉 ∃，例如 ∀x ∃y MotherOf(y, x) 變成 MotherOf(M(x), x)，M 是新的 Skolem 函數，代表「x 的那位母親」；兩個子句裡互補的文字不必一模一樣，只要能合一，歸結式要套上 MGU；歸結前要把兩個子句的變數分開命名。J. A. Robinson 在 1965 年提出歸結原理，合一演算法就是在那篇論文中提出的。' },
        { type: 'p', text: '一階邏輯的推論有兩個重要的結果。Kurt Gödel 在 1929 年的博士論文證明了完備性定理：被蘊含的語句一定有證明，歸結也是反駁完備的（refutation-complete），只要 KB ⊨ α，終究推得出空子句。Alonzo Church 與 Alan Turing 在 1936 年分別證明：沒有演算法能對任意的 KB 與 α 判定 KB ⊨ α 是否成立。合起來，一階邏輯的蘊含是半可判定的（semi-decidable）：成立時程序終究會停下來說「是」；不成立時，程序可能永遠找下去，我們無法分辨「還沒找到」與「根本不存在」。命題邏輯則是可判定的，最壞情況試完真值表就有答案。' },
        { type: 'table', head: ['面向', '知識圖譜查詢（三元組與樣式比對）', '一階邏輯推論'], rows: [
          ['基本事實', '三元組 (Ann, parent, Bob)，相當於二元述詞的基底原子 Parent(Ann, Bob)', '任意元數的原子語句，項可以含函數'],
          ['查詢', '帶變數的三元組樣式（SPARQL 的基本圖樣），靠比對', '任意語句；有變數時靠合一'],
          ['沒寫出來的關係', '只回答存下來的，或推論器依 RDFS、OWL 推出的', '規則加上前向鏈結或歸結，推出祖先、叔伯這類關係'],
          ['能說的話', '無法直接說「每個人都有母親」「Ann 養的是貓或狗」「沒有人是自己的祖先」', '∀、∃、∨、¬ 都能表達'],
          ['計算', '基本圖樣比對的時間對資料量是多項式，一定會停', '一般情況半可判定；Datalog 一定會停'],
        ] },
        { type: 'p', text: '兩者並不衝突：知識圖譜的三元組可以直接當成一階邏輯的事實，SPARQL 的基本圖樣其實就是確定子句的前提，比對就是和基底事實合一。OWL 2 DL 所根據的描述邏輯（description logic）SROIQ，是刻意選出來、推論可判定的一階邏輯片段：放棄一部分表達力，換來一定會停的推論。實務上，大量事實放在知識圖譜，少量需要的規則用 Datalog 或 OWL 推論，只在必要時才用完整的一階定理證明器。' },
        { type: 'callout', tone: 'tip', title: '怎麼選', text: '只是查詢已知的事實與固定的路徑，用知識圖譜就好，又快又一定有答案；需要從規則推出隱含關係、而且規則都是確定子句又沒有函數，用 Datalog 式的前向鏈結（本課練習），保證會停；需要 ∨、¬、∃ 這些完整表達力時才用一階歸結，並為搜尋設好時間或步數上限，因為它可能永遠不停。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-ground', title: '命題化：一條一階規則要展開成幾條命題規則',
      description: '把 Parent 與 Grandparent 寫成命題符號，列出 3 個人的所有符號與展開後的祖父母規則，找出會觸發的那一條，再看人數變大時的成長。',
      code: { Python: code`from itertools import product

people = ['Ann', 'Bob', 'Cid']
parent = {('Ann', 'Bob'), ('Bob', 'Cid')}

# 命題邏輯：每一個 Parent(a, b) 都要一個自己的命題符號
symbols = [f'Parent_{a}_{b}' for a, b in product(people, repeat=2)]
true = {f'Parent_{a}_{b}' for a, b in parent}
print(len(symbols), 'symbols:', ' '.join(symbols[:4]), '...')

# 一條一階規則 ∀x ∀y ∀z Parent(x, y) ∧ Parent(y, z) ⇒ Grandparent(x, z)
# 在命題邏輯裡要把 x, y, z 的每一種組合各寫成一條規則
rules = [(f'Parent_{x}_{y}', f'Parent_{y}_{z}', f'Grandparent_{x}_{z}')
         for x, y, z in product(people, repeat=3)]
print(len(rules), 'ground rules, e.g.', ' & '.join(rules[5][:2]), '=>', rules[5][2])
fired = [c for p1, p2, c in rules if p1 in true and p2 in true]
print('fired:', fired)

# 人數 n 增加時：Parent 符號 n^2 個，祖父母規則 n^3 條；一階邏輯始終是 1 條規則
for n in [3, 10, 100, 1000]:
    print(f'n={n:<5} symbols={n * n:<8} ground rules={n * n * n:<11} FOL rules=1')` },
      output: "9 symbols: Parent_Ann_Ann Parent_Ann_Bob Parent_Ann_Cid Parent_Bob_Ann ...\n27 ground rules, e.g. Parent_Ann_Bob & Parent_Bob_Cid => Grandparent_Ann_Cid\nfired: ['Grandparent_Ann_Cid']\nn=3     symbols=9        ground rules=27          FOL rules=1\nn=10    symbols=100      ground rules=1000        FOL rules=1\nn=100   symbols=10000    ground rules=1000000     FOL rules=1\nn=1000  symbols=1000000  ground rules=1000000000  FOL rules=1",
    },
    {
      id: 'e-model', title: '在有限模型上計算量詞：all 是 ∀，any 是 ∃',
      description: '4 個人的家族模型：檢查「每個人都有父母」並找出反例，比較 ∀x ∃y 與 ∃y ∀x 的差別，再驗證量詞的 De Morgan 定律。',
      code: { Python: code`people = ['Ann', 'Bob', 'Cid', 'Dan']
parent = {('Ann', 'Bob'), ('Bob', 'Cid'), ('Bob', 'Dan')}
likes = {('Ann', 'Bob'), ('Bob', 'Ann'), ('Cid', 'Dan'), ('Dan', 'Cid')}

def Parent(x, y):
    return (x, y) in parent

def Likes(x, y):
    return (x, y) in likes

# 在有限的論域上：all(...) 就是 ∀，any(...) 就是 ∃
print('∀x ∃y Parent(y, x) :', all(any(Parent(y, x) for y in people) for x in people))
print('  no parent:', [x for x in people if not any(Parent(y, x) for y in people)])
print('∃x ∀y ¬Parent(y, x):', any(all(not Parent(y, x) for y in people) for x in people))

# 量詞的順序：∀x ∃y 與 ∃y ∀x 不一樣
print('∀x ∃y Likes(x, y)  :', all(any(Likes(x, y) for y in people) for x in people))
print('∃y ∀x Likes(x, y)  :', any(all(Likes(x, y) for x in people) for y in people))

# 否定的 De Morgan：¬∀x P(x) ≡ ∃x ¬P(x)，¬∃x P(x) ≡ ∀x ¬P(x)
def has_child(x):
    return any(Parent(x, y) for y in people)

print('¬∀x HasChild(x) =', not all(has_child(x) for x in people),
      '| ∃x ¬HasChild(x) =', any(not has_child(x) for x in people))
print('¬∃x Parent(x, x) =', not any(Parent(x, x) for x in people),
      '| ∀x ¬Parent(x, x) =', all(not Parent(x, x) for x in people))` },
      output: "∀x ∃y Parent(y, x) : False\n  no parent: ['Ann']\n∃x ∀y ¬Parent(y, x): True\n∀x ∃y Likes(x, y)  : True\n∃y ∀x Likes(x, y)  : False\n¬∀x HasChild(x) = True | ∃x ¬HasChild(x) = True\n¬∃x Parent(x, x) = True | ∀x ¬Parent(x, x) = True",
    },
    {
      id: 'e-translate', title: '正確與錯誤的翻譯：在兩個模型上比較真假',
      description: '論域有兩位學生和一隻狗 Rex。比較 ∀ 配 ⇒ 與 ∀ 配 ∧、∃ 配 ∧ 與 ∃ 配 ⇒ 的真假，再看兄弟姊妹的定義少了 x ≠ y 會怎樣。',
      code: { Python: code`def implies(p, q):
    return (not p) or q  # p ⇒ q 只有在 p 真、q 假時為假

domain = ['Ann', 'Bob', 'Rex']           # Rex 是一隻狗，不是學生
student = {'Ann', 'Bob'}

for smart in [{'Ann', 'Bob'}, set()]:    # 模型 1：學生都聰明；模型 2：沒有人聰明
    S = lambda x: x in student
    M = lambda x: x in smart
    print('Smart =', sorted(smart))
    # 「所有學生都很聰明」
    print('  ∀x (S(x) ⇒ M(x)):', all(implies(S(x), M(x)) for x in domain), '(正確)')
    print('  ∀x (S(x) ∧ M(x)):', all(S(x) and M(x) for x in domain), '(錯：要每個東西都是學生)')
    # 「有學生很聰明」
    print('  ∃x (S(x) ∧ M(x)):', any(S(x) and M(x) for x in domain), '(正確)')
    print('  ∃x (S(x) ⇒ M(x)):', any(implies(S(x), M(x)) for x in domain), '(錯：Rex 不是學生就成立)')

# 「Cid 和 Dan 是兄弟姊妹」：有共同的父母，而且不是同一個人
parent = {('Bob', 'Cid'), ('Bob', 'Dan')}
people = ['Bob', 'Cid', 'Dan']

def sibling(x, y, need_diff):
    common = any((p, x) in parent and (p, y) in parent for p in people)
    return common and (x != y or not need_diff)

for need_diff in [False, True]:
    pairs = [(x, y) for x in people for y in people if sibling(x, y, need_diff)]
    print('x ≠ y' if need_diff else 'no x ≠ y', pairs)` },
      output: "Smart = ['Ann', 'Bob']\n  ∀x (S(x) ⇒ M(x)): True (正確)\n  ∀x (S(x) ∧ M(x)): False (錯：要每個東西都是學生)\n  ∃x (S(x) ∧ M(x)): True (正確)\n  ∃x (S(x) ⇒ M(x)): True (錯：Rex 不是學生就成立)\nSmart = []\n  ∀x (S(x) ⇒ M(x)): False (正確)\n  ∀x (S(x) ∧ M(x)): False (錯：要每個東西都是學生)\n  ∃x (S(x) ∧ M(x)): False (正確)\n  ∃x (S(x) ⇒ M(x)): True (錯：Rex 不是學生就成立)\nno x ≠ y [('Cid', 'Cid'), ('Cid', 'Dan'), ('Dan', 'Cid'), ('Dan', 'Dan')]\nx ≠ y [('Cid', 'Dan'), ('Dan', 'Cid')]",
    },
    {
      id: 'e-unify', title: '合一：walk、occurs check 與最一般合一子',
      description: '項用 tuple 表示（第一個元素是述詞或函數符號），小寫開頭的字串是變數。unify 回傳 MGU，或 None 與失敗的原因；印出時用 show 把 θ 完全代入。',
      code: { Python: UNIFY_CODE },
      output: UNIFY_OUTPUT,
    },
    {
      id: 'e-fc', title: '一階前向鏈結：從 Parent 推出 Grandparent 與 Ancestor',
      description: '三條確定子句，其中一條是遞迴的 Ancestor。每一輪只用上一輪結束時已知的事實，印出每一輪新推出的事實，直到沒有新事實為止。',
      code: { Python: code`facts = {('Parent', 'Ann', 'Bob'), ('Parent', 'Bob', 'Cid'), ('Parent', 'Cid', 'Dan')}
rules = [  # (結論, [前提...])：變數小寫，每條規則都是確定子句
    (('Grandparent', 'x', 'z'), [('Parent', 'x', 'y'), ('Parent', 'y', 'z')]),
    (('Ancestor', 'x', 'y'), [('Parent', 'x', 'y')]),
    (('Ancestor', 'x', 'z'), [('Parent', 'x', 'y'), ('Ancestor', 'y', 'z')]),
]

def is_var(t):
    return t[0].islower()

def match(pattern, fact, theta):
    """把前提和一個已知事實合一（事實沒有變數），成功時回傳擴充後的 θ。"""
    if pattern[0] != fact[0] or len(pattern) != len(fact):
        return None
    theta = dict(theta)
    for p, f in zip(pattern[1:], fact[1:]):
        if is_var(p) and theta.setdefault(p, f) != f:
            return None  # 同一個變數已經綁定了別的常數
        if not is_var(p) and p != f:
            return None
    return theta

def solve(body, theta, known):
    if not body:
        yield theta
        return
    for fact in sorted(known):
        t = match(body[0], fact, theta)
        if t is not None:
            yield from solve(body[1:], t, known)

def show(f):
    return f'{f[0]}({", ".join(f[1:])})'

rnd = 0
while True:
    known = set(facts)  # 這一輪只用上一輪結束時已知的事實
    new = {tuple(theta.get(a, a) for a in head)
           for head, body in rules for theta in solve(body, {}, known)} - known
    if not new:
        break
    rnd += 1
    facts |= new
    print(f'round {rnd}:', ', '.join(show(f) for f in sorted(new)))
print('Ancestor(Ann, Dan)?', ('Ancestor', 'Ann', 'Dan') in facts, '| facts:', len(facts))` },
      output: "round 1: Ancestor(Ann, Bob), Ancestor(Bob, Cid), Ancestor(Cid, Dan), Grandparent(Ann, Cid), Grandparent(Bob, Dan)\nround 2: Ancestor(Ann, Cid), Ancestor(Bob, Dan)\nround 3: Ancestor(Ann, Dan)\nAncestor(Ann, Dan)? True | facts: 11",
    },
  ],
  exercises: [
    {
      id: 'x-family-fc', title: '家族關係的一階前向鏈結器',
      statement: '寫一個前向鏈結器：讀入事實、規則與查詢，先用前向鏈結推出所有能推出的事實，再回答查詢。原子語句寫成 `Pred(t1, t2, ...)`：述詞名稱以大寫英文字母開頭，至少一個引數，引數以逗號分隔，括號與逗號旁可以有空白。每個引數（項）由英文字母、數字與底線組成、以字母或數字開頭：小寫字母開頭的是變數，其餘（大寫字母或數字開頭）是常數；沒有函數項。每一行是下列一種：事實 `Parent(Ann, Bob)`；規則 `結論 :- 前提1, 前提2, ...`（至少一個前提，意思是前提全部成立則結論成立，所有變數都是全稱量詞）；查詢 `? 原子語句`（`?` 後面可以有空白）。空行忽略，行首行尾的空白忽略。前向鏈結一輪一輪做：每一輪把每條規則套用到「這一輪開始時已知的所有事實」，找出所有能讓前提同時和已知事實合一的替換，加入結論；某一輪沒有新事實就停。查詢在推論結束後依輸入順序回答。',
      inputFormat: '若干行，每行是一個事實、規則、查詢或空行（見題目敘述）。',
      outputFormat: '第一行 `new facts: N, rounds: R`：N 是推出的新事實個數（不含輸入的事實，重複的只算一次），R 是有產生新事實的輪數。接著每個查詢一行，先印查詢本身：述詞名稱、括號，引數以 `, ` 分隔，再接 `: `。查詢沒有變數時印 `yes`（是已知或推出的事實）或 `no`。查詢有變數時列出所有答案：每個答案寫成 `變數=值`，變數依它在查詢中第一次出現的順序，以一個空白分隔；答案依各變數的值組成的序列排序（Python 字串比較），重複的只列一次，答案之間以 `; ` 分隔；沒有答案印 `no`。若輸入有錯，只印一行 `error on line K: 原因`，K 是第一個有錯的行號（從 1 起算，空行也算），其他什麼都不印。依行號順序檢查；同一行有多種錯誤時，依下列順序只報第一種：`syntax`（不符合上面的格式）、`arity mismatch`（同一個述詞的引數個數和它在前面的行，或這一行更前面出現時不同；查詢也算）、`fact with variable`（事實裡有變數）、`unsafe rule`（結論裡的變數沒有出現在任何前提）。',
      constraints: ['最多 200 行，每行最多 200 個字元', '常數最多 30 個，述詞的引數最多 3 個', '沒有函數項，也沒有 ≠：規則只有正的原子語句', '查詢的述詞可以從未出現過，這時答案是 no'],
      samples: [
        { kind: 'normal', input: "Parent(Ann, Bob)\nParent(Bob, Cid)\nParent(Bob, Dan)\nFemale(Ann)\nGrandparent(x, z) :- Parent(x, y), Parent(y, z)\nMother(x, y) :- Parent(x, y), Female(x)\n? Grandparent(Ann, w)\n? Mother(m, Bob)\n? Mother(Bob, Cid)\n? Grandparent(x, y)\n", output: "new facts: 3, rounds: 1\nGrandparent(Ann, w): w=Cid; w=Dan\nMother(m, Bob): m=Ann\nMother(Bob, Cid): no\nGrandparent(x, y): x=Ann y=Cid; x=Ann y=Dan\n", note: "家族關係：一輪就推出 3 個新事實；有變數的查詢列出所有答案，沒有變數的回答 yes／no" },
        { kind: 'normal', input: "Parent(Ann, Bob)\nParent(Bob, Cid)\nParent(Cid, Dan)\nAncestor(x, y) :- Parent(x, y)\nAncestor(x, z) :- Parent(x, y), Ancestor(y, z)\n? Ancestor(Ann, Dan)\n? Ancestor(a, Dan)\n", output: "new facts: 6, rounds: 3\nAncestor(Ann, Dan): yes\nAncestor(a, Dan): a=Ann; a=Bob; a=Cid\n", note: "遞迴規則：Ancestor 一輪往上多推一代，第 3 輪推出 Ancestor(Ann, Dan)，第 4 輪沒有新事實就停" },
      ],
      tests: [
        { kind: 'normal', input: "Parent(Bob, Cid)\nParent(Bob, Dan)\nParent(Eve, Fay)\nSibling(x, y) :- Parent(p, x), Parent(p, y)\n? Sibling(Cid, Dan)\n? Sibling(Cid, Cid)\n? Sibling(Fay, s)\n? Sibling(Cid, Fay)\n", output: "new facts: 5, rounds: 1\nSibling(Cid, Dan): yes\nSibling(Cid, Cid): yes\nSibling(Fay, s): s=Fay\nSibling(Cid, Fay): no\n", note: "翻譯的陷阱：規則沒有寫 x ≠ y，Sibling(Cid, Cid) 也被推出，Fay 是自己唯一的兄弟姊妹" },
        { kind: 'normal', input: "Parent(Ann, Bob)\nParent(Ann, Bea)\nParent(Bob, Cid)\nParent(Bea, Cal)\nMale(Bob)\nMale(Cal)\nFemale(Bea)\nSibling(x, y) :- Parent(p, x), Parent(p, y)\nUncle(u, c) :- Parent(p, c), Sibling(u, p), Male(u)\nCousin(x, y) :- Parent(p, x), Parent(q, y), Sibling(p, q)\n? Uncle(u, Cal)\n? Uncle(u, Cid)\n? Cousin(Cid, c)\n? Cousin(x, x)\n", output: "new facts: 12, rounds: 2\nUncle(u, Cal): u=Bob\nUncle(u, Cid): u=Bob\nCousin(Cid, c): c=Cal; c=Cid\nCousin(x, x): x=Cal; x=Cid\n", note: "多步推論：第 1 輪推出 Sibling，第 2 輪才用它推出 Uncle 與 Cousin；Sibling 沒有 x ≠ y，錯誤一路傳下去：Cid 的父親 Bob 成了他的 Uncle，Cid 也成了自己的 Cousin" },
        { kind: 'normal', input: "Parent(Ann, Bob)\nParent(Bob, Cid)\nParent(Bob, Dan)\nAnnLine(y) :- Ancestor(Ann, y)\nAncestor(x, y) :- Parent(x, y)\nAncestor(x, z) :- Ancestor(x, y), Ancestor(y, z)\n? AnnLine(p)\n? Ancestor(x, Dan)\n? Parent(x, x)\n", output: "new facts: 8, rounds: 3\nAnnLine(p): p=Bob; p=Cid; p=Dan\nAncestor(x, Dan): x=Ann; x=Bob\nParent(x, x): no\n", note: "前提裡有常數 Ann；AnnLine 的規則寫在 Ancestor 的規則前面也推得出來，因為每一輪都重新套用全部規則；查詢 Parent(x, x) 沒有答案" },
        { kind: 'edge', input: "Parent(Ann, Bob)\nParent(Bob, Cid)\n? Parent(Ann, Bob)\n? Parent(x, Cid)\n? Grandparent(Ann, Cid)\n", output: "new facts: 0, rounds: 0\nParent(Ann, Bob): yes\nParent(x, Cid): x=Bob\nGrandparent(Ann, Cid): no\n", note: "沒有規則：0 個新事實、0 輪；沒出現過的述詞查詢回答 no（推不出來，不代表為假）" },
        { kind: 'edge', input: "Parent(Ann, Bob)\nParent(Bob, Ann)\nAncestor(x, y) :- Parent(x, y)\nAncestor(x, z) :- Ancestor(x, y), Ancestor(y, z)\n? Ancestor(x, y)\n", output: "new facts: 4, rounds: 2\nAncestor(x, y): x=Ann y=Ann; x=Ann y=Bob; x=Bob y=Ann; x=Bob y=Bob\n", note: "Parent 錯誤地成環：沒有函數的確定子句只有有限多個可能的事實，前向鏈結一定會停，連 Ancestor(Ann, Ann) 都推得出" },
        { kind: 'edge', input: "\n  Parent( Ann ,Bob )  \n\nGrandparent(x,z):-Parent(x,y),Parent(y,z)\n\nParent(Bob, Cid)\n?Grandparent( Ann , who )\n\n", output: "new facts: 1, rounds: 1\nGrandparent(Ann, who): who=Cid\n", note: "空行與多餘的空白都忽略；變數名稱可以超過一個字母" },
        { kind: 'edge', input: "Parent(Ann, Bob)\nGrandparent(x, z) :- Parent(x, y), Parent(y, z)\n", output: "new facts: 0, rounds: 0\n", note: "沒有查詢：只印第一行；規則一個事實也推不出來" },
        { kind: 'edge', input: "Likes(Ann, Ann)\nLikes(Ann, Bob)\nHappy(x) :- Likes(x, x)\n? Happy(h)\n? Likes(Ann, Ann)\n", output: "new facts: 1, rounds: 1\nHappy(h): h=Ann\nLikes(Ann, Ann): yes\n", note: "前提 Likes(x, x) 的兩個 x 必須是同一個常數：只有 Likes(Ann, Ann) 符合" },
        { kind: 'error', input: "Parent(Ann, Bob)\nParent(Bob, Cid\n? Parent(x, Cid)\n", output: "error on line 2: syntax\n", note: "第 2 行少了右括號：syntax，其餘都不輸出" },
        { kind: 'error', input: "Parent(Ann, Bob)\nParent(Bob, x)\n", output: "error on line 2: fact with variable\n", note: "事實裡有變數 x：事實必須是基底（ground）原子" },
        { kind: 'error', input: "Parent(Ann, Bob)\nPerson(Ann)\nParent(x, y) :- Person(x)\n", output: "error on line 3: unsafe rule\n", note: "結論的變數 y 沒有出現在前提：unsafe rule，推出的事實會有沒綁定的變數" },
        { kind: 'error', input: "Parent(Ann, Bob)\nGrandparent(x, z) :- Parent(x, y), Parent(y, z)\n? Parent(Ann)\n", output: "error on line 3: arity mismatch\n", note: "同一個述詞 Parent 先是 2 個引數，查詢只給 1 個：arity mismatch" },
        { kind: 'error', input: "parent(Ann, Bob)\n", output: "error on line 1: syntax\n", note: "述詞名稱要大寫開頭（小寫開頭的是變數）：syntax" },
        { kind: 'error', input: "Parent(Ann, Bob).\n", output: "error on line 1: syntax\n", note: "多了 Prolog 習慣的句點：本題的格式沒有句點，syntax" },
        { kind: 'error', input: "Parent(Ann, Bob)\nHappy(x) :-\n", output: "error on line 2: syntax\n", note: "規則的前提是空的：syntax" },
      ],
      hints: [
        '把原子語句存成 tuple，例如 (\'Parent\', \'Ann\', \'Bob\')；事實存成 set，重複的自動合併。判斷變數只要看第一個字元是不是小寫。',
        '規則的前提可以用 `re.split(r\'(?<=\\))\\s*,\', body)` 在「右括號後面的逗號」切開，再逐一用正規表示式檢查每個原子語句。',
        '寫一個 match(前提, 事實, θ)：述詞與引數個數要相同，常數要相等，變數若已在 θ 中就必須等於同一個常數。再寫一個遞迴的 solve(前提串列, θ)，一個前提一個前提和已知事實比對，產生所有成功的 θ。',
        '每一輪先把目前的事實複製一份當成「這一輪開始時已知的事實」，只拿它來比對；這一輪推出的事實下一輪才能用，輪數才會和題目一致。',
        '查詢也可以用 solve([查詢], {}) 來回答：把每個成功的 θ 轉成變數值的 tuple 放進 set，排序後輸出。',
      ],
      solution: { Python: code`import re
import sys

ATOM = re.compile(r'\s*([A-Z][A-Za-z0-9_]*)\s*\(([^()]*)\)\s*')
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_]*')

def is_var(t):
    return t[0].islower()

def parse_atom(text):
    m = ATOM.fullmatch(text)
    if not m:
        return None
    args = [a.strip() for a in m.group(2).split(',')]
    if not all(NAME.fullmatch(a) for a in args):
        return None
    return (m.group(1), *args)

def parse_line(line):
    """回傳 (種類, 原子串列) 或 (None, 錯誤原因)。規則的原子串列是 [結論, 前提...]。"""
    if line.startswith('?'):
        kind, parts = 'query', [line[1:]]
    elif ':-' in line:
        head, body = line.split(':-', 1)
        kind, parts = 'rule', [head] + re.split(r'(?<=\))\s*,', body)
    else:
        kind, parts = 'fact', [line]
    atoms = [parse_atom(p) for p in parts]
    if None in atoms:
        return None, 'syntax'
    return kind, atoms

def check(kind, atoms, arity):
    for a in atoms:
        if arity.setdefault(a[0], len(a) - 1) != len(a) - 1:
            return 'arity mismatch'
    if kind == 'fact' and any(is_var(t) for t in atoms[0][1:]):
        return 'fact with variable'
    if kind == 'rule':
        body_vars = {t for a in atoms[1:] for t in a[1:] if is_var(t)}
        if any(is_var(t) and t not in body_vars for t in atoms[0][1:]):
            return 'unsafe rule'
    return None

def match(pattern, fact, theta):
    if pattern[0] != fact[0] or len(pattern) != len(fact):
        return None
    theta = dict(theta)
    for p, f in zip(pattern[1:], fact[1:]):
        if is_var(p) and theta.setdefault(p, f) != f:
            return None
        if not is_var(p) and p != f:
            return None
    return theta

def solve(body, theta, known):
    if not body:
        yield theta
        return
    for fact in known:
        t = match(body[0], fact, theta)
        if t is not None:
            yield from solve(body[1:], t, known)

def main():
    facts, rules, queries, arity = set(), [], [], {}
    for no, line in enumerate(sys.stdin.read().split('\n'), start=1):
        line = line.strip()
        if not line:
            continue
        kind, atoms = parse_line(line)
        error = atoms if kind is None else check(kind, atoms, arity)
        if error:
            print(f'error on line {no}: {error}')
            return
        if kind == 'fact':
            facts.add(atoms[0])
        elif kind == 'rule':
            rules.append((atoms[0], atoms[1:]))
        else:
            queries.append(atoms[0])
    start, rounds = len(facts), 0
    while True:
        known = sorted(facts)  # 這一輪只用上一輪結束時已知的事實
        new = {tuple(theta.get(t, t) for t in head)
               for head, body in rules for theta in solve(body, {}, known)} - facts
        if not new:
            break
        facts |= new
        rounds += 1
    print(f'new facts: {len(facts) - start}, rounds: {rounds}')
    for q in queries:
        names = list(dict.fromkeys(t for t in q[1:] if is_var(t)))
        found = sorted({tuple(theta[v] for v in names) for theta in solve([q], {}, sorted(facts))})
        text = f'{q[0]}({", ".join(q[1:])})'
        if not names:
            print(f'{text}: {"yes" if found else "no"}')
        elif not found:
            print(f'{text}: no')
        else:
            print(f'{text}: ' + '; '.join(' '.join(f'{v}={x}' for v, x in zip(names, row)) for row in found))

main()` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'variable-state', title: '合一的每一步：todo 裡的項對與逐漸長大的替換 θ（項以書寫形式顯示，程式裡是 tuple）', language: 'Python',
    code: UNIFY_CODE,
    steps: unifySteps(),
  },
  quiz: [
    {
      id: 'q-all-birds', prompt: '先不管企鵝，「所有的鳥都會飛」最正確的一階邏輯翻譯是哪一個？',
      options: ['∀x (Bird(x) ∧ Flies(x))', '∃x (Bird(x) ⇒ Flies(x))', '∀x (Bird(x) ⇒ Flies(x))', '(∀x Bird(x)) ⇒ (∀x Flies(x))'],
      answer: 2, explanation: '「所有 A 都是 B」用 ∀ 配 ⇒：對每個物件，若它是鳥則它會飛，不是鳥的物件不受限制。∀ 配 ∧ 說的是「每個東西都是鳥而且都會飛」，論域裡有一棵樹就為假；∃ 配 ⇒ 只要有一個不是鳥的東西就為真，幾乎什麼都沒說；(∀x Bird(x)) ⇒ (∀x Flies(x)) 是「若萬物都是鳥則萬物都會飛」，只要有一個東西不是鳥，前件為假，整句就為真，同樣沒有說到鳥。',
    },
    {
      id: 'q-exists-implies', prompt: '論域只有 Ann 與 Rex 兩個物件：Student 只對 Ann 成立，Takes(x, AI) 對誰都不成立。下列哪一個式子在這個模型中為真？',
      options: ['∃x (Student(x) ⇒ Takes(x, AI))', '∃x (Student(x) ∧ Takes(x, AI))', '∀x (Student(x) ∧ ¬Takes(x, AI))', '∀x (Student(x) ⇒ Takes(x, AI))'],
      answer: 0, explanation: '代入 Rex：Student(Rex) 為假，蘊含的前件為假，所以 Student(Rex) ⇒ Takes(Rex, AI) 為真，∃ 找到一個就成立。這正是「有學生修了 AI」不能寫成 ∃ 配 ⇒ 的原因：沒有人修 AI，它還是為真。∃ 配 ∧ 需要一個既是學生又修 AI 的人，沒有，為假；∀x (Student(x) ∧ ¬Takes(x, AI)) 要求 Rex 也是學生，為假；∀x (Student(x) ⇒ Takes(x, AI)) 在 x = Ann 時前件真、後件假，為假。',
    },
    {
      id: 'q-negation', prompt: '¬∀x ∃y Likes(x, y)（「不是每個人都有喜歡的人」）等價於哪一個式子？',
      options: ['∀x ∃y ¬Likes(x, y)', '∃x ∃y ¬Likes(x, y)', '∀x ∀y ¬Likes(x, y)', '∃x ∀y ¬Likes(x, y)'],
      answer: 3, explanation: '¬ 往裡推，每經過一個量詞就翻轉：¬∀x 變成 ∃x ¬，¬∃y 再變成 ∀y ¬，得到 ∃x ∀y ¬Likes(x, y)，「有人誰都不喜歡」。∀x ∃y ¬Likes 是「每個人都有不喜歡的人」，兩個量詞都沒翻轉；∃x ∃y ¬Likes 只翻了第一個，「有人有不喜歡的人」太弱；∀x ∀y ¬Likes 是「沒有人喜歡任何人」，第一個量詞不該維持 ∀。',
    },
    {
      id: 'q-mgu', prompt: 'Older(Mother(x), x) 與 Older(z, Ann) 的最一般合一子（MGU）是什麼？',
      options: ['{x/Ann, z/Mother(x)}', '{x/Ann, z/Mother(Ann)}', '{z/Ann, x/Mother(Ann)}', '合一失敗：occurs check'],
      answer: 1, explanation: '第一個引數得到 z = Mother(x)，第二個得到 x = Ann，所以 z 是 Mother(Ann)，MGU 為 {x/Ann, z/Mother(Ann)}（範例的 unify 也印出這個結果）。{x/Ann, z/Mother(x)} 同時套用時，左邊變成 Older(Mother(Ann), Ann)、右邊變成 Older(Mother(x), Ann)，兩邊不同，必須把 x 也代入；{z/Ann, x/Mother(Ann)} 把兩個位置配錯了；occurs check 只在變數要等於含有它自己的項時才失敗，這裡 z 不在 Mother(x) 裡。',
    },
    {
      id: 'q-occurs', prompt: '沿用範例 e-unify 的 unify 與 show，下面的程式印出什麼？',
      code: { language: 'Python', text: code`theta, why = unify(('Same', 'x', 'x'), ('Same', 'y', ('Mother', 'y')))
print(theta, why)` },
      options: ["{'x': 'y', 'y': ('Mother', 'y')}", 'None occurs check: y in Mother(y)', "{'x': 'y'} occurs check: y in Mother(y)", 'None clash: y vs Mother(y)'],
      answer: 1, explanation: '第一對 x = y 綁定 x/y；第二對 x = Mother(y)，walk 把 x 換成 y，變成 y = Mother(y)，y 出現在 Mother(y) 裡，occurs check 失敗，函式回傳 (None, \'occurs check: y in Mother(y)\')。{\'x\': \'y\', \'y\': (\'Mother\', \'y\')} 是省略 occurs check 才會得到的無窮項；失敗時 unify 回傳的是 None，不是做到一半的 θ；clash 只用在兩個不同的常數或函數符號，y 是變數，不會走到那個分支。',
    },
    {
      id: 'q-kg-limit', prompt: '只用三元組（主詞, 述詞, 受詞）而不搭配規則或本體論語言，下列哪一項知識無法直接存進知識圖譜？',
      options: ['Ann 是 Bob 的父母', 'Bob 住在台北', 'Cid 的母親是 Bea', '每個人都有一位母親，即使不知道她是誰'],
      answer: 3, explanation: '「每個人都有一位母親」是 ∀x ∃y MotherOf(y, x)，同時用到全稱與存在量詞，說的是所有人（包括還沒記錄的人）以及一位沒有名字的母親，三元組只能寫下特定物件之間的事實。另外三項都是兩個已知物件之間的一個關係，正好是一個三元組：(Ann, parent, Bob)、(Bob, lives_in, Taipei)、(Cid, mother, Bea)。',
    },
    {
      id: 'q-fc-rounds', prompt: '事實 Parent(A, B)、Parent(B, C)、Parent(C, D)、Parent(D, E)，規則 Parent(x, y) ⇒ Ancestor(x, y) 與 Parent(x, y) ∧ Ancestor(y, z) ⇒ Ancestor(x, z)。每一輪只用上一輪結束時已知的事實，Ancestor(A, E) 在第幾輪推出？',
      options: ['第 4 輪', '第 1 輪', '第 2 輪', '永遠推不出來，因為規則是遞迴的'],
      answer: 0, explanation: '第 1 輪只有 Parent，推出相隔一代的 Ancestor；之後每一輪遞迴規則把已知的 Ancestor 往上接一代：第 2 輪相隔兩代、第 3 輪三代、第 4 輪才推出相隔四代的 Ancestor(A, E)（練習的參考解答也印出 rounds: 4）。第 1 輪時還沒有任何 Ancestor 事實，遞迴規則用不上；第 2 輪只到相隔兩代，例如 Ancestor(A, C)；遞迴規則沒有函數項，可能的事實有限，前向鏈結一定會停，也一定推得出來。',
    },
    {
      id: 'q-semi-decidable', prompt: '關於一階邏輯的推論，下列敘述何者正確？',
      options: ['和命題邏輯一樣，列出真值表就能在有限時間內判定任何蘊含', '若 KB ⊨ α 不成立，歸結一定會在有限步內回報「不蘊含」', '若 KB ⊨ α 成立，完備的歸結程序終究會找到證明；若不成立，程序可能永遠跑下去', '一階邏輯的推論不完備：有些被蘊含的語句永遠證明不出來'],
      answer: 2, explanation: 'Gödel 的完備性定理保證被蘊含的語句有證明，歸結是反駁完備的；Church 與 Turing 證明蘊含不可判定，所以不成立時可能永遠找不到結論，這就是半可判定。一階的論域可以是無限的，沒有有限的真值表可以列；「不成立時一定回報」正是不可判定性否定的事；「不完備」把一階邏輯的完備性定理和 Gödel 關於算術的不完備定理混淆了。',
    },
  ],
};
