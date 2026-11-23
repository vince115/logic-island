import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * CICD09 部署管線 (the blueprint's pipeline-sim, terminal-sim on the deploy-hosts profile: engine stages E25 git, E26
 * forge, E27 workflows, E28 actions, E29 artifacts, E30 environments and E31 deploy hosts). A made-up community library
 * network, Bramble Library, on the simulated github.example: Tsai Ning (the learner, gh login ning-tsai, admin of
 * bramble/loans-api), Omar Haddad (platform engineer, wrote the pipeline), Aiko Mori (developer) and Rosa Kim (release
 * manager, the approver persona rosa-kim: she approves a production deployment 900 s after it starts waiting).
 * bramble/loans-api builds an image tagged sha-<commit> on every push to main (build job, npm test as a lesson-declared
 * CI tool, docker build, push to cr.bramble.example, the digest as a job output) and deploys it by digest to staging-01
 * with scripts/deploy.sh over ssh (key from the staging environment's DEPLOY_KEY secret), then smoke-tests
 * http://staging-01:8000/healthz; promote.yml deploys a given digest to prod-01 through the production environment
 * (reviewers ning-tsai and rosa-kim, prevent self-review, protected branches only; main is protected). Both hosts run
 * 1.3.2 deployed by hand; the registry's latest is the old 1.2.0. The built image runs the lesson program
 * `node src/server.js`, which needs config/app.json: without it the container exits at once (connection refused).
 * Two machines: cicd09-lab (before the production job is in the pipeline) and cicd09-release (main has the full
 * pipeline, no run yet; origin/cleanup is Aiko's commit deleting config/app.json). The clock is 2026-11-26 01:30 UTC
 * (09:30 in Asia/Taipei). Organisation, people, hosts and every token are made up; every transcript output was
 * produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const LOANS = 'https://github.example/bramble/loans-api.git';
const AIKO = { name: 'Aiko Mori', email: 'aiko@bramble.example' };
const NING = { name: 'Tsai Ning', email: 'ning@bramble.example' }, OMAR = { name: 'Omar Haddad', email: 'omar@bramble.example' };
const REG = 'cr.bramble.example';
const IMAGE = `${REG}/bramble/loans-api`;
const CI_TOKEN = 'lesson-registry-token-ci-0091';
const PULL_TOKEN = 'lesson-registry-token-deploy-0092';
const NING_TOKEN = 'lesson-registry-token-ning-0093';
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** Commands appending this text to the file with quoted here-documents, in pieces of whole lines (one input is at most 500 characters). */
function appendDoc(path: string, text: string): string[] {
  const out: string[] = [];
  let piece = '';
  const flush = () => { if (piece) out.push(`cat >> ${path} <<'EOF'\n${piece}EOF`); piece = ''; };
  for (const line of text.split('\n').slice(0, -1)) { if (piece.length + line.length + 1 > 440) flush(); piece += `${line}\n`; }
  flush();
  return out;
}
/** The same, replacing the file first. */
const writeDoc = (path: string, text: string) => appendDoc(path, text).map((c, i) => i ? c : c.replace('cat >>', 'cat >'));

const LEARNER_KEY = keyPair('cicd09:learner', 'ning@ning-laptop');
const STAGING_CI_KEY = keyPair('cicd09:staging-deploy', 'deploy@ci-staging');
const PROD_CI_KEY = keyPair('cicd09:prod-deploy', 'deploy@ci-production');
const hostLine = (host: string) => `${host} ${hostKey(`cicd09-${host}`, host).publicLine.split(' ').slice(0, 2).join(' ')}`;
const KNOWN_HOSTS = `# lesson known_hosts for the Bramble deploy hosts\n${hostLine('staging-01')}\n${hostLine('prod-01')}`;

const PKG = '{\n  "name": "loans-api",\n  "version": "1.4.0",\n  "private": true,\n  "scripts": {\n    "start": "node src/server.js",\n    "test": "node --test test/"\n  }\n}\n';
const DOCKERFILE = 'FROM node:22.11.0-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 8000\nCMD ["node", "src/server.js"]\n';
const APP_JSON = '{\n  "port": 8000,\n  "loanDays": 21,\n  "maxRenewals": 2\n}\n';
const SERVER = "const config = require('../config/app.json');\n// GET /loans, POST /loans/:id/renew, GET /healthz\nrequire('./app').listen(config.port);\n";
const DEPLOY_SH = [
  '#!/bin/bash',
  '# Usage: bash scripts/deploy.sh HOST IMAGE',
  '# Needs DEPLOY_KEY, KNOWN_HOSTS and REGISTRY_TOKEN in the environment.',
  'set -eu',
  'host="$1"',
  'image="$2"',
  'mkdir -p ~/.ssh',
  "printf '%s\\n' \"$DEPLOY_KEY\" > ~/.ssh/id_ed25519",
  'chmod 600 ~/.ssh/id_ed25519',
  "printf '%s\\n' \"$KNOWN_HOSTS\" > ~/.ssh/known_hosts",
  `echo "$REGISTRY_TOKEN" | ssh "deploy@$host" docker login ${REG} -u deploy --password-stdin`,
  'ssh "deploy@$host" docker pull -q "$image"',
  "ssh \"deploy@$host\" 'docker rm -f web 2>/dev/null || true'",
  'ssh "deploy@$host" docker run -d --name web -p 8000:8000 "$image"',
  '',
].join('\n');

// ---- Workflows.
const BUILD_JOB = ['  build:', '    runs-on: ubuntu-latest', '    outputs:', '      digest: ${{ steps.push.outputs.digest }}', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm test',
  `      - run: docker build -q -t ${IMAGE}:sha-\${{ github.sha }} .`, '      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`, '      - name: Push', '        id: push', '        run: |',
  `          docker push ${IMAGE}:sha-\${{ github.sha }} | tee push.log`, '          echo "digest=$(tail -n 1 push.log | cut -d \' \' -f 3)" >> "$GITHUB_OUTPUT"'];
const REBUILD = [`      - run: docker build -q -t ${IMAGE}:sha-\${{ github.sha }} .`, '      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`, `      - run: docker push -q ${IMAGE}:sha-\${{ github.sha }}`];
interface Job { job: string; env?: string; host: string; image: string; needs?: string; concurrency?: boolean; smoke?: boolean; before?: string[] }
const deployJob = (o: Job) => [`  ${o.job}:`, ...o.needs ? [`    needs: ${o.needs}`] : [], '    runs-on: ubuntu-latest', ...o.env ? [`    environment: ${o.env}`] : [],
  ...o.concurrency ? ['    concurrency: production'] : [], '    steps:', '      - uses: actions/checkout@v4', ...o.before ?? [], '      - name: Deploy', '        env:',
  '          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}', '          KNOWN_HOSTS: ${{ secrets.KNOWN_HOSTS }}', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}', `        run: bash scripts/deploy.sh ${o.host} ${o.image}`,
  ...o.smoke === false ? [] : ['      - name: Smoke test', `        run: curl -fsS http://${o.host}:8000/healthz`]];
const BY_DIGEST = `${IMAGE}@\${{ needs.build.outputs.digest }}`;
const PIPELINE_HEAD = ['name: Pipeline', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', 'permissions:', '  contents: read', 'jobs:'];
const STAGING: Job = { job: 'staging', env: 'staging', host: 'staging-01', image: BY_DIGEST, needs: 'build' };
const PRODUCTION: Job = { job: 'production', env: 'production', host: 'prod-01', image: BY_DIGEST, needs: '[build, staging]', concurrency: true };
const PIPELINE = wf(...PIPELINE_HEAD, ...BUILD_JOB, ...deployJob(STAGING));
const FULL_PIPELINE = wf(...PIPELINE_HEAD, ...BUILD_JOB, ...deployJob(STAGING), ...deployJob(PRODUCTION));
const PROMOTE = wf('name: Promote', 'on:', '  workflow_dispatch:', '    inputs:', '      digest:', '        description: The digest (sha256:...) that passed on staging', '        required: true',
  'permissions:', '  contents: read', 'jobs:', ...deployJob({ job: 'production', env: 'production', host: 'prod-01', image: `${IMAGE}@\${{ inputs.digest }}`, concurrency: true }));

// ---- Git history.
const COMMITS: TerminalGitCommit[] = [
  { id: 'l1', message: 'Initial commit', author: OMAR, time: '2026-11-02 02:00:00', files: {
    'README.md': '# loans-api\n\nBook loans and renewals for the Bramble Library branches.\n', 'package.json': PKG, 'Dockerfile': DOCKERFILE, '.dockerignore': '.git\n.github\nnode_modules\ntest\n',
    'config/app.json': APP_JSON, 'src/server.js': SERVER, 'src/app.js': '// routes: GET /loans, POST /loans/:id/renew, GET /healthz\n', 'test/loans.test.js': "test('renews a loan twice at most')\n" } },
  { id: 'l2', message: 'Build and push an image for every commit', author: OMAR, time: '2026-11-12 03:00:00', files: { '.github/workflows/pipeline.yml': wf(...PIPELINE_HEAD, ...BUILD_JOB), 'scripts/deploy.sh': DEPLOY_SH }, executable: ['scripts/deploy.sh'] },
  { id: 'l3', message: 'Deploy main to staging, promote by hand', author: OMAR, time: '2026-11-20 03:00:00', files: { '.github/workflows/pipeline.yml': PIPELINE, '.github/workflows/promote.yml': PROMOTE } },
  { id: 'f1', message: 'Show the due date in the loan list', author: AIKO, time: '2026-11-24 08:00:00', files: { 'src/app.js': '// routes: GET /loans (with due dates), POST /loans/:id/renew, GET /healthz\n' } },
];
const releaseCommits = (l4Time: string): TerminalGitCommit[] => [...COMMITS,
  { id: 'l4', parents: ['l3'], message: 'Promote to production after approval', author: NING, time: l4Time, files: { '.github/workflows/pipeline.yml': FULL_PIPELINE } },
  { id: 'l5', message: 'Remove the unused config file', author: AIKO, time: '2026-11-25 09:00:00', files: { 'config/app.json': null } },
];

// ---- Images, hosts and machines.
const TOOLS: TerminalCiTool[] = [
  { command: 'npm test', cases: [{ stdout: '> loans-api@1.4.0 test\n> node --test test/\n\n✔ renews a loan twice at most (1.8ms)\nℹ tests 11\nℹ pass 11\nℹ fail 0', seconds: 6 }] },
];
const loansImage = (tag: string, version: string, created: string): TerminalImage => ({
  name: `${IMAGE}:${tag}`, size: 214_000_000, created, workdir: '/app', cmd: ['node', 'src/server.js'], expose: [8000], service: true,
  http: { port: 8000, responder: `loans-${version.replaceAll('.', '')}` }, logs: [`loans-api ${version} listening on :8000`],
});
const IMAGES: TerminalImage[] = [
  { name: 'node:22.11.0-slim', size: 201_300_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.11.0'] },
  { ...loansImage('1.2.0', '1.2.0', '2026-09-08 06:00:00'), tags: ['latest'] }, loansImage('1.3.2', '1.3.2', '2026-10-27 06:00:00'),
];
const responder = (version: string) => ({ id: `loans-${version.replaceAll('.', '')}`, server: 'node', routes: [{ path: '/', body: `{"service":"loans-api","version":"${version}"}\n` }, { path: '/healthz', body: 'ok\n' }] });

const deployHost = (name: string, address: string, ciKey: { publicLine: string }): TerminalRemote => ({
  host: name, address, hostKey: `cicd09-${name}`, runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [dir('/home', 'root'), dir('/home/deploy', 'deploy', 0o750), dir('/home/deploy/.ssh', 'deploy', 0o700),
    file('/home/deploy/.ssh/authorized_keys', `${ciKey.publicLine}\n${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600)],
  docker: {
    images: [{ ...IMAGES[2], pulled: true }],
    containers: [{ name: 'web', image: `${IMAGE}:1.3.2`, state: 'running', created: '2026-10-28 01:30:00', started: '2026-10-28 01:30:00', ports: ['8000:8000'] }],
  },
});

const lab: TerminalMachine = {
  id: 'cicd09-lab', title: 'ning-laptop（Bramble Library 的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'ning-laptop', profile: 'deploy-hosts',
  timezone: 'Asia/Taipei', now: '2026-11-26 01:30:00',
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  files: [dir('/home', 'root'), dir('/home/learner'), dir('/home/learner/.ssh', 'learner', 0o700), file('/home/learner/.ssh/id_ed25519', LEARNER_KEY.privateText, 'learner', 0o600),
    file('/home/learner/.ssh/known_hosts', `${KNOWN_HOSTS}\n`), file('/home/learner/.registry-token', `${NING_TOKEN}\n`, 'learner', 0o600)],
  git: { user: NING, commits: COMMITS, remotes: [{ url: LOANS, branches: { main: 'l3', 'feature/due-dates': 'f1' } }], repos: [{ path: '/home/learner/loans-api', origin: LOANS }] },
  forge: {
    login: 'ning-tsai', name: 'Tsai Ning', repos: [{
      url: LOANS, description: 'Book loans and renewals for the Bramble Library branches', permission: 'admin',
      protection: [{ branch: 'main' }],
      environments: ['staging', 'production'],
      environmentRules: [{ name: 'production', reviewers: ['ning-tsai', 'rosa-kim'], preventSelfReview: true, branches: 'protected' }],
      approvers: [{ login: 'rosa-kim', name: 'Rosa Kim', after: 900, comment: 'Staging looks good, go ahead.' }],
      secrets: [
        { name: 'REGISTRY_TOKEN', value: CI_TOKEN, updated: '2026-11-12 03:00:00' }, { name: 'REGISTRY_PULL_TOKEN', value: PULL_TOKEN, updated: '2026-11-20 03:00:00' },
        { name: 'KNOWN_HOSTS', value: KNOWN_HOSTS, updated: '2026-11-20 03:00:00' },
        { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd09:staging-deploy', comment: 'deploy@ci-staging' }, env: 'staging', updated: '2026-11-20 03:00:00' },
        { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd09:prod-deploy', comment: 'deploy@ci-production' }, env: 'production', updated: '2026-11-20 03:00:00' },
      ],
    }],
  },
  actions: { tools: TOOLS },
  responders: [responder('1.2.0'), responder('1.3.2'), responder('1.4.0')],
  docker: {
    images: IMAGES,
    programs: [{ command: ['node', 'src/server.js'], needs: ['src/server.js', 'config/app.json'],
      missing: { output: "node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module '../config/app.json'\nRequire stack:\n- /app/src/server.js", exit: 1 },
      service: true, logs: ['loans-api 1.4.0 listening on :8000'], http: { port: 8000, responder: 'loans-140' } }],
    registries: [{ host: REG, users: [{ name: 'ci-bot', token: CI_TOKEN, repos: ['bramble/*'] }, { name: 'deploy', token: PULL_TOKEN, push: false, repos: ['bramble/*'] },
      { name: 'ning-tsai', token: NING_TOKEN, push: false, repos: ['bramble/*'] }] }],
  },
  remotes: [deployHost('staging-01', '10.20.0.11', STAGING_CI_KEY), deployHost('prod-01', '10.20.0.21', PROD_CI_KEY)],
};
const releaseGit = (l4Time: string): TerminalMachine['git'] => ({
  user: NING, commits: releaseCommits(l4Time), remotes: [{ url: LOANS, branches: { main: 'l4', cleanup: 'l5', 'feature/due-dates': 'f1' } }], repos: [{ path: '/home/learner/loans-api', origin: LOANS }],
});
const release: TerminalMachine = { ...lab, id: 'cicd09-release', title: 'ning-laptop（production job 已合併之後）', git: releaseGit('2026-11-25 07:00:00') };

const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd09-hosts', title: '兩台主機、Registry 與部署環境', machine: 'cicd09-lab',
    description: '看部署指令稿怎麼經由 ssh 換掉主機上的容器；確認 staging-01 與 prod-01 目前跑的是 Omar 手動部署的 1.3.2；以自己只能拉取的帳號看 Registry 的 latest 其實是九月的 1.2.0；最後列出 secret 與 production 環境的保護規則。',
    steps: [
      { command: "cd loans-api", output: "" },
      { command: "cat scripts/deploy.sh", output: "#!/bin/bash\n# Usage: bash scripts/deploy.sh HOST IMAGE\n# Needs DEPLOY_KEY, KNOWN_HOSTS and REGISTRY_TOKEN in the environment.\nset -eu\nhost=\"$1\"\nimage=\"$2\"\nmkdir -p ~/.ssh\nprintf '%s\\n' \"$DEPLOY_KEY\" > ~/.ssh/id_ed25519\nchmod 600 ~/.ssh/id_ed25519\nprintf '%s\\n' \"$KNOWN_HOSTS\" > ~/.ssh/known_hosts\necho \"$REGISTRY_TOKEN\" | ssh \"deploy@$host\" docker login cr.bramble.example -u deploy --password-stdin\nssh \"deploy@$host\" docker pull -q \"$image\"\nssh \"deploy@$host\" 'docker rm -f web 2>/dev/null || true'\nssh \"deploy@$host\" docker run -d --name web -p 8000:8000 \"$image\"" },
      { command: "ssh deploy@staging-01 'docker ps --format \"{{.Image}}  {{.Status}}\"'", output: "cr.bramble.example/bramble/loans-api:1.3.2  Up 4 weeks" },
      { command: "curl -s http://staging-01:8000/", output: "{\"service\":\"loans-api\",\"version\":\"1.3.2\"}" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"loans-api\",\"version\":\"1.3.2\"}" },
      { command: "docker login cr.bramble.example -u ning-tsai --password-stdin < ~/.registry-token 2>/dev/null", output: "Login Succeeded" },
      { command: "docker pull -q cr.bramble.example/bramble/loans-api:latest", output: "cr.bramble.example/bramble/loans-api:latest" },
      { command: "docker pull -q cr.bramble.example/bramble/loans-api:1.2.0", output: "cr.bramble.example/bramble/loans-api:1.2.0" },
      { command: "docker images --digests", output: "REPOSITORY                             TAG       DIGEST                                                                    IMAGE ID       CREATED        SIZE\ncr.bramble.example/bramble/loans-api   1.2.0     sha256:5407026c5d28f5989c4f7d3a7196e1afeb5b42c6e65346851554a735315e7d1e   b6fe8b4c415b   2 months ago   214MB\ncr.bramble.example/bramble/loans-api   latest    sha256:5407026c5d28f5989c4f7d3a7196e1afeb5b42c6e65346851554a735315e7d1e   b6fe8b4c415b   2 months ago   214MB" },
      { command: "gh secret list", output: "NAME                 UPDATED\nKNOWN_HOSTS          about 5 days ago\nREGISTRY_PULL_TOKEN  about 5 days ago\nREGISTRY_TOKEN       about 13 days ago" },
      { command: "gh secret list -e production", output: "NAME        UPDATED\nDEPLOY_KEY  about 5 days ago" },
      { command: "gh api repos/{owner}/{repo}/environments/production | grep -E '\"(login|prevent_self_review|protected_branches)\"'", output: "      \"prevent_self_review\": true,\n            \"login\": \"ning-tsai\",\n            \"login\": \"rosa-kim\",\n    \"protected_branches\": true," },
    ],
  },
  {
    id: 'cicd09-staging', title: '推送一次：建置、以 digest 部署到 staging、冒煙測試', machine: 'cicd09-lab',
    description: '看 staging job 的寫法，推送一個 commit，等 Pipeline 跑完；從日誌找出 build job 推送的 digest，確認 staging-01 的容器正是由這個 digest 建立、新版本已經上線，而 prod-01 沒有變；最後看部署紀錄。',
    steps: [
      { command: "cd loans-api", output: "" },
      { command: "sed -n '/^  staging:/,$p' .github/workflows/pipeline.yml", output: "  staging:\n    needs: build\n    runs-on: ubuntu-latest\n    environment: staging\n    steps:\n      - uses: actions/checkout@v4\n      - name: Deploy\n        env:\n          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}\n          KNOWN_HOSTS: ${{ secrets.KNOWN_HOSTS }}\n          REGISTRY_TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}\n        run: bash scripts/deploy.sh staging-01 cr.bramble.example/bramble/loans-api@${{ needs.build.outputs.digest }}\n      - name: Smoke test\n        run: curl -fsS http://staging-01:8000/healthz" },
      { command: "git commit -q --allow-empty -m 'Release the due-date reminder'", output: "" },
      { command: "git push -q", output: "To https://github.example/bramble/loans-api.git\n   a0db94b..0a77c28  main -> main" },
      { command: "gh run watch 4100000001 > /dev/null", output: "" },
      { command: "gh run view 4100000001", output: "✓ main Pipeline · 4100000001\nTriggered via push less than a minute ago\n\nJOBS\n✓ build in 8s (ID 11300000001)\n✓ staging in 2s (ID 11300000002)\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/bramble/loans-api/actions/runs/4100000001" },
      { command: "gh run view 4100000001 --log | grep -o 'digest: sha256:[0-9a-f]*'", output: "digest: sha256:053e17a19c0a2b2cf0a03338edc47192fbcf2fa1dcf8c7bb78da44d6f34c72a9" },
      { command: "gh run view 4100000001 --log | grep 'Smoke test' | tail -n 1 | cut -f 3", output: "2026-11-26T01:30:14.0000000Z ok" },
      { command: "ssh deploy@staging-01 \"docker inspect -f '{{.Config.Image}}' web\"", output: "cr.bramble.example/bramble/loans-api@sha256:053e17a19c0a2b2cf0a03338edc47192fbcf2fa1dcf8c7bb78da44d6f34c72a9" },
      { command: "curl -s http://staging-01:8000/", output: "{\"service\":\"loans-api\",\"version\":\"1.4.0\"}" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"loans-api\",\"version\":\"1.3.2\"}" },
      { command: "gh api repos/{owner}/{repo}/deployments | grep -E '\"(sha|environment|created_at)\"'", output: "    \"sha\": \"0a77c28841aef8a4774ab1d9b079aa1064d4953b\",\n    \"environment\": \"staging\",\n    \"created_at\": \"2026-11-26T01:30:10Z\"," },
    ],
  },
  {
    id: 'cicd09-approve', title: '手動晉升：等待審核、不能自己核准、分支規則', machine: 'cicd09-lab',
    description: '推送一次讓 staging 部署新版，再把 staging 上的 digest 交給 Promote 部署到 production；production 停在環境的關卡，自己核准被拒絕，等 Rosa 核准後才部署；接著看 production 的部署紀錄與狀態的變化，最後試著從功能分支部署到 production。',
    steps: [
      { command: "cd loans-api", output: "" },
      { command: "git commit -q --allow-empty -m 'Release the due-date reminder'", output: "" },
      { command: "git push -q", output: "To https://github.example/bramble/loans-api.git\n   a0db94b..0a77c28  main -> main" },
      { command: "sleep 60", output: "" },
      { command: "D=$(ssh deploy@staging-01 \"docker inspect -f '{{.Config.Image}}' web\" | cut -d @ -f 2)", output: "" },
      { command: "echo $D", output: "sha256:053e17a19c0a2b2cf0a03338edc47192fbcf2fa1dcf8c7bb78da44d6f34c72a9" },
      { command: "gh workflow run promote.yml -f digest=$D", output: "✓ Created workflow_dispatch event for promote.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"promote.yml\"" },
      { command: "sleep 10", output: "" },
      { command: "gh run view 4100000002", output: "* main Promote · 4100000002\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n* production (ID 11300000003)\n\nproduction: Waiting for review: production needs approval to start deploying changes.\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/bramble/loans-api/actions/runs/4100000002" },
      { command: "gh api repos/{owner}/{repo}/actions/runs/4100000002/pending_deployments | grep -E '\"(name|current_user_can_approve|login)\"'", output: "      \"name\": \"production\",\n    \"current_user_can_approve\": false,\n          \"login\": \"ning-tsai\",\n          \"login\": \"rosa-kim\"," },
      { command: "gh api -X POST repos/{owner}/{repo}/actions/runs/4100000002/pending_deployments -F 'environment_ids[]=161088002' -f state=approved -f comment='Ship it'", output: "{\n  \"message\": \"There was a problem approving one of the gates\",\n  \"documentation_url\": \"https://docs.github.com/rest/actions/workflow-runs#review-pending-deployments-for-a-workflow-run\",\n  \"status\": \"422\"\n}\ngh: There was a problem approving one of the gates (HTTP 422)" },
      { command: "gh run watch 4100000002 > /dev/null", output: "" },
      { command: "ssh deploy@prod-01 \"docker inspect -f '{{.Config.Image}}' web\"", output: "cr.bramble.example/bramble/loans-api@sha256:053e17a19c0a2b2cf0a03338edc47192fbcf2fa1dcf8c7bb78da44d6f34c72a9" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"loans-api\",\"version\":\"1.4.0\"}" },
      { command: "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep -E '\"(sha|ref|environment|created_at)\"'", output: "    \"sha\": \"0a77c28841aef8a4774ab1d9b079aa1064d4953b\",\n    \"ref\": \"main\",\n    \"environment\": \"production\",\n    \"created_at\": \"2026-11-26T01:31:00Z\"," },
      { command: "gh api repos/{owner}/{repo}/deployments/1900000002/statuses | grep -E '\"(state|created_at)\"'", output: "    \"state\": \"success\",\n    \"created_at\": \"2026-11-26T01:46:04Z\",\n    \"state\": \"in_progress\",\n    \"created_at\": \"2026-11-26T01:46:02Z\",\n    \"state\": \"waiting\",\n    \"created_at\": \"2026-11-26T01:31:00Z\"," },
      { command: "gh workflow run promote.yml --ref feature/due-dates -f digest=$D", output: "✓ Created workflow_dispatch event for promote.yml at feature/due-dates\n\nTo see runs for this workflow, try: gh run list --workflow=\"promote.yml\"" },
      { command: "sleep 10", output: "" },
      { command: "gh run view 4100000003", output: "X feature/due-dates Promote · 4100000003\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\nX production (ID 11300000004)\n\nANNOTATIONS\nX Branch \"feature/due-dates\" is not allowed to deploy to production due to environment protection rules.\nproduction: .github#0\n\nTo see what failed, try: gh run view 4100000003 --log-failed\nView this run on GitHub: https://github.example/bramble/loans-api/actions/runs/4100000003" },
    ],
  },
  {
    id: 'cicd09-queue', title: 'concurrency：production 一次只部署一個', machine: 'cicd09-release',
    description: '在 production job 已經加進管線的 main 上連續推送三次，每次間隔一分鐘：第一次在等審核，第二次排隊，第三次到來時第二次被取消；等第三次結束，看 run 的清單與 production 的部署紀錄。',
    steps: [
      { command: "cd loans-api", output: "" },
      { command: "grep -B 3 'concurrency' .github/workflows/pipeline.yml", output: "    needs: [build, staging]\n    runs-on: ubuntu-latest\n    environment: production\n    concurrency: production" },
      { command: "git commit -q --allow-empty -m 'Release 1'", output: "" },
      { command: "git push -q", output: "To https://github.example/bramble/loans-api.git\n   e0dcafb..2770d90  main -> main" },
      { command: "sleep 60", output: "" },
      { command: "git commit -q --allow-empty -m 'Release 2'", output: "" },
      { command: "git push -q", output: "To https://github.example/bramble/loans-api.git\n   2770d90..57936b1  main -> main" },
      { command: "sleep 60", output: "" },
      { command: "gh run view 4100000002", output: "* main Pipeline · 4100000002\nTriggered via push about 1 minute ago\n\nJOBS\n✓ build in 8s (ID 11300000004)\n✓ staging in 2s (ID 11300000005)\n* production (ID 11300000006)\n\nproduction: Waiting for a job in the concurrency group 'production' to complete\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/bramble/loans-api/actions/runs/4100000002" },
      { command: "git commit -q --allow-empty -m 'Release 3'", output: "" },
      { command: "git push -q", output: "To https://github.example/bramble/loans-api.git\n   57936b1..6e62f85  main -> main" },
      { command: "sleep 60", output: "" },
      { command: "gh run list", output: "STATUS  TITLE      WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n*       Release 3  Pipeline  main    push   4100000003  1m0s     about 1 minute ago\n-       Release 2  Pipeline  main    push   4100000002  1m14s    about 2 minutes ago\n*       Release 1  Pipeline  main    push   4100000001  3m0s     about 3 minutes ago" },
      { command: "gh run view 4100000002", output: "- main Pipeline · 4100000002\nTriggered via push about 2 minutes ago\n\nJOBS\n✓ build in 8s (ID 11300000004)\n✓ staging in 2s (ID 11300000005)\n- production (ID 11300000006)\n\nANNOTATIONS\nX Canceling since a higher priority waiting request for 'production' exists\nproduction: .github#0\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/bramble/loans-api/actions/runs/4100000002" },
      { command: "gh run watch 4100000003 > /dev/null", output: "" },
      { command: "gh run list", output: "STATUS  TITLE      WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE\n✓       Release 3  Pipeline  main    push   4100000003  28m22s   about 28 minutes ago\n-       Release 2  Pipeline  main    push   4100000002  1m14s    about 29 minutes ago\n✓       Release 1  Pipeline  main    push   4100000001  15m18s   about 30 minutes ago" },
      { command: "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep '\"sha\"'", output: "    \"sha\": \"6e62f859aade435b4cc1b389683289694a88a50e\",\n    \"sha\": \"2770d9029b232b3f2a7986b9479cbc04f6fdd86b\"," },
      { command: "git log --oneline -3", output: "6e62f85 (HEAD -> main, origin/main, origin/HEAD) Release 3\n57936b1 Release 2\n2770d90 Release 1" },
    ],
  },
];

// ---- Exercises (each starts from its machine as declared).
const PIPE = '.github/workflows/pipeline.yml';
const LATEST = '$(gh run list -w pipeline.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)';
const WATCH = `gh run watch ${LATEST} > /dev/null`;
const prodJob = (o: Partial<Job> = {}) => wf(...deployJob({ ...PRODUCTION, ...o }));
const SHIP = ['git commit -qam \'Promote to production after approval\'', 'git push -q'];
const ADD = (o: Partial<Job> = {}) => ['cd loans-api', ...appendDoc(PIPE, prodJob(o)), ...SHIP];
const MERGE = ['cd loans-api', 'git merge -q origin/cleanup', 'git push -q', WATCH];
const RECORD = "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep '\"sha\"' | head -n 1";

const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd09-ex-promote', title: '在管線裡加上 production：核准後晉升同一個 digest', machine: 'cicd09-lab',
    statement: '目前 Pipeline 只把每個 commit 部署到 staging，production 要有人另外手動執行 Promote 並貼上 digest。在 ~/loans-api 的 main 上，於 .github/workflows/pipeline.yml 的最後加上一個名為 `production` 的 job：`needs: [build, staging]`、`environment: production`、`concurrency: production`，step 和 staging 相同（checkout、以 `scripts/deploy.sh` 部署、冒煙測試），但主機換成 prod-01，Image 仍然是 build job 輸出的 digest（`cr.bramble.example/bramble/loans-api@${{ needs.build.outputs.digest }}`），不要重新建置。提交、推送，等這次的 run 結束：production 需要審核，而你不能核准自己觸發的部署，要等 Rosa 核准。',
    checks: [
      { kind: 'deployment', repo: LOANS, environment: 'staging', tip: true, status: 'success', latest: true },
      { kind: 'deployment', repo: LOANS, environment: 'production', tip: true, status: 'success', latest: true },
      { kind: 'run', repo: LOANS, workflow: 'pipeline.yml', tip: true, job: 'production', conclusion: 'success', logIncludes: 'loans-api@sha256:', logExcludes: 'docker build' },
      { kind: 'http', url: 'http://prod-01:8000/', status: 200, body: '"version":"1.4.0"' },
    ],
    solution: [...ADD(), WATCH],
    mistakes: [
      { commands: [...ADD({ image: `${IMAGE}:latest` }), WATCH],
        why: 'production 部署 latest：Registry 的 latest 是九月手動推送的 1.2.0，production 換成了一個沒人在 staging 測過的舊版本' },
      { commands: [...ADD({ needs: 'staging', image: `${IMAGE}:sha-\${{ github.sha }}`, before: REBUILD }), WATCH],
        why: '在 production job 裡重新建置並推送：那是一份沒有在 staging 驗證過的新 Image，digest 也和 staging 上的不同' },
      { commands: [...ADD({ needs: 'staging' }), WATCH],
        why: 'needs 只寫 staging：needs context 只含直接依賴的 job，needs.build.outputs.digest 是空字串，Image 變成 loans-api@，docker pull 回報 invalid reference format' },
      { commands: [...ADD({ env: undefined }), WATCH],
        why: '少了 environment: production：沒有審核也沒有部署紀錄，而 DEPLOY_KEY 是 production 環境的 secret，這個 job 拿到空字串，ssh 連不上 prod-01' },
      { commands: [...ADD(), 'sleep 300'], why: '推送後只等了 5 分鐘：staging 已經成功，但 production 還在等待審核（waiting），沒有部署' },
      { commands: [...ADD(), 'sleep 60', "gh api -X POST repos/{owner}/{repo}/actions/runs/4100000001/pending_deployments -F 'environment_ids[]=161088002' -f state=approved -f comment='Ship it'", 'sleep 60'],
        why: '想自己核准：production 開啟了 prevent self-review，觸發 run 的人不能核准（HTTP 422），部署仍在等 Rosa' },
    ],
    hints: [
      '先看 staging job 的寫法：`sed -n \'/^  staging:/,$p\' .github/workflows/pipeline.yml`；production 幾乎一樣，只差 needs、environment、concurrency 與主機',
      '用 `cat >> .github/workflows/pipeline.yml <<\'EOF\'` 把新的 job 接在檔案最後，縮排和 staging 相同（job 名稱前 2 格）',
      '`needs.build.outputs.digest` 只有在 build 列在 needs 裡時才看得到，所以要寫 `needs: [build, staging]`',
      '推送後 `gh run watch 編號` 會一直等到 Rosa 核准、production 結束；`gh run view 編號` 可以看到 `Waiting for review`',
    ],
    explanation: '同一個 run 裡，build 只建置一次並輸出 digest，staging 部署它並通過冒煙測試之後，production 才開始；production 先停在環境的關卡等待審核，Rosa 核准後才拿到 production 的 DEPLOY_KEY，把同一個 digest 部署到 prod-01，再做一次冒煙測試。兩筆部署紀錄都指向 main 目前的 commit，prod-01 跑的正是在 staging 驗證過的那一份。這是持續交付：每個 commit 都自動走到「可以上線」，上不上 production 由人決定；把 production 的審核拿掉，就成了持續部署。`concurrency: production` 讓兩次推送的 production 部署不會同時進行。',
  },
  {
    id: 'cicd09-ex-smoke', title: '冒煙測試擋下的發布', machine: 'cicd09-release',
    statement: '這台機器的 main 已經有完整的管線（build → staging → production，production 等待審核），但還沒有執行過。Aiko 的分支 cleanup 刪掉了她認為沒有用到的 config/app.json，審查已經通過。在 ~/loans-api 把 origin/cleanup 合併進 main 並推送，等 run 結束，找出它為什麼失敗、確認 production 沒有被部署。然後在 main 上修正（不要改寫已推送的歷史、不要拿掉或略過冒煙測試），推送，讓新的 run 通過 staging、經 Rosa 核准後部署到 production。',
    checks: [
      { kind: 'branch', repo: LOANS, name: 'main', includes: 'l5', file: { path: 'config/app.json', includes: '"maxRenewals"' } },
      { kind: 'run', repo: LOANS, workflow: 'pipeline.yml', tip: true, job: 'staging', step: 'Smoke test', conclusion: 'success' },
      { kind: 'deployment', repo: LOANS, environment: 'production', tip: true, status: 'success', latest: true },
      { kind: 'container', host: 'staging-01', name: 'web', state: 'running' },
      { kind: 'http', url: 'http://prod-01:8000/healthz', status: 200, body: 'ok' },
    ],
    solution: [...MERGE, `gh run view ${LATEST} --log-failed`, 'git revert --no-edit HEAD', 'git push -q', WATCH],
    mistakes: [
      { commands: MERGE, why: '合併並推送之後就停了：staging 的冒煙測試失敗，production 是 skipped，main 目前的 commit 沒有任何 production 部署' },
      { commands: [...MERGE, `gh run rerun ${LATEST} --failed`, 'sleep 60'], why: '重新執行失敗的 job：Image 裡仍然沒有 config/app.json，容器一啟動就結束，冒煙測試照樣失敗' },
      { commands: [...MERGE, ...writeDoc(PIPE, wf(...PIPELINE_HEAD, ...BUILD_JOB, ...deployJob({ ...STAGING, smoke: false }), ...deployJob({ ...PRODUCTION, smoke: false }))),
        "git commit -qam 'Skip the smoke tests'", 'git push -q', WATCH],
        why: '拿掉冒煙測試讓管線變綠：壞掉的 Image 一路部署到 production，prod-01 的容器一啟動就結束，借書服務停擺' },
      { commands: ['cd loans-api', 'git merge -q origin/cleanup', 'git revert --no-edit HEAD', 'git push -q', 'sleep 60'],
        why: '修正推送了，卻沒有等審核：production 還在等 Rosa 核准（waiting）' },
      { commands: ['cd loans-api', "git commit -q --allow-empty -m 'Redeploy main'", 'git push -q', WATCH],
        why: '沒有合併 cleanup：題目要的是把 Aiko 的變更合併進來，再修正它造成的問題' },
    ],
    hints: [
      '`gh run view 編號` 看哪個 job 的哪個 step 失敗；`gh run view 編號 --log-failed` 看 curl 的錯誤',
      '`ssh deploy@staging-01 docker ps -a` 與 `ssh deploy@staging-01 docker logs web` 看容器為什麼停了',
      '已經推送的 commit 用 `git revert --no-edit HEAD` 產生一個反向的 commit，不要 reset 再強制推送',
      '推送修正後，`gh run watch 編號` 會等到 Rosa 核准、production 結束',
    ],
    explanation: 'config/app.json 其實被 src/server.js 讀取。刪掉之後 `npm test` 照樣通過、Image 照樣建得出來，`docker run -d` 也回報成功，部署的 step 是綠的；但容器一啟動就因為找不到檔案而結束，冒煙測試的 curl 連不上 8000 埠（exit code 7），staging job 失敗，依賴它的 production 被略過，prod-01 繼續跑 1.3.2，沒有任何使用者受到影響。`git revert` 讓 main 往前多一個把檔案加回來的 commit，新的 run 重新建置、在 staging 通過冒煙測試，經 Rosa 核准後部署到 production。拿掉冒煙測試或重跑失敗的 job 都只是讓訊號消失或重複，壞掉的版本不會因此變好。',
  },
  {
    id: 'cicd09-ex-record', title: '從部署紀錄找出 production 上的 commit', machine: 'cicd09-release',
    statement: '在 ~/loans-api 先用 `gh workflow run pipeline.yml` 把 main 目前的 commit 手動部署一次，等 run 結束（production 會等 Rosa 核准）。接著把 origin/cleanup 合併進 main 並推送，等這次的 run 結束。現在 main 的最新 commit 和 production 上跑的不一樣了。用 `gh api` 查 production 環境的部署紀錄，印出最新一筆部署的 sha 那一行（在 `gh api` 的結果後面接 `grep \'"sha"\' | head -n 1`）。',
    checks: [{ kind: 'output', fromCommand: '^gh api ' }],
    solution: ['cd loans-api', 'gh workflow run pipeline.yml', WATCH, 'git merge -q origin/cleanup', 'git push -q', WATCH, RECORD],
    mistakes: [
      { commands: ['cd loans-api', 'gh workflow run pipeline.yml', WATCH, 'git merge -q origin/cleanup', 'git push -q', WATCH, 'git rev-parse HEAD'],
        why: 'main 的最新 commit 是 cleanup：它在 staging 失敗，從來沒有部署到 production' },
      { commands: ['cd loans-api', 'gh workflow run pipeline.yml', WATCH, 'git merge -q origin/cleanup', 'git push -q', WATCH, 'gh api repos/{owner}/{repo}/deployments | grep \'"sha"\' | head -n 1'],
        why: '沒有篩選 environment：最新的一筆是 cleanup 在 staging 的部署（失敗的那一次），不是 production 的' },
      { commands: ['cd loans-api', 'gh workflow run pipeline.yml', WATCH, 'git merge -q origin/cleanup', 'git push -q', WATCH, 'gh run list -w pipeline.yml -L 1'],
        why: '最新的 run 是 cleanup 的那一次，而且它的 production job 被略過；run 的清單回答不了 production 上是哪個 commit' },
    ],
    variants: [{ label: 'production job 的 commit 不同', files: [], git: releaseGit('2026-11-25 07:40:00') }],
    hints: [
      '`gh workflow run pipeline.yml` 之後，`gh run list -w pipeline.yml -L 1` 找到編號，`gh run watch 編號` 等它結束',
      '部署紀錄可以依環境篩選：`gh api \'repos/{owner}/{repo}/deployments?environment=production\'`（網址有 `?`，整個加上單引號）',
      '紀錄是新的在前；production 的部署只會在 production job 真的到達環境時建立',
    ],
    explanation: 'cleanup 的 run 在 staging 的冒煙測試失敗，production job 被略過，所以 production 沒有它的部署紀錄；production 最新的一筆仍是手動觸發那次部署的 commit（合併前 main 的最新 commit），而且狀態是 success。部署紀錄記下每一次「哪個 commit、部署到哪個環境、什麼時候、狀態如何」，回答「production 上跑的是什麼」要看那個環境的紀錄，不是看 main 的最新 commit，也不是看最新的 run。',
  },
];

export const CICD09: LessonContent = {
  lessonId: 'CICD09',
  motivation: '「loans-api 1.3.2 是 Omar 上個月週五傍晚 ssh 到兩台主機、一行一行打指令部署的。staging 先試了一個下午，到了 production 卻少打了版本號，拉到的是 latest，也就是九月的舊版，續借的規則錯了二十分鐘才被發現；事後大家花了一個早上，才從 docker 的紀錄拼湊出當時 production 跑的到底是哪一版、是誰在什麼時候換上去的。」CICD06 讓每個 commit 都建出一個標記 sha-<commit> 的 Image，CICD07、CICD08 處理了設定與 secret；這一課把最後一段接上，讓管線自己把 Image 送到主機上。依序分清楚持續交付與持續部署，設計從 staging 晉升到 production 的流程（同一個 digest 一路往前、needs 串起順序、環境的人工核准與分支規則、只在 production 拿得到的部署金鑰），在每次部署後用冒煙測試擋下壞掉的版本，最後從部署紀錄回答「哪個 commit、在哪個環境、什麼時候、由誰放行」。全部在模擬的 GitHub Actions 與兩台模擬的 Docker 主機上真的推送、真的部署。',
  sections: [
    {
      id: 'cicd09-s-setup', title: '本課的團隊、主機與管線',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的社區圖書館聯盟 Bramble Library，服務 loans-api 處理各分館的借書與續借，程式放在模擬的 `github.example` 上的 bramble/loans-api。你是 Tsai Ning（gh 帳號 ning-tsai，儲存庫的 admin）；Omar Haddad 是平台工程師，寫了管線與部署指令稿；Aiko Mori 是開發者；Rosa Kim 負責發布，是 production 的審核者。模擬的時鐘是 2026-11-26 01:30 UTC（台北時間上午 09:30）。' },
        { type: 'table', head: ['機器', '角色', '目前的狀態'], rows: [
          ['ning-laptop（你的筆電）', '~/loans-api 是儲存庫的複本；有 git、gh、ssh、curl 與 docker', '你的 SSH 金鑰在兩台主機的 deploy 帳號都被接受；~/.registry-token 是你只能拉取的 Registry Token'],
          ['staging-01（10.20.0.11）', '測試環境（staging）的 Docker 主機；帳號 deploy 在 docker 群組裡', '容器 web 跑 `loans-api:1.3.2`，公開 8000 埠'],
          ['prod-01（10.20.0.21）', '正式環境（production）的 Docker 主機，設定相同', '同樣跑 1.3.2，是 Omar 上個月手動部署的'],
          ['cr.bramble.example', '團隊的 Registry', 'ci-bot 可以推送；deploy 與 ning-tsai 只能拉取；`latest` 是九月手動推送的 1.2.0'],
        ] },
        { type: 'table', head: ['workflow', '觸發', '做什麼'], rows: [
          ['pipeline.yml（Pipeline）', '推送到 main，或手動 `gh workflow run`', 'build：`npm test`、`docker build` 標記 `sha-<commit>`、以 ci-bot 推送，並把推送得到的 digest 存成 job 的 output；staging：`needs: build`，以 digest 部署到 staging-01，再做冒煙測試'],
          ['promote.yml（Promote）', '手動，輸入 `digest`', '一個 production job：把指定的 digest 部署到 prod-01，再做冒煙測試。目前 production 只能這樣由人手動晉升'],
        ] },
        { type: 'table', head: ['部署環境', '保護規則', '環境的 secret'], rows: [
          ['staging', '沒有：任何分支都可以部署，不需要審核', '`DEPLOY_KEY`：CI 登入 staging-01 的 SSH 私鑰'],
          ['production', '必要的審核者 ning-tsai 與 rosa-kim（一人核准就夠）；prevent self-review；只有受保護的分支可以部署（main 受保護）', '`DEPLOY_KEY`：CI 登入 prod-01 的另一把私鑰'],
        ] },
        { type: 'p', text: '儲存庫層級的 secret 有 `REGISTRY_TOKEN`（ci-bot，推送）、`REGISTRY_PULL_TOKEN`（deploy，只能拉取，給主機登入 Registry）與 `KNOWN_HOSTS`（兩台主機的公鑰）。課程有兩台機器：cicd09-lab 是現在的狀態，前三個例子與第一題在這裡；cicd09-release 是之後的狀態，production job 已經合併進 main（還沒有執行過），Aiko 的分支 cleanup 等著合併，最後一個例子與後兩題在這裡。' },
        { type: 'example', id: 'cicd09-hosts' },
        { type: 'p', text: 'scripts/deploy.sh 在 runner 上執行：把環境變數裡的私鑰與 known_hosts 寫進 ~/.ssh，然後每一步都是一行 ssh：在主機上登入 Registry、以參數給的名稱拉取 Image、移除舊的容器、啟動新的。`set -eu` 讓任何一步失敗（或用到沒有設定的變數）時立刻結束，step 跟著失敗；`docker rm -f web 2>/dev/null || true` 讓「原本沒有 web 這個容器」不算錯誤，各版本的 Docker 對這種情況的處理不完全一樣，這樣寫最穩。兩台主機都還是 1.3.2；Registry 的 `latest` 和 `1.2.0` 是同一個 digest，正是開頭故事裡被誤拉的那一版。`gh secret list` 看不到 `DEPLOY_KEY`，它是環境的 secret，要加上 `-e production` 才列得出來。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'workflow 真的會執行，runner 真的以 ssh 連到兩台主機、在上面執行 docker，`curl` 看到的是主機上實際跑的容器。為了讓課程可以重現，有幾個簡化：runner 可以直接連到這兩台主機（真實的 GitHub-hosted runner 在網際網路上，主機通常要開放 SSH，或改用放在內部網路的 self-hosted runner）；ssh、拉取與啟動容器不花時間；`npm test` 的結果是課程宣告的；Rosa 是模擬的審核者，在部署開始等待後 15 分鐘核准。gh 與 REST 的部分欄位與訊息依記得的格式模擬，可能和真實的版本略有不同。組織、人物、主機與 Token 都是虛構的。' },
      ],
    },
    {
      id: 'cicd09-s-cd', title: '持續交付與持續部署',
      blocks: [
        { type: 'p', text: 'CICD03 的持續整合（continuous integration）讓每次推送都自動建置並測試，回答的是「這個變更有沒有弄壞什麼」。持續交付與持續部署再往後延伸：持續交付（continuous delivery）是讓每一個通過管線的變更都隨時可以部署到正式環境，部署本身是一個可靠、重複、按一下就完成的動作，但什麼時候上 production 由人決定；持續部署（continuous deployment）則連這個決定也交給管線，每一個通過所有檢查的變更都自動部署到正式環境，中間沒有人工步驟。兩者都常縮寫成 CD，所以談的時候要說清楚是哪一個。' },
        { type: 'table', head: ['', '持續整合', '持續交付', '持續部署'], rows: [
          ['自動做到哪裡', '建置與測試', '建置、測試、部署到測試環境並驗證，產出一個隨時可以上線的版本', '一路到正式環境'],
          ['誰決定上 production', '（還沒談到部署）', '人：按下核准或手動觸發', '管線：檢查全部通過就上線'],
          ['需要的前提', '自動化的測試', '自動化的部署、與正式環境相近的測試環境、部署後的檢查', '持續交付的一切，加上足夠可靠的自動檢查、監控與快速回滾'],
          ['本課的對應', 'Pipeline 的 build job', 'build → staging，production 等 Rosa 核准（第一題完成後）', '把 production 的審核拿掉'],
        ] },
        { type: 'p', text: '「隨時可以部署」是持續交付的核心：main 上的每個 commit 都已經被建成 Image、在 staging 部署並通過檢查，要上線時不需要再建置、再整理、再找人手動操作。人工核准留下的是商業與風險上的判斷（現在是不是適合上線的時機、要不要等某個公告），不是技術上的補救。CICD01 的 DORA 指標也和這裡有關：部署越自動、越常做，變更的前置時間越短；部署前後的檢查越可靠，變更失敗率越低。' },
        { type: 'list', items: [
          '選持續交付：上線時機要配合業務（例如分館的營業時間、公告）、法規要求人工簽核，或自動檢查還不夠讓人放心。',
          '選持續部署：測試與部署後的檢查可靠、監控與回滾成熟，團隊希望每個變更都盡快到達使用者。',
          '兩者共用同一條管線：差別只在 production 前面有沒有人工的關卡，所以可以先從持續交付開始，信心夠了再拿掉核准。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：持續交付就是每個 commit 自動上 production', text: '自動上 production 的是持續部署。持續交付要求的是「每個變更都已經可以上線」，上線仍由人決定；反過來，有人工核准也不代表不是持續交付，只要核准之後的部署是自動、可重複的。真正不算持續交付的，是像開頭的故事那樣：上線要有人 ssh 到主機手動操作，或者要部署前才臨時建置一份沒測過的 Image。' },
      ],
    },
    {
      id: 'cicd09-s-promote', title: '環境晉升：同一個 Image 一路往前',
      blocks: [
        { type: 'p', text: '環境晉升（promotion）是讓一個版本依序通過各個環境：先部署到 staging 驗證，通過之後把同一個版本晉升到 production。這裡的「同一個」要非常嚴格：CICD06 說過「建置一次」，晉升時移動的是那一份已經建好、測過的 Image，而不是在每個環境各自從原始碼再建一次。Image 的標籤可以被移動、被覆蓋，digest（`sha256:…`）則是內容的雜湊，以 `名稱@sha256:…` 拉取時，拿到的一定是那一份內容。' },
        { type: 'table', head: ['production 部署什麼', '問題'], rows: [
          ['`loans-api:latest`', '標籤會移動，也可能根本沒有更新：這裡的 latest 是九月的 1.2.0。部署的版本取決於當時標籤指向哪裡，而不是 staging 驗證過什麼'],
          ['在 production job 裡重新 `docker build`', '那是一次沒有在 staging 測過的新建置；基底 Image、套件或時間不同，digest 就不同，「測過的就是部署的」不再成立'],
          ['`loans-api:sha-<commit>`', '比 latest 好，可以追溯到 commit；但標籤仍可能被再推送一次覆蓋，staging 與 production 之間拉到的不保證是同一份'],
          ['`loans-api@sha256:<digest>`', '內容固定，staging 驗證的與 production 部署的必定是同一份；也是回滾時要指定的東西（CICD13）'],
        ] },
        { type: 'p', text: '在同一個 run 裡傳遞 digest 靠 job 的 output：build job 的 Push step 把 `docker push` 最後一行的 digest 寫進 `$GITHUB_OUTPUT`，再以 `outputs: digest: ${{ steps.push.outputs.digest }}` 交出去；之後的 job 用 `${{ needs.build.outputs.digest }}` 取得。needs context 只包含 job 直接列在 `needs` 裡的那些 job，所以 production 要寫 `needs: [build, staging]`：列 build 才拿得到 digest，列 staging 才會等 staging 部署並通過冒煙測試之後再開始。下面的例子推送一次，看 build 與 staging 怎麼接力。' },
        { type: 'example', id: 'cicd09-staging' },
        { type: 'p', text: 'build job 推送的 digest 與 staging-01 上容器的 Image 一字不差：staging 跑的就是 build 建出的那一份。冒煙測試印出 `ok`，staging-01 回應 1.4.0，而 prod-01 仍是 1.3.2。部署紀錄多了一筆 environment 為 staging、sha 是這次 commit 的紀錄。環境之間該不同的是設定與權限（主機名稱、環境的 secret、核准規則），不是 Image。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：只要 job 有先後，晉升的就是同一份', text: 'job 依序執行不代表部署的是同一個東西。production job 若重新建置、拉取 latest，或以會被覆蓋的標籤部署，就算排在 staging 之後，部署的也可能是另一份內容。另一個常見的漏洞是 production 只寫 `needs: build`：它和 staging 平行等待，staging 的冒煙測試失敗也擋不住它；寫成 `needs: staging` 又拿不到 `needs.build.outputs`，digest 變成空字串。' },
      ],
    },
    {
      id: 'cicd09-s-approval', title: '人工核准與環境的保護規則',
      blocks: [
        { type: 'p', text: 'job 寫上 `environment: production`，就要先通過這個環境的保護規則才會開始；通過之前，job 拿不到這個環境的 secret，所以 production 的部署金鑰只會出現在被核准的 job 裡。CICD07 用 environment 區分設定，這一課用它把關。GitHub 的部署環境可以設定下面這些規則。' },
        { type: 'table', head: ['規則', '作用', '本課的 production'], rows: [
          ['必要的審核者（required reviewers）', '最多 6 個人或團隊；任何一位核准，job 就開始；任何一位拒絕，job 失敗', 'ning-tsai、rosa-kim'],
          ['禁止自我審核（prevent self-review）', '觸發這次部署的人不能核准自己的部署，即使他在審核者名單裡', '開啟'],
          ['等待時間（wait timer）', 'job 到達環境後先等待指定的分鐘數（0 到 43200）再開始，可以和審核者一起使用', '沒有設定'],
          ['部署分支（deployment branches）', '所有分支；只有受保護的分支；或只有符合樣式的分支與標籤', '只有受保護的分支'],
        ] },
        { type: 'p', text: '等待審核的部署可以在網頁上核准，也可以用 REST API：`GET repos/{owner}/{repo}/actions/runs/{run_id}/pending_deployments` 列出這個 run 正在等待的環境、審核者，以及你能不能核准（`current_user_can_approve`）；`POST` 同一個位址，帶上 `environment_ids[]`、`state`（approved 或 rejected）與 `comment` 就是核准或拒絕。下面的例子先讓 staging 部署新版本，再用 Promote 手動把 staging 上的 digest 晉升到 production。' },
        { type: 'example', id: 'cicd09-approve' },
        { type: 'p', text: 'Promote 的 production job 在 01:31（UTC，記錄裡的時間都是 UTC）到達環境、開始等待；`current_user_can_approve` 是 false，Ning 送出核准得到 422：run 是她觸發的，prevent self-review 不讓她自己放行。Rosa 在 15 分鐘後核准，job 拿到 production 的 `DEPLOY_KEY`，部署並通過冒煙測試，prod-01 換成和 staging 相同的 digest。部署狀態依序是 waiting、in_progress、success，時間戳記說明了每一段花了多久。最後一個 run 從 feature/due-dates 觸發：這個分支沒有受保護，job 一開始就失敗，連審核的機會都沒有。' },
        { type: 'callout', tone: 'tip', title: '核准不是蓋章', text: '審核者要看的是：staging 上的這個 digest 通過了哪些檢查、這次包含哪些 commit、現在是不是適合上線的時間（例如不要在分館開館的尖峰時段）。如果核准只是習慣性地按下去，它只增加等待時間、不增加安全；這時不如把精力放在更好的自動檢查上，進一步走向持續部署。' },
      ],
    },
    {
      id: 'cicd09-s-checks', title: '部署後檢查：冒煙測試擋下壞掉的版本',
      blocks: [
        { type: 'p', text: '「部署的 step 是綠的」只代表指令都執行成功：`docker run -d` 在容器建立並啟動之後就回傳，不會等服務真的開始回應；容器下一秒因為設定錯誤而結束，部署的 step 也看不出來。部署後檢查（post-deployment check）是在部署完成後，從外面實際存取剛部署的服務，確認它真的能用。最基本的一種是冒煙測試（smoke test）：用幾秒鐘檢查最重要的幾件事，例如健康檢查端點、首頁、版本號。' },
        { type: 'table', head: ['curl 的寫法或結果', '意義'], rows: [
          ['`-f`（--fail）', 'HTTP 狀態碼 400 以上時不印回應內容，以結束碼 22 結束；沒有 -f 時 500 也算「成功」'],
          ['`-s`、`-S`', '-s 不顯示進度；-S 在 -s 之下仍然印出錯誤訊息，失敗時日誌裡看得到原因'],
          ['結束碼 7', '連不上：主機的那個埠沒有程式在監聽，例如容器已經結束'],
          ['結束碼 22', '連上了，但回應 4xx 或 5xx（配合 -f）'],
          ['結束碼 28', '逾時：服務沒有在時間內回應（`--max-time` 秒數）'],
        ] },
        { type: 'p', text: 'run 的 step 照 `bash -e` 執行，curl 不是 0 就讓 step 與 job 失敗；依賴這個 job 的 job 被略過。所以在 staging 失敗的冒煙測試會讓晉升停下來，production 繼續跑舊版本；在 production 失敗則要立刻有人處理，通常是回滾到上一個 digest（CICD13）或修正後再部署。第二題就是這種情況：一個看起來無害的清理，讓新的容器一啟動就結束。' },
        { type: 'list', items: [
          '從外面檢查：在 runner 上 curl 主機的位址，而不是在主機上 curl localhost，才會一起驗證埠的公開與網路。',
          '給服務一點啟動時間：真實的服務需要幾秒才開始回應，常見做法是 `curl -fsS --retry 5 --retry-delay 2 --retry-connrefused …`，或輪詢直到逾時。',
          '確認版本：除了 healthz，也可以檢查回應裡的版本或 commit，確定換上去的是這一次的 Image。',
          '要快、不改資料：冒煙測試在每次部署都跑，應該在一分鐘內結束，也不能在正式環境寫入假資料。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：測試都通過了，部署後就不必再檢查', text: '單元測試驗證的是程式碼，不是部署出去的那個環境：設定檔、環境變數、Image 的內容、主機的網路都可能出錯。第二題的 `npm test` 全部通過、Image 也建得出來，問題只有在容器真的啟動時才出現。反過來，冒煙測試失敗時把它拿掉或略過，只是讓警報不再響，壞掉的版本照樣會到達使用者。' },
      ],
    },
    {
      id: 'cicd09-s-records', title: '部署紀錄與 concurrency',
      blocks: [
        { type: 'p', text: '每個寫了 `environment:` 的 job 一到達環境，就留下一筆部署紀錄（deployment）：environment、sha（部署的 commit）、ref（分支）、建立時間，以及隨著 job 變化的狀態紀錄（statuses）。它們回答事後最常被問的問題，不需要像開頭的故事那樣從主機上的痕跡拼湊。' },
        { type: 'table', head: ['想知道', '去哪裡找'], rows: [
          ['production 現在跑的是哪個 commit', '`gh api \'repos/{owner}/{repo}/deployments?environment=production\'`，新的在前；再看它的 statuses 是不是 success'],
          ['什麼時候開始等待、什麼時候真的部署', '`…/deployments/{id}/statuses`：waiting、in_progress、success（或 failure、error）各自的時間'],
          ['部署的是哪個 Image', 'run 的日誌（Deploy step 的指令裡有 digest），或主機上 `docker inspect -f \'{{.Config.Image}}\' web`'],
          ['誰觸發、誰核准', 'run 的觸發者在 `gh run view`；審核的紀錄與留言在 run 的頁面，GitHub 也有 `GET …/actions/runs/{run_id}/approvals` 這個 API（模擬環境沒有）'],
          ['一個 commit 有沒有到過 production', '`…/deployments?environment=production&sha=完整的 commit`'],
        ] },
        { type: 'p', text: '同一個環境同時跑兩個部署很危險：兩個 job 各自停掉舊容器、啟動新容器，最後留在主機上的是哪一個取決於誰比較慢。`concurrency` 把屬於同一個群組的 job 排成一列：同一時間只有一個在執行，新來的進入 pending；群組裡已經有一個 pending 時，舊的 pending 會被取消，只留下最新的。群組名稱在整個儲存庫裡共用，所以 Pipeline 與 Promote 的 production job 都寫 `concurrency: production`，彼此也會排隊。' },
        { type: 'example', id: 'cicd09-queue' },
        { type: 'p', text: 'Release 1 的 production 在等審核，Release 2 的 production 在 concurrency 群組裡排隊；Release 3 到來時，排隊中的 Release 2 被取消（`Canceling since a higher priority waiting request for \'production\' exists`），Release 3 接著排隊，等 Release 1 結束、再經過 Rosa 核准才部署。production 的部署紀錄因此只有 Release 1 與 Release 3，Release 2 從來沒有到達 production；這沒有問題，因為 Release 3 已經包含它的變更。這也是不在部署 job 上使用 `cancel-in-progress: true` 的原因：它會把正在換容器的部署從中間切斷。' },
        { type: 'callout', tone: 'tip', title: '部署紀錄只和管線一樣可信', text: '紀錄由 job 產生：有人繞過管線 ssh 上去手動換容器，紀錄不會知道。要讓「部署紀錄說的就是線上的狀態」成立，正式環境的變更都必須經過管線，主機的 deploy 帳號也只交給 CI 與少數需要緊急處理的人。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd09-q-cd', prompt: 'loans-api 的每個 commit 只要通過管線的所有檢查，就自動部署到 production，中間沒有任何人做決定。這種做法稱為什麼？',
      options: ['持續整合：每次推送都自動建置與測試', '持續交付：每個 commit 都隨時可以上線，由人決定上線時機', '持續部署', '藍綠部署：同時維持兩套環境，再一次切換流量'],
      answer: 2,
      explanation: '通過檢查就自動上 production、沒有人工步驟，是持續部署。持續交付同樣讓每個變更隨時可以上線，但上線由人決定；持續整合只到建置與測試，還沒有談到部署；藍綠部署是一種切換流量的部署策略（CICD10），和要不要人工決定無關。',
    },
    {
      id: 'cicd09-q-promote', prompt: 'staging 驗證通過之後，production job 應該部署什麼？',
      options: ['build job 輸出的那個 digest', '在 production job 裡從同一個 commit 重新 `docker build` 一次的 Image', 'Registry 上的 `latest`，它應該指向最近推送的 Image', '重新推送一次 `sha-<commit>` 標籤之後，再以這個標籤部署'],
      answer: 0,
      explanation: '以 digest 部署，production 拿到的必定是 staging 驗證過的同一份內容。重新建置是一次沒有測過的新建置，digest 可能不同；latest 會移動，也可能根本沒有更新（本課的 latest 是九月的 1.2.0）；重新推送標籤等於改寫它指向的內容，失去了晉升的意義。',
    },
    {
      id: 'cicd09-q-self', prompt: 'production 的審核者是 ning-tsai 與 rosa-kim，並開啟了 prevent self-review。Ning 推送觸發了 run，接著以 `gh api` 對這個 run 的 `pending_deployments` 送出 `state=approved`。結果是什麼？',
      options: ['核准成功：Ning 是審核者之一，一人核准就夠', '核准被拒絕，部署繼續等待其他審核者', 'production job 立刻失敗，部署紀錄的狀態變成 failure', 'Ning 的核准先被記下，要等 Rosa 也核准才會開始'],
      answer: 1,
      explanation: 'prevent self-review 讓觸發部署的人不能核准自己的部署，即使他在名單上，API 會拒絕這個核准（模擬環境回應 422），部署繼續等待。一般情況下一位審核者核准就夠，不需要兩人都核准；被拒絕的核准請求也不會讓 job 失敗，失敗只發生在審核者選擇拒絕（rejected）的時候。',
    },
    {
      id: 'cicd09-q-smoke', prompt: 'staging job 的冒煙測試是 `curl -fsS http://staging-01:8000/healthz`。新的容器一啟動就結束，8000 埠沒有程式在監聽。接下來會怎樣？',
      options: ['curl 印出空白並以 0 結束，管線照常進行', 'GitHub 會自動重新執行 staging job，直到成功為止', 'production job 照樣進入等待，審核者核准後就部署', 'curl 以 7 結束，staging 失敗，production 略過'],
      answer: 3,
      explanation: '連不上主機的埠，curl 以結束碼 7 結束；step 以 `bash -e` 執行，非 0 讓 step 與 staging job 失敗，`needs` 裡有 staging 的 production 因此被略過，prod-01 繼續跑舊版本。curl 連線失敗不會以 0 結束；GitHub 不會自動重跑失敗的 job；production 依賴 staging，不會在它失敗後進入等待。',
    },
    {
      id: 'cicd09-q-needs', prompt: 'production job 寫成 `needs: build`（沒有列 staging），其他不變。主要的問題是什麼？',
      options: ['staging 的冒煙測試失敗也擋不住它，壞掉的版本可能被晉升', '`needs.build.outputs.digest` 會變成空字串，部署失敗', 'production 會在 staging 之前再建置一次 Image', 'GitHub 會拒絕這個 workflow：同一個 workflow 裡的兩個部署 job 一定要用 needs 串成一條線'],
      answer: 0,
      explanation: '只依賴 build 時，production 和 staging 平行進行，它不等 staging 的部署與冒煙測試，審核一通過就部署，staging 失敗也擋不住。digest 仍拿得到，因為 build 在 needs 裡（只寫 staging 時才拿不到）；production 不會因此重新建置；GitHub 也不要求部署 job 串成一條線，所以這種漏洞不會被擋下。',
    },
    {
      id: 'cicd09-q-record', prompt: 'main 最新的 commit 在 staging 的冒煙測試失敗了。要知道 production 現在跑的是哪個 commit，最可靠的做法是什麼？',
      options: ['`git log -1 origin/main`：main 最新的 commit 就是線上的版本', '`gh run list -L 1`：最新一次 run 的 commit', '查 `deployments?environment=production` 的部署紀錄', '`gh api repos/{owner}/{repo}/deployments` 的第一筆，它一定是最新的部署'],
      answer: 2,
      explanation: '依環境篩選的部署紀錄記下每次真正到達 production 的 commit 與狀態，最新一筆成功的就是線上的版本。main 的最新 commit 與最新的 run 都是那個在 staging 失敗、從沒到過 production 的 commit；不篩選環境時第一筆是最新的任何部署，這裡就是 staging 那一筆失敗的部署。',
    },
    {
      id: 'cicd09-q-concurrency', prompt: 'production job 設定了 `concurrency: production`（沒有 cancel-in-progress）。Release 1 的 production 正在等審核，Release 2 的 production 在排隊，這時 Release 3 推送上來，到了 production job。結果是什麼？',
      options: ['三個部署同時進行，最後完成的那個留在主機上', 'Release 2 被取消，Release 3 排到後面', 'Release 1 被取消，Release 3 立刻開始部署', 'Release 3 被拒絕，要等排隊的部署清空後再推送一次'],
      answer: 1,
      explanation: '同一個 concurrency 群組同時只有一個在執行、最多一個在排隊；新的 job 進來時，舊的 pending（Release 2）被取消，新的排隊等執行中的那個結束。沒有 cancel-in-progress，Release 1 不會被中斷；群組的用意正是不讓部署同時進行；新的 job 也不會被拒絕，被取消的是較舊的那個。',
    },
    {
      id: 'cicd09-q-branch', prompt: 'production 的部署分支規則是「只有受保護的分支」，只有 main 受保護。有人從 feature/due-dates 手動觸發 Promote，會發生什麼？',
      options: ['照常等待審核，由審核者決定要不要放行這個分支', '自動改成部署 main 目前的 commit', '先部署到 staging，等 staging 通過後再晉升', 'production job 立刻失敗：這個分支不能部署'],
      answer: 3,
      explanation: '部署分支規則在審核之前判斷，不符合的分支 job 立刻失敗，訊息說這個分支因為環境的保護規則不能部署。它不會進入等待審核，也不會被改成部署 main；Promote 只有 production 一個 job，跟 staging 無關。',
    },
  ],
  terminal: { machines: [lab, release], examples: EXAMPLES, exercises: EXERCISES },
};
