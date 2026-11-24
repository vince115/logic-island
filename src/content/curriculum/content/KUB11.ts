/*
 * KUB11 Rolling updates and rollbacks (KUB-4, terminal-sim; the blueprint's cluster-sim activity as terminal content). A
 * terminal lesson on the kube-net profile (engine stages E32–E35): the made-up shop team's workstation ops-ws (user yuki)
 * with kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02). catalog runs as a
 * Deployment of 4 replicas behind the Service catalog (port 80 → http), with an httpGet readiness probe on /healthz;
 * toolbox is a client pod with curl. Image versions: 2.1 and 2.2 are healthy; 2.3 warms a price cache for 15 s (kube.health:
 * / and /healthz answer 503 until then); 2.4 never becomes ready (its responder's /healthz answers 503). report (2
 * replicas) uses Recreate. The HTTP responders answer with {{hostname}}, so transcripts show which pod answered; no check
 * depends on it. Covered: the RollingUpdate mechanics with maxSurge and maxUnavailable (rounding, a step table of a
 * 4-replica rollout for 25 %/25 % and 1/0), readiness gating traffic (Endpoints' notReadyAddresses) and progress,
 * minReadySeconds, progressDeadlineSeconds and ProgressDeadlineExceeded, rollout status's exit status, rollout history
 * and change-cause, undo and --to-revision (renumbering), pause/resume, restart, Recreate, what a rollback does not revert
 * (ConfigMaps, database migrations: CICD13) and canary / blue-green beyond Deployments (CICD10, KUB07's weighted routes) as
 * prose. Boot manifests are applied before the controllers run, so a machine starts with one revision: every history is
 * made by commands in the transcripts and exercises. Pod and ReplicaSet names are hashes: commands read them or use
 * labels. Hosts, users, images and the cluster are made up. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The shop's HTTP services: each answers on its port with a responder (id: the version without dots) that names the pod that answered.
const server = (name: string, port: number, created: string): TerminalImage => {
  const [app, version] = name.split('/')[1].split(':');
  return { name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
    http: { port, responder: `${app}-${version.replace('.', '')}` }, logs: [`${app} ${version} listening on :${port}`], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } } };
};
const IMAGES: TerminalImage[] = [
  server('shop/catalog:2.1', 8080, '2026-11-16 09:00:00'),
  server('shop/catalog:2.2', 8080, '2026-11-19 09:00:00'),
  server('shop/catalog:2.3', 8080, '2026-11-22 09:00:00'),
  server('shop/catalog:2.4', 8080, '2026-11-23 09:00:00'),
  server('shop/report:3.0', 9000, '2026-11-19 09:00:00'),
  server('shop/report:3.1', 9000, '2026-11-22 09:00:00'),
  // A client for debugging inside the cluster: its main process sleeps; it has curl.
  { name: 'shop/toolbox:1.0', size: 12_000_000, created: '2026-11-10 09:00:00', cmd: ['sleep', 'infinity'], service: true, layers: 2, osRelease: DEBIAN,
    commands: [...BASIC, 'curl', 'getent', 'nc'] },
];
const page = (app: string, version: string, health: { status?: number; body: string }) => ({
  id: `${app}-${version.replace('.', '')}`, server: `${app}/${version}`,
  routes: [{ path: '/', body: `${app} ${version} served by {{hostname}}\n`, type: 'text/plain' }, { path: '/healthz', ...health, type: 'text/plain' }],
});
const OK = { body: 'ok\n' };
// catalog 2.4 expects a pricing table the database does not have yet: its /healthz always answers 503, so it never becomes ready.
const RESPONDERS = [page('catalog', '2.1', OK), page('catalog', '2.2', OK), page('catalog', '2.3', OK), page('catalog', '2.4', { status: 503, body: 'pricing table missing\n' }),
  page('report', '3.0', OK), page('report', '3.1', OK)];
const WORKERS = ['node-01', 'node-02'];

type Catalog = { image: string; cause?: string; spec?: string[]; probe?: string[] };
// catalog: 4 replicas, container port 8080 named http, a readiness probe on /healthz every 5 s.
const HTTP_PROBE = ['readinessProbe:', '  httpGet:', '    path: /healthz', '    port: http', '  periodSeconds: 5'];
const TCP_PROBE = ['readinessProbe:', '  tcpSocket:', '    port: http', '  periodSeconds: 5'];
const catalogYaml = ({ image, cause, spec = [], probe = HTTP_PROBE }: Catalog) => yaml(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: catalog', '  labels:', '    app: catalog', ...cause ? ['  annotations:', `    kubernetes.io/change-cause: "${cause}"`] : [],
  'spec:', '  replicas: 4', ...spec.map(x => `  ${x}`), '  selector:', '    matchLabels:', '      app: catalog', '  template:', '    metadata:', '      labels:', '        app: catalog', '    spec:', '      containers:',
  '      - name: catalog', `        image: ${image}`, '        ports:', '        - name: http', '          containerPort: 8080', ...probe.map(x => `        ${x}`));
const rolling = (surge: number | string, unavailable: number | string) => ['strategy:', '  type: RollingUpdate', '  rollingUpdate:', `    maxSurge: ${surge}`, `    maxUnavailable: ${unavailable}`];
const CATALOG_SVC = yaml('apiVersion: v1', 'kind: Service', 'metadata:', '  name: catalog', 'spec:', '  selector:', '    app: catalog', '  ports:', '  - name: web', '    port: 80', '    targetPort: http');
const TOOLBOX = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: toolbox', 'spec:', '  containers:', '  - name: toolbox', '    image: shop/toolbox:1.0');
// report builds the sales reports from one queue and must never run two versions at once: Recreate.
const REPORT_YAML = yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: report', 'spec:', '  replicas: 2', '  strategy:', '    type: Recreate', '  selector:', '    matchLabels:', '      app: report',
  '  template:', '    metadata:', '      labels:', '        app: report', '    spec:', '      containers:', '      - name: report', '        image: shop/report:3.0');

// catalog 2.3 warms its price cache for 15 s after a start: its port accepts connections, but / and /healthz answer 503 until then.
const WARMUP = [{ image: 'shop/catalog:2.3', paths: [{ path: '/', status: 503, until: 15 }, { path: '/healthz', status: 503, until: 15 }] }];
const kubeOf = (manifests: TerminalKube['manifests']): TerminalKube => ({
  images: [{ name: 'shop/catalog:2.1', nodes: WORKERS }, { name: 'shop/catalog:2.2', nodes: WORKERS }, { name: 'shop/catalog:2.3', seconds: 2 }, { name: 'shop/catalog:2.4', seconds: 2 },
    { name: 'shop/report:3.0', nodes: WORKERS }, { name: 'shop/report:3.1', seconds: 2 }, { name: 'shop/toolbox:1.0', nodes: WORKERS }],
  health: WARMUP,
  manifests,
});
const at = (text: string, time: string, f = 'catalog.yaml') => ({ text, at: `2026-11-24 ${time}`, file: f });
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'kube-net', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  responders: RESPONDERS,
  docker: { images: IMAGES },
  kube,
});
const BASE = [at(TOOLBOX, '08:00:00', 'toolbox.yaml'), at(CATALOG_SVC, '08:05:00', 'catalog-svc.yaml')];

// The examples: catalog 2.2 runs with the default strategy (25 % / 25 %); report uses Recreate.
const DEADLINE = ['progressDeadlineSeconds: 120'];
const WS_22 = catalogYaml({ image: 'shop/catalog:2.2', cause: 'release 2.2', spec: DEADLINE });
// The zero-downtime version of the manifest: one extra pod at a time, never one fewer; a new pod counts after 10 s of readiness.
const ZERO_23 = catalogYaml({ image: 'shop/catalog:2.3', cause: 'release 2.3', spec: ['minReadySeconds: 10', ...DEADLINE, ...rolling(1, 0)] });
const WS = workstation('kub11-ws', 'ops-ws（shop 團隊的工作站：catalog 2.2 有 4 個副本，report 用 Recreate）',
  [file('/home/yuki/shop/catalog.yaml', WS_22), file('/home/yuki/shop/catalog-zero.yaml', ZERO_23), file('/home/yuki/shop/report.yaml', REPORT_YAML)],
  kubeOf([...BASE, at(WS_22, '09:30:00'), at(REPORT_YAML, '09:35:00', 'report.yaml')]));

// Exercise 1: catalog 2.2 with the default strategy and a tcpSocket readiness probe; 2.3 has to go out without losing capacity.
const TUNE_22 = catalogYaml({ image: 'shop/catalog:2.2', cause: 'release 2.2', spec: rolling('25%', '25%'), probe: TCP_PROBE });
const TUNE = workstation('kub11-tune', 'ops-ws（catalog 2.3 要上線：先調整滾動更新）', [file('/home/yuki/shop/catalog.yaml', TUNE_22)], kubeOf([...BASE, at(TUNE_22, '09:30:00')]));

// Exercise 2: catalog 2.3 with a zero-downtime strategy and a 90 s progress deadline; 2.4 (readiness 503) is about to be released.
const STALL_23 = catalogYaml({ image: 'shop/catalog:2.3', cause: 'release 2.3', spec: ['progressDeadlineSeconds: 90', ...rolling(1, 0)] });
const STALLED = workstation('kub11-stalled', 'ops-ws（要把 catalog 更新到 2.4）', [file('/home/yuki/shop/catalog.yaml', STALL_23)], kubeOf([...BASE, at(STALL_23, '09:30:00')]));

// Exercise 3: a rollback drill; the variant's catalog runs 2.1 instead of 2.2.
const drillKube = (image: string, cause: string) => kubeOf([...BASE, at(catalogYaml({ image, cause, spec: DEADLINE }), '09:30:00')]);
const DRILL = workstation('kub11-drill', 'ops-ws（回滾演練）', [], drillKube('shop/catalog:2.2', 'release 2.2'));

const SURGE_SED = "sed -i 's/maxSurge: 25%/maxSurge: 1/; s/maxUnavailable: 25%/maxUnavailable: 0/' shop/catalog.yaml";
const PROBE_SED = "sed -i 's|tcpSocket:|httpGet:\\n            path: /healthz|' shop/catalog.yaml";
const IMAGE_SED = "sed -i 's/catalog:2.2/catalog:2.3/; s/release 2.2/release 2.3/' shop/catalog.yaml";
const CAUSE_24 = "kubectl annotate deploy/catalog kubernetes.io/change-cause='release 2.4: new pricing' --overwrite";

export const KUB11: LessonContent = {
  lessonId: 'KUB11',
  motivation: 'catalog 2.3 要上線了。KUB04 已經知道，改了 Deployment 的 Pod 範本，就會多一個 ReplicaSet、一邊建立新版一邊刪除舊版。但「一邊」到底是幾個？如果新版的 Pod 已經 Running、程式卻還在載入價格快取，流量送過去會不會全是 503？如果新版根本起不來，舊版會不會已經被刪光？更新到一半發現新版有問題，要怎麼回到昨天那一版，回去之後資料庫和設定又會不會跟著回去？這些問題的答案都寫在 Deployment 的幾個欄位裡：`maxSurge` 與 `maxUnavailable` 決定更新的速度與同時可用的副本數，就緒探針決定新 Pod 什麼時候才算數、什麼時候才收流量，`minReadySeconds` 與 `progressDeadlineSeconds` 決定要觀察多久、等多久才判定失敗，`kubectl rollout history` 與 `kubectl rollout undo` 則記錄每一版並讓你退回去。這堂課在 shop 團隊的工作站 ops-ws 上，一步一步看 4 個副本的滾動更新怎麼交接，把 catalog 調成更新時不少任何一個副本，故意讓一次更新卡住、讀懂 ProgressDeadlineExceeded 再回滾，並比較 Recreate 策略與 Deployment 以外的金絲雀、藍綠部署。學完後能在不中斷服務的情況下更新與回滾應用。',
  sections: [
    {
      id: 'kub11-s-rolling', title: '滾動更新：新舊兩個 ReplicaSet 怎麼交接',
      blocks: [
        { type: 'p', text: 'Deployment 的 `spec.strategy.type` 預設是 `RollingUpdate`（滾動更新）。Pod 範本一改（`kubectl set image`，或改了 manifest 再 `kubectl apply`），Deployment 控制器就以新範本算出新的 pod-template-hash，建立新的 ReplicaSet（從 0 個開始），接著反覆做兩件事：把新的 ReplicaSet 調大、把舊的調小，直到新的有 `replicas` 個、舊的歸零。每一步能走多遠，由兩個參數限制：' },
        { type: 'table', head: ['參數', '意思', '預設', '4 個副本時換算'], rows: [
          ['`maxSurge`', '更新期間 Pod 總數最多可以比 `replicas` 多幾個（新舊合計）', '`25%`', '4 × 25% = 1，百分比向上取整，最多 5 個'],
          ['`maxUnavailable`', '更新期間最多可以有幾個副本不可用', '`25%`', '4 × 25% = 1，百分比向下取整，至少 3 個可用'],
        ] },
        { type: 'p', text: '兩者可以寫整數或百分比，但不能同時是 0（那樣既不能多開、也不能先關，更新無從開始，API server 直接拒絕）。「可用」是就緒而且維持了 `minReadySeconds`（預設 0）的 Pod。控制器擴大新 ReplicaSet 時，看的是總數不超過 `replicas + maxSurge`；縮小舊的時，看的是可用數不低於 `replicas − maxUnavailable`，而且先縮掉舊 ReplicaSet 裡本來就不健康的 Pod。所以新 Pod 遲遲不就緒時，舊的就不會再被縮，更新停在半路。' },
        { type: 'p', text: '下面的 catalog 有 4 個副本、沒有寫策略，所以是預設的 25%／25%，也就是多開 1 個、少 1 個都可以。catalog 2.3 啟動後要先花 15 秒載入價格快取，這段時間 `/healthz` 回 503，readiness 探針（每 5 秒檢查 `/healthz`）因此大約 15 秒後才通過。' },
        { type: 'example', id: 'kub11-rolling' },
        { type: 'p', text: '`set image` 的同一秒，控制器先把新的 ReplicaSet 擴到 1（總數 5，達到 maxSurge 的上限），再把舊的縮到 3（可用 3，達到 maxUnavailable 的下限），因為總數又降回 4，新的再擴到 2。之後每當新 Pod 就緒，就再縮舊的、擴新的。把兩種設定的 4 個副本更新逐步攤開（「可用」不算 Terminating 的 Pod）：' },
        { type: 'table', head: ['設定', '步驟', '發生的事', '舊 ReplicaSet', '新 ReplicaSet（就緒）', '可用'], rows: [
          ['maxSurge 1、maxUnavailable 1（預設 25%）', '1', '`set image` 的同一秒：新 0→1、舊 4→3、新 1→2', '3', '2（0）', '3'],
          ['', '2', '兩個新 Pod 就緒：舊 3→2、新 2→3、舊 2→1、新 3→4', '1', '4（2）', '3'],
          ['', '3', '另外兩個新 Pod 就緒：舊 1→0', '0', '4（4）', '4'],
          ['maxSurge 1、maxUnavailable 0', '1', '`set image` 的同一秒：新 0→1，舊的一個都不能少', '4', '1（0）', '4'],
          ['', '2', '第 1 個新 Pod 可用：舊 4→3、新 1→2', '3', '2（1）', '4'],
          ['', '3', '第 2 個可用：舊 3→2、新 2→3', '2', '3（2）', '4'],
          ['', '4', '第 3 個可用：舊 2→1、新 3→4', '1', '4（3）', '4'],
          ['', '5', '第 4 個可用：舊 1→0', '0', '4（4）', '4'],
        ] },
        { type: 'p', text: '預設的設定兩輪就換完（第一輪要先拉取 Image 再暖機，約 17 秒；第二輪的節點已經有 Image，約 15 秒），代價是更新期間只剩 3 個可用；maxUnavailable 0 每次只換一個，要四輪，但可用的副本從頭到尾都是 4 個。maxSurge 調大（例如 2 或 50%）能一次多開幾個、換得更快，但叢集要有放得下額外 Pod 的資源；maxSurge 0 搭配 maxUnavailable 1 則完全不需要額外資源，代價是更新期間少一個副本。注意範例最後的 `rollout history`：revision 2 的 CHANGE-CAUSE 仍然是「release 2.2」，因為 `set image` 不會改 `kubernetes.io/change-cause` 這個註解，第四節會處理它。' },
      ],
    },
    {
      id: 'kub11-s-zero', title: '不中斷服務：maxUnavailable 0 與就緒探針',
      blocks: [
        { type: 'p', text: '滾動更新只有在控制器知道「新 Pod 什麼時候能工作」時才安全，這個訊號就是就緒探針（readiness probe）。KUB03 與 KUB05 已經看過：readiness 沒通過的 Pod，READY 是 `0/1`，Endpoints 把它放在 `notReadyAddresses`，Service 不會把連線送給它。在滾動更新裡，同一個訊號還決定了進度：新 Pod 不就緒，就不算可用，舊 Pod 就不會被縮掉。' },
        { type: 'list', items: [
          '流量：Endpoints 只收就緒的 Pod，所以還在暖機的新版不會收到請求，舊版照常服務。',
          '進度：控制器以可用數決定能縮掉多少舊 Pod，新 Pod 不就緒，更新就停在原地，而不是把舊版刪光。',
          '`minReadySeconds`：新 Pod 就緒後還要穩定這麼多秒才算可用（AVAILABLE），用來擋住「剛啟動時看起來正常、幾秒後就當掉」的版本；這段時間它已經在 Endpoints 裡收流量。',
        ] },
        { type: 'p', text: 'shop/catalog-zero.yaml 是 catalog 的零中斷版本：`maxSurge: 1`、`maxUnavailable: 0`、`minReadySeconds: 10`，Image 換成 2.3。套用後，新 Pod 在暖機期間 `/healthz` 回 503，Endpoints 把它放在 NotReadyAddresses，連 `catalog` 的請求全部由 2.2 回答；它就緒之後才加入 Endpoints，開始和舊版一起回應，再過 10 秒才算可用，控制器這時才縮掉一個舊 Pod。' },
        { type: 'example', id: 'kub11-zero' },
        { type: 'p', text: '範例中途的 `kubectl get deploy catalog` 是 `5/4`、AVAILABLE `4`：5 個 Pod 就緒（4 個舊的加 1 個新的），但新的還在 `minReadySeconds` 的觀察期，可用的仍然只算 4 個舊的。更新期間同時有 2.2 與 2.3 在回應同一個 Service，這是滾動更新的本質：新舊版本必須能同時存在，API 與資料格式都要向前、向後相容，否則就要換策略。' },
        { type: 'table', head: ['設定', '速度', '更新期間的可用副本（4 個時）', '額外資源'], rows: [
          ['maxSurge 25%、maxUnavailable 25%（預設）', '中等：一輪換 2 個', '至少 3 個', '最多多 1 個 Pod'],
          ['maxSurge 1、maxUnavailable 0', '慢：一輪換 1 個', '一直是 4 個', '最多多 1 個 Pod'],
          ['maxSurge 0、maxUnavailable 1', '慢：一輪換 1 個', '至少 3 個', '不需要'],
          ['maxSurge 100%、maxUnavailable 0', '快：一次開齊新版', '一直是 4 個', '暫時需要兩倍的 Pod'],
        ] },
        { type: 'callout', tone: 'warning', title: '沒有就緒探針，Running 就等於可以接流量', text: '常見的誤解是「設了 maxUnavailable 0 就不會中斷」。沒有 readiness 探針時，容器一啟動 Pod 就被當成就緒：它馬上進入 Endpoints 收流量，控制器也馬上把它算成可用、縮掉一個舊 Pod。catalog 2.3 前 15 秒只會回 503，這段時間打到新 Pod 的請求全部失敗，而更新還會很快「成功」完成。只檢查連接埠的 `tcpSocket` 探針也一樣：程式一開始聆聽就通過，不管它是不是真的能服務。要讓更新不中斷，探針必須檢查應用真正的健康狀態（例如會在暖機、連不到資料庫時回 503 的 `/healthz`），而且三件事要一起設定：探針、`maxUnavailable: 0`（或可以接受的值），以及足夠的副本數。' },
      ],
    },
    {
      id: 'kub11-s-stall', title: '卡住的更新：progressDeadlineSeconds 與 ProgressDeadlineExceeded',
      blocks: [
        { type: 'p', text: '新版本起不來時，滾動更新不會自己結束，也不會自己退回：新 Pod 一直不就緒，舊 Pod 就一直不縮，Deployment 停在新舊並存的狀態。Kubernetes 用 `progressDeadlineSeconds`（預設 600 秒）判斷「卡住」：Deployment 的 Progressing 條件記著最後一次有進展的時間（新 Pod 增加、舊 Pod 減少、就緒或可用的數量增加），超過這個秒數沒有任何進展，Progressing 就變成 False，原因是 `ProgressDeadlineExceeded`。' },
        { type: 'p', text: 'catalog 2.4 改用新的定價表，但資料庫還沒有這張表，所以它的 `/healthz` 永遠回 503。下面在預設策略（25%／25%）的 catalog 上更新到 2.4；它的 manifest 寫了 `progressDeadlineSeconds: 120`，兩分鐘沒有進展就判定失敗。' },
        { type: 'example', id: 'kub11-stall' },
        { type: 'p', text: '因為 maxUnavailable 是 1，更新一開始就縮掉了一個舊 Pod，接下來新的兩個永遠不就緒，Deployment 停在 `3/4`：服務沒有中斷，但少了四分之一的容量，直到有人處理。若策略是 maxUnavailable 0，就會維持 4 個 2.2 繼續服務，這正是下一題練習的情況。`kubectl rollout status` 在期限到了時印出 `error: deployment "catalog" exceeded its progress deadline` 並以狀態碼 1 結束，CI/CD 的部署步驟就靠這個狀態碼判斷失敗；Deployment 本身不會自動回滾，回滾要由人或部署工具執行。' },
        { type: 'table', head: ['卡住的樣子', '常見原因', '從哪裡看出來'], rows: [
          ['新 Pod `ImagePullBackOff`／`ErrImagePull`', 'Image 名稱或標籤打錯、私有 Registry 沒有權限', '`kubectl get pods`、`kubectl describe pod` 的 Events'],
          ['新 Pod `Running` 但 `0/1`', 'readiness 探針一直失敗：設定、依賴的服務或資料庫不對', '`kubectl events --types=Warning` 的 Unhealthy、`describe ep` 的 NotReadyAddresses'],
          ['新 Pod `CrashLoopBackOff`', '程式一啟動就結束：缺環境變數、設定錯誤', '`kubectl logs --previous`'],
          ['新 Pod `Pending`', '節點放不下 maxSurge 多開的 Pod（資源不足）', '`kubectl describe pod` 的 FailedScheduling'],
        ] },
        { type: 'p', text: '判斷之後的處理通常是先回滾、恢復容量，再慢慢修：`kubectl rollout undo deploy/catalog` 回到上一個 revision，舊的 ReplicaSet 重新擴大，壞掉的新 Pod 被刪除。回滾本身也是一次滾動更新，同樣受 maxSurge 與 maxUnavailable 的限制，也同樣要用 `rollout status` 等它完成。' },
      ],
    },
    {
      id: 'kub11-s-history', title: 'rollout history、rollout undo、pause 與 restart',
      blocks: [
        { type: 'p', text: '每一個曾經使用過的 Pod 範本都留著一個 ReplicaSet，它的註解 `deployment.kubernetes.io/revision` 就是 revision 號碼；舊的 ReplicaSet 縮到 0 但不刪除，最多保留 `revisionHistoryLimit` 個（預設 10），這就是 `kubectl rollout history` 列出來的歷史，也是 `kubectl rollout undo` 能退回去的範圍。' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`kubectl rollout history deploy/catalog`', '列出 REVISION 與 CHANGE-CAUSE'],
          ['`kubectl rollout history deploy/catalog --revision=2`', '印出那個 revision 的 Pod 範本（Image、探針、環境變數）'],
          ['`kubectl rollout undo deploy/catalog`', '回到上一個 revision'],
          ['`kubectl rollout undo deploy/catalog --to-revision=2`', '回到指定的 revision'],
          ['`kubectl rollout pause`／`resume`', '暫停：範本可以一直改，但不會開始更新；恢復後所有改動合成一次更新'],
          ['`kubectl rollout restart deploy/catalog`', '在範本加上 `kubectl.kubernetes.io/restartedAt` 註解，觸發一次範本不變的滾動重啟'],
        ] },
        { type: 'p', text: 'CHANGE-CAUSE 來自 Deployment 的註解 `kubernetes.io/change-cause`：控制器把 Deployment 的註解複製到目前的 ReplicaSet，所以要在每次更新時一起改它，manifest 裡直接寫，或在 `set image` 之後立刻 `kubectl annotate deploy/catalog kubernetes.io/change-cause=\'release 2.3\' --overwrite`。舊教學裡的 `--record` 旗標已經棄用，不要依賴它。沒有更新這個註解，新的 revision 會沿用上一次的文字，歷史就會說謊，第一節範例的 revision 2 就是這樣。' },
        { type: 'p', text: 'undo 做的事是把那個 revision 的 Pod 範本（連同它的 change-cause）放回 Deployment，於是那個舊的 ReplicaSet 重新擴大、成為「最新」的 revision，拿到一個新的號碼，原本的號碼從清單上消失。所以回滾之後，歷史裡不會再有原本的 revision 1，`--to-revision=1` 也找不到；要退回某個版本，先用 `rollout history --revision=N` 確認它的 Image，再用當下的號碼。' },
        { type: 'example', id: 'kub11-history' },
        { type: 'p', text: '暫停期間 `set image` 先打錯成 2.4、再改成 2.3，都沒有建立新的 ReplicaSet；`resume` 之後只產生一個 revision 2，打錯的 2.4 從來沒有一個 Pod 跑起來。這就是 pause 的用途：要改好幾個地方（Image、探針、資源限制）時，先暫停，全部改完再恢復，只做一次滾動更新、只留一筆歷史。暫停時 `rollout undo` 與 `rollout restart` 會被拒絕。`rollout restart` 不改 Image，只改一個註解，讓每個 Pod 依滾動更新的規則換新，常用在 Pod 需要重新讀取以環境變數注入的設定時（KUB06）；它也會產生一個新的 revision。' },
      ],
    },
    {
      id: 'kub11-s-recreate', title: 'Recreate 策略，以及回滾回不去的東西',
      blocks: [
        { type: 'p', text: '滾動更新的前提是新舊版本可以同時執行。做不到的時候，例如 report 這種從同一個佇列依序處理工作、兩個版本同時讀寫會出錯的服務，或是同一時間只能有一個程式掛載某個磁碟的應用，就用 `strategy.type: Recreate`：先把舊 ReplicaSet 縮到 0，等舊 Pod 全部結束（包括 Terminating 的），才建立新的。代價是中間有一段時間一個副本都沒有，服務會中斷。' },
        { type: 'example', id: 'kub11-recreate' },
        { type: 'table', head: ['策略', '新舊同時存在', '更新期間的容量', '適合'], rows: [
          ['RollingUpdate', '會', '依 maxSurge／maxUnavailable，可以做到不減少', '無狀態、版本互相相容的服務（大部分的 Web 與 API）'],
          ['Recreate', '不會', '中間歸零，有停機', '不能兩版並存的工作程式、開發環境、可以接受短暫停機的服務'],
        ] },
        { type: 'p', text: '回滾也要知道它的邊界。`kubectl rollout undo` 只是把 Deployment 的 Pod 範本換回舊的：Image、指令、探針、環境變數的寫法、Volume 的掛載方式。範本以外的東西都不會跟著回去：' },
        { type: 'list', items: [
          'ConfigMap 與 Secret 的內容（KUB06）：範本只寫「掛載哪一個 ConfigMap」，改的是 ConfigMap 本身時，回滾後的 Pod 讀到的仍然是新內容。要能回滾設定，就把設定版本化，例如每版用不同名稱的 ConfigMap（`catalog-config-v7`），範本指向它。',
          '資料庫結構與資料：新版本執行過的遷移（新增、刪除、改名欄位）不會因為回滾而復原。CICD13 的教訓在這裡一樣適用：遷移要先擴充、確定不再回滾後才收縮，舊版本才回得去。',
          'PersistentVolume 裡的檔案、送出去的訊息、外部系統的狀態，以及 Service、Ingress 等其他物件。',
        ] },
        { type: 'callout', tone: 'warning', title: '「undo 會把一切恢復原狀」是錯的', text: '回滾只恢復 Pod 範本。如果 2.4 在啟動時把 `price` 欄位改名成 `unit_price`，`rollout undo` 換回 2.3 之後，2.3 仍然去讀已經不存在的 `price`，回滾後一樣壞。發布前就要確認「這一版能不能被回滾」：遷移是否只擴充、設定是否另存新版本、功能是否能用旗標關掉；做不到時，要準備的是向前修復的計畫，而不是期待 undo 救命。' },
      ],
    },
    {
      id: 'kub11-s-beyond', title: 'Deployment 之外：金絲雀與藍綠部署',
      blocks: [
        { type: 'p', text: 'Deployment 內建的只有 RollingUpdate 與 Recreate。CICD10 的部署模擬器比較過的另外兩種策略，在 Kubernetes 上要用幾個物件組合出來：' },
        { type: 'table', head: ['策略', '在 Kubernetes 上的做法', '回滾的方式'], rows: [
          ['金絲雀（canary）', '兩個 Deployment（例如 `catalog-stable` 9 個、`catalog-canary` 1 個）都帶 `app: catalog`，Service 依副本比例分流；要精確的百分比，用 KUB07 的 Gateway API HTTPRoute 以加權的 `backendRefs` 分給兩個 Service', '把 canary 縮到 0，或把權重改回 0'],
          ['藍綠（blue-green）', '兩個完整的 Deployment（`catalog-blue`、`catalog-green`），Service 的選擇器指向其中一個（`version: blue`）；綠色全部就緒、驗證過後，改選擇器一次切換', '把選擇器改回 blue，舊環境還在，立刻生效'],
        ] },
        { type: 'p', text: '用 Pod 數量分流的金絲雀很粗糙：1 個 canary 加 9 個 stable 才是約 10%，而且比例會隨擴縮改變；加權路由可以不看副本數，直接指定 5%、25%、100% 的步驟。每一步之後觀察錯誤率與延遲（KUB12、KUB13 的指標），不合格就退回，這正是 CICD10 的閘門。藍綠部署要兩倍的資源，換來的是一次切換與立即回滾。把這些步驟自動化（逐步調整權重、讀取指標、自動中止）的工具通常稱為漸進式交付（progressive delivery）控制器，它們以自訂資源描述步驟，原理與本課相同：新舊版本並存、以就緒與指標判斷、出問題就把流量切回去。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, TUNE, STALLED, DRILL],
    examples: [
      {
        id: 'kub11-rolling', title: '預設的 25%／25%：4 個副本兩輪換完', machine: 'kub11-ws',
        description: 'catalog 沒有寫策略。set image 之後立刻看兩個 ReplicaSet，17 秒後新的兩個就緒、又換了一輪；事件依序記下每一次擴縮。',
        steps: [
          { command: 'kubectl get deploy,rs -l app=catalog', output: "NAME                      READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/catalog   4/4       4            4           30m\n\nNAME                                 DESIRED   CURRENT   READY     AGE\nreplicaset.apps/catalog-dkb749fq6s   4         4         4         30m" },
          { command: 'kubectl describe deploy catalog | grep Strategy', output: "StrategyType:           RollingUpdate\nRollingUpdateStrategy:  25% max unavailable, 25% max surge" },
          { command: 'kubectl set image deploy/catalog catalog=shop/catalog:2.3', output: "deployment.apps/catalog image updated" },
          { command: 'kubectl get rs -l app=catalog', output: "NAME                 DESIRED   CURRENT   READY     AGE\ncatalog-dkb749fq6s   3         3         3         30m\ncatalog-s89xlv6j6w   2         2         0         0s" },
          { command: 'kubectl get pods -l app=catalog', output: "NAME                       READY     STATUS              RESTARTS   AGE\ncatalog-dkb749fq6s-fxq7z   1/1       Terminating         0          30m\ncatalog-dkb749fq6s-gb7wc   1/1       Running             0          30m\ncatalog-dkb749fq6s-gh5km   1/1       Running             0          30m\ncatalog-dkb749fq6s-xcf2j   1/1       Running             0          30m\ncatalog-s89xlv6j6w-fg4mf   0/1       ContainerCreating   0          0s\ncatalog-s89xlv6j6w-nq5vr   0/1       ContainerCreating   0          0s" },
          { command: 'sleep 17', output: "" },
          { command: 'kubectl get rs -l app=catalog', output: "NAME                 DESIRED   CURRENT   READY     AGE\ncatalog-dkb749fq6s   1         1         1         30m\ncatalog-s89xlv6j6w   4         4         2         17s" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 1 old replicas are pending termination...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl events --for deploy/catalog', output: "LAST SEEN   TYPE      REASON              OBJECT               MESSAGE\n30m         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-dkb749fq6s from 0 to 4\n32s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-s89xlv6j6w from 0 to 1\n32s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-dkb749fq6s from 4 to 3\n32s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-s89xlv6j6w from 1 to 2\n15s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-dkb749fq6s from 3 to 2\n15s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-s89xlv6j6w from 2 to 3\n15s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-dkb749fq6s from 2 to 1\n15s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-s89xlv6j6w from 3 to 4\n0s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-dkb749fq6s from 1 to 0" },
          { command: 'kubectl get rs -l app=catalog -o wide', output: "NAME                 DESIRED   CURRENT   READY     AGE       CONTAINERS   IMAGES             SELECTOR\ncatalog-dkb749fq6s   0         0         0         30m       catalog      shop/catalog:2.2   app=catalog,pod-template-hash=dkb749fq6s\ncatalog-s89xlv6j6w   4         4         4         32s       catalog      shop/catalog:2.3   app=catalog,pod-template-hash=s89xlv6j6w" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n1         release 2.2\n2         release 2.2\n" },
        ],
      },
      {
        id: 'kub11-zero', title: 'maxUnavailable 0：新 Pod 暖機時不收流量', machine: 'kub11-ws',
        description: '套用零中斷版本的 manifest。暖機中的新 Pod 回 503，Endpoints 把它放在 NotReadyAddresses；就緒後才加入回應，再過 minReadySeconds 才算可用、換掉一個舊 Pod。',
        steps: [
          { command: 'grep -B 1 -A 6 minReadySeconds shop/catalog-zero.yaml', output: "  replicas: 4\n  minReadySeconds: 10\n  progressDeadlineSeconds: 120\n  strategy:\n    type: RollingUpdate\n    rollingUpdate:\n      maxSurge: 1\n      maxUnavailable: 0" },
          { command: 'kubectl apply -f shop/catalog-zero.yaml', output: "deployment.apps/catalog configured" },
          { command: 'kubectl get rs -l app=catalog', output: "NAME                 DESIRED   CURRENT   READY     AGE\ncatalog-dkb749fq6s   4         4         4         30m\ncatalog-s89xlv6j6w   1         1         0         0s" },
          { command: 'sleep 10', output: "" },
          { command: 'kubectl get pods -l app=catalog -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-dkb749fq6s-fxq7z   1/1       Running   0          30m       10.244.1.3   node-01   <none>           <none>\ncatalog-dkb749fq6s-gb7wc   1/1       Running   0          30m       10.244.2.3   node-02   <none>           <none>\ncatalog-dkb749fq6s-gh5km   1/1       Running   0          30m       10.244.2.2   node-02   <none>           <none>\ncatalog-dkb749fq6s-xcf2j   1/1       Running   0          30m       10.244.1.4   node-01   <none>           <none>\ncatalog-s89xlv6j6w-fg4mf   0/1       Running   0          10s       10.244.2.5   node-02   <none>           <none>" },
          { command: "kubectl exec toolbox -- sh -c 'curl -si http://10.244.2.5:8080/healthz | head -n 1'", output: "HTTP/1.1 503 Service Unavailable" },
          { command: 'kubectl describe ep catalog | grep Addresses', output: "  Addresses:          10.244.1.3,10.244.1.4,10.244.2.2,10.244.2.3\n  NotReadyAddresses:  10.244.2.5" },
          { command: "kubectl exec toolbox -- sh -c 'for i in 1 2 3 4; do curl -s catalog; done'", output: "catalog 2.2 served by catalog-dkb749fq6s-fxq7z\ncatalog 2.2 served by catalog-dkb749fq6s-xcf2j\ncatalog 2.2 served by catalog-dkb749fq6s-gh5km\ncatalog 2.2 served by catalog-dkb749fq6s-gb7wc" },
          { command: 'sleep 7', output: "" },
          { command: 'kubectl get deploy catalog', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   5/4       1            4           30m" },
          { command: 'kubectl describe ep catalog | grep Addresses', output: "  Addresses:          10.244.1.3,10.244.1.4,10.244.2.2,10.244.2.3,10.244.2.5\n  NotReadyAddresses:  <none>" },
          { command: "kubectl exec toolbox -- sh -c 'for i in 1 2 3 4 5; do curl -s catalog; done'", output: "catalog 2.3 served by catalog-s89xlv6j6w-fg4mf\ncatalog 2.2 served by catalog-dkb749fq6s-fxq7z\ncatalog 2.2 served by catalog-dkb749fq6s-xcf2j\ncatalog 2.2 served by catalog-dkb749fq6s-gh5km\ncatalog 2.2 served by catalog-dkb749fq6s-gb7wc" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 1 out of 4 new replicas have been updated...\nWaiting for deployment \"catalog\" rollout to finish: 2 out of 4 new replicas have been updated...\nWaiting for deployment \"catalog\" rollout to finish: 3 out of 4 new replicas have been updated...\nWaiting for deployment \"catalog\" rollout to finish: 1 old replicas are pending termination...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl get deploy,rs -l app=catalog', output: "NAME                      READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/catalog   4/4       4            4           31m\n\nNAME                                 DESIRED   CURRENT   READY     AGE\nreplicaset.apps/catalog-dkb749fq6s   0         0         0         31m\nreplicaset.apps/catalog-s89xlv6j6w   4         4         4         104s" },
        ],
      },
      {
        id: 'kub11-stall', title: '2.4 永遠不就緒：等到 ProgressDeadlineExceeded，再回滾', machine: 'kub11-ws',
        description: '更新到 2.4 並記下 change-cause。新 Pod 的 readiness 一直回 503，不在 Endpoints 裡；兩分鐘沒有進展後 rollout status 以狀態碼 1 結束，Progressing 變成 False。rollout undo 回到 2.2，歷史裡的 revision 1 變成 3。',
        steps: [
          { command: 'kubectl set image deploy/catalog catalog=shop/catalog:2.4', output: "deployment.apps/catalog image updated" },
          { command: CAUSE_24, output: "deployment.apps/catalog annotated" },
          { command: 'sleep 30', output: "" },
          { command: 'kubectl get pods -l app=catalog -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-dkb749fq6s-gb7wc   1/1       Running   0          30m       10.244.2.3   node-02   <none>           <none>\ncatalog-dkb749fq6s-gh5km   1/1       Running   0          30m       10.244.2.2   node-02   <none>           <none>\ncatalog-dkb749fq6s-xcf2j   1/1       Running   0          30m       10.244.1.4   node-01   <none>           <none>\ncatalog-rl44hrhxxb-5w6q6   0/1       Running   0          30s       10.244.1.6   node-01   <none>           <none>\ncatalog-rl44hrhxxb-m528x   0/1       Running   0          30s       10.244.2.5   node-02   <none>           <none>" },
          { command: 'kubectl describe ep catalog | grep Addresses', output: "  Addresses:          10.244.1.4,10.244.2.2,10.244.2.3\n  NotReadyAddresses:  10.244.1.6,10.244.2.5" },
          { command: 'kubectl events --types=Warning', output: "LAST SEEN          TYPE      REASON      OBJECT                         MESSAGE\n3s (x6 over 28s)   Warning   Unhealthy   Pod/catalog-rl44hrhxxb-m528x   Readiness probe failed: HTTP probe failed with statuscode: 503\n3s (x6 over 28s)   Warning   Unhealthy   Pod/catalog-rl44hrhxxb-5w6q6   Readiness probe failed: HTTP probe failed with statuscode: 503" },
          { command: 'kubectl exec toolbox -- curl -s http://10.244.2.5:8080/healthz', output: "pricing table missing" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 2 out of 4 new replicas have been updated...\nerror: deployment \"catalog\" exceeded its progress deadline" },
          { command: 'echo $?', output: "1" },
          { command: 'kubectl get deploy catalog', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   3/4       2            3           32m" },
          { command: 'kubectl describe deploy catalog | grep -A 4 Conditions', output: "Conditions:\n  Type           Status  Reason\n  ----           ------  ------\n  Available      True    MinimumReplicasAvailable\n  Progressing    False   ProgressDeadlineExceeded" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n1         release 2.2\n2         release 2.4: new pricing\n" },
          { command: 'kubectl rollout undo deploy/catalog', output: "deployment.apps/catalog rolled back" },
          { command: 'kubectl rollout status deploy/catalog', output: "deployment \"catalog\" successfully rolled out" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n2         release 2.4: new pricing\n3         release 2.2\n" },
          { command: 'kubectl get deploy catalog -o wide', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE       CONTAINERS   IMAGES             SELECTOR\ncatalog   4/4       4            4           32m       catalog      shop/catalog:2.2   app=catalog" },
        ],
      },
      {
        id: 'kub11-history', title: '暫停時改兩次、只留一個 revision；restart 與 undo --to-revision', machine: 'kub11-ws',
        description: '暫停之後 set image 打錯又改正，ReplicaSet 沒有變；恢復後只有一次更新。rollout restart 觸發範本不變的重啟；undo --to-revision=1 之後，revision 1 變成 4，原本的號碼就找不到了。',
        steps: [
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n1         release 2.2\n" },
          { command: 'kubectl rollout pause deploy/catalog', output: "deployment.apps/catalog paused" },
          { command: 'kubectl set image deploy/catalog catalog=shop/catalog:2.4', output: "deployment.apps/catalog image updated" },
          { command: 'kubectl get rs -l app=catalog', output: "NAME                 DESIRED   CURRENT   READY     AGE\ncatalog-dkb749fq6s   4         4         4         30m" },
          { command: 'kubectl set image deploy/catalog catalog=shop/catalog:2.3', output: "deployment.apps/catalog image updated" },
          { command: "kubectl annotate deploy/catalog kubernetes.io/change-cause='release 2.3' --overwrite", output: "deployment.apps/catalog annotated" },
          { command: 'kubectl rollout undo deploy/catalog', output: "error: you cannot rollback a paused deployment; resume it first with 'kubectl rollout resume deployment.apps/catalog' and try again" },
          { command: 'kubectl rollout resume deploy/catalog', output: "deployment.apps/catalog resumed" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 2 out of 4 new replicas have been updated...\nWaiting for deployment \"catalog\" rollout to finish: 1 old replicas are pending termination...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n1         release 2.2\n2         release 2.3\n" },
          { command: 'kubectl rollout history deploy/catalog --revision=1 | grep Image', output: "    Image:         shop/catalog:2.2" },
          { command: 'kubectl rollout restart deploy/catalog', output: "deployment.apps/catalog restarted" },
          { command: "kubectl get deploy catalog -o jsonpath='{.spec.template.metadata.annotations}{\"\\n\"}'", output: "{\"kubectl.kubernetes.io/restartedAt\":\"2026-11-24T10:00:32Z\"}" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 2 out of 4 new replicas have been updated...\nWaiting for deployment \"catalog\" rollout to finish: 1 old replicas are pending termination...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n1         release 2.2\n2         release 2.3\n3         release 2.3\n" },
          { command: 'kubectl rollout undo deploy/catalog --to-revision=1', output: "deployment.apps/catalog rolled back" },
          { command: 'kubectl rollout status deploy/catalog', output: "deployment \"catalog\" successfully rolled out" },
          { command: 'kubectl rollout history deploy/catalog', output: "deployment.apps/catalog \nREVISION  CHANGE-CAUSE\n2         release 2.3\n3         release 2.3\n4         release 2.2\n" },
          { command: 'kubectl rollout undo deploy/catalog --to-revision=1', output: "error: unable to find specified revision 1 in history" },
        ],
      },
      {
        id: 'kub11-recreate', title: 'Recreate：先全部停掉，再全部建立', machine: 'kub11-ws',
        description: 'report 的策略是 Recreate。set image 之後兩個舊 Pod 同時 Terminating，結束之後才建立新的 ReplicaSet；中間有一段時間沒有任何 report 在執行。',
        steps: [
          { command: 'kubectl describe deploy report | grep Strategy', output: "StrategyType:       Recreate" },
          { command: 'kubectl set image deploy/report report=shop/report:3.1', output: "deployment.apps/report image updated" },
          { command: 'kubectl get pods -l app=report', output: "NAME                      READY     STATUS        RESTARTS   AGE\nreport-bwcz4twrs7-h49zb   1/1       Terminating   0          25m\nreport-bwcz4twrs7-hw4pc   1/1       Terminating   0          25m" },
          { command: 'sleep 1', output: "" },
          { command: 'kubectl get pods -l app=report', output: "NAME                      READY     STATUS              RESTARTS   AGE\nreport-8gwc9m6cq8-wkrlf   0/1       ContainerCreating   0          0s\nreport-8gwc9m6cq8-xtw78   0/1       ContainerCreating   0          0s" },
          { command: 'kubectl rollout status deploy/report', output: "Waiting for deployment \"report\" rollout to finish: 0 of 2 updated replicas are available...\ndeployment \"report\" successfully rolled out" },
          { command: 'kubectl events --for deploy/report', output: "LAST SEEN   TYPE      REASON              OBJECT              MESSAGE\n25m         Normal    ScalingReplicaSet   Deployment/report   Scaled up replica set report-bwcz4twrs7 from 0 to 2\n3s          Normal    ScalingReplicaSet   Deployment/report   Scaled down replica set report-bwcz4twrs7 from 2 to 0\n2s          Normal    ScalingReplicaSet   Deployment/report   Scaled up replica set report-8gwc9m6cq8 from 0 to 2" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub11-ex-zero', title: '把 catalog 調成不中斷的更新，再上線 2.3', machine: 'kub11-tune',
        statement: 'catalog 目前是 2.2，`~/shop/catalog.yaml` 寫著預設的 `maxSurge: 25%`、`maxUnavailable: 25%`，readiness 探針只用 `tcpSocket` 檢查連接埠。catalog 2.3 啟動後要暖機 15 秒，這段時間連接埠已經在聽，`/` 與 `/healthz` 卻都回 503。修改這個檔案，讓這次更新不中斷：`maxSurge` 改成 1、`maxUnavailable` 改成 0，readiness 探針改用 `httpGet`（連接埠仍是 `http`，路徑建議 `/healthz`），Image 改成 `shop/catalog:2.3`，change-cause 改成 `release 2.3`。用一次 `kubectl apply` 套用（只產生一個新的 revision），並等到更新完成。',
        checks: [
          { kind: 'kube-object', resource: 'Deployment', name: 'catalog', fields: [{ path: '.spec.strategy.rollingUpdate.maxSurge', equals: '1' }, { path: '.spec.strategy.rollingUpdate.maxUnavailable', equals: '0' },
            { path: '.spec.template.spec.containers[0].readinessProbe.httpGet.port', equals: 'http' }] },
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', image: 'shop/catalog:2.3', revision: 2, readyReplicas: 4 },
          { kind: 'kube-rollout', name: 'catalog', complete: true, changeCause: 'release 2.3' },
        ],
        solution: ['grep -A 4 strategy: shop/catalog.yaml', 'grep -A 3 readinessProbe shop/catalog.yaml', SURGE_SED, PROBE_SED, IMAGE_SED, 'kubectl apply -f shop/catalog.yaml', 'kubectl rollout status deploy/catalog'],
        mistakes: [
          { commands: [SURGE_SED, IMAGE_SED, 'kubectl apply -f shop/catalog.yaml', 'kubectl rollout status deploy/catalog'], why: '探針還是 tcpSocket：2.3 一開始聆聽就算就緒，暖機中回 503 的 Pod 立刻收流量，舊 Pod 也立刻被換掉' },
          { commands: [SURGE_SED, PROBE_SED, IMAGE_SED, 'kubectl apply -f shop/catalog.yaml'], why: '套用之後沒有等待：一次只換一個、每個要暖機，檢查時更新還在進行，新版還沒有 4 個就緒' },
          { commands: ["sed -i 's/maxSurge: 25%/maxSurge: 0/; s/maxUnavailable: 25%/maxUnavailable: 0/' shop/catalog.yaml", PROBE_SED, IMAGE_SED, 'kubectl apply -f shop/catalog.yaml'], why: 'maxSurge 與 maxUnavailable 都是 0，更新無法開始，API server 拒絕這個 Deployment，什麼都沒有改變' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog'], why: '只換了 Image：策略仍是 25%／25%、探針仍是 tcpSocket，manifest 也沒有改，下次 apply 還會把 Image 改回 2.2' },
          { commands: [SURGE_SED, "sed -i 's|tcpSocket:|httpGet:\\n            path: /health|' shop/catalog.yaml", IMAGE_SED, 'kubectl apply -f shop/catalog.yaml', 'kubectl rollout status deploy/catalog --timeout=60s'], why: '探針的路徑打成 /health，2.3 回 404，新 Pod 永遠不就緒；因為 maxUnavailable 是 0，2.2 照常服務，但更新卡住不會完成' },
        ],
        hints: [
          '`grep -A 4 strategy: shop/catalog.yaml` 與 `grep -A 3 readinessProbe shop/catalog.yaml` 先看要改的地方。',
          '`sed -i \'s/maxSurge: 25%/maxSurge: 1/; s/maxUnavailable: 25%/maxUnavailable: 0/\' shop/catalog.yaml` 一次改兩個值；Image 與 change-cause 也能用同樣的方式取代。',
          '探針：`sed -i \'s/tcpSocket:/httpGet:/\' shop/catalog.yaml` 就是 HTTP 探針（沒有寫 path 時是 `/`）；要加上 `path: /healthz` 這一行，可以在 sed 的取代文字裡用 `\\n` 換行：`\'s|tcpSocket:|httpGet:\\n            path: /healthz|\'`（`|` 當分隔符號就不必跳脫 `/`）。',
          '`kubectl apply -f shop/catalog.yaml` 之後用 `kubectl rollout status deploy/catalog` 等它完成；一次只換一個、每個要暖機，大約要一分多鐘（模擬環境裡時間會直接前進）。',
        ],
        explanation: '不中斷的更新要三件事一起成立。`maxUnavailable: 0` 讓控制器不能先縮舊 Pod，`maxSurge: 1` 讓它每次多開一個新的，可用的副本因此一直是 4 個。readiness 探針決定「新 Pod 什麼時候可用」：`tcpSocket` 只要連接埠在聽就通過，2.3 暖機的 15 秒裡雖然回 503，仍會被加進 Endpoints、被算成可用，控制器隨即縮掉舊 Pod，使用者就會看到錯誤；改成 `httpGet` 檢查 `/healthz`（或 `/`），新 Pod 要等暖機結束才就緒。Image、change-cause、策略與探針寫在同一份 manifest、一次 apply，Pod 範本只改變一次，所以只多了 revision 2，CHANGE-CAUSE 是 release 2.3；`kubectl rollout status` 一直等到 4 個 2.3 都可用、舊的歸零。兩個參數都寫 0 會被拒絕，探針路徑寫錯則讓更新卡住。',
      },
      {
        id: 'kub11-ex-undo', title: '2.4 卡住了：判斷之後回滾到上一個 revision', machine: 'kub11-stalled',
        statement: '發布小組要把 catalog 從 2.3 更新到 `shop/catalog:2.4`。執行更新，並把 change-cause 記成 `release 2.4: new pricing`。catalog 的 `progressDeadlineSeconds` 是 90 秒、策略是 maxSurge 1／maxUnavailable 0：如果 2.4 在期限內沒有完成，Deployment 會被判定為 ProgressDeadlineExceeded。等到期限過了，查出原因，然後用 `kubectl rollout undo` 回到 2.3 那個 revision，讓 catalog 回到 4 個就緒的 2.3，`rollout history` 目前的 CHANGE-CAUSE 也要是 `release 2.3`。（參考解答的每個指令都要成功結束，所以等待期限請用 `sleep`，而不是會以狀態碼 1 結束的 `rollout status`。）',
        checks: [
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', image: 'shop/catalog:2.3', revision: 3, readyReplicas: 4 },
          { kind: 'kube-rollout', name: 'catalog', complete: true, changeCause: 'release 2.3' },
        ],
        solution: ['kubectl set image deploy/catalog catalog=shop/catalog:2.4', CAUSE_24, 'sleep 100', 'kubectl describe deploy catalog | grep Progressing', 'kubectl events --types=Warning', 'kubectl rollout history deploy/catalog',
          'kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog', 'kubectl rollout history deploy/catalog'],
        mistakes: [
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.4', CAUSE_24, 'kubectl rollout status deploy/catalog'], why: '只等到 rollout status 報告超過期限，沒有回滾：catalog 停在 4 個 2.3 加上一個永遠不就緒的 2.4' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.4', CAUSE_24, 'sleep 100', 'kubectl delete pods -l app=catalog', 'sleep 30'], why: '刪除 Pod 不會改變 Pod 範本：ReplicaSet 以 2.4 的範本補回新 Pod，它們一樣永遠不就緒' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.4', CAUSE_24, 'sleep 100', 'kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog'], why: '用 set image 換回 2.3 雖然也會選回舊的 ReplicaSet，但 change-cause 仍是 release 2.4: new pricing，歷史記錄錯了' },
          { commands: ['kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog'], why: '還沒有執行 2.4 的更新就回滾：歷史只有一個 revision，undo 找不到可以回去的版本，什麼都沒有改變' },
        ],
        hints: [
          '`kubectl set image deploy/catalog catalog=shop/catalog:2.4` 之後，用 `kubectl annotate deploy/catalog kubernetes.io/change-cause=\'release 2.4: new pricing\' --overwrite` 記錄原因。',
          '`sleep 100` 讓時間超過 90 秒的期限；`kubectl describe deploy catalog | grep Progressing` 會看到 ProgressDeadlineExceeded，`kubectl events --types=Warning` 看到 readiness 探針回 503。',
          '`kubectl rollout history deploy/catalog` 確認上一個 revision 是 2.3，再 `kubectl rollout undo deploy/catalog`，最後 `kubectl rollout status deploy/catalog` 等它完成。',
        ],
        explanation: 'catalog 2.4 的 `/healthz` 一直回 503，新 Pod 永遠不就緒。因為 maxUnavailable 是 0，控制器一個舊 Pod 都沒有縮，4 個 2.3 照常服務；90 秒沒有任何進展之後，Progressing 條件變成 False（ProgressDeadlineExceeded），`rollout status` 也會以狀態碼 1 結束，但 Deployment 不會自己回滾。`kubectl rollout undo` 把 revision 1（2.3）的 Pod 範本與它的 change-cause 放回 Deployment，舊的 ReplicaSet 成為 revision 3，2.4 的 Pod 被刪除，`rollout status` 立刻完成，CHANGE-CAUSE 回到 release 2.3。刪除 Pod 只會被補回同一個壞版本；`set image` 回 2.3 雖然也回到同一個 ReplicaSet，卻讓歷史帶著 2.4 的說明。',
      },
      {
        id: 'kub11-ex-drill', title: '回滾演練：回滾之後的 revision 用哪個 Image', machine: 'kub11-drill',
        statement: '做一次回滾演練：把 catalog 更新到 `shop/catalog:2.3` 並等它完成，接著用 `kubectl rollout undo` 退回上一個版本並等它完成。最後從 `kubectl rollout history` 讀出「現在這個 revision」（歷史裡號碼最大的那一個）的 Pod 範本，只印出含有 `Image:` 的那一行（例如用 `grep Image`）。演練開始時 catalog 跑的是哪一版，請從叢集查，不要寫死：同一串指令會在另一個叢集上重播，那裡的 catalog 原本是別的版本。',
        checks: [
          { kind: 'output', fromCommand: '^kubectl rollout history ' },
          { kind: 'kube-rollout', name: 'catalog', revision: 3, complete: true },
        ],
        solution: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog', 'kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog', 'kubectl rollout history deploy/catalog',
          'kubectl rollout history deploy/catalog --revision=3 | grep Image'],
        mistakes: [
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog', 'kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog', 'kubectl rollout history deploy/catalog --revision=1 | grep Image'], why: '回滾之後原本的 revision 1 已經變成 3，--revision=1 找不到，什麼都沒有印出' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog', 'kubectl rollout history deploy/catalog --revision=2 | grep Image'], why: '沒有執行 rollout undo：印出的是 2.3 的 revision 2，演練只做了一半' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog', 'kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog', 'kubectl get deploy catalog -o wide'], why: 'get deploy -o wide 看得到 Image，但題目要從 rollout history 讀出那個 revision 的範本，而且只印 Image 那一行' },
          { commands: ['kubectl set image deploy/catalog catalog=shop/catalog:2.3', 'kubectl rollout status deploy/catalog', 'kubectl rollout undo deploy/catalog', 'kubectl rollout status deploy/catalog', "echo '    Image:         shop/catalog:2.2'"], why: '直接打出答案，沒有查詢叢集；在另一個叢集上 catalog 原本是另一個版本' },
        ],
        variants: [
          { label: 'catalog 原本跑 2.1 的叢集', files: [], kube: drillKube('shop/catalog:2.1', 'release 2.1') },
        ],
        hints: [
          '`kubectl set image deploy/catalog catalog=shop/catalog:2.3` 與 `kubectl rollout undo deploy/catalog` 之後，各用一次 `kubectl rollout status deploy/catalog` 等它完成。',
          '`kubectl rollout history deploy/catalog` 看現在有哪些 revision：回滾讓原本的 revision 1 換了一個新號碼。',
          '`kubectl rollout history deploy/catalog --revision=N` 印出那個 revision 的 Pod 範本，接上 `| grep Image` 只留下 Image 那一行。',
        ],
        explanation: '演練開始時只有 revision 1（原本的版本）。更新到 2.3 建立 revision 2；`rollout undo` 把 revision 1 的範本放回 Deployment，那個舊的 ReplicaSet 重新擴大，成為最新的 revision 3，原本的號碼 1 從歷史消失。所以 `kubectl rollout history deploy/catalog` 只剩 2 與 3，`--revision=3 | grep Image` 印出原本的 Image：這個叢集是 `shop/catalog:2.2`，另一個叢集是 `shop/catalog:2.1`。用 `--revision=1` 會得到找不到 revision 的錯誤，這也是回滾之後要先看一次 history、用當下號碼的原因。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub11-q1', prompt: 'Deployment 有 4 個副本，策略是預設的 `maxSurge: 25%`、`maxUnavailable: 25%`。滾動更新期間，Pod 總數上限與可用副本的下限分別是多少？',
      options: ['總數最多 4 個，可用至少 4 個', '總數最多 6 個，可用至少 2 個', '總數最多 5 個，可用至少 3 個', '總數最多 5 個，可用至少 4 個'],
      answer: 2,
      explanation: '4 × 25% = 1：maxSurge 向上取整是 1，所以總數最多 4 + 1 = 5；maxUnavailable 向下取整是 1，所以可用至少 4 − 1 = 3。總數 4、可用 4 是兩個都為 0 的情況，API server 會拒絕；6 與 2 是把 25% 當成 2 個；可用至少 4 要把 maxUnavailable 設成 0。',
    },
    {
      id: 'kub11-q2', prompt: '新版本啟動後要暖機 15 秒才能服務，但 Deployment 沒有設定 readiness 探針，策略是 `maxSurge: 1`、`maxUnavailable: 0`。更新時會發生什麼事？',
      options: ['新 Pod 一啟動就被當成就緒，馬上收流量、舊 Pod 也馬上被縮掉，暖機期間的請求會失敗', '因為 maxUnavailable 是 0，控制器會自動等 15 秒才把新 Pod 加進 Service', '沒有探針的 Pod 永遠不會就緒，所以更新會卡住直到 progressDeadlineSeconds', 'Kubernetes 會自動用 liveness 探針的預設值檢查 `/healthz`'],
      answer: 0,
      explanation: '沒有 readiness 探針時，容器開始執行就算就緒，Endpoints 立刻收它、控制器立刻把它算成可用並縮掉舊 Pod，maxUnavailable 0 因此保護不到任何東西。控制器不知道應用要暖機多久；沒有探針不是「永遠不就緒」而是「立刻就緒」；Kubernetes 也不會自動加上任何探針。',
    },
    {
      id: 'kub11-q3', prompt: '`kubectl rollout status deploy/catalog` 印出 `error: deployment "catalog" exceeded its progress deadline`。這代表什麼？',
      options: ['Deployment 已經自動回滾到上一個成功的 revision', '新 Pod 已經全部被刪除，舊版本自動恢復成 4 個副本', '`progressDeadlineSeconds` 太短，API server 拒絕了這次更新', '期限內沒有進展，Progressing 條件變成 False'],
      answer: 3,
      explanation: '期限只用來判定「卡住了」：Progressing 變成 False、原因是 ProgressDeadlineExceeded，rollout status 以狀態碼 1 結束，讓 CI/CD 知道失敗。Deployment 本身不會自動回滾，也不會刪掉新 Pod，新舊並存的狀態會一直維持，直到有人 `rollout undo` 或修正；API server 也不會因為期限拒絕更新。',
    },
    {
      id: 'kub11-q4', prompt: '`kubectl rollout history` 原本列出 revision 1、2、3，目前是 3。執行 `kubectl rollout undo deploy/catalog --to-revision=1` 之後，歷史會是？',
      options: ['1、2、3，目前是 1', '2、3、4，目前是 4（內容是原本的 revision 1）', '1、2，revision 3 被刪除', '1、2、3、4，revision 4 是 revision 1 的複本，原本的 1 也保留'],
      answer: 1,
      explanation: 'undo 把 revision 1 的 Pod 範本放回 Deployment，那個舊的 ReplicaSet 重新成為最新的版本，拿到下一個號碼 4，原本的號碼 1 就不再出現。revision 不會倒退成「目前是 1」；revision 3 的 ReplicaSet 縮到 0 但保留在歷史裡；也不會產生複本，同一個範本只對應一個 ReplicaSet。',
    },
    {
      id: 'kub11-q5', prompt: '要同時改 Image、探針與資源限制，又希望只觸發一次滾動更新、只留一筆歷史，應該怎麼做？',
      options: ['每改一項就執行一次 `kubectl rollout restart` 讓它生效', '先把 `maxSurge` 與 `maxUnavailable` 都設成 0，改完再改回來', '先 `rollout pause`，全部改完再 `rollout resume`', '改完之後用 `kubectl rollout undo` 合併前面的 revision'],
      answer: 2,
      explanation: '暫停期間範本可以一直修改，但不會建立新的 ReplicaSet；恢復之後所有改動合成一次更新、一個 revision。restart 會額外觸發更新；兩個參數都設 0 會被 API server 拒絕；undo 是回到舊範本，不會合併歷史。另一種做法是把所有改動寫進同一份 manifest，一次 apply。',
    },
    {
      id: 'kub11-q6', prompt: '2.4 在啟動時執行了資料庫遷移，把 `price` 欄位改名成 `unit_price`，之後發現 2.4 有錯，執行 `kubectl rollout undo` 回到 2.3。結果最可能是？',
      options: ['2.3 讀不到 `price` 而出錯：回滾只恢復 Pod 範本', 'undo 會一起執行反向遷移，資料庫的欄位恢復原狀', 'Kubernetes 會拒絕這次回滾，因為資料庫已經改變了', '2.3 會自動偵測並改讀新的 `unit_price` 欄位'],
      answer: 0,
      explanation: '`rollout undo` 只把 Deployment 的 Pod 範本換回舊的，資料庫結構、ConfigMap 與 Secret 的內容、外部系統都不會跟著回去。Kubernetes 不知道遷移的存在，不會執行反向遷移，也沒有理由拒絕回滾；舊程式也不會自己改讀新欄位。所以遷移要先擴充、確定不再回滾後才收縮。',
    },
    {
      id: 'kub11-q7', prompt: 'report 從同一個佇列依序處理工作，兩個版本同時執行會重複處理。它的 Deployment 應該用哪一種策略？',
      options: ['RollingUpdate，`maxSurge: 1`、`maxUnavailable: 0`', 'RollingUpdate，`maxSurge: 0`、`maxUnavailable: 1`', 'RollingUpdate，把 `minReadySeconds` 設得很長', 'Recreate：先停掉所有舊 Pod，結束後才建立新的'],
      answer: 3,
      explanation: 'Recreate 等舊的 Pod 全部結束才建立新版本，新舊不會同時執行，代價是中間有一段停機。RollingUpdate 的任何參數組合都會讓新舊 Pod 並存一段時間：maxSurge 0 只是先關一個舊的，其他舊 Pod 仍和新 Pod 一起執行；minReadySeconds 只延長觀察期，並存的時間反而更長。',
    },
  ],
};
