import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';

/*
 * A synthetic machine for engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md), only for tests — CICD06–08-like
 * caches, artifacts, Docker on runners, secrets and variables on dev-06 (the artifacts profile, Asia/Taipei). gh is
 * logged in as mei-lin (admin of island/shop).
 * - island/shop main (c2): package-lock.json, a Dockerfile, and workflows: cache.yml (Cache: push; actions/cache of ~/.npm
 *   keyed on package-lock.json, then npm ci, 20 s cold and 2 s with the cache), art.yml (Art: dispatch; build uploads
 *   dist, deploy downloads it), secret.yml (Secrets: dispatch; prints secrets and variables), image.yml (Image: dispatch;
 *   docker build, login with the DOCKER_TOKEN secret through --password-stdin, push sha-<commit> to ghcr.example).
 * - Secrets: DOCKER_TOKEN (repository), DEPLOY_KEY (environment production, three lines); variables APP_ENV=dev and,
 *   in production, APP_ENV=prod.
 * - Docker: node:22-slim on Docker Hub; ghcr.example where ci may push island/*.
 */
const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
export const SHOP = 'https://github.example/island/shop.git';
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };
export const CI_TOKEN = 'lesson-token-ci-0001';
export const DEPLOY_KEY = 'fake-deploy-key-line-1\nfake-deploy-key-line-2\nfake-deploy-key-line-3';
const wf = (...lines: string[]) => [...lines, ''].join('\n');

export const CACHE_YML = wf('name: Cache', 'on: push', 'jobs:', '  install:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
  '      - uses: actions/cache@v4', '        with:', '          path: ~/.npm', "          key: npm-${{ hashFiles('package-lock.json') }}", '          restore-keys: npm-',
  '      - run: npm ci');
export const ART_YML = wf('name: Art', 'on: workflow_dispatch', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps:',
  '      - run: mkdir -p dist && echo "<h1>shop</h1>" > dist/index.html && echo "v1" > dist/VERSION', '      - uses: actions/upload-artifact@v4', '        with:', '          name: dist', '          path: dist/',
  '          retention-days: 5', '  deploy:', '    needs: build', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/download-artifact@v4', '        with:', '          name: dist',
  '      - run: cat index.html VERSION');
export const SECRET_YML = wf('name: Secrets', 'on: workflow_dispatch', 'jobs:', '  show:', '    runs-on: ubuntu-latest', '    environment: production', '    env:', '      TOKEN: ${{ secrets.DOCKER_TOKEN }}',
  '    steps:', '      - run: echo "token=$TOKEN"', '      - run: echo "${{ secrets.DEPLOY_KEY }}"', '      - run: echo "missing=[${{ secrets.NOPE }}] env=${{ vars.APP_ENV }}"');
export const IMAGE_YML = wf('name: Image', 'on: workflow_dispatch', 'jobs:', '  image:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
  '      - run: docker build -q -t ghcr.example/island/shop:sha-${{ github.sha }} .', '      - run: echo "${{ secrets.DOCKER_TOKEN }}" | docker login ghcr.example -u ci --password-stdin',
  '      - run: docker push ghcr.example/island/shop:sha-${{ github.sha }}');
export const DOCKERFILE = 'FROM node:22-slim\nWORKDIR /app\nCOPY package.json .\nCMD ["node", "-e", "1"]\n';

export const ARTIFACTS_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n', 'package.json': '{ "name": "shop" }\n', 'package-lock.json': '{ "lockfileVersion": 3 }\n', Dockerfile: DOCKERFILE }, author: MEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add workflows', files: { '.github/workflows/cache.yml': CACHE_YML, '.github/workflows/art.yml': ART_YML, '.github/workflows/secret.yml': SECRET_YML, '.github/workflows/image.yml': IMAGE_YML }, author: MEI, time: '2026-11-21 01:00:00' },
];

export const ART_TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cache: '~/.npm', cases: [{ when: [{ path: 'package-lock.json' }], stdout: 'added 120 packages in 20s', seconds: 20, cachedSeconds: 2 }, { stderr: 'npm ERR! missing package-lock.json', exit: 1 }] },
];

export const artifactsLab: TerminalMachine = {
  id: 'dev-06', title: 'dev-06（快取、產出物與機密）', user: 'learner', cwd: '/home/learner', host: 'dev-06', profile: 'artifacts', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner'), { path: '/home/learner/deploy_key', kind: 'file', mode: 0o600, owner: 'learner', content: `${DEPLOY_KEY}\n` }],
  git: { user: MEI, commits: ARTIFACTS_COMMITS, remotes: [{ url: SHOP, branches: { main: 'c2' } }], repos: [{ path: '/home/learner/shop', origin: SHOP }] },
  forge: {
    login: 'mei-lin', repos: [{
      url: SHOP, permission: 'admin', environments: ['production'],
      secrets: [{ name: 'DOCKER_TOKEN', value: CI_TOKEN, updated: '2026-11-22 01:00:00' }, { name: 'DEPLOY_KEY', value: DEPLOY_KEY, env: 'production' }],
      variables: [{ name: 'APP_ENV', value: 'dev' }, { name: 'APP_ENV', value: 'prod', env: 'production' }],
    }],
  },
  actions: { tools: ART_TOOLS },
  docker: {
    images: [{ name: 'node:22-slim', size: 200_100_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'] }],
    registries: [{ host: 'ghcr.example', users: [{ name: 'ci', token: CI_TOKEN, repos: ['island/*'] }] }],
  },
};

/** CICD06-like: dispatch Art and download its dist artifact into ~/release. */
export const downloadExercise: TerminalExercise = {
  id: 'download', title: '取回產出物', machine: 'dev-06',
  statement: '手動執行 Art，等它跑完，把 dist 這個 artifact 下載到 ~/release。',
  checks: [{ kind: 'run', repo: SHOP, workflow: 'art.yml', conclusion: 'success', artifact: 'dist' }, { kind: 'content', path: '/home/learner/release/index.html', content: '<h1>shop</h1>\n' }],
  solution: ['cd shop', 'gh workflow run art.yml', 'sleep 60', 'gh run download $(gh run list -w art.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9) -n dist -D ~/release'],
  mistakes: [{ commands: ['cd shop', 'gh workflow run art.yml', 'sleep 60'], why: '沒有下載' }],
  hints: ['gh run download 編號 -n dist -D ~/release'], explanation: 'artifact 是 run 的產出物，可以用 gh run download 取回。',
};

/** CICD08-like: store the deploy key as a production secret from a file (never on the command line). */
export const secretExercise: TerminalExercise = {
  id: 'secret', title: '設定機密', machine: 'dev-06',
  statement: '把 ~/deploy_key 設成 island/shop 的 production environment 的 secret STAGING_KEY，並刪除不再使用的 DOCKER_TOKEN。',
  checks: [{ kind: 'secret', repo: SHOP, name: 'STAGING_KEY', env: 'production' }, { kind: 'secret', repo: SHOP, name: 'DOCKER_TOKEN', absent: true }],
  solution: ['cd shop', 'gh secret set STAGING_KEY -e production < ~/deploy_key', 'gh secret delete DOCKER_TOKEN'],
  mistakes: [{ commands: ['cd shop', 'gh secret set STAGING_KEY < ~/deploy_key', 'gh secret delete DOCKER_TOKEN'], why: '設在儲存庫層級，不是 production' }],
  hints: ['gh secret set 名稱 -e production < 檔案'], explanation: '機密從檔案或標準輸入給，不寫在指令列上（會留在 shell 的歷史）。',
};

export const artifactsContent: TerminalLessonContent = { machines: [artifactsLab], examples: [], exercises: [downloadExercise, secretExercise] };
