import type { LessonContent } from '../schema';

const code = String.raw;

/**
 * PL05 泛型與多型. Every example and the reference solutions run in tests/curriculum-code.test.ts.
 * The blueprint activity (type-checker) is not built, so the lesson uses tables instead of a visualization.
 */
export const PL05: LessonContent = {
  lessonId: 'PL05',
  motivation: '寫了一個找最大值的函式，換成字串、換成自訂的學生資料又得再寫一次？泛型讓同一份程式適用於許多型別，同時保留編譯器的型別檢查；分清楚多載、覆寫與泛型這三種多型，才能預測「到底會呼叫哪一個」，也才看得懂 Java 的 `List<Integer>` 為什麼不能寫成 `List<int>`。',
  sections: [
    {
      id: 'kinds-of-polymorphism', title: '三種多型：多載、覆寫與泛型',
      blocks: [
        { type: 'p', text: '多型（polymorphism）是「同一個名字，適用於不同型別」。它其實有三種，差別在於「由誰、在什麼時候」決定執行哪一段程式：' },
        { type: 'table', head: ['種類', '做法', '何時決定', 'C++', 'Java', 'Python', 'JavaScript'], rows: [
          ['特設多型（ad-hoc polymorphism）', '多載（overloading）：同名函式，各型別各寫一份', '編譯時，依引數的靜態型別', '有', '有', '沒有；可用 `functools.singledispatch` 在執行時依型別分派', '沒有；同名函式後者蓋掉前者，只能在函式內用 `typeof` 分流'],
          ['子型別多型（subtype polymorphism）', '覆寫（override）＋動態分派（PL02）', '執行時，依物件的實際型別', '`virtual`', '預設就是', '預設就是', '預設就是（prototype）'],
          ['參數多型（parametric polymorphism）', '泛型（generics）／模板（template）：一份程式，型別當成參數', '編譯時檢查；執行方式各語言不同', '模板', '泛型', '`TypeVar`／`Generic` 標註（不在執行時檢查）', '沒有靜態泛型，靠鴨子型別'],
        ] },
        { type: 'p', text: '下面的程式在同一段裡示範三種：`show` 有整數與字串兩個版本（多載）；`Animal` 型別的變數實際指向 `Dog`，呼叫到 `Dog` 的 `speak`（子型別多型，PL02 的動態分派）；`firstOf` 只寫一次，就能用在整數串列與字串串列（參數多型）。' },
        { type: 'example', id: 'three-kinds' },
        { type: 'p', text: '多載與覆寫最容易混淆。多載是在編譯時，看引數「宣告的型別」從幾個同名函式中挑一個；覆寫是在執行時，看物件「實際的型別」決定方法。所以 Java 的 `Animal pet = new Dog();` 呼叫 `greet(pet)` 時，挑到的是 `greet(Animal)` 這個多載版本，但它裡面的 `pet.name()` 仍然執行 `Dog` 的覆寫版本。' },
        { type: 'callout', tone: 'note', title: 'Python 與 JavaScript 沒有多載', text: 'Python 的 `def show(x)` 寫兩次，第二次會取代第一次；JavaScript 的 `function show` 也一樣。需要依型別做不同的事時，Python 用 `functools.singledispatch`（在執行時依第一個引數的型別選），JavaScript 在函式內用 `typeof` 或 `instanceof` 判斷。這些都是執行時的選擇，與 C++、Java 在編譯時決定不同。' },
      ],
    },
    {
      id: 'generics', title: '參數多型：為什麼要泛型，而不是 Object 或 void*',
      blocks: [
        { type: 'p', text: '沒有泛型時，通用容器只能存「什麼都可以」的型別：Java 5 以前的 `List` 存 `Object`，C 的通用函式用 `void*`。取出來時必須自己轉型（cast），轉錯了編譯器不知道，要到執行時才出錯（Java 丟出 `ClassCastException`，C 則是讀到錯誤的記憶體）。' },
        { type: 'p', text: '泛型把型別寫成參數：`Box<T>` 的 `T` 由使用者填入，例如 `Box<String>`。編譯器因此知道 `get()` 一定回傳 `String`，放錯型別在編譯時就被擋下，取出時也不必轉型。同一份 `Box` 程式可以用於任何型別，又不必放棄型別檢查，這就是參數多型的好處。' },
        { type: 'example', id: 'box' },
        { type: 'p', text: '注意最後一行在 C++ 是 false，在其他語言是 true。C++ 的模板在編譯時為每個用到的型別各產生一份類別（模板實例化，template instantiation），`Box<int>` 與 `Box<std::string>` 是兩個不同的類別；Java 編譯後把型別參數擦掉（型別擦除，type erasure），執行時只剩一個 `Box` 類別；Python 的 `Box[int]` 只是給型別檢查工具（如 mypy）看的標註，建立出來的物件就是 `Box`；JavaScript 本來就沒有型別參數。' },
        { type: 'p', text: 'TypeScript 是有靜態泛型的 JavaScript：`class Box<T> { constructor(private value: T) {} get(): T { return this.value; } }`。它在編譯時檢查型別，然後輸出不含型別的 JavaScript，所以和 Java 一樣，執行時沒有 `T` 的資訊。' },
      ],
    },
    {
      id: 'constraints', title: '型別約束：限制 T 必須能做什麼',
      blocks: [
        { type: 'p', text: '寫 `maxOf` 時，函式裡要比較兩個元素，所以不是任何型別都行：`T` 必須「能比較大小」。型別約束（type constraint）把這個要求寫進宣告，讓不符合的型別在呼叫處就被拒絕，錯誤訊息也更清楚。' },
        { type: 'table', head: ['語言', '約束寫法', '不符合時'], rows: [
          ['C++17', '不寫；模板裡用到 `a < b`，就隱含要求 `T` 有 `operator<`', '實例化時編譯錯誤，訊息指向模板內部'],
          ['C++20', 'concepts：`template <std::totally_ordered T>`', '在呼叫處就說明哪個條件不滿足'],
          ['Java', '有界型別（bounded type）：`<T extends Comparable<T>>`', '編譯錯誤：型別不在界限內'],
          ['Python', '`TypeVar("T", bound=SupportsLessThan)`，約束是一個 `Protocol`（結構型別：有 `__lt__` 就符合）', '型別檢查工具回報；直接執行不檢查，比較時才可能丟出 `TypeError`'],
          ['TypeScript', '`<T extends { score: number }>` 或傳入比較函式', '編譯錯誤'],
          ['JavaScript', '無；慣例是讓呼叫者傳入比較函式', '執行時才發現，或悄悄得到錯誤結果'],
        ] },
        { type: 'example', id: 'max-of' },
        { type: 'p', text: '自訂型別要滿足約束，就得提供比較的方法：C++ 的 `Student` 定義 `operator<`，Java 的 `Student` 實作 `Comparable<Student>`，Python 的 `Student` 定義 `__lt__`（它不必繼承 `SupportsLessThan`，因為 `Protocol` 只看結構）。JavaScript 的 `<` 不能為物件重新定義，所以 `maxOf` 多收一個比較函式 `less`，預設用 `<`，比較學生時傳入依分數比較的函式。' },
      ],
    },
    {
      id: 'erasure-vs-instantiation', title: '型別擦除與模板實例化：同一段泛型程式的兩種命運',
      blocks: [
        { type: 'p', text: 'C++ 與 Java 都在編譯時檢查泛型，但產生的程式完全不同，帶來不同的代價與限制：' },
        { type: 'table', head: ['', 'C++ 模板實例化', 'Java 型別擦除'], rows: [
          ['編譯結果', '每個用到的 `T` 各產生一份程式碼（`maxOf<int>`、`maxOf<std::string>`）', '只有一份程式碼，`T` 換成界限（`Object` 或 `Comparable`），並自動插入轉型'],
          ['基本型別', '`Box<int>` 直接存 int', '不行：`List<int>` 編譯錯誤，要寫 `List<Integer>`，靠自動裝箱（autoboxing）'],
          ['執行時的型別資訊', '每個實例化是不同型別', '`List<String>` 與 `List<Integer>` 是同一個類別；`x instanceof List<String>` 不合法'],
          ['建立 T', '`T value{};` 可以', '`new T()`、`new T[n]` 都不行，因為執行時不知道 T 是什麼'],
          ['錯誤何時出現', '模板定義時只檢查語法，用某個型別實例化時才檢查 `a < b` 之類的運算', '泛型方法本身就依界限檢查，呼叫處的型別不符立刻報錯'],
          ['代價', '程式碼變大（code bloat）、編譯較慢、錯誤訊息很長；執行快', '程式碼小；但基本型別要裝箱，執行時無法依 `T` 做事'],
        ] },
        { type: 'example', id: 'generic-equality' },
        { type: 'callout', tone: 'warning', title: '在 Java 泛型裡用 == 比較值', text: '`T` 在 Java 一定是參考型別，`a == b` 比較的是「是不是同一個物件」，不是內容。`same(100, 100)` 是 true 只是因為 Java 保證 −128～127 的 `Integer` 會共用快取的物件；`1000` 超出這個範圍，兩次裝箱得到不同物件，結果是 false；執行時組出來的字串也是新的物件。泛型程式比較內容要用 `a.equals(b)`，可能是 null 時用 `Objects.equals(a, b)`。C++ 的 `==` 呼叫該型別的比較運算子，Python 的 `==` 與 JavaScript 的 `===`（對數字與字串）都比較值，所以沒有這個問題。' },
        { type: 'callout', tone: 'warning', title: 'Java 的原始型別（raw type）會讓型別檢查失效', text: '寫成 `List raw = new ArrayList();`（不帶 `<…>`）就回到 Java 5 以前的 `Object` 容器：放進整數與字串都能編譯，只有「unchecked」警告。之後把它指定給 `List<String>` 並取出元素時，編譯器插入的轉型會在執行時丟出 `ClassCastException`，而且錯誤出現在取出的那一行，不是放錯的那一行。永遠寫出型別參數，或至少用 `List<Object>` 明確表示「什麼都放」。' },
        { type: 'callout', tone: 'tip', title: '看懂 C++ 模板的長串錯誤', text: '把沒有 `operator<` 的型別傳給 `maxOf`，錯誤訊息會指向模板內部的 `best < x`，再附上「in instantiation of …」的說明。找出標著「required from here」（g++）或「requested here」（clang）的那一行，就是你自己呼叫模板的地方；C++20 的 concepts 可以把這種錯誤提前到呼叫處，訊息也短得多。' },
      ],
    },
  ],
  examples: [
    {
      id: 'three-kinds', title: '同一個程式裡的三種多型', description: '多載的 show、覆寫的 speak、泛型的 firstOf。Python 用 singledispatch、JavaScript 用 typeof 代替多載。',
      output: 'int 42\nstring hi\nWoof\n3 x',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

// 特設多型：同名、不同參數型別，編譯器依引數型別挑一個
void show(int n) { std::cout << "int " << n << "\n"; }
void show(const std::string& s) { std::cout << "string " << s << "\n"; }

// 子型別多型：執行時依物件的實際型別選方法
struct Animal {
    virtual ~Animal() = default;
    virtual std::string speak() const { return "..."; }
};
struct Dog : Animal {
    std::string speak() const override { return "Woof"; }
};

// 參數多型：一份程式，T 可以是任何型別
template <typename T>
T firstOf(const std::vector<T>& items) { return items[0]; }

int main() {
    show(42);
    show(std::string("hi"));
    Dog dog;
    const Animal& a = dog;
    std::cout << a.speak() << "\n";
    std::cout << firstOf(std::vector<int>{3, 1, 2}) << " "
              << firstOf(std::vector<std::string>{"x", "y"}) << "\n";
    return 0;
}`,
        Python: code`from functools import singledispatch
from typing import TypeVar

T = TypeVar("T")


@singledispatch  # 執行時依第一個引數的型別分派
def show(value):
    print("other", value)


@show.register
def _(value: int):
    print("int", value)


@show.register
def _(value: str):
    print("string", value)


class Animal:
    def speak(self):
        return "..."


class Dog(Animal):
    def speak(self):
        return "Woof"


def first_of(items: list[T]) -> T:
    return items[0]


show(42)
show("hi")
a: Animal = Dog()
print(a.speak())
print(first_of([3, 1, 2]), first_of(["x", "y"]))`,
        Java: code`import java.util.List;

class Animal {
    String speak() { return "..."; }
}

class Dog extends Animal {
    @Override
    String speak() { return "Woof"; }
}

public class Main {
    // 特設多型：多載
    static void show(int n) { System.out.println("int " + n); }
    static void show(String s) { System.out.println("string " + s); }

    // 參數多型：泛型方法
    static <T> T firstOf(List<T> items) { return items.get(0); }

    public static void main(String[] args) {
        show(42);
        show("hi");
        Animal a = new Dog();  // 子型別多型
        System.out.println(a.speak());
        System.out.println(firstOf(List.of(3, 1, 2)) + " " + firstOf(List.of("x", "y")));
    }
}`,
        JavaScript: code`// 沒有多載：同名函式後者會蓋掉前者，所以在函式內依 typeof 分流
function show(value) {
    if (typeof value === "number") console.log("int", value);
    else if (typeof value === "string") console.log("string", value);
}

class Animal {
    speak() { return "..."; }
}

class Dog extends Animal {
    speak() { return "Woof"; }
}

// 沒有型別參數：本來就接受任何值
function firstOf(items) {
    return items[0];
}

show(42);
show("hi");
const a = new Dog();
console.log(a.speak());
console.log(firstOf([3, 1, 2]), firstOf(["x", "y"]));`,
      },
    },
    {
      id: 'box', title: '泛型容器 Box<T>：實例化與擦除', description: '取出時不必轉型；最後一行比較 Box<int> 與 Box<string> 在執行時是不是同一個類別。',
      output: '6\nhi\nsame class: true',
      outputByLanguage: { 'C++': '6\nhi\nsame class: false' },
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <type_traits>

template <typename T>
class Box {
public:
    explicit Box(T value) : value_(value) {}
    T get() const { return value_; }

private:
    T value_;
};

int main() {
    Box<int> a(5);
    Box<std::string> b("hi");
    std::cout << a.get() + 1 << "\n";  // get() 回傳 int，不必轉型
    std::cout << b.get() << "\n";
    // 每個 T 各實例化成一個不同的類別
    bool same = std::is_same_v<Box<int>, Box<std::string>>;
    std::cout << "same class: " << std::boolalpha << same << "\n";
    return 0;
}`,
        Python: code`from typing import Generic, TypeVar

T = TypeVar("T")


class Box(Generic[T]):
    def __init__(self, value: T) -> None:
        self.value = value

    def get(self) -> T:
        return self.value


a = Box[int](5)
b = Box[str]("hi")
print(a.get() + 1)
print(b.get())
# Box[int] 只是標註，建立的物件都是 Box
print("same class:", str(type(a) is type(b)).lower())`,
        Java: code`class Box<T> {
    private final T value;

    Box(T value) { this.value = value; }

    T get() { return value; }
}

public class Main {
    public static void main(String[] args) {
        Box<Integer> a = new Box<>(5);  // 不能寫 Box<int>
        Box<String> b = new Box<>("hi");
        System.out.println(a.get() + 1);  // get() 回傳 Integer，不必轉型
        System.out.println(b.get());
        // 型別擦除：執行時兩者都是 Box
        System.out.println("same class: " + (a.getClass() == b.getClass()));
    }
}`,
        JavaScript: code`class Box {
    #value;

    constructor(value) {
        this.#value = value;
    }

    get() {
        return this.#value;
    }
}

const a = new Box(5);
const b = new Box("hi");
console.log(a.get() + 1);
console.log(b.get());
console.log("same class:", a.constructor === b.constructor);`,
      },
    },
    {
      id: 'max-of', title: '帶約束的泛型 maxOf', description: '同一個 maxOf 用於整數、字串與自訂的 Student；T 必須能比較大小。',
      output: '9\npear\nMia',
      code: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

struct Student {
    std::string name;
    int score;
    bool operator<(const Student& other) const { return score < other.score; }
};

template <typename T>  // 隱含的約束：T 要有 operator<
T maxOf(const std::vector<T>& items) {
    T best = items[0];
    for (const T& x : items) {
        if (best < x) best = x;
    }
    return best;
}

int main() {
    std::cout << maxOf(std::vector<int>{4, 9, 2}) << "\n";
    std::cout << maxOf(std::vector<std::string>{"apple", "pear", "fig"}) << "\n";
    std::vector<Student> team{{"Leo", 82}, {"Mia", 95}, {"Ian", 88}};
    std::cout << maxOf(team).name << "\n";
    return 0;
}`,
        Python: code`from dataclasses import dataclass
from typing import Any, Protocol, TypeVar


class SupportsLessThan(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=SupportsLessThan)  # T 必須有 __lt__


def max_of(items: list[T]) -> T:
    best = items[0]
    for x in items:
        if best < x:
            best = x
    return best


@dataclass
class Student:
    name: str
    score: int

    def __lt__(self, other: "Student") -> bool:
        return self.score < other.score


print(max_of([4, 9, 2]))
print(max_of(["apple", "pear", "fig"]))
team = [Student("Leo", 82), Student("Mia", 95), Student("Ian", 88)]
print(max_of(team).name)`,
        Java: code`import java.util.List;

record Student(String name, int score) implements Comparable<Student> {
    @Override
    public int compareTo(Student other) {
        return Integer.compare(score, other.score);
    }
}

public class Main {
    // 有界型別：T 必須實作 Comparable<T>
    static <T extends Comparable<T>> T maxOf(List<T> items) {
        T best = items.get(0);
        for (T x : items) {
            if (best.compareTo(x) < 0) best = x;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(maxOf(List.of(4, 9, 2)));
        System.out.println(maxOf(List.of("apple", "pear", "fig")));
        List<Student> team = List.of(new Student("Leo", 82), new Student("Mia", 95), new Student("Ian", 88));
        System.out.println(maxOf(team).name());
    }
}`,
        JavaScript: code`// 沒有型別約束：由呼叫者傳入比較函式，預設用 <
function maxOf(items, less = (a, b) => a < b) {
    let best = items[0];
    for (const x of items) {
        if (less(best, x)) best = x;
    }
    return best;
}

console.log(maxOf([4, 9, 2]));
console.log(maxOf(["apple", "pear", "fig"]));
const team = [{ name: "Leo", score: 82 }, { name: "Mia", score: 95 }, { name: "Ian", score: 88 }];
console.log(maxOf(team, (a, b) => a.score < b.score).name);`,
      },
    },
    {
      id: 'generic-equality', title: '泛型函式裡的 ==', description: '同一個 same(a, b) 比較兩個整數與兩個內容相同的字串。Java 的 == 比較的是物件本身。',
      output: 'true true true',
      outputByLanguage: { Python: 'True True True', Java: 'true false false' },
      code: {
        'C++': code`#include <iostream>
#include <string>

template <typename T>
bool same(const T& a, const T& b) {
    return a == b;  // 呼叫 T 的 operator==，比較值
}

int main() {
    std::string built = std::string("a") + "b";
    std::cout << std::boolalpha << same(100, 100) << " " << same(1000, 1000) << " "
              << same(std::string("ab"), built) << "\n";
    return 0;
}`,
        Python: code`from typing import TypeVar

T = TypeVar("T")


def same(a: T, b: T) -> bool:
    return a == b  # == 比較值


built = "".join(["a", "b"])
print(same(100, 100), same(1000, 1000), same("ab", built))`,
        Java: code`public class Main {
    static <T> boolean same(T a, T b) {
        return a == b;  // 錯誤示範：比較的是參考，應改用 a.equals(b)
    }

    public static void main(String[] args) {
        String built = String.join("", "a", "b");
        System.out.println(same(100, 100) + " " + same(1000, 1000) + " " + same("ab", built));
    }
}`,
        JavaScript: code`function same(a, b) {
    return a === b;  // 數字與字串比較的是值
}

const built = ["a", "b"].join("");
console.log(same(100, 100), same(1000, 1000), same("ab", built));`,
      },
    },
  ],
  quiz: [
    {
      id: 'q1', prompt: '下面的 Java 程式輸出什麼？（`greet` 有兩個多載版本）',
      code: { language: 'Java', text: 'class Animal { String name() { return "Animal"; } }\nclass Dog extends Animal {\n    @Override String name() { return "Dog"; }\n}\n// Main 中：\nstatic String greet(Animal a) { return "animal:" + a.name(); }\nstatic String greet(Dog d) { return "dog:" + d.name(); }\n\nAnimal pet = new Dog();\nSystem.out.println(greet(pet));' },
      options: ['animal:Animal', 'animal:Dog', 'dog:Dog', 'dog:Animal'],
      answer: 1,
      explanation: '多載在編譯時依引數的「宣告型別」挑選：pet 宣告為 Animal，所以選 `greet(Animal)`，不是 dog: 開頭的兩個選項。進入函式後 `a.name()` 是覆寫的方法，執行時依物件的實際型別 Dog 分派，回傳 "Dog"，所以不是 animal:Animal。結果是 animal:Dog。',
    },
    {
      id: 'q2', prompt: '下面的 C++ 程式輸出什麼？',
      code: { language: 'C++', text: 'void show(bool) { std::cout << "bool"; }\nvoid show(const std::string&) { std::cout << "string"; }\n\nint main() {\n    show("hi");\n}' },
      options: ['string', 'bool', '編譯錯誤：呼叫不明確', '執行時錯誤'],
      answer: 1,
      explanation: '"hi" 的型別是 `const char[3]`，會先變成指標 `const char*`。指標轉成 bool 是標準轉換，轉成 `std::string` 則要呼叫建構子（使用者定義的轉換）；多載解析時標準轉換優先，所以選 `show(bool)`、輸出 bool。兩者等級不同，所以不是「不明確」；選擇在編譯時就完成，也不會有執行時錯誤。要呼叫字串版本，請寫 `show(std::string("hi"))`。',
    },
    {
      id: 'q3', prompt: '在 Java 中，下列哪一行可以通過編譯？（假設已 import java.util.*，且 T 是外層泛型類別的型別參數）',
      options: ['List<int> xs = new ArrayList<>();', 'T item = new T();', 'List<Integer> xs = new ArrayList<>(); xs.add(5);', 'boolean ok = obj instanceof List<String>;  // obj 的型別是 Object'],
      answer: 2,
      explanation: '型別參數只能是參考型別，所以要寫 `List<Integer>`，`xs.add(5)` 會自動裝箱成 Integer。`List<int>` 不能用基本型別當型別參數；`new T()` 不行，因為型別擦除後執行時不知道 T 是哪個類別；`instanceof List<String>` 也不行，執行時只剩 List，無法檢查元素型別（只能寫 `instanceof List<?>`）。',
    },
    {
      id: 'q4', prompt: '下面的 Java 程式會發生什麼事？',
      code: { language: 'Java', text: 'List raw = new ArrayList();      // 原始型別\nraw.add("one");\nraw.add(2);\nList<String> words = raw;         // unchecked 警告\nfor (String w : words) {\n    System.out.print(w.length() + " ");\n}' },
      options: ['編譯錯誤：不能把 2 放進 List', '輸出 3 1', '輸出 3 之後丟出 ClassCastException', '輸出 3，並自動略過不是字串的 2'],
      answer: 2,
      explanation: '原始型別的 List 什麼都能放，指定給 `List<String>` 也只產生 unchecked 警告，所以能編譯。迴圈取出元素時，編譯器插入了轉成 String 的轉型：第一個 "one" 印出 3，第二個是 Integer，轉型失敗丟出 ClassCastException。Java 不會把 2 轉成字串（不會輸出 1），也不會略過它。',
    },
    {
      id: 'q5', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'from typing import Generic, TypeVar\n\nT = TypeVar("T")\n\nclass Box(Generic[T]):\n    def __init__(self, value: T) -> None:\n        self.value = value\n\nb = Box[int]("oops")\nprint(b.value * 2)' },
      options: ['在 Box[int]("oops") 丟出 TypeError', 'oopsoops', '0', '在 b.value * 2 丟出 TypeError'],
      answer: 1,
      explanation: '`Box[int]` 與 `value: T` 只是給 mypy 等工具看的標註，Python 執行時不檢查，所以建立物件不會丟出 TypeError。value 就是字串 "oops"，字串乘以 2 是重複兩次，輸出 oopsoops；不會變成 0，也不會在乘法出錯。用 mypy 檢查才會指出 "oops" 不是 int。',
    },
    {
      id: 'q6', prompt: '下面的 C++ 程式（已 include iostream）會發生什麼事？',
      code: { language: 'C++', text: 'template <typename T>\nT maxOf(T a, T b) { return a < b ? b : a; }\n\nstruct Point { int x, y; };\n\nint main() {\n    std::cout << maxOf(3, 7);\n    Point p{1, 2}, q{3, 4};\n    maxOf(p, q);\n}' },
      options: ['先輸出 7，執行到 maxOf(p, q) 時才出錯', '編譯錯誤：實例化 maxOf<Point> 時 Point 沒有 operator<', '可以編譯，比較的是兩個物件的記憶體位址', '只要模板定義中出現 a < b 就編譯錯誤，與是否呼叫無關'],
      answer: 1,
      explanation: '模板定義時不知道 T 是什麼，所以 `a < b` 要等到用 Point 實例化 `maxOf<Point>` 時才檢查，此時發現 Point 沒有 `operator<`，整個程式編譯失敗，連 7 都不會輸出（錯誤在編譯時，不在執行時）。C++ 不會自動比較位址；若刪掉 `maxOf(p, q)`，只用 int 實例化，程式就能編譯，所以也不是定義本身的錯。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '一個泛型函式，兩種資料',
      statement: '寫一個泛型函式 `minMax`，對一串元素同時找出最小值與最大值，只寫一次，再分別用於整數與字串：C++ 用模板、Java 用 `<T extends Comparable<T>>`、Python 用帶 `bound` 的 `TypeVar`、JavaScript 用比較函式或內建的 `<`。第一個詞是資料型別：`int` 表示整數，依數值比較；`word` 表示字串，依字元碼逐字比較（所以大寫字母小於小寫字母，`"10"` 小於 `"9"`）。型別不是這兩種時輸出 `Unknown type`；n 為 0 時輸出 `Empty`。',
      inputFormat: '第一行是型別 `int` 或 `word`；第二行是整數 n；第三行是 n 個以空白分隔的值（n 為 0 時沒有這一行）。',
      outputFormat: '一行：最小值與最大值，以一個空白分隔；或 `Unknown type`、`Empty`。',
      constraints: ['0 ≤ n ≤ 1000', 'int：−10⁹ ≤ 每個值 ≤ 10⁹', 'word：每個值由 1～20 個英文字母或數字組成'],
      samples: [
        { kind: 'normal', input: 'int\n5\n4 9 -2 7 0', output: '-2 9', note: '整數依數值比較' },
        { kind: 'edge', input: 'word\n3\n10 9 100', output: '10 9', note: '同樣的字當成字串時，依字元逐一比較' },
      ],
      tests: [
        { kind: 'normal', input: 'int\n5\n4 9 -2 7 0', output: '-2 9', note: '一般整數，含負數' },
        { kind: 'normal', input: 'word\n3\npear apple fig', output: 'apple pear', note: '一般字串' },
        { kind: 'edge', input: 'int\n3\n10 9 100', output: '9 100', note: '整數要依數值比較，不能當成字串比' },
        { kind: 'edge', input: 'word\n3\n10 9 100', output: '10 9', note: '字串依字元比較，"9" 大於 "100"' },
        { kind: 'edge', input: 'word\n3\napple Zebra mango', output: 'Zebra mango', note: '大寫字母的字元碼小於小寫字母' },
        { kind: 'edge', input: 'int\n1\n7', output: '7 7', note: '只有一個元素' },
        { kind: 'edge', input: 'int\n4\n5 5 5 5', output: '5 5', note: '全部相同' },
        { kind: 'edge', input: 'int\n4\n-1000000000 1000000000 0 1000000000', output: '-1000000000 1000000000', note: '範圍的兩端' },
        { kind: 'error', input: 'int\n0', output: 'Empty', note: '沒有元素，沒有最小值與最大值' },
        { kind: 'error', input: 'float\n2\n1.5 2.5', output: 'Unknown type', note: '不支援的型別' },
      ],
      hints: [
        '先寫 `minMax(items)`：lo 與 hi 都從第一個元素開始，逐一用「小於」更新；它不需要知道元素是整數還是字串。',
        '依第一個詞決定要把值讀成整數還是保留字串，再呼叫同一個 `minMax`。Python 與 JavaScript 讀進來都是字串，`int` 時記得先轉成數字，否則 "10" 會小於 "9"。',
        '回傳兩個值：C++ 的 `std::pair`、Java 的泛型 record、Python 的 tuple、JavaScript 的陣列。',
      ],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <utility>
#include <vector>

template <typename T>
std::pair<T, T> minMax(const std::vector<T>& items) {
    T lo = items[0], hi = items[0];
    for (const T& x : items) {
        if (x < lo) lo = x;
        if (hi < x) hi = x;
    }
    return {lo, hi};
}

template <typename T>
void solve(std::size_t n) {
    std::vector<T> items(n);
    for (T& x : items) std::cin >> x;
    auto [lo, hi] = minMax(items);
    std::cout << lo << " " << hi << "\n";
}

int main() {
    std::string type;
    std::size_t n = 0;
    std::cin >> type >> n;
    if (type != "int" && type != "word") {
        std::cout << "Unknown type\n";
    } else if (n == 0) {
        std::cout << "Empty\n";
    } else if (type == "int") {
        solve<long long>(n);
    } else {
        solve<std::string>(n);
    }
    return 0;
}`,
        Python: code`import sys
from typing import Any, Protocol, TypeVar


class SupportsLessThan(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


T = TypeVar("T", bound=SupportsLessThan)


def min_max(items: list[T]) -> tuple[T, T]:
    lo = hi = items[0]
    for x in items:
        if x < lo:
            lo = x
        if hi < x:
            hi = x
    return lo, hi


data = sys.stdin.read().split()
kind, n = data[0], int(data[1])
values = data[2:2 + n]
if kind not in ("int", "word"):
    print("Unknown type")
elif n == 0:
    print("Empty")
elif kind == "int":
    lo, hi = min_max([int(v) for v in values])
    print(lo, hi)
else:
    lo, hi = min_max(values)
    print(lo, hi)`,
        Java: code`import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class Main {
    record Range<T>(T lo, T hi) {}

    static <T extends Comparable<T>> Range<T> minMax(List<T> items) {
        T lo = items.get(0), hi = items.get(0);
        for (T x : items) {
            if (x.compareTo(lo) < 0) lo = x;
            if (hi.compareTo(x) < 0) hi = x;
        }
        return new Range<>(lo, hi);
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String type = sc.next();
        int n = sc.nextInt();
        if (!type.equals("int") && !type.equals("word")) {
            System.out.println("Unknown type");
        } else if (n == 0) {
            System.out.println("Empty");
        } else if (type.equals("int")) {
            List<Long> items = new ArrayList<>();
            for (int i = 0; i < n; ++i) items.add(sc.nextLong());
            Range<Long> r = minMax(items);
            System.out.println(r.lo() + " " + r.hi());
        } else {
            List<String> items = new ArrayList<>();
            for (int i = 0; i < n; ++i) items.add(sc.next());
            Range<String> r = minMax(items);
            System.out.println(r.lo() + " " + r.hi());
        }
    }
}`,
        JavaScript: code`function minMax(items, less = (a, b) => a < b) {
    let lo = items[0], hi = items[0];
    for (const x of items) {
        if (less(x, lo)) lo = x;
        if (less(hi, x)) hi = x;
    }
    return [lo, hi];
}

const data = require("fs").readFileSync(0, "utf8").trim().split(/\s+/);
const kind = data[0];
const n = Number(data[1]);
const values = data.slice(2, 2 + n);
if (kind !== "int" && kind !== "word") {
    console.log("Unknown type");
} else if (n === 0) {
    console.log("Empty");
} else {
    // int 要先轉成數字，否則 < 會依字串比較
    const items = kind === "int" ? values.map(Number) : values;
    const [lo, hi] = minMax(items);
    console.log(lo, hi);
}`,
      },
      judge: 'none',
    },
  ],
};
