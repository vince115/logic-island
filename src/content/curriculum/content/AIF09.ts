import type { LessonContent, Mark, TraceStep } from '../schema';
import { CallTracer } from '../simulate-algorithms';

const code = String.raw;

/**
 * AIF09 限制滿足問題. Python only (python-code). Every example and the reference solution run in the curriculum code
 * tests; their outputs were produced by running the programs.
 *
 * The visualization: backtracking with forward checking on the Australia map, variables in the fixed order
 * WA, NT, NSW, SA, V, Q, T (no MRV, so the search meets a dead end), values in the order of each domain. NSW=R leaves
 * SA and Q both {B}; forward checking does not see that the two are adjacent, so SA=B is tried, empties Q and is
 * rejected; NSW=G then leads to a solution. The same order is the "forward" row of example e-compare.
 */
const NB: Record<string, string[]> = { WA: ['NT', 'SA'], NT: ['WA', 'SA', 'Q'], SA: ['WA', 'NT', 'Q', 'NSW', 'V'],
  Q: ['NT', 'SA', 'NSW'], NSW: ['SA', 'Q', 'V'], V: ['SA', 'NSW'], T: [] };
const ORDER = ['WA', 'NT', 'NSW', 'SA', 'V', 'Q', 'T'];
const COLOURS = ['R', 'G', 'B'];
const TRACE_OUTPUT = 'WA=R NT=G NSW=G SA=B V=R Q=R T=R';
const TRACE_CODE = code`NB = {'WA': ['NT', 'SA'], 'NT': ['WA', 'SA', 'Q'], 'SA': ['WA', 'NT', 'Q', 'NSW', 'V'],
      'Q': ['NT', 'SA', 'NSW'], 'NSW': ['SA', 'Q', 'V'], 'V': ['SA', 'NSW'], 'T': []}
ORDER = ['WA', 'NT', 'NSW', 'SA', 'V', 'Q', 'T']  # 固定順序，不用 MRV
assign = {}

def backtrack(dom, i):
    if i == len(ORDER):
        return True
    var = ORDER[i]
    for c in dom[var]:
        new = {v: [x for x in d if x != c] if v in NB[var] and v not in assign else d
               for v, d in dom.items()}
        new[var] = [c]
        if any(not new[u] for u in NB[var]):
            continue  # 前向檢查：有鄰居沒有顏色可選
        assign[var] = c
        if backtrack(new, i + 1):
            return True
        del assign[var]  # 回溯：撤銷這個指定
    return False

backtrack({v: ['R', 'G', 'B'] for v in NB}, 0)
print(' '.join(f'{v}={assign[v]}' for v in ORDER))`;
/** Lines of TRACE_CODE: each is checked below to hold the statement it stands for. */
const L = { root: 22, found: 8, prune: 15, assign: 16, success: 18, undo: 19, fail: 20, result: 23 };
const LINE_HOLDS: Record<keyof typeof L, string> = { root: 'backtrack({v:', found: 'return True', prune: 'continue', assign: 'assign[var] = c',
  success: 'return True', undo: 'del assign[var]', fail: 'return False', result: 'print(' };

/**
 * The trace code's search, run here call by call with the shared CallTracer (as A12's backtracking trace): one tree
 * node per call of backtrack, labelled with the assignment that made the call. Every step also carries the table of
 * the running call's domains (dom, or new while a value is being tried) and the assignment so far. A wiped-out value is
 * a step without a node (the program never calls backtrack for it). The last step's output is the program's real
 * output (checked here and by running the code in the lesson test).
 */
const traceSteps: TraceStep[] = (() => {
  const codeLines = TRACE_CODE.split('\n');
  for (const [key, line] of Object.entries(L)) if (!codeLines[line - 1].includes(LINE_HOLDS[key as keyof typeof L])) throw new Error(`AIF09: trace line ${line} is not ${key}`);
  type Dom = Record<string, string[]>;
  const t = new CallTracer('回溯 + 前向檢查的搜尋樹', L);
  const assign = new Map<string, string>();
  let assignments = 0, backtracks = 0;
  const shown = (d: string[]) => d.length ? d.join(' ') : '∅（清空）';
  const attach = (dom: Dom, marks: { row: number; kind: Mark }[] = []) => {
    t.steps.at(-1)!.table = { name: '值域與指定（依 ORDER 排列）', head: ['區域', '值域', '指定'],
      rows: ORDER.map(v => [v, shown(dom[v]), assign.get(v) ?? '—']), marks };
  };
  const row = (v: string) => ORDER.indexOf(v);
  let finalDom: Dom | undefined;
  const backtrack = (dom: Dom, i: number): boolean => {
    if (i === ORDER.length) {
      finalDom = dom;
      t.leave('✓', `i = ${i}：7 個區域都有顏色，每一次指定都通過了前向檢查，所以沒有相鄰同色，這就是一個解，return True。`, { key: 'found', kind: 'found' });
      attach(dom);
      return true;
    }
    const v = ORDER[i];
    for (const c of dom[v]) {
      t.setVars({ c });
      const fresh: Dom = Object.fromEntries(Object.entries(dom).map(([u, d]) => [u, NB[v].includes(u) && !assign.has(u) ? d.filter(x => x !== c) : d]));
      fresh[v] = [c];
      const wiped = NB[v].filter(u => !fresh[u].length);
      if (wiped.length) {
        t.note(`試 ${v} = ${c}：前向檢查從 ${wiped.join('、')} 的值域刪去 ${c}，${wiped.join('、')} 已經沒有顏色可選（∅）。這個值不可能成功：不指定、不遞迴，continue 試 ${v} 的下一個顏色。`, 'prune');
        attach(fresh, [{ row: row(v), kind: 'current' }, ...wiped.map(u => ({ row: row(u), kind: 'bad' as Mark }))]);
        continue;
      }
      assign.set(v, c);
      assignments++;
      const shrunk = NB[v].filter(u => !assign.has(u) && dom[u].includes(c));
      const effect = shrunk.length ? `前向檢查從 ${shrunk.map(u => `${u}（剩 ${fresh[u].join(' ')}）`).join('、')}刪去 ${c}` : `沒有未指定的鄰居的值域含 ${c}，其他值域不變`;
      const trap = Object.keys(NB).flatMap(a => NB[a].filter(b => a < b && !assign.has(a) && !assign.has(b) && fresh[a].length === 1 && fresh[b].length === 1 && fresh[a][0] === fresh[b][0]).map(b => [a, b]));
      const warn = trap.length ? `注意 ${trap[0][0]} 與 ${trap[0][1]} 相鄰，卻都只剩 ${fresh[trap[0][0]][0]}：這條路其實已經不可能成功，但前向檢查只看「剛指定的變數」和它的鄰居，看不出兩個未指定變數之間的矛盾（AC-3 會發現）。` : '';
      t.enter(`${v}=${c}`, { i: String(i + 1), var: ORDER[i + 1] ?? '—' }, `指定 ${v} = ${c}（第 ${assignments} 次指定）：${effect}。沒有值域被清空，遞迴到 i = ${i + 1}${ORDER[i + 1] ? `（${ORDER[i + 1]}）` : ''}。${warn}`, 'assign');
      attach(fresh, [{ row: row(v), kind: 'write' }, ...shrunk.map(u => ({ row: row(u), kind: 'read' as Mark }))]);
      if (backtrack(fresh, i + 1)) {
        t.leave('✓', `下一層回傳 True，這一層（負責 ${v} 的呼叫）也 return True：已經找到解，不必再試 ${v} 的其他顏色。`, { key: 'success', kind: 'found' });
        attach(finalDom!);
        return true;
      }
      assign.delete(v);
      backtracks++;
      t.note(`下一層失敗：撤銷 ${v} = ${c}（第 ${backtracks} 次回溯）。這一層的 dom 從來沒被改過（前向檢查寫在新的 dict new 裡），所以不必逐一把刪掉的值放回去，直接試 ${v} 的下一個顏色。`, 'undo');
      attach(dom, [{ row: row(v), kind: 'removed' }]);
    }
    t.leave('✗', `這一層負責 ${v}：值域 ${shown(dom[v])} 都試過了，沒有一個可行，return False，回到上一層。`, { key: 'fail', kind: 'bad' });
    attach(dom, [{ row: row(v), kind: 'bad' }]);
    return false;
  };
  const start: Dom = Object.fromEntries(Object.keys(NB).map(v => [v, [...COLOURS]]));
  t.enter('開始', { i: '0', var: ORDER[0] }, '開始：7 個區域的值域都是 R G B，還沒有任何指定。變數依 ORDER 的固定順序指定（不用 MRV），值依值域的順序嘗試；這個順序會碰到一次死路，正好看出前向檢查做到與做不到的事。', 'root');
  attach(start);
  if (!backtrack(start, 0)) throw new Error('AIF09: the trace found no colouring');
  const output = ORDER.map(v => `${v}=${assign.get(v)}`).join(' ');
  if (output !== TRACE_OUTPUT) throw new Error(`AIF09: the trace ends with ${output}, the program prints ${TRACE_OUTPUT}`);
  t.note(`印出 ${output}。共 ${assignments} 次指定、${backtracks} 次回溯（撤銷 NSW = R）。範例「三種回溯的指定次數」用同一個順序：不做前向檢查要 10 次指定、3 次回溯；加上 MRV 則 7 次指定、0 次回溯。`, 'result', { output });
  attach(finalDom!);
  return t.steps;
})();

export const AIF09: LessonContent = {
  lessonId: 'AIF09',
  motivation: '排課表、排考試、分配會議室、替地圖著色、解數獨，這些問題的共同點是：有一組要決定的事（每堂考試排在哪個時段），每件事有幾個可能的選項，選項之間有規則要遵守（有共同考生的兩科不能同一時段）。AIF04 的搜尋把狀態當成看不見內部的黑盒子，只能靠問題提供的動作與目標測試；但這類問題的狀態有清楚的結構，一個「部分的安排」只要違反一條規則，往下怎麼排都沒用。限制滿足問題（constraint satisfaction problem，CSP）就是把問題寫成變數、值域與限制三部分，再用一套與問題無關的方法求解：回溯搜尋（A12）負責系統地嘗試，前向檢查與 AC-3 弧一致性在嘗試前先刪掉不可能的值，MRV 與 LCV 決定先排哪個、先試哪個值。學完這一課，你能把著色、排程與數獨寫成 CSP，並用 Python 寫出含前向檢查與 MRV 的解題器。',
  sections: [
    {
      id: 'formulate', title: '把問題寫成 CSP：變數、值域與限制',
      blocks: [
        { type: 'p', text: '一個 CSP 由三部分組成：變數（variable）的集合 X = {X1, …, Xn}；每個變數的值域（domain）Di，也就是它可以取的值；限制（constraint）的集合 C，每條限制寫出「一組變數（範圍，scope）」與「這組變數允許哪些值的組合」。替一些變數選好值叫做指定（assignment）；沒有違反任何限制的指定是一致的（consistent），每個變數都有值的指定是完整的（complete）。解（solution）就是一個完整而且一致的指定。' },
        { type: 'table', head: ['問題', '變數', '值域', '限制'], rows: [
          ['澳洲地圖著色', '7 個區域：WA、NT、SA、Q、NSW、V、T', '{R, G, B}', '相鄰的區域不同色：9 條二元限制，例如 WA ≠ NT'],
          ['考試排程', '5 個科目：Bio、Chem、CS、Math、Phys', '時段 {1, 2, 3}', '有共同考生的科目不同時段（≠）、Math 要比 Phys 早（<）、Bio 不排在時段 1'],
          ['4 × 4 數獨', '16 個格子（題目給的格子值域只有一個值）', '{1, 2, 3, 4}', '每一列、每一行、每個 2 × 2 宮的 4 格都不同：12 個 Alldiff，可拆成 56 條 ≠'],
        ] },
        { type: 'p', text: '限制依範圍的大小分類：一元限制（unary）只牽涉一個變數，例如「Bio ≠ 1」，可以直接從值域刪掉不合的值；二元限制（binary）牽涉兩個變數，例如「SA ≠ NSW」；全域限制（global）牽涉任意多個變數，最常見的是 Alldiff（全部不同），數獨的每一列就是一個 Alldiff。Alldiff 可以拆成兩兩不同的二元限制，所以本課的程式都只處理二元限制。' },
        { type: 'p', text: '限制圖（constraint graph）把每個變數畫成一個節點，兩個變數之間有二元限制就連一條邊。澳洲地圖的限制圖裡，SA 和 5 個區域相鄰，度數最大；T（塔斯馬尼亞）沒有任何邊，它是一個獨立的子問題，選什麼顏色都不影響其他區域。限制圖讓後面的方法有「鄰居」可以檢查：前向檢查只看剛指定的變數的鄰居，AC-3 沿著邊傳遞刪除，degree 啟發法數的也是限制圖上的鄰居。' },
        { type: 'example', id: 'e-formulate' },
        { type: 'p', text: '範例把考試排程寫成資料：變數、值域，以及每條限制的範圍與條件。degree 只數二元限制（Bio ≠ 1 是一元限制，不在限制圖上），Phys 有 3 條。產生並測試（generate-and-test）列出全部 3^5 = 243 個完整指定再逐一檢查；回溯搜尋在部分指定一違反限制時就不再往下，找出同樣 9 個解只拜訪了 52 個節點（含空指定的根）。變數一多，兩者的差距是指數級的。' },
        { type: 'callout', tone: 'note', title: '地圖最多需要幾種顏色', text: '四色定理（four color theorem）說，任何平面地圖（相鄰是指共用一段邊界）都能只用 4 種顏色著色；它在 1976 年由 Kenneth Appel 與 Wolfgang Haken 借助電腦證明。澳洲地圖用 3 種就夠，但有些地圖一定要 4 種，例如中間一塊被奇數塊環繞的地圖（練習的輪狀圖測資）。' },
      ],
    },
    {
      id: 'search', title: 'CSP 與一般狀態空間搜尋：回溯搜尋',
      blocks: [
        { type: 'p', text: 'AIF04 與 AIF05 的搜尋使用不透明（atomic）的狀態：演算法只能呼叫問題提供的動作、轉移與目標測試，看不到狀態的內部。CSP 的狀態是因子化（factored）的：一個狀態就是一個部分指定，演算法看得到每個變數與每條限制。這帶來兩個好處：一是部分指定違反限制時，整棵子樹可以直接放棄；二是 MRV、degree、LCV、前向檢查、AC-3 這些方法只依賴「變數、值域、限制」的結構，寫一次就能用在任何 CSP 上，不必像 A* 那樣為每個問題設計啟發函數。' },
        { type: 'table', head: ['面向', '一般狀態空間搜尋（AIF04、AIF05）', 'CSP 的回溯搜尋'], rows: [
          ['狀態', '不透明的節點', '部分指定（哪些變數已有值）'],
          ['動作', '由問題定義', '替一個未指定的變數選一個值'],
          ['目標測試', '問題提供的函數', '指定完整而且一致'],
          ['解的深度', '事先不知道', '恰好 n 層（n 是變數個數）'],
          ['答案', '常常是路徑本身，還有路徑成本', '只要最後的指定，路徑不重要'],
          ['剪枝與引導', '為每個問題設計的啟發函數 h', '違反限制就放棄；MRV、LCV 等通用方法'],
        ] },
        { type: 'p', text: '指定有交換性（commutativity）：先 WA = R 再 NT = G，和先 NT = G 再 WA = R，得到的是同一個部分指定。所以回溯搜尋在每一層只對「一個」變數分支。若每一層都讓所有未指定的變數各試每個值，第 k 層有 (n − k) · d 個分支，葉節點共有 n! · d^n 個；固定每層一個變數，只有 d^n 個。澳洲地圖是 3^7 = 2,187 個對 7! · 3^7 = 11,022,480 個，每個完整指定都被重複了 5,040 次。' },
        { type: 'p', text: '回溯搜尋（backtracking search）就是 A12 的模板：選擇、遞迴、撤銷，再加上 CSP 的幾個插槽：' },
        { type: 'list', ordered: true, items: [
          '所有變數都已指定：回傳這個指定（它一路都是一致的，所以就是解）。',
          '選一個未指定的變數（select-unassigned-variable：固定順序，或 MRV）。',
          '依某個順序（order-domain-values：值域的順序，或 LCV）嘗試它值域中的每個值；跳過和已指定鄰居衝突的值。',
          '推論（inference）：前向檢查或 AC-3 縮小其他變數的值域；有值域被清空就換下一個值。',
          '指定、遞迴；遞迴失敗就撤銷這個指定（回溯），試下一個值。值都試完就回傳失敗。',
        ] },
        { type: 'p', text: '因為解一定在第 n 層，而且搜尋樹沒有重複的狀態，深度優先就夠了：記憶體只要目前這條路徑，O(n) 個指定。廣度優先在這裡沒有好處，它會把每一層所有的部分指定都存起來，而且要到第 n 層才找得到解。' },
        { type: 'callout', tone: 'warning', title: '「每一層讓所有變數都分支」不是更完整，只是更多重複', text: '初學者常把 CSP 直接套進 AIF04 的框架：動作是「任選一個未指定變數、任選一個值」。這樣的搜尋仍然正確，但每個完整指定會從 n! 種指定順序各被找到一次，失敗時也要把所有順序都試過才能確定無解。固定每一層只決定一個變數不會漏掉任何解：每個解的每個變數終究都要有值，換順序只是重複走到同一個指定。' },
      ],
    },
    {
      id: 'forward-checking', title: '前向檢查：指定之後立刻刪掉鄰居不能用的值',
      blocks: [
        { type: 'p', text: '一般的回溯只有在「輪到某個變數、發現每個值都和已指定的鄰居衝突」時才知道走錯了，這時可能已經多做了好幾層。前向檢查（forward checking）在每次指定 X = x 之後，立刻對 X 的每個未指定鄰居 Y，從 D(Y) 刪掉和 x 衝突的值；只要有某個 D(Y) 變成空的，就知道 X = x 不可能成功，直接換下一個值。這個方法由 Robert Haralick 與 Gordon Elliott 在 1980 年的論文中系統地分析。附帶的好處是：留在值域裡的值都和已指定的鄰居相容，所以每個變數「還剩幾個合法的值」可以直接讀出來，這正是 MRV 需要的資訊。' },
        { type: 'p', text: '下方的視覺化逐步執行澳洲地圖上的回溯 + 前向檢查，變數依固定順序 WA、NT、NSW、SA、V、Q、T 指定。搜尋樹的每個節點是一次 backtrack 呼叫，標籤是讓它被呼叫的那個指定；表格是正在執行的那一層看到的值域（被刪掉值的鄰居標成讀取，值域清空的標成錯誤）。看 NSW = R 那一步：SA 與 Q 都只剩 B，兩者又相鄰，其實已經沒救；但前向檢查只檢查 NSW 的鄰居，沒有發現。接著試 SA = B，前向檢查把 Q 的值域清空，SA 沒有別的值，搜尋退回 NSW 改成 G，之後一路成功。' },
        { type: 'example', id: 'e-compare' },
        { type: 'table', head: ['方法（同一個變數順序）', '指定次數', '回溯次數'], rows: [
          ['一般回溯（只檢查已指定的鄰居）', '10', '3'],
          ['回溯 + 前向檢查', '8', '1'],
          ['回溯 + 前向檢查 + MRV', '7', '0'],
        ] },
        { type: 'p', text: '7 個區域至少要 7 次指定，所以 MRV 那一列沒有走任何冤枉路。一般回溯在 NSW = R 之後還會指定 SA = B、V = G，直到輪到 Q、發現三種顏色都被鄰居用掉，才一路撤銷 V、SA、NSW，共 3 次回溯；前向檢查在試 SA = B 時就看到 Q 的值域被清空，少了 2 次指定與 2 次回溯。地圖越大、死路越深，差距越明顯。' },
        { type: 'callout', tone: 'warning', title: '前向檢查不會檢查「兩個未指定變數之間」的限制', text: '前向檢查只沿著剛指定的變數往外看一步。指定 WA = R、Q = G 之後，NT 與 SA 都只剩 B，而 NT 與 SA 相鄰，這個部分指定已經不可能完成；但沒有值域是空的，前向檢查不會報錯，搜尋會繼續往下，到指定 NT = B 時才把 SA 清空。要在這一刻就發現矛盾，需要下一節的弧一致性。' },
        { type: 'callout', tone: 'note', title: '撤銷時要把刪掉的值放回去', text: '本課的程式每次都建立新的值域 dict（new），舊的 dom 原封不動，回溯時自然回到原狀。若為了省記憶體直接修改同一份值域，就必須記下每次刪掉了哪些值，撤銷指定時一一放回；忘了放回，之後的分支會以為某些顏色不能用，結果可能漏掉解，甚至把有解的題目判成無解。' },
      ],
    },
    {
      id: 'ac3', title: '弧一致性與 AC-3：讓刪除一路傳下去',
      blocks: [
        { type: 'p', text: '有向的弧（arc）X → Y 是一致的，若 D(X) 的每個值 x，在 D(Y) 中都至少有一個值 y 讓 (x, y) 滿足 X 與 Y 之間的限制。弧有方向：X → Y 一致不代表 Y → X 一致。讓 X → Y 變一致的動作叫 revise：刪掉 D(X) 中找不到搭配的值。每條弧都一致的 CSP 稱為弧一致（arc consistent）。' },
        { type: 'list', ordered: true, items: [
          '把每條二元限制的兩個方向（X → Y 與 Y → X）都放進佇列。',
          '從佇列取出一條弧 X → Y，執行 revise(X, Y)。',
          '若 D(X) 有值被刪掉：D(X) 變空就回報不一致；否則把每個指向 X 的弧 Z → X（Z 是 X 的其他鄰居，Z ≠ Y）放回佇列，因為 X 少了值，Z 的值可能失去搭配。',
          '佇列空了：每條弧都一致，回報一致。',
        ] },
        { type: 'p', text: '這就是 AC-3，由 Alan Mackworth 在 1977 年提出。設有 c 條二元限制、值域最多 d 個值：一條弧只有在它指向的變數少了值時才會再進佇列，每個值域最多少 d 次，所以每條弧最多進佇列 O(d) 次；一次 revise 比對兩個值域要 O(d²)，總時間 O(c · d³)。' },
        { type: 'example', id: 'e-ac3' },
        { type: 'p', text: '範例的 revisions 是「revise 真的刪掉了值」的次數。第一組 WA = R、NT = G：刪除一路傳下去，SA 只能 B、Q 只能 R、NSW 只能 G、V 只能 R，整個本島都定下來了，T 沒有任何弧，值域不變。第二組 WA = R、Q = G 正是上一節前向檢查看不出來的情形：NT 與 SA 都被縮成 {B} 之後，revise(SA, NT) 發現 SA 的 B 在 NT 找不到不同的顏色，SA 變空，回報不一致。第三組 WA = R、V = G 的矛盾藏得更深：SA 被迫為 B，於是 NT 為 G、NSW 為 R，最後 Q 的三個鄰居用光了三種顏色。' },
        { type: 'p', text: '把 AC-3 放進回溯搜尋，每次指定 X 之後只把指向 X 的弧 Y → X 放進佇列再執行，稱為維持弧一致性（maintaining arc consistency，MAC）。前向檢查相當於只做這些弧的第一輪 revise、不再往外傳；MAC 多花一些時間做推論，常常換來小很多的搜尋樹。' },
        { type: 'callout', tone: 'warning', title: '弧一致不代表有解', text: '三個兩兩相鄰的區域、只有 R 與 G 兩種顏色：每條弧 X → Y 中，X 的 R 可以搭配 Y 的 G，X 的 G 可以搭配 Y 的 R，所以每條弧都一致，AC-3 一個值都不刪；但三個兩兩不同的區域需要三種顏色，這個 CSP 無解。AC-3 只檢查兩個變數之間的關係，看不見三個變數一起的矛盾；它能縮小值域、提早發現一部分死路，但最後仍需要搜尋。' },
      ],
    },
    {
      id: 'heuristics', title: '先排哪一個、先試哪個值：MRV、degree 與 LCV',
      blocks: [
        { type: 'p', text: '最少剩餘值（minimum remaining values，MRV）啟發法：下一個要指定的，是合法值最少的變數。若有變數只剩 0 個值，MRV 立刻選到它而失敗，不會先在別處浪費時間；只剩 1 個值的變數是被迫的，先做也不會錯。這個想法常被稱為「先失敗」（fail-first）：反正每個變數最後都要有值，越難的越早處理，死路越早被發現。' },
        { type: 'p', text: 'MRV 在一開始幫不上忙，因為每個值域都一樣大。degree 啟發法用來決勝：選和最多「未指定」變數有限制的那一個，它的決定會影響最多其他變數。澳洲地圖一開始 SA 有 5 個鄰居，所以先選 SA；之後的度數要扣掉已經指定的鄰居。' },
        { type: 'p', text: '選好變數之後，最少限制值（least constraining value，LCV）啟發法決定值的順序：先試「從未指定鄰居的值域刪掉最少值」的那個值。它和 MRV 的方向相反，是「先成功」：變數一定要處理，但值只需要找到一個成功的，先試最可能成功的值。若要找出全部的解，或題目根本無解，每個值都得試，值的順序就不影響工作量。' },
        { type: 'example', id: 'e-mrv' },
        { type: 'table', head: ['步驟', '選擇', '理由'], rows: [
          ['1', 'SA = R', '每個值域都是 3；SA 有 5 個未指定鄰居，degree 最大'],
          ['2', 'NSW = G', '值域剩 2 的有 5 個；NSW、NT、Q 都有 2 個未指定鄰居，名稱 NSW 最小'],
          ['3–6', 'Q、NT、V、WA', '都只剩 1 個值，被迫指定，沒有任何分支'],
          ['7', 'T = R', 'T 沒有鄰居，值域一直是 3，最後才輪到它'],
        ] },
        { type: 'p', text: '範例最後一行重現 LCV 的典型情形：已指定 WA = R、NT = G，輪到 Q 時，Q = R 只會從 NSW 刪掉 R（共 1 個值），Q = B 會從 SA 和 NSW 各刪掉 B（共 2 個），而且 SA 的值域只剩 B，會被清空。LCV 先試 R，第一次就走對。' },
        { type: 'callout', tone: 'tip', title: '寫出確定的順序，結果才能比對', text: 'MRV、degree 都可能同分，值也可能同分。程式要能重現、要能用測資比對，就要把決勝規則寫死。本課練習的規則是：值域最小優先，再比未指定鄰居多者優先，再比名稱字串小者優先；值依輸入的顏色順序。換一個決勝規則，找到的解與回溯次數都可能不同，兩者都沒有錯，只是不能互相比對。' },
      ],
    },
    {
      id: 'sudoku', title: '小型數獨：同一個解題器',
      blocks: [
        { type: 'p', text: '4 × 4 數獨的變數是 16 個格子，值域是 {1, 2, 3, 4}，題目給的格子先指定。每一列、每一行、每個 2 × 2 宮各是一個 Alldiff；拆成二元限制後，每個格子和同列 3 格、同行 3 格、同宮另外 1 格（同宮的另外兩格已經在同列或同行裡）不同，共 7 個鄰居，全部 16 × 7 / 2 = 56 條 ≠ 限制。解題器和地圖著色完全相同：變數換成格子、鄰居換成同列同行同宮，前向檢查與 MRV 不必改。' },
        { type: 'example', id: 'e-sudoku' },
        { type: 'p', text: '這一題有 12 個空格，前向檢查加 MRV 剛好做了 12 次指定、0 次回溯：每一步 MRV 都選到只剩 1 個值的格子。若改成不做前向檢查、依列優先的順序逐格填（只檢查已填好的同列、同行、同宮），同一題要 15 次指定、3 次回溯。9 × 9 數獨有 81 個變數、27 個 Alldiff，難題常需要 AC-3 或更強的推論才能少走死路。' },
        { type: 'callout', tone: 'note', title: '限制圖的形狀也會決定難度', text: '若限制圖是一棵樹（沒有迴路），可以選一個根，從葉往根讓每條弧一致，再從根往葉逐一指定，完全不需要回溯，時間 O(n · d²)。澳洲地圖的 T 是獨立的一個分量，可以單獨解；地圖與數獨的限制圖有很多迴路，所以仍需要搜尋。' },
      ],
    },
  ],
  examples: [
    {
      id: 'e-formulate', title: '考試排程：寫成 CSP，比較產生並測試與回溯',
      description: '把變數、值域、限制（範圍與條件）寫成資料；算出限制圖的度數，再用兩種方法找出全部的解並比較工作量。',
      code: { Python: code`from itertools import product
VARS = ['Bio', 'Chem', 'CS', 'Math', 'Phys']  # 排考試：變數是科目，值域是時段 1–3
DOMAIN = [1, 2, 3]
# 限制 = (範圍, 條件)：有共同考生的科目不同時段；Math 比 Phys 早；Bio 不排第 1 時段
CONSTRAINTS = [
    (('Math', 'Phys'), lambda a, b: a < b),
    (('Math', 'CS'), lambda a, b: a != b),
    (('Phys', 'Chem'), lambda a, b: a != b),
    (('Phys', 'CS'), lambda a, b: a != b),
    (('Chem', 'Bio'), lambda a, b: a != b),
    (('Bio',), lambda a: a != 1),
]

def consistent(assign):  # 只檢查範圍內的變數都已指定的限制
    return all(ok(*(assign[v] for v in scope)) for scope, ok in CONSTRAINTS
               if all(v in assign for v in scope))

degree = {v: sum(v in scope for scope, _ in CONSTRAINTS if len(scope) == 2) for v in VARS}
print('degree', ' '.join(f'{v}={degree[v]}' for v in VARS))
full = list(product(DOMAIN, repeat=len(VARS)))  # 產生並測試：每個完整指定都檢查
solutions = [a for a in full if consistent(dict(zip(VARS, a)))]
print(f'generate-and-test: {len(full)} complete assignments, {len(solutions)} solutions')

found, nodes = [], 0
def backtrack(assign):  # 回溯：部分指定一違反限制，就不再往下展開
    global nodes
    nodes += 1
    if len(assign) == len(VARS):
        found.append(tuple(assign[v] for v in VARS))
        return
    var = VARS[len(assign)]
    for value in DOMAIN:
        assign[var] = value
        if consistent(assign):
            backtrack(assign)
        del assign[var]

backtrack({})
print(f'backtracking: {nodes} nodes, {len(found)} solutions, same: {found == solutions}')
print('first', ' '.join(f'{v}={x}' for v, x in zip(VARS, found[0])))` },
      output: 'degree Bio=1 Chem=2 CS=2 Math=2 Phys=3\ngenerate-and-test: 243 complete assignments, 9 solutions\nbacktracking: 52 nodes, 9 solutions, same: True\nfirst Bio=2 Chem=1 CS=1 Math=2 Phys=3',
    },
    {
      id: 'e-compare', title: '三種回溯的指定次數：一般、前向檢查、前向檢查 + MRV',
      description: '同一張澳洲地圖、同一個變數順序（不用 MRV 時依 ORDER），數出指定與回溯的次數。MRV 同分時比未指定鄰居數，再比名稱。',
      code: { Python: code`NB = {'WA': ['NT', 'SA'], 'NT': ['WA', 'SA', 'Q'], 'SA': ['WA', 'NT', 'Q', 'NSW', 'V'],
      'Q': ['NT', 'SA', 'NSW'], 'NSW': ['SA', 'Q', 'V'], 'V': ['SA', 'NSW'], 'T': []}
ORDER = ['WA', 'NT', 'NSW', 'SA', 'V', 'Q', 'T']  # 固定的順序（不用 MRV 時）
COLOURS = ['R', 'G', 'B']

def solve(fc, mrv):
    assign, count = {}, {'assign': 0, 'backtrack': 0}
    def pick(dom):
        free = [v for v in ORDER if v not in assign]
        if not mrv:
            return free[0]
        return min(free, key=lambda v: (len(dom[v]), -sum(u not in assign for u in NB[v]), v))
    def backtrack(dom):
        if len(assign) == len(NB):
            return True
        var = pick(dom)
        for c in dom[var]:
            if any(assign.get(u) == c for u in NB[var]):
                continue  # 和已指定的鄰居同色
            new = {**dom, var: [c]}
            if fc:
                for u in NB[var]:
                    if u not in assign:
                        new[u] = [x for x in new[u] if x != c]
                if any(not new[u] for u in NB[var]):
                    continue  # 前向檢查：鄰居沒有顏色可選了
            assign[var] = c
            count['assign'] += 1
            if backtrack(new):
                return True
            del assign[var]
            count['backtrack'] += 1
        return False

    backtrack({v: COLOURS[:] for v in NB})
    return count

for name, fc, mrv in [('plain', False, False), ('forward', True, False), ('fc+mrv', True, True)]:
    count = solve(fc, mrv)
    print(f"{name:8} assignments={count['assign']:2} backtracks={count['backtrack']:2}")` },
      output: 'plain    assignments=10 backtracks= 3\nforward  assignments= 8 backtracks= 1\nfc+mrv   assignments= 7 backtracks= 0',
    },
    {
      id: 'e-ac3', title: 'AC-3 縮小值域，也找出前向檢查看不到的矛盾',
      description: '先指定兩個區域（值域只有一個值），再對整張地圖執行 AC-3，印出每個值域（- 代表清空）與 revise 刪值的次數。',
      code: { Python: code`from collections import deque
NB = {'WA': ['NT', 'SA'], 'NT': ['WA', 'SA', 'Q'], 'SA': ['WA', 'NT', 'Q', 'NSW', 'V'],
      'Q': ['NT', 'SA', 'NSW'], 'NSW': ['SA', 'Q', 'V'], 'V': ['SA', 'NSW'], 'T': []}

def revise(dom, x, y):  # 刪掉 x 中「在 y 找不到不同顏色」的值
    keep = [a for a in dom[x] if any(a != b for b in dom[y])]
    removed = len(keep) < len(dom[x])
    dom[x] = keep
    return removed

def ac3(dom):
    queue = deque((x, y) for x in NB for y in NB[x])  # 每條限制兩個方向的弧
    revisions = 0
    while queue:
        x, y = queue.popleft()
        if revise(dom, x, y):
            revisions += 1
            if not dom[x]:
                return False, revisions
            queue.extend((z, x) for z in NB[x] if z != y)
    return True, revisions

def show(dom):
    return ' '.join(f"{v}={''.join(dom[v]) or '-'}" for v in NB)

for given in [{'WA': 'R', 'NT': 'G'}, {'WA': 'R', 'Q': 'G'}, {'WA': 'R', 'V': 'G'}]:
    dom = {v: [given[v]] if v in given else ['R', 'G', 'B'] for v in NB}
    ok, revisions = ac3(dom)
    print('given', ' '.join(f'{v}={c}' for v, c in given.items()))
    print(f"  {'consistent' if ok else 'inconsistent'} after {revisions} revisions: {show(dom)}")` },
      output: 'given WA=R NT=G\n  consistent after 8 revisions: WA=R NT=G SA=B Q=R NSW=G V=R T=RGB\ngiven WA=R Q=G\n  inconsistent after 5 revisions: WA=R NT=B SA=- Q=G NSW=RGB V=RGB T=RGB\ngiven WA=R V=G\n  inconsistent after 9 revisions: WA=R NT=G SA=B Q=- NSW=R V=G T=RGB',
    },
    {
      id: 'e-mrv', title: 'MRV 的選擇順序與 LCV 的值順序',
      description: '每一步印出 MRV 選到的變數、它的值域大小、未指定鄰居數與同分的變數；最後重現 LCV 在 WA = R、NT = G 之後替 Q 排序的情形。',
      code: { Python: code`NB = {'WA': ['NT', 'SA'], 'NT': ['WA', 'SA', 'Q'], 'SA': ['WA', 'NT', 'Q', 'NSW', 'V'],
      'Q': ['NT', 'SA', 'NSW'], 'NSW': ['SA', 'Q', 'V'], 'V': ['SA', 'NSW'], 'T': []}
COLOURS = ['R', 'G', 'B']

def degree(v, assign):  # 還沒指定的鄰居數
    return sum(u not in assign for u in NB[v])

def lcv(v, dom, assign):  # 值 c 會從未指定鄰居的值域刪掉幾個值；少的先試
    cost = {c: sum(c in dom[u] for u in NB[v] if u not in assign) for c in dom[v]}
    return sorted(dom[v], key=lambda c: (cost[c], COLOURS.index(c))), cost

def assign_and_check(dom, assign, var, c):  # 指定並做前向檢查
    assign[var], dom[var] = c, [c]
    for u in NB[var]:
        if u not in assign:
            dom[u] = [x for x in dom[u] if x != c]

dom, assign = {v: COLOURS[:] for v in NB}, {}
while len(assign) < len(NB):
    free = sorted(v for v in NB if v not in assign)
    var = min(free, key=lambda v: (len(dom[v]), -degree(v, assign), v))  # MRV → degree → 名稱
    ties = [v for v in free if len(dom[v]) == len(dom[var])]
    order, cost = lcv(var, dom, assign)
    print(f"pick {var:3} |D|={len(dom[var])} degree={degree(var, assign)}",
          f"tied={','.join(ties)} -> {order[0]}")
    assign_and_check(dom, assign, var, order[0])
print(' '.join(f'{v}={assign[v]}' for v in NB))

dom, assign = {v: COLOURS[:] for v in NB}, {}
for var, c in [('WA', 'R'), ('NT', 'G')]:
    assign_and_check(dom, assign, var, c)
order, cost = lcv('Q', dom, assign)
print('after WA=R NT=G, LCV for Q:', ' '.join(f'{c}:{cost[c]}' for c in order), '| SA =', ''.join(dom['SA']))` },
      output: 'pick SA  |D|=3 degree=5 tied=NSW,NT,Q,SA,T,V,WA -> R\npick NSW |D|=2 degree=2 tied=NSW,NT,Q,V,WA -> G\npick Q   |D|=1 degree=1 tied=Q,V -> B\npick NT  |D|=1 degree=1 tied=NT,V -> G\npick V   |D|=1 degree=0 tied=V,WA -> B\npick WA  |D|=1 degree=0 tied=WA -> B\npick T   |D|=3 degree=0 tied=T -> R\nWA=B NT=G SA=R Q=B NSW=G V=B T=R\nafter WA=R NT=G, LCV for Q: R:1 B:2 | SA = B',
    },
    {
      id: 'e-sudoku', title: '4 × 4 數獨：前向檢查 + MRV',
      description: '每個格子是一個變數，同列、同行、同宮的格子兩兩不同。題目給的數字先指定並前向檢查，再用 MRV 搜尋。',
      code: { Python: code`PUZZLE = ['1...',
          '..2.',
          '.3..',
          '...4']
CELLS = [(r, c) for r in range(4) for c in range(4)]
# 同列、同行、同一個 2×2 宮的兩格之間各有一條 ≠ 限制
PEERS = {(r, c): [(i, j) for i, j in CELLS if (i, j) != (r, c)
                  and (i == r or j == c or (i // 2, j // 2) == (r // 2, c // 2))] for r, c in CELLS}
count = {'assign': 0, 'backtrack': 0}

def assign(dom, cell, d):  # 指定 cell = d 並做前向檢查；有鄰居的值域被清空就回傳 None
    new = {x: dom[x] - {d} if x in PEERS[cell] else dom[x] for x in CELLS}
    new[cell] = {d}
    return new if all(new[x] for x in PEERS[cell]) else None

def solve(dom, free):
    if not free:
        return dom
    cell = min(free, key=lambda x: (len(dom[x]), x))  # MRV，同分取列、行較小的格
    for d in sorted(dom[cell]):
        new = assign(dom, cell, d)
        if new is not None:
            count['assign'] += 1
            if result := solve(new, [x for x in free if x != cell]):
                return result
            count['backtrack'] += 1
    return None

dom = {cell: {1, 2, 3, 4} for cell in CELLS}
for (r, c), ch in zip(CELLS, ''.join(PUZZLE)):  # 題目給的數字：先指定並前向檢查
    if ch != '.':
        dom = assign(dom, (r, c), int(ch))
free = [cell for cell, ch in zip(CELLS, ''.join(PUZZLE)) if ch == '.']
result = solve(dom, free)
for r in range(4):
    print(' '.join(str(min(result[(r, c)])) for c in range(4)))
print(f"blanks={len(free)} assignments={count['assign']} backtracks={count['backtrack']}")` },
      output: '1 2 4 3\n3 4 2 1\n4 3 1 2\n2 1 3 4\nblanks=12 assignments=12 backtracks=0',
    },
  ],
  exercises: [
    {
      id: 'x-map-colouring', title: '地圖著色解題器：前向檢查 + MRV',
      statement: '讀入一張地圖（區域、相鄰關係、可用的顏色），用回溯搜尋加前向檢查找出一個著色，使相鄰的區域顏色不同。為了讓答案唯一，搜尋必須完全依照下面的規則：(1) 每個區域的值域一開始是全部顏色，依輸入的顏色順序排列；(2) 每次選一個未指定的區域：值域中剩下的顏色最少者優先（MRV）；同分時，未指定的鄰居較多者優先（degree，已指定的鄰居不算）；再同分時，名稱依字串（ASCII）順序較小者優先；(3) 依值域中的順序嘗試每個顏色：前向檢查從每個未指定鄰居的值域刪去這個顏色，若有鄰居的值域因此變空，這個顏色不指定、直接試下一個（這不算回溯）；(4) 否則指定並遞迴；遞迴失敗就撤銷這個指定，回溯次數加 1；(5) 每個區域都有顏色時就是解，立刻停止。同一對相鄰重複出現（包括反過來寫）視為同一條限制。',
      inputFormat: '輸入由空白分隔的記號組成（換行與空格相同）。依序是：區域數 n、相鄰對數 m、顏色數 k；n 個區域名稱；m 對相鄰的區域名稱（每對兩個）；k 個顏色名稱。',
      outputFormat: '有解：依輸入的區域順序，每行 `區域 顏色`，最後一行 `backtracks X`（回溯次數）。無解：一行 `no solution`。輸入不合規定（記號數與 n、m、k 不符、數字不是非負整數或超出範圍、名稱不是只含英文字母與數字、區域或顏色名稱重複、相鄰對提到不存在的區域、區域和自己相鄰）：一行 `invalid input`。',
      constraints: ['1 ≤ n ≤ 20，0 ≤ m ≤ 60，1 ≤ k ≤ 6', '名稱只含 ASCII 英文字母與數字', 'MRV → 未指定鄰居多者 → 名稱小者；值依輸入的顏色順序', '前向檢查清空鄰居值域的顏色不指定、不算回溯'],
      samples: [
        { kind: 'normal', input: '7 9 3\nWA NT SA Q NSW V T\nWA NT\nWA SA\nNT SA\nNT Q\nSA Q\nSA NSW\nSA V\nQ NSW\nNSW V\nred green blue\n', output: 'WA blue\nNT green\nSA red\nQ blue\nNSW green\nV blue\nT red\nbacktracks 0\n', note: '澳洲地圖：MRV 先選 SA（值域同為 3、未指定鄰居最多），全程沒有回溯' },
        { kind: 'normal', input: '8 10 3\nH B E G D C A F\nA C\nA D\nA F\nB D\nC E\nC H\nD G\nE G\nE H\nG H\nR G B\n', output: 'H B\nB R\nE R\nG G\nD B\nC G\nA R\nF G\nbacktracks 3\n', note: '8 個區域：MRV 的選擇仍會走進死路，要回溯 3 次' },
      ],
      tests: [
        { kind: 'normal', input: '9 16 3\nF E A G D B I C H\nA D\nA E\nA F\nA G\nA H\nB C\nB G\nB H\nC D\nC F\nC H\nC I\nD E\nE F\nE I\nG H\nR G B\n', output: 'F B\nE G\nA R\nG G\nD B\nB R\nI R\nC G\nH B\nbacktracks 4\n', note: '9 個區域、16 條相鄰：回溯 4 次後找到解' },
        { kind: 'normal', input: '8 13 3\nD H C G A E B F\nA D\nA E\nA F\nA G\nB C\nB D\nB H\nC E\nC F\nD E\nD G\nD H\nF H\nR G B\n', output: 'D R\nH G\nC R\nG B\nA G\nE B\nB B\nF B\nbacktracks 2\n', note: '8 個區域、13 條相鄰：回溯 2 次' },
        { kind: 'normal', input: '7 9 3\nWA NT SA Q NSW V T\nWA NT\nWA SA\nNT SA\nNT Q\nSA Q\nSA NSW\nSA V\nQ NSW\nNSW V\nblue green red\n', output: 'WA red\nNT green\nSA blue\nQ red\nNSW green\nV red\nT blue\nbacktracks 0\n', note: '同一張澳洲地圖換顏色順序：每個區域改用順序中較前的顏色，結構相同' },
        { kind: 'normal', input: '10 15 3\nP0 P1 P2 P3 P4 P5 P6 P7 P8 P9\nP0 P1\nP1 P2\nP2 P3\nP3 P4\nP4 P0\nP0 P5\nP1 P6\nP2 P7\nP3 P8\nP4 P9\nP5 P7\nP6 P8\nP7 P9\nP8 P5\nP9 P6\nR G B\n', output: 'P0 R\nP1 G\nP2 R\nP3 G\nP4 B\nP5 G\nP6 R\nP7 B\nP8 B\nP9 G\nbacktracks 0\n', note: 'Petersen 圖：每個區域 3 個鄰居，3 種顏色恰好夠' },
        { kind: 'normal', input: '6 10 4\nHub R1 R2 R3 R4 R5\nHub R1\nHub R2\nHub R3\nHub R4\nHub R5\nR1 R2\nR2 R3\nR3 R4\nR4 R5\nR5 R1\nR G B Y\n', output: 'Hub R\nR1 G\nR2 B\nR3 G\nR4 B\nR5 Y\nbacktracks 0\n', note: '輪狀圖（中心 + 5 個環）：4 種顏色可以著色' },
        { kind: 'normal', input: '20 31 2\nr0c0 r0c1 r0c2 r0c3 r0c4 r1c0 r1c1 r1c2 r1c3 r1c4 r2c0 r2c1 r2c2 r2c3 r2c4 r3c0 r3c1 r3c2 r3c3 r3c4\nr0c0 r0c1\nr0c1 r0c2\nr0c2 r0c3\nr0c3 r0c4\nr1c0 r1c1\nr1c1 r1c2\nr1c2 r1c3\nr1c3 r1c4\nr2c0 r2c1\nr2c1 r2c2\nr2c2 r2c3\nr2c3 r2c4\nr3c0 r3c1\nr3c1 r3c2\nr3c2 r3c3\nr3c3 r3c4\nr0c0 r1c0\nr0c1 r1c1\nr0c2 r1c2\nr0c3 r1c3\nr0c4 r1c4\nr1c0 r2c0\nr1c1 r2c1\nr1c2 r2c2\nr1c3 r2c3\nr1c4 r2c4\nr2c0 r3c0\nr2c1 r3c1\nr2c2 r3c2\nr2c3 r3c3\nr2c4 r3c4\nblack white\n', output: 'r0c0 black\nr0c1 white\nr0c2 black\nr0c3 white\nr0c4 black\nr1c0 white\nr1c1 black\nr1c2 white\nr1c3 black\nr1c4 white\nr2c0 black\nr2c1 white\nr2c2 black\nr2c3 white\nr2c4 black\nr3c0 white\nr3c1 black\nr3c2 white\nr3c3 black\nr3c4 white\nbacktracks 0\n', note: '4 × 5 的棋盤格地圖、20 個區域：兩種顏色交錯即可' },
        { kind: 'normal', input: '6 8 3\nA B C D E F\nA C\nA E\nA F\nB C\nB D\nB F\nC D\nE F\nR G B\n', output: 'A R\nB R\nC G\nD B\nE G\nF B\nbacktracks 0\n', note: 'degree 只數未指定的鄰居：最後 E、F 值域都剩 2、各只剩對方 1 個未指定鄰居，依名稱選 E；若用原始鄰居數（F 有 3 個）會先選 F，得到不同的解' },
        { kind: 'edge', input: '1 0 1\nSolo\nred\n', output: 'Solo red\nbacktracks 0\n', note: '只有一個區域、沒有相鄰、只有一種顏色' },
        { kind: 'edge', input: '2 1 2\ny x\ny x\nred green\n', output: 'y green\nx red\nbacktracks 0\n', note: '兩個區域的 MRV 與 degree 都同分：依名稱先選 x，所以 x 是 red（不是依輸入順序先選 y）' },
        { kind: 'edge', input: '3 2 2\na b c\na b\nb c\nred green\n', output: 'a green\nb red\nc green\nbacktracks 0\n', note: 'degree 決勝：b 有 2 個未指定鄰居，先於名稱較小的 a 被選，拿到 red' },
        { kind: 'edge', input: '3 0 2\nA B C\nred green\n', output: 'A red\nB red\nC red\nbacktracks 0\n', note: '沒有任何相鄰：每個區域都拿第一個顏色' },
        { kind: 'edge', input: '3 4 2\nA B C\nA B\nB A\nA B\nB C\nred green\n', output: 'A green\nB red\nC green\nbacktracks 0\n', note: '同一對相鄰重複列出（含反向）：視為一條限制，結果和只列一次相同' },
        { kind: 'edge', input: '2 1 1\nA B\nA B\nred\n', output: 'no solution\n', note: '兩個相鄰區域只有一種顏色：no solution' },
        { kind: 'edge', input: '5 5 2\nA B C D E\nA B\nB C\nC D\nD E\nE A\nred green\n', output: 'no solution\n', note: '奇數長度的環（5 個區域）只用兩種顏色：no solution' },
        { kind: 'edge', input: '6 10 3\nHub R1 R2 R3 R4 R5\nHub R1\nHub R2\nHub R3\nHub R4\nHub R5\nR1 R2\nR2 R3\nR3 R4\nR4 R5\nR5 R1\nR G B\n', output: 'no solution\n', note: '輪狀圖只用 3 種顏色：中心用掉一色，外圈的奇數環只剩兩色，no solution' },
        { kind: 'error', input: '3 2 2\nA B C\nA B\nB D\nred green\n', output: 'invalid input\n', note: '相鄰清單提到不存在的區域 D' },
        { kind: 'error', input: '2 1 2\nA B\nA A\nred green\n', output: 'invalid input\n', note: '區域和自己相鄰（A A）' },
        { kind: 'error', input: '3 1 2\nA B A\nA B\nred green\n', output: 'invalid input\n', note: '區域名稱重複' },
        { kind: 'error', input: '2 1 2\nA B\nA B\nred red\n', output: 'invalid input\n', note: '顏色名稱重複' },
        { kind: 'error', input: '2 1 0\nA B\nA B\n', output: 'invalid input\n', note: '顏色數 k = 0 超出範圍' },
        { kind: 'error', input: '3 2 2\nA B C\nA B\nred green\n', output: 'invalid input\n', note: '少了一行相鄰，記號數與 n、m、k 不符' },
        { kind: 'error', input: '2 1 2\nA B\nA B\nred green blue\n', output: 'invalid input\n', note: '多了一個顏色，記號數與 k 不符' },
        { kind: 'error', input: '2 one 2\nA B\nA B\nred green\n', output: 'invalid input\n', note: '第一行不是三個非負整數' },
        { kind: 'error', input: '2 1 2\nW-A B\nW-A B\nred green\n', output: 'invalid input\n', note: '區域名稱含有英數字以外的字元' },
        { kind: 'error', input: '', output: 'invalid input\n', note: '空白輸入' },
      ],
      hints: [
        '先寫 parse：把所有不合規定的情況都回傳 None。用 `sys.stdin.read().split()` 讀入全部記號，先檢查記號總數是否等於 3 + n + 2m + k。',
        '鄰居用 dict 對應到 set，重複的相鄰對自然只算一次；名稱用 `isascii()` 與 `isalnum()` 檢查。',
        'MRV 的三層決勝可以寫成一個 key：`(len(dom[v]), -未指定鄰居數, v)`，再用 `min` 取最小。',
        '每次嘗試顏色都建立新的值域 dict，回溯時舊的值域不必還原；只有 `del assign[var]` 與回溯次數要處理。',
        '先用澳洲地圖檢查：第一個被選的必須是 SA，而且沒有回溯。',
      ],
      solution: { Python: code`import sys

def parse(tokens):
    if len(tokens) < 3 or not all(t.isdigit() for t in tokens[:3]):
        return None
    n, m, k = map(int, tokens[:3])
    if not (1 <= n <= 20 and 0 <= m <= 60 and 1 <= k <= 6) or len(tokens) != 3 + n + 2 * m + k:
        return None
    names, rest = tokens[3:3 + n], tokens[3 + n:]
    pairs, colours = [rest[2 * i:2 * i + 2] for i in range(m)], rest[2 * m:]
    words = names + colours
    if any(not (w.isascii() and w.isalnum()) for w in words) or len(set(names)) < n or len(set(colours)) < k:
        return None
    nb = {v: set() for v in names}
    for a, b in pairs:
        if a not in nb or b not in nb or a == b:
            return None
        nb[a].add(b)
        nb[b].add(a)
    return names, nb, colours

def solve(names, nb, colours):
    assign, backtracks = {}, 0

    def pick(dom):  # MRV → 未指定鄰居最多（degree）→ 名稱最小
        free = [v for v in names if v not in assign]
        return min(free, key=lambda v: (len(dom[v]), -sum(u not in assign for u in nb[v]), v))

    def search(dom):
        nonlocal backtracks
        if len(assign) == len(names):
            return True
        var = pick(dom)
        for c in dom[var]:  # 值域保持輸入的顏色順序
            new = {v: [x for x in d if x != c] if v in nb[var] and v not in assign else d
                   for v, d in dom.items()}
            new[var] = [c]
            if any(not new[u] for u in nb[var] if u not in assign):
                continue  # 前向檢查失敗：不指定，也不算回溯
            assign[var] = c
            if search(new):
                return True
            del assign[var]
            backtracks += 1
        return False

    found = search({v: list(colours) for v in names})
    return (assign if found else None), backtracks

parsed = parse(sys.stdin.read().split())
if parsed is None:
    print('invalid input')
else:
    names, nb, colours = parsed
    assign, backtracks = solve(names, nb, colours)
    if assign is None:
        print('no solution')
    else:
        for v in names:
            print(v, assign[v])
        print('backtracks', backtracks)` },
      judge: 'none',
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: '澳洲地圖：回溯 + 前向檢查的搜尋樹與值域表', language: 'Python',
    code: TRACE_CODE,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-formulate', prompt: '把澳洲地圖著色（WA、NT、SA、Q、NSW、V、T，相鄰的不同色）寫成 CSP，下列何者正確？',
      options: ['7 個變數、9 條二元限制，限制圖中 SA 的度數 5 最大', '7 個變數、18 條二元限制，因為每對相鄰要寫兩次', '6 個變數，T 沒有鄰居所以不算變數', '7 個變數、9 條二元限制，限制圖中 NSW 的度數最大'],
      answer: 0, explanation: '每個區域是一個變數，共 7 個；每對相鄰區域是一條 ≠ 限制，共 9 條；SA 和 WA、NT、Q、NSW、V 相鄰，度數 5 最大。18 是 AC-3 佇列裡的弧數（每條限制兩個方向），不是限制數；T 沒有鄰居仍要有顏色，它是獨立的子問題，不是可以刪掉的變數；NSW 只和 SA、Q、V 相鄰，度數 3。',
    },
    {
      id: 'q-commute', prompt: 'n 個變數、每個值域 d 個值。若搜尋的每一層都讓「任一個未指定變數 × 任一個值」分支，葉節點有幾個？固定每層只決定一個變數時呢？',
      options: ['兩者都是 d^n', 'n · d 與 d^n', 'n! · d^n 與 d^n', 'd^n 與 n!'],
      answer: 2, explanation: '任選變數時第 k 層有 (n − k) · d 個分支，相乘得 n! · d^n；指定有交換性，固定每層一個變數就只有 d^n 個葉節點，每個完整指定只出現一次。「兩者都是 d^n」忽略了選變數的 n! 種順序；n · d 只是第一層的分支數，不是葉節點數；n! 少了每個變數 d 種值的選擇。',
    },
    {
      id: 'q-fc', prompt: '澳洲地圖從全部 {R, G, B} 開始，依序指定 WA = R、Q = G，每次都做前向檢查。之後 NT 與 SA 的值域是什麼？前向檢查有沒有發現矛盾？',
      options: ['NT = {B}、SA = {B}，前向檢查立刻回報失敗', 'NT = {B}、SA = {B}，前向檢查沒有發現矛盾', 'NT = {G, B}、SA = {G, B}，沒有發現矛盾', 'NT = {B}、SA = {}，前向檢查回報失敗'],
      answer: 1, explanation: 'WA = R 從 NT、SA 刪去 R；Q = G 再從 NT、SA 刪去 G，兩者都剩 {B}。值域都不是空的，前向檢查不會回報失敗；NT 與 SA 相鄰卻只能同色的矛盾，要 AC-3 檢查弧 NT → SA 才看得出來。「立刻回報失敗」把前向檢查當成 AC-3；{G, B} 漏了 Q = G 的刪除；SA = {} 要等真的指定 NT = B 之後才會發生。',
    },
    {
      id: 'q-revise', prompt: '下面的程式印出什麼？',
      code: { language: 'Python', text: code`def revise(dom, x, y):
    keep = [a for a in dom[x] if any(a != b for b in dom[y])]
    removed = len(keep) < len(dom[x])
    dom[x] = keep
    return removed

dom = {'X': ['R', 'G'], 'Y': ['G'], 'Z': ['G', 'B']}
print(revise(dom, 'X', 'Y'), revise(dom, 'Y', 'X'), revise(dom, 'Z', 'Y'), ''.join(dom['X']), ''.join(dom['Z']))` },
      options: ['True True True R B', 'False False True RG B', 'True False False R GB', 'True False True R B'],
      answer: 3, explanation: 'revise(X, Y) 刪掉 X 中在 Y 找不到不同值的值：X 的 G 對上 Y 只有 G，被刪，回傳 True，X 剩 R；Y 的 G 對上 X 的 R 可以搭配，不刪，回傳 False；Z 的 G 對上 Y 的 G 被刪，Z 剩 B，回傳 True。「True True True」以為弧有一個方向一致另一個方向也會刪；「False False True RG B」沒看出 X 的 G 無法搭配；「True False False R GB」漏了 Z 的 G 也只能對上 G。',
    },
    {
      id: 'q-mrv', prompt: '澳洲地圖做前向檢查，只指定了 SA = R。依「MRV，同分比未指定鄰居數，再同分比名稱」的規則，下一個選哪個區域？',
      options: ['NSW', 'NT', 'T', 'WA'],
      answer: 0, explanation: 'SA 的 5 個鄰居值域都剩 {G, B}（2 個），T 仍是 3 個，所以 MRV 在 WA、NT、Q、NSW、V 中選；未指定鄰居數 WA 1、NT 2、Q 2、NSW 2、V 1，NT、Q、NSW 同分；名稱字串比較 NSW 的第二個字元 S 小於 NT 的 T，選 NSW。T 值域最大，MRV 不會先選；WA 只有 1 個未指定鄰居；NT 和 NSW 同分但名稱較大。',
    },
    {
      id: 'q-lcv', prompt: '澳洲地圖做前向檢查，已指定 WA = R、NT = G。輪到 Q 時（值域 {R, B}），最少限制值（LCV）會先試哪個值？',
      options: ['B，因為它讓 Q 的鄰居剩下最多選擇', 'R 與 B 一樣好，依顏色順序先試 R', 'R，因為 Q = B 會刪掉更多值，還會把 SA 的值域清空', 'B，因為要先試最可能失敗的值'],
      answer: 2, explanation: 'Q 的未指定鄰居是 SA（{B}）與 NSW（{R, G, B}）。Q = R 只從 NSW 刪掉 R，共 1 個；Q = B 從 SA 和 NSW 各刪 B，共 2 個，SA 還會變空。LCV 選刪得少的 R。說 B 讓鄰居剩最多選擇，事實正好相反；說兩者一樣好，沒有數刪掉的值；「先試最可能失敗的」是 MRV 選變數的原則，用在值上剛好相反。',
    },
    {
      id: 'q-backtracks', prompt: '下面的一般回溯（不做前向檢查，固定順序）印出什麼？',
      code: { language: 'Python', text: code`NB = {'A': 'BD', 'B': 'ADE', 'C': 'E', 'D': 'ABE', 'E': 'BCD'}
ORDER, COLOURS = 'ABCDE', 'RGB'
assign, backtracks = {}, 0

def backtrack(i):
    global backtracks
    if i == len(ORDER):
        return True
    var = ORDER[i]
    for c in COLOURS:
        if all(assign.get(u) != c for u in NB[var]):
            assign[var] = c
            if backtrack(i + 1):
                return True
            del assign[var]
            backtracks += 1
    return False

backtrack(0)
print(''.join(assign[v] for v in ORDER), backtracks)` },
      options: ['RGGBR 1', 'RGRBG 0', '找不到解，assign[v] 引發 KeyError', 'RGGBR 2'],
      answer: 3, explanation: 'A = R、B = G、C = R、D = B（D 和 A、B 相鄰），這時 E 的鄰居 B、C、D 用了 G、R、B，沒有顏色：回溯 D（第 1 次），D 沒有別的值，再回溯 C = R（第 2 次）。C = G 之後 D = B、E = R 成功，印出 RGGBR 2。「RGGBR 1」漏數了撤銷 C 的那一次；「RGRBG 0」讓 E = G，但 E 和 B（G）相鄰；這張圖可以用三色著色，不會找不到解。',
    },
    {
      id: 'q-arc', prompt: '三個兩兩相鄰的區域 A、B、C，值域都是 {R, G}，限制是相鄰不同色。對它執行 AC-3 會怎樣？',
      options: ['AC-3 會把某個值域清空，證明無解', '每條弧都已一致，AC-3 一個值都不刪；但這個 CSP 無解', 'AC-3 會把每個值域縮成一個值，得到唯一解', 'AC-3 會無窮迴圈，因為弧一直被放回佇列'],
      answer: 1, explanation: '每條弧 X → Y 中，X 的 R 可搭配 Y 的 G、X 的 G 可搭配 Y 的 R，所以 revise 一個值都不刪，AC-3 回報一致；但三個兩兩不同的區域需要三種顏色，實際無解，這說明弧一致只檢查兩兩關係。AC-3 不會清空任何值域，也不會縮成單一值；弧只有在值被刪掉時才放回佇列，沒有刪除就不會再進佇列，一定會停。',
    },
  ],
};
