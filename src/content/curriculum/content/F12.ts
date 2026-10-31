import type { LessonContent } from '../schema';

const code = String.raw;

/** F12 二維陣列. Every example and the reference solutions run in tests/curriculum-code.test.ts. */
export const F12: LessonContent = {
  lessonId: 'F12',
  motivation: '座位表、成績表、棋盤、地圖、影像的像素，都是「列 × 行」的表格。二維陣列加上「檢查上下左右鄰居」的技巧，是 APCS 實作題中模擬與地圖類題目最常用的工具。',
  sections: [
    {
      id: 'rows-and-columns', title: '列與行',
      blocks: [
        { type: 'p', text: '二維陣列可以想成「陣列的陣列」：`g[r]` 是第 r 列（一個一維陣列），`g[r][c]` 是第 r 列第 c 行的格子。R 列 C 行的表格，列索引是 0～R − 1，行索引是 0～C − 1。習慣上第一個索引是列（上下），第二個是行（左右）。' },
        { type: 'table', head: ['', 'C++', 'Python', 'Java'], rows: [
          ['R × C，全部為 0', '`std::vector<std::vector<int>> g(R, std::vector<int>(C));`', '`g = [[0] * C for _ in range(R)]`', '`int[][] g = new int[R][C];`'],
          ['列數、行數', '`g.size()`、`g[0].size()`', '`len(g)`、`len(g[0])`', '`g.length`、`g[0].length`'],
        ] },
        { type: 'callout', tone: 'warning', title: 'Python 的 [[0] * C] * R 是陷阱', text: '`[[0] * C] * R` 會讓 R 個列都指向「同一個」list，改 `g[0][0]` 時每一列的第 0 格都跟著變。一定要用 `[[0] * C for _ in range(R)]`，讓每一列各自建立。' },
      ],
    },
    {
      id: 'traverse-2d', title: '走訪：列優先與行優先',
      blocks: [
        { type: 'p', text: '用兩層迴圈走訪：外層列、內層行，是「列優先」，也是讀入表格的順序（輸入一行一行給）。把兩層對調就是「行優先」，用來計算每一行（直的）的總和。' },
        { type: 'example', id: 'sums' },
        { type: 'p', text: '轉置（transpose）把列與行互換：原本 R × C 的表格變成 C × R，新表格的 `t[c][r] = g[r][c]`。寫錯索引的順序是二維陣列最常見的錯誤，畫一張小表格對照最有效。' },
        { type: 'example', id: 'transpose' },
      ],
    },
    {
      id: 'neighbours', title: '鄰居與方向陣列',
      blocks: [
        { type: 'p', text: '地圖題常常要看一格的上、下、左、右鄰居。與其寫四段幾乎相同的程式，不如把四個方向的位移放進方向陣列 `dr = {-1, 1, 0, 0}`、`dc = {0, 0, -1, 1}`，用一個迴圈處理。' },
        { type: 'p', text: '每一個鄰居在使用前都要檢查是否在表格內：`0 <= nr && nr < R && 0 <= nc && nc < C`。角落的格子只有 2 個鄰居、邊上的有 3 個；不檢查就會越界。下方的視覺化逐一檢查左上角 (0, 0) 的四個方向。' },
        { type: 'example', id: 'neighbours-sum' },
        { type: 'callout', tone: 'tip', title: '八個方向', text: '包含斜角時，方向陣列有 8 組：`dr = {-1,-1,-1,0,0,1,1,1}`、`dc = {-1,0,1,-1,1,-1,0,1}`，或用兩層迴圈 `dr, dc ∈ {-1, 0, 1}` 並跳過 (0, 0)。' },
      ],
    },
  ],
  examples: [
    {
      id: 'sums', title: '每列與每行的總和', description: '讀入 R × C 的表格，第一行輸出每列的和，第二行輸出每行的和。',
      stdin: '2 3\n1 2 3\n4 5 6', output: '6 15\n5 7 9',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int R, C;
    std::cin >> R >> C;
    std::vector<std::vector<int>> g(R, std::vector<int>(C));
    for (auto& row : g)
        for (auto& x : row) std::cin >> x;
    for (int r = 0; r < R; ++r) {          // 列優先
        int s = 0;
        for (int c = 0; c < C; ++c) s += g[r][c];
        std::cout << s << (r + 1 < R ? " " : "\n");
    }
    for (int c = 0; c < C; ++c) {          // 行優先：外層換成行
        int s = 0;
        for (int r = 0; r < R; ++r) s += g[r][c];
        std::cout << s << (c + 1 < C ? " " : "\n");
    }
    return 0;
}`,
        Python: code`R, C = map(int, input().split())
g = [list(map(int, input().split())) for _ in range(R)]
print(*[sum(row) for row in g])
print(*[sum(g[r][c] for r in range(R)) for c in range(C)])`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int R = sc.nextInt(), C = sc.nextInt();
        int[][] g = new int[R][C];
        for (int r = 0; r < R; ++r)
            for (int c = 0; c < C; ++c) g[r][c] = sc.nextInt();
        StringBuilder rows = new StringBuilder(), cols = new StringBuilder();
        for (int r = 0; r < R; ++r) {
            int s = 0;
            for (int c = 0; c < C; ++c) s += g[r][c];
            rows.append(r > 0 ? " " : "").append(s);
        }
        for (int c = 0; c < C; ++c) {
            int s = 0;
            for (int r = 0; r < R; ++r) s += g[r][c];
            cols.append(c > 0 ? " " : "").append(s);
        }
        System.out.println(rows);
        System.out.println(cols);
    }
}`,
      },
    },
    {
      id: 'transpose', title: '轉置', description: '2 × 3 的表格轉置成 3 × 2：新表格第 c 列是原表格的第 c 行。',
      stdin: '2 3\n1 2 3\n4 5 6', output: '1 4\n2 5\n3 6',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int R, C;
    std::cin >> R >> C;
    std::vector<std::vector<int>> g(R, std::vector<int>(C));
    for (auto& row : g)
        for (auto& x : row) std::cin >> x;
    for (int c = 0; c < C; ++c) {
        for (int r = 0; r < R; ++r) {
            std::cout << g[r][c] << (r + 1 < R ? " " : "\n");
        }
    }
    return 0;
}`,
        Python: code`R, C = map(int, input().split())
g = [list(map(int, input().split())) for _ in range(R)]
for c in range(C):
    print(*[g[r][c] for r in range(R)])`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int R = sc.nextInt(), C = sc.nextInt();
        int[][] g = new int[R][C];
        for (int r = 0; r < R; ++r)
            for (int c = 0; c < C; ++c) g[r][c] = sc.nextInt();
        for (int c = 0; c < C; ++c) {
            StringBuilder line = new StringBuilder();
            for (int r = 0; r < R; ++r) line.append(r > 0 ? " " : "").append(g[r][c]);
            System.out.println(line);
        }
    }
}`,
      },
    },
    {
      id: 'neighbours-sum', title: '上下左右鄰居的和', description: '讀入表格與一個位置 (r, c)，輸出它四個方向、在表格內的鄰居總和。左上角 (0, 0) 只有右邊與下面兩個鄰居。',
      stdin: '3 3\n1 2 3\n4 5 6\n7 8 9\n0 0', output: '6',
      code: {
        'C++': code`#include <iostream>
#include <vector>

int main() {
    int R, C;
    std::cin >> R >> C;
    std::vector<std::vector<int>> g(R, std::vector<int>(C));
    for (auto& row : g)
        for (auto& x : row) std::cin >> x;
    int r, c;
    std::cin >> r >> c;
    const int dr[] = {-1, 1, 0, 0}, dc[] = {0, 0, -1, 1};
    int total = 0;
    for (int d = 0; d < 4; ++d) {
        int nr = r + dr[d], nc = c + dc[d];
        if (0 <= nr && nr < R && 0 <= nc && nc < C) total += g[nr][nc];
    }
    std::cout << total << "\n";
    return 0;
}`,
        Python: code`R, C = map(int, input().split())
g = [list(map(int, input().split())) for _ in range(R)]
r, c = map(int, input().split())
total = 0
for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    nr, nc = r + dr, c + dc
    if 0 <= nr < R and 0 <= nc < C:
        total += g[nr][nc]
print(total)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int R = sc.nextInt(), C = sc.nextInt();
        int[][] g = new int[R][C];
        for (int i = 0; i < R; ++i)
            for (int j = 0; j < C; ++j) g[i][j] = sc.nextInt();
        int r = sc.nextInt(), c = sc.nextInt();
        int[] dr = {-1, 1, 0, 0}, dc = {0, 0, -1, 1};
        int total = 0;
        for (int d = 0; d < 4; ++d) {
            int nr = r + dr[d], nc = c + dc[d];
            if (0 <= nr && nr < R && 0 <= nc && nc < C) total += g[nr][nc];
        }
        System.out.println(total);
    }
}`,
      },
    },
  ],
  visualization: {
    kind: 'array-index', title: '左上角 (0, 0) 的四個鄰居', language: 'Python',
    code: code`g = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
r, c, total = 0, 0, 0
for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    nr, nc = r + dr, c + dc
    if 0 <= nr < 3 and 0 <= nc < 3:
        total += g[nr][nc]
print(total)`,
    steps: [
      { line: 1, note: '3 列 × 3 行的表格。g[r][c]：第一個索引是列，第二個是行。', arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']] }] },
      { line: 2, note: '要看的是左上角 (0, 0)，它本身標為讀取。', vars: { r: '0', c: '0', total: '0' }, arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], marks: [{ at: [0, 0], kind: 'read' }] }] },
      { line: 5, note: '上：(−1, 0) 在表格外（列索引 −1），條件不成立，跳過。不檢查就會越界（Python 的 −1 甚至會悄悄讀到最後一列）。', vars: { r: '0', c: '0', total: '0', nr: '-1', nc: '0' }, arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], marks: [{ at: [-1, 0], kind: 'bad' }] }] },
      { line: 6, note: '下：(1, 0) 在表格內，加上 g[1][0] = 4。', vars: { r: '0', c: '0', total: '4', nr: '1', nc: '0' }, arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], marks: [{ at: [1, 0], kind: 'read' }] }] },
      { line: 5, note: '左：(0, −1) 在表格外，跳過。', vars: { r: '0', c: '0', total: '4', nr: '0', nc: '-1' }, arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], marks: [{ at: [0, -1], kind: 'bad' }] }] },
      { line: 6, note: '右：(0, 1) 在表格內，加上 g[0][1] = 2。', vars: { r: '0', c: '0', total: '6', nr: '0', nc: '1' }, arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']], marks: [{ at: [0, 1], kind: 'read' }] }] },
      { line: 7, note: '角落只有 2 個鄰居，總和 4 + 2 = 6。', vars: { total: '6' }, output: '6', arrays: [{ name: 'g', cells: [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']] }] },
    ],
  },
  quiz: [
    {
      id: 'q1', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'g = [[1, 2, 3],\n     [4, 5, 6]]\nprint(g[1][0] + g[0][2])' },
      options: ['5', '7', '8', 'IndexError'],
      answer: 1, explanation: 'g[1][0] 是第 1 列（第二列）第 0 行的 4；g[0][2] 是第 0 列第 2 行的 3；相加為 7。',
    },
    {
      id: 'q2', prompt: '下面的 Python 程式輸出什麼？',
      code: { language: 'Python', text: 'g = [[0] * 3] * 2\ng[0][0] = 5\nprint(g[1][0])' },
      options: ['0', '5', 'IndexError', '[5, 0, 0]'],
      answer: 1, explanation: '`[[0] * 3] * 2` 讓兩列都是「同一個」list，改 g[0][0] 等於改 g[1][0]，所以印出 5。正確寫法是 `[[0] * 3 for _ in range(2)]`。',
    },
    {
      id: 'q3', prompt: '下面的 Java 程式輸出什麼？',
      code: { language: 'Java', text: 'int[][] g = new int[3][4];\nSystem.out.println(g.length + " " + g[0].length);' },
      options: ['3 4', '4 3', '12', '3 3'],
      answer: 0, explanation: '`new int[3][4]` 是 3 列、每列 4 個元素。`g.length` 是列數 3，`g[0].length` 是第 0 列的長度 4。',
    },
    {
      id: 'q4', prompt: 'R 列 C 行的表格，下列哪一個條件正確判斷 (nr, nc) 在表格內？',
      options: ['0 <= nr && nr <= R && 0 <= nc && nc <= C', '0 <= nr && nr < R && 0 <= nc && nc < C', 'nr < R || nc < C', '0 < nr && nr < R && 0 < nc && nc < C'],
      answer: 1, explanation: '合法的列索引是 0～R − 1、行索引是 0～C − 1，所以是 `< R`、`< C`，而且四個條件要同時成立。A 允許 nr = R（越界）；C 用 || 並少了下界；D 排除了第 0 列與第 0 行。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '踩地雷提示數字',
      statement: '踩地雷的地圖以 `*` 表示地雷、`.` 表示空地。請把每塊空地換成它周圍 8 格（上下左右與四個斜角）中地雷的個數，地雷維持 `*`。',
      inputFormat: '第一行 R、C；接著 R 行，每行 C 個字元（`*` 或 `.`）。',
      outputFormat: 'R 行，每行 C 個字元：地雷為 `*`，空地為 0～8 的數字。',
      constraints: ['1 ≤ R, C ≤ 100'],
      samples: [{ kind: 'normal', input: '3 4\n*...\n....\n.*..', output: '*100\n2210\n1*10', note: '(1, 0) 周圍有 (0, 0) 與 (2, 1) 兩顆地雷' }],
      tests: [
        { kind: 'normal', input: '3 4\n*...\n....\n.*..', output: '*100\n2210\n1*10', note: '一般情況' },
        { kind: 'normal', input: '3 3\n...\n.*.\n...', output: '111\n1*1\n111', note: '中央一顆地雷影響周圍 8 格' },
        { kind: 'edge', input: '1 1\n.', output: '0', note: '最小的地圖' },
        { kind: 'edge', input: '1 1\n*', output: '*', note: '只有地雷' },
        { kind: 'edge', input: '1 5\n.*.*.', output: '1*2*1', note: '只有一列：上下的鄰居都在地圖外' },
        { kind: 'edge', input: '2 2\n**\n**', output: '**\n**', note: '全是地雷' },
      ],
      errorPolicy: '題目保證地圖只含 `*` 與 `.`，大小在範圍內；越界的鄰居由邊界檢查處理。',
      hints: ['用 8 個方向的位移，或 dr、dc 各在 −1～1 之間並跳過 (0, 0)。', '每個鄰居先檢查是否在地圖內再讀取。', '數字可以用 `\'0\' + count` 轉成字元。'],
      solution: {
        'C++': code`#include <iostream>
#include <string>
#include <vector>

int main() {
    int R, C;
    std::cin >> R >> C;
    std::vector<std::string> g(R);
    for (auto& row : g) std::cin >> row;
    for (int r = 0; r < R; ++r) {
        std::string line;
        for (int c = 0; c < C; ++c) {
            if (g[r][c] == '*') { line += '*'; continue; }
            int count = 0;
            for (int dr = -1; dr <= 1; ++dr)
                for (int dc = -1; dc <= 1; ++dc) {
                    int nr = r + dr, nc = c + dc;
                    if ((dr != 0 || dc != 0) && 0 <= nr && nr < R && 0 <= nc && nc < C && g[nr][nc] == '*') count++;
                }
            line += static_cast<char>('0' + count);
        }
        std::cout << line << "\n";
    }
    return 0;
}`,
        Python: code`R, C = map(int, input().split())
g = [input().strip() for _ in range(R)]
for r in range(R):
    line = ""
    for c in range(C):
        if g[r][c] == "*":
            line += "*"
            continue
        count = 0
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nr, nc = r + dr, c + dc
                if (dr, dc) != (0, 0) and 0 <= nr < R and 0 <= nc < C and g[nr][nc] == "*":
                    count += 1
        line += str(count)
    print(line)`,
        Java: code`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int R = sc.nextInt(), C = sc.nextInt();
        String[] g = new String[R];
        for (int r = 0; r < R; ++r) g[r] = sc.next();
        for (int r = 0; r < R; ++r) {
            StringBuilder line = new StringBuilder();
            for (int c = 0; c < C; ++c) {
                if (g[r].charAt(c) == '*') { line.append('*'); continue; }
                int count = 0;
                for (int dr = -1; dr <= 1; ++dr)
                    for (int dc = -1; dc <= 1; ++dc) {
                        int nr = r + dr, nc = c + dc;
                        if ((dr != 0 || dc != 0) && 0 <= nr && nr < R && 0 <= nc && nc < C && g[nr].charAt(nc) == '*') count++;
                    }
                line.append(count);
            }
            System.out.println(line);
        }
    }
}`,
      },
      judge: 'none',
    },
  ],
};
