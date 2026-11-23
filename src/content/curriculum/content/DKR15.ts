/*
 * DKR15 Docker Containers Capstone: Containerize and Ship (DKR-6, challenge-stages). The island's capstone on the runtime
 * profile (engine stage E24, which includes E20–E23): a used-book shop's three-tier app (an nginx web front, a Go API built
 * from source, postgres) that has run from the owner's laptop with hand-typed docker run commands, taken from source to a
 * production-ready, versioned image set in six stages, each a terminal exercise checked on the machines: (1) on dev-01, the
 * laptop-era single-stage Dockerfile (golang:1.23, root, shell-form CMD, the payment key through ARG and ENV) rewritten as two
 * stages (distroless static, USER nonroot, exec-form CMD, 11.2 MB) and smoke-tested with the key mounted read-only, docker stop
 * ending it with 0 (DKR05, DKR10, DKR14); (2) a teammate's compose.yaml fixed: a named volume, a pg_isready health check and
 * depends_on condition service_healthy (DKR07–DKR09); (3) on the laptop, the build step that baked the key into 1.3.0 read from
 * docker history (an output check with variants), then the old container and image removed and 1.4.0 run with the rotated
 * key as a read-only file (DKR06, DKR12); (4) on ci-01, SemVer and commit tags pushed to a lesson registry with an obviously
 * fake token through --password-stdin, no latest (DKR11); (5) on prod-01, the release pulled with a pull-only account and run
 * by digest with --read-only and a tmpfs, --cap-drop ALL, no-new-privileges, memory and CPU limits, unless-stopped and a
 * loopback-only port (DKR11, DKR12, DKR14); (6) on prod-02, the go-live checklist finds an OOM restart loop: a teammate ran
 * the API by hand with the tag and -m 64m after reading docker stats right after a start; found with the DKR13 method and
 * fixed by redeploying with the reviewed script (DKR13, DKR14). The shop, hosts, users, registry, keys and tokens are made up
 * (credentials contain demo or lesson). Engine notes: a declared container cannot name its image by digest, so prod-02's
 * container shows the tag (which is also the planted drift); a declared image runs its own main process (no needs check),
 * so stage 5 checks the key mount through docker ps's MOUNTS column; the registry's 1.4.0 is declared data, so its digest
 * differs from the learner's stage 4 push (the text says so); the engine records an ARG without a value as `|1 KEY=` in a RUN
 * row, which the transcripts avoid showing. Production runs the API only: the host's nginx (the server island's) serves the
 * front and proxies /api/ to 127.0.0.1:8000, and the database is on db-01. Every transcript output was produced by replaying
 * it on the engine.
 */
import type { TerminalExercise, TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalContainer, TerminalDocker, TerminalImage, TerminalProgram, TerminalRegistry, TerminalRuntime } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const MIB = 1024 * 1024;
const dir = (path: string, owner = 'hana', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'hana', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const HOME = '/home/hana';
const SHELF = `${HOME}/shelf`;
const CLOCK = { now: '2026-11-23 10:00:00', boot: '2026-11-23 07:30:00' };

// ---- base images (as DKR10 and DKR09 declare them) ---------------------------------------------------------------------
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const DISTROLESS = 'PRETTY_NAME="Distroless"\nNAME="Debian GNU/Linux"\nID="debian"\nVERSION_ID="12"\nVERSION="Debian GNU/Linux 12 (bookworm)"\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami', 'chmod', 'chown'];
const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const GO_PATH = 'PATH=/go/bin:/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const GO_ENV = [GO_PATH, 'GOLANG_VERSION=1.23.3', 'GOTOOLCHAIN=local', 'GOPATH=/go'];
const GCC = 239_000_000;
const GOLANG_HISTORY: NonNullable<TerminalImage['history']> = [
  { createdBy: '# debian.sh --arch \'amd64\' out/ \'bookworm\' \'@1731283200\'', size: 117_000_000 },
  { createdBy: 'CMD ["bash"]' },
  { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   ca-certificates   curl   gnupg   netbase   wget  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: 24_000_000 },
  { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   git   mercurial   openssh-client   subversion   procps  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: 64_400_000 },
  { createdBy: 'RUN /bin/sh -c set -eux;  apt-get update;  apt-get install -y --no-install-recommends   g++   gcc   libc6-dev   make   pkg-config  ;  rm -rf /var/lib/apt/lists/* # buildkit', size: GCC },
  { createdBy: 'ENV GOLANG_VERSION=1.23.3' },
  { createdBy: 'ENV GOTOOLCHAIN=local' },
  { createdBy: 'ENV GOPATH=/go' },
  { createdBy: `ENV ${GO_PATH}` },
  { createdBy: 'COPY /target/ / # buildkit', size: 389_000_000 },
  { createdBy: 'RUN /bin/sh -c mkdir -p "$GOPATH/src" "$GOPATH/bin" && chmod -R 1777 "$GOPATH" # buildkit', size: 0, layer: true },
  { createdBy: 'WORKDIR /go', size: 0, layer: true },
];
const GOLANG_SIZE = 117_000_000 + 24_000_000 + 64_400_000 + GCC + 389_000_000;
const GOLANG: TerminalImage = {
  name: 'golang:1.23', size: GOLANG_SIZE, created: '2026-11-07 02:00:00', cmd: ['bash'], workdir: '/go', pulled: true, osRelease: DEBIAN,
  env: GO_ENV, commands: [...BASIC, 'go'],
  files: [{ path: '/usr/local/go/bin/go', content: '' }, { path: '/usr/local/go/bin/gofmt', content: '' }, { path: '/usr/bin/gcc', content: '' }],
  history: GOLANG_HISTORY,
};
const STATIC: TerminalImage = {
  name: 'gcr.io/distroless/static-debian12:latest', size: 1_990_000, created: '2026-10-01 00:00:00', cmd: [], pulled: true, osRelease: DISTROLESS, commands: [], layers: 1,
  files: [
    { path: '/etc/passwd', content: 'root:x:0:0:root:/root:/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/sbin/nologin\nnonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin\n' },
    { path: '/etc/group', content: 'root:x:0:\nnobody:x:65534:\nnonroot:x:65532:\n' },
  ],
};
const POSTGRES: TerminalImage = {
  name: 'postgres:17', size: 438_200_000, created: '2026-11-08 08:00:00', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'],
  env: [PATH_ENV, 'PG_MAJOR=17', 'PGDATA=/var/lib/postgresql/data'], expose: [5432], service: true, layers: 5, pulled: true, osRelease: DEBIAN,
  volumes: ['/var/lib/postgresql/data'], ready: 4, commands: [...BASIC, 'pg_isready'],
  logs: ['LOG:  database system is ready to accept connections'],
  files: [{ path: '/etc/passwd', content: 'root:x:0:0:root:/root:/bin/bash\npostgres:x:999:999::/var/lib/postgresql:/bin/bash\n' }, { path: '/etc/group', content: 'root:x:0:\npostgres:x:999:\n' }],
};
const NGINX: TerminalImage = {
  name: 'nginx:1.27', size: 192_000_000, created: '2026-11-10 08:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 7, pulled: true,
  osRelease: DEBIAN, http: { port: 80, responder: 'shelf-web', accessLog: 'nginx' }, commands: BASIC, stopSignal: 'SIGQUIT',
  logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up', '2026/11/23 10:00:00 [notice] 1#1: start worker processes'],
  memory: { start: 9_437_184 }, pids: 3,
  signals: { QUIT: { seconds: 1, logs: ['2026/11/23 10:00:00 [notice] 1#1: gracefully shutting down'], exit: 0 }, TERM: { exit: 0 } },
};

// ---- the shelf app: the API (Go), the web front (nginx), postgres ---------------------------------------------------------
const VERSION = '1.4.0', COMMIT = '9c2e4b1';
const KEY_PATH = '/run/secrets/payment_api_key';
const GO_MOD = 'module example.com/shelf\n\ngo 1.23\n';
const MAIN_GO = `package main

import (
\t"context"
\t"log"
\t"net/http"
\t"os"
\t"os/signal"
\t"syscall"
\t"time"
)

const version = "${VERSION}"

func main() {
\tlog.SetFlags(0)
\tlog.SetPrefix("shelf-api: ")
\tdbURL := os.Getenv("DATABASE_URL")
\tif dbURL == "" {
\t\tlog.Fatal("DATABASE_URL is not set")
\t}
\t// since 1.4.0 the payment key is a file mounted at run time, never part of the image
\tkey, err := os.ReadFile("${KEY_PATH}")
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tif err := os.MkdirAll("/tmp/shelf-api", 0o700); err != nil {
\t\tlog.Fatal(err)
\t}
\tsrv := &http.Server{Addr: ":8000", Handler: routes(dbURL, key)}
\tgo func() {
\t\tlog.Printf("version %s listening on %s", version, srv.Addr)
\t\tif err := srv.ListenAndServe(); err != http.ErrServerClosed {
\t\t\tlog.Fatal(err)
\t\t}
\t}()
\tstop := make(chan os.Signal, 1)
\tsignal.Notify(stop, syscall.SIGTERM, os.Interrupt)
\t<-stop
\tlog.Print("SIGTERM received, finishing in-flight requests")
\tctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
\tdefer cancel()
\tsrv.Shutdown(ctx)
\tlog.Print("shutdown complete")
}
`;
const ROUTES_GO = `package main

import "net/http"

func routes(dbURL string, paymentKey []byte) http.Handler {
\tmux := http.NewServeMux()
\tmux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\\n")) })
\tmux.Handle("GET /api/books", listBooks(dbURL))
\tmux.Handle("POST /api/orders", createOrder(dbURL, paymentKey))
\treturn mux
}
`;
/** The laptop-era Dockerfile: one stage on the full Go image, root, the key baked in through ARG and ENV, shell-form CMD. */
const OLD_DOCKERFILE = 'FROM golang:1.23\nARG PAYMENT_API_KEY\nENV PAYMENT_API_KEY=$PAYMENT_API_KEY\nWORKDIR /src\nCOPY . .\nRUN go build -o /out/api ./cmd/api\nEXPOSE 8000\nCMD /out/api\n';
/** Stage 1's answer: two stages, distroless, nonroot, exec form, no secret. */
const MULTI = 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY go.mod ./\nCOPY cmd ./cmd\nENV CGO_ENABLED=0\nRUN go build -o /out/api ./cmd/api\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/api /api\nUSER nonroot\nEXPOSE 8000\nCMD ["/api"]\n';
const WEB_DOCKERFILE = 'FROM nginx:1.27\nCOPY site/ /usr/share/nginx/html/\n';
const INDEX_HTML = '<!doctype html>\n<html lang="zh-Hant">\n<head><meta charset="utf-8"><title>拾光書屋</title></head>\n<body><h1>拾光書屋｜二手書線上目錄</h1><script src="/app.js"></script></body>\n</html>\n';
const APP_JS = "fetch('/api/books').then(r => r.json()).then(books => console.log(books.length));\n";
const DEV_KEY = 'demo-payments-key-lesson-dev\n';

const repoFiles = (dockerfile: string, extra: TerminalFile[] = []): TerminalFile[] => [
  dir(SHELF), dir(`${SHELF}/api`), file(`${SHELF}/api/Dockerfile`, dockerfile), file(`${SHELF}/api/go.mod`, GO_MOD),
  dir(`${SHELF}/api/cmd`), dir(`${SHELF}/api/cmd/api`), file(`${SHELF}/api/cmd/api/main.go`, MAIN_GO), file(`${SHELF}/api/cmd/api/routes.go`, ROUTES_GO),
  dir(`${SHELF}/web`), file(`${SHELF}/web/Dockerfile`, WEB_DOCKERFILE), dir(`${SHELF}/web/site`), file(`${SHELF}/web/site/index.html`, INDEX_HTML), file(`${SHELF}/web/site/app.js`, APP_JS),
  dir(`${SHELF}/secrets`, 'hana', 0o700), file(`${SHELF}/secrets/payment_api_key.dev`, DEV_KEY),
  ...extra,
];

const RESPONDERS = [
  { id: 'shelf-api', server: 'shelf-api', routes: [
    { path: '/healthz', body: 'ok\n', type: 'text/plain; charset=utf-8' },
    { path: '/api/books', body: '[{"id":101,"title":"城南舊事","price":180},{"id":102,"title":"小王子","price":120}]\n', type: 'application/json' },
    { path: '/', body: `{"service":"shelf-api","version":"${VERSION}"}\n`, type: 'application/json' },
  ] },
  { id: 'shelf-api-13', server: 'shelf-api', routes: [
    { path: '/healthz', body: 'ok\n', type: 'text/plain; charset=utf-8' },
    { path: '/', body: '{"service":"shelf-api","version":"1.3.0"}\n', type: 'application/json' },
  ] },
  { id: 'shelf-web', server: 'nginx/1.27.3', routes: [{ path: '/', body: INDEX_HTML, type: 'text/html' }] },
];

/** What the API (1.4.0) does in a container: lesson data, the simulation does not run Go. */
const API_RUNTIME: TerminalRuntime = {
  needsEnv: ['DATABASE_URL'], missingEnv: { output: 'shelf-api: DATABASE_URL is not set', exit: 1 },
  writes: ['/tmp/shelf-api'], readOnlyError: { output: 'shelf-api: mkdir /tmp/shelf-api: read-only file system', exit: 1 },
  signals: { TERM: { seconds: 2, logs: ['shelf-api: SIGTERM received, finishing in-flight requests', 'shelf-api: shutdown complete'], exit: 0 } },
  // The catalog cache fills after the start: 24 MiB, 8 MiB more a second, level at 96 MiB.
  memory: { start: 24 * MIB, growth: 8 * MIB, max: 96 * MIB }, cpu: 3, pids: 7,
};
const API_LOG = `shelf-api: version ${VERSION} listening on :8000`;
const API_PROGRAM: TerminalProgram = {
  command: ['/api'], needs: ['/api', KEY_PATH], missing: { output: `shelf-api: open ${KEY_PATH}: no such file or directory`, exit: 1 },
  service: true, http: { port: 8000, responder: 'shelf-api' }, logs: [API_LOG], ...API_RUNTIME,
};
const GO_BUILD = { command: ['go', 'build', '-o', '/out/api', './cmd/api'], needs: ['go.mod', 'cmd/api/main.go'], writes: [{ path: '/out/api', size: 9_200_000, mode: 0o755 }], seconds: 6.8 };

const ACCOUNTS = { groups: [{ name: 'sudo', members: ['hana'] }, { name: 'docker', gid: 988, members: ['hana'] }] };
const host = (id: string, title: string, hostName: string, files: TerminalFile[], docker: TerminalDocker, extra: Partial<TerminalMachine> = {}): TerminalMachine => ({
  id, title, user: 'hana', host: hostName, cwd: HOME, profile: 'runtime', cpus: 2, ...CLOCK,
  files: [dir('/home', 'root'), dir(HOME, 'hana', 0o750), ...files],
  accounts: ACCOUNTS, responders: RESPONDERS, docker, ...extra,
});

// ---- stage 1: dev-01, the repository with the laptop-era Dockerfile ------------------------------------------------------
// The single-stage build's own path (/out/api) runs the same program.
const DEV_DOCKER: TerminalDocker = { images: [GOLANG, STATIC, POSTGRES, NGINX], programs: [API_PROGRAM, { ...API_PROGRAM, command: ['/out/api'], needs: ['/out/api', KEY_PATH] }], tools: [GO_BUILD] };
const buildStage = host('dkr15-build', 'dev-01（API 還是筆電時代的單一階段 Dockerfile）', 'dev-01', repoFiles(OLD_DOCKERFILE), DEV_DOCKER);

// ---- stage 2: dev-01, the Compose file a teammate wrote from the laptop's commands --------------------------------------
const COMPOSE_DRAFT = `services:
  web:
    build: ./web
    ports:
      - "8080:80"
    depends_on:
      - api
  api:
    build: ./api
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://shelf:lesson-dev-pw@db:5432/shelf
    volumes:
      - ./secrets/payment_api_key.dev:${KEY_PATH}:ro
    depends_on:
      - db
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: shelf
      POSTGRES_PASSWORD: lesson-dev-pw
      POSTGRES_DB: shelf
`;
const composeStage = host('dkr15-compose', 'dev-01（多階段 Dockerfile 完成；同事寫的 compose.yaml）', 'dev-01',
  repoFiles(MULTI, [file(`${SHELF}/compose.yaml`, COMPOSE_DRAFT)]), DEV_DOCKER);

// ---- stage 3: shelf-nb, the laptop that serves the shop today with hand-typed docker run commands -------------------------
const LAPTOP_KEY = 'demo-payments-key-lesson-laptop-7f3a';
const ROTATED_KEY = 'demo-payments-key-lesson-rotated-2b8e\n';
const OLD_SIZE = GOLANG_SIZE + 1_448 + 9_200_000;
/** 1.3.0 as hana built it on the laptop from OLD_DOCKERFILE with --build-arg PAYMENT_API_KEY=… (its history is that build's). */
const oldApi = (key: string): TerminalImage => ({
  name: 'shelf-api:1.3.0', size: OLD_SIZE, created: '2026-10-30 21:40:00', registry: false, pulled: true, osRelease: DEBIAN,
  cmd: ['/bin/sh', '-c', '/out/api'], env: [...GO_ENV, `PAYMENT_API_KEY=${key}`], workdir: '/src', expose: [8000], commands: [...BASIC, 'go'],
  files: [{ path: '/src/go.mod', content: GO_MOD }, { path: '/out/api', content: '' }],
  history: [...GOLANG_HISTORY,
    { createdBy: 'ARG PAYMENT_API_KEY' },
    { createdBy: `ENV PAYMENT_API_KEY=${key}` },
    { createdBy: 'WORKDIR /src', size: 0, layer: true },
    { createdBy: 'COPY . . # buildkit', size: 1_448 },
    { createdBy: `RUN |1 PAYMENT_API_KEY=${key} /bin/sh -c go build -o /out/api ./cmd/api # buildkit`, size: 9_200_000 },
    { createdBy: 'EXPOSE map[8000/tcp:{}]' },
    { createdBy: 'CMD ["/bin/sh" "-c" "/out/api"]' },
  ],
  service: true, http: { port: 8000, responder: 'shelf-api-13' }, logs: ['shelf-api 1.3.0 listening on :8000'], memory: { start: 21 * MIB }, cpu: 2, pids: 8,
});
const LAPTOP_DB_URL = 'postgres://shelf:lesson-dev-pw@172.17.0.2:5432/shelf';
const laptopDocker = (key: string): TerminalDocker => ({
  images: [GOLANG, STATIC, POSTGRES, NGINX, oldApi(key)], programs: [API_PROGRAM], tools: [GO_BUILD],
  containers: [
    { name: 'shelf-db', image: 'postgres:17', state: 'running', created: '2026-10-31 09:00:00', started: '2026-10-31 09:00:00', env: ['POSTGRES_USER=shelf', 'POSTGRES_PASSWORD=lesson-dev-pw', 'POSTGRES_DB=shelf'] },
    { name: 'shelf-api', image: 'shelf-api:1.3.0', state: 'running', created: '2026-10-31 09:01:00', started: '2026-10-31 09:01:00', ports: ['8000:8000'], env: [`DATABASE_URL=${LAPTOP_DB_URL}`] },
    { name: 'shelf-web', image: 'nginx:1.27', state: 'running', created: '2026-10-31 09:02:00', started: '2026-10-31 09:02:00', ports: ['8080:80'], volumes: [`${SHELF}/web/site:/usr/share/nginx/html:ro`] },
  ],
});
const RUN_NOTES = `# 拾光書屋：筆電上的啟動方式（hana，2026-10-31）
docker run -d --name shelf-db -e POSTGRES_USER=shelf -e POSTGRES_PASSWORD=lesson-dev-pw -e POSTGRES_DB=shelf postgres:17
docker build -t shelf-api:1.3.0 --build-arg PAYMENT_API_KEY=<金鑰> api
docker run -d --name shelf-api -p 8000:8000 -e DATABASE_URL=${LAPTOP_DB_URL} shelf-api:1.3.0
docker run -d --name shelf-web -p 8080:80 -v ~/shelf/web/site:/usr/share/nginx/html:ro nginx:1.27
`;
const laptopFiles: TerminalFile[] = [
  ...repoFiles(MULTI).filter(f => !f.path.startsWith(`${SHELF}/secrets`)), file(`${HOME}/run-notes.txt`, RUN_NOTES),
  dir(`${HOME}/secrets`, 'hana', 0o700), file(`${HOME}/secrets/payment_api_key`, ROTATED_KEY),
];
const secretStage = host('dkr15-secret', 'shelf-nb（目前服務顧客的筆電：手動 docker run 的三個容器）', 'shelf-nb', laptopFiles, laptopDocker(LAPTOP_KEY));
const OTHER_LAPTOP: TerminalVariant = { label: '另一次在筆電上建置的 1.3.0（另一把金鑰）', files: [], docker: laptopDocker('demo-payments-key-lesson-laptop-c41d') };

// ---- stage 4: ci-01 builds the release and pushes it to the team registry ---------------------------------------------------
const REG = 'registry.shelf.example';
const API_REPO = `${REG}/shelf/api`;
const CI_TOKEN = 'lesson-token-shelf-ci-01', DEPLOY_TOKEN = 'lesson-token-shelf-deploy-02';
const REGISTRY: TerminalRegistry = { host: REG, users: [{ name: 'ci', token: CI_TOKEN, repos: ['shelf/*'] }, { name: 'deploy', token: DEPLOY_TOKEN, push: false }] };
const RELEASE_ENV = `VERSION=${VERSION}\nCOMMIT=${COMMIT}\n`;
const ciStage = host('dkr15-release', 'ci-01（CI 主機：要發布 1.4.0）', 'ci-01', [
  ...repoFiles(MULTI).filter(f => !f.path.startsWith(`${SHELF}/secrets`)), file(`${SHELF}/release.env`, RELEASE_ENV),
  file(`${HOME}/ci-token.txt`, `${CI_TOKEN}\n`, 'hana', 0o600), file(`${HOME}/deploy-token.txt`, `${DEPLOY_TOKEN}\n`, 'hana', 0o600),
], { images: [GOLANG, STATIC], programs: [API_PROGRAM], tools: [GO_BUILD], registries: [REGISTRY] });

// ---- stages 5 and 6: the production hosts (the API only; the host's nginx serves the front and proxies /api/) ----------------
/** The release as ci-01 pushed it at 09:20 (lesson data: the registry's manifest of the same config as the stage 1 build). */
const release = (pulled: boolean): TerminalImage => ({
  name: `${API_REPO}:${VERSION}`, tags: [`sha-${COMMIT}`], size: 11_190_000, created: '2026-11-23 09:20:00', cmd: ['/api'], user: 'nonroot', expose: [8000], osRelease: DISTROLESS,
  commands: [], layers: 2, files: [...STATIC.files!, { path: '/api', content: '' }], ...pulled ? { pulled: true } : {},
  service: true, http: { port: 8000, responder: 'shelf-api' }, logs: [API_LOG], ...API_RUNTIME,
});
/** The digest of that manifest, as the engine computes it (docker pull prints it). */
const DIGEST = 'sha256:810a5ab9a8ab0ca2e4d7b52bd16a1bfc2f7e53ced7339ec80e8ef3dfce01dbb7';
const ALPINE: TerminalImage = {
  name: 'alpine:3.21', size: 7_834_520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1,
  osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n',
};
const SHIPPER: TerminalContainer = { name: 'log-shipper', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-23 08:00:00', started: '2026-11-23 08:00:00', restart: 'unless-stopped' };
const prodDocker = (pulled: boolean, containers: TerminalContainer[] = []): TerminalDocker => ({ images: [release(pulled), ALPINE], registries: [REGISTRY], containers });
const prodFiles = (extra: TerminalFile[] = []): TerminalFile[] => [
  file(`${HOME}/deploy-token.txt`, `${DEPLOY_TOKEN}\n`, 'hana', 0o600), dir(`${HOME}/secrets`, 'hana', 0o700), file(`${HOME}/secrets/payment_api_key`, ROTATED_KEY), ...extra,
];
const PROD_DB_URL = 'postgres://shelf@db-01.shelf.internal:5432/shelf';
const prodStage = host('dkr15-prod', 'prod-01（正式環境的 API 主機：還沒有部署）', 'prod-01', prodFiles(), prodDocker(false));
const PROD_SHIPPER: TerminalVariant = { label: '另一台正式主機：還執行著 log-shipper', files: [], docker: prodDocker(false, [SHIPPER]) };

const SECRET_MOUNT = `${HOME}/secrets/payment_api_key:${KEY_PATH}:ro`;
const PROD_FLAGS = '--restart unless-stopped --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -m 128m --cpus 0.5 -p 127.0.0.1:8000:8000';
const prodRun = (flags: string, ref: string, mount = ` -v ~/secrets/payment_api_key:${KEY_PATH}:ro`) => `docker run -d --name shelf-api ${flags} -e DATABASE_URL=${PROD_DB_URL}${mount} ${ref}`;
const DEPLOY_SCRIPT = `#!/bin/sh
# shelf-api 的正式部署：上線審查（2026-11-23）通過的設定。部署與修改都只透過這個指令稿。
set -e
docker rm -f shelf-api
docker run -d --name shelf-api --restart unless-stopped \\
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \\
  -m 128m --cpus 0.5 -p 127.0.0.1:8000:8000 \\
  -e DATABASE_URL=${PROD_DB_URL} \\
  -v ${SECRET_MOUNT} \\
  ${API_REPO}@${DIGEST}
`;
const CHECKLIST = `# 上線檢查清單（每台 API 主機：部署之後與每天早上）
1. docker ps：每個容器都是 Up，沒有 Restarting
2. docker inspect：以 digest 執行；記憶體、CPU、唯讀、拿掉的能力與重新啟動策略和 ~/deploy/shelf-api.sh 一致
3. docker stats --no-stream：記憶體穩定，低於上限的八成
4. docker logs --since 10m：沒有錯誤，也沒有反覆出現的啟動訊息
5. curl -s localhost:8000/healthz：回 ok
`;
// prod-02 joined on go-live day. ken started shelf-api by hand at 09:40: the tag instead of the digest and -m 64m, because docker
// stats showed 24 MiB right after a start. Every run fills the cache past 64 MiB in 5 seconds (an OOM restart loop since).
const manualApi: TerminalContainer = {
  name: 'shelf-api', image: `${API_REPO}:${VERSION}`, state: 'running', created: '2026-11-23 09:40:00', started: '2026-11-23 09:40:00', restart: 'unless-stopped',
  readOnly: true, tmpfs: ['/tmp'], capDrop: ['ALL'], securityOpt: ['no-new-privileges'], memory: '64m', cpus: 0.5, ports: ['127.0.0.1:8000:8000'],
  env: [`DATABASE_URL=${PROD_DB_URL}`], volumes: [SECRET_MOUNT],
};
const golive = (extra: TerminalContainer[] = []) => prodDocker(true, [manualApi, ...extra]);
const goliveStage = host('dkr15-golive', 'prod-02（上線當天加入的第二台 API 主機：ken 手動部署）', 'prod-02',
  prodFiles([dir(`${HOME}/deploy`), file(`${HOME}/deploy/shelf-api.sh`, DEPLOY_SCRIPT, 'hana', 0o755), file(`${HOME}/deploy/CHECKLIST.md`, CHECKLIST)]), golive());
const GOLIVE_SHIPPER: TerminalVariant = { label: '另一台正式主機：還執行著 log-shipper', files: [], docker: golive([SHIPPER]) };

// ---- the exercises' commands ---------------------------------------------------------------------------------------------
/** Writes a whole file in one command (printf turns each \n into a line break; the files have no % or single quote). */
const rewrite = (name: string, text: string) => `printf '${text.replace(/\n/g, '\\n')}' > ${name}`;
const SMOKE = `docker run -d --name smoke -e DATABASE_URL=postgres://shelf:lesson-dev-pw@db:5432/shelf -v ~/shelf/secrets/payment_api_key.dev:${KEY_PATH}:ro shelf-api:1.4.0`;
const stage1 = (dockerfile: string, run = SMOKE, stop = 'docker stop smoke') => ['cd ~/shelf/api', rewrite('Dockerfile', dockerfile), 'docker build -q -t shelf-api:1.4.0 .', run, 'docker logs smoke', stop];
const SHELL_FORM = MULTI.replace('CMD ["/api"]', 'CMD /api');
const NO_USER = MULTI.replace('USER nonroot\n', '');
const ONE_STAGE = 'FROM golang:1.23\nWORKDIR /src\nCOPY go.mod ./\nCOPY cmd ./cmd\nENV CGO_ENABLED=0\nRUN go build -o /out/api ./cmd/api\nEXPOSE 8000\nCMD ["/out/api"]\n';

const DEPENDS_SED = "sed -i 's/^      - db$/      db:\\n        condition: service_healthy/' compose.yaml";
const appendLines = (lines: string[]) => `printf '%s\\n' ${lines.map(l => `'${l}'`).join(' ')} >> compose.yaml`;
const VOLUME_LINES = ['    volumes:', '      - pgdata:/var/lib/postgresql/data'];
const HEALTH_LINES = ['    healthcheck:', '      test: ["CMD-SHELL", "pg_isready -U shelf -d shelf"]', '      interval: 5s', '      timeout: 3s', '      retries: 5'];
const TOP_VOLUMES = ['', 'volumes:', '  pgdata:'];
const COMPOSE_SOLUTION = ['cd ~/shelf', DEPENDS_SED, appendLines([...VOLUME_LINES, ...HEALTH_LINES, ...TOP_VOLUMES]), 'docker compose config -q', 'docker compose up -d', 'docker compose ps'];

const ENV_ROW = "docker history --no-trunc --format '{{.CreatedBy}}' shelf-api:1.3.0 | grep '^ENV PAYMENT'";
const LAPTOP_RUN = (secret: string) => `docker run -d --name shelf-api -p 8000:8000 -e DATABASE_URL=${LAPTOP_DB_URL} ${secret} shelf-api:1.4.0`;
const KEY_FILE = `-v ~/secrets/payment_api_key:${KEY_PATH}:ro`;
const ROTATE_SOLUTION = ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker rm -f shelf-api', 'docker rmi shelf-api:1.3.0', LAPTOP_RUN(KEY_FILE), 'curl -s localhost:8000/'];

const LOGIN_CI = `cat ~/ci-token.txt | docker login ${REG} -u ci --password-stdin`;
const BUILD_TAGS = `docker build -q -t ${API_REPO}:${VERSION} -t ${API_REPO}:sha-${COMMIT} api`;
const PUSH_SOLUTION = ['cd ~/shelf', 'cat release.env', BUILD_TAGS, LOGIN_CI, `docker push ${API_REPO}:${VERSION}`, `docker push ${API_REPO}:sha-${COMMIT}`];

const LOGIN_DEPLOY = `cat ~/deploy-token.txt | docker login ${REG} -u deploy --password-stdin`;
const PS_MOUNTS = "docker ps --format '{{.Names}} {{.Image}} {{.Mounts}}'";
const DEPLOY_SOLUTION = [LOGIN_DEPLOY, `docker pull ${API_REPO}:${VERSION}`, prodRun(PROD_FLAGS, `${API_REPO}@${DIGEST}`), 'curl -s localhost:8000/healthz', PS_MOUNTS];
const deployWith = (run: string) => [LOGIN_DEPLOY, `docker pull ${API_REPO}:${VERSION}`, run, 'curl -s localhost:8000/healthz', PS_MOUNTS];

const PS_IMAGES = "docker ps --format '{{.Names}} {{.Image}}'";
const INSPECT_API = "docker inspect -f '{{.State.OOMKilled}} {{.RestartCount}} {{.HostConfig.Memory}} {{.Config.Image}}' shelf-api";
const GOLIVE_SOLUTION = ['docker ps', 'docker logs --tail 3 shelf-api', INSPECT_API, 'cat deploy/shelf-api.sh', 'sh deploy/shelf-api.sh', 'sleep 15', 'docker stats --no-stream shelf-api', 'curl -s localhost:8000/healthz', PS_IMAGES];

const exercises: TerminalExercise[] = [
  {
    id: 'dkr15-x-image', title: '第一關：多階段、非 root、exec 形式的 API Image', machine: 'dkr15-build',
    statement: 'dev-01 的 `~/shelf/api` 是 API 的原始碼（Go），程式已經是 1.4.0：付款金鑰改從 `/run/secrets/payment_api_key` 這個檔案讀取。可是 `~/shelf/api/Dockerfile` 還是筆電時代的單一階段寫法。請把它改寫成兩個階段：(1) 名為 `build` 的階段以 `golang:1.23` 為基底，在 `/src` 先複製 `go.mod`、再複製 `cmd` 資料夾，設定 `ENV CGO_ENABLED=0`，再以 `go build -o /out/api ./cmd/api` 編譯；(2) 最後的階段以 `gcr.io/distroless/static-debian12` 為基底，只從 build 階段把 `/out/api` 複製成 `/api`，以 distroless 內建的帳號執行（`USER nonroot`），`EXPOSE 8000`，並用 exec 形式的 `CMD ["/api"]`；任何階段都不要有金鑰的 ARG 或 ENV。建置成 `shelf-api:1.4.0`（不能超過 20MB）。接著試跑一次：在背景執行名為 `smoke` 的容器，給它 `DATABASE_URL=postgres://shelf:lesson-dev-pw@db:5432/shelf`，並把 `~/shelf/secrets/payment_api_key.dev` 以唯讀方式掛載成容器裡的 `/run/secrets/payment_api_key`；看過日誌之後用 `docker stop smoke` 停止它，優雅關閉的程式應該以 0 結束。',
    checks: [
      { kind: 'image', name: 'shelf-api:1.4.0', user: 'nonroot', cmd: ['/api'], port: 8000, maxSize: 20_000_000 },
      { kind: 'container', name: 'smoke', state: 'exited', exitCode: 0, image: 'shelf-api:1.4.0' },
    ],
    solution: stage1(MULTI),
    mistakes: [
      { commands: stage1(SHELL_FORM),
        why: 'Shell 形式的 `CMD /api` 讓 Docker 以 `/bin/sh -c /api` 啟動，distroless 沒有 /bin/sh：容器啟動失敗（127），停在 Created，從來沒有執行過；就算基底有 sh，sh 當 PID 1 也不轉送 SIGTERM，docker stop 會等 10 秒再 SIGKILL。' },
      { commands: stage1(NO_USER),
        why: '少了 `USER nonroot`：Image 的 User 是空的，程式以容器裡的 root 執行。distroless 已經有 nonroot（UID 65532）這個帳號，只要一行就能讓程式被攻破時也拿不到 root。' },
      { commands: stage1(ONE_STAGE),
        why: '還是一個階段：CMD 是 /out/api 而不是題目要的 /api，最後的 Image 就是 golang:1.23 加上原始碼與執行檔，有 843MB（題目要 20MB 以下），編譯器、git 與它們的弱點都跟著上線；而且沒有 USER，仍以 root 執行。' },
      { commands: stage1(MULTI, SMOKE.replace(` -v ~/shelf/secrets/payment_api_key.dev:${KEY_PATH}:ro`, '')),
        why: '試跑時沒有掛載金鑰檔：1.4.0 讀不到 /run/secrets/payment_api_key，印出 no such file or directory 並以 1 結束，docker stop 停的是一個早就結束的容器。金鑰不在 Image 裡，所以每次執行都要提供。' },
      { commands: stage1(MULTI, SMOKE, 'docker kill smoke'),
        why: '`docker kill` 預設送 SIGKILL：程式沒有機會關閉監聽、做完手上的請求，結束碼是 137。上線與更新時要用 `docker stop`，讓 exec 形式的程式收到 SIGTERM 並在寬限期內以 0 結束。' },
    ],
    hints: [
      '整個檔案可以用一個 printf 寫出來：`printf \'FROM golang:1.23 AS build\\nWORKDIR /src\\n…\\n\' > Dockerfile`（每個 `\\n` 是一個換行）。',
      '第二個 FROM 開始新的階段；`COPY --from=build /out/api /api` 只帶走執行檔。',
      '`docker build -q -t shelf-api:1.4.0 .` 之後 `docker images shelf-api` 看大小，`docker image inspect -f \'{{.Config.User}} {{json .Config.Cmd}}\' shelf-api:1.4.0` 看使用者與 CMD。',
      '試跑：`docker run -d --name smoke -e DATABASE_URL=… -v ~/shelf/secrets/payment_api_key.dev:/run/secrets/payment_api_key:ro shelf-api:1.4.0`，`docker logs smoke`，再 `docker stop smoke` 與 `docker ps -a`。',
    ],
    explanation: '兩個階段把「建置需要的東西」和「執行需要的東西」分開：build 階段有 Go 工具鏈與原始碼，先複製 go.mod 再複製 cmd，改程式時前面的步驟仍可命中快取；最後的階段只有 distroless（約 2MB，沒有 Shell 與套件管理工具）加上 9.2MB 的靜態執行檔，所以 Image 是 11.2MB。`USER nonroot` 讓程式以 UID 65532 執行；exec 形式的 `CMD ["/api"]` 讓 /api 成為 PID 1，docker stop 的 SIGTERM 直接送到它，日誌依序印出 SIGTERM received 與 shutdown complete，約 2 秒後以 0 結束。金鑰與 DATABASE_URL 都不在 Image 裡，試跑時由 `-e` 與唯讀掛載提供；少了金鑰檔就是結束碼 1，用 docker kill 則是 137。',
  },
  {
    id: 'dkr15-x-compose', title: '第二關：Compose 開發環境', machine: 'dkr15-compose',
    statement: '同事把筆電上的三個 `docker run` 改寫成 `~/shelf/compose.yaml`（web、api、db 三個服務），但留下三個問題：db 沒有具名 Volume，資料只在容器裡；db 沒有健康檢查；api 的 `depends_on` 是簡短的清單，只等 db 的容器啟動。請修改 compose.yaml：(1) 把 api 的相依改成長格式，對 db 使用 `condition: service_healthy`；(2) 讓 db 把具名 Volume `pgdata` 掛在 `/var/lib/postgresql/data`，並在檔案最外層宣告 `volumes:` 裡的 `pgdata`；(3) 替 db 加上健康檢查 `["CMD-SHELL", "pg_isready -U shelf -d shelf"]`，每 5 秒一次、逾時 3 秒、重試 5 次。db 是檔案裡的最後一個服務，新的行可以用 `>>` 接在檔案最後。改好之後先 `docker compose config -q` 驗證，再用一個指令在背景啟動整個開發環境：db 必須是 healthy，三個服務都在執行，`http://localhost:8080/` 是網站首頁，`http://localhost:8000/healthz` 回 ok。',
    checks: [
      { kind: 'compose', project: 'shelf', service: 'db', state: 'running', health: 'healthy' },
      { kind: 'compose', project: 'shelf', service: 'api', state: 'running' },
      { kind: 'compose', project: 'shelf', service: 'web', state: 'running' },
      { kind: 'volume', name: 'shelf_pgdata' },
      { kind: 'http', url: 'http://localhost:8080/', status: 200, body: '拾光書屋' },
      { kind: 'http', url: 'http://localhost:8000/healthz', status: 200, body: 'ok' },
    ],
    solution: COMPOSE_SOLUTION,
    mistakes: [
      { commands: ['cd ~/shelf', appendLines([...VOLUME_LINES, ...HEALTH_LINES, ...TOP_VOLUMES]), 'docker compose up -d'],
        why: '加了 Volume 與健康檢查，但 api 的 depends_on 還是簡短的清單：up 只等 db 的容器啟動，不等健康檢查，結束時 db 還是 health: starting，api 已經在 postgres 能接受連線之前啟動了。' },
      { commands: ['cd ~/shelf', DEPENDS_SED, appendLines([...VOLUME_LINES, ...TOP_VOLUMES]), 'docker compose up -d'],
        why: 'api 要等 db 健康，db 卻沒有健康檢查：Compose 回報 dependency failed to start: container shelf-db-1 has no healthcheck configured，api 與 web 都沒有啟動。' },
      { commands: ['cd ~/shelf', DEPENDS_SED, appendLines([...VOLUME_LINES, ...HEALTH_LINES]), 'docker compose up -d'],
        why: 'db 掛了 pgdata，但檔案最外層沒有宣告它：service "db" refers to undefined volume pgdata: invalid compose project，什麼也沒有啟動。' },
      { commands: ['cd ~/shelf', DEPENDS_SED, appendLines(HEALTH_LINES), 'docker compose up -d'],
        why: '沒有具名 Volume：postgres Image 的 VOLUME 讓資料放在以雜湊命名的匿名 Volume，`docker compose down` 之後再 up，新的容器拿到新的匿名 Volume，開發用的資料就像不見了。' },
    ],
    hints: [
      '`grep -n -A 1 depends_on compose.yaml` 看清楚要改的是第幾行；`docker compose config` 會印出 Compose 理解後的設定。',
      'sed 的取代字串可以用 `\\n` 換行：`sed -i \'s/^      - db$/      db:\\n        condition: service_healthy/\' compose.yaml`（web 的 `- api` 不受影響）。',
      '`printf \'%s\\n\' \'    volumes:\' \'      - pgdata:/var/lib/postgresql/data\' \'    healthcheck:\' … \'\' \'volumes:\' \'  pgdata:\' >> compose.yaml`：每個單引號括起來的字是一行，注意縮排。',
      '`docker compose config -q` 沒有輸出才 `docker compose up -d`，再用 `docker compose ps` 確認 db 是 (healthy)。',
    ],
    explanation: '長格式的 `db: {condition: service_healthy}` 讓 `docker compose up -d` 先建置 api 與 web、建立網路與 shelf_pgdata，啟動 db 之後停在 Waiting，等 pg_isready 第一次成功（postgres 約 4 秒後接受連線，第一次探測在 5 秒）才印出 Healthy 並啟動 api 與 web。簡短的清單只等容器啟動；沒有健康檢查時 service_healthy 無從等起；Volume 必須在最外層宣告；不宣告具名 Volume，資料會落在匿名 Volume，down 再 up 就換了一個。開發環境的 api 一樣從唯讀掛載的開發用金鑰檔讀金鑰，DATABASE_URL 以服務名稱 db 連線，和正式環境只差在值。',
  },
  {
    id: 'dkr15-x-leak', title: '第三關之一：找出把金鑰放進 Image 的那一步', machine: 'dkr15-secret',
    statement: 'shelf-nb 是目前服務顧客的筆電，執行中的 shelf-api 是 10 月底在這台筆電上建置的 1.3.0，`docker exec shelf-api env` 看得到付款金鑰：它被包進了 Image。金鑰已經請付款服務商撤銷，換發的新金鑰在 `~/secrets/payment_api_key`。事故報告要寫出金鑰是在哪一個建置步驟進入 Image 的，可是 `~/shelf/api/Dockerfile` 已經換成新的寫法，看不出當時怎麼建置。請從 shelf-api:1.3.0 本身取得證據：以 `docker history --no-trunc --format \'{{.CreatedBy}}\'` 讀它的歷史，只印出「把金鑰設成環境變數」的那一列（完整的一列，可以接 `| grep` 篩選）。',
    checks: [{ kind: 'output', fromCommand: '^docker (image )?history ' }],
    solution: [ENV_ROW],
    variants: [OTHER_LAPTOP],
    mistakes: [
      { commands: ['grep PAYMENT ~/shelf/api/Dockerfile'],
        why: '現在的 Dockerfile 已經是多階段的新寫法，沒有任何 PAYMENT 的字；就算是當時的 Dockerfile，也只寫著 `$PAYMENT_API_KEY` 這個變數，值是建置時以 --build-arg 傳進去的。證據要從 Image 本身取得。' },
      { commands: ["docker history shelf-api:1.3.0 | grep 'ENV PAYMENT'"],
        why: '沒有 --no-trunc：CREATED BY 被截成 45 個字，印出的是表格的一列（ID、時間、截斷的指令、大小），不是完整的那一步。' },
      { commands: ["docker history --no-trunc --format '{{.CreatedBy}}' shelf-api:1.3.0 | grep PAYMENT"],
        why: 'PAYMENT 出現在三列：ARG 那一列、ENV 那一列，以及之後的 RUN（BuildKit 把當時的建置參數記成 `RUN |1 PAYMENT_API_KEY=…`）。題目只要設成環境變數的那一步。' },
      { commands: ['docker exec shelf-api env | grep PAYMENT'],
        why: '這證明執行中的容器有這個環境變數，卻說不出它是哪一步、怎麼進入 Image 的；而且題目要的是 Image 的歷史。' },
    ],
    hints: [
      '`docker history --no-trunc --format \'{{.CreatedBy}}\' shelf-api:1.3.0` 由新到舊列出每一步的完整指令。',
      'ENV 那一列以 `ENV ` 開頭；`grep \'^ENV PAYMENT\'` 只留下以它開頭的列。',
    ],
    explanation: '`docker history` 是 Image 自己帶著的建置紀錄：ARG 那一列只有名稱，ENV 那一列把 `$PAYMENT_API_KEY` 代換成建置時的值，之後的 RUN 也以 `|1 PAYMENT_API_KEY=…` 記下建置參數，所以任何拉得到這個 Image 的人都讀得到金鑰。`--no-trunc` 印出完整的指令，`grep \'^ENV PAYMENT\'` 只留下設定環境變數的那一步。讀 Dockerfile 看不到值；不加 --no-trunc 會截斷；只篩 PAYMENT 會連 ARG 與 RUN 一起印出；容器的 env 只證明它存在。這一列就是事故報告的證據：金鑰在 10 月底的建置進入 Image，之後每個拿到這個 Image 的人都有它。',
  },
  {
    id: 'dkr15-x-rotate', title: '第三關之二：移除舊 Image，金鑰改在執行時提供', machine: 'dkr15-secret',
    statement: '接著把筆電上的 API 換成不含金鑰的 1.4.0：(1) 在 `~/shelf` 以目前的 `api/Dockerfile` 建置 `shelf-api:1.4.0`；(2) 刪除舊的 shelf-api 容器與 `shelf-api:1.3.0` 這個 Image；(3) 以同樣的名稱 shelf-api 在背景執行 1.4.0：主機的 8000 對應容器的 8000，`DATABASE_URL` 沿用筆電上的值（見 `~/run-notes.txt`），新的金鑰 `~/secrets/payment_api_key` 以唯讀方式掛載成容器裡的 `/run/secrets/payment_api_key`。完成後 `curl -s localhost:8000/` 應該回報 1.4.0。shelf-db 與 shelf-web 不要動。',
    checks: [
      { kind: 'image', name: 'shelf-api:1.3.0', absent: true },
      // The old image itself (by its ID), so an untagged copy left by `docker rmi -f` on a running container does not pass.
      { kind: 'image', name: 'sha256:a5b7839c0c0d0bfaa48708f18794234c7f94b3624f514a2378e8672f843cb17f', absent: true },
      { kind: 'container', name: 'shelf-api', state: 'running', image: 'shelf-api:1.4.0', port: '8000:8000', env: `DATABASE_URL=${LAPTOP_DB_URL}` },
      { kind: 'http', url: 'http://localhost:8000/', status: 200, body: '"version":"1.4.0"' },
      { kind: 'container', name: 'shelf-db', state: 'running' },
      { kind: 'container', name: 'shelf-web', state: 'running' },
    ],
    solution: ROTATE_SOLUTION,
    mistakes: [
      { commands: ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker rmi shelf-api:1.3.0', 'docker rm -f shelf-api', LAPTOP_RUN(KEY_FILE), 'curl -s localhost:8000/'],
        why: '先刪 Image 時舊容器還在使用它：conflict: unable to remove repository reference，之後只刪了容器，沒有再刪 Image。舊 Image 還在筆電上，`docker history` 照樣讀得到舊金鑰。' },
      { commands: ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker rm -f shelf-api', 'docker rmi shelf-api:1.3.0', LAPTOP_RUN('-e PAYMENT_API_KEY=$(cat ~/secrets/payment_api_key)'), 'curl -s localhost:8000/'],
        why: '把金鑰改成 `-e` 傳入：1.4.0 只從 /run/secrets/payment_api_key 讀金鑰，找不到檔案就以 1 結束；而且環境變數的值會出現在 docker inspect 的 Config.Env 裡。' },
      { commands: ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker rm -f shelf-api', LAPTOP_RUN(KEY_FILE), 'curl -s localhost:8000/'],
        why: '新的容器跑起來了，但沒有刪除 shelf-api:1.3.0：舊金鑰雖然已經撤銷，Image 留著就是讓下一個人以為「它還能用」，也讓任何能用 docker 的人讀到它。' },
      { commands: ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker stop shelf-api', 'docker rmi -f shelf-api:1.3.0', LAPTOP_RUN(KEY_FILE), 'curl -s localhost:8000/'],
        why: '只停止舊容器：rmi -f 刪掉了 Image，但停止的容器仍占用 shelf-api 這個名稱，新的容器因為 Conflict 沒有建立，8000 埠也沒有服務。要用 docker rm（-f）移除舊容器。' },
      { commands: ['cd ~/shelf', 'docker build -q -t shelf-api:1.4.0 api', 'docker rmi -f shelf-api:1.3.0', 'docker rm -f shelf-api', LAPTOP_RUN(KEY_FILE), 'curl -s localhost:8000/'],
        why: '舊容器還在執行時 `docker rmi -f` 只拿掉了標籤（Untagged）：Image 本身與含金鑰的層還在，容器刪掉之後它成了沒有標籤的 <none>，`docker images -a` 與 `docker history` 照樣看得到。要先移除容器，再刪 Image。' },
    ],
    hints: [
      '`docker build -q -t shelf-api:1.4.0 api` 在 ~/shelf 建置新的 Image。',
      '有容器使用的 Image 刪不掉：先 `docker rm -f shelf-api`，再 `docker rmi shelf-api:1.3.0`。',
      '`docker run -d --name shelf-api -p 8000:8000 -e DATABASE_URL=… -v ~/secrets/payment_api_key:/run/secrets/payment_api_key:ro shelf-api:1.4.0`，DATABASE_URL 抄 ~/run-notes.txt 裡的那一段。',
    ],
    explanation: '撤銷金鑰是第一步（Image 可能早就被複製到別處），之後才是清理：先 `docker rm -f` 移除使用舊 Image 的容器，`docker rmi` 才刪得掉 shelf-api:1.3.0 與它獨有的層。1.4.0 的 Image 裡沒有金鑰，金鑰在執行時以唯讀的 bind mount 提供，主機上的檔案在 0700 的 ~/secrets 裡；docker inspect 只看得到掛載的路徑，看不到內容。順序錯了 rmi 會因為容器還在使用而失敗；改用 -e 傳金鑰，1.4.0 讀不到檔案而結束；只停止舊容器，名稱衝突讓新容器建立不起來。',
  },
  {
    id: 'dkr15-x-push', title: '第四關：版本標籤與私有 Registry', machine: 'dkr15-release',
    statement: `ci-01 是團隊的 CI 主機，\`~/shelf\` 是要發布的 commit，版本與 commit 寫在 \`~/shelf/release.env\`。團隊的私有 Registry 是 \`${REG}\`，API 的儲存庫是 \`shelf/api\`。請以 \`~/shelf/api\` 建置 API，給它兩個標籤：SemVer 的版本 \`${VERSION}\` 與 commit 標籤 \`sha-${COMMIT}\`；以有推送權限的帳號 ci 登入（Token 在 \`~/ci-token.txt\`，請用 \`--password-stdin\`），把兩個標籤都推送上去，兩者都要指向你剛建置的 Image。不要推送 latest。`,
    checks: [
      { kind: 'registry', registry: REG, repository: 'shelf/api', tag: VERSION, image: `${API_REPO}:${VERSION}` },
      { kind: 'registry', registry: REG, repository: 'shelf/api', tag: `sha-${COMMIT}`, image: `${API_REPO}:${VERSION}` },
      { kind: 'registry', registry: REG, repository: 'shelf/api', tag: 'latest', absent: true },
      { kind: 'image', name: `${API_REPO}:${VERSION}`, user: 'nonroot', maxSize: 20_000_000 },
    ],
    solution: PUSH_SOLUTION,
    mistakes: [
      { commands: ['cd ~/shelf', `docker build -q -t shelf/api:${VERSION} api`, LOGIN_CI, `docker push shelf/api:${VERSION}`],
        why: '名稱沒有 Registry 的位址：shelf/api 指的是 Docker Hub 的 docker.io/shelf/api，推送被拒絕（denied），私有 Registry 上什麼都沒有。推到哪裡只由名稱決定，登入哪個 Registry 不會改變它。' },
      { commands: ['cd ~/shelf', BUILD_TAGS, `docker push ${API_REPO}:${VERSION}`, `docker push ${API_REPO}:sha-${COMMIT}`],
        why: '沒有登入：Registry 不知道你是誰，兩次推送都是 unauthorized: authentication required。' },
      { commands: ['cd ~/shelf', BUILD_TAGS, `cat ~/deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, `docker push ${API_REPO}:${VERSION}`, `docker push ${API_REPO}:sha-${COMMIT}`],
        why: 'deploy 是正式環境用的、只能拉取的帳號：登入成功，推送是 denied。CI 推送用 ci，正式主機拉取用 deploy，各自只有需要的權限。' },
      { commands: ['cd ~/shelf', `docker build -q -t ${API_REPO}:${VERSION} api`, LOGIN_CI, `docker push ${API_REPO}:${VERSION}`],
        why: '只推送了 1.4.0，少了 commit 標籤 sha-9c2e4b1：之後無法從 Registry 上的 Image 追溯到原始碼的那一個 commit。' },
      { commands: ['cd ~/shelf', `${BUILD_TAGS.replace(' api', '')} -t ${API_REPO}:latest api`, LOGIN_CI, `docker push ${API_REPO}:${VERSION}`, `docker push ${API_REPO}:sha-${COMMIT}`, `docker push ${API_REPO}:latest`],
        why: '多推送了 latest：任何依賴 latest 的主機，下次拉取就默默換成這一版；團隊的規則是正式環境只以 digest 部署，latest 不由 CI 隨手移動。' },
    ],
    hints: [
      '推送到哪裡由名稱決定：名稱要以 `registry.shelf.example/` 開頭；`docker build` 可以給好幾個 `-t`。',
      '`cat ~/ci-token.txt | docker login registry.shelf.example -u ci --password-stdin`，每個標籤各推送一次。',
    ],
    explanation: `一次建置、兩個以 Registry 位址開頭的名稱，它們是同一個 IMAGE ID。以 ci 的 Token 從標準輸入登入（Token 不會留在 Shell 歷史與行程列表），第一次推送每一層都是 Pushed，第二次是 Layer already exists，兩次印出同一個 digest。SemVer 的 ${VERSION} 給人看，sha-${COMMIT} 讓 Image 能追溯到 commit，兩者都指向同一份 manifest；latest 不在發布流程裡。名稱少了位址會推到 Docker Hub 被拒絕；沒有登入是 unauthorized；deploy 帳號推送是 denied。`,
  },
  {
    id: 'dkr15-x-deploy', title: '第五關：以 digest 上線，加上正式環境的設定', machine: 'dkr15-prod',
    statement: `prod-01 是正式環境的 API 主機：主機上的 nginx（伺服器島設定的那一套）提供網站的靜態檔，並把 /api/ 轉給本機的 127.0.0.1:8000；資料庫在 db-01。CI 在 09:20 推送了 1.4.0。請以只能拉取的 deploy 帳號（Token 在 \`~/deploy-token.txt\`）登入 ${REG}，查出 \`shelf/api:${VERSION}\` 的 digest，以這個 digest（\`名稱@sha256:…\`）在背景執行名為 \`shelf-api\` 的容器：只在 127.0.0.1 的 8000 埠公開容器的 8000；\`DATABASE_URL=${PROD_DB_URL}\`；金鑰 \`~/secrets/payment_api_key\` 唯讀掛載成 \`/run/secrets/payment_api_key\`；根檔案系統唯讀，\`/tmp\` 用 tmpfs；\`--cap-drop ALL\` 並加上 \`--security-opt no-new-privileges\`；記憶體上限 128MiB（\`-m 128m\`）、CPU 0.5；重新啟動策略 \`unless-stopped\`。不要 --privileged，也不要掛載 Docker 的 socket。完成後 \`curl -s localhost:8000/healthz\` 應該回 ok，最後執行 \`docker ps --format '{{.Names}} {{.Image}} {{.Mounts}}'\` 確認。`,
    checks: [
      { kind: 'container', name: 'shelf-api', state: 'running', port: '127.0.0.1:8000:8000', readOnly: true, capDrop: ['ALL'], privileged: false, dockerSocket: false, memory: 128 * MIB, cpus: 0.5, restartPolicy: 'unless-stopped' },
      { kind: 'http', url: 'http://localhost:8000/healthz', status: 200, body: 'ok' },
      { kind: 'image', name: `${API_REPO}@${DIGEST}` },
      { kind: 'output', fromCommand: '^docker (ps|container ls)\\b' },
    ],
    solution: DEPLOY_SOLUTION,
    variants: [PROD_SHIPPER],
    mistakes: [
      { commands: deployWith(prodRun(PROD_FLAGS, `${API_REPO}:${VERSION}`)),
        why: '以標籤建立容器：內容此刻雖然是同一份，但標籤可以被重新推送而移動，下一次重建、回滾或在另一台主機部署時就可能拿到別的東西。docker ps 的 IMAGE 應該是 `…@sha256:…`。' },
      { commands: deployWith(prodRun(PROD_FLAGS.replace(' --tmpfs /tmp', ''), `${API_REPO}@${DIGEST}`)),
        why: '只有 --read-only 沒有 --tmpfs /tmp：程式啟動時要建立 /tmp/shelf-api，得到 read-only file system 而結束，unless-stopped 讓它不斷重新啟動。' },
      { commands: deployWith(prodRun(PROD_FLAGS.replace('-p 127.0.0.1:8000:8000', '-p 8000:8000'), `${API_REPO}@${DIGEST}`)),
        why: '`-p 8000:8000` 綁定所有位址：網路上的任何人都能繞過 nginx（TLS、限流、存取紀錄）直接連到 API。只給本機的 nginx 用，要寫 127.0.0.1:8000:8000。' },
      { commands: deployWith(prodRun(PROD_FLAGS.replace(' -m 128m --cpus 0.5', ''), `${API_REPO}@${DIGEST}`)),
        why: '沒有記憶體與 CPU 上限：記憶體洩漏或突發的負載可以吃光整台主機，連帶拖垮同一台上的其他服務。' },
      { commands: deployWith(prodRun(PROD_FLAGS, `${API_REPO}@${DIGEST}`, ` -v ~/secrets/payment_api_key:${KEY_PATH}:ro -v /run/docker.sock:/var/run/docker.sock`)),
        why: '為了「讓容器自己更新」掛載了 Docker 的 socket：能連到 socket 就能叫 daemon 以 --privileged 啟動任何容器，等於交出主機的 root，前面的唯讀與拿掉能力都白做了。' },
      { commands: [`docker pull ${API_REPO}:${VERSION}`, prodRun(PROD_FLAGS, `${API_REPO}@${DIGEST}`), 'curl -s localhost:8000/healthz', PS_MOUNTS],
        why: '沒有登入：拉取得到 unauthorized，本機沒有這個 Image，docker run 也拉不到，什麼都沒有部署。' },
    ],
    hints: [
      '先 `cat ~/deploy-token.txt | docker login registry.shelf.example -u deploy --password-stdin`，再 `docker pull registry.shelf.example/shelf/api:1.4.0`：輸出的 Digest 一行就是要鎖定的值（也可以看 `docker images --digests`）。',
      '選項全部寫在 Image 的名稱之前：`docker run -d --name shelf-api --restart unless-stopped --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges -m 128m --cpus 0.5 -p 127.0.0.1:8000:8000 -e … -v … 名稱@sha256:…`。',
      '`docker inspect -f \'{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.Memory}} {{.HostConfig.RestartPolicy}}\' shelf-api` 可以逐項核對。',
    ],
    explanation: `deploy 帳號只能拉取，正好是正式主機需要的權限。拉取 ${VERSION} 時的 Digest 一行就是這一版的內容指紋，以 \`名稱@sha256:…\` 建立的容器不會因為標籤被移動而改變，回滾時換回上一個 digest。--read-only 讓程式無法改寫自己的檔案，只有 tmpfs 的 /tmp 可寫；--cap-drop ALL 拿掉 Docker 預設的 14 個能力，no-new-privileges 讓 setuid 程式也不能提升權限；-m 128m 與 --cpus 0.5 限制它最多能用多少；unless-stopped 讓它當掉時被叫回來，手動停止的則不會；127.0.0.1:8000 只給本機的 nginx。docker ps 的 IMAGE 顯示 digest，MOUNTS 顯示金鑰檔的來源（截成 15 個字）。`,
  },
  {
    id: 'dkr15-x-golive', title: '第六關：上線檢查清單與埋好的故障', machine: 'dkr15-golive',
    statement: 'prod-02 是上線當天加入的第二台 API 主機，由同事 ken 部署。請照 `~/deploy/CHECKLIST.md` 做上線檢查：你會發現 shelf-api 有問題。依「狀態 → 日誌 → 設定 → 修正 → 驗證」的方法找出原因並從根本修好：這台主機上的容器必須和上線審查通過的 `~/deploy/shelf-api.sh` 完全一致（部署與修改都只透過這個指令稿）。修好之後確認它穩定執行（例如等 15 秒再看 `docker stats --no-stream`）、沒有被 OOM 結束、`curl -s localhost:8000/healthz` 回 ok，最後執行 `docker ps --format \'{{.Names}} {{.Image}}\'` 確認。',
    checks: [
      { kind: 'container', name: 'shelf-api', state: 'running', oomKilled: false, memory: 128 * MIB, readOnly: true, capDrop: ['ALL'], restartPolicy: 'unless-stopped', port: '127.0.0.1:8000:8000' },
      { kind: 'http', url: 'http://localhost:8000/healthz', status: 200, body: 'ok' },
      { kind: 'output', fromCommand: '^docker (ps|container ls)\\b' },
    ],
    solution: GOLIVE_SOLUTION,
    variants: [GOLIVE_SHIPPER],
    mistakes: [
      { commands: ['docker update -m 128m shelf-api', 'docker restart shelf-api', 'sleep 15', 'curl -s localhost:8000/healthz', PS_IMAGES],
        why: '手動調高上限讓它恢復了，但這個容器仍是 ken 以標籤 1.4.0 手動建立的，和審查過的指令稿不一致（docker ps 的 IMAGE 不是 digest）；下一次有人照自己的記憶部署，又會出現另一種差異。原因是「繞過指令稿手動部署」，要用指令稿重新部署。' },
      { commands: ['docker restart shelf-api', 'sleep 15', 'curl -s localhost:8000/healthz', PS_IMAGES],
        why: '重新啟動不會改變設定：上限仍是 64MiB，快取在 5 秒內長過上限，它又被 OOM killer 結束，回到重啟迴圈。' },
      { commands: ['docker update --restart no shelf-api', 'sleep 70', 'docker ps -a', PS_IMAGES],
        why: '關掉重新啟動策略只是讓迴圈停下來：上限仍是 64MiB，下一次被 OOM 結束之後它就停在 Exited (137)，API 完全不能用。症狀看起來安靜了，原因還在。' },
      { commands: ['docker rm -f shelf-api', prodRun('--restart unless-stopped -m 128m --cpus 0.5 -p 127.0.0.1:8000:8000', `${API_REPO}@${DIGEST}`, ` -v ${SECRET_MOUNT}`), 'sleep 15', 'curl -s localhost:8000/healthz', PS_IMAGES],
        why: '自己重打一次 docker run：digest 與上限都對了，卻漏了 --read-only、--tmpfs、--cap-drop ALL 與 no-new-privileges。這正是手動部署會出的錯，指令稿存在就是為了不必靠記憶。' },
    ],
    hints: [
      '先看狀態：`docker ps` 的 STATUS 與結束碼；再看 `docker logs --tail 3 shelf-api` 有沒有錯誤訊息。',
      '日誌只有反覆的啟動訊息時，看設定：`docker inspect -f \'{{.State.OOMKilled}} {{.RestartCount}} {{.HostConfig.Memory}} {{.Config.Image}}\' shelf-api`，和 `cat deploy/shelf-api.sh` 比較。',
      '`docker events --since 1m --filter container=shelf-api` 可以看到 oom 與 die 的時間；`docker stats --no-stream` 看穩定後的用量。',
      '修正就是重新執行審查過的指令稿：`sh deploy/shelf-api.sh`，再等一下、驗證。',
    ],
    explanation: 'docker ps 是 `Restarting (137)`；日誌只有一行又一行的 listening，沒有錯誤，表示程式不是自己結束的；docker inspect 說 OOMKilled 是 true、RestartCount 已經二十多次、上限是 67108864（64MiB）、Image 是標籤 1.4.0，而指令稿寫的是 128m 與 digest。原因是 ken 在容器剛啟動時看到 24MiB 就把上限「省」成 64m，可是書目快取載入後穩定在 96MiB，每次啟動 5 秒就越過上限。`sh deploy/shelf-api.sh` 移除手動建立的容器，照審查過的設定重新建立；15 秒後 docker stats 是 96MiB / 128MiB（75%，低於八成），healthz 回 ok，docker ps 的 IMAGE 是 digest。手動 update 加 restart 只修好了這一次的症狀，關掉重新啟動策略則讓 API 停擺。',
  },
];

const QUIZ: LessonContent['quiz'] = [
  {
    id: 'dkr15-q1', prompt: '多階段 Dockerfile 的最後一個階段以 `gcr.io/distroless/static-debian12` 為基底，最後一行寫成 `CMD /api`（Shell 形式）。`docker run` 這個 Image 會怎樣？',
    options: [
      '容器照常啟動並回應請求，只是之後 `docker stop` 要等滿 10 秒才會結束',
      '啟動失敗：distroless 裡沒有 `/bin/sh` 可以執行，容器停在 Created',
      'BuildKit 在建置時就拒絕，因為 distroless 的基底不接受任何 Shell 形式的指令',
      'Docker 會自動把它轉成 exec 形式的 `["/api"]`，所以行為和 exec 形式完全相同',
    ],
    answer: 1,
    explanation: 'Shell 形式的 CMD 被存成 `["/bin/sh","-c","/api"]`，distroless 沒有 /bin/sh，runc 找不到它，容器啟動失敗（127）並停在 Created。「照常啟動只是 stop 要等 10 秒」是有 sh 的基底才會發生的事；建置階段不檢查 CMD 能不能執行，所以 BuildKit 不會拒絕；Docker 也不會替你改寫成 exec 形式。',
  },
  {
    id: 'dkr15-q2', prompt: 'compose.yaml 裡 api 寫著 `depends_on: [db]`，db 有 `pg_isready` 的健康檢查。執行 `docker compose up -d` 時會怎樣？',
    options: [
      '先等 db 的健康檢查通過才啟動 api，效果和 `condition: service_healthy` 一樣',
      'Compose 拒絕啟動整個專案，因為有健康檢查的服務只能用長格式的相依寫法',
      '只等 db 的容器啟動就接著啟動 api，不等 postgres 真的能接受連線',
      'api 會比 db 先啟動，因為簡短的清單只宣告相依關係、不決定啟動的順序',
    ],
    answer: 2,
    explanation: '簡短的清單等同 `condition: service_started`：Compose 先啟動 db 的容器，接著就啟動 api，不等健康檢查，postgres 可能還沒準備好。只有長格式的 service_healthy 才會停在 Waiting 直到 Healthy；簡短的寫法是合法的，不會被拒絕；它仍然決定順序（db 先於 api），只是不等待就緒。',
  },
  {
    id: 'dkr15-q3', prompt: '1.3.0 是以 `--build-arg PAYMENT_API_KEY=…` 建置的，Dockerfile 寫著 `ARG PAYMENT_API_KEY` 與 `ENV PAYMENT_API_KEY=$PAYMENT_API_KEY`。發現之後，哪一組處置才完整？',
    options: [
      '先撤銷並換發金鑰；新版不讓金鑰進入 Image，改在執行時以唯讀檔案提供；再刪除舊 Image',
      '在 Dockerfile 最後加一行 `RUN unset PAYMENT_API_KEY`，再以同一個版本號重新建置並覆蓋舊的 Image',
      '把 Registry 的儲存庫改成私有、只讓團隊成員拉取，金鑰本身就不必撤銷或更換',
      '改用 `docker run -e PAYMENT_API_KEY=…` 傳入同一把金鑰，舊 Image 留在主機上方便需要時回滾',
    ],
    answer: 0,
    explanation: '金鑰已經在 Image 的設定與歷史裡，任何拿過這個 Image 的人都可能有它，所以第一步是撤銷；新版不讓它進入 Image，改在執行時以唯讀檔案提供，再刪除舊 Image。RUN unset 只影響那一步的 Shell，ENV 照樣留在設定裡；改成私有擋不住已經發生的外洩；沿用同一把金鑰並保留舊 Image，等於什麼都沒處理。',
  },
  {
    id: 'dkr15-q4', prompt: 'CI 推送了 `shelf/api:1.4.0` 與 `shelf/api:sha-9c2e4b1`，兩次印出同一個 digest。正式環境的部署設定應該寫哪一個？',
    options: [
      '`latest`，這樣每次重新部署都會自動拿到 CI 推送的最新版本，不必改設定',
      '`1.4.0`，因為 SemVer 的版本號已經清楚說明正在執行的是哪一個版本',
      '`sha-9c2e4b1`，因為 commit 標籤由 CI 自動產生，之後不會再有人推送它',
      '以 digest 寫成 `名稱@sha256:…`，因為它只代表那一份內容',
    ],
    answer: 3,
    explanation: '標籤（包括版本與 commit 標籤）都只是 Registry 裡可以被重新推送而移動的指標；digest 是 manifest 內容的 SHA-256，同一個 digest 永遠是同一份內容，所以部署、回滾與稽核都寫它。latest 由最後推送它的人決定；1.4.0 與 sha-9c2e4b1 適合給人看、追溯 commit，但不保證明天還指向同一份內容。',
  },
  {
    id: 'dkr15-q5', prompt: '以 `--read-only --cap-drop ALL` 執行 API，容器立刻結束，日誌是 `mkdir /tmp/shelf-api: read-only file system`。最好的修正是？',
    options: [
      '拿掉 `--read-only`，因為這個程式本來就需要寫入檔案，唯讀不適合它',
      '加上 `--tmpfs /tmp`，只讓暫存資料夾可寫，根檔案系統仍是唯讀',
      '加上 `--privileged`，讓容器擁有寫入根檔案系統所需要的全部權限',
      '加上 `--cap-add DAC_OVERRIDE`，讓程式略過檔案權限的檢查而能寫入',
    ],
    answer: 1,
    explanation: '程式只需要在 /tmp 寫暫存資料，--tmpfs /tmp 讓那裡是記憶體裡的可寫空間，根檔案系統仍是唯讀。拿掉 --read-only 等於放棄保護；--privileged 交出所有能力與主機的裝置，而且唯讀的根檔案系統照樣唯讀；DAC_OVERRIDE 只略過權限檢查，唯讀的檔案系統一樣寫不進去。',
  },
  {
    id: 'dkr15-q6', prompt: 'shelf-api 是 `Restarting (137)`，日誌只有一再重複的 listening，`docker inspect` 顯示 `OOMKilled` 是 true、`HostConfig.Memory` 是 67108864。最可能的原因是？',
    options: [
      '程式沒有處理 SIGTERM，docker stop 的寬限期一到就被 SIGKILL 結束，所以是 137',
      '少了 DATABASE_URL 這個環境變數，程式一啟動就印出錯誤並以 137 結束',
      '上限 64MiB 低於它快取載滿後的用量，每次越過上限就被 OOM killer 結束',
      '有人用 `docker kill` 結束了它，重新啟動策略又一再把它叫回來執行',
    ],
    answer: 2,
    explanation: 'OOMKilled 是 true 表示最後一次是被核心的 OOM killer 結束（SIGKILL，所以是 137），67108864 位元組是 64MiB：程式的快取長過這個上限就被結束，unless-stopped 又把它叫回來。docker stop 逾時或 docker kill 也會得到 137，但那時 OOMKilled 是 false，也不會在無人操作時一再發生；缺少環境變數時日誌會有錯誤訊息，結束碼是程式自己的 1。',
  },
  {
    id: 'dkr15-q7', prompt: '有人以 `docker update -m 128m shelf-api` 加 `docker restart shelf-api` 讓 prod-02 恢復了。為什麼上線檢查仍然不通過？',
    options: [
      '這個容器仍是繞過指令稿、以標籤 1.4.0 手動建立的，和審查過的設定不一致',
      '`docker update` 只修改記錄，新的上限要等 daemon 重新啟動之後才生效',
      '`docker restart` 會把 `--read-only` 與 `--cap-drop` 這些安全選項全部清除掉',
      '128MiB 仍然不夠用，幾秒之後它又會被 OOM killer 結束',
    ],
    answer: 0,
    explanation: '上線檢查要求容器和審查過的 deploy/shelf-api.sh 一致：手動修好的容器仍以標籤 1.4.0 建立（docker ps 的 IMAGE 不是 digest），而且是繞過指令稿的結果，下一次手動部署又會出現別的差異。docker update 立刻生效；restart 不會改變建立時的安全選項；程式穩定在 96MiB，128MiB 是夠的。',
  },
  {
    id: 'dkr15-q8', prompt: 'prod-01 的 nginx 把 /api/ 轉給本機，API 容器以 `-p 127.0.0.1:8000:8000` 公開。為什麼不寫 `-p 8000:8000`？',
    options: [
      '因為容器裡的程式只監聽 127.0.0.1，寫 `-p 8000:8000` 會連不到它',
      '因為 Docker 不允許兩個不同的容器同時在 0.0.0.0 上公開同一個埠號',
      '因為綁定 127.0.0.1 比 0.0.0.0 快，可以少經過一次位址轉換與 docker-proxy',
      '只讓本機的 nginx 連得到，網路上的其他人不能繞過 nginx 的 TLS 與紀錄直接打 API',
    ],
    answer: 3,
    explanation: '`-p 8000:8000` 在主機的所有位址上監聽，網路上的人可以繞過 nginx 的 TLS、限流與存取紀錄直接連到 API；127.0.0.1 只有本機連得到。容器裡的程式監聽的是容器自己的介面，和主機綁哪個位址無關；兩個容器本來就不能公開同一個主機埠，與位址寫法無關；兩種寫法都經過 docker-proxy，沒有速度差異。',
  },
];

export const DKR15: LessonContent = {
  lessonId: 'DKR15',
  motivation: '拾光書屋是一家二手書店，線上目錄由三個部分組成：nginx 提供的網站前端、用 Go 寫的 API，以及 postgres 資料庫。過去一年，它們都在店長 hana 的筆電上以手打的 `docker run` 執行：API 是在筆電上建置的 843MB Image，以 root 執行，付款服務的金鑰在建置時被包了進去；資料庫沒有具名 Volume；API 以 172.17.0.2 這個會變的位址連資料庫；沒有版本、沒有 Registry，也沒有人說得出正在跑的是哪一份程式碼。這座島的每一堂課都只看一件事：Dockerfile、快取、Volume、網路、Compose、多階段建置、Registry、安全、除錯、健康檢查與資源限制。這堂綜合專題把它們接成一條路：從原始碼到一組精簡、安全、有版本的 Image，再到可以上線的容器。六個關卡依序完成多階段的 API Image、Compose 開發環境、處理外洩的金鑰、版本標籤與推送、以 digest 和正式環境的設定上線，最後照上線檢查清單驗收第二台主機，並排除一個預先埋好的故障。每一關都要在模擬的主機上動手，並且用 Docker 自己的指令驗證結果。',
  sections: [
    {
      id: 'dkr15-s-overview', title: '拾光書屋：從筆電上的 docker run 到可以上線',
      blocks: [
        { type: 'p', text: '情境：shelf-nb 是 hana 的筆電，目前直接服務顧客；dev-01 是開發用的主機；ci-01 是 CI 主機；prod-01 與 prod-02 是新的正式環境 API 主機。團隊的私有 Registry 是 registry.shelf.example（儲存庫 shelf/api）。正式環境的資料庫在專用的 db-01，每台 API 主機上的 nginx（網路與伺服器島設定的那一套）終止 TLS、提供網站的靜態檔，並把 /api/ 轉給本機 127.0.0.1:8000 的 API 容器。主機、帳號、金鑰與 Token 都是虛構的課程資料，金鑰與 Token 刻意寫成明顯的假值（含 demo、lesson）。先看筆電上現在的樣子：' },
        { type: 'example', id: 'dkr15-ex-laptop' },
        { type: 'p', text: '一個 `docker ps` 加上一份手寫的筆記，就能列出上線前要處理的事。下表把三層架構在筆電上的做法、上線後的做法與對應的課放在一起：' },
        { type: 'table', head: ['部分', '筆電上的現況', '上線之後', '對應的課'], rows: [
          ['API Image', '單一階段的 golang:1.23，843MB，root，Shell 形式的 CMD', '多階段：distroless、nonroot、exec 形式，11.2MB', '撰寫 Dockerfile、多階段建置'],
          ['付款金鑰', '`--build-arg` 傳入再寫進 ENV，留在 Image 的設定與歷史', '撤銷舊金鑰；執行時以唯讀掛載的檔案提供', '容器安全、Image 分層'],
          ['資料庫', '沒有具名 Volume；API 以 172.17.0.2 連線', '開發：Compose 的具名 Volume 與健康檢查；正式：db-01', 'Volume、容器網路、Docker Compose'],
          ['版本', '只有本機的 shelf-api:1.3.0', 'SemVer 加 commit 標籤推送到私有 Registry，部署寫 digest', 'Container Registry 與版本標籤'],
          ['執行方式', '`docker run -d -p 8000:8000`，沒有任何限制', '唯讀、tmpfs、拿掉全部能力、記憶體與 CPU 上限、重新啟動策略、只綁 127.0.0.1', '容器安全、健康檢查與資源限制'],
          ['驗收', '「網頁打得開」', '上線檢查清單：ps、inspect、stats、logs、curl', '容器除錯'],
        ] },
        { type: 'p', text: '六個關卡依序完成這條路，每一關的主機就是那個時刻的樣子：' },
        { type: 'table', head: ['關卡', '主機', '要做的事', '交出的成果'], rows: [
          ['1. API Image', 'dev-01', '把單一階段的 Dockerfile 改成兩個階段並試跑', '`shelf-api:1.4.0`：nonroot、`CMD ["/api"]`、20MB 以下，docker stop 以 0 結束'],
          ['2. Compose 開發環境', 'dev-01', '修好同事的 compose.yaml，一個指令啟動三層', 'db healthy、具名 Volume shelf_pgdata、8080 與 8000 都通'],
          ['3. 外洩的金鑰', 'shelf-nb', '從 Image 的歷史找出證據，換成不含金鑰的 1.4.0', 'ENV 那一列的證據；舊 Image 刪除，金鑰改為唯讀掛載'],
          ['4. 版本與推送', 'ci-01', '以 SemVer 與 commit 標籤推送到私有 Registry', 'Registry 上 1.4.0 與 sha-9c2e4b1 指向同一個 digest，沒有 latest'],
          ['5. 以 digest 上線', 'prod-01', '以 deploy 帳號拉取，以 digest 與正式環境的設定執行', '唯讀、tmpfs、cap-drop ALL、128MiB、0.5 CPU、unless-stopped、127.0.0.1:8000'],
          ['6. 上線檢查', 'prod-02', '照檢查清單驗收，找出並修好埋好的故障', '容器與審查過的指令稿一致，穩定執行'],
        ] },
        { type: 'callout', tone: 'tip', title: '每一關都先看、再改、再驗證', text: '每一關都照同樣的節奏：先用 docker ps、docker images、docker inspect、docker history 看清楚現況，只改一件事，立刻用 Docker 自己的指令與 curl 驗證。驗證的依據是主機上實際的 Image 與容器，不是 Dockerfile 或筆記上「應該是」的樣子。' },
      ],
    },
    {
      id: 'dkr15-s-image', title: '第一關：多階段、非 root、exec 形式的 API Image',
      blocks: [
        { type: 'p', text: 'dev-01 上的原始碼已經是 1.4.0：程式從環境變數 DATABASE_URL 讀資料庫位址，付款金鑰改從 /run/secrets/payment_api_key 這個檔案讀，啟動時在 /tmp/shelf-api 建立上傳用的暫存資料夾，收到 SIGTERM 會關閉監聽、做完手上的請求再結束。Dockerfile 卻還是筆電時代的寫法。先照舊的方式建置一次，看看它帶了什麼上線：' },
        { type: 'example', id: 'dkr15-ex-single' },
        { type: 'p', text: '843MB 幾乎全是 golang:1.23（833MB：Debian、編譯器、git 與 Go 工具鏈）；執行 API 只需要那個 9.2MB 的靜態執行檔。User 是空的表示以 root 執行；CMD 被存成 `["/bin/sh","-c","/out/api"]`，PID 1 是 sh。改成兩個階段，每一行都有它的理由：' },
        { type: 'table', head: ['Dockerfile 的一行', '作用', '少了它或寫錯會怎樣'], rows: [
          ['`FROM golang:1.23 AS build`', '有名字的建置階段，只在建置時存在', '單一階段時工具鏈跟著上線（843MB）'],
          ['`COPY go.mod ./` 再 `COPY cmd ./cmd`', '依賴清單先複製，改程式時前面的步驟仍是 CACHED', '`COPY . .` 讓任何檔案改動都使之後的步驟失效'],
          ['`ENV CGO_ENABLED=0`', '編出不依賴 C 函式庫的靜態執行檔', '動態連結的執行檔在沒有 libc 的 distroless static 上無法執行'],
          ['`FROM gcr.io/distroless/static-debian12`', '最後的基底只有 CA 憑證、時區資料與帳號檔，約 2MB', '沒有 Shell 與套件管理工具，攻擊者手上也沒有現成的工具'],
          ['`COPY --from=build /out/api /api`', '只帶走執行檔', '打錯階段名稱會被當成 Image 去拉取'],
          ['`USER nonroot`', '以 distroless 內建的 UID 65532 執行', '程式被攻破時，攻擊者就是容器裡的 root'],
          ['`CMD ["/api"]`', 'exec 形式：/api 就是 PID 1，直接收到 SIGTERM', 'Shell 形式在 distroless 上根本啟動不了（沒有 /bin/sh）'],
        ] },
        { type: 'p', text: '寫好之後建置成 shelf-api:1.4.0，Image 只剩 11.2MB。試跑時要給它 DATABASE_URL 並以唯讀方式掛載開發用的金鑰檔（`~/shelf/secrets/payment_api_key.dev`）：金鑰不在 Image 裡，每一次執行都由執行環境提供。`docker stop` 送出 SIGTERM，程式約 2 秒做完手上的請求並以 0 結束，日誌最後兩行是 SIGTERM received 與 shutdown complete。' },
        { type: 'callout', tone: 'warning', title: '「容器本來就是隔離的」不等於可以用 root', text: '常見的誤解是容器裡的 root 無害。容器和主機共用同一個核心，容器裡的 root 就是 UID 0：它可以改寫容器裡的程式、讀到掛載進來的任何檔案，配合一個核心漏洞、一個 --privileged 或一個掛進來的 docker.sock 就能碰到主機。多階段建置讓 Image 小，USER 讓程式不是 root，兩者都要做；在 docker run 加 -u 只保護那一次執行，Image 本身沒有 USER，下一個人又會以 root 執行。' },
      ],
    },
    {
      id: 'dkr15-s-compose', title: '第二關：Compose 開發環境',
      blocks: [
        { type: 'p', text: '在筆電上，三個容器靠三行 docker run 與一個寫死的位址串在一起。開發環境改用 Compose：一個 compose.yaml 描述 web、api、db 三個服務，`docker compose up -d` 一個指令建置、建立網路與 Volume，並依相依順序啟動；api 以服務名稱 db 連線，由專案網路的內建 DNS 解析，不再依賴 172.17.0.2。同事已經寫了第一版，先照原樣啟動看看：' },
        { type: 'example', id: 'dkr15-ex-compose' },
        { type: 'p', text: '三個服務都 Up 了，看起來沒問題，但仔細看有三個缺口：' },
        { type: 'table', head: ['看到的現象', '問題', '修正'], rows: [
          ['db 的 STATUS 沒有 (healthy)', 'db 沒有健康檢查，Docker 只知道 postgres 這個行程還在', '`healthcheck` 以 `pg_isready -U shelf -d shelf` 每 5 秒探測一次'],
          ['api 和 db 同時 Started', '簡短的 `depends_on: [db]` 只等容器啟動，postgres 還沒接受連線時 api 已經在連它', '`db: {condition: service_healthy}`，up 會停在 Waiting 直到 Healthy'],
          ['`docker volume ls` 只有一個雜湊名稱', 'postgres Image 的 VOLUME 產生匿名 Volume；down 再 up 就換一個新的', '具名 Volume `pgdata:/var/lib/postgresql/data`，並在最外層宣告'],
        ] },
        { type: 'p', text: 'db 是檔案裡的最後一個服務，所以它的 volumes 與 healthcheck 可以用 `printf \'%s\\n\' … >> compose.yaml` 接在最後（注意四格的縮排），最外層的 `volumes:` 接在它們後面；api 的 depends_on 用 sed 把 `- db` 那一行換成兩行的長格式。改完先 `docker compose config -q`：YAML 縮排錯誤、引用了沒有宣告的 Volume、條件拼錯，都會在啟動之前被抓出來。' },
        { type: 'callout', tone: 'note', title: '開發環境不是正式環境', text: 'compose.yaml 裡的資料庫密碼 lesson-dev-pw 與開發用的金鑰檔只屬於開發環境，所以可以寫在專案裡；正式環境的值不進版本控制。資料庫在正式環境也不放進這台主機的容器，而是交給有備份與監控的 db-01。模擬環境的 Compose 一律印出 plain 格式的進度（每個事件一行，寫到標準錯誤），終端機上真實的畫面是同樣的事件，最後停在 ✔ 的那一列。' },
      ],
    },
    {
      id: 'dkr15-s-secret', title: '第三關：找出外洩的金鑰，改在執行時提供',
      blocks: [
        { type: 'p', text: '筆電上的 1.3.0 是以 `docker build --build-arg PAYMENT_API_KEY=<金鑰>` 建置的，Dockerfile 只寫 `ARG PAYMENT_API_KEY` 與 `ENV PAYMENT_API_KEY=$PAYMENT_API_KEY`。讀 Dockerfile 看不到值，但 Image 把它記在三個地方：' },
        { type: 'table', head: ['在哪裡', '怎麼讀到', '誰讀得到'], rows: [
          ['Image 的設定（Config.Env）', '`docker image inspect -f \'{{.Config.Env}}\'`', '任何拉得到這個 Image 的人'],
          ['每個容器的環境', '`docker exec 容器 env`、`docker inspect` 的 Config.Env', '能用 docker 指令的人、容器裡的任何程式'],
          ['建置歷史', '`docker history --no-trunc`：ENV 那一列是代換後的值，之後的 RUN 記成 `RUN |1 PAYMENT_API_KEY=…`', '任何拉得到這個 Image 的人'],
        ] },
        { type: 'p', text: '所以處理的順序是：先請付款服務商撤銷這把金鑰並換發新的（Image 可能早就被複製到別處，刪除它擋不住已經發生的外洩）；再從 Image 本身取得證據寫進事故報告；然後讓新版本不再把金鑰放進 Image：1.4.0 從 /run/secrets/payment_api_key 讀金鑰，執行時以唯讀的 bind mount 提供，主機上的檔案放在只有 hana 能進入的 ~/secrets（0700）；最後移除舊的容器與 Image。有容器使用的 Image 刪不掉，所以先 `docker rm -f` 舊容器，再 `docker rmi`。' },
        { type: 'p', text: '金鑰放在檔案裡，`docker inspect` 只看得到掛載的路徑，看不到內容；放在 `-e` 裡，值就出現在 Config.Env，任何能執行 docker inspect 的人都讀得到。建置時真的需要秘密（例如私有套件庫的 Token）時，用 BuildKit 的 secret 掛載（`RUN --mount=type=secret`），它只在那一步存在，不進入任何一層，也不寫進歷史。' },
        { type: 'callout', tone: 'warning', title: '在後面的 RUN 刪掉，或改用 ARG，都藏不住秘密', text: '常見的誤解有兩種。一是「最後一個 RUN 把檔案刪了就好」：刪除只是在新的一層加上「已刪除」的標記，檔案仍在之前那一層，任何人都能把層解開。二是「ARG 不會留在 Image 裡」：ARG 確實不進入 Config.Env，但用到它的每一個 RUN 都把它的值記進歷史（`RUN |1 KEY=… /bin/sh -c …`），`docker history --no-trunc` 一眼就看得到。秘密只能在執行時提供，或用 BuildKit 的 secret 掛載。' },
      ],
    },
    {
      id: 'dkr15-s-registry', title: '第四關：版本標籤與私有 Registry',
      blocks: [
        { type: 'p', text: '正式主機不建置 Image，它們從 Registry 拉取 CI 建置好的那一份。Image 的名稱同時決定它推到哪裡：`registry.shelf.example/shelf/api:1.4.0` 是「這個 Registry 的 shelf/api 儲存庫的 1.4.0 標籤」，少了位址的 `shelf/api:1.4.0` 指的是 Docker Hub。團隊的標籤規則：' },
        { type: 'table', head: ['名稱', '意義', '誰來移動它', '用在哪裡'], rows: [
          ['`1.4.0`', 'SemVer 的版本：主版本.次版本.修補', '發布流程；團隊約定不重新推送同一個版本', '給人看、寫進變更紀錄'],
          ['`sha-9c2e4b1`', 'commit 標籤：這份 Image 從哪一個 commit 建置', 'CI 每次建置', '從 Image 追溯到原始碼'],
          ['`latest`', '沒寫標籤時的預設，只是一個名字', '誰最後推送它，它就指向誰', '不在發布流程裡，正式環境不用'],
          ['`@sha256:…`（digest）', 'manifest 內容的 SHA-256，內容不同就是另一個值', '沒有人能移動', '部署設定、回滾、稽核'],
        ] },
        { type: 'list', ordered: true, items: [
          '`docker build -q -t registry.shelf.example/shelf/api:1.4.0 -t registry.shelf.example/shelf/api:sha-9c2e4b1 api`：一次建置，兩個名稱指向同一個 IMAGE ID。',
          '`cat ~/ci-token.txt | docker login registry.shelf.example -u ci --password-stdin`：Token 從標準輸入進來，不留在 Shell 歷史與行程列表；config.json 裡的 auth 只是 base64，檔案本身要保護好。',
          '`docker push …:1.4.0`：每一層 Pushed，最後一行是 `1.4.0: digest: sha256:… size: …`。',
          '`docker push …:sha-9c2e4b1`：每一層 Layer already exists，digest 和上一行相同。',
        ] },
        { type: 'p', text: '帳號也分權限：ci 可以推送 shelf/* 的儲存庫，正式主機用的 deploy 只能拉取。用 deploy 推送會得到 denied，沒有登入是 unauthorized，名稱沒有 Registry 位址則是推到 Docker Hub 被拒絕：三種錯誤分別指向權限、身分與名稱。' },
        { type: 'callout', tone: 'warning', title: 'latest 不代表「最新的版本」', text: 'Registry 不會替你維護 latest 的意義：推送 1.4.0 不會移動 latest，有人隨手推送一個測試版的 latest，它就指向測試版。依賴 latest 的主機在不同時間拉取，會跑著不同的程式；昨天的 latest 是哪一版也無從得知。所以 CI 不推送 latest，正式環境只寫 digest。' },
      ],
    },
    {
      id: 'dkr15-s-deploy', title: '第五關：以 digest 上線，加上正式環境的設定',
      blocks: [
        { type: 'p', text: 'prod-01 以 deploy 帳號登入，拉取 1.4.0，從 Digest 一行讀出這一版的內容指紋，之後一律以 `名稱@sha256:…` 指名。docker run 的每個選項都對應前面某一課的一個原則：' },
        { type: 'example', id: 'dkr15-ex-release' },
        { type: 'table', head: ['選項', '作用', '沒有它會怎樣', '對應的課'], rows: [
          ['`…@sha256:<digest>`', '只執行這一份內容', '標籤被移動後，重建或回滾拿到別的東西', 'Container Registry 與版本標籤'],
          ['`--read-only` 加 `--tmpfs /tmp`', '根檔案系統唯讀，只有記憶體裡的 /tmp 可寫', '攻擊者可以改寫程式、留下工具；只加 --read-only 則程式建不了暫存資料夾而結束', '容器安全'],
          ['`--cap-drop ALL`', '拿掉 Docker 預設的 14 個能力', 'root 以外的程式也保有 CHOWN、SETUID 等能力', '容器安全'],
          ['`--security-opt no-new-privileges`', 'setuid 程式不能提升權限', '容器裡的 setuid 程式可能變成 root', '容器安全'],
          ['`-m 128m --cpus 0.5`', '記憶體與 CPU 的上限', '一個洩漏可以拖垮整台主機', '健康檢查、資源限制與優雅關閉'],
          ['`--restart unless-stopped`', '當掉時自動重新啟動，手動停止的不叫回來', '當掉就停在 Exited，等人發現', '健康檢查、資源限制與優雅關閉'],
          ['`-p 127.0.0.1:8000:8000`', '只給本機的 nginx 連', '網路上的人可以繞過 nginx 直接打 API', '容器網路'],
          ['`-v ~/secrets/payment_api_key:/run/secrets/payment_api_key:ro`', '金鑰在執行時以唯讀檔案提供', '程式讀不到金鑰而結束；改用 -e 則值出現在 inspect', '容器安全'],
        ] },
        { type: 'p', text: '記憶體上限依量測決定：1.4.0 啟動時約 24MiB，書目快取載入後約 9 秒穩定在 96MiB，所以 128MiB 留了約四分之一的餘裕。exec 形式與 SIGTERM 的處理在第一關已經確認過：`docker stop` 會等它做完手上的請求並以 0 結束，unless-stopped 不會把手動停止的容器叫回來（always 與 unless-stopped 的差別在 daemon 重新啟動之後：always 連手動停止的也會被叫回來；模擬環境的 daemon 不會重新啟動，這一點只在課文說明）。' },
        { type: 'callout', tone: 'note', title: '模擬環境記錄、但不模擬的部分', text: 'no-new-privileges 在模擬環境只記錄在 docker inspect 的 SecurityOpt（模擬環境沒有 setuid 程式可以示範它的效果）；docker stats 的記憶體與 CPU 是課程宣告的模型，NET I/O 與 BLOCK I/O 一律是 0B；Registry 的 digest 是模擬的 manifest 的 SHA-256。CI 在 09:20 推送的那一份 manifest 和你在第四關自己推送的不是同一份，所以 digest 不同，請以拉取時印出的值為準。' },
      ],
    },
    {
      id: 'dkr15-s-golive', title: '第六關：上線檢查清單與埋好的故障',
      blocks: [
        { type: 'p', text: '上線不是 docker run 成功的那一刻，而是每一台主機都通過同一份檢查清單。prod-02 是上線當天加入的第二台 API 主機，由同事 ken 部署；hana 把審查通過的部署寫成 ~/deploy/shelf-api.sh，檢查清單在 ~/deploy/CHECKLIST.md。第一輪檢查就不對勁：' },
        { type: 'example', id: 'dkr15-ex-checklist' },
        { type: 'table', head: ['檢查項目', '指令', '正常的樣子'], rows: [
          ['狀態', '`docker ps`', '每個容器都是 Up，沒有 Restarting、沒有 Exited'],
          ['設定', '`docker inspect -f \'…\'`', 'Image 是 digest；Memory、NanoCpus、ReadonlyRootfs、CapDrop、RestartPolicy 和指令稿相同'],
          ['用量', '`docker stats --no-stream`', '記憶體穩定、低於上限的八成；CPU 沒有長時間頂在上限'],
          ['日誌', '`docker logs --since 10m`、`--tail`', '沒有錯誤，也沒有反覆出現的啟動訊息'],
          ['事件', '`docker events --since … --filter container=…`', '沒有 oom、沒有一再出現的 die'],
          ['服務', '`curl -s localhost:8000/healthz`', '回 ok；連不上是 curl 的結束碼 7'],
        ] },
        { type: 'p', text: '照「容器除錯」那一課的步驟：先看狀態（Restarting (137)：128＋9，被 SIGKILL 結束），再看日誌（只有一行又一行的 listening，沒有錯誤訊息，表示程式不是自己結束的），接著看設定與事件（OOMKilled、RestartCount、HostConfig.Memory、Config.Image；docker events 的 oom 與 die），最後和審查過的指令稿比對。找出原因之後，修正要回到指令稿，再依檢查清單驗證一次。' },
        { type: 'table', head: ['做法', '效果', '是修原因嗎'], rows: [
          ['`docker restart shelf-api`', '重新開始計算退避時間，5 秒後又被 OOM 結束', '不是，設定沒有改變'],
          ['`docker update --restart no shelf-api`', '重啟迴圈停了，容器停在 Exited，API 完全不能用', '不是，只是讓症狀安靜下來'],
          ['`docker update -m 128m` 加 `docker restart`', '這一次恢復了，但容器仍是手動建立的（以標籤、和指令稿不一致）', '只修了症狀，原因是繞過指令稿'],
          ['自己重打一次 docker run', '容易漏掉 --read-only、--cap-drop 等選項', '換了一種方式重犯同一個錯'],
          ['`sh deploy/shelf-api.sh`', '照審查過的設定重新建立：digest、128MiB 與所有安全選項', '是：部署回到唯一的來源'],
        ] },
        { type: 'callout', tone: 'warning', title: '症狀消失不等於修好了', text: '關掉重新啟動策略、手動調高上限，都能讓 docker ps 立刻安靜下來，事故單也可以關掉，但原因還在：這台主機的容器和審查過的設定不一樣，下一次有人憑記憶部署又會出現另一種差異。修正要回到唯一的來源（這裡是部署指令稿），並在檢查清單裡加一條「容器的設定和指令稿一致」。' },
        { type: 'p', text: '最後寫下時間線與教訓，例如：09:40 ken 在 prod-02 手動執行 shelf-api（標籤 1.4.0、-m 64m，依據是剛啟動時 docker stats 的 24MiB）；09:40 起每次啟動約 5 秒被 OOM 結束；10:00 上線檢查發現 Restarting (137)；以 deploy/shelf-api.sh 重新部署，15 秒後穩定在 96MiB / 128MiB。這一課的每一步都對應十二要素應用的幾個想法：同一份 Image 走過開發、CI 與正式環境，設定與秘密由執行環境提供，行程可以隨時停止與替換，日誌寫到標準輸出交給 docker logs；容器可以丟掉重建，正是因為建立它的方式被寫成了可以重複執行的指令稿。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: '把拾光書屋容器化並準備上線：六個關卡',
    stages: [
      { title: '多階段、非 root 的 API Image', concepts: ['DKR05', 'DKR10', 'DKR14'], goal: '把單一階段、以 root 執行的 843MB Dockerfile 改成兩個階段：distroless、USER nonroot、exec 形式的 CMD，11.2MB。', detail: 'build 階段先複製 go.mod 再複製 cmd，CGO_ENABLED=0 編出靜態執行檔；COPY --from=build 只帶走 /api；distroless 沒有 /bin/sh，Shell 形式的 CMD 啟動失敗；試跑時以 -e 與唯讀掛載提供設定與金鑰，docker stop 以 0 結束。' },
      { title: 'Compose 開發環境', concepts: ['DKR09', 'DKR07', 'DKR08'], goal: '一個 compose.yaml 描述 web、api、db，一個指令啟動，db 健康之後才啟動 api。', detail: 'pg_isready 的健康檢查與 condition: service_healthy；具名 Volume 要在最外層宣告；簡短的 depends_on 只等容器啟動；先 docker compose config -q 驗證；api 以服務名稱 db 連線。' },
      { title: '外洩的金鑰', concepts: ['DKR12', 'DKR06'], goal: '從舊 Image 的歷史找出金鑰進入 Image 的那一步，換成執行時才提供金鑰的 1.4.0。', detail: '先撤銷再清理；docker history --no-trunc 的 ENV 列與 RUN |1 KEY=…；Dockerfile 看不到 --build-arg 的值；先 rm 容器再 rmi；金鑰以唯讀 bind mount 提供，不用 -e。' },
      { title: '版本標籤與私有 Registry', concepts: ['DKR11'], goal: '以 SemVer 的 1.4.0 與 commit 標籤 sha-9c2e4b1 推送到 registry.shelf.example，兩者同一個 digest。', detail: '名稱決定推到哪裡；--password-stdin；ci 推送、deploy 只能拉取；Pushed 與 Layer already exists；不推送 latest。' },
      { title: '以 digest 上線', concepts: ['DKR11', 'DKR12', 'DKR14'], goal: '以 deploy 帳號拉取，以 digest 與正式環境的設定執行 API。', detail: '名稱@sha256:…；--read-only 加 --tmpfs /tmp；--cap-drop ALL 與 no-new-privileges；-m 128m 與 --cpus 0.5 依量測決定；unless-stopped；只綁 127.0.0.1；不要 --privileged 與 docker.sock。' },
      { title: '上線檢查與埋好的故障', concepts: ['DKR13', 'DKR14'], goal: '照檢查清單驗收 prod-02，找出 OOM 重啟迴圈的原因，以審查過的指令稿重新部署。', detail: 'Restarting (137)；日誌沒有錯誤；OOMKilled 與 64MiB 的上限、以標籤執行；docker events 的 oom；不要關掉重新啟動策略或手動 update 了事；重新部署後 docker stats 穩定在上限的八成以下。' },
    ],
  },
  quiz: QUIZ,
  terminal: {
    machines: [buildStage, composeStage, secretStage, ciStage, prodStage, goliveStage],
    examples: [
      {
        id: 'dkr15-ex-laptop', title: '筆電上的現況：手打的 docker run 與 Image 裡的金鑰', machine: 'dkr15-secret',
        description: '三個容器都是手動 docker run 的；筆記記下了啟動方式，API 以 172.17.0.2 連資料庫，金鑰在建置時以 --build-arg 傳入。shelf-api:1.3.0 有 843MB，以 root 執行，CMD 是 Shell 形式，執行中的容器的環境變數裡就有付款金鑰。',
        steps: [
          { command: 'docker ps', output: "CONTAINER ID   IMAGE             COMMAND                  CREATED       STATUS       PORTS                                       NAMES\ne9da7fda0be6   nginx:1.27        \"/docker-entrypoint.…\"   3 weeks ago   Up 3 weeks   0.0.0.0:8080->80/tcp, [::]:8080->80/tcp     shelf-web\n1daa8e7c8bba   shelf-api:1.3.0   \"/bin/sh -c /out/api\"    3 weeks ago   Up 3 weeks   0.0.0.0:8000->8000/tcp, :::8000->8000/tcp   shelf-api\na1708c45356e   postgres:17       \"docker-entrypoint.s…\"   3 weeks ago   Up 3 weeks   5432/tcp                                    shelf-db" },
          { command: 'cat run-notes.txt', output: "# 拾光書屋：筆電上的啟動方式（hana，2026-10-31）\ndocker run -d --name shelf-db -e POSTGRES_USER=shelf -e POSTGRES_PASSWORD=lesson-dev-pw -e POSTGRES_DB=shelf postgres:17\ndocker build -t shelf-api:1.3.0 --build-arg PAYMENT_API_KEY=<金鑰> api\ndocker run -d --name shelf-api -p 8000:8000 -e DATABASE_URL=postgres://shelf:lesson-dev-pw@172.17.0.2:5432/shelf shelf-api:1.3.0\ndocker run -d --name shelf-web -p 8080:80 -v ~/shelf/web/site:/usr/share/nginx/html:ro nginx:1.27" },
          { command: 'docker images shelf-api', output: "REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nshelf-api    1.3.0     a5b7839c0c0d   3 weeks ago   843MB" },
          { command: "docker inspect -f 'User=\"{{.Config.User}}\" Cmd={{json .Config.Cmd}}' shelf-api", output: "User=\"\" Cmd=[\"/bin/sh\",\"-c\",\"/out/api\"]" },
          { command: 'docker exec shelf-api env | grep PAYMENT', output: "PAYMENT_API_KEY=demo-payments-key-lesson-laptop-7f3a" },
        ],
      },
      {
        id: 'dkr15-ex-single', title: '照舊的方式建置：843MB、root 與 Shell 形式', machine: 'dkr15-build',
        description: '筆電時代的 Dockerfile 只有一個階段。建置出來的 Image 有 843MB，User 是空的（root），CMD 被存成 /bin/sh -c，歷史的最上面一列也是這樣記的。',
        steps: [
          { command: 'cat shelf/api/Dockerfile', output: "FROM golang:1.23\nARG PAYMENT_API_KEY\nENV PAYMENT_API_KEY=$PAYMENT_API_KEY\nWORKDIR /src\nCOPY . .\nRUN go build -o /out/api ./cmd/api\nEXPOSE 8000\nCMD /out/api" },
          { command: 'docker build -q -t shelf-api:single shelf/api', output: "sha256:85c2b4e06d89d434f2de101d13050e96ae9b10c8bc7aa3531bce310ec840c5ea" },
          { command: 'docker images', output: "REPOSITORY                          TAG       IMAGE ID       CREATED                  SIZE\nshelf-api                           single    85c2b4e06d89   Less than a second ago   843MB\nnginx                               1.27      a20d01a56cfe   13 days ago              192MB\npostgres                            17        05ca97e1db19   2 weeks ago              438MB\ngolang                              1.23      1faeb2315208   2 weeks ago              833MB\ngcr.io/distroless/static-debian12   latest    115e3be4e9b9   7 weeks ago              1.99MB" },
          { command: "docker inspect -f 'User=\"{{.Config.User}}\" Cmd={{json .Config.Cmd}}' shelf-api:single", output: "User=\"\" Cmd=[\"/bin/sh\",\"-c\",\"/out/api\"]" },
          { command: 'docker history shelf-api:single | head -n 3', output: "IMAGE          CREATED                  CREATED BY                                      SIZE      COMMENT\n85c2b4e06d89   Less than a second ago   CMD [\"/bin/sh\" \"-c\" \"/out/api\"]                 0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   EXPOSE map[8000/tcp:{}]                         0B        buildkit.dockerfile.v0" },
        ],
      },
      {
        id: 'dkr15-ex-compose', title: '同事的 compose.yaml：三個服務都 Up，但缺了什麼', machine: 'dkr15-compose',
        description: 'api 的 depends_on 是簡短的清單；啟動事件裡 db、api、web 依序 Started，沒有 Waiting 與 Healthy；db 沒有健康狀態，資料落在以雜湊命名的匿名 Volume。',
        steps: [
          { command: 'cd shelf', output: "" },
          { command: 'grep -n -A 1 depends_on compose.yaml', output: "6:    depends_on:\n7-      - api\n--\n16:    depends_on:\n17-      - db" },
          { command: 'docker compose up -d 2>&1 | grep Container', output: " Container shelf-db-1  Creating\n Container shelf-db-1  Created\n Container shelf-api-1  Creating\n Container shelf-api-1  Created\n Container shelf-web-1  Creating\n Container shelf-web-1  Created\n Container shelf-db-1  Starting\n Container shelf-db-1  Started\n Container shelf-api-1  Starting\n Container shelf-api-1  Started\n Container shelf-web-1  Starting\n Container shelf-web-1  Started" },
          { command: "docker compose ps --format '{{.Name}} {{.Status}}'", output: "shelf-api-1 Up Less than a second\nshelf-db-1 Up Less than a second\nshelf-web-1 Up Less than a second" },
          { command: 'docker volume ls', output: "DRIVER    VOLUME NAME\nlocal     b0fcfb9c268ff1ccffada4b39d7271cf7e360c7f31bb6858c357dc95cdce7cd4" },
          { command: 'docker compose down', output: " Container shelf-web-1  Stopping\n Container shelf-web-1  Stopped\n Container shelf-api-1  Stopping\n Container shelf-api-1  Stopped\n Container shelf-db-1  Stopping\n Container shelf-db-1  Stopped\n Container shelf-web-1  Removing\n Container shelf-web-1  Removed\n Container shelf-api-1  Removing\n Container shelf-api-1  Removed\n Container shelf-db-1  Removing\n Container shelf-db-1  Removed\n Network shelf_default  Removing\n Network shelf_default  Removed" },
        ],
      },
      {
        id: 'dkr15-ex-release', title: '拉取 1.4.0、讀出 digest，再試一次只有 --read-only', machine: 'dkr15-prod',
        description: '以只能拉取的 deploy 帳號登入，拉取 1.4.0；Digest 一行與 docker images --digests 是同一個值。以 digest 執行一個只加 --read-only 的測試容器，程式建立不了 /tmp/shelf-api 而以 1 結束。',
        steps: [
          { command: 'cat deploy-token.txt | docker login registry.shelf.example -u deploy --password-stdin', output: "WARNING! Your password will be stored unencrypted in /home/hana/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded" },
          { command: 'docker pull registry.shelf.example/shelf/api:1.4.0', output: "1.4.0: Pulling from shelf/api\n89d509e3afa6: Pull complete\ne0e15e4a97e9: Pull complete\nDigest: sha256:810a5ab9a8ab0ca2e4d7b52bd16a1bfc2f7e53ced7339ec80e8ef3dfce01dbb7\nStatus: Downloaded newer image for registry.shelf.example/shelf/api:1.4.0\nregistry.shelf.example/shelf/api:1.4.0" },
          { command: 'docker images --digests registry.shelf.example/shelf/api', output: "REPOSITORY                         TAG       DIGEST                                                                    IMAGE ID       CREATED          SIZE\nregistry.shelf.example/shelf/api   1.4.0     sha256:810a5ab9a8ab0ca2e4d7b52bd16a1bfc2f7e53ced7339ec80e8ef3dfce01dbb7   025b3cb9ec74   40 minutes ago   11.2MB" },
          { command: `docker run -d --name ro-test --read-only -e DATABASE_URL=${PROD_DB_URL} -v ~/secrets/payment_api_key:${KEY_PATH}:ro ${API_REPO}@${DIGEST}`, output: "651d207e5e9b195fdb8b8504f1b0f29b5a776c9e5471cff5a91dc83bff261f22" },
          { command: 'docker logs ro-test', output: "shelf-api: mkdir /tmp/shelf-api: read-only file system" },
          { command: "docker ps -a --format '{{.Names}} {{.Status}}'", output: "ro-test Exited (1) Less than a second ago" },
          { command: 'docker rm ro-test', output: "ro-test" },
        ],
      },
      {
        id: 'dkr15-ex-checklist', title: 'prod-02 的第一輪檢查', machine: 'dkr15-golive',
        description: '照檢查清單：shelf-api 是 Restarting (137)，日誌只有反覆的啟動訊息，docker stats 看不到用量（它正在等待重新啟動），healthz 連不上（curl 的結束碼 7）。',
        steps: [
          { command: 'cat deploy/CHECKLIST.md', output: "# 上線檢查清單（每台 API 主機：部署之後與每天早上）\n1. docker ps：每個容器都是 Up，沒有 Restarting\n2. docker inspect：以 digest 執行；記憶體、CPU、唯讀、拿掉的能力與重新啟動策略和 ~/deploy/shelf-api.sh 一致\n3. docker stats --no-stream：記憶體穩定，低於上限的八成\n4. docker logs --since 10m：沒有錯誤，也沒有反覆出現的啟動訊息\n5. curl -s localhost:8000/healthz：回 ok" },
          { command: 'docker ps', output: "CONTAINER ID   IMAGE                                    COMMAND   CREATED          STATUS                           PORTS     NAMES\n25951711e58b   registry.shelf.example/shelf/api:1.4.0   \"/api\"    20 minutes ago   Restarting (137) 2 seconds ago             shelf-api" },
          { command: 'docker logs --tail 3 shelf-api', output: "shelf-api: version 1.4.0 listening on :8000\nshelf-api: version 1.4.0 listening on :8000\nshelf-api: version 1.4.0 listening on :8000" },
          { command: 'docker stats --no-stream', output: "CONTAINER ID   NAME        CPU %     MEM USAGE / LIMIT   MEM %     NET I/O   BLOCK I/O   PIDS\n25951711e58b   shelf-api   0.00%     0B / 0B             0.00%     0B / 0B   0B / 0B     0" },
          { command: 'curl -s localhost:8000/healthz; echo $?', output: "7" },
        ],
      },
    ],
    exercises,
  },
};
