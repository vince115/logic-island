import type { LessonContent, TraceStep } from '../schema';
import { minWindowSteps } from '../simulate-algorithms';

const code = String.raw;

/** The visualization's data (non-negative, as minWindowSteps requires); the trace code below spells out the same values. */
const TRACE_A = [2, 3, 1, 2, 4, 3];
const TRACE_S = 7;

/**
 * minWindowSteps runs the shortest-window program of the trace code: 'expand' is line 4 (`total += a[r]`), 'shrink'
 * covers lines 6–9 of one pass of the while loop (answer recorded before removing a[l]) and is placed on line 9, the
 * last line of that pass; 'result' is the print on line 13. The simulator's panels are renamed here to the trace code's
 * names (sum → total, 最短長度 → best with 0 for "none yet", pointers left/right → l/r) and the last note is extended.
 */
const traceSteps: TraceStep[] = minWindowSteps(TRACE_A, TRACE_S, { expand: 4, shrink: 9, result: 13 }).map((step, k, all): TraceStep => {
  if (k === all.length - 1) return { ...step, vars: { best: step.output ?? '0' },
    note: `${step.note}函式在第 10 行回傳 best，第 13 行印出 ${step.output}。注意每一次收縮前（第 6～7 行）都先用目前的長度 r − l + 1 更新答案，再移出 a[l]。` };
  const arrays = step.arrays?.map(panel => {
    const { left, right } = panel.pointers ?? {};
    return { ...panel, pointers: { l: left ?? null, r: right ?? null } };
  });
  const p = arrays?.[0].pointers ?? { l: null, r: null };
  const best = step.vars?.['最短長度'];
  return { ...step, arrays, vars: { r: String(p.r), l: String(p.l), total: step.vars?.sum ?? '', best: !best || best === '—' ? '0' : best } };
});

/** Exercise worst cases, generated here; each expected answer follows from the construction (see the notes). */
const N_MAX = 200_000;
/** K = 2: "abc"×30000, then "de"×50000, then "fgh"×3333. Only the "dede…" block (100000 letters) has ≤ 2 distinct letters for long; its neighbours c and f are third letters. */
const bigMiddle = `2\n${'abc'.repeat(30_000)}${'de'.repeat(50_000)}${'fgh'.repeat(3_333)}`;
/** K = 3: "abcd"×25000 (every 4 consecutive letters are distinct), then "xyz"×33333 (99999 letters) up to the very end. */
const bigEnd = `3\n${'abcd'.repeat(25_000)}${'xyz'.repeat(33_333)}`;
/** K = 26: 200000 letters cycling through the alphabet; the whole string is the answer. */
const bigAlphabet = `26\n${Array.from({ length: N_MAX }, (_, i) => String.fromCharCode(97 + (i % 26))).join('')}`;
const bigSame = `1\n${'q'.repeat(N_MAX)}`;
const tooLong = `5\n${'a'.repeat(N_MAX + 1)}`;

/**
 * A09 Sliding Window. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); window sums (≤ 2×10^14 under the stated limits) stay plain numbers, exact below 2^53.
 */
export const A09: LessonContent = {
  lessonId: 'A09',
  motivation: '很多問題問的是「連續的一段」：連續 7 天營業額最高是哪一週、最少要連續幾天的存款才能湊到 1000 元、一段文字裡最長不含重複字元的片段、網路監控只看最近 60 秒的流量。暴力解把每一段都重算一次，n 個元素的連續區間有約 n²／2 段，n = 2×10^5 時就是 2×10^10 段，太慢。滑動視窗（sliding window）把「目前這一段」想成一個框：右端往右擴張時加入一個元素，左端往右收縮時移出一個元素，框裡的總和或計數隨時跟著更新，不必從頭重算。兩端都只往前走，所以每個元素最多進出框各一次，整體 O(n)。它的限制也很明確：只能處理連續的區間（子序列不行）；可變長度的視窗要求條件有單調性，例如「和 ≥ S」只在所有數都非負時才能這樣做，有負數時答案會錯，要改用前綴和（A10）等其他技巧；而視窗最大值、最小值這類無法用加減更新的量，需要 D07 學過的單調佇列。',
  sections: [
    {
      id: 'fixed', title: '固定長度視窗：加入一個、移出一個',
      blocks: [
        { type: 'p', text: '問題：給 n 個整數與 k，求連續 k 個元素的最大和。暴力解對每個起點 i 都把 `a[i..i+k−1]` 加一遍，共有 n − k + 1 個視窗、每個 k 次加法，是 O(nk)。觀察相鄰兩個視窗：`a[i..i+k−1]` 往右移一格變成 `a[i+1..i+k]`，中間 k − 1 個元素完全相同，只差「加入右邊新進來的 `a[i+k]`、移出左邊離開的 `a[i]`」。所以新視窗的和 = 舊視窗的和 + 進來的 − 出去的，每次 O(1)。' },
        { type: 'list', ordered: true, items: [
          '先算第一個視窗 `a[0..k−1]` 的和，當作目前的最佳答案。',
          '右端 r 從 k 走到 n − 1：`total += a[r] − a[r − k]`，此時視窗是 `a[r−k+1..r]`。',
          '每移一次就和最佳答案比較；要記起點時，起點是 `r − k + 1`。',
        ] },
        { type: 'table', head: ['n、k', '暴力 O(nk) 的加法次數', '固定視窗 O(n) 的更新次數'], rows: [
          ['n = 10、k = 3', '24', '3 + 7 = 10'],
          ['n = 10^5、k = 10^3', '約 10^8', '約 10^5'],
          ['n = 2×10^5、k = 10^5', '約 10^10', '約 2×10^5'],
        ] },
        { type: 'example', id: 'fixed-max-sum' },
        { type: 'p', text: 'k = 3 時六個視窗的和依序是 9、6、3、4、6、10：從 9 到 6 是加入 `a[3] = 1`、移出 `a[0] = 4`，9 + 1 − 4 = 6。最大和 10 是最後一個視窗 `a[5..7]`。範例同時用暴力解驗算（`brute=10`），自己寫視窗程式時，用暴力解在小資料上對答案是最可靠的檢查。比較時用 `>` 而不是 `>=`，所以和相同時保留最左邊的視窗。' },
        { type: 'p', text: '固定視窗不怕負數：每個視窗的長度都是 k，程式不需要判斷「要不要收縮」，只是把每一個長度 k 的視窗都算過一次，所以範例裡的 −2、−5 不影響正確性。邊界：k = n 時只有一個視窗；k > n 時沒有任何視窗，必須先判斷，否則 `sum(a[:k])` 在 Python 會默默只加到結尾，C++／Java 讀 `a[k−1]` 則會越界，JavaScript 讀到 `undefined`，和變成 `NaN`；範例對 k = 9 印出 `no window`。' },
        { type: 'callout', tone: 'note', title: '視窗的和可能超過 int', text: '每個值最多 10^9、k 到 2×10^5 時，視窗和可達 2×10^14，遠超過 C++／Java `int` 的上限 2^31 − 1 ≈ 2.1×10^9。C++ 用 `long long`、Java 用 `long` 存 total 與答案；Python 的 int 沒有上限，不會溢位；JavaScript 的 number 在 2^53（約 9×10^15）以內都是精確整數，2×10^14 放得下，直接累加即可。範例的 C++ 與 Java 都用 64 位元整數累加，而且把更新拆成 `total += a[r]` 與 `total -= a[r − k]` 兩行：寫成 `total += a[r] − a[r − k]` 時，右邊兩個 `int` 先相減，值接近 ±10^9 時差可達 2×10^9，在加進 total 之前就已經溢位。' },
      ],
    },
    {
      id: 'variable', title: '可變視窗：右端擴張、左端收縮',
      blocks: [
        { type: 'p', text: '很多題目沒有固定 k，而是問「滿足條件的最短（或最長）連續區間」。做法是用兩個只往前走的索引：l 是左端、r 是右端，視窗是 `a[l..r]`（兩端都包含），長度是 `r − l + 1`。外層迴圈每次讓 r 前進一格（擴張），內層的 while 迴圈視情況讓 l 前進（收縮）。依照題目求最短還是最長，while 的條件與更新答案的位置不同：' },
        { type: 'table', head: ['', '求最短（例：和 ≥ S 的最短區間）', '求最長（例：最多 K 種字元的最長子字串）'], rows: [
          ['while 的條件', '視窗「合法」時就收縮：`while total >= S`', '視窗「不合法」時才收縮：`while distinct > K`'],
          ['更新答案的時機', '在 while 裡、移出 `a[l]` 之前：此時視窗合法', '在 while 之後：收縮完，視窗一定合法'],
          ['收縮的理由', '合法了，試試看更短的還合不合法', '不合法了，丟掉左邊直到恢復合法'],
          ['找不到時', '答案保持「沒有」，依題目輸出 0 或 −1', '空視窗長度 0 永遠合法，所以最少是 0'],
        ] },
        { type: 'p', text: '為什麼這樣不會漏掉答案（以「和 ≥ S 的最短區間」、所有數都非負為例）？把每個可能的左端 l 想成一位候選人。當 `[l, r]` 第一次合法時，以 l 為左端、比 r 更右的區間 `[l, r′]` 都比較長，不可能更短，所以 l 的最佳答案就是現在，記下長度後就能把 l 丟掉（l 前進）。反過來，`[l, r]` 不合法（和 < S）時，因為值非負，任何 `[l′, r]`（l′ > l）只會更小，也不合法，所以不需要回頭試更右的左端，直接讓 r 前進。每一步丟掉的，都是「已經找到最佳答案」或「不可能是答案」的候選：這就是兩個索引都只前進也能正確的原因。' },
        { type: 'example', id: 'shortest-sum-window' },
        { type: 'p', text: '`[2, 3, 1, 2, 4, 3]`、S = 7：r = 3 時和是 8，第一次合法，記下長度 4，移出 2 後和 6 不合法；r = 4 時和 10，記下 4，移出 3 得 7 仍合法，記下 3，再移出 1 得 6；r = 5 時和 9，記下 3，移出 2 得 7，記下 2（`[4, 3]`），再移出 4 得 3。答案 2。`[1, 1, 1, 1]`、S = 5 時視窗從來不合法，依約定輸出 0。範例最後兩組有負數，下一節說明為什麼答案錯了。' },
        { type: 'p', text: '複雜度：for 迴圈裡有 while 迴圈，看起來像 O(n²)，但 l 只增不減，而且 l 最多到 r + 1 ≤ n，所以整個程式中 `l += 1` 總共最多執行 n 次，不是每一輪 n 次。r 前進 n 次、l 前進最多 n 次，每次 O(1)，總共 O(n)；只用幾個變數，額外空間 O(1)。這和 D07 單調佇列的攤銷分析是同一個想法：每個元素進入視窗一次、離開視窗最多一次。下方的視覺化逐步顯示 left、right 與視窗和；「自己試試看」可以輸入自己的非負整數與目標和。' },
      ],
    },
    {
      id: 'condition', title: '正確的前提：單調性（為什麼需要非負數）',
      blocks: [
        { type: 'p', text: '上一節的論證用到兩個事實：視窗往右擴張時和不會變小，左端收縮時和不會變大。這種「區間包含得越多，條件越容易成立」的性質叫單調性（monotonicity）。所有值都非負（≥ 0，可以是 0）時它成立；只要出現負數，加入一個元素可能讓和變小、移出一個元素可能讓和變大，「不合法就不必試更右的左端」這個推論就錯了。' },
        { type: 'p', text: '反例：`a = [3, −2, 4]`、S = 4。r = 0 和 3；r = 1 和 1；r = 2 和 5 ≥ 4，記下長度 3，移出 3 得和 2 < 4，停止收縮，程式輸出 3。但 `[4]` 自己就 ≥ 4，正確答案是 1。錯在「和 2 不合法，所以左端再往右也不合法」：再移出 −2，和反而變回 4。另一個反例 `[−5, 6]`、S = 6：r = 1 時和是 1，視窗從來沒有合法過，程式輸出 0（找不到），但 `[6]` 就是答案。上一節的範例把這兩組的視窗答案和暴力解並列，標出 `WRONG`。' },
        { type: 'callout', tone: 'warning', title: '有負數，就不能用可變視窗求和的最短／最長區間', text: '程式不會報錯，只會默默算出錯的答案，所以要先確認題目保證值非負。有負數時改用前綴和（prefix sum，A10）：區間 `a[l..r]` 的和是 `P[r+1] − P[l]`，問題變成「對每個 r，找最大的 l 使 `P[l] ≤ P[r+1] − S`」，再搭配其他技巧，例如在前綴和上用單調佇列（D07 的想法）做到 O(n)，或用有序結構做到 O(n log n)。本課視覺化的「自己試試看」也會拒絕負數並說明原因。第一節的固定長度視窗則不受影響，有負數照樣正確。' },
        { type: 'p', text: '單調性不只出現在和。「視窗內最多 K 種字元」：加入字元只會讓種類數不變或變多，移出只會不變或變少，對任何字串都成立，所以可以放心用可變視窗。「視窗內沒有重複字元」也一樣：合法的視窗去掉兩端任一個字元仍然合法。判斷能不能用可變視窗，就問：「一個合法的視窗，縮小後是否一定合法（求最長時）」或「放大後是否一定合法（求最短時）」？' },
        { type: 'p', text: '另一個邊界是 S ≤ 0。視覺化的程式假設 S ≥ 1：S ≤ 0 時，連空視窗（和 0）都「合法」，while 會在 l 超過 r 之後繼續移出 `a[l]`，Python 丟出 `IndexError`，C++ 是越界的未定義行為，Java 丟出 `ArrayIndexOutOfBoundsException`；JavaScript 不報錯，讀到 `undefined` 後 total 變成 `NaN`，迴圈停下來，答案卻悄悄錯了。題目若允許 S ≤ 0，要先特判（非負資料時答案就是 1，或依題目定義是 0），或把條件寫成 `while l <= r and total >= S`。' },
      ],
    },
    {
      id: 'counting', title: '維護視窗內的計數',
      blocks: [
        { type: 'p', text: '字串問題的視窗通常不是維護和，而是維護「每個字元在視窗裡出現幾次」。只有小寫英文字母時，用長度 26 的陣列 `cnt`，`cnt[c]` 是字母 c 在視窗裡的次數；字元的種類很多（任意 Unicode、很大的整數）時，改用雜湊表（D10）。擴張時 `cnt[s[r]] += 1`，收縮時 `cnt[s[l]] −= 1`：進來時加、出去時減，兩邊都不能漏。' },
        { type: 'p', text: '例題：最長的不含重複字元的子字串。視窗合法 ⇔ 每個字元最多出現 1 次。加入 `s[r]` 之後，如果它的次數變成 2，只有它重複（加入前視窗是合法的），所以一直移出左端，直到 `cnt[s[r]]` 回到 1；這時視窗又合法了，才用 `r − l + 1` 更新答案。這是「求最長」的模板：while 收縮不合法的部分，while 之後更新答案。' },
        { type: 'example', id: 'longest-unique' },
        { type: 'p', text: '`pwwkew`：r = 2 時第二個 w 進來，移出 p、w 之後視窗是 `w`；接著 `wke` 長度 3，答案 3。`abba`：r = 2 時第二個 b 進來，左端要移過 a 和第一個 b，視窗變成 `b`；r = 3 時 a 進來，舊的 a 早已被移出（`cnt[a]` 是 0），視窗 `ba` 合法，答案 2。範例用 `>` 更新，所以長度相同時印出最左邊的那一段（`abcabcbb` 印 `abc`）。' },
        { type: 'p', text: '「最多 K 種不同字元」再多維護一個 `distinct`：`cnt[c]` 從 0 變 1 時 distinct 加 1，從 1 變 0 時減 1，while 的條件是 `distinct > K`。這正是本課的練習題。' },
        { type: 'table', head: ['', '長度 26 的陣列', '雜湊表'], rows: [
          ['C++', '`int cnt[26] = {}` 或 `std::array<int, 26>`；索引 `s[r] - \'a\'`', '`std::unordered_map<char, int>`；次數變 0 時 `erase`，`size()` 才是種類數'],
          ['Python', '`cnt = [0] * 26`；索引 `ord(ch) - ord(\'a\')`', '`dict`；次數變 0 時 `del`。`collections.Counter` 減到 0 的鍵仍留著，`len()` 會多算'],
          ['Java', '`int[] cnt = new int[26]`；索引 `s.charAt(r) - \'a\'`（char 相減得到 int）', '`HashMap<Character, Integer>`；次數變 0 時 `remove`，`size()` 才是種類數'],
          ['JavaScript', '`new Array(26).fill(0)`；索引 `s.charCodeAt(r) - 97`（字串不能直接相減）', '`Map`；次數變 0 時 `delete`，`size` 才是種類數'],
          ['適用', '字元集小且固定（小寫字母、數字）', '字元集很大或事先不知道'],
        ] },
      ],
    },
    {
      id: 'compare-pitfalls', title: '方法比較與常見錯誤',
      blocks: [
        { type: 'table', head: ['做法', '時間', '適用條件', '典型問題'], rows: [
          ['暴力：列舉所有區間', 'O(n²)（邊算邊累加）或 O(n³)', '任何資料；n 小時拿來驗算', '對拍、n ≤ 幾千'],
          ['固定視窗', 'O(n)', '視窗長度固定，量可以用加減更新；可以有負數', '連續 k 個的最大和、平均'],
          ['可變視窗（本課）', 'O(n)', '條件對區間有單調性（例如值非負時的和）', '和 ≥ S 的最短區間、最長不重複子字串'],
          ['前綴和（A10）', '建表 O(n)，每次查詢 O(1)', '任何整數；適合大量「區間和」查詢', '多次查詢 `a[l..r]` 的和；有負數的區間問題'],
          ['單調佇列（D07）', 'O(n)', '固定長度視窗的最大值／最小值', '滑動視窗最大值'],
        ] },
        { type: 'p', text: '選擇的順序：題目問的是連續區間嗎？不是就不能用視窗。長度固定嗎？固定就用固定視窗（求最大值、最小值時用 D07 的單調佇列，因為最大值無法用「減掉離開的元素」更新）。長度不固定時，檢查單調性：成立就用可變視窗；不成立（例如和的問題有負數）就改用前綴和配合其他技巧。' },
        { type: 'callout', tone: 'warning', title: '在錯的時機更新答案', text: '求最短時，答案要在 while 裡、移出 `a[l]` 之前更新：先移出再更新，記到的是已經不合法的視窗。求最長時，答案要在 while 之後更新：在收縮前更新，會把「還有重複字元」的不合法視窗也算進去，例如不重複子字串對 `abcb` 會得到 4（正確是 3）。寫完後問自己：更新答案的那一行，視窗一定合法嗎？' },
        { type: 'callout', tone: 'warning', title: '收縮時忘了移出計數', text: '只寫 `l += 1` 而忘了 `cnt[s[l]] −= 1`（或忘了在次數變 0 時讓 distinct 減 1），視窗裡的計數就和實際內容對不上。不重複子字串的 `while cnt[c] > 1: l += 1` 會變成無窮迴圈，因為 cnt 永遠不會變小；最多 K 種字元的題目則會一直以為種類太多，把左端收得太遠，答案偏小。擴張和收縮的程式碼要成對檢查：加了什麼，就要減什麼。' },
        { type: 'callout', tone: 'warning', title: '空答案與差一錯誤', text: '找不到合法視窗時要輸出什麼，要依題目：常見是 0 或 −1。程式裡用 0 代表「還沒有答案」時（如視覺化的 `best == 0`），只有在合法視窗長度至少是 1 時才行（S ≥ 1）；用一個不可能的大數（例如 n + 1）當初始值，最後再換成 0 或 −1，也是常見寫法。視窗 `a[l..r]` 兩端都包含，長度是 `r − l + 1`，寫成 `r − l` 會少 1；固定視窗中，移出的元素是 `a[r − k]`，起點是 `r − k + 1`。' },
        { type: 'p', text: '測試滑動視窗程式時，涵蓋：只有 1 個元素、完全找不到合法視窗、整個陣列（字串）就是答案、答案在最開頭或最結尾、所有元素都相同、有 0 的資料，以及 k = n、K = 26 這類上限。最有效的方法是寫一個 O(n²) 的暴力解，在大量隨機的小資料上和視窗程式比對。' },
      ],
    },
  ],
  examples: [
    {
      id: 'fixed-max-sum', title: '固定視窗：連續 k 個元素的最大和', description: '對同一個含負數的陣列，用 k = 3、1、8、9 求連續 k 個元素的最大和與它的起訖位置，並用 O(nk) 的暴力解驗算。',
      output: 'k=3: sums 9 6 3 4 6 10 -> max 10 at [5, 7], brute=10\nk=1: sums 4 -2 7 1 -5 8 3 -1 -> max 8 at [5, 5], brute=8\nk=8: sums 15 -> max 15 at [0, 7], brute=15\nk=9: no window',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 暴力解：每個起點都重新加 k 個，O(nk)。
long long bruteMax(const std::vector<int>& a, int k) {
    long long best = 0;
    for (int i = 0; i + k <= static_cast<int>(a.size()); ++i) {
        long long s = 0;
        for (int j = i; j < i + k; ++j) s += a[j];
        if (i == 0 || s > best) best = s;
    }
    return best;
}

int main() {
    std::vector<int> a = {4, -2, 7, 1, -5, 8, 3, -1};
    int n = static_cast<int>(a.size());
    for (int k : {3, 1, 8, 9}) {
        if (k < 1 || k > n) {
            std::cout << "k=" << k << ": no window\n";
            continue;
        }
        long long total = 0;  // 視窗和可能超過 int，用 long long
        for (int i = 0; i < k; ++i) total += a[i];  // 第一個視窗 a[0..k-1]
        long long best = total;
        int start = 0;
        std::string sums = std::to_string(total);
        for (int r = k; r < n; ++r) {
            total += a[r];      // 加入 a[r]
            total -= a[r - k];  // 移出 a[r-k]（分兩行：a[r] - a[r-k] 先用 int 算可能溢位）
            sums += " " + std::to_string(total);
            if (total > best) {  // 用 > ：和相同時保留最左邊的視窗
                best = total;
                start = r - k + 1;
            }
        }
        std::cout << "k=" << k << ": sums " << sums << " -> max " << best << " at [" << start << ", "
                  << start + k - 1 << "], brute=" << bruteMax(a, k) << "\n";
    }
    return 0;
}`,
        Python: code`def brute_max(a, k):
    """暴力解：每個起點都重新加 k 個，O(nk)。"""
    return max(sum(a[i:i + k]) for i in range(len(a) - k + 1))


a = [4, -2, 7, 1, -5, 8, 3, -1]
n = len(a)
for k in [3, 1, 8, 9]:
    if k < 1 or k > n:
        print(f"k={k}: no window")
        continue
    total = sum(a[:k])  # 第一個視窗 a[0..k-1]
    best, start = total, 0
    sums = [total]
    for r in range(k, n):
        total += a[r] - a[r - k]  # 加入 a[r]、移出 a[r-k]
        sums.append(total)
        if total > best:  # 用 > ：和相同時保留最左邊的視窗
            best, start = total, r - k + 1
    print(f"k={k}: sums {' '.join(map(str, sums))} -> max {best} at [{start}, {start + k - 1}], brute={brute_max(a, k)}")`,
        Java: code`public class Main {
    // 暴力解：每個起點都重新加 k 個，O(nk)。
    static long bruteMax(int[] a, int k) {
        long best = 0;
        for (int i = 0; i + k <= a.length; i++) {
            long s = 0;
            for (int j = i; j < i + k; j++) s += a[j];
            if (i == 0 || s > best) best = s;
        }
        return best;
    }

    public static void main(String[] args) {
        int[] a = {4, -2, 7, 1, -5, 8, 3, -1};
        int n = a.length;
        for (int k : new int[] {3, 1, 8, 9}) {
            if (k < 1 || k > n) {
                System.out.println("k=" + k + ": no window");
                continue;
            }
            long total = 0;  // 視窗和可能超過 int，用 long
            for (int i = 0; i < k; i++) total += a[i];  // 第一個視窗 a[0..k-1]
            long best = total;
            int start = 0;
            StringBuilder sums = new StringBuilder().append(total);
            for (int r = k; r < n; r++) {
                total += a[r];      // 加入 a[r]
                total -= a[r - k];  // 移出 a[r-k]（分兩行：a[r] - a[r-k] 先用 int 算可能溢位）
                sums.append(' ').append(total);
                if (total > best) {  // 用 > ：和相同時保留最左邊的視窗
                    best = total;
                    start = r - k + 1;
                }
            }
            System.out.println("k=" + k + ": sums " + sums + " -> max " + best + " at [" + start + ", "
                + (start + k - 1) + "], brute=" + bruteMax(a, k));
        }
    }
}`,
        JavaScript: code`// 暴力解：每個起點都重新加 k 個，O(nk)。
function bruteMax(a, k) {
    let best = -Infinity;
    for (let i = 0; i + k <= a.length; i++) {
        let s = 0;
        for (let j = i; j < i + k; j++) s += a[j];
        best = Math.max(best, s);
    }
    return best;
}

const a = [4, -2, 7, 1, -5, 8, 3, -1];
const n = a.length;
for (const k of [3, 1, 8, 9]) {
    if (k < 1 || k > n) {
        console.log("k=" + k + ": no window");
        continue;
    }
    let total = 0;  // number 在 2^53 以內精確，視窗和不會溢位
    for (let i = 0; i < k; i++) total += a[i];  // 第一個視窗 a[0..k-1]
    let best = total, start = 0;
    const sums = [total];
    for (let r = k; r < n; r++) {
        total += a[r] - a[r - k];  // 加入 a[r]、移出 a[r-k]
        sums.push(total);
        if (total > best) {  // 用 > ：和相同時保留最左邊的視窗
            best = total;
            start = r - k + 1;
        }
    }
    console.log("k=" + k + ": sums " + sums.join(" ") + " -> max " + best + " at [" + start + ", " + (start + k - 1)
        + "], brute=" + bruteMax(a, k));
}`,
      },
    },
    {
      id: 'shortest-sum-window', title: '可變視窗：和 ≥ S 的最短區間，以及負數的反例', description: '對五組資料執行同一個可變視窗程式，並和暴力解比較：前三組都非負，兩者相同；後兩組有負數，視窗的答案是錯的。找不到時輸出 0。',
      output: 'a=[2, 3, 1, 2, 4, 3] S=7 window=2 brute=2 ok\na=[1, 4, 4] S=4 window=1 brute=1 ok\na=[1, 1, 1, 1] S=5 window=0 brute=0 ok\na=[3, -2, 4] S=4 window=3 brute=1 WRONG\na=[-5, 6] S=6 window=0 brute=1 WRONG',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 可變視窗：只在所有值都非負、S >= 1 時正確。找不到回傳 0。
int minWindow(const std::vector<int>& a, long long S) {
    int n = static_cast<int>(a.size()), l = 0, best = 0;
    long long total = 0;
    for (int r = 0; r < n; ++r) {
        total += a[r];                 // 擴張：加入 a[r]
        while (total >= S) {           // 合法：記下長度，再試著收縮
            if (best == 0 || r - l + 1 < best) best = r - l + 1;
            total -= a[l];             // 收縮：移出 a[l]
            ++l;
        }
    }
    return best;
}

// 暴力解：每個左端往右加，第一次 >= S 就是這個左端最短的區間。O(n^2)，負數也正確。
int brute(const std::vector<int>& a, long long S) {
    int n = static_cast<int>(a.size()), best = 0;
    for (int l = 0; l < n; ++l) {
        long long t = 0;
        for (int r = l; r < n; ++r) {
            t += a[r];
            if (t >= S) {
                if (best == 0 || r - l + 1 < best) best = r - l + 1;
                break;
            }
        }
    }
    return best;
}

std::string show(const std::vector<int>& a) {
    std::string s = "[";
    for (std::size_t i = 0; i < a.size(); ++i) s += (i ? ", " : "") + std::to_string(a[i]);
    return s + "]";
}

int main() {
    std::vector<std::vector<int>> as = {{2, 3, 1, 2, 4, 3}, {1, 4, 4}, {1, 1, 1, 1}, {3, -2, 4}, {-5, 6}};
    std::vector<long long> ss = {7, 4, 5, 4, 6};
    for (std::size_t i = 0; i < as.size(); ++i) {
        int w = minWindow(as[i], ss[i]), b = brute(as[i], ss[i]);
        std::cout << "a=" << show(as[i]) << " S=" << ss[i] << " window=" << w << " brute=" << b
                  << (w == b ? " ok" : " WRONG") << "\n";
    }
    return 0;
}`,
        Python: code`def min_window(a, S):
    """可變視窗：只在所有值都非負、S >= 1 時正確。找不到回傳 0。"""
    l, total, best = 0, 0, 0
    for r in range(len(a)):
        total += a[r]          # 擴張：加入 a[r]
        while total >= S:      # 合法：記下長度，再試著收縮
            if best == 0 or r - l + 1 < best:
                best = r - l + 1
            total -= a[l]      # 收縮：移出 a[l]
            l += 1
    return best


def brute(a, S):
    """暴力解：每個左端往右加，第一次 >= S 就是這個左端最短的區間。O(n^2)，負數也正確。"""
    best = 0
    for l in range(len(a)):
        t = 0
        for r in range(l, len(a)):
            t += a[r]
            if t >= S:
                if best == 0 or r - l + 1 < best:
                    best = r - l + 1
                break
    return best


for a, S in [([2, 3, 1, 2, 4, 3], 7), ([1, 4, 4], 4), ([1, 1, 1, 1], 5), ([3, -2, 4], 4), ([-5, 6], 6)]:
    w, b = min_window(a, S), brute(a, S)
    print(f"a={a} S={S} window={w} brute={b} {'ok' if w == b else 'WRONG'}")`,
        Java: code`import java.util.Arrays;

public class Main {
    // 可變視窗：只在所有值都非負、S >= 1 時正確。找不到回傳 0。
    static int minWindow(int[] a, long S) {
        int l = 0, best = 0;
        long total = 0;
        for (int r = 0; r < a.length; r++) {
            total += a[r];                 // 擴張：加入 a[r]
            while (total >= S) {           // 合法：記下長度，再試著收縮
                if (best == 0 || r - l + 1 < best) best = r - l + 1;
                total -= a[l];             // 收縮：移出 a[l]
                l++;
            }
        }
        return best;
    }

    // 暴力解：每個左端往右加，第一次 >= S 就是這個左端最短的區間。O(n^2)，負數也正確。
    static int brute(int[] a, long S) {
        int best = 0;
        for (int l = 0; l < a.length; l++) {
            long t = 0;
            for (int r = l; r < a.length; r++) {
                t += a[r];
                if (t >= S) {
                    if (best == 0 || r - l + 1 < best) best = r - l + 1;
                    break;
                }
            }
        }
        return best;
    }

    public static void main(String[] args) {
        int[][] as = {{2, 3, 1, 2, 4, 3}, {1, 4, 4}, {1, 1, 1, 1}, {3, -2, 4}, {-5, 6}};
        long[] ss = {7, 4, 5, 4, 6};
        for (int i = 0; i < as.length; i++) {
            int w = minWindow(as[i], ss[i]), b = brute(as[i], ss[i]);
            // Arrays.toString 的格式 [2, 3, 1] 和 Python 印 list 相同
            System.out.println("a=" + Arrays.toString(as[i]) + " S=" + ss[i] + " window=" + w + " brute=" + b
                + (w == b ? " ok" : " WRONG"));
        }
    }
}`,
        JavaScript: code`// 可變視窗：只在所有值都非負、S >= 1 時正確。找不到回傳 0。
function minWindow(a, S) {
    let l = 0, total = 0, best = 0;
    for (let r = 0; r < a.length; r++) {
        total += a[r];                 // 擴張：加入 a[r]
        while (total >= S) {           // 合法：記下長度，再試著收縮
            if (best === 0 || r - l + 1 < best) best = r - l + 1;
            total -= a[l];             // 收縮：移出 a[l]
            l++;
        }
    }
    return best;
}

// 暴力解：每個左端往右加，第一次 >= S 就是這個左端最短的區間。O(n^2)，負數也正確。
function brute(a, S) {
    let best = 0;
    for (let l = 0; l < a.length; l++) {
        let t = 0;
        for (let r = l; r < a.length; r++) {
            t += a[r];
            if (t >= S) {
                if (best === 0 || r - l + 1 < best) best = r - l + 1;
                break;
            }
        }
    }
    return best;
}

const cases = [[[2, 3, 1, 2, 4, 3], 7], [[1, 4, 4], 4], [[1, 1, 1, 1], 5], [[3, -2, 4], 4], [[-5, 6], 6]];
for (const [a, S] of cases) {
    const w = minWindow(a, S), b = brute(a, S);
    console.log("a=[" + a.join(", ") + "] S=" + S + " window=" + w + " brute=" + b + (w === b ? " ok" : " WRONG"));
}`,
      },
    },
    {
      id: 'longest-unique', title: '最長的不含重複字元的子字串', description: '用長度 26 的計數陣列維護視窗：新字元重複時收縮左端，收縮完再更新答案，印出長度與最左邊的那一段。',
      output: 'abcabcbb -> 3 "abc"\nbbbbb -> 1 "b"\npwwkew -> 3 "wke"\nabba -> 2 "ab"\ndvdf -> 3 "vdf"\nz -> 1 "z"',
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    for (std::string s : {"abcabcbb", "bbbbb", "pwwkew", "abba", "dvdf", "z"}) {
        int cnt[26] = {};  // cnt[c]：字母 c 在視窗 s[l..r] 裡出現幾次
        int l = 0, best = 0, bestL = 0;
        for (int r = 0; r < static_cast<int>(s.size()); ++r) {
            int c = s[r] - 'a';
            ++cnt[c];                   // 擴張：s[r] 進入視窗
            while (cnt[c] > 1) {        // 只有 s[r] 可能重複：收縮到它只剩一個
                --cnt[s[l] - 'a'];      // 收縮：s[l] 離開視窗，計數也要減
                ++l;
            }
            if (r - l + 1 > best) {     // 收縮完視窗一定合法，才更新答案
                best = r - l + 1;
                bestL = l;
            }
        }
        std::cout << s << " -> " << best << " \"" << s.substr(bestL, best) << "\"\n";
    }
    return 0;
}`,
        Python: code`for s in ["abcabcbb", "bbbbb", "pwwkew", "abba", "dvdf", "z"]:
    cnt = [0] * 26  # cnt[c]：字母 c 在視窗 s[l..r] 裡出現幾次
    l = best = best_l = 0
    for r, ch in enumerate(s):
        c = ord(ch) - ord("a")
        cnt[c] += 1                        # 擴張：s[r] 進入視窗
        while cnt[c] > 1:                  # 只有 s[r] 可能重複：收縮到它只剩一個
            cnt[ord(s[l]) - ord("a")] -= 1  # 收縮：s[l] 離開視窗，計數也要減
            l += 1
        if r - l + 1 > best:               # 收縮完視窗一定合法，才更新答案
            best, best_l = r - l + 1, l
    print(f'{s} -> {best} "{s[best_l:best_l + best]}"')`,
        Java: code`public class Main {
    public static void main(String[] args) {
        for (String s : new String[] {"abcabcbb", "bbbbb", "pwwkew", "abba", "dvdf", "z"}) {
            int[] cnt = new int[26];  // cnt[c]：字母 c 在視窗 s[l..r] 裡出現幾次
            int l = 0, best = 0, bestL = 0;
            for (int r = 0; r < s.length(); r++) {
                int c = s.charAt(r) - 'a';  // char 相減得到 int
                cnt[c]++;                   // 擴張：s[r] 進入視窗
                while (cnt[c] > 1) {        // 只有 s[r] 可能重複：收縮到它只剩一個
                    cnt[s.charAt(l) - 'a']--;  // 收縮：s[l] 離開視窗，計數也要減
                    l++;
                }
                if (r - l + 1 > best) {     // 收縮完視窗一定合法，才更新答案
                    best = r - l + 1;
                    bestL = l;
                }
            }
            System.out.println(s + " -> " + best + " \"" + s.substring(bestL, bestL + best) + "\"");
        }
    }
}`,
        JavaScript: code`for (const s of ["abcabcbb", "bbbbb", "pwwkew", "abba", "dvdf", "z"]) {
    const cnt = new Array(26).fill(0);  // cnt[c]：字母 c 在視窗 s[l..r] 裡出現幾次
    let l = 0, best = 0, bestL = 0;
    for (let r = 0; r < s.length; r++) {
        const c = s.charCodeAt(r) - 97;  // 97 是 "a" 的字元碼
        cnt[c]++;                        // 擴張：s[r] 進入視窗
        while (cnt[c] > 1) {             // 只有 s[r] 可能重複：收縮到它只剩一個
            cnt[s.charCodeAt(l) - 97]--; // 收縮：s[l] 離開視窗，計數也要減
            l++;
        }
        if (r - l + 1 > best) {          // 收縮完視窗一定合法，才更新答案
            best = r - l + 1;
            bestL = l;
        }
    }
    console.log(s + " -> " + best + " \"" + s.slice(bestL, bestL + best) + "\"");
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '可變視窗：和 ≥ S 的最短區間（值必須非負）', language: 'Python',
    code: code`def min_window(a, S):
    l, total, best = 0, 0, 0
    for r in range(len(a)):
        total += a[r]
        while total >= S:
            if best == 0 or r - l + 1 < best:
                best = r - l + 1
            total -= a[l]
            l += 1
    return best

a = [2, 3, 1, 2, 4, 3]
print(min_window(a, 7))`,
    steps: traceSteps,
    tryIt: { algorithm: 'min-window', initial: TRACE_A, target: TRACE_S },
  },
  quiz: [
    {
      id: 'q-steps', prompt: '用視覺化的 `min_window` 處理 `a = [3, 1, 2, 4]`、S = 6。每次執行到第 6 行（檢查要不要更新 best）時，視窗 `[l, r]` 依序是哪些？',
      options: ['[0, 2] → [1, 3] → [2, 3]', '[0, 2] → [1, 3]', '[0, 2] → [2, 3]', '[0, 2] → [1, 2] → [1, 3] → [2, 3]'],
      answer: 0, explanation: 'r = 2 時和 3 + 1 + 2 = 6 ≥ 6，檢查 [0, 2]（長度 3），移出 3 得 3 < 6，停止。r = 3 時和 3 + 4 = 7，檢查 [1, 3]（長度 3），移出 1 得 6，仍合法，檢查 [2, 3]（長度 2），移出 2 得 4，停止。最後回傳 2。「[0, 2] → [1, 3]」是把 while 寫成 if，合法時只收縮一次；「[0, 2] → [2, 3]」漏了收縮前要先檢查 [1, 3]；[1, 2] 的和是 3，不合法，程式也不會在 r = 2 時檢查它。（已用 Python 執行程式並記錄每次的 (l, r) 驗證。）',
    },
    {
      id: 'q-fixed', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: code`a = [5, -1, 3, 8, -6, 2]
k = 3
s = sum(a[:k])
best = s
for r in range(k, len(a)):
    s += a[r] - a[r - k]
    best = max(best, s)
    print(s, end=" ")
print(best)` },
      options: ['10 5 4 10', '7 10 5 4 10', '10 5 4 4', '10 3 2 10'],
      answer: 0, explanation: '第一個視窗 [5, −1, 3] 的和 7 只存進 s，沒有印出。r = 3：加入 8、移出 5，7 + 8 − 5 = 10；r = 4：加入 −6、移出 −1，10 − 6 + 1 = 5；r = 5：加入 2、移出 3，5 + 2 − 3 = 4。最後印出最大值 10。「7 10 5 4 10」以為第一個視窗也會在迴圈裡印出；「10 5 4 4」把 best 當成最後一個視窗的和；「10 3 2 10」在 r = 4 時把移出 −1 算成減 1（應該是減掉 −1，也就是加 1），之後的和也跟著錯。',
    },
    {
      id: 'q-negative', prompt: '把下列輸入交給視覺化的 `min_window`（和 ≥ S 的最短區間，找不到輸出 0）。哪一組會輸出錯誤的答案？',
      options: ['`a = [2, 1, 5, 2]`、S = 7', '`a = [7, -1, 1]`、S = 7', '`a = [1, -1, 5]`、S = 5', '`a = [0, 0, 7]`、S = 7'],
      answer: 2, explanation: '`[1, −1, 5]`：r = 2 時和 5 ≥ 5，記下長度 3，移出 1 得 4 < 5 就停止收縮，輸出 3；但 `[5]` 自己就夠，正確答案是 1。錯在有負數時，再移出 −1 和反而變大。`[2, 1, 5, 2]` 與 `[0, 0, 7]` 都非負（0 也可以），一定正確，分別輸出 2 與 1；`[7, −1, 1]` 雖然有負數，r = 0 時就找到長度 1，剛好正確，可見「有負數」不代表每組都錯，而是不再保證正確。（四組都已用程式與暴力解比對。）',
    },
    {
      id: 'q-complexity', prompt: '`min_window` 的 for 迴圈裡有一個 while 迴圈。對 n = 10^5 個非負整數執行一次，第 9 行的 `l += 1` 在整個執行過程中總共最多執行幾次？',
      options: ['最多 10^5 次（n 次）', '最多約 5×10^9 次（n² / 2）', '最多 n × S 次，和 S 有關', '最多約 1.7×10^6 次（n log₂ n）'],
      answer: 0, explanation: 'l 只增不減，而且收縮時視窗一定非空（S ≥ 1 時，空視窗的和 0 不合法），所以 l 最多到 r + 1 ≤ n，整個執行過程合計最多 n 次。某一輪的 while 可能跑很多次，但那些次數是從其他輪「省下來」的，總數不超過 n，所以整體是 O(n)。n² / 2 是把每一輪的 while 都當成最壞 n 次的錯誤估計；收縮次數和 S 的大小、和 log 都無關。（已在 2000 組隨機資料上計數驗證，從未超過 n。）',
    },
    {
      id: 'q-timing', prompt: '下面的「最長不重複子字串」程式把更新答案的那一行放錯了位置。它輸出什麼？',
      code: { language: 'Python', text: code`def longest(s):
    cnt = [0] * 26
    l = best = 0
    for r in range(len(s)):
        c = ord(s[r]) - ord('a')
        cnt[c] += 1
        best = max(best, r - l + 1)
        while cnt[c] > 1:
            cnt[ord(s[l]) - ord('a')] -= 1
            l += 1
    return best

print(longest("abcb"), longest("aab"))` },
      options: ['4 2', '3 2', '3 1', '4 3'],
      answer: 0, explanation: '答案在收縮之前更新，會把還有重複字元的視窗算進去。`abcb`：r = 3 時視窗 `abcb` 有兩個 b，卻先記下長度 4，之後才收縮成 `cb`，輸出 4（正確是 3）。`aab`：r = 1 時不合法的 `aa` 被記為 2，r = 2 時合法的 `ab` 也是 2，所以剛好輸出正確的 2；錯誤的程式不一定每組都錯，這也是要用多組測資對拍的原因。「3 2」是把 `best = …` 移到 while 之後的正確程式；「3 1」與「4 3」對 `aab` 的長度算錯。（已用 Python 執行驗證。）',
    },
    {
      id: 'q-forget', prompt: '有人把不重複子字串的收縮寫成下面這樣（忘了減少計數）。執行 `longest("abca")` 會怎樣？',
      code: { language: 'Python', text: code`def longest(s):
    cnt = [0] * 26
    l = best = 0
    for r in range(len(s)):
        c = ord(s[r]) - ord('a')
        cnt[c] += 1
        while cnt[c] > 1:
            l += 1
        best = max(best, r - l + 1)
    return best` },
      options: ['回傳 3', '回傳 4', '無窮迴圈，永遠不回傳', '丟出 IndexError'],
      answer: 2, explanation: 'r = 3 時第二個 a 進來，`cnt[0]` 變成 2。while 裡只有 `l += 1`，`cnt[c]` 永遠不會變小，條件永遠成立，程式停不下來（實際執行要用逾時才能中斷）。while 裡沒有讀 `s[l]`，所以 l 再大也不會丟出 IndexError。「回傳 3」是補上 `cnt[ord(s[l]) - ord(\'a\')] -= 1` 之後的正確結果；「回傳 4」是完全不收縮的結果。加了什麼就要減什麼。（已用 3 秒逾時執行驗證。）',
    },
    {
      id: 'q-choose', prompt: '下列四個問題，哪一個不能直接用本課的可變視窗（兩個只往前走的索引）正確解出？',
      options: ['非負整數陣列，求和 ≥ S 的最短連續區間', '小寫字串，求不含重複字元的最長子字串', '整數陣列（可能有負數），求連續 k 個元素的最大和', '整數陣列（可能有負數），求和 ≤ S 的最長連續區間'],
      answer: 3, explanation: '有負數時，「和 ≤ S」沒有單調性：加入元素可能讓和變小，收縮也可能讓和變大。例如 `[5, −10, 5]`、S = 0：整段的和 0 ≤ 0，答案是 3；但可變視窗在 r = 0 時看到 5 > 0，就把 5 丟掉了，最後只得到 2。這類問題要改用前綴和（A10）配合其他技巧。非負的和 ≥ S、不重複字元都有單調性；連續 k 個的最大和是固定長度視窗，不必決定何時收縮，有負數也正確。（反例已用程式與暴力解比對。）',
    },
  ],
  exercises: [
    {
      id: 'e-k-distinct', title: '最多 K 種字母的最長子字串',
      statement: '給一個整數 K 與一個只含小寫英文字母的字串 s，求 s 中「最多包含 K 種不同字母」的最長連續子字串的長度。例如 K = 2、s = `eceba` 時，`ece` 只有 e、c 兩種，長度 3 是最長的。K = 0 時只有空字串符合，答案是 0。s 的長度可能到 2×10^5：列舉所有子字串的 O(n²) 做法要約 2×10^10 次，太慢，請用可變視窗做到 O(n)（或 O(26n)）。輸入不合法時只輸出一行 `Invalid`：K 不是 0～26 的整數（負數、超過 26、不是數字），s 含有小寫字母以外的字元，s 的長度超過 2×10^5，或輸入不是剛好兩項（K 與 s）。',
      inputFormat: '第一行一個整數 K。第二行字串 s。兩項之間以空白或換行分隔。',
      outputFormat: '一行一個整數：最多 K 種不同字母的最長連續子字串長度；輸入不合法時只輸出 `Invalid`。',
      constraints: ['0 ≤ K ≤ 26（否則輸出 Invalid）', '1 ≤ s 的長度 ≤ 2×10^5，只含 a～z（否則輸出 Invalid）'],
      samples: [
        { kind: 'normal', input: '2\neceba', output: '3', note: '`ece` 有 2 種字母' },
        { kind: 'normal', input: '1\naabbcc', output: '2', note: '每一段相同字母長度都是 2' },
      ],
      tests: [
        { kind: 'normal', input: '2\neceba', output: '3', note: '範例' },
        { kind: 'normal', input: '2\naabbcc', output: '4', note: '`aabb` 或 `bbcc`：在收縮前就更新答案的做法會得到 5' },
        { kind: 'normal', input: '2\nabaccc', output: '4', note: '`accc`：收縮時忘了減少計數的做法會一直以為種類太多，得到較小的答案' },
        { kind: 'normal', input: '2\nabcbbbbcccbdddadacb', output: '10', note: '`bcbbbbcccb`：中間很長的一段，左端要移過好幾個字母' },
        { kind: 'normal', input: '3\naaabbcdddcccbba', output: '11', note: '`bbcdddcccbb`，左端要收縮過整段 a' },
        { kind: 'normal', input: '2\nbacbaaaaab', output: '7', note: '`baaaaab`：同一個字母離開視窗又再進來' },
        { kind: 'edge', input: '2\nabc', output: '2', note: '在收縮前更新答案的做法會得到 3' },
        { kind: 'edge', input: '1\na', output: '1', note: '長度 1' },
        { kind: 'edge', input: '0\nabc', output: '0', note: 'K = 0：沒有非空的合法子字串，答案是 0' },
        { kind: 'edge', input: '26\nthequickbrownfoxjumpsoverthelazydog', output: '35', note: 'K = 26：整個字串就是答案' },
        { kind: 'edge', input: '5\nabcab', output: '5', note: 'K 大於字串的字母種類數：答案是整個字串' },
        { kind: 'edge', input: '1\nzzzzzz', output: '6', note: '所有字母都相同' },
        { kind: 'edge', input: '2\nabcdefgghh', output: '4', note: '答案 `gghh` 在最結尾' },
        { kind: 'edge', input: '3\naaaaabcd', output: '7', note: '答案 `aaaaabc` 從最開頭開始' },
        { kind: 'edge', input: bigMiddle, output: '100000', note: 'K = 2，長度 199999：`abc` 重複 30000 次、`de` 重複 50000 次、`fgh` 重複 3333 次；只有中間 10^5 個 d、e 交錯的一段夠長，兩旁的 c、f 都是第三種字母。O(n²) 的做法會超時' },
        { kind: 'edge', input: bigEnd, output: '99999', note: 'K = 3，長度 199999：`abcd` 重複 25000 次（任 4 個相鄰字母都不同），接著 `xyz` 重複 33333 次直到結尾；答案是最後的 99999 個字母' },
        { kind: 'edge', input: bigAlphabet, output: '200000', note: 'K = 26、長度 2×10^5（上限），字母依序循環：整個字串就是答案' },
        { kind: 'edge', input: bigSame, output: '200000', note: 'K = 1、2×10^5 個 q' },
        { kind: 'error', input: '27\nabc', output: 'Invalid', note: 'K 超過 26' },
        { kind: 'error', input: '-1\nabc', output: 'Invalid', note: 'K 是負數' },
        { kind: 'error', input: 'x\nabc', output: 'Invalid', note: 'K 不是數字' },
        { kind: 'error', input: '2\nabC', output: 'Invalid', note: '有大寫字母' },
        { kind: 'error', input: '2\nab3c', output: 'Invalid', note: '有數字' },
        { kind: 'error', input: '2', output: 'Invalid', note: '缺少字串 s' },
        { kind: 'error', input: '2\nabc def', output: 'Invalid', note: '多了一項（s 不能含空白）' },
        { kind: 'error', input: tooLong, output: 'Invalid', note: 's 的長度是 2×10^5 + 1，超過上限' },
      ],
      hints: [
        '用 `cnt[26]` 記錄每個字母在視窗 `s[l..r]` 裡出現幾次，再用 `distinct` 記錄有幾種字母的次數大於 0。',
        '擴張：`cnt[c]` 從 0 變 1 時 distinct 加 1。收縮：`cnt[s[l]]` 減 1，從 1 變 0 時 distinct 減 1，然後 l 加 1。',
        '這是「求最長」：`while distinct > K` 收縮，while 之後視窗一定合法，再用 `r − l + 1` 更新答案。',
        'K = 0 時不必特判：每個字母一進來就讓 distinct 變 1，視窗會收縮成空的，長度 0。',
        '先讀進所有的項，確認剛好兩項，再檢查 K 的每個字元都是數字、s 的每個字元都是 a～z。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> tok;  // 先讀進所有的項，才能檢查是否剛好兩項
    std::string w;
    while (std::cin >> w) tok.push_back(w);
    bool ok = tok.size() == 2 && !tok[0].empty() && tok[0].size() <= 9;
    if (ok) for (char ch : tok[0]) if (ch < '0' || ch > '9') ok = false;
    int K = ok ? std::stoi(tok[0]) : -1;
    if (ok && (K > 26 || tok[1].size() > 200000)) ok = false;
    if (ok) for (char ch : tok[1]) if (ch < 'a' || ch > 'z') ok = false;
    if (!ok) {
        std::cout << "Invalid\n";
        return 0;
    }
    const std::string& s = tok[1];
    int cnt[26] = {};
    int distinct = 0, l = 0, best = 0;
    for (int r = 0; r < static_cast<int>(s.size()); ++r) {
        if (cnt[s[r] - 'a']++ == 0) ++distinct;      // 擴張：新的一種字母
        while (distinct > K) {                       // 不合法：收縮到最多 K 種
            if (--cnt[s[l] - 'a'] == 0) --distinct;  // 這種字母完全離開視窗
            ++l;
        }
        if (r - l + 1 > best) best = r - l + 1;      // 收縮完一定合法
    }
    std::cout << best << "\n";
    return 0;
}`,
        Python: code`import sys


def solve(tok):
    if len(tok) != 2 or not 1 <= len(tok[0]) <= 9 or any(not "0" <= ch <= "9" for ch in tok[0]):
        return "Invalid"
    k, s = int(tok[0]), tok[1]
    if k > 26 or len(s) > 200000 or any(not "a" <= ch <= "z" for ch in s):
        return "Invalid"
    cnt = [0] * 26
    distinct = l = best = 0
    for r, ch in enumerate(s):
        c = ord(ch) - 97
        if cnt[c] == 0:
            distinct += 1  # 擴張：新的一種字母
        cnt[c] += 1
        while distinct > k:  # 不合法：收縮到最多 k 種
            x = ord(s[l]) - 97
            cnt[x] -= 1
            if cnt[x] == 0:
                distinct -= 1  # 這種字母完全離開視窗
            l += 1
        best = max(best, r - l + 1)  # 收縮完一定合法
    return str(best)


print(solve(sys.stdin.read().split()))`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    static String solve(List<String> tok) {
        if (tok.size() != 2 || tok.get(0).isEmpty() || tok.get(0).length() > 9) return "Invalid";
        for (char ch : tok.get(0).toCharArray()) if (ch < '0' || ch > '9') return "Invalid";
        int k = Integer.parseInt(tok.get(0));
        String s = tok.get(1);
        if (k > 26 || s.length() > 200000) return "Invalid";
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) < 'a' || s.charAt(i) > 'z') return "Invalid";
        int[] cnt = new int[26];
        int distinct = 0, l = 0, best = 0;
        for (int r = 0; r < s.length(); r++) {
            if (cnt[s.charAt(r) - 'a']++ == 0) distinct++;      // 擴張：新的一種字母
            while (distinct > k) {                              // 不合法：收縮到最多 k 種
                if (--cnt[s.charAt(l) - 'a'] == 0) distinct--;  // 這種字母完全離開視窗
                l++;
            }
            best = Math.max(best, r - l + 1);                   // 收縮完一定合法
        }
        return String.valueOf(best);
    }

    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        List<String> tok = new ArrayList<>();  // 先讀進所有的項，才能檢查是否剛好兩項
        String line;
        while ((line = br.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) tok.add(st.nextToken());
        }
        System.out.println(solve(tok));
    }
}`,
        JavaScript: code`function solve(tok) {
    if (tok.length !== 2 || !/^[0-9]{1,9}$/.test(tok[0])) return "Invalid";
    const k = Number(tok[0]), s = tok[1];
    if (k > 26 || s.length > 200000 || !/^[a-z]+$/.test(s)) return "Invalid";
    const cnt = new Array(26).fill(0);
    let distinct = 0, l = 0, best = 0;
    for (let r = 0; r < s.length; r++) {
        const c = s.charCodeAt(r) - 97;
        if (cnt[c]++ === 0) distinct++;       // 擴張：新的一種字母
        while (distinct > k) {                // 不合法：收縮到最多 k 種
            if (--cnt[s.charCodeAt(l) - 97] === 0) distinct--;  // 這種字母完全離開視窗
            l++;
        }
        best = Math.max(best, r - l + 1);     // 收縮完一定合法
    }
    return String(best);
}

// 先讀進所有的項，才能檢查是否剛好兩項
const text = require("fs").readFileSync(0, "utf8").trim();
console.log(solve(text === "" ? [] : text.split(/\s+/)));`,
      },
      judge: 'none',
    },
  ],
};
