import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/** The basic-block example in Python; the trace below runs exactly this program on exactly its `code` list. */
const CFG_PY = code`code = ["s = 0", "i = 0", "L1: t1 = i < 3", "ifFalse t1 goto L2", "s = s + i",
        "i = i + 1", "goto L1", "L2: goto L3", "print i", "L3: print s"]
labels = {ins.split(":")[0]: k for k, ins in enumerate(code) if ":" in ins}
leaders = {0}  # 第一條指令是首指令
for k, ins in enumerate(code):
    if "goto" in ins:
        leaders.add(labels[ins.split()[-1]])  # 跳躍的目標
        if k + 1 < len(code):
            leaders.add(k + 1)  # 跳躍的下一條
starts = sorted(leaders)
ends = starts[1:] + [len(code)]
block = {s: n for n, s in enumerate(starts)}  # 首指令 -> 區塊編號
succ = []
for e in ends:
    last = code[e - 1].split(": ")[-1]
    out = [block[labels[last.split()[-1]]]] if "goto" in last else []
    if not last.startswith("goto") and e < len(code):
        out.append(block[e])  # 不是無條件跳躍：會往下執行
    succ.append(sorted(out))
seen, todo = {0}, [0]
while todo:  # 從入口 B1 沿著邊走，標記走得到的區塊
    for m in succ[todo.pop()]:
        if m not in seen:
            seen.add(m)
            todo.append(m)
for n, s in enumerate(starts):
    to = " ".join(f"B{m + 1}" for m in succ[n]) or "exit"
    dead = "" if n in seen else " (unreachable)"
    print(f"B{n + 1} [{s}-{ends[n] - 1}] -> {to}{dead}")`;

/** The three-address code of CFG_PY, read from the program text itself so the trace cannot use other data. */
const TAC = [...CFG_PY.slice(0, CFG_PY.indexOf(']')).matchAll(/"([^"]*)"/g)].map(m => m[1]);

/**
 * The trace of CFG_PY, produced by running the same algorithm on TAC: leaders (first instruction, jump targets, the
 * instruction after a jump), blocks from one leader to the next, successor edges from each block's last instruction,
 * then the same stack-based walk from B1. Lines: 3 labels, 4 leaders = {0}, 9 (7 for a jump that is the last
 * instruction) a jump's leaders, 12 the blocks, 19 a block's edges, 20 the walk starts, 22/23/25 one block popped, 21
 * the walk ends, 29 the printed report. Marks: table rows found = leader, current = the instruction or block in hand,
 * removed = unreachable; graph nodes pending = in todo, visited = popped, removed = never reached; new edges write,
 * edges just followed read.
 */
function cfgSteps(): TraceStep[] {
  const size = TAC.length;
  const body = (ins: string) => ins.split(': ').pop()!;
  const target = (ins: string) => ins.split(' ').pop()!;
  const labels = new Map<string, number>();
  TAC.forEach((ins, k) => { if (ins.includes(':')) labels.set(ins.split(':')[0], k); });
  const list = (xs: number[]) => `[${xs.join(', ')}]`;
  const set = (xs: Iterable<number>) => `{${[...xs].sort((a, b) => a - b).join(', ')}}`;
  const labelText = `{${[...labels].map(([l, k]) => `'${l}': ${k}`).join(', ')}}`;
  const leaders = new Set<number>([0]);
  // eslint-disable-next-line prefer-const -- set once after the leaders are found; the table rows read it before and after
  let blockOf: number[] | undefined;
  const rows = () => TAC.map((ins, k) => [String(k), ins, leaders.has(k) ? '是' : '', blockOf ? `B${blockOf[k] + 1}` : '']);
  const table = (marks: { row: number; kind: Mark }[] = []): TraceStep['table'] =>
    ({ name: '三位址碼（code）', head: ['#', '指令', '首指令', '區塊'], rows: rows(), marks });
  const leaderMarks = (except: number[] = []) => [...leaders].filter(k => !except.includes(k)).map(k => ({ row: k, kind: 'found' as const }));
  const steps: TraceStep[] = [];

  steps.push({ line: 3, note: `\`code\` 是 ${size} 條三位址碼，表格的 # 是它在串列中的位置（從 0 開始）。標籤寫在指令前面，例如 \`L1: t1 = i < 3\`。第 3 行先記下每個標籤在哪一條：${[...labels].map(([l, k]) => `${l} 在第 ${k} 條`).join('、')}，之後遇到 \`goto L1\` 才知道要跳到哪裡。`,
    vars: { labels: labelText }, table: table() });
  steps.push({ line: 4, note: '第 0 條是首指令（leader）：程式從這裡進入。首指令就是基本區塊的第一條指令；接下來找出其他的首指令。',
    vars: { labels: labelText, leaders: set(leaders) }, table: table(leaderMarks()) });
  for (const [k, ins] of TAC.entries()) {
    if (!ins.includes('goto')) continue;
    const to = labels.get(target(ins))!, before = new Set(leaders);
    leaders.add(to);
    if (k + 1 < size) leaders.add(k + 1);
    const fresh = (x: number) => before.has(x) ? `第 ${x} 條本來就是首指令` : `第 ${x} 條成為首指令`;
    const conditional = !body(ins).startsWith('goto');
    const why = conditional
      ? `條件跳躍：${body(ins).split(' ')[1]} 為假時跳到 ${target(ins)}，${fresh(to)}；為真時往下執行，跳躍的下一條也是一個新的開始，${fresh(k + 1)}。`
      : `無條件跳躍到 ${target(ins)}，${fresh(to)}。${k + 1 < size ? `跳躍的下一條同樣要當成首指令（${fresh(k + 1)}）：執行完第 ${k} 條一定跳走，能到第 ${k + 1} 條的只有以它為目標的跳躍。` : ''}`;
    steps.push({ line: k + 1 < size ? 9 : 7, note: `第 ${k} 條 \`${ins}\` 是跳躍。${why}`,
      vars: { k: String(k), ins: `'${ins}'`, leaders: set(leaders) },
      table: table([{ row: k, kind: 'current' }, ...leaderMarks([k])]) });
  }
  const starts = [...leaders].sort((a, b) => a - b), ends = [...starts.slice(1), size];
  blockOf = TAC.map((_, k) => starts.filter(s => s <= k).length - 1);
  const names = starts.map((_, n) => `B${n + 1}`);
  const edges: { from: string; to: string }[] = [];
  const graph = (marks: { node?: string; edge?: number; kind: Mark }[]): TraceStep['graph'] =>
    ({ name: 'CFG', nodes: names, edges: [...edges], directed: true, marks, show: ['list'] });
  steps.push({ line: 12, note: `首指令排好序是 ${starts.join('、')}：每個基本區塊從一個首指令開始，到下一個首指令的前一條為止，所以有 ${starts.length} 個區塊（${starts.map((s, n) => `B${n + 1} 是第 ${s}${ends[n] - 1 > s ? `～${ends[n] - 1}` : ''} 條`).join('、')}）。區塊內的指令一定從第一條依序執行到最後一條。圖上先放好區塊，還沒有邊。`,
    vars: { starts: list(starts), ends: list(ends) }, table: table(leaderMarks()), graph: graph([]) });
  const succ: number[][] = [];
  for (const [n, e] of ends.entries()) {
    const last = body(TAC[e - 1]);
    const out = last.includes('goto') ? [starts.indexOf(labels.get(target(last))!)] : [];
    if (!last.startsWith('goto') && e < size) out.push(starts.indexOf(e));
    out.sort((a, b) => a - b);
    succ.push(out);
    const first = edges.length;
    for (const m of out) edges.push({ from: names[n], to: names[m] });
    const why = last.startsWith('ifFalse') ? `條件跳躍有兩個去處：條件為假跳到 ${target(last)} 所在的 B${starts.indexOf(labels.get(target(last))!) + 1}，為真則往下進入 B${n + 2}，所以有兩條邊。`
      : last.startsWith('goto') ? `無條件跳躍只有一條邊，連到 ${target(last)} 所在的 B${out[0] + 1}；它不會往下走到 B${n + 2}。${labels.get(target(last))! < e ? '邊指回前面的區塊，這就是迴圈。' : ''}`
      : out.length ? `這條不是跳躍，執行完就往下進入 B${out[0] + 1}。` : '這是最後一個區塊，執行完程式就結束，沒有後繼（exit）。';
    steps.push({ line: 19, note: `${names[n]} 的最後一條是 \`${last}\`。${why}`,
      vars: { e: String(e), last: `'${last}'`, succ: `[${succ.map(list).join(', ')}]` },
      table: table(Array.from({ length: e - starts[n] }, (_, i) => ({ row: starts[n] + i, kind: 'current' as const }))),
      graph: graph([{ node: names[n], kind: 'current' }, ...out.map((_, i) => ({ edge: first + i, kind: 'write' as const }))]) });
  }
  const seen = new Set([0]), todo = [0], done = new Set<number>();
  const walkMarks = (current?: number) => names.flatMap((v, n): { node: string; kind: Mark }[] => n === current ? [{ node: v, kind: 'current' }]
    : todo.includes(n) ? [{ node: v, kind: 'pending' }] : done.has(n) ? [{ node: v, kind: 'visited' }] : []);
  const walkVars = () => ({ seen: set(seen), todo: list(todo) });
  const rowsOf = (b: number) => Array.from({ length: ends[b] - starts[b] }, (_, i) => ({ row: starts[b] + i, kind: 'current' as const }));
  steps.push({ line: 20, note: '控制流程圖完成。接著從入口 B1 沿著邊走訪整張圖（和 A15 的 DFS 一樣用堆疊）：`seen` 記錄已經發現的區塊，`todo` 是發現了但還沒處理的區塊，每次取出最後一個。',
    vars: walkVars(), table: table(), graph: graph(walkMarks()) });
  while (todo.length) {
    const b = todo.pop()!, found: number[] = [];
    for (const m of succ[b]) if (!seen.has(m)) { seen.add(m); todo.push(m); found.push(m); }
    const followed = edges.flatMap((edge, i) => edge.from === names[b] ? [{ edge: i, kind: 'read' as const }] : []);
    const what = !succ[b].length ? '它沒有後繼（程式在這裡結束）。'
      : `沿著邊看它的後繼 ${succ[b].map(m => names[m]).join('、')}：${found.length ? `${found.map(m => names[m]).join('、')} 第一次被發現，放進 \`seen\` 與 \`todo\`` : '都已經發現過'}${found.length < succ[b].length && found.length ? `，${succ[b].filter(m => !found.includes(m)).map(m => names[m]).join('、')} 已經發現過，不再放入` : ''}。`;
    steps.push({ line: found.length ? 25 : succ[b].length ? 23 : 22, note: `從 \`todo\` 取出 ${names[b]}，${what}`,
      vars: walkVars(), table: table(rowsOf(b)), graph: graph([...walkMarks(b), ...followed]) });
    done.add(b);
  }
  const dead = names.filter((_, n) => !seen.has(n));
  const deadRows = TAC.flatMap((_, k) => seen.has(blockOf![k]) ? [] : [{ row: k, kind: 'removed' as const }]);
  const deadEdges = edges.flatMap((edge, i) => dead.includes(edge.from) ? [{ edge: i, kind: 'removed' as const }] : []);
  const finalMarks = () => [...names.map((v, n) => ({ node: v, kind: seen.has(n) ? 'visited' as const : 'removed' as const })), ...deadEdges];
  steps.push({ line: 21, note: `\`todo\` 空了，走訪結束。${dead.join('、')} 從來沒有被發現：沒有任何走得到的區塊有邊指向它，所以它是不可達（unreachable）的程式碼。它原本是 \`if (DEBUG) print i\` 的本體，DEBUG 被常數折疊成假之後，條件跳躍變成無條件的 \`goto L3\`；最佳化時整個區塊連同它的邊都可以刪掉，這是死碼消除的一種。`,
    vars: walkVars(), table: table(deadRows), graph: graph(finalMarks()) });
  const output = starts.map((s, n) => `${names[n]} [${s}-${ends[n] - 1}] -> ${succ[n].map(m => names[m]).join(' ') || 'exit'}${seen.has(n) ? '' : ' (unreachable)'}`).join('\n');
  steps.push({ line: 29, note: '印出每個區塊的指令範圍、後繼與是否可達。這份報告就是下一步最佳化的起點：迴圈是 B2 → B3 → B2，B5 可以刪除。',
    vars: walkVars(), table: table(deadRows), graph: graph(finalMarks()), output });
  return steps;
}

/**
 * PL16 編譯流程與中間表示. Every example and the reference solutions run in tests/curriculum-code.test.ts (C++17,
 * Java 17, Python 3, Node.js). The blueprint activity compiler-pipeline is not built, so the lesson uses the shared
 * graph-traversal trace: the control-flow graph as a graph panel and the three-address code as a table, produced by
 * cfgSteps() from the lesson's own basic-block program (CFG_PY, also the Python code of the cfg-blocks example). The
 * exercise outputs were generated by running the four reference solutions, which agree on every case.
 */
export const PL16: LessonContent = {
  lessonId: 'PL16',
  motivation: 'PL12 的直譯器拿到 AST 就直接執行；C++、Java、Rust、Swift 這類語言卻要先經過一整條編譯流程：檢查名稱與型別、把巢狀的運算式攤平成一條條簡單的指令、刪掉不必要的計算，最後才產生機器碼或位元組碼。看懂這條流程，你就能判斷一個錯誤是哪個階段報的（為什麼 `int y = z + 1;` 能被 parser 接受卻被拒絕）、為什麼開了最佳化之後除錯器裡的變數會「消失」、為什麼 `60 * 60 * 24` 在執行時不花時間；也能親手把一小段程式寫成三位址碼、畫出控制流程圖，並指出哪些指令可以折疊或刪除。',
  sections: [
    {
      id: 'pipeline', title: '編譯流程：前端、中端、後端',
      blocks: [
        { type: 'p', text: '編譯器（compiler）把原始程式翻譯成另一種形式，通常是機器碼或位元組碼。它不是一步完成，而是一連串的階段（phase），每個階段讀入上一個階段的輸出、產生更接近目標的表示。PL10 的 lexer 與 PL11 的 parser 就是其中的頭兩步。下表以一行 `y = a + b * 2` 為例：' },
        { type: 'table', head: ['階段', '輸入', '輸出', '做的事', '發現的錯誤'], rows: [
          ['詞法分析（lexer）', '字元', 'token：`y` `=` `a` `+` `b` `*` `2`', '切出名稱、數字、運算子，跳過空白與註解', '非法字元，例如 `$`'],
          ['語法分析（parser）', 'token 串列', 'AST：`(= y (+ a (* b 2)))`', '依文法建樹，決定先乘後加', '語法錯誤：括號不成對、缺少運算元'],
          ['語意分析（semantic analysis）', 'AST', '標上型別的 AST 與符號表', '名稱解析、型別檢查', '未宣告的名稱、型別不符、重複宣告'],
          ['產生中間表示（IR generation）', '檢查過的 AST', '三位址碼：`t1 = b * 2`、`t2 = a + t1`、`y = t2`', '攤平巢狀運算式，把 if、while 變成跳躍，切成基本區塊', '通常不再有使用者的錯誤'],
          ['最佳化（optimization）', '中間表示', '行為相同、更快或更小的中間表示', '常數折疊、常數傳播、死碼消除', '不報錯，只改寫'],
          ['程式碼產生（code generation）', '中間表示', '目標碼：機器碼、組合語言或位元組碼', '選指令、配置暫存器', '不報錯'],
        ] },
        { type: 'p', text: '前三個階段合稱前端（front end）：它懂原始語言，負責找出使用者的錯誤。中間表示（intermediate representation, IR）上的最佳化稱為中端（middle end）；程式碼產生是後端（back end），它懂目標機器。這樣切開的好處是重用：M 種語言要支援 N 種 CPU，不必寫 M × N 個編譯器，只要 M 個前端與 N 個後端，大家在同一種 IR 上交接。' },
        { type: 'p', text: '真實的編譯器正是這樣分工。Clang（C、C++）、rustc、Swift 的編譯器都把程式翻成 LLVM IR，再由 LLVM 的最佳化與後端產生 x86-64、ARM 等機器碼。GCC 的各個前端先產生 GENERIC 樹，再降低（lower）成 GIMPLE，在上面做許多最佳化，最後轉成 RTL 產生組合語言。`javac` 輸出的 JVM 位元組碼也是一種中間表示：它不是任何 CPU 的機器碼，由 JVM 在執行時直譯，或即時編譯（JIT）成機器碼。' },
        { type: 'callout', tone: 'note', title: '直譯器也有前端', text: 'PL12 的樹走訪直譯器其實就是「前端＋直接執行 AST」，沒有中端與後端。CPython 則有完整的前端，再把 AST 編譯成位元組碼交給虛擬機器執行。編譯與直譯的差別在於最後一步做什麼，前面的 lexer、parser 與語意檢查是共通的。' },
      ],
    },
    {
      id: 'semantic', title: '語意分析：名稱解析與型別檢查',
      blocks: [
        { type: 'p', text: 'parser 只檢查程式的「形狀」：`int y = x + ok;` 完全符合文法，即使 ok 是布林值、x 根本沒宣告，它照樣建得出 AST。語意分析（semantic analysis）在 AST 上再走一次，檢查程式有沒有意義。它靠一張符號表（symbol table）：名稱對到它的宣告資訊（型別、是變數還是函式、在哪一層作用域）。這張表和 PL12 直譯器的環境很像，差別是它在編譯時建立，存的是型別而不是執行時的值。' },
        { type: 'list', items: [
          '名稱解析（name resolution）：每次用到一個名稱，就找出它指的是哪一個宣告。找不到是「未宣告」的錯誤；同一層作用域宣告兩次是「重複宣告」的錯誤。巢狀作用域用一疊符號表，從最內層往外找，規則就是 PL06 的作用域鏈。',
          '型別檢查（type checking）：以後序走訪由下往上算出每個節點的型別，並對照語言的規則（PL04）。本課的小語言規定 `+`、`-`、`*` 與 `<` 的兩邊都必須是 int，`+`、`-`、`*` 的結果是 int，`<` 的結果是 bool；宣告的型別必須等於初始值的型別。',
        ] },
        { type: 'example', id: 'semantic-check' },
        { type: 'p', text: '第 3 行的 `x + ok` 名稱都找得到，但型別是 int + bool；第 4 行的 w 在符號表裡查不到；第 5 行把 int 值給了 bool 變數；第 6 行在同一層作用域再次宣告 x。範例只在一行檢查通過時才把名稱放進符號表；真正的編譯器通常仍會記下 y 的宣告型別，避免後面每次用到 y 都再報一個「未宣告」的連鎖錯誤。' },
        { type: 'p', text: '什麼算型別錯誤由語言的規則決定。Java 拒絕 `int + boolean`；C++ 允許 `x + ok`，因為 bool 會隱式轉成 int（true 是 1）；Python 與 JavaScript 的 `1 + True`、`1 + true` 都是 2。Python 也有前端，但它不在執行前檢查名稱是否已定義、也不檢查型別：用到未定義的名稱要等到那一行真的執行時，才丟出 `NameError`。靜態型別的語言把這些檢查放在語意分析，所以錯誤在程式還沒執行時就出現。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：把所有編譯錯誤都叫語法錯誤，或以為編譯通過就沒有錯', text: '括號不成對、少了分號，是 parser 建不出 AST 的語法錯誤；`cannot find symbol`（未宣告）、`incompatible types`（型別不符）、重複宣告，是語法正確但沒有意義的語意錯誤。分清楚兩者，才知道該看文法還是該看宣告與型別。另一方面，語意分析只檢查「不必執行就看得出來」的規則：除以零、陣列越界、讀到 null 都要到執行期才會發生，編譯成功不代表程式正確。' },
      ],
    },
    {
      id: 'tac', title: '中間表示：三位址碼',
      blocks: [
        { type: 'p', text: 'AST 適合檢查，卻不適合最佳化與產生指令：`(a + b) * (c - d)` 的中間結果沒有名字，要分析「這個值算過了沒」「之後還會不會用到」都很麻煩。因此前端檢查完，會把 AST 轉成一種更平坦的中間表示。最常拿來教學的是三位址碼（three-address code, TAC）：每條指令最多一個運算子、最多三個「位址」（兩個運算元與一個結果），例如 `t1 = b * c`。中間結果放在編譯器自己取名的暫存變數（temporary）t1、t2、t3 中。' },
        { type: 'table', head: ['指令形式', '例子', '意義'], rows: [
          ['`x = y op z`', '`t1 = b * c`', '二元運算，結果寫到 x'],
          ['`x = y`', '`a = t1`', '複製'],
          ['`goto L`', '`goto L1`', '無條件跳到標籤 L'],
          ['`ifFalse x goto L`', '`ifFalse t1 goto L2`', 'x 為假才跳到 L，否則往下執行下一條'],
          ['`L:`', '`L1: t1 = i < 3`', '標籤，標出跳躍的目標'],
          ['`print x`', '`print s`', '本課用來代表輸出（真實的 IR 是一個函式呼叫）'],
        ] },
        { type: 'p', text: '產生三位址碼的方法就是 PL12 的後序走訪：先處理左子樹、再處理右子樹，最後處理自己。不同的是，直譯器在節點上算出值，產生器則在節點上「印出一條指令」，並回傳存放結果的名字給父節點使用。葉子（變數或常數）本身就是運算元，不必產生指令。' },
        { type: 'example', id: 'tac-gen' },
        { type: 'p', text: '每個運算子節點對應一條指令，所以四個運算子產生 t1～t4；最後的 `x = t4` 是一條複製，之後的最佳化可以把它和上一條合併成 `x = t3 + e`。真實的 IR 也遵守「一條指令一個運算」：LLVM IR 寫成 `%3 = mul i32 %1, %2`，每個值都標了型別，而且採用靜態單一賦值（SSA）形式，每個名稱只被指定一次；GCC 的 GIMPLE 同樣是三位址形式；JVM 位元組碼則是堆疊式的 IR，運算元不寫名字，而是放在運算元堆疊上（後面的程式碼產生一節會看到）。' },
        { type: 'callout', tone: 'tip', title: '看看真正的編譯器產生的 IR', text: '`clang -S -emit-llvm a.c` 會把 LLVM IR 寫到 `a.ll`；`javap -c Main` 會列出 `Main.class` 的位元組碼；GCC 的 `-fdump-tree-gimple` 會把 GIMPLE 寫到一個檔案。輸出的細節隨編譯器版本與選項改變，只拿來對照概念，不要當成固定的答案。' },
      ],
    },
    {
      id: 'cfg', title: '控制流程：跳躍、基本區塊與控制流程圖',
      blocks: [
        { type: 'p', text: '三位址碼沒有 if 與 while，只有標籤與跳躍，所以產生 IR 時要把結構化的控制流程降低（lower）成跳躍。`while (i < 3) { s = s + i; i = i + 1; }` 會變成：`L1: t1 = i < 3`、`ifFalse t1 goto L2`、`s = s + i`、`i = i + 1`、`goto L1`、`L2: …`。條件不成立時跳出迴圈，迴圈本體最後跳回去重新檢查條件。`if (c) A else B` 則是 `ifFalse c goto Lelse`、A、`goto Lend`、`Lelse:` B、`Lend:`。' },
        { type: 'p', text: '基本區塊（basic block）是一段連續的指令，只能從第一條進入、只會從最後一條離開：一旦開始執行第一條，就一定依序執行到最後一條。最佳化在區塊內可以放心地把它當成直線程式。找出基本區塊的方法是先標出首指令（leader）：' },
        { type: 'list', ordered: true, items: [
          '第一條指令是首指令。',
          '任何跳躍（`goto` 或 `ifFalse … goto`）的目標是首指令。',
          '緊接在跳躍後面的那一條是首指令。',
          '每個基本區塊從一個首指令開始，到下一個首指令的前一條為止。',
        ] },
        { type: 'p', text: '控制流程圖（control-flow graph, CFG）是一張有向圖（D16）：節點是基本區塊，邊表示「執行完這個區塊之後可能接著執行哪個區塊」。區塊的最後一條是 `goto L`，就只有一條邊連到 L 所在的區塊；是 `ifFalse x goto L`，就有兩條邊，一條到 L、一條到下一個區塊；不是跳躍，就只有一條邊往下連到下一個區塊。迴圈在圖上是一條指回前面的邊。' },
        { type: 'example', id: 'cfg-blocks' },
        { type: 'p', text: '這段三位址碼來自 `s = 0; i = 0; while (i < 3) { s = s + i; i = i + 1; } if (DEBUG) print i; print s;`，其中 DEBUG 是值為 0 的常數。`if (DEBUG)` 原本會產生 `ifFalse DEBUG goto L3`；常數傳播與折疊知道 DEBUG 永遠為假，這個條件跳躍一定會跳，於是改寫成 `goto L3`（第 7 條）。結果第 8 條 `print i` 成了單獨的區塊 B5，沒有任何邊指向它。程式最後從入口 B1 沿著邊走訪整張圖，走不到的區塊就是不可達的程式碼。下方的逐步執行用同一個 Python 程式，一步步標出首指令、切出區塊、連出邊並走訪。' },
        { type: 'callout', tone: 'note', title: '為什麼要先切區塊', text: '一個問題（這個值是常數嗎？這個變數之後還會被讀嗎？）在區塊內只要從上往下或從下往上掃一次；跨區塊時，就要沿著 CFG 的邊把各區塊的答案合起來，迴圈則要反覆計算直到不再改變。現代編譯器的最佳化幾乎都建立在 CFG 上。' },
      ],
    },
    {
      id: 'optimizations', title: '最佳化：常數折疊、常數傳播與死碼消除',
      blocks: [
        { type: 'p', text: '最佳化（optimization）把中間表示改寫成更快或更小的版本，前提是程式「看得到的行為」不變：輸出、與檔案或網路的互動、丟出的錯誤都要和原本一樣。最基本的幾種是：' },
        { type: 'list', items: [
          '常數折疊（constant folding）：運算元都是常數，就在編譯時算好。`t1 = 60 * 60` 變成 `t1 = 3600`。',
          '常數傳播（constant propagation）：已知 `n = 4` 而且 n 之後沒有被改，讀 n 的地方就直接換成 4；這常常又製造出新的折疊機會。',
          '死碼消除（dead-code elimination）：結果之後不會被讀到、而且沒有副作用的指令可以刪掉；走不到的基本區塊（上一節的 B5）也可以整塊刪掉。',
          '共同子運算式消除（common subexpression elimination）：`t1 = a + b` 之後又算 `t2 = a + b`，只要中間 a、b 沒被改過，就改用 t1，不必再算一次。',
        ] },
        { type: 'example', id: 'fold-and-dce' },
        { type: 'p', text: '範例分兩趟。第一趟由上往下：把已知是常數的名稱換成值（傳播），兩邊都是常數就算出結果（折疊），並記下新得到的常數。第二趟由下往上做死碼消除：先假設只有 y 之後還會用到，一條指令的結果被需要才保留，並把它讀取的名稱加入「之後還要用」的集合（live）；不被需要的就刪掉。t3 從來沒被用到；t1 與 n 本來有人讀，但傳播之後讀它們的地方都換成了常數，它們也變成死碼。順序很重要：先傳播、折疊，才會露出更多死碼，所以真實的編譯器會反覆執行這些步驟，直到程式不再改變。' },
        { type: 'p', text: '範例只處理一個基本區塊。有分支時要用 CFG：`if (c) x = 1; else x = 2; y = x * 2;` 中，x 在 y 那一行不是常數，因為兩條路徑給的值不同；反過來，只要「某一條」之後的路徑會讀某個變數，它就還活著，不能刪。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：以為最佳化可以只看算式，或只看其中一條路徑', text: '第一，`t = f() * 0` 不能直接改成 `t = 0`：如果 f 會印東西或修改變數，刪掉呼叫就改變了輸出，正確的改寫是保留呼叫、丟掉它的回傳值，再令 `t = 0`。對浮點數更不能這樣化簡：無限大乘 0 是 NaN，-5.0 * 0 是 -0.0。第二，只在某一條路徑上沒用到的指令不是死碼：`x = g(); if (c) print x;` 中，c 為假時 x 沒被用到，但 c 為真時要印出 x，刪掉指定就錯了；死碼必須是「每一條」之後的路徑都不會讀它。第三，C++ 程式若有未定義行為（例如有號整數溢位），編譯器可以假設它不會發生，所以 `-O0` 與 `-O2` 的結果可能不同；這是程式的錯誤，不是最佳化的錯誤。' },
      ],
    },
    {
      id: 'codegen', title: '程式碼產生：從中間表示到目標碼',
      blocks: [
        { type: 'p', text: '後端把中間表示翻譯成目標機器的指令，主要工作有三項：指令選擇（instruction selection，每種 IR 運算要用哪幾條機器指令）、暫存器配置（register allocation，哪些值放在數量有限的暫存器、哪些要暫存到記憶體）、指令排程（instruction scheduling，排列順序讓 CPU 少等待）。這些演算法本身不在本課範圍；這裡用最簡單的目標，堆疊機器（stack machine），看翻譯的規則。JVM 位元組碼、CPython 位元組碼與 WebAssembly 都是堆疊式的：運算元先放上運算元堆疊，運算指令取出它們並把結果放回去。' },
        { type: 'example', id: 'stack-codegen' },
        { type: 'p', text: '每條 `d = a op b` 都翻成四條：放上 a、放上 b、做運算、把結果存到 d。左運算元要先放：`sub` 先取出的堆疊頂端是右運算元 b，再取出左運算元 a，算 a − b；放反了就會算成 b − a。變數用 `load`、常數用 `push`。翻出來的程式有明顯的浪費：`store t1` 之後馬上 `load t1`。窺孔最佳化（peephole optimization）會檢查這種相鄰的指令，t1 之後沒人用時讓值留在堆疊上，整段變成 `load a`、`load b`、`add`、`push 2`、`mul`、`load c`、`sub`、`store y`，從 12 條減成 8 條，暫存變數也不見了。' },
        { type: 'table', head: ['三位址碼', '堆疊機器（本課範例）', '暫存器機器（示意，不是真實的指令集）'], rows: [
          ['`t1 = a + b`', '`load a`、`load b`、`add`、`store t1`', '`mov r1, a`、`add r1, b`（t1 就是 r1）'],
          ['`t2 = t1 * 2`', '`load t1`、`push 2`、`mul`、`store t2`', '`mul r1, 2`（t1 不再使用，結果直接留在 r1）'],
          ['`y = t2 - c`', '`load t2`、`load c`、`sub`、`store y`', '`sub r1, c`、`mov y, r1`'],
        ] },
        { type: 'p', text: '暫存器機器（x86-64、ARM）的運算元放在暫存器，比記憶體快得多，但數量有限。暫存器配置決定每個暫存變數住在哪個暫存器；同時還活著的值比暫存器多時，就要把一些值溢出（spill）到記憶體。這也是為什麼開了最佳化之後，除錯器常說某個變數「已被最佳化掉」：它可能只在暫存器裡活了一小段，或者被傳播成常數後根本不存在。' },
      ],
    },
    {
      id: 'walkthrough', title: '動手走一次：從原始碼到目標碼',
      blocks: [
        { type: 'p', text: '把下面這段程式從頭走完整條流程，這也是本課希望你能自己做到的事。假設 n 已經宣告為 int，r 之後只會被印出：`int k = 2 * 3; if (k < n) { r = k + n; } else { r = 0; } print r;`' },
        { type: 'list', ordered: true, items: [
          '詞法與語法分析：切出 token、建出 AST。`k < n` 是 if 的條件，兩個分支各是一個指定。',
          '語意分析：k 宣告為 int，`2 * 3` 是 int，型別相符；n、r 都查得到；`k < n` 是 bool，可以當條件；`k + n` 是 int。沒有錯誤。',
          '產生三位址碼（編號從 0 開始）：0 `t1 = 2 * 3`、1 `k = t1`、2 `t2 = k < n`、3 `ifFalse t2 goto L1`、4 `r = k + n`、5 `goto L2`、6 `L1: r = 0`、7 `L2: print r`。',
          '切基本區塊：首指令是 0（第一條）、4（第 3 條跳躍的下一條）、6（L1，也是第 5 條 goto 的下一條）、7（L2），得到 B1 = 0～3、B2 = 4～5、B3 = 6、B4 = 7。CFG 的邊是 B1 → B2、B1 → B3、B2 → B4、B3 → B4，是一個菱形。',
          '最佳化：`t1 = 2 * 3` 折疊成 `t1 = 6`；k 只在 B1 被指定一次，而 B1 是所有路徑的必經之地，所以 k 的值 6 可以傳播到 `t2 = 6 < n` 與 `r = 6 + n`；之後沒有人讀 t1 與 k，兩條都是死碼。B4 的 r 卻不是常數：從 B2 來是 6 + n，從 B3 來是 0。',
          '程式碼產生：每條三位址碼照上一節的規則翻成堆疊機器的指令，跳躍翻成目標機器的跳躍指令。',
        ] },
        { type: 'p', text: '這六步對應了本課的每個概念：語意分析在 AST 上檢查名稱與型別；三位址碼與控制流程圖是中間表示的兩個面向，一個描述每條指令，一個描述指令之間怎麼流動；最佳化在中間表示上改寫；程式碼產生把結果交給目標機器。真正的編譯器多了更多階段與更聰明的演算法，但骨架就是這樣。' },
      ],
    },
  ],
  examples: [
    {
      id: 'semantic-check', title: '語意分析：符號表、名稱解析與型別檢查', description: '逐行檢查宣告：查符號表找名稱（名稱解析），算出初始值的型別並對照運算子與宣告的規則（型別檢查）。這幾行文法都正確，錯誤只有語意分析找得到。',
      output: "1 ok: x is int\n2 ok: ok is bool\n3 type error: int + bool\n4 name error: undeclared w\n5 type error: bool b = int\n6 name error: x already declared",
      code: {
        'C++': code`#include <cctype>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

std::map<std::string, std::string> symbols;  // 符號表：名稱 -> 型別

std::string typeOf(const std::string& token) {
    if (std::isdigit(static_cast<unsigned char>(token[0]))) return "int";
    const auto it = symbols.find(token);  // 名稱解析：查符號表
    if (it == symbols.end()) throw std::runtime_error("name error: undeclared " + token);
    return it->second;
}

int main() {
    const std::vector<std::string> program = {"int x = 5", "bool ok = x < 10", "int y = x + ok",
                                              "int z = w * 2", "bool b = x", "int x = 1"};
    for (std::size_t num = 1; num <= program.size(); ++num) {
        std::istringstream in(program[num - 1]);
        std::string declared, name, eq, a, op, b;
        in >> declared >> name >> eq >> a >> op >> b;  // 沒有運算子時 op 是空字串
        try {
            if (symbols.count(name)) throw std::runtime_error("name error: " + name + " already declared");
            std::string found = typeOf(a);
            if (!op.empty()) {  // 型別檢查：+ - * < 的兩邊都要是 int
                const std::string right = typeOf(b);
                if (found != "int" || right != "int") throw std::runtime_error("type error: " + found + " " + op + " " + right);
                found = op == "<" ? "bool" : "int";
            }
            if (found != declared) throw std::runtime_error("type error: " + declared + " " + name + " = " + found);
            symbols[name] = declared;
            std::cout << num << " ok: " << name << " is " << declared << "\n";
        } catch (const std::runtime_error& error) {
            std::cout << num << " " << error.what() << "\n";
        }
    }
    return 0;
}`,
        Java: code`import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    static final Map<String, String> symbols = new HashMap<>();  // 符號表：名稱 -> 型別

    static String typeOf(String token) {
        if (Character.isDigit(token.charAt(0))) return "int";
        String type = symbols.get(token);  // 名稱解析：查符號表
        if (type == null) throw new IllegalStateException("name error: undeclared " + token);
        return type;
    }

    public static void main(String[] args) {
        List<String> program = List.of("int x = 5", "bool ok = x < 10", "int y = x + ok",
                "int z = w * 2", "bool b = x", "int x = 1");
        for (int num = 1; num <= program.size(); num++) {
            String[] w = program.get(num - 1).split(" ");  // 型別 名稱 = a [op b]
            String declared = w[0], name = w[1];
            try {
                if (symbols.containsKey(name)) throw new IllegalStateException("name error: " + name + " already declared");
                String found = typeOf(w[3]);
                if (w.length == 6) {  // 型別檢查：+ - * < 的兩邊都要是 int
                    String right = typeOf(w[5]);
                    if (!found.equals("int") || !right.equals("int")) throw new IllegalStateException("type error: " + found + " " + w[4] + " " + right);
                    found = w[4].equals("<") ? "bool" : "int";
                }
                if (!found.equals(declared)) throw new IllegalStateException("type error: " + declared + " " + name + " = " + found);
                symbols.put(name, declared);
                System.out.println(num + " ok: " + name + " is " + declared);
            } catch (IllegalStateException error) {
                System.out.println(num + " " + error.getMessage());
            }
        }
    }
}`,
        Python: code`program = ["int x = 5", "bool ok = x < 10", "int y = x + ok",
           "int z = w * 2", "bool b = x", "int x = 1"]
symbols = {}  # 符號表：名稱 -> 型別


def type_of(token):
    if token.isdigit():
        return "int"
    if token not in symbols:  # 名稱解析：查符號表
        raise ValueError(f"name error: undeclared {token}")
    return symbols[token]


for num, line in enumerate(program, 1):
    declared, name, _, *expr = line.split()
    try:
        if name in symbols:
            raise ValueError(f"name error: {name} already declared")
        found = type_of(expr[0])
        if len(expr) == 3:  # 型別檢查：+ - * < 的兩邊都要是 int
            right = type_of(expr[2])
            if found != "int" or right != "int":
                raise ValueError(f"type error: {found} {expr[1]} {right}")
            found = "bool" if expr[1] == "<" else "int"
        if found != declared:
            raise ValueError(f"type error: {declared} {name} = {found}")
        symbols[name] = declared
        print(f"{num} ok: {name} is {declared}")
    except ValueError as error:
        print(num, error)`,
        JavaScript: code`const program = ["int x = 5", "bool ok = x < 10", "int y = x + ok",
                 "int z = w * 2", "bool b = x", "int x = 1"];
const symbols = new Map();  // 符號表：名稱 -> 型別

function typeOf(token) {
    if (/^\d+$/.test(token)) return "int";
    if (!symbols.has(token)) throw new Error("name error: undeclared " + token);  // 名稱解析：查符號表
    return symbols.get(token);
}

program.forEach((line, i) => {
    const [declared, name, , ...expr] = line.split(" ");
    try {
        if (symbols.has(name)) throw new Error("name error: " + name + " already declared");
        let found = typeOf(expr[0]);
        if (expr.length === 3) {  // 型別檢查：+ - * < 的兩邊都要是 int
            const right = typeOf(expr[2]);
            if (found !== "int" || right !== "int") throw new Error("type error: " + found + " " + expr[1] + " " + right);
            found = expr[1] === "<" ? "bool" : "int";
        }
        if (found !== declared) throw new Error("type error: " + declared + " " + name + " = " + found);
        symbols.set(name, declared);
        console.log(i + 1 + " ok: " + name + " is " + declared);
    } catch (error) {
        console.log(i + 1 + " " + error.message);
    }
});`,
      },
    },
    {
      id: 'tac-gen', title: '後序走訪 AST，產生三位址碼', description: '把 `x = (a + b) * (c - d) + e` 的 AST 攤平：每個運算子節點產生一條指令，結果放在新的暫存變數，回傳給父節點使用。',
      output: "t1 = a + b\nt2 = c - d\nt3 = t1 * t2\nt4 = t3 + e\nx = t4",
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

struct Node {
    std::string head;  // 葉子：變數或常數；內部節點：運算子
    std::vector<Node> kids;
};
template <typename... K> Node n(std::string head, K... kids) { return Node{head, {kids...}}; }

int count = 0;

// 後序走訪：先產生子節點的程式碼，回傳存放結果的運算元
std::string gen(const Node& node) {
    if (node.kids.empty()) return node.head;  // 變數或常數本身就是運算元
    const std::string a = gen(node.kids[0]);
    const std::string b = gen(node.kids[1]);
    const std::string t = "t" + std::to_string(++count);
    std::cout << t << " = " << a << " " << node.head << " " << b << "\n";  // 一條指令最多一個運算子
    return t;
}

int main() {
    // x = (a + b) * (c - d) + e 的 AST
    const Node ast = n("+", n("*", n("+", n("a"), n("b")), n("-", n("c"), n("d"))), n("e"));
    const std::string result = gen(ast);
    std::cout << "x = " << result << "\n";
    return 0;
}`,
        Java: code`import java.util.List;

public class Main {
    record Node(String head, List<Node> kids) {}  // 葉子：變數或常數；內部節點：運算子

    static Node n(String head, Node... kids) { return new Node(head, List.of(kids)); }

    static int count = 0;

    // 後序走訪：先產生子節點的程式碼，回傳存放結果的運算元
    static String gen(Node node) {
        if (node.kids().isEmpty()) return node.head();  // 變數或常數本身就是運算元
        String a = gen(node.kids().get(0));
        String b = gen(node.kids().get(1));
        String t = "t" + (++count);
        System.out.println(t + " = " + a + " " + node.head() + " " + b);  // 一條指令最多一個運算子
        return t;
    }

    public static void main(String[] args) {
        // x = (a + b) * (c - d) + e 的 AST
        Node ast = n("+", n("*", n("+", n("a"), n("b")), n("-", n("c"), n("d"))), n("e"));
        String result = gen(ast);
        System.out.println("x = " + result);
    }
}`,
        Python: code`count = 0


def gen(node):
    """後序走訪：先產生子節點的程式碼，回傳存放結果的運算元。"""
    global count
    if isinstance(node, str):
        return node  # 變數或常數本身就是運算元
    op, left, right = node
    a = gen(left)
    b = gen(right)
    count += 1
    print(f"t{count} = {a} {op} {b}")  # 一條指令最多一個運算子
    return f"t{count}"


# x = (a + b) * (c - d) + e 的 AST
ast = ["+", ["*", ["+", "a", "b"], ["-", "c", "d"]], "e"]
result = gen(ast)
print("x =", result)`,
        JavaScript: code`let count = 0;

// 後序走訪：先產生子節點的程式碼，回傳存放結果的運算元
function gen(node) {
    if (typeof node === "string") return node;  // 變數或常數本身就是運算元
    const [op, left, right] = node;
    const a = gen(left);
    const b = gen(right);
    const t = "t" + ++count;
    console.log(t + " = " + a + " " + op + " " + b);  // 一條指令最多一個運算子
    return t;
}

// x = (a + b) * (c - d) + e 的 AST
const ast = ["+", ["*", ["+", "a", "b"], ["-", "c", "d"]], "e"];
const result = gen(ast);
console.log("x = " + result);`,
      },
    },
    {
      id: 'cfg-blocks', title: '切出基本區塊、連出控制流程圖、找出不可達的區塊', description: '依三條規則找出首指令，切出基本區塊，由每個區塊的最後一條指令決定邊，再從入口 B1 走訪 CFG。輸出每個區塊的指令範圍（從 0 起算）與後繼。',
      output: "B1 [0-1] -> B2\nB2 [2-3] -> B3 B4\nB3 [4-6] -> B2\nB4 [7-7] -> B6\nB5 [8-8] -> B6 (unreachable)\nB6 [9-9] -> exit",
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <map>
#include <set>
#include <string>
#include <vector>

std::string body(const std::string& ins) { const auto p = ins.find(": "); return p == std::string::npos ? ins : ins.substr(p + 2); }
std::string target(const std::string& ins) { return ins.substr(ins.rfind(' ') + 1); }  // goto 後面的標籤

int main() {
    const std::vector<std::string> code = {"s = 0", "i = 0", "L1: t1 = i < 3", "ifFalse t1 goto L2", "s = s + i",
                                           "i = i + 1", "goto L1", "L2: goto L3", "print i", "L3: print s"};
    const int size = static_cast<int>(code.size());
    std::map<std::string, int> labels;
    for (int k = 0; k < size; ++k) if (body(code[k]) != code[k]) labels[code[k].substr(0, code[k].find(':'))] = k;
    std::set<int> leaders = {0};  // 第一條指令是首指令
    for (int k = 0; k < size; ++k) if (code[k].find("goto") != std::string::npos) {
        leaders.insert(labels[target(code[k])]);  // 跳躍的目標
        if (k + 1 < size) leaders.insert(k + 1);  // 跳躍的下一條
    }
    std::vector<int> starts(leaders.begin(), leaders.end()), ends(starts.begin() + 1, starts.end());
    ends.push_back(size);
    auto block = [&](int k) { return static_cast<int>(std::find(starts.begin(), starts.end(), k) - starts.begin()); };
    std::vector<std::vector<int>> succ;
    for (int e : ends) {
        const std::string last = body(code[e - 1]);
        std::vector<int> out;
        if (last.find("goto") != std::string::npos) out.push_back(block(labels[target(last)]));
        if (last.rfind("goto", 0) != 0 && e < size) out.push_back(block(e));  // 不是無條件跳躍：會往下執行
        std::sort(out.begin(), out.end());
        succ.push_back(out);
    }
    std::set<int> seen = {0};
    std::vector<int> todo = {0};
    while (!todo.empty()) {  // 從入口 B1 沿著邊走，標記走得到的區塊
        const int b = todo.back();
        todo.pop_back();
        for (int m : succ[b]) if (seen.insert(m).second) todo.push_back(m);
    }
    for (std::size_t n = 0; n < starts.size(); ++n) {
        std::string to;
        for (int m : succ[n]) to += (to.empty() ? "B" : " B") + std::to_string(m + 1);
        std::cout << "B" << n + 1 << " [" << starts[n] << "-" << ends[n] - 1 << "] -> " << (to.empty() ? "exit" : to)
                  << (seen.count(static_cast<int>(n)) ? "" : " (unreachable)") << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.*;

public class Main {
    static String target(String ins) { return ins.substring(ins.lastIndexOf(' ') + 1); }  // goto 後面的標籤

    public static void main(String[] args) {
        List<String> code = List.of("s = 0", "i = 0", "L1: t1 = i < 3", "ifFalse t1 goto L2", "s = s + i",
                "i = i + 1", "goto L1", "L2: goto L3", "print i", "L3: print s");
        Map<String, Integer> labels = new HashMap<>();
        for (int k = 0; k < code.size(); k++) if (code.get(k).contains(":")) labels.put(code.get(k).split(":")[0], k);
        TreeSet<Integer> leaders = new TreeSet<>(List.of(0));  // 第一條指令是首指令
        for (int k = 0; k < code.size(); k++) {
            if (!code.get(k).contains("goto")) continue;
            leaders.add(labels.get(target(code.get(k))));  // 跳躍的目標
            if (k + 1 < code.size()) leaders.add(k + 1);  // 跳躍的下一條
        }
        List<Integer> starts = new ArrayList<>(leaders), ends = new ArrayList<>(starts.subList(1, starts.size()));
        ends.add(code.size());
        List<List<Integer>> succ = new ArrayList<>();
        for (int e : ends) {
            String[] parts = code.get(e - 1).split(": ");
            String last = parts[parts.length - 1];
            List<Integer> out = new ArrayList<>();
            if (last.contains("goto")) out.add(starts.indexOf(labels.get(target(last))));
            if (!last.startsWith("goto") && e < code.size()) out.add(starts.indexOf(e));  // 不是無條件跳躍：會往下執行
            Collections.sort(out);
            succ.add(out);
        }
        Set<Integer> seen = new HashSet<>(List.of(0));
        Deque<Integer> todo = new ArrayDeque<>(List.of(0));
        while (!todo.isEmpty())  // 從入口 B1 沿著邊走，標記走得到的區塊
            for (int m : succ.get(todo.pop())) if (seen.add(m)) todo.push(m);
        for (int n = 0; n < starts.size(); n++) {
            StringJoiner to = new StringJoiner(" ");
            for (int m : succ.get(n)) to.add("B" + (m + 1));
            System.out.println("B" + (n + 1) + " [" + starts.get(n) + "-" + (ends.get(n) - 1) + "] -> "
                    + (to.length() == 0 ? "exit" : to) + (seen.contains(n) ? "" : " (unreachable)"));
        }
    }
}`,
        Python: CFG_PY,
        JavaScript: code`const code = ["s = 0", "i = 0", "L1: t1 = i < 3", "ifFalse t1 goto L2", "s = s + i",
              "i = i + 1", "goto L1", "L2: goto L3", "print i", "L3: print s"];
const target = ins => ins.split(" ").at(-1);  // goto 後面的標籤
const labels = new Map();
code.forEach((ins, k) => { if (ins.includes(":")) labels.set(ins.split(":")[0], k); });
const leaders = new Set([0]);  // 第一條指令是首指令
code.forEach((ins, k) => {
    if (!ins.includes("goto")) return;
    leaders.add(labels.get(target(ins)));  // 跳躍的目標
    if (k + 1 < code.length) leaders.add(k + 1);  // 跳躍的下一條
});
const starts = [...leaders].sort((a, b) => a - b);
const ends = [...starts.slice(1), code.length];
const succ = ends.map(e => {
    const last = code[e - 1].split(": ").at(-1);
    const out = last.includes("goto") ? [starts.indexOf(labels.get(target(last)))] : [];
    if (!last.startsWith("goto") && e < code.length) out.push(starts.indexOf(e));  // 不是無條件跳躍：會往下執行
    return out.sort((a, b) => a - b);
});
const seen = new Set([0]), todo = [0];
while (todo.length > 0) {  // 從入口 B1 沿著邊走，標記走得到的區塊
    for (const m of succ[todo.pop()]) {
        if (!seen.has(m)) { seen.add(m); todo.push(m); }
    }
}
starts.forEach((s, n) => {
    const to = succ[n].map(m => "B" + (m + 1)).join(" ") || "exit";
    console.log("B" + (n + 1) + " [" + s + "-" + (ends[n] - 1) + "] -> " + to + (seen.has(n) ? "" : " (unreachable)"));
});`,
      },
    },
    {
      id: 'fold-and-dce', title: '常數傳播、常數折疊與死碼消除', description: '一個基本區塊的三位址碼，之後只會用到 y。先由上往下傳播並折疊常數，再由下往上刪掉結果沒人需要的指令。',
      output: "propagate and fold:\nn = 4\nt1 = 8\nt2 = 8 + x\nt3 = 16\ny = t2 * 8\ndead-code elimination:\nt2 = 8 + x\ny = t2 * 8",
      code: {
        'C++': code`#include <cctype>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

bool isNum(const std::string& s) { return std::isdigit(static_cast<unsigned char>(s[0])) != 0; }

int main() {
    const std::vector<std::string> code = {"n = 4", "t1 = n * 2", "t2 = t1 + x", "t3 = n * n", "y = t2 * t1"};
    std::set<std::string> live = {"y"};  // 這段程式之後還會用到的變數
    std::map<std::string, std::string> consts;
    std::vector<std::vector<std::string>> folded;  // 每條指令：目的、運算元、運算子、運算元
    for (const std::string& ins : code) {
        std::istringstream in(ins);
        std::string dest, eq, x;
        in >> dest >> eq;
        std::vector<std::string> rhs;
        while (in >> x) rhs.push_back(consts.count(x) ? consts[x] : x);  // 常數傳播
        if (rhs.size() == 3 && isNum(rhs[0]) && isNum(rhs[2])) {  // 常數折疊
            const long long a = std::stoll(rhs[0]), b = std::stoll(rhs[2]);
            rhs = {std::to_string(rhs[1] == "+" ? a + b : rhs[1] == "-" ? a - b : a * b)};
        }
        if (rhs.size() == 1 && isNum(rhs[0])) consts[dest] = rhs[0]; else consts.erase(dest);
        rhs.insert(rhs.begin(), dest);
        folded.push_back(rhs);
    }
    auto show = [](const std::vector<std::string>& f) {
        std::string s = f[0] + " =";
        for (std::size_t k = 1; k < f.size(); ++k) s += " " + f[k];
        return s;
    };
    std::cout << "propagate and fold:\n";
    for (const auto& f : folded) std::cout << show(f) << "\n";
    std::vector<std::string> kept;
    for (auto f = folded.rbegin(); f != folded.rend(); ++f) {  // 死碼消除：由後往前
        if (!live.count((*f)[0])) continue;
        live.erase((*f)[0]);
        for (std::size_t k = 1; k < f->size(); k += 2) live.insert((*f)[k]);  // 這條指令讀取的運算元
        kept.insert(kept.begin(), show(*f));
    }
    std::cout << "dead-code elimination:\n";
    for (const std::string& s : kept) std::cout << s << "\n";
    return 0;
}`,
        Java: code`import java.util.*;

public class Main {
    static boolean isNum(String s) { return Character.isDigit(s.charAt(0)); }

    public static void main(String[] args) {
        List<String> code = List.of("n = 4", "t1 = n * 2", "t2 = t1 + x", "t3 = n * n", "y = t2 * t1");
        Set<String> live = new HashSet<>(Set.of("y"));  // 這段程式之後還會用到的變數
        Map<String, String> consts = new HashMap<>();
        List<List<String>> folded = new ArrayList<>();  // 每條指令：目的、運算元、運算子、運算元
        for (String ins : code) {
            String[] w = ins.split(" ");
            List<String> rhs = new ArrayList<>();
            for (int k = 2; k < w.length; k++) rhs.add(consts.getOrDefault(w[k], w[k]));  // 常數傳播
            if (rhs.size() == 3 && isNum(rhs.get(0)) && isNum(rhs.get(2))) {  // 常數折疊
                long a = Long.parseLong(rhs.get(0)), b = Long.parseLong(rhs.get(2));
                long v = switch (rhs.get(1)) { case "+" -> a + b; case "-" -> a - b; default -> a * b; };
                rhs = new ArrayList<>(List.of(String.valueOf(v)));
            }
            if (rhs.size() == 1 && isNum(rhs.get(0))) consts.put(w[0], rhs.get(0)); else consts.remove(w[0]);
            rhs.add(0, w[0]);
            folded.add(rhs);
        }
        System.out.println("propagate and fold:");
        for (List<String> f : folded) System.out.println(f.get(0) + " = " + String.join(" ", f.subList(1, f.size())));
        Deque<String> kept = new ArrayDeque<>();
        for (int i = folded.size() - 1; i >= 0; i--) {  // 死碼消除：由後往前
            List<String> f = folded.get(i);
            if (!live.remove(f.get(0))) continue;
            for (int k = 1; k < f.size(); k += 2) live.add(f.get(k));  // 這條指令讀取的運算元
            kept.addFirst(f.get(0) + " = " + String.join(" ", f.subList(1, f.size())));
        }
        System.out.println("dead-code elimination:");
        kept.forEach(System.out::println);
    }
}`,
        Python: code`code = ["n = 4", "t1 = n * 2", "t2 = t1 + x", "t3 = n * n", "y = t2 * t1"]
live = {"y"}  # 這段程式之後還會用到的變數
OPS = {"+": lambda a, b: a + b, "-": lambda a, b: a - b, "*": lambda a, b: a * b}
consts = {}
folded = []
for ins in code:
    dest, _, *rhs = ins.split()
    rhs = [consts.get(x, x) for x in rhs]  # 常數傳播
    if len(rhs) == 3 and rhs[0].isdigit() and rhs[2].isdigit():
        rhs = [str(OPS[rhs[1]](int(rhs[0]), int(rhs[2])))]  # 常數折疊
    if len(rhs) == 1 and rhs[0].isdigit():
        consts[dest] = rhs[0]
    else:
        consts.pop(dest, None)
    folded.append([dest] + rhs)
print("propagate and fold:")
for dest, *rhs in folded:
    print(dest, "=", " ".join(rhs))
kept = []
for dest, *rhs in reversed(folded):  # 死碼消除：由後往前
    if dest in live:
        live.discard(dest)
        live.update(rhs[::2])  # 這條指令讀取的運算元
        kept.insert(0, f"{dest} = {' '.join(rhs)}")
print("dead-code elimination:")
print("\n".join(kept))`,
        JavaScript: code`const code = ["n = 4", "t1 = n * 2", "t2 = t1 + x", "t3 = n * n", "y = t2 * t1"];
const live = new Set(["y"]);  // 這段程式之後還會用到的變數
const OPS = { "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b };
const isNum = s => /^\d/.test(s);
const consts = new Map();
const folded = [];
for (const ins of code) {
    const [dest, , ...words] = ins.split(" ");
    let rhs = words.map(x => consts.get(x) ?? x);  // 常數傳播
    if (rhs.length === 3 && isNum(rhs[0]) && isNum(rhs[2])) {
        rhs = [String(OPS[rhs[1]](Number(rhs[0]), Number(rhs[2])))];  // 常數折疊
    }
    if (rhs.length === 1 && isNum(rhs[0])) consts.set(dest, rhs[0]);
    else consts.delete(dest);
    folded.push([dest, ...rhs]);
}
console.log("propagate and fold:");
for (const [dest, ...rhs] of folded) console.log(dest + " = " + rhs.join(" "));
const kept = [];
for (const [dest, ...rhs] of [...folded].reverse()) {  // 死碼消除：由後往前
    if (!live.delete(dest)) continue;
    rhs.filter((_, k) => k % 2 === 0).forEach(x => live.add(x));  // 這條指令讀取的運算元
    kept.unshift(dest + " = " + rhs.join(" "));
}
console.log("dead-code elimination:");
console.log(kept.join("\n"));`,
      },
    },
    {
      id: 'stack-codegen', title: '程式碼產生：把三位址碼翻成堆疊機器指令', description: '`y = (a + b) * 2 - c` 的三位址碼，每條翻成「放上左運算元、放上右運算元、運算、存回」四條堆疊機器指令；分號開頭的行是註解，標出對應的三位址碼。',
      output: "; t1 = a + b\n  load a\n  load b\n  add\n  store t1\n; t2 = t1 * 2\n  load t1\n  push 2\n  mul\n  store t2\n; y = t2 - c\n  load t2\n  load c\n  sub\n  store y",
      code: {
        'C++': code`#include <cctype>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

std::string push(const std::string& x) {
    return std::isdigit(static_cast<unsigned char>(x[0])) ? "  push " + x : "  load " + x;
}

int main() {
    const std::vector<std::string> tac = {"t1 = a + b", "t2 = t1 * 2", "y = t2 - c"};
    const std::map<std::string, std::string> opcode = {{"+", "add"}, {"-", "sub"}, {"*", "mul"}};
    for (const std::string& ins : tac) {
        std::istringstream in(ins);
        std::string dest, eq, a, op, b;
        in >> dest >> eq >> a >> op >> b;
        std::cout << "; " << ins << "\n";
        std::cout << push(a) << "\n";  // 左運算元先放上堆疊
        std::cout << push(b) << "\n";
        std::cout << "  " << opcode.at(op) << "\n";  // 取出兩個值，結果放回堆疊
        std::cout << "  store " << dest << "\n";
    }
    return 0;
}`,
        Java: code`import java.util.List;
import java.util.Map;

public class Main {
    static String push(String x) {
        return Character.isDigit(x.charAt(0)) ? "  push " + x : "  load " + x;
    }

    public static void main(String[] args) {
        List<String> tac = List.of("t1 = a + b", "t2 = t1 * 2", "y = t2 - c");
        Map<String, String> opcode = Map.of("+", "add", "-", "sub", "*", "mul");
        for (String ins : tac) {
            String[] w = ins.split(" ");  // 目的 = a op b
            System.out.println("; " + ins);
            System.out.println(push(w[2]));  // 左運算元先放上堆疊
            System.out.println(push(w[4]));
            System.out.println("  " + opcode.get(w[3]));  // 取出兩個值，結果放回堆疊
            System.out.println("  store " + w[0]);
        }
    }
}`,
        Python: code`tac = ["t1 = a + b", "t2 = t1 * 2", "y = t2 - c"]
OPCODE = {"+": "add", "-": "sub", "*": "mul"}


def push(x):
    return f"  push {x}" if x.isdigit() else f"  load {x}"


for ins in tac:
    dest, _, a, op, b = ins.split()
    print(f"; {ins}")
    print(push(a))  # 左運算元先放上堆疊
    print(push(b))
    print(f"  {OPCODE[op]}")  # 取出兩個值，結果放回堆疊
    print(f"  store {dest}")`,
        JavaScript: code`const tac = ["t1 = a + b", "t2 = t1 * 2", "y = t2 - c"];
const OPCODE = { "+": "add", "-": "sub", "*": "mul" };
const push = x => (/^\d/.test(x) ? "  push " + x : "  load " + x);

for (const ins of tac) {
    const [dest, , a, op, b] = ins.split(" ");
    console.log("; " + ins);
    console.log(push(a));  // 左運算元先放上堆疊
    console.log(push(b));
    console.log("  " + OPCODE[op]);  // 取出兩個值，結果放回堆疊
    console.log("  store " + dest);
}`,
      },
    },
  ],
  visualization: { kind: 'graph-traversal', title: '逐步執行：找出首指令、切出基本區塊、連出控制流程圖，再從入口走訪', language: 'Python', code: CFG_PY, steps: cfgSteps() },
  quiz: [
    {
      id: 'q1', prompt: '把 `y = a + b * 2` 交給編譯器。下列哪一組「階段：輸入 → 輸出」是正確的？',
      options: [
        '語法分析：token 串列 → AST；語意分析：AST → 檢查過名稱與型別的 AST（加上符號表）',
        '詞法分析：字元 → AST；語法分析：AST → token 串列',
        '語意分析：token 串列 → 三位址碼；最佳化：三位址碼 → AST',
        '最佳化：原始碼的字元 → token 串列；程式碼產生：token 串列 → 機器碼',
      ],
      answer: 0, explanation: 'parser 讀 token、依文法建出 AST；語意分析在 AST 上做名稱解析與型別檢查，輸出標上型別的 AST 與符號表，第一個選項正確。第二個選項把前兩個階段的輸出弄錯：lexer 輸出的是 token，parser 才建 AST，而且流程不會從 AST 回到 token。第三個選項中，產生三位址碼的是語意分析之後的 IR 產生階段，最佳化也不會把 IR 變回 AST。第四個選項把切 token 的工作交給最佳化，但最佳化的輸入與輸出都是中間表示；程式碼產生的輸入也是中間表示，不是 token。',
    },
    {
      id: 'q2', prompt: '依本課的規則（後序走訪、子節點由左到右、每個運算子產生一條指令並使用新的暫存變數 t1、t2…），`x = a * (b + c) - d` 產生的三位址碼是？',
      options: [
        '`t1 = a * b`、`t2 = t1 + c`、`t3 = t2 - d`、`x = t3`',
        '`t1 = b + c`、`t2 = a * t1`、`t3 = t2 - d`、`x = t3`',
        '`t1 = b + c`、`t2 = t1 - d`、`t3 = a * t2`、`x = t3`',
        '`t1 = a * (b + c)`、`t2 = t1 - d`、`x = t2`',
      ],
      answer: 1, explanation: 'AST 是 `(- (* a (+ b c)) d)`。後序走訪先處理左子樹 `(* a (+ b c))`：a 是葉子，接著右子樹 `(+ b c)` 產生 `t1 = b + c`，然後才是 `t2 = a * t1`；最後處理根節點 `t3 = t2 - d`，再複製給 x。第一個選項忽略了括號，把 a * b 先算；第三個選項先做減法，等於把式子讀成 a * ((b + c) - d)；第四個選項一條指令含兩個運算子，已經不是三位址碼。',
    },
    {
      id: 'q3', prompt: '三位址碼（編號從 0 開始）：0 `i = 0`、1 `L1: t1 = i < 5`、2 `ifFalse t1 goto L2`、3 `i = i + 2`、4 `goto L1`、5 `L2: print i`。依本課的首指令規則切出基本區塊（B1、B2… 依位置編號），CFG 是哪一個？',
      options: [
        '3 個區塊：B1 = 0～2、B2 = 3～4、B3 = 5；邊 B1→B2、B1→B3、B2→B1',
        '4 個區塊：B1 = 0、B2 = 1～2、B3 = 3～4、B4 = 5；邊 B1→B2、B2→B4、B3→B2、B3→B4',
        '4 個區塊：B1 = 0、B2 = 1～2、B3 = 3～4、B4 = 5；邊 B1→B2、B2→B3、B2→B4、B3→B2',
        '4 個區塊：B1 = 0、B2 = 1～2、B3 = 3～4、B4 = 5；邊 B1→B2、B2→B3、B3→B2、B3→B4',
      ],
      answer: 2, explanation: '首指令：0（第一條）、1（L1 是 goto 的目標）、3（第 2 條跳躍的下一條）、5（L2 是目標，也是第 4 條跳躍的下一條），所以有 4 個區塊。B1 往下接 B2；B2 結尾的 `ifFalse` 有兩條邊，假時到 L2 所在的 B4、真時往下到 B3；B3 結尾的 `goto L1` 只有一條邊回到 B2，這就是迴圈，所以第三個選項正確。第一個選項把第 0～2 條放在同一區塊，但第 1 條是跳躍目標，迴圈每一輪都從它開始，不能和 `i = 0` 合在一起。第二個選項漏了條件為真時往下的 B2→B3，又多了 B3→B4，但 `goto` 之後不會往下走。第四個選項以為 `ifFalse` 只有一個去處，又讓 `goto` 往下走。',
    },
    {
      id: 'q4', prompt: '只看下面這段沒有分支的三位址碼，之後只會用到 c：`a = 6`、`b = a * 7`、`c = b - 2`、`d = a + z`。先由上往下做常數傳播與折疊，再由下往上做死碼消除，最後剩下什麼？',
      options: ['`b = 42`、`c = 40`', '`a = 6`、`c = 40`、`d = 6 + z`', '`c = 40`、`d = 6 + z`', '只剩 `c = 40`'],
      answer: 3, explanation: '傳播與折疊之後是 `a = 6`、`b = 42`、`c = 40`、`d = 6 + z`。由下往上：d 之後沒人用，刪掉；c 要保留，而 `c = 40` 不讀任何名稱；b 原本被 c 讀取，但傳播後 c 那一行已經換成常數，所以 b 也沒人用，刪掉；a 同理。最後只剩 `c = 40`，第四個選項正確。第一個選項忘了傳播會讓 b 變成死碼；第二、三個選項保留了 d，但 d 的結果之後沒人讀，`6 + z` 也沒有副作用。',
    },
    {
      id: 'q5', prompt: '下列四段 Java 程式各有一個錯誤。哪一個是 parser 建 AST 時就會發現的語法錯誤，不必等到語意分析？',
      options: [
        '`int y = z + 1;`（z 從未宣告）',
        '`int x = (1 + 2;`',
        '`boolean b = 1 + 2;`',
        '`int n = 1; int n = 2;`（在同一個區塊中）',
      ],
      answer: 1, explanation: '`(1 + 2;` 少了右括號，依文法建不出運算式，parser 就會報錯，第二個選項正確。其他三個都完全符合文法：第一個要查符號表才知道 z 沒宣告（javac 回報找不到符號），是名稱解析的錯誤；第三個要算出 `1 + 2` 是 int、而 b 是 boolean，是型別檢查的錯誤；第四個要知道同一層作用域已經有 n，是重複宣告的錯誤。這三個都屬於語意分析。',
    },
    {
      id: 'q6', prompt: '函式 f 會印出一行字並回傳 7。編譯器看到 `int t = f() * 0;`，下列哪一種改寫保證不改變程式看得到的行為？',
      code: { language: 'C++', text: code`int f() {
    std::cout << "called\n";
    return 7;
}

int t = f() * 0;` },
      options: [
        '改成 `int t = 0;`，不再呼叫 f',
        '先呼叫 `f()` 並丟掉回傳值，再令 `t = 0`',
        '改成 `int t = f();`，因為乘 0 沒有效果',
        '整行刪掉，因為乘 0 的結果沒有用處',
      ],
      answer: 1, explanation: '整數乘以 0 一定是 0，所以 t 可以直接是 0；但 f 的呼叫會印出 called，這是看得到的行為，必須保留，第二個選項正確。第一個選項少印了一行；第三個選項讓 t 變成 7，值錯了；第四個選項既少印一行，之後用到 t 的地方也找不到它。若 t 是浮點數，連 `t = 0` 都不一定對：f 回傳無限大或 NaN 時，乘 0 的結果是 NaN。',
    },
    {
      id: 'q7', prompt: '本課的堆疊機器中，`sub` 先取出堆疊頂端的值當右運算元，再取出下一個當左運算元，把差放回堆疊。`t1 = a - b` 正確的翻譯是？',
      options: [
        '`load b`、`load a`、`sub`、`store t1`',
        '`sub`、`load a`、`load b`、`store t1`',
        '`load a`、`load b`、`sub`、`store t1`',
        '`load a`、`load b`、`store t1`、`sub`',
      ],
      answer: 2, explanation: '先放 a 再放 b，堆疊頂端是 b；`sub` 取出 b 當右運算元、a 當左運算元，算出 a − b，再由 `store t1` 存起來，第三個選項正確。第一個選項順序相反，算出的是 b − a；第二個選項在堆疊還是空的時候就做減法；第四個選項在減法之前就把 b 存進 t1，而 `sub` 之後的結果沒有被存起來。',
    },
    {
      id: 'q8', prompt: '下列關於真實編譯器中間表示的敘述，哪一個正確？',
      options: [
        '`javac` 輸出的 JVM 位元組碼就是 x86-64 機器碼，CPU 可以直接執行',
        'Clang、rustc 等前端把程式翻成 LLVM IR，再由 LLVM 的後端產生不同 CPU 的機器碼',
        'GCC 沒有中間表示，直接從 AST 產生組合語言',
        'LLVM IR 的一條指令可以包含任意深度的巢狀運算式，和 AST 一樣',
      ],
      answer: 1, explanation: 'LLVM 是「多個前端、一種 IR、多個後端」的典型例子，第二個選項正確。JVM 位元組碼是給 JVM 執行的中間表示，由 JVM 直譯或即時編譯成機器碼，CPU 不能直接執行；GCC 在中間有 GENERIC、GIMPLE、RTL 等表示，許多最佳化在 GIMPLE 上做；LLVM IR 和三位址碼一樣，每條指令只做一個運算，巢狀運算式要拆成多條指令與多個暫存值。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '一行算式的三位址碼與常數折疊',
      statement: '寫一個小編譯器的前半段：讀入一行指定敘述 `名稱 = 運算式`，輸出它的三位址碼，再輸出常數折疊後的版本。處理分三步，前一步出錯就輸出錯誤訊息並結束，不再做下一步。第一步 lexer（PL10）把整行切成 token：一串連續的數字是一個整數，一串連續的小寫字母是一個名稱，`+`、`-`、`*`、`(`、`)`、`=` 各是一個 token，空白略過；遇到其他任何字元 C 就輸出 `error: invalid character C`。第二步 parser（PL11）依文法 `line := NAME "=" expr`、`expr := term (("+" | "-") term)*`、`term := factor ("*" factor)*`、`factor := NUMBER | NAME | "(" expr ")"` 建 AST（`*` 優先於 `+`、`-`，同一層由左到右結合），而且整行的 token 都要用完；第一個不合文法的 token 是 T 時輸出 `error: unexpected T`，需要更多 token 時卻到了行尾就輸出 `error: unexpected end of line`。第三步以後序走訪（左子樹、右子樹、自己）產生三位址碼：每個運算子節點產生一條 `tN = a op b`，N 從 1 開始依產生的順序編號，a、b 是左右子節點的結果（名稱、整數或暫存變數），最後一行是 `名稱 = 結果`。常數折疊的版本用同樣的走訪，但當一個運算子節點的左右結果都是整數時，不產生指令，直接把算出的整數（可能是負數）當成這個節點的結果；暫存變數同樣從 t1 依產生順序重新編號。只折疊兩邊都是整數的運算，`x * 0` 這類代數化簡、把 `2 + a + 3` 重新結合都不做。',
      inputFormat: '一行文字（可能是空行）。',
      outputFormat: '沒有錯誤時，先輸出 `three-address code:`，接著每行一條指令，最後一行是 `名稱 = 結果`；再輸出 `after constant folding:` 與折疊後的指令，格式相同。運算子與等號的兩邊各一個空白。有錯誤時只輸出一行 `error: …`。',
      constraints: [
        '一行最多 200 個字元，由可列印的 ASCII 字元組成；名稱只含小寫字母，所以不會和 t1 這類暫存變數同名',
        '整數最多 6 位，沒有多餘的前導 0；沒有單元負號，`-3` 是錯誤（`-` 只能出現在兩個運算元之間）',
        '合法的輸入中，每個只由整數組成的子運算式，其值的絕對值都不超過 10^9',
      ],
      samples: [
        {"kind": "normal", "input": "x = (2 + 3) * y - 4 * 2", "output": "three-address code:\nt1 = 2 + 3\nt2 = t1 * y\nt3 = 4 * 2\nt4 = t2 - t3\nx = t4\nafter constant folding:\nt1 = 5 * y\nt2 = t1 - 8\nx = t2", "note": "2 + 3 與 4 * 2 兩邊都是常數，折疊成 5 與 8；折疊後只剩兩條指令，暫存變數依產生順序重新編號"},
        {"kind": "edge", "input": "n = 2 - 5 * 3", "output": "three-address code:\nt1 = 5 * 3\nt2 = 2 - t1\nn = t2\nafter constant folding:\nn = -13", "note": "先乘後減；折疊的結果是負數 -13"},
        {"kind": "error", "input": "x = (1 + 2", "output": "error: unexpected end of line", "note": "缺少右括號：parser 讀到行尾還在等 )"},
      ],
      tests: [
        {"kind": "normal", "input": "x = (2 + 3) * y - 4 * 2", "output": "three-address code:\nt1 = 2 + 3\nt2 = t1 * y\nt3 = 4 * 2\nt4 = t2 - t3\nx = t4\nafter constant folding:\nt1 = 5 * y\nt2 = t1 - 8\nx = t2", "note": "2 + 3 與 4 * 2 兩邊都是常數，折疊成 5 與 8；折疊後只剩兩條指令，暫存變數依產生順序重新編號"},
        {"kind": "normal", "input": "total = price * 3 + price * 2", "output": "three-address code:\nt1 = price * 3\nt2 = price * 2\nt3 = t1 + t2\ntotal = t3\nafter constant folding:\nt1 = price * 3\nt2 = price * 2\nt3 = t1 + t2\ntotal = t3", "note": "每個運算都有變數 price，沒有可以折疊的運算，折疊前後相同"},
        {"kind": "normal", "input": "z=(a+b)*(a-b)", "output": "three-address code:\nt1 = a + b\nt2 = a - b\nt3 = t1 * t2\nz = t3\nafter constant folding:\nt1 = a + b\nt2 = a - b\nt3 = t1 * t2\nz = t3", "note": "token 之間可以沒有空白：lexer 仍然切出 z、=、(、a、+ … 等 token"},
        {"kind": "normal", "input": "d = 60 * 60 * 24", "output": "three-address code:\nt1 = 60 * 60\nt2 = t1 * 24\nd = t2\nafter constant folding:\nd = 86400", "note": "整個運算式都是常數：折疊後沒有任何指令，d 直接得到 86400"},
        {"kind": "normal", "input": "area = (w + 2) * (h + 2) - 4", "output": "three-address code:\nt1 = w + 2\nt2 = h + 2\nt3 = t1 * t2\nt4 = t3 - 4\narea = t4\nafter constant folding:\nt1 = w + 2\nt2 = h + 2\nt3 = t1 * t2\nt4 = t3 - 4\narea = t4", "note": "括號內先算：t1、t2 是兩個括號，t3 是乘積，最後減 4"},
        {"kind": "edge", "input": "x = 5", "output": "three-address code:\nx = 5\nafter constant folding:\nx = 5", "note": "沒有運算子：不產生暫存變數，只有一條複製指令"},
        {"kind": "edge", "input": "y = a", "output": "three-address code:\ny = a\nafter constant folding:\ny = a", "note": "右邊只有一個名稱：同樣只有 y = a"},
        {"kind": "edge", "input": "r = 2 + a + 3", "output": "three-address code:\nt1 = 2 + a\nt2 = t1 + 3\nr = t2\nafter constant folding:\nt1 = 2 + a\nt2 = t1 + 3\nr = t2", "note": "加法是左結合，樹是 (2 + a) + 3：每個運算都有一邊是變數，所以不能折疊（要先重新結合才行，那是另一種最佳化）"},
        {"kind": "edge", "input": "r = 2 + 3 + a", "output": "three-address code:\nt1 = 2 + 3\nt2 = t1 + a\nr = t2\nafter constant folding:\nt1 = 5 + a\nr = t1", "note": "樹是 (2 + 3) + a：左邊的子樹全是常數，折疊成 5"},
        {"kind": "edge", "input": "n = 2 - 5 * 3", "output": "three-address code:\nt1 = 5 * 3\nt2 = 2 - t1\nn = t2\nafter constant folding:\nn = -13", "note": "先乘後減；折疊的結果是負數 -13"},
        {"kind": "edge", "input": "q = (2 - 7) * (b - 2 * 3)", "output": "three-address code:\nt1 = 2 - 7\nt2 = 2 * 3\nt3 = b - t2\nt4 = t1 * t3\nq = t4\nafter constant folding:\nt1 = b - 6\nt2 = -5 * t1\nq = t2", "note": "折疊出的負數 -5 成為下一條指令的運算元"},
        {"kind": "edge", "input": "k = (((7)))", "output": "three-address code:\nk = 7\nafter constant folding:\nk = 7", "note": "多層括號只影響樹的形狀，不產生指令"},
        {"kind": "edge", "input": "v = 999999 * 1000 + 1000", "output": "three-address code:\nt1 = 999999 * 1000\nt2 = t1 + 1000\nv = t2\nafter constant folding:\nv = 1000000000", "note": "折疊出的值剛好是上限 10^9：題目保證每個常數子運算式都在範圍內，32 位元整數就放得下"},
        {"kind": "edge", "input": "big = 999999 * 999 - 999999 * 999", "output": "three-address code:\nt1 = 999999 * 999\nt2 = 999999 * 999\nt3 = t1 - t2\nbig = t3\nafter constant folding:\nbig = 0", "note": "三個運算都折疊，結果是 0"},
        {"kind": "edge", "input": "m = x * 0 + 0 * 5", "output": "three-address code:\nt1 = x * 0\nt2 = 0 * 5\nt3 = t1 + t2\nm = t3\nafter constant folding:\nt1 = x * 0\nt2 = t1 + 0\nm = t2", "note": "x * 0 有一邊是變數，本題規則不折疊（代數化簡不在本題範圍）；0 * 5 折疊成 0"},
        {"kind": "edge", "input": "a=1", "output": "three-address code:\na = 1\nafter constant folding:\na = 1", "note": "最短的合法輸入，沒有任何空白"},
        {"kind": "edge", "input": "x =  ( a )   *2", "output": "three-address code:\nt1 = a * 2\nx = t1\nafter constant folding:\nt1 = a * 2\nx = t1", "note": "多個空白與緊貼的 token 都要正確切開"},
        {"kind": "error", "input": "x = 3 $ 4", "output": "error: invalid character $", "note": "$ 不是這個語言的字元：lexer 就停下，沒有任何三位址碼"},
        {"kind": "error", "input": "X = 1", "output": "error: invalid character X", "note": "大寫字母不是合法字元"},
        {"kind": "error", "input": "x = a / 2", "output": "error: invalid character /", "note": "這個語言沒有除法，/ 是非法字元"},
        {"kind": "error", "input": "x = = 1 $", "output": "error: invalid character $", "note": "lexer 先切完整行才交給 parser：雖然第二個 = 先出錯，回報的是 lexer 發現的 $"},
        {"kind": "error", "input": "x = (1 + 2", "output": "error: unexpected end of line", "note": "缺少右括號：parser 讀到行尾還在等 )"},
        {"kind": "error", "input": "x = 3 +", "output": "error: unexpected end of line", "note": "+ 後面缺少運算元"},
        {"kind": "error", "input": "x = 1 2", "output": "error: unexpected 2", "note": "兩個運算元之間缺少運算子：運算式在 1 結束，接著的 2 是多餘的 token"},
        {"kind": "error", "input": "= 3", "output": "error: unexpected =", "note": "缺少被指定的名稱"},
        {"kind": "error", "input": "7 = x", "output": "error: unexpected 7", "note": "等號左邊必須是名稱"},
        {"kind": "error", "input": "x = a + )", "output": "error: unexpected )", "note": "需要運算元的位置出現 )"},
        {"kind": "error", "input": "x = (a + b))", "output": "error: unexpected )", "note": "多了一個右括號"},
        {"kind": "error", "input": "x = 1 + 2 = 3", "output": "error: unexpected =", "note": "一行只能有一個指定"},
        {"kind": "error", "input": "x = 2x", "output": "error: unexpected x", "note": "2x 被切成 2 與 x 兩個 token：數字後面直接接名稱是語法錯誤"},
        {"kind": "error", "input": "x = -3", "output": "error: unexpected -", "note": "這個語言沒有單元負號，- 只能出現在兩個運算元之間"},
        {"kind": "error", "input": "", "output": "error: unexpected end of line", "note": "空行：一開始就到了行尾"},
      ],
      hints: [
        '先把整行切成 token，lexer 沒出錯才交給 parser；parser 用 PL11 的遞迴下降，每條文法規則一個函式，`peek` 看下一個 token、`take` 取走它。',
        '`gen(node, fold, out)` 回傳「存放這個節點結果的運算元」：葉子回傳自己的文字；運算子節點先遞迴產生左右子樹，再決定是折疊成一個整數，還是把 `tN = a op b` 加進 out 並回傳 `tN`（N 是 out 目前的長度加一）。',
        '判斷一個運算元是不是整數，看它的第一個字元（折疊出的負數則看 `-` 之後的字元）是不是數字；名稱與 t1 都以字母開頭。',
        '同一棵 AST 用 `fold = false` 與 `fold = true` 各走一次，每次都用新的 out，暫存變數就會各自從 t1 編號。',
      ],
      starter: {
        'C++': code`#include <iostream>
#include <stdexcept>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

struct Node {
    std::string head;  // 葉子：數字或名稱；內部節點：運算子
    std::vector<Node> kids;
};

bool isDigit(char c) { return c >= '0' && c <= '9'; }
bool isLetter(char c) { return c >= 'a' && c <= 'z'; }

std::vector<std::string> tokenize(const std::string& line) {
    std::vector<std::string> tokens;
    std::size_t i = 0;
    while (i < line.size()) {
        const char c = line[i];
        if (c == ' ') {
            ++i;
        } else if (std::string("+-*()=").find(c) != std::string::npos) {
            tokens.push_back(std::string(1, c));
            ++i;
        } else if (isDigit(c) || isLetter(c)) {
            std::size_t j = i;  // 一串數字或一串小寫字母
            while (j < line.size() && (isDigit(c) ? isDigit(line[j]) : isLetter(line[j]))) ++j;
            tokens.push_back(line.substr(i, j - i));
            i = j;
        } else {
            throw std::runtime_error(std::string("invalid character ") + c);
        }
    }
    return tokens;
}

class Parser {
public:
    explicit Parser(std::vector<std::string> tokens) : tokens_(std::move(tokens)) {}

    std::pair<std::string, Node> line() {
        if (peek().empty() || !isLetter(peek()[0])) fail();
        const std::string name = take();
        if (peek() != "=") fail();
        take();
        Node node = expr();
        if (!peek().empty()) fail();
        return {name, node};
    }

private:
    std::vector<std::string> tokens_;
    std::size_t pos_ = 0;

    std::string peek() const { return pos_ < tokens_.size() ? tokens_[pos_] : ""; }  // 空字串代表行尾
    std::string take() { return tokens_[pos_++]; }
    [[noreturn]] void fail() const { throw std::runtime_error("unexpected " + (peek().empty() ? std::string("end of line") : peek())); }

    Node expr() {  // expr := term (("+" | "-") term)*
        Node node = term();
        while (peek() == "+" || peek() == "-") {
            const std::string op = take();
            node = Node{op, {node, term()}};
        }
        return node;
    }
    Node term() {  // term := factor ("*" factor)*
        Node node = factor();
        while (peek() == "*") {
            const std::string op = take();
            node = Node{op, {node, factor()}};
        }
        return node;
    }
    Node factor() {  // factor := NUMBER | NAME | "(" expr ")"
        const std::string tok = peek();
        if (!tok.empty() && (isDigit(tok[0]) || isLetter(tok[0]))) return Node{take(), {}};
        if (tok != "(") fail();
        take();
        Node node = expr();
        if (peek() != ")") fail();
        take();
        return node;
    }
};

bool isNum(const std::string& s) { return isDigit(s[s[0] == '-' ? 1 : 0]); }

std::string gen(const Node& node, bool fold, std::vector<std::string>& out) {
    // 練習：後序走訪 node。運算子節點先產生左右子樹；fold 為真且兩邊都是常數時回傳算好的常數，否則把「tN = a op b」加進 out（N 是 out 的長度加一）並回傳 tN。
    if (node.kids.empty()) return node.head;
    return "?";
}

int main() {
    std::string text;
    std::getline(std::cin, text);
    if (!text.empty() && text.back() == '\r') text.pop_back();
    std::string name;
    Node ast;
    try {
        std::tie(name, ast) = Parser(tokenize(text)).line();
    } catch (const std::runtime_error& error) {
        std::cout << "error: " << error.what() << "\n";
        return 0;
    }
    for (const bool fold : {false, true}) {
        std::vector<std::string> out;
        const std::string result = gen(ast, fold, out);
        std::cout << (fold ? "after constant folding:" : "three-address code:") << "\n";
        for (const std::string& ins : out) std::cout << ins << "\n";
        std::cout << name << " = " << result << "\n";
    }
    return 0;
}`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    record Node(String head, List<Node> kids) {}  // 葉子：數字或名稱；內部節點：運算子

    static class CompileError extends RuntimeException {
        CompileError(String message) { super(message); }
    }

    static boolean isDigit(char c) { return c >= '0' && c <= '9'; }
    static boolean isLetter(char c) { return c >= 'a' && c <= 'z'; }

    static List<String> tokenize(String line) {
        List<String> tokens = new ArrayList<>();
        int i = 0;
        while (i < line.length()) {
            char c = line.charAt(i);
            if (c == ' ') {
                i++;
            } else if ("+-*()=".indexOf(c) >= 0) {
                tokens.add(String.valueOf(c));
                i++;
            } else if (isDigit(c) || isLetter(c)) {
                int j = i;  // 一串數字或一串小寫字母
                while (j < line.length() && (isDigit(c) ? isDigit(line.charAt(j)) : isLetter(line.charAt(j)))) j++;
                tokens.add(line.substring(i, j));
                i = j;
            } else {
                throw new CompileError("invalid character " + c);
            }
        }
        return tokens;
    }

    static List<String> tokens;
    static int pos;

    static String peek() { return pos < tokens.size() ? tokens.get(pos) : null; }  // null 代表行尾
    static String take() { return tokens.get(pos++); }
    static CompileError fail() { return new CompileError("unexpected " + (peek() == null ? "end of line" : peek())); }

    static Node expr() {  // expr := term (("+" | "-") term)*
        Node node = term();
        while ("+".equals(peek()) || "-".equals(peek())) node = new Node(take(), List.of(node, term()));
        return node;
    }

    static Node term() {  // term := factor ("*" factor)*
        Node node = factor();
        while ("*".equals(peek())) node = new Node(take(), List.of(node, factor()));
        return node;
    }

    static Node factor() {  // factor := NUMBER | NAME | "(" expr ")"
        String tok = peek();
        if (tok != null && (isDigit(tok.charAt(0)) || isLetter(tok.charAt(0)))) return new Node(take(), List.of());
        if (!"(".equals(tok)) throw fail();
        take();
        Node node = expr();
        if (!")".equals(peek())) throw fail();
        take();
        return node;
    }

    static boolean isNum(String s) { return isDigit(s.charAt(s.charAt(0) == '-' ? 1 : 0)); }

    static String gen(Node node, boolean fold, List<String> out) {
        // 練習：後序走訪 node。運算子節點先產生左右子樹；fold 為真且兩邊都是常數時回傳算好的常數，否則把「tN = a op b」加進 out（N 是 out 的長度加一）並回傳 tN。
        if (node.kids().isEmpty()) return node.head();
        return "?";
    }

    public static void main(String[] args) throws IOException {
        String text = new BufferedReader(new InputStreamReader(System.in)).readLine();
        if (text == null) text = "";
        String name;
        Node ast;
        try {
            tokens = tokenize(text);
            pos = 0;
            if (peek() == null || !isLetter(peek().charAt(0))) throw fail();
            name = take();
            if (!"=".equals(peek())) throw fail();
            take();
            ast = expr();
            if (peek() != null) throw fail();
        } catch (CompileError error) {
            System.out.println("error: " + error.getMessage());
            return;
        }
        for (boolean fold : new boolean[] {false, true}) {
            List<String> out = new ArrayList<>();
            String result = gen(ast, fold, out);
            System.out.println(fold ? "after constant folding:" : "three-address code:");
            out.forEach(System.out::println);
            System.out.println(name + " = " + result);
        }
    }
}`,
        Python: code`import sys

DIGITS = "0123456789"
LETTERS = "abcdefghijklmnopqrstuvwxyz"


class CompileError(Exception):
    pass


def tokenize(line):
    tokens, i = [], 0
    while i < len(line):
        c = line[i]
        if c == " ":
            i += 1
        elif c in "+-*()=":
            tokens.append(c)
            i += 1
        elif c in DIGITS or c in LETTERS:
            kind = DIGITS if c in DIGITS else LETTERS  # 一串數字或一串小寫字母
            j = i
            while j < len(line) and line[j] in kind:
                j += 1
            tokens.append(line[i:j])
            i = j
        else:
            raise CompileError(f"invalid character {c}")
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens, self.pos = tokens, 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def fail(self):
        tok = self.peek()
        raise CompileError("unexpected " + ("end of line" if tok is None else tok))

    def take(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def line(self):
        name = self.peek()
        if name is None or name[0] not in LETTERS:
            self.fail()
        self.take()
        if self.peek() != "=":
            self.fail()
        self.take()
        node = self.expr()
        if self.peek() is not None:
            self.fail()
        return name, node

    def expr(self):  # expr := term (("+" | "-") term)*
        node = self.term()
        while self.peek() in ("+", "-"):
            node = (self.take(), node, self.term())
        return node

    def term(self):  # term := factor ("*" factor)*
        node = self.factor()
        while self.peek() == "*":
            node = (self.take(), node, self.factor())
        return node

    def factor(self):  # factor := NUMBER | NAME | "(" expr ")"
        tok = self.peek()
        if tok is not None and (tok[0] in DIGITS or tok[0] in LETTERS):
            return self.take()
        if tok != "(":
            self.fail()
        self.take()
        node = self.expr()
        if self.peek() != ")":
            self.fail()
        self.take()
        return node


def is_num(s):
    return s.lstrip("-")[0] in DIGITS


def gen(node, fold, out):
    # 練習：後序走訪 node。運算子節點先產生左右子樹；fold 為真且兩邊都是常數時回傳算好的常數，否則把「tN = a op b」加進 out（N 是 out 的長度加一）並回傳 tN。
    if isinstance(node, str):
        return node
    return "?"


def main():
    text = sys.stdin.read().split("\n")[0].rstrip("\r")
    try:
        name, ast = Parser(tokenize(text)).line()
    except CompileError as error:
        print(f"error: {error}")
        return
    for title, fold in (("three-address code:", False), ("after constant folding:", True)):
        out = []
        result = gen(ast, fold, out)
        print(title)
        for ins in out:
            print(ins)
        print(f"{name} = {result}")


main()`,
        JavaScript: code`class CompileError extends Error {}

const isDigit = c => c >= "0" && c <= "9";
const isLetter = c => c >= "a" && c <= "z";

function tokenize(line) {
    const tokens = [];
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === " ") {
            i++;
        } else if ("+-*()=".includes(c)) {
            tokens.push(c);
            i++;
        } else if (isDigit(c) || isLetter(c)) {
            const same = isDigit(c) ? isDigit : isLetter;  // 一串數字或一串小寫字母
            let j = i;
            while (j < line.length && same(line[j])) j++;
            tokens.push(line.slice(i, j));
            i = j;
        } else {
            throw new CompileError("invalid character " + c);
        }
    }
    return tokens;
}

function parseLine(tokens) {
    let pos = 0;
    const peek = () => (pos < tokens.length ? tokens[pos] : null);  // null 代表行尾
    const take = () => tokens[pos++];
    const fail = () => new CompileError("unexpected " + (peek() ?? "end of line"));
    const expr = () => {  // expr := term (("+" | "-") term)*
        let node = term();
        while (peek() === "+" || peek() === "-") node = [take(), node, term()];
        return node;
    };
    const term = () => {  // term := factor ("*" factor)*
        let node = factor();
        while (peek() === "*") node = [take(), node, factor()];
        return node;
    };
    const factor = () => {  // factor := NUMBER | NAME | "(" expr ")"
        const tok = peek();
        if (tok !== null && (isDigit(tok[0]) || isLetter(tok[0]))) return take();
        if (tok !== "(") throw fail();
        take();
        const node = expr();
        if (peek() !== ")") throw fail();
        take();
        return node;
    };
    if (peek() === null || !isLetter(peek()[0])) throw fail();
    const name = take();
    if (peek() !== "=") throw fail();
    take();
    const ast = expr();
    if (peek() !== null) throw fail();
    return [name, ast];
}

const isNum = s => isDigit(s[s[0] === "-" ? 1 : 0]);

function gen(node, fold, out) {
    // 練習：後序走訪 node。運算子節點先產生左右子樹；fold 為真且兩邊都是常數時回傳算好的常數，否則把「tN = a op b」加進 out（N 是 out 的長度加一）並回傳 tN。
    if (typeof node === "string") return node;
    return "?";
}

const text = require("fs").readFileSync(0, "utf8").split("\n")[0].replace(/\r$/, "");
let parsed;
try {
    parsed = parseLine(tokenize(text));
} catch (error) {
    if (!(error instanceof CompileError)) throw error;
    console.log("error: " + error.message);
}
if (parsed) {
    const [name, ast] = parsed;
    for (const fold of [false, true]) {
        const out = [];
        const result = gen(ast, fold, out);
        console.log(fold ? "after constant folding:" : "three-address code:");
        out.forEach(ins => console.log(ins));
        console.log(name + " = " + result);
    }
}`,
      },
      solution: {
        'C++': code`#include <iostream>
#include <stdexcept>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

struct Node {
    std::string head;  // 葉子：數字或名稱；內部節點：運算子
    std::vector<Node> kids;
};

bool isDigit(char c) { return c >= '0' && c <= '9'; }
bool isLetter(char c) { return c >= 'a' && c <= 'z'; }

std::vector<std::string> tokenize(const std::string& line) {
    std::vector<std::string> tokens;
    std::size_t i = 0;
    while (i < line.size()) {
        const char c = line[i];
        if (c == ' ') {
            ++i;
        } else if (std::string("+-*()=").find(c) != std::string::npos) {
            tokens.push_back(std::string(1, c));
            ++i;
        } else if (isDigit(c) || isLetter(c)) {
            std::size_t j = i;  // 一串數字或一串小寫字母
            while (j < line.size() && (isDigit(c) ? isDigit(line[j]) : isLetter(line[j]))) ++j;
            tokens.push_back(line.substr(i, j - i));
            i = j;
        } else {
            throw std::runtime_error(std::string("invalid character ") + c);
        }
    }
    return tokens;
}

class Parser {
public:
    explicit Parser(std::vector<std::string> tokens) : tokens_(std::move(tokens)) {}

    std::pair<std::string, Node> line() {
        if (peek().empty() || !isLetter(peek()[0])) fail();
        const std::string name = take();
        if (peek() != "=") fail();
        take();
        Node node = expr();
        if (!peek().empty()) fail();
        return {name, node};
    }

private:
    std::vector<std::string> tokens_;
    std::size_t pos_ = 0;

    std::string peek() const { return pos_ < tokens_.size() ? tokens_[pos_] : ""; }  // 空字串代表行尾
    std::string take() { return tokens_[pos_++]; }
    [[noreturn]] void fail() const { throw std::runtime_error("unexpected " + (peek().empty() ? std::string("end of line") : peek())); }

    Node expr() {  // expr := term (("+" | "-") term)*
        Node node = term();
        while (peek() == "+" || peek() == "-") {
            const std::string op = take();
            node = Node{op, {node, term()}};
        }
        return node;
    }
    Node term() {  // term := factor ("*" factor)*
        Node node = factor();
        while (peek() == "*") {
            const std::string op = take();
            node = Node{op, {node, factor()}};
        }
        return node;
    }
    Node factor() {  // factor := NUMBER | NAME | "(" expr ")"
        const std::string tok = peek();
        if (!tok.empty() && (isDigit(tok[0]) || isLetter(tok[0]))) return Node{take(), {}};
        if (tok != "(") fail();
        take();
        Node node = expr();
        if (peek() != ")") fail();
        take();
        return node;
    }
};

bool isNum(const std::string& s) { return isDigit(s[s[0] == '-' ? 1 : 0]); }

std::string gen(const Node& node, bool fold, std::vector<std::string>& out) {
    if (node.kids.empty()) return node.head;
    const std::string a = gen(node.kids[0], fold, out);  // 後序走訪：先產生左右子樹
    const std::string b = gen(node.kids[1], fold, out);
    if (fold && isNum(a) && isNum(b)) {  // 常數折疊：兩邊都是常數，編譯時就算出來
        const long long x = std::stoll(a), y = std::stoll(b);
        return std::to_string(node.head == "+" ? x + y : node.head == "-" ? x - y : x * y);
    }
    const std::string temp = "t" + std::to_string(out.size() + 1);
    out.push_back(temp + " = " + a + " " + node.head + " " + b);
    return temp;
}

int main() {
    std::string text;
    std::getline(std::cin, text);
    if (!text.empty() && text.back() == '\r') text.pop_back();
    std::string name;
    Node ast;
    try {
        std::tie(name, ast) = Parser(tokenize(text)).line();
    } catch (const std::runtime_error& error) {
        std::cout << "error: " << error.what() << "\n";
        return 0;
    }
    for (const bool fold : {false, true}) {
        std::vector<std::string> out;
        const std::string result = gen(ast, fold, out);
        std::cout << (fold ? "after constant folding:" : "three-address code:") << "\n";
        for (const std::string& ins : out) std::cout << ins << "\n";
        std::cout << name << " = " << result << "\n";
    }
    return 0;
}`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    record Node(String head, List<Node> kids) {}  // 葉子：數字或名稱；內部節點：運算子

    static class CompileError extends RuntimeException {
        CompileError(String message) { super(message); }
    }

    static boolean isDigit(char c) { return c >= '0' && c <= '9'; }
    static boolean isLetter(char c) { return c >= 'a' && c <= 'z'; }

    static List<String> tokenize(String line) {
        List<String> tokens = new ArrayList<>();
        int i = 0;
        while (i < line.length()) {
            char c = line.charAt(i);
            if (c == ' ') {
                i++;
            } else if ("+-*()=".indexOf(c) >= 0) {
                tokens.add(String.valueOf(c));
                i++;
            } else if (isDigit(c) || isLetter(c)) {
                int j = i;  // 一串數字或一串小寫字母
                while (j < line.length() && (isDigit(c) ? isDigit(line.charAt(j)) : isLetter(line.charAt(j)))) j++;
                tokens.add(line.substring(i, j));
                i = j;
            } else {
                throw new CompileError("invalid character " + c);
            }
        }
        return tokens;
    }

    static List<String> tokens;
    static int pos;

    static String peek() { return pos < tokens.size() ? tokens.get(pos) : null; }  // null 代表行尾
    static String take() { return tokens.get(pos++); }
    static CompileError fail() { return new CompileError("unexpected " + (peek() == null ? "end of line" : peek())); }

    static Node expr() {  // expr := term (("+" | "-") term)*
        Node node = term();
        while ("+".equals(peek()) || "-".equals(peek())) node = new Node(take(), List.of(node, term()));
        return node;
    }

    static Node term() {  // term := factor ("*" factor)*
        Node node = factor();
        while ("*".equals(peek())) node = new Node(take(), List.of(node, factor()));
        return node;
    }

    static Node factor() {  // factor := NUMBER | NAME | "(" expr ")"
        String tok = peek();
        if (tok != null && (isDigit(tok.charAt(0)) || isLetter(tok.charAt(0)))) return new Node(take(), List.of());
        if (!"(".equals(tok)) throw fail();
        take();
        Node node = expr();
        if (!")".equals(peek())) throw fail();
        take();
        return node;
    }

    static boolean isNum(String s) { return isDigit(s.charAt(s.charAt(0) == '-' ? 1 : 0)); }

    static String gen(Node node, boolean fold, List<String> out) {
        if (node.kids().isEmpty()) return node.head();
        String a = gen(node.kids().get(0), fold, out);  // 後序走訪：先產生左右子樹
        String b = gen(node.kids().get(1), fold, out);
        if (fold && isNum(a) && isNum(b)) {  // 常數折疊：兩邊都是常數，編譯時就算出來
            long x = Long.parseLong(a), y = Long.parseLong(b);
            return String.valueOf(switch (node.head()) { case "+" -> x + y; case "-" -> x - y; default -> x * y; });
        }
        String temp = "t" + (out.size() + 1);
        out.add(temp + " = " + a + " " + node.head() + " " + b);
        return temp;
    }

    public static void main(String[] args) throws IOException {
        String text = new BufferedReader(new InputStreamReader(System.in)).readLine();
        if (text == null) text = "";
        String name;
        Node ast;
        try {
            tokens = tokenize(text);
            pos = 0;
            if (peek() == null || !isLetter(peek().charAt(0))) throw fail();
            name = take();
            if (!"=".equals(peek())) throw fail();
            take();
            ast = expr();
            if (peek() != null) throw fail();
        } catch (CompileError error) {
            System.out.println("error: " + error.getMessage());
            return;
        }
        for (boolean fold : new boolean[] {false, true}) {
            List<String> out = new ArrayList<>();
            String result = gen(ast, fold, out);
            System.out.println(fold ? "after constant folding:" : "three-address code:");
            out.forEach(System.out::println);
            System.out.println(name + " = " + result);
        }
    }
}`,
        Python: code`import sys

DIGITS = "0123456789"
LETTERS = "abcdefghijklmnopqrstuvwxyz"


class CompileError(Exception):
    pass


def tokenize(line):
    tokens, i = [], 0
    while i < len(line):
        c = line[i]
        if c == " ":
            i += 1
        elif c in "+-*()=":
            tokens.append(c)
            i += 1
        elif c in DIGITS or c in LETTERS:
            kind = DIGITS if c in DIGITS else LETTERS  # 一串數字或一串小寫字母
            j = i
            while j < len(line) and line[j] in kind:
                j += 1
            tokens.append(line[i:j])
            i = j
        else:
            raise CompileError(f"invalid character {c}")
    return tokens


class Parser:
    def __init__(self, tokens):
        self.tokens, self.pos = tokens, 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def fail(self):
        tok = self.peek()
        raise CompileError("unexpected " + ("end of line" if tok is None else tok))

    def take(self):
        tok = self.peek()
        self.pos += 1
        return tok

    def line(self):
        name = self.peek()
        if name is None or name[0] not in LETTERS:
            self.fail()
        self.take()
        if self.peek() != "=":
            self.fail()
        self.take()
        node = self.expr()
        if self.peek() is not None:
            self.fail()
        return name, node

    def expr(self):  # expr := term (("+" | "-") term)*
        node = self.term()
        while self.peek() in ("+", "-"):
            node = (self.take(), node, self.term())
        return node

    def term(self):  # term := factor ("*" factor)*
        node = self.factor()
        while self.peek() == "*":
            node = (self.take(), node, self.factor())
        return node

    def factor(self):  # factor := NUMBER | NAME | "(" expr ")"
        tok = self.peek()
        if tok is not None and (tok[0] in DIGITS or tok[0] in LETTERS):
            return self.take()
        if tok != "(":
            self.fail()
        self.take()
        node = self.expr()
        if self.peek() != ")":
            self.fail()
        self.take()
        return node


def is_num(s):
    return s.lstrip("-")[0] in DIGITS


def gen(node, fold, out):
    if isinstance(node, str):
        return node
    op, left, right = node
    a = gen(left, fold, out)  # 後序走訪：先產生左右子樹
    b = gen(right, fold, out)
    if fold and is_num(a) and is_num(b):  # 常數折疊：兩邊都是常數，編譯時就算出來
        x, y = int(a), int(b)
        return str(x + y if op == "+" else x - y if op == "-" else x * y)
    temp = f"t{len(out) + 1}"
    out.append(f"{temp} = {a} {op} {b}")
    return temp


def main():
    text = sys.stdin.read().split("\n")[0].rstrip("\r")
    try:
        name, ast = Parser(tokenize(text)).line()
    except CompileError as error:
        print(f"error: {error}")
        return
    for title, fold in (("three-address code:", False), ("after constant folding:", True)):
        out = []
        result = gen(ast, fold, out)
        print(title)
        for ins in out:
            print(ins)
        print(f"{name} = {result}")


main()`,
        JavaScript: code`class CompileError extends Error {}

const isDigit = c => c >= "0" && c <= "9";
const isLetter = c => c >= "a" && c <= "z";

function tokenize(line) {
    const tokens = [];
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === " ") {
            i++;
        } else if ("+-*()=".includes(c)) {
            tokens.push(c);
            i++;
        } else if (isDigit(c) || isLetter(c)) {
            const same = isDigit(c) ? isDigit : isLetter;  // 一串數字或一串小寫字母
            let j = i;
            while (j < line.length && same(line[j])) j++;
            tokens.push(line.slice(i, j));
            i = j;
        } else {
            throw new CompileError("invalid character " + c);
        }
    }
    return tokens;
}

function parseLine(tokens) {
    let pos = 0;
    const peek = () => (pos < tokens.length ? tokens[pos] : null);  // null 代表行尾
    const take = () => tokens[pos++];
    const fail = () => new CompileError("unexpected " + (peek() ?? "end of line"));
    const expr = () => {  // expr := term (("+" | "-") term)*
        let node = term();
        while (peek() === "+" || peek() === "-") node = [take(), node, term()];
        return node;
    };
    const term = () => {  // term := factor ("*" factor)*
        let node = factor();
        while (peek() === "*") node = [take(), node, factor()];
        return node;
    };
    const factor = () => {  // factor := NUMBER | NAME | "(" expr ")"
        const tok = peek();
        if (tok !== null && (isDigit(tok[0]) || isLetter(tok[0]))) return take();
        if (tok !== "(") throw fail();
        take();
        const node = expr();
        if (peek() !== ")") throw fail();
        take();
        return node;
    };
    if (peek() === null || !isLetter(peek()[0])) throw fail();
    const name = take();
    if (peek() !== "=") throw fail();
    take();
    const ast = expr();
    if (peek() !== null) throw fail();
    return [name, ast];
}

const isNum = s => isDigit(s[s[0] === "-" ? 1 : 0]);

function gen(node, fold, out) {
    if (typeof node === "string") return node;
    const [op, left, right] = node;
    const a = gen(left, fold, out);  // 後序走訪：先產生左右子樹
    const b = gen(right, fold, out);
    if (fold && isNum(a) && isNum(b)) {  // 常數折疊：兩邊都是常數，編譯時就算出來
        const x = Number(a), y = Number(b);
        return String(op === "+" ? x + y : op === "-" ? x - y : x * y);
    }
    const temp = "t" + (out.length + 1);
    out.push(temp + " = " + a + " " + op + " " + b);
    return temp;
}

const text = require("fs").readFileSync(0, "utf8").split("\n")[0].replace(/\r$/, "");
let parsed;
try {
    parsed = parseLine(tokenize(text));
} catch (error) {
    if (!(error instanceof CompileError)) throw error;
    console.log("error: " + error.message);
}
if (parsed) {
    const [name, ast] = parsed;
    for (const fold of [false, true]) {
        const out = [];
        const result = gen(ast, fold, out);
        console.log(fold ? "after constant folding:" : "three-address code:");
        out.forEach(ins => console.log(ins));
        console.log(name + " = " + result);
    }
}`,
      },
      judge: 'none',
    },
  ],
};
