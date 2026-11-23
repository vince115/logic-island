import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import type { LessonContent } from '../schema';

/*
 * CICD04 GitHub Actions 入門 (the blueprint's pipeline-sim, terminal-sim on the actions profile: engine stages E25 git, E26
 * forge, E27 workflows and E28 actions). A made-up ferry company team, Seabird, on the simulated github.example: Kao Yen
 * (the learner, gh login yen-kao) and Tsai Bo, who wrote the first workflows. seabird/ferry-times (a small Node project,
 * version 1.4.0) has three workflows on main: ci.yml (CI: push to main and pull requests into main, contents: read; job
 * test: checkout, setup-node, npm ci, npm test), lint.yml (Lint: the same triggers, but its job asks for write-all) and
 * notes.yml (Release notes: workflow_dispatch with a choice input channel, and a schedule at 03:00 UTC on weekdays; no
 * permissions). The repository's default workflow permissions are the permissive write. seabird/pier-tickets is a new
 * repository with code and tests but no workflow (the learner is its admin; default permissions read). CI tools: npm ci
 * (needs package-lock.json in the workspace), npm test and npm run lint (pass when the files are there). The machine's
 * clock is 2026-11-23 02:00 UTC, a Monday (10:00 in Asia/Taipei); runners log in UTC. Workflows, jobs, steps and actions,
 * runners and labels, triggers and filters, workflow_dispatch inputs and schedules, needs, a matrix, step and job
 * outputs, expressions, and GITHUB_TOKEN permissions. Organisation, people, files and addresses are made up; every
 * transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const FERRY = 'https://github.example/seabird/ferry-times.git';
const PIER = 'https://github.example/seabird/pier-tickets.git';
const YEN = { name: 'Kao Yen', email: 'yen@seabird.example' }, BO = { name: 'Tsai Bo', email: 'bo@seabird.example' };
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** A command writing this text to the file with a quoted here-document (the text ends with a newline). */
const heredoc = (path: string, text: string, append = false) => `cat ${append ? '>>' : '>'} ${path} <<'EOF'\n${text}EOF`;

const CI_YML = wf('name: CI', 'on:', '  push:', '    branches: [main]', '  pull_request:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  test:',
  '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 20',
  '      - run: npm ci', '      - run: npm test');
const LINT_YML = wf('name: Lint', 'on:', '  push:', '    branches: [main]', '  pull_request:', '    branches: [main]', 'jobs:', '  lint:', '    runs-on: ubuntu-latest',
  '    permissions: write-all', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 20',
  '      - run: npm ci', '      - run: npm run lint');
const NOTES_YML = wf('name: Release notes', 'on:', '  workflow_dispatch:', '    inputs:', '      channel:', '        type: choice', '        options: [beta, stable]',
  '        default: beta', '  schedule:', "    - cron: '0 3 * * 1-5'", 'jobs:', '  notes:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
  "      - run: echo \"Release notes for the ${{ inputs.channel || 'beta' }} channel\"", '      - run: date -u');

const FERRY_PKG = '{\n  "name": "ferry-times",\n  "version": "1.4.0",\n  "scripts": {\n    "lint": "eslint src",\n    "test": "jest"\n  }\n}\n';
const PIER_PKG = '{\n  "name": "pier-tickets",\n  "version": "0.3.0",\n  "scripts": {\n    "test": "jest"\n  }\n}\n';
const LOCK = (name: string) => `{\n  "name": "${name}",\n  "lockfileVersion": 3\n}\n`;

const COMMITS: TerminalGitCommit[] = [
  { id: 'f1', message: 'Initial commit', author: BO, time: '2026-11-16 02:00:00', files: {
    'README.md': '# ferry-times\n\nTimetables and fares for the Seabird island ferries.\n', 'package.json': FERRY_PKG, 'package-lock.json': LOCK('ferry-times'),
    'src/fares.js': 'export const fare = (adults, children) => adults * 120 + children * 60;\n',
    'test/fares.test.js': "import { fare } from '../src/fares.js';\n\ntest('a family of four', () => expect(fare(2, 2)).toBe(360));\n",
    'docs/guide.md': '# Guide\n\nRun npm test before you push.\n',
  } },
  { id: 'f2', message: 'Add CI, lint and release notes workflows', author: BO, time: '2026-11-20 03:00:00', files: {
    '.github/workflows/ci.yml': CI_YML, '.github/workflows/lint.yml': LINT_YML, '.github/workflows/notes.yml': NOTES_YML,
  } },
  { id: 'p1', parents: [], message: 'Initial commit', author: YEN, time: '2026-11-21 06:00:00', files: {
    'README.md': '# pier-tickets\n\nTicket prices for the Seabird piers.\n', 'package.json': PIER_PKG, 'package-lock.json': LOCK('pier-tickets'),
    'src/tickets.js': 'export const price = (zone) => 40 + zone * 15;\n',
    'test/tickets.test.js': "import { price } from '../src/tickets.js';\n\ntest('zone 2', () => expect(price(2)).toBe(70));\n",
  } },
];

const NO_PACKAGE = 'npm error code ENOENT\nnpm error enoent Could not read package.json: Error: ENOENT: no such file or directory';
const TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cases: [
    { when: [{ path: 'package-lock.json' }], stdout: 'added 268 packages, and audited 269 packages in 4s\n\nfound 0 vulnerabilities', seconds: 4 },
    { stderr: 'npm error code EUSAGE\nnpm error\nnpm error The `npm ci` command can only install with an existing package-lock.json or\nnpm error npm-shrinkwrap.json with lockfileVersion >= 1.', exit: 1, seconds: 1 },
  ] },
  { command: 'npm test', cases: [
    { when: [{ path: 'src/fares.js', includes: 'children * 60' }], stdout: '> ferry-times@1.4.0 test\n> jest\n\nPASS test/fares.test.js\nTests:       3 passed, 3 total', seconds: 6 },
    { when: [{ path: 'src/tickets.js' }], stdout: '> pier-tickets@0.3.0 test\n> jest\n\nPASS test/tickets.test.js\nTests:       2 passed, 2 total', seconds: 5 },
    { when: [{ path: 'package.json', absent: true }], stderr: NO_PACKAGE, exit: 254, seconds: 1 },
    { stdout: '> ferry-times@1.4.0 test\n> jest\n\nFAIL test/fares.test.js\nTests:       1 failed, 2 passed, 3 total', exit: 1, seconds: 6 },
  ] },
  { command: 'npm run lint', cases: [
    { when: [{ path: 'package.json' }], stdout: '> ferry-times@1.4.0 lint\n> eslint src', seconds: 3 },
    { stderr: NO_PACKAGE, exit: 254, seconds: 1 },
  ] },
];

const lab: TerminalMachine = {
  id: 'cicd04-lab', title: 'yen-laptop（Seabird 渡輪團隊的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'yen-laptop', profile: 'actions',
  timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: YEN, commits: COMMITS,
    remotes: [{ url: FERRY, branches: { main: 'f2' } }, { url: PIER, branches: { main: 'p1' } }],
    repos: [{ path: '/home/learner/ferry-times', origin: FERRY }, { path: '/home/learner/pier-tickets', origin: PIER }],
  },
  forge: { login: 'yen-kao', repos: [
    { url: FERRY, description: 'Timetables and fares for the Seabird ferries', workflowPermissions: 'write' },
    { url: PIER, description: 'Ticket prices for the Seabird piers', permission: 'admin' },
  ] },
  actions: { tools: TOOLS },
};

// Example 3: a new workflow with a misspelt key and a runner label that does not exist.
const DOCS_YML = wf('name: Docs', 'on:', '  push:', '    branches: [main]', 'jobs:', '  words:', '    runs-on: ubuntu-lates', '    stpes:', '      - uses: actions/checkout@v4',
  '      - run: echo "Running on $RUNNER_NAME ($RUNNER_OS)"', '      - run: wc -w docs/guide.md');
// Example 5: a matrix of three Node versions, then a job that needs them all and reads a step output.
const MATRIX_TEST = wf('name: Matrix', 'on: workflow_dispatch', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    strategy:', '      matrix:', '        node: [18, 20, 22]',
  '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: ${{ matrix.node }}', '      - run: npm ci',
  '      - run: npm test');
const VERSION_STEP = ['      - id: meta', '        run: echo "version=$(grep \'"version"\' package.json | cut -d \'"\' -f 4)" >> "$GITHUB_OUTPUT"'];
const MATRIX_PACKAGE = wf('  package:', '    needs: test', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', ...VERSION_STEP,
  '      - run: echo "Packing ferry-times ${{ steps.meta.outputs.version }} for ${{ github.ref_name }}"');

// Exercise 1: CI for pier-tickets.
const PIER_CI = CI_YML.replace('permissions:\n  contents: read\n', '');
const WRITE_PIER = (text: string) => ['cd pier-tickets', 'mkdir -p .github/workflows', heredoc('.github/workflows/ci.yml', text), 'git add .github', "git commit -qm 'Add CI'", 'git push -q'];
// Exercise 2: least privilege for lint.
const LEAST = "sed -i 's/    permissions: write-all/    permissions:\\n      contents: read/' .github/workflows/lint.yml";
const PUSH_LINT = ["git commit -qam 'Least privilege for lint'", 'git push -q'];
// Exercise 3: a package job that needs test and reads its output.
const ci = '.github/workflows/ci.yml';
const OUTPUT_STEP = ['      - id: version', '        run: echo "version=$(grep \'"version"\' package.json | cut -d \'"\' -f 4)" >> "$GITHUB_OUTPUT"'];
const JOB_OUTPUTS = ['    outputs:', '      version: ${{ steps.version.outputs.version }}'];
const PACKAGE_JOB = (needs = true, from = 'needs.test.outputs.version') => ['  package:', ...needs ? ['    needs: test'] : [], '    runs-on: ubuntu-latest', '    steps:',
  `      - run: echo "Packing ferry-times \${{ ${from} }}"`];
const PACKAGE = heredoc(ci, wf(...OUTPUT_STEP, ...JOB_OUTPUTS, ...PACKAGE_JOB()), true);
const PUSH_PACKAGE = ["git commit -qam 'Add the package job'", 'git push -q'];
// Exercise 4: docs-only changes do not run CI.
const IGNORE_DOCS = (pattern: string) => `sed -i 's/    branches: \\[main\\]/&\\n    paths-ignore: ["${pattern.replace(/\//g, '\\/')}"]/' ${ci}`;
const PUSH_FILTER = ["git commit -qam 'Skip CI for docs-only changes'", 'git push -q'];

export const CICD04: LessonContent = {
  lessonId: 'CICD04',
  motivation: '「Bo 上週替 ferry-times 加了三個 workflow，之後每次推送，GitHub 都自動跑測試。可是那些 YAML 裡的 jobs、steps、uses 到底是什麼？為什麼只改一行 README 也要跑一輪測試？Lint 為什麼拿到可以改動整個儲存庫的權限？」CICD03 說明了持續整合的想法：每次整合都自動建置與測試，盡快得到回饋。GitHub Actions 是 GitHub 內建的自動化平台，把這件事寫成儲存庫裡的設定檔，跟著程式碼一起提交、一起審查。這一課在 Seabird 渡輪團隊的模擬終端機裡，讀、寫並推送 workflow 檔案，看 GitHub 真的建立 run，把 job 交給 runner，一個 step 接一個 step 執行；接著控制哪些事件會觸發、job 之間的順序與傳值，讀懂寫錯時的錯誤，最後把 GITHUB_TOKEN 收斂到最小權限，並替新的儲存庫 pier-tickets 建立它的第一條 CI 管線。',
  sections: [
    {
      id: 'cicd04-s-setup', title: '本課的團隊、儲存庫與終端機',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的 Seabird 渡輪公司，程式放在模擬的 GitHub 主機 `github.example` 上。你是 Kao Yen（GitHub 帳號 yen-kao），筆電 yen-laptop 的家目錄裡已經有兩個儲存庫的複本。模擬環境的時鐘是 2026-11-23（星期一）02:00 UTC，也就是台北時間上午 10:00。' },
        { type: 'table', head: ['儲存庫', '內容', '已有的 workflow', '儲存庫預設的 workflow 權限'], rows: [
          ['seabird/ferry-times（~/ferry-times）', '渡輪票價的小型 Node.js 專案，版本 1.4.0；src/ 是程式、test/ 是測試、docs/ 是說明文件', 'ci.yml（CI）、lint.yml（Lint）、notes.yml（Release notes），同事 Tsai Bo 寫的', '寬鬆（write）：沒寫 permissions 的 job 幾乎什麼都能寫'],
          ['seabird/pier-tickets（~/pier-tickets）', '碼頭票價的新專案，有程式與測試，你是管理員', '沒有', '受限（read）'],
        ] },
        { type: 'p', text: 'workflow 檔案是純文字的 YAML，本課在終端機裡用 here-document 寫：`cat > 檔案 <<\'EOF\'` 之後的每一行都寫進檔案，直到單獨一行的 `EOF` 為止。`EOF` 加上單引號很重要，Shell 才會照字面寫入 `$GITHUB_OUTPUT` 與 `${{ }}` 這些文字，而不是先把它們展開。小修改用 `sed -i`（LNX 的課用過）：' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ["`cat > 檔案 <<'EOF'`（多行，最後一行是 `EOF`）", '用這幾行取代整個檔案；`>>` 則是加在檔案最後'],
          ["`sed -i 's/舊/新/' 檔案`、`sed -i '/文字/d' 檔案`", '在檔案裡取代文字、刪除含有某段文字的行；取代的文字裡 `\\n` 是換行、`&` 是原本符合的文字'],
          ['`git add .github`、`git commit -qm 訊息`、`git push -q`', '提交並推送；`-q` 讓輸出精簡，只剩主機回報的那兩行'],
          ['`gh workflow list`、`gh workflow view 檔名`、`gh workflow run 檔名 -f 輸入=值`', '列出 workflow、看某個 workflow 與它最近的 run、手動觸發'],
          ['`gh run list`、`gh run view ID`、`gh run watch ID`、`gh run cancel ID`', '列出 run、看一次 run 的 job 與 step（`--log` 看完整日誌、`--log-failed` 只看失敗的 step）、等它跑完、取消'],
          ['`sleep 秒數`、`date`', '讓模擬的時鐘前進；看現在的時間'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'git 與 gh 的輸出依真實的格式模擬，沒有顏色，也不會互動式提問。模擬環境在推送時就把整個 run 算好，`gh run watch` 讓時鐘直接走到 run 結束，只印最後的畫面（真實的 gh 每 3 秒刷新一次）。run 的 ID 從 4100000001 依序編號。`npm ci`、`npm test` 這類 CI 工具是課程設定好的結果，依工作目錄裡的檔案決定成功或失敗，不是真的 Node.js；runner 的日誌比真實的精簡。為了讓你不離開終端機就看得到原因，`gh run view` 對無效的 workflow 印出完整的錯誤行，真實的 gh 只印第一句，細節在網頁的 Actions 分頁。另外，模擬環境一個指令最多 500 個字元，較長的檔案分兩段寫（第二段用 `>>`）。' },
      ],
    },
    {
      id: 'cicd04-s-anatomy', title: 'workflow 與 job：從檔案到一次 run',
      blocks: [
        { type: 'p', text: 'workflow 是儲存庫裡 `.github/workflows/` 資料夾中的一個 YAML 檔案（副檔名 .yml 或 .yaml）。每當發生一個事件，例如推送或開 Pull Request，GitHub 就讀那個 commit 上的每個 workflow，事件符合 `on:` 的，各建立一次 run（workflow run）。一個 workflow 有一到多個 job；每個 job 在自己的 runner（一台執行的機器）上執行，沒有特別指定時，job 之間同時開始。job 裡面是一串 step，在同一台 runner 上依序執行，共用同一個工作目錄。' },
        { type: 'table', head: ['層級', '在檔案裡', '在 gh 的輸出裡', '說明'], rows: [
          ['workflow', '整個檔案，`name: CI`', '`gh workflow list` 的一列', '定義「什麼時候、做什麼」'],
          ['run', '（檔案裡沒有）', '`gh run list` 的一列，有自己的 ID', '某一次事件觸發的一次執行，結果是 success、failure 或 cancelled'],
          ['job', '`jobs:` 底下的鍵，例如 `test:`（job ID）', '`gh run view` 的 JOBS 下面一行', '在一台 runner 上執行的一組 step；沒有 `needs` 時和其他 job 同時開始'],
          ['step', '`steps:` 清單裡的一項（`- ` 開頭）', 'job 底下縮排的每一行', '一個 action（`uses:`）或一段指令（`run:`），依序執行，前一個失敗就停'],
        ] },
        { type: 'table', head: ['ci.yml 的鍵', '意思'], rows: [
          ['`name: CI`', 'workflow 顯示的名稱；沒寫時用檔案路徑'],
          ['`on:`', '觸發事件：這裡是推送到 main，以及目標是 main 的 Pull Request（第五節）'],
          ['`permissions:`', 'GITHUB_TOKEN 的權限，這裡只有 `contents: read`（第七節）'],
          ['`jobs:` → `test:`', '一個 ID 為 test 的 job；ID 只能用英數字、`-`、`_`，以字母或 `_` 開頭'],
          ['`runs-on: ubuntu-latest`', '要在哪一種 runner 上執行（第四節）'],
          ['`steps:`', '依序執行的步驟：取出程式碼、準備 Node.js 20、`npm ci` 安裝套件、`npm test` 跑測試'],
        ] },
        { type: 'p', text: 'YAML 用縮排表示層級，同一層的鍵要對齊，只能用空白，不能用 Tab；`- ` 開頭的是清單的一項。下面的例子先看 ferry-times 有哪些 workflow 與 ci.yml 的內容，再推送一個只改 README 的 commit。' },
        { type: 'example', id: 'cicd04-first-run' },
        { type: 'p', text: '一次推送建立了兩個 run：ci.yml 與 lint.yml 都寫了「推送到 main 時執行」，notes.yml 沒有寫 push，所以沒有 run。`gh run list` 第一欄的 `*` 是排隊或執行中，`✓` 是成功、`X` 是失敗、`-` 是取消或略過；TITLE 是 commit 的標題。`gh run watch` 等到 run 結束，列出 job test 花了 13 秒，以及每一個 step。除了檔案裡寫的四個 step，GitHub 還自動加上 Set up job（準備 runner、下載用到的 action）、Post Run actions/checkout@v4（checkout 結束時的清理）與 Complete job；沒有寫 `name:` 的 step，顯示成 `Run ` 加上 action 的名稱或指令的第一行。' },
        { type: 'callout', tone: 'tip', title: '一個 workflow 檔案只做一件事', text: '把測試、lint、發布寫在同一個巨大的 workflow 裡也能動，但分成 ci.yml、lint.yml 這樣的幾個檔案，各自有清楚的觸發條件與權限，`gh run list` 一眼就看得出是哪一件事失敗了。反過來，同一件事的幾個 job（例如測試之後才打包）放在同一個 workflow，才能用 `needs` 串起來，因為 `needs` 只能指同一個 workflow 裡的 job。' },
      ],
    },
    {
      id: 'cicd04-s-steps', title: 'step 與 action：uses 與 run',
      blocks: [
        { type: 'p', text: '每個 step 不是 `uses:` 就是 `run:`，兩者不能寫在同一個 step。`run:` 是在 runner 的 Shell 裡執行的指令，和你在終端機打的一樣；`uses:` 引用一個 action，也就是別人包裝好、可以重複使用的一段工作，例如「把這個 commit 的程式碼取出來」或「安裝指定版本的 Node.js」。action 本身也放在 GitHub 的儲存庫裡，寫成 `擁有者/儲存庫@版本`：`actions/checkout@v4` 是 actions/checkout 這個儲存庫標籤為 v4 的版本，GitHub 在 Set up job 時下載它（日誌裡的 `Download action repository`）。action 的參數寫在 `with:` 底下，例如 setup-node 的 `node-version: 20`。' },
        { type: 'table', head: ['寫法', '例子', '說明'], rows: [
          ['`uses: actions/checkout@v4`', '取出觸發這次 run 的 commit 的檔案', '幾乎每個 job 的第一個 step'],
          ['`uses: actions/setup-node@v4` 加 `with: node-version: 20`', '準備 Node.js 20', 'Python 用 `actions/setup-python@v5`；GitHub-hosted runner 上常用的版本多半已經裝好，直接取用'],
          ['`run: npm test`', '在 Shell 執行指令', 'Linux 上沒寫 `shell:` 時以 `bash -e {0}` 執行：有指令失敗就停，但管線中間的失敗不算（沒有 pipefail）；寫 `shell: bash` 則是 `bash --noprofile --norc -eo pipefail {0}`，和 LNX13 的 `set -eo pipefail` 相同'],
          ['`id:`、`name:`、`if:`、`env:`', '給 step 一個 ID、顯示名稱、執行條件、環境變數', '`id` 用來讀這個 step 的輸出（第六節）'],
        ] },
        { type: 'p', text: '`@v4` 這種主版本標籤會跟著 action 的維護者移動到 v4 的最新版，方便但等於信任對方之後的每次更新；第三方的 action 常改用完整的 commit SHA 鎖定版本，CICD08 會再談。真實的 workflow 常用 `run: |` 在一個 step 寫多行指令（每一行是一個指令，預設的 `bash -e` 在第一個失敗的指令就停下），模擬環境也支援；本課為了在終端機裡容易輸入，每個 `run:` 都只寫一行。' },
        { type: 'p', text: 'runner 一開始的工作目錄（`/home/runner/work/ferry-times/ferry-times`）是空的。GitHub 讀 workflow 檔案是在自己的伺服器上，並不會順便把程式碼放到 runner 上，要靠 actions/checkout 取出來。下面的例子在分支上把 checkout 這個 step 刪掉，推送並開 Pull Request，看會發生什麼事。' },
        { type: 'example', id: 'cicd04-no-checkout' },
        { type: 'p', text: '這次觸發的是 `pull_request` 事件（BRANCH 是 PR 的分支 faster-ci，標題行的 `#1` 是 PR 編號）。npm ci 在空的工作目錄找不到 package-lock.json，結束碼 1，step 失敗；它之後的 `Run npm test` 顯示 `-`，因為前一個 step 失敗，後面的 step 不再執行，job 與 run 都是失敗。`gh run view --log-failed` 只印失敗的 step 的日誌，每行是「job 名稱、step 名稱、時間戳記與內容」，用 Tab 隔開，`cut -f 3` 只留第三欄。日誌開頭的 `##[group]Run npm ci`、`shell: /usr/bin/bash -e {0}` 是 runner 印出的步驟資訊，最後的 `##[error]Process completed with exit code 1.` 也是 ANNOTATIONS 裡那一行的來源。' },
        { type: 'callout', tone: 'warning', title: 'workflow 檔案在儲存庫裡，不代表 runner 上有程式碼', text: '常見的誤解是：「workflow 是從儲存庫讀出來的，所以 runner 上當然有儲存庫的檔案。」實際上每個 job 都從一台乾淨的機器開始，工作目錄是空的；少了 actions/checkout，npm ci、npm test、make 這類指令都找不到檔案。這類失敗的訊息往往是「找不到 package.json」「No such file or directory」，而不是直接說「你忘了 checkout」，看到時先檢查 job 的第一個 step。' },
      ],
    },
    {
      id: 'cicd04-s-runner', title: 'runner：job 在哪裡執行',
      blocks: [
        { type: 'p', text: 'runner 是實際執行 job 的機器，上面跑著 GitHub 的 runner 程式：它接下一個 job，依序執行 step，把日誌與結果回報給 GitHub。GitHub-hosted runner 由 GitHub 提供，每個 job 都是一台全新的虛擬機器，預先裝好 git、常用語言與工具，job 結束就丟掉，所以上一個 job 或上一次 run 留下的檔案都不會在（要傳遞檔案用 CICD06 的 artifact 與快取）。self-hosted runner 是團隊自己的機器，裝上 runner 程式後登記到儲存庫或組織，適合需要特殊硬體或內部網路的工作，但機器的安全與清理要自己負責。' },
        { type: 'p', text: '`runs-on` 寫的是 label，GitHub 把 job 交給有這些 label 的 runner。job 開始時，Set up job 的日誌會印出 runner 的版本、作業系統、映像（Runner Image）與這個 job 的 GITHUB_TOKEN 權限；step 裡可以讀到 runner 設定的環境變數，例如 `CI=true`、`RUNNER_OS`、`RUNNER_NAME`、`GITHUB_WORKSPACE`（工作目錄）、`GITHUB_SHA`（這次 run 的 commit）、`GITHUB_REF_NAME`（分支或標籤名稱）。runner 一律使用 UTC 時間。' },
        { type: 'table', head: ['`runs-on`', '意思'], rows: [
          ['`ubuntu-latest`', 'GitHub-hosted 的 Linux runner，目前指向 Ubuntu 24.04；GitHub 會在新版穩定後改變它指向的版本'],
          ['`ubuntu-24.04`、`ubuntu-22.04`', '固定的 Ubuntu 版本，不會隨 latest 改變，適合需要穩定環境的專案'],
          ['`windows-latest`、`macos-latest`', 'Windows 與 macOS 的 runner（本課的模擬環境只有 Ubuntu）'],
          ['`[self-hosted, linux, gpu]`', '清單：要同時有這幾個 label 的 self-hosted runner'],
        ] },
        { type: 'p', text: '寫錯 workflow 時有兩種很不一樣的結果。檔案本身無效（未知的鍵、縮排錯、YAML 語法錯）時，GitHub 在建立 run 時就檢查出來，run 立刻失敗、沒有任何 job，錯誤指出第幾行第幾欄。檔案有效、只是 `runs-on` 的 label 沒有任何 runner 有，GitHub 不會報錯，因為 self-hosted runner 的 label 可以是任何名字，GitHub 無從得知你是不是打錯；job 就一直排隊，等一台永遠不會出現的 runner。下面的例子新增一個計算說明文件字數的 docs.yml，同時犯了這兩個錯。' },
        { type: 'example', id: 'cicd04-broken' },
        { type: 'p', text: '第一次推送，`gh run list` 的 Docs 那一列是 `X`，WORKFLOW 欄顯示檔案路徑而不是名稱，因為 GitHub 讀不懂這個檔案；`gh run view` 說 `This run likely failed because of a workflow file issue.`，並指出第 8 行第 5 欄的 `stpes` 是 job 不認得的鍵（`Unexpected value`）。修好之後的 run 過了 5 分鐘仍然是 `*`，job words 沒有任何 step，因為根本沒有 runner 接手；在真實的 GitHub 上 `gh run watch` 會一直等下去，所以用 `gh run cancel` 取消，狀態變成 `-`。把 label 改成 `ubuntu-latest` 後才真的執行：日誌裡的 `GitHub Actions 1 (Linux)` 來自 `$RUNNER_NAME` 與 `$RUNNER_OS`。最後一段是 Set up job 的 GITHUB_TOKEN Permissions 群組：docs.yml 沒有寫 permissions，ferry-times 的預設又是寬鬆的，於是這個只需要讀文件的 job 拿到了幾乎全部的 write 權限，第七節處理它。' },
        { type: 'callout', tone: 'warning', title: '打錯 runs-on 不會有錯誤訊息', text: '很多人以為 GitHub 會像檢查 `stpes` 一樣檢查 `runs-on`，打錯就報錯。實際上 `ubuntu-lates` 是一個完全合法的 label 名稱，GitHub 只是找不到有這個 label 的 runner，job 安靜地停在 queued（網頁上是 Waiting for a runner to pick up this job），依賴它的 job 也不會開始。run 一直沒有結束、job 底下一個 step 都沒有時，先檢查 `runs-on`。' },
      ],
    },
    {
      id: 'cicd04-s-triggers', title: '觸發事件：什麼時候執行',
      blocks: [
        { type: 'p', text: '`on:` 列出觸發事件，可以寫成一個字串（`on: push`）、一個清單（`on: [push, pull_request]`），或像 ci.yml 一樣寫成對照表，在每個事件底下加篩選條件。本課用到的四種事件：' },
        { type: 'table', head: ['事件', '什麼時候', '常用的設定'], rows: [
          ['`push`', '推送 commit 或標籤到 GitHub', '`branches`／`branches-ignore`、`tags`／`tags-ignore`、`paths`／`paths-ignore`'],
          ['`pull_request`', 'Pull Request 開啟、有新的 commit、重新開啟（預設的 `types` 是 opened、synchronize、reopened）', '`branches` 比對的是 PR 的目標（base）分支；run 執行在 GitHub 為 PR 建立的測試合併 commit（`refs/pull/編號/merge`）上，測的是「合併之後」的樣子'],
          ['`workflow_dispatch`', '有人手動觸發：網頁上的 Run workflow 按鈕、`gh workflow run`', '`inputs`：輸入的型別（string、boolean、choice、number、environment）、預設值、是否必填'],
          ['`schedule`', '依 cron 的時間定期執行', '一串 `- cron: \'分 時 日 月 星期\'`，一律是 UTC，只在預設分支上執行'],
        ] },
        { type: 'p', text: '篩選條件是 GitHub 自己的樣式，不是 Shell 的 glob：`*` 符合不含 `/` 的任意字元，`**` 可以跨過 `/`，開頭的 `!` 表示排除。分支篩選與路徑篩選要同時滿足才執行。`paths` 是「變更的檔案中有任何一個符合就執行」，`paths-ignore` 是「變更的檔案全部被忽略才不執行」；同一個事件 `paths` 與 `paths-ignore` 只能擇一（`branches` 與 `branches-ignore` 也是）。' },
        { type: 'table', head: ['樣式', '符合', '不符合'], rows: [
          ['`main`', '分支 main', 'main-v2、feature/main'],
          ['`release/**`', 'release/1.4、release/2026/spring', 'release（沒有斜線之後的部分）'],
          ['`docs/**`', 'docs/guide.md、docs/maps/pier-2.png', 'README.md、src/docs.js'],
          ['`*.md`', 'README.md（最上層）', 'docs/guide.md（`*` 不跨過 `/`）'],
          ['`**.md`', '任何深度的 .md：README.md、docs/guide.md', 'docs/guide.txt'],
        ] },
        { type: 'p', text: '只寫 `on: push` 沒有任何篩選時，推送到任何分支、推送任何標籤都會執行。寫成 `on: [push, pull_request]` 更常見的副作用是重複：在同一個儲存庫的分支上開了 PR，之後每次推送都跑兩次，一次是 push、一次是 pull_request。ci.yml 的寫法「push 只看 main，pull_request 只看目標是 main 的」讓每個變更在 PR 裡測一次（合併後的樣子），合併進 main 後再測一次。' },
        { type: 'p', text: '`workflow_dispatch` 讓人手動執行，例如重新產生文件或發布。輸入用 `gh workflow run notes.yml -f channel=stable` 給（`--ref 分支` 指定用哪個分支上的版本執行；workflow 檔案要先在預設分支上，GitHub 才認得它），在 workflow 裡以 `${{ inputs.channel }}` 讀取；choice 型別的值不在 `options` 裡時，GitHub 以 HTTP 422 拒絕，不會建立 run。`schedule` 的 cron 和 LNX14 的 crontab 一樣是五個欄位：分、時、日、月、星期（0 是星期日），差別在一律以 UTC 計時、只用預設分支最新的 commit。notes.yml 的 `\'0 3 * * 1-5\'` 是每個平日 03:00 UTC，台北（UTC+8）的上午 11:00。排程不保證準時，GitHub 忙碌時可能延遲；最短間隔是 5 分鐘；公開儲存庫 60 天沒有任何活動時，排程的 workflow 會被自動停用。' },
        { type: 'example', id: 'cicd04-triggers' },
        { type: 'p', text: '手動觸發的 run 在 02:00 UTC 立刻建立，step 裡的 `${{ inputs.channel || \'beta\' }}` 被換成 stable；`nightly` 不在選項裡，被 422 拒絕。`date` 顯示筆電上是台北時間 10:00（CST 是台灣的時區縮寫）。讓時鐘走過一小時之後，`gh run list` 多了一個 EVENT 為 schedule 的 run：它在 03:00 UTC 執行，runner 上的 `date -u` 印出 03:00:04 UTC。排程觸發時沒有輸入，`inputs.channel` 是空字串，`||` 讓它退回 beta，這是讓同一個 workflow 同時支援手動與排程的常見寫法。' },
        { type: 'callout', tone: 'warning', title: 'cron 的時間是 UTC，不是你的時區', text: '想在台北時間每天早上 9 點執行，寫成 `\'0 9 * * *\'` 是最常見的錯誤：它是 09:00 UTC，台北時間下午 5 點才執行。要先換算成 UTC：台北比 UTC 快 8 小時，早上 9 點是 `\'0 1 * * *\'`。換算時注意日期與星期也可能跟著跨日，例如台北的星期一上午 7 點，是 UTC 的星期日 23 點。' },
      ],
    },
    {
      id: 'cicd04-s-jobs', title: '多個 job：needs、matrix、輸出與運算式',
      blocks: [
        { type: 'p', text: '同一個 workflow 的 job 預設同時開始，各自在不同的 runner 上執行。要有先後順序時寫 `needs`：`needs: test`（或清單 `needs: [test, lint]`）表示等那些 job 都成功才開始；它們有任何一個失敗，這個 job 就被略過（skipped）。matrix 則是把一個 job 展開成多個：`strategy.matrix.node: [18, 20, 22]` 產生 `test (18)`、`test (20)`、`test (22)` 三個 job，step 裡以 `${{ matrix.node }}` 讀到各自的值，常用來在幾個語言版本或作業系統上跑同一組測試。`fail-fast` 預設開啟：其中一個失敗時，還沒結束的其他組合會被取消。依賴 matrix job 的 job，要等所有組合都成功。' },
        { type: 'p', text: '`${{ }}` 是運算式。GitHub 在執行 step 之前，先把裡面的運算式算出來，以文字換回原處，Shell 看到的已經是換好的指令；`if:` 的值整個是運算式，可以不寫 `${{ }}`，例如 `if: github.event_name == \'push\'`。運算式能讀的資料叫 context：' },
        { type: 'table', head: ['context', '內容', '例子'], rows: [
          ['`github`', '這次 run 的事件資訊', '`github.ref_name`（分支名稱）、`github.sha`、`github.event_name`'],
          ['`inputs`', 'workflow_dispatch 的輸入', '`inputs.channel`'],
          ['`matrix`', '這個 matrix job 的組合', '`matrix.node`'],
          ['`steps`', '同一個 job 裡，前面有 `id` 的 step', '`steps.meta.outputs.version`'],
          ['`needs`', '`needs` 列出的 job 的結果與輸出', '`needs.test.result`、`needs.test.outputs.version`'],
          ['`env`、`runner`、`secrets`', '環境變數、runner 的資訊、秘密值', '`runner.os`、`secrets.GITHUB_TOKEN`'],
        ] },
        { type: 'p', text: 'step 要把值交給後面的 step，就以 `名稱=值` 的格式附加到 `$GITHUB_OUTPUT` 這個檔案（runner 替每個 step 準備的），並給 step 一個 `id`；同一個 job 之後的 step 用 `steps.<id>.outputs.<名稱>` 讀取。不同的 job 在不同的 runner 上，值不會自動過去：產生值的 job 要在 `outputs:` 公開它（例如 `version: ${{ steps.meta.outputs.version }}`），使用的 job 以 `needs` 依賴它，再讀 `needs.<job>.outputs.<名稱>`。輸出適合版本號、標籤這類短字串；檔案要用 artifact（CICD06）。' },
        { type: 'p', text: '下面的例子新增 matrix.yml：test 在三個 Node.js 版本上各跑一次，package 以 `needs: test` 等它們全部成功，再從 package.json 讀出版本寫進 `$GITHUB_OUTPUT`，下一個 step 讀出來印出。檔案超過 500 個字元，分兩段寫，第二段用 `>>` 附加。' },
        { type: 'example', id: 'cicd04-matrix' },
        { type: 'p', text: '三個 test job 同時開始、各花 13 秒，package 在它們都結束後才開始。日誌顯示代換的時機：`##[group]Run echo "Packing ferry-times 1.4.0 for main"` 是 runner 準備執行的指令，`${{ steps.meta.outputs.version }}` 與 `${{ github.ref_name }}` 在 Bash 執行之前就已經換成 1.4.0 與 main；`gh run watch` 列出的 step 名稱則是檔案裡的原文。' },
        { type: 'callout', tone: 'warning', title: '${{ }} 是文字代換，不是變數', text: '因為運算式在 Shell 之前就換成文字，把別人能控制的內容（例如 Pull Request 的標題 `${{ github.event.pull_request.title }}`）直接寫進 `run:`，對方就能在標題裡放一段指令讓 runner 執行，這叫 script injection。安全的做法是先放進 step 的 `env:`（例如 `TITLE: ${{ github.event.pull_request.title }}`），在指令裡以 `"$TITLE"` 讀取，CICD08 會完整示範。' },
      ],
    },
    {
      id: 'cicd04-s-perms', title: '最小權限：GITHUB_TOKEN 的 permissions',
      blocks: [
        { type: 'p', text: '每個 job 開始時，GitHub 自動產生一個 GITHUB_TOKEN（在運算式裡是 `secrets.GITHUB_TOKEN`），只對這個儲存庫有效，job 結束就失效。actions/checkout 預設用它取出程式碼，step 裡的 gh 等工具也能用它呼叫 GitHub 的 API。它能做什麼，由 `permissions` 決定：每個範圍可以是 `read`、`write` 或 `none`，`metadata` 一律是 read。' },
        { type: 'table', head: ['範圍', 'write 能做什麼', '誰需要'], rows: [
          ['`contents`', '推送 commit 與標籤、建立 release（read：讀程式碼）', '幾乎每個 job 都要 read；發布的 job 才要 write'],
          ['`pull-requests`', '在 Pull Request 留言、加標籤、改狀態', '自動留言測試報告的 job'],
          ['`issues`', '建立、修改、關閉 issue', '自動整理 issue 的 job'],
          ['`packages`', '發布套件與容器映像到 GitHub 的套件庫', '發布映像的 job（CICD06）'],
          ['`id-token`', '向雲端換取短期憑證（OIDC）', '部署到雲端的 job（CICD09）'],
          ['`actions`、`checks`、`statuses`、`deployments` 等', '管理 run、檢查結果、部署紀錄', '少數特定的工具'],
        ] },
        { type: 'p', text: '有效權限的規則：job 有自己的 `permissions` 就用 job 的；沒有時用 workflow 層的；兩者都沒有時用儲存庫的預設。三者不合併，下一層完全取代上一層。只要寫出任何一個範圍，沒寫到的範圍都是 none；另外有三個簡寫：`read-all`（全部 read）、`write-all`（全部 write）、`{}`（全部 none）。儲存庫的預設有兩種：受限（contents 與 packages 是 read，較新的儲存庫與組織預設如此）與寬鬆（幾乎全部 write，較早建立的儲存庫常是這樣）。' },
        { type: 'table', head: ['ferry-times 的 job', '寫法', '有效權限（Set up job 印出的）'], rows: [
          ['ci.yml 的 test', 'workflow 層 `permissions: contents: read`，job 沒寫', 'Contents: read、Metadata: read'],
          ['lint.yml 的 lint', 'job 層 `permissions: write-all`', '每個範圍都是 write'],
          ['docs.yml 的 words、notes.yml 的 notes', '都沒寫', '儲存庫的預設：寬鬆，幾乎全部 write（第四節例子的最後一段）'],
        ] },
        { type: 'p', text: '為什麼要收斂？token 在 job 執行期間就在 runner 上，任何一個 step 都拿得到：`npm ci` 安裝的上百個套件的安裝指令稿、你引用的第三方 action、被 script injection 塞進來的指令。如果 token 有 contents: write，其中任何一個被入侵或被惡意更新，就能直接推送程式碼到你的分支、建立假的 release。最小權限的做法是：在 workflow 層寫 `permissions: contents: read` 當作預設，真的需要更多的 job（例如發布的 job 要 `contents: write`）在 job 層另外寫，並且只寫它需要的範圍。改完之後，看 Set up job 的 GITHUB_TOKEN Permissions 群組確認：`gh run view ID --log | grep -A 16 \'GITHUB_TOKEN Permissions\'`。' },
        { type: 'callout', tone: 'warning', title: 'workflow 層的 contents: read 擋不住 job 層的 write-all', text: '常見的誤解是權限會「合併」或「取最嚴格的」：以為在 workflow 最上面加了 `permissions: contents: read`，整個 workflow 就安全了。實際上 job 自己有 `permissions` 時完全取代 workflow 層，lint.yml 的 job lint 寫了 `write-all`，它就仍然拿到全部 write。反過來，job 層只寫 `issues: write` 時，連 contents 都變成 none，需要 checkout 的話要一起寫 `contents: read`。' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的權限', text: '本課的模擬環境把有效權限印在 Set up job 的日誌裡，並由練習的檢查讀取，但不會因為權限不足讓 step 失敗；從 runner 推送、發布這些用到 write 權限的動作，在之後的課程才會出現。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd04-q-jobs', prompt: '一個 workflow 有 build 與 test 兩個 job，test 寫了 `needs: build`。build 在工作目錄產生了 dist/ 資料夾，test 的 step 卻找不到 dist/。原因是什麼？',
      options: ['`needs` 只保證順序，沒有讓 test 等 build 的檔案寫完', '每個 job 在各自全新的 runner 上執行，build 的檔案不會出現在 test 的機器上', 'dist/ 被 .gitignore 排除了，所以 actions/checkout 在取出程式碼時把它刪掉', 'test 的 step 是平行執行的，讀 dist/ 的那個 step 在其他 step 之前就跑完了'],
      answer: 1,
      explanation: 'GitHub-hosted runner 每個 job 都是一台新的機器，job 之間不共用檔案系統，要傳檔案得用 artifact，短的值用 job 的輸出。`needs` 確實讓 test 在 build 成功後才開始，問題不在順序；.gitignore 只影響提交，dist/ 是在 build 的 runner 上產生的，test 的 checkout 本來就不會有它；同一個 job 的 step 依序執行，不是平行。',
    },
    {
      id: 'cicd04-q-push', prompt: 'workflow 只寫了 `on: push`。同事先在分支 try-colors 推送了一個 commit，又推送了標籤 v1.5.0。workflow 會執行幾次？',
      options: ['0 次：沒有寫 branches 時，只有推送到預設分支 main 才會執行', '1 次：分支的推送會執行，標籤要另外寫 tags 才會觸發', '0 次：還要加上 workflow_dispatch 才會自動執行', '2 次：沒有篩選的 push 涵蓋所有分支與標籤的推送'],
      answer: 3,
      explanation: '`push` 事件在推送 commit 或標籤時觸發，沒有任何篩選就是全部分支與全部標籤，所以兩次推送各執行一次，這也是只寫 `on: push` 常讓 CI 跑太多的原因。沒有 branches 不等於只看預設分支；標籤篩選只在寫了篩選時才有作用；workflow_dispatch 是手動觸發，和推送無關。',
    },
    {
      id: 'cicd04-q-label', prompt: '你把 `runs-on` 寫成 `ubuntu-lates` 並推送，`gh run list` 過了十分鐘還是 `*`，`gh run view` 裡 job 底下一個 step 都沒有。最可能的原因是什麼？',
      options: ['沒有 runner 有這個 label，job 一直在排隊', 'GitHub 驗證 workflow 時發現 label 拼錯了，run 停在驗證階段，等你在網頁上確認之後才會繼續', 'ubuntu-lates 是一個較舊的映像，GitHub 要先把它下載到 runner 上，所以要等比較久', '所有的 runner 都在忙別的儲存庫的 job，輪到這個 job 時就會開始執行'],
      answer: 0,
      explanation: 'label 可以是任何名字（self-hosted runner 的 label 由團隊自訂），GitHub 不會把打錯的 label 當成錯誤，只是找不到有這個 label 的 runner，job 就停在 queued。如果是檔案無效，run 會立刻失敗而不是一直等；GitHub 沒有 ubuntu-lates 這個映像，也不會下載它；GitHub-hosted runner 忙碌造成的排隊通常很短，而且拼對的 label 不會無限期等待。',
    },
    {
      id: 'cicd04-q-perms', prompt: 'workflow 最上層寫了 `permissions:` 與 `contents: read`，job triage 自己寫了 `permissions:` 與 `issues: write`。triage 的 GITHUB_TOKEN 有哪些權限？',
      options: ['contents: read 與 issues: write，兩層的設定合併在一起', '只有 contents: read，因為 workflow 層的設定比較嚴格，會優先套用到每個 job', 'issues: write 與一律有的 metadata: read，contents 是 none', '儲存庫預設的權限，再加上 issues: write'],
      answer: 2,
      explanation: 'job 有自己的 `permissions` 時完全取代 workflow 層，不會合併；寫出的範圍之外都是 none，只有 metadata 一律是 read。所以 triage 只有 issues: write 與 metadata: read，如果它還要 checkout，必須在 job 層一起寫 `contents: read`。權限不是取最嚴格的那一層，也不會回頭加上儲存庫的預設。',
    },
    {
      id: 'cicd04-q-cron', prompt: 'notes.yml 要改成在台北時間（UTC+8）每個平日上午 9:00 執行。`schedule` 的 cron 應該寫成哪一個？',
      options: ["`'0 9 * * 1-5'`", "`'0 17 * * 1-5'`", "`'9 0 * * 1-5'`", "`'0 1 * * 1-5'`"],
      answer: 3,
      explanation: 'GitHub 的 schedule 一律以 UTC 計時，台北上午 9:00 是 01:00 UTC，五個欄位依序是分、時、日、月、星期，所以是 `0 1 * * 1-5`。`0 9` 是 09:00 UTC，台北下午 5 點；`0 17` 是 17:00 UTC，台北隔天凌晨 1 點；`9 0` 是 00:09 UTC，台北上午 8:09。',
    },
    {
      id: 'cicd04-q-uses', prompt: '關於 `- uses: actions/checkout@v4` 與 `- run: npm test` 這兩個 step，哪一個說法正確？',
      options: ['uses 執行 action（checkout 的 v4 版）；run 在 runner 上執行 Shell 指令', 'uses 只是宣告依賴，真正取出程式碼的是 runner 在 job 開始時自動做的 git clone', '@v4 指定 runner 使用第 4 版的 Ubuntu 映像，和 action 本身的版本沒有關係', 'run 的指令在 GitHub 的伺服器上執行，只有 uses 引用的 action 才會在 runner 上執行'],
      answer: 0,
      explanation: '`uses` 引用一個 action，格式是 `擁有者/儲存庫@版本`，GitHub 在 Set up job 下載 actions/checkout 的 v4 版，由它把 commit 的檔案取進工作目錄；`run` 是在 runner 上以 Bash 執行的指令。runner 不會自動 clone 儲存庫，所以少了 checkout 工作目錄是空的；`@v4` 是 action 的版本，映像由 `runs-on` 決定；兩種 step 都在 runner 上執行。',
    },
    {
      id: 'cicd04-q-output', prompt: 'job test 裡 id 為 meta 的 step 把 `version=1.4.0` 寫進了 `$GITHUB_OUTPUT`。另一個 job publish 要用這個版本，還需要哪些設定？',
      options: ['不用其他設定，在 publish 裡直接寫 `${{ steps.meta.outputs.version }}` 就讀得到', '把 version 改寫進 `$GITHUB_ENV`，之後同一個 workflow 裡的所有 job 都會有這個環境變數可以直接讀取', 'test 的 job outputs 加上 `needs: test`，讀 `needs.test.outputs.version`', 'publish 用 actions/checkout 取出 test 的工作目錄，再從那裡讀版本'],
      answer: 2,
      explanation: '`steps` context 只包含同一個 job 的 step，值要跨 job 必須先由 test 的 `outputs:` 公開，publish 以 `needs: test` 依賴它，才能讀 `needs.test.outputs.version`，`needs` 也保證 publish 在 test 之後執行。`$GITHUB_ENV` 只影響同一個 job 之後的 step；checkout 取出的是 commit 的檔案，不是另一台 runner 的工作目錄。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd04-first-run', title: '一次推送，兩個 workflow 的 run', machine: 'cicd04-lab',
        description: '列出 ferry-times 的 workflow，讀 ci.yml，推送一個 README 的修改：CI 與 Lint 各建立一個 run，gh run watch 等 CI 跑完，看 job 與每個 step。',
        steps: [
          { command: 'cd ferry-times', output: '' },
          { command: 'gh workflow list', output: 'NAME           STATE   ID\nCI             active  992441863\nLint           active  382175808\nRelease notes  active  709657341' },
          { command: 'cat .github/workflows/ci.yml', output: 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm test' },
          { command: "echo 'Ferries leave from Pier 2.' >> README.md", output: '' },
          { command: "git commit -qam 'Mention Pier 2'", output: '' },
          { command: 'git push', output: 'To https://github.example/seabird/ferry-times.git\n   113300f..d5360d5  main -> main' },
          { command: 'gh run list', output: 'STATUS  TITLE           WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n*       Mention Pier 2  Lint      main    push   4100000002  0s       less than a minute ago\n*       Mention Pier 2  CI        main    push   4100000001  0s       less than a minute ago' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main CI · 4100000001\nTriggered via push less than a minute ago\n\nJOBS\n✓ test in 13s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  ✓ Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run CI (4100000001) completed with \'success\'' },
        ],
      },
      {
        id: 'cicd04-no-checkout', title: '少了 checkout 的 Pull Request', machine: 'cicd04-lab',
        description: '在分支上刪掉 actions/checkout 這個 step 並開 Pull Request：pull_request 事件觸發 CI，工作目錄是空的，npm ci 找不到 package-lock.json 而失敗。',
        steps: [
          { command: 'cd ferry-times', output: '' },
          { command: 'git switch -c faster-ci', output: 'Switched to a new branch \'faster-ci\'' },
          { command: "sed -i '/actions\\/checkout/d' .github/workflows/ci.yml", output: '' },
          { command: 'git diff', output: 'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\nindex ec8c99c..a155426 100644\n--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -10,7 +10,6 @@ jobs:\n   test:\n     runs-on: ubuntu-latest\n     steps:\n-      - uses: actions/checkout@v4\n       - uses: actions/setup-node@v4\n         with:\n           node-version: 20' },
          { command: "git commit -qam 'Skip the checkout step'", output: '' },
          { command: 'git push -q -u origin faster-ci', output: 'remote: \nremote: Create a pull request for \'faster-ci\' on GitHub by visiting:\nremote:      https://github.example/seabird/ferry-times/pull/new/faster-ci\nremote: \nTo https://github.example/seabird/ferry-times.git\n * [new branch]      faster-ci -> faster-ci\nbranch \'faster-ci\' set up to track \'origin/faster-ci\'.' },
          { command: "gh pr create --title 'Skip the checkout step' --body 'Saves a second per run.'", output: '\nCreating pull request for faster-ci into main in seabird/ferry-times\n\nhttps://github.example/seabird/ferry-times/pull/1' },
          { command: 'gh run list', output: 'STATUS  TITLE                   WORKFLOW  BRANCH     EVENT         ID          ELAPSED  AGE\n*       Skip the checkout step  Lint      faster-ci  pull_request  4100000002  0s       less than a minute ago\n*       Skip the checkout step  CI        faster-ci  pull_request  4100000001  0s       less than a minute ago' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX faster-ci CI #1 · 4100000001\nTriggered via pull_request less than a minute ago\n\nJOBS\nX test in 3s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/setup-node@v4\n  X Run npm ci\n  - Run npm test\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\ntest: .github#3\n\nX Run CI (4100000001) completed with \'failure\'' },
          { command: 'gh run view 4100000001 --log-failed | cut -f 3', output: '2026-11-23T02:00:04.0000000Z ##[group]Run npm ci\n2026-11-23T02:00:04.0000000Z npm ci\n2026-11-23T02:00:04.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-23T02:00:04.0000000Z ##[endgroup]\n2026-11-23T02:00:05.0000000Z npm error code EUSAGE\n2026-11-23T02:00:05.0000000Z npm error\n2026-11-23T02:00:05.0000000Z npm error The `npm ci` command can only install with an existing package-lock.json or\n2026-11-23T02:00:05.0000000Z npm error npm-shrinkwrap.json with lockfileVersion >= 1.\n2026-11-23T02:00:05.0000000Z ##[error]Process completed with exit code 1.' },
        ],
      },
      {
        id: 'cicd04-broken', title: '無效的 workflow 與等不到的 runner', machine: 'cicd04-lab',
        description: '新的 docs.yml 有兩個錯字：stpes 讓檔案無效，run 立刻失敗；修好之後 ubuntu-lates 沒有 runner，job 一直 queued。取消、改成 ubuntu-latest 才跑完，最後看 Set up job 印出的 GITHUB_TOKEN 權限。',
        steps: [
          { command: 'cd ferry-times', output: '' },
          { command: heredoc('.github/workflows/docs.yml', DOCS_YML), output: '' },
          { command: 'git add .github', output: '' },
          { command: "git commit -qm 'Count the words in the guide'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/seabird/ferry-times.git\n   113300f..9c31439  main -> main' },
          { command: 'gh run list', output: 'STATUS  TITLE                         WORKFLOW                    BRANCH  EVENT  ID          ELAPSED  AGE\n*       Count the words in the guide  Lint                        main    push   4100000003  0s       less than a minute ago\nX       Count the words in the guide  .github/workflows/docs.yml  main    push   4100000002  0s       less than a minute ago\n*       Count the words in the guide  CI                          main    push   4100000001  0s       less than a minute ago' },
          { command: 'gh run view 4100000002', output: 'X main .github/workflows/docs.yml · 4100000002\nTriggered via push less than a minute ago\n\nX This run likely failed because of a workflow file issue.\n\n  Invalid workflow file: .github/workflows/docs.yml#L8\n  The workflow is not valid. .github/workflows/docs.yml (Line: 8, Col: 5): Unexpected value \'stpes\'\n\nFor more information, see: https://github.example/seabird/ferry-times/actions/runs/4100000002' },
          { command: "sed -i 's/stpes:/steps:/' .github/workflows/docs.yml", output: '' },
          { command: "git commit -qam 'Fix the steps key'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/seabird/ferry-times.git\n   9c31439..9317a92  main -> main' },
          { command: 'sleep 300', output: '' },
          { command: 'gh run list -w docs.yml', output: 'STATUS  TITLE                         WORKFLOW                    BRANCH  EVENT  ID          ELAPSED  AGE\n*       Fix the steps key             Docs                        main    push   4100000005  5m0s     about 5 minutes ago\nX       Count the words in the guide  .github/workflows/docs.yml  main    push   4100000002  0s       about 5 minutes ago' },
          { command: 'gh run view 4100000005', output: '* main Docs · 4100000005\nTriggered via push about 5 minutes ago\n\nJOBS\n* words (ID 11300000004)\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/seabird/ferry-times/actions/runs/4100000005' },
          { command: 'gh run cancel 4100000005', output: '✓ Request to cancel workflow 4100000005 submitted.' },
          { command: "sed -i 's/ubuntu-lates$/ubuntu-latest/' .github/workflows/docs.yml", output: '' },
          { command: "git commit -qam 'Use an existing runner label'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/seabird/ferry-times.git\n   9317a92..431e553  main -> main' },
          { command: 'gh run watch 4100000008', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main Docs · 4100000008\nTriggered via push less than a minute ago\n\nJOBS\n✓ words in 2s (ID 11300000007)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run echo "Running on $RUNNER_NAME ($RUNNER_OS)"\n  ✓ Run wc -w docs/guide.md\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run Docs (4100000008) completed with \'success\'' },
          { command: "gh run view 4100000008 --log | grep -E 'Actions 1|[0-9] docs' | cut -f 3", output: '2026-11-23T02:05:04.0000000Z Running on GitHub Actions 1 (Linux)\n2026-11-23T02:05:04.0000000Z 8 docs/guide.md' },
          { command: "gh run view 4100000008 --log | grep -A 16 'GITHUB_TOKEN Permissions' | cut -f 3", output: '2026-11-23T02:05:02.0000000Z ##[group]GITHUB_TOKEN Permissions\n2026-11-23T02:05:02.0000000Z Actions: write\n2026-11-23T02:05:02.0000000Z Attestations: write\n2026-11-23T02:05:02.0000000Z Checks: write\n2026-11-23T02:05:02.0000000Z Contents: write\n2026-11-23T02:05:02.0000000Z Deployments: write\n2026-11-23T02:05:02.0000000Z Discussions: write\n2026-11-23T02:05:02.0000000Z Issues: write\n2026-11-23T02:05:02.0000000Z Metadata: read\n2026-11-23T02:05:02.0000000Z Packages: write\n2026-11-23T02:05:02.0000000Z Pages: write\n2026-11-23T02:05:02.0000000Z PullRequests: write\n2026-11-23T02:05:02.0000000Z RepositoryProjects: write\n2026-11-23T02:05:02.0000000Z SecurityEvents: write\n2026-11-23T02:05:02.0000000Z Statuses: write\n2026-11-23T02:05:02.0000000Z ##[endgroup]\n2026-11-23T02:05:02.0000000Z Secret source: Actions' },
        ],
      },
      {
        id: 'cicd04-triggers', title: '手動觸發與排程', machine: 'cicd04-lab',
        description: 'notes.yml 可以手動觸發（輸入 channel 只能是 beta 或 stable），也在平日 03:00 UTC 排程執行：用 gh workflow run -f 給輸入，再讓時鐘走過 11:00（台北時間），看排程建立的 run。',
        steps: [
          { command: 'cd ferry-times', output: '' },
          { command: 'cat .github/workflows/notes.yml', output: 'name: Release notes\non:\n  workflow_dispatch:\n    inputs:\n      channel:\n        type: choice\n        options: [beta, stable]\n        default: beta\n  schedule:\n    - cron: \'0 3 * * 1-5\'\njobs:\n  notes:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo "Release notes for the ${{ inputs.channel || \'beta\' }} channel"\n      - run: date -u' },
          { command: 'gh workflow run notes.yml -f channel=stable', output: '✓ Created workflow_dispatch event for notes.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="notes.yml"' },
          { command: 'gh workflow run notes.yml -f channel=nightly', output: 'could not create workflow dispatch event: HTTP 422: Provided value \'nightly\' for input \'channel\' not in the list of allowed values (https://github.example/api/v3/repos/seabird/ferry-times/actions/workflows/709657341/dispatches)' },
          { command: 'sleep 30', output: '' },
          { command: "gh run view 4100000001 --log | grep 'for the stable' | cut -f 3", output: '2026-11-23T02:00:04.0000000Z ##[group]Run echo "Release notes for the stable channel"\n2026-11-23T02:00:04.0000000Z echo "Release notes for the stable channel"\n2026-11-23T02:00:04.0000000Z Release notes for the stable channel' },
          { command: 'date', output: 'Mon Nov 23 10:00:30 CST 2026' },
          { command: 'sleep 3600', output: '' },
          { command: 'gh run list -w notes.yml', output: 'STATUS  TITLE          WORKFLOW       BRANCH  EVENT              ID          ELAPSED  AGE\n✓       Release notes  Release notes  main    schedule           4100000002  4s       less than a minute ago\n✓       Release notes  Release notes  main    workflow_dispatch  4100000001  4s       about 1 hour ago' },
          { command: "gh run view 4100000002 --log | grep -E 'for the|UTC 2026$' | cut -f 3", output: '2026-11-23T03:00:04.0000000Z ##[group]Run echo "Release notes for the beta channel"\n2026-11-23T03:00:04.0000000Z echo "Release notes for the beta channel"\n2026-11-23T03:00:04.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-23T03:00:04.0000000Z ##[endgroup]\n2026-11-23T03:00:04.0000000Z Release notes for the beta channel\n2026-11-23T03:00:04.0000000Z Mon Nov 23 03:00:04 UTC 2026' },
        ],
      },
      {
        id: 'cicd04-matrix', title: 'matrix、needs 與 step 的輸出', machine: 'cicd04-lab',
        description: 'matrix.yml 用三個 Node.js 版本各跑一次測試，package 以 needs 等它們全部成功，再把 package.json 的版本寫進 GITHUB_OUTPUT，下一個 step 以 steps.meta.outputs.version 讀出來。',
        steps: [
          { command: 'cd ferry-times', output: '' },
          { command: heredoc('.github/workflows/matrix.yml', MATRIX_TEST), output: '' },
          { command: heredoc('.github/workflows/matrix.yml', MATRIX_PACKAGE, true), output: '' },
          { command: 'git add .github', output: '' },
          { command: "git commit -qm 'Test on three Node versions'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/seabird/ferry-times.git\n   113300f..b76d343  main -> main' },
          { command: 'gh workflow run matrix.yml', output: '✓ Created workflow_dispatch event for matrix.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="matrix.yml"' },
          { command: 'gh run watch 4100000003', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main Matrix · 4100000003\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n✓ test (18) in 13s (ID 11300000003)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  ✓ Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n✓ test (20) in 13s (ID 11300000004)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  ✓ Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n✓ test (22) in 13s (ID 11300000005)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  ✓ Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n✓ package in 2s (ID 11300000006)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run echo "version=$(grep \'"version"\' package.json | cut -d \'"\' -f 4)" >> "$GITHUB_OUTPUT"\n  ✓ Run echo "Packing ferry-times ${{ steps.meta.outputs.version }} for ${{ github.ref_name }}"\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run Matrix (4100000003) completed with \'success\'' },
          { command: "gh run view 4100000003 --log | grep 'Packing' | cut -f 3", output: '2026-11-23T02:00:19.0000000Z ##[group]Run echo "Packing ferry-times 1.4.0 for main"\n2026-11-23T02:00:19.0000000Z echo "Packing ferry-times 1.4.0 for main"\n2026-11-23T02:00:19.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-23T02:00:19.0000000Z ##[endgroup]\n2026-11-23T02:00:19.0000000Z Packing ferry-times 1.4.0 for main' },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd04-ex-ci', title: '替 pier-tickets 寫第一條 CI', machine: 'cicd04-lab',
        statement: 'pier-tickets 還沒有任何 workflow。在 ~/pier-tickets 建立 `.github/workflows/ci.yml`（name 為 CI）：推送到 main，以及目標是 main 的 Pull Request 時執行；其他分支的推送與 Pull Request 不執行。workflow 有一個 job，ID 為 test，在 ubuntu-latest 上依序取出程式碼（actions/checkout@v4）、準備 Node.js 20（actions/setup-node@v4）、`npm ci`、`npm test`。提交、推送到 main，等 run 跑完並且成功。',
        checks: [
          { kind: 'workflow', repo: PIER, path: '.github/workflows/ci.yml', on: { ref: 'main', paths: ['src/tickets.js'], events: ['push', 'pull_request'] } },
          { kind: 'workflow', repo: PIER, path: '.github/workflows/ci.yml', on: { ref: 'zone-prices', paths: ['src/tickets.js'], events: [] } },
          { kind: 'workflow', repo: PIER, path: '.github/workflows/ci.yml', job: 'test' },
          { kind: 'run', repo: PIER, workflow: 'ci.yml', event: 'push', ref: 'main', tip: true, conclusion: 'success' },
        ],
        solution: [...WRITE_PIER(PIER_CI), 'gh run list', 'gh run watch 4100000001'],
        mistakes: [
          { commands: [...WRITE_PIER(PIER_CI.replace(/on:\n[^]*?jobs:/, 'on: [push, pull_request]\njobs:')), 'gh run watch 4100000001'], why: '`on: [push, pull_request]` 沒有分支篩選：推送到任何分支、開往任何分支的 Pull Request 都會執行' },
          { commands: [...WRITE_PIER(PIER_CI.replace('      - uses: actions/checkout@v4\n', '')), 'gh run watch 4100000001'], why: '少了 actions/checkout：runner 的工作目錄是空的，npm ci 找不到 package-lock.json，run 失敗' },
          { commands: [...WRITE_PIER(PIER_CI.replace('ubuntu-latest', 'ubuntu-lates')), 'sleep 600'], why: '`runs-on: ubuntu-lates` 沒有任何 runner 有這個 label，job 一直 queued，run 永遠不會結束' },
          { commands: [...WRITE_PIER(PIER_CI.replace('    steps:', '    step:')), 'sleep 60'], why: '`step:` 不是 job 認得的鍵：workflow 無效，推送只得到一個立刻失敗的 run' },
          { commands: WRITE_PIER(PIER_CI), why: '推送之後沒有等：run 還在執行，還不知道它會不會成功' },
        ],
        hints: [
          '先 `mkdir -p .github/workflows`，再用 `cat > .github/workflows/ci.yml <<\'EOF\'` 寫檔案，最後一行單獨寫 `EOF`；可以先 `cat ~/ferry-times/.github/workflows/ci.yml` 參考',
          '`on:` 底下寫 `push:` 與 `pull_request:`，兩個都加 `branches: [main]`',
          '`git add .github`、`git commit`、`git push` 之後，用 `gh run list` 找到 run 的 ID，再 `gh run watch ID`',
        ],
        explanation: 'workflow 檔案放在 `.github/workflows/`，推送到 GitHub 之後才生效。`push` 的 `branches` 比對推送的分支，`pull_request` 的 `branches` 比對 Pull Request 的目標（base）分支，所以兩個都寫 `[main]` 就是「main 的推送與要合併進 main 的 PR」。job 在全新的 runner 上執行，第一個 step 一定要用 actions/checkout 把程式碼取進工作目錄，之後的 npm ci、npm test 才找得到檔案。',
      },
      {
        id: 'cicd04-ex-least', title: '讓 Lint 只有讀取程式碼的權限', machine: 'cicd04-lab',
        statement: 'ferry-times 的預設 workflow 權限是寬鬆的 write，而 lint.yml 的 job lint 又寫了 `permissions: write-all`。lint 只需要讀程式碼：在 ~/ferry-times 修改 lint.yml，讓 job lint 的 GITHUB_TOKEN 只有 contents: read（metadata 一律是 read，不用寫），提交並推送到 main，等 Lint 的 run 跑完並且成功。',
        checks: [
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/lint.yml', job: 'lint', permissions: { contents: 'read' } },
          { kind: 'run', repo: FERRY, workflow: 'lint.yml', ref: 'main', tip: true, conclusion: 'success', logIncludes: 'Contents: read' },
        ],
        solution: ['cd ferry-times', LEAST, 'cat .github/workflows/lint.yml', ...PUSH_LINT, 'gh run list', 'gh run watch 4100000002'],
        mistakes: [
          { commands: ['cd ferry-times', "sed -i 's/^jobs:/permissions:\\n  contents: read\\njobs:/' .github/workflows/lint.yml", ...PUSH_LINT, 'gh run watch 4100000002'], why: '只在 workflow 層加了 contents: read：job 自己的 `permissions: write-all` 優先，lint 仍然拿到全部 write' },
          { commands: ['cd ferry-times', "sed -i 's/write-all/read-all/' .github/workflows/lint.yml", ...PUSH_LINT, 'gh run watch 4100000002'], why: '`read-all` 讓每個範圍都能讀（issues、pull-requests、actions…），不只 contents' },
          { commands: ['cd ferry-times', "sed -i '/permissions: write-all/d' .github/workflows/lint.yml", ...PUSH_LINT, 'gh run watch 4100000002'], why: '刪掉 permissions 之後用的是儲存庫的預設，ferry-times 的預設是寬鬆的 write，權限反而沒有變少' },
          { commands: ['cd ferry-times', LEAST, 'gh workflow view lint.yml'], why: '只改了本機的檔案，沒有提交與推送：GitHub 上的 lint.yml 仍是 write-all' },
          { commands: ['cd ferry-times', "sed -i 's/write-all/{}/' .github/workflows/lint.yml", ...PUSH_LINT, 'gh run watch 4100000002'], why: '`permissions: {}` 把每個範圍都設成 none，連 contents 都不能讀；儲存庫是私有的時，actions/checkout 用這個 token 取不到程式碼' },
        ],
        hints: [
          '把 `    permissions: write-all` 換成兩行：`    permissions:` 與 `      contents: read`',
          "`sed -i 's/    permissions: write-all/    permissions:\\n      contents: read/' .github/workflows/lint.yml`，取代文字裡的 `\\n` 是換行",
          '推送後 main 會有 CI 與 Lint 兩個 run，用 `gh run list` 找 Lint 的 ID，再 `gh run watch`',
        ],
        explanation: 'job 有自己的 `permissions` 時完全取代 workflow 層與儲存庫的預設（不合併），所以要改的是 job lint 那一行。只要寫出任何一個範圍，沒寫到的範圍都變成 none，`contents: read` 就是「只能讀程式碼」。改完的 run 在 Set up job 的 GITHUB_TOKEN Permissions 群組只剩 Contents: read 與 Metadata: read，lint 照樣通過。',
      },
      {
        id: 'cicd04-ex-needs', title: '打包前先等測試，並用它算出的版本', machine: 'cicd04-lab',
        statement: '在 ~/ferry-times 的 ci.yml 加兩件事：（1）job test 的最後加一個 id 為 version 的 step，從 package.json 讀出版本（目前是 1.4.0），以 `version=…` 寫進 `$GITHUB_OUTPUT`，並把它設成 job test 的輸出 version；（2）新增 job package，在 test 成功之後才在 ubuntu-latest 上執行，唯一的 step 印出 `Packing ferry-times ` 加上 test 輸出的版本。提交並推送到 main，等 CI 跑完。',
        checks: [
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/ci.yml', job: 'package' },
          { kind: 'run', repo: FERRY, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' },
          { kind: 'run', repo: FERRY, workflow: 'ci.yml', ref: 'main', tip: true, job: 'package', conclusion: 'success', logIncludes: 'Packing ferry-times 1.4.0' },
        ],
        solution: ['cd ferry-times', PACKAGE, 'cat .github/workflows/ci.yml', ...PUSH_PACKAGE, 'gh run watch 4100000001', "gh run view 4100000001 --log | grep 'Packing' | cut -f 3"],
        mistakes: [
          { commands: ['cd ferry-times', heredoc(ci, wf(...OUTPUT_STEP, ...JOB_OUTPUTS, ...PACKAGE_JOB(false))), ...PUSH_PACKAGE, 'gh run watch 4100000001'], why: '用 > 覆寫了整個 ci.yml，而不是用 >> 附加：檔案只剩這幾行縮排的片段，連 YAML 都不成立，workflow 無效' },
          { commands: ['cd ferry-times', heredoc(ci, wf(...OUTPUT_STEP, ...JOB_OUTPUTS, ...PACKAGE_JOB(false)), true), ...PUSH_PACKAGE, 'gh run watch 4100000001'], why: 'package 沒有 `needs: test`：它和 test 同時開始，needs context 裡沒有 test，印出的版本是空的' },
          { commands: ['cd ferry-times', heredoc(ci, wf(...OUTPUT_STEP, ...PACKAGE_JOB()), true), ...PUSH_PACKAGE, 'gh run watch 4100000001'], why: '少了 job 的 `outputs:`：step 的輸出只在 test 這個 job 裡看得到，needs.test.outputs.version 是空的' },
          { commands: ['cd ferry-times', heredoc(ci, wf(...OUTPUT_STEP, ...JOB_OUTPUTS, ...PACKAGE_JOB(true, 'steps.version.outputs.version')), true), ...PUSH_PACKAGE, 'gh run watch 4100000001'], why: '在 package 裡用 steps.version：steps context 只有同一個 job 的 step，另一個 job 要經由 needs 讀' },
          { commands: ['cd ferry-times', heredoc(ci, wf(OUTPUT_STEP[0], OUTPUT_STEP[1].replace(' >> "$GITHUB_OUTPUT"', ''), ...JOB_OUTPUTS, ...PACKAGE_JOB()), true), ...PUSH_PACKAGE, 'gh run watch 4100000001'], why: '`version=…` 只印到日誌，沒有寫進 `$GITHUB_OUTPUT`，所以沒有成為 step 的輸出' },
        ],
        hints: [
          'test 是 ci.yml 的最後一個 job，steps 也在最後：用 `cat >> .github/workflows/ci.yml <<\'EOF\'` 附加，第一行是縮排 6 格的 `- id: version`',
          'YAML 的鍵沒有順序，job test 的 `outputs:`（縮排 4 格）可以寫在 steps 之後：`version: ${{ steps.version.outputs.version }}`',
          '版本：`echo "version=$(grep \'"version"\' package.json | cut -d \'"\' -f 4)" >> "$GITHUB_OUTPUT"`；package 寫 `needs: test`，印 `${{ needs.test.outputs.version }}`',
        ],
        explanation: '同一個 job 的 step 共用一台 runner，以 `steps.<id>.outputs` 互相傳值；不同的 job 在不同的 runner 上，值要先經過 job 的 `outputs:` 公開，接收的 job 以 `needs` 宣告依賴之後才能用 `needs.<job>.outputs` 讀。`needs: test` 同時決定順序：test 失敗時 package 不會執行，壞掉的程式不會被打包。',
      },
      {
        id: 'cicd04-ex-paths', title: '只改文件時不跑 CI', machine: 'cicd04-lab',
        statement: 'ferry-times 的 docs/ 只有說明文件，每次改文件都跑一次完整的測試是浪費。在 ~/ferry-times 修改 ci.yml：推送到 main 與目標是 main 的 Pull Request，如果改到的檔案全部在 docs/ 資料夾（含子資料夾）裡就不執行；只要改到 docs/ 以外的檔案仍然執行。提交並推送到 main，等這次推送觸發的 CI 跑完並且成功。',
        checks: [
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/ci.yml', on: { ref: 'main', paths: ['docs/guide.md'], events: [] } },
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/ci.yml', on: { ref: 'main', paths: ['docs/maps/pier-2.png'], events: [] } },
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/ci.yml', on: { ref: 'main', paths: ['src/fares.js'], events: ['push', 'pull_request'] } },
          { kind: 'workflow', repo: FERRY, path: '.github/workflows/ci.yml', on: { ref: 'main', paths: ['docs/guide.md', 'README.md'], events: ['push', 'pull_request'] } },
          { kind: 'run', repo: FERRY, workflow: 'ci.yml', event: 'push', ref: 'main', conclusion: 'success' },
        ],
        solution: ['cd ferry-times', IGNORE_DOCS('docs/**'), 'head -9 .github/workflows/ci.yml', ...PUSH_FILTER, 'gh run watch 4100000001',
          "echo 'Pier 2 has a lift.' >> docs/guide.md", "git commit -qam 'Mention the lift'", 'git push -q', 'gh run list'],
        mistakes: [
          { commands: ['cd ferry-times', IGNORE_DOCS('docs/**').replace('paths-ignore', 'paths'), ...PUSH_FILTER, 'sleep 60'], why: '`paths: ["docs/**"]` 正好相反：只有改到文件時才執行，改程式碼反而不跑' },
          { commands: ['cd ferry-times', heredoc(ci, CI_YML.replace('    branches: [main]\n', '    branches: [main]\n    paths-ignore: ["docs/**"]\n')), ...PUSH_FILTER, 'gh run watch 4100000001'], why: '只在 push 加了 paths-ignore：pull_request 沒有篩選，只改文件的 Pull Request 仍然執行' },
          { commands: ['cd ferry-times', IGNORE_DOCS('docs'), ...PUSH_FILTER, 'gh run watch 4100000001'], why: '`docs` 只符合名為 docs 的檔案本身，不符合 docs/guide.md；資料夾裡的檔案要寫 `docs/**`' },
          { commands: ['cd ferry-times', IGNORE_DOCS('*.md'), ...PUSH_FILTER, 'gh run watch 4100000001'], why: '`*` 不跨過 `/`：`*.md` 只符合最上層的 .md，docs/guide.md 仍然觸發；README.md 反而被忽略了' },
          { commands: ['cd ferry-times', IGNORE_DOCS('docs/**'), "git commit -qam 'Skip CI for docs-only changes'"], why: '提交了但沒有推送：GitHub 上的 ci.yml 沒有變，也沒有新的 run' },
        ],
        hints: [
          'push 與 pull_request 底下各加一行 `paths-ignore: ["docs/**"]`，縮排和 `branches` 一樣是 4 格',
          '`**` 可以跨過 `/`，`*` 不行',
          "`sed -i 's/    branches: \\[main\\]/&\\n    paths-ignore: [\"docs\\/**\"]/' .github/workflows/ci.yml`：`&` 是原本符合的那一行，兩個 branches 都會加上",
        ],
        explanation: '`paths-ignore` 在所有變更的檔案都符合時才跳過，所以同時改了 docs/guide.md 與 README.md 仍然執行；`paths` 則是任何一個檔案符合就執行，兩者在同一個事件只能擇一。篩選是逐個事件寫的，push 與 pull_request 都要加。`docs/**` 的 `**` 可以跨過 `/`，涵蓋 docs 底下任何深度的檔案。',
      },
    ],
  },
};
