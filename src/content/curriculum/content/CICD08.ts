import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { LessonContent } from '../schema';

/*
 * CICD08 機密管理 (the blueprint's case-study-board, terminal-sim on the artifacts profile: engine stages E25 git, E26
 * forge, E27 workflows, E28 actions and E29 artifacts), built like LNX01, SRV13 and DKR12 as a case: the incident review
 * INC-2026-031 of a made-up logistics team, Tidewater, on the simulated github.example. Hsu Wen (the learner, gh login
 * wen-hsu, admin of both repositories) holds the case file ~/case: the brief, the platform team's export of registry
 * tokens and the new scoped token parcel-ci.token (mode 600). tidewater/parcel-api (~/parcel-api) is a small Node API.
 * Its history: Chou Ming added the deploy workflow on 2026-08-14 together with config/deploy.env, which held the registry
 * token of tidewater-deploy (push, pull and delete on tidewater/*); on 2026-09-30 he deleted the file and moved the same
 * value into the repository secret REGISTRY_TOKEN, without rotating it, and added a "Check the token" step that prints the
 * token's first 12 characters (not masked). deploy.yml asks for write-all and puts the secret in the workflow's env;
 * pr-title.yml interpolates ${{ github.event.pull_request.title }} into run: (script injection, real on the engine). The
 * platform team revoked tidewater-deploy this morning, so Deploy now fails at docker login; the registry
 * cr.tidewater.example only knows parcel-ci (push to tidewater/parcel-api). wen-hsu/secret-lab (~/secret-lab) is the
 * learner's sandbox with two workflows (Mask: masking and its limits; Greet: the injectable pattern) and the lab token file
 * ~/lab-token.txt. The variant of the first exercise changes the commit that added config/deploy.env. The clock is
 * 2026-11-24 02:30 UTC (10:30 in Asia/Taipei). Organisation, people, hosts and every token are made up (each token value
 * contains lesson, fake or demo); every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, mode = 0o644, owner = 'learner'): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const PARCEL = 'https://github.example/tidewater/parcel-api.git';
const LAB = 'https://github.example/wen-hsu/secret-lab.git';
const REGISTRY = 'cr.tidewater.example';
const WEN = { name: 'Hsu Wen', email: 'wen@tidewater.example' }, MING = { name: 'Chou Ming', email: 'ming@tidewater.example' };
const OLD_TOKEN = 'demo-registry-token-lesson-0814';
const NEW_TOKEN = 'lesson-parcel-ci-token-1124';
const LAB_TOKEN = 'fake-lab-token-for-masking-0001';
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** A command writing this text to the file with a quoted here-document (the text ends with a newline). */
const heredoc = (path: string, text: string, append = false) => `cat ${append ? '>>' : '>'} ${path} <<'EOF'\n${text}EOF`;

const IMAGE = `${REGISTRY}/tidewater/parcel-api:sha-\${{ github.sha }}`;
const BUILD_PUSH = [`      - run: docker build -q -t ${IMAGE} .`, `      - run: docker push ${IMAGE}`];
const DEPLOY_V1 = wf('name: Deploy', 'on: workflow_dispatch', 'permissions: write-all', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: cat config/deploy.env',
  `      - run: . config/deploy.env && echo "$REGISTRY_TOKEN" | docker login ${REGISTRY} -u "$REGISTRY_USER" --password-stdin`, ...BUILD_PUSH);
const CHECK_STEP = ['      - name: Check the token', '        run: echo "Token starts with $(echo "$REGISTRY_TOKEN" | cut -c 1-12)"'];
const DEPLOY_V2 = wf('name: Deploy', 'on: workflow_dispatch', 'permissions: write-all', 'env:', '  REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}', 'jobs:', '  deploy:',
  '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', ...CHECK_STEP,
  `      - run: echo "$REGISTRY_TOKEN" | docker login ${REGISTRY} -u tidewater-deploy --password-stdin`, ...BUILD_PUSH);
const PR_TITLE = wf('name: PR title', 'on: pull_request', 'jobs:', '  title:', '    runs-on: ubuntu-latest', '    steps:',
  '      - run: echo "PR title: ${{ github.event.pull_request.title }}"');

const PKG = '{\n  "name": "parcel-api",\n  "version": "2.3.0",\n  "scripts": {\n    "start": "node src/server.js",\n    "test": "node --test"\n  }\n}\n';
const APP_ENV = 'REGION=ap-east\nLOG_LEVEL=info\nAPI_BASE_URL=https://api.tidewater.example\nPICKUP_POINTS_URL=https://pickup.tidewater.example/v1\n';
const DEPLOY_ENV = `REGISTRY_HOST=${REGISTRY}\nREGISTRY_USER=tidewater-deploy\nREGISTRY_TOKEN=${OLD_TOKEN}\n`;
const DOCKERFILE = 'FROM node:22-slim\nWORKDIR /app\nCOPY package.json ./\nCOPY src/ ./src/\nCMD ["node", "src/server.js"]\n';
const SERVER = (extra = '') => `import { createServer } from 'node:http';\n\nconst port = process.env.PORT ?? 3000;\ncreateServer((req, res) => res.end('parcel-api${extra}')).listen(port);\n`;

/** The parcel-api history; the variant of the first exercise changes the commit that added config/deploy.env. */
const parcelCommits = (variant = false): TerminalGitCommit[] => [
  { id: 't1', message: 'Initial commit', author: MING, time: '2026-06-02 02:00:00', files: {
    'README.md': '# parcel-api\n\nParcel tracking API for Tidewater Logistics.\n', 'package.json': PKG, 'package-lock.json': '{\n  "name": "parcel-api",\n  "lockfileVersion": 3\n}\n',
    'src/server.js': SERVER(), Dockerfile: DOCKERFILE, 'config/app.env': APP_ENV,
  } },
  { id: 't2', message: variant ? 'Push images to the team registry' : 'Add the deploy workflow', author: MING, time: variant ? '2026-08-21 07:40:00' : '2026-08-14 06:10:00', files: {
    '.github/workflows/deploy.yml': DEPLOY_V1, 'config/deploy.env': DEPLOY_ENV,
  } },
  { id: 't3', message: 'Look up parcels by phone number', author: WEN, time: '2026-09-03 03:00:00', files: { 'src/server.js': SERVER(' (phone lookup)') } },
  { id: 't4', message: 'Move the registry token to an Actions secret', author: MING, time: '2026-09-30 03:00:00', files: {
    '.github/workflows/deploy.yml': DEPLOY_V2, 'config/deploy.env': null,
  } },
  { id: 't5', message: 'Check pull request titles', author: MING, time: '2026-10-20 05:00:00', files: { '.github/workflows/pr-title.yml': PR_TITLE } },
  { id: 't6', message: 'Return the pickup point', author: WEN, time: '2026-11-18 02:00:00', files: { 'src/server.js': SERVER(' (phone lookup, pickup point)') } },
];

const LAB_MASK = wf('name: Mask', 'on: workflow_dispatch', 'jobs:', '  show:', '    runs-on: ubuntu-latest', '    env:', '      LAB_TOKEN: ${{ secrets.LAB_TOKEN }}', '    steps:',
  '      - run: echo "token=$LAB_TOKEN"', '      - run: echo "$LAB_TOKEN" | tr a-z A-Z', '      - run: echo "$LAB_TOKEN" | cut -c 1-8',
  '      - run: |', '          UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)', '          echo "::add-mask::$UPPER"', '          echo "upper=$UPPER"');
const LAB_GREET = wf('name: Greet', 'on: pull_request', 'jobs:', '  greet:', '    runs-on: ubuntu-latest', '    steps:',
  '      - run: echo "Thanks for: ${{ github.event.pull_request.title }}"');
const LAB_COMMITS: TerminalGitCommit[] = [
  { id: 'l1', parents: [], message: 'Experiments with Actions secrets', author: WEN, time: '2026-11-20 08:00:00', files: {
    'README.md': '# secret-lab\n\nA sandbox for trying Actions secrets. Nothing here deploys anything.\n',
    '.github/workflows/mask.yml': LAB_MASK, '.github/workflows/greet.yml': LAB_GREET,
  } },
];

const BRIEF = [
  '事故檢討 INC-2026-031：parcel-api 的 Registry Token 外洩',
  '發現：11/24 09:20（台北時間）安全組在一份分享出去的舊 CI 日誌裡看到 Registry Token 的明文。',
  'Token：Registry 使用者 tidewater-deploy，值以 demo-registry-token 開頭。',
  '處置：平台組已在 09:40 撤銷 tidewater-deploy，並發了只能推送 tidewater/parcel-api 的新 Token（使用者 parcel-ci）。',
  '新 Token：~/case/parcel-ci.token（只給 Deploy 用，請勿貼到聊天室或指令列）。',
  '待辦：找出 Token 何時進了儲存庫、檢查 workflow 還有哪些洩漏途徑、讓 Deploy 換上新 Token 並恢復運作。',
].join('\n') + '\n';
const TOKENS = [
  '# 平台組匯出的 Registry Token 清單（cr.tidewater.example，課程資料）',
  'USER              SCOPE                          CREATED           STATUS',
  'tidewater-deploy  tidewater/* push,pull,delete   2026-08-14 06:05  revoked 2026-11-24 01:40 UTC',
  'parcel-ci         tidewater/parcel-api push      2026-11-24 01:45  active',
].join('\n') + '\n';

const GIT = (variant = false): TerminalMachine['git'] => ({
  user: WEN, commits: [...parcelCommits(variant), ...LAB_COMMITS],
  remotes: [{ url: PARCEL, branches: { main: 't6' } }, { url: LAB, branches: { main: 'l1' } }],
  repos: [{ path: '/home/learner/parcel-api', origin: PARCEL }, { path: '/home/learner/secret-lab', origin: LAB }],
});

const lab: TerminalMachine = {
  id: 'cicd08-lab', title: 'wen-laptop（Tidewater 平台組的值班筆電）', user: 'learner', cwd: '/home/learner', host: 'wen-laptop', profile: 'artifacts',
  timezone: 'Asia/Taipei', now: '2026-11-24 02:30:00',
  files: [dir('/home', 'root'), dir('/home/learner'), dir('/home/learner/case', 'learner', 0o700), file('/home/learner/case/brief.txt', BRIEF),
    file('/home/learner/case/registry-tokens.txt', TOKENS), file('/home/learner/case/parcel-ci.token', `${NEW_TOKEN}\n`, 0o600), file('/home/learner/lab-token.txt', `${LAB_TOKEN}\n`, 0o600)],
  git: GIT(),
  forge: { login: 'wen-hsu', repos: [
    { url: PARCEL, description: 'Parcel tracking API', permission: 'admin', workflowPermissions: 'write', environments: ['production'],
      secrets: [{ name: 'REGISTRY_TOKEN', value: OLD_TOKEN, updated: '2026-09-30 03:00:00' }],
      variables: [{ name: 'REGION', value: 'ap-east', updated: '2026-06-02 02:00:00' }, { name: 'LOG_LEVEL', value: 'warn', env: 'production', updated: '2026-08-14 06:00:00' }] },
    { url: LAB, description: 'A sandbox for Actions secrets', permission: 'admin' },
  ] },
  actions: {},
  docker: {
    images: [{ name: 'node:22-slim', size: 200_100_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'] }],
    registries: [{ host: REGISTRY, users: [{ name: 'parcel-ci', token: NEW_TOKEN, push: true, repos: ['tidewater/parcel-api'] }] }],
  },
};

// Exercise 1: the commit that added the token (the first commit of config/deploy.env).
const FIRST_OF_FILE = 'git log --oneline --reverse -- config/deploy.env | head -1';
// Exercise 2: the PR title through an environment variable, tested with a title that would run a command.
const PR_TITLE_FIXED = wf('name: PR title', 'on: pull_request', 'permissions: {}', 'jobs:', '  title:', '    runs-on: ubuntu-latest', '    steps:',
  '      - env:', '          PR_TITLE: ${{ github.event.pull_request.title }}', '        run: echo "PR title: $PR_TITLE"');
const PR_TITLE_ENV_EXPR = PR_TITLE_FIXED.replace('echo "PR title: $PR_TITLE"', 'echo "PR title: ${{ env.PR_TITLE }}"');
const PR_TITLE_SINGLE = PR_TITLE.replace('echo "PR title: ${{ github.event.pull_request.title }}"', "echo 'PR title: ${{ github.event.pull_request.title }}'");
const TEST_TITLE = 'docs: phone lookup $(echo INJECTED)';
const WRITE_TITLE = (text: string) => heredoc('.github/workflows/pr-title.yml', text);
const FIX_MAIN = (text = PR_TITLE_FIXED) => [WRITE_TITLE(text), "git commit -qam 'Pass the PR title through an environment variable'", 'git push -q'];
const TEST_PR = (title = TEST_TITLE) => ['git switch -c title-test', "echo 'Parcels can be looked up by phone number.' >> README.md", "git commit -qam 'Document the phone lookup'",
  'git push -q -u origin title-test', `gh pr create --title '${title}' --body 'The title must be printed, not run.'`];
// Exercise 3: rotate to the scoped token in production, least privilege, nothing of the token in the log.
const DEPLOY_HEAD = (o: { perms?: string[]; env?: boolean; source?: string; check?: boolean } = {}) => {
  const token = `REGISTRY_TOKEN: \${{ ${o.source ?? 'secrets'}.REGISTRY_TOKEN }}`;
  // check: the old Check the token step kept, so the token goes to the whole job (as in the old workflow) instead of one step.
  return wf('name: Deploy', 'on: workflow_dispatch', ...o.perms ?? ['permissions:', '  contents: read'], 'jobs:', '  deploy:', '    runs-on: ubuntu-latest',
    ...o.env === false ? [] : ['    environment: production'], ...o.check ? ['    env:', `      ${token}`] : [], '    steps:', '      - uses: actions/checkout@v4', ...o.check ? CHECK_STEP : [],
    '      - name: Log in to the registry', ...o.check ? [] : ['        env:', `          ${token}`], `        run: echo "$REGISTRY_TOKEN" | docker login ${REGISTRY} -u parcel-ci --password-stdin`);
};
const WRITE_DEPLOY = (head = DEPLOY_HEAD()) => {
  // A head over the 500-character line limit (the kept check step) is written in two parts, cut before the login step.
  const parts = head.length > 400 ? head.split(/(?=      - name: Log in)/) : [head];
  return [...parts.map((p, i) => heredoc('.github/workflows/deploy.yml', p, i > 0)), heredoc('.github/workflows/deploy.yml', wf(...BUILD_PUSH), true)];
};
const SHIP = ["git commit -qam 'Deploy with the scoped parcel-ci token'", 'git push -q', 'gh workflow run deploy.yml', 'gh run watch 4100000001'];
const ROTATE = ['gh secret set REGISTRY_TOKEN -e production < ~/case/parcel-ci.token', 'gh secret delete REGISTRY_TOKEN'];

export const CICD08: LessonContent = {
  lessonId: 'CICD08',
  motivation: '早上九點二十分，安全組在一份被分享出去的舊 CI 日誌裡看到了 parcel-api 的 Registry Token 明文。四十分鐘後平台組撤銷了它，Deploy 跟著全部失敗。真正的問題接著才來：這把 Token 是怎麼進到儲存庫的？暴露了多久？9 月不是已經「移到 Actions secret」了嗎，日誌不是會自動遮蔽成 `***` 嗎？CICD07 把設定從程式碼裡分出來，這一課處理設定裡最危險的那一類：機密。你以平台組值班者 Hsu Wen 的身分接手事故檢討 INC-2026-031：先分辨哪些值是機密、哪些只是一般設定；從 Git 歷史找出 Token 進入儲存庫的 commit；看懂 secret 存放在哪裡、遮蔽做得到與做不到什麼；在模擬的 runner 上親手重現並修正 PR 標題造成的 script injection；最後以範圍更小的新 Token 完成輪替，把 GITHUB_TOKEN 與 Registry Token 都收斂到最小權限，並整理一份外洩時的處理順序。目標是讓 API Key、Token 與密碼不出現在程式碼、日誌與 Image 裡，萬一外洩，也知道先做什麼。',
  sections: [
    {
      id: 'cicd08-s-case', title: '事故檢討：案件、儲存庫與終端機',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的 Tidewater 物流公司，程式放在模擬的 GitHub 主機 `github.example`，Image 放在團隊的 Registry `cr.tidewater.example`。你是平台組的 Hsu Wen（GitHub 帳號 wen-hsu），值班筆電 wen-laptop 的家目錄裡有兩個儲存庫的複本與一個案件資料夾。模擬環境的時鐘是 2026-11-24 02:30 UTC，也就是台北時間上午 10:30，平台組在 09:40 撤銷了外洩的 Token。' },
        { type: 'table', head: ['儲存庫', '內容', 'workflow', '你的權限'], rows: [
          ['tidewater/parcel-api（~/parcel-api）', '包裹查詢的小型 Node.js API；同事 Chou Ming 寫了部署流程；有一個 environment：production', 'deploy.yml（Deploy：手動觸發，登入 Registry、建置並推送 Image）、pr-title.yml（PR title：在 Pull Request 上印出標題）', '管理員（admin）；儲存庫預設的 workflow 權限是寬鬆的 write'],
          ['wen-hsu/secret-lab（~/secret-lab）', '你自己的練習儲存庫，什麼也不部署', 'mask.yml（Mask：試遮蔽）、greet.yml（Greet：印出 PR 標題的危險寫法）', '管理員'],
        ] },
        { type: 'table', head: ['案件資料', '內容'], rows: [
          ['`~/case/brief.txt`', '事故簡報：怎麼發現、已經做了什麼、待辦事項'],
          ['`~/case/registry-tokens.txt`', '平台組匯出的 Registry Token 清單：每個 Token 的使用者、範圍、建立時間與狀態'],
          ['`~/case/parcel-ci.token`', '平台組新發的 Token，權限 600，只有你讀得到；用它完成輪替（第三個練習）'],
          ['`~/lab-token.txt`', '練習用的假 Token，只在 secret-lab 裡用'],
        ] },
        { type: 'p', text: '事故檢討和 SRV13 的故障排除、DKR12 的安全審查一樣，以證物為準，不以記憶或口頭說明為準：Git 的歷史說明了 Token 何時進入儲存庫，run 的日誌說明了它被印出過什麼，workflow 檔案與 Set up job 的權限群組說明了誰拿得到什麼。檢討的目的是找出流程上的缺口並補起來，而不是追究是誰提交的。本課用到的指令：' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`gh secret set 名稱 [-e environment] < 檔案`', '從標準輸入設定 secret（儲存庫層級或某個 environment）；`gh secret list`、`gh secret delete 名稱` 列出與刪除'],
          ['`gh variable list [-e environment]`、`gh variable set 名稱 --body 值`', '一般設定（Actions variable）：列出時連值一起顯示'],
          ['`gh workflow run 檔名`、`gh run watch ID`、`gh run view ID --log`', '手動觸發、等 run 結束、看完整日誌（每行是「job、step、時間戳記與內容」，以 Tab 隔開，`cut -f 3` 只留內容）'],
          ['`git log -p`、`git log --oneline -- 路徑`', '看每個 commit 的變更；只列改動過某個路徑的 commit（包括把它刪掉的那一個）'],
          ["`cat > 檔案 <<'EOF'`（多行，最後一行是 `EOF`）", '用這幾行取代整個檔案，`>>` 則接在最後；`EOF` 加上單引號，`$` 與 `${{ }}` 才會照字面寫入'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'workflow 真的會在模擬的 runner 上執行，secret 的遮蔽、`::add-mask::`、environment 的範圍、GITHUB_TOKEN 的權限與 script injection 都依 GitHub 的規則模擬；Registry 會真的檢查 Token，所以被撤銷的 Token 登入會失敗。機密儲存服務、雲端的短期憑證、Git 歷史的改寫、平台的 secret scanning 只在課文說明。為了讓答案能重複驗證，日誌與輸出比真實的精簡，終端機一個指令最多 500 個字元。公司、人物、主機與每一個 Token 都是虛構的，值裡都含有 lesson、fake 或 demo，不是任何真實服務的格式。' },
      ],
    },
    {
      id: 'cicd08-s-config', title: '機密與一般設定',
      blocks: [
        { type: 'p', text: 'CICD07 把設定從程式碼裡分出來：同一份程式在 dev、test、prod 讀不同的環境變數與設定檔。設定裡有一小部分是機密（secret）：能證明身分或取得存取權的值，例如密碼、API Key、存取 Token、私鑰、簽章金鑰、含有密碼的資料庫連線字串，以及路徑或參數裡帶著金鑰的 Webhook 網址。分辨的方法很簡單：如果這個值被貼到公開的地方，別人能不能拿它做事？能，就是機密。' },
        { type: 'table', head: ['', '一般設定', '機密'], rows: [
          ['parcel-api 的例子', '`REGION=ap-east`、`LOG_LEVEL=warn`、`API_BASE_URL`、Registry 的主機名稱', 'Registry Token、資料庫密碼、通知服務的 Webhook 金鑰'],
          ['外洩的後果', '別人知道你部署在哪個區域、用什麼等級記錄日誌，通常無害', '別人可以冒用你的身分：推送或刪除 Image、讀寫資料、以你的名義發訊息'],
          ['能不能進版本控制', '可以，設定檔跟著程式碼一起審查、一起回溯', '不行，任何時候都不行，包括「暫時」與私有儲存庫'],
          ['在 GitHub Actions 裡', 'variable：`vars.名稱`，值看得到，`gh variable list` 直接列出', 'secret：`secrets.名稱`，加密保存、只能寫不能讀，日誌遮蔽成 `***`'],
          ['在日誌與 Image 裡', '印出來方便除錯', '不印、不寫進 Image 的任何一層、不放進 artifact'],
          ['改變的方式', '改設定、重新部署', '輪替：發新的、換上、確認、撤銷舊的（第六節）'],
        ] },
        { type: 'p', text: '下面的例子先讀案件資料，再看 parcel-api 現在怎麼放設定與機密。' },
        { type: 'example', id: 'cicd08-case' },
        { type: 'p', text: '`config/app.env` 是一般設定，放在儲存庫裡沒有問題；production 的日誌等級是 environment 的 variable，連值一起列出。secret 則只列出名稱與更新時間：REGISTRY_TOKEN 在「大約一個月前」，也就是 9 月 30 日 Chou Ming 把它從設定檔搬過來的時候，之後再也沒有換過；production environment 裡還沒有任何 secret。平台組的清單更值得注意：外洩的 tidewater-deploy 能對 `tidewater/*` 底下每一個 Image 推送、拉取與刪除，parcel-api 的部署只需要推送自己的那一個。新的 parcel-ci.token 權限是 600，只有你讀得到；簡報與清單本身不是機密，權限 644 也無妨。' },
        { type: 'p', text: '機密也不能進 Image。DKR12 看過：Dockerfile 的 `COPY . .` 會把工作目錄裡的設定檔一起複製進某一層，之後即使再刪除，`docker history` 與 Image 的層仍然留著它。parcel-api 的 Dockerfile 只複製 package.json 與 src/，所以當年的 config/deploy.env 沒有進 Image，這是少數做對的地方；要複製整個目錄時，用 `.dockerignore` 排除 `.env`、`config/*.env` 這類檔案。' },
        { type: 'callout', tone: 'warning', title: '「私有儲存庫，放 Token 沒關係」', text: '常見的想法是：儲存庫是私有的，只有團隊看得到，Token 放在設定檔裡比較方便。實際上「看得到」的範圍比想像的大：每個有讀取權限的人、每一台 clone 過的筆電與 CI runner、每一份備份與 fork，以及印出那個檔案的每一份 CI 日誌與 artifact；而 Git 會永遠保存每一個版本，儲存庫哪天改成公開或帳號被入侵，整段歷史一起外流。寫在程式碼裡的 Token 也很難輪替，因為每次更換都要改程式、重新部署。INC-2026-031 正是這樣：Token 在 8 月進了設定檔，舊的 Deploy 又把整個檔案 cat 到日誌裡，三個月後那份日誌被分享出去。' },
      ],
    },
    {
      id: 'cicd08-s-store', title: '機密放在哪裡：secret、機密儲存服務與遮蔽',
      blocks: [
        { type: 'p', text: '在 GitHub Actions 裡，機密放在 Actions secret：值在送出前就以儲存庫的公開金鑰加密，存進去之後連管理員也讀不回來（`gh secret list` 只有名稱與更新時間），只有在 job 執行時才以 `${{ secrets.名稱 }}` 交給 runner。沒有設定的 secret 是空字串，不會報錯，所以名稱打錯或範圍不對時，常見的症狀是「登入失敗」而不是「找不到 secret」。secret 有三種範圍：' },
        { type: 'table', head: ['範圍', '誰拿得到', '適合'], rows: [
          ['儲存庫（`gh secret set 名稱`）', '這個儲存庫的每一個 workflow、每一個 job', '各個 job 都需要、而且不分環境的值；越少越好'],
          ['environment（`gh secret set 名稱 -e production`）', '只有寫了 `environment: production` 的 job；同名時蓋過儲存庫層級的值', '部署用的憑證：staging 與 production 各一把，互不相通；environment 還能加上審核等保護規則（CICD09）'],
          ['組織', '組織指定的幾個儲存庫', '多個儲存庫共用的值（模擬環境不支援，只在課文說明）'],
        ] },
        { type: 'p', text: '設定 secret 時，值從哪裡給也有講究。`gh secret set 名稱 --body 值` 最方便，但整行指令（包括值）會寫進 Shell 的歷史檔（Bash 的 `~/.bash_history`），執行的那一刻同一台機器的其他使用者也可能從行程清單看到參數；螢幕分享與終端機的錄影也會記下它。真正的值改從標準輸入給：`gh secret set 名稱 < 檔案`（檔案權限 600，用完刪除或妥善保存）、從另一個指令的管線，或在互動的終端機上讓 gh 提示你貼上。`docker login --password-stdin` 也是同樣的道理，`-p 密碼` 會把密碼留在指令列上。' },
        { type: 'p', text: '更進一步的做法是機密儲存服務（secret store，也常叫做 vault）：一個專門保管機密的服務，集中加密保存、依應用程式或身分控制誰能讀哪一個、記錄每一次讀取（稽核）、保留版本，並且能自動輪替，甚至在每次需要時才發一組幾分鐘後就失效的動態憑證。管線不再長期保存 Token，而是在執行時向它索取：GitHub Actions 可以讓 job 取得一個短期的身分 Token（OIDC，`permissions` 要有 `id-token: write`），雲端服務或機密儲存服務確認「這是 tidewater/parcel-api 在 main 上的 Deploy」之後，才發給它短期憑證。這些都不在模擬環境裡，但方向相同：機密越少地方保存、存活的時間越短，外洩時的損害就越小。' },
        { type: 'p', text: '執行時，runner 會把 job 看得到的每一個 secret 的值，在日誌的每一行（包括 `env:` 的顯示）換成 `***`，這叫遮蔽（masking）。遮蔽是逐字比對：只認得 secret 原本的值，值被轉換、切開或混進其他文字之後就認不出來。GitHub 的文件也因此建議不要把 JSON 這類結構化的資料整個存成一個 secret。對於自己算出來、同樣敏感的值，可以先印出 `::add-mask::值`，之後的日誌就會遮蔽它。下面的例子在 secret-lab 試試看。' },
        { type: 'example', id: 'cicd08-mask' },
        { type: 'p', text: '`gh secret set LAB_TOKEN < ~/lab-token.txt` 從檔案讀值，畫面與 Shell 的歷史裡都沒有值。run 裡原樣印出的 `token=$LAB_TOKEN` 是 `token=***`；轉成大寫的整個 Token、`cut` 切出的前 8 個字 `fake-lab` 卻都以明文出現。最後一個 step 先用 `::add-mask::` 登記大寫的版本，之後的 `upper=$UPPER` 就變成 `upper=***`。runner 讀到 `::add-mask::…` 這一行輸出時不會顯示它（指令稿裡只看得到變數名稱 `$UPPER`）；登記要在印出那個值之前，已經印出的行不會回頭補遮。' },
        { type: 'callout', tone: 'warning', title: '「反正日誌會遮蔽，印出來也沒關係」', text: '遮蔽只是一張安全網，不是安全邊界。它只修改日誌的文字：base64、URL 編碼、大小寫轉換、取前幾個字、一個字一個字印出，都會讓值以別的樣子出現；更重要的是，step 拿到 secret 之後可以把它寫進 artifact、Image 或檔案，也可以用 `curl` 送到任何地方，遮蔽完全管不到。換句話說，能修改 workflow 的人就能讀到這個 workflow 拿得到的 secret。除錯時要確認「secret 有沒有設定」，用 `test -n "$TOKEN"` 判斷是否為空，而不是印出它的開頭。' },
      ],
    },
    {
      id: 'cicd08-s-injection', title: 'Script injection：不受信任的文字不能變成指令',
      blocks: [
        { type: 'p', text: 'workflow 的運算式 `${{ }}` 寫在 `run:` 裡時，是在 runner 把指令稿交給 Bash 之前，以文字代換進去的。如果代換進去的是別人能決定的文字，那段文字就成了指令稿的一部分，這就是 script injection。別人能決定的文字比想像的多：Pull Request 的標題與內容、issue 的標題與內容、留言、分支名稱（`github.head_ref`）、commit 訊息與作者名稱，只要開得了 PR 或 issue 的人都能控制。下面的例子在 secret-lab 開一個標題裡含有 `$(id -un)` 的 Pull Request。' },
        { type: 'example', id: 'cicd08-injection' },
        { type: 'p', text: '日誌的第一行就看得出發生了什麼：`##[group]Run` 之後是代換完的指令稿，標題已經被放進雙引號裡；Bash 解析這一行時，`$(id -un)` 是命令替換，於是 runner 真的執行了 `id -un`，印出 runner 的使用者名稱 `runner`。換成別的標題，同樣的位置可以讀取環境變數與工作目錄裡的檔案、用 `curl` 把它們送出去，或用 job 的 GITHUB_TOKEN 改動儲存庫。遮蔽在這裡幫不上忙：secret 被送到外面時，根本沒有經過日誌。' },
        { type: 'table', head: ['寫法', '結果'], rows: [
          ['`run: echo "${{ github.event.pull_request.title }}"`', '注入：標題裡的 `$(…)`、`` ` ``、`";` 都會執行'],
          ["`run: echo '${{ github.event.pull_request.title }}'`", '仍然注入：標題裡放一個 `\'` 就能結束單引號，再接上自己的指令'],
          ['`env:` 底下 `TITLE: ${{ github.event.pull_request.title }}`，`run: echo "$TITLE"`', '安全：指令稿裡只有變數名稱，Bash 展開變數的值時不會再把它當成指令解析'],
          ['同上，但 `run: echo "${{ env.TITLE }}"`', '又注入了：`${{ env.TITLE }}` 仍是運算式，在 Bash 之前就被代換成標題的文字'],
          ['把值經由 `with:` 交給一個 action', '值是 action 的輸入參數，不經過 Shell 的解析；仍要確認那個 action 自己沒有把它拼進指令'],
        ] },
        { type: 'p', text: '修正的原則是「資料走資料的路」：不受信任的文字經由 `env:` 變成環境變數，指令稿裡用加了雙引號的 `"$TITLE"` 讀取。雙引號避免值被拆成多個字或被當成萬用字元展開；不加引號雖然不會執行命令替換，但含有 `*` 的標題可能展開成檔名清單。第二個練習要你把 parcel-api 的 pr-title.yml 這樣修好，並用一個真的會被執行的標題驗證。' },
        { type: 'p', text: '同樣的寫法在不同的事件下危險程度不同。fork 開來的 Pull Request 觸發 `pull_request` 時，GitHub 不提供 secret，GITHUB_TOKEN 也只有讀取權限；但同一個儲存庫的分支開的 PR 拿得到 secret。`pull_request_target`、`issue_comment`、`issues` 這類事件執行的是預設分支上的 workflow，拿得到 secret 與寫入權限，觸發的文字卻來自任何人，在這裡發生注入就等於把儲存庫交出去。所以不論是哪一個事件，`github.event` 裡的文字一律當作不受信任的輸入。' },
        { type: 'callout', tone: 'warning', title: '「加上引號就安全了」', text: '常見的誤解是：把 `${{ }}` 用引號包起來，標題就只是一個字串。可是引號是指令稿的一部分，而代換發生在 Bash 解析之前，攻擊者寫的文字可以先關掉你的引號，再接上自己的指令：雙引號擋不住 `$(…)` 與 `"`，單引號擋不住 `\'`。引號保護的是變數展開之後的值，不是代換進來的文字；真正的修正是讓文字根本不進入指令稿，經由環境變數傳進去。' },
      ],
    },
    {
      id: 'cicd08-s-least', title: '最小權限：GITHUB_TOKEN、Token 的範圍與 secret 的去處',
      blocks: [
        { type: 'p', text: '最小權限（least privilege）是：每個身分只拿到它的工作需要的權限，只在需要的地方、需要的時間內有效。它不能防止外洩，但決定了外洩之後的損害有多大。在管線裡要看三個層面：GITHUB_TOKEN 能做什麼、外部服務的 Token 能做什麼，以及 secret 交給了哪些 job 與 step。下面的例子手動執行目前的 Deploy。' },
        { type: 'example', id: 'cicd08-deploy' },
        { type: 'p', text: 'run 在登入 Registry 時失敗：`unauthorized: incorrect username or password`，因為 tidewater-deploy 已經被撤銷，這是平台組先止血的代價。「Check the token」把 Token 的前 12 個字 `demo-registr` 以明文印出，`env:` 裡的 `***` 只遮住了完整的值；9 月之後的每一次部署都這樣留下一段 Token。secret 寫在 workflow 層的 `env:`，所以 checkout、build、push 每一個 step 都拿得到它，step 裡執行的任何程式（例如之後加進來的建置指令稿或測試工具）也都讀得到這個環境變數。最後一段是 `permissions: write-all` 的結果：這個 job 的 GITHUB_TOKEN 可以改程式碼、改 Actions 的設定、發布套件，連 `id-token` 都是 write，而部署只需要讀程式碼。' },
        { type: 'table', head: ['層面', 'parcel-api 現在', '最小權限的做法'], rows: [
          ['GITHUB_TOKEN', '`permissions: write-all`', '`permissions:` 底下只寫 `contents: read`；需要在 PR 留言才加 `pull-requests: write`；不需要任何權限的 job 寫 `permissions: {}`'],
          ['Registry Token 的範圍', 'tidewater-deploy：`tidewater/*` 推送、拉取、刪除，沒有期限', 'parcel-ci：只能推送 `tidewater/parcel-api`；不需要刪除；設定到期日'],
          ['依環境分開', '一把 Token 給所有環境', 'staging 與 production 各一把、各自放在自己的 environment，一把外洩不影響另一個環境，也能分開輪替'],
          ['secret 的範圍', '儲存庫層級：每個 workflow 都拿得到', 'production environment 的 secret：只有 `environment: production` 的 job 拿得到'],
          ['在 job 裡', 'workflow 層的 `env:`：每個 step 都拿得到', '只寫在登入 Registry 那個 step 的 `env:`'],
          ['人', '能修改 workflow 的人就能讀到它的 secret', '保護 main 分支與 `.github/workflows/`，workflow 的變更要經過審查'],
        ] },
        { type: 'p', text: 'GITHUB_TOKEN 是 GitHub 為每個 job 自動產生的 Token，job 結束就失效，權限由 `permissions` 決定（CICD04 的規則：job 層的取代 workflow 層，寫出任何一個範圍，其他範圍都是 none）。外部服務的 Token 則要自己管理範圍與期限，原則相同：能只推送就不要刪除，能只限一個儲存庫就不要整個組織，能設到期日就不要永久有效。範圍越小，第三個練習的輪替也越安全：新的 parcel-ci 即使再外洩，也只能推送 parcel-api 的 Image。' },
        { type: 'callout', tone: 'tip', title: '確認 secret 有沒有設定，不要印出它', text: '要在部署前檢查 secret 是否存在，寫 `test -n "$REGISTRY_TOKEN" || { echo "REGISTRY_TOKEN is empty"; exit 1; }`：只判斷是否為空，日誌裡不會有值的任何部分。如果需要確認「換上的是新的那一把」，看服務端的紀錄（例如 Registry 上這次推送使用的帳號），而不是在日誌裡比對 Token 的開頭。' },
      ],
    },
    {
      id: 'cicd08-s-response', title: '輪替與外洩應變',
      blocks: [
        { type: 'p', text: '輪替（rotation）是把機密換成新的值，並讓舊的失效。它有兩個時機：依排程（例如每 90 天，或在 Token 到期前），讓一個沒被發現的外洩也只在有限的時間內有效；以及在懷疑外洩、或有權限的人離開團隊時，立刻輪替。排程的輪替可以做到不中斷服務：' },
        { type: 'list', ordered: true, items: [
          '向服務申請新的 Token（舊的仍然有效），範圍與期限照最小權限重新檢查。',
          '更新 secret：`gh secret set 名稱 -e production < 檔案`，名稱不變，workflow 不必修改。',
          '讓管線用新的 Token 實際跑一次，確認成功，日誌裡沒有它的任何片段。',
          '撤銷舊的 Token，並記下這次輪替的日期與下一次的時間。',
        ] },
        { type: 'p', text: '外洩時順序不同：外洩的值要當作已經被拿走了。公開儲存庫裡的 Token 常在幾分鐘內就被自動掃描的程式找到，所以第一件事是讓它失效，即使部署會因此暫停，就像平台組在 09:40 做的。之後的處理順序：' },
        { type: 'list', ordered: true, items: [
          '撤銷或輪替：讓外洩的值失效；有新的就換上，沒有就先撤銷再說。',
          '查影響範圍：暴露期從 Token 進入儲存庫或日誌的那一刻算起，到撤銷為止；查服務端的稽核紀錄（這段期間這個帳號推送、拉取、刪除了什麼），以及它還能存取哪些東西。',
          '換上新的機密，恢復服務，並確認新的不會用同樣的方式外洩。',
          '從程式碼移除：用新的 commit 刪除它。舊的 commit 仍然保存著它；改寫 Git 歷史（重寫每一個含有它的 commit、強制推送、請每個人重新 clone）可以把它從儲存庫拿掉，但 fork、別人的 clone、備份與平台上 Pull Request 的參照仍然有舊的 commit，所以改寫歷史永遠只是清理，不能取代撤銷。',
          '檢查日誌與產出物：印過它的 CI 日誌（刪除那些 run 的日誌）、artifact、Image 的每一層、聊天紀錄與工單。',
          '防止再發生：提交與推送前的 secret 掃描、workflow 變更的審查、最小權限與輪替的排程；檢討寫流程的缺口，不寫個人的錯。',
        ] },
        { type: 'p', text: '把 INC-2026-031 的證物排成時間線，就看得出每一個缺口：' },
        { type: 'table', head: ['時間（UTC）', '事件', '缺口'], rows: [
          ['2026-08（第一個練習找出是哪一個 commit）', 'Token 以明文寫進 config/deploy.env 並提交；當時的 Deploy 有一個 step 把整個檔案 cat 到日誌', '機密進了版本控制；日誌印出機密，而且它不是 secret，所以沒有遮蔽'],
          ['2026-09-30', '刪除 config/deploy.env，同一個值放進儲存庫的 secret；新增印出前 12 個字的 step', '刪檔沒有輪替，歷史與舊日誌裡仍是有效的 Token；遮蔽擋不住取前幾個字'],
          ['2026-10-20', '新增 pr-title.yml，把 PR 標題直接寫進 `run:`', 'script injection；儲存庫預設的寫入權限讓它更危險'],
          ['2026-11-24 01:20', '安全組在分享出去的舊日誌裡發現 Token', '暴露期超過三個月，範圍是整個 `tidewater/*`'],
          ['2026-11-24 01:40', '平台組撤銷 tidewater-deploy，01:45 發出只能推送 parcel-api 的 parcel-ci', '先止血；Deploy 暫停'],
        ] },
        { type: 'p', text: '三個練習接著完成剩下的事：從歷史確認暴露期的起點、修好 script injection，最後把新的 Token 放進 production 的 secret，讓 Deploy 以最小權限恢復運作。' },
        { type: 'callout', tone: 'warning', title: '「刪掉檔案（或改寫歷史）就沒事了」', text: '這是 INC-2026-031 在 9 月犯的錯：把 config/deploy.env 刪掉、把值搬進 secret，Token 卻還是同一把。刪除只是新增一個 commit，`git log -p` 或 `git show 舊的commit:config/deploy.env` 都還讀得到；即使改寫了歷史，也收不回已經被 clone、fork、備份或印進日誌的那些副本。只有讓舊的值失效，外洩才真正結束；移除與清理是在那之後，避免同一個值再被看到、也避免有人誤用。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd08-q-secret', prompt: '下列哪一個值應該放進 secret，而不是一般設定（Actions variable 或儲存庫裡的設定檔）？',
      options: ['`REGION=ap-east`：服務部署的區域，staging 與 production 各不相同', '`LOG_LEVEL=warn`：production 的日誌等級，改了之後要重新部署才生效', '路徑裡帶著金鑰的通知 Webhook 網址', '`API_BASE_URL=https://api.tidewater.example`：前端要呼叫的 API 位址'],
      answer: 2,
      explanation: '判斷的方法是「貼到公開的地方，別人能不能拿它做事」：帶著金鑰的 Webhook 網址讓任何人都能以你的名義送出通知，所以是機密。區域、日誌等級與 API 位址雖然因環境而不同、改了也要重新部署，但公開了也不能拿來冒用身分，屬於一般設定，放在 variable 或設定檔裡即可。',
    },
    {
      id: 'cicd08-q-body', prompt: '為什麼不建議用 `gh secret set DEPLOY_KEY --body 真正的值` 設定正式環境的 secret？',
      options: ['值會跟著整行指令留在 Shell 的歷史檔裡，執行時也可能從行程清單被看到', '用 `--body` 設定的 secret 不會加密，在 GitHub 上以明文保存，管理員讀得到', '`--body` 只能設定儲存庫層級的 secret，不能搭配 `-e` 設定 environment 的 secret', '用 `--body` 設定的值不會被遮蔽，之後每次 workflow 印出它都會以明文出現在日誌裡'],
      answer: 0,
      explanation: '問題在指令列本身：Bash 把整行指令（包括值）寫進歷史檔，執行時參數也可能被同一台機器的人從行程清單看到，所以改用 `< 檔案` 或管線從標準輸入給。secret 不論怎麼設定都會先加密再上傳、存進去後讀不回來；`--body` 一樣可以搭配 `-e`；遮蔽只看值，和設定的方式無關。',
    },
    {
      id: 'cicd08-q-mask', prompt: 'workflow 的 step 寫了 `run: echo "$TOKEN" | base64`，`TOKEN` 來自 `secrets.TOKEN`。這個 step 的日誌會出現什麼？',
      options: ['`***`：遮蔽會比對 secret 以及所有由它衍生出來的值', '什麼都沒有：runner 發現 secret 被交給其他指令時會讓 step 失敗', '空白的一行：secret 只出現在 `env:` 的顯示裡，指令稿讀不到它的值', 'Token 的 base64 編碼，以明文出現，沒有被遮蔽'],
      answer: 3,
      explanation: '遮蔽是逐字比對 secret 原本的值，base64 之後的文字和原值不同，所以以明文出現，任何人都能解碼回來。runner 不會比對衍生的值（要自己用 `::add-mask::` 登記），也不會因為 secret 被傳給別的指令而讓 step 失敗；環境變數裡的 secret 在指令稿裡讀得到真實的值，只有日誌的文字被遮蔽。',
    },
    {
      id: 'cicd08-q-injection', prompt: '一個由 `issue_comment` 觸發的 workflow 有 `run: echo "${{ github.event.comment.body }}"`。為什麼有人留言 `"; id; echo "` 就能讓 runner 執行 `id`？',
      options: ['runner 會把 echo 印出的文字再當成指令執行一次，所以留言裡的 id 也被執行', '運算式先被代換成留言的文字，Bash 解析時，那些引號與分號已是指令稿的一部分', '`issue_comment` 事件會讓留言的人暫時擁有儲存庫的寫入權限，可以直接修改 workflow', '`echo` 遇到雙引號裡的分號時，會把分號後面的內容當成另一個指令執行'],
      answer: 1,
      explanation: '`${{ }}` 在交給 Bash 之前就以文字代換，留言裡的 `"` 關掉了原本的引號，`;` 接上了新的指令，於是指令稿變成三個指令。runner 不會重新執行輸出的文字；留言不會給人任何權限；在正常的雙引號字串裡，分號只是普通字元，問題出在它根本不在引號裡。',
    },
    {
      id: 'cicd08-q-perms', prompt: '一個 job 只需要取出程式碼、跑檢查，並在 Pull Request 上留言回報結果。哪一個 `permissions` 最符合最小權限？',
      options: ['`permissions: write-all`，之後增加功能時就不必再回頭修改 workflow', '`permissions: read-all`，留言改用另一個存在 secret 裡、權限較大的個人 Token', '`contents: read` 與 `pull-requests: write`', '不寫 `permissions`，交給儲存庫的預設值，由管理員統一決定'],
      answer: 2,
      explanation: '取出程式碼要 `contents: read`，在 PR 留言要 `pull-requests: write`，寫出這兩個範圍，其他範圍自動是 none。`write-all` 給了遠超過需要的權限；改用個人 Token 反而多了一個長期有效、範圍更大的機密；不寫則取決於儲存庫的預設，寬鬆的預設幾乎全部是 write。',
    },
    {
      id: 'cicd08-q-first', prompt: '你發現 production 資料庫的密碼出現在一個公開儲存庫的 commit 裡。第一件事應該做什麼？',
      options: ['撤銷或更換那組密碼，讓外洩的值失效', '用一個新的 commit 刪掉那一行，避免更多人在目前的檔案裡看到', '改寫 Git 歷史並強制推送，把含有密碼的 commit 從儲存庫裡完全移除', '先把儲存庫改成私有，再調查是誰在什麼時候提交了那個檔案'],
      answer: 0,
      explanation: '外洩的值要當作已經被拿走，公開儲存庫裡的密碼可能幾分鐘內就被自動掃描找到，所以先讓它失效。新的 commit 只改變最新的版本，舊的 commit 仍然讀得到；改寫歷史與改成私有都收不回已經被 clone、fork 或複製走的副本，它們是之後的清理，不能取代更換密碼。',
    },
    {
      id: 'cicd08-q-history', prompt: '團隊改寫了 Git 歷史，移除所有含有 Token 的 commit，並強制推送到每一個分支。為什麼仍然要輪替這個 Token？',
      options: ['改寫歷史之後，GitHub 要過一段時間才會把舊的 commit 對應的 Token 自動作廢', '強制推送會讓 Actions secret 裡同名的值一起被清空，部署需要一把新的 Token', '只要 Git 歷史裡找不到 Token 就不算外洩；輪替只是為了符合公司的例行規定', '之前 clone、fork 或備份過的人仍保有舊的 commit，值可能早已被複製走'],
      answer: 3,
      explanation: '改寫歷史只改變這個儲存庫，已經存在別處的副本（clone、fork、備份、CI 日誌）都還有那個值，只有讓 Token 失效才能結束外洩。GitHub 不會因為改寫歷史而作廢任何 Token；Actions secret 與 Git 的內容互不相干；「找不到就不算外洩」正是要避免的想法。',
    },
    {
      id: 'cicd08-q-rotate', prompt: 'Registry Token 到了每 90 天一次的例行輪替，希望部署不中斷。哪一個順序正確？',
      options: ['先撤銷舊的 Token，再申請新的，最後把新的值更新到 secret', '申請新的 Token、更新 secret、跑一次部署確認、再撤銷舊的', '把 secret 更新成新的值、撤銷舊的 Token，等下一次有人部署時再看看有沒有問題', '申請新的 Token、撤銷舊的 Token、更新 secret，最後跑一次部署確認'],
      answer: 1,
      explanation: '例行輪替時舊的 Token 沒有外洩，可以先讓新舊並存：換上新的、確認管線真的能用，再撤銷舊的，任何時刻都有一把有效的 Token。先撤銷或在更新 secret 前撤銷，部署會中斷到換上新的為止（那是外洩時才接受的代價）；不確認就撤銷，等到下一次部署才發現新 Token 有問題就太晚了。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd08-case', title: '案件資料：機密與一般設定', machine: 'cicd08-lab',
        description: '讀事故簡報與平台組的 Token 清單，再看 parcel-api 的一般設定（config/app.env、Actions variable）與 secret：secret 只列出名稱與更新時間。',
        steps: [
          { command: 'cat case/brief.txt', output: '事故檢討 INC-2026-031：parcel-api 的 Registry Token 外洩\n發現：11/24 09:20（台北時間）安全組在一份分享出去的舊 CI 日誌裡看到 Registry Token 的明文。\nToken：Registry 使用者 tidewater-deploy，值以 demo-registry-token 開頭。\n處置：平台組已在 09:40 撤銷 tidewater-deploy，並發了只能推送 tidewater/parcel-api 的新 Token（使用者 parcel-ci）。\n新 Token：~/case/parcel-ci.token（只給 Deploy 用，請勿貼到聊天室或指令列）。\n待辦：找出 Token 何時進了儲存庫、檢查 workflow 還有哪些洩漏途徑、讓 Deploy 換上新 Token 並恢復運作。' },
          { command: 'cat case/registry-tokens.txt', output: '# 平台組匯出的 Registry Token 清單（cr.tidewater.example，課程資料）\nUSER              SCOPE                          CREATED           STATUS\ntidewater-deploy  tidewater/* push,pull,delete   2026-08-14 06:05  revoked 2026-11-24 01:40 UTC\nparcel-ci         tidewater/parcel-api push      2026-11-24 01:45  active' },
          { command: 'ls -l case', output: '-rw-r--r-- learner learner   643 brief.txt\n-rw------- learner learner    28 parcel-ci.token\n-rw-r--r-- learner learner   328 registry-tokens.txt' },
          { command: 'cd parcel-api', output: '' },
          { command: 'ls config', output: 'app.env' },
          { command: 'cat config/app.env', output: 'REGION=ap-east\nLOG_LEVEL=info\nAPI_BASE_URL=https://api.tidewater.example\nPICKUP_POINTS_URL=https://pickup.tidewater.example/v1' },
          { command: 'gh variable list', output: 'NAME    VALUE    UPDATED\nREGION  ap-east  about 5 months ago' },
          { command: 'gh variable list -e production', output: 'NAME       VALUE  UPDATED\nLOG_LEVEL  warn   about 3 months ago' },
          { command: 'gh secret list', output: 'NAME            UPDATED\nREGISTRY_TOKEN  about 1 month ago' },
          { command: 'gh secret list -e production', output: 'no secrets found' },
        ],
      },
      {
        id: 'cicd08-deploy', title: '失敗的 Deploy：權限、日誌與被撤銷的 Token', machine: 'cicd08-lab',
        description: '手動執行 Deploy：「Check the token」把 Token 的前 12 個字印進日誌，沒有被遮蔽；登入 Registry 因為 Token 已撤銷而失敗；Set up job 顯示 write-all 帶來的權限。',
        steps: [
          { command: 'cd parcel-api', output: '' },
          { command: 'cat .github/workflows/deploy.yml', output: 'name: Deploy\non: workflow_dispatch\npermissions: write-all\nenv:\n  REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Check the token\n        run: echo "Token starts with $(echo "$REGISTRY_TOKEN" | cut -c 1-12)"\n      - run: echo "$REGISTRY_TOKEN" | docker login cr.tidewater.example -u tidewater-deploy --password-stdin\n      - run: docker build -q -t cr.tidewater.example/tidewater/parcel-api:sha-${{ github.sha }} .\n      - run: docker push cr.tidewater.example/tidewater/parcel-api:sha-${{ github.sha }}' },
          { command: 'gh workflow run deploy.yml', output: '✓ Created workflow_dispatch event for deploy.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="deploy.yml"' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX main Deploy · 4100000001\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\nX deploy in 2s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Check the token\n  X Run echo "$REGISTRY_TOKEN" | docker login cr.tidewater.example -u tidewater-deploy --password-stdin\n  - Run docker build -q -t cr.tidewater.example/tidewater/parcel-api:sha-${{ github.sha }} .\n  - Run docker push cr.tidewater.example/tidewater/parcel-api:sha-${{ github.sha }}\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\ndeploy: .github#4\n\nX Run Deploy (4100000001) completed with \'failure\'' },
          { command: "gh run view 4100000001 --log | grep 'Check the token' | cut -f 3", output: '2026-11-24T02:30:04.0000000Z ##[group]Run echo "Token starts with $(echo "$REGISTRY_TOKEN" | cut -c 1-12)"\n2026-11-24T02:30:04.0000000Z echo "Token starts with $(echo "$REGISTRY_TOKEN" | cut -c 1-12)"\n2026-11-24T02:30:04.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-24T02:30:04.0000000Z env:\n2026-11-24T02:30:04.0000000Z   REGISTRY_TOKEN: ***\n2026-11-24T02:30:04.0000000Z ##[endgroup]\n2026-11-24T02:30:04.0000000Z Token starts with demo-registr' },
          { command: 'gh run view 4100000001 --log-failed | tail -2 | cut -f 3', output: '2026-11-24T02:30:04.0000000Z Error response from daemon: Get "https://cr.tidewater.example/v2/": unauthorized: incorrect username or password\n2026-11-24T02:30:04.0000000Z ##[error]Process completed with exit code 1.' },
          { command: "gh run view 4100000001 --log | grep -A 16 'GITHUB_TOKEN Permissions' | cut -f 3", output: '2026-11-24T02:30:02.0000000Z ##[group]GITHUB_TOKEN Permissions\n2026-11-24T02:30:02.0000000Z Actions: write\n2026-11-24T02:30:02.0000000Z Attestations: write\n2026-11-24T02:30:02.0000000Z Checks: write\n2026-11-24T02:30:02.0000000Z Contents: write\n2026-11-24T02:30:02.0000000Z Deployments: write\n2026-11-24T02:30:02.0000000Z Discussions: write\n2026-11-24T02:30:02.0000000Z IdToken: write\n2026-11-24T02:30:02.0000000Z Issues: write\n2026-11-24T02:30:02.0000000Z Metadata: read\n2026-11-24T02:30:02.0000000Z Packages: write\n2026-11-24T02:30:02.0000000Z Pages: write\n2026-11-24T02:30:02.0000000Z PullRequests: write\n2026-11-24T02:30:02.0000000Z RepositoryProjects: write\n2026-11-24T02:30:02.0000000Z SecurityEvents: write\n2026-11-24T02:30:02.0000000Z Statuses: write\n2026-11-24T02:30:02.0000000Z ##[endgroup]' },
        ],
      },
      {
        id: 'cicd08-mask', title: '遮蔽做得到與做不到的事', machine: 'cicd08-lab',
        description: '在自己的 secret-lab 從檔案設定 LAB_TOKEN，執行 Mask：原樣印出時是 ***，轉成大寫或只取前 8 個字就不會被遮蔽；用 ::add-mask:: 登記衍生出來的值之後，它也被遮蔽。',
        steps: [
          { command: 'cd secret-lab', output: '' },
          { command: 'cat .github/workflows/mask.yml', output: 'name: Mask\non: workflow_dispatch\njobs:\n  show:\n    runs-on: ubuntu-latest\n    env:\n      LAB_TOKEN: ${{ secrets.LAB_TOKEN }}\n    steps:\n      - run: echo "token=$LAB_TOKEN"\n      - run: echo "$LAB_TOKEN" | tr a-z A-Z\n      - run: echo "$LAB_TOKEN" | cut -c 1-8\n      - run: |\n          UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)\n          echo "::add-mask::$UPPER"\n          echo "upper=$UPPER"' },
          { command: 'gh secret set LAB_TOKEN < ~/lab-token.txt', output: '✓ Set Actions secret LAB_TOKEN for wen-hsu/secret-lab' },
          { command: 'gh secret list', output: 'NAME       UPDATED\nLAB_TOKEN  less than a minute ago' },
          { command: 'gh workflow run mask.yml', output: '✓ Created workflow_dispatch event for mask.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow="mask.yml"' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ main Mask · 4100000001\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n✓ show in 1s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run echo "token=$LAB_TOKEN"\n  ✓ Run echo "$LAB_TOKEN" | tr a-z A-Z\n  ✓ Run echo "$LAB_TOKEN" | cut -c 1-8\n  ✓ Run UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)\n  ✓ Complete job\n\n✓ Run Mask (4100000001) completed with \'success\'' },
          { command: "gh run view 4100000001 --log | grep -v -E '##|shell:|env:|  LAB_TOKEN' | grep 'Run ' | cut -f 2,3", output: 'Run echo "token=$LAB_TOKEN"	2026-11-24T02:30:03.0000000Z echo "token=$LAB_TOKEN"\nRun echo "token=$LAB_TOKEN"	2026-11-24T02:30:03.0000000Z token=***\nRun echo "$LAB_TOKEN" | tr a-z A-Z	2026-11-24T02:30:03.0000000Z echo "$LAB_TOKEN" | tr a-z A-Z\nRun echo "$LAB_TOKEN" | tr a-z A-Z	2026-11-24T02:30:03.0000000Z FAKE-LAB-TOKEN-FOR-MASKING-0001\nRun echo "$LAB_TOKEN" | cut -c 1-8	2026-11-24T02:30:03.0000000Z echo "$LAB_TOKEN" | cut -c 1-8\nRun echo "$LAB_TOKEN" | cut -c 1-8	2026-11-24T02:30:03.0000000Z fake-lab\nRun UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)	2026-11-24T02:30:03.0000000Z UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)\nRun UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)	2026-11-24T02:30:03.0000000Z echo "::add-mask::$UPPER"\nRun UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)	2026-11-24T02:30:03.0000000Z echo "upper=$UPPER"\nRun UPPER=$(echo "$LAB_TOKEN" | tr a-z A-Z)	2026-11-24T02:30:03.0000000Z upper=***' },
        ],
      },
      {
        id: 'cicd08-injection', title: '用 Pull Request 的標題執行指令', machine: 'cicd08-lab',
        description: 'secret-lab 的 Greet 把 PR 標題直接寫進 run:。開一個標題含有 $(id -un) 的 Pull Request，runner 真的執行了 id -un，日誌印出 runner。',
        steps: [
          { command: 'cd secret-lab', output: '' },
          { command: 'cat .github/workflows/greet.yml', output: 'name: Greet\non: pull_request\njobs:\n  greet:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "Thanks for: ${{ github.event.pull_request.title }}"' },
          { command: 'git switch -c typo', output: 'Switched to a new branch \'typo\'' },
          { command: "echo 'Nothing here deploys anything, on purpose.' >> README.md", output: '' },
          { command: "git commit -qam 'Clarify the README'", output: '' },
          { command: 'git push -q -u origin typo', output: 'remote: \nremote: Create a pull request for \'typo\' on GitHub by visiting:\nremote:      https://github.example/wen-hsu/secret-lab/pull/new/typo\nremote: \nTo https://github.example/wen-hsu/secret-lab.git\n * [new branch]      typo -> typo\nbranch \'typo\' set up to track \'origin/typo\'.' },
          { command: "gh pr create --title 'Clarify the README $(id -un)' --body 'A harmless test of the title.'", output: '\nCreating pull request for typo into main in wen-hsu/secret-lab\n\nhttps://github.example/wen-hsu/secret-lab/pull/1' },
          { command: 'gh run watch 4100000001', output: 'Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\n✓ typo Greet #1 · 4100000001\nTriggered via pull_request less than a minute ago\n\nJOBS\n✓ greet in 1s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run echo "Thanks for: ${{ github.event.pull_request.title }}"\n  ✓ Complete job\n\n✓ Run Greet (4100000001) completed with \'success\'' },
          { command: "gh run view 4100000001 --log | grep 'Run echo' | cut -f 3", output: '2026-11-24T02:30:03.0000000Z ##[group]Run echo "Thanks for: Clarify the README $(id -un)"\n2026-11-24T02:30:03.0000000Z echo "Thanks for: Clarify the README $(id -un)"\n2026-11-24T02:30:03.0000000Z shell: /usr/bin/bash -e {0}\n2026-11-24T02:30:03.0000000Z ##[endgroup]\n2026-11-24T02:30:03.0000000Z Thanks for: Clarify the README runner' },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd08-ex-origin', title: '找出 Token 進入儲存庫的 commit', machine: 'cicd08-lab',
        statement: '事故檢討要寫出 Token 從什麼時候開始暴露。parcel-api 目前的檔案裡已經沒有它，但 Git 的歷史還在：在 ~/parcel-api 找出 Token（值以 demo-registry-token 開頭）曾經寫在哪個檔案，以及把它加進儲存庫的是哪一個 commit。最後用一個 `git log` 指令只印出那一個 commit，格式是 `--oneline` 的一行。',
        checks: [{ kind: 'output', fromCommand: '^git log ' }],
        solution: ['cd parcel-api', "git log -p | grep -E '^diff|demo-registry'", 'git log --oneline -- config/deploy.env', FIRST_OF_FILE],
        mistakes: [
          { commands: ['cd parcel-api', 'git log --oneline -1 -- config/deploy.env'], why: '印出的是最後一個改動 config/deploy.env 的 commit，也就是 9 月把檔案刪掉的那一個；Token 是在更早的 commit 加進來的' },
          { commands: ['cd parcel-api', 'git log --oneline --reverse | head -1'], why: '這是整個儲存庫的第一個 commit，當時還沒有 config/deploy.env，也沒有 Token' },
          { commands: ['cd parcel-api', 'git log --oneline -1 -- config/app.env'], why: 'config/app.env 是一般設定（區域、日誌等級、網址），Token 從來不在這個檔案裡' },
          { commands: ['cd parcel-api', "echo '8c42d64 Add the deploy workflow'"], why: '直接打出答案：要用 git log 從歷史裡查出來，換一份歷史（另一個 commit）也要查得對' },
        ],
        variants: [{ label: '加入 Token 的 commit 不同', files: [], git: GIT(true) }],
        hints: [
          '`ls config` 已經看不到它，但 `git log -p` 會印出每個 commit 的變更；`git log -p | grep -E \'^diff|demo-registry\'` 只留下檔名與含有 Token 的行',
          '`git log --oneline -- 檔案` 列出改動過那個檔案的 commit（新的在前），包括把它刪掉的 commit',
          '`--reverse` 讓舊的在前，`| head -1` 只留第一行',
        ],
        explanation: 'Token 寫在 config/deploy.env，這個檔案在加入時就含有 Token，9 月的「Move the registry token to an Actions secret」把它刪掉，但刪除只是新增一個 commit，舊的 commit 仍然完整保存著檔案的內容，任何 clone 過儲存庫的人都拿得到。所以暴露期是從加入的那個 commit（8 月）到平台組撤銷 Token 的今天，而不是到 9 月刪檔為止；同一個值後來又被原封不動放進 Actions secret，也就是從來沒有輪替過。真實的 Git 可以用 `git log -S demo-registry-token --oneline` 直接找出「這段文字出現次數改變」的 commit（加入與刪除都會列出），模擬環境沒有 `-S`，用 `-p` 加 grep 達到同樣的目的。',
      },
      {
        id: 'cicd08-ex-injection', title: '讓 PR 標題不能執行指令', machine: 'cicd08-lab',
        statement: `pr-title.yml 把 \`\${{ github.event.pull_request.title }}\` 直接寫進 \`run:\`，標題裡的 \`$(…)\` 會在 runner 上執行。在 ~/parcel-api 修改 main 上的 pr-title.yml：在 step 的 \`env:\` 把標題放進環境變數 PR_TITLE，指令稿改成 \`echo "PR title: $PR_TITLE"\`（變數加雙引號）；提交並推送到 main。接著驗證：從 main 建立分支 title-test，做一個小改動並推送，開一個標題正好是 \`${TEST_TITLE}\` 的 Pull Request，等 PR title 的 run 跑完並且成功，標題只被印出、沒有被執行。`,
        checks: [
          { kind: 'branch', repo: PARCEL, name: 'main', file: { path: '.github/workflows/pr-title.yml', includes: '$PR_TITLE"' } },
          { kind: 'run', repo: PARCEL, workflow: 'pr-title.yml', event: 'pull_request', conclusion: 'success', logIncludes: '$(echo INJECTED)' },
          { kind: 'run', repo: PARCEL, workflow: 'pr-title.yml', event: 'pull_request', logExcludes: 'lookup INJECTED' },
        ],
        solution: ['cd parcel-api', ...FIX_MAIN(), 'cat .github/workflows/pr-title.yml', ...TEST_PR(), 'gh run watch 4100000001', "gh run view 4100000001 --log | grep 'PR title:' | cut -f 3"],
        mistakes: [
          { commands: ['cd parcel-api', ...FIX_MAIN(PR_TITLE_ENV_EXPR), ...TEST_PR(), 'gh run watch 4100000001'], why: '`${{ env.PR_TITLE }}` 仍是運算式：它在 Bash 解析之前就被代換成標題的文字，`$(echo INJECTED)` 照樣執行' },
          { commands: ['cd parcel-api', 'git switch -c title-test', WRITE_TITLE(PR_TITLE_FIXED), "git commit -qam 'Pass the PR title through an environment variable'", "echo 'Parcels can be looked up by phone number.' >> README.md",
            "git commit -qam 'Document the phone lookup'", 'git push -q -u origin title-test', `gh pr create --title '${TEST_TITLE}' --body 'The title must be printed, not run.'`, 'gh run watch 4100000001'],
          why: '只在 PR 的分支修好：這個 PR 的 run 看起來安全，但 main 上的 pr-title.yml 還是舊的，之後從 main 開出的每一個 PR 仍然可以注入' },
          { commands: ['cd parcel-api', ...FIX_MAIN(PR_TITLE_SINGLE), ...TEST_PR(), 'gh run watch 4100000001'], why: '改用單引號包住 `${{ }}`：這個標題剛好沒事，但標題裡只要有一個 `\'`，就能結束引號再接上自己的指令；代換之後的文字由攻擊者決定，引號擋不住' },
          { commands: ['cd parcel-api', ...FIX_MAIN(), ...TEST_PR('docs: phone lookup'), 'gh run watch 4100000001'], why: '用普通的標題測試：run 會成功，卻沒有證明含有 `$(…)` 的標題不會被執行' },
          { commands: ['cd parcel-api', ...FIX_MAIN(), ...TEST_PR()], why: '開了 Pull Request 就停下：run 還在執行，還不知道結果' },
        ],
        hints: [
          '用 `cat > .github/workflows/pr-title.yml <<\'EOF\'` 重寫整個檔案；step 寫成 `- env:`（縮排 6 格）、`PR_TITLE: ${{ github.event.pull_request.title }}`（縮排 10 格）、`run: echo "PR title: $PR_TITLE"`（縮排 8 格）',
          '在你的 Shell 裡，標題要用單引號包住：`gh pr create --title \'docs: phone lookup $(echo INJECTED)\' --body \'…\'`，否則 `$(…)` 會先在你的筆電上執行',
          'pr-title.yml 只在 pull_request 時執行，推送 main 不會有 run；PR 開好之後，`gh run list` 找到 run 的 ID，再 `gh run watch ID`',
        ],
        explanation: '`${{ }}` 是在 runner 把指令稿交給 Bash 之前，以文字代換進去的，所以標題的內容變成了指令稿的一部分。放進 `env:` 之後，指令稿裡只有 `$PR_TITLE` 這個變數名稱，Bash 展開變數的值時不會再把它當成指令解析，`$(echo INJECTED)` 就只是一段文字；加上雙引號則避免值被拆成多個字或被當成萬用字元。修正要進到 main，因為之後的 PR 都以 main 上的 workflow 為基礎。順手加上的 `permissions: {}` 讓這個只需要讀標題的 job 拿不到任何 GITHUB_TOKEN 權限。',
      },
      {
        id: 'cicd08-ex-rotate', title: '換上新的 Token，並只給它需要的權限', machine: 'cicd08-lab',
        statement: '平台組已經撤銷舊的 Token，新的 parcel-ci Token 在 ~/case/parcel-ci.token。在 ~/parcel-api 完成輪替：（1）從檔案把新 Token 設成 production environment 的 secret REGISTRY_TOKEN（不要把值寫在指令列上），並刪除儲存庫層級那個舊的 REGISTRY_TOKEN；（2）重寫 deploy.yml：GITHUB_TOKEN 只有 `contents: read`，job deploy 使用 environment production，只有登入 Registry 的那個 step 從 `env:` 拿到 secret，以使用者 parcel-ci 登入，拿掉印出 Token 開頭的 step，建置與推送的兩個 step 不變；（3）提交、推送，手動執行 Deploy，等它成功。日誌裡不能出現新 Token 的任何片段，Registry 上要有這個 commit 的 Image。',
        checks: [
          { kind: 'secret', repo: PARCEL, name: 'REGISTRY_TOKEN', env: 'production' },
          { kind: 'secret', repo: PARCEL, name: 'REGISTRY_TOKEN', absent: true },
          { kind: 'workflow', repo: PARCEL, path: '.github/workflows/deploy.yml', job: 'deploy', permissions: { contents: 'read' } },
          { kind: 'run', repo: PARCEL, workflow: 'deploy.yml', ref: 'main', tip: true, conclusion: 'success', logExcludes: NEW_TOKEN.slice(0, 12) },
          { kind: 'registry', registry: REGISTRY, repository: 'tidewater/parcel-api', tag: 'sha-', commit: { repo: PARCEL } },
        ],
        solution: ['cd parcel-api', ...ROTATE, 'gh secret list -e production', ...WRITE_DEPLOY(), 'git diff --stat', ...SHIP],
        mistakes: [
          { commands: ['cd parcel-api', ...WRITE_DEPLOY(), ...SHIP], why: '只改了 workflow，沒有把新 Token 放進 production：environment 裡沒有 REGISTRY_TOKEN，值是空字串，登入失敗' },
          { commands: ['cd parcel-api', 'gh secret set REGISTRY_TOKEN < ~/case/parcel-ci.token', ...WRITE_DEPLOY(), ...SHIP], why: '設在儲存庫層級：Deploy 會成功，但這個儲存庫的每一個 workflow 與 job 都拿得到它，不只 production 的部署' },
          { commands: ['cd parcel-api', 'gh variable set REGISTRY_TOKEN -e production < ~/case/parcel-ci.token', 'gh secret delete REGISTRY_TOKEN', ...WRITE_DEPLOY(DEPLOY_HEAD({ source: 'vars' })), ...SHIP],
            why: '放進 variable：variable 不會被遮蔽，日誌的 `env:` 直接印出整個 Token，`gh variable list` 也看得到' },
          { commands: ['cd parcel-api', ...ROTATE, ...WRITE_DEPLOY(DEPLOY_HEAD({ check: true })), ...SHIP], why: '留著「Check the token」：`cut` 切出來的前 12 個字不等於 secret 的值，不會被遮蔽，新 Token 的開頭又進了日誌' },
          { commands: ['cd parcel-api', ...ROTATE, ...WRITE_DEPLOY(DEPLOY_HEAD({ perms: ['permissions: write-all'] })), ...SHIP], why: '保留 `permissions: write-all`：部署只需要讀程式碼，GITHUB_TOKEN 卻能改程式碼、發布、改 Actions 的設定' },
          { commands: ['cd parcel-api', ...ROTATE, ...WRITE_DEPLOY(DEPLOY_HEAD({ env: false })), ...SHIP], why: 'job 沒有寫 `environment: production`：environment 的 secret 只給宣告了那個 environment 的 job，Token 是空字串，登入失敗' },
          { commands: ['cd parcel-api', ...ROTATE, ...WRITE_DEPLOY(), ...SHIP.slice(0, 3)], why: '觸發了 Deploy 就停下：run 還在執行，還沒有驗證新的 Token 真的能用' },
        ],
        hints: [
          '`gh secret set 名稱 -e production < 檔案` 從標準輸入讀值；`gh secret delete REGISTRY_TOKEN`（不加 `-e`）刪的是儲存庫層級的那一個',
          'deploy.yml 超過一行 500 字，分兩段寫：第一段用 `cat > … <<\'EOF\'` 寫到登入的 step，第二段用 `cat >> … <<\'EOF\'` 接上 build 與 push 兩行（可以先 `grep docker .github/workflows/deploy.yml` 看原本的寫法）',
          '登入的 step：`name: Log in to the registry`、`env:` 底下 `REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}`、`run: echo "$REGISTRY_TOKEN" | docker login cr.tidewater.example -u parcel-ci --password-stdin`',
        ],
        explanation: '輪替的順序是：拿到新的 Token、更新 secret、讓管線用新的 Token 跑一次確認、再撤銷舊的；這次因為舊的已經外洩，平台組先撤銷，所以部署中斷到換上新的為止。新 Token 從檔案經由標準輸入交給 `gh secret set`，不會留在 Shell 的歷史裡；放在 production environment，只有宣告了 `environment: production` 的 job 拿得到；在 job 裡也只交給需要它的那個 step。`docker login --password-stdin` 同樣從標準輸入讀，不會出現在指令列與行程清單上。最後，GITHUB_TOKEN 收斂到 `contents: read`，Registry 的 Token 也只能推送 parcel-api：任何一個再外洩，能造成的損害都比原來小得多。',
      },
    ],
  },
};
