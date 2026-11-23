import type { TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';

/*
 * A synthetic machine for engine stage E24 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §14), only for tests: rt-01, an
 * Ubuntu host with Docker CE (the runtime profile, 2 CPUs, 2 GiB, no swap) where learner is in the docker group.
 * - ~/api: a Node.js service. Dockerfile has a shell-form CMD (sh is PID 1 and does not pass SIGTERM on), Dockerfile.exec the
 *   exec form; server.js needs DATABASE_URL and handles SIGTERM in 2 seconds (exit 0). worker.js grows by 10 MB a second
 *   from 30 MB; crash.js dies after 3 seconds (exit 1); boom.js exits 1 at once; plain.js has no SIGTERM handler.
 * - ~/secrets: a Dockerfile that bakes an API key into ENV and a token into an ARG (docker history shows both).
 * - ~/static: a two-stage build whose last stage copies the whole build stage (COPY --from=build / /).
 * - nginx:1.27 (STOPSIGNAL SIGQUIT; it writes its cache and pid file, and needs CHOWN, SETGID and SETUID), node:22-slim,
 *   alpine:3.21, distroless static, and team/worker:1.0 whose memory grows; an OOM-killed worker container from before.
 */
const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami', 'chmod', 'chown', 'curl'];
export const MIB = 1024 * 1024;

export const API_SHELL = 'FROM node:22-slim\nWORKDIR /app\nCOPY . .\nCMD node server.js\n';
export const API_EXEC = 'FROM node:22-slim\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.js"]\n';
export const SECRETS = 'FROM alpine:3.21\nARG NPM_TOKEN=lesson-npm-token-demo\nENV API_KEY=lesson-api-key-demo\nRUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > /root/.npmrc && rm /root/.npmrc\nCMD ["sh"]\n';
export const STATIC = 'FROM node:22-slim AS build\nWORKDIR /src\nCOPY server.js .\nFROM scratch\nCOPY --from=build / /\nCMD ["node", "/src/server.js"]\n';

export const RUNTIME_IMAGES: TerminalImage[] = [
  {
    name: 'nginx:1.27', size: 192_000_000, created: '2026-11-10 08:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 7, pulled: true,
    osRelease: DEBIAN, http: { port: 80, responder: 'site', accessLog: 'nginx' }, commands: [...BASIC], stopSignal: 'SIGQUIT',
    logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up', '2026/11/22 10:00:00 [notice] 1#1: start worker processes'],
    memory: { start: 7_967_000 }, pids: 3,
    signals: { QUIT: { seconds: 1, logs: ['2026/11/22 10:00:00 [notice] 1#1: gracefully shutting down'], exit: 0 }, TERM: { exit: 0 } },
    writes: ['/var/cache/nginx/client_temp', '/var/run/nginx.pid'], readOnlyError: { output: 'nginx: [emerg] mkdir() "/var/cache/nginx/client_temp" failed (30: Read-only file system)', exit: 1 },
    caps: ['CHOWN', 'SETGID', 'SETUID'], capMissing: { output: 'nginx: [emerg] chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)', exit: 1 },
  },
  { name: 'node:22-slim', size: 220_000_000, created: '2026-11-12 10:00:00', cmd: ['node'], env: [PATH_ENV, 'NODE_VERSION=22.11.0'], layers: 5, pulled: true, osRelease: DEBIAN, commands: [...BASIC, 'node'], output: 'Welcome to Node.js v22.11.0.\n' },
  { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' },
  { name: 'gcr.io/distroless/static-debian12:latest', size: 2_000_000, created: '2026-10-01 00:00:00', cmd: [], layers: 2, pulled: true, osRelease: DEBIAN, commands: [] },
  {
    name: 'team/worker:1.0', size: 230_000_000, created: '2026-11-20 10:00:00', cmd: ['node', 'worker.js'], workdir: '/app', service: true, layers: 6, pulled: true, osRelease: DEBIAN, commands: [...BASIC, 'node'],
    logs: ['worker started'], memory: { start: 30_000_000, growth: 10_000_000 }, cpu: 25,
  },
];

export const runtimeLab: TerminalMachine = {
  id: 'rt-01', title: 'rt-01（Docker 執行期主機）', user: 'learner', cwd: '/home/learner', host: 'rt-01', profile: 'runtime', cpus: 2,
  files: [dir('/home'), dir('/home/learner'), dir('/home/learner/api'), file('/home/learner/api/Dockerfile', API_SHELL), file('/home/learner/api/Dockerfile.exec', API_EXEC),
    file('/home/learner/api/server.js', 'const db = process.env.DATABASE_URL;\n'), file('/home/learner/api/worker.js', '// grows\n'), file('/home/learner/api/crash.js', '// dies\n'),
    file('/home/learner/api/boom.js', '// boom\n'), file('/home/learner/api/plain.js', '// no handler\n'),
    dir('/home/learner/secrets'), file('/home/learner/secrets/Dockerfile', SECRETS), dir('/home/learner/static'), file('/home/learner/static/Dockerfile', STATIC), file('/home/learner/static/server.js', '// static\n')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  responders: [{ id: 'site', server: 'nginx/1.27.3', routes: [{ path: '/', body: 'hello\n', type: 'text/html' }] }, { id: 'api', server: 'node', routes: [{ path: '/', body: 'api\n', type: 'text/plain' }] }],
  docker: {
    images: RUNTIME_IMAGES,
    programs: [
      {
        command: ['node', 'server.js'], needs: ['server.js'], service: true, http: { port: 3000, responder: 'api' }, logs: ['api listening on :3000'],
        needsEnv: ['DATABASE_URL'], missingEnv: { output: 'Error: DATABASE_URL is not set\n    at main (/app/server.js:3:11)', exit: 1 },
        signals: { TERM: { seconds: 2, logs: ['SIGTERM received, closing connections'], exit: 0 } }, memory: { start: 52_428_800 }, cpu: 1.5,
      },
      { command: ['node', 'worker.js'], needs: ['worker.js'], service: true, logs: ['worker started'], memory: { start: 30_000_000, growth: 10_000_000 }, cpu: 25 },
      { command: ['node', 'crash.js'], needs: ['crash.js'], service: true, logs: ['connecting to the database'], exitAfter: { seconds: 3, exit: 1, logs: [{ text: 'Error: connect ECONNREFUSED 10.0.0.5:5432', stream: 2 }] } },
      { command: ['node', 'boom.js'], needs: ['boom.js'], logs: [{ text: 'Error: boom', stream: 2 }], exit: 1 },
      { command: ['node', 'plain.js'], needs: ['plain.js'], service: true, logs: ['plain listening'], signals: {} },
      { command: ['node', '/src/server.js'], needs: ['/src/server.js'], service: true, logs: ['static'] },
    ],
    containers: [{ name: 'old-worker', image: 'team/worker:1.0', state: 'exited', created: '2026-11-22 09:00:00', started: '2026-11-22 09:00:00', finished: '2026-11-22 09:00:04', exitCode: 137, oomKilled: true, memory: '64m', restart: 'no' }],
  },
};

/** DKR14-like: run the API so that docker stop ends it gracefully (exec form) with a memory limit and a restart policy. */
export const gracefulExercise: TerminalExercise = {
  id: 'graceful', title: '讓 docker stop 優雅地結束 API', machine: 'rt-01',
  statement: '以 ~/api/Dockerfile.exec 建置 api:1.0，用 256MB 的記憶體上限、on-failure:3 的重新啟動策略與 DATABASE_URL=postgres://db/app 在背景執行名為 api 的容器，然後 docker stop 它。',
  checks: [{ kind: 'container', name: 'api', state: 'exited', exitCode: 0, memory: 256 * MIB, restartPolicy: 'on-failure:3' }],
  solution: ['docker build -t api:1.0 -f api/Dockerfile.exec api', 'docker run -d --name api -m 256m --restart on-failure:3 -e DATABASE_URL=postgres://db/app api:1.0', 'docker stop api'],
  mistakes: [
    { commands: ['docker build -t api:1.0 api', 'docker run -d --name api -m 256m --restart on-failure:3 -e DATABASE_URL=postgres://db/app api:1.0', 'docker stop api'], why: 'Shell 形式的 CMD：sh 不轉送 SIGTERM，10 秒後被 SIGKILL（137）' },
    { commands: ['docker build -t api:1.0 -f api/Dockerfile.exec api', 'docker run -d --name api --restart on-failure:3 -e DATABASE_URL=postgres://db/app api:1.0', 'docker stop api'], why: '沒有記憶體上限' },
  ],
  hints: ['docker build -f', 'docker run -m 256m --restart on-failure:3'], explanation: 'exec 形式讓 node 當 PID 1，自己處理 SIGTERM。',
};
