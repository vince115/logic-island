import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF10 知識表示 (python-code: Python only, standard library). Every example and the reference solution run in the
 * curriculum code tests; their outputs and the exercise's expected outputs were produced by running the programs.
 *
 * The visualization runs TRACE_CODE: a small campus knowledge graph (10 triples, 9 entities) and a breadth-first search
 * from the course ai01 that follows only taught_by, held_in, office_in and located_in edges, then keeps the reached
 * entities that are instance_of bldg. bfsSteps() below repeats that program's loop on the same triples in the same
 * order (the out index keeps the triples' order), so every queue, mark and table row comes from actually running it;
 * the last step's output is checked against TRACE_OUTPUT, which the lesson test compares with Python's real output.
 */
const TRIPLES: [string, string, string][] = [
  ['ai01', 'taught_by', 'lin'], ['ai01', 'taught_by', 'chen'], ['ai01', 'held_in', 'r101'], ['lin', 'office_in', 'r305'],
  ['chen', 'office_in', 'r210'], ['r101', 'located_in', 'eng'], ['r305', 'located_in', 'sci'], ['r210', 'located_in', 'eng'],
  ['sci', 'instance_of', 'bldg'], ['eng', 'instance_of', 'bldg'],
];
/** Drawn on a circle in this order, so that most edges join neighbours. */
const GRAPH_NODES = ['ai01', 'lin', 'r305', 'sci', 'bldg', 'eng', 'r101', 'r210', 'chen'];
const FOLLOW = new Set(['taught_by', 'held_in', 'office_in', 'located_in']);
const TRACE_OUTPUT = "['eng', 'sci'] 8";

const TRACE_CODE = code`from collections import deque
triples = [('ai01', 'taught_by', 'lin'), ('ai01', 'taught_by', 'chen'),
           ('ai01', 'held_in', 'r101'), ('lin', 'office_in', 'r305'),
           ('chen', 'office_in', 'r210'), ('r101', 'located_in', 'eng'),
           ('r305', 'located_in', 'sci'), ('r210', 'located_in', 'eng'),
           ('sci', 'instance_of', 'bldg'), ('eng', 'instance_of', 'bldg')]
out = {}
for s, p, o in triples:
    out.setdefault(s, []).append((p, o))
follow = {'taught_by', 'held_in', 'office_in', 'located_in'}
seen, queue = {'ai01'}, deque(['ai01'])
while queue:
    u = queue.popleft()
    for p, o in out.get(u, []):
        if p not in follow: continue  # 述詞不在要走的集合
        if o in seen: continue  # 已經到過
        seen.add(o)
        queue.append(o)
answer = sorted(x for x in seen if (x, 'instance_of', 'bldg') in triples)
print(answer, len(seen))`;

function bfsSteps(): TraceStep[] {
  const status = TRIPLES.map(() => '');
  const seen = new Set<string>(), done = new Set<string>();
  let queue: string[] = [];
  const steps: TraceStep[] = [];
  const pyList = (xs: string[]) => `[${xs.map(x => `'${x}'`).join(', ')}]`;
  const snap = (line: number, note: string, focus: { node: string; kind: Mark }[], edge: { i: number; kind: Mark } | undefined, vars: Record<string, string>, output?: string) => {
    const nodeMarks = GRAPH_NODES.filter(n => !focus.some(f => f.node === n)).flatMap(n => done.has(n) ? [{ node: n, kind: 'visited' as Mark }]
      : seen.has(n) ? [{ node: n, kind: 'pending' as Mark }] : []);
    const edgeMarks = TRIPLES.flatMap((_, i) => edge?.i === i ? [{ edge: i, kind: edge.kind }] : status[i] === '沿著走' ? [{ edge: i, kind: 'visited' as Mark }] : []);
    steps.push({
      line, note, vars: line < 11 ? vars : { ...vars, 'sorted(seen)': pyList([...seen].sort()), queue: `deque(${pyList(queue)})` },
      graph: { name: '校園知識圖譜（邊的述詞見下方三元組表）', nodes: GRAPH_NODES, edges: TRIPLES.map(([from, , to]) => ({ from, to })), directed: true,
        marks: [...focus, ...nodeMarks, ...edgeMarks], show: ['list'] },
      containers: [{ name: 'queue（左邊先取出）', kind: 'queue', items: [...queue] }],
      table: { name: '三元組 (主詞, 述詞, 受詞)', head: ['#', '主詞 s', '述詞 p', '受詞 o', '處理結果'],
        rows: TRIPLES.map(([s, p, o], i) => [String(i), s, p, o, status[i] || '—']),
        marks: edge ? [{ row: edge.i, kind: edge.kind }] : [] },
      ...(output ? { output } : {}),
    });
  };
  snap(9, '先把 10 個三元組依主詞建成索引 out：out[s] 是 s 往外的 (述詞, 受詞) 串列，順序和三元組串列相同。圖上每條有向邊就是一個三元組，邊上沒有寫字，述詞要看下方的表。查詢只需要「從 u 往外的邊」，有了索引就不必每次掃過全部三元組。',
    [], undefined, { 'len(out)': String(new Set(TRIPLES.map(([s]) => s)).size) });
  seen.add('ai01'); queue = ['ai01'];
  snap(11, '問題：「ai01 這門課會用到哪些建築？」也就是上課教室所在的建築，以及授課老師辦公室所在的建築。從 ai01 出發做 BFS，只沿 follow 裡的 4 種述詞走；seen 記錄到過的節點，起點一開始就放進去。',
    [{ node: 'ai01', kind: 'current' }], undefined, {});
  const out = new Map<string, { p: string; o: string; i: number }[]>();
  TRIPLES.forEach(([s, p, o], i) => out.set(s, [...(out.get(s) ?? []), { p, o, i }]));
  while (queue.length) {
    const u = queue.shift()!;
    const edges = out.get(u) ?? [];
    snap(13, `從 queue 左邊取出 ${u}。out[${u}] 有 ${edges.length} 條往外的邊${edges.length ? `：${edges.map(e => `(${e.p}, ${e.o})`).join('、')}` : ''}。`,
      [{ node: u, kind: 'current' }], undefined, { u });
    for (const { p, o, i } of edges) {
      if (!FOLLOW.has(p)) {
        status[i] = '略過：述詞不在 follow';
        snap(15, `三元組 #${i} (${u}, ${p}, ${o})：${p} 不在 follow 裡，略過。${p === 'instance_of' ? `${u} 是一棟 bldg，這是「它是什麼」的知識，不是位置關係；BFS 不沿它走，最後一行才用它篩選答案。` : ''}`,
          [{ node: u, kind: 'current' }, { node: o, kind: 'read' }], { i, kind: 'read' }, { u, p, o });
        continue;
      }
      if (seen.has(o)) {
        status[i] = '略過：o 已在 seen';
        snap(16, `三元組 #${i} (${u}, ${p}, ${o})：述詞可以走，但 ${o} 已經在 seen 裡（之前經由別的路到過），略過。沒有這個檢查，${o} 會進 queue 兩次；圖裡若有環，BFS 就永遠停不下來。`,
          [{ node: u, kind: 'current' }, { node: o, kind: 'read' }], { i, kind: 'read' }, { u, p, o });
        continue;
      }
      seen.add(o); queue.push(o); status[i] = '沿著走';
      snap(18, `三元組 #${i} (${u}, ${p}, ${o})：${p} 在 follow 裡，${o} 第一次到，放進 seen 並排到 queue 尾端。`,
        [{ node: u, kind: 'current' }, { node: o, kind: 'write' }], { i, kind: 'write' }, { u, p, o });
    }
    done.add(u);
  }
  const answer = [...seen].filter(x => TRIPLES.some(([s, p, o]) => s === x && p === 'instance_of' && o === 'bldg')).sort();
  const output = `${pyList(answer)} ${seen.size}`;
  if (output !== TRACE_OUTPUT) throw new Error(`AIF10: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  for (const x of answer) status[TRIPLES.findIndex(([s, p]) => s === x && p === 'instance_of')] = '篩選：是 bldg';
  steps.push({ ...steps.at(-1)!, line: 19,
    note: `queue 空了，BFS 結束：seen 有 ${seen.size} 個節點，bldg 不在裡面，因為 instance_of 從來沒有走。接著在 seen 裡篩選「有 (x, instance_of, bldg) 這個三元組」的 x，得到 ${answer.join('、')}。eng 雖然有兩條路可到（教室 r101 與 chen 的辦公室 r210），只出現一次。`,
    vars: { answer: pyList(answer), 'len(seen)': String(seen.size) },
    graph: { ...steps.at(-1)!.graph!, marks: [...answer.map(n => ({ node: n, kind: 'found' as Mark })), ...[...seen].filter(n => !answer.includes(n)).map(n => ({ node: n, kind: 'visited' as Mark })),
      ...TRIPLES.flatMap((_, i) => status[i] === '沿著走' ? [{ edge: i, kind: 'visited' as Mark }] : status[i] === '篩選：是 bldg' ? [{ edge: i, kind: 'found' as Mark }] : [])] },
    containers: [{ name: 'queue（左邊先取出）', kind: 'queue', items: [] }],
    table: { name: '三元組 (主詞, 述詞, 受詞)', head: ['#', '主詞 s', '述詞 p', '受詞 o', '處理結果'], rows: TRIPLES.map(([s, p, o], i) => [String(i), s, p, o, status[i] || '—']),
      marks: answer.map(x => ({ row: TRIPLES.findIndex(([s, p]) => s === x && p === 'instance_of'), kind: 'found' as Mark })) } });
  steps.push({ ...steps.at(-1)!, line: 20, note: `印出 \`${output}\`：ai01 會用到 eng 與 sci 兩棟建築，BFS 一共到過 8 個節點（含起點）。同一個問題換成 SQL，要把課程、授課、教師、教室、建築幾張表 JOIN 起來；在知識圖譜上，它就是「沿指定的邊走，再篩選類別」。`,
    output });
  return steps;
}

export const AIF10: LessonContent = {
  lessonId: 'AIF10',
  motivation: '智慧代理人要做出好決定，光有感知與搜尋不夠，還要「知道」世界是什麼樣子：企鵝是鳥但不會飛、林老師教 AI 導論、她的辦公室在理學院大樓、理學院大樓在校本部。這些知識要寫成電腦能儲存、查詢、推論的形式，這就是知識表示（knowledge representation）。同一份知識可以寫成規則、語意網路、框架或本體論，各有擅長之處；今天的搜尋引擎、語音助理與推薦系統背後的知識圖譜，則把知識拆成最小的單位：主詞—述詞—受詞三元組。這一課要學會：比較幾種知識表示方式、用三元組建立一個小型校園知識圖譜、用類別階層與繼承處理「預設成立、但有例外」的知識，並寫出查詢回答「這門課老師的辦公室在哪一棟大樓」這種要走好幾步關係的問題；最後和 DB08 的 ER 模型對照，看兩者各自適合什麼。',
  sections: [
    {
      id: 'kr-overview', title: '知識表示：把「知道的事」寫成電腦能用的形式',
      blocks: [
        { type: 'p', text: '前面的代理人課把代理人看成「感知 → 決定 → 行動」的迴圈；以知識為基礎的代理人（knowledge-based agent）在決定之前，會查詢自己的知識庫（knowledge base），必要時從已知推出新的事實。知識表示要回答兩個問題：知識用什麼結構存（表示），以及怎麼從存下來的東西得到答案（推論）。好的表示方式讓常見的問題很好回答，也讓人看得懂、改得動。' },
        { type: 'table', head: ['表示方式', '基本單位', '擅長', '不擅長'], rows: [
          ['規則（rule）', '若 條件 則 結論（產生式規則）', '「看到什麼就做什麼」的程序性知識，例如 MYCIN 這類專家系統', '描述「東西是什麼、彼此有什麼關係」，規則一多很難維護'],
          ['語意網路（semantic network）', '節點是概念，帶標籤的邊是關係', '一眼看出概念之間的關係，沿著邊找相關概念', '邊的意義沒有統一規定，同一個標籤各人用法不同'],
          ['框架（frame）', '一個物件或類別一個框架，裡面是槽（slot）與值', '「典型的教室有 40 個座位」這種預設值與例外', '多個框架之間的複雜關係'],
          ['本體論（ontology）', '類別、實例、屬性，加上明確的定義與限制', '讓不同系統對「教師」「課程」有同一個定義，可以檢查與推論', '建立與維護的成本高'],
          ['知識圖譜（knowledge graph）', '主詞—述詞—受詞三元組', '大量、彼此連結的事實，容易加入新的關係種類', '本身不規定意義，要搭配本體論'],
        ] },
        { type: 'p', text: '這幾種方式不是互相取代的關係，而是看問題的不同角度。語意網路由 Ross Quillian 在 1960 年代提出，用來模擬人怎麼從「金絲雀」聯想到「鳥」再聯想到「會飛」；Marvin Minsky 在 1974 年提出框架，把「看到一間教室就預期有黑板與座位」這種典型情境寫成有預設值的結構。之後 W3C 在 1999 年發布 RDF（Resource Description Framework），把語意網路標準化成三元組，2004 年再發布描述本體論的 OWL；2012 年 Google 推出 Knowledge Graph，讓「知識圖譜」成為業界常用的名稱。' },
        { type: 'callout', tone: 'note', title: '和規則的分工', text: '規則擅長「若…則…」的推論：若某人是教授，則他可以指導研究生。三元組與框架擅長描述事實與結構：lin 是教授、lin 的辦公室在 r305。實務上常兩者並用：知識圖譜存事實，規則或查詢從事實推出新的事實。下一批的命題邏輯與一階邏輯課會把規則的推論講得更嚴格。' },
      ],
    },
    {
      id: 'semantic-frames', title: '語意網路與框架：槽、預設值與需要時才計算',
      blocks: [
        { type: 'p', text: '語意網路把知識畫成圖：節點是概念或個體（金絲雀、鳥、tweety），有向邊帶著關係的名稱（is_a、has_part、color）。它就是 D16 的有向圖，只是每條邊多了一個標籤。好處是直觀：要知道 tweety 會不會飛，就從 tweety 沿 is_a 邊往上走，看哪個節點寫了「會飛」。早期語意網路的問題是邊的意義沒有統一規定，同一個 is_a 有時指「屬於某類」，有時指「是某類的子類」，推論就會出錯，後面會再談。' },
        { type: 'p', text: '框架把一個物件的知識收在一起：框架有名稱，裡面是一組槽（slot），每個槽可以有值，也可以有附加資訊（facet），例如預設值 default、值的型別，或需要時才執行的程序 if_needed（procedural attachment）。類別框架描述「典型」的樣子，實例框架只填和典型不同的槽，其餘沿用預設。這正是人的常識：聽到「一間教室」，就預設它有投影機，除非有人特別說沒有。' },
        { type: 'example', id: 'e-frames' },
        { type: 'p', text: '範例的取值順序是：實例自己的值 → if_needed 程序 → 類別的預設值。r205 沒有填 seats，所以用預設的 40；r310 自己寫了 projector=False，覆寫了預設的 True；free_seats 沒有存在任何地方，每次需要時用 seats − enrolled 算出來，seats 或 enrolled 改變時它自動正確。用 Python 的 dict 表示框架很自然：槽名是鍵，值或 facet 是值。' },
        { type: 'table', head: ['框架的部分', '範例中的寫法', '意義'], rows: [
          ['類別框架', 'classroom', '描述典型的教室，每個槽有 facet'],
          ['實例框架', "r101 = {'is_a': 'classroom', 'seats': 120, ...}", '一間具體的教室，只寫和典型不同的槽'],
          ['default facet', "{'default': 40}", '實例沒有填時使用的值，可以被覆寫'],
          ['if_needed facet', "{'if_needed': lambda room: ...}", '不存值，需要時才計算（程序附加）'],
        ] },
      ],
    },
    {
      id: 'triples', title: '知識圖譜三元組與 RDF',
      blocks: [
        { type: 'p', text: '知識圖譜把每一個事實拆成一個三元組（triple）：(主詞 subject, 述詞 predicate, 受詞 object)，例如 (lin, teaches, ai101)。主詞與受詞是圖的節點，述詞是一條從主詞指向受詞、帶標籤的有向邊。同一對節點之間可以有好幾條不同述詞的邊（lin 教 ai101，也擔任 ai101 的課程負責人），所以知識圖譜是一張有向、邊帶標籤的多重圖。框架的一個槽也可以拆成三元組：(r101, seats, 120)。' },
        { type: 'p', text: '三元組的好處是格式只有一種：要加入新的關係種類（例如 advises），不必改任何結構，直接加入新的三元組。儲存三元組的系統叫三元組儲存庫（triple store）；最基本的查詢是樣式比對（pattern matching）：三個位置各給一個值或留空當萬用字元，找出所有吻合的三元組。下面的範例用 None 當萬用字元，並把結果排序後印出，同一個事實存兩次也只算一次。' },
        { type: 'example', id: 'e-store' },
        { type: 'p', text: 'RDF 是 W3C 的三元組標準：主詞與述詞是 IRI（全域唯一的網址形式名稱，例如 http://example.org/campus#lin），受詞可以是 IRI，也可以是字面值（literal），例如字串或數字 120。用 IRI 命名，不同機構的資料提到同一個 lin 時才不會混淆。常見的文字格式 Turtle 把上面的事實寫成 `ex:lin ex:teaches ex:ai101 .`，查詢語言是 SPARQL，它的查詢就是帶變數的三元組樣式，例如 `?course ex:heldIn ex:r305`。' },
        { type: 'table', head: ['位置', '可以是', '範例'], rows: [
          ['主詞 subject', 'IRI（或空白節點）', 'ex:lin'],
          ['述詞 predicate', 'IRI', 'ex:teaches、rdf:type'],
          ['受詞 object', 'IRI、空白節點或字面值', 'ex:ai101、"林雅文"、120'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把整句話塞進一個節點', text: '把「lin 教 ai101 和 ds201」存成一個節點 "lin teaches ai101 and ds201"，圖上看起來有資料，卻什麼也查不到：問「誰教 ds201」時，電腦不會去拆字串。三元組的原則是一個事實一個三元組：(lin, teaches, ai101) 與 (lin, teaches, ds201) 兩筆。值也要用一致的名稱，r305 和 R305、room305 在圖裡是三個不同的節點。' },
      ],
    },
    {
      id: 'ontology', title: '本體論：類別、實例與屬性',
      blocks: [
        { type: 'p', text: '三元組只規定格式，不規定意義：teaches 的主詞應該是人還是課？本體論（ontology）就是這份「意義的規格」，描述一個領域裡有哪些類別（class，例如 teacher、course、room）、哪些實例（instance 或 individual，例如 lin、ai101）、類別之間的上下關係（professor 是 teacher 的子類別），以及屬性（property）：每個屬性連接哪一類的主詞（定義域 domain）與哪一類的受詞（值域 range）。' },
        { type: 'table', head: ['本體論的元素', '校園的例子', 'RDF／RDFS／OWL 的詞彙'], rows: [
          ['類別', 'teacher、course、room', 'rdfs:Class、owl:Class'],
          ['實例屬於類別', 'lin 是一位 professor', 'rdf:type'],
          ['子類別', 'professor 是一種 teacher', 'rdfs:subClassOf'],
          ['屬性的定義域與值域', 'taught_by：course → teacher', 'rdfs:domain、rdfs:range'],
        ] },
        { type: 'example', id: 'e-ontology' },
        { type: 'p', text: '範例先沿 subclass_of 往上找出一個實例屬於的所有類別（lin 是 professor，所以也是 teacher 與 person），再用每個屬性的定義域與值域檢查事實。(ai101, taught_by, amy) 不符合，因為 amy 是學生；(r305, office_in, chen) 把主詞與受詞寫反了，兩邊都不符合。這就是本體論的價值之一：資料錯了可以被發現。' },
        { type: 'callout', tone: 'note', title: 'RDFS 的 domain 與 range 是推論，不是檢查', text: '範例把定義域與值域當成限制來檢查，這比較接近 W3C 在 2017 年發布的 SHACL 這類驗證語言。在 RDFS 的語意裡，rdfs:range 的意思是「出現在受詞位置的就是這個類別」：讀到 (ai101, taught_by, amy)，RDFS 推論器不會報錯，而是推出 amy 是 teacher。兩種解讀都有用，使用前要先確定是哪一種。' },
      ],
    },
    {
      id: 'inheritance', title: '類別階層與繼承：預設推理與企鵝的例外',
      blocks: [
        { type: 'p', text: '類別階層（class hierarchy）把類別排成樹或有向無環圖：canary 與 penguin 是 bird 的子類別，bird 是 animal 的子類別。繼承（inheritance）讓知識只寫一次：在 bird 寫「flies = yes」、「legs = 2」，每一種鳥、每一隻鳥都自動擁有，不必一隻一隻寫。查詢一個個體的屬性時，從它自己開始沿 instance_of 與 is_a 往上找，第一個有這個屬性的節點給出答案。' },
        { type: 'example', id: 'e-inherit' },
        { type: 'p', text: '企鵝是鳥，卻不會飛。在 penguin 寫上 flies = no，往上找時先遇到 penguin，就不會再看到 bird 的 yes：最具體的知識優先（the most specific wins）。這叫預設推理（default reasoning）：bird 的 flies = yes 是「沒有特別說明時成立」的預設值，不是對每一隻鳥都成立的定律。它是非單調的（non-monotonic）：在一般邏輯裡，知道得越多，能推出的結論只會增加；在預設推理裡，加入「pingu 是企鵝」這個新事實，反而撤回了「pingu 會飛」的結論。' },
        { type: 'table', head: ['查詢', '往上的路徑', '答案', '來源'], rows: [
          ['tweety flies', 'tweety → canary → bird', 'yes', 'bird 的預設值'],
          ['pingu flies', 'pingu → penguin', 'no', 'penguin 覆寫'],
          ['pingu breathes', 'pingu → penguin → bird → animal', 'yes', 'animal'],
          ['pingu color', '一路找到 animal 都沒有', 'unknown', '知識庫沒有這個知識'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：「屬於」與「是子類別」混用同一個 is_a', text: '(pingu, is_a, penguin) 說的是「pingu 這個個體屬於 penguin 類別」，(penguin, is_a, bird) 說的是「penguin 類別是 bird 的子類別」。前者是 instance_of（rdf:type），後者是子類別（rdfs:subClassOf）。只有子類別關係可以一直往上傳；instance_of 不行。若再加上 (penguin, instance_of, species)：「企鵝是一個物種」，把兩者都當成可傳遞的 is_a，就會推出「pingu 是一個物種」這種錯誤結論。正確做法：起點先走 instance_of 一步，之後只走 is_a。' },
        { type: 'p', text: '一個類別可以有多個上層類別（多重繼承），這時可能衝突。經典的例子是 Nixon diamond：Nixon 是貴格會教徒（預設是和平主義者），也是共和黨員（預設不是和平主義者）；兩個上層一樣近，知識庫無法決定該信哪一個。程式不應該默默挑一個，而是把衝突回報出來，本課的練習就這樣做。階層裡若錯誤地出現環（a is_a b、b is_a a），往上找時要記錄到過的類別，否則會永遠繞圈。' },
      ],
    },
    {
      id: 'queries', title: '簡單查詢與多步關係推理',
      blocks: [
        { type: 'p', text: '簡單查詢只看一個三元組樣式：「lin 教哪些課」就是 (lin, teaches, ?)。真實的問題常要串起好幾個關係：「ai101 的老師的辦公室在哪一棟大樓」要先找 (ai101, taught_by, ?t)，再找 (?t, office_in, ?r)，最後 (?r, located_in, ?b)。三個樣式共用變數 ?t、?r，前一步的答案是下一步的主詞，這和 SQL 用外鍵把幾張表 JOIN 起來是同一件事。' },
        { type: 'example', id: 'e-twohop' },
        { type: 'p', text: '每一步的結果都是一個集合，不是一個值：db301 有兩位老師，所以最後得到兩棟建築；ml999 沒有資料，第一步就是空集合，後面也全是空的。反方向的問題（哪些課的老師辦公室在 science）可以把同一個查詢套到每一門課上再篩選；SPARQL 這類查詢語言會自動決定從哪一端開始比對比較快。' },
        { type: 'p', text: '另一種多步問題不固定述詞的順序，只問「沿某幾種關係能不能走到」，例如「r305 是不是在校本部裡」（沿 located_in 走任意多步）、「這門課會用到哪些建築」（沿 taught_by、held_in、office_in、located_in 走）。這就是 A14 的 BFS，只是每條邊要先檢查述詞在不在允許的集合裡。下方的視覺化逐步執行後一個問題：表格是全部的三元組，每一步標出正在看的那一筆，以及它被走過還是被略過、為什麼略過。' },
        { type: 'table', head: ['查詢種類', '例子', '做法'], rows: [
          ['單一樣式', '(lin, teaches, ?)', '掃過或用索引找吻合的三元組'],
          ['固定路徑（多步樣式）', 'taught_by → office_in → located_in', '一步一步把集合往前推，共用變數相當於 JOIN'],
          ['可達性（任意步數）', '沿 located_in 走得到 campus 嗎？', '在允許的述詞上做 BFS，記錄到過的節點'],
          ['繼承查詢', 'pingu 會飛嗎？', '沿 instance_of、is_a 往上，最近的一層說了算'],
        ] },
        { type: 'callout', tone: 'tip', title: '先決定「沿哪些述詞走」', text: '可達性查詢若允許所有述詞，答案常常沒有意義：從 ai01 沿 instance_of 會走到 bldg，再從 bldg 走到其他所有建築，最後「什麼都相關」。視覺化裡 BFS 不走 instance_of，只在最後用它篩選答案。述詞集合就是問題的定義，要明確寫出來。' },
      ],
    },
    {
      id: 'kg-vs-er', title: '知識圖譜與 ER 模型：表達能力的比較',
      blocks: [
        { type: 'p', text: 'DB08 的 ER 模型也描述實體與關係，畫出來也是一張圖：實體是節點，關係是邊。差別在於 ER 模型先設計 schema，再把資料放進固定的表格；知識圖譜先有三元組，schema（本體論）可以之後再補，也可以只描述一部分。兩者能表達的事實大多可以互相轉換：ER 的一列 (課號 ai101, 授課教師 lin, 教室 r305) 拆成兩個三元組 (ai101, taught_by, lin)、(ai101, held_in, r305)；M:N 的關係表的每一列，就是一條邊。' },
        { type: 'table', head: ['面向', '關聯式（ER → 表格）', '知識圖譜（三元組）'], rows: [
          ['加入新的關係種類', '改 schema：新增欄位或關係表', '直接加入新述詞的三元組'],
          ['每個實體的屬性', '同一張表的每一列欄位相同，缺的填 NULL', '各個實體有各自的三元組，沒有就是沒有'],
          ['類別階層與繼承', '要自己設計（每類一張表或單一大表）', '本體論原生支援 subClassOf，可以推論'],
          ['任意步數的關係', '要用遞迴查詢（WITH RECURSIVE）', 'BFS 或 SPARQL 的屬性路徑'],
          ['資料一致性', '主鍵、外鍵、CHECK 由資料庫強制', '要另外用 SHACL 等方式驗證'],
          ['沒有資料代表', '封閉世界：查不到就是不成立', '開放世界：查不到代表不知道'],
        ] },
        { type: 'p', text: '最後一列特別重要。關聯式資料庫採封閉世界假設（closed-world assumption）：選課表裡沒有 amy 選 db301 這一列，就表示她沒選。RDF 與 OWL 採開放世界假設（open-world assumption）：圖裡沒有 (lin, speaks, french)，只代表沒有記錄，不代表 lin 不會說法語，因為知識圖譜通常整合很多來源，永遠不完整。所以本課的練習查不到時回答 none 或 unknown，而不是 no。' },
        { type: 'callout', tone: 'tip', title: '怎麼選', text: '結構固定、交易頻繁、需要嚴格一致性（成績、帳務、選課）時，用關聯式資料庫；關係種類多、常常新增、需要跨來源整合與多步推理（課程地圖、搜尋引擎的實體資訊、推薦）時，用知識圖譜。很多系統兩者並用：交易資料在關聯式資料庫，定期轉成三元組放進知識圖譜供查詢與推論。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-frames', title: '用 dict 表示框架：槽、預設值與 if_needed',
      description: '類別框架 classroom 的每個槽有 default 或 if_needed facet；實例框架只填和典型不同的槽。取值順序：自己的值、需要時計算、預設值。',
      code: { Python: code`# 類別框架：每個槽（slot）有預設值 default，或需要時才計算的 if_needed 程序
classroom = {
    'seats': {'default': 40},
    'projector': {'default': True},
    'enrolled': {'default': 0},
    'free_seats': {'if_needed': lambda room: get(room, 'seats') - get(room, 'enrolled')},
}
# 實例框架：只填和預設不同的槽
r101 = {'is_a': 'classroom', 'seats': 120, 'enrolled': 95}
r205 = {'is_a': 'classroom', 'enrolled': 38}
r310 = {'is_a': 'classroom', 'projector': False}

def get(room, slot):
    if slot in room:
        return room[slot]                       # 1. 實例自己填的值
    facets = classroom[slot]
    if 'if_needed' in facets:
        return facets['if_needed'](room)        # 2. 需要時才計算
    return facets['default']                    # 3. 類別框架的預設值

for name, room in [('r101', r101), ('r205', r205), ('r310', r310)]:
    slots = ['seats', 'projector', 'enrolled', 'free_seats']
    print(name, ' '.join(f'{s}={get(room, s)}' for s in slots))` },
      output: 'r101 seats=120 projector=True enrolled=95 free_seats=25\nr205 seats=40 projector=True enrolled=38 free_seats=2\nr310 seats=40 projector=False enrolled=0 free_seats=40',
    },
    {
      id: 'e-store', title: '三元組儲存庫：None 當萬用字元的樣式查詢',
      description: '三元組存成集合（重複的事實只算一次），match 的三個參數各自可以是值或 None；結果排序後印出，輸出不受雜湊順序影響。',
      code: { Python: code`triples = [
    ('lin', 'teaches', 'ai101'), ('lin', 'teaches', 'ds201'),
    ('chen', 'teaches', 'db301'), ('lin', 'instance_of', 'professor'),
    ('chen', 'instance_of', 'lecturer'), ('ai101', 'held_in', 'r305'),
    ('ds201', 'held_in', 'r101'), ('db301', 'held_in', 'r305'),
    ('lin', 'teaches', 'ai101'),  # 重複的事實
]
store = set(triples)  # 三元組存成集合：同一個事實只算一次

def match(s=None, p=None, o=None):
    """None 是萬用字元：那個位置什麼都可以。"""
    return sorted(t for t in store
                  if (s is None or t[0] == s)
                  and (p is None or t[1] == p)
                  and (o is None or t[2] == o))

print(len(triples), len(store))
print(match(s='lin', p='teaches'))         # lin 教哪些課？
print(match(p='held_in', o='r305'))        # 哪些課在 r305 上？
print(match(s='chen'))                     # 關於 chen 的所有事實
print(match(s='wang'))                     # 沒有資料：空串列
print(sorted({p for _, p, _ in store}))    # 圖裡用到哪些述詞` },
      output: '9 8\n[(\'lin\', \'teaches\', \'ai101\'), (\'lin\', \'teaches\', \'ds201\')]\n[(\'ai101\', \'held_in\', \'r305\'), (\'db301\', \'held_in\', \'r305\')]\n[(\'chen\', \'instance_of\', \'lecturer\'), (\'chen\', \'teaches\', \'db301\')]\n[]\n[\'held_in\', \'instance_of\', \'teaches\']',
    },
    {
      id: 'e-ontology', title: '本體論：類別階層、實例與屬性的定義域、值域',
      description: '沿 subclass_of 找出實例屬於的所有類別，再用每個屬性的 (定義域, 值域) 檢查四個事實。',
      code: { Python: code`# 本體論的三部分：類別階層、實例（屬於哪個類別）、屬性（定義域與值域）
subclass_of = {'professor': 'teacher', 'lecturer': 'teacher',
               'teacher': 'person', 'student': 'person'}
instance_of = {'lin': 'professor', 'chen': 'lecturer', 'amy': 'student',
               'ai101': 'course', 'r305': 'room'}
properties = {'taught_by': ('course', 'teacher'),    # (定義域 domain, 值域 range)
              'enrolled_in': ('student', 'course'),
              'office_in': ('teacher', 'room')}

def classes_of(x):
    """x 屬於的所有類別：直接類別，再沿 subclass_of 往上。"""
    found, c = [], instance_of.get(x)
    while c is not None:
        found.append(c)
        c = subclass_of.get(c)
    return found

def check(s, p, o):
    domain, rng = properties[p]
    problems = []
    if domain not in classes_of(s):
        problems.append(f'{s} 不是 {domain}')
    if rng not in classes_of(o):
        problems.append(f'{o} 不是 {rng}')
    return '符合' if not problems else '違反：' + '、'.join(problems)

print('lin 屬於', classes_of('lin'))
for s, p, o in [('ai101', 'taught_by', 'lin'), ('amy', 'enrolled_in', 'ai101'),
                ('ai101', 'taught_by', 'amy'), ('r305', 'office_in', 'chen')]:
    print(f'({s}, {p}, {o})', check(s, p, o))` },
      output: 'lin 屬於 [\'professor\', \'teacher\', \'person\']\n(ai101, taught_by, lin) 符合\n(amy, enrolled_in, ai101) 符合\n(ai101, taught_by, amy) 違反：amy 不是 teacher\n(r305, office_in, chen) 違反：r305 不是 teacher、chen 不是 room',
    },
    {
      id: 'e-inherit', title: '沿繼承鏈往上查屬性：企鵝覆寫了鳥的預設值',
      description: '每個節點最多一個上層；從個體往上找，第一個有這個屬性的節點給出答案，並印出經過的路徑。',
      code: { Python: code`# 個體 instance_of 類別，類別 is_a 上層類別：每個節點最多一個上層，形成一條鏈
up = {'tweety': 'canary', 'pingu': 'penguin',
      'canary': 'bird', 'penguin': 'bird', 'bird': 'animal'}
facts = {('animal', 'breathes'): 'yes',
         ('bird', 'flies'): 'yes', ('bird', 'legs'): '2',
         ('canary', 'color'): 'yellow',
         ('penguin', 'flies'): 'no'}     # 例外：覆寫 bird 的預設值

def lookup(x, prop):
    """從 x 往上找，第一個有這個屬性的節點說了算（最具體的優先）。"""
    chain, node = [], x
    while node is not None:
        chain.append(node)
        if (node, prop) in facts:
            return facts[(node, prop)], ' -> '.join(chain)
        node = up.get(node)
    return 'unknown', ' -> '.join(chain)

for who in ['tweety', 'pingu']:
    for prop in ['flies', 'legs', 'breathes', 'color']:
        value, chain = lookup(who, prop)
        print(f'{who:6} {prop:8} = {value:7} {chain}')` },
      output: 'tweety flies    = yes     tweety -> canary -> bird\ntweety legs     = 2       tweety -> canary -> bird\ntweety breathes = yes     tweety -> canary -> bird -> animal\ntweety color    = yellow  tweety -> canary\npingu  flies    = no      pingu -> penguin\npingu  legs     = 2       pingu -> penguin -> bird\npingu  breathes = yes     pingu -> penguin -> bird -> animal\npingu  color    = unknown pingu -> penguin -> bird -> animal',
    },
    {
      id: 'e-twohop', title: '多步查詢：課程的老師的辦公室在哪一棟大樓',
      description: '三個三元組樣式以變數相接（相當於 SQL 的 JOIN）：taught_by、office_in、located_in。印出每一組變數的值與不重複的建築，最後反過來問哪些課的老師在 science。',
      code: { Python: code`triples = [
    ('ai101', 'taught_by', 'lin'), ('ds201', 'taught_by', 'lin'),
    ('db301', 'taught_by', 'chen'), ('db301', 'taught_by', 'wang'),
    ('lin', 'office_in', 'r305'), ('chen', 'office_in', 'r210'),
    ('wang', 'office_in', 'r512'), ('r305', 'located_in', 'science'),
    ('r210', 'located_in', 'engineering'), ('r512', 'located_in', 'science'),
]

def objects(s, p):
    return sorted(o for s2, p2, o in triples if s2 == s and p2 == p)

def teacher_buildings(course):
    """?t、?r、?b 是變數：(course taught_by ?t) (?t office_in ?r) (?r located_in ?b)"""
    rows = []
    for t in objects(course, 'taught_by'):
        for r in objects(t, 'office_in'):
            for b in objects(r, 'located_in'):
                rows.append((t, r, b))
    return rows

for course in ['ai101', 'db301', 'ml999']:
    rows = teacher_buildings(course)
    print(course, rows, sorted({b for _, _, b in rows}))

# 反方向：哪些課的老師，辦公室在 science 大樓？
courses = sorted({c for c, p, _ in triples if p == 'taught_by'})
print([c for c in courses if any(b == 'science' for _, _, b in teacher_buildings(c))])` },
      output: 'ai101 [(\'lin\', \'r305\', \'science\')] [\'science\']\ndb301 [(\'chen\', \'r210\', \'engineering\'), (\'wang\', \'r512\', \'science\')] [\'engineering\', \'science\']\nml999 [] []\n[\'ai101\', \'db301\', \'ds201\']',
    },
  ],
  exercises: [
    {
      id: 'x-campus-kg', title: '校園知識圖譜的查詢器：直接查詢、繼承查詢與路徑查詢',
      statement: '讀入一組三元組與一串查詢，逐一回答。每個三元組是 `主詞 述詞 受詞`，名稱不含空白；同一個三元組出現多次只算一次。支援三種查詢：(1) `get S P`：直接查詢，列出所有 (S, P, o) 的 o。(2) `inherit S P`：繼承查詢。從 S 開始一層一層往上找：第 0 層是 S 自己；第 1 層是 S 沿 `instance_of` 或 `is_a` 一步到的節點；之後每一層只沿 `is_a` 再往上一步（個體屬於某類，不代表個體屬於那個類別所屬的類別）。已經到過的節點不再加入（`is_a` 有環也會停）。第一個「有節點擁有屬性 P」的層說了算：那一層所有擁有 P 的節點都是來源，答案是它們所有 P 值的聯集。(3) `path A B P1,P2,...`：只沿逗號分隔的述詞、依邊的方向（主詞 → 受詞）走，問 A 能不能走到 B，以及最少幾步；A 等於 B 時是 0 步。',
      inputFormat: '第一行整數 N，接著 N 行三元組，每行恰好三個以空白分隔的名稱。再一行整數 Q，接著 Q 行查詢。結尾的空行會被忽略。',
      outputFormat: '每個查詢印一行。`get`：所有 o 依字典序排序、以一個空白分隔；沒有就印 `none`。`inherit`：所有值依字典序排序、以空白分隔，接著 ` (from 來源)`，來源依字典序以逗號分隔，例如 `no (from penguin)`；一路找不到印 `unknown`。`path`：走得到印 `yes K`（K 是最少步數），走不到印 `no`。查詢種類不是 get、inherit、path：印 `unknown query kind: 種類`。參數個數不對（get、inherit 要 2 個，path 要 3 個）、空白的查詢行，或述詞串列裡有空項目（例如 `a,,b`）：印 `bad query`。這兩種錯誤只影響那一行。若 N 或 Q 不是 0–200、0–100 的整數，某個三元組不是恰好三個欄位，或行數和 N、Q 不符：整份輸入只印一行 `invalid input`。',
      constraints: ['0 ≤ N ≤ 200，0 ≤ Q ≤ 100', '名稱是不含空白的字串，區分大小寫', '`instance_of` 與 `is_a` 是繼承查詢用的兩個述詞；其他述詞名稱自由', '輸出的值、來源一律依字典序排序'],
      samples: [
        { kind: 'normal', input: '12\nai101 taught_by lin\ndb301 taught_by chen\ndb301 taught_by wang\nlin office_in r305\nchen office_in r210\nwang office_in r512\nr305 located_in science\nr210 located_in engineering\nr512 located_in science\nscience located_in campus\nengineering located_in campus\nai101 held_in r101\n5\nget db301 taught_by\nget lin office_in\npath ai101 campus taught_by,office_in,located_in\npath ai101 campus taught_by,located_in\nget r101 located_in\n', output: 'chen wang\nr305\nyes 4\nno\nnone\n', note: '校園知識圖譜：直接查詢、多步路徑；只沿 taught_by、located_in 到不了 campus' },
        { kind: 'normal', input: '8\ntweety instance_of canary\npingu instance_of penguin\ncanary is_a bird\npenguin is_a bird\nbird is_a animal\nbird flies yes\npenguin flies no\nanimal breathes yes\n4\ninherit tweety flies\ninherit pingu flies\ninherit pingu breathes\ninherit pingu color\n', output: 'yes (from bird)\nno (from penguin)\nyes (from animal)\nunknown\n', note: '企鵝的例外：pingu 的 flies 來自 penguin，覆寫了 bird 的 yes' },
      ],
      tests: [
        { kind: 'normal', input: '15\nlin instance_of professor\nchen instance_of lecturer\nprofessor is_a teacher\nlecturer is_a teacher\nteacher is_a staff\nstaff is_a person\nperson has_id yes\nteacher can_grade yes\nprofessor office_hours 4\nlecturer office_hours 2\nstaff parking yes\nchen parking no\nlin teaches ai101\nlin teaches ds201\nlin teaches ai101\n7\ninherit lin office_hours\ninherit chen office_hours\ninherit chen parking\ninherit lin parking\ninherit lin has_id\nget lin teaches\ninherit professor can_grade\n', output: '4 (from professor)\n2 (from lecturer)\nno (from chen)\nyes (from staff)\nyes (from person)\nai101 ds201\nyes (from teacher)\n', note: '四層類別階層：最近的一層說了算；chen 自己的 parking 覆寫 staff；重複的三元組只算一次' },
        { kind: 'normal', input: '7\npingu instance_of penguin\npenguin is_a bird\npenguin instance_of species\nspecies member_count many\nbird flies yes\npenguin flies no\nbird is_a animal\n5\ninherit pingu member_count\ninherit penguin member_count\ninherit pingu flies\ninherit penguin flies\nget pingu instance_of\n', output: 'unknown\nmany (from species)\nno (from penguin)\nno (from penguin)\npenguin\n', note: '陷阱：penguin instance_of species 不會傳給 pingu，pingu 不是一個物種' },
        { kind: 'normal', input: '6\nnixon instance_of quaker\nnixon instance_of republican\nquaker pacifist yes\nrepublican pacifist no\nquaker is_a person\nrepublican is_a person\n3\ninherit nixon pacifist\ninherit quaker pacifist\ninherit nixon pacifist_hint\n', output: 'no yes (from quaker,republican)\nyes (from quaker)\nunknown\n', note: '多重繼承的衝突（Nixon diamond）：同一層的兩個類別給出不同的值，兩個都列出' },
        { kind: 'normal', input: '6\nrobo instance_of machine\nrobo instance_of pet\nmachine is_a device\ndevice needs power\npet needs food\npet needs walks\n3\ninherit robo needs\ninherit machine needs\nget pet needs\n', output: 'food walks (from pet)\npower (from device)\nfood walks\n', note: '多重繼承但距離不同：pet 在第 1 層，比第 2 層的 device 近，所以是 food walks' },
        { kind: 'normal', input: '9\na1 next b1\na1 next c1\nb1 next d1\nc1 next d1\nd1 next e1\nc1 shortcut e1\ne1 next a1\nb1 back a1\nx1 next a1\n5\npath a1 e1 next\npath a1 e1 next,shortcut\npath e1 d1 next\npath a1 x1 next,back,shortcut\npath d1 c1 next\n', output: 'yes 3\nyes 2\nyes 3\nno\nyes 3\n', note: '有向圖上的最短步數：加入 shortcut 後變短；方向相反的邊不能走' },
        { kind: 'edge', input: '0\n3\nget lin teaches\ninherit lin flies\npath lin lin teaches\n', output: 'none\nunknown\nyes 0\n', note: '沒有任何三元組：查不到的回答 none、unknown，起點等於終點仍是 yes 0' },
        { kind: 'edge', input: '4\na is_a b\nb is_a c\nc is_a a\nc color red\n4\ninherit a color\ninherit b size\npath a c is_a\npath c b is_a\n', output: 'red (from c)\nunknown\nyes 2\nyes 2\n', note: 'is_a 有環 a → b → c → a：繼承查詢與路徑查詢都必須停下來' },
        { kind: 'edge', input: '3\nsci located_in campus\ncampus located_in sci\nr1 located_in sci\n3\npath r1 r1 located_in\npath campus r1 located_in\npath r1 campus located_in\n', output: 'yes 0\nno\nyes 2\n', note: 'located_in 錯誤地成環：BFS 用 dist 記錄到過的節點，不會無限繞圈' },
        { kind: 'edge', input: '2\npingu flies no\npingu instance_of bird\n2\ninherit pingu flies\nget pingu flies\n', output: 'no (from pingu)\nno\n', note: '屬性就在起點自己身上：距離 0，from 自己' },
        { kind: 'error', input: '2\nlin teaches ai101\nai101 held_in r305\n4\nfind lin teaches\nget lin\npath lin r305 teaches,,held_in\npath lin r305 teaches,held_in\n', output: 'unknown query kind: find\nbad query\nbad query\nyes 2\n', note: '未知的查詢種類、參數個數不對、述詞串列有空項目，各自回報，其餘查詢照常回答' },
        { kind: 'error', input: '2\nlin teaches ai101\nai101 held_in\n1\nget lin teaches\n', output: 'invalid input\n', note: '第二個三元組只有兩個欄位：整份輸入不合格式' },
        { kind: 'error', input: 'two\nlin teaches ai101\n1\nget lin teaches\n', output: 'invalid input\n', note: '三元組個數不是整數' },
        { kind: 'error', input: '1\nlin teaches ai101\n3\nget lin teaches\nget ai101 held_in\n', output: 'invalid input\n', note: '宣告 3 個查詢，只給了 2 個' },
        { kind: 'error', input: '1\nlin teaches the ai course\n1\nget lin teaches\n', output: 'invalid input\n', note: '三元組超過三個欄位（名稱不能含空白）' },
      ],
      hints: [
        '先寫 parse：任何格式問題都回傳 None，主程式只要印 `invalid input`；三元組存成 set，重複的自動合併。',
        '寫一個 `objects(s, p)` 回傳排序好的受詞串列，get、inherit、path 都用得到。',
        'inherit 用「一層一層」的 BFS：每一層先檢查有沒有節點擁有 P，有就停；沒有再算下一層。只有起點可以走 instance_of。',
        'path 是 A14 的 BFS：dist 同時記錄步數與「到過了沒」，有環也不會重複走；用 deque 當佇列。',
        '用範例 2 檢查企鵝的例外，用一個 a is_a b、b is_a a 的小輸入檢查程式會停。',
      ],
      solution: { Python: code`import sys
from collections import deque

def parse(lines):
    """回傳 (三元組集合, 查詢串列)；格式不對就回傳 None。"""
    while lines and not lines[-1].strip():
        lines.pop()  # 忽略結尾的空行
    def number(i, limit):
        text = lines[i].strip() if i < len(lines) else ''
        return int(text) if text.isdigit() and int(text) <= limit else None
    n = number(0, 200)
    if n is None or len(lines) < 1 + n:
        return None
    triples = set()  # 重複的事實只算一次
    for line in lines[1:1 + n]:
        parts = line.split()
        if len(parts) != 3:
            return None
        triples.add(tuple(parts))
    q = number(1 + n, 100)
    if q is None or len(lines) != 2 + n + q:
        return None
    return triples, lines[2 + n:]

def objects(triples, s, p):
    return sorted({o for s2, p2, o in triples if s2 == s and p2 == p})

def inherit(triples, s, p):
    """一層一層往上：起點可走 instance_of 或 is_a，類別只走 is_a；最近的一層說了算。"""
    seen, level = {s}, [s]
    while level:
        providers = sorted(x for x in level if objects(triples, x, p))
        if providers:
            values = sorted({v for x in providers for v in objects(triples, x, p)})
            return ' '.join(values) + ' (from ' + ','.join(providers) + ')'
        nxt = []
        for x in level:
            for up in (('instance_of', 'is_a') if x == s else ('is_a',)):
                for y in objects(triples, x, up):
                    if y not in seen:  # 已到過的類別不再走：is_a 有環也會停
                        seen.add(y)
                        nxt.append(y)
        level = nxt
    return 'unknown'

def path(triples, a, b, preds):
    dist, queue = {a: 0}, deque([a])
    while queue:
        u = queue.popleft()
        if u == b:
            return f'yes {dist[u]}'
        for s, p, o in sorted(triples):
            if s == u and p in preds and o not in dist:
                dist[o] = dist[u] + 1
                queue.append(o)
    return 'no'

def answer(triples, line):
    parts = line.split()
    if not parts:
        return 'bad query'
    kind, args = parts[0], parts[1:]
    if kind not in ('get', 'inherit', 'path'):
        return f'unknown query kind: {kind}'
    if len(args) != (3 if kind == 'path' else 2):
        return 'bad query'
    if kind == 'get':
        return ' '.join(objects(triples, *args)) or 'none'
    if kind == 'inherit':
        return inherit(triples, *args)
    preds = args[2].split(',')
    if '' in preds:
        return 'bad query'
    return path(triples, args[0], args[1], set(preds))

parsed = parse(sys.stdin.read().replace('\r', '').split('\n'))
if parsed is None:
    print('invalid input')
else:
    triples, queries = parsed
    for line in queries:
        print(answer(triples, line))` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'graph-traversal', title: '校園知識圖譜：只沿指定的述詞做 BFS，再篩選類別', language: 'Python',
    code: TRACE_CODE,
    steps: bfsSteps(),
  },
  quiz: [
    {
      id: 'q-frame-default', prompt: '「教室框架的 seats 槽，實例沒有填時就用類別框架的 40；某間教室自己填了 120 就用 120。」這描述的是哪一種機制？',
      options: ['語意網路中帶標籤的邊', '產生式規則的前向鏈結', '框架的預設值（default facet）', 'RDF 受詞位置的字面值'],
      answer: 2, explanation: '框架的槽可以帶 default facet：實例沒有填時沿用類別的典型值，實例自己填了就覆寫，這正是 e-frames 中 r205 用 40、r101 用 120 的情況。語意網路的邊只表示兩個概念之間的關係，本身沒有「預設、可覆寫」的機制；前向鏈結是規則從事實推出新事實的推論方式，和槽的取值無關；字面值只是 RDF 受詞可以是字串或數字，不涉及預設。',
    },
    {
      id: 'q-wildcard', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`store = {('lin', 'teaches', 'ai101'), ('chen', 'teaches', 'db301'),
         ('lin', 'advises', 'amy'), ('ai101', 'held_in', 'r305')}

def match(s=None, p=None, o=None):
    return sorted(t for t in store if (s is None or t[0] == s)
                  and (p is None or t[1] == p) and (o is None or t[2] == o))

print([t[2] for t in match(s='lin')])` },
      options: ["['amy', 'ai101']", "['ai101', 'amy']", "['ai101']", "['ai101', 'db301']"],
      answer: 0, explanation: 'p 與 o 是 None，表示萬用字元，所以吻合的是主詞為 lin 的兩個三元組。sorted 比較的是整個 tuple：主詞相同就比述詞，advises < teaches，所以 (lin, advises, amy) 排在前面，印出 [\'amy\', \'ai101\']。[\'ai101\', \'amy\'] 是把受詞本身排序的結果，但程式排序的是三元組；[\'ai101\'] 把 None 當成「沒有這個述詞」而只想到 teaches；[\'ai101\', \'db301\'] 把 chen 教的課也算進來，主詞條件沒有被忽略。',
    },
    {
      id: 'q-penguin', prompt: '知識庫有：(pingu, instance_of, penguin)、(penguin, is_a, bird)、(bird, flies, yes)、(penguin, flies, no)。用「從個體往上找，第一個有這個屬性的節點說了算」查詢 pingu 的 flies，答案是？',
      options: ['yes，因為 bird 是比較一般、比較可靠的知識', 'yes 和 no 都成立，這個知識庫自相矛盾', '查不到，因為 pingu 自己沒有 flies 這個屬性', 'no，penguin 的值覆寫了 bird 的預設值'],
      answer: 3, explanation: '往上的路徑是 pingu → penguin → bird，第一個有 flies 的節點是 penguin，所以答案是 no：最具體的知識優先，bird 的 yes 只是預設值。「bird 比較可靠」把順序弄反了，越一般的知識越可能有例外；「自相矛盾」錯在預設值本來就允許被覆寫，這不是矛盾；「查不到」忽略了繼承，pingu 自己沒有的屬性要往上找。',
    },
    {
      id: 'q-instance-of', prompt: '知識庫有 (pingu, instance_of, penguin)、(penguin, is_a, bird)、(penguin, instance_of, species)。下列哪個推論正確？',
      options: ['pingu 是一個 species', 'pingu 是一隻 bird', 'bird 是一個 species', 'species 是 penguin 的子類別'],
      answer: 1, explanation: 'pingu 屬於 penguin，penguin 是 bird 的子類別，子類別關係可以往上傳，所以 pingu 是一隻 bird。「pingu 是一個 species」把 instance_of 當成可傳遞：penguin 這個類別是一個物種，不代表 pingu 這隻企鵝是一個物種；「bird 是一個 species」沒有任何根據，penguin 是物種不代表它的上層類別也是；「species 是 penguin 的子類別」把 instance_of 誤讀成反方向的子類別關係。',
    },
    {
      id: 'q-multi-hop', prompt: '下面的多步查詢印出什麼？',
      code: { language: 'Python', text: code`t = [('db301', 'taught_by', 'chen'), ('db301', 'taught_by', 'wang'),
     ('chen', 'office_in', 'r210'), ('wang', 'office_in', 'r512'),
     ('r210', 'located_in', 'eng'), ('r512', 'located_in', 'sci')]

def objs(s, p):
    return sorted(o for a, b, o in t if a == s and b == p)

frontier = ['db301']
for p in ['taught_by', 'office_in', 'located_in']:
    frontier = sorted({o for s in frontier for o in objs(s, p)})
print(frontier)` },
      options: ["['eng']", "['eng', 'sci']", "['r210', 'r512']", "['chen', 'wang']"],
      answer: 1, explanation: '第一步得到 {chen, wang}，第二步得到 {r210, r512}，第三步得到 {eng, sci}，排序後印出 [\'eng\', \'sci\']。每一步處理的是整個集合，所以兩位老師的建築都在裡面。[\'eng\'] 只跟著第一位老師 chen 走，忽略了 db301 有兩位老師；[\'r210\', \'r512\'] 是第二步的結果，少走了 located_in；[\'chen\', \'wang\'] 只走了第一步。',
    },
    {
      id: 'q-cycle', prompt: '下面的程式沿 up 一層一層往上走，is_a 錯誤地形成了環。執行結果是？',
      code: { language: 'Python', text: code`up = {'a': ['b'], 'b': ['c'], 'c': ['a']}
level = ['a']
while level:
    level = [y for x in level for y in up.get(x, [])]
print('done')` },
      options: ['印出 done，因為走完 a、b、c 就沒有下一層', '丟出 KeyError，因為 c 沒有上層', '多走一圈回到 a 之後停下來，印出 done', '永遠不會印出 done：level 一直是只有一個元素的串列'],
      answer: 3, explanation: 'level 依序是 [b]、[c]、[a]、[b]…，永遠不是空串列，while 不會結束，done 永遠不會印出。要停下來必須記錄到過的節點，已到過的不再放進下一層，練習與 BFS 的 seen 就是為此。「走完 a、b、c 就停」以為有終點，但 c 又指回 a；「KeyError」錯在 c 有上層 a，而且 up.get 對不存在的鍵回傳空串列也不會出錯；「多走一圈就停」是加了 seen 之後才會有的行為，這段程式沒有。',
    },
    {
      id: 'q-kg-vs-er', prompt: '校園系統要新增「教授指導學生」（advises）這種關係。下列敘述何者最正確？',
      options: ['知識圖譜直接加入 (lin, advises, amy) 這類三元組；關聯式資料庫通常要先改 schema，新增關係表或外鍵欄位', '兩種都必須先修改 schema，才能加入任何指導關係的資料', '知識圖譜無法表示多對多的關係，必須先轉成表格', '關聯式資料庫無法表示兩個實體之間的關係'],
      answer: 0, explanation: '三元組的格式固定，新的關係種類只是新的述詞，直接加入即可；關聯式資料庫的結構由 schema 決定，多對多的指導關係通常要新增一張關係表。「兩種都要改 schema」錯在知識圖譜沒有必須先定義的表格；「無法表示多對多」錯，多對多就是同一個述詞有很多條邊；「關聯式無法表示關係」錯，外鍵與關係表正是 DB08 把關係轉成表格的方式。',
    },
    {
      id: 'q-open-world', prompt: '在一個採開放世界假設（open-world assumption）的知識圖譜中，查詢 (lin, speaks, french) 沒有任何結果。應該怎麼解讀？',
      options: ['lin 一定不會說法語', '這筆資料有錯，應該刪除 lin 的其他三元組', '不知道：沒有記錄不代表不成立', 'lin 會說所有語言，因為沒有被限制'],
      answer: 2, explanation: '開放世界假設下，知識圖譜被視為不完整的，查不到只代表沒有記錄，答案是「不知道」，所以練習查不到時回答 none 或 unknown。「一定不會說法語」是封閉世界假設的解讀，適用於關聯式資料庫的選課表這類完整記錄；「刪除其他三元組」毫無根據，缺一筆資料不代表其他資料錯；「會說所有語言」把沒有記錄當成成立，同樣是沒有根據的推論。',
    },
  ],
};
