/*
 * CICD06 建置管線與產出物 (the blueprint's pipeline-sim, terminal-sim on the artifacts profile: engine stages E25 git, E26
 * forge, E27 workflows, E28 actions and E29 artifacts). A made-up restaurant chain, Lanternfish Kitchen, on the simulated
 * github.example: Chen Wei (the learner, gh login wei-chen) and Priya Nair, who wrote the workflows. lanternfish/order-web
 * (the ordering site, version 2.3.0, the learner is admin) has a one-job CI without a cache (checkout, npm ci, build, test)
 * and Targets (workflow_dispatch; a matrix of two browser targets that both upload an artifact named web-dist, so the
 * second upload gets the v4 409 conflict). lanternfish/menu-api (version 1.8.0, write) is the reference pipeline: CI caches
 * ~/.npm keyed on hashFiles('package-lock.json'), uploads api-dist, and an image job downloads it, builds the image, logs in
 * to the team registry cr.lanternfish.example with the REGISTRY_TOKEN secret through --password-stdin and pushes
 * sha-<commit>; Release runs on v* tags, checks the tag against package.json and promotes the commit's image by re-tagging
 * it with the version (the same digest). The registry has ci-bot (push, its token is the repositories' secret) and the
 * learner's pull-only account (token in ~/.registry-token). CI tools (lesson-declared results): npm ci (32 s, 6 s with
 * ~/.npm restored; refuses a package.json out of sync with the lockfile), the builds, the unit tests and the smoke test of
 * dist/. Three exercises: a cache that hits on the second run, a smoke job that tests the build artifact, and an image
 * workflow that pushes sha-<commit> with the secret. Tokens are obviously fake; every transcript output was produced by
 * replaying it on the engine. Simplification stated in the text: the simulated Dockerfile does not accept FROM with a
 * digest, so the base images are pinned by full version tags.
 */

import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const ORDER = 'https://github.example/lanternfish/order-web.git';
const MENU = 'https://github.example/lanternfish/menu-api.git';
const WEI = { name: 'Chen Wei', email: 'wei@lanternfish.example' }, PRIYA = { name: 'Priya Nair', email: 'priya@lanternfish.example' };
const REG = 'cr.lanternfish.example';
const CI_TOKEN = 'lesson-registry-token-ci-0042';
const WEI_TOKEN = 'lesson-registry-token-wei-0007';
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/**
 * Commands writing this text to the file with quoted here-documents: the first replaces the file (>), the others append
 * (>>). The lesson terminal takes one input of at most 500 characters, so a long file is written in pieces of whole lines.
 */
function heredoc(path: string, text: string): string[] {
  const out: string[] = [];
  let piece = '';
  const flush = () => { if (piece) out.push(`cat ${out.length ? '>>' : '>'} ${path} <<'EOF'\n${piece}EOF`); piece = ''; };
  for (const line of text.split('\n').slice(0, -1)) { if (piece.length + line.length + 1 > 440) flush(); piece += `${line}\n`; }
  flush();
  return out;
}

const ORDER_PKG = '{\n  "name": "order-web",\n  "version": "2.3.0",\n  "private": true,\n  "scripts": {\n    "build": "node scripts/build.js",\n    "test": "node --test test/",\n    "test:smoke": "node scripts/smoke.js"\n  },\n'
  + '  "dependencies": {\n    "preact": "^10.24.3"\n  },\n  "devDependencies": {\n    "esbuild": "^0.24.0"\n  }\n}\n';
const ORDER_LOCK = '{\n  "name": "order-web",\n  "version": "2.3.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "node_modules/preact": { "version": "10.24.3" },\n    "node_modules/esbuild": { "version": "0.24.0", "dev": true }\n  }\n}\n';
const MENU_PKG = '{\n  "name": "menu-api",\n  "version": "1.8.0",\n  "private": true,\n  "scripts": {\n    "build": "node scripts/build.js",\n    "test": "node --test test/"\n  }\n}\n';
const MENU_LOCK = '{\n  "name": "menu-api",\n  "version": "1.8.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "node_modules/fastify": { "version": "5.1.0" },\n    "node_modules/esbuild": { "version": "0.24.0", "dev": true }\n  }\n}\n';
const ORDER_DOCKERFILE = 'FROM nginx:1.27.3-alpine\nCOPY dist/ /usr/share/nginx/html/\n';
const MENU_DOCKERFILE = 'FROM node:22.11.0-slim\nWORKDIR /app\nCOPY dist/ ./dist/\nCMD ["node", "dist/server.js"]\n';

const ORDER_CI = wf('name: CI', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm run build', '      - run: npm test');
const MENU_CI = wf('name: CI', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - uses: actions/cache@v4', '        with:', '          path: ~/.npm', "          key: npm-${{ hashFiles('package-lock.json') }}", '          restore-keys: npm-',
  '      - run: npm ci', '      - run: npm run build', '      - run: npm test', '      - uses: actions/upload-artifact@v4', '        with:', '          name: api-dist', '          path: dist/', '          retention-days: 14',
  '  image:', '    needs: build', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - uses: actions/download-artifact@v4', '        with:', '          name: api-dist', '          path: dist',
  `      - run: docker build -q -t ${REG}/lanternfish/menu-api:sha-\${{ github.sha }} .`, '      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`, `      - run: docker push ${REG}/lanternfish/menu-api:sha-\${{ github.sha }}`);
const MENU_RELEASE = wf('name: Release', 'on:', '  push:', "    tags: ['v*']", 'permissions:', '  contents: read', 'jobs:', '  promote:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - name: Check the version', '        run: |', '          VERSION="${GITHUB_REF_NAME#v}"', '          grep -q "\\"version\\": \\"$VERSION\\"" package.json || { echo "::error::tag $GITHUB_REF_NAME does not match the version in package.json"; exit 1; }',
  '          echo "VERSION=$VERSION" >> "$GITHUB_ENV"', '      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`, '      - name: Promote the commit image', '        run: |', `          docker pull -q ${REG}/lanternfish/menu-api:sha-$GITHUB_SHA`,
  `          docker tag ${REG}/lanternfish/menu-api:sha-$GITHUB_SHA ${REG}/lanternfish/menu-api:$VERSION`, `          docker push ${REG}/lanternfish/menu-api:$VERSION`);

const TARGETS_YML = wf('name: Targets', 'on: workflow_dispatch', 'permissions:', '  contents: read', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    strategy:', '      matrix:',
  '        target: [modern, legacy]', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm run build -- --target=${{ matrix.target }}',
  '      - uses: actions/upload-artifact@v4', '        with:', '          name: web-dist', '          path: dist/');

const COMMITS: TerminalGitCommit[] = [
  { id: 'o1', message: 'Initial commit', author: PRIYA, time: '2026-11-16 02:00:00', files: {
    'README.md': '# order-web\n\nThe ordering site of Lanternfish Kitchen.\n', 'package.json': ORDER_PKG, 'package-lock.json': ORDER_LOCK, '.gitignore': 'node_modules/\ndist/\n',
    'src/cart.js': 'export const total = (items) => items.reduce((sum, i) => sum + i.price * i.qty, 0);\n', 'test/cart.test.js': "test('adds up the cart')\n",
    'scripts/build.js': "// bundles src/ into dist/\n", 'scripts/smoke.js': "// opens dist/index.html and checks the order form is there\n", Dockerfile: ORDER_DOCKERFILE,
  } },
  { id: 'o2', message: 'Build and test on every push to main', author: PRIYA, time: '2026-11-18 03:00:00', files: { '.github/workflows/ci.yml': ORDER_CI } },
  { id: 'o3', message: 'Try separate builds for modern and legacy browsers', author: PRIYA, time: '2026-11-21 06:00:00', files: { '.github/workflows/targets.yml': TARGETS_YML } },
  { id: 'm1', parents: [], message: 'Initial commit', author: PRIYA, time: '2026-11-10 02:00:00', files: {
    'README.md': '# menu-api\n\nThe menu service of Lanternfish Kitchen.\n', 'package.json': MENU_PKG, 'package-lock.json': MENU_LOCK, '.gitignore': 'node_modules/\ndist/\n',
    'src/server.js': '// serves GET /menu\n', 'test/menu.test.js': "test('lists today\\'s dishes')\n", 'scripts/build.js': '// bundles src/ into dist/\n', Dockerfile: MENU_DOCKERFILE,
  } },
  { id: 'm2', message: 'Cache, artifact, image and release workflows', author: PRIYA, time: '2026-11-19 03:00:00', files: { '.github/workflows/ci.yml': MENU_CI, '.github/workflows/release.yml': MENU_RELEASE } },
];

const ORDER_INDEX = '<!doctype html>\n<title>Lanternfish Kitchen</title>\n<form id="order"></form>\n<script src="app.js"></script>\n';
const ORDER_APP = 'const total=t=>t.reduce((s,i)=>s+i.price*i.qty,0);export{total};\n';
const ORDER_APP_LEGACY = 'var total=function(t){return t.reduce(function(s,i){return s+i.price*i.qty},0)};\n';
const NO_MODULES = { path: 'node_modules/.package-lock.json', absent: true } as const;
/** npm prints the script it runs; without node_modules (no npm ci yet) the build tool is missing. */
const missing = (pkg: string, script: string) => ({ when: [NO_MODULES], exit: 1, seconds: 1, stderr: `> ${pkg} ${script}\n\nError: Cannot find module 'esbuild'\nRequire stack:\n- scripts/build.js` });
const INSTALL = (secs: number) => `added 214 packages, and audited 215 packages in ${secs}s\n\nfound 0 vulnerabilities`;
const MODULES = [{ path: 'node_modules/.package-lock.json', content: '{ "lockfileVersion": 3 }\n' }];
const TOOLS: TerminalCiTool[] = [
  // npm ci keeps its download cache in ~/.npm: with it (a restored cache) the install takes 6 s instead of 32 s.
  { command: 'npm ci', cache: '~/.npm', cases: [
    { when: [{ path: 'package.json', includes: 'dayjs' }, { path: 'package-lock.json', excludes: 'dayjs' }], exit: 1, seconds: 1,
      stderr: 'npm error code EUSAGE\nnpm error\nnpm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.\nnpm error\nnpm error Missing: dayjs@1.11.13 from lock file' },
    { when: [{ path: 'package-lock.json' }, { path: '~/.npm' }], stdout: INSTALL(5), seconds: 6, cachedSeconds: 6, writes: MODULES },
    { when: [{ path: 'package-lock.json' }], stdout: INSTALL(31), seconds: 32, writes: MODULES },
    { stderr: 'npm error code EUSAGE\nnpm error\nnpm error The `npm ci` command can only install with an existing package-lock.json or\nnpm error npm-shrinkwrap.json with lockfileVersion >= 1.', exit: 1, seconds: 1 },
  ] },
  { command: 'npm run build', cases: [
    { ...missing('order-web@2.3.0', 'build\n> node scripts/build.js'), when: [NO_MODULES, { path: 'src/cart.js' }] },
    { ...missing('menu-api@1.8.0', 'build\n> node scripts/build.js'), when: [NO_MODULES, { path: 'src/server.js' }] },
    { when: [{ path: 'src/cart.js' }], stdout: '> order-web@2.3.0 build\n> node scripts/build.js\n\ndist/index.html   0.2 kB\ndist/app.js       0.1 kB\nbuilt 2 files in 8.6s', seconds: 9,
      writes: [{ path: 'dist/index.html', content: ORDER_INDEX }, { path: 'dist/app.js', content: ORDER_APP }] },
    { when: [{ path: 'src/server.js' }], stdout: '> menu-api@1.8.0 build\n> node scripts/build.js\n\ndist/server.js   3.1 kB\nbuilt 1 file in 4.2s', seconds: 5,
      writes: [{ path: 'dist/server.js', content: 'import{createServer}from"node:http";createServer((q,r)=>r.end("[]")).listen(3000);\n' }] },
  ] },
  ...(['modern', 'legacy'] as const).map((t): TerminalCiTool => ({ command: `npm run build -- --target=${t}`, cases: [
    missing('order-web@2.3.0', `build\n> node scripts/build.js --target=${t}`),
    { stdout: `> order-web@2.3.0 build\n> node scripts/build.js --target=${t}\n\ndist/index.html   0.2 kB\ndist/app.js       ${t === 'modern' ? '0.1' : '0.4'} kB\nbuilt 2 files for ${t} browsers in ${t === 'modern' ? '8.6' : '11.2'}s`,
      seconds: t === 'modern' ? 9 : 12, writes: [{ path: 'dist/index.html', content: ORDER_INDEX }, { path: 'dist/app.js', content: t === 'modern' ? ORDER_APP : ORDER_APP_LEGACY }] },
  ] })),
  { command: 'npm test', cases: [
    { ...missing('order-web@2.3.0', 'test\n> node --test test/'), when: [NO_MODULES, { path: 'src/cart.js' }] },
    { ...missing('menu-api@1.8.0', 'test\n> node --test test/'), when: [NO_MODULES, { path: 'src/server.js' }] },
    { when: [{ path: 'src/cart.js' }], stdout: '> order-web@2.3.0 test\n> node --test test/\n\n✔ adds up the cart (2.1ms)\n✔ applies the lunch discount (0.9ms)\nℹ tests 14\nℹ pass 14\nℹ fail 0', seconds: 7 },
    { stdout: '> menu-api@1.8.0 test\n> node --test test/\n\n✔ lists today\'s dishes (3.4ms)\nℹ tests 9\nℹ pass 9\nℹ fail 0', seconds: 6 },
  ] },
  // The smoke test only needs the built site (scripts/smoke.js uses Node.js built-ins), so it runs without npm ci.
  { command: 'npm run test:smoke', cases: [
    { when: [{ path: 'dist/index.html' }], stdout: '> order-web@2.3.0 test:smoke\n> node scripts/smoke.js\n\nsmoke: dist/index.html has the order form\nsmoke: dist/app.js loads (0.1 kB)\nsmoke: 2 checks passed', seconds: 4 },
    { stderr: '> order-web@2.3.0 test:smoke\n> node scripts/smoke.js\n\nsmoke: dist/index.html not found (build the site or download the build first)', exit: 1, seconds: 1 },
  ] },
];

const IMAGES: TerminalImage[] = [
  { name: 'nginx:1.27.3-alpine', size: 48_400_000, created: '2026-11-12 04:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NGINX_VERSION=1.27.3'], stopSignal: 'SIGQUIT' },
  { name: 'node:22.11.0-slim', size: 201_300_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.11.0'] },
];

const lab: TerminalMachine = {
  id: 'cicd06-lab', title: 'wei-laptop（Lanternfish Kitchen 的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'wei-laptop', profile: 'artifacts',
  timezone: 'Asia/Taipei', now: '2026-11-24 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner'), { path: '/home/learner/.registry-token', kind: 'file', mode: 0o600, owner: 'learner', content: `${WEI_TOKEN}\n` }],
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  git: {
    user: WEI, commits: COMMITS,
    remotes: [{ url: ORDER, branches: { main: 'o3' } }, { url: MENU, branches: { main: 'm2' } }],
    repos: [{ path: '/home/learner/order-web', origin: ORDER }, { path: '/home/learner/menu-api', origin: MENU }],
  },
  forge: { login: 'wei-chen', repos: [
    { url: ORDER, description: 'The ordering site of Lanternfish Kitchen', permission: 'admin', secrets: [{ name: 'REGISTRY_TOKEN', value: CI_TOKEN, updated: '2026-11-17 01:00:00' }] },
    { url: MENU, description: 'The menu service of Lanternfish Kitchen', permission: 'write', secrets: [{ name: 'REGISTRY_TOKEN', value: CI_TOKEN, updated: '2026-11-17 01:00:00' }] },
  ] },
  actions: { tools: TOOLS },
  docker: {
    images: IMAGES,
    registries: [{ host: REG, users: [{ name: 'ci-bot', token: CI_TOKEN, repos: ['lanternfish/*'] }, { name: 'wei-chen', token: WEI_TOKEN, push: false, repos: ['lanternfish/*'] }] }],
  },
};

// ---- Exercises (each starts from the lab as declared).
const CI_PATH = '.github/workflows/ci.yml', IMAGE_PATH = '.github/workflows/image.yml';
const LATEST = (file: string) => `$(gh run list -w ${file} -L 1 --json databaseId | grep databaseId | tr -dc 0-9)`;
const WATCH = (file: string) => `gh run watch ${LATEST(file)}`;
const CI_HEAD = ['name: CI', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4'];
const cacheStep = (key: string, restore = true) => ['      - uses: actions/cache@v4', '        with:', '          path: ~/.npm', `          key: ${key}`, ...restore ? ['          restore-keys: npm-'] : []];
const HASH_KEY = "npm-${{ hashFiles('package-lock.json') }}";
const BUILD_STEPS = ['      - run: npm ci', '      - run: npm run build', '      - run: npm test'];
const CACHED_CI = wf(...CI_HEAD, ...cacheStep(HASH_KEY), ...BUILD_STEPS);
const CACHE_PUSH = ["git commit -qam 'Cache the npm downloads'", 'git push -q'];
const AGAIN = ["git commit -q --allow-empty -m 'Run CI again with the cache'", 'git push -q'];

const upload = (name: string, path: string) => ['      - uses: actions/upload-artifact@v4', '        with:', `          name: ${name}`, `          path: ${path}`];
const SMOKE_HEAD = (needs = true) => ['  smoke:', ...needs ? ['    needs: build'] : [], '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4'];
const download = (path?: string) => ['      - uses: actions/download-artifact@v4', '        with:', '          name: web-dist', ...path ? [`          path: ${path}`] : []];
const SMOKE = '      - run: npm run test:smoke';
const SPLIT_CI = wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'dist/'), ...SMOKE_HEAD(), ...download('dist'), SMOKE);
const SPLIT_PUSH = ["git commit -qam 'Smoke-test the build artifact in its own job'", 'git push -q'];

const IMAGE_NAME = `${REG}/lanternfish/order-web`;
const IMAGE_HEAD = ['name: Image', 'on:', '  push:', '    branches: [main]', 'permissions:', '  contents: read', 'jobs:', '  image:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: npm ci', '      - run: npm run build'];
const login = (secret = 'REGISTRY_TOKEN', how = '--password-stdin') => ['      - name: Log in to the registry', '        env:', `          REGISTRY_TOKEN: \${{ secrets.${secret} }}`,
  how === '--password-stdin' ? `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin` : `        run: docker login ${REG} -u ci-bot -p "$REGISTRY_TOKEN"`];
const imageYml = (tag: string, opts: { secret?: string; how?: string; build?: boolean } = {}) => wf(...(opts.build === false ? IMAGE_HEAD.slice(0, -1) : IMAGE_HEAD),
  `      - run: docker build -t ${IMAGE_NAME}:${tag} .`, ...login(opts.secret, opts.how), `      - run: docker push ${IMAGE_NAME}:${tag}`);
const IMAGE_YML = imageYml('sha-${{ github.sha }}');
const IMAGE_PUSH = ['git add .github', "git commit -qm 'Build and push the image for every commit'", 'git push -q'];

// ---- Examples (every output is produced by replaying the commands on the lab).
const MENU_IMAGE = `${REG}/lanternfish/menu-api`;
const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd06-repro', title: 'lockfile、npm ci 與不一致時的拒絕', machine: 'cicd06-lab',
    description: '在 order-web 看 package.json 的版本範圍與 package-lock.json 鎖定的版本，沒有安裝就建置失敗，npm ci 之後才建得起來；再模擬有人只改了 package.json，npm ci 拒絕安裝。',
    steps: [
      { command: 'cd order-web', output: "" },
      { command: 'grep -A 5 dependencies package.json', output: "  \"dependencies\": {\n    \"preact\": \"^10.24.3\"\n  },\n  \"devDependencies\": {\n    \"esbuild\": \"^0.24.0\"\n  }" },
      { command: 'grep node_modules/ package-lock.json', output: "    \"node_modules/preact\": { \"version\": \"10.24.3\" },\n    \"node_modules/esbuild\": { \"version\": \"0.24.0\", \"dev\": true }" },
      { command: 'npm run build', output: "> order-web@2.3.0 build\n> node scripts/build.js\n\nError: Cannot find module 'esbuild'\nRequire stack:\n- scripts/build.js" },
      { command: 'npm ci', output: "added 214 packages, and audited 215 packages in 31s\n\nfound 0 vulnerabilities" },
      { command: 'npm run build', output: "> order-web@2.3.0 build\n> node scripts/build.js\n\ndist/index.html   0.2 kB\ndist/app.js       0.1 kB\nbuilt 2 files in 8.6s" },
      { command: `sed -i 's/"preact": "^10.24.3"/"dayjs": "^1.11.13",\\n    "preact": "^10.24.3"/' package.json`, output: "" },
      { command: 'git diff --stat', output: " package.json | 1 +\n 1 file changed, 1 insertion(+)" },
      { command: 'npm ci', output: "npm error code EUSAGE\nnpm error\nnpm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.\nnpm error\nnpm error Missing: dayjs@1.11.13 from lock file" },
      { command: 'git restore package.json', output: "" },
    ],
  },
  {
    id: 'cicd06-artifact', title: '上傳、下載與在本機取回產出物', machine: 'cicd06-lab',
    description: '推送 menu-api，看 build 與 image 兩個 job 和 ARTIFACTS；用 gh run download 把 api-dist 取回本機，和自己在筆電上建置的結果比較，最後看資料夾裡已有同名檔案時 gh run download 的錯誤。',
    steps: [
      { command: 'cd menu-api', output: "" },
      { command: "git commit -q --allow-empty -m 'Build menu-api'", output: "" },
      { command: 'git push -q', output: "To https://github.example/lanternfish/menu-api.git\n   2c581d1..52c3e98  main -> main" },
      { command: 'sleep 120', output: "" },
      { command: 'gh run view 4100000001', output: "✓ main CI · 4100000001\nTriggered via push about 2 minutes ago\n\nJOBS\n✓ build in 48s (ID 11300000001)\n✓ image in 3s (ID 11300000002)\n\nARTIFACTS\napi-dist\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/lanternfish/menu-api/actions/runs/4100000001" },
      { command: 'gh run download 4100000001 -n api-dist -D ~/from-ci', output: "" },
      { command: 'ls ~/from-ci', output: "server.js" },
      { command: 'npm ci', output: "added 214 packages, and audited 215 packages in 31s\n\nfound 0 vulnerabilities" },
      { command: 'npm run build', output: "> menu-api@1.8.0 build\n> node scripts/build.js\n\ndist/server.js   3.1 kB\nbuilt 1 file in 4.2s" },
      { command: 'cat dist/server.js ~/from-ci/server.js', output: "import{createServer}from\"node:http\";createServer((q,r)=>r.end(\"[]\")).listen(3000);\nimport{createServer}from\"node:http\";createServer((q,r)=>r.end(\"[]\")).listen(3000);" },
      { command: 'gh run download 4100000001 -n api-dist -D ~/from-ci', output: "error downloading api-dist: error extracting zip archive: open /home/learner/from-ci/server.js: file exists" },
    ],
  },
  {
    id: 'cicd06-conflict', title: 'matrix 裡同名的 artifact', machine: 'cicd06-lab',
    description: '手動觸發 order-web 的 Targets（modern 與 legacy 兩個 matrix job 都上傳 web-dist），看第二個上傳失敗；把名稱加上 matrix 的值之後再跑一次，兩份都留下來。',
    steps: [
      { command: 'cd order-web', output: "" },
      { command: 'gh workflow run targets.yml', output: "✓ Created workflow_dispatch event for targets.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"targets.yml\"" },
      { command: 'sleep 120', output: "" },
      { command: 'gh run view 4100000001', output: "X main Targets · 4100000001\nTriggered via workflow_dispatch about 2 minutes ago\n\nJOBS\n✓ build (modern) in 44s (ID 11300000001)\nX build (legacy) in 46s (ID 11300000002)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  ✓ Run npm run build -- --target=${{ matrix.target }}\n  X Run actions/upload-artifact@v4\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\nARTIFACTS\nweb-dist\n\nTo see what failed, try: gh run view 4100000001 --log-failed\nView this run on GitHub: https://github.example/lanternfish/order-web/actions/runs/4100000001" },
      { command: 'gh run view 4100000001 --log-failed | cut -f 2- | tail -n 1', output: "Run actions/upload-artifact@v4\t2026-11-24T02:00:48.0000000Z ##[error]Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run" },
      { command: "sed -i 's/name: web-dist/name: web-dist-${{ matrix.target }}/' .github/workflows/targets.yml", output: "" },
      { command: "git commit -qam 'One artifact per target'", output: "" },
      { command: 'git push -q', output: "To https://github.example/lanternfish/order-web.git\n   e382cb1..d64fc81  main -> main" },
      { command: 'gh workflow run targets.yml', output: "✓ Created workflow_dispatch event for targets.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"targets.yml\"" },
      { command: 'sleep 120', output: "" },
      { command: 'gh run view 4100000003', output: "✓ main Targets · 4100000003\nTriggered via workflow_dispatch about 2 minutes ago\n\nJOBS\n✓ build (modern) in 44s (ID 11300000004)\n✓ build (legacy) in 47s (ID 11300000005)\n\nARTIFACTS\nweb-dist-modern\nweb-dist-legacy\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/lanternfish/order-web/actions/runs/4100000003" },
      { command: 'gh run download 4100000003 -D ~/targets', output: "" },
      { command: 'ls ~/targets', output: "web-dist-legacy/  web-dist-modern/" },
    ],
  },
  {
    id: 'cicd06-cache', title: '沒有快取與命中快取的兩次 run', machine: 'cicd06-lab',
    description: '在 menu-api 連續推送兩個空的 commit：第一次找不到快取、job 結束後存檔，第二次以相同的 key 還原，npm ci 從 31 秒變成 5 秒；最後用 gh cache list 看儲存庫的快取。',
    steps: [
      { command: 'cd menu-api', output: "" },
      { command: 'grep -A 4 actions/cache .github/workflows/ci.yml', output: "      - uses: actions/cache@v4\n        with:\n          path: ~/.npm\n          key: npm-${{ hashFiles('package-lock.json') }}\n          restore-keys: npm-" },
      { command: "git commit -q --allow-empty -m 'Rebuild with an empty cache'", output: "" },
      { command: 'git push -q', output: "To https://github.example/lanternfish/menu-api.git\n   2c581d1..1565f13  main -> main" },
      { command: 'sleep 120', output: "" },
      { command: "git commit -q --allow-empty -m 'Rebuild with the cache'", output: "" },
      { command: 'git push -q', output: "To https://github.example/lanternfish/menu-api.git\n   1565f13..0c4359b  main -> main" },
      { command: 'sleep 120', output: "" },
      { command: 'gh run list', output: "STATUS  TITLE                        WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n✓       Rebuild with the cache       CI        main    push   4100000002  28s      about 2 minutes ago\n✓       Rebuild with an empty cache  CI        main    push   4100000001  55s      about 4 minutes ago" },
      { command: "gh run view 4100000001 --log | grep -E 'Cache (not found|saved with)|added 214' | cut -f 2-", output: "Run actions/cache@v4\t2026-11-24T02:00:05.0000000Z Cache not found for input keys: npm-b41c80c7e3e055b83cccfc6cbccb83030674c7a700e2e217b4f749e5594b4ac3, npm-\nRun npm ci\t2026-11-24T02:00:37.0000000Z added 214 packages, and audited 215 packages in 31s\nPost Run actions/cache@v4\t2026-11-24T02:00:50.0000000Z Cache saved with key: npm-b41c80c7e3e055b83cccfc6cbccb83030674c7a700e2e217b4f749e5594b4ac3" },
      { command: "gh run view 4100000002 --log | grep -E 'Cache (restored from|hit)|added 214' | cut -f 2-", output: "Run actions/cache@v4\t2026-11-24T02:02:05.0000000Z Cache restored from key: npm-b41c80c7e3e055b83cccfc6cbccb83030674c7a700e2e217b4f749e5594b4ac3\nRun npm ci\t2026-11-24T02:02:11.0000000Z added 214 packages, and audited 215 packages in 5s\nPost Run actions/cache@v4\t2026-11-24T02:02:23.0000000Z Cache hit occurred on the primary key npm-b41c80c7e3e055b83cccfc6cbccb83030674c7a700e2e217b4f749e5594b4ac3, not saving cache." },
      { command: 'gh cache list', output: "Showing 1 of 1 cache in lanternfish/menu-api\n\nID  KEY                                                                   SIZE  CREATED              ACCESSED\n1   npm-b41c80c7e3e055b83cccfc6cbccb83030674c7a700e2e217b4f749e5594b4ac3  7 B   about 3 minutes ago  about 3 minutes ago" },
    ],
  },
  {
    id: 'cicd06-release', title: '以標籤發布：檢查版本號，替同一個 Image 加上版本', machine: 'cicd06-lab',
    description: '推送 menu-api 讓 CI 推送 sha-<commit> 的 Image；先推送和 package.json 不符的標籤 v1.9.0 被擋下，再推送 v1.8.0 發布；以自己只能拉取的帳號登入 Registry，確認 1.8.0 與 sha-<commit> 是同一個 digest，而 latest 根本不存在。',
    steps: [
      { command: 'cd menu-api', output: "" },
      { command: "grep -A 3 'Check the version' .github/workflows/release.yml", output: "      - name: Check the version\n        run: |\n          VERSION=\"${GITHUB_REF_NAME#v}\"\n          grep -q \"\\\"version\\\": \\\"$VERSION\\\"\" package.json || { echo \"::error::tag $GITHUB_REF_NAME does not match the version in package.json\"; exit 1; }" },
      { command: "git commit -q --allow-empty -m 'Build menu-api'", output: "" },
      { command: 'git push -q', output: "To https://github.example/lanternfish/menu-api.git\n   2c581d1..52c3e98  main -> main" },
      { command: 'sleep 120', output: "" },
      { command: "gh run view 4100000001 --log | grep -E 'REGISTRY_TOKEN: |Login Succeeded|digest:' | cut -f 2-", output: "Log in to the registry\t2026-11-24T02:00:55.0000000Z   REGISTRY_TOKEN: ***\nLog in to the registry\t2026-11-24T02:00:55.0000000Z Login Succeeded\nRun docker push cr.lanternfish.example/lanternfish/menu-api:sha-${{ github.sha }}\t2026-11-24T02:00:55.0000000Z sha-52c3e98cd373d410064a58907e36caa0ff70aebe: digest: sha256:c4353a445ee69d66d2397e45b8a958a1f2a5ef46c643fa74dc0acfdd853b873d size: 1363" },
      { command: "git tag -a v1.9.0 -m 'menu-api 1.9.0'", output: "" },
      { command: 'git push -q origin v1.9.0', output: "To https://github.example/lanternfish/menu-api.git\n * [new tag]         v1.9.0 -> v1.9.0" },
      { command: 'sleep 60', output: "" },
      { command: 'gh run view 4100000002 --log-failed | cut -f 2- | tail -n 2', output: "Check the version\t2026-11-24T02:02:04.0000000Z ##[error]tag v1.9.0 does not match the version in package.json\nCheck the version\t2026-11-24T02:02:04.0000000Z ##[error]Process completed with exit code 1." },
      { command: "git tag -a v1.8.0 -m 'menu-api 1.8.0'", output: "" },
      { command: 'git push -q origin v1.8.0', output: "To https://github.example/lanternfish/menu-api.git\n * [new tag]         v1.8.0 -> v1.8.0" },
      { command: 'sleep 60', output: "" },
      { command: 'gh run list -L 3', output: "STATUS  TITLE           WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n✓       Build menu-api  Release   v1.8.0  push   4100000003  4s       about 1 minute ago\nX       Build menu-api  Release   v1.9.0  push   4100000002  4s       about 2 minutes ago\n✓       Build menu-api  CI        main    push   4100000001  55s      about 4 minutes ago" },
      { command: `docker login ${REG} -u wei-chen --password-stdin < ~/.registry-token`, output: "WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded" },
      { command: `docker pull -q ${MENU_IMAGE}:1.8.0`, output: "cr.lanternfish.example/lanternfish/menu-api:1.8.0" },
      { command: `docker pull -q ${MENU_IMAGE}:sha-$(git rev-parse HEAD)`, output: "cr.lanternfish.example/lanternfish/menu-api:sha-52c3e98cd373d410064a58907e36caa0ff70aebe" },
      { command: 'docker images --digests', output: "REPOSITORY                                    TAG                                            DIGEST                                                                    IMAGE ID       CREATED         SIZE\ncr.lanternfish.example/lanternfish/menu-api   1.8.0                                          sha256:c4353a445ee69d66d2397e45b8a958a1f2a5ef46c643fa74dc0acfdd853b873d   8d5ee3d219bf   3 minutes ago   201MB\ncr.lanternfish.example/lanternfish/menu-api   sha-52c3e98cd373d410064a58907e36caa0ff70aebe   sha256:c4353a445ee69d66d2397e45b8a958a1f2a5ef46c643fa74dc0acfdd853b873d   8d5ee3d219bf   3 minutes ago   201MB" },
      { command: `docker pull ${MENU_IMAGE}:latest`, output: "Error response from daemon: manifest for cr.lanternfish.example/lanternfish/menu-api:latest not found: manifest unknown: manifest unknown" },
    ],
  },
];

// ---- Exercises (each starts from the lab as declared).
const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd06-ex-cache', title: '讓第二次的 CI 用上快取', machine: 'cicd06-lab',
    statement: 'order-web 的 CI 每次都要 `npm ci` 從頭下載套件（約 32 秒）。在 ~/order-web 的 main 上修改 .github/workflows/ci.yml：在 `actions/checkout@v4` 之後、`npm ci` 之前加上 `actions/cache@v4`，快取 npm 的下載資料夾 `~/.npm`，key 以 `npm-` 開頭並包含 `hashFiles(\'package-lock.json\')`，restore-keys 是 `npm-`；其他內容不變。提交、推送並等 run 結束；再推送一個沒有變更的 commit（`git commit --allow-empty`）觸發第二次的 CI，等它結束，讓這一次的 cache 完全命中。',
    checks: [
      { kind: 'run', repo: ORDER, workflow: 'ci.yml', tip: true, conclusion: 'success', cacheHit: true },
      { kind: 'branch', repo: ORDER, name: 'main', file: { path: CI_PATH, includes: "hashFiles('package-lock.json')" } },
    ],
    solution: ['cd order-web', ...heredoc(CI_PATH, CACHED_CI), ...CACHE_PUSH, WATCH('ci.yml'), ...AGAIN, WATCH('ci.yml')],
    mistakes: [
      { commands: ['cd order-web', ...heredoc(CI_PATH, CACHED_CI), ...CACHE_PUSH, WATCH('ci.yml')],
        why: '只跑了第一次：第一次的 run 一定找不到快取（Cache not found），它只負責在 job 成功之後存檔；要到下一次的 run 才會還原，cache-hit 才是 true' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...cacheStep('npm-deps', false), ...BUILD_STEPS)), ...CACHE_PUSH, 'sleep 120', ...AGAIN, 'sleep 120'],
        why: 'key 寫成固定的 npm-deps：第二次會命中，但之後 package-lock.json 改變時仍然完全命中、還原舊的下載資料，而完全命中時不會存新的快取，這個 key 永遠不會更新' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...cacheStep('npm-${{ github.sha }}', false), ...BUILD_STEPS)), ...CACHE_PUSH, 'sleep 120', ...AGAIN, 'sleep 120'],
        why: 'key 用 github.sha 又沒有 restore-keys：每個 commit 的 key 都不同，第二次的 run 一樣找不到快取，每次都存一份用不到的快取' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, CACHED_CI), ...CACHE_PUSH, WATCH('ci.yml'), ...AGAIN],
        why: '第二次推送之後沒有等 run 跑完，還看不到它的 cache 結果' },
    ],
    hints: [
      "用 `cat > .github/workflows/ci.yml <<'EOF'` 重寫整個檔案，最後一行單獨打 `EOF`；可以先看 `grep -A 4 actions/cache ~/menu-api/.github/workflows/ci.yml`",
      '`- uses: actions/cache@v4` 縮排 6 格，`with:` 8 格，`path`、`key`、`restore-keys` 10 格',
      "第一次推送後用 `gh run list` 找到編號、`gh run watch 編號` 等它結束；第二次用 `git commit -q --allow-empty -m '…'` 與 `git push -q`",
      "`gh run view 編號 --log | grep Cache` 看 cache 找到了什麼",
    ],
    explanation: '第一次的 run 找不到 `npm-<lockfile 的雜湊>`，`npm ci` 從網路下載（32 秒），job 成功後 post step 把 `~/.npm` 存成這個 key。第二次 lockfile 沒變，key 完全相同，還原之後 `npm ci` 只要 6 秒，整個 run 從 54 秒變成 27 秒；完全命中時 post step 不再存檔。哪天 package-lock.json 改了，key 跟著變：restore-keys 先還原最近一份 `npm-` 開頭的舊快取，`npm ci` 只補下載新的套件，job 成功後存成新的 key。',
  },
  {
    id: 'cicd06-ex-artifact', title: '讓 smoke 測試使用 build 的產出物', machine: 'cicd06-lab',
    statement: '在 ~/order-web 的 main 上把 .github/workflows/ci.yml 改成兩個 job（保留 name、on 與 permissions）：`build` 在 checkout 之後執行 `npm ci`、`npm run build`、`npm test`，最後用 `actions/upload-artifact@v4` 把 `dist/` 上傳成名為 `web-dist` 的 artifact；`smoke` 要等 build 成功才開始，checkout 之後用 `actions/download-artifact@v4` 把 `web-dist` 下載到 `dist` 資料夾，再執行 `npm run test:smoke`。smoke 不可以自己再建置一次，它要測的正是 build 產出、之後要部署的那一份。提交、推送並等 run 結束。',
    checks: [
      { kind: 'run', repo: ORDER, workflow: 'ci.yml', tip: true, conclusion: 'success', artifact: 'web-dist' },
      { kind: 'run', repo: ORDER, workflow: 'ci.yml', tip: true, job: 'smoke', conclusion: 'success', logExcludes: 'built 2 files' },
    ],
    solution: ['cd order-web', ...heredoc(CI_PATH, SPLIT_CI), ...SPLIT_PUSH, WATCH('ci.yml')],
    mistakes: [
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'dist/'), ...SMOKE_HEAD(), SMOKE)), ...SPLIT_PUSH, 'sleep 120'],
        why: 'smoke 沒有下載 artifact：每個 job 是一台新的 runner，build 建出的 dist/ 不會自己出現，smoke 找不到 dist/index.html 而失敗' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'node_modules/'), ...SMOKE_HEAD(), ...download('dist'), SMOKE)), ...SPLIT_PUSH, 'sleep 120'],
        why: '上傳的是 node_modules 而不是 dist/：相依套件不是產出物（又大、可以由 lockfile 重建，該用快取），smoke 下載後仍然沒有 dist/index.html' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'dist/'), ...SMOKE_HEAD(), ...download(), SMOKE)), ...SPLIT_PUSH, 'sleep 120'],
        why: 'download 沒有寫 path：檔案直接寫到工作目錄的最上層（index.html、app.js），不在 dist/ 裡，smoke 找不到' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'dist/'), ...SMOKE_HEAD(false), ...download('dist'), SMOKE)), ...SPLIT_PUSH, 'sleep 120'],
        why: 'smoke 沒有寫 needs: build：兩個 job 同時開始，smoke 下載時 build 還沒上傳，download-artifact 回報 Artifact not found for name: web-dist' },
      { commands: ['cd order-web', ...heredoc(CI_PATH, wf(...CI_HEAD, ...BUILD_STEPS, ...upload('web-dist', 'dist/'), ...SMOKE_HEAD(), ...BUILD_STEPS.slice(0, 2), SMOKE)), ...SPLIT_PUSH, 'sleep 120'],
        why: 'smoke 自己又 npm ci 並建置一次：run 雖然通過，但測的是另一次建置的結果，不是要部署的那一份，還多花了將近 40 秒' },
    ],
    hints: [
      '`  smoke:` 和 `  build:` 一樣縮 2 格，下一行是 `    needs: build`',
      'download-artifact 的 `with:` 寫 `name: web-dist` 與 `path: dist`：上傳 `dist/` 時存的是資料夾裡的檔案（index.html、app.js），沒有 path 就會下載到工作目錄的最上層',
      '推送之後 `gh run watch 編號`，應該看到 build、smoke 兩個 job；`gh run view 編號` 的 ARTIFACTS 列出 web-dist',
    ],
    explanation: 'build 把 dist/ 上傳成 web-dist，smoke 在另一台新的 runner 上把同一份檔案下載回 dist/ 再測試，整個 run 約 1 分鐘（build 51 秒、smoke 7 秒）。之後的部署 job 也下載同一個 artifact，測過的就是要部署的，不會有「測試時建一次、部署時又建一次」的差別；需要時也能在本機用 `gh run download 編號 -n web-dist` 取回同一份檔案。',
  },
  {
    id: 'cicd06-ex-image', title: '為每個 commit 建置並推送 Image', machine: 'cicd06-lab',
    statement: '在 ~/order-web 的 main 上新增 .github/workflows/image.yml：workflow 名稱 Image，推送到 main 時執行，`permissions` 只有 `contents: read`；一個在 ubuntu-latest 上的 job `image`：checkout、`npm ci`、`npm run build`，接著 `docker build` 出 `cr.lanternfish.example/lanternfish/order-web:sha-<commit>`（commit 用 `${{ github.sha }}`），用儲存庫的 secret `REGISTRY_TOKEN` 透過 `--password-stdin` 以 ci-bot 登入 cr.lanternfish.example，最後推送這個標籤。Token 不可以出現在指令列或日誌裡。提交、推送並等 Image 的 run 結束。',
    checks: [
      { kind: 'registry', registry: REG, repository: 'lanternfish/order-web', tag: 'sha-', commit: { repo: ORDER } },
      { kind: 'run', repo: ORDER, workflow: 'image.yml', tip: true, conclusion: 'success', logExcludes: CI_TOKEN },
      { kind: 'branch', repo: ORDER, name: 'main', file: { path: IMAGE_PATH, includes: '--password-stdin' } },
    ],
    solution: ['cd order-web', ...heredoc(IMAGE_PATH, IMAGE_YML), ...IMAGE_PUSH, WATCH('image.yml')],
    mistakes: [
      { commands: ['cd order-web', ...heredoc(IMAGE_PATH, imageYml('latest')), ...IMAGE_PUSH, 'sleep 120'],
        why: '只推送 latest：Registry 上沒有 sha-<commit>，之後說不出這個 Image 是哪個 commit 建出來的，下一次推送還會把 latest 移走' },
      { commands: ['cd order-web', ...heredoc(IMAGE_PATH, imageYml('sha-${{ github.sha }}', { how: '-p' })), ...IMAGE_PUSH, 'sleep 120'],
        why: '用 -p "$REGISTRY_TOKEN" 登入：雖然登入成功、日誌也遮蔽成 `***`，但 Token 成了指令的參數，在 runner 上查看程序清單就看得到，docker 也警告 Using --password via the CLI is insecure' },
      { commands: ['cd order-web', ...heredoc(IMAGE_PATH, imageYml('sha-${{ github.sha }}', { secret: 'DOCKER_PASSWORD' })), ...IMAGE_PUSH, 'sleep 120'],
        why: '引用了不存在的 secrets.DOCKER_PASSWORD：沒有設定的 secret 是空字串，docker login 回報 Error: Password Required，Image 沒有推送' },
      { commands: ['cd order-web', ...heredoc(IMAGE_PATH, imageYml('sha-${{ github.sha }}', { build: false })), ...IMAGE_PUSH, 'sleep 120'],
        why: '少了 npm run build：runner 上沒有 dist/，Dockerfile 的 COPY dist/ 失敗（"/dist": not found），docker build 停在那裡' },
      { commands: ['cd order-web', ...heredoc(IMAGE_PATH, IMAGE_YML), 'git add .github', "git commit -qm 'Build and push the image for every commit'"],
        why: '只提交沒有推送：主機上沒有 image.yml，也沒有任何 run' },
    ],
    hints: [
      '新檔案：`cat > .github/workflows/image.yml <<\'EOF\'`，寫完要 `git add .github` 再提交',
      '登入的 step 用 `env:` 帶入 `REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}`，指令是 `echo "$REGISTRY_TOKEN" | docker login cr.lanternfish.example -u ci-bot --password-stdin`',
      'Dockerfile 的 `COPY dist/` 需要 dist/，所以 `npm run build` 要在 `docker build` 之前',
      "推送後 CI 與 Image 兩個 workflow 都會執行；`gh run view 編號 --log | grep -E 'Login|digest'` 看登入與推送的結果",
    ],
    explanation: '推送到 main 之後 Image 的 run 約 45 秒：建置網站、`docker build`、以 secret 登入、推送。日誌裡 `REGISTRY_TOKEN` 顯示成 `***`，Token 只經過環境變數與管線進入 docker login，不在指令列上；推送的最後一行是 `sha-<40 字的 commit>: digest: sha256:…`。之後每次合併到 main 都會留下一個對應那個 commit 的 Image，要部署或回滾哪一版，就用那個 commit 的標籤（或它的 digest）。',
  },
];

export const CICD06: LessonContent = {
  lessonId: 'CICD06',
  motivation: '「order-web 2.3.0 上週五上線後出了問題，大家想退回前一版，卻沒有人說得出前一版是哪個 commit 建出來的：網站是 Priya 在自己的筆電上 `npm install`、`npm run build` 之後上傳的，正式環境的 Image 標籤是 latest，而她筆電上的套件版本和 CI 測試時用的也不一樣。」CICD04、CICD05 讓每次推送都自動建置與測試；這一課讓管線再多做一件事：把通過測試的那個 commit 變成一份可以部署、說得出來源的產出物。依序處理可重現建置（lockfile、`npm ci`、固定版本的基底 Image，同一個 commit 每次都建出同樣的東西）、把建置結果存成 artifact 給後面的 job 與人取用、用快取加速相依套件的安裝、在 workflow 裡建置 Docker Image 並以 secret 登入推送到團隊的 Registry、用 commit 與版本號標記，最後讓發布只是替已經建好、測過的 Image 加上版本號。全部在模擬的 GitHub Actions 上真的推送、真的執行。',
  sections: [
    {
      id: 'cicd06-s-setup', title: '本課的團隊、儲存庫與工具',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的連鎖餐廳 Lanternfish Kitchen，程式放在模擬的 GitHub 主機 `github.example` 上。你是 Chen Wei（gh 帳號 wei-chen），筆電 wei-laptop 的家目錄裡有兩個儲存庫的複本。模擬的時鐘是 2026-11-24 02:00 UTC（台北時間上午 10:00）。' },
        { type: 'table', head: ['儲存庫', '內容', '已有的 workflow', '你的權限'], rows: [
          ['lanternfish/order-web（~/order-web）', '點餐網站，版本 2.3.0；`npm run build` 把 src/ 打包成 dist/ 的靜態網站，Dockerfile 用 `nginx:1.27.3-alpine` 提供 dist/', 'ci.yml（CI：推送到 main 時一個 job 依序 checkout、`npm ci`、建置、測試，沒有快取）；targets.yml（Targets：Priya 試驗中，手動觸發，為新舊瀏覽器各建置一次）', 'admin'],
          ['lanternfish/menu-api（~/menu-api）', '菜單服務，版本 1.8.0，Dockerfile 以 `node:22.11.0-slim` 為基底', 'ci.yml（CI：快取、上傳 artifact、建置並推送 Image）；release.yml（Release：推送 `v*` 標籤時發布）。都是 Priya 寫的，是本課的參考', 'write'],
        ] },
        { type: 'p', text: '團隊的私有 Registry 是 `cr.lanternfish.example`（DKR11 介紹過 Registry、標籤與 digest）。帳號 ci-bot 可以推送 lanternfish/ 底下的儲存庫，它的 Token 已由管理員存成兩個儲存庫的 Actions secret `REGISTRY_TOKEN`；你自己的帳號 wei-chen 只能拉取，Token 在 ~/.registry-token（權限 600）。課程裡的 Token 都是明顯的假值。' },
        { type: 'table', head: ['指令', '做什麼', '在本課大約花多久'], rows: [
          ['`npm ci`', '依 package-lock.json 安裝相依套件；下載的套件留在 npm 的快取資料夾 `~/.npm`', '沒有快取 32 秒；`~/.npm` 已經有資料時 6 秒'],
          ['`npm run build`', '用 esbuild 把 src/ 打包到 dist/（需要先 `npm ci`）', 'order-web 9 秒、menu-api 5 秒'],
          ['`npm test`', '單元測試（需要先 `npm ci`）', '6 到 7 秒'],
          ['`npm run test:smoke`', 'order-web 的冒煙測試：檢查 dist/ 裡的網站能不能用；只用 Node.js 內建的模組，不需要 `npm ci`', '4 秒'],
        ] },
        { type: 'p', text: 'workflow 檔案和 CICD04 一樣用 here-document 寫：`cat > 檔案 <<\'EOF\'` 之後每一行都寫進檔案，直到單獨一行的 `EOF`；`EOF` 加上單引號，`${{ }}` 與 `$REGISTRY_TOKEN` 才會照字面寫入。終端機每一行最多 500 個字元，逐行輸入沒有問題；參考解答因為整段指令算一次輸入，把較長的檔案分成幾段 here-document，第一段用 `>`、之後用 `>>` 接在後面，結果相同。觀察 run 的指令與 CICD05 相同：`gh run list`、`gh run watch 編號`、`gh run view 編號`（`--log`、`--log-failed`）。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'workflow 真的會在推送或觸發時執行，`actions/cache`、`upload-artifact`、`download-artifact`、runner 上的 Docker 與 secret 的遮蔽都有模擬；npm 的安裝、建置與測試是課程宣告的結果，不是真的 Node.js。每個 job 的 Docker 都是全新的，沒有本機 Image，也沒有建置快取。模擬的 Dockerfile 不接受 `FROM 名稱@sha256:…` 這種以 digest 指定基底的寫法（真實的 Docker 可以），所以本課的 Dockerfile 以完整的版本標籤固定基底。github.example、團隊、網址與 Token 都是虛構的。' },
      ],
    },
    {
      id: 'cicd06-s-repro', title: '可重現建置：同一個 commit，同樣的產出物',
      blocks: [
        { type: 'p', text: '可重現建置（reproducible build）是指：給定同一份原始碼（同一個 commit）與同樣的建置步驟，不論何時、在哪一台機器上建置，都得到相同的結果。做不到時，「測試通過的」和「部署出去的」可能根本不是同一份東西；出事時想用舊的 commit 重建一次來除錯，建出來的也不是當時那一份。開頭的故事就是例子：Priya 筆電上的套件版本，和 CI 測試時裝的不一樣。' },
        { type: 'table', head: ['會變動的來源', '例子', '怎麼固定'], rows: [
          ['相依套件的版本範圍', 'package.json 寫 `"preact": "^10.24.3"`，今天和下個月可能解析成不同的 10.x 版本', '提交 package-lock.json（記下每個套件確切的版本），CI 用 `npm ci` 照它安裝'],
          ['會移動的基底 Image 標籤', '`FROM nginx:alpine`、`node:22` 隨著新版發布指向不同的 Image', '寫到完整版本（`nginx:1.27.3-alpine`），更嚴格的是再加上 digest（`nginx:1.27.3-alpine@sha256:…`）'],
          ['建置工具的版本', 'runner 的 image 更新後，預設的 Node.js 版本跟著變', '用 `actions/setup-node` 指定版本，或在 Image 裡建置'],
          ['建置環境', '筆電上有沒提交的檔案、不同的環境變數', '一律在 CI 從乾淨的 checkout 建置，不用個人電腦上的結果'],
          ['時間與隨機', '產出物裡寫入建置的時間或隨機的編號', '不要寫入，或改用固定的值（例如 commit 的時間）'],
        ] },
        { type: 'p', text: '`npm install` 與 `npm ci` 的差別是重點。`npm install` 依 package.json 的範圍解析版本，必要時會改寫 package-lock.json；`npm ci` 是給 CI 這類自動化環境用的：一定要有 lockfile，只照 lockfile 安裝，lockfile 和 package.json 對不上時直接失敗，而且會先刪掉已有的 node_modules，從乾淨的狀態安裝。下面的例子在 order-web 看這兩個檔案，再模擬有人只在 package.json 加了一個套件、卻沒有更新 lockfile。' },
        { type: 'example', id: 'cicd06-repro' },
        { type: 'p', text: 'package.json 寫的是範圍（`^10.24.3`），package-lock.json 寫的是確切的版本（`10.24.3`）；同一個 commit 的 lockfile 相同，`npm ci` 裝出的套件也就相同。沒有安裝就建置會失敗（找不到 esbuild），這也是為什麼 CI 的第一步總是安裝相依套件。最後 `npm ci` 拒絕安裝：與其默默解析出一個沒人測過的 dayjs 版本，不如讓建置失敗。正確的做法是在自己的電腦上 `npm install dayjs@1.11.13`，讓 npm 同時更新兩個檔案，再把兩個檔案一起提交。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：CI 用 npm install 比較保險，缺什麼它會自己補', text: '`npm install` 遇到 lockfile 不一致時會自己解析並改寫 lockfile，CI 因此「綠了」，但裝出的版本可能和任何人電腦上的都不同，而改過的 lockfile 留在 runner 上，下一次又重新解析一次。可重現建置要的正好相反：不一致就失敗，讓人在提交前修好。同樣的道理，基底 Image 寫 `latest` 或只寫主版本，等於讓每次建置自己挑一個版本。' },
      ],
    },
    {
      id: 'cicd06-s-artifacts', title: '產出物：建置一次，之後都用同一份',
      blocks: [
        { type: 'p', text: '產出物（artifact）是建置留下來、之後要用的東西：打包好的網站、執行檔、Image、測試報告與覆蓋率。CICD05 說過，每個 job 都在一台新的 runner 上執行，前一個 job 建出的檔案不會自己出現在下一個 job 裡。要把檔案交給後面的 job（或下載回本機），就把它上傳成 run 的 artifact。這讓管線可以遵守「建置一次（build once）」：只建置一次，之後的測試、Image 與部署都使用同一份檔案，測過的就是部署的。' },
        { type: 'table', head: ['action 與輸入', '作用'], rows: [
          ['`actions/upload-artifact@v4`：`name`、`path`', '把 `path`（檔案或資料夾，可以多行）上傳成名為 `name` 的 artifact；檔案的路徑相對於這些路徑共同的資料夾，所以上傳 `dist/` 存的是 index.html、app.js'],
          ['`retention-days`、`if-no-files-found`', '保留幾天（預設 90，儲存庫可以設定）；找不到檔案時要警告（warn，預設）、失敗（error）或忽略'],
          ['`actions/download-artifact@v4`：`name`、`path`', '把同一個 run 裡這個名稱的 artifact 下載到 `path`（預設是工作目錄）；不寫 name 時下載全部，每個放在以名稱命名的資料夾'],
          ['`gh run download 編號 -n 名稱 -D 資料夾`', '在本機取回某個 run 的 artifact；沒有 `-n` 時每個 artifact 放在自己名稱的資料夾'],
        ] },
        { type: 'p', text: 'menu-api 的 CI 就是這樣分工：build job 安裝、建置、測試後把 dist/ 上傳成 `api-dist`，image job 在 `needs: build` 之後把它下載回 dist/，再用它建置 Image。下面的例子推送一次 menu-api，看 run 的 ARTIFACTS，再把 api-dist 取回筆電，和自己在筆電上從同一個 commit 建置的結果比較。' },
        { type: 'example', id: 'cicd06-artifact' },
        { type: 'p', text: 'CI 建出的 server.js 和筆電上建出的一字不差：同一個 commit、同一份 lockfile、同樣的步驟，這就是可重現建置帶來的好處，任何人都能驗證 artifact 確實來自那個 commit。`gh run download` 不會覆蓋已經存在的檔案，所以第二次下載到同一個資料夾時失敗。' },
        { type: 'p', text: '在 upload-artifact v4，artifact 一旦上傳就不能修改，同一個 run 裡的名稱也不能重複。最常踩到的是 matrix：同一份 step 在每個組合各執行一次，名稱寫死就會撞名。order-web 的 Targets 正是這樣。' },
        { type: 'example', id: 'cicd06-conflict' },
        { type: 'p', text: 'modern 先上傳成功，legacy 的上傳得到 409 Conflict；run 失敗，而留下來的 web-dist 只是其中一種，從名稱看不出是哪一種。把名稱加上 matrix 的值（`web-dist-${{ matrix.target }}`）就各留一份；`overwrite: true` 雖然也能讓上傳成功，但會刪掉前一份，matrix 裡兩個 job 互相覆蓋，不是這裡要的。上傳什麼也要選擇：上傳建置的結果與報告，不要上傳 node_modules，它很大、可以由 lockfile 重建，加速安裝是下一節快取的工作。' },
      ],
    },
    {
      id: 'cicd06-s-cache', title: '快取：讓相依套件不必每次重新下載',
      blocks: [
        { type: 'p', text: '每個 job 都是新的 runner，所以 order-web 的 CI 每次都從網路下載同樣的 214 個套件，光是 `npm ci` 就要 32 秒。快取（cache）用 `actions/cache` 在 job 成功之後把一個資料夾存起來，下一次的 run 用 key 找回來還原。對 npm 來說要快取的是它的下載資料夾 `~/.npm`，不是 node_modules：`npm ci` 一開始就會刪掉 node_modules。' },
        { type: 'table', head: ['輸入或情況', '意義'], rows: [
          ['`path`', '要存的資料夾（`~/.npm`）'],
          ['`key`', '這份快取的名字。先找 key 完全相同的快取；找到時 output `cache-hit` 是 true，job 結束時不再存檔（快取不會覆寫）'],
          ['`restore-keys`', '找不到完全相同的 key 時，依序以這些前綴找最新的一份還原（`cache-hit` 不是 true）；job 成功後以新的 key 存一份'],
          ['都找不到', '`Cache not found for input keys: …`，job 照常執行，成功後以 key 存檔'],
          ['範圍', '先找這個分支自己的快取，再找 PR 的 base 分支與預設分支的；其他分支存的快取彼此看不到'],
        ] },
        { type: 'p', text: 'key 的設計決定快取有沒有用。`npm-${{ hashFiles(\'package-lock.json\') }}` 把 lockfile 內容的雜湊放進 key：lockfile 沒變，key 就相同，每次都完全命中；lockfile 一改，key 跟著改，restore-keys `npm-` 先還原舊的一份當起點，`npm ci` 只需補下載新增或升級的套件，job 成功後存成新的 key。下面的例子在已經設定好快取的 menu-api 連續推送兩次。' },
        { type: 'example', id: 'cicd06-cache' },
        { type: 'p', text: '第一次找不到快取，`npm ci` 花 31 秒，job 結束時存成 `npm-<雜湊>`；第二次 key 相同，還原之後 `npm ci` 只花 5 秒，整個 run 從 55 秒降到 28 秒，post step 說命中了主要的 key、不再存檔。快取是加速，不是必要條件：找不到時 workflow 仍然要能成功，只是比較慢。真實的 GitHub 也會清掉一段時間沒有使用的快取，儲存庫的快取也有總量上限。' },
        { type: 'table', head: ['', '快取（cache）', '產出物（artifact）'], rows: [
          ['目的', '加速：省下重新下載、重新計算的時間', '保存並傳遞結果：之後要測試、部署或下載的那一份'],
          ['典型內容', '`~/.npm`、pip 的下載資料夾等可以重建的東西', 'dist/、執行檔、測試報告'],
          ['找不到時', '照常執行，只是比較慢', '需要它的 job 失敗'],
          ['範圍與壽命', '跨 run 共用，依 key 與分支查找，不覆寫', '屬於某一個 run，名稱在 run 裡唯一，依保留天數過期'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見錯誤：key 寫得太死或太活', text: 'key 寫成固定的 `npm-deps`：第一次之後永遠完全命中，lockfile 改了也照樣還原舊資料，而完全命中時不會存檔，這份快取再也不會更新。反過來用 `npm-${{ github.sha }}`（又沒有 restore-keys）：每個 commit 的 key 都不同，永遠找不到，只是每次多存一份沒人用的快取。另一個誤解是把建置結果放進快取交給部署 job：快取可能找不到、可能是別的分支或舊的內容，要交給下一個 job 的結果應該用 artifact。' },
      ],
    },
    {
      id: 'cicd06-s-image', title: 'Image 建置與推送：在管線中產生容器 Image',
      blocks: [
        { type: 'p', text: '對要以容器部署的服務來說，真正的產出物是 Image。在管線裡建置 Image，代表它一定來自某個 commit 的乾淨 checkout，而不是某個人的電腦。GitHub-hosted runner 上有 Docker，Image 建置與推送就是三個熟悉的指令：`docker build`、`docker login`、`docker push`（DKR10、DKR11）。不同的是：每個 job 都是新的 runner，Docker 沒有任何本機 Image，建置快取也是空的；Registry 的 Token 不能寫在檔案裡，要從 secret 取得。' },
        { type: 'list', ordered: true, items: [
          '準備建置的內容：order-web 的 Dockerfile 是 `COPY dist/ …`，所以 `docker build` 之前要先有 dist/（同一個 job 裡 `npm run build`，或像 menu-api 一樣下載 build job 的 artifact）。',
          '以 commit 標記：`docker build -t cr.lanternfish.example/lanternfish/order-web:sha-${{ github.sha }} .`，`github.sha` 是這次 run 的 commit（40 字）。DKR11 的例子用前 7 個字，這裡用完整的雜湊，不必擔心短雜湊在大型儲存庫裡重複。',
          '登入：`env:` 帶入 `REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}`，再 `echo "$REGISTRY_TOKEN" | docker login cr.lanternfish.example -u ci-bot --password-stdin`。',
          '推送：`docker push` 同一個名稱；最後一行是這個標籤與它的 digest。',
        ] },
        { type: 'p', text: 'secret 由儲存庫的管理員設定（`gh secret set`，CICD08 詳談），workflow 用 `${{ secrets.名稱 }}` 取得。runner 會把 job 看得到的每個 secret 的值，在日誌的每一行換成 `***`；沒有設定的 secret 是空字串，`docker login` 因此回報 `Error: Password Required`。從 fork 送來的 Pull Request 觸發的 workflow 拿不到 secret，這是 GitHub 刻意的限制。第三節第一個例子裡 menu-api 的 image job 就是這樣下載 artifact、建置、登入與推送的；下一節的例子會從它的日誌看到 `REGISTRY_TOKEN: ***`、`Login Succeeded` 與推送的 digest。' },
        { type: 'table', head: ['寫法', '問題'], rows: [
          ['`docker login … -p "$REGISTRY_TOKEN"`', 'Token 成了指令的參數，同一台機器上查看程序清單就看得到，也可能留在 Shell 的歷史；docker 會警告 `Using --password via the CLI is insecure. Use --password-stdin.`'],
          ['`run: echo ${{ secrets.REGISTRY_TOKEN }} | docker login …`', '`${{ }}` 在執行前就被代換成文字，值直接寫進指令稿；用 `env:` 傳入、指令裡寫 `$REGISTRY_TOKEN` 比較安全（CICD08 的 script injection 也是同一個原理）'],
          ['把 Token 寫在 workflow 或 Dockerfile 裡', '進了 Git 歷史，所有能讀儲存庫的人都拿得到，刪掉檔案也留在舊的 commit 裡'],
          ['只推送 `latest`', '說不出它來自哪個 commit，下一次推送就把它移走，也無法回滾'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：日誌會遮蔽 secret，所以怎麼用都安全', text: '遮蔽只是把日誌裡和 secret 完全相同的文字換成 `***`。把 Token 轉成 base64、只印出一部分，或寫進 artifact、Image 的某一層，遮蔽都認不出來；用 `-p` 傳入時日誌雖然顯示 `***`，Token 仍然以參數的形式出現在 runner 上。遮蔽是最後一道防線，不是可以隨意輸出 secret 的理由：secret 只經過環境變數與標準輸入交給需要它的指令。' },
      ],
    },
    {
      id: 'cicd06-s-version', title: '版本號：從 commit 到發布',
      blocks: [
        { type: 'p', text: '`sha-<commit>` 讓每個 Image 都追溯得到來源，但「1.8.0 修了什麼、和 1.7.2 相容嗎」要靠版本號回答。常用的是語意化版本（Semantic Versioning，SemVer）：`主版本.次版本.修訂號`，不相容的改動加主版本，相容的新功能加次版本，相容的修正加修訂號；`1.9.0-rc.1` 這類預發布版本排在 `1.9.0` 之前。版本號放在哪裡，要有唯一的來源：Node.js 專案通常是 package.json 的 `version`，發布時再打上同名的 Git 標籤（`v1.8.0`），兩者不一致時要擋下來，而不是猜哪一個對。' },
        { type: 'p', text: 'menu-api 的 release.yml 在推送 `v*` 標籤時執行（`on: push: tags: [\'v*\']`），`GITHUB_REF_NAME` 是標籤的名稱，`${GITHUB_REF_NAME#v}` 去掉開頭的 v。它不重新建置：先檢查標籤和 package.json 的版本相同，再拉下 CI 為這個 commit 推送的 `sha-<commit>`，加上版本號的標籤推送回去。這就是升級（promote）同一個產出物：發布的正是 CI 建置並測試過的那一份，兩個標籤指向同一個 digest。' },
        { type: 'example', id: 'cicd06-release' },
        { type: 'p', text: '日誌裡 Token 只以 `***` 出現；v1.9.0 和 package.json 的 1.8.0 不符，release 在第一個 step 就失敗，什麼都沒推送；v1.8.0 通過檢查，用 4 秒就完成發布，因為它只是替已經存在的 Image 加上標籤。`docker images --digests` 顯示 1.8.0 與 sha-<commit> 是同一個 digest、同一個 IMAGE ID；latest 根本不存在，誰也不會不小心部署它。' },
        { type: 'table', head: ['標籤', '誰推送', '什麼時候', '可以拿來部署嗎'], rows: [
          ['`sha-<commit>`', 'CI（每次推送到 main）', '每一次建置', '可以，最好再以 digest 鎖定'],
          ['`1.8.0`', 'Release workflow', '推送 `v1.8.0` 標籤、版本檢查通過時', '可以，正式環境用它（或它的 digest）'],
          ['`latest`', '本課的管線不推送', '—', '不行：它會移動，說不出是哪一版（DKR11）'],
        ] },
        { type: 'list', items: [
          '版本號只有一個來源（package.json），Git 標籤必須和它一致；要發布新版，先在一個 commit 裡改 version，合併後再打標籤。',
          '發布不重新建置，而是替測過的 `sha-<commit>` 加上版本號；同一個版本號不重用，修正就發布 1.8.1。',
          '部署設定寫版本號或 digest，永遠不寫 latest；回滾就是換回上一個版本號或 digest。',
          'SemVer 的 `+建置資訊` 不能放進 Docker 標籤，commit 就寫成另一個標籤（`sha-…`）。',
        ] },
        { type: 'callout', tone: 'tip', title: '發布前再建置一次，看似乾淨其實多了風險', text: '在 release 裡從同一個 commit 重新 `docker build` 看起來也行，但那是一次沒有被測試過的新建置：基底 Image、套件來源或建置工具只要有一點不同，得到的就是另一個 digest。把 CI 已經測過的 Image 重新標記，才保證「測過的就是發布的」。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd06-q-npmci', prompt: '要讓同一個 commit 在 CI 上每次都裝到相同版本的相依套件，安裝的 step 應該執行什麼？',
      options: ['`npm install`，lockfile 缺少的套件它會自動補上並改寫 lockfile', '`npm update`，讓每次建置都用上最新的修正版', '`npm ci`，只照 package-lock.json 安裝，對不上時失敗', '先刪掉 package-lock.json 再執行 `npm install`，避免舊的鎖定版本和 package.json 衝突'],
      answer: 2,
      explanation: '`npm ci` 只照提交的 lockfile 安裝，lockfile 與 package.json 不一致時直接失敗，所以同一個 commit 每次裝到相同的版本。`npm install` 會自行解析並改寫 lockfile，裝到的版本可能沒人測過；`npm update` 刻意升級到範圍內的新版，正好破壞可重現性；刪掉 lockfile 等於放棄鎖定，每次都重新解析版本。',
    },
    {
      id: 'cicd06-q-key', prompt: 'order-web 的 `actions/cache` 要快取 `~/.npm`。下列哪一個 key 最恰當？',
      options: ["`npm-${{ hashFiles('package-lock.json') }}`", '`npm-cache`，固定的 key 最容易命中', '`npm-${{ github.sha }}`，每個 commit 各存一份最精確', '`npm-${{ github.run_id }}`，讓不同的 run 不會互相干擾'],
      answer: 0,
      explanation: '把 lockfile 的雜湊放進 key：依賴沒變時 key 相同而完全命中，lockfile 一改 key 就跟著變，配合 restore-keys 從舊快取補新的套件。固定的 key 在 lockfile 改變後仍然命中舊資料，而且完全命中時不會存新的快取；`github.sha` 與 `github.run_id` 每次都不同，永遠找不到完全相同的 key，快取失去作用。',
    },
    {
      id: 'cicd06-q-pass', prompt: 'build job 建出 dist/，之後的 deploy job 要部署同一份檔案。最恰當的做法是什麼？',
      options: ['用 `actions/cache` 存 dist/，deploy job 以同一個 key 還原', '在 deploy job 裡 checkout 同一個 commit 再建置一次，反正可重現建置的結果都一樣', '把 dist/ 提交回儲存庫，deploy job 再 checkout 一次', 'build 上傳成 artifact，deploy 用 download-artifact 取回同一份'],
      answer: 3,
      explanation: 'artifact 屬於這個 run，名稱唯一、找不到時需要它的 job 會失敗，正是傳遞「要部署的那一份」的機制。快取是加速用的，可能找不到或是舊的內容；重新建置是一次沒測過的新建置，即使力求可重現也不能保證完全相同；把建置結果提交回儲存庫會污染歷史，還會觸發新的推送。',
    },
    {
      id: 'cicd06-q-conflict', prompt: 'matrix 的兩個 job（modern、legacy）都執行 `actions/upload-artifact@v4`，`name: web-dist`。結果會怎樣？',
      options: ['後完成的那個覆蓋先完成的，run 裡只留下最後上傳的那一份檔案', '後上傳的 step 失敗：同一個 run 裡名稱不能重複', '兩份自動合併成一個 artifact，裡面同時有兩種版本', 'GitHub 自動把名稱改成 web-dist-1 與 web-dist-2'],
      answer: 1,
      explanation: 'v4 的 artifact 上傳後不能修改，同一個 run 裡已有這個名稱時上傳得到 409 Conflict，那個 job 失敗。只有明確寫 `overwrite: true` 才會刪掉舊的再上傳；它不會合併內容，也不會自動改名。正確的做法是把 matrix 的值放進名稱，例如 `web-dist-${{ matrix.target }}`。',
    },
    {
      id: 'cicd06-q-login', prompt: 'image job 要用 secret `REGISTRY_TOKEN` 登入 cr.lanternfish.example。哪一種寫法最安全？',
      options: ['`run: docker login cr.lanternfish.example -u ci-bot -p ${{ secrets.REGISTRY_TOKEN }}`，日誌反正會遮蔽', '先 `echo "token=$REGISTRY_TOKEN"` 印出來確認有值，再登入', '`env:` 帶入 `REGISTRY_TOKEN`，再以 `--password-stdin` 從標準輸入交給 docker login', '把 Token 直接寫進 workflow 檔案，省得設定 secret'],
      answer: 2,
      explanation: '經由環境變數與標準輸入，Token 不會成為指令的參數，也不會被代換進指令稿。`-p` 讓 Token 出現在程序清單裡，docker 也會警告；印出 secret 依賴遮蔽，換個形式（例如 base64）就遮不住；寫進 workflow 檔案則進了 Git 歷史，所有能讀儲存庫的人都拿得到。',
    },
    {
      id: 'cicd06-q-tag', prompt: '每次推送到 main，CI 都建置並推送 order-web 的 Image。哪一種標籤做法最能追溯來源？',
      options: ['只推送 `latest`，部署時一律拉取 latest 就能拿到最新版', '每次都推送 package.json 裡的版本號 `2.3.0`，新的建置直接覆蓋舊的同名標籤', '推送 `main` 這個標籤，代表 main 分支目前的狀態', '每次推送 `sha-<commit>`，發布時再加上版本號'],
      answer: 3,
      explanation: '`sha-<commit>` 每次建置都不同，看到 Image 就知道它來自哪個 commit；正式發布時再替同一個 Image 加上版本號。latest 與 main 都會移動，說不出是哪一版也無法回滾；每次以同一個版本號覆蓋，2.3.0 在不同時間代表不同的內容，版本號就失去意義。',
    },
    {
      id: 'cicd06-q-promote', prompt: 'menu-api 發布 1.8.0 時，release.yml 不重新建置，而是拉下 `sha-<commit>` 的 Image、加上 `1.8.0` 的標籤再推送。主要的理由是什麼？',
      options: ['重新建置太慢，省時間是唯一的理由', '發布的正是 CI 建置並測試過的那一份，兩個標籤同一個 digest', 'Registry 規定同一個儲存庫只能存放一次 docker build 的結果，第二次會被拒絕', '版本標籤必須和 latest 指向同一個 Image'],
      answer: 1,
      explanation: '重新標記不產生新的 Image，1.8.0 與 sha-<commit> 指向同一個 digest，保證測過的就是發布的。省時間只是附帶的好處；Registry 沒有「只能建置一次」的規則，同一個儲存庫可以有很多 Image；本課的管線根本不推送 latest，版本標籤也不需要和它一致。',
    },
  ],
  terminal: { machines: [lab], examples: EXAMPLES, exercises: EXERCISES },
};
