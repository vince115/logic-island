/*
 * CICD03 持續整合 (the blueprint's pipeline-sim, terminal-sim on the actions profile: engine stages E25 git, E26 forge,
 * E27 workflows and E28 actions). A made-up ferry company, Harborline, on the simulated github.example: Kim Lo (the
 * learner, gh login kim-lo), Ivy Ho and Sam Tan. Both repositories carry the same given CI workflow (push to main and pull
 * requests into main; one job build: checkout, setup-node, npm ci, npm run lint, npm run build, npm test); the CI tools are
 * lesson-declared and follow the files. harborline/timetable: main is protected (required check build), the learner has
 * write; the clone has night-sailings (a 22:15 sailing written as 2215, so the build fails) and big-redesign (three weeks
 * old, conflicts with five teammate commits). harborline/fares: no protection, the learner is admin; the clone's main is
 * three unpushed commits ahead, the first of which (Add child fares) breaks the child fare test. Integration hell, a push
 * triggering a run, gh run list/watch/view --log-failed, fast checks first, required status checks and strict, fix or
 * revert a red main. Every transcript output was produced by replaying it on the engine.
 */

import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGit, TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalForge } from '@/lib/terminal/forge-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const TIMETABLE = 'https://github.example/harborline/timetable.git';
const FARES = 'https://github.example/harborline/fares.git';
const KIM = { name: 'Kim Lo', email: 'kim@example.com' }, SAM = { name: 'Sam Tan', email: 'sam@example.com' }, IVY = { name: 'Ivy Ho', email: 'ivy@example.com' };
const lines = (...l: string[]) => [...l, ''].join('\n');

/** The CI workflow both repositories share (given, not taught here: CICD04 writes workflows). */
const CI_YML = lines('name: CI', 'on:', '  push:', '    branches: [main]', '  pull_request:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  build:',
  '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/setup-node@v4', '        with:', '          node-version: 20', '      - run: npm ci',
  '      - run: npm run lint', '      - run: npm run build', '      - run: npm test');
const pkg = (name: string) => lines('{', `  "name": "${name}",`, '  "private": true,', '  "scripts": {', '    "lint": "eslint src",', '    "build": "node build.js",', '    "test": "jest"', '  }', '}');
const GITIGNORE = lines('node_modules/', 'public/');
const LOCK = lines('{ "lockfileVersion": 3 }');

// timetable: sailings between Harbor Point (HP) and Gull Island (GI).
const sailing = (route: string, departs: string) => `  { route: '${route}', departs: '${departs}' },`;
const SAILINGS_1 = lines('export const sailings = [', sailing('HP-GI', '07:30'), sailing('GI-HP', '08:45'), sailing('HP-GI', '17:30'), '];');
const SAILINGS_2 = lines('export const sailings = [', sailing('HP-GI', '07:30'), sailing('GI-HP', '08:45'), sailing('HP-GI', '12:00'), sailing('HP-GI', '17:30'), '];');
const SAILINGS_7 = lines('export const sailings = [', sailing('HP-GI', '07:30'), sailing('GI-HP', '08:45'), sailing('HP-GI', '12:00'), sailing('HP-GI', '17:30'), sailing('GI-HP', '19:15'), '];');
const night = (departs: string) => lines('export const sailings = [', sailing('HP-GI', '07:30'), sailing('GI-HP', '08:45'), sailing('HP-GI', '12:00'), sailing('HP-GI', '17:30'), sailing('GI-HP', '19:15'),
  sailing('HP-GI', departs), '];');
const NIGHT_BROKEN = night('2215'), NIGHT_FIXED = night('22:15');
const NEXT_1 = lines('export const nextSailing = (sailings, now) =>', '  sailings.find((s) => s.departs > now);');
const NEXT_6 = lines('export const nextSailing = (sailings, now) =>', '  [...sailings].sort((a, b) => a.departs.localeCompare(b.departs)).find((s) => s.departs > now);');
const TEST_1 = lines("import { nextSailing } from '../src/next.js';", "import { sailings } from '../src/sailings.js';", '', "test('finds the next sailing', () => {",
  "  expect(nextSailing(sailings, '08:00').departs).toBe('08:45');", '});');
const TEST_3 = `${TEST_1}${lines('', "test('returns nothing after the last sailing', () => {", "  expect(nextSailing(sailings, '23:00')).toBeUndefined();", '});')}`;
const README_T = lines('# timetable', '', 'Ferry sailings between Harbor Point (HP) and Gull Island (GI).');
const BUILD_T = lines("import { mkdirSync, writeFileSync } from 'node:fs';", "import { sailings } from './src/sailings.js';", '', 'for (const s of sailings) {',
  "  if (!/^\\d\\d:\\d\\d$/.test(s.departs)) throw new Error(`invalid departure time '${s.departs}' in src/sailings.js (expected HH:MM)`);", '}',
  "mkdirSync('public', { recursive: true });", "writeFileSync('public/index.html', sailings.map((s) => `<li>${s.route} ${s.departs}</li>`).join('\\n'));");
// big-redesign: the learner's three-week-old branch, never integrated.
const ROUTES = lines('export const routes = {', "  'HP-GI': ['07:30', '17:30'],", "  'GI-HP': ['08:45'],", '};');
const NEXT_R = lines('export const nextSailing = (routes, route, now) =>', '  routes[route].find((t) => t > now);');
const TEST_R = lines("import { nextSailing } from '../src/next.js';", "import { routes } from '../src/sailings.js';", '', "test('finds the next sailing on a route', () => {",
  "  expect(nextSailing(routes, 'GI-HP', '08:00')).toBe('08:45');", '});');

const TIMETABLE_COMMITS: TerminalGitCommit[] = [
  { id: 't1', message: 'Initial commit', author: IVY, time: '2026-10-30 02:00:00', files: {
    'README.md': README_T, 'package.json': pkg('timetable'), 'package-lock.json': LOCK, '.gitignore': GITIGNORE, 'build.js': BUILD_T,
    'src/sailings.js': SAILINGS_1, 'src/next.js': NEXT_1, 'test/next.test.js': TEST_1, '.github/workflows/ci.yml': CI_YML,
  } },
  { id: 't2', message: 'Add the 12:00 sailing', author: SAM, time: '2026-11-03 03:00:00', files: { 'src/sailings.js': SAILINGS_2 } },
  { id: 't3', message: 'Test the last sailing of the day', author: IVY, time: '2026-11-06 02:30:00', files: { 'test/next.test.js': TEST_3 } },
  { id: 't5', message: 'Note the holiday timetable', author: IVY, time: '2026-11-12 03:00:00', files: { 'README.md': `${README_T}${lines('', 'Holiday sailings follow the Sunday timetable.')}` } },
  { id: 't6', message: 'Sort sailings by departure time', author: SAM, time: '2026-11-18 04:00:00', files: { 'src/next.js': NEXT_6 } },
  { id: 't7', message: 'Add the 19:15 evening sailing', author: IVY, time: '2026-11-21 02:00:00', files: { 'src/sailings.js': SAILINGS_7 } },
  { id: 'n1', message: 'Add the 22:15 night sailing', author: KIM, time: '2026-11-22 08:00:00', files: { 'src/sailings.js': NIGHT_BROKEN } },
  { id: 'r1', parents: ['t1'], message: 'Group sailings by route', author: KIM, time: '2026-11-02 06:00:00', files: { 'src/sailings.js': ROUTES } },
  { id: 'r2', message: 'Find the next sailing per route', author: KIM, time: '2026-11-09 07:00:00', files: { 'src/next.js': NEXT_R, 'test/next.test.js': TEST_R } },
  { id: 'r3', message: 'Describe the routes in the README', author: KIM, time: '2026-11-16 07:00:00', files: { 'README.md': lines('# timetable', '', 'Ferry sailings, grouped by route: HP-GI and GI-HP.') } },
];

// fares: the price list. The learner's three unpushed commits; the first one breaks the child fare.
const FARE_1 = lines('export const adultFare = (zones) => 60 + zones * 30;');
const FARE_BROKEN = lines('export const adultFare = (zones) => 60 + zones * 30;', 'export const childFare = (zones) => adultFare(zones) - 2;');
const FARE_FIXED = lines('export const adultFare = (zones) => 60 + zones * 30;', 'export const childFare = (zones) => adultFare(zones) / 2;');
const FARE_TEST_1 = lines("import { adultFare } from '../src/fare.js';", '', "test('one zone', () => {", '  expect(adultFare(1)).toBe(90);', '});', '',
  "test('two zones', () => {", '  expect(adultFare(2)).toBe(120);', '});');
const FARE_TEST_K1 = lines("import { adultFare, childFare } from '../src/fare.js';", '', "test('one zone', () => {", '  expect(adultFare(1)).toBe(90);', '});', '',
  "test('two zones', () => {", '  expect(adultFare(2)).toBe(120);', '});', '', "test('a child pays half', () => {", '  expect(childFare(2)).toBe(60);', '});');
const FORMAT_1 = lines('export const price = (n) => `${n}`;');
const FORMAT_K2 = lines('export const price = (n) => `NT$${n}`;');
const FORMAT_TEST_1 = lines("import { price } from '../src/format.js';", '', "test('shows the price', () => {", "  expect(price(90)).toBe('90');", '});');
const FORMAT_TEST_K2 = lines("import { price } from '../src/format.js';", '', "test('shows the price in NT$', () => {", "  expect(price(90)).toBe('NT$90');", '});');
const README_F = lines('# fares', '', 'Ferry fares between Harbor Point and Gull Island.');
const BUILD_F = lines("import { mkdirSync, writeFileSync } from 'node:fs';", "import { adultFare } from './src/fare.js';", "import { price } from './src/format.js';", '',
  "mkdirSync('public', { recursive: true });", "writeFileSync('public/fares.html', [1, 2, 3].map((z) => `<li>${z} zones: ${price(adultFare(z))}</li>`).join('\\n'));");

function faresCommits(child: string): TerminalGitCommit[] {
  return [
    { id: 'f1', parents: [], message: 'Initial commit', author: IVY, time: '2026-11-16 03:00:00', files: {
      'README.md': README_F, 'package.json': pkg('fares'), 'package-lock.json': LOCK, '.gitignore': GITIGNORE, 'build.js': BUILD_F,
      'src/fare.js': FARE_1, 'src/format.js': FORMAT_1, 'test/fare.test.js': FARE_TEST_1, 'test/format.test.js': FORMAT_TEST_1, '.github/workflows/ci.yml': CI_YML,
    } },
    { id: 'k1', message: child, author: KIM, time: '2026-11-18 07:10:00', files: { 'src/fare.js': FARE_BROKEN, 'test/fare.test.js': FARE_TEST_K1 } },
    { id: 'k2', message: 'Show fares in NT$', author: KIM, time: '2026-11-19 06:40:00', files: { 'src/format.js': FORMAT_K2, 'test/format.test.js': FORMAT_TEST_K2 } },
    { id: 'k3', message: 'Mention the winter timetable', author: KIM, time: '2026-11-20 08:20:00', files: { 'README.md': `${README_F}${lines('', 'From December the last ferry leaves at 19:15.')}` } },
  ];
}

function gitData(child: string): TerminalGit {
  return {
    user: KIM, commits: [...TIMETABLE_COMMITS, ...faresCommits(child)],
    remotes: [{ url: TIMETABLE, branches: { main: 't7' } }, { url: FARES, branches: { main: 'f1' } }],
    repos: [
      { path: '/home/learner/timetable', origin: TIMETABLE, branches: { main: 't7', 'night-sailings': 'n1', 'big-redesign': 'r3' }, head: 'main', tracking: { main: 't7' }, upstream: ['main'] },
      { path: '/home/learner/fares', origin: FARES, branches: { main: 'k3' }, head: 'main', tracking: { main: 'f1' }, upstream: ['main'] },
    ],
  };
}
const GIT = gitData('Add child fares');
/** Exercise 1's variant: the same three commits with another message for the first, so its line cannot be typed in. */
const GIT_VARIANT = gitData('Add half-price child fares');

const FORGE: TerminalForge = { login: 'kim-lo', repos: [
  { url: TIMETABLE, description: 'Ferry sailings between Harbor Point and Gull Island', protection: [{ branch: 'main', checks: ['build'] }] },
  { url: FARES, description: 'Ferry fares and the price list', permission: 'admin' },
] };

const JEST_FAIL = lines('PASS test/format.test.js', 'FAIL test/fare.test.js', '  ● a child pays half', '', '    expect(received).toBe(expected) // Object.is equality', '', '    Expected: 60',
  '    Received: 118', '', 'Test Suites: 1 failed, 1 passed, 2 total', 'Tests:       1 failed, 3 passed, 4 total').trimEnd();
const jestPass = (suites: string[], tests: number) => [...suites.map(s => `PASS ${s}`), '', `Test Suites: ${suites.length} passed, ${suites.length} total`, `Tests:       ${tests} passed, ${tests} total`].join('\n');
const FARE_SUITES = ['test/fare.test.js', 'test/format.test.js'];
const TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cases: [
    { when: [{ path: 'package-lock.json' }], stdout: 'added 48 packages, and audited 49 packages in 3s', seconds: 3 },
    { stderr: 'npm ERR! The `npm ci` command can only install with an existing package-lock.json', exit: 1, seconds: 1 },
  ] },
  { command: 'npm run lint', cases: [
    { when: [{ path: 'src/next.js', includes: 'console.log' }], stdout: lines('', 'src/next.js', '  3:1  error  Unexpected console statement  no-console', '', '✖ 1 problem (1 error, 0 warnings)').trim(), exit: 1, seconds: 2 },
    { seconds: 2 },
  ] },
  { command: 'npm run build', cases: [
    { when: [{ path: 'src/sailings.js', includes: "'2215'" }], stderr: "Error: invalid departure time '2215' in src/sailings.js (expected HH:MM)", exit: 1, seconds: 2 },
    { when: [{ path: 'src/sailings.js' }], stdout: 'Built public/index.html', seconds: 4, writes: [{ path: 'public/index.html', content: '<ul class="sailings"></ul>\n' }] },
    { when: [{ path: 'src/fare.js' }], stdout: 'Built public/fares.html', seconds: 4, writes: [{ path: 'public/fares.html', content: '<ul class="fares"></ul>\n' }] },
  ] },
  { command: 'npm test', cases: [
    { when: [{ path: 'test/next.test.js', includes: 'after the last sailing' }], stdout: jestPass(['test/next.test.js'], 2), seconds: 5 },
    { when: [{ path: 'test/next.test.js' }], stdout: jestPass(['test/next.test.js'], 1), seconds: 5 },
    { when: [{ path: 'src/fare.js', includes: 'adultFare(zones) / 2' }], stdout: jestPass(FARE_SUITES, 4), seconds: 6 },
    { when: [{ path: 'src/fare.js', includes: 'adultFare(zones) * 0.5' }], stdout: jestPass(FARE_SUITES, 4), seconds: 6 },
    { when: [{ path: 'src/fare.js' }, { path: 'src/fare.js', excludes: 'childFare' }], stdout: jestPass(FARE_SUITES, 3), seconds: 6 },
    { when: [{ path: 'src/fare.js' }, { path: 'test/fare.test.js', excludes: 'toBe(60)' }], stdout: jestPass(FARE_SUITES, 4), seconds: 6 },
    { when: [{ path: 'src/fare.js' }], stdout: JEST_FAIL, exit: 1, seconds: 6 },
  ] },
];

const lab: TerminalMachine = {
  id: 'cicd03-lab', title: 'kim-laptop（渡輪時刻表團隊的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'kim-laptop', profile: 'actions',
  timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: GIT, forge: FORGE, actions: { tools: TOOLS },
};


const FARE_FIX = `printf '${FARE_FIXED.replace(/\n/g, '\\n')}' > src/fare.js`;
const FARE_TEST_EDITED = `printf "${FARE_TEST_K1.replace('toBe(60)', 'toBe(118)').replace(/\n/g, '\\n')}" > test/fare.test.js`;
const NIGHT_FIX = `sed -i "s/'2215'/'22:15'/" src/sailings.js`;
const PUSH_FARES = ['cd fares', 'git push', 'gh run watch 4100000001'];
const OPEN_PR = ['cd timetable', 'git switch night-sailings', 'git push -u origin night-sailings', "gh pr create --title 'Add the 22:15 night sailing' --body 'A late ferry for the Friday market.'",
  'gh run watch 4100000001'];
const PROTECT = (context: string) => `gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F 'required_status_checks[strict]=false' -F 'required_status_checks[contexts][]=${context}' -F enforce_admins=true -F required_pull_request_reviews=null -F restrictions=null`;

export const CICD03: LessonContent = {
  lessonId: 'CICD03',
  motivation: '「CI 又紅了，是誰弄的？」「我只改了 README，為什麼測試失敗？」「等這個大功能做完再一起合併吧。」三週後真的要合併時，衝突一個接一個，解完衝突還不知道程式是從哪裡開始壞的。CICD02 讓每個變更走短分支、經過 Pull Request 進入 main；這一課再加上一個不會累、也不會忘記的檢查者：每次推送，GitHub Actions 就在一台全新的機器上自動安裝、檢查、建置、測試，很快告訴你這次的整合有沒有把東西弄壞。持續整合（Continuous Integration，CI）是一組團隊的習慣：頻繁整合、自動建置、快速回饋、讓主分支保持綠燈、失敗了先修。這一課在一個渡輪時刻表團隊的模擬終端機裡，真的推送、等 run 跑完、讀失敗的日誌、找出讓 main 變紅的 commit 並修好它，也看分支保護怎麼擋下紅燈的 Pull Request。',
  sections: [
    {
      id: 'cicd03-s-setup', title: '本課的團隊與終端機',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的渡輪公司 Harborline，在港口岬（Harbor Point，HP）與海鷗島（Gull Island，GI）之間開船。程式放在模擬的 GitHub 主機 `github.example` 上的兩個儲存庫：harborline/timetable 是船班時刻表的網頁，harborline/fares 是票價，兩個都是小型的 JavaScript 專案。團隊有三個人：你是 Kim Lo（GitHub 帳號 kim-lo），另外兩位是 Ivy Ho 與 Sam Tan。你的筆電 kim-laptop 的家目錄裡已經有兩個儲存庫的複本（clone）：timetable 與 fares 兩個資料夾。' },
        { type: 'table', head: ['儲存庫', '現在的狀況', '你的權限'], rows: [
          ['harborline/timetable', 'main 受分支保護：CI 的 build 檢查成功才能合併（第五節）。你的複本有兩個還沒推送的分支：night-sailings（昨天加上的夜班船）與 big-redesign（三週前開始的大改版）', '寫入（write）'],
          ['harborline/fares', '上週才建立，還沒有任何分支保護。你這三天在本機的 main 上做了三個 commit，一直沒有推送', '管理員（admin）'],
        ] },
        { type: 'p', text: '兩個儲存庫都已經有同一個 CI 設定檔 `.github/workflows/ci.yml`（稱為 workflow），在推送到 main 與開 Pull Request 到 main 時執行。workflow 檔案怎麼寫是 CICD04 的內容；這一課把它當成已經寫好的設定，專心在持續整合的做法：看結果、讀日誌、修好失敗、不合併紅燈。除了 CICD02 用過的 git 與 gh，本課只用到下面這些指令：' },
        { type: 'table', head: ['指令', '作用', '本課的例子'], rows: [
          ['`cd 資料夾`', '進入資料夾', '`cd fares`'],
          ['`cat 檔案`', '印出檔案的內容', '`cat .github/workflows/ci.yml`'],
          ["`echo '文字' >> 檔案`", '在檔案最後加上一行', "`echo 'Tickets: Harbor Point pier, gate 2.' >> README.md`"],
          ["`printf '內容' > 檔案`", '用這段文字取代整個檔案，`\\n` 代表換行', "`printf 'a\\nb\\n' > notes.txt`"],
          ['`sed -i "s/舊/新/" 檔案`', '把檔案裡每一行第一個「舊」換成「新」，`-i` 表示直接改寫檔案', `\`${NIGHT_FIX}\``],
          ['`npm run lint`、`npm run build`、`npm test`', '專案的程式碼檢查、建置與測試；本機與 CI 跑的是同一組指令', '`npm test`'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'git 照 2.43、gh 照 2.65 的輸出格式模擬，GitHub Actions 在模擬的 ubuntu-24.04 runner 上真的執行 workflow 的每個 step。有幾點和真實環境不同：run 只會由你在這台終端機上的推送與 Pull Request 產生，同事過去的推送沒有紀錄；`npm` 這些工具的結果是課程依檔案內容設定的（修好程式，測試就會通過），不是真的執行 Node.js；時間是模擬環境的時鐘，`gh run watch` 會直接快轉到 run 結束，日誌與畫面上的秒數只是示意，不代表真實專案的建置時間。團隊、主機、檔案與網址都是虛構的。' },
      ],
    },
    {
      id: 'cicd03-s-integrate', title: '頻繁整合：小變更每天併回 main',
      blocks: [
        { type: 'p', text: '「整合」是把你的修改和其他人的修改合在一起，並確認合起來仍然能建置、能通過測試。分開開發本身沒有問題，問題在分開多久：每多一天，main 上就多一些你沒看過的變更，你的分支上也多一些別人沒看過的變更，合併時要處理的差異跟著變大。' },
        { type: 'p', text: '持續整合的核心是一個習慣：每個人至少每天把自己的工作併回共用的 main 一次，而且每一次整合都由自動化的建置與測試驗證。Martin Fowler 介紹這個做法的文章就是這樣描述的，極限編程（Extreme Programming，XP）也把它列為核心實踐。整合越頻繁，每次要合的東西越少，衝突越小，出問題時也越容易知道是哪個變更造成的。' },
        { type: 'p', text: '反過來，分支開了好幾週才合併，最後一次合併常常變成好幾天的整合地獄（integration hell）：衝突一個接一個，解完衝突還不知道程式能不能動。下面的例子是你三週前開始、一直沒有整合的 big-redesign 分支：`main..big-redesign` 列出分支上有、main 沒有的 3 個 commit，`big-redesign..main` 列出這段時間 main 上多出來的 5 個同事的 commit。合併時三個檔案衝突。' },
        { type: 'example', id: 'cicd03-hell' },
        { type: 'p', text: '輸出裡還藏著一個更麻煩的問題：test/next.test.js 自動合併成功了，但合併後的檔案匯入的是你改名後的 routes，Ivy 在 main 上新增的「最後一班之後」那個測試卻還在用已經不存在的 sailings。這種問題 Git 看不出來，只有建置與測試跑過才會發現，所以整合一定要搭配自動建置。`git merge --abort` 讓分支回到合併前的樣子；真正的解法不是一次合併三週的工作，而是把大改版拆成每天都能安全合併的小步驟，還沒完成的部分可以用功能旗標（feature flag）先關著。' },
        { type: 'table', head: ['', '三週才整合一次', '每天整合'], rows: [
          ['每次合併的內容', '好幾個人、幾十個 commit、許多檔案', '一兩個小 commit'],
          ['衝突', '多而且大，要回想三週前為什麼這樣寫', '少而且小，記憶還新鮮'],
          ['測試失敗時', '不知道是哪個變更造成的', '範圍只有今天的變更'],
          ['main 和你手上的版本', '差距越來越大，別人的改動你一直沒看到', '每個人都從接近最新的 main 開始'],
        ] },
        { type: 'callout', tone: 'warning', title: '有 CI 伺服器不等於在做持續整合', text: '很多團隊以為設好 GitHub Actions、每次推送會跑測試，就是「有做 CI」。如果分支一開就是三週，CI 只是在每個人自己的分支上跑測試，真正的整合仍然被拖到最後一次合併，整合地獄一樣會發生。持續整合指的是整合的頻率加上自動驗證：工具讓驗證變便宜，頻繁整合則要靠團隊的習慣——小變更、短分支、每天合併。' },
      ],
    },
    {
      id: 'cicd03-s-pipeline', title: '自動建置：一次 push 觸發的檢查流程',
      blocks: [
        { type: 'p', text: '每天整合好幾次之所以可行，是因為每次整合都由機器自動檢查，不必等人手動建置與測試。在 GitHub 上負責這件事的是 GitHub Actions。從你按下 Enter 到看見結果，中間依序發生這些事：' },
        { type: 'list', ordered: true, items: [
          '`git push` 把 commit 送到 github.example。開 Pull Request、推送新的 commit 到 PR 的分支，也都是一個事件。',
          'GitHub 檢查儲存庫裡每個 workflow 的觸發條件（`on:`）。ci.yml 寫的是推送到 main 與開 PR 到 main，符合就建立一次執行，稱為 run，一開始在排隊（queued）。',
          'run 裡的每個 job 分配到一台全新的機器（runner），先取出這次的程式碼（`actions/checkout`），再依序執行每個 step。PR 的 run 檢查的是「這個 PR 合併進目前的 main 之後的樣子」，不只是你的分支。',
          '任何一個 step 失敗（結束碼不是 0），後面的 step 就略過，job 失敗，run 也失敗。',
          '結果記在那個 commit 上，成為 PR 的狀態檢查（status check）：gh 顯示成 `CI/build (pull_request)`，`✓` 是成功、`X` 是失敗、`*` 是排隊或執行中。',
        ] },
        { type: 'p', text: '每次都用全新的機器，是自動建置可靠的原因：它只看得到 commit 裡的檔案，不受你筆電上沒提交的檔案、手動裝過的工具影響，所以「在我的機器上可以跑」的問題會在這裡現形。CI 跑的指令和你在本機跑的是同一組：ci.yml 的四個 `run:` 就是 `npm ci`（依 package-lock.json 安裝相依套件）、`npm run lint`、`npm run build` 與 `npm test`。下面的例子先看 workflow，再在本機跑一次同樣的檢查；lint 沒有任何輸出，表示沒有發現問題。' },
        { type: 'example', id: 'cicd03-local' },
        { type: 'table', head: ['ci.yml 的這幾行', '意思'], rows: [
          ['`on:` 底下的 `push`、`pull_request` 與 `branches: [main]`', '推送到 main、開 PR 到 main 時執行'],
          ['`jobs:` 底下的 `build:`', '一個名為 build 的 job；分支保護要求的檢查，用的就是這個名字'],
          ['`runs-on: ubuntu-latest`', '在 GitHub 提供的 Ubuntu runner 上執行'],
          ['`uses: actions/checkout@v4`、`uses: actions/setup-node@v4`', '取出這次的程式碼、準備好 Node.js'],
          ['`run: npm ci` 以下四行', '依序執行的指令；寫的順序就是檢查的順序'],
        ] },
        { type: 'p', text: '看 run 的結果不必打開網頁，gh 的 `run` 指令就夠了：' },
        { type: 'table', head: ['指令', '看到什麼'], rows: [
          ['`gh run list`', '最近的 run：狀態（`✓` 成功、`X` 失敗、`*` 排隊或執行中、`-` 取消或略過）、標題（推送的最後一個 commit 或 PR 的標題）、workflow、分支、事件、ID、花了多久'],
          ['`gh run watch ID`', '等這個 run 跑完，列出每個 step 的結果（模擬環境直接快轉到結束）'],
          ['`gh run view ID`', '一個 run 的摘要：哪個 job、哪個 step 失敗，失敗時最後一行提示怎麼看日誌'],
          ['`gh run view ID --log-failed`', '只印失敗的 step 的日誌，每行前面是 job 名稱、step 名稱與時間（UTC）'],
          ['`gh pr checks`', '目前分支的 PR 的每個檢查與結果'],
        ] },
        { type: 'p', text: '下面的例子走一次完整的綠燈流程：在新分支 pier-gate 上替 README 加一行售票地點，推送並開 PR。`gh run list` 立刻看到一個由 pull_request 觸發、還在排隊（`*`）的 run；`gh run watch` 等它跑完，每個 step 都是 `✓`；`gh pr checks` 顯示必要的檢查成功，於是可以合併。合併讓 main 前進，這又是一次推送到 main，所以最後的 `gh run list` 多了一個 push 事件的 run，在合併後的 main 上再檢查一次。' },
        { type: 'example', id: 'cicd03-green' },
        { type: 'callout', tone: 'note', title: 'run 的 ID 從哪裡來', text: '`gh run watch`、`gh run view` 都要給 run 的 ID，從 `gh run list` 的 ID 欄抄下來即可。真實的 gh 在終端機上沒給 ID 時會列出最近的 run 讓你選；模擬環境沒有互動式選單，一定要寫出 ID。' },
      ],
    },
    {
      id: 'cicd03-s-feedback', title: '快速回饋：越早知道，修起來越便宜',
      blocks: [
        { type: 'p', text: 'CI 的價值在回饋：變更剛寫完、你還記得每一行為什麼這樣寫的時候，就知道它有沒有問題。回饋拖得越久，修起來越貴：你已經開始做別的事，得重新想起來；同事可能已經以你的變更為基礎繼續寫；好幾個變更疊在一起，也更難判斷是哪一個出錯。回饋太慢還有另一個後果：大家不想等，開始不看結果就合併，CI 就形同虛設。' },
        { type: 'table', head: ['做法', '為什麼', '在本課'], rows: [
          ['推送前先在本機跑快的檢查', '幾秒鐘就能抓到的錯，不必等 runner', '`npm run lint`、`npm test` 在本機也能跑'],
          ['快的檢查排在前面', '一失敗就停，後面的 step 略過，最快知道哪裡錯', 'ci.yml 先 lint、再 build、最後 test'],
          ['讓 pipeline 保持短', '等待越短，大家越願意等結果、越常整合', '比較慢的檢查（例如端對端測試）可以另外處理，CICD05 再談'],
          ['小 commit、常推送', '一次 run 只包含一兩個變更，紅燈時馬上知道原因', 'fares 一次推送了三天的 commit，就得自己找出是哪一個'],
          ['測試要可靠', '時好時壞的測試會讓人不再相信紅燈', 'CICD05 處理不穩定的測試'],
        ] },
        { type: 'p', text: '多快才算快？沒有一個適合所有團隊的數字。極限編程提出的「十分鐘建置」（ten-minute build）是常被引用的經驗法則：自動建置並跑完所有測試，最好在十分鐘以內。重點不是某個秒數，而是讓等待短到大家願意等、願意看結果；建置越拖越長時，就要把它當成需要處理的問題。' },
        { type: 'p', text: '下面的例子在分支 debug-next 上留下一行除錯用的 `console.log`，推送並開 PR。lint 是第一個檢查，它失敗之後 build 與 test 直接略過（`-`），run 很快就結束（模擬環境裡是 8 秒，前面全部通過的 run 是 17 秒）；必要的檢查失敗，`gh pr merge` 被拒絕。`gh run view --log-failed` 只印失敗的那個 step：`src/next.js` 第 3 行有 `no-console` 的錯誤，最後的 `##[error]Process completed with exit code 1.` 表示這個指令以結束碼 1 結束。失敗之後的 Post Run actions/checkout@v4 與 Complete job 是 runner 的收尾，不論成敗都會執行。' },
        { type: 'example', id: 'cicd03-red' },
        { type: 'p', text: '這個錯其實在推送之前就能發現：在本機跑一次 `npm run lint` 只要幾秒鐘。CI 是最後一道、全團隊共用的檢查，不是用來取代你在本機的檢查；反過來，本機通過也不代表 CI 一定通過，因為 CI 檢查的是合併進最新 main 之後的程式，而且只看得到已經提交的檔案。' },
      ],
    },
    {
      id: 'cicd03-s-green', title: '綠燈主分支：讓紅燈的變更進不了 main',
      blocks: [
        { type: 'p', text: 'main 是全團隊共用的起點：每個人的新分支從它開始，部署也從它出發。main 保持綠燈（最新的 commit 通過 CI），代表任何人拉下來都能建置、測試都通過，隨時可以發布。main 一旦變紅，受影響的就不只一個人：每個從它開出的分支都帶著錯誤，每個 PR 的檢查都可能失敗，大家分不清是自己的錯還是 main 的錯。' },
        { type: 'p', text: '「紅燈不合併」不能只靠大家記得。CICD02 學過分支保護（branch protection）：把規則設定在主機上，由主機執行。其中一條是要求的狀態檢查（required status checks）：列出的檢查必須在 PR 上成功才能合併。timetable 的 main 就要求 build 這個檢查。下面的例子用 `gh api` 讀出設定：`required_status_checks` 的 `contexts` 是 `["build"]`，`strict` 是 false。' },
        { type: 'example', id: 'cicd03-protect' },
        { type: 'table', head: ['情況', '主機的反應'], rows: [
          ['PR 的檢查失敗（`X`）', '`gh pr merge` 回覆 the base branch policy prohibits the merge，不能合併'],
          ['PR 的檢查還在跑（`*`）', '同樣不能合併，要等它成功'],
          ['在本機的 main 提交後直接推送', '這個 commit 沒有成功的檢查結果，被 GH006 拒絕：`Required status check "build" is expected.`'],
          ['檢查成功（`✓`）', '可以合併；合併後 main 的推送會再跑一次 CI'],
          ['開啟 strict（Require branches to be up to date before merging）', 'PR 的分支必須包含 main 最新的 commit，否則要先把 main 合併進來、重新通過檢查才能合併'],
        ] },
        { type: 'p', text: 'strict 擋的是一種容易忽略的情況：兩個 PR 各自都是綠燈，合在一起卻壞了。例如 PR 甲把一個函式改了名字，PR 乙在別處新增一次呼叫舊的名字；兩個 PR 檢查時都以當時的 main 為準，各自通過，先後合併之後 main 就紅了。strict 要求每個 PR 在最新的 main 上重新通過檢查，代價是每次有人合併，其他 PR 都要更新、重跑。timetable 沒有開啟它；PR 很多的大型團隊常改用 GitHub 的合併佇列（merge queue），由主機依序把 PR 和前面排隊的變更合在一起檢查。' },
        { type: 'callout', tone: 'warning', title: '要求的檢查名稱是 job 的名字', text: '常見的錯是把要求的檢查寫成 workflow 的名稱 CI。GitHub Actions 回報的檢查名稱是 job 的名字（ci.yml 的 `build:`，gh 顯示成 `CI/build (pull_request)` 的 build），所以主機會一直等一個永遠不會出現、名為 CI 的檢查，所有 PR 都卡在等待中無法合併。設定之後開一個小 PR，確認 `gh pr checks` 的名稱和規則要求的一致。' },
      ],
    },
    {
      id: 'cicd03-s-fix', title: '失敗即修：main 紅燈時先修好它',
      blocks: [
        { type: 'p', text: '有了保護規則，紅燈的 PR 進不了 main，但 main 還是可能變紅：像 fares 這樣還沒設定保護的儲存庫、兩個 PR 合在一起才出現的問題，或是只在 main 上執行的檢查。團隊對紅燈的 main 有一條共同的規則：失敗即修，main 紅燈時，讓它恢復綠燈是全團隊最優先的事。' },
        { type: 'list', ordered: true, items: [
          '先停：不要在紅燈的 main 上再合併其他變更（修正除外）。疊上去的變更讓問題更難找，也看不出新的變更自己有沒有問題。',
          '說一聲：讓團隊知道有人在處理。讓 main 變紅的人最清楚剛改了什麼，通常由他來修；他不在時，誰先發現誰處理。',
          '讀結果：`gh run view ID` 看是哪個 step 失敗，`gh run view ID --log-failed` 看失敗的原因；需要時在本機用同一個指令（例如 `npm test`）重現。',
          '修正或還原：幾分鐘內能修好就直接修；需要比較久，就先用 `git revert` 撤銷造成問題的 commit，讓 main 回到綠燈，再慢慢修。',
          '確認：推送之後等新的 run 跑完，main 目前的 commit 是綠燈，才算結束。推送了就走開，是最常見的漏洞。',
        ] },
        { type: 'table', head: ['做法', '什麼時候用', '結果'], rows: [
          ['修正（往前修）', '原因清楚、改動小，幾分鐘內能完成', '功能保留；但修錯了 main 會繼續紅'],
          ['還原（`git revert` 那個 commit）', '原因還不清楚，或修正需要比較久', 'main 立刻回到上一次綠燈的內容；功能暫時拿掉，修好後再重新提交'],
        ] },
        { type: 'p', text: '讀結果時要注意：一次推送只觸發一個 run，它的標題是推送的最後一個 commit 的訊息，但讓它失敗的不一定是最後一個 commit。一次推送了好幾個 commit 時，要從失敗的內容回推：失敗的是哪個測試？它測的是哪個檔案裡的程式？`git log --oneline -1 -- 檔案` 會印出最後改動那個檔案的 commit。這也是小 commit、常推送的好處：每個 run 只包含一個變更時，紅燈的 run 本身就指出了原因。' },
        { type: 'callout', tone: 'warning', title: '要讓問題消失，不是讓紅燈消失', text: '三種常見但錯誤的做法：一直重新執行（`gh run rerun`）直到碰巧變綠——對每次都會發生的錯沒有用，對時好時壞的測試也只是把問題藏起來；把失敗的測試改成符合目前的結果、刪掉或略過它——CI 變綠了，錯誤卻原封不動地上線；以及「先合併，之後再修」——之後通常不會來。測試失敗時，先假設是程式錯了；只有確認是測試本身寫錯，才改測試，並在 PR 裡說明理由。' },
        { type: 'p', text: 'fares 的紅燈正是這樣產生的：它還沒有分支保護，你一次推送了三天的 commit，沒有任何東西擋下來。修好之後，也替 fares 的 main 要求 build 檢查。用的是 CICD02 學過的 `gh api -X PUT …/branches/main/protection`，要求的檢查寫成 `-F \'required_status_checks[strict]=false\' -F \'required_status_checks[contexts][]=build\'`，`[]` 表示在陣列裡加入一個元素；另外三個必要欄位照舊（不需要的寫 null）。之後 fares 的變更也要先在 PR 上通過 CI，才能進入 main。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd03-q-ci', prompt: '下列哪一個最符合持續整合（CI）的做法？',
      options: ['設好 CI 伺服器之後，每個人在自己的分支開發，功能完成再一次合併', '每週五由一個人把所有分支合併起來，再一起跑完整的測試', '每個人每天把小變更併回 main，每次都自動建置與測試', '只要單元測試寫得夠多，什麼時候合併都沒有關係'],
      answer: 2,
      explanation: 'CI 是頻繁整合加上自動驗證：每天把小變更併回 main，由自動的建置與測試確認整合後仍然正常。只設 CI 伺服器而分支一開幾週，整合仍被拖到最後；每週由一個人合併所有分支，正是整合地獄的來源；測試再多，分開越久衝突與互相影響越多，仍然需要頻繁整合。',
    },
    {
      id: 'cicd03-q-flow', prompt: '你推送了分支，並開了一個到 main 的 Pull Request。依 timetable 的 ci.yml，接下來會發生什麼？',
      options: ['GitHub 在全新的 runner 上跑 lint、build、test，結果成為 PR 的檢查', 'GitHub 透過網路遠端連到你的筆電，在上面執行 `npm test`，再把結果上傳到這個 PR 上', '只有推送到 main 才會跑 CI，所以 PR 要等合併進 main 之後才會被檢查', '要等審查者核准這個 PR 之後，GitHub 才會開始建置與測試它的程式'],
      answer: 0,
      explanation: 'ci.yml 的 `on:` 包含開到 main 的 pull_request，所以開 PR 就建立 run；job 在全新的 runner 上取出程式、依序執行 step，結果記在 PR 上成為狀態檢查。CI 不會在你的筆電上執行；PR 在合併前就檢查，這正是它的用意；CI 的觸發和審查無關，不必等核准。',
    },
    {
      id: 'cicd03-q-order', prompt: 'timetable 的 ci.yml 把 `npm run lint` 放在 `npm run build` 與 `npm test` 前面。主要的好處是什麼？',
      options: ['lint 會自動修正程式碼的格式，讓後面的測試比較容易通過', 'GitHub 規定程式碼檢查一定要是 workflow 的第一個 step', '這樣即使 lint 失敗，build 與 test 仍然會照常執行完', 'lint 很快，失敗時後面的 step 略過，最早得到回饋'],
      answer: 3,
      explanation: '快的檢查排在前面：錯在 lint 時幾秒內就失敗，後面較慢的 build 與 test 直接略過，回饋最快，也省下 runner 的時間。`npm run lint`（eslint src）只檢查並回報問題，不會修改程式；GitHub 沒有規定 step 的順序；一個 step 失敗後，沒有特別設定的後續 step 會被略過，不會照常執行。',
    },
    {
      id: 'cicd03-q-blocked', prompt: '你的 PR 的 `gh pr checks` 顯示 `X  CI/build (pull_request)`，`gh pr merge --squash` 回覆 the base branch policy prohibits the merge。下一步最恰當的是什麼？',
      options: ['改用 `gh pr merge --merge`，換一種合併方式就能合併進去', '讀 `--log-failed` 找原因，在同一個分支修好推送，等檢查變綠再合併', '切到 main，在本機把這個分支合併進 main，然後直接 `git push` 上去', '關掉這個 PR，再開一個一模一樣的新 PR，讓檢查重新跑一次'],
      answer: 1,
      explanation: 'main 要求 build 檢查成功，所以合併被擋；正確的做法是看失敗的日誌，在 PR 的分支上修正並推送，新的 run 成功後再合併。合併方式和狀態檢查無關，換方式一樣被擋；直接推送到 main 的 commit 沒有成功的檢查結果，會被 GH006 拒絕；重開一模一樣的 PR，程式沒變，檢查一樣失敗。',
    },
    {
      id: 'cicd03-q-red-main', prompt: '你推送到 main 之後 CI 變紅了，同事說他還有兩個 PR 正等著合併。團隊應該怎麼做？',
      options: ['照常合併同事的 PR，main 的問題等下週大家都有空的時候再處理', '先把兩個 PR 都合併進來，等 main 上的變更全部到齊之後再一起找出原因', '暫停合併，先修好或 revert 造成失敗的 commit，讓 main 變綠', '暫時停用 CI 的 workflow，等你修好之後再把它重新啟用'],
      answer: 2,
      explanation: '失敗即修：main 紅燈時，讓它恢復綠燈是最優先的事，期間不再疊上其他變更；能很快修好就修，否則先 revert。照常合併或先合併再找，會讓同事的變更也建立在壞掉的 main 上，問題越疊越難找；停用 CI 只是不再看到紅燈，錯誤仍然在 main 上。',
    },
    {
      id: 'cicd03-q-test', prompt: 'CI 的日誌顯示 `Expected: 60`、`Received: 118`：測試期待兒童票是 60，程式算出 118。同事說：「把測試改成 118 就綠了。」你怎麼回應？',
      options: ['兒童票應該是成人票 120 的一半，要修的是程式，不是測試', '同意，CI 變綠就代表程式是正確的，可以放心合併', '先把這個測試刪掉，等以後有空再補一個新的測試', '一直執行 `gh run rerun`，直到這個測試碰巧通過為止'],
      answer: 0,
      explanation: '測試記錄的是應有的行為：兒童票是成人票（120）的一半，60 是對的，118 是 childFare 寫成減 2 的錯。改測試或刪測試會讓 CI 變綠，錯誤卻照樣上線；這個錯每次都會發生，重新執行不會碰巧通過，就算是時好時壞的測試，重跑也只是把問題藏起來。',
    },
    {
      id: 'cicd03-q-culprit', prompt: '你一次推送了三個 commit 到 main。CI 的 run 標題是 `Mention the winter timetable`（最後一個 commit，只改了 README），失敗的測試是 `a child pays half`。下列哪個推論正確？',
      options: ['run 的標題就是造成失敗的 commit，所以是 README 的修改出了錯', 'README 不會影響測試，所以一定是 CI 本身壞了，重新執行即可', '三個 commit 都要 revert，才能確定 main 會變回綠燈', 'run 檢查的是這次推送的全部 commit，要從失敗的測試回推是哪一個'],
      answer: 3,
      explanation: '一次推送只觸發一個 run，標題取最後一個 commit 的訊息，但檢查的是推送後 main 的全部內容；失敗的測試在測 childFare，應該找改動 src/fare.js 的 commit。README 只是剛好在最後；失敗有明確的測試與期待值，不是 CI 壞了；全部 revert 會丟掉沒有問題的工作，只需要處理造成失敗的那一個。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd03-local', title: 'CI 跑的就是本機的那幾個指令', machine: 'cicd03-lab',
        description: '先看 timetable 的 workflow 與 gh 認得的 workflow，再在本機依序跑 lint、build、test，和 CI 的 step 一樣。',
        steps: [
          { command: 'cd timetable', output: '' },
          { command: 'cat .github/workflows/ci.yml', output: 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci\n      - run: npm run lint\n      - run: npm run build\n      - run: npm test' },
          { command: 'gh workflow list', output: 'NAME  STATE   ID\nCI    active  468100089' },
          { command: 'npm run lint', output: '' },
          { command: 'npm run build', output: 'Built public/index.html' },
          { command: 'npm test', output: 'PASS test/next.test.js\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total' },
        ],
      },
      {
        id: 'cicd03-hell', title: '三週沒有整合的分支', machine: 'cicd03-lab',
        description: 'big-redesign 有 3 個 commit，main 這段時間多了 5 個；合併時三個檔案衝突，最後用 --abort 退回。',
        steps: [
          { command: 'cd timetable', output: '' },
          { command: 'git switch big-redesign', output: 'Switched to branch \'big-redesign\'' },
          { command: 'git log --oneline main..big-redesign', output: '5ba820b (HEAD -> big-redesign) Describe the routes in the README\n27cfa07 Find the next sailing per route\n828bcad Group sailings by route' },
          { command: 'git log --oneline big-redesign..main', output: '10c7a82 (origin/main, origin/HEAD, main) Add the 19:15 evening sailing\n2412fdb Sort sailings by departure time\n77bd948 Note the holiday timetable\n8a76da4 Test the last sailing of the day\n45b7740 Add the 12:00 sailing' },
          { command: 'git merge main', output: 'Auto-merging README.md\nCONFLICT (content): Merge conflict in README.md\nAuto-merging src/next.js\nCONFLICT (content): Merge conflict in src/next.js\nAuto-merging src/sailings.js\nCONFLICT (content): Merge conflict in src/sailings.js\nAuto-merging test/next.test.js\nAutomatic merge failed; fix conflicts and then commit the result.' },
          { command: 'git status -s', output: 'UU README.md\nUU src/next.js\nUU src/sailings.js\nM  test/next.test.js' },
          { command: 'git merge --abort', output: '' },
        ],
      },
      {
        id: 'cicd03-green', title: '一次推送觸發的檢查：綠燈之後合併', machine: 'cicd03-lab',
        description: '在分支上改 README、推送、開 PR，等 pull_request 的 run 跑完，檢查成功後合併；合併讓 main 前進，又觸發一個 push 的 run。',
        steps: [
          { command: 'cd timetable', output: '' },
          { command: 'git switch -c pier-gate', output: 'Switched to a new branch \'pier-gate\'' },
          { command: 'echo \'Tickets: Harbor Point pier, gate 2.\' >> README.md', output: '' },
          { command: 'git commit -am \'Say where to buy tickets\'', output: '[pier-gate 2deb668] Say where to buy tickets\n 1 file changed, 1 insertion(+)' },
          { command: 'git push -u origin pier-gate', output: 'remote: \nremote: Create a pull request for \'pier-gate\' on GitHub by visiting:\nremote:      https://github.example/harborline/timetable/pull/new/pier-gate\nremote: \nTo https://github.example/harborline/timetable.git\n * [new branch]      pier-gate -> pier-gate\nbranch \'pier-gate\' set up to track \'origin/pier-gate\'.' },
          { command: 'gh pr create --title \'Say where to buy tickets\' --body \'Riders keep asking at the wrong gate.\'', output: '\nCreating pull request for pier-gate into main in harborline/timetable\n\nhttps://github.example/harborline/timetable/pull/1' },
          { command: 'gh run list', output: 'STATUS  TITLE                     WORKFLOW  BRANCH     EVENT         ID          ELAPSED  AGE\n*       Say where to buy tickets  CI        pier-gate  pull_request  4100000001  0s       less than a minute ago' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ pier-gate CI #1 · 4100000001\nTriggered via pull_request less than a minute ago\n\nJOBS\n✓ build in 17s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  ✓ Run npm run lint\n  ✓ Run npm run build\n  ✓ Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run CI (4100000001) completed with \'success\'' },
          { command: 'gh pr checks', output: 'All checks were successful\n0 cancelled, 0 failing, 1 successful, 0 skipped, and 0 pending checks\n\n   NAME                     DESCRIPTION  ELAPSED  URL\n✓  CI/build (pull_request)               17s      https://github.example/harborline/timetable/actions/runs/4100000001/job/11300000001' },
          { command: 'gh pr merge --squash --delete-branch', output: '✓ Squashed and merged pull request harborline/timetable#1 (Say where to buy tickets)\nFrom https://github.example/harborline/timetable\n * branch            main       -> FETCH_HEAD\n   10c7a82..6bbb18d  main       -> origin/main\nUpdating 10c7a82..6bbb18d\nFast-forward\n README.md | 1 +\n 1 file changed, 1 insertion(+)\n✓ Deleted local branch pier-gate and switched to branch main\n✓ Deleted remote branch pier-gate' },
          { command: 'gh run list', output: 'STATUS  TITLE                          WORKFLOW  BRANCH     EVENT         ID          ELAPSED  AGE\n*       Say where to buy tickets (#1)  CI        main       push          4100000002  0s       less than a minute ago\n✓       Say where to buy tickets       CI        pier-gate  pull_request  4100000001  19s      less than a minute ago' },
        ],
      },
      {
        id: 'cicd03-red', title: '快的檢查先失敗，紅燈的 PR 不能合併', machine: 'cicd03-lab',
        description: '留下一行 console.log 推送並開 PR：lint 失敗、build 與 test 略過，合併被拒絕，--log-failed 只印失敗的 step。',
        steps: [
          { command: 'cd timetable', output: '' },
          { command: 'git switch -c debug-next', output: 'Switched to a new branch \'debug-next\'' },
          { command: 'echo "console.log(\'next sailing\');" >> src/next.js', output: '' },
          { command: 'git commit -am \'Log the next sailing\'', output: '[debug-next 0c995ea] Log the next sailing\n 1 file changed, 1 insertion(+)' },
          { command: 'git push -u origin debug-next', output: 'remote: \nremote: Create a pull request for \'debug-next\' on GitHub by visiting:\nremote:      https://github.example/harborline/timetable/pull/new/debug-next\nremote: \nTo https://github.example/harborline/timetable.git\n * [new branch]      debug-next -> debug-next\nbranch \'debug-next\' set up to track \'origin/debug-next\'.' },
          { command: 'gh pr create --title \'Log the next sailing\' --body \'For debugging.\'', output: '\nCreating pull request for debug-next into main in harborline/timetable\n\nhttps://github.example/harborline/timetable/pull/1' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX debug-next CI #1 · 4100000001\nTriggered via pull_request less than a minute ago\n\nJOBS\nX build in 8s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run actions/setup-node@v4\n  ✓ Run npm ci\n  X Run npm run lint\n  - Run npm run build\n  - Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\nbuild: .github#5\n\nX Run CI (4100000001) completed with \'failure\'' },
          { command: 'gh pr checks', output: 'Some checks were not successful\n0 cancelled, 1 failing, 0 successful, 0 skipped, and 0 pending checks\n\n   NAME                     DESCRIPTION  ELAPSED  URL\nX  CI/build (pull_request)               8s       https://github.example/harborline/timetable/actions/runs/4100000001/job/11300000001' },
          { command: 'gh pr merge --squash', output: 'X Pull request harborline/timetable#1 is not mergeable: the base branch policy prohibits the merge.\nTo have the pull request merged after all the requirements have been met, add the `--auto` flag.\nTo use administrator privileges to immediately merge the pull request, add the `--admin` flag.' },
          { command: 'gh run view 4100000001 --log-failed', output: 'build\tRun npm run lint\t2026-11-23T02:00:08.0000000Z ##[group]Run npm run lint\nbuild\tRun npm run lint\t2026-11-23T02:00:08.0000000Z npm run lint\nbuild\tRun npm run lint\t2026-11-23T02:00:08.0000000Z shell: /usr/bin/bash -e {0}\nbuild\tRun npm run lint\t2026-11-23T02:00:08.0000000Z ##[endgroup]\nbuild\tRun npm run lint\t2026-11-23T02:00:10.0000000Z src/next.js\nbuild\tRun npm run lint\t2026-11-23T02:00:10.0000000Z   3:1  error  Unexpected console statement  no-console\nbuild\tRun npm run lint\t2026-11-23T02:00:10.0000000Z \nbuild\tRun npm run lint\t2026-11-23T02:00:10.0000000Z ✖ 1 problem (1 error, 0 warnings)\nbuild\tRun npm run lint\t2026-11-23T02:00:10.0000000Z ##[error]Process completed with exit code 1.' },
        ],
      },
      {
        id: 'cicd03-protect', title: '讀出 main 要求的檢查', machine: 'cicd03-lab',
        description: '用 gh api 讀 timetable 的 main 的分支保護：要求 build 檢查、不要求和 main 同步（strict 為 false）。',
        steps: [
          { command: 'cd timetable', output: '' },
          { command: 'gh api repos/{owner}/{repo}/branches/main/protection', output: '{\n  "url": "https://github.example/api/v3/repos/harborline/timetable/branches/main/protection",\n  "required_status_checks": {\n    "url": "https://github.example/api/v3/repos/harborline/timetable/branches/main/protection/required_status_checks",\n    "strict": false,\n    "contexts": [\n      "build"\n    ],\n    "contexts_url": "https://github.example/api/v3/repos/harborline/timetable/branches/main/protection/required_status_checks/contexts",\n    "checks": [\n      {\n        "context": "build",\n        "app_id": null\n      }\n    ]\n  },\n  "required_signatures": {\n    "url": "https://github.example/api/v3/repos/harborline/timetable/branches/main/protection/required_signatures",\n    "enabled": false\n  },\n  "enforce_admins": {\n    "url": "https://github.example/api/v3/repos/harborline/timetable/branches/main/protection/enforce_admins",\n    "enabled": false\n  },\n  "required_linear_history": {\n    "enabled": false\n  },\n  "allow_force_pushes": {\n    "enabled": false\n  },\n  "allow_deletions": {\n    "enabled": false\n  },\n  "block_creations": {\n    "enabled": false\n  },\n  "required_conversation_resolution": {\n    "enabled": false\n  },\n  "lock_branch": {\n    "enabled": false\n  },\n  "allow_fork_syncing": {\n    "enabled": false\n  }\n}' },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd03-ex-culprit', title: '找出讓 main 變紅的 commit', machine: 'cicd03-lab',
        statement: '你這三天在 fares 做了三個 commit，一直沒有推送。在 fares 資料夾把它們推送到 main，等 CI 跑完（它會失敗）。run 的標題是最後一個 commit，但讓測試失敗的不一定是它：從失敗的 step 的日誌看出是哪一個測試失敗、它測的是哪個檔案裡的程式，最後用 `git log --oneline -1 -- 檔案` 印出最後改動那個檔案的 commit，那就是答案。',
        checks: [
          { kind: 'run', repo: FARES, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'failure' },
          { kind: 'output', fromCommand: '^git log ' },
        ],
        solution: [...PUSH_FARES, 'gh run view 4100000001 --log-failed', 'git log --oneline -1 -- src/fare.js'],
        mistakes: [
          { commands: [...PUSH_FARES, 'git log --oneline -1'], why: '把 run 的標題當成答案：最後一個 commit Mention the winter timetable 只改了 README，和失敗的測試無關' },
          { commands: [...PUSH_FARES, 'gh run view 4100000001 --log-failed', 'git log --oneline -1 -- src/format.js'], why: '查錯了檔案：失敗的 a child pays half 測的是 src/fare.js 的 childFare，不是 src/format.js 的價格格式' },
          { commands: ['cd fares', 'git log --oneline -1 -- src/fare.js'], why: '沒有推送、也沒有等 CI：main 上沒有任何 run，答案沒有根據 CI 的結果' },
          { commands: ['cd fares', 'git push', 'git log --oneline -1 -- src/fare.js'], why: '推送之後沒有等 run 跑完就下結論：run 還在執行，還不知道它會不會失敗、失敗在哪裡' },
        ],
        variants: [{ label: '第一個 commit 的訊息不同', files: [], git: GIT_VARIANT }],
        hints: ['`git push` 之後用 `gh run list` 找到 run 的 ID，`gh run watch ID` 等它跑完', '`gh run view ID --log-failed` 看失敗的測試名稱：a child pays half 在測 childFare', 'childFare 寫在 src/fare.js：`git log --oneline -1 -- src/fare.js`'],
        explanation: '一次推送只有一個 run，它的標題是最後一個 commit，但失敗來自三天份的變更中的某一個。日誌指出失敗的是 a child pays half，也就是 src/fare.js 的 childFare；`git log --oneline -1 -- src/fare.js` 印出最後改動它的 commit，就是讓 main 變紅的 Add child fares。如果每個 commit 都分開推送，CI 自己就會在那一個 commit 上亮紅燈。',
      },
      {
        id: 'cicd03-ex-fix', title: '先修好紅燈的 main', machine: 'cicd03-lab',
        statement: '在 fares 資料夾把三個 commit 推送到 main，CI 會變紅。main 紅燈時先修好它：從 run 的日誌找出失敗的 step 與原因，修正 src/fare.js 的 childFare（兒童票是成人票的一半；保留兒童票的功能，也不要改測試），提交並推送，然後等新的 run 跑完，確認 main 目前的 commit 是綠燈。',
        checks: [
          { kind: 'run', repo: FARES, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' },
          { kind: 'branch', repo: FARES, name: 'main', file: { path: 'test/fare.test.js', content: FARE_TEST_K1 } },
          { kind: 'branch', repo: FARES, name: 'main', file: { path: 'src/fare.js', includes: 'childFare' } },
        ],
        solution: [...PUSH_FARES, 'gh run view 4100000001 --log-failed', FARE_FIX, 'npm test', "git commit -am 'Fix the child fare'", 'git push', 'gh run watch 4100000002'],
        mistakes: [
          { commands: [...PUSH_FARES, FARE_TEST_EDITED, "git commit -am 'Fix the child fare test'", 'git push', 'gh run watch 4100000002'], why: '把測試改成 118 來配合錯誤的程式：CI 變綠了，兒童票卻照樣收 118 元' },
          { commands: [...PUSH_FARES, FARE_FIX, "git commit -am 'Fix the child fare'", 'git push'], why: '推送修正之後沒有等新的 run 跑完：main 目前的 commit 還沒有結果，不知道它是不是真的綠了' },
          { commands: [...PUSH_FARES, 'gh run rerun 4100000001', 'gh run watch 4100000001'], why: '沒有修正就重新執行：程式沒變，測試每次都一樣失敗' },
          { commands: [...PUSH_FARES, 'git revert --no-edit HEAD~2', 'git push', 'gh run watch 4100000002'], why: '還原了 Add child fares：main 是綠了，但兒童票的功能也不見了；修不快時這是正確的選擇，這裡的修正只要一行' },
        ],
        hints: ['先在本機跑 `npm test`，看到和 CI 一樣的失敗', `兒童票是成人票的一半：\`${FARE_FIX}\``, '提交、`git push` 之後，用 `gh run list` 找到新的 run，`gh run watch ID` 等它跑完'],
        explanation: '失敗即修：日誌指出 a child pays half 期待 60 卻得到 118，原因是 childFare 寫成 `adultFare(zones) - 2`。改成 `/ 2` 之後先在本機跑 `npm test` 確認，再推送並等新的 run 跑完，main 目前的 commit 才確定是綠燈。改測試會讓錯誤上線，重新執行不會改變結果；revert 也能讓 main 變綠，但會拿掉整個功能，適合原因不明或修正需要比較久的時候。',
      },
      {
        id: 'cicd03-ex-pr', title: '紅燈的 Pull Request：修好再合併', machine: 'cicd03-lab',
        statement: 'timetable 的 main 要求 build 檢查成功才能合併。你在分支 night-sailings 上加了 22:15 的夜班船，還沒推送。在 timetable 資料夾推送這個分支、開一個到 main 的 Pull Request（標題 Add the 22:15 night sailing，說明自己寫），等 CI 跑完。檢查失敗時，從日誌找出原因，在同一個分支上修好、推送，等新的 run 變綠，再合併這個 PR（團隊慣例是 squash 並刪除分支）。',
        checks: [
          { kind: 'pull-request', repo: TIMETABLE, head: 'night-sailings', state: 'merged', checks: 'success' },
          { kind: 'branch', repo: TIMETABLE, name: 'main', file: { path: 'src/sailings.js', includes: "{ route: 'HP-GI', departs: '22:15' }" } },
        ],
        solution: [...OPEN_PR, 'gh run view 4100000001 --log-failed', NIGHT_FIX, "git commit -am 'Fix the night sailing time'", 'git push', 'gh run watch 4100000002', 'gh pr merge --squash --delete-branch'],
        mistakes: [
          { commands: [...OPEN_PR, 'gh pr merge --squash --delete-branch'], why: '檢查失敗還想合併：main 要求 build 成功，主機拒絕合併，PR 仍然開著' },
          { commands: [...OPEN_PR, 'gh pr merge --squash --admin'], why: '用 --admin 硬闖：你在 timetable 只有寫入權限，不能繞過規則，合併被拒絕' },
          { commands: [...OPEN_PR, 'git switch main', 'git merge night-sailings', NIGHT_FIX, "git commit -am 'Fix the night sailing time'", 'git push'], why: '在 main 上修好直接推送：這些 commit 沒有成功的檢查結果，被 GH006 拒絕，PR 也還開著' },
          { commands: [...OPEN_PR, NIGHT_FIX, "git commit -am 'Fix the night sailing time'", 'git push', 'gh pr merge --squash --delete-branch'], why: '推送修正後沒有等新的 run：檢查還在執行（pending），合併被拒絕' },
        ],
        hints: ['`git switch night-sailings`、`git push -u origin night-sailings`，再 `gh pr create --title … --body …`', '`gh run watch ID` 等它跑完；`gh run view ID --log-failed` 看 build 為什麼失敗', `時間要寫成 HH:MM：\`${NIGHT_FIX}\``, '`git commit -am …`、`git push`，`gh run watch` 新的 run，綠燈後 `gh pr merge --squash --delete-branch`'],
        explanation: '必要的狀態檢查讓紅燈的 PR 進不了 main：build 的日誌指出 2215 不是 HH:MM 格式。修正推送到同一個分支，PR 自動更新並觸發新的 run；等它成功，合併才被允許。在 main 上直接推送、用 --admin（沒有管理員權限）或不等檢查完成就合併，都會被主機拒絕。',
      },
      {
        id: 'cicd03-ex-require', title: '替 fares 的 main 要求 build 檢查', machine: 'cicd03-lab',
        statement: 'fares 還沒有任何分支保護，所以紅燈的 commit 可以直接進入 main。你是 fares 的管理員。在 fares 資料夾用 `gh api` 替 main 設定分支保護：要求 CI 的 build 檢查成功（strict 為 false），管理員也要遵守（enforce_admins 為 true），不要求審查（required_pull_request_reviews 為 null），沒有推送限制（restrictions 為 null）。',
        checks: [{ kind: 'protection', repo: FARES, branch: 'main', checks: ['build'] }],
        solution: ['cd fares', PROTECT('build')],
        mistakes: [
          { commands: ['cd fares', PROTECT('CI')], why: '要求的檢查寫成 workflow 的名稱 CI：回報的檢查名稱是 job 的名字 build，主機會一直等一個不存在的檢查' },
          { commands: ['cd fares', "gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F 'required_status_checks[strict]=false' -F 'required_status_checks[contexts][]=build' -F enforce_admins=true -F required_pull_request_reviews=null"], why: '少了必要的 restrictions 欄位：主機回 HTTP 422，設定沒有改變' },
          { commands: ['cd fares', 'gh api repos/{owner}/{repo}/branches/main/protection'], why: '只讀取了設定（目前沒有保護，HTTP 404），沒有用 -X PUT 設定' },
          { commands: ['cd timetable', PROTECT('build')], why: '在 timetable 執行：你在那裡只有寫入權限，主機回 HTTP 403，fares 也沒有被設定' },
        ],
        hints: ['端點是 `repos/{owner}/{repo}/branches/main/protection`，用 `gh api -X PUT`，gh 會依 origin 代入 harborline/fares', "要求的檢查：`-F 'required_status_checks[strict]=false' -F 'required_status_checks[contexts][]=build'`", '另外三個必要欄位：`-F enforce_admins=true -F required_pull_request_reviews=null -F restrictions=null`'],
        explanation: '要求的狀態檢查讓主機替團隊執行「紅燈不進 main」：之後 fares 的變更要先在 PR 上讓 build 成功，直接推送沒有檢查結果的 commit 也會被拒絕。檢查的名稱是 job 的名字 build，不是 workflow 的名稱；PUT 是整份取代，四個必要欄位都要給，而且要有管理員權限。',
      },
    ],
  },
};
