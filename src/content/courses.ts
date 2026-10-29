import type { AlgorithmId } from '@/lib/engine';
export type Language = 'C++' | 'Python' | 'Java';
export interface CodeExample { code: string; highlights: Record<string, number[]>; }
export interface Course { slug: AlgorithmId; title: string; subtitle: string; description: string; category: '資料結構' | '搜尋與排序' | '圖論'; difficulty: '入門' | '基礎'; prerequisites: AlgorithmId[]; learningObjectives: string[]; timeComplexity: string; spaceComplexity: string; codeExamples: Record<Language, CodeExample>; visualizationType: 'cells' | 'stack' | 'queue' | 'bars' | 'graph'; concept: string; useCase: string; note: string; }
function examples(cpp: string, python: string, java: string, keys: Record<string, string>): Record<Language, CodeExample> {
  return Object.fromEntries((['C++','Python','Java'] as const).map((lang,i) => { const code = [cpp,python,java][i]; return [lang, { code, highlights: Object.fromEntries(Object.entries(keys).map(([key,marker]) => [key,code.split('\n').flatMap((line,index)=>line.includes(marker)?[index+1]:[])])) }]; })) as Record<Language, CodeExample>;
}
export const courses: Course[] = [
{ slug:'array', title:'Array', subtitle:'陣列存取與更新', description:'從索引出發，認識資料在記憶體中的排列方式。', category:'資料結構', difficulty:'入門', prerequisites:[], learningObjectives:['使用從 0 開始的索引','區分讀取與更新','辨識索引越界'], timeComplexity:'存取 / 更新 O(1)', spaceComplexity:'儲存 O(n) · 額外 O(1)', visualizationType:'cells', concept:'陣列將元素依序儲存。索引是元素的位置，第一個元素的索引是 0。透過位置可以直接讀取或覆寫元素，無須從頭搜尋。', useCase:'學生成績表、遊戲背包欄位，以及固定長度的感測器資料。', note:'更新只改變指定位置，不會插入新元素或改變長度。', codeExamples:examples(
`#include <iostream>
#include <vector>
int main() {
    std::vector<int> a{8,3,6,2,7,4};
    int index = 2, value = 9;
    std::cout << a.at(index) << "\\n"; // access
    a.at(index) = value; // update
    std::cout << a.at(index) << "\\n";
}`,
`a = [8, 3, 6, 2, 7, 4]
index, value = 2, 9
print(a[index])  # access
a[index] = value  # update
print(a[index])`,
`public class Main {
    public static void main(String[] args) {
        int[] a = {8,3,6,2,7,4};
        int index = 2, value = 9;
        System.out.println(a[index]); // access
        a[index] = value; // update
        System.out.println(a[index]);
    }
}`,{access:'access',update:'update'}) },
{ slug:'stack', title:'Stack', subtitle:'堆疊 · 後進先出', description:'最後放入的元素，最先被取出。', category:'資料結構', difficulty:'入門', prerequisites:['array'], learningObjectives:['理解 LIFO 規則','執行 Push 與 Pop','安全處理空堆疊'], timeComplexity:'Push 攤銷 O(1) / Pop O(1)', spaceComplexity:'儲存 O(n) · 額外 O(1)', visualizationType:'stack', concept:'堆疊只允許從頂端加入或移除元素，就像一疊盤子。Push 將元素放到頂端，Pop 移除目前頂端的元素。', useCase:'編輯器復原、函式呼叫堆疊、括號配對檢查。', note:'空堆疊不能 Pop。動態陣列擴容時單次 Push 可能為 O(n)，平均攤銷為 O(1)。', codeExamples:examples(
`#include <iostream>
#include <vector>
int main() {
    std::vector<int> s{8,3,6};
    s.push_back(9); // insert
    if (s.empty()) std::cout << "empty\\n"; // empty
    else {
        std::cout << s.back() << "\\n";
        s.pop_back(); // remove
    }
}`,
`s = [8, 3, 6]
s.append(9)  # insert
if not s:  # empty
    print("empty")
else:
    print(s.pop())  # remove`,
`import java.util.ArrayDeque;
public class Main {
    public static void main(String[] args) {
        var s = new ArrayDeque<Integer>();
        for (int v : new int[]{8,3,6}) s.addLast(v);
        s.addLast(9); // insert
        if (s.isEmpty()) System.out.println("empty"); // empty
        else System.out.println(s.removeLast()); // remove
    }
}`,{insert:'insert',remove:'remove',empty:'empty'}) },
{ slug:'queue', title:'Queue', subtitle:'佇列 · 先進先出', description:'像排隊一樣，讓最早到達的元素先離開。', category:'資料結構', difficulty:'入門', prerequisites:['array'], learningObjectives:['理解 FIFO 規則','辨認前端與尾端','使用雙端佇列避免搬移'], timeComplexity:'Enqueue / Dequeue O(1)*', spaceComplexity:'儲存 O(n) · 額外 O(1)', visualizationType:'queue', concept:'佇列在尾端加入元素、在前端移除元素。這個先進先出的順序，可以公平地依到達次序處理工作。', useCase:'列印工作排程、訊息處理，以及 BFS 的待訪問節點管理。', note:'*範例採 deque / ArrayDeque，端點操作為 O(1) 或攤銷 O(1)。動畫為保存快照使用陣列，shift 與快照複製為 O(n)，不代表佇列的理想實作成本。', codeExamples:examples(
`#include <iostream>
#include <deque>
int main() {
    std::deque<int> q{8,3,6};
    q.push_back(9); // insert
    if (q.empty()) std::cout << "empty\\n"; // empty
    else {
        std::cout << q.front() << "\\n";
        q.pop_front(); // remove
    }
}`,
`from collections import deque
q = deque([8, 3, 6])
q.append(9)  # insert
if not q:  # empty
    print("empty")
else:
    print(q.popleft())  # remove`,
`import java.util.ArrayDeque;
public class Main {
    public static void main(String[] args) {
        var q = new ArrayDeque<Integer>();
        for (int v : new int[]{8,3,6}) q.addLast(v);
        q.addLast(9); // insert
        if (q.isEmpty()) System.out.println("empty"); // empty
        else System.out.println(q.removeFirst()); // remove
    }
}`,{insert:'insert',remove:'remove',empty:'empty'}) },
{ slug:'binary-search', title:'Binary Search', subtitle:'二分搜尋', description:'每次排除一半可能性，快速找到目標。', category:'搜尋與排序', difficulty:'基礎', prerequisites:['array'], learningObjectives:['確認遞增排序前提','更新左右邊界','處理不存在的目標'], timeComplexity:'最差 O(log n)', spaceComplexity:'額外 O(1)', visualizationType:'cells', concept:'二分搜尋要求資料事先排序。比較中間元素與目標，根據大小關係排除左半或右半，直到找到目標或搜尋區間為空。', useCase:'查詢已排序的編號、尋找門檻值，以及答案具有單調性的最佳化問題。', note:'有重複值時回傳其中一個符合的索引，不保證是第一個。找不到時回傳 -1。', codeExamples:examples(
`#include <iostream>
#include <vector>
int search(const std::vector<int>& a, int target) {
    int lo=0, hi=static_cast<int>(a.size())-1;
    while (lo<=hi) {
        int mid=lo+(hi-lo)/2; // compare
        if (a[mid]==target) return mid; // found
        if (a[mid]<target) lo=mid+1; // narrow
        else hi=mid-1; // narrow
    }
    return -1; // missing
}
int main() { std::cout << search({2,3,4,6,7,8},7) << "\\n"; }`,
`def search(a, target):
    lo, hi = 0, len(a)-1
    while lo <= hi:
        mid = (lo+hi)//2  # compare
        if a[mid] == target:  # found
            return mid
        if a[mid] < target:  # narrow
            lo = mid+1
        else:
            hi = mid-1
    return -1  # missing
print(search([2,3,4,6,7,8], 7))`,
`public class Main {
    static int search(int[] a, int target) {
        int lo=0, hi=a.length-1;
        while (lo<=hi) {
            int mid=lo+(hi-lo)/2; // compare
            if (a[mid]==target) return mid; // found
            if (a[mid]<target) lo=mid+1; // narrow
            else hi=mid-1; // narrow
        }
        return -1; // missing
    }
    public static void main(String[] args) {
        System.out.println(search(new int[]{2,3,4,6,7,8},7));
    }
}`,{compare:'compare',found:'found',narrow:'narrow',missing:'missing'}) },
{ slug:'bubble-sort', title:'Bubble Sort', subtitle:'氣泡排序', description:'比較、交換，讓較大的數值逐步浮到尾端。', category:'搜尋與排序', difficulty:'基礎', prerequisites:['array'], learningObjectives:['觀察相鄰比較與交換','理解每輪的排序範圍','辨識提早結束條件'], timeComplexity:'平均 / 最差 O(n²) · 最佳 O(n)', spaceComplexity:'額外 O(1)', visualizationType:'bars', concept:'從左到右比較相鄰元素，若順序相反就交換。一輪結束後，尚未排序區間的最大值會抵達尾端。若整輪沒有交換，就能提早結束。', useCase:'適合練習比較、交換與迴圈不變量；大量資料通常應採用更有效率的排序方法。', note:'只在左值嚴格大於右值時交換，因此相同數值的相對順序保持不變，是穩定排序。', codeExamples:examples(
`#include <iostream>
#include <vector>
#include <utility>
int main() {
    std::vector<int> a{8,3,6,2,7,4};
    for (int end=static_cast<int>(a.size())-1; end>0; --end) {
        bool changed=false;
        for (int j=0; j<end; ++j) {
            if (a[j]>a[j+1]) { // compare
                std::swap(a[j],a[j+1]); // swap
                changed=true;
            }
        }
        if (!changed) break;
    }
    for (int i=0; i<static_cast<int>(a.size()); ++i)
        std::cout << (i ? " " : "") << a[i];
    std::cout << "\\n";
}`,
`a = [8, 3, 6, 2, 7, 4]
for end in range(len(a)-1, 0, -1):
    changed = False
    for j in range(end):
        if a[j] > a[j+1]:  # compare
            a[j], a[j+1] = a[j+1], a[j]  # swap
            changed = True
    if not changed:
        break
print(*a)`,
`public class Main {
    public static void main(String[] args) {
        int[] a={8,3,6,2,7,4};
        for (int end=a.length-1; end>0; --end) {
            boolean changed=false;
            for (int j=0; j<end; ++j) {
                if (a[j]>a[j+1]) { // compare
                    int t=a[j]; a[j]=a[j+1]; a[j+1]=t; // swap
                    changed=true;
                }
            }
            if (!changed) break;
        }
        for (int i=0; i<a.length; ++i)
            System.out.print((i==0 ? "" : " ")+a[i]);
        System.out.println();
    }
}`,{compare:'compare',swap:'swap'}) },
{ slug:'bfs', title:'BFS', subtitle:'廣度優先搜尋', description:'一層一層探索圖形，走訪所有可到達的節點。', category:'圖論', difficulty:'基礎', prerequisites:['queue'], learningObjectives:['以佇列管理待訪問節點','避免環造成重複走訪','區分已發現與已訪問'], timeComplexity:'O(V + E)', spaceComplexity:'鄰接表 O(V + E) · 額外 O(V)', visualizationType:'graph', concept:'BFS 從起點出發，先處理所有距離為一條邊的節點，再往更外層擴展。節點入隊時就標記已發現，能避免在有環的圖形中反覆入隊。', useCase:'無權重圖的最短路徑、社群關係層級、迷宮探索。', note:'本教材為無向圖，節點編號從 0 開始。只走訪起點所在的連通分量；相鄰節點依輸入邊的順序探索。', codeExamples:examples(
`#include <iostream>
#include <vector>
#include <queue>
int main() {
    std::vector<std::vector<int>> g(6);
    for (auto [u,v] : std::vector<std::pair<int,int>>{{0,1},{0,2},{1,3},{2,3},{3,4}}) {
        g[u].push_back(v); g[v].push_back(u);
    }
    std::queue<int> q; std::vector<bool> seen(6,false);
    q.push(0); seen[0]=true; // enqueue
    bool first=true;
    while (!q.empty()) {
        int u=q.front(); q.pop(); // visit
        std::cout << (first ? "" : " ") << u; first=false;
        for (int v : g[u]) if (!seen[v]) {
            seen[v]=true; q.push(v); // enqueue
        }
    }
    std::cout << "\\n";
}`,
`from collections import deque
g = [[] for _ in range(6)]
for u, v in [(0,1),(0,2),(1,3),(2,3),(3,4)]:
    g[u].append(v)
    g[v].append(u)
q, seen, order = deque([0]), {0}, []  # enqueue
while q:
    u = q.popleft()  # visit
    order.append(u)
    for v in g[u]:
        if v not in seen:
            seen.add(v)  # enqueue
            q.append(v)
print(*order)`,
`import java.util.*;
public class Main {
    public static void main(String[] args) {
        var g=new ArrayList<List<Integer>>();
        for (int i=0; i<6; ++i) g.add(new ArrayList<>());
        for (int[] e : new int[][]{{0,1},{0,2},{1,3},{2,3},{3,4}}) {
            g.get(e[0]).add(e[1]); g.get(e[1]).add(e[0]);
        }
        var q=new ArrayDeque<Integer>(); boolean[] seen=new boolean[6];
        q.add(0); seen[0]=true; // enqueue
        var order=new ArrayList<String>();
        while (!q.isEmpty()) {
            int u=q.remove(); // visit
            order.add(String.valueOf(u));
            for (int v : g.get(u)) if (!seen[v]) {
                seen[v]=true; q.add(v); // enqueue
            }
        }
        System.out.println(String.join(" ",order));
    }
}`,{enqueue:'enqueue',visit:'visit'}) }
];
export const getCourse = (slug: string) => courses.find(c=>c.slug===slug);
