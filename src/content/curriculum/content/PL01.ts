import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL01 程式設計典範. Every example and the reference solutions run in tests/curriculum-code.test.ts (C++17, Java 17,
 * Python 3, Node.js). The four examples solve the same task (the sum of the squares of the even numbers in 3 8 5 2 6)
 * in the imperative, procedural, object-oriented and functional styles; the logic paradigm (Prolog) and SQL are shown
 * in the prose only, since the lesson's runnable languages do not include them.
 */
export const PL01: LessonContent = {
  lessonId: 'PL01',
  motivation: '同一個問題可以用好幾種「想法」寫成程式：一步一步改變變數、把資料和操作包成物件、或把資料流經一串轉換。認得這些典範，就看得懂別人為什麼這樣寫、能把冗長的迴圈改寫成更清楚的形式，也能在不同語言之間轉換思路，而不是只會逐行翻譯。',
  sections: [
    {
      id: 'what-is-paradigm', title: '什麼是程式設計典範',
      blocks: [
        { type: 'p', text: '程式設計典範（programming paradigm）是「用什麼方式思考與組織程式」的風格。它不是某個語言的語法，而是一組習慣：程式的基本單位是什麼（敘述、函式、物件、規則）、狀態放在哪裡、怎麼描述計算。本課用同一個小任務貫穿：算出 `3 8 5 2 6` 之中偶數的平方和，答案是 8² + 2² + 6² = 64 + 4 + 36 = 104。' },
        { type: 'table', head: ['典範', '核心想法', '程式的樣子', '代表語言或工具'], rows: [
          ['命令式（imperative）', '告訴電腦「怎麼做」：一連串會改變狀態的指令', '變數、指定、迴圈、if', 'C、組合語言，以及幾乎所有語言'],
          ['程序式（procedural）', '命令式的一種：把步驟包成有名字的程序（函式）', '函式呼叫、參數、回傳值', 'C、Pascal、F13 學過的函式'],
          ['物件導向（object-oriented）', '把資料與操作它的方法包在物件裡，物件各自保存狀態', '類別、物件、方法', 'Java、C++、Python、JavaScript'],
          ['函數式（functional）', '用函式把輸入轉成輸出，避免修改既有資料', 'map、filter、reduce、lambda', 'Haskell、各語言的 lambda 與串流'],
          ['宣告式（declarative）', '描述「要什麼結果」，由系統決定怎麼做', '查詢、規則、轉換式', 'SQL、HTML、正規表示式'],
          ['邏輯式（logic）', '寫下事實與規則，讓系統推理出答案', '事實、規則、查詢', 'Prolog'],
        ] },
        { type: 'p', text: '這些典範可以分成兩大類：命令式一族（程序式、物件導向都在這一族，程式描述「怎麼做」的步驟）與宣告式一族（函數式、邏輯式與 SQL 屬於這一族，程式描述「要什麼」）。分類不是絕對的：一個 Java 程式可能同時有類別、迴圈與 stream，重點是能說出每一段用的是哪種想法。' },
      ],
    },
    {
      id: 'imperative-procedural', title: '命令式與程序式：一步一步改變狀態',
      blocks: [
        { type: 'p', text: '命令式程式是一串依序執行的指令，每一步都可能改變變數的值，也就是程式的狀態（state）。要算偶數平方和，就準備一個 `total`，走過每個數字，是偶數就把它的平方加進去。下面的程式每改變一次 total 就印出來，可以看到狀態一步步變化。' },
        { type: 'example', id: 'loop-total' },
        { type: 'p', text: '下方的視覺化逐行追蹤這個迴圈：注意 `x` 與 `total` 在每一步都被改寫，要知道最後的答案，必須在腦中模擬整個過程。這正是命令式的優點（每一步都看得到、容易對應到電腦實際的運作）也是缺點（狀態一多就難追蹤）。' },
        { type: 'p', text: '程序式把一段命令式步驟包成有名字的函式：主程式只寫「對這份資料算偶數平方和」，細節藏在函式裡，而且可以對不同的資料重複使用。函式裡面仍然是迴圈與可變的區域變數，所以程序式是命令式的一種組織方式，不是相反的東西。' },
        { type: 'example', id: 'procedure' },
      ],
    },
    {
      id: 'object-oriented', title: '物件導向：資料和操作放在一起',
      blocks: [
        { type: 'p', text: '物件導向（object-oriented programming，OOP）把「狀態」和「能改變它的操作」綁在一起成為物件（object）。類別（class）是物件的設計圖：下面的 `EvenSquareSum` 有一個私有的累計值，外界只能透過 `add` 加入數字、透過 `total`（Java 寫 `getTotal`）讀出結果，不能直接把累計值改壞，這稱為封裝（encapsulation）。' },
        { type: 'example', id: 'object-style' },
        { type: 'p', text: '同一個類別可以建立許多物件，每個物件有自己的一份狀態：a 收到五個數字得到 104，b 只收到 4 得到 16，互不干擾。物件導向適合「有很多個、各自有狀態、會持續被操作」的東西，例如帳戶、遊戲角色、視窗；只算一次總和時，它反而比一個函式囉嗦。類別、介面與多型會在 PL02 詳細介紹。' },
        { type: 'list', items: [
          'C++：`class` 中用 `private:` 隱藏資料成員，方法加 `const` 表示不會修改物件。',
          'Java：所有程式都寫在類別裡；這裡用 `static class` 把小類別放在 Main 裡面，欄位用 `private`。',
          'Python：`class` 搭配 `__init__` 建立屬性，方法的第一個參數是 `self`；底線開頭的 `_total` 是「請勿直接修改」的慣例，不是強制的。',
          'JavaScript：`class` 語法，`#total` 是真正的私有欄位，`get total()` 讓讀取寫起來像屬性。',
        ] },
      ],
    },
    {
      id: 'functional-declarative', title: '函數式與宣告式：描述要什麼',
      blocks: [
        { type: 'p', text: '函數式（functional）風格把資料交給一連串函式轉換，每一步產生新的資料，不修改舊的：先過濾（filter）出偶數，再把每個數映射（map）成平方，最後歸約（reduce）成一個總和。傳給 filter 和 map 的小函式通常用 lambda（匿名函式）寫在原地。' },
        { type: 'example', id: 'pipeline' },
        { type: 'table', head: ['步驟', 'C++17', 'Java', 'Python', 'JavaScript'], rows: [
          ['過濾', '`std::copy_if`', '`.filter(...)`', '`[... for x in nums if 條件]` 或 `filter`', '`.filter(...)`'],
          ['映射', '`std::transform`', '`.map(...)`', '`[x * x for ...]` 或 `map`', '`.map(...)`'],
          ['歸約', '`std::accumulate`', '`.reduce(0, Integer::sum)` 或 `.sum()`', '`sum(...)` 或 `functools.reduce`', '`.reduce((a, b) => a + b, 0)`'],
        ] },
        { type: 'p', text: '和迴圈版本比較：管線（pipeline）版沒有一個在迴圈中被反覆改寫的 total，讀程式的人只要看「過濾偶數、平方、加總」三個詞就知道結果，不必模擬每一輪。這就是宣告式（declarative）寫法的精神：描述要什麼，而不是怎麼做。代價是每一步可能產生一份新的資料，而且除錯時看不到「第幾輪出了錯」。Python 的串列推導式 `[x * x for x in nums if x % 2 == 0]` 一次寫出 filter 與 map，是 Python 最慣用的寫法。' },
        { type: 'callout', tone: 'warning', title: 'reduce 要給初始值，lambda 裡不要改外面的變數', text: '對空的資料做沒有初始值的 reduce 會出錯：JavaScript 的 `[].reduce((a, b) => a + b)` 丟出 `TypeError: Reduce of empty array with no initial value`，Python 的 `functools.reduce` 也丟出 TypeError；寫成 `reduce(..., 0)` 才會得到 0。另一個常見錯誤是在 lambda 裡累加外面的變數，例如 Java 的 `list.forEach(x -> total += x)` 無法編譯（lambda 用到的區域變數必須是 effectively final）；就算 JavaScript 允許，這也只是把迴圈換個寫法，失去函數式「不改狀態」的好處。要總和就用 reduce 或 sum。' },
        { type: 'p', text: '宣告式不只有函數式。SQL 是最常見的宣告式語言：`SELECT SUM(x * x) FROM nums WHERE x % 2 = 0;` 只說要哪些資料、怎麼彙總，資料庫自己決定掃描順序與索引（見資料庫島）。邏輯式（logic programming）更進一步，程式只有事實與規則，由系統搜尋符合的答案，例如 Prolog：' },
        { type: 'list', items: [
          '事實：`parent(tom, bob).` 與 `parent(bob, ann).`（tom 是 bob 的父母、bob 是 ann 的父母）。',
          '規則：`grandparent(X, Z) :- parent(X, Y), parent(Y, Z).`（若 X 是 Y 的父母、Y 是 Z 的父母，則 X 是 Z 的祖父母）。',
          '查詢：`?- grandparent(tom, Who).`，系統推理出 `Who = ann`。程式中沒有任何迴圈或指定，怎麼搜尋完全交給 Prolog。',
        ] },
      ],
    },
    {
      id: 'multi-paradigm', title: '多典範語言與如何選擇',
      blocks: [
        { type: 'p', text: '本課的四種語言都是多典範語言（multi-paradigm language）：同一個語言支援好幾種典範，由寫程式的人依問題選擇。差別在於各語言預設的重心與提供的工具：' },
        { type: 'table', head: ['語言', '命令式／程序式', '物件導向', '函數式', '說明'], rows: [
          ['C++', '支援（從 C 繼承）', '支援：class、繼承、虛擬函式', '部分：lambda、`<algorithm>`、`<numeric>`', '也有泛型程式設計（template）；可以完全不用類別'],
          ['Java', '支援，但寫在方法裡', '核心：所有程式都在類別中', 'Java 8 起：lambda 與 Stream API', '最以物件導向為中心的一個'],
          ['Python', '支援：頂層就能寫敘述與函式', '支援：class，一切值都是物件', '支援：lambda、推導式、`map`／`filter`、functools', '腳本常用程序式，套件常用物件導向'],
          ['JavaScript', '支援', '支援：原型（prototype）與 class 語法', '核心：函式是一級值，陣列有 map／filter／reduce', '網頁事件處理大量使用回呼函式'],
        ] },
        { type: 'p', text: '選擇風格時可以問三個問題。第一，有沒有需要長期保存、被許多操作改變的狀態？有的話用物件把它封裝起來。第二，是不是「一批資料經過幾個轉換變成結果」？是的話用 filter／map／reduce 或推導式，最容易讀。第三，步驟之間是否有複雜的提前結束、計數器或多個互相影響的變數？這時一個清楚的迴圈常常比硬擠成一行的管線好懂。' },
        { type: 'callout', tone: 'note', title: '沒有哪一種典範永遠最好', text: '宣告式寫法減少可變狀態，較不容易在某一輪把變數改錯，也較容易平行處理；命令式寫法讓每一步的成本與順序一目了然，效能調整和除錯比較直接。實務上常混合：用物件組織程式的大結構，在方法裡用管線處理資料，在效能關鍵處寫迴圈。' },
      ],
    },
  ],
  examples: [
    {
      id: 'loop-total', title: '命令式：用迴圈改變 total', description: '走過每個數字，是偶數就把平方加進 total，每次改變都印出來。',
      output: 'total = 64\ntotal = 68\ntotal = 104',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    std::vector<int> nums = {3, 8, 5, 2, 6};
    int total = 0;
    for (std::size_t i = 0; i < nums.size(); ++i) {
        if (nums[i] % 2 == 0) {
            total += nums[i] * nums[i];
            std::cout << "total = " << total << "\n";
        }
    }
    return 0;
}`,
        Python: code`nums = [3, 8, 5, 2, 6]
total = 0
for x in nums:
    if x % 2 == 0:
        total += x * x
        print(f"total = {total}")`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int[] nums = {3, 8, 5, 2, 6};
        int total = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] % 2 == 0) {
                total += nums[i] * nums[i];
                System.out.println("total = " + total);
            }
        }
    }
}`,
        JavaScript: code`const nums = [3, 8, 5, 2, 6];
let total = 0;
for (let i = 0; i < nums.length; i++) {
    if (nums[i] % 2 === 0) {
        total += nums[i] * nums[i];
        console.log("total = " + total);
    }
}`,
      },
    },
    {
      id: 'procedure', title: '程序式：包成可重用的函式', description: '同樣的迴圈放進 sumEvenSquares，主程式對兩份資料各呼叫一次。',
      output: '104\n116',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int sumEvenSquares(const std::vector<int>& nums) {
    int total = 0;
    for (int x : nums) {
        if (x % 2 == 0) total += x * x;
    }
    return total;
}

int main() {
    std::cout << sumEvenSquares({3, 8, 5, 2, 6}) << "\n";
    std::cout << sumEvenSquares({1, 4, 7, 10}) << "\n";
    return 0;
}`,
        Python: code`def sum_even_squares(nums):
    total = 0
    for x in nums:
        if x % 2 == 0:
            total += x * x
    return total


print(sum_even_squares([3, 8, 5, 2, 6]))
print(sum_even_squares([1, 4, 7, 10]))`,
        Java: code`public class Main {
    static int sumEvenSquares(int[] nums) {
        int total = 0;
        for (int x : nums) {
            if (x % 2 == 0) total += x * x;
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(sumEvenSquares(new int[] {3, 8, 5, 2, 6}));
        System.out.println(sumEvenSquares(new int[] {1, 4, 7, 10}));
    }
}`,
        JavaScript: code`function sumEvenSquares(nums) {
    let total = 0;
    for (const x of nums) {
        if (x % 2 === 0) total += x * x;
    }
    return total;
}

console.log(sumEvenSquares([3, 8, 5, 2, 6]));
console.log(sumEvenSquares([1, 4, 7, 10]));`,
      },
    },
    {
      id: 'object-style', title: '物件導向：每個物件保存自己的總和', description: 'EvenSquareSum 物件封裝累計值；a 與 b 是兩個獨立的物件。',
      output: '104 16',
      code: {
        'C++': code`#include <iostream>

class EvenSquareSum {
public:
    void add(int x) {
        if (x % 2 == 0) total_ += x * x;
    }
    int total() const { return total_; }

private:
    int total_ = 0;
};

int main() {
    EvenSquareSum a, b;
    for (int x : {3, 8, 5, 2, 6}) a.add(x);
    b.add(4);
    std::cout << a.total() << " " << b.total() << "\n";
    return 0;
}`,
        Python: code`class EvenSquareSum:
    def __init__(self):
        self._total = 0

    def add(self, x):
        if x % 2 == 0:
            self._total += x * x

    def total(self):
        return self._total


a, b = EvenSquareSum(), EvenSquareSum()
for x in [3, 8, 5, 2, 6]:
    a.add(x)
b.add(4)
print(a.total(), b.total())`,
        Java: code`public class Main {
    static class EvenSquareSum {
        private int total = 0;

        void add(int x) {
            if (x % 2 == 0) total += x * x;
        }

        int getTotal() {
            return total;
        }
    }

    public static void main(String[] args) {
        EvenSquareSum a = new EvenSquareSum();
        EvenSquareSum b = new EvenSquareSum();
        for (int x : new int[] {3, 8, 5, 2, 6}) a.add(x);
        b.add(4);
        System.out.println(a.getTotal() + " " + b.getTotal());
    }
}`,
        JavaScript: code`class EvenSquareSum {
    #total = 0;

    add(x) {
        if (x % 2 === 0) this.#total += x * x;
    }

    get total() {
        return this.#total;
    }
}

const a = new EvenSquareSum();
const b = new EvenSquareSum();
for (const x of [3, 8, 5, 2, 6]) a.add(x);
b.add(4);
console.log(a.total + " " + b.total);`,
      },
    },
    {
      id: 'pipeline', title: '函數式：filter、map、reduce', description: '不修改任何變數：過濾出偶數、映射成平方、歸約成總和。',
      output: '64 4 36\n104',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <iterator>
#include <numeric>
#include <vector>

int main() {
    const std::vector<int> nums = {3, 8, 5, 2, 6};
    std::vector<int> evens, squares;
    std::copy_if(nums.begin(), nums.end(), std::back_inserter(evens), [](int x) { return x % 2 == 0; });
    std::transform(evens.begin(), evens.end(), std::back_inserter(squares), [](int x) { return x * x; });
    const int total = std::accumulate(squares.begin(), squares.end(), 0);
    for (std::size_t i = 0; i < squares.size(); ++i) {
        std::cout << squares[i] << (i + 1 < squares.size() ? " " : "\n");
    }
    std::cout << total << "\n";
    return 0;
}`,
        Python: code`nums = [3, 8, 5, 2, 6]
squares = [x * x for x in nums if x % 2 == 0]  # if 是 filter，x * x 是 map
total = sum(squares)                            # sum 是最常用的 reduce
print(*squares)
print(total)`,
        Java: code`import java.util.List;
import java.util.stream.Collectors;

public class Main {
    public static void main(String[] args) {
        List<Integer> nums = List.of(3, 8, 5, 2, 6);
        List<Integer> squares = nums.stream()
                .filter(x -> x % 2 == 0)
                .map(x -> x * x)
                .toList();
        int total = squares.stream().reduce(0, Integer::sum);
        System.out.println(squares.stream().map(String::valueOf).collect(Collectors.joining(" ")));
        System.out.println(total);
    }
}`,
        JavaScript: code`const nums = [3, 8, 5, 2, 6];
const squares = nums
    .filter(x => x % 2 === 0)
    .map(x => x * x);
const total = squares.reduce((sum, x) => sum + x, 0);
console.log(squares.join(" "));
console.log(total);`,
      },
    },
  ],
  visualization: {
    kind: 'variable-state', title: '逐步執行：命令式的偶數平方和', language: 'Python',
    code: code`nums = [3, 8, 5, 2, 6]
total = 0
for x in nums:
    if x % 2 == 0:
        total += x * x
print(total)`,
    steps: [
      { line: 1, note: '建立串列 nums，這是輸入資料。', vars: { nums: '[3, 8, 5, 2, 6]' } },
      { line: 2, note: '準備累計用的狀態 total，從 0 開始。', vars: { nums: '[3, 8, 5, 2, 6]', total: '0' } },
      { line: 3, note: '第 1 輪：x 取得第一個元素 3。', vars: { nums: '[3, 8, 5, 2, 6]', total: '0', x: '3' } },
      { line: 4, note: '3 % 2 是 1，條件不成立，跳過加總。', vars: { nums: '[3, 8, 5, 2, 6]', total: '0', x: '3' } },
      { line: 3, note: '第 2 輪：x 改寫成 8。', vars: { nums: '[3, 8, 5, 2, 6]', total: '0', x: '8' } },
      { line: 4, note: '8 % 2 是 0，條件成立。', vars: { nums: '[3, 8, 5, 2, 6]', total: '0', x: '8' } },
      { line: 5, note: 'total 從 0 改寫成 0 + 64 = 64：這就是「改變狀態」。', vars: { nums: '[3, 8, 5, 2, 6]', total: '64', x: '8' } },
      { line: 3, note: '第 3 輪：x 改寫成 5。', vars: { nums: '[3, 8, 5, 2, 6]', total: '64', x: '5' } },
      { line: 4, note: '5 是奇數，條件不成立。', vars: { nums: '[3, 8, 5, 2, 6]', total: '64', x: '5' } },
      { line: 3, note: '第 4 輪：x 改寫成 2。', vars: { nums: '[3, 8, 5, 2, 6]', total: '64', x: '2' } },
      { line: 4, note: '2 是偶數，條件成立。', vars: { nums: '[3, 8, 5, 2, 6]', total: '64', x: '2' } },
      { line: 5, note: 'total 改寫成 64 + 4 = 68。', vars: { nums: '[3, 8, 5, 2, 6]', total: '68', x: '2' } },
      { line: 3, note: '第 5 輪：x 改寫成 6。', vars: { nums: '[3, 8, 5, 2, 6]', total: '68', x: '6' } },
      { line: 4, note: '6 是偶數，條件成立。', vars: { nums: '[3, 8, 5, 2, 6]', total: '68', x: '6' } },
      { line: 5, note: 'total 改寫成 68 + 36 = 104。', vars: { nums: '[3, 8, 5, 2, 6]', total: '104', x: '6' } },
      { line: 3, note: '串列已經走完，迴圈結束；Python 的 x 仍保留最後的值 6。', vars: { nums: '[3, 8, 5, 2, 6]', total: '104', x: '6' } },
      { line: 6, note: '印出 104。函數式版本得到同樣的結果，但沒有 total 這個被反覆改寫的變數。', vars: { nums: '[3, 8, 5, 2, 6]', total: '104', x: '6' }, output: '104' },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面這段 Java 主要採用哪一種典範？',
      code: { language: 'Java', text: 'List<String> names = people.stream()\n        .filter(p -> p.age >= 18)\n        .map(p -> p.name)\n        .toList();' },
      options: ['命令式：它一步一步改變變數', '物件導向：因為用到了 p.age 這種屬性', '函數式（宣告式風格）：用 filter 與 map 描述要什麼資料', '邏輯式：它根據規則推理出答案'],
      answer: 2, explanation: '程式把資料交給 filter 與 map 兩個函式轉換，沒有迴圈計數器，也沒有反覆改寫的變數，這是函數式、宣告式的寫法。讀取物件的屬性不代表程式是以物件導向組織的；命令式會看到迴圈與指定；邏輯式是 Prolog 那種事實與規則，這裡沒有。',
    },
    {
      id: 'q2', prompt: '下面的程式輸出什麼？',
      code: { language: 'Java', text: 'int r = IntStream.rangeClosed(1, 5)\n        .filter(x -> x % 2 == 1)\n        .map(x -> x * 10)\n        .reduce(0, (a, b) -> a + b);\nSystem.out.println(r);' },
      options: ['150', '90', '60', '[10, 30, 50]'],
      answer: 1, explanation: 'rangeClosed(1, 5) 產生 1 到 5；filter 留下奇數 1、3、5；map 變成 10、30、50；reduce 從 0 開始加總得 90。150 是忘了 filter、把全部五個數都乘 10 相加；60 是只過濾出偶數 2、4 再乘 10；[10, 30, 50] 是 map 之後的資料，但 reduce 已經把它歸約成一個 int。',
    },
    {
      id: 'q3', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'nums = [1, 2, 3, 4]\nevens = filter(lambda x: x % 2 == 0, nums)\nprint(sum(evens))\nprint(sum(evens))' },
      options: ['6 與 6', '6 與 0', '6，然後 TypeError', '[2, 4] 與 [2, 4]'],
      answer: 1, explanation: 'Python 3 的 filter 與 map 回傳的是迭代器（iterator），只能走過一次：第一次 sum 取完 2 與 4 得到 6，第二次已經沒有元素，sum 得到 0，不會出錯。要重複使用就先轉成串列 `list(filter(...))`，或直接用串列推導式。JavaScript 的 filter 與 Java 的 toList 則會產生真正的陣列或串列。',
    },
    {
      id: 'q4', prompt: '這段 Java 程式為什麼無法編譯？',
      code: { language: 'Java', text: 'int total = 0;\nList.of(3, 8, 5).forEach(x -> total += x);\nSystem.out.println(total);' },
      options: ['List.of 不能放整數', 'forEach 只能用在陣列上', 'lambda 裡修改了外面的區域變數 total，它必須是 effectively final', 'lambda 的參數 x 必須寫出型別'],
      answer: 2, explanation: '編譯器回報「local variables referenced from a lambda expression must be final or effectively final」：lambda 可以讀外面的區域變數，但不能改它。正確做法是用 `stream().mapToInt(x -> x).sum()` 或 reduce 求和。List.of 會自動把 int 包成 Integer；forEach 是 List 的方法；lambda 參數的型別可以省略。',
    },
    {
      id: 'q5', prompt: '`scores` 是空陣列時，下面哪一行 JavaScript 會丟出 TypeError？',
      options: ['scores.map(s => s + 5)', 'scores.filter(s => s >= 60)', 'scores.reduce((a, b) => a + b)', 'scores.reduce((a, b) => a + b, 0)'],
      answer: 2, explanation: '沒有初始值的 reduce 會拿第一個元素當起點，空陣列沒有第一個元素，於是丟出「Reduce of empty array with no initial value」。給了初始值 0 的 reduce 會直接回傳 0；空陣列做 map 或 filter 都只會得到另一個空陣列，不會出錯。',
    },
    {
      id: 'q6', prompt: '下面的程式輸出什麼？',
      code: { language: 'Python', text: 'class Counter:\n    def __init__(self):\n        self.total = 0\n\n    def add(self, x):\n        self.total += x\n\na, b = Counter(), Counter()\na.add(3)\nb.add(5)\na.add(4)\nprint(a.total, b.total)' },
      options: ['7 5', '12 12', '12 5', '7 12'],
      answer: 0, explanation: '每個物件有自己的一份 total：a 收到 3 和 4 得到 7，b 只收到 5。12 12 是誤以為所有物件共用同一個 total；12 5 與 7 12 則是把別的物件的 add 也算進來。物件導向的重點正是每個物件各自保存並管理自己的狀態。',
    },
    {
      id: 'q7', prompt: '關於多典範語言，下列哪一句正確？',
      options: ['Java 只支援物件導向，不能寫函數式風格', 'Python 的程式一定要寫在類別裡', 'C++ 同時支援程序式、物件導向，也能用 lambda 與 <algorithm> 寫函數式風格', 'JavaScript 沒有類別，所以不能寫物件導向程式'],
      answer: 2, explanation: 'C++ 可以只寫函式（程序式）、定義類別（物件導向），也有 lambda、std::transform、std::accumulate。Java 雖以類別為中心，但 Java 8 起有 lambda 與 Stream API；Python 在檔案頂層就能直接寫敘述與函式；JavaScript 以原型實作物件導向，ES2015 起也有 class 語法。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '加分後的及格總分',
      statement: '老師幫每位同學的成績加 5 分，但最高只到 100 分；加分後 60 分以上算及格。請算出及格的人數與及格者加分後的總分。成績不在 0～100 之間的是登錄錯誤，直接略過（不加分、不計入）。請用 filter、map、reduce（或推導式、Stream）寫成資料管線：過濾錯誤 → 加分 → 過濾及格 → 計數與加總；寫完可以再和迴圈版本比較。',
      inputFormat: '第一行 n；第二行 n 個整數（n 為 0 時這一行可能不存在）。',
      outputFormat: '兩行：及格人數，以及及格者加分後的總分。',
      constraints: ['0 ≤ n ≤ 1000', '每個整數在 −1000～1000 之間；只有 0～100 是有效成績'],
      samples: [{ kind: 'normal', input: '5\n72 50 98 58 40', output: '3\n240', note: '加分後為 77、55、100、63、45；及格的是 77、100、63' }],
      tests: [
        { kind: 'normal', input: '5\n72 50 98 58 40', output: '3\n240', note: '一般情況，98 加分後封頂為 100' },
        { kind: 'normal', input: '6\n60 61 85 90 33 70', output: '5\n391', note: '大部分及格' },
        { kind: 'edge', input: '4\n55 54 95 96', output: '3\n260', note: '55 加分後剛好 60 及格、54 只到 59；95 剛好到 100，96 也封頂為 100' },
        { kind: 'edge', input: '3\n0 100 30', output: '1\n100', note: '有效範圍的兩端：0 加分後 5 不及格，100 仍是 100' },
        { kind: 'edge', input: '0\n', output: '0\n0', note: '沒有成績：總分是 0，reduce 要給初始值' },
        { kind: 'edge', input: '3\n10 20 30', output: '0\n0', note: '全部不及格，過濾後是空的' },
        { kind: 'error', input: '6\n-5 120 101 80 -1 59', output: '2\n149', note: '−5、120、101、−1 是登錄錯誤，必須先過濾掉；否則 −5 會變成 0、120 會被封頂成 100 而算進及格' },
      ],
      hints: ['先寫出四個步驟各自的條件或轉換：`0 <= s <= 100`、`min(s + 5, 100)`、`s >= 60`。', '人數是最後那份資料的長度，總分是它的和。', 'reduce 從 0 開始，空資料才會得到 0 而不是錯誤。'],
      starter: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<int> scores(n);
    for (int& s : scores) std::cin >> s;
    int passed = 0, total = 0;
    // 用 std::copy_if、std::transform、std::accumulate 算出 passed 與 total
    std::cout << passed << "\n" << total << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
n = int(data[0])
scores = [int(t) for t in data[1:1 + n]]
passed, total = 0, 0
# 用推導式（或 filter、map）與 sum 算出 passed 與 total
print(passed)
print(total)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] scores = new int[n];
        for (int i = 0; i < n; i++) scores[i] = sc.nextInt();
        int passed = 0, total = 0;
        // 用 Arrays.stream(scores).filter(...).map(...) 算出 passed 與 total
        System.out.println(passed);
        System.out.println(total);
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const scores = data.slice(1, 1 + data[0]);
let passed = 0, total = 0;
// 用 scores.filter(...).map(...) 與 reduce 算出 passed 與 total
console.log(passed);
console.log(total);`,
      },
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <iterator>
#include <numeric>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::vector<int> scores(n);
    for (int& s : scores) std::cin >> s;
    std::vector<int> valid, curved, passed;
    std::copy_if(scores.begin(), scores.end(), std::back_inserter(valid), [](int s) { return 0 <= s && s <= 100; });
    std::transform(valid.begin(), valid.end(), std::back_inserter(curved), [](int s) { return std::min(s + 5, 100); });
    std::copy_if(curved.begin(), curved.end(), std::back_inserter(passed), [](int s) { return s >= 60; });
    const int total = std::accumulate(passed.begin(), passed.end(), 0);
    std::cout << passed.size() << "\n" << total << "\n";
    return 0;
}`,
        Python: code`import sys

data = sys.stdin.read().split()
n = int(data[0])
scores = [int(t) for t in data[1:1 + n]]
valid = [s for s in scores if 0 <= s <= 100]
curved = [min(s + 5, 100) for s in valid]
passed = [s for s in curved if s >= 60]
print(len(passed))
print(sum(passed))`,
        Java: code`import java.util.Arrays;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] scores = new int[n];
        for (int i = 0; i < n; i++) scores[i] = sc.nextInt();
        int[] passed = Arrays.stream(scores)
                .filter(s -> 0 <= s && s <= 100)
                .map(s -> Math.min(s + 5, 100))
                .filter(s -> s >= 60)
                .toArray();
        System.out.println(passed.length);
        System.out.println(Arrays.stream(passed).sum());
    }
}`,
        JavaScript: code`const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/).map(Number);
const scores = data.slice(1, 1 + data[0]);
const passed = scores
    .filter(s => s >= 0 && s <= 100)
    .map(s => Math.min(s + 5, 100))
    .filter(s => s >= 60);
console.log(passed.length);
console.log(passed.reduce((sum, s) => sum + s, 0));`,
      },
      judge: 'none',
    },
  ],
};
