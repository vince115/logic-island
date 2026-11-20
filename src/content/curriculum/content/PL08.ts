import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/**
 * PL08 記憶體管理與垃圾回收. Every example and the reference solutions run in tests/curriculum-code.test.ts. Nothing here
 * prints anything that depends on when a garbage collector runs: C++ destructors and shared_ptr counts are
 * deterministic, and the collectors of Java, Python and JavaScript are taught by simulating their algorithms (reference
 * counts kept by hand, a mark-and-sweep over a fixed object graph), which prints the same in every run.
 */

/** The mark-and-sweep example in Python; the trace below runs exactly this program. */
const MARK_SWEEP_PY = code`heap = {
    "A": ["B"], "B": ["C"], "C": ["A"], "D": ["C"],
    "E": ["F"], "F": ["E"], "G": ["B"],
}
roots = ["A", "G"]  # 根集合
marked = set()


def mark(name):
    if name in marked:
        return  # 已標記：循環在這裡停下
    marked.add(name)
    print("mark", name)
    for child in heap[name]:
        mark(child)


for root in roots:
    mark(root)
swept = [name for name in heap if name not in marked]
print("swept:", " ".join(swept))`;

/** The object graph of MARK_SWEEP_PY: each object and the objects it references, in the program's order. */
const HEAP: [string, string[]][] = [['A', ['B']], ['B', ['C']], ['C', ['A']], ['D', ['C']], ['E', ['F']], ['F', ['E']], ['G', ['B']]];
const ROOTS = ['A', 'G'];

/**
 * The trace of MARK_SWEEP_PY, produced by running the same recursive mark and the same sweep on HEAP (so the panels
 * cannot disagree with the program). Lines: 6 `marked = set()`, 11 `return` (already marked), 13 `print` after
 * `marked.add`, 20 the sweep, 21 the last print. Marks: current = the object mark() is looking at, visited = marked
 * (reachable), removed = swept; the edge just followed is read.
 */
function markSweepSteps(): TraceStep[] {
  const nodes = HEAP.map(([name]) => name);
  const edges = HEAP.flatMap(([from, to]) => to.map(t => ({ from, to: t })));
  const refs = new Map(HEAP);
  const marked: string[] = [];
  const printed: string[] = [];
  const calls: string[] = [];
  const steps: TraceStep[] = [];
  const q = (s: string) => `'${s}'`;
  const setText = () => (marked.length ? `{${[...marked].sort().map(q).join(', ')}}` : 'set()');
  const graph = (focus?: string, edge?: number, swept = false): TraceStep['graph'] => ({
    name: 'heap', nodes, edges, directed: true, show: ['list'],
    marks: [
      ...(focus ? [{ node: focus, kind: 'current' as const }] : []),
      ...(edge !== undefined ? [{ edge, kind: 'read' as const }] : []),
      ...nodes.filter(v => v !== focus && (swept || marked.includes(v))).map(v => ({ node: v, kind: marked.includes(v) ? 'visited' as const : 'removed' as const })),
    ],
  });
  const frames = (root: string) => [{ name: '<module>', vars: { root: q(root) } }, ...calls.map(c => ({ name: 'mark', vars: { name: q(c) } }))];

  steps.push({ line: 6, note: `根集合 \`roots\` 是 ${ROOTS.join('、')}：程式的變數直接參考的物件。箭頭是物件之間的參考，例如 D → C 表示 D 的欄位參考 C。開始時沒有任何物件被標記。`,
    graph: graph(), vars: { roots: `[${ROOTS.map(q).join(', ')}]`, marked: setText() }, output: '' });
  const mark = (name: string, root: string, from?: string) => {
    calls.push(name);
    const edge = from === undefined ? undefined : edges.findIndex(e => e.from === from && e.to === name);
    const vars = () => ({ root: q(root), name: q(name), marked: setText() });
    if (marked.includes(name)) {
      const cycle = calls.indexOf(name) < calls.length - 1;
      steps.push({ line: 11, note: cycle
        ? `沿著 ${from} → ${name} 回到 ${name}：${name} 已經在 \`marked\` 裡，直接 \`return\`。循環 ${calls.slice(calls.indexOf(name)).join(' → ')} 就是在這裡停下，不會無限遞迴。`
        : `從 ${from} 走到 ${name}：${name} 已經從別的路徑標記過，直接 \`return\`，不必再走一次它後面的物件。`,
      graph: graph(name, edge), vars: vars(), frames: frames(root), output: printed.join('\n') });
      calls.pop();
      return;
    }
    marked.push(name);
    printed.push(`mark ${name}`);
    const children = refs.get(name)!;
    steps.push({ line: 13, note: `${from === undefined ? `從根 ${name} 開始` : `沿著 ${from} → ${name} 的參考走到 ${name}`}：${name} 還沒標記，加入 \`marked\` 並印出；接著走訪 ${name} 參考的 ${children.join('、')}。`,
      graph: graph(name, edge), vars: vars(), frames: frames(root), output: printed.join('\n') });
    for (const child of children) mark(child, root, name);
    calls.pop();
  };
  for (const root of ROOTS) mark(root, root);
  const swept = nodes.filter(v => !marked.includes(v));
  steps.push({ line: 20, note: `標記結束，可達的是 ${[...marked].sort().join('、')}。清除階段依序檢查堆積中的每個物件，沒有標記的 ${swept.join('、')} 被回收。D 雖然參考了存活的 C，卻沒有任何物件參考 D；E 與 F 互相參考，但從根集合走不到它們。`,
    graph: graph(undefined, undefined, true), vars: { marked: setText(), swept: `[${swept.map(q).join(', ')}]` }, output: printed.join('\n') });
  printed.push(`swept: ${swept.join(' ')}`);
  steps.push({ line: 21, note: '印出被回收的物件。在真正的回收器中，清除階段會把這些物件的記憶體交還給配置器，之後配置新物件時就能重複使用這些空間。',
    graph: graph(undefined, undefined, true), vars: { marked: setText(), swept: `[${swept.map(q).join(', ')}]` }, output: printed.join('\n') });
  return steps;
}

/** A chain 1 → 2 → … → 1000 from one root: deeper than Python's default recursion limit. */
const CHAIN = 1000;
const chainInput = `${CHAIN} ${CHAIN - 1} 1\n1\n` + Array.from({ length: CHAIN - 1 }, (_, i) => `${i + 1} ${i + 2}`).join('\n');
const chainOutput = 'marked: ' + Array.from({ length: CHAIN }, (_, i) => i + 1).join(' ') + '\nfreed: none';

export const PL08: LessonContent = {
  lessonId: 'PL08',
  motivation: 'C++ 程式忘了 `delete` 會慢慢吃光記憶體，多 `delete` 一次就可能當掉；Java、Python、JavaScript 雖然會自動回收，伺服器仍可能因為一個只增不減的快取而記憶體不足，或在垃圾回收的停頓中突然變慢。弄清楚每種語言「由誰、在什麼時候」釋放物件，就能在物件圖上判斷誰會被回收、看出循環參考為什麼會洩漏，並在 C++ 用 RAII 與智慧指標寫出不必手動 `delete` 的程式。',
  sections: [
    {
      id: 'who-frees', title: '誰來釋放堆積上的物件',
      blocks: [
        { type: 'p', text: 'PL07 說明過：區域變數放在堆疊框架裡，函式返回時自動消失；用 `new` 建立的物件放在堆積（heap）上，活多久由程式決定。記憶體管理（memory management）要回答的就是「物件不再需要時，由誰、在什麼時候把空間還回去」。還得太早，留下的指標就成了懸空指標（dangling pointer）；忘了還，就是記憶體洩漏（memory leak）。' },
        { type: 'table', head: ['策略', '誰釋放', '什麼時候釋放', '典型問題', '代表'], rows: [
          ['手動管理（manual memory management）', '程式設計師寫 `delete`／`free`', '寫在哪裡就在哪裡', '忘記釋放、釋放兩次、釋放後繼續使用', 'C 的 `malloc`／`free`、C++ 的 `new`／`delete`'],
          ['RAII 與智慧指標（smart pointer）', '擁有者物件的解構子', '擁有者離開範圍時，時間確定', '擁有關係要自己設計；`shared_ptr` 互相指向時不會釋放', 'C++ 的 `unique_ptr`、`shared_ptr`'],
          ['參考計數（reference counting）', '執行環境', '最後一個參考消失的當下', '循環參考的計數永遠不會歸零；每次指定都要更新計數', 'CPython、Swift、C++ 的 `shared_ptr`'],
          ['追蹤式垃圾回收（tracing garbage collection）', '垃圾回收器（garbage collector，GC）', '回收器自己決定，程式無法預測', '停頓（pause）；仍被參考但不再使用的物件不會被回收', 'Java、JavaScript、C#、Go'],
        ] },
        { type: 'p', text: '四種語言的實際做法如下。注意「回收記憶體」和「關閉檔案、連線等資源」是兩件事：有 GC 的語言只負責前者，而且不保證什麼時候做，所以都另外提供在固定時間點釋放資源的語法。' },
        { type: 'table', head: ['語言', '堆積物件怎麼回收', '檔案、連線等資源怎麼關閉'], rows: [
          ['C++', '沒有 GC：由解構子（RAII、智慧指標）釋放，或手動 `delete`', '解構子，離開範圍時執行'],
          ['Java', 'HotSpot JVM 的追蹤式世代 GC（預設是 G1）', '`try`-with-resources 呼叫 `close()`'],
          ['Python（CPython）', '參考計數；另有處理循環參考的世代式收集器（`gc` 模組）', '`with` 敘述（context manager）'],
          ['JavaScript（Node.js 的 V8）', '追蹤式世代 GC：年輕代用複製式的 scavenge，老年代用 mark-sweep 與壓縮', '`try`／`finally`'],
        ] },
        { type: 'callout', tone: 'warning', title: '手動管理的三個經典錯誤', text: '寫了 `int* p = new int[100];` 之後：一、函式在 `delete[] p;` 之前 `return` 或丟出例外，這塊記憶體就再也沒人釋放（洩漏）。二、另一個指標 `q = p` 也指向同一塊，兩邊各 `delete[]` 一次，就是重複釋放（double free），屬於未定義行為。三、`delete[] p;` 之後又讀 `p[0]`，是使用已釋放的記憶體，可能讀到別人的資料而不當掉。另外 `new[]` 必須配 `delete[]`，配成 `delete` 也是未定義行為。編譯器幾乎都不會擋下這些錯誤，所以現代 C++ 在一般程式碼中不直接寫 `delete`，而是交給下一節的 RAII。' },
      ],
    },
    {
      id: 'raii', title: 'RAII 與智慧指標：讓範圍決定釋放時間',
      blocks: [
        { type: 'p', text: 'RAII（Resource Acquisition Is Initialization，資源取得即初始化）的做法是：在建構子取得資源，在解構子（destructor）釋放資源，再讓一個物件「擁有」這份資源。物件離開範圍時解構子一定會執行，不論是正常走到 `}`、中途 `return`，還是丟出例外。同一個範圍內的區域物件依建立的相反順序解構，所以釋放的時間與順序都是確定的（deterministic），可以直接從輸出看出來。' },
        { type: 'example', id: 'scope-cleanup' },
        { type: 'p', text: '四段程式的輸出相同，差別在背後。C++ 的 `log` 在堆疊上、`db` 由 `std::unique_ptr` 擁有並放在堆積上，到了 `}` 兩者都解構，`db` 的記憶體也在那一刻還給堆積。Java 的 `try`-with-resources 依相反順序呼叫 `close()`，Python 的 `with` 依相反順序離開每個 context manager（`contextlib.contextmanager` 把 `yield` 之前與之後分別當成進入與離開），JavaScript 用巢狀的 `try`／`finally`。這三種語言關閉的是資源，`Resource` 物件本身仍佔著記憶體，要等回收器之後某次執行才會回收。' },
        { type: 'table', head: ['智慧指標', '擁有方式', '能不能複製', '物件什麼時候釋放'], rows: [
          ['`std::unique_ptr<T>`', '唯一的擁有者', '不能複製，只能用 `std::move` 把擁有權轉移出去', '擁有者解構或呼叫 `reset()` 時'],
          ['`std::shared_ptr<T>`', '共同擁有；控制區塊（control block）記錄有幾個 `shared_ptr` 指向它', '可以，複製時計數加 1', '最後一個 `shared_ptr` 消失、計數歸 0 時'],
          ['`std::weak_ptr<T>`', '不擁有，只觀察', '可以，但不改變強參考的計數', '它不決定釋放；用 `lock()` 取得暫時的 `shared_ptr`，物件已釋放時得到空指標'],
        ] },
        { type: 'list', items: [
          '用 `std::make_unique`、`std::make_shared` 建立物件，程式中就不會出現裸露的 `new` 與 `delete`。',
          '預設用 `unique_ptr`：大多數物件只有一個擁有者，而且它沒有計數的成本。真的有多個擁有者、無法決定誰最後放手時，才用 `shared_ptr`。',
          '函式只是暫時使用一個物件、不參與擁有時，參數寫成參考 `T&` 或一般指標 `T*` 即可，不必傳智慧指標。',
        ] },
        { type: 'callout', tone: 'note', title: '不要把清理工作交給 finalizer', text: 'Java 的 `finalize()`（已棄用）、Python 的 `__del__`、JavaScript 的 `FinalizationRegistry` 都是「物件被回收時才呼叫」，而回收時間不保證，甚至可能到程式結束都不執行。CPython 在沒有循環時通常會立刻呼叫 `__del__`，但物件在循環中，或換成 PyPy 等其他實作時就不一定。檔案、連線、鎖一律用上面的 `try`-with-resources、`with`、`finally` 明確關閉。' },
      ],
    },
    {
      id: 'refcount', title: '參考計數與循環參考',
      blocks: [
        { type: 'p', text: '參考計數讓每個物件記錄「目前有幾個參考指向我」：多一個參考就加 1，少一個就減 1，減到 0 的當下立刻釋放，並把它自己持有的參考也一一放掉。優點是釋放得早而且時間可預測，不需要另外暫停程式去找垃圾。代價是每次指定、傳參數、離開範圍都要更新計數；多執行緒共用時還得用原子操作，所以 `shared_ptr` 的複製比一般指標昂貴。' },
        { type: 'example', id: 'shared-count' },
        { type: 'p', text: 'C++ 的 `shared_ptr` 是真正的參考計數，`use_count()` 回傳的就是控制區塊裡的數字。Java 與 JavaScript 沒有參考計數；CPython 雖然有，但數字是直譯器內部的細節（`sys.getrefcount` 還會把呼叫它時產生的暫時參考算進去），不適合拿來印。所以這三種語言用一個小類別 `Counted` 把同樣的規則寫出來：`retain` 相當於複製一個 `shared_ptr`，`release` 相當於一個 `shared_ptr` 消失。' },
        { type: 'p', text: '參考計數的弱點是循環參考（reference cycle）。A 參考 B、B 也參考 A 時，即使程式中已經沒有任何變數指向它們，兩者的計數仍各是 1，永遠等不到歸零，於是一起洩漏。下面的 C++ 程式用 `weak_ptr` 在範圍結束後觀察 A 與 B：計數停在 1，解構子沒有執行。把「回頭」的那一條參考改成 `weak_ptr` 之後，C 的計數只有 1，範圍結束時 C 先被釋放，C 放開對 D 的參考，D 也跟著被釋放。' },
        { type: 'example', id: 'cycle' },
        { type: 'list', items: [
          '設計擁有關係：父節點用 `shared_ptr`（或 `unique_ptr`）擁有子節點，子節點指回父節點用 `weak_ptr` 或一般指標。雙向串列、樹的 parent 指標、觀察者模式都是常見的循環來源。',
          'CPython 的補救：參考計數處理大部分物件，另外有一個循環偵測的收集器（`gc` 模組），以世代分組定期檢查串列、字典、自訂物件等容器，找出「只被彼此參考、外部到不了」的一群物件並回收。所以 Python 的循環最後會被回收，只是不像計數歸零那樣立刻發生。',
          '追蹤式 GC 根本不在乎循環：它只問物件從根集合走不走得到，下一節會看到。',
        ] },
        { type: 'callout', tone: 'warning', title: 'shared_ptr 不是垃圾回收器', text: '常見的誤解是「全部改用 `shared_ptr` 就不會洩漏」。`shared_ptr` 只是參考計數，兩個物件用 `shared_ptr` 互相指向時，就像上面的 A 與 B，計數永遠停在 1，解構子永遠不執行，而且沒有任何警告。C++ 沒有循環收集器，只能在設計時用 `weak_ptr` 打斷循環。' },
      ],
    },
    {
      id: 'tracing', title: '追蹤式 GC：從根集合出發的 mark-and-sweep',
      blocks: [
        { type: 'p', text: '追蹤式 GC 不記錄計數，而是在需要時檢查整張物件圖。根集合（root set）是程式能直接拿到的參考：各個堆疊框架裡的區域變數與參數、全域與靜態變數、暫存器中的值。一個物件若能從某個根沿著參考一路走到，就是可達的（reachable）；可達性（reachability）是追蹤式 GC 判斷「還要不要」的唯一標準，走不到的物件程式再也拿不到，就是垃圾。' },
        { type: 'list', ordered: true, items: [
          '標記（mark）：從每個根出發走訪物件圖，把走到的物件標記起來；已經標記過的就不再走，所以循環不會讓它停不下來。這其實就是從多個起點同時出發的 DFS 或 BFS。',
          '清除（sweep）：依序檢查堆積中的每個物件，沒有標記的就回收，有標記的清掉標記，留給下一次收集。',
          '壓縮（compact，選用）：把存活的物件搬到一起，消除零碎的空洞，之後配置只要往後移一個指標。做這一步的叫 mark-compact。',
        ] },
        { type: 'p', text: '下面四段程式都在模擬同一次 mark-and-sweep：物件圖有 A 到 G 七個物件，根集合是 A 與 G。A → B → C → A 形成循環，但從根走得到，所以全部存活；G 參考已經標記的 B，標記就在那裡停下。D 參考存活的 C，但沒有任何物件參考 D，參考有方向，「指向活物件」並不會讓自己活下來；E 與 F 互相參考，卻從根走不到，參考計數會讓它們洩漏，mark-and-sweep 則把它們回收。頁面下方的逐步追蹤執行同一段 Python 程式：「已拜訪」是已標記，「已移除」是被清除的物件。' },
        { type: 'example', id: 'mark-sweep' },
        { type: 'callout', tone: 'warning', title: '有 GC 的語言一樣會記憶體洩漏', text: 'GC 回收的是「走不到」的物件，不是「不再使用」的物件。一個靜態的 `List`、全域的 `dict` 或模組層級的 `Map` 屬於根集合，放進去的物件永遠可達：例如把每個請求都加進 `history` 卻從不刪除、註冊了事件監聽器卻從不移除、用無上限的快取。記憶體會一直增加，GC 一個也回收不了。修正方法是不用時移除參考、替快取設上限，或在 Java 用 `WeakHashMap`、在 JavaScript 用 `WeakMap` 以物件為鍵：鍵物件只剩下這個弱參考時，整筆資料就能被回收。' },
      ],
    },
    {
      id: 'generational', title: '世代式 GC 與停頓',
      blocks: [
        { type: 'p', text: '每次都標記整個堆積很浪費，因為實際觀察到的現象是：大多數物件配置後很快就不再使用（迴圈中的暫存字串、一次請求的中間結果），活過一段時間的物件則傾向活很久（設定、快取、連線池）。這叫弱世代假說（weak generational hypothesis）。世代式 GC（generational GC）據此把堆積分成年輕代（young generation）與老年代（old generation）：新物件配置在年輕代，年輕代滿了就只收集年輕代，稱為 minor GC；在幾次 minor GC 中都存活的物件被晉升（promote）到老年代，老年代較少收集，收集時通常連同整個堆積一起處理，稱為 major GC 或 full GC。' },
        { type: 'table', head: ['', 'minor GC', 'major／full GC'], rows: [
          ['檢查範圍', '只有年輕代', '老年代（通常是整個堆積）'],
          ['多久一次', '頻繁：年輕代一滿就做', '少：老年代快滿時'],
          ['工作量', '主要和「存活的年輕物件」成正比，而依假說它們很少', '和整個堆積的存活物件成正比'],
          ['停頓', '通常很短', '可能明顯較長，現代回收器以並行標記縮短它'],
        ] },
        { type: 'p', text: '只收集年輕代有一個難題：老物件可能參考年輕物件，而 minor GC 不走訪老年代。所以每次把參考寫進物件欄位時，執行環境會插入一小段寫入屏障（write barrier）程式，把「老物件指向年輕物件」的位置記在記憶集（remembered set），minor GC 把它們也當成根。這是世代式 GC 加在每次指定上的一點成本。' },
        { type: 'p', text: '停頓（pause）是回收器為了讓物件圖在標記時保持一致，暫停所有執行緒的時間，也叫 stop-the-world。一次 50 毫秒的停頓對批次程式無感，對每秒 60 格的遊戲或要求 10 毫秒內回應的伺服器就是明顯的卡頓。所以 Java 的 G1、ZGC 與 V8 都把大部分標記工作放到背景執行緒，和程式同時進行（concurrent marking），只留下短暫的停頓；縮短停頓通常要付出更多 CPU 與記憶體。' },
        { type: 'list', items: [
          '降低 GC 壓力最有效的方法是減少存活的物件：快取設上限、不需要的參考及早放掉。大量短命的物件在世代式 GC 下通常很便宜，不必為了它們犧牲可讀性。',
          '要了解 GC 的實際行為就去量：Java 用 `-Xlog:gc`、Node.js 用 `--trace-gc`、Python 用 `gc.set_debug`，不要憑感覺猜。',
          'GC 何時執行由執行環境決定，同一個程式每次跑都可能不同。程式的正確性不能依賴它，這也是本課的範例用模擬來呈現 GC 演算法的原因。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'scope-cleanup', title: '離開範圍時依相反順序釋放', description: '先開啟 log、再開啟 db，離開範圍時先關 db、再關 log。C++ 由解構子（RAII）完成，Java、Python、JavaScript 用各自的明確語法做到同樣的順序。',
      output: 'open log\nopen db\nwork\nclose db\nclose log\ndone',
      code: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>

struct Resource {
    std::string name;
    explicit Resource(std::string n) : name(std::move(n)) { std::cout << "open " << name << "\n"; }
    ~Resource() { std::cout << "close " << name << "\n"; }  // 解構子：釋放資源
};

int main() {
    {
        Resource log("log");                         // 在堆疊上
        auto db = std::make_unique<Resource>("db");  // 在堆積上，由 unique_ptr 擁有
        std::cout << "work\n";
    }  // 離開範圍：先解構 db（連同堆積記憶體），再解構 log
    std::cout << "done\n";
    return 0;
}`,
        Python: code`from contextlib import contextmanager


@contextmanager
def resource(name):
    print("open", name)
    try:
        yield name
    finally:
        print("close", name)  # 離開 with 時一定執行


with resource("log"), resource("db"):
    print("work")
print("done")`,
        Java: code`public class Main {
    static class Resource implements AutoCloseable {
        private final String name;

        Resource(String name) {
            this.name = name;
            System.out.println("open " + name);
        }

        @Override
        public void close() {
            System.out.println("close " + name);
        }
    }

    public static void main(String[] args) {
        try (Resource log = new Resource("log"); Resource db = new Resource("db")) {
            System.out.println("work");
        }  // 依建立的相反順序呼叫 close()
        System.out.println("done");
    }
}`,
        JavaScript: code`function open(name) {
    console.log("open " + name);
    return { close: () => console.log("close " + name) };
}

const log = open("log");
try {
    const db = open("db");
    try {
        console.log("work");
    } finally {
        db.close();  // 內層先關
    }
} finally {
    log.close();
}
console.log("done");`,
      },
    },
    {
      id: 'shared-count', title: '數一數有幾個擁有者', description: 'shared_ptr 複製時計數加 1、離開範圍時減 1，歸零的當下立刻釋放。Java、Python、JavaScript 用 Counted 類別模擬同樣的規則。',
      output: 'count = 1\ncount = 2\ncount = 1\nfree buffer\nend',
      code: {
        'C++': code`#include <iostream>
#include <memory>

struct Buffer {
    ~Buffer() { std::cout << "free buffer\n"; }
};

int main() {
    auto a = std::make_shared<Buffer>();
    std::cout << "count = " << a.use_count() << "\n";
    {
        auto b = a;  // 複製：多一個擁有者
        std::cout << "count = " << a.use_count() << "\n";
    }  // b 離開範圍：少一個擁有者
    std::cout << "count = " << a.use_count() << "\n";
    a.reset();  // 最後一個擁有者放手：立刻釋放
    std::cout << "end\n";
    return 0;
}`,
        Python: code`class Counted:  # 模擬 shared_ptr 的控制區塊：記錄有幾個擁有者
    def __init__(self, name):
        self.name, self.count = name, 1

    def retain(self):  # 多一個擁有者（複製 shared_ptr）
        self.count += 1

    def release(self):  # 少一個擁有者；最後一個放手時立刻釋放
        self.count -= 1
        if self.count == 0:
            print("free", self.name)


buffer = Counted("buffer")
print("count =", buffer.count)
buffer.retain()  # b = a
print("count =", buffer.count)
buffer.release()  # b 離開範圍
print("count =", buffer.count)
buffer.release()  # a.reset()
print("end")`,
        Java: code`public class Main {
    // 模擬 shared_ptr 的控制區塊：記錄有幾個擁有者
    static class Counted {
        private final String name;
        int count = 1;

        Counted(String name) { this.name = name; }

        void retain() { count++; }  // 多一個擁有者（複製 shared_ptr）

        void release() {  // 少一個擁有者；最後一個放手時立刻釋放
            if (--count == 0) System.out.println("free " + name);
        }
    }

    public static void main(String[] args) {
        Counted buffer = new Counted("buffer");
        System.out.println("count = " + buffer.count);
        buffer.retain();  // b = a
        System.out.println("count = " + buffer.count);
        buffer.release();  // b 離開範圍
        System.out.println("count = " + buffer.count);
        buffer.release();  // a.reset()
        System.out.println("end");
    }
}`,
        JavaScript: code`class Counted {  // 模擬 shared_ptr 的控制區塊：記錄有幾個擁有者
    constructor(name) {
        this.name = name;
        this.count = 1;
    }
    retain() {  // 多一個擁有者（複製 shared_ptr）
        this.count++;
    }
    release() {  // 少一個擁有者；最後一個放手時立刻釋放
        if (--this.count === 0) console.log("free " + this.name);
    }
}

const buffer = new Counted("buffer");
console.log("count = " + buffer.count);
buffer.retain();  // b = a
console.log("count = " + buffer.count);
buffer.release();  // b 離開範圍
console.log("count = " + buffer.count);
buffer.release();  // a.reset()
console.log("end");`,
      },
    },
    {
      id: 'cycle', title: '循環參考讓計數停在 1', description: 'A、B 用強參考互相指向，範圍結束後計數仍是 1，沒有被釋放；C、D 把回頭的參考改成弱參考，就依序被釋放。C++ 是真正的 shared_ptr 與 weak_ptr，其他三種語言模擬同樣的計數規則。',
      output: 'strong: A=2 B=2\nafter scope: A=1 B=1\nweak: C=1 D=2\nfree C\nfree D',
      code: {
        'C++': code`#include <iostream>
#include <memory>
#include <string>

struct Node {
    std::string name;
    std::shared_ptr<Node> next;  // 強參考：計入 use_count
    std::weak_ptr<Node> back;    // 弱參考：不計入
    explicit Node(std::string n) : name(std::move(n)) {}
    ~Node() { std::cout << "free " << name << "\n"; }
};

int main() {
    std::weak_ptr<Node> wa, wb;  // 只觀察，不影響計數
    {
        auto a = std::make_shared<Node>("A"), b = std::make_shared<Node>("B");
        a->next = b;
        b->next = a;  // 強參考形成循環
        wa = a;
        wb = b;
        std::cout << "strong: A=" << a.use_count() << " B=" << b.use_count() << "\n";
    }  // a、b 消失，但 A、B 互相擁有：解構子沒有執行
    std::cout << "after scope: A=" << wa.use_count() << " B=" << wb.use_count() << "\n";
    {
        auto c = std::make_shared<Node>("C"), d = std::make_shared<Node>("D");
        c->next = d;
        d->back = c;  // 回頭的參考改用 weak_ptr
        std::cout << "weak: C=" << c.use_count() << " D=" << d.use_count() << "\n";
    }
    return 0;
}`,
        Python: code`class Obj:  # count：模擬的強參考數目
    def __init__(self, name):
        self.name, self.count, self.next, self.back = name, 1, None, None

    def link(self, other):  # 強參考：對方的計數 +1
        self.next = other
        other.count += 1

    def release(self):  # 少一個強參考；歸零就釋放，並放開它指向的物件
        self.count -= 1
        if self.count == 0:
            print("free", self.name)
            if self.next:
                self.next.release()


a, b = Obj("A"), Obj("B")
a.link(b)
b.link(a)  # 強參考形成循環
print(f"strong: A={a.count} B={b.count}")
b.release()
a.release()  # 兩個擁有者都放手了
print(f"after scope: A={a.count} B={b.count}")
c, d = Obj("C"), Obj("D")
c.link(d)
d.back = c  # 弱參考：記住對方，不增加計數
print(f"weak: C={c.count} D={d.count}")
d.release()
c.release()`,
        Java: code`public class Main {
    static class Obj {  // count：模擬的強參考數目
        final String name;
        int count = 1;
        Obj next, back;  // next 是強參考，back 是弱參考

        Obj(String name) { this.name = name; }

        void link(Obj other) { next = other; other.count++; }

        void release() {  // 少一個強參考；歸零就釋放，並放開它指向的物件
            if (--count > 0) return;
            System.out.println("free " + name);
            if (next != null) next.release();
        }
    }

    public static void main(String[] args) {
        Obj a = new Obj("A"), b = new Obj("B");
        a.link(b);
        b.link(a);  // 強參考形成循環
        System.out.println("strong: A=" + a.count + " B=" + b.count);
        b.release();
        a.release();  // 兩個擁有者都放手了
        System.out.println("after scope: A=" + a.count + " B=" + b.count);
        Obj c = new Obj("C"), d = new Obj("D");
        c.link(d);
        d.back = c;  // 弱參考：記住對方，不增加計數
        System.out.println("weak: C=" + c.count + " D=" + d.count);
        d.release();
        c.release();
    }
}`,
        JavaScript: code`class Obj {  // count：模擬的強參考數目
    constructor(name) {
        Object.assign(this, { name, count: 1, next: null, back: null });
    }
    link(other) {  // 強參考：對方的計數 +1
        this.next = other;
        other.count++;
    }
    release() {  // 少一個強參考；歸零就釋放，並放開它指向的物件
        if (--this.count > 0) return;
        console.log("free " + this.name);
        if (this.next) this.next.release();
    }
}

const a = new Obj("A"), b = new Obj("B");
a.link(b);
b.link(a);  // 強參考形成循環
console.log("strong: A=" + a.count + " B=" + b.count);
b.release();
a.release();  // 兩個擁有者都放手了
console.log("after scope: A=" + a.count + " B=" + b.count);
const c = new Obj("C"), d = new Obj("D");
c.link(d);
d.back = c;  // 弱參考：記住對方，不增加計數
console.log("weak: C=" + c.count + " D=" + d.count);
d.release();
c.release();`,
      },
    },
    {
      id: 'mark-sweep', title: '模擬一次 mark-and-sweep', description: '物件圖 A 到 G，根集合是 A 與 G。標記階段從根遞迴走訪並印出標記順序，清除階段依堆積順序列出沒被標記的物件。',
      output: 'mark A\nmark B\nmark C\nmark G\nswept: D E F',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

const std::vector<std::string> names = {"A", "B", "C", "D", "E", "F", "G"};
const std::vector<std::vector<int>> refs = {{1}, {2}, {0}, {2}, {5}, {4}, {1}};  // refs[v]：v 參考的物件
std::vector<bool> marked(names.size(), false);

void mark(int v) {
    if (marked[v]) return;  // 已標記：循環在這裡停下
    marked[v] = true;
    std::cout << "mark " << names[v] << "\n";
    for (int child : refs[v]) mark(child);
}

int main() {
    for (int root : {0, 6}) mark(root);  // 根集合：A、G
    std::cout << "swept:";
    for (std::size_t v = 0; v < names.size(); ++v) {
        if (!marked[v]) std::cout << " " << names[v];
    }
    std::cout << "\n";
    return 0;
}`,
        Python: MARK_SWEEP_PY,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static final String[] NAMES = {"A", "B", "C", "D", "E", "F", "G"};
    static final int[][] REFS = {{1}, {2}, {0}, {2}, {5}, {4}, {1}};  // REFS[v]：v 參考的物件
    static final boolean[] marked = new boolean[NAMES.length];

    static void mark(int v) {
        if (marked[v]) return;  // 已標記：循環在這裡停下
        marked[v] = true;
        System.out.println("mark " + NAMES[v]);
        for (int child : REFS[v]) mark(child);
    }

    public static void main(String[] args) {
        for (int root : new int[] {0, 6}) mark(root);  // 根集合：A、G
        List<String> swept = new ArrayList<>();
        for (int v = 0; v < NAMES.length; v++) {
            if (!marked[v]) swept.add(NAMES[v]);
        }
        System.out.println("swept: " + String.join(" ", swept));
    }
}`,
        JavaScript: code`const heap = new Map([
    ["A", ["B"]], ["B", ["C"]], ["C", ["A"]], ["D", ["C"]],
    ["E", ["F"]], ["F", ["E"]], ["G", ["B"]],
]);
const roots = ["A", "G"];  // 根集合
const marked = new Set();

function mark(name) {
    if (marked.has(name)) return;  // 已標記：循環在這裡停下
    marked.add(name);
    console.log("mark " + name);
    for (const child of heap.get(name)) mark(child);
}

for (const root of roots) mark(root);
const swept = [...heap.keys()].filter(name => !marked.has(name));
console.log("swept: " + swept.join(" "));`,
      },
    },
  ],
  quiz: [
    {
      id: 'q1', prompt: '這段 C++ 程式會印出什麼？（每個 T 在解構時印出自己的字元）',
      code: { language: 'C++', text: 'struct T {\n    char c;\n    ~T() { std::cout << c; }\n};\n\nint main() {\n    T a{\'a\'};\n    {\n        T b{\'b\'};\n        T c{\'c\'};\n    }\n    T d{\'d\'};\n    std::cout << "|";\n}' },
      options: ['cb|da', 'bc|ad', 'cb|ad', '|dcba'],
      answer: 0, explanation: '區域物件在離開自己的範圍時解構，而且依建立的相反順序。內層範圍在 `}` 結束，c 比 b 晚建立，所以先印 c 再印 b；接著建立 d、印出 |；main 結束時 d 比 a 晚建立，先印 d 再印 a，合起來是 cb|da。bc 與 ad 是以為依建立順序解構；|dcba 是以為所有物件都等到 main 結束才一起解構，忽略了內層範圍。',
    },
    {
      id: 'q2', prompt: '這段 C++ 程式會印出什麼？（`w.expired()` 印成 1 或 0）',
      code: { language: 'C++', text: 'auto p = std::make_shared<int>(5);\nauto q = p;\nstd::weak_ptr<int> w = p;\nstd::cout << p.use_count() << " ";\np.reset();\nstd::cout << q.use_count() << " " << w.expired() << "\\n";' },
      options: ['2 1 0', '3 2 0', '2 0 1', '3 1 1'],
      answer: 0, explanation: 'p 與 q 兩個 `shared_ptr` 共同擁有這個 int，計數是 2；`weak_ptr` 只觀察、不加計數，所以不是 3。`p.reset()` 讓 p 放手，計數變成 1，q 仍擁有物件，物件沒有被釋放，所以 `w.expired()` 是 false，印出 0。選 3 開頭的是把 weak_ptr 也算進去；選「0 1」是以為 reset 會釋放物件，但 reset 只是讓 p 這一個擁有者離開。',
    },
    {
      id: 'q3', prompt: '編譯下面的 C++17 程式會發生什麼事？',
      code: { language: 'C++', text: 'auto a = std::make_unique<int>(1);\nauto b = a;\nstd::cout << *b << "\\n";' },
      options: ['編譯錯誤：unique_ptr 不能複製，要寫 auto b = std::move(a);', '印出 1，a 與 b 共同擁有同一個 int', '印出 1，b 得到一個新複製的 int', '可以編譯，但結束時同一塊記憶體被釋放兩次'],
      answer: 0, explanation: '`unique_ptr` 表示唯一的擁有者，它的複製建構子被刪除，所以 `auto b = a;` 無法編譯。要轉移擁有權就寫 `std::move(a)`，之後 a 變成空指標。共同擁有是 `shared_ptr` 的行為；智慧指標不會深複製它指向的物件；正因為禁止複製，才不會出現兩個擁有者各自釋放一次的 double free。',
    },
    {
      id: 'q4', prompt: '在 CPython 中執行下面的程式。`del a, b` 執行完的那一刻，兩個 Node 物件的狀況是？',
      code: { language: 'Python', text: 'class Node:\n    def __init__(self):\n        self.other = None\n\na, b = Node(), Node()\na.other, b.other = b, a\ndel a, b' },
      options: ['立刻被釋放：已經沒有任何變數指向它們', '還沒被釋放：彼此的參考讓計數停在 1，要等循環偵測的收集器之後找出它們', '永遠不會被釋放：Python 只有參考計數', '`del` 丟出例外：物件還被別的物件參考'],
      answer: 1, explanation: '`del` 只刪除變數，兩個物件的計數各減 1，但 a.other 與 b.other 仍互相參考，計數都停在 1，參考計數無法回收它們。CPython 另有循環偵測的收集器（`gc` 模組），之後某次執行時會發現這一群物件從外面走不到而回收。所以不是立刻釋放，也不是永遠不釋放；`del` 只是解除名稱的綁定，不會因為物件還被參考就丟出例外。',
    },
    {
      id: 'q5', prompt: '一個堆積有物件 1 到 5，根集合只有 1。參考是 1 → 2、3 → 1、4 → 5、5 → 4、2 → 2。mark-and-sweep 會回收哪些物件？',
      options: ['3、4、5', '4、5', '3', '沒有物件會被回收'],
      answer: 0, explanation: '從根 1 出發只走得到 2（2 → 2 是自己參考自己，不會多走到別的物件），所以存活的是 1 與 2，其餘 3、4、5 被回收。選「4、5」是以為 3 參考了存活的 1 就會存活，但參考有方向，沒有物件指向 3；選「3」是用參考計數的想法，以為 4、5 互相參考就不會被回收；追蹤式 GC 只看可達性，循環不影響結果。',
    },
    {
      id: 'q6', prompt: '下面的 Java 服務長時間執行後，記憶體用量一直增加。哪一個說明正確？',
      code: { language: 'Java', text: 'class Handler {\n    private static final List<byte[]> history = new ArrayList<>();\n\n    static void handle(byte[] request) {\n        history.add(request);  // 留下紀錄，之後從來沒有讀取或刪除\n        process(request);\n    }\n}' },
      options: ['history 是靜態欄位，屬於根集合；加進去的陣列一直可達，GC 不會回收它們', 'Java 有 GC，不可能洩漏；記憶體增加只是 GC 還沒執行，呼叫 System.gc() 就會降回來', 'byte[] 是基本型別的陣列，放在堆疊上，所以 GC 管不到', 'GC 會回收很久沒被讀取的物件，只要等夠久記憶體就會下降'],
      answer: 0, explanation: '追蹤式 GC 只回收走不到的物件。靜態欄位 history 從根集合直接可達，清單裡的每個陣列也就一直可達，即使程式再也不讀它們。這是 GC 語言最常見的洩漏，修正是設上限或移除不用的項目。呼叫 `System.gc()` 也回收不了可達的物件；`byte[]` 是物件，放在堆積上；GC 不看物件多久沒被使用，只看可達性。',
    },
    {
      id: 'q7', prompt: '世代式 GC 的 minor GC 通常比 full GC 停頓短，主要原因是什麼？',
      options: ['大多數物件很快就不再使用，minor GC 只處理年輕代，需要檢查與搬動的存活物件很少', '年輕代的物件都比較小，掃描起來比較快', 'minor GC 和程式同時執行，完全不需要暫停程式', '老年代的物件永遠不會變成垃圾，所以平常不必回收'],
      answer: 0, explanation: '弱世代假說指出大多數物件死得早，所以年輕代收集時，存活的物件只佔一小部分，而 minor GC 的工作量主要和存活物件成正比，又不必走訪老年代（老物件指向年輕物件的參考由寫入屏障記在記憶集）。物件大小不是關鍵；HotSpot 與 V8 的 minor GC 仍會短暫停止程式；老物件也會變成垃圾，所以仍需要 major GC。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '標記與清除：哪些物件會被回收',
      statement: '一個小型堆積有 n 個物件，編號 1 到 n。程式的根集合（區域變數、全域變數）直接參考其中 r 個物件；另有 m 條參考，「u v」表示物件 u 的某個欄位參考物件 v。參考有方向：u 參考 v，不代表 v 參考 u。請模擬 mark-and-sweep：從根集合出發，沿著參考標記所有可達的物件，再回收所有沒有標記的物件，輸出存活與被回收的物件編號。根或參考中出現不存在的物件編號時，表示堆積資料已損壞：不做回收，只輸出錯誤訊息。',
      inputFormat: '第一行是三個整數 n、m、r。第二行是 r 個根物件的編號（r = 0 時是空行）。接下來 m 行，每行兩個整數 u v，表示 u 參考 v。',
      outputFormat: '正常時輸出兩行：`marked: ` 後接所有可達物件的編號，`freed: ` 後接所有被回收物件的編號，都由小到大、以一個空白分隔，沒有任何物件時寫 `none`。若根或參考中有不在 1..n 的編號，只輸出一行 `error: object X does not exist`，X 是依輸入順序（先所有根，再逐條參考的 u、v）遇到的第一個不合法編號。',
      constraints: ['1 ≤ n ≤ 1000', '0 ≤ m ≤ 5000', '0 ≤ r ≤ n', '根可能重複；同一條參考可能出現多次；物件可以參考自己', '輸入中的編號都是整數，但不一定在 1..n 之間'],
      samples: [{ kind: 'normal', input: '6 6 1\n1\n1 2\n2 3\n3 1\n4 3\n5 6\n6 5', output: 'marked: 1 2 3\nfreed: 4 5 6', note: '1 → 2 → 3 → 1 是可達的循環；4 參考 3 但沒人參考 4；5、6 互相參考卻走不到' }],
      tests: [
        { kind: 'normal', input: '6 6 1\n1\n1 2\n2 3\n3 1\n4 3\n5 6\n6 5', output: 'marked: 1 2 3\nfreed: 4 5 6', note: '可達的循環存活，不可達的循環被回收' },
        { kind: 'normal', input: '7 6 2\n2 5\n2 4\n5 4\n4 4\n4 7\n1 2\n3 6', output: 'marked: 2 4 5 7\nfreed: 1 3 6', note: '兩個根共用物件 4；4 參考自己；1 參考存活的 2 但自己不可達' },
        { kind: 'edge', input: '3 2 0\n\n1 2\n2 3', output: 'marked: none\nfreed: 1 2 3', note: '根集合是空的：所有物件都被回收' },
        { kind: 'edge', input: '1 0 1\n1', output: 'marked: 1\nfreed: none', note: '最小的堆積，唯一的物件就是根' },
        { kind: 'edge', input: '1 1 0\n\n1 1', output: 'marked: none\nfreed: 1', note: '自己參考自己、計數不為 0 的物件，沒有根就照樣被回收' },
        { kind: 'edge', input: '4 3 3\n2 2 2\n2 3\n2 3\n3 2', output: 'marked: 2 3\nfreed: 1 4', note: '重複的根與重複的參考不能讓物件被標記或輸出兩次' },
        { kind: 'edge', input: chainInput, output: chainOutput, note: '1 → 2 → … → 1000 的長鏈：遞迴版的標記在 Python 會超過預設的遞迴深度' },
        { kind: 'error', input: '3 2 1\n1\n1 2\n2 9', output: 'error: object 9 does not exist', note: '參考指向不存在的物件 9' },
        { kind: 'error', input: '2 0 1\n0', output: 'error: object 0 does not exist', note: '根是 0：編號從 1 開始' },
        { kind: 'error', input: '5 4 1\n3\n3 1\n1 5\n-2 4\n2 4', output: 'error: object -2 does not exist', note: '前面的參考都合法，第三條出現負數編號；不輸出部分結果' },
      ],
      hints: [
        '先把參考存成鄰接串列：`refs[u]` 是 u 參考的物件。只加入 u → v，不要加反方向。',
        '標記就是從多個起點同時出發的 DFS 或 BFS：物件第一次走到時標記，已標記的就跳過，循環才不會讓它停不下來。',
        '用明確的堆疊（或佇列）代替遞迴：一條 1000 個物件的鏈，遞迴版在 Python 會超過預設約 1000 層的限制而丟出 `RecursionError`。',
        '先檢查所有編號都在 1..n 之間，再開始標記，錯誤時才不會輸出一半的結果。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n, m, r;
    std::cin >> n >> m >> r;
    std::vector<int> ids(r + 2 * m);  // 根集合，接著每條參考的 u v
    for (int& x : ids) std::cin >> x;
    for (int x : ids) {
        if (x < 1 || x > n) {
            std::cout << "error: object " << x << " does not exist\n";
            return 0;
        }
    }
    std::vector<std::vector<int>> refs(n + 1);
    for (int i = r; i < r + 2 * m; i += 2) refs[ids[i]].push_back(ids[i + 1]);
    std::vector<bool> marked(n + 1, false);
    std::vector<int> stack(ids.begin(), ids.begin() + r);  // 標記階段：從根集合出發
    while (!stack.empty()) {
        int v = stack.back();
        stack.pop_back();
        if (marked[v]) continue;
        marked[v] = true;
        for (int child : refs[v]) stack.push_back(child);
    }
    for (bool live : {true, false}) {  // 清除階段：沒被標記的就是垃圾
        std::cout << (live ? "marked:" : "freed:");
        bool any = false;
        for (int v = 1; v <= n; ++v) {
            if (marked[v] == live) {
                std::cout << " " << v;
                any = true;
            }
        }
        std::cout << (any ? "" : " none") << "\n";
    }
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    n, m, r = int(data[0]), int(data[1]), int(data[2])
    ids = [int(x) for x in data[3:3 + r + 2 * m]]  # 根集合，接著每條參考的 u v
    for x in ids:
        if not 1 <= x <= n:
            print(f"error: object {x} does not exist")
            return
    refs = [[] for _ in range(n + 1)]
    for i in range(r, r + 2 * m, 2):
        refs[ids[i]].append(ids[i + 1])
    marked = [False] * (n + 1)
    stack = ids[:r]  # 標記階段：從根集合出發，用明確的堆疊代替遞迴
    while stack:
        v = stack.pop()
        if not marked[v]:
            marked[v] = True
            stack.extend(refs[v])
    live = [str(v) for v in range(1, n + 1) if marked[v]]
    dead = [str(v) for v in range(1, n + 1) if not marked[v]]  # 清除階段：沒被標記的就是垃圾
    print("marked:", " ".join(live) or "none")
    print("freed:", " ".join(dead) or "none")


main()`,
        Java: code`import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt(), m = in.nextInt(), r = in.nextInt();
        int[] ids = new int[r + 2 * m];  // 根集合，接著每條參考的 u v
        for (int i = 0; i < ids.length; i++) ids[i] = in.nextInt();
        for (int x : ids) {
            if (x < 1 || x > n) {
                System.out.println("error: object " + x + " does not exist");
                return;
            }
        }
        List<List<Integer>> refs = new ArrayList<>();
        for (int v = 0; v <= n; v++) refs.add(new ArrayList<>());
        for (int i = r; i < ids.length; i += 2) refs.get(ids[i]).add(ids[i + 1]);
        boolean[] marked = new boolean[n + 1];
        Deque<Integer> stack = new ArrayDeque<>();
        for (int i = 0; i < r; i++) stack.push(ids[i]);  // 標記階段：從根集合出發
        while (!stack.isEmpty()) {
            int v = stack.pop();
            if (marked[v]) continue;
            marked[v] = true;
            for (int child : refs.get(v)) stack.push(child);
        }
        StringBuilder live = new StringBuilder(), dead = new StringBuilder();
        for (int v = 1; v <= n; v++) (marked[v] ? live : dead).append(" ").append(v);  // 清除階段
        System.out.println("marked:" + (live.length() > 0 ? live : " none"));
        System.out.println("freed:" + (dead.length() > 0 ? dead : " none"));
    }
}`,
        JavaScript: code`const tokens = require("fs").readFileSync(0, "utf8").split(/\s+/).filter(Boolean).map(Number);
const [n, m, r] = tokens;
const ids = tokens.slice(3, 3 + r + 2 * m);  // 根集合，接著每條參考的 u v
const bad = ids.find(x => !(x >= 1 && x <= n));
if (bad !== undefined) {
    console.log("error: object " + bad + " does not exist");
} else {
    const refs = Array.from({ length: n + 1 }, () => []);
    for (let i = r; i < r + 2 * m; i += 2) refs[ids[i]].push(ids[i + 1]);
    const marked = new Array(n + 1).fill(false);
    const stack = ids.slice(0, r);  // 標記階段：從根集合出發，用明確的堆疊代替遞迴
    while (stack.length) {
        const v = stack.pop();
        if (marked[v]) continue;
        marked[v] = true;
        stack.push(...refs[v]);
    }
    const all = Array.from({ length: n }, (_, i) => i + 1);
    const live = all.filter(v => marked[v]), dead = all.filter(v => !marked[v]);  // 清除階段
    console.log("marked: " + (live.join(" ") || "none"));
    console.log("freed: " + (dead.join(" ") || "none"));
}`,
      },
      judge: 'none',
    },
  ],
  visualization: { kind: 'graph-traversal', title: 'mark-and-sweep：從根集合 A、G 標記可達的物件，再清除其餘', language: 'Python', code: MARK_SWEEP_PY, steps: markSweepSteps() },
};
