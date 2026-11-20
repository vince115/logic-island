import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL04 型別系統. Every example and the reference solutions run in tests/curriculum-code.test.ts. Programs that do not
 * compile cannot be examples, so the compile-time errors of C++ and Java are shown in tables and comments; each of them
 * was checked with g++ -std=c++17 -Wall -Werror and javac --release 17 when the lesson was written.
 */
export const PL04: LessonContent = {
  lessonId: 'PL04',
  motivation: '同一行 `"5" + 1`，在 JavaScript 得到 "51"、在 Python 是執行期錯誤、在 C++ 根本編譯不過。看懂型別系統，就能預先知道錯誤會在寫程式時、上線後，還是永遠不會被發現而悄悄算錯，並把容易出錯的隱式轉型改寫成明確、安全的程式。',
  sections: [
    {
      id: 'purpose', title: '型別系統在做什麼',
      blocks: [
        { type: 'p', text: '型別（type）描述一個值是什麼、能做哪些運算：整數可以相減，字串可以串接，但「字串減整數」沒有意義。型別系統（type system）是一種語言對這些規則的整套約定，加上檢查規則的方式，也就是型別檢查（type checking）。把運算用在不適合的型別上，就是型別錯誤（type error）。' },
        { type: 'p', text: 'F02 已經介紹過「C++、Java 宣告時寫型別，Python、JavaScript 不寫」。這一課要更精確地比較：型別系統其實有兩條互相獨立的軸，一條問「什麼時候檢查」，另一條問「遇到型別不合時，會不會自動幫你轉型」。' },
        { type: 'table', head: ['語言', '什麼時候檢查（靜態／動態）', '會不會自動轉型（強／弱）'], rows: [
          ['C++', '靜態：編譯時檢查', '偏弱：`double` 可以直接存進 `int`、`bool` 可以相加、字串字面值加整數會變成指標運算'],
          ['Java', '靜態：編譯時檢查', '偏強：只允許不會失真的放大轉型（`int` → `double`），以及 `+` 遇到 `String` 時串接'],
          ['Python', '動態：執行到那一行才檢查', '強：`"5" + 1` 直接丟出 `TypeError`，不會猜你的意思'],
          ['JavaScript', '動態：執行到那一行才檢查', '弱：`"5" - 1` 會把字串轉成數字得到 4，幾乎不會報錯'],
        ] },
        { type: 'callout', tone: 'note', title: '兩條軸不能混為一談', text: '「動態型別」不等於「弱型別」：Python 是動態型別，卻比 C++ 更不肯自動轉型。強與弱也不是嚴格的數學定義，而是一個程度：比較的是一種語言允許多少隱式轉型（implicit conversion），所以表中寫「偏強」「偏弱」。' },
      ],
    },
    {
      id: 'static-dynamic', title: '靜態與動態型別：錯誤在什麼時候被發現',
      blocks: [
        { type: 'p', text: '靜態型別（static typing）的語言在程式執行之前，由編譯器根據每個變數與表達式的型別檢查整份程式；只要有一處型別不合，就不會產生可執行檔，即使那一行永遠不會執行。動態型別（dynamic typing）的語言把型別放在「值」上，直到真的執行那一行、拿到實際的值，才檢查運算是否合法。' },
        { type: 'table', head: ['同一個意圖', 'C++', 'Java', 'Python', 'JavaScript'], rows: [
          ['文字 "5" 減 1', '編譯錯誤：`std::string` 沒有 `-`', '編譯錯誤：bad operand types for binary operator \'-\'', '執行期 `TypeError`', '沒有錯誤，得到 `4`'],
          ['把字串存進整數變數', '編譯錯誤', '編譯錯誤：String cannot be converted to int', '沒有錯誤：變數改存字串', '沒有錯誤：變數改存字串'],
          ['把 3.9 存進整數', '可以編譯，得到 `3`（有些編譯器會警告）', '編譯錯誤：possible lossy conversion', '不會自動轉；要寫 `int(3.9)`', '只有 `number` 一種數字型別'],
        ] },
        { type: 'p', text: '下面的 `describe` 有一個只在 n 為負數時才會走到的分支。Python 程式能正常印出第一行，等到真的呼叫 `describe(-3)` 才在那一行發生錯誤；在靜態型別的語言中，同樣的錯誤會讓整份程式無法編譯，所以 C++ 版本必須先把 n 明確轉成字串。' },
        { type: 'example', id: 'late-error' },
        { type: 'list', items: [
          '靜態檢查的好處：錯誤在執行前、在開發者面前出現，不會等使用者踩到冷門分支；編輯器也能依型別提供自動完成與重新命名。',
          '動態檢查的好處：寫起來短，同一個函式可以接受各種值；代價是錯誤要靠測試或使用者「執行到」才會出現，沒被測到的分支可能帶著錯誤上線。',
          'Java 的 `"negative: " + n` 能通過編譯，不是因為沒有檢查，而是 Java 規定 `+` 的一邊是 `String` 時，另一邊會轉成字串；這是語言明文允許的隱式轉型。',
        ] },
      ],
    },
    {
      id: 'strong-weak', title: '強與弱型別：隱式轉型',
      blocks: [
        { type: 'p', text: '隱式轉型（implicit conversion，也稱 coercion）是語言在你沒有要求的情況下，自動把一個值轉成另一種型別。強型別（strong typing）的語言很少這樣做，型別不合就報錯；弱型別（weak typing）的語言會盡量轉型讓運算繼續，結果卻可能不是你要的。下面四段程式的意圖相同：把文字 "5" 和數字 1 做加法與減法。' },
        { type: 'example', id: 'mixed' },
        { type: 'p', text: 'JavaScript 的 `+` 只要有一邊是字串就做串接，所以 `"5" + 1` 是 "51"；`-` 只能用在數字，所以把 "5" 轉成 5，得到 4。同一個值遇到兩個運算子轉成不同型別，正是弱型別容易出錯的地方。Java 的 `text + 1` 也得到 "51"，但減法必須先 `Integer.parseInt`；Python 兩種都不自動轉，要寫 `int(text)`；C++ 的 `std::string` 與 `int` 之間根本沒有 `+` 或 `-`，只能用 `std::to_string` 或 `std::stoi` 明確轉型。' },
        { type: 'table', head: ['表達式', '語言', '結果', '發生了什麼'], rows: [
          ['`"5" * "2"`', 'JavaScript', '`10`', '兩個字串都被轉成數字'],
          ['`"Sum: " + 2 + 3`', 'Java', '`"Sum: 23"`', '由左到右：先串成 "Sum: 2"，再串上 3'],
          ['`2 + 3 + " total"`', 'Java', '`"5 total"`', '先做整數加法，遇到字串才串接'],
          ['`\'A\' + 1`', 'Java（與 C++）', '`66`', '`char` 被放大成 `int`（\'A\' 的字元碼是 65）'],
          ['`true + true`', 'C++', '`2`', '`bool` 被轉成整數 1'],
          ['`True + True`', 'Python', '`2`', 'Python 的 `bool` 本身就是 `int` 的子型別，這不是轉型'],
          ['`int x = price;`（price 是 3.9）', 'C++', '`3`', '`double` 隱式轉成 `int`，小數部分被丟掉，`-Wall` 不會警告'],
        ] },
        { type: 'callout', tone: 'warning', title: 'JavaScript 的 == 會先轉型再比較', text: '`0 == ""` 是 true，`"0" == 0` 也是 true，但 `"" == "0"` 卻是 false：`==` 在兩邊型別不同時會先轉型，所以「相等」連遞移律都不成立。比較時一律用 `===`（不轉型，型別不同就是 false），要比較數字就先用 `Number(...)` 明確轉換並檢查結果不是 `NaN`。' },
        { type: 'callout', tone: 'warning', title: 'C++ 的字串字面值加整數不是串接', text: '`"negative: " + n` 在 C++ 中，左邊是一個字元陣列，會被轉成指向第一個字元的指標，再往後移 n 格：這是指標運算，不是串接。n 是負數或太大時會指到陣列之外，屬於未定義行為。有些編譯器（例如 clang）會發出警告，但不是每個編譯器都會；要串接就寫 `std::string("negative: ") + std::to_string(n)`。' },
      ],
    },
    {
      id: 'type-inference', title: '型別推論：不寫型別，仍然是靜態型別',
      blocks: [
        { type: 'p', text: '型別推論（type inference）讓編譯器從初始值推出變數的型別，程式設計師不必寫出來。C++11 的 `auto` 與 Java 10 的 `var` 都是這樣：`auto a = 7 / 2;` 的右邊是 `int / int`，結果是 `int`，所以 a 的型別就是 `int`，而且從此固定。推論發生在編譯時，所以這仍然是靜態型別。' },
        { type: 'p', text: '推論的規則就是表達式的型別規則：`int / int` 得 `int`、`int / double` 得 `double`、`int + double` 得 `double`。下面的 C++ 與 Java 用兩個同名函式 `kind(int)` 和 `kind(double)` 來證明：要呼叫哪一個是編譯器依推論出的型別在編譯時決定的。Python 與 JavaScript 沒有編譯時的型別推論，`type()` 與 `typeof` 回報的是執行當下那個值的型別。' },
        { type: 'example', id: 'inference' },
        { type: 'list', items: [
          '`auto x = 5;` 之後寫 `x = "five";` 會編譯失敗（C++：assigning to \'int\' from incompatible type；Java：String cannot be converted to int）：推論只是省略型別，不是讓型別可以改變。',
          '推論需要初始值：Java 的 `var x;` 會得到 cannot infer type for local variable x。',
          '推論出來的不一定是你想的型別：C++ 的 `auto s = "hi";` 是 `const char*`，不是 `std::string`；需要字串物件時要寫 `std::string s = "hi";`。',
          'Python 的 `a = 7 // 2` 也沒有寫型別，但那不是推論：Python 不會在執行前決定 a 的型別，下一行改存字串也完全合法。',
        ] },
      ],
    },
    {
      id: 'nominal-structural', title: '名義型別與結構型別',
      blocks: [
        { type: 'p', text: '「這個值能不能傳給要求某型別的參數？」有兩種判斷方式。名義型別（nominal typing）看名字與宣告：Java 的方法參數是 `Shape`，傳進去的類別就必須寫明 `implements Shape`，光是剛好有一個 `area()` 方法並不算。結構型別（structural typing）看形狀：只要有需要的成員就符合，不在乎它宣告自己是什麼。' },
        { type: 'example', id: 'shapes' },
        { type: 'table', head: ['語言', '判斷方式', '不符合時'], rows: [
          ['Java', '名義：類別必須宣告 `implements Shape`', '有 `area()` 但沒宣告的類別傳入時編譯錯誤：Rect cannot be converted to Shape'],
          ['C++ 樣板（template）', '結構：只要 `shape.area()` 這個表達式能編譯', '沒有 `area()` 的型別在編譯時報錯'],
          ['Python、JavaScript', '鴨子型別（duck typing）：執行時有 `area` 就呼叫', '沒有 `area` 時在執行期才出錯（`AttributeError`／`TypeError`）'],
          ['TypeScript（背景說明）', '結構：物件有相同的屬性與方法就相容', '編譯成 JavaScript 之前報錯'],
        ] },
        { type: 'p', text: '鴨子型別可以看成「在執行時檢查的結構型別」。TypeScript 在 JavaScript 上加了型別標註，並在編譯時以結構型別檢查，所以一個普通的物件字面值只要有 `area()`，就能傳給要求 `{ area(): number }` 的參數；這門課不用 TypeScript 寫程式，只把它當作結構型別的代表。Python 的 `typing.Protocol` 也是結構型別，但和其他型別提示一樣，只有靜態檢查工具會檢查它。' },
      ],
    },
    {
      id: 'annotations', title: '型別標註、及早發現錯誤與型別安全的改寫',
      blocks: [
        { type: 'p', text: '型別標註（type annotation）是寫在程式中、說明變數或參數型別的文字。在 C++ 與 Java 中它是語言的一部分，編譯器會檢查；Python 的型別提示（type hints，例如 `def twice(n: int) -> int`）則是選擇性的標註，直譯器執行時不會檢查，要另外執行靜態型別檢查工具（例如 mypy）才會在執行前回報。' },
        { type: 'example', id: 'hints' },
        { type: 'callout', tone: 'warning', title: '加了型別提示，Python 仍然不檢查', text: '常見的誤解是「寫了 `n: int`，傳字串就會報錯」。實際上 `twice("ab")` 照樣執行，字串乘 2 得到 "abab"。型別提示是給人與工具看的說明；要擋下錯誤的輸入，執行時仍要自己檢查（`isinstance`、明確轉型並處理例外），或在開發流程中加入靜態檢查工具。' },
        { type: 'p', text: '型別錯誤越晚被發現，代價越高：編輯器標紅線（幾秒）、編譯失敗（幾分鐘）、測試失敗（要找出是哪個輸入）、上線後才出錯（使用者已經看到錯誤的資料）。型別安全（type safety）的改寫原則是：把「讓語言猜」改成「自己明確轉換並驗證」。從使用者輸入讀到的永遠是字串，各語言內建的轉換函式寬鬆程度並不一樣：' },
        { type: 'table', head: ['輸入的字串', 'C++ `std::stoi`', 'Java `Integer.parseInt`', 'Python `int`', 'JavaScript `Number`／`parseInt`'], rows: [
          ['`" 4"`（前面有空白）', '`4`', '丟出 `NumberFormatException`', '`4`', '`Number`：`4`'],
          ['`"12abc"`', '`12`（只讀到能讀的部分）', '丟出 `NumberFormatException`', '丟出 `ValueError`', '`parseInt`：`12`；`Number`：`NaN`'],
          ['`""`（空字串）', '丟出例外', '丟出 `NumberFormatException`', '丟出 `ValueError`', '`Number`：`0`'],
          ['`"1_000"`、`"0x1A"`', '`1`、`0`', '丟出例外', '`int("1_000")` 是 `1000`', '`Number("0x1A")` 是 `26`'],
        ] },
        { type: 'p', text: '所以「看起來像整數」要由你自己定義：例如「可有正負號，後面是 1 到 10 個 0–9 的數字」，先用這個規則檢查整個字串，通過了才轉換。注意 Python 的 `\\d` 與 `int()` 也接受其他文字的數字（例如阿拉伯文的「٣」），規則中寫 `[0-9]` 才只接受 ASCII 數字。下面的練習就是把寬鬆的轉換改寫成嚴格的驗證。' },
      ],
    },
  ],
  examples: [
    {
      id: 'mixed', title: '文字 "5" 和數字 1', description: '同樣想把文字 "5" 和數字 1 相加、相減：哪些語言自動轉型、哪些要明確轉換、哪個在執行時報錯。',
      output: '51\n4\n6',
      outputByLanguage: { Python: 'TypeError: can only concatenate str (not "int") to str\n4\n6' },
      code: {
        'C++': code`#include <iostream>
#include <string>

int main() {
    std::string text = "5";
    // text + 1 與 text - 1 都無法編譯：std::string 和 int 之間沒有這些運算
    std::cout << text + std::to_string(1) << "\n";  // 明確轉成字串再串接
    std::cout << std::stoi(text) - 1 << "\n";       // 明確轉成整數再相減
    std::cout << std::stoi(text) + 1 << "\n";
    return 0;
}`,
        Python: code`text = "5"
try:
    print(text + 1)  # str + int：不自動轉型
except TypeError as error:
    print("TypeError:", error)
print(int(text) - 1)
print(int(text) + 1)`,
        Java: code`public class Main {
    public static void main(String[] args) {
        String text = "5";
        System.out.println(text + 1);  // 一邊是 String：1 轉成 "1" 再串接
        // text - 1 無法編譯：String 不能做減法
        System.out.println(Integer.parseInt(text) - 1);
        System.out.println(Integer.parseInt(text) + 1);
    }
}`,
        JavaScript: code`const text = "5";
console.log(text + 1);          // + 遇到字串：1 轉成 "1" 再串接
console.log(text - 1);          // - 只能用在數字："5" 轉成 5
console.log(Number(text) + 1);  // 明確轉型後才是數字加法`,
      },
    },
    {
      id: 'late-error', title: '只在某個分支才出現的型別錯誤', description: 'describe 的負數分支把字串和整數相加。Python 執行到那一行才報錯，其他三種語言在執行前就決定了這一行的意義。',
      output: 'non-negative\nnegative: -3',
      outputByLanguage: { Python: 'non-negative\nTypeError: can only concatenate str (not "int") to str' },
      code: {
        'C++': code`#include <iostream>
#include <string>

std::string describe(int n) {
    if (n >= 0) return "non-negative";
    return "negative: " + std::to_string(n);  // 寫成 "negative: " + n 會變成指標運算
}

int main() {
    std::cout << describe(5) << "\n";
    std::cout << describe(-3) << "\n";
    return 0;
}`,
        Python: code`def describe(n):
    if n >= 0:
        return "non-negative"
    return "negative: " + n  # 只有 n < 0 時才會執行到這一行


print(describe(5))
try:
    print(describe(-3))
except TypeError as error:
    print("TypeError:", error)`,
        Java: code`public class Main {
    static String describe(int n) {
        if (n >= 0) return "non-negative";
        return "negative: " + n;  // String + int：Java 規定把 n 轉成字串
    }

    public static void main(String[] args) {
        System.out.println(describe(5));
        System.out.println(describe(-3));
    }
}`,
        JavaScript: code`function describe(n) {
    if (n >= 0) return "non-negative";
    return "negative: " + n;  // 字串 + 數字：自動轉成字串串接
}

console.log(describe(5));
console.log(describe(-3));`,
      },
    },
    {
      id: 'inference', title: '從表達式推出型別', description: '第一行印出三個值，第二行印出它們的型別：C++ 與 Java 由編譯器依推論出的型別選擇 kind 的版本，Python 與 JavaScript 回報執行時的型別。',
      output: '3 3.5 6.5\nint double double',
      outputByLanguage: { Python: '3 3.5 6.5\nint float float', JavaScript: '3 3.5 6.5\nnumber number number' },
      code: {
        'C++': code`#include <iostream>

const char* kind(int) { return "int"; }
const char* kind(double) { return "double"; }

int main() {
    auto a = 7 / 2;    // int / int → a 推論為 int
    auto b = 7 / 2.0;  // int / double → b 推論為 double
    auto c = a + b;    // int + double → c 推論為 double
    std::cout << a << " " << b << " " << c << "\n";
    std::cout << kind(a) << " " << kind(b) << " " << kind(c) << "\n";
    return 0;
}`,
        Python: code`a = 7 // 2  # 沒有編譯時的推論：型別屬於執行時的值
b = 7 / 2
c = a + b
print(a, b, c)
print(type(a).__name__, type(b).__name__, type(c).__name__)`,
        Java: code`public class Main {
    static String kind(int x) { return "int"; }
    static String kind(double x) { return "double"; }

    public static void main(String[] args) {
        var a = 7 / 2;    // int / int → a 推論為 int
        var b = 7 / 2.0;  // int / double → b 推論為 double
        var c = a + b;    // int + double → c 推論為 double
        System.out.println(a + " " + b + " " + c);
        System.out.println(kind(a) + " " + kind(b) + " " + kind(c));
    }
}`,
        JavaScript: code`const a = Math.trunc(7 / 2);  // 只有一種 number，沒有整數除法
const b = 7 / 2;
const c = a + b;
console.log(a, b, c);
console.log(typeof a, typeof b, typeof c);`,
      },
    },
    {
      id: 'shapes', title: '同樣有 area()，能不能當成形狀', description: 'report 需要一個有 area() 的值。Java 要求宣告 implements Shape（名義型別）；C++ 樣板、Python 與 JavaScript 只看有沒有 area()。',
      output: 'Square 9\nRect 10\ntotal 19',
      code: {
        'C++': code`#include <iostream>

struct Square { int side; int area() const { return side * side; } };
struct Rect { int w, h; int area() const { return w * h; } };

// 樣板只要求 shape.area() 能編譯：不需要共同的基底類別
template <typename T>
int report(const T& shape, const char* name) {
    std::cout << name << " " << shape.area() << "\n";
    return shape.area();
}

int main() {
    int total = report(Square{3}, "Square");
    total += report(Rect{2, 5}, "Rect");
    std::cout << "total " << total << "\n";
    return 0;
}`,
        Python: code`class Square:
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side * self.side


class Rect:
    def __init__(self, w, h):
        self.w, self.h = w, h

    def area(self):
        return self.w * self.h


def report(shape, name):  # 鴨子型別：有 area() 就能用
    print(name, shape.area())
    return shape.area()


total = report(Square(3), "Square")
total += report(Rect(2, 5), "Rect")
print("total", total)`,
        Java: code`interface Shape {
    int area();
}

record Square(int side) implements Shape {
    public int area() { return side * side; }
}

record Rect(int w, int h) implements Shape {  // 拿掉 implements Shape 就無法傳給 report
    public int area() { return w * h; }
}

public class Main {
    static int report(Shape shape, String name) {
        System.out.println(name + " " + shape.area());
        return shape.area();
    }

    public static void main(String[] args) {
        int total = report(new Square(3), "Square");
        total += report(new Rect(2, 5), "Rect");
        System.out.println("total " + total);
    }
}`,
        JavaScript: code`class Square {
    constructor(side) { this.side = side; }
    area() { return this.side * this.side; }
}

// 不屬於任何類別的物件，只要有 area() 也能用
const rect = { w: 2, h: 5, area() { return this.w * this.h; } };

function report(shape, name) {
    console.log(name, shape.area());
    return shape.area();
}

let total = report(new Square(3), "Square");
total += report(rect, "Rect");
console.log("total", total);`,
      },
    },
    {
      id: 'hints', title: '標註了 int，傳進別的型別會怎樣', description: 'twice 的參數標註為整數，再分別傳入 21 與一個不是整數的值：C++ 與 Java 傳字元 \'A\'，Python 與 JavaScript 傳字串 "ab"。',
      output: '42\n130',
      outputByLanguage: { Python: '42\nabab', JavaScript: '42\nNaN' },
      code: {
        'C++': code`#include <iostream>

int twice(int n) { return n * 2; }

int main() {
    std::cout << twice(21) << "\n";
    std::cout << twice('A') << "\n";  // char 隱式放大成 int：'A' 是 65
    // twice("ab") 無法編譯：字串不能轉成 int
    return 0;
}`,
        Python: code`def twice(n: int) -> int:
    return n * 2


print(twice(21))
print(twice("ab"))  # 型別提示不在執行時檢查：字串乘 2 是重複兩次`,
        Java: code`public class Main {
    static int twice(int n) {
        return n * 2;
    }

    public static void main(String[] args) {
        System.out.println(twice(21));
        System.out.println(twice('A'));  // char 隱式放大成 int：'A' 是 65
        // twice("ab") 無法編譯：String cannot be converted to int
    }
}`,
        JavaScript: code`function twice(n) {  // JavaScript 沒有型別標註
    return n * 2;
}

console.log(twice(21));
console.log(twice("ab"));  // "ab" 轉成數字得到 NaN，NaN * 2 仍是 NaN`,
      },
    },
  ],
  quiz: [
    {
      id: 'q1', prompt: '在 JavaScript 中依序執行 `console.log("3" + 4 + 5);` 與 `console.log(3 + 4 + "5");`，會印出哪兩行？',
      options: ['345 與 75', '12 與 12', '345 與 345', '75 與 345'],
      answer: 0, explanation: '`+` 由左到右計算。第一行先算 `"3" + 4`，有一邊是字串，所以串接成 "34"，再串上 5 得 "345"。第二行先算 `3 + 4`，兩邊都是數字，得 7，再遇到字串 "5" 才串接成 "75"。選 12 是以為字串會被轉成數字；選兩個 345 或順序相反，都是忽略了「由左到右、看當下兩邊的型別」。',
    },
    {
      id: 'q2', prompt: '執行下面的 Python 程式（不另外使用型別檢查工具）會發生什麼事？',
      code: { language: 'Python', text: 'def f(x):\n    if x > 0:\n        return x + 1\n    return x + "!"\n\nprint(f(2))\nprint(f(-1))' },
      options: ['程式開始前就回報型別錯誤，什麼都不印', '先印出 3，接著在 f(-1) 那一行丟出 TypeError', '印出 3 與 -1!', '印出 3 與 0'],
      answer: 1, explanation: 'Python 是動態型別：定義 f 時不檢查 `x + "!"`，`f(2)` 走第一個分支，正常印出 3。直到 `f(-1)` 真的執行 `-1 + "!"`，才發現 int 不能加 str，丟出 TypeError。Python 不會在執行前檢查型別，所以第一個選項錯；它也是強型別，不會像 JavaScript 那樣把 -1 轉成字串得到 "-1!"，更不會把字串當成 0。',
    },
    {
      id: 'q3', prompt: '關於 Python 的型別特性，哪一個描述正確？',
      options: ['動態型別、強型別', '動態型別、弱型別', '靜態型別、強型別', '靜態型別、弱型別'],
      answer: 0, explanation: 'Python 執行到那一行才檢查型別，所以是動態型別；但 `"5" + 1` 會丟出 TypeError 而不是自動轉型，所以是強型別。選「弱型別」是把「動態」和「弱」混為一談，兩者是不同的軸（JavaScript 才是動態又偏弱）。Python 沒有編譯時的型別檢查，型別提示也不在執行時檢查，所以不是靜態型別。',
    },
    {
      id: 'q4', prompt: '這段 C++17 程式會印出什麼？',
      code: { language: 'C++', text: 'auto x = 5 / 2;\nauto y = x * 1.5;\nstd::cout << y << "\\n";' },
      options: ['3.75', '3', '2', '編譯錯誤：auto 無法推論型別'],
      answer: 1, explanation: '`5 / 2` 是兩個 int 相除，結果是 int 的 2，所以 x 被推論為 int、值為 2。`x * 1.5` 是 int 乘 double，結果是 double 的 3.0，y 被推論為 double；`std::cout` 印 3.0 時顯示為 3。選 3.75 是以為 x 是 2.5（忘了整數除法）；選 2 是以為 y 也是 int；auto 有初始值就能推論，不會編譯錯誤。',
    },
    {
      id: 'q5', prompt: '下面的 Java 程式中，Duck 有 speak() 方法但沒有宣告 implements Speaker。結果是？',
      code: { language: 'Java', text: 'interface Speaker { String speak(); }\nclass Duck { public String speak() { return "quack"; } }\n\npublic class Main {\n    static void talk(Speaker s) { System.out.println(s.speak()); }\n    public static void main(String[] args) { talk(new Duck()); }\n}' },
      options: ['編譯錯誤：Duck 不是 Speaker', '印出 quack', '可以編譯，執行時丟出 ClassCastException', '印出 null'],
      answer: 0, explanation: 'Java 採名義型別：Duck 沒有宣告 `implements Speaker`，即使方法名稱與型別完全相同，編譯器仍不把它當成 Speaker，回報 incompatible types: Duck cannot be converted to Speaker。印出 quack 是結構型別或鴨子型別（例如 TypeScript、Python）的行為；Java 在編譯時就擋下，所以不會等到執行時才丟出 ClassCastException，也不會印出 null。',
    },
    {
      id: 'q6', prompt: '下面的 Python 程式執行時會怎樣？',
      code: { language: 'Python', text: 'def area(w: int, h: int) -> int:\n    return w * h\n\nprint(area("ab", 3))' },
      options: ['印出 ababab', '呼叫時丟出 TypeError：w 應該是 int', '印出 0', '程式無法開始執行：型別提示不符'],
      answer: 0, explanation: 'Python 的型別提示只是標註，直譯器執行時不檢查，所以 `area("ab", 3)` 照樣執行。`"ab" * 3` 是把字串重複三次，得到 ababab。想在執行前抓到這個錯，要另外用靜態型別檢查工具（例如 mypy）；直譯器本身不會丟出 TypeError，也不會拒絕執行，字串乘整數更不會得到 0。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '嚴格的整數加總',
      statement: '一個表單收到 n 個欄位，每個欄位都是使用者輸入的原始文字。只有「看起來完全是整數」的欄位才能加進總和：可以有一個 + 或 - 號，後面接 1 到 10 個 0–9 的數字，不能有任何其他字元（包含空白、小數點、底線、字母），而且數值必須在 −1,000,000,000 到 1,000,000,000 之間。不要依賴語言內建轉換函式的寬鬆行為（例如 JavaScript 的 `Number("")` 是 0、C++ 的 `std::stoi("12abc")` 是 12、Python 的 `int(" 4")` 是 4），先檢查整個字串，再轉換。輸出合法欄位的總和，以及不合法欄位的編號。',
      inputFormat: '第一行是整數 n。接下來 n 行，每行是一個欄位的原始文字（可能是空行，也可能含空白）。',
      outputFormat: '兩行：第一行為 `sum = S`，S 是所有合法欄位的總和；第二行為 `invalid = ` 後接不合法欄位的編號（從 1 開始、由小到大、以空白分隔），沒有不合法欄位時寫 `invalid = none`。',
      constraints: ['0 ≤ n ≤ 100', '每個欄位最多 20 個 ASCII 字元', '總和可能超過 32 位元整數的範圍'],
      samples: [{ kind: 'normal', input: '4\n12\n-5\n7\n+3', output: 'sum = 17\ninvalid = none', note: '四個欄位都合法：12 − 5 + 7 + 3 = 17' }],
      tests: [
        { kind: 'normal', input: '4\n12\n-5\n7\n+3', output: 'sum = 17\ninvalid = none', note: '全部合法，含正負號' },
        { kind: 'normal', input: '5\n10\nabc\n20\n3.5\n007', output: 'sum = 37\ninvalid = 2 4', note: '字母與小數不合法；前導零的 007 是 7' },
        { kind: 'edge', input: '0', output: 'sum = 0\ninvalid = none', note: '沒有任何欄位' },
        { kind: 'edge', input: '3\n1000000000\n1000000000\n1000000000', output: 'sum = 3000000000\ninvalid = none', note: '每個都在上限，總和超過 32 位元整數' },
        { kind: 'edge', input: '4\n-1000000000\n1000000001\n-0\n0000000001', output: 'sum = -999999999\ninvalid = 2', note: '下限合法、剛超過上限不合法；-0 是 0；10 位數的 0000000001 是 1' },
        { kind: 'edge', input: '2\n10000000000\n12345678901', output: 'sum = 0\ninvalid = 1 2', note: '11 位數字一律不合法' },
        { kind: 'error', input: '6\n\n 4\n12abc\n1_000\n0x1A\n1e3', output: 'sum = 0\ninvalid = 1 2 3 4 5 6', note: '空字串、前面有空白、尾端有字母、底線、十六進位、科學記號：都是語言內建轉換可能接受的寫法' },
        { kind: 'error', input: '5\n+\n-\n+-5\n5-\n8', output: 'sum = 8\ninvalid = 1 2 3 4', note: '只有符號、兩個符號、符號在後面都不合法' },
      ],
      hints: [
        '把「合法」寫成一個函式：先處理可有可無的一個符號，再檢查剩下的部分是 1 到 10 個 0–9 的數字，最後檢查範圍。',
        '10 位數字最大約 10¹⁰，總和最大約 10¹¹：C++ 用 `long long`、Java 用 `long`；Python 與 JavaScript 的整數在這個範圍內都精確。',
        '用正規表示式時要比對整個字串：Python 用 `re.fullmatch` 並寫 `[0-9]`（`\\d` 也接受其他文字的數字），JavaScript 用 `^` 與 `$`，Java 的 `String.matches` 本身就比對整個字串。',
        '讀取時以「行」為單位，不要用以空白分隔的讀法，否則空行與含空白的欄位會被跳過或拆開。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>

// 符號（可省略）+ 1 到 10 個 0-9 的數字，而且在 ±10^9 以內
bool parseStrict(const std::string& s, long long& value) {
    std::size_t i = (!s.empty() && (s[0] == '+' || s[0] == '-')) ? 1 : 0;
    std::size_t digits = s.size() - i;
    if (digits < 1 || digits > 10) return false;
    long long v = 0;
    for (std::size_t k = i; k < s.size(); ++k) {
        if (s[k] < '0' || s[k] > '9') return false;
        v = v * 10 + (s[k] - '0');
    }
    if (s[0] == '-') v = -v;
    if (v < -1000000000LL || v > 1000000000LL) return false;
    value = v;
    return true;
}

int main() {
    std::string line;
    std::getline(std::cin, line);
    int n = std::stoi(line);
    long long sum = 0;
    std::string invalid;
    for (int i = 1; i <= n; ++i) {
        if (!std::getline(std::cin, line)) line = "";
        long long v;
        if (parseStrict(line, v)) sum += v;
        else invalid += (invalid.empty() ? "" : " ") + std::to_string(i);
    }
    std::cout << "sum = " << sum << "\n";
    std::cout << "invalid = " << (invalid.empty() ? "none" : invalid) << "\n";
    return 0;
}`,
        Python: code`import re
import sys

PATTERN = re.compile(r"[+-]?[0-9]{1,10}")  # [0-9] 而不是 \d：只接受 ASCII 數字


def parse_strict(s):
    if not PATTERN.fullmatch(s):
        return None
    value = int(s)
    return value if -1_000_000_000 <= value <= 1_000_000_000 else None


lines = sys.stdin.read().split("\n")
n = int(lines[0])
total = 0
invalid = []
for i in range(1, n + 1):
    field = lines[i] if i < len(lines) else ""
    value = parse_strict(field)
    if value is None:
        invalid.append(str(i))
    else:
        total += value
print(f"sum = {total}")
print("invalid =", " ".join(invalid) if invalid else "none")`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

public class Main {
    // 符號（可省略）+ 1 到 10 個 0-9 的數字；回傳 null 表示不合法
    static Long parseStrict(String s) {
        if (!s.matches("[+-]?[0-9]{1,10}")) return null;
        long value = Long.parseLong(s);
        return (value >= -1_000_000_000L && value <= 1_000_000_000L) ? value : null;
    }

    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(in.readLine().trim());
        long sum = 0;
        List<String> invalid = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            String field = in.readLine();
            Long value = parseStrict(field == null ? "" : field);
            if (value == null) invalid.add(String.valueOf(i));
            else sum += value;
        }
        System.out.println("sum = " + sum);
        System.out.println("invalid = " + (invalid.isEmpty() ? "none" : String.join(" ", invalid)));
    }
}`,
        JavaScript: code`const lines = require("fs").readFileSync(0, "utf8").split("\n");

// 符號（可省略）+ 1 到 10 個 0-9 的數字；不合法時回傳 null
function parseStrict(s) {
    if (!/^[+-]?[0-9]{1,10}$/.test(s)) return null;
    const value = Number(s);  // 已確認格式，這裡的轉換不會猜
    return value >= -1e9 && value <= 1e9 ? value : null;
}

const n = Number(lines[0]);
let sum = 0;
const invalid = [];
for (let i = 1; i <= n; i++) {
    const value = parseStrict(lines[i] ?? "");
    if (value === null) invalid.push(i);
    else sum += value;
}
console.log("sum = " + sum);
console.log("invalid = " + (invalid.length ? invalid.join(" ") : "none"));`,
      },
      judge: 'none',
    },
  ],
};
