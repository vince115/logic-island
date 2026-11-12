import type { LessonContent, TraceStep } from '../schema';
import { activitySelectionSteps } from '../simulate-algorithms';

const code = String.raw;

/**
 * The visualization's data: D starts exactly when A ends (touching is allowed), and E(7, 9) and F(5, 9) end together,
 * so the (end, start) key puts F first.
 */
const TRACE_ACTS = [
  { name: 'A', start: 1, end: 4 }, { name: 'B', start: 3, end: 5 }, { name: 'C', start: 0, end: 6 },
  { name: 'D', start: 4, end: 7 }, { name: 'E', start: 7, end: 9 }, { name: 'F', start: 5, end: 9 },
];
const TRACE_SORTED = [...TRACE_ACTS].sort((x, y) => x.end - y.end || x.start - y.start);
/** last_end just before each sorted activity is checked, and the chosen list after it (the trace's own variables). */
const traceState = (() => {
  let last = '-inf';
  const chosen: string[] = [];
  return TRACE_SORTED.map(a => {
    const before = last;
    const take = last === '-inf' || a.start >= Number(last);
    if (take) { chosen.push(a.name); last = String(a.end); }
    return { before, take, after: last, chosen: `[${chosen.map(n => `'${n}'`).join(', ')}]`, owner: chosen.at(-1)! };
  });
})();

/**
 * activitySelectionSteps runs the same sort by (end, start) and the same `start >= last_end` test as the trace code.
 * Its 'choose' event covers both outcomes: a taken activity is moved to line 9 (after `last_end = end`), a skipped one
 * stays on the `if` of line 7. Notes and variables are rewritten with the trace code's own names, and the result step
 * prints what line 10 prints.
 */
const traceSteps: TraceStep[] = activitySelectionSteps(TRACE_ACTS, { sort: 3, choose: 7, result: 10 }).map((step, k, all): TraceStep => {
  if (k === 0) return { ...step, note: '第 3 行依 (結束, 開始) 排序。E(7, 9) 與 F(5, 9) 同時結束，第二個鍵「開始」讓 F 排在前面。排序後只要由上往下掃一遍，每個活動只看一次。' };
  if (k === all.length - 1) {
    const final = traceState.at(-1)!;
    return { ...step, line: 10, output: `3 ${final.chosen}`,
      note: `掃完了，選了 A、D、E 共 3 個。B、C 在 A 還沒結束時就開始；F 在 D 還沒結束時就開始。交換論證保證「最早結束」不吃虧：任何最佳解的第一個活動都能換成 A 而不變差，之後的子問題同理，所以 3 就是最多。` };
  }
  const a = TRACE_SORTED[k - 1], s = traceState[k - 1];
  const vars = { name: a.name, start: String(a.start), end: String(a.end), last_end: s.after, chosen: s.chosen };
  if (!s.take) return { ...step, line: 7, vars,
    note: `${a.name}(${a.start}, ${a.end})：start = ${a.start} < last_end = ${s.before}，它在已選的 ${s.owner} 還沒結束時就開始，兩者重疊，捨棄（不進 if）。` };
  const why = s.before === '-inf' ? 'last_end 還是 -inf，還沒選任何活動，一定不衝突' : a.start === Number(s.before) ? `start = ${a.start} 等於 last_end = ${s.before}，剛好接上，不算重疊` : `start = ${a.start} ≥ last_end = ${s.before}，不重疊`;
  return { ...step, line: 9, vars, note: `${a.name}(${a.start}, ${a.end})：${why}。選取它，第 9 行把 last_end 更新成它的結束時間 ${a.end}。` };
});

/**
 * Exercise worst cases, generated here (each input stays near 1 MB). Expected answers by a formula and by an
 * independent O(n log n) DP (weighted interval scheduling with weight 1), both run outside the repo, and by the
 * reference solutions.
 * bigBlocks: 20000 blocks of 8 time units, each [b, b+8] over three touching short meetings [b+1, b+3], [b+3, b+5],
 * [b+5, b+7], shuffled by i·7919 mod n. Answer 3 per block = 60000; earliest start gives 20000, a strict `>` 40000.
 */
const BLOCKS = 20_000;
const BLOCK_N = 4 * BLOCKS;
const bigBlocks = Array.from({ length: BLOCK_N }, (_, i) => {
  const k = (i * 7919) % BLOCK_N, base = 8 * Math.floor(k / 4);
  return [[base, base + 8], [base + 1, base + 3], [base + 3, base + 5], [base + 5, base + 7]][k % 4];
});
const bigBlocksInput = `${BLOCK_N}\n${bigBlocks.map(([s, e]) => `${s} ${e}`).join('\n')}`;
/** 70000 touching meetings [i, i+1] in reverse order: answer 70000, a strict `>` gives 35000. */
const CHAIN = 70_000;
const bigChainInput = `${CHAIN}\n${Array.from({ length: CHAIN }, (_, i) => `${CHAIN - 1 - i} ${CHAIN - i}`).join('\n')}`;
/** n = 2×10^5 identical meetings: answer 1. */
const SAME_N = 200_000;
const bigSameInput = `${SAME_N}\n${Array(SAME_N).fill('1 2').join('\n')}`;

/**
 * A13 Greedy. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also offers
 * JavaScript (Node.js): explicit multi-key comparators, the stable Array.prototype.sort for ties, and Math.imul so the
 * stress test's LCG stays exact (seed × 1103515245 can exceed 2^53).
 */
export const A13: LessonContent = {
  lessonId: 'A13',
  motivation: '一間教室一天只能借給一個社團，十幾個社團各自想借某個時段，怎麼排才能讓最多社團用到教室？把每一種組合都試一遍（A12 的回溯）要 2^n 種，n = 40 就超過 10^12。貪心法（greedy algorithm）的做法是：每一步只做「當下看起來最好」的選擇，選了就不再反悔；排課問題只要「依結束時間排序，能放就放」，排序加掃描一遍，O(n log n) 就得到最佳答案。貪心常出現在排程、找零、分配資源、用最少的點或區間覆蓋範圍這類問題，程式短、跑得快。它的限制同樣明顯：貪心不是對每一題都對。同樣是找零，硬幣 {1, 5, 10, 50} 每次拿最大的一定最少枚，換成 {1, 3, 4} 湊 6 就會拿成 4 + 1 + 1，比 3 + 3 多一枚。所以這一課除了教怎麼寫，更要教怎麼判斷：用交換論證（exchange argument）說明為什麼對，用反例與暴力對拍（brute force）檢查會不會錯；不能貪心的題目，就交給動態規劃（A17、A18）或回溯（A12）。',
  sections: [
    {
      id: 'idea', title: '貪心的想法：每一步選當下最好的，而且不回頭',
      blocks: [
        { type: 'p', text: '貪心法把問題拆成一連串的選擇，每一步依一個固定的規則（例如「結束最早的」「面額最大的」「最短的」）挑一個，挑了就定案，接著處理剩下的問題。它和前面學過的方法差在「不回頭」：回溯（A12）會試每一條路、走不通就撤銷；動態規劃（A17）會記住所有子問題的答案再比較；貪心只走一條路，所以通常只要排序 O(n log n) 加一次掃描。' },
        { type: 'p', text: '貪心要得到最佳解，需要兩個條件。第一，貪心選擇性質（greedy-choice property）：存在一個最佳解，它的第一步就是貪心選的那一個，所以先選它不會錯過最佳答案。第二，最佳子結構（optimal substructure）：做完這一步之後，剩下的是一個「同類型但更小」的問題，對它的最佳解加上這一步，就是整體的最佳解。第一個條件最容易出錯，第三節的交換論證就是用來證明它的。' },
        { type: 'table', head: ['問題', '貪心規則', '一定最佳嗎？', '說明'], rows: [
          ['活動選擇：最多幾個不重疊的活動', '結束最早的先選', '是', '第二、三節：交換論證'],
          ['活動選擇', '開始最早的先選', '否', '(0, 10) (1, 2) (3, 4)：選了 (0, 10) 只有 1 個，最佳是 2 個'],
          ['找零，硬幣 {1, 5, 10, 50}', '面額最大的先拿', '是', '第四節證明'],
          ['找零，硬幣 {1, 3, 4}', '面額最大的先拿', '否', '湊 6：貪心 4 + 1 + 1 共 3 枚，最佳 3 + 3 共 2 枚'],
          ['一台機器做 n 個工作，等待時間總和最小', '最短的先做', '是', '第五節：相鄰交換'],
          ['0/1 背包：容量 10，物品（重 6、值 9）（重 5、值 7）（重 5、值 7）', '價值／重量最高的先拿', '否', '貪心先拿 9/6 = 1.5 的那件，剩 4 放不下別的，得 9；最佳是兩件重 5 的，得 14（A18）'],
        ] },
        { type: 'callout', tone: 'warning', title: '貪心不是對每一題都對', text: '「每一步都選最好的」聽起來一定對，其實不然：當下最好的選擇可能擋住後面更好的組合。上表一半的規則都有反例，而且反例都很小，三、四個活動或一個金額就夠了。寫貪心之前要先問「為什麼這樣選不會吃虧？」，能用交換論證說清楚才採用；說不清楚時，先拿小資料的暴力解對拍（第六節），找到反例就改用動態規劃或回溯。' },
      ],
    },
    {
      id: 'activity', title: '活動選擇：為什麼依結束時間排序',
      blocks: [
        { type: 'p', text: '問題：n 個活動，第 i 個佔用時段 `[s, e)`，同一時間只能進行一個，最多能選幾個互不重疊的活動？本課約定：前一個的結束時間等於下一個的開始時間時可以接著辦（例如 9:00 結束、9:00 開始），所以兩個活動重疊，若且唯若 `max(s1, s2) < min(e1, e2)`。題目若規定「不能剛好接上」，判斷式要跟著改，第三節會再談。' },
        { type: 'list', ordered: true, items: [
          '把活動依結束時間由早到晚排序；結束時間相同時再依開始時間排（只求個數時同分的順序不影響答案，但要印出選了誰時，完整的排序鍵才能讓結果固定）。',
          '`last_end` 設為負無限大，代表還沒選任何活動。',
          '依序看每個活動：如果 `start >= last_end`，它和已選的活動都不重疊，選取它，並令 `last_end = end`；否則捨棄。',
          '掃完後，選取的個數就是答案。',
        ] },
        { type: 'p', text: '為什麼第 3 步只和 `last_end` 比，不用和每個已選的活動都比？因為依結束時間排序後，已選的活動中結束最晚的就是最後選的那個，`last_end` 就是它的結束時間；新活動只要不早於它開始，就不會和任何已選的活動重疊。' },
        { type: 'p', text: '直覺上可能想到別的規則，但它們都有反例（下表的反例都用列舉全部子集合的暴力解驗證過，第六節會示範這種檢查）：' },
        { type: 'table', head: ['規則', '反例', '規則的結果', '最佳解'], rows: [
          ['開始最早的先選', '(0, 10) (1, 2) (3, 4)', '先選 (0, 10)，其他都和它重疊：1 個', '(1, 2) (3, 4)：2 個'],
          ['最短的先選', '(1, 5) (4, 7) (6, 10)', '先選最短的 (4, 7)，另外兩個都和它重疊：1 個', '(1, 5) (6, 10)：2 個'],
          ['和別人衝突最少的先選', '(0, 2)、(1, 3) 三個、(2, 4)、(3, 5)、(4, 6)、(5, 7) 三個、(6, 8)', '(3, 5) 只和 2 個衝突，最先被選，之後左右兩邊各只能再選 1 個：3 個', '(0, 2) (2, 4) (4, 6) (6, 8)：4 個'],
          ['結束最早的先選', '找不到反例', '永遠最佳', '第三節證明'],
        ] },
        { type: 'p', text: '「結束最早」為什麼特別？選了一個活動之後，剩下能用的時間是「它結束之後」。結束越早，留給後面的時間越多，這個選擇不會比其他選擇更擋路。開始早或長度短都不保證結束早：(0, 10) 開始最早卻佔滿整段，(4, 7) 最短卻剛好卡在兩個活動中間。' },
        { type: 'example', id: 'activity-select' },
        { type: 'p', text: '範例的活動故意不照順序給，程式先依（結束, 開始, 名稱）排序。A 結束於 4，D 從 4 開始，剛好接上，所以被選；E(3, 9) 與 F(5, 9) 結束時間相同，依開始時間 E 排在前面，兩個都因為在 D 結束（7）之前開始而被捨棄。G 從 7、I 從 10 開始，都剛好接上，最後選了 A、D、G、I 共 4 個。' },
        { type: 'p', text: '複雜度：排序 O(n log n)，掃描 O(n)，總共 O(n log n)，排序決定了整體時間；額外空間是排序與存活動的 O(n)。資料如果已經依結束時間排好，就只要 O(n)。對照不排序的做法：每一輪掃過全部活動，找出不衝突且結束最早的那個，最多要做 n 輪，是 O(n^2)，n = 2×10^5 時就太慢了。下方的視覺化在 6 個活動上一步步執行這個演算法，表格會標出每個活動被選取或捨棄的原因。' },
      ],
    },
    {
      id: 'exchange', title: '交換論證：為什麼「最早結束」不吃虧',
      blocks: [
        { type: 'p', text: '要說明貪心正確，不需要知道最佳解長什麼樣子，只要證明「把最佳解改成貪心的選擇，不會變差」。這種證明叫交換論證（exchange argument）。' },
        { type: 'p', text: '設 O 是任何一個最佳解，裡面的活動依時間排好是 o1, o2, …, ok（共 k 個）。貪心第一個選的 g 是所有活動中結束最早的，所以 `g.end <= o1.end`。把 O 裡的 o1 換成 g：因為 `g.end <= o1.end <= o2.start`，g 不會和 o2…ok 重疊，換完仍然是合法的選法，而且還是 k 個。所以一定有一個最佳解是以 g 開頭的：先選 g 不會錯過最佳答案。' },
        { type: 'p', text: '選了 g 之後，剩下的問題是「在 `start >= g.end` 的活動中選最多個」，這是同一種問題，只是更小；而 o2…ok 正是這個小問題的一組解。對小問題重複同樣的論證，一步一步，貪心選的個數每一步都跟得上最佳解，最後也是 k 個。另一種說法是「貪心保持領先」（greedy stays ahead）：貪心選的第 i 個活動，結束時間一定不晚於任何一組合法選法的第 i 個活動，所以它永遠不會落後。' },
        { type: 'list', ordered: true, items: [
          '假設有一個最佳解，它和貪心的選擇在第一個地方不同。',
          '把最佳解在那裡的選擇換成貪心的選擇。',
          '說明換完之後仍然合法（不違反限制），而且不變差（個數不變、總和不變大…）。',
          '重複下去，最佳解就一步步變成貪心解，所以貪心解也是最佳的。',
        ] },
        { type: 'p', text: '用同樣的步驟檢查「開始最早」就會卡在第 3 步：開始最早的活動可能結束得很晚，換進最佳解之後會和 o2 重疊，換完不合法。證明寫不下去的地方，往往就是反例藏身的地方，照著它去構造：一個很早開始、很晚結束的活動，裡面包著兩個短活動。' },
        { type: 'callout', tone: 'note', title: '邊界約定：`>=` 還是 `>`', text: '本課約定剛好接上可以，所以條件是 `start >= last_end`。如果題目說兩個活動之間至少要隔開（例如閉區間 `[s, e]`，端點也算佔用），就要改成 `start > last_end`；寫錯一個符號，(1, 3) (3, 5) (5, 7) 會從 3 個變成 2 個。長度為 0 的活動（`s == e`）也會讓「重疊」變得模糊：(3, 3) 和 (2, 5) 依 `max(s) < min(e)` 不算重疊，但貪心先選 (3, 3) 後 `last_end = 3`，就把 (2, 5) 捨棄了。所以本課練習規定 `s < e`，否則輸出 `Invalid`。讀題時先把這些約定寫下來再寫程式。' },
      ],
    },
    {
      id: 'coins', title: '找零：貪心什麼時候對、什麼時候錯',
      blocks: [
        { type: 'p', text: '找零問題：用最少枚硬幣湊出金額 x（每種面額的硬幣都有無限多枚）。貪心的做法是每次拿「不超過剩餘金額的最大面額」。用台灣常見的 {1, 5, 10, 50}，湊 68 是 50 + 10 + 5 + 1 + 1 + 1，共 6 枚，這確實是最少的。' },
        { type: 'p', text: '為什麼 {1, 5, 10, 50} 一定對？看任何一個最佳解：1 元最多 4 枚（5 枚 1 元可以換成 1 枚 5 元，枚數變少），5 元最多 1 枚（2 枚換成 1 枚 10 元），10 元最多 4 枚（5 枚換成 1 枚 50 元）。所以最佳解中 1、5、10 元加起來最多 4 + 5 + 40 = 49 元，不到 50；剩下的金額只能由 50 元湊，50 元的枚數一定是 ⌊x / 50⌋，和貪心一樣。對 10 元、5 元依序做同樣的推理，最佳解每一種面額的枚數都和貪心相同。' },
        { type: 'p', text: '換成 {1, 3, 4} 湊 6：貪心先拿 4，剩 2 只能拿兩枚 1，共 3 枚；但 3 + 3 只要 2 枚。上面的推理在這裡斷掉了：兩枚 3 加起來是 6，比 4 大，卻沒辦法換成更少枚的大硬幣，所以「大面額的枚數一定是最多的」不成立。下面的範例把貪心和真正的最少枚數（用動態規劃算，A17 會詳細說明）逐一比較。' },
        { type: 'example', id: 'coin-compare' },
        { type: 'p', text: '{1, 5, 10, 50} 在 1～200 每個金額都和最少枚數相同；{1, 3, 4} 在 1～20 中有 6、10、14、18 四個金額貪心多用了一枚，它們都是「把一枚 4 加兩枚 1 換成兩枚 3」就能省下一枚。像 {1, 5, 10, 50} 這樣貪心永遠最佳的面額組合稱為標準硬幣系統（canonical coin system）；一般的面額要確認，最實際的方法就是像範例這樣，用動態規劃在一段金額範圍內對照。面額任意、或每種硬幣數量有限時，就直接用動態規劃（A17、A18）。' },
        { type: 'callout', tone: 'tip', title: '湊不出來的情況', text: '面額沒有 1 時，貪心還可能「明明湊得出來卻說湊不出來」：{3, 5} 湊 9，貪心先拿 5，剩 4 拿一枚 3 後剩 1，失敗；但 3 + 3 + 3 = 9。題目說「湊不出來輸出 −1」時，貪心的 −1 也不可信。' },
      ],
    },
    {
      id: 'patterns', title: '其他常見的貪心模式',
      blocks: [
        { type: 'p', text: '最短工作優先（shortest job first）：一台機器依序做 n 個工作，每個工作的等待時間是它開始之前經過的時間，求等待時間總和最小的順序。答案是由短到長。相鄰交換論證：如果某個順序裡長工作 i 緊接在短工作 j 前面，把兩者對調，只有它們兩個的等待時間會變：原本 j 要多等 `t_i`，對調後變成 i 多等 `t_j`；因為 `t_j < t_i`，總和減少 `t_i − t_j`。所以最佳的順序裡沒有「長的在短的前面」，也就是由短到長。' },
        { type: 'example', id: 'sjf-wait' },
        { type: 'p', text: '範例中 P2 與 P4 都是 3，用穩定排序（stable sort）保持輸入順序，P2 在前；兩者對調總等待時間不變，但固定順序才能讓各語言印出一樣的結果。等待時間總和可能很大：10^5 個工作、每個 10^4，總和約 5×10^13，超過 `int` 的 2^31 − 1，C++ 要用 `long long`、Java 用 `long`，Python 的整數不會溢位；JavaScript 的 `number` 在 2^53（約 9×10^15）以內都是精確的整數，也放得下。' },
        { type: 'p', text: '兩個排好的序列配對（搭配 A08 的雙指標）：每個小朋友有胃口 g，每塊餅乾有大小 c，`c >= g` 才能滿足，每人最多一塊，最多能滿足幾個小朋友？把兩邊都由小到大排序，用兩個指標：拿目前最小的餅乾給胃口最小、還沒滿足的小朋友，夠大就配對、兩個指標都前進，不夠就換下一塊更大的餅乾。交換論證：如果最佳解把一塊較大的餅乾給了胃口最小的小朋友，換成「剛好夠」的那塊不會讓任何人少吃到。排序 O(n log n + m log m)，配對 O(n + m)。' },
        { type: 'p', text: '用最少的點覆蓋所有區間（例如最少射幾支箭打破所有氣球）：區間 `[s, e]` 含端點，求最少幾個點，使每個區間至少含一個點。依結束時間排序，每遇到一個還沒被覆蓋的區間，就在它的結束點 e 放一個點，並跳過所有 `s <= 這個點` 的區間。點放在結束點上，是在不漏掉這個區間的前提下盡量往右放，能順便蓋住最多後面的區間；這和活動選擇是同一個交換論證，答案甚至剛好等於「最多幾個兩兩不相交的閉區間」。注意這裡端點相接算「被同一個點蓋住」，條件是 `<=`，和活動選擇相反。' },
        { type: 'table', head: ['模式', '先排序什麼', '貪心規則', '常見錯誤'], rows: [
          ['活動選擇', '結束時間（同分比開始）', '`start >= last_end` 就選', '依開始時間或長度排序；`>=` 寫成 `>`'],
          ['最短工作優先', '工作時間', '由短到長依序做', '總和用 `int` 溢位'],
          ['兩序列配對', '兩邊都由小到大', '最小的夠用就配對', '只排一邊，或用最大的餅乾去配'],
          ['最少點覆蓋區間', '結束時間', '在第一個沒蓋到的區間結束點放點', '點放在開始點；端點相接的條件寫錯'],
        ] },
        { type: 'p', text: '圖論中也有貪心：Dijkstra 最短路徑（A16）每次確定「目前距離最小」的節點，正確性同樣靠「邊權不為負」這個前提下的交換推理，有負權邊時就會錯。認得這些模式後，遇到新題目先想「排序之後，是否有一個選法永遠不吃虧？」' },
      ],
    },
    {
      id: 'language-testing', title: '各語言的排序與比較器，以及怎麼檢查貪心',
      blocks: [
        { type: 'p', text: '貪心幾乎都從排序開始，排序鍵寫對了，程式就完成一半。各語言依（結束, 開始）排序的寫法：' },
        { type: 'table', head: ['語言', '依 (結束, 開始) 排序', '穩定嗎', '注意'], rows: [
          ['C++', '存成 `std::pair<end, start>` 直接 `std::sort`；或傳 lambda：`a.end != b.end ? a.end < b.end : a.start < b.start`', '`std::sort` 不穩定，`std::stable_sort` 穩定', '比較器必須是嚴格弱序（strict weak ordering）：寫成 `<=` 是未定義行為，可能讓程式當掉'],
          ['Python', '`acts.sort(key=lambda a: (a[2], a[1]))`，tuple 會依序比較', '`sort`／`sorted` 都穩定', '想用「比較函式」時要 `functools.cmp_to_key` 包起來'],
          ['Java', '`list.sort(Comparator.comparingInt(Activity::end).thenComparingInt(Activity::start))`', '物件（`Arrays.sort(T[], …)`、`List.sort`）用 TimSort，穩定', '用 `Integer.compare(a, b)`，別寫 `a - b`：數值範圍超過約 ±10^9 時相減會溢位；比較器前後矛盾時可能丟出 `IllegalArgumentException`'],
          ['JavaScript', '`acts.sort((a, b) => a.end - b.end || a.start - b.start)`：差是 0 時才比下一個鍵', '`Array.prototype.sort` 從 ES2019 起規定穩定', '比較函式回傳負數、0 或正數，不是 true／false；不傳比較函式時會把數字當字串排序（10 排在 9 前面）'],
        ] },
        { type: 'p', text: '同分（tie）怎麼處理？只求「最多幾個」時，結束時間相同的活動誰先誰後都不影響個數。但只要輸出內容和順序有關，例如印出選了哪些活動、或依序列出工作，同分的順序就會改變輸出：不穩定的 `std::sort` 甚至可能在不同編譯器上給出不同結果。做法有兩種：把排序鍵補完整，例如（結束, 開始, 名稱）或（結束, 開始, 輸入編號），讓任兩個不同的元素都分得出先後；或用穩定排序，同分時保持輸入順序。本課的範例兩種都用了，各語言的輸出才會一字不差。' },
        { type: 'p', text: '怎麼知道自己的貪心規則對不對？除了試著寫交換論證，最可靠的習慣是對拍（stress testing）：寫一個慢但一定對的暴力解（列舉所有 2^n 種選法，n ≤ 6 就只有 64 種），用固定種子的亂數產生大量小測資，比較兩者的答案，第一筆不一致的測資就是反例。下面的範例一次對拍三種規則各 1000 組。' },
        { type: 'example', id: 'stress-test' },
        { type: 'p', text: '「結束最早」1000 組全對；「開始最早」錯了 41 組、「最短優先」錯了 8 組，而且直接給出小反例，例如 (8, 10) (4, 9) (9, 11)：最短的是 (8, 10)，選了它，(4, 9) 和 (9, 11) 都和它重疊，只有 1 個；最佳是 (4, 9) (9, 11)。注意「最短優先」只錯 0.8%，隨便手寫幾組很容易全部通過。範例用自己寫的線性同餘亂數（`seed = (seed × 1103515245 + 12345) mod 2^31`），各語言產生完全相同的測資（JavaScript 的乘積可能超過 2^53，所以用 `Math.imul` 取低位元）；取亂數時用 `seed >> 16` 的高位元，因為這種模數是 2 的次方的產生器，最低幾個位元的週期很短，不夠亂。' },
        { type: 'callout', tone: 'warning', title: '「範例測資過了」不代表對', text: '題目給的範例通常只有一兩組，而且常常剛好讓錯誤的貪心也答對。上面的「最短優先」在隨機小測資中 99% 以上都答對，只靠範例或手寫幾組幾乎抓不到它。交出貪心解之前，至少做到其中一件：寫出交換論證；或用暴力解在幾百組隨機小測資上對拍，再加上特別的情況（只有 1 個、全部相同、互相包含、剛好接上、全部不相交）。' },
      ],
    },
  ],
  examples: [
    {
      id: 'activity-select', title: '活動選擇：依結束時間排序，能放就放', description: '10 個活動不照順序給，依（結束, 開始, 名稱）排序後掃一遍，印出每個活動被選取或捨棄的原因。',
      output: 'sorted: A(1,4) B(3,5) C(0,6) D(4,7) E(3,9) F(5,9) G(7,10) H(8,11) I(10,12) J(2,14)\ntake A(1,4), last_end = 4\nskip B(3,5): starts at 3 < 4\nskip C(0,6): starts at 0 < 4\ntake D(4,7), last_end = 7\nskip E(3,9): starts at 3 < 7\nskip F(5,9): starts at 5 < 7\ntake G(7,10), last_end = 10\nskip H(8,11): starts at 8 < 10\ntake I(10,12), last_end = 12\nskip J(2,14): starts at 2 < 12\nchosen 4: A D G I',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

struct Activity {
    std::string name;
    int start, end;
};

int main() {
    std::vector<Activity> acts = {{"J", 2, 14}, {"C", 0, 6}, {"G", 7, 10}, {"A", 1, 4}, {"F", 5, 9},
                                  {"I", 10, 12}, {"B", 3, 5}, {"H", 8, 11}, {"E", 3, 9}, {"D", 4, 7}};
    // 依 (結束, 開始, 名稱) 排序：鍵完整，各語言的順序就完全一樣
    std::sort(acts.begin(), acts.end(), [](const Activity& a, const Activity& b) {
        if (a.end != b.end) return a.end < b.end;
        if (a.start != b.start) return a.start < b.start;
        return a.name < b.name;
    });
    std::cout << "sorted:";
    for (const Activity& a : acts) std::cout << " " << a.name << "(" << a.start << "," << a.end << ")";
    std::cout << "\n";

    int lastEnd = std::numeric_limits<int>::min();  // 還沒選任何活動
    std::vector<std::string> chosen;
    for (const Activity& a : acts) {
        if (a.start >= lastEnd) {  // 剛好接上（start == lastEnd）也可以
            chosen.push_back(a.name);
            lastEnd = a.end;
            std::cout << "take " << a.name << "(" << a.start << "," << a.end << "), last_end = " << lastEnd << "\n";
        } else {
            std::cout << "skip " << a.name << "(" << a.start << "," << a.end << "): starts at " << a.start << " < " << lastEnd << "\n";
        }
    }
    std::cout << "chosen " << chosen.size() << ":";
    for (const std::string& name : chosen) std::cout << " " << name;
    std::cout << "\n";
    return 0;
}`,
        Python: code`acts = [("J", 2, 14), ("C", 0, 6), ("G", 7, 10), ("A", 1, 4), ("F", 5, 9),
        ("I", 10, 12), ("B", 3, 5), ("H", 8, 11), ("E", 3, 9), ("D", 4, 7)]
# 依 (結束, 開始, 名稱) 排序：鍵完整，各語言的順序就完全一樣
acts.sort(key=lambda a: (a[2], a[1], a[0]))
print("sorted: " + " ".join(f"{name}({s},{e})" for name, s, e in acts))

last_end = float("-inf")  # 還沒選任何活動
chosen = []
for name, start, end in acts:
    if start >= last_end:  # 剛好接上（start == last_end）也可以
        chosen.append(name)
        last_end = end
        print(f"take {name}({start},{end}), last_end = {end}")
    else:
        print(f"skip {name}({start},{end}): starts at {start} < {last_end}")
print(f"chosen {len(chosen)}: {' '.join(chosen)}")`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    record Activity(String name, int start, int end) {}

    public static void main(String[] args) {
        List<Activity> acts = new ArrayList<>(List.of(
            new Activity("J", 2, 14), new Activity("C", 0, 6), new Activity("G", 7, 10), new Activity("A", 1, 4),
            new Activity("F", 5, 9), new Activity("I", 10, 12), new Activity("B", 3, 5), new Activity("H", 8, 11),
            new Activity("E", 3, 9), new Activity("D", 4, 7)));
        // 依 (結束, 開始, 名稱) 排序：鍵完整，各語言的順序就完全一樣
        acts.sort(Comparator.comparingInt(Activity::end).thenComparingInt(Activity::start).thenComparing(Activity::name));
        StringBuilder sorted = new StringBuilder("sorted:");
        for (Activity a : acts) sorted.append(" ").append(a.name()).append("(").append(a.start()).append(",").append(a.end()).append(")");
        System.out.println(sorted);

        int lastEnd = Integer.MIN_VALUE;  // 還沒選任何活動
        List<String> chosen = new ArrayList<>();
        for (Activity a : acts) {
            String label = a.name() + "(" + a.start() + "," + a.end() + ")";
            if (a.start() >= lastEnd) {  // 剛好接上（start == lastEnd）也可以
                chosen.add(a.name());
                lastEnd = a.end();
                System.out.println("take " + label + ", last_end = " + lastEnd);
            } else {
                System.out.println("skip " + label + ": starts at " + a.start() + " < " + lastEnd);
            }
        }
        System.out.println("chosen " + chosen.size() + ": " + String.join(" ", chosen));
    }
}`,
        JavaScript: code`const acts = [
    { name: "J", start: 2, end: 14 }, { name: "C", start: 0, end: 6 }, { name: "G", start: 7, end: 10 },
    { name: "A", start: 1, end: 4 }, { name: "F", start: 5, end: 9 }, { name: "I", start: 10, end: 12 },
    { name: "B", start: 3, end: 5 }, { name: "H", start: 8, end: 11 }, { name: "E", start: 3, end: 9 },
    { name: "D", start: 4, end: 7 },
];
// 依 (結束, 開始, 名稱) 排序：鍵完整，各語言的順序就完全一樣
acts.sort((a, b) => {
    if (a.end !== b.end) return a.end - b.end;
    if (a.start !== b.start) return a.start - b.start;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
});
const label = a => a.name + "(" + a.start + "," + a.end + ")";
console.log("sorted: " + acts.map(label).join(" "));

let lastEnd = -Infinity;  // 還沒選任何活動
const chosen = [];
for (const a of acts) {
    if (a.start >= lastEnd) {  // 剛好接上（start == lastEnd）也可以
        chosen.push(a.name);
        lastEnd = a.end;
        console.log("take " + label(a) + ", last_end = " + lastEnd);
    } else {
        console.log("skip " + label(a) + ": starts at " + a.start + " < " + lastEnd);
    }
}
console.log("chosen " + chosen.length + ": " + chosen.join(" "));`,
      },
    },
    {
      id: 'coin-compare', title: '找零：貪心和最少枚數的對照', description: '對 {1, 5, 10, 50} 與 {1, 3, 4}，逐一比較貪心的枚數和動態規劃算出的最少枚數，印出貪心吃虧的金額。',
      output: '{1, 5, 10, 50}: greedy is optimal for 200 of amounts 1..200\n{1, 3, 4} amount 6: greedy 4+1+1 (3 coins), best 3+3 (2 coins)\n{1, 3, 4} amount 10: greedy 4+4+1+1 (4 coins), best 4+3+3 (3 coins)\n{1, 3, 4} amount 14: greedy 4+4+4+1+1 (5 coins), best 4+4+3+3 (4 coins)\n{1, 3, 4} amount 18: greedy 4+4+4+4+1+1 (6 coins), best 4+4+4+3+3 (5 coins)\n{1, 3, 4}: greedy is optimal for 16 of amounts 1..20',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 貪心：面額由大到小，能拿就拿。coins 已由大到小排好，而且含 1，一定湊得出來。
std::vector<int> greedyChange(const std::vector<int>& coins, int amount) {
    std::vector<int> used;
    for (int c : coins) {
        while (amount >= c) {
            amount -= c;
            used.push_back(c);
        }
    }
    return used;
}

// 最少枚數（動態規劃，A17 會詳細說明）：best[a] = min(best[a - c] + 1)。
std::vector<int> minChange(const std::vector<int>& coins, int amount) {
    const int INF = 1000000000;
    std::vector<int> best(amount + 1, INF);
    best[0] = 0;
    for (int a = 1; a <= amount; ++a) {
        for (int c : coins) {
            if (c <= a && best[a - c] + 1 < best[a]) best[a] = best[a - c] + 1;
        }
    }
    std::vector<int> used;  // 還原：每次挑最大的、能讓剩下的金額恰好少用一枚的硬幣
    for (int a = amount; a > 0;) {
        for (int c : coins) {
            if (c <= a && best[a - c] + 1 == best[a]) {
                used.push_back(c);
                a -= c;
                break;
            }
        }
    }
    return used;
}

std::string join(const std::vector<int>& v) {
    std::string s;
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? "+" : "") + std::to_string(v[i]);
    return s;
}

int main() {
    struct System { std::string name; std::vector<int> coins; int limit; };
    std::vector<System> systems = {{"{1, 5, 10, 50}", {50, 10, 5, 1}, 200}, {"{1, 3, 4}", {4, 3, 1}, 20}};
    for (const System& sys : systems) {
        int optimal = 0;
        for (int amount = 1; amount <= sys.limit; ++amount) {
            std::vector<int> g = greedyChange(sys.coins, amount), b = minChange(sys.coins, amount);
            if (g.size() == b.size()) {
                ++optimal;
            } else {
                std::cout << sys.name << " amount " << amount << ": greedy " << join(g) << " (" << g.size()
                          << " coins), best " << join(b) << " (" << b.size() << " coins)\n";
            }
        }
        std::cout << sys.name << ": greedy is optimal for " << optimal << " of amounts 1.." << sys.limit << "\n";
    }
    return 0;
}`,
        Python: code`def greedy_change(coins, amount):
    """貪心：面額由大到小，能拿就拿。coins 已由大到小排好，而且含 1，一定湊得出來。"""
    used = []
    for c in coins:
        while amount >= c:
            amount -= c
            used.append(c)
    return used


def min_change(coins, amount):
    """最少枚數（動態規劃，A17 會詳細說明）：best[a] = min(best[a - c] + 1)。"""
    best = [0] + [float("inf")] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    used, a = [], amount  # 還原：每次挑最大的、能讓剩下的金額恰好少用一枚的硬幣
    while a > 0:
        for c in coins:
            if c <= a and best[a - c] + 1 == best[a]:
                used.append(c)
                a -= c
                break
    return used


for name, coins, limit in [("{1, 5, 10, 50}", [50, 10, 5, 1], 200), ("{1, 3, 4}", [4, 3, 1], 20)]:
    optimal = 0
    for amount in range(1, limit + 1):
        g, b = greedy_change(coins, amount), min_change(coins, amount)
        if len(g) == len(b):
            optimal += 1
        else:
            print(f"{name} amount {amount}: greedy {'+'.join(map(str, g))} ({len(g)} coins), "
                  f"best {'+'.join(map(str, b))} ({len(b)} coins)")
    print(f"{name}: greedy is optimal for {optimal} of amounts 1..{limit}")`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class Main {
    // 貪心：面額由大到小，能拿就拿。coins 已由大到小排好，而且含 1，一定湊得出來。
    static List<Integer> greedyChange(int[] coins, int amount) {
        List<Integer> used = new ArrayList<>();
        for (int c : coins) {
            while (amount >= c) {
                amount -= c;
                used.add(c);
            }
        }
        return used;
    }

    // 最少枚數（動態規劃，A17 會詳細說明）：best[a] = min(best[a - c] + 1)。
    static List<Integer> minChange(int[] coins, int amount) {
        int[] best = new int[amount + 1];
        Arrays.fill(best, 1_000_000_000);
        best[0] = 0;
        for (int a = 1; a <= amount; a++) {
            for (int c : coins) {
                if (c <= a && best[a - c] + 1 < best[a]) best[a] = best[a - c] + 1;
            }
        }
        List<Integer> used = new ArrayList<>();  // 還原：每次挑最大的、能讓剩下的金額恰好少用一枚的硬幣
        for (int a = amount; a > 0;) {
            for (int c : coins) {
                if (c <= a && best[a - c] + 1 == best[a]) {
                    used.add(c);
                    a -= c;
                    break;
                }
            }
        }
        return used;
    }

    static String join(List<Integer> v) {
        return v.stream().map(String::valueOf).collect(Collectors.joining("+"));
    }

    public static void main(String[] args) {
        String[] names = {"{1, 5, 10, 50}", "{1, 3, 4}"};
        int[][] systems = {{50, 10, 5, 1}, {4, 3, 1}};
        int[] limits = {200, 20};
        for (int s = 0; s < systems.length; s++) {
            int optimal = 0;
            for (int amount = 1; amount <= limits[s]; amount++) {
                List<Integer> g = greedyChange(systems[s], amount), b = minChange(systems[s], amount);
                if (g.size() == b.size()) {
                    optimal++;
                } else {
                    System.out.println(names[s] + " amount " + amount + ": greedy " + join(g) + " (" + g.size()
                        + " coins), best " + join(b) + " (" + b.size() + " coins)");
                }
            }
            System.out.println(names[s] + ": greedy is optimal for " + optimal + " of amounts 1.." + limits[s]);
        }
    }
}`,
        JavaScript: code`// 貪心：面額由大到小，能拿就拿。coins 已由大到小排好，而且含 1，一定湊得出來。
function greedyChange(coins, amount) {
    const used = [];
    for (const c of coins) {
        while (amount >= c) {
            amount -= c;
            used.push(c);
        }
    }
    return used;
}

// 最少枚數（動態規劃，A17 會詳細說明）：best[a] = min(best[a - c] + 1)。
function minChange(coins, amount) {
    const best = new Array(amount + 1).fill(Infinity);
    best[0] = 0;
    for (let a = 1; a <= amount; a++) {
        for (const c of coins) {
            if (c <= a && best[a - c] + 1 < best[a]) best[a] = best[a - c] + 1;
        }
    }
    const used = [];  // 還原：每次挑最大的、能讓剩下的金額恰好少用一枚的硬幣
    let a = amount;
    while (a > 0) {
        for (const c of coins) {
            if (c <= a && best[a - c] + 1 === best[a]) {
                used.push(c);
                a -= c;
                break;
            }
        }
    }
    return used;
}

const systems = [
    { name: "{1, 5, 10, 50}", coins: [50, 10, 5, 1], limit: 200 },
    { name: "{1, 3, 4}", coins: [4, 3, 1], limit: 20 },
];
for (const { name, coins, limit } of systems) {
    let optimal = 0;
    for (let amount = 1; amount <= limit; amount++) {
        const g = greedyChange(coins, amount), b = minChange(coins, amount);
        if (g.length === b.length) {
            optimal++;
        } else {
            console.log(name + " amount " + amount + ": greedy " + g.join("+") + " (" + g.length +
                " coins), best " + b.join("+") + " (" + b.length + " coins)");
        }
    }
    console.log(name + ": greedy is optimal for " + optimal + " of amounts 1.." + limit);
}`,
      },
    },
    {
      id: 'sjf-wait', title: '最短工作優先：等待時間總和', description: '5 個工作依輸入順序、由短到長、由長到短各做一次，比較等待時間總和；同樣長的工作用穩定排序保持輸入順序。',
      output: 'input order: P1 P2 P3 P4 P5 total wait = 54\n  P5 waits 0, runs 1\n  P2 waits 1, runs 3\n  P4 waits 4, runs 3\n  P3 waits 7, runs 5\n  P1 waits 12, runs 8\nshortest first: P5 P2 P4 P3 P1 total wait = 24\nlongest first: P1 P3 P2 P4 P5 total wait = 56',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

struct Job {
    std::string name;
    int time;
};

// 每個工作的等待時間 = 它開始前經過的時間；總和可能很大，用 long long。
long long totalWait(const std::vector<Job>& jobs) {
    long long waited = 0, clock = 0;
    for (const Job& j : jobs) {
        waited += clock;
        clock += j.time;
    }
    return waited;
}

std::string names(const std::vector<Job>& jobs) {
    std::string s;
    for (const Job& j : jobs) s += (s.empty() ? "" : " ") + j.name;
    return s;
}

int main() {
    std::vector<Job> jobs = {{"P1", 8}, {"P2", 3}, {"P3", 5}, {"P4", 3}, {"P5", 1}};
    std::cout << "input order: " << names(jobs) << " total wait = " << totalWait(jobs) << "\n";

    std::vector<Job> sjf = jobs;
    // stable_sort：同樣長的 P2、P4 保持輸入順序（std::sort 不保證）
    std::stable_sort(sjf.begin(), sjf.end(), [](const Job& a, const Job& b) { return a.time < b.time; });
    long long clock = 0;
    for (const Job& j : sjf) {
        std::cout << "  " << j.name << " waits " << clock << ", runs " << j.time << "\n";
        clock += j.time;
    }
    std::cout << "shortest first: " << names(sjf) << " total wait = " << totalWait(sjf) << "\n";

    std::vector<Job> lng = jobs;
    std::stable_sort(lng.begin(), lng.end(), [](const Job& a, const Job& b) { return a.time > b.time; });
    std::cout << "longest first: " << names(lng) << " total wait = " << totalWait(lng) << "\n";
    return 0;
}`,
        Python: code`def total_wait(jobs):
    """每個工作的等待時間 = 它開始前經過的時間（Python 的 int 不會溢位）。"""
    waited, clock = 0, 0
    for _, t in jobs:
        waited += clock
        clock += t
    return waited


def names(jobs):
    return " ".join(name for name, _ in jobs)


jobs = [("P1", 8), ("P2", 3), ("P3", 5), ("P4", 3), ("P5", 1)]
print(f"input order: {names(jobs)} total wait = {total_wait(jobs)}")

sjf = sorted(jobs, key=lambda j: j[1])  # sorted 是穩定的：同樣長的 P2、P4 保持輸入順序
clock = 0
for name, t in sjf:
    print(f"  {name} waits {clock}, runs {t}")
    clock += t
print(f"shortest first: {names(sjf)} total wait = {total_wait(sjf)}")

longest = sorted(jobs, key=lambda j: -j[1])
print(f"longest first: {names(longest)} total wait = {total_wait(longest)}")`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

public class Main {
    record Job(String name, int time) {}

    // 每個工作的等待時間 = 它開始前經過的時間；總和可能很大，用 long。
    static long totalWait(List<Job> jobs) {
        long waited = 0, clock = 0;
        for (Job j : jobs) {
            waited += clock;
            clock += j.time();
        }
        return waited;
    }

    static String names(List<Job> jobs) {
        return jobs.stream().map(Job::name).collect(Collectors.joining(" "));
    }

    public static void main(String[] args) {
        List<Job> jobs = List.of(new Job("P1", 8), new Job("P2", 3), new Job("P3", 5), new Job("P4", 3), new Job("P5", 1));
        System.out.println("input order: " + names(jobs) + " total wait = " + totalWait(jobs));

        List<Job> sjf = new ArrayList<>(jobs);
        sjf.sort(Comparator.comparingInt(Job::time));  // List.sort 是穩定的：P2、P4 保持輸入順序
        long clock = 0;
        for (Job j : sjf) {
            System.out.println("  " + j.name() + " waits " + clock + ", runs " + j.time());
            clock += j.time();
        }
        System.out.println("shortest first: " + names(sjf) + " total wait = " + totalWait(sjf));

        List<Job> longest = new ArrayList<>(jobs);
        longest.sort(Comparator.comparingInt(Job::time).reversed());
        System.out.println("longest first: " + names(longest) + " total wait = " + totalWait(longest));
    }
}`,
        JavaScript: code`// 每個工作的等待時間 = 它開始前經過的時間（number 在 2^53 以內都是精確的整數）
function totalWait(jobs) {
    let waited = 0, clock = 0;
    for (const j of jobs) {
        waited += clock;
        clock += j.time;
    }
    return waited;
}

const names = jobs => jobs.map(j => j.name).join(" ");

const jobs = [{ name: "P1", time: 8 }, { name: "P2", time: 3 }, { name: "P3", time: 5 },
    { name: "P4", time: 3 }, { name: "P5", time: 1 }];
console.log("input order: " + names(jobs) + " total wait = " + totalWait(jobs));

const sjf = [...jobs].sort((a, b) => a.time - b.time);  // sort 是穩定的：同樣長的 P2、P4 保持輸入順序
let clock = 0;
for (const j of sjf) {
    console.log("  " + j.name + " waits " + clock + ", runs " + j.time);
    clock += j.time;
}
console.log("shortest first: " + names(sjf) + " total wait = " + totalWait(sjf));

const longest = [...jobs].sort((a, b) => b.time - a.time);
console.log("longest first: " + names(longest) + " total wait = " + totalWait(longest));`,
      },
    },
    {
      id: 'stress-test', title: '對拍：用暴力解檢查三種貪心規則', description: '用固定種子的亂數產生 1000 組最多 6 個活動的小測資，三種排序規則的貪心各和列舉全部子集合的暴力解比較，印出錯誤次數與第一個反例。',
      output: '1000 random tests, n <= 6\nearliest end: 0 wrong\nearliest start: 41 wrong, e.g. (5,7) (2,7) (4,5) (6,8) -> greedy 1, best 2\nshortest: 8 wrong, e.g. (8,10) (4,9) (9,11) -> greedy 1, best 2',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

typedef std::pair<int, int> Interval;  // (開始, 結束)

long long seed = 2026;
// 線性同餘亂數：各語言算出同一串數；取高位元，低位元的週期太短。
int rnd(int k) {
    seed = (seed * 1103515245 + 12345) % 2147483648LL;
    return static_cast<int>((seed >> 16) % k);
}

bool disjoint(const Interval& a, const Interval& b) { return a.second <= b.first || b.second <= a.first; }

// 排序鍵：0 = 結束最早，1 = 開始最早，2 = 最短
std::pair<int, int> key(const Interval& x, int rule) {
    if (rule == 0) return {x.second, x.first};
    if (rule == 1) return {x.first, x.second};
    return {x.second - x.first, x.first};
}

// 依規則排序後，和所有已選的都不重疊就選
int greedy(std::vector<Interval> iv, int rule) {
    std::sort(iv.begin(), iv.end(), [rule](const Interval& a, const Interval& b) { return key(a, rule) < key(b, rule); });
    std::vector<Interval> chosen;
    for (const Interval& x : iv) {
        bool ok = true;
        for (const Interval& c : chosen) ok = ok && disjoint(x, c);
        if (ok) chosen.push_back(x);
    }
    return static_cast<int>(chosen.size());
}

// 暴力解：列舉全部 2^n 個子集合，一定對
int brute(const std::vector<Interval>& iv) {
    int n = static_cast<int>(iv.size()), best = 0;
    for (int mask = 0; mask < (1 << n); ++mask) {
        bool ok = true;
        int count = 0;
        for (int i = 0; i < n; ++i) {
            if (!((mask >> i) & 1)) continue;
            ++count;
            for (int j = i + 1; j < n; ++j) {
                if (((mask >> j) & 1) && !disjoint(iv[i], iv[j])) ok = false;
            }
        }
        if (ok) best = std::max(best, count);
    }
    return best;
}

int main() {
    const std::string names[3] = {"earliest end", "earliest start", "shortest"};
    int wrong[3] = {0, 0, 0};
    std::string example[3];
    const int tests = 1000;
    for (int t = 0; t < tests; ++t) {
        int n = 1 + rnd(6);
        std::vector<Interval> iv;
        for (int i = 0; i < n; ++i) {
            int s = rnd(10);
            int e = s + 1 + rnd(5);
            iv.push_back({s, e});
        }
        int best = brute(iv);
        for (int r = 0; r < 3; ++r) {
            int g = greedy(iv, r);
            if (g == best) continue;
            if (wrong[r]++ > 0) continue;  // 只記下第一個反例
            for (const Interval& x : iv) example[r] += "(" + std::to_string(x.first) + "," + std::to_string(x.second) + ") ";
            example[r] += "-> greedy " + std::to_string(g) + ", best " + std::to_string(best);
        }
    }
    std::cout << tests << " random tests, n <= 6\n";
    for (int r = 0; r < 3; ++r) {
        std::cout << names[r] << ": " << wrong[r] << " wrong";
        if (wrong[r] > 0) std::cout << ", e.g. " << example[r];
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`from itertools import combinations

seed = 2026


def rnd(k):
    """線性同餘亂數：各語言算出同一串數；取高位元，低位元的週期太短。"""
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed >> 16) % k


def disjoint(a, b):
    return a[1] <= b[0] or b[1] <= a[0]


RULES = [
    ("earliest end", lambda x: (x[1], x[0])),
    ("earliest start", lambda x: (x[0], x[1])),
    ("shortest", lambda x: (x[1] - x[0], x[0])),
]


def greedy(iv, key):
    """依規則排序後，和所有已選的都不重疊就選。"""
    chosen = []
    for x in sorted(iv, key=key):
        if all(disjoint(x, c) for c in chosen):
            chosen.append(x)
    return len(chosen)


def brute(iv):
    """暴力解：由大到小試每一種大小的組合，一定對。"""
    for k in range(len(iv), 0, -1):
        if any(all(disjoint(a, b) for a, b in combinations(pick, 2)) for pick in combinations(iv, k)):
            return k
    return 0


wrong = [0] * len(RULES)
example = [""] * len(RULES)
tests = 1000
for _ in range(tests):
    n = 1 + rnd(6)
    iv = []
    for _ in range(n):
        s = rnd(10)
        iv.append((s, s + 1 + rnd(5)))
    best = brute(iv)
    for r, (_, key) in enumerate(RULES):
        g = greedy(iv, key)
        if g != best:
            wrong[r] += 1
            if wrong[r] == 1:  # 只記下第一個反例
                example[r] = " ".join(f"({s},{e})" for s, e in iv) + f" -> greedy {g}, best {best}"
print(f"{tests} random tests, n <= 6")
for r, (name, _) in enumerate(RULES):
    print(f"{name}: {wrong[r]} wrong" + (f", e.g. {example[r]}" if wrong[r] else ""))`,
        Java: code`import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Main {
    static long seed = 2026;

    // 線性同餘亂數：各語言算出同一串數；取高位元，低位元的週期太短。
    static int rnd(int k) {
        seed = (seed * 1103515245L + 12345) % 2147483648L;
        return (int) ((seed >> 16) % k);
    }

    static boolean disjoint(int[] a, int[] b) {
        return a[1] <= b[0] || b[1] <= a[0];
    }

    // 排序鍵：0 = 結束最早，1 = 開始最早，2 = 最短；用 Integer.compare，不用相減
    static Comparator<int[]> rule(int r) {
        if (r == 0) return Comparator.<int[]>comparingInt(x -> x[1]).thenComparingInt(x -> x[0]);
        if (r == 1) return Comparator.<int[]>comparingInt(x -> x[0]).thenComparingInt(x -> x[1]);
        return Comparator.<int[]>comparingInt(x -> x[1] - x[0]).thenComparingInt(x -> x[0]);
    }

    // 依規則排序後，和所有已選的都不重疊就選
    static int greedy(List<int[]> iv, int r) {
        List<int[]> sorted = new ArrayList<>(iv);
        sorted.sort(rule(r));
        List<int[]> chosen = new ArrayList<>();
        for (int[] x : sorted) {
            boolean ok = true;
            for (int[] c : chosen) ok = ok && disjoint(x, c);
            if (ok) chosen.add(x);
        }
        return chosen.size();
    }

    // 暴力解：列舉全部 2^n 個子集合，一定對
    static int brute(List<int[]> iv) {
        int n = iv.size(), best = 0;
        for (int mask = 0; mask < (1 << n); mask++) {
            boolean ok = true;
            int count = 0;
            for (int i = 0; i < n; i++) {
                if (((mask >> i) & 1) == 0) continue;
                count++;
                for (int j = i + 1; j < n; j++) {
                    if (((mask >> j) & 1) == 1 && !disjoint(iv.get(i), iv.get(j))) ok = false;
                }
            }
            if (ok) best = Math.max(best, count);
        }
        return best;
    }

    public static void main(String[] args) {
        String[] names = {"earliest end", "earliest start", "shortest"};
        int[] wrong = new int[3];
        String[] example = new String[3];
        int tests = 1000;
        for (int t = 0; t < tests; t++) {
            int n = 1 + rnd(6);
            List<int[]> iv = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                int s = rnd(10);
                int e = s + 1 + rnd(5);
                iv.add(new int[] {s, e});
            }
            int best = brute(iv);
            for (int r = 0; r < 3; r++) {
                int g = greedy(iv, r);
                if (g == best) continue;
                if (wrong[r]++ > 0) continue;  // 只記下第一個反例
                StringBuilder sb = new StringBuilder();
                for (int[] x : iv) sb.append("(").append(x[0]).append(",").append(x[1]).append(") ");
                example[r] = sb + "-> greedy " + g + ", best " + best;
            }
        }
        System.out.println(tests + " random tests, n <= 6");
        for (int r = 0; r < 3; r++) {
            System.out.println(names[r] + ": " + wrong[r] + " wrong" + (wrong[r] > 0 ? ", e.g. " + example[r] : ""));
        }
    }
}`,
        JavaScript: code`let seed = 2026;

// 線性同餘亂數：各語言算出同一串數；取高位元，低位元的週期太短。
// seed * 1103515245 可能超過 2^53，number 會算不準；Math.imul 只取乘積的低 32 位元（精確），
// 再用 & 0x7fffffff 留下低 31 位元，就是 mod 2^31。
function rnd(k) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return (seed >> 16) % k;
}

const disjoint = (a, b) => a[1] <= b[0] || b[1] <= a[0];

// 排序規則（區間是 [開始, 結束]）：先比第一個鍵，相同再比第二個鍵
const RULES = [
    { name: "earliest end", cmp: (x, y) => x[1] - y[1] || x[0] - y[0] },
    { name: "earliest start", cmp: (x, y) => x[0] - y[0] || x[1] - y[1] },
    { name: "shortest", cmp: (x, y) => (x[1] - x[0]) - (y[1] - y[0]) || x[0] - y[0] },
];

// 依規則排序後，和所有已選的都不重疊就選
function greedy(iv, cmp) {
    const chosen = [];
    for (const x of [...iv].sort(cmp)) {
        if (chosen.every(c => disjoint(x, c))) chosen.push(x);
    }
    return chosen.length;
}

// 暴力解：列舉全部 2^n 個子集合，一定對
function brute(iv) {
    const n = iv.length;
    let best = 0;
    for (let mask = 0; mask < (1 << n); mask++) {
        let ok = true, count = 0;
        for (let i = 0; i < n; i++) {
            if (((mask >> i) & 1) === 0) continue;
            count++;
            for (let j = i + 1; j < n; j++) {
                if (((mask >> j) & 1) === 1 && !disjoint(iv[i], iv[j])) ok = false;
            }
        }
        if (ok) best = Math.max(best, count);
    }
    return best;
}

const wrong = [0, 0, 0];
const example = ["", "", ""];
const tests = 1000;
for (let t = 0; t < tests; t++) {
    const n = 1 + rnd(6);
    const iv = [];
    for (let i = 0; i < n; i++) {
        const s = rnd(10);
        iv.push([s, s + 1 + rnd(5)]);
    }
    const best = brute(iv);
    RULES.forEach((rule, r) => {
        const g = greedy(iv, rule.cmp);
        if (g === best) return;
        wrong[r]++;
        if (wrong[r] === 1) {  // 只記下第一個反例
            example[r] = iv.map(x => "(" + x[0] + "," + x[1] + ")").join(" ") + " -> greedy " + g + ", best " + best;
        }
    });
}
console.log(tests + " random tests, n <= 6");
RULES.forEach((rule, r) => {
    console.log(rule.name + ": " + wrong[r] + " wrong" + (wrong[r] > 0 ? ", e.g. " + example[r] : ""));
});`,
      },
    },
  ],
  visualization: {
    kind: 'greedy-choice', title: '活動選擇：依結束時間排序，能放就放', language: 'Python',
    code: code`acts = [("A", 1, 4), ("B", 3, 5), ("C", 0, 6),
        ("D", 4, 7), ("E", 7, 9), ("F", 5, 9)]
acts.sort(key=lambda a: (a[2], a[1]))  # 依 (結束, 開始) 排序
last_end = float("-inf")
chosen = []
for name, start, end in acts:
    if start >= last_end:  # 剛好接上（start == last_end）也可以
        chosen.append(name)
        last_end = end
print(len(chosen), chosen)`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-trace', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: code`meetings = [(1, 3), (2, 4), (3, 5), (0, 7), (5, 6), (4, 8), (6, 9)]
meetings.sort(key=lambda m: (m[1], m[0]))
last_end = float("-inf")
picked = []
for s, e in meetings:
    if s >= last_end:
        picked.append((s, e))
        last_end = e
print(picked)` },
      options: ['[(1, 3), (3, 5), (5, 6), (6, 9)]', '[(1, 3), (5, 6)]', '[(0, 7)]', '[(1, 3), (3, 5), (5, 6)]'],
      answer: 0, explanation: '依結束時間排序後是 (1, 3) (2, 4) (3, 5) (5, 6) (0, 7) (4, 8) (6, 9)。選 (1, 3)，last_end = 3；(2, 4) 從 2 開始 < 3，捨棄；(3, 5) 從 3 開始，剛好接上，選；(5, 6) 選；(0, 7)、(4, 8) 都早於 6 開始，捨棄；(6, 9) 從 6 開始，選。「[(1, 3), (5, 6)]」是把 `>=` 寫成 `>`，剛好接上的 (3, 5) 和 (6, 9) 都被捨棄；「[(0, 7)]」是依開始時間排序的結果；最後一個選項漏掉了排在最後的 (6, 9)。',
    },
    {
      id: 'q-counter', prompt: '下列哪一組會議，能證明「開始最早的先選」不一定得到最多場？（每次選開始最早、且和已選的都不重疊的會議）',
      options: ['(1, 2) (3, 4) (5, 6)', '(0, 10) (1, 2) (3, 4)', '(1, 5) (2, 3) (6, 7)', '(0, 3) (3, 6) (6, 9)'],
      answer: 1, explanation: '開始最早的是 (0, 10)，選了它之後 (1, 2)、(3, 4) 都和它重疊，只有 1 場；但 (1, 2) (3, 4) 可以排 2 場。其他三組都不是反例：(1, 2) (3, 4) (5, 6) 互不重疊，任何規則都得到 3 場；(1, 5) (2, 3) (6, 7) 依開始時間選到 (1, 5) 和 (6, 7)，共 2 場，最佳也是 2 場（(1, 5) 和 (2, 3) 不能同時選）；(0, 3) (3, 6) (6, 9) 剛好接成一串，也是 3 場。反例要讓規則「答錯」，不只是「選的和最佳解不同」。',
    },
    {
      id: 'q-coin', prompt: '硬幣面額 {1, 7, 10}，下面的程式輸出什麼？',
      code: { language: 'Python', text: code`coins = [10, 7, 1]
amount = 14
greedy, left = 0, amount
for c in coins:
    greedy += left // c
    left %= c
best = [0] + [float("inf")] * amount
for a in range(1, amount + 1):
    best[a] = min(best[a - c] + 1 for c in coins if c <= a)
print(greedy, best[amount])` },
      options: ['5 2', '2 2', '5 5', '2 5'],
      answer: 0, explanation: '貪心先拿一枚 10，剩 4，7 拿不下，只能拿四枚 1，共 5 枚；動態規劃找到 7 + 7，共 2 枚。所以印出 `5 2`：{1, 7, 10} 不是能貪心的面額。「2 2」以為貪心也會找到 7 + 7，但貪心拿了 10 就不會反悔；「5 5」以為動態規劃也只能照大面額拿；「2 5」把兩個數字的意義弄反了，最少枚數不可能比貪心的枚數多。',
    },
    {
      id: 'q-exchange', prompt: '證明活動選擇的貪心正確時：設最佳解依時間排序是 o1, o2, …, ok，貪心第一個選的 g 是所有活動中結束最早的。把 o1 換成 g 之後，為什麼仍是一組合法、而且一樣多的選法？',
      options: ['因為 g.end ≤ o1.end ≤ o2.start，g 不會和 o2…ok 重疊，個數仍是 k', '因為 g.start ≤ o1.start，g 比 o1 早開始', '因為 g 是所有活動中最短的', '因為 g 一定就是 o1，換了等於沒換'],
      answer: 0, explanation: '交換論證只需要一件事：g 結束得不比 o1 晚，而 o1 本來就在 o2 開始之前結束，所以 g 也在 o2 開始之前結束，和後面的活動都不重疊；拿掉一個、放進一個，個數不變。「g 比 o1 早開始」既不一定成立（結束最早的不一定開始最早），也證明不了不重疊；「g 最短」不一定成立，而且最短優先本身就有反例；最佳解可能有好幾組，o1 不一定是 g，例如 (1, 3) (2, 4) (4, 5) 中 (2, 4) (4, 5) 也是一組最佳解，但貪心選的是 (1, 3)，這正是需要「交換」的原因。',
    },
    {
      id: 'q-complexity', prompt: 'n 個活動，比較兩種做法的時間複雜度：(1) 依結束時間排序，再掃描一遍；(2) 不排序，每一輪掃過所有活動，找出和已選的不衝突、而且結束最早的一個選進來，直到找不到為止。',
      options: ['(1) O(n log n)，(2) O(n^2)', '(1) O(n)，(2) O(n log n)', '(1) O(n log n)，(2) O(n log n)', '(1) O(n^2)，(2) O(n^2)'],
      answer: 0, explanation: '(1) 排序 O(n log n) 加上一次 O(n) 的掃描，由排序決定，是 O(n log n)。(2) 每一輪都要看過全部 n 個活動，最多選出 n 個（例如全部互不重疊時），所以是 n 輪 × n = O(n^2)；用程式數過，全部不重疊時 n 每加倍，(2) 掃描的次數就變成約 4 倍。選 O(n) 的人忘了排序的成本；認為 (2) 是 O(n log n) 的人把「每輪找最小值」當成了排序，其實它是重複了很多次的線性搜尋。',
    },
    {
      id: 'q-bug', prompt: '下面的程式要算最多能排幾場會議，題目規定「一場的結束時間等於下一場的開始時間時，可以接著開」。哪一組輸入會讓它答錯？',
      code: { language: 'Python', text: code`def max_meetings(meetings):
    count, last_end = 0, float("-inf")
    for s, e in sorted(meetings, key=lambda m: (m[1], m[0])):
        if s > last_end:
            count += 1
            last_end = e
    return count` },
      options: ['[(1, 2), (3, 4), (5, 6)]', '[(1, 3), (3, 5), (5, 7)]', '[(0, 10), (1, 2), (3, 4)]', '[(5, 9)]'],
      answer: 1, explanation: '錯在 `s > last_end`：剛好接上的會議被當成重疊。(1, 3) (3, 5) (5, 7) 可以全部排進去，答案是 3；程式選了 (1, 3) 後，(3, 5) 的 3 > 3 不成立而被捨棄，最後只得到 2。其他輸入沒有剛好接上的情況，所以 `>` 和 `>=` 結果一樣：(1, 2) (3, 4) (5, 6) 得 3；(0, 10) (1, 2) (3, 4) 依結束時間排序後選 (1, 2) (3, 4) 得 2；一場會議得 1。排序的部分是對的，所以要找的是「邊界相等」的測資。',
    },
    {
      id: 'q-choose', prompt: '下列哪一個問題，可以放心用「排序 + 貪心」得到最佳解？',
      options: ['硬幣面額 {1, 3, 4}，求湊出金額 x 的最少枚數', '每個活動有不同的獎金，選互不重疊的活動使獎金總和最大', '一台機器依序做 n 個工作，使所有工作的等待時間總和最小', '列出所有和為 target 的子集合'],
      answer: 2, explanation: '最短工作優先可以用相鄰交換論證證明：長的排在短的前面時，對調兩者總等待時間減少 `t_長 − t_短`，所以由短到長最好。{1, 3, 4} 湊 6 貪心會給 3 枚、最佳是 2 枚，要用動態規劃（A17）；活動有不同獎金時，「結束最早」可能選到獎金很少的活動，例如 (0, 2) 獎金 1、(1, 3) 獎金 100，這是加權區間排程，要用動態規劃；「列出所有」子集合必須真的把每一個都找出來，是回溯（A12）的工作，任何只走一條路的貪心都做不到。',
    },
  ],
  exercises: [
    {
      id: 'e-max-meetings', title: '最多能排幾場會議',
      statement: '會議室一次只能開一場會議。有 n 場會議想借用，第 i 場從時間 s 開始、到時間 e 結束（佔用 `[s, e)`）。一場會議的結束時間等於另一場的開始時間時，可以接著開（例如 (1, 3) 和 (3, 5) 不衝突）；兩場會議衝突，若且唯若 `max(s1, s2) < min(e1, e2)`。請算出最多能排進幾場互不衝突的會議。n 最多 2×10^5：列舉子集合（2^n）或每一輪都重新掃描全部會議（O(n^2)）都太慢，請用排序加貪心做到 O(n log n)。依開始時間或依會議長度排序的貪心都有反例，測資中有專門擋它們的情況。輸入不合法時只輸出一行 `Invalid`：n < 1、數字的個數不是剛好 1 + 2n，或有某場會議的 s ≥ e（長度為 0 或負的會議）。',
      inputFormat: '第一行一個整數 n。接下來 n 行，每行兩個整數 s 與 e，表示一場會議。數字之間以空白或換行分隔。',
      outputFormat: '一個整數：最多能排進的會議數；輸入不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5（n < 1 時輸出 Invalid）', '−10^9 ≤ s < e ≤ 10^9；s ≥ e 時輸出 Invalid', '數字的個數必須剛好是 1 + 2n，否則輸出 Invalid'],
      samples: [{ kind: 'normal', input: '6\n1 4\n3 5\n0 6\n4 7\n7 9\n5 9', output: '3', note: '和視覺化相同的資料：選 (1, 4) (4, 7) (7, 9)，兩次都剛好接上' }],
      tests: [
        { kind: 'normal', input: '6\n1 4\n3 5\n0 6\n4 7\n7 9\n5 9', output: '3', note: '範例' },
        { kind: 'normal', input: '4\n0 10\n1 2\n3 4\n5 6', output: '3', note: '最早開始的 (0, 10) 包住其他三場：依開始時間排序的貪心只得到 1' },
        { kind: 'normal', input: '3\n1 5\n4 7\n6 10', output: '2', note: '最短的 (4, 7) 卡在中間：依長度排序的貪心只得到 1' },
        { kind: 'normal', input: '10\n-3 2\n0 4\n5 9\n1 6\n8 12\n-6 -1\n2 5\n11 13\n6 8\n9 11', output: '5', note: '含負數、沒有排序的混合資料（答案由暴力解確認）' },
        { kind: 'normal', input: '8\n10 20\n12 13\n0 30\n13 15\n15 18\n14 16\n18 25\n20 21', output: '4', note: '長會議包住短會議，短會議彼此接上與交錯' },
        { kind: 'edge', input: '1\n7 8', output: '1', note: 'n = 1' },
        { kind: 'edge', input: '5\n2 5\n2 5\n2 5\n2 5\n2 5', output: '1', note: '全部相同的會議：只能排一場' },
        { kind: 'edge', input: '6\n0 100\n1 99\n2 98\n3 97\n4 96\n5 95', output: '1', note: '一層包一層：只能排一場' },
        { kind: 'edge', input: '5\n4 6\n0 2\n2 4\n8 10\n6 8', output: '5', note: '全部剛好接上（順序打亂）：寫成 `>` 只得到 3' },
        { kind: 'edge', input: '4\n30 40\n0 5\n10 15\n20 25', output: '4', note: '全部不相交，中間有空檔' },
        { kind: 'edge', input: '3\n-5 -3\n-3 0\n-10 -6', output: '3', note: '全部是負數時間：`last_end` 初值寫成 0 或 −1 會得到 0' },
        { kind: 'edge', input: '4\n-1000000000 1000000000\n-1000000000 0\n0 1000000000\n999999999 1000000000', output: '2', note: '最小與最大的時間值' },
        { kind: 'edge', input: '5\n1 9\n5 9\n8 9\n3 9\n9 10', output: '2', note: '四場同時結束（同分），再接一場剛好接上的' },
        { kind: 'edge', input: bigBlocksInput, output: '60000', note: 'n = 8×10^4，每 8 個時間單位一組：一場長會議包住三場剛好接上的短會議，順序打亂。開始最早只得 20000、寫成 `>` 只得 40000、O(n^2) 的做法會超時' },
        { kind: 'edge', input: bigChainInput, output: '70000', note: 'n = 7×10^4 場 [i, i + 1) 由後往前給：全部接成一串，寫成 `>` 只得 35000' },
        { kind: 'edge', input: bigSameInput, output: '1', note: 'n = 2×10^5（上限）場完全相同的會議' },
        { kind: 'error', input: '2\n5 3\n1 2', output: 'Invalid', note: '開始時間晚於結束時間' },
        { kind: 'error', input: '2\n3 3\n1 2', output: 'Invalid', note: '長度為 0 的會議（s = e）' },
        { kind: 'error', input: '0', output: 'Invalid', note: 'n = 0' },
        { kind: 'error', input: '3\n1 2\n3 4', output: 'Invalid', note: '會議少於 n 場' },
        { kind: 'error', input: '2\n1 2\n3 4\n5 6', output: 'Invalid', note: '會議多於 n 場' },
        { kind: 'error', input: '2\n1 2\n3', output: 'Invalid', note: '最後一場只有開始時間' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '依結束時間由早到晚排序，結束相同時再比開始時間；C++ 可以存成 `std::pair<結束, 開始>` 直接 `std::sort`。',
        '用 `last_end` 記住最後選進來的會議的結束時間，初值要比任何時間都小（負無限大或 `LLONG_MIN`／`Long.MIN_VALUE`；JavaScript 用 `-Infinity`），不能用 0。',
        '`s >= last_end` 就選，並更新 `last_end`：等號代表剛好接上。',
        '先把所有數字讀進來，才能檢查個數是否剛好 1 + 2n；再逐場檢查 s < e。',
        '不確定自己的規則對不對時，寫一個列舉全部子集合的暴力解，在 n ≤ 8 的隨機小測資上對拍。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <limits>
#include <utility>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<long long> t;  // 先讀進所有數字，才能檢查個數是否相符
    long long v;
    while (std::cin >> v) t.push_back(v);
    long long n = t.empty() ? 0 : t[0];
    if (n < 1 || static_cast<long long>(t.size()) != 1 + 2 * n) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<std::pair<long long, long long>> m;  // (結束, 開始)：pair 先比結束、再比開始
    m.reserve(n);
    for (long long i = 0; i < n; ++i) {
        long long s = t[1 + 2 * i], e = t[2 + 2 * i];
        if (s >= e) {
            std::cout << "Invalid\n";
            return 0;
        }
        m.push_back({e, s});
    }
    std::sort(m.begin(), m.end());
    long long count = 0, lastEnd = std::numeric_limits<long long>::min();
    for (const auto& [e, s] : m) {
        if (s >= lastEnd) {  // 剛好接上也可以
            ++count;
            lastEnd = e;
        }
    }
    std::cout << count << "\n";
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.buffer.read().split()
    n = int(data[0]) if data else 0
    if n < 1 or len(data) != 1 + 2 * n:
        print("Invalid")
        return
    meetings = []
    for i in range(n):
        s, e = int(data[1 + 2 * i]), int(data[2 + 2 * i])
        if s >= e:
            print("Invalid")
            return
        meetings.append((e, s))  # (結束, 開始)：tuple 先比結束、再比開始
    meetings.sort()
    count, last_end = 0, float("-inf")
    for e, s in meetings:
        if s >= last_end:  # 剛好接上也可以
            count += 1
            last_end = e
    print(count)


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        long[] t = new long[16];  // 先讀進所有數字，才能檢查個數是否相符
        int total = 0;
        String line;
        while ((line = br.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) {
                if (total == t.length) t = Arrays.copyOf(t, total * 2);
                t[total++] = Long.parseLong(st.nextToken());
            }
        }
        long n = total > 0 ? t[0] : 0;
        if (n < 1 || total != 1 + 2 * n) {
            System.out.println("Invalid");
            return;
        }
        long[][] m = new long[(int) n][];
        for (int i = 0; i < n; i++) {
            long s = t[1 + 2 * i], e = t[2 + 2 * i];
            if (s >= e) {
                System.out.println("Invalid");
                return;
            }
            m[i] = new long[] {e, s};  // (結束, 開始)
        }
        // 先比結束、再比開始；用 Long.compare，不用相減（相減可能溢位）
        Arrays.sort(m, (x, y) -> x[0] != y[0] ? Long.compare(x[0], y[0]) : Long.compare(x[1], y[1]));
        long count = 0, lastEnd = Long.MIN_VALUE;
        for (long[] x : m) {
            if (x[1] >= lastEnd) {  // 剛好接上也可以
                count++;
                lastEnd = x[0];
            }
        }
        System.out.println(count);
    }
}`,
        JavaScript: code`// 先讀進所有數字，才能檢查個數是否相符
const t = require("fs").readFileSync(0, "utf8").split(/\s+/).filter(s => s !== "").map(Number);

function main() {
    const n = t.length > 0 ? t[0] : 0;
    if (n < 1 || t.length !== 1 + 2 * n) return "Invalid";
    const m = [];  // [結束, 開始]
    for (let i = 0; i < n; i++) {
        const s = t[1 + 2 * i], e = t[2 + 2 * i];
        if (s >= e) return "Invalid";
        m.push([e, s]);
    }
    // 先比結束、再比開始（時間在 ±10^9 內，number 相減不會失準）
    m.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let count = 0, lastEnd = -Infinity;
    for (const [e, s] of m) {
        if (s >= lastEnd) {  // 剛好接上也可以
            count++;
            lastEnd = e;
        }
    }
    return String(count);
}

console.log(main());`,
      },
      judge: 'none',
    },
  ],
};
