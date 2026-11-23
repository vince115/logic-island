import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { Dashboard } from '@/lib/devops/dashboard';
import type { SeverityMatrix } from '@/lib/devops/incident';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * CICD14 事故應變與事後檢討 (the blueprint's case-study-board, terminal-sim on the deploy-hosts profile with the
 * devops-explorer: engine stage E31 deploy hosts, on E25–E30, and D3 dashboards with the incident timeline). Built like
 * LNX01, SRV13, DKR12 and CICD08 as a case: INC-1124 of a made-up community bike-share, Maple Bikes. On 2026-11-24 at
 * 14:02 (UTC+8) the release of dock-api 2.5.0 lowered the lock controller timeout from 800 ms to 80 ms (Priya Raman's
 * reviewed config change, baked into the image); /healthz does not touch the lock controller, so the smoke test passed,
 * and about 62 % of unlock requests failed until the rollback to 2.4.1's digest at 14:41 (impact ended 14:43).
 * The devops part holds the monitoring of that afternoon (minute 0 = 13:30 UTC+8, generated series, the alert rule
 * that paged, the incident with the team's recorded events and usersPercent) and an October incident (stale station
 * map, found by a customer report), both with the lesson's severity matrix; the explorer computes every time and level.
 * The terminal is the team's incident drill (game day) on a practice copy whose clock is set back to 11-24 14:00:
 * ~/drill/start.sh re-runs the 14:00 release (gh workflow run deploy.yml with the 2.5.0 tag); the learner, Kuo Yen (gh
 * login yen-kuo, on call), investigates prod-01 over ssh (docker ps, docker logs in key=value lines, docker images
 * --digests, the deployment records with gh api), rolls back through Deploy to 2.4.1 by digest, posts an update on the
 * status page (status-01 serves /var/www/status/current.txt over HTTP; the ops account may write it) and writes the
 * incident record into maple/dock-api. The registry also has 2.5.1, Priya's untested fix-forward (timeout 200 ms, still
 * failing), and latest, which points at 2.5.0. Organisation, people, hosts and every token are made up; every transcript
 * output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const DOCK = 'https://github.example/maple/dock-api.git';
const REG = 'cr.maple.example';
const IMAGE = `${REG}/maple/dock-api`;
const PULL_TOKEN = 'lesson-registry-token-deploy-1401';
const CI_TOKEN = 'lesson-registry-token-ci-1402';
/** The repository digest of dock-api 2.4.1 (the last good version), as the engine computes it. */
const GOOD = 'sha256:b147e7a96b78a9a7a367f3ee1d09d654a1900cd41bd736df07940d612755f382';
const YEN = { name: 'Kuo Yen', email: 'yen@maple.example' }, PRIYA = { name: 'Priya Raman', email: 'priya@maple.example' }, TOMAS = { name: 'Tomás Ortega', email: 'tomas@maple.example' };
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** Commands appending this text to the file with quoted here-documents, in pieces of whole lines (one input is at most 500 characters). */
function appendDoc(path: string, text: string): string[] {
  const out: string[] = [];
  let piece = '';
  const flush = () => { if (piece) out.push(`cat >> ${path} <<'EOF'\n${piece}EOF`); piece = ''; };
  for (const line of text.split('\n').slice(0, -1)) { if (piece.length + line.length + 1 > 300) flush(); piece += `${line}\n`; }
  flush();
  return out;
}
/** The same, replacing the file first. */
const writeDoc = (path: string, text: string) => appendDoc(path, text).map((c, i) => i ? c : c.replace('cat >>', 'cat >'));

const LEARNER_KEY = keyPair('cicd14:learner', 'yen@yen-laptop');
const CI_KEY = keyPair('cicd14:prod-deploy', 'deploy@ci-production');
const hostLine = (host: string) => `${host} ${hostKey(`cicd14-${host}`, host).publicLine.split(' ').slice(0, 2).join(' ')}`;
const KNOWN_HOSTS = `# lesson known_hosts for the Maple Bikes hosts\n${hostLine('prod-01')}\n${hostLine('status-01')}`;

// ---- The repository: the Deploy workflow, the runbook, the incident template and the October incident record.
const DEPLOY_YML = wf('name: Deploy', 'on:', '  workflow_dispatch:', '    inputs:', '      image:', '        description: Image to deploy (name:tag or name@sha256:digest)', '        required: true',
  'permissions:', '  contents: read', 'concurrency: production', 'jobs:', '  production:', '    runs-on: ubuntu-latest', '    environment: production', '    steps:',
  '      - name: SSH key', '        env:', '          KEY: ${{ secrets.DEPLOY_KEY }}', '          HOSTS: ${{ secrets.KNOWN_HOSTS }}', '        run: |', '          mkdir -p ~/.ssh',
  '          printf \'%s\\n\' "$KEY" > ~/.ssh/id_ed25519', '          chmod 600 ~/.ssh/id_ed25519', '          printf \'%s\\n\' "$HOSTS" > ~/.ssh/known_hosts',
  '      - name: Log in to the registry', '        env:', '          TOKEN: ${{ secrets.REGISTRY_PULL_TOKEN }}', `        run: echo "$TOKEN" | ssh deploy@prod-01 docker login ${REG} -u deploy --password-stdin`,
  '      - name: Deploy', '        env:', '          IMAGE: ${{ inputs.image }}', '        run: |', '          ssh deploy@prod-01 docker pull -q "$IMAGE"',
  "          ssh deploy@prod-01 'docker rm -f web 2>/dev/null || true'", '          ssh deploy@prod-01 docker run -d --name web -p 8000:8000 "$IMAGE"',
  '      - name: Smoke test', '        run: curl -fsS http://prod-01:8000/healthz');
const RUNBOOK = '# dock-api 處理手冊\n\n- 服務：prod-01 的容器 web（8000 埠），由 Deploy workflow 部署\n- 檢查開鎖：curl -s http://prod-01:8000/v1/docks/D-114\n- 狀態頁：status-01 的 /var/www/status/current.txt（ops 帳號）\n- 發布後出錯：先回滾，以 Deploy 部署上一版的 digest\n';
const TEMPLATE = '# 事故紀錄：<標題>\n\n## 摘要\n\n## 影響\n\n## 時間線（UTC+8）\n\n## 促成因素\n\n## 行動項目\n\n| 行動 | 負責人 | 期限 |\n|---|---|---|\n';
const OCTOBER = [
  '# 事故紀錄：站點地圖的可借車數過時（INC-1008）', '', '## 摘要',
  '10-08 09:15–10:50（UTC+8），北區 6 個站點在 App 地圖上的可借車數停在 09:15。嚴重等級 SEV3。', '', '## 影響',
  '約 4% 的使用者（北區站點）看到過時的車數，到站才發現沒有車；開鎖與還車正常。', '', '## 時間線（UTC+8）',
  '- 09:15 北區的站點狀態同步工作停止更新（事後由工作的日誌確認）', '- 09:55 客服轉來三則使用者回報', '- 09:58 值班的 Tomás 確認接手',
  '- 10:10 發現同步工作卡在一個沒有逾時的連線上', '- 10:44 重新啟動同步工作並清除地圖快取', '- 10:50 北區站點的車數與現場一致', '- 10:55 結案', '',
  '## 促成因素', '- 同步工作卡住時不會結束，也沒有同步失敗的告警，所以是使用者先發現。', '- 地圖沒有顯示車數的更新時間，使用者分辨不出資料是不是最新的。', '',
  '## 行動項目', '| 行動 | 負責人 | 期限 |', '|---|---|---|', '| 新增「同步失敗率持續 5 分鐘偏高」的告警 | Tomás Ortega | 2026-10-20（已完成） |',
  '| 同步工作的連線加上逾時，失敗時結束 | Priya Raman | 2026-10-24（已完成） |', '| 地圖顯示車數的更新時間 | Hana Sato | 2026-11-07（已完成） |', '',
].join('\n');
const appJson = (ms: number) => `{\n  "port": 8000,\n  "lock": { "timeout_ms": ${ms} }\n}\n`;
const COMMITS: TerminalGitCommit[] = [
  { id: 'm1', message: 'Initial commit', author: TOMAS, time: '2026-08-03 02:00:00', files: { 'README.md': '# dock-api\n\nDock status and unlocking for Maple Bikes.\n', 'config/app.json': appJson(800) } },
  { id: 'm2', message: 'Deploy to prod-01 with workflow_dispatch', author: TOMAS, time: '2026-09-15 03:00:00', files: { '.github/workflows/deploy.yml': DEPLOY_YML, 'docs/runbook.md': RUNBOOK } },
  { id: 'm3', message: 'Record INC-1008 and add the incident template', author: TOMAS, time: '2026-10-12 03:00:00', files: { 'docs/incidents/TEMPLATE.md': TEMPLATE, 'docs/incidents/2026-10-08-map-stale.md': OCTOBER } },
  { id: 'm4', message: 'Lower the lock timeout to 80 ms', author: PRIYA, time: '2026-11-23 07:00:00', files: { 'config/app.json': appJson(80) } },
];

// ---- Images and responders: 2.4.1 is good; 2.5.0 (also latest) and 2.5.1 time out on the lock controller.
const dockImage = (tag: string, responder: string, created: string, logs: string[]): TerminalImage => ({
  name: `${IMAGE}:${tag}`, size: 188_000_000, created, workdir: '/app', cmd: ['node', 'src/server.js'], expose: [8000], service: true,
  http: { port: 8000, responder }, logs,
});
const GOOD_LOGS = ['level=info msg="dock-api 2.4.1 listening on :8000" lock_timeout_ms=800'];
const badLogs = (version: string, ms: number, docks: string[]) => [`level=info msg="dock-api ${version} listening on :8000" lock_timeout_ms=${ms}`,
  ...docks.flatMap((d, i) => [`level=error msg="unlock failed" dock=${d} status=503 err="lock controller timeout after ${ms}ms"`, ...i === 0 ? ['level=info msg="unlock ok" dock=D-031 status=200 ms=61'] : []]),
  `level=error msg="unlock failed" dock=${docks[0]} status=503 err="lock controller timeout after ${ms}ms"`];
const docker = (docks: string[]): TerminalDocker => ({
  images: [
    dockImage('2.4.1', 'dock-241', '2026-11-10 06:00:00', GOOD_LOGS),
    { ...dockImage('2.5.0', 'dock-250', '2026-11-23 08:00:00', badLogs('2.5.0', 80, docks)), tags: ['latest'] },
    dockImage('2.5.1', 'dock-251', '2026-11-24 06:00:00', badLogs('2.5.1', 200, docks.slice(0, 1))),
  ],
  registries: [{ host: REG, users: [{ name: 'ci-bot', token: CI_TOKEN, repos: ['maple/*'] }, { name: 'deploy', token: PULL_TOKEN, push: false, repos: ['maple/*'] }] }],
});
const dockResponder = (id: string, version: string, ms?: number) => ({ id, server: 'node', routes: [
  { path: '/', type: 'application/json', body: `{"service":"dock-api","version":"${version}"}\n` },
  { path: '/healthz', body: 'ok\n' },
  ms === undefined ? { path: '/v1/docks/*', type: 'application/json', body: '{"dock":"D-114","bikes":4,"lock":"ok"}\n' }
    : { path: '/v1/docks/*', status: 503, type: 'application/json', body: `{"error":"lock controller timeout after ${ms}ms"}\n` },
] });

// ---- Hosts and the drill machine.
const prod: TerminalRemote = {
  host: 'prod-01', address: '10.30.0.21', hostKey: 'cicd14-prod-01', runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [dir('/home', 'root'), dir('/home/deploy', 'deploy', 0o750), dir('/home/deploy/.ssh', 'deploy', 0o700),
    file('/home/deploy/.ssh/authorized_keys', `${CI_KEY.publicLine}\n${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600)],
  docker: {
    images: [{ ...dockImage('2.4.1', 'dock-241', '2026-11-10 06:00:00', GOOD_LOGS), pulled: true }],
    containers: [{ name: 'web', image: `${IMAGE}:2.4.1`, state: 'running', created: '2026-11-11 06:10:00', started: '2026-11-11 06:10:00', ports: ['8000:8000'] }],
  },
};
const statusHost: TerminalRemote = {
  host: 'status-01', address: '10.30.0.40', hostKey: 'cicd14-status-01',
  accounts: { users: [{ name: 'ops', uid: 1002 }] },
  files: [dir('/home', 'root'), dir('/home/ops', 'ops', 0o750), dir('/home/ops/.ssh', 'ops', 0o700), file('/home/ops/.ssh/authorized_keys', `${LEARNER_KEY.publicLine}\n`, 'ops', 0o600),
    dir('/var', 'root'), dir('/var/www', 'root'), dir('/var/www/status', 'ops'), file('/var/www/status/current.txt', 'Maple Bikes 服務狀態：所有服務正常運作。\n', 'ops')],
  processes: [{ pid: 640, user: 'www-data', command: 'statusd --root /var/www/status', listen: [{ port: 80, http: 'status-page' }] }],
  responders: [{ id: 'status-page', server: 'statusd/1.2', routes: [{ path: '/*', root: '/var/www/status', type: 'text/plain; charset=utf-8' }] }],
};
const DRILL_README = [
  '# 事故演練：INC-1124 開鎖失敗', '', '這是 production 的演練複本，時鐘撥回 2026-11-24 14:00（UTC+8）。', '',
  '1. bash ~/drill/start.sh 重現 14:00 的發布（Deploy 部署 dock-api 2.5.0）。', '2. 你是第一個到場的值班工程師：查證、止血、更新狀態頁。', '',
  '- prod-01：deploy 帳號，容器 web（8000 埠）', '- status-01：ops 帳號，狀態頁 /var/www/status/current.txt（http://status-01/current.txt）',
  '- 使用者的開鎖請求：http://prod-01:8000/v1/docks/D-114', '',
].join('\n');
const START_SH = ['#!/bin/bash', '# 重現 2026-11-24 14:00 的發布：Deploy 以標籤 2.5.0 部署到 prod-01。', 'set -eu', 'cd ~/dock-api',
  `gh workflow run deploy.yml -f image=${IMAGE}:2.5.0 > /dev/null`, 'id=$(gh run list -w deploy.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)',
  'gh run watch "$id" > /dev/null', 'echo "演練開始：14:00 的發布已完成（run $id），production 現在跑 2.5.0。"', ''].join('\n');

const drillMachine = (docks: string[]): TerminalMachine => ({
  id: 'cicd14-drill', title: 'yen-laptop（INC-1124 的事故演練）', user: 'learner', cwd: '/home/learner', host: 'yen-laptop', profile: 'deploy-hosts',
  timezone: 'Asia/Taipei', now: '2026-11-24 06:00:00',
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  files: [dir('/home', 'root'), dir('/home/learner'), dir('/home/learner/.ssh', 'learner', 0o700), file('/home/learner/.ssh/id_ed25519', LEARNER_KEY.privateText, 'learner', 0o600),
    file('/home/learner/.ssh/known_hosts', `${KNOWN_HOSTS}\n`), dir('/home/learner/drill'), file('/home/learner/drill/README.md', DRILL_README),
    file('/home/learner/drill/start.sh', START_SH, 'learner', 0o755)],
  git: { user: YEN, commits: COMMITS, remotes: [{ url: DOCK, branches: { main: 'm4' } }], repos: [{ path: '/home/learner/dock-api', origin: DOCK }] },
  forge: {
    login: 'yen-kuo', name: 'Kuo Yen', repos: [{
      url: DOCK, description: 'Dock status and unlocking for Maple Bikes', permission: 'admin',
      environments: ['production'], environmentRules: [{ name: 'production', branches: ['main'] }],
      secrets: [
        { name: 'REGISTRY_PULL_TOKEN', value: PULL_TOKEN, updated: '2026-09-15 03:00:00' }, { name: 'KNOWN_HOSTS', value: KNOWN_HOSTS, updated: '2026-09-15 03:00:00' },
        { name: 'DEPLOY_KEY', sshKey: { seed: 'cicd14:prod-deploy', comment: 'deploy@ci-production' }, env: 'production', updated: '2026-09-15 03:00:00' },
      ],
    }],
  },
  actions: {},
  responders: [dockResponder('dock-241', '2.4.1'), dockResponder('dock-250', '2.5.0', 80), dockResponder('dock-251', '2.5.1', 200)],
  docker: docker(['D-114', 'D-207', 'D-388']),
  remotes: [prod, statusHost],
});
const drill = drillMachine(['D-114', 'D-207', 'D-388']);

const EXAMPLES: TerminalExample[] = [
  {
    id: 'cicd14-release', title: '重現 14:00 的發布：冒煙測試通過，使用者卻開不了鎖', machine: 'cicd14-drill',
    description: '先讀演練說明，確認 prod-01 目前跑 2.4.1、開鎖正常；執行 drill/start.sh 重現當天的發布，Deploy 的 run 成功、/healthz 回 ok，但真正的開鎖請求回 503。',
    steps: [
      { command: "cat drill/README.md", output: "# 事故演練：INC-1124 開鎖失敗\n\n這是 production 的演練複本，時鐘撥回 2026-11-24 14:00（UTC+8）。\n\n1. bash ~/drill/start.sh 重現 14:00 的發布（Deploy 部署 dock-api 2.5.0）。\n2. 你是第一個到場的值班工程師：查證、止血、更新狀態頁。\n\n- prod-01：deploy 帳號，容器 web（8000 埠）\n- status-01：ops 帳號，狀態頁 /var/www/status/current.txt（http://status-01/current.txt）\n- 使用者的開鎖請求：http://prod-01:8000/v1/docks/D-114" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"dock-api\",\"version\":\"2.4.1\"}" },
      { command: "curl -s http://prod-01:8000/v1/docks/D-114", output: "{\"dock\":\"D-114\",\"bikes\":4,\"lock\":\"ok\"}" },
      { command: "bash drill/start.sh", output: "演練開始：14:00 的發布已完成（run 4100000001），production 現在跑 2.5.0。" },
      { command: "cd dock-api", output: "" },
      { command: "gh run view 4100000001", output: "✓ main Deploy · 4100000001\nTriggered via workflow_dispatch less than a minute ago\n\nJOBS\n✓ production in 1s (ID 11300000001)\n\nFor more information about a job, try: gh run view --job=<job-id>\nView this run on GitHub: https://github.example/maple/dock-api/actions/runs/4100000001" },
      { command: "curl -s http://prod-01:8000/", output: "{\"service\":\"dock-api\",\"version\":\"2.5.0\"}" },
      { command: "curl -s http://prod-01:8000/healthz", output: "ok" },
      { command: "curl -si http://prod-01:8000/v1/docks/D-114", output: "HTTP/1.1 503 Service Unavailable\nServer: node\nDate: Tue, 24 Nov 2026 06:00:03 GMT\nContent-Type: application/json\nContent-Length: 47\nConnection: keep-alive\n\n{\"error\":\"lock controller timeout after 80ms\"}" },
    ],
  },
  {
    id: 'cicd14-investigate', title: '查證：容器、日誌、部署紀錄與變更', machine: 'cicd14-drill',
    description: '在 prod-01 上看正在跑的容器與它的日誌，從部署紀錄找出這次部署的 commit 與上線的時間，再看那個 commit 改了什麼，最後列出主機上 Image 的 digest。',
    steps: [
      { command: "bash drill/start.sh", output: "演練開始：14:00 的發布已完成（run 4100000001），production 現在跑 2.5.0。" },
      { command: "ssh deploy@prod-01 docker ps", output: "CONTAINER ID   IMAGE                                   COMMAND                CREATED                  STATUS                  PORTS                                       NAMES\n944ab26ed72d   cr.maple.example/maple/dock-api:2.5.0   \"node src/server.js\"   Less than a second ago   Up Less than a second   0.0.0.0:8000->8000/tcp, :::8000->8000/tcp   web" },
      { command: "ssh deploy@prod-01 docker logs web | head -n 4", output: "level=info msg=\"dock-api 2.5.0 listening on :8000\" lock_timeout_ms=80\nlevel=error msg=\"unlock failed\" dock=D-114 status=503 err=\"lock controller timeout after 80ms\"\nlevel=info msg=\"unlock ok\" dock=D-031 status=200 ms=61\nlevel=error msg=\"unlock failed\" dock=D-207 status=503 err=\"lock controller timeout after 80ms\"" },
      { command: "cd dock-api", output: "" },
      { command: "gh api 'repos/{owner}/{repo}/deployments?environment=production' | grep -E '\"(id|sha|created_at)\"'", output: "    \"id\": 1900000001,\n    \"sha\": \"3196b0dc415ab1d0558b7ca0b28ecb20785d61f2\",\n      \"id\": 41898282,\n    \"created_at\": \"2026-11-24T06:00:00Z\"," },
      { command: "gh api repos/{owner}/{repo}/deployments/1900000001/statuses | grep -E '\"(state|created_at)\"'", output: "    \"state\": \"success\",\n    \"created_at\": \"2026-11-24T06:00:03Z\",\n    \"state\": \"in_progress\",\n    \"created_at\": \"2026-11-24T06:00:02Z\"," },
      { command: "git log --oneline -3", output: "3196b0d (HEAD -> main, origin/main, origin/HEAD) Lower the lock timeout to 80 ms\ncd10610 Record INC-1008 and add the incident template\n1f7cfa5 Deploy to prod-01 with workflow_dispatch" },
      { command: "git show HEAD", output: "commit 3196b0dc415ab1d0558b7ca0b28ecb20785d61f2 (HEAD -> main, origin/main, origin/HEAD)\nAuthor: Priya Raman <priya@maple.example>\nDate:   Mon Nov 23 15:00:00 2026 +0800\n\n    Lower the lock timeout to 80 ms\n\ndiff --git a/config/app.json b/config/app.json\nindex 49198d9..a671364 100644\n--- a/config/app.json\n+++ b/config/app.json\n@@ -1,4 +1,4 @@\n {\n   \"port\": 8000,\n-  \"lock\": { \"timeout_ms\": 800 }\n+  \"lock\": { \"timeout_ms\": 80 }\n }" },
      { command: "ssh deploy@prod-01 docker images --digests", output: "REPOSITORY                        TAG       DIGEST                                                                    IMAGE ID       CREATED        SIZE\ncr.maple.example/maple/dock-api   2.5.0     sha256:2415db7252f9c1aa48d2173d083f8c00a3ed4d332de98f91ba2d62c4634a7b80   60b9ae74da80   22 hours ago   188MB\ncr.maple.example/maple/dock-api   2.4.1     sha256:b147e7a96b78a9a7a367f3ee1d09d654a1900cd41bd736df07940d612755f382   94a15b5008bd   2 weeks ago    188MB" },
    ],
  },
  {
    id: 'cicd14-restart', title: '重新啟動不是止血', machine: 'cicd14-drill',
    description: '重現發布之後重新啟動 web 容器：容器重新跑起來，但開鎖照樣逾時，日誌裡同樣的設定值又印了一次；最後看處理手冊怎麼說。',
    steps: [
      { command: "bash drill/start.sh", output: "演練開始：14:00 的發布已完成（run 4100000001），production 現在跑 2.5.0。" },
      { command: "ssh deploy@prod-01 docker restart web", output: "web" },
      { command: "curl -s http://prod-01:8000/v1/docks/D-114", output: "{\"error\":\"lock controller timeout after 80ms\"}" },
      { command: "ssh deploy@prod-01 docker logs web | grep 'listening'", output: "level=info msg=\"dock-api 2.5.0 listening on :8000\" lock_timeout_ms=80\nlevel=info msg=\"dock-api 2.5.0 listening on :8000\" lock_timeout_ms=80" },
      { command: "cat dock-api/docs/runbook.md", output: "# dock-api 處理手冊\n\n- 服務：prod-01 的容器 web（8000 埠），由 Deploy workflow 部署\n- 檢查開鎖：curl -s http://prod-01:8000/v1/docks/D-114\n- 狀態頁：status-01 的 /var/www/status/current.txt（ops 帳號）\n- 發布後出錯：先回滾，以 Deploy 部署上一版的 digest" },
    ],
  },
  {
    id: 'cicd14-status', title: '在狀態頁發出第一則更新', machine: 'cicd14-drill',
    description: '看狀態頁目前的內容，寫一則調查中的更新（影響、正在做的事、下次更新的時間），以 scp 放到 status-01，再從網址確認使用者看到的文字。',
    steps: [
      { command: "curl -s http://status-01/current.txt", output: "Maple Bikes 服務狀態：所有服務正常運作。" },
      { command: "cat > update.txt <<'EOF'\n【調查中】11-24 14:20（UTC+8）\n影響：部分站點無法以 App 開鎖借車；還車與付款正常。\n處理：問題在 14:00 的版本更新之後出現，我們正在回復到前一版。\n下次更新：14:50 前。\nEOF", output: "" },
      { command: "scp -q update.txt ops@status-01:/var/www/status/current.txt", output: "" },
      { command: "curl -s http://status-01/current.txt", output: "【調查中】11-24 14:20（UTC+8）\n影響：部分站點無法以 App 開鎖借車；還車與付款正常。\n處理：問題在 14:00 的版本更新之後出現，我們正在回復到前一版。\n下次更新：14:50 前。" },
    ],
  },
  {
    id: 'cicd14-postmortem', title: '事故紀錄的範本與上一份紀錄', machine: 'cicd14-drill',
    description: '在儲存庫裡看事故紀錄放在哪裡、範本有哪些段落，以及十月那次事故的促成因素與行動項目怎麼寫。',
    steps: [
      { command: "cd dock-api", output: "" },
      { command: "ls docs/incidents", output: "2026-10-08-map-stale.md  TEMPLATE.md" },
      { command: "cat docs/incidents/TEMPLATE.md", output: "# 事故紀錄：<標題>\n\n## 摘要\n\n## 影響\n\n## 時間線（UTC+8）\n\n## 促成因素\n\n## 行動項目\n\n| 行動 | 負責人 | 期限 |\n|---|---|---|" },
      { command: "sed -n '/## 促成因素/,$p' docs/incidents/2026-10-08-map-stale.md", output: "## 促成因素\n- 同步工作卡住時不會結束，也沒有同步失敗的告警，所以是使用者先發現。\n- 地圖沒有顯示車數的更新時間，使用者分辨不出資料是不是最新的。\n\n## 行動項目\n| 行動 | 負責人 | 期限 |\n|---|---|---|\n| 新增「同步失敗率持續 5 分鐘偏高」的告警 | Tomás Ortega | 2026-10-20（已完成） |\n| 同步工作的連線加上逾時，失敗時結束 | Priya Raman | 2026-10-24（已完成） |\n| 地圖顯示車數的更新時間 | Hana Sato | 2026-11-07（已完成） |" },
    ],
  },
];

// ---- Exercises (each starts from the drill machine as declared).
const START = 'bash drill/start.sh';
const LATEST = '$(gh run list -w deploy.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9)';
const WATCH = `gh run watch ${LATEST} > /dev/null`;
const ROLLBACK = (image: string) => ['cd dock-api', `gh workflow run deploy.yml -f image=${image}`, WATCH];
const UPDATE = '【已止血，觀察中】11-24 14:45（UTC+8）\n影響：14:02–14:43 部分站點無法以 App 開鎖借車；還車與付款正常。\n處理：已回復到前一版，開鎖恢復正常，我們持續觀察。\n下次更新：15:45 前。\n';
const POST = [`cat > ~/update.txt <<'EOF'\n${UPDATE}EOF`, 'scp -q ~/update.txt ops@status-01:/var/www/status/current.txt'];
const DOCKS_CMD = "ssh deploy@prod-01 docker logs web | grep 'status=503' | grep -o 'dock=D-[0-9]*' | sort -u";
const NOTES_PATH = 'docs/incidents/2026-11-24-unlock-timeout.md';
const NOTES = [
  '# 事故紀錄：2.5.0 發布後部分站點無法開鎖（INC-1124）', '', '## 摘要',
  '11-24 14:02–14:43（UTC+8），dock-api 2.5.0 把鎖控制器的逾時從 800 ms 改為 80 ms，約 62% 的開鎖請求失敗。嚴重等級 SEV1。', '', '## 影響',
  '約 62% 的使用者在 41 分鐘內無法以 App 開鎖借車；還車與付款正常。', '', '## 時間線（UTC+8）',
  '- 14:02 Deploy 部署 2.5.0，冒煙測試通過', '- 14:05 開鎖失敗率告警觸發，呼叫值班', '- 14:15 值班確認接手', '- 14:18 宣告 SEV1，指定事故指揮與溝通負責人',
  '- 14:20 第一則狀態更新', '- 14:33 重新啟動容器，錯誤沒有減少', `- 14:41 以 Deploy 回滾到 2.4.1（${GOOD.slice(0, 19)}…）`, '- 14:43 開鎖失敗率回到平常的水準', '- 15:40 結案', '',
  '## 促成因素', '- lock.timeout_ms 沒有範圍檢查，80 ms 比鎖控制器平常的回應時間還短', '- staging 的鎖控制器是模擬器，回應太快，測不出逾時', '- /healthz 不經過鎖控制器，冒煙測試照樣通過', '',
  '## 行動項目', '| 行動 | 負責人 | 期限 |', '|---|---|---|', '| 載入設定時檢查 lock.timeout_ms 的範圍 | Priya Raman | 2026-12-04 |',
  '| 冒煙測試加上一次經過鎖控制器的檢查 | Kuo Yen | 2026-12-04 |', '| 處理手冊寫明發布後出錯先回滾 | Tomás Ortega | 2026-11-30 |', '',
].join('\n');
const SHIP_NOTES = ['git add docs/incidents', "git commit -qm 'Record INC-1124'", 'git push -q'];
const notesCheck = (includes: string) => ({ kind: 'branch' as const, repo: DOCK, name: 'main', file: { path: NOTES_PATH, includes } });

const EXERCISES: TerminalExercise[] = [
  {
    id: 'cicd14-ex-mitigate', title: '演練：止血、驗證、更新狀態頁', machine: 'cicd14-drill',
    statement: `先執行 \`bash drill/start.sh\` 重現 14:00 的發布：production 換成 2.5.0，部分站點開始無法開鎖。你是第一個到場的值班工程師，在事故指揮接手前要完成三件事。一、止血：經由 Deploy workflow（不要直接 ssh 換容器）把 prod-01 回滾到上一個正常的版本 2.4.1，並以 digest 指定 Image（\`${IMAGE}@sha256:…\`），digest 要從 prod-01 上查出來。二、驗證：\`http://prod-01:8000/v1/docks/D-114\` 要回 200。三、溝通：把一則狀態更新寫進 status-01 的 \`/var/www/status/current.txt\`（帳號 ops，網址 \`http://status-01/current.txt\`），內容寫出受影響的功能、你們做了什麼，並以「下次更新：」寫出下一則更新的時間。`,
    checks: [
      { kind: 'container', host: 'prod-01', name: 'web', state: 'running', image: `${IMAGE}@${GOOD}` },
      { kind: 'http', url: 'http://prod-01:8000/v1/docks/D-114', status: 200 },
      { kind: 'run', repo: DOCK, workflow: 'deploy.yml', conclusion: 'success', logIncludes: `dock-api@${GOOD}` },
      { kind: 'deployment', repo: DOCK, environment: 'production', status: 'success', latest: true },
      { kind: 'http', url: 'http://status-01/current.txt', status: 200, body: '下次更新' },
    ],
    solution: [START, 'ssh deploy@prod-01 docker images --digests', ...ROLLBACK(`${IMAGE}@${GOOD}`), 'curl -s http://prod-01:8000/v1/docks/D-114', ...POST, 'curl -s http://status-01/current.txt'],
    mistakes: [
      { commands: [START, 'ssh deploy@prod-01 docker restart web', ...POST],
        why: '重新啟動容器：跑的仍是 2.5.0，設定值還是 80 ms，開鎖照樣逾時；重新啟動只對暫時的狀態（卡住的連線、耗盡的資源）有用' },
      { commands: [START, ...ROLLBACK(`${IMAGE}:2.5.1`), ...POST],
        why: '在壓力下往前修：2.5.1 只把逾時改成 200 ms，沒有經過 staging，D-114 仍然逾時；未經測試的修正可能讓事故變得更糟' },
      { commands: [START, ...ROLLBACK(`${IMAGE}:latest`), ...POST],
        why: '以 latest 回滾：latest 指向的正是 2.5.0，部署了同一份有問題的 Image' },
      { commands: [START, `ssh deploy@prod-01 "docker rm -f web && docker run -d --name web -p 8000:8000 ${IMAGE}@${GOOD}"`, ...POST],
        why: '繞過管線直接 ssh 換容器：開鎖恢復了，但沒有經過 Deploy，部署紀錄仍說 production 是 2.5.0，下一個看紀錄的人會被誤導' },
      { commands: [START, ...ROLLBACK(`${IMAGE}:2.4.1`), ...POST],
        why: '以標籤 2.4.1 回滾：結果看起來一樣，但標籤可以被重新推送，日誌與紀錄裡也看不到部署的是哪一份內容；事故中要部署的是確定跑過的那個 digest' },
      { commands: [START, ...ROLLBACK(`${IMAGE}@${GOOD}`), 'curl -s http://prod-01:8000/v1/docks/D-114'],
        why: '止血了卻沒有更新狀態頁：使用者與客服仍看到「所有服務正常運作」，不知道問題已被處理，也不知道何時會有下一則消息' },
    ],
    hints: [
      '`ssh deploy@prod-01 docker images --digests` 列出主機上的 Image 與 digest；2.4.1 還留在主機上，它就是上一個正常跑過的版本',
      '`gh workflow run deploy.yml -f image=cr.maple.example/maple/dock-api@sha256:…`，接著 `gh run list -w deploy.yml -L 1` 找到編號，再用 `gh run watch 編號` 等它結束',
      '用 `cat > ~/update.txt <<\'EOF\'` 寫好更新，再 `scp ~/update.txt ops@status-01:/var/www/status/current.txt`；`curl -s http://status-01/current.txt` 確認',
      '不要在這時候部署 2.5.1 或 latest：先回到確定正常的版本，修正之後再照正常流程發布',
    ],
    explanation: `回滾到上一個正常的版本是發布造成事故時最快、最可預期的止血方式：2.4.1 在 production 跑了兩週，回去之後的行為是已知的。以 digest 指定（${GOOD.slice(0, 19)}…）確保部署的正是當時跑的那一份，經由 Deploy 則讓部署紀錄、日誌與冒煙測試都和平常一樣運作，事後的時間線也有可靠的證據。重新啟動只是用同樣的設定再跑一次；2.5.1 是沒有經過測試的修正，在事故中部署它等於再賭一次；latest 指向的就是 2.5.0。止血之後立刻更新狀態頁：寫出影響了什麼、做了什麼、下次什麼時候更新，即使問題已經解決，使用者也需要知道。`,
  },
  {
    id: 'cicd14-ex-docks', title: '狀態更新要寫的受影響站點', machine: 'cicd14-drill',
    statement: '先執行 `bash drill/start.sh` 重現發布。事故指揮要你提供受影響站點的清單，寫進下一則狀態更新。從 prod-01 上 web 容器的日誌，找出開鎖失敗（`status=503`）的請求涉及哪些站點：只印出 `dock=D-…` 那一段，每個站點一行、不重複、依字母順序（用 `grep -o \'dock=D-[0-9]*\'` 與 `sort -u`）。',
    checks: [{ kind: 'output', fromCommand: 'docker logs' }],
    solution: [START, DOCKS_CMD],
    mistakes: [
      { commands: [DOCKS_CMD], why: '沒有先重現發布：prod-01 還在跑 2.4.1，日誌裡沒有任何失敗的開鎖' },
      { commands: [START, "ssh deploy@prod-01 docker logs web | grep 'status=503' | grep -o 'dock=D-[0-9]*'"], why: '沒有去掉重複：同一個站點失敗了不只一次，清單裡出現兩次 D-114' },
      { commands: [START, "ssh deploy@prod-01 docker logs web | grep -o 'dock=D-[0-9]*' | sort -u"], why: '沒有只取失敗的請求：D-031 的開鎖成功了（status=200），不該列為受影響的站點' },
      { commands: [START, "printf 'dock=D-114\\ndock=D-207\\ndock=D-388\\n'"], why: '把例子裡看過的站點直接打出來：每次事故受影響的站點不同，清單必須來自這一次的日誌' },
    ],
    variants: [{ label: '受影響的站點不同', files: [], docker: docker(['D-052', 'D-114', 'D-430']) }],
    hints: [
      '`ssh deploy@prod-01 docker logs web` 在你的機器上印出容器的日誌，可以直接接 `|` 在本機處理',
      '先 `grep \'status=503\'` 留下失敗的請求，再用 `grep -o \'dock=D-[0-9]*\'` 只取出站點那一段',
      '`sort -u` 排序並去掉重複',
    ],
    explanation: '日誌是 key=value 的結構化格式，所以可以用欄位精確篩選：先只留下 status=503 的行，再取出 dock 欄位，最後排序去重。成功的 D-031 不在清單裡，重複失敗的 D-114 只列一次。狀態更新裡寫「哪些站點受影響」比「部分使用者」具體得多，客服也能據此回覆使用者；但這份清單只是日誌裡看得到的部分（日誌只記到演練當下），在更新裡要寫成「目前已知」，不要宣稱是完整的範圍。',
  },
  {
    id: 'cicd14-ex-record', title: '寫下事故紀錄：時間線與行動項目', machine: 'cicd14-drill',
    statement: `事故已經結束（真實的時間線在儀表板的事故時間線裡）。在 ~/dock-api 以 \`docs/incidents/TEMPLATE.md\` 為範本，寫出 \`${NOTES_PATH}\`：至少要有「## 影響」、「## 時間線」與「## 行動項目」三節，時間線要記下回滾到的版本（2.4.1），行動項目的每一列寫出負責人與期限，內容只寫系統與條件，不追究個人。提交並推送到 main。`,
    checks: [notesCheck('## 影響'), notesCheck('## 時間線'), notesCheck('## 行動項目'), notesCheck('2.4.1')],
    solution: ['cd dock-api', ...writeDoc(NOTES_PATH, NOTES), ...SHIP_NOTES],
    mistakes: [
      { commands: ['cd dock-api', ...writeDoc(NOTES_PATH, NOTES), 'git add docs/incidents', "git commit -qm 'Record INC-1124'"],
        why: '提交了但沒有推送：紀錄只在你的筆電上，團隊在 github.example 上看不到' },
      { commands: ['cd dock-api', `cp docs/incidents/TEMPLATE.md ${NOTES_PATH}`, ...SHIP_NOTES],
        why: '只複製了範本：標題都在，但時間線是空的，沒有記下回滾到哪個版本' },
      { commands: ['cd dock-api', ...writeDoc(NOTES_PATH, NOTES.slice(0, NOTES.indexOf('## 促成因素'))), ...SHIP_NOTES],
        why: '只寫到時間線就停了：沒有行動項目的事後檢討，下一次同樣的條件還會造成同樣的事故' },
      { commands: [...writeDoc('/home/learner/INC-1124.md', NOTES)],
        why: '寫在家目錄、沒有放進儲存庫：沒有提交也沒有推送，團隊找不到這份紀錄' },
    ],
    hints: [
      '`cat docs/incidents/TEMPLATE.md` 看範本；`docs/incidents/2026-10-08-map-stale.md` 是上一份寫好的紀錄',
      `用 \`cat > ${NOTES_PATH} <<'EOF'\` 寫入，一次可以只寫幾行，再用 \`cat >> … <<'EOF'\` 接下去`,
      '時間線一行一個事件、寫上時間與時區；行動項目用表格，每列有負責人與期限',
      '`git add docs/incidents`、`git commit -m …`、`git push`',
    ],
    explanation: '事故紀錄放在儲存庫裡，和程式一起被審查、被搜尋，下一次值班的人找得到。範本保證每份紀錄都回答同樣的問題：影響了誰多久、發生了什麼（時間線）、哪些條件讓它發生（促成因素）、要改什麼（行動項目）。檢查只看結構：三節都在、時間線記下了回滾到的版本；內容寫得好不好要靠事後檢討會議與同事的審查。行動項目的每一列都有負責人與期限，才會真的被完成；「大家以後更小心」不是行動項目。',
  },
];


// ---- The devops part (D3): the monitoring of 11-24 and of the October incident, with the lesson's severity matrix.
/** Maple Bikes' severity matrix: the share of users affected (rows) and how long they were affected (columns). */
const SEVERITY: SeverityMatrix = {
  rows: [{ label: '一半以上的使用者（50% 以上）', minUsersPercent: 50 }, { label: '部分使用者（10% 以上）', minUsersPercent: 10 }, { label: '少數使用者（10% 以下）', minUsersPercent: 0 }],
  columns: [{ label: '60 分鐘以上', minMinutes: 60 }, { label: '15–59 分鐘', minMinutes: 15 }, { label: '15 分鐘以內', minMinutes: 0 }],
  levels: [['SEV1', 'SEV1', 'SEV2'], ['SEV2', 'SEV2', 'SEV3'], ['SEV3', 'SEV3', 'SEV4']],
};

/**
 * 11-24, minute 0 = 13:30 (UTC+8), 150 minutes. INC-1124 [32, 73): 2.5.0 live at 14:02; about 62 % of unlocks fail
 * (+620 ‰) until the rollback completes at 14:41 (71); two minutes of tail (+200 ‰) while clients retry; the restart at
 * 14:33 (63) fails every unlock for a minute (+370 ‰). Traffic rises with retries, p95 drops a little (timeouts fail
 * fast). The rule (errors > 50 ‰ held 3 minutes) is pending at 32–34 and fires at 35 (14:05), as the team recorded.
 */
const incidentBoard = (): Dashboard => ({
  service: 'dock-api（開鎖服務）', minutes: 150,
  series: [
    { id: 'unlock-errors', label: '開鎖失敗率', unit: '‰', signal: 'errors', shape: { seed: 1401, baseline: 6, noise: 3, changes: [
      { kind: 'spike', at: 32, minutes: 39, delta: 620 }, { kind: 'spike', at: 63, minutes: 1, delta: 370 }, { kind: 'spike', at: 71, minutes: 2, delta: 200 }] } },
    { id: 'unlock-rpm', label: '每分鐘開鎖請求', unit: '個', signal: 'traffic', shape: { seed: 1402, baseline: 380, noise: 20, changes: [{ kind: 'spike', at: 32, minutes: 41, delta: 160 }] } },
    { id: 'unlock-p95', label: '開鎖 p95 延遲', unit: 'ms', signal: 'latency', shape: { seed: 1403, baseline: 410, noise: 25, changes: [{ kind: 'spike', at: 32, minutes: 41, delta: -40 }] } },
  ],
  incidents: [{
    id: 'inc-1124', label: 'INC-1124：2.5.0 發布後部分站點無法開鎖', start: 32, end: 73, usersPercent: 62, events: [
      { at: 32, kind: 'note', text: '14:02 Deploy 把 dock-api 2.5.0 部署到 prod-01，冒煙測試通過' },
      { at: 35, kind: 'detected', text: '14:05 告警「開鎖失敗率超過 50‰，持續 3 分鐘」觸發，呼叫值班的 Kuo Yen' },
      { at: 45, kind: 'acknowledged', text: '14:15 Kuo Yen 確認接手（第一次呼叫時正在騎車，沒有看到通知）' },
      { at: 48, kind: 'note', text: '14:18 宣告 SEV1；Tomás 擔任事故指揮、Hana 負責溝通，開啟頻道 #inc-1124' },
      { at: 50, kind: 'note', text: '14:20 第一則狀態更新：部分站點無法開鎖，14:50 前再更新' },
      { at: 56, kind: 'note', text: '14:26 日誌顯示 lock controller timeout after 80ms；2.5.0 把 lock.timeout_ms 從 800 改為 80' },
      { at: 63, kind: 'note', text: '14:33 重新啟動 web 容器，錯誤沒有減少，重新啟動的那一分鐘開鎖全部失敗' },
      { at: 66, kind: 'note', text: '14:36 事故指揮決定回滾到 2.4.1 的 digest，不部署還沒測過的 2.5.1' },
      { at: 71, kind: 'mitigated', text: '14:41 Deploy 以 2.4.1 的 digest 部署完成，開鎖失敗率開始下降' },
      { at: 73, kind: 'note', text: '14:43 開鎖失敗率回到平常的水準' },
      { at: 75, kind: 'note', text: '14:45 第二則狀態更新：已恢復，持續觀察，15:45 前再更新' },
      { at: 130, kind: 'resolved', text: '15:40 觀察一小時沒有異常，結案；事後檢討訂在 11-26' },
    ],
  }],
  rules: [{ id: 'unlock-err', label: '開鎖失敗率超過 50‰，持續 3 分鐘', series: 'unlock-errors', op: '>', threshold: 50, forMinutes: 3, severity: 'critical' }],
  severity: SEVERITY,
});

/**
 * 10-08, minute 0 = 09:00 (UTC+8), 120 minutes. INC-1008 [15, 110): the station sync job hangs; the north district's map
 * shows stale bike counts (about 4 % of users), found from customer reports at 09:55; no alert existed then. The rule is
 * the one added afterwards (an action item of INC-1008): it fires at 20 (pending 15–19), 5 minutes after the start.
 */
const octoberBoard = (): Dashboard => ({
  service: 'dock-api（站點地圖）', minutes: 120,
  series: [
    { id: 'sync-errors', label: '站點狀態同步失敗率', unit: '‰', signal: 'errors', shape: { seed: 1404, baseline: 2, noise: 1, changes: [{ kind: 'spike', at: 15, minutes: 89, delta: 45 }] } },
    { id: 'map-rpm', label: '每分鐘地圖請求', unit: '個', signal: 'traffic', shape: { seed: 1405, baseline: 900, noise: 40 } },
  ],
  incidents: [{
    id: 'inc-1008', label: 'INC-1008：北區站點地圖的可借車數過時', start: 15, end: 110, usersPercent: 4, events: [
      { at: 15, kind: 'note', text: '09:15 北區的站點狀態同步工作停止更新（事後由工作的日誌確認）' },
      { at: 55, kind: 'detected', text: '09:55 客服轉來三則使用者回報：地圖顯示有車，到站沒有車' },
      { at: 58, kind: 'acknowledged', text: '09:58 值班的 Tomás 確認接手' },
      { at: 70, kind: 'note', text: '10:10 發現同步工作卡在一個沒有逾時的連線上' },
      { at: 104, kind: 'mitigated', text: '10:44 重新啟動同步工作並清除地圖快取' },
      { at: 110, kind: 'note', text: '10:50 北區站點的車數與現場一致' },
      { at: 115, kind: 'resolved', text: '10:55 結案' },
    ],
  }],
  rules: [{ id: 'sync-err', label: '（INC-1008 之後新增）同步失敗率超過 20‰，持續 5 分鐘', series: 'sync-errors', op: '>', threshold: 20, forMinutes: 5, severity: 'warning' }],
  severity: SEVERITY,
});


export const CICD14: LessonContent = {
  lessonId: 'CICD14',
  motivation: '「11 月 24 日 14:02，dock-api 2.5.0 上線，冒煙測試是綠的。14:05 告警響了：站點前的人刷了 App 卻借不到車，開鎖失敗的比例超過六成。值班的 Kuo Yen 在騎車，14:15 才看到通知；接下來的半小時，有人重新啟動容器、有人想趕快把 2.5.1 推上去、客服一直問『要跟使用者說什麼』，最後才回滾到 2.4.1。」CICD09 到 CICD13 讓發布可以重複、可以回滾，但再好的管線也會漏掉問題。這一課談事故發生時與之後該怎麼做：依影響範圍判定嚴重等級並及早宣告事故；由事故指揮分工，先止血再找原因；對使用者與客服發出有節奏、不猜測、不究責的狀態更新；用時間線記下發生了什麼，算出偵測、確認、止血與恢復花了多久；最後寫一份不究責、每個行動都有負責人與期限的事後檢討。儀表板是那天下午的監控資料；終端機是團隊的事故演練：在 production 的演練複本上重現那次發布，親手查證、回滾、更新狀態頁，並把紀錄推送到儲存庫。',
  sections: [
    {
      id: 'cicd14-s-case', title: '案例：14:00 的發布之後',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的社區單車共享 Maple Bikes。服務 dock-api 回報各站點的可借車數，並在使用者按下「開鎖」時呼叫站點的鎖控制器（lock controller）解開車鎖；程式在模擬的 `github.example` 上的 maple/dock-api。你是 Kuo Yen（gh 帳號 yen-kuo），這週的值班工程師；Priya Raman 是開發者，Tomás Ortega 是團隊負責人，Hana Sato 負責客服與對外溝通。2.5.0 包含 Priya 一個經過審查、CI 全綠的設定變更：把鎖控制器的逾時 `lock.timeout_ms` 從 800 改成 80，想讓 App 少等一點。' },
        { type: 'p', text: '下面是那天下午的監控（示意資料，第 0 分鐘是 13:30，UTC+8）：開鎖失敗率、每分鐘的開鎖請求與開鎖的 p95 延遲，底色是使用者受影響的期間，課程的規則是觸發呼叫的那條告警。往下捲到事故時間線，可以看到團隊當天記下的每一個事件。' },
        { type: 'example', id: 'cicd14-board' },
        { type: 'p', text: '失敗率從 14:02 跳到六成以上，告警等條件持續了規則要求的時間才觸發；14:33 那一分鐘幾乎全部失敗，是重新啟動容器造成的；回滾完成後還有兩分鐘的尾巴，客戶端的重試慢慢消化。值得注意的是 p95 延遲反而略為下降：逾時 80 ms 讓失敗的請求很快就回傳錯誤。只看延遲的人會以為服務變快了，這也是告警要對使用者的症狀（失敗率）設定的原因（CICD11）。' },
        { type: 'table', head: ['機器或服務', '角色', '演練開始時的狀態'], rows: [
          ['yen-laptop（你的筆電）', '~/dock-api 是儲存庫的複本；有 git、gh、ssh、scp、curl', '你的金鑰可以登入 prod-01 的 deploy 與 status-01 的 ops；~/drill 有演練說明與 start.sh'],
          ['prod-01（10.30.0.21）', 'production 的 Docker 主機，帳號 deploy 在 docker 群組', '容器 web 跑 `dock-api:2.4.1`，公開 8000 埠；`/v1/docks/D-114` 是使用者的開鎖請求'],
          ['status-01（10.30.0.40）', '狀態頁：把 `/var/www/status/current.txt` 以 HTTP 提供給使用者與客服', '內容是「所有服務正常運作」；ops 帳號可以寫入'],
          ['cr.maple.example', '團隊的 Registry', 'dock-api 的 2.4.1、2.5.0、2.5.1；`latest` 指向 2.5.0；2.5.1 是 Priya 當天在事故中趕出來、還沒測過的修正（演練裡預先放好）'],
          ['maple/dock-api 的 Deploy', '`workflow_dispatch`，輸入 `image`，經由 production 環境以 ssh 部署到 prod-01，最後 `curl -fsS http://prod-01:8000/healthz`', '還沒有任何部署紀錄；`docs/incidents` 有範本與十月的事故紀錄，`docs/runbook.md` 是處理手冊'],
        ] },
        { type: 'callout', tone: 'note', title: '事故演練與模擬環境的範圍', text: '事故演練（game day）是在不影響使用者的複本上重現一次事故，讓每個值班的人都練過查證、止血與溝通。本課的演練環境把時鐘撥回 11-24 14:00，`bash ~/drill/start.sh` 以當天的方式（Deploy 以標籤 2.5.0 部署）重現發布。為了能重現，幾件事被簡化：指令幾乎不花時間，所以演練裡的時間和儀表板上的分鐘數不同；runner 可以直接連到 prod-01；狀態頁只是一個文字檔；gh 與 REST 的部分欄位依記得的格式模擬。組織、人物、主機與 Token 都是虛構的。' },
        { type: 'example', id: 'cicd14-release' },
        { type: 'p', text: 'Deploy 的 run 成功，`/healthz` 也回 ok，但 `/v1/docks/D-114` 回 503：健康檢查端點只確認程式活著，不經過鎖控制器，所以冒煙測試擋不下這個問題。從這一刻起使用者就受到影響，接下來各節依序處理：這有多嚴重、誰做什麼、怎麼告訴使用者、發生了什麼，以及之後要改什麼。' },
      ],
    },
    {
      id: 'cicd14-s-severity', title: '嚴重等級：先判斷有多嚴重，及早宣告',
      blocks: [
        { type: 'p', text: '事故（incident）是需要立刻、而且常常需要多人協調處理的服務中斷或品質下降。宣告事故（declare an incident）是一個明確的動作：從這一刻起，有人負責指揮、有固定的頻道、有對外的更新、事後有檢討。嚴重等級（severity，常寫成 SEV1、SEV2…）讓所有人用同一套說法判斷「這有多急」：它決定要呼叫誰、多久更新一次、要不要事後檢討。' },
        { type: 'table', head: ['等級', 'Maple Bikes 的定義', '應變'], rows: [
          ['SEV1', '大量使用者無法完成核心功能（借車、還車、付款）', '立刻呼叫值班與事故指揮；每 30 分鐘對外更新；一定要寫事後檢討'],
          ['SEV2', '部分使用者的核心功能受影響，或大量使用者的次要功能受影響', '呼叫值班並指定事故指揮；每 60 分鐘更新；寫事後檢討'],
          ['SEV3', '少數使用者受影響，或有替代方式', '上班時間處理；必要時更新狀態頁；寫簡短的紀錄'],
          ['SEV4', '幾乎沒有使用者察覺', '開成待辦事項'],
        ] },
        { type: 'p', text: '每個組織的分級都不同，沒有通用的標準；重要的是事先寫好、大家都照同一張表判斷。Maple Bikes 用一張矩陣：列是受影響的使用者比例，欄是使用者受影響的時間，事故落在第一個符合的列與欄。探索器的事故時間線會標出事故落在哪一格。' },
        { type: 'table', head: ['受影響的使用者 ＼ 影響時間', '60 分鐘以上', '15–59 分鐘', '15 分鐘以內'], rows: [
          ['一半以上（50% 以上）', 'SEV1', 'SEV1', 'SEV2'],
          ['部分（10% 以上）', 'SEV2', 'SEV2', 'SEV3'],
          ['少數（10% 以下）', 'SEV3', 'SEV3', 'SEV4'],
        ] },
        { type: 'p', text: '事故進行中，影響的時間還在增加、受影響的比例也只是估計，所以嚴重等級是當下的判斷：先依看得到的影響暫定一個等級，情況變了就升級或降級；事後檢討再依實際的影響確定最後的等級。下面是十月的另一次事故：北區站點地圖的可借車數停住了一個半小時，但只影響少數使用者，而且是客服先接到使用者回報才發現的。比較它和 INC-1124 在矩陣上的位置；儀表板上的規則是那次事故之後才新增的告警，當時並不存在。' },
        { type: 'example', id: 'cicd14-oct' },
        { type: 'list', items: [
          '有疑慮就宣告：宣告之後發現沒事，降級或結案只花幾分鐘；晚宣告的代價是沒有人指揮、沒有人通知使用者。',
          '常見的宣告條件：使用者看得到的影響、需要兩個以上的人或團隊、幾分鐘內找不到原因、可能有資料遺失或安全疑慮。',
          '任何人都可以宣告，不必等主管同意；宣告的人在有人接手之前就是事故指揮。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：等確定原因再宣告事故', text: '原因往往要很久之後才清楚，而使用者從第一分鐘就受到影響。宣告事故不是承認犯錯，而是啟動應變：指揮、分工、溝通。INC-1124 在 14:15 有人接手後，又過了幾分鐘才宣告 SEV1，期間客服只能回覆「我們再確認」。宣告的依據是影響，不是原因。' },
      ],
    },
    {
      id: 'cicd14-s-command', title: '事故指揮：分工、一個頻道、先止血',
      blocks: [
        { type: 'p', text: '事故指揮（incident command）的做法借自消防與救災的事故指揮系統：一個人負責全局，其他人各有清楚的角色，避免所有人同時盯著同一個畫面、同時下指令。小事故可能一個人身兼數職，但角色仍要說清楚。' },
        { type: 'table', head: ['角色', '負責', 'INC-1124'], rows: [
          ['事故指揮（incident commander，IC）', '掌握全局、分派工作、做決定（例如回滾）、決定嚴重等級與何時結案；自己不動手除錯', 'Tomás（14:18 接手；之前是第一個到場的 Yen）'],
          ['溝通負責人（communications）', '依節奏寫對外與對內的更新，回應客服與其他團隊的詢問，讓操作的人不被打斷', 'Hana'],
          ['操作（operations）', '查證、止血、驗證；把觀察與做了什麼回報到頻道', 'Yen'],
          ['紀錄（scribe）', '在頻道或文件裡即時記下時間、觀察、決定與動作，之後成為時間線', '由 Hana 兼任'],
        ] },
        { type: 'list', items: [
          '一個頻道：所有討論與決定都在同一個事故頻道（INC-1124 是 #inc-1124），私訊與分散的對話會讓資訊不同步，也留不下紀錄。',
          '交接要說出口：「我是事故指揮」、「我把指揮交給 Tomás」，讓每個人都知道該聽誰的。',
          '決定要宣布：「我們回滾到 2.4.1 的 digest，Yen 執行，完成後回報」，而不是讓幾個人各自嘗試。',
          '事故指揮不動手除錯：一旦開始看日誌，就沒有人在看全局、沒有人回答客服。',
        ] },
        { type: 'p', text: '止血（mitigation）是先讓使用者不再受影響，修復（resolution）是解決根本的問題；事故中先止血，原因留到穩定之後再查。止血的方法不多，選最快、最可預期、最容易驗證的那一個。' },
        { type: 'table', head: ['止血方式', '適合', '風險'], rows: [
          ['回滾到上一個正常的版本（以 digest）', '事故從一次發布或設定變更之後開始', '低：那個版本跑過、行為已知；資料庫結構變更要先確認相容（CICD13）'],
          ['關掉功能旗標', '新功能藏在旗標後面', '低：不需要部署'],
          ['重新啟動', '暫時的狀態出錯：記憶體洩漏、卡住的連線、耗盡的資源', '對壞掉的程式或設定無效，還可能讓服務短暫完全中斷'],
          ['擴充容量、分流', '流量暴增、資源飽和', '要時間，也可能把壓力推給下游'],
          ['往前修（roll forward，部署新的修正）', '回滾不可行（例如資料已經改變），而且修正很小、經過測試', '高：在壓力下寫的修正沒有被驗證過，可能讓情況更糟'],
        ] },
        { type: 'p', text: '先查證再動手：下面的例子看正在跑的容器與日誌、部署紀錄與變更。每一個觀察都要寫進頻道，它們之後會成為時間線的證據。' },
        { type: 'example', id: 'cicd14-investigate' },
        { type: 'p', text: '容器跑的是 2.5.0，日誌一開頭就印出 `lock_timeout_ms=80`，接著是一連串 `lock controller timeout after 80ms`；成功的 D-031 只花了 61 ms，所以 80 ms 對大多數站點太短。部署紀錄說 production 在 06:00 UTC（14:00）部署了 3196b0d，那正是把逾時改成 80 的 commit。主機上還留著 2.4.1，`docker images --digests` 列出它的 digest：回滾要指定的就是這一份。commit 的作者寫得很清楚，但這個資訊只用來找到變更，不是用來找人負責。' },
        { type: 'example', id: 'cicd14-restart' },
        { type: 'p', text: '重新啟動之後，容器用同樣的 Image、同樣的設定再跑一次，日誌又印了一次 `lock_timeout_ms=80`，開鎖照樣逾時。處理手冊寫的是「發布後出錯：先回滾」。當天團隊先試了重新啟動，花了幾分鐘、還讓開鎖全部失敗了一分鐘；演練的目的就是讓下一次的值班者直接選對的那一個。第一題就是這次演練的止血。' },
        { type: 'callout', tone: 'tip', title: '先問「最近改了什麼」', text: '大部分的事故發生在某個改變之後：發布、設定、流量、相依的服務。事故開始的時刻和部署紀錄、變更紀錄對得上時，回滾通常是最好的第一步，即使還不完全確定原因；回滾之後問題仍在，也排除了一個可能。' },
      ],
    },
    {
      id: 'cicd14-s-comms', title: '對外溝通：有節奏、不猜測、不究責的狀態更新',
      blocks: [
        { type: 'p', text: '事故中有很多人需要知道狀況：使用者想知道能不能借車、客服要回覆詢問、其他團隊要判斷會不會影響他們、主管要決定要不要對外說明。對外溝通由溝通負責人處理，讓操作的人專心止血；狀態頁（status page）是對使用者與客服的固定出口，內部則在事故頻道更新。每一則狀態更新至少包含三件事：' },
        { type: 'list', ordered: true, items: [
          '影響：從使用者的角度寫什麼功能受影響、什麼仍然正常（「部分站點無法以 App 開鎖借車；還車與付款正常」），不要寫內部元件的名稱。',
          '正在做什麼：已確認的事與正在進行的處理（「我們正在回復到前一版」），不要寫還沒確認的原因。',
          '下次更新的時間：即使沒有新進展，到時候也要更新；這讓使用者與客服不必一直詢問。',
        ] },
        { type: 'table', head: ['不好的寫法', '問題', '較好的寫法'], rows: [
          ['「工程師改錯了設定」', '指責個人，對使用者沒有幫助，也讓團隊之後不敢說實話', '「問題在 14:00 的版本更新之後出現」'],
          ['「應該是鎖控制器的網路有問題」', '猜測：之後證明是錯的，會失去信任', '「我們正在調查，確認後再說明」'],
          ['「預計 5 分鐘內恢復」', '沒有根據的承諾', '「14:50 前再更新」'],
          ['「lock controller timeout，錯誤率 626‰」', '使用者看不懂內部術語與數字', '「部分站點無法開鎖」'],
          ['問題解決後不再更新', '使用者不知道可以再試一次', '「已恢復，我們持續觀察，15:45 前再更新」'],
        ] },
        { type: 'example', id: 'cicd14-status' },
        { type: 'p', text: '更新寫好之後從使用者看到的網址再確認一次。受影響的站點如果能具體列出（第二題從日誌找出它們），客服就能直接回覆那些站點的使用者；但日誌只看得到已經發生的請求，所以要寫成「目前已知」，不要宣稱是完整的範圍。止血之後、結案時都要再發一則更新，SEV1 的事故通常還會在事後檢討完成後公布摘要。' },
        { type: 'callout', tone: 'tip', title: '沒有新消息也要準時更新', text: '「我們仍在處理，下一則更新在 15:20 前」本身就是有用的資訊：它告訴使用者問題沒有被遺忘。錯過自己承諾的更新時間，比更新內容少更傷害信任。' },
      ],
    },
    {
      id: 'cicd14-s-timeline', title: '時間線與四個時間',
      blocks: [
        { type: 'p', text: '時間線（timeline）是事故依時間排列的紀錄：什麼時候發生了什麼、誰觀察到什麼、做了什麼決定與動作、結果如何。事故中由紀錄的人在頻道即時記下，事後再對照證據補齊：告警的觸發時間、部署紀錄（`gh api` 的 deployments 與 statuses）、主機與容器的日誌、頻道的訊息。第一節儀表板的事故時間線就是 INC-1124 的時間線。' },
        { type: 'table', head: ['好的時間線記下', '例子'], rows: [
          ['附時區的時間', '「14:41（UTC+8）」；部署紀錄與日誌常用 UTC，要換算一致'],
          ['發生了什麼、觀察到什麼', '「日誌顯示 lock controller timeout after 80ms」'],
          ['做了什麼，以及結果（包括沒有用的嘗試）', '「重新啟動 web 容器，錯誤沒有減少」'],
          ['決定與做決定的角色', '「事故指揮決定回滾到 2.4.1 的 digest，不部署 2.5.1」'],
          ['確切的版本與識別碼', 'Image 的 digest、commit、run 與部署的編號'],
          ['證據的來源', '告警、部署紀錄、日誌、頻道訊息的連結'],
        ] },
        { type: 'p', text: '從時間線上的四個時刻可以算出四個時間，每一個指向不同的改進方向。探索器依本課的定義計算：' },
        { type: 'table', head: ['時間', '算法', '太長時要改進的'], rows: [
          ['偵測時間（time to detect）', '偵測到 − 事故開始', '告警：規則、門檻、有沒有對症狀告警（十月那次靠使用者回報）'],
          ['確認時間（time to acknowledge）', '確認接手 − 偵測到', '呼叫：通知的方式、沒有回應時升級給第二位值班'],
          ['止血時間（time to mitigate）', '止血完成 − 事故開始', '處理手冊、回滾的速度、事故指揮的決定'],
          ['恢復時間（time to recover）', '影響結束 − 事故開始', '同上，加上止血後恢復需要的時間（快取、重試）'],
        ] },
        { type: 'p', text: '在探索器裡打開兩次事故的時間線，看它們的四個時間：十月那次的偵測時間特別長，因為當時沒有同步失敗的告警，要等使用者打電話給客服（在它的儀表板上選擇事後新增的那條規則，看它會在第幾分鐘觸發）；INC-1124 的告警很快，但確認花了比偵測更久。改進要對準最長的那一段，而不是每一段都平均加強。' },
        { type: 'callout', tone: 'note', title: '「恢復」有好幾種定義', text: '本課的恢復時間是使用者受影響的期間（事故開始到影響結束），不是結案：INC-1124 在 14:43 恢復，15:40 才結案。CICD01 的 DORA 指標「失敗部署復原時間」從部署造成故障算到服務恢復；常見的縮寫 MTTR 則有人指修復、有人指恢復。比較數字之前，先確認大家用的是同一個起點與終點。' },
      ],
    },
    {
      id: 'cicd14-s-postmortem', title: '不究責的事後檢討',
      blocks: [
        { type: 'p', text: '事後檢討（postmortem，也稱事故回顧）在事故結束後的幾天內完成：整理時間線、分析哪些條件讓事故發生與擴大、決定要改什麼。不究責的事後檢討（blameless postmortem）假設每個人在當時、以當時擁有的資訊，都做了合理的決定，重點放在系統與條件：為什麼系統讓這個錯誤通過、為什麼我們這麼晚才發現、為什麼止血花了這麼久。只有在說實話不會被懲罰時，大家才會說出「我當時以為……」，而這些正是改進需要的資訊。' },
        { type: 'p', text: '以 INC-1124 為例，「Priya 把逾時設錯了」只描述了最後一步。她的變更經過審查、CI 全綠、在 staging 也正常；值得追問的是這些關卡為什麼都沒有擋下來。事故通常有好幾個促成因素（contributing factors），而不是單一的根本原因：' },
        { type: 'table', head: ['促成因素', '行動項目', '負責人與期限'], rows: [
          ['設定值沒有範圍檢查，80 ms 比鎖控制器平常的回應時間還短', '載入設定時檢查 `lock.timeout_ms` 的合理範圍，超出就拒絕啟動', 'Priya Raman，12-04'],
          ['staging 的鎖控制器是模擬器，20 ms 就回應，測不出逾時', 'staging 的模擬器加上和 production 相近的延遲', 'Tomás Ortega，12-11'],
          ['冒煙測試只打 `/healthz`，不經過鎖控制器', '冒煙測試加上一次經過鎖控制器的檢查', 'Kuo Yen，12-04'],
          ['發布一次換掉全部流量', '評估以金絲雀發布 dock-api（CICD10）', 'Tomás Ortega，12-18'],
          ['呼叫沒有回應時沒有升級，確認接手花了很久', '呼叫 5 分鐘沒有確認就升級給第二位值班', 'Hana Sato，11-30'],
          ['處理手冊沒寫「先回滾」，當天先試了重新啟動', '處理手冊寫明發布後出錯先回滾，並在下次演練練習', 'Kuo Yen，11-30'],
        ] },
        { type: 'list', items: [
          '具體、可以驗證：做完了就知道做完了（「加上範圍檢查」），而不是「更小心」、「加強測試文化」。',
          '每一項都有一位負責人與期限，並追蹤到完成；沒有負責人的行動項目通常不會發生。',
          '依影響排優先順序：先做最能避免再發生、或最能縮短偵測與止血的那幾項。',
          '紀錄放在大家找得到的地方（本課是儲存庫的 `docs/incidents`），並在檢討會議上一起審閱。',
        ] },
        { type: 'example', id: 'cicd14-postmortem' },
        { type: 'p', text: '十月的紀錄只寫系統與條件（同步工作沒有逾時、沒有同步失敗的告警、地圖沒有顯示更新時間），三個行動項目都有負責人與期限，而且都已完成；這次的告警與地圖的更新時間就是那次檢討的成果。第三題請你依同一個範本寫下 INC-1124 的紀錄，並推送到儲存庫。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：不究責就是沒有人要負責', text: '不究責不是不負責任：每個行動項目都有明確的負責人，團隊仍然要為改進負責。它拒絕的是把「人為疏失」當成結論：人一定會犯錯，系統應該讓錯誤不容易發生、發生時容易被發現、影響容易被限制。把事故歸給某個人，只會讓下一次大家隱瞞資訊，同樣的條件仍然在那裡等著下一個人。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd14-q-declare', prompt: '14:05 告警響了，開鎖失敗率很高，但值班的人還不知道原因，也不確定影響多少人。比較好的做法是什麼？',
      options: ['先查出原因，確定真的是事故之後再宣告，以免虛驚一場', '先宣告事故並暫定等級，之後依實際影響調整', '等十分鐘，看失敗率會不會自己降下來再決定', '先在團隊頻道問誰最近改過東西，等有人回覆再處理'],
      answer: 1,
      explanation: '宣告的依據是影響，不是原因：先宣告並暫定等級，就有人指揮、有人通知使用者，等級之後可以升降。等確定原因才宣告，使用者在這段時間沒有任何消息；等失敗率自己下降是把止血交給運氣；查誰改了東西可以並行，但不該擋住應變的開始。',
    },
    {
      id: 'cicd14-q-ic', prompt: '事故指揮（incident commander）在事故中主要做什麼？',
      options: ['協調分工、做決定、掌握全局', '親自登入主機查日誌，因為他通常最資深', '撰寫每一則對外更新並回覆每一位使用者', '找出是誰的變更造成事故並通知他的主管'],
      answer: 0,
      explanation: '事故指揮負責全局：分派角色、決定止血的方式與嚴重等級、決定何時結案。他不動手除錯，否則沒有人在看全局；對外更新是溝通負責人的工作；找出「是誰」不是事故中的任務，事後檢討也只看系統與條件。',
    },
    {
      id: 'cicd14-q-mitigate', prompt: '2.5.0 上線後開鎖開始失敗，日誌指向新的逾時設定，主機上還留著 2.4.1。最好的第一步是什麼？',
      options: ['重新啟動 web 容器，讓服務重新讀取設定', '部署 Priya 剛建好的 2.5.1，它把逾時改成 200 ms', '先算出逾時該設多少，再發布正確的新版本', '經由 Deploy 回滾到 2.4.1 的 digest'],
      answer: 3,
      explanation: '事故從一次發布開始，回滾到上一個跑過的版本最快、最可預期，以 digest 指定確保部署的是那一份內容，經由管線則留下部署紀錄。重新啟動會用同樣的設定再跑一次；2.5.1 沒有測試過，是在壓力下往前修；先找正確的數值是修復，應該等止血之後再做。',
    },
    {
      id: 'cicd14-q-update', prompt: '下列哪一則狀態更新最恰當？',
      options: ['我們的工程師改錯了設定，正在修正中。', 'lock controller 逾時，錯誤率 626‰，調查中。', '部分站點無法開鎖，正在回復前一版，14:50 前再更新。', '服務出了一點問題，預計很快恢復，請稍候。'],
      answer: 2,
      explanation: '好的更新寫出使用者看得懂的影響、正在做的事與下次更新的時間。指責工程師對使用者沒有幫助，也違反不究責；內部術語與數字使用者看不懂；「很快恢復」是沒有根據的承諾，也沒有說明影響了什麼、下次何時更新。',
    },
    {
      id: 'cicd14-q-recover', prompt: '一次事故 09:10 開始、09:16 偵測到、09:20 確認接手、09:45 止血完成、09:50 使用者恢復正常、11:00 結案。依本課的定義，恢復時間是多少？',
      options: ['40 分鐘', '35 分鐘', '34 分鐘', '110 分鐘'],
      answer: 0,
      explanation: '恢復時間是使用者受影響的期間：影響結束 09:50 減去事故開始 09:10，是 40 分鐘。35 分鐘是止血時間（09:45 − 09:10）；34 分鐘是從偵測算起，少算了沒有人知道的那 6 分鐘；110 分鐘算到結案，結案是觀察與收尾，不是影響的結束。',
    },
    {
      id: 'cicd14-q-blameless', prompt: '事後檢討的初稿寫著「根本原因：Priya 把逾時設錯了，之後改設定要更小心」。最大的問題是什麼？',
      options: ['沒有寫出 Priya 修改設定的確切時間與 commit', '應該同時列出審查者的名字，責任才算公平', '設定錯誤不算事故原因，只要寫回滾的經過就好', '把原因歸給個人，沒有追問系統為什麼讓錯誤上線'],
      answer: 3,
      explanation: '不究責的事後檢討追問的是條件：沒有範圍檢查、staging 測不出逾時、冒煙測試不經過鎖控制器。「更小心」不是可以驗證的行動項目。時間與 commit 屬於時間線，不是這段的主要問題；加上審查者的名字只是多指責一個人；設定變更當然是促成因素，只寫回滾經過就學不到任何東西。',
    },
    {
      id: 'cicd14-q-action', prompt: '下列哪一個是好的行動項目？',
      options: ['所有人修改設定時都要更加小心', '載入設定時檢查逾時範圍（Priya，12-04）', '持續加強團隊整體的測試文化', '每次修改設定前，都先在團隊頻道請所有人幫忙多看一眼'],
      answer: 1,
      explanation: '好的行動項目具體、可以驗證，有一位負責人與期限：加上範圍檢查之後，同樣的錯誤值會在啟動時就被拒絕。「更小心」與「加強測試文化」做不完也驗證不了；請所有人多看一眼仍然靠人的注意力，沒有改變任何會自動擋下錯誤的機制，也沒有負責人與期限。',
    },
    {
      id: 'cicd14-q-timeline', prompt: '一份好的事故時間線應該記下哪些內容？',
      options: ['只記成功的處理步驟，失敗的嘗試會讓紀錄變得混亂', '每個人在頻道裡說過的每一句話，越完整越好', '附時區的時間、觀察與動作的結果、證據的來源', '事故的根本原因與負責的人，時間可以事後再補'],
      answer: 2,
      explanation: '時間線記下附時區的時間、發生與做了什麼及結果（包括沒有用的嘗試，例如重新啟動）、做決定的角色、確切的版本與證據的來源。省略失敗的嘗試會讓檢討看不到止血為什麼慢；逐字記下所有對話會淹沒重點；時間是時間線的骨架，而「負責的人」不是時間線要回答的問題。',
    },
  ],
  terminal: { machines: [drill], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    dashboards: [
      {
        id: 'cicd14-board', title: 'INC-1124：11-24 下午的開鎖服務',
        description: 'dock-api 在 11-24 13:30–16:00（UTC+8）的監控（示意資料）：開鎖失敗率、每分鐘開鎖請求與開鎖 p95 延遲，底色是 INC-1124 使用者受影響的期間；課程的規則是那天呼叫值班的告警；事故時間線列出團隊記下的事件，並依 Maple Bikes 的矩陣判定嚴重等級。',
        dashboard: incidentBoard(),
      },
      {
        id: 'cicd14-oct', title: 'INC-1008：10-08 上午的站點地圖',
        description: '十月那次事故（示意資料，第 0 分鐘是 09:00）：北區的站點狀態同步工作卡住，地圖上的可借車數停在 09:15，約 4% 的使用者受影響，當時沒有對應的告警，是客服轉來的回報才發現；課程的規則是那次事故之後才新增的告警。用同一張矩陣判定嚴重等級，並和 INC-1124 比較四個時間。',
        dashboard: octoberBoard(),
      },
    ],
    exercises: [
      {
        id: 'cicd14-x-times', kind: 'table', title: 'INC-1124 的四個時間',
        statement: '打開「INC-1124：11-24 下午的開鎖服務」的事故時間線，依本課的定義算出 INC-1124 的偵測時間、確認時間、止血時間與恢復時間（分鐘）。',
        blanks: [
          { id: 'ttd', label: '偵測時間（分鐘）', query: { task: 'incident', dashboard: 'cicd14-board', incident: 'inc-1124', metric: 'time-to-detect' } },
          { id: 'tta', label: '確認時間（分鐘）', query: { task: 'incident', dashboard: 'cicd14-board', incident: 'inc-1124', metric: 'time-to-acknowledge' } },
          { id: 'ttm', label: '止血時間（分鐘）', query: { task: 'incident', dashboard: 'cicd14-board', incident: 'inc-1124', metric: 'time-to-mitigate' } },
          { id: 'ttr', label: '恢復時間（分鐘）', query: { task: 'incident', dashboard: 'cicd14-board', incident: 'inc-1124', metric: 'time-to-recover' } },
        ],
        hints: [
          '事件表裡找出「偵測到」、「確認接手」、「止血（緩解）」三個事件的分鐘，事故開始與結束的分鐘在底色與事故的標題旁。',
          '確認時間從偵測到算起，不是從事故開始算起；其他三個從事故開始算起。',
          '恢復時間算到影響結束（事故期間的結束），不是算到結案。',
        ],
        explanation: '事故從第 32 分鐘（14:02）開始、第 73 分鐘（14:43）結束。偵測：告警在第 35 分鐘觸發，35 − 32 = 3 分鐘。確認：第 45 分鐘有人接手，45 − 35 = 10 分鐘，比偵測還久，對應的改進是呼叫的升級。止血：第 71 分鐘回滾完成，71 − 32 = 39 分鐘。恢復：73 − 32 = 41 分鐘；第 130 分鐘的結案不算在恢復時間裡。',
        mistakes: [
          { answer: { ttd: '3', tta: '13', ttm: '39', ttr: '41' }, why: '確認時間從事故開始算起；它衡量的是告警響了之後多久有人接手，要從偵測到算起' },
          { answer: { ttd: '3', tta: '10', ttm: '36', ttr: '41' }, why: '止血時間從偵測到算起；本課的止血與恢復時間都從事故開始算起，使用者從那時就受到影響' },
          { answer: { ttd: '3', tta: '10', ttm: '39', ttr: '98' }, why: '把結案當成恢復：第 130 分鐘是觀察一小時後結案，使用者在第 73 分鐘就恢復了' },
        ],
      },
      {
        id: 'cicd14-x-severity', kind: 'table', title: '兩次事故的嚴重等級',
        statement: '依 Maple Bikes 的嚴重等級矩陣（受影響的使用者比例 × 影響時間），判定 INC-1124 與 INC-1008 各是哪一級。兩個儀表板的事故時間線都有受影響的比例與影響時間。',
        blanks: [
          { id: 'inc1124', label: 'INC-1124（11-24 開鎖失敗）', query: { task: 'incident', dashboard: 'cicd14-board', incident: 'inc-1124', metric: 'severity' } },
          { id: 'inc1008', label: 'INC-1008（10-08 地圖過時）', query: { task: 'incident', dashboard: 'cicd14-oct', incident: 'inc-1008', metric: 'severity' } },
        ],
        hints: [
          '先找列：受影響的比例落在第一個「最低比例」不超過它的列。',
          '再找欄：影響時間是事故開始到結束的分鐘數，不是偵測或結案的時間。',
        ],
        explanation: 'INC-1124 影響 62% 的使用者 41 分鐘：列是「一半以上」，欄是「15–59 分鐘」，SEV1。INC-1008 雖然持續 95 分鐘，但只影響 4% 的使用者：列是「少數」，欄是「60 分鐘以上」，SEV3。影響的人數與時間要一起看：很久但很少人，和很短但很多人，都不一定是最高等級。',
        mistakes: [
          { answer: { inc1124: 'SEV2', inc1008: 'SEV3' }, why: '把 INC-1124 的偵測時間（3 分鐘）當成影響時間，落到「15 分鐘以內」那一欄；影響時間是事故開始到結束' },
          { answer: { inc1124: 'SEV1', inc1008: 'SEV1' }, why: '只看時間：INC-1008 持續超過一小時，但只影響少數使用者，矩陣上是 SEV3' },
        ],
      },
    ],
  },
};
