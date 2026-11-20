import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL07 記憶體模型：堆疊與堆積 (programming-languages island). Every example and the reference solutions run in
 * tests/curriculum-code.test.ts in C++17, Java 17, Python 3 and JavaScript (Node.js). No example executes undefined
 * behaviour: dangling pointers, leaks and unchecked out-of-bounds access are described in prose, tables and the quiz,
 * and the examples show the safe versions. The blueprint's activity memory-model is not built, so the lesson uses the
 * function-call trace (stack frames) with a step table that lists the heap objects and who refers to them.
 */
export const PL07: LessonContent = {
  lessonId: 'PL07',
  motivation: '「我只改了 b，為什麼 a 也變了？」「函式明明把 list 換掉了，呼叫者怎麼還是舊的？」「C++ 程式在我的電腦上正常，換一台就當掉」——這些問題的答案都在記憶體模型裡：資料放在堆疊框架還是堆積、變數存的是值還是參考、物件活到什麼時候。學會畫出呼叫時的堆疊與堆積，就能在執行前預測一段程式改到了誰，也能看出懸空指標、記憶體洩漏與越界存取這些不會在編譯時出現的錯誤。',
  sections: [
    {
      id: 'stack-and-heap', title: '堆疊框架與堆積：資料放在哪裡',
      blocks: [
        { type: 'p', text: '每呼叫一次函式，執行環境就在呼叫堆疊（call stack）頂端放一個堆疊框架（stack frame），裡面有這次呼叫的參數、區域變數，以及回傳後要回到哪裡。函式 return 時，它的框架被整個移除，裡面的區域變數也就不存在了。同一個函式呼叫兩次會得到兩個不同的框架，所以區域變數每次都從頭開始。框架的配置與釋放只是移動堆疊頂端，非常快，但堆疊的大小有限：F18 的遞迴如果太深，就會因為框架太多而發生堆疊溢位（stack overflow）。' },
        { type: 'p', text: '堆積（heap）是另一塊記憶體，放「大小或存活時間無法跟著某一次呼叫決定」的物件：C++ 用 `new` 或 `std::make_unique` 建立的物件、Java 用 `new` 建立的物件與陣列、Python 的所有物件、JavaScript 的物件與陣列。堆積上的物件不會因為建立它的函式 return 就消失；它可以被回傳、被別的物件記住，一直活到被釋放（C++）或再也沒有人參考它而被垃圾回收（Java、Python、JavaScript）為止。' },
        { type: 'example', id: 'frames' },
        { type: 'p', text: '`localCount` 的 count 放在框架裡，每次呼叫都重新從 0 開始，所以兩次都回傳 1。`makeCounter` 建立的 Counter 在堆積上，函式 return 時被移除的只是區域變數 counter（一個指標或參考），物件本身交給了 main，所以 main 還能再加 1 得到 2。' },
        { type: 'table', head: ['語言', '放在堆疊框架裡的', '放在堆積上的'], rows: [
          ['C++', '區域變數本身，包括 struct、class 物件與 `std::vector`、`std::string` 物件的「外殼」', '`new`／`std::make_unique` 建立的物件；`std::vector`、`std::string` 的元素由容器在堆積上管理'],
          ['Java', '基本型別（`int`、`double`、`boolean`…）的區域變數，以及參考變數本身', '所有物件，包括陣列與 `String`；變數裡存的只是指向物件的參考'],
          ['Python', '框架裡是「名稱」，每個名稱綁定到一個物件', '所有值都是物件，連 `1`、`"hi"` 也是；CPython 把它們都放在堆積'],
          ['JavaScript', '基本型別（number、string、boolean、undefined、null、bigint、symbol）的值與參考變數', '物件、陣列、函式'],
        ] },
        { type: 'callout', tone: 'note', title: '這裡的「堆積」不是資料結構的 heap', text: '記憶體的堆積（heap）只是「一塊可以隨時配置與釋放的記憶體」，和資料結構島的 Heap／Priority Queue（父節點不大於子節點的完全二元樹）同名但無關。另外，Java 與 JavaScript 的執行環境可能把確定不會離開函式的物件最佳化成不在堆積上配置，但這不改變程式的行為；這一課描述的是語言保證的語意，而不是某個實作的細節。' },
      ],
    },
    {
      id: 'value-and-reference', title: '值與參考：賦值是複製還是共用',
      blocks: [
        { type: 'p', text: '寫 `b = a` 時，語言可能做兩件完全不同的事。值語意（value semantics）：變數裡存的就是資料本身，賦值會複製一份，之後改 b 不影響 a；這種型別叫值型別（value type）。參考語意（reference semantics）：變數裡存的是指向某個物件的參考（reference），賦值只複製參考，a 與 b 從此是同一個物件的兩個名字，也就是別名（alias）；這種型別叫參考型別（reference type）。' },
        { type: 'example', id: 'assign-object' },
        { type: 'p', text: '同樣是 `b = a` 再改 `b.x`，C++ 的 struct 是值型別，a 不受影響；Java、Python、JavaScript 的物件是參考型別，a.x 跟著變成 9。要得到相反的效果，C++ 要明確寫參考 `Point& r = a`，其他三種語言要明確建立新物件（建構子、`copy.copy`、展開運算子 `{ ...a }`）。JavaScript 版本的 `const b = a` 之後還能改 `b.x`：`const` 只禁止 b 改指向別的物件，不禁止修改物件的內容。' },
        { type: 'table', head: ['語言', '值型別（賦值時複製）', '參考型別（賦值時共用）'], rows: [
          ['C++', '預設全部都是：`int`、struct、class、`std::vector`、`std::string`', '只有明確寫出的參考 `T&` 與指標 `T*`'],
          ['Java', '八種基本型別：`int`、`long`、`double`、`boolean`、`char`…', '其他全部：陣列、`String`、`ArrayList`、自訂類別'],
          ['Python', '沒有；但 `int`、`str`、`tuple` 不可變（immutable），共用也不會被改到，用起來像值', '全部；`list`、`dict`、`set` 與自訂物件可變（mutable），共用時改一個名字，其他名字都看得到'],
          ['JavaScript', 'number、string、boolean 等基本型別', '物件、陣列、函式'],
        ] },
        { type: 'p', text: '不可變物件讓共用變得安全。Python 執行 `b = a` 後再 `b += 1`，因為整數不能被修改，`+=` 只能建立新的整數物件並把 b 重新綁定過去，a 不變；Java 的 `String`、JavaScript 的字串也一樣。可變物件就不同了：Python 的 `ys = xs` 之後 `ys += [2]`，list 的 `+=` 會「就地」修改同一個 list，所以 xs 也多了 2（測驗第 2 題）。判斷兩個名字是不是同一個物件：Python 用 `is`，Java 對物件用 `==`（比內容要用 `equals`），JavaScript 用 `===`；C++ 比較兩個指標是否相等。' },
        { type: 'callout', tone: 'warning', title: '複製了外層，裡面的物件仍然共用', text: '`list(a)`、`a[:]`、`a.clone()`、`[...a]`、`{ ...a }` 都是淺複製（shallow copy）：只建立新的外層容器，裡面的元素如果是物件，新舊容器仍指向同樣的物件。最常見的錯誤是 Python 的 `grid = [[0] * 3] * 3`：外層 list 裡的三個元素是同一個內層 list，`grid[0][0] = 1` 之後三列都變成 `[1, 0, 0]`；JavaScript 的 `Array(3).fill([])` 也是同一個陣列放三次。要三列各自獨立，就逐列建立：`[[0] * 3 for _ in range(3)]`、`Array.from({ length: 3 }, () => [])`。需要整棵結構都複製時才用深複製（Python 的 `copy.deepcopy`、JavaScript 的 `structuredClone`）。C++ 的 `std::vector<std::vector<int>>` 賦值會連內層一起複製，因為內層也是值型別。' },
      ],
    },
    {
      id: 'pointers', title: '指標與參考：C++ 把位址交給你',
      blocks: [
        { type: 'p', text: 'C++ 的指標（pointer）是一個存放「物件在哪裡」的變數：`int* p = &x;` 讓 p 指向 x，`*p = 5` 透過 p 修改 x，指向物件時用 `p->x` 取成員。指標可以改指向別的物件（`p = &y;`），也可以是 `nullptr`，表示沒有指向任何東西，透過 `nullptr` 存取是錯誤。C++ 的參考（reference）`int& r = x;` 則是 x 的別名：宣告時就必須綁定，之後不能改綁，`r = y` 的意思是「把 y 的值寫進 x」，不是讓 r 改指 y（測驗第 4 題）。' },
        { type: 'p', text: 'Java、Python、JavaScript 的參考像是受限的指標：你不能取得或印出位址、不能做指標運算（`p + 1`），也不能手動釋放它指向的物件；只要還有參考指向物件，垃圾回收器就不會釋放它，所以不會指到已經被釋放的記憶體。它們仍然可以是「空的」：Java 的 `null`、Python 的 `None`、JavaScript 的 `null` 與 `undefined`，對空參考呼叫方法會得到 `NullPointerException`、`AttributeError` 或 `TypeError`。' },
        { type: 'table', head: ['', 'C++ 指標 `T*`', 'C++ 參考 `T&`', 'Java／JavaScript 參考、Python 名稱'], rows: [
          ['可以是空的嗎', '可以（`nullptr`）', '不行，必須綁定一個物件', '可以（`null`、`None`、`undefined`）'],
          ['可以改指向別的物件嗎', '可以', '不行，賦值會寫進原本的物件', '可以，重新賦值就改指向'],
          ['可以做位址運算嗎', '可以，在陣列範圍內才合法', '不行', '不行'],
          ['指向的物件會被提早釋放嗎', '會，程式設計師負責', '會，程式設計師負責', '不會，還被參考就不會被回收'],
        ] },
        { type: 'p', text: '所以「Java 沒有指標」只說對了一半：Java 的每個物件變數其實都是一個不能做運算、不會懸空的指標，`NullPointerException` 這個名字就是證據。理解這一點，下一節的參數傳遞就很好預測。' },
      ],
    },
    {
      id: 'passing', title: '參數傳遞：四種語言怎麼把引數交給函式',
      blocks: [
        { type: 'p', text: 'F14 介紹過傳值與 C++ 的傳參考。現在可以把它說得更精確：Java、Python、JavaScript 都只有「傳值」，但物件變數裡的值本來就是參考，所以傳進去的是參考的複本（Java 常說 pass by value of the reference，Python 稱為 call by sharing）。呼叫者的變數與參數是兩個不同的變數，卻指向同一個物件。' },
        { type: 'list', items: [
          '透過參數修改物件內容（`list.add`、`items.append`、`arr[0] = 99`）：改的是共用的物件，呼叫者看得到。',
          '把參數重新賦值成新物件（`list = new ArrayList<>()`、`items = [0]`）：只改了函式框架裡那個參數變數，呼叫者的變數仍指向原來的物件。',
          'C++ 的傳值 `std::vector<int> v` 會複製整個 vector；傳參考 `std::vector<int>& v` 讓 v 成為呼叫者變數的別名，連 `v = {0}` 這種賦值都會改到呼叫者；只想讀、不想複製時用 `const std::vector<int>&`。',
          'C++ 傳指標 `std::vector<int>* p` 的行為和 Java 的參考一樣：`p->push_back(4)` 改到呼叫者，`p = &other` 只改了區域的指標。',
        ] },
        { type: 'example', id: 'pass-args' },
        { type: 'p', text: '前兩行四種語言相同：傳入複本不影響 nums，修改共用的物件就影響 nums。第三行不同：C++ 的 `replace` 透過參考賦值，呼叫者的 vector 被換成 `[0]`；Java、Python、JavaScript 的 `replace` 只讓參數指向新的 list，函式一結束這個新 list 就沒人參考，nums 仍是 `[1, 2, 3, 4]`。' },
        { type: 'p', text: '下方的視覺化逐步追蹤 Java 的 `update(n, arr)`：左邊是呼叫堆疊，表格是堆積上的物件與「被誰參考」。看 n 怎麼被複製、arr 的參考怎麼被複製，以及 `arr = new int[] {7}` 之後，update 的 arr 和 main 的 arr 怎麼分道揚鑣。' },
      ],
    },
    {
      id: 'lifetime', title: '物件生命週期：從建立到釋放',
      blocks: [
        { type: 'p', text: '物件生命週期（object lifetime）是物件從建立到被銷毀的這段時間；只有在生命週期內使用物件才是正確的。堆疊框架裡的區域變數活到所在的區塊或函式結束；堆積上的物件活多久，取決於語言怎麼釋放它。' },
        { type: 'table', head: ['語言', '誰釋放堆積上的物件', '什麼時候'], rows: [
          ['C++', '程式設計師：`delete`，或交給擁有它的 `std::unique_ptr`、`std::vector` 等物件的解構子（destructor）', '確定的時間點：擁有者離開作用域時，解構子立刻執行'],
          ['Java', '垃圾回收器（garbage collector）', '物件再也無法從任何變數到達之後的某個時間，不保證何時'],
          ['Python', 'CPython 以參考計數為主，再加上處理循環參考的回收器', '通常在最後一個參考消失時，但語言本身不保證'],
          ['JavaScript', '引擎的垃圾回收器', '無法到達之後的某個時間，不保證何時'],
        ] },
        { type: 'p', text: 'C++ 把「物件的生命週期」和「資源的釋放」綁在一起，稱為 RAII：物件建立時取得資源，解構子釋放資源，離開作用域就自動執行。垃圾回收的語言只負責回收記憶體，而且時間不確定，所以檔案、網路連線這類必須準時關閉的資源，要用 Java 的 try-with-resources、Python 的 `with`、JavaScript 的 `try`／`finally` 明確關閉，不能等物件被回收。下例在四種語言中印出相同的順序：後開啟的先關閉。' },
        { type: 'example', id: 'scoped-close' },
        { type: 'p', text: 'C++ 的 `close` 由解構子印出，b 在內層大括號結束時、a 在 main 結束時被銷毀，物件的記憶體也在同一刻釋放。其他三種語言印出 `close` 的是 `close()` 或 `__exit__`，那時物件本身仍然存在（JavaScript 的 a 之後還能使用），它的記憶體要等到沒有任何參考後，由垃圾回收器在某個時間回收。參考計數、可達性與垃圾回收的運作方式是 PL08 的主題。' },
      ],
    },
    {
      id: 'memory-bugs', title: '常見記憶體錯誤：懸空指標、記憶體洩漏與越界存取',
      blocks: [
        { type: 'p', text: '懸空指標（dangling pointer）是指向「生命週期已經結束的物件」的指標或參考。最常見的三種來源：回傳區域變數的位址或參考（框架移除後，那塊堆疊會被下一次呼叫重複使用）；`delete` 之後還繼續使用原來的指標（use after free）；以及先取得 `std::vector` 元素的指標或參考，再 `push_back`，容量不夠時 vector 會把元素搬到新的記憶體，舊的指標就指向已釋放的位置（測驗第 7 題）。透過懸空指標讀寫是未定義行為（undefined behavior）：程式可能印出舊值、印出亂碼、當掉，或在測試時一切正常、上線後才出錯。' },
        { type: 'p', text: '記憶體洩漏（memory leak）是不再需要的記憶體一直沒有被釋放，程式跑得越久用得越多。C++ 的典型例子是 `new` 了卻在某條提早 return 的路徑上忘了 `delete`；改用 `std::vector`、`std::unique_ptr` 由解構子自動釋放就不會漏。垃圾回收的語言也會洩漏：只要物件還被參考，回收器就不能回收它，例如一個只加不刪的全域快取、一直累積的事件監聽器（測驗第 6 題）。' },
        { type: 'p', text: '越界存取（out-of-bounds access）是用超出範圍的索引讀寫陣列。四種語言的反應差很多：' },
        { type: 'example', id: 'bounds' },
        { type: 'table', head: ['錯誤', 'C++', 'Java', 'Python', 'JavaScript'], rows: [
          ['懸空指標', '可能發生，未定義行為', '不會：被參考的物件不會被回收', '不會：被參考的物件不會被回收', '不會：被參考的物件不會被回收'],
          ['記憶體洩漏', '`new` 沒有 `delete`；循環的 `std::shared_ptr`', '物件一直被集合、static 欄位參考', '物件一直被全域 list／dict 參考', '物件一直被全域變數、監聽器、閉包參考'],
          ['越界讀取', '`v[i]` 不檢查，未定義行為；`v.at(i)` 丟出 `std::out_of_range`', '每次都檢查，丟出 `ArrayIndexOutOfBoundsException`', '丟出 `IndexError`；但 −len 到 −1 的負索引合法，從尾端算回來', '不丟例外，讀到 `undefined`'],
          ['越界寫入', '未定義行為，可能悄悄改掉相鄰的變數', '丟出例外，不會寫入', '丟出 `IndexError`，不會寫入', '`arr[10] = x` 會把陣列長度擴成 11，中間是空位'],
        ] },
        { type: 'callout', tone: 'warning', title: '跑出正確答案，不代表沒有未定義行為', text: '把範例的 `v.at(i)` 換成 `v[i]`、索引用 5，C++ 不會報錯：程式可能印出某個看似合理的數字，也可能當掉，換一台電腦、換一個最佳化等級結果就不同。回傳區域變數的參考時，編譯器通常會警告（所以 `-Wall -Werror` 會擋下），但 vector 搬移後的懸空參考、`delete` 之後的使用，編譯器多半看不出來。開發時可以用 `g++ -fsanitize=address,undefined` 編譯，讓 AddressSanitizer 在越界、use after free 發生的當下停止並指出那一行；更根本的做法是不用裸指標管理擁有權，改用容器、`std::unique_ptr`，存索引而不是存元素的指標。' },
      ],
    },
  ],
  examples: [
    {
      id: 'frames', title: '框架裡的變數隨呼叫結束，堆積上的物件留下來',
      description: '`localCount` 的區域變數每次呼叫都重新建立；`makeCounter` 在堆積上建立 Counter 物件並交給呼叫者，函式 return 後物件仍然存在。',
      output: 'local: 1 1\nheap: 2',
      code: {
        'C++': code`#include <iostream>
#include <memory>

struct Counter {
    int count = 0;
};

int localCount() {
    int count = 0;  // 區域變數：在這次呼叫的堆疊框架裡
    count += 1;
    return count;   // 回傳值複製給呼叫者，框架隨即移除
}

std::unique_ptr<Counter> makeCounter() {
    auto counter = std::make_unique<Counter>();  // Counter 物件建立在堆積
    counter->count += 1;
    return counter;  // 擁有權交給呼叫者，物件不隨框架消失
}

int main() {
    std::cout << "local: " << localCount() << " " << localCount() << "\n";
    std::unique_ptr<Counter> counter = makeCounter();
    counter->count += 1;
    std::cout << "heap: " << counter->count << "\n";
    return 0;
}  // counter 離開作用域，unique_ptr 自動釋放 Counter`,
        Java: code`class Counter {
    int count = 0;
}

public class Main {
    static int localCount() {
        int count = 0;  // 區域變數：在這次呼叫的堆疊框架裡
        count += 1;
        return count;   // 框架移除後 count 就不存在了
    }

    static Counter makeCounter() {
        Counter counter = new Counter();  // 物件在堆積，counter 只存參考
        counter.count += 1;
        return counter;  // 回傳參考；物件仍被 main 參考，所以繼續存在
    }

    public static void main(String[] args) {
        System.out.println("local: " + localCount() + " " + localCount());
        Counter counter = makeCounter();
        counter.count += 1;
        System.out.println("heap: " + counter.count);
    }
}`,
        Python: code`class Counter:
    def __init__(self):
        self.count = 0


def local_count():
    count = 0  # 名稱 count 只存在這次呼叫的框架裡
    count += 1
    return count


def make_counter():
    counter = Counter()  # 物件在堆積，框架裡的名稱 counter 指向它
    counter.count += 1
    return counter  # 呼叫者拿到同一個物件


print("local:", local_count(), local_count())
counter = make_counter()
counter.count += 1
print("heap:", counter.count)`,
        JavaScript: code`class Counter {
    count = 0;
}

function localCount() {
    let count = 0;  // 區域變數：每次呼叫都有新的一份
    count += 1;
    return count;
}

function makeCounter() {
    const counter = new Counter();  // 物件在堆積
    counter.count += 1;
    return counter;  // 回傳參考，物件繼續存在
}

console.log("local:", localCount(), localCount());
const counter = makeCounter();
counter.count += 1;
console.log("heap:", counter.count);`,
      },
    },
    {
      id: 'assign-object', title: '`b = a`：複製物件，還是共用物件',
      description: '把 a 賦值給 b 再修改 b.x。C++ 的 struct 是值型別，複製出獨立的一份；Java、Python、JavaScript 的物件是參考型別，a 與 b 是同一個物件。第二段各自示範相反的做法。',
      output: 'a.x = 9, b.x = 9\na.x = 9, c.x = 5',
      outputByLanguage: { 'C++': 'a.x = 1, b.x = 9\na.x = 5, r.x = 5' },
      code: {
        'C++': code`#include <iostream>

struct Point {
    int x;
    int y;
};

int main() {
    Point a{1, 2};
    Point b = a;   // 複製整個物件：b 是另一份資料
    b.x = 9;
    std::cout << "a.x = " << a.x << ", b.x = " << b.x << "\n";
    Point& r = a;  // 參考：r 是 a 的別名
    r.x = 5;
    std::cout << "a.x = " << a.x << ", r.x = " << r.x << "\n";
    return 0;
}`,
        Java: code`class Point {
    int x, y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }
}

public class Main {
    public static void main(String[] args) {
        Point a = new Point(1, 2);
        Point b = a;  // 複製參考：a、b 指向同一個物件
        b.x = 9;
        System.out.println("a.x = " + a.x + ", b.x = " + b.x);
        Point c = new Point(a.x, a.y);  // 要獨立的一份，必須建立新物件
        c.x = 5;
        System.out.println("a.x = " + a.x + ", c.x = " + c.x);
    }
}`,
        Python: code`import copy


class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


a = Point(1, 2)
b = a  # 名稱 b 綁定到同一個物件
b.x = 9
print(f"a.x = {a.x}, b.x = {b.x}")
c = copy.copy(a)  # 建立新物件（淺複製）
c.x = 5
print(f"a.x = {a.x}, c.x = {c.x}")`,
        JavaScript: code`const a = { x: 1, y: 2 };
const b = a;  // 複製參考：a、b 指向同一個物件
b.x = 9;      // const 只禁止 b 改指向，不禁止修改物件
console.log("a.x = " + a.x + ", b.x = " + b.x);
const c = { ...a };  // 展開成新物件（淺複製）
c.x = 5;
console.log("a.x = " + a.x + ", c.x = " + c.x);`,
      },
    },
    {
      id: 'pass-args', title: '傳入複本、修改內容、重新賦值',
      description: '同一個 nums 依序交給三種情況：傳入複本後修改、直接修改內容、在函式裡把參數換成新的 list。只有第三種在 C++ 與其他語言結果不同。',
      output: 'copy: [1, 2, 3]\nmutate: [1, 2, 3, 4]\nreassign: [1, 2, 3, 4]',
      outputByLanguage: { 'C++': 'copy: [1, 2, 3]\nmutate: [1, 2, 3, 4]\nreassign: [0]' },
      code: {
        'C++': code`#include <iostream>
#include <vector>

void show(const char* label, const std::vector<int>& v) {
    std::cout << label << " [";
    for (std::size_t i = 0; i < v.size(); ++i) std::cout << (i ? ", " : "") << v[i];
    std::cout << "]\n";
}

void appendCopy(std::vector<int> v) { v.push_back(4); }  // 傳值：改的是複本
void append(std::vector<int>& v) { v.push_back(4); }     // 傳參考：改的是呼叫者的 vector
void replace(std::vector<int>& v) { v = {0}; }           // 透過參考賦值：呼叫者的 vector 被換掉

int main() {
    std::vector<int> nums = {1, 2, 3};
    appendCopy(nums);
    show("copy:", nums);
    append(nums);
    show("mutate:", nums);
    replace(nums);
    show("reassign:", nums);
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.List;

public class Main {
    static void append(List<Integer> list) {
        list.add(4);  // 透過參考的複本，改的是同一個物件
    }

    static void replace(List<Integer> list) {
        list = new ArrayList<>(List.of(0));  // 只改了參數自己的參考
    }

    public static void main(String[] args) {
        List<Integer> nums = new ArrayList<>(List.of(1, 2, 3));
        append(new ArrayList<>(nums));  // 傳入複本
        System.out.println("copy: " + nums);
        append(nums);
        System.out.println("mutate: " + nums);
        replace(nums);
        System.out.println("reassign: " + nums);
    }
}`,
        Python: code`def append(items):
    items.append(4)  # 透過參數修改同一個 list


def replace(items):
    items = [0]  # 只把區域名稱 items 綁定到新的 list


nums = [1, 2, 3]
append(nums.copy())  # 傳入複本
print("copy:", nums)
append(nums)
print("mutate:", nums)
replace(nums)
print("reassign:", nums)`,
        JavaScript: code`function append(items) {
    items.push(4);  // 透過參考的複本，改的是同一個陣列
}

function replace(items) {
    items = [0];  // 只改了參數自己的參考
}

const show = (label, items) => console.log(label + " [" + items.join(", ") + "]");
const nums = [1, 2, 3];
append([...nums]);  // 傳入複本
show("copy:", nums);
append(nums);
show("mutate:", nums);
replace(nums);
show("reassign:", nums);`,
      },
    },
    {
      id: 'scoped-close', title: '生命週期結束的時間點',
      description: '開啟兩個資源 A、B，B 在內層區塊結束時關閉。C++ 由解構子自動關閉；Java、Python、JavaScript 用 try-with-resources、with、try／finally 明確關閉。四種語言的輸出順序相同。',
      output: 'open A\nopen B\nuse A and B\nclose B\nonly A\nclose A',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>

class Resource {
public:
    explicit Resource(std::string name) : name_(std::move(name)) { std::cout << "open " << name_ << "\n"; }
    ~Resource() { std::cout << "close " << name_ << "\n"; }  // 解構子：生命週期結束時自動執行

private:
    std::string name_;
};

int main() {
    Resource a("A");
    {
        Resource b("B");
        std::cout << "use A and B\n";
    }  // b 的生命週期在這裡結束
    std::cout << "only A\n";
    return 0;
}  // a 的生命週期在這裡結束`,
        Java: code`class Resource implements AutoCloseable {
    private final String name;

    Resource(String name) {
        this.name = name;
        System.out.println("open " + name);
    }

    @Override
    public void close() {
        System.out.println("close " + name);
    }
}

public class Main {
    public static void main(String[] args) {
        try (Resource a = new Resource("A")) {
            try (Resource b = new Resource("B")) {
                System.out.println("use A and B");
            }  // 離開區塊時呼叫 b.close()；物件的記憶體之後才由垃圾回收釋放
            System.out.println("only A");
        }
    }
}`,
        Python: code`class Resource:
    def __init__(self, name):
        self.name = name
        print("open", name)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        print("close", self.name)  # 離開 with 區塊時一定執行
        return False


with Resource("A"):
    with Resource("B"):
        print("use A and B")
    print("only A")`,
        JavaScript: code`class Resource {
    constructor(name) {
        this.name = name;
        console.log("open " + name);
    }

    close() {
        console.log("close " + this.name);
    }
}

const a = new Resource("A");
try {
    const b = new Resource("B");
    try {
        console.log("use A and B");
    } finally {
        b.close();  // 不論是否發生例外都會關閉
    }
    console.log("only A");
} finally {
    a.close();
}`,
      },
    },
    {
      id: 'bounds', title: '越界存取：檢查、例外，還是 undefined',
      description: '對長度 3 的陣列讀取索引 2、5、−1。C++ 用會檢查範圍的 `at`（不用會造成未定義行為的 `v[i]`）；Java 每次都檢查；Python 的負索引從尾端算回來；JavaScript 不丟例外。',
      output: '2 -> 30\n5 -> out_of_range\n-1 -> out_of_range',
      outputByLanguage: {
        Java: '2 -> 30\n5 -> ArrayIndexOutOfBoundsException\n-1 -> ArrayIndexOutOfBoundsException',
        Python: '2 -> 30\n5 -> IndexError\n-1 -> 30',
        JavaScript: '2 -> 30\n5 -> undefined\n-1 -> undefined',
      },
      code: {
        'C++': code`#include <iostream>
#include <stdexcept>
#include <vector>

int main() {
    std::vector<int> v = {10, 20, 30};
    for (int i : {2, 5, -1}) {
        std::cout << i << " -> ";
        try {
            // at 會檢查範圍（-1 轉成無號數後是很大的數）；v[i] 不檢查，越界是未定義行為
            std::cout << v.at(i) << "\n";
        } catch (const std::out_of_range&) {
            std::cout << "out_of_range\n";
        }
    }
    return 0;
}`,
        Java: code`public class Main {
    public static void main(String[] args) {
        int[] v = {10, 20, 30};
        for (int i : new int[] {2, 5, -1}) {
            try {
                System.out.println(i + " -> " + v[i]);  // 每次存取都檢查範圍
            } catch (ArrayIndexOutOfBoundsException e) {
                System.out.println(i + " -> ArrayIndexOutOfBoundsException");
            }
        }
    }
}`,
        Python: code`v = [10, 20, 30]
for i in (2, 5, -1):
    try:
        print(i, "->", v[i])  # 負索引從尾端算回來：v[-1] 是最後一個
    except IndexError:
        print(i, "-> IndexError")`,
        JavaScript: code`const v = [10, 20, 30];
for (const i of [2, 5, -1]) {
    console.log(i + " -> " + v[i]);  // 越界不丟例外，讀到 undefined
}`,
      },
    },
  ],
  visualization: {
    kind: 'function-call', title: 'Java 傳遞參考的值：堆疊框架與堆積物件', language: 'Java',
    code: code`public class Main {
    static void update(int n, int[] arr) {
        n = n + 1;
        arr[0] = 99;
        arr = new int[] {7};
    }

    public static void main(String[] args) {
        int n = 1;
        int[] arr = {1, 2};
        update(n, arr);
        System.out.println(n + " " + arr[0]);
    }
}`,
    steps: [
      { line: 9, note: 'main 的堆疊框架裡建立 n。int 是基本型別，值 1 直接存在框架裡，堆積上還沒有任何物件。', frames: [{ name: 'main', vars: { n: '1' } }] },
      { line: 10, note: '陣列是物件，建立在堆積上（稱它物件 A）；main 框架裡的 arr 只存指向 A 的參考。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[1, 2]', 'main 的 arr']], marks: [{ row: 0, kind: 'write' }] } },
      { line: 2, note: '呼叫 update：堆疊頂端多了一個框架。參數 n 拿到 1 的複本；參數 arr 拿到「參考」的複本，所以兩個框架的 arr 指向同一個物件 A。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }, { name: 'update', vars: { n: '1', arr: '→ 物件 A' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[1, 2]', 'main 的 arr、update 的 arr']] } },
      { line: 3, note: 'update 的 n 變成 2。它是 main 的 n 的複本，main 的 n 仍是 1。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }, { name: 'update', vars: { n: '2', arr: '→ 物件 A' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[1, 2]', 'main 的 arr、update 的 arr']] } },
      { line: 4, note: '`arr[0] = 99` 透過參考修改物件 A 的內容。main 的 arr 指向的也是 A，所以 main 之後會看到 99。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }, { name: 'update', vars: { n: '2', arr: '→ 物件 A' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[99, 2]', 'main 的 arr、update 的 arr']], marks: [{ row: 0, col: 1, kind: 'write' }] } },
      { line: 5, note: '`arr = new int[] {7}` 在堆積建立新的物件 B，並只讓 update 的 arr 改指向 B；main 的 arr 不受影響，仍指向 A。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }, { name: 'update', vars: { n: '2', arr: '→ 物件 B' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[99, 2]', 'main 的 arr'], ['物件 B（int[]）', '[7]', 'update 的 arr']], marks: [{ row: 1, kind: 'write' }] } },
      { line: 6, note: 'update 結束，它的框架被移除，參數 n 與 arr 一起消失。物件 B 已經沒有任何參考，程式再也拿不到它，之後由垃圾回收器釋放（PL08）。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }],
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[99, 2]', 'main 的 arr'], ['物件 B（int[]）', '[7]', '沒有（無法到達，等待回收）']] } },
      { line: 12, note: '回到 main 輸出：n 仍是 1（傳的是值的複本），arr[0] 是 99（共用的物件被改了），update 裡的重新賦值沒有影響。', frames: [{ name: 'main', vars: { n: '1', arr: '→ 物件 A' } }], output: '1 99',
        table: { name: '堆積', head: ['物件', '內容', '被誰參考'], rows: [['物件 A（int[]）', '[99, 2]', 'main 的 arr'], ['物件 B（int[]）', '[7]', '沒有（無法到達，等待回收）']], marks: [{ row: 0, col: 1, kind: 'read' }] } },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: code`static void change(int[] a, int x) {
    a[0] = 9;
    x = 9;
    a = new int[] {5};
    a[0] = 7;
}
// main 中：
int[] arr = {1, 2};
int v = 1;
change(arr, v);
System.out.println(arr[0] + " " + v);` },
      options: ['9 1', '7 1', '9 9', '1 1'],
      answer: 0, explanation: 'a 拿到 arr 參考的複本，`a[0] = 9` 改的是 main 也指向的陣列；x 是 v 的值的複本，改成 9 不影響 v；`a = new int[] {5}` 只讓參數 a 改指向新陣列，之後的 `a[0] = 7` 改的是那個新陣列。所以印 9 1。「7 1」以為重新賦值後 a 仍連著 arr；「9 9」以為基本型別也是傳參考；「1 1」以為 Java 傳入陣列時會複製整個陣列。',
    },
    {
      id: 'q2', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: code`a = [1, 2]
b = a
b += [3]
c = a[:]
c.append(4)
print(a, len(c))` },
      options: ['[1, 2, 3] 4', '[1, 2] 3', '[1, 2, 3, 4] 4', '[1, 2, 3] 3'],
      answer: 0, explanation: 'b 與 a 是同一個 list；list 的 `+=` 就地修改，所以 a 變成 [1, 2, 3]。`a[:]` 建立新的 list，c 從 [1, 2, 3] 加上 4，長度 4，但 a 不受影響。「[1, 2] 3」把 list 的 `+=` 當成整數的 `+=`（建立新物件再重新綁定）；「[1, 2, 3, 4] 4」以為切片 `a[:]` 與 a 共用同一個 list；「[1, 2, 3] 3」忘了 c 是在 a 加入 3 之後才複製的。',
    },
    {
      id: 'q3', prompt: '下面的 C++ 程式有什麼問題？',
      code: { language: 'C++', text: code`int& counter() {
    int count = 0;
    count += 1;
    return count;
}

int main() {
    int& c = counter();
    std::cout << c << "\n";
}` },
      options: ['count 在 counter 的堆疊框架裡，return 後框架被移除，c 成了懸空參考；讀取它是未定義行為', '沒有問題：c 綁定了 count，count 的生命週期會延長到 main 結束，一定印 1', '一定印 0：框架移除時 count 被重設為 0', '只是效率差：回傳參考會多複製一次，改成回傳 int 比較快'],
      answer: 0, explanation: '區域變數 count 活在 counter 這次呼叫的框架裡，函式 return 時生命週期就結束了；回傳它的參考，c 便指向已經不屬於任何物件的堆疊空間，讀取是未定義行為，可能印 1、印亂碼或當掉。clang 與 g++ 都會對這行發出警告，所以 `-Wall -Werror` 會讓它無法編譯。「生命週期會延長」只適用於把暫時物件直接綁到 const 參考，不適用於回傳的參考；框架移除時不會把變數「重設」成 0，那塊記憶體只是可能被下一次呼叫覆寫；這不是效率問題，正確的寫法是回傳 int（值）。',
    },
    {
      id: 'q4', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: code`int a = 1, b = 2;
int* p = &a;
int& r = a;
p = &b;
*p = 20;
r = b;
std::cout << a << " " << b << "\n";` },
      options: ['20 20', '1 20', '2 2', '20 2'],
      answer: 0, explanation: '指標可以改指向：`p = &b` 之後 p 指向 b，`*p = 20` 把 b 改成 20。參考不能改綁：`r = b` 不是讓 r 改指 b，而是把 b 的值 20 寫進 r 所代表的 a。所以 a、b 都是 20。「1 20」以為 `r = b` 讓 r 改綁到 b；「2 2」以為 `*p` 仍然改到 a；「20 2」同樣忽略了 p 已經改指向 b。',
    },
    {
      id: 'q5', prompt: 'JavaScript：依序執行 `const a = { n: 1 };`、`const list = [a, a];`、`list[0].n = 5;`、`const copy = [...list];`、`copy[1] = { n: 9 };`，最後 `console.log(a.n, list[1].n, copy[0].n)` 印出什麼？',
      options: ['5 5 5', '1 1 5', '5 9 5', '5 5 1'],
      answer: 0, explanation: 'list 的兩個元素都是 a 的參考，`list[0].n = 5` 改的就是 a。`[...list]` 是淺複製：建立新的陣列，元素仍是指向 a 的參考；`copy[1] = { n: 9 }` 只換掉 copy 的第二格，list 不受影響。所以三個值都是 5。「1 1 5」以為陣列存的是 a 的複本；「5 9 5」以為 copy 與 list 是同一個陣列；「5 5 1」以為展開運算子會連 a 一起深複製。',
    },
    {
      id: 'q6', prompt: '一個長時間執行的 Java 服務有 `static List<byte[]> cache = new ArrayList<>();`，每個請求都 `cache.add(new byte[1024])`，從不移除。記憶體用量一直上升。哪個說法正確？',
      options: ['這是記憶體洩漏：陣列一直被 static 的 cache 參考，垃圾回收器只回收無法到達的物件，所以永遠不會釋放它們', 'Java 有垃圾回收，不可能洩漏，一定是 JVM 的錯誤', '只要定期呼叫 `System.gc()` 就會釋放這些陣列', '`byte[]` 是基本型別的陣列，放在堆疊上，請求結束就會自動釋放'],
      answer: 0, explanation: '垃圾回收器判斷的是「還能不能從程式到達」，而不是「程式還需不需要」。static 欄位一直活著，cache 裡的每個陣列都還能到達，所以都不會被回收，這正是垃圾回收語言中的記憶體洩漏；解法是限制快取大小或移除不再需要的項目。說 Java 不可能洩漏是誤解；`System.gc()` 只是請求回收，回收不了仍被參考的物件；Java 的陣列不論元素型別都是堆積上的物件，不放在堆疊上。',
    },
    {
      id: 'q7', prompt: '下面的 C++ 程式哪裡有錯？',
      code: { language: 'C++', text: code`std::vector<int> v = {1, 2, 3};
int& first = v[0];
v.push_back(4);
std::cout << first << "\n";` },
      options: ['push_back 可能把元素搬到新的記憶體並釋放舊的，first 就成了懸空參考，讀取它是未定義行為', '沒有錯：first 是 v[0] 的參考，一定印 1', '編譯錯誤：不能取得 vector 元素的參考', '一定印 4：push_back 把新元素放在最前面'],
      answer: 0, explanation: 'vector 的元素放在堆積上的一塊連續記憶體；容量不夠時，push_back 會配置更大的空間、把元素搬過去並釋放舊空間，先前取得的指標與參考都失效。容量是否足夠由實作決定，所以這段程式可能「看起來正常」地印 1，也可能讀到已釋放的記憶體，這就是未定義行為。正確做法是在 push_back 之後再讀 `v[0]`，或保存索引 0 而不是參考。取得元素的參考是合法語法，不會編譯錯誤；push_back 加在尾端，不在最前面。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '名稱與物件：模擬參考與複本',
      statement: '程式維護一組名稱，每個名稱參考一個整數 list 物件，就像 Python 的名稱或 Java 的參考變數。依序執行 n 個指令：`new a` 建立一個新的空 list 並讓 a 參考它（a 原本參考的物件不受影響）；`set a b` 讓 a 參考 b 正在參考的同一個 list（不複製）；`copy a b` 讓 a 參考 b 的 list 的一份新複本；`push a x` 在 a 參考的 list 尾端加入整數 x；`print a` 輸出 `a = [x1, x2, ...]`，空的 list 輸出 `a = []`。指令用到還沒有參考任何物件的名稱時（`set`、`copy` 的第二個名稱，`push`、`print` 的名稱），輸出 `error: 名稱 is not defined` 並略過這個指令。全部執行完後，輸出 `objects: k`，k 是目前至少被一個名稱參考的不同 list 物件個數；沒有任何名稱參考的物件已經無法到達，不計入。請用語言本身的參考來做（list、ArrayList、陣列、`std::shared_ptr`），不要自己編號。',
      inputFormat: '第一行是指令數 n；接著 n 行，每行一個指令：`new a`、`set a b`、`copy a b`、`push a x` 或 `print a`。',
      outputFormat: '每個 `print` 與每個錯誤各輸出一行，最後一行是 `objects: k`。',
      constraints: ['0 ≤ n ≤ 1000', '名稱是 1～10 個小寫英文字母', '−10⁹ ≤ x ≤ 10⁹', '指令只會是上述五種，格式正確'],
      samples: [{ kind: 'normal', input: '6\nnew a\npush a 1\nset b a\npush b 2\nprint a\nprint b', output: 'a = [1, 2]\nb = [1, 2]\nobjects: 1', note: 'b 與 a 參考同一個 list，透過 b 加入的 2，從 a 也看得到；只有 1 個物件' }],
      tests: [
        { kind: 'normal', input: '7\nnew a\npush a 1\ncopy b a\npush b 2\npush a 3\nprint a\nprint b', output: 'a = [1, 3]\nb = [1, 2]\nobjects: 2', note: 'copy 之後兩個 list 各改各的' },
        { kind: 'normal', input: '7\nnew a\npush a 5\nset b a\nnew a\npush a 7\nprint a\nprint b', output: 'a = [7]\nb = [5]\nobjects: 2', note: 'new 讓 a 改參考新物件，舊物件仍被 b 參考' },
        { kind: 'normal', input: '9\nnew a\nset b a\nset c b\npush c 4\ncopy d c\npush d 8\nprint a\nprint d\nprint c', output: 'a = [4]\nd = [4, 8]\nc = [4]\nobjects: 2', note: 'a、b、c 是同一個物件；d 是複本' },
        { kind: 'edge', input: '0', output: 'objects: 0', note: '沒有任何指令' },
        { kind: 'edge', input: '4\nnew a\ncopy b a\nprint a\nprint b', output: 'a = []\nb = []\nobjects: 2', note: '內容相同但是兩個不同的物件；用內容比較（Java 的 HashSet）會錯算成 1' },
        { kind: 'edge', input: '5\nnew a\npush a 1\nset b a\nnew a\nnew b', output: 'objects: 2', note: '最早的 list 已經沒有名稱參考，無法到達，不計入' },
        { kind: 'edge', input: '4\nnew a\npush a 3\nset a a\nprint a', output: 'a = [3]\nobjects: 1', note: '讓名稱參考自己目前的物件，什麼都沒變' },
        { kind: 'edge', input: '4\nnew a\npush a 1000000000\npush a -1000000000\nprint a', output: 'a = [1000000000, -1000000000]\nobjects: 1', note: '範圍兩端的值' },
        { kind: 'error', input: '7\nprint z\npush z 1\nset b z\nprint b\nnew a\ncopy c z\nprint a', output: 'error: z is not defined\nerror: z is not defined\nerror: z is not defined\nerror: b is not defined\nerror: z is not defined\na = []\nobjects: 1', note: '使用未定義的名稱；`set b z` 失敗後 b 仍然未定義' },
        { kind: 'error', input: '5\nnew a\npush a 2\nset a q\nprint a\nprint q', output: 'error: q is not defined\na = [2]\nerror: q is not defined\nobjects: 1', note: '失敗的 set 不會改變 a' },
      ],
      hints: [
        '用 map／dict 從名稱對到 list：`set` 只是把同一個 list（的參考）再放進 map 一次，`copy` 才建立新的 list。',
        'C++ 的 map 值用 `std::shared_ptr<std::vector<int>>`：複製 shared_ptr 是共用，`std::make_shared<std::vector<int>>(*p)` 才是複製內容；沒有任何 shared_ptr 參考的 vector 會被自動釋放。',
        '計算不同物件時要比「是不是同一個物件」而不是「內容相同」：C++ 比 `get()` 的指標，Java 用 `IdentityHashMap` 做成的 Set（`HashSet` 會用 equals 比內容），Python 比 `id()`，JavaScript 的 `Set` 本來就以同一個物件判斷。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

using List = std::vector<int>;

int main() {
    std::map<std::string, std::shared_ptr<List>> names;
    int n;
    std::cin >> n;
    for (int i = 0; i < n; ++i) {
        std::string op, target, arg;
        std::cin >> op >> target;
        if (op == "new") {
            names[target] = std::make_shared<List>();  // 舊物件若沒有其他 shared_ptr 參考，就在這裡被釋放
            continue;
        }
        if (op != "print") std::cin >> arg;
        const std::string source = (op == "set" || op == "copy") ? arg : target;
        auto it = names.find(source);
        if (it == names.end()) {
            std::cout << "error: " << source << " is not defined\n";
        } else if (op == "set") {
            names[target] = it->second;  // 複製指標：共用同一個 vector
        } else if (op == "copy") {
            names[target] = std::make_shared<List>(*it->second);  // 複製整個 vector
        } else if (op == "push") {
            it->second->push_back(std::stoi(arg));
        } else {
            std::cout << source << " = [";
            for (std::size_t k = 0; k < it->second->size(); ++k) std::cout << (k ? ", " : "") << (*it->second)[k];
            std::cout << "]\n";
        }
    }
    std::set<const List*> alive;  // 以「是不是同一個物件」計數
    for (const auto& entry : names) alive.insert(entry.second.get());
    std::cout << "objects: " << alive.size() << "\n";
    return 0;
}`,
        Java: code`import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Map<String, List<Integer>> names = new HashMap<>();
        StringBuilder out = new StringBuilder();
        int n = sc.nextInt();
        for (int i = 0; i < n; i++) {
            String op = sc.next(), target = sc.next();
            if (op.equals("new")) {
                names.put(target, new ArrayList<>());  // 舊物件若沒人參考，之後由垃圾回收釋放
                continue;
            }
            String arg = op.equals("print") ? "" : sc.next();
            String source = op.equals("set") || op.equals("copy") ? arg : target;
            List<Integer> list = names.get(source);
            if (list == null) out.append("error: ").append(source).append(" is not defined\n");
            else if (op.equals("set")) names.put(target, list);  // 複製參考
            else if (op.equals("copy")) names.put(target, new ArrayList<>(list));  // 新物件
            else if (op.equals("push")) list.add(Integer.parseInt(arg));
            else out.append(source).append(" = ").append(list).append("\n");
        }
        // 依「是不是同一個物件」計數；HashSet 會用 equals 把內容相同的 list 當成同一個
        Set<List<Integer>> alive = Collections.newSetFromMap(new IdentityHashMap<>());
        alive.addAll(names.values());
        out.append("objects: ").append(alive.size());
        System.out.println(out);
    }
}`,
        Python: code`names = {}
for _ in range(int(input())):
    op, *args = input().split()
    if op == "new":
        names[args[0]] = []  # 新的空 list；舊物件若沒人參考就無法到達
        continue
    source = args[1] if op in ("set", "copy") else args[0]
    if source not in names:
        print(f"error: {source} is not defined")
    elif op == "set":
        names[args[0]] = names[source]  # 複製參考：兩個名稱共用同一個 list
    elif op == "copy":
        names[args[0]] = list(names[source])  # 建立新的 list
    elif op == "push":
        names[source].append(int(args[1]))
    else:
        print(f"{source} = {names[source]}")
print("objects:", len({id(items) for items in names.values()}))`,
        JavaScript: code`const lines = require("fs").readFileSync(0, "utf8").split("\n");
const names = new Map();
const out = [];
const n = Number(lines[0]);
for (let i = 1; i <= n; i++) {
    const [op, target, arg] = lines[i].trim().split(/\s+/);
    if (op === "new") {
        names.set(target, []);  // 舊陣列若沒人參考，之後由垃圾回收釋放
        continue;
    }
    const source = op === "set" || op === "copy" ? arg : target;
    if (!names.has(source)) out.push("error: " + source + " is not defined");
    else if (op === "set") names.set(target, names.get(source));  // 複製參考
    else if (op === "copy") names.set(target, [...names.get(source)]);  // 新陣列
    else if (op === "push") names.get(source).push(Number(arg));
    else out.push(source + " = [" + names.get(source).join(", ") + "]");
}
out.push("objects: " + new Set(names.values()).size);  // Set 以「同一個物件」判斷
console.log(out.join("\n"));`,
      },
      judge: 'none',
    },
  ],
};
