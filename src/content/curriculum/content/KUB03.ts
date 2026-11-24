/*
 * KUB03 Pods (KUB-1, terminal-sim). A terminal lesson on the probes profile (engine stages E32 cluster and E33 probes):
 * the workstation ops-21 (user mei) with the admin kubeconfig of a fictional three-node kubeadm cluster. ~/pods holds
 * the manifests: web (nginx with ports and resources; QoS), typo (a misspelt field: strict decoding), board (an init
 * container before menu-api and a metrics-exporter sidecar: logs -c, exec -c, one IP and hostname), kitchen (a correct
 * readiness probe and a liveness probe on the wrong port: READY, Unhealthy, Killing, logs --previous), orders and catalog.
 * At the start the cluster already runs orders (applied 09:50: its api container's liveness probe asks /health, the
 * program answers /healthz, so it restarts in CrashLoopBackOff) and catalog (applied 09:56: the init container migrate
 * needs DB_HOST, the manifest sets DB_HOSTNAME: Init:CrashLoopBackOff). The images (harbor/menu-api, orders-api,
 * metrics-exporter, catalog-migrate, catalog), their HTTP responders and kube.health (menu-api listens after 3 s, /ready
 * answers 503 for 12 s) are made up. Shared volumes, localhost traffic inside a pod and native sidecars are text only.
 * Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'mei'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const file = (path: string, content: string): TerminalFile => ({ path, kind: 'file', mode: 0o644, owner: 'mei', content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'cp', 'mv', 'rm', 'echo', 'head', 'tail', 'grep', 'wc', 'hostname', 'uname', 'env', 'ps', 'sleep', 'sh', 'true', 'false', 'id'];

const IMAGES: TerminalImage[] = [
  { name: 'nginx:1.27', size: 72_099_410, created: '2026-11-10 08:00:00', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], expose: [80], service: true, layers: 7, osRelease: DEBIAN,
    commands: [...BASIC], logs: ['/docker-entrypoint.sh: Configuration complete; ready for start up'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NGINX_VERSION=1.27.3'], stopSignal: 'SIGQUIT',
    files: [{ path: '/usr/share/nginx/html/index.html', content: '<h1>Welcome to nginx!</h1>\n' }] },
  { name: 'busybox:1.36', size: 4_270_000, created: '2026-10-01 00:00:00', cmd: ['sh'], layers: 1, osRelease: DEBIAN, commands: [...BASIC] },
  { name: 'harbor/menu-api:1.4', size: 48_200_000, created: '2026-11-18 03:00:00', cmd: ['/app/menu-api'], expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: [...BASIC],
    http: { port: 8080, responder: 'menu-api' }, logs: ['menu-api 1.4: loading menu', 'menu-api 1.4: listening on :8080 (liveness /healthz, readiness /ready)'],
    signals: { TERM: { seconds: 2, logs: ['menu-api 1.4: draining connections'], exit: 0 } } },
  { name: 'harbor/orders-api:2.0', size: 52_600_000, created: '2026-11-19 03:00:00', cmd: ['/app/orders-api'], expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: [...BASIC],
    http: { port: 8080, responder: 'orders-api' }, logs: ['orders-api 2.0: listening on :8080', 'orders-api 2.0: health endpoints /healthz (liveness) and /ready (readiness)'],
    signals: { TERM: { seconds: 2, logs: ['orders-api 2.0: shutting down'], exit: 0 } } },
  { name: 'harbor/metrics-exporter:0.9', size: 18_400_000, created: '2026-11-02 03:00:00', cmd: ['/exporter'], expose: [9102], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC],
    http: { port: 9102, responder: 'exporter' }, logs: ['exporter 0.9: scraping http://localhost:8080/stats every 15s', 'exporter 0.9: serving /metrics on :9102'],
    signals: { TERM: { seconds: 0, exit: 0 } } },
  { name: 'harbor/catalog-migrate:1.0', size: 21_800_000, created: '2026-11-15 03:00:00', cmd: ['/migrate'], layers: 2, osRelease: DEBIAN, commands: [...BASIC],
    needsEnv: ['DB_HOST'], missingEnv: { output: 'migrate: DB_HOST is not set', exit: 1 }, output: 'migrate: applied 3 migrations, schema version 14\n' },
  { name: 'harbor/catalog:3.2', size: 61_300_000, created: '2026-11-15 03:00:00', cmd: ['/app/catalog'], expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: [...BASIC],
    http: { port: 8080, responder: 'catalog' }, logs: ['catalog 3.2: listening on :8080'], signals: { TERM: { seconds: 1, exit: 0 } } },
];
const RESPONDERS = [
  { id: 'menu-api', server: 'menu-api/1.4', routes: [{ path: '/', body: '{"dishes":12}\n', type: 'application/json' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }, { path: '/ready', body: 'ready\n', type: 'text/plain' }] },
  { id: 'orders-api', server: 'orders-api/2.0', routes: [{ path: '/', body: '{"open":3}\n', type: 'application/json' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }, { path: '/ready', body: 'ready\n', type: 'text/plain' }] },
  { id: 'exporter', server: 'exporter/0.9', routes: [{ path: '/metrics', body: 'orders_open 3\n', type: 'text/plain' }] },
  { id: 'catalog', server: 'catalog/3.2', routes: [{ path: '/', body: '{"items":240}\n', type: 'application/json' }, { path: '/ready', body: 'ready\n', type: 'text/plain' }] },
];

const WEB_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: web', '  labels:', '    app: web', 'spec:', '  containers:', '  - name: nginx', '    image: nginx:1.27', '    ports:', '    - containerPort: 80',
  '    resources:', '      requests:', '        cpu: 100m', '        memory: 64Mi', '      limits:', '        memory: 128Mi');
const TYPO_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: typo', 'spec:', '  containers:', '  - name: nginx', '    image: nginx:1.27', '    port:', '    - containerPort: 80');
const BOARD_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: board', '  labels:', '    app: board', 'spec:', '  initContainers:', '  - name: fetch', '    image: busybox:1.36',
  '    command: ["sh", "-c", "echo fetching the daily specials; sleep 8"]', '  containers:', '  - name: web', '    image: harbor/menu-api:1.4', '    ports:', '    - containerPort: 8080',
  '  - name: exporter', '    image: harbor/metrics-exporter:0.9', '    ports:', '    - containerPort: 9102');
const KITCHEN_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: kitchen', '  labels:', '    app: kitchen', 'spec:', '  containers:', '  - name: api', '    image: harbor/menu-api:1.4', '    ports:', '    - containerPort: 8080',
  '    readinessProbe:', '      httpGet:', '        path: /ready', '        port: 8080', '      periodSeconds: 5', '    livenessProbe:', '      httpGet:', '        path: /healthz', '        port: 9090', '      initialDelaySeconds: 15', '      periodSeconds: 5');
const ORDERS_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: orders', '  labels:', '    app: orders', 'spec:', '  containers:', '  - name: api', '    image: harbor/orders-api:2.0', '    ports:', '    - containerPort: 8080',
  '    livenessProbe:', '      httpGet:', '        path: /health', '        port: 8080', '      initialDelaySeconds: 5', '    readinessProbe:', '      httpGet:', '        path: /ready', '        port: 8080', '      periodSeconds: 5',
  '  - name: exporter', '    image: harbor/metrics-exporter:0.9', '    ports:', '    - containerPort: 9102');
const CATALOG_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: catalog', '  labels:', '    app: catalog', 'spec:', '  initContainers:', '  - name: migrate', '    image: harbor/catalog-migrate:1.0',
  '    env:', '    - name: DB_HOSTNAME', '      value: catalog-db.harbor.internal', '  containers:', '  - name: catalog', '    image: harbor/catalog:3.2', '    ports:', '    - containerPort: 8080',
  '    readinessProbe:', '      httpGet:', '        path: /ready', '        port: 8080', '      periodSeconds: 5');

/** The cluster: the pods orders (since `ordersAt`) and catalog (since 09:56) were applied before the lesson starts. */
const cluster = (ordersAt: string): TerminalKube => ({
  images: [{ name: 'nginx:1.27', seconds: 3 }, { name: 'busybox:1.36', nodes: ['node-01', 'node-02'] }, { name: 'harbor/metrics-exporter:0.9', nodes: ['node-01', 'node-02'] }],
  pullSeconds: 2,
  manifests: [{ text: ORDERS_YAML, at: ordersAt, file: 'orders.yaml' }, { text: CATALOG_YAML, at: '2026-11-24 09:56:00', file: 'catalog.yaml' }],
  health: [
    { image: 'harbor/menu-api:1.4', listenAfter: 3, paths: [{ path: '/ready', status: 503, until: 12 }] },
    { image: 'harbor/orders-api:2.0', listenAfter: 2 },
  ],
});

const OPS: TerminalMachine = {
  id: 'kub03-ops', title: 'ops-21（管理 harbor 叢集的工作站）', user: 'mei', host: 'ops-21', cwd: '/home/mei', profile: 'probes', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/mei'), dir('/home/mei/pods'), file('/home/mei/pods/web.yaml', WEB_YAML), file('/home/mei/pods/typo.yaml', TYPO_YAML), file('/home/mei/pods/board.yaml', BOARD_YAML),
    file('/home/mei/pods/kitchen.yaml', KITCHEN_YAML), file('/home/mei/pods/orders.yaml', ORDERS_YAML), file('/home/mei/pods/catalog.yaml', CATALOG_YAML)],
  responders: RESPONDERS,
  docker: { images: IMAGES },
  kube: cluster('2026-11-24 09:50:00'),
};

/** A command writing this text to the file with a quoted here-document (the text ends with a newline). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;
const menu = (container: string[]) => heredoc('pods/menu.yaml', yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: menu', '  labels:', '    app: menu', 'spec:', '  containers:', '  - name: api',
  '    image: harbor/menu-api:1.4', '    ports:', '    - containerPort: 8080', ...container.map(l => `    ${l}`)));
const ready = (path: string, port: number) => ['readinessProbe:', '  httpGet:', `    path: ${path}`, `    port: ${port}`, '  periodSeconds: 5'];
const MENU_OK = menu(ready('/ready', 8080));
const APPLY_MENU = 'kubectl apply -f pods/menu.yaml';
const RESTARTS = 'kubectl get pod orders -o jsonpath=\'{.status.containerStatuses[?(@.name=="api")].restartCount}\'';
const FIX_ORDERS = "sed -i 's#path: /health$#path: /healthz#' pods/orders.yaml";
const FIX_CATALOG = "sed -i 's/DB_HOSTNAME/DB_HOST/' pods/catalog.yaml";

export const KUB03: LessonContent = {
  lessonId: 'KUB03',
  motivation: 'KUB02 追蹤了一次 `kubectl apply`：API server 把物件存進 etcd，scheduler 替它挑一個節點，那個節點的 kubelet 再請 containerd 把容器跑起來。被排程、被啟動的那個東西不是「容器」，而是 Pod。Pod 是 Kubernetes 能建立與管理的最小單位：一個或多個一起排程到同一個節點、共用同一個 IP 的容器，加上它們的設定。Deployment、Service、Ingress 這些之後的課要學的物件，最後都是在建立 Pod、或是把流量送進 Pod，所以看懂一個 Pod 的 manifest、它的生命週期與它的狀態，是之後所有除錯的基本功。這一課在 ops-21 這台管理 harbor 叢集的工作站上，先寫出 Pod 的 YAML manifest，認識 Pod 與容器的關係、一個 Pod 裡放好幾個容器（sidecar 與 init container）的時機；再看 Pending、Running、Succeeded、Failed 與 CrashLoopBackOff 這些狀態從哪裡來；最後用存活（liveness）、就緒（readiness）與啟動（startup）三種探針，讓 kubelet 判斷容器還活著沒有、能不能接工作。叢集裡已經有兩個出問題的 Pod：一直重新啟動的 orders，以及卡在初始化的 catalog，練習會請你找出原因並修好它們。',
  sections: [
    {
      id: 'kub03-s-manifest', title: 'Pod 與它的 YAML manifest',
      blocks: [
        { type: 'p', text: '在 Kubernetes 裡不會直接說「替我跑一個容器」，而是送出一份描述期望狀態的 YAML manifest：「我要一個叫 web 的 Pod，裡面有一個用 nginx:1.27 的容器」。API server 檢查並儲存這份宣告之後，scheduler 與 kubelet 才去讓它成真。每一份 manifest 都有四個頂層欄位：`apiVersion`（Pod 屬於核心 API 群組，寫 `v1`）、`kind`（`Pod`）、`metadata`（名稱、命名空間、標籤等身分資料）與 `spec`（期望的內容）。叢集回報的實際情況則在另一個欄位 `status`，由 kubelet 填寫，manifest 不需要也不應該寫它。' },
        { type: 'table', head: ['欄位', '意思', '注意'], rows: [
          ['`metadata.name`', 'Pod 的名稱，在命名空間裡唯一', '小寫英數與 `-`、`.`（DNS subdomain）；也會成為容器的 hostname'],
          ['`metadata.labels`', '鍵值標籤，例如 `app: web`', '之後的 Service、Deployment 以標籤選擇器找到 Pod'],
          ['`spec.containers[]`', '容器的清單，至少一個', '每個容器各有 `name`（Pod 內唯一）與 `image`'],
          ['`containers[].ports[].containerPort`', '容器在聽的埠', '主要是說明與命名用；不寫也聽得到，也不會像 `docker run -p` 那樣對外發布'],
          ['`containers[].command`、`args`', '取代 Image 的 ENTRYPOINT 與 CMD', '同 Docker 的規則：只寫 `command` 時 Image 的 CMD 不再使用'],
          ['`containers[].resources`', '`requests`（排程時保留的 CPU 與記憶體）與 `limits`（上限）', '本課只當欄位認識；超過記憶體 limit 會被 OOMKilled，詳細在之後的課'],
          ['`spec.restartPolicy`', '容器結束後要不要重新啟動', '`Always`（預設）、`OnFailure`、`Never`，見生命週期一節'],
        ] },
        { type: 'p', text: 'ops-21 的 ~/pods 放著這一課的 manifest。web.yaml 是最小但完整的 Pod：一個 nginx 容器、宣告 80 埠，並寫了 requests 與 limits。apply 之後先看到 ContainerCreating（節點正在拉取 Image），過幾秒才 Running：' },
        { type: 'example', id: 'kub03-first' },
        { type: 'p', text: '`-o wide` 多了 IP 與 NODE：Pod 被排到 node-02，拿到那個節點 Pod 網段（10.244.2.0/24）裡的一個位址。READY 的 `1/1` 是「就緒的容器數／容器總數」。`.status.qosClass` 是 API server 依 resources 算出的服務品質等級：requests 與 limits 都沒寫是 BestEffort，每個容器的 CPU 與記憶體都有 limits 且等於 requests 是 Guaranteed，其他像 web 這樣只寫了一部分的是 Burstable；節點記憶體不足而要驅逐 Pod 時，BestEffort 的 Pod 通常最先被選中。最後一個指令示範了打錯欄位：`ports` 少了 s，API server 以嚴格解碼直接拒絕整份 manifest，訊息還指出了是哪一個欄位。' },
        { type: 'callout', tone: 'warning', title: '縮排錯了，錯誤訊息會指向「別的」欄位', text: 'YAML 用縮排表示階層，縮排錯了的鍵不會消失，而是被放到另一層，API server 再以嚴格解碼指出那個位置。例如把容器的 `image:` 少縮兩格，它就和 `containers` 同一層，錯誤是 `unknown field \"spec.image\"`；把 `readinessProbe:` 多縮兩格放進 `ports` 的項目裡，錯誤是 `unknown field \"spec.containers[0].ports[0].readinessProbe\"`。很多人看到 unknown field 就以為是拼錯字，一直檢查拼法；其實要先讀錯誤裡的路徑：路徑說這個鍵在哪一層，跟你想放的位置不同，就是縮排錯了。同一層的鍵必須對齊，清單的每個項目以 `- ` 開頭；名稱只能用小寫，`name: Web` 也會被拒絕。' },
      ],
    },
    {
      id: 'kub03-s-pod-container', title: 'Pod 與容器：一起排程、共用網路',
      blocks: [
        { type: 'p', text: '一個 Pod 包住一個或多個容器。同一個 Pod 的容器一定被排到同一個節點、一起建立、一起刪除，而且共用一部分 Linux namespace：kubelet 先透過 CRI 建立 Pod 的沙箱（containerd 用一個很小的 pause 容器持有這些 namespace），Pod 裡的每個容器再加入它。所以整個 Pod 只有一個 IP，容器之間用 `localhost` 就能互相連線，hostname 都是 Pod 的名稱；但每個容器仍有自己的檔案系統（來自各自的 Image），要共用檔案得在 Pod 層級宣告 volume、再掛進各個容器（volume 在之後的課介紹）。' },
        { type: 'table', head: ['', '同一個 Pod 的兩個容器', '兩個不同的 Pod'], rows: [
          ['IP 位址', '共用一個', '各有一個'],
          ['互相連線', '`localhost:埠`', '對方的 Pod IP（實務上透過之後的 Service）'],
          ['埠', '共用同一組，不能兩個都聽 8080', '各自獨立，都可以聽 8080'],
          ['hostname', '都是 Pod 的名稱', '各自的 Pod 名稱'],
          ['檔案', '各自的；共用要靠 Pod 的 volume', '各自的'],
          ['節點', '一定在同一個節點', '可能在不同節點'],
          ['生命週期與擴展', '一起建立、刪除、複製', '各自獨立'],
        ] },
        { type: 'p', text: '為什麼排程的單位是 Pod，而不是容器？因為有些容器必須在一起才能運作：在 localhost 上抓主程式指標的 exporter、替主程式轉送日誌的代理，如果被排到不同節點就失去意義。scheduler 一次替整個 Pod 找節點，計算時把所有容器的 requests 加起來；之後的 Deployment 要擴展到三份時，也是把整個 Pod 複製三份。反過來說，能各自擴展、各自更新的程式就不該放在同一個 Pod：網站要開 10 份，資料庫通常只要 1 份，放在一起就只能一起變成 10 份。' },
        { type: 'p', text: '還有一個重要的性質：Pod 是用完即丟的。直接建立的 Pod（像本課這樣，沒有控制器管理）被刪除，或所在的節點故障，就不會有任何人把它建回來；重新建立的 Pod 是新的物件，名稱可以相同，但 UID 與 IP 都可能不同。容器在原地重新啟動則不同：Pod 還是同一個，IP 不變，只有 RESTARTS 加一。KUB04 的 ReplicaSet 與 Deployment 就是用來補上「Pod 不見了要再建一個」這件事。' },
        { type: 'callout', tone: 'warning', title: '多容器 Pod 不是「把整個系統裝進一個 Pod」', text: '從 Docker Compose 過來的人，常把網站、API 與資料庫寫進同一個 Pod 的 containers，覺得這樣才能用 localhost 互相連線。結果是它們只能一起排程到同一個節點、一起擴展、一起被重新建立，任一個更新都會連帶重建其他容器，資料庫還會跟著網站複製成好幾份。一般的原則是「一個 Pod 一個主要的程式」，不同的程式各自是 Pod，透過 Service 互相連線；只有緊密依附主程式、生命週期與它相同的輔助程式（sidecar），才放進同一個 Pod。' },
      ],
    },
    {
      id: 'kub03-s-multi', title: '多容器 Pod：sidecar 與 init container',
      blocks: [
        { type: 'p', text: '多容器 Pod 最常見的形式是 sidecar：主容器旁邊放一個輔助容器，替它做與業務無關的工作，例如把主程式的統計轉成監控系統讀得懂的指標、把日誌檔送到集中的日誌系統、在 localhost 上當代理處理 TLS。sidecar 與主容器同時啟動、同時執行，兩者都寫在 `spec.containers` 裡。另一種是 init container：寫在 `spec.initContainers`，在所有一般容器啟動之前依序執行，每一個都必須成功結束（結束碼 0），下一個才會開始；全部完成後，一般容器才同時啟動。它適合做「開始服務之前要先完成一次」的事：等待相依的服務、執行資料庫遷移、下載設定或資料。' },
        { type: 'table', head: ['', 'init container', '一般容器（含 sidecar）'], rows: [
          ['寫在', '`spec.initContainers`', '`spec.containers`'],
          ['執行順序', '依序，一次一個，全部成功才結束初始化', '初始化完成後同時啟動'],
          ['預期的結束', '做完就結束，結束碼必須是 0', '持續執行（服務）'],
          ['失敗時', '依 restartPolicy 重試；STATUS 是 `Init:Error`、`Init:CrashLoopBackOff`，一般容器不會啟動', '依 restartPolicy 重新啟動該容器'],
          ['探針', '不能設定', '可以設定 liveness、readiness、startup'],
          ['初始化中的 STATUS', '`Init:0/1`（完成數／總數）', '之後是 `PodInitializing`、`ContainerCreating`'],
        ] },
        { type: 'p', text: 'board.yaml 是 harbor 的菜單看板：init container fetch 先下載當天的特餐（這裡以 sleep 8 秒代表），之後主容器 web（menu-api）與 sidecar exporter 一起啟動；exporter 從 localhost:8080 讀 web 的統計，在自己的 9102 埠提供指標。有多個容器時，`kubectl logs` 與 `kubectl exec` 要用 `-c` 指定容器：' },
        { type: 'example', id: 'kub03-multi' },
        { type: 'p', text: '剛建立時 STATUS 是 `Init:0/1`，READY 是 `0/2`（init container 不算在 READY 裡）。fetch 結束後，exporter 的 Image 節點上已經有了，立刻啟動；web 的 Image 還在拉取，所以 8 秒時是 `1/2` 與 ContainerCreating，再過 2 秒才 `2/2`。沒有 `-c` 的 `kubectl logs` 會先在標準錯誤印出 `Defaulted container "web" out of: web, exporter, fetch (init)`，再顯示第一個容器的日誌；init container 結束後日誌仍然留著，可以用 `-c fetch` 讀。兩個容器的 hostname 都是 board，因為它們在同一個 Pod 裡。exporter 的日誌說它從 `http://localhost:8080` 讀統計：在同一個 Pod 裡，這個 localhost 就是 web 容器。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍與原生 sidecar', text: '本課的模擬環境不模擬 Pod 內容器之間實際的 localhost 連線與共用 volume（emptyDir 等），這些在之後的課出現；這裡以日誌、hostname 與單一的 Pod IP 說明。較新的 Kubernetes 另有「原生 sidecar」：寫在 initContainers、但設定 `restartPolicy: Always` 的容器會在初始化階段啟動並一直執行，保證比主容器先就緒、晚結束（1.29 起預設啟用）。它在本課的模擬環境不模擬，練習中的 sidecar 都是寫在 containers 裡的一般容器。' },
      ],
    },
    {
      id: 'kub03-s-lifecycle', title: 'Pod 的生命週期與 restartPolicy',
      blocks: [
        { type: 'p', text: 'Pod 生命週期的總結是 `status.phase`，只有五個值。但 `kubectl get pods` 的 STATUS 欄不是 phase：kubectl 會把更具體的原因印出來，例如容器在等待的原因（ContainerCreating、CrashLoopBackOff、ErrImagePull）、結束的原因（Completed、Error、OOMKilled）、初始化進度（Init:0/1）或正在刪除（Terminating）。所以除錯時要同時看 STATUS、RESTARTS，以及 `kubectl describe` 裡每個容器的 State 與 Last State。' },
        { type: 'table', head: ['phase', '意思', '常見的 STATUS'], rows: [
          ['Pending', '已被接受，但還有容器沒開始執行：還沒排程、正在拉 Image、init container 還沒完成', '`Pending`、`ContainerCreating`、`Init:0/1`、`ImagePullBackOff`'],
          ['Running', '已綁定節點，所有容器都建立過，至少一個在執行（或正在重新啟動）', '`Running`、`CrashLoopBackOff`、`Error`（還會重啟時）'],
          ['Succeeded', '所有容器都成功結束（0），而且不會再重新啟動', '`Completed`'],
          ['Failed', '所有容器都結束了，至少一個失敗，而且不會再重新啟動', '`Error`、`OOMKilled`'],
          ['Unknown', '控制平面拿不到 Pod 的狀態，通常是節點失聯', '`Unknown`'],
        ] },
        { type: 'p', text: '容器結束之後怎麼辦，由 Pod 的 `spec.restartPolicy` 決定，它套用在 Pod 裡每一個容器。重新啟動是由同一個節點的 kubelet 在原地進行，Pod 不會被重新排程。為了避免一直失敗的容器把節點忙壞，kubelet 在重啟之間加上指數退避：第一次立刻重啟，之後等 10 秒、20 秒、40 秒……最多 5 分鐘，容器順利跑滿 10 分鐘後才重新計算。等待中的 STATUS 就是 CrashLoopBackOff，它不是錯誤本身，而是「這個容器一直結束、正在等下一次重啟」。' },
        { type: 'table', head: ['restartPolicy', '結束碼 0', '結束碼非 0', '適合'], rows: [
          ['`Always`（預設）', '重新啟動', '重新啟動', '持續執行的服務；結束就是異常'],
          ['`OnFailure`', '不重啟，Pod 可能 Succeeded', '重新啟動', '失敗要重試的一次性工作'],
          ['`Never`', '不重啟，Succeeded', '不重啟，Failed', '只執行一次、結果要保留下來看的工作'],
        ] },
        { type: 'p', text: '下面用 `kubectl run` 快速建立兩個 busybox 的 Pod：once 印出一行就結束、restartPolicy 是 Never；flaky 每次都以結束碼 1 失敗、restartPolicy 是預設的 Always：' },
        { type: 'example', id: 'kub03-lifecycle' },
        { type: 'p', text: 'once 的 phase 是 Succeeded，STATUS 是 Completed，READY 是 0/1（已經沒有在執行的容器）。flaky 的 phase 是 Running，STATUS 卻是 CrashLoopBackOff：phase 只說「已經綁定節點、容器建立過、還會再重啟」，真正的問題要看 describe 的 Last State（Terminated、Reason Error、Exit Code 1）。45 秒內它重啟了 3 次：0 秒結束後立刻重啟，之後等 10 秒、再等 20 秒，正好對上指數退避。容器重新啟動後目前的日誌是新的，要看上一次為什麼結束，要加 `--previous`。' },
      ],
    },
    {
      id: 'kub03-s-probes', title: '存活、就緒與啟動探針',
      blocks: [
        { type: 'p', text: '「容器的主程序還在執行」不代表「服務正常」：程式可能卡死（行程還在，卻再也不回應），也可能還在暖機（行程在了，但快取、連線或資料還沒準備好）。探針（probe）讓 kubelet 定期主動檢查容器，三種探針回答三個不同的問題，失敗時的後果也完全不同：' },
        { type: 'table', head: ['探針', '回答的問題', '失敗到門檻時', '典型的檢查'], rows: [
          ['存活（`livenessProbe`）', '這個容器還活著嗎？', 'kubelet 殺掉容器（事件 Killing），依 restartPolicy 重新啟動；RESTARTS 加一', '只檢查程式本身能回應，例如 `/healthz`'],
          ['就緒（`readinessProbe`）', '這個容器現在能接工作嗎？', '不重啟，容器標成未就緒：READY 變少、Ready 條件為 False；之後的課的 Service 會把它移出流量', '依賴準備好了沒，例如 `/ready`'],
          ['啟動（`startupProbe`）', '這個容器啟動完成了嗎？', '還沒通過前，liveness 與 readiness 都暫停；失敗到門檻也會殺掉容器重啟', '同 liveness，但給較長的時間'],
        ] },
        { type: 'p', text: '每種探針可以用 `httpGet`（HTTP 狀態碼 200–399 算成功）、`tcpSocket`（連得上那個埠就成功）、`exec`（在容器裡執行指令，結束碼 0 成功）或 `grpc`（gRPC 健康檢查協定，本課只在課文說明）。時間與次數由下列欄位控制，沒寫時使用預設值：' },
        { type: 'table', head: ['欄位', '預設值', '意思'], rows: [
          ['`initialDelaySeconds`', '0', '容器啟動後多久才開始探測'],
          ['`periodSeconds`', '10', '多久探測一次'],
          ['`timeoutSeconds`', '1', '每次探測等多久就算失敗'],
          ['`successThreshold`', '1', '連續成功幾次才算恢復；liveness 與 startup 只能是 1'],
          ['`failureThreshold`', '3', '連續失敗幾次才採取行動（殺掉容器，或標成未就緒）'],
        ] },
        { type: 'p', text: '沒有任何探針的容器，只要在執行中就算就緒；這也是為什麼服務需要暖機時，一定要有 readiness 探針。kitchen.yaml 的 readiness 探針正確（/ready，8080），liveness 探針卻寫錯了埠（9090，程式只聽 8080）。menu-api 啟動後 3 秒才開始聽連線、12 秒前 /ready 回 503（還在載入菜單）：' },
        { type: 'example', id: 'kub03-probes' },
        { type: 'p', text: '前 5 秒 READY 是 0/1：第一次 readiness 探測時埠還沒開（connection refused），之後 /ready 回 503。大約 17 秒時 /ready 回 200，READY 變成 1/1，但 RESTARTS 仍是 0：readiness 從不重啟容器。liveness 等了 15 秒（initialDelaySeconds）才開始，每 5 秒一次連 9090 都被拒絕，連續 3 次失敗之後 kubelet 記下 Killing「Container api failed liveness probe, will be restarted」，送出 SIGTERM。容器重新啟動後 READY 回到 0/1，又要重新暖機。`kubectl logs --previous` 的最後一行 draining connections，就是上一次的程式收到 SIGTERM 後的收尾。這種 Pod 會一直在「暖機、就緒、被殺掉」之間循環，對使用者來說時好時壞，比完全掛掉更難察覺。' },
        { type: 'callout', tone: 'warning', title: 'liveness 探針不要檢查外部依賴', text: '常見的誤解是「liveness 探針檢查越多越安全」，於是讓 /healthz 也去連資料庫。資料庫一停，所有 Pod 的 liveness 同時失敗，kubelet 把它們全部重新啟動，而重新啟動根本修不好資料庫，只會讓服務在資料庫恢復時還在暖機。liveness 只回答「程式本身卡死了沒，重開能不能解決」；依賴是否可用交給 readiness，讓暫時不能服務的 Pod 不接流量就好。另一個常見錯誤是啟動很慢的程式只設了 liveness：還沒啟動完就連續失敗而被殺掉，永遠起不來。這時用 startupProbe 給足啟動時間（failureThreshold × periodSeconds，例如 30 × 10 秒），通過後再交給 liveness。' },
        { type: 'callout', tone: 'note', title: '探針在模擬環境裡的時間', text: '本課的模擬環境以容器啟動的時間為基準：第一次探測在 initialDelaySeconds 時，之後每 periodSeconds 一次；真實的 kubelet 還有些微的隨機延遲。服務何時開始聽、哪個路徑在什麼時段回 503，是課程資料宣告的。Kubernetes 文件裡常見的 `touch /tmp/healthy; sleep 30; rm -f /tmp/healthy` 示範在這裡不適用：模擬環境的 `sh -c` 會立刻執行每一段，檔案會馬上被刪掉；要讓 exec 探針失敗，請用 `kubectl exec … -- rm` 自己刪檔。' },
      ],
    },
    {
      id: 'kub03-s-stop', title: '修改與刪除 Pod：不可變的 spec 與優雅終止',
      blocks: [
        { type: 'p', text: 'Pod 建立之後，它的 spec 幾乎都不能改：除了容器的 `image`、`activeDeadlineSeconds`、新增 tolerations 與 `terminationGracePeriodSeconds`，其他欄位（command、env、探針、ports、resources……）都不能就地修改，`kubectl apply` 會回 `spec: Forbidden: pod updates may not change fields other than …`。直接建立的 Pod 要改設定，只能刪掉再用新的 manifest 建立；之後的 Deployment 會替你做這件事，而且一次換一部分，不中斷服務。' },
        { type: 'p', text: '刪除 Pod 也不是立刻消失。API server 先替 Pod 設定刪除時間，STATUS 變成 Terminating；kubelet 接著對每個容器依序做：' },
        { type: 'list', ordered: true, items: [
          '如果容器有 `lifecycle.preStop` hook，先執行它（例如等幾秒讓負載平衡器把它移出），它用掉的時間算在寬限期裡。',
          '送出停止訊號給容器的 PID 1：預設是 SIGTERM（Image 宣告了 STOPSIGNAL 時用那個，例如 nginx 的 SIGQUIT）。好的程式收到後停止接新請求、做完手上的工作再結束。',
          '寬限期 `terminationGracePeriodSeconds`（預設 30 秒）到了還沒結束，就送 SIGKILL 強制結束。',
          '所有容器都停止之後，Pod 從 API 消失；`kubectl delete` 預設會等到這一刻才回到提示字元。',
        ] },
        { type: 'example', id: 'kub03-stop' },
        { type: 'p', text: '改了 board.yaml 裡 init container 的指令再 apply，被 Forbidden 擋下；刪掉再 apply 才是新的設定。刪除 board 只花了 2 秒：menu-api 有處理 SIGTERM（2 秒內收尾），exporter 立刻結束。sleeper 卻整整等了 30 秒：它的 PID 1 是 `sleep 3600`，在容器裡 PID 1 沒有自己的處理程式時會忽略 SIGTERM，只能等寬限期結束被 SIGKILL。自己的程式要處理 SIGTERM；用 Shell 腳本啟動時要以 `exec` 把 PID 1 交給真正的程式。`--grace-period=N` 可以改這一次的寬限期；`--grace-period=0 --force` 不等 kubelet 確認就從 API 刪掉，容器可能還在節點上執行，只用在節點已經失聯之類的緊急情況。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [OPS],
    examples: [
      {
        id: 'kub03-first', title: '從 manifest 到 Running', machine: 'kub03-ops',
        description: '讀一份最小的 Pod manifest，apply 之後看 ContainerCreating 變成 Running、Pod 的 IP 與節點、QoS 等級，再看拼錯欄位的 manifest 被拒絕。',
        steps: [
          { command: 'cat pods/web.yaml', output: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: web\n  labels:\n    app: web\nspec:\n  containers:\n  - name: nginx\n    image: nginx:1.27\n    ports:\n    - containerPort: 80\n    resources:\n      requests:\n        cpu: 100m\n        memory: 64Mi\n      limits:\n        memory: 128Mi" },
          { command: 'kubectl apply -f pods/web.yaml', output: "pod/web created" },
          { command: 'kubectl get pod web', output: "NAME      READY     STATUS              RESTARTS   AGE\nweb       0/1       ContainerCreating   0          0s" },
          { command: 'sleep 5', output: "" },
          { command: 'kubectl get pod web -o wide', output: "NAME      READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nweb       1/1       Running   0          5s        10.244.2.3   node-02   <none>           <none>" },
          { command: "kubectl get pod web -o jsonpath='{.status.qosClass}'", output: "Burstable" },
          { command: 'kubectl apply -f pods/typo.yaml', output: "Error from server (BadRequest): error when creating \"pods/typo.yaml\": Pod in version \"v1\" cannot be handled as a Pod: strict decoding error: unknown field \"spec.containers[0].port\"" },
        ],
      },
      {
        id: 'kub03-multi', title: 'init container 與兩個容器的 Pod', machine: 'kub03-ops',
        description: 'board 先執行 init container fetch，完成後 web 與 sidecar exporter 一起啟動；用 -c 讀各個容器的日誌、在指定的容器裡執行指令。',
        steps: [
          { command: 'cat pods/board.yaml', output: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: board\n  labels:\n    app: board\nspec:\n  initContainers:\n  - name: fetch\n    image: busybox:1.36\n    command: [\"sh\", \"-c\", \"echo fetching the daily specials; sleep 8\"]\n  containers:\n  - name: web\n    image: harbor/menu-api:1.4\n    ports:\n    - containerPort: 8080\n  - name: exporter\n    image: harbor/metrics-exporter:0.9\n    ports:\n    - containerPort: 9102" },
          { command: 'kubectl apply -f pods/board.yaml', output: "pod/board created" },
          { command: 'kubectl get pod board', output: "NAME      READY     STATUS     RESTARTS   AGE\nboard     0/2       Init:0/1   0          0s" },
          { command: 'sleep 8', output: "" },
          { command: 'kubectl get pod board', output: "NAME      READY     STATUS              RESTARTS   AGE\nboard     1/2       ContainerCreating   0          8s" },
          { command: 'sleep 2', output: "" },
          { command: 'kubectl get pod board -o wide', output: "NAME      READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nboard     2/2       Running   0          10s       10.244.2.3   node-02   <none>           <none>" },
          { command: 'kubectl logs board', output: "Defaulted container \"web\" out of: web, exporter, fetch (init)\nmenu-api 1.4: loading menu\nmenu-api 1.4: listening on :8080 (liveness /healthz, readiness /ready)" },
          { command: 'kubectl logs board -c exporter', output: "exporter 0.9: scraping http://localhost:8080/stats every 15s\nexporter 0.9: serving /metrics on :9102" },
          { command: 'kubectl logs board -c fetch', output: "fetching the daily specials" },
          { command: 'kubectl exec board -c web -- hostname', output: "board" },
          { command: 'kubectl exec board -c exporter -- hostname', output: "board" },
          { command: "kubectl get pod board -o jsonpath='{.status.initContainerStatuses[0].state.terminated.reason}'", output: "Completed" },
        ],
      },
      {
        id: 'kub03-lifecycle', title: 'Completed、CrashLoopBackOff 與 phase', machine: 'kub03-ops',
        description: '一個只執行一次的 Pod 與一個每次都失敗的 Pod：比較 STATUS、phase 與 restartPolicy，讀上一次結束的狀態與日誌。',
        steps: [
          { command: 'kubectl run once --image=busybox:1.36 --restart=Never -- echo report done', output: "pod/once created" },
          { command: "kubectl run flaky --image=busybox:1.36 -- sh -c 'echo connecting to db; exit 1'", output: "pod/flaky created" },
          { command: 'sleep 45', output: "" },
          { command: 'kubectl get pods once flaky', output: "NAME      READY     STATUS             RESTARTS      AGE\nonce      0/1       Completed          0             45s\nflaky     0/1       CrashLoopBackOff   3 (15s ago)   45s" },
          { command: 'kubectl get pods once flaky -o custom-columns=NAME:.metadata.name,PHASE:.status.phase,POLICY:.spec.restartPolicy', output: "NAME      PHASE       POLICY\nonce      Succeeded   Never\nflaky     Running     Always" },
          { command: "kubectl describe pod flaky | grep -A 5 'State:'", output: "    State:          Waiting\n      Reason:       CrashLoopBackOff\n    Last State:     Terminated\n      Reason:       Error\n      Exit Code:    1\n      Started:      Tue, 24 Nov 2026 10:00:30 +0000\n      Finished:     Tue, 24 Nov 2026 10:00:30 +0000\n    Ready:          False" },
          { command: 'kubectl logs once', output: "report done" },
          { command: 'kubectl logs flaky --previous', output: "connecting to db" },
        ],
      },
      {
        id: 'kub03-probes', title: '就緒探針與寫錯埠的存活探針', machine: 'kub03-ops',
        description: 'kitchen 暖機時 READY 是 0/1，/ready 回 200 後變成 1/1；liveness 探針連錯了埠，連續失敗 3 次後容器被殺掉重新啟動。',
        steps: [
          { command: 'kubectl apply -f pods/kitchen.yaml', output: "pod/kitchen created" },
          { command: 'sleep 5', output: "" },
          { command: 'kubectl get pod kitchen', output: "NAME      READY     STATUS    RESTARTS   AGE\nkitchen   0/1       Running   0          5s" },
          { command: 'sleep 12', output: "" },
          { command: 'kubectl get pod kitchen', output: "NAME      READY     STATUS    RESTARTS   AGE\nkitchen   1/1       Running   0          17s" },
          { command: "kubectl describe pod kitchen | grep -E '^ +(Liveness|Readiness):'", output: "    Liveness:       http-get http://:9090/healthz delay=15s timeout=1s period=5s #success=1 #failure=3\n    Readiness:      http-get http://:8080/ready delay=0s timeout=1s period=5s #success=1 #failure=3" },
          { command: 'sleep 13', output: "" },
          { command: 'kubectl events --for pod/kitchen --types=Warning', output: "LAST SEEN           TYPE      REASON      OBJECT        MESSAGE\n18s (x2 over 23s)   Warning   Unhealthy   Pod/kitchen   Readiness probe failed: HTTP probe failed with statuscode: 503\n3s (x3 over 13s)    Warning   Unhealthy   Pod/kitchen   Liveness probe failed: Get \"http://10.244.2.3:9090/healthz\": dial tcp 10.244.2.3:9090: connect: connection refused\n1s (x2 over 28s)    Warning   Unhealthy   Pod/kitchen   Readiness probe failed: Get \"http://10.244.2.3:8080/ready\": dial tcp 10.244.2.3:8080: connect: connection refused" },
          { command: 'kubectl events --for pod/kitchen | grep Killing', output: "3s                  Normal    Killing     Pod/kitchen   Container api failed liveness probe, will be restarted" },
          { command: 'kubectl get pod kitchen', output: "NAME      READY     STATUS    RESTARTS     AGE\nkitchen   0/1       Running   1 (1s ago)   30s" },
          { command: 'kubectl logs kitchen --previous', output: "menu-api 1.4: loading menu\nmenu-api 1.4: listening on :8080 (liveness /healthz, readiness /ready)\nmenu-api 1.4: draining connections" },
        ],
      },
      {
        id: 'kub03-stop', title: '改不動的 spec 與優雅終止', machine: 'kub03-ops',
        description: '修改執行中 Pod 的指令被拒絕，只能刪除再建立；有處理 SIGTERM 的 Pod 很快結束，PID 1 是 sleep 的 Pod 要等滿 30 秒的寬限期。',
        steps: [
          { command: 'kubectl apply -f pods/board.yaml', output: "pod/board created" },
          { command: 'kubectl run sleeper --image=busybox:1.36 -- sleep 3600', output: "pod/sleeper created" },
          { command: 'sleep 15', output: "" },
          { command: "sed -i 's/sleep 8/sleep 3/' pods/board.yaml", output: "" },
          { command: 'kubectl apply -f pods/board.yaml', output: "The Pod \"board\" is invalid: spec: Forbidden: pod updates may not change fields other than `spec.containers[*].image`,`spec.initContainers[*].image`,`spec.activeDeadlineSeconds`,`spec.tolerations` (only additions to existing tolerations),`spec.terminationGracePeriodSeconds` (allow it to be set to 1 if it was previously negative)" },
          { command: 'date', output: "Tue Nov 24 10:00:15 UTC 2026" },
          { command: 'kubectl delete pod board', output: "pod \"board\" deleted" },
          { command: 'date', output: "Tue Nov 24 10:00:17 UTC 2026" },
          { command: 'kubectl apply -f pods/board.yaml', output: "pod/board created" },
          { command: 'kubectl delete pod sleeper --wait=false', output: "pod \"sleeper\" deleted" },
          { command: 'kubectl get pod sleeper', output: "NAME      READY     STATUS        RESTARTS   AGE\nsleeper   1/1       Terminating   0          17s" },
          { command: "kubectl describe pod sleeper | grep -E '^Status|Grace'", output: "Status:                    Terminating (lasts 30s)\nTermination Grace Period:  30s" },
          { command: 'sleep 30', output: "" },
          { command: 'kubectl get pod sleeper', output: "Error from server (NotFound): pods \"sleeper\" not found" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub03-menu-ready', title: '寫一份帶就緒探針的 Pod manifest', machine: 'kub03-ops',
        statement: '請在 ~/pods 寫一份 menu.yaml，建立 default 命名空間裡名為 menu 的 Pod：標籤 app=menu，一個名為 api 的容器，Image 是 harbor/menu-api:1.4，宣告 containerPort 8080。menu-api 啟動後要先載入菜單，載入完成前 /ready 會回 503，所以請加上 readinessProbe：以 httpGet 檢查 8080 埠的 /ready，每 5 秒一次。apply 之後，等到 Pod 真的就緒（READY 1/1）再結束。可以用 `cat > pods/menu.yaml <<\'EOF\'` 一行一行輸入整個檔案，最後一行單獨打 `EOF`。',
        checks: [
          { kind: 'exists', path: '/home/mei/pods/menu.yaml', type: 'file' },
          { kind: 'kube-object', resource: 'Pod', name: 'menu', labels: { app: 'menu' }, fields: [{ path: '.spec.containers[0].image', equals: 'harbor/menu-api:1.4' },
            { path: '.spec.containers[0].readinessProbe.httpGet.path', equals: '/ready' }, { path: '.spec.containers[0].readinessProbe.httpGet.port', equals: '8080' }] },
          { kind: 'kube-pod', name: 'menu', status: 'Running', ready: true },
        ],
        solution: [MENU_OK, APPLY_MENU, 'kubectl wait --for=condition=Ready pod/menu --timeout=60s'],
        mistakes: [
          { commands: [MENU_OK, APPLY_MENU], why: 'apply 之後立刻結束：Pod 還在 ContainerCreating，時鐘沒有前進，沒有等到就緒' },
          { commands: [menu(ready('/ready', 80)), APPLY_MENU, 'sleep 30'], why: '探針檢查 80 埠，menu-api 只聽 8080：每次都 connection refused，Pod 一直是 0/1，永遠不會就緒' },
          { commands: [menu(ready('/healthz', 8080)), APPLY_MENU, 'sleep 20'], why: '就緒探針檢查 /healthz：程式一開始聽就回 200，菜單還沒載入完就被當成可以接工作；就緒要檢查 /ready' },
          { commands: [menu([]), APPLY_MENU, 'sleep 20'], why: '沒有寫 readinessProbe：容器一執行就算就緒，載入菜單的那幾秒也會收到請求' },
          { commands: ['kubectl run menu --image=harbor/menu-api:1.4 --port=8080', 'sleep 20'], why: '用 kubectl run 直接建立：沒有 manifest 檔案、標籤是 run=menu，也沒有就緒探針' },
        ],
        hints: [
          '從 pods/web.yaml 的結構開始：apiVersion、kind、metadata（name 與 labels）、spec.containers；把 Image 換成 harbor/menu-api:1.4，埠換成 8080。',
          'readinessProbe 寫在容器底下，和 image、ports 同一層：`readinessProbe:` 之下是 `httpGet:`（`path: /ready`、`port: 8080`）與 `periodSeconds: 5`。',
          '`kubectl apply -f pods/menu.yaml` 之後用 `kubectl wait --for=condition=Ready pod/menu --timeout=60s` 等它就緒，或 `sleep` 幾秒再用 `kubectl get pod menu` 看 READY。',
        ],
        explanation: 'Pod 的 manifest 由 apiVersion v1、kind Pod、metadata（名稱與標籤）與 spec（containers 的清單）組成；容器的 readinessProbe 讓 kubelet 每 5 秒對 8080 埠的 /ready 發出 HTTP GET，回 200–399 才把容器標成就緒。menu-api 啟動後 3 秒才開始聽、12 秒前 /ready 回 503，所以 Pod 先是 0/1，大約 17 秒後才 1/1；`kubectl wait --for=condition=Ready` 會一直等到 Ready 條件成立。只 apply 不等，檢查時還沒就緒；探針的埠寫錯就永遠不會就緒；用 /healthz 或不寫探針都會在載入完成前就宣告就緒。',
      },
      {
        id: 'kub03-orders-restarts', title: '哪一個容器在重新啟動？', machine: 'kub03-ops',
        statement: 'orders 是一個兩個容器的 Pod（訂單 API 與指標 exporter），READY 經常是 1/2、RESTARTS 一直增加。請先用 `kubectl get`、`kubectl describe` 或 `kubectl events` 找出是哪一個容器在重新啟動、為什麼，然後用一個 `kubectl get pod orders -o jsonpath=…` 指令，只印出那個容器目前的重新啟動次數（一個數字）。不要先 sleep：要的是現在的次數。',
        checks: [{ kind: 'output', fromCommand: '^kubectl\\s' }],
        solution: ['kubectl get pod orders', 'kubectl events --for pod/orders --types=Warning', RESTARTS],
        mistakes: [
          { commands: ['kubectl get pod orders', 'echo 6'], why: '把看到的數字用 echo 打出來：答案要由 kubectl 印出，而且換一個時間建立的 orders 次數就不同' },
          { commands: ['kubectl get pod orders -o jsonpath=\'{.status.containerStatuses[1].restartCount}\''], why: '第二個 containerStatuses 是 exporter，它一次也沒有重新啟動；在重新啟動的是 api' },
          { commands: ['kubectl get pod orders'], why: '表格的 RESTARTS 欄是整個 Pod 的總和，還帶著時間，不是只有一個數字' },
          { commands: ["kubectl describe pod orders | grep 'Restart Count'"], why: 'describe 會列出兩個容器的 Restart Count 兩行，題目要的是在重新啟動的那一個' },
        ],
        variants: [{ label: '更早建立的 orders', files: [], kube: cluster('2026-11-24 09:38:00') }],
        hints: [
          '`kubectl describe pod orders` 的 Containers 段落裡，每個容器各有 State、Last State 與 Restart Count；Events 裡的 Killing 也寫了是哪一個容器。',
          '`kubectl get pod orders -o jsonpath=\'{.status.containerStatuses[*].name}\'` 會印出 containerStatuses 的順序。',
          '用篩選選出容器：`{.status.containerStatuses[?(@.name=="api")].restartCount}`；也可以用它在清單裡的位置 `[0]`。',
        ],
        explanation: 'READY 1/2 加上不斷增加的 RESTARTS，表示其中一個容器一直被重新啟動。describe 與 events 都指向 api：「Liveness probe failed: HTTP probe failed with statuscode: 404」連續三次後，Killing「Container api failed liveness probe, will be restarted」。每個容器的次數在 `.status.containerStatuses[].restartCount`，用 jsonpath 的篩選 `[?(@.name=="api")]` 取出 api 那一項。表格的 RESTARTS 是整個 Pod 的總和並帶著時間，describe 會列出兩個容器，exporter 的次數是 0；用 echo 打出看到的數字，在另一個時間建立的叢集上就對不上了。',
      },
      {
        id: 'kub03-orders-fix', title: '修好 orders 的存活探針', machine: 'kub03-ops',
        statement: 'orders 的 api 容器一直因為存活探針失敗而被重新啟動，可是程式本身並沒有問題。請找出 ~/pods/orders.yaml（orders 就是用它建立的）裡存活探針錯在哪裡（提示：程式啟動時的日誌寫了它的健康檢查端點），修正這個檔案（存活探針仍然用 httpGet，不要刪掉），讓叢集裡的 orders 換成修正後的設定，並確認它穩定執行：兩個容器都就緒，而且之後至少一分鐘 api 都沒有再重新啟動。',
        checks: [
          { kind: 'kube-object', resource: 'Pod', name: 'orders', fields: [{ path: '.spec.containers[0].livenessProbe.httpGet.path', equals: '/healthz' },
            { path: '.spec.containers[0].livenessProbe.httpGet.port', equals: '8080' }, { path: '.status.containerStatuses[?(@.name=="api")].restartCount', equals: '0' }] },
          { kind: 'kube-pod', name: 'orders', status: 'Running', ready: true },
        ],
        solution: ['kubectl logs orders -c api', FIX_ORDERS, 'kubectl delete pod orders', 'kubectl apply -f pods/orders.yaml', 'kubectl wait --for=condition=Ready pod/orders --timeout=60s', 'sleep 60'],
        mistakes: [
          { commands: [FIX_ORDERS, 'kubectl apply -f pods/orders.yaml', 'sleep 60'], why: '修好檔案後直接 apply：Pod 的探針不能就地修改，API server 回 Forbidden，叢集裡還是舊的 /health' },
          { commands: ['kubectl delete pod orders', 'kubectl apply -f pods/orders.yaml', 'sleep 60'], why: '沒有修改檔案就重新建立：新的 Pod 仍然探測 /health，一分鐘內又被殺掉重新啟動' },
          { commands: [FIX_ORDERS, 'kubectl delete pod orders'], why: '修好檔案、刪掉了 Pod，卻沒有再建立：直接建立的 Pod 被刪除後不會有人把它建回來' },
          { commands: ["sed -i '/livenessProbe/,/initialDelaySeconds/d' pods/orders.yaml", 'kubectl delete pod orders', 'kubectl apply -f pods/orders.yaml', 'sleep 60'], why: '把存活探針整段刪掉：不再重新啟動了，但程式真的卡死時也沒有人會重開它' },
          { commands: [FIX_ORDERS, 'kubectl delete pod orders', 'kubectl apply -f pods/orders.yaml'], why: '建立之後沒有等：api 還在啟動，就緒探針還沒通過，READY 不是 2/2' },
        ],
        hints: [
          '`kubectl events --for pod/orders --types=Warning` 的 Liveness probe failed 說回應是 404；`kubectl describe pod orders` 的 Liveness 一行是探測的網址。`kubectl logs orders -c api` 則寫了程式真正的健康檢查端點。',
          '把檔案裡的 `path: /health` 改成 `path: /healthz`，例如 `sed -i \'s#path: /health$#path: /healthz#\' pods/orders.yaml`，再用 `grep -n path: pods/orders.yaml` 確認。',
          '探針不能就地修改：先 `kubectl delete pod orders`，再 `kubectl apply -f pods/orders.yaml`，用 `kubectl wait --for=condition=Ready pod/orders --timeout=60s` 等它就緒，最後 `sleep 60` 確認 RESTARTS 仍是 0。',
        ],
        explanation: '程式啟動時說它的存活端點是 /healthz，manifest 卻探測 /health，得到 404，連續三次失敗後 kubelet 就殺掉 api 重新啟動，退避越來越長，形成 CrashLoopBackOff。修正 path 之後要讓叢集換成新的設定：Pod 的 spec 除了 image 等少數欄位都不能修改，所以要刪除再建立（Deployment 管理的 Pod 會由控制器替你做這件事）。新的 Pod 就緒之後再等一分鐘，api 的 restartCount 仍是 0，才證明它穩定了。直接 apply 會被 Forbidden 擋下；沒修好就重建只是重新開始倒數；刪掉探針則失去了卡死時自動重開的保護。',
      },
      {
        id: 'kub03-catalog-init', title: '卡在初始化的 catalog', machine: 'kub03-ops',
        statement: 'catalog 的 STATUS 一直是 Init:CrashLoopBackOff，商品目錄服務從來沒有啟動過。請用 kubectl 找出初始化失敗的原因，修正 ~/pods/catalog.yaml（init container migrate 必須保留：它負責在服務啟動前遷移資料庫的 schema），讓叢集裡的 catalog 換成修正後的設定，並等到它 Running 而且就緒。',
        checks: [
          { kind: 'kube-object', resource: 'Pod', name: 'catalog', fields: [{ path: '.spec.initContainers[0].name', equals: 'migrate' }, { path: '.spec.initContainers[0].env[0].name', equals: 'DB_HOST' }] },
          { kind: 'kube-pod', name: 'catalog', status: 'Running', ready: true },
        ],
        solution: ['kubectl logs catalog -c migrate', FIX_CATALOG, 'kubectl delete pod catalog', 'kubectl apply -f pods/catalog.yaml', 'kubectl wait --for=condition=Ready pod/catalog --timeout=60s'],
        mistakes: [
          { commands: [FIX_CATALOG, 'kubectl apply -f pods/catalog.yaml', 'sleep 30'], why: '修好檔案後直接 apply：init container 的 env 不能就地修改，Forbidden，叢集裡還是 DB_HOSTNAME' },
          { commands: ['kubectl delete pod catalog', 'kubectl apply -f pods/catalog.yaml', 'sleep 30'], why: '沒有修改就重新建立：migrate 仍然找不到 DB_HOST，又回到 Init:CrashLoopBackOff' },
          { commands: ["sed -i '/initContainers/,/value:/d' pods/catalog.yaml", 'kubectl delete pod catalog', 'kubectl apply -f pods/catalog.yaml', 'sleep 30'], why: '把 init container 刪掉：catalog 起來了，但資料庫的 schema 沒有遷移，服務會在舊的 schema 上執行' },
          { commands: [FIX_CATALOG, 'kubectl delete pod catalog', 'kubectl apply -f pods/catalog.yaml'], why: '建立之後沒有等：init container 還沒執行完，catalog 還在初始化' },
        ],
        hints: [
          '`kubectl logs catalog` 預設讀一般容器，它還沒啟動過；init container 的日誌要用 `kubectl logs catalog -c migrate`。',
          '日誌說缺少哪一個環境變數？對照 `grep -A 2 env pods/catalog.yaml` 寫的名稱。',
          '把名稱改對（例如 `sed -i \'s/DB_HOSTNAME/DB_HOST/\' pods/catalog.yaml`），刪掉 catalog 再 apply，最後 `kubectl wait --for=condition=Ready pod/catalog --timeout=60s`。',
        ],
        explanation: 'Init:CrashLoopBackOff 表示 init container 一直失敗、kubelet 在退避後重試；init container 沒有全部成功，一般容器永遠不會啟動，所以 `kubectl logs catalog` 讀不到東西，要用 `-c migrate`。它的日誌是「migrate: DB_HOST is not set」，manifest 卻把變數寫成 DB_HOSTNAME。改成 DB_HOST 之後，因為 Pod 的 spec 不能修改，要刪除再建立；新的 Pod 先跑完遷移（Init:0/1），catalog 才啟動，就緒探針通過後 READY 是 1/1。直接 apply 會被拒絕；不修就重建只是重來一次失敗；刪掉 init container 雖然能啟動，卻跳過了必要的遷移。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub03-q1', prompt: '同一個 Pod 裡有兩個容器：app 聽 8080 埠，exporter 要讀 app 的統計。exporter 應該連到哪裡？',
      options: ['另一個 Pod 的 Service 名稱，因為容器之間不能直接連線', 'app 容器自己的 IP，每個容器都有獨立的位址', '`localhost:8080`，因為兩個容器共用 Pod 的網路', '只能透過共用的 volume 交換檔案，網路連不到'],
      answer: 2,
      explanation: '同一個 Pod 的容器共用網路 namespace：整個 Pod 只有一個 IP、一組埠，所以 exporter 用 localhost:8080 就連到 app。Service 是給其他 Pod 使用的；容器沒有各自的 IP；volume 是共用檔案的方式，不是唯一的溝通管道。',
    },
    {
      id: 'kub03-q2', prompt: '`kubectl get pod` 顯示 STATUS 是 CrashLoopBackOff，但 `-o jsonpath=\'{.status.phase}\'` 印出 Running。最合理的解讀是？',
      options: ['容器反覆結束、kubelet 退避後重啟；phase 仍是 Running，原因看 Last State', 'phase 才是真的狀態，Pod 其實正常，STATUS 欄是 kubectl 的顯示錯誤', 'Pod 已經被排程器移到另一個節點，舊的已停止，正在那裡重新建立', 'CrashLoopBackOff 代表 Image 拉不下來，等節點的網路恢復後就會自己好'],
      answer: 0,
      explanation: 'restartPolicy 是 Always 時，容器結束後還會重啟，所以 phase 維持 Running；STATUS 欄顯示的是容器正在等待的原因 CrashLoopBackOff，要看 describe 的 Last State 與 `logs --previous` 才知道為什麼結束。STATUS 不是顯示錯誤；重啟在原節點進行，不會重新排程；拉不到 Image 是 ErrImagePull／ImagePullBackOff。',
    },
    {
      id: 'kub03-q3', prompt: '一個容器的就緒（readiness）探針連續失敗超過 failureThreshold，kubelet 會怎麼做？',
      options: ['殺掉容器並依 restartPolicy 重新啟動，RESTARTS 加一', '把整個 Pod 刪除，由排程器在別的節點重新建立', '暫停其他所有探針，直到就緒探針通過為止', '不重新啟動，只把容器標成未就緒：READY 變少、Ready 條件為 False'],
      answer: 3,
      explanation: 'readiness 只決定「現在能不能接工作」：失敗時容器被標成未就緒，READY 欄與 Ready 條件反映它，之後的 Service 會把它移出流量，但不會重啟。殺掉並重啟是 liveness（與 startup）失敗的後果；kubelet 不會刪除 Pod；暫停其他探針是 startup 探針還沒通過時的行為。',
    },
    {
      id: 'kub03-q4', prompt: '`kubectl events` 出現 `Liveness probe failed: HTTP probe failed with statuscode: 404`，接著是 `Container api failed liveness probe, will be restarted`。最可能的原因與後果是？',
      options: ['程式記憶體不足，被核心 OOMKilled 後重新啟動', '探針的路徑在程式裡不存在，連續失敗後 api 被殺掉重新啟動', '探針的埠沒有在聽，連線被拒絕，Pod 被標成未就緒但不會重啟', 'Image 的標籤寫錯，節點拉取失敗後重試'],
      answer: 1,
      explanation: '404 表示有連到程式，但它沒有這個路徑，通常是探針的 path 寫錯；liveness 連續失敗到 failureThreshold，kubelet 記下 Killing 並重啟容器。OOMKilled 會出現在 Last State 的 Reason；埠沒在聽是 connection refused，而且 liveness 失敗仍會重啟；拉取失敗是 ErrImagePull，不會有探針事件。',
    },
    {
      id: 'kub03-q5', prompt: 'Pod 有一個 init container 與一個 app 容器，restartPolicy 是 Always。init container 每次都以結束碼 1 結束，會看到什麼？',
      options: ['app 容器照常啟動，只有 init container 的 RESTARTS 增加', 'Pod 立刻變成 Failed，不再重試', 'STATUS 是 Init:CrashLoopBackOff，app 容器從來不會啟動', 'kubelet 跳過失敗的 init container，直接啟動 app 容器'],
      answer: 2,
      explanation: 'init container 必須依序全部成功，一般容器才會啟動；失敗時依 restartPolicy 重試（Always 與 OnFailure 都會），所以是 Init:Error 與 Init:CrashLoopBackOff 輪流，app 容器一直在等待。只有 restartPolicy 是 Never 時 Pod 才會直接 Failed；kubelet 不會跳過 init container。',
    },
    {
      id: 'kub03-q6', prompt: '直接建立的 Pod web 正在執行。你在 web.yaml 把 readinessProbe 的 path 改了，再執行 `kubectl apply -f web.yaml`。結果是？',
      options: ['API server 回 Forbidden：Pod 的探針不能就地修改，要刪除再建立', 'kubelet 立刻套用新的探針設定，容器不必重新啟動也不必重建', 'kubectl 自動刪除舊的 Pod 並建立新的，名稱與 IP 都不變，服務不中斷', '新的 path 存進 API，但要等容器下一次因故重新啟動時才生效'],
      answer: 0,
      explanation: 'Pod 的 spec 除了容器的 image、activeDeadlineSeconds、新增 tolerations 與 terminationGracePeriodSeconds 之外都不可變，apply 會得到 `spec: Forbidden: pod updates may not change fields …`，叢集裡的 Pod 維持原樣。kubectl 不會替你刪除重建（那是之後的 Deployment 做的事，而且新 Pod 的 IP 通常不同）；也不會先存起來等重啟。',
    },
    {
      id: 'kub03-q7', prompt: '一個 Java 服務啟動要 60–90 秒，設了 `livenessProbe`（periodSeconds 10、failureThreshold 3），結果總是還沒啟動完就被重新啟動。最好的修正是？',
      options: ['把 liveness 探針刪掉，改用 readiness 探針檢查同一個端點，啟動慢就不會被殺', '把 liveness 的 timeoutSeconds 改成 90 秒，讓每次探測都能等到啟動完成', '把 restartPolicy 改成 Never，容器被殺掉之後就不會再進入重啟循環', '加上 startupProbe（例如每 10 秒、最多 12 次），通過後才開始 liveness'],
      answer: 3,
      explanation: 'startupProbe 還沒通過時，liveness 與 readiness 都暫停；failureThreshold × periodSeconds（這裡 120 秒）給了足夠的啟動時間，啟動後 liveness 仍能偵測卡死。刪掉 liveness 會失去卡死時的自動重啟；timeoutSeconds 是單次探測的等待時間，不是啟動寬限；Never 只是讓被殺掉的容器不再回來。',
    },
    {
      id: 'kub03-q8', prompt: '`kubectl delete pod sleeper`（容器的主程序是 `sleep 3600`）每次都要等 30 秒左右才回到提示字元，原因是？',
      options: ['API server 要先把刪除同步寫進 etcd 的每個成員，這個步驟固定需要 30 秒', 'PID 1 沒處理 SIGTERM 而忽略它，kubelet 等滿 30 秒寬限期才送 SIGKILL', 'kubectl delete 的預設逾時就是 30 秒，每次都會等滿，與容器的程式無關', 'sleep 收到 SIGTERM 後會先把剩下的時間睡完，kubelet 只等前 30 秒'],
      answer: 1,
      explanation: '刪除時 kubelet 送 SIGTERM 給容器的 PID 1，在容器裡 PID 1 沒有自己的處理程式時會忽略這個訊號，所以要等 terminationGracePeriodSeconds（預設 30 秒）結束才被 SIGKILL。etcd 的寫入很快；kubectl delete 預設等到 Pod 消失，時間由容器決定；sleep 不會「睡完才結束」，它只是沒收到能讓它結束的訊號。',
    },
  ],
};
