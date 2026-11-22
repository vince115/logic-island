import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * DKR02 Docker architecture (DKR-1, network-sequence; the blueprint's architecture-diagram activity drawn as a network
 * scene, not the database island's content.ops). A terminal lesson on the containers profile (engine stage E20) beside
 * one network-protocol scene. The terminal part: docker version's Client and Server halves (the client prints its half
 * even when it cannot reach the daemon), dockerd and containerd as root processes and docker.service's ExecStart, the
 * socket /var/run/docker.sock (root:docker 0660; /var/run is Ubuntu's link to /run), the permission-denied error, the
 * docker group with usermod -aG and newgrp, docker info, docker images, docker pull with its layers and digest, a full
 * name (docker.io/library/…) that is the same image, and docker run pulling an image that is not local. The network
 * part: `docker run nginx` step by step — the client's REST calls over the Unix socket (create, 404 No such image,
 * images/create, create again, start), dockerd's manifest and blob requests to Docker Hub's registry-1.docker.io over
 * HTTPS, then gRPC to containerd, containerd-shim-runc-v2 running runc with the OCI bundle's config.json, and the
 * kernel's namespaces and cgroup. Facts follow the Docker documentation (the docker group grants root-level privileges,
 * the Engine API over the socket, image references and their defaults), the OCI image, runtime and distribution
 * specifications (described generally) and containerd's API names. Simplifications, stated in the text: the simulation
 * shows the socket as a regular file (-rw-rw---- instead of srw-rw----), does not show the shim or a container's
 * processes in the host's ps, and abbreviates docker version and docker info; kernel mechanisms (namespaces, cgroups,
 * overlay2, runc) are only explained, never shown as command output. In the scene the anonymous token request to
 * auth.docker.io, TLS, DNS and the attach stream are left out, and addresses (RFC 5737) and ports are made up; host
 * names and users are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const NGINX_PAGE = '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body>\n</html>\n';
const NGINX_LOGS = [
  '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration',
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  { text: '2026/11/22 10:00:00 [notice] 1#1: nginx/1.27.3', stream: 2 as const },
  { text: '2026/11/22 10:00:00 [notice] 1#1: start worker processes', stream: 2 as const },
];
const REDIS_LOGS = ['1:C 22 Nov 2026 10:00:00.000 * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo', '1:M 22 Nov 2026 10:00:00.001 * Ready to accept connections tcp'];

const ALPINE: TerminalImage = { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1,
  osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' };
const nginx = (pulled: boolean): TerminalImage => ({
  name: 'nginx:1.27', size: 191968432, created: '2026-11-05 09:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'],
  env: [PATH_ENV, 'NGINX_VERSION=1.27.3'], expose: [80], http: { port: 80, responder: 'nginx-site', accessLog: 'nginx' }, service: true, logs: NGINX_LOGS, layers: 7,
  ...pulled ? { pulled: true } : {},
});
/** redis:7.4 (the tag the team pins) and redis (latest, a newer build) on the simulated Docker Hub; created decides the image ID. */
const redis = (tag: string, created: string, size: number): TerminalImage => ({
  name: tag, size, created, entrypoint: ['docker-entrypoint.sh'], cmd: ['redis-server'], expose: [6379], service: true, logs: REDIS_LOGS, layers: 6,
});
const IMAGES: TerminalImage[] = [ALPINE, nginx(false), redis('redis:7.4', '2026-11-10 06:00:00', 117000000), redis('redis', '2026-11-18 06:00:00', 137000000)];

const CONTAINERS = [
  { name: 'ci-runner', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running' as const, created: '2026-11-22 08:30:00', started: '2026-11-22 08:30:00' },
  { name: 'smoke-test', image: 'alpine:3.21', command: ['echo', 'ok'], state: 'exited' as const, created: '2026-11-22 09:10:00', started: '2026-11-22 09:10:00', finished: '2026-11-22 09:10:00', exitCode: 0 },
];

/** A build host with Docker CE from the docker-ce packages; learner is in sudo, and in docker only on build-08. */
const machine = (id: string, host: string, inDocker: boolean): TerminalMachine => ({
  id, title: `${host}（建置主機${inDocker ? '' : '，新帳號'}）`, user: 'learner', cwd: '/home/learner', host, profile: 'containers', cpus: 4, memory: { total: 8192 },
  files: [
    dir('/home'), dir('/home/learner', 'learner'), file('/home/learner/README.txt', '建置主機使用說明：docker 指令請以自己的帳號執行，不要用 sudo。\n', 'learner'),
    dir('/run'), dir('/var'), link('/var/run', '/run'),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, ...inDocker ? [{ name: 'docker', gid: 988, members: ['learner'] }] : []] },
  responders: [{ id: 'nginx-site', server: 'nginx/1.27.3', routes: [{ path: '/', body: NGINX_PAGE }] }],
  docker: { images: IMAGES, containers: CONTAINERS },
});
const fresh = machine('dkr02-new', 'build-07', false);
const lab = machine('dkr02-lab', 'build-08', true);

/** Other builds of redis:7.4 (other image IDs), so an ID read from docker images cannot be typed in. */
const REBUILT: TerminalVariant = { label: 'redis:7.4 在 Docker Hub 上是另一次建置', files: [], docker: {
  images: [ALPINE, nginx(false), redis('redis:7.4', '2026-11-14 03:00:00', 117100000), redis('redis', '2026-11-18 06:00:00', 137000000)], containers: CONTAINERS } };
const OTHER_HOST: TerminalVariant = { label: '另一台主機：本機已有 nginx:1.27，redis:7.4 是較早的建置', files: [], docker: {
  images: [ALPINE, nginx(true), redis('redis:7.4', '2026-11-02 06:00:00', 116800000), redis('redis', '2026-11-18 06:00:00', 137000000)], containers: CONTAINERS } };

/** Another new host whose daemon runs other containers, so the expected docker ps cannot be typed in. */
const BUSY: TerminalVariant = { label: '另一台新主機：daemon 上有兩個執行中的容器', files: [], docker: { images: IMAGES, containers: [
  ...CONTAINERS, { name: 'nightly-db', image: 'alpine:3.21', command: ['sleep', '3600'], state: 'running', created: '2026-11-22 09:40:00', started: '2026-11-22 09:40:00' },
] } };

// ---- network scene -----------------------------------------------------------------------------------------------
const HOST_IP = '198.51.100.18', REGISTRY_IP = '203.0.113.50', PORT = '41822';
const SOCK = '/var/run/docker.sock', CONTAINERD_SOCK = '/run/containerd/containerd.sock';
const unix = (path: string): ProtocolHeader => ({ layer: 'transport', protocol: 'Unix socket', fields: [{ name: 'socket 路徑', value: path }] });
const api = (method: string, path: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1（Docker Engine API）', fields: [
  { name: '方法', value: method }, { name: '路徑', value: path }, ...extra.map(([name, value]) => ({ name, value }))] });
const apiResp = (code: string, reason: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1（Docker Engine API）', fields: [
  { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...extra.map(([name, value]) => ({ name, value }))] });
const hub = (method: string, path: string, extra: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（OCI distribution）', fields: [
  { name: '方法', value: method }, { name: '路徑', value: path }, { name: 'Host', value: 'registry-1.docker.io' }, ...extra.map(([name, value]) => ({ name, value }))] });
const hubResp = (extra: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（OCI distribution）', fields: [
  { name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' }, ...extra.map(([name, value]) => ({ name, value }))] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: 'PSH, ACK' }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });

const IMG_HEAD = ['Image', '在本機', '來源'];
const ALPINE_ROW = ['alpine:3.21', '有', '先前拉取'];
const images = (nginxRow: string[], changed?: number[]): NodeTable => ({ node: 'dockerd', name: '本機的 Image', head: IMG_HEAD, rows: [ALPINE_ROW, nginxRow], ...changed ? { changed } : {} });
const NGINX_MISSING = ['nginx:latest', '沒有', '—'], NGINX_PULLING = ['nginx:latest', '下載中', 'docker.io/library/nginx'], NGINX_LOCAL = ['nginx:latest', '有', 'docker.io/library/nginx'];
const CT_HEAD = ['容器', '狀態', '負責的元件'];
const containers = (rows: string[][], changed?: number[]): NodeTable => ({ node: 'dockerd', name: '容器', head: CT_HEAD, rows, ...changed ? { changed } : {} });

const runNginx: NetworkScene = {
  id: 'dkr02-run-nginx', title: 'docker run nginx：Client、dockerd、Registry、containerd 與 runc', model: 'tcp-ip',
  description: `build-08（${HOST_IP}）上的 learner 在 docker 群組裡，本機還沒有 nginx 的 Image。他輸入 \`docker run nginx\`：沒有寫 Registry、命名空間與標籤，所以完整的名稱是 docker.io/library/nginx:latest。docker CLI 只是 Client：它把請求以 HTTP 送到 ${SOCK} 這個 Unix socket，由以 root 執行的 dockerd 處理。dockerd 從 Docker Hub 的 Registry（registry-1.docker.io）下載 Image，再交給 containerd 與 runc 建立容器。Unix socket 上的訊息不經過網路卡，所以只有應用層與 socket；和 Registry 之間是 HTTPS（TLS 這一層、DNS 查詢與向 auth.docker.io 取得匿名 token 的往返省略）。位址與連接埠是虛構的。`,
  nodes: [
    { id: 'client', label: 'docker CLI（Client，以 learner 執行）', kind: 'host', addresses: [`build-08 ${HOST_IP}`] },
    { id: 'dockerd', label: 'dockerd（Docker daemon，以 root 執行）', kind: 'server', addresses: [`unix://${SOCK}`] },
    { id: 'registry', label: 'Docker Hub 的 Registry', kind: 'server', addresses: ['registry-1.docker.io', `IP ${REGISTRY_IP}`, 'TCP 443'] },
    { id: 'containerd', label: 'containerd（容器的生命週期）', kind: 'server', addresses: [`unix://${CONTAINERD_SOCK}`] },
    { id: 'runc', label: 'containerd-shim-runc-v2 與 runc（OCI runtime）', kind: 'server', addresses: ['每個容器一個 shim'] },
    { id: 'container', label: '容器：nginx 的主程式（容器裡的 PID 1）', kind: 'host', addresses: ['預設 bridge 172.17.0.2'] },
  ],
  messages: [
    { id: 'create-1', from: 'client', to: 'dockerd', label: 'POST /containers/create（Image: nginx）',
      headers: [api('POST', '/v1.47/containers/create', [['Content-Type', 'application/json']]), unix(SOCK)],
      payload: '{"Image":"nginx","Cmd":null,"AttachStdout":true,"AttachStderr":true,…}',
      note: 'docker CLI 解析命令列之後，自己不建立任何容器，只是把「用 nginx 建立一個容器」寫成 JSON，以 HTTP POST 送給 daemon。路徑開頭的 v1.47 是 Docker Engine API 的版本（docker version 的 API version）。能不能連上這個 socket 由檔案權限決定：root:docker 0660，所以只有 root 與 docker 群組的成員可以。',
      tables: [images(NGINX_MISSING), containers([['ci-runner', 'running', 'containerd、runc']])] },
    { id: 'create-404', from: 'dockerd', to: 'client', label: '404：No such image: nginx:latest',
      headers: [apiResp('404', 'Not Found', [['Content-Type', 'application/json']]), unix(SOCK)],
      payload: '{"message":"No such image: nginx:latest"}',
      note: 'dockerd 只在本機的 Image 裡找 nginx:latest，沒有找到，所以回 404。daemon 不會自己決定上網下載；決定的是 Client：docker run 收到「沒有這個 Image」時，在標準錯誤印出 Unable to find image \'nginx:latest\' locally，接著請 daemon 拉取。',
      tables: [images(NGINX_MISSING, [1]), containers([['ci-runner', 'running', 'containerd、runc']])] },
    { id: 'pull-req', from: 'client', to: 'dockerd', label: 'POST /images/create?fromImage=nginx&tag=latest',
      headers: [api('POST', '/v1.47/images/create?fromImage=nginx&tag=latest'), unix(SOCK)],
      payload: 'fromImage=nginx&tag=latest',
      note: '這和 docker pull nginx 送出的是同一個 API。下載是 daemon 做的，不是 Client：連到 Registry 的是 build-08 上的 dockerd，用的是 daemon 的網路與 proxy 設定；Client 只負責把進度顯示在終端機。所以 Client 在別台電腦、經由遠端 API 操作時，Image 也是下載到 daemon 那台主機。',
      tables: [images(NGINX_PULLING, [1])] },
    { id: 'manifest-req', from: 'dockerd', to: 'registry', label: 'GET /v2/library/nginx/manifests/latest',
      headers: [hub('GET', '/v2/library/nginx/manifests/latest', [['Accept', 'application/vnd.oci.image.index.v1+json（與其他 manifest 類型）'], ['Authorization', 'Bearer <匿名 token>']]),
        tcp(PORT, '443'), ipv4(HOST_IP, REGISTRY_IP)],
      payload: `GET /v2/library/nginx/manifests/latest HTTP/1.1\nHost: registry-1.docker.io\n…`,
      note: '名稱的 docker.io 是 Docker Hub，它的 Registry API 實際在 registry-1.docker.io；官方 Image 放在 library 這個命名空間，所以儲存庫是 library/nginx，標籤 latest 放在路徑的最後。/v2/ 開頭的路徑是 Registry 的 HTTP API（OCI distribution 規格就是以它為基礎）。Docker Hub 要求先向 auth.docker.io 取得 token，即使是匿名的公開 Image 也一樣，這個往返在這裡省略。',
      tables: [images(NGINX_PULLING)] },
    { id: 'manifest-resp', from: 'registry', to: 'dockerd', label: '200：image index（各平台的 manifest）',
      headers: [hubResp([['Content-Type', 'application/vnd.oci.image.index.v1+json'], ['Docker-Content-Digest', 'sha256:<index 的 digest>']]), tcp('443', PORT), ipv4(REGISTRY_IP, HOST_IP)],
      payload: '{"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json","manifests":[{"platform":{"architecture":"amd64","os":"linux"},"digest":"sha256:…"},{"platform":{"architecture":"arm64","os":"linux"},…},…]}',
      note: '標籤 latest 對應到一份 image index：同一個 Image 有好幾個平台的版本（linux/amd64、linux/arm64…），每個以 digest 指向自己的 manifest。digest 是內容的 SHA-256，內容改一個位元組 digest 就不同，所以 digest 能精確指定一份內容，標籤卻可以被重新指向。dockerd 依自己的 OS/Arch（linux/amd64）選出那一份。docker pull 最後印的 Digest: 就是這種值。',
      tables: [images(NGINX_PULLING)] },
    { id: 'blobs-req', from: 'dockerd', to: 'registry', label: 'GET amd64 的 manifest，再 GET config 與每一層的 blob',
      headers: [hub('GET', '/v2/library/nginx/blobs/sha256:<層的 digest>', [['Authorization', 'Bearer <匿名 token>']]), tcp(PORT, '443'), ipv4(HOST_IP, REGISTRY_IP)],
      payload: 'GET /v2/library/nginx/manifests/sha256:<amd64 manifest 的 digest>\nGET /v2/library/nginx/blobs/sha256:<config 的 digest>\nGET /v2/library/nginx/blobs/sha256:<第 1 層的 digest>\n…（共 7 層）',
      note: 'amd64 的 manifest 列出一份 config（Image 的設定：環境變數、CMD、ENTRYPOINT、每一層解開後的雜湊）與 7 個層，每個都以 digest 指名。層是壓縮的 tar 檔，記錄檔案系統的一組變更；本機已經有的層（其他 Image 共用的）不必再下載，docker pull 會印 Already exists。每個 blob 都以 /blobs/<digest> 要取，所以內容放在哪裡都能被驗證（實際的下載可能被轉址到別的儲存位置，這裡省略）。',
      tables: [images(NGINX_PULLING)] },
    { id: 'blobs-resp', from: 'registry', to: 'dockerd', label: '200：config 與 7 個層',
      headers: [hubResp([['Content-Type', 'application/octet-stream']]), tcp('443', PORT), ipv4(REGISTRY_IP, HOST_IP)],
      payload: '（壓縮的 tar：一層的檔案）',
      note: 'dockerd 計算每個下載內容的 SHA-256，和 manifest 寫的 digest 比對，不同就拒絕；相同才把層解開，交給儲存驅動程式（docker info 的 Storage Driver: overlay2）放在 /var/lib/docker 底下。Image 就是這些唯讀的層加上 config；現在 nginx:latest 已經在本機了。',
      tables: [images(NGINX_LOCAL, [1])] },
    { id: 'pull-done', from: 'dockerd', to: 'client', label: '200：拉取的進度（串流）',
      headers: [apiResp('200', 'OK', [['Content-Type', 'application/json']]), unix(SOCK)],
      payload: '{"status":"Pulling from library/nginx","id":"latest"}\n{"status":"Pull complete","id":"…"}\n…\n{"status":"Digest: sha256:…"}\n{"status":"Status: Downloaded newer image for nginx:latest"}',
      note: 'images/create 的回應是一行一個 JSON 物件的串流，Client 把它們畫成終端機上的進度：每一層的 Pull complete、Digest:、Status: Downloaded newer image for nginx:latest。下次在這台主機 docker run nginx 就不會再下載，因為 Image 已經在本機（除非加上 --pull always）。',
      tables: [images(NGINX_LOCAL)] },
    { id: 'create-2', from: 'client', to: 'dockerd', label: '再一次 POST /containers/create',
      headers: [api('POST', '/v1.47/containers/create', [['Content-Type', 'application/json']]), unix(SOCK)],
      payload: '{"Image":"nginx",…}',
      note: 'Client 重送同一個建立請求。這次 dockerd 找得到 Image，於是準備容器：在 Image 唯讀的層上面加一層可寫層、產生 64 個十六進位字的容器 ID 與一個隨機的名稱（沒有 --name 時）、把設定存在 /var/lib/docker 底下。',
      tables: [images(NGINX_LOCAL)] },
    { id: 'created', from: 'dockerd', to: 'client', label: '201 Created：容器 ID',
      headers: [apiResp('201', 'Created', [['Content-Type', 'application/json']]), unix(SOCK)],
      payload: '{"Id":"<64 個十六進位字>","Warnings":[]}',
      note: '容器已經存在，狀態是 Created，但還沒有任何程式在執行。到這裡為止，containerd 與 runc 都還沒有參與：Image 與容器的設定都是 dockerd 自己管理的。',
      tables: [containers([['ci-runner', 'running', 'containerd、runc'], ['<隨機名稱>', 'created', 'dockerd']], [1])] },
    { id: 'start', from: 'client', to: 'dockerd', label: 'POST /containers/<ID>/start',
      headers: [api('POST', '/v1.47/containers/<ID>/start'), unix(SOCK)],
      payload: '（沒有內容）',
      note: '沒有 -d 時，Client 先附著（attach）到容器的輸出，再要求啟動，所以 nginx 的日誌會出現在終端機上（附著的串流這裡省略）。',
      tables: [containers([['ci-runner', 'running', 'containerd、runc'], ['<隨機名稱>', 'created', 'dockerd']])] },
    { id: 'containerd-create', from: 'dockerd', to: 'containerd', label: 'gRPC：Containers/Create、Tasks/Create、Tasks/Start',
      headers: [{ layer: 'application', protocol: 'gRPC（HTTP/2）', fields: [{ name: '方法', value: '/containerd.services.tasks.v1.Tasks/Create' }, { name: '命名空間', value: 'moby' },
        { name: '內容', value: 'OCI runtime spec（由容器的設定產生）' }] }, unix(CONTAINERD_SOCK)],
      payload: 'Containers/Create → Tasks/Create → Tasks/Start（containerd 的命名空間 moby）',
      note: 'dockerd 把容器的設定翻譯成 OCI runtime 規格：要執行的程式與參數、環境變數、根目錄、掛載、要用哪些 namespace、cgroup 的限制、capabilities。它以 gRPC 經由另一個 Unix socket 交給 containerd（docker.service 的 --containerd=/run/containerd/containerd.sock）。Docker 的容器都在 containerd 的 moby 命名空間裡。containerd 也是獨立的專案，Kubernetes 可以不經過 Docker 直接使用它。',
      tables: [containers([['ci-runner', 'running', 'containerd、runc'], ['<隨機名稱>', 'created', 'containerd']], [1])] },
    { id: 'runc-create', from: 'containerd', to: 'runc', label: '啟動 shim，shim 執行 runc create',
      headers: [{ layer: 'application', protocol: 'OCI runtime（命令列）', fields: [{ name: '指令', value: 'runc create' },
        { name: 'bundle', value: '/run/containerd/io.containerd.runtime.v2.task/moby/<容器 ID>' }, { name: '規格檔', value: 'config.json' }, { name: '根目錄', value: 'rootfs（overlay2 合併後的檔案系統）' }] }],
      payload: 'bundle/\n  config.json   ← OCI runtime spec\n  rootfs/       ← 容器看到的 /',
      note: 'containerd 為這個容器啟動一個 containerd-shim-runc-v2 行程，由 shim 執行 runc。runc 不認識 Docker，也不認識 Image：它只讀 OCI bundle，也就是一個目錄裡的 config.json（runtime 規格）與 rootfs。任何符合 OCI runtime 規格的 runtime 都能接手同一個 bundle，這正是標準的意義。' },
    { id: 'kernel', from: 'runc', to: 'container', label: '建立 namespace 與 cgroup，執行 /docker-entrypoint.sh',
      headers: [{ layer: 'application', protocol: 'Linux 核心（系統呼叫）', fields: [{ name: 'namespace', value: 'pid、mount、network、uts、ipc' },
        { name: 'cgroup', value: 'system.slice/docker-<容器 ID>.scope' }, { name: '程式', value: '/docker-entrypoint.sh nginx -g daemon off;' }] }],
      payload: 'execve("/docker-entrypoint.sh", ["/docker-entrypoint.sh", "nginx", "-g", "daemon off;"], …)',
      note: 'runc 請核心建立新的 namespace（容器有自己的行程編號、掛載表、網路與主機名稱）、把行程放進 cgroup（資源的計算與限制；Cgroup Driver 是 systemd 時是一個 scope）、把根目錄換成 rootfs，再 execve 執行 Image 的 ENTRYPOINT 加 CMD。程式開始執行之後 runc 就結束了，留下 shim 當它的父行程，負責收集結束碼與保留標準輸入輸出。容器不是虛擬機：它是主機核心上一個被隔離的普通行程。',
      tables: [containers([['ci-runner', 'running', 'containerd、runc'], ['<隨機名稱>', 'running', 'containerd、runc']], [1])] },
    { id: 'started', from: 'dockerd', to: 'client', label: '204 No Content：已啟動',
      headers: [apiResp('204', 'No Content'), unix(SOCK)],
      note: 'dockerd 回報啟動成功，終端機開始顯示 nginx 的日誌。容器的父行程是 shim，不是 docker CLI，也不是 dockerd：所以 docker run -d 的 Client 立刻結束，容器照樣執行；containerd 的設計也讓 dockerd 重新啟動時，已在執行的容器不必跟著停止（需要 daemon 的 live-restore 設定）。',
      tables: [containers([['ci-runner', 'running', 'containerd、runc'], ['<隨機名稱>', 'running', 'containerd、runc']])] },
  ],
};

export const DKR02: LessonContent = {
  lessonId: 'DKR02',
  motivation: '上一課用 docker run 跑起了第一個容器，看起來像是 docker 這個指令自己把程式包起來執行。實際上你打的 docker 只是 Client，它把請求送給以 root 執行的 daemon；daemon 從 Registry 下載 Image，再經過 containerd 與 runc 請 Linux 核心建立容器。搞懂這條鏈，才能解釋為什麼新帳號會看到 permission denied、為什麼把人加進 docker 群組等於給他 root、Image 到底從哪裡來、為什麼 docker pull nginx 和 docker.io/library/nginx:latest 是同一個東西，以及為什麼 Docker 建出的 Image 能在 Kubernetes 或 Podman 上執行。這一課在建置主機 build-07、build-08 上逐一觀察這些元件，並把一次 docker run nginx 從頭到尾畫出來。',
  sections: [
    {
      id: 'dkr02-s-client', title: 'docker 指令只是 Client：Docker client 與 Docker daemon',
      blocks: [
        { type: 'p', text: 'Docker 是 client–server 架構。你在終端機打的 `docker` 是 Docker client：一個解析命令列、把請求送出去、把回應印出來的程式。真正管理 Image 與容器的是 Docker daemon，也就是一直在背景執行的 `dockerd`。兩者之間說的是 Docker Engine API：一組 REST 風格的 HTTP API，例如列出容器是 `GET /containers/json`、建立容器是 `POST /containers/create`，路徑前面加上 API 版本（`/v1.47/…`）。' },
        { type: 'table', head: ['元件', '是什麼', '在 build-08 上', '負責'], rows: [
          ['Docker client', '`docker` 指令（/usr/bin/docker）', '以 learner 執行，指令結束就消失', '解析參數、呼叫 Engine API、顯示結果與進度'],
          ['Docker daemon', '`dockerd`（docker.service）', '以 root 長駐，PID 900', 'Image、容器、網路與 Volume 的管理；拉取 Image；提供 Engine API'],
          ['containerd', '`containerd`（containerd.service）', '以 root 長駐，PID 850', '容器的生命週期（建立、啟動、停止、刪除），呼叫 runtime'],
          ['runc', 'OCI runtime（命令列工具）', '只在建立容器的瞬間執行', '依 OCI 規格請核心建立 namespace 與 cgroup，執行容器的程式'],
        ] },
        { type: 'p', text: '`docker version` 把這個分工直接印出來：上半部 Client 是 docker 指令自己的版本與它說的 API version；下半部 Server 是 daemon 回答的，包含 Engine（dockerd）以及它使用的 containerd、runc 與 docker-init 的版本。Client 與 Server 是兩個程式，所以版本可以不同；API 版本由兩邊協商，舊的 Client 可以和較新的 daemon 說話（Server 那行的 minimum version 1.24 是 daemon 還接受的最舊 API）。' },
        { type: 'example', id: 'dkr02-version' },
        { type: 'callout', tone: 'note', title: 'Client 與 daemon 不必在同一台機器', text: 'Engine API 預設只在本機的 Unix socket `/var/run/docker.sock` 上提供，但 Client 也可以經由 `DOCKER_HOST`、`docker context` 或 SSH 連到另一台主機的 daemon。這時 `docker pull` 下載的 Image、`docker run` 建立的容器都在 daemon 那台主機上，不在你打字的電腦上。' },
      ],
    },
    {
      id: 'dkr02-s-socket', title: '/var/run/docker.sock、權限與 docker 群組',
      blocks: [
        { type: 'p', text: 'Client 連到 daemon 的入口是一個 Unix socket：`/var/run/docker.sock`（Ubuntu 的 /var/run 是指向 /run 的符號連結，所以實際的檔案是 /run/docker.sock）。Unix socket 是檔案系統上的一個特殊檔案，連線時核心照一般的檔案權限檢查：要能連上，必須對它有寫入權限。docker-ce 套件讓 systemd 建立這個 socket，擁有者 root、群組 docker、權限 0660（`srw-rw----`），`dockerd -H fd://` 表示 daemon 從 systemd 接手這個已經開好的 socket。' },
        { type: 'table', head: ['誰', '對 /run/docker.sock', '執行 `docker ps`'], rows: [
          ['root（`sudo docker ps`）', '擁有者，可讀寫', '可以'],
          ['docker 群組的成員', '群組權限 rw-', '可以'],
          ['其他使用者（新帳號 learner）', '其他人權限 ---', 'permission denied while trying to connect to the Docker daemon socket'],
        ] },
        { type: 'p', text: '新帳號的錯誤訊息很長，但重點在最後：`dial unix /var/run/docker.sock: connect: permission denied`，也就是連不上 socket，不是 daemon 壞了，也不是 docker 沒裝好。修正方式是把使用者加進 docker 群組：`sudo usermod -aG docker learner`（`-a` 是附加，少了它會把使用者從其他群組移除，包括 sudo）。群組成員是登入時決定的，已經開著的 Shell 不會自動得到新群組，要重新登入，或用 `newgrp docker` 開一個帶著 docker 群組的新 Shell。' },
        { type: 'example', id: 'dkr02-denied' },
        { type: 'callout', tone: 'warning', title: '常見誤解：加入 docker 群組只是省掉打 sudo', text: 'Docker 的文件明確寫著 docker 群組授予等同 root 的權限。能連上 docker.sock 的人可以要求以 root 執行的 dockerd 做任何事，例如啟動一個以 `--privileged` 執行、把主機的根目錄掛進容器的容器，在裡面修改主機的 /etc/shadow 或 sudoers，完全不需要密碼，也不會留下 sudo 的紀錄。所以只把真正需要的人加進 docker 群組；`sudo chmod 666 /run/docker.sock` 更糟，等於讓主機上每一個帳號（包括被入侵的網站程式）都成為 root；把 Engine API 以沒有 TLS 認證的 TCP（例如 2375 埠）對外開放，則是讓整個網路都能取得 root。需要降低風險時，可以考慮 Docker 的 rootless 模式（daemon 以一般使用者執行）。' },
        { type: 'callout', tone: 'note', title: '模擬環境的簡化', text: '模擬環境把 socket 顯示成一般檔案，`ls -l` 印 `-rw-rw----`；真實的主機第一個字元是 `s`（socket）。權限檢查的結果和真實的 Docker 相同。' },
      ],
    },
    {
      id: 'dkr02-s-chain', title: 'dockerd 之下：containerd、shim 與 runc',
      blocks: [
        { type: 'p', text: '早期的 Docker 是一個大程式，什麼都自己做。後來它被拆開：建立與執行容器的部分成為 containerd（後來捐給 CNCF 的獨立專案），真正請核心建立容器的部分成為 runc（捐給 OCI，作為 runtime 規格的參考實作）。今天一次 `docker run` 會經過這條鏈：' },
        { type: 'table', head: ['層', '程式', '對上一層說什麼', '做什麼'], rows: [
          ['1', 'docker（Client）', '—', '把指令變成 Engine API 的 HTTP 請求'],
          ['2', 'dockerd', 'Engine API（/var/run/docker.sock）', 'Image 的拉取與儲存、容器的設定、網路、Volume、日誌；把容器的設定翻譯成 OCI runtime 規格'],
          ['3', 'containerd', 'gRPC（/run/containerd/containerd.sock）', '容器與 task（執行中的程式）的生命週期；為每個容器啟動一個 shim'],
          ['4', 'containerd-shim-runc-v2', '由 containerd 啟動', '容器的父行程：呼叫 runc、保留標準輸入輸出、收集結束碼'],
          ['5', 'runc', '命令列：runc create／start', '讀 OCI bundle（config.json 與 rootfs），請核心建立 namespace、cgroup，執行容器的程式後結束'],
        ] },
        { type: 'p', text: '最底下真正隔離容器的是 Linux 核心本身：namespace 讓容器有自己的行程編號（容器裡的主程式是 PID 1）、掛載表、網路介面與主機名稱；cgroup 計算並限制 CPU 與記憶體；overlay2 把 Image 的唯讀層與容器的可寫層疊成一個檔案系統。這些都不是 Docker 發明的核心功能，Docker 只是把它們組合起來。`docker info` 從 daemon 這一側看到同樣的東西：Storage Driver: overlay2、Cgroup Driver: systemd、Cgroup Version: 2，以及容器與 Image 的數量。' },
        { type: 'example', id: 'dkr02-info' },
        { type: 'callout', tone: 'note', title: '在模擬環境看不到的部分', text: '真實的主機上，`ps` 可以看到每個執行中容器的 containerd-shim-runc-v2 與容器裡的程式（它們是主機上的普通行程）。模擬環境只模擬 docker 指令看得到的結果，主機的 `ps` 只有 containerd 與 dockerd；shim、runc、namespace 與 cgroup 只在課文與下面的情境裡說明。`docker info` 也只印出部分欄位。' },
      ],
    },
    {
      id: 'dkr02-s-registry', title: 'Image 從哪裡來：Registry、名稱與 docker pull',
      blocks: [
        { type: 'p', text: 'Image 存放在 Registry：一個以 HTTP API 提供 Image 下載與上傳的伺服器。Docker 預設的 Registry 是 Docker Hub（名稱裡寫作 docker.io），其他還有雲端服務商的 Registry、GitHub 的 ghcr.io，或公司自己架的私有 Registry。Image 的完整名稱寫成 `registry/namespace/repository:tag`，省略的部分由 Docker 補上預設值：' },
        { type: 'table', head: ['你寫的', '完整的名稱', '說明'], rows: [
          ['`nginx`', '`docker.io/library/nginx:latest`', 'Registry 預設 docker.io，官方 Image 的命名空間是 library，標籤預設 latest'],
          ['`nginx:1.27`', '`docker.io/library/nginx:1.27`', '指定標籤 1.27'],
          ['`bitnami/redis:7.4`', '`docker.io/bitnami/redis:7.4`', '有命名空間（組織或使用者），不是官方 Image'],
          ['`ghcr.io/acme/api:2.3.0`', '（已經完整）', '第一段有點（.）或冒號，或是 localhost，就被當成 Registry 的主機名稱'],
          ['`nginx@sha256:…`', '`docker.io/library/nginx@sha256:…`', '以 digest 指定，永遠是同一份內容'],
        ] },
        { type: 'p', text: '`docker pull` 請 daemon 從 Registry 下載 Image：先印出拉取的儲存庫，然後每一層一行（層的 ID 與 Pull complete），最後是 Digest（這份內容的 SHA-256）與 Status。下載完的 Image 就是本機的 Image，`docker images` 列出它們：IMAGE ID 是本機 Image 設定的雜湊（只顯示前 12 個字），CREATED 是 Image 建置的時間，不是你下載的時間。同一個 Image 再拉一次，daemon 比對 digest 後只回報 Image is up to date；寫成完整名稱也一樣，因為它們本來就是同一個名字。' },
        { type: 'example', id: 'dkr02-pull' },
        { type: 'callout', tone: 'warning', title: '常見誤解：latest 就是最新版', text: 'latest 只是「沒寫標籤時用的標籤名稱」，Registry 不會自動讓它指向最新版，維護者推送到哪一份它就是哪一份。而且標籤是可以移動的：今天的 nginx:1.27 和下個月的 nginx:1.27 可能是不同的內容（例如修補了安全問題後重新建置）。需要每台主機都跑完全相同的內容時，以 digest（`@sha256:…`）指定；正式環境至少要寫明確的標籤，不要依賴 latest。' },
      ],
    },
    {
      id: 'dkr02-s-run', title: '一次 docker run nginx 的完整路徑',
      blocks: [
        { type: 'p', text: '把前面的元件串起來。`docker run` 其實是 Client 幫你連續呼叫好幾個 API：先建立容器；daemon 回答本機沒有這個 Image 時，Client 請 daemon 拉取，再建立一次；最後啟動。啟動時 dockerd 把工作交給 containerd，containerd 經由 shim 執行 runc，runc 請核心建立隔離的行程。下面的情境一步一步走過這條路，右邊的表是 dockerd 心裡的「本機的 Image」與「容器」。' },
        { type: 'example', id: 'dkr02-run-nginx' },
        { type: 'list', ordered: true, items: [
          'Client → dockerd：`POST /containers/create`，回 404 No such image（本機沒有）。',
          'Client → dockerd：`POST /images/create`，dockerd 向 registry-1.docker.io 要 manifest、config 與每一層，驗證 digest 後存進 /var/lib/docker。',
          'Client → dockerd：再一次 `POST /containers/create`，得到容器 ID（Created）。',
          'Client → dockerd：`POST /containers/<ID>/start`；dockerd 以 gRPC 請 containerd 建立並啟動 task。',
          'containerd 啟動 shim，shim 執行 runc；runc 讀 config.json，建立 namespace 與 cgroup，執行 nginx，然後結束。',
        ] },
        { type: 'p', text: '在終端機上，本機已經有的 Image 直接使用，沒有任何下載的輸出；本機沒有的，`docker run` 在標準錯誤印出 `Unable to find image … locally` 與拉取的過程，標準輸出只留下容器 ID（加了 `-d` 時）。' },
        { type: 'example', id: 'dkr02-run-pull' },
      ],
    },
    {
      id: 'dkr02-s-oci', title: 'OCI 標準：Image 與 runtime 的共同語言',
      blocks: [
        { type: 'p', text: '2015 年，Docker 與其他公司在 Linux 基金會之下成立 Open Container Initiative（OCI），把 Docker 的 Image 格式與執行方式整理成開放的標準。OCI 標準主要有三份規格，每一份都對應到上面那條鏈的一段：' },
        { type: 'table', head: ['規格', '規範什麼', '在 docker run nginx 裡'], rows: [
          ['Image 規格（image-spec）', 'Image 的 manifest、config 與層的格式，以及跨平台的 image index；每個部分以 digest（內容的雜湊）指名', 'Registry 回傳的 image index、amd64 的 manifest、config 與 7 個層'],
          ['Runtime 規格（runtime-spec）', 'bundle（config.json 加 rootfs）的格式：要執行的程式、環境、掛載、namespace、cgroup 等，以及容器的生命週期（create、start、kill、delete）', 'dockerd 產生的規格、shim 交給 runc 的 bundle'],
          ['Distribution 規格（distribution-spec）', 'Registry 的 HTTP API：以 /v2/ 開頭的路徑取得與上傳 manifest 與 blob', 'dockerd 對 registry-1.docker.io 的 GET'],
        ] },
        { type: 'p', text: '標準的意義在於可以替換：用 Docker 建置、推送到任何符合規格的 Registry 的 Image，可以由 Podman、containerd 的 nerdctl，或 Kubernetes（經由 CRI 使用 containerd 或 CRI-O）拉取與執行；runc 也可以換成其他符合 runtime 規格的實作，例如 crun，或以輕量虛擬機隔離的 runtime。Docker 只是其中一套工具，Image 與容器的格式不屬於任何一家公司。所以學會的是一套通用的概念：Registry 上以 digest 指名的 Image、由 bundle 描述的容器，以及在核心上被隔離的行程。' },
        { type: 'callout', tone: 'tip', title: 'Dockerfile 不是 OCI 標準的一部分', text: 'OCI 規範的是建置的結果（Image）與執行的方式，不規範怎麼建置。Dockerfile 是 Docker（BuildKit）的建置描述，其他工具也能讀它或用自己的方式產生 Image，只要產生的 Image 符合 image-spec，任何 runtime 都能執行。建置會在 DKR05 起介紹。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [runNginx],
    exercises: [
      { id: 'dkr02-net-registry', task: 'field', scene: 'dkr02-run-nginx', message: 'manifest-req', layer: 'application', field: 'Host', title: 'Image 從哪一台伺服器下載',
        statement: '在「docker run nginx」情境中，dockerd 向 Registry 要 nginx 的 manifest 時，應用層標頭的「Host」是什麼？',
        hints: ['這則訊息是誰送給誰的：Client 送給 dockerd，還是 dockerd 送給 Registry？', 'Image 名稱裡的 docker.io 是 Docker Hub 的代稱，它的 Registry API 在哪一台主機？'],
        explanation: 'nginx 的完整名稱是 docker.io/library/nginx:latest，docker.io 代表 Docker Hub，而 Docker Hub 的 Registry API 在 registry-1.docker.io，所以 dockerd 的請求 Host 是 registry-1.docker.io、路徑是 /v2/library/nginx/manifests/latest。docker.io 只是名稱裡的寫法；hub.docker.com 是給人瀏覽的網站；auth.docker.io 只發 token，不提供 Image。',
        mistakes: [
          { answer: { value: 'docker.io' }, why: 'docker.io 是 Image 名稱裡代表 Docker Hub 的寫法，實際提供 Registry API 的主機是 registry-1.docker.io。' },
          { answer: { value: 'hub.docker.com' }, why: 'hub.docker.com 是給人用瀏覽器搜尋 Image 的網站，不是 daemon 下載 manifest 與層的 Registry API。' },
          { answer: { value: 'auth.docker.io' }, why: 'auth.docker.io 只負責發 token（情境裡省略了那個往返）；manifest 與層要向 Registry 要。' },
        ] },
      { id: 'dkr02-net-local', task: 'table', scene: 'dkr02-run-nginx', message: 'create-404', node: 'dockerd', table: '本機的 Image', row: 'nginx:latest', column: '在本機', title: '第一次建立容器時，本機有沒有 Image',
        statement: '同一個情境裡，dockerd 回覆第一次 POST /containers/create（404）時，它的「本機的 Image」表中 nginx:latest 的「在本機」是什麼？',
        hints: ['dockerd 為什麼回 404？回應的內容寫了什麼？', '拉取是在這則訊息之前還是之後發生的？'],
        explanation: 'daemon 建立容器時只在本機的 Image 裡找；這時 nginx:latest 還不在本機，所以回 404 No such image: nginx:latest，表中是「沒有」。Client 收到後才請 daemon 拉取，下載與驗證完成後（blobs-resp 之後）表中才變成「有」。',
        mistakes: [
          { answer: { cell: '有' }, why: '如果本機已經有，dockerd 會直接建立容器，不會回 404；Image 要到拉取完成之後才在本機。' },
          { answer: { cell: '下載中' }, why: '下載是 Client 收到 404、送出 POST /images/create 之後才開始的；回 404 的當下還沒有人要求下載。' },
        ] },
      { id: 'dkr02-net-spec', task: 'field', scene: 'dkr02-run-nginx', message: 'runc-create', layer: 'application', field: '規格檔', title: 'runc 讀哪一個檔案',
        statement: '同一個情境裡，shim 執行 runc create 時，runc 從 bundle 讀取的 OCI runtime 規格檔叫什麼名字？（填「規格檔」欄位的值）',
        hints: ['runc 不認識 Docker 的 Image，也不讀 Dockerfile；它只讀 OCI bundle。', 'bundle 是一個目錄，裡面有 rootfs 與一個 JSON 檔。'],
        explanation: 'OCI runtime 規格定義的 bundle 是一個目錄：rootfs 是容器看到的根目錄，config.json 描述要執行的程式、環境變數、掛載、namespace 與 cgroup。dockerd 把容器的設定翻譯成這份規格，containerd 準備好 bundle，runc 只讀它。Dockerfile 是建置用的描述，manifest 是 Registry 上 Image 的清單，兩者都不是 runc 讀的東西。',
        mistakes: [
          { answer: { value: 'Dockerfile' }, why: 'Dockerfile 是建置 Image 的描述，執行容器時早就用不到；runc 甚至不知道 Image 是怎麼建出來的。' },
          { answer: { value: 'manifest.json' }, why: 'manifest 屬於 OCI Image 規格，列出 Image 的 config 與層，由 dockerd 下載時使用；runc 讀的是 runtime 規格的 config.json。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'dkr02-q1', prompt: '執行 `docker ps` 時，是誰實際查出目前有哪些容器？',
      options: ['docker 這個執行檔自己讀 /var/lib/docker 裡的檔案', 'dockerd：docker CLI 經由 `/var/run/docker.sock` 送出 Engine API 請求，由 daemon 回答', 'containerd 直接回答 docker CLI', 'runc 列出它啟動過的容器'],
      answer: 1,
      explanation: 'docker 是 Client，它把 `GET /containers/json` 送到 docker.sock，由以 root 執行的 dockerd 回答並由 Client 排成表格。Client 自己不讀 /var/lib/docker（它也沒有權限）；Client 不直接和 containerd 說話，containerd 是 dockerd 的下一層；runc 建立容器後就結束了，不保留容器清單。',
    },
    {
      id: 'dkr02-q2', prompt: 'learner 剛執行過 `sudo usermod -aG docker learner`，在同一個 Shell 裡執行 `docker ps` 仍然 permission denied。最可能的原因是什麼？',
      options: ['docker 群組的 GID 錯了，要改成 0', 'dockerd 要重新啟動才會讀到新的群組', 'socket 的權限必須改成 666', '群組成員是登入時決定的，目前的 Shell 還沒有 docker 群組；重新登入或執行 `newgrp docker`'],
      answer: 3,
      explanation: 'usermod 改的是帳號資料庫，已經開著的 Shell 的群組在登入時就決定了，`id` 看得出來還沒有 docker；重新登入或 `newgrp docker` 之後就能連上 socket。檢查權限的是核心，不是 dockerd，所以不必重新啟動 daemon；GID 0 是 root 群組，改成它是嚴重的錯誤；chmod 666 雖然有效，卻讓每個帳號都能取得 root。',
    },
    {
      id: 'dkr02-q3', prompt: '為什麼說「把帳號加進 docker 群組，等於給它 root 權限」？',
      options: ['因為它能要求以 root 執行的 dockerd 做任何事，例如啟動一個掛載主機根目錄的特權容器，修改主機上的任何檔案', '因為 docker 群組的 GID 是 0', '因為加入 docker 群組會自動把帳號加進 sudoers', '因為加入後帳號的 UID 會變成 0'],
      answer: 0,
      explanation: 'docker 群組的權力來自 socket：能連上它就能命令以 root 執行的 daemon，而 daemon 可以把主機的任何目錄掛進以 root 執行的容器。docker 群組的 GID 是一般的系統群組號碼（例如 988），不是 0；它和 sudoers 無關；帳號的 UID 也不會改變，危險在於透過 daemon 間接取得 root。',
    },
    {
      id: 'dkr02-q4', prompt: '`docker pull nginx:1.27` 拉取的 Image，完整的名稱是哪一個？',
      options: ['`nginx.io/nginx:1.27`', '`hub.docker.com/nginx/1.27`', '`docker.io/library/nginx:1.27`', '`registry-1.docker.io/nginx:latest`'],
      answer: 2,
      explanation: '沒有寫 Registry 時預設 docker.io（Docker Hub），官方 Image 的命名空間是 library，標籤是寫出來的 1.27，所以是 docker.io/library/nginx:1.27，docker pull 的最後一行也印出這個名字。nginx.io 不是 Registry；hub.docker.com 是網站而且標籤不是路徑；registry-1.docker.io 是 API 的主機，但少了 library，標籤也錯成 latest。',
    },
    {
      id: 'dkr02-q5', prompt: '本機沒有 `redis:7.4`，執行 `docker run -d redis:7.4` 會怎樣？',
      options: ['直接失敗，必須先手動 `docker pull`', 'docker CLI 自己從 Docker Hub 下載，再上傳給 daemon', 'daemon 回「No such image」，CLI 印出 `Unable to find image \'redis:7.4\' locally`，請 daemon 從 Registry 拉取，再建立並啟動容器', '自動改用本機的 `redis:latest`'],
      answer: 2,
      explanation: 'docker run 先要求建立容器，daemon 在本機找不到就回 404；CLI 預設會請 daemon 拉取（和 docker pull 同一個 API），完成後重新建立並啟動。不必先手動 pull；下載是 daemon 做的，不是 CLI；不同的標籤是不同的 Image，Docker 不會用 latest 代替你指定的 7.4。',
    },
    {
      id: 'dkr02-q6', prompt: 'OCI 的 runtime 規格（runtime-spec）規範的是什麼？',
      options: ['bundle 的格式：rootfs 加上 config.json，描述要執行的程式、namespace、cgroup 與掛載，以及容器的生命週期；runc、crun 等 runtime 都照它執行', 'Dockerfile 的語法與指令', 'Registry 上 Image 的收費與權限', 'docker CLI 的選項名稱'],
      answer: 0,
      explanation: 'runtime-spec 讓任何高層工具（dockerd、Podman、Kubernetes 的 CRI 實作）產生同一種 bundle，交給任何符合規格的 runtime 執行。Dockerfile 是 Docker 的建置描述，不屬於 OCI 規格；Registry 的 API 是 distribution-spec，而且不管收費；CLI 的選項是各工具自己的設計。',
    },
    {
      id: 'dkr02-q7', prompt: '關於 dockerd、containerd 與 runc 的分工，哪一個說法正確？',
      options: ['runc 長駐在背景，管理所有執行中的容器', 'containerd 負責解析 Dockerfile 並建置 Image', 'dockerd 直接 fork 出容器的行程，中間沒有其他元件', 'dockerd 提供 Engine API 並管理 Image、網路等；containerd 管理容器的生命週期；runc 依 OCI 規格建立容器之後就結束'],
      answer: 3,
      explanation: 'dockerd 是 Docker 的 API 與功能層，containerd 以 gRPC 接手容器與 task 的生命週期並為每個容器啟動 shim，runc 只在建立時執行。runc 不長駐，容器的父行程是 shim；建置是 dockerd 的 BuildKit 做的，不是 containerd；dockerd 不直接建立容器行程，中間經過 containerd、shim 與 runc。',
    },
    {
      id: 'dkr02-q8', prompt: '兩台主機在不同月份都執行 `docker pull nginx:1.27`，`docker images` 卻顯示不同的 IMAGE ID。最合理的解釋與固定內容的方法是什麼？',
      options: ['Docker Hub 的快取不一致，多拉幾次就會一樣', '標籤可以被重新指向新的建置；要每台主機都相同，以 digest（`nginx@sha256:…`）指定', 'IMAGE ID 每次拉取都隨機產生，本來就不會相同', '兩台主機的 Storage Driver 不同'],
      answer: 1,
      explanation: '維護者重新建置後把 1.27 這個標籤指向新的內容，所以先後拉到不同的 Image；digest 是內容的雜湊，以 `@sha256:…` 指定就永遠是同一份。多拉幾次只會拿到標籤目前指向的版本；IMAGE ID 由 Image 的設定內容算出，不是隨機的；Storage Driver 只影響層在磁碟上怎麼存，不改變 Image 的身分。',
    },
  ],
  terminal: {
    machines: [fresh, lab],
    examples: [
      {
        id: 'dkr02-version', title: 'Client、Server 與兩個 daemon', machine: 'dkr02-lab',
        description: '在 build-08（learner 已在 docker 群組）執行 `docker version`：Client 是 docker 指令自己的資訊，Server 是 dockerd 回答的，列出 Engine 以及它使用的 containerd、runc 與 docker-init 的版本（模擬環境省略 Git commit 與 Built 兩行）。接著用 `pgrep -a` 看到兩個以 root 長駐的 daemon：dockerd 的命令列寫明它經由 /run/containerd/containerd.sock 使用 containerd。',
        steps: [
          { command: 'docker version', output: 'Client: Docker Engine - Community\n Version:           27.5.1\n API version:       1.47\n Go version:        go1.22.11\n OS/Arch:           linux/amd64\n Context:           default\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.5.1\n  API version:      1.47 (minimum version 1.24)\n  Go version:       go1.22.11\n  OS/Arch:          linux/amd64\n  Experimental:     false\n containerd:\n  Version:          1.7.25\n runc:\n  Version:          1.2.4\n docker-init:\n  Version:          0.19.0' },
          { command: 'pgrep -a dockerd', output: '900 /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock' },
          { command: 'pgrep -a containerd', output: '850 /usr/bin/containerd' },
        ],
      },
      {
        id: 'dkr02-denied', title: '新帳號的 permission denied 與 docker 群組', machine: 'dkr02-new',
        description: 'build-07 上的 learner 還不在 docker 群組。`docker version` 照樣印出 Client 的部分（它不需要 daemon），要問 Server 時才因為連不上 socket 失敗；socket 是 root:docker 0660（模擬環境顯示成一般檔案）。`usermod -aG` 之後同一個 Shell 仍然被拒絕，因為群組在登入時決定；`newgrp docker` 開出帶有 docker 群組的 Shell 之後，`docker ps` 就成功了。',
        steps: [
          { command: 'docker version', output: 'Client: Docker Engine - Community\n Version:           27.5.1\n API version:       1.47\n Go version:        go1.22.11\n OS/Arch:           linux/amd64\n Context:           default\npermission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/version": dial unix /var/run/docker.sock: connect: permission denied' },
          { command: 'ls -l /var/run/docker.sock', output: '-rw-rw---- root    docker      0 /var/run/docker.sock' },
          { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)' },
          { command: 'sudo usermod -aG docker learner', output: '' },
          { command: 'docker ps', output: 'permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.47/containers/json": dial unix /var/run/docker.sock: connect: permission denied' },
          { command: 'newgrp docker', output: '' },
          { command: 'id', output: 'uid=1000(learner) gid=988(docker) groups=988(docker),1000(learner),27(sudo)' },
          { command: 'docker ps', output: 'CONTAINER ID   IMAGE         COMMAND            CREATED       STATUS       PORTS     NAMES\n66bccd0642f3   alpine:3.21   "sleep infinity"   2 hours ago   Up 2 hours             ci-runner' },
        ],
      },
      {
        id: 'dkr02-info', title: '從 daemon 看整台主機：docker info', machine: 'dkr02-lab',
        description: '`docker info` 的 Server 部分是 daemon 的狀態：兩個容器（一個執行中、一個已停止）、一個 Image、儲存驅動程式 overlay2、cgroup 由 systemd 管理（cgroup v2）、主機的 CPU 與記憶體。模擬環境只印出部分欄位。docker.service 的 ExecStart 說明 dockerd 從 systemd 接手 socket（-H fd://），並連到 containerd 的 socket。',
        steps: [
          { command: 'docker info', output: 'Client: Docker Engine - Community\n Version:    27.5.1\n Context:    default\n Debug Mode: false\n\nServer:\n Containers: 2\n  Running: 1\n  Paused: 0\n  Stopped: 1\n Images: 1\n Server Version: 27.5.1\n Storage Driver: overlay2\n Logging Driver: json-file\n Cgroup Driver: systemd\n Cgroup Version: 2\n Kernel Version: 6.8.0-sim\n Operating System: Ubuntu 24.04.1 LTS\n OSType: linux\n Architecture: x86_64\n CPUs: 4\n Total Memory: 8GiB\n Name: build-08\n Docker Root Dir: /var/lib/docker' },
          { command: 'docker ps -a', output: 'CONTAINER ID   IMAGE         COMMAND            CREATED          STATUS                      PORTS     NAMES\nbc71a6801cca   alpine:3.21   "echo ok"          50 minutes ago   Exited (0) 50 minutes ago             smoke-test\nd34b1a690445   alpine:3.21   "sleep infinity"   2 hours ago      Up 2 hours                            ci-runner' },
          { command: 'grep ExecStart /usr/lib/systemd/system/docker.service', output: 'ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock' },
        ],
      },
      {
        id: 'dkr02-pull', title: 'docker pull：層、digest 與完整的名稱', machine: 'dkr02-lab',
        description: '本機一開始只有 alpine。`docker pull nginx:1.27` 從 Docker Hub 拉下 7 個層，印出 digest 與完整的名稱 docker.io/library/nginx:1.27；之後 `docker images` 多了一列。用完整的名稱再拉一次，daemon 比對 digest 後回報已是最新，證明兩種寫法是同一個 Image。',
        steps: [
          { command: 'docker images', output: 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nalpine       3.21      62550e7b9f25   6 weeks ago   7.83MB' },
          { command: 'docker pull nginx:1.27', output: '1.27: Pulling from library/nginx\na2c519d575bf: Pull complete\n52068adf25b0: Pull complete\ne14d9f9b8ed9: Pull complete\n62c47e55d26a: Pull complete\n9b1b9827186a: Pull complete\n0b7aaf81c426: Pull complete\n473c1ae759f9: Pull complete\nDigest: sha256:7026a3599da8c8b94bbd5673cc251297a41fde09aeba27312571c77785b9ddcd\nStatus: Downloaded newer image for nginx:1.27\ndocker.io/library/nginx:1.27' },
          { command: 'docker images', output: 'REPOSITORY   TAG       IMAGE ID       CREATED       SIZE\nnginx        1.27      ec863f3501ad   2 weeks ago   192MB\nalpine       3.21      62550e7b9f25   6 weeks ago   7.83MB' },
          { command: 'docker pull docker.io/library/nginx:1.27', output: '1.27: Pulling from library/nginx\nDigest: sha256:7026a3599da8c8b94bbd5673cc251297a41fde09aeba27312571c77785b9ddcd\nStatus: Image is up to date for nginx:1.27\ndocker.io/library/nginx:1.27' },
        ],
      },
      {
        id: 'dkr02-run-pull', title: '本機有的直接用，本機沒有的先拉取', machine: 'dkr02-lab',
        description: 'alpine:3.21 已在本機，`docker run` 直接建立容器、印出 hello，沒有任何下載。nginx:1.27 不在本機，`docker run -d` 先印出 Unable to find image（標準錯誤）與拉取的過程，再印出新容器的完整 ID；`docker ps` 裡的 web 剛啟動。',
        steps: [
          { command: 'docker run --rm alpine:3.21 echo hello', output: 'hello' },
          { command: 'docker run -d --name web nginx:1.27', output: 'Unable to find image \'nginx:1.27\' locally\n1.27: Pulling from library/nginx\na2c519d575bf: Pull complete\n52068adf25b0: Pull complete\ne14d9f9b8ed9: Pull complete\n62c47e55d26a: Pull complete\n9b1b9827186a: Pull complete\n0b7aaf81c426: Pull complete\n473c1ae759f9: Pull complete\nDigest: sha256:7026a3599da8c8b94bbd5673cc251297a41fde09aeba27312571c77785b9ddcd\nStatus: Downloaded newer image for nginx:1.27\n2401ec12051730392f913a302429d1ca31920fb8861aa1ea1813ff08b4de9d66' },
          { command: 'docker ps', output: 'CONTAINER ID   IMAGE         COMMAND                  CREATED                  STATUS                  PORTS     NAMES\n2401ec120517   nginx:1.27    "/docker-entrypoint.…"   Less than a second ago   Up Less than a second   80/tcp    web\nd34b1a690445   alpine:3.21   "sleep infinity"         2 hours ago              Up 2 hours                        ci-runner' },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr02-x-group', title: '讓新同事不用 sudo 就能使用 docker', machine: 'dkr02-new',
        statement: 'build-07 上的 learner 是新帳號，執行 `docker ps` 得到 permission denied。請用正確的方式讓 learner 以自己的身分（不加 sudo）執行 `docker ps` 成功，並在最後實際執行一次 `docker ps` 確認。不可以放寬 /run/docker.sock 的權限或改變它的擁有者，learner 也要保留原本的 sudo 群組。',
        checks: [
          { kind: 'user', name: 'learner', groups: ['docker', 'sudo'] },
          { kind: 'mode', path: '/run/docker.sock', mode: 0o660 },
          { kind: 'owner', path: '/run/docker.sock', owner: 'root', group: 'docker' },
          { kind: 'output', fromCommand: '^docker (ps|container ls)\\b' },
        ],
        solution: ['sudo usermod -aG docker learner', 'newgrp docker', 'docker ps'],
        variants: [BUSY],
        mistakes: [
          { commands: ['sudo chmod 666 /run/docker.sock', 'docker ps'], why: '讓所有帳號都能連上 socket，`docker ps` 雖然成功，但主機上每個帳號都等於有了 root；權限必須維持 0660。' },
          { commands: ['sudo usermod -aG docker learner', 'docker ps'], why: '帳號已加進 docker 群組，但目前的 Shell 是加入之前登入的，還沒有這個群組，`docker ps` 仍然 permission denied；要重新登入或 `newgrp docker`。' },
          { commands: ['sudo usermod -G docker learner', 'newgrp docker', 'docker ps'], why: '少了 `-a`：`-G` 會把補充群組整個換成 docker，learner 被移出 sudo 群組，之後就不能再用 sudo 了。' },
          { commands: ['sudo usermod -aG docker learner', 'sudo docker ps'], why: '群組加好了，但確認時用了 sudo，以 root 身分執行；題目要的是 learner 自己執行 `docker ps` 成功。' },
          { commands: ['sudo chown learner /run/docker.sock', 'docker ps'], why: '把 socket 的擁有者改成 learner：只有 learner 能用，其他 docker 群組的成員反而可能被擋；而且 socket 由 systemd 在每次啟動時重新建立，這種修改是錯的方向。' },
        ],
        hints: ['先看 `ls -l /var/run/docker.sock` 的擁有者與群組：誰有權限連上它？', '`usermod -aG 群組 帳號` 附加補充群組；已經開著的 Shell 要 `newgrp docker`（或重新登入）才會帶著新群組。'],
        explanation: '/run/docker.sock 是 root:docker 0660，只有 root 與 docker 群組能連上。`sudo usermod -aG docker learner` 把 learner 附加進 docker 群組（保留 sudo），`newgrp docker` 開出帶著 docker 群組的 Shell，於是 `docker ps` 以 learner 的身分成功。chmod 666 或改擁有者都能「解決」錯誤，卻把 root 等級的權力交給不該有的人；記得 docker 群組本身就等於 root，只給真正需要的帳號。',
      },
      {
        id: 'dkr02-x-pull', title: '拉取指定標籤並回報 Image ID', machine: 'dkr02-lab',
        statement: '團隊的設定規定快取服務固定使用 `redis:7.4`（不是 latest）。請把這個 Image 拉到 build-08，然後用 docker 的指令查出它在本機的 Image ID，只印出 `docker images` 的 IMAGE ID 欄那 12 個字元（一行）。',
        checks: [{ kind: 'image', name: 'redis:7.4' }, { kind: 'output', fromCommand: '^docker (images|image (ls|list)|image inspect|inspect)\\b' }],
        solution: ['docker pull redis:7.4', 'docker images -q redis:7.4'],
        variants: [REBUILT, OTHER_HOST],
        mistakes: [
          { commands: ['docker pull redis', 'docker images -q redis'], why: '沒有寫標籤就是 redis:latest，拉到的是另一個 Image，印出的也是 latest 的 ID；redis:7.4 仍不在本機。' },
          { commands: ['docker images -q redis:7.4'], why: '還沒有拉取：本機沒有 redis:7.4，`docker images -q` 什麼也不印。' },
          { commands: ['docker pull redis:7.4', 'docker images -q'], why: '沒有指定儲存庫與標籤，印出的是本機所有 Image 的 ID（alpine 也在內），不只 redis:7.4 那一個。' },
          { commands: ['docker pull redis:7.4', "docker inspect -f '{{.Id}}' redis:7.4"], why: '印出的是完整的 Image ID（sha256: 加 64 個十六進位字），題目要的是 docker images 顯示的 12 個字元。' },
          { commands: ['docker pull redis:7.4', 'echo cd9ffb7978f9'], why: '直接打出這台主機的 ID：另一次建置的 redis:7.4 有不同的 ID，而且答案必須來自查詢的指令。' },
        ],
        hints: ['`docker pull 儲存庫:標籤` 指定要哪一個標籤；沒寫標籤就是 latest。', '`docker images` 可以接 `儲存庫:標籤` 只列出那一個，`-q` 只印 ID。'],
        explanation: '`docker pull redis:7.4` 請 daemon 從 Docker Hub 拉取 docker.io/library/redis:7.4，`docker images -q redis:7.4` 只印出它的短 ID（`docker images --format \'{{.ID}}\' redis:7.4` 也可以）。latest 與 7.4 是不同的標籤、可能是完全不同的 Image；同一個標籤在不同時間也可能指向不同的建置，所以 ID 要從實際拉到的 Image 查，不能抄別台主機的答案。',
      },
    ],
  },
};
