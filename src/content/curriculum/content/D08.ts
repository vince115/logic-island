import type { LessonContent, TraceStep } from '../schema';
import { hashSteps, type HashOp } from '../simulate';

const code = String.raw;

/** The trace's set operations over 7 buckets (illustrative hash: integer mod 7), with why each step happens. */
const traceOps: { op: HashOp; why: string; print?: string; ask?: string }[] = [
  { op: { op: 'add', key: 10, line: 2 }, why: '10 第一次出現，加入集合。' },
  { op: { op: 'add', key: 4, line: 3 }, why: '4 落在另一個桶，和 10 互不干擾。' },
  { op: { op: 'add', key: 24, line: 4 }, why: '24 和 10 算出同一個桶號，這叫碰撞（collision）：兩個不同的元素都存著，只是查這個桶時要多比對一個。' },
  { op: { op: 'add', key: 10, line: 5 }, why: '`add` 遇到重複元素不會報錯，也不會多存一份，size 仍是 3。這就是集合能「去重」的原因。' },
  { op: { op: 'add', key: 15, line: 6 }, why: '15 放進桶 1。' },
  { op: { op: 'contains', key: 24, line: 7 }, why: '查詢只看算出來的那一個桶，不必看其他 6 個桶，所以平均是 O(1)。印出 True。', print: 'True', ask: '24 in seen' },
  { op: { op: 'contains', key: 5, line: 8 }, why: '桶 5 是空的，馬上就知道 5 不在集合裡。印出 False。', print: 'False', ask: '5 in seen' },
  { op: { op: 'remove', key: 10, line: 9 }, why: '`remove` 刪除存在的元素；如果元素不存在，Python 的 `remove` 會丟出 `KeyError`，`discard` 則安靜地什麼都不做。' },
  { op: { op: 'contains', key: 10, line: 10 }, why: '10 剛被移除，桶 3 只剩 24，印出 False。', print: 'False', ask: '10 in seen' },
];

const printed: string[] = [];
const simulated: TraceStep[] = hashSteps('seen', 7, 'set', traceOps.map(t => t.op)).map((step, i) => {
  const t = traceOps[i];
  if (t.print) printed.push(t.print);
  const vars = { size: step.vars!.size, 負載因子: step.vars!.負載因子, ...(t.ask ? { [t.ask]: t.print! } : {}) };
  return { ...step, note: `${step.note}${t.why}`, vars, ...(printed.length ? { output: printed.join('\n') } : {}) };
});
const last = simulated[simulated.length - 1];

/**
 * D08 Set. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * 2026-11-02: also offers JavaScript (Node.js); `Set` keeps insertion order, so sorted output sorts first; set algebra
 * uses filter + has (Node.js 22's `union`/`intersection` are mentioned but not required).
 */
export const D08: LessonContent = {
  lessonId: 'D08',
  motivation: '「這個帳號註冊過了嗎？」「這篇文章用了幾個不同的單字？」「兩個班級有哪些同學同時選修？」這類問題只在乎一個元素在不在、有幾個不同的元素，而不在乎它出現在第幾個位置或出現幾次。集合（set）正是為此設計的：它只存不重複的元素，查詢「在不在」非常快，還能直接做聯集、交集、差集。它的限制也很清楚：沒有索引，不能問「第 k 個是誰」；雜湊集合甚至沒有可靠的順序；也不能記錄次數或附帶資料，那要用下一課的 map。',
  sections: [
    {
      id: 'what-is-set', title: '集合：只存不重複的元素',
      blocks: [
        { type: 'p', text: '集合（set）是一群不重複（distinct）元素的容器。把同一個值加入第二次，集合不會變；它也不記得元素是第幾個放進來的。最常用的操作只有三個：' },
        { type: 'list', items: [
          '`add`／`insert`：加入一個元素；已經存在時什麼都不做。',
          '`contains`：查詢元素在不在集合裡，也叫成員查詢（membership test）。',
          '`remove`／`erase`：刪除一個元素。',
        ] },
        { type: 'p', text: '這三個操作帶來兩種典型用法。第一是去重（dedupe）：把資料全部放進集合，重複的自然只剩一份，集合的大小就是「有幾個不同的值」。第二是成員查詢：先把名單放進集合，之後每次查詢都很快。下面的範例對同一串數字做兩種去重：一種保留第一次出現的順序（一邊走訪一邊用集合記錄「看過了沒」），一種直接得到由小到大的結果。' },
        { type: 'example', id: 'dedupe' },
        { type: 'p', text: 'C++ 的 `insert` 回傳一對值 `{位置, 是否真的新增}`，`.second` 為 `false` 就代表元素原本已存在；Java 的 `add` 直接回傳 `boolean`；Python 的 `add` 回傳 `None`，要先用 `x not in seen` 判斷。Java 的 `LinkedHashSet` 會記住插入順序，所以一行就能做到「保留第一次出現的順序」去重。JavaScript 的 `Set` 用 `add`、`has`、`delete`，而且一律依插入順序走訪，所以 `[...new Set(a)]` 也是一行去重並保留首次出現的順序；要由小到大，就再 `sort((x, y) => x - y)`。' },
      ],
    },
    {
      id: 'ordered-vs-hash', title: '雜湊集合與有序集合',
      blocks: [
        { type: 'p', text: '集合有兩種常見的實作方式。雜湊集合（hash set）用雜湊函數（hash function）把元素算成一個桶（bucket）的編號，元素就放在那個桶裡；查詢時只要算出桶號、在那一個桶裡比對，不必看全部元素。不同元素算出同一個桶號叫碰撞（collision），這時同一個桶裡會有好幾個元素。只要元素平均分散、每個桶都很短，加入、查詢、刪除平均都是 O(1)；萬一大量元素擠在同一個桶，最差會退化成 O(n)。' },
        { type: 'p', text: '下方的視覺化用 7 個桶追蹤一個 Python 集合。為了能用手算，桶號用本課的示意雜湊：整數 mod 7（例如 24 mod 7 = 3）。這不是 Python 真正的 `hash()`，Python 實際的表格大小與碰撞處理方式也不同；雜湊函數、碰撞處理與負載因子（load factor，元素數 ÷ 桶數）的細節留到 D10。' },
        { type: 'p', text: '有序集合（ordered set）則用平衡二元搜尋樹（balanced BST）存放元素，元素一直保持由小到大，加入、查詢、刪除都是 O(log n)。它比雜湊集合慢一點，換來兩個好處：走訪時一定是排序好的，而且能快速拿到最小值、最大值，或「大於等於 x 的第一個元素」。' },
        { type: 'table', head: ['容器', '底層', '加入／查詢／刪除', '走訪順序'], rows: [
          ['C++ `std::unordered_set`', '雜湊表', '平均 O(1)，最差 O(n)', '未指定（unspecified）'],
          ['C++ `std::set`', '平衡 BST（常見實作是紅黑樹）', 'O(log n)', '由小到大'],
          ['Python `set`', '雜湊表', '平均 O(1)，最差 O(n)', '未指定'],
          ['Java `HashSet`', '雜湊表', '平均 O(1)，最差 O(n)', '未指定'],
          ['Java `LinkedHashSet`', '雜湊表＋記錄順序的鏈結串列', '平均 O(1)', '插入順序'],
          ['Java `TreeSet`', '紅黑樹', 'O(log n)', '由小到大'],
          ['JavaScript `Set`', '雜湊表（引擎實作，規格只要求平均比 O(n) 快）', '平均 O(1)', '插入順序'],
          ['對照：`vector`／`list`／`ArrayList`／JavaScript 陣列', '動態陣列', '加入尾端攤銷 O(1)；查詢、刪除 O(n)', '放入的順序'],
        ] },
        { type: 'p', text: '挑選的原則：只需要「在不在」與去重，用雜湊集合；需要排序輸出、最小／最大值或範圍查詢，用有序集合。Python 標準庫沒有內建的有序集合，要排序時就用 `sorted(s)` 產生一個排序好的 list，這一步是 O(k log k)，k 是集合的大小。JavaScript 也沒有有序集合，寫成 `[...s].sort((x, y) => x - y)`；一定要給比較函式，因為預設的 `sort()` 是依字串排序。' },
        { type: 'example', id: 'membership' },
        { type: 'p', text: '注意刪除不存在的元素時四種語言的反應：C++ 的 `erase(x)` 回傳刪掉的個數（0 或 1），Java 的 `remove(x)` 與 JavaScript 的 `delete(x)` 回傳 `false`，三者都不會出錯；Python 的 `remove(x)` 會丟出 `KeyError`，不確定元素在不在時改用 `discard(x)`。C++17 沒有 `contains`（C++20 才加入），查詢用 `count(x)` 或 `find(x) != s.end()`。' },
      ],
    },
    {
      id: 'languages', title: '四種語言的集合細節',
      blocks: [
        { type: 'p', text: 'C++：`std::set<T>` 需要元素能用 `<` 比大小；`std::unordered_set<T>` 需要元素能計算雜湊值並用 `==` 比較，`int`、`long long`、`std::string` 都已經內建支援。兩者都把元素當成值（value）複製進去，之後改原本的變數不會影響集合。' },
        { type: 'p', text: 'Python：`set` 是可變的（mutable），可以 `add`、`remove`；`frozenset` 是不可變的（immutable）版本，建立後就不能改。集合的元素必須是可雜湊的（hashable）：`int`、`str`、`tuple`（裡面也都可雜湊時）可以，但 `list`、`dict`、`set` 這些可變的容器不行，寫 `{[1, 2]}` 會得到 `TypeError: unhashable type: \'list\'`。要把「一組值」放進集合，改用 tuple；要做「集合的集合」，內層用 `frozenset`。' },
        { type: 'p', text: 'Java：集合只能放物件，`int` 會自動裝箱（autoboxing）成 `Integer`。`HashSet` 靠元素的 `hashCode()` 找桶、`equals()` 判斷是否相同；`TreeSet` 改用 `compareTo()`（或你給的 `Comparator`）排序與判斷相同。`Integer`、`String` 已經寫好這些方法；Java 實作上 `HashSet` 內部其實是一個只用鍵的 `HashMap`。' },
        { type: 'p', text: 'JavaScript：`Set` 判斷兩個元素是否相同的規則和 `===` 幾乎一樣（只有 `NaN` 被視為等於自己）。數字和字串依值比較，但陣列和物件依參考（reference）比較：`new Set([[1, 2], [1, 2]])` 有 2 個元素，`s.has([1, 2])` 也是 `false`，因為每個 `[1, 2]` 都是新的陣列。要把「一組值」放進集合，常見做法是先轉成字串鍵，例如 `"1,2"`。' },
        { type: 'callout', tone: 'note', title: '自訂類別要同時定義 equals 與 hashCode', text: '在 Java 中，若只覆寫 `equals()` 卻沒有覆寫 `hashCode()`，兩個「相等」的物件可能算出不同的雜湊值、落在不同的桶，於是同一個學生被加入 `HashSet` 兩次，`contains` 也找不到。規則是：`equals` 相等的兩個物件，`hashCode` 必須相同。Java 的 `record` 會自動產生一致的 `equals` 與 `hashCode`。另外，元素放進雜湊集合之後不要再修改會影響雜湊值的欄位，否則它會「卡」在錯誤的桶裡。' },
      ],
    },
    {
      id: 'set-algebra', title: '聯集、交集、差集',
      blocks: [
        { type: 'p', text: '集合可以像數學一樣運算：聯集（union）是出現在任一邊的元素，交集（intersection）是兩邊都有的元素，差集（difference）A − B 是在 A 但不在 B 的元素。四種語言的寫法差異很大：' },
        { type: 'list', items: [
          'Python：運算子 `a | b`（聯集）、`a & b`（交集）、`a - b`（差集）、`a ^ b`（只在其中一邊）都會產生新集合；也有同名方法 `union`、`intersection`、`difference`。',
          'C++：`<algorithm>` 的 `std::set_union`、`std::set_intersection`、`std::set_difference` 作用在兩段已排序的範圍上，結果寫到輸出迭代器（常用 `std::back_inserter(v)` 接到 vector 後面）。`std::set` 走訪本來就是排序的，可以直接用；`unordered_set` 要先複製到 vector 排序。',
          'Java：`addAll`（聯集）、`retainAll`（交集）、`removeAll`（差集）會直接修改呼叫它的集合，所以要先複製一份，例如 `new TreeSet<>(a)`，否則原本的 a 就被改掉了。',
          'JavaScript：Node.js 22 起 `Set` 有 `union`、`intersection`、`difference`、`symmetricDifference` 方法，都回傳新集合；較舊的版本用 `new Set([...a, ...b])` 與 `[...a].filter(x => b.has(x))` 這類寫法。本課範例用後者，兩種版本都能執行。',
        ] },
        { type: 'example', id: 'set-ops' },
        { type: 'p', text: '用雜湊集合做交集時，走訪較小的那個集合、逐一查詢是否在另一個集合中，平均 O(min(|A|, |B|))；有序集合的 `set_intersection` 是同時往前走兩個排序序列，O(|A| + |B|)。這一課的練習題就是交集與差集的應用。' },
      ],
    },
    {
      id: 'pitfalls-compare', title: '常見陷阱與結構比較',
      blocks: [
        { type: 'callout', tone: 'warning', title: '不要依賴雜湊集合的走訪順序', text: '`unordered_set`、`HashSet` 與 Python `set` 的走訪順序是未指定的：它取決於雜湊值、表格大小與加入／刪除的歷史，換一個編譯器、Java 版本或資料就可能改變。Python 的字串雜湊預設每次執行都會隨機化，同一個程式跑兩次，字串集合的印出順序可能不同。小整數的 Python 集合有時「看起來」是排序好的（例如 `{3, 1, 2}` 印出 `{1, 2, 3}`），但 `{8, 1}` 會印出 `{8, 1}`，這只是巧合。JavaScript 的 `Set` 則保證依插入順序走訪，但插入順序不是排序。輸出前一律先排序，或改用有序集合。' },
        { type: 'callout', tone: 'warning', title: '走訪集合時不要修改它', text: 'Python 在 `for x in s:` 迴圈裡對 `s` 加入或刪除元素，會丟出 `RuntimeError: Set changed size during iteration`；Java 在 for-each 迴圈中呼叫 `s.remove(x)` 通常會丟出 `ConcurrentModificationException`。正確做法：Python 走訪一份複本 `for x in list(s):`，或用集合推導式建立新集合；Java 用 `s.removeIf(x -> x % 2 == 0)` 或迭代器的 `it.remove()`；C++ 的 `erase` 會讓指向被刪元素的迭代器失效，要寫 `it = s.erase(it);` 接住下一個位置，而 `unordered_set` 插入時若重新雜湊（rehash），所有迭代器都會失效。JavaScript 的 `Set` 在 `for...of` 中加入或刪除不會丟出例外：還沒走到就被刪除的元素不會出現，新加入的元素會被走到，所以邊走邊加入可能永遠停不下來。' },
        { type: 'callout', tone: 'warning', title: 'Python 的 {} 是空字典，不是空集合', text: '`s = {}` 建立的是空的 dict，接著 `s.add(1)` 會丟出 `AttributeError: \'dict\' object has no attribute \'add\'`。空集合要寫 `s = set()`；只有大括號裡有元素時，例如 `{1, 2}`，才是集合字面值。' },
        { type: 'p', text: '和陣列／list 比較：list 保留順序、允許重複、可以用索引，但 `x in list`（JavaScript 是 `arr.includes(x)`）要逐一比對，是 O(n)。若名單有 n 個元素、要查 q 次，list 總共 O(n × q)，集合平均 O(n + q)。所以「會重複查詢在不在」時，先把資料轉成集合；只查一兩次則直接用 list 也無妨，建立集合本身也要 O(n)。' },
        { type: 'p', text: '和 map（D09）比較：集合只存鍵（key），回答「在不在」；map 存「鍵 → 值」的對照，例如「單字 → 出現次數」。只要需要附帶資料或計數，就該用 map。兩者的底層幾乎一樣：C++ 的 `set`／`map` 都是平衡 BST，`unordered_set`／`unordered_map` 都是雜湊表；Java 的 `HashSet` 本身就用 `HashMap` 實作；Python 的 `dict` 的鍵也和 `set` 一樣必須可雜湊。' },
      ],
    },
  ],
  examples: [
    {
      id: 'dedupe', title: '兩種去重：保留首次出現順序與排序', description: '同一串數字，一次保留第一次出現的順序，一次由小到大，並印出不同值的個數。',
      output: 'first seen: 5 3 1 8\nsorted: 1 3 5 8\ndistinct: 4',
      code: {
        'C++': code`#include <iostream>
#include <set>
#include <unordered_set>
#include <vector>

int main() {
    std::vector<int> a = {5, 3, 5, 1, 3, 8, 1};
    std::unordered_set<int> seen;
    std::cout << "first seen:";
    for (int x : a) {
        if (seen.insert(x).second) std::cout << " " << x;  // .second：是否真的新增
    }
    std::cout << "\n";
    std::set<int> ordered(a.begin(), a.end());  // std::set 自動排序並去重
    std::cout << "sorted:";
    for (int x : ordered) std::cout << " " << x;
    std::cout << "\n";
    std::cout << "distinct: " << seen.size() << "\n";
    return 0;
}`,
        Python: code`a = [5, 3, 5, 1, 3, 8, 1]
seen = set()
order = []
for x in a:
    if x not in seen:
        seen.add(x)
        order.append(x)
print("first seen:", *order)
print("sorted:", *sorted(set(a)))
print("distinct:", len(seen))`,
        Java: code`import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class Main {
    static String join(Set<Integer> s) {
        StringBuilder sb = new StringBuilder();
        for (int x : s) sb.append(" ").append(x);
        return sb.toString();
    }

    public static void main(String[] args) {
        List<Integer> a = List.of(5, 3, 5, 1, 3, 8, 1);
        Set<Integer> firstSeen = new LinkedHashSet<>(a);  // 記住插入順序
        Set<Integer> ordered = new TreeSet<>(a);          // 由小到大
        System.out.println("first seen:" + join(firstSeen));
        System.out.println("sorted:" + join(ordered));
        System.out.println("distinct: " + firstSeen.size());
    }
}`,
        JavaScript: code`const a = [5, 3, 5, 1, 3, 8, 1];
const firstSeen = new Set(a);  // Set 記住插入順序，重複的只留第一次
console.log("first seen:", [...firstSeen].join(" "));
console.log("sorted:", [...firstSeen].sort((x, y) => x - y).join(" "));
console.log("distinct:", firstSeen.size);`,
      },
    },
    {
      id: 'membership', title: '成員查詢與刪除', description: '把已註冊的編號放進雜湊集合，依序回答查詢；刪除一個、加入一個之後再查一次。輸出依查詢順序，不依賴集合的走訪順序。',
      output: '205 yes\n999 no\n404 yes\n205 no\ncount: 4',
      code: {
        'C++': code`#include <iostream>
#include <unordered_set>

int main() {
    std::unordered_set<int> registered = {101, 205, 333, 404};
    for (int q : {205, 999, 404}) {
        std::cout << q << " " << (registered.count(q) ? "yes" : "no") << "\n";
    }
    registered.erase(205);
    registered.erase(999);  // 不存在：回傳 0，不會出錯
    registered.insert(500);
    std::cout << 205 << " " << (registered.count(205) ? "yes" : "no") << "\n";
    std::cout << "count: " << registered.size() << "\n";
    return 0;
}`,
        Python: code`registered = {101, 205, 333, 404}
for q in [205, 999, 404]:
    print(q, "yes" if q in registered else "no")
registered.remove(205)
registered.discard(999)  # 不存在也不會出錯；remove(999) 會丟出 KeyError
registered.add(500)
print(205, "yes" if 205 in registered else "no")
print("count:", len(registered))`,
        Java: code`import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Set<Integer> registered = new HashSet<>(List.of(101, 205, 333, 404));
        for (int q : new int[] {205, 999, 404}) {
            System.out.println(q + " " + (registered.contains(q) ? "yes" : "no"));
        }
        registered.remove(205);
        registered.remove(999);  // 不存在：回傳 false，不會出錯
        registered.add(500);
        System.out.println(205 + " " + (registered.contains(205) ? "yes" : "no"));
        System.out.println("count: " + registered.size());
    }
}`,
        JavaScript: code`const registered = new Set([101, 205, 333, 404]);
for (const q of [205, 999, 404]) {
    console.log(q, registered.has(q) ? "yes" : "no");
}
registered.delete(205);
registered.delete(999);  // 不存在：回傳 false，不會出錯
registered.add(500);
console.log(205, registered.has(205) ? "yes" : "no");
console.log("count:", registered.size);`,
      },
    },
    {
      id: 'set-ops', title: '聯集、交集與差集', description: 'A = {1, 2, 3, 4, 5}、B = {4, 5, 6, 7}，四種運算的結果都排序後印出。',
      output: 'union: 1 2 3 4 5 6 7\nintersection: 4 5\nA - B: 1 2 3\nB - A: 6 7',
      code: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <iterator>
#include <set>
#include <string>
#include <vector>

void show(const std::string& name, const std::vector<int>& v) {
    std::cout << name << ":";
    for (int x : v) std::cout << " " << x;
    std::cout << "\n";
}

int main() {
    std::set<int> a = {1, 2, 3, 4, 5};
    std::set<int> b = {4, 5, 6, 7};
    std::vector<int> u, both, aOnly, bOnly;
    std::set_union(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(u));
    std::set_intersection(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(both));
    std::set_difference(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(aOnly));
    std::set_difference(b.begin(), b.end(), a.begin(), a.end(), std::back_inserter(bOnly));
    show("union", u);
    show("intersection", both);
    show("A - B", aOnly);
    show("B - A", bOnly);
    return 0;
}`,
        Python: code`a = {1, 2, 3, 4, 5}
b = {4, 5, 6, 7}
print("union:", *sorted(a | b))
print("intersection:", *sorted(a & b))
print("A - B:", *sorted(a - b))
print("B - A:", *sorted(b - a))`,
        Java: code`import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class Main {
    static void show(String name, Set<Integer> s) {
        StringBuilder sb = new StringBuilder(name + ":");
        for (int x : s) sb.append(" ").append(x);
        System.out.println(sb);
    }

    public static void main(String[] args) {
        Set<Integer> a = new TreeSet<>(List.of(1, 2, 3, 4, 5));
        Set<Integer> b = new TreeSet<>(List.of(4, 5, 6, 7));
        Set<Integer> union = new TreeSet<>(a);
        union.addAll(b);
        Set<Integer> both = new TreeSet<>(a);
        both.retainAll(b);
        Set<Integer> aOnly = new TreeSet<>(a);
        aOnly.removeAll(b);
        Set<Integer> bOnly = new TreeSet<>(b);
        bOnly.removeAll(a);
        show("union", union);
        show("intersection", both);
        show("A - B", aOnly);
        show("B - A", bOnly);
    }
}`,
        JavaScript: code`function show(name, values) {
    console.log(name + ":", [...values].sort((x, y) => x - y).join(" "));
}

const a = new Set([1, 2, 3, 4, 5]);
const b = new Set([4, 5, 6, 7]);
// 用 filter 搭配 has 計算，較舊的 Node.js 也能執行（Node.js 22 起也可以寫 a.union(b) 等方法）
const union = new Set([...a, ...b]);
const both = [...a].filter(x => b.has(x));
const aOnly = [...a].filter(x => !b.has(x));
const bOnly = [...b].filter(x => !a.has(x));
show("union", union);
show("intersection", both);
show("A - B", aOnly);
show("B - A", bOnly);`,
      },
    },
  ],
  visualization: {
    kind: 'hash-table', title: '雜湊集合：元素依桶號放進 7 個桶', language: 'Python',
    code: code`seen = set()
seen.add(10)
seen.add(4)
seen.add(24)
seen.add(10)
seen.add(15)
print(24 in seen)
print(5 in seen)
seen.remove(10)
print(10 in seen)
print(len(seen))`,
    steps: [
      { line: 1, note: '建立空集合 seen，畫成 7 個空桶。桶號用本課的示意雜湊「整數 mod 7」計算，方便手算；這不是 Python 真正的 hash() 與表格大小（真正的做法在 D10 介紹），但「先算桶號、只在那個桶裡找」的想法相同。',
        buckets: { name: 'seen', buckets: [[], [], [], [], [], [], []] }, vars: { size: '0', 負載因子: '0.00' } },
      ...simulated,
      { line: 11, note: '`len(seen)` 是集合裡不同元素的個數：加入 6 次（其中 10 重複一次）、刪除 1 個，剩下 4、24、15 共 3 個。印出 3。注意不要依賴集合的印出順序，要有順序就用 `sorted(seen)`。',
        buckets: last.buckets, vars: { size: '3', 負載因子: last.vars!.負載因子, 'len(seen)': '3' }, output: [...printed, '3'].join('\n') },
    ],
    playground: { structure: 'hash-set', buckets: 7 },
  },
  quiz: [
    {
      id: 'q-len', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: code`s = set()
for x in [3, 1, 3, 2, 1]:
    s.add(x)
s.add(2)
print(len(s))` },
      options: ['3', '5', '6', '4'],
      answer: 0, explanation: '集合只存不重複的元素：依序加入 3、1、3、2、1 後只有 {1, 2, 3}，再加入 2 也不會變，所以長度是 3。「5」是把它當成 list 只算迴圈的部分，「6」把每次 add 都算進去，「4」是以為最後的 `add(2)` 會多存一份。',
    },
    {
      id: 'q-sorted', prompt: '下面的 C++ 片段輸出什麼？',
      code: { language: 'C++', text: code`std::set<int> s = {5, 1, 4, 1, 3};
for (int x : s) std::cout << x << " ";` },
      options: ['5 1 4 1 3', '1 3 4 5', '5 1 4 3', '順序未指定，每次可能不同'],
      answer: 1, explanation: '`std::set` 是有序集合：重複的 1 只留一份，走訪時一定由小到大，輸出 `1 3 4 5`。「5 1 4 1 3」忘了去重；「5 1 4 3」以為它保留插入順序；「順序未指定」說的是 `std::unordered_set`，不是 `std::set`。',
    },
    {
      id: 'q-choose', prompt: '有 10^5 個禁用詞，接著要回答 10^5 次「這個詞是否被禁用」。在 Python 中，哪一種做法最合適？',
      options: ['把禁用詞存成 list，每次用 `w in banned` 查詢', '每次查詢前把 list 排序一次，再逐一比對', '把禁用詞存成 set，每次用 `w in banned` 查詢', '把禁用詞存成 list，查詢前先 `banned.reverse()`'],
      answer: 2, explanation: 'set 的 `in` 平均 O(1)，總共約 10^5 次查詢加上建立集合的 10^5，很快。list 的 `in` 要逐一比對，是 O(n)，總共約 10^5 × 10^5 = 10^10 次比較，太慢；每次重新排序更慢（每次 O(n log n)），排序後還是逐一比對也沒有用；反轉 list 不會改變查詢成本。',
    },
    {
      id: 'q-complexity', prompt: '關於 C++ 的 `std::set` 與 `std::unordered_set`，哪一個敘述正確？',
      options: ['兩者都是平均 O(1)，只是名字不同', '`unordered_set` 的查詢最差情況也保證 O(1)', '`std::set` 用雜湊表實作，所以走訪順序是插入順序', '`std::set` 的加入與查詢是 O(log n)、走訪由小到大；`unordered_set` 平均 O(1)、走訪順序未指定'],
      answer: 3, explanation: '`std::set` 是平衡二元搜尋樹（常見是紅黑樹），操作 O(log n)，元素保持排序；`std::unordered_set` 是雜湊表，平均 O(1)，但碰撞嚴重時最差 O(n)，走訪順序未指定。所以「最差也保證 O(1)」錯；`std::set` 不是雜湊表，也不保留插入順序（保留插入順序的是 Java 的 `LinkedHashSet`）。',
    },
    {
      id: 'q-unhashable', prompt: '執行下面的 Python 程式會怎樣？',
      code: { language: 'Python', text: code`s = {[1, 2], [3]}
print(len(s))` },
      options: ['輸出 2', '丟出 TypeError：list 不可雜湊（unhashable）', '輸出 3：集合把 list 攤平', '建立一個 dict，輸出 2'],
      answer: 1, explanation: '集合的元素必須可雜湊，而 list 是可變的、不可雜湊，所以建立集合時就丟出 `TypeError: unhashable type: \'list\'`，`print` 根本不會執行。集合不會把 list 攤平；這也不是 dict（dict 字面值要有 `鍵: 值`）。要放一組值，改用 tuple，例如 `{(1, 2), (3,)}`，那樣才會輸出 2。',
    },
    {
      id: 'q-empty-braces', prompt: '下面的 Python 程式在哪一行出錯？',
      code: { language: 'Python', text: code`s = {}
s.add(1)
print(len(s))` },
      options: ['第 1 行：大括號裡不能是空的', '不會出錯，輸出 1', '第 3 行：空集合不能取 len', '第 2 行：`{}` 是空的 dict，沒有 add 方法'],
      answer: 3, explanation: '`{}` 是空字典（dict），不是空集合，所以第 2 行 `s.add(1)` 丟出 `AttributeError: \'dict\' object has no attribute \'add\'`。第 1 行本身合法（建立空 dict）；第 3 行不會執行到，而且空集合或空 dict 取 len 都合法。空集合要寫 `set()`。',
    },
  ],
  exercises: [
    {
      id: 'e-common-ids', title: '兩份名單的交集與差集',
      statement: '學校有兩份選修名單：第一份是程式社的學生編號，第二份是數學社的學生編號。名單可能重複登記同一個人。請輸出兩個社團都參加的學生編號，以及只參加程式社（不在數學社名單中）的學生編號，各自由小到大、每個編號只出現一次。每份名單前面會先給登記的人數；若某份名單實際列出的編號個數和宣告的人數不同，表示資料有誤，只輸出一行 `Invalid`。',
      inputFormat: '共四行。第 1 行是整數 n；第 2 行是程式社名單，以空白分隔的整數；第 3 行是整數 m；第 4 行是數學社名單。',
      outputFormat: '資料正確時輸出兩行：第 1 行是兩份名單都有的編號（由小到大，以一個空白分隔），第 2 行是只在第一份名單的編號（同樣格式）；某一行沒有任何編號時輸出 `None`。資料有誤時只輸出 `Invalid`。',
      constraints: ['1 ≤ n, m ≤ 2×10^5', '編號是 1～10^9 的整數', '第 2、4 行只含整數，但個數可能和宣告的不同', '要求平均 O((n + m) log(n + m)) 以內，不要對每個編號掃描整份名單（那是 O(n × m)）'],
      samples: [{ kind: 'normal', input: '6\n105 101 103 101 108 103\n5\n103 110 105 105 120\n', output: '103 105\n101 108', note: '101、103 重複登記，各只算一次' }],
      tests: [
        { kind: 'normal', input: '6\n105 101 103 101 108 103\n5\n103 110 105 105 120\n', output: '103 105\n101 108', note: '範例' },
        { kind: 'normal', input: '5\n9 4 7 1 4\n4\n2 7 9 3\n', output: '7 9\n1 4', note: '輸出要排序，不是輸入的順序' },
        { kind: 'edge', input: '3\n1 2 3\n2\n4 5\n', output: 'None\n1 2 3', note: '交集是空的' },
        { kind: 'edge', input: '2\n5 5\n3\n5 6 7\n', output: '5\nNone', note: '第一份名單全部重複，而且都在第二份名單中：差集是空的' },
        { kind: 'edge', input: '1\n7\n1\n7\n', output: '7\nNone', note: '各只有一個人' },
        { kind: 'edge', input: '3\n1000000000 999999999 1000000000\n2\n1000000000 1\n', output: '1000000000\n999999999', note: '編號達到 10^9' },
        { kind: 'edge', input: '1000\n' + Array(1000).fill('42').join(' ') + '\n1\n42\n', output: '42\nNone', note: '1000 筆全是同一個編號' },
        { kind: 'error', input: '3\n1 2\n2\n1 2\n', output: 'Invalid', note: '宣告 3 人，只列出 2 個編號' },
        { kind: 'error', input: '2\n1 2\n3\n1 2 3 4\n', output: 'Invalid', note: '宣告 3 人，卻列出 4 個編號' },
      ],
      hints: [
        '先逐行讀入，數一數第 2、4 行各有幾個編號，和宣告的 n、m 比較，不同就輸出 `Invalid`。',
        '把第二份名單放進雜湊集合，之後每次「在不在」平均 O(1)。',
        '第一份名單也要去重：可以先放進集合，或用 C++ 的 `insert(x).second` 判斷是不是第一次看到。',
        '雜湊集合的走訪順序未指定，輸出前一定要排序（或改用 `std::set`／`TreeSet`）；JavaScript 的 `Set` 依插入順序，也一樣要排序。',
      ],
      solution: {
        'C++': code`#include <algorithm>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

std::vector<int> readIds(const std::string& line) {
    std::istringstream in(line);
    std::vector<int> ids;
    int x;
    while (in >> x) ids.push_back(x);
    return ids;
}

void printSorted(std::vector<int> v) {
    if (v.empty()) {
        std::cout << "None\n";
        return;
    }
    std::sort(v.begin(), v.end());
    for (std::size_t i = 0; i < v.size(); ++i) std::cout << (i ? " " : "") << v[i];
    std::cout << "\n";
}

int main() {
    std::ios::sync_with_stdio(false);
    std::string l1, l2, l3, l4;
    std::getline(std::cin, l1);
    std::getline(std::cin, l2);
    std::getline(std::cin, l3);
    std::getline(std::cin, l4);
    std::size_t n = std::stoul(l1), m = std::stoul(l3);
    std::vector<int> a = readIds(l2), b = readIds(l4);
    if (a.size() != n || b.size() != m) {
        std::cout << "Invalid\n";
        return 0;
    }
    std::unordered_set<int> inB(b.begin(), b.end());
    std::unordered_set<int> seen;
    std::vector<int> both, onlyA;
    for (int x : a) {
        if (!seen.insert(x).second) continue;  // 重複登記只算一次
        if (inB.count(x)) both.push_back(x);
        else onlyA.push_back(x);
    }
    printSorted(both);
    printSorted(onlyA);
    return 0;
}`,
        Python: code`import sys

lines = sys.stdin.read().splitlines() + ["", "", "", ""]
n = int(lines[0])
a = lines[1].split()
m = int(lines[2])
b = lines[3].split()
if len(a) != n or len(b) != m:
    print("Invalid")
else:
    first = set(map(int, a))
    second = set(map(int, b))
    both = sorted(first & second)
    only = sorted(first - second)
    print(" ".join(map(str, both)) if both else "None")
    print(" ".join(map(str, only)) if only else "None")`,
        Java: code`import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashSet;
import java.util.Set;
import java.util.TreeSet;

public class Main {
    static String[] ids(String line) {
        String t = line == null ? "" : line.trim();
        return t.isEmpty() ? new String[0] : t.split("\\s+");
    }

    static String joinOrNone(Set<Integer> s) {
        if (s.isEmpty()) return "None";
        StringBuilder sb = new StringBuilder();
        for (int x : s) {
            if (sb.length() > 0) sb.append(" ");
            sb.append(x);
        }
        return sb.toString();
    }

    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(br.readLine().trim());
        String[] a = ids(br.readLine());
        int m = Integer.parseInt(br.readLine().trim());
        String[] b = ids(br.readLine());
        if (a.length != n || b.length != m) {
            System.out.println("Invalid");
            return;
        }
        Set<Integer> inB = new HashSet<>();
        for (String t : b) inB.add(Integer.parseInt(t));
        Set<Integer> both = new TreeSet<>();   // TreeSet 自動去重並排序
        Set<Integer> onlyA = new TreeSet<>();
        for (String t : a) {
            int x = Integer.parseInt(t);
            if (inB.contains(x)) both.add(x);
            else onlyA.add(x);
        }
        System.out.println(joinOrNone(both));
        System.out.println(joinOrNone(onlyA));
    }
}`,
        JavaScript: code`function ids(line) {
    const t = line.trim();
    return t === "" ? [] : t.split(/\s+/);
}

const lines = require("fs").readFileSync(0, "utf8").split("\n").concat(["", "", "", ""]);
const n = Number(lines[0]);
const a = ids(lines[1]);
const m = Number(lines[2]);
const b = ids(lines[3]);
if (a.length !== n || b.length !== m) {
    console.log("Invalid");
} else {
    const first = new Set(a.map(Number));  // 重複登記只算一次
    const second = new Set(b.map(Number));
    const both = [...first].filter(x => second.has(x)).sort((x, y) => x - y);
    const only = [...first].filter(x => !second.has(x)).sort((x, y) => x - y);
    console.log(both.length > 0 ? both.join(" ") : "None");
    console.log(only.length > 0 ? only.join(" ") : "None");
}`,
      },
      judge: 'none',
    },
  ],
};
