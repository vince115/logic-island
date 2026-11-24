/*
 * KUB10 Autoscaling (KUB-3, terminal-sim; the blueprint's cluster-sim activity as terminal content). A terminal lesson on
 * the autoscaling profile (engine stage E40 on E32–E39): the made-up shop team's workstation ops-ws (user yuki) with kubectl
 * and the admin kubeconfig of the fictional three-node cluster (cp-01 tainted, node-01, node-02, 2 CPUs each) with
 * metrics-server. catalog (requests 200m / 128Mi, limits 500m / 256Mi) receives a declared load on its Service: a sale of
 * 520 requests per second until 10:03, then 80 (1m of CPU per request per second). Covered: requests (scheduling) versus
 * limits (CPU throttling, memory OOMKilled with exit code 137), the three QoS classes, Allocated resources and a Pending
 * pod (Insufficient cpu); metrics-server, the Metrics API and kubectl top; the HPA formula ⌈current × value ÷ target⌉ with
 * the 0.1 tolerance, min/max, the 15 s sync and the default scale-up limit, kubectl autoscale and an autoscaling/v2
 * manifest, conditions and events, the missing CPU request; metric sources (custom and external metrics, adapters and
 * KEDA-style scalers are prose); flapping, the 300 s scale-down stabilization and behavior; a Deployment manifest with
 * replicas (or GitOps) fighting the HPA; node autoscaling (Cluster Autoscaler, Karpenter-style provisioners) and VPA as
 * prose, with the Pending pods an HPA creates on a full cluster shown in the terminal. Exercises: add the CPU request an
 * HPA needs, create an HPA and wait for it to settle, add a scale-down stabilization window to stop flapping, and read the
 * HPA's current utilization (variants with other loads). Hosts, users, images and the cluster are made up. Every
 * transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { TerminalKubeLoad } from '@/lib/terminal/kube-metrics-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const TOOLS = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The shop's services: each keeps running, logs one line, and handles SIGTERM in a second.
const service = (name: string, port: number, log: string, created: string, more: Partial<TerminalImage> = {}): TerminalImage => ({
  name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: TOOLS,
  logs: [log], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } }, ...more,
});
const IMAGES: TerminalImage[] = [
  service('shop/catalog:2.2', 8080, 'catalog 2.2 listening on :8080', '2026-11-23 09:00:00'),
  service('shop/frontend:1.6', 3000, 'frontend 1.6 listening on :3000', '2026-11-20 09:00:00'),
  service('shop/cart:1.0', 8081, 'cart 1.0 listening on :8081', '2026-11-21 09:00:00'),
  // The nightly report builds its whole result in memory: 40 MB at the start, 5 MB more every second.
  service('shop/report:3.0', 9000, 'report 3.0 building the daily sales report', '2026-11-19 09:00:00', { memory: { start: 40_000_000, growth: 5_000_000 } }),
  // A batch job that keeps one CPU busy.
  service('shop/reindex:1.2', 9100, 'reindex 1.2 rebuilding the search index', '2026-11-22 09:00:00', { cpu: 100 }),
];
const WORKERS = ['node-01', 'node-02'];

const deployment = (name: string, image: string, replicas: number | null, port: number, resources: string[] | null) => yaml(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', ...replicas === null ? [] : [`  replicas: ${replicas}`], '  selector:', '    matchLabels:', `      app: ${name}`,
  '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:', `        - containerPort: ${port}`,
  ...resources ? ['        resources:', ...resources.map(x => `          ${x}`)] : []);
const svc = (name: string, port: number) => yaml('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', '  selector:', `    app: ${name}`, '  ports:', '  - port: 80', `    targetPort: ${port}`);
const hpa = (name: string, min: number, max: number, cpu: number, more: string[] = []) => yaml('apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler', 'metadata:', `  name: ${name}`, 'spec:',
  '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment', `    name: ${name}`, `  minReplicas: ${min}`, `  maxReplicas: ${max}`, '  metrics:', '  - type: Resource', '    resource:', '      name: cpu',
  '      target:', '        type: Utilization', `        averageUtilization: ${cpu}`, ...more.map(x => `  ${x}`));

const CATALOG_RES = ['requests:', '  cpu: 200m', '  memory: 128Mi', 'limits:', '  cpu: 500m', '  memory: 256Mi'];
const CATALOG_YAML = deployment('catalog', 'shop/catalog:2.2', 2, 8080, CATALOG_RES);
const CATALOG_SVC = svc('catalog', 8080);
const FRONTEND_YAML = deployment('frontend', 'shop/frontend:1.6', 2, 3000, ['requests:', '  cpu: 100m', '  memory: 64Mi', 'limits:', '  cpu: 100m', '  memory: 64Mi']);
const TOOLBOX_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: toolbox', 'spec:', '  containers:', '  - name: toolbox', '    image: shop/frontend:1.6');
const REPORT_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: report', 'spec:', '  containers:', '  - name: report', '    image: shop/report:3.0', '    resources:', '      requests:', '        cpu: 100m',
  '        memory: 64Mi', '      limits:', '        memory: 64Mi');
const REINDEX_YAML = deployment('reindex', 'shop/reindex:1.2', 3, 9100, ['requests:', '  cpu: 1500m', '  memory: 256Mi']);
const CATALOG_HPA = hpa('catalog', 2, 8, 50);

type Manifest = NonNullable<TerminalKube['manifests']>[number];
const at = (text: string, time: string, f: string): Manifest => ({ text, at: `2026-11-24 ${time}`, file: f });
const load = (name: string, rps: number[], start = '09:55:00'): TerminalKubeLoad => ({ service: name, start: `2026-11-24 ${start}`, minutes: rps.length, rps, cpuPerRequest: '1m' });
const kubeOf = (manifests: Manifest[], loads: TerminalKubeLoad[]): TerminalKube => ({
  images: [{ name: 'shop/catalog:2.2', nodes: WORKERS }, { name: 'shop/frontend:1.6', nodes: WORKERS }, { name: 'shop/cart:1.0', nodes: WORKERS }, { name: 'shop/report:3.0', seconds: 3 },
    { name: 'shop/reindex:1.2', seconds: 3 }],
  manifests, metricsServer: true, load: loads,
});
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'autoscaling', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  docker: { images: IMAGES },
  kube,
});
const repeat = (n: number, v: number) => Array.from({ length: n }, () => v);
const SALE = [...repeat(8, 520), ...repeat(52, 80)];
const BOOT = [at(TOOLBOX_YAML, '09:30:00', 'toolbox.yaml'), at(CATALOG_YAML, '09:40:00', 'catalog.yaml'), at(CATALOG_SVC, '09:40:00', 'catalog-svc.yaml'), at(FRONTEND_YAML, '09:40:00', 'frontend.yaml')];

const WS = workstation('kub10-ws', 'ops-ws（shop 團隊的工作站：特賣開始，catalog 的流量正在上升）', [
  file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), file('/home/yuki/shop/report.yaml', REPORT_YAML), file('/home/yuki/shop/reindex.yaml', REINDEX_YAML),
  file('/home/yuki/shop/catalog-hpa.yaml', CATALOG_HPA),
], kubeOf(BOOT, [load('catalog', SALE)]));

// Exercise 1: cart has an HPA, but its container only requests memory.
const CART_RES = ['requests:', '  memory: 64Mi'];
const CART_YAML = deployment('cart', 'shop/cart:1.0', 2, 8081, CART_RES);
const CART_FIXED = deployment('cart', 'shop/cart:1.0', 2, 8081, ['requests:', '  cpu: 100m', '  memory: 64Mi']);
const CART_LIMITS = deployment('cart', 'shop/cart:1.0', 2, 8081, ['requests:', '  memory: 64Mi', 'limits:', '  memory: 128Mi']);
const CART_HPA = hpa('cart', 2, 6, 60);
const CART = workstation('kub10-cart', 'ops-ws（cart 的 HPA 一直顯示 <unknown>）', [file('/home/yuki/shop/cart.yaml', CART_YAML), file('/home/yuki/shop/cart-hpa.yaml', CART_HPA)],
  kubeOf([at(svc('cart', 8081), '09:30:00', 'cart-svc.yaml'), at(CART_YAML, '09:30:00', 'cart.yaml'), at(CART_HPA, '09:31:00', 'cart-hpa.yaml')], [load('cart', repeat(90, 170), '09:30:00')]));

// Exercise 2: the sale has started and catalog has no HPA yet.
const SALE_KUBE = (rps: number) => kubeOf([at(CATALOG_YAML, '09:40:00', 'catalog.yaml'), at(CATALOG_SVC, '09:40:00', 'catalog-svc.yaml')], [load('catalog', repeat(60, rps), '09:50:00')]);
const SALE_WS = workstation('kub10-sale', 'ops-ws（特賣開始了，catalog 還是固定 2 個副本）', [file('/home/yuki/shop/catalog.yaml', CATALOG_YAML)], SALE_KUBE(900));

// Exercise 3: an HPA whose scale-down has no stabilization window, and a load that comes and goes every minute.
const FLAP_HPA = hpa('catalog', 2, 8, 50, ['behavior:', '  scaleDown:', '    stabilizationWindowSeconds: 0']);
const WAVES = Array.from({ length: 60 }, (_, i) => (i % 2 ? 60 : 600));
const FLAP = workstation('kub10-flap', 'ops-ws（catalog 的副本數每分鐘上上下下）', [file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), file('/home/yuki/shop/catalog-hpa.yaml', FLAP_HPA)],
  kubeOf([at(CATALOG_YAML, '09:40:00', 'catalog.yaml'), at(CATALOG_SVC, '09:40:00', 'catalog-svc.yaml'), at(FLAP_HPA, '09:45:00', 'catalog-hpa.yaml')], [load('catalog', WAVES, '09:45:00')]));

// Exercise 4: how busy is catalog right now, as the HPA sees it (the variants carry other loads).
const WATCH_KUBE = (rps: number) => kubeOf([at(CATALOG_YAML, '09:40:00', 'catalog.yaml'), at(CATALOG_SVC, '09:40:00', 'catalog-svc.yaml'), at(CATALOG_HPA, '09:41:00', 'catalog-hpa.yaml')],
  [load('catalog', repeat(60, rps), '09:45:00')]);
const WATCH = workstation('kub10-watch', 'ops-ws（值班：catalog 現在多忙？）', [file('/home/yuki/shop/catalog-hpa.yaml', CATALOG_HPA)], WATCH_KUBE(330));

const UTILIZATION = "kubectl get hpa catalog -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}'";

export const KUB10: LessonContent = {
  lessonId: 'KUB10',
  motivation: '週五晚上八點，shop 團隊的限時特賣開始了。商品目錄服務 catalog 平常兩個副本綽綽有餘，這時每秒的請求數卻在幾分鐘內翻了好幾倍：回應越來越慢，值班的 yuki 手忙腳亂地 `kubectl scale` 加副本；特賣結束後又沒人記得縮回去，多出來的 Pod 白白佔著節點到隔天。KUB04 的 Deployment 能「永遠維持三個」，但流量不會永遠一樣。這堂課讓叢集自己決定要幾個：先替容器寫好資源請求與上限（requests 與 limits），排程器才知道每個 Pod 要佔多少、節點才知道什麼時候該節流或殺掉它；再由 metrics-server 收集用量，交給 Horizontal Pod Autoscaler（HPA）依 CPU 使用率每 15 秒算一次該有幾個副本。你會在 ops-ws 上看到 HPA 怎麼一步步擴展、為什麼它在流量下降後不急著縮減、什麼設定會讓副本數忽大忽小（擴展抖動），以及 Pod 加得出來、節點卻放不下時，節點擴展要怎麼接手。學完之後，你能讓應用隨流量自動擴展與縮減，也知道它背後每一個數字從哪裡來。',
  sections: [
    {
      id: 'kub10-s-resources', title: '資源請求與上限：排程看 requests，執行看 limits',
      blocks: [
        { type: 'p', text: '每個容器可以在 `resources` 底下寫兩組數字。requests（資源請求）是「我至少需要這麼多」，limits（資源上限）是「我最多只能用這麼多」。兩者的用途完全不同：排程器只看 requests，把 Pod 放到 requests 還放得下的節點；節點上的 kubelet 與 Linux 核心（cgroup）則依 limits 限制容器實際能用的量。CPU 以核心為單位，`1` 或 `1000m` 是一顆 CPU，`200m` 是五分之一顆；記憶體以位元組為單位，常寫成 `128Mi`（2 的冪次）或 `128M`（10 的冪次）。' },
        { type: 'table', head: ['', 'requests（資源請求）', 'limits（資源上限）'], rows: [
          ['誰在用', 'kube-scheduler 的 NodeResourcesFit：節點的 allocatable 減去已排上去的 requests 總和，夠才放', 'kubelet 設定 cgroup，由 Linux 核心在執行時強制'],
          ['CPU 超過時', '可以超過 requests（節點有空閒時就用得到）', '被節流（throttled）：CFS quota 每個週期只給這麼多時間，程式變慢但不會被殺'],
          ['記憶體超過時', '可以超過；但節點記憶體不足時，超過 requests 越多越先被驅逐', '核心的 OOM killer 殺掉容器：Reason `OOMKilled`、Exit Code 137（128 + SIGKILL 的 9）'],
          ['沒寫的時候', '只寫 limits 時，requests 預設等於 limits；兩者都沒寫就是 0', '不設上限，可以用到節點剩下的所有資源'],
          ['HPA', '使用率的分母：用量 ÷ requests', '不參與計算'],
        ] },
        { type: 'p', text: '依每個容器有沒有寫、寫得是否相等，Pod 會被歸入三種 QoS class（服務品質等級），寫在 `status.qosClass`。節點的記憶體或磁碟吃緊時，kubelet 依這個順序挑選要驅逐的 Pod：BestEffort 最先，其次是用量超過 requests 的 Burstable，Guaranteed 最後。' },
        { type: 'table', head: ['QoS class', '條件', '例子'], rows: [
          ['Guaranteed', '每個容器的 cpu 與 memory 都有 limits，而且 requests 等於 limits（或沒寫 requests）', 'frontend：requests 與 limits 都是 100m／64Mi'],
          ['Burstable', '至少一個容器有 requests 或 limits，但不符合 Guaranteed', 'catalog：requests 200m／128Mi，limits 500m／256Mi'],
          ['BestEffort', '所有容器都沒有任何 requests 與 limits', 'toolbox：什麼都沒寫'],
        ] },
        { type: 'p', text: '下面的範例先看 catalog 的設定與三種 QoS，`describe node` 的 Allocated resources 是這個節點上所有 Pod 的 requests 與 limits 總和（limits 加總可以超過 100%，叫做超賣 overcommit）。接著套用每個副本要 1500m 的 reindex：兩個工作節點各剩不到 2 顆 CPU，前兩個副本各佔一個節點，第三個找不到放得下的節點，停在 Pending，事件寫著 `Insufficient cpu`——即使節點實際上很閒，只要 requests 加總滿了就放不下。最後的 report 是一個會把整份報表放進記憶體的工作，記憶體每秒多 5 MB，碰到 64Mi 的 limit 就被殺掉、重新啟動，幾次之後進入 CrashLoopBackOff。' },
        { type: 'example', id: 'kub10-resources' },
        { type: 'callout', tone: 'warning', title: 'CPU 超過上限不會被殺，記憶體會', text: '常有人以為「容器用超過 limits 就會被重啟」。這只對記憶體成立：記憶體無法「少給一點」，用到上限的那一刻核心只能殺掉行程（OOMKilled）。CPU 是可以分時的資源，超過 limits 時只會被節流，程式照樣執行、只是變慢，Pod 狀態完全正常，所以 CPU limit 設得太低的症狀是延遲升高，而不是錯誤或重啟。反過來，requests 設得太高會讓節點「看起來滿了」而放不下新 Pod，設得太低則讓排程器把太多 Pod 塞進同一個節點。好的起點是用 `kubectl top` 觀察實際用量，再把 requests 設在平常的用量附近。' },
      ],
    },
    {
      id: 'kub10-s-metrics', title: 'metrics-server 與 kubectl top：用量從哪裡來',
      blocks: [
        { type: 'p', text: '要依用量擴展，先要有人量用量。每個節點的 kubelet（內建的 cAdvisor）知道自己節點上每個容器用了多少 CPU 與記憶體；metrics-server 是叢集裡的一個 Deployment（在 kube-system 命名空間），預設每 15 秒向所有 kubelet 收集一次，只保留最新的一份，透過 Kubernetes API 的擴充 `metrics.k8s.io`（Metrics API）提供出去。`kubectl top` 與 HPA 都讀這個 API。' },
        { type: 'table', head: ['元件', '做什麼', '不做什麼'], rows: [
          ['kubelet／cAdvisor', '量自己節點上每個容器的 CPU 與記憶體用量', '不跨節點彙整'],
          ['metrics-server', '定期收集所有節點的數字，提供 `metrics.k8s.io` 的 NodeMetrics、PodMetrics', '不存歷史、不畫圖、不發告警：它只為自動擴展與 `kubectl top` 服務'],
          ['`kubectl top node`／`top pod`', '讀 Metrics API，列出目前的 CPU（millicores）與記憶體', '看不到過去的趨勢；長期監控是 KUB12 的 Prometheus 一類系統'],
          ['HPA 控制器', '每次同步讀 Pod 的用量，和 requests 相比', '不自己量用量；沒有 metrics-server 時只能回報錯誤'],
        ] },
        { type: 'p', text: '`kubectl top nodes` 的 CPU% 與 MEMORY% 是相對於節點 allocatable 的實際用量，和 `describe node` 的 Allocated resources（requests 的加總）是兩回事：一個節點可能 requests 已經 100%、實際 CPU 卻只用了 20%。`kubectl top pods` 可以加 `-A` 看所有命名空間、`--sort-by=cpu` 或 `--sort-by=memory` 由大到小排列、`--containers` 拆到每個容器。剛啟動的 Pod 要等 metrics-server 刮取到它（真實叢集裡通常一兩個收集週期，模擬環境最多 30 秒）才會出現在 top 的結果裡，在那之前直接指名它會得到 Metrics not available 的錯誤。' },
        { type: 'example', id: 'kub10-top' },
        { type: 'p', text: '範例裡每個 catalog Pod 用掉 261m，比它的 requests 200m 還多，也就是使用率 130%；三個副本時每個 174m（87%）。流量經過 catalog 的 Service 平均分給每個就緒的 Pod，所以副本越多、每個 Pod 的用量越低——這正是水平擴展（horizontal scaling，加 Pod）和垂直擴展（vertical scaling，把每個 Pod 的 requests 加大）的差別。' },
      ],
    },
    {
      id: 'kub10-s-hpa', title: 'Horizontal Pod Autoscaler：一條公式與一個控制迴圈',
      blocks: [
        { type: 'p', text: 'Horizontal Pod Autoscaler（HPA）是 kube-controller-manager 裡的另一個控制器，管理一個 `autoscaling/v2` 的 HorizontalPodAutoscaler 物件。它不建立 Pod，只做一件事：每 15 秒（`--horizontal-pod-autoscaler-sync-period` 的預設）讀一次目標的用量，算出期望的副本數，寫進目標 Deployment 的 `spec.replicas`；之後照 KUB04 的流程，由 Deployment 與 ReplicaSet 去建立或刪除 Pod。核心是這條公式：' },
        { type: 'callout', tone: 'note', title: 'HPA 的公式', text: '期望副本數 = ⌈目前副本數 × 目前的指標值 ÷ 目標值⌉（⌈ ⌉ 是無條件進位）。例如 catalog 有 2 個副本、CPU 使用率 130%、目標 50%：⌈2 × 130 ÷ 50⌉ = ⌈5.2⌉ = 6。' },
        { type: 'p', text: '使用率是「所有就緒 Pod 的用量加總 ÷ 它們的 requests 加總」，以百分比表示；Pod 裡有任何一個容器沒有寫 CPU requests，就算不出分母。比例落在 1 ± 0.1 之內（容忍度 tolerance，預設 0.1）時 HPA 不動作，避免為了 52% 對 50% 這種小差距來回調整。算出來的數字最後夾在 `minReplicas` 與 `maxReplicas` 之間；擴張還有速度限制：沒有寫 `behavior` 時，一次同步最多擴到目前的兩倍或 4 個（取較大者），所以範例裡的 2 個先到 4 個、15 秒後才到 6 個。' },
        { type: 'table', head: ['HPA 的欄位', '例子', '說明'], rows: [
          ['`scaleTargetRef`', '`apps/v1`、`Deployment`、`catalog`', '要擴縮的對象（Deployment、StatefulSet 等有 scale 子資源的物件）'],
          ['`minReplicas`、`maxReplicas`', '`2`、`8`', '下限（沒寫是 1）與上限；上限保護預算與叢集容量'],
          ['`metrics[].type: Resource`', '`name: cpu`', '依 Pod 的 CPU 或記憶體擴展（下一節介紹其他來源）'],
          ['`target.type: Utilization`', '`averageUtilization: 50`', '目標是 requests 的 50%；也可以用 `AverageValue: 300m` 指定絕對值'],
          ['`behavior`', '`scaleDown.stabilizationWindowSeconds`', '擴張與縮減的速度與穩定視窗（擴展抖動那一節）'],
        ] },
        { type: 'p', text: '建立 HPA 最快的方式是 `kubectl autoscale deployment catalog --min=2 --max=8 --cpu-percent=50`，沒有 `--cpu-percent` 時目標是預設的 80%；正式環境則把同樣的內容寫成 manifest（ops-ws 的 `shop/catalog-hpa.yaml`）放進版本控制。`kubectl get hpa` 的 TARGETS 是「目前／目標」（例如 `cpu: 130%/50%`），REPLICAS 是 HPA 上一次看到的副本數。' },
        { type: 'example', id: 'kub10-hpa' },
        { type: 'p', text: '跟著範例算一次：建立時 130% 對 50%，比例 2.6，⌈2 × 2.6⌉ = 6，但第一步最多到 4。15 秒後 4 個 Pod 平分流量，每個約 131m、使用率 65%，比例 1.3，⌈4 × 1.3⌉ = ⌈5.2⌉ = 6，於是擴到 6。（如果新 Pod 還沒有指標，HPA 會保守地把它們當作用量 0 來算，避免擴過頭；同樣地，還沒就緒的 Pod 也不會被當成「很閒」而讓它縮減。）之後 6 個 Pod 平分 520 個請求，每個 88m，使用率 44%：比例 0.88、⌈6 × 0.88⌉ = 6，副本數不變，`AbleToScale` 的原因是 ReadyForNewScale（建議值等於目前值）。`describe hpa` 的三個 Conditions 是排查的第一站：AbleToScale 說能不能讀寫目標的副本數，ScalingActive 說指標算不算得出來，ScalingLimited 說結果是否被 min、max 或速度限制截斷。' },
        { type: 'table', head: ['你看到', '代表', '先查'], rows: [
          ['TARGETS 是 `<unknown>`，ScalingActive False', '算不出指標', '`describe hpa` 的事件：沒有 metrics-server、Pod 還沒有指標、或缺 CPU requests（`missing request for cpu`）'],
          ['REPLICAS 停在 maxReplicas，ScalingLimited True（TooManyReplicas）', '需求超過上限', '上限是否太低、程式是否變慢了'],
          ['使用率低但副本數沒有減少', '縮減在穩定視窗內', '等 5 分鐘，或檢查 `behavior.scaleDown`'],
          ['副本數增加了，但 Pod 是 Pending', '節點放不下', '`describe pod` 的 FailedScheduling，節點擴展'],
        ] },
      ],
    },
    {
      id: 'kub10-s-sources', title: '指標來源：CPU、記憶體、自訂與外部指標',
      blocks: [
        { type: 'p', text: 'CPU 使用率是最常見、也最容易上手的擴展依據，但不是唯一的。`autoscaling/v2` 的 `metrics` 是一個清單，可以同時列出好幾個指標來源；HPA 對每一個各算一個期望副本數，取最大的那個，所以「CPU 或佇列長度任一個吃緊就擴展」。' },
        { type: 'table', head: ['type', '量什麼', '資料從哪裡來', '例子'], rows: [
          ['`Resource`', '目標所有 Pod 的 cpu 或 memory，對 requests 的使用率或平均值', 'Metrics API（metrics-server）', 'CPU 平均使用率 50%'],
          ['`ContainerResource`', '只看 Pod 裡某一個容器的 cpu 或 memory', 'Metrics API', '有 sidecar 時只看主程式的容器'],
          ['`Pods`', '每個 Pod 自己回報的數字，取平均', '`custom.metrics.k8s.io`（需要指標轉接器）', '每個 Pod 每秒處理的請求數'],
          ['`Object`', '叢集裡另一個物件的數字', '`custom.metrics.k8s.io`', 'Ingress 收到的每秒請求數'],
          ['`External`', '叢集外的數字', '`external.metrics.k8s.io`', '訊息佇列裡等待處理的工作數'],
        ] },
        { type: 'p', text: '自訂指標（custom metrics）與外部指標（external metrics）不是 Kubernetes 內建的資料：要先有監控系統收集數字（例如 KUB12 的 Prometheus），再安裝一個指標轉接器（adapter，例如 Prometheus Adapter）把查詢結果透過這兩個 API 提供給 HPA。另一條常見的路是 KEDA 這類事件驅動的擴展器，它內建許多事件來源的連接器，並能在沒有工作時把副本數縮到 0（HPA 預設最少 1 個）。這些在模擬環境裡只以課文說明，練習都使用 CPU。' },
        { type: 'p', text: '選指標的原則是「它要和負載成正比，而且加了副本之後會下降」。CPU 通常符合：請求平均分給更多 Pod，每個 Pod 的 CPU 就下降。記憶體常常不符合：很多程式（特別是有垃圾回收或快取的執行環境）用過的記憶體不會還回去，負載退了使用率仍然很高，HPA 就一直縮不下來；所以記憶體較適合當作 requests 與 limits 的依據，而不是擴展的主要指標。處理佇列工作的 worker 最適合用外部指標的佇列長度：CPU 可能不高，但工作在排隊。' },
      ],
    },
    {
      id: 'kub10-s-flap', title: '擴展抖動：為什麼 HPA 不急著縮減',
      blocks: [
        { type: 'p', text: '負載不是平滑的曲線，而是每分鐘都在上下跳動。如果 HPA 每次同步都照當下的數字調整，流量一高就擴、一低就縮，副本數就會忽大忽小，這叫擴展抖動（flapping，也稱為震盪）。抖動的代價很實際：每次縮減都要優雅終止 Pod、斷開連線、丟掉暖好的快取，每次擴張又要排程、啟動、等就緒，結果是延遲在高峰時反而更差。' },
        { type: 'p', text: 'HPA 的預設對策是縮減的穩定視窗（stabilization window）：決定要縮減時，它不用當下的建議值，而是取過去 300 秒內所有建議值的最大者。只要 5 分鐘內曾經需要 6 個，就維持 6 個；需求要持續低 5 分鐘才真的縮。擴張則沒有視窗，需求一出現就立刻跟上（只受速度限制）。換句話說，HPA 刻意「擴得快、縮得慢」。下面的範例 10:03 流量退了，使用率掉到 7%，副本數卻維持到最後一個較高的建議值滿 300 秒之後才縮回 2。' },
        { type: 'example', id: 'kub10-calm' },
        { type: 'p', text: '`spec.behavior` 可以分別調整兩個方向，寫了 `behavior` 的那一個方向沒寫的欄位會補上預設值。' },
        { type: 'table', head: ['欄位', '預設', '用途'], rows: [
          ['`scaleDown.stabilizationWindowSeconds`', '300（秒）', '縮減時取視窗內建議值的最大者；越長越穩，但多出的副本留得越久'],
          ['`scaleUp.stabilizationWindowSeconds`', '0', '擴張時取視窗內的最小者；設長一點可以忽略短暫的尖峰'],
          ['`policies`', '擴張：每 15 秒最多 +4 個或 +100%；縮減：每 15 秒最多 -100%', '`type: Pods` 是個數、`type: Percent` 是比例，`periodSeconds` 是期間；例如縮減每分鐘最多少 1 個'],
          ['`selectPolicy`', '`Max`', '多個 policy 時取變化最大（Max）或最小（Min）的；`Disabled` 完全停止這個方向'],
        ] },
        { type: 'callout', tone: 'warning', title: '交給 HPA 的 Deployment，manifest 不要再寫 replicas', text: '範例中有人照 manifest 重新 `kubectl apply -f shop/catalog.yaml`，裡面還寫著 `replicas: 2`：apply 把 Deployment 改回 2 個，四個 Pod 立刻被刪除，直到下一次同步 HPA 才又擴回去。在尖峰時這幾十秒就是事故。更隱蔽的是 GitOps 或 CI/CD 定期把 Git 裡的 manifest 同步到叢集：每次同步都把副本數改回 manifest 的數字，HPA 再改回來，兩個控制者無止境地互相覆蓋。HPA 接手之後，就從 Deployment 的 manifest 刪掉 `replicas` 欄位，讓 apply 與 GitOps 不再管它，下限交給 HPA 的 `minReplicas`；同樣地，也不要再對它 `kubectl scale`。注意已經在執行的 Deployment 第一次這樣改時，apply 可能把這個欄位一併移除、副本數短暫回到預設的 1 再由 HPA 調回，所以要在離峰時進行，或依官方文件的遷移步驟處理。' },
      ],
    },
    {
      id: 'kub10-s-nodes', title: '節點擴展：HPA 加 Pod，誰來加節點',
      blocks: [
        { type: 'p', text: 'HPA 只調整 Pod 的數量，從不管節點夠不夠。叢集的 requests 已經滿了時，HPA 照樣把副本數調高，新的 Pod 卻找不到節點，停在 Pending。HPA 把 Pending 的 Pod 視為未就緒，不會因為它們而誤判使用率下降，需求仍在就繼續往 maxReplicas 擴。範例先讓 reindex 佔掉大部分的 CPU requests，再看 catalog 的 HPA 擴展：' },
        { type: 'example', id: 'kub10-full' },
        { type: 'p', text: '這時要擴展的是節點擴展（node autoscaling），由叢集外圍的另一個元件負責，模擬環境不模擬它，範例用刪掉 reindex 代替「多一台節點」。常見的兩種做法：' },
        { type: 'table', head: ['做法', '怎麼決定要加節點', '怎麼決定要減節點'], rows: [
          ['Cluster Autoscaler', '定期找因為資源不足而無法排程的 Pending Pod，模擬「在某個節點群組多一台同規格的節點」放不放得下，放得下就把那個群組的節點數加一', '節點的 requests 使用率低（預設低於 50%）持續一段時間（預設約 10 分鐘），而且上面的 Pod 都能搬到其他節點時，排空並移除它'],
          ['Karpenter 這類節點供應器', '直接讀 Pending Pod 的 requests、節點選擇與容忍設定，挑一個剛好合適的機型開新節點，不需要事先定義固定規格的群組', '持續整併（consolidation）：把 Pod 集中到較少或較便宜的節點，移除空出來的'],
        ] },
        { type: 'p', text: '兩者都依 Pod 的 requests 判斷，而不是實際用量：requests 寫得不實，節點擴展也跟著失準。開一台新節點通常要幾分鐘（建立虛擬機器、開機、加入叢集、拉 Image），比 HPA 的 15 秒慢得多，所以對延遲敏感的服務常保留一點餘裕：minReplicas 不設在最低、目標使用率留空間（例如 50% 而不是 90%），或放一些低優先權的佔位 Pod，讓新節點在真正需要前就先準備好。節點縮減會排空節點，Pod 被逐出後在別處重建，搭配 PodDisruptionBudget 可以限制同時被逐出的數量。' },
        { type: 'p', text: '還有第三個方向：垂直擴展的 Vertical Pod Autoscaler（VPA）依過去的用量建議或直接調整 Pod 的 requests，適合難以水平擴展的服務；但不要讓 VPA 與 HPA 同時依同一個 CPU 或記憶體指標調整同一個工作負載，兩者會互相干擾。' },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['看實際用量', '`kubectl top nodes`、`kubectl top pods -A --sort-by=cpu`'],
          ['看 requests 的分配與 QoS', '`kubectl describe node 名稱`（Allocated resources）、`-o custom-columns=QOS:.status.qosClass`'],
          ['建立 HPA', '`kubectl autoscale deployment catalog --min=2 --max=8 --cpu-percent=50`，或 `kubectl apply -f` HPA 的 manifest'],
          ['看 HPA 的狀態與理由', '`kubectl get hpa`、`kubectl describe hpa catalog`、`kubectl events --for hpa/catalog`'],
          ['找出放不下的 Pod', '`kubectl get pods --field-selector status.phase=Pending`、`describe pod` 的 FailedScheduling'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, CART, SALE_WS, FLAP, WATCH],
    examples: [
      {
        id: "kub10-resources", title: "requests、limits、QoS，以及排不進去與被 OOMKilled 的 Pod", machine: "kub10-ws",
        description: "catalog 寫了 requests 與 limits；看三種 QoS class 與 node-01 已分配的 requests。reindex 每個副本要 1500m，第三個找不到節點而 Pending（Insufficient cpu）。report 的記憶體一直長，碰到 64Mi 的 limit 就被殺掉（OOMKilled、Exit Code 137），重啟幾次後進入 CrashLoopBackOff。",
        steps: [
          { command: "grep -A 6 resources shop/catalog.yaml", output: "        resources:\n          requests:\n            cpu: 200m\n            memory: 128Mi\n          limits:\n            cpu: 500m\n            memory: 256Mi" },
          { command: "kubectl get pods -o custom-columns=NAME:.metadata.name,QOS:.status.qosClass", output: "NAME                        QOS\ncatalog-8wclp448bc-8bjds    Burstable\ncatalog-8wclp448bc-km5pj    Burstable\nfrontend-bgs7hkcs85-4tnfh   Guaranteed\nfrontend-bgs7hkcs85-f76fs   Guaranteed\ntoolbox                     BestEffort" },
          { command: "kubectl describe node node-01 | grep -A 5 'Allocated resources'", output: "Allocated resources:\n  (Total limits may be over 100 percent, i.e., overcommitted.)\n  Resource           Requests     Limits\n  --------           --------     ------\n  cpu                400m (20%)   600m (30%)\n  memory             392Mi (10%)  320Mi (8%)" },
          { command: "grep -A 3 resources shop/reindex.yaml", output: "        resources:\n          requests:\n            cpu: 1500m\n            memory: 256Mi" },
          { command: "kubectl apply -f shop/reindex.yaml", output: "deployment.apps/reindex created" },
          { command: "sleep 5", output: "" },
          { command: "kubectl get pods -l app=reindex -o wide", output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nreindex-j7kbrbrpzm-7sdzt   1/1       Running   0          5s        10.244.2.5   node-02   <none>           <none>\nreindex-j7kbrbrpzm-d4tjx   1/1       Running   0          5s        10.244.1.5   node-01   <none>           <none>\nreindex-j7kbrbrpzm-g2vgs   0/1       Pending   0          5s        <none>       <none>    <none>           <none>" },
          { command: "kubectl describe pods -l app=reindex | grep FailedScheduling", output: "  Warning  FailedScheduling  5s    default-scheduler  0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod." },
          { command: "kubectl delete deploy reindex", output: "deployment.apps \"reindex\" deleted" },
          { command: "grep -A 5 resources shop/report.yaml", output: "    resources:\n      requests:\n        cpu: 100m\n        memory: 64Mi\n      limits:\n        memory: 64Mi" },
          { command: "kubectl apply -f shop/report.yaml", output: "pod/report created" },
          { command: "sleep 15", output: "" },
          { command: "kubectl get pod report", output: "NAME      READY     STATUS      RESTARTS     AGE\nreport    0/1       OOMKilled   1 (6s ago)   15s" },
          { command: "kubectl describe pod report | grep -A 3 'Last State'", output: "    Last State:     Terminated\n      Reason:       OOMKilled\n      Exit Code:    137\n      Started:      Tue, 24 Nov 2026 10:00:08 +0000" },
          { command: "sleep 60", output: "" },
          { command: "kubectl get pod report", output: "NAME      READY     STATUS             RESTARTS      AGE\nreport    0/1       CrashLoopBackOff   3 (18s ago)   75s" },
        ],
      },
      {
        id: "kub10-top", title: "metrics-server 與 kubectl top", machine: "kub10-ws",
        description: "特賣的流量都落在 catalog 的兩個 Pod 上。kubectl top 看節點與 Pod 目前的用量，--sort-by=cpu 由大到小排列。多開一個副本：新 Pod 已經 Running、開始分到流量，但 metrics-server 還沒刮取到它，kubectl top 先不列出它；15 秒後它也有了指標，三個 Pod 的用量一樣。",
        steps: [
          { command: "kubectl top nodes", output: "NAME      CPU(cores)   CPU%      MEMORY(bytes)   MEMORY%\ncp-01     159m         7%        1128Mi          29%\nnode-01   297m         14%       454Mi           11%\nnode-02   294m         14%       442Mi           11%" },
          { command: "kubectl top pods", output: "NAME                        CPU(cores)   MEMORY(bytes)\ncatalog-8wclp448bc-8bjds    261m         8Mi\ncatalog-8wclp448bc-km5pj    261m         8Mi\nfrontend-bgs7hkcs85-4tnfh   1m           8Mi\nfrontend-bgs7hkcs85-f76fs   1m           8Mi\ntoolbox                     1m           8Mi" },
          { command: "kubectl top pods -A --sort-by=cpu | head -n 5", output: "NAMESPACE     NAME                              CPU(cores)   MEMORY(bytes)\ndefault       catalog-8wclp448bc-8bjds          261m         8Mi\ndefault       catalog-8wclp448bc-km5pj          261m         8Mi\nkube-system   kube-apiserver-cp-01              50m          260Mi\nkube-system   etcd-cp-01                        25m          45Mi" },
          { command: "kubectl scale deploy catalog --replicas=3", output: "deployment.apps/catalog scaled" },
          { command: "kubectl get pods -l app=catalog", output: "NAME                       READY     STATUS    RESTARTS   AGE\ncatalog-8wclp448bc-5vpcx   1/1       Running   0          0s\ncatalog-8wclp448bc-8bjds   1/1       Running   0          20m\ncatalog-8wclp448bc-km5pj   1/1       Running   0          20m" },
          { command: "kubectl top pods -l app=catalog", output: "NAME                       CPU(cores)   MEMORY(bytes)\ncatalog-8wclp448bc-8bjds   174m         8Mi\ncatalog-8wclp448bc-km5pj   174m         8Mi" },
          { command: "sleep 15", output: "" },
          { command: "kubectl top pods -l app=catalog", output: "NAME                       CPU(cores)   MEMORY(bytes)\ncatalog-8wclp448bc-5vpcx   174m         8Mi\ncatalog-8wclp448bc-8bjds   174m         8Mi\ncatalog-8wclp448bc-km5pj   174m         8Mi" },
        ],
      },
      {
        id: "kub10-hpa", title: "kubectl autoscale：讓 HPA 接手 catalog", machine: "kub10-ws",
        description: "建立目標使用率 50%、2 到 8 個副本的 HPA。建立的那一刻就同步一次：130% 對 50% 要 6 個，但第一步最多到 4 個；15 秒後再到 6 個，使用率回到目標附近就停下來。describe 的 Conditions 與事件說明每一步的理由。",
        steps: [
          { command: "kubectl autoscale deployment catalog --min=2 --max=8 --cpu-percent=50", output: "horizontalpodautoscaler.autoscaling/catalog autoscaled" },
          { command: "kubectl get hpa", output: "NAME      REFERENCE            TARGETS         MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 130%/50%   2         8         2          0s" },
          { command: "kubectl get deploy catalog", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   4/4       4            4           20m" },
          { command: "sleep 15", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 65%/50%   2         8         4          15s" },
          { command: "sleep 15", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 44%/50%   2         8         6          30s" },
          { command: "kubectl describe hpa catalog | head -n 17", output: "Name:                                                  catalog\nNamespace:                                             default\nLabels:                                                <none>\nAnnotations:                                           <none>\nCreationTimestamp:                                     Tue, 24 Nov 2026 10:00:00 +0000\nReference:                                             Deployment/catalog\nMetrics:                                               ( current / target )\n  resource cpu on pods  (as a percentage of request):  44% (88m) / 50%\nMin replicas:                                          2\nMax replicas:                                          8\nDeployment pods:                                       6 current / 6 desired\nConditions:\n  Type            Status  Reason              Message\n  ----            ------  ------              -------\n  AbleToScale     True    ReadyForNewScale    recommended size matches current size\n  ScalingActive   True    ValidMetricFound    the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)\n  ScalingLimited  False   DesiredWithinRange  the desired count is within the acceptable range" },
          { command: "kubectl events --for hpa/catalog", output: "LAST SEEN   TYPE      REASON              OBJECT                            MESSAGE\n30s         Normal    SuccessfulRescale   HorizontalPodAutoscaler/catalog   New size: 4; reason: cpu resource utilization (percentage of request) above target\n15s         Normal    SuccessfulRescale   HorizontalPodAutoscaler/catalog   New size: 6; reason: cpu resource utilization (percentage of request) above target" },
          { command: "kubectl get hpa catalog -o jsonpath='{.status.currentMetrics[0].resource.current}{\"\\n\"}'", output: "{\"averageUtilization\":44,\"averageValue\":\"88m\"}" },
        ],
      },
      {
        id: "kub10-full", title: "HPA 加了 Pod，叢集卻滿了", machine: "kub10-ws",
        description: "reindex 先佔走兩個工作節點大部分的 CPU requests，接著套用 catalog 的 HPA。HPA 照樣把副本數調到 6，但其中 3 個 Pod 找不到節點，留在 Pending（Insufficient cpu）——這正是節點擴展要接手的時候。模擬環境沒有節點自動擴展，刪掉 reindex 釋出資源後，Pending 的 Pod 才排上去。",
        steps: [
          { command: "kubectl apply -f shop/reindex.yaml", output: "deployment.apps/reindex created" },
          { command: "kubectl apply -f shop/catalog-hpa.yaml", output: "horizontalpodautoscaler.autoscaling/catalog created" },
          { command: "sleep 30", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 87%/50%   2         8         6          30s" },
          { command: "kubectl get pods -l app=catalog -o wide", output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-8wclp448bc-8bjds   1/1       Running   0          20m       10.244.2.3   node-02   <none>           <none>\ncatalog-8wclp448bc-8nmmq   0/1       Pending   0          30s       <none>       <none>    <none>           <none>\ncatalog-8wclp448bc-9m8jb   0/1       Pending   0          15s       <none>       <none>    <none>           <none>\ncatalog-8wclp448bc-kjw2z   0/1       Pending   0          15s       <none>       <none>    <none>           <none>\ncatalog-8wclp448bc-km5pj   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-8wclp448bc-v89zz   1/1       Running   0          30s       10.244.2.6   node-02   <none>           <none>" },
          { command: "kubectl describe pods -l app=catalog | grep FailedScheduling | head -n 1", output: "  Warning  FailedScheduling  30s   default-scheduler  0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod." },
          { command: "kubectl describe node node-02 | grep -A 4 'Allocated resources'", output: "Allocated resources:\n  (Total limits may be over 100 percent, i.e., overcommitted.)\n  Resource           Requests     Limits\n  --------           --------     ------\n  cpu                2 (100%)     1100m (55%)" },
          { command: "kubectl delete deploy reindex", output: "deployment.apps \"reindex\" deleted" },
          { command: "sleep 30", output: "" },
          { command: "kubectl get pods -l app=catalog", output: "NAME                       READY     STATUS    RESTARTS   AGE\ncatalog-8wclp448bc-8bjds   1/1       Running   0          21m\ncatalog-8wclp448bc-8nmmq   1/1       Running   0          60s\ncatalog-8wclp448bc-9m8jb   1/1       Running   0          45s\ncatalog-8wclp448bc-kjw2z   1/1       Running   0          45s\ncatalog-8wclp448bc-km5pj   1/1       Running   0          21m\ncatalog-8wclp448bc-v89zz   1/1       Running   0          60s" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 44%/50%   2         8         6          60s" },
        ],
      },
      {
        id: "kub10-calm", title: "縮減的穩定視窗，以及寫死 replicas 的 manifest", machine: "kub10-ws",
        description: "10:03 特賣的第一波結束，使用率掉到 7%，HPA 卻還維持 6 個副本：預設的縮減穩定視窗取過去 300 秒內最高的建議值。這時有人照 manifest 重新套用 catalog.yaml（replicas: 2），副本數被拉回 2，下一次同步又被 HPA 改回去。最後一個較高的建議值滿 300 秒之後，才縮回 minReplicas。",
        steps: [
          { command: "kubectl apply -f shop/catalog-hpa.yaml", output: "horizontalpodautoscaler.autoscaling/catalog created" },
          { command: "sleep 60", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 44%/50%   2         8         6          60s" },
          { command: "sleep 180", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS       MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 7%/50%   2         8         6          4m" },
          { command: "kubectl describe hpa catalog | grep -A 4 Conditions", output: "Conditions:\n  Type            Status  Reason               Message\n  ----            ------  ------               -------\n  AbleToScale     True    ScaleDownStabilized  recent recommendations were higher than current one, applying the highest recent recommendation\n  ScalingActive   True    ValidMetricFound     the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)" },
          { command: "grep replicas shop/catalog.yaml", output: "  replicas: 2" },
          { command: "kubectl apply -f shop/catalog.yaml", output: "deployment.apps/catalog configured" },
          { command: "kubectl get deploy catalog", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   2/2       2            2           24m" },
          { command: "sleep 15", output: "" },
          { command: "kubectl get deploy catalog", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   4/4       4            4           24m" },
          { command: "sleep 15", output: "" },
          { command: "kubectl get deploy catalog", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   6/6       6            6           24m" },
          { command: "sleep 300", output: "" },
          { command: "kubectl get hpa catalog", output: "NAME      REFERENCE            TARGETS        MINPODS   MAXPODS   REPLICAS   AGE\ncatalog   Deployment/catalog   cpu: 20%/50%   2         8         2          9m30s" },
          { command: "kubectl get deploy catalog", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   2/2       2            2           29m" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub10-ex-requests', title: '讓 cart 的 HPA 算得出使用率', machine: 'kub10-cart',
        statement: 'cart 的 HPA（`~/shop/cart-hpa.yaml`：CPU 目標 60%、2 到 6 個副本）建立快半小時了，`kubectl get hpa` 的 TARGETS 卻一直是 `cpu: <unknown>/60%`，副本數從沒變過，而 cart 正承受比平常多的流量。找出原因並修好：在 `~/shop/cart.yaml` 的容器加上 CPU requests `100m`（保留原本的 memory requests `64Mi`），套用到叢集，然後等到 HPA 算得出使用率，並依負載把 cart 擴展、新副本都就緒為止。檔案可以用 `cat > shop/cart.yaml <<\'EOF\'` 整份重寫，最後一行單獨打 `EOF`。',
        checks: [
          { kind: 'kube-hpa', name: 'cart', condition: { type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound' }, scaledAtLeast: 3 },
          { kind: 'kube-workload', resource: 'Deployment', name: 'cart', replicas: 3, readyReplicas: 3 },
        ],
        solution: ['kubectl get hpa cart', 'kubectl describe hpa cart | grep ScalingActive', heredoc('shop/cart.yaml', CART_FIXED), 'kubectl apply -f shop/cart.yaml', 'kubectl rollout status deploy/cart', 'sleep 60', 'kubectl get hpa cart'],
        mistakes: [
          { commands: [heredoc('shop/cart.yaml', CART_LIMITS), 'kubectl apply -f shop/cart.yaml', 'kubectl rollout status deploy/cart', 'sleep 60'], why: '加上的是記憶體的 limits，容器仍然沒有 CPU requests，HPA 的分母還是算不出來（missing request for cpu）' },
          { commands: ['kubectl delete hpa cart', 'kubectl autoscale deployment cart --min=2 --max=6 --cpu-percent=60', 'sleep 60'], why: 'HPA 本身沒有問題，重建它不會讓 Pod 多出 CPU requests，新的 HPA 一樣是 <unknown>' },
          { commands: [heredoc('shop/cart.yaml', CART_FIXED), 'sleep 60'], why: '只改了檔案、沒有 kubectl apply，叢集裡的 Pod 仍然沒有 CPU requests' },
          { commands: [heredoc('shop/cart.yaml', CART_FIXED), 'kubectl apply -f shop/cart.yaml'], why: '套用了但沒有等待：新 Pod 還沒有指標、HPA 也還沒同步，檢查時副本數還沒有改變' },
        ],
        hints: [
          '`kubectl describe hpa cart` 的 Conditions 與 Events 會說 HPA 為什麼算不出來；注意 `missing request for ...` 這段話。',
          '使用率是「用量 ÷ requests」，所以容器要寫 `resources.requests.cpu`。在 `resources:` 底下的 `requests:` 加一行 `cpu: 100m`，`memory: 64Mi` 留著。',
          '`kubectl apply -f shop/cart.yaml` 之後，用 `kubectl rollout status deploy/cart` 等新 Pod，再 `sleep 60` 讓 metrics-server 收集、HPA 同步幾次，最後 `kubectl get hpa cart` 確認。',
        ],
        explanation: 'HPA 的 CPU 使用率是「就緒 Pod 的 CPU 用量加總 ÷ 它們的 CPU requests 加總」。cart 的容器只寫了 memory requests，分母不存在，控制器每次同步都回報 `failed to get cpu utilization: missing request for cpu in container cart of Pod …`，ScalingActive 是 False、TARGETS 是 `<unknown>`，副本數因此從不改變。在 Pod 範本加上 `cpu: 100m` 並 apply 後，Deployment 以滾動更新換掉舊 Pod；新 Pod 有了指標之後，170 個請求每秒讓兩個 Pod 各用約 86m，使用率 86% 對目標 60%，⌈2 × 86 ÷ 60⌉ = 3，HPA 擴到 3 個，之後約 58%、比例 0.97 在容忍度之內就停下來。加記憶體的 limits、重建 HPA 都碰不到真正的原因；只改檔案不 apply 或不等待，檢查時都還看不到擴展。',
      },
      {
        id: 'kub10-ex-autoscale', title: '特賣開始：替 catalog 建立 HPA', machine: 'kub10-sale',
        statement: '特賣已經開始，catalog 還是固定 2 個副本，每個 Pod 的 CPU 都遠超過它的 requests。替 Deployment catalog 建立一個名為 `catalog` 的 HPA：最少 2 個、最多 10 個副本，CPU 目標使用率 60%。建立後等它依目前的流量擴展，直到 HPA 不再增加副本、所有副本都就緒為止。可以先用 `kubectl top pods` 的數字與 HPA 的公式估算它最後會停在幾個副本，再用 `kubectl get hpa` 確認。',
        checks: [
          { kind: 'kube-hpa', name: 'catalog', target: 'Deployment/catalog', minReplicas: 2, maxReplicas: 10, metric: { resource: 'cpu', utilization: 60 }, scaledAtLeast: 8 },
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', replicas: 8, readyReplicas: 8 },
        ],
        solution: ['kubectl top pods', 'kubectl autoscale deployment catalog --min=2 --max=10 --cpu-percent=60', 'sleep 60', 'kubectl get hpa catalog', 'kubectl get deploy catalog'],
        mistakes: [
          { commands: ['kubectl autoscale deployment catalog --min=2 --max=10', 'sleep 60'], why: '少了 --cpu-percent，HPA 用預設的 80% 當目標，擴展得比題目要求的少' },
          { commands: ['kubectl scale deploy catalog --replicas=8', 'kubectl rollout status deploy/catalog'], why: '手動把副本數調成 8，沒有建立 HPA；流量一變，副本數不會跟著調整' },
          { commands: ['kubectl autoscale deployment catalog --min=2 --max=10 --cpu-percent=60'], why: '建立了 HPA 但沒有等待：擴張每 15 秒最多翻倍，檢查時還在 2 或 4 個副本' },
          { commands: ['kubectl autoscale deployment catalog --min=2 --max=6 --cpu-percent=60', 'sleep 60'], why: 'maxReplicas 寫成 6，流量需要的副本數被上限截斷' },
        ],
        hints: [
          '`kubectl autoscale deployment catalog` 加上 `--min`、`--max`、`--cpu-percent` 三個旗標。',
          '`kubectl top pods` 顯示兩個 Pod 各用約 451m，requests 是 200m；把總用量除以「每個 Pod 在 60% 時可用的 120m」再無條件進位，就是 HPA 最後的副本數。',
          'HPA 每 15 秒同步一次，一次最多擴到兩倍：`sleep 60` 之後再看 `kubectl get hpa catalog` 與 `kubectl get deploy catalog`。',
        ],
        explanation: '`kubectl autoscale deployment catalog --min=2 --max=10 --cpu-percent=60` 建立 `autoscaling/v2` 的 HPA，目標是 CPU requests 的 60%。建立時兩個 Pod 共用掉約 902m，使用率 225%，比例 3.75，⌈2 × 3.75⌉ = 8；但沒有 behavior 時一次最多擴到兩倍或 4 個，所以先到 4 個，15 秒後到 8 個。8 個 Pod 平分之後每個約 113m、使用率 57%，比例 0.95 在 0.1 的容忍度之內，HPA 停在 8。少了 `--cpu-percent` 會用預設的 80%，只需要 6 個；`--max=6` 會把結果截斷在 6；手動 `kubectl scale` 雖然也是 8 個，卻沒有任何東西會在流量改變時跟著調整；不等待的話檢查時擴展還沒完成。',
      },
      {
        id: 'kub10-ex-flap', title: '讓 catalog 的副本數不再忽大忽小', machine: 'kub10-flap',
        statement: '有人為了「流量退了就馬上省錢」，在 catalog 的 HPA（`~/shop/catalog-hpa.yaml`）把 `behavior.scaleDown.stabilizationWindowSeconds` 設成 0。現在流量每分鐘一高一低，副本數就跟著在 2 和 6 之間來回（`kubectl events --for hpa/catalog` 看得到）。把這個值改成 `180`（檔案的其他內容不變）並套用到叢集，然後至少觀察兩分鐘，確認在流量低的那一分鐘，catalog 也維持在高峰需要的副本數。',
        checks: [
          { kind: 'content', path: '/home/yuki/shop/catalog-hpa.yaml', content: FLAP_HPA.replace('stabilizationWindowSeconds: 0', 'stabilizationWindowSeconds: 180') },
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', replicas: 6, readyReplicas: 6 },
        ],
        solution: ['kubectl events --for hpa/catalog', 'grep -A 2 scaleDown shop/catalog-hpa.yaml', "sed -i 's/stabilizationWindowSeconds: 0/stabilizationWindowSeconds: 180/' shop/catalog-hpa.yaml", 'kubectl apply -f shop/catalog-hpa.yaml', 'sleep 120', 'kubectl get deploy catalog'],
        mistakes: [
          { commands: ["sed -i 's/stabilizationWindowSeconds: 0/stabilizationWindowSeconds: 180/' shop/catalog-hpa.yaml", 'sleep 120'], why: '只改了檔案、沒有 kubectl apply，叢集裡的 HPA 仍然沒有穩定視窗，低流量的那一分鐘又縮回 2 個' },
          { commands: ['kubectl scale deploy catalog --replicas=6', 'sleep 120'], why: '手動調整副本數會被 HPA 在下一次同步改掉，抖動照舊；HPA 的設定也沒有修正' },
          { commands: ["sed -i 's/minReplicas: 2/minReplicas: 6/' shop/catalog-hpa.yaml", 'kubectl apply -f shop/catalog-hpa.yaml', 'sleep 120'], why: '把 minReplicas 拉到 6 雖然不再抖動，卻是永遠開著高峰的副本數，題目要改的是穩定視窗' },
          { commands: ["sed -i 's/stabilizationWindowSeconds: 0/stabilizationWindowSeconds: 180/' shop/catalog-hpa.yaml", 'kubectl apply -f shop/catalog-hpa.yaml'], why: '套用後沒有觀察：這一分鐘流量低、副本數還在 2，要等下一個高峰之後，穩定視窗才會把它留住' },
        ],
        hints: [
          '`kubectl events --for hpa/catalog` 的 `(x8 over 15m)` 說明同樣的擴張與縮減重複了很多次。',
          "`sed -i 's/stabilizationWindowSeconds: 0/stabilizationWindowSeconds: 180/' shop/catalog-hpa.yaml` 改檔案，再 `kubectl apply -f shop/catalog-hpa.yaml`。",
          '`sleep 120` 之後用 `kubectl get deploy catalog` 看副本數；`kubectl describe hpa catalog` 的 AbleToScale 會是 ScaleDownStabilized。',
        ],
        explanation: '縮減的穩定視窗讓 HPA 在縮減時取「過去 N 秒內最高的建議值」。視窗是 0 時，每一分鐘的低流量都立刻把副本數縮回 2，下一分鐘的高峰又擴回 6，事件裡同一組擴縮重複了好幾次，這就是擴展抖動。改成 180 秒並 apply 之後，HPA 物件的 generation 加一、下一次同步就使用新的視窗：高峰那一分鐘的建議值 6 會被保留 3 分鐘，而高峰每 2 分鐘就出現一次，所以低流量時副本數也維持 6，`describe hpa` 的 AbleToScale 是 ScaleDownStabilized。只改檔案不 apply、或手動 scale 都會在下一次同步被 HPA 的原設定蓋掉；把 minReplicas 拉高雖然不再抖動，卻把彈性也拿掉了。',
      },
      {
        id: 'kub10-ex-util', title: 'HPA 此刻算出的使用率', machine: 'kub10-watch',
        statement: '值班紀錄要寫下 catalog 的 HPA 此刻看到的 CPU 使用率（相對於 requests 的百分比）。從 HPA 的狀態讀取：最後一個指令只印出這個數字本身（例如 `37`），不要有百分號、標題或其他文字。不要自己估算或寫死：同一串指令會在流量不同的另外兩個叢集上重播。',
        checks: [{ kind: 'output', fromCommand: '^kubectl (get|describe) hpa' }],
        solution: ['kubectl get hpa catalog', UTILIZATION],
        mistakes: [
          { commands: ['kubectl get hpa catalog'], why: '印出整張表（cpu: 42%/50% 與其他欄位），不是只有數字' },
          { commands: ["kubectl get hpa catalog -o jsonpath='{.spec.metrics[0].resource.target.averageUtilization}'"], why: '印出的是 spec 裡的目標值 50，不是 status 裡目前的使用率' },
          { commands: ["kubectl get hpa catalog -o jsonpath='{.status.currentMetrics[0].resource.current.averageValue}'"], why: '印出的是每個 Pod 的平均用量（millicores），不是對 requests 的百分比' },
          { commands: ['echo 42'], why: '直接打出答案，沒有查詢 HPA；換一個叢集答案就不同' },
        ],
        variants: [
          { label: '流量每秒 450 個請求的叢集', files: [], kube: WATCH_KUBE(450) },
          { label: '流量每秒 200 個請求的叢集', files: [], kube: WATCH_KUBE(200) },
        ],
        hints: [
          '`kubectl get hpa catalog` 的 TARGETS 是「目前／目標」；`-o yaml` 可以看到它來自 `status.currentMetrics`。',
          '`status.currentMetrics[0].resource.current` 底下有 `averageUtilization`（百分比）與 `averageValue`（平均用量）。',
          "`kubectl get hpa catalog -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}'` 只印出數字。",
        ],
        explanation: 'HPA 每次同步把算出的指標寫進 `status.currentMetrics`：`resource.current.averageUtilization` 是就緒 Pod 的 CPU 用量加總對 requests 加總的百分比，也就是 `kubectl get hpa` 的 TARGETS 斜線前面那個數字；`averageValue` 是每個 Pod 的平均用量；`spec.metrics[0].resource.target.averageUtilization` 則是你設定的目標 50。用 jsonpath 只取 `averageUtilization`，在這個叢集印出 42（4 個副本平分每秒 330 個請求）。另外兩個叢集的流量不同，HPA 停在不同的副本數，使用率也不同，所以必須從 HPA 讀，不能照抄。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub10-q1', prompt: '一個容器的 resources 是 requests `cpu: 250m`、`memory: 128Mi`，limits `cpu: 500m`、`memory: 256Mi`。程式忙碌時想用 800m 的 CPU，記憶體也一路長到 300Mi。會發生什麼事？',
      options: ['兩者都會讓容器被 OOMKilled，然後依 restartPolicy 重啟', '兩者都只會被節流，容器變慢但不會被殺掉或重啟', 'CPU 被節流在 500m；記憶體到 256Mi 時被 OOMKilled', '排程器把 Pod 搬到資源比較多的節點，限制不會生效'],
      answer: 2,
      explanation: 'CPU 是可分時的資源，超過 limits 時 CFS quota 只會節流，程式變慢但不會被殺；記憶體沒辦法少給，用到 limits 的那一刻核心的 OOM killer 殺掉容器，Reason 是 OOMKilled、Exit Code 137。所以兩者都 OOMKilled、兩者都只節流的說法各錯一半；排程器只在 Pod 建立時依 requests 選節點，不會因為執行時的用量搬動 Pod。',
    },
    {
      id: 'kub10-q2', prompt: 'catalog 目前 4 個副本，requests 是每個 200m，HPA 的目標是 CPU 使用率 60%，現在的使用率是 90%。下一次同步的期望副本數是多少（假設沒有速度與上下限的限制）？',
      options: ['5', '4', '8', '6'],
      answer: 3,
      explanation: '期望副本數 = ⌈目前副本數 × 目前值 ÷ 目標值⌉ = ⌈4 × 90 ÷ 60⌉ = ⌈6⌉ = 6。比例 1.5 遠超過 0.1 的容忍度，所以不會維持 4 個；8 是把副本數翻倍，那是預設擴張速度的上限而不是公式的結果；5 則是只多加一個，低估了需求。',
    },
    {
      id: 'kub10-q3', prompt: 'HPA 的目標是 CPU 50%，目前 4 個副本、使用率 54%。HPA 會怎麼做？',
      options: ['擴到 5 個，因為使用率已經高於目標', '維持 4 個：比例 1.08 在容忍度內', '縮到 3 個，讓平均使用率更接近目標', '擴到 8 個，因為預設一次就擴張兩倍'],
      answer: 1,
      explanation: '比例是 54 ÷ 50 = 1.08，和 1 的差距 0.08 不超過預設的容忍度 0.1，HPA 不調整副本數，避免為了小差距來回擴縮。只有比例超出 0.9～1.1 時才套用 ⌈4 × 比例⌉；使用率高於目標不會讓它縮減；兩倍是擴張速度的上限，不是每次都擴兩倍。',
    },
    {
      id: 'kub10-q4', prompt: '`kubectl get hpa` 的 TARGETS 一直是 `cpu: <unknown>/60%`，`describe hpa` 的事件寫著 `missing request for cpu in container cart`。最直接的修法是？',
      options: ['替 cart 容器加上 `resources.requests.cpu` 再套用', '刪掉 HPA，再用 `kubectl autoscale` 重新建立一次', '把 HPA 的目標改成 `--cpu-percent=100` 再套用', '替 cart 容器加上 `resources.limits.memory` 再套用'],
      answer: 0,
      explanation: '使用率是用量 ÷ requests，容器沒有 CPU requests，分母不存在，HPA 就算不出來。在 Pod 範本加上 CPU requests 並 apply，新 Pod 有了指標之後 HPA 就能運作。重建 HPA 或改目標值都不會讓 Pod 多出 requests；記憶體的 limits 和 CPU 的分母無關。',
    },
    {
      id: 'kub10-q5', prompt: '特賣的第一波在 10:03 結束，使用率掉到 7%，但 HPA 到 10:07 還維持 6 個副本，`describe hpa` 的 AbleToScale 是 ScaleDownStabilized。原因是？',
      options: ['metrics-server 每 5 分鐘才收集一次 Pod 的用量', 'HPA 預設每 5 分鐘才同步並重新計算一次', '縮減前要先等 Pod 的 readiness 探針失敗', '縮減時取過去 300 秒內最高的建議值'],
      answer: 3,
      explanation: '預設的縮減穩定視窗是 300 秒：HPA 縮減時採用視窗內最高的建議值，避免流量短暫下降就縮、隨即又要擴的擴展抖動。metrics-server 預設每 15 秒收集、HPA 每 15 秒同步，都不是 5 分鐘；readiness 探針決定 Pod 是否接流量，和 HPA 何時縮減無關。',
    },
    {
      id: 'kub10-q6', prompt: 'catalog 已經交給 HPA 管理（2 到 10 個），但它的 manifest 仍寫著 `replicas: 3`，GitOps 工具每幾分鐘就把 Git 裡的 manifest 同步到叢集。會發生什麼事，該怎麼做？',
      options: ['兩者互相覆蓋副本數；應從 manifest 刪掉 replicas', 'HPA 的優先權比較高，manifest 的 replicas 會被忽略，不用處理', 'API server 會拒絕這次同步，因為 HPA 鎖住了 replicas 欄位', 'HPA 會自動把 minReplicas 改成 3，以配合 Git 裡的 manifest'],
      answer: 0,
      explanation: 'HPA 只是寫 Deployment 的 spec.replicas，沒有鎖定這個欄位，也沒有優先權。GitOps 或任何 `kubectl apply` 帶著 `replicas: 3` 都會把它改回 3，下一次同步 HPA 再改回需要的數字，尖峰時就是一次次的縮減與重建。做法是讓 manifest 不再寫 replicas、由 minReplicas 決定下限；API server 不會拒絕，HPA 也不會改自己的 minReplicas。',
    },
    {
      id: 'kub10-q7', prompt: '處理訂單的 worker 從訊息佇列取工作，CPU 一直不高，但尖峰時佇列裡會堆上千筆待處理的訊息。要讓它依「佇列裡等待的訊息數」自動擴展，應該用哪一種指標來源？',
      options: ['`Resource` 的 cpu，並把目標使用率調低到 10%', '`External` 指標，經由轉接器提供佇列長度', '`Resource` 的 memory，因為等待的訊息會佔用記憶體', '`ContainerResource`，只看 worker 這個容器的 CPU'],
      answer: 1,
      explanation: '佇列長度是叢集外系統的數字，正是 External 指標的用途：監控或擴展器收集它，透過 external.metrics.k8s.io 提供給 HPA。CPU 不高時調低 CPU 目標只會讓它常態性地多開副本，和積壓的工作量無關；記憶體不會隨工作完成而下降，不適合當擴展依據；ContainerResource 仍然是 CPU，看不到佇列。',
    },
    {
      id: 'kub10-q8', prompt: 'HPA 把副本數從 4 調到 10，其中 3 個新 Pod 一直 Pending，事件是 `0/3 nodes are available: … 2 Insufficient cpu`。什麼元件會處理這種情況？',
      options: ['HPA 自己會開新節點，因為它知道叢集還差多少 CPU 才放得下', 'metrics-server 會降低其他 Pod 的實際用量，替新 Pod 讓出空間', 'Cluster Autoscaler 這類節點擴展元件依 Pending Pod 的 requests 加節點', 'Vertical Pod Autoscaler 會把 Pending 的 Pod 搬到控制平面節點'],
      answer: 2,
      explanation: 'HPA 只調整 Pod 數量，不管節點；Pending 的 Pod 由節點擴展元件處理：Cluster Autoscaler 模擬在節點群組多一台節點能否放得下，Karpenter 這類供應器直接依 requests 選機型開節點。metrics-server 只回報用量，無法改變用量；VPA 調整 requests，不會把 Pod 搬到有 taint 的控制平面節點。',
    },
  ],
};
