import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/*
 * AIF03 Intelligent agents (python-code: Python only, standard library). The trace runs TRACE_CODE below.
 * vacuumSteps() applies the same rules as that program (percept = whether the agent's cell is dirty and which of
 * U, R, D, L are not blocked; rule: suck if dirty, otherwise the first open direction in the order R, D, L, U,
 * otherwise N; +10 per cleaned cell, −1 per move), so every grid, mark and variable comes from actually running the
 * rules. The lesson's test runs TRACE_CODE in Python and checks it prints the last step's output.
 */
const WORLD = ['*.#*', '.*..', '#.*.'];
const ORDER = 'RDLU';
const STEP: Record<string, [number, number]> = { U: [-1, 0], R: [0, 1], D: [1, 0], L: [0, -1] };
const DIR_NAMES: Record<string, string> = { U: '上', R: '右', D: '下', L: '左' };
const STEPS = 12;

const TRACE_CODE = code`g = [list("*.#*"), list(".*.."), list("#.*.")]
STEP = {"U": (-1, 0), "R": (0, 1), "D": (1, 0), "L": (0, -1)}

def reflex_agent(dirty, open_dirs):
    if dirty:
        return "S"
    for a in "RDLU":
        if a in open_dirs:
            return a
    return "N"

r, c, score, log = 0, 0, 0, []
for t in range(12):
    dirty = g[r][c] == "*"
    open_dirs = [a for a, (dr, dc) in STEP.items()
                 if 0 <= r + dr < 3 and 0 <= c + dc < 4 and g[r + dr][c + dc] != "#"]
    action = reflex_agent(dirty, open_dirs)
    if action == "S":
        g[r][c] = "."
        score += 10
    elif action != "N":
        r, c = r + STEP[action][0], c + STEP[action][1]
        score -= 1
    log.append(action)
print(" ".join(log))
print("position", r, c, "score", score)`;

function vacuumSteps(): TraceStep[] {
  const g = WORLD.map(row => [...row]);
  const R = g.length, C = g[0].length;
  let r = 0, c = 0, score = 0;
  const log: string[] = [];
  const view = () => g.map((row, i) => row.map((ch, j) => (i === r && j === c ? (ch === '*' ? 'A*' : 'A') : ch)));
  const list = (xs: string[]) => `[${xs.map(x => `'${x}'`).join(', ')}]`;
  const steps: TraceStep[] = [
    { line: 1, note: '3 列 × 4 行的格子世界：`.` 是乾淨的地板，`*` 是灰塵，`#` 是牆。環境有 4 塊灰塵，代理人看不到整張地圖：每一步只感知「所在格髒不髒」與「上、右、下、左哪些方向沒有被擋住」。',
      arrays: [{ name: 'g', cells: g.map(row => [...row]) }] },
    { line: 12, note: '代理人從 (0, 0) 出發，分數 0。格子裡的 A 是代理人的位置，`A*` 表示它站在灰塵上。績效度量寫在程式裡：吸掉一塊灰塵 +10，每移動一格 −1。',
      vars: { r: '0', c: '0', score: '0', log: '[]' }, arrays: [{ name: 'g', cells: view(), marks: [{ at: [0, 0], kind: 'current' }] }] },
  ];
  for (let t = 0; t < STEPS; t++) {
    const dirty = g[r][c] === '*';
    const open = Object.entries(STEP).filter(([, [dr, dc]]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < R && nc >= 0 && nc < C && g[nr][nc] !== '#';
    }).map(([a]) => a);
    const action = dirty ? 'S' : ([...ORDER].find(a => open.includes(a)) ?? 'N');
    const head = `第 ${t + 1} 步（t = ${t}）：感知是「${dirty ? '髒' : '乾淨'}」、可走 ${list(open)}。`;
    let note: string, line: number, mark: [number, number];
    if (action === 'S') {
      g[r][c] = '.'; score += 10; mark = [r, c]; line = 20;
      note = `${head}第一條規則「髒就吸」成立，動作 S：(${r}, ${c}) 變乾淨，分數 +10。`;
    } else if (action !== 'N') {
      const skipped = [...ORDER].slice(0, ORDER.indexOf(action)).map(a => DIR_NAMES[a]);
      const why = skipped.length ? `依順序 R、D、L、U，${skipped.join('、')}被擋住，第一個可走的是${DIR_NAMES[action]}` : '依順序 R、D、L、U，第一個方向右就可以走';
      const from = `(${r}, ${c})`;
      r += STEP[action][0]; c += STEP[action][1]; score -= 1; mark = [r, c]; line = 23;
      note = `${head}所在格乾淨，${why}，動作 ${action}：從 ${from} 移到 (${r}, ${c})，分數 −1。`;
    } else {
      mark = [r, c]; line = 24;
      note = `${head}四個方向都被擋住，動作 N（不動）。`;
    }
    log.push(action);
    if (t === 10) note += '這兩格互相指向對方：在 (2, 2) 時右邊可走就往右，在 (2, 3) 時右、下都出界就往左。代理人沒有記憶，同樣的感知永遠得到同樣的動作，於是開始來回擺盪。';
    steps.push({ line, note, vars: { t: String(t), dirty: dirty ? 'True' : 'False', open_dirs: list(open), action: `"${action}"`, r: String(r), c: String(c), score: String(score) },
      arrays: [{ name: 'g', cells: view(), marks: [{ at: mark, kind: action === 'S' ? 'write' : 'current' }] }] });
  }
  const left: [number, number][] = [];
  g.forEach((row, i) => row.forEach((ch, j) => { if (ch === '*') left.push([i, j]); }));
  const output = `${log.join(' ')}\nposition ${r} ${c} score ${score}`;
  steps.push({ line: 26, note: `${STEPS} 步裡吸了 ${log.filter(a => a === 'S').length} 次、移動 ${log.filter(a => a !== 'S' && a !== 'N').length} 次，分數 ${score}。還剩 ${left.map(([i, j]) => `(${i}, ${j})`).join('、')} 的灰塵：從第 10 步起代理人只在 (2, 2) 與 (2, 3) 之間來回，再多給幾步也到不了那裡。簡單反射代理人沒有內部狀態，這就是它在部分可觀察環境中的限制。`,
    vars: { r: String(r), c: String(c), score: String(score) }, output,
    arrays: [{ name: 'g', cells: view(), marks: [{ at: [r, c], kind: 'current' }, ...left.map(at => ({ at, kind: 'pending' as const }))] }] });
  return steps;
}

/* The 20 × 20 exercise test, from a formula (the Python reference produced its expected output; the test re-runs it). */
const BIG_GRID = Array.from({ length: 20 }, (_, r) =>
  Array.from({ length: 20 }, (_, c) => ((r * 7 + c * 3) % 11 === 0 ? '#' : (r * 5 + c * 2) % 7 === 0 ? '*' : '.')).join('')).join('\n');
/** The reference's first output line on BIG_GRID: 27 actions, then L and R alternate for the remaining 973 steps. */
const BIG_ACTIONS = `actions S R R R D R R R R R S D R S R R R R D R R R R S R D S${' L R'.repeat(486)} L`;

/** AIF03 智慧代理人. Every example and the reference solution run in Python (standard library only). */
export const AIF03: LessonContent = {
  lessonId: 'AIF03',
  motivation: '掃地機器人在客廳裡繞來繞去：它怎麼知道哪裡髒、該往哪走、什麼時候可以回充電座？把 AI 系統看成「代理人」是整個 AI 領域共通的語言：任何系統都可以拆成「它感知到什麼、能做什麼、在什麼環境裡、用什麼標準評分」。這個框架讓我們在寫程式之前先把問題講清楚：同一台機器人，換到有寵物走動的家裡、看不到整張地圖、或者評分改成「省電優先」，該用的設計就完全不同。本課用 PEAS 描述任務、用六種性質分類環境、比較五種代理人類型，最後用 Python 寫一個真的會在格子世界裡吸灰塵的反射型代理人，並親眼看到它為什麼會卡住。',
  sections: [
    {
      id: 'agents-and-environments', title: '代理人與環境',
      blocks: [
        { type: 'p', text: '代理人（agent）是任何透過感測器（sensor）感知環境（environment）、再透過致動器（actuator）對環境採取行動的東西。人用眼睛耳朵感知、用手腳行動；掃地機器人用碰撞與灰塵感測器感知、用輪子與吸塵馬達行動；一支垃圾郵件過濾程式讀進郵件內容、把信移到垃圾郵件匣。代理人在某一刻收到的輸入叫感知（percept），從開始到現在收到的全部感知叫感知序列（percept sequence）。' },
        { type: 'p', text: '描述代理人的行為有兩個層次。代理人函式（agent function）是抽象的對應：每一種可能的感知序列對應到一個動作，概念上可以想成一張無限大的表。代理人程式（agent program）是在實際硬體上執行、用有限的程式碼實作這個函式的程式。設計 AI 的工作，就是寫出一個小而正確的代理人程式，而不是把整張表列出來。' },
        { type: 'list', ordered: true, items: [
          '環境把這一刻的感知交給代理人（例如「我在 A 格，A 格是髒的」）。',
          '代理人程式根據感知（以及它記得的東西）選出一個動作。',
          '致動器執行動作，環境的狀態因此改變，回到第 1 步。',
        ] },
        { type: 'p', text: '最經典的例子是兩格吸塵器世界：只有 A、B 兩格，每格乾淨（Clean）或髒（Dirty）。感知是（位置, 狀態），動作是 Left、Right、Suck。下面的簡單反射代理人規則只有三條：髒就吸；在 A 就往右；在 B 就往左。注意程式把「代理人」與「環境」分開：代理人函式只拿到感知，改變世界的是迴圈裡的環境程式碼。' },
        { type: 'example', id: 'two-square-world' },
        { type: 'p', text: '讀輸出：第 3 步之後兩格都乾淨了，代理人卻還在左右來回。這不是程式錯誤，而是這組規則只看「現在」，沒辦法記得另一格已經乾淨。它算不算好的代理人，要看績效度量怎麼定：只數乾淨格子的話它滿分；每移動一步扣分的話，它就在白白浪費電。' },
        { type: 'callout', tone: 'note', title: '和 AIF01 的關係', text: 'AIF01 談到「理性地行動」是定義 AI 的一種觀點，本課就是把它具體化。PEAS、環境性質與五種代理人類型的分法，沿用 Stuart Russell 與 Peter Norvig 的教科書《Artificial Intelligence: A Modern Approach》，它也是兩格吸塵器世界這個例子的出處。' },
      ],
    },
    {
      id: 'peas', title: 'PEAS：先把任務環境寫清楚',
      blocks: [
        { type: 'p', text: '設計代理人之前，先寫下它的任務環境（task environment）。PEAS 是四個英文字的開頭：Performance measure（績效度量，怎麼評分）、Environment（環境，代理人以外的世界）、Actuators（致動器，代理人能做的事）、Sensors（感測器，代理人能知道的事）。四項缺一項，設計就會出問題：沒寫績效度量，就無法判斷兩個代理人誰比較好；沒寫感測器，就可能寫出依賴「看得到整張地圖」卻根本看不到的程式。' },
        { type: 'table', head: ['代理人', '績效度量（P）', '環境（E）', '致動器（A）', '感測器（S）'], rows: [
          ['掃地機器人', '清掉的灰塵量、清掃覆蓋率、耗電量、不碰壞家具', '地板與地毯、牆壁與家具、樓梯邊緣、走動的人與寵物', '左右驅動輪、主刷與邊刷、吸塵馬達', '碰撞感測器、懸崖感測器、灰塵感測器、輪子編碼器'],
          ['自動駕駛計程車', '安全、準時、合法、乘客舒適、油耗', '道路、其他車輛、行人、天氣、乘客', '方向盤、油門、煞車、方向燈、喇叭', '攝影機、光學雷達（LiDAR）、GPS、速度計、加速度計'],
          ['垃圾郵件過濾器', '攔下的垃圾郵件比例、把正常信誤判為垃圾的比例', '使用者的信箱、寄件者、郵件伺服器', '把信移到垃圾郵件匣、加上標記', '郵件的標頭與內容、使用者的「這不是垃圾郵件」回報'],
        ] },
        { type: 'p', text: '寫 PEAS 時有幾個常見的分類錯誤：灰塵感測器是感測器，不是環境；「清得很乾淨」是績效度量，不是動作；樓梯邊緣是環境的一部分，懸崖感測器才是代理人用來知道它的工具。下面的程式把 PEAS 存成 dict，依排序過的鍵印出，並檢查四項是否齊全；自動駕駛計程車的草稿漏了兩項，程式會直接指出來。' },
        { type: 'example', id: 'peas-table' },
        { type: 'p', text: '`sorted(peas)` 讓輸出不依賴建立 dict 時鍵的順序（掃地機器人的鍵是亂序寫的，輸出仍是字母順序 Actuators、Environment、Performance、Sensors）。`REQUIRED - peas.keys()` 的結果是集合，字串集合的走訪順序會隨 Python 的雜湊種子改變，所以先排序再印。' },
      ],
    },
    {
      id: 'environment-properties', title: '環境的六種性質',
      blocks: [
        { type: 'p', text: '同樣是「掃地」，在看得見整個房間、沒有人走動的模擬器裡，和在真實的家裡，難度差很多。描述環境性質可以讓我們在動手之前就知道哪一類設計有機會、哪一類一定不夠。常用的分類有六個維度，每一個都是兩端對比：' },
        { type: 'list', items: [
          '完全可觀察（fully observable）／部分可觀察（partially observable）：感測器在每一刻是否能取得做決定所需的全部狀態。只看得到所在格的吸塵器是部分可觀察。',
          '確定性（deterministic）／隨機（stochastic）：下一個狀態是否完全由目前狀態與代理人的動作決定。擲骰子、發牌、輪子打滑都讓環境變成隨機。',
          '片段式（episodic）／序列式（sequential）：經驗是否分成互不影響的片段。產線上逐一檢查零件是片段式；下棋與開車是序列式，現在的動作會影響之後的選擇。',
          '靜態（static）／動態（dynamic）：代理人思考時環境會不會改變。環境不變、但思考時間會影響分數的（例如計時的棋局）稱為半動態（semi-dynamic）。',
          '離散（discrete）／連續（continuous）：狀態、時間、感知與動作是有限個不同的值，還是連續的量。棋盤是離散的；車速與方向盤角度是連續的。',
          '單一代理人（single agent）／多代理人（multi-agent）：環境裡是否有其他代理人的行為會影響你的績效，可能是競爭（對手）或合作（車隊互相避讓）。',
        ] },
        { type: 'table', head: ['任務環境', '可觀察性', '確定性', '片段／序列', '靜態／動態', '離散／連續', '代理人數'], rows: [
          ['填字遊戲', '完全', '確定', '序列', '靜態', '離散', '單一'],
          ['計時西洋棋', '完全', '確定', '序列', '半動態', '離散', '多'],
          ['撲克牌', '部分', '隨機', '序列', '靜態', '離散', '多'],
          ['自動駕駛計程車', '部分', '隨機', '序列', '動態', '連續', '多'],
          ['零件分揀機械手臂', '部分', '隨機', '片段', '動態', '連續', '單一'],
          ['本課的格子吸塵世界', '部分', '確定', '序列', '靜態', '離散', '單一'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：部分可觀察不等於隨機', text: '本課的格子世界是確定性的：S 一定把所在格吸乾淨，往沒有牆的方向移動一定成功。但代理人只感知得到所在格，對它來說「隔壁有沒有灰塵」是未知的。看不到造成的不確定是資訊不足，不是環境本身隨機；反過來，看得到全部的環境也可能是隨機的（擲骰子的棋盤遊戲）。這兩個維度要分開判斷，後面的設計也不同：部分可觀察要靠記憶（內部狀態）補足，隨機要靠機率與期望值。' },
        { type: 'p', text: '最難的組合是部分可觀察、隨機、序列、動態、連續、多代理人，真實道路上的駕駛就是這樣。教學與研究常從另一端開始：完全可觀察、確定、靜態、離散、單一代理人，例如 AIF04 與 AIF05 的搜尋問題，再一步步放寬假設。' },
      ],
    },
    {
      id: 'agent-types', title: '五種代理人類型',
      blocks: [
        { type: 'p', text: '代理人程式的設計由簡單到複雜可以分成五類。越往下，代理人需要的知識越多，能應付的環境也越難；但也越難寫、越耗運算。選擇的依據就是上一段的環境性質與 PEAS。' },
        { type: 'table', head: ['類型', '根據什麼選動作', '需要的知識', '例子'], rows: [
          ['簡單反射（simple reflex）', '只看目前的感知，套用條件—動作規則（if 髒 then 吸）', '一組規則', '兩格吸塵器、感應到人就開的自動門'],
          ['模型式反射（model-based reflex）', '目前感知＋內部狀態（記得的事）', '轉移模型（動作與世界怎麼變化）與感測模型（世界怎麼反映在感知上）', '記得去過哪些格子的掃地機器人'],
          ['目標式（goal-based）', '預測動作的結果，選能達成目標的動作序列', '模型＋目標，用搜尋或規劃找出動作', '找出從家到機場的路線的導航'],
          ['效用式（utility-based）', '比較各種結果「有多好」，選期望效用最高的', '模型＋效用函數（utility function）', '在時間、油耗、過路費之間取捨的導航'],
          ['學習型（learning）', '依回饋改進自己的其他部分', '學習元件、表現元件、評論者、問題產生器', '從使用者回報中學會攔截新型垃圾郵件的過濾器'],
        ] },
        { type: 'p', text: '簡單反射代理人只有在「只靠目前的感知就能做出正確決定」時才可靠，也就是環境要完全可觀察。在部分可觀察的環境裡它容易陷入無窮迴圈；隨機挑方向有時能跳出來，但不保證效率。模型式反射代理人多了內部狀態：下面的程式記住自己推算出的位置、去過的格子與走過的路，遇到四周都去過時就原路退回，因此能走遍所有可到達的格子。' },
        { type: 'example', id: 'model-based-agent' },
        { type: 'p', text: '輸出顯示 8 個非牆格子全部去過、3 塊灰塵都清掉，最後回到起點輸出 N。`move` 就是代理人的轉移模型：它假設「往右走一定會到右邊那格」，在這個確定性的世界裡成立；如果輪子會打滑，模型就會和真實位置不一致，需要感測器（例如輪子編碼器或攝影機）來修正。目標式與效用式代理人更進一步，會先在模型中預想動作的後果再決定，那正是之後搜尋課程的主題。學習型代理人則把整個設計拆成四塊：表現元件（performance element）負責選動作，評論者（critic）依固定的績效標準告訴它做得如何，學習元件（learning element）據此修改表現元件，問題產生器（problem generator）建議一些探索性的動作，以獲得新經驗。' },
      ],
    },
    {
      id: 'rationality', title: '理性、全知與績效度量',
      blocks: [
        { type: 'p', text: '理性代理人（rational agent）的定義：對每一種可能的感知序列，根據感知序列提供的證據與代理人內建的知識，選出預期能讓績效度量最大的動作。所以「是否理性」取決於四件事：' },
        { type: 'list', items: [
          '定義成功標準的績效度量（performance measure）。',
          '代理人對環境的先驗知識（例如地圖大小、哪些動作可用）。',
          '代理人能執行的動作。',
          '代理人到目前為止的感知序列。',
        ] },
        { type: 'callout', tone: 'warning', title: '理性不等於全知', text: '全知（omniscience）是知道每個動作的真正結果，現實中不可能做到；理性只要求在已知資訊下讓「期望」績效最大。掃地機器人依照所有感測資料選了最好的路線，卻漏掉地毯下感測器偵測不到的灰塵，它仍然可以是理性的；反過來，靠運氣碰巧清得很乾淨也不代表決策理性。但理性包含「該收集的資訊要收集」：明明可以先用感測器確認卻不看就行動，就不是理性的。' },
        { type: 'p', text: '績效度量應該依照「希望環境變成什麼樣子」來設計，而不是依照「你認為代理人該怎麼做」。如果用「執行 Suck 的次數」評分，一個會把灰塵倒出來再吸回去的代理人分數最高；如果用「移動的格數」評分，代理人會一直亂跑。比較穩妥的是直接量環境的結果，例如每個時間步有幾格是乾淨的，再扣掉耗電。下面在同一個兩格世界、同樣 8 步的條件下，用兩種績效度量比較兩個代理人。' },
        { type: 'example', id: 'compare-measures' },
        { type: 'p', text: 'M1 只數乾淨格子，兩個代理人同分（都是 14）；M2 每移動一次扣 1 分，簡單反射代理人移動了 6 次、模型式代理人只移動 1 次，名次就分出來了。代理人沒變，換一個績效度量，誰比較好的結論就變了；所以說一個代理人「理性」時，一定要說明是針對哪個績效度量。理性代理人也應該有自主性（autonomy）：能從自己的感知與經驗中學習，而不只依賴設計者事先寫好的知識。' },
      ],
    },
    {
      id: 'grid-reflex-agent', title: '格子世界的反射型代理人',
      blocks: [
        { type: 'p', text: '把兩格世界擴大成 R 列 C 行的格子世界：`.` 是乾淨的地板、`*` 是灰塵、`#` 是牆，地圖外也走不出去。代理人每一步的感知只有兩件事：所在格髒不髒（灰塵感測器）、上下左右哪些方向沒有被擋住（碰撞感測器）。規則是明確寫出來的：髒就吸（S）；否則依固定順序試方向，走第一個沒被擋住的（U、D、L、R）；四面都被擋住就不動（N）。' },
        { type: 'table', head: ['PEAS', '格子吸塵世界'], rows: [
          ['績效度量', '每清掉一塊灰塵 +10，每移動一格 −1；S 與 N 不扣分'],
          ['環境', 'R × C 的格子、牆、灰塵；確定性、靜態、離散、單一代理人'],
          ['致動器', '移動 U、D、L、R，吸塵 S，不動 N'],
          ['感測器', '所在格是否有灰塵、四個方向是否被牆或邊界擋住（看不到其他格子）'],
        ] },
        { type: 'p', text: '視覺化用順序 R、D、L、U 跑 12 步，畫出程式真正的狀態：格子 g、位置 (r, c)、感知 dirty 與 open_dirs、選出的動作與分數。它吸掉 3 塊灰塵，但從第 10 步起只在 (2, 2) 與 (2, 3) 之間來回，(0, 3) 的灰塵永遠到不了：兩格的感知固定，動作也就固定，彼此指向對方。上一段的模型式代理人靠記憶避免了這個問題。' },
        { type: 'callout', tone: 'tip', title: '寫練習時把代理人和環境分開', text: '代理人函式只接收感知（所在格是否髒、可走的方向），不要把整張地圖傳給它；更新位置、清掉灰塵、計分都放在環境的迴圈裡。這樣寫出來的才真的是反射代理人，之後要換成模型式或其他規則時，也只需要換掉代理人函式。' },
      ],
    },
  ],
  examples: [
    {
      id: 'two-square-world', title: '兩格吸塵器世界的簡單反射代理人',
      description: '代理人函式只拿到（位置, 狀態），環境迴圈負責改變世界；印出每一步的感知與動作。',
      code: { Python: code`def reflex_vacuum_agent(location, status):
    """簡單反射：只看這一刻的感知 (位置, 狀態)。"""
    if status == "Dirty":
        return "Suck"
    if location == "A":
        return "Right"
    return "Left"

world = {"A": "Dirty", "B": "Dirty"}   # 環境的真實狀態
location = "A"
for step in range(1, 7):
    percept = (location, world[location])   # 感測器只看得到所在的格子
    action = reflex_vacuum_agent(*percept)
    print(step, percept, "->", action)
    if action == "Suck":                    # 致動器改變環境
        world[location] = "Clean"
    elif action == "Right":
        location = "B"
    else:
        location = "A"
print("final", sorted(world.items()))` },
      output: `1 ('A', 'Dirty') -> Suck
2 ('A', 'Clean') -> Right
3 ('B', 'Dirty') -> Suck
4 ('B', 'Clean') -> Left
5 ('A', 'Clean') -> Right
6 ('B', 'Clean') -> Left
final [('A', 'Clean'), ('B', 'Clean')]`,
    },
    {
      id: 'peas-table', title: '用 dict 寫 PEAS 並檢查是否齊全',
      description: '依排序過的鍵印出每一項，並用集合差找出漏寫的項目（排序後再印）。',
      code: { Python: code`REQUIRED = {"Performance", "Environment", "Actuators", "Sensors"}

def print_peas(name, peas):
    print(f"== {name} ==")
    for key in sorted(peas):              # 不依賴建立 dict 的順序
        items = peas[key]
        print(f"{key:<12}({len(items)}) " + "、".join(items))
    missing = sorted(REQUIRED - peas.keys())   # 集合要排序後再印
    print("missing:", ", ".join(missing) if missing else "none")

robot_vacuum = {
    "Sensors": ["碰撞感測器", "懸崖感測器", "灰塵感測器", "輪子編碼器"],
    "Actuators": ["左右驅動輪", "主刷與邊刷", "吸塵馬達"],
    "Performance": ["清掉的灰塵量", "清掃覆蓋率", "耗電量", "不碰壞家具"],
    "Environment": ["地板與地毯", "牆壁與家具", "樓梯邊緣", "走動的人與寵物"],
}
taxi_draft = {
    "Performance": ["安全", "準時", "合法", "乘客舒適"],
    "Environment": ["道路", "其他車輛", "行人", "天氣"],
}
print_peas("掃地機器人", robot_vacuum)
print_peas("自動駕駛計程車（草稿）", taxi_draft)` },
      output: `== 掃地機器人 ==
Actuators   (3) 左右驅動輪、主刷與邊刷、吸塵馬達
Environment (4) 地板與地毯、牆壁與家具、樓梯邊緣、走動的人與寵物
Performance (4) 清掉的灰塵量、清掃覆蓋率、耗電量、不碰壞家具
Sensors     (4) 碰撞感測器、懸崖感測器、灰塵感測器、輪子編碼器
missing: none
== 自動駕駛計程車（草稿） ==
Environment (4) 道路、其他車輛、行人、天氣
Performance (4) 安全、準時、合法、乘客舒適
missing: Actuators, Sensors`,
    },
    {
      id: 'model-based-agent', title: '記得去過哪些格子的模型式代理人',
      description: '內部狀態是推算的位置、去過的格子與走過的路；優先走沒去過的格子，四周都去過就原路退回。',
      code: { Python: code`grid = [list("*.."), list(".#*"), list("*..")]
STEP = {"U": (-1, 0), "R": (0, 1), "D": (1, 0), "L": (0, -1)}
BACK = {"U": "D", "D": "U", "L": "R", "R": "L"}

def open_dirs(r, c):                      # 碰撞感測器：哪些方向不是牆或邊界
    return [a for a, (dr, dc) in STEP.items()
            if 0 <= r + dr < 3 and 0 <= c + dc < 3 and grid[r + dr][c + dc] != "#"]

class ModelBasedAgent:
    def __init__(self):
        self.pos = (0, 0)                 # 內部狀態：自己推算的位置
        self.visited = {(0, 0)}           # 內部狀態：去過的格子
        self.path = []                    # 走過的方向，用來原路退回

    def act(self, dirty, opens):
        if dirty:
            return "S"
        for a in "RDLU":
            nxt = (self.pos[0] + STEP[a][0], self.pos[1] + STEP[a][1])
            if a in opens and nxt not in self.visited:
                self.path.append(a)
                return self.move(a)
        return self.move(BACK[self.path.pop()]) if self.path else "N"

    def move(self, a):                    # 轉移模型：這個動作會讓我到哪裡
        self.pos = (self.pos[0] + STEP[a][0], self.pos[1] + STEP[a][1])
        self.visited.add(self.pos)
        return a

agent, (r, c), log = ModelBasedAgent(), (0, 0), []
for t in range(18):
    action = agent.act(grid[r][c] == "*", open_dirs(r, c))
    if action == "S":
        grid[r][c] = "."
    elif action != "N":
        r, c = r + STEP[action][0], c + STEP[action][1]
    log.append(action)
print(" ".join(log))
print("visited", len(agent.visited), "of 8 open cells; dirt left",
      sum(row.count("*") for row in grid))` },
      output: `S R R D S D L L S U D R R U U L L N
visited 8 of 8 open cells; dirt left 0`,
    },
    {
      id: 'compare-measures', title: '同一個世界、兩種績效度量',
      description: '簡單反射與模型式代理人在同一個兩格世界跑 8 步；M1 只數每步的乾淨格數，M2 再扣掉移動次數。',
      code: { Python: code`def reflex(location, status, memory):
    if status == "Dirty":
        return "Suck"
    return "Right" if location == "A" else "Left"

def model_based(location, status, memory):
    memory[location] = "Clean"            # 這一步之後，所在格一定是乾淨的
    if status == "Dirty":
        return "Suck"
    other = "B" if location == "A" else "A"
    if memory.get(other) == "Clean":      # 記得兩格都乾淨了
        return "NoOp"
    return "Right" if location == "A" else "Left"

def run(agent, steps=8):
    world, location, memory = {"A": "Dirty", "B": "Dirty"}, "A", {}
    clean_points = moves = 0
    for _ in range(steps):
        action = agent(location, world[location], memory)
        if action == "Suck":
            world[location] = "Clean"
        elif action in ("Right", "Left"):
            location = "B" if action == "Right" else "A"
            moves += 1
        clean_points += list(world.values()).count("Clean")
    return clean_points, moves

results = {}
print(f"{'agent':<12}{'moves':>6}{'M1':>4}{'M2':>4}")
for name, agent in [("reflex", reflex), ("model-based", model_based)]:
    points, moves = run(agent)
    results[name] = (points, points - moves)
    print(f"{name:<12}{moves:>6}{points:>4}{points - moves:>4}")
for i, measure in enumerate(["M1", "M2"]):
    a, b = results["reflex"][i], results["model-based"][i]
    print(measure, "tie" if a == b else ("reflex" if a > b else "model-based"))` },
      output: `agent        moves  M1  M2
reflex           6  14   8
model-based      1  14  13
M1 tie
M2 model-based`,
    },
  ],
  visualization: {
    kind: 'array-index', title: '反射型吸塵代理人在 3 × 4 格子世界中的 12 步', language: 'Python',
    code: TRACE_CODE,
    steps: vacuumSteps(),
  },
  quiz: [
    {
      id: 'q1', prompt: '為掃地機器人寫 PEAS 時，下面哪一個分類是錯的？',
      options: ['績效度量：清掉的灰塵量與耗電量', '致動器：驅動輪與吸塵馬達', '感測器：懸崖感測器與碰撞感測器', '環境：灰塵感測器與地板'],
      answer: 3, explanation: '灰塵感測器是代理人用來知道哪裡髒的工具，屬於感測器（S），不是環境；地板才是環境（E）的一部分，所以第四個分類錯了。清掉的灰塵量與耗電量是外部用來評分的標準，屬於績效度量；驅動輪與吸塵馬達是代理人改變世界的方式，屬於致動器；懸崖與碰撞感測器讓代理人知道環境的狀況，屬於感測器，這三個都分類正確。',
    },
    {
      id: 'q2', prompt: '德州撲克（每位玩家有兩張只有自己看得到的底牌，牌由洗過的牌堆發出）的任務環境，下列哪個描述正確？',
      options: ['完全可觀察、確定、單一代理人', '部分可觀察、隨機、多代理人', '部分可觀察、確定、單一代理人', '完全可觀察、隨機、多代理人'],
      answer: 1, explanation: '看不到對手的底牌，所以是部分可觀察；發牌來自洗過的牌堆，下一張牌不由目前狀態與自己的動作決定，所以是隨機；桌上有其他玩家的決策影響你的輸贏，所以是多代理人。第一個選項三項都錯；第三個把發牌當成確定、又忽略了對手；第四個以為看得到所有牌，忽略了隱藏的底牌。',
    },
    {
      id: 'q3', prompt: '下面的兩格吸塵器程式從 B 出發，A 髒、B 乾淨。它輸出什麼？',
      code: { language: 'Python', text: 'def agent(location, status):\n    if status == "Dirty":\n        return "Suck"\n    return "Right" if location == "A" else "Left"\n\nworld = {"A": "Dirty", "B": "Clean"}\nlocation, log = "B", []\nfor _ in range(4):\n    action = agent(location, world[location])\n    log.append(action)\n    if action == "Suck":\n        world[location] = "Clean"\n    else:\n        location = "B" if action == "Right" else "A"\nprint(" ".join(log))' },
      options: ['Left Suck Right Left', 'Left Suck NoOp NoOp', 'Suck Left Suck Right', 'Right Suck Left Right'],
      answer: 0, explanation: '第 1 步在 B、乾淨，規則給 Left，移到 A；第 2 步 A 是髒的，Suck；第 3 步 A 已乾淨，給 Right 回到 B；第 4 步 B 乾淨，再給 Left。輸出 Left Suck Right Left。選 NoOp 的是以為代理人知道兩格都乾淨就會停，但簡單反射代理人沒有記憶，也沒有 NoOp 規則；第三個選項以為它先在 B 吸塵，但 B 本來就乾淨；第四個把 B 的方向弄反了，在 B 只能往左。',
    },
    {
      id: 'q4', prompt: '下列哪個情境最需要模型式反射代理人（有內部狀態），而不是簡單反射代理人？',
      options: ['自動門：感應到有人靠近就開門', '恆溫器：室溫低於 20 °C 就開暖氣', '只感測得到所在格髒不髒的掃地機器人，要避免一直繞同一區並找出還沒去過的格子', '交通號誌前的駕駛規則：看到紅燈就停車'],
      answer: 2, explanation: '掃地機器人只看得到所在格，是部分可觀察；「哪些格子還沒去過」不在目前的感知裡，必須靠記憶（內部狀態）推算，簡單反射代理人在這裡會像本課的視覺化一樣來回擺盪。自動門、恆溫器與看到紅燈就停，都是目前的感知就足以做出正確決定，用條件—動作規則即可，不需要記住過去。',
    },
    {
      id: 'q5', prompt: '掃地機器人根據所有感測資料，選了預期清得最多的路線，但地毯下有一塊它的感測器偵測不到的灰塵沒有清到。下列哪個說法正確？',
      options: ['它不理性，因為理性代理人應該清掉所有灰塵', '它仍可能是理性的：理性是依已知的感知與知識讓期望績效最大，不要求全知', '只要最後結果不好，就證明當初的決定不理性', '理性與績效度量無關，只看代理人有沒有照規則行動'],
      answer: 1, explanation: '理性的定義是根據感知序列與內建知識，選出期望績效最大的動作；偵測不到的灰塵超出它能知道的範圍，要求清到就是要求全知（omniscience）。第一個與第三個選項都把「結果好」當成「決策理性」，忽略了理性是以當時能取得的資訊評斷；第四個錯在理性一定是相對於某個績效度量來說的。',
    },
    {
      id: 'q6', prompt: '要評估掃地機器人，下列哪個績效度量最不容易被代理人「鑽漏洞」？',
      options: ['每個時間步數一次地板上乾淨的格子並加總，再扣掉耗電量', '每執行一次吸塵動作加 1 分', '每移動一格加 1 分', '機器人每回報一次「已清乾淨」加 1 分'],
      answer: 0, explanation: '第一個度量直接量「希望環境變成什麼樣子」（地板乾淨的程度與時間），再為耗電扣分，代理人只有真的把地板清乾淨才能得分。吸塵次數加分會讓「把灰塵倒出來再吸回去」得到最高分；移動加分會讓代理人一直亂跑；自己回報的次數完全不檢查環境，代理人只要一直回報就好。',
    },
    {
      id: 'q7', prompt: '在本課視覺化的世界裡（順序 R、D、L、U），代理人從第 10 步起在 (2, 2) 與 (2, 3) 之間來回。如果把 12 步改成 112 步，(0, 3) 的灰塵會被清掉嗎？',
      options: ['會，步數夠多就一定能走遍所有格子', '會，因為多走的步數裡環境會隨機把代理人推到別處', '不會，因為 (0, 3) 是牆，那裡根本沒有灰塵', '不會：同一格的感知不變，動作就不變，兩格互相指向對方，形成無窮迴圈'],
      answer: 3, explanation: '簡單反射代理人的動作只由目前的感知決定。在 (2, 2) 感知是乾淨、右邊可走，所以往右；在 (2, 3) 右與下都出界，往左。兩格的感知永遠相同，所以永遠來回，以 112 步執行程式，(0, 3) 仍是 `*`。步數多不保證走遍；這個環境是確定性的，不會把代理人推走；(0, 3) 在地圖上是 `*`，是灰塵而不是牆。',
    },
    {
      id: 'q8', prompt: '導航系統要在「最快」、「最省油」、「最少過路費」之間取捨，替每條候選路線算出一個綜合分數，再選分數最高的。這最接近哪一種代理人？',
      options: ['簡單反射代理人', '目標式代理人', '效用式代理人', '只有內部狀態的模型式反射代理人'],
      answer: 2, explanation: '用一個函數衡量結果「有多好」並選出最高者，就是效用式代理人的效用函數。目標式代理人只區分「到得了／到不了目的地」，無法比較兩條都到得了的路線哪條較好；簡單反射代理人不預想動作的結果；模型式反射代理人雖然有內部狀態，但仍是依規則反應，不會比較各種結果的好壞。',
    },
  ],
  exercises: [
    {
      id: 'grid-reflex-vacuum', title: '格子世界的反射型吸塵代理人',
      statement: '模擬一個簡單反射型吸塵代理人。地圖有 R 列 C 行，`.` 是乾淨的地板、`*` 是灰塵、`#` 是牆；代理人從 (sr, sc) 出發，執行剛好 T 步。每一步代理人只感知「所在格是否有灰塵」與「上（U）、下（D）、左（L）、右（R）四個方向中哪些沒有被擋住」（下一格在地圖內且不是牆才算沒被擋住），並依下列規則選一個動作：(1) 所在格有灰塵就吸（S），該格變成乾淨；(2) 否則依輸入給的方向順序，往第一個沒被擋住的方向移動一格；(3) 四個方向都被擋住就不動（N）。績效度量：每清掉一塊灰塵 +10 分，每移動一格 −1 分，S 與 N 不扣分。輸出動作序列、最後的位置、清掉的灰塵數，以及分數。代理人沒有記憶，可能在兩格之間來回，這是預期的行為，照規則模擬即可。輸入不合法時只輸出 `Invalid`。',
      inputFormat: '第一行兩個整數 R C。接下來 R 行，每行是一個長度剛好為 C、只含 `.`、`*`、`#` 的字串。下一行兩個整數 sr sc（起點的列與行，從 0 開始）。下一行是方向順序：U、D、L、R 四個大寫字母各出現一次的字串。最後一行是一個整數 T（步數）。',
      outputFormat: '四行：`actions` 後接 T 個以空白分隔的動作（S、U、D、L、R、N；T = 0 時這一行只有 `actions`）；`position r c` 是最後的位置；`cleaned k of d`，k 是清掉的灰塵數、d 是一開始的灰塵總數；`score x` 是分數。輸入不合法時只輸出一行 `Invalid`。',
      constraints: [
        '1 ≤ R ≤ 20，1 ≤ C ≤ 20，0 ≤ T ≤ 1000；所有整數都是十進位非負整數（否則輸出 Invalid）',
        '剛好 R 行地圖，每行長度剛好是 C，只含 `.`、`*`、`#`（否則輸出 Invalid）',
        '0 ≤ sr < R、0 ≤ sc < C，而且起點不是牆（否則輸出 Invalid）；起點可以有灰塵',
        '方向順序必須是 U、D、L、R 的一個排列，區分大小寫（否則輸出 Invalid）',
      ],
      samples: [{ kind: 'normal', input: '2 3\n*.*\n.#.\n0 0\nRDLU\n6\n', output: 'actions S R R S D U\nposition 0 2\ncleaned 2 of 2\nscore 16\n', note: '吸、右、右、吸，然後在 (0, 2) 與 (1, 2) 之間上下來回：20 − 4 = 16' }],
      tests: [
        { kind: 'normal', input: '3 4\n*.#*\n.*..\n#.*.\n0 0\nRDLU\n12\n', output: 'actions S R D S R R D L S R L R\nposition 2 3\ncleaned 3 of 4\nscore 21\n', note: '與視覺化相同的世界：第 10 步起在 (2, 2) 與 (2, 3) 之間來回，(0, 3) 的灰塵清不到' },
        { kind: 'normal', input: '3 4\n*.#*\n.*..\n#.*.\n0 0\nDRUL\n12\n', output: 'actions S D R S D R S R U D U D\nposition 2 3\ncleaned 3 of 4\nscore 21\n', note: '同一個世界換成順序 D、R、U、L：動作序列完全不同，仍然清不到 (0, 3)' },
        { kind: 'normal', input: '4 5\n.*..*\n.##..\n*..#*\n..*..\n3 0\nURDL\n30\n', output: 'actions U S U U R S R R R S D U D U D U D U D U D U D U D U D U D U\nposition 0 4\ncleaned 3 of 5\nscore 3\n', note: '有牆的 4 × 5 地圖，先試上：清掉 3 塊後在右上角上下擺盪，移動扣分讓分數只剩 3' },
        { kind: 'edge', input: '3 4\n*.#*\n.*..\n#.*.\n1 1\nRDLU\n0\n', output: 'actions\nposition 1 1\ncleaned 0 of 4\nscore 0\n', note: 'T = 0：一步都不做，即使起點有灰塵也不吸；動作行只有 actions' },
        { kind: 'edge', input: '1 1\n*\n0 0\nUDLR\n3\n', output: 'actions S N N\nposition 0 0\ncleaned 1 of 1\nscore 10\n', note: '1 × 1 地圖：吸掉起點的灰塵後四面都是邊界，只能不動（N 不扣分）' },
        { kind: 'edge', input: '1 4\n....\n0 0\nLRUD\n5\n', output: 'actions R L R L R\nposition 0 1\ncleaned 0 of 0\nscore -5\n', note: '沒有灰塵：只有移動扣分，分數是負的；左邊出界所以先往右，之後左右來回' },
        { kind: 'edge', input: '3 3\n###\n#*#\n###\n1 1\nRDLU\n4\n', output: 'actions S N N N\nposition 1 1\ncleaned 1 of 1\nscore 10\n', note: '起點四面都是牆：吸完就一直不動' },
        { kind: 'edge', input: '2 2\n*#\n**\n0 0\nRDLU\n6\n', output: 'actions S D S R S L\nposition 1 0\ncleaned 3 of 3\nscore 27\n', note: '第一個方向 R 是牆，要跳過它改走 D；每塊灰塵都要等走到才吸' },
        { kind: 'edge', input: `20 20\n${BIG_GRID}\n1 1\nRDLU\n1000\n`, output: `${BIG_ACTIONS}\nposition 5 18\ncleaned 5 of 54\nscore -945\n`, note: '最大的 20 × 20 地圖與 T = 1000：清掉 5 塊後一直左右擺盪，分數 50 − 995 = −945' },
        { kind: 'error', input: '2 3\n*.#\n...\n0 2\nRDLU\n5\n', output: 'Invalid\n', note: '起點 (0, 2) 是牆' },
        { kind: 'error', input: '2 3\n*..\n...\n0 0\nRRDL\n5\n', output: 'Invalid\n', note: '方向順序重複 R、缺 U，不是四個方向的排列' },
        { kind: 'error', input: '2 3\n*..\n...\n0 0\nrdlu\n5\n', output: 'Invalid\n', note: '小寫的方向字母不合法（區分大小寫）' },
        { kind: 'error', input: '2 3\n*..\n....\n0 0\nRDLU\n5\n', output: 'Invalid\n', note: '第二行地圖長度是 4，不是 C = 3' },
        { kind: 'error', input: '2 3\n*x.\n...\n0 0\nRDLU\n5\n', output: 'Invalid\n', note: '地圖出現 `.`、`*`、`#` 以外的字元' },
        { kind: 'error', input: '2 3\n*..\n...\n0 0\nRDLU\n-1\n', output: 'Invalid\n', note: '步數是負數' },
        { kind: 'error', input: '2 3\n*..\n...\n0 0\nRDLU\n1001\n', output: 'Invalid\n', note: '步數超過上限 1000' },
        { kind: 'error', input: '2 3\n*..\n...\n2 0\nRDLU\n5\n', output: 'Invalid\n', note: '起點的列 2 超出地圖（只有 0～1）' },
        { kind: 'error', input: '2 3\n*..\n...\n0 0\nRDLU\n', output: 'Invalid\n', note: '少了最後一行的步數' },
        { kind: 'error', input: '0 3\n0 0\nRDLU\n5\n', output: 'Invalid\n', note: 'R = 0：地圖至少要有一列' },
        { kind: 'error', input: '', output: 'Invalid\n', note: '完全沒有輸入' },
      ],
      hints: [
        '先把輸入全部讀成 token（`sys.stdin.read().split()`），檢查 token 數是否剛好是 R + 6，再逐項驗證；任何一項不合法就只印 `Invalid`，不要印出模擬到一半的結果。',
        '寫一個 `reflex_agent(dirty, open_dirs, order)`，只接收感知；位置、地圖與分數由主迴圈（環境）更新。',
        '`open_dirs` 的判斷要先檢查在地圖內（`0 <= nr < R and 0 <= nc < C`），再讀 `grid[nr][nc]`，避免負數索引在 Python 中繞回最後一列。',
        '動作行用 `" ".join(["actions"] + actions)`，T = 0 時就不會有行尾空白。',
      ],
      solution: { Python: code`import sys

STEP = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}

def number(token, low, high):
    if not (token.isascii() and token.isdigit()) or not low <= int(token) <= high:
        raise ValueError(token)
    return int(token)

def read_world(tokens):
    rows, cols = number(tokens[0], 1, 20), number(tokens[1], 1, 20)
    if len(tokens) != rows + 6:
        raise ValueError("token count")
    grid = [list(row) for row in tokens[2:2 + rows]]
    if any(len(row) != cols or set(row) - set(".*#") for row in grid):
        raise ValueError("grid")
    r, c = number(tokens[rows + 2], 0, rows - 1), number(tokens[rows + 3], 0, cols - 1)
    order, steps = tokens[rows + 4], number(tokens[rows + 5], 0, 1000)
    if grid[r][c] == "#" or sorted(order) != sorted("UDLR"):
        raise ValueError("start or order")
    return grid, r, c, order, steps

def reflex_agent(dirty, open_dirs, order):
    if dirty:
        return "S"
    for a in order:
        if a in open_dirs:
            return a
    return "N"

def main():
    tokens = sys.stdin.read().split()
    try:
        grid, r, c, order, steps = read_world(tokens)
    except (ValueError, IndexError):
        print("Invalid")
        return
    rows, cols = len(grid), len(grid[0])
    dirt = sum(row.count("*") for row in grid)
    actions, cleaned, moves = [], 0, 0
    for _ in range(steps):
        open_dirs = {a for a, (dr, dc) in STEP.items()
                     if 0 <= r + dr < rows and 0 <= c + dc < cols and grid[r + dr][c + dc] != "#"}
        action = reflex_agent(grid[r][c] == "*", open_dirs, order)
        if action == "S":
            grid[r][c] = "."
            cleaned += 1
        elif action != "N":
            r, c = r + STEP[action][0], c + STEP[action][1]
            moves += 1
        actions.append(action)
    print(" ".join(["actions"] + actions))
    print("position", r, c)
    print("cleaned", cleaned, "of", dirt)
    print("score", 10 * cleaned - moves)

main()` },
      judge: 'none',
    },
  ],
};
