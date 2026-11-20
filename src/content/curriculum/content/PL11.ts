import type { LessonContent, Mark, TraceStep, TreeNode } from '../schema';

const code = String.raw;

/** The parser the step-by-step trace shows (Python): one function per grammar rule, the AST built as tuples. */
const traceCode = code`tokens = ["1", "+", "2", "*", "3", "$"]
pos = 0
def advance():
    global pos
    pos += 1
    return tokens[pos - 1]
def parse_expr():           # expr = term { ("+" | "-") term }
    node = parse_term()
    while tokens[pos] in ("+", "-"):
        op = advance()
        right = parse_term()
        node = (op, node, right)
    return node
def parse_term():           # term = factor { ("*" | "/") factor }
    node = parse_factor()
    while tokens[pos] in ("*", "/"):
        op = advance()
        right = parse_factor()
        node = (op, node, right)
    return node
def parse_factor():         # factor = NUMBER | "(" expr ")"
    tok = advance()
    if tok == "(":
        node = parse_expr()
        advance()           # 吃掉 ")"
        return node
    return int(tok)
tree = parse_expr()
print(tree)`;

type Rule = 'parse_expr' | 'parse_term' | 'parse_factor';
interface Ast { id: string; label: string; kids: Ast[] }
/** How Python prints a node: a number, or the tuple (op, left, right). */
const pyRepr = (a: Ast): string => a.kids.length ? `('${a.label}', ${pyRepr(a.kids[0])}, ${pyRepr(a.kids[1])})` : a.label;
const sexpr = (a: Ast): string => a.kids.length ? `(${a.label} ${sexpr(a.kids[0])} ${sexpr(a.kids[1])})` : a.label;
/** Line numbers of traceCode for each loop rule; parse_factor's are written where they are used. */
const LOOP_RULES = {
  parse_expr: { grammar: 'expr = term { ("+" | "-") term }', operand: 'parse_term', ops: ['+', '-'], layer: '加減', def: 7, first: 8, test: 9, op: 10, right: 11, build: 12, ret: 13 },
  parse_term: { grammar: 'term = factor { ("*" | "/") factor }', operand: 'parse_factor', ops: ['*', '/'], layer: '乘除', def: 14, first: 15, test: 16, op: 17, right: 18, build: 19, ret: 20 },
} as const;

/**
 * Runs the parser of traceCode on `tokens` (the same rules, line by line) and records a step for every line it runs
 * that changes something: the call stack (one frame per parse function, with its local variables and what it returns)
 * and the AST, a forest of the subtrees built so far that grows as the functions return. Nothing here is written by hand.
 */
function parseSteps(tokens: string[]): TraceStep[] {
  const steps: TraceStep[] = [];
  const frames: NonNullable<TraceStep['frames']> = [];
  const nodes: TreeNode[] = [];
  let roots: string[] = [];
  let pos = 0, made = 0;
  const shownTokens = `[${tokens.map(t => `'${t}'`).join(', ')}]`;
  const globals: Record<string, string> = { tokens: shownTokens };
  const record = (line: number, note: string, marks: { id: string; kind: Mark }[] = [], extra: Partial<TraceStep> = {}) => steps.push({
    line, note, vars: { ...globals, pos: String(pos), 'tokens[pos]': `'${tokens[pos]}'` },
    frames: frames.map(f => ({ ...f, vars: { ...f.vars } })),
    tree: { name: 'AST', nodes: nodes.map(n => ({ ...n, children: [...(n.children ?? [])] })), roots: [...roots], marks },
    ...extra,
  });
  const advance = () => tokens[pos++];
  const leaf = (label: string): Ast => {
    const a = { id: `n${++made}`, label, kids: [] };
    nodes.push({ id: a.id, label, children: [] });
    roots.push(a.id);
    return a;
  };
  const join = (label: string, left: Ast, right: Ast): Ast => {
    const a = { id: `n${++made}`, label, kids: [left, right] };
    nodes.push({ id: a.id, label, children: [left.id, right.id] });
    roots = roots.flatMap(id => id === left.id ? [a.id] : id === right.id ? [] : [id]);
    return a;
  };

  function call(rule: Rule, caller: string, line: number): Ast {
    frames.push({ name: `${rule}()`, vars: {} });
    const what = rule === 'parse_factor' ? 'factor = NUMBER | "(" expr ")"，是文法最底層：只看一個 token 就知道是數字還是左括號'
      : `${LOOP_RULES[rule].grammar}，先呼叫 ${LOOP_RULES[rule].operand} 取得第一個運算元`;
    record(rule === 'parse_factor' ? 21 : LOOP_RULES[rule].def, `${caller}在第 ${line} 行呼叫 ${rule}()，對應規則 ${what}。呼叫堆疊現在有 ${frames.length} 層。`);
    const result = rule === 'parse_factor' ? factor() : loop(rule);
    frames.pop();
    return result;
  }

  function loop(rule: 'parse_expr' | 'parse_term'): Ast {
    const r = LOOP_RULES[rule], frame = frames[frames.length - 1];
    let node = call(r.operand, `${rule} `, r.first);
    frame.vars.node = pyRepr(node);
    record(r.first, `${r.operand}() 回傳 \`${pyRepr(node)}\`，它的框架彈出；回到 ${rule}，存進 node。`, [{ id: node.id, kind: 'read' }]);
    for (;;) {
      const next = tokens[pos];
      if (!(r.ops as readonly string[]).includes(next)) {
        const why = next === '$' ? '是 `$`（輸入結束）' : `是 \`${next}\``;
        const pass = rule === 'parse_term' && next !== '$' ? `${r.layer}層不處理 \`${next}\`，把它留給等待中的 parse_expr。` : '';
        record(r.test, `下一個 token ${why}，不是 ${r.ops.join(' 或 ')}，while 不成立。${pass}`);
        break;
      }
      record(r.test, `下一個 token 是 \`${next}\`，while 成立：${r.layer}由 ${rule} 這一層處理。`);
      const op = advance();
      frame.vars.op = `'${op}'`;
      record(r.op, `advance() 取走運算子 \`${op}\`，pos 前進到 ${pos}。左運算元已經在 node 裡（\`${pyRepr(node)}\`），接著解析右運算元。`);
      const right = call(r.operand, `${rule} `, r.right);
      frame.vars.right = pyRepr(right);
      record(r.right, `${r.operand}() 回傳 \`${pyRepr(right)}\`，存進 right。`, [{ id: right.id, kind: 'read' }]);
      const left = node;
      node = join(op, left, right);
      frame.vars.node = pyRepr(node);
      const deeper = right.kids.length
        ? `右子樹 \`${sexpr(right)}\` 是下層函式整個建好才回傳的，所以 \`${right.label}\` 在 \`${op}\` 的下面：求值時先算子樹，\`${op}\` 最後才算。`
        : left.kids.length ? `舊的 node 變成左子樹，這就是迴圈造成的左結合。` : `\`${sexpr(node)}\` 已經組成一棵子樹。`;
      record(r.build, `建立 AST 節點 \`${op}\`：左子樹 \`${sexpr(left)}\`、右子樹 \`${sexpr(right)}\`，node 變成 \`${pyRepr(node)}\`。${deeper}`, [{ id: node.id, kind: 'write' }]);
    }
    frame.returns = pyRepr(node);
    record(r.ret, `${rule} 回傳 \`${pyRepr(node)}\`。`, [{ id: node.id, kind: 'current' }]);
    return node;
  }

  function factor(): Ast {
    const frame = frames[frames.length - 1];
    const tok = advance();
    frame.vars.tok = `'${tok}'`;
    record(22, `advance() 取走 token \`${tok}\`，pos 前進到 ${pos}。`);
    if (tok === '(') {
      record(23, '`tok` 是左括號：括號裡面是一個完整的 expr，回到最上層的規則重新開始。');
      const inner = call('parse_expr', 'parse_factor ', 24);
      frame.vars.node = pyRepr(inner);
      record(24, `parse_expr() 回傳 \`${pyRepr(inner)}\`，存進 node。`, [{ id: inner.id, kind: 'read' }]);
      advance();
      record(25, 'advance() 吃掉右括號。括號只決定分組，不會成為 AST 的節點。');
      frame.returns = pyRepr(inner);
      record(26, `parse_factor 回傳 \`${pyRepr(inner)}\`。`, [{ id: inner.id, kind: 'current' }]);
      return inner;
    }
    const a = leaf(tok);
    frame.returns = tok;
    record(27, `\`${tok}\` 不是左括號，第 23 行的 if 不成立，把它轉成整數回傳。AST 多了葉節點 ${tok}（數字沒有子節點）；它還沒有父節點，暫時是一棵獨立的樹。`, [{ id: a.id, kind: 'write' }]);
    return a;
  }

  steps.push({ line: 1, note: '輸入是 lexer（PL10）切好的 token 串列，最後的 `$` 標記輸入結束，讓 `tokens[pos]` 永遠有東西可看。', vars: { tokens: shownTokens } });
  record(2, 'pos 是下一個要讀的 token 的位置。解析器只往前看一個 token（`tokens[pos]`）就決定要走哪一條規則。');
  const tree = call('parse_expr', '主程式', 28);
  globals.tree = pyRepr(tree);
  record(28, `parse_expr() 回傳整棵 AST，存進 tree。pos 停在 \`$\`：所有 token 都用完了，呼叫堆疊清空。`, [{ id: tree.id, kind: 'found' }]);
  record(29, `印出 \`${pyRepr(tree)}\`，寫成括號式就是 \`${sexpr(tree)}\`。根是 \`${tree.label}\`，它最後才算；乘法在它的子樹裡，所以先乘後加。`,
    nodes.map(n => ({ id: n.id, kind: 'visited' as const })), { output: pyRepr(tree) });
  return steps;
}

/**
 * PL11 語法分析與抽象語法樹. Every example and the reference solutions run in tests/curriculum-code.test.ts (C++17,
 * Java 17, Python 3, Node.js). The blueprint activity ast-explorer is not built, so the lesson uses the shared
 * tree-traversal trace: the call stack of the parse functions (frames) and the AST growing as they return (tree), both
 * recorded by parseSteps, which runs the trace's parser on the tokens of 1 + 2 * 3. The exercise outputs were generated
 * by running the four reference solutions, which agree.
 */
export const PL11: LessonContent = {
  lessonId: 'PL11',
  motivation: '計算機要先知道 `1 + 2 * 3` 是 7 不是 9，試算表要讀懂 `=SUM(A1:A3)*2`，編譯器、SQL 資料庫、設定檔與範本引擎都要先把 token 組成有結構的資料，才知道「誰是誰的運算元」。這一步叫語法分析：依照文法把 PL10 切好的 token 串列變成一棵抽象語法樹（AST）。學會讀 BNF／EBNF 文法、用遞迴下降寫解析器，就能為自己的小語言、指令或公式加上正確的優先順序，並在使用者打錯時指出「第幾欄少了右括號」；也會明白為什麼有些文法有歧義、為什麼 `8 - 3 - 2` 的括號要從左邊加起。',
  sections: [
    {
      id: 'grammar', title: '文法：哪些 token 排列是合法的',
      blocks: [
        { type: 'p', text: 'PL10 的 lexer 把 `1 + 2 * 3` 切成 5 個 token，但它不管排列：`1 + * 2`、`) 3 (` 也都是合法的 token 串列。決定「哪些排列是合法的程式」的是文法（grammar）。文法是一組規則，也叫產生式（production）：左邊是一個非終端符號（nonterminal，代表一類結構，例如「運算式」），右邊是它可以換成的符號序列，其中可以有終端符號（terminal，也就是 token，例如 `+`、`NUMBER`）與其他非終端符號。' },
        { type: 'p', text: '最常見的寫法是 BNF（Backus–Naur Form）：非終端符號寫在角括號裡，`::=` 讀作「可以是」，`|` 分隔幾種選擇。BNF 只有這幾個符號，所以「重複」要用遞迴表達：`<expr> ::= <expr> "+" <term>` 表示一個 expr 可以是「另一個 expr 加一個 term」。EBNF（Extended BNF）多了重複與可省略的寫法，同一條規則可以寫得更短。下表是本課的四則運算文法，三條規則分成三個層次：' },
        { type: 'table', head: ['規則', 'BNF', 'EBNF'], rows: [
          ['運算式', '`<expr> ::= <expr> "+" <term> | <expr> "-" <term> | <term>`', '`expr = term { ("+" | "-") term } ;`'],
          ['項', '`<term> ::= <term> "*" <factor> | <term> "/" <factor> | <factor>`', '`term = factor { ("*" | "/") factor } ;`'],
          ['因子', '`<factor> ::= NUMBER | "(" <expr> ")"`', '`factor = NUMBER | "(" expr ")" ;`'],
        ] },
        { type: 'table', head: ['EBNF 符號', '意思', '例子'], rows: [
          ['`"+"`', '終端符號：一定要出現這個 token', '`"(" expr ")"` 要有左右括號'],
          ['`{ x }`', 'x 重複 0 次以上', '`term { "+" term }` 是 1 個以上的 term 用 + 連起來'],
          ['`[ x ]`', 'x 可有可無（0 或 1 次）', '`NUMBER [ "^" power ]`'],
          ['`( a | b )`', '分組，從 a、b 中選一個', '`("+" | "-")`'],
          ['`;`', '一條規則結束', ''],
        ] },
        { type: 'p', text: '要判斷一個字串是否合乎文法，就從起始符號 expr 開始，每次把一個非終端符號換成它的某一種右邊，直到只剩 token，這個過程叫推導（derivation）。`1 + 2 * 3` 依 BNF 的最左推導（每次換最左邊的非終端符號）是：' },
        { type: 'list', ordered: true, items: [
          '`expr` ⇒ `expr + term`（選第一種）',
          '⇒ `term + term` ⇒ `factor + term` ⇒ `1 + term`（左邊的 expr 只剩一個數字）',
          '⇒ `1 + term * factor`（右邊的 term 選「term 乘 factor」）',
          '⇒ `1 + factor * factor` ⇒ `1 + 2 * factor` ⇒ `1 + 2 * 3`',
        ] },
        { type: 'p', text: '把推導過程畫成樹，根是 expr，每次替換就是一個節點長出子節點，葉子由左到右讀就是原本的 token，這棵樹叫語法樹（parse tree）。注意第 1 步就決定了 `+` 在最上面，`*` 是在 `+` 右邊的 term 裡面才出現的：文法的層次已經把「先乘後加」寫進樹的形狀。`2 (3 + 4)` 則推導不出來：數學課的「省略乘號」在這個文法裡沒有對應的規則。' },
      ],
    },
    {
      id: 'recursive-descent', title: '遞迴下降：每條規則寫成一個函式',
      blocks: [
        { type: 'p', text: '有了 EBNF，解析器幾乎可以照抄：每個非終端符號寫成一個函式，函式的內容就是規則的右邊。這種由上往下、一層呼叫一層的寫法叫遞迴下降（recursive descent），是許多手寫解析器的做法，例如 GCC 與 Clang 的 C++ 前端。它用一個索引 `pos` 指向下一個 token，只需要偷看（peek）這一個 token 就能決定走哪一條路；這種「從左讀、一次看一個 token 就決定」的文法稱為 LL(1)。翻譯規則如下：' },
        { type: 'table', head: ['EBNF', '程式'], rows: [
          ['非終端符號 `term`', '呼叫函式 `term()`，取得它回傳的子樹'],
          ['終端符號 `")"`', '確認目前的 token 是 `)`，然後 `pos` 前進；不是就回報錯誤'],
          ['`{ ("+" | "-") term }`', '`while` 下一個 token 是 `+` 或 `-`：吃掉它，再呼叫 `term()`'],
          ['`[ "^" power ]`', '`if` 下一個 token 是 `^`：吃掉它，再呼叫 `power()`'],
          ['`NUMBER | "(" expr ")"`', '`if` 看下一個 token 是數字還是 `(`，走對應的分支'],
        ] },
        { type: 'p', text: '下面的四種語言版本各有 `expr`、`term`、`factor` 三個函式，彼此呼叫的關係就是文法的層次。每個函式回傳它解析出來那一段的 AST，以括號式（S-expression）表示：`(運算子 左子樹 右子樹)`，數字就是它自己，所以 `(+ 1 (* 2 3))` 表示根是 `+`、右子樹是 `2 * 3`。為了專注在解析，本例的 token 以空白分開（lexer 在 PL10 學過），最後補一個 `$` 代表輸入結束，`toks[pos]` 就永遠不會越界。' },
        { type: 'example', id: 'first-parser' },
        { type: 'p', text: '下方的逐步執行用 Python 版本解析 `1 + 2 * 3`，AST 以 tuple 表示：`(op, 左, 右)`。看呼叫堆疊的變化：`parse_expr` 呼叫 `parse_term`，`parse_term` 再呼叫 `parse_factor`，一路下降到數字才開始回傳；每個函式回傳時，AST 面板就多了它建好的子樹。函式在等待時，它的區域變數（已經解析好的左運算元）都還留在自己的框架裡，這正是遞迴替我們記住的東西。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：照抄左遞迴的 BNF，函式永遠呼叫自己', text: 'BNF 的 `<expr> ::= <expr> "+" <term>` 直接翻成程式，`parse_expr` 的第一行就是 `left = parse_expr()`：還沒讀任何 token、`pos` 沒有前進就呼叫自己，於是無限遞迴，Python 丟出 `RecursionError`，C++ 與 Java 則是堆疊溢位。這種規則叫左遞迴（left recursion），遞迴下降不能直接處理。解法是改寫成 EBNF 的迴圈 `expr = term { "+" term }`：它描述的字串完全相同，但先吃掉一個 term 才開始重複，每一輪都讓 `pos` 前進。' },
      ],
    },
    {
      id: 'precedence', title: '優先順序與結合性寫在文法的層次裡',
      blocks: [
        { type: 'p', text: '為什麼 `1 + 2 * 3` 會先乘後加？解析器裡沒有任何「乘法優先」的判斷，答案在文法的層次：`+` 只出現在最上層的 expr，`*` 在下一層的 term。parse_expr 讀到 `+` 之後，呼叫 parse_term 取得右運算元，而 parse_term 會把 `2 * 3` 整段吃完才回傳，所以 `*` 的節點一定在 `+` 的下面。求值時要先知道子樹的值才能算父節點，也就是 D13 的後序走訪：越深的運算越先算。規則很簡單：優先順序（precedence）越低的運算子放在越上層，越高的放在越下層；括號回到最上層的 expr，所以 `(1 + 2) * 3` 的 `+` 會被包在 `*` 底下。' },
        { type: 'p', text: '同一層的運算子連續出現時，誰先算由結合性（associativity）決定。減法與除法是左結合：`8 - 3 - 2` 是 `(8 - 3) - 2 = 3`。迴圈天生是左結合：每一輪都把「到目前為止的整棵樹」當成新節點的左子樹，`node = (op, node, right)`，樹往左下長。次方通常是右結合：`2 ^ 3 ^ 2` 是 `2 ^ (3 ^ 2) = 2 ^ 9 = 512`，不是 `(2 ^ 3) ^ 2 = 64`。右結合用遞迴：`power = NUMBER [ "^" power ]`，`^` 的右邊再呼叫一次 power，把後面整段都收進右子樹。' },
        { type: 'table', head: ['層次', '運算子', '結合性', 'EBNF 寫法'], rows: [
          ['expr（最低）', '`+` `-`', '左', '`expr = term { ("+" | "-") term }`（迴圈）'],
          ['term', '`*` `/`', '左', '`term = factor { ("*" | "/") factor }`（迴圈）'],
          ['power', '`^`', '右', '`power = factor [ "^" power ]`（遞迴）'],
          ['factor（最高）', '數字、括號、一元負號', '—', '`factor = NUMBER | "(" expr ")" | "-" factor`'],
        ] },
        { type: 'example', id: 'associativity' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：為了避開左遞迴，把 - 寫成右結合', text: '知道左遞迴不能用之後，很多人把規則改成右遞迴 `expr = term [ "-" expr ]`，程式也確實不再無限遞迴，但 `8 - 3 - 2` 會解析成 `(- 8 (- 3 2))`，算出 7 而不是 3。程式不會報錯，只是答案錯，而且只有連續兩個以上的 `-` 或 `/` 才看得出來（`1 + 2 + 3` 左右結合結果相同，加法與乘法剛好滿足結合律）。左結合的運算子用迴圈，右結合的運算子才用遞迴。' },
        { type: 'p', text: '一元負號也是優先順序的問題。PL10 提到 lexer 把 `-5` 切成 `-` 與 `5`，由 parser 決定它是減號還是負號：在 factor 開頭看到的 `-` 是負號（前面沒有運算元），在運算元後面看到的是減號。把負號放在 factor 這一層，`-2 * 3` 就是 `(* (neg 2) 3)`。各語言不一定相同：Python 的 `**` 比負號優先，`-2 ** 2` 是 `-(2 ** 2)`，結果是 -4；JavaScript 乾脆不允許 `-2 ** 2`，直接回報 SyntaxError，要求寫括號。' },
      ],
    },
    {
      id: 'cst-ast', title: '具體語法樹與抽象語法樹（AST）',
      blocks: [
        { type: 'p', text: '照著推導畫出來的語法樹也叫具體語法樹（concrete syntax tree，CST）：每套用一次規則就有一個節點，每個 token 都是一片葉子，括號也在裡面。後面的階段（求值、型別檢查、產生程式碼）不需要這麼多細節：`7` 在 CST 裡是 expr → term → factor → 7 四層，但意思只是「數字 7」；括號的作用是分組，分組一旦反映在樹的形狀上，括號本身就沒用了。只留下運算子與運算元的樹叫抽象語法樹（abstract syntax tree，AST）。下面的解析器每個函式同時建立兩種樹：' },
        { type: 'example', id: 'cst-vs-ast' },
        { type: 'table', head: ['', '具體語法樹（CST）', '抽象語法樹（AST）'], rows: [
          ['節點', '每次套用規則一個節點，加上每個 token', '運算子是內部節點，運算元是子節點'],
          ['括號', '保留 `(` 與 `)`', '不保留：`(1 + 2) * 3` 與 `((1 + 2)) * 3` 的 AST 相同'],
          ['只有一個子節點的鏈', '`expr → term → factor` 都在', '省略，直接是運算元'],
          ['誰會用', '格式化工具、需要保留原文的重構工具', '直譯器（PL12）、編譯器、靜態分析'],
        ] },
        { type: 'p', text: 'AST 就是 D13 的一般樹，括號式正好是它的前序走訪：先寫根（運算子），再依序寫各個子樹，每棵子樹用一對括號包住，所以同一棵樹永遠印出同一個字串，很適合拿來比對與測試。實際的語言會為每種節點定義類別（C++ 的 struct、Java 的 record、Python 的 class），本課為了短，用字串或 tuple 表示。Python 把自己的 AST 開放給程式使用：`ast.dump(ast.parse("1 + 2 * 3", mode="eval"))` 印出的結構是 `BinOp(left=Constant(value=1), op=Add(), right=BinOp(...))`（細節依版本略有不同），和本課的 `(+ 1 (* 2 3))` 是同一棵樹。' },
      ],
    },
    {
      id: 'ambiguity', title: '語法歧義：一個字串，兩棵樹',
      blocks: [
        { type: 'p', text: '只要有一個字串能畫出兩棵不同的語法樹，這個文法就有歧義（ambiguous）。最典型的例子是看起來最簡單的寫法 `<E> ::= <E> "+" <E> | <E> "*" <E> | NUMBER`：`1 + 2 * 3` 可以先把 `1 + 2` 組成 E，也可以先把 `2 * 3` 組成 E，兩棵樹算出 7 與 9。文法本身沒有說哪一棵才對，解析器的結果就取決於實作的細節。下面的程式列出歧義文法下的每一棵樹：選一個運算子當根，左邊與右邊再分別用同樣的方法展開。' },
        { type: 'example', id: 'ambiguous-trees' },
        { type: 'p', text: '樹的數目也照同樣的想法計算：每個運算子都可以當根，根左右兩段各自有幾種樹相乘，再把所有根的選擇加起來。1 個運算子只有 1 棵樹，2 個運算子有 1 + 1 = 2 棵，運算子越多，樹的數目增加得越快。消除歧義的方法就是前面的分層文法：expr 的運算元只能是 term，term 的運算元只能是 factor，而迴圈決定了同一層由左往右組合，於是每個字串只剩下一棵樹。分層文法與歧義文法接受的字串完全一樣，差別只在於樹是不是唯一的。' },
        { type: 'p', text: '另一個有名的歧義是懸置 else（dangling else）：`<stmt> ::= if (<cond>) <stmt> | if (<cond>) <stmt> else <stmt> | …`。`if (a) if (b) x(); else y();` 的 else 可以屬於外層的 if，也可以屬於內層的 if。C、C++、Java、JavaScript 的規定都是「else 配給最近的、還沒有 else 的 if」，遞迴下降解析器在內層的 if 看到 else 就直接吃掉，自然得到這個結果。Python 則用縮排決定 else 屬於哪一個 if，從語法上避開了這個問題。' },
        { type: 'callout', tone: 'note', title: '縮排騙不了 C++ 的解析器', text: '在 C++、Java、JavaScript 中，把 else 和外層的 if 對齊，它仍然屬於內層的 if：解析器只看 token，不看縮排。clang 對這種寫法會發出 `-Wdangling-else` 警告，GCC 在 `-Wall` 下也會建議加上大括號。最可靠的做法是巢狀的 if 一律加上 `{ }`，讓樹只有一種畫法。' },
      ],
    },
    {
      id: 'errors', title: '語法錯誤：回報出錯的 token 在哪裡',
      blocks: [
        { type: 'p', text: '遞迴下降解析器在每個位置都知道「現在需要什麼」：factor 開頭需要數字或 `(`；解析完括號裡的 expr 之後需要 `)`；整個 expr 解析完之後需要輸入結束。下一個 token 不符合時，就是語法錯誤，要回報的位置是這個不符合的 token 的欄號，所以 PL10 的 token 除了原文還要帶著欄號。輸入結束也當成一個 token，它的欄號是「長度加 1」，`1 +` 的錯誤就回報在第 4 欄，告訴使用者「這裡還缺東西」。' },
        { type: 'table', head: ['輸入', '解析器在哪裡停下', '回報（本課練習的格式）'], rows: [
          ['`(8 / ) 2`', 'term 讀到 `/` 後呼叫 factor，下一個 token 是 `)`', '`error at column 6: expected number, \'(\' or \'-\'`'],
          ['`4 * (2 + 3`', '括號裡的 expr 結束了，需要 `)`，卻是輸入結束', '`error at column 11: expected \')\'`'],
          ['`7 8`', '`7` 是完整的 expr，但後面還有 token', '`error at column 3: expected end of input`'],
          ['`5 # 3`', 'lexer 就發現 `#` 不是任何 token', '`error at column 3: unexpected character \'#\'`'],
        ] },
        { type: 'p', text: '注意第一列：錯誤是在 `)` 上被發現的（第 6 欄），而不是在 `/` 上，因為 `8 /` 本身沒有錯，要看到下一個 token 才知道少了運算元。第三列也一樣，`7 8` 的 `7` 已經是一個完整的運算式，只有在「應該結束卻還有 token」時才會發現多了東西。把錯誤做成例外（PL09）往外丟，就不必在每一層函式檢查回傳值：在最外層捕捉一次、印出欄號與訊息即可。' },
        { type: 'p', text: '本課的練習在第一個錯誤就停下來。編譯器則會試著恢復（error recovery），例如跳到下一個 `;` 或 `}` 再繼續解析，一次列出多個錯誤；代價是後面的錯誤可能是第一個錯誤連帶造成的，所以修正編譯錯誤時，先看第一個最可靠。' },
      ],
    },
  ],
  examples: [
    {
      id: 'first-parser', title: '第一個遞迴下降解析器', description: '三條規則 expr、term、factor 各寫成一個函式，回傳子樹的括號式；為了專注在解析，本例的 token 以空白分開。',
      output: '1 + 2 * 3 => (+ 1 (* 2 3))\n( 1 + 2 ) * 3 => (* (+ 1 2) 3)\n8 / 4 / 2 => (/ (/ 8 4) 2)\n2 * ( 3 + 4 ) - 5 => (- (* 2 (+ 3 4)) 5)',
      code: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <vector>

std::vector<std::string> toks;  // token 以空白分開，最後補上 "$" 標記輸入結束
std::size_t pos = 0;
std::string expr();
std::string term();
std::string factor();

std::string expr() {  // expr = term { ("+" | "-") term }
    std::string node = term();
    while (toks[pos] == "+" || toks[pos] == "-") {
        const std::string op = toks[pos++];
        const std::string right = term();
        node = "(" + op + " " + node + " " + right + ")";
    }
    return node;
}
std::string term() {  // term = factor { ("*" | "/") factor }
    std::string node = factor();
    while (toks[pos] == "*" || toks[pos] == "/") {
        const std::string op = toks[pos++];
        const std::string right = factor();
        node = "(" + op + " " + node + " " + right + ")";
    }
    return node;
}
std::string factor() {  // factor = NUMBER | "(" expr ")"
    const std::string tok = toks[pos++];
    if (tok != "(") return tok;
    const std::string node = expr();
    ++pos;  // 吃掉 ")"
    return node;
}

int main() {
    const std::vector<std::string> inputs = {"1 + 2 * 3", "( 1 + 2 ) * 3", "8 / 4 / 2", "2 * ( 3 + 4 ) - 5"};
    for (const std::string& src : inputs) {
        std::istringstream in(src);
        toks.clear();
        for (std::string t; in >> t;) toks.push_back(t);
        toks.push_back("$");
        pos = 0;
        std::cout << src << " => " << expr() << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static List<String> toks;  // token 以空白分開，最後補上 "$" 標記輸入結束
    static int pos;

    static String expr() {  // expr = term { ("+" | "-") term }
        String node = term();
        while (toks.get(pos).equals("+") || toks.get(pos).equals("-")) {
            String op = toks.get(pos++);
            String right = term();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }

    static String term() {  // term = factor { ("*" | "/") factor }
        String node = factor();
        while (toks.get(pos).equals("*") || toks.get(pos).equals("/")) {
            String op = toks.get(pos++);
            String right = factor();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }

    static String factor() {  // factor = NUMBER | "(" expr ")"
        String tok = toks.get(pos++);
        if (!tok.equals("(")) return tok;
        String node = expr();
        pos++;  // 吃掉 ")"
        return node;
    }

    public static void main(String[] args) {
        for (String src : List.of("1 + 2 * 3", "( 1 + 2 ) * 3", "8 / 4 / 2", "2 * ( 3 + 4 ) - 5")) {
            toks = new ArrayList<>(List.of(src.split(" ")));
            toks.add("$");
            pos = 0;
            System.out.println(src + " => " + expr());
        }
    }
}`,
        Python: code`def parse(src):
    toks, pos = src.split() + ["$"], 0      # token 以空白分開，"$" 標記輸入結束

    def advance():
        nonlocal pos
        pos += 1
        return toks[pos - 1]

    def expr():                             # expr = term { ("+" | "-") term }
        node = term()
        while toks[pos] in ("+", "-"):
            op = advance()
            right = term()
            node = f"({op} {node} {right})"
        return node

    def term():                             # term = factor { ("*" | "/") factor }
        node = factor()
        while toks[pos] in ("*", "/"):
            op = advance()
            right = factor()
            node = f"({op} {node} {right})"
        return node

    def factor():                           # factor = NUMBER | "(" expr ")"
        tok = advance()
        if tok == "(":
            node = expr()
            advance()                       # 吃掉 ")"
            return node
        return tok

    return expr()


for src in ["1 + 2 * 3", "( 1 + 2 ) * 3", "8 / 4 / 2", "2 * ( 3 + 4 ) - 5"]:
    print(src, "=>", parse(src))`,
        JavaScript: code`function parse(src) {
    const toks = [...src.split(" "), "$"];  // token 以空白分開，"$" 標記輸入結束
    let pos = 0;

    function expr() {  // expr = term { ("+" | "-") term }
        let node = term();
        while (toks[pos] === "+" || toks[pos] === "-") {
            const op = toks[pos++];
            const right = term();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }
    function term() {  // term = factor { ("*" | "/") factor }
        let node = factor();
        while (toks[pos] === "*" || toks[pos] === "/") {
            const op = toks[pos++];
            const right = factor();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }
    function factor() {  // factor = NUMBER | "(" expr ")"
        const tok = toks[pos++];
        if (tok !== "(") return tok;
        const node = expr();
        pos++;  // 吃掉 ")"
        return node;
    }
    return expr();
}

for (const src of ["1 + 2 * 3", "( 1 + 2 ) * 3", "8 / 4 / 2", "2 * ( 3 + 4 ) - 5"]) {
    console.log(src + " => " + parse(src));
}`,
      },
    },
    {
      id: 'associativity', title: '左結合用迴圈、右結合用遞迴', description: '同樣是 `8 - 3 - 2`，迴圈得到 `(- (- 8 3) 2)`，改成遞迴卻得到 `(- 8 (- 3 2))`；`^` 則應該用遞迴。',
      output: 'loop: 8 - 3 - 2 => (- (- 8 3) 2)\nrecursion: 8 - 3 - 2 => (- 8 (- 3 2))\nloop: 2 ^ 3 ^ 2 - 1 => (- (^ 2 (^ 3 2)) 1)',
      code: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <vector>

std::vector<std::string> toks;
std::size_t pos = 0;

std::string power() {  // power = NUMBER [ "^" power ]：右結合，用遞迴
    const std::string base = toks[pos++];
    if (toks[pos] != "^") return base;
    ++pos;
    return "(^ " + base + " " + power() + ")";
}
std::string minusLoop() {  // expr = power { "-" power }：左結合，用迴圈
    std::string node = power();
    while (toks[pos] == "-") {
        ++pos;
        const std::string right = power();
        node = "(- " + node + " " + right + ")";
    }
    return node;
}
std::string minusRecursive() {  // expr = power [ "-" expr ]：錯成右結合
    const std::string left = power();
    if (toks[pos] != "-") return left;
    ++pos;
    return "(- " + left + " " + minusRecursive() + ")";
}

int main() {
    const std::string names[] = {"loop", "recursion", "loop"};
    const std::string inputs[] = {"8 - 3 - 2", "8 - 3 - 2", "2 ^ 3 ^ 2 - 1"};
    for (int i = 0; i < 3; ++i) {
        std::istringstream in(inputs[i]);
        toks.clear();
        for (std::string t; in >> t;) toks.push_back(t);
        toks.push_back("$");
        pos = 0;
        const std::string tree = i == 1 ? minusRecursive() : minusLoop();
        std::cout << names[i] << ": " << inputs[i] << " => " << tree << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

public class Main {
    static List<String> toks;
    static int pos;

    static String power() {  // power = NUMBER [ "^" power ]：右結合，用遞迴
        String base = toks.get(pos++);
        if (!toks.get(pos).equals("^")) return base;
        pos++;
        return "(^ " + base + " " + power() + ")";
    }

    static String minusLoop() {  // expr = power { "-" power }：左結合，用迴圈
        String node = power();
        while (toks.get(pos).equals("-")) {
            pos++;
            node = "(- " + node + " " + power() + ")";
        }
        return node;
    }

    static String minusRecursive() {  // expr = power [ "-" expr ]：錯成右結合
        String left = power();
        if (!toks.get(pos).equals("-")) return left;
        pos++;
        return "(- " + left + " " + minusRecursive() + ")";
    }

    static void show(String name, Supplier<String> rule, String src) {
        toks = new ArrayList<>(List.of(src.split(" ")));
        toks.add("$");
        pos = 0;
        System.out.println(name + ": " + src + " => " + rule.get());
    }

    public static void main(String[] args) {
        show("loop", Main::minusLoop, "8 - 3 - 2");
        show("recursion", Main::minusRecursive, "8 - 3 - 2");
        show("loop", Main::minusLoop, "2 ^ 3 ^ 2 - 1");
    }
}`,
        Python: code`toks, pos = [], 0


def advance():
    global pos
    pos += 1
    return toks[pos - 1]


def power():                    # power = NUMBER [ "^" power ]：右結合，用遞迴
    base = advance()
    if toks[pos] == "^":
        advance()
        return f"(^ {base} {power()})"
    return base


def minus_loop():               # expr = power { "-" power }：左結合，用迴圈
    node = power()
    while toks[pos] == "-":
        advance()
        node = f"(- {node} {power()})"
    return node


def minus_recursive():          # expr = power [ "-" expr ]：錯成右結合
    left = power()
    if toks[pos] == "-":
        advance()
        return f"(- {left} {minus_recursive()})"
    return left


for name, rule, src in [("loop", minus_loop, "8 - 3 - 2"), ("recursion", minus_recursive, "8 - 3 - 2"),
                        ("loop", minus_loop, "2 ^ 3 ^ 2 - 1")]:
    toks, pos = src.split() + ["$"], 0
    print(f"{name}: {src} => {rule()}")`,
        JavaScript: code`let toks = [], pos = 0;

function power() {  // power = NUMBER [ "^" power ]：右結合，用遞迴
    const base = toks[pos++];
    if (toks[pos] !== "^") return base;
    pos++;
    return "(^ " + base + " " + power() + ")";
}
function minusLoop() {  // expr = power { "-" power }：左結合，用迴圈
    let node = power();
    while (toks[pos] === "-") {
        pos++;
        node = "(- " + node + " " + power() + ")";
    }
    return node;
}
function minusRecursive() {  // expr = power [ "-" expr ]：錯成右結合
    const left = power();
    if (toks[pos] !== "-") return left;
    pos++;
    return "(- " + left + " " + minusRecursive() + ")";
}

for (const [name, rule, src] of [["loop", minusLoop, "8 - 3 - 2"], ["recursion", minusRecursive, "8 - 3 - 2"],
                                 ["loop", minusLoop, "2 ^ 3 ^ 2 - 1"]]) {
    toks = [...src.split(" "), "$"];
    pos = 0;
    console.log(name + ": " + src + " => " + rule());
}`,
      },
    },
    {
      id: 'cst-vs-ast', title: '同一個解析器，兩種樹', description: '每個函式同時建立具體語法樹（每條規則、每個 token 都留下）與 AST（只留運算子與運算元），比較兩者的大小。',
      output: 'CST: (expr (term (factor 7)))\nAST: 7\nCST: (expr (term (factor "(" (expr (term (factor 1)) "+" (term (factor 2))) ")") "*" (factor 3)))\nAST: (* (+ 1 2) 3)',
      code: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using Trees = std::pair<std::string, std::string>;  // (具體語法樹, AST)
std::vector<std::string> toks;
std::size_t pos = 0;

Trees loopRule(const std::string& name, const Trees& first, const std::string& ops, Trees (*operand)()) {
    std::string cst = "(" + name + " " + first.first, ast = first.second;
    while (toks[pos].size() == 1 && ops.find(toks[pos][0]) != std::string::npos) {
        const std::string op = toks[pos++];
        const Trees next = operand();
        cst += " \"" + op + "\" " + next.first;
        ast = "(" + op + " " + ast + " " + next.second + ")";
    }
    return {cst + ")", ast};
}
Trees expr();
Trees factor() {  // factor = NUMBER | "(" expr ")"
    const std::string tok = toks[pos++];
    if (tok != "(") return {"(factor " + tok + ")", tok};
    const Trees inner = expr();
    ++pos;
    return {"(factor \"(\" " + inner.first + " \")\")", inner.second};  // 括號只留在具體語法樹
}
Trees term() { return loopRule("term", factor(), "*/", factor); }  // term = factor { ("*" | "/") factor }
Trees expr() { return loopRule("expr", term(), "+-", term); }      // expr = term { ("+" | "-") term }

int main() {
    for (const std::string src : {"7", "( 1 + 2 ) * 3"}) {
        std::istringstream in(src);
        toks.clear();
        for (std::string t; in >> t;) toks.push_back(t);
        toks.push_back("$");
        pos = 0;
        const Trees trees = expr();
        std::cout << "CST: " << trees.first << "\nAST: " << trees.second << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

public class Main {
    record Trees(String cst, String ast) {}  // 具體語法樹與 AST

    static List<String> toks;
    static int pos;

    static Trees loopRule(String name, Trees first, String ops, Supplier<Trees> operand) {
        String cst = "(" + name + " " + first.cst(), ast = first.ast();
        while (toks.get(pos).length() == 1 && ops.contains(toks.get(pos))) {
            String op = toks.get(pos++);
            Trees next = operand.get();
            cst += " \"" + op + "\" " + next.cst();
            ast = "(" + op + " " + ast + " " + next.ast() + ")";
        }
        return new Trees(cst + ")", ast);
    }

    static Trees expr() { return loopRule("expr", term(), "+-", Main::term); }      // expr = term { ("+" | "-") term }
    static Trees term() { return loopRule("term", factor(), "*/", Main::factor); }  // term = factor { ("*" | "/") factor }

    static Trees factor() {  // factor = NUMBER | "(" expr ")"
        String tok = toks.get(pos++);
        if (!tok.equals("(")) return new Trees("(factor " + tok + ")", tok);
        Trees inner = expr();
        pos++;
        return new Trees("(factor \"(\" " + inner.cst() + " \")\")", inner.ast());  // 括號只留在具體語法樹
    }

    public static void main(String[] args) {
        for (String src : List.of("7", "( 1 + 2 ) * 3")) {
            toks = new ArrayList<>(List.of(src.split(" ")));
            toks.add("$");
            pos = 0;
            Trees trees = expr();
            System.out.println("CST: " + trees.cst() + "\nAST: " + trees.ast());
        }
    }
}`,
        Python: code`toks, pos = [], 0


def advance():
    global pos
    pos += 1
    return toks[pos - 1]


def loop_rule(name, first, ops, operand):   # 回傳 (具體語法樹, AST)
    cst, ast = f"({name} {first[0]}", first[1]
    while toks[pos] in ops:
        op = advance()
        c, a = operand()
        cst += f' "{op}" {c}'
        ast = f"({op} {ast} {a})"
    return cst + ")", ast


def expr():                                 # expr = term { ("+" | "-") term }
    return loop_rule("expr", term(), ("+", "-"), term)


def term():                                 # term = factor { ("*" | "/") factor }
    return loop_rule("term", factor(), ("*", "/"), factor)


def factor():                               # factor = NUMBER | "(" expr ")"
    tok = advance()
    if tok != "(":
        return f"(factor {tok})", tok
    cst, ast = expr()
    advance()
    return f'(factor "(" {cst} ")")', ast   # 括號只留在具體語法樹


for src in ["7", "( 1 + 2 ) * 3"]:
    toks, pos = src.split() + ["$"], 0
    cst, ast = expr()
    print("CST:", cst)
    print("AST:", ast)`,
        JavaScript: code`let toks = [], pos = 0;

function loopRule(name, [firstCst, firstAst], ops, operand) {  // 回傳 [具體語法樹, AST]
    let cst = "(" + name + " " + firstCst, ast = firstAst;
    while (ops.includes(toks[pos])) {
        const op = toks[pos++];
        const [c, a] = operand();
        cst += ' "' + op + '" ' + c;
        ast = "(" + op + " " + ast + " " + a + ")";
    }
    return [cst + ")", ast];
}
const expr = () => loopRule("expr", term(), ["+", "-"], term);    // expr = term { ("+" | "-") term }
const term = () => loopRule("term", factor(), ["*", "/"], factor);  // term = factor { ("*" | "/") factor }
function factor() {  // factor = NUMBER | "(" expr ")"
    const tok = toks[pos++];
    if (tok !== "(") return ["(factor " + tok + ")", tok];
    const [cst, ast] = expr();
    pos++;
    return ['(factor "(" ' + cst + ' ")")', ast];  // 括號只留在具體語法樹
}

for (const src of ["7", "( 1 + 2 ) * 3"]) {
    toks = [...src.split(" "), "$"];
    pos = 0;
    const [cst, ast] = expr();
    console.log("CST: " + cst + "\nAST: " + ast);
}`,
      },
    },
    {
      id: 'ambiguous-trees', title: '歧義文法的所有語法樹', description: '用 `E = E op E | NUMBER` 列出一串 token 的每一種樹：每個運算子都可能是根，不同的樹算出不同的值。',
      output: '1 + 2 * 3: 2 trees\n  (+ 1 (* 2 3)) = 7\n  (* (+ 1 2) 3) = 9\n8 - 3 - 2: 2 trees\n  (- 8 (- 3 2)) = 7\n  (- (- 8 3) 2) = 3',
      code: {
        'C++': code`#include <iostream>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using Tree = std::pair<std::string, long long>;  // 括號式與它的值

// 歧義文法 E = E op E | NUMBER 的所有語法樹：toks[lo..hi) 中每個運算子都可能是根。
std::vector<Tree> trees(const std::vector<std::string>& toks, std::size_t lo, std::size_t hi) {
    if (hi - lo == 1) return {{toks[lo], std::stoll(toks[lo])}};
    std::vector<Tree> found;
    for (std::size_t k = lo + 1; k < hi; k += 2) {
        const std::string& op = toks[k];
        for (const Tree& l : trees(toks, lo, k))
            for (const Tree& r : trees(toks, k + 1, hi)) {
                const long long value = op == "+" ? l.second + r.second : op == "-" ? l.second - r.second : l.second * r.second;
                found.push_back({"(" + op + " " + l.first + " " + r.first + ")", value});
            }
    }
    return found;
}

int main() {
    for (const std::string src : {"1 + 2 * 3", "8 - 3 - 2"}) {
        std::istringstream in(src);
        std::vector<std::string> toks;
        for (std::string t; in >> t;) toks.push_back(t);
        const std::vector<Tree> result = trees(toks, 0, toks.size());
        std::cout << src << ": " << result.size() << " trees\n";
        for (const Tree& t : result) std::cout << "  " << t.first << " = " << t.second << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    record Tree(String text, long value) {}

    // 歧義文法 E = E op E | NUMBER 的所有語法樹：toks[lo..hi) 中每個運算子都可能是根。
    static List<Tree> trees(String[] toks, int lo, int hi) {
        if (hi - lo == 1) return List.of(new Tree(toks[lo], Long.parseLong(toks[lo])));
        List<Tree> found = new ArrayList<>();
        for (int k = lo + 1; k < hi; k += 2) {
            String op = toks[k];
            for (Tree l : trees(toks, lo, k))
                for (Tree r : trees(toks, k + 1, hi)) {
                    long value = switch (op) {
                        case "+" -> l.value() + r.value();
                        case "-" -> l.value() - r.value();
                        default -> l.value() * r.value();
                    };
                    found.add(new Tree("(" + op + " " + l.text() + " " + r.text() + ")", value));
                }
        }
        return found;
    }

    public static void main(String[] args) {
        for (String src : List.of("1 + 2 * 3", "8 - 3 - 2")) {
            String[] toks = src.split(" ");
            List<Tree> result = trees(toks, 0, toks.length);
            System.out.println(src + ": " + result.size() + " trees");
            for (Tree t : result) System.out.println("  " + t.text() + " = " + t.value());
        }
    }
}`,
        Python: code`def trees(toks):
    """歧義文法 E = E op E | NUMBER 的所有語法樹：每個運算子都可能是根。"""
    if len(toks) == 1:
        return [(toks[0], int(toks[0]))]
    found = []
    for k in range(1, len(toks), 2):            # toks[k] 是運算子，當作根
        for left, lv in trees(toks[:k]):
            for right, rv in trees(toks[k + 1:]):
                op = toks[k]
                value = lv + rv if op == "+" else lv - rv if op == "-" else lv * rv
                found.append((f"({op} {left} {right})", value))
    return found


for src in ["1 + 2 * 3", "8 - 3 - 2"]:
    result = trees(src.split())
    print(f"{src}: {len(result)} trees")
    for text, value in result:
        print(f"  {text} = {value}")`,
        JavaScript: code`// 歧義文法 E = E op E | NUMBER 的所有語法樹：每個運算子都可能是根。
function trees(toks) {
    if (toks.length === 1) return [[toks[0], Number(toks[0])]];
    const found = [];
    for (let k = 1; k < toks.length; k += 2) {  // toks[k] 是運算子，當作根
        const op = toks[k];
        for (const [left, lv] of trees(toks.slice(0, k)))
            for (const [right, rv] of trees(toks.slice(k + 1))) {
                const value = op === "+" ? lv + rv : op === "-" ? lv - rv : lv * rv;
                found.push(["(" + op + " " + left + " " + right + ")", value]);
            }
    }
    return found;
}

for (const src of ["1 + 2 * 3", "8 - 3 - 2"]) {
    const result = trees(src.split(" "));
    console.log(src + ": " + result.length + " trees");
    for (const [text, value] of result) console.log("  " + text + " = " + value);
}`,
      },
    },
  ],
  visualization: {
    kind: 'tree-traversal', title: '遞迴下降解析 1 + 2 * 3：呼叫堆疊與長出來的 AST', language: 'Python',
    code: traceCode,
    steps: parseSteps(['1', '+', '2', '*', '3', '$']),
  },
  quiz: [
    {
      id: 'q1', prompt: '文法是 `expr = term { "+" term } ;`、`term = factor { "*" factor } ;`、`factor = NUMBER | "(" expr ")" ;`。下列哪一個字串不能從 expr 推導出來？',
      options: ['`(7)`', '`((1 + 2)) * 3`', '`1 * (2 + 3) * 4`', '`2 (3 + 4)`'],
      answer: 3, explanation: '`2 (3 + 4)` 中，`2` 是一個 factor，後面若要接另一個 factor，中間必須有 `*`（term 的規則），文法沒有「省略乘號」的規則，所以推導不出來，解析器會在 `(` 回報需要輸入結束。`(7)` 是 factor 的第二種寫法，括號裡的 expr 只是一個數字；`((1 + 2)) * 3` 是括號包住括號，factor 可以一層層遞迴；`1 * (2 + 3) * 4` 是一個 term 由三個 factor 用 `*` 連起來。',
    },
    {
      id: 'q2', prompt: '用本課的分層文法（expr／term／factor）解析 `2 * 3 + 4 * 5`，得到的 AST 寫成括號式是什麼？',
      options: ['`(* (+ (* 2 3) 4) 5)`', '`(+ (* 2 3) (* 4 5))`', '`(* 2 (+ 3 (* 4 5)))`', '`(* 2 (* (+ 3 4) 5))`'],
      answer: 1, explanation: 'parse_expr 先呼叫 parse_term，parse_term 把 `2 * 3` 吃完，遇到 `+` 才回傳 `(* 2 3)`；parse_expr 吃掉 `+`，再呼叫 parse_term 取得 `(* 4 5)`，所以根是 `+`，兩邊各是一個乘法。`(* (+ (* 2 3) 4) 5)` 是不管優先順序、由左到右逐一組合的結果；`(* 2 (+ 3 (* 4 5)))` 是由右往左組合；`(* 2 (* (+ 3 4) 5))` 把 `3 + 4` 當成一組，等於在 `3 + 4` 外面加了括號。',
    },
    {
      id: 'q3', prompt: '用本課的分層文法解析 `10 - 4 - 3 + 1`，AST 與它的值是什麼？',
      options: ['`(+ (- (- 10 4) 3) 1)`，值是 4', '`(- 10 (- 4 (+ 3 1)))`，值是 10', '`(- (- 10 4) (+ 3 1))`，值是 2', '`(- 10 (+ (- 4 3) 1))`，值是 8'],
      answer: 0, explanation: '`+` 與 `-` 在同一層（expr），由 while 迴圈由左往右組合：先 `(- 10 4)`，再把它當左子樹組成 `(- (- 10 4) 3)`，最後是 `(+ … 1)`，值是 6 - 3 + 1 = 4。`(- 10 (- 4 (+ 3 1)))` 是把規則寫成右遞迴 `expr = term [ ("+" | "-") expr ]` 的錯誤結果；`(- (- 10 4) (+ 3 1))` 誤以為 `+` 比 `-` 優先；`(- 10 (+ (- 4 3) 1))` 先算了後面的 `4 - 3 + 1`，同樣是把 `-` 當成右結合。',
    },
    {
      id: 'q4', prompt: '次方的規則是 `power = NUMBER [ "^" power ] ;`，解析器照它寫成「讀一個數字；下一個 token 是 `^` 就吃掉它並遞迴呼叫 power」。解析 `2 ^ 3 ^ 2` 的結果是什麼？',
      options: ['`(^ 2 (^ 3 2))`，值是 512', '`(^ (^ 2 3) 2)`，值是 64', '解析失敗：`[ ]` 最多出現一次，第二個 `^` 沒有規則可以處理', '`(^ 2 3)`，最後的 `^ 2` 被忽略'],
      answer: 0, explanation: '第一次呼叫 power 讀到 2，看到 `^` 就遞迴呼叫 power；第二次呼叫讀到 3，又看到 `^`，再遞迴一次讀到 2。最內層先回傳，組成 `(^ 3 2)`，它成為外層 `^` 的右子樹，所以是右結合，值是 2 的 9 次方 = 512。64 是左結合 `(2 ^ 3) ^ 2` 的值，要用迴圈才會得到；`[ ]` 在每一次呼叫中各自最多出現一次，但遞迴的那次呼叫可以再處理下一個 `^`，所以不會失敗，也不會忽略後面的 token。',
    },
    {
      id: 'q5', prompt: '用歧義文法 `<E> ::= <E> "+" <E> | <E> "*" <E> | NUMBER` 解析 `2 * 3 + 4 * 5`，一共有幾棵不同的語法樹？',
      options: ['1 棵', '2 棵', '4 棵', '5 棵'],
      answer: 3, explanation: '每個運算子都可以當根。根是第一個 `*`：左邊只有 2（1 棵），右邊 `3 + 4 * 5` 有兩個運算子（2 棵），共 2 棵；根是 `+`：左右兩邊各只有一個運算子，1 × 1 = 1 棵；根是第二個 `*`：左邊 `2 * 3 + 4` 有 2 棵，右邊只有 5，共 2 棵。合計 2 + 1 + 2 = 5 棵。1 棵是分層文法的結果，歧義文法沒有限制哪個運算子當根；2 棵只考慮了「先加或先乘」；4 是這 5 棵樹算出的不同值的個數（46、70、26、50，其中 70 出現兩次），不是樹的個數。',
    },
    {
      id: 'q6', prompt: '下面的 C++ 程式印出什麼？（`std::cout` 已經可以使用）',
      code: { language: 'C++', text: code`int a = 0, b = 1;
if (a)
    if (b) std::cout << "x";
else
    std::cout << "y";
std::cout << "[end]";` },
      options: ['`y[end]`', '`[end]`', '`x[end]`', '編譯錯誤：else 不知道屬於哪一個 if'],
      answer: 1, explanation: 'C++ 的解析器不看縮排，else 配給最近的、還沒有 else 的 if，也就是內層的 `if (b)`。外層的 `if (a)` 不成立，整個內層 if（連同 else）都不執行，只印出 `[end]`。`y[end]` 是照縮排以為 else 屬於外層 if；`x[end]` 要 a 為真才會發生；這段程式可以編譯，clang（預設）與 GCC（`-Wall`）頂多發出建議加上大括號的警告，不是錯誤。',
    },
    {
      id: 'q7', prompt: '`(1 + 2) * 3` 與 `((1 + 2)) * 3` 的 AST 有什麼不同？',
      options: ['完全相同，都是 `(* (+ 1 2) 3)`', '後者多了一個表示括號的節點', '後者的根變成 `+`', '前者的 `+` 是 `*` 的右子樹，後者是左子樹'],
      answer: 0, explanation: '括號只影響分組，parse_factor 遇到 `(` 就解析裡面的 expr 並直接回傳它的樹，括號本身不會成為節點，多包幾層也只是多呼叫幾次 parse_factor 與 parse_expr。兩者都是 `+` 在 `*` 的左子樹。保留括號的是具體語法樹，不是 AST；根是 `*`，因為括號外面的 `* 3` 最後才組合。',
    },
    {
      id: 'q8', prompt: '用本課練習的解析器（欄號從 1 開始，輸入結束的欄號是長度加 1，遇到第一個錯誤就停止）解析 `(4 + 5) * (6 -`，會輸出什麼？',
      options: ['`error at column 11: expected \')\'`', '`error at column 14: expected number, \'(\' or \'-\'`', '`error at column 15: expected number, \'(\' or \'-\'`', '`error at column 15: expected \')\'`'],
      answer: 2, explanation: '輸入共 14 個字元。第二個括號裡，parse_expr 讀到 6，看到 `-` 就吃掉它並呼叫 parse_term，parse_term 呼叫 parse_factor，這時下一個 token 是輸入結束（第 15 欄），不是數字、`(` 或 `-`，錯誤就在這裡被發現。缺少的 `)` 也是問題，但解析器還沒走到需要 `)` 的位置就停了；第 11 欄是左括號的位置，那裡沒有錯；第 14 欄的 `-` 本身是合法的減號，錯的是它後面沒有運算元。',
    },
    {
      id: 'q9', prompt: '有人把 BNF 的 `<expr> ::= <expr> "+" <term> | <term>` 直接寫成下面的函式（`parse_term` 是正確的）。解析 `1 + 2` 時會發生什麼？',
      code: { language: 'Python', text: code`def parse_expr():
    left = parse_expr()
    if peek() == "+":
        advance()
        return ("+", left, parse_term())
    return left` },
      options: ['正確得到 `("+", 1, 2)`', '得到右結合的 `("+", 2, 1)`', '無限遞迴：parse_expr 還沒讀任何 token 就呼叫自己，最後丟出 RecursionError', '只解析到 `1` 就回傳，`+ 2` 被忽略'],
      answer: 2, explanation: '這是左遞迴：parse_expr 的第一行就呼叫 parse_expr，pos 完全沒有前進，下一次呼叫面對的是同樣的輸入，於是一直呼叫下去，直到超過 Python 的遞迴上限而丟出 RecursionError（C++、Java 則是堆疊溢位）。它根本走不到 `peek()` 那一行，所以既不會得到任何樹，也不會只解析出 1。改寫成迴圈 `expr = term { "+" term }` 才能用遞迴下降處理。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '解析四則運算並輸出 AST',
      statement: '讀入一行四則運算式，依下面的文法用遞迴下降解析，輸出 AST 的括號式。文法：`expr = term { ("+" | "-") term } ;`、`term = factor { ("*" | "/") factor } ;`、`factor = NUMBER | "(" expr ")" | "-" factor ;`。NUMBER 是一個以上的數字，照原文輸出（不轉成整數，`007` 就輸出 `007`）；空白可以出現在任何 token 之間。括號式的格式：二元運算是 `(運算子 左 右)`，一元負號是 `(neg 運算元)`，數字就是它自己，括號不出現在 AST 中，例如 `-2 * (3 + 4)` 輸出 `(* (neg 2) (+ 3 4))`。先把整行切成 token（欄號從 1 開始，空白也算一欄）：遇到數字、空白與 `+ - * / ( )` 以外的字元，輸出 `error at column C: unexpected character \'c\'`。切完才開始解析，遇到第一個語法錯誤就停止，C 是出錯的 token 的欄號（輸入結束的欄號是長度加 1）：factor 開頭不是數字、`(` 或 `-` 時輸出 `error at column C: expected number, \'(\' or \'-\'`；括號裡的運算式後面不是 `)` 時輸出 `error at column C: expected \')\'`；整個運算式解析完還有剩下的 token 時輸出 `error at column C: expected end of input`。',
      inputFormat: '一行字串，可能是空的。',
      outputFormat: '解析成功時輸出一行 AST 的括號式；否則輸出一行 `error at column C: 訊息`。',
      constraints: ['長度 0～200', '只包含可列印的 ASCII 字元與空格', '括號與一元負號的巢狀深度不超過 50'],
      samples: [
        { kind: 'normal', input: '1 + 2 * 3', output: '(+ 1 (* 2 3))', note: '先乘後加：* 是 + 的右子樹' },
        { kind: 'error', input: '(1 + 2', output: 'error at column 7: expected \')\'', note: '缺少右括號，回報在輸入結束的位置（長度 6，加 1 是第 7 欄）' },
      ],
      tests: [
        { kind: 'normal', input: '1 + 2 * 3', output: '(+ 1 (* 2 3))', note: '乘法在 term 層先組成子樹，成為 + 的右子樹' },
        { kind: 'normal', input: '(1 + 2) * 3', output: '(* (+ 1 2) 3)', note: '括號回到 expr，+ 被包在 * 的左子樹裡；括號本身不出現在 AST' },
        { kind: 'normal', input: '8 - 3 - 2', output: '(- (- 8 3) 2)', note: '減法左結合：(- (- 8 3) 2)，不是 (- 8 (- 3 2))' },
        { kind: 'normal', input: '100/(4-2)/5', output: '(/ (/ 100 (- 4 2)) 5)', note: '沒有空白也能解析；除法同樣左結合' },
        { kind: 'normal', input: '2*(3+4)*5-6/2', output: '(- (* (* 2 (+ 3 4)) 5) (/ 6 2))', note: '三層混合：根是最後組合的 -' },
        { kind: 'normal', input: '-2 * 3 - -4', output: '(- (* (neg 2) 3) (neg 4))', note: '一元負號在 factor 層：(neg 2) 先與 3 相乘；減號後面的 - 是負號' },
        { kind: 'edge', input: '42', output: '42', note: '只有一個數字：AST 就是這個數字本身' },
        { kind: 'edge', input: '((7))', output: '7', note: '多層括號都不留下節點' },
        { kind: 'edge', input: '   5', output: '5', note: '開頭的空白跳過，不影響結果' },
        { kind: 'edge', input: '((((1+2))))*3', output: '(* (+ 1 2) 3)', note: '深層括號：結果與 (1+2)*3 相同' },
        { kind: 'edge', input: '--4', output: '(neg (neg 4))', note: '連續的負號，factor 遞迴兩次' },
        { kind: 'edge', input: '123456789012345678901234567890 * 2', output: '(* 123456789012345678901234567890 2)', note: '很大的數字：只輸出原文，不必轉成整數，所以不會溢位' },
        { kind: 'edge', input: '007 + 0', output: '(+ 007 0)', note: '數字照原文輸出，前導的 0 保留' },
        { kind: 'edge', input: '1-2-3-4-5', output: '(- (- (- (- 1 2) 3) 4) 5)', note: '一長串減法，樹一路往左下長' },
        { kind: 'edge', input: '', output: 'error at column 1: expected number, \'(\' or \'-\'', note: '空的輸入：第一個 factor 就遇到輸入結束，欄號是 1' },
        { kind: 'error', input: '1 + * 2', output: 'error at column 5: expected number, \'(\' or \'-\'', note: '+ 後面需要運算元，第 5 欄卻是 *' },
        { kind: 'error', input: '(1 + 2', output: 'error at column 7: expected \')\'', note: '括號裡的 expr 結束後需要 )，卻是輸入結束（第 7 欄）' },
        { kind: 'error', input: '1 2', output: 'error at column 3: expected end of input', note: '1 已經是完整的運算式，第 3 欄的 2 是多出來的' },
        { kind: 'error', input: '(1 + 2))', output: 'error at column 8: expected end of input', note: '多出來的 ) 在第 8 欄' },
        { kind: 'error', input: '3 + 4 @ 5', output: 'error at column 7: unexpected character \'@\'', note: 'lexer 階段就發現非法字元 @' },
        { kind: 'error', input: '2 * (3 + ) - 1', output: 'error at column 10: expected number, \'(\' or \'-\'', note: '+ 後面需要運算元，第 10 欄卻是 )' },
        { kind: 'error', input: '1 +', output: 'error at column 4: expected number, \'(\' or \'-\'', note: '運算式在輸入結束處中斷：欄號是長度加 1' },
        { kind: 'error', input: ')', output: 'error at column 1: expected number, \'(\' or \'-\'', note: '第一個 token 就不能開始一個 factor' },
        { kind: 'error', input: '2 (3)', output: 'error at column 3: expected end of input', note: '沒有省略乘號的規則：2 之後應該結束' },
        { kind: 'error', input: '12 + x', output: 'error at column 6: unexpected character \'x\'', note: '變數不在這個語言裡：x 是非法字元' },
        { kind: 'error', input: '1 + * 2 @', output: 'error at column 9: unexpected character \'@\'', note: '先完成整行的 lexer：非法字元 @ 比語法錯誤先回報' },
      ],
      hints: [
        '先用 PL10 的做法把整行切成 token，每個 token 記下原文與欄號；最後補一個原文為空字串、欄號為長度加 1 的「輸入結束」token。',
        'expr 與 term 的形狀相同：先取一個運算元，再用 while 迴圈「看到自己這一層的運算子就吃掉，再取一個運算元，組成新節點」，這樣就是左結合。',
        'factor 只看下一個 token：數字直接回傳；`(` 就呼叫 expr，再確認下一個是 `)`；`-` 就遞迴呼叫 factor 並包成 `(neg …)`；其他都是錯誤。',
        '錯誤用例外（PL09）往外丟最方便：丟出時記下目前 token 的欄號，在主程式捕捉後印出，不必在每一層檢查回傳值。',
        '整個 expr 解析完之後，下一個 token 必須是輸入結束；`1 2` 這種多出來的 token 就在這裡被發現。',
      ],
      starter: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

struct ParseError {
    std::size_t column;
    std::string message;
};
using Token = std::pair<std::string, std::size_t>;  // (原文, 欄號)

bool isDigit(char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; }

std::vector<Token> lex(const std::string& line) {
    std::vector<Token> tokens;
    std::size_t i = 0;
    while (i < line.size()) {
        if (line[i] == ' ') {
            ++i;
        } else if (isDigit(line[i])) {
            std::size_t j = i;
            while (j < line.size() && isDigit(line[j])) ++j;
            tokens.push_back({line.substr(i, j - i), i + 1});
            i = j;
        } else if (std::string("+-*/()").find(line[i]) != std::string::npos) {
            tokens.push_back({std::string(1, line[i]), i + 1});
            ++i;
        } else {
            throw ParseError{i + 1, std::string("unexpected character '") + line[i] + "'"};
        }
    }
    tokens.push_back({"", line.size() + 1});  // 輸入結束，欄號是長度加 1
    return tokens;
}

class Parser {
public:
    explicit Parser(std::vector<Token> tokens) : tokens_(std::move(tokens)) {}

    std::string parse() {
        std::string node = expr();
        if (peek() != "") fail("expected end of input");
        return node;
    }

private:
    std::vector<Token> tokens_;
    std::size_t pos_ = 0;

    const std::string& peek() const { return tokens_[pos_].first; }
    std::string advance() { return tokens_[pos_++].first; }
    [[noreturn]] void fail(const std::string& message) const { throw ParseError{tokens_[pos_].second, message}; }

    std::string expr() {  // expr = term { ("+" | "-") term }
        // 在這裡用 while 迴圈處理 + 與 -（左結合）
        return term();
    }

    std::string term() {  // term = factor { ("*" | "/") factor }
        // 在這裡用 while 迴圈處理 * 與 /（左結合）
        return factor();
    }

    std::string factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
        if (!peek().empty() && isDigit(peek()[0])) return advance();
        // 在這裡加上括號運算式與一元負號
        fail("expected number, '(' or '-'");
    }
};

int main() {
    std::string line;
    std::getline(std::cin, line);
    try {
        std::cout << Parser(lex(line)).parse() << "\n";
    } catch (const ParseError& e) {
        std::cout << "error at column " << e.column << ": " << e.message << "\n";
    }
    return 0;
}`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    static class ParseError extends RuntimeException {
        ParseError(int column, String message) {
            super("error at column " + column + ": " + message);
        }
    }

    record Token(String text, int column) {}

    static List<Token> lex(String line) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        while (i < line.length()) {
            char ch = line.charAt(i);
            if (ch == ' ') {
                i++;
            } else if (ch >= '0' && ch <= '9') {
                int j = i;
                while (j < line.length() && line.charAt(j) >= '0' && line.charAt(j) <= '9') j++;
                tokens.add(new Token(line.substring(i, j), i + 1));
                i = j;
            } else if ("+-*/()".indexOf(ch) >= 0) {
                tokens.add(new Token(String.valueOf(ch), i + 1));
                i++;
            } else {
                throw new ParseError(i + 1, "unexpected character '" + ch + "'");
            }
        }
        tokens.add(new Token("", line.length() + 1));  // 輸入結束，欄號是長度加 1
        return tokens;
    }

    static class Parser {
        private final List<Token> tokens;
        private int pos = 0;

        Parser(List<Token> tokens) {
            this.tokens = tokens;
        }

        String peek() { return tokens.get(pos).text(); }
        String advance() { return tokens.get(pos++).text(); }
        ParseError fail(String message) { return new ParseError(tokens.get(pos).column(), message); }

        String parse() {
            String node = expr();
            if (!peek().isEmpty()) throw fail("expected end of input");
            return node;
        }

        String expr() {  // expr = term { ("+" | "-") term }
            // 在這裡用 while 迴圈處理 + 與 -（左結合）
            return term();
        }

        String term() {  // term = factor { ("*" | "/") factor }
            // 在這裡用 while 迴圈處理 * 與 /（左結合）
            return factor();
        }

        String factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
            String tok = peek();
            if (!tok.isEmpty() && Character.isDigit(tok.charAt(0))) return advance();
            // 在這裡加上括號運算式與一元負號
            throw fail("expected number, '(' or '-'");
        }
    }

    public static void main(String[] args) throws IOException {
        String line = new BufferedReader(new InputStreamReader(System.in)).readLine();
        if (line == null) line = "";
        try {
            System.out.println(new Parser(lex(line)).parse());
        } catch (ParseError e) {
            System.out.println(e.getMessage());
        }
    }
}`,
        Python: code`import sys


class ParseError(Exception):
    def __init__(self, col, message):
        super().__init__(f"error at column {col}: {message}")


def lex(line):
    tokens, i = [], 0
    while i < len(line):
        if line[i] == " ":
            i += 1
        elif line[i].isdigit():
            j = i
            while j < len(line) and line[j].isdigit():
                j += 1
            tokens.append((line[i:j], i + 1))   # (原文, 欄號)
            i = j
        elif line[i] in "+-*/()":
            tokens.append((line[i], i + 1))
            i += 1
        else:
            raise ParseError(i + 1, f"unexpected character '{line[i]}'")
    tokens.append(("", len(line) + 1))          # 輸入結束，欄號是長度加 1
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens, self.pos = tokens, 0

    def peek(self):
        return self.tokens[self.pos][0]

    def advance(self):
        self.pos += 1
        return self.tokens[self.pos - 1][0]

    def fail(self, message):
        raise ParseError(self.tokens[self.pos][1], message)

    def expr(self):                             # expr = term { ("+" | "-") term }
        # 在這裡用 while 迴圈處理 + 與 -（左結合）
        return self.term()

    def term(self):                             # term = factor { ("*" | "/") factor }
        # 在這裡用 while 迴圈處理 * 與 /（左結合）
        return self.factor()

    def factor(self):                           # factor = NUMBER | "(" expr ")" | "-" factor
        if self.peek().isdigit():
            return self.advance()
        # 在這裡加上括號運算式與一元負號
        self.fail("expected number, '(' or '-'")

    def parse(self):
        node = self.expr()
        if self.peek() != "":
            self.fail("expected end of input")
        return node


line = sys.stdin.readline().rstrip("\n")
try:
    print(Parser(lex(line)).parse())
except ParseError as e:
    print(e)`,
        JavaScript: code`class ParseError extends Error {
    constructor(column, message) {
        super("error at column " + column + ": " + message);
    }
}

const isDigit = c => c >= "0" && c <= "9";

function lex(line) {
    const tokens = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === " ") {
            i++;
        } else if (isDigit(line[i])) {
            let j = i;
            while (j < line.length && isDigit(line[j])) j++;
            tokens.push({ text: line.slice(i, j), column: i + 1 });
            i = j;
        } else if ("+-*/()".includes(line[i])) {
            tokens.push({ text: line[i], column: i + 1 });
            i++;
        } else {
            throw new ParseError(i + 1, "unexpected character '" + line[i] + "'");
        }
    }
    tokens.push({ text: "", column: line.length + 1 });  // 輸入結束，欄號是長度加 1
    return tokens;
}

function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos].text;
    const advance = () => tokens[pos++].text;
    const fail = message => new ParseError(tokens[pos].column, message);

    function expr() {  // expr = term { ("+" | "-") term }
        // 在這裡用 while 迴圈處理 + 與 -（左結合）
        return term();
    }
    function term() {  // term = factor { ("*" | "/") factor }
        // 在這裡用 while 迴圈處理 * 與 /（左結合）
        return factor();
    }
    function factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
        if (isDigit(peek()[0] ?? "")) return advance();
        // 在這裡加上括號運算式與一元負號
        throw fail("expected number, '(' or '-'");
    }

    const node = expr();
    if (peek() !== "") throw fail("expected end of input");
    return node;
}

const line = require("fs").readFileSync(0, "utf8").split("\n")[0];
try {
    console.log(parse(lex(line)));
} catch (e) {
    if (!(e instanceof ParseError)) throw e;
    console.log(e.message);
}`,
      },
      solution: {
        'C++': code`#include <cctype>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

struct ParseError {
    std::size_t column;
    std::string message;
};
using Token = std::pair<std::string, std::size_t>;  // (原文, 欄號)

bool isDigit(char c) { return std::isdigit(static_cast<unsigned char>(c)) != 0; }

std::vector<Token> lex(const std::string& line) {
    std::vector<Token> tokens;
    std::size_t i = 0;
    while (i < line.size()) {
        if (line[i] == ' ') {
            ++i;
        } else if (isDigit(line[i])) {
            std::size_t j = i;
            while (j < line.size() && isDigit(line[j])) ++j;
            tokens.push_back({line.substr(i, j - i), i + 1});
            i = j;
        } else if (std::string("+-*/()").find(line[i]) != std::string::npos) {
            tokens.push_back({std::string(1, line[i]), i + 1});
            ++i;
        } else {
            throw ParseError{i + 1, std::string("unexpected character '") + line[i] + "'"};
        }
    }
    tokens.push_back({"", line.size() + 1});  // 輸入結束，欄號是長度加 1
    return tokens;
}

class Parser {
public:
    explicit Parser(std::vector<Token> tokens) : tokens_(std::move(tokens)) {}

    std::string parse() {
        std::string node = expr();
        if (peek() != "") fail("expected end of input");
        return node;
    }

private:
    std::vector<Token> tokens_;
    std::size_t pos_ = 0;

    const std::string& peek() const { return tokens_[pos_].first; }
    std::string advance() { return tokens_[pos_++].first; }
    [[noreturn]] void fail(const std::string& message) const { throw ParseError{tokens_[pos_].second, message}; }

    std::string expr() {  // expr = term { ("+" | "-") term }
        std::string node = term();
        while (peek() == "+" || peek() == "-") {
            const std::string op = advance();
            const std::string right = term();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }

    std::string term() {  // term = factor { ("*" | "/") factor }
        std::string node = factor();
        while (peek() == "*" || peek() == "/") {
            const std::string op = advance();
            const std::string right = factor();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }

    std::string factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
        if (!peek().empty() && isDigit(peek()[0])) return advance();
        if (peek() == "(") {
            advance();
            const std::string node = expr();
            if (peek() != ")") fail("expected ')'");
            advance();
            return node;
        }
        if (peek() == "-") {
            advance();
            return "(neg " + factor() + ")";
        }
        fail("expected number, '(' or '-'");
    }
};

int main() {
    std::string line;
    std::getline(std::cin, line);
    try {
        std::cout << Parser(lex(line)).parse() << "\n";
    } catch (const ParseError& e) {
        std::cout << "error at column " << e.column << ": " << e.message << "\n";
    }
    return 0;
}`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    static class ParseError extends RuntimeException {
        ParseError(int column, String message) {
            super("error at column " + column + ": " + message);
        }
    }

    record Token(String text, int column) {}

    static List<Token> lex(String line) {
        List<Token> tokens = new ArrayList<>();
        int i = 0;
        while (i < line.length()) {
            char ch = line.charAt(i);
            if (ch == ' ') {
                i++;
            } else if (ch >= '0' && ch <= '9') {
                int j = i;
                while (j < line.length() && line.charAt(j) >= '0' && line.charAt(j) <= '9') j++;
                tokens.add(new Token(line.substring(i, j), i + 1));
                i = j;
            } else if ("+-*/()".indexOf(ch) >= 0) {
                tokens.add(new Token(String.valueOf(ch), i + 1));
                i++;
            } else {
                throw new ParseError(i + 1, "unexpected character '" + ch + "'");
            }
        }
        tokens.add(new Token("", line.length() + 1));  // 輸入結束，欄號是長度加 1
        return tokens;
    }

    static class Parser {
        private final List<Token> tokens;
        private int pos = 0;

        Parser(List<Token> tokens) {
            this.tokens = tokens;
        }

        String peek() { return tokens.get(pos).text(); }
        String advance() { return tokens.get(pos++).text(); }
        ParseError fail(String message) { return new ParseError(tokens.get(pos).column(), message); }

        String parse() {
            String node = expr();
            if (!peek().isEmpty()) throw fail("expected end of input");
            return node;
        }

        String expr() {  // expr = term { ("+" | "-") term }
            String node = term();
            while (peek().equals("+") || peek().equals("-")) {
                String op = advance();
                String right = term();
                node = "(" + op + " " + node + " " + right + ")";
            }
            return node;
        }

        String term() {  // term = factor { ("*" | "/") factor }
            String node = factor();
            while (peek().equals("*") || peek().equals("/")) {
                String op = advance();
                String right = factor();
                node = "(" + op + " " + node + " " + right + ")";
            }
            return node;
        }

        String factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
            String tok = peek();
            if (!tok.isEmpty() && Character.isDigit(tok.charAt(0))) return advance();
            if (tok.equals("(")) {
                advance();
                String node = expr();
                if (!peek().equals(")")) throw fail("expected ')'");
                advance();
                return node;
            }
            if (tok.equals("-")) {
                advance();
                return "(neg " + factor() + ")";
            }
            throw fail("expected number, '(' or '-'");
        }
    }

    public static void main(String[] args) throws IOException {
        String line = new BufferedReader(new InputStreamReader(System.in)).readLine();
        if (line == null) line = "";
        try {
            System.out.println(new Parser(lex(line)).parse());
        } catch (ParseError e) {
            System.out.println(e.getMessage());
        }
    }
}`,
        Python: code`import sys


class ParseError(Exception):
    def __init__(self, col, message):
        super().__init__(f"error at column {col}: {message}")


def lex(line):
    tokens, i = [], 0
    while i < len(line):
        if line[i] == " ":
            i += 1
        elif line[i].isdigit():
            j = i
            while j < len(line) and line[j].isdigit():
                j += 1
            tokens.append((line[i:j], i + 1))   # (原文, 欄號)
            i = j
        elif line[i] in "+-*/()":
            tokens.append((line[i], i + 1))
            i += 1
        else:
            raise ParseError(i + 1, f"unexpected character '{line[i]}'")
    tokens.append(("", len(line) + 1))          # 輸入結束，欄號是長度加 1
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens, self.pos = tokens, 0

    def peek(self):
        return self.tokens[self.pos][0]

    def advance(self):
        self.pos += 1
        return self.tokens[self.pos - 1][0]

    def fail(self, message):
        raise ParseError(self.tokens[self.pos][1], message)

    def expr(self):                             # expr = term { ("+" | "-") term }
        node = self.term()
        while self.peek() in ("+", "-"):
            op = self.advance()
            node = f"({op} {node} {self.term()})"
        return node

    def term(self):                             # term = factor { ("*" | "/") factor }
        node = self.factor()
        while self.peek() in ("*", "/"):
            op = self.advance()
            node = f"({op} {node} {self.factor()})"
        return node

    def factor(self):                           # factor = NUMBER | "(" expr ")" | "-" factor
        tok = self.peek()
        if tok.isdigit():
            return self.advance()
        if tok == "(":
            self.advance()
            node = self.expr()
            if self.peek() != ")":
                self.fail("expected ')'")
            self.advance()
            return node
        if tok == "-":
            self.advance()
            return f"(neg {self.factor()})"
        self.fail("expected number, '(' or '-'")

    def parse(self):
        node = self.expr()
        if self.peek() != "":
            self.fail("expected end of input")
        return node


line = sys.stdin.readline().rstrip("\n")
try:
    print(Parser(lex(line)).parse())
except ParseError as e:
    print(e)`,
        JavaScript: code`class ParseError extends Error {
    constructor(column, message) {
        super("error at column " + column + ": " + message);
    }
}

const isDigit = c => c >= "0" && c <= "9";

function lex(line) {
    const tokens = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === " ") {
            i++;
        } else if (isDigit(line[i])) {
            let j = i;
            while (j < line.length && isDigit(line[j])) j++;
            tokens.push({ text: line.slice(i, j), column: i + 1 });
            i = j;
        } else if ("+-*/()".includes(line[i])) {
            tokens.push({ text: line[i], column: i + 1 });
            i++;
        } else {
            throw new ParseError(i + 1, "unexpected character '" + line[i] + "'");
        }
    }
    tokens.push({ text: "", column: line.length + 1 });  // 輸入結束，欄號是長度加 1
    return tokens;
}

function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos].text;
    const advance = () => tokens[pos++].text;
    const fail = message => new ParseError(tokens[pos].column, message);

    function expr() {  // expr = term { ("+" | "-") term }
        let node = term();
        while (peek() === "+" || peek() === "-") {
            const op = advance();
            const right = term();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }
    function term() {  // term = factor { ("*" | "/") factor }
        let node = factor();
        while (peek() === "*" || peek() === "/") {
            const op = advance();
            const right = factor();
            node = "(" + op + " " + node + " " + right + ")";
        }
        return node;
    }
    function factor() {  // factor = NUMBER | "(" expr ")" | "-" factor
        if (isDigit(peek()[0] ?? "")) return advance();
        if (peek() === "(") {
            advance();
            const node = expr();
            if (peek() !== ")") throw fail("expected ')'");
            advance();
            return node;
        }
        if (peek() === "-") {
            advance();
            return "(neg " + factor() + ")";
        }
        throw fail("expected number, '(' or '-'");
    }

    const node = expr();
    if (peek() !== "") throw fail("expected end of input");
    return node;
}

const line = require("fs").readFileSync(0, "utf8").split("\n")[0];
try {
    console.log(parse(lex(line)));
} catch (e) {
    if (!(e instanceof ParseError)) throw e;
    console.log(e.message);
}`,
      },
      judge: 'none',
    },
  ],
};
