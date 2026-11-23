/*
 * DKR11 Container registries and image tags (DKR-4, network-sequence; the blueprint's pipeline-diagram activity drawn as
 * a network scene). A terminal lesson on the compose profile (engine stage E23, its registry part) beside one
 * network-protocol scene. The terminal part, on two made-up hosts: ci-07 (a CI build host) builds team/api from ~/api,
 * gives one image several names with docker tag (the same IMAGE ID), logs in to the private registry
 * registry.example.com:5000 with --password-stdin from a token file (the lesson tokens are obviously fake), shows that
 * ~/.docker/config.json keeps user:token base64-encoded (not encrypted), pushes (unauthorized before login; Pushed, Layer
 * already exists, Mounted from; the digest line), and on the immutable releases.example.com sees a rebuilt 1.5.0 get a
 * new digest that the registry refuses to put under the existing tag (the old local image becomes <none>). prod-03 (a
 * production host) runs api from a latest it pulled two weeks ago: pulling latest again moves the tag to a release
 * candidate, the old image becomes <none> and docker ps shows its ID; pulling 1.4.0 by tag, by its commit tag and by
 * digest gives one image and one digest (docker images --digests), and a container runs from NAME@sha256:…. The network
 * part: docker push 1.5.0 from ci-07 (the Engine API with X-Registry-Auth, GET /v2/ and the 401 challenge, the token
 * request with its scope, HEAD of a blob and 404, the upload, PUT of the manifest and Docker-Content-Digest), then
 * prod-03 asking what latest points to and pulling 1.4.0's manifest by digest. Facts follow the Docker documentation
 * (docker login, the credentials store, --password-stdin, image references and tags), the OCI distribution
 * specification and Docker's registry token authentication (described generally), and SemVer 2.0.0 (build metadata uses
 * +, which Docker tags do not allow). Simplifications, stated in the text: the simulated registry knows only the users
 * and images the lesson declares and has no tag listing or search; credential helpers, token lifetimes, multi-platform
 * indexes and signing are only explained. In the scene TLS, DNS and the PATCH chunks are left out, one layer stands for
 * all, and addresses (RFC 5737) and ports are made up. Every transcript output was produced by replaying it on the
 * engine; a pushed image is always one the learner built (never an image pulled from Docker Hub), and the registry's
 * digests are those of images the lesson declares there.
 */

import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalDocker, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'learner', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'learner', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const PATH_ENV = 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION_CODENAME=bookworm\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'bash', 'true', 'false', 'id', 'whoami'];
const REG = 'registry.example.com:5000';
const RELEASES = 'releases.example.com';
const API = `${REG}/team/api`;

const API_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY app.py .\nEXPOSE 8000\nCMD ["python", "app.py"]\n';
const WORKER_DOCKERFILE = 'FROM python:3.12-slim\nWORKDIR /app\nCOPY worker.py .\nCMD ["python", "worker.py"]\n';
const RESOLV = 'nameserver 127.0.0.53\noptions edns0 trust-ad\nsearch .\n';

const PYTHON: TerminalImage = {
  name: 'python:3.12-slim', size: 124_000_000, created: '2026-11-10 10:00:00', cmd: ['python3'], env: [PATH_ENV, 'PYTHON_VERSION=3.12.7'], layers: 4, pulled: true, osRelease: DEBIAN,
  commands: BASIC, output: 'Python 3.12.7\n',
};
/** A release of team/api in the team registry (not local unless pulled): a service on port 8000 answered by its own responder. */
const apiRelease = (tag: string, created: string, responder: string, extra: Partial<TerminalImage> = {}): TerminalImage => ({
  name: `${API}:${tag}`, size: 131_400_000, created, cmd: ['python', 'app.py'], env: [PATH_ENV, 'PYTHON_VERSION=3.12.7'], workdir: '/app', expose: [8000], layers: 6, osRelease: DEBIAN,
  service: true, http: { port: 8000, responder }, logs: ['api listening on 0.0.0.0:8000'], ...extra,
});

const API_RESPONDERS = [
  { id: 'api-130', server: 'gunicorn', routes: [{ path: '/', body: 'team/api 1.3.0\n', type: 'text/plain' }] },
  { id: 'api-140', server: 'gunicorn', routes: [{ path: '/', body: 'team/api 1.4.0\n', type: 'text/plain' }] },
  { id: 'api-150rc', server: 'gunicorn', routes: [{ path: '/', body: 'team/api 1.5.0-rc.1\n', type: 'text/plain' }] },
];
/** The team registry's releases (the same data on both hosts, so the same digests): 1.4.0 with its commit tag, and a release candidate someone pushed as latest. */
const REGISTRY_RELEASES: TerminalImage[] = [
  apiRelease('1.4.0', '2026-11-13 14:00:00', 'api-140', { tags: ['sha-8d1e6b2'] }),
  apiRelease('1.5.0-rc.1', '2026-11-21 16:30:00', 'api-150rc', { tags: ['sha-5b90c4e', 'latest'] }),
];

const ciMachine: TerminalMachine = {
  id: 'dkr11-ci', title: 'ci-07（CI 建置主機）', user: 'learner', cwd: '/home/learner', host: 'ci-07', profile: 'compose',
  files: [
    dir('/home', 'root'), dir('/home/learner'),
    dir('/home/learner/api'), file('/home/learner/api/Dockerfile', API_DOCKERFILE), file('/home/learner/api/app.py', 'print("team/api 1.5.0")\n'),
    dir('/home/learner/worker'), file('/home/learner/worker/Dockerfile', WORKER_DOCKERFILE), file('/home/learner/worker/worker.py', 'print("team/worker 0.9.0")\n'),
    file('/home/learner/ci-token.txt', 'lesson-token-ci-0001\n', 'learner', 0o600),
    file('/home/learner/deploy-token.txt', 'lesson-token-deploy-0002\n', 'learner', 0o600),
    file('/home/learner/release-token.txt', 'lesson-token-release-0003\n', 'learner', 0o600),
    dir('/etc', 'root'), file('/etc/resolv.conf', RESOLV, 'root'),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  responders: API_RESPONDERS,
  docker: {
    images: [PYTHON, ...REGISTRY_RELEASES],
    registries: [
      { host: REG, users: [{ name: 'ci', token: 'lesson-token-ci-0001', repos: ['team/*'] }, { name: 'deploy', token: 'lesson-token-deploy-0002', push: false }] },
      { host: RELEASES, users: [{ name: 'ci', token: 'lesson-token-release-0003' }], immutable: true },
    ],
  },
};

const ALPINE: TerminalImage = { name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1,
  osRelease: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n' };
const PROD_IMAGES: TerminalImage[] = [
  ALPINE,
  // What latest pointed to when this host pulled it two weeks ago.
  apiRelease('latest', '2026-11-06 09:00:00', 'api-130', { pulled: true }),
  ...REGISTRY_RELEASES,
];
const prodDocker = (extra: TerminalDocker['containers'] = []): TerminalDocker => ({
  images: PROD_IMAGES,
  containers: [
    { name: 'api', image: `${API}:latest`, state: 'running', created: '2026-11-09 08:00:00', started: '2026-11-09 08:00:00', ports: ['8080:8000'] },
    ...extra,
  ],
  registries: [{ host: REG, users: [{ name: 'ci', token: 'lesson-token-ci-0001', repos: ['team/*'] }, { name: 'deploy', token: 'lesson-token-deploy-0002', push: false }] }],
});
const prodMachine: TerminalMachine = {
  id: 'dkr11-prod', title: 'prod-03（正式環境主機）', user: 'learner', cwd: '/home/learner', host: 'prod-03', profile: 'compose',
  files: [
    dir('/home', 'root'), dir('/home/learner'),
    file('/home/learner/deploy-token.txt', 'lesson-token-deploy-0002\n', 'learner', 0o600),
    dir('/etc', 'root'), file('/etc/resolv.conf', RESOLV, 'root'),
  ],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  responders: API_RESPONDERS,
  docker: prodDocker(),
};
const BUSY_PROD: TerminalVariant = { label: '另一台正式主機：還執行著 log-shipper', files: [], docker: prodDocker([
  { name: 'log-shipper', image: 'alpine:3.21', command: ['sleep', 'infinity'], state: 'running', created: '2026-11-15 07:00:00', started: '2026-11-15 07:00:00' },
]) };

/** Digests of the registry's manifests, as the engine computes them (docker pull and docker push print them). */
const D140 = 'sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8';
const D150 = 'sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead';
const DRC = 'sha256:ae29e04e3d56ef58ccad3ac46e92276bd80dad90874e69ad3f540718d1b8330f';
const DOLD = 'sha256:c845e3830fbbf3d5fab6b25ba86607b23dd1e9c50657696c03a201f392cc21d4';
const short = (digest: string) => digest.slice(7, 19);

// ---- network scene -----------------------------------------------------------------------------------------------
const CI_IP = '198.51.100.21', PROD_IP = '198.51.100.35', REG_IP = '203.0.113.40', CI_PORT = '50412', PROD_PORT = '43870';
const SOCK = '/var/run/docker.sock';
const unix: ProtocolHeader = { layer: 'transport', protocol: 'Unix socket', fields: [{ name: 'socket 路徑', value: SOCK }] };
const engine = (method: string, path: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1（Docker Engine API）', fields: [
  { name: '方法', value: method }, { name: '路徑', value: path }, ...extra.map(([name, value]) => ({ name, value }))] });
const reg = (method: string, path: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（OCI distribution）', fields: [
  { name: '方法', value: method }, { name: '路徑', value: path }, { name: 'Host', value: REG }, ...extra.map(([name, value]) => ({ name, value }))] });
const regResp = (code: string, reason: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（OCI distribution）', fields: [
  { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...extra.map(([name, value]) => ({ name, value }))] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: 'PSH, ACK' }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const ciOut = [tcp(CI_PORT, '5000'), ipv4(CI_IP, REG_IP)], ciIn = [tcp('5000', CI_PORT), ipv4(REG_IP, CI_IP)];
const prodOut = [tcp(PROD_PORT, '5000'), ipv4(PROD_IP, REG_IP)], prodIn = [tcp('5000', PROD_PORT), ipv4(REG_IP, PROD_IP)];

const TAG_HEAD = ['標籤', 'digest（前 12 個字）', '內容'];
const TAG_ROWS = [
  ['1.4.0', short(D140), '1.4.0'], ['sha-8d1e6b2', short(D140), '1.4.0'],
  ['1.5.0-rc.1', short(DRC), '1.5.0-rc.1'], ['sha-5b90c4e', short(DRC), '1.5.0-rc.1'], ['latest', short(DRC), '1.5.0-rc.1'],
];
const tags = (pushed: boolean, changed?: number[]): NodeTable => ({ node: 'registry', name: 'team/api 的標籤', head: TAG_HEAD,
  rows: [...TAG_ROWS, ...pushed ? [['1.5.0', short(D150), '1.5.0']] : []], ...changed ? { changed } : {} });

const pipeline: NetworkScene = {
  id: 'dkr11-pipeline', title: 'build → tag → push → pull：CI、私有 Registry 與正式環境', model: 'tcp-ip',
  description: `ci-07（${CI_IP}）已經把 ~/api 建置成 ${API}:1.5.0，也以 ci 帳號 docker login 過。learner 執行 \`docker push ${API}:1.5.0\`：Client 把請求與 config.json 裡的憑證交給 dockerd，由 dockerd 和私有 Registry ${REG}（${REG_IP}）往返：先取得權杖，再一層一層確認、上傳，最後上傳 manifest，讓標籤 1.5.0 指向它的 digest。之後正式環境 prod-03（${PROD_IP}）的 dockerd 以只能拉取的 deploy 帳號查詢 latest 指向哪裡，並以 digest 拉取核准的 1.4.0。Registry 只用 HTTPS（TLS 的交握與 DNS 查詢省略），多個層只畫一層；位址與連接埠是虛構的，右邊的表是 Registry 上 team/api 的標籤。`,
  nodes: [
    { id: 'ci-cli', label: 'docker CLI（ci-07，以 learner 執行）', kind: 'host', addresses: [`ci-07 ${CI_IP}`] },
    { id: 'ci-dockerd', label: 'dockerd（ci-07 的 Docker daemon）', kind: 'server', addresses: [`unix://${SOCK}`] },
    { id: 'registry', label: `私有 Registry ${REG}`, kind: 'server', addresses: [`IP ${REG_IP}`, 'TCP 5000（HTTPS）'] },
    { id: 'prod', label: 'dockerd（prod-03，正式環境）', kind: 'server', addresses: [`prod-03 ${PROD_IP}`] },
  ],
  messages: [
    { id: 'push-request', from: 'ci-cli', to: 'ci-dockerd', label: 'POST /images/…/team/api/push?tag=1.5.0',
      headers: [engine('POST', `/v1.47/images/${API}/push?tag=1.5.0`, [['X-Registry-Auth', '<base64 的 JSON：使用者 ci 與 Token>']]), unix],
      payload: '（沒有內容；要推送哪個 Image 由路徑與 tag 決定）',
      note: 'docker push 不建置、也不改名，只推送本機已經有這個名稱的 Image。Client 依名稱的第一段（registry.example.com:5000）找出 ~/.docker/config.json 裡那個 Registry 的憑證，放進 X-Registry-Auth 標頭交給 dockerd；真正連到 Registry、上傳層的是 daemon。沒有 docker login 過時這個標頭沒有憑證，後面取得權杖就會失敗（unauthorized: authentication required）。' },
    { id: 'v2-ping', from: 'ci-dockerd', to: 'registry', label: 'GET /v2/',
      headers: [reg('GET', '/v2/'), ...ciOut],
      note: 'dockerd 先問 Registry 的 API 根路徑：確認它說的是 /v2/ 開頭的 Registry API（OCI distribution 規格以它為基礎），並看它要求哪一種認證。docker login 時也會做同樣的檢查，所以 Token 打錯在登入時就會被拒絕。',
      tables: [tags(false)] },
    { id: 'v2-401', from: 'registry', to: 'ci-dockerd', label: '401：WWW-Authenticate: Bearer …',
      headers: [regResp('401', 'Unauthorized', [['WWW-Authenticate', `Bearer realm="https://${REG}/token",service="${REG}"`]]), ...ciIn],
      note: '401 不是錯誤，而是告訴 Client：「請到 realm 指的網址拿權杖再來」。這個 Registry 用權杖（Bearer token）認證；也有 Registry 要求每個請求直接帶 Basic 認證，概念相同：Registry 必須知道你是誰，才能決定你能不能讀寫哪個儲存庫。' },
    { id: 'token-req', from: 'ci-dockerd', to: 'registry', label: 'GET /token?…&scope=repository:team/api:pull,push',
      headers: [reg('GET', `/token?service=${REG}&scope=repository:team/api:pull,push`, [['Authorization', 'Basic <base64(ci:Token)>'], ['scope', 'repository:team/api:pull,push']]), ...ciOut],
      note: 'dockerd 以 config.json 裡的使用者與 Token（Basic 認證）要一張權杖，並在 scope 寫明要對哪個儲存庫做什麼：推送需要 pull 與 push。Token 只在這一步出現；之後的請求只帶短效的權杖。' },
    { id: 'token-resp', from: 'registry', to: 'ci-dockerd', label: '200：短效的 bearer token',
      headers: [regResp('200', 'OK', [['Content-Type', 'application/json']]), ...ciIn],
      payload: '{"token":"<短效的 bearer token>","expires_in":300}',
      note: 'Registry 檢查帳號的權限再決定權杖能做什麼：ci 可以推送 team/* 底下的儲存庫，所以拿到 pull 與 push；deploy 只能拉取，即使要求了 push，權杖也只有 pull，之後的上傳就被拒絕（denied: requested access to the resource is denied）。Token 錯誤則在這裡就是 401（unauthorized）。' },
    { id: 'blob-head', from: 'ci-dockerd', to: 'registry', label: 'HEAD /v2/team/api/blobs/sha256:<層的 digest>',
      headers: [reg('HEAD', '/v2/team/api/blobs/sha256:<最上面一層的 digest>', [['Authorization', 'Bearer <權杖>']]), ...ciOut],
      note: '上傳之前先問：這個儲存庫已經有這一層了嗎？層以內容的 digest 指名，所以只要問 digest 就知道是不是同一份內容，不必比對檔案。每一層都會這樣問一次（這裡只畫最上面那一層：COPY app.py 那一層）。' },
    { id: 'blob-missing', from: 'registry', to: 'ci-dockerd', label: '404：沒有這一層',
      headers: [regResp('404', 'Not Found'), ...ciIn],
      note: '404 表示 Registry 沒有，要上傳，終端機最後顯示 Pushed；如果是 200，表示已經有了，直接略過，顯示 Layer already exists（例如同一個 Image 推送第二個標籤）。同一個 Registry 的其他儲存庫有這一層時，dockerd 會改用掛載（POST /v2/team/worker/blobs/uploads/?mount=<digest>&from=team/api），Registry 直接引用、不必重傳，顯示 Mounted from team/api。' },
    { id: 'blob-upload', from: 'ci-dockerd', to: 'registry', label: 'POST 開始上傳 → PUT …?digest=sha256:…',
      headers: [reg('PUT', '/v2/team/api/blobs/uploads/<上傳 ID>?digest=sha256:<層的 digest>', [['Content-Type', 'application/octet-stream']]), ...ciOut],
      payload: '（壓縮的 tar：這一層的檔案變更）',
      note: '上傳分成幾步：POST /v2/team/api/blobs/uploads/ 取得一個上傳位置（202 Accepted 與 Location），內容可以分段送出，最後以 PUT 加上 ?digest= 宣告「這份內容的 digest 應該是這個」。這裡把它們畫成一則訊息。' },
    { id: 'blob-created', from: 'registry', to: 'ci-dockerd', label: '201 Created：層已收下',
      headers: [regResp('201', 'Created', [['Docker-Content-Digest', 'sha256:<層的 digest>']]), ...ciIn],
      note: 'Registry 自己計算收到的內容的 SHA-256，和宣告的 digest 不同就拒絕。所以內容在傳輸中被改動、或上傳到一半中斷，都不會變成一個「看起來正常」的層。' },
    { id: 'manifest-put', from: 'ci-dockerd', to: 'registry', label: 'PUT /v2/team/api/manifests/1.5.0',
      headers: [reg('PUT', '/v2/team/api/manifests/1.5.0', [['Content-Type', 'application/vnd.docker.distribution.manifest.v2+json'], ['Authorization', 'Bearer <權杖>']]), ...ciOut],
      payload: '{\n   "schemaVersion": 2,\n   "mediaType": "application/vnd.docker.distribution.manifest.v2+json",\n   "config": { "digest": "sha256:<Image ID>", … },\n   "layers": [ { "digest": "sha256:<第 1 層>", … }, …（共 6 層） ]\n}',
      note: '所有的層都在 Registry 上之後，最後才上傳 manifest：它列出 config（digest 就是本機的 Image ID）與每一層的 digest。路徑最後的 1.5.0 就是標籤：這一步同時說「1.5.0 指向這份 manifest」。如果有層還沒上傳，Registry 會拒絕這份 manifest，所以標籤不會指向不完整的 Image。' },
    { id: 'manifest-created', from: 'registry', to: 'ci-dockerd', label: '201 Created：1.5.0 → digest',
      headers: [regResp('201', 'Created', [['Docker-Content-Digest', D150]]), ...ciIn],
      note: `Registry 算出 manifest 的 SHA-256，也就是這個 Image 在 Registry 上的 digest，終端機印成 1.5.0: digest: ${D150} size: 1575。表中多了 1.5.0 這一列；latest 仍指向 1.5.0-rc.1：推送 1.5.0 不會移動 latest，標籤只會在有人推送那個標籤時移動。`,
      tables: [tags(true, [5])] },
    { id: 'latest-head', from: 'prod', to: 'registry', label: 'HEAD /v2/team/api/manifests/latest',
      headers: [reg('HEAD', '/v2/team/api/manifests/latest', [['Accept', 'application/vnd.docker.distribution.manifest.v2+json（與其他 manifest 類型）'], ['Authorization', 'Bearer <deploy 的權杖（只有 pull）>']]), ...prodOut],
      note: 'prod-03 兩週前拉過 latest。docker pull 以標籤拉取時，先問這個標籤現在指向哪一份 manifest（HEAD 只要標頭、不要內容），再和本機的比較。deploy 帳號的權杖只有 pull，拉取足夠了。',
      tables: [tags(true)] },
    { id: 'latest-resp', from: 'registry', to: 'prod', label: `200：Docker-Content-Digest ${short(DRC)}…`,
      headers: [regResp('200', 'OK', [['Docker-Content-Digest', DRC], ['Content-Type', 'application/vnd.docker.distribution.manifest.v2+json']]), ...prodIn],
      note: `latest 現在指向 1.5.0-rc.1，是昨天有人推上來的候選版，不是兩週前 prod-03 拉到的那一份（${short(DOLD)}…）。同一個名稱，在不同時間問，得到不同的內容：這就是 latest 的風險。如果這時重新拉取 latest 並重建容器，正式環境就會換成沒有核准的版本。` },
    { id: 'pull-digest', from: 'prod', to: 'registry', label: 'GET /v2/team/api/manifests/sha256:…（以 digest）',
      headers: [reg('GET', `/v2/team/api/manifests/${D140}`, [['Accept', 'application/vnd.docker.distribution.manifest.v2+json（與其他 manifest 類型）'], ['Authorization', 'Bearer <deploy 的權杖（只有 pull）>']]), ...prodOut],
      note: '部署核准的 1.4.0 時改用 digest：路徑最後不是標籤，而是 manifest 的 digest。Registry 只能回答這一份內容，或是 404（manifest unknown）；沒有任何人能讓同一個 digest 指向別的東西。' },
    { id: 'pull-digest-resp', from: 'registry', to: 'prod', label: '200：就是那一份 manifest',
      headers: [regResp('200', 'OK', [['Docker-Content-Digest', D140], ['Content-Type', 'application/vnd.docker.distribution.manifest.v2+json']]), ...prodIn],
      payload: '{ "schemaVersion": 2, "config": { "digest": "sha256:<Image ID>" }, "layers": [ … ] }',
      note: 'dockerd 計算收到的 manifest 的 SHA-256，必須等於它要求的 digest；接著依 manifest 下載本機還沒有的層（已有的顯示 Already exists）。於是 docker run …@sha256:… 在任何主機、任何時間啟動的都是同一份內容，回滾時也只要換回上一個 digest。' },
  ],
};

export const DKR11: LessonContent = {
  lessonId: 'DKR11',
  motivation: '前幾課的 Image 都留在自己的主機上。真正上線時，CI 主機建置出的 Image 要送到 Registry，正式環境的主機再從那裡拉取；這中間只靠一個名稱銜接，例如 registry.example.com:5000/team/api:1.5.0。名稱寫錯，Image 就送到 Docker Hub 被拒絕；帳號不對，推不上去；更麻煩的是名稱寫對了卻拿到不同的內容：latest 在兩週之間被人推了一個候選版，正式環境重新拉取之後就默默換了版本，而且沒有人說得出昨天跑的到底是哪一份。這一課在 CI 主機 ci-07 與正式環境主機 prod-03 上實際推送與拉取，看清楚標籤（tag）與 digest 的差別，理解 latest 為什麼危險、不可變標籤擋住了什麼，最後為 Image 訂出一套可以追溯到 commit 與 digest 的版本標籤規則。',
  sections: [
    {
      id: 'dkr11-s-names', title: 'Registry、儲存庫與標籤：一個 Image 可以有很多名字',
      blocks: [
        { type: 'p', text: 'Registry 是存放 Image 的伺服器：它以 HTTP API（路徑以 /v2/ 開頭，OCI distribution 規格就是以它為基礎）提供上傳與下載。Docker Hub 是 Docker 預設的公開 Registry；公司通常另外架設或租用私有 Registry，只讓自己的帳號存取。一個 Registry 裡有許多儲存庫（repository），每個儲存庫放同一個應用的各個版本，版本以標籤（tag）區分。Image 的名稱把這些寫在一起：' },
        { type: 'table', head: ['名稱的部分', '在 registry.example.com:5000/team/api:1.5.0 裡', '說明'], rows: [
          ['Registry 的位址', '`registry.example.com:5000`', '第一段有點（.）或冒號（連接埠），或是 localhost，才被當成 Registry；否則就是 Docker Hub（docker.io）'],
          ['儲存庫', '`team/api`', '命名空間 team 加上名稱 api；只能用小寫'],
          ['標籤', '`1.5.0`', '冒號之後；沒寫時是 latest。可用英文字母、數字、底線、點與連字號（不能以點或連字號開頭），最多 128 個字'],
        ] },
        { type: 'p', text: '`docker tag 來源 目標` 替本機的 Image 多加一個名稱，不複製任何東西：`docker images` 裡每個名稱一列，IMAGE ID 都一樣，因為它們是同一個 Image。推送到哪裡完全由名稱決定，所以要推到私有 Registry，名稱就必須以它的位址開頭；建置時也可以直接 `docker build -t` 給好幾個名稱。' },
        { type: 'example', id: 'dkr11-tag' },
        { type: 'callout', tone: 'note', title: '名稱的規則由 Docker 檢查', text: '儲存庫有大寫字母時，`docker tag` 直接拒絕：`invalid reference format: repository name (…) must be lowercase`。標籤不能有 `+`，所以 SemVer 的建置資訊（`1.5.0+3f2c1a7`）不能直接當標籤，後面訂規則時會處理這一點。' },
      ],
    },
    {
      id: 'dkr11-s-access', title: '私有 Registry 存取：docker login、Token 與權限',
      blocks: [
        { type: 'p', text: '私有 Registry 要先知道你是誰。`docker login 位址` 以使用者名稱與密碼（實務上多半是 Registry 發給 CI 或個人的存取 Token）登入；登入時 docker 會經由 daemon 連到 Registry 確認帳號，成功才印出 Login Succeeded。在 CI 與指令稿裡，Token 放在只有自己能讀的檔案（模式 0600）或 CI 的秘密變數裡，用標準輸入交給 docker：`cat ci-token.txt | docker login registry.example.com:5000 -u ci --password-stdin`。' },
        { type: 'p', text: '不要寫成 `docker login -u ci -p <Token>`：Docker 會先警告 `WARNING! Using --password via the CLI is insecure. Use --password-stdin.`，因為命令列參數會留在 Shell 的歷史紀錄裡，執行期間也可能被同一台主機上的其他使用者從行程列表（ps）看到。' },
        { type: 'p', text: '登入成功後，憑證存在 `~/.docker/config.json`：`auths` 底下每個 Registry 一筆，`auth` 欄位是「使用者:Token」的 base64。base64 只是編碼，不是加密，任何讀得到這個檔案的人都能還原出 Token，所以 docker 也會警告密碼「stored unencrypted」。實務上可以設定 credential helper，把憑證交給作業系統的金鑰儲存區；離開時 `docker logout 位址` 刪除那一筆。' },
        { type: 'table', head: ['情況', 'docker push 的結果', '原因'], rows: [
          ['沒有登入，或 Token 錯誤', '`unauthorized: authentication required`', 'Registry 不知道你是誰（Token 錯誤時 `docker login` 就會失敗：`unauthorized: incorrect username or password`）'],
          ['登入的帳號只能拉取（deploy）', '`denied: requested access to the resource is denied`', '知道你是誰，但你沒有推送的權限'],
          ['名稱沒有 Registry 的位址（`team/api:1.5.0`）', '`The push refers to repository [docker.io/team/api]`，接著 `denied: …`', '送到了 Docker Hub，你沒有那個儲存庫的權限；私有 Registry 的登入幫不上忙'],
          ['本機沒有這個名稱', '`An image does not exist locally with the tag: …`', '要先 `docker tag` 或以這個名稱建置'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：unauthorized 和 denied 是同一件事', text: 'unauthorized 是「沒有證明身分」：沒有登入、登入的是別的 Registry、或 Token 錯了，解法是正確地登入。denied 是「身分確認了，但不准」：帳號沒有這個儲存庫的推送權限，或名稱根本指向 Docker Hub。看到 denied 時反覆重新登入不會有用，要檢查名稱的第一段與帳號的權限。把推送與拉取分成兩個帳號（CI 用可以推送的 ci，正式環境只放只能拉取的 deploy），正式環境的主機即使被入侵，也無法改寫 Registry 上的 Image。' },
      ],
    },
    {
      id: 'dkr11-s-push', title: 'docker push 與 docker pull：層、manifest 與 digest',
      blocks: [
        { type: 'p', text: '`docker push` 先上傳 Image 的每一層，最後上傳 manifest（列出 config 與各層 digest 的 JSON），讓標籤指向它。終端機每層一行，最後一行是 `標籤: digest: sha256:… size: N`。每層的狀態說明 Registry 原本有沒有那一層：' },
        { type: 'table', head: ['推送時的狀態', '意思'], rows: [
          ['`Pushed`', 'Registry 沒有這一層，實際上傳了'],
          ['`Layer already exists`', '這個儲存庫已經有了（例如同一個 Image 推送第二個標籤），不必再傳'],
          ['`Mounted from team/api`', '同一個 Registry 的另一個儲存庫有這一層（例如同樣以 python:3.12-slim 為基底），Registry 直接引用'],
        ] },
        { type: 'p', text: '`docker pull` 是反方向：先依標籤或 digest 取得 manifest，再下載本機還沒有的層（`Pull complete`），已有的顯示 `Already exists`，最後印出 `Digest:` 與 `Status:`。下面的紀錄在 ci-07 上推送 1.5.0：先示範沒有登入的 unauthorized，登入後推送兩個標籤，再推送同一個基底的 team/worker。' },
        { type: 'example', id: 'dkr11-push' },
        { type: 'p', text: '把同一次推送攤開來看：docker CLI、ci-07 的 dockerd、私有 Registry 與正式環境 prod-03 之間的往返。右邊的表是 Registry 上 team/api 的標籤指向哪一個 digest。' },
        { type: 'example', id: 'dkr11-pipeline' },
        { type: 'callout', tone: 'note', title: '模擬環境的 Registry', text: '模擬的 Registry 只有課程宣告的帳號與 Image，沒有列出標籤或搜尋的功能（`docker search` 不支援）；Token 是課程資料，故意寫成明顯的假值。真實的 Registry 另有權杖的有效期、多平台的 image index、簽章與垃圾回收，這一課只在課文說明。' },
      ],
    },
    {
      id: 'dkr11-s-digest', title: 'tag 與 digest：會移動的名字與內容的指紋',
      blocks: [
        { type: 'p', text: 'digest 是 manifest 內容的 SHA-256。manifest 又以 digest 列出 config 與每一層，所以只要任何一層或任何設定改了一個位元組，manifest 就不同，digest 也不同；反過來，同一個 digest 永遠代表同一份內容。標籤則只是 Registry 裡的一個指標：「1.4.0 目前指向某個 digest」，有推送權限的人可以讓它改指別的。' },
        { type: 'table', head: ['', '標籤（tag）', 'digest'], rows: [
          ['寫法', '`team/api:1.4.0`', '`team/api@sha256:6fd6ac14…`（64 個十六進位字）'],
          ['是什麼', 'Registry 裡指向某個 manifest 的名字', 'manifest 內容的 SHA-256'],
          ['會不會變', '可以被重新推送而移動（除非 Registry 設定不可變標籤）', '不會；內容不同就是另一個 digest'],
          ['同一個 Image 有幾個', '可以很多（1.4.0、sha-8d1e6b2、latest…）', '在同一個 Registry 裡只有一個，不論掛了幾個標籤'],
          ['適合', '人看、找版本', '部署、回滾、稽核：精確指定內容'],
        ] },
        { type: 'p', text: '`docker images --digests` 多一欄 DIGEST，顯示本機的 Image 在 Registry 上的 digest（推送或拉取過才有，只在本機建置的是 `<none>`）。以 digest 拉取寫成 `名稱@sha256:…`，第一行變成 `sha256:…: Pulling from team/api`；只以 digest 拉取的 Image 在 `docker images` 裡 TAG 是 `<none>`，但它不是 dangling，`--digests` 看得到它。`docker run 名稱@sha256:…` 直接以 digest 建立容器，`docker ps` 的 IMAGE 欄也照你打的寫法顯示。' },
        { type: 'example', id: 'dkr11-digest' },
        { type: 'callout', tone: 'warning', title: '常見誤解：IMAGE ID 就是 digest', text: '`docker images` 的 IMAGE ID 是 Image 的 config 的雜湊，是本機看 Image 的身分；digest 是 Registry 上 manifest 的雜湊，`docker images --digests`、`docker pull` 與 `docker push` 印的是它。兩者都由內容決定，但不是同一個值，不能拿 IMAGE ID 去 `docker pull 名稱@sha256:…`。部署時要記錄的是 digest，而且要從推送或拉取的輸出、或 `docker images --digests` 讀出來，不要手抄。' },
      ],
    },
    {
      id: 'dkr11-s-latest', title: 'latest 的風險與不可變標籤',
      blocks: [
        { type: 'p', text: 'latest 只是「沒寫標籤時用的標籤」，Registry 不會替你維護它的意義：誰推送了 latest，它就指向誰的 Image。重新建置也是一樣，只要程式、基底或安裝的套件有任何不同，就是新的 Image、新的 digest，用同一個標籤推送就把舊的蓋掉。於是同一個名稱在不同時間拉取，可能得到完全不同的內容：' },
        { type: 'list', items: [
          '兩台主機在不同時間 `docker pull …:latest`，各自跑著不同的版本，出錯時無法重現。',
          '本機已有 latest 時，`docker run …:latest` 直接用舊的；有人重新拉取或主機換新，容器重建後就默默換了版本。',
          '昨天的 latest 是哪個版本？標籤已經移走了，沒有紀錄就無從回滾。',
          '拉取 latest 之後，本機舊的 Image 失去標籤，成為 `<none>`（dangling），還在執行的容器在 `docker ps` 的 IMAGE 欄只剩它的 ID。',
        ] },
        { type: 'example', id: 'dkr11-latest' },
        { type: 'p', text: '不可變標籤（immutable tags）是 Registry 的設定：一個標籤第一次推送之後，就不能再指向別的 digest。重新推送同樣的內容沒有問題；內容不同時，層照樣上傳，但 manifest 被拒絕（模擬環境依常見 Registry 的訊息：`tag invalid: The image tag \'1.5.0\' already exists … cannot be overwritten because the repository is immutable.`）。這樣一來 1.5.0 永遠是那一份，修正只能發布成 1.5.1；在這種 Registry 上，latest 也只能推送一次，等於逼團隊改用版本標籤。' },
        { type: 'example', id: 'dkr11-immutable' },
        { type: 'callout', tone: 'warning', title: '常見誤解：標籤寫了版本號就不會變', text: '`1.4.0` 看起來很確定，但在可變的 Registry 上，任何有推送權限的人都能重新建置後以同一個標籤推送，把它改指新的內容（例如「只是小修正」的熱修補）。要確定部署的內容，只有兩個方法：以 digest 指定，或使用設定為不可變標籤的 Registry（兩者一起用最好）。' },
      ],
    },
    {
      id: 'dkr11-s-rule', title: '可追溯的版本標籤規則',
      blocks: [
        { type: 'p', text: '標籤的目的是讓人與工具都能回答兩個問題：這個 Image 是從哪一個 commit 建置的？正式環境現在跑的到底是哪一份內容？一套常見而且可追溯的規則：' },
        { type: 'table', head: ['標籤', '例子', '何時推送', '可以移動嗎', '可以拿來部署嗎'], rows: [
          ['commit 標籤', '`sha-3f2c1a7`', '每一次建置', '不應該（重跑同一個 commit 的建置也不覆寫）', '可以，最好再以 digest 鎖定'],
          ['SemVer 版本', '`1.5.0`', '正式發布', '不行，修正就發布 `1.5.1`', '可以，最好再以 digest 鎖定'],
          ['預發布版本', '`1.5.0-rc.1`', '候選版', '不行', '只在測試環境'],
          ['方便用的移動標籤', '`1.5`、`latest`', '可以不推送', '會移動', '不行'],
        ] },
        { type: 'list', ordered: true, items: [
          'CI 每次建置都以 commit 的短雜湊加上標籤（`sha-3f2c1a7`），正式發布再加上 SemVer 版本（`1.5.0`）；兩個標籤指向同一個 digest。SemVer 的 `+建置資訊` 不能放進 Docker 標籤，所以 commit 寫成另一個標籤。',
          '版本標籤發布後不再重用：放在設定為不可變標籤的 Registry，修正一律發布新的版本號。',
          'CI 把 `docker push` 最後一行的 digest 記進發布紀錄（版本、commit、digest 三者對應）。',
          '部署設定寫 `名稱@sha256:…`（或至少是不可變的版本標籤），永遠不部署 latest；回滾就是換回上一個 digest。',
          '推送與拉取用不同的帳號與 Token，以 `--password-stdin` 從秘密檔案或 CI 的秘密變數讀入。',
        ] },
        { type: 'callout', tone: 'tip', title: '標籤給人看，digest 給機器用', text: '在介面上顯示 `1.5.0 (sha-3f2c1a7)` 讓人好懂，但寫進部署設定的是 digest。這樣即使有人違反規則重新推送了 1.5.0，已經部署的服務也不會跟著變，而發布紀錄仍能從 digest 找回版本與 commit。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [pipeline],
    exercises: [
      { id: 'dkr11-net-scope', task: 'field', scene: 'dkr11-pipeline', message: 'token-req', layer: 'application', field: 'scope', title: '推送要求的權限',
        statement: '在「build → tag → push → pull」情境中，ci-07 的 dockerd 向 Registry 要權杖時，應用層標頭的「scope」是什麼？',
        hints: ['這張權杖是為了推送 team/api 而要的：推送需要哪些動作？', 'scope 的格式是 repository:<儲存庫>:<動作，以逗號分隔>。'],
        explanation: '推送要先確認哪些層已經存在（讀）再上傳（寫），所以 dockerd 要求 repository:team/api:pull,push。Registry 依帳號的權限決定權杖實際能做什麼：ci 可以推送 team/*，deploy 只會拿到 pull，之後的上傳就是 denied。',
        mistakes: [
          { answer: { value: 'repository:team/api:pull' }, why: '只有 pull 的權杖不能上傳層與 manifest；那是拉取（或只能拉取的 deploy 帳號）才會得到的範圍。' },
          { answer: { value: 'repository:registry.example.com:5000/team/api:pull,push' }, why: 'scope 裡寫的是 Registry 內的儲存庫路徑 team/api，不含 Registry 的位址；位址已經在 Host 與 service 裡了。' },
        ] },
      { id: 'dkr11-net-blob', task: 'field', scene: 'dkr11-pipeline', message: 'blob-missing', layer: 'application', field: '狀態碼', title: '這一層需要上傳嗎',
        statement: '同一個情境裡，dockerd 以 HEAD 詢問最上面那一層之後，Registry 回應的狀態碼是什麼？',
        hints: ['這一層是 COPY app.py 產生的，1.5.0 的程式是新的。', '已經有的層，終端機顯示 Layer already exists；要上傳的顯示 Pushed。'],
        explanation: '1.5.0 的 app.py 是新的內容，Registry 沒有這一層，所以 HEAD 得到 404 Not Found，dockerd 接著上傳，終端機顯示 Pushed。200 表示已經存在（Layer already exists），401 是還沒有權杖時的回應，在這之前已經處理過了。',
        mistakes: [
          { answer: { value: '200' }, why: '200 表示 Registry 已經有這一層，dockerd 就不會上傳，終端機會顯示 Layer already exists；情境接著上傳了，所以不是 200。' },
          { answer: { value: '401' }, why: '401 是沒有帶權杖時 GET /v2/ 得到的挑戰；dockerd 取得權杖之後才開始詢問各層。' },
        ] },
      { id: 'dkr11-net-latest', task: 'table', scene: 'dkr11-pipeline', message: 'manifest-created', node: 'registry', table: 'team/api 的標籤', row: 'latest', column: '內容', title: '推送 1.5.0 之後的 latest',
        statement: '同一個情境裡，Registry 收下 1.5.0 的 manifest（201 Created）之後，它的「team/api 的標籤」表中 latest 的「內容」是什麼？',
        hints: ['這次推送的路徑是 /v2/team/api/manifests/1.5.0：它改了哪一個標籤？', '標籤只在有人以那個標籤推送時才移動。'],
        explanation: 'PUT 的路徑只寫了 1.5.0，所以只有 1.5.0 指向新的 digest；latest 仍指向昨天有人推上來的 1.5.0-rc.1。「latest 就是最新版」只是期待，Registry 不會自動維護；正式環境若依賴 latest，就會拿到這個候選版。',
        mistakes: [
          { answer: { cell: '1.5.0' }, why: 'Registry 不會因為推送了新的版本就移動 latest；只有推送 latest 這個標籤時它才會改指。' },
          { answer: { cell: '1.4.0' }, why: '1.4.0 是目前核准的版本，但 latest 不是由核准決定的，而是由最後一次推送 latest 的人決定：它指向 1.5.0-rc.1。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'dkr11-q1', prompt: '在已經 `docker login registry.example.com:5000` 的主機上執行 `docker push team/api:1.5.0`，會發生什麼事？',
      options: ['推送到 registry.example.com:5000/team/api，因為已經登入', '自動推送到最近一次執行 `docker login` 登入的那個 Registry', '推送到 Docker Hub 的 docker.io/team/api，結果被拒絕（denied）', '失敗：`An image does not exist locally`，因為本機的名稱少了 Registry 位址'],
      answer: 2,
      explanation: '推送到哪裡只由名稱決定：team/api 的第一段沒有點、冒號，也不是 localhost，所以是 Docker Hub 的 docker.io/team/api，你沒有那個儲存庫的權限而被拒絕。登入的 Registry 不會被當成預設；docker 也沒有「最近登入」的概念；本機有 team/api:1.5.0 這個名稱，所以不是找不到 Image 的錯誤。',
    },
    {
      id: 'dkr11-q2', prompt: '`~/.docker/config.json` 裡 `"auth": "Y2k6bGVzc29u…"` 這個欄位應該怎麼看待？',
      options: ['「使用者:Token」的 base64，讀得到檔案就能還原 Token', '它是以本機金鑰加密過的 Token，沒有那把金鑰就無法還原', '它是 Registry 發的短效權杖，幾分鐘後就會自動失效，所以不必保護', '它只是使用者名稱的雜湊值，裡面完全不含 Token 本身'],
      answer: 0,
      explanation: 'docker login 把「使用者:Token」以 base64 存進 config.json，所以登入時警告 stored unencrypted；base64 任何人都能解回原文。它不是加密，也不是 Registry 的短效權杖（那是推送時 dockerd 臨時取得的），而且它包含 Token 本身，不只是使用者名稱。',
    },
    {
      id: 'dkr11-q3', prompt: '在 CI 裡為什麼要用 `cat ci-token.txt | docker login … -u ci --password-stdin`，而不是 `docker login … -u ci -p <Token>`？',
      options: ['因為 `-p` 只接受 Docker Hub 的密碼，不能登入私有 Registry', '因為 `--password-stdin` 會把 Token 加密後再存進 config.json', '因為用 `-p` 登入取得的權限比較小，只能拉取、不能推送', '命令列參數會留在 Shell 歷史與行程列表，標準輸入不會'],
      answer: 3,
      explanation: '兩種寫法登入的結果相同，差別只在 Token 經過哪裡：`-p` 把它放在命令列上，會留在歷史紀錄與行程列表，Docker 因此印出 Using --password via the CLI is insecure 的警告。`-p` 也能登入私有 Registry；`--password-stdin` 不會加密 config.json（一樣是 base64）；權限由帳號決定，與登入的方式無關。',
    },
    {
      id: 'dkr11-q4', prompt: '把同一個 Image 以第二個標籤 `sha-3f2c1a7` 推送到同一個儲存庫時，每一層都顯示 `Layer already exists`。這代表什麼？',
      options: ['推送失敗了，要加上 `--force` 把每一層強制重新上傳一次', '這些層 Registry 已經有了，新標籤指向同一個 manifest', 'Registry 把這些層各自複製了一份，專門給新的標籤使用', '第二個標籤其實指向了另一個 digest，只是每一層的內容剛好相同'],
      answer: 1,
      explanation: '層以內容的 digest 指名，HEAD 詢問得到 200 就略過，所以同一個 Image 的第二個標籤幾乎不花上傳時間，最後一行印出相同的 digest。這不是失敗，docker push 也沒有 `--force`；Registry 不會複製層，而是讓兩個標籤指向同一份 manifest。',
    },
    {
      id: 'dkr11-q5', prompt: '關於 tag 與 digest，哪一個說法正確？',
      options: ['digest 由 Registry 隨機產生，每次推送都不同', '同一個 Image 只能有一個標籤，加第二個會取代第一個', '標籤可以重新指向；digest 是 manifest 內容的 SHA-256', '`docker images` 顯示的 IMAGE ID 就是推送時印出的 digest'],
      answer: 2,
      explanation: 'digest 由內容算出：相同內容重新推送得到相同的 digest，內容改了才不同，所以不是隨機的。一個 Image 可以有很多標籤（1.4.0、sha-8d1e6b2、latest）。IMAGE ID 是 config 的雜湊，不是 manifest 的 digest，兩者是不同的值。',
    },
    {
      id: 'dkr11-q6', prompt: 'prod-03 兩週前拉取了 `team/api:latest` 並執行；今天再 `docker pull …:latest`，輸出是 `Status: Downloaded newer image`。之後最可能看到什麼？',
      options: ['latest 改指新 Image，舊的成為 `<none>`，容器照舊', '執行中的容器自動以新的 Image 重建，換成新版本繼續執行', '舊的 Image 被自動刪除，用它執行的容器也跟著停止', '因為標籤的名稱相同，本機的 Image 與執行中的容器都沒有任何改變'],
      answer: 0,
      explanation: '拉取只移動本機的標籤：latest 改指新的 Image，舊的失去最後一個標籤成為 dangling，但容器仍由舊的 Image 執行，所以 IMAGE 欄只能顯示 ID。容器不會自動更新，要重建才會用到新的；舊 Image 被容器使用，不會被刪除；Downloaded newer image 正表示 Registry 上的 latest 已經是不同的內容。',
    },
    {
      id: 'dkr11-q7', prompt: 'releases.example.com 設定為不可變標籤。修正了一個錯誤後重新建置並推送 `releases.example.com/team/api:1.5.0`，得到 `tag invalid: … cannot be overwritten because the repository is immutable.`。正確的做法是什麼？',
      options: ['先把 Registry 上的 1.5.0 刪掉再推送', '改推送 latest，讓正式環境拉最新的版本', '加上 `docker push --force`', '發布新的版本號（例如 1.5.1），以新的標籤推送'],
      answer: 3,
      explanation: '不可變標籤的目的就是讓 1.5.0 永遠代表同一份內容，修正後的 Image 有新的 digest，應該發布成 1.5.1。刪除重推等於繞過保護，已經部署 1.5.0 的人會拿到不同的東西；改推 latest 讓版本更不清楚，而且在不可變的 Registry 上 latest 也不能改指；docker push 沒有可以覆寫的 --force。',
    },
    {
      id: 'dkr11-q8', prompt: '正式環境的主機用 deploy 帳號登入後執行 `docker push`，得到 `denied: requested access to the resource is denied`。最合理的解釋是什麼？',
      options: ['Token 打錯了，用正確的 Token 重新執行 `docker login` 就好', 'deploy 帳號只能拉取：身分已確認，但不准推送', 'Registry 當機了，暫時無法接受任何推送', '要先 `docker logout` 清掉舊的憑證才能推送'],
      answer: 1,
      explanation: 'denied 表示身分已經確認，但沒有這個動作的權限；這正是把推送（ci）與拉取（deploy）分成兩個帳號的目的。Token 錯誤在登入時就會失敗，推送時是 unauthorized；Registry 當機不會回 denied；logout 只會刪除憑證，讓推送變成 unauthorized。',
    },
  ],
  terminal: {
    machines: [ciMachine, prodMachine],
    examples: [
      {
        id: 'dkr11-tag', title: '一個 Image，三個名字', machine: 'dkr11-ci',
        description: 'ci-07 上以 `docker build -q` 建置 ~/api（只印出 Image ID），再用 `docker tag` 加上兩個以私有 Registry 位址開頭的名稱：版本 1.5.0 與 commit 標籤 sha-3f2c1a7。`docker images` 裡三列的 IMAGE ID 相同：沒有複製任何東西，只是多了名字。儲存庫有大寫時，docker tag 直接拒絕。',
        steps: [
          { command: 'docker build -q -t team/api:1.5.0 api', output: 'sha256:a3d0f28145da099af9a48c0a2765c9f45412f1d0771df2f10fb2a21500f5d5ff' },
          { command: `docker tag team/api:1.5.0 ${API}:1.5.0`, output: '' },
          { command: `docker tag team/api:1.5.0 ${API}:sha-3f2c1a7`, output: '' },
          { command: 'docker images', output: 'REPOSITORY                           TAG           IMAGE ID       CREATED                  SIZE\nregistry.example.com:5000/team/api   1.5.0         a3d0f28145da   Less than a second ago   124MB\nregistry.example.com:5000/team/api   sha-3f2c1a7   a3d0f28145da   Less than a second ago   124MB\nteam/api                             1.5.0         a3d0f28145da   Less than a second ago   124MB\npython                               3.12-slim     73b5000328a4   12 days ago              124MB' },
          { command: 'docker tag team/api:1.5.0 Team/api:1.5.0', output: 'Error parsing reference: "Team/api:1.5.0" is not a valid repository/tag: invalid reference format: repository name (Team/api) must be lowercase' },
        ],
      },
      {
        id: 'dkr11-push', title: '登入、推送與每一層的狀態', machine: 'dkr11-ci',
        description: '直接以 Registry 的名稱建置。沒有登入就推送，各層停在 Preparing，最後是 unauthorized。以 `--password-stdin` 從 0600 的 Token 檔登入（警告訊息在標準錯誤），config.json 裡的 auth 是 base64。推送 1.5.0 時每一層都是 Pushed，最後一行是 digest；同一個 Image 的 sha-3f2c1a7 每一層都已存在，digest 相同。team/worker 用同一個基底與同樣的 WORKDIR，這些相同的層從 team/api 掛載（Mounted from），只有它自己的程式那一層是 Pushed。`docker images --digests` 顯示兩個標籤同一個 digest。',
        steps: [
          { command: `docker build -q -t ${API}:1.5.0 -t ${API}:sha-3f2c1a7 api`, output: 'sha256:a3d0f28145da099af9a48c0a2765c9f45412f1d0771df2f10fb2a21500f5d5ff' },
          { command: `docker push ${API}:1.5.0`, output: 'The push refers to repository [registry.example.com:5000/team/api]\n50fc7d90fae1: Preparing\n5315e087f7ee: Preparing\n6bbe1dd2fe77: Preparing\nf0f786fa4ecc: Preparing\n0fbe4d513e68: Preparing\n2cfb56ba6b71: Preparing\nunauthorized: authentication required' },
          { command: 'ls -l ci-token.txt', output: '-rw------- learner learner    21 ci-token.txt' },
          { command: `cat ci-token.txt | docker login ${REG} -u ci --password-stdin`, output: 'WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded' },
          { command: 'cat .docker/config.json', output: '{\n	"auths": {\n		"registry.example.com:5000": {\n			"auth": "Y2k6bGVzc29uLXRva2VuLWNpLTAwMDE="\n		}\n	}\n}' },
          { command: `docker push ${API}:1.5.0`, output: 'The push refers to repository [registry.example.com:5000/team/api]\n50fc7d90fae1: Pushed\n5315e087f7ee: Pushed\n6bbe1dd2fe77: Pushed\nf0f786fa4ecc: Pushed\n0fbe4d513e68: Pushed\n2cfb56ba6b71: Pushed\n1.5.0: digest: sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead size: 1575' },
          { command: `docker push ${API}:sha-3f2c1a7`, output: 'The push refers to repository [registry.example.com:5000/team/api]\n50fc7d90fae1: Layer already exists\n5315e087f7ee: Layer already exists\n6bbe1dd2fe77: Layer already exists\nf0f786fa4ecc: Layer already exists\n0fbe4d513e68: Layer already exists\n2cfb56ba6b71: Layer already exists\nsha-3f2c1a7: digest: sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead size: 1575' },
          { command: `docker build -q -t ${REG}/team/worker:0.9.0 worker`, output: 'sha256:77a4159c41b8e1e3c7c3bfd107e3f616290dbe7fa7f0c8de8cc846ecfe9d6d3b' },
          { command: `docker push ${REG}/team/worker:0.9.0`, output: 'The push refers to repository [registry.example.com:5000/team/worker]\nbe647f439741: Pushed\n5315e087f7ee: Mounted from team/api\n6bbe1dd2fe77: Mounted from team/api\nf0f786fa4ecc: Mounted from team/api\n0fbe4d513e68: Mounted from team/api\n2cfb56ba6b71: Mounted from team/api\n0.9.0: digest: sha256:d12bff0e9b05a5dd77d33689cc4ae75c9dc9da1b75603ed053bf2cc9aa8ed95b size: 1575' },
          { command: `docker images --digests ${API}`, output: 'REPOSITORY                           TAG           DIGEST                                                                    IMAGE ID       CREATED                  SIZE\nregistry.example.com:5000/team/api   1.5.0         sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead   a3d0f28145da   Less than a second ago   124MB\nregistry.example.com:5000/team/api   sha-3f2c1a7   sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead   a3d0f28145da   Less than a second ago   124MB' },
        ],
      },
      {
        id: 'dkr11-digest', title: '標籤、commit 標籤與 digest 是同一份內容', machine: 'dkr11-prod',
        description: 'prod-03 以只能拉取的 deploy 帳號登入。1.4.0 與它的 commit 標籤 sha-8d1e6b2 指向同一個 digest：第二次拉取每一層都已存在，`docker images --digests` 兩列的 DIGEST 與 IMAGE ID 相同。以 digest 拉取時本機已有，所以 up to date。最後以 digest 啟動一個測試用的容器 api-canary（8081 埠），`docker ps` 的 IMAGE 欄就是打的 digest 寫法。',
        steps: [
          { command: `cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, output: 'WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded' },
          { command: `docker pull ${API}:1.4.0`, output: '1.4.0: Pulling from team/api\n0aef35ab42d2: Pull complete\n5d2ef823bc25: Pull complete\nabb9b868ffe2: Pull complete\nc84e82953280: Pull complete\nb0f6cd7eb8a6: Pull complete\n8964f52b67f0: Pull complete\nDigest: sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8\nStatus: Downloaded newer image for registry.example.com:5000/team/api:1.4.0\nregistry.example.com:5000/team/api:1.4.0' },
          { command: `docker pull ${API}:sha-8d1e6b2`, output: 'sha-8d1e6b2: Pulling from team/api\n0aef35ab42d2: Already exists\n5d2ef823bc25: Already exists\nabb9b868ffe2: Already exists\nc84e82953280: Already exists\nb0f6cd7eb8a6: Already exists\n8964f52b67f0: Already exists\nDigest: sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8\nStatus: Downloaded newer image for registry.example.com:5000/team/api:sha-8d1e6b2\nregistry.example.com:5000/team/api:sha-8d1e6b2' },
          { command: `docker images --digests ${API}`, output: 'REPOSITORY                           TAG           DIGEST                                                                    IMAGE ID       CREATED       SIZE\nregistry.example.com:5000/team/api   1.4.0         sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8   c51afcbc5533   8 days ago    131MB\nregistry.example.com:5000/team/api   sha-8d1e6b2   sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8   c51afcbc5533   8 days ago    131MB\nregistry.example.com:5000/team/api   latest        sha256:c845e3830fbbf3d5fab6b25ba86607b23dd1e9c50657696c03a201f392cc21d4   e67fc12f7c76   2 weeks ago   131MB' },
          { command: `docker pull ${API}@${D140}`, output: 'sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8: Pulling from team/api\nDigest: sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8\nStatus: Image is up to date for registry.example.com:5000/team/api@sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8\nregistry.example.com:5000/team/api@sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8' },
          { command: `docker run -d --name api-canary -p 8081:8000 ${API}@${D140}`, output: '06d3ac3c18d6eecaa76a29821eae4b830cb334d8ba1bf289f18289bbec7901d1' },
          { command: "docker ps --format '{{.Names}} {{.Image}}'", output: 'api-canary registry.example.com:5000/team/api@sha256:6fd6ac143bb6735f3ff1e31f22d0421424304e24ff53970917c45f9397c9bcb8\napi registry.example.com:5000/team/api:latest' },
          { command: 'curl -s localhost:8081/', output: 'team/api 1.4.0' },
        ],
      },
      {
        id: 'dkr11-latest', title: '重新拉取 latest：標籤移走了', machine: 'dkr11-prod',
        description: 'prod-03 的 api 容器以兩週前拉下的 latest 執行（回應 team/api 1.3.0）。登入後再拉取 latest：Registry 上的 latest 已經指向昨天推上來的 1.5.0-rc.1，於是下載了新的 Image（不同的 digest）。本機的 latest 改指新的，舊的成為 `<none>`；執行中的容器沒有改變，`docker ps` 的 IMAGE 欄只剩舊 Image 的 ID。下一次有人以 latest 重建容器，正式環境就會換成沒有核准的候選版。',
        steps: [
          { command: 'docker ps', output: 'CONTAINER ID   IMAGE                                       COMMAND           CREATED       STATUS       PORTS                                         NAMES\nc4186fea585d   registry.example.com:5000/team/api:latest   "python app.py"   13 days ago   Up 13 days   0.0.0.0:8080->8000/tcp, [::]:8080->8000/tcp   api' },
          { command: 'docker images --digests', output: 'REPOSITORY                           TAG       DIGEST                                                                    IMAGE ID       CREATED       SIZE\nregistry.example.com:5000/team/api   latest    sha256:c845e3830fbbf3d5fab6b25ba86607b23dd1e9c50657696c03a201f392cc21d4   e67fc12f7c76   2 weeks ago   131MB\nalpine                               3.21      sha256:795053282f9683237df3941280bfcf2e2cb4a10ce0737fc614ba80c7be6585ec   62550e7b9f25   6 weeks ago   7.83MB' },
          { command: `cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, output: 'WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded' },
          { command: `docker pull ${API}:latest`, output: 'latest: Pulling from team/api\nc5e036d9856a: Pull complete\n14bf46cfffea: Pull complete\n85fa8f2de2aa: Pull complete\nabd5a30bd7a5: Pull complete\nd97e332016ce: Pull complete\n470e8c48303c: Pull complete\nDigest: sha256:ae29e04e3d56ef58ccad3ac46e92276bd80dad90874e69ad3f540718d1b8330f\nStatus: Downloaded newer image for registry.example.com:5000/team/api:latest\nregistry.example.com:5000/team/api:latest' },
          { command: 'docker images', output: 'REPOSITORY                           TAG       IMAGE ID       CREATED        SIZE\nregistry.example.com:5000/team/api   latest    e874115b2ec1   18 hours ago   131MB\n<none>                               <none>    e67fc12f7c76   2 weeks ago    131MB\nalpine                               3.21      62550e7b9f25   6 weeks ago    7.83MB' },
          { command: 'docker ps', output: 'CONTAINER ID   IMAGE          COMMAND           CREATED       STATUS       PORTS                                         NAMES\nc4186fea585d   e67fc12f7c76   "python app.py"   13 days ago   Up 13 days   0.0.0.0:8080->8000/tcp, [::]:8080->8000/tcp   api' },
          { command: 'curl -s localhost:8080/', output: 'team/api 1.3.0' },
        ],
      },
      {
        id: 'dkr11-immutable', title: '不可變標籤擋下覆寫', machine: 'dkr11-ci',
        description: 'releases.example.com 的標籤不可變。推送 1.5.0 成功之後，改了 app.py 重新建置成同一個名稱：內容不同，所以是新的 Image ID，舊的成為 `<none>`。再推送時，改變的那一層照樣上傳，其他各層已經存在，但 Registry 拒絕讓 1.5.0 改指新的 manifest。',
        steps: [
          { command: `cat release-token.txt | docker login ${RELEASES} -u ci --password-stdin`, output: 'WARNING! Your password will be stored unencrypted in /home/learner/.docker/config.json.\nConfigure a credential helper to remove this warning. See\nhttps://docs.docker.com/go/credential-store/\n\nLogin Succeeded' },
          { command: `docker build -q -t ${RELEASES}/team/api:1.5.0 api`, output: 'sha256:a3d0f28145da099af9a48c0a2765c9f45412f1d0771df2f10fb2a21500f5d5ff' },
          { command: `docker push ${RELEASES}/team/api:1.5.0`, output: 'The push refers to repository [releases.example.com/team/api]\n50fc7d90fae1: Pushed\n5315e087f7ee: Pushed\n6bbe1dd2fe77: Pushed\nf0f786fa4ecc: Pushed\n0fbe4d513e68: Pushed\n2cfb56ba6b71: Pushed\n1.5.0: digest: sha256:8331d6fd7ce8b6ebccb21668acc7099bfda13a6e422ecf5055e0272cd50d3ead size: 1575' },
          { command: 'echo \'print("hotfix")\' >> api/app.py', output: '' },
          { command: `docker build -q -t ${RELEASES}/team/api:1.5.0 api`, output: 'sha256:951545eb62db1805128a7fa64dc32203934bc0145a7c87ece9e23f6170e22a49' },
          { command: `docker push ${RELEASES}/team/api:1.5.0`, output: 'The push refers to repository [releases.example.com/team/api]\n1f30fb74bdcc: Pushed\n5315e087f7ee: Layer already exists\n6bbe1dd2fe77: Layer already exists\nf0f786fa4ecc: Layer already exists\n0fbe4d513e68: Layer already exists\n2cfb56ba6b71: Layer already exists\ntag invalid: The image tag \'1.5.0\' already exists in the \'team/api\' repository and cannot be overwritten because the repository is immutable.' },
          { command: 'docker images', output: 'REPOSITORY                      TAG         IMAGE ID       CREATED                  SIZE\n<none>                          <none>      a3d0f28145da   Less than a second ago   124MB\nreleases.example.com/team/api   1.5.0       951545eb62db   Less than a second ago   124MB\npython                          3.12-slim   73b5000328a4   12 days ago              124MB' },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr11-x-push', title: '以版本與 commit 標籤推送到私有 Registry', machine: 'dkr11-ci',
        statement: `ci-07 的 ~/api 是 team/api 的 1.5.0 版，commit 是 3f2c1a7。請建置它，並以兩個標籤 \`1.5.0\` 與 \`sha-3f2c1a7\` 推送到私有 Registry ${REG} 的 team/api 儲存庫，兩個標籤都要指向你剛建置的 Image。使用有推送權限的帳號 ci（Token 在 ~/ci-token.txt，請用 \`--password-stdin\`）。不要推送 latest：它目前指向 1.5.0-rc.1，不能被改動。`,
        checks: [
          { kind: 'registry', registry: REG, repository: 'team/api', tag: '1.5.0', image: `${API}:1.5.0` },
          { kind: 'registry', registry: REG, repository: 'team/api', tag: 'sha-3f2c1a7', image: `${API}:1.5.0` },
          { kind: 'registry', registry: REG, repository: 'team/api', tag: 'latest', digest: DRC },
        ],
        solution: [
          'docker build -q -t team/api:1.5.0 api',
          `docker tag team/api:1.5.0 ${API}:1.5.0`,
          `docker tag team/api:1.5.0 ${API}:sha-3f2c1a7`,
          `cat ci-token.txt | docker login ${REG} -u ci --password-stdin`,
          `docker push ${API}:1.5.0`,
          `docker push ${API}:sha-3f2c1a7`,
        ],
        mistakes: [
          { commands: ['docker build -q -t team/api:1.5.0 api', `cat ci-token.txt | docker login ${REG} -u ci --password-stdin`, 'docker push team/api:1.5.0'],
            why: '名稱沒有 Registry 的位址，推送的是 Docker Hub 的 docker.io/team/api，被拒絕（denied）；私有 Registry 上什麼都沒有。要先 `docker tag` 成 registry.example.com:5000/team/api:1.5.0。' },
          { commands: [`docker build -q -t ${API}:1.5.0 -t ${API}:sha-3f2c1a7 api`, `docker push ${API}:1.5.0`, `docker push ${API}:sha-3f2c1a7`],
            why: '沒有登入：Registry 不知道你是誰，兩次推送都是 unauthorized: authentication required。' },
          { commands: [`docker build -q -t ${API}:1.5.0 -t ${API}:sha-3f2c1a7 api`, `cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, `docker push ${API}:1.5.0`, `docker push ${API}:sha-3f2c1a7`],
            why: 'deploy 是只能拉取的帳號：登入成功，但推送是 denied。推送要用 ci。' },
          { commands: [`docker build -q -t ${API}:1.5.0 api`, `cat ci-token.txt | docker login ${REG} -u ci --password-stdin`, `docker push ${API}:1.5.0`],
            why: '只推送了 1.5.0，少了 commit 標籤 sha-3f2c1a7，之後無法從標籤追溯到 commit。' },
          { commands: [`docker build -q -t ${API}:1.5.0 -t ${API}:sha-3f2c1a7 -t ${API}:latest api`, `cat ci-token.txt | docker login ${REG} -u ci --password-stdin`, `docker push ${API}:1.5.0`, `docker push ${API}:sha-3f2c1a7`, `docker push ${API}:latest`],
            why: '多推送了 latest：它從 1.5.0-rc.1 改指 1.5.0，所有依賴 latest 的地方都會在下次拉取時默默換版本。題目要求不要動它。' },
        ],
        hints: [
          '推送到哪裡由名稱決定：名稱要以 registry.example.com:5000/ 開頭（`docker tag` 或 `docker build -t` 都可以給名稱）。',
          '`cat ci-token.txt | docker login 位址 -u ci --password-stdin`；每個標籤各推送一次。',
        ],
        explanation: '`docker build -q -t team/api:1.5.0 api` 建置出 Image，`docker tag` 給它兩個以 Registry 位址開頭的名稱（同一個 IMAGE ID），`--password-stdin` 以 ci 的 Token 登入，再分別推送：第一次每層 Pushed，第二次每層 Layer already exists，兩次印出同一個 digest。名稱沒有位址會送到 Docker Hub 被拒絕；沒有登入是 unauthorized；deploy 帳號可以登入但推送被 denied。版本標籤給人看，commit 標籤讓 Image 能追溯到原始碼，而 latest 交給明確的發布流程，不在每次建置時順手改動。',
      },
      {
        id: 'dkr11-x-pin', title: '把正式環境鎖定在核准版本的 digest', machine: 'dkr11-prod',
        statement: `prod-03 的 api 容器（發布 8080:8000）跑的是兩週前拉下的 latest，而 Registry 上的 latest 已經被改指到沒有核准的候選版。團隊核准上線的是 1.4.0。請以只能拉取的 deploy 帳號（Token 在 ~/deploy-token.txt）查出 ${REG}/team/api 的 1.4.0 現在對應的 digest，把 api 換成以這個 digest（\`名稱@sha256:…\`）建立的容器：名稱仍是 api，發布 8080:8000。最後執行 \`docker ps --format '{{.Names}} {{.Image}}'\` 確認。`,
        checks: [
          { kind: 'container', name: 'api', state: 'running', port: '8080:8000' },
          { kind: 'http', url: 'http://localhost:8080/', status: 200, body: 'team/api 1.4.0' },
          { kind: 'image', name: `${API}@${D140}` },
          { kind: 'output', fromCommand: '^docker (ps|container ls)\\b' },
        ],
        solution: [
          `cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`,
          `docker pull ${API}:1.4.0`,
          'docker rm -f api',
          `docker run -d --name api -p 8080:8000 ${API}@${D140}`,
          "docker ps --format '{{.Names}} {{.Image}}'",
        ],
        variants: [BUSY_PROD],
        mistakes: [
          { commands: [`cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, `docker pull ${API}:1.4.0`, 'docker rm -f api', `docker run -d --name api -p 8080:8000 ${API}:1.4.0`, "docker ps --format '{{.Names}} {{.Image}}'"],
            why: '內容雖然是 1.4.0，但容器是以標籤建立的：只要有人重新推送 1.4.0，下次重建就會拿到別的東西。題目要以 digest 鎖定，`docker ps` 的 IMAGE 應該是 `…@sha256:…`。' },
          { commands: [`cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, `docker pull ${API}:latest`, 'docker rm -f api', `docker run -d --name api -p 8080:8000 ${API}:latest`, "docker ps --format '{{.Names}} {{.Image}}'"],
            why: '重新拉取 latest 得到的是 1.5.0-rc.1，正式環境就換成了沒有核准的候選版（回應 team/api 1.5.0-rc.1）。' },
          { commands: [`cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, 'docker rm -f api', `docker run -d --name api -p 8080:8000 ${API}@${DOLD}`, "docker ps --format '{{.Names}} {{.Image}}'"],
            why: '鎖定的是 `docker images --digests` 裡目前那個 latest 的 digest：以 digest 執行沒錯，但那是兩週前的 1.3.0，不是核准的 1.4.0。digest 要從 1.4.0 的拉取查出來。' },
          { commands: [`cat deploy-token.txt | docker login ${REG} -u deploy --password-stdin`, `docker pull ${API}:1.4.0`, `docker run -d --name api -p 8080:8000 ${API}@${D140}`, "docker ps --format '{{.Names}} {{.Image}}'"],
            why: '舊的 api 容器還在：名稱衝突（Conflict），新的容器沒有建立，正式環境仍跑著舊的 latest。要先 `docker rm -f api`（或 stop 再 rm）。' },
          { commands: ['docker rm -f api', `docker run -d --name api -p 8080:8000 ${API}@${D140}`, "docker ps --format '{{.Names}} {{.Image}}'"],
            why: '沒有登入：本機沒有這個 digest 的 Image，`docker run` 要拉取時得到 unauthorized，而舊的 api 已經刪掉，服務就中斷了。' },
        ],
        hints: [
          '先以 deploy 登入，拉取 1.4.0：輸出的 `Digest:` 一行（或 `docker images --digests`）就是要鎖定的值。',
          '同名的容器要先移除；`docker run -d --name api -p 8080:8000 名稱@sha256:<digest>`。',
        ],
        explanation: `以 deploy 登入後 \`docker pull ${API}:1.4.0\`，Digest 一行是 1.4.0 目前的 digest；\`docker rm -f api\` 移除舊的容器，再以 \`名稱@sha256:…\` 建立新的，\`docker ps --format\` 的 IMAGE 欄就是 digest 寫法，curl 得到 team/api 1.4.0。以標籤建立的容器內容雖然一樣，卻沒有鎖定；拉取 latest 會換成候選版；鎖定目前 latest 的 digest 只是把舊版本固定下來。正式環境的部署設定應該寫 digest，回滾時換回上一個 digest。`,
      },
    ],
  },
};
