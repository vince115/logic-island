import type { LessonContent } from '../schema';

const code = String.raw;

/*
 * A19 APCS 題型分析與解題策略. Every example and the reference solutions run in tests/curriculum-code.test.ts. The
 * small tests' expected outputs were produced by an independent brute-force Python reference (O(n²) streak search,
 * O(n·k) window sums, a dictionary of hours) with the same input checks. The two large tests below compute theirs
 * here with `statsReference`, a separate TypeScript implementation; both were also cross-checked outside the repo
 * (the first against the brute force, the second against a closed form).
 */

/** The exercise's three statistics, straight from the definition (records sorted by time, ties in input order). */
function statsReference(t: number[], v: number[], k: number): string {
  const order = t.map((_, i) => i).sort((a, b) => t[a] - t[b] || a - b);
  const ts = order.map(i => t[i]);
  const vs = order.map(i => v[i]);
  let streak = 1;
  for (let i = 1, run = 1; i < vs.length; i++) {
    run = vs[i] > vs[i - 1] ? run + 1 : 1;
    streak = Math.max(streak, run);
  }
  const count = new Map<number, number>();
  for (const x of ts) count.set(Math.floor(x / 60), (count.get(Math.floor(x / 60)) ?? 0) + 1);
  const hours = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([h, c]) => `${h}:${c}`).join(' ');
  // Window sums stay below 2 × 10^14 < 2^53, so plain numbers are exact.
  let window = 0, start = 0;
  for (let i = 0; i < k; i++) window += vs[i];
  let best = window;
  for (let i = k; i < vs.length; i++) {
    window += vs[i] - vs[i - k];
    if (window > best) { best = window; start = i - k + 1; }
  }
  return `Streak ${streak}\nHours ${hours}\nWindow ${best} start ${ts[start]}`;
}

const BIG_N = 200_000;
/** Large test 1: k = n, every time repeated 3–4 times (input order decides ties), sums near 2 × 10^14. */
const big1T = Array.from({ length: BIG_N }, (_, i) => ((i * 7919) % BIG_N) % 60_000);
const big1V = Array.from({ length: BIG_N }, (_, i) => 1_000_000_000 - (i % 3));
const big1Input = `${BIG_N} ${BIG_N}\n${big1T.map((x, i) => `${x} ${big1V[i]}`).join('\n')}`;
const big1Output = statsReference(big1T, big1V, BIG_N);
/** Large test 2: records arrive latest first; in time order the values strictly increase, so the streak is n. */
const BIG2_K = 1000;
const big2T = Array.from({ length: BIG_N }, (_, i) => BIG_N - 1 - i);
const big2V = big2T.map(j => 10_000 * j - 1_000_000_000);
const big2Input = `${BIG_N} ${BIG2_K}\n${big2T.map((x, i) => `${x} ${big2V[i]}`).join('\n')}`;
const big2Output = statsReference(big2T, big2V, BIG2_K);

export const A19: LessonContent = {
  lessonId: 'A19',
  motivation: '學完搜尋、排序、雙指標、前綴和、貪心、圖論與動態規劃之後，真正的難題變成：看到一題，要用哪一個？寫完之後，怎麼知道它是對的？APCS（大學程式設計先修檢測）考的正是這兩種能力：觀念題要你讀懂別人的程式、一步步追蹤出結果；實作題要你從一段文字敘述出發，寫出能通過各種測資的完整程式。這一課不教新的演算法，而是把整個課程串成一套可以重複使用的流程：用追蹤表讀程式、從輸入輸出格式與資料範圍推出時間預算、依題目特徵挑選演算法家族、把程式拆成能分別測試的步驟、用邊界清單與暴力解對拍找出錯誤，以及在考試時間內安排先後與檢查。它的限制也要說清楚：流程只能幫你少犯錯，不能取代對每個演算法本身的理解；資料範圍對應的複雜度是粗略的經驗值；本課所有題目都是為本課自製的練習，不是歷屆試題，也不涉及官方的題號、配分或考試規則（以當次官方公告為準）。',
  sections: [
    {
      id: 'two-kinds', title: '兩種題型，一套解題流程',
      blocks: [
        { type: 'p', text: '從能力的角度，題目可以分成兩類。觀念題給你一段程式碼，問你它的輸出、某個變數最後的值、迴圈跑幾次，或哪一行有錯；你不必寫程式，但要能「當一台很仔細的電腦」。實作題給你一段情境敘述、輸入格式、輸出格式、資料範圍與範例，你要寫出完整程式，從標準輸入讀資料、把答案寫到標準輸出，由多組測資檢查。' },
        { type: 'table', head: ['題型', '你要做的事', '主要能力', '最相關的課'], rows: [
          ['觀念題', '追蹤程式、預測輸出、找出錯誤', '逐行執行、辨認模式、注意語言細節', 'F04、F06～F09、F11、F14、F18、A01'],
          ['實作題', '讀題、選方法、寫程式、自己測試', '題型辨識、複雜度估計、拆解、除錯', 'A01～A18、D19、F17'],
        ] },
        { type: 'p', text: '兩者共用同一套流程：讀題與輸入輸出 → 估計複雜度 → 選演算法 → 拆步驟實作 → 測試與除錯 → 檢查邊界。本課的視覺化把這六個階段依序展開，每個階段都標出它用到的課程。觀念題主要用到第一、五、六階段（讀懂、追蹤、找邊界），實作題六個階段都會用到。' },
        { type: 'callout', tone: 'note', title: '本課的練習都是自製的', text: '本課的範例、測驗與練習題都是為這一課設計的練習，不是歷屆試題，也不代表官方的題型比例。考試的時間、題數、作答環境與計分方式，請以當次官方公告為準；這裡只討論可以練習、可以累積的解題能力。' },
      ],
    },
    {
      id: 'trace-tables', title: '觀念題：用追蹤表讀程式',
      blocks: [
        { type: 'p', text: '追蹤表（trace table）是一張「每一輪結束後，每個變數的值」的表：每個會改變的變數一欄，每一輪（或每一行重要的指派）一列，最後一欄寫輸出。做法是：先把初始值寫成第一列；每一輪先檢查迴圈條件，成立才往下做，並依程式的順序更新變數（順序很重要：`r = r * 10 + d` 用的是這一輪剛算出的 d）；條件不成立時那一列就是終點。不要跳步，也不要「看起來像在算總和」就直接套公式。' },
        { type: 'p', text: '下面的範例把一個數字反轉（`1203` → `3021`），而且程式自己把追蹤表印出來，你可以先手寫一份再對照。注意第 2 輪拆出的是 0：r 從 3 變成 30，0 沒有消失。' },
        { type: 'example', id: 'trace-table' },
        { type: 'p', text: '這個例子藏著兩個常見陷阱。第一，`n = n / 10` 在 C++ 與 Java 中，兩個 `int` 相除是整數除法，小數直接捨去；Python 的 `/` 一定得到浮點數（`1203 / 10` 是 `120.3`），要用 `//`。第二，如果輸入是 `1200`，反轉後是 `21`：前導零不會出現在整數裡，題目若要求輸出 `0021`，就得用字串處理（D03）。' },
        { type: 'p', text: '追蹤之前先辨認模式，可以少算很多步：累加（`s += …`）、計數（`if … c++`）、找最大最小（`if (x > best) best = x`）、交換（需要暫存變數）、拆數位（`% 10` 與 `/ 10`）、每輪減半（`n /= 2`，約 log₂ n 輪，A01、A04）、巢狀迴圈（內層次數可能依賴外層，F09），以及遞迴（畫出呼叫樹或呼叫堆疊，F18、A11）。辨認出模式之後，仍要用追蹤表驗證最前面兩輪與最後一輪，因為錯誤通常發生在邊界。' },
        { type: 'table', head: ['陷阱', '例子', '三種語言的行為', '複習'], rows: [
          ['整數除法與負數', '`-7 / 2`、`-7 % 2`', 'C++、Java 往 0 截斷：`-3` 與 `-1`；Python `-7 // 2` 是 `-4`、`-7 % 2` 是 `1`', 'F04'],
          ['運算順序', '`a + b / 2`、`-2 ** 2`', '先乘除後加減：`a + b / 2` 不是平均；Python 的 `-2 ** 2` 是 `-4`（次方先算）', 'F04'],
          ['短路求值', '`b != 0 && a / b > 1`', '`&&`、`||`（Python `and`、`or`）左邊已決定結果就不算右邊；Java 的 `&`、`|` 用在 boolean 時兩邊都算', 'F06'],
          ['差一錯誤', '`i < n` 與 `i <= n`、`range(1, n)`', '多跑或少跑一輪；檢查第一輪與最後一輪的索引', 'F07、F08'],
          ['陣列別名', '`b = a` 之後改 `b[0]`', 'C++ 的 `std::vector` 指定會複製；Python 的 list 與 Java 的陣列是同一份，`a` 跟著變', 'F11'],
          ['參數傳遞', '函式裡修改參數', 'C++ 的 `int&` 會改到呼叫者；Java、Python 改參數本身不影響呼叫者，但改陣列或 list 的內容會', 'F14'],
          ['整數溢位', '很多個 10⁹ 相加', 'C++、Java 的 `int` 只到 2³¹ − 1（約 2.1 × 10⁹）；Python 的整數不會溢位', 'F02'],
        ] },
        { type: 'callout', tone: 'warning', title: '別用「看起來」猜輸出', text: '觀念題最常見的失分方式，是看出「這段在算總和」就直接寫答案，卻漏了條件第一次不成立的那一輪、整數除法捨去的小數，或短路時沒有執行的右半邊。每一輪都寫下來，尤其是條件剛好改變的那一輪；選項裡通常就放著「差一輪」與「忘了捨去」的答案。' },
      ],
    },
    {
      id: 'implementation', title: '實作題：讀題、資料範圍與選演算法',
      blocks: [
        { type: 'p', text: '讀實作題時，依序找出四樣東西，並各寫一行筆記：' },
        { type: 'list', ordered: true, items: [
          '輸入格式：第一行是什麼、共幾行、以空白還是換行分隔、資料是否保證有序、有沒有多筆測資。',
          '輸出格式：每個答案一行還是一行多個、分隔用一個空白、大小寫、找不到時輸出什麼（例如 `-1` 或 `Invalid`）。',
          '資料範圍：n、q 的上限決定時間預算；數值的上限決定型別（總和可能超過 2³¹ − 1 就用 `long long`／`long`）。',
          '範例：用你對題目的理解手算一次範例，答案對得上才開始寫程式；對不上，代表題意讀錯了。',
        ] },
        { type: 'p', text: '把資料範圍換成時間預算，用 A01 的粗略經驗值：一秒大約 10⁸ 次簡單運算。這不是保證：語言（Python 通常慢很多）、評測機器與輸入輸出量都會讓實際速度差好幾倍，但足以排除明顯不可行的做法。' },
        { type: 'table', head: ['n 的上限（約）', '通常可行的複雜度', '常見做法'], rows: [
          ['≤ 10', 'O(n!)', '列舉所有排列（A12）'],
          ['≤ 20', 'O(2ⁿ)、O(n · 2ⁿ)', '列舉子集、回溯加剪枝（A12）'],
          ['≤ 500', 'O(n³)', '三層迴圈、區間型 DP'],
          ['≤ 5000', 'O(n²)', '兩層迴圈、二維 DP（A17）'],
          ['≤ 2 × 10⁵ ～ 10⁶', 'O(n log n)、O(n)', '排序、二分搜尋、雙指標、滑動視窗、前綴和、BFS／DFS'],
          ['≥ 10⁹', 'O(log n)、O(1)', '公式、對答案二分搜（A04）、快速冪（A11）'],
        ] },
        { type: 'p', text: '有好幾個參數時要一起代入：n 個數、q 次查詢，每次掃一遍是 O(n · q)，n = q = 2 × 10⁵ 時是 4 × 10¹⁰，不可行；先做前綴和（A10）再每次 O(1)，總共 O(n + q)。接著依題目特徵挑演算法家族：' },
        { type: 'table', head: ['題目的特徵', '先想到', '課程'], rows: [
          ['照規則一步步更新狀態、格子上移動', '模擬', 'A02'],
          ['在有序資料中找位置、計數；答案有單調性', '二分搜尋、lower bound、對答案二分', 'A03、A04'],
          ['要依某個規則排序，或排序後問題變簡單', '函式庫排序與比較規則', 'A05～A07'],
          ['連續區間、配對、區間和', '雙指標、滑動視窗、前綴和與差分', 'A08～A10'],
          ['要列出所有選法，而且 n 很小', '遞迴、回溯、剪枝', 'A11、A12'],
          ['每一步選當下最好，而且能說明不吃虧', '貪心（一定要找反例檢查）', 'A13'],
          ['無權圖或格子的最少步數；連通塊', 'BFS；DFS 或並查集', 'A14、A15、D18'],
          ['正權重的最短路徑', 'Dijkstra（優先佇列）', 'A16'],
          ['求最佳值，子問題會重複出現', '動態規劃、背包', 'A17、A18'],
        ] },
        { type: 'callout', tone: 'warning', title: '貪心最容易「看起來對」', text: '貪心規則常常能通過範例，卻在別的資料上答錯。採用貪心之前，先試著找反例（A13 的找零：面額 1、3、4 湊 6，貪心拿 4 + 1 + 1 共 3 枚，最佳是 3 + 3 共 2 枚），或用下一節的暴力解對拍；說不出交換論證、又找不到反例時，至少要用隨機小測資驗證。' },
        { type: 'p', text: '資料量大時，讀入本身也可能太慢。下面的範例讀入 n 個整數，輸出個數、總和、最小值、最大值與相異值個數。C++ 關掉與 C stdio 的同步並解除 `cin` 與 `cout` 的綁定；Python 一次讀完整個輸入再 `split`，比逐行 `input()` 快得多；Java 用 `BufferedReader` 配 `StringTokenizer`，比 `Scanner` 快得多。`StreamTokenizer` 雖然也快，但它把數字讀成 `double`，超過 2⁵³ 的整數會失去精度。總和用 64 位元整數：範例中四個 10⁹ 減一個 10⁹ 已經是 3 × 10⁹，超過 `int` 的上限。' },
        { type: 'example', id: 'fast-io' },
      ],
    },
    {
      id: 'decompose-test', title: '拆成可驗證的步驟，再用邊界清單與對拍測試',
      blocks: [
        { type: 'p', text: '一支實作題程式通常可以拆成「讀入與檢查 → 整理資料（排序、建表、建圖）→ 計算每一個要求 → 依格式輸出」。每完成一塊就單獨測一次：讀入後先把資料印出來看是否正確，排序後再印一次，計算完一個要求再接下一個。錯誤被限制在剛寫的那一小塊裡，比整支寫完才發現答案不對好找得多。本課的練習題就是這樣：先排序，再分別算三種統計，每一種都能用小測資單獨檢查。' },
        { type: 'p', text: '每一題都拿下面這份邊界清單逐項問自己「我的程式在這裡會怎樣」：' },
        { type: 'list', items: [
          '最小：n = 1、k = 1、k = n、空字串或空集合（題目允許時）；迴圈一次都不跑時，答案的初始值對嗎？',
          '最大：n 取上限時夠快嗎？數值取上限時，總和、乘積或前綴和會溢位嗎？',
          '重複與同分：嚴格遞增還是非嚴格？同分時題目要求取最早、最小還是任一個？排序需要穩定嗎？',
          '負數與零：最大值的初始值寫成 0，全部是負數時就錯；除數或模數會是 0 嗎？',
          '特殊排列：已排序、反序、全部相同。',
          '不可到達：圖或格子中走不到的點（BFS 的距離要保持 −1，A14），找不到時的輸出。',
          '格式：多餘的空白與空行、最後一行有沒有換行、不合法的輸入要輸出什麼。',
        ] },
        { type: 'p', text: '自己設計測資時，每一組都要對準一個可能的錯誤，並事先寫好正確答案：小測資用手算或暴力解，大測資用程式產生。最有效的工具是對拍（stress testing）：寫一個慢但明顯正確的暴力解，用固定種子的亂數產生大量小測資，比較兩個程式的輸出。下面的範例比較「最大連續子陣列和」的 O(n²) 暴力解與 O(n) 的前綴和解（目前的前綴和減去之前最小的前綴和，A10），再加上一個「best 從 0 開始」的錯誤版本。' },
        { type: 'example', id: 'brute-vs-fast' },
        { type: 'p', text: '正確的快速解 500 組全對；錯誤版本錯了 59 組，而且第一個反例就是最小的失敗輸入：只有一個數 `-1`，正確答案是 −1，錯誤版本印出 0。三種語言用同一個線性同餘亂數產生器（LCG），所以產生的測資、錯誤次數與反例完全相同；種子固定，任何人重跑都會得到同樣的結果，找到錯誤後也能重現。' },
        { type: 'callout', tone: 'tip', title: '對拍的小技巧', text: '測資要小（n 只到 8 左右）、數值範圍要窄（−10～10），重複、同分與負數才會常常出現，反例也短到能手算。暴力解要寫得越直接越好，不要和快速解共用同一段可疑的程式碼；兩者都錯在同一個地方時，對拍是看不出來的。' },
      ],
    },
    {
      id: 'debug-exam', title: '除錯策略與考試中的時間分配',
      blocks: [
        { type: 'p', text: '程式答錯時，不要憑感覺亂改。依序試這幾招：一，印出中間狀態（陣列、指標、視窗和），而且印到標準錯誤（stderr），不會混進答案（F17）；二，把失敗的輸入縮小：刪掉一半資料，還失敗就繼續刪，直到剩下幾個數字，原因通常就一目了然；三，和暴力解對拍，讓電腦替你找反例；四，用 `assert` 寫下你相信成立的條件（例如「視窗長度一定是 k」），哪裡被打破就是錯誤的位置；五，重新讀一次題目，確認同分規則與輸出格式。' },
        { type: 'table', head: ['症狀', '常見原因', '先檢查'], rows: [
          ['小測資對、大測資錯', '整數溢位', '總和、乘積、前綴和的型別是不是 64 位元'],
          ['大測資太慢（逾時）', '複雜度超出預算、輸入輸出太慢', '把 n 的上限代入複雜度；C++ 關同步、Java 用 `BufferedReader`、Python 一次讀完'],
          ['執行期錯誤', '陣列越界、遞迴太深、除以 0', '索引的範圍；Python 遞迴上限約 1000，深的 DFS 改用堆疊（A15）'],
          ['只有少數測資錯', '邊界與同分', '邊界清單逐項檢查，再對拍'],
          ['答案看起來對卻被判錯', '輸出格式', '空白、換行、大小寫，以及有沒有忘了刪的除錯輸出'],
        ] },
        { type: 'callout', tone: 'warning', title: '交出前刪掉除錯輸出', text: '評測只比對標準輸出，多印一行 `i = 3` 就整題答錯。除錯訊息一律印到標準錯誤（C++ `std::cerr`、Python `print(..., file=sys.stderr)`、Java `System.err`），或在交出前刪掉；同時確認沒有留下「請輸入 n：」之類的提示文字。' },
        { type: 'p', text: '考試中的時間分配沒有標準答案，以下是一般性的建議：開始時先快速瀏覽全部題目，估計每題的難度與需要的演算法；先做最有把握的題目，確保會的都拿到；替每一題訂一個停損時間，卡住超過就先跳過，最後再回來。觀念題在草稿上畫追蹤表，算完一題就核對一次選項；實作題先寫出正確的簡單版本，通過範例後再考慮改進——簡單版本同時也是你對拍用的暴力解。最後留一段時間做檢查。' },
        { type: 'list', items: [
          '範例測資都通過，並且自己加測了 n = 1、最大值、同分、負數。',
          '型別：可能超過 2³¹ − 1 的值都用 `long long`／`long`。',
          '陣列大小與索引：0-based 或 1-based 一致，沒有越界。',
          '輸出格式與題目逐字相同，沒有除錯輸出與提示文字。',
          '複雜度：把資料範圍上限代入，確認在預算內。',
        ] },
      ],
    },
  ],
  examples: [
    {
      id: 'trace-table', title: '追蹤表：反轉 1203 的每一輪', description: '每一輪先取出個位數 d，把它接到 r 的尾端，再用整數除法去掉 n 的個位數，並印出這一輪結束時的 n、d、r。n 變成 0 時迴圈結束。',
      output: 'round n d r\nstart 1203 - 0\n1 120 3 3\n2 12 0 30\n3 1 2 302\n4 0 1 3021',
      code: {
        'C++': code`#include <iostream>

int main() {
    int n = 1203, r = 0, round = 0;
    std::cout << "round n d r\n";
    std::cout << "start " << n << " - " << r << "\n";
    while (n > 0) {
        int d = n % 10;  // 取出個位數
        r = r * 10 + d;  // 把 d 接到 r 的尾端
        n = n / 10;      // 整數除法：去掉個位數
        ++round;
        std::cout << round << " " << n << " " << d << " " << r << "\n";
    }
    return 0;
}`,
        Python: code`n, r, rnd = 1203, 0, 0
print("round n d r")
print(f"start {n} - {r}")
while n > 0:
    d = n % 10      # 取出個位數
    r = r * 10 + d  # 把 d 接到 r 的尾端
    n = n // 10     # 用 //；寫成 n / 10 會變成小數 120.3
    rnd += 1
    print(rnd, n, d, r)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int n = 1203, r = 0, round = 0;
        System.out.println("round n d r");
        System.out.println("start " + n + " - " + r);
        while (n > 0) {
            int d = n % 10;  // 取出個位數
            r = r * 10 + d;  // 把 d 接到 r 的尾端
            n = n / 10;      // 兩個 int 相除是整數除法：去掉個位數
            ++round;
            System.out.println(round + " " + n + " " + d + " " + r);
        }
    }
}`,
      },
    },
    {
      id: 'fast-io', title: '快速讀入：n 個整數的總和、最小、最大與相異值個數', description: '第一個數是 n，接著 n 個整數（可能分散在好幾行）。總和用 64 位元整數；排序後相同的值相鄰，數「和前一個不同」的位置就是相異值個數。',
      stdin: '8\n1000000000 -5 1000000000 7\n1000000000 1000000000 7 -1000000000',
      output: 'n=8 sum=3000000009 min=-1000000000 max=1000000000 distinct=4',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);  // 不和 C 的 stdio 同步，cin／cout 快很多
    std::cin.tie(nullptr);             // 讀入前不必先清空 cout
    int n;
    std::cin >> n;
    std::vector<long long> a(n);
    long long sum = 0;  // n 個 ±10⁹ 的和可能超過 2³¹ − 1，用 long long
    for (long long& x : a) {
        std::cin >> x;
        sum += x;
    }
    std::sort(a.begin(), a.end());
    int distinct = 0;
    for (int i = 0; i < n; ++i)
        if (i == 0 || a[i] != a[i - 1]) ++distinct;  // 排序後，相同的值會相鄰
    std::cout << "n=" << n << " sum=" << sum << " min=" << a[0] << " max=" << a[n - 1]
              << " distinct=" << distinct << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.buffer.read().split()  # 一次讀完、切成字詞，比逐行 input() 快很多
n = int(data[0])
a = sorted(map(int, data[1:1 + n]))
distinct = sum(1 for i in range(n) if i == 0 or a[i] != a[i - 1])  # 排序後，相同的值會相鄰
print(f"n={n} sum={sum(a)} min={a[0]} max={a[-1]} distinct={distinct}")`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.Arrays;
import java.util.StringTokenizer;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));  // 比 Scanner 快很多
        StringTokenizer st = new StringTokenizer("");
        long[] a = null;
        int n = -1, filled = 0;
        long sum = 0;  // n 個 ±10⁹ 的和可能超過 2³¹ − 1，用 long
        while (n < 0 || filled < n) {
            while (!st.hasMoreTokens()) st = new StringTokenizer(br.readLine());  // 數字可能分散在好幾行
            long x = Long.parseLong(st.nextToken());
            if (n < 0) {
                n = (int) x;
                a = new long[n];
            } else {
                a[filled++] = x;
                sum += x;
            }
        }
        Arrays.sort(a);
        int distinct = 0;
        for (int i = 0; i < n; ++i)
            if (i == 0 || a[i] != a[i - 1]) ++distinct;  // 排序後，相同的值會相鄰
        System.out.println("n=" + n + " sum=" + sum + " min=" + a[0] + " max=" + a[n - 1] + " distinct=" + distinct);
    }
}`,
      },
    },
    {
      id: 'brute-vs-fast', title: '對拍：暴力解、快速解與一個錯誤版本', description: '用固定種子的線性同餘亂數產生 500 組長度 1～8、數值 −10～10 的陣列，比較最大連續子陣列和的 O(n²) 暴力解、O(n) 前綴和解，以及 best 從 0 開始的錯誤版本，印出錯誤次數與第一個反例。',
      output: 'fast vs brute: all match (500 tests)\nbuggy vs brute: 59 wrong, first: -1 -> buggy 0, brute -1',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <vector>

long long seed = 2026;
// 線性同餘亂數：三種語言算出同一串數；取高位元，低位元的週期太短。
int rnd(int k) {
    seed = (seed * 1103515245 + 12345) % 2147483648LL;
    return static_cast<int>((seed >> 16) % k);
}

// 暴力解 O(n²)：每個起點往右加，記下最大的和。
long long brute(const std::vector<int>& a) {
    long long best = a[0];
    for (std::size_t i = 0; i < a.size(); ++i) {
        long long s = 0;
        for (std::size_t j = i; j < a.size(); ++j) {
            s += a[j];
            best = std::max(best, s);
        }
    }
    return best;
}

// 快的解 O(n)：和 = 目前前綴和 − 之前最小的前綴和（A10）。zeroStart 模擬「best 從 0 開始」的錯誤。
long long fast(const std::vector<int>& a, bool zeroStart) {
    long long best = zeroStart ? 0 : a[0], prefix = 0, minPrefix = 0;
    for (int x : a) {
        prefix += x;
        best = std::max(best, prefix - minPrefix);
        minPrefix = std::min(minPrefix, prefix);
    }
    return best;
}

int main() {
    int wrongFast = 0, wrongBuggy = 0;
    std::vector<int> firstBad;
    for (int t = 0; t < 500; ++t) {
        std::vector<int> a(1 + rnd(8));
        for (int& x : a) x = rnd(21) - 10;  // −10..10
        long long b = brute(a);
        if (fast(a, false) != b) ++wrongFast;
        if (fast(a, true) != b && wrongBuggy++ == 0) firstBad = a;
    }
    std::cout << "fast vs brute: " << (wrongFast == 0 ? "all match" : "MISMATCH") << " (500 tests)\n";
    std::cout << "buggy vs brute: " << wrongBuggy << " wrong, first:";
    for (int x : firstBad) std::cout << " " << x;
    std::cout << " -> buggy " << fast(firstBad, true) << ", brute " << brute(firstBad) << "\n";
    return 0;
}`,
        Python: code`seed = 2026


def rnd(k):
    # 線性同餘亂數：三種語言算出同一串數；取高位元，低位元的週期太短。
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed >> 16) % k


def brute(a):
    # 暴力解 O(n²)：每個起點往右加，記下最大的和。
    best = a[0]
    for i in range(len(a)):
        s = 0
        for j in range(i, len(a)):
            s += a[j]
            best = max(best, s)
    return best


def fast(a, zero_start):
    # 快的解 O(n)：和 = 目前前綴和 − 之前最小的前綴和（A10）。zero_start 模擬「best 從 0 開始」的錯誤。
    best = 0 if zero_start else a[0]
    prefix = min_prefix = 0
    for x in a:
        prefix += x
        best = max(best, prefix - min_prefix)
        min_prefix = min(min_prefix, prefix)
    return best


wrong_fast = wrong_buggy = 0
first_bad = []
for _ in range(500):
    a = [0] * (1 + rnd(8))
    for i in range(len(a)):
        a[i] = rnd(21) - 10  # −10..10
    b = brute(a)
    if fast(a, False) != b:
        wrong_fast += 1
    if fast(a, True) != b:
        if wrong_buggy == 0:
            first_bad = a
        wrong_buggy += 1
print(f"fast vs brute: {'all match' if wrong_fast == 0 else 'MISMATCH'} (500 tests)")
print(f"buggy vs brute: {wrong_buggy} wrong, first: {' '.join(map(str, first_bad))}"
      f" -> buggy {fast(first_bad, True)}, brute {brute(first_bad)}")`,
        Java: code`public class Main {
    static long seed = 2026;

    // 線性同餘亂數：三種語言算出同一串數；取高位元，低位元的週期太短。
    static int rnd(int k) {
        seed = (seed * 1103515245L + 12345) % 2147483648L;
        return (int) ((seed >> 16) % k);
    }

    // 暴力解 O(n²)：每個起點往右加，記下最大的和。
    static long brute(int[] a) {
        long best = a[0];
        for (int i = 0; i < a.length; ++i) {
            long s = 0;
            for (int j = i; j < a.length; ++j) {
                s += a[j];
                best = Math.max(best, s);
            }
        }
        return best;
    }

    // 快的解 O(n)：和 = 目前前綴和 − 之前最小的前綴和（A10）。zeroStart 模擬「best 從 0 開始」的錯誤。
    static long fast(int[] a, boolean zeroStart) {
        long best = zeroStart ? 0 : a[0], prefix = 0, minPrefix = 0;
        for (int x : a) {
            prefix += x;
            best = Math.max(best, prefix - minPrefix);
            minPrefix = Math.min(minPrefix, prefix);
        }
        return best;
    }

    public static void main(String[] args) {
        int wrongFast = 0, wrongBuggy = 0;
        int[] firstBad = new int[0];
        for (int t = 0; t < 500; ++t) {
            int[] a = new int[1 + rnd(8)];
            for (int i = 0; i < a.length; ++i) a[i] = rnd(21) - 10;  // −10..10
            long b = brute(a);
            if (fast(a, false) != b) ++wrongFast;
            if (fast(a, true) != b && wrongBuggy++ == 0) firstBad = a;
        }
        System.out.println("fast vs brute: " + (wrongFast == 0 ? "all match" : "MISMATCH") + " (500 tests)");
        StringBuilder line = new StringBuilder("buggy vs brute: " + wrongBuggy + " wrong, first:");
        for (int x : firstBad) line.append(' ').append(x);
        line.append(" -> buggy ").append(fast(firstBad, true)).append(", brute ").append(brute(firstBad));
        System.out.println(line);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'challenge-stages', title: '解一道題的六個階段',
    stages: [
      { title: '讀題與輸入輸出', concepts: ['F03', 'F10', 'D03', 'A02'], goal: '寫下輸入格式、輸出格式、每一條規則與錯誤時的輸出，並用自己的理解手算範例。', detail: '找出第一行是什麼、共幾行、分隔方式、是否保證有序；輸出的空白、換行、大小寫與「找不到」的寫法。手算的範例答案對不上，代表題意讀錯，先別寫程式。觀念題則是先看清楚每個變數的初始值與迴圈的範圍。' },
      { title: '估計複雜度', concepts: ['F19', 'A01'], goal: '把 n、q 與數值的上限代入，得出時間預算與需要的整數型別。', detail: '以一秒約 10⁸ 次簡單運算粗估：n ≤ 5000 大致可以 O(n²)，n ≤ 2 × 10⁵ 要 O(n log n) 或 O(n)。多個參數要一起代入（n · q）。總和可能超過 2³¹ − 1 就用 long long／long；Python 沒有溢位，但通常比較慢。' },
      { title: '選演算法', concepts: ['A04', 'A05', 'A09', 'A10', 'A12', 'A13', 'A14', 'A16', 'A17'], goal: '依題目特徵挑出符合預算的演算法家族，並說得出它為什麼對。', detail: '連續區間想雙指標、視窗或前綴和；有序或單調想二分；最少步數想 BFS，正權最短路徑想 Dijkstra；求最佳值且子問題重複想 DP；n 很小可以列舉。貪心一定要先找反例或對拍。' },
      { title: '拆步驟實作', concepts: ['F13', 'F14', 'A02', 'A05'], goal: '把程式拆成讀入檢查、整理資料、逐項計算、依格式輸出，每一塊寫完就測。', detail: '每一塊寫成一個函式或一段有註解的程式；讀入後先印出來確認，排序後再印一次。輸出先累積在緩衝區最後一次印出，Java 用 BufferedReader 與 StringBuilder。' },
      { title: '測試與除錯', concepts: ['F17', 'A06', 'A13'], goal: '用對準錯誤的自製測資與暴力解對拍找出反例，再縮小到最小的失敗輸入。', detail: '固定種子產生大量小測資，數值範圍窄，重複與負數才會常出現。除錯訊息印到 stderr，失敗時刪減輸入直到只剩幾個數；用 assert 寫下相信成立的條件。' },
      { title: '檢查邊界', concepts: ['F02', 'F07', 'F11', 'A04', 'A15'], goal: '逐項檢查邊界清單：最小、最大、同分、負數、不可到達與輸出格式。', detail: 'n = 1、k = n、全部相同、全部負數、最大值相加會不會溢位、遞迴會不會太深、索引會不會差一。最後確認輸出與題目逐字相同，並刪掉除錯輸出。' },
    ],
  },
  quiz: [
    {
      id: 'q-trace', prompt: '這段 C++ 程式的輸出是什麼？（提示：畫一張 i、b、c 的追蹤表，注意短路求值與整數除法。）',
      code: { language: 'C++', text: code`int a = 7, b = 0, c = 0;
for (int i = 1; i <= 4; i++) {
    if (b != 0 && a / b >= 2) c += a / b;
    else c += a % i;
    b += i;
}
std::cout << c << " " << b << "\n";` },
      options: ['12 10', '11 10', '9 6', '程式在 i = 1 時除以 0 而當掉'],
      answer: 0, explanation: '追蹤：i = 1 時 b = 0，`b != 0` 為假，`&&` 短路不算 `a / b`，走 else：c += 7 % 1 = 0，b = 1。i = 2：7 / 1 = 7 ≥ 2，c = 7，b = 3。i = 3：7 / 3 = 2（整數除法）≥ 2，c = 9，b = 6。i = 4：7 / 6 = 1 < 2，走 else：c += 7 % 4 = 3，c = 12，b = 10。「11 10」是把 `>=` 看成 `>`（i = 3 時改加 7 % 3 = 1）；「9 6」是少跑最後一輪；短路求值保證第一輪不會除以 0。（已用 g++ 實際執行確認輸出 12 10。）',
    },
    {
      id: 'q-budget', prompt: '某題 n ≤ 2 × 10⁵，只有一組輸入。以「一秒約 10⁸ 次簡單運算」的粗略估計，下列哪一組複雜度都大致可行？',
      options: ['O(n²) 與 O(n log n)', 'O(n log n) 與 O(n)', 'O(2ⁿ) 與 O(n)', '只有 O(1) 可行'],
      answer: 1, explanation: 'n log₂ n ≈ 2 × 10⁵ × 18 ≈ 3.6 × 10⁶，n = 2 × 10⁵，都遠低於 10⁸。O(n²) 是 4 × 10¹⁰，大約超出 400 倍，所以第一個選項不行；O(2ⁿ) 在 n = 2 × 10⁵ 時是天文數字；「只有 O(1)」太悲觀，連讀入 n 個數都需要 O(n)。這只是粗估，常數與語言仍會影響實際時間。',
    },
    {
      id: 'q-family', prompt: '下列「題目描述 → 演算法」的配對，哪一個不恰當？',
      options: [
        '迷宮中每一步成本相同，求起點到終點的最少步數 → BFS',
        '道路長度各不相同（都是正數），求兩城市間的最短距離 → BFS',
        '已排序的陣列，回答 10⁵ 次「有幾個數 ≤ x」 → 二分搜尋（upper bound）',
        '求長度恰好為 k 的連續區間的最大和 → 固定長度滑動視窗',
      ],
      answer: 1, explanation: 'BFS 的「第一次發現就是最短」只在每條邊成本相同時成立（A14）；邊有不同的正權重時，經過較多條短邊可能比一條長邊更近，要用 Dijkstra（A16）。其他三個都恰當：無權最少步數正是 BFS；有序資料上「≤ x 的個數」就是 upper bound 的位置，每次 O(log n)（A04）；長度固定的區間和用滑動視窗，加入一個、移出一個，O(n)（A09）。',
    },
    {
      id: 'q-overflow', prompt: '題目：讀入 n 個整數（1 ≤ n ≤ 2 × 10⁵，|x| ≤ 10⁹），輸出它們的總和。下面的 C++ 程式哪裡有問題？',
      code: { language: 'C++', text: code`int n;
std::cin >> n;
int total = 0;
for (int i = 0; i < n; i++) {
    int x;
    std::cin >> x;
    total += x;
}
std::cout << total << "\n";` },
      options: [
        '`total` 是 `int`，總和最多約 2 × 10¹⁴，遠超過 2³¹ − 1，會溢位；應改成 `long long`',
        '迴圈應該從 `i = 1` 開始，否則會多讀一個數',
        '`x` 在迴圈裡宣告，每輪都會被清成 0，讀不到值',
        '要先把所有數排序才能加總',
      ],
      answer: 0, explanation: '2 × 10⁵ 個 10⁹ 的和是 2 × 10¹⁴，`int` 最多約 2.1 × 10⁹。C++ 有號整數溢位是未定義行為；在常見的環境下用 `-fwrapv` 實際執行，2 × 10⁵ 個 10⁹ 相加印出 552894464 這種錯誤值。Java 規定 `int` 溢位時繞回（wrap around），同樣得到 552894464；Python 的整數則不會溢位。`i` 從 0 到 n − 1 恰好 n 輪，沒有多讀；`x` 每輪都先讀入再使用；加總與順序無關，不必排序。',
    },
    {
      id: 'q-expose', prompt: '下面的 Python 函式想求「長度 k 的連續區間的最大和」，但有錯。哪一組測資能讓它的輸出和正確答案不同？',
      code: { language: 'Python', text: code`def best_window(a, k):
    n = len(a)
    best = cur = sum(a[:k])
    for i in range(k, n - 1):
        cur += a[i] - a[i - k]
        best = max(best, cur)
    return best` },
      options: ['a = [5, 1, 1, 1], k = 2', 'a = [1, 1, 1, 9], k = 2', 'a = [3], k = 1', 'a = [2, 2, 2, 2], k = 2'],
      answer: 1, explanation: '`range(k, n - 1)` 少了 i = n − 1，最後一個視窗從來沒被算到（差一錯誤，應為 `range(k, n)`）。[1, 1, 1, 9] 的最大和是最後一個視窗 1 + 9 = 10，錯誤程式卻回傳 2。[5, 1, 1, 1] 的最大值在第一個視窗（6），兩者都對；[3] 只有一個視窗，迴圈本來就不跑；[2, 2, 2, 2] 每個視窗都是 4，漏掉一個也看不出來。好的測資要把答案放在「錯誤程式碰不到」的位置。（已實際執行四組確認：只有第二組不同，2 對 10。）',
    },
    {
      id: 'q-edge', prompt: '下面的 Python 函式想求「最長嚴格遞增連續段」的長度。哪一組輸入會讓它答錯？',
      code: { language: 'Python', text: code`def longest_streak(a):
    best, cur = 0, 1
    for i in range(1, len(a)):
        if a[i] > a[i - 1]:
            cur += 1
        else:
            cur = 1
        best = max(best, cur)
    return best` },
      options: ['[1, 2, 3]', '[3, 2, 1]', '[5]', '[2, 2, 2]'],
      answer: 2, explanation: '只有一個元素時迴圈一次都不跑，`best` 停在初始值 0，但正確答案是 1（一個元素本身就是長度 1 的段）。修正方法是讓 `best` 也從 1 開始。[1, 2, 3] 得 3、[3, 2, 1] 與 [2, 2, 2] 得 1，都正確：只要迴圈跑過一次，`best` 就會被更新成至少 1。這正是邊界清單的第一項「迴圈一次都不跑時，初始值對嗎？」（已實際執行四組確認。）',
    },
    {
      id: 'q-order', prompt: '下列哪一個是解實作題較好的順序？',
      options: [
        '讀題並手算範例 → 由資料範圍估計複雜度 → 選演算法 → 分段實作並逐段測試 → 邊界測資與對拍',
        '直接開始寫程式 → 範例通過就交出 → 有時間再讀資料範圍',
        '先選一個熟悉的演算法 → 再讀題確認輸入格式 → 寫完一次測試',
        '讀題 → 寫完整支程式 → 只用最大的測資測試速度',
      ],
      answer: 0, explanation: '先讀懂題意（手算範例確認理解），資料範圍才能決定時間預算，預算再決定演算法家族；分段實作讓錯誤被限制在剛寫的一小塊，最後用邊界清單與對拍找出範例抓不到的錯誤。第二個選項沒有估計複雜度，也只靠範例驗證；第三個先決定演算法才讀題，容易選到不符合限制的方法；第四個只測速度，抓不到 n = 1、同分、負數這類答案錯誤。',
    },
  ],
  exercises: [
    {
      id: 'e-queue-stats', title: '自製練習：門市排隊紀錄統計',
      statement: '（本題是為本課自製的練習。）一間門市記錄了 n 筆排隊紀錄，每筆有時間 t（開店後第幾分鐘）與數值 v（例如當時隊伍長度的變化量，可以是負數）。紀錄不一定依時間給出：請先依時間由早到晚排列，時間相同的紀錄保持輸入的先後順序。接著輸出三項統計：一，`Streak L`：排好的紀錄中，數值嚴格遞增（後一筆大於前一筆）的最長連續段長度 L；二，`Hours` 後接每個小時的紀錄筆數 `h:c`，其中小時 h = ⌊t / 60⌋，只列出至少有一筆紀錄的小時，依筆數由多到少排列，筆數相同時小時小的在前；三，`Window S start T`：排好的紀錄中，連續 k 筆的數值和的最大值 S，以及達到最大值的那一段第一筆紀錄的時間 T（有好幾段同為最大時取最早的一段）。輸入不合法時只輸出一行 `Invalid`。',
      inputFormat: '第一行是 n 與 k，接著 n 行各有兩個整數 t 與 v。所有數字以空白或換行分隔，可能有多餘的空白與空行。',
      outputFormat: '三行：`Streak L`、`Hours h1:c1 h2:c2 …`（項目之間一個空白）、`Window S start T`。輸入不合法時只輸出 `Invalid`。',
      constraints: [
        '1 ≤ n ≤ 2 × 10⁵，1 ≤ k ≤ n',
        '0 ≤ t ≤ 10⁹，−10⁹ ≤ v ≤ 10⁹（S 最大約 2 × 10¹⁴，需要 64 位元整數）',
        '每個整數寫成可選的負號加 1～10 位數字；`+5`、`3.5`、`abc` 或超過 10 位數字都不合法',
        '不合法的輸入：數字個數不是恰好 2 + 2n、任何一個整數格式錯誤或超出範圍、k 不在 1～n',
      ],
      samples: [
        { kind: 'normal', input: '8 3\n130 5\n10 3\n75 -2\n20 4\n65 7\n200 6\n70 7\n185 -1', output: 'Streak 3\nHours 1:3 0:2 3:2 2:1\nWindow 18 start 20', note: '依時間排好後數值是 3 4 7 7 −2 5 −1 6：最長嚴格遞增段 3 4 7（第二個 7 不算遞增）；第 1 小時（60～119 分）有 3 筆；連續 3 筆最大和是 4 + 7 + 7 = 18，從 t = 20 開始' },
      ],
      tests: [
        { kind: 'normal', input: '8 3\n130 5\n10 3\n75 -2\n20 4\n65 7\n200 6\n70 7\n185 -1', output: 'Streak 3\nHours 1:3 0:2 3:2 2:1\nWindow 18 start 20', note: '範例：輸入未排序、嚴格遞增遇到相等就中斷、小時同筆數依小時排' },
        { kind: 'normal', input: '6 2\n0 4\n1 1\n2 3\n3 2\n4 1\n5 4', output: 'Streak 2\nHours 0:6\nWindow 5 start 0', note: '三段視窗同為 5，必須取最早的 t = 0（用 >= 更新會得到 t = 4）' },
        { kind: 'normal', input: '10 4\n300 2\n59 8\n60 -3\n61 5\n119 6\n120 7\n240 -10\n241 9\n0 1\n360 3', output: 'Streak 4\nHours 1:3 0:2 4:2 2:1 5:1 6:1\nWindow 16 start 59', note: '59／60、119／120 分鐘跨小時的邊界；最長段 −3 5 6 7' },
        { kind: 'edge', input: '1 1\n0 -1000000000', output: 'Streak 1\nHours 0:1\nWindow -1000000000 start 0', note: 'n = 1：迴圈一次都不跑，Streak 仍是 1；最大和是負數的最小值' },
        { kind: 'edge', input: '5 5\n10 1\n20 2\n30 3\n40 4\n50 5', output: 'Streak 5\nHours 0:5\nWindow 15 start 10', note: 'k = n：只有一個視窗；整段都是遞增' },
        { kind: 'edge', input: '4 2\n100 9\n100 1\n100 2\n100 3', output: 'Streak 3\nHours 1:4\nWindow 10 start 100', note: '時間全部相同：要保持輸入順序 9 1 2 3（若連數值一起排序會得到 Streak 4）' },
        { kind: 'edge', input: '5 2\n0 -5\n60 -3\n120 -8\n180 -1\n240 -7', output: 'Streak 2\nHours 0:1 1:1 2:1 3:1 4:1\nWindow -8 start 0', note: '全部負數：最大和的初始值不能是 0；第一段與最後一段同為 −8，取最早' },
        { kind: 'edge', input: '5 5\n0 1000000000\n1 1000000000\n2 1000000000\n3 1000000000\n4 1000000000', output: 'Streak 1\nHours 0:5\nWindow 5000000000 start 0', note: '和 5 × 10⁹ 超過 2³¹ − 1：用 int 會溢位；相等的值不算遞增' },
        { kind: 'edge', input: '6 3\n0 2\n1 2\n2 2\n3 3\n4 3\n1000000000 4', output: 'Streak 2\nHours 0:5 16666666:1\nWindow 10 start 3', note: '重複值打斷嚴格遞增（寫成 >= 會得到 6）；t = 10⁹ 落在第 16666666 小時' },
        { kind: 'edge', input: '  3   1 \n\n 5\t-2\n 4 7 \n3 0  ', output: 'Streak 2\nHours 0:3\nWindow 7 start 4', note: '多餘的空白、Tab 與空行；k = 1 時最大和就是最大值' },
        { kind: 'edge', input: '2 1\n0 0000000005\n1 -0', output: 'Streak 1\nHours 0:2\nWindow 5 start 0', note: '10 位數字（含前導零）與 -0 都是合法的整數' },
        { kind: 'edge', input: big1Input, output: big1Output, note: 'n = k = 2 × 10⁵，每個時間出現 3～4 次（同時間要保持輸入順序），總和約 2 × 10¹⁴：需要穩定排序與 64 位元整數' },
        { kind: 'edge', input: big2Input, output: big2Output, note: 'n = 2 × 10⁵、k = 1000，紀錄由晚到早給出：忘了排序會得到 Streak 1；O(n · k) 的視窗要 2 × 10⁸ 次加法，應改用滑動視窗' },
        { kind: 'error', input: '3 0\n0 1\n1 2\n2 3', output: 'Invalid', note: 'k = 0' },
        { kind: 'error', input: '2 3\n0 1\n1 2', output: 'Invalid', note: 'k > n' },
        { kind: 'error', input: '0 1', output: 'Invalid', note: 'n = 0' },
        { kind: 'error', input: '2 1\n-1 5\n3 4', output: 'Invalid', note: '時間是負數' },
        { kind: 'error', input: '2 1\n1000000001 5\n3 4', output: 'Invalid', note: '時間超過 10⁹' },
        { kind: 'error', input: '2 1\n0 1000000001\n3 4', output: 'Invalid', note: '數值超過 10⁹' },
        { kind: 'error', input: '2 1\n0 3.5\n3 4', output: 'Invalid', note: '小數' },
        { kind: 'error', input: '2 1\n0 abc\n3 4', output: 'Invalid', note: '不是數字' },
        { kind: 'error', input: '2 1\n0 +5\n3 4', output: 'Invalid', note: '正號不在允許的格式內（Python 的 int("+5") 會接受，所以要先檢查字元）' },
        { kind: 'error', input: '2 1\n0 00000000001\n1 2', output: 'Invalid', note: '11 位數字' },
        { kind: 'error', input: '3 1\n0 1\n1 2', output: 'Invalid', note: '紀錄少於 n 筆' },
        { kind: 'error', input: '2 1\n0 1\n1 2\n3', output: 'Invalid', note: '多出一個數字' },
        { kind: 'error', input: '5', output: 'Invalid', note: '只有一個數字' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '先拆步驟：讀入所有字詞並檢查格式 → 依時間穩定排序 → 三項統計各算一次 → 輸出。每一步都可以用範例單獨檢查。',
        '穩定排序：C++ 用 `std::stable_sort`（`std::sort` 不保證相同時間的順序），Python 的 `sort` 本來就穩定；Java 可以把「時間 × 2¹⁸ + 輸入位置」存成 `long` 再排序基本型別陣列。',
        '最長遞增段：目前段長 `cur` 遇到更大的值加 1，否則重設為 1；答案的初始值是 1，不是 0。',
        '排序後同一小時的紀錄一定相鄰，所以掃一遍就能數出每個小時的筆數，再依（筆數由大到小、小時由小到大）排序。',
        '視窗和：先算前 k 筆，之後每次加入一筆、移出一筆；用 `>` 更新才會保留最早的一段；和要用 64 位元整數。整體 O(n log n)，由排序主導。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

// 可有負號，接著 1～10 位數字，而且在 lo..hi 之內
bool toInt(const std::string& s, long long lo, long long hi, long long& out) {
    std::size_t from = (!s.empty() && s[0] == '-') ? 1 : 0;
    if (s.size() - from < 1 || s.size() - from > 10) return false;
    for (std::size_t i = from; i < s.size(); ++i)
        if (s[i] < '0' || s[i] > '9') return false;
    out = std::stoll(s);  // 最多 10 位數字，不會超出 long long
    return out >= lo && out <= hi;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> tok;
    for (std::string s; std::cin >> s;) tok.push_back(s);
    long long n = 0, k = 0;
    // && 短路：n 不合法時不會拿它去檢查 k
    bool ok = tok.size() >= 2 && toInt(tok[0], 1, 200000, n) && toInt(tok[1], 1, n, k) &&
              tok.size() == static_cast<std::size_t>(2 + 2 * n);
    std::vector<std::pair<long long, long long>> rec;  // (時間, 數值)
    for (long long i = 0; ok && i < n; ++i) {
        long long t, v;
        ok = toInt(tok[2 + 2 * i], 0, 1000000000, t) && toInt(tok[3 + 2 * i], -1000000000, 1000000000, v);
        rec.emplace_back(t, v);
    }
    if (!ok) {
        std::cout << "Invalid\n";
        return 0;
    }
    // stable_sort：時間相同時保留輸入順序（std::sort 不保證）
    std::stable_sort(rec.begin(), rec.end(), [](const auto& a, const auto& b) { return a.first < b.first; });

    int best = 1, cur = 1;  // 第一部分：最長嚴格遞增段，O(n)
    for (std::size_t i = 1; i < rec.size(); ++i) {
        cur = rec[i].second > rec[i - 1].second ? cur + 1 : 1;
        best = std::max(best, cur);
    }

    std::vector<std::pair<long long, int>> hours;  // 第二部分：(小時, 筆數)，同一小時的紀錄相鄰
    for (const auto& r : rec) {
        long long h = r.first / 60;
        if (!hours.empty() && hours.back().first == h) ++hours.back().second;
        else hours.emplace_back(h, 1);
    }
    std::sort(hours.begin(), hours.end(), [](const auto& a, const auto& b) {
        return a.second != b.second ? a.second > b.second : a.first < b.first;  // 筆數多的先，同筆數小時小的先
    });

    long long window = 0;  // 第三部分：固定長度 k 的滑動視窗；和最多 2 × 10¹⁴，要用 long long
    for (long long i = 0; i < k; ++i) window += rec[i].second;
    long long top = window, start = 0;
    for (long long i = k; i < n; ++i) {
        window += rec[i].second - rec[i - k].second;
        if (window > top) {  // 用 >：同分時保留最早的視窗
            top = window;
            start = i - k + 1;
        }
    }

    std::string out = "Streak " + std::to_string(best) + "\nHours";
    for (const auto& [h, c] : hours) out += " " + std::to_string(h) + ":" + std::to_string(c);
    out += "\nWindow " + std::to_string(top) + " start " + std::to_string(rec[start].first) + "\n";
    std::cout << out;
    return 0;
}`,
        Python: code`import re
import sys

INT = re.compile(rb"-?[0-9]{1,10}")  # 可有負號，接著 1～10 位數字


def to_int(s, lo, hi):
    if not INT.fullmatch(s):
        return None
    v = int(s)
    return v if lo <= v <= hi else None


def main():
    tok = sys.stdin.buffer.read().split()
    n = to_int(tok[0], 1, 200000) if len(tok) >= 2 else None
    k = to_int(tok[1], 1, n) if n is not None else None
    if k is None or len(tok) != 2 + 2 * n:
        print("Invalid")
        return
    rec = []
    for i in range(n):
        t = to_int(tok[2 + 2 * i], 0, 10**9)
        v = to_int(tok[3 + 2 * i], -10**9, 10**9)
        if t is None or v is None:
            print("Invalid")
            return
        rec.append((t, v))
    rec.sort(key=lambda r: r[0])  # 穩定排序：時間相同時保留輸入順序
    t = [r[0] for r in rec]
    v = [r[1] for r in rec]

    best = cur = 1  # 第一部分：最長嚴格遞增段，O(n)
    for i in range(1, n):
        cur = cur + 1 if v[i] > v[i - 1] else 1
        best = max(best, cur)

    hours = []  # 第二部分：排序後同一小時的紀錄相鄰，數連續段
    for x in t:
        h = x // 60
        if hours and hours[-1][0] == h:
            hours[-1][1] += 1
        else:
            hours.append([h, 1])
    hours.sort(key=lambda p: (-p[1], p[0]))  # 筆數多的先，同筆數小時小的先

    window = sum(v[:k])  # 第三部分：固定長度 k 的滑動視窗，O(n)
    top, start = window, 0
    for i in range(k, n):
        window += v[i] - v[i - k]
        if window > top:  # 用 >：同分時保留最早的視窗
            top, start = window, i - k + 1

    out = [f"Streak {best}", "Hours " + " ".join(f"{h}:{c}" for h, c in hours), f"Window {top} start {t[start]}"]
    print("\n".join(out))


main()`,
        Java: code`import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class Main {
    static final long BAD = Long.MIN_VALUE;  // 「不合法」的記號

    // 可有負號，接著 1～10 位數字，而且在 lo..hi 之內；否則回傳 BAD
    static long toInt(String s, long lo, long hi) {
        int from = s.startsWith("-") ? 1 : 0;
        if (s.length() - from < 1 || s.length() - from > 10) return BAD;
        for (int i = from; i < s.length(); ++i)
            if (s.charAt(i) < '0' || s.charAt(i) > '9') return BAD;
        long v = Long.parseLong(s);  // 最多 10 位數字，不會超出 long
        return v >= lo && v <= hi ? v : BAD;
    }

    public static void main(String[] args) throws IOException {
        String[] tok = new String(System.in.readAllBytes()).trim().split("\\s+");  // 一次讀完再切
        if (tok.length == 1 && tok[0].isEmpty()) tok = new String[0];
        long n = tok.length >= 2 ? toInt(tok[0], 1, 200000) : BAD;
        long k = n != BAD ? toInt(tok[1], 1, n) : BAD;
        if (k == BAD || tok.length != 2 + 2 * n) {
            System.out.println("Invalid");
            return;
        }
        int m = (int) n;
        long[] t = new long[m], v = new long[m], key = new long[m];
        for (int i = 0; i < m; ++i) {
            t[i] = toInt(tok[2 + 2 * i], 0, 1_000_000_000L);
            v[i] = toInt(tok[3 + 2 * i], -1_000_000_000L, 1_000_000_000L);
            if (t[i] == BAD || v[i] == BAD) {
                System.out.println("Invalid");
                return;
            }
            key[i] = t[i] * 262144 + i;  // 時間在前、輸入順序在後（i < 2¹⁸），排序 long[] 就等於穩定排序
        }
        Arrays.sort(key);
        long[] st = new long[m], sv = new long[m];  // 依時間排好的時間與數值
        for (int j = 0; j < m; ++j) {
            int i = (int) (key[j] % 262144);
            st[j] = t[i];
            sv[j] = v[i];
        }

        int best = 1, cur = 1;  // 第一部分：最長嚴格遞增段，O(n)
        for (int i = 1; i < m; ++i) {
            cur = sv[i] > sv[i - 1] ? cur + 1 : 1;
            best = Math.max(best, cur);
        }

        List<long[]> hours = new ArrayList<>();  // 第二部分：{小時, 筆數}，同一小時的紀錄相鄰
        for (int i = 0; i < m; ++i) {
            long h = st[i] / 60;
            if (!hours.isEmpty() && hours.get(hours.size() - 1)[0] == h) hours.get(hours.size() - 1)[1]++;
            else hours.add(new long[]{h, 1});
        }
        hours.sort((a, b) -> a[1] != b[1] ? Long.compare(b[1], a[1]) : Long.compare(a[0], b[0]));  // 筆數多的先

        long window = 0;  // 第三部分：固定長度 k 的滑動視窗；和最多 2 × 10¹⁴，要用 long
        for (int i = 0; i < k; ++i) window += sv[i];
        long top = window;
        int start = 0;
        for (int i = (int) k; i < m; ++i) {
            window += sv[i] - sv[i - (int) k];
            if (window > top) {  // 用 >：同分時保留最早的視窗
                top = window;
                start = i - (int) k + 1;
            }
        }

        StringBuilder out = new StringBuilder("Streak ").append(best).append("\nHours");
        for (long[] p : hours) out.append(' ').append(p[0]).append(':').append(p[1]);
        out.append("\nWindow ").append(top).append(" start ").append(st[start]).append('\n');
        System.out.print(out);
    }
}`,
      },
      judge: 'none',
    },
  ],
};
