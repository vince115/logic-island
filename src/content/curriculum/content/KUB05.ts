/*
 * KUB05 Services and service discovery (KUB-2, terminal-sim; the blueprint's cluster-sim activity as terminal content). A
 * terminal lesson on the kube-net profile (engine stages E32–E35): the made-up shop team's workstation ops-ws (user yuki)
 * with kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02). catalog (3 replicas,
 * container port 8080 named http, a readiness probe that passes 5 s after a start) and frontend (2 replicas on 3000) run as
 * Deployments; toolbox (default) and shell (namespace ops) are client pods with curl, getent, nc, nslookup and wget. Their
 * HTTP responders answer with {{hostname}}, so the transcripts show which pod answered. Covered: why pods need a stable
 * address (a replaced pod gets a new IP); the Service manifest, selector, port / targetPort (named) / nodePort; ClusterIP,
 * NodePort, LoadBalancer (pending without a provider, an address from a MetalLB-like pool with kube.lbPool) and headless;
 * Endpoints and EndpointSlices with only ready pods (KUB03's readiness probe); the zero-endpoint selector typo and the wrong
 * targetPort; cluster DNS (svc.ns.svc.cluster.local, the search list, ndots:5, cross-namespace names, headless records);
 * kubectl expose and create service; port-forward for debugging. kube-proxy's rules, cloud load balancers,
 * externalTrafficPolicy and ExternalName are prose only. The simulator's kube-proxy rotates over ready endpoints in address
 * order; the text says real iptables mode picks at random, and no check depends on which pod answers. Hosts, users, images
 * and the cluster are made up. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The shop's HTTP services: each answers on its port with a responder that names the pod that answered.
const server = (name: string, port: number, responder: string, created: string): TerminalImage => ({
  name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
  http: { port, responder }, logs: [`${responder} listening on :${port}`], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } },
});
const IMAGES: TerminalImage[] = [
  server('shop/catalog:2.1', 8080, 'catalog', '2026-11-18 09:00:00'),
  server('shop/frontend:1.6', 3000, 'frontend', '2026-11-20 09:00:00'),
  server('shop/cart:1.0', 8081, 'cart', '2026-11-21 09:00:00'),
  // A client for debugging inside the cluster: its main process sleeps; it has the network tools.
  { name: 'shop/toolbox:1.0', size: 12_000_000, created: '2026-11-10 09:00:00', cmd: ['sleep', 'infinity'], service: true, layers: 2, osRelease: DEBIAN,
    commands: [...BASIC, 'curl', 'getent', 'nc', 'nslookup', 'wget'] },
];
const page = (id: string, text: string) => ({
  id, server: `${id}/1.0`, routes: [{ path: '/', body: `${text} served by {{hostname}}\n`, type: 'text/plain' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }],
});
const RESPONDERS = [page('catalog', 'catalog 2.1'), page('frontend', 'shop frontend 1.6'), page('cart', 'cart 1.0')];
const WORKERS = ['node-01', 'node-02'];

const deployment = (name: string, image: string, replicas: number, port: number, container: string[] = [], namedPort = true) => yaml(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, '  labels:', `    app: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`,
  '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:',
  ...namedPort ? ['        - name: http', `          containerPort: ${port}`] : [`        - containerPort: ${port}`], ...container.map(x => `        ${x}`));
// catalog is ready 5 s after a container starts (KUB03's readiness probe), so a new replica stays out of the Service for a moment.
const READINESS = ['readinessProbe:', '  httpGet:', '    path: /healthz', '    port: http', '  initialDelaySeconds: 5', '  periodSeconds: 5'];
const CATALOG_YAML = deployment('catalog', 'shop/catalog:2.1', 3, 8080, READINESS);
const FRONTEND_YAML = deployment('frontend', 'shop/frontend:1.6', 2, 3000, [], false);
const CART_YAML = deployment('cart', 'shop/cart:1.0', 3, 8081);
const OPS_NS = yaml('apiVersion: v1', 'kind: Namespace', 'metadata:', '  name: ops');
const pod = (name: string, namespace?: string) => yaml('apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, ...namespace ? [`  namespace: ${namespace}`] : [], '  labels:', '    app: toolbox', 'spec:', '  containers:',
  '  - name: toolbox', '    image: shop/toolbox:1.0');
const service = (name: string, selector: string, ports: string[], spec: string[] = []) => yaml('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, '  labels:', `    app: ${name}`, 'spec:', ...spec.map(x => `  ${x}`),
  '  selector:', `    app: ${selector}`, '  ports:', ...ports.map(x => `  ${x}`));
const CATALOG_SVC = service('catalog', 'catalog', ['- name: web', '  port: 80', '  targetPort: http']);
const TYPO_SVC = service('catalog', 'catalogue', ['- name: web', '  port: 80', '  targetPort: http']);
const HEADLESS_SVC = service('catalog-pods', 'catalog', ['- port: 8080'], ['clusterIP: None']);

const kubeOf = (manifests: TerminalKube['manifests'], lbPool?: string[]): TerminalKube => ({
  images: ['shop/catalog:2.1', 'shop/frontend:1.6', 'shop/cart:1.0', 'shop/toolbox:1.0'].map(name => ({ name, nodes: WORKERS })),
  manifests, ...lbPool ? { lbPool } : {},
});
const at = (text: string, time: string, f: string) => ({ text, at: `2026-11-24 ${time}`, file: f });
const BOOT = [at(OPS_NS, '09:20:00', 'ops.yaml'), at(pod('toolbox'), '09:30:00', 'toolbox.yaml'), at(pod('shell', 'ops'), '09:30:00', 'shell.yaml'),
  at(CATALOG_YAML, '09:40:00', 'catalog.yaml'), at(FRONTEND_YAML, '09:45:00', 'frontend.yaml')];
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'kube-net', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  responders: RESPONDERS,
  docker: { images: IMAGES },
  kube,
});
const SHOP_FILES = [file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), file('/home/yuki/shop/frontend.yaml', FRONTEND_YAML), file('/home/yuki/shop/catalog-svc.yaml', CATALOG_SVC),
  file('/home/yuki/shop/typo-svc.yaml', TYPO_SVC.replace('name: catalog\n', 'name: catalog-typo\n')), file('/home/yuki/shop/catalog-pods.yaml', HEADLESS_SVC)];
const WS = workstation('kub05-ws', 'ops-ws（shop 團隊的工作站：catalog 與 frontend 已經在叢集上執行）', SHOP_FILES, kubeOf(BOOT));
const LB = workstation('kub05-lb', 'ops-ws（叢集裝了負載平衡器的位址池 10.0.0.200–10.0.0.209）', SHOP_FILES, kubeOf(BOOT, ['10.0.0.200-10.0.0.209']));


// Exercise 1: cart runs as a Deployment (container port 8081, named http) and has no Service yet.
const CART = workstation('kub05-cart', 'ops-ws（購物車服務 cart 已經在執行，還沒有 Service）', [file('/home/yuki/shop/cart.yaml', CART_YAML)],
  kubeOf([...BOOT.slice(0, 3), at(CART_YAML, '09:50:00', 'cart.yaml')]));
// Exercise 2: the Service catalog was applied with a misspelt selector (app: catalogue): it has no endpoints.
const BROKEN = workstation('kub05-broken', 'ops-ws（Service catalog 連線被拒絕）', [file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), file('/home/yuki/shop/catalog-svc.yaml', TYPO_SVC)],
  kubeOf([...BOOT.slice(0, 4), at(TYPO_SVC, '09:50:00', 'catalog-svc.yaml')]));
// Exercise 4: frontend is exposed as a NodePort Service; the cluster picked the node port (the variants set their own).
const nodePortSvc = (nodePort?: number) => service('frontend', 'frontend', ['- port: 80', '  targetPort: 3000', ...nodePort ? [`  nodePort: ${nodePort}`] : []], ['type: NodePort']);
const reportKube = (nodePort?: number) => kubeOf([...BOOT, at(nodePortSvc(nodePort), '09:50:00', 'frontend-svc.yaml')]);
const REPORT = workstation('kub05-report', 'ops-ws（frontend 已經以 NodePort 對外開放）', [], reportKube());

const NODE_PORT = "kubectl get svc frontend -o jsonpath='{.spec.ports[0].nodePort}'";

export const KUB05: LessonContent = {
  lessonId: 'KUB05',
  motivation: 'KUB04 之後，shop 團隊的 catalog 由 Deployment 維持 3 個副本，壞掉的 Pod 會自動補上。可是前端 frontend 要呼叫 catalog 時遇到新問題：該連到哪裡？每個 Pod 都有自己的 IP，但 Pod 被刪除、節點故障被驅逐、擴縮或換版時，補上的是全新的 Pod，帶著新的名稱與新的 IP。把某個 Pod 的 IP 寫進前端的設定，等於把服務綁在一個隨時會消失的位址上；就算每次都去查，也還要自己決定三個副本裡要連哪一個、跳過還沒準備好的那個。Kubernetes 的答案是 Service：一個不會變的名稱與虛擬 IP，背後依標籤選擇器自動追蹤「現在有哪些就緒的 Pod」，把每個連線分給其中一個——Pod 再怎麼變動，用戶端看到的位址都不變。這堂課在 shop 團隊的工作站 ops-ws 上，親眼看 Pod 換掉之後位址改變、Service 的位址不變；比較 ClusterIP、NodePort 與 LoadBalancer 三種 Service 類型；看懂 port、targetPort 與 nodePort 三個連接埠；從叢集裡的 Pod 用 `catalog`、`catalog.default` 這樣的名稱連線，理解叢集內 DNS 的搜尋清單；最後用 Endpoints 排查最常見的錯誤——選擇器打錯一個字，Service 就一個後端也沒有。學完之後，你能讓叢集內外的使用者穩定地連到應用。',
  sections: [
    {
      id: 'kub05-s-why', title: 'Pod 的位址會變：為什麼需要 Service',
      blocks: [
        { type: 'p', text: '每個 Pod 有自己的 IP（模擬叢集裡是節點的 Pod 網段 `10.244.N.0/24` 中的一個位址），同一個叢集裡的 Pod 可以直接互連。但這個位址屬於「那一個 Pod」：KUB01 與 KUB04 已經看過，Pod 被刪除、被驅逐、被縮減或換版時，控制器補上的是新的 Pod，名稱與 IP 都是新的，可能還在另一個節點。用戶端如果記住 Pod 的 IP，遲早會連到一個已經不存在的位址；而且有多個副本時，用戶端還得自己分配流量、自己避開還沒就緒的副本。' },
        { type: 'p', text: 'Service 把這件事交給叢集。它是一個 API 物件，宣告「標籤符合這個選擇器的 Pod，對外提供這個埠」。建立之後它得到一個穩定的虛擬 IP（ClusterIP）與一個 DNS 名稱；Endpoints 控制器持續把「目前符合選擇器而且就緒的 Pod 位址」寫進 Endpoints 與 EndpointSlice；每個節點上的 kube-proxy 依這份清單設定轉送規則，把連到 ClusterIP 的連線轉給其中一個 Pod。' },
        { type: 'table', head: ['', '會變嗎', '誰決定'], rows: [
          ['Pod 的名稱與 IP', '每次補建、擴縮、換版都會變', 'ReplicaSet 建立 Pod、排程器挑節點、節點的 Pod 網段給位址'],
          ['Service 的名稱與 ClusterIP', '建立後不變，直到刪除 Service', '你取名稱；API server 從 Service 網段（kubeadm 預設 10.96.0.0/12）分配位址'],
          ['Endpoints／EndpointSlice 的內容', '隨 Pod 的增減與就緒狀態即時更新', 'Endpoints 與 EndpointSlice 控制器'],
          ['連線落在哪個 Pod', '每個新連線都可能不同', '節點上的 kube-proxy（iptables、IPVS 或 nftables 規則）'],
        ] },
        { type: 'p', text: '下面的範例先刪掉一個 catalog 的 Pod：補上的新 Pod 從 10.244.2.3 換成了 10.244.2.5。接著套用 Service catalog，它拿到 ClusterIP 10.105.249.101。剛建立時 Endpoints 只有兩個位址——新 Pod 的 readiness 探針（KUB03）要 5 秒後才通過，還沒就緒的 Pod 不會收到流量；`sleep 5` 之後它就加入了。最後從 Pod toolbox 以名稱 `catalog` 連線四次，每個新連線輪到下一個端點。' },
        { type: 'example', id: 'kub05-why' },
        { type: 'p', text: '`kubectl describe svc` 把整件事串起來：Selector 是 `app=catalog`，IP 是 ClusterIP，`Port: web 80/TCP` 是 Service 的埠（具名 web），`TargetPort: http/TCP` 是 Pod 那一側的埠，Endpoints 是此刻就緒的 `Pod IP:容器埠`。Service 本身沒有程式在執行，ClusterIP 也不屬於任何一張網路卡；它是 kube-proxy 在每個節點上寫的轉送規則所代表的「虛擬」位址。kube-proxy 的規則內容（iptables 的鏈、IPVS 的虛擬伺服器、conntrack）只在課文說明，模擬環境不提供這些指令。' },
        { type: 'callout', tone: 'note', title: '輪到哪一個 Pod，不要寫死', text: '模擬環境的 kube-proxy 依端點 IP 的順序輪流，每個新連線前進一格，所以範例的結果是固定的。真實叢集預設的 iptables 模式是依機率隨機挑選端點，IPVS 模式才可以設定成依序輪替；同一條連線（例如 HTTP keep-alive 重用的連線）則一直落在同一個 Pod。程式、腳本與測試都不應該假設「下一個請求會到哪一個 Pod」，要驗證的是 Endpoints 的內容與回應是否正確。' },
      ],
    },
    {
      id: 'kub05-s-ports', title: 'Service 的 manifest：選擇器與連接埠對應',
      blocks: [
        { type: 'p', text: 'Service 屬於核心 API 群組，`apiVersion: v1`、`kind: Service`。`spec.selector` 是一組標籤（只有等號式的 matchLabels，沒有 `in`、`notin`），用來挑 Pod；`spec.ports` 列出要提供的埠。容易混淆的是好幾個「埠」，它們分別站在連線路徑的不同位置，Service 做的就是這幾個埠之間的連接埠對應：' },
        { type: 'table', head: ['欄位', '在哪裡', 'catalog 的例子', '說明'], rows: [
          ['`port`', 'Service（ClusterIP）上', '80', '用戶端連的埠：`http://catalog/` 就是 80'],
          ['`targetPort`', 'Pod 裡容器聆聽的埠', '`http`（容器埠 8080 的名稱）', '可以寫數字或容器 `ports` 的名稱；沒寫時等於 `port`'],
          ['`nodePort`', '每個節點的位址上', '（ClusterIP 沒有）', '只有 NodePort 與 LoadBalancer 類型；範圍 30000–32767，沒指定時自動分配'],
          ['`containerPort`', 'Pod 的 manifest', '8080，名稱 `http`', '主要是說明與命名用；程式實際聽哪個埠由程式自己決定'],
          ['`name`、`protocol`', '每一個 Service 埠', '`web`、TCP（預設）', '只有一個埠時名稱可省略，多個埠時每個都要有名稱'],
        ] },
        { type: 'p', text: '具名的 targetPort 很實用：catalog 的容器在 `ports` 宣告 `name: http, containerPort: 8080`，Service 寫 `targetPort: http`。之後程式改聽 8081 時，只要改 Pod 範本的 containerPort，Service 不用動；Endpoints 控制器在每個 Pod 各自把名稱換成數字，所以新舊版本的 Pod 甚至可以聽不同的埠。反過來，名稱拼錯或 Pod 沒有宣告這個名稱時，那個 Pod 不會出現在這個埠的端點裡。' },
        { type: 'p', text: '除了寫 manifest，還有兩個命令式的寫法：`kubectl expose deploy frontend --port=80 --target-port=3000` 從 Deployment 的 `selector.matchLabels` 抄來選擇器（也可以 expose 一個 Pod 或另一個 Service），沒寫 `--port` 時沿用容器宣告的埠；`kubectl create service clusterip|nodeport|loadbalancer 名稱 --tcp=80:3000` 則直接以 `app=名稱` 當選擇器。加上 `--dry-run=client -o yaml` 可以先看產生的 manifest，再存成檔案放進版本控制，這是寫 Service 最快又不失控制的方式（範例 kub05-outside 的第一步）。' },
        { type: 'table', head: ['類型', 'ClusterIP', '節點上的埠', '外部位址', '適合'], rows: [
          ['ClusterIP（預設）', '有', '沒有', '沒有', '只給叢集內部用的服務，例如前端呼叫的 catalog、資料庫'],
          ['NodePort', '有', '每個節點都開同一個 nodePort', '沒有（連節點位址）', '測試、或前面另有自己的負載平衡器'],
          ['LoadBalancer', '有', '有（預設會分配）', '由負載平衡器的提供者分配', '正式對外的服務；需要雲端或裸機的提供者'],
          ['Headless（`clusterIP: None`）', '沒有', '沒有', '沒有', '用戶端自己要知道每個 Pod 的位址，例如 StatefulSet（KUB08）'],
        ] },
        { type: 'p', text: '三種主要類型是一層包一層的：NodePort 也有 ClusterIP，LoadBalancer 也有 nodePort。另外還有 ExternalName 類型，它沒有選擇器，只在 DNS 裡把名稱指到叢集外的另一個網域名稱，這裡只在課文提到。' },
      ],
    },
    {
      id: 'kub05-s-endpoints', title: 'Endpoints 與 EndpointSlice：只有就緒的 Pod 收得到流量',
      blocks: [
        { type: 'p', text: 'Service 不直接記得任何 Pod。Endpoints 控制器（以及新版的 EndpointSlice 控制器）持續做同一件事：找出同一個命名空間、標籤符合選擇器、已經有 IP 的 Pod，把每個 Service 埠的 targetPort 換成那個 Pod 的容器埠，就緒的放進 `addresses`、還沒就緒的放進 `notReadyAddresses`。kube-proxy 只把流量送給就緒的位址。這就是 KUB03 的 readiness 探針真正的用途：探針失敗不會重新啟動容器，而是讓這個 Pod 暫時離開所有選到它的 Service。' },
        { type: 'table', head: ['物件', 'API', '內容', '查看'], rows: [
          ['Endpoints', '`v1`', '一個 Service 一個，同名；subsets 裡分 Addresses 與 NotReadyAddresses', '`kubectl get endpoints catalog`、`describe endpoints`'],
          ['EndpointSlice', '`discovery.k8s.io/v1`', '每個端點有 `conditions.ready`、`serving`、`terminating`，以及 nodeName 與 targetRef（哪個 Pod）；大型 Service 會分成多片', '`kubectl get endpointslices -l kubernetes.io/service-name=catalog`'],
        ] },
        { type: 'p', text: 'EndpointSlice 是為大型叢集設計的新格式：一個有上千個端點的 Service，任何一個 Pod 改變時，舊的 Endpoints 物件要整份重寫、傳給每個節點，EndpointSlice 則只更新其中一片（每片預設最多 100 個端點）。新版的 kube-proxy 讀的是 EndpointSlice；Endpoints 仍然保留，方便人看，也相容舊工具。下面把 catalog 擴到 4 個副本：新 Pod 是 `0/1`，它在 Endpoints 的 NotReadyAddresses、在 EndpointSlice 是 `ready: false`；`kubectl rollout status` 等它就緒之後，Endpoints 有 4 個位址（表格最多列 3 個，其餘寫 `+ 1 more...`）。' },
        { type: 'example', id: 'kub05-endpoints' },
        { type: 'p', text: '範例後半是兩種「Service 有了，卻連不上」的情況，症狀相同（連線被拒絕），但 Endpoints 不一樣，這就是排查時第一個要看 Endpoints 的原因：' },
        { type: 'table', head: ['`kubectl get endpoints` 看到', '代表什麼', '要查什麼'], rows: [
          ['`<none>`', '選擇器沒有選到任何 Pod', '`describe svc` 的 Selector 與 `get pods --show-labels` 逐字比對；命名空間對不對'],
          ['沒有就緒的位址（`describe endpoints` 只有 NotReadyAddresses）', '選到了 Pod，但都還沒就緒', '`get pods` 的 READY 欄、`describe pod` 的 readiness 事件'],
          ['有位址，但埠不對（例如 `:80`）', 'targetPort 和容器實際聆聽的埠不一致', '`describe svc` 的 TargetPort、Pod 的 containerPort 與程式的設定'],
          ['有正確的位址與埠', 'Service 這一層沒問題', '往下查程式本身，或往上查用戶端用的名稱與埠'],
        ] },
        { type: 'callout', tone: 'warning', title: '選擇器打錯一個字，Service 就一個端點也沒有', text: 'catalog-typo 的選擇器寫成 `app: catalogue`，API server 照樣接受、`kubectl apply` 印出 created，Service 也有 ClusterIP 與 DNS 名稱——但沒有任何 Pod 帶這個標籤，Endpoints 是 `<none>`，每個連線都被拒絕。Kubernetes 不會檢查選擇器「有沒有選到東西」，因為 Service 先建、Pod 後建是完全正常的順序。這是實務上最常見的 Service 錯誤之一（標籤的大小寫、單複數、`app` 與 `app.kubernetes.io/name` 混用都會造成）。看到連線被拒絕或逾時，先 `kubectl get endpoints`；修正時改 Service 的選擇器（或 manifest 再 apply），不要反過來改 Pod 的標籤去配合錯字——那會讓 Pod 脫離 Deployment 的選擇器。另一個相似的陷阱是範例最後的 `kubectl expose deploy frontend --port=80`：沒寫 `--target-port`，targetPort 就等於 80，Endpoints 有位址，但 frontend 聽的是 3000，連線一樣被拒絕。' },
      ],
    },
    {
      id: 'kub05-s-dns', title: '叢集內 DNS：用名稱找到 Service',
      blocks: [
        { type: 'p', text: '每個 Service 建立後，叢集的 DNS 服務（kube-system 裡的 CoreDNS，它的 Service 叫 kube-dns，ClusterIP 是 10.96.0.10）就有一筆記錄：`<service>.<namespace>.svc.cluster.local` 解析成它的 ClusterIP。`cluster.local` 是叢集網域的預設值。kubelet 建立 Pod 時替它寫好 `/etc/resolv.conf`：nameserver 指向 kube-dns，搜尋清單依序是 `<自己的命名空間>.svc.cluster.local`、`svc.cluster.local`、`cluster.local`，再加上 `options ndots:5`。' },
        { type: 'table', head: ['在 default 的 Pod 裡寫', '實際查到的名稱', '結果'], rows: [
          ['`catalog`', '`catalog.default.svc.cluster.local`（搜尋清單第一項）', '找到，同命名空間的短名'],
          ['`catalog.default`', '`catalog.default.svc.cluster.local`（第二項 `svc.cluster.local`）', '找到，任何命名空間都能用'],
          ['`catalog.default.svc`', '`catalog.default.svc.cluster.local`（第三項）', '找到'],
          ['`catalog.default.svc.cluster.local`', '先試搜尋網域，最後試名稱本身', '找到；完整名稱（FQDN）'],
          ['在 ops 的 Pod 裡寫 `catalog`', '`catalog.ops.svc.cluster.local`…都不存在', '找不到：短名只在自己的命名空間有效'],
        ] },
        { type: 'p', text: '`ndots:5` 的意思是：名稱裡的點少於 5 個時，解析器先依序加上搜尋網域去查，都查不到才查名稱本身；5 個點以上（或以點結尾）才先查名稱本身。所以叢集內的短名很方便，但查叢集外的名稱（例如 `api.partner.example`，只有 2 個點）時，會先白白查 `api.partner.example.default.svc.cluster.local` 等三次。對效能敏感的程式可以寫成以點結尾的絕對名稱 `api.partner.example.`，或調整 Pod 的 `dnsConfig`（只在課文提到）。每個 Pod 也有一筆以 IP 組成的記錄，例如 `10-244-1-3.default.pod.cluster.local`，但它跟著 IP 變，實務上很少使用。' },
        { type: 'example', id: 'kub05-dns' },
        { type: 'p', text: '`getent hosts` 走的是和一般程式相同的解析器（先看 `/etc/hosts`，再依搜尋清單查 DNS），印出 IP 與找到的完整名稱；ops 的 shell 用 `catalog` 查不到，`getent` 以結束碼 2 表示找不到。`nslookup` 直接問 DNS 伺服器，印出伺服器與每一筆記錄，查不到時是 NXDOMAIN。headless Service（`clusterIP: None`）沒有虛擬 IP，kube-proxy 也不處理它；它的 DNS 名稱直接解析成每個就緒 Pod 的 IP，由用戶端自己挑選或全部連線。資料庫叢集這類「每個成員都要被個別找到」的應用會用到它，KUB08 的 StatefulSet 會再出現。' },
        { type: 'callout', tone: 'tip', title: '環境變數與 DNS', text: 'kubelet 也會把同一個命名空間裡、在 Pod 建立之前就已經存在的 Service 寫成環境變數，例如 `CATALOG_SERVICE_HOST` 與 `CATALOG_SERVICE_PORT`。但 Pod 先建、Service 後建時就沒有這些變數，而且只限同一個命名空間，所以服務之間互相尋找請用 DNS 名稱，把 `http://catalog.default/` 這類位址寫進設定（KUB06 的 ConfigMap）。' },
      ],
    },
    {
      id: 'kub05-s-outside', title: '從叢集外連進來：NodePort 與 LoadBalancer',
      blocks: [
        { type: 'p', text: 'ClusterIP 只在叢集內部有意義：它是每個節點上 kube-proxy 規則認得的虛擬位址，叢集外的機器（例如工作站 ops-ws）沒有通往 Service 網段的路由，連線會逾時；Pod IP 從外面通常也連不到。要讓叢集外的使用者連進來，Service 要換成 NodePort 或 LoadBalancer。' },
        { type: 'p', text: 'NodePort 在每一個節點（包括控制平面）的同一個埠（30000–32767）接受連線，再像 ClusterIP 一樣轉給某個就緒的端點，即使那個節點上根本沒有這個應用的 Pod。`kubectl get svc` 的 PORT(S) 寫成 `80:32135/TCP`：前者是 ClusterIP 上的 port，後者是節點上的 nodePort。它簡單，但用戶端要知道節點的位址、要處理節點故障，埠號也不是 80 或 443，所以通常只用在測試，或前面另有負載平衡器的時候。' },
        { type: 'p', text: 'LoadBalancer 在 NodePort 之上，請「負載平衡器的提供者」配一個對外的位址，寫進 Service 的 `status.loadBalancer.ingress`，`kubectl get svc` 的 EXTERNAL-IP 欄就是它。在雲端的託管 Kubernetes，提供者是雲端控制器（cloud-controller-manager）：它向雲端建立一台負載平衡器，把流量導到各節點的 nodePort（或直接到 Pod），這部分只在課文說明。自己架設的 kubeadm 叢集預設沒有任何提供者，LoadBalancer 的 EXTERNAL-IP 會一直是 `<pending>`，但它的 ClusterIP 與 nodePort 照常可用；裸機叢集常裝 MetalLB 這類開源元件，從一段事先保留的位址池分配位址，並在區域網路上宣告它。' },
        { type: 'example', id: 'kub05-outside' },
        { type: 'p', text: '`--dry-run=client -o yaml` 顯示 expose 產生的 manifest：選擇器 `app: frontend` 抄自 Deployment，`targetPort: 3000`，`type: NodePort`，沒有寫 nodePort，所以 API server 分配了 32135。工作站連 node-01 與控制平面 cp-01 的同一個埠都有回應，而且是由不同的 Pod 回答。ClusterIP 10.109.232.112 從工作站逾時（加上 `--connect-timeout 2` 讓 curl 兩秒就放棄）。frontend-lb 是 LoadBalancer，但這個叢集沒有提供者，EXTERNAL-IP 停在 `<pending>`。下一個範例的叢集裝了位址池 10.0.0.200–10.0.0.209，同一個指令就拿到 10.0.0.200，並記下一則 IPAllocated 事件。' },
        { type: 'example', id: 'kub05-lb' },
        { type: 'table', head: ['想從哪裡連', '用什麼', '例子'], rows: [
          ['同命名空間的 Pod', 'Service 的短名', '`http://catalog/`'],
          ['其他命名空間的 Pod', '名稱加命名空間', '`http://catalog.default/`'],
          ['叢集外、測試用', 'NodePort：任一節點位址加 nodePort', '`http://10.0.0.52:32135/`'],
          ['叢集外、正式對外', 'LoadBalancer 的外部位址（再加上 DNS 名稱）', '`http://10.0.0.200/`'],
          ['只有自己的工作站、除錯用', '`kubectl port-forward`', '`curl localhost:8080`'],
        ] },
        { type: 'callout', tone: 'note', title: '來源位址與 externalTrafficPolicy', text: 'NodePort 與 LoadBalancer 預設 `externalTrafficPolicy: Cluster`：任何節點收到的連線都可以轉給任何節點上的 Pod，分配平均，但轉到別的節點時來源位址會被換成節點的位址，應用看不到真正的用戶端 IP。改成 `Local` 時只轉給本節點的 Pod、保留來源位址，代價是沒有 Pod 的節點不接受連線、分配可能不平均。這個取捨只在課文說明，模擬環境一律是 Cluster。' },
      ],
    },
    {
      id: 'kub05-s-debug', title: '除錯：port-forward 與排查順序',
      blocks: [
        { type: 'p', text: '`kubectl port-forward svc/catalog 8080:80` 讓工作站的 127.0.0.1:8080 經由 API server 與 kubelet 的通道，直接接到一個 Pod 的埠。它不需要 NodePort 或 LoadBalancer，也不會對其他人開放任何東西，適合臨時檢查一個只在叢集內部的服務（例如資料庫或管理介面）。要注意的是：寫 `svc/catalog` 時，kubectl 只是借 Service 的選擇器挑出一個 Pod，把 Service 的 80 換成那個 Pod 的 targetPort（所以印出 `-> 8080`），之後所有連線都到那一個 Pod，不會經過 kube-proxy 的分配——範例中兩次 curl 都由同一個 Pod 回答。它會一直執行，所以範例在指令後加上 `&` 放到背景，用完用 `kill %1` 結束（模擬環境沒有 Ctrl+C）。' },
        { type: 'p', text: '把整堂課串起來，「連不到服務」時可以由近到遠逐層排查，每一層都有對應的指令：' },
        { type: 'list', ordered: true, items: [
          'Pod 本身：`kubectl get pods -l app=catalog -o wide` 是否 Running、READY 是否 `1/1`；`kubectl exec toolbox -- curl -s 10.244.1.3:8080` 直接連 Pod IP 有沒有回應。',
          'Service 選到誰：`kubectl get endpoints catalog`、`kubectl describe svc catalog`（Selector、TargetPort、Endpoints）；`<none>` 先查選擇器與命名空間。',
          '名稱：`kubectl exec toolbox -- getent hosts catalog` 或 `nslookup`；另一個命名空間要寫 `catalog.default`。',
          '埠：用戶端連的是 Service 的 port，不是 targetPort；`curl catalog:8080` 連不到 port 只有 80 的 Service。',
          '叢集外：用 NodePort 的節點位址或 LoadBalancer 的外部位址，不要連 ClusterIP；EXTERNAL-IP 是 `<pending>` 時看叢集有沒有負載平衡器的提供者；只是自己要看一眼就用 port-forward。',
        ] },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['建立 Service', '`kubectl apply -f catalog-svc.yaml`、`kubectl expose deploy cart --port=80 --target-port=8081`、`kubectl create service nodeport frontend --tcp=80:3000 --node-port=30080`'],
          ['看 Service 與端點', '`kubectl get svc -o wide`、`kubectl get endpoints`、`kubectl get endpointslices -l kubernetes.io/service-name=catalog`、`kubectl describe svc catalog`'],
          ['讀出分配的值', '`kubectl get svc frontend -o jsonpath=\'{.spec.clusterIP}\'`、`\'{.spec.ports[0].nodePort}\'`'],
          ['從 Pod 裡測試', '`kubectl exec toolbox -- curl -s catalog`、`getent hosts catalog`、`nslookup catalog`、`wget -qO- http://catalog/`'],
          ['從工作站測試', '`curl -s http://節點位址:nodePort/`、`curl -s http://EXTERNAL-IP/`、`kubectl port-forward svc/catalog 8080:80 &`'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, LB, CART, BROKEN, REPORT],
    examples: [
      {
        id: 'kub05-why', title: '換掉一個 Pod，位址就變了；Service 的名稱不變', machine: 'kub05-ws',
        description: '刪掉一個 catalog 的 Pod，補上的新 Pod 拿到新的 IP。套用 Service catalog 之後，它有固定的 ClusterIP；Endpoints 只列出就緒的 Pod，新 Pod 的 readiness 探針通過後才加入。從 toolbox 以名稱連線，每個新連線輪到下一個 Pod。',
        steps: [
          { command: 'kubectl get pods -l app=catalog -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-js2z2qwnxt-6t485   1/1       Running   0          20m       10.244.2.3   node-02   <none>           <none>\ncatalog-js2z2qwnxt-qd8zh   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-js2z2qwnxt-v69kx   1/1       Running   0          20m       10.244.1.4   node-01   <none>           <none>" },
          { command: "kubectl delete pod $(kubectl get pods -l app=catalog -o jsonpath='{.items[0].metadata.name}')", output: "pod \"catalog-js2z2qwnxt-6t485\" deleted" },
          { command: 'kubectl get pods -l app=catalog -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-js2z2qwnxt-4w6wk   0/1       Running   0          1s        10.244.2.5   node-02   <none>           <none>\ncatalog-js2z2qwnxt-qd8zh   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-js2z2qwnxt-v69kx   1/1       Running   0          20m       10.244.1.4   node-01   <none>           <none>" },
          { command: 'cat shop/catalog-svc.yaml', output: "apiVersion: v1\nkind: Service\nmetadata:\n  name: catalog\n  labels:\n    app: catalog\nspec:\n  selector:\n    app: catalog\n  ports:\n  - name: web\n    port: 80\n    targetPort: http" },
          { command: 'kubectl apply -f shop/catalog-svc.yaml', output: "service/catalog created" },
          { command: 'kubectl get svc catalog', output: "NAME      TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE\ncatalog   ClusterIP   10.105.249.101   <none>        80/TCP    0s" },
          { command: 'kubectl get endpoints catalog', output: "NAME      ENDPOINTS                         AGE\ncatalog   10.244.1.3:8080,10.244.1.4:8080   0s" },
          { command: 'sleep 5', output: "" },
          { command: 'kubectl get endpoints catalog', output: "NAME      ENDPOINTS                                         AGE\ncatalog   10.244.1.3:8080,10.244.1.4:8080,10.244.2.5:8080   5s" },
          { command: "kubectl exec toolbox -- sh -c 'for i in 1 2 3 4; do curl -s catalog; done'", output: "catalog 2.1 served by catalog-js2z2qwnxt-qd8zh\ncatalog 2.1 served by catalog-js2z2qwnxt-v69kx\ncatalog 2.1 served by catalog-js2z2qwnxt-4w6wk\ncatalog 2.1 served by catalog-js2z2qwnxt-qd8zh" },
          { command: 'kubectl describe svc catalog', output: "Name:                     catalog\nNamespace:                default\nLabels:                   app=catalog\nAnnotations:              <none>\nSelector:                 app=catalog\nType:                     ClusterIP\nIP Family Policy:         SingleStack\nIP Families:              IPv4\nIP:                       10.105.249.101\nIPs:                      10.105.249.101\nPort:                     web  80/TCP\nTargetPort:               http/TCP\nEndpoints:                10.244.1.3:8080,10.244.1.4:8080,10.244.2.5:8080\nSession Affinity:         None\nInternal Traffic Policy:  Cluster\nEvents:                   <none>" },
        ],
      },
      {
        id: 'kub05-endpoints', title: '誰在 Endpoints 裡：就緒、選擇器與 targetPort', machine: 'kub05-ws',
        description: '擴到 4 個副本：新 Pod 還沒就緒時在 NotReadyAddresses，EndpointSlice 記下 ready: false；就緒之後才收到流量。選擇器打錯字的 Service 沒有任何端點，連線被拒絕；targetPort 錯了的 Service 有端點，連線一樣被拒絕。',
        steps: [
          { command: 'kubectl apply -f shop/catalog-svc.yaml', output: "service/catalog created" },
          { command: 'kubectl scale deploy/catalog --replicas=4', output: "deployment.apps/catalog scaled" },
          { command: 'kubectl get pods -l app=catalog -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-js2z2qwnxt-2t2gp   0/1       Running   0          0s        10.244.2.5   node-02   <none>           <none>\ncatalog-js2z2qwnxt-6t485   1/1       Running   0          20m       10.244.2.3   node-02   <none>           <none>\ncatalog-js2z2qwnxt-qd8zh   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-js2z2qwnxt-v69kx   1/1       Running   0          20m       10.244.1.4   node-01   <none>           <none>" },
          { command: 'kubectl describe endpoints catalog', output: "Name:         catalog\nNamespace:    default\nLabels:       app=catalog\nAnnotations:  endpoints.kubernetes.io/last-change-trigger-time: 2026-11-24T10:00:00Z\nSubsets:\n  Addresses:          10.244.1.3,10.244.1.4,10.244.2.3\n  NotReadyAddresses:  10.244.2.5\n  Ports:\n    Name  Port  Protocol\n    ----  ----  --------\n    web   8080  TCP\n\nEvents:  <none>" },
          { command: 'kubectl get endpointslices -l kubernetes.io/service-name=catalog', output: "NAME            ADDRESSTYPE   PORTS     ENDPOINTS                                      AGE\ncatalog-nl4td   IPv4          8080      10.244.1.3,10.244.1.4,10.244.2.3 + 1 more...   0s" },
          { command: "kubectl get endpointslices -l kubernetes.io/service-name=catalog -o jsonpath='{range .items[0].endpoints[*]}{.addresses[0]}{\"\\t\"}{.conditions.ready}{\"\\t\"}{.targetRef.name}{\"\\n\"}{end}'", output: "10.244.1.3\ttrue\tcatalog-js2z2qwnxt-qd8zh\n10.244.1.4\ttrue\tcatalog-js2z2qwnxt-v69kx\n10.244.2.3\ttrue\tcatalog-js2z2qwnxt-6t485\n10.244.2.5\tfalse\tcatalog-js2z2qwnxt-2t2gp" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 3 of 4 updated replicas are available...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl get endpoints catalog', output: "NAME      ENDPOINTS                                                     AGE\ncatalog   10.244.1.3:8080,10.244.1.4:8080,10.244.2.3:8080 + 1 more...   5s" },
          { command: 'grep -A 1 selector shop/typo-svc.yaml', output: "  selector:\n    app: catalogue" },
          { command: 'kubectl apply -f shop/typo-svc.yaml', output: "service/catalog-typo created" },
          { command: 'kubectl get endpoints catalog-typo', output: "NAME           ENDPOINTS   AGE\ncatalog-typo   <none>      0s" },
          { command: 'kubectl exec toolbox -- curl -sS catalog-typo', output: "curl: (7) Failed to connect to catalog-typo port 80 after 0 ms: Couldn't connect to server\ncommand terminated with exit code 7" },
          { command: 'kubectl get pods -l app=catalogue', output: "No resources found in default namespace." },
          { command: 'kubectl expose deploy frontend --port=80', output: "service/frontend exposed" },
          { command: 'kubectl get endpoints frontend', output: "NAME       ENDPOINTS                     AGE\nfrontend   10.244.1.5:80,10.244.2.4:80   0s" },
          { command: 'kubectl exec toolbox -- curl -sS frontend', output: "curl: (7) Failed to connect to frontend port 80 after 0 ms: Couldn't connect to server\ncommand terminated with exit code 7" },
          { command: "kubectl get svc frontend -o jsonpath='{.spec.ports[0].targetPort}{\"\\n\"}'", output: "80" },
        ],
      },
      {
        id: 'kub05-dns', title: '叢集 DNS：搜尋清單、跨命名空間與 headless', machine: 'kub05-ws',
        description: 'Pod 的 /etc/resolv.conf 指向 kube-dns（10.96.0.10），搜尋清單從自己的命名空間開始。default 的 toolbox 用 catalog 就找得到；ops 的 shell 要寫 catalog.default。headless Service 的名稱直接解析成每個就緒 Pod 的 IP。',
        steps: [
          { command: 'kubectl apply -f shop/catalog-svc.yaml', output: "service/catalog created" },
          { command: 'kubectl exec toolbox -- cat /etc/resolv.conf', output: "search default.svc.cluster.local svc.cluster.local cluster.local\nnameserver 10.96.0.10\noptions ndots:5" },
          { command: 'kubectl exec toolbox -- getent hosts catalog', output: "10.105.249.101  catalog.default.svc.cluster.local" },
          { command: 'kubectl exec toolbox -- nslookup catalog.default.svc.cluster.local', output: "Server:\t\t10.96.0.10\nAddress:\t10.96.0.10#53\n\nName:\tcatalog.default.svc.cluster.local\nAddress: 10.105.249.101\n" },
          { command: 'kubectl exec -n ops shell -- cat /etc/resolv.conf', output: "search ops.svc.cluster.local svc.cluster.local cluster.local\nnameserver 10.96.0.10\noptions ndots:5" },
          { command: 'kubectl exec -n ops shell -- getent hosts catalog', output: "command terminated with exit code 2" },
          { command: 'kubectl exec -n ops shell -- getent hosts catalog.default', output: "10.105.249.101  catalog.default.svc.cluster.local" },
          { command: 'kubectl exec -n ops shell -- wget -qO- http://catalog.default.svc.cluster.local/healthz', output: "ok" },
          { command: 'kubectl exec toolbox -- nslookup nosuch', output: "Server:\t\t10.96.0.10\nAddress:\t10.96.0.10#53\n\n** server can't find nosuch: NXDOMAIN\n\ncommand terminated with exit code 1" },
          { command: 'cat shop/catalog-pods.yaml', output: "apiVersion: v1\nkind: Service\nmetadata:\n  name: catalog-pods\n  labels:\n    app: catalog-pods\nspec:\n  clusterIP: None\n  selector:\n    app: catalog\n  ports:\n  - port: 8080" },
          { command: 'kubectl apply -f shop/catalog-pods.yaml', output: "service/catalog-pods created" },
          { command: 'kubectl get svc catalog-pods', output: "NAME           TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)    AGE\ncatalog-pods   ClusterIP   None         <none>        8080/TCP   0s" },
          { command: 'kubectl exec toolbox -- getent hosts catalog-pods', output: "10.244.1.3      catalog-pods.default.svc.cluster.local\n10.244.1.4      catalog-pods.default.svc.cluster.local\n10.244.2.3      catalog-pods.default.svc.cluster.local" },
        ],
      },
      {
        id: 'kub05-outside', title: '從叢集外面連進來：NodePort 與沒有提供者的 LoadBalancer', machine: 'kub05-ws',
        description: 'kubectl expose 從 Deployment 抄來選擇器。NodePort 在每個節點的同一個埠開門，工作站連任何一個節點都到得了；ClusterIP 從工作站連不到。這個叢集沒有負載平衡器的提供者，LoadBalancer 的 EXTERNAL-IP 一直是 <pending>。',
        steps: [
          { command: 'kubectl expose deploy frontend --type=NodePort --port=80 --target-port=3000 --dry-run=client -o yaml', output: "apiVersion: v1\nkind: Service\nmetadata:\n  creationTimestamp: null\n  labels:\n    app: frontend\n  name: frontend\nspec:\n  ports:\n  - port: 80\n    protocol: TCP\n    targetPort: 3000\n  selector:\n    app: frontend\n  type: NodePort\nstatus:\n  loadBalancer: {}" },
          { command: 'kubectl expose deploy frontend --type=NodePort --port=80 --target-port=3000', output: "service/frontend exposed" },
          { command: 'kubectl get svc frontend', output: "NAME       TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE\nfrontend   NodePort   10.109.232.112   <none>        80:32135/TCP   0s" },
          { command: 'kubectl get nodes -o wide', output: "NAME      STATUS    ROLES           AGE       VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION     CONTAINER-RUNTIME\ncp-01     Ready     control-plane   30d       v1.32.3   10.0.0.50     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24\nnode-01   Ready     <none>          30d       v1.32.3   10.0.0.51     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24\nnode-02   Ready     <none>          30d       v1.32.3   10.0.0.52     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24" },
          { command: `NP=$(${NODE_PORT})`, output: "" },
          { command: 'curl -s http://10.0.0.51:$NP/', output: "shop frontend 1.6 served by frontend-4q2kkfhkgd-8hcbb" },
          { command: 'curl -s http://10.0.0.50:$NP/', output: "shop frontend 1.6 served by frontend-4q2kkfhkgd-bfs8n" },
          { command: "curl -sS --connect-timeout 2 http://$(kubectl get svc frontend -o jsonpath='{.spec.clusterIP}')/", output: "curl: (28) Failed to connect to 10.109.232.112 port 80 after 2000 ms: Timeout was reached" },
          { command: 'kubectl expose deploy frontend --name=frontend-lb --type=LoadBalancer --port=80 --target-port=3000', output: "service/frontend-lb exposed" },
          { command: 'kubectl get svc', output: "NAME          TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE\nfrontend      NodePort       10.109.232.112   <none>        80:32135/TCP   0s\nfrontend-lb   LoadBalancer   10.105.247.84    <pending>     80:32222/TCP   0s\nkubernetes    ClusterIP      10.96.0.1        <none>        443/TCP        30d" },
        ],
      },
      {
        id: 'kub05-lb', title: '有位址池的 LoadBalancer，與用 port-forward 除錯', machine: 'kub05-lb',
        description: '這個叢集裝了負載平衡器的位址池（10.0.0.200–10.0.0.209），LoadBalancer 拿到 10.0.0.200，工作站直接連那個位址。kubectl port-forward 放到背景，把工作站的 8080 埠接到 catalog 選出的一個 Pod；用完 kill %1。',
        steps: [
          { command: 'kubectl expose deploy frontend --type=LoadBalancer --port=80 --target-port=3000', output: "service/frontend exposed" },
          { command: 'kubectl get svc frontend', output: "NAME       TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE\nfrontend   LoadBalancer   10.109.232.112   10.0.0.200    80:32135/TCP   0s" },
          { command: 'kubectl events --for svc/frontend', output: "LAST SEEN   TYPE      REASON        OBJECT             MESSAGE\n0s          Normal    IPAllocated   Service/frontend   Assigned IP [\"10.0.0.200\"]" },
          { command: 'curl -s http://10.0.0.200/', output: "shop frontend 1.6 served by frontend-4q2kkfhkgd-8hcbb" },
          { command: 'curl -s http://10.0.0.200/', output: "shop frontend 1.6 served by frontend-4q2kkfhkgd-bfs8n" },
          { command: 'kubectl apply -f shop/catalog-svc.yaml', output: "service/catalog created" },
          { command: 'kubectl port-forward svc/catalog 8080:80 &', output: "[1] 901\nForwarding from 127.0.0.1:8080 -> 8080\nForwarding from [::1]:8080 -> 8080" },
          { command: 'curl -s localhost:8080', output: "Handling connection for 8080\ncatalog 2.1 served by catalog-js2z2qwnxt-6t485" },
          { command: 'curl -s localhost:8080', output: "Handling connection for 8080\ncatalog 2.1 served by catalog-js2z2qwnxt-6t485" },
          { command: 'jobs', output: "[1]+  Running                 kubectl port-forward svc/catalog 8080:80 &" },
          { command: 'kill %1', output: "[1]+  Terminated              kubectl port-forward svc/catalog 8080:80" },
          { command: 'curl -sS localhost:8080', output: "curl: (7) Failed to connect to localhost port 8080 after 0 ms: Couldn't connect to server" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub05-ex-expose', title: '替 cart 建立 ClusterIP Service，讓其他 Pod 以名稱連線', machine: 'kub05-cart',
        statement: '購物車服務 cart 已經以 Deployment 執行（3 個副本，容器在 8081 埠聆聽），但還沒有 Service。建立一個名為 `cart`、類型 ClusterIP 的 Service：叢集裡的程式連 `http://cart/`（Service 的 80 埠），要轉到容器的 8081 埠，選擇器只選 `app=cart` 的 Pod。建立之後，從 default 命名空間的 Pod `toolbox` 以名稱連一次，確認回應來自 cart。另外 ops 命名空間的 Pod `shell` 也要連得到它（想想它該用哪一個名稱）。',
        checks: [
          { kind: 'kube-service', name: 'cart', type: 'ClusterIP', ports: [{ port: 80 }], selector: { app: 'cart' }, readyEndpoints: 3 },
          { kind: 'http', url: 'http://cart/', pod: 'toolbox', status: 200, body: 'cart 1.0 served by' },
          { kind: 'reach', to: 'cart.default', port: 80, pod: 'ops/shell', result: 'succeeded' },
        ],
        solution: ['kubectl get deploy cart -o wide', 'kubectl expose deploy cart --port=80 --target-port=8081', 'kubectl get endpoints cart', 'kubectl exec toolbox -- curl -s http://cart/', 'kubectl exec -n ops shell -- curl -s http://cart.default/'],
        mistakes: [
          { commands: ['kubectl expose deploy cart --port=80', 'kubectl exec toolbox -- curl -s http://cart/'], why: '沒有寫 --target-port，targetPort 預設等於 port（80），但容器在 8081 聆聽：Endpoints 有 3 個位址，連線卻被拒絕' },
          { commands: ['kubectl expose deploy cart', 'kubectl exec toolbox -- curl -s http://cart:8081/'], why: '沒有寫 --port，expose 沿用容器的 8081 當 Service 的埠，`http://cart/`（80 埠）連不到' },
          { commands: ['kubectl expose deploy cart --port=80 --target-port=8081 --type=NodePort'], why: '題目要的是只在叢集內使用的 ClusterIP；NodePort 會在每個節點多開一個對外的埠' },
          { commands: ['kubectl create service clusterip cart-svc --tcp=80:8081'], why: 'create service 用名稱當選擇器（app=cart-svc），選不到任何 Pod；而且 Service 的名稱也不是 cart，cart 這個 DNS 名稱不存在' },
        ],
        hints: [
          '`kubectl expose deploy cart` 會從 Deployment 的 `selector.matchLabels` 抄來選擇器 `app=cart`；用 `--port` 與 `--target-port` 指定兩邊的埠。',
          'port 是用戶端連的 Service 埠（80），targetPort 是 Pod 裡容器聆聽的埠（8081）。',
          '`kubectl get endpoints cart` 應該列出 3 個 `:8081` 的位址；`kubectl exec toolbox -- curl -s http://cart/` 驗證。ops 命名空間的 Pod 要寫 `cart.default`。',
        ],
        explanation: '`kubectl expose deploy cart --port=80 --target-port=8081` 建立 ClusterIP 類型的 Service：選擇器 `app=cart` 來自 Deployment，叢集從 10.96.0.0/12 分配一個 ClusterIP，CoreDNS 加上 `cart.default.svc.cluster.local` 的記錄，Endpoints 控制器把 3 個就緒 Pod 的 `IP:8081` 寫進 Endpoints。toolbox 在 default 命名空間，搜尋清單第一個是 `default.svc.cluster.local`，所以短名 `cart` 就找得到；ops 的 shell 搜尋的是 `ops.svc.cluster.local`，要寫 `cart.default`（或完整名稱）。少寫 `--target-port` 時 targetPort 等於 80，端點都在但沒有程式在 80 埠聆聽，連線被拒絕；少寫 `--port` 則 Service 的埠變成 8081。',
      },
      {
        id: 'kub05-ex-selector', title: '修好沒有端點的 Service', machine: 'kub05-broken',
        statement: '前端回報連 `http://catalog/` 一直被拒絕，但 catalog 的 3 個 Pod 都在執行、也都就緒。找出 Service `catalog` 哪裡錯了，修正 `~/shop/catalog-svc.yaml`（只改有錯的地方，其他內容不變）並重新套用，讓 Service 有 3 個就緒的端點、`toolbox` 能以名稱連到 catalog。叢集裡的 Service 要和這份 manifest 一致。',
        checks: [
          { kind: 'content', path: '/home/yuki/shop/catalog-svc.yaml', content: CATALOG_SVC },
          { kind: 'kube-service', name: 'catalog', type: 'ClusterIP', ports: [{ port: 80, targetPort: 'http' }], selector: { app: 'catalog' }, readyEndpoints: 3 },
          { kind: 'http', url: 'http://catalog/', pod: 'toolbox', status: 200, body: 'catalog 2.1 served by' },
        ],
        solution: ['kubectl get endpoints catalog', "kubectl describe svc catalog | grep -E 'Selector|Endpoints'", 'kubectl get pods --show-labels', "sed -i 's/app: catalogue/app: catalog/' shop/catalog-svc.yaml",
          'kubectl apply -f shop/catalog-svc.yaml', 'kubectl get endpoints catalog', 'kubectl exec toolbox -- curl -s catalog'],
        mistakes: [
          { commands: ["sed -i 's/app: catalogue/app: catalog/' shop/catalog-svc.yaml"], why: '只改了檔案，沒有 kubectl apply：叢集裡的 Service 還是選 app=catalogue，仍然沒有端點' },
          { commands: ['kubectl label pods -l app=catalog app=catalogue --overwrite', 'sleep 10'], why: '改 Pod 去配合錯字：Pod 離開了 Deployment 的選擇器，ReplicaSet 又補上 3 個新 Pod；Service 的選擇器與 manifest 還是錯的' },
          { commands: ['kubectl rollout restart deploy/catalog', 'kubectl rollout status deploy/catalog'], why: '重新啟動 Pod 不會改變 Service 的選擇器，新的 Pod 一樣帶著 app=catalog，仍然選不到' },
          { commands: ['kubectl delete svc catalog', 'kubectl expose deploy catalog --port=80 --target-port=http'], why: '叢集裡的 Service 能用了，但 catalog-svc.yaml 還是錯的；下一次有人照它 apply，問題又回來' },
        ],
        hints: [
          '`kubectl get endpoints catalog` 是 `<none>`：Service 沒有選到任何就緒的 Pod。比較 `kubectl describe svc catalog` 的 Selector 與 `kubectl get pods --show-labels`。',
          '選擇器寫成了 `app: catalogue`。用 `sed -i \'s/app: catalogue/app: catalog/\' shop/catalog-svc.yaml` 只改那一行。',
          '`kubectl apply -f shop/catalog-svc.yaml` 之後，`kubectl get endpoints catalog` 應該有 3 個位址，再用 `kubectl exec toolbox -- curl -s catalog` 驗證。',
        ],
        explanation: 'Service 的端點完全由選擇器決定：Endpoints 控制器找出同命名空間、標籤符合 `selector` 而且就緒的 Pod。manifest 把選擇器寫成 `app: catalogue`，沒有任何 Pod 有這個標籤，Endpoints 是 `<none>`，kube-proxy 對這個 ClusterIP 沒有後端可選，連線被拒絕；Pod 本身完全正常，所以 Pod 的狀態看不出問題。把選擇器改回 `app: catalog` 再 `kubectl apply`，控制器立刻寫入 3 個就緒的 `IP:8080`（具名的 targetPort `http` 對到容器的 8080）。修 manifest 而不是只修叢集，下一次照 manifest 部署才不會重演；改 Pod 的標籤去配合錯字則會讓 Pod 脫離 Deployment。',
      },
      {
        id: 'kub05-ex-nodeport', title: '用固定的 NodePort 讓叢集外連到 frontend', machine: 'kub05-ws',
        statement: '辦公室網路的防火牆只開放各節點的 30080 埠。建立名為 `frontend`、類型 NodePort 的 Service：80 埠轉到 frontend 容器的 3000 埠，nodePort 固定為 30080，選擇器選 `app=frontend` 的 Pod。完成後從工作站 ops-ws 直接連 node-02（10.0.0.52）的 30080 埠確認。',
        checks: [
          { kind: 'kube-service', name: 'frontend', type: 'NodePort', ports: [{ port: 80, targetPort: '3000', nodePort: 30080 }], selector: { app: 'frontend' }, readyEndpoints: 2 },
          { kind: 'http', url: 'http://10.0.0.52:30080/', status: 200, body: 'shop frontend 1.6 served by' },
        ],
        solution: ['kubectl create service nodeport frontend --tcp=80:3000 --node-port=30080', 'kubectl get svc frontend', 'kubectl get endpoints frontend', 'curl -s http://10.0.0.52:30080/'],
        mistakes: [
          { commands: ['kubectl expose deploy frontend --type=NodePort --port=80 --target-port=3000'], why: '沒有指定 nodePort，叢集從 30000–32767 自己挑了一個，不是防火牆開放的 30080' },
          { commands: ['kubectl expose deploy frontend --port=80 --target-port=3000', 'curl -s --connect-timeout 2 http://10.0.0.52:30080/'], why: 'ClusterIP 只在叢集內部有效，節點上沒有開任何埠，工作站連不到' },
          { commands: ['kubectl create service nodeport frontend --tcp=80 --node-port=30080', 'curl -s http://10.0.0.52:30080/'], why: '--tcp=80 沒有寫 targetPort，預設也是 80，但 frontend 在 3000 聆聽：節點的埠開了，連線卻被拒絕' },
          { commands: ['kubectl create service nodeport frontend --tcp=80:3000 --node-port=8080'], why: 'nodePort 必須在 30000–32767 的範圍內，API server 拒絕建立這個 Service' },
        ],
        hints: [
          '`kubectl create service nodeport 名稱 --tcp=port:targetPort --node-port=N` 一行就能建立，它以 `app=名稱` 當選擇器。也可以寫 manifest：`type: NodePort`，埠寫 `port`、`targetPort`、`nodePort`。',
          'nodePort 必須在 30000–32767；不指定時叢集會自己挑一個。',
          '`kubectl get svc frontend` 的 PORT(S) 應該是 `80:30080/TCP`，再用 `curl -s http://10.0.0.52:30080/` 從工作站連線。',
        ],
        explanation: 'NodePort 類型的 Service 先有一個 ClusterIP，再在每一個節點（包括控制平面）的同一個埠上接受連線，轉給 Service 的端點；PORT(S) 寫成 `80:30080/TCP`，表示 ClusterIP 的 80 埠與節點的 30080 埠。`kubectl create service nodeport frontend --tcp=80:3000 --node-port=30080` 以 `app=frontend` 為選擇器，正好選到 frontend 的 2 個 Pod，targetPort 是容器聆聽的 3000。工作站不在叢集的網路裡，連不到 ClusterIP，但連得到節點的位址，所以 `curl http://10.0.0.52:30080/` 有回應。不指定 nodePort 時叢集從 30000–32767 挑一個，防火牆就對不上；targetPort 寫錯則連線被拒絕。',
      },
      {
        id: 'kub05-ex-read', title: '查出 frontend 在節點上開的埠', machine: 'kub05-report',
        statement: '防火牆團隊要知道 Service `frontend` 在節點上開了哪一個埠（nodePort）。印出這個埠號：最後一個指令只印出數字本身（例如 `30123`），不要有標題或其他文字。請從叢集讀取，不要寫死：同一串指令會在另外兩個叢集上重播，那裡的 nodePort 不同。',
        checks: [{ kind: 'output', fromCommand: '^kubectl get ' }],
        solution: ['kubectl get svc frontend', NODE_PORT],
        mistakes: [
          { commands: ['kubectl get svc frontend'], why: 'PORT(S) 欄有答案（80:埠/TCP），但輸出是整個表格，不是只有埠號' },
          { commands: ["kubectl get svc frontend -o jsonpath='{.spec.ports[0].port}'"], why: '印出的是 Service 在 ClusterIP 上的 port（80），不是節點上的 nodePort' },
          { commands: ["kubectl get svc frontend -o jsonpath='{.spec.ports[0].targetPort}'"], why: '印出的是容器聆聽的 targetPort（3000），不是節點上的 nodePort' },
        ],
        variants: [
          { label: 'nodePort 指定為 31080 的叢集', files: [], kube: reportKube(31080) },
          { label: 'nodePort 指定為 30443 的叢集', files: [], kube: reportKube(30443) },
        ],
        hints: [
          '`kubectl get svc frontend` 的 PORT(S) 欄寫成 `port:nodePort/TCP`。',
          'nodePort 存在 Service 的 `spec.ports[].nodePort`。',
          '`kubectl get svc frontend -o jsonpath=\'{.spec.ports[0].nodePort}\'` 只印出數字。',
        ],
        explanation: 'NodePort Service 的每個埠有三個數字：`port`（ClusterIP 上的埠，80）、`targetPort`（容器的埠，3000）與 `nodePort`（每個節點上的埠）。manifest 沒有寫 nodePort 時，API server 從 30000–32767 分配一個，所以只能從叢集讀出來：`-o jsonpath=\'{.spec.ports[0].nodePort}\'` 直接印出數字。另外兩個叢集的 manifest 指定了 31080 與 30443，同一個指令讀到的就是它們。`port` 與 `targetPort` 是另外兩個欄位，不是防火牆要開的埠。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub05-q1', prompt: 'Service web 的 Pod 都是 Running、READY `1/1`，但 `kubectl get endpoints web` 顯示 `<none>`。最可能的原因是？',
      options: ['Service 的 targetPort 和容器聆聽的埠不一致', 'Service 的選擇器和 Pod 的標籤不符，或兩者不在同一個命名空間', 'Service 的類型應該從 ClusterIP 改成 NodePort', 'CoreDNS 還沒有替這個 Service 建立 DNS 記錄'],
      answer: 1,
      explanation: 'Endpoints 由選擇器決定：控制器只挑同命名空間、標籤符合選擇器的 Pod，`<none>` 表示一個都沒選到，常見原因是選擇器打錯字或 Service 建在別的命名空間。targetPort 錯時 Pod 仍會被選到，Endpoints 會有位址、只是埠不對；類型與端點無關，三種類型都用同一個選擇器；DNS 記錄只對應名稱與 ClusterIP，不影響 Endpoints 的內容。',
    },
    {
      id: 'kub05-q2', prompt: 'NodePort Service web 寫著 `port: 80`、`targetPort: http`、`nodePort: 30080`，Pod 的容器埠 `http` 是 8080。同一個命名空間裡的另一個 Pod 要連它，應該用哪一個位址？',
      options: ['`http://web:8080/`，因為容器聽的是 8080', '`http://web:30080/`，因為這是 Service 的 nodePort', '`http://web:http/`，因為 targetPort 的名稱是 http', '`http://web/`，也就是 Service 的 80 埠'],
      answer: 3,
      explanation: '用戶端連的是 Service 的 `port`：名稱 web 解析成 ClusterIP，kube-proxy 把 ClusterIP 的 80 埠轉到某個 Pod 的 8080。8080 是 Pod 那一側的 targetPort，ClusterIP 上沒有這個埠；30080 開在每個節點的位址上，不在 ClusterIP 上；URL 的埠只能寫數字，具名埠只用在 manifest 的 targetPort。',
    },
    {
      id: 'kub05-q3', prompt: 'ops 命名空間的 Pod 執行 `curl http://catalog/`，而 Service catalog 在 default 命名空間。會發生什麼事？',
      options: ['名稱解析失敗：短名只在 ops 的搜尋清單裡找，要寫成 `catalog.default`', '成功：叢集 DNS 會依序在所有命名空間裡尋找同名的 Service 並回傳第一個', '連線被拒絕：Kubernetes 預設禁止 Pod 對其他命名空間的 Service 建立連線', '成功，但只會連到 ops 命名空間裡帶 app=catalog 標籤的 Pod，default 的不算'],
      answer: 0,
      explanation: 'Pod 的 `/etc/resolv.conf` 搜尋清單從自己的命名空間開始（`ops.svc.cluster.local`、`svc.cluster.local`、`cluster.local`），所以 `catalog` 只會找到 ops 裡的同名 Service；跨命名空間要寫 `catalog.default` 或完整名稱。DNS 不會跨命名空間猜測；沒有 NetworkPolicy 時跨命名空間的連線預設是允許的；Service 的選擇器只看自己命名空間的 Pod，不會改選 ops 的 Pod。',
    },
    {
      id: 'kub05-q4', prompt: 'catalog 的某個 Pod 的 readiness 探針開始失敗（liveness 探針正常）。Service 會怎麼處理這個 Pod？',
      options: ['kubelet 立刻重新啟動它的容器，並一直重啟到探針成功為止', 'Deployment 刪除這個 Pod，再由 ReplicaSet 補建一個新的', '移到 notReadyAddresses、不再收到新連線，但 Pod 繼續執行', 'Service 換一個新的 ClusterIP，讓連線避開這個未就緒的 Pod'],
      answer: 2,
      explanation: 'readiness 探針只決定 Pod 能不能收流量：失敗時 Pod 的 Ready 條件變成 False，Endpoints 控制器把它移到 notReadyAddresses（EndpointSlice 的 ready: false），kube-proxy 不再把新連線送給它，探針恢復後又自動加入。重新啟動容器是 liveness 探針失敗的結果；Deployment 只維持 Pod 的數量，不會因為不就緒而刪除；ClusterIP 建立後不會改變。',
    },
    {
      id: 'kub05-q5', prompt: '在自己用 kubeadm 架設、沒有裝任何額外元件的叢集上建立 `type: LoadBalancer` 的 Service，EXTERNAL-IP 一直是 `<pending>`。正確的理解是？',
      options: ['Service 建立失敗了，要刪除後用同一個 manifest 重新建立', '選擇器沒有選到任何就緒的 Pod，所以分配不到對外位址', '沒有負載平衡器的提供者；ClusterIP 與 nodePort 仍照常可用', '要等節點的 DNS 快取過期，EXTERNAL-IP 才會出現'],
      answer: 2,
      explanation: 'LoadBalancer 的外部位址由提供者寫入：雲端是雲端控制器，裸機要另外裝位址池元件（例如 MetalLB）。kubeadm 叢集預設兩者都沒有，所以一直是 `<pending>`，但 Service 本身已經建立，ClusterIP 與自動分配的 nodePort 都能用。重建不會改變結果；外部位址與有沒有端點無關；DNS 快取和這個欄位沒有關係。',
    },
    {
      id: 'kub05-q6', prompt: '從工作站執行 `curl --connect-timeout 2 http://10.105.249.101/`（catalog 的 ClusterIP）逾時，但 `kubectl exec toolbox -- curl -s catalog` 正常。原因是？',
      options: ['ClusterIP 只在叢集內有效，工作站沒有路由；要從外面連得用 NodePort 等方式', 'catalog 沒有就緒的端點，只有 toolbox 剛好連到 kube-proxy 快取的舊回應', '工作站的 DNS 沒有 cluster.local 網域，所以查不到這個 ClusterIP 對應的名稱', 'Service 的 targetPort 寫錯了，只有叢集內的連線會被 kube-proxy 自動修正'],
      answer: 0,
      explanation: 'ClusterIP 不屬於任何網路卡，只有節點上 kube-proxy 的規則認得它，叢集外的機器沒有通往 Service 網段的路由，所以連線逾時；從 Pod 裡連就正常。toolbox 能收到回應，表示端點存在而且 targetPort 正確，curl 也沒有快取；這裡直接用 IP，根本沒有經過 DNS，所以和 cluster.local 無關。',
    },
    {
      id: 'kub05-q7', prompt: 'Service catalog-pods 寫著 `clusterIP: None`，選擇器選到 3 個就緒的 Pod。在 Pod 裡執行 `getent hosts catalog-pods` 會得到什麼？',
      options: ['一個新分配的 ClusterIP', 'kube-dns 的位址 10.96.0.10', '三個節點的 IP', '三個就緒 Pod 各自的 IP'],
      answer: 3,
      explanation: '`clusterIP: None` 是 headless Service：沒有虛擬 IP，kube-proxy 也不處理它，DNS 名稱直接解析成每個就緒 Pod 的位址，由用戶端自己選擇。它不會分配 ClusterIP（CLUSTER-IP 欄是 None）；10.96.0.10 是回答查詢的 DNS 伺服器，不是查詢結果；節點的位址只和 NodePort 有關。',
    },
    {
      id: 'kub05-q8', prompt: '執行 `kubectl port-forward svc/catalog 8080:80 &` 之後，在工作站連續執行幾次 `curl localhost:8080`。會發生什麼事？',
      options: ['和經過 Service 一樣，每個連線依序輪到不同的就緒 Pod', 'kubectl 依選擇器挑出一個 Pod，連線全轉到它的 targetPort', '每個節點都開了 8080 埠，辦公室裡的其他人也能連進來', 'catalog 被暫時改成 NodePort 類型，nodePort 是 8080'],
      answer: 1,
      explanation: 'port-forward 寫 `svc/catalog` 只是借用 Service 的選擇器挑一個 Pod（就緒的優先），把 Service 的 80 換成那個 Pod 的 targetPort，之後連線經由 API server 與 kubelet 的通道都到這一個 Pod，不經過 kube-proxy 的分配。它只在工作站的 127.0.0.1 聆聽，別人連不到；也完全不修改 Service 物件，nodePort 更必須在 30000–32767。',
    },
  ],
};
