import type { LessonContent, TraceStep } from '../schema';

const code = String.raw;

/*
 * The trace runs the Python program below. robotSteps() applies the same rules as that program (direction arrays
 * 0 up, 1 right, 2 down, 3 left; L = (d + 3) % 4, R = (d + 1) % 4; a move is ignored when the next cell is outside the
 * map or a wall), so every grid, mark and variable comes from actually running the rules, not from typing grids.
 */
const MAP = ['....#', '.#...', '...#.', '.....'];
const COMMANDS = 'FFFFRFFLFF';
const DIR_NAMES = ['上', '右', '下', '左'];
const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];

function robotSteps(): TraceStep[] {
  const R = MAP.length, C = MAP[0].length;
  let r = 0, c = 0, d = 1, walls = 0, edges = 0;
  const grid = () => MAP.map((row, i) => [...row].map((ch, j) => (i === r && j === c ? 'R' : ch)));
  const dir = (k: number) => `${k}（${DIR_NAMES[k]}）`;
  const steps: TraceStep[] = [
    { line: 1, note: '4 列 × 5 行的地圖：`.` 是空地，`#` 是牆。規則：F 往目前方向走一格，L、R 原地左轉、右轉；走出地圖或撞牆的移動直接忽略。',
      arrays: [{ name: 'g', cells: MAP.map(row => [...row]) }] },
    { line: 4, note: '狀態只有三個量：位置 (r, c) 與方向 d。d 是方向陣列的索引，0 上、1 右、2 下、3 左；機器人從 (0, 0) 出發、面向右。格子裡的 R 表示機器人所在的位置（地圖 g 本身沒有改變）。',
      vars: { r: '0', c: '0', d: dir(1) }, arrays: [{ name: 'g', cells: grid(), marks: [{ at: [0, 0], kind: 'read' }] }] },
  ];
  for (const [i, cmd] of [...COMMANDS].entries()) {
    const head = `第 ${i + 1} 個指令 ${cmd}：`;
    if (cmd === 'L' || cmd === 'R') {
      const before = d;
      d = cmd === 'L' ? (d + 3) % 4 : (d + 1) % 4;
      const why = cmd === 'L'
        ? '左轉寫成 `(d + 3) % 4`：等於減 1，但永遠不會出現負數（C++／Java 的 `(0 - 1) % 4` 是 −1）。'
        : '右轉是 `(d + 1) % 4`：3（左）之後回到 0（上）。';
      steps.push({ line: cmd === 'L' ? 7 : 9, note: `${head}d 從 ${dir(before)}變成 ${dir(d)}，位置不動。${why}`,
        vars: { cmd: `"${cmd}"`, r: String(r), c: String(c), d: dir(d) }, arrays: [{ name: 'g', cells: grid() }] });
      continue;
    }
    const nr = r + DR[d], nc = c + DC[d];
    const inside = nr >= 0 && nr < R && nc >= 0 && nc < C;
    const vars = (): Record<string, string> => ({ cmd: `"${cmd}"`, r: String(r), c: String(c), d: dir(d), nr: String(nr), nc: String(nc) });
    if (inside && MAP[nr][nc] !== '#') {
      r = nr; c = nc;
      steps.push({ line: 13, note: `${head}往${DIR_NAMES[d]}的下一格是 (${nr}, ${nc})，在地圖內也不是牆，三個條件都成立，機器人移過去。`,
        vars: vars(), arrays: [{ name: 'g', cells: grid(), marks: [{ at: [nr, nc], kind: 'read' }] }] });
    } else if (inside) {
      walls++;
      steps.push({ line: 12, note: `${head}下一格 (${nr}, ${nc}) 在地圖內，但 g[${nr}][${nc}] 是牆 #。依規則撞牆的移動忽略，位置不變，這個指令就結束了。`,
        vars: vars(), arrays: [{ name: 'g', cells: grid(), marks: [{ at: [nr, nc], kind: 'bad' }] }] });
    } else {
      edges++;
      steps.push({ line: 12, note: `${head}下一格 (${nr}, ${nc}) 超出地圖（列 0～${R - 1}、行 0～${C - 1}）。\`and\` 由左而右短路求值，邊界條件不成立就不會執行 \`g[nr][nc]\`，所以不會越界；這一步被忽略。`,
        vars: vars(), arrays: [{ name: 'g', cells: grid(), marks: [{ at: [nr, nc], kind: 'bad' }] }] });
    }
  }
  steps.push({ line: 14, note: `${COMMANDS.length} 個指令中有 ${walls + edges} 次移動被擋下（撞牆 ${walls} 次、出界 ${edges} 次）。最後停在 (${r}, ${c})，面向 ${dir(d)}，印出 \`${r} ${c} ${d}\`。`,
    vars: { r: String(r), c: String(c), d: dir(d) }, output: `${r} ${c} ${d}`, arrays: [{ name: 'g', cells: grid(), marks: [{ at: [r, c], kind: 'found' }] }] });
  return steps;
}

/* Exercise worst cases, generated here (the same formulas produced the expected outputs with the Python reference). */
const BIG_MAP = Array.from({ length: 100 }, (_, r) =>
  Array.from({ length: 100 }, (_, c) => ((r * 7 + c * 13) % 11 === 5 ? '#' : '.')).join('')).join('\n');
const EMPTY_MAP = Array.from({ length: 100 }, () => '.'.repeat(100)).join('\n');
/** 10^5 pseudo-random commands (about 60% F) from a small linear congruential generator. */
const RANDOM_COMMANDS = (() => {
  let x = 1, s = '';
  for (let i = 0; i < 100000; ++i) { x = (x * 75 + 74) % 65537; s += 'FFFLR'[x % 5]; }
  return s;
})();

/** A02 Simulation. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const A02: LessonContent = {
  lessonId: 'A02',
  motivation: '很多題目沒有聰明的公式，只有一套清楚的規則：機器人照指令在地圖上走、紅綠燈每秒變化時車子排隊通過、細胞依鄰居的數量決定下一代的生死。模擬（simulation）就是把規則忠實地寫成程式，一步一步執行，最後回答「結束時是什麼樣子」。APCS 的實作題常常是這一類：難的不是演算法，而是把狀態設計對、規則套用的順序寫對、邊界一格都不漏。模擬也有限制：它的時間是「步數 × 每步成本」，步數多到 10^9 以上時，一步一步走會太慢，需要找規律（例如狀態重複的週期）或一次算一大段，這些留給之後的課程。',
  sections: [
    {
      id: 'state-and-rules', title: '把規則變成狀態與更新步驟',
      blocks: [
        { type: 'p', text: '寫模擬之前先回答三個問題。第一，狀態（state）是什麼：哪些量能完整描述「這一刻的世界」，知道它們就能算出下一刻？第二，每一步（tick）改變什麼：一秒、一個指令或一代，哪些量會更新？第三，同一步裡的規則依什麼順序套用？三個答案都寫在紙上，程式只是把它們翻譯出來。' },
        { type: 'table', head: ['題目', '狀態', '一步是什麼', '同一步內的順序'], rows: [
          ['機器人走地圖', '位置 (r, c)、方向 d', '一個指令', '算出下一格 → 檢查邊界 → 檢查牆 → 移動'],
          ['紅綠燈與排隊', '時間 t、等待的車（佇列）', '一秒', '先讓這一秒抵達的車排隊，再看燈號讓隊首通過'],
          ['生命遊戲', '整張格子', '一代', '每一格都用「上一代」的鄰居計算'],
        ] },
        { type: 'p', text: '狀態要「剛好夠」：少了會算不出下一步（只記位置、不記方向，就不知道 F 要往哪走），多了容易忘記同步更新（同時存了「位置」和「走過的步數」，兩個就得一起改）。下面的紅綠燈例子：綠燈 2 秒、紅燈 3 秒，週期 5 秒，第 t 秒是綠燈若且唯若 `t % 5 < 2`；綠燈的每一秒最多讓隊首一台車通過。' },
        { type: 'example', id: 'traffic-light' },
        { type: 'p', text: '逐秒追蹤：第 0 秒兩台車抵達，綠燈讓 0 號車通過；第 1 秒 2、3 號抵達，1 號通過，隊伍剩 3 台（最長的時候）；第 2～4 秒紅燈，期間 4 號抵達；第 5、6 秒綠燈讓 2、3 號通過，5 號在第 6 秒抵達；第 7～9 秒紅燈；第 10、11 秒 4、5 號通過。輸出 `0 1 5 6 10 11`。' },
        { type: 'p', text: '同一秒內的順序會改變答案。本例是「先抵達、再通過」，所以 0 號車在第 0 秒抵達、當秒就能通過。如果規則寫成「先通過、再抵達」，第 0 秒佇列是空的，沒有車通過，0 號車要等到第 1 秒。兩種都是合理的題目，但只有一種是這一題：讀題時要找出「同一時刻」的描述，寫成固定的順序，並在程式裡用註解標出「規則 1」「規則 2」。' },
        { type: 'p', text: '迴圈什麼時候停也是規則的一部分：本例在所有車都通過時結束（`done` 等於車數），而不是跑固定的秒數；車的抵達時間已排序，所以用一個指標 `i` 依序取出「這一秒抵達的車」就好。' },
      ],
    },
    {
      id: 'grid-moves', title: '二維格子上的移動：方向陣列與邊界檢查',
      blocks: [
        { type: 'p', text: '接續 F12 的方向陣列：`dr = [-1, 0, 1, 0]`、`dc = [0, 1, 0, -1]`，索引 0 上、1 右、2 下、3 左，依順時針排列。這樣排有一個好處：右轉就是 d 加 1、左轉就是 d 減 1（都對 4 取餘數），轉向不必寫四段 if。往前走一格就是 `nr = r + dr[d]`、`nc = c + dc[d]`。' },
        { type: 'p', text: '移動的標準順序：先算出下一格 (nr, nc)，再檢查它是否在地圖內（`0 <= nr < R` 而且 `0 <= nc < C`），在地圖內才讀 `g[nr][nc]` 看是不是牆，全部通過才把 (r, c) 改成 (nr, nc)。邊界檢查一定要寫在讀格子之前，並利用 `&&`／`and` 的短路求值（short-circuit evaluation）：前面的條件不成立，後面的 `g[nr][nc]` 根本不會執行。' },
        { type: 'example', id: 'robot-walk' },
        { type: 'p', text: '這段程式和下方的視覺化是同一張地圖、同一串指令。第 4 個 F 想走到 (0, 4)，那是牆；右轉後第 2 個 F 想走到 (2, 3)，也是牆；最後一個 F 想走到 (1, 5)，超出 5 行的地圖。三次都被忽略，`blocked` 計為 3，機器人停在 (1, 4)、面向東（E）。' },
        { type: 'callout', tone: 'warning', title: '越界不一定會報錯：三種語言的行為不同', text: '先讀格子再檢查邊界，或乾脆忘了檢查，三種語言的結果完全不同。C++ 的 `g[r][c]` 越界是未定義行為（undefined behavior）：可能讀到垃圾值、可能當掉，也可能「看起來正常」，最危險（`.at()` 會丟出 `std::out_of_range`，但很少人用）。Java 會丟出 `ArrayIndexOutOfBoundsException`（字串的 `charAt` 是 `StringIndexOutOfBoundsException`），至少會停下來。Python 的索引大於等於長度會丟出 `IndexError`，但負數索引是合法的：`g[-1]` 是最後一列，機器人從第 0 列往上走會悄悄讀到地圖最下面那一列，程式不報錯、答案卻錯了。所以 Python 一定要寫完整的下界 `0 <= nr`。' },
        { type: 'p', text: '另一種常見做法是在地圖外圍加一圈牆（哨兵，sentinel）：把 R × C 的地圖放進 (R + 2) × (C + 2) 的陣列，第 0 列、最後一列、第 0 行、最後一行都填 `#`。機器人永遠走不出去，也就不需要邊界檢查；代價是座標都要加 1，輸出時記得減回來。' },
      ],
    },
    {
      id: 'sync-update', title: '同步更新與即時更新',
      blocks: [
        { type: 'p', text: '當「每一格的新值取決於鄰居的舊值」時，要分清楚兩種寫法。同步更新（synchronous update）：所有格子都根據「上一代」計算，結果寫到另一張新表，算完整張再換過去。即時更新（in-place update）：直接改原本那張表，後面的格子讀到的鄰居可能已經是新值。題目說「同時」「下一秒每一格」「下一代」時，幾乎都是同步更新。' },
        { type: 'p', text: '生命遊戲（Conway\'s Game of Life）的規則：每一格看周圍 8 格中活細胞的數量 n；活細胞在 n 為 2 或 3 時存活，否則死亡；死細胞在 n 剛好為 3 時誕生。地圖外的格子當作死細胞。下面把直的三格（閃爍子 blinker）分別用兩種方式更新一代。' },
        { type: 'example', id: 'life-step' },
        { type: 'p', text: '同步更新得到正確答案：中間那格有 2 個鄰居而存活，上下兩格只有 1 個鄰居而死亡，(2, 1) 和 (2, 3) 各有 3 個鄰居而誕生，直的變成橫的。即時更新照列優先的順序改：先處理到 (1, 2)，它只有 1 個鄰居，立刻被改成死；接著處理 (2, 1) 時，它的鄰居 (1, 2) 已經是「新的死」，只剩 2 個活鄰居，沒有誕生；(2, 2) 也只剩 1 個鄰居而死亡……一路錯下去，最後整張表都死了。錯誤會沿著掃描方向擴散，所以換一個掃描順序，錯誤的結果也會不同。' },
        { type: 'callout', tone: 'warning', title: '「複製一份」不一定真的複製了', text: '同步更新需要兩張表。Python 的 `new = g` 只是讓兩個名字指向同一個 list，不是複製；要寫 `new = [row[:] for row in g]`（每列是字串時 `g[:]` 就夠，因為字串不能被修改）。Java 的 `char[][] b = a.clone()` 是淺複製（shallow copy），只複製外層，每一列仍然共用，改 `b[0][0]` 也會改到 `a[0][0]`；要逐列 `a[i].clone()`。C++ 的 `std::vector<std::string> next = start;` 會完整複製每一列，沒有這個問題。' },
        { type: 'p', text: '即時更新也有正確的時候：機器人走地圖只有一個會動的東西，改位置不會影響「別人」的計算；1 維的前綴和 `a[i] += a[i - 1]` 故意讓後面讀到新值。判斷方法是問：「這一步要用的值，是這一步開始時的舊值，還是已經更新過的新值？」需要舊值就得另存一份。' },
      ],
    },
    {
      id: 'turn-wrap-stop', title: '轉向、環繞與停止規則',
      blocks: [
        { type: 'p', text: '轉向（turn）：方向用 0～3 的整數表示，右轉 `d = (d + 1) % 4`，左轉 `d = (d + 3) % 4`，迴轉 `d = (d + 2) % 4`。不要寫 `(d - 1) % 4`：Python 的 `%` 結果和除數同號，`(0 - 1) % 4` 是 3，正確；C++ 與 Java 的 `%` 結果和被除數同號，`(0 - 1) % 4` 是 −1，拿去當索引 `dr[-1]` 在 C++ 是未定義行為、在 Java 會丟出例外。Java 可以用 `Math.floorMod(d - 1, 4)`，但 `(d + 3) % 4` 三種語言都正確。' },
        { type: 'p', text: '環繞（wrap）：有些地圖是環形的（走出右邊就從左邊進來，像甜甜圈 torus）。這時不是擋下移動，而是 `nr = (r + dr[d] + R) % R`、`nc = (c + dc[d] + C) % C`。加上 R 也是為了 C++／Java：r = 0 往上走時 `(0 - 1) % R` 會是 −1。' },
        { type: 'table', head: ['規則', 'C++17', 'Python 3', 'Java 17'], rows: [
          ['左轉', '`d = (d + 3) % 4;`', '`d = (d + 3) % 4`（`(d - 1) % 4` 也對）', '`d = (d + 3) % 4;` 或 `Math.floorMod(d - 1, 4)`'],
          ['環繞的列', '`(r + dr[d] + R) % R`', '`(r + dr[d]) % R`', '`(r + dr[d] + R) % R`'],
          ['越界讀取', '未定義行為', '負數悄悄繞回，太大丟出 `IndexError`', '丟出 `ArrayIndexOutOfBoundsException`'],
        ] },
        { type: 'p', text: '停止規則（stop）要和其他規則一樣寫清楚，常見的有四種：' },
        { type: 'list', items: [
          '固定步數：執行完全部指令、或模擬 T 秒、T 代就結束。',
          '離開地圖就結束：先算出下一格，發現出界時記錄答案再停，不要先移動再檢查（那時座標已經在地圖外）。',
          '達成目標就結束：例如所有車都通過、走到出口。要想清楚「目標永遠達不到」時怎麼辦，加上步數上限避免無窮迴圈。',
          '狀態不再改變就結束：例如生命遊戲變成靜止的圖案。判斷方法是比較新舊兩張表是否完全相同。',
        ] },
        { type: 'p', text: '同一步裡有多條規則時，題目給的順序就是程式的順序。例如「前方是牆就右轉，否則前進」：一步只做其中一件，不能右轉之後又在同一步前進。把它寫成 if／else，而不是兩個獨立的 if。' },
      ],
    },
    {
      id: 'tests-and-cost', title: '設計測資與分析複雜度',
      blocks: [
        { type: 'p', text: '模擬題的錯誤通常不在主要流程，而在某一條很少觸發的規則。所以測資要「每一條規則至少被觸發一次」，並特別針對邊界：' },
        { type: 'table', head: ['要測的規則', '測資設計', '抓得到的錯誤'], rows: [
          ['邊界', '從角落 (0, 0) 往上、往左走', '缺少下界檢查（Python 負數索引繞回、C++ 越界）'],
          ['牆', '機器人四周都是牆', '撞牆時仍然移動，或撞牆後把方向也改掉'],
          ['轉向', '面向上時先左轉再前進', '`(d - 1) % 4` 在 C++／Java 得到 −1'],
          ['計數', '來回走同一段路', '把「步數」當成「走過幾個不同格子」'],
          ['最小的情況', '1 × 1 的地圖、只有一個指令', '迴圈邊界、陣列大小開錯'],
          ['同步更新', '生命遊戲的閃爍子', '即時更新讀到新值'],
          ['最大的情況', '100 × 100、10^5 個指令', '每一步都掃整張地圖，太慢'],
        ] },
        { type: 'p', text: '每一組測資都要先「手算」或用另一支簡單程式算出答案，再和程式比對；只檢查「有沒有輸出」的測資抓不到錯。可以把狀態印出來（每一步印出 r、c、d），對照自己手算的表格，第一個不一樣的步驟就是錯誤所在。' },
        { type: 'p', text: '時間複雜度 = 步數 × 每一步的成本。機器人走 K 個指令、每個指令 O(1)，總共 O(K)，再加上讀地圖的 O(R·C)。生命遊戲 T 代、每代掃 R·C 格、每格看 8 個鄰居，總共 O(T·R·C)：100 × 100 的格子跑 1000 代約 8 × 10^7 次鄰居檢查，可以接受。紅綠燈逐秒模擬的步數是「最後一台車通過的秒數」，和車數無關：抵達時間可能到 10^9 時，逐秒模擬就太慢，要改成直接跳到下一個事件（下一台車抵達或下一次綠燈）。' },
        { type: 'callout', tone: 'tip', title: '步數非常大時（只先認識）', text: '如果要模擬 10^18 步，一步一步走不可能完成。兩種常見的思路：一、找週期（cycle detection），把每個狀態第一次出現的步數記下來，狀態重複時就知道週期長度，剩下的步數對週期取餘數即可；二、一次算一大段，例如直接用公式算出 k 步之後的位置。這些技巧會在之後的課程介紹；本課先把「一步」寫對。' },
        { type: 'p', text: '累計的數值也要估大小：例如每一步都把走過的距離或等待時間加總，10^5 步 × 每步最多 10^5，總和可達 10^10，超過 C++ 與 Java `int` 的範圍（約 2.1 × 10^9），要用 `long long`／`long`；Python 的整數沒有上限。' },
      ],
    },
  ],
  examples: [
    {
      id: 'traffic-light', title: '紅綠燈前的排隊', description: '綠燈 2 秒、紅燈 3 秒輪流；每一秒先讓這一秒抵達的車排到隊尾，若是綠燈再讓隊首一台車通過。輸出每台車通過的秒數，以及隊伍最長時有幾台車。',
      output: '0 1 5 6 10 11\nmax queue 3',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <queue>
#include <vector>

int main() {
    const int G = 2, RED = 3;                    // 綠燈 2 秒、紅燈 3 秒
    const std::vector<int> arrive = {0, 0, 1, 1, 3, 6};
    const int n = arrive.size();
    std::vector<int> leave(n, -1);
    std::queue<int> waiting;
    int i = 0, done = 0, longest = 0;
    for (int t = 0; done < n; ++t) {
        while (i < n && arrive[i] == t) waiting.push(i++);   // 規則 1：抵達的車排隊
        longest = std::max(longest, static_cast<int>(waiting.size()));
        if (t % (G + RED) < G && !waiting.empty()) {        // 規則 2：綠燈時隊首通過
            leave[waiting.front()] = t;
            waiting.pop();
            ++done;
        }
    }
    for (int k = 0; k < n; ++k) std::cout << leave[k] << (k + 1 < n ? " " : "\n");
    std::cout << "max queue " << longest << "\n";
    return 0;
}`,
        Python: code`from collections import deque

G, RED = 2, 3                          # 綠燈 2 秒、紅燈 3 秒
arrive = [0, 0, 1, 1, 3, 6]            # 第 i 台車抵達的秒數（已排序）
leave = [-1] * len(arrive)
waiting = deque()
i = t = done = longest = 0
while done < len(arrive):
    while i < len(arrive) and arrive[i] == t:   # 規則 1：抵達的車排隊
        waiting.append(i)
        i += 1
    longest = max(longest, len(waiting))
    if t % (G + RED) < G and waiting:           # 規則 2：綠燈時隊首通過
        leave[waiting.popleft()] = t
        done += 1
    t += 1
print(*leave)
print("max queue", longest)`,
        Java: code`import java.util.ArrayDeque;

public class Main {
    public static void main(String[] args) {
        final int G = 2, RED = 3;                    // 綠燈 2 秒、紅燈 3 秒
        int[] arrive = {0, 0, 1, 1, 3, 6};
        int n = arrive.length;
        int[] leave = new int[n];
        ArrayDeque<Integer> waiting = new ArrayDeque<>();
        int i = 0, done = 0, longest = 0;
        for (int t = 0; done < n; ++t) {
            while (i < n && arrive[i] == t) waiting.addLast(i++);   // 規則 1：抵達的車排隊
            longest = Math.max(longest, waiting.size());
            if (t % (G + RED) < G && !waiting.isEmpty()) {         // 規則 2：綠燈時隊首通過
                leave[waiting.pollFirst()] = t;
                ++done;
            }
        }
        StringBuilder sb = new StringBuilder();
        for (int k = 0; k < n; ++k) sb.append(k > 0 ? " " : "").append(leave[k]);
        System.out.println(sb);
        System.out.println("max queue " + longest);
    }
}`,
      },
    },
    {
      id: 'robot-walk', title: '機器人照指令走地圖', description: '4 × 5 的地圖，`#` 是牆。機器人從 (0, 0) 面向東出發，F 前進一格、L 左轉、R 右轉；出界或撞牆的移動忽略並計數。輸出最後的位置、方向（N、E、S、W）與被擋下的次數。',
      output: '1 4 E\nblocked 3',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    const std::vector<std::string> g = {"....#", ".#...", "...#.", "....."};
    const int R = g.size(), C = g[0].size();
    const int dr[] = {-1, 0, 1, 0}, dc[] = {0, 1, 0, -1};   // 0 上、1 右、2 下、3 左
    int r = 0, c = 0, d = 1, blocked = 0;
    for (char cmd : std::string("FFFFRFFLFF")) {
        if (cmd == 'L') d = (d + 3) % 4;
        else if (cmd == 'R') d = (d + 1) % 4;
        else {
            int nr = r + dr[d], nc = c + dc[d];
            if (0 <= nr && nr < R && 0 <= nc && nc < C && g[nr][nc] != '#') { r = nr; c = nc; }
            else ++blocked;
        }
    }
    std::cout << r << " " << c << " " << "NESW"[d] << "\n";
    std::cout << "blocked " << blocked << "\n";
    return 0;
}`,
        Python: code`g = ["....#", ".#...", "...#.", "....."]
R, C = len(g), len(g[0])
dr, dc = (-1, 0, 1, 0), (0, 1, 0, -1)    # 0 上、1 右、2 下、3 左
r, c, d, blocked = 0, 0, 1, 0
for cmd in "FFFFRFFLFF":
    if cmd == "L":
        d = (d + 3) % 4
    elif cmd == "R":
        d = (d + 1) % 4
    else:
        nr, nc = r + dr[d], c + dc[d]
        if 0 <= nr < R and 0 <= nc < C and g[nr][nc] != "#":
            r, c = nr, nc
        else:
            blocked += 1
print(r, c, "NESW"[d])
print("blocked", blocked)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String[] g = {"....#", ".#...", "...#.", "....."};
        int R = g.length, C = g[0].length();
        int[] dr = {-1, 0, 1, 0}, dc = {0, 1, 0, -1};   // 0 上、1 右、2 下、3 左
        int r = 0, c = 0, d = 1, blocked = 0;
        for (char cmd : "FFFFRFFLFF".toCharArray()) {
            if (cmd == 'L') d = (d + 3) % 4;
            else if (cmd == 'R') d = (d + 1) % 4;
            else {
                int nr = r + dr[d], nc = c + dc[d];
                if (0 <= nr && nr < R && 0 <= nc && nc < C && g[nr].charAt(nc) != '#') { r = nr; c = nc; }
                else ++blocked;
            }
        }
        System.out.println(r + " " + c + " " + "NESW".charAt(d));
        System.out.println("blocked " + blocked);
    }
}`,
      },
    },
    {
      id: 'life-step', title: '生命遊戲：同步更新與錯誤的即時更新', description: '5 × 5 的格子中間有直的三個活細胞（`#`）。同步更新讀舊表、寫新表；錯誤版本在同一張表上邊讀邊改。兩種結果不同。',
      output: 'synchronous:\n.....\n.....\n.###.\n.....\n.....\nin-place:\n.....\n.....\n.....\n.....\n.....',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

using Grid = std::vector<std::string>;

int liveNeighbours(const Grid& g, int r, int c) {
    const int R = g.size(), C = g[0].size();
    int n = 0;
    for (int dr = -1; dr <= 1; ++dr)
        for (int dc = -1; dc <= 1; ++dc) {
            int nr = r + dr, nc = c + dc;
            if ((dr != 0 || dc != 0) && 0 <= nr && nr < R && 0 <= nc && nc < C && g[nr][nc] == '#') ++n;
        }
    return n;
}

char rule(char cell, int n) { return (n == 3 || (cell == '#' && n == 2)) ? '#' : '.'; }

int main() {
    const Grid start = {".....", "..#..", "..#..", "..#..", "....."};
    Grid next = start;                     // 同步：讀舊的 start，寫新的 next
    for (int r = 0; r < 5; ++r)
        for (int c = 0; c < 5; ++c) next[r][c] = rule(start[r][c], liveNeighbours(start, r, c));
    Grid wrong = start;                    // 錯誤：在同一張表上邊讀邊改
    for (int r = 0; r < 5; ++r)
        for (int c = 0; c < 5; ++c) wrong[r][c] = rule(wrong[r][c], liveNeighbours(wrong, r, c));
    std::cout << "synchronous:\n";
    for (const auto& row : next) std::cout << row << "\n";
    std::cout << "in-place:\n";
    for (const auto& row : wrong) std::cout << row << "\n";
    return 0;
}`,
        Python: code`def live_neighbours(g, r, c):
    n = 0
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            nr, nc = r + dr, c + dc
            if (dr, dc) != (0, 0) and 0 <= nr < len(g) and 0 <= nc < len(g[0]) and g[nr][nc] == "#":
                n += 1
    return n


def rule(cell, n):
    return "#" if n == 3 or (cell == "#" and n == 2) else "."


start = [".....", "..#..", "..#..", "..#..", "....."]
nxt = [[rule(start[r][c], live_neighbours(start, r, c)) for c in range(5)] for r in range(5)]   # 同步
wrong = [list(row) for row in start]   # 錯誤：在同一張表上邊讀邊改
for r in range(5):
    for c in range(5):
        wrong[r][c] = rule(wrong[r][c], live_neighbours(wrong, r, c))
print("synchronous:")
for row in nxt:
    print("".join(row))
print("in-place:")
for row in wrong:
    print("".join(row))`,
        Java: code`public class Main {
    static int liveNeighbours(char[][] g, int r, int c) {
        int n = 0;
        for (int dr = -1; dr <= 1; ++dr)
            for (int dc = -1; dc <= 1; ++dc) {
                int nr = r + dr, nc = c + dc;
                if ((dr != 0 || dc != 0) && 0 <= nr && nr < g.length && 0 <= nc && nc < g[0].length && g[nr][nc] == '#') ++n;
            }
        return n;
    }

    static char rule(char cell, int n) { return (n == 3 || (cell == '#' && n == 2)) ? '#' : '.'; }

    static char[][] copy(char[][] a) {
        char[][] b = new char[a.length][];
        for (int i = 0; i < a.length; ++i) b[i] = a[i].clone();   // 逐列複製（a.clone() 只是淺複製）
        return b;
    }

    public static void main(String[] args) {
        String[] rows = {".....", "..#..", "..#..", "..#..", "....."};
        char[][] start = new char[5][];
        for (int i = 0; i < 5; ++i) start[i] = rows[i].toCharArray();
        char[][] next = copy(start);           // 同步：讀舊的 start，寫新的 next
        for (int r = 0; r < 5; ++r)
            for (int c = 0; c < 5; ++c) next[r][c] = rule(start[r][c], liveNeighbours(start, r, c));
        char[][] wrong = copy(start);          // 錯誤：在同一張表上邊讀邊改
        for (int r = 0; r < 5; ++r)
            for (int c = 0; c < 5; ++c) wrong[r][c] = rule(wrong[r][c], liveNeighbours(wrong, r, c));
        StringBuilder sb = new StringBuilder("synchronous:\n");
        for (char[] row : next) sb.append(row).append('\n');
        sb.append("in-place:\n");
        for (char[] row : wrong) sb.append(row).append('\n');
        System.out.print(sb);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '機器人在 4 × 5 地圖上照指令移動', language: 'Python',
    code: code`g = ["....#", ".#...", "...#.", "....."]
R, C = 4, 5
dr, dc = [-1, 0, 1, 0], [0, 1, 0, -1]   # 0 上、1 右、2 下、3 左
r, c, d = 0, 0, 1                         # 從 (0, 0) 出發，面向右
for cmd in "FFFFRFFLFF":
    if cmd == "L":
        d = (d + 3) % 4
    elif cmd == "R":
        d = (d + 1) % 4
    else:
        nr, nc = r + dr[d], c + dc[d]
        if 0 <= nr < R and 0 <= nc < C and g[nr][nc] != "#":
            r, c = nr, nc
print(r, c, d)`,
    steps: robotSteps(),
  },
  quiz: [
    {
      id: 'q1', prompt: '機器人在 3 × 3 的空地圖上，從 (0, 0) 面向上出發（d = 0），出界的移動忽略。下面的程式輸出什麼？',
      code: { language: 'Python', text: 'dr, dc = [-1, 0, 1, 0], [0, 1, 0, -1]\nr, c, d = 0, 0, 0\nfor cmd in "FRFFRF":\n    if cmd == "R":\n        d = (d + 1) % 4\n    else:\n        nr, nc = r + dr[d], c + dc[d]\n        if 0 <= nr < 3 and 0 <= nc < 3:\n            r, c = nr, nc\nprint(r, c)' },
      options: ['1 2', '0 2', '2 1', '1 1'],
      answer: 0, explanation: '第一個 F 往上會走到 (−1, 0)，出界被忽略，仍在 (0, 0)；R 轉向右；兩個 F 走到 (0, 2)；R 轉向下；最後 F 走到 (1, 2)。選 `0 2` 是以為第一個 F 真的走出去了：沒有邊界檢查時座標會先到 (−1, 0)，之後一路錯開，最後停在 (0, 2)。`2 1`、`1 1` 是把右轉方向弄反或少走一步的結果。',
    },
    {
      id: 'q2', prompt: '綠燈 2 秒、紅燈 1 秒輪流（第 t 秒是綠燈若且唯若 `t % 3 < 2`），綠燈的每一秒最多讓隊首一台車通過。題目規定同一秒內「先讓隊首通過，再讓這一秒抵達的車排隊」。只有一台車，在第 1 秒抵達，它在第幾秒通過？',
      options: ['第 1 秒', '第 2 秒', '第 3 秒', '第 4 秒'],
      answer: 2, explanation: '第 1 秒先執行「通過」：此時佇列是空的，沒有車通過；接著這台車才排進佇列。第 2 秒 `2 % 3 = 2`，是紅燈；第 3 秒 `3 % 3 = 0` 是綠燈，車子通過。選第 1 秒是把順序寫成「先排隊再通過」（那是另一題的規則）；選第 2 秒是忘了第 2 秒是紅燈。用模擬程式分別以兩種順序執行，結果是第 1 秒與第 3 秒。',
    },
    {
      id: 'q3', prompt: '題目規則：「每一格的新值 = 左鄰的舊值 + 自己的舊值（第 0 格不變），所有格子同時更新。」下面的程式輸出什麼？它符合規則嗎？',
      code: { language: 'Python', text: 'a = [1, 1, 1, 1]\nfor i in range(1, 4):\n    a[i] = a[i - 1] + a[i]\nprint(a)' },
      options: ['[1, 2, 3, 4]，不符合規則（應該是 [1, 2, 2, 2]）', '[1, 2, 2, 2]，符合規則', '[1, 2, 3, 4]，符合規則', '[2, 2, 2, 1]，不符合規則'],
      answer: 0, explanation: '程式是即時更新：算 a[2] 時讀到的 a[1] 已經是新值 2，所以得到 3，a[3] 再讀到 3 而得到 4，結果 [1, 2, 3, 4]（其實是前綴和）。規則要求用舊值，正確答案是每格 1 + 1 = 2，即 [1, 2, 2, 2]；要先複製 `old = a[:]` 再用 `old[i - 1] + old[i]`。選 [1, 2, 2, 2] 是把程式當成同步更新；第三個選項的輸出對、判斷錯。',
    },
    {
      id: 'q4', prompt: '地圖 3 × 3，機器人在 (0, 0) 想往上走。下面的 Python 程式少寫了下界檢查，會發生什麼事？',
      code: { language: 'Python', text: 'g = ["...", "...", ".#."]\nr, c = 0, 0\nnr, nc = r - 1, c\nif nr < 3 and nc < 3 and g[nr][nc] != "#":\n    r, c = nr, nc\nprint(r, c)' },
      options: ['印出 0 0，出界的移動被正確忽略', '印出 -1 0，沒有任何錯誤訊息', '丟出 IndexError', '印出 2 0'],
      answer: 1, explanation: '`nr = -1` 通過了 `nr < 3`，而 Python 的 `g[-1]` 是最後一列 ".#."，`g[-1][0]` 是 "."，不是牆，所以機器人被移到 (−1, 0)，程式安靜地印出 `-1 0`。Python 只有索引大於等於長度才丟出 `IndexError`，負數會繞回去，所以不會報錯；選 `2 0` 是以為座標也會繞回去，其實 r 存的就是 −1。同樣的錯誤在 C++ 是未定義行為，在 Java 會丟出 `ArrayIndexOutOfBoundsException`。正確條件要加上 `0 <= nr` 與 `0 <= nc`。',
    },
    {
      id: 'q5', prompt: '地圖 1000 × 1000，機器人執行 K = 10^5 個指令。某支程式每執行完一個指令，就掃描整張「走過的格子」表，重新數有幾格走過。它的時間複雜度與改進方法是？',
      options: [
        'O(K)，已經夠快',
        'O(K·R·C)，約 10^11 次，太慢；改成第一次走到某格時把計數器加 1，總共 O(R·C + K)',
        'O(R·C)，只和地圖大小有關',
        'O(K log K)，因為要判斷格子是否重複',
      ],
      answer: 1, explanation: '步數 K = 10^5，每一步的成本是掃整張表 R·C = 10^6，總共 10^11，遠超過一般時限內能做的運算量。走過的格數只會在「第一次踏進某格」時增加，維護一個布林表加一個計數器，每步 O(1)，加上開表的 O(R·C)。選 O(K) 是忽略了每一步裡的掃描；O(R·C) 忽略了步數；用二維布林表判斷重複不需要 log。',
    },
    {
      id: 'q6', prompt: '機器人一開始面向上（d = 0，方向依序為上、右、下、左），某支 Java 程式把左轉寫成 `d = (d - 1) % 4;`。下列哪一組指令最能抓到這個錯誤？',
      options: ['RRRRF', 'RLF', 'LF', 'RRLF'],
      answer: 2, explanation: '只有在 d = 0 時左轉才會出錯：Java 的 `(0 - 1) % 4` 是 −1，接著 F 讀 `dr[-1]` 丟出 `ArrayIndexOutOfBoundsException`。`LF` 一開始就觸發。`RRRRF` 沒有左轉；`RLF` 左轉時 d 是 1，得到 0，正確；`RRLF` 左轉時 d 是 2，也正確。同一個寫法在 Python 是對的（`(0 - 1) % 4` 是 3），所以只用 Python 測試會漏掉這個錯；三種語言都正確的寫法是 `(d + 3) % 4`。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '地圖上的機器人',
      statement: 'R 列 C 行的地圖，`.` 是空地，`#` 是障礙物；列由上而下編號 0～R − 1，行由左而右編號 0～C − 1。機器人從 (r, c) 出發，一開始面向北（上）。依序執行指令字串 S 的每個字元：`F` 往目前面向的方向前進一格，`L` 原地左轉 90 度，`R` 原地右轉 90 度。若前進的目標格在地圖外或是障礙物，這次前進直接忽略（位置與方向都不變），接著執行下一個指令。請輸出全部指令執行完後機器人的位置與方向，以及它到過的不同格子數（包含起點，同一格走過多次只算一次）。若起點不在地圖內、起點是障礙物，或 S 含有 `F`、`L`、`R` 以外的字元（區分大小寫），不做任何模擬，只輸出 `Invalid`。',
      inputFormat: '第一行 R、C；接著 R 行，每行 C 個字元（`.` 或 `#`）；下一行是起點 r、c；最後一行是指令字串 S（不含空白）。',
      outputFormat: '合法時輸出兩行：第一行是最後的 r、c 與方向（`N`、`E`、`S`、`W` 之一），以空白分隔；第二行是到過的不同格子數。不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ R, C ≤ 100', '1 ≤ |S| ≤ 10^5', '地圖只含 `.` 與 `#`，每行剛好 C 個字元', 'r、c 是整數，但不保證在地圖內'],
      samples: [{ kind: 'normal', input: '4 5\n....#\n.#...\n...#.\n.....\n0 0\nRFFFFRFFLFF', output: '1 4 E\n6', note: '先右轉面向東，之後和視覺化相同：撞牆兩次、出界一次，到過 (0, 0)～(0, 3)、(1, 3)、(1, 4) 共 6 格' }],
      tests: [
        { kind: 'normal', input: '4 5\n....#\n.#...\n...#.\n.....\n0 0\nRFFFFRFFLFF', output: '1 4 E\n6', note: '範例：撞牆與出界都被忽略' },
        { kind: 'normal', input: '3 3\n...\n...\n...\n1 1\nFRFRFRFRFF', output: '0 1 N\n4', note: '繞一圈又走回走過的格子：6 次移動只到過 4 個不同格子，把移動次數當成格子數會錯' },
        { kind: 'normal', input: '3 4\n....\n.#..\n....\n2 1\nLFRFFRFFLF', output: '0 2 N\n6', note: '第一個指令就在面向北時左轉，抓 C++／Java 的 `(d - 1) % 4` 錯誤；把左右轉弄反也會錯' },
        { kind: 'normal', input: '5 6\n..#...\n.##.#.\n......\n#.#.#.\n......\n4 0\nFFRFFFRFLFFLFFRRFFFFLF', output: '4 5 E\n8', note: '有多面牆的地圖，連續轉向與多次撞牆' },
        { kind: 'edge', input: '1 1\n.\n0 0\nFLFRFF', output: '0 0 N\n1', note: '1 × 1 的地圖：每次前進都出界，只剩轉向有效' },
        { kind: 'edge', input: '3 3\n.#.\n#.#\n.#.\n1 1\nFRFRFRFLF', output: '1 1 S\n1', note: '四周都是牆，所有移動都被擋下，但方向照常改變' },
        { kind: 'edge', input: '3 4\n....\n....\n....\n0 0\nRFFFRFFRFFFRFF', output: '0 0 N\n10', note: '沿著邊界繞地圖一圈回到起點：外圈 10 格' },
        { kind: 'edge', input: '2 2\n..\n..\n0 0\nFLF', output: '0 0 W\n1', note: '從左上角往上、往左都出界。Python 只檢查上界時，負數索引會讀到最後一列／最後一行而誤判可走' },
        { kind: 'edge', input: '100 100\n' + EMPTY_MAP + '\n99 0\n' + 'F'.repeat(100000), output: '0 0 N\n100', note: '最大的地圖與 10^5 個指令：走到最上面之後的指令全部出界' },
        { kind: 'edge', input: '100 100\n' + BIG_MAP + '\n50 50\n' + RANDOM_COMMANDS, output: '31 90 N\n6926', note: '最大規模：100 × 100、規律分布的障礙物、10^5 個偽隨機指令；每步掃整張地圖的寫法會太慢' },
        { kind: 'error', input: '2 3\n.#.\n...\n0 1\nF', output: 'Invalid', note: '起點是障礙物' },
        { kind: 'error', input: '2 2\n..\n..\n0 0\nFFXF', output: 'Invalid', note: '未知的指令 X：不輸出模擬到一半的結果' },
        { kind: 'error', input: '2 2\n..\n..\n2 0\nF', output: 'Invalid', note: '起點的列 2 超出地圖（只有 0～1）' },
        { kind: 'error', input: '2 2\n..\n..\n1 1\nfL', output: 'Invalid', note: '小寫 f 不是合法指令（區分大小寫）' },
      ],
      hints: [
        '方向依順時針排成 N、E、S、W，對應 `dr = {-1, 0, 1, 0}`、`dc = {0, 1, 0, -1}`；右轉 `(d + 1) % 4`，左轉 `(d + 3) % 4`。',
        '先檢查起點與整個指令字串，全部合法才開始模擬，才能保證不合法時只輸出 `Invalid`。',
        '前進時先算 (nr, nc)，依序檢查「在地圖內」「不是障礙物」，都成立才移動。',
        '用一張 R × C 的布林表記錄到過的格子，第一次走到時計數器加 1；不要每一步重新掃整張表。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    int R, C;
    std::cin >> R >> C;
    std::vector<std::string> g(R);
    for (auto& row : g) std::cin >> row;
    int r, c;
    std::string cmds;
    std::cin >> r >> c >> cmds;
    bool ok = 0 <= r && r < R && 0 <= c && c < C && g[r][c] != '#';
    for (char ch : cmds)
        if (ch != 'F' && ch != 'L' && ch != 'R') ok = false;
    if (!ok) {
        std::cout << "Invalid\n";
        return 0;
    }
    const int dr[] = {-1, 0, 1, 0}, dc[] = {0, 1, 0, -1};   // N E S W
    std::vector<std::vector<bool>> seen(R, std::vector<bool>(C, false));
    seen[r][c] = true;
    int visited = 1, d = 0;
    for (char ch : cmds) {
        if (ch == 'L') d = (d + 3) % 4;
        else if (ch == 'R') d = (d + 1) % 4;
        else {
            int nr = r + dr[d], nc = c + dc[d];
            if (0 <= nr && nr < R && 0 <= nc && nc < C && g[nr][nc] != '#') {
                r = nr;
                c = nc;
                if (!seen[r][c]) {
                    seen[r][c] = true;
                    ++visited;
                }
            }
        }
    }
    std::cout << r << " " << c << " " << "NESW"[d] << "\n" << visited << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
R, C = int(data[0]), int(data[1])
g = data[2:2 + R]
r, c = int(data[2 + R]), int(data[3 + R])
cmds = data[4 + R]
if not (0 <= r < R and 0 <= c < C) or g[r][c] == "#" or set(cmds) - set("FLR"):
    print("Invalid")
else:
    dr, dc = (-1, 0, 1, 0), (0, 1, 0, -1)   # N E S W
    seen = [[False] * C for _ in range(R)]
    seen[r][c] = True
    visited, d = 1, 0
    for ch in cmds:
        if ch == "L":
            d = (d + 3) % 4
        elif ch == "R":
            d = (d + 1) % 4
        else:
            nr, nc = r + dr[d], c + dc[d]
            if 0 <= nr < R and 0 <= nc < C and g[nr][nc] != "#":
                r, c = nr, nc
                if not seen[r][c]:
                    seen[r][c] = True
                    visited += 1
    print(r, c, "NESW"[d])
    print(visited)`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder all = new StringBuilder();
        for (String line = in.readLine(); line != null; line = in.readLine()) all.append(line).append(' ');
        StringTokenizer st = new StringTokenizer(all.toString());
        int R = Integer.parseInt(st.nextToken()), C = Integer.parseInt(st.nextToken());
        char[][] g = new char[R][];
        for (int i = 0; i < R; ++i) g[i] = st.nextToken().toCharArray();
        int r = Integer.parseInt(st.nextToken()), c = Integer.parseInt(st.nextToken());
        String cmds = st.nextToken();
        boolean ok = 0 <= r && r < R && 0 <= c && c < C && g[r][c] != '#';
        for (int i = 0; i < cmds.length(); ++i) {
            char ch = cmds.charAt(i);
            if (ch != 'F' && ch != 'L' && ch != 'R') ok = false;
        }
        if (!ok) {
            System.out.println("Invalid");
            return;
        }
        int[] dr = {-1, 0, 1, 0}, dc = {0, 1, 0, -1};   // N E S W
        boolean[][] seen = new boolean[R][C];
        seen[r][c] = true;
        int visited = 1, d = 0;
        for (int i = 0; i < cmds.length(); ++i) {
            char ch = cmds.charAt(i);
            if (ch == 'L') d = (d + 3) % 4;
            else if (ch == 'R') d = (d + 1) % 4;
            else {
                int nr = r + dr[d], nc = c + dc[d];
                if (0 <= nr && nr < R && 0 <= nc && nc < C && g[nr][nc] != '#') {
                    r = nr;
                    c = nc;
                    if (!seen[r][c]) {
                        seen[r][c] = true;
                        ++visited;
                    }
                }
            }
        }
        System.out.println(r + " " + c + " " + "NESW".charAt(d) + "\n" + visited);
    }
}`,
      },
      judge: 'none',
    },
  ],
};
