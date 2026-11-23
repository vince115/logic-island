import type { TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';

/*
 * A synthetic machine for engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13), only for tests: cmp-01, an
 * Ubuntu host with Docker CE (the compose profile) where learner is in the docker group.
 * - ~/shop: a Compose project (db: postgres:17 with a pg_isready health check, cache: redis:7.4 from Docker Hub, app: built
 *   from a Dockerfile, published on 8080, waiting for db to be healthy); postgres needs 4 seconds to accept connections.
 * - ~/api: a Go service with a multi-stage Dockerfile (golang:1.23 builds /out/api with the lesson's go build tool, the
 *   final stage is distroless static with no shell); ~/api/Dockerfile.single builds it in one stage.
 * - registry.example.com:5000: a private registry (ci may push to team/*, reader may only pull; team/web:1.0 and latest
 *   are there), and ghcr.example with immutable tags. ~/ci-token.txt and ~/ghcr-token.txt hold the fake lesson tokens.
 */
const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami', 'chmod', 'chown'];
export const CI_TOKEN = 'lesson-token-ci-0001';

export const COMPOSE_YAML = `services:
  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-example}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
  cache:
    image: redis:7.4
  app:
    build: .
    ports:
      - "8080:8000"
    environment:
      - DATABASE_URL=postgres://postgres@db:5432/shop
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s

volumes:
  pgdata:
`;
export const API_DOCKERFILE = `ARG GO_VERSION=1.23
FROM golang:\${GO_VERSION} AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
RUN go build -o /out/api ./cmd/api

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/api /api
EXPOSE 8000
ENTRYPOINT ["/api"]
`;
export const API_SINGLE = `FROM golang:1.23
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
RUN go build -o /out/api ./cmd/api
EXPOSE 8000
ENTRYPOINT ["/out/api"]
`;

export const COMPOSE_IMAGES: TerminalImage[] = [
  {
    name: 'postgres:17', size: 438_000_000, created: '2026-11-08 08:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'], env: [PATH_ENV, 'PGDATA=/var/lib/postgresql/data'], expose: [5432],
    service: true, layers: 5, pulled: true, osRelease: DEBIAN, volumes: ['/var/lib/postgresql/data'], ready: 4, commands: [...BASIC, 'pg_isready'],
    logs: ['LOG:  database system is ready to accept connections'],
    files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' }],
  },
  { name: 'redis:7.4', size: 117_000_000, created: '2026-11-01 10:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['redis-server'], expose: [6379], service: true, layers: 4, osRelease: DEBIAN, logs: ['* Ready to accept connections tcp'] },
  {
    name: 'python:3.12-slim', size: 124_000_000, created: '2026-11-10 10:00:00', cmd: ['python3'], env: [PATH_ENV, 'PYTHON_VERSION=3.12.7'], layers: 4, pulled: true, osRelease: DEBIAN,
    commands: [...BASIC, 'curl'], output: 'Python 3.12.7\n',
  },
  {
    name: 'golang:1.23', size: 823_000_000, created: '2026-11-06 10:00:00', cmd: ['bash'], env: [PATH_ENV, 'GOLANG_VERSION=1.23.3'], workdir: '/go', layers: 6, pulled: true, osRelease: DEBIAN,
    commands: [...BASIC, 'go'],
  },
  { name: 'gcr.io/distroless/static-debian12:latest', size: 2_000_000, created: '2026-10-01 00:00:00', cmd: [], layers: 2, pulled: true, osRelease: DEBIAN, commands: [] },
  { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' },
  {
    name: 'registry.example.com:5000/team/web:1.0', size: 40_000_000, created: '2026-11-15 10:00:00', cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 3, osRelease: DEBIAN,
    http: { port: 80, responder: 'web', accessLog: 'nginx' }, tags: ['latest'], logs: ['web 1.0 ready'],
  },
];

export const composeLab: TerminalMachine = {
  id: 'cmp-01', title: 'cmp-01（Docker 與 Compose 主機）', user: 'learner', cwd: '/home/learner', host: 'cmp-01', profile: 'compose',
  files: [dir('/home'), dir('/home/learner'), dir('/home/learner/shop'), file('/home/learner/shop/compose.yaml', COMPOSE_YAML),
    file('/home/learner/shop/Dockerfile', 'FROM python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nCMD ["python", "app.py"]\n'), file('/home/learner/shop/app.py', 'print("shop")\n'),
    dir('/home/learner/api'), file('/home/learner/api/go.mod', 'module example.com/api\n\ngo 1.23\n'), dir('/home/learner/api/cmd'), dir('/home/learner/api/cmd/api'),
    file('/home/learner/api/cmd/api/main.go', 'package main\n\nfunc main() {}\n'), file('/home/learner/api/Dockerfile', API_DOCKERFILE), file('/home/learner/api/Dockerfile.single', API_SINGLE),
    file('/home/learner/ci-token.txt', `${CI_TOKEN}\n`, 'learner', 0o600), file('/home/learner/ghcr-token.txt', 'fake-ghcr-token-0003\n', 'learner', 0o600),
    file('/etc/resolv.conf', 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n', 'root')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  responders: [
    { id: 'shop-api', server: 'gunicorn', routes: [{ path: '/', body: 'shop\n', type: 'text/plain' }, { path: '/health', body: 'ok\n', type: 'text/plain' }] },
    { id: 'go-api', server: 'go', routes: [{ path: '/', body: 'api\n', type: 'text/plain' }] },
    { id: 'web', server: 'nginx/1.27.3', routes: [{ path: '/', body: 'web 1.0\n', type: 'text/html' }] },
  ],
  docker: {
    images: COMPOSE_IMAGES,
    programs: [
      { command: ['python', 'app.py'], needs: ['app.py'], service: true, http: { port: 8000, responder: 'shop-api' }, logs: ['Listening at: http://0.0.0.0:8000'], ready: 2 },
      { command: ['/api'], needs: ['/api'], service: true, http: { port: 8000, responder: 'go-api' }, logs: ['api listening on :8000'] },
      { command: ['/out/api'], needs: ['/out/api'], service: true, http: { port: 8000, responder: 'go-api' }, logs: ['api listening on :8000'] },
    ],
    tools: [{ command: ['go', 'build', '-o', '/out/api', './cmd/api'], needs: ['go.mod', 'cmd/api/main.go'], writes: [{ path: '/out/api', size: 8_400_000 }], seconds: 6.2 }],
    registries: [
      { host: 'registry.example.com:5000', users: [{ name: 'ci', token: CI_TOKEN, repos: ['team/*'] }, { name: 'reader', token: 'lesson-token-read-0002', push: false }] },
      { host: 'ghcr.example', users: [{ name: 'ci', token: 'fake-ghcr-token-0003' }], immutable: true },
    ],
  },
};

/** DKR09-like: start the whole project in the background; db must be healthy and app reachable. */
export const composeUpExercise: TerminalExercise = {
  id: 'compose-up', title: '一個指令啟動整個應用', machine: 'cmp-01',
  statement: '在 ~/shop 以 Compose 在背景啟動整個專案。',
  checks: [{ kind: 'compose', project: 'shop', service: 'db', state: 'running', health: 'healthy' }, { kind: 'compose', project: 'shop', service: 'app', state: 'running' },
    { kind: 'http', url: 'http://localhost:8080/', status: 200, body: 'shop' }],
  solution: ['cd shop', 'docker compose up -d'],
  mistakes: [
    { commands: ['cd shop', 'docker compose up -d db'], why: '只啟動了 db' },
    { commands: ['cd shop', 'docker compose up -d', 'docker compose down'], why: '又把整個專案移除了' },
  ],
  hints: ['docker compose up -d'], explanation: 'up 依 depends_on 的順序建立並啟動服務，service_healthy 會等 db 的健康檢查通過。',
};
/** DKR11-like: tag the built image and push it to the private registry. */
export const pushExercise: TerminalExercise = {
  id: 'push-api', title: '推送到私有 Registry', machine: 'cmp-01',
  statement: '把 ~/api 建置成 registry.example.com:5000/team/api:1.0，登入（使用者 ci，Token 在 ~/ci-token.txt）並推送。',
  checks: [{ kind: 'registry', registry: 'registry.example.com:5000', repository: 'team/api', tag: '1.0', image: 'registry.example.com:5000/team/api:1.0' }],
  solution: ['docker build -t registry.example.com:5000/team/api:1.0 api', 'cat ci-token.txt | docker login registry.example.com:5000 -u ci --password-stdin', 'docker push registry.example.com:5000/team/api:1.0'],
  mistakes: [
    { commands: ['docker build -t registry.example.com:5000/team/api:1.0 api', 'docker push registry.example.com:5000/team/api:1.0'], why: '沒有登入' },
    { commands: ['docker build -t team/api:1.0 api', 'cat ci-token.txt | docker login registry.example.com:5000 -u ci --password-stdin', 'docker push team/api:1.0'], why: '名稱沒有 Registry 的位址，推到 Docker Hub 被拒' },
  ],
  hints: ['docker login 位址 -u ci --password-stdin'], explanation: 'Image 的名稱決定推到哪個 Registry。',
};
