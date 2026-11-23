import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { LessonContent } from '../schema';

/*
 * CICD07 環境變數與設定管理 (the blueprint's pipeline-sim, terminal-sim on the artifacts profile: engine stages E25 git,
 * E26 forge, E27 workflows, E28 actions and E29 artifacts for Actions variables and environments). A made-up bike-share
 * team, Kestrel, on the simulated github.example: Lai Yu (the learner, gh login yu-lai, admin of both repositories) and
 * Ho Jun, who wrote the code. kestrel/dock-status still hard-codes its production settings in bin/config.sh (its history
 * switches them to staging and back); Ho Jun's CI runs test/config-test.sh, which expects the settings to come from the
 * environment with development defaults, so it fails. kestrel/rider-api already reads the environment (same defaults),
 * has a .env.example and a .gitignore, a CI workflow that maps repository variables into env, and a Deploy workflow with
 * a target input but no environment: on its job. Its repository variables are API_BASE_URL (the test API) and a
 * misspelt DB_HSOT; the environments staging and production carry DB_HOST and FEATURE_PASSES but no API_BASE_URL. The
 * clock is 2026-11-25 02:00 UTC (10:00 in Asia/Taipei); runners log in UTC. Organisation, people, hosts and addresses
 * are made up; every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const DOCK = 'https://github.example/kestrel/dock-status.git';
const RIDER = 'https://github.example/kestrel/rider-api.git';
const YU = { name: 'Lai Yu', email: 'yu@kestrel.example' }, JUN = { name: 'Ho Jun', email: 'jun@kestrel.example' };
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** A command writing this text to the file with a quoted here-document (the text ends with a newline). */
const heredoc = (path: string, text: string, append = false) => `cat ${append ? '>>' : '>'} ${path} <<'EOF'\n${text}EOF`;

const HARD = (api: string, db: string) => wf('#!/bin/bash', '# dock-status settings', `API_BASE_URL=${api}`, `DB_HOST=${db}`, 'LOG_LEVEL=warn', 'FEATURE_MAP=on',
  'echo "dock-status config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL map=$FEATURE_MAP"');
const DOCK_FIXED = (api = 'http://localhost:4000', db = 'localhost', colon = ':') => wf('#!/bin/bash', '# Settings come from the environment; the defaults are for local development.',
  `API_BASE_URL=\${API_BASE_URL${colon}-${api}}`, `DB_HOST=\${DB_HOST${colon}-${db}}`, `LOG_LEVEL=\${LOG_LEVEL${colon}-info}`, `FEATURE_MAP=\${FEATURE_MAP${colon}-off}`,
  'echo "dock-status config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL map=$FEATURE_MAP"');
const CONFIG_TEST = wf('#!/bin/bash', '# bin/config.sh must read the environment and fall back to the development defaults.',
  'out=$(API_BASE_URL=https://api.ci.example DB_HOST=db.ci.example LOG_LEVEL=debug FEATURE_MAP=on bash bin/config.sh)',
  'if [ "$out" = "dock-status config: api=https://api.ci.example db=db.ci.example log=debug map=on" ]; then echo "ok 1 - reads the environment"; else echo "not ok 1 - reads the environment: $out"; exit 1; fi',
  'out=$(unset API_BASE_URL DB_HOST LOG_LEVEL FEATURE_MAP; bash bin/config.sh)',
  'if [ "$out" = "dock-status config: api=http://localhost:4000 db=localhost log=info map=off" ]; then echo "ok 2 - development defaults"; else echo "not ok 2 - development defaults: $out"; exit 1; fi');
const DOCK_CI = wf('name: CI', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - name: Config test', '        run: bash test/config-test.sh', '      - name: Show config', '        run: bash bin/config.sh', '        env:',
  '          API_BASE_URL: ${{ vars.API_BASE_URL }}', '          DB_HOST: ${{ vars.DB_HOST }}');

const RIDER_CONFIG = wf('#!/bin/bash', '# Settings come from the environment; the defaults are for local development.',
  'API_BASE_URL=${API_BASE_URL:-http://localhost:4000}', 'DB_HOST=${DB_HOST:-localhost}', 'LOG_LEVEL=${LOG_LEVEL:-info}', 'FEATURE_PASSES=${FEATURE_PASSES:-off}',
  'echo "rider-api config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL passes=$FEATURE_PASSES"');
const RIDER_CI = wf('name: CI', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    env:',
  '      API_BASE_URL: ${{ vars.API_BASE_URL }}', '      DB_HOST: ${{ vars.DB_HOST }}', '    steps:', '      - uses: actions/checkout@v4', '      - name: Show config', '        run: bash bin/config.sh');
const RIDER_DEPLOY = wf('name: Deploy', 'on:', '  workflow_dispatch:', '    inputs:', '      target:', '        type: choice', '        options: [staging, production]', 'permissions:',
  '  contents: read', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    env:', '      API_BASE_URL: ${{ vars.API_BASE_URL }}', '      DB_HOST: ${{ vars.DB_HOST }}',
  '      FEATURE_PASSES: ${{ vars.FEATURE_PASSES }}', '    steps:', '      - uses: actions/checkout@v4', '      - name: Show config', '        run: bash bin/config.sh',
  '      - run: echo "Deploying rider-api to ${{ inputs.target }}"');

const COMMITS: TerminalGitCommit[] = [
  { id: 'd1', message: 'Initial commit', author: JUN, time: '2026-10-06 02:00:00', files: {
    'README.md': '# dock-status\n\nBikes and free racks at every Kestrel dock.\n', 'bin/config.sh': HARD('https://api.kestrel.example', 'db-prod.kestrel.internal'),
  } },
  { id: 'd2', message: 'Point at staging for the demo', author: JUN, time: '2026-11-02 03:00:00', files: { 'bin/config.sh': HARD('https://api.staging.kestrel.example', 'db-staging.kestrel.internal') } },
  { id: 'd3', message: 'Point back at production', author: JUN, time: '2026-11-04 03:00:00', files: { 'bin/config.sh': HARD('https://api.kestrel.example', 'db-prod.kestrel.internal') } },
  { id: 'd4', message: 'Add CI with a config test', author: JUN, time: '2026-11-20 03:00:00', files: { 'test/config-test.sh': CONFIG_TEST, '.github/workflows/ci.yml': DOCK_CI } },
  { id: 'r1', parents: [], message: 'Initial commit', author: JUN, time: '2026-11-10 02:00:00', files: {
    'README.md': '# rider-api\n\nAccounts, rides and passes for Kestrel riders.\n', 'bin/config.sh': RIDER_CONFIG, '.gitignore': '.env\nnode_modules/\n',
    '.env.example': '# Copy to .env for local development. Never commit .env.\nAPI_BASE_URL=http://localhost:4000\nDB_HOST=localhost\nLOG_LEVEL=debug\nFEATURE_PASSES=on\n',
  } },
  { id: 'r2', message: 'Add CI and deploy workflows', author: JUN, time: '2026-11-18 03:00:00', files: { '.github/workflows/ci.yml': RIDER_CI, '.github/workflows/deploy.yml': RIDER_DEPLOY } },
];

const lab: TerminalMachine = {
  id: 'cicd07-lab', title: 'yu-laptop（Kestrel 單車團隊的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'yu-laptop', profile: 'artifacts',
  timezone: 'Asia/Taipei', now: '2026-11-25 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: YU, commits: COMMITS,
    remotes: [{ url: DOCK, branches: { main: 'd4' } }, { url: RIDER, branches: { main: 'r2' } }],
    repos: [{ path: '/home/learner/dock-status', origin: DOCK }, { path: '/home/learner/rider-api', origin: RIDER }],
  },
  forge: { login: 'yu-lai', repos: [
    { url: DOCK, description: 'Bikes and free racks at every Kestrel dock', permission: 'admin', environments: ['staging', 'production'] },
    { url: RIDER, description: 'Accounts, rides and passes for Kestrel riders', permission: 'admin', environments: ['staging', 'production'], variables: [
      { name: 'API_BASE_URL', value: 'https://api.test.kestrel.example', updated: '2026-11-18 03:10:00' },
      { name: 'DB_HSOT', value: 'db-test.kestrel.internal', updated: '2026-11-18 03:10:00' },
      { name: 'DB_HOST', value: 'db-staging.kestrel.internal', env: 'staging', updated: '2026-11-19 06:00:00' },
      { name: 'FEATURE_PASSES', value: 'on', env: 'staging', updated: '2026-11-19 06:00:00' },
      { name: 'DB_HOST', value: 'db-prod.kestrel.internal', env: 'production', updated: '2026-11-19 06:00:00' },
      { name: 'FEATURE_PASSES', value: 'off', env: 'production', updated: '2026-11-19 06:00:00' },
    ] },
  ] },
  actions: {},
};

// Example 3: where a value comes from inside a workflow (written in two pieces: a typed command is at most 500 characters).
const LEVELS = wf('name: Levels', 'on: workflow_dispatch', 'env:', '  LOG_LEVEL: warn', '  REGION: ap-east', 'jobs:', '  show:', '    runs-on: ubuntu-latest', '    env:', '      LOG_LEVEL: info',
  '    steps:', '      - run: echo "job sees LOG_LEVEL=$LOG_LEVEL REGION=$REGION"', '      - run: echo "step sees LOG_LEVEL=$LOG_LEVEL"', '        env:', '          LOG_LEVEL: debug');
const LEVELS_MORE = wf('      - run: echo "env [$API_BASE_URL] vars [${{ vars.API_BASE_URL }}]"', '      - run: echo "BUILD_ID=rider-${{ github.run_number }}-$(date -u +%Y%m%d)" >> "$GITHUB_ENV"',
  '      - run: echo "next step sees BUILD_ID=$BUILD_ID"');

// Exercise 1: dock-status reads the environment; the CI's test environment comes from repository variables.
const SET_TEST_VARS = ['gh variable set API_BASE_URL --body https://api.test.kestrel.example', 'gh variable set DB_HOST --body db-test.kestrel.internal'];
const PUSH_DOCK = ["git commit -qam 'Read settings from the environment'", 'git push -q'];
const FIX_DOCK = (text = DOCK_FIXED()) => ['cd dock-status', heredoc('bin/config.sh', text)];
// Exercise 2: environment-scoped values and a job that selects the environment from the input.
const SET_ENV_VARS = ['gh variable set API_BASE_URL -e staging --body https://api.staging.kestrel.example', 'gh variable set API_BASE_URL -e production --body https://api.kestrel.example'];
const SELECT_ENV = (value = '${{ inputs.target }}') => `sed -i 's/^    runs-on: ubuntu-latest/&\\n    environment: ${value}/' .github/workflows/deploy.yml`;
const PUSH_DEPLOY = ["git commit -qam 'Deploy with the chosen environment'", 'git push -q'];
const PROD_PART = (staging: number, prod: number) => ['gh workflow run deploy.yml -f target=staging', `gh run watch ${staging}`, 'gh workflow run deploy.yml -f target=production', `gh run watch ${prod}`];
// Exercise 3: a validation step that fails fast, then the variable fixed and CI run by hand.
const CHECK = (strict = true) => wf('#!/bin/bash', '# Fail fast: every required setting needs a value before the app starts.', 'status=0',
  'if [ -z "$API_BASE_URL" ]; then echo "::error::API_BASE_URL is required"; status=1; fi', 'if [ -z "$DB_HOST" ]; then echo "::error::DB_HOST is required"; status=1; fi',
  'if [ "$status" = 0 ]; then echo "Config OK"; fi', strict ? 'exit $status' : 'exit 0');
const VALIDATE_STEP = "sed -i 's/^      - name: Show config/      - name: Validate config\\n        run: bash bin\\/check-config.sh\\n&/' .github/workflows/ci.yml";
const DISPATCH_CI = "sed -i 's/^on:/&\\n  workflow_dispatch:/' .github/workflows/ci.yml";
const PUSH_CHECK = ['git add bin .github', "git commit -qm 'Validate the settings before using them'", 'git push -q'];
const FIX_VAR = ['gh variable set DB_HOST --body db-test.kestrel.internal', 'gh variable delete DB_HSOT'];

export const CICD07: LessonContent = {
  lessonId: 'CICD07',
  motivation: '「為什麼 dock-status 的 git log 裡有『改成 staging』、『改回 production』這種 commit？」Kestrel 單車團隊的 dock-status 把 API 位址、資料庫主機、記錄等級與功能開關直接寫在程式裡，要在 staging 示範就得改程式碼、提交，示範完再改回來；忘了改回來，正式環境就連到測試資料庫。CICD04 讓同一份程式碼在 GitHub Actions 上自動建置與測試，這一課再往前一步：讓同一份程式碼不改一個字，就能在開發者的筆電、CI 的測試環境、staging 與 production 上各自以正確的設定執行。你會把設定從程式碼移到環境變數，替本機開發提供預設值，在 workflow 裡由 repository 與 environment 的 variable 提供每個環境的值，最後在啟動前驗證必要的設定，缺少時立刻以清楚的訊息失敗，而不是帶著錯誤的預設值上線。',
  sections: [
    {
      id: 'cicd07-s-setup', title: '本課的團隊、儲存庫與終端機',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的 Kestrel 單車共享公司，程式放在模擬的 GitHub 主機 `github.example` 上。你是 Lai Yu（GitHub 帳號 yu-lai，兩個儲存庫的管理員），筆電 yu-laptop 的家目錄裡有兩個儲存庫的複本，程式都是同事 Ho Jun 寫的。模擬環境的時鐘是 2026-11-25 02:00 UTC，也就是台北時間上午 10:00。' },
        { type: 'table', head: ['儲存庫', '內容', '設定的現況'], rows: [
          ['kestrel/dock-status（~/dock-status）', '顯示每個站點的車輛與空位；`bin/config.sh` 決定並印出這次的設定，`test/config-test.sh` 是 Ho Jun 寫的設定測試，ci.yml 推送到 main 時執行它', 'API 位址、資料庫主機、記錄等級與功能開關都寫死在 `bin/config.sh`，而且是 production 的值；設定測試因此失敗'],
          ['kestrel/rider-api（~/rider-api）', '會員、騎乘與月票的 API；`bin/config.sh` 同樣印出設定，另有 ci.yml 與手動觸發的 deploy.yml', '已經從環境變數讀設定，但 GitHub 上的 variable 有幾個問題，本課逐一找出來'],
        ] },
        { type: 'p', text: '兩個專案真正的伺服器是 Node.js 程式，啟動前由 `bin/config.sh` 決定設定；本課只看設定這一段，所以 `bin/config.sh` 只把生效的值印成一行，例如 `rider-api config: api=… db=… log=… passes=…`，讓你在本機與 CI 的記錄裡都看得到「這次到底用了哪些值」。本課用到的指令：' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`NAME=值`、`export NAME`、`unset NAME`、`echo "$NAME"`', '在 Shell 設定變數、讓它成為環境變數、刪掉它、印出它'],
          ['`NAME=值 指令`', '只替這一個指令設定環境變數'],
          ['`bash 指令稿`、`bash -c \'指令\'`', '以新的 Bash 子行程執行指令稿或一段指令'],
          ["`cat > 檔案 <<'EOF'`（多行，最後一行是 `EOF`）、`sed -i 's/舊/新/' 檔案`", '寫入整個檔案、在檔案裡取代文字（取代的文字裡 `\\n` 是換行、`&` 是原本符合的文字）'],
          ['`gh variable list|get|set|delete`（`-e 環境` 指定 environment）', '管理 GitHub Actions 的 variable'],
          ['`gh workflow run 檔名 -f 輸入=值`、`gh run list`、`gh run watch ID`、`gh run view ID --log`', '手動觸發、列出 run、等 run 跑完、看完整的記錄（`--log-failed` 只看失敗的 step）'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'git 與 gh 的輸出依真實的格式模擬，沒有顏色，也不會互動式提問；`gh run watch` 讓時鐘直接走到 run 結束，只印最後的畫面。run 的 ID 從 4100000001 依序編號。runner 上的 `run:` 真的交給模擬的 Bash 執行，`bin/config.sh` 與你寫的指令稿都會真的跑；模擬的 Bash 沒有 `env`、`printenv`，要看某個變數就用 `echo "$NAME"`。一個輸入的指令最多 500 個字元，較長的檔案分兩段寫（第二段用 `>>`）。Kestrel、人名、主機與網址都是虛構的。' },
      ],
    },
    {
      id: 'cicd07-s-separate', title: '設定與程式碼分離',
      blocks: [
        { type: 'p', text: '同一個程式要在好幾個地方執行：開發者的筆電、CI 的測試環境、給內部試用的 staging、給使用者的 production。這些地方的程式碼應該一模一樣，不一樣的是設定（configuration）：要連哪一台資料庫、呼叫哪個 API、記錄要多詳細、哪些功能開著。把設定與程式碼分離，就是讓「部署到哪裡」不需要改程式碼。常被引用的 The Twelve-Factor App 方法論把這件事寫成第三條：設定存放在環境裡（store config in the environment），程式在執行時從環境變數讀取。' },
        { type: 'table', head: ['屬於設定（每個環境可能不同）', '屬於程式碼（每個環境都一樣）'], rows: [
          ['資料庫主機、API 的位址、要連的外部服務', '票價的計算方式、路由與商業規則'],
          ['記錄等級（production 用 warn、開發用 debug）', '要記錄哪些事件、記錄的格式'],
          ['功能開關（staging 先開、production 還關著）', '功能本身的程式碼'],
          ['密碼、API Key、Token（這些是機密，CICD08 處理）', '套件與版本（寫在 package.json 與 lockfile，跟著程式碼一起審查）'],
        ] },
        { type: 'p', text: '一個簡單的判斷：如果把整個儲存庫公開，會不會有東西必須先拿掉？會被拿掉的通常是設定（尤其是機密）。另一個判斷：同一個 commit 能不能不經修改就部署到每一個環境？dock-status 做不到，下面的例子看它的設定與歷史。' },
        { type: 'example', id: 'cicd07-hardcoded' },
        { type: 'p', text: '`bin/config.sh` 一開始就把四個值寫死，所以 `LOG_LEVEL=debug bash bin/config.sh` 給的值被第一行的賦值蓋掉，印出的仍是 warn。`git log -- bin/config.sh` 只列出改過這個檔案的 commit：為了在 staging 示範，Ho Jun 改了程式碼、提交、部署，兩天後再改回來。這樣做有幾個問題：要切換環境就得建立新的 commit，測試過的 commit 與部署的 commit 不是同一個；忘了改回來，production 就連到 staging 的資料庫；同一時間只能有一種設定。Ho Jun 後來寫的 `test/config-test.sh` 把期望寫清楚：給了環境變數就用環境變數，沒給時用開發用的預設值。它現在是 `not ok 1`，練習 1 讓它通過。' },
        { type: 'callout', tone: 'warning', title: '用 if 判斷環境，仍然是把設定寫在程式碼裡', text: '常見的「改良」是把每個環境的值都寫進程式，再用一個變數選擇：`if [ "$APP_ENV" = production ]; then DB_HOST=db-prod…; else DB_HOST=db-staging…; fi`。這只是把一個寫死的值變成三個寫死的值：多一個環境要改程式碼，資料庫搬家也要改程式碼、重新部署。設定與程式碼分離的意思是，程式只知道「去讀 DB_HOST」，值本身由執行的環境提供。' },
      ],
    },
    {
      id: 'cicd07-s-envvars', title: '環境變數與預設值',
      blocks: [
        { type: 'p', text: '環境變數（environment variable）是作業系統交給每個行程的一組「名稱=值」。行程啟動另一個行程時，子行程會拿到父行程環境變數的複本，所以在 Shell 裡設定好的值，會一路傳給它啟動的指令稿與程式；子行程改了自己的複本，不會影響父行程。Shell 的變數分兩種：一般的 Shell 變數只在這個 Shell 裡，`export` 之後才成為環境變數、傳給子行程。' },
        { type: 'table', head: ['寫法', '效果'], rows: [
          ['`LOG_LEVEL=debug`', '設定 Shell 變數；子行程看不到'],
          ['`export LOG_LEVEL` 或 `export LOG_LEVEL=debug`', '成為環境變數，之後啟動的子行程都看得到'],
          ['`LOG_LEVEL=debug bash bin/config.sh`', '只替這一個指令設定環境變數，指令結束後 Shell 裡沒有這個變數'],
          ['`unset LOG_LEVEL`', '刪掉這個變數'],
          ['`${LOG_LEVEL:-info}`', '沒有設定或是空字串時用 info'],
          ['`${LOG_LEVEL-info}`（沒有冒號）', '只有沒有設定時用 info；設成空字串時就是空字串'],
          ['`${DB_HOST:?DB_HOST is required}`', '沒有設定或是空字串時印出訊息，指令稿立刻以失敗結束（第六節）'],
        ] },
        { type: 'p', text: '預設值讓開發者不用設定任何東西就能在筆電上執行：rider-api 的 `bin/config.sh` 寫成 `DB_HOST=${DB_HOST:-localhost}`，沒有給 DB_HOST 時連本機的資料庫。預設值應該是「開發時方便、而且出錯也無害」的值，例如 localhost、info、功能關閉；不應該是 production 的位址，否則某個環境忘了設定時，它會安靜地連上正式的資料庫。下面的例子在 rider-api 裡試這些寫法，並看 `.env` 檔案的慣例。' },
        { type: 'example', id: 'cicd07-shell-env' },
        { type: 'p', text: '`LOG_LEVEL=debug` 之後，`bash bin/config.sh` 仍是 info：子行程看不到沒有 export 的變數。`export` 之後才變成 debug。`FEATURE_PASSES=on bash bin/config.sh` 只影響那一次執行，之後 `$FEATURE_PASSES` 是空的。最後的 `.env` 是許多框架與工具的慣例：每個開發者在專案根目錄放一個 `.env`，寫自己本機的值，由 dotenv 這類函式庫或 Docker Compose 讀進環境變數。儲存庫裡提交的是 `.env.example`（只有名稱與開發用的值，當作文件），`.gitignore` 列出 `.env`，所以 `cp .env.example .env` 之後 `git status --short` 什麼也沒印：這個檔案不會被提交。' },
        { type: 'callout', tone: 'warning', title: '.env 被提交，就等於公開', text: '常見的誤解是：「儲存庫是私有的，把 .env 一起提交比較方便，新人 clone 下來就能用。」.env 往往不只有 localhost，還有某人為了測試貼進去的正式資料庫位址甚至密碼；一旦提交，它就留在每一份 clone 與 git 的歷史裡，之後刪掉檔案也還在舊的 commit 中。儲存庫的存取權會變（外包、離職、轉成公開），歷史卻不會。正確的做法是只提交 `.env.example`、把 `.env` 寫進 `.gitignore`；真的提交了機密，要當作已經外洩，立刻更換（CICD08）。' },
      ],
    },
    {
      id: 'cicd07-s-workflow', title: '在 workflow 裡提供設定：env、vars 與 GITHUB_ENV',
      blocks: [
        { type: 'p', text: 'runner 上的每個 step 都是一個新的行程，它的環境變數由 GitHub 組合：先是 runner 預設的（`CI=true`、`GITHUB_SHA`…），再依序加上 workflow 層、job 層、step 層的 `env:`。同一個名稱出現在好幾層時，越內層的越優先：step 的蓋過 job 的，job 的蓋過 workflow 的，而且只影響自己那一層以內。' },
        { type: 'table', head: ['來源', '寫在哪裡', '誰看得到'], rows: [
          ['workflow 層 `env:`', '檔案最上層', '每個 job 的每個 step'],
          ['job 層 `env:`', '`jobs.<id>.env`', '這個 job 的每個 step，蓋過 workflow 層'],
          ['step 層 `env:`', '某個 step 底下', '只有這個 step，蓋過 job 與 workflow 層'],
          ['`$GITHUB_ENV`', 'step 執行時以 `echo "名稱=值" >> "$GITHUB_ENV"` 寫入', '同一個 job 之後的 step（寫入的那個 step 自己看不到）'],
          ['`vars` context', 'GitHub 上的 Actions variable，在 workflow 以 `${{ vars.名稱 }}` 讀', '運算式；要變成環境變數得自己對應到 `env:`'],
        ] },
        { type: 'p', text: '寫在 YAML 裡的 `env:` 仍然是程式碼的一部分，適合所有環境都一樣的值（例如 CI 一律用 debug 的記錄等級）。每個環境不同的值放在 GitHub 的設定裡：儲存庫的 Settings 裡的 Actions variable，用 `gh variable set 名稱 --body 值` 設定、`gh variable list` 列出。variable 不會自動變成環境變數，`${{ vars.API_BASE_URL }}` 是在 step 執行前被代換成文字的運算式，所以 workflow 要寫 `API_BASE_URL: ${{ vars.API_BASE_URL }}` 把它交給 `env:`；沒有設定的 variable 代換成空字串，不會報錯。`$GITHUB_ENV` 用在執行時才算得出來的值，例如由 run 編號與日期組成的建置代號。' },
        { type: 'p', text: '下面的例子先看 rider-api 有哪些 variable，再新增一個只能手動觸發的 levels.yml，看每個 step 實際拿到的值。檔案超過 500 個字元，分兩段寫。' },
        { type: 'example', id: 'cicd07-levels' },
        { type: 'p', text: 'runner 在每個 step 的記錄開頭列出要執行的指令與這個 step 的 `env:`（例子用 grep 去掉了 `##[group]` 等行），列出的正是最後生效的值：第一個 step 的 LOG_LEVEL 是 job 層的 info（蓋過 workflow 層的 warn），REGION 來自 workflow 層；第二個 step 自己寫了 debug。第三個 step 顯示 `$API_BASE_URL` 是空的，`${{ vars.API_BASE_URL }}` 卻有值：variable 只有對應到 `env:` 才是環境變數。第四個 step 寫進 `$GITHUB_ENV` 的 BUILD_ID，到第五個 step 才出現在 `env:` 裡。另外注意 `gh variable list` 的 `DB_HSOT`：有人把 DB_HOST 拼錯了，第六節會看到它造成的後果。' },
        { type: 'callout', tone: 'tip', title: '寫在記錄裡的設定，就是除錯的線索', text: 'variable 的值不是機密，GitHub 不會遮蔽它，會照樣出現在 `env:` 區塊與輸出裡。這正好方便除錯：部署出問題時，先看記錄裡這個 step 實際拿到的值，而不是看 YAML 猜它「應該」拿到什麼。也因為它會出現在記錄裡，密碼、Token 絕對不能放在 variable，要放在 secret（記錄裡會變成 `***`，CICD08）。' },
      ],
    },
    {
      id: 'cicd07-s-environments', title: '開發、測試與正式環境',
      blocks: [
        { type: 'p', text: '一個典型的團隊至少有這幾個環境：開發（development，每個人的筆電，用預設值或 .env）、測試（CI 在 runner 上跑測試時用的測試資料庫與測試 API）、staging（盡量和正式相同的預演環境）與正式（production，使用者在用的）。程式碼在這些環境之間「升級」，設定則留在各自的環境裡。' },
        { type: 'table', head: ['環境', 'rider-api 的值從哪裡來', 'API_BASE_URL'], rows: [
          ['開發', '`bin/config.sh` 的預設值，或自己的 `.env`', 'http://localhost:4000'],
          ['測試（CI）', '儲存庫層的 variable', 'https://api.test.kestrel.example'],
          ['staging', 'environment staging 的 variable', 'https://api.staging.kestrel.example'],
          ['production', 'environment production 的 variable', 'https://api.kestrel.example'],
        ] },
        { type: 'p', text: 'GitHub 的 environment 是儲存庫底下有名字的部署目標（Settings → Environments），可以有自己的 variable 與 secret，也可以加上保護規則（例如要人核准才能部署，CICD09）。job 寫了 `environment: production`，這個 job 的 `vars` 就會加入 production 的 variable，同名時 environment 的蓋過儲存庫的；environment 沒有的名稱，沿用儲存庫層的值。`environment` 可以是運算式，所以 `environment: ${{ inputs.target }}` 讓手動觸發時選的目標決定用哪一組值。設定 environment 的 variable 用 `gh variable set 名稱 -e production --body 值`，列出用 `gh variable list -e production`。' },
        { type: 'p', text: '下面的例子看 rider-api 的兩個 environment 有哪些 variable，再以 deploy.yml 部署到 production，看它實際用了什麼值。' },
        { type: 'example', id: 'cicd07-environments' },
        { type: 'p', text: '輸入雖然選了 production，記錄裡卻是測試的 API 與 localhost：deploy.yml 的 job 沒有 `environment:`，`vars` 只有儲存庫層的值，API_BASE_URL 拿到 CI 用的測試 API；儲存庫層又沒有 DB_HOST（只有拼錯的 DB_HSOT）與 FEATURE_PASSES，Deploying 那個 step 的 `env:` 區塊直接顯示它們是空的，於是 `${DB_HOST:-localhost}` 用了開發的預設值。run 仍然是成功的，沒有任何警告。練習 2 替兩個 environment 加上 API_BASE_URL，並讓 job 依輸入選擇 environment。' },
        { type: 'callout', tone: 'warning', title: '少設一個 environment 的值，不會報錯，而是悄悄用了別的值', text: '很多人以為 job 指定了 `environment: production`，就只會用 production 的設定，少了哪個值 GitHub 會提醒。實際上 environment 沒有的名稱會沿用儲存庫層的值，儲存庫層也沒有就是空字串，再被程式的預設值接手：production 可能用了 CI 的測試 API，或連到 localhost。同樣地，`gh variable set` 忘了加 `-e`，值就寫到儲存庫層，連 CI 都一起改掉。設定完用 `gh variable list -e 環境` 核對，部署後看記錄裡實際的值，並加上第六節的驗證。' },
      ],
    },
    {
      id: 'cicd07-s-validate', title: '設定驗證：啟動時就失敗',
      blocks: [
        { type: 'p', text: '預設值讓開發方便，卻也可能把「忘了設定」藏起來。上一節的 production 部署連到 localhost 而且成功，要等到使用者的請求出錯才會發現。設定驗證（configuration validation）是在程式啟動時、或部署管線裡在用到設定之前，檢查每個必要的設定都有值而且格式合理，缺少時立刻以清楚的訊息失敗（fail fast）。在部署之前失敗，舊版本還在運作，什麼都沒有壞；在半夜某個請求才失敗，就是事故。' },
        { type: 'table', head: ['做法', '例子', '說明'], rows: [
          ['參數展開', '`: "${DB_HOST:?DB_HOST is required}"`', 'Bash 內建，遇到第一個缺少的就結束；適合指令稿開頭的一兩個檢查'],
          ['驗證指令稿', '逐一檢查每個必要的名稱，全部列出後再以 1 結束', '一次看到所有缺少的設定，不用修一個、跑一次、再發現下一個'],
          ['程式自己的驗證', '啟動時以 schema 檢查型別與範圍（例如 LOG_LEVEL 只能是 debug、info、warn、error）', '真實的專案常這樣做，失敗時程式不開始接受請求'],
          ['workflow 的 step', '在部署或使用設定的 step 之前加一個 `Validate config` step', '管線在這一步就停下，後面的 step 不會執行'],
        ] },
        { type: 'p', text: '在 GitHub Actions 裡，輸出 `::error::訊息` 這樣的 workflow command，記錄會顯示成 `##[error]訊息`，run 的 ANNOTATIONS 也會列出它；再以非 0 的結束碼結束，step 就失敗。哪些設定是必要的？沒有合理預設值的，例如 production 的資料庫主機與 API 位址，就不該有「方便的」預設值可以退回；記錄等級、功能開關這類有安全預設值的，可以不列為必要。下面的例子先觸發一次 rider-api 的 CI，看拼錯的 DB_HSOT 怎麼被預設值蓋過，再試試參數展開的寫法。' },
        { type: 'example', id: 'cicd07-fail-fast' },
        { type: 'p', text: 'CI 是綠的，記錄裡卻是 `db=localhost`：workflow 讀 `vars.DB_HOST`，但 GitHub 上只有 DB_HSOT，於是 DB_HOST 是空字串，預設值接手。真實的 CI 若有連資料庫的測試，可能是測試失敗、也可能連到 runner 上碰巧有的服務，原因都不容易看出來。`${DB_HOST:?…}` 在沒有值時印出 `DB_HOST: DB_HOST is required` 並結束，`echo started` 沒有執行；有值時才繼續。練習 3 在 rider-api 的 CI 加上驗證的 step，讓這個錯誤在第一時間就出現在記錄與 ANNOTATIONS 裡。' },
        { type: 'callout', tone: 'warning', title: '密碼不是設定 variable，預設值也不能替 production 補洞', text: '兩個常見的錯：第一，把資料庫密碼和資料庫主機一起放進 variable，理由是「它也是每個環境不同的設定」。variable 的值會原樣出現在 `gh variable list`、workflow 記錄的 `env:` 區塊與輸出裡；密碼、API Key、Token 要放在 secret（記錄裡會遮蔽成 `***`），CICD08 專門處理。第二，為了讓驗證「永遠通過」，把預設值改成 production 的位址：這樣任何環境忘了設定都會連到正式的資料庫，比失敗更危險。驗證失敗是在保護你，該修的是缺少的設定。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd07-q-config', prompt: '依「設定與程式碼分離」的原則，下面哪一項最適合由環境變數提供，而不是寫在程式碼裡？',
      options: ['計算票價的公式與四捨五入的規則', '每個網址交給哪個函式處理的路由對應表', '正式環境的資料庫主機名稱', '專案依賴的套件名稱與它們鎖定的版本'],
      answer: 2,
      explanation: '資料庫主機在開發、測試、staging、production 各不相同，同一份程式碼要能不經修改部署到每個環境，它就屬於設定，應由環境提供。票價公式與路由是程式的行為，每個環境都一樣，屬於程式碼；套件與版本寫在 package.json 與 lockfile，跟著程式碼一起審查，也不是環境變數。',
    },
    {
      id: 'cicd07-q-export', prompt: '在終端機輸入 `LOG_LEVEL=debug`，再執行 `bash bin/config.sh`（裡面是 `LOG_LEVEL=${LOG_LEVEL:-info}`），印出的仍是 `log=info`。原因是什麼？',
      options: ['bash 執行的指令稿是子行程，只拿到 export 過的變數', '等號兩邊要加空白，寫成 `LOG_LEVEL = debug` 才算設定了變數', '`${LOG_LEVEL:-info}` 這種寫法不管環境變數是什麼，一律使用冒號後面的預設值', '環境變數的名稱必須是小寫，全大寫的名稱保留給系統使用'],
      answer: 0,
      explanation: '`LOG_LEVEL=debug` 只建立 Shell 變數，`bash bin/config.sh` 是新的子行程，只繼承環境變數，所以看不到它；`export LOG_LEVEL` 或 `LOG_LEVEL=debug bash bin/config.sh` 才會傳過去。Shell 的賦值等號兩邊不能有空白；`:-` 只在沒有值時用預設；大寫的名稱正是環境變數的慣例。',
    },
    {
      id: 'cicd07-q-empty', prompt: 'workflow 的 step 寫了 `DB_HOST: ${{ vars.DB_HOST }}`，但儲存庫只有一個拼錯的 variable `DB_HSOT`。指令稿用 `DB_HOST=${DB_HOST:-localhost}`。這個 step 會怎樣？',
      options: ['GitHub 在建立 run 時發現 vars 裡沒有 DB_HOST，判定 workflow 無效，run 立刻失敗', '成功：DB_HOST 被代換成空字串，`:-` 把空字串當成沒有值，於是用了 localhost', '失敗：Bash 印出 `DB_HOST: unbound variable`，step 以結束碼 1 結束', 'GitHub 找到名稱最接近的 DB_HSOT，DB_HOST 拿到 db-test.kestrel.internal'],
      answer: 1,
      explanation: '沒有設定的 variable 在運算式裡就是空字串，GitHub 不會報錯，所以 env 裡的 DB_HOST 是空的；`${DB_HOST:-localhost}` 的冒號讓空字串也使用預設值，step 成功卻連到 localhost，這正是預設值把缺少的設定藏起來的情況。unbound variable 只在 `set -u` 而且變數不存在時出現；GitHub 也不會猜測拼錯的名稱。',
    },
    {
      id: 'cicd07-q-precedence', prompt: 'workflow 層 `env:` 有 `LOG_LEVEL: warn`，job 層有 `LOG_LEVEL: info`。job 的第一個 step 自己寫了 `LOG_LEVEL: debug`，第二個 step 沒有寫 `env:`。第二個 step 的 LOG_LEVEL 是什麼？',
      options: ['warn：workflow 層最先定義，優先於後面的定義', 'debug：上一個 step 設定的值會留給同一個 job 之後的 step', '空字串：job 層與 workflow 層的定義互相衝突，兩個都不採用', 'info：step 沒有自己的定義時用 job 層的值'],
      answer: 3,
      explanation: '越內層的 `env:` 越優先，而且只影響自己那一層：job 層的 info 蓋過 workflow 層的 warn，第一個 step 的 debug 只屬於那個 step，所以第二個 step 是 info。要把值留給之後的 step，得寫進 `$GITHUB_ENV`；不同層的同名定義不會衝突到兩者都不採用。',
    },
    {
      id: 'cicd07-q-environment', prompt: '儲存庫層的 variable API_BASE_URL 是 `https://api.test.kestrel.example`；environment production 有 DB_HOST，但沒有 API_BASE_URL。job 寫了 `environment: production`，它的 `${{ vars.API_BASE_URL }}` 是什麼？',
      options: ['空字串：job 指定了 environment，就只看那個 environment 的 variable', 'job 失敗：production 缺少 API_BASE_URL，GitHub 拒絕執行', '`https://api.test.kestrel.example`：沿用儲存庫層的值', '`https://api.kestrel.example`：GitHub 依 environment 的名稱推算'],
      answer: 2,
      explanation: '指定 environment 時，它的 variable 加在儲存庫層之上，同名的蓋過儲存庫的，沒有的名稱仍用儲存庫層的值，所以 production 會悄悄用 CI 的測試 API。GitHub 不檢查 environment 是否設了每個 variable，也不會推算值；這也是部署前要驗證設定、並在記錄裡核對實際值的原因。',
    },
    {
      id: 'cicd07-q-secret', prompt: 'rider-api 要連 production 的資料庫，需要密碼 DB_PASSWORD。它應該放在哪裡？',
      options: ['放進 production environment 的 secret', '和 DB_HOST 一樣放在 production 的 variable，因為它也是每個環境不同的設定', '寫進 `.env` 並提交到私有的儲存庫，讓每個需要的人都拿得到', '寫在 deploy.yml 的 `env:`，只有能讀 workflow 的人看得到'],
      answer: 0,
      explanation: '密碼是機密，要放在 secret：值加密存放、`gh secret list` 不顯示值，記錄裡出現時遮蔽成 `***`。variable 的值會原樣出現在 gh 與記錄裡；提交 .env 會讓它留在每份 clone 與 git 歷史中；寫進 workflow 的 `env:` 就是寫進程式碼，能讀儲存庫的人都看得到。',
    },
    {
      id: 'cicd07-q-failfast', prompt: '為什麼要在部署前（或程式啟動時）就驗證必要的設定，而不是等程式第一次用到時才處理？',
      options: ['驗證步驟會替缺少的設定自動補上正確的值，部署就不會中斷', '環境變數只在程式啟動的那一刻讀得到，之後再讀就是空的', '驗證過的設定會被快取起來，之後讀環境變數比較快，程式整體也跑得比較快', '缺少時在這一步就以清楚的訊息停下，不會帶著錯誤的值上線'],
      answer: 3,
      explanation: 'fail fast 的目的是讓錯誤出現在最早、最好處理的地方：部署前失敗，舊版本照常運作，訊息直接指出缺少的名稱；否則可能用預設值連到錯的服務，等使用者的請求出錯才發現。驗證只檢查、不會補值；環境變數在行程執行期間都讀得到；驗證也與效能無關。',
    },
    {
      id: 'cicd07-q-github-env', prompt: '一個 step 執行 `echo "BUILD_ID=rider-7" >> "$GITHUB_ENV"`，接著在同一個 step 的下一行 `echo "$BUILD_ID"`。印出什麼？之後的 step 呢？',
      options: ['這一行印出 rider-7，之後的 step 也都看得到', '這一行印出空字串，同一個 job 之後的 step 才看得到 rider-7', '這一行印出 rider-7，但之後的 step 看不到，因為每個 step 是新的行程', '都看不到：`$GITHUB_ENV` 只能在 workflow 層的 `env:` 使用'],
      answer: 1,
      explanation: '`$GITHUB_ENV` 是 runner 替每個 step 準備的檔案，step 結束後 runner 才讀它，把裡面的值加到同一個 job 之後每個 step 的環境變數；寫入的那個 step 的環境已經決定了，所以 `$BUILD_ID` 是空的。它正是用來跨過「每個 step 是新行程」的方法，而且是在 step 裡寫入，不是寫在 YAML 的 `env:`。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd07-hardcoded', title: '寫死在程式裡的設定', machine: 'cicd07-lab',
        description: 'dock-status 的 bin/config.sh 把 production 的值寫死：給環境變數也沒有用，git 的歷史裡有為了 staging 示範而改程式、再改回來的 commit，Ho Jun 的設定測試因此失敗。',
        steps: [
          { command: 'cd dock-status', output: '' },
          { command: 'cat bin/config.sh', output: '#!/bin/bash\n# dock-status settings\nAPI_BASE_URL=https://api.kestrel.example\nDB_HOST=db-prod.kestrel.internal\nLOG_LEVEL=warn\nFEATURE_MAP=on\necho "dock-status config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL map=$FEATURE_MAP"' },
          { command: 'bash bin/config.sh', output: 'dock-status config: api=https://api.kestrel.example db=db-prod.kestrel.internal log=warn map=on' },
          { command: 'LOG_LEVEL=debug bash bin/config.sh', output: 'dock-status config: api=https://api.kestrel.example db=db-prod.kestrel.internal log=warn map=on' },
          { command: 'git log --oneline -- bin/config.sh', output: '35779b7 Point back at production\nf779001 Point at staging for the demo\n9c0a7a6 Initial commit' },
          { command: 'git diff HEAD~3 HEAD~2', output: 'diff --git a/bin/config.sh b/bin/config.sh\nindex 69e5449..7bf81da 100644\n--- a/bin/config.sh\n+++ b/bin/config.sh\n@@ -1,7 +1,7 @@\n #!/bin/bash\n # dock-status settings\n-API_BASE_URL=https://api.kestrel.example\n-DB_HOST=db-prod.kestrel.internal\n+API_BASE_URL=https://api.staging.kestrel.example\n+DB_HOST=db-staging.kestrel.internal\n LOG_LEVEL=warn\n FEATURE_MAP=on\n echo "dock-status config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL map=$FEATURE_MAP"' },
          { command: 'bash test/config-test.sh', output: 'not ok 1 - reads the environment: dock-status config: api=https://api.kestrel.example db=db-prod.kestrel.internal log=warn map=on' },
        ],
      },
      {
        id: 'cicd07-shell-env', title: 'Shell 變數、環境變數與 .env', machine: 'cicd07-lab',
        description: '在 rider-api 試 export、只對一個指令設定的環境變數與預設值，再看 .env.example 與 .gitignore：.env 不會被提交。',
        steps: [
          { command: 'cd rider-api', output: '' },
          { command: 'cat bin/config.sh', output: '#!/bin/bash\n# Settings come from the environment; the defaults are for local development.\nAPI_BASE_URL=${API_BASE_URL:-http://localhost:4000}\nDB_HOST=${DB_HOST:-localhost}\nLOG_LEVEL=${LOG_LEVEL:-info}\nFEATURE_PASSES=${FEATURE_PASSES:-off}\necho "rider-api config: api=$API_BASE_URL db=$DB_HOST log=$LOG_LEVEL passes=$FEATURE_PASSES"' },
          { command: 'bash bin/config.sh', output: 'rider-api config: api=http://localhost:4000 db=localhost log=info passes=off' },
          { command: 'LOG_LEVEL=debug', output: '' },
          { command: 'bash bin/config.sh', output: 'rider-api config: api=http://localhost:4000 db=localhost log=info passes=off' },
          { command: 'export LOG_LEVEL', output: '' },
          { command: 'bash bin/config.sh', output: 'rider-api config: api=http://localhost:4000 db=localhost log=debug passes=off' },
          { command: 'FEATURE_PASSES=on bash bin/config.sh', output: 'rider-api config: api=http://localhost:4000 db=localhost log=debug passes=on' },
          { command: 'echo "[$FEATURE_PASSES]"', output: '[]' },
          { command: 'unset LOG_LEVEL', output: '' },
          { command: 'echo "${LOG_LEVEL:-info}"', output: 'info' },
          { command: 'cat .env.example', output: '# Copy to .env for local development. Never commit .env.\nAPI_BASE_URL=http://localhost:4000\nDB_HOST=localhost\nLOG_LEVEL=debug\nFEATURE_PASSES=on' },
          { command: 'cat .gitignore', output: '.env\nnode_modules/' },
          { command: 'cp .env.example .env', output: '' },
          { command: 'git status --short', output: '' },
        ],
      },
      {
        id: 'cicd07-levels', title: 'workflow、job、step 的 env、vars 與 GITHUB_ENV', machine: 'cicd07-lab',
        description: '新增手動觸發的 levels.yml：三層的 env: 誰蓋過誰、vars 不會自動成為環境變數、寫進 GITHUB_ENV 的值從下一個 step 開始生效。',
        steps: [
          { command: 'cd rider-api', output: '' },
          { command: 'gh variable list', output: 'NAME          VALUE                             UPDATED\nAPI_BASE_URL  https://api.test.kestrel.example  about 6 days ago\nDB_HSOT       db-test.kestrel.internal          about 6 days ago' },
          { command: heredoc('.github/workflows/levels.yml', LEVELS), output: '' },
          { command: heredoc('.github/workflows/levels.yml', LEVELS_MORE, true), output: '' },
          { command: 'git add .github', output: '' },
          { command: "git commit -qm 'Show where settings come from'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/kestrel/rider-api.git\n   682043e..acb5553  main -> main' },
          { command: 'gh workflow run levels.yml', output: '✓ Created workflow_dispatch event for levels.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="levels.yml"' },
          { command: 'gh run list', output: 'STATUS  TITLE                          WORKFLOW  BRANCH  EVENT              ID          ELAPSED  AGE\n*       Levels                         Levels    main    workflow_dispatch  4100000002  0s       less than a minute ago\n*       Show where settings come from  CI        main    push               4100000001  0s       less than a minute ago' },
          { command: 'gh run watch 4100000002', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main Levels · 4100000002\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n✓ show in 1s (ID 11300000002)\n  ✓ Set up job\n  ✓ Run echo "job sees LOG_LEVEL=$LOG_LEVEL REGION=$REGION"\n  ✓ Run echo "step sees LOG_LEVEL=$LOG_LEVEL"\n  ✓ Run echo "env [$API_BASE_URL] vars [${{ vars.API_BASE_URL }}]"\n  ✓ Run echo "BUILD_ID=rider-${{ github.run_number }}-$(date -u +%Y%m%d)" >> "$GITHUB_ENV"\n  ✓ Run echo "next step sees BUILD_ID=$BUILD_ID"\n  ✓ Complete job\n\n✓ Run Levels (4100000002) completed with \'success\'' },
          { command: "gh run view 4100000002 --log | grep -v -e '##\\[' -e 'shell:' | grep -e 'sees' -e 'vars \\[' | cut -f 3 | cut -c 30-", output: 'echo "job sees LOG_LEVEL=$LOG_LEVEL REGION=$REGION"\nenv:\n  LOG_LEVEL: info\n  REGION: ap-east\njob sees LOG_LEVEL=info REGION=ap-east\necho "step sees LOG_LEVEL=$LOG_LEVEL"\nenv:\n  LOG_LEVEL: debug\n  REGION: ap-east\nstep sees LOG_LEVEL=debug\necho "env [$API_BASE_URL] vars [https://api.test.kestrel.example]"\nenv:\n  LOG_LEVEL: info\n  REGION: ap-east\nenv [] vars [https://api.test.kestrel.example]\necho "next step sees BUILD_ID=$BUILD_ID"\nenv:\n  LOG_LEVEL: info\n  REGION: ap-east\n  BUILD_ID: rider-1-20261125\nnext step sees BUILD_ID=rider-1-20261125' },
        ],
      },
      {
        id: 'cicd07-environments', title: '選了 production，用的卻不是 production 的值', machine: 'cicd07-lab',
        description: '列出 staging 與 production 兩個 environment 的 variable，以 deploy.yml 部署到 production：job 沒有選 environment，記錄裡是測試的 API 與 localhost。',
        steps: [
          { command: 'cd rider-api', output: '' },
          { command: 'gh variable list -e staging', output: 'NAME            VALUE                        UPDATED\nDB_HOST         db-staging.kestrel.internal  about 5 days ago\nFEATURE_PASSES  on                           about 5 days ago' },
          { command: 'gh variable list -e production', output: 'NAME            VALUE                     UPDATED\nDB_HOST         db-prod.kestrel.internal  about 5 days ago\nFEATURE_PASSES  off                       about 5 days ago' },
          { command: 'cat .github/workflows/deploy.yml', output: 'name: Deploy\non:\n  workflow_dispatch:\n    inputs:\n      target:\n        type: choice\n        options: [staging, production]\npermissions:\n  contents: read\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    env:\n      API_BASE_URL: ${{ vars.API_BASE_URL }}\n      DB_HOST: ${{ vars.DB_HOST }}\n      FEATURE_PASSES: ${{ vars.FEATURE_PASSES }}\n    steps:\n      - uses: actions/checkout@v4\n      - name: Show config\n        run: bash bin/config.sh\n      - run: echo "Deploying rider-api to ${{ inputs.target }}"' },
          { command: 'gh workflow run deploy.yml -f target=production', output: '✓ Created workflow_dispatch event for deploy.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="deploy.yml"' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main Deploy · 4100000001\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n✓ deploy in 2s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Show config\n  ✓ Run echo "Deploying rider-api to ${{ inputs.target }}"\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run Deploy (4100000001) completed with \'success\'' },
          { command: "gh run view 4100000001 --log | grep -e 'config:' -e 'Deploying' | cut -f 3 | cut -c 30-", output: 'rider-api config: api=https://api.test.kestrel.example db=localhost log=info passes=off\n##[group]Run echo "Deploying rider-api to production"\necho "Deploying rider-api to production"\nshell: /usr/bin/bash -e {0}\nenv:\n  API_BASE_URL: https://api.test.kestrel.example\n  DB_HOST: \n  FEATURE_PASSES: \n##[endgroup]\nDeploying rider-api to production' },
        ],
      },
      {
        id: 'cicd07-fail-fast', title: '綠燈的 CI，錯的設定', machine: 'cicd07-lab',
        description: '觸發 rider-api 的 CI：拼錯的 DB_HSOT 讓 DB_HOST 是空的，預設值接手，run 仍然成功。再用 ${DB_HOST:?…} 試試缺少時立刻失敗。',
        steps: [
          { command: 'cd rider-api', output: '' },
          { command: "git commit -q --allow-empty -m 'Run CI'", output: '' },
          { command: 'git push -q', output: 'To https://github.example/kestrel/rider-api.git\n   682043e..fdcc7c5  main -> main' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main CI · 4100000001\nTriggered via push less than a minute ago\n\nJOBS\n✓ test in 2s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Show config\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\n✓ Run CI (4100000001) completed with \'success\'' },
          { command: "gh run view 4100000001 --log | grep 'config:' | cut -f 3 | cut -c 30-", output: 'rider-api config: api=https://api.test.kestrel.example db=localhost log=info passes=off' },
          { command: 'gh variable list', output: 'NAME          VALUE                             UPDATED\nAPI_BASE_URL  https://api.test.kestrel.example  about 6 days ago\nDB_HSOT       db-test.kestrel.internal          about 6 days ago' },
          { command: "bash -c ': \"${DB_HOST:?DB_HOST is required}\"; echo started'", output: 'bash: line 1: DB_HOST: DB_HOST is required' },
          { command: "DB_HOST=db.local bash -c ': \"${DB_HOST:?DB_HOST is required}\"; echo started'", output: 'started' },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd07-ex-env', title: '讓 dock-status 從環境變數讀設定', machine: 'cicd07-lab',
        statement: '在 ~/dock-status 改寫 `bin/config.sh`：API_BASE_URL、DB_HOST、LOG_LEVEL、FEATURE_MAP 四個設定都從環境變數讀取，沒有設定（或是空字串）時分別用開發用的預設值 `http://localhost:4000`、`localhost`、`info`、`off`；最後一行照舊印出 `dock-status config: api=… db=… log=… map=…`。CI 用測試環境：把儲存庫的 variable API_BASE_URL 設成 `https://api.test.kestrel.example`、DB_HOST 設成 `db-test.kestrel.internal`。提交並推送到 main，等 CI 跑完：設定測試要通過，Show config 要印出測試環境的值。',
        checks: [
          { kind: 'variable', repo: DOCK, name: 'API_BASE_URL', value: 'https://api.test.kestrel.example' },
          { kind: 'variable', repo: DOCK, name: 'DB_HOST', value: 'db-test.kestrel.internal' },
          { kind: 'run', repo: DOCK, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' },
          { kind: 'run', repo: DOCK, workflow: 'ci.yml', ref: 'main', tip: true, job: 'test', step: 'Show config', conclusion: 'success',
            logIncludes: 'dock-status config: api=https://api.test.kestrel.example db=db-test.kestrel.internal log=info map=off' },
        ],
        solution: [...FIX_DOCK(), 'bash test/config-test.sh', ...SET_TEST_VARS, 'gh variable list', ...PUSH_DOCK, 'gh run watch 4100000001', "gh run view 4100000001 --log | grep 'config:' | cut -f 3"],
        mistakes: [
          { commands: ['cd dock-status', ...SET_TEST_VARS, "git commit -q --allow-empty -m 'Run CI'", 'git push -q', 'gh run watch 4100000001'], why: '只設定了 variable，bin/config.sh 仍然寫死 production 的值：給什麼環境變數都被蓋掉，設定測試失敗' },
          { commands: [...FIX_DOCK(DOCK_FIXED('https://api.test.kestrel.example', 'db-test.kestrel.internal')), ...SET_TEST_VARS, ...PUSH_DOCK, 'gh run watch 4100000001'], why: '把測試環境的值寫成預設值：預設值是給開發用的，任何環境忘了設定都會連到測試資料庫；設定測試的「development defaults」因此失敗' },
          { commands: [...FIX_DOCK(), ...PUSH_DOCK, 'gh run watch 4100000001'], why: '沒有設定 variable：`vars.API_BASE_URL` 是空字串，預設值 localhost 接手，CI 是綠的，用的卻不是測試環境' },
          { commands: [...FIX_DOCK(), 'gh variable set API_BASE_ULR --body https://api.test.kestrel.example', SET_TEST_VARS[1], ...PUSH_DOCK, 'gh run watch 4100000001'], why: 'variable 的名稱拼錯成 API_BASE_ULR：workflow 讀的 API_BASE_URL 沒有值，悄悄用了預設值' },
          { commands: [...FIX_DOCK(), ...SET_TEST_VARS, "git commit -qam 'Read settings from the environment'"], why: '提交了但沒有推送：GitHub 上的 bin/config.sh 沒有變，也沒有新的 run' },
        ],
        hints: [
          '每一行改成 `名稱=${名稱:-預設值}` 的形式，例如 `LOG_LEVEL=${LOG_LEVEL:-info}`；可以先 `cat ~/rider-api/bin/config.sh` 參考',
          "用 `cat > bin/config.sh <<'EOF'` 寫整個檔案（引號讓 `$` 照字面寫入），寫完先在本機 `bash test/config-test.sh`，兩行都是 ok 再提交",
          '`gh variable set API_BASE_URL --body https://api.test.kestrel.example`（DB_HOST 同樣），推送後用 `gh run list` 找到 ID，再 `gh run watch ID`',
        ],
        explanation: '`${名稱:-預設值}` 讓程式優先使用環境提供的值，沒有或是空字串時才用預設值，所以同一個指令稿在筆電上用 localhost、在 CI 用 workflow 從 variable 對應過來的測試環境。預設值要選開發時無害的值：寫成某個真實環境的位址，任何地方忘了設定都會安靜地連過去。variable 名稱拼錯或沒有設定都不會報錯，只會變成空字串，所以要看記錄裡實際印出的值。',
      },
      {
        id: 'cicd07-ex-environments', title: 'staging 與 production 各用自己的值', machine: 'cicd07-lab',
        statement: 'rider-api 的 deploy.yml 讓人選擇 target（staging 或 production），但 job 沒有選 environment，兩邊都用儲存庫層的值。在 ~/rider-api：（1）替 environment staging 設定 variable API_BASE_URL 為 `https://api.staging.kestrel.example`，production 設定為 `https://api.kestrel.example`，儲存庫層的 API_BASE_URL（CI 用的測試 API）不要動；（2）修改 deploy.yml，讓 job deploy 使用輸入 target 所選的 environment。提交並推送到 main，先部署 staging、再部署 production，等它們跑完：production 的記錄要顯示 production 的 API 與資料庫。',
        checks: [
          { kind: 'variable', repo: RIDER, name: 'API_BASE_URL', env: 'staging', value: 'https://api.staging.kestrel.example' },
          { kind: 'variable', repo: RIDER, name: 'API_BASE_URL', env: 'production', value: 'https://api.kestrel.example' },
          { kind: 'variable', repo: RIDER, name: 'API_BASE_URL', value: 'https://api.test.kestrel.example' },
          { kind: 'run', repo: RIDER, workflow: 'deploy.yml', event: 'workflow_dispatch', conclusion: 'success',
            logIncludes: 'rider-api config: api=https://api.kestrel.example db=db-prod.kestrel.internal log=info passes=off' },
        ],
        solution: ['cd rider-api', ...SET_ENV_VARS, 'gh variable list -e production', SELECT_ENV(), 'git diff', ...PUSH_DEPLOY, ...PROD_PART(4100000002, 4100000003),
          "gh run view 4100000003 --log | grep 'config:' | cut -f 3"],
        mistakes: [
          { commands: ['cd rider-api', 'gh variable set API_BASE_URL --body https://api.staging.kestrel.example', 'gh variable set API_BASE_URL --body https://api.kestrel.example', SELECT_ENV(), ...PUSH_DEPLOY, ...PROD_PART(4100000002, 4100000003)],
            why: '`gh variable set` 沒有加 `-e`：兩次都寫到儲存庫層，最後 CI 也改用 production 的 API，environment 裡仍然沒有 API_BASE_URL' },
          { commands: ['cd rider-api', ...SET_ENV_VARS, 'gh workflow run deploy.yml -f target=staging', 'gh run watch 4100000001', 'gh workflow run deploy.yml -f target=production', 'gh run watch 4100000002'],
            why: '只設定了 variable，job 沒有 `environment:`：vars 只有儲存庫層的值，production 仍然用測試的 API 與 localhost' },
          { commands: ['cd rider-api', ...SET_ENV_VARS, SELECT_ENV('inputs.target'), ...PUSH_DEPLOY, ...PROD_PART(4100000002, 4100000003)],
            why: '`environment: inputs.target` 少了 `${{ }}`：這是名為「inputs.target」的 environment，不是輸入的值，它沒有任何 variable' },
          { commands: ['cd rider-api', ...SET_ENV_VARS, SELECT_ENV(), ...PUSH_DEPLOY, 'gh workflow run deploy.yml -f target=staging', 'gh run watch 4100000002'], why: '只部署了 staging，還沒有部署 production' },
          { commands: ['cd rider-api', ...SET_ENV_VARS, SELECT_ENV(), "git commit -qam 'Deploy with the chosen environment'", ...PROD_PART(4100000001, 4100000002)],
            why: '修改了 deploy.yml 但沒有推送：手動觸發用的是 GitHub 上 main 的 deploy.yml，仍然沒有選 environment' },
        ],
        hints: [
          '`gh variable set API_BASE_URL -e staging --body https://api.staging.kestrel.example`，設定完用 `gh variable list -e staging` 核對',
          'job deploy 的 `runs-on:` 下面加一行 `    environment: ${{ inputs.target }}`（縮排 4 格）；可以用 `sed -i \'s/^    runs-on: ubuntu-latest/&\\n    environment: ${{ inputs.target }}/\' .github/workflows/deploy.yml`',
          '推送後 `gh workflow run deploy.yml -f target=staging`，用 `gh run list` 找 ID、`gh run watch ID`；production 同樣',
        ],
        explanation: 'environment 讓同一個 workflow、同一份程式碼依部署目標取得不同的值：job 的 `environment:` 決定 `vars` 裡加入哪一組 variable，同名時 environment 的蓋過儲存庫層的，environment 沒有的名稱沿用儲存庫層。`environment` 可以寫運算式，`${{ inputs.target }}` 讓手動觸發時的選擇決定環境。設定 environment 的值一定要加 `-e`，否則改到的是儲存庫層、連 CI 一起影響。',
      },
      {
        id: 'cicd07-ex-validate', title: '缺少設定時，CI 立刻失敗', machine: 'cicd07-lab',
        statement: 'rider-api 的 CI 一直是綠的，用的卻是 localhost（儲存庫的 variable 被拼成 DB_HSOT）。在 ~/rider-api：（1）新增 `bin/check-config.sh`：API_BASE_URL、DB_HOST 依序檢查，每個空的（或沒有設定的）印一行 `::error::名稱 is required`，有缺少時以 1 結束，全部都有時印 `Config OK` 並以 0 結束；（2）在 ci.yml 的 job test 裡、Show config 之前加一個 step，name 為 `Validate config`，執行 `bash bin/check-config.sh`，並讓 ci.yml 也能手動觸發（workflow_dispatch）。提交並推送到 main，確認這次推送的 CI 在 Validate config 失敗、指出 DB_HOST；然後修正 variable（設定 DB_HOST 為 `db-test.kestrel.internal`，刪掉 DB_HSOT），用 `gh workflow run` 手動再跑一次 CI，確認通過。',
        checks: [
          { kind: 'run', repo: RIDER, workflow: 'ci.yml', event: 'push', ref: 'main', tip: true, job: 'test', step: 'Validate config', conclusion: 'failure',
            logIncludes: '##[error]DB_HOST is required', logExcludes: 'API_BASE_URL is required' },
          { kind: 'run', repo: RIDER, workflow: 'ci.yml', event: 'workflow_dispatch', job: 'test', step: 'Validate config', conclusion: 'success', logIncludes: 'Config OK' },
          { kind: 'run', repo: RIDER, workflow: 'ci.yml', event: 'workflow_dispatch', conclusion: 'success', logIncludes: 'rider-api config: api=https://api.test.kestrel.example db=db-test.kestrel.internal' },
          { kind: 'variable', repo: RIDER, name: 'DB_HOST', value: 'db-test.kestrel.internal' },
          { kind: 'variable', repo: RIDER, name: 'DB_HSOT', absent: true },
        ],
        solution: ['cd rider-api', heredoc('bin/check-config.sh', CHECK()), 'bash bin/check-config.sh || true', DISPATCH_CI, VALIDATE_STEP, 'cat .github/workflows/ci.yml', ...PUSH_CHECK,
          'gh run watch 4100000001', "gh run view 4100000001 --log-failed | grep error | cut -f 3", ...FIX_VAR, 'gh workflow run ci.yml', 'gh run watch 4100000002'],
        mistakes: [
          { commands: ['cd rider-api', heredoc('bin/check-config.sh', CHECK(false)), DISPATCH_CI, VALIDATE_STEP, ...PUSH_CHECK, 'gh run watch 4100000001', ...FIX_VAR, 'gh workflow run ci.yml', 'gh run watch 4100000002'],
            why: '指令稿印出了 `::error::`，卻一律以 0 結束：記錄裡有錯誤訊息，step 仍然成功，CI 照樣往下用 localhost' },
          { commands: ['cd rider-api', ...FIX_VAR, heredoc('bin/check-config.sh', CHECK()), DISPATCH_CI, VALIDATE_STEP, ...PUSH_CHECK, 'gh run watch 4100000001', 'gh workflow run ci.yml', 'gh run watch 4100000002'],
            why: '先修好 variable 才推送驗證：推送的 CI 直接通過，沒有確認驗證真的會擋下缺少的設定' },
          { commands: ['cd rider-api', heredoc('bin/check-config.sh', CHECK()), DISPATCH_CI, VALIDATE_STEP, ...PUSH_CHECK, 'gh run watch 4100000001', 'gh variable delete DB_HSOT', 'gh workflow run ci.yml', 'gh run watch 4100000002'],
            why: '只刪掉拼錯的 DB_HSOT，沒有設定 DB_HOST：手動執行的 CI 仍然在 Validate config 失敗' },
          { commands: ['cd rider-api', heredoc('bin/check-config.sh', CHECK()), DISPATCH_CI, VALIDATE_STEP, ...PUSH_CHECK, 'gh run watch 4100000001', 'gh variable set DB_HOST -e staging --body db-test.kestrel.internal', 'gh variable delete DB_HSOT', 'gh workflow run ci.yml', 'gh run watch 4100000002'],
            why: 'DB_HOST 設在 environment staging：CI 的 job 沒有選 environment，只看得到儲存庫層的 variable' },
          { commands: ['cd rider-api', heredoc('bin/check-config.sh', CHECK()), VALIDATE_STEP, ...PUSH_CHECK, 'gh run watch 4100000001', ...FIX_VAR, 'gh workflow run ci.yml'],
            why: 'ci.yml 沒有加 workflow_dispatch：`gh workflow run` 被拒絕（HTTP 422），修好 variable 之後沒有再跑一次' },
        ],
        hints: [
          '一個設定一行：`if [ -z "$DB_HOST" ]; then echo "::error::DB_HOST is required"; status=1; fi`，最後 `exit $status`；先在本機 `bash bin/check-config.sh` 與 `DB_HOST=x API_BASE_URL=y bash bin/check-config.sh` 試兩種情況',
          "`sed -i 's/^on:/&\\n  workflow_dispatch:/' .github/workflows/ci.yml` 加上手動觸發；Validate config 的兩行（`      - name: Validate config` 與 `        run: bash bin/check-config.sh`）要插在 `      - name: Show config` 之前",
          '推送後 `gh run watch ID` 看它失敗，`gh run view ID --log-failed` 看原因；`gh variable set DB_HOST --body …`、`gh variable delete DB_HSOT`，再 `gh workflow run ci.yml`',
        ],
        explanation: '驗證要在使用設定之前執行，而且缺少時一定要以非 0 結束，step 才會失敗、管線才會停下；`::error::` 讓訊息成為記錄裡的 `##[error]` 與 ANNOTATIONS，一眼看出缺了什麼。先看到它在錯的設定下失敗，再看到修正後通過，才能確定它真的在保護你。改 variable 不會觸發推送事件，所以讓 CI 也能手動觸發，改完設定就能立刻重新驗證。',
      },
    ],
  },
};
