/*
 * CICD15 DevOps 與 CI/CD 島綜合專題：從 commit 到上線 (CICD-6, challenge-stages: the terminal on the deploy-hosts profile —
 * engine stages E25 git, E26 forge, E27 workflows, E28 actions, E29 artifacts, E30 environments, E31 deploy hosts — with
 * the devops-explorer's D2 rollouts and D3 dashboards, and the challenge-stages visualization). A made-up café chain,
 * Sprout Café, on the simulated github.example: Mina Cho (the learner, gh login mina-cho, admin of sprout/orders-api), Leo
 * Park (developer; a persona that never reviews within the lesson, so he can open PR #14), Ravi Shah (reviewer persona:
 * approves each new head 20 s after it appears when src/pickup.js has the fix) and Ada Nwosu (approver of production, 120 s).
 * Six stages, each a machine in the state the earlier stages leave (one line of commits): (1) protect main (PR, 1 approval,
 * lint and test, enforce_admins), add the pull_request trigger and fix the failing pickup test through a PR; (2) Release:
 * build once, push sha-<commit> with the REGISTRY_TOKEN secret through --password-stdin, cache ~/.npm (the second run hits);
 * (3) environment variables and secrets (DEPLOY_HOST, DEPLOY_KEY from ~/keys), delete the repository-level production key,
 * protect production (Ada, prevent self-review, protected branches), run Leo's config-check (it prints toJSON(vars)); (4) fix
 * Leo's deploy-pipeline branch (write-all, deploy by tag, production without its environment) and promote the digest from
 * staging-01 to prod-01 with scripts/deploy.sh and curl smoke tests; (5) D2: a canary plan for 1.6.0 (40 ‰) whose gate
 * fails on enough samples with few errors, D3: a symptom alert on the last three hours of production (two incidents, a
 * one-minute batch spike); (6) the drill: drill/start.sh replays the day (Release deploys 1.5.0, PR #14 with 1.6.0 is merged
 * on its declared checks and review, Release deploys it; /api/pickup-slots answers 500, the smoke tests pass), the learner
 * finds the previous digest from the deployment records and the run's log and rolls back through rollback.yml; the drill's
 * dashboard gives the four incident times. The simulation keeps no earlier runs, so stages 2–6 start from declared commits
 * and stage 6 replays its two releases; prod-01 is one host while the D2 explorers model the 8-instance fleet (示意資料).
 * Engine notes: `git diff <rev> -- <path>` prints nothing on this engine and `git pull -q` is not quiet, so the transcripts
 * avoid both. Organisation, people, hosts and every token are made up; every transcript output was produced by replaying
 * it on the engine, and every explorer answer is computed by src/lib/devops.
 */
import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import type { TerminalForgeRepo } from '@/lib/terminal/forge-lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { Dashboard } from '@/lib/devops/dashboard';
import type { DevopsExercise } from '@/lib/devops/types';
import type { AppVersion, Fleet, Gate, RolloutScenario } from '@/lib/devops/rollout';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/**
 * Commands writing this text to the file with quoted here-documents: the first replaces the file (>), the others append
 * (>>). One terminal input is at most 500 characters, so a long file is written in pieces of whole lines.
 */
function heredoc(path: string, text: string): string[] {
  const out: string[] = [];
  let piece = '';
  const flush = () => { if (piece) out.push(`cat ${out.length ? '>>' : '>'} ${path} <<'EOF'\n${piece}EOF`); piece = ''; };
  for (const line of text.split('\n').slice(0, -1)) { if (piece.length + line.length + 1 > 440) flush(); piece += `${line}\n`; }
  flush();
  return out;
}

// ---- The team, the repository and the registry.
const ORDERS = 'https://github.example/sprout/orders-api.git';
const REG = 'cr.sprout.example';
const IMAGE = `${REG}/sprout/orders-api`;
const CI_TOKEN = 'lesson-registry-token-ci-1501';
const PULL_TOKEN = 'lesson-registry-token-deploy-1502';
const MINA = { name: 'Mina Cho', email: 'mina@sprout.example' };
const LEO = { name: 'Leo Park', email: 'leo@sprout.example' };

const LEARNER_KEY = keyPair('cicd15:learner', 'mina@mina-laptop');
const STAGING_KEY = keyPair('cicd15:staging-deploy', 'deploy@ci-staging');
const PROD_KEY = keyPair('cicd15:prod-deploy', 'deploy@ci-production');
const hostLine = (host: string) => `${host} ${hostKey(`cicd15-${host}`, host).publicLine.split(' ').slice(0, 2).join(' ')}`;
const KNOWN_HOSTS = `# lesson known_hosts for the Sprout deploy hosts\n${hostLine('staging-01')}\n${hostLine('prod-01')}`;

// ---- Files of the repository.
const pkg = (version: string) => `{\n  "name": "orders-api",\n  "version": "${version}",\n  "private": true,\n  "scripts": {\n    "lint": "eslint src test",\n    "test": "node --test test/"\n  }\n}\n`;
const LOCK = '{\n  "name": "orders-api",\n  "lockfileVersion": 3,\n  "packages": {\n    "node_modules/fastify": { "version": "5.1.0" },\n    "node_modules/eslint": { "version": "9.15.0", "dev": true }\n  }\n}\n';
const dockerfile = (entry: string) => `FROM node:22.11.0-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 8000\nCMD ["node", "${entry}"]\n`;
const PICKUP_OLD = "// When an order is ready to pick up.\nconst addMinutes = (t, m) => new Date(t.getTime() + m * 60000);\n\nexport const readyAt = (orderedAt, prep) => addMinutes(orderedAt, prep);\n";
const PICKUP_BUG = "// When an order is ready to pick up: preparation time plus a buffer for the counter.\nconst addMinutes = (t, m) => new Date(t.getTime() + m * 60000);\nconst PICKUP_BUFFER_MIN = 5;\n\nexport const readyAt = (orderedAt, prep) => addMinutes(orderedAt, prep);\n";
const FIX_SED = "sed -i 's/addMinutes(orderedAt, prep)/addMinutes(orderedAt, prep + PICKUP_BUFFER_MIN)/' src/pickup.js";
const PICKUP_FIXED = PICKUP_BUG.replace('addMinutes(orderedAt, prep);', 'addMinutes(orderedAt, prep + PICKUP_BUFFER_MIN);');
const FIXED = 'prep + PICKUP_BUFFER_MIN';

const job = (id: string, cmd: string) => [`  ${id}:`, '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm ci', `      - run: ${cmd}`];
const ciYml = (pullRequests: boolean) => wf('name: CI', 'on:', ...pullRequests ? ['  pull_request:', '    branches: [main]'] : [], '  push:', '    branches: [main]',
  'permissions:', '  contents: read', 'jobs:', ...job('lint', 'npm run lint'), ...job('test', 'npm test'));
const CI_PATH = '.github/workflows/ci.yml';
const TRIGGER_SED = `sed -i 's/^  push:$/  pull_request:\\n    branches: [main]\\n  push:/' ${CI_PATH}`;

// Stage 2: the release workflow (build once, push sha-<commit>, cached npm).
const RELEASE_PATH = '.github/workflows/release.yml';
const RELEASE_HEAD = ['name: Release', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', 'permissions:', '  contents: read', 'jobs:'];
const CACHE = ['      - uses: actions/cache@v4', '        with:', '          path: ~/.npm', "          key: npm-${{ hashFiles('package-lock.json') }}", '          restore-keys: npm-'];
const LOGIN = ['      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`];
const BUILD = `      - run: docker build -q -t ${IMAGE}:sha-\${{ github.sha }} .`;
const imageJob = (o: { cachePath?: string; login?: string[]; outputs?: boolean; tag?: string } = {}) => ['  image:', '    runs-on: ubuntu-latest',
  ...o.outputs ? ['    outputs:', '      digest: ${{ steps.push.outputs.digest }}'] : [], '    steps:', '      - uses: actions/checkout@v4',
  ...o.cachePath ? CACHE.map(l => l.replace('~/.npm', o.cachePath!)) : CACHE, '      - run: npm ci', '      - run: npm test',
  ...o.tag ? [BUILD.replace('sha-${{ github.sha }}', o.tag)] : [BUILD], ...o.login ?? LOGIN,
  ...o.outputs ? ['      - name: Push', '        id: push', '        run: |', `          docker push ${IMAGE}:sha-\${{ github.sha }} | tee push.log`,
    '          echo "digest=$(tail -n 1 push.log | cut -d \' \' -f 3)" >> "$GITHUB_OUTPUT"'] : [`      - run: docker push ${IMAGE}:${o.tag ?? 'sha-${{ github.sha }}'}`]];
const RELEASE_YML = wf(...RELEASE_HEAD, ...imageJob());
const releaseWith = (o: Parameters<typeof imageJob>[0]) => wf(...RELEASE_HEAD, ...imageJob(o));
const LOGIN_ARG = ['      - name: Log in to the registry', `        run: docker login ${REG} -u ci-bot -p "\${{ secrets.REGISTRY_TOKEN }}"`];

// Stage 3: the configuration check Leo wrote (prints the variables, reaches each environment's host with its key).
const CHECK_PATH = '.github/workflows/config-check.yml';
const CONFIG_CHECK = wf('name: Config check', 'on: workflow_dispatch', 'permissions:', '  contents: read', 'jobs:', '  check:', '    strategy:', '      matrix:', '        env: [staging, production]',
  '    runs-on: ubuntu-latest', '    environment: ${{ matrix.env }}', '    steps:', '      - name: Show the variables', '        env:', '          VARS: ${{ toJSON(vars) }}', '        run: echo "$VARS"',
  '      - name: SSH key', '        env:', '          KEY: ${{ secrets.DEPLOY_KEY }}', '          HOSTS: ${{ secrets.KNOWN_HOSTS }}', '        run: |', '          mkdir -p ~/.ssh',
  "          printf '%s\\n' \"$KEY\" > ~/.ssh/id_ed25519", '          chmod 600 ~/.ssh/id_ed25519', "          printf '%s\\n' \"$HOSTS\" > ~/.ssh/known_hosts",
  '      - name: Reach the deploy host', '        run: ssh deploy@${{ vars.DEPLOY_HOST }} hostname');

// Stage 4: the deploy jobs (Leo's draft has three defects the learner fixes).
const DEPLOY_SH = [
  '#!/bin/bash',
  '# Usage: bash scripts/deploy.sh HOST IMAGE',
  '# Needs DEPLOY_KEY, KNOWN_HOSTS and REGISTRY_TOKEN in the environment.',
  'set -eu',
  'host="$1"',
  'image="$2"',
  'mkdir -p ~/.ssh',
  'printf \'%s\\n\' "$DEPLOY_KEY" > ~/.ssh/id_ed25519',
  'chmod 600 ~/.ssh/id_ed25519',
  'printf \'%s\\n\' "$KNOWN_HOSTS" > ~/.ssh/known_hosts',
  `echo "$REGISTRY_TOKEN" | ssh "deploy@$host" docker login ${REG} -u deploy --password-stdin`,
  'ssh "deploy@$host" docker pull -q "$image"',
  "ssh \"deploy@$host\" 'docker rm -f web 2>/dev/null || true'",
  'ssh "deploy@$host" docker run -d --name web -p 8000:8000 "$image"',
  '',
].join('\n');
const deployJob = (o: { id: string; needs: string; env?: string; image: string }) => [`  ${o.id}:`, `    needs: ${o.needs}`, '    runs-on: ubuntu-latest',
  ...o.env ? [`    environment: ${o.env}`] : [], ...o.id === 'production' ? ['    concurrency: production'] : [], '    env:', `      IMAGE: ${o.image}`, '    steps:', '      - uses: actions/checkout@v4',
  '      - name: Deploy', '        env:', '          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}', '          KNOWN_HOSTS: ${{ secrets.KNOWN_HOSTS }}', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}',
  '        run: bash scripts/deploy.sh ${{ vars.DEPLOY_HOST }} "$IMAGE"',
  '      - name: Smoke test', '        run: |', '          curl -fsS http://${{ vars.DEPLOY_HOST }}:8000/healthz', '          curl -fsS -o /dev/null http://${{ vars.DEPLOY_HOST }}:8000/api/menu'];
const BY_TAG = `${IMAGE}:sha-\${{ github.sha }}`;
const BY_DIGEST = `${IMAGE}@\${{ needs.image.outputs.digest }}`;
const pipeline = (o: { permissions: string[]; image: string; prodEnv: boolean }) => wf('name: Release', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', ...o.permissions, 'jobs:',
  ...imageJob({ outputs: true }), ...deployJob({ id: 'staging', needs: 'image', env: 'staging', image: o.image }),
  ...deployJob({ id: 'production', needs: '[image, staging]', env: o.prodEnv ? 'production' : undefined, image: o.image }));
const PIPELINE_DRAFT = pipeline({ permissions: ['permissions: write-all'], image: BY_TAG, prodEnv: false });
const PIPELINE = pipeline({ permissions: ['permissions:', '  contents: read'], image: BY_DIGEST, prodEnv: true });
const FIX_PERMISSIONS = `sed -i 's/^permissions: write-all$/permissions:\\n  contents: read/' ${RELEASE_PATH}`;
const FIX_ENVIRONMENT = `sed -i 's/^    needs: \\[image, staging\\]$/&\\n    environment: production/' ${RELEASE_PATH}`;
const FIX_DIGEST = `sed -i 's/orders-api:sha-\\\${{ github.sha }}$/orders-api@\${{ needs.image.outputs.digest }}/' ${RELEASE_PATH}`;


// Stage 6: the 1.6.0 release (loyalty points: a new entry point breaks the pickup slots) and the team's rollback workflow.
const ROLLBACK_PATH = '.github/workflows/rollback.yml';
const ROLLBACK_YML = wf('name: Rollback', 'run-name: Roll back production to ${{ inputs.digest }}', 'on:', '  workflow_dispatch:', '    inputs:', '      digest:',
  '        description: A digest that ran in production before (sha256:...)', '        required: true', 'permissions:', '  contents: read', 'jobs:', '  rollback:',
  '    runs-on: ubuntu-latest', '    environment: production', '    concurrency: production', '    steps:', '      - name: Check the digest', '        env:', '          DIGEST: ${{ inputs.digest }}',
  '        run: echo "$DIGEST" | grep -Eqx \'sha256:[0-9a-f]{64}\' || { echo "::error::digest must be sha256:<64 hex digits>, not a tag"; exit 1; }',
  '      - uses: actions/checkout@v4', '      - name: Deploy', '        env:', '          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}', '          KNOWN_HOSTS: ${{ secrets.KNOWN_HOSTS }}',
  '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}', `        run: bash scripts/deploy.sh \${{ vars.DEPLOY_HOST }} ${IMAGE}@\${{ inputs.digest }}`,
  '      - name: Smoke test', '        run: |', '          curl -fsS http://${{ vars.DEPLOY_HOST }}:8000/healthz', '          curl -fsS -o /dev/null http://${{ vars.DEPLOY_HOST }}:8000/api/menu',
  '          curl -fsS -o /dev/null http://${{ vars.DEPLOY_HOST }}:8000/api/pickup-slots');
const MAIN_JS = "// Starts the server with the loyalty points (1.6.0).\nimport './loyalty.js';\nimport './server.js';\n";
const LOYALTY_JS = '// Loyalty points: 1 point per 10 dollars, shown with the pickup slots.\n';

// ---- Git history: one line of commits; each stage starts from the state the earlier stages left.
const T = (d: string) => `2026-${d}:00`;
const COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', author: LEO, time: T('10-06 02:00'), files: {
    'README.md': '# orders-api\n\nOnline ordering and pickup for Sprout Café.\n', 'package.json': pkg('1.4.0'), 'package-lock.json': LOCK, '.gitignore': 'node_modules/\n',
    Dockerfile: dockerfile('src/server.js'), '.dockerignore': '.git\n.github\nnode_modules\n', 'eslint.config.js': 'export default [{ rules: { "no-unused-vars": "error" } }];\n',
    'src/server.js': '// GET /healthz, GET /api/menu, GET /api/pickup-slots, POST /api/orders\nimport { start } from \'./app.js\';\nstart(8000);\n',
    'src/app.js': '// routes of the ordering API\n', 'src/pickup.js': PICKUP_OLD,
    'test/pickup.test.js': "test('an order made at 12:00 with 10 minutes of prep is ready at 12:15')\n", 'test/menu.test.js': "test('lists today\\'s drinks and pastries')\n" } },
  { id: 'c2', message: 'Run lint and the tests on every push to main', author: LEO, time: T('11-10 02:00'), files: { [CI_PATH]: ciYml(false) } },
  // The learner's branch: the buffer is declared but not used (lint fails) and the test still expects 12:15 (test fails).
  { id: 'f1', parents: ['c2'], message: 'Add a pickup buffer to the ready time', author: MINA, time: T('11-24 09:00'), files: { 'package.json': pkg('1.5.0'), 'src/pickup.js': PICKUP_BUG } },
  { id: 's1', parents: ['c2'], message: 'Add a pickup buffer to the ready time (#7)', author: MINA, time: T('11-25 02:00'),
    files: { 'package.json': pkg('1.5.0'), 'src/pickup.js': PICKUP_FIXED, [CI_PATH]: ciYml(true) } },
  { id: 's2', message: 'Build and push an image for every commit on main (#8)', author: MINA, time: T('11-25 06:00'), files: { [RELEASE_PATH]: RELEASE_YML } },
  { id: 's3', message: 'Check the configuration of each deploy environment (#9)', author: LEO, time: T('11-25 08:00'), files: { [CHECK_PATH]: CONFIG_CHECK } },
  { id: 'd1', message: 'Deploy to staging and production', author: LEO, time: T('11-26 07:00'), files: { [RELEASE_PATH]: PIPELINE_DRAFT, 'scripts/deploy.sh': DEPLOY_SH }, executable: ['scripts/deploy.sh'] },
  { id: 's4', parents: ['s3'], message: 'Deploy to staging and production (#10)', author: LEO, time: T('11-26 09:00'), files: { [RELEASE_PATH]: PIPELINE, 'scripts/deploy.sh': DEPLOY_SH }, executable: ['scripts/deploy.sh'] },
  { id: 's5', message: 'Add a rollback workflow that redeploys a digest (#12)', author: MINA, time: T('11-27 03:00'), files: { [ROLLBACK_PATH]: ROLLBACK_YML } },
  { id: 'r16', message: 'Release 1.6.0: loyalty points', author: LEO, time: T('11-29 08:00'), files: {
    'package.json': pkg('1.6.0'), Dockerfile: dockerfile('src/main.js'), 'src/main.js': MAIN_JS, 'src/loyalty.js': LOYALTY_JS } },
];

// ---- CI tools (lesson-declared results), images, responders.
const TEST_OK = '> orders-api@1.5.0 test\n> node --test test/\n\n✔ an order made at 12:00 with 10 minutes of prep is ready at 12:15 (1.2ms)\n✔ lists today\'s drinks and pastries (0.8ms)\nℹ tests 31\nℹ pass 31\nℹ fail 0';
const TEST_FAIL = '> orders-api@1.5.0 test\n> node --test test/\n\n✖ an order made at 12:00 with 10 minutes of prep is ready at 12:15 (1.9ms)\n  AssertionError: Expected "12:15", received "12:10"\n✔ lists today\'s drinks and pastries (0.8ms)\nℹ tests 31\nℹ pass 30\nℹ fail 1';
const BUGGY = [{ path: 'src/pickup.js', includes: 'const PICKUP_BUFFER_MIN' }, { path: 'src/pickup.js', excludes: FIXED }];
const TOOLS: TerminalCiTool[] = [
  { command: 'npm ci', cache: '~/.npm', cases: [
    { when: [{ path: 'package-lock.json' }, { path: '~/.npm' }], stdout: 'added 186 packages, and audited 187 packages in 4s\n\nfound 0 vulnerabilities', seconds: 5, cachedSeconds: 5 },
    { when: [{ path: 'package-lock.json' }], stdout: 'added 186 packages, and audited 187 packages in 27s\n\nfound 0 vulnerabilities', seconds: 28 },
    { stderr: 'npm error code EUSAGE\nnpm error The `npm ci` command can only install with an existing package-lock.json', exit: 1, seconds: 1 },
  ] },
  { command: 'npm run lint', where: 'runner', cases: [
    { when: BUGGY, exit: 1, seconds: 4, stdout: "> orders-api@1.5.0 lint\n> eslint src test\n\n/home/runner/work/orders-api/orders-api/src/pickup.js\n  3:7  error  'PICKUP_BUFFER_MIN' is assigned a value but never used  no-unused-vars\n\n✖ 1 problem (1 error, 0 warnings)" },
    { stdout: '> orders-api@1.5.0 lint\n> eslint src test', seconds: 4 },
  ] },
  { command: 'npm test', cases: [{ when: BUGGY, exit: 1, seconds: 6, stdout: TEST_FAIL }, { stdout: TEST_OK, seconds: 6 }] },
];
const NODE: TerminalImage = { name: 'node:22.11.0-slim', size: 201_300_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'],
  env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.11.0'] };
const OLD: TerminalImage = { name: `${IMAGE}:1.4.0`, size: 196_000_000, created: '2026-10-20 06:00:00', workdir: '/app', cmd: ['node', 'src/server.js'], expose: [8000], service: true,
  http: { port: 8000, responder: 'orders-140' }, logs: ['orders-api 1.4.0 listening on :8000'] };
const MENU = '[{"id":"latte","price":4.5},{"id":"scone","price":3.2}]\n';
const SLOTS = '[{"at":"12:15","free":4},{"at":"12:30","free":6}]\n';
const responder = (id: string, version: string, broken = false) => ({ id, server: 'node', routes: [
  { path: '/', type: 'application/json', body: `{"service":"orders-api","version":"${version}"}\n` }, { path: '/healthz', body: 'ok\n' },
  { path: '/api/menu', type: 'application/json', body: MENU },
  broken ? { path: '/api/pickup-slots', status: 500, type: 'application/json', body: '{"error":"internal server error"}\n' } : { path: '/api/pickup-slots', type: 'application/json', body: SLOTS }] });

// ---- Deploy hosts: deploy (docker group) with the CI key of its environment and the learner's key; web runs 1.4.0.
const deployHost = (name: string, address: string, ciKey: { publicLine: string }): TerminalRemote => ({
  host: name, address, hostKey: `cicd15-${name}`, runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [dir('/home', 'root'), dir('/home/deploy', 'deploy', 0o750), dir('/home/deploy/.ssh', 'deploy', 0o700),
    file('/home/deploy/.ssh/authorized_keys', `${ciKey.publicLine}\n${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600)],
  docker: {
    images: [{ ...OLD, pulled: true }],
    containers: [{ name: 'web', image: `${IMAGE}:1.4.0`, state: 'running', created: '2026-10-21 01:30:00', started: '2026-10-21 01:30:00', ports: ['8000:8000'] }],
  },
});

/** The state each stage starts from (earlier stages done as the lesson says). */
type Stage = 'ci' | 'image' | 'config' | 'deploy' | 'drill';
const ORDER: Stage[] = ['ci', 'image', 'config', 'deploy', 'drill'];
const after = (s: Stage, t: Stage) => ORDER.indexOf(s) > ORDER.indexOf(t);
const MAIN: Record<Stage, string> = { ci: 'c2', image: 's1', config: 's3', deploy: 's3', drill: 's5' };
const ENV_SECRETS: NonNullable<TerminalForgeRepo['secrets']> = [
  { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd15:staging-deploy', comment: 'deploy@ci-staging' }, env: 'staging', updated: '2026-11-25 09:00:00' },
  { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd15:prod-deploy', comment: 'deploy@ci-production' }, env: 'production', updated: '2026-11-25 09:00:00' },
];
function forgeRepo(s: Stage): TerminalForgeRepo {
  const configured = after(s, 'config');
  return {
    url: ORDERS, description: 'Online ordering and pickup for Sprout Café', permission: 'admin',
    ...s === 'ci' ? {} : { protection: [{ branch: 'main', approvals: 1, checks: ['lint', 'test'], strict: true, enforceAdmins: true }] },
    personas: [{ login: 'ravi-shah', name: 'Ravi Shah', after: 20, review: 'approve', body: 'Looks good to me.', when: { path: 'src/pickup.js', includes: FIXED },
      otherwise: { review: 'request-changes', body: 'readyAt still ignores PICKUP_BUFFER_MIN: an order made at 12:00 with 10 minutes of prep should be ready at 12:15.' } },
      // Leo opens pull requests (the drill's #14); within the lesson's time he never reviews.
      { login: 'leo-park', name: 'Leo Park', after: 30 * 86400, review: 'comment', body: 'Thanks!' }],
    ...s === 'drill' ? {
      checks: [{ context: 'lint', conclusion: 'success', commit: 'r16' }, { context: 'test', conclusion: 'success', commit: 'r16' }],
      pulls: [{ number: 14, head: 'release-1.6.0', title: 'Release 1.6.0: loyalty points', body: 'Loyalty points next to the pickup slots.', author: 'leo-park', created: '2026-11-29 08:10:00',
        reviews: [{ by: 'ravi-shah', review: 'approve', body: 'Looks good to me.', time: '2026-11-29 09:00:00' }] }], next: 15,
    } : { next: s === 'ci' ? 7 : s === 'image' ? 8 : 10 },
    secrets: [
      { name: 'REGISTRY_TOKEN', value: CI_TOKEN, updated: '2026-11-25 05:00:00' },
      ...after(s, 'image') ? [{ name: 'REGISTRY_PULL_TOKEN', value: PULL_TOKEN, updated: '2026-11-25 07:00:00' }, { name: 'KNOWN_HOSTS', value: KNOWN_HOSTS, updated: '2026-11-25 07:00:00' }] : [],
      // Before stage 3 the production key is a repository secret: every workflow job can read it.
      ...s === 'config' ? [{ name: 'DEPLOY_KEY', sshKey: { seed: 'cicd15:prod-deploy', comment: 'deploy@ci-production' }, updated: '2026-11-25 07:00:00' }] : [],
      ...configured ? ENV_SECRETS : [],
    ],
    ...after(s, 'image') ? { environments: ['staging', 'production'] } : {},
    ...configured ? {
      variables: [{ name: 'DEPLOY_HOST', value: 'staging-01', env: 'staging', updated: '2026-11-25 09:00:00' }, { name: 'DEPLOY_HOST', value: 'prod-01', env: 'production', updated: '2026-11-25 09:00:00' }],
      environmentRules: [{ name: 'production', reviewers: ['ada-nwosu'], preventSelfReview: true, branches: 'protected' }],
    } : {},
    ...after(s, 'image') ? { approvers: [{ login: 'ada-nwosu', name: 'Ada Nwosu', after: 120, comment: 'Approved for production.' }] } : {},
  };
}

const machine = (s: Stage, title: string, extra: TerminalFile[] = []): TerminalMachine => ({
  id: `cicd15-${s}`, title, user: 'learner', cwd: '/home/learner', host: 'mina-laptop', profile: 'deploy-hosts',
  timezone: 'Asia/Taipei', now: s === 'drill' ? '2026-11-30 06:00:00' : '2026-11-26 01:00:00',
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  files: [dir('/home', 'root'), dir('/home/learner'), dir('/home/learner/.ssh', 'learner', 0o700), file('/home/learner/.ssh/id_ed25519', LEARNER_KEY.privateText, 'learner', 0o600),
    file('/home/learner/.ssh/known_hosts', `${KNOWN_HOSTS}\n`), ...extra],
  git: {
    user: MINA, commits: COMMITS,
    remotes: [{ url: ORDERS, branches: { main: MAIN[s], ...s === 'deploy' ? { 'deploy-pipeline': 'd1' } : {}, ...s === 'drill' ? { 'release-1.6.0': 'r16' } : {} } }],
    repos: [{ path: '/home/learner/orders-api', origin: ORDERS, ...s === 'ci' ? { branches: { main: 'c2', 'pickup-window': 'f1' }, head: 'main' } : {} }],
  },
  forge: { login: 'mina-cho', name: 'Mina Cho', repos: [forgeRepo(s)] },
  actions: { tools: TOOLS },
  responders: [responder('orders-140', '1.4.0'), responder('orders-150', '1.5.0'), responder('orders-160', '1.6.0', true)],
  docker: {
    images: [NODE, OLD],
    programs: [
      { command: ['node', 'src/server.js'], service: true, logs: ['orders-api listening on :8000'], http: { port: 8000, responder: 'orders-150' } },
      { command: ['node', 'src/main.js'], service: true, logs: ['orders-api listening on :8000 (loyalty points on)'], http: { port: 8000, responder: 'orders-160' } },
    ],
    registries: [{ host: REG, users: [{ name: 'ci-bot', token: CI_TOKEN, repos: ['sprout/*'] }, { name: 'deploy', token: PULL_TOKEN, push: false, repos: ['sprout/*'] }] }],
  },
  ...after(s, 'image') ? { remotes: [deployHost('staging-01', '10.40.0.11', STAGING_KEY), deployHost('prod-01', '10.40.0.21', PROD_KEY)] } : {},
});

const KEY_FILES = [dir('/home/learner/keys', 'learner', 0o700), file('/home/learner/keys/staging-deploy', STAGING_KEY.privateText, 'learner', 0o600),
  file('/home/learner/keys/prod-deploy', PROD_KEY.privateText, 'learner', 0o600)];
const LATEST = (w: string) => `$(gh run list -w ${w} -L 1 --json databaseId | grep databaseId | tr -dc 0-9)`;
const DRILL_README = [
  '# 回滾演練：1.6.0 讓取餐時段打不開', '', '這是 production 的演練複本，時鐘撥到 2026-11-30 14:00（UTC+8）。', '',
  '1. bash ~/drill/start.sh 重現當天的兩次發布：Release 先部署 main 的 1.5.0，再合併 1.6.0 的 PR #14，Release 再部署一次。',
  '2. 你是值班的人：查證、經由 rollback.yml 回滾到上一個 digest、確認恢復。', '',
  '- staging-01、prod-01：deploy 帳號，容器 web（8000 埠）', '- 使用者的請求：http://prod-01:8000/api/pickup-slots', '',
].join('\n');
const START_SH = ['#!/bin/bash', '# 重現 11-30 的兩次發布：Release 先部署 main 的 1.5.0，再合併 1.6.0 的 PR #14（Release 再部署一次）。', 'set -eu', 'cd ~/orders-api',
  'gh workflow run release.yml > /dev/null', `gh run watch "${LATEST('release.yml')}" > /dev/null`, 'gh pr merge 14 --squash > /dev/null 2>&1', `gh run watch "${LATEST('release.yml')}" > /dev/null`,
  'echo "演練開始：1.6.0 已經部署到 production，櫃台回報取餐時段打不開。"', ''].join('\n');
const DRILL_FILES = [dir('/home/learner/drill'), file('/home/learner/drill/README.md', DRILL_README), file('/home/learner/drill/start.sh', START_SH, 'learner', 0o755)];
const ciLab = machine('ci', 'mina-laptop（第一關：pickup-window 分支還沒推送，main 沒有保護）');
const imageLab = machine('image', 'mina-laptop（第二關：main 受保護，CI 在 PR 上執行）');
const configLab = machine('config', 'mina-laptop（第三關：release.yml 已上線，部署環境還沒設定）', KEY_FILES);
const deployLab = machine('deploy', 'mina-laptop（第四關：環境已設定，Leo 推送了 deploy-pipeline 分支）');
const drillLab = machine('drill', 'mina-laptop（第六關：回滾演練）', DRILL_FILES);

// ---- Stage 5 (D2): the production fleet behind the load balancer, 1.6.0 (the pickup-slots bug) and 1.6.1 (fixed). 示意資料.
const FLEET: Fleet = { instances: 8, capacityRpm: 250, rpm: 1600 };
const V150: AppVersion = { id: 'v150', label: '1.5.0', errorPermille: 1, p95Ms: 180, startSeconds: 60 };
const V160: AppVersion = { id: 'v160', label: '1.6.0', errorPermille: 40, p95Ms: 190, startSeconds: 60 };
const V161: AppVersion = { id: 'v161', label: '1.6.1', errorPermille: 2, p95Ms: 185, startSeconds: 60 };
const GATE: Gate = { metric: 'error-rate', max: 10, minRequests: 400 };
/** Leo's first proposal: a quarter of the traffic for 5 minutes, then everything. */
const LEO_PLAN = { kind: 'canary' as const, steps: [{ weight: 25, holdMinutes: 5 }, { weight: 100, holdMinutes: 5 }] };
/** The plan the team adopted (the exercise's reference is another way to pass). */
const TEAM_PLAN = { kind: 'canary' as const, steps: [{ weight: 10, holdMinutes: 5 }, { weight: 50, holdMinutes: 5 }, { weight: 100, holdMinutes: 5 }] };
const canary160: RolloutScenario = { fleet: FLEET, from: V150, to: V160, strategy: LEO_PLAN, gate: GATE, minutes: 20 };
const canary161: RolloutScenario = { ...canary160, to: V161, strategy: TEAM_PLAN };

// ---- Stage 5 (D3): the last three hours of production (minute 0 = 11:00, UTC+8). 示意資料.
const productionBoard = (): Dashboard => ({
  service: 'orders-api（production）', minutes: 180,
  series: [
    { id: 'errors', label: '訂單請求的錯誤率', unit: '‰', signal: 'errors', shape: { seed: 1501, baseline: 3, noise: 2, changes: [
      { kind: 'spike', at: 50, minutes: 16, delta: 30 }, { kind: 'spike', at: 110, minutes: 1, delta: 35 }, { kind: 'spike', at: 150, minutes: 8, delta: 14 }] } },
    { id: 'rpm', label: '每分鐘請求', unit: '個', signal: 'traffic', shape: { seed: 1502, baseline: 1600, noise: 60, changes: [{ kind: 'ramp', from: 60, to: 90, delta: 300 }] } },
    { id: 'p95', label: 'p95 延遲', unit: 'ms', signal: 'latency', shape: { seed: 1503, baseline: 180, noise: 15, changes: [{ kind: 'spike', at: 50, minutes: 16, delta: 260 }] } },
    { id: 'cpu', label: 'CPU 使用率', unit: '%', signal: 'saturation', shape: { seed: 1504, baseline: 45, noise: 5, changes: [{ kind: 'spike', at: 110, minutes: 3, delta: 40 }] } },
  ],
  incidents: [
    { id: 'payments', label: '付款服務逾時', start: 50, end: 66 },
    { id: 'db-failover', label: '資料庫主機切換', start: 150, end: 158 },
  ],
  rules: [{ id: 'cpu-high', label: '（舊規則）CPU 超過 70%，持續 1 分鐘', series: 'cpu', op: '>', threshold: 70, forMinutes: 1, severity: 'warning' }],
});

// ---- Stage 6 (D3): the drill's monitoring (minute 0 = 14:00 on 11-30, UTC+8; the practice copy with replayed traffic). 示意資料.
const drillBoard = (): Dashboard => ({
  service: 'orders-api（演練複本）', minutes: 60,
  series: [
    { id: 'errors', label: '訂單請求的錯誤率', unit: '‰', signal: 'errors', shape: { seed: 1505, baseline: 3, noise: 2, changes: [{ kind: 'spike', at: 5, minutes: 12, delta: 45 }, { kind: 'spike', at: 17, minutes: 1, delta: 15 }] } },
    { id: 'rpm', label: '每分鐘請求', unit: '個', signal: 'traffic', shape: { seed: 1506, baseline: 1500, noise: 50 } },
  ],
  incidents: [{ id: 'drill-160', label: '演練：1.6.0 讓取餐時段回應 500', start: 5, end: 18, events: [
    { at: 5, kind: 'note', text: '14:05 合併 PR #14，Release 把 1.6.0 部署到 production，冒煙測試通過' },
    { at: 6, kind: 'detected', text: '14:06 告警「錯誤率超過 12‰，持續 1 分鐘」觸發，呼叫值班的 Mina' },
    { at: 9, kind: 'acknowledged', text: '14:09 Mina 確認接手（通知響時她正在開會）' },
    { at: 11, kind: 'note', text: '14:11 /api/pickup-slots 回 500；部署紀錄的上一筆是 1.5.0 的 run' },
    { at: 13, kind: 'note', text: '14:13 以 rollback.yml 觸發回滾到 1.5.0 的 digest，等待 production 的核准' },
    { at: 15, kind: 'note', text: '14:15 Ada 核准' },
    { at: 16, kind: 'mitigated', text: '14:16 Rollback 完成，冒煙測試（含取餐時段）通過' },
    { at: 18, kind: 'note', text: '14:18 錯誤率回到平常的水準' },
    { at: 40, kind: 'resolved', text: '14:40 演練結束，開始寫紀錄' },
  ] }],
  rules: [{ id: 'errors-12', label: '錯誤率超過 12‰，持續 1 分鐘', series: 'errors', op: '>', threshold: 12, forMinutes: 1, severity: 'critical' }],
});

// ---- Examples (every output was produced by replaying the commands on the engine).
const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd15-ex-start', title: "起點：main 沒有保護，CI 只在推送到 main 時執行", machine: 'cicd15-ci',
    description: "看 main 與你的分支 pickup-window 的歷史、CI 的觸發條件與 main 的保護規則（沒有），再看分支改了什麼：宣告了 PICKUP_BUFFER_MIN 卻沒有用到，本機的單元測試失敗。",
    steps: [
      { command: "cd orders-api", output: "" },
      { command: "git log --oneline --graph --all", output: "* 76e0a16 (pickup-window) Add a pickup buffer to the ready time\n* 3324d9d (HEAD -> main, origin/main, origin/HEAD) Run lint and the tests on every push to main\n* 2fb12d1 Initial commit" },
      { command: "cat .github/workflows/ci.yml", output: "name: CI\non:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm run lint\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npm test" },
      { command: "gh api repos/{owner}/{repo}/branches/main/protection", output: "{\n  \"message\": \"Branch not protected\",\n  \"documentation_url\": \"https://docs.github.com/rest/branches/branch-protection#get-branch-protection\",\n  \"status\": \"404\"\n}\ngh: Branch not protected (HTTP 404)" },
      { command: "git switch pickup-window", output: "Switched to branch 'pickup-window'" },
      { command: "git diff main", output: "diff --git a/package.json b/package.json\nindex 7bc335f..8881c71 100644\n--- a/package.json\n+++ b/package.json\n@@ -1,6 +1,6 @@\n {\n   \"name\": \"orders-api\",\n-  \"version\": \"1.4.0\",\n+  \"version\": \"1.5.0\",\n   \"private\": true,\n   \"scripts\": {\n     \"lint\": \"eslint src test\",\ndiff --git a/src/pickup.js b/src/pickup.js\nindex 7e22d6a..2426ccd 100644\n--- a/src/pickup.js\n+++ b/src/pickup.js\n@@ -1,4 +1,5 @@\n-// When an order is ready to pick up.\n+// When an order is ready to pick up: preparation time plus a buffer for the counter.\n const addMinutes = (t, m) => new Date(t.getTime() + m * 60000);\n+const PICKUP_BUFFER_MIN = 5;\n \n export const readyAt = (orderedAt, prep) => addMinutes(orderedAt, prep);" },
      { command: "npm test", output: "> orders-api@1.5.0 test\n> node --test test/\n\n✖ an order made at 12:00 with 10 minutes of prep is ready at 12:15 (1.9ms)\n  AssertionError: Expected \"12:15\", received \"12:10\"\n✔ lists today's drinks and pastries (0.8ms)\nℹ tests 31\nℹ pass 30\nℹ fail 1" },
    ],
  },
  {
    id: 'cicd15-ex-unguarded', title: "沒有守門的 main：紅色的 PR 照樣合併", machine: 'cicd15-ci',
    description: "照現況推送分支、開 PR：CI 不在 PR 上執行，PR 沒有任何檢查，也沒有規則要求檢查或核准，合併一下就成功了；合併後 main 的 CI 才執行，lint 與 test 都失敗，壞掉的程式已經在 main 上。",
    steps: [
      { command: "cd orders-api", output: "" },
      { command: "git switch pickup-window", output: "Switched to branch 'pickup-window'" },
      { command: "git push -q -u origin pickup-window", output: "remote: \nremote: Create a pull request for 'pickup-window' on GitHub by visiting:\nremote:      https://github.example/sprout/orders-api/pull/new/pickup-window\nremote: \nTo https://github.example/sprout/orders-api.git\n * [new branch]      pickup-window -> pickup-window\nbranch 'pickup-window' set up to track 'origin/pickup-window'." },
      { command: "gh pr create -t 'Add a pickup buffer to the ready time' -b 'The ready time is the preparation time plus 5 minutes.'", output: "\nCreating pull request for pickup-window into main in sprout/orders-api\n\nhttps://github.example/sprout/orders-api/pull/7" },
      { command: "gh pr checks", output: "no checks reported on the 'pickup-window' branch" },
      { command: "gh pr merge --squash --delete-branch", output: "✓ Squashed and merged pull request sprout/orders-api#7 (Add a pickup buffer to the ready time)\nFrom https://github.example/sprout/orders-api\n * branch            main       -> FETCH_HEAD\n   3324d9d..1bb0c33  main       -> origin/main\nUpdating 3324d9d..1bb0c33\nFast-forward\n package.json  | 2 +-\n src/pickup.js | 3 ++-\n 2 files changed, 3 insertions(+), 2 deletions(-)\n✓ Deleted local branch pickup-window and switched to branch main\n✓ Deleted remote branch pickup-window" },
      { command: "gh run watch $(gh run list -w ci.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)", output: "Refreshing run status every 3 seconds. Press Ctrl+C to quit.\n\nX main CI · 4100000001\nTriggered via push less than a minute ago\n\nJOBS\nX lint in 34s (ID 11300000001)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  X Run npm run lint\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\nX test in 36s (ID 11300000002)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ Run npm ci\n  X Run npm test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n\nANNOTATIONS\nX Process completed with exit code 1.\nlint: .github#4\n\nX Process completed with exit code 1.\ntest: .github#4\n\nX Run CI (4100000001) completed with 'failure'" },
    ],
  },
  {
    id: 'cicd15-ex-config', title: "設定還沒到位：Leo 的設定檢查失敗", machine: 'cicd15-config',
    description: "儲存庫層級有 production 的 DEPLOY_KEY，環境卻沒有任何 variable；執行 Leo 的 config-check，兩個環境的 job 都不知道要連到哪一台主機。",
    steps: [
      { command: "cd orders-api", output: "" },
      { command: "gh secret list", output: "NAME                 UPDATED\nDEPLOY_KEY           about 18 hours ago\nKNOWN_HOSTS          about 18 hours ago\nREGISTRY_PULL_TOKEN  about 18 hours ago\nREGISTRY_TOKEN       about 20 hours ago" },
      { command: "gh variable list -e production", output: "no variables found" },
      { command: "gh workflow run config-check.yml", output: "✓ Created workflow_dispatch event for config-check.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"config-check.yml\"" },
      { command: "gh run watch $(gh run list -w config-check.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9) > /dev/null", output: "" },
      { command: "gh run view 4100000001 --log-failed | cut -f 1,3 | grep -E 'Run ssh|ssh:'", output: "check (staging)\t2026-11-26T01:00:03.0000000Z ##[group]Run ssh deploy@ hostname\ncheck (staging)\t2026-11-26T01:00:03.0000000Z ssh: Could not resolve hostname : Name or service not known\ncheck (production)\t2026-11-26T01:00:03.0000000Z ##[group]Run ssh deploy@ hostname\ncheck (production)\t2026-11-26T01:00:03.0000000Z ssh: Could not resolve hostname : Name or service not known" },
    ],
  },
  {
    id: 'cicd15-ex-draft', title: "Leo 的部署管線草稿", machine: 'cicd15-deploy',
    description: "切到 deploy-pipeline 分支，找出 workflow 的權限、每個 job 的 environment 與部署的 IMAGE，看 deploy.sh 做了什麼，再確認 production 環境的保護規則與變數（第三關已經設定好）。",
    steps: [
      { command: "cd orders-api", output: "" },
      { command: "git switch deploy-pipeline", output: "branch 'deploy-pipeline' set up to track 'origin/deploy-pipeline'.\nSwitched to a new branch 'deploy-pipeline'\nYour branch is up to date with 'origin/deploy-pipeline'." },
      { command: "grep -n -E '^permissions|environment:|IMAGE:|needs:' .github/workflows/release.yml", output: "6:permissions: write-all\n32:    needs: image\n34:    environment: staging\n36:      IMAGE: cr.sprout.example/sprout/orders-api:sha-${{ github.sha }}\n50:    needs: [image, staging]\n54:      IMAGE: cr.sprout.example/sprout/orders-api:sha-${{ github.sha }}" },
      { command: "cat scripts/deploy.sh", output: "#!/bin/bash\n# Usage: bash scripts/deploy.sh HOST IMAGE\n# Needs DEPLOY_KEY, KNOWN_HOSTS and REGISTRY_TOKEN in the environment.\nset -eu\nhost=\"$1\"\nimage=\"$2\"\nmkdir -p ~/.ssh\nprintf '%s\\n' \"$DEPLOY_KEY\" > ~/.ssh/id_ed25519\nchmod 600 ~/.ssh/id_ed25519\nprintf '%s\\n' \"$KNOWN_HOSTS\" > ~/.ssh/known_hosts\necho \"$REGISTRY_TOKEN\" | ssh \"deploy@$host\" docker login cr.sprout.example -u deploy --password-stdin\nssh \"deploy@$host\" docker pull -q \"$image\"\nssh \"deploy@$host\" 'docker rm -f web 2>/dev/null || true'\nssh \"deploy@$host\" docker run -d --name web -p 8000:8000 \"$image\"" },
      { command: "gh api repos/{owner}/{repo}/environments/production | grep -E '\"(login|prevent_self_review|protected_branches)\"'", output: "      \"prevent_self_review\": true,\n            \"login\": \"ada-nwosu\",\n    \"protected_branches\": true," },
      { command: "gh variable list -e production", output: "NAME         VALUE    UPDATED\nDEPLOY_HOST  prod-01  about 16 hours ago" },
    ],
  },
  {
    id: 'cicd15-ex-drill', title: "重現 1.6.0 的發布：冒煙測試通過，取餐時段卻回 500", machine: 'cicd15-drill',
    description: "執行演練腳本重現兩次發布；production 現在跑 1.6.0，/api/pickup-slots 回 500。從 production 的部署紀錄找出上一筆部署，以及它來自哪個 run。",
    steps: [
      { command: "cat drill/README.md", output: "# 回滾演練：1.6.0 讓取餐時段打不開\n\n這是 production 的演練複本，時鐘撥到 2026-11-30 14:00（UTC+8）。\n\n1. bash ~/drill/start.sh 重現當天的兩次發布：Release 先部署 main 的 1.5.0，再合併 1.6.0 的 PR #14，Release 再部署一次。\n2. 你是值班的人：查證、經由 rollback.yml 回滾到上一個 digest、確認恢復。\n\n- staging-01、prod-01：deploy 帳號，容器 web（8000 埠）\n- 使用者的請求：http://prod-01:8000/api/pickup-slots" },
      { command: "bash drill/start.sh", output: "演練開始：1.6.0 已經部署到 production，櫃台回報取餐時段打不開。" },
      { command: "cd orders-api", output: "" },
      { command: "gh run list -L 3", output: "STATUS  TITLE                                WORKFLOW  BRANCH  EVENT              ID          ELAPSED  AGE\n✓       Release 1.6.0: loyalty points (#14)  Release   main    push               4100000003  2m24s    about 2 minutes ago\n✓       Release 1.6.0: loyalty points (#14)  CI        main    push               4100000002  38s      about 2 minutes ago\n✓       Release                              Release   main    workflow_dispatch  4100000001  2m48s    about 5 minutes ago" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"orders-api\",\"version\":\"1.6.0\"}" },
      { command: "curl -s -o /dev/null -w '%{http_code}\\n' http://prod-01:8000/api/pickup-slots", output: "500" },
      { command: "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep -E '^    \"(id|sha|created_at)\"'", output: "    \"id\": 1900000004,\n    \"sha\": \"1c621d1ff65ea3848079187ff8ec6d9705e4def9\",\n    \"created_at\": \"2026-11-30T06:03:08Z\",\n    \"id\": 1900000002,\n    \"sha\": \"9736f310940acc6fbab1ec0fc68e73f78c58559f\",\n    \"created_at\": \"2026-11-30T06:00:44Z\"," },
      { command: "gh api repos/{owner}/{repo}/deployments/1900000002/statuses | grep -E '\"(state|log_url)\"' | head -n 4", output: "    \"state\": \"inactive\",\n    \"log_url\": \"https://github.example/sprout/orders-api/actions/runs/4100000001/job/11300000003\"\n    \"state\": \"success\",\n    \"log_url\": \"https://github.example/sprout/orders-api/actions/runs/4100000001/job/11300000003\"" },
    ],
  },
];

// ---- Exercises: each starts from its stage's machine as declared.
const WATCH = (w: string) => `gh run watch ${LATEST(w)} > /dev/null`;
const MERGE = ['gh pr checks --watch', 'gh pr merge --squash --delete-branch'];
const PROTECTION_JSON = '{\n  "required_status_checks": { "strict": true, "contexts": ["lint", "test"] },\n  "enforce_admins": true,\n  "required_pull_request_reviews": { "required_approving_review_count": 1 },\n  "restrictions": null\n}\n';
const PROTECT = [`cat > ~/protection.json <<'EOF'\n${PROTECTION_JSON}EOF`, 'gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input ~/protection.json --silent'];
const COMMIT1 = "git commit -qam 'Run CI on pull requests; use the pickup buffer'";
const PR1 = [COMMIT1, 'git push -q -u origin pickup-window',
  "gh pr create -t 'Add a pickup buffer to the ready time' -b 'The ready time is the preparation time plus 5 minutes; CI now runs on pull requests.'"];
const CI_SOLUTION = ['cd orders-api', ...PROTECT, 'git switch pickup-window', TRIGGER_SED, FIX_SED, ...PR1, ...MERGE];

const PR2 = (yml: string) => ['cd orders-api', 'git switch -c release-image', ...heredoc(RELEASE_PATH, yml), `git add ${RELEASE_PATH}`, "git commit -qm 'Build and push an image for every commit on main'",
  'git push -q -u origin release-image', "gh pr create -t 'Build and push an image for every commit on main' -b 'One image per commit on main, tagged sha-<commit>; npm downloads are cached.'", ...MERGE, WATCH('release.yml')];
const AGAIN = ['gh workflow run release.yml', WATCH('release.yml')];
const IMAGE_SOLUTION = [...PR2(RELEASE_YML), ...AGAIN];

const ENV_JSON = '{\n  "reviewers": [{ "type": "User", "id": 2003 }],\n  "prevent_self_review": true,\n  "deployment_branch_policy": { "protected_branches": true, "custom_branch_policies": false }\n}\n';
const SET_HOSTS = ['gh variable set DEPLOY_HOST -e staging --body staging-01', 'gh variable set DEPLOY_HOST -e production --body prod-01'];
const SET_KEYS = ['gh secret set DEPLOY_KEY -e staging < ~/keys/staging-deploy', 'gh secret set DEPLOY_KEY -e production < ~/keys/prod-deploy'];
const PROTECT_PROD = [`cat > ~/production.json <<'EOF'\n${ENV_JSON}EOF`, 'gh api -X PUT repos/{owner}/{repo}/environments/production --input ~/production.json --silent'];
const CHECK_RUN = ['gh workflow run config-check.yml', WATCH('config-check.yml')];
const CONFIG_SOLUTION = ['cd orders-api', ...SET_HOSTS, ...SET_KEYS, 'gh secret delete DEPLOY_KEY', ...PROTECT_PROD, ...CHECK_RUN];
/** A line from the middle of the production deploy key: it must never reach a log. */
const PROD_KEY_LINE = PROD_KEY.privateText.split('\n')[1];

const PR4 = ["git commit -qam 'Deploy the digest; production through its environment; read-only token'", 'git push -q',
  "gh pr create -t 'Deploy to staging and production' -b 'Build once, deploy the digest to staging, then to production after approval.'", ...MERGE];
const deployWith = (...fixes: string[]) => ['cd orders-api', 'git switch deploy-pipeline', ...fixes, ...PR4, WATCH('release.yml'), 'curl -s http://prod-01:8000/'];
const DEPLOY_SOLUTION = deployWith(FIX_PERMISSIONS, FIX_ENVIRONMENT, FIX_DIGEST);

const START = 'bash drill/start.sh';
const digestOf = (run: number, pattern = 'orders-api@sha256:[0-9a-f]*') => `gh run view ${run} --log | grep -o '${pattern}' | head -n 1${pattern.startsWith('orders') ? ' | cut -d @ -f 2' : ''}`;
const ROLL = (digest: string) => [START, 'cd orders-api', `D=$(${digest})`, 'gh workflow run rollback.yml -f digest=$D', WATCH('rollback.yml'), 'curl -s http://prod-01:8000/api/pickup-slots'];
const ROLLBACK_SOLUTION = ROLL(digestOf(4100000001));

const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd15-x-ci', title: '第一關：CI 守住 main', machine: 'cicd15-ci',
    statement: '在 ~/orders-api 完成三件事。一、保護 main（你是儲存庫的 admin，用 `gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input 檔案`）：要求 Pull Request 且至少 1 個核准、要求狀態檢查 `lint` 與 `test` 成功（strict：PR 要包含 main 最新的 commit）、管理員也適用（`enforce_admins`），`restrictions` 寫 `null`。二、讓 CI 也在「要合併進 main 的 Pull Request」上執行：在 `.github/workflows/ci.yml` 的 `on:` 加上 `pull_request`（`branches: [main]`），原本的 push 保留。三、你的分支 `pickup-window` 讓 lint 與一個單元測試失敗：修好 `src/pickup.js`（`readyAt` 要加上已經宣告的 `PICKUP_BUFFER_MIN`），把兩個修改一起提交，推送分支、開 PR，等 CI 與 Ravi 的審查，再以 squash 合併。',
    checks: [
      { kind: 'protection', repo: ORDERS, branch: 'main', approvals: 1, checks: ['lint', 'test'] },
      { kind: 'pull-request', repo: ORDERS, head: 'pickup-window', state: 'merged', checks: 'success', approvals: 1 },
      { kind: 'run', repo: ORDERS, workflow: 'ci.yml', event: 'pull_request', conclusion: 'success' },
      { kind: 'branch', repo: ORDERS, name: 'main', file: { path: 'src/pickup.js', includes: FIXED } },
    ],
    solution: CI_SOLUTION,
    mistakes: [
      { commands: ['cd orders-api', 'git switch pickup-window', TRIGGER_SED, FIX_SED, ...PR1, ...MERGE],
        why: 'PR 合併了，但 main 沒有保護：沒有任何規則要求檢查通過或有人核准，下一個人可以直接推送到 main，或在 CI 失敗時照樣合併' },
      { commands: ['cd orders-api', ...PROTECT, 'git switch pickup-window', TRIGGER_SED, FIX_SED, COMMIT1, 'git switch main', 'git merge -q --ff-only pickup-window', 'git push -q'],
        why: '直接推送到受保護的 main：GH006 拒絕（At least 1 approving review is required），main 沒有前進，修正也沒有經過 CI 與審查' },
      { commands: ['cd orders-api', ...PROTECT, 'git switch pickup-window', FIX_SED, ...PR1, ...MERGE],
        why: '沒有加上 pull_request 觸發：CI 只在推送到 main 時執行，PR 上沒有任何檢查（no checks reported），必要的 lint 與 test 永遠等不到，合併被擋下' },
      { commands: ['cd orders-api', ...PROTECT, 'git switch pickup-window', TRIGGER_SED, ...PR1, ...MERGE],
        why: '沒有修好 pickup.js：PR 上的 lint（宣告了沒用的 PICKUP_BUFFER_MIN）與 test（12:10 不是 12:15）都失敗，Ravi 也要求修改，合併被擋下' },
      { commands: ['cd orders-api', ...PROTECT, 'git switch pickup-window', TRIGGER_SED, FIX_SED, ...PR1, 'gh pr merge --squash --delete-branch'],
        why: '開完 PR 立刻合併：CI 還在執行、Ravi 還沒審查，必要的檢查是 pending，合併被擋下（the base branch policy prohibits the merge）' },
    ],
    hints: [
      "保護規則寫成 JSON 檔：`cat > ~/protection.json <<'EOF'`，內容有 `required_status_checks`（`strict`、`contexts`）、`enforce_admins`、`required_pull_request_reviews`（`required_approving_review_count`）與 `restrictions`，最後一行單獨打 `EOF`",
      "`sed -i 's/^  push:$/  pull_request:\\n    branches: [main]\\n  push:/' .github/workflows/ci.yml` 在 push 之前插入兩行；改完用 `git diff` 確認縮排",
      "`readyAt` 的那一行把 `prep` 改成 `prep + PICKUP_BUFFER_MIN`（也可以用 sed）；本機先 `npm test` 確認通過",
      '`git commit -am`、`git push -u origin pickup-window`、`gh pr create -t … -b …`，再 `gh pr checks --watch` 等檢查結束、`gh pr view` 看審查，最後 `gh pr merge --squash --delete-branch`',
    ],
    explanation: '分支保護把「CI 是綠的、有人看過」從習慣變成規則：要求 PR 與 1 個核准，main 就不能直接推送；要求 lint 與 test 這兩個狀態檢查（名稱就是 CI 的 job 名稱），檢查沒有成功的 PR 就合併不了；enforce_admins 讓 admin 也不例外。可是檢查要有人產生：原本的 CI 只在推送到 main 時執行，PR 上永遠等不到 lint 與 test，所以要加上 `pull_request` 觸發，CI 才會在 PR 的試合併 commit 上執行，結果掛在 PR 上。修好 pickup.js 之後，兩個檢查都通過、Ravi 核准，squash 合併讓 main 只多一個 commit。同一個 PR 裡改 workflow 也有效，因為 pull_request 的 run 讀的是試合併 commit 上的 workflow 檔案。',
  },
  {
    id: 'cicd15-x-image', title: '第二關：建置一次、推送 sha 標籤、快取相依套件', machine: 'cicd15-image',
    statement: `main 已經受保護（PR、1 個核准、lint 與 test）。在 ~/orders-api 從 main 開一個分支 \`release-image\`，新增 \`${RELEASE_PATH}\`：workflow 名稱 Release，推送到 main 與 \`workflow_dispatch\` 時執行，\`permissions\` 只有 \`contents: read\`；一個 job \`image\`（ubuntu-latest）：checkout；\`actions/cache@v4\` 快取 \`~/.npm\`，key 是 \`npm-\${{ hashFiles('package-lock.json') }}\`、restore-keys 是 \`npm-\`；\`npm ci\`、\`npm test\`；\`docker build\` 出 \`${IMAGE}:sha-<commit>\`（commit 用 \`\${{ github.sha }}\`）；以儲存庫的 secret \`REGISTRY_TOKEN\` 經 \`--password-stdin\` 用 ci-bot 登入 ${REG}；推送那個標籤。經由 PR 合併之後等 Release 的 run 結束，再用 \`gh workflow run\` 觸發第二次並等它結束：第二次的 cache 要完全命中。`,
    checks: [
      { kind: 'registry', registry: REG, repository: 'sprout/orders-api', tag: 'sha-', commit: { repo: ORDERS } },
      { kind: 'run', repo: ORDERS, workflow: 'release.yml', tip: true, conclusion: 'success', cacheHit: true, logExcludes: CI_TOKEN },
      { kind: 'branch', repo: ORDERS, name: 'main', file: { path: RELEASE_PATH, includes: '--password-stdin' } },
    ],
    solution: IMAGE_SOLUTION,
    mistakes: [
      { commands: PR2(RELEASE_YML),
        why: '只跑了第一次：第一次的 run 一定找不到快取（Cache not found），它只在 job 成功後存檔；要到下一次的 run 才會還原，cache-hit 才是 true' },
      { commands: [...PR2(releaseWith({ cachePath: 'node_modules' })), ...AGAIN],
        why: '快取了 node_modules：npm ci 的下載快取在 ~/.npm，而 npm ci 每次都會刪掉 node_modules 重新安裝，快取它沒有用；這個專案的 runner 上 node_modules 也不存在，post step 只留下 warning、沒有存檔，第二次照樣 Cache not found' },
      { commands: [...PR2(releaseWith({ login: LOGIN_ARG })), ...AGAIN],
        why: '用 `-p "${{ secrets.REGISTRY_TOKEN }}"` 登入：日誌雖然遮蔽成 ***，但 Token 被代換進指令，成了 docker 的參數，在 runner 上查看行程清單就看得到，docker 也警告 Using --password via the CLI is insecure；要從標準輸入給' },
      { commands: [...PR2(releaseWith({ tag: 'latest' })), ...AGAIN],
        why: '只推送 latest：Registry 上沒有 sha-<commit>，說不出這個 Image 是哪個 commit 建出來的，下一次推送又會把 latest 移走，之後也無法以 digest 追溯' },
      { commands: ['cd orders-api', ...heredoc(RELEASE_PATH, RELEASE_YML), `git add ${RELEASE_PATH}`, "git commit -qm 'Build and push an image for every commit on main'", 'git push -q'],
        why: '在 main 上直接提交並推送：main 受保護，GH006 拒絕，Release 從來沒有進到 main，也沒有任何 run' },
    ],
    hints: [
      "`git switch -c release-image`，再用 `cat > .github/workflows/release.yml <<'EOF'` 寫入整個檔案（可以分幾次，之後用 `cat >> …` 接下去），最後一行單獨打 `EOF`",
      '`- uses: actions/cache@v4` 縮排 6 格，`with:` 8 格，`path`、`key`、`restore-keys` 10 格；登入的 step 用 `env:` 把 secret 放進環境變數，再 `echo "$REGISTRY_TOKEN" | docker login … --password-stdin`',
      'PR 合併後 `gh run list -w release.yml` 找到編號、`gh run watch 編號`；第二次用 `gh workflow run release.yml`，同樣等它結束',
      "`gh run view 編號 --log | grep Cache` 看快取找到了什麼；`gh cache list` 列出存好的快取",
    ],
    explanation: 'Release 在 main 的每個 commit 上只建置一次 Image，標籤是 sha-<commit>：之後的部署與回滾都從這一份出發，任何時候都能從標籤追到原始碼。Token 經由 `env:` 進到環境變數、再從標準輸入交給 `docker login`，日誌只看到 `***`，也不會出現在 docker 的參數裡。第一次的 run 沒有快取，`npm ci` 要 28 秒，job 成功後把 `~/.npm` 存成 `npm-<lockfile 的雜湊>`；第二次 lockfile 沒變，key 完全相同，還原之後 `npm ci` 只要 5 秒，完全命中時也不再存檔。lockfile 改變時 key 跟著變，restore-keys 先還原最近一份 `npm-` 開頭的快取。整個 workflow 經由 PR 進到 main：這次 PR 上只有 CI 的 lint 與 test，Release 在合併後的推送才第一次執行。',
  },
  {
    id: 'cicd15-x-config', title: '第三關：依環境分開設定與 secret', machine: 'cicd15-config',
    statement: '部署前先把設定放對地方。在 ~/orders-api（儲存庫已有 staging 與 production 兩個 environment）：一、每個環境的 variable `DEPLOY_HOST`：staging 是 `staging-01`、production 是 `prod-01`。二、每個環境的 secret `DEPLOY_KEY`：staging 用 `~/keys/staging-deploy`、production 用 `~/keys/prod-deploy`（從檔案以標準輸入給值）。三、刪除儲存庫層級的 `DEPLOY_KEY`：它是 production 的金鑰，任何 workflow 的任何 job 都讀得到。四、保護 production：審核者是 Ada（`gh api users/ada-nwosu` 查她的 id）、開啟 prevent self-review、只有受保護的分支可以部署（`gh api -X PUT repos/{owner}/{repo}/environments/production --input 檔案`）。最後以 `gh workflow run config-check.yml` 執行 Leo 寫的設定檢查，等它結束（production 的 job 要等 Ada 核准）：兩個環境都要連得到自己的主機。',
    checks: [
      { kind: 'variable', repo: ORDERS, name: 'DEPLOY_HOST', env: 'staging', value: 'staging-01' },
      { kind: 'variable', repo: ORDERS, name: 'DEPLOY_HOST', env: 'production', value: 'prod-01' },
      { kind: 'secret', repo: ORDERS, name: 'DEPLOY_KEY', env: 'staging' },
      { kind: 'secret', repo: ORDERS, name: 'DEPLOY_KEY', env: 'production' },
      { kind: 'secret', repo: ORDERS, name: 'DEPLOY_KEY', absent: true },
      { kind: 'environment', repo: ORDERS, name: 'production', reviewers: ['ada-nwosu'], branches: 'protected' },
      { kind: 'run', repo: ORDERS, workflow: 'config-check.yml', conclusion: 'success', logIncludes: 'prod-01', logExcludes: PROD_KEY_LINE },
    ],
    solution: CONFIG_SOLUTION,
    mistakes: [
      { commands: ['cd orders-api', 'gh variable set DEPLOY_HOST --body prod-01', ...SET_KEYS, 'gh secret delete DEPLOY_KEY', ...PROTECT_PROD, ...CHECK_RUN],
        why: '沒有加 -e，DEPLOY_HOST 成了儲存庫層級的 variable：兩個環境都看到 prod-01，staging 的 job 拿 staging 的金鑰去連 production 的主機（被拒絕）；設定錯放一層，staging 的部署就會打到 production' },
      { commands: ['cd orders-api', ...SET_HOSTS, 'gh secret set DEPLOY_KEY -e staging < ~/keys/staging-deploy', 'gh variable set DEPLOY_KEY -e production < ~/keys/prod-deploy', 'gh secret delete DEPLOY_KEY', ...PROTECT_PROD, ...CHECK_RUN],
        why: '把 production 的金鑰存成 variable：variable 不會被遮蔽，「Show the variables」把它原文印進日誌；secrets.DEPLOY_KEY 也是空的，連不上 prod-01。秘密只能放在 secret' },
      { commands: ['cd orders-api', ...SET_HOSTS, ...SET_KEYS, ...PROTECT_PROD, ...CHECK_RUN],
        why: '沒有刪除儲存庫層級的 DEPLOY_KEY：run 是綠的，但 production 的金鑰仍然對每個 workflow 的每個 job 開放（例如 PR 上的 CI），最小權限要求它只存在 production 這個 environment' },
      { commands: ['cd orders-api', ...SET_HOSTS, 'gh secret set DEPLOY_KEY -e staging < ~/keys/prod-deploy', 'gh secret set DEPLOY_KEY -e production < ~/keys/staging-deploy', 'gh secret delete DEPLOY_KEY', ...PROTECT_PROD, ...CHECK_RUN],
        why: '兩把金鑰放反了：每台主機只接受自己環境的 CI 金鑰，兩個 job 都 Permission denied (publickey)；一把金鑰只開一扇門，放錯就連不上，也代表 staging 的 job 曾經拿著 production 的鑰匙' },
      { commands: ['cd orders-api', ...SET_HOSTS, ...SET_KEYS, 'gh secret delete DEPLOY_KEY', `cat > ~/production.json <<'EOF'\n{\n  "reviewers": [{ "type": "User", "id": 2003 }],\n  "prevent_self_review": true\n}\nEOF`, 'gh api -X PUT repos/{owner}/{repo}/environments/production --input ~/production.json --silent', ...CHECK_RUN],
        why: '只設了審核者，沒有限制部署的分支：任何分支（例如還沒審查的功能分支）的 workflow 都能要求部署到 production，只靠審核者在當下擋住' },
      { commands: ['cd orders-api', ...SET_HOSTS, ...SET_KEYS, 'gh secret delete DEPLOY_KEY', ...PROTECT_PROD, 'gh workflow run config-check.yml'],
        why: '觸發之後沒有等：production 的 job 還在等 Ada 核准（waiting），還看不到兩個環境的結果' },
    ],
    hints: [
      '`gh variable set DEPLOY_HOST -e staging --body staging-01`；secret 從檔案給：`gh secret set DEPLOY_KEY -e production < ~/keys/prod-deploy`',
      '`gh secret list` 看儲存庫層級的、`gh secret list -e production` 看環境的；刪除用 `gh secret delete DEPLOY_KEY`（不加 -e 就是儲存庫層級）',
      "`gh api users/ada-nwosu` 的 id 寫進 `{\"reviewers\": [{\"type\": \"User\", \"id\": …}], \"prevent_self_review\": true, \"deployment_branch_policy\": {\"protected_branches\": true, \"custom_branch_policies\": false}}`",
      '`gh run list -w config-check.yml` 找到編號，`gh run watch 編號` 會等到 Ada 核准、兩個 job 結束；`gh run view 編號 --log` 看每個環境印出的設定與連到的主機',
    ],
    explanation: '同一份 workflow 在不同環境做同樣的事，差別只在設定：environment 層級的 variable 與 secret 在 job 寫了 `environment:` 時才拿得到，所以 staging 的 job 只看得到 staging-01 與 staging 的金鑰，production 的 job 要先經過 Ada 核准才拿得到 production 的金鑰。儲存庫層級的 secret 對每個 job 都開放，留著 production 的金鑰就等於讓 PR 上的 CI 也拿得到它。variable 是「不是秘密的設定」，會原樣出現在日誌（Leo 的檢查就把它們全部印出來）；金鑰、Token、密碼只能放在 secret，日誌會把它的值遮蔽成 ***。只有受保護的分支能部署，加上審核者與 prevent self-review，production 的部署就一定來自經過 PR 的 main，並由另一個人放行。',
  },
  {
    id: 'cicd15-x-deploy', title: '第四關：以 digest 從 staging 晉升到 production', machine: 'cicd15-deploy',
    statement: `Leo 推送了分支 \`deploy-pipeline\`：它把 ${RELEASE_PATH} 擴充成 image → staging → production 三個 job，用 \`scripts/deploy.sh\` 以 ssh 部署、以 curl 做冒煙測試，但留下三個問題：(1) workflow 的 \`permissions\` 是 \`write-all\`；(2) staging 與 production 部署的是標籤 \`:sha-\${{ github.sha }}\`，不是 image job 輸出的 digest（\`@\${{ needs.image.outputs.digest }}\`）；(3) production job 沒有寫 \`environment: production\`。在 ~/orders-api 切到這個分支，修好三個問題（GITHUB_TOKEN 只要 \`contents: read\`），提交、推送、開 PR、等 CI 與審查後以 squash 合併；合併後的推送會觸發 Release，等它跑完（production 要等 Ada 核准），最後確認 \`http://prod-01:8000/\` 回報 1.5.0。`,
    checks: [
      { kind: 'workflow', repo: ORDERS, path: RELEASE_PATH, job: 'production', permissions: { contents: 'read' } },
      { kind: 'run', repo: ORDERS, workflow: 'release.yml', tip: true, conclusion: 'success', logIncludes: 'orders-api@sha256:' },
      { kind: 'deployment', repo: ORDERS, environment: 'staging', tip: true, status: 'success', latest: true },
      { kind: 'deployment', repo: ORDERS, environment: 'production', tip: true, status: 'success', latest: true },
      { kind: 'container', host: 'prod-01', name: 'web', state: 'running' },
      { kind: 'http', url: 'http://prod-01:8000/', status: 200, body: '"version":"1.5.0"' },
    ],
    solution: DEPLOY_SOLUTION,
    mistakes: [
      { commands: deployWith(FIX_ENVIRONMENT, FIX_DIGEST),
        why: '留著 permissions: write-all：部署成功了，但每個 job 的 GITHUB_TOKEN 都能改寫儲存庫的內容、PR 與設定，任何一個被攻破的 step 都能拿它推送程式；這條管線只需要讀取程式碼' },
      { commands: deployWith(FIX_PERMISSIONS, FIX_DIGEST),
        why: 'production job 沒有 environment：它拿不到 production 的 DEPLOY_HOST 與 DEPLOY_KEY，`vars.DEPLOY_HOST` 是空的，deploy.sh 少了一個參數（unbound variable）而失敗；更糟的是它根本不經過 Ada 的核准與分支規則，也不會留下 production 的部署紀錄' },
      { commands: deployWith(FIX_PERMISSIONS, FIX_ENVIRONMENT),
        why: '仍然以標籤部署：這次的內容碰巧相同，但標籤可以被重新推送而移動，staging 測過的和 production 跑的不保證是同一份；回滾時也要的是 digest，日誌裡應該看得到 orders-api@sha256:' },
      { commands: ['cd orders-api', 'git switch deploy-pipeline', FIX_PERMISSIONS, FIX_ENVIRONMENT, FIX_DIGEST, ...PR4, 'curl -s http://prod-01:8000/'],
        why: '合併之後沒有等 Release 跑完：image 與 staging 還在執行、production 在等 Ada 核准，prod-01 仍然是 1.4.0' },
      { commands: ['cd orders-api', 'git switch deploy-pipeline', FIX_PERMISSIONS, FIX_ENVIRONMENT, FIX_DIGEST, "git commit -qam 'Fix the pipeline'", 'git switch main', 'git merge -q deploy-pipeline', 'git push -q'],
        why: '把分支直接合併進本機的 main 再推送：main 受保護，GH006 拒絕，修好的管線沒有進到 main，也沒有部署' },
    ],
    hints: [
      '`git switch deploy-pipeline`，用 `grep -n -E \'^permissions|environment:|IMAGE:|needs:\' .github/workflows/release.yml` 找到三個要改的地方',
      "`sed -i 's/^permissions: write-all$/permissions:\\n  contents: read/' …`；在 production 的 `needs:` 那一行後面加一行：`sed -i 's/^    needs: \\[image, staging\\]$/&\\n    environment: production/' …`",
      "把兩個 `IMAGE:` 的結尾換掉：`sed -i 's/orders-api:sha-\\${{ github.sha }}$/orders-api@${{ needs.image.outputs.digest }}/' …`（`\\$` 讓 sed 把 `$` 當成一般字元）；改完 `git diff` 確認",
      '合併後 `gh run list -w release.yml -L 1` 找到編號，`gh run watch 編號` 會等到 Ada 核准、production 結束；`ssh deploy@prod-01 docker ps` 看主機上的 Image',
    ],
    explanation: 'image job 只建置一次，推送後從 `docker push` 的最後一行取出 digest 當成 job 的 output；staging 與 production 都部署 `orders-api@sha256:…`，所以 production 跑的正是 staging 冒煙測試通過的那一份內容。production job 寫了 `environment: production`，才會經過分支規則與 Ada 的核准、拿到 production 的 DEPLOY_HOST 與 DEPLOY_KEY，也留下部署紀錄；`concurrency: production` 讓兩次發布不會同時替換 prod-01 的容器。workflow 層級的 `contents: read` 讓 GITHUB_TOKEN 只能讀取程式碼，部署用的是環境的 secret，不需要寫入權限。冒煙測試檢查 `/healthz` 與 `/api/menu`：失敗時 curl 的 `-f` 讓 step 失敗，production 根本不會開始。',
  },
  {
    id: 'cicd15-x-rollback', title: '第六關：回滾演練', machine: 'cicd15-drill',
    statement: '這是 production 的演練複本。先執行 `bash drill/start.sh` 重現當天的兩次發布：Release 部署 main 的 1.5.0，再合併 Leo 的 1.6.0（PR #14），Release 把 1.6.0 部署到兩個環境；冒煙測試都通過，但 `http://prod-01:8000/api/pickup-slots` 回 500。你是值班的人：從 production 的部署紀錄找出 1.6.0 之前那一次部署來自哪個 run，從那個 run 的日誌取出它部署的 digest，以 `gh workflow run rollback.yml -f digest=…` 經由 production 環境回滾（要等 Ada 核准），等 run 結束，再確認取餐時段恢復、`http://prod-01:8000/` 回報 1.5.0。不要重新建置，也不要直接 ssh 到主機換容器。',
    checks: [
      { kind: 'run', repo: ORDERS, workflow: 'rollback.yml', job: 'rollback', conclusion: 'success' },
      { kind: 'deployment', repo: ORDERS, environment: 'production', status: 'success', latest: true },
      { kind: 'http', url: 'http://prod-01:8000/api/pickup-slots', status: 200, body: '"free"' },
      { kind: 'http', url: 'http://prod-01:8000/', status: 200, body: '"version":"1.5.0"' },
    ],
    solution: ROLLBACK_SOLUTION,
    mistakes: [
      { commands: ROLL(digestOf(4100000003)),
        why: '拿了最新一筆部署的 digest：那正是 1.6.0，等於把壞掉的版本再部署一次；rollback 的冒煙測試檢查取餐時段，run 失敗，production 仍是 1.6.0' },
      { commands: ROLL(digestOf(4100000001, 'sha256:[0-9a-f]*')),
        why: '日誌裡第一個 sha256: 是 `docker build -q` 印出的 Image ID，不是推送到 Registry 之後的 digest：主機拉取時回 manifest unknown，run 失敗，production 沒變' },
      { commands: [START, 'cd orders-api', `D=$(${digestOf(4100000001)})`, `ssh deploy@prod-01 "docker rm -f web && docker run -d --name web -p 8000:8000 ${IMAGE}@$D"`, 'curl -s http://prod-01:8000/api/pickup-slots'],
        why: '直接 ssh 到主機換容器：取餐時段恢復了，但沒有核准、沒有冒煙測試、沒有部署紀錄，紀錄仍說 production 是 1.6.0，下一個看紀錄的人會被誤導' },
      { commands: [START, 'cd orders-api', `D=$(${digestOf(4100000001)})`, 'gh workflow run rollback.yml -f digest=$D', 'curl -s http://prod-01:8000/api/pickup-slots'],
        why: '觸發之後沒有等：rollback job 還在等 Ada 核准（waiting），production 仍是 1.6.0' },
      { commands: [START, 'cd orders-api', 'gh workflow run release.yml', WATCH('release.yml'), 'curl -s http://prod-01:8000/api/pickup-slots'],
        why: '重新執行 Release：它建置的是 main 目前的 commit，也就是 1.6.0，又走了一次整條管線，部署的仍是壞掉的版本' },
      { commands: [START, 'cd orders-api', 'git revert --no-edit HEAD', 'git push -q'],
        why: '在 main 上 revert 再推送：main 受保護，GH006 拒絕；就算經由 PR，revert 也是重新建置一份沒有在 production 跑過的新 Image，要再等 CI、審查與兩次核准' },
    ],
    hints: [
      "`gh api 'repos/{owner}/{repo}/deployments?environment=production'` 新的在前；第二筆是 1.6.0 之前的那一次，它的 `…/deployments/編號/statuses` 裡的 `log_url` 指向產生它的 run",
      'production job 的 Deploy step 印出 `orders-api@sha256:…`；注意 `docker build -q` 印出的 `sha256:…` 是 Image ID，不是 digest',
      "例如 `D=$(gh run view 編號 --log | grep -o 'orders-api@sha256:[0-9a-f]*' | head -n 1 | cut -d @ -f 2)`，再 `gh workflow run rollback.yml -f digest=$D`",
      '`gh run list -w rollback.yml` 找到編號，`gh run watch 編號` 會等到 Ada 核准；最後 `curl -s http://prod-01:8000/api/pickup-slots`',
    ],
    explanation: '回滾就是把 production 換回上一個已知正常的 digest：1.5.0 那一份在 staging 與 production 都跑過、通過冒煙測試，回去之後的行為是已知的。它的 digest 記在產生那次部署的 run 的日誌裡，部署紀錄的 statuses 以 log_url 指向那個 run。rollback.yml 先確認輸入是 digest，再經過和 Release 相同的 production 環境（Ada 核准、production 的金鑰、`concurrency: production`），冒煙測試多檢查了取餐時段。整個過程沒有建置任何東西。回滾之後 main 仍是 1.6.0，下一次推送會把它帶回來，所以接著要向前修復（1.6.1）並在事後檢討裡記下冒煙測試的缺口。',
  },
];

// ---- devops-explorer exercises (answers are computed by the explorer, never written here).
const DEVOPS_EXERCISES: DevopsExercise[] = [
  {
    id: 'cicd15-x-canary', kind: 'rollout-plan', title: '第五關之一：讓閘門擋下 1.6.0',
    statement: '替「金絲雀發布 1.6.0」重新設定金絲雀的步驟（例如 `10/5, 50/5, 100/5`：流量百分比／觀察分鐘）。閘門不變（每一步至少 400 個請求、錯誤率不超過 10‰）。要求：發布以回滾結束，而且回滾必須是閘門在足夠的樣本上判定失敗造成的；整個時間軸的錯誤請求（兩個版本合計）不超過 70 個。',
    plan: { rollout: 'cicd15-d-canary160', strategy: 'canary', constraints: { outcome: 'rolled-back', gateFailed: true, maxErrors: 70 }, reference: TEAM_PLAN },
    hints: [
      '第一步啟動 ⌈8 × 百分比 ÷ 100⌉ 個 1.6.0，就緒之後承接 1,600 × 百分比 ÷ 100 個請求一分鐘；觀察期間的請求要達到 400。',
      '壞版本在第一步就會被判定失敗：錯誤主要來自第一步承接的請求（40‰），加上 1.5.0 平常的 1‰。',
      '10% 一分鐘是 160 個請求，觀察 3 分鐘以上才有 400 個；25% 觀察 5 分鐘有 2,000 個，錯誤太多。',
    ],
    explanation: '例如團隊的 `10/5, 50/5, 100/5`：第 0 分鐘啟動一個 1.6.0，第 1 分鐘起承接 10%（每分鐘 160 個），觀察第 1–5 分鐘共 800 個請求、32 個錯誤（40‰），第 5 分鐘結束時閘門判定失敗，第 6 分鐘回滾；加上 1.5.0 承接的請求的 1‰（31 個），整個時間軸共 63 個錯誤。第一步要同時滿足兩件事：小到壞版本傷到的請求有限（25% 的第一步就有 80 個失敗），又大到觀察期間累積足夠的請求讓閘門真的判斷（10% 只觀察 2 分鐘是 320 個，樣本不足而中止，連好版本也發布不出去）。',
    mistakes: [
      { answer: { steps: '25/5, 100/5' }, why: 'Leo 的提案：閘門在第一步判定失敗，但 1.6.0 在這 5 分鐘承接了 2,000 個請求，光它就有 80 個錯誤' },
      { answer: { steps: '10/2, 100/2' }, why: '第一步只有 320 個請求，低於最低樣本數 400：閘門沒有判斷就中止（fail closed），同樣的設定也會擋下沒問題的版本' },
      { answer: { steps: '100/5' }, why: '一步就給全部流量：閘門雖然判定失敗，但 1.6.0 承接了 8,000 個請求、320 個錯誤，這已經不是金絲雀' },
      { answer: { steps: '1/10, 100/5' }, why: '1% 的流量觀察 10 分鐘只有 160 個請求，樣本不足而中止；第一步太小，閘門無從判斷' },
    ],
  },
  {
    id: 'cicd15-x-alert', kind: 'alert-rule', title: '第五關之二：對使用者的症狀告警',
    statement: '在「orders-api production：11:00–14:00」上寫一條告警規則，取代只看 CPU 的舊規則：每個事故都要在開始後 3 分鐘內觸發，而且不能有任何誤報（第 110 分鐘的報表批次尖峰不能叫醒人）。',
    plan: { dashboard: 'cicd15-board', constraints: { detectWithin: 3, maxFalseAlerts: 0 }, reference: { series: 'errors', op: '>', threshold: 12, forMinutes: 1 } },
    hints: [
      '先看錯誤率的圖：平常在 1–5‰，付款逾時約 31–35‰，資料庫主機切換只有 16–19‰，報表批次的尖峰只有一分鐘。',
      '門檻要高於平常的波動、低於最小的那次事故；持續 1 分鐘就能讓只有一分鐘的尖峰停在等待中。',
      '視窗平均與太長的持續時間都會讓偵測變慢。',
    ],
    explanation: '例如「錯誤率超過 12‰，持續 1 分鐘」：兩次事故都在開始後第 1 分鐘觸發（延遲 1 分鐘），第 110 分鐘的尖峰只有一分鐘，條件成立一分鐘就結束，停在等待中，不發通知。舊的 CPU 規則對著原因而不是症狀：它只在批次尖峰觸發（誤報），兩次事故都漏掉。門檻 20‰ 漏掉了較小的資料庫切換；不設持續時間會被尖峰叫醒；10 分鐘的平均把資料庫切換稀釋到 6 分鐘後才觸發。',
    mistakes: [
      { answer: { series: 'cpu', op: '>', threshold: '70', agg: 'none', window: '', for: '1' }, why: '舊規則看的是 CPU：只在報表批次時觸發（誤報），兩次事故的 CPU 都正常，全部漏掉' },
      { answer: { series: 'errors', op: '>', threshold: '12', agg: 'none', window: '', for: '0' }, why: '一超過就告警：第 110 分鐘只有一分鐘的批次尖峰也會發出通知，是誤報' },
      { answer: { series: 'errors', op: '>', threshold: '20', agg: 'none', window: '', for: '1' }, why: '門檻太高：資料庫主機切換時錯誤率只有 16–19‰，整個事故都沒有觸發' },
      { answer: { series: 'errors', op: '>', threshold: '12', agg: 'avg', window: '10', for: '0' }, why: '10 分鐘的平均把短的事故稀釋了：資料庫主機切換開始 6 分鐘後才觸發，超過 3 分鐘' },
      { answer: { series: 'errors', op: '>', threshold: '12', agg: 'none', window: '', for: '5' }, why: '持續 5 分鐘才觸發：兩次事故都延遲 5 分鐘，超過 3 分鐘' },
    ],
  },
  {
    id: 'cicd15-x-times', kind: 'table', title: '第六關之二：演練的四個時間',
    statement: '打開「回滾演練：11-30 14:00–15:00」的事故時間線，依本課（CICD14）的定義算出這次演練的偵測時間、確認時間、止血時間與恢復時間（分鐘）。',
    blanks: [
      { id: 'ttd', label: '偵測時間（分鐘）', query: { task: 'incident', dashboard: 'cicd15-drill-board', incident: 'drill-160', metric: 'time-to-detect' } },
      { id: 'tta', label: '確認時間（分鐘）', query: { task: 'incident', dashboard: 'cicd15-drill-board', incident: 'drill-160', metric: 'time-to-acknowledge' } },
      { id: 'ttm', label: '止血時間（分鐘）', query: { task: 'incident', dashboard: 'cicd15-drill-board', incident: 'drill-160', metric: 'time-to-mitigate' } },
      { id: 'ttr', label: '恢復時間（分鐘）', query: { task: 'incident', dashboard: 'cicd15-drill-board', incident: 'drill-160', metric: 'time-to-recover' } },
    ],
    hints: [
      '事件表裡找出「偵測到」、「確認接手」、「止血（緩解）」三個事件的分鐘；事故開始與結束的分鐘在底色與事故的標題旁。',
      '確認時間從偵測到算起，其他三個從事故開始算起。',
      '恢復時間算到影響結束（事故期間的結束），不是演練結束。',
    ],
    explanation: '事故從第 5 分鐘（14:05，1.6.0 上線）開始、第 18 分鐘結束。偵測：告警在第 6 分鐘觸發，6 − 5 = 1 分鐘，第五關的規則果然很快。確認：第 9 分鐘才有人接手，9 − 6 = 3 分鐘，比偵測還久。止血：第 16 分鐘 Rollback 完成，16 − 5 = 11 分鐘，其中查證與等待核准佔了大部分。恢復：18 − 5 = 13 分鐘；第 40 分鐘的演練結束不算在內。最長的一段是止血，所以事後檢討的行動項目該先縮短它，例如讓處理手冊直接寫出找上一個 digest 的指令。',
    mistakes: [
      { answer: { ttd: '1', tta: '4', ttm: '11', ttr: '13' }, why: '確認時間從事故開始算起；它衡量的是告警響了之後多久有人接手，要從偵測到算起' },
      { answer: { ttd: '1', tta: '3', ttm: '10', ttr: '13' }, why: '止血時間從偵測到算起；本課的止血與恢復時間都從事故開始算起' },
      { answer: { ttd: '1', tta: '3', ttm: '11', ttr: '35' }, why: '把演練結束當成恢復：第 40 分鐘是結束演練，影響在第 18 分鐘就結束了' },
    ],
  },
];

const QUIZ: LessonContent['quiz'] = [
  {
    id: 'cicd15-q-gate', prompt: 'orders-api 的 ci.yml 只在推送到 main 時執行，main 也沒有分支保護。一個讓測試失敗的 PR 被合併了。最根本的原因是什麼？',
    options: ['CI 的 runner 太慢，來不及在合併前跑完測試', 'CI 不在 PR 上執行，也沒有規則要求檢查通過', 'squash 合併會略過 PR 上所有的狀態檢查', '測試應該改在開發者的筆電上用 pre-commit 執行'],
    answer: 1,
    explanation: 'PR 上根本沒有檢查（CI 只在推送到 main 時執行），也沒有分支保護要求檢查通過，所以合併沒有任何阻礙。runner 的速度不是問題：有必要的檢查時，合併會等到檢查結束；squash 合併照樣受分支保護的檢查限制；本機的 hook 可以被略過，取代不了伺服器端的關卡。',
  },
  {
    id: 'cicd15-q-tag', prompt: 'Release 推送 `orders-api:sha-<commit>`，staging 與 production 部署的卻是 `orders-api@sha256:…`。為什麼部署要用 digest？',
    options: ['digest 比標籤短，寫在 workflow 裡比較好讀', 'Registry 只允許以 digest 拉取私有的 Image', '用 digest 拉取可以略過 Registry 的登入步驟', '確保 production 跑的正是 staging 驗證過的內容'],
    answer: 3,
    explanation: 'digest 是 manifest 內容的雜湊，內容不同就是另一個值，沒有人能移動它，所以 production 部署的一定是 staging 冒煙測試通過的那一份，回滾時也能精確指定。標籤可以被重新推送而改變指向。digest 比標籤長；Registry 也接受以標籤拉取；拉取私有 Image 不論用什麼都要登入。',
  },
  {
    id: 'cicd15-q-variable', prompt: '有人用 `gh variable set DEPLOY_KEY -e production < ~/keys/prod-deploy` 把部署金鑰存成 production 的 variable。會發生什麼事？',
    options: ['值不會被遮蔽，印出 variable 的 step 會把金鑰原文寫進日誌', 'gh 會拒絕，因為 variable 的值不能有好幾行', '它和 secret 的效果相同，只是在網頁上顯示的位置不同', 'variable 只在 staging 有效，production 的 job 讀不到它'],
    answer: 0,
    explanation: 'variable 是不是秘密的設定，日誌不會遮蔽它：Leo 的檢查用 `toJSON(vars)` 印出所有 variable，金鑰就以原文出現在日誌裡，而 `secrets.DEPLOY_KEY` 是空的，ssh 也失敗。gh 接受多行的 variable；它和 secret 的差別正是遮蔽與存放方式；寫了 `-e production` 的 variable 正是給 production 的 job 用的。',
  },
  {
    id: 'cicd15-q-environment', prompt: 'Release 的 production job 忘了寫 `environment: production`。除了拿不到 production 的 variable 與 secret，還有什麼問題？',
    options: ['job 會被自動改成部署到 staging', 'GitHub 會把 job 改成在 staging 的 runner 上執行', '它不經過 Ada 的核准與分支規則，也沒有部署紀錄', 'concurrency 群組會讓 staging 的部署被取消'],
    answer: 2,
    explanation: 'environment 是保護規則的入口：沒有寫，job 就不會等待審核、不檢查部署分支，也不會建立 production 的部署紀錄，等於繞過了最後一道關卡。job 不會被改去部署 staging，runner 也和 environment 無關；concurrency 群組只在名稱相同時影響彼此，和有沒有 environment 無關。',
  },
  {
    id: 'cicd15-q-canary', prompt: '金絲雀的第一步設成 1% 流量、觀察 10 分鐘，閘門要求至少 400 個請求（每分鐘 1,600 個請求）。部署一個完全沒有問題的版本時會怎樣？',
    options: ['順利完成，因為錯誤率遠低於閘門的上限', '閘門自動降低最低樣本數，改用 160 個請求判斷', '第一步會一直觀察下去，直到湊滿 400 個請求', '樣本不足視同未通過，發布被中止並回滾'],
    answer: 3,
    explanation: '1% 是每分鐘 16 個請求，10 分鐘只有 160 個，低於 400：證據不足，模型視為未通過（fail closed），連好版本也發布不出去。錯誤率低不代表通過，前提是樣本足夠；閘門不會自己放寬條件，也不會延長觀察時間，觀察多久是計畫決定的。',
  },
  {
    id: 'cicd15-q-alert', prompt: '「錯誤率超過 12‰」的告警在一分鐘的批次尖峰時也會叫醒值班的人。哪一個調整最適合？',
    options: ['加上持續 1 分鐘的條件', '把門檻調到所有尖峰之上的 40‰', '改成對 CPU 使用率告警', '改用 30 分鐘的平均值'],
    answer: 0,
    explanation: '持續 1 分鐘讓只有一分鐘的尖峰停在等待中，真正的事故仍在開始後 1 分鐘觸發。門檻 40‰ 會漏掉錯誤率較低的事故；CPU 是原因不是症狀，正好在批次時升高、事故時正常；30 分鐘的平均會把短的事故稀釋，偵測慢很多。',
  },
  {
    id: 'cicd15-q-rollback', prompt: 'production 的 1.6.0 讓取餐時段回 500。用 rollback.yml 回滾時，應該給它哪個 digest？',
    options: ['Registry 上目前 `latest` 標籤指向的 digest', '1.6.0 之前那筆 production 部署的 digest', 'production 最新一筆部署紀錄所用的 digest', '`docker build -q` 在 1.5.0 那次建置時印出的 sha256'],
    answer: 1,
    explanation: '上一筆 production 部署的 digest 是在 production 跑過、通過冒煙測試的那一份，回去之後的行為是已知的。latest 指向哪裡取決於最後一次推送；最新一筆部署正是壞掉的 1.6.0；`docker build -q` 印出的是 Image ID，Registry 不認得它，主機拉取時回 manifest unknown。',
  },
  {
    id: 'cicd15-q-after', prompt: '回滾成功、取餐時段恢復了，main 上仍是 1.6.0 的 commit。接下來最重要的是什麼？',
    options: ['向前修復出 1.6.1，經由 PR 與整條管線發布', '先暫停 Release，等下週再決定要不要部署', '把 1.6.0 的 Image 從 Registry 刪除就好', '直接 ssh 到 prod-01 確認容器不會再被換掉'],
    answer: 0,
    explanation: 'main 仍是 1.6.0，下一次推送或重新執行 Release 就會把它部署回去，所以要以 1.6.1 向前修復，讓 main、Registry 與線上一致，並在事後檢討裡補上冒煙測試的缺口。暫停 Release 只是延後問題；刪除 Image 不會改變 main；ssh 到主機看容器無法阻止下一次部署。',
  },
];

export const CICD15: LessonContent = {
  lessonId: 'CICD15',
  motivation: '「我們的程式其實寫得不錯，可是每次上線都像在賭：有人在筆電上跑過測試就合併、有人用 latest 部署、production 的金鑰放在每個 workflow 都讀得到的地方，出事時大家只記得『上次好像是用 ssh 把舊的容器換回去』。」小芽咖啡的線上點餐服務 orders-api 由一個四個人的小團隊維護，主機上還跑著上個月手動部署的 1.4.0。這座島的每一堂課都只看一件事：版本控制與 Pull Request、CI、測試、建置與產出物、設定與機密、部署管線、部署策略、監控與告警、日誌、回滾與事故應變。這堂綜合專題把它們接成一條路：從一個 commit 開始，經過 CI 的把關、只建置一次的容器 Image、依環境分開的設定與 secret、以 digest 從 staging 晉升到 production 的管線，選一個有閘門的金絲雀計畫與一條對症狀的告警，最後在演練中把壞掉的版本經由管線回滾。六個關卡都要在模擬的 GitHub、Actions、Registry 與兩台 Docker 主機上動手，或在部署模擬器與儀表板上算出結果，並以平台自己的紀錄驗證。',
  sections: [
    {
      id: 'cicd15-s-overview', title: '小芽咖啡：從 commit 到上線的六個關卡',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的連鎖咖啡店小芽咖啡（Sprout Café）。服務 orders-api 提供菜單、取餐時段與線上點餐，程式放在模擬的 `github.example` 上的 sprout/orders-api。你是平台工程師 Mina Cho（gh 帳號 mina-cho，儲存庫的 admin）；Leo Park 是開發者；Ravi Shah 負責程式審查，在 PR 的每個新 head 出現後 20 秒審查（程式正確就核准）；Ada Nwosu 負責發布，是 production 的審核者，在部署開始等待後 2 分鐘核准。組織、人物、主機與每一個 Token 都是虛構的課程資料。' },
        { type: 'table', head: ['機器或服務', '角色', '專題開始時'], rows: [
          ['mina-laptop（你的筆電）', '~/orders-api 是儲存庫的複本；有 git、gh、ssh、curl 與 docker', '本機分支 pickup-window 還沒推送'],
          ['github.example 上的 sprout/orders-api', 'PR、分支保護、Actions、environment、secret 與 variable', 'main 沒有保護；CI（ci.yml）只在推送到 main 時執行 lint 與 test'],
          ['cr.sprout.example', '團隊的 Registry', 'ci-bot 可以推送（Token 是儲存庫的 secret REGISTRY_TOKEN），deploy 只能拉取'],
          ['staging-01（10.40.0.11）、prod-01（10.40.0.21）', 'Docker 主機，帳號 deploy 在 docker 群組；各自只接受自己環境的 CI 金鑰與你的金鑰', '容器 web 跑上個月手動部署的 `orders-api:1.4.0`，8000 埠'],
        ] },
        { type: 'p', text: '六個關卡依序把這條路接起來。每一關的機器就是那個時刻的樣子：前面的關卡已經照課文完成（例如第二關開始時 main 已經受保護），所以每一關都可以單獨練習。' },
        { type: 'table', head: ['關卡', '要做的事', '交出的成果', '對應的課'], rows: [
          ['1. CI 管線', '保護 main，讓 CI 在 PR 上執行，經由 PR 修好一個失敗的測試', '必要的 lint、test 與 1 個核准；PR 以 squash 合併', 'CICD02–CICD05'],
          ['2. 容器建置', '每個 main 的 commit 建置一次 Image，推送 sha-<commit>，快取相依套件', 'Registry 上的 sha 標籤；第二次的 run 快取完全命中', 'CICD06、DKR11'],
          ['3. 設定與 secret', '依環境分開 variable 與 secret，移除儲存庫層級的金鑰，保護 production', '兩個環境都連得到自己的主機，日誌沒有金鑰', 'CICD07、CICD08'],
          ['4. 部署管線', '修好部署管線的三個問題，以 digest 從 staging 晉升到 production', '兩個環境的部署紀錄都是 success，prod-01 跑 1.5.0', 'CICD09'],
          ['5. 部署策略與監控', '替 1.6.0 選一個有閘門的金絲雀計畫，寫一條對症狀的告警', '閘門在足夠的樣本上擋下壞版本；告警及時、沒有誤報', 'CICD10–CICD12'],
          ['6. 回滾演練', '壞掉的 1.6.0 上線了：經由 rollback.yml 回到上一個 digest，記下四個時間', '取餐時段恢復；偵測、確認、止血與恢復時間', 'CICD13、CICD14'],
        ] },
        { type: 'example', id: 'cicd15-ex-start' },
        { type: 'p', text: 'main 沒有分支保護（404 Branch not protected），CI 只在推送到 main 時執行：分支上的程式在合併之前不會被任何人自動檢查。你的分支宣告了 `PICKUP_BUFFER_MIN` 卻沒有用到，`readyAt` 仍然只加上準備時間，所以「12:00 點餐、準備 10 分鐘」算出 12:10，測試期望 12:15。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'workflow 真的會在推送、PR 與 `gh workflow run` 時執行，`run:` 的指令在模擬的 runner 上跑，部署真的以 ssh 改變兩台主機上的容器；npm 的測試結果是課程宣告的，不是真的 Node.js。模擬環境不保存課程開始前的 run 與部署紀錄，所以第六關先用一個腳本重現當天的兩次發布。時間由模擬的時鐘決定：`gh run watch`、`gh pr checks --watch` 與 `sleep` 會讓它前進，ssh、拉取與啟動容器不花時間。終端機裡的 prod-01 是一台主機；第五關的部署模擬器描述的是 production 真正的機群（8 個執行個體在負載平衡器後面），是示意資料。gh 與 REST 的部分欄位與訊息依記得的格式模擬。' },
      ],
    },
    {
      id: 'cicd15-s-ci', title: '第一關：CI 管線守住 main',
      blocks: [
        { type: 'p', text: 'CI 管線（continuous integration pipeline）的價值在於每一次整合都被自動檢查：程式在合併進主線之前，就有 lint 與測試告訴你它壞了。但一個 workflow 檔案本身不會擋下任何東西。先照現況走一次：' },
        { type: 'example', id: 'cicd15-ex-unguarded' },
        { type: 'p', text: '三個缺口疊在一起：CI 不在 PR 上執行，所以 PR 沒有任何檢查；main 沒有保護，所以沒有規則要求檢查通過或有人核准；合併之後 main 的 CI 才第一次執行，兩個 job 都失敗，而壞掉的程式已經在主線上、隨時可能被部署。把 CI 變成守門員需要三件事一起成立：' },
        { type: 'table', head: ['設定', '做什麼', '少了它'], rows: [
          ['`on: pull_request`（branches: [main]）', 'CI 在 PR 的試合併 commit 上執行，結果以 job 名稱（lint、test）掛在 PR 上', 'PR 沒有檢查，必要的檢查永遠等不到（no checks reported）'],
          ['分支保護：必要的狀態檢查 `lint`、`test`（strict）', '檢查沒有全部成功，PR 不能合併；strict 要求 PR 包含 main 最新的 commit', '紅色的 PR 照樣合併'],
          ['分支保護：要求 PR 與 1 個核准', '不能直接推送到 main（GH006），每個變更都有人看過', '有人在本機合併後直接推送，跳過 CI 與審查'],
          ['`enforce_admins: true`', '管理員也照規則走', 'admin 可以推送或以 --admin 合併，規則只對別人有效'],
        ] },
        { type: 'p', text: '分支保護以 `gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input 檔案` 設定，內容一定要有 `required_status_checks`、`enforce_admins`、`required_pull_request_reviews` 與 `restrictions` 四個欄位（不用的寫 `null`）。PR 的 CI 讀的是試合併 commit 上的 workflow 檔案，所以「加上 pull_request 觸發」可以和修正放在同一個 PR 裡，第一次就生效。開 PR 之後用 `gh pr checks --watch` 等檢查結束，`gh pr view` 看審查，最後 `gh pr merge --squash --delete-branch`：main 只多一個 commit，標題帶著 PR 的編號。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有 CI 就等於 main 受到保護', text: 'CI 只會「報告」結果，不會「阻止」任何事：沒有分支保護，紅色的 PR 一樣能合併，也有人可以直接推送到 main。反過來，只設保護而 CI 不在 PR 上執行，必要的檢查永遠不會出現，每個 PR 都卡住，最後有人會把保護關掉。觸發條件、必要的檢查與要求 PR 三者要一起設定，CI 才是真正的關卡。' },
      ],
    },
    {
      id: 'cicd15-s-image', title: '第二關：容器建置：建置一次，以 commit 為標籤',
      blocks: [
        { type: 'p', text: '容器建置（container build）是把通過測試的程式變成可以部署的產出物。團隊的原則是「建置一次，到處部署」：main 的每個 commit 只建置一次 Image，標上 `sha-<commit>` 推送到 Registry，之後 staging 與 production 部署的、出事時回滾的，都是這一份內容，而不是各自重新建置。' },
        { type: 'table', head: ['決定', '本課的做法', '為什麼'], rows: [
          ['什麼時候建置', '推送到 main（以及手動的 `workflow_dispatch`）', '只有經過 PR、CI 與審查的程式才會變成產出物'],
          ['標籤', '`orders-api:sha-${{ github.sha }}`', '從 Image 追溯到確切的 commit；latest 會移動，說不出它是哪一版'],
          ['登入 Registry', '`env:` 放進 `REGISTRY_TOKEN`，`echo "$REGISTRY_TOKEN" | docker login … --password-stdin`', 'Token 不會成為指令的參數；日誌把 secret 的值遮蔽成 ***'],
          ['相依套件的快取', '`actions/cache@v4` 快取 `~/.npm`，key 是 `npm-${{ hashFiles(\'package-lock.json\') }}`，restore-keys 是 `npm-`', 'lockfile 沒變時完全命中，npm ci 從 28 秒變成 5 秒；lockfile 改變時 key 跟著變'],
          ['權限', '`permissions: contents: read`', '推送 Image 用的是 Registry 的 Token，不需要 GITHUB_TOKEN 的寫入權限'],
        ] },
        { type: 'p', text: '第一次的 run 找不到快取（Cache not found），`npm ci` 從網路下載，job 成功之後 post step 才把 `~/.npm` 存成那個 key；第二次 lockfile 沒有變，key 完全相同，還原後完全命中（cache-hit 是 true），完全命中時也不再存檔。所以要驗證快取，一定要看第二次的 run：`gh run view 編號 --log | grep Cache` 會看到 `Cache restored from key: npm-…`。快取的是下載資料夾 `~/.npm`，不是 `node_modules`：`npm ci` 每次都會刪掉 node_modules 重新安裝。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：日誌會遮蔽 secret，所以怎麼傳都安全', text: '遮蔽只是把日誌裡出現的 secret 值換成 ***。寫成 `docker login -u ci-bot -p "${{ secrets.REGISTRY_TOKEN }}"` 時，運算式在 Bash 執行前就被代換成 Token 本身，它成了 docker 的命令列參數，同一台 runner 上能看行程清單的程式都看得到，docker 也會警告 Using --password via the CLI is insecure。secret 要經由環境變數進到 step，再從標準輸入交給需要它的程式；遮蔽是最後一道防線，不是第一道。' },
      ],
    },
    {
      id: 'cicd15-s-config', title: '第三關：設定與 secret 依環境分開',
      blocks: [
        { type: 'p', text: '部署到 staging 與 production 的是同一份 workflow、同一份 Image，差別只在設定：連到哪一台主機、用哪一把金鑰。GitHub 的 environment 讓這件事變得明確：寫了 `environment: staging` 的 job 才拿得到 staging 的 variable 與 secret；production 的 secret 只有在 production 的保護規則（審核者、分支規則）通過之後才會交給 job。Leo 寫了一個設定檢查 config-check.yml：每個環境各一個 job，印出看得到的 variable，再用那個環境的金鑰 ssh 到它的主機。現況是這樣：' },
        { type: 'example', id: 'cicd15-ex-config' },
        { type: 'p', text: 'DEPLOY_KEY 放在儲存庫層級，而且是 production 的金鑰：任何 workflow 的任何 job（包括 PR 上的 CI）都讀得到它；環境裡沒有 DEPLOY_HOST，兩個 job 都不知道要連到哪裡。每個值應該放在剛好需要它的那一層：' },
        { type: 'table', head: ['值', '放在哪裡', '理由'], rows: [
          ['DEPLOY_HOST（staging-01、prod-01）', 'environment 的 variable', '不是秘密，依環境不同；`gh variable set DEPLOY_HOST -e staging --body staging-01`'],
          ['DEPLOY_KEY（各環境的 ssh 私鑰）', 'environment 的 secret', '只給部署到那個環境的 job；`gh secret set DEPLOY_KEY -e production < ~/keys/prod-deploy`'],
          ['REGISTRY_PULL_TOKEN、KNOWN_HOSTS', '儲存庫的 secret', '兩個環境共用；拉取 Token 只能讀取，主機公鑰本來就是公開的資訊'],
          ['REGISTRY_TOKEN（推送）', '儲存庫的 secret', 'Release 的 image job 用它推送，不經過 environment'],
          ['production 的保護規則', '`gh api -X PUT …/environments/production`', '審核者 Ada、prevent self-review、只有受保護的分支可以部署'],
        ] },
        { type: 'p', text: '最小權限（least privilege）在這裡有兩個意思：secret 只交給需要它的 job（environment 層級），而且只在通過保護規則之後；每把金鑰只開一扇門（staging 的金鑰登入不了 prod-01）。審核者在 REST 裡以使用者的 id 指定，`gh api users/ada-nwosu` 查得到。設定好之後再執行一次 config-check：production 的 job 先等 Ada 核准，兩個 job 各自印出自己的 DEPLOY_HOST 並連到自己的主機。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：variable 只是另一種存放設定的地方，放金鑰也可以', text: 'variable 是「不是秘密的設定」：它不會被遮蔽，Leo 的檢查用 `toJSON(vars)` 把它們全部印出來，日誌裡就是原文；任何能讀日誌的人都拿得到。金鑰、Token、密碼只能存成 secret：`gh secret list` 只顯示名稱，值在日誌裡被換成 ***。放錯層也一樣危險：沒有加 -e 的 DEPLOY_HOST 會變成儲存庫層級，staging 的 job 也看到 prod-01，部署 staging 的指令就打到 production。' },
      ],
    },
    {
      id: 'cicd15-s-deploy', title: '第四關：部署管線：以 digest 從 staging 晉升到 production',
      blocks: [
        { type: 'p', text: 'Leo 把 Release 擴充成三個 job：image 建置並推送，輸出推送後的 digest；staging 部署並做冒煙測試；production 依賴前兩者。部署由 scripts/deploy.sh 完成：寫入金鑰與 known_hosts、在主機上以 deploy 帳號登入 Registry、拉取、移除舊的 web 容器、以新的 Image 執行。冒煙測試以 `curl -fsS` 檢查 `/healthz` 與 `/api/menu`，失敗時 curl 的結束碼不是 0，step 失敗，之後的 job 不會執行。' },
        { type: 'example', id: 'cicd15-ex-draft' },
        { type: 'table', head: ['草稿的問題', '後果', '修正'], rows: [
          ['`permissions: write-all`', '每個 job 的 GITHUB_TOKEN 都能改寫程式碼、PR 與設定，任何一個被攻破的 step 都能拿來推送', '`permissions:` 只有 `contents: read`'],
          ['IMAGE 是 `:sha-${{ github.sha }}` 標籤', 'staging 測過的和 production 跑的不保證是同一份內容；標籤可以被重新推送', '`@${{ needs.image.outputs.digest }}`'],
          ['production job 沒有 `environment: production`', '拿不到 production 的 DEPLOY_HOST 與 DEPLOY_KEY，也完全跳過 Ada 的核准與分支規則，沒有部署紀錄', '加上 `environment: production`'],
        ] },
        { type: 'p', text: '修好之後經由 PR 合併：合併本身就是推送到 main，Release 開始執行。image job 建置並推送，staging job 部署同一個 digest 並通過冒煙測試，production job 進入等待（`gh run view` 顯示 Waiting for review），Ada 核准之後才拿到 production 的金鑰，部署到 prod-01。`gh run watch 編號` 會一直等到 run 結束；最後以 `curl -s http://prod-01:8000/` 確認版本，`gh api \'repos/{owner}/{repo}/deployments?environment=production\'` 看部署紀錄。`concurrency: production` 讓兩次發布不會同時替換同一台主機的容器。' },
        { type: 'list', items: [
          '晉升（promotion）的是產出物，不是原始碼：production 不重新建置，只部署 staging 已經驗證過的 digest。',
          '環境的順序寫在 `needs` 裡：production 依賴 staging，staging 的冒煙測試失敗，production 根本不會開始。',
          '人工核准放在最後一道：Ada 看得到 staging 的結果再決定；prevent self-review 讓觸發的人不能核准自己的部署。',
          '部署紀錄由平台自動留下：哪個 commit、什麼時候、由哪個 run 部署到哪個環境，回滾時就靠它找到上一個版本。',
        ] },
        { type: 'callout', tone: 'tip', title: '冒煙測試要測使用者真正會走的路', text: '只檢查 `/healthz` 的冒煙測試只能證明程式活著。這條管線多檢查了 `/api/menu`，但第六關會看到，1.6.0 壞的是取餐時段，冒煙測試仍然通過；每一次事故都可能讓冒煙測試多一個路徑。' },
      ],
    },
    {
      id: 'cicd15-s-strategy', title: '第五關：部署策略與監控',
      blocks: [
        { type: 'p', text: '終端機裡的 prod-01 一次換掉整個容器。production 真正的機群是 8 個執行個體在負載平衡器後面，每個每分鐘最多承接 250 個請求，平常每分鐘 1,600 個請求。下一個版本 1.6.0 加上了集點功能，團隊這次要用部署策略（deployment strategy）限制出錯時的影響範圍：金絲雀發布（canary release）先把一小部分流量交給新版本，觀察一段時間，閘門（gate）通過才擴大，否則立刻切回舊版本。下面的部署模擬器是示意資料：1.6.0 的取餐時段有一個錯誤，它承接的請求有 40‰ 失敗；閘門要求新版本在每一步的觀察期間至少承接 400 個請求，錯誤率不超過 10‰。' },
        { type: 'example', id: 'cicd15-d-canary160' },
        { type: 'p', text: 'Leo 的第一個提案是「25% 觀察 5 分鐘，然後 100%」：閘門確實在第一步就判定失敗並回滾，但這 5 分鐘裡 1.6.0 承接了 2,000 個請求、80 個失敗。第一步越大，壞版本傷到的人越多；可是第一步也不能太小：觀察期間的請求少於閘門的最低樣本數時，模型把它視為未通過（fail closed）而中止，看起來很安全，其實什麼也沒有判斷，連沒問題的版本也發布不出去。下面是修好之後的 1.6.1 以團隊最後採用的三步計畫發布：' },
        { type: 'example', id: 'cicd15-d-canary161' },
        { type: 'table', head: ['策略', '新版本有錯時的影響', '成本與限制'], rows: [
          ['一次替換（終端機裡的單一主機）', '所有使用者，直到回滾完成', '最簡單，不需要額外的執行個體'],
          ['滾動更新', '隨著替換的比例增加，直到發現並回滾', '幾乎不需要額外資源；新舊版本同時服務'],
          ['藍綠部署', '切換後的所有流量，但可以立即切回', '切換期間要兩倍的執行個體'],
          ['金絲雀發布加閘門', '只有第一步的那一小部分流量', '要有足夠的流量讓閘門判斷；整個發布比較久，額外的執行個體分鐘也比較多'],
        ] },
        { type: 'p', text: '閘門只在發布的那幾分鐘有用；發布之後，要靠監控與告警（monitoring and alerting）發現問題。下面是 production 最近三小時的儀表板（示意資料，第 0 分鐘是 11:00）：兩次事故（付款服務逾時、資料庫主機切換），還有 12:50 報表批次重新啟動造成的一分鐘尖峰與 CPU 升高，那不是事故。課程的規則是團隊沿用的舊告警：CPU 超過 70%。' },
        { type: 'example', id: 'cicd15-board' },
        { type: 'p', text: '舊規則對著原因（CPU）告警：它只在批次尖峰時觸發一次（誤報），兩次真正的事故都沒有發現。好的告警對著使用者的症狀：錯誤率直接反映「點餐失敗了」。門檻要高於平常的波動、低於最小的那次事故；持續時間（`for`）讓一分鐘的尖峰不會叫醒人，但不能長到偵測太慢；長視窗的平均會把短而嚴重的事故稀釋。在探索器裡換條件，看通知、誤報與每個事故的偵測延遲怎麼變化。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：金絲雀的第一步越小越安全', text: '第一步太小，閘門拿不到足夠的樣本：1% 的流量觀察 10 分鐘只有 160 個請求，低於 400 的最低樣本數，閘門無從判斷，只能中止（fail closed）。對壞版本這看起來是「擋下來了」，但它擋下的是每一個版本；把最低樣本數調低，則是用太少的請求做決定，40‰ 的錯誤在 100 個請求裡可能只出現 4 次，運氣好就漏掉了。第一步要小到傷害有限、又大到在觀察期間累積足夠的請求，兩者都要算。' },
      ],
    },
    {
      id: 'cicd15-s-drill', title: '第六關：回滾演練與事後檢討',
      blocks: [
        { type: 'p', text: '再好的管線、閘門與告警，也會有漏網之魚。回滾演練（rollback drill）是在不影響使用者的複本上重現一次壞掉的發布，讓每個值班的人都親手走過一次：查證、經由管線回滾、確認恢復、記錄。演練腳本以當天的方式重現：Release 先部署 main 的 1.5.0，接著合併 Leo 的 1.6.0（PR #14），Release 再把 1.6.0 部署到兩個環境；兩次的冒煙測試都通過，因為它們不檢查取餐時段。' },
        { type: 'example', id: 'cicd15-ex-drill' },
        { type: 'p', text: 'production 的部署紀錄新的在前：1900000004 是 1.6.0，1900000002 是之前的 1.5.0。那一筆的 statuses 最上面是 inactive（1.6.0 成功之後它不再是線上的部署），`log_url` 指向 run 4100000001 的 production job：回滾要的 digest 就在那個 run 的日誌裡（Deploy step 印出的 `orders-api@sha256:…`；日誌裡第一個 `sha256:` 是 `docker build -q` 印出的 Image ID，不是 digest）。Mina 在 PR #12 寫好的 rollback.yml 只接受 digest，經過和 Release 相同的 production 環境（Ada 核准、production 的金鑰、`concurrency: production`），冒煙測試多檢查了取餐時段，而且不建置任何東西。' },
        { type: 'table', head: ['做法', '結果'], rows: [
          ['以 rollback.yml 部署上一筆 production 部署的 digest', '幾分鐘內回到跑過、驗證過的 1.5.0，有核准、冒煙測試與部署紀錄'],
          ['重新執行 Release', '建置的是 main 目前的 1.6.0，部署的仍是壞掉的版本'],
          ['在 main 上 revert 再推送', 'main 受保護，被拒絕；就算經由 PR，也是重新建置一份沒有在 production 跑過的新 Image'],
          ['以最新一筆部署的 digest 回滾', '那正是 1.6.0，rollback 的冒煙測試失敗'],
          ['直接 ssh 到 prod-01 換容器', '服務恢復了，但沒有核准、沒有冒煙測試，部署紀錄仍說 production 是 1.6.0'],
        ] },
        { type: 'p', text: '演練當天的監控與團隊記下的事件在下面的儀表板（示意資料，第 0 分鐘是 14:00；演練複本接收重播的流量），告警就是第五關設計的那條規則。打開事故時間線：偵測時間是偵測到減去事故開始，確認時間是確認接手減去偵測到，止血時間是止血完成減去事故開始，恢復時間是影響結束減去事故開始（CICD14 的定義）。' },
        { type: 'example', id: 'cicd15-drill-board' },
        { type: 'p', text: '回滾之後 main 仍是 1.6.0，下一次推送就會把它帶回來，所以回滾幾乎一定接著一次向前修復（1.6.1，經由 PR 與整條管線）。演練的紀錄照 CICD14 的範本寫成不究責的事後檢討：時間線附上 run 與部署的編號、回滾到的 digest；促成因素只寫系統與條件，例如冒煙測試不經過取餐時段、1.6.0 沒有走金絲雀；每個行動項目都有負責人與期限，例如「冒煙測試加上 /api/pickup-slots」、「Release 的 production job 改成第五關的金絲雀計畫」。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：回滾就是 revert 之後重新部署', text: '`git revert` 加上重新部署是向前修復：它產生一個新的 commit、建置一份新的 Image，要重新跑 CI、審查、staging 與兩次核准，digest 也和之前跑過的那一份不同。真正的回滾不建置任何東西，只把之前已經在 production 證明過的那個 digest 換回去，所以快，也比較確定；revert 是回滾之後讓 main 與線上一致的下一步。' },
      ],
    },
    {
      id: 'cicd15-s-recap', title: '整條流程：每一關守住什麼',
      blocks: [
        { type: 'p', text: '把六個關卡接起來，就是一個 commit 從筆電到 production 的完整路徑。每一關都是一道有紀錄、可以驗證的關卡，而不是某個人記得要做的事：' },
        { type: 'table', head: ['從', '到', '關卡', '紀錄在哪裡'], rows: [
          ['筆電上的 commit', 'main', 'PR、CI 的 lint 與 test、Ravi 的核准（分支保護強制）', 'PR 與它的檢查'],
          ['main 的 commit', 'Registry 上的 Image', 'Release 的 image job：測試、建置一次、以 sha 標籤推送', 'run 的日誌與 digest'],
          ['Image', 'staging', '同一個 digest、staging 的設定與金鑰、冒煙測試', 'staging 的部署紀錄'],
          ['staging', 'production', 'Ada 的核准、只有受保護的分支、production 的金鑰、冒煙測試', 'production 的部署紀錄'],
          ['production', '使用者', '金絲雀的閘門、對症狀的告警', '儀表板與告警的觸發期間'],
          ['出事時', '上一個正常的版本', 'rollback.yml：只接受 digest、同一個環境的核准與冒煙測試', 'rollback 的 run、新的部署紀錄、事故時間線'],
        ] },
        { type: 'callout', tone: 'tip', title: '先讓流程可以重複，再讓它變快', text: '這條管線比「在筆電上跑完測試就 ssh 上去部署」慢，也多了等待核准的時間。換到的是每一次發布都走同一條路、留下同樣的紀錄，出事時知道上一個正常的版本在哪裡、怎麼安全地回去。之後再依 DORA 指標（CICD01）找最慢的那一段改進：自動化更多檢查、縮短等待，而不是拿掉關卡。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '小芽咖啡 orders-api：從 commit 到上線的六個關卡',
    stages: [
      { title: 'CI 管線守住 main', concepts: ['CICD02', 'CICD03', 'CICD04', 'CICD05'], goal: '保護 main（lint、test 與 1 個核准，管理員也適用），讓 CI 在 PR 上執行，經由 PR 修好失敗的測試並以 squash 合併。', detail: 'gh api PUT 分支保護；on: pull_request；GH006；no checks reported；checks --watch；Ravi 的審查；同一個 PR 裡修改 workflow 也生效。' },
      { title: '容器建置', concepts: ['CICD06', 'DKR11'], goal: 'main 的每個 commit 只建置一次 Image，推送 sha-<commit> 到 cr.sprout.example，第二次的 run 快取完全命中。', detail: 'actions/cache 的 key 與 restore-keys；快取 ~/.npm 不是 node_modules；env 加 --password-stdin；不推送 latest；經由 PR 進到 main。' },
      { title: '設定與 secret', concepts: ['CICD07', 'CICD08'], goal: '依環境設定 DEPLOY_HOST 與 DEPLOY_KEY，刪除儲存庫層級的 production 金鑰，保護 production，讓設定檢查在兩個環境都通過。', detail: 'gh variable／secret set -e；從檔案以標準輸入給值；variable 不遮蔽；審核者的 id 與 prevent self-review；只有受保護的分支。' },
      { title: '部署管線', concepts: ['CICD09'], goal: '修好草稿的權限、digest 與 environment，以同一個 digest 從 staging 晉升到 production。', detail: 'needs 的順序；image job 的 digest output；Ada 的核准；deploy.sh 與 curl -fsS 冒煙測試；concurrency；部署紀錄。' },
      { title: '部署策略與監控', concepts: ['CICD10', 'CICD11', 'CICD12'], goal: '替 1.6.0 選一個閘門在足夠樣本上判定失敗、錯誤又少的金絲雀計畫，並寫一條及時又沒有誤報的告警。', detail: '第一步的大小與觀察時間、最低樣本數與 fail closed；對症狀告警、門檻、持續時間與視窗。' },
      { title: '回滾演練', concepts: ['CICD13', 'CICD14'], goal: '1.6.0 上線後取餐時段回 500：經由 rollback.yml 回到上一筆部署的 digest，確認恢復並算出四個時間。', detail: '部署紀錄 → log_url → run 的日誌；Image ID 不是 digest；不重新建置、不 ssh 換容器；Ada 核准；事後檢討的行動項目。' },
    ],
  },
  quiz: QUIZ,
  terminal: { machines: [ciLab, imageLab, configLab, deployLab, drillLab], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    rollouts: [
      { id: 'cicd15-d-canary160', title: '金絲雀發布 1.6.0（Leo 的提案：25% → 100%）',
        description: 'production 的 8 個執行個體、每分鐘 1,600 個請求；1.5.0 的錯誤率 1‰，1.6.0 有一個錯誤（40‰），兩者都要 1 分鐘就緒。閘門：每一步的觀察期間至少 400 個請求、錯誤率不超過 10‰。在探索器裡改金絲雀的步驟，看閘門怎麼判定、壞版本傷到多少請求。', scenario: canary160 },
      { id: 'cicd15-d-canary161', title: '金絲雀發布 1.6.1（團隊的計畫：10% → 50% → 100%）',
        description: '修好之後的 1.6.1（2‰）以團隊採用的三步計畫發布：每一步觀察 5 分鐘，閘門都通過，最後一步完成後移除 1.5.0。看完成的分鐘、尖峰的執行個體與額外的執行個體分鐘。', scenario: canary161 },
    ],
    dashboards: [
      { id: 'cicd15-board', title: 'orders-api production：11:00–14:00',
        description: 'production 最近三小時的監控（示意資料，第 0 分鐘是 11:00，UTC+8）：錯誤率、每分鐘請求、p95 延遲與 CPU；底色是兩次事故（付款服務逾時、資料庫主機切換），第 110 分鐘的尖峰是報表批次重新啟動，不是事故。課程的規則是團隊沿用的舊告警。', dashboard: productionBoard() },
      { id: 'cicd15-drill-board', title: '回滾演練：11-30 14:00–15:00',
        description: '演練當天的監控（示意資料，第 0 分鐘是 14:00，演練複本接收重播的流量）：錯誤率與每分鐘請求；底色是 1.6.0 影響取餐時段的期間，規則是第五關設計的告警；事故時間線列出團隊記下的事件。', dashboard: drillBoard() },
    ],
    exercises: DEVOPS_EXERCISES,
  },
};

