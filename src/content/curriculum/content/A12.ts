import type { LessonContent, TraceStep } from '../schema';
import { combinationSumSteps } from '../simulate-algorithms';

const code = String.raw;

/** The visualization's input: two 2s, so the same-depth duplicate skip shows up, and 5 > remain triggers the break. */
const TRACE_CANDIDATES = [2, 3, 5, 2];
const TRACE_TARGET = 7;

/**
 * combinationSumSteps runs the same algorithm as the trace code (sort, skip a value equal to the previous one at the
 * same depth, break when c[i] > remain, each item used once). Its leave event ('return') is drawn on the for loop
 * (line 5, the candidates ran out); when the step before it was a prune, the loop ended by `break`, so that step is
 * moved to line 9 and says so. The root's leave says the search is over. The simulator sets `output` only when something
 * is printed, so the printed lines are carried forward to every later step.
 */
let printed = '';
const traceSteps: TraceStep[] = combinationSumSteps(TRACE_CANDIDATES, TRACE_TARGET, { call: 1, found: 3, return: 5, skip: 7, prune: 9, undo: 12, result: 15, default: 1 })
  .map((step, k, all): TraceStep => {
    if (step.output !== undefined) printed = step.output;
    const shown: TraceStep = printed ? { ...step, output: printed } : step;
    if (step.line === 5 && all[k - 1]?.line === 9) return { ...shown, line: 9, note: '`break` 跳出迴圈：後面的候選只會更大，這一層不再嘗試，回到上一層。' };
    if (k === all.length - 2) return { ...shown, note: '根節點的候選也都試完了：每個可能的組合都已經被考慮過（或被剪枝排除），整個搜尋結束。' };
    if (k === all.length - 1) return { ...shown, note: `${step.note}排序後是 [2, 2, 3, 5]：第二層的 2 和第一層的 2 是不同的元素，所以 [2, 2, 3] 合法；但在第一層再選第二個 2 開頭，會重複整個 [2, …] 的分支，所以被跳過。` };
    return shown;
  });

/**
 * The exercise's worst case: 12 distinct values, k = 6, C(12, 6) = 924 combinations. The expected output is built by a
 * method that shares nothing with backtracking: every bitmask of the sorted values with k bits, deduplicated by text and
 * sorted element by element (checked against Python's itertools.combinations on the same input).
 */
const BIG_VALUES = [37, -5, 12, 0, 99, -88, 7, 64, -23, 50, 3, -1];
const BIG_K = 6;
function combinationsByBitmask(values: number[], k: number): string {
  const a = [...values].sort((x, y) => x - y);
  const seen = new Map<string, number[]>();
  for (let mask = 0; mask < (1 << a.length); mask++) {
    const pick = a.filter((_, i) => ((mask >> i) & 1) === 1);
    if (pick.length === k) seen.set(pick.join(' '), pick);
  }
  const rows = [...seen.values()].sort((x, y) => {
    for (let i = 0; i < k; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  return [...rows.map(r => (r.length ? r.join(' ') : '(empty)')), `total ${rows.length}`].join('\n');
}
const bigInput = `${BIG_VALUES.length} ${BIG_K}\n${BIG_VALUES.join(' ')}`;
const bigOutput = combinationsByBitmask(BIG_VALUES, BIG_K);

/**
 * A12 Backtracking. Every example and the reference solutions run in tests/curriculum-code.test.ts. 2026-11-02: also
 * offers JavaScript (Node.js); results are built in the same order as the other languages, and numbers sort with (a, b) => a - b.
 */
export const A12: LessonContent = {
  lessonId: 'A12',
  motivation: '有些問題沒有公式，只能「把所有可能都試一遍」：列出 5 個人的所有排隊順序、從 10 道菜選 3 道的所有組合、找出和剛好是 100 的商品組合、在棋盤上放 8 個互不攻擊的皇后。用迴圈寫，選幾個就要幾層迴圈，而且層數常常要等讀到輸入才知道；回溯法（backtracking）用遞迴（A11）代替迴圈：每一層做一個選擇，遞迴到下一層，回來後撤銷（undo）這個選擇，再試下一個。它能有系統地走過所有可能，不漏也不重複，而且能在一條路「已經不可能成功」時立刻回頭（剪枝，pruning），省下大量的時間。它的限制也很明確：可能性的數量常是 2^n 或 n!，n 稍微變大就算不完，所以要先估計搜尋空間；如果題目只要「最多幾種、最大是多少」而不必列出每一個，動態規劃（A17）通常快得多。',
  sections: [
    {
      id: 'template', title: '回溯的模板：選擇、遞迴、撤銷',
      blocks: [
        { type: 'p', text: '想像在迷宮的岔路口：選一條路走下去；走到底發現是死路，就退回岔路口，換另一條。回溯法把問題看成一連串的決定，每個決定是搜尋樹（search tree）的一層：根節點是「什麼都還沒選」，每條邊是一個選擇，每個節點代表「到目前為止的選擇」，葉節點是做完所有決定的狀態。整個演算法就是用深度優先（depth-first）的順序走過這棵樹：先一路往下，到底了再退回上一個節點試下一條邊。' },
        { type: 'p', text: '程式裡的「目前位置」用狀態（state）表示，常見的有三種：`path`：目前選了哪些元素（從根到這個節點的路徑）；`used[]`：每個元素是否已經在 path 裡（排列需要）；`remain`：還差多少才達到目標（湊和的問題）。每一層的程式都長得一樣：' },
        { type: 'list', ordered: true, items: [
          '檢查是否到達終點（例如 `len(path) == n`、`remain == 0`）：是就記錄答案並 `return`。',
          '對每個「這一層可以選的候選」：如果它不合法或不可能成功，就跳過或停止（剪枝）。',
          '選擇：把候選加進狀態（`path.append(x)`、`used[i] = True`、`remain - x`）。',
          '遞迴：呼叫下一層，去處理剩下的決定。',
          '撤銷：把第 3 步的改變還原（`path.pop()`、`used[i] = False`），讓狀態回到進入這個候選之前的樣子，才能試下一個候選。',
        ] },
        { type: 'p', text: '為什麼撤銷這麼重要？因為整個搜尋共用同一份 path 與 used[]，它們代表「目前所在的節點」。從子節點回到父節點時，狀態也必須回到父節點的樣子；只要有一個改變沒還原，之後所有的分支都會建立在錯誤的狀態上。`remain` 通常當作參數傳下去（`dfs(i + 1, remain - x)`），每一層都有自己的 remain，回來時自動是原本的值，不需要手動撤銷；共用的 list 與陣列才需要。' },
        { type: 'example', id: 'permutations-used' },
        { type: 'p', text: '排列的每一層都要從所有元素中挑一個「還沒用過的」，所以需要 used[]。第一層有 3 種選擇，第二層剩 2 種，第三層剩 1 種：搜尋樹有 1 + 3 + 6 + 6 = 16 個節點（`calls 16`），其中 6 個葉節點就是 3! = 6 種排列。因為每一層都由小到大嘗試候選，輸出自然依字典序（lexicographic order）排列，不需要事後排序。' },
        { type: 'callout', tone: 'warning', title: '忘了撤銷 used[]，只會得到一個排列', text: '如果遞迴回來後只寫 `path.pop()`，忘了 `used[i] = False`，對 [1, 2, 3] 只會印出 `1 2 3`：第一次走到底之後，1、2、3 全都留在「已用過」的狀態，之後每一層的每個候選都被當成用過而跳過。反過來，如果忘了 `path.pop()` 而只還原 used[]，path 會越來越長，印出的排列是錯的。檢查方法：選擇與撤銷要成對出現，寫的時候上下對齊，一行改變就配一行還原。' },
      ],
    },
    {
      id: 'enumerate', title: '列舉子集、排列與組合',
      blocks: [
        { type: 'p', text: '三種最基本的列舉問題用的是同一個模板，差別只在「每一層的候選是誰」與「什麼時候記錄答案」：' },
        { type: 'table', head: ['問題', '每一層的候選', '何時記錄', '答案個數', '搜尋樹'], rows: [
          ['子集（subset）', '`start` 之後的元素：`for i in range(start, n)`，遞迴傳 `i + 1`', '每個節點都是一個子集', '2^n', '共 2^n 個節點'],
          ['排列（permutation）', '所有還沒用過的元素：`if not used[i]`', '`len(path) == n` 的葉節點', 'n!', '第 d 層有 n!/(n − d)! 個節點'],
          ['組合（combination），選 k 個', '同子集，`start` 之後的元素', '`len(path) == k` 時記錄並停止往下', 'C(n, k)', '子集樹在第 k 層截斷'],
        ] },
        { type: 'p', text: '子集為什麼用 `start`？如果每一層都從頭選，{1, 2} 和 {2, 1} 會被當成兩個不同的答案。規定「只能選比上一個元素位置更後面的」，每個子集就只會以「由小到大」的一種順序被產生，不重複也不遺漏：任何子集把元素依位置排好，就是搜尋樹中唯一一條從根往下的路徑。排列則相反，順序本身就是答案的一部分，所以每一層都要從頭看，只排除已用過的。' },
        { type: 'example', id: 'subsets-lex' },
        { type: 'p', text: '程式在每個節點一進入就印出 path（前序，preorder），所以先印 `{}`，再印 `{1}`，接著沿著 1 往下印 `{1, 2}`、`{1, 2, 3}`，退回後印 `{1, 3}`，然後才輪到以 2 開頭的子集。這個順序正是字典序：比較兩個序列時，從第一個元素開始比，較短的前綴排在前面。輸出順序完全由「候選的嘗試順序」決定，所以只要候選先排好序、每一層由小到大嘗試，結果就是確定的（deterministic），不會因為語言或執行次數而改變。' },
        { type: 'p', text: '另一種常見的子集寫法是「對第 i 個元素做二選一：選或不選」，每一層只有兩條邊，答案只在第 n 層的葉節點出現。它也產生 2^n 個子集，但順序不同：先「選」的話，[1, 2, 3] 會先印 `123`，最後才是空集合。兩種寫法都對，題目要求特定順序時，要選對寫法或在最後排序。' },
        { type: 'p', text: '組合是「只要大小剛好 k 的子集」：在子集的程式中改成 `len(path) == k` 時才記錄並 `return`。從 5 個數選 3 個有 C(5, 3) = 10 種。本課的練習題就是列出組合，而且輸入可能有重複的值，要用下一節的技巧避免重複的答案。' },
      ],
    },
    {
      id: 'pruning', title: '剪枝：提早放棄不可能成功的分支',
      blocks: [
        { type: 'p', text: '剪枝（pruning）是在選擇之前先問：「從這裡往下，還有可能得到答案嗎？」不可能就不往下走，整棵子樹都省掉。它的正確性只靠一個條件：被剪掉的分支裡確實沒有答案。只要每次剪掉的都是「不可能的答案」，剩下的搜尋仍然會找到每一個解，結果和不剪枝完全相同，只是快得多。常見的剪枝有：' },
        { type: 'list', items: [
          '超過目標就停：候選都是正數而且已由小到大排序時，如果 `c[i] > remain`，選它一定超過目標，而它後面的候選更大，也一定超過，所以直接 `break`，整個 for 迴圈剩下的部分都不用試。',
          '剩下的不夠：選組合時，還需要 `k - len(path)` 個，但從 i 開始只剩 `n - i` 個元素；`n - i < k - len(path)` 就不可能湊滿，`break`。',
          '衝突就跳過：N 皇后（N-Queens）每一列放一個皇后，如果某一欄、某條對角線已經有皇后，放在那裡一定會被攻擊，直接 `continue` 試下一格。',
          '跳過重複：候選中有相同的值時，同一層選兩次相同的值會產生完全相同的子樹。先排序讓相同的值相鄰，再用 `if i > start and c[i] == c[i - 1]: continue` 只保留每種值在這一層的第一次。',
        ] },
        { type: 'p', text: '跳過重複的條件要看清楚：`i > start` 表示「不是這一層的第一個候選」。在 [1, 1, 2] 選 2 個時，第一層選了第一個 1 之後，第二層的第一個候選是第二個 1（i == start），它可以選，所以 `1 1` 會出現；第一層跳過的是「再拿第二個 1 當開頭」，因為那會重複整個以 1 開頭的分支。若寫成 `i > 0`，就會連 `1 1` 也錯誤地刪掉。' },
        { type: 'example', id: 'combo-sum-prune' },
        { type: 'p', text: '範例在 [10, 1, 2, 7, 6, 1, 5] 中找和為 8 的組合（每個數最多用一次）。排序後是 [1, 1, 2, 5, 6, 7, 10]：有 `break` 時只呼叫 17 次；沒有 `break`、要等到 `remain < 0` 才回頭時要 47 次，兩者找到的組合完全相同。下方的視覺化用同樣的程式跑 [2, 3, 5, 2] 湊 7，可以一步步看到「選、遞迴、撤銷」、跳過重複的 2，以及 `5 > remain` 時的 `break`。' },
        { type: 'callout', tone: 'warning', title: '`break` 需要排序作前提', text: '「`c[i] > remain` 就 `break`」只有在候選由小到大排好、而且都是正數時才正確。忘了排序時，[6, 1, 2] 湊 3：第一個候選 6 > 3 就 break，整個搜尋什麼都沒找到，但 1 + 2 = 3 明明存在。有負數時「超過目標」也不代表之後不能再減回來，這個剪枝就完全不能用。如果不確定能不能 break，改成 `continue` 只跳過這一個，仍然正確但省得較少。' },
        { type: 'example', id: 'n-queens' },
        { type: 'p', text: 'N 皇后：在 n × n 的棋盤上放 n 個皇后，任兩個不在同一列、同一欄或同一條對角線。每一列放一個，搜尋樹的第 r 層決定第 r 列的皇后放在哪一欄。用三個布林陣列在 O(1) 時間檢查衝突：`col[c]`、左上到右下的對角線 `r - c` 是固定的（加上 n − 1 變成非負的索引）、右上到左下的對角線 `r + c` 是固定的。n = 8 時有 92 個解，總共只呼叫了 2057 次；如果不剪枝、每列 8 種隨便放，要檢查 8^8 = 16,777,216 種擺法。' },
      ],
    },
    {
      id: 'feasibility', title: '搜尋空間有多大：複雜度與可行範圍',
      blocks: [
        { type: 'p', text: '回溯的時間大約是「搜尋樹的節點數 × 每個節點的工作量」。列舉全部答案時，答案的個數就是下限：子集有 2^n 個，每個印出來要 O(n)，總共 O(n · 2^n)；排列有 n! 個，搜尋樹所有層加起來不超過 e · n!（約 2.72 · n!）個節點，每個節點的 for 迴圈看 n 個候選，總共 O(n · n!)；組合有 C(n, k) 個。空間方面，path 與 used[] 是 O(n)，遞迴深度也只有 n（不含存下所有答案的空間）。' },
        { type: 'table', head: ['n', '2^n（子集）', 'n!（排列）', 'C(n, n/2)（組合）'], rows: [
          ['8', '256', '40,320', '70'],
          ['10', '1,024', '3,628,800', '252'],
          ['15', '32,768', '約 1.3 × 10^12', '6,435'],
          ['20', '1,048,576', '約 2.4 × 10^18', '184,756'],
        ] },
        { type: 'p', text: '粗略的估計方式：一般的程式每秒大約能做 10^8 次簡單運算（只是數量級，實際依機器與語言而定，Python 通常慢很多倍）。n · 2^n 在 n = 20 時約 2 × 10^7，可以；n = 30 時約 3 × 10^10，不行。n · n! 在 n = 10 時約 3.6 × 10^7，可以；n = 12 時約 5.7 × 10^9，就太慢了。所以經驗上：列舉子集大約 n ≤ 20、列舉排列大約 n ≤ 10。剪枝很強的問題（如 N 皇后）可以超過這個範圍，但剪枝的效果很難事先保證，最壞情況仍要以沒剪枝的大小來估計。' },
        { type: 'table', head: ['情況', '適合的方法', '原因'], rows: [
          ['選的個數固定而且很少（例如兩兩配對、選 3 個）', '巢狀迴圈', '層數固定，兩三層迴圈最直接，不需要遞迴'],
          ['要列出每一個排列、組合或子集，n 很小', '回溯', '答案本身就有這麼多個，任何方法都至少要花這麼久'],
          ['要找一個或所有滿足複雜限制的解（N 皇后、數獨、湊和）', '回溯 + 剪枝', '限制能及早排除大部分分支'],
          ['只要「有幾種」或「最好是多少」，而且狀態可以用小範圍的數字表示（例如總和 ≤ 10^4）', '動態規劃（A17、A18）', '相同的子問題只算一次，不必逐一列出 2^n 個子集'],
        ] },
        { type: 'p', text: '遞迴深度：回溯的深度等於決定的個數 n，本課的問題都只有十幾層，遠低於 Python 預設約 1000 層的遞迴上限，C++、Java 與 JavaScript 的呼叫堆疊也不會有問題。真正的瓶頸是搜尋樹的寬度（節點數），不是深度。' },
      ],
    },
    {
      id: 'languages', title: '語言細節：存答案時要複製',
      blocks: [
        { type: 'p', text: '回溯在走到終點時要把 path 存進結果，這裡藏著一個各語言行為不同的陷阱。Python 的 `res.append(path)`、Java 的 `res.add(path)` 與 JavaScript 的 `res.push(path)` 存的是「同一個 list 物件的參照（reference）」，不是當下內容的複本；之後 path 繼續被 append、pop，結果裡的每一項都跟著變，搜尋結束時 path 已經空了，所以全部都變成 `[]`。C++ 的 `res.push_back(path)` 則會複製整個 `std::vector`，存下的是當下的內容，不會有這個問題。' },
        { type: 'example', id: 'copy-trap' },
        { type: 'p', text: '範例的 C++ 版本故意存 path 的位址（`&path`），重現 Python、Java 與 JavaScript 存參照的效果：四個指標都指向同一個 path，印出來全是空的。正常的 C++ 寫法 `right.push_back(path)` 就是複製。各語言保存答案的正確寫法：' },
        { type: 'table', head: ['語言', '存下當下的 path', '不要這樣寫'], rows: [
          ['Python', '`res.append(path[:])`、`res.append(list(path))` 或 `res.append(tuple(path))`', '`res.append(path)`'],
          ['Java', '`res.add(new ArrayList<>(path))`', '`res.add(path)`'],
          ['C++', '`res.push_back(path)`（自動複製）', '存 `&path` 或參照包裝'],
          ['JavaScript', '`res.push([...path])` 或 `res.push(path.slice())`', '`res.push(path)`'],
        ] },
        { type: 'callout', tone: 'warning', title: '存的是同一個 list，結果全部一樣', text: '`res.append(path)` 的錯誤不會讓程式當掉：答案的個數是對的，只有內容全錯（通常全是空的，或全是最後一個狀態）。看到「每一筆結果都一樣」就先檢查這一行。另一個 Java 陷阱：`List<Integer>` 的 `path.remove(path.size() - 1)` 呼叫的是 `remove(int index)`，移除最後一個；但 `path.remove(x)` 若 x 是 `Integer` 物件，呼叫的是 `remove(Object)`，移除「第一個等於 x 的元素」，有重複值時會刪錯位置。撤銷時一律用索引刪最後一個。' },
        { type: 'p', text: '傳遞狀態的方式也有差別。C++ 把 path 寫成 `std::vector<int>& path`（參照）或全域變數時，整個搜尋共用一份，需要撤銷；如果寫成傳值 `std::vector<int> path`，每次呼叫都複製一份，不需要撤銷但每層多花 O(n) 的時間。Java 的物件（`ArrayList`、陣列）本來就是共用參照，`int` 參數是複製。Python 的 list 參數也是共用的，而 `remain - x` 這種整數每一層都是新的值；JavaScript 的陣列同樣是共用參照，數字參數則是複製。共用狀態 + 撤銷，是回溯最常見也最省記憶體的寫法。' },
      ],
    },
  ],
  examples: [
    {
      id: 'permutations-used', title: '用 used[] 列出排列', description: '列出 A、B、C 的所有排列（依字典序），並數出搜尋樹的節點數（呼叫次數）。',
      output: 'A B C\nA C B\nB A C\nB C A\nC A B\nC B A\npermutations 6 calls 16',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

std::vector<std::string> items = {"A", "B", "C"};
std::vector<bool> used(items.size(), false);
std::vector<std::string> path;
int calls = 0, total = 0;

void perm() {
    ++calls;
    if (path.size() == items.size()) {  // 葉節點：一個完整的排列
        ++total;
        for (std::size_t j = 0; j < path.size(); ++j) std::cout << (j ? " " : "") << path[j];
        std::cout << "\n";
        return;
    }
    for (std::size_t i = 0; i < items.size(); ++i) {
        if (used[i]) continue;      // 已經在 path 裡
        used[i] = true;             // 選擇
        path.push_back(items[i]);
        perm();                     // 遞迴
        path.pop_back();            // 撤銷：兩個改變都要還原
        used[i] = false;
    }
}

int main() {
    perm();
    std::cout << "permutations " << total << " calls " << calls << "\n";
    return 0;
}`,
        Python: code`items = ["A", "B", "C"]
used = [False] * len(items)
path = []
calls = total = 0


def perm():
    global calls, total
    calls += 1
    if len(path) == len(items):  # 葉節點：一個完整的排列
        total += 1
        print(" ".join(path))
        return
    for i in range(len(items)):
        if used[i]:  # 已經在 path 裡
            continue
        used[i] = True  # 選擇
        path.append(items[i])
        perm()  # 遞迴
        path.pop()  # 撤銷：兩個改變都要還原
        used[i] = False


perm()
print("permutations", total, "calls", calls)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static String[] items = {"A", "B", "C"};
    static boolean[] used = new boolean[items.length];
    static List<String> path = new ArrayList<>();
    static int calls = 0, total = 0;

    static void perm() {
        calls++;
        if (path.size() == items.length) {  // 葉節點：一個完整的排列
            total++;
            System.out.println(String.join(" ", path));
            return;
        }
        for (int i = 0; i < items.length; i++) {
            if (used[i]) continue;          // 已經在 path 裡
            used[i] = true;                 // 選擇
            path.add(items[i]);
            perm();                         // 遞迴
            path.remove(path.size() - 1);   // 撤銷：兩個改變都要還原
            used[i] = false;
        }
    }

    public static void main(String[] args) {
        perm();
        System.out.println("permutations " + total + " calls " + calls);
    }
}`,
        JavaScript: code`const items = ["A", "B", "C"];
const used = new Array(items.length).fill(false);
const path = [];
let calls = 0, total = 0;

function perm() {
    calls++;
    if (path.length === items.length) {  // 葉節點：一個完整的排列
        total++;
        console.log(path.join(" "));
        return;
    }
    for (let i = 0; i < items.length; i++) {
        if (used[i]) continue;      // 已經在 path 裡
        used[i] = true;             // 選擇
        path.push(items[i]);
        perm();                     // 遞迴
        path.pop();                 // 撤銷：兩個改變都要還原
        used[i] = false;
    }
}

perm();
console.log("permutations " + total + " calls " + calls);`,
      },
    },
    {
      id: 'subsets-lex', title: '依字典序列出所有子集', description: '每個節點都是一個子集；候選只從 start 之後選，[1, 2, 3] 的 8 個子集依字典序印出。',
      output: '{}\n{1}\n{1, 2}\n{1, 2, 3}\n{1, 3}\n{2}\n{2, 3}\n{3}\ntotal 8',
      code: {
        'C++': code`#include <iostream>
#include <vector>

std::vector<int> items = {1, 2, 3};
std::vector<int> path;
int total = 0;

// 每個節點都是一個子集；只往 start 之後選，每個子集只出現一次，而且依字典序。
void dfs(int start) {
    ++total;
    std::cout << "{";
    for (std::size_t j = 0; j < path.size(); ++j) std::cout << (j ? ", " : "") << path[j];
    std::cout << "}\n";
    for (int i = start; i < static_cast<int>(items.size()); ++i) {
        path.push_back(items[i]);  // 選擇
        dfs(i + 1);                // 遞迴：下一個只能選 i 之後的
        path.pop_back();           // 撤銷
    }
}

int main() {
    dfs(0);
    std::cout << "total " << total << "\n";
    return 0;
}`,
        Python: code`items = [1, 2, 3]
path = []
total = 0


def dfs(start):
    """每個節點都是一個子集；只往 start 之後選，每個子集只出現一次，而且依字典序。"""
    global total
    total += 1
    print("{" + ", ".join(map(str, path)) + "}")
    for i in range(start, len(items)):
        path.append(items[i])  # 選擇
        dfs(i + 1)  # 遞迴：下一個只能選 i 之後的
        path.pop()  # 撤銷


dfs(0)
print("total", total)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static int[] items = {1, 2, 3};
    static List<Integer> path = new ArrayList<>();
    static int total = 0;

    // 每個節點都是一個子集；只往 start 之後選，每個子集只出現一次，而且依字典序。
    static void dfs(int start) {
        total++;
        StringBuilder sb = new StringBuilder("{");
        for (int j = 0; j < path.size(); j++) sb.append(j > 0 ? ", " : "").append(path.get(j));
        System.out.println(sb.append("}"));
        for (int i = start; i < items.length; i++) {
            path.add(items[i]);            // 選擇
            dfs(i + 1);                    // 遞迴：下一個只能選 i 之後的
            path.remove(path.size() - 1);  // 撤銷（用索引刪最後一個）
        }
    }

    public static void main(String[] args) {
        dfs(0);
        System.out.println("total " + total);
    }
}`,
        JavaScript: code`const items = [1, 2, 3];
const path = [];
let total = 0;

// 每個節點都是一個子集；只往 start 之後選，每個子集只出現一次，而且依字典序。
function dfs(start) {
    total++;
    console.log("{" + path.join(", ") + "}");
    for (let i = start; i < items.length; i++) {
        path.push(items[i]);  // 選擇
        dfs(i + 1);           // 遞迴：下一個只能選 i 之後的
        path.pop();           // 撤銷
    }
}

dfs(0);
console.log("total " + total);`,
      },
    },
    {
      id: 'combo-sum-prune', title: '湊和：排序、跳過重複與剪枝', description: '在 [10, 1, 2, 7, 6, 1, 5] 中找和為 8 的組合（每個數最多用一次），比較有無 break 剪枝的呼叫次數。',
      output: '1 + 1 + 6\n1 + 2 + 5\n1 + 7\n2 + 6\ncalls with pruning 17\ncalls without pruning 47',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

std::vector<int> c = {10, 1, 2, 7, 6, 1, 5};
std::vector<int> path;
std::vector<std::string> found;
int calls = 0;

void dfs(int start, int remain, bool prune) {
    ++calls;
    if (remain == 0) {
        std::string s;
        for (std::size_t j = 0; j < path.size(); ++j) s += (j ? " + " : "") + std::to_string(path[j]);
        found.push_back(s);
        return;
    }
    if (remain < 0) return;  // 沒有剪枝時，要走到這裡才發現超過
    for (int i = start; i < static_cast<int>(c.size()); ++i) {
        if (i > start && c[i] == c[i - 1]) continue;  // 同一層跳過相同的值
        if (prune && c[i] > remain) break;            // 後面只會更大：整層停止
        path.push_back(c[i]);
        dfs(i + 1, remain - c[i], prune);             // 每個數最多用一次：從 i + 1 開始
        path.pop_back();
    }
}

int main() {
    std::sort(c.begin(), c.end());  // 跳過重複與 break 都需要排序
    dfs(0, 8, true);
    int withPruning = calls;
    for (const std::string& s : found) std::cout << s << "\n";
    calls = 0;
    found.clear();
    dfs(0, 8, false);
    std::cout << "calls with pruning " << withPruning << "\n";
    std::cout << "calls without pruning " << calls << "\n";
    return 0;
}`,
        Python: code`c = sorted([10, 1, 2, 7, 6, 1, 5])  # 跳過重複與 break 都需要排序
path, found = [], []
calls = 0


def dfs(start, remain, prune):
    global calls
    calls += 1
    if remain == 0:
        found.append(" + ".join(map(str, path)))
        return
    if remain < 0:  # 沒有剪枝時，要走到這裡才發現超過
        return
    for i in range(start, len(c)):
        if i > start and c[i] == c[i - 1]:  # 同一層跳過相同的值
            continue
        if prune and c[i] > remain:  # 後面只會更大：整層停止
            break
        path.append(c[i])
        dfs(i + 1, remain - c[i], prune)  # 每個數最多用一次：從 i + 1 開始
        path.pop()


dfs(0, 8, True)
with_pruning = calls
print("\n".join(found))
calls = 0
found.clear()
dfs(0, 8, False)
print("calls with pruning", with_pruning)
print("calls without pruning", calls)`,
        Java: code`import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
    static int[] c = {10, 1, 2, 7, 6, 1, 5};
    static List<Integer> path = new ArrayList<>();
    static List<String> found = new ArrayList<>();
    static int calls = 0;

    static void dfs(int start, int remain, boolean prune) {
        calls++;
        if (remain == 0) {
            StringBuilder sb = new StringBuilder();
            for (int j = 0; j < path.size(); j++) sb.append(j > 0 ? " + " : "").append(path.get(j));
            found.add(sb.toString());
            return;
        }
        if (remain < 0) return;  // 沒有剪枝時，要走到這裡才發現超過
        for (int i = start; i < c.length; i++) {
            if (i > start && c[i] == c[i - 1]) continue;  // 同一層跳過相同的值
            if (prune && c[i] > remain) break;            // 後面只會更大：整層停止
            path.add(c[i]);
            dfs(i + 1, remain - c[i], prune);             // 每個數最多用一次：從 i + 1 開始
            path.remove(path.size() - 1);
        }
    }

    public static void main(String[] args) {
        Arrays.sort(c);  // 跳過重複與 break 都需要排序
        dfs(0, 8, true);
        int withPruning = calls;
        for (String s : found) System.out.println(s);
        calls = 0;
        found.clear();
        dfs(0, 8, false);
        System.out.println("calls with pruning " + withPruning);
        System.out.println("calls without pruning " + calls);
    }
}`,
        JavaScript: code`const c = [10, 1, 2, 7, 6, 1, 5].sort((x, y) => x - y);  // 跳過重複與 break 都需要排序
const path = [];
let found = [];
let calls = 0;

function dfs(start, remain, prune) {
    calls++;
    if (remain === 0) {
        found.push(path.join(" + "));
        return;
    }
    if (remain < 0) return;  // 沒有剪枝時，要走到這裡才發現超過
    for (let i = start; i < c.length; i++) {
        if (i > start && c[i] === c[i - 1]) continue;  // 同一層跳過相同的值
        if (prune && c[i] > remain) break;             // 後面只會更大：整層停止
        path.push(c[i]);
        dfs(i + 1, remain - c[i], prune);              // 每個數最多用一次：從 i + 1 開始
        path.pop();
    }
}

dfs(0, 8, true);
const withPruning = calls;
for (const s of found) console.log(s);
calls = 0;
found = [];
dfs(0, 8, false);
console.log("calls with pruning " + withPruning);
console.log("calls without pruning " + calls);`,
      },
    },
    {
      id: 'n-queens', title: 'N 皇后：衝突就剪枝', description: '對 n = 4～8 數出 N 皇后的解的個數，以及搜尋樹的節點數（呼叫次數）。',
      output: 'n=4 solutions=2 calls=17\nn=5 solutions=10 calls=54\nn=6 solutions=4 calls=153\nn=7 solutions=40 calls=552\nn=8 solutions=92 calls=2057',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int n, solutions, calls;
std::vector<bool> col, diag1, diag2;  // diag1: r + c 固定；diag2: r - c 固定（加 n - 1 變成非負）

void mark(int r, int c, bool value) {
    col[c] = value;
    diag1[r + c] = value;
    diag2[r - c + n - 1] = value;
}

void place(int r) {  // 決定第 r 列的皇后放哪一欄
    ++calls;
    if (r == n) {
        ++solutions;
        return;
    }
    for (int c = 0; c < n; ++c) {
        if (col[c] || diag1[r + c] || diag2[r - c + n - 1]) continue;  // 會被攻擊：剪枝
        mark(r, c, true);    // 選擇
        place(r + 1);        // 遞迴
        mark(r, c, false);   // 撤銷
    }
}

int main() {
    for (n = 4; n <= 8; ++n) {
        solutions = calls = 0;
        col.assign(n, false);
        diag1.assign(2 * n - 1, false);
        diag2.assign(2 * n - 1, false);
        place(0);
        std::cout << "n=" << n << " solutions=" << solutions << " calls=" << calls << "\n";
    }
    return 0;
}`,
        Python: code`def queens(n):
    col = [False] * n
    diag1 = [False] * (2 * n - 1)  # r + c 固定
    diag2 = [False] * (2 * n - 1)  # r - c 固定（加 n - 1 變成非負）
    solutions = calls = 0

    def mark(r, c, value):
        col[c] = diag1[r + c] = diag2[r - c + n - 1] = value

    def place(r):  # 決定第 r 列的皇后放哪一欄
        nonlocal solutions, calls
        calls += 1
        if r == n:
            solutions += 1
            return
        for c in range(n):
            if col[c] or diag1[r + c] or diag2[r - c + n - 1]:  # 會被攻擊：剪枝
                continue
            mark(r, c, True)  # 選擇
            place(r + 1)  # 遞迴
            mark(r, c, False)  # 撤銷

    place(0)
    return solutions, calls


for n in range(4, 9):
    solutions, calls = queens(n)
    print(f"n={n} solutions={solutions} calls={calls}")`,
        Java: code`public class Main {
    static int n, solutions, calls;
    static boolean[] col, diag1, diag2;  // diag1: r + c 固定；diag2: r - c 固定（加 n - 1 變成非負）

    static void mark(int r, int c, boolean value) {
        col[c] = value;
        diag1[r + c] = value;
        diag2[r - c + n - 1] = value;
    }

    static void place(int r) {  // 決定第 r 列的皇后放哪一欄
        calls++;
        if (r == n) {
            solutions++;
            return;
        }
        for (int c = 0; c < n; c++) {
            if (col[c] || diag1[r + c] || diag2[r - c + n - 1]) continue;  // 會被攻擊：剪枝
            mark(r, c, true);    // 選擇
            place(r + 1);        // 遞迴
            mark(r, c, false);   // 撤銷
        }
    }

    public static void main(String[] args) {
        for (n = 4; n <= 8; n++) {
            solutions = 0;
            calls = 0;
            col = new boolean[n];
            diag1 = new boolean[2 * n - 1];
            diag2 = new boolean[2 * n - 1];
            place(0);
            System.out.println("n=" + n + " solutions=" + solutions + " calls=" + calls);
        }
    }
}`,
        JavaScript: code`function queens(n) {
    const col = new Array(n).fill(false);
    const diag1 = new Array(2 * n - 1).fill(false);  // r + c 固定
    const diag2 = new Array(2 * n - 1).fill(false);  // r - c 固定（加 n - 1 變成非負）
    let solutions = 0, calls = 0;

    function mark(r, c, value) {
        col[c] = value;
        diag1[r + c] = value;
        diag2[r - c + n - 1] = value;
    }

    function place(r) {  // 決定第 r 列的皇后放哪一欄
        calls++;
        if (r === n) {
            solutions++;
            return;
        }
        for (let c = 0; c < n; c++) {
            if (col[c] || diag1[r + c] || diag2[r - c + n - 1]) continue;  // 會被攻擊：剪枝
            mark(r, c, true);    // 選擇
            place(r + 1);        // 遞迴
            mark(r, c, false);   // 撤銷
        }
    }

    place(0);
    return [solutions, calls];
}

for (let n = 4; n <= 8; n++) {
    const [solutions, calls] = queens(n);
    console.log("n=" + n + " solutions=" + solutions + " calls=" + calls);
}`,
      },
    },
    {
      id: 'copy-trap', title: '存答案時忘了複製', description: '列出 [1, 2] 的子集，一份存 path 本身（參照），一份存複本，比較搜尋結束後的內容。',
      output: 'wrong: [[], [], [], []]\nright: [[], [1], [1, 2], [2]]',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

std::vector<int> path;
std::vector<const std::vector<int>*> wrong;  // 存位址：和 Python／Java 存參照一樣，全都指向同一個 path
std::vector<std::vector<int>> right;         // push_back(path) 會複製當下的內容

std::string show(const std::vector<int>& v) {
    std::string s = "[";
    for (std::size_t j = 0; j < v.size(); ++j) s += (j ? ", " : "") + std::to_string(v[j]);
    return s + "]";
}

void dfs(int start) {
    wrong.push_back(&path);
    right.push_back(path);
    for (int i = start; i < 2; ++i) {
        path.push_back(i + 1);
        dfs(i + 1);
        path.pop_back();
    }
}

int main() {
    dfs(0);
    std::string w, r;
    for (std::size_t j = 0; j < wrong.size(); ++j) w += (j ? ", " : "") + show(*wrong[j]);
    for (std::size_t j = 0; j < right.size(); ++j) r += (j ? ", " : "") + show(right[j]);
    std::cout << "wrong: [" << w << "]\n";
    std::cout << "right: [" << r << "]\n";
    return 0;
}`,
        Python: code`wrong, right, path = [], [], []


def dfs(start):
    wrong.append(path)  # 錯：存的是同一個 list 的參照
    right.append(path[:])  # 對：存當下內容的複本
    for i in range(start, 2):
        path.append(i + 1)
        dfs(i + 1)
        path.pop()


dfs(0)
print("wrong:", wrong)
print("right:", right)`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static List<Integer> path = new ArrayList<>();
    static List<List<Integer>> wrong = new ArrayList<>();
    static List<List<Integer>> right = new ArrayList<>();

    static void dfs(int start) {
        wrong.add(path);                    // 錯：存的是同一個 ArrayList 的參照
        right.add(new ArrayList<>(path));   // 對：存當下內容的複本
        for (int i = start; i < 2; i++) {
            path.add(i + 1);
            dfs(i + 1);
            path.remove(path.size() - 1);
        }
    }

    public static void main(String[] args) {
        dfs(0);
        System.out.println("wrong: " + wrong);
        System.out.println("right: " + right);
    }
}`,
        JavaScript: code`const wrong = [], right = [], path = [];

function dfs(start) {
    wrong.push(path);         // 錯：存的是同一個陣列的參照
    right.push([...path]);    // 對：存當下內容的複本
    for (let i = start; i < 2; i++) {
        path.push(i + 1);
        dfs(i + 1);
        path.pop();
    }
}

// 印成和 Python 一樣的 [[], [1], ...] 格式
const show = list => "[" + list.map(v => "[" + v.join(", ") + "]").join(", ") + "]";

dfs(0);
console.log("wrong: " + show(wrong));
console.log("right: " + show(right));`,
      },
    },
  ],
  visualization: {
    kind: 'recursion-tree', title: '回溯的搜尋樹：[2, 3, 5, 2] 湊 7（每個數最多用一次）', language: 'Python',
    code: code`def dfs(start, remain):
    if remain == 0:
        print(*path)
        return
    for i in range(start, len(c)):
        if i > start and c[i] == c[i - 1]:
            continue
        if c[i] > remain:
            break
        path.append(c[i])
        dfs(i + 1, remain - c[i])
        path.pop()

c, path = sorted([2, 3, 5, 2]), []
dfs(0, 7)`,
    steps: traceSteps,
  },
  quiz: [
    {
      id: 'q-order', prompt: '下面的子集生成器對第 i 個元素「先選、再不選」，只在葉節點印出（空集合印成 `-`）。它依序印出什麼？',
      code: { language: 'Python', text: code`a = [1, 2, 3]
path = []

def dfs(i):
    if i == len(a):
        print("".join(map(str, path)) or "-")
        return
    path.append(a[i])
    dfs(i + 1)
    path.pop()
    dfs(i + 1)

dfs(0)` },
      options: ['123 12 13 1 23 2 3 -', '- 1 12 123 13 2 23 3', '- 3 2 23 1 13 12 123', '123 12 1 13 23 2 3 -'],
      answer: 0, explanation: '每一層先走「選 a[i]」的分支，所以第一個到達的葉節點是全選的 `123`；接著在最深處改成不選 3 得到 `12`，退回第二層改成不選 2，再依序得到 `13`、`1`；最後才走第一層「不選 1」的分支：`23`、`2`、`3`、`-`。「- 1 12 123 …」是本課「每個節點都印」的 start 寫法的順序；「- 3 2 23 …」是先「不選」再「選」的順序；最後一個選項在 `12` 之後錯誤地先印了 `1`，但 `13` 在 `1` 的「選 3」分支，比「不選 3」的 `1` 先到。（已實際執行驗證。）',
    },
    {
      id: 'q-nodes', prompt: '用本課的 used[] 寫法列出 4 個不同元素的所有排列，`perm()` 一進入就把計數器加 1（含根節點與葉節點）。計數器最後是多少？',
      options: ['65', '24', '64', '256'],
      answer: 0, explanation: '第 d 層的節點數是 4!/(4 − d)!：第 0 層 1 個、第 1 層 4 個、第 2 層 4 × 3 = 12 個、第 3 層 24 個、第 4 層 24 個，合計 1 + 4 + 12 + 24 + 24 = 65。24 只是葉節點（排列）的個數；64 漏算了根節點或把層數算錯；256 = 4^4 是「每層 4 種都可以選、允許重複」的數量，used[] 已經把重複的分支剪掉了。（已實際執行驗證：印出 65。）',
    },
    {
      id: 'q-prune', prompt: '下面的程式想找出和為 3 的組合，但忘了排序。它印出什麼？',
      code: { language: 'Python', text: code`c = [6, 1, 2]          # 忘了排序
path = []

def dfs(start, remain):
    if remain == 0:
        print(*path)
        return
    for i in range(start, len(c)):
        if c[i] > remain:
            break
        path.append(c[i])
        dfs(i + 1, remain - c[i])
        path.pop()

dfs(0, 3)
print("done")` },
      options: ['只印出 done', '1 2，然後 done', '2 1，然後 done', '6，然後 done'],
      answer: 0, explanation: '第一層的第一個候選是 6 > 3，`break` 直接結束整個迴圈，1 和 2 都沒有被試到，所以只印出 `done`。`break` 的理由是「後面的候選更大」，這個前提只有排序後才成立；先 `sorted(c)` 就會正確印出 `1 2`。「2 1」的順序不可能出現，因為 start 寫法只往後選；6 本身就超過 3，也不會被選。（已實際執行驗證。）',
    },
    {
      id: 'q-copy', prompt: '下面的程式收集 [1, 2, 3] 的所有排列。最後一行印出什麼？',
      code: { language: 'Python', text: code`a = [1, 2, 3]
res, path, used = [], [], [False] * 3

def perm():
    if len(path) == 3:
        res.append(path)
        return
    for i in range(3):
        if not used[i]:
            used[i] = True
            path.append(a[i])
            perm()
            path.pop()
            used[i] = False

perm()
print(len(res), res[0])` },
      options: ['6 []', '6 [1, 2, 3]', '1 [1, 2, 3]', '6 [3, 2, 1]'],
      answer: 0, explanation: '`res.append(path)` 存的是 path 這個 list 本身的參照，6 筆其實都是同一個物件。搜尋結束時每次 append 都被 pop 掉，path 是空的，所以 `res[0]` 印出 `[]`，個數 6 仍然正確。要存當下的內容必須複製：`res.append(path[:])`，那樣才會印出 `6 [1, 2, 3]`。「1 [1, 2, 3]」以為只會存一次；「6 [3, 2, 1]」以為會留下最後一個排列，但最後 path 已被撤銷到空。（已實際執行驗證。）',
    },
    {
      id: 'q-used', prompt: '下面的排列程式在遞迴回來後只寫了 `path.pop()`，忘了把 used[i] 改回 False。它印出什麼？',
      code: { language: 'Python', text: code`a = [1, 2, 3]
path, used = [], [False] * 3

def perm():
    if len(path) == 3:
        print(*path)
        return
    for i in range(3):
        if not used[i]:
            used[i] = True
            path.append(a[i])
            perm()
            path.pop()

perm()
print("end")` },
      options: ['1 2 3，然後 end', '6 個排列，然後 end', '1 2 3、1 3 2，然後 end', '無窮遞迴，最後 RecursionError'],
      answer: 0, explanation: '第一次走到底得到 `1 2 3` 之後，三個元素都被標成「用過」而且再也沒被還原；退回每一層時，剩下的候選全都被 `if not used[i]` 擋掉，搜尋就這樣結束，只印出一個排列。選項「6 個排列」是正確撤銷後的結果；「1 2 3、1 3 2」以為第二層還能改選 3，但 3 在印完 `1 2 3` 之後仍被標成用過，所以 `1 3 …` 這條路被擋掉；used[] 只會越來越多 True，候選越來越少，不可能無窮遞迴。（已實際執行驗證。）',
    },
    {
      id: 'q-complexity', prompt: '用回溯列出 n 個不同元素的所有排列，並把每個排列印成一行。整體時間複雜度是多少？',
      options: ['O(n · n!)', 'O(2^n)', 'O(n^2)', 'O(n!) 而且與 n 無關的常數倍'],
      answer: 0, explanation: '共有 n! 個排列，光是印出每個就要 O(n)，下限已是 n · n!；搜尋樹所有節點加起來不超過約 e · n! 個，每個節點的迴圈看 n 個候選，上限也是 O(n · n!)。O(2^n) 是子集的個數，排列比它多得多（n = 10 時 1024 對 3,628,800）；O(n^2) 是兩層迴圈；忽略每個排列要 O(n) 的輸出與檢查，才會得到純 O(n!)。',
    },
    {
      id: 'q-choose', prompt: '有 n = 100 件商品，價格都是 1～100 的整數。要回答「有幾種挑選方式（每件最多一件）讓總價剛好是 T（T ≤ 10^4）」，只要數量，不必列出。哪種做法最合適？',
      options: ['動態規劃：用「前 i 件湊出總價 s 的方法數」逐步計算', '回溯列舉所有子集，加上「超過 T 就 break」的剪枝', '兩層巢狀迴圈檢查每一對商品', '貪心：每次挑最貴而且不超過剩餘金額的商品'],
      answer: 0, explanation: '只要數量、而且總價最多 10^4 種，可以用「前 i 件、總價 s」當狀態，只要約 100 × 10^4 = 10^6 次運算（A17、A18 會學到）。回溯即使剪枝，最壞情況仍可能接近 2^100 個子集，而且答案的個數本身就可能是天文數字，一個一個數不完；兩層迴圈只檢查「剛好兩件」的情況；貪心只會找出一種挑法（甚至找不到），不能計數。如果題目改成「n ≤ 15，列出每一種挑法」，回溯就是合適的選擇。',
    },
  ],
  exercises: [
    {
      id: 'e-distinct-combinations', title: '不重複的組合',
      statement: '給 n 個整數（可能重複、沒有排序），從中選出 k 個（不計順序，每個位置的數最多選一次），列出所有「不同」的組合：兩個組合若由小到大排好後完全相同，就只算一次。例如 [1, 2, 2] 選 2 個只有 `1 2` 與 `2 2` 兩種，`1 2` 不能出現兩次。每個組合內的數由小到大印出，所有組合依字典序（從第一個數開始比數值大小）由小到大排列，最後一行印出組合的個數。k = 0 時唯一的組合是空組合，印成 `(empty)`。只排序不去重會印出重複的組合；只去重不排序（或用字串排序，把 10 排在 9 前面）順序會錯。輸入不合法時只輸出一行 `Invalid`：n 不在 1～12、k 不在 0～n、數字的個數不是剛好 n 個，或有數的絕對值超過 1000。',
      inputFormat: '第一行兩個整數 n、k。第二行 n 個整數。數字之間以空白或換行分隔。',
      outputFormat: '每個組合一行，組合內的數以一個空白分隔（k = 0 時印 `(empty)`）；最後一行是 `total` 加一個空白與組合的個數。輸入不合法時只輸出一行 `Invalid`。',
      constraints: ['1 ≤ n ≤ 12，0 ≤ k ≤ n（否則輸出 Invalid）', '每個數是 −1000～1000 的整數（否則輸出 Invalid）', '最多 C(12, 6) = 924 個組合'],
      samples: [{ kind: 'normal', input: '5 3\n3 1 2 4 2', output: '1 2 2\n1 2 3\n1 2 4\n1 3 4\n2 2 3\n2 2 4\n2 3 4\ntotal 7', note: '2 出現兩次：`1 2 3` 只算一次，但 `1 2 2` 可以用兩個不同位置的 2' }],
      tests: [
        { kind: 'normal', input: '5 3\n3 1 2 4 2', output: '1 2 2\n1 2 3\n1 2 4\n1 3 4\n2 2 3\n2 2 4\n2 3 4\ntotal 7', note: '範例' },
        { kind: 'normal', input: '4 2\n1 2 3 4', output: '1 2\n1 3\n1 4\n2 3\n2 4\n3 4\ntotal 6', note: '沒有重複：C(4, 2) = 6' },
        { kind: 'normal', input: '6 2\n10 9 -1 -10 9 0', output: '-10 -1\n-10 0\n-10 9\n-10 10\n-1 0\n-1 9\n-1 10\n0 9\n0 10\n9 9\n9 10\ntotal 11', note: '負數、重複的 9，以及 9 與 10：用字串排序會把 10 排在 9 前面、-1 排在 -10 前面' },
        { kind: 'normal', input: '7 4\n5 5 1 5 1 3 5', output: '1 1 3 5\n1 1 5 5\n1 3 5 5\n1 5 5 5\n3 5 5 5\n5 5 5 5\ntotal 6', note: '大量重複：不去重會印出 C(7, 4) = 35 行' },
        { kind: 'normal', input: '12 6\n3 1 3 2 1 3 2 1 3 2 1 2', output: '1 1 1 1 2 2\n1 1 1 1 2 3\n1 1 1 1 3 3\n1 1 1 2 2 2\n1 1 1 2 2 3\n1 1 1 2 3 3\n1 1 1 3 3 3\n1 1 2 2 2 2\n1 1 2 2 2 3\n1 1 2 2 3 3\n1 1 2 3 3 3\n1 1 3 3 3 3\n1 2 2 2 2 3\n1 2 2 2 3 3\n1 2 2 3 3 3\n1 2 3 3 3 3\n2 2 2 2 3 3\n2 2 2 3 3 3\n2 2 3 3 3 3\ntotal 19', note: '三種值各 4 個：924 種選法只有 19 種不同的組合' },
        { kind: 'edge', input: '3 0\n1 2 3', output: '(empty)\ntotal 1', note: 'k = 0：只有空組合' },
        { kind: 'edge', input: '4 4\n4 3 2 1', output: '1 2 3 4\ntotal 1', note: 'k = n：全選，而且要排序' },
        { kind: 'edge', input: '1 1\n-7', output: '-7\ntotal 1', note: 'n = 1' },
        { kind: 'edge', input: '1 0\n5', output: '(empty)\ntotal 1', note: 'n = 1、k = 0' },
        { kind: 'edge', input: '12 6\n5 5 5 5 5 5 5 5 5 5 5 5', output: '5 5 5 5 5 5\ntotal 1', note: '全部相同：924 種選法只有 1 種組合' },
        { kind: 'edge', input: '6 3\n-1000 1000 0 -1000 1000 999', output: '-1000 -1000 0\n-1000 -1000 999\n-1000 -1000 1000\n-1000 0 999\n-1000 0 1000\n-1000 999 1000\n-1000 1000 1000\n0 999 1000\n0 1000 1000\n999 1000 1000\ntotal 10', note: '數值的上下限，以及重複的最小值、最大值' },
        { kind: 'edge', input: bigInput, output: bigOutput, note: '最大的輸出：12 個不同的數選 6 個，C(12, 6) = 924 個組合（預期輸出由位元枚舉產生）' },
        { kind: 'error', input: '5 6\n1 2 3 4 5', output: 'Invalid', note: 'k > n' },
        { kind: 'error', input: '3 -1\n1 2 3', output: 'Invalid', note: 'k < 0' },
        { kind: 'error', input: '13 2\n1 2 3 4 5 6 7 8 9 10 11 12 13', output: 'Invalid', note: 'n > 12' },
        { kind: 'error', input: '0 0', output: 'Invalid', note: 'n = 0' },
        { kind: 'error', input: '4 2\n1 2 3', output: 'Invalid', note: '數字少於 n 個' },
        { kind: 'error', input: '2 1\n1 2 3', output: 'Invalid', note: '數字多於 n 個' },
        { kind: 'error', input: '3 2\n1 1001 2', output: 'Invalid', note: '數值超出範圍' },
        { kind: 'error', input: '3', output: 'Invalid', note: '缺少 k' },
      ],
      hints: [
        '先把 n 個數由小到大排序：組合內自然由小到大，依序嘗試候選時組合也會依字典序產生，不需要事後排序。',
        '用組合的模板：`dfs(start)` 在 `len(path) == k` 時記錄並 return；否則 `for i in range(start, n)`，選 a[i] 後遞迴 `dfs(i + 1)`，回來後 `pop()`。',
        '去重：同一層裡，`i > start and a[i] == a[i - 1]` 的候選會產生和前一個完全相同的子樹，跳過它。注意是 `i > start` 不是 `i > 0`，否則 `2 2` 這種組合會消失。',
        '剪枝（可選）：還需要 `k - len(path)` 個，但只剩 `n - i` 個數時，後面不可能湊滿，可以 `break`。',
        '數字的個數要剛好 n 個：先讀進所有數字再檢查，多或少都是 Invalid。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <vector>

int n, k;
std::vector<long long> a, path;
std::vector<std::string> out;

void dfs(int start) {
    if (static_cast<int>(path.size()) == k) {
        std::string line;
        for (std::size_t j = 0; j < path.size(); ++j) line += (j ? " " : "") + std::to_string(path[j]);
        out.push_back(path.empty() ? "(empty)" : line);
        return;
    }
    for (int i = start; i < n; ++i) {
        if (n - i < k - static_cast<int>(path.size())) break;  // 剩下的數不夠湊滿 k 個
        if (i > start && a[i] == a[i - 1]) continue;            // 同一層跳過相同的值
        path.push_back(a[i]);                                   // 選擇
        dfs(i + 1);                                             // 遞迴
        path.pop_back();                                        // 撤銷
    }
}

int main() {
    std::vector<long long> t;  // 先讀進所有數字，才能檢查個數
    long long v;
    while (std::cin >> v) t.push_back(v);
    long long total = static_cast<long long>(t.size());
    if (total < 2 || t[0] < 1 || t[0] > 12 || t[1] < 0 || t[1] > t[0] || total != t[0] + 2) {
        std::cout << "Invalid\n";
        return 0;
    }
    n = static_cast<int>(t[0]);
    k = static_cast<int>(t[1]);
    a.assign(t.begin() + 2, t.end());
    for (long long x : a) {
        if (x < -1000 || x > 1000) {
            std::cout << "Invalid\n";
            return 0;
        }
    }
    std::sort(a.begin(), a.end());
    dfs(0);
    for (const std::string& line : out) std::cout << line << "\n";
    std::cout << "total " << out.size() << "\n";
    return 0;
}`,
        Python: code`import sys


def main():
    data = sys.stdin.read().split()
    if len(data) < 2:
        print("Invalid")
        return
    n, k = int(data[0]), int(data[1])
    if not 1 <= n <= 12 or not 0 <= k <= n or len(data) != n + 2:
        print("Invalid")
        return
    a = sorted(map(int, data[2:]))
    if any(abs(x) > 1000 for x in a):
        print("Invalid")
        return
    out, path = [], []

    def dfs(start):
        if len(path) == k:
            out.append(" ".join(map(str, path)) if path else "(empty)")
            return
        for i in range(start, n):
            if n - i < k - len(path):  # 剩下的數不夠湊滿 k 個
                break
            if i > start and a[i] == a[i - 1]:  # 同一層跳過相同的值
                continue
            path.append(a[i])  # 選擇
            dfs(i + 1)  # 遞迴
            path.pop()  # 撤銷

    dfs(0)
    out.append(f"total {len(out)}")
    print("\n".join(out))


main()`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.StringTokenizer;

public class Main {
    static int n, k, depth = 0, total = 0;
    static long[] a, path;  // path[0..depth-1] 是目前的選擇；撤銷就是 depth--
    static StringBuilder out = new StringBuilder();

    static void dfs(int start) {
        if (depth == k) {
            total++;
            if (k == 0) out.append("(empty)");
            for (int j = 0; j < k; j++) out.append(j > 0 ? " " : "").append(path[j]);
            out.append('\n');
            return;
        }
        for (int i = start; i < n; i++) {
            if (n - i < k - depth) break;                 // 剩下的數不夠湊滿 k 個
            if (i > start && a[i] == a[i - 1]) continue;  // 同一層跳過相同的值
            path[depth++] = a[i];                         // 選擇
            dfs(i + 1);                                   // 遞迴
            depth--;                                      // 撤銷
        }
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        List<Long> t = new ArrayList<>();  // 先讀進所有數字，才能檢查個數
        String line;
        while ((line = in.readLine()) != null) {
            StringTokenizer st = new StringTokenizer(line);
            while (st.hasMoreTokens()) t.add(Long.parseLong(st.nextToken()));
        }
        if (t.size() < 2 || t.get(0) < 1 || t.get(0) > 12 || t.get(1) < 0 || t.get(1) > t.get(0) || t.size() != t.get(0) + 2) {
            System.out.println("Invalid");
            return;
        }
        n = (int) (long) t.get(0);
        k = (int) (long) t.get(1);
        a = new long[n];
        path = new long[n];
        for (int i = 0; i < n; i++) {
            a[i] = t.get(i + 2);
            if (a[i] < -1000 || a[i] > 1000) {
                System.out.println("Invalid");
                return;
            }
        }
        Arrays.sort(a);
        dfs(0);
        out.append("total ").append(total);
        System.out.println(out);
    }
}`,
        JavaScript: code`const t = require("fs").readFileSync(0, "utf8").split(/\s+/).filter(s => s !== "").map(Number);

function main() {
    // 先讀進所有數字，才能檢查個數
    if (t.length < 2 || t[0] < 1 || t[0] > 12 || t[1] < 0 || t[1] > t[0] || t.length !== t[0] + 2) {
        return ["Invalid"];
    }
    const n = t[0], k = t[1];
    const a = t.slice(2);
    if (a.some(x => Math.abs(x) > 1000)) return ["Invalid"];
    a.sort((x, y) => x - y);  // 數值排序（預設的 sort 會依字串排序）
    const out = [], path = [];

    function dfs(start) {
        if (path.length === k) {
            out.push(path.length > 0 ? path.join(" ") : "(empty)");
            return;
        }
        for (let i = start; i < n; i++) {
            if (n - i < k - path.length) break;            // 剩下的數不夠湊滿 k 個
            if (i > start && a[i] === a[i - 1]) continue;  // 同一層跳過相同的值
            path.push(a[i]);                               // 選擇
            dfs(i + 1);                                    // 遞迴
            path.pop();                                    // 撤銷
        }
    }

    dfs(0);
    out.push("total " + out.length);
    return out;
}

console.log(main().join("\n"));`,
      },
      judge: 'none',
    },
  ],
};
