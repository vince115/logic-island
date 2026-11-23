/*
 * DKR10 Multi-Stage Builds (DKR-4, terminal-sim). A terminal lesson on the compose profile (engine stage E23, §13.5):
 * a Go API (tally) built in one stage on golang:1.23 (844MB: the toolchain, gcc, module cache and source ship with it)
 * and then in stages (FROM … AS build, FROM build AS test, a distroless/static final stage with COPY --from=build: 11.1MB),
 * stage names and numbers, COPY --from an image (the CA bundle from alpine into scratch), a misspelt --from resolved as
 * an image, BuildKit skipping stages the target does not need, docker history of the final stage, distroless without a
 * shell (docker exec sh is OCI's 127), scratch, static versus dynamic linking (text only), --target for the build and
 * test stages, ARG before FROM versus inside a stage and --build-arg, and the go.mod-first cache order. Machine: the
 * Docker host forge-03 (user kai in the docker group; golang:1.23 with a declared history, distroless static, alpine;
 * the lesson's go mod download, go build and go test build tools; the projects tally and ferry). The host, user,
 * projects and sizes are made up. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const mine = (path: string, content: string) => file(path, content, 'kai');
const mineDir = (path: string) => dir(path, 'kai');

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const DISTROLESS = 'PRETTY_NAME="Distroless"\nNAME="Debian GNU/Linux"\nID="debian"\nVERSION_ID="12"\nVERSION="Debian GNU/Linux 12 (bookworm)"\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami', 'chmod', 'chown'];
const GO_PATH = 'PATH=/go/bin:/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

const GCC = 239_000_000;
const GOLANG: TerminalImage = {
  name: 'golang:1.23', size: 117_000_000 + 24_000_000 + 64_400_000 + GCC + 389_000_000, created: '2026-11-07 02:00:00', cmd: ['bash'], workdir: '/go', pulled: true, osRelease: DEBIAN,
  env: [GO_PATH, 'GOLANG_VERSION=1.23.3', 'GOTOOLCHAIN=local', 'GOPATH=/go'], commands: [...BASIC, 'go'],
  files: [{ path: '/usr/local/go/bin/go', content: '' }, { path: '/usr/local/go/bin/gofmt', content: '' }, { path: '/usr/bin/gcc', content: '' }],
  history: [
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
  ],
};
const STATIC: TerminalImage = {
  name: 'gcr.io/distroless/static-debian12:latest', size: 1_990_000, created: '2026-10-01 00:00:00', cmd: [], pulled: true, osRelease: DISTROLESS, commands: [], layers: 1,
  files: [
    { path: '/etc/passwd', content: 'root:x:0:0:root:/root:/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/sbin/nologin\nnonroot:x:65532:65532:nonroot:/home/nonroot:/sbin/nologin\n' },
    { path: '/etc/group', content: 'root:x:0:\nnobody:x:65534:\nnonroot:x:65532:\n' },
  ],
};
const ALPINE_IMG: TerminalImage = {
  name: 'alpine:3.21', size: 7_834_520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: ALPINE,
  files: [{ path: '/etc/ssl/certs/ca-certificates.crt', content: '# Mozilla CA certificate bundle\n' }],
};

const TALLY_RESPONDER = { id: 'tally-api', routes: [{ path: '/', body: 'tally ok\n', type: 'text/plain; charset=utf-8' }, { path: '/next', body: '{"number":42}\n', type: 'application/json' }] };
const FERRY_RESPONDER = { id: 'ferry-api', routes: [{ path: '/', body: '渡輪班表 API\n', type: 'text/plain; charset=utf-8' }, { path: '/healthz', body: 'ok\n', type: 'text/plain; charset=utf-8' }] };
const TEST_OUTPUT = '?   \texample.com/tally/cmd/tally\t[no test files]\nok  \texample.com/tally/internal/queue\t0.004s';

const DOCKER: TerminalDocker = {
  images: [GOLANG, STATIC, ALPINE_IMG],
  programs: [
    { command: ['/tally'], needs: ['/tally'], service: true, http: { port: 8080, responder: 'tally-api' }, logs: ['tally: listening on :8080'], stopExit: 0 },
    { command: ['/out/tally'], needs: ['/out/tally'], service: true, http: { port: 8080, responder: 'tally-api' }, logs: ['tally: listening on :8080'], stopExit: 0 },
    { command: ['go', 'test', './...'], needs: ['go.mod', 'internal/queue/queue_test.go'], output: `${TEST_OUTPUT}\n` },
    { command: ['/ferry'], needs: ['/ferry'], service: true, http: { port: 8080, responder: 'ferry-api' }, logs: ['ferry: serving on :8080'], stopExit: 0 },
    { command: ['/out/ferry'], needs: ['/out/ferry'], service: true, http: { port: 8080, responder: 'ferry-api' }, logs: ['ferry: serving on :8080'], stopExit: 0 },
  ],
  tools: [
    { command: ['go', 'mod', 'download'], needs: ['go.mod', 'go.sum'], writes: [{ path: '/go/pkg/mod/cache/download/github.com/go-chi/chi/v5/@v/v5.1.0.zip', size: 1_240_000 }], seconds: 2.4 },
    { command: ['go', 'build', '-o', '/out/tally', './cmd/tally'], needs: ['go.mod', 'cmd/tally/main.go'], writes: [{ path: '/out/tally', size: 9_100_000, mode: 0o755 }], seconds: 7.4 },
    { command: ['go', 'test', './...'], needs: ['go.mod', 'internal/queue/queue_test.go'], writes: [], output: TEST_OUTPUT, seconds: 3.1 },
    { command: ['go', 'build', '-o', '/out/ferry', './cmd/ferry'], needs: ['go.mod', 'cmd/ferry/main.go'], writes: [{ path: '/out/ferry', size: 6_800_000, mode: 0o755 }], seconds: 5.2 },
  ],
};

const TALLY_MOD = 'module example.com/tally\n\ngo 1.23\n\nrequire github.com/go-chi/chi/v5 v5.1.0\n';
const TALLY_SUM = 'github.com/go-chi/chi/v5 v5.1.0 h1:85SM5sHqVObsUptd003lIUPZQcHBHu8Bny/AsE5M9VU=\ngithub.com/go-chi/chi/v5 v5.1.0/go.mod h1:KHoNZHSyIGIAOfmMn9qFBmT1YnbmW5rBDCBtUG6QaRQ=\n';
const TALLY_MAIN = 'package main\n\nimport (\n\t"log"\n\t"net/http"\n\n\t"github.com/go-chi/chi/v5"\n\n\t"example.com/tally/internal/queue"\n)\n\nfunc main() {\n\tq := queue.New()\n\tr := chi.NewRouter()\n\tr.Get("/", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("tally ok\\n")) })\n\tr.Get("/next", q.Next)\n\tlog.Println("tally: listening on :8080")\n\tlog.Fatal(http.ListenAndServe(":8080", r))\n}\n';
const TALLY_QUEUE = 'package queue\n\nimport (\n\t"fmt"\n\t"net/http"\n\t"sync"\n)\n\ntype Queue struct {\n\tmu   sync.Mutex\n\tlast int\n}\n\nfunc New() *Queue { return &Queue{last: 41} }\n\nfunc (q *Queue) Take() int {\n\tq.mu.Lock()\n\tdefer q.mu.Unlock()\n\tq.last++\n\treturn q.last\n}\n\nfunc (q *Queue) Next(w http.ResponseWriter, _ *http.Request) {\n\tw.Header().Set("Content-Type", "application/json")\n\tfmt.Fprintf(w, "{\\"number\\":%d}\\n", q.Take())\n}\n';
const TALLY_TEST = 'package queue\n\nimport "testing"\n\nfunc TestTake(t *testing.T) {\n\tq := New()\n\tif got := q.Take(); got != 42 {\n\t\tt.Fatalf("Take() = %d, want 42", got)\n\t}\n}\n';
const TALLY_SINGLE = 'FROM golang:1.23\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN go build -o /out/tally ./cmd/tally\nEXPOSE 8080\nCMD ["/out/tally"]\n';
const TALLY_MULTI = 'ARG GO_VERSION=1.23\n\nFROM golang:${GO_VERSION} AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/tally ./cmd/tally\n\nFROM build AS test\nRUN go test ./...\nCMD ["go", "test", "./..."]\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/tally /tally\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT ["/tally"]\n';
const TALLY_SCRATCH = 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/tally ./cmd/tally\n\nFROM scratch\nCOPY --from=alpine:3.21 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/\nCOPY --from=build /out/tally /tally\nEXPOSE 8080\nENTRYPOINT ["/tally"]\n';
const TALLY_RELEASE = 'ARG GO_VERSION=1.23\nARG APP_VERSION=dev\n\nFROM golang:${GO_VERSION} AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/tally ./cmd/tally\n\nFROM gcr.io/distroless/static-debian12\nLABEL org.opencontainers.image.version=$APP_VERSION\nCOPY --from=build /out/tally /tally\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT ["/tally"]\n';

const FERRY_MOD = 'module example.com/ferry\n\ngo 1.23\n';
const FERRY_MAIN = 'package main\n\nimport (\n\t"log"\n\t"net/http"\n)\n\nfunc main() {\n\thttp.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("渡輪班表 API\\n")) })\n\thttp.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok\\n")) })\n\tlog.Println("ferry: serving on :8080")\n\tlog.Fatal(http.ListenAndServe(":8080", nil))\n}\n';
const FERRY_SINGLE = 'FROM golang:1.23\nWORKDIR /src\nCOPY . .\nRUN go build -o /out/ferry ./cmd/ferry\nEXPOSE 8080\nCMD ["/out/ferry"]\n';

const FORGE: TerminalMachine = {
  id: 'dkr10-forge', title: 'forge-03（Docker 主機：tally 與 ferry 兩個 Go 服務）', user: 'kai', host: 'forge-03', cwd: '/home/kai/tally', profile: 'compose',
  now: '2026-11-23 10:15:00', boot: '2026-11-23 07:00:00',
  files: [
    dir('/home'), dir('/home/kai', 'kai', 0o750),
    mineDir('/home/kai/tally'), mine('/home/kai/tally/go.mod', TALLY_MOD), mine('/home/kai/tally/go.sum', TALLY_SUM),
    mineDir('/home/kai/tally/cmd'), mineDir('/home/kai/tally/cmd/tally'), mine('/home/kai/tally/cmd/tally/main.go', TALLY_MAIN),
    mineDir('/home/kai/tally/internal'), mineDir('/home/kai/tally/internal/queue'), mine('/home/kai/tally/internal/queue/queue.go', TALLY_QUEUE),
    mine('/home/kai/tally/internal/queue/queue_test.go', TALLY_TEST),
    mine('/home/kai/tally/Dockerfile.single', TALLY_SINGLE), mine('/home/kai/tally/Dockerfile', TALLY_MULTI), mine('/home/kai/tally/scratch.Dockerfile', TALLY_SCRATCH),
    mine('/home/kai/tally/release.Dockerfile', TALLY_RELEASE), mine('/home/kai/tally/.dockerignore', '.git\n*.md\n'),
    mineDir('/home/kai/ferry'), mine('/home/kai/ferry/go.mod', FERRY_MOD), mineDir('/home/kai/ferry/cmd'), mineDir('/home/kai/ferry/cmd/ferry'),
    mine('/home/kai/ferry/cmd/ferry/main.go', FERRY_MAIN), mine('/home/kai/ferry/Dockerfile', FERRY_SINGLE),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['kai'] }, { name: 'docker', gid: 988, members: ['kai'] }] },
  responders: [TALLY_RESPONDER, FERRY_RESPONDER],
  docker: DOCKER,
};


/** Writes a whole file in one command (the way the exercises' solutions rewrite a Dockerfile). */
const rewrite = (name: string, text: string) => `printf '${text.replace(/\n/g, '\\n')}' > ${name}`;

// Exercise 1: ferry in two stages, only the binary in a distroless image.
const FERRY_MULTI = 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/ferry ./cmd/ferry\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/ferry /ferry\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT ["/ferry"]\n';
const FERRY_GOLANG_TWICE = 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/ferry ./cmd/ferry\n\nFROM golang:1.23\nCOPY --from=build /out/ferry /ferry\nEXPOSE 8080\nENTRYPOINT ["/ferry"]\n';
const FERRY_NO_NAME = 'FROM golang:1.23\nWORKDIR /src\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/ferry ./cmd/ferry\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/ferry /ferry\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT ["/ferry"]\n';
const FERRY_OLD_PATH = 'FROM golang:1.23 AS build\nWORKDIR /src\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/ferry ./cmd/ferry\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/ferry /ferry\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT ["/out/ferry"]\n';
const RUN_FERRY = 'docker run -d --name ferry -p 8081:8080 ferry:2.0';

// Exercise 2: the release label needs the global ARG declared again inside the final stage.
const RELEASE_FIXED = TALLY_RELEASE.replace('FROM gcr.io/distroless/static-debian12\n', 'FROM gcr.io/distroless/static-debian12\nARG APP_VERSION\n');
const RELEASE_IN_BUILD = TALLY_RELEASE.replace('AS build\n', 'AS build\nARG APP_VERSION\n');
const RELEASE_TYPED = TALLY_RELEASE.replace('version=$APP_VERSION', 'version=1.4.0');
const release = (version: string) => `docker build -q -f release.Dockerfile --build-arg APP_VERSION=${version} -t tally:${version} .`;

export const DKR10: LessonContent = {
  lessonId: 'DKR10',
  motivation: 'DKR05 與 DKR06 的 Dockerfile 都只有一個 FROM：建置用的東西和執行用的東西放在同一個 Image 裡。對 Python 這類直接執行原始碼的語言差別不大，對 Go、Java、Rust 或需要打包的前端這類「先編譯、再執行」的專案就很浪費。forge-03 上的 tally 是一個用 Go 寫的叫號 API，以 golang:1.23 一個階段建置出來的 Image 有 844MB：Debian、gcc、git、整套 Go 工具鏈、模組快取與原始碼全都跟著上線，真正執行時需要的卻只有一個 9.1MB 的執行檔。多階段建置（multi-stage build）讓一份 Dockerfile 有好幾個 FROM：前面的建置階段用完整的工具編譯，最後的執行階段從精簡的基底 Image 開始，用 COPY --from 只把產出物複製過來。tally 因此從 844MB 變成 11.1MB，裡面沒有編譯器、沒有套件管理器，連 Shell 都沒有：拉取與部署更快，弱點掃描要追的套件更少，萬一服務被入侵，攻擊者手邊能用的工具也少得多。這一課在 forge-03 上比較兩種寫法的大小與歷史，認識 alpine、distroless 與 scratch 三種精簡基底，用 --target 只建置某一個階段來除錯或執行測試，並用建置參數（ARG 與 --build-arg）把版本號帶進 Image。',
  sections: [
    {
      id: 'dkr10-s-single', title: '建置階段與執行階段需要的東西不同',
      blocks: [
        { type: 'p', text: '編譯式語言的專案，建置時與執行時需要的東西差很多。建置時要有編譯器、原始碼、下載的相依模組，有時還要 gcc 與 make；編譯完成後，執行時只需要編譯出來的產出物（artifact）——對 Go 來說，就是一個執行檔。單一階段的 Dockerfile 把兩者放在同一個 Image 裡，等於把整個工作台和工具箱一起出貨。' },
        { type: 'table', head: ['Image 裡的東西', '建置時', '執行時'], rows: [
          ['Go 工具鏈（/usr/local/go 的 go、gofmt）', '需要：編譯', '不需要'],
          ['gcc、make、git 等開發套件', 'cgo 或抓取模組時需要', '不需要，反而是攻擊者的工具'],
          ['原始碼與 Dockerfile（/src）', '需要', '不需要，還可能洩漏內部程式'],
          ['相依模組的快取（/go/pkg/mod）', '需要', '不需要'],
          ['編譯出來的執行檔（/out/tally）', '建置的產出', '唯一需要的東西'],
          ['Shell、ls、apt 等工具', 'RUN 要用', '程式本身用不到'],
        ] },
        { type: 'p', text: 'forge-03 的 ~/tally 是一個 Go 寫的叫號 API（`/next` 回傳下一個號碼），Dockerfile.single 用 golang:1.23 一個階段建置。它已經照 DKR06 的原則排好指令順序：先複製 go.mod 與 go.sum、下載模組，再複製原始碼、編譯：' },
        { type: 'example', id: 'dkr10-single' },
        { type: 'p', text: '844MB 裡有 833MB 是 golang:1.23 這個基底：`docker history` 的下半部是它的歷史，117MB 的 Debian、24MB 與 64.4MB 的常用工具（curl、git、ssh 用戶端等）、239MB 的 gcc 與 C 開發套件、389MB 的 Go 工具鏈。這份 Dockerfile 自己只加了 1.24MB 的模組下載、2.13kB 的原始碼與 9.1MB 的執行檔。`ls /usr/local/go/bin` 與 `ls /src` 證明編譯器、原始碼，連 Dockerfile 本身都在 Image 裡。DKR06 學過的瘦身技巧在這裡幫不上忙：用 RUN rm 刪掉工具鏈只會多一個遮住它的 0B 層，基底的層一個位元組也不會少；換成較小的 golang 基底也一樣，編譯需要的東西終究得在 Image 裡。要真正擺脫它們，得讓「建置」與「執行」各自有一個起點。' },
      ],
    },
    {
      id: 'dkr10-s-stages', title: '多階段建置：AS 命名與 COPY --from',
      blocks: [
        { type: 'p', text: '一份 Dockerfile 可以有好幾個 FROM。每個 FROM 開始一個新的階段（stage），從自己的基底重新開始，前一個階段的檔案不會自動帶過來。`FROM 基底 AS 名稱` 替階段命名；沒有名稱的階段可以用從 0 開始的編號指名（第一個 FROM 是 0）。要把前面階段的東西帶過來，只能明確地寫 `COPY --from=名稱 來源 目的地`，來源是那個階段裡的絕對路徑。最後一個階段就是建置出來的 Image：它只包含自己基底的層加上自己的步驟產生的層，前面的建置階段只是過程，不會留在最後的 Image 裡。' },
        { type: 'table', head: ['寫法', '意思'], rows: [
          ['`FROM golang:1.23 AS build`', '開始一個名為 build 的階段'],
          ['`FROM build AS test`', '以 build 階段的結果為基底開始新的階段，檔案、ENV、WORKDIR 都繼承下來'],
          ['`COPY --from=build /out/tally /tally`', '從 build 階段複製檔案（也可以是資料夾或萬用字元）到這個階段'],
          ['`COPY --from=0 /out/tally /tally`', '以編號指名第一個階段；加入或刪除階段時編號會變，所以最好命名'],
          ['`COPY --from=alpine:3.21 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/`', '--from 不是任何階段的名稱時當成 Image 的名稱，直接從那個 Image 複製檔案'],
        ] },
        { type: 'p', text: 'tally 的 Dockerfile 有三個階段：build 編譯，test 以 build 為基底執行測試，最後一個沒有名稱的階段從 distroless 開始，只複製執行檔。下面先建置一次 Dockerfile.single 讓建置快取裡有它的步驟，再建置多階段的版本：' },
        { type: 'example', id: 'dkr10-multi' },
        { type: 'p', text: '讀建置輸出：有兩個以上的階段時，每一步前面標出所屬的階段，build 的步驟是 `[build 2/6]`，沒有名稱的最後一個階段是 `[stage-2 1/2]`（它是第三個 FROM，編號 2）。build 階段前四步和 Dockerfile.single 一模一樣，所以都是 CACHED；`RUN go build` 重新執行，是因為它前面多了 `ENV CGO_ENABLED=0`，環境變數是 RUN 快取鍵的一部分（DKR06）。test 階段完全沒有出現：BuildKit 從目標（最後一個階段）往回找它需要的階段，最後的階段只用到 build，test 就被略過。結果 tally:2.0 只有 11.1MB，`docker history` 只剩 5 列：1.99MB 的 distroless 基底、9.1MB 的 COPY --from，以及三列 0B 的設定。golang 的 833MB 不在這個 Image 的任何一層裡。' },
        { type: 'callout', tone: 'warning', title: '--from 的名稱打錯，就變成去拉 Image', text: '寫了 `FROM golang:1.23 AS build`，卻在後面寫 `COPY --from=builder …`；或是第一個 FROM 忘了加 `AS build`。BuildKit 找不到這個名稱的階段，就把它當成 Image 的名稱，去 Docker Hub 找 docker.io/library/builder:latest，錯誤是 `failed to resolve source metadata for docker.io/library/builder:latest: pull access denied …`。錯誤訊息講的是拉取，原因卻是階段名稱：看到 `load metadata for docker.io/library/<你的階段名稱>`，先檢查 AS 與 --from 的拼字。' },
        { type: 'p', text: '只複製執行需要的產出物：執行檔、必要的設定檔或靜態資源。`COPY --from=build / /` 或 `COPY --from=build /src /src` 把整個建置環境搬過去，等於退回單一階段，編譯器、原始碼與快取全都回來了。這個做法不限於 Go：前端專案可以在 node 的建置階段執行 `npm ci` 與打包，最後只把打包好的 dist 資料夾複製進 nginx 的階段；需要 C 編譯器才能安裝的 Python 套件，也可以在完整的 python 階段安裝，再只把裝好的套件資料夾複製到 slim 的階段。' },
      ],
    },
    {
      id: 'dkr10-s-bases', title: '精簡基底 Image：alpine、distroless 與 scratch',
      blocks: [
        { type: 'p', text: '有了多階段建置，執行階段的基底只需要滿足「讓產出物跑起來」。常見的精簡基底 Image 有三種，差別在於裡面還剩下多少東西：' },
        { type: 'table', head: ['基底', '本課主機上的大小', 'Shell 與套件管理器', '適合'], rows: [
          ['golang:1.23', '833MB', '有 bash、apt，還有整套編譯工具', '只當建置階段'],
          ['alpine:3.21', '7.83MB', '有 BusyBox 的 sh 與 apk；C 函式庫是 musl', '需要 Shell 或少量套件的服務；在 glibc 上動態連結的程式不能直接放進來'],
          ['gcr.io/distroless/static-debian12', '1.99MB', '沒有；只有 CA 憑證、時區資料與 /etc/passwd（root、nonroot 65532、nobody）', '靜態連結的執行檔，例如 CGO_ENABLED=0 的 Go 程式'],
          ['gcr.io/distroless/base-debian12', '比 static 大一些', '沒有；多了 glibc 與 OpenSSL 等函式庫', '動態連結 glibc 的執行檔'],
          ['scratch', '0B', '什麼都沒有，連 /etc/passwd 與 CA 憑證都沒有', '完全自給自足的靜態執行檔，其他需要的檔案自己 COPY 進去'],
        ] },
        { type: 'p', text: 'distroless 是 Google 維護的一系列 Image，只放執行程式需要的檔案，刻意不放 Shell 與套件管理器。下面執行 distroless 版本的 tally，再用 scratch 建置另一個版本：scratch 沒有 CA 憑證，程式要連 HTTPS 時會無法驗證對方，所以用 `COPY --from=alpine:3.21` 直接從 alpine 這個 Image 取一份憑證檔。' },
        { type: 'example', id: 'dkr10-distroless' },
        { type: 'p', text: '服務一切正常，`curl` 拿到了號碼；但 `docker exec tally sh` 得到 OCI 的「executable file not found in $PATH」與結束碼 127，連 `ls` 也一樣：Image 裡就是沒有這些程式。這正是 distroless 的目的，卻也代表不能進容器四處看。要除錯時可以看 `docker logs`；要檢查建置結果，用下一節的 `--target build` 建置出有 Shell 的建置階段；distroless 另外提供帶 BusyBox Shell 的 `:debug` 標籤，只在除錯時暫時換用，不要拿去上線。scratch 版本只有 9.1MB，但它沒有 /etc/passwd，`USER nonroot` 這種以名稱指定的使用者在執行時找不到，要改寫數字的 `USER 65532`。' },
        { type: 'callout', tone: 'warning', title: '在 distroless 或 scratch 裡期待有 Shell', text: '常見的錯誤有三種：用 `docker exec 容器 sh` 進去除錯，得到 executable file not found；ENTRYPOINT 或 CMD 寫成 shell 形式（`ENTRYPOINT /tally`），Docker 要用 /bin/sh -c 執行，而 Image 裡沒有 /bin/sh，容器根本啟動不了；在執行階段寫 `RUN mkdir …` 之類的 RUN，同樣因為沒有 /bin/sh 而建置失敗。所以精簡的執行階段一律用 exec 形式的 ENTRYPOINT 與 CMD，需要的資料夾與檔案在建置階段準備好，再用 COPY --from 帶過來。' },
        { type: 'callout', tone: 'note', title: '靜態連結與動態連結', text: 'Go 在可以使用 cgo 時（例如 golang Image 裡有 gcc），用到 net 或 os/user 套件的程式會動態連結系統的 C 函式庫。把這樣的執行檔放進 scratch 或 distroless/static，啟動時核心找不到動態載入器（例如 /lib64/ld-linux-x86-64.so.2），錯誤訊息卻是 no such file or directory，看起來像是執行檔不見了。所以 tally 在編譯前設定 `ENV CGO_ENABLED=0` 產生靜態執行檔；真的需要 cgo 時，改用 distroless/base 或 debian 的 slim 版本。同樣地，在 glibc 環境動態連結的程式也不能直接放進使用 musl 的 alpine。' },
        { type: 'p', text: '精簡基底的好處不只是大小。Image 裡的每個套件都可能有已知的弱點（CVE），弱點掃描工具會一個一個列出來，套件越少要追蹤與更新的就越少；沒有 Shell、沒有套件管理器、沒有編譯器，服務即使被攻破，攻擊者也很難下載或編譯自己的工具。再加上 `USER nonroot` 讓程式不以 root 執行，就是正式環境 Image 的常見組合。' },
      ],
    },
    {
      id: 'dkr10-s-target', title: '--target：只建置到某一個階段',
      blocks: [
        { type: 'p', text: '`docker build --target 階段名稱` 讓建置停在指定的階段，那個階段就成為建置出來的 Image；BuildKit 只建置這個階段需要的階段。常見的用法有三種：停在建置階段，得到一個有 Shell、有原始碼與產出物的 Image 來除錯；建置測試階段，在建置過程中執行測試；同一份 Dockerfile 再放一個開發用的階段（例如帶有熱重載工具），開發時用 `--target dev`，正式環境用最後的階段。' },
        { type: 'example', id: 'dkr10-target' },
        { type: 'p', text: 'tally:build 是 844MB 的建置環境，`ls /out` 看得到編譯好的 tally，`/go/pkg/mod/cache` 裡有下載的模組。之後的正式建置沿用同一份快取：build 階段的五個步驟都是 CACHED（`grep -c` 數到 5 行），只有最後階段的 COPY --from 需要執行，得到的仍是 11.1MB 的 tally:2.0。' },
        { type: 'table', head: ['指令', '建置哪些階段', '結果'], rows: [
          ['`docker build -t tally:2.0 .`', 'build 與最後的階段（test 被略過）', '11.1MB 的正式 Image'],
          ['`docker build --target build -t tally:build .`', '只有 build', '844MB，可以進去檢查建置結果'],
          ['`docker build --target test -t tally:test .`', 'build 與 test', '建置時執行 `go test ./...`，測試失敗就讓建置失敗'],
          ['`docker build --target tests .`', '沒有', '`target stage "tests" could not be found`'],
        ] },
        { type: 'p', text: '測試階段的 `RUN go test ./...` 在建置時執行，測試失敗時這個 RUN 的結束碼不是 0，建置就失敗。但要記得：BuildKit 只建置目標需要的階段，最後的階段只 COPY --from=build，所以一般的 `docker build` 根本不會執行測試。CI 要另外執行 `docker build --target test`，或是讓最後的階段依賴測試階段（例如改成從 test 階段 COPY --from）。舊的建置器（`DOCKER_BUILDKIT=0`）會依序建置目標之前的每一個階段，行為不同，所以不要依賴「寫在前面就會執行」。' },
      ],
    },
    {
      id: 'dkr10-s-args', title: '建置參數與快取',
      blocks: [
        { type: 'p', text: 'ARG 宣告建置參數，`docker build --build-arg 名稱=值` 在建置時給它值，沒有給就用 ARG 寫的預設值。在多階段的 Dockerfile 裡，ARG 寫在哪裡決定了它能用在哪裡：' },
        { type: 'table', head: ['ARG 的位置', '可以用在', '例子'], rows: [
          ['第一個 FROM 之前', '只有 FROM 那一行（例如選基底的版本）', '`ARG GO_VERSION=1.23`、`FROM golang:${GO_VERSION} AS build`'],
          ['某個階段裡面', '從宣告的地方到這個階段結束的指令（RUN、LABEL、ENV、COPY…）', '`ARG APP_VERSION=dev`、`LABEL org.opencontainers.image.version=$APP_VERSION`'],
          ['FROM 之前有預設值，階段裡要用', '在那個階段裡再寫一行沒有值的 `ARG 名稱`，就拿到 FROM 之前的預設值或 --build-arg 的值', '`ARG APP_VERSION`'],
        ] },
        { type: 'p', text: '每個 FROM 都重新開始一個範圍：FROM 之前宣告的 ARG 在階段裡是看不到的，`$APP_VERSION` 會靜靜地變成空字串，不會有任何錯誤；同一個參數要在兩個階段使用，就在兩個階段各寫一次 `ARG 名稱`。建置參數也不是放秘密的地方：ARG 宣告之後的每個 RUN 都會把它的值記在 `docker history` 裡（`RUN |1 名稱=值 /bin/sh -c …`），拉取 Image 的人都看得到；密碼與 Token 要用 BuildKit 的 secret 掛載（`RUN --mount=type=secret`），模擬環境沒有模擬這個功能。' },
        { type: 'p', text: '快取的規則和 DKR06 相同，多階段建置也照樣受惠：build 階段先複製 go.mod 與 go.sum、執行 `go mod download`，最後才 `COPY . .` 與編譯。下面在 main.go 加一行註解再建置，然後用 `--build-arg` 換掉 FROM 之前的 GO_VERSION：' },
        { type: 'example', id: 'dkr10-cache-arg' },
        { type: 'p', text: '改了 main.go，模組下載維持 CACHED，只有 `COPY . .`、`go build` 與最後階段的 COPY --from 重新執行：COPY --from 的快取鍵包含來源階段的鍵與複製的檔案，執行檔變了，它就重新複製。只有 go.mod 或 go.sum 改變時，才需要重新下載模組。`--build-arg GO_VERSION=1.24` 讓 FROM 變成 golang:1.24，這台主機模擬的 Docker Hub 沒有這個版本，建置在 load metadata 就失敗了——這也證明了 FROM 之前的 ARG 確實作用在 FROM 上。另外，ARG 的值改變會讓宣告之後的 RUN 失效（DKR06），所以每次發行都不同的版本號，應該宣告在最後的階段、昂貴的編譯步驟之後；寫在 build 階段的開頭，每個版本都要重新編譯一次。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '本課的多階段建置依 Docker CE 27.5.1 預設的 BuildKit 模擬，輸出一律是 plain 格式。go build、go mod download 與 go test 是課程宣告的建置工具：模擬環境不真的編譯，產出的檔案與它們的大小是課程資料。基底 Image 裡的檔案沒有逐一計算大小，所以 `COPY --from=build / /` 這種錯誤在這裡看不出真實的體積；執行檔的靜態或動態連結也不模擬，只在課文說明。真實的 BuildKit 會並行建置不同的階段，輸出可能交錯，模擬環境依序列出。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [FORGE],
    examples: [
      {
        id: 'dkr10-single', title: '單一階段：編譯器跟著上線', machine: 'dkr10-forge',
        description: '用 golang:1.23 一個階段建置 tally，看 Image 的大小與歷史，以及留在裡面的 Go 工具鏈與原始碼。',
        steps: [
          { command: 'cat Dockerfile.single', output: "FROM golang:1.23\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nRUN go build -o /out/tally ./cmd/tally\nEXPOSE 8080\nCMD [\"/out/tally\"]" },
          { command: 'docker build -q -f Dockerfile.single -t tally:fat .', output: "sha256:7890a60dddf504db2f9ce0169322335c2535ccf4a088d672c9c4f3812a26d361" },
          { command: 'docker images tally', output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntally        fat       7890a60dddf5   Less than a second ago   844MB" },
          { command: 'docker history tally:fat', output: "IMAGE          CREATED                  CREATED BY                                      SIZE      COMMENT\n7890a60dddf5   Less than a second ago   CMD [\"/out/tally\"]                              0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   EXPOSE map[8080/tcp:{}]                         0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   RUN /bin/sh -c go build -o /out/tally ./cmd/…   9.1MB     buildkit.dockerfile.v0\n<missing>      Less than a second ago   COPY . . # buildkit                             2.13kB    buildkit.dockerfile.v0\n<missing>      Less than a second ago   RUN /bin/sh -c go mod download # buildkit       1.24MB    buildkit.dockerfile.v0\n<missing>      Less than a second ago   COPY go.mod go.sum ./ # buildkit                242B      buildkit.dockerfile.v0\n<missing>      Less than a second ago   WORKDIR /src                                    0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              WORKDIR /go                                     0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              RUN /bin/sh -c mkdir -p \"$GOPATH/src\" \"$GOPA…   0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              COPY /target/ / # buildkit                      389MB     buildkit.dockerfile.v0\n<missing>      2 weeks ago              ENV PATH=/go/bin:/usr/local/go/bin:/usr/loca…   0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              ENV GOPATH=/go                                  0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              ENV GOTOOLCHAIN=local                           0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              ENV GOLANG_VERSION=1.23.3                       0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              RUN /bin/sh -c set -eux;  apt-get update;  a…   239MB     buildkit.dockerfile.v0\n<missing>      2 weeks ago              RUN /bin/sh -c set -eux;  apt-get update;  a…   64.4MB    buildkit.dockerfile.v0\n<missing>      2 weeks ago              RUN /bin/sh -c set -eux;  apt-get update;  a…   24MB      buildkit.dockerfile.v0\n<missing>      2 weeks ago              CMD [\"bash\"]                                    0B        buildkit.dockerfile.v0\n<missing>      2 weeks ago              # debian.sh --arch 'amd64' out/ 'bookworm' '…   117MB     buildkit.dockerfile.v0" },
          { command: 'docker run --rm tally:fat ls /usr/local/go/bin', output: "go\ngofmt" },
          { command: 'docker run --rm tally:fat ls /src', output: "Dockerfile\nDockerfile.single\ncmd\ngo.mod\ngo.sum\ninternal\nrelease.Dockerfile\nscratch.Dockerfile" },
        ],
      },
      {
        id: 'dkr10-multi', title: '多階段：只把執行檔帶到最後', machine: 'dkr10-forge',
        description: '同一個專案改用三個階段的 Dockerfile：建置階段命中前一次的快取，test 階段被略過，最後的 Image 只有 distroless 加上執行檔。',
        steps: [
          { command: 'cat Dockerfile', output: "ARG GO_VERSION=1.23\n\nFROM golang:${GO_VERSION} AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/tally ./cmd/tally\n\nFROM build AS test\nRUN go test ./...\nCMD [\"go\", \"test\", \"./...\"]\n\nFROM gcr.io/distroless/static-debian12\nCOPY --from=build /out/tally /tally\nEXPOSE 8080\nUSER nonroot\nENTRYPOINT [\"/tally\"]" },
          { command: 'docker build -q -f Dockerfile.single -t tally:fat .', output: "sha256:7890a60dddf504db2f9ce0169322335c2535ccf4a088d672c9c4f3812a26d361" },
          { command: 'docker build -t tally:2.0 .', output: "#0 building with \"default\" instance using docker driver\n\n#1 [internal] load build definition from Dockerfile\n#1 transferring dockerfile: 366B done\n#1 DONE 0.0s\n\n#2 [internal] load metadata for docker.io/library/golang:1.23\n#2 DONE 0.5s\n\n#3 [internal] load metadata for gcr.io/distroless/static-debian12:latest\n#3 DONE 0.5s\n\n#4 [internal] load .dockerignore\n#4 transferring context: 10B done\n#4 DONE 0.0s\n\n#5 [build 1/6] FROM docker.io/library/golang:1.23@sha256:75c2ce4495540d6fd34c717548bcc9851d55530dca4c58aedc3d3b2e10a304ec\n#5 resolve docker.io/library/golang:1.23@sha256:75c2ce4495540d6fd34c717548bcc9851d55530dca4c58aedc3d3b2e10a304ec done\n#5 DONE 0.0s\n\n#6 [stage-2 1/2] FROM gcr.io/distroless/static-debian12:latest@sha256:6aab7c09555b5cc5bb4059f58367093e4e6dfb9f2cddde25bd1fedb05f397b7d\n#6 resolve gcr.io/distroless/static-debian12:latest@sha256:6aab7c09555b5cc5bb4059f58367093e4e6dfb9f2cddde25bd1fedb05f397b7d done\n#6 DONE 0.0s\n\n#7 [internal] load build context\n#7 transferring context: 2.375kB done\n#7 DONE 0.0s\n\n#8 [build 2/6] WORKDIR /src\n#8 CACHED\n\n#9 [build 3/6] COPY go.mod go.sum ./\n#9 CACHED\n\n#10 [build 4/6] RUN go mod download\n#10 CACHED\n\n#11 [build 5/6] COPY . .\n#11 CACHED\n\n#12 [build 6/6] RUN go build -o /out/tally ./cmd/tally\n#12 DONE 7.6s\n\n#13 [stage-2 2/2] COPY --from=build /out/tally /tally\n#13 DONE 0.0s\n\n#14 exporting to image\n#14 exporting layers 0.1s done\n#14 writing image sha256:3c847b807cb9a816d2c346d68b4dcb5ecb2c3901f996a86435ab2c8fd9ec3944 done\n#14 naming to docker.io/library/tally:2.0 done\n#14 DONE 0.1s" },
          { command: 'docker images tally', output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntally        2.0       3c847b807cb9   Less than a second ago   11.1MB\ntally        fat       7890a60dddf5   Less than a second ago   844MB" },
          { command: 'docker history tally:2.0', output: "IMAGE          CREATED                  CREATED BY                                      SIZE      COMMENT\n3c847b807cb9   Less than a second ago   ENTRYPOINT [\"/tally\"]                           0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   USER nonroot                                    0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   EXPOSE map[8080/tcp:{}]                         0B        buildkit.dockerfile.v0\n<missing>      Less than a second ago   COPY --from=build /out/tally /tally # buildk…   9.1MB     buildkit.dockerfile.v0\n<missing>      7 weeks ago              ADD rootfs.tar.xz / # buildkit                  1.99MB    buildkit.dockerfile.v0" },
          { command: "docker image inspect -f '{{.Config.User}} {{.Config.Entrypoint}}' tally:2.0", output: "nonroot [/tally]" },
        ],
      },
      {
        id: 'dkr10-distroless', title: '沒有 Shell 的 Image 與 scratch', machine: 'dkr10-forge',
        description: '執行 distroless 的 tally，服務正常，但 docker exec 找不到 sh 與 ls；再用 scratch 加上從 alpine 複製的 CA 憑證建置另一個版本。',
        steps: [
          { command: 'docker build -q -t tally:2.0 .', output: "sha256:3c847b807cb9a816d2c346d68b4dcb5ecb2c3901f996a86435ab2c8fd9ec3944" },
          { command: 'docker run -d --name tally -p 8080:8080 tally:2.0', output: "509c5361856fbbfbb5dc55f12afab65144409572b4e52dcf9b345a0a01f9ec6e" },
          { command: 'curl -s localhost:8080/next', output: "{\"number\":42}" },
          { command: 'docker exec tally sh', output: "OCI runtime exec failed: exec failed: unable to start container process: exec: \"sh\": executable file not found in $PATH: unknown" },
          { command: 'echo $?', output: "127" },
          { command: 'docker exec tally ls /', output: "OCI runtime exec failed: exec failed: unable to start container process: exec: \"ls\": executable file not found in $PATH: unknown" },
          { command: 'cat scratch.Dockerfile', output: "FROM golang:1.23 AS build\nWORKDIR /src\nCOPY go.mod go.sum ./\nRUN go mod download\nCOPY . .\nENV CGO_ENABLED=0\nRUN go build -o /out/tally ./cmd/tally\n\nFROM scratch\nCOPY --from=alpine:3.21 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/\nCOPY --from=build /out/tally /tally\nEXPOSE 8080\nENTRYPOINT [\"/tally\"]" },
          { command: "docker build -f scratch.Dockerfile -t tally:scratch . 2>&1 | grep -E '^#[0-9]+ (\\[|FROM)'", output: "#1 [internal] load build definition from scratch.Dockerfile\n#2 [internal] load metadata for docker.io/library/golang:1.23\n#3 [internal] load metadata for docker.io/library/alpine:3.21\n#4 [internal] load .dockerignore\n#5 [build 1/6] FROM docker.io/library/golang:1.23@sha256:75c2ce4495540d6fd34c717548bcc9851d55530dca4c58aedc3d3b2e10a304ec\n#6 [stage-1 1/3] FROM scratch\n#7 FROM docker.io/library/alpine:3.21@sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec\n#8 [internal] load build context\n#9 [build 2/6] WORKDIR /src\n#10 [build 3/6] COPY go.mod go.sum ./\n#11 [build 4/6] RUN go mod download\n#12 [build 5/6] COPY . .\n#13 [build 6/6] RUN go build -o /out/tally ./cmd/tally\n#14 [stage-1 2/3] COPY --from=alpine:3.21 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/\n#15 [stage-1 3/3] COPY --from=build /out/tally /tally" },
          { command: 'docker images tally', output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntally        2.0       3c847b807cb9   Less than a second ago   11.1MB\ntally        scratch   81acd4e50022   Less than a second ago   9.1MB" },
        ],
      },
      {
        id: 'dkr10-target', title: '--target：停在建置階段檢查', machine: 'dkr10-forge',
        description: '只建置到 build 階段，得到有 Shell、有原始碼與產出物的 Image 來檢查建置結果；正式的建置直接取用快取。',
        steps: [
          { command: 'docker build -q --target build -t tally:build .', output: "sha256:aac51b46e3f2ea5367e1f89a1491e45c844fcfe925851c75ef1673f943e36f8e" },
          { command: 'docker run --rm tally:build ls /out', output: "tally" },
          { command: 'docker run --rm tally:build ls /go/pkg/mod/cache/download/github.com/go-chi/chi/v5/@v', output: "v5.1.0.zip" },
          { command: 'docker build -t tally:2.0 . 2>&1 | grep -c CACHED', output: "5" },
          { command: 'docker images tally', output: "REPOSITORY   TAG       IMAGE ID       CREATED                  SIZE\ntally        2.0       3c847b807cb9   Less than a second ago   11.1MB\ntally        build     aac51b46e3f2   Less than a second ago   844MB" },
        ],
      },
      {
        id: 'dkr10-cache-arg', title: '快取與建置參數', machine: 'dkr10-forge',
        description: '改了 main.go，模組下載維持 CACHED，只有編譯與最後的 COPY --from 重新執行；--build-arg 改變寫在 FROM 之前的 ARG。',
        steps: [
          { command: 'docker build -q -t tally:2.0 .', output: "sha256:3c847b807cb9a816d2c346d68b4dcb5ecb2c3901f996a86435ab2c8fd9ec3944" },
          { command: "echo '// 叫號從 42 開始' >> cmd/tally/main.go", output: "" },
          { command: "docker build -t tally:2.1 . 2>&1 | grep -A 1 -E '^#[0-9]+ \\[(build [2-9]|stage-2 2)'", output: "#8 [build 2/6] WORKDIR /src\n#8 CACHED\n--\n#9 [build 3/6] COPY go.mod go.sum ./\n#9 CACHED\n--\n#10 [build 4/6] RUN go mod download\n#10 CACHED\n--\n#11 [build 5/6] COPY . .\n#11 DONE 0.0s\n--\n#12 [build 6/6] RUN go build -o /out/tally ./cmd/tally\n#12 DONE 7.6s\n--\n#13 [stage-2 2/2] COPY --from=build /out/tally /tally\n#13 DONE 0.0s" },
          { command: 'docker build --build-arg GO_VERSION=1.24 -t tally:next . 2>&1 | tail -n 1', output: "ERROR: failed to solve: golang:1.24: failed to resolve source metadata for docker.io/library/golang:1.24: docker.io/library/golang:1.24: not found" },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr10-ferry-slim', title: '把 ferry 改成多階段建置', machine: 'dkr10-forge',
        statement: '~/ferry 是另一個 Go 服務（渡輪班表 API），它的 Dockerfile 只有一個階段，建置出來的 Image 大約 840MB。請把 ~/ferry/Dockerfile 改寫成多階段建置：名為 build 的建置階段從 golang:1.23 開始，在 /src 複製原始碼，設定 `CGO_ENABLED=0` 後以 `go build -o /out/ferry ./cmd/ferry` 編譯；執行階段從 gcr.io/distroless/static-debian12 開始，只把執行檔複製成 /ferry，EXPOSE 8080，以 exec 形式的 `ENTRYPOINT ["/ferry"]` 啟動（建議加上 `USER nonroot`）。建置成 ferry:2.0（不能超過 20MB），再以名稱 ferry 在背景執行，把主機的 8081 對應到容器的 8080，讓 `curl localhost:8081/healthz` 回應 ok。可以用 `printf \'…\' > Dockerfile` 一次寫好整個檔案。',
        checks: [
          { kind: 'image', name: 'ferry:2.0', entrypoint: ['/ferry'], maxSize: 20_000_000 },
          { kind: 'container', name: 'ferry', state: 'running', image: 'ferry:2.0', port: '8081:8080' },
          { kind: 'http', url: 'http://localhost:8081/healthz', status: 200, body: 'ok' },
        ],
        solution: ['cd ~/ferry', rewrite('Dockerfile', FERRY_MULTI), 'docker build -q -t ferry:2.0 .', RUN_FERRY],
        mistakes: [
          { commands: ['cd ~/ferry', 'docker build -q -t ferry:2.0 .', RUN_FERRY], why: '沒有改 Dockerfile：服務跑得起來，但單一階段的 Image 有 840MB，Go 工具鏈、gcc 與原始碼都還在裡面' },
          { commands: ['cd ~/ferry', rewrite('Dockerfile', FERRY_GOLANG_TWICE), 'docker build -q -t ferry:2.0 .', RUN_FERRY], why: '分成了兩個階段，最後的階段卻又從 golang:1.23 開始，基底的 833MB 全部回來了' },
          { commands: ['cd ~/ferry', rewrite('Dockerfile', FERRY_NO_NAME), 'docker build -q -t ferry:2.0 .', RUN_FERRY], why: '第一個 FROM 沒有寫 AS build：--from=build 找不到這個階段，被當成 Image docker.io/library/build 去拉取，建置失敗' },
          { commands: ['cd ~/ferry', rewrite('Dockerfile', FERRY_OLD_PATH), 'docker build -q -t ferry:2.0 .', RUN_FERRY], why: '執行檔複製成 /ferry，ENTRYPOINT 卻還是 /out/ferry；最後的階段裡沒有 /out，容器啟動不了' },
        ],
        hints: [
          '第一行改成 `FROM golang:1.23 AS build`，原本的 WORKDIR、`COPY . .` 與 `RUN go build` 留在這個階段，RUN 之前加 `ENV CGO_ENABLED=0`。',
          '第二個 FROM 是 `gcr.io/distroless/static-debian12`，接著 `COPY --from=build /out/ferry /ferry`、`EXPOSE 8080`、`USER nonroot`、`ENTRYPOINT ["/ferry"]`。',
          '建置後用 `docker images ferry` 看大小，再 `docker run -d --name ferry -p 8081:8080 ferry:2.0`，用 `curl -s localhost:8081/healthz` 確認。',
        ],
        explanation: '多階段建置把「編譯」和「執行」分開：build 階段從 golang:1.23 開始，有編譯需要的一切；第二個 FROM 從只有 1.99MB 的 distroless/static 重新開始，`COPY --from=build /out/ferry /ferry` 只帶走 6.8MB 的執行檔，最後的 Image 約 8.79MB。`CGO_ENABLED=0` 讓 Go 產生靜態執行檔，才能在沒有 C 函式庫的 distroless/static 執行；distroless 沒有 Shell，所以 ENTRYPOINT 要用 exec 形式。最後的階段若又從 golang 開始，等於白做；忘了 `AS build` 時 --from 的名稱會被當成 Image；ENTRYPOINT 的路徑必須是執行檔在最後階段裡的位置。',
      },
      {
        id: 'dkr10-release-label', title: '把版本號帶進最後的階段', machine: 'dkr10-forge',
        statement: 'tally 的發行流程用 ~/tally/release.Dockerfile，想用 `--build-arg APP_VERSION=…` 把版本號寫進 Image 的標籤 org.opencontainers.image.version，可是建置出來的標籤一直是空的。請修正 release.Dockerfile（第一個 FROM 之前的 `ARG APP_VERSION=dev` 保留，其他指令不變），再用同一份檔案建置兩個版本：tally:1.4.0 的標籤是 1.4.0，tally:1.5.0-rc.1 的標籤是 1.5.0-rc.1。可以用 `docker image inspect -f \'{{.Config.Labels}}\' 名稱` 檢查標籤。',
        checks: [
          { kind: 'image', name: 'tally:1.4.0', label: 'org.opencontainers.image.version=1.4.0', maxSize: 20_000_000 },
          { kind: 'image', name: 'tally:1.5.0-rc.1', label: 'org.opencontainers.image.version=1.5.0-rc.1', maxSize: 20_000_000 },
        ],
        solution: ['cd ~/tally', rewrite('release.Dockerfile', RELEASE_FIXED), release('1.4.0'), release('1.5.0-rc.1')],
        mistakes: [
          { commands: ['cd ~/tally', release('1.4.0'), release('1.5.0-rc.1')], why: '沒有修改 Dockerfile：FROM 之前的 ARG 只能用在 FROM 那一行，最後階段的 $APP_VERSION 是空字串，兩個 Image 的標籤都是空的' },
          { commands: ['cd ~/tally', rewrite('release.Dockerfile', RELEASE_IN_BUILD), release('1.4.0'), release('1.5.0-rc.1')], why: 'ARG APP_VERSION 重新宣告在 build 階段，LABEL 卻在最後的階段；每個階段要各自宣告' },
          { commands: ['cd ~/tally', rewrite('release.Dockerfile', RELEASE_FIXED), 'docker build -q -f release.Dockerfile -t tally:1.4.0 .', 'docker build -q -f release.Dockerfile -t tally:1.5.0-rc.1 .'], why: 'Dockerfile 修好了，建置時卻沒有傳 --build-arg，兩個 Image 的標籤都是預設值 dev' },
          { commands: ['cd ~/tally', rewrite('release.Dockerfile', RELEASE_TYPED), release('1.4.0'), release('1.5.0-rc.1')], why: '把版本號寫死在 LABEL：tally:1.4.0 對了，tally:1.5.0-rc.1 的標籤卻也是 1.4.0' },
        ],
        hints: [
          '先照原樣建置一次，用 `docker image inspect -f \'{{.Config.Labels}}\' tally:1.4.0` 看標籤的值。',
          '第一個 FROM 之前的 ARG 只作用在 FROM 行；在使用它的階段裡（distroless 那個 FROM 的下一行）寫一行沒有值的 `ARG APP_VERSION`。',
          '`docker build -f release.Dockerfile --build-arg APP_VERSION=1.4.0 -t tally:1.4.0 .`，另一個版本照樣再建置一次。',
        ],
        explanation: '每個 FROM 開始一個新的範圍，第一個 FROM 之前宣告的 ARG 只能用在 FROM 行（例如 GO_VERSION 選基底的版本）。最後的階段要用 APP_VERSION，就得在那個階段裡再寫一行 `ARG APP_VERSION`，它會拿到 --build-arg 的值，沒有傳時拿到 FROM 之前的預設值 dev。宣告寫在 build 階段只對 build 階段有效；不傳 --build-arg 得到 dev；寫死版本號就失去了參數的意義。ARG 寫在最後的階段還有一個好處：版本號每次都不同，卻不會讓前面昂貴的編譯步驟失效。',
      },
      {
        id: 'dkr10-ci-target', title: 'CI 的測試 Image 與正式 Image', machine: 'dkr10-forge',
        statement: '~/tally 的 CI 需要兩個 Image：tally:test 是 Dockerfile 的 test 階段（建置時執行 `go test ./...`，之後 `docker run --rm tally:test` 會再跑一次測試）；tally:2.0 是要部署的正式 Image（最後的 distroless 階段，不能超過 20MB）。不要修改 Dockerfile，只用 docker build 的選項做出這兩個 Image。',
        checks: [
          { kind: 'image', name: 'tally:test', cmd: ['go', 'test', './...'] },
          { kind: 'image', name: 'tally:2.0', entrypoint: ['/tally'], maxSize: 20_000_000 },
          { kind: 'unchanged', path: '/home/kai/tally/Dockerfile' },
        ],
        solution: ['cd ~/tally', 'docker build -q --target test -t tally:test .', 'docker build -q -t tally:2.0 .'],
        mistakes: [
          { commands: ['cd ~/tally', 'docker build -q -t tally:test .', 'docker build -q -t tally:2.0 .'], why: '沒有 --target：一般的建置只做最後的階段，test 被略過，tally:test 其實是正式 Image，沒有執行任何測試' },
          { commands: ['cd ~/tally', 'docker build -q --target build -t tally:test .', 'docker build -q -t tally:2.0 .'], why: '--target build 停在 build 階段：有編譯結果，但沒有執行 go test，CMD 仍是 golang 的 bash' },
          { commands: ['cd ~/tally', 'docker build -q --target test -t tally:test -t tally:2.0 .'], why: '一次 --target test 加上兩個 -t：tally:2.0 也成了 844MB、沒有 ENTRYPOINT 的測試 Image' },
          { commands: ['cd ~/tally', 'docker build -q --target tests -t tally:test .', 'docker build -q -t tally:2.0 .'], why: '階段名稱打成 tests：target stage "tests" could not be found，建置失敗' },
        ],
        hints: [
          '`docker build --target 階段名稱` 讓建置停在那個階段，那個階段就是建置出來的 Image。',
          '測試階段的名稱看 Dockerfile 的 `FROM build AS test`。',
          '正式 Image 不加 --target，建置最後一個階段；兩次建置的 build 階段會共用快取。',
        ],
        explanation: 'BuildKit 只建置目標需要的階段：最後的階段只 COPY --from=build，所以一般的建置不會經過 test 階段，測試不會執行。`docker build --target test -t tally:test .` 讓 test 成為目標，建置時執行 `RUN go test ./...`（失敗就讓建置失敗），Image 的 CMD 是 `go test ./...`；接著不加 --target 建置正式的 tally:2.0，build 階段直接取用快取。--target build 少了測試；同一次建置加兩個 -t 會讓兩個標籤指向同一個 Image；階段名稱要和 AS 寫的一致。',
      },
    ],
  },
  quiz: [
    {
      id: 'dkr10-q1', prompt: 'Dockerfile 有 build 階段（`FROM golang:1.23 AS build`，編譯出 /out/app）與最後的 `FROM gcr.io/distroless/static-debian12` 階段（`COPY --from=build /out/app /app`）。建置出來的 Image 包含哪些層？',
      options: ['golang:1.23 的所有層，再加上 build 與最後階段裡每一個步驟各自的層', '只有 distroless 基底的層與最後階段的步驟（COPY --from 那一層）', '只有 COPY --from 複製的那一層，基底的層不算在 Image 裡', 'build 階段的層被壓縮成一層，接在 distroless 基底的層後面一起出貨'],
      answer: 1,
      explanation: '最後一個階段就是 Image：它的基底的層加上它自己的步驟，COPY --from 只把指定的檔案複製成新的一層。build 階段只是建置過程，它和 golang 的層都不會留在 Image 裡，也不會被壓縮後接上去；而 distroless 基底的層當然是 Image 的一部分，容器需要它們。',
    },
    {
      id: 'dkr10-q2', prompt: 'Dockerfile 寫的是 `FROM golang:1.23 AS build`，後面卻寫了 `COPY --from=builder /out/app /app`。建置時會發生什麼？',
      options: ['BuildKit 會自動對應到名稱最接近的 build 階段，照常複製', '複製到的是空檔案，建置照樣成功，執行時才出錯', '只印出 `undefined stage` 警告，最後的 Image 裡沒有 /app', 'builder 不是階段名稱，被當成 Image 去拉取而建置失敗'],
      answer: 3,
      explanation: '--from 的值不是階段名稱時，BuildKit 把它當成 Image 的參照去解析，所以錯誤是 load metadata for docker.io/library/builder 的 pull access denied，建置失敗。BuildKit 不會猜測相近的名稱，也不會產生空檔案或只給警告；看到這種錯誤要檢查 AS 與 --from 的拼字。',
    },
    {
      id: 'dkr10-q3', prompt: '以 distroless 為基底的容器執行中，`docker exec api sh` 卻得到 `exec: "sh": executable file not found in $PATH`，結束碼 127。最合理的解讀與做法是什麼？',
      options: ['distroless 沒有 Shell；改用 `--target` 建置有 Shell 的階段，或暫用 :debug 標籤', '容器其實已經停止了，要先執行 `docker start api` 讓它回到執行中再 exec', '`docker exec` 沒有加上 `-it` 配置終端機，所以找不到互動用的 sh', 'nonroot 使用者沒有權限看到 /bin/sh，要在 Dockerfile 改用 `USER root` 重新建置 Image 才行'],
      answer: 0,
      explanation: 'distroless 刻意不放 Shell 與套件管理器，Image 裡沒有 sh，exec 找不到執行檔就是 127；除錯時改看 docker logs、用 --target 建置建置階段，或暫時換成帶 BusyBox 的 :debug 標籤。容器停止時的錯誤是 container is not running；-it 只配置終端機，變不出 sh；問題不在使用者權限，root 也一樣找不到。',
    },
    {
      id: 'dkr10-q4', prompt: 'Dockerfile 有三個階段：build、`FROM build AS test`（`RUN go test ./...`），以及只從 build 複製執行檔的 distroless 階段。執行 `docker build -t app .` 時，測試會不會執行？',
      options: ['一定會，因為 test 階段寫在最後的階段之前，每個階段都會依序建置', '會執行，但測試失敗只會印出錯誤，不影響建置出來的 Image', '不會：BuildKit 只建置目標用到的階段；要測試得用 `--target test`', '不會在建置時執行，而是之後每次用 `docker run app` 啟動容器時才自動執行一次'],
      answer: 2,
      explanation: 'BuildKit 從目標往回找依賴，最後的階段只 COPY --from=build，所以 test 被略過，測試沒有執行；CI 要明確建置 --target test，或讓最後的階段依賴測試階段。寫在前面不代表會執行（那是舊建置器的行為）；測試真的執行時，失敗會讓 RUN 的結束碼非 0 而建置失敗；RUN 是建置時執行，不是 docker run 時。',
    },
    {
      id: 'dkr10-q5', prompt: '第一個 FROM 之前寫了 `ARG APP_VERSION=dev`，最後的階段寫 `LABEL org.opencontainers.image.version=$APP_VERSION`。用 `--build-arg APP_VERSION=1.4.0` 建置後，標籤是空的。該怎麼修正？',
      options: ['把 `--build-arg` 改成 `--label`，因為 ARG 只能用在 RUN 指令裡', '在最後的階段裡再寫一行 `ARG APP_VERSION`，讓階段看得到這個值', '把 ARG 改成 ENV，同樣寫在第一個 FROM 之前，所有階段就都看得到', 'LABEL 不支援變數代換，只能在 Dockerfile 裡把版本號寫死'],
      answer: 1,
      explanation: '每個 FROM 開始新的範圍，FROM 之前的 ARG 在階段裡看不到，$APP_VERSION 變成空字串；在階段裡寫一行沒有值的 ARG APP_VERSION 就能拿到 --build-arg 的值。`docker build --label` 是另一個選項，不會修好 Dockerfile 的變數；第一個 FROM 之前只能寫 ARG，不能寫 ENV；LABEL 支援變數代換，寫死就失去參數的意義。',
    },
    {
      id: 'dkr10-q6', prompt: '一個在 golang Image 裡以預設設定（cgo 可用）編譯、用到 net 套件的 Go 執行檔，複製進 scratch 後執行，得到 `no such file or directory`，可是檔案明明在。原因最可能是什麼？',
      options: ['scratch 不支援 exec 形式的 ENTRYPOINT，要改成 Shell 形式才能啟動', '執行檔在 COPY 時失去了執行權限，要在最後的階段先 `chmod +x`', 'COPY --from 其實沒有複製成功，/app 只是同名的空目錄', '執行檔是動態連結的，scratch 裡沒有它需要的載入器與 C 函式庫'],
      answer: 3,
      explanation: '動態連結的執行檔啟動時需要動態載入器與 C 函式庫，scratch 是空的，核心找不到載入器而回報 no such file or directory，容易誤以為檔案不見了。scratch 只能用 exec 形式，因為它沒有 Shell；缺執行權限的錯誤是 permission denied；檔案確實已經複製進去，問題在它依賴的其他檔案。修正是以 CGO_ENABLED=0 編出靜態執行檔，或改用含 glibc 的基底。',
    },
    {
      id: 'dkr10-q7', prompt: 'build 階段為什麼先寫 `COPY go.mod go.sum ./` 與 `RUN go mod download`，最後才 `COPY . .` 與 `RUN go build`？',
      options: ['go.mod 沒變時模組下載維持 CACHED，改程式碼只重跑 `COPY . .` 之後', 'go build 規定 go.mod 必須比原始碼先複製進容器，否則編譯時會找不到任何模組', '這樣下載的模組快取才不會出現在最後的 Image 裡，Image 比較小', '可以讓 COPY --from 少複製一些檔案，最後的階段因此變小'],
      answer: 0,
      explanation: '快取鍵是一條鏈，`COPY . .` 寫在下載之前時，任何原始碼的變化都會讓模組重新下載；先只複製 go.mod 與 go.sum，下載這一步只依賴這兩個檔案。go build 沒有規定複製順序；模組快取不在最後的 Image 裡，是因為最後的階段只複製執行檔，和順序無關；COPY --from 複製的檔案由它自己的來源路徑決定。',
    },
  ],
};
