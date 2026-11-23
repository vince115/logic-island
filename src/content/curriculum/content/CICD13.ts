import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalCiTool } from '@/lib/terminal/actions-lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';
import type { AppVersion, FeatureFlag, Fleet, RolloutScenario, Strategy } from '@/lib/devops/rollout';

/*
 * CICD13 回滾與發布安全 (the blueprint's pipeline-sim, terminal-sim on the deploy-hosts profile — engine stages E25 git,
 * E26 forge, E27 workflows, E28 actions, E29 artifacts, E30 environments, E31 deploy hosts — with the devops-explorer's D2
 * rollouts). A made-up sports centre, Fernhill Leisure Centre, on the simulated github.example: Lai Yu-chen (the learner,
 * gh login yuchen-lai, admin of fernhill/courts-api, on call today), Hana Sato (platform engineer: the pipeline,
 * scripts/migrate.sh and rollback.yml), Tomás Rivera (developer of 2.3.0 and 2.4.0) and Priya Nair (release manager, the
 * approver persona priya-nair: she approves a production deployment 120 s after it starts waiting).
 * pipeline.yml builds every push to main (or a dispatch) once, pushes it to cr.fernhill.example and deploys the digest to
 * staging-01, then (approval, protected branches only) to prod-01; each deploy job applies new migrations first
 * (scripts/migrate.sh: the lesson has no database, /srv/courts/applied on each host stands in for its migration table, and
 * the script refuses a commit that lacks a migration the database has applied) and smoke-tests /healthz only.
 * rollback.yml (workflow_dispatch: environment choice, digest) checks that the input is a digest, redeploys it through the
 * same environment and smoke-tests /healthz and /api/slots; it never touches the database. Both hosts run 2.2.0 (deployed
 * by hand, the registry's latest). origin/main is 2.3.0; the learner's main has Tomás's 2.4.0 (booking notes: migration
 * 0003 adds a nullable column, and the new entry point src/main.js breaks GET /api/slots with a 500 while /healthz stays
 * ok), not pushed yet: examples and exercises first replay the morning (dispatch 2.3.0, push 2.4.0), since the simulation
 * keeps no earlier runs. The clock is 2026-11-27 01:00 UTC (09:00 in Asia/Taipei). The D2 explorers are illustrative data
 * for the same service (示意資料). Organisation, people, hosts and every token are made up; every transcript output was
 * produced by replaying it on the engine, and every explorer answer is computed by src/lib/devops.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const COURTS = 'https://github.example/fernhill/courts-api.git';
const HANA = { name: 'Hana Sato', email: 'hana@fernhill.example' };
const TOMAS = { name: 'Tomás Rivera', email: 'tomas@fernhill.example' };
const YUCHEN = { name: 'Lai Yu-chen', email: 'yuchen@fernhill.example' };
const REG = 'cr.fernhill.example';
const IMAGE = `${REG}/fernhill/courts-api`;
const CI_TOKEN = 'lesson-registry-token-ci-0131';
const PULL_TOKEN = 'lesson-registry-token-deploy-0132';
const YUCHEN_TOKEN = 'lesson-registry-token-yuchen-0133';
const wf = (...lines: string[]) => [...lines, ''].join('\n');

const LEARNER_KEY = keyPair('cicd13:learner', 'yuchen@yuchen-laptop');
const STAGING_CI_KEY = keyPair('cicd13:staging-deploy', 'deploy@ci-staging');
const PROD_CI_KEY = keyPair('cicd13:prod-deploy', 'deploy@ci-production');
const hostLine = (host: string) => `${host} ${hostKey(`cicd13-${host}`, host).publicLine.split(' ').slice(0, 2).join(' ')}`;
const KNOWN_HOSTS = `# lesson known_hosts for the Fernhill deploy hosts\n${hostLine('staging-01')}\n${hostLine('prod-01')}`;

const pkg = (version: string) => `{\n  "name": "courts-api",\n  "version": "${version}",\n  "private": true,\n  "scripts": {\n    "test": "node --test test/"\n  }\n}\n`;
const dockerfile = (entry: string) => `FROM node:22.11.0-slim\nWORKDIR /app\nCOPY . .\nEXPOSE 8000\nCMD ["node", "${entry}"]\n`;
const DEPLOY_SH = [
  '#!/bin/bash',
  '# Usage: bash scripts/deploy.sh HOST IMAGE',
  '# Needs REGISTRY_TOKEN in the environment and the SSH key step before it.',
  'set -eu',
  'host="$1"',
  'image="$2"',
  `echo "$REGISTRY_TOKEN" | ssh "deploy@$host" docker login ${REG} -u deploy --password-stdin`,
  'ssh "deploy@$host" docker pull -q "$image"',
  "ssh \"deploy@$host\" 'docker rm -f web 2>/dev/null || true'",
  'ssh "deploy@$host" docker run -d --name web -p 8000:8000 "$image"',
  '',
].join('\n');
const MIGRATE_SH = [
  '#!/bin/bash',
  '# Usage: bash scripts/migrate.sh HOST',
  '# Applies the files in migrations/ that the environment\'s database has not applied yet, in order.',
  '# The lesson has no database: /srv/courts/applied on the host stands in for its migration table.',
  'set -eu',
  'host="$1"',
  'applied=$(ssh "deploy@$host" cat /srv/courts/applied)',
  'for name in $applied; do',
  '  if [ ! -f "migrations/$name.sql" ]; then',
  '    echo "error: the database has applied $name, but migrations/$name.sql is not in this commit" >&2',
  '    exit 1',
  '  fi',
  'done',
  'for f in migrations/*.sql; do',
  '  name=${f#migrations/}',
  '  name=${name%.sql}',
  '  if echo "$applied" | grep -qx "$name"; then continue; fi',
  '  echo "applying $name"',
  '  ssh "deploy@$host" "echo $name >> /srv/courts/applied"',
  'done',
  'echo "database is at $(ssh "deploy@$host" tail -n 1 /srv/courts/applied)"',
  '',
].join('\n');

// ---- Workflows.
const BUILD_JOB = ['  build:', '    runs-on: ubuntu-latest', '    outputs:', '      digest: ${{ steps.push.outputs.digest }}', '    steps:', '      - uses: actions/checkout@v4', '      - run: npm test',
  `      - run: docker build -q -t ${IMAGE}:sha-\${{ github.sha }} .`, '      - name: Log in to the registry', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}',
  `        run: echo "$REGISTRY_TOKEN" | docker login ${REG} -u ci-bot --password-stdin`, '      - name: Push', '        id: push', '        run: |',
  `          docker push ${IMAGE}:sha-\${{ github.sha }} | tee push.log`, '          echo "digest=$(tail -n 1 push.log | cut -d \' \' -f 3)" >> "$GITHUB_OUTPUT"'];
const SSH_STEP = ['      - name: SSH key', '        env:', '          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}', '          KNOWN_HOSTS: ${{ secrets.KNOWN_HOSTS }}', '        run: |', '          mkdir -p ~/.ssh',
  "          printf '%s\\n' \"$DEPLOY_KEY\" > ~/.ssh/id_ed25519", '          chmod 600 ~/.ssh/id_ed25519', "          printf '%s\\n' \"$KNOWN_HOSTS\" > ~/.ssh/known_hosts"];
const deploySteps = (image: string) => ['      - name: Deploy', '        env:', '          REGISTRY_TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}', `        run: bash scripts/deploy.sh \${{ vars.DEPLOY_HOST }} ${image}`];
const BY_DIGEST = `${IMAGE}@\${{ needs.build.outputs.digest }}`;
const envJob = (job: string, env: string, needs: string, concurrency: boolean) => [`  ${job}:`, `    needs: ${needs}`, '    runs-on: ubuntu-latest', `    environment: ${env}`,
  ...concurrency ? ['    concurrency: production'] : [], '    steps:', '      - uses: actions/checkout@v4', ...SSH_STEP,
  '      - name: Migrate', '        run: bash scripts/migrate.sh ${{ vars.DEPLOY_HOST }}', ...deploySteps(BY_DIGEST),
  '      - name: Smoke test', '        run: curl -fsS http://${{ vars.DEPLOY_HOST }}:8000/healthz'];
const PIPELINE = wf('name: Pipeline', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', 'permissions:', '  contents: read', 'jobs:', ...BUILD_JOB,
  ...envJob('staging', 'staging', 'build', false), ...envJob('production', 'production', '[build, staging]', true));
const ROLLBACK = wf('name: Rollback', 'run-name: Roll back ${{ inputs.environment }} to ${{ inputs.digest }}', 'on:', '  workflow_dispatch:', '    inputs:',
  '      environment:', '        description: Where to roll back', '        type: choice', '        options: [staging, production]', '        required: true',
  '      digest:', '        description: A digest that ran there before (sha256:...)', '        required: true',
  'permissions:', '  contents: read', 'jobs:', '  rollback:', '    runs-on: ubuntu-latest', '    environment: ${{ inputs.environment }}', '    concurrency: ${{ inputs.environment }}', '    steps:',
  '      - name: Check the digest', '        env:', '          DIGEST: ${{ inputs.digest }}',
  '        run: echo "$DIGEST" | grep -Eqx \'sha256:[0-9a-f]{64}\' || { echo "::error::digest must be sha256:<64 hex digits>, not a tag"; exit 1; }',
  '      - uses: actions/checkout@v4', ...SSH_STEP, ...deploySteps(`${IMAGE}@\${{ inputs.digest }}`),
  '      - name: Smoke test', '        run: |', '          curl -fsS http://${{ vars.DEPLOY_HOST }}:8000/healthz', '          curl -fsS -o /dev/null http://${{ vars.DEPLOY_HOST }}:8000/api/slots');

// ---- Git history.
const MIG1 = 'CREATE TABLE courts (\n  id integer PRIMARY KEY,\n  name text NOT NULL,\n  indoor boolean NOT NULL\n);\n';
const MIG2 = 'CREATE TABLE bookings (\n  id integer PRIMARY KEY,\n  court_id integer NOT NULL REFERENCES courts (id),\n  starts_at timestamptz NOT NULL,\n  member_id integer NOT NULL\n);\n';
const MIG3 = '-- expand: a new nullable column; 2.3.0 does not read it and keeps working\nALTER TABLE bookings ADD COLUMN notes text NULL;\n';
const COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', author: HANA, time: '2026-11-03 02:00:00', files: {
    'README.md': '# courts-api\n\nCourt bookings for the Fernhill Leisure Centre.\n', 'package.json': pkg('2.2.0'), 'Dockerfile': dockerfile('src/server.js'), '.dockerignore': '.git\n.github\ntest\n',
    'src/server.js': "// GET /api/slots, POST /api/bookings, GET /healthz\nrequire('./app').listen(8000);\n", 'src/app.js': '// routes and the booking rules\n',
    'migrations/0001_create_courts.sql': MIG1, 'migrations/0002_create_bookings.sql': MIG2, 'test/slots.test.js': "test('lists free slots')\n" } },
  { id: 'c2', message: 'Build, deploy to staging, promote with approval', author: HANA, time: '2026-11-10 03:00:00',
    files: { '.github/workflows/pipeline.yml': PIPELINE, 'scripts/deploy.sh': DEPLOY_SH, 'scripts/migrate.sh': MIGRATE_SH }, executable: ['scripts/deploy.sh', 'scripts/migrate.sh'] },
  { id: 'c3', message: 'Add a rollback workflow that redeploys a digest', author: HANA, time: '2026-11-18 03:00:00', files: { '.github/workflows/rollback.yml': ROLLBACK } },
  { id: 'r23', message: 'Release 2.3.0: lighting fees for evening slots', author: TOMAS, time: '2026-11-24 06:00:00',
    files: { 'package.json': pkg('2.3.0'), 'src/app.js': '// routes and the booking rules (lighting fee after 18:00)\n' } },
  { id: 'r24', message: 'Release 2.4.0: booking notes', author: TOMAS, time: '2026-11-26 08:00:00',
    files: { 'package.json': pkg('2.4.0'), 'Dockerfile': dockerfile('src/main.js'), 'migrations/0003_add_booking_notes.sql': MIG3,
      'src/main.js': "// starts the server and the booking notes\nrequire('./notes');\nrequire('./server');\n", 'src/notes.js': '// notes on a booking (GET /api/slots shows them)\n' } },
];

// ---- Images, hosts and machines.
const TOOLS: TerminalCiTool[] = [
  { command: 'npm test', cases: [{ stdout: '> courts-api test\n> node --test test/\n\n✔ lists free slots (2.1ms)\nℹ tests 14\nℹ pass 14\nℹ fail 0', seconds: 6 }] },
];
const OLD: TerminalImage = {
  name: `${IMAGE}:2.2.0`, tags: ['latest'], size: 198_000_000, created: '2026-10-20 06:00:00', workdir: '/app', cmd: ['node', 'src/server.js'], expose: [8000], service: true,
  http: { port: 8000, responder: 'courts-220' }, logs: ['courts-api 2.2.0 listening on :8000'],
};
const IMAGES: TerminalImage[] = [
  { name: 'node:22.11.0-slim', size: 201_300_000, created: '2026-11-13 05:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'],
    env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=22.11.0'] },
  OLD,
];
const SLOTS = '[{"court":1,"starts":"18:00","free":true},{"court":2,"starts":"18:00","free":false}]\n';
const responder = (id: string, version: string, broken = false) => ({ id, server: 'node', routes: [
  { path: '/', body: `{"service":"courts-api","version":"${version}"}\n` }, { path: '/healthz', body: 'ok\n' },
  broken ? { path: '/api/slots', status: 500, body: '{"error":"internal server error"}\n' } : { path: '/api/slots', body: SLOTS }] });

const deployHost = (name: string, address: string, ciKey: { publicLine: string }): TerminalRemote => ({
  host: name, address, hostKey: `cicd13-${name}`, runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [dir('/home', 'root'), dir('/home/deploy', 'deploy', 0o750), dir('/home/deploy/.ssh', 'deploy', 0o700),
    file('/home/deploy/.ssh/authorized_keys', `${ciKey.publicLine}\n${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600),
    dir('/srv', 'root'), dir('/srv/courts', 'deploy'), file('/srv/courts/applied', '0001_create_courts\n0002_create_bookings\n', 'deploy')],
  docker: {
    images: [{ ...OLD, pulled: true }],
    containers: [{ name: 'web', image: `${IMAGE}:2.2.0`, state: 'running', created: '2026-10-21 01:30:00', started: '2026-10-21 01:30:00', ports: ['8000:8000'] }],
  },
});

const lab: TerminalMachine = {
  id: 'cicd13-lab', title: 'yuchen-laptop（Fernhill 運動中心的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'yuchen-laptop', profile: 'deploy-hosts',
  timezone: 'Asia/Taipei', now: '2026-11-27 01:00:00',
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  files: [dir('/home', 'root'), dir('/home/learner'), dir('/home/learner/.ssh', 'learner', 0o700), file('/home/learner/.ssh/id_ed25519', LEARNER_KEY.privateText, 'learner', 0o600),
    file('/home/learner/.ssh/known_hosts', `${KNOWN_HOSTS}\n`), file('/home/learner/.registry-token', `${YUCHEN_TOKEN}\n`, 'learner', 0o600)],
  git: { user: YUCHEN, commits: COMMITS, remotes: [{ url: COURTS, branches: { main: 'r23' } }],
    repos: [{ path: '/home/learner/courts-api', origin: COURTS, branches: { main: 'r24' } }] },
  forge: {
    login: 'yuchen-lai', name: 'Lai Yu-chen', repos: [{
      url: COURTS, description: 'Court bookings for the Fernhill Leisure Centre', permission: 'admin',
      protection: [{ branch: 'main', enforceAdmins: true }],
      environments: ['staging', 'production'],
      environmentRules: [{ name: 'production', reviewers: ['yuchen-lai', 'priya-nair'], preventSelfReview: true, branches: 'protected' }],
      approvers: [{ login: 'priya-nair', name: 'Priya Nair', after: 120, comment: 'Approved.' }],
      secrets: [
        { name: 'REGISTRY_TOKEN', value: CI_TOKEN, updated: '2026-11-10 03:00:00' }, { name: 'REGISTRY_PULL_TOKEN', value: PULL_TOKEN, updated: '2026-11-10 03:00:00' },
        { name: 'KNOWN_HOSTS', value: KNOWN_HOSTS, updated: '2026-11-10 03:00:00' },
        { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd13:staging-deploy', comment: 'deploy@ci-staging' }, env: 'staging', updated: '2026-11-10 03:00:00' },
        { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd13:prod-deploy', comment: 'deploy@ci-production' }, env: 'production', updated: '2026-11-10 03:00:00' },
      ],
      variables: [{ name: 'DEPLOY_HOST', value: 'staging-01', env: 'staging', updated: '2026-11-10 03:00:00' }, { name: 'DEPLOY_HOST', value: 'prod-01', env: 'production', updated: '2026-11-10 03:00:00' }],
    }],
  },
  actions: { tools: TOOLS },
  responders: [responder('courts-220', '2.2.0'), responder('courts-230', '2.3.0'), responder('courts-240', '2.4.0', true)],
  docker: {
    images: IMAGES,
    programs: [
      { command: ['node', 'src/server.js'], service: true, logs: ['courts-api listening on :8000'], http: { port: 8000, responder: 'courts-230' } },
      { command: ['node', 'src/main.js'], service: true, logs: ['courts-api listening on :8000 (booking notes on)'], http: { port: 8000, responder: 'courts-240' } },
    ],
    registries: [{ host: REG, users: [{ name: 'ci-bot', token: CI_TOKEN, repos: ['fernhill/*'] }, { name: 'deploy', token: PULL_TOKEN, push: false, repos: ['fernhill/*'] },
      { name: 'yuchen-lai', token: YUCHEN_TOKEN, push: false, repos: ['fernhill/*'] }] }],
  },
  remotes: [deployHost('staging-01', '10.30.0.11', STAGING_CI_KEY), deployHost('prod-01', '10.30.0.21', PROD_CI_KEY)],
};

// ---- Shared commands: the simulation keeps no earlier runs, so examples and exercises replay the morning first.
const MORNING = ['cd courts-api', 'gh workflow run pipeline.yml', 'gh run watch 4100000001 > /dev/null', 'git push -q', 'gh run watch 4100000002 > /dev/null'];
const digestOfRun = (run: number) => `gh run view ${run} --log | grep -o 'courts-api@sha256:[0-9a-f]*' | head -n 1 | cut -d @ -f 2`;
const PREVIOUS = digestOfRun(4100000001);
const HOST_220 = "ssh deploy@prod-01 docker images --digests | grep ' 2.2.0 ' | tr -s ' ' | cut -d ' ' -f 3";
const ROLL_BACK = (env: string, digest: string) => `gh workflow run rollback.yml -f environment=${env} -f digest=${digest}`;
const WATCH3 = 'gh run watch 4100000003 > /dev/null';
const KEEP_0003 = ['git revert --no-edit HEAD', 'git checkout HEAD~1 -- migrations/0003_add_booking_notes.sql', "git commit -q --amend -m 'Revert the 2.4.0 code, keep migration 0003'"];

const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd13-tour', title: '2.4.0 帶了什麼：遷移、指令稿與部署環境', machine: 'cicd13-lab',
    description: '看本機 main 上還沒推送的 2.4.0 改了哪些檔案、新的遷移做了什麼；看 migrate.sh 怎麼記錄每個環境套用過的遷移，確認 prod-01 目前的遷移紀錄與版本；最後看 production 環境的變數與保護規則。',
    steps: [
      { command: "cd courts-api", output: "" },
      { command: "git log --oneline -4", output: "ae398d1 (HEAD -> main) Release 2.4.0: booking notes\n6f4df74 (origin/main, origin/HEAD) Release 2.3.0: lighting fees for evening slots\n8eca3f4 Add a rollback workflow that redeploys a digest\n9e75867 Build, deploy to staging, promote with approval" },
      { command: "git show --stat HEAD | tail -n 8", output: "    Release 2.4.0: booking notes\n\n Dockerfile                            | 2 +-\n migrations/0003_add_booking_notes.sql | 2 ++\n package.json                          | 2 +-\n src/main.js                           | 3 +++\n src/notes.js                          | 1 +\n 5 files changed, 8 insertions(+), 2 deletions(-)" },
      { command: "cat migrations/0003_add_booking_notes.sql", output: "-- expand: a new nullable column; 2.3.0 does not read it and keeps working\nALTER TABLE bookings ADD COLUMN notes text NULL;" },
      { command: "cat scripts/migrate.sh", output: "#!/bin/bash\n# Usage: bash scripts/migrate.sh HOST\n# Applies the files in migrations/ that the environment's database has not applied yet, in order.\n# The lesson has no database: /srv/courts/applied on the host stands in for its migration table.\nset -eu\nhost=\"$1\"\napplied=$(ssh \"deploy@$host\" cat /srv/courts/applied)\nfor name in $applied; do\n  if [ ! -f \"migrations/$name.sql\" ]; then\n    echo \"error: the database has applied $name, but migrations/$name.sql is not in this commit\" >&2\n    exit 1\n  fi\ndone\nfor f in migrations/*.sql; do\n  name=${f#migrations/}\n  name=${name%.sql}\n  if echo \"$applied\" | grep -qx \"$name\"; then continue; fi\n  echo \"applying $name\"\n  ssh \"deploy@$host\" \"echo $name >> /srv/courts/applied\"\ndone\necho \"database is at $(ssh \"deploy@$host\" tail -n 1 /srv/courts/applied)\"" },
      { command: "ssh deploy@prod-01 cat /srv/courts/applied", output: "0001_create_courts\n0002_create_bookings" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"courts-api\",\"version\":\"2.2.0\"}" },
      { command: "gh variable list -e production", output: "NAME         VALUE    UPDATED\nDEPLOY_HOST  prod-01  about 16 days ago" },
      { command: "gh api repos/{owner}/{repo}/environments/production | grep -E '\"(prevent_self_review|login|protected_branches)\"'", output: "      \"prevent_self_review\": true,\n            \"login\": \"yuchen-lai\",\n            \"login\": \"priya-nair\",\n    \"protected_branches\": true," },
    ],
  },
  {
    id: 'cicd13-morning', title: '重現早上：2.3.0 上線、2.4.0 上線、空場地列表壞了', machine: 'cicd13-lab',
    description: '先以 workflow_dispatch 部署 origin/main 的 2.3.0，再推送 2.4.0；兩次都要等 Priya 核准 production。看 2.4.0 的 run 在兩個環境套用了遷移 0003，冒煙測試通過，但 /api/slots 回應 500；最後從 production 的部署紀錄找出 2.4.0 之前那一筆，以及它來自哪個 run。',
    steps: [
      { command: "cd courts-api", output: "" },
      { command: "gh workflow run pipeline.yml", output: "✓ Created workflow_dispatch event for pipeline.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"pipeline.yml\"" },
      { command: "gh run watch 4100000001 > /dev/null", output: "" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"courts-api\",\"version\":\"2.3.0\"}" },
      { command: "git push -q", output: "To https://github.example/fernhill/courts-api.git\n   6f4df74..ae398d1  main -> main" },
      { command: "gh run watch 4100000002 > /dev/null", output: "" },
      { command: "gh run view 4100000002 --log | grep -E 'applying|database is at' | cut -f 1,3", output: "staging\t2026-11-27T01:02:32.0000000Z applying 0003_add_booking_notes\nstaging\t2026-11-27T01:02:32.0000000Z database is at 0003_add_booking_notes\nproduction\t2026-11-27T01:04:36.0000000Z applying 0003_add_booking_notes\nproduction\t2026-11-27T01:04:36.0000000Z database is at 0003_add_booking_notes" },
      { command: "curl -s http://prod-01:8000/healthz", output: "ok" },
      { command: "curl -s -o /dev/null -w '%{http_code}\\n' http://prod-01:8000/api/slots", output: "500" },
      { command: "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep -E '^    \"(id|sha|created_at)\"'", output: "    \"id\": 1900000004,\n    \"sha\": \"ae398d149e72182e7272790bbe03be76a1a9f746\",\n    \"created_at\": \"2026-11-27T01:02:32Z\",\n    \"id\": 1900000002,\n    \"sha\": \"6f4df74452d6067ebbcb4eec5e0f1d1422546b3b\",\n    \"created_at\": \"2026-11-27T01:00:14Z\"," },
      { command: "git log --oneline -2", output: "ae398d1 (HEAD -> main, origin/main, origin/HEAD) Release 2.4.0: booking notes\n6f4df74 Release 2.3.0: lighting fees for evening slots" },
      { command: "gh api repos/{owner}/{repo}/deployments/1900000002/statuses | grep -E '\"(state|log_url)\"' | head -n 4", output: "    \"state\": \"inactive\",\n    \"log_url\": \"https://github.example/fernhill/courts-api/actions/runs/4100000001/job/11300000003\"\n    \"state\": \"success\",\n    \"log_url\": \"https://github.example/fernhill/courts-api/actions/runs/4100000001/job/11300000003\"" },
    ],
  },
  {
    id: 'cicd13-drill', title: '在 staging 演練 rollback workflow', machine: 'cicd13-lab',
    description: '早上 2.3.0 部署之後、2.4.0 推送之前，在 staging 演練一次回滾：標籤被檢查擋下、不在選項裡的環境被拒絕、Image ID 不是 digest；最後以 staging-01 上 2.2.0 的 digest 回滾成功，從 run 的標題與 staging 的回應確認結果。',
    steps: [
      { command: "cd courts-api", output: "" },
      { command: "gh workflow run pipeline.yml", output: "✓ Created workflow_dispatch event for pipeline.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"pipeline.yml\"" },
      { command: "gh run watch 4100000001 > /dev/null", output: "" },
      { command: "gh workflow run rollback.yml -f environment=prod -f digest=latest", output: "could not create workflow dispatch event: HTTP 422: Provided value 'prod' for input 'environment' not in the list of allowed values (https://github.example/api/v3/repos/fernhill/courts-api/actions/workflows/426364164/dispatches)" },
      { command: "gh workflow run rollback.yml -f environment=staging -f digest=latest", output: "✓ Created workflow_dispatch event for rollback.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"rollback.yml\"" },
      { command: "gh run watch 4100000002 > /dev/null", output: "" },
      { command: "gh run view 4100000002 --log-failed | cut -f 3- | grep -F '##[error]'", output: "2026-11-27T01:02:21.0000000Z ##[error]digest must be sha256:<64 hex digits>, not a tag\n2026-11-27T01:02:21.0000000Z ##[error]Process completed with exit code 1." },
      { command: "ssh deploy@staging-01 docker images --digests", output: "REPOSITORY                                TAG       DIGEST                                                                    IMAGE ID       CREATED         SIZE\ncr.fernhill.example/fernhill/courts-api   <none>    sha256:de40ee3d53c85fc4a67bfb8d2de915d55e81d0308ab8e1ed6536ac9deda66d87   8bdf279531bd   2 minutes ago   201MB\ncr.fernhill.example/fernhill/courts-api   2.2.0     sha256:118d6d4f00acf57637b6a1f51a10ebf7dfb49c70471c758acc096b67d62cb71b   dc7e73e6dd4d   5 weeks ago     198MB" },
      { command: "ID=$(ssh deploy@staging-01 docker inspect -f '{{.Id}}' cr.fernhill.example/fernhill/courts-api:2.2.0)", output: "" },
      { command: "gh workflow run rollback.yml -f environment=staging -f digest=$ID", output: "✓ Created workflow_dispatch event for rollback.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"rollback.yml\"" },
      { command: "gh run watch 4100000003 > /dev/null", output: "" },
      { command: "gh run view 4100000003 --log-failed | cut -f 3- | grep 'manifest'", output: "2026-11-27T01:02:25.0000000Z Error response from daemon: manifest for cr.fernhill.example/fernhill/courts-api@sha256:dc7e73e6dd4dab1312ba59887591da83f118383657a434313a48cd3fbf5f469c not found: manifest unknown: manifest unknown" },
      { command: "D=$(ssh deploy@staging-01 docker images --digests | grep ' 2.2.0 ' | tr -s ' ' | cut -d ' ' -f 3)", output: "" },
      { command: "gh workflow run rollback.yml -f environment=staging -f digest=$D", output: "✓ Created workflow_dispatch event for rollback.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"rollback.yml\"" },
      { command: "gh run watch 4100000004 > /dev/null", output: "" },
      { command: "gh run list -w rollback.yml", output: "STATUS  TITLE                                                                                         WORKFLOW  BRANCH  EVENT              ID          ELAPSED  AGE\n✓       Roll back staging to sha256:118d6d4f00acf57637b6a1f51a10ebf7dfb49c70471c758acc096b67d62cb71b  Rollback  main    workflow_dispatch  4100000004  4s       less than a minute ago\nX       Roll back staging to sha256:dc7e73e6dd4dab1312ba59887591da83f118383657a434313a48cd3fbf5f469c  Rollback  main    workflow_dispatch  4100000003  4s       less than a minute ago\nX       Roll back staging to latest                                                                   Rollback  main    workflow_dispatch  4100000002  3s       less than a minute ago" },
      { command: "curl -s http://staging-01:8000/", output: "{\"service\":\"courts-api\",\"version\":\"2.2.0\"}" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"courts-api\",\"version\":\"2.3.0\"}" },
    ],
  },
  {
    id: 'cicd13-revert-all', title: '把 2.4.0 整個 revert：管線停在 Migrate', machine: 'cicd13-lab',
    description: '重現早上之後，以 `git revert` 撤銷整個 2.4.0 並推送。revert 連遷移 0003 的檔案也刪掉了，而兩個環境的資料庫早已套用它：staging job 的 Migrate step 拒絕繼續，production 沒有被部署，仍然是壞掉的 2.4.0。',
    steps: [
      { command: "cd courts-api", output: "" },
      { command: "gh workflow run pipeline.yml", output: "✓ Created workflow_dispatch event for pipeline.yml at main\n\nTo see runs for this workflow, try: gh run list --workflow=\"pipeline.yml\"" },
      { command: "gh run watch 4100000001 > /dev/null", output: "" },
      { command: "git push -q", output: "To https://github.example/fernhill/courts-api.git\n   6f4df74..ae398d1  main -> main" },
      { command: "gh run watch 4100000002 > /dev/null", output: "" },
      { command: "git revert --no-edit HEAD", output: "[main 2ef722f] Revert \"Release 2.4.0: booking notes\"\n Date: Fri Nov 27 09:04:36 2026 +0800\n 5 files changed, 2 insertions(+), 8 deletions(-)\n delete mode 100644 migrations/0003_add_booking_notes.sql\n delete mode 100644 src/main.js\n delete mode 100644 src/notes.js" },
      { command: "git push -q", output: "To https://github.example/fernhill/courts-api.git\n   ae398d1..2ef722f  main -> main" },
      { command: "gh run watch 4100000003 > /dev/null", output: "" },
      { command: "gh run view 4100000003", output: "X main Pipeline · 4100000003\nTriggered via push less than a minute ago\n\nJOBS\n✓ build in 8s (ID 11300000007)\nX staging in 2s (ID 11300000008)\n  ✓ Set up job\n  ✓ Run actions/checkout@v4\n  ✓ SSH key\n  X Migrate\n  - Deploy\n  - Smoke test\n  ✓ Post Run actions/checkout@v4\n  ✓ Complete job\n- production in 0s (ID 11300000009)\n\nANNOTATIONS\nX Process completed with exit code 1.\nstaging: .github#4\n\nTo see what failed, try: gh run view 4100000003 --log-failed\nView this run on GitHub: https://github.example/fernhill/courts-api/actions/runs/4100000003" },
      { command: "gh run view 4100000003 --log-failed | cut -f 3- | grep 'error:'", output: "2026-11-27T01:04:50.0000000Z error: the database has applied 0003_add_booking_notes, but migrations/0003_add_booking_notes.sql is not in this commit" },
      { command: "curl -s -o /dev/null -w '%{http_code}\\n' http://prod-01:8000/api/slots", output: "500" },
    ],
  },
];

// ---- Exercises (each starts from the machine as declared).
const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd13-ex-digest', title: '從部署紀錄找出上一個 digest', machine: 'cicd13-lab',
    statement: '在 ~/courts-api 先重現今天早上的兩次發布：以 `gh workflow run pipeline.yml` 部署 origin/main 目前的 2.3.0，用 `gh run watch 編號` 等它結束（production 要等 Priya 核准）；再以 `git push` 推送本機 main 上的 2.4.0，同樣等它結束。接著從 production 環境的部署紀錄，找出 2.4.0 之前 production 上的那一次部署來自哪個 run，再從那個 run 的日誌找出它部署的 Image digest。最後用 `gh run view` 接上文字工具，只印出那個 digest 一行（`sha256:` 加上 64 個十六進位字元）。',
    checks: [{ kind: 'output', fromCommand: '^gh run view ' }],
    solution: [...MORNING, PREVIOUS],
    mistakes: [
      { commands: [...MORNING, digestOfRun(4100000002)], why: '那是最新一次部署（2.4.0）的 digest，也就是正在出錯的版本；要的是它之前的那一筆' },
      { commands: [...MORNING, "gh run view 4100000001 --log | grep -o 'sha256:[0-9a-f]*' | head -n 1"],
        why: '日誌裡第一個 sha256: 是 `docker build -q` 印出的 Image ID，不是推送到 Registry 之後的 digest；以它拉取會得到 manifest unknown' },
      { commands: [...MORNING, HOST_220], why: '2.2.0 是早上之前手動部署的版本，不是 2.4.0 之前 production 跑的；而且答案要從 run 的日誌查出來' },
    ],
    variants: [{ label: '早上的發布晚了 20 分鐘', files: [], now: '2026-11-27 01:20:00' }],
    hints: [
      "部署紀錄依環境篩選、新的在前：`gh api 'repos/{owner}/{repo}/deployments?environment=production'`；第二筆就是 2.4.0 之前的那一次",
      '那一筆部署的 statuses（`…/deployments/編號/statuses`）裡的 `log_url` 指向產生它的 run 與 job；`gh run list` 也看得到 run 的編號',
      'build job 的 Push step 印出 `digest: sha256:…`，Deploy step 的指令裡有 `courts-api@sha256:…`；注意 `docker build -q` 印出的 `sha256:…` 是 Image ID，不是 digest',
      '例如 `gh run view 編號 --log | grep -o \'courts-api@sha256:[0-9a-f]*\' | head -n 1 | cut -d @ -f 2`',
    ],
    explanation: 'production 的部署紀錄新的在前：第一筆是 2.4.0（run 4100000002），第二筆是早上以 workflow_dispatch 部署的 2.3.0，它的 statuses 的 log_url 指向 run 4100000001。那個 run 的 build job 只建置一次、推送後得到 digest，staging 與 production 部署的都是同一個 `courts-api@sha256:…`，所以從 Push step 或 Deploy step 都能讀到它。這就是回滾要部署的東西：它是在 staging 與 production 都跑過、通過冒煙測試的那一份內容。Image ID 是本機 Image 設定的雜湊，Registry 不認得它；主機上帶著版本標籤的 2.2.0 則是更早、沒有部署紀錄的手動部署。',
  },
  {
    id: 'cicd13-ex-rollback', title: '以 rollback workflow 讓 production 回到上一個 digest', machine: 'cicd13-lab',
    statement: '在 ~/courts-api 先重現早上的兩次發布（部署 2.3.0、推送 2.4.0，各自等 run 結束）。現在 production 的 2.4.0 讓空場地列表 `/api/slots` 回應 500。找出 2.4.0 之前 production 跑的 digest，用 rollback.yml（`gh workflow run rollback.yml -f environment=… -f digest=…`）把 production 回滾到它，等 run 結束（production 需要審核，你不能核准自己觸發的部署，要等 Priya），再確認 prod-01 的 `/` 與 `/api/slots`。不要重新建置，也不要繞過管線直接 ssh 到主機換容器。',
    checks: [
      { kind: 'run', repo: COURTS, workflow: 'rollback.yml', job: 'rollback', conclusion: 'success' },
      { kind: 'deployment', repo: COURTS, environment: 'production', status: 'success', latest: true },
      { kind: 'container', host: 'prod-01', name: 'web', state: 'running' },
      { kind: 'http', url: 'http://prod-01:8000/', status: 200, body: '"version":"2.3.0"' },
      { kind: 'http', url: 'http://prod-01:8000/api/slots', status: 200, body: '"court":1' },
    ],
    solution: [...MORNING, `D=$(${PREVIOUS})`, ROLL_BACK('production', '$D'), WATCH3, 'curl -s http://prod-01:8000/api/slots'],
    mistakes: [
      { commands: [...MORNING, `D=$(${PREVIOUS})`, ROLL_BACK('staging', '$D'), WATCH3],
        why: '只回滾了 staging：run 成功、staging 恢復了，但 production 仍然是 2.4.0，使用者還在碰到 500' },
      { commands: [...MORNING, `D=$(${digestOfRun(4100000002)})`, ROLL_BACK('production', '$D'), WATCH3],
        why: '拿了最新一筆部署的 digest：那正是 2.4.0，等於把壞掉的版本再部署一次；rollback 的冒煙測試檢查 /api/slots，run 失敗，production 仍是 2.4.0' },
      { commands: [...MORNING, `D=$(${HOST_220})`, ROLL_BACK('production', '$D'), WATCH3],
        why: '部署了主機上帶版本標籤的 2.2.0（也是 Registry 的 latest）：它不是 2.4.0 之前 production 跑的版本，少了 2.3.0 的燈光費規則' },
      { commands: [...MORNING, "D=$(gh run view 4100000001 --log | grep -o 'sha256:[0-9a-f]*' | head -n 1)", ROLL_BACK('production', '$D'), WATCH3],
        why: '那是 `docker build -q` 印出的 Image ID，不是 digest：Deploy step 拉取時 Registry 回 manifest unknown，run 失敗，production 沒變' },
      { commands: [...MORNING, 'git revert --no-edit HEAD', 'git push -q', WATCH3],
        why: '以 revert 重新建置舊的程式：那是一份沒驗證過的新 Image，要走完整條管線；而且 revert 刪掉了已經套用的遷移 0003，Migrate 拒絕繼續，production 仍是 2.4.0' },
      { commands: [...MORNING, `D=$(${PREVIOUS})`, ROLL_BACK('production', '$D'), 'sleep 30'],
        why: '觸發之後沒有等：rollback job 還在等 Priya 核准（waiting），production 仍是 2.4.0' },
      { commands: [...MORNING, `D=$(${PREVIOUS})`, 'ssh deploy@prod-01 "docker rm -f web && docker run -d --name web -p 8000:8000 cr.fernhill.example/fernhill/courts-api@$D"'],
        why: '直接 ssh 到主機換容器：服務恢復了，但沒有審核、沒有冒煙測試、沒有部署紀錄，下一個人看紀錄會以為 production 還是 2.4.0' },
    ],
    hints: [
      '上一個 digest 的找法和練習「從部署紀錄找出上一個 digest」相同：production 部署紀錄的第二筆 → 它的 run → 日誌裡的 `courts-api@sha256:…`',
      '可以先存成變數：`D=$(gh run view 編號 --log | grep -o \'courts-api@sha256:[0-9a-f]*\' | head -n 1 | cut -d @ -f 2)`，再 `gh workflow run rollback.yml -f environment=production -f digest=$D`',
      '`gh run list -w rollback.yml` 找到這次回滾的編號，`gh run watch 編號` 會一直等到 Priya 核准、job 結束',
      '確認：`curl -s http://prod-01:8000/` 的版本、`curl -s http://prod-01:8000/api/slots` 不再是 500；`ssh deploy@prod-01 "docker inspect -f \'{{.Config.Image}}\' web"` 看主機上實際跑的 digest',
    ],
    explanation: '回滾就是把 production 換回上一個已知正常的 digest。rollback.yml 先確認輸入真的是 digest，再經過和 Pipeline 相同的 production 環境：Priya 核准之後才拿到 production 的 DEPLOY_KEY，把 2.3.0 那一份 Image 部署到 prod-01，冒煙測試同時檢查 /healthz 與 /api/slots。它不碰資料庫：遷移 0003 只新增了一個可以是空值的欄位，2.3.0 不讀它，照常運作。整個過程沒有建置任何東西，所以幾分鐘內完成，部署的也正是早上在 staging 與 production 都跑過的內容。注意新的部署紀錄：sha 是觸發 workflow 的 main 的 commit，也就是 2.4.0 的 commit，所以 run 的標題寫下了 digest，確認線上版本時要看主機或 run 的日誌。',
  },
  {
    id: 'cicd13-ex-forward', title: '向前修復：撤銷程式、保留遷移', machine: 'cicd13-lab',
    statement: '在 ~/courts-api 先重現早上的兩次發布（部署 2.3.0、推送 2.4.0，各自等 run 結束）。production 上的 2.4.0 壞了，而且兩個環境的資料庫都已經套用遷移 0003（新增 bookings.notes）。在 main 上向前修復：新增 commit，撤銷 2.4.0 的程式變更（src/main.js、src/notes.js、Dockerfile、package.json），但保留 migrations/0003_add_booking_notes.sql；不要改寫已經推送的歷史，也不要加上刪除 notes 欄位的遷移。推送後等新的 run 經 Priya 核准部署到 production。',
    checks: [
      { kind: 'branch', repo: COURTS, name: 'main', includes: 'r24', file: { path: 'migrations/0003_add_booking_notes.sql', includes: 'ADD COLUMN notes' } },
      { kind: 'branch', repo: COURTS, name: 'main', file: { path: 'Dockerfile', includes: 'src/server.js' } },
      { kind: 'run', repo: COURTS, workflow: 'pipeline.yml', tip: true, conclusion: 'success' },
      { kind: 'deployment', repo: COURTS, environment: 'production', tip: true, status: 'success', latest: true },
      { kind: 'http', url: 'http://prod-01:8000/api/slots', status: 200, body: '"court":1' },
      { kind: 'content', host: 'prod-01', path: '/srv/courts/applied', content: '0001_create_courts\n0002_create_bookings\n0003_add_booking_notes\n' },
    ],
    solution: [...MORNING, ...KEEP_0003, 'git push -q', WATCH3],
    mistakes: [
      { commands: [...MORNING, 'git revert --no-edit HEAD', 'git push -q', WATCH3],
        why: '整個 revert 連遷移 0003 也刪掉了：資料庫已經套用它，Migrate 拒絕繼續，staging 失敗，production 仍是 2.4.0' },
      { commands: [...MORNING, ...KEEP_0003, "printf -- '-- undo 0003\\nALTER TABLE bookings DROP COLUMN notes;\\n' > migrations/0004_drop_booking_notes.sql", 'git add migrations', "git commit -q -m 'Drop the notes column'", 'git push -q', WATCH3],
        why: '加上刪除 notes 欄位的遷移：2.3.0 根本不需要拿掉它，刪除卻會永久丟掉會員已經寫下的備註，這種破壞性的「資料庫回滾」做了就收不回來' },
      { commands: [...MORNING, `D=$(${PREVIOUS})`, ROLL_BACK('production', '$D'), WATCH3],
        why: '只用 rollback workflow 回滾：production 暫時恢復了，但 main 仍是壞掉的 2.4.0，下一次推送或重新執行 Pipeline 就會把它部署回去' },
      { commands: [...MORNING, 'git reset -q --hard HEAD~1', 'git push -q -f', WATCH3],
        why: 'reset 再強制推送是改寫已推送的歷史：main 的保護拒絕強制推送（GH006），main 仍是 2.4.0；就算推得上去，也會刪掉已經套用的遷移' },
      { commands: [...MORNING, ...KEEP_0003, 'git push -q', 'sleep 60'],
        why: '推送之後沒有等：staging 已經部署，但 production 還在等 Priya 核准（waiting）' },
    ],
    hints: [
      '`git revert --no-edit HEAD` 會撤銷 2.4.0 的全部變更，包括遷移檔案；revert 之後可以從上一個 commit 把那個檔案拿回來',
      '`git checkout HEAD~1 -- migrations/0003_add_booking_notes.sql` 把檔案恢復成 2.4.0 的內容並加入 index；再 `git commit --amend` 併進 revert 的 commit，或另外提交一個 commit',
      '推送前用 `git show --stat HEAD` 與 `git diff HEAD~1 --stat` 確認：Dockerfile 回到 `src/server.js`，migrations/ 沒有被刪除',
      '`gh run watch 編號` 等到 Priya 核准、production 結束；`ssh deploy@prod-01 cat /srv/courts/applied` 看資料庫的遷移紀錄',
    ],
    explanation: '向前修復是讓 main 往前多一個 commit，而不是倒退：這個 commit 撤銷 2.4.0 的程式，Dockerfile 回到 `node src/server.js`，但遷移 0003 留在 migrations/。資料庫已經有 notes 欄位，它是只新增、可以是空值的擴充，舊的程式不讀它也照常運作，所以不需要、也不應該把它拿掉。migrate.sh 看到資料庫套用過的每個遷移都還在，沒有新的要套用；新的 run 重新建置、在 staging 通過冒煙測試，經 Priya 核准後部署到 production。main、Registry、部署紀錄與主機從此一致，之後 Tomás 修好備註功能時，再以新的版本（例如放在預設關閉的功能旗標後面）重新發布，不必重新套用遷移。',
  },
];

// ---- D2: what a flag cut, a database rollback and a destructive migration do to a rollback (illustrative data).
const fleet: Fleet = { instances: 4, capacityRpm: 300, rpm: 1000 };
const v230: AppVersion = { id: 'v230', label: '2.3.0', errorPermille: 2, p95Ms: 120, startSeconds: 90 };
const v240: AppVersion = { id: 'v240', label: '2.4.0', errorPermille: 2, p95Ms: 130, startSeconds: 90 };
/** Booking notes behind a flag in 2.4.0: requests on the notes path fail at 200 ‰. */
const notes = (...exposure: [at: number, percent: number][]): FeatureFlag[] =>
  [{ id: 'booking-notes', label: '預約備註', version: 'v240', errorPermille: 200, exposure: exposure.map(([at, percent]) => ({ at, percent })) }];
const oneByOne: Strategy = { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 };
const MINUTES = 12;
const rollback: RolloutScenario = { fleet, from: v240, to: v230, strategy: oneByOne, flags: notes([0, 100]), minutes: MINUTES };
const flagCut: RolloutScenario = { ...rollback, flags: notes([0, 100], [1, 0]) };
const dbDown: RolloutScenario = { ...rollback, from: { ...v240, requires: ['notes'] }, schema: ['id', 'court_id', 'starts_at', 'notes'],
  migrations: [{ at: 0, kind: 'contract', columns: ['notes'] }] };
/** If 2.4.0 had renamed phone to contact_phone in one migration (the old column dropped), or only expanded. */
const renamed = { fleet, from: { ...v240, requires: ['contact_phone'] }, to: { ...v230, requires: ['phone'] }, strategy: oneByOne, minutes: MINUTES };
const destructive: RolloutScenario = { ...renamed, schema: ['id', 'name', 'contact_phone'] };
const expanded: RolloutScenario = { ...renamed, schema: ['id', 'name', 'phone', 'contact_phone'] };

export const CICD13: LessonContent = {
  lessonId: 'CICD13',
  motivation: '「早上九點多，courts-api 2.4.0 帶著新的預約備註上線了。staging 與 production 的冒煙測試都是綠的，十分鐘後櫃台卻打電話來：會員打開空場地列表只看到錯誤頁。值班的工程師第一個念頭是把 2.4.0 revert 掉重新部署，但那要重新建置、再走一次整條管線；何況 2.4.0 還新增了一個資料庫欄位，已經套用在 production 的資料庫上。」CICD09 讓每個 commit 都以同一個 digest 從 staging 晉升到 production，CICD10 比較了部署策略，CICD11 讓問題能被告警發現；這一課處理發現之後的那幾分鐘。依序判斷何時回滾、何時向前修復，用 rollback workflow 把 production 換回上一個已知正常的 digest，用功能旗標把部署與發布分開、讓關掉一個功能不需要部署，設計回滾時仍然相容的資料庫遷移，最後把這些整理成每次發布前都要走過的檢查清單。終端機的部分在模擬的 GitHub Actions 與兩台模擬的 Docker 主機上真的部署、真的回滾；旗標與遷移的影響在部署模擬器裡逐分鐘比較。',
  sections: [
    {
      id: 'cicd13-s-setup', title: '本課的團隊、主機與今天早上的發布',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的 Fernhill 社區運動中心，服務 courts-api 處理球場的預約，程式放在模擬的 `github.example` 上的 fernhill/courts-api。你是今天值班的 Lai Yu-chen（gh 帳號 yuchen-lai，儲存庫的 admin）；Hana Sato 是平台工程師，寫了管線、遷移指令稿與回滾用的 workflow；Tomás Rivera 是開發者，寫了 2.3.0 與 2.4.0；Priya Nair 負責發布，是 production 的審核者。模擬的時鐘是 2026-11-27 01:00 UTC（台北時間上午 09:00）。' },
        { type: 'table', head: ['機器', '角色', '目前的狀態'], rows: [
          ['yuchen-laptop（你的筆電）', '~/courts-api 是儲存庫的複本；有 git、gh、ssh、curl 與 docker', 'origin/main 是 2.3.0；本機的 main 多了 Tomás 的 2.4.0，還沒推送'],
          ['staging-01（10.30.0.11）', 'staging 的 Docker 主機；帳號 deploy 在 docker 群組裡', '容器 web 跑上個月手動部署的 `courts-api:2.2.0`；/srv/courts/applied 記錄這個環境的資料庫套用過的遷移'],
          ['prod-01（10.30.0.21）', 'production 的 Docker 主機，設定相同', '同樣跑 2.2.0，資料庫套用到 0002'],
          ['cr.fernhill.example', '團隊的 Registry', 'ci-bot 可以推送；deploy 與你只能拉取；`latest` 指向 2.2.0'],
        ] },
        { type: 'table', head: ['workflow', '觸發', '做什麼'], rows: [
          ['pipeline.yml（Pipeline）', '推送到 main，或 `gh workflow run`', 'build 只建置一次並輸出 digest；staging 與 production（`needs: [build, staging]`、等待審核、`concurrency: production`）各自依序執行 SSH key、Migrate、Deploy、Smoke test，部署的都是同一個 digest。冒煙測試只檢查 `/healthz`'],
          ['rollback.yml（Rollback）', '只能手動，輸入 `environment`（staging 或 production）與 `digest`', '檢查輸入是 digest，經過同一個部署環境把它部署到那個環境的主機，冒煙測試檢查 `/healthz` 與 `/api/slots`；不執行任何遷移'],
        ] },
        { type: 'p', text: '兩個環境都有自己的 `DEPLOY_HOST` 變數（staging-01、prod-01）與 `DEPLOY_KEY` secret，所以同一份 job 定義依環境連到不同的主機。production 的保護規則和 CICD09 相同：審核者是你與 Priya（一人核准就夠）、開啟 prevent self-review、只有受保護的分支可以部署（main 受保護，管理員也不能強制推送）。scripts/migrate.sh 在部署之前套用新的遷移：它先確認資料庫套用過的每個遷移在這個 commit 裡都還找得到，再依序套用還沒套用的檔案。' },
        { type: 'example', id: 'cicd13-tour' },
        { type: 'p', text: '2.4.0 做了兩件事：遷移 0003 在 bookings 新增一個可以是空值的 notes 欄位，程式改從新的 src/main.js 啟動並載入備註功能，Dockerfile 的 CMD 跟著改了。這個遷移只新增欄位，2.3.0 不讀它也能照常運作；這一點在第五節會變得很重要。prod-01 現在跑 2.2.0，資料庫套用到 0002。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '模擬環境不保存課程開始前的 run，所以每個例子與練習都先用幾個指令重現今天早上的兩次發布：以 workflow_dispatch 部署 2.3.0，再推送 2.4.0，兩次在模擬的時鐘上只隔幾分鐘。Priya 是模擬的審核者，在部署開始等待後 2 分鐘核准。模擬環境也沒有資料庫：主機上的 /srv/courts/applied 代替資料庫裡記錄已套用遷移的那張表，migrate.sh 只讀寫這個檔案；欄位存在與否對程式的影響，在第四、五節的部署模擬器裡看。ssh、拉取與啟動容器不花時間；gh 與 REST 的部分欄位與訊息依記得的格式模擬。組織、人物、主機與 Token 都是虛構的。' },
      ],
    },
    {
      id: 'cicd13-s-decide', title: '回滾還是向前修復',
      blocks: [
        { type: 'p', text: '新版本在正式環境出問題時，有三條路。回滾（rollback）是讓正式環境回到上一個已知正常的版本：重新部署之前跑過的那一份產出物，不建置任何新東西。向前修復（roll forward、fix forward）是部署一個新的版本來解決問題：可能是真正的修正，也可能是以 `git revert` 撤銷變更的新 commit，兩者都要再走一次建置、測試與部署。第三條路是不部署：問題如果在功能旗標後面，關掉旗標就好（第四節）。' },
        { type: 'table', head: ['做法', '做什麼', '多快見效', '前提'], rows: [
          ['關掉功能旗標', '同一個版本不再走新功能的路徑', '設定生效就停止，通常是秒到分鐘', '問題出在旗標後面的程式'],
          ['回滾', '重新部署上一個 digest', '一次部署的時間：審核、拉取、替換執行個體', '上一個版本還能和目前的資料庫、API 與訊息格式相容'],
          ['向前修復', '建置並部署新的版本（修正或 revert）', '整條管線的時間，加上寫修正與審查的時間', '問題已經理解、修正有把握，或回滾已經不可行'],
        ] },
        { type: 'list', items: [
          '影響多大、還在擴大嗎？使用者正在受影響時，先選最快能止血的做法，修正晚一點再做。',
          '上一個版本還相容嗎？新版本若已經改了資料庫結構、改了別的服務依賴的 API 或寫出了舊版本讀不懂的資料，回滾可能比不回滾更糟。',
          '修正有多少把握？一行明顯的錯字，向前修復可能和回滾一樣快；需要調查的問題，先回滾再慢慢修。',
          '不論選哪一條，事後都要讓 main 與線上一致：回滾之後 main 上仍是壞掉的版本，下一次部署會把它帶回來，所以回滾之後幾乎一定接著一次向前修復。',
        ] },
        { type: 'p', text: '下面的例子重現早上的兩次發布。注意 2.4.0 的 run：兩個環境的 Migrate 都套用了 0003，冒煙測試都通過，因為它只檢查 `/healthz`；真正壞掉的是空場地列表 `/api/slots`。最後從 production 的部署紀錄找出 2.4.0 之前的那一筆，以及它來自哪個 run。' },
        { type: 'example', id: 'cicd13-morning' },
        { type: 'p', text: 'production 的部署紀錄新的在前：1900000004 是 2.4.0（sha 是 2.4.0 的 commit），1900000002 是 2.3.0。那一筆的 statuses 新的在前：最上面是 inactive，因為 2.4.0 成功之後它就不再是線上的部署，下面是 success；`log_url` 指向 run 4100000001 的 production job，回滾要用的 digest 就記在那個 run 的日誌裡。這裡的判斷很清楚：會員現在就受影響，修正需要調查，而 2.3.0 和套用了 0003 的資料庫相容，所以先回滾，再向前修復。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：回滾就是 revert 之後重新部署', text: '`git revert` 加上重新部署是向前修復：它產生一個新的 commit、建置一份新的 Image，要重新跑完測試、staging 與審核，digest 也和之前跑過的那一份不同。真正的回滾不建置任何東西，只把之前已經在正式環境證明過的那個 digest 換回去，所以比較快，也比較確定。revert 還有另一個陷阱：它會連資料庫遷移一起撤銷，第五節會看到管線因此停下來。' },
      ],
    },
    {
      id: 'cicd13-s-rollback', title: '以 digest 回滾：rollback workflow',
      blocks: [
        { type: 'p', text: 'CICD09 說「建置一次，以 digest 晉升」；回滾是同一個原則反過來用：把上一個已知正常的 digest 再部署一次。Hana 為此寫了 rollback.yml，讓回滾成為一個預先寫好、測試過、按一下就完成的動作，而不是事故當下臨時想的 ssh 指令。' },
        { type: 'table', head: ['rollback.yml 的設計', '為什麼'], rows: [
          ['`workflow_dispatch`，`environment` 是 `type: choice`（staging、production）', '只能選存在的環境；打錯字在觸發時就被拒絕（HTTP 422），不會跑到一半才失敗'],
          ['第一個 step 以 `grep -Eqx \'sha256:[0-9a-f]{64}\'` 檢查 `digest`', '標籤（latest、2.3.0）會移動，回滾要的是內容固定的那一份；這個 step 經由環境變數讀取輸入，不直接代換進指令（CICD08 的 script injection），通過檢查之後，後面的 step 才使用它'],
          ['`run-name: Roll back … to sha256:…`', '`gh run list` 的標題直接寫出回滾到哪個 digest，事後不必打開日誌'],
          ['`environment: ${{ inputs.environment }}` 與同名的 `concurrency`', '和 Pipeline 經過同一個關卡：同樣的審核者、同樣的 secret 與變數；production 的回滾和 Pipeline 的 production job 在同一個 concurrency 群組，不會同時替換 prod-01 的容器'],
          ['冒煙測試加上 `/api/slots`', '回滾之後要確認的正是剛才壞掉的那個功能，不只是服務活著'],
          ['沒有 Migrate step', '回滾只換程式，不動資料庫（第五節）'],
        ] },
        { type: 'p', text: '回滾的流程應該在平常就演練過，而不是第一次用在事故裡。下面的例子在 2.3.0 部署之後、2.4.0 推送之前，在 staging 演練一次：先試幾個常見的錯誤，看 workflow 怎麼擋下它們，最後把 staging 回滾到它早上之前跑的 2.2.0。' },
        { type: 'example', id: 'cicd13-drill' },
        { type: 'p', text: '`prod` 不在選項裡，觸發時就被拒絕；`latest` 被第一個 step 擋下，連主機都沒有碰。`docker inspect` 的 `.Id` 是 Image ID：本機 Image 設定的雜湊，形狀和 digest 一樣是 `sha256:` 加上 64 個十六進位字元，所以通過了格式檢查，但 Registry 不認得它，拉取時回 manifest unknown。`docker images --digests` 的 DIGEST 欄才是 Registry 的 digest。2.2.0 是上個月手動部署的，沒有任何部署紀錄，只能從主機上找到它的 digest，這正是手動部署的代價。回滾成功的 run 標題寫著 digest；staging 回到 2.2.0，production 完全沒有變。' },
        { type: 'table', head: ['常見的錯誤回滾', '結果'], rows: [
          ['部署 `latest` 或版本標籤', '標籤指向哪裡取決於最後一次推送；這裡的 latest 是 2.2.0，不是 2.4.0 之前跑的 2.3.0'],
          ['從舊的 commit 重新建置', '得到一份沒有驗證過的新 Image，要等整條管線；revert 還可能撤銷已經套用的遷移'],
          ['把 Image ID 當成 digest', 'Registry 找不到，部署失敗，production 停在壞掉的版本'],
          ['只回滾 staging', 'run 是綠的，使用者仍然在 production 碰到錯誤'],
          ['ssh 到主機手動換容器', '沒有審核、沒有冒煙測試、沒有部署紀錄；下一個人無法從紀錄知道線上跑的是什麼'],
          ['回滾之後不驗證', '不知道問題是否真的消失；要看冒煙測試、出錯的那個功能、主機上的 digest 與告警是否恢復'],
        ] },
        { type: 'callout', tone: 'warning', title: '回滾之後，部署紀錄的 sha 不是線上的程式', text: '以 workflow_dispatch 在 main 上觸發 rollback.yml，部署紀錄的 sha 是觸發時 main 的 commit，也就是 2.4.0 的 commit，即使主機上跑的是 2.3.0 的 Image。部署紀錄記的是「哪個 commit 的 workflow 部署了」，不是「部署了哪個 Image」。所以 rollback.yml 把 digest 寫進 run 的標題，確認線上版本時以主機上的 `docker inspect -f \'{{.Config.Image}}\' web` 或 run 的日誌為準。' },
      ],
    },
    {
      id: 'cicd13-s-flags', title: '功能旗標：把部署與發布分開',
      blocks: [
        { type: 'p', text: '部署（deploy）是把程式放上正式環境；發布（release）是讓使用者用到新功能。功能旗標（feature flag）讓這兩件事分開：新功能的程式隨著部署上線，但預設關閉，之後再依比例或對象開放。出問題時關掉旗標，同一個版本立刻不再走新功能的路徑，不需要建置、審核或替換任何執行個體，這是最快的「回滾」，常被稱為 kill switch。' },
        { type: 'p', text: '下面的部署模擬器是示意資料：同一個 courts-api，4 個執行個體、每個每分鐘最多 300 個請求、每分鐘 1,000 個請求，兩個版本都要 90 秒（模型中 2 分鐘）才就緒。假設 2.4.0 的預約備註放在旗標 booking-notes 後面，開放到 100% 之後，走這條路徑的請求有 200‰ 失敗。時間軸的第 0 分鐘是決定處理的那一刻：第一個探索器以滾動更新（1／0）把 2.3.0 部署回去，旗標一直開著；第二個在第 0 分鐘決定關掉旗標，從第 1 分鐘生效，回滾照樣進行。' },
        { type: 'example', id: 'cicd13-d-rollback' },
        { type: 'example', id: 'cicd13-d-flag' },
        { type: 'p', text: '回滾要等每個 2.3.0 就緒才能移除一個 2.4.0，這段期間仍在服務的 2.4.0 繼續出錯；關掉旗標之後，2.4.0 只剩它本來的 2‰，回滾變成可以慢慢做、甚至不必做的事。真實的回滾還要加上觸發、審核與拉取 Image 的時間，差距只會更大。回滾本身的快慢也取決於策略：在探索器裡調整滾動更新的參數，看完成的分鐘、丟棄的請求與尖峰的執行個體怎麼變化（練習「要快、又不丟請求的回滾」）。' },
        { type: 'table', head: ['', '關掉旗標', '回滾'], rows: [
          ['需要部署', '不需要，改一個設定', '需要：審核、拉取、替換執行個體'],
          ['影響的範圍', '只有旗標後面的功能', '整個版本的所有變更，包括沒有問題的'],
          ['前提', '問題剛好在旗標後面，而且關閉的路徑是可靠的', '上一個版本和目前的資料庫與其他服務相容'],
          ['之後', '修好再重新開放', '修好之後以新的版本向前修復'],
        ] },
        { type: 'list', items: [
          '預設關閉：新功能隨部署上線時是 0%，發布是另一個有人負責、可以觀察的決定。',
          '兩條路徑都要測試：旗標開與關都是正式環境會跑的程式，關閉的那條路徑壞了，kill switch 就失去作用。',
          '旗標的改變也是一種變更：誰在什麼時候改了什麼要留下紀錄，事故時才知道是部署還是旗標造成的。',
          '用完就移除：全面開放之後刪掉旗標與舊的路徑，否則程式裡的分支越來越多、越來越難測試。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：有功能旗標就不需要回滾', text: '旗標只能關掉它包住的程式。同一次部署裡的其他變更（升級的套件、改過的設定、新的啟動方式，例如 2.4.0 的 src/main.js）不在任何旗標後面；資料庫遷移也不能用旗標關掉，欄位一旦新增或刪除就已經發生。旗標縮小了需要回滾的情況，但回滾的流程仍然要準備好、演練過。' },
      ],
    },
    {
      id: 'cicd13-s-migrations', title: '相容的資料庫遷移：回滾只換程式',
      blocks: [
        { type: 'p', text: '回滾把程式換回上一個版本，資料庫卻留在新的結構，裡面還有新版本寫進去的資料。所以「能不能回滾」取決於上一個版本能不能和新的結構一起運作。相容的資料庫遷移就是讓這件事一直成立：CICD10 的擴充與收縮（expand and contract），從回滾的角度再看一次。' },
        { type: 'table', head: ['步驟', '做什麼', '這時能回滾嗎'], rows: [
          ['1. 擴充（expand）', '只新增：可以是空值或有預設值的欄位、新的資料表；舊欄位保留', '可以：舊版本不讀新欄位，照常運作'],
          ['2. 部署', '新版本開始讀寫新欄位，必要時同時寫入舊欄位', '可以：舊欄位仍在，舊版本讀得到完整的資料'],
          ['3. 收縮（contract）', '確定不會再回滾到舊版本之後，才刪除舊欄位，通常隔一次以上的發布', '不能再回滾到需要舊欄位的版本，所以要等到確定不需要'],
        ] },
        { type: 'p', text: '先看把資料庫也「回滾」會怎樣：回滾 2.4.0 的同時，在第 0 分鐘執行 0003 的反向遷移（刪除 notes）。2.4.0 需要這個欄位，還沒被替換的 2.4.0 從那一刻起每個請求都失敗。' },
        { type: 'example', id: 'cicd13-d-db-down' },
        { type: 'p', text: '再看另一種情況：假設 2.4.0 的遷移不是新增 notes，而是一步把 `phone` 改名為 `contact_phone`，也就是刪除了舊欄位。這時回滾到 2.3.0，新啟動的 2.3.0 找不到它需要的 `phone`，承接的請求全部失敗，回滾越接近完成、錯誤越多。下面第一個探索器是這種破壞性的改名，第二個是只做了擴充的版本：兩個欄位並存，回滾很平順。' },
        { type: 'example', id: 'cicd13-d-destructive' },
        { type: 'example', id: 'cicd13-d-expanded' },
        { type: 'p', text: '兩條規則因此很明確：遷移先擴充，讓上一個版本在新的結構上仍然能運作；事故當下不要回滾資料庫，尤其不要執行會刪除欄位或資料表的反向遷移。刪除是破壞性的：notes 裡會員已經寫下的備註，刪掉就沒有了，之後重新新增欄位也拿不回來。真的需要改回結構時，應該是一個經過審查的新遷移，在正常的發布裡進行。' },
        { type: 'p', text: '回到終端機：回滾讓 production 恢復之後，還要向前修復 main。最直覺的做法是 `git revert` 整個 2.4.0，但它連遷移 0003 的檔案也一起刪掉了，而兩個環境的資料庫早已套用它。' },
        { type: 'example', id: 'cicd13-revert-all' },
        { type: 'p', text: 'migrate.sh 發現資料庫套用過 0003、這個 commit 卻沒有它，於是拒絕繼續：程式碼裡的遷移歷史和資料庫不一致時，新建立的環境不會有這個欄位，之後也可能再套用一次。常見的遷移工具在資料庫裡有、程式碼裡找不到的遷移時，也會拒絕執行或發出警告。正確的向前修復是撤銷 2.4.0 的程式、保留遷移的檔案，這是練習「向前修復：撤銷程式、保留遷移」要做的。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：回滾程式時，資料庫也要一起退回去', text: '只新增的遷移不需要退回：舊版本不讀新欄位，照常運作；把它刪掉反而讓還在跑的新版本立刻失敗，也丟掉了新版本寫入的資料。需要退回才能讓舊版本運作的遷移（改名、刪除、改型別），代表發布時就沒有做到相容，這時的回滾本身就有風險，往往只能向前修復。資料庫的備份與還原是災難復原的手段，用在部署出錯上，會連同這段時間所有正常的寫入一起丟掉。' },
      ],
    },
    {
      id: 'cicd13-s-checklist', title: '發布檢查清單',
      blocks: [
        { type: 'p', text: '這一課的每個問題，都可以在發布之前用一個問題擋下來。發布檢查清單（release checklist）把這些問題寫成每次發布都要確認的項目：大部分應該由管線自動保證，剩下的由發布的人在核准之前逐項確認。清單的目的不是增加手續，而是讓「出事時能安全地退」在發布之前就成立。' },
        { type: 'table', head: ['項目', '做法', '本課的例子'], rows: [
          ['建置一次，以 digest 晉升', 'production 部署的是 staging 驗證過的同一個 digest；回滾也以 digest 指定', 'Pipeline 的 `needs.build.outputs.digest`；rollback.yml 拒絕標籤'],
          ['遷移先擴充', '這次的遷移只新增、可以是空值；刪除與改名等到不再需要回滾的版本之後', '0003 只新增 notes，2.3.0 照常運作，回滾才可行'],
          ['旗標預設關閉', '新功能隨部署上線時是關閉的，開放是另一個決定；關閉的路徑也測過', '2.4.0 的備註若放在旗標後面，關掉旗標就能止血'],
          ['冒煙測試與告警', '部署後檢查最重要的使用者路徑，不只 /healthz；上線後一段時間看告警與錯誤率（CICD11）', '2.4.0 的冒煙測試只看 /healthz，空場地列表的 500 直到櫃台打電話才被發現'],
          ['回滾計畫已經測試', '寫好的 rollback workflow、知道上一個 digest 在哪裡、最近演練過一次', 'rollback.yml 與 staging 的演練'],
          ['誰核准、誰回滾', '核准的人看過這次的變更與檢查結果；事故時誰有權限觸發回滾、誰核准，事先講好', 'production 的審核者是 Yu-chen 與 Priya，prevent self-review'],
        ] },
        { type: 'list', ordered: true, items: [
          '發布前：變更與遷移經過審查，遷移是擴充；新功能在預設關閉的旗標後面；確認上一個 digest 與回滾的方式。',
          '發布中：同一個 digest 依序經過 staging 與 production，每個環境都有冒煙測試，production 由另一個人核准。',
          '發布後：觀察錯誤率、延遲與告警一段時間；逐步開放旗標；出問題時依第二節的判斷先止血。',
          '收尾：不再需要回滾之後才收縮遷移、移除旗標；把這次學到的事加進清單。',
        ] },
        { type: 'callout', tone: 'tip', title: '清單會隨事故成長', text: '今天的事故讓清單多了一項：冒煙測試要包含空場地列表。好的檢查清單不是一次寫完的，每次事故的事後檢討（CICD14）都可能加上一項，或把一項人工確認改成管線裡的自動檢查。項目太多、沒有人真的逐項看的清單，就和習慣性按下的核准一樣，只剩形式。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd13-q-decide', prompt: 'production 的 2.4.0 讓空場地列表回應 500，修正需要調查半天；2.4.0 的遷移只新增了一個可以是空值的欄位。值班的人最先該做什麼？',
      options: ['等 Tomás 把修正寫好、審查通過之後，再以新的版本向前修復', '以 rollback workflow 部署 2.3.0 的 digest', '先執行 0003 的反向遷移讓資料庫回到 2.3.0 的樣子，再部署 2.3.0', '從 2.3.0 的 commit 重新建置一份 Image，經過管線部署'],
      answer: 1,
      explanation: '使用者正在受影響、修正又需要時間，而 2.3.0 和只做了擴充的資料庫相容，所以先回滾到上一個已知正常的 digest 止血。等 Tomás 的修正會讓錯誤持續半天；反向遷移會刪掉 notes 的資料，還讓仍在跑的 2.4.0 立刻全部失敗，2.3.0 根本不需要它；重新建置得到一份沒驗證過的新 Image，還要走完整條管線。',
    },
    {
      id: 'cicd13-q-target', prompt: '回滾 production 時，rollback workflow 應該部署什麼？',
      options: ['Registry 上的 `latest`', '`courts-api:2.3.0` 這個版本標籤', '2.4.0 之前那筆 production 部署所用的 digest', '`docker build -q` 在那次建置時印出的 `sha256:…`'],
      answer: 2,
      explanation: '上一筆 production 部署用的 digest 是內容固定、已經在正式環境跑過的那一份。latest 會移動，本課的 latest 是 2.2.0；版本標籤也可能被重新推送覆蓋；`docker build -q` 印出的是 Image ID，Registry 不認得它，拉取會失敗。',
    },
    {
      id: 'cicd13-q-record', prompt: 'main 的最新 commit 是 2.4.0。你以 `gh workflow run rollback.yml -f environment=production -f digest=<2.3.0 的 digest>` 回滾成功。production 最新一筆部署紀錄的 sha 是什麼？',
      options: ['2.4.0 的 commit', '2.3.0 的 commit，也就是那個 digest 的來源', '2.3.0 的 digest，由 run 的輸入寫進紀錄', '沒有新的紀錄：回滾不經過建置，不建立部署紀錄'],
      answer: 0,
      explanation: '部署紀錄的 sha 是觸發 workflow 的 commit，在 main 上觸發就是 main 目前的 2.4.0，即使主機上跑的是 2.3.0 的 Image。紀錄不會追溯 digest 來自哪個 commit，也沒有記錄 digest 的欄位（所以 rollback.yml 把它寫進 run 的標題）；部署紀錄由寫了 environment 的 job 建立，和有沒有建置無關，回滾一樣會建立。確認線上版本要看主機或 run 的日誌。',
    },
    {
      id: 'cicd13-q-flag', prompt: '預約備註放在預設關閉的功能旗標後面，開放到 100% 之後錯誤率升高。最快的止血方式是什麼？',
      options: ['以滾動更新把整個機群換回 2.3.0', '把 notes 欄位從資料庫刪掉', '在 main 上 revert 再走一次管線', '把旗標關回 0%'],
      answer: 3,
      explanation: '旗標把部署與發布分開，關掉它，同一個版本立刻不再走備註的路徑，不需要建置、審核或替換執行個體。滾動回滾要等每個 2.3.0 就緒，期間錯誤持續；刪欄位會丟資料、還讓 2.4.0 全部失敗；revert 要走完整條管線，是最慢的一種。',
    },
    {
      id: 'cicd13-q-order', prompt: '下一個版本要把 `phone` 改名為 `contact_phone`，而且發布後幾天內都可能需要回滾。哪一個順序是對的？',
      options: ['先新增 contact_phone，再部署，不再回滾之後才刪 phone', '同一個遷移裡新增 contact_phone 並刪除 phone，接著部署新版本', '先部署新版本，等它在 production 穩定幾天之後再新增 contact_phone', '先刪除 phone 再部署新版本，出問題時再把 phone 欄位加回來'],
      answer: 0,
      explanation: '擴充、部署、收縮：兩個欄位並存的期間，新舊版本都能運作，隨時可以回滾；收縮要等確定不需要回滾。同一個遷移裡刪掉 phone，回滾的 2.3.0 立刻全部失敗；先部署再新增，新版本一上線就找不到欄位；刪掉的 phone 再加回來也只是空欄位，資料已經沒有了。',
    },
    {
      id: 'cicd13-q-down', prompt: '回滾 2.4.0 時，同事提議順便執行 0003 的反向遷移（`DROP COLUMN notes`），「讓資料庫也回到 2.3.0 的樣子」。為什麼不該這樣做？',
      options: ['反向遷移會改變 2.3.0 的 Image digest，回滾時就找不到它', '多數遷移工具一律禁止在正式環境執行反向遷移，指令會失敗', '2.3.0 不需要退回它，刪除卻會丟資料、讓 2.4.0 失敗', '資料庫會跟著程式自動回滾到 0002，不需要手動執行'],
      answer: 2,
      explanation: '0003 只新增欄位，2.3.0 不讀它也照常運作，退回它沒有任何好處；刪除卻永久丟掉會員寫下的備註，而且滾動回滾期間還在服務的 2.4.0 需要這個欄位，會立刻全部失敗。反向遷移改的是資料庫，不會改變任何 Image 的 digest；多數遷移工具允許執行反向遷移，該不該做是判斷的問題；資料庫也不會跟著程式自動回滾，回滾只換程式。',
    },
    {
      id: 'cicd13-q-smoke', prompt: '2.4.0 通過了 staging 與 production 的冒煙測試，空場地列表卻在 production 回應 500。發布檢查清單的哪一項最直接能提早擋下它？',
      options: ['production 改成兩位審核者都要核准', '每次發布都從頭重新建置 Image', '把 Registry 的 latest 指向最新的版本', '冒煙測試涵蓋最重要的使用者路徑'],
      answer: 3,
      explanation: '冒煙測試只檢查 /healthz，服務活著就通過；加上 /api/slots，staging 的冒煙測試就會失敗，production 根本不會被部署。多一位審核者看的仍是同樣的檢查結果；重新建置不會讓壞掉的程式變好，反而失去「測過的就是部署的」；latest 指向哪裡和這次的錯誤無關。',
    },
    {
      id: 'cicd13-q-staging', prompt: '事故中，值班的人執行了 `gh workflow run rollback.yml -f environment=staging -f digest=<上一個 digest>`，run 是綠的。現在是什麼狀況？',
      options: ['production 也一起回滾了，因為兩個環境共用同一個 rollback run', 'staging 回滾了，production 仍是 2.4.0', 'run 雖然是綠的，staging-01 其實還在跑 2.4.0', 'production 正在進行的部署被取消，等待重新審核'],
      answer: 1,
      explanation: '`environment` 決定這個 job 經過哪個環境、拿到哪台主機的變數與金鑰，選了 staging 就只部署到 staging-01；production 完全沒有被碰到，使用者仍然看到 500。rollback job 只部署它選的那一個環境；run 成功、冒煙測試通過，代表 staging-01 已經換成那個 digest；它也不會取消或影響 production 的任何部署。',
    },
  ],
  terminal: { machines: [lab], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    rollouts: [
      {
        id: 'cicd13-d-rollback', title: '回滾：把 2.3.0 部署回去（滾動 1／0）',
        description: '第 0 分鐘決定回滾：一次多開一個 2.3.0，就緒後移除一個 2.4.0。2.4.0 的旗標 booking-notes 一直是 100%，還沒被替換的 2.4.0 持續出錯。',
        scenario: rollback,
      },
      {
        id: 'cicd13-d-flag', title: '先關旗標，回滾照樣進行',
        description: '同一個回滾，但第 0 分鐘同時決定把 booking-notes 關到 0%，從第 1 分鐘生效。2.4.0 之後只走原本的路徑。',
        scenario: flagCut,
      },
      {
        id: 'cicd13-d-db-down', title: '回滾時把資料庫也退回去',
        description: '同一個回滾，再加上第 0 分鐘執行 0003 的反向遷移，刪除 notes 欄位；2.4.0 需要這個欄位，2.3.0 不需要。',
        scenario: dbDown,
      },
      {
        id: 'cicd13-d-destructive', title: '破壞性的改名之後回滾',
        description: '假設 2.4.0 的遷移一步把 `phone` 改名為 `contact_phone`（舊欄位已刪除），再以同樣的滾動更新回滾到需要 `phone` 的 2.3.0。',
        scenario: destructive,
      },
      {
        id: 'cicd13-d-expanded', title: '只做了擴充的改名之後回滾',
        description: '同樣的兩個版本與回滾，但遷移只新增了 `contact_phone`，`phone` 還在，兩個版本需要的欄位都存在。',
        scenario: expanded,
      },
    ],
    exercises: [
      {
        id: 'cicd13-x-flag', kind: 'table', title: '關旗標與回滾，各有多少錯誤',
        statement: '比較「回滾」與「先關旗標，回滾照樣進行」兩個情境：整個時間軸的錯誤請求（兩個版本合計）各有幾個？回滾在第幾分鐘完成？',
        blanks: [
          { id: 'rollback', label: '回滾：錯誤的請求', query: { task: 'rollout', rollout: 'cicd13-d-rollback', metric: 'errors' } },
          { id: 'flag', label: '先關旗標：錯誤的請求', query: { task: 'rollout', rollout: 'cicd13-d-flag', metric: 'errors' } },
          { id: 'done', label: '回滾完成的分鐘', query: { task: 'rollout', rollout: 'cicd13-d-rollback', metric: 'completed-at' } },
        ],
        hints: [
          '2.3.0 要 2 分鐘才就緒；滾動 1／0 每次只換一個，4 個要換幾輪？',
          '旗標開著時，2.4.0 承接的請求全部走備註的路徑，錯誤率 200‰；關掉之後只剩 2‰。',
          '在逐分鐘的表格裡看每分鐘 2.4.0 承接多少請求、出了幾個錯誤，再加上 2.3.0 本身的 2‰。',
        ],
        explanation: '回滾一次換一個，每個 2.3.0 要 2 分鐘就緒，第 2、4、6、8 分鐘各移除一個 2.4.0，第 8 分鐘完成。這段期間 2.4.0 承接的請求依序是每分鐘 1,000、750、500、250 個，各兩分鐘，200‰ 共 1,000 個錯誤，加上 2.3.0 的 14 個，合計 1,014 個。先關旗標時只有第 0 分鐘的 200 個是備註造成的，之後 2.4.0 只有 2‰，2.4.0 共 208 個、合計 222 個，少了 792 個。回滾照樣在第 8 分鐘完成，但已經不急了。',
        mistakes: [
          { answer: { rollback: '1000', flag: '208', done: '8' }, why: '只算了 2.4.0 的錯誤；2.3.0 承接的請求本身也有 2‰ 的錯誤' },
          { answer: { rollback: '1014', flag: '14', done: '8' }, why: '旗標在第 1 分鐘才生效，第 0 分鐘的請求仍然走備註的路徑' },
          { answer: { rollback: '1014', flag: '222', done: '2' }, why: '第 2 分鐘只有第一個 2.3.0 就緒；一次換一個，要到第 8 分鐘才換完' },
          { answer: { rollback: '1600', flag: '222', done: '8' }, why: '以為 2.4.0 一直承接全部的流量；每個 2.3.0 就緒後會分走一份' },
        ],
      },
      {
        id: 'cicd13-x-db', kind: 'table', title: '資料庫讓回滾失敗的兩種方式',
        statement: '同樣以滾動更新（1／0）回滾，比較三個情境：回滾時執行反向遷移刪除 notes，2.4.0 有幾個錯誤請求？破壞性的改名之後回滾，2.3.0 有幾個錯誤請求？只做了擴充的改名之後回滾，2.3.0 有幾個？',
        blanks: [
          { id: 'down', label: '刪除 notes：2.4.0 的錯誤', query: { task: 'rollout', rollout: 'cicd13-d-db-down', metric: 'errors-from' } },
          { id: 'destructive', label: '破壞性的改名：2.3.0 的錯誤', query: { task: 'rollout', rollout: 'cicd13-d-destructive', metric: 'errors-to' } },
          { id: 'expanded', label: '只做了擴充：2.3.0 的錯誤', query: { task: 'rollout', rollout: 'cicd13-d-expanded', metric: 'errors-to' } },
        ],
        hints: [
          '版本需要的欄位不存在時，它承接的請求全部失敗（1000‰）。',
          '刪除 notes 之後，2.4.0 每分鐘承接多少請求？一直到最後一個 2.4.0 被移除。',
          '破壞性的改名：2.3.0 從第一個就緒起承接請求，回滾完成後承接全部，一直到時間軸結束（第 11 分鐘）。',
        ],
        explanation: '刪除 notes 之後，2.4.0 承接的每個請求都失敗：每分鐘 1,000、750、500、250 個各兩分鐘，共 5,000 個，是旗標開著時的五倍，回滾變得更糟。破壞性的改名之後，2.3.0 需要的 phone 已經不存在：它從第 2 分鐘起承接 250、500、750 個各兩分鐘，第 8 分鐘起承接全部 1,000 個直到第 11 分鐘，共 7,000 個請求全部失敗，回滾越完成越糟。只做了擴充時兩個欄位都在，2.3.0 只有它本身 2‰ 的 14 個。',
        mistakes: [
          { answer: { down: '1000', destructive: '7000', expanded: '14' }, why: '以為刪除 notes 和旗標開著一樣只有 200‰；版本需要的欄位不存在時，請求全部失敗' },
          { answer: { down: '5000', destructive: '0', expanded: '14' }, why: '以為回滾到舊版本一定安全；2.3.0 需要的 phone 已經被刪掉了' },
          { answer: { down: '5000', destructive: '3000', expanded: '14' }, why: '只算到回滾完成為止；完成之後 2.3.0 承接全部流量，仍然每個請求都失敗' },
          { answer: { down: '5000', destructive: '7000', expanded: '7000' }, why: '只做擴充時 phone 還在，2.3.0 照常運作，只有它本身 2‰ 的錯誤' },
        ],
      },
      {
        id: 'cicd13-x-fast', kind: 'rollout-plan', title: '要快、又不丟請求的回滾',
        statement: '回滾也是一次部署，策略決定它多快完成。替「回滾：把 2.3.0 部署回去」重新設定滾動更新的 `maxSurge` 與 `maxUnavailable`：不能丟棄任何請求，並在第 2 分鐘以前完成。',
        plan: { rollout: 'cicd13-d-rollback', strategy: 'rolling', constraints: { maxDropped: 0, completeBy: 2 }, reference: { kind: 'rolling', maxSurge: 4, maxUnavailable: 0 } },
        hints: [
          '2.3.0 要 2 分鐘才就緒；第 2 分鐘完成，表示全部的 2.3.0 都要在第 0 分鐘一起啟動。',
          '4 個 2.4.0 的容量 1,200 只比流量 1,000 多 200：少一個可用的就會丟請求。',
          '多開的執行個體不受「不能丟請求」限制，只受資源限制。',
        ],
        explanation: '`maxSurge` 4、`maxUnavailable` 0：第 0 分鐘同時啟動 4 個 2.3.0，舊的 4 個繼續服務，第 2 分鐘新的全部就緒，舊的一起移除，回滾完成，一個請求都沒有丟（寫成 `100%`／`0%` 也一樣）。代價是這兩分鐘要 8 個執行個體。回滾越慢，壞掉的版本服務越久；能不能在事故時立刻多開一倍的機器，也是回滾計畫要事先確認的事。',
        mistakes: [
          { answer: { maxSurge: '1', maxUnavailable: '0' }, why: '一次只換一個，要到第 8 分鐘才完成' },
          { answer: { maxSurge: '0', maxUnavailable: '4' }, why: '等於重建：舊的全部先移除，新的就緒前兩分鐘的請求全部被丟棄' },
          { answer: { maxSurge: '2', maxUnavailable: '0' }, why: '分兩輪換，第 4 分鐘才完成' },
          { answer: { maxSurge: '4', maxUnavailable: '1' }, why: '第 0 分鐘先移除一個 2.4.0，剩下 3 個的容量 900 不夠，丟棄請求' },
        ],
      },
    ],
  },
};
