import type { LessonContent } from '../schema';

const code = String.raw;

/*
 * A01 Algorithm analysis. Every example and the reference solutions run in tests/curriculum-code.test.ts. The examples
 * print operation counts (never timings), so their output is the same on every machine. The exercise's expected outputs
 * were produced by an independent O(n²) brute-force reference (strict-parsing Python for the small tests, C++ -O2 for the
 * maximum-size test), not by the reference solutions below.
 */

/** A medium test: 2000 values in −50..50 from a fixed linear congruential generator (deterministic, no Math.random). */
const lcgValues = (() => {
  const out: number[] = [];
  let s = 12345;
  for (let i = 0; i < 2000; i++) {
    s = (s * 48271) % 2147483647;  // MINSTD: products stay below 2^53, exact in JS
    out.push((s % 101) - 50);
  }
  return out;
})();
const medium = `2000 7\n${lcgValues.join(' ')}`;
/** The maximum size, all values equal: every one of the n(n − 1)/2 pairs counts, far beyond 32-bit range. */
const allEqual = `200000 0\n${Array.from({ length: 200000 }, () => '0').join(' ')}`;

export const A01: LessonContent = {
  lessonId: 'A01',
  motivation: '演算法島的每一堂課都會問同一個問題：「這個做法夠快嗎？」F19 學會了數迴圈次數與 Big-O 的基本寫法；這一課把它變成真正能用的工具：同一個演算法在不同輸入下的表現可能差很多（最佳、最差、平均情況），複雜的程式結構要能一眼拆出成長速度，看到題目的資料範圍就要能判斷「O(n²) 會不會超時」，寫完之後還要能用數據檢查自己的分析。它的限制也要清楚：Big-O 只描述 n 很大時的成長趨勢，不能精確預測秒數，常數倍與函式庫的隱藏成本仍然要另外留意。',
  sections: [
    {
      id: 'cases', title: '最佳、最差與平均情況',
      blocks: [
        { type: 'p', text: '同一個演算法、同樣大小的輸入，做的工作量仍可能不同。以線性搜尋（linear search）為例：從頭逐一比較，找到就停。目標剛好在第一格時只比較 1 次，這是最佳情況（best case）；目標在最後一格或根本不存在時要比較 n 次，這是最差情況（worst case）。' },
        { type: 'example', id: 'search-cases' },
        { type: 'p', text: '平均情況（average case）一定要先說「平均的對象」是什麼。上面的 4.50 假設「目標一定在陣列裡，而且出現在每個位置的機會相同」：比較次數是 1、2、…、n 的平均，(1 + 2 + … + n) / n = (n + 1) / 2，n = 8 時正好是 4.5。如果目標常常不存在，平均就會更接近 n；如果熱門資料都放在前面，平均又會變小。換了假設，平均的數字就跟著變，但這裡不論哪一種都還是 O(n)。' },
        { type: 'list', items: [
          '最差情況是「保證」：不管測資怎麼出，都不會比它更慢。評測的測資可能刻意挑最壞的輸入，所以判斷會不會超時，預設看最差情況。',
          '平均情況描述「典型」表現，前提是輸入真的符合假設的分布。快速排序（quick sort，A07）平均 O(n log n)、最差 O(n²)；雜湊表（hash table，D10）平均每次 O(1)，最差可能 O(n)，都是這種差別。',
          '最佳情況幾乎沒有參考價值：「線性搜尋最快 1 次」不能保證任何事，任何演算法都可以在某些幸運的輸入上很快。',
        ] },
        { type: 'callout', tone: 'warning', title: '不要把平均當成保證', text: '「雜湊表查詢是 O(1)」指的是平均情況。C++ 的 `std::unordered_map` 若遇到刻意設計、讓大量鍵落在同一個桶的資料，單次操作會退化成 O(n)；Java 8 以後的 `HashMap` 在同一桶太多元素時會改成樹狀結構來減輕這個問題。分析時要寫清楚說的是哪一種情況，例如「平均 O(1)，最差 O(n)」。' },
      ],
    },
    {
      id: 'derive', title: '由程式結構推導 Big-O',
      blocks: [
        { type: 'p', text: '不必每次都從頭數，可以把程式拆成幾種結構，再把它們組合起來：' },
        { type: 'list', items: [
          '依序執行的區塊相加：先跑 O(n) 再跑 O(n²)，總共 O(n + n²) = O(n²)，由最大的那一段決定。',
          '巢狀迴圈相乘：外層 n 次、每次內層 m 次，共 O(n·m)。兩個變數不要硬併成一個：n 與 m 是不同的輸入大小時，答案就是 O(n·m) 或 O(n + m)。',
          '每次把範圍減半（或乘以 2 直到超過 n）的迴圈：O(log n)。',
          '內層邊界跟著外層索引變的迴圈要求和：`j` 從 `i + 1` 跑到 `n − 1`，次數是 (n − 1) + (n − 2) + … + 0 = n(n − 1)/2，仍是 O(n²)，只是常數變成 1/2。',
          '但不是所有「兩層迴圈」都是 O(n²)：外層 `i` 每次乘以 2、內層跑 `i` 次，總和是 1 + 2 + 4 + … < 2n，只有 O(n)。一定要把每一輪的次數加起來，而不是看到兩層就說 n²。',
        ] },
        { type: 'example', id: 'loop-counts' },
        { type: 'p', text: '輸出中的實際次數與公式完全吻合：兩段依序的單層迴圈是 2n，兩層完整迴圈是 n²，依賴外層索引的迴圈是 n(n − 1)/2。注意 n 每變成 10 倍，前者變 10 倍，後兩者都變 100 倍——常數 1/2 不影響「乘以 100」這個成長規律。' },
        { type: 'example', id: 'halving-count' },
        { type: 'p', text: '「每次保留較大的一半」恰好做 ⌈log₂ n⌉ 輪，n = 10⁹ 只要 30 輪。二分搜尋（binary search，A04）每輪也把範圍減半，所以同樣是 O(log n)；確切是 ⌈log₂ n⌉ 輪還是多一輪，要看迴圈怎麼寫，A04 會細談。程式用「找最小的 k 使 2ᵏ ≥ n」來算 ⌈log₂ n⌉，而不是呼叫浮點數的 `log2` 再取整數：浮點數有捨入誤差，整數計算比較保險。' },
        { type: 'p', text: '遞迴的複雜度要寫成遞迴式（recurrence）：每一層做多少事、拆成幾個多大的子問題。例如 T(n) = T(n − 1) + O(1) 是 O(n)；合併排序的 T(n) = 2T(n/2) + O(n) 是 O(n log n)（A06）；T(n) = 2T(n − 1) + O(1) 會長成 O(2ⁿ)。A11 會用遞迴樹（recursion tree）把這些式子畫出來。' },
      ],
    },
    {
      id: 'constants', title: '去掉常數與低次項——以及常數何時仍然重要',
      blocks: [
        { type: 'p', text: '比 F19 更精確的說法：f(n) = O(g(n)) 的意思是「存在常數 c > 0 與 n₀，使得所有 n ≥ n₀ 都有 f(n) ≤ c·g(n)」。例如 3n² + 100n + 5 ≤ 4n² 對所有 n ≥ 101 成立，所以它是 O(n²)。這個定義說明了兩件事：常數倍 c 被吸收掉了；只要求 n 夠大（n ≥ n₀）時成立，小的 n 不算數。' },
        { type: 'p', text: 'Big-O 是上界（upper bound）：說線性搜尋是 O(n²) 在數學上沒錯，但沒有用。我們總是給出最緊的上界 O(n)。教科書另有 Ω（下界）與 Θ（上下界都相同）的寫法；一般解題時說的「這是 O(n log n) 的做法」，意思通常就是 Θ(n log n)。' },
        { type: 'p', text: '常數在三種時候仍然重要：' },
        { type: 'list', items: [
          'n 不大的時候：100n 與 n² 在 n = 100 時一樣多，n < 100 時 n² 反而比較少。很多函式庫的排序在範圍很小時會改用插入排序（insertion sort），就是因為它的常數小。',
          '同一個等級互相比較的時候：兩個 O(n log n) 的做法，一個每步只做一次加法、另一個每步要建立物件或做取模運算，實際速度可能差好幾倍。',
          '換語言的時候：同樣 10⁸ 次簡單運算，C++ 可能一秒內完成，Python 往往慢很多。Big-O 相同不代表在每種語言都過得了。',
        ] },
        { type: 'p', text: '不過一旦 n 夠大，等級的差距一定會壓倒常數：50·n·log₂ n 在 n = 10⁵ 時約 8.3 × 10⁷，n²/2 則是 5 × 10⁹，常數 50 救不了 n²。' },
      ],
    },
    {
      id: 'ranges', title: '從資料範圍推估可接受的複雜度',
      blocks: [
        { type: 'p', text: '寫程式前先看資料範圍，把 n 的上限代入候選做法的複雜度，再和「一秒大約 10⁸ 次簡單運算」比較。這是粗略的經驗值，不是保證：實際速度會因語言、評測機器、運算種類與輸入輸出量差上好幾倍，Python 這類直譯語言通常少得多。下表是常見的對應：' },
        { type: 'table', head: ['n 的上限', '通常可接受的複雜度', '代入上限的運算量'], rows: [
          ['≤ 10', 'O(n!)：枚舉所有排列', '10! ≈ 3.6 × 10⁶'],
          ['≤ 20', 'O(2ⁿ) 或 O(n·2ⁿ)：枚舉所有子集', '2²⁰ ≈ 10⁶；20 × 2²⁰ ≈ 2 × 10⁷'],
          ['≤ 500', 'O(n³)', '500³ = 1.25 × 10⁸'],
          ['≤ 5,000', 'O(n²)', '5000² = 2.5 × 10⁷'],
          ['≤ 10⁶', 'O(n log n)', '10⁶ × 20 = 2 × 10⁷'],
          ['≤ 10⁸', 'O(n)，而且常數要小', '10⁸'],
          ['更大（例如 10¹⁸）', 'O(log n) 或 O(1)：不能逐一處理', 'log₂ 10¹⁸ ≈ 60'],
        ] },
        { type: 'p', text: '有好幾個參數時要一起代入。n 個數、q 次查詢，每次查詢都掃一次陣列是 O(n·q)；n = q = 2 × 10⁵ 時是 4 × 10¹⁰，遠超過 10⁸。先排序（O(n log n)），每次查詢再用二分搜尋（O(log n)），總共 O((n + q) log n)，約 7 × 10⁶。' },
        { type: 'p', text: '這張表也可以反過來用：題目給 n ≤ 2 × 10⁵，就是在暗示「O(n²) 不行，要 O(n log n) 或 O(n)」。本課練習題正是 F19 那一題「和為目標的配對數」，只是 n 從 2,000 變成 2 × 10⁵：兩層迴圈的 n(n − 1)/2 從 2 × 10⁶ 變成 2 × 10¹⁰，必須換做法。' },
      ],
    },
    {
      id: 'measure', title: '用實測檢查分析',
      blocks: [
        { type: 'p', text: '分析可能出錯：漏看一個隱藏在函式呼叫裡的迴圈，或把 O(n) 的總和誤算成 O(n²)。最可靠的檢查方式是數操作次數：在最內層放一個計數器，用幾個不同的 n 執行，看次數怎麼成長。本課的範例都是這樣做的，所以不論在哪台電腦上跑，輸出都一樣。' },
        { type: 'list', items: [
          '倍增實驗（doubling experiment）：把 n 加倍，看次數變幾倍。約 2 倍是 O(n)，約 4 倍是 O(n²)，約 8 倍是 O(n³)，比 2 倍多一點點是 O(n log n)，幾乎不變（只多一次）是 O(log n)。',
          '把實際次數和公式並排印出來，像 `loop-counts` 那樣；兩者一致，分析才算被驗證。',
          '對拍：小資料用暴力解算出答案，和快的解法比對。正確性與複雜度都要驗證，本課練習的預期輸出就是這樣產生的。',
        ] },
        { type: 'p', text: '也可以量時間：C++ 用 `std::chrono::steady_clock`，Python 用 `time.perf_counter()`，Java 用 `System.nanoTime()`。但秒數會隨機器、同時執行的其他程式、快取與輸入輸出而變；Java 的程式剛開始執行時還沒經過即時編譯（JIT）最佳化，前幾次特別慢。量時間要用夠大的 n、重複幾次取中位數，而且只拿來看「倍數」，不要把秒數寫進要比對的輸出——本課的程式只印次數，就是這個原因。' },
      ],
    },
    {
      id: 'space', title: '空間複雜度、複製的代價與隱藏成本',
      blocks: [
        { type: 'p', text: '空間複雜度通常只算額外空間（auxiliary space），不算輸入本身。原地反轉陣列是 O(1) 額外空間；另開一個陣列存結果是 O(n)；深度 n 的遞迴要 n 層堆疊，也是 O(n)。' },
        { type: 'p', text: '複製同時花時間與空間，而且常常寫在不起眼的地方：Python 的切片 `a[1:]` 會建立一份新的 list，複製 n − 1 個元素；C++ 把 `std::vector` 以值傳遞（`void f(std::vector<int> v)`）會整份複製，應該寫 `const std::vector<int>&`；Java 傳陣列只複製參考，不複製內容。一個遞迴函式如果每層都切片，原本 O(n) 的遞迴就變成 O(n²) 的時間與空間。' },
        { type: 'example', id: 'front-insert' },
        { type: 'p', text: '兩種做法得到完全相同的結果，但「每次插在最前面」要把所有舊元素往後移一格，總共 0 + 1 + … + (n − 1) = n(n − 1)/2 次移動；「先接在尾端、最後反轉一次」只要 n/2 次交換。n = 1000 時是 499,500 對 500。接在尾端偶爾需要擴充容量、把資料搬到新空間，但攤銷（amortized）後每次仍是 O(1)（D02）。' },
        { type: 'callout', tone: 'warning', title: '函式庫呼叫不一定是 O(1)', text: '一行程式不等於一步操作。這些呼叫都要 O(n)，放進跑 n 次的迴圈就變成 O(n²)：Python 對 list 用 `x in a`、`a.index(x)`、`a.insert(0, x)`、`a.pop(0)`；C++ 的 `v.insert(v.begin(), x)`、`v.erase(v.begin())`、`std::find`、`std::count`；Java 的 `ArrayList` 的 `contains`、`remove(0)`、`add(0, x)`。Java 與 Python 的字串不可變，在迴圈裡 `s += t` 會複製整個字串（CPython 有時會就地延長，但這不是語言保證），要改用 `StringBuilder` 或 `"".join(parts)`；C++ 的 `s += t` 是就地附加，但 `s = s + t` 會先複製一份。另一個常見錯誤是在迴圈裡排序：每次 `sort` 都是 O(n log n)，n 次就是 O(n² log n)。' },
      ],
    },
  ],
  examples: [
    {
      id: 'search-cases', title: '線性搜尋的最佳、最差與平均比較次數',
      description: '對同一個 8 個數的陣列，數出不同目標時線性搜尋比較了幾次，並對「目標是陣列中每一個數」的情況取平均。',
      output: 'best (target 7): 1\nworst, found (target 2): 8\nworst, missing (target 5): 8\naverage over 8 present targets: 36/8 = 4.50',
      code: {
        'C++': code`#include <iomanip>
#include <iostream>
#include <vector>

// 線性搜尋：回傳停下來之前比較了幾次
int comparisons(const std::vector<int>& a, int target) {
    int count = 0;
    for (int x : a) {
        ++count;
        if (x == target) return count;
    }
    return count;
}

int main() {
    std::vector<int> a = {7, 3, 9, 4, 1, 8, 6, 2};
    std::cout << "best (target 7): " << comparisons(a, 7) << "\n";
    std::cout << "worst, found (target 2): " << comparisons(a, 2) << "\n";
    std::cout << "worst, missing (target 5): " << comparisons(a, 5) << "\n";
    int total = 0;
    for (int x : a) total += comparisons(a, x);
    std::cout << "average over " << a.size() << " present targets: " << total << "/" << a.size() << " = "
              << std::fixed << std::setprecision(2) << static_cast<double>(total) / a.size() << "\n";
    return 0;
}`,
        Python: code`def comparisons(a, target):
    """線性搜尋：回傳停下來之前比較了幾次。"""
    count = 0
    for x in a:
        count += 1
        if x == target:
            return count
    return count


a = [7, 3, 9, 4, 1, 8, 6, 2]
print("best (target 7):", comparisons(a, 7))
print("worst, found (target 2):", comparisons(a, 2))
print("worst, missing (target 5):", comparisons(a, 5))
total = sum(comparisons(a, x) for x in a)
print(f"average over {len(a)} present targets: {total}/{len(a)} = {total / len(a):.2f}")`,
        Java: code`import java.util.Locale;

public class Main {
    // 線性搜尋：回傳停下來之前比較了幾次
    static int comparisons(int[] a, int target) {
        int count = 0;
        for (int x : a) {
            count++;
            if (x == target) return count;
        }
        return count;
    }

    public static void main(String[] args) {
        int[] a = {7, 3, 9, 4, 1, 8, 6, 2};
        System.out.println("best (target 7): " + comparisons(a, 7));
        System.out.println("worst, found (target 2): " + comparisons(a, 2));
        System.out.println("worst, missing (target 5): " + comparisons(a, 5));
        int total = 0;
        for (int x : a) total += comparisons(a, x);
        // Locale.ROOT：小數點一律是「.」，不受電腦地區設定影響
        System.out.println(String.format(Locale.ROOT, "average over %d present targets: %d/%d = %.2f",
                a.length, total, a.length, (double) total / a.length));
    }
}`,
      },
    },
    {
      id: 'loop-counts', title: '依序、巢狀與依賴外層的迴圈：實際次數對照公式',
      description: '對 n = 10、100、1000，數出三種結構最內層執行的次數，並在旁邊印出公式算出的值。',
      output: 'n=10: sequential 20 (2n = 20), nested 100 (n^2 = 100), dependent 45 (n(n-1)/2 = 45)\nn=100: sequential 200 (2n = 200), nested 10000 (n^2 = 10000), dependent 4950 (n(n-1)/2 = 4950)\nn=1000: sequential 2000 (2n = 2000), nested 1000000 (n^2 = 1000000), dependent 499500 (n(n-1)/2 = 499500)',
      code: {
        'C++': code`#include <iostream>

int main() {
    const long long sizes[] = {10, 100, 1000};
    for (long long n : sizes) {
        long long sequential = 0, nested = 0, dependent = 0;
        for (long long i = 0; i < n; ++i) sequential++;  // 第一段
        for (long long i = 0; i < n; ++i) sequential++;  // 第二段：依序相加
        for (long long i = 0; i < n; ++i)
            for (long long j = 0; j < n; ++j) nested++;  // 巢狀相乘
        for (long long i = 0; i < n; ++i)
            for (long long j = i + 1; j < n; ++j) dependent++;  // 內層從 i + 1 開始
        std::cout << "n=" << n << ": sequential " << sequential << " (2n = " << 2 * n << "), nested " << nested
                  << " (n^2 = " << n * n << "), dependent " << dependent << " (n(n-1)/2 = " << n * (n - 1) / 2 << ")\n";
    }
    return 0;
}`,
        Python: code`for n in [10, 100, 1000]:
    sequential = nested = dependent = 0
    for i in range(n):  # 第一段
        sequential += 1
    for i in range(n):  # 第二段：依序相加
        sequential += 1
    for i in range(n):
        for j in range(n):  # 巢狀相乘
            nested += 1
    for i in range(n):
        for j in range(i + 1, n):  # 內層從 i + 1 開始
            dependent += 1
    print(f"n={n}: sequential {sequential} (2n = {2 * n}), nested {nested} (n^2 = {n * n}), "
          f"dependent {dependent} (n(n-1)/2 = {n * (n - 1) // 2})")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        long[] sizes = {10, 100, 1000};
        for (long n : sizes) {
            long sequential = 0, nested = 0, dependent = 0;
            for (long i = 0; i < n; i++) sequential++;  // 第一段
            for (long i = 0; i < n; i++) sequential++;  // 第二段：依序相加
            for (long i = 0; i < n; i++)
                for (long j = 0; j < n; j++) nested++;  // 巢狀相乘
            for (long i = 0; i < n; i++)
                for (long j = i + 1; j < n; j++) dependent++;  // 內層從 i + 1 開始
            System.out.println("n=" + n + ": sequential " + sequential + " (2n = " + 2 * n + "), nested " + nested
                    + " (n^2 = " + n * n + "), dependent " + dependent + " (n(n-1)/2 = " + n * (n - 1) / 2 + ")");
        }
    }
}`,
      },
    },
    {
      id: 'halving-count', title: '減半迴圈的輪數與 ⌈log₂ n⌉',
      description: '每一輪把剩下的範圍減半，而且最壞時留下的是較大的一半，數出幾輪後只剩 1 個；再用整數算出 ⌈log₂ n⌉ 對照。',
      output: 'n=1: steps=0 ceil_log2=0\nn=2: steps=1 ceil_log2=1\nn=3: steps=2 ceil_log2=2\nn=8: steps=3 ceil_log2=3\nn=9: steps=4 ceil_log2=4\nn=1000: steps=10 ceil_log2=10\nn=1000000: steps=20 ceil_log2=20\nn=1000000000: steps=30 ceil_log2=30',
      code: {
        'C++': code`#include <iostream>

int main() {
    const long long sizes[] = {1, 2, 3, 8, 9, 1000, 1000000, 1000000000};
    for (long long n : sizes) {
        long long remaining = n, steps = 0;
        while (remaining > 1) {
            remaining = (remaining + 1) / 2;  // 最壞情況：留下較大的一半
            steps++;
        }
        long long k = 0, power = 1;
        while (power < n) {  // 最小的 k 使 2^k >= n，就是 ceil(log2 n)
            power *= 2;
            k++;
        }
        std::cout << "n=" << n << ": steps=" << steps << " ceil_log2=" << k << "\n";
    }
    return 0;
}`,
        Python: code`for n in [1, 2, 3, 8, 9, 1000, 10**6, 10**9]:
    remaining, steps = n, 0
    while remaining > 1:
        remaining = (remaining + 1) // 2  # 最壞情況：留下較大的一半
        steps += 1
    k, power = 0, 1
    while power < n:  # 最小的 k 使 2**k >= n，就是 ceil(log2 n)
        power *= 2
        k += 1
    print(f"n={n}: steps={steps} ceil_log2={k}")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        long[] sizes = {1, 2, 3, 8, 9, 1000, 1000000, 1000000000};
        for (long n : sizes) {
            long remaining = n, steps = 0;
            while (remaining > 1) {
                remaining = (remaining + 1) / 2;  // 最壞情況：留下較大的一半
                steps++;
            }
            long k = 0, power = 1;
            while (power < n) {  // 最小的 k 使 2^k >= n，就是 ceil(log2 n)
                power *= 2;
                k++;
            }
            System.out.println("n=" + n + ": steps=" + steps + " ceil_log2=" + k);
        }
    }
}`,
      },
    },
    {
      id: 'front-insert', title: '插在最前面 vs. 接在尾端再反轉',
      description: '兩種方法都把 0、1、…、n − 1 存成倒序；數出「插在最前面」要移動幾個元素、「接在尾端再反轉」要交換幾次，並確認兩者結果相同。',
      output: 'n=10: insert-front moves=45, append+reverse swaps=5, same=yes\nn=100: insert-front moves=4950, append+reverse swaps=50, same=yes\nn=1000: insert-front moves=499500, append+reverse swaps=500, same=yes',
      code: {
        'C++': code`#include <iostream>
#include <utility>
#include <vector>

int main() {
    const int sizes[] = {10, 100, 1000};
    for (int n : sizes) {
        std::vector<int> front;
        long long moves = 0;
        for (int x = 0; x < n; ++x) {
            moves += static_cast<long long>(front.size());  // 每個舊元素都要往後移一格
            front.insert(front.begin(), x);
        }
        std::vector<int> back;
        for (int x = 0; x < n; ++x) back.push_back(x);  // 接在尾端：攤銷 O(1)
        long long swaps = 0;
        for (int i = 0, j = n - 1; i < j; ++i, --j) {
            std::swap(back[i], back[j]);
            swaps++;
        }
        std::cout << "n=" << n << ": insert-front moves=" << moves << ", append+reverse swaps=" << swaps
                  << ", same=" << (front == back ? "yes" : "no") << "\n";
    }
    return 0;
}`,
        Python: code`for n in [10, 100, 1000]:
    front = []
    moves = 0
    for x in range(n):
        moves += len(front)  # 每個舊元素都要往後移一格
        front.insert(0, x)
    back = []
    for x in range(n):
        back.append(x)  # 接在尾端：攤銷 O(1)
    swaps = 0
    i, j = 0, n - 1
    while i < j:
        back[i], back[j] = back[j], back[i]
        swaps += 1
        i, j = i + 1, j - 1
    print(f"n={n}: insert-front moves={moves}, append+reverse swaps={swaps}, same={'yes' if front == back else 'no'}")`,
        Java: code`import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        int[] sizes = {10, 100, 1000};
        for (int n : sizes) {
            ArrayList<Integer> front = new ArrayList<>();
            long moves = 0;
            for (int x = 0; x < n; x++) {
                moves += front.size();  // 每個舊元素都要往後移一格
                front.add(0, x);
            }
            ArrayList<Integer> back = new ArrayList<>();
            for (int x = 0; x < n; x++) back.add(x);  // 接在尾端：攤銷 O(1)
            long swaps = 0;
            for (int i = 0, j = n - 1; i < j; i++, j--) {
                Integer tmp = back.get(i);
                back.set(i, back.get(j));
                back.set(j, tmp);
                swaps++;
            }
            System.out.println("n=" + n + ": insert-front moves=" + moves + ", append+reverse swaps=" + swaps
                    + ", same=" + (front.equals(back) ? "yes" : "no"));
        }
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'complexity', title: '本課各種做法的操作次數（示意模型）', min: 1, max: 200000, initial: 1000,
    models: [
      { model: '1', example: '練習的每一步：查雜湊表裡有幾個 K − x（平均）' },
      { model: 'log n', example: '`halving-count`：每次保留較大的一半' },
      { model: 'n', example: '`search-cases`：線性搜尋的最差情況' },
      { model: 'n log n', example: '先排序再處理（函式庫排序）' },
      { model: 'n^2', example: '`loop-counts` 的巢狀迴圈；練習的暴力解' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面這段程式的時間複雜度是？（n ≥ 1）',
      code: { language: 'C++', text: 'long long count = 0;\nfor (long long i = 1; i < n; i *= 2)\n    for (long long j = 0; j < i; j++)\n        count++;' },
      options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'],
      answer: 1, explanation: '外層 i 依序是 1、2、4、…，內層跑 i 次，總和 1 + 2 + 4 + … 是一個等比數列，小於最後一項的 2 倍，也就小於 2n，所以是 O(n)。例如 n = 1000 時 count = 1023，n = 10⁶ 時 count = 1048575。O(n log n) 是「外層 log n 輪 × 內層最多 n 次」的上界，沒有錯但不夠緊；O(log n) 只算了外層輪數；O(n²) 是看到兩層迴圈就下結論。',
    },
    {
      id: 'q2', prompt: '下面這段程式中 n 與 m 是兩個獨立的輸入大小。它的時間複雜度是？',
      code: { language: 'Python', text: 'for i in range(n):\n    total += a[i]\nfor j in range(m):\n    for k in range(m):\n        if b[j] == b[k]:\n            same += 1' },
      options: ['O(n·m²)', 'O(n + m²)', 'O(n²)', 'O(m²)'],
      answer: 1, explanation: '兩段依序執行，次數相加：第一段 n 次，第二段 m × m 次，共 n + m² 次，所以是 O(n + m²)。O(n·m²) 把依序誤當成巢狀；O(n²) 把兩個變數混為一談；O(m²) 偷偷假設 n ≤ m²——n 可能遠大於 m²（例如 n = 10⁶、m = 10），這時第一段才是主要成本，兩個獨立的參數都要保留。',
    },
    {
      id: 'q3', prompt: '這個線性搜尋從陣列尾端往前找。程式的輸出是？',
      code: { language: 'Python', text: 'def find(a, t):\n    steps = 0\n    for i in range(len(a) - 1, -1, -1):\n        steps += 1\n        if a[i] == t:\n            return steps\n    return steps\n\na = [4, 8, 4, 2, 9]\nprint(find(a, 4), find(a, 9), find(a, 7))' },
      options: ['1 5 5', '3 1 5', '1 1 5', '3 5 5'],
      answer: 1, explanation: '從尾端找，先比較 a[4] = 9，所以找 9 是最佳情況，1 次；找 4 時依序比較 9、2、4，第 3 次在索引 2 找到（不是索引 0 那個 4）；找不存在的 7 要把 5 個都比完，是最差情況。哪個輸入是最佳、最差，取決於演算法怎麼走，而不是值本身：同樣的陣列從頭找時，9 反而是最差的已存在目標。選 1 5 5 是誤以為仍從頭找。',
    },
    {
      id: 'q4', prompt: '題目有 n ≤ 2 × 10⁵ 個整數與 q ≤ 2 × 10⁵ 次查詢，每次問「有幾個數 ≤ x」。下列哪個做法最合適？',
      options: ['每次查詢都掃一遍陣列計數：O(n·q)', '先排序一次，每次查詢用二分搜尋找位置：O((n + q) log n)', '每次查詢前先排序，再從頭數：O(q·n log n)', '枚舉所有子集，找出和查詢相符的：O(2ⁿ)'],
      answer: 1, explanation: '代入上限：O(n·q) 是 4 × 10¹⁰，以每秒約 10⁸ 次估計要好幾百秒；每次都重新排序更糟，約 7 × 10¹¹；O(2ⁿ) 只適合 n ≤ 20 左右。先排序（約 3.5 × 10⁶）再每次 O(log n)（約 18 次比較），總共不到 10⁷，綽綽有餘。這就是從資料範圍反推：n、q 到 2 × 10⁵，就不能接受 n × q。',
    },
    {
      id: 'q5', prompt: '這段 Java 程式把 n 個數各印一行，答案正確，但 n = 2 × 10⁵ 時超時。最主要的原因是？',
      code: { language: 'Java', text: 'String out = "";\nfor (int i = 0; i < n; i++) {\n    out += a[i] + "\\n";\n}\nSystem.out.print(out);' },
      options: ['`System.out.print` 太慢', '`out += ...` 每次都複製整個字串，總共要複製 O(n²) 個字元', '`for` 迴圈本身是 O(n²)', '把 `a[i]` 轉成字串要 O(n)'],
      answer: 1, explanation: 'Java 的 `String` 不可變，`out += x` 會建立一個新字串，把舊的內容整份複製過去再接上 x。第 i 次複製的長度與 i 成正比，總共 1 + 2 + … + n 份，是 O(n²) 個字元。改用 `StringBuilder` 的 `append`，每次是攤銷 O(1)，整體 O(n)。這裡只呼叫一次 `print`，不是瓶頸；迴圈只跑 n 次；把一個整數轉成字串只和它的位數有關，與 n 無關。',
    },
    {
      id: 'q6', prompt: '演算法 A 約做 50·n·log₂ n 次運算，演算法 B 約做 n²/2 次。分別在 n = 64 與 n = 10⁵ 時，哪個做的運算比較少？',
      options: ['n = 64 時 A 較少；n = 10⁵ 時 A 較少', 'n = 64 時 B 較少；n = 10⁵ 時 A 較少', '兩種 n 都是 B 較少', 'n = 64 時 A 較少；n = 10⁵ 時 B 較少'],
      answer: 1, explanation: 'n = 64：A = 50 × 64 × 6 = 19,200，B = 64² / 2 = 2,048，B 少了將近 10 倍，常數 50 在小 n 時很吃虧。n = 10⁵：A ≈ 50 × 10⁵ × 16.6 ≈ 8.3 × 10⁷，B = 5 × 10⁹，A 少了約 60 倍。所以「O(n log n) 一定比 O(n²) 快」只在 n 夠大時成立；兩者的交叉點大約在 n ≈ 1000（n ≥ 997 起 A 較少）。資料很小時，簡單的 O(n²) 做法可能更好。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '和為 K 的配對數（n ≤ 2 × 10⁵）',
      statement: '給定 n 個整數與目標 K，計算有多少對索引 i < j 滿足 a[i] + a[j] = K。這是 F19 練習的同一題，但 n 最大到 2 × 10⁵：先估計兩層迴圈要做多少次比較，確認它太慢，再設計平均 O(n) 或 O(n log n) 的做法，並在程式開頭寫下你的複雜度分析。輸入必須完全合法才計算：第一個記號是 n、第二個是 K，之後恰好有 n 個值；每個記號都必須是「可選的負號 `-` 加上 1～10 位數字」（不接受 `+5`、`2.5`、`x` 之類）。若 n 不在 1～200000、K 的絕對值超過 2 × 10⁹、任一值的絕對值超過 10⁹、值的個數不是 n，或有任何記號不是這種整數，只輸出一行 `Invalid`。',
      inputFormat: '第一行兩個整數 n 與 K；第二行 n 個整數 a[0] … a[n − 1]。（以空白或換行分隔即可。）',
      outputFormat: '輸入合法時輸出一個整數：配對的數量；否則輸出 `Invalid`。',
      constraints: ['合法輸入時 1 ≤ n ≤ 2 × 10⁵', '|a[i]| ≤ 10⁹，|K| ≤ 2 × 10⁹：兩數之和與 K − a[i] 都可能超過 32 位元整數', '答案最多 n(n − 1)/2 ≈ 2 × 10¹⁰，也超過 32 位元', '兩層迴圈要約 2 × 10¹⁰ 次比較，太慢'],
      samples: [{ kind: 'normal', input: '5 6\n1 5 3 3 2', output: '2', note: '(1, 5) 與 (3, 3)' }],
      tests: [
        { kind: 'normal', input: '5 6\n1 5 3 3 2', output: '2', note: '一般情況：(1, 5) 與 (3, 3)' },
        { kind: 'normal', input: '6 0\n-3 3 -3 3 0 0', output: '5', note: '含負數與重複：兩個 -3 與兩個 3 配出 4 對，兩個 0 配出 1 對' },
        { kind: 'normal', input: '3 6\n3 1 5', output: '1', note: '3 + 3 = 6，但只有一個 3，不能和自己配對；只有 (1, 5)' },
        { kind: 'normal', input: medium, output: '18978', note: '2000 個 −50～50 的數（固定的偽隨機序列），答案由暴力解算出' },
        { kind: 'edge', input: '1 2\n1', output: '0', note: 'n = 1：沒有任何配對' },
        { kind: 'edge', input: '2 6\n3 3', output: '1', note: '最小的成功配對：兩個相同的數' },
        { kind: 'edge', input: '4 4\n2 2 2 2', output: '6', note: '全部相同：4 個數兩兩配對共 6 對，先查再加入才不會重複或自配' },
        { kind: 'edge', input: '2 2000000000\n1000000000 1000000000', output: '1', note: '兩數之和為 2 × 10⁹，超過 32 位元 int 的上限' },
        { kind: 'edge', input: '3 -2000000000\n-1000000000 1000000000 -1000000000', output: '1', note: '負方向的極端值；K − a[i] 可達 −3 × 10⁹' },
        { kind: 'edge', input: allEqual, output: '19999900000', note: '最大規模 n = 2 × 10⁵、全部是 0：答案 n(n − 1)/2 約 2 × 10¹⁰，計數器必須是 64 位元' },
        { kind: 'error', input: '0 5', output: 'Invalid', note: 'n = 0 不在範圍內' },
        { kind: 'error', input: '200001 0', output: 'Invalid', note: 'n 超過 2 × 10⁵' },
        { kind: 'error', input: '3 4\n1 2 x', output: 'Invalid', note: '有不是整數的記號' },
        { kind: 'error', input: '2 4\n1 2.5', output: 'Invalid', note: '小數不是整數' },
        { kind: 'error', input: '2 4\n+1 3', output: 'Invalid', note: '`+1` 不符合格式：Python 的 `int()` 與 Java 的 `Long.parseLong` 都會接受它，所以要自己檢查' },
        { kind: 'error', input: '3 4\n1 2', output: 'Invalid', note: '值少了一個' },
        { kind: 'error', input: '2 3\n1 2 3', output: 'Invalid', note: '值多了一個' },
        { kind: 'error', input: '2 0\n1000000001 -1', output: 'Invalid', note: '值的絕對值超過 10⁹' },
        { kind: 'error', input: '', output: 'Invalid', note: '空的輸入' },
      ],
      hints: [
        '先估計：n = 2 × 10⁵ 時兩層迴圈要 n(n − 1)/2 ≈ 2 × 10¹⁰ 次比較，以每秒約 10⁸ 次估計要好幾百秒。',
        '由左往右掃：處理 a[j] 時，和它配對的 i < j 就是「前面出現過幾個 K − a[j]」。用雜湊表（D10）記錄每個值出現過幾次，先查、再把 a[j] 加進去，就不會自己配自己，也不會重複計算。',
        '計數器、K − a[j] 都用 64 位元整數（C++ `long long`、Java `long`；Python 的整數不會溢位）。',
        '另一種保證 O(n log n) 的做法是先排序，A08 的雙指標會教如何在排序後的陣列上找配對。',
      ],
      solution: {
        'C++': code`// 時間：讀入 O(n)，配對計數平均 O(n)（雜湊表）；空間 O(n)
// 兩層迴圈要 n(n-1)/2 ≈ 2×10^10 次比較，n ≤ 2×10^5 時太慢
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>

// 嚴格解析：可選的負號加上 1～10 位數字，且絕對值不超過 limit
bool parseInt(const std::string& s, long long limit, long long& out) {
    std::size_t i = (s[0] == '-') ? 1 : 0;
    if (i == s.size() || s.size() - i > 10) return false;
    long long v = 0;
    for (; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9') return false;
        v = v * 10 + (s[i] - '0');
    }
    if (s[0] == '-') v = -v;
    if (v < -limit || v > limit) return false;
    out = v;
    return true;
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    std::vector<std::string> t;
    std::string s;
    while (std::cin >> s) t.push_back(s);
    long long n = 0, k = 0;
    if (t.size() < 2 || !parseInt(t[0], 200000, n) || n < 1 || !parseInt(t[1], 2000000000, k)
        || static_cast<long long>(t.size()) != 2 + n) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<long long> a(n);
    for (long long i = 0; i < n; ++i) {
        if (!parseInt(t[2 + i], 1000000000, a[i])) {
            std::cout << "Invalid\n";
            return 0;
        }
    }
    std::unordered_map<long long, long long> seen;  // 值 -> 目前為止出現的次數
    seen.reserve(2 * n);
    long long pairs = 0;  // 最多約 2×10^10，必須是 64 位元
    for (long long x : a) {
        auto it = seen.find(k - x);  // 先查：和前面的數配對
        if (it != seen.end()) pairs += it->second;
        seen[x]++;  // 再加入：不會自己配自己
    }
    std::cout << pairs << "\n";
    return 0;
}`,
        Python: code`# 時間：讀入 O(n)，配對計數平均 O(n)（dict）；空間 O(n)
# 兩層迴圈要 n(n-1)/2 ≈ 2×10^10 次比較，n ≤ 2×10^5 時太慢
import re
import sys

INT = re.compile(r"-?[0-9]{1,10}")


def parse(tok, limit):
    """嚴格解析：可選的負號加上 1～10 位數字，且絕對值不超過 limit；不合法回傳 None。"""
    if INT.fullmatch(tok) is None:
        return None
    v = int(tok)
    return v if -limit <= v <= limit else None


def main():
    t = sys.stdin.read().split()
    n = parse(t[0], 200000) if len(t) >= 2 else None
    k = parse(t[1], 2000000000) if len(t) >= 2 else None
    if n is None or n < 1 or k is None or len(t) != 2 + n:
        print("Invalid")
        return
    a = [parse(x, 1000000000) for x in t[2:]]
    if any(v is None for v in a):
        print("Invalid")
        return
    seen = {}  # 值 -> 目前為止出現的次數
    pairs = 0  # Python 的整數不會溢位
    for x in a:
        pairs += seen.get(k - x, 0)  # 先查：和前面的數配對
        seen[x] = seen.get(x, 0) + 1  # 再加入：不會自己配自己
    print(pairs)


main()`,
        Java: code`// 時間：讀入 O(n)，配對計數平均 O(n)（HashMap）；空間 O(n)
// 兩層迴圈要 n(n-1)/2 ≈ 2×10^10 次比較，n ≤ 2×10^5 時太慢
import java.io.IOException;
import java.util.HashMap;

public class Main {
    // 嚴格解析：可選的負號加上 1～10 位數字，且絕對值不超過 limit；不合法回傳 null
    static Long parse(String s, long limit) {
        int i = s.charAt(0) == '-' ? 1 : 0;
        if (i == s.length() || s.length() - i > 10) return null;
        long v = 0;
        for (; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') return null;
            v = v * 10 + (c - '0');
        }
        if (s.charAt(0) == '-') v = -v;
        if (v < -limit || v > limit) return null;
        return v;
    }

    public static void main(String[] args) throws IOException {
        String text = new String(System.in.readAllBytes()).trim();
        String[] t = text.isEmpty() ? new String[0] : text.split("\\s+");
        Long n = t.length >= 2 ? parse(t[0], 200000) : null;
        Long k = t.length >= 2 ? parse(t[1], 2000000000L) : null;
        if (n == null || n < 1 || k == null || t.length != 2 + n) {
            System.out.println("Invalid");
            return;
        }
        long[] a = new long[t.length - 2];
        for (int i = 0; i < a.length; i++) {
            Long v = parse(t[2 + i], 1000000000L);
            if (v == null) {
                System.out.println("Invalid");
                return;
            }
            a[i] = v;
        }
        HashMap<Long, Long> seen = new HashMap<>();  // 值 -> 目前為止出現的次數
        long pairs = 0;  // 最多約 2×10^10，必須是 long
        for (long x : a) {
            pairs += seen.getOrDefault(k - x, 0L);  // 先查：和前面的數配對
            seen.merge(x, 1L, Long::sum);  // 再加入：不會自己配自己
        }
        System.out.println(pairs);
    }
}`,
      },
      judge: 'none',
    },
  ],
};
