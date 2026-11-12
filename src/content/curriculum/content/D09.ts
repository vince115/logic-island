import type { LessonContent } from '../schema';
import { hashSteps, type HashOp } from '../simulate';

const code = String.raw;

/** The trace's operations: the word just read (w), the map operation, and why it happens. */
const traceOps: { w: string; op: HashOp; why: string; output?: string }[] = [
  { w: 'cat', op: { op: 'put', key: 'cat', value: '1', line: 4 }, why: '`count.get("cat", 0)` 找不到 cat，回傳預設值 0，加 1 後存入 cat:1。' },
  { w: 'dog', op: { op: 'put', key: 'dog', value: '1', line: 4 }, why: '`dog` 第一次出現，`get` 回傳 0，存入 dog:1。' },
  { w: 'cat', op: { op: 'put', key: 'cat', value: '2', line: 4 }, why: '`cat` 已經在字典裡，`get` 回傳 1，加 1 後把同一個鍵的值改成 2：鍵不會重複。' },
  { w: 'bird', op: { op: 'put', key: 'bird', value: '1', line: 4 }, why: '`bird` 第一次出現，存入 bird:1。它和 cat 剛好落在同一個桶，下一課 D10 會細談這種碰撞（collision）。' },
  { w: 'cat', op: { op: 'put', key: 'cat', value: '3', line: 4 }, why: '`cat` 第三次出現，值從 2 更新為 3。' },
  { w: 'dog', op: { op: 'put', key: 'dog', value: '2', line: 4 }, why: '`dog` 第二次出現，值從 1 更新為 2。迴圈結束。' },
  { w: 'dog', op: { op: 'get', key: 'dog', line: 5 }, why: '查詢存在的鍵，`get` 回傳它的值 2 並印出。', output: '2' },
  { w: 'dog', op: { op: 'get', key: 'fox', line: 6 }, why: '查詢不存在的鍵：`get` 的第二個參數 0 是預設值，所以印出 0；若寫成 `count["fox"]` 就會丟出 `KeyError`。', output: '2\n0' },
];

/**
 * D09 Map / Dictionary. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js) with `Map` (insertion order, keys sorted before printing); its `get` on a
 * missing key returns undefined instead of failing, so missing-key-demo has a JavaScript outputByLanguage.
 */
export const D09: LessonContent = {
  lessonId: 'D09',
  motivation: '通訊錄用名字查電話、字典用單字查解釋、選舉統計每位候選人的票數、商店記錄每樣商品的庫存，這些資料都有同一個形狀：用一個「鍵」（key）找到它對應的「值」（value）。對照表（map，Python 叫 dictionary 字典）就是專門存放鍵值對（key-value pair）的資料結構：用鍵查值、改值、刪除，都不必從頭一個個找。它是寫程式時最常用的工具之一，統計次數、依類別分組、記住算過的結果（快取）都靠它。它也有限制：雜湊式的 map 沒有順序，不能問「第 3 個元素是誰」；每個鍵值對要多花一些記憶體；鍵必須能被雜湊或比較大小；而當鍵剛好是 0 到 k 的小整數時，直接用陣列計數反而更快更省。',
  sections: [
    {
      id: 'key-value', title: '鍵與值：用鍵查值的對照表',
      blocks: [
        { type: 'p', text: '上一課 D08 的集合（set）只記得「某個元素在不在」。map 多走一步：每個鍵都附帶一個值，而且同一個鍵只會出現一次。對已經存在的鍵再存一次，不會多出一筆，而是把舊的值換掉。可以把 map 想成一排置物櫃：鍵是櫃子上的名字，值是櫃子裡的東西。' },
        { type: 'list', items: [
          '放入／更新（put）：把鍵 k 的值設為 v；k 不存在就新增，存在就覆蓋。',
          '查詢（get）：取出鍵 k 的值。鍵不存在時怎麼辦，四種語言很不一樣，是本課的重點之一。',
          '是否存在（contains）：只問鍵 k 在不在，不取值。',
          '刪除（remove）：把鍵 k 和它的值一起移除。',
        ] },
        { type: 'table', head: ['操作', 'C++ `std::map`／`std::unordered_map`', 'Python `dict`', 'Java `HashMap`／`TreeMap`', 'JavaScript `Map`'], rows: [
          ['放入／更新', '`m[k] = v;`', '`d[k] = v`', '`m.put(k, v);`', '`m.set(k, v);`'],
          ['查詢（鍵一定存在時）', '`m.at(k)`', '`d[k]`', '`m.get(k)`', '`m.get(k)`'],
          ['查詢，不存在時給預設值', '`auto it = m.find(k);` 再判斷 `it != m.end()`', '`d.get(k, 0)`', '`m.getOrDefault(k, 0)`', '`m.get(k) ?? 0`'],
          ['是否存在', '`m.count(k)`（0 或 1）；C++20 才有 `m.contains(k)`', '`k in d`', '`m.containsKey(k)`', '`m.has(k)`'],
          ['刪除', '`m.erase(k);`', '`del d[k]`（不存在會丟 `KeyError`）或 `d.pop(k, None)`', '`m.remove(k);`', '`m.delete(k);`（不存在時回傳 `false`）'],
          ['鍵值對數量', '`m.size()`', '`len(d)`', '`m.size()`', '`m.size`（屬性，不加括號）'],
        ] },
        { type: 'callout', tone: 'note', title: '什麼東西可以當鍵', text: '鍵在存進去之後不能被改變，否則 map 就找不到它了。Python 的鍵必須可雜湊（hashable）：`str`、`int`、`tuple` 都可以，所以座標可以寫成 `d[(3, 4)]`；`list` 可以被修改，當鍵會丟出 `TypeError: unhashable type: \'list\'`。C++ 的 `std::map` 需要鍵能用 `<` 比較大小，`std::unordered_map` 需要 `std::hash`：`std::pair<int, int>` 可以當 `std::map` 的鍵，卻不能直接當 `std::unordered_map` 的鍵（標準庫沒有提供 pair 的 hash）。Java 的 `HashMap` 依賴鍵的 `hashCode` 與 `equals`，`String`、`Integer` 都是不可變（immutable）的，很適合當鍵；若把 `ArrayList` 當鍵放進去後又修改它，就再也查不到了。JavaScript 的 `Map` 什麼值都能當鍵，但陣列與物件依參考比較：`m.set([3, 4], 1)` 之後 `m.get([3, 4])` 是 `undefined`，因為那是另一個新陣列，所以座標通常寫成字串鍵 `"3,4"`。' },
      ],
    },
    {
      id: 'counting-grouping', title: '統計次數與依鍵分組',
      blocks: [
        { type: 'p', text: '統計次數（frequency counting）是 map 最典型的用法：鍵是要統計的東西，值是目前出現的次數。每讀到一個單字，就把它的次數加 1；第一次出現時次數從 0 開始。四種語言各有慣用寫法：C++ 的 `count[w]++`（`[]` 遇到不存在的鍵會先建立一個值為 0 的項目，這裡正好是我們要的），Python 的 `count[w] = count.get(w, 0) + 1`，Java 的 `count.merge(w, 1, Integer::sum)`（不存在就放 1，存在就把舊值加 1），JavaScript 的 `count.set(w, (count.get(w) ?? 0) + 1)`（`get` 找不到時回傳 `undefined`，`??` 把它換成 0）。' },
        { type: 'p', text: '下面的程式統計一行文字裡每個單字出現幾次，並依單字（鍵）的字典序輸出。C++ 用 `std::map`、Java 用 `TreeMap`，兩者本來就依鍵排序；Python 的 `dict` 與 JavaScript 的 `Map` 保留放入順序，所以輸出前用 `sorted(count)`／`[...count.keys()].sort()` 排序鍵。' },
        { type: 'example', id: 'word-count' },
        { type: 'p', text: '下方的視覺化用 Python 逐步追蹤一個小的計數程式：每個鍵經由雜湊函數（hash function）決定放進哪個桶（bucket），同一個鍵再出現時只會更新它的值。圖中用來決定桶號的是本課程的示意雜湊：字串每個字元的字元碼加總後除以桶數取餘數，真正的 `dict` 用的雜湊函數比這複雜得多，D10 會說明雜湊表的內部。' },
        { type: 'p', text: '依鍵分組（grouping）是另一個常見用法：值不是數字，而是一個清單。例如把單字依第一個字母分組，鍵是字母，值是以那個字母開頭的單字清單。第一次遇到某個字母時要先建立空清單：C++ 的 `groups[c]` 會自動建立空的 `std::vector`，Python 用 `collections.defaultdict(list)`，Java 用 `computeIfAbsent(c, k -> new ArrayList<>())`，JavaScript 則先用 `has` 檢查，沒有就 `set(c, [])`。' },
        { type: 'example', id: 'group-by-letter' },
        { type: 'callout', tone: 'tip', title: 'Python 的 Counter', text: '`collections.Counter` 是專門用來計數的字典：`Counter(words)` 一行就統計好每個元素的次數，查不存在的鍵會回傳 0 而不是丟出 `KeyError`（而且不會因此新增鍵）。`most_common()` 依次數由大到小排列，但次數相同時保持元素第一次出現的順序，不是依字典序，所以題目要求「次數相同依字典序」時，仍要自己用 `sorted` 指定排序規則。' },
      ],
    },
    {
      id: 'missing-keys', title: '安全處理不存在的鍵',
      blocks: [
        { type: 'p', text: '查一個不存在的鍵，是使用 map 時最常見的錯誤來源。四種語言的「直接查詢」寫法看起來很像，結果卻完全不同：' },
        { type: 'table', head: ['語言', '直接查詢不存在的鍵', '安全的寫法'], rows: [
          ['C++', '`m[k]` 不會出錯，但會偷偷插入 k，值為預設值（int 是 0），`size()` 變大；`m.at(k)` 丟出 `std::out_of_range`', '`m.count(k)` 或 `m.find(k) != m.end()` 先判斷（C++17）；C++20 起可用 `m.contains(k)`'],
          ['Python', '`d[k]` 丟出 `KeyError`', '`d.get(k, 預設值)`、`k in d`、`d.setdefault(k, 預設值)`、`defaultdict`、`Counter`'],
          ['Java', '`m.get(k)` 回傳 `null`；寫成 `int c = m.get(k);` 時，null 自動拆箱（unboxing）成 int 會丟出 `NullPointerException`', '`m.getOrDefault(k, 0)`、`m.containsKey(k)`、`m.merge(k, 1, Integer::sum)`'],
          ['JavaScript', '`m.get(k)` 回傳 `undefined`，不丟出例外，也不插入；拿去計算時悄悄變成 `NaN`（`undefined + 1`）', '`m.get(k) ?? 0`、`m.has(k)`'],
        ] },
        { type: 'callout', tone: 'warning', title: 'C++：用 [] 「查詢」會改變 map', text: '`if (m["x"] == 0)` 看起來只是讀取，其實當 "x" 不存在時，`operator[]` 會先插入 x:0 再回傳它，map 因此多了一筆。在迴圈裡用 `m[k]` 檢查大量不存在的鍵，map 會越長越大，之後走訪 map 時還會多出一堆值為 0 的項目。只想查詢時，用 `count` 或 `find`；`at` 在鍵不存在時丟出 `std::out_of_range`。另外，`operator[]` 會修改 map，所以不能用在 `const std::map&` 參數上。' },
        { type: 'callout', tone: 'warning', title: 'Python 的 KeyError 與 Java 的 NullPointerException', text: 'Python 中 `d[k]` 遇到不存在的鍵會丟出 `KeyError` 讓程式停止，查詢前先用 `k in d` 判斷，或改用 `d.get(k, 0)`。注意 `defaultdict` 和 C++ 的 `[]` 一樣：光是讀取 `dd[k]` 就會插入預設值。Java 的 `HashMap.get` 不會丟例外，而是回傳 `null`，問題延後到把它當數字用的那一刻才爆發：`int c = map.get(k);` 丟出 `NullPointerException`。而且 `HashMap` 允許值是 null，`get` 回傳 null 時無法分辨「鍵不存在」還是「值就是 null」，需要分辨時用 `containsKey`。' },
        { type: 'p', text: '下面的程式在四種語言中做同一件事：先用安全的寫法查詢不存在的鍵 banana（大小不變），再示範直接查詢會出錯，最後用一個「查不到就插入預設值」的操作，讓大小從 1 變成 2。C++ 是看起來無害的 `m["banana"]`；Python 是 `defaultdict` 的讀取；Java 是刻意插入的 `computeIfAbsent`。JavaScript 的直接查詢不會出錯，而是印出 `undefined`，所以那一行的輸出和其他語言不同；它也沒有「查不到就插入」的方法，要自己寫 `if (!m.has(k)) m.set(k, 0)`。' },
        { type: 'example', id: 'missing-key-demo' },
      ],
    },
    {
      id: 'ordering', title: '順序、排序輸出與複雜度',
      blocks: [
        { type: 'p', text: 'map 有兩大家族：以平衡二元搜尋樹（balanced binary search tree，通常是紅黑樹）實作的有序 map，鍵永遠依大小排好；以雜湊表（hash table）實作的雜湊 map，平均更快，但沒有可依賴的順序。' },
        { type: 'list', items: [
          'C++：`std::map` 依鍵由小到大排序，操作是 O(log n)；`std::unordered_map` 平均 O(1)，走訪順序沒有規則，插入新鍵還可能讓整張表重新雜湊（rehash），使原本的迭代器失效。',
          'Python：只有 `dict` 一種（雜湊表）。從 Python 3.7 起，語言規定 `dict` 依放入順序（insertion order）走訪；更新已存在的鍵不會改變它的位置。放入順序不等於排序，要依鍵排序就用 `sorted(d)`。',
          'Java：`HashMap` 沒有順序；`LinkedHashMap` 依放入順序；`TreeMap` 依鍵排序，操作是 O(log n)。三者都實作 `Map` 介面，宣告成 `Map<String, Integer>` 就能隨時換實作。',
          'JavaScript：`Map`（雜湊表）依放入順序走訪，這是語言規格保證的；更新已存在的鍵不會改變它的位置。沒有內建的有序 map，要依鍵排序就用 `[...m.keys()].sort()`（數字鍵要給比較函式 `(a, b) => a - b`）。',
        ] },
        { type: 'table', head: ['操作', 'C++ `map`／Java `TreeMap`', 'C++ `unordered_map`／Python `dict`／Java `HashMap`／JavaScript `Map`'], rows: [
          ['放入／更新', 'O(log n)', '平均 O(1)'],
          ['查詢／是否存在', 'O(log n)', '平均 O(1)'],
          ['刪除', 'O(log n)', '平均 O(1)'],
          ['依鍵順序走訪全部', 'O(n)，本來就有序', '先排序鍵 O(n log n)，再走訪 O(n)'],
          ['最差情況', 'O(log n)（樹保持平衡）', '大量碰撞時退化為 O(n)（D10 說明原因）'],
        ] },
        { type: 'callout', tone: 'warning', title: '不要直接印出雜湊 map 的走訪順序', text: '`unordered_map` 與 `HashMap` 的走訪順序取決於雜湊函數、桶數與放入過程，換一個編譯器、Java 版本或資料量就可能不同。題目要求固定順序時，先把鍵值對複製到陣列再排序，或改用有序 map。Python `dict` 與 JavaScript `Map` 的順序雖然有保證，但它是放入順序，也不是排序後的順序。' },
        { type: 'p', text: '依值排序也很常見，例如「依次數由多到少輸出」。這時要把鍵值對放進陣列，用自訂規則排序；次數相同時再依鍵的字典序排，這個平手規則（tie-break）讓輸出完全確定。C++：把 `unordered_map` 複製成 `std::vector<std::pair<std::string, int>>` 再用 lambda 比較；Python：`sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))`，負號讓次數由大到小；Java：`List<Map.Entry<String, Integer>>` 搭配 `Integer.compare(b.getValue(), a.getValue())`，相等時再用 `compareTo` 比較鍵；JavaScript：`[...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))`，次數相同時差是 0，`||` 才改比鍵。本課的練習題就是它。' },
      ],
    },
    {
      id: 'compare', title: '與集合、平行陣列的比較',
      blocks: [
        { type: 'p', text: '沒有 map 時，常見的替代做法是平行陣列（parallel arrays）：`names[i]` 與 `scores[i]` 用同一個索引對應。要查某人的分數，就得從頭找到名字所在的 i，是 O(n)；新增時還要小心兩個陣列一起改。map 直接用名字當鍵，查詢平均 O(1)（雜湊 map）或 O(log n)（有序 map）。' },
        { type: 'table', head: ['', '集合 Set（D08）', '對照表 Map', '平行陣列', '計數陣列 `cnt[x]`'], rows: [
          ['存什麼', '只有鍵', '鍵與值', '同索引的多個陣列', '索引就是鍵，格子是值'],
          ['回答的問題', 'x 在不在？', 'x 對應到什麼？', '第 i 筆是什麼？', '小整數 x 出現幾次？'],
          ['用鍵查詢', '平均 O(1) 或 O(log n)', '平均 O(1) 或 O(log n)', 'O(n)（線性搜尋）', 'O(1)'],
          ['鍵的限制', '可雜湊或可比較', '可雜湊或可比較', '無', '必須是 0..k 的小整數'],
          ['適用時機', '去重、判斷是否出現過', '計數、分組、查表', '資料量小、依位置存取', '鍵範圍小且密集'],
        ] },
        { type: 'p', text: '選擇的判斷：只需要知道「有沒有」就用集合；需要知道「是多少、是什麼」就用 map；鍵是範圍不大的整數（例如成績 0～100、字母 a～z）時，用陣列計數最快也最省記憶體。實作上兩者也是近親：Python 的 `set` 與 `dict`、JavaScript 的 `Set` 與 `Map` 都是雜湊表，C++ 的 `std::set` 與 `std::map` 都是平衡樹，Java 的 `HashSet` 內部就是用一個 `HashMap` 存鍵。' },
      ],
    },
  ],
  examples: [
    {
      id: 'word-count', title: '單字次數統計，依鍵排序輸出', description: '讀入一行單字，統計每個單字出現的次數，依單字的字典序輸出，最後印出不同單字的數量。',
      stdin: 'the cat and the dog and the bird', output: 'and 2\nbird 1\ncat 1\ndog 1\nthe 3\ndistinct: 5',
      code: {
        'C++': code`#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> count;  // 有序 map：依鍵排序
    std::string w;
    while (std::cin >> w) count[w]++;  // 不存在時先建立為 0，再加 1
    for (const auto& [word, c] : count) {
        std::cout << word << " " << c << "\n";
    }
    std::cout << "distinct: " << count.size() << "\n";
    return 0;
}`,
        Python: code`count = {}
for w in input().split():
    count[w] = count.get(w, 0) + 1
for word in sorted(count):  # dict 保留放入順序，輸出前要排序
    print(word, count[word])
print("distinct:", len(count))`,
        Java: code`import java.util.Map;
import java.util.Scanner;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Map<String, Integer> count = new TreeMap<>();  // 依鍵排序
        while (sc.hasNext()) count.merge(sc.next(), 1, Integer::sum);
        for (Map.Entry<String, Integer> e : count.entrySet()) {
            System.out.println(e.getKey() + " " + e.getValue());
        }
        System.out.println("distinct: " + count.size());
    }
}`,
        JavaScript: code`const words = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const count = new Map();
for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);  // 不存在時 get 回傳 undefined，?? 改用 0
for (const word of [...count.keys()].sort()) {  // Map 保留放入順序，輸出前要排序
    console.log(word, count.get(word));
}
console.log("distinct:", count.size);`,
      },
    },
    {
      id: 'missing-key-demo', title: '查詢不存在的鍵：安全寫法、例外與偷偷插入', description: '對只有 apple:3 的 map 查詢 banana：安全查詢不改變大小，直接查詢會出錯（被捕捉；JavaScript 不會出錯，印出 undefined），「查不到就插入預設值」的操作讓大小從 1 變成 2。',
      output: 'get banana with default: 0\nbanana present: false\nsize: 1\ndirect lookup of banana: error\nsize: 1\ndefault-inserting lookup: 0\nsize: 2',
      outputByLanguage: { JavaScript: 'get banana with default: 0\nbanana present: false\nsize: 1\ndirect lookup of banana: undefined\nsize: 1\ndefault-inserting lookup: 0\nsize: 2' },
      code: {
        'C++': code`#include <iostream>
#include <map>
#include <stdexcept>
#include <string>

int main() {
    std::map<std::string, int> m{{"apple", 3}};
    auto it = m.find("banana");
    std::cout << "get banana with default: " << (it == m.end() ? 0 : it->second) << "\n";
    std::cout << "banana present: " << (m.count("banana") ? "true" : "false") << "\n";
    std::cout << "size: " << m.size() << "\n";
    try {
        int c = m.at("banana");  // 不存在：丟出 std::out_of_range
        std::cout << "direct lookup of banana: " << c << "\n";
    } catch (const std::out_of_range&) {
        std::cout << "direct lookup of banana: error\n";
    }
    std::cout << "size: " << m.size() << "\n";
    std::cout << "default-inserting lookup: " << m["banana"] << "\n";  // 偷偷插入 banana:0
    std::cout << "size: " << m.size() << "\n";
    return 0;
}`,
        Python: code`from collections import defaultdict

d = {"apple": 3}
print("get banana with default:", d.get("banana", 0))
print("banana present:", "true" if "banana" in d else "false")
print("size:", len(d))
try:
    c = d["banana"]  # 不存在：丟出 KeyError
    print("direct lookup of banana:", c)
except KeyError:
    print("direct lookup of banana: error")
print("size:", len(d))
dd = defaultdict(int, d)
print("default-inserting lookup:", dd["banana"])  # 讀取就插入 banana:0
print("size:", len(dd))`,
        Java: code`import java.util.HashMap;
import java.util.Map;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> m = new HashMap<>();
        m.put("apple", 3);
        System.out.println("get banana with default: " + m.getOrDefault("banana", 0));
        System.out.println("banana present: " + m.containsKey("banana"));
        System.out.println("size: " + m.size());
        try {
            int c = m.get("banana");  // get 回傳 null，拆箱成 int 時丟出 NullPointerException
            System.out.println("direct lookup of banana: " + c);
        } catch (NullPointerException e) {
            System.out.println("direct lookup of banana: error");
        }
        System.out.println("size: " + m.size());
        System.out.println("default-inserting lookup: " + m.computeIfAbsent("banana", k -> 0));
        System.out.println("size: " + m.size());
    }
}`,
        JavaScript: code`const m = new Map([["apple", 3]]);
console.log("get banana with default:", m.get("banana") ?? 0);
console.log("banana present:", m.has("banana"));
console.log("size:", m.size);
const c = m.get("banana");  // 不存在：不丟出例外，回傳 undefined
console.log("direct lookup of banana:", c);
console.log("size:", m.size);
if (!m.has("banana")) m.set("banana", 0);  // 查不到就插入預設值，要自己寫
console.log("default-inserting lookup:", m.get("banana"));
console.log("size:", m.size);`,
      },
    },
    {
      id: 'group-by-letter', title: '依第一個字母分組', description: '鍵是字母、值是單字清單；依字母排序輸出，每組內的單字也排序。',
      output: 'a: apple apricot avocado\nb: banana blueberry\nc: cherry cranberry',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <map>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> words = {"banana", "apple", "cherry", "avocado", "blueberry", "cranberry", "apricot"};
    std::map<char, std::vector<std::string>> groups;
    for (const std::string& w : words) groups[w[0]].push_back(w);  // 新字母先建立空 vector
    for (auto& [letter, group] : groups) {
        std::sort(group.begin(), group.end());
        std::cout << letter << ":";
        for (const std::string& w : group) std::cout << " " << w;
        std::cout << "\n";
    }
    return 0;
}`,
        Python: code`from collections import defaultdict

words = ["banana", "apple", "cherry", "avocado", "blueberry", "cranberry", "apricot"]
groups = defaultdict(list)  # 新字母自動建立空 list
for w in words:
    groups[w[0]].append(w)
for letter in sorted(groups):
    print(letter + ":", *sorted(groups[letter]))`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        String[] words = {"banana", "apple", "cherry", "avocado", "blueberry", "cranberry", "apricot"};
        Map<Character, List<String>> groups = new TreeMap<>();
        for (String w : words) groups.computeIfAbsent(w.charAt(0), k -> new ArrayList<>()).add(w);
        for (Map.Entry<Character, List<String>> e : groups.entrySet()) {
            List<String> group = e.getValue();
            Collections.sort(group);
            System.out.println(e.getKey() + ": " + String.join(" ", group));
        }
    }
}`,
        JavaScript: code`const words = ["banana", "apple", "cherry", "avocado", "blueberry", "cranberry", "apricot"];
const groups = new Map();
for (const w of words) {
    if (!groups.has(w[0])) groups.set(w[0], []);  // 新字母先建立空陣列
    groups.get(w[0]).push(w);
}
for (const letter of [...groups.keys()].sort()) {
    console.log(letter + ":", groups.get(letter).sort().join(" "));
}`,
      },
    },
  ],
  visualization: {
    kind: 'hash-table', title: '用字典統計單字次數：同一個鍵只更新值', language: 'Python',
    code: code`words = ["cat", "dog", "cat", "bird", "cat", "dog"]
count = {}
for w in words:
    count[w] = count.get(w, 0) + 1
print(count.get("dog", 0))
print(count.get("fox", 0))`,
    steps: [
      { line: 2, note: '建立空字典 count。圖中用 5 個桶示意雜湊表；決定桶號的是本課程的示意雜湊（字串字元碼總和 mod 5），不是 Python 真正的雜湊函數。',
        vars: { size: '0', 負載因子: '0.00' }, buckets: { name: 'count', buckets: [[], [], [], [], []] } },
      ...hashSteps('count', 5, 'map', traceOps.map(t => t.op)).map((step, i) => ({
        ...step,
        note: `${traceOps[i].why}${step.note}`,
        vars: { w: `"${traceOps[i].w}"`, ...step.vars },
        ...(traceOps[i].output ? { output: traceOps[i].output } : {}),
      })),
    ],
  },
  quiz: [
    {
      id: 'q-cpp-bracket', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'std::map<std::string, int> m;\nm["a"] = 1;\nif (m["x"] == 0) std::cout << "zero ";\nstd::cout << m.size() << "\\n";' },
      options: ['zero 1', 'zero 2', '1', '執行時丟出 std::out_of_range'],
      answer: 1, explanation: '"x" 不存在，`m["x"]` 會先插入 x:0 再回傳 0，所以條件成立、印出 zero，而且 map 變成 a:1、x:0 兩筆，`size()` 是 2。選「zero 1」是以為 `[]` 只是讀取；丟出 `std::out_of_range` 的是 `m.at("x")`，不是 `m["x"]`。只想查詢時應該用 `m.count("x")` 或 `m.find("x")`。',
    },
    {
      id: 'q-java-null', prompt: '下面的 Java 程式片段執行時會怎樣？',
      code: { language: 'Java', text: 'Map<String, Integer> map = new HashMap<>();\nmap.put("a", 1);\nint c = map.get("b");\nSystem.out.println(c + 1);' },
      options: ['印出 1', '印出 null1', '丟出 NullPointerException', '編譯錯誤'],
      answer: 2, explanation: '"b" 不存在，`map.get("b")` 回傳 null（`Integer` 型別），指定給 `int c` 時要自動拆箱，對 null 拆箱就丟出 `NullPointerException`。程式可以編譯（Integer 轉 int 是合法的自動拆箱），所以不是編譯錯誤；Java 不會把缺少的值當成 0，也不會走到字串相加印出 null1。安全寫法是 `map.getOrDefault("b", 0)`。',
    },
    {
      id: 'q-python-keyerror', prompt: 'Python 中 `d = {"a": 1}`。下列哪一個運算式會丟出 `KeyError`？',
      options: ['`d.get("b", 0)`', '`d["b"]`', '`"b" in d`', '`d.setdefault("b", 0)`'],
      answer: 1, explanation: '`d["b"]` 直接查詢不存在的鍵，丟出 `KeyError`。`d.get("b", 0)` 回傳預設值 0；`"b" in d` 只是回傳 False；`d.setdefault("b", 0)` 會插入 b:0 並回傳 0，也不會出錯（但它會改變字典）。',
    },
    {
      id: 'q-choose', prompt: '下列哪一個需求必須用 map，用 set 不夠？',
      options: ['判斷一個單字是否出現過', '統計每個單字出現了幾次', '去除名單中重複的學號', '檢查兩份名單有沒有共同的人'],
      answer: 1, explanation: '統計次數時，每個單字都要附帶一個數字（次數），這是鍵對應值的關係，需要 map。其他三個只問「在不在」：判斷出現過、去重、找共同元素，用集合（D08）就夠了，多存一個值只是浪費。',
    },
    {
      id: 'q-order', prompt: '依序放入鍵 "pear"、"apple"、"fig" 後走訪，Java `TreeMap`、Java `LinkedHashMap`、Python 3.7 以後的 `dict` 的鍵順序分別是什麼？',
      options: [
        'apple fig pear；pear apple fig；pear apple fig',
        '三者都是 apple fig pear',
        'pear apple fig；apple fig pear；apple fig pear',
        '三者的順序都無法預測',
      ],
      answer: 0, explanation: '`TreeMap` 依鍵排序，得到 apple fig pear；`LinkedHashMap` 與 Python `dict` 都保留放入順序，得到 pear apple fig。「三者都排序」是把放入順序誤以為排序；「無法預測」說的是 `HashMap` 與 `unordered_map`，不是這三種。',
    },
    {
      id: 'q-complexity', prompt: 'C++ 中有 n 個鍵，用 `find` 查詢一個鍵：`std::map` 的時間複雜度，與 `std::unordered_map` 的平均時間複雜度分別是？',
      options: ['O(log n)；O(1)', 'O(1)；O(log n)', 'O(n)；O(1)', 'O(log n)；O(log n)'],
      answer: 0, explanation: '`std::map` 是平衡二元搜尋樹，查詢沿著樹往下走，高度是 O(log n)；`std::unordered_map` 是雜湊表，先算出桶號再只看那個桶，平均 O(1)（大量碰撞時最差 O(n)）。「O(1)；O(log n)」把兩者對調了；`std::map` 不必逐一比對，所以不是 O(n)。',
    },
  ],
  exercises: [
    {
      id: 'e-word-frequency', title: '單字頻率排行',
      statement: '讀入 n 個單字，統計每個不同的單字出現幾次，然後依出現次數由多到少輸出；次數相同時，依單字的字典序由小到大輸出。每個單字只能由小寫英文字母 a～z 組成；只要有任何一個單字含有其他字元（大寫字母、數字、標點等），就只輸出一行 `Invalid`。',
      inputFormat: '第一行是整數 n。接下來是 n 個以空白或換行分隔的單字。',
      outputFormat: '每個不同的單字一行，格式為「單字 次數」，依上述規則排序；或只有一行 `Invalid`。',
      constraints: ['1 ≤ n ≤ 2×10^5', '每個單字長度 1～20', '合法的單字只含小寫字母 a～z'],
      samples: [{ kind: 'normal', input: '8\nthe cat and the dog and the bird', output: 'the 3\nand 2\nbird 1\ncat 1\ndog 1', note: 'the 最多；次數 1 的三個單字依字典序' }],
      tests: [
        { kind: 'normal', input: '8\nthe cat and the dog and the bird', output: 'the 3\nand 2\nbird 1\ncat 1\ndog 1', note: '範例' },
        { kind: 'normal', input: '6\nb a b\nc a b', output: 'b 3\na 2\nc 1', note: '單字分在多行' },
        { kind: 'edge', input: '1\nhello', output: 'hello 1', note: '只有一個單字' },
        { kind: 'edge', input: '4\nzz zz zz zz', output: 'zz 4', note: '全部相同' },
        { kind: 'edge', input: '4\nd c b a', output: 'a 1\nb 1\nc 1\nd 1', note: '全部平手：完全依字典序' },
        { kind: 'edge', input: '5\nab b ab b a', output: 'ab 2\nb 2\na 1', note: '平手時 "ab" 排在 "b" 前面（字典序比第一個字元）' },
        { kind: 'edge', input: '200000\n' + 'x y '.repeat(100000).trim(), output: 'x 100000\ny 100000', note: 'n 達到上限，檢查效率' },
        { kind: 'error', input: '3\napple Banana apple', output: 'Invalid', note: '含大寫字母' },
        { kind: 'error', input: '2\nhi there!', output: 'Invalid', note: '含標點符號' },
        { kind: 'error', input: '3\nabc a1 abc', output: 'Invalid', note: '含數字' },
      ],
      hints: [
        '先用 map 統計次數：C++ `count[w]++`、Python `Counter`、Java `merge(w, 1, Integer::sum)`、JavaScript `count.set(w, (count.get(w) ?? 0) + 1)`。',
        '雜湊 map 的走訪順序不固定，要把鍵值對複製到陣列（或 list）再排序。',
        '排序規則：次數不同時次數大的在前；次數相同時單字小的在前。Python 可用 `key=lambda kv: (-kv[1], kv[0])`。',
        '統計時順便檢查每個字元是否在 a～z 之間；讀完全部單字後再決定要輸出 Invalid 還是排行。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);
    int n;
    std::cin >> n;
    std::unordered_map<std::string, int> count;
    bool valid = true;
    std::string w;
    for (int i = 0; i < n && std::cin >> w; i++) {
        for (char c : w) {
            if (c < 'a' || c > 'z') valid = false;
        }
        count[w]++;
    }
    if (!valid) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::vector<std::pair<std::string, int>> items(count.begin(), count.end());
    std::sort(items.begin(), items.end(), [](const auto& a, const auto& b) {
        if (a.second != b.second) return a.second > b.second;
        return a.first < b.first;
    });
    std::string out;
    for (const auto& [word, c] : items) out += word + " " + std::to_string(c) + "\n";
    std::cout << out;
    return 0;
}`,
        Python: code`import sys
from collections import Counter

data = sys.stdin.read().split()
n = int(data[0])
words = data[1:1 + n]
if any(not (w.isascii() and w.isalpha() and w.islower()) for w in words):
    print("Invalid")
else:
    count = Counter(words)
    items = sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))
    print("\n".join(f"{w} {c}" for w, c in items))`,
        Java: code`import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) throws IOException {
        String[] tokens = new String(System.in.readAllBytes()).trim().split("\\s+");
        int n = Integer.parseInt(tokens[0]);
        Map<String, Integer> count = new HashMap<>();
        boolean valid = true;
        for (int i = 1; i <= n && i < tokens.length; i++) {
            String w = tokens[i];
            for (int j = 0; j < w.length(); j++) {
                char c = w.charAt(j);
                if (c < 'a' || c > 'z') valid = false;
            }
            count.merge(w, 1, Integer::sum);
        }
        if (!valid) {
            System.out.println("Invalid");
            return;
        }
        List<Map.Entry<String, Integer>> items = new ArrayList<>(count.entrySet());
        items.sort((a, b) -> !a.getValue().equals(b.getValue())
                ? Integer.compare(b.getValue(), a.getValue())
                : a.getKey().compareTo(b.getKey()));
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, Integer> e : items) out.append(e.getKey()).append(' ').append(e.getValue()).append('\n');
        System.out.print(out);
    }
}`,
        JavaScript: code`const tokens = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const n = Number(tokens[0]);
const words = tokens.slice(1, 1 + n);
if (words.some(w => !/^[a-z]+$/.test(w))) {
    console.log("Invalid");
} else {
    const count = new Map();
    for (const w of words) count.set(w, (count.get(w) ?? 0) + 1);
    const items = [...count.entries()];
    // 次數大的在前；次數相同時依單字的字典序（鍵不會重複，所以不會完全相等）
    items.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    console.log(items.map(([w, c]) => w + " " + c).join("\n"));
}`,
      },
      judge: 'none',
    },
  ],
};
