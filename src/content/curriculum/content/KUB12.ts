/*
 * KUB12 叢集監控 (KUB-4, monitoring-dashboard: the devops-explorer's dashboards, D3, plus terminal content on the
 * autoscaling profile, engine stages E32–E40 with metrics-server). The made-up shop team's workstation ops-ws (user yuki)
 * with kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02, 2 CPUs each) at
 * 14:00: catalog (3 replicas, requests 800m but using about 150m each), frontend (2 replicas, 300m, using about 250m),
 * cart (OOMKilled at its 128Mi limit and crash-looping since 13:10), mailer (deployed at 13:55 without SMTP_HOST, Error),
 * recommend (deployed at 13:58, Pending: Insufficient cpu) and the client pod toolbox (curl). The load on the Services
 * catalog and frontend is lesson data (kube.load), so kubectl top shows it. catalog serves a Prometheus text page at
 * /metrics (an E12 responder). The dashboard is the same day from 08:00 to 14:00 (360 minutes): node CPU, pending pods,
 * restarts in the last 15 minutes (derived from the engine's restart times of cart and mailer), requests per second,
 * checkout p95 and error rate; incidents: a flash sale (CPU saturated, pods Pending) and the cart crash loop.
 * Covered: USE for nodes and RED for services plus restarts, pending pods and events; metrics-server (kubectl top, HPA)
 * versus Prometheus (scraping /metrics, PromQL, kube-state-metrics, node-exporter, cAdvisor: prose only); restarts,
 * CrashLoopBackOff's back-off, Last State (OOMKilled 137, Error) and logs --previous; events (Warning, aggregation,
 * kubectl events --types and --for; they expire, an hour by default: prose); capacity from requests against usage,
 * overcommitted requests, when to add nodes (Cluster Autoscaler: prose); alert rules on node CPU and restarts.
 * Deviations: the simulator's kubectl get events accepts only metadata.* field selectors, so the lesson filters with
 * kubectl events --types=Warning and names --field-selector type=Warning in the text; kubectl set resources is not
 * simulated, so requests are changed in the YAML with sed and kubectl apply. Every exercise answer of the dashboard part
 * is computed by src/lib/devops; every transcript output was produced by replaying it on the engine. Organisation,
 * people, hosts, images and numbers are made up.
 */
import type { Dashboard } from '@/lib/devops/dashboard';
import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

// ---------------------------------------------------------------------------------------------------- the cluster
const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
const server = (name: string, port: number, responder: string, created: string, more: Partial<TerminalImage> = {}): TerminalImage => ({
  name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
  http: { port, responder }, logs: [`${responder} listening on :${port}`], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } }, ...more,
});

/**
 * catalog's /metrics in the Prometheus text format. The counters count since the process started (13:05, about 50
 * requests per second per pod), so they are about 165,000; the variant is another moment with other numbers.
 */
const metricsPage = (ok: number, notFound: number, failed: number, fast: number, slow: number, sum: string) => [
  '# HELP http_requests_total HTTP requests handled, by status code.',
  '# TYPE http_requests_total counter',
  `http_requests_total{code="200"} ${ok}`,
  `http_requests_total{code="404"} ${notFound}`,
  `http_requests_total{code="500"} ${failed}`,
  '# HELP http_request_duration_seconds Time spent answering HTTP requests.',
  '# TYPE http_request_duration_seconds histogram',
  `http_request_duration_seconds_bucket{le="0.1"} ${fast}`,
  `http_request_duration_seconds_bucket{le="0.5"} ${slow}`,
  `http_request_duration_seconds_bucket{le="+Inf"} ${ok + notFound + failed}`,
  `http_request_duration_seconds_sum ${sum}`,
  `http_request_duration_seconds_count ${ok + notFound + failed}`,
  '# HELP process_resident_memory_bytes Resident memory size in bytes.',
  '# TYPE process_resident_memory_bytes gauge',
  'process_resident_memory_bytes 8126464',
  '',
].join('\n');
const page = (id: string, extra: { path: string; body: string; type: string }[] = []) => ({
  id, server: `${id.replace(/-.*/, '')}/2.1`, routes: [{ path: '/', body: `${id.replace(/-.*/, '')} served by {{hostname}}\n`, type: 'text/plain' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }, ...extra],
});
const PROM = 'text/plain; version=0.0.4';
const RESPONDERS = [
  page('catalog', [{ path: '/metrics', body: metricsPage(165003, 214, 41, 151877, 164990, '8262.9'), type: PROM }]),
  page('catalog-later', [{ path: '/metrics', body: metricsPage(171842, 230, 397, 160011, 172201, '8968.4'), type: PROM }]),
  page('frontend'), page('cart'), page('mailer'), page('recommend'),
];

/** cart: by default it grows 1 MB a second from 40 MB and is OOMKilled at its 128Mi limit after about 95 s. */
const CART_OOM: Partial<TerminalImage> = { memory: { start: 40_000_000, growth: 1_000_000 } };
/** The other cluster of the restarts exercise: cart exits with status 1 after 40 s (it cannot reach its cache). */
const CART_ERROR: Partial<TerminalImage> = { exitAfter: { seconds: 40, exit: 1, logs: [{ text: 'panic: dial tcp 10.96.14.7:6379: connect: connection refused', stream: 2 }] } };
const images = (cart: Partial<TerminalImage>, catalog = 'catalog'): TerminalImage[] => [
  server('shop/catalog:2.1', 8080, catalog, '2026-11-18 09:00:00'),
  server('shop/frontend:1.6', 3000, 'frontend', '2026-11-20 09:00:00'),
  server('shop/cart:1.4', 8081, 'cart', '2026-11-23 09:00:00', cart),
  server('shop/mailer:0.9', 8082, 'mailer', '2026-11-24 09:00:00', { needsEnv: ['SMTP_HOST'], missingEnv: { output: 'mailer: SMTP_HOST is not set', exit: 1 } }),
  server('shop/recommend:1.0', 8083, 'recommend', '2026-11-24 09:00:00'),
  { name: 'shop/toolbox:1.0', size: 12_000_000, created: '2026-11-10 09:00:00', cmd: ['sleep', 'infinity'], service: true, layers: 2, osRelease: DEBIAN, commands: [...BASIC, 'curl', 'wget'] },
];

const deployment = (name: string, image: string, replicas: number, port: number, resources: string[]) => yaml(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`,
  '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:', `        - containerPort: ${port}`,
  '        resources:', ...resources.map(x => `          ${x}`));
const service = (name: string, port: number) => yaml('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', '  selector:', `    app: ${name}`, '  ports:', '  - port: 80', `    targetPort: ${port}`);
const resources = (cpu: string, memory: string, limit?: string) => ['requests:', `  cpu: ${cpu}`, `  memory: ${memory}`, ...limit ? ['limits:', `  memory: ${limit}`] : []];
const CATALOG = `${deployment('catalog', 'shop/catalog:2.1', 3, 8080, resources('800m', '512Mi'))}---\n${service('catalog', 8080)}`;
const FRONTEND = `${deployment('frontend', 'shop/frontend:1.6', 2, 3000, resources('300m', '256Mi'))}---\n${service('frontend', 3000)}`;
const CART = `${deployment('cart', 'shop/cart:1.4', 1, 8081, resources('100m', '64Mi', '128Mi'))}---\n${service('cart', 8081)}`;
const MAILER = deployment('mailer', 'shop/mailer:0.9', 1, 8082, resources('100m', '64Mi'));
const RECOMMEND = deployment('recommend', 'shop/recommend:1.0', 2, 8083, resources('600m', '256Mi'));
const TOOLBOX = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: toolbox', 'spec:', '  containers:', '  - name: toolbox', '    image: shop/toolbox:1.0');
const at = (text: string, time: string, f: string) => ({ text, at: `2026-11-24 ${time}`, file: f });
const kube = (): TerminalKube => ({
  images: ['shop/catalog:2.1', 'shop/frontend:1.6', 'shop/cart:1.4', 'shop/mailer:0.9', 'shop/recommend:1.0', 'shop/toolbox:1.0'].map(name => ({ name, nodes: ['node-01', 'node-02'] })),
  manifests: [at(TOOLBOX, '13:05:00', 'toolbox.yaml'), at(CATALOG, '13:05:00', 'catalog.yaml'), at(FRONTEND, '13:05:00', 'frontend.yaml'), at(CART, '13:10:00', 'cart.yaml'),
    at(MAILER, '13:55:00', 'mailer.yaml'), at(RECOMMEND, '13:58:00', 'recommend.yaml')],
  metricsServer: true,
  // Requests per second on the Services: catalog about 150 (3m of CPU each), frontend about 125 (4m each).
  load: [
    { service: 'catalog', start: '2026-11-24 13:00:00', minutes: 120, rps: { seed: 1201, baseline: 150, noise: 5 }, cpuPerRequest: '3m' },
    { service: 'frontend', start: '2026-11-24 13:00:00', minutes: 120, rps: { seed: 1202, baseline: 125, noise: 5 }, cpuPerRequest: '4m' },
  ],
});
const SHOP = '/home/yuki/shop';
const WS: TerminalMachine = {
  id: 'kub12-ws', title: 'ops-ws（shop 團隊的工作站，14:00 的叢集）', user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'autoscaling', now: '2026-11-24 14:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir(SHOP), file(`${SHOP}/catalog.yaml`, CATALOG), file(`${SHOP}/frontend.yaml`, FRONTEND), file(`${SHOP}/cart.yaml`, CART),
    file(`${SHOP}/mailer.yaml`, MAILER), file(`${SHOP}/recommend.yaml`, RECOMMEND)],
  responders: RESPONDERS,
  docker: { images: images(CART_OOM) },
  kube: kube(),
};
const CART_FAILS_OTHERWISE: TerminalVariant = { label: '另一個叢集：cart 以另一種方式失敗', files: [], docker: { images: images(CART_ERROR) } };
const LATER_COUNTERS: TerminalVariant = { label: '另一個時間點的計數器', files: [], docker: { images: images(CART_OOM, 'catalog-later') } };

const CART_POD = "cart-zb6llrc479-2nxns";
const MAILER_POD = "mailer-vd8s7lmnfv-s2fqf";
const RECOMMEND_POD = "recommend-5hptpsmgqm-c5gxz";
const EXAMPLES: TerminalExample[] = [
  {
    id: "kub12-top", title: "kubectl top：節點與 Pod 此刻用了多少", machine: 'kub12-ws',
    description: "metrics-server 每 15 秒向 kubelet 取得一次用量。top nodes 的百分比是用量除以節點的 allocatable；top pods 依 CPU 由大到小排列。一直在重啟的 cart 沒有指標，指名查它就說 Metrics not available。",
    steps: [
      { command: "kubectl top nodes", output: "NAME      CPU(cores)   CPU%      MEMORY(bytes)   MEMORY%\ncp-01     159m         7%        1128Mi          29%\nnode-01   337m         16%       454Mi           11%\nnode-02   681m         34%       450Mi           11%" },
      { command: "kubectl top pods --sort-by=cpu", output: "NAME                        CPU(cores)   MEMORY(bytes)\nfrontend-m72wdqjnx5-hn8fq   249m         8Mi\nfrontend-m72wdqjnx5-s5srt   249m         8Mi\ncatalog-hdp92jz9nq-fjqmp    151m         8Mi\ncatalog-hdp92jz9nq-l2vzn    151m         8Mi\ncatalog-hdp92jz9nq-nsx8s    151m         8Mi\ntoolbox                     1m           8Mi" },
      { command: `kubectl top pod ${CART_POD}`, output: "error: Metrics not available for pod default/cart-zb6llrc479-2nxns, age: 50m0s" },
    ],
  },
  {
    id: "kub12-metrics", title: "catalog 的 /metrics：Prometheus 的文字格式", machine: 'kub12-ws',
    description: "Service catalog 後面有三個 Pod，Prometheus 會分別抓取每一個。從 toolbox 經由 Service 讀 /metrics：每個指標有 HELP 與 TYPE 兩行說明，接著每個標籤組合一行「名稱{標籤} 數值」。",
    steps: [
      { command: "kubectl get endpoints catalog", output: "NAME      ENDPOINTS                                         AGE\ncatalog   10.244.1.3:8080,10.244.1.4:8080,10.244.2.3:8080   55m" },
      { command: "kubectl exec toolbox -- curl -s catalog/metrics", output: "# HELP http_requests_total HTTP requests handled, by status code.\n# TYPE http_requests_total counter\nhttp_requests_total{code=\"200\"} 165003\nhttp_requests_total{code=\"404\"} 214\nhttp_requests_total{code=\"500\"} 41\n# HELP http_request_duration_seconds Time spent answering HTTP requests.\n# TYPE http_request_duration_seconds histogram\nhttp_request_duration_seconds_bucket{le=\"0.1\"} 151877\nhttp_request_duration_seconds_bucket{le=\"0.5\"} 164990\nhttp_request_duration_seconds_bucket{le=\"+Inf\"} 165258\nhttp_request_duration_seconds_sum 8262.9\nhttp_request_duration_seconds_count 165258\n# HELP process_resident_memory_bytes Resident memory size in bytes.\n# TYPE process_resident_memory_bytes gauge\nprocess_resident_memory_bytes 8126464" },
    ],
  },
  {
    id: "kub12-restarts", title: "重啟次數、Last State 與上一次的日誌", machine: 'kub12-ws',
    description: "RESTARTS 欄寫著重啟幾次、上一次在多久之前。describe 的 State 是現在、Last State 是上一次結束的原因；logs --previous 印出上一次執行的日誌。",
    steps: [
      { command: "kubectl get pods", output: "NAME                         READY     STATUS             RESTARTS        AGE\ncart-zb6llrc479-2nxns        0/1       CrashLoopBackOff   11 (50s ago)    50m\ncatalog-hdp92jz9nq-fjqmp     1/1       Running            0               55m\ncatalog-hdp92jz9nq-l2vzn     1/1       Running            0               55m\ncatalog-hdp92jz9nq-nsx8s     1/1       Running            0               55m\nfrontend-m72wdqjnx5-hn8fq    1/1       Running            0               55m\nfrontend-m72wdqjnx5-s5srt    1/1       Running            0               55m\nmailer-vd8s7lmnfv-s2fqf      0/1       CrashLoopBackOff   5 (2m30s ago)   5m\nrecommend-5hptpsmgqm-c5gxz   0/1       Pending            0               2m\nrecommend-5hptpsmgqm-txwzx   0/1       Pending            0               2m\ntoolbox                      1/1       Running            0               55m" },
      { command: `kubectl describe pod ${MAILER_POD} | grep -A 6 'State:'`, output: "    State:          Waiting\n      Reason:       CrashLoopBackOff\n    Last State:     Terminated\n      Reason:       Error\n      Exit Code:    1\n      Started:      Tue, 24 Nov 2026 13:57:30 +0000\n      Finished:     Tue, 24 Nov 2026 13:57:30 +0000\n    Ready:          False\n    Restart Count:  5" },
      { command: `kubectl logs ${MAILER_POD} --previous`, output: "mailer: SMTP_HOST is not set" },
      { command: `kubectl logs ${CART_POD} --previous`, output: "cart listening on :8081" },
    ],
  },
  {
    id: "kub12-events", title: "Warning 事件：BackOff 與 FailedScheduling", machine: 'kub12-ws',
    description: "kubectl events --types=Warning 只列出警告，重複的事件累計次數；--for 只看某一個物件的事件。",
    steps: [
      { command: "kubectl events --types=Warning", output: "LAST SEEN               TYPE      REASON             OBJECT                           MESSAGE\n2m29s (x5 over 4m59s)   Warning   BackOff            Pod/mailer-vd8s7lmnfv-s2fqf      Back-off restarting failed container mailer in pod mailer-vd8s7lmnfv-s2fqf_default(af13392b-2210-4acd-bdc0-4c358c0a623a)\n2m                      Warning   FailedScheduling   Pod/recommend-5hptpsmgqm-c5gxz   0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.\n2m                      Warning   FailedScheduling   Pod/recommend-5hptpsmgqm-txwzx   0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.\n49s (x11 over 46m)      Warning   BackOff            Pod/cart-zb6llrc479-2nxns        Back-off restarting failed container cart in pod cart-zb6llrc479-2nxns_default(b825d69a-6c67-4cb7-8a28-79e1cc2fd7f4)" },
      { command: `kubectl events --for pod/${RECOMMEND_POD}`, output: "LAST SEEN   TYPE      REASON             OBJECT                           MESSAGE\n2m          Warning   FailedScheduling   Pod/recommend-5hptpsmgqm-c5gxz   0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod." },
    ],
  },
  {
    id: "kub12-capacity", title: "已分配的 requests 與實際用量", machine: 'kub12-ws',
    description: "describe node 的 Allocated resources 是節點上所有 Pod 的 requests 加總；拿它和 kubectl top 量到的用量比較，再列出每個 Pod 預留了多少、落在哪個節點。",
    steps: [
      { command: "kubectl describe node node-01 | grep -A 5 'Allocated resources'", output: "Allocated resources:\n  (Total limits may be over 100 percent, i.e., overcommitted.)\n  Resource           Requests      Limits\n  --------           --------      ------\n  cpu                1700m (85%)   0 (0%)\n  memory             1224Mi (32%)  0 (0%)" },
      { command: "kubectl describe node node-02 | grep -A 5 'Allocated resources'", output: "Allocated resources:\n  (Total limits may be over 100 percent, i.e., overcommitted.)\n  Resource           Requests      Limits\n  --------           --------      ------\n  cpu                1600m (80%)   0 (0%)\n  memory             1152Mi (30%)  128Mi (3%)" },
      { command: "kubectl top nodes", output: "NAME      CPU(cores)   CPU%      MEMORY(bytes)   MEMORY%\ncp-01     159m         7%        1128Mi          29%\nnode-01   337m         16%       454Mi           11%\nnode-02   681m         34%       450Mi           11%" },
      { command: "kubectl get pods -o custom-columns=NAME:.metadata.name,CPU_REQ:.spec.containers[0].resources.requests.cpu,NODE:.spec.nodeName", output: "NAME                         CPU_REQ   NODE\ncart-zb6llrc479-2nxns        100m      node-02\ncatalog-hdp92jz9nq-fjqmp     800m      node-02\ncatalog-hdp92jz9nq-l2vzn     800m      node-01\ncatalog-hdp92jz9nq-nsx8s     800m      node-01\nfrontend-m72wdqjnx5-hn8fq    300m      node-02\nfrontend-m72wdqjnx5-s5srt    300m      node-02\nmailer-vd8s7lmnfv-s2fqf      100m      node-02\nrecommend-5hptpsmgqm-c5gxz   600m      <none>\nrecommend-5hptpsmgqm-txwzx   600m      <none>\ntoolbox                      <none>    node-02" },
      { command: "kubectl get pods --field-selector status.phase=Pending", output: "NAME                         READY     STATUS    RESTARTS   AGE\nrecommend-5hptpsmgqm-c5gxz   0/1       Pending   0          2m\nrecommend-5hptpsmgqm-txwzx   0/1       Pending   0          2m" },
    ],
  },
];

const REASON = "-o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}'";
const EXERCISES: TerminalExercise[] = [
  {
    id: 'kub12-x-restarts', title: '重啟最多的 Pod，為什麼重啟', machine: 'kub12-ws',
    statement: 'default 命名空間裡有 Pod 一直重新啟動。找出重啟次數最多的那個 Pod，再用 `kubectl get pod 名稱 -o jsonpath=…` 只印出它的容器上一次結束的原因（Last State 的 Reason，例如 `Completed`）。檢查時會換成另一個叢集再執行一次你的指令，所以要從叢集查出來，不能直接打出答案。',
    checks: [{ kind: 'output', fromCommand: '^kubectl ' }],
    solution: ['kubectl get pods --sort-by=.status.containerStatuses[0].restartCount', `kubectl get pod ${CART_POD} ${REASON}`],
    variants: [CART_FAILS_OTHERWISE],
    mistakes: [
      { commands: [`kubectl get pod ${MAILER_POD} ${REASON}`], why: '查的是 mailer：它也在 CrashLoopBackOff，但只重啟了 5 次，重啟最多的是 cart' },
      { commands: [`kubectl get pod ${CART_POD} -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}'`], why: '印出的是目前的狀態 CrashLoopBackOff：它只說明 kubelet 正在等待下一次重啟，不是容器結束的原因' },
      { commands: ['echo OOMKilled'], why: '直接打出答案：換成另一個叢集時原因不一樣，而且答案必須來自 kubectl 查到的資料' },
      { commands: [`kubectl get pod ${CART_POD} -o jsonpath='{.status.containerStatuses[0].restartCount}'`], why: '印出的是重啟次數，不是原因；原因在 lastState.terminated.reason' },
    ],
    hints: [
      '`kubectl get pods` 的 RESTARTS 欄；加上 `--sort-by=.status.containerStatuses[0].restartCount` 由少到多排列，最後一列最多。',
      '`kubectl describe pod` 的 Last State 一段寫著上一次結束的 Reason 與 Exit Code；同一個欄位在 JSON 裡是 `.status.containerStatuses[0].lastState.terminated.reason`。',
      'State（現在）和 Last State（上一次）是不同的欄位：CrashLoopBackOff 在 State 裡。',
    ],
    explanation: 'cart 的 RESTARTS 最多（11 次），它的 Last State 是 Terminated、Reason OOMKilled、Exit Code 137：容器的記憶體用到 limits.memory（128Mi），被核心以 SIGKILL 結束（128 + 9 = 137）。程式自己來不及寫下任何錯誤，所以 `kubectl logs --previous` 只看得到啟動訊息。另一個叢集裡 cart 是自己以狀態碼 1 結束，Reason 是 Error，要看 `logs --previous` 裡的 panic。兩者的 STATUS 都是 CrashLoopBackOff：那只是「重啟之間在等待」，原因一定要看 Last State 與上一次的日誌。',
  },
  {
    id: 'kub12-x-capacity', title: '先調整 requests，不急著加節點', machine: 'kub12-ws',
    statement: 'recommend 的兩個 Pod 卡在 Pending（Insufficient cpu）。不能加節點，也不能減少任何 Deployment 的副本數。用 `kubectl top` 與 `kubectl describe node` 找出 CPU requests 遠高於實際用量的那個 Deployment，把它的 CPU requests 改成 200m（修改 ~/shop 裡它的 YAML 再 `kubectl apply`），等待它更新完成，讓 recommend 的兩個 Pod 都執行起來。其他 Deployment 的設定不要動。',
    checks: [
      { kind: 'kube-pod', selector: 'app=recommend', count: 2, status: 'Running', ready: true },
      { kind: 'kube-object', resource: 'Deployment', name: 'catalog', fields: [{ path: '.spec.template.spec.containers[0].resources.requests.cpu', equals: '200m' }] },
      { kind: 'kube-workload', name: 'catalog', replicas: 3, readyReplicas: 3 },
      { kind: 'kube-object', resource: 'Deployment', name: 'frontend', fields: [{ path: '.spec.template.spec.containers[0].resources.requests.cpu', equals: '300m' }] },
    ],
    solution: ['kubectl top pods --sort-by=cpu', 'kubectl describe node node-01', "sed -i 's/cpu: 800m/cpu: 200m/' shop/catalog.yaml", 'kubectl apply -f shop/catalog.yaml', 'kubectl rollout status deploy/catalog',
      'kubectl wait --for=condition=Ready pod -l app=recommend --timeout=60s'],
    mistakes: [
      { commands: ['kubectl scale deploy catalog --replicas=1', 'kubectl wait --for=condition=Ready pod -l app=recommend --timeout=60s'], why: '減少了 catalog 的副本數：recommend 是放得下了，但 catalog 少了兩個副本，任何一個 Pod 出事就整個停擺；真正的問題是每個副本預留了 800m 卻只用約 150m' },
      { commands: ["sed -i 's/cpu: 800m/cpu: 200m/' shop/catalog.yaml", 'kubectl apply -f shop/catalog.yaml'], why: '只套用、沒有等待：滾動更新還沒進行，舊的 catalog Pod 仍然預留著 800m，recommend 還在 Pending' },
      { commands: ["sed -i 's/cpu: 300m/cpu: 200m/' shop/frontend.yaml", 'kubectl apply -f shop/frontend.yaml', 'kubectl rollout status deploy/frontend'], why: '改錯了 Deployment：frontend 每個 Pod 實際就用了約 250m，requests 300m 是合理的；降到 200m 只空出 200m，recommend 仍然放不下兩個，而且尖峰時 frontend 會搶不到 CPU' },
      { commands: ['kubectl delete pods -l app=recommend', 'sleep 30'], why: '刪掉 Pending 的 Pod 沒有用：ReplicaSet 立刻補上新的 Pod，它們要的 600m 仍然沒有節點放得下' },
    ],
    hints: [
      '`kubectl top pods --sort-by=cpu` 看每個 Pod 實際用多少；`kubectl get pods -o custom-columns=NAME:.metadata.name,CPU_REQ:.spec.containers[0].resources.requests.cpu` 看它預留多少。',
      '排程器只看 requests：describe node 的 Allocated resources 寫著每台節點已經被預留了多少。',
      "`sed -i 's/舊/新/' 檔案` 改 YAML，`kubectl apply -f` 套用，再用 `kubectl rollout status` 與 `kubectl wait` 讓時間前進到更新完成。",
    ],
    explanation: 'catalog 每個副本 requests 800m，`kubectl top` 卻只量到約 151m；三個副本一共預留 2400m，實際只用約 450m。排程器依 requests 判斷，所以 node-01 已分配 85%、node-02 80%，600m 的 recommend 哪裡都放不下，即使兩台節點實際只用了 16% 與 34%。把 catalog 的 requests 改成 200m（量到的用量再留約三成的餘裕）後，滾動更新換上新的 Pod，空出 1800m，recommend 的兩個 Pod 就排程並執行了。frontend 的 requests（300m）接近它的實際用量（約 250m），不是浪費。先把 requests 調整到接近實際用量，再判斷要不要加節點；但 requests 也不能低於平常的用量，否則節點被排得太滿，大家一起搶 CPU。',
  },
  {
    id: 'kub12-x-metrics', title: '從 /metrics 找出錯誤的計數', machine: 'kub12-ws',
    statement: 'catalog 以 Prometheus 的文字格式在 /metrics 提供指標。從 toolbox 這個 Pod 讀取 Service catalog 的 /metrics，只印出計數器 http_requests_total 裡狀態碼 500 的那一行（整行，包含名稱、標籤與數值）。檢查時會換成另一個時間點的計數器再執行一次你的指令。',
    checks: [{ kind: 'output', fromCommand: '^kubectl exec ' }],
    solution: ['kubectl exec toolbox -- curl -s catalog/metrics', 'kubectl exec toolbox -- curl -s catalog/metrics | grep \'code="500"\''],
    variants: [LATER_COUNTERS],
    mistakes: [
      { commands: ['kubectl exec toolbox -- curl -s catalog/metrics | grep 500'], why: '樣式太短：http_requests_total{code="200"} 的數值 165003 裡也有 500，兩行都被印出來' },
      { commands: ['kubectl exec toolbox -- curl -s catalog/metrics | grep http_requests_total'], why: '印出了整個計數器：HELP、TYPE 兩行說明，加上 200、404、500 三行' },
      { commands: ['curl -s catalog/metrics | grep \'code="500"\''], why: '在工作站上執行 curl：catalog 是叢集內的名稱，只有叢集裡的 Pod 解析得到，所以要經由 kubectl exec 在 toolbox 裡執行' },
    ],
    hints: [
      '`kubectl exec toolbox -- curl -s catalog/metrics` 先把整頁印出來看看。',
      '每個標籤組合是一行，例如 http_requests_total{code="500"} 41；用含標籤的樣式比對才精確。',
      '樣式裡有雙引號，整個樣式用單引號括起來；管線的 grep 在工作站上執行。',
    ],
    explanation: '`kubectl exec toolbox -- curl -s catalog/metrics | grep \'code="500"\'` 在 toolbox 裡經由 Service catalog 讀到其中一個 Pod 的 /metrics，再在工作站上篩出 500 那一行：http_requests_total{code="500"} 41。這是計數器（counter），從程式啟動起只增不減，Pod 重新啟動就歸零；單看 41 沒有意義，要看它每秒增加多少，這正是 Prometheus 的 rate() 在做的事。另外，經由 Service 每次只會讀到某一個 Pod 的數字；Prometheus 會透過服務探索找到每一個 Pod，分別抓取，再把同一個 Deployment 的數字加總。',
  },
];

// ---------------------------------------------------------------------------------------------------- the dashboard
/**
 * The restarts of the day (minute from 08:00): one container at 11:20 (a frontend pod replaced at 13:05), cart's crash
 * loop from 13:11 and mailer's from 13:55, as the engine restarts them (back-off 10 s, doubling, at most 5 minutes).
 */
const RESTARTS = [200, 311, 313, 315, 317, 320, 324, 331, 337, 344, 351, 357, 355, 355, 355, 356, 357];
const restartsIn15 = Array.from({ length: 360 }, (_, t) => RESTARTS.filter(r => r <= t && r > t - 15).length);
/**
 * shop's cluster from 08:00 to 14:00 (minute 0 = 08:00). Incidents: the flash sale [150, 180) (10:30–11:00: the workers'
 * CPU above 90 %, four pods Pending, checkout p95 about 700 ms) and the cart crash loop [311, 360) (13:11 on: checkout
 * errors about 32 ‰, p95 about 320 ms). Not incidents: the daily report job at 08:45 (CPU about 86 % for 5 minutes), one
 * restart at 11:20, recommend's two Pending pods at 13:58.
 */
const day = (incidents: Dashboard['incidents'], rules: Dashboard['rules']): Dashboard => ({
  service: 'shop 叢集（工作節點 node-01、node-02）', minutes: 360,
  series: [
    { id: 'cpu', label: '工作節點的 CPU 使用率（兩台平均）', unit: '%', signal: 'saturation', shape: { seed: 1211, baseline: 24, noise: 2, changes: [
      { kind: 'spike', at: 45, minutes: 5, delta: 62 },
      { kind: 'ramp', from: 120, to: 150, delta: 20 },
      { kind: 'spike', at: 150, minutes: 30, delta: 49 },
      { kind: 'step', at: 180, delta: -20 }] } },
    { id: 'pending', label: 'Pending 的 Pod', unit: '個', signal: 'saturation', shape: { seed: 1212, baseline: 0, changes: [
      { kind: 'spike', at: 153, minutes: 27, delta: 4 }, { kind: 'spike', at: 358, minutes: 2, delta: 2 }] } },
    { id: 'restarts', label: '過去 15 分鐘的容器重啟次數', unit: '次', signal: 'errors', values: restartsIn15 },
    { id: 'rps', label: '每秒請求數（全部服務）', unit: '個', signal: 'traffic', shape: { seed: 1213, baseline: 300, noise: 15, changes: [
      { kind: 'ramp', from: 120, to: 150, delta: 150 }, { kind: 'spike', at: 150, minutes: 30, delta: 450 }, { kind: 'step', at: 180, delta: -150 }] } },
    { id: 'p95', label: '結帳的 p95 延遲', unit: 'ms', signal: 'latency', shape: { seed: 1214, baseline: 180, noise: 12, changes: [
      { kind: 'spike', at: 152, minutes: 28, delta: 520 }, { kind: 'step', at: 311, delta: 140 }] } },
    { id: 'errors', label: '結帳的錯誤率', unit: '‰', signal: 'errors', shape: { seed: 1215, baseline: 2, noise: 1, changes: [
      { kind: 'spike', at: 160, minutes: 20, delta: 6 }, { kind: 'step', at: 311, delta: 30 }] } },
  ],
  incidents, rules,
});
const SALE = { id: 'sale', label: '限時特賣：節點 CPU 滿載、Pod 卡在 Pending', start: 150, end: 180 };
const CART_LOOP = { id: 'cart', label: 'cart 反覆被 OOMKilled，部分結帳失敗', start: 311, end: 360 };
const CPU_10 = { id: 'cpu-10', label: '節點 CPU 超過 80%，持續 10 分鐘', series: 'cpu', op: '>' as const, threshold: 80, forMinutes: 10, severity: 'warning' as const };
const CPU_NOW = { id: 'cpu-now', label: '節點 CPU 超過 80% 立即告警', series: 'cpu', op: '>' as const, threshold: 80, forMinutes: 0, severity: 'warning' as const };

export const KUB12: LessonContent = {
  lessonId: 'KUB12',
  motivation: 'shop 團隊的服務都跑在 Kubernetes 上之後，值班的人面對的不再是「一台主機」，而是兩台工作節點上十幾個隨時被建立、移動、刪除的 Pod。CICD11 學過的儀表板與告警仍然有用，但叢集多了一層自己的問題：節點的 CPU 被預留滿了、新 Pod 卡在 Pending、某個容器每隔幾分鐘就被重新啟動、排程器與 kubelet 在事件裡留下警告卻沒人看見。今天下午兩點，結帳的錯誤率升高，剛部署的推薦服務也起不來；可是 `kubectl top` 顯示節點只用了兩三成的 CPU。本課先整理「叢集上要看什麼」：節點看 USE、服務看 RED，再加上重啟次數、Pending 的 Pod 與事件；接著分清楚 metrics-server 與 Prometheus 兩條指標管線，在工作站 ops-ws 上用 `kubectl top`、`describe`、`logs --previous` 與 `kubectl events` 找出哪個 Pod 一直重啟、為什麼重啟；最後比較 requests 與實際用量，判斷叢集是真的滿了，還是只是被預留滿了，以及什麼時候才需要加節點。',
  sections: [
    {
      id: 'kub12-s-what', title: '叢集上要看什麼：USE、RED 與 Kubernetes 自己的訊號',
      blocks: [
        { type: 'p', text: '叢集的監控分成兩個角度。資源（節點的 CPU、記憶體、磁碟、網路）用 USE 方法：使用率（Utilization，忙碌的比例）、飽和度（Saturation，排隊等待、做不完的工作）與錯誤（Errors）。服務（catalog、frontend、cart 這些處理請求的程式）用 RED 方法：請求率（Rate）、錯誤（Errors）與處理時間（Duration，通常看 p95 或 p99 延遲）。RED 回答「使用者有沒有受影響」，USE 回答「是哪個資源不夠」；CICD11 的四大黃金訊號（延遲、流量、錯誤、飽和度）大致就是兩者的合併。' },
        { type: 'table', head: ['對象', '看什麼', 'Kubernetes 上的例子', '從哪裡讀'], rows: [
          ['節點（USE）', '使用率、飽和度、錯誤', '節點 CPU 與記憶體使用率、MemoryPressure／DiskPressure、NotReady', '`kubectl top nodes`、`describe node` 的 Conditions、node-exporter'],
          ['服務（RED）', '請求率、錯誤率、延遲', '每秒請求數、5xx 的比例、結帳的 p95', '應用程式自己的 `/metrics`、閘道或 Ingress 的指標'],
          ['Pod 與容器', '重啟次數、上一次結束的原因、用量', 'RESTARTS、CrashLoopBackOff、OOMKilled、`kubectl top pods`', '`kubectl get pods`、`describe pod`、kube-state-metrics'],
          ['排程與容量', 'Pending 的 Pod、已分配的 requests', 'Insufficient cpu、Allocated resources 85%', '`get pods --field-selector status.phase=Pending`、`describe node`'],
          ['控制平面的紀錄', 'Warning 事件', 'FailedScheduling、BackOff、Unhealthy、FailedMount', '`kubectl events --types=Warning`'],
        ] },
        { type: 'p', text: 'Kubernetes 會自動處理很多問題：容器結束了 kubelet 會重新啟動它，Pod 不見了 ReplicaSet 會補上。這是好事，但也代表問題可能被「自動修好」而一直重複發生，從外面只看到偶爾變慢。所以除了節點與服務的指標，還要看叢集自己的訊號：重啟次數一直增加、Pod 長時間 Pending、事件裡反覆出現同一種 Warning，都是控制器在替你掩蓋的毛病。' },
        { type: 'p', text: '下面是 shop 叢集今天 08:00 到 14:00 的儀表板（示意資料，第 0 分鐘是 08:00，每一點是一分鐘）：工作節點的 CPU、Pending 的 Pod、過去 15 分鐘的容器重啟次數、全部服務的每秒請求數，以及結帳的 p95 延遲與錯誤率。兩段底色是事故：10:30 起的限時特賣讓節點 CPU 滿載、新的 Pod 卡在 Pending、結帳變慢；13:11 起 cart 反覆被 OOMKilled，部分結帳失敗。先用步進器看看每段事故時哪些序列動了，再留意 08:45 的每日報表批次工作與 11:20 的一次重啟：它們讓指標跳動，使用者卻沒有受影響。' },
        { type: 'example', id: 'kub12-day' },
        { type: 'callout', tone: 'note', title: '本課的資料與模擬', text: '儀表板是示意資料，告警的評估是本課程自己的教學模型，不代表任何監控產品的行為。終端機裡的叢集是虛構的 kubeadm 叢集（Kubernetes v1.32 的輸出格式），負載與用量是課程宣告的數字，時鐘只在 `sleep`、`kubectl wait`、`kubectl rollout status` 時前進。儀表板的最後一分鐘就是終端機的 14:00。' },
      ],
    },
    {
      id: 'kub12-s-pipeline', title: '指標從哪裡來：metrics-server 與 Prometheus',
      blocks: [
        { type: 'p', text: '叢集裡常見兩條指標管線，用途不同，不要混為一談。metrics-server 是叢集的附加元件：它定期（預設每 15 秒）向每個節點的 kubelet 取得節點與每個容器此刻的 CPU 與記憶體用量，只把最新的一份留在記憶體裡，透過 Metrics API（`metrics.k8s.io`）提供給 `kubectl top`、HorizontalPodAutoscaler（KUB10）等使用。它沒有歷史資料、不能畫一天的圖，也不負責告警；它的文件也明說不該拿它當監控系統。' },
        { type: 'p', text: 'Prometheus 是常見的開源監控系統，做法是「拉」：每隔一段時間（常見 15 到 60 秒）向每個目標的 HTTP 端點（慣例是 `/metrics`）抓取一次，把每個數字依名稱與標籤存成一條時間序列，用 PromQL 查詢、畫圖，並依告警規則評估，再交給 Alertmanager 分組、靜音與通知。在 Kubernetes 上，它透過服務探索（向 API server 查詢 Pod 與 Endpoints）找到每一個要抓取的 Pod，Pod 換了也跟得上。' },
        { type: 'table', head: ['', 'metrics-server', 'Prometheus'], rows: [
          ['資料', '節點與容器此刻的 CPU、記憶體', '任何程式公開的指標，含歷史'],
          ['保存', '只有最新一份，在記憶體裡', '時間序列資料庫，保留數天到數週'],
          ['誰在用', '`kubectl top`、HPA、VPA', '儀表板、PromQL 查詢、告警規則'],
          ['資料來源', '每個節點的 kubelet', '各目標的 `/metrics`：應用程式、kube-state-metrics、node-exporter、kubelet 內建的 cAdvisor'],
        ] },
        { type: 'p', text: '先用 metrics-server 看「此刻」：`kubectl top nodes` 的 CPU% 與 MEMORY% 是用量除以節點的 allocatable；`kubectl top pods --sort-by=cpu` 由大到小列出每個 Pod。一直在重啟的 cart 沒有出現在清單上，指名查它會說 Metrics not available：metrics-server 至少要看到容器活過兩次抓取，才算得出用量。' },
        { type: 'example', id: 'kub12-top' },
        { type: 'p', text: 'Prometheus 要抓的 `/metrics` 是一頁純文字，Content-Type 是 `text/plain; version=0.0.4`。每個指標先有 `# HELP`（說明）與 `# TYPE`（型別），接著每個標籤組合一行「名稱{標籤} 數值」。catalog 公開了三個指標：計數器 http_requests_total 依狀態碼分成三行；直方圖 http_request_duration_seconds 以 `le`（小於或等於）分桶累計請求數，加上總和與總數；量表 process_resident_memory_bytes 是此刻的記憶體。從 toolbox 這個 Pod 經由 Service 讀它，每次讀到的是其中一個 Pod 的數字。' },
        { type: 'example', id: 'kub12-metrics' },
        { type: 'table', head: ['型別', '意思', '怎麼用', '例子'], rows: [
          ['counter（計數器）', '從程式啟動起只增不減，重啟就歸零', '看增加的速率，不看絕對值', 'http_requests_total、kube_pod_container_status_restarts_total'],
          ['gauge（量表）', '此刻的值，可升可降', '直接看值、取平均或最大值', 'process_resident_memory_bytes、node_memory_MemAvailable_bytes'],
          ['histogram（直方圖）', '依上限分桶的累計次數，加上總和與總數', '估計百分位數，例如 p95', 'http_request_duration_seconds_bucket'],
        ] },
        { type: 'p', text: '叢集層級的指標通常來自三個地方：kube-state-metrics 把 API 物件的狀態轉成指標（例如每個容器的重啟次數 kube_pod_container_status_restarts_total、Pod 的階段 kube_pod_status_phase、容器的 requests kube_pod_container_resource_requests）；node-exporter 以 DaemonSet 在每個節點公開作業系統的指標（node_cpu_seconds_total 等）；kubelet 內建的 cAdvisor 公開每個容器的用量（container_cpu_usage_seconds_total、container_memory_working_set_bytes）。PromQL 只在課文說明，例如 `rate(http_requests_total{code="500"}[5m])` 是過去 5 分鐘平均每秒增加幾個 500，`increase(kube_pod_container_status_restarts_total[15m])` 是過去 15 分鐘重啟了幾次——儀表板上的重啟序列就是這種算法。模擬環境沒有 Prometheus，也不提供這些元件的指令。' },
        { type: 'callout', tone: 'warning', title: '「kubectl top 就是監控」', text: '`kubectl top` 只回答「此刻」：沒有十分鐘前的數字、看不出趨勢，重啟中的容器根本不在清單上，更不會在半夜通知任何人。它適合排查時快速看一眼，也是 HPA 的資料來源；要畫一天的圖、比較上週、在條件持續成立時告警，需要 Prometheus 這類會保存歷史的監控系統。反過來，Prometheus 的數字有抓取間隔與查詢視窗，和 `kubectl top` 此刻的值略有不同是正常的。' },
      ],
    },
    {
      id: 'kub12-s-restarts', title: '重啟次數：Pod 在告訴你什麼',
      blocks: [
        { type: 'p', text: '容器的主程式結束時，kubelet 依 Pod 的 restartPolicy（Deployment 的 Pod 一律是 Always）把它重新啟動，RESTARTS 欄加一，括號裡是距上一次重啟多久，例如 `11 (50s ago)`。如果容器一啟動就結束，kubelet 不會無限快速地重試，而是等待一段逐次加倍的退避時間：10 秒、20 秒、40 秒……最多 5 分鐘；容器順利執行 10 分鐘之後才重設。等待的期間 STATUS 顯示 CrashLoopBackOff。' },
        { type: 'table', head: ['Last State 的 Reason', 'Exit Code', '代表什麼', '下一步'], rows: [
          ['OOMKilled', '137（128 + 9，SIGKILL）', '容器的記憶體用到 limits.memory，被核心強制結束', '看記憶體用量是洩漏還是本來就需要更多；修程式或調高 limits'],
          ['Error', '程式自己的狀態碼，例如 1', '程式自己結束了，通常是設定錯誤或相依服務連不上', '`kubectl logs --previous` 看上一次的最後幾行'],
          ['Completed', '0', '程式正常結束，但 Deployment 期待它一直執行', '確認這是不是應該用 Job 執行的工作'],
          ['（沒有 Last State）', '—', '容器從來沒有結束過', '重啟次數 0，問題不在這裡'],
        ] },
        { type: 'p', text: '下面先看 mailer：它 13:55 才部署，已經重啟 5 次。describe 的 State 是 Waiting（CrashLoopBackOff），Last State 是 Terminated、Reason Error、Exit Code 1；`kubectl logs --previous` 印出上一次執行的日誌，原因一目了然：少了 SMTP_HOST 這個環境變數。再看重啟最多的 cart：它上一次的日誌只有啟動訊息，沒有任何錯誤——程式是被外力結束的，原因要從 Last State 找。' },
        { type: 'example', id: 'kub12-restarts' },
        { type: 'p', text: '`kubectl logs` 預設印出目前這一次執行的日誌，容器剛重啟或正在等待時常常是空的，所以排查重啟一定要加 `--previous`（`-p`）。節點上通常只留著目前與上一次執行的日誌，Pod 被刪除後就一起消失；要回頭看更早的，需要 CICD12 的集中式日誌。' },
        { type: 'callout', tone: 'warning', title: '「CrashLoopBackOff 就是原因」', text: 'CrashLoopBackOff 只說明「容器反覆結束，kubelet 正在等待下一次重啟」，它是結果，不是原因。同樣是 CrashLoopBackOff，cart 是記憶體用到上限被 OOMKilled，mailer 是缺少設定自己結束。把 Pod 刪掉重建、或把 Deployment 重新套用一次，都只會讓同樣的事再發生一次。要看的是 Last State 的 Reason 與 Exit Code，以及 `logs --previous`。' },
        { type: 'p', text: '在儀表板上，重啟次數畫成「過去 15 分鐘重啟了幾次」。cart 一開始幾分鐘就重啟一次，隨著退避拉長到 5 分鐘，15 分鐘內的次數反而從 6 降到 2、3 次。所以用「15 分鐘內重啟超過 2 次」告警時，次數在門檻上下跳動，同一個事故會反覆觸發又恢復；「15 分鐘內有任何重啟」則會被 11:20 那一次無害的重啟叫醒。選「15 分鐘內有任何重啟就告警」與「15 分鐘內重啟超過 2 次」兩條課程的規則比較看看。' },
      ],
    },
    {
      id: 'kub12-s-events', title: '事件：叢集的短期記憶',
      blocks: [
        { type: 'p', text: '事件（Event）是控制平面的元件在處理物件時留下的紀錄：排程器把 Pod 放到哪個節點、kubelet 拉了映像檔、啟動了容器、探針失敗、容器退避重啟。每筆事件有類型（Normal 或 Warning）、原因（Reason，例如 FailedScheduling、BackOff、Unhealthy、FailedMount）、相關的物件與訊息。同一件事重複發生時不會一直新增，而是累計次數，所以 `kubectl events` 的 LAST SEEN 寫成 `49s (x11 over 46m)`：最近一次在 49 秒前，46 分鐘內發生了 11 次。' },
        { type: 'p', text: '排查時先只看 Warning。真實的 kubectl 可以寫 `kubectl get events --field-selector type=Warning`，也可以用較新的 `kubectl events --types=Warning`；模擬環境的 get events 只支援 metadata 開頭的欄位選擇器，所以本課用後者。`kubectl events --for pod/名稱` 只列出和某個物件有關的事件，`describe` 最後的 Events 段落也是同一份資料。' },
        { type: 'example', id: 'kub12-events' },
        { type: 'p', text: '三種 Warning 剛好對應三個問題：mailer 與 cart 的 BackOff（容器反覆結束，前一節）、recommend 的 FailedScheduling。FailedScheduling 的訊息要從頭讀到尾：「0/3 nodes are available」之後逐項說明每台節點為什麼不行——1 台有控制平面的 taint、2 台 Insufficient cpu；後面的 preemption 一段是說，即使把優先權較低的 Pod 擠掉也騰不出空間。注意它說的是 CPU 的 requests 不夠，不是 CPU 真的用完了，下一節會看到兩者差很多。' },
        { type: 'table', head: ['常見的 Warning', '通常的意思', '接著看'], rows: [
          ['FailedScheduling', '沒有節點放得下：資源 requests 不夠、taint、親和性、PVC 綁不上', '`describe node` 的 Allocated resources、Pod 的 requests 與 nodeSelector'],
          ['BackOff', '容器反覆結束（或映像檔拉不下來時的 ImagePullBackOff）', 'Last State、`logs --previous`；映像檔名稱與登入'],
          ['Unhealthy', '探針失敗（KUB03）', '探針的路徑、埠與時間設定，程式的啟動時間'],
          ['FailedMount', 'Volume 掛不上（KUB08）', 'PVC 的狀態、Secret 與 ConfigMap 是否存在'],
          ['Evicted', '節點資源吃緊，kubelet 驅逐了 Pod', '節點的 MemoryPressure／DiskPressure，Pod 的 requests 與 limits'],
        ] },
        { type: 'callout', tone: 'warning', title: '「事件會一直留著，事後再查就好」', text: '事件是暫時的：API server 預設只保留一小時（kube-apiserver 的 `--event-ttl`），過期就刪除，以免大量事件撐爆 etcd。昨天半夜卡住的排程、上週發生的驅逐，今天早上用 kubectl 已經查不到了；沒有 Warning 也不代表一切正常，可能只是已經過期。需要保留時，用事件匯出器把事件送進集中式日誌（CICD12），或改看保存歷史的指標，例如 Prometheus 裡的重啟次數。' },
      ],
    },
    {
      id: 'kub12-s-capacity', title: '容量：requests、實際用量與什麼時候加節點',
      blocks: [
        { type: 'p', text: '容量有兩種算法，而且兩者常常差很多。已分配（allocated）是節點上所有 Pod 的 requests 加總，除以節點的 allocatable；排程器只看這個數字——一個 Pod 放得下，必須它的 requests 加上已分配的不超過 allocatable。實際使用（usage）是 `kubectl top` 量到的用量，決定節點會不會真的變慢。KUB03 設定 requests 時，等於向排程器「預約」資源：預約了沒用，別人也不能用。' },
        { type: 'example', id: 'kub12-capacity' },
        { type: 'p', text: 'shop 叢集的 node-01 已分配 85%、node-02 80% 的 CPU，實際卻只用了 16% 與 34%：兩台合計預留了 3300m，只用了約 1000m，容量使用率大約只有已分配的三分之一。原因一目了然：catalog 每個副本 requests 800m，實際只用約 151m，三個副本白白預留了約 1950m；frontend 的 300m 則接近它實際用的約 250m。這種「requests 遠高於用量」稱為過度預留（overcommitted requests），它讓叢集看起來滿了：recommend 卡在 Pending，Cluster Autoscaler 這類工具甚至會因此加節點，花錢買一台幾乎閒著的機器。' },
        { type: 'table', head: ['你看到的', '代表什麼', '先做什麼'], rows: [
          ['已分配高、用量低，Pod Pending', 'requests 設得太大', '依量到的用量（尖峰再加一些餘裕）調降 requests'],
          ['已分配高、用量也高，Pod Pending', '叢集真的滿了', '加節點，或請 Cluster Autoscaler 自動加'],
          ['已分配低、用量高', 'requests 設得太小，Pod 搶著用超過預約的 CPU', '調高 requests，避免節點被排得太滿'],
          ['某些時段才 Pending、才滿載', '尖峰時段的容量不夠', '依尖峰的用量規劃，或用 HPA 加上節點自動擴展'],
          ['少一台節點時其他節點放不下', '沒有容錯的餘裕', '保留至少一台節點的空間（N+1）'],
        ] },
        { type: 'p', text: '什麼時候真的要加節點？當 requests 已經調整得接近實際用量（尖峰加上合理的餘裕），已分配與實際使用率仍長時間偏高，或 Pod 反覆因 Insufficient cpu／memory 卡在 Pending；以及只要少了一台節點（故障、升級時排空），剩下的節點就放不下它的 Pod。shop 叢集只有兩台工作節點、各已分配八成以上，任何一台出事，另一台都接不住。在雲端的託管 Kubernetes，Cluster Autoscaler 會在看到因資源不足而 Pending 的 Pod 時加節點，在節點的 requests 長時間偏低時把它排空並移除；它看的是 requests，不是實際用量，所以 requests 不準時，自動擴展也跟著不準。節點自動擴展只在課文說明，模擬環境不提供。' },
        { type: 'callout', tone: 'warning', title: '「kubectl top 只用了 25%，所以還放得下」', text: '排程器完全不看實際用量，只看 requests。節點實際只用 16%，但 requests 已經分配 85%，600m 的 Pod 就是放不下，事件寫的 Insufficient cpu 說的正是 requests。反過來，requests 也不能隨便壓低到比平常用量還小：Pod 會被排得更擠，尖峰時大家搶同一顆 CPU，延遲一起變高；記憶體更危險，節點的記憶體不夠時 kubelet 會驅逐 Pod。requests 應該依量到的用量設定，並定期檢查。' },
      ],
    },
    {
      id: 'kub12-s-alerts', title: '把訊號變成告警：節點 CPU 與重啟',
      blocks: [
        { type: 'p', text: 'CICD11 的告警原則在叢集上一樣適用：會把人叫醒的告警，應該針對使用者看得到的症狀（RED：錯誤率、延遲）；資源與叢集的訊號（USE、重啟、Pending）多半是原因，適合用 warning 等級提早提醒，並在工作時間處理。回到儀表板，選「節點 CPU 超過 80% 立即告警」與「節點 CPU 超過 80%，持續 10 分鐘」比較：前者被 08:45 五分鐘的報表批次工作叫醒一次，後者讓它停在等待中，但特賣開始後要 10 分鐘才觸發。兩條規則都看不到 cart 的事故——那段時間 CPU 一點也不忙，壞的是記憶體上限。' },
        { type: 'p', text: '下面是同樣六個小時的資料，只標出和容量有關的特賣事故。調整門檻、持續時間或視窗，找一條「特賣開始後 5 分鐘內觸發、又不會被批次工作叫醒」的容量警告。改了欄位，結果列出每個事故的偵測延遲與誤報。' },
        { type: 'example', id: 'kub12-capacity-board' },
        { type: 'list', items: [
          '節點：CPU 或記憶體的使用率持續偏高（持續時間要比批次工作長），節點 NotReady 或有 Pressure 的狀況。',
          '容量：已分配的 requests 持續高於某個比例（例如 80%）、有 Pod 因資源不足 Pending 超過幾分鐘；這是規劃的訊號，不必半夜叫人。',
          'Pod：一段時間內重啟超過若干次，或容器 OOMKilled；用較長的視窗或持續時間，避免單次重啟與退避造成的跳動。',
          '服務：錯誤率與延遲超過目標（KUB14 的 SLO 會把它講得更精確），這才是要立刻處理的。',
        ] },
        { type: 'callout', tone: 'tip', title: '先問「收到之後要做什麼」', text: '每條告警都應該對應一個動作：節點 CPU 持續偏高 → 看是哪些 Pod、要不要擴展或加節點；Pending 超過 10 分鐘 → 看 FailedScheduling 的原因；重啟次數暴增 → 看 Last State 與 `logs --previous`。說不出動作的告警，改成儀表板上的一張圖就好；同一個事故觸發太多條告警，值班的人很快就會開始忽略它們。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'kub12-q-use-red', prompt: 'USE 方法與 RED 方法在叢集監控中各適合看什麼？',
      options: ['USE 看節點這類資源，RED 看處理請求的服務', 'USE 看服務的請求，RED 看節點的 CPU 與記憶體', '兩者都只用來寫告警規則，不用在儀表板上', 'USE 只適用於實體機器，容器與 Pod 不適用'],
      answer: 0, explanation: 'USE（使用率、飽和度、錯誤）描述資源，例如節點的 CPU 與記憶體；RED（請求率、錯誤、處理時間）描述服務，回答使用者是否受影響。第二個選項把兩者對調了；兩種方法本來就是用來決定儀表板要放哪些圖與告警看什麼，不限於告警；容器與 Pod 使用的 CPU、記憶體也是資源，一樣適用 USE。',
    },
    {
      id: 'kub12-q-top', prompt: '`kubectl top pods` 顯示的數字是從哪裡來的？',
      options: ['從 Prometheus 的資料庫查出過去一小時的平均值', 'kubectl 登入每個節點，執行 top 指令後彙整', '從 metrics-server，它定期向 kubelet 取得最新用量', '從每個 Pod 的 /metrics 頁面讀取記憶體的量表'],
      answer: 2, explanation: '`kubectl top` 讀的是 Metrics API，由 metrics-server 提供：它定期向每個節點的 kubelet 取得容器此刻的 CPU 與記憶體，只保留最新的一份。它不查 Prometheus，也沒有一小時的歷史；kubectl 不會登入節點；應用程式的 /metrics 是 Prometheus 抓取的來源，metrics-server 不讀它。',
    },
    {
      id: 'kub12-q-crashloop', prompt: 'Pod 的 STATUS 是 `CrashLoopBackOff`，代表什麼？',
      options: ['映像檔拉不下來，kubelet 正在等待後重新下載', '容器反覆結束，kubelet 等待退避時間後再重啟', '節點的資源不夠，Pod 正在等待排程器分配節點', 'Pod 已經被刪除，正在等待寬限期結束後消失'],
      answer: 1, explanation: 'CrashLoopBackOff 表示容器一再結束，kubelet 在每次重啟之間等待逐次加倍的退避時間（最多 5 分鐘）；它是結果，原因要看 Last State 與 `logs --previous`。映像檔拉不下來是 ImagePullBackOff；等待排程是 Pending；刪除中的 Pod 顯示 Terminating。',
    },
    {
      id: 'kub12-q-oom', prompt: '`describe pod` 顯示 Last State 是 Terminated、Reason `OOMKilled`、Exit Code 137。最合理的下一步是什麼？',
      options: ['替節點加大 CPU，讓容器處理得更快就不會結束', '查記憶體用量是洩漏還是本來就需要更多，再修程式或調高 limits', '看 `kubectl logs --previous`，程式一定已經寫下被結束的原因', '把 restartPolicy 改成 Never，就不會再重複重新啟動'],
      answer: 1, explanation: 'OOMKilled 是容器的記憶體用到 limits.memory，被核心以 SIGKILL（137 = 128 + 9）強制結束；要判斷是記憶體洩漏還是需求本來就比較大，再修程式或調高 limits。CPU 和這件事無關；被 SIGKILL 結束的程式來不及寫任何訊息，上一次的日誌通常只有正常的內容；Deployment 的 Pod 只能用 Always，就算能改成 Never，服務也只是停著不動。',
    },
    {
      id: 'kub12-q-events', prompt: '昨晚半夜有 Pod 一直無法排程，今天早上 `kubectl get events` 卻一筆 Warning 都查不到。最可能的原因是什麼？',
      options: ['問題已經自動修好，排程器刪除了舊的警告', 'Warning 事件只會寫在節點的系統日誌裡', '`kubectl get events` 預設只列出 Normal 類型', '事件只保留一段時間，預設約一小時，已經過期'],
      answer: 3, explanation: 'API server 預設只保留事件一小時（`--event-ttl`），過期就刪除，所以隔天早上查不到；需要保留時要把事件匯出到集中式日誌。排程器不會因為問題解決就刪掉事件；事件是 API 物件，不只在節點的日誌裡；`kubectl get events` 預設同時列出 Normal 與 Warning。',
    },
    {
      id: 'kub12-q-capacity', prompt: '兩台節點的 CPU requests 已分配 85% 與 80%，`kubectl top nodes` 卻只量到 16% 與 34%，新的 Pod 仍然 Pending（Insufficient cpu）。為什麼？',
      options: ['排程器依 requests 加總判斷，不看實際用量', 'metrics-server 的數字落後，排程器看到的是舊的用量', '控制平面 cp-01 的 CPU 用完了，排程器無法運作', '`kubectl top` 只計算了一部分 Pod，實際用量其實接近 85%'],
      answer: 0, explanation: '排程器只看 requests：新 Pod 的 requests 加上節點已分配的超過 allocatable 就放不下，事件的 Insufficient cpu 說的就是這個；實際用量再低也沒用。排程器根本不讀 metrics-server 的用量；控制平面的負載和 Insufficient cpu 無關，cp-01 只是因為 taint 不接受一般的 Pod；`kubectl top` 列出了所有有指標的 Pod，用量確實很低，問題是 requests 設得太大。',
    },
    {
      id: 'kub12-q-add-node', prompt: '下列哪一種情況最適合以加節點來解決？',
      options: ['某個 Deployment 的 requests 是實際用量的五倍，新 Pod 因此卡在 Pending', '有一個 Pod 一直處於 CrashLoopBackOff，重啟次數持續增加', '`kubectl top nodes` 在某一分鐘看到 CPU 衝到 90%', 'requests 已接近實際用量，節點仍長時間滿載，少一台就放不下'],
      answer: 3, explanation: 'requests 已經合理、使用率仍長時間偏高，而且少一台節點時其他節點接不住，才是真的容量不足。requests 是用量的五倍時應先調降 requests，加節點只是花錢買閒置的預約；CrashLoopBackOff 是程式或設定的問題，多一台節點也一樣會重啟；一分鐘的尖峰可能只是批次工作，要看持續的趨勢。',
    },
    {
      id: 'kub12-q-flap', prompt: '規則「15 分鐘內重啟超過 2 次」在 cart 反覆重啟的那一段時間發出了 5 次通知。最可能的原因是什麼？',
      options: ['cart 的五個副本各自觸發了一次', 'Prometheus 每次抓取都會重新送出一次通知', '退避時間拉長，15 分鐘內的重啟次數在門檻上下跳動', '這條規則沒有設定持續時間，所以每分鐘都會通知'],
      answer: 2, explanation: 'CrashLoopBackOff 的退避一路加倍到 5 分鐘，15 分鐘內的重啟次數從 6 次降到 2、3 次，在門檻 2 的上下跳動，規則因此觸發、恢復、再觸發，同一個事故通知了好幾次。cart 只有一個副本；通知次數取決於觸發期間，不是抓取次數；沒有持續時間只會讓它更早觸發，觸發中的分鐘不會重複通知。',
    },
  ],
  terminal: { machines: [WS], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    dashboards: [
      {
        id: 'kub12-day', title: 'shop 叢集的六個小時：節點、Pod 與結帳',
        description: '今天 08:00–14:00 的叢集儀表板（示意資料，第 0 分鐘是 08:00）：工作節點的 CPU、Pending 的 Pod、過去 15 分鐘的容器重啟次數、每秒請求數，以及結帳的 p95 延遲與錯誤率。兩段底色是事故：限時特賣與 cart 的反覆重啟。課程的規則有四條：兩條節點 CPU、兩條重啟次數。',
        dashboard: day([SALE, CART_LOOP], [
          CPU_NOW, CPU_10,
          { id: 'restart-any', label: '15 分鐘內有任何重啟就告警', series: 'restarts', op: '>', threshold: 0, forMinutes: 0, severity: 'critical' },
          { id: 'restart-3', label: '15 分鐘內重啟超過 2 次', series: 'restarts', op: '>', threshold: 2, forMinutes: 0, severity: 'critical' },
        ]),
      },
      {
        id: 'kub12-capacity-board', title: '同樣六個小時，只看容量事故',
        description: '和上一個儀表板相同的資料（示意資料），只標出限時特賣這個容量事故。從「節點 CPU 超過 80%，持續 10 分鐘」開始，調整門檻、持續時間或視窗，比較偵測延遲與誤報。',
        dashboard: day([SALE], [CPU_10, CPU_NOW]),
      },
    ],
    exercises: [
      {
        id: 'kub12-x-cpu-rule', kind: 'table', title: '節點 CPU 持續 10 分鐘的規則',
        statement: '在「shop 叢集的六個小時」選擇「節點 CPU 超過 80%，持續 10 分鐘」。它第一次觸發在第幾分鐘？限時特賣這個事故的偵測延遲是幾分鐘？這條規則漏掉了幾個事故？',
        blanks: [
          { id: 'first', label: '第一次觸發的分鐘', query: { task: 'alert', dashboard: 'kub12-day', rule: 'cpu-10', metric: 'first-firing' } },
          { id: 'delay', label: '特賣的偵測延遲（分鐘）', query: { task: 'alert', dashboard: 'kub12-day', rule: 'cpu-10', metric: 'detection-delay', incident: 'sale' } },
          { id: 'missed', label: '漏掉的事故（個）', query: { task: 'alert', dashboard: 'kub12-day', rule: 'cpu-10', metric: 'missed' } },
        ],
        hints: ['持續 10 分鐘：條件連續成立的第 1 到第 10 分鐘是等待中，第 11 分鐘才觸發。', '08:45 的批次工作只持續 5 分鐘。', '看事故的偵測表：cart 的事故期間 CPU 有沒有變高？'],
        explanation: '節點 CPU 從第 150 分鐘（10:30）起超過 80%，第 150–159 分鐘是連續成立的第 1–10 分鐘，停在等待中，第 160 分鐘才觸發，偵測延遲 10 分鐘。08:45 的批次工作只超過 80% 五分鐘，停在等待中，沒有發出通知。cart 的事故是記憶體上限造成的重啟，節點 CPU 完全沒有上升，這條規則漏掉了它：資源的規則只看得到資源的問題。',
        mistakes: [
          { answer: { first: '150', delay: '0', missed: '1' }, why: '忘了持續時間：條件一成立就觸發的是「立即告警」那條規則' },
          { answer: { first: '45', delay: '10', missed: '1' }, why: '把 08:45 的批次工作當成觸發；它只持續 5 分鐘，停在等待中' },
          { answer: { first: '160', delay: '10', missed: '0' }, why: '以為節點 CPU 的規則也抓得到 cart 的事故；那段時間 CPU 一直在 25% 左右' },
        ],
      },
      {
        id: 'kub12-x-restart-rule', kind: 'table', title: '重啟次數的兩條規則',
        statement: '在「shop 叢集的六個小時」比較兩條重啟次數的規則。「15 分鐘內有任何重啟就告警」發出幾次通知？其中幾次是誤報？「15 分鐘內重啟超過 2 次」發出幾次通知？',
        blanks: [
          { id: 'any', label: '任何重啟：通知（次）', query: { task: 'alert', dashboard: 'kub12-day', rule: 'restart-any', metric: 'notifications' } },
          { id: 'false', label: '任何重啟：誤報（次）', query: { task: 'alert', dashboard: 'kub12-day', rule: 'restart-any', metric: 'false-alerts' } },
          { id: 'three', label: '超過 2 次：通知（次）', query: { task: 'alert', dashboard: 'kub12-day', rule: 'restart-3', metric: 'notifications' } },
        ],
        hints: ['每一段連續的觸發中是一次通知；看「觸發期間」的表。', '11:20（第 200 分鐘）那一次重啟沒有和任何事故重疊。', '「超過 2 次」的觸發期間在 cart 事故裡斷斷續續：每次恢復後再觸發，都是新的通知。'],
        explanation: '「任何重啟」在第 200 分鐘（11:20 那一次無害的重啟）觸發 15 分鐘，第 311 分鐘起因 cart 再觸發並持續到最後，共 2 次通知，第一次是誤報。「超過 2 次」不會被單次重啟叫醒，但 cart 的退避越拉越長，15 分鐘內的次數在 2、3 之間跳動，規則在第 315、337、344、351、355 分鐘各觸發一次，同一個事故通知了 5 次。前者太敏感、後者會跳動；實務上常用較長的視窗（例如 30 分鐘），或加上持續時間，讓同一個事故只通知一次。',
        mistakes: [
          { answer: { any: '1', false: '0', three: '1' }, why: '把每條規則都當成只通知一次；規則在觸發與恢復之間來回時，每次重新觸發都是新的通知' },
          { answer: { any: '2', false: '0', three: '5' }, why: '把 11:20 那一次重啟當成有用的通知；它沒有和任何事故重疊，使用者沒有受影響，是誤報' },
          { answer: { any: '2', false: '1', three: '1' }, why: '以為門檻 2 會一直維持在觸發中；退避拉長之後，15 分鐘內的次數常常只有 2 次，規則就恢復了' },
        ],
      },
      {
        id: 'kub12-x-capacity-rule', kind: 'alert-rule', title: '寫一條容量警告',
        statement: '在「同樣六個小時，只看容量事故」替節點 CPU 寫一條容量警告：限時特賣要在開始後 5 分鐘內觸發，而且不能有任何誤報（08:45 的報表批次工作不能觸發它）。',
        plan: { dashboard: 'kub12-capacity-board', constraints: { detectWithin: 5, maxFalseAlerts: 0 }, reference: { series: 'cpu', op: '>', threshold: 80, forMinutes: 5 } },
        hints: [
          '批次工作讓 CPU 超過 80% 整整 5 分鐘；持續時間要讓它停在等待中。',
          '持續時間每多 1 分鐘，特賣的偵測就晚 1 分鐘；10 分鐘太長。',
          '也可以從門檻下手：批次工作最高約 87%，特賣期間都在 90% 以上。',
        ],
        explanation: '「節點 CPU 超過 80%，持續 5 分鐘」：批次工作的 5 分鐘都停在等待中，第 50 分鐘降回 22% 就結束；特賣從第 150 分鐘起超過 80%，第 155 分鐘觸發，延遲 5 分鐘，沒有誤報。把門檻提高到 90% 立即告警也符合條件（特賣一開始就觸發），但它只比批次工作的最高值高幾個百分點，雜訊或稍長的批次就可能誤報；靠持續時間過濾短暫的尖峰通常比較穩定。容量警告屬於 warning：它提醒團隊「再來一次特賣就不夠了」，處理方式是調整 requests、HPA 與節點數量。',
        mistakes: [
          { answer: { series: 'cpu', op: '>', threshold: '80', agg: 'none', window: '', for: '10' }, why: '持續 10 分鐘：沒有誤報，但特賣開始 10 分鐘後才觸發，超過 5 分鐘的要求' },
          { answer: { series: 'cpu', op: '>', threshold: '80', agg: 'none', window: '', for: '0' }, why: '立即告警：08:45 的批次工作也會觸發，是一次誤報' },
          { answer: { series: 'cpu', op: '>', threshold: '80', agg: 'avg', window: '10', for: '0' }, why: '10 分鐘平均要等視窗裡累積夠多的高值，特賣開始 7 分鐘後才觸發' },
          { answer: { series: 'restarts', op: '>', threshold: '0', agg: 'none', window: '', for: '0' }, why: '重啟次數和容量無關：特賣期間沒有任何重啟，事故被漏掉，11:20 與 cart 的重啟反而變成誤報' },
        ],
      },
    ],
  },
};
