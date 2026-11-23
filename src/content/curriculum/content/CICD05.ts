import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import type { LessonContent } from '../schema';

/*
 * CICD05 管線中的自動化測試 (the blueprint's pipeline-sim, terminal-sim on the actions profile: engine stages E25 git, E26
 * forge, E27 workflows and E28 actions). A made-up ferry ticket team on the simulated github.example: Wen Lee (the learner,
 * gh login wen-lee, write access) and Omar Haddad. ferrylane/tickets main holds working code, an old one-job CI (e2e,
 * then integration, then unit, then a report step with if: always()) and a nightly cross-browser e2e matrix (chromium,
 * firefox, webkit; fail-fast left at its default). The learner's clone ~/tickets has an unpushed branch child-fares whose
 * commit drops Math.round from the child fare, so one unit test fails. CI tools (lesson-declared results): npm ci, the
 * unit tests (pass only when src/fare.js rounds; write a JUnit-style reports/unit.xml), the integration tests (45 s), the
 * e2e suite (3 min), three e2e shards (1 min each) and one tool per browser; firefox is flaky (in the simulation it fails
 * on a run's first attempt and passes on a rerun). Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const TICKETS = 'https://github.example/ferrylane/tickets.git';
const WEN = { name: 'Wen Lee', email: 'wen@example.com' }, OMAR = { name: 'Omar Haddad', email: 'omar@example.com' };
const CI = '.github/workflows/ci.yml', NIGHTLY_PATH = '.github/workflows/nightly.yml';

const yml = (...lines: string[]) => [...lines, ''].join('\n');
const HEAD = ['name: CI', 'on: push', 'permissions:', '  contents: read', 'jobs:'];
/** One job of the staged pipeline: a fresh runner, checkout, npm ci and one test command. */
const job = (id: string, cmd: string, needs?: string, matrix?: string) => [`  ${id}:`, ...needs ? [`    needs: ${needs}`] : [], '    runs-on: ubuntu-latest',
  ...matrix ? ['    strategy:', '      matrix:', `        ${matrix}`] : [], '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', `      - run: ${cmd}`];

const OLD_CI = yml(...HEAD, '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm run test:e2e',
  '      - run: npm run test:integration', '      - run: npm run test:unit', '      - name: Test report', '        if: always()',
  '        run: grep -h "<testsuites" reports/*.xml | tee -a "$GITHUB_STEP_SUMMARY"');
const NIGHTLY_HEAD = ['name: Nightly', 'on:', '  schedule:', '    - cron: "0 18 * * *"', '  workflow_dispatch:', 'permissions:', '  contents: read', 'jobs:'];
const NIGHTLY = yml(...NIGHTLY_HEAD, ...job('e2e', 'npm run test:e2e -- --project=${{ matrix.browser }}', undefined, 'browser: [chromium, firefox, webkit]'));

// The pieces the learner writes (a terminal line is at most 500 characters, so one printf per job).
const HEAD_UNIT = yml(...HEAD, ...job('unit', 'npm run test:unit'));
const INTEGRATION = yml(...job('integration', 'npm run test:integration', 'unit'));
const E2E = yml(...job('e2e', 'npm run test:e2e', 'integration'));
const E2E_SHARDS = yml(...job('e2e', 'npm run test:e2e -- --shard=${{ matrix.shard }}/3', 'integration', 'shard: [1, 2, 3]'));
const esc = (t: string) => t.replace(/\n/g, '\\n');
/** printf commands writing a file in pieces: the first with >, the others appended with >>. */
const write = (path: string, ...pieces: string[]) => pieces.map((t, i) => `printf '${esc(t)}' ${i ? '>>' : '>'} ${path}`);

const FARE_OK = 'export const adultFare = (route) => route.price;\nexport const childFare = (adult) => Math.round(adult / 2);\n';
const FARE_WEEKEND = 'export const adultFare = (route) => route.price;\nexport const childFare = (adult, weekend) => (weekend ? adult * 0.4 : adult / 2);\n';
const COMMITS: TerminalGitCommit[] = [
  { id: 't1', message: 'Initial commit', author: OMAR, time: '2026-11-16 02:00:00', files: {
    'README.md': '# tickets\n\nFerry ticket booking for Ferrylane.\n', 'package.json': '{ "name": "tickets", "version": "1.4.0" }\n', 'package-lock.json': '{}\n',
    '.gitignore': 'node_modules/\nreports/\n', 'src/fare.js': FARE_OK, 'test/unit/fare.test.js': "test('rounds child fares to whole dollars')\n",
    'test/integration/booking.test.js': "test('books a seat on the 08:30 ferry')\n", 'e2e/checkout.spec.js': "test('pays for a child ticket with a saved card')\n",
  } },
  { id: 't2', message: 'Run the tests on every push', author: OMAR, time: '2026-11-18 03:00:00', files: { [CI]: OLD_CI } },
  { id: 't3', message: 'Add nightly cross-browser e2e', author: OMAR, time: '2026-11-20 03:00:00', files: { [NIGHTLY_PATH]: NIGHTLY } },
  // The learner's branch: a weekend discount that forgets to round, so one unit test fails.
  { id: 'f1', parents: ['t3'], message: 'Add a weekend child discount', author: WEN, time: '2026-11-23 01:30:00', files: { 'src/fare.js': FARE_WEEKEND } },
];

/** A JUnit-style XML report: one testsuite per test file group. */
const xml = (name: string, tests: number, failures: number, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="${name}" tests="${tests}" failures="${failures}">\n${body}</testsuites>\n`;
const suite = (name: string, tests: number) => `  <testsuite name="${name}" tests="${tests}" failures="0"/>\n`;
const FARE_FAILED = '  <testsuite name="fare" tests="6" failures="1">\n    <testcase classname="fare" name="rounds child fares to whole dollars">\n'
  + '      <failure message="Expected: 13, Received: 12.5"/>\n    </testcase>\n  </testsuite>\n';
const shard = (n: number): TerminalCiTool => ({ command: `npm run test:e2e -- --shard=${n}/3`, cases: [{ stdout: `Running 4 tests using 1 worker, shard ${n} of 3\n\n  4 passed (58s)`, seconds: 60 }] });
const browser = (name: string, seconds: number, took: string): TerminalCiTool => ({ command: `npm run test:e2e -- --project=${name}`, cases: [{ stdout: `Running 12 tests using 1 worker\n\n  12 passed (${took})`, seconds }] });
const TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cases: [
    { when: [{ path: 'package-lock.json' }], stdout: 'added 312 packages in 8s', seconds: 8 },
    { stderr: 'npm ERR! The `npm ci` command can only install with an existing package-lock.json', exit: 1 },
  ] },
  { command: 'npm run test:unit', cases: [
    { when: [{ path: 'src/fare.js', includes: 'Math.round' }], stdout: 'PASS test/unit/dates.test.js\nPASS test/unit/fare.test.js\nPASS test/unit/seats.test.js\n\nTests:       48 passed, 48 total\nTime:        5.2 s',
      seconds: 6, writes: [{ path: 'reports/unit.xml', content: xml('unit', 48, 0, suite('dates', 18) + suite('fare', 6) + suite('seats', 24)) }] },
    { stdout: 'PASS test/unit/dates.test.js\nFAIL test/unit/fare.test.js\n  ● fare › rounds child fares to whole dollars\n\n    Expected: 13\n    Received: 12.5\n\nPASS test/unit/seats.test.js\n\nTests:       1 failed, 47 passed, 48 total\nTime:        5.4 s',
      exit: 1, seconds: 6, writes: [{ path: 'reports/unit.xml', content: xml('unit', 48, 1, suite('dates', 18) + FARE_FAILED + suite('seats', 24)) }] },
  ] },
  { command: 'npm run test:integration', cases: [{ stdout: 'PASS test/integration/booking.test.js\nPASS test/integration/payments.test.js\n\nTests:       14 passed, 14 total\nTime:        43.8 s', seconds: 45,
    writes: [{ path: 'reports/integration.xml', content: xml('integration', 14, 0, suite('booking', 9) + suite('payments', 5)) }] }] },
  { command: 'npm run test:e2e', cases: [{ stdout: 'Running 12 tests using 1 worker\n\n  12 passed (2.9m)', seconds: 180, writes: [{ path: 'reports/e2e.xml', content: xml('e2e', 12, 0, suite('checkout', 5) + suite('search', 7)) }] }] },
  shard(1), shard(2), shard(3),
  browser('chromium', 200, '3.3m'),
  { ...browser('firefox', 190, '3.2m'), flaky: { failOnAttempts: [1], exit: 1, seconds: 186,
    stdout: 'Running 12 tests using 1 worker\n\n  ✘ checkout.spec.js › pays for a child ticket with a saved card (5.0s)\n    Error: Timed out 5000ms waiting for the payment form\n\n  1 failed\n  11 passed (3.1m)' } },
  browser('webkit', 240, '4.0m'),
];

const lab: TerminalMachine = {
  id: 'cicd05-lab', title: 'wen-laptop（渡輪訂票團隊的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'wen-laptop', profile: 'actions',
  timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: WEN, commits: COMMITS, remotes: [{ url: TICKETS, branches: { main: 't3' } }],
    repos: [{ path: '/home/learner/tickets', origin: TICKETS, branches: { main: 't3', 'child-fares': 'f1' }, head: 'main', tracking: { main: 't3' }, upstream: ['main'] }],
  },
  forge: { login: 'wen-lee', repos: [{ url: TICKETS, description: 'Ferry ticket booking for Ferrylane', permission: 'write' }] },
  actions: { tools: TOOLS },
};

const LATEST = (file: string) => `$(gh run list -w ${file} -L 1 --json databaseId | grep databaseId | tr -dc 0-9)`;
const WATCH_CI = `gh run watch ${LATEST('ci.yml')}`;
const STAGES = write(CI, HEAD_UNIT, INTEGRATION, E2E);
const SHARDED = write(CI, HEAD_UNIT, INTEGRATION, E2E_SHARDS);
const ON_BRANCH = ['cd tickets', 'git switch child-fares'];
const BRANCH_PUSH = ["git commit -qam 'Run the fast tests first'", 'git push -q -u origin child-fares'];
const MAIN_PUSH = ["git commit -qam 'Shard the e2e tests'", 'git push -q'];
const NIGHTLY_RUN = ['cd tickets', 'gh workflow run nightly.yml', 'sleep 300'];

export const CICD05: LessonContent = {
  lessonId: 'CICD05',
  motivation: '「我只改了一行票價的計算，CI 卻跑了四分鐘才告訴我單元測試壞了，而那個測試在我的筆電上只要六秒。」「Nightly 又紅了，可是重跑一次就綠了，大家都習慣按重新執行。」「e2e 太慢，要不要乾脆只在發布前跑？」CICD03 說 CI 的價值在快速回饋，CICD04 讓你寫得出 workflow；這一課處理放進管線之後的測試：哪些測試該多、哪些該少（測試金字塔），在管線裡怎麼排順序讓快的先失敗，怎麼讓失敗時也看得到測試報告，怎麼用 matrix 平行執行把慢的測試切開，以及遇到不穩定測試時，怎麼確認、隔離與修正，而不是一直重新執行。全部在模擬的 GitHub Actions 上真的推送、真的執行，從 run 的時間與日誌看結果。',
  sections: [
    {
      id: 'cicd05-s-setup', title: '本課的團隊、儲存庫與測試指令',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的渡輪公司 Ferrylane 的訂票網站，程式放在模擬的 GitHub 主機 `github.example` 上的 ferrylane/tickets。你是 Wen Lee（gh 帳號 wen-lee，有寫入權限），筆電 wen-laptop 的家目錄有一份複本 tickets。main 上有兩個 workflow：同事 Omar 寫的 CI（`ci.yml`，每次推送都跑）與 Nightly（`nightly.yml`，每天排程或手動觸發，在三種瀏覽器上跑端對端測試）。你今天早上在本機分支 child-fares 上寫了「週末兒童票打折」，還沒推送。' },
        { type: 'p', text: '專案用 npm 的指令跑三種測試。它們在你的筆電上和 runner 上都能執行，結果由程式碼決定：程式有錯，測試就失敗，修好就通過；每個指令也會把結果寫成 reports 資料夾裡的 XML 報告（reports/ 列在 .gitignore 裡，不會被提交）。' },
        { type: 'table', head: ['指令', '做什麼', '在本課大約花多久'], rows: [
          ['`npm ci`', '依 package-lock.json 安裝相依套件（CI 用 `npm ci`，不用 `npm install`，以確保每次裝的版本相同）', '8 秒'],
          ['`npm run test:unit`', '單元測試：48 個，測票價、日期、座位等單一函式', '6 秒'],
          ['`npm run test:integration`', '整合測試：14 個，測訂位 API 與付款模組接在一起時是否正確', '45 秒'],
          ['`npm run test:e2e`', '端對端測試：12 個，開瀏覽器從搜尋航班一路操作到付款', '3 分鐘'],
          ['`npm run test:e2e -- --shard=2/3`', '只跑端對端測試的第 2 份（共 3 份）；`--` 之後的參數交給測試工具', '1 分鐘'],
          ['`npm run test:e2e -- --project=firefox`', '在指定的瀏覽器（chromium、firefox、webkit）上跑全部端對端測試', '3 到 4 分鐘'],
        ] },
        { type: 'p', text: '和 CICD04 一樣，觀察 run 的指令是 `gh run list`（最近的 run 與經過時間 ELAPSED）、`gh run watch 編號`（等 run 結束並印出每個 job 與 step 的結果）、`gh run view 編號`（摘要；加 `--log` 看全部日誌、`--log-failed` 只看失敗的 step）、`gh workflow run 檔名`（手動觸發有 `workflow_dispatch` 的 workflow）與 `gh run rerun 編號`（重新執行）。run 的編號可以從 `gh run list` 讀出；參考解答裡的 `$(gh run list -w ci.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)` 只是自動取出最新一個 run 的編號，你自己做時直接打 `gh run list` 看到的數字即可。' },
        { type: 'p', text: '終端機沒有編輯器，workflow 檔案用 `printf` 寫：`\\n` 代表換行，`>` 覆寫檔案、`>>` 接在檔案最後。終端機一行最多 500 個字元，一個有三個 job 的 workflow 寫不進一行，所以本課一個 job 用一個 `printf`：第一個用 `>` 寫入檔頭與第一個 job，之後的用 `>>` 接上去，寫完用 `cat` 確認縮排。YAML 用空白縮排，job 在 `jobs:` 下縮 2 格，job 的鍵縮 4 格，step 縮 6 格。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'workflow 真的會在推送或觸發時執行，`run:` 的指令真的在模擬的 runner 上跑；但 npm 的測試是課程宣告的結果，不是真的 Node.js 與瀏覽器。時間由模擬的時鐘決定，`sleep` 與 `gh run watch` 會讓時鐘前進。真實的不穩定測試是隨機失敗的；為了能重複練習，本課的 firefox 測試固定在每個 run 的第一次執行（attempt 1）失敗、重新執行時通過。github.example、團隊、檔案與網址都是虛構的。' },
      ],
    },
    {
      id: 'cicd05-s-pyramid', title: '測試金字塔：單元、整合與端對端測試',
      blocks: [
        { type: 'p', text: '自動化測試依「一次測多大的範圍」大致分成三層。單元測試（unit test）只測一個函式或類別，不碰資料庫、網路與瀏覽器，所以快到可以一次跑幾百、幾千個，失敗時也直接指出是哪個函式的哪個情況錯了。整合測試（integration test）把幾個元件接起來測，例如訂位 API 真的寫進資料庫、付款模組真的呼叫（測試用的）付款服務，能抓到「各自都對、接起來不對」的錯，但需要準備資料庫等環境，比較慢。端對端測試（end-to-end，e2e）像使用者一樣，開瀏覽器從首頁操作到付款完成，最接近真實，也最慢、最容易受網路與時間影響，失敗時往往要花時間找原因。' },
        { type: 'table', head: ['', '單元測試', '整合測試', '端對端測試'], rows: [
          ['測的範圍', '一個函式：`childFare(25)` 應該是 13', '訂位 API 加上資料庫：訂了之後座位數要少一', '整個網站：搜尋航班、選座位、付款、拿到電子票'],
          ['tickets 專案', '48 個，6 秒', '14 個，45 秒', '12 個，約 3 分鐘'],
          ['失敗時告訴你', '哪個函式、哪個輸入、期望與實際的值', '哪兩個元件之間的約定被破壞', '使用者在哪一步卡住，原因要再追'],
          ['常見的問題', '只測得到單一元件，接起來的錯抓不到', '要準備資料庫等環境，比較慢', '慢、脆弱，容易因為等待時間或環境而不穩定'],
        ] },
        { type: 'p', text: '測試金字塔（test pyramid，常歸功於 Mike Cohn）說的是數量的比例：底層放大量又快又穩定的單元測試，中間是較少的整合測試，最上面只留少數最重要的端對端流程。理由是回饋時間與維護成本：同一個票價的錯，單元測試幾秒就指出來，端對端測試要幾分鐘，而且只會說「付款頁的金額不對」。反過來的形狀，大部分靠端對端測試、單元測試很少，常被稱為冰淇淋甜筒（ice-cream cone）：每次推送都要等很久，又常常莫名其妙失敗，大家就開始不看 CI 的結果。' },
        { type: 'p', text: '金字塔是比例的原則，不是規定每層要幾個。端對端測試仍然必要，它是唯一確認「整個系統對使用者真的可用」的測試；重點是把每個情況放在能測到它的最低一層。票價怎麼四捨五入，用單元測試把各種金額都測過；付款流程走不走得通，用一兩個端對端測試確認就好，不必在瀏覽器裡把每種票價都點一次。下面的例子在你的筆電上依序跑三層測試，用 `date` 看每一層花了多少時間，最後 `ls reports` 看三份報告。' },
        { type: 'example', id: 'cicd05-pyramid' },
        { type: 'p', text: '注意數量與時間剛好相反：48 個單元測試 6 秒，12 個端對端測試卻要 3 分鐘，平均一個端對端測試比一個單元測試慢一百多倍。這就是為什麼在管線裡，誰先跑、誰後跑，會大大影響你多快知道自己錯了。' },
      ],
    },
    {
      id: 'cicd05-s-order', title: '在管線中排順序：讓快的測試先失敗',
      blocks: [
        { type: 'p', text: '目前的 CI 只有一個 job，step 的順序是 e2e、integration、unit，最後一個 step 印出報告。一個 job 裡的 step 依序執行，前一個失敗，後面的就不執行（除非寫了 `if: always()` 之類的條件）。所以單元測試的錯要等端對端與整合測試都跑完才會被發現；如果是端對端測試先失敗，後面的單元測試根本不會執行，你只知道第一個錯。下面的例子把 child-fares 推送上去，看舊的管線多久才告訴你：在你的筆電上 6 秒就能發現的錯。' },
        { type: 'example', id: 'cicd05-slow' },
        { type: 'p', text: '4 分鐘後才知道結果，而失敗的是排在最後的單元測試。改法是依金字塔分成三個 job，用 `needs` 串起來：`unit` 沒有 needs，run 一開始就執行；`integration` 寫 `needs: unit`，等 unit 成功才開始；`e2e` 寫 `needs: integration`。被依賴的 job 失敗時，依賴它的 job 不會執行，結論是 skipped（略過），run 的結論是 failure。每個 job 在一台新的 runner 上執行，檔案不會從上一個 job 帶過來，所以每個 job 都要自己 `actions/checkout` 與 `npm ci`。' },
        { type: 'table', head: ['管線的形狀', '單元測試壞掉時多久知道', '全部通過時 run 要多久', 'runner 總共花的時間'], rows: [
          ['一個 job：e2e → integration → unit（目前）', '約 4 分鐘', '約 4 分鐘（4m3s）', '約 4 分鐘'],
          ['三個 job，沒有 needs（同時開始）', '約 20 秒', '約 3 分 10 秒（3m12s）', '約 4 分 20 秒；壞掉時整合與端對端照樣跑完'],
          ['三個 job，unit → integration → e2e', '約 20 秒（18s），之後的 job 略過', '約 4 分半（4m27s）', '約 4 分 20 秒；壞掉時只有 16 秒'],
          ['unit 之後 integration 與 e2e 同時跑', '約 20 秒', '約 3 分半（3m30s）', '約 4 分 20 秒'],
          ['三層，e2e 再分成 3 個 shard 平行（第五節）', '約 20 秒', '約 2 分半（2m27s）', '約 4 分 40 秒'],
        ] },
        { type: 'p', text: '表裡的數字來自本課的模擬：每個 job 多了 runner 接手、checkout 與 `npm ci` 大約 10 秒，所以全部通過時，串成三層的管線反而比原本的一個 job 稍慢。換到的是：單元測試抓得到的錯在 20 秒內回報，而且壞掉時不浪費 runner 跑後面昂貴的測試。要再縮短全部通過的時間，就把彼此不依賴的 job 平行執行，或把最慢的那層切開（第五節）。哪一種形狀最好，取決於你最在意「失敗多快知道」還是「綠燈多快拿到」，以及 runner 的費用；但無論如何，不要讓最快的測試排在最後。' },
        { type: 'callout', tone: 'warning', title: '「e2e 最重要，所以放最前面」是反過來的', text: '端對端測試確實最接近使用者，但「重要」不等於「先跑」。把它放在最前面，所有人每次推送都要先等它幾分鐘，才輪到幾秒就能指出錯誤的單元測試；而端對端測試失敗時，訊息通常是「付款頁等不到」，還得再往下追。依金字塔由快到慢排列，快的先擋下大部分的錯，慢的只在前面都通過時才執行。另一個常見的誤會是以為被略過的 job 也算「失敗」：skipped 表示它沒有執行，不代表整合或端對端測試有問題。' },
      ],
    },
    {
      id: 'cicd05-s-report', title: '測試報告：失敗時也要看得到',
      blocks: [
        { type: 'p', text: '「CI 紅了」只是一個訊號，接下來要知道是哪些測試、為什麼失敗。日誌裡的文字是給人讀的，格式每個工具都不同；測試報告則是機器讀得懂的結果。最通用的格式是 JUnit 風格的 XML，大多數測試工具都能直接或透過外掛（reporter）輸出，CI 平台與報告工具也大多讀得懂：最外層 `<testsuites>` 寫總數與失敗數，每個 `<testsuite>` 是一組測試，失敗的 `<testcase>` 裡有 `<failure>`，寫著失敗的訊息。' },
        { type: 'p', text: '下面的例子在 child-fares 上先在本機跑單元測試，看它寫出的 reports/unit.xml，再把分支推送上去，從舊 CI 的日誌找出最後一個 step「Test report」印出的內容。' },
        { type: 'example', id: 'cicd05-report' },
        { type: 'p', text: '報告的 step 寫在測試之後，但前面的 step 失敗時，一般的 step 會被略過，偏偏測試失敗時才最需要報告。所以它寫了 `if: always()`：不論前面成功、失敗或被取消都執行。如果不希望在 run 被取消時也執行，可以寫 `if: success() || failure()`。這個 step 用 `grep -h "<testsuites" reports/*.xml` 取出每份報告的總數那一行，`tee -a "$GITHUB_STEP_SUMMARY"` 讓它同時印在日誌裡、也附加到 job summary 的檔案。' },
        { type: 'table', head: ['做法', '在哪裡看', '說明'], rows: [
          ['印在日誌', '`gh run view --log`、網頁上的 step', '最簡單；要自己在日誌裡找'],
          ['寫進 `$GITHUB_STEP_SUMMARY`', 'run 的摘要頁', '每個 step 有一個這樣的檔案，寫進去的 Markdown 會顯示在 run 的摘要頁，適合放「幾個通過、幾個失敗、哪些失敗」的表格；模擬環境會寫這個檔案，但沒有摘要頁可以顯示'],
          ['上傳成 artifact', 'run 的 Artifacts，可以下載', '保存完整的 XML、截圖、錄影給之後分析，CICD06 介紹 `actions/upload-artifact`'],
          ['交給報告工具或 PR 的註解', 'Pull Request 的檢查結果', '讀 JUnit XML，把失敗的測試標在 PR 上；也能累積歷史，找出常常失敗的測試'],
        ] },
        { type: 'p', text: '報告的另一個用途是累積歷史。單次的紅燈可能是真的錯誤，也可能是不穩定的測試；把每次 run 的報告留下來，就能看出「checkout 的這個測試最近 20 次失敗了 3 次，而且都在 firefox」這種模式，這是第六節處理不穩定測試的依據。' },
      ],
    },
    {
      id: 'cicd05-s-parallel', title: '平行執行：用 matrix 把慢的測試切開',
      blocks: [
        { type: 'p', text: '三層的管線裡，端對端測試一層就要 3 分鐘以上。這 12 個測試彼此獨立，沒有理由排隊一個一個跑：用 `strategy.matrix` 把同一個 job 展開成幾份，每份在自己的 runner 上平行執行，就是平行執行。對測試來說最常見的兩種切法：分片（sharding），把同一組測試平分成幾份，每份跑其中一部分；以及在不同的環境各跑一次，例如不同的瀏覽器、Node.js 版本或作業系統。' },
        { type: 'table', head: ['寫法', '作用', '本課的例子'], rows: [
          ['`matrix: { shard: [1, 2, 3] }`', '展開成 3 個 job，名稱是 `e2e (1)`、`e2e (2)`、`e2e (3)`；在 step 裡用 `${{ matrix.shard }}` 取得這份的值', 'CI 的 e2e 分成 3 片，每片跑 4 個測試'],
          ['`matrix: { browser: [chromium, firefox, webkit] }`', '同一組測試在每個值上各跑一次', 'Nightly 在三種瀏覽器上各跑 12 個測試'],
          ['`fail-fast`（預設 true）', '任何一個展開的 job 失敗時，取消同一個 matrix 裡還沒結束的其他 job', 'Nightly 沒有寫，所以是 true'],
          ['`max-parallel: 2`', '同時最多執行幾個；預設是能跑多少就跑多少', '共用的測試環境承受不了時才限制'],
        ] },
        { type: 'p', text: '分片要讓測試工具知道「我是第幾份、總共幾份」：本課的工具接受 `--shard=第幾份/總份數`，所以 step 寫成 `npm run test:e2e -- --shard=${{ matrix.shard }}/3`。`${{ matrix.shard }}` 在執行前被代換成 1、2、3，三個 job 分別跑三分之一的測試。matrix 的鍵名要和運算式裡的名稱一致：寫成 `shards: [1, 2, 3]` 卻引用 `matrix.shard`，拿到的是空字串，指令就變成 `--shard=/3`。另外要確認每一份都有 job 在跑：`shard: [1, 2]` 加上 `/3`，第三份測試就永遠沒有人執行。' },
        { type: 'p', text: '平行執行縮短的是等待的時間，不是總工作量：端對端那一層從 3 分 10 秒變成 1 分 10 秒，整個 run 從約 4 分半變成約 2 分半，但三台 runner 各自要做 checkout 與 `npm ci`，runner 的總時間反而多了約 20 秒。分片也有前提：測試彼此獨立，不能依賴執行順序或共用同一筆測試資料（例如兩個 shard 同時訂同一個座位），否則平行之後反而會出現新的不穩定。' },
        { type: 'callout', tone: 'warning', title: '`fail-fast: false` 不會讓失敗變成通過', text: '有人以為寫了 `fail-fast: false`，matrix 裡有一個失敗也沒關係。它只決定「一個失敗時要不要取消其他還在跑的」：false 時其他的 job 繼續跑完，你能看到每個瀏覽器各自的結果，但失敗的 job 仍然是 failure，run 仍然是 failure。預設的 true 適合「一個失敗就不能合併」的 PR 檢查，省下 runner；Nightly 這種要知道每種環境結果的，通常設成 false。要讓某個 job 失敗而不影響整個 run，是 job 的 `continue-on-error: true`，那是隔離不穩定測試時才用的手段（第六節）。' },
      ],
    },
    {
      id: 'cicd05-s-flaky', title: '不穩定測試：重新執行不是修好',
      blocks: [
        { type: 'p', text: '不穩定測試（flaky test）是程式碼沒有改變，同一個測試有時通過、有時失敗。它比一直失敗的測試更傷：一直失敗的測試大家會修，不穩定的測試讓大家學會「紅了就重跑」，久而久之真正的錯誤也被當成偶發，CI 失去把關的作用。常見的原因：' },
        { type: 'table', head: ['原因', '例子', '常見的修法'], rows: [
          ['等待時間寫死', '「最多等 5 秒付款表單出現」，在比較慢的瀏覽器或忙碌的 runner 上偶爾超過', '等待條件成立（元素出現、請求完成），而不是等固定的秒數'],
          ['測試之間共用狀態', '兩個測試用同一個座位或帳號，執行順序或平行時互相干擾', '每個測試自己建立、清除資料'],
          ['依賴外部服務', '測試真的呼叫第三方的付款或地圖服務', '整合與端對端測試改用測試用的替身（stub）或沙箱'],
          ['時間與日期', '「明天的航班」在午夜前後跑結果不同；時區不同', '在測試裡固定時鐘與時區'],
          ['隨機與並行', '依賴未固定種子的亂數、執行緒的先後', '固定種子，等待並行的工作真的完成'],
        ] },
        { type: 'p', text: '辨認的方法是比較：同一個 commit、同一份 workflow，這次失敗、重新執行卻通過，或在這個瀏覽器失敗、其他瀏覽器通過，就很可能是不穩定的測試。下面的例子手動觸發 Nightly，看三種瀏覽器的結果。' },
        { type: 'example', id: 'cicd05-nightly' },
        { type: 'p', text: 'firefox 失敗了；chromium 與 webkit 顯示 `-`，它們沒有失敗，而是被 fail-fast 取消：firefox 失敗的那一刻它們還沒跑完，所以這次的 run 根本不知道它們在這個 commit 上的結果。這正是 Nightly 該設成 `fail-fast: false` 的理由。用 `gh run view 編號 --log-failed` 讀失敗的 step，可以找出是哪個測試、錯誤訊息是什麼（第三個練習）。' },
        { type: 'p', text: '`gh run rerun 編號 --failed` 只重新執行失敗與被取消的 job，以及依賴它們的 job；已經成功的 job 保留上次的結果，不再花 runner 的時間。重新執行時 `GITHUB_RUN_ATTEMPT` 加一，`gh run view` 的標題顯示 `(Attempt #2)`。run 還在執行時不能重新執行（HTTP 403），要先等它結束。不加 `--failed` 會重新執行整個 run 的所有 job。對 Nightly 這次的 run 兩者效果一樣，因為三個 job 不是失敗就是被取消；但對 CI 這種前面有 unit、integration 已經通過的 run，`--failed` 只重跑壞掉的那一層。' },
        { type: 'list', ordered: true, items: [
          '確認：同一個 commit 重新執行失敗的 job 一次（`gh run rerun 編號 --failed`）。通過了，表示很可能是不穩定；又失敗，多半是真的錯，照一般的錯誤處理。',
          '記錄：開一個 issue，附上失敗的 run 與日誌，指定負責的人。報告的歷史能告訴你它多常失敗。',
          '隔離（quarantine）：如果短期修不好又常常擋住大家，把它移到不擋合併的地方，例如另一個 job 加上 `continue-on-error: true`，或只在 Nightly 執行，並寫好期限。被隔離的測試仍然會執行、仍然看得到結果，只是暫時不讓 run 失敗。',
          '修正原因：依上表找出原因並修正，例如把寫死的 5 秒等待改成等付款表單出現。修好後連續跑多次確認，再移回原本的位置。',
        ] },
        { type: 'callout', tone: 'warning', title: '一直按重新執行、或把測試刪掉，都不是處理', text: '重新執行到綠燈為止，只是讓這一次的 run 通過；測試仍然不穩定，下一個人照樣會遇到，而真正的錯誤也可能被重跑「蓋過去」。讓測試工具自動重試很多次也是一樣，只是把重跑藏起來。把測試刪掉或從 matrix 拿掉 firefox，則是把「付款在 firefox 上可能失敗」這個訊號丟掉，說不定那就是使用者會遇到的問題。重新執行只用來確認是不是偶發，之後一定要記錄、隔離並修正原因。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd05-q-pyramid', prompt: '一個專案要依測試金字塔補強測試。下列哪一種分布最符合金字塔的原則？',
      options: ['端對端測試最多，因為它最接近使用者；單元測試只測最核心的函式', '大量的單元測試、較少的整合測試、少數關鍵流程的端對端測試', '三種測試各占三分之一，讓每一層都同樣完整', '只寫端對端測試，因為它一次就涵蓋了所有元件'],
      answer: 1,
      explanation: '金字塔的底層是又快又穩定、能精確指出錯誤的單元測試，數量最多；整合測試較少；端對端測試只留少數最重要的流程。端對端測試最多是冰淇淋甜筒的反模式，回饋慢又容易不穩定；平均分配沒有反映各層的成本差異；只寫端對端測試，失敗時很難知道是哪裡錯，而且每次都要等很久。',
    },
    {
      id: 'cicd05-q-order', prompt: 'CI 只有一個 job，step 依序是 `npm run test:e2e`（3 分鐘）、`npm run test:integration`、`npm run test:unit`（6 秒）。改成 unit → integration → e2e 三個用 `needs` 串起來的 job，最主要的好處是什麼？',
      options: ['全部通過時，整個 run 一定比原本的一個 job 更快結束', '端對端測試會因為排在後面而變得比較穩定', '不再需要在每個 job 裡各自執行一次 `npm ci`', '單元測試的錯在幾十秒內回報，後面的 job 被略過'],
      answer: 3,
      explanation: '分層之後 unit 一開始就執行，失敗時十幾秒就回報，integration 與 e2e 被略過，不浪費 runner。全部通過時不一定比較快，每個 job 都多了 checkout 與 `npm ci`，本課的例子反而慢了約 20 秒；排列順序不會改變端對端測試本身的穩定性；每個 job 是新的 runner，反而每個都要自己 `npm ci`。',
    },
    {
      id: 'cicd05-q-skipped', prompt: '`integration` 寫了 `needs: unit`，`e2e` 寫了 `needs: integration`。這次 unit 失敗了，`gh run view` 裡 integration 與 e2e 的結論會是什麼？',
      options: ['skipped：需要的 job 沒有成功，它們不會執行', 'failure：它們依賴的 job 失敗了，所以自己也被算成失敗', 'success：沒有執行就沒有錯誤', 'queued：一直停在佇列裡，等到 unit 重新執行成功為止'],
      answer: 0,
      explanation: '沒有寫 `if` 的 job 要等它 needs 的 job 都成功才執行；unit 失敗，integration 與 e2e 就不執行，結論是 skipped，run 的結論是 failure（因為 unit 失敗）。它們沒有執行，所以不是 failure，也不是 success；run 已經結束，它們不會留在 queued 等待。',
    },
    {
      id: 'cicd05-q-report', prompt: '單元測試的 step 之後有一個印出測試報告的 step。測試失敗時，報告的 step 被略過了，日誌裡什麼也沒有。最恰當的改法是什麼？',
      options: ['把報告的 step 移到測試之前執行', '在測試的 step 加上 `continue-on-error: true`', '在報告的 step 加上 `if: always()`', '把報告的 step 移到另一個 workflow'],
      answer: 2,
      explanation: '前一個 step 失敗時，一般的 step 隱含 `success()` 的條件而被略過；`if: always()` 讓它不論前面的結果都執行，失敗時也印得出報告，job 仍然是失敗。移到測試之前時報告還沒產生；`continue-on-error` 會讓失敗的測試被當成成功，CI 不再擋下錯誤；另一個 workflow 在另一台 runner 上，看不到這次測試寫出的檔案。',
    },
    {
      id: 'cicd05-q-failfast', prompt: 'Nightly 的 matrix 是三種瀏覽器，firefox 一失敗，chromium 與 webkit 就被取消。團隊把它改成 `fail-fast: false`。之後 firefox 再失敗時會怎樣？',
      options: ['firefox 的失敗會被忽略，整個 run 的結論變成 success，不再擋住任何人', 'firefox 會自動重新執行，直到通過為止', '三個 job 都改成依序執行，不再平行', '其他瀏覽器會跑完、各自顯示結果，run 仍是 failure'],
      answer: 3,
      explanation: '`fail-fast` 只決定一個 matrix job 失敗時要不要取消其他還在跑的 job；設成 false 後其他瀏覽器會跑完，你能看到每一種的結果，但失敗的 job 仍是 failure，run 也是 failure。它不會忽略失敗（那是 `continue-on-error`），不會自動重試，也不影響平行執行（那是 `max-parallel`）。',
    },
    {
      id: 'cicd05-q-shard', prompt: '端對端測試要 3 分鐘。下列哪一個 e2e job 的寫法，能真正把它分成 3 份平行執行？',
      options: ['`matrix: { shard: [1, 2, 3] }`，step 是 `npm run test:e2e -- --shard=${{ matrix.shard }}/3`', '`matrix: { shard: [1, 2, 3] }`，step 是 `npm run test:e2e`', '`matrix: { shards: [1, 2, 3] }`，step 是 `npm run test:e2e -- --shard=${{ matrix.shard }}/3`', '`max-parallel: 3`，step 是 `npm run test:e2e`'],
      answer: 0,
      explanation: '分片需要展開 3 個 job，並把每個 job 的編號交給測試工具，三個 job 才會各跑三分之一。只展開不傳編號，三個 job 都跑完整的測試，重複三次而沒有變快；鍵名寫成 shards 卻引用 `matrix.shard`，拿到空字串，參數變成 `--shard=/3`；沒有 matrix 時 `max-parallel` 沒有東西可以平行。',
    },
    {
      id: 'cicd05-q-flaky', prompt: '同一個 commit，Nightly 的 firefox 失敗，重新執行失敗的 job 後通過了。下一步最恰當的是什麼？',
      options: ['把這個測試刪掉，它一直在製造雜訊', '開 issue 追蹤，必要時暫時隔離，並修正不穩定的原因', '在 workflow 裡讓失敗的測試自動重試五次，以後就不用再管它了', '不用處理，既然重新執行就會通過，表示程式沒有問題'],
      answer: 1,
      explanation: '重新執行通過只確認了這很可能是不穩定測試，問題仍在：要記錄、指定負責的人，常擋住大家時暫時隔離，並修正原因（例如寫死的等待時間）。刪掉測試等於丟掉付款在 firefox 上可能失敗的訊號；自動重試只是把重跑藏起來；放著不管會讓大家習慣忽略紅燈，真的錯誤也會被當成偶發。',
    },
    {
      id: 'cicd05-q-rerun', prompt: 'CI 的 run 裡 unit 與 integration 成功，e2e 的第 2 片失敗、其他兩片被 fail-fast 取消。執行 `gh run rerun 編號 --failed` 會重新執行哪些 job？',
      options: ['全部的 job 都重新執行，包含上次已經成功的 unit 與 integration', '失敗與被取消的 e2e job，其餘保留上次的結果', '只有失敗的那一片，被取消的不會重新執行', '什麼都不會執行，`--failed` 只是列出失敗的 job'],
      answer: 1,
      explanation: '`--failed` 重新執行失敗與被取消的 job，以及依賴它們的 job；已經成功的 unit 與 integration 保留上次的結果與日誌，不再花 runner 的時間，run 的 attempt 加一。不加 `--failed` 才是重新執行全部的 job；被取消的 job 也會重新執行，因為它們這次沒有結果；`--failed` 是真的觸發重新執行，不是列出清單。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd05-pyramid', title: '金字塔的三層各花多少時間', machine: 'cicd05-lab',
        description: '在筆電上依序跑單元、整合與端對端測試，用 date 看每一層花的時間，最後看三份 XML 報告。',
        steps: [
          { command: 'cd tickets', output: "" },
          { command: 'date', output: "Mon Nov 23 10:00:00 CST 2026" },
          { command: 'npm run test:unit', output: "PASS test/unit/dates.test.js\nPASS test/unit/fare.test.js\nPASS test/unit/seats.test.js\n\nTests:       48 passed, 48 total\nTime:        5.2 s" },
          { command: 'date', output: "Mon Nov 23 10:00:06 CST 2026" },
          { command: 'npm run test:integration', output: "PASS test/integration/booking.test.js\nPASS test/integration/payments.test.js\n\nTests:       14 passed, 14 total\nTime:        43.8 s" },
          { command: 'date', output: "Mon Nov 23 10:00:51 CST 2026" },
          { command: 'npm run test:e2e', output: "Running 12 tests using 1 worker\n\n  12 passed (2.9m)" },
          { command: 'date', output: "Mon Nov 23 10:03:51 CST 2026" },
          { command: 'ls reports', output: "e2e.xml  integration.xml  unit.xml" },
        ],
      },
      {
        id: 'cicd05-slow', title: '舊的管線：4 分鐘後才知道單元測試壞了', machine: 'cicd05-lab',
        description: '看目前的 ci.yml（一個 job，e2e 排第一），把 child-fares 推送上去，等 run 結束：失敗的是最後才執行的單元測試。',
        steps: [
          { command: 'cd tickets', output: "" },
          { command: 'cat .github/workflows/ci.yml', output: "name: CI\non: push\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run test:e2e\n      - run: npm run test:integration\n      - run: npm run test:unit\n      - name: Test report\n        if: always()\n        run: grep -h \"<testsuites\" reports/*.xml | tee -a \"$GITHUB_STEP_SUMMARY\"" },
          { command: 'git switch child-fares', output: "Switched to branch 'child-fares'" },
          { command: 'git log --oneline -2', output: "0b09216 (HEAD -> child-fares) Add a weekend child discount\nf8e9020 (origin/main, origin/HEAD, main) Add nightly cross-browser e2e" },
          { command: 'git push -u origin child-fares', output: "remote: \nremote: Create a pull request for 'child-fares' on GitHub by visiting:\nremote:      https://github.example/ferrylane/tickets/pull/new/child-fares\nremote: \nTo https://github.example/ferrylane/tickets.git\n * [new branch]      child-fares -> child-fares\nbranch 'child-fares' set up to track 'origin/child-fares'." },
          { command: 'gh run list', output: "STATUS  TITLE                         WORKFLOW  BRANCH       EVENT  ID          ELAPSED  AGE\n*       Add a weekend child discount  CI        child-fares  push   4100000001  0s       less than a minute ago" },
          { command: 'gh run watch 4100000001', output: "Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX child-fares CI · 4100000001\nTriggered via push about 4 minutes ago\n\nJOBS\nX test in 4m1s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  ✓ Run npm run test:e2e\n  ✓ Run npm run test:integration\n  X Run npm run test:unit\n  ✓ Test report\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\ntest: .github#6\n\nX Run CI (4100000001) completed with 'failure'" },
          { command: 'gh run list', output: "STATUS  TITLE                         WORKFLOW  BRANCH       EVENT  ID          ELAPSED  AGE\nX       Add a weekend child discount  CI        child-fares  push   4100000001  4m3s     about 4 minutes ago" },
        ],
      },
      {
        id: 'cicd05-report', title: '單元測試的 JUnit 報告', machine: 'cicd05-lab',
        description: '在 child-fares 上先在本機跑單元測試，看 reports/unit.xml 怎麼記錄失敗；推送後，從 CI 日誌找出 Test report 這個 step 印出的總數。',
        steps: [
          { command: 'cd tickets', output: "" },
          { command: 'git switch child-fares', output: "Switched to branch 'child-fares'" },
          { command: 'npm run test:unit', output: "PASS test/unit/dates.test.js\nFAIL test/unit/fare.test.js\n  ● fare › rounds child fares to whole dollars\n\n    Expected: 13\n    Received: 12.5\n\nPASS test/unit/seats.test.js\n\nTests:       1 failed, 47 passed, 48 total\nTime:        5.4 s" },
          { command: 'cat reports/unit.xml', output: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<testsuites name=\"unit\" tests=\"48\" failures=\"1\">\n  <testsuite name=\"dates\" tests=\"18\" failures=\"0\"/>\n  <testsuite name=\"fare\" tests=\"6\" failures=\"1\">\n    <testcase classname=\"fare\" name=\"rounds child fares to whole dollars\">\n      <failure message=\"Expected: 13, Received: 12.5\"/>\n    </testcase>\n  </testsuite>\n  <testsuite name=\"seats\" tests=\"24\" failures=\"0\"/>\n</testsuites>" },
          { command: 'git status -s', output: "" },
          { command: 'git push -q -u origin child-fares', output: "remote: \nremote: Create a pull request for 'child-fares' on GitHub by visiting:\nremote:      https://github.example/ferrylane/tickets/pull/new/child-fares\nremote: \nTo https://github.example/ferrylane/tickets.git\n * [new branch]      child-fares -> child-fares\nbranch 'child-fares' set up to track 'origin/child-fares'." },
          { command: 'sleep 300', output: "" },
          { command: "gh run view 4100000001 --log | grep 'Test report' | cut -f3", output: "2026-11-23T02:04:09.0000000Z ##[group]Run grep -h \"<testsuites\" reports/*.xml | tee -a \"$GITHUB_STEP_SUMMARY\"\n2026-11-23T02:04:09.0000000Z grep -h \"<testsuites\" reports/*.xml | tee -a \"$GITHUB_STEP_SUMMARY\"\n2026-11-23T02:04:09.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-23T02:04:09.0000000Z ##[endgroup]\n2026-11-23T02:04:09.0000000Z <testsuites name=\"e2e\" tests=\"12\" failures=\"0\">\n2026-11-23T02:04:09.0000000Z <testsuites name=\"integration\" tests=\"14\" failures=\"0\">\n2026-11-23T02:04:09.0000000Z <testsuites name=\"unit\" tests=\"48\" failures=\"1\">" },
        ],
      },
      {
        id: 'cicd05-nightly', title: 'Nightly：三種瀏覽器與 fail-fast', machine: 'cicd05-lab',
        description: '看 nightly.yml 的 matrix，手動觸發一次並等它結束：firefox 失敗，另外兩個瀏覽器被 fail-fast 取消。',
        steps: [
          { command: 'cd tickets', output: "" },
          { command: 'cat .github/workflows/nightly.yml', output: "name: Nightly\non:\n  schedule:\n    - cron: \"0 18 * * *\"\n  workflow_dispatch:\npermissions:\n  contents: read\njobs:\n  e2e:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        browser: [chromium, firefox, webkit]\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run test:e2e -- --project=${{ matrix.browser }}" },
          { command: 'gh workflow run nightly.yml', output: "✓ Created workflow_dispatch event for nightly.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"nightly.yml\"" },
          { command: 'gh run list -w nightly.yml', output: "STATUS  TITLE    WORKFLOW  BRANCH  EVENT              ID          ELAPSED  AGE\n*       Nightly  Nightly   main    workflow_dispatch  4100000001  0s       less than a minute ago" },
          { command: 'gh run watch 4100000001', output: "Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX main Nightly · 4100000001\nTriggered via workflow_dispatch about 3 minutes ago\n\nJOBS\n- e2e (chromium) in 3m16s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  - Run npm run test:e2e -- --project=${{ matrix.browser }}\n  ✓ Complete job\nX e2e (firefox) in 3m16s (ID 11300000002)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  X Run npm run test:e2e -- --project=${{ matrix.browser }}\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n- e2e (webkit) in 3m16s (ID 11300000003)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  - Run npm run test:e2e -- --project=${{ matrix.browser }}\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\ne2e (firefox): .github#4\n\nX Run Nightly (4100000001) completed with 'failure'" },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd05-ex-stages', title: '讓單元測試先跑、先失敗', machine: 'cicd05-lab',
        statement: '~/tickets 的分支 child-fares 上有你今天早上的 commit Add a weekend child discount，還沒推送；它讓一個單元測試失敗。這一題正好用它驗證新的管線，所以先不要修 src/fare.js。在 child-fares 上把 .github/workflows/ci.yml 改寫成三個 job（保留原本的 `name: CI`、`on: push` 與 `permissions`）：`unit` 執行 `npm run test:unit`；`integration` 執行 `npm run test:integration`，needs unit；`e2e` 執行 `npm run test:e2e`，needs integration。每個 job 都在 ubuntu-latest 上先 `actions/checkout@v4` 再 `npm ci`。提交後用 `git push -u origin child-fares` 推送，等 run 跑完：unit 應該失敗，integration 與 e2e 被略過。',
        checks: [
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'child-fares', tip: true, job: 'unit', conclusion: 'failure' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'child-fares', tip: true, job: 'integration', conclusion: 'skipped' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'child-fares', tip: true, job: 'e2e', conclusion: 'skipped' },
        ],
        solution: [...ON_BRANCH, ...STAGES, ...BRANCH_PUSH, WATCH_CI],
        mistakes: [
          { commands: [...ON_BRANCH, ...write(CI, HEAD_UNIT, yml(...job('integration', 'npm run test:integration')), yml(...job('e2e', 'npm run test:e2e'))), ...BRANCH_PUSH, 'sleep 300'],
            why: '沒有寫 needs：三個 job 同時開始，unit 失敗時 integration 與 e2e 照樣跑完，沒有被略過，runner 的時間一點也沒省' },
          { commands: [...ON_BRANCH, ...write(CI, yml(...HEAD, ...job('e2e', 'npm run test:e2e')), yml(...job('integration', 'npm run test:integration', 'e2e')), yml(...job('unit', 'npm run test:unit', 'integration'))), ...BRANCH_PUSH, 'sleep 300'],
            why: '順序反了（e2e → integration → unit）：要等端對端與整合測試跑完，約 4 分半後 unit 才失敗，integration 也沒有被略過' },
          { commands: [...ON_BRANCH, ...write(CI, HEAD_UNIT, yml(...job('integration', 'npm run test:integration', 'units')), E2E), ...BRANCH_PUSH, 'sleep 300'],
            why: 'needs 寫成不存在的 units：workflow 無效，run 直接失敗，一個 job 也沒有執行' },
          { commands: [...ON_BRANCH, ...STAGES, "git commit -qam 'Run the fast tests first'", 'git push'],
            why: 'child-fares 還沒有上游分支，單獨的 git push 被拒絕，主機上沒有這個分支，也沒有 run' },
          { commands: [...ON_BRANCH, ...STAGES, ...BRANCH_PUSH],
            why: '推送之後沒有等 run 跑完，unit 還在執行' },
        ],
        hints: [
          '先 `git switch child-fares`。一個 job 一個 printf：第一個用 `>` 寫入檔頭與 unit，後兩個用 `>>` 接上 integration 與 e2e',
          "例如 integration 那一段：`printf '  integration:\\n    needs: unit\\n    runs-on: ubuntu-latest\\n    steps:\\n      - uses: actions/checkout@v4\\n      - run: npm ci\\n      - run: npm run test:integration\\n' >> .github/workflows/ci.yml`",
          '寫完 `cat .github/workflows/ci.yml` 檢查縮排，再 `git commit -am …` 與 `git push -u origin child-fares`',
          '`gh run list` 找到 run 的編號，`gh run watch 編號` 等它結束',
        ],
        explanation: '`needs` 讓 job 依金字塔由快到慢排列：unit 在 run 一開始就執行，十幾秒就失敗；integration 需要 unit 成功，e2e 需要 integration 成功，所以兩者都是 skipped。原本要等 4 分鐘才知道的錯，現在不到半分鐘就回報，也沒有浪費 runner 跑昂貴的測試。下一步就是修好 fare.js（`Math.round`）再推送。',
      },
      {
        id: 'cicd05-ex-shards', title: '把端對端測試分成 3 片平行執行', machine: 'cicd05-lab',
        statement: 'main 上的程式是好的，但 CI 仍是一個要跑 4 分鐘的 job。在 ~/tickets 的 main 上把 .github/workflows/ci.yml 改寫成和上一題相同的三層（unit → integration → e2e，保留 name、on 與 permissions），並把 e2e 用 matrix 分成 3 片平行執行：matrix 的變數叫 `shard`，值是 1、2、3，每片執行 `npm run test:e2e -- --shard=<這片的編號>/3`。提交、推送到 main，等 run 跑完而且全部通過。',
        checks: [
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'main', tip: true, job: 'integration', conclusion: 'success' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'main', tip: true, job: 'e2e (1)', conclusion: 'success', logIncludes: 'shard 1 of 3' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'main', tip: true, job: 'e2e (2)', conclusion: 'success', logIncludes: 'shard 2 of 3' },
          { kind: 'run', repo: TICKETS, workflow: 'ci.yml', ref: 'main', tip: true, job: 'e2e (3)', conclusion: 'success', logIncludes: 'shard 3 of 3' },
        ],
        solution: ['cd tickets', ...SHARDED, ...MAIN_PUSH, WATCH_CI],
        mistakes: [
          { commands: ['cd tickets', ...write(CI, HEAD_UNIT, INTEGRATION, yml(...job('e2e', 'npm run test:e2e', 'integration', 'shard: [1, 2, 3]'))), ...MAIN_PUSH, 'sleep 300'],
            why: '展開了 3 個 job，但沒有把編號交給測試工具：三個 job 都跑完整的 12 個測試，重複三次而沒有變快' },
          { commands: ['cd tickets', ...write(CI, HEAD_UNIT, INTEGRATION, yml(...job('e2e', 'npm run test:e2e -- --shard=${{ matrix.shard }}/3', 'integration', 'shards: [1, 2, 3]'))), ...MAIN_PUSH, 'sleep 300'],
            why: 'matrix 的鍵是 shards，運算式卻引用 matrix.shard：拿到空字串，指令變成 --shard=/3，三個 job 都失敗' },
          { commands: ['cd tickets', ...write(CI, HEAD_UNIT, INTEGRATION, yml(...job('e2e', 'npm run test:e2e -- --shard=${{ matrix.shard }}/3', 'integration', 'shard: [1, 2]'))), ...MAIN_PUSH, 'sleep 300'],
            why: '只有 1、2 兩片卻寫 /3：第三份測試沒有任何 job 執行' },
          { commands: ['cd tickets', ...SHARDED, "git commit -qam 'Shard the e2e tests'"],
            why: '只提交沒有推送，主機上沒有新的 run' },
          { commands: ['cd tickets', ...SHARDED, ...MAIN_PUSH],
            why: '推送之後沒有等 run 跑完' },
        ],
        hints: [
          'unit 與 integration 兩段和上一題相同；e2e 那一段在 `runs-on` 之後加上 `strategy:`、`matrix:`、`shard: [1, 2, 3]`（各多縮 2 格）',
          "e2e 的最後一個 step：`- run: npm run test:e2e -- --shard=${{ matrix.shard }}/3`（在 printf 的單引號裡，`$` 不會被 shell 展開）",
          '推送後 `gh run watch 編號`，應該看到 `e2e (1)`、`e2e (2)`、`e2e (3)` 三個 job',
        ],
        explanation: 'matrix 把 e2e 展開成 `e2e (1)`、`e2e (2)`、`e2e (3)` 三個 job，在三台 runner 上同時執行，`${{ matrix.shard }}` 讓每個 job 只跑自己那三分之一。端對端那一層從 3 分多鐘變成 1 分多鐘：和不分片的三層（約 4 分半）相比，整個 run 縮短到約 2 分半，也比原本一個 job 的約 4 分鐘快；代價是多了兩台 runner 的 checkout 與 `npm ci`。',
      },
      {
        id: 'cicd05-ex-find', title: '從日誌找出不穩定的測試', machine: 'cicd05-lab',
        statement: '團隊說 Nightly 最近偶爾紅燈。在 ~/tickets 一開始就用 `gh workflow run nightly.yml` 手動觸發一次（不要先等待），等 run 結束，再用 `gh run view <run 的編號> --log-failed` 印出失敗的 step 的日誌，找出是哪個瀏覽器的哪一個測試失敗、錯誤訊息是什麼。',
        checks: [{ kind: 'output', fromCommand: '^gh run view ' }],
        solution: [...NIGHTLY_RUN, `gh run view ${LATEST('nightly.yml')} --log-failed`],
        mistakes: [
          { commands: [...NIGHTLY_RUN, 'gh run view 4100000001'], why: '只看了摘要：知道 firefox 的 job 失敗，看不到是哪個測試、錯誤訊息是什麼' },
          { commands: ['cd tickets', 'gh workflow run nightly.yml', 'gh run view 4100000001 --log-failed'], why: 'run 還在執行，日誌要等它結束才拿得到' },
          { commands: [...NIGHTLY_RUN, 'gh run list -w nightly.yml'], why: 'run 的清單只有結論，沒有失敗的原因' },
        ],
        variants: [{ label: '在下午觸發', files: [], now: '2026-11-23 06:30:00' }],
        hints: ['觸發後 `gh run list` 找到編號，`gh run watch 編號` 等它結束', '`gh run view 編號 --log-failed` 只印失敗的 step；每行依序是 job 名稱、step 名稱、時間與內容'],
        explanation: '`--log-failed` 只留下失敗的 step，是找原因最快的地方：失敗的是 `e2e (firefox)` 的 `checkout.spec.js › pays for a child ticket with a saved card`，錯誤是等付款表單超過 5000ms。寫死的等待時間是不穩定測試最常見的原因之一；chromium 與 webkit 沒有出現在這裡，因為它們不是失敗，而是被 fail-fast 取消。',
      },
      {
        id: 'cicd05-ex-rerun', title: '只重新執行失敗的 job', machine: 'cicd05-lab',
        statement: 'Nightly 的 firefox 在這個沒有改過的 commit 上失敗，看起來是不穩定的測試。在 ~/tickets 用 `gh workflow run nightly.yml` 觸發一次並等它結束，然後只重新執行這個 run 失敗（與被取消）的 job，等第二次執行（attempt 2）結束並通過。不要修改 workflow、不要刪掉測試，也不要另外觸發一個新的 run：這一步只是確認它是偶發的失敗，之後還要開 issue 追蹤並修正原因。',
        checks: [
          { kind: 'run', repo: TICKETS, workflow: 'nightly.yml', event: 'workflow_dispatch', attempt: 2, conclusion: 'success' },
          { kind: 'run', repo: TICKETS, workflow: 'nightly.yml', event: 'workflow_dispatch', attempt: 2, job: 'e2e (firefox)', conclusion: 'success' },
          { kind: 'branch', repo: TICKETS, name: 'main', file: { path: NIGHTLY_PATH, content: NIGHTLY } },
        ],
        solution: [...NIGHTLY_RUN, `gh run rerun ${LATEST('nightly.yml')} --failed`, 'sleep 300'],
        mistakes: [
          { commands: NIGHTLY_RUN, why: '只等了第一次的結果，沒有重新執行，run 仍是 failure' },
          { commands: [...NIGHTLY_RUN, 'gh workflow run nightly.yml', 'sleep 300'], why: '觸發的是一個新的 run，不是重新執行原本的 run；新的 run 是它的第一次執行，firefox 又失敗' },
          { commands: ['cd tickets', 'gh workflow run nightly.yml', 'gh run rerun 4100000001 --failed', 'sleep 300'], why: 'run 還在執行時不能重新執行（HTTP 403），等到最後仍只有第一次的失敗結果' },
          { commands: [...NIGHTLY_RUN, 'gh run rerun 4100000001 --failed'], why: '重新執行之後沒有等它跑完，attempt 2 還在執行' },
          { commands: ['cd tickets', ...write(NIGHTLY_PATH, yml(...NIGHTLY_HEAD, ...job('e2e', 'npm run test:e2e -- --project=${{ matrix.browser }}', undefined, 'browser: [chromium, webkit]'))), "git commit -qam 'Skip firefox'", 'git push -q', 'gh workflow run nightly.yml', 'sleep 300'],
            why: '把 firefox 從 matrix 拿掉讓 run 變綠：不穩定的測試沒有被確認也沒有被修正，只是被藏起來，付款在 firefox 上可能失敗的訊號也丟掉了' },
        ],
        hints: ['`gh workflow run nightly.yml`，`sleep 300` 等它結束（或 `gh run watch 編號`）', '`gh run rerun 編號 --failed` 只重新執行失敗與被取消的 job', '重新執行後再等一次，`gh run view 編號` 的標題會出現 `(Attempt #2)`'],
        explanation: '同一個 commit、同一份 workflow，重新執行失敗的 job 就通過，證實 firefox 的失敗是偶發的，而不是程式真的壞了。這次三個 job 不是失敗就是被取消，所以 `--failed` 三個都重新執行；在前面有 job 已經成功的 run 裡，`--failed` 會保留它們。確認之後要開 issue、指定負責的人，必要時隔離這個測試，並把寫死的 5 秒等待改成等付款表單出現。',
      },
    ],
  },
};
