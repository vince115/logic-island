import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';

/*
 * A synthetic machine for engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md), only for tests — CICD03–05-like
 * GitHub Actions runs on dev-05 (the actions profile, Asia/Taipei; the runners log in UTC). gh is logged in as mei-lin.
 * - island/shop main (c2): app.js has a bug (a - b), so npm test fails; package-lock.json exists, so npm ci works.
 *   ci.yml (CI: push to main and pull requests into main; contents: read; checkout, setup-node, npm ci, npm test),
 *   e2e.yml (E2E: push to main; npm run e2e is flaky — it fails on attempt 1), matrix.yml (Matrix: workflow_dispatch; node
 *   18, 20, 22 sleeping 3, 5 and 7 seconds; node 20 fails), build.yml (Build: workflow_dispatch with a choice input; job
 *   version writes a step output that publish reads through needs). main requires the check test.
 * - CI tools: npm ci, npm test (passes when app.js adds), npm run e2e (flaky), npm run lint (only on the learner's machine).
 * - ~/shop is a clone of main.
 */
const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
export const SHOP = 'https://github.example/island/shop.git';
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };

export const CI_YML = ['name: CI', 'on:', '  push:', '    branches: [main]', '  pull_request:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  test:',
  '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 20',
  '      - run: npm ci', '      - run: npm test', ''].join('\n');
export const E2E_YML = ['name: E2E', 'on:', '  push:', '    branches: [main]', 'jobs:', '  e2e:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
  '      - run: npm run e2e', ''].join('\n');
export const MATRIX_YML = ['name: Matrix', 'on: workflow_dispatch', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    strategy:', '      matrix:', '        node: [18, 20, 22]',
  '    steps:', '      - run: sleep $(( ${{ matrix.node }} - 15 ))', '      - run: test ${{ matrix.node }} != 20', ''].join('\n');
export const BUILD_YML = ['name: Build', 'on:', '  workflow_dispatch:', '    inputs:', '      level:', '        type: choice', '        options: [patch, minor]', 'jobs:', '  version:',
  '    runs-on: ubuntu-latest', '    outputs:', '      tag: ${{ steps.v.outputs.tag }}', '    steps:', '      - id: v',
  "        run: echo \"tag=v1.${{ inputs.level == 'minor' && '1' || '0' }}.0\" >> \"$GITHUB_OUTPUT\"", '  publish:', '    needs: version', '    runs-on: ubuntu-latest',
  '    steps:', '      - run: echo "Publishing ${{ needs.version.outputs.tag }}"', ''].join('\n');
export const BUGGY = 'export const add = (a, b) => a - b;\n';
export const FIXED = 'export const add = (a, b) => a + b;\n';

export const ACTIONS_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n', 'package.json': '{ "name": "shop" }\n', 'package-lock.json': '{}\n', 'app.js': BUGGY, 'test/add.test.js': 'test add\n' }, author: MEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add workflows', files: { '.github/workflows/ci.yml': CI_YML, '.github/workflows/e2e.yml': E2E_YML, '.github/workflows/matrix.yml': MATRIX_YML, '.github/workflows/build.yml': BUILD_YML }, author: MEI, time: '2026-11-21 01:00:00' },
];

export const TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cases: [
    { when: [{ path: 'package-lock.json' }], stdout: 'added 12 packages in 2s', seconds: 2 },
    { stderr: 'npm ERR! The `npm ci` command can only install with an existing package-lock.json', exit: 1, seconds: 1 },
  ] },
  { command: 'npm test', cases: [
    { when: [{ path: 'app.js', includes: 'a + b' }], stdout: 'PASS test/add.test.js\nTests: 3 passed, 3 total', seconds: 5, writes: [{ path: 'reports/junit.xml', content: '<testsuites tests="3" failures="0"/>\n' }] },
    { stdout: 'FAIL test/add.test.js\n  ● add › adds two numbers\nTests: 1 failed, 2 passed, 3 total', exit: 1, seconds: 5, writes: [{ path: 'reports/junit.xml', content: '<testsuites tests="3" failures="1"/>\n' }] },
  ] },
  { command: 'npm run e2e', cases: [{ stdout: 'e2e: 4 passed', seconds: 10 }], flaky: { failOnAttempts: [1], stderr: 'Error: page did not load within 5000ms', exit: 1, seconds: 8 } },
  { command: 'npm run lint', where: 'local', cases: [{ stdout: 'lint: no problems' }] },
];

export const actionsLab: TerminalMachine = {
  id: 'dev-05', title: 'dev-05（GitHub Actions 的執行）', user: 'learner', cwd: '/home/learner', host: 'dev-05', profile: 'actions', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: { user: MEI, commits: ACTIONS_COMMITS, remotes: [{ url: SHOP, branches: { main: 'c2' } }], repos: [{ path: '/home/learner/shop', origin: SHOP }] },
  forge: { login: 'mei-lin', repos: [{ url: SHOP, description: 'The island shop', protection: [{ branch: 'main', checks: ['test'] }], permission: 'admin' }] },
  actions: { tools: TOOLS },
};

const FIX = `printf '${FIXED.replace(/\n/g, '\\n')}' > app.js`;
/** CICD03-like: CI is red on main; fix the bug, push and wait for a green run. */
export const fixExercise: TerminalExercise = {
  id: 'fix', title: '先修好紅燈', machine: 'dev-05',
  statement: 'main 的 CI 失敗了。在 ~/shop 修好 app.js 的 add，提交並推送，等 CI 跑完而且是綠的。',
  checks: [{ kind: 'run', repo: SHOP, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' }],
  solution: ['cd shop', FIX, "git commit -qam 'Fix add'", 'git push -q', 'gh run watch $(gh run list -w ci.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)'],
  mistakes: [
    { commands: ['cd shop', "git commit -q --allow-empty -m 'Retry'", 'git push -q', 'sleep 60'], why: '沒有修正就重新推送，測試仍然失敗' },
    { commands: ['cd shop', FIX, "git commit -qam 'Fix add'", 'git push -q'], why: '推送之後沒有等 CI 跑完' },
  ],
  hints: ['a - b 應該是 a + b', 'gh run watch 等它完成'], explanation: '主線保持綠燈：失敗時先修好再做別的。',
};

/** CICD05-like: the E2E job is flaky; rerun only the failed jobs. */
export const flakyExercise: TerminalExercise = {
  id: 'flaky', title: '不穩定的測試', machine: 'dev-05',
  statement: '推送一個空的 commit 到 main，E2E 第一次會失敗。只重新執行失敗的 job，讓它通過。',
  checks: [{ kind: 'run', repo: SHOP, workflow: 'E2E', event: 'push', attempt: 2, job: 'e2e', conclusion: 'success' }],
  solution: ['cd shop', "git commit -q --allow-empty -m 'Touch'", 'git push -q', 'sleep 60', 'gh run rerun $(gh run list -w e2e.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9) --failed', 'sleep 60'],
  mistakes: [{ commands: ['cd shop', "git commit -q --allow-empty -m 'Touch'", 'git push -q', 'sleep 60'], why: '沒有重新執行' }],
  hints: ['gh run rerun 編號 --failed'], explanation: '不穩定的測試要修，但重新執行能確認是不是偶發的。',
};

/** CICD04-like: dispatch Build with an input and read the published tag from the log. */
export const dispatchExercise: TerminalExercise = {
  id: 'dispatch', title: '手動觸發', machine: 'dev-05',
  statement: '用 gh 手動執行 Build，level 選 minor，等它跑完。',
  checks: [{ kind: 'run', repo: SHOP, workflow: 'Build', event: 'workflow_dispatch', job: 'publish', conclusion: 'success', logIncludes: 'Publishing v1.1.0' }],
  solution: ['cd shop', 'gh workflow run build.yml -f level=minor', 'sleep 30'],
  mistakes: [{ commands: ['cd shop', 'gh workflow run build.yml', 'sleep 30'], why: '沒有給 level，預設不是 minor' }, { commands: ['cd shop', 'gh workflow run build.yml -f level=minor'], why: '沒有等它跑完' }],
  hints: ['gh workflow run build.yml -f level=minor'], explanation: 'workflow_dispatch 的輸入以 -f 給。',
};

export const actionsContent: TerminalLessonContent = {
  machines: [actionsLab],
  examples: [{
    id: 'red', title: '推送之後的 run', description: '推送觸發 CI 與 E2E。', machine: 'dev-05',
    steps: [{ command: 'cd shop', output: '' }, { command: "git commit -q --allow-empty -m 'Touch'", output: '' }, { command: 'git push -q', output: 'To https://github.example/island/shop.git\n   7b92d4d..1bd6a03  main -> main' }, { command: 'gh run list', output: 'STATUS  TITLE  WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n*       Touch  E2E       main    push   4100000002  0s       less than a minute ago\n*       Touch  CI        main    push   4100000001  0s       less than a minute ago' }],
  }],
  exercises: [fixExercise, flakyExercise, dispatchExercise],
};
