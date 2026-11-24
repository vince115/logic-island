/*
 * KUB07 Ingress and the Gateway API (KUB-2, network-sequence; the blueprint's request-path activity drawn as a network
 * scene beside the terminal, as KUB02 and SRV07 do). A terminal lesson on the ingress profile (engine stages E32–E37,
 * with E13's certificates) beside one network-protocol scene. The made-up shop team's workstation ops-ws (user yuki, as
 * in KUB05) has kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02), whose
 * MetalLB-like pool is 10.0.0.200–10.0.0.209; ingress-nginx (v1.12.0) is installed with a LoadBalancer Service (the
 * pool's first address, 10.0.0.200) and the Gateway API CRDs with a made-up controller (example.com/gateway-controller).
 * frontend (2 replicas, port 3000) and catalog (2 replicas, 8080) run behind ClusterIP Services named after them (port 80
 * named web, targetPort http); catalog-v2 (2.2, the canary) and ops-ui are applied where a part needs them. Their HTTP
 * responders answer every path (an Ingress passes the whole path, no rewrite) with {{hostname}}, so transcripts show
 * which pod answered. /etc/hosts stands in for the company's DNS (shop.example.test and ops.example.test → 10.0.0.200,
 * api.example.test → the Gateway's 10.0.0.201), and the company's internal CA (a lesson certificate) is in the
 * workstation's trust store; the key of shop.example.test's certificate is the learner's file (keyPem with the seed the
 * engine gives that certificate). Covered: one entry for many Services against a LoadBalancer per Service; Ingress
 * against its controller (IngressClass, ingressClassName, the default class, an Ingress nobody serves); host and path
 * routing (Exact, Prefix by path elements, the longest match, the default backend's 404, no rewrite); kubectl create
 * ingress; TLS termination with a kubernetes.io/tls Secret, SNI, the Fake Certificate, the 308 redirect and HSTS;
 * cert-manager and ACME as prose (SRV04); the Gateway API's roles (GatewayClass, Gateway, HTTPRoute), its status
 * conditions and weighted backends for a canary (CICD10); a comparison table. The scene traces one HTTPS request: DNS,
 * the LoadBalancer address on node-01 and kube-proxy's DNAT to the controller pod, TLS with the Secret's certificate,
 * the longest-match route, ingress-nginx picking a ready catalog endpoint itself from the EndpointSlices (not through
 * the ClusterIP), and the response with HSTS. In the scene the workstation's address 10.0.0.20, the DNS server 10.0.0.2
 * and ephemeral ports are made up; other addresses and names are the engine's. The simulator's nginx Date header uses its
 * own clock, so transcripts avoid printing response headers other than the status line and Location. ingress-nginx
 * annotations, ReferenceGrant, other route kinds and real cloud load balancers are prose only. Every transcript output
 * was produced by replaying it on the engine.
 */
import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { TerminalCertificate } from '@/lib/terminal/web-lesson';
import { keyPem } from '@/lib/terminal/tls';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
const server = (name: string, port: number, responder: string, created: string): TerminalImage => ({
  name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
  http: { port, responder }, logs: [`${responder} listening on :${port}`], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } },
});
const IMAGES: TerminalImage[] = [
  server('shop/frontend:1.6', 3000, 'frontend', '2026-11-20 09:00:00'),
  server('shop/catalog:2.1', 8080, 'catalog', '2026-11-18 09:00:00'),
  server('shop/catalog:2.2', 8080, 'catalog-v2', '2026-11-23 09:00:00'),
  server('shop/ops-ui:1.0', 9090, 'ops-ui', '2026-11-10 09:00:00'),
];
// Behind an Ingress a backend receives the whole path (no rewrite), so every responder answers any path.
const page = (id: string, text: string) => ({ id, server: `${id}/1.0`, routes: [{ path: '/*', body: `${text} served by {{hostname}}\n`, type: 'text/plain' }] });
const RESPONDERS = [page('frontend', 'shop frontend 1.6'), page('catalog', 'catalog 2.1'), page('catalog-v2', 'catalog 2.2 (canary)'), page('ops-ui', 'shop ops dashboard')];
const WORKERS = ['node-01', 'node-02'];

const deployment = (name: string, image: string, replicas: number, port: number, labels: string[]) => yaml(
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', ...labels.map(l => `      ${l}`),
  '  template:', '    metadata:', '      labels:', ...labels.map(l => `        ${l}`), '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:',
  '        - name: http', `          containerPort: ${port}`);
const service = (name: string, labels: string[]) => yaml('apiVersion: v1', 'kind: Service', 'metadata:', `  name: ${name}`, 'spec:', '  selector:', ...labels.map(l => `    ${l}`),
  '  ports:', '  - name: web', '    port: 80', '    targetPort: http');
const app = (name: string, image: string, replicas: number, port: number, labels = [`app: ${name}`]) => `${deployment(name, image, replicas, port, labels)}---\n${service(name, labels)}`;
const FRONTEND = app('frontend', 'shop/frontend:1.6', 2, 3000);
// catalog's stable and canary versions share app: catalog; track tells their Services apart.
const CATALOG = app('catalog', 'shop/catalog:2.1', 2, 8080, ['app: catalog', 'track: stable']);
const CATALOG_V2 = app('catalog-v2', 'shop/catalog:2.2', 1, 8080, ['app: catalog', 'track: canary']);
const OPS_UI = app('ops-ui', 'shop/ops-ui:1.0', 1, 9090);

const HOST = 'shop.example.test', OPS_HOST = 'ops.example.test', API_HOST = 'api.example.test';
const LB = '10.0.0.200', GW_IP = '10.0.0.201';
const pathRule = (path: string, type: string, svc: string, port = 80) => [`      - path: ${path}`, `        pathType: ${type}`, '        backend:', '          service:', `            name: ${svc}`,
  '            port:', `              number: ${port}`];
const ingress = (name: string, host: string, paths: string[], spec: string[]) => yaml('apiVersion: networking.k8s.io/v1', 'kind: Ingress', 'metadata:', `  name: ${name}`, 'spec:',
  ...spec.map(l => `  ${l}`), '  rules:', `  - host: ${host}`, '    http:', '      paths:', ...paths);
const CLASS = ['ingressClassName: nginx'];
const SHOP_PATHS = [...pathRule('/', 'Prefix', 'frontend'), ...pathRule('/api', 'Prefix', 'catalog')];
const SHOP_ING = ingress('shop', HOST, SHOP_PATHS, CLASS);
const SHOP_TLS_ING = ingress('shop', HOST, SHOP_PATHS, [...CLASS, 'tls:', '- hosts:', `  - ${HOST}`, '  secretName: shop-tls']);
// A teammate's Ingress for the ops dashboard: no class, and the container's port instead of the Service's.
const OPS_BROKEN = ingress('ops', OPS_HOST, pathRule('/', 'Prefix', 'ops-ui', 9090), []);
const OPS_FIXED = ingress('ops', OPS_HOST, pathRule('/', 'Prefix', 'ops-ui'), CLASS);

const GATEWAY = yaml('apiVersion: gateway.networking.k8s.io/v1', 'kind: GatewayClass', 'metadata:', '  name: edge', 'spec:', '  controllerName: example.com/gateway-controller', '---',
  'apiVersion: v1', 'kind: Namespace', 'metadata:', '  name: infra', '---',
  'apiVersion: gateway.networking.k8s.io/v1', 'kind: Gateway', 'metadata:', '  name: shop-gw', '  namespace: infra', 'spec:', '  gatewayClassName: edge', '  listeners:', '  - name: http', '    protocol: HTTP', '    port: 80',
  '    hostname: "*.example.test"', '    allowedRoutes:', '      namespaces:', '        from: All');
const route = (name: string, backends: [string, number][], parent = ['  - name: shop-gw', '    namespace: infra'], host = API_HOST) => yaml('apiVersion: gateway.networking.k8s.io/v1', 'kind: HTTPRoute',
  'metadata:', `  name: ${name}`, 'spec:', '  parentRefs:', ...parent, '  hostnames:', `  - ${host}`, '  rules:', '  - backendRefs:',
  ...backends.flatMap(([svc, weight]) => [`    - name: ${svc}`, '      port: 80', `      weight: ${weight}`]));
const CANARY_ROUTE = route('catalog-canary', [['catalog', 3], ['catalog-v2', 1]]);
const SPLIT = (backends: [string, number][] = [['catalog', 90], ['catalog-v2', 10]], parent?: string[], host?: string) => route('catalog-split', backends, parent, host);

const at = (text: string, time: string, f: string) => ({ text, at: `2026-11-24 ${time}`, file: f });
const BOOT = [at(FRONTEND, '09:40:00', 'frontend.yaml'), at(CATALOG, '09:45:00', 'catalog.yaml')];
const kubeOf = (manifests: TerminalKube['manifests']): TerminalKube => ({
  images: ['shop/frontend:1.6', 'shop/catalog:2.1', 'shop/catalog:2.2', 'shop/ops-ui:1.0'].map(name => ({ name, nodes: WORKERS })),
  manifests, lbPool: ['10.0.0.200-10.0.0.209'], ingressController: { service: 'LoadBalancer' }, gatewayApi: {},
});

// The company's internal CA (trusted on the workstation) signed shop.example.test's certificate.
const CA_ID = 'kub07-shop-ca', LEAF_ID = 'kub07-shop';
const CERTS: TerminalCertificate[] = [
  { id: CA_ID, cn: 'Shop Internal CA', org: 'Shop Example', ca: true, notBefore: '2026-01-01 00:00:00', path: '/home/yuki/shop/tls/ca.crt' },
  { id: LEAF_ID, cn: HOST, sans: [HOST], issuer: CA_ID, notBefore: '2026-11-20 00:00:00', path: '/home/yuki/shop/tls/shop.crt' },
];
// The private key is the learner's own file (a certificate's generated key file belongs to root): the key the engine made the certificate for.
const SHOP_KEY = keyPem({ type: 'rsa2048', seed: `lesson/${LEAF_ID}` });
// /etc/hosts stands in for the company's DNS records.
const HOSTS = `127.0.0.1 localhost\n127.0.1.1 ops-ws\n${LB} ${HOST} ${OPS_HOST}\n${GW_IP} ${API_HOST}\n`;

const workstation = (id: string, title: string, files: TerminalFile[], manifests: TerminalKube['manifests']): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'ingress', now: '2026-11-24 10:00:00',
  files: [dir('/etc', 'root'), file('/etc/hosts', HOSTS, 'root'), dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), dir('/home/yuki/shop/tls'),
    file('/home/yuki/shop/tls/shop.key', SHOP_KEY, 'yuki', 0o600), ...files],
  certificates: CERTS, trust: [CA_ID],
  responders: RESPONDERS,
  docker: { images: IMAGES },
  kube: kubeOf(manifests),
});

const WS = workstation('kub07-ws', 'ops-ws（shop 團隊的工作站：frontend 與 catalog 已經有 Service，叢集裝了 ingress-nginx）', [
  file('/home/yuki/shop/shop-ing.yaml', SHOP_ING), file('/home/yuki/shop/shop-tls-ing.yaml', SHOP_TLS_ING), file('/home/yuki/shop/catalog-v2.yaml', CATALOG_V2),
  file('/home/yuki/shop/gateway.yaml', GATEWAY), file('/home/yuki/shop/canary-route.yaml', CANARY_ROUTE),
], BOOT);
// Exercise 1: no Ingress yet.
const ROUTE = workstation('kub07-route', 'ops-ws（frontend 與 catalog 只有 ClusterIP，還沒有入口）', [], BOOT);
// Exercise 2: the Ingress shop serves plain HTTP; the certificate files are in ~/shop/tls.
const TLS = workstation('kub07-tls', 'ops-ws（shop.example.test 只有 HTTP，憑證已經發下來了）', [file('/home/yuki/shop/shop-ing.yaml', SHOP_ING)],
  [...BOOT, at(SHOP_ING, '09:50:00', 'shop-ing.yaml')]);
// Exercise 3: a teammate's Ingress for the ops dashboard is not served (no class) and points at the container port.
const OPS = workstation('kub07-ops', 'ops-ws（ops.example.test 打不開）', [file('/home/yuki/shop/ops-ing.yaml', OPS_BROKEN)],
  [...BOOT, at(OPS_UI, '09:30:00', 'ops-ui.yaml'), at(OPS_BROKEN, '09:50:00', 'ops-ing.yaml')]);
// Exercise 4: the platform team's Gateway shop-gw (namespace infra) and catalog 2.2 are running.
const CANARY = workstation('kub07-canary', 'ops-ws（平台組的 Gateway shop-gw 已經就緒，catalog 2.2 也部署好了）', [],
  [at(GATEWAY, '09:00:00', 'gateway.yaml'), ...BOOT, at(CATALOG_V2, '09:50:00', 'catalog-v2.yaml')]);

// ---- network scene -----------------------------------------------------------------------------------------------
const CLIENT_IP = '10.0.0.20', DNS_IP = '10.0.0.2', NODE1_IP = '10.0.0.51', CTRL_IP = '10.244.1.2', POD_IP = '10.244.1.4';
const CPORT = '51820', UPORT = '39214';
const POD = 'catalog-bblt4rfsn5-rt257';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
const dns = (fields: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: fields.map(([name, value]) => ({ name, value })) });
const hello = (): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [{ name: '紀錄類型', value: '22（handshake）' }, { name: '握手訊息', value: 'ClientHello' }, { name: 'SNI', value: HOST }] });
const sealed = (inside: string): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [
  { name: '紀錄類型', value: '23（application_data，加密）' }, { name: '加密的內容', value: inside }] });

const RULES = '路由規則', RULE_HEAD = ['規則（Host 與路徑）', 'pathType', '後端 Service', '就緒的端點'];
const RULE_ROWS = [
  [`${HOST} /api`, 'Prefix', 'catalog:80', '10.244.1.4:8080、10.244.2.3:8080'],
  [`${HOST} /`, 'Prefix', 'frontend:80', '10.244.1.3:3000、10.244.2.2:3000'],
  ['其他 Host 或沒有相符的路徑', '—', '預設後端', '（controller 自己回 404）'],
];
const rules = (changed?: number[]): NodeTable => ({ node: 'ingress', name: RULES, head: RULE_HEAD, rows: RULE_ROWS, ...changed ? { changed } : {} });
const CERT_TABLE = 'TLS 憑證（依 SNI 選擇）', CERT_HEAD = ['ClientHello 的 SNI', '出示的憑證', '來自'];
const CERT_ROWS = [
  [HOST, `CN=${HOST}`, 'Secret default/shop-tls（tls.crt、tls.key）'],
  ['沒有 SNI（用 IP 位址連線）', 'Fake Certificate', 'controller 內建的自簽憑證'],
  ['其他名稱', 'Fake Certificate', 'controller 內建的自簽憑證'],
];
const FORWARDED: [string, string][] = [['Host', HOST], ['X-Forwarded-Host', HOST], ['X-Forwarded-Port', '443'], ['X-Forwarded-Proto', 'https'], ['X-Forwarded-For', '（ingress-nginx 看到的用戶端位址，見說明）']];

const requestPath: NetworkScene = {
  id: 'kub07-request-path', title: '一個 HTTPS 請求進入叢集：DNS、LoadBalancer 位址、ingress-nginx 與 catalog 的 Pod', model: 'tcp-ip',
  description: `learner 在工作站 ops-ws（${CLIENT_IP}）執行 \`curl https://${HOST}/api/items\`。叢集裡套用了加上 TLS 的 Ingress shop（${HOST}：/ 給 frontend、/api 給 catalog，憑證來自 Secret shop-tls）；ingress-nginx 的 Service 是 LoadBalancer，從位址池拿到 ${LB}，controller 的 Pod 在 node-01（${CTRL_IP}）；catalog 有兩個就緒的 Pod（${POD_IP} 在 node-01、10.244.2.3 在 node-02）。工作站用公司的 DNS 伺服器（${DNS_IP}；終端機裡由 /etc/hosts 扮演）。TCP 交握合併在第一則訊息裡；工作站的位址、DNS 伺服器與臨時埠是虛構的。`,
  nodes: [
    { id: 'client', label: 'ops-ws（curl）', kind: 'host', addresses: [`IP ${CLIENT_IP}`] },
    { id: 'dns', label: '公司的 DNS 伺服器', kind: 'resolver', addresses: [`IP ${DNS_IP}`, 'UDP 53'] },
    { id: 'lb', label: `LoadBalancer 位址 ${LB}（由 node-01 回應，kube-proxy 轉送）`, kind: 'router', addresses: [`VIP ${LB}`, `node-01 ${NODE1_IP}`] },
    { id: 'ingress', label: 'ingress-nginx controller 的 Pod', kind: 'server', addresses: [`Pod IP ${CTRL_IP}（node-01）`, 'TCP 80、443'] },
    { id: 'pod', label: `catalog 的 Pod（${POD}）`, kind: 'server', addresses: [`Pod IP ${POD_IP}（node-01）`, 'TCP 8080'] },
  ],
  messages: [
    { id: 'dns-query', from: 'client', to: 'dns', label: `DNS 查詢 A ${HOST}`,
      headers: [dns([['查詢名稱', HOST], ['類型', 'A']]), udp('50114', '53'), ipv4(CLIENT_IP, DNS_IP)],
      note: 'curl 先要把名稱換成位址。叢集外的用戶端不認識叢集內的 DNS（cluster.local 的名稱只在 Pod 裡查得到），所以對外的名稱要登記在一般的 DNS 上。' },
    { id: 'dns-answer', from: 'dns', to: 'client', label: `A ${LB}`,
      headers: [dns([['回答', `${HOST} A ${LB}`], ['TTL', '300']]), udp('53', '50114'), ipv4(DNS_IP, CLIENT_IP)],
      note: `${LB} 不是任何一個 Pod 的位址，而是 ingress-nginx-controller 這個 LoadBalancer Service 的 EXTERNAL-IP。shop、ops 等每一個對外的名稱都指向同一個位址：要分辨請求給誰，是之後 controller 看 SNI、Host 與路徑的工作，這正是「一個入口、多個 Service」。` },
    { id: 'hello', from: 'client', to: 'lb', label: 'TCP 交握與 ClientHello（SNI）',
      headers: [hello(), tcp(CPORT, '443', 'SYN → SYN, ACK → ACK，之後是 ClientHello'), ipv4(CLIENT_IP, LB)],
      note: `這個位址池是 MetalLB 式的 L2 模式：node-01 替 ${LB} 回答 ARP，所以封包送到 node-01。雲端的託管叢集則是雲端的負載平衡器把流量送進節點，概念相同。ClientHello 裡以明文帶著 SNI（Server Name Indication）：用戶端想連的名稱 ${HOST}，伺服器在送出憑證之前就靠它決定要用哪一張。`,
      tables: [{ node: 'lb', name: 'kube-proxy 的轉送規則', head: ['目的位址', '轉送到（ingress-nginx-controller 的端點）'], rows: [[`${LB}:80`, `${CTRL_IP}:80`], [`${LB}:443`, `${CTRL_IP}:443`]], changed: [1] }] },
    { id: 'dnat', from: 'lb', to: 'ingress', label: '同一個 ClientHello，改寫目的位址（DNAT）',
      headers: [hello(), tcp(CPORT, '443', 'ACK（交握後的資料）'), ipv4('節點位址（SNAT，見說明）', CTRL_IP)],
      note: `node-01 的 kube-proxy 規則把目的 ${LB}:443 改成 controller Pod 的 ${CTRL_IP}:443。Service 的 externalTrafficPolicy 預設是 Cluster：封包可能被轉到別台節點上的端點，所以 kube-proxy 通常也把來源改成節點的位址（SNAT），回程才會經過同一台節點；代價是 controller 看不到用戶端真正的位址。改成 Local 只送到本機的端點、保留來源位址，但沒有端點的節點就不能接流量。這一步在網路層完成，TLS 的內容原封不動。` },
    { id: 'cert', from: 'ingress', to: 'client', label: 'ServerHello、憑證（來自 Secret shop-tls）',
      headers: [{ layer: 'application', protocol: 'TLS 1.3', fields: [{ name: '紀錄類型', value: '22（handshake）' }, { name: '握手訊息', value: 'ServerHello、Certificate、CertificateVerify、Finished' },
        { name: '憑證主體', value: `CN=${HOST}` }, { name: '簽發者', value: 'O=Shop Example, CN=Shop Internal CA' }] },
        tcp('443', CPORT, 'PSH, ACK'), ipv4(LB, CLIENT_IP)],
      note: `ingress-nginx 依 SNI 查它的憑證表：Ingress shop 的 tls 列出 ${HOST}，對應同一個命名空間的 Secret shop-tls（類型 kubernetes.io/tls），所以出示那張憑證並用 tls.key 完成交握。curl 用工作站信任的公司 CA 驗證簽發者與名稱，驗證通過。回程經過 node-01 時 conntrack 把來源還原成 ${LB}，所以 curl 一直以為自己在和 ${LB} 說話。若用 IP 直接連（沒有 SNI）或用別的名稱，controller 只能拿出內建的 Fake Certificate。`,
      tables: [{ node: 'ingress', name: CERT_TABLE, head: CERT_HEAD, rows: CERT_ROWS, changed: [0] }] },
    { id: 'request', from: 'client', to: 'ingress', label: 'GET /api/items（加密）',
      headers: [sealed('HTTP 請求'), tcp(CPORT, '443', 'PSH, ACK'), ipv4(CLIENT_IP, LB)],
      payload: `（ingress-nginx 解密後）\nGET /api/items HTTP/1.1\nHost: ${HOST}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `同一條連線之後的封包都照第一個封包的決定經過 node-01 轉送，這裡直接畫到 controller。TLS 在 ingress-nginx 結束（TLS 終止），它解密後才看得到 HTTP：Host 是 ${HOST}，選出這個 host 的伺服器；路徑 /api/items 同時符合 / 與 /api 兩條 Prefix 規則，最長的 /api 勝出，後端是 Service catalog 的 80 埠（名稱 web，targetPort http）。`,
      tables: [rules([0])] },
    { id: 'forward', from: 'ingress', to: 'pod', label: 'GET /api/items HTTP/1.1（Pod 網路上的明文）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '方法', value: 'GET' }, { name: '路徑', value: '/api/items' }, ...FORWARDED.map(([name, value]) => ({ name, value }))] },
        tcp(UPORT, '8080', 'SYN → SYN, ACK → ACK，再送出請求'), ipv4(CTRL_IP, POD_IP)],
      payload: `GET /api/items HTTP/1.1\n${FORWARDED.slice(0, 4).map(([name, value]) => `${name}: ${value}`).join('\n')}\nUser-Agent: curl/8.5.0\nAccept: */*`,
      note: `ingress-nginx 預設不經過 catalog 的 ClusterIP（10.105.249.101）：它自己 watch 這個 Service 的 EndpointSlice，從就緒的端點中輪流挑一個（這次是 ${POD_IP}:8080），直接連到 Pod。Service 的 80 埠只用來找到 targetPort http，也就是容器的 8080。路徑原封不動是 /api/items（沒有 rewrite），所以 catalog 必須自己處理 /api 開頭的路徑。這一段是 Pod 網路上的明文 HTTP；原本的 scheme、host 與埠放在 X-Forwarded-* 標頭裡（SRV07 的轉送標頭），X-Forwarded-For 則是 controller 看到的來源，前一步若做了 SNAT，那就是節點的位址而不是 ops-ws。`,
      tables: [rules()] },
    { id: 'app-response', from: 'pod', to: 'ingress', label: '200 OK（catalog 的回應）',
      headers: [{ layer: 'application', protocol: 'HTTP/1.1', fields: [{ name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' }, { name: 'Content-Type', value: 'text/plain' }] },
        tcp('8080', UPORT, 'PSH, ACK'), ipv4(POD_IP, CTRL_IP)],
      payload: `catalog 2.1 served by ${POD}`,
      note: '回應的內容寫著是哪一個 Pod 回答的，終端機的範例就是用它觀察輪替。下一個請求 ingress-nginx 會挑 10.244.2.3（node-02 上的另一個副本）。' },
    { id: 'response', from: 'ingress', to: 'client', label: '200 OK（加密，帶 HSTS）',
      headers: [sealed('HTTP 回應'), tcp('443', CPORT, 'PSH, ACK'), ipv4(LB, CLIENT_IP)],
      payload: `（加密前）\nHTTP/1.1 200 OK\nServer: nginx\nContent-Type: text/plain\nStrict-Transport-Security: max-age=31536000; includeSubDomains\n\ncatalog 2.1 served by ${POD}`,
      note: 'ingress-nginx 換上自己的 Server 標頭，加上 HSTS（Strict-Transport-Security：之後一年內瀏覽器都直接用 HTTPS 連這個名稱，SRV04），再加密送回。從 curl 的角度，它只和 10.0.0.200 的一台 HTTPS 伺服器說過話。' },
  ],
};

const CONDITIONS = "-o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} {.reason}{\"\\n\"}{end}'";
const TLS_INGRESS = `kubectl create ingress shop --class=nginx --rule='${HOST}/*=frontend:80,tls=shop-tls' --rule='${HOST}/api*=catalog:80,tls=shop-tls' --dry-run=client -o yaml | kubectl apply -f -`;

export const KUB07: LessonContent = {
  lessonId: 'KUB07',
  motivation: 'KUB05 讓 shop 團隊的 frontend 與 catalog 有了穩定的 Service，但它們都是 ClusterIP：只有叢集裡面連得到。要讓顧客從外面打開 https://shop.example.test，最直接的做法是把每個 Service 改成 LoadBalancer，可是這樣每個服務各要一個對外位址、一個負載平衡器、一張憑證，網址裡的路徑也沒辦法分給不同的服務。這一課學 Kubernetes 的入口：Ingress 讓一個位址依網域與路徑把請求分給多個 Service，並在入口統一處理 TLS；它只是一份規則，要有 Ingress Controller 才會生效。最後看下一代的 Gateway API：同樣的事情，把平台團隊與應用團隊的責任分開，還能依權重把一成流量導給金絲雀版本。',
  sections: [
    {
      id: 'kub07-s-why', title: '為什麼需要 Ingress：一個入口對多個 Service',
      blocks: [
        { type: 'p', text: 'KUB05 介紹了讓叢集外連進來的兩種 Service：NodePort 在每台節點開一個 30000–32767 的埠，LoadBalancer 再請基礎設施（雲端的負載平衡器，或 MetalLB 這類位址池）給一個對外位址。它們都工作在 TCP 層：只看位址與埠，不懂 HTTP，也不知道請求要的是哪個網域、哪個路徑。服務一多，問題就出現了。' },
        { type: 'table', head: ['做法', '對外位址', '依網域、路徑分流', 'TLS 憑證', '缺點'], rows: [
          ['每個服務一個 NodePort', '節點位址加上不好記的高位埠', '不行', '每個服務自己處理', '埠號暴露在網址裡，節點換了位址就要改設定'],
          ['每個服務一個 LoadBalancer', '每個服務一個位址', '不行（一個位址對一個 Service）', '每個服務自己處理', '雲端上每個負載平衡器都要付費、各要一個公開位址與 DNS 紀錄'],
          ['一個 Ingress Controller（它本身是一個 LoadBalancer Service）', '全部共用一個位址', '可以：Host 與路徑規則', '集中在入口終止', '入口是共用元件，要有人負責它的設定與容量'],
        ] },
        { type: 'p', text: '模擬叢集已經裝好了社群的 ingress-nginx controller：它是 ingress-nginx 命名空間裡的一個 Deployment（Pod 裡跑著 nginx 與一個 watch API server 的程式），前面是一個 LoadBalancer Service，從位址池拿到第一個位址 10.0.0.200。公司的 DNS 把 shop.example.test 指向這個位址（工作站上由 /etc/hosts 扮演）。還沒有任何 Ingress 規則時，請求會落到 controller 的預設後端，得到 nginx 的 404 頁面：入口已經在了，只是還不知道要把請求送給誰。' },
        { type: 'example', id: 'kub07-controller' },
        { type: 'p', text: '注意 Service 的 PORT(S) 是 `80:32016/TCP,443:30160/TCP`：LoadBalancer 建立在 NodePort 之上，所以每台節點也開著這兩個埠。IngressClass nginx 的 CONTROLLER 欄是 `k8s.io/ingress-nginx`，下一節會看到它把「規則」和「執行規則的程式」連起來。' },
        { type: 'callout', tone: 'note', title: 'ingress-nginx 的現況', text: '這一課用社群的 ingress-nginx 示範，因為它的行為（Fake Certificate、308 轉址、預設後端的 404 頁）是最多人見過的。Kubernetes 社群已經宣布這個專案將停止維護，正在使用它的叢集應該規劃遷移：換成其他 Ingress Controller，或改用本課最後介紹的 Gateway API。Ingress 這個 API 本身仍然是 Kubernetes 的穩定 API，概念與本課的規則寫法不受影響。' },
      ],
    },
    {
      id: 'kub07-s-controller', title: 'Ingress 與 Ingress Controller：規則與執行者',
      blocks: [
        { type: 'p', text: 'Ingress（networking.k8s.io/v1）只是一份宣告：「Host 是這個、路徑是這個的 HTTP 請求，送給這個 Service 的這個埠」。API server 驗證格式之後把它存進 etcd，就沒有下文了：Kubernetes 本身不附帶任何處理 Ingress 的程式。真正收流量、照規則轉送的是 Ingress Controller，它和 KUB02 的控制器一樣 watch API server，看到 Ingress、Service 與 EndpointSlice 的變化就重新產生自己的設定（ingress-nginx 是重新產生 nginx 的設定），然後把它對外的位址寫回 Ingress 的 `status.loadBalancer`，也就是 `kubectl get ing` 的 ADDRESS 欄。' },
        { type: 'p', text: '一個叢集可以同時有好幾個 controller（例如對外與對內各一個），所以 Ingress 要說明「歸誰管」。IngressClass 物件把一個名稱對應到一個 controller（nginx → `k8s.io/ingress-nginx`），Ingress 用 `spec.ingressClassName: nginx` 指定。沒有寫的 Ingress，只在建立時由 DefaultIngressClass admission 補上被標成預設的 class（註解 `ingressclass.kubernetes.io/is-default-class: "true"`）；這個叢集的 nginx 不是預設，所以沒寫的 Ingress 沒有人服務。' },
        { type: 'example', id: 'kub07-class' },
        { type: 'p', text: '`kubectl create ingress` 可以從命令列產生 Ingress：`--rule=host/path=service:port` 可以重複，路徑結尾是 `*` 時 pathType 是 Prefix，否則是 Exact；`--class` 寫入 ingressClassName；加上 `,tls=Secret名稱` 會產生 tls 區段。搭配 `--dry-run=client -o yaml` 只印出 YAML，可以存成檔案放進版本控制，或用管線交給 `kubectl apply -f -`。' },
        { type: 'table', head: ['症狀', '先檢查', '常見原因'], rows: [
          ['ADDRESS 一直是空的', '`kubectl get ing` 的 CLASS 欄、`kubectl get ingressclass`', '沒寫 ingressClassName 而且沒有預設 class；class 名稱打錯；叢集根本沒有 controller'],
          ['nginx 的 404 Not Found', 'Host 標頭與路徑、`kubectl describe ing` 的 Rules', '請求的 Host 沒有規則、路徑沒有符合（例如 Exact 只比對 /api 本身），落到預設後端'],
          ['503 Service Temporarily Unavailable', '`kubectl describe ing` 每個後端括號裡的端點', 'Service 沒有就緒的端點；backend 的 port 寫成容器埠而不是 Service 的埠；Service 名稱打錯'],
          ['curl: (60) self-signed certificate', '`kubectl get secret`、Ingress 的 tls', 'Secret 不存在或類型不對、名稱不在 tls.hosts、用 IP 連線而沒有 SNI：都會拿到 Fake Certificate'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：套用了 Ingress，入口就有了', text: '`kubectl create ingress` 或 `kubectl apply` 印出 `ingress.networking.k8s.io/promo created`，只代表 API server 接受並存下這份規則。範例裡 promo 沒有 class，ADDRESS 是空的、describe 沒有任何事件，請求照樣得到 404：沒有 controller 認領它，它就只是 etcd 裡的一筆資料。同理，在一個沒有安裝任何 Ingress Controller 的叢集裡，Ingress 可以建立，卻永遠不會生效。看到 ADDRESS 有位址、事件出現 Sync，才表示 controller 已經接手。' },
      ],
    },
    {
      id: 'kub07-s-routing', title: '主機與路徑路由：pathType 與最長比對',
      blocks: [
        { type: 'p', text: '每條 rule 有一個 `host`（可省略，表示任何 Host）與一組 `paths`。controller 先依請求的 Host 標頭選出那個 host 的規則（完全相同優先，其次是 `*.example.test` 這種萬用字元，它只比對一層標籤），再在其中依路徑選後端。每個 path 都必須寫 `pathType`：' },
        { type: 'table', head: ['pathType', '比對方式', '`/api` 會比對到'], rows: [
          ['Exact', '整個路徑完全相同（大小寫有別）', '只有 `/api`；`/api/` 與 `/api/items` 都不算'],
          ['Prefix', '依「/」分開的路徑元素逐段比對前綴', '`/api`、`/api/`、`/api/items`；但不包括 `/apix`、`/api-docs`'],
          ['ImplementationSpecific', '交給 IngressClass 的 controller 自己解釋', 'ingress-nginx 的行為和 Prefix 類似；為了可攜性，建議明確寫 Exact 或 Prefix'],
        ] },
        { type: 'p', text: '一個請求同時符合好幾條規則時，最長的路徑勝出；長度相同時 Exact 優先於 Prefix。所以 shop 的兩條規則可以這樣寫：`/` 給 frontend 當「其他全部」，`/api` 給 catalog，`/api/items` 兩條都符合，較長的 `/api` 勝出。都不符合（或 Host 沒有任何規則）時，請求交給預設後端：Ingress 可以用 `spec.defaultBackend` 指定，沒有指定就是 controller 自己的 404。' },
        { type: 'example', id: 'kub07-routing' },
        { type: 'p', text: '`/apix` 交給了 frontend：Prefix 比的是路徑元素，`apix` 不是 `api`。連續兩次 `/api/items` 由 catalog 的兩個 Pod 輪流回答：ingress-nginx 直接從 Service 的 EndpointSlice 取得就緒的端點並自己做負載平衡（模擬環境依 IP 順序輪流）。`kubectl describe ing` 把規則、每個後端與它目前的端點列在一起，是除錯時最先看的地方。' },
        { type: 'callout', tone: 'tip', title: '後端收到完整的路徑', text: 'Ingress 預設不改寫路徑：catalog 收到的是 `/api/items`，不是 `/items`。要嘛讓應用程式自己處理 `/api` 前綴，要嘛使用 controller 的改寫功能（ingress-nginx 是註解，各家寫法不同、不可攜）。這和 SRV07 的 `proxy_pass` 有沒有 URI 部分是同一個問題，只是 Ingress 標準 API 裡沒有改寫這個欄位。' },
      ],
    },
    {
      id: 'kub07-s-tls', title: '在入口終止 TLS：Secret、SNI、Fake Certificate 與 308',
      blocks: [
        { type: 'p', text: '有了共用的入口，HTTPS 也可以在這裡統一處理：Ingress 的 `spec.tls` 列出 hosts 與一個 Secret 名稱，Secret 的類型是 `kubernetes.io/tls`、有 `tls.crt` 與 `tls.key` 兩個鍵（KUB06）。controller 讀取同一個命名空間的這個 Secret，在 443 埠依 ClientHello 的 SNI 選出憑證完成交握，解密之後再照 Host 與路徑轉給後端。這就是 TLS 終止：憑證與私鑰只放在入口，後端 Pod 收到的是 Pod 網路上的明文 HTTP，原本的 scheme 由 `X-Forwarded-Proto: https` 告訴它。' },
        { type: 'p', text: '憑證從哪裡來？SRV04 用 certbot 向 Let\'s Encrypt 以 ACME 申請。在 Kubernetes 裡最常見的是 cert-manager：它是另一個控制器，依你宣告的簽發者（ACME 的公開 CA，或公司內部的 CA）自動申請憑證、寫進 tls Secret，並在到期前更新，controller 看到 Secret 變了就換上新憑證。這一課的憑證則是平台組用公司內部 CA 簽好交給你的檔案，`kubectl create secret tls` 會先檢查私鑰和憑證是否相符。' },
        { type: 'example', id: 'kub07-tls' },
        { type: 'table', head: ['情況', 'ingress-nginx 的行為'], rows: [
          ['HTTPS，SNI 是 tls.hosts 裡的名稱，Secret 正確', '出示 Secret 的憑證，回應加上 HSTS（Strict-Transport-Security）'],
          ['HTTPS，用 IP 連線（沒有 SNI）、名稱不在 tls.hosts、或 Secret 不存在、類型不對', '出示內建的「Kubernetes Ingress Controller Fake Certificate」，curl 回報 `(60) SSL certificate problem: self-signed certificate`'],
          ['HTTP，host 有出現在某個 Ingress 的 tls', '`308 Permanent Redirect`，Location 是同一個路徑的 https 網址（ssl-redirect 預設開啟）'],
          ['HTTP 送到 443 埠', '`400 Bad Request`：The plain HTTP request was sent to HTTPS port'],
        ] },
        { type: 'p', text: '308 和常見的 301 都是永久轉址，差別在 308 規定用戶端重送時不得改變方法與內容：POST 轉過去還是 POST。`curl -L` 會跟著轉址。測試還沒登記 DNS 的名稱時，可以用 `curl --resolve shop.example.test:443:10.0.0.200 https://shop.example.test/`：它讓 curl 把名稱解析成指定位址，SNI 與 Host 仍然是那個名稱；只測 HTTP 時也可以 `curl -H \'Host: shop.example.test\' http://10.0.0.200/`。注意 Fake Certificate 的錯誤說明要拿掉 `-s` 才看得到。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：curl 回報 self-signed，加上 -k 就解決了', text: '`-k`（`--insecure`）只是讓 curl 不驗證憑證，ingress-nginx 出示的仍然是 Fake Certificate，瀏覽器與其他用戶端照樣會拒絕。看到 Fake Certificate，要回頭檢查：Ingress 的 `tls.hosts` 有沒有這個名稱、`secretName` 拼對了沒、Secret 是否在同一個命名空間而且類型是 `kubernetes.io/tls`，以及測試時有沒有用名稱連線（用 IP 位址連線就沒有 SNI，永遠只會拿到 Fake Certificate）。' },
      ],
    },
    {
      id: 'kub07-s-path', title: '追蹤一個 HTTPS 請求：從 DNS 到 Pod',
      blocks: [
        { type: 'p', text: '把前面的元件串起來。下面的情境是 TLS 範例裡的 `curl https://shop.example.test/api/items`：右邊的表是 node-01 上 kube-proxy 的轉送規則，以及 controller 的憑證表與路由表。逐步看每一則訊息由誰送給誰、哪一段是加密的、位址在哪裡被改寫。' },
        { type: 'example', id: 'kub07-request-path' },
        { type: 'list', ordered: true, items: [
          'DNS：shop.example.test 解析成 10.0.0.200，也就是 ingress-nginx-controller 這個 LoadBalancer Service 的位址；每個對外名稱都指向它。',
          'LoadBalancer 位址：node-01 回應這個位址，kube-proxy 把目的改寫成 controller Pod 的 10.244.1.2:443（通常也改寫來源）。',
          'TLS：controller 依 SNI 選出 Secret shop-tls 的憑證完成交握，TLS 在這裡結束。',
          '路由：解密後依 Host 與最長的路徑選出 Service catalog 的 80 埠。',
          '轉送：controller 從 catalog 的 EndpointSlice 挑一個就緒的 Pod，以明文 HTTP 直接連到它的 8080 埠，帶上 X-Forwarded-* 標頭。',
          '回應：catalog 的回應經 controller 加上 HSTS、加密後送回，curl 只看到 10.0.0.200。',
        ] },
        { type: 'callout', tone: 'note', title: '為什麼 controller 不經過 ClusterIP', text: 'ingress-nginx 預設自己做負載平衡：它本來就 watch EndpointSlice，直接連 Pod 可以少一次 kube-proxy 的轉換，也能用自己的平衡演算法與 session 黏著。代價是它要自己追蹤端點的變化。ingress-nginx 也可以用 `nginx.ingress.kubernetes.io/service-upstream: "true"` 註解改成連 Service 的 ClusterIP，交給 kube-proxy 挑 Pod。不論哪一種，Ingress 後端寫的都是 Service 的埠（80），不是容器的埠。' },
      ],
    },
    {
      id: 'kub07-s-gateway', title: 'Gateway API：分開平台與應用的責任',
      blocks: [
        { type: 'p', text: 'Ingress 簡單好用，但它把所有東西放在一個物件裡：誰可以開哪個位址、哪個埠、用哪張憑證，和某個應用的某個路徑要去哪裡，都寫在同一份 YAML，由同一個人維護。進階功能（改寫、依標頭比對、加權分流、逾時）又只能靠每家 controller 不同的註解，換了 controller 就要重寫。Gateway API（gateway.networking.k8s.io，以 CRD 安裝）是 Kubernetes 社群設計的下一代入口 API，把這些拆成三種角色各自負責的物件：' },
        { type: 'table', head: ['物件', '範圍', '通常由誰維護', '內容'], rows: [
          ['GatewayClass', '整個叢集', '基礎設施提供者（雲端或平台的實作）', '`controllerName`：哪一個實作負責這一類 Gateway，類似 IngressClass'],
          ['Gateway', '命名空間（例如 infra）', '叢集維運／平台團隊', '對外的位址與 listener（協定、埠、hostname、憑證），以及允許哪些命名空間的 route 掛上來'],
          ['HTTPRoute', '應用的命名空間', '應用團隊', '`parentRefs` 掛到哪個 Gateway、`hostnames`、比對路徑與標頭的規則、`backendRefs` 與權重'],
        ] },
        { type: 'p', text: '平台組在 infra 命名空間建立 Gateway shop-gw，listener 只接受 `*.example.test`、允許所有命名空間掛 route（`allowedRoutes.namespaces.from: All`）；應用團隊在自己的命名空間寫 HTTPRoute，不需要也不應該有改 Gateway 的權限。每個物件的狀態用 conditions 回報：GatewayClass 的 Accepted、Gateway 的 Accepted 與 Programmed（拿到位址、可以收流量），HTTPRoute 對每個 parent 回報 Accepted（掛上了沒）與 ResolvedRefs（後端都找得到嗎）。' },
        { type: 'example', id: 'kub07-gateway' },
        { type: 'p', text: '同一條規則的 `backendRefs` 可以有權重：3 與 1 表示四個請求裡大約一個給 catalog-v2。這正是 CICD10 的金絲雀發布在叢集入口的做法：先給新版一小部分流量，觀察錯誤率與延遲，沒問題再逐步調高（90/10 → 50/50 → 0/100），有問題就把新版的權重改成 0，流量立刻回到舊版，不用重新部署。權重是比例，不是精確的配額：真實的實作多半依機率分配，短時間內的比例會有起伏（模擬環境用固定順序的加權輪替，所以範例的順序是固定的）。' },
        { type: 'table', head: ['', 'Ingress', 'Gateway API'], rows: [
          ['API', 'networking.k8s.io/v1，Kubernetes 內建，不再增加新功能', 'gateway.networking.k8s.io/v1，以 CRD 安裝，持續發展'],
          ['物件', '一個 Ingress（加上 IngressClass）', 'GatewayClass、Gateway、HTTPRoute（另有 GRPCRoute 等）'],
          ['角色分工', '入口設定與應用路由寫在同一個物件', '平台管 Gateway，應用團隊管自己的 route'],
          ['路由能力', 'Host、路徑（Exact／Prefix）；其他靠各家註解', '路徑、標頭、查詢參數、方法比對，改寫、轉址、加權分流都在標準欄位'],
          ['跨命名空間', '後端只能是同命名空間的 Service', 'route 可以掛到別的命名空間的 Gateway（由 listener 允許）；跨命名空間的後端要 ReferenceGrant'],
          ['狀態回報', '`status.loadBalancer` 的位址', '每個物件與每個 parent 的 conditions（Accepted、Programmed、ResolvedRefs）'],
        ] },
        { type: 'callout', tone: 'tip', title: '先看 conditions 再看流量', text: 'HTTPRoute 寫錯時多半不會被 API server 拒絕，而是在 status 留下原因：hostname 和 listener 沒有交集是 `NoMatchingListenerHostname`、parentRef 指到的 listener 不存在是 `NoMatchingParent`、後端的 Service 不存在是 ResolvedRefs `BackendNotFound`；parentRef 指到根本不存在的 Gateway 時，連一筆 parent 狀態都不會有。`kubectl get httproute 名稱 -o yaml` 或 jsonpath 讀 `.status.parents[*].conditions`，比反覆 curl 更快找到問題。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [requestPath],
    exercises: [
      { id: 'kub07-net-port', task: 'field', scene: 'kub07-request-path', message: 'forward', layer: 'transport', field: '目的連接埠', title: 'ingress-nginx 連到 Pod 的哪個埠',
        statement: '在「一個 HTTPS 請求進入叢集」情境中，ingress-nginx 把請求轉給 catalog 的 Pod 的那則訊息，TCP 標頭的「目的連接埠」是多少？',
        hints: ['TLS 在哪一個元件結束？之後這一段還是 HTTPS 嗎？', 'Ingress 的後端寫的是 Service 的 80 埠；ingress-nginx 預設連 ClusterIP，還是直接連端點？端點的埠是什麼？'],
        explanation: 'TLS 已經在 ingress-nginx 終止，這一段是 Pod 網路上的明文 HTTP。ingress-nginx 從 Service catalog 的 EndpointSlice 取得就緒的端點，直接連到 Pod；Service 的 80 埠（web）只用來找出 targetPort http，也就是容器的 8080，所以目的連接埠是 8080。',
        mistakes: [
          { answer: { value: '443' }, why: '443 是用戶端連到入口的埠；TLS 在 ingress-nginx 結束，它對 Pod 開的是新的明文連線，連到容器聽的埠。' },
          { answer: { value: '80' }, why: '80 是 Service catalog 的埠，Ingress 的後端寫的是它；但 ingress-nginx 預設不經過 ClusterIP，而是直接連端點的 targetPort（8080）。' },
          { answer: { value: '30160' }, why: '30160 是 ingress-nginx-controller 這個 LoadBalancer Service 的 443 對應的 NodePort，和 controller 連到 catalog 無關。' },
        ] },
      { id: 'kub07-net-backend', task: 'table', scene: 'kub07-request-path', message: 'request', node: 'ingress', table: RULES, row: `${HOST} /api`, column: '後端 Service',
        title: '/api/items 交給哪個 Service',
        statement: '同一個情境裡，請求 GET /api/items 同時符合路由規則表的兩條 Prefix 規則。ingress-nginx 最後選用的那條規則，「後端 Service」欄寫的是什麼？（寫成 名稱:埠）',
        hints: ['/api/items 的路徑元素是 api、items，哪幾條規則的前綴符合？', '好幾條都符合時，Ingress 選最長的路徑。'],
        explanation: '/ 與 /api 兩條 Prefix 規則都符合 /api/items，最長的路徑勝出，所以是 /api 那條：Service catalog 的 80 埠（catalog:80）。若請求是 /apix，/api 依路徑元素不符合，就只剩 / 那條，交給 frontend。',
        mistakes: [
          { answer: { cell: 'frontend:80' }, why: '/ 也符合 /api/items，但它比 /api 短；Ingress 在多條符合時選最長的路徑，所以不是 frontend。' },
          { answer: { cell: 'catalog:8080' }, why: '8080 是 catalog 容器的埠（targetPort）；Ingress 規則的後端寫的是 Service 的埠 80。' },
        ] },
      { id: 'kub07-net-fake', task: 'table', scene: 'kub07-request-path', message: 'cert', node: 'ingress', table: CERT_TABLE, row: '沒有 SNI（用 IP 位址連線）', column: '出示的憑證',
        title: '用 IP 連線時拿到哪張憑證',
        statement: '同一個情境裡，如果 learner 改成執行 `curl https://10.0.0.200/api/items`（用 IP 位址連線），依 ingress-nginx 的憑證表，它會出示哪一張憑證？',
        hints: ['用 IP 位址連線時，ClientHello 裡有 SNI 嗎？', 'controller 只有在 SNI 是 tls.hosts 裡的名稱時才用 Secret 的憑證。'],
        explanation: 'curl 用 IP 位址連線時不送 SNI，controller 無從得知要用哪個 host 的憑證，只能出示內建的自簽 Fake Certificate（Kubernetes Ingress Controller Fake Certificate）；curl 因此回報 self-signed certificate（錯誤 60）。Secret shop-tls 的憑證只在 SNI 是 shop.example.test 時出示。',
        mistakes: [
          { answer: { cell: `CN=${HOST}` }, why: '這張憑證只在 SNI 是 shop.example.test 時出示；用 IP 位址連線沒有 SNI。' },
          { answer: { cell: 'Shop Internal CA' }, why: 'Shop Internal CA 是簽發 shop.example.test 憑證的 CA，伺服器不會出示 CA 憑證當作自己的憑證；而且這次根本沒有選到那張憑證。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'kub07-q1', prompt: 'shop 團隊有 8 個要對外的 HTTP 服務。和「每個服務各建一個 LoadBalancer Service」相比，改用一個 Ingress Controller 加上 Ingress 規則，主要的好處是什麼？',
      options: ['每個 Pod 都會自動拿到一個對外的公開位址', '8 個服務共用一個對外位址，依 Host 與路徑分流，TLS 集中在入口處理', 'Service 從此可以省略，Ingress 直接選擇 Pod 的標籤', '請求不再經過任何代理，延遲一定比 LoadBalancer 低'],
      answer: 1,
      explanation: 'Ingress 讓所有服務共用 controller 的一個 LoadBalancer 位址，依 Host 與路徑分給不同的 Service，憑證也在入口統一處理。Pod 不會因此有公開位址；Ingress 的後端仍然是 Service，controller 靠它的端點找 Pod；controller 本身就是一層代理，並不保證延遲較低。',
    },
    {
      id: 'kub07-q2', prompt: '你套用了一個 Ingress，`kubectl get ing` 的 ADDRESS 一直是空的，`curl` 得到 nginx 的 404。叢集裡有 IngressClass nginx（不是預設 class）。最可能的原因是什麼？',
      options: ['Service 的 targetPort 寫錯，所以 Service 沒有任何端點', 'TLS 用的 Secret 類型不是 kubernetes.io/tls', 'DNS 沒有把 shop 的名稱指向 10.0.0.200', 'Ingress 沒寫 `ingressClassName: nginx`，沒人認領'],
      answer: 3,
      explanation: 'ADDRESS 由 controller 寫入；沒有 class（又沒有預設 class）的 Ingress 沒有 controller 服務，所以沒有位址，請求落到預設後端的 404。targetPort 錯會是 503 而 ADDRESS 照樣有值；Secret 的問題影響的是 HTTPS 的憑證；DNS 錯了根本連不到 nginx，也不會讓 ADDRESS 變空。',
    },
    {
      id: 'kub07-q3', prompt: '一條規則是 `path: /api`、`pathType: Prefix`。下列哪一個請求路徑不會符合這條規則？',
      options: ['`/apix`', '`/api`', '`/api/`', '`/api/items`'],
      answer: 0,
      explanation: 'Prefix 依「/」分開的路徑元素比對：/api、/api/、/api/items 的第一個元素都是 api，所以符合；/apix 的第一個元素是 apix，不是 api，因此不符合。若要只比對 /api 本身，才用 Exact。',
    },
    {
      id: 'kub07-q4', prompt: 'Ingress 有兩條規則：`/` Prefix → frontend，`/api` Prefix → catalog。請求 `GET /api/items` 會交給誰？',
      options: ['frontend，因為 `/` 寫在前面', '兩個都會收到，各一半', 'catalog，因為符合的規則中 `/api` 最長', '都不會，因為沒有 `/api/items` 的 Exact 規則，回 404'],
      answer: 2,
      explanation: '兩條 Prefix 都符合 /api/items，Ingress 選最長的路徑 /api，所以交給 catalog；順序不影響結果。Ingress 不會把同一個請求同時送給兩個後端；Prefix 規則本來就涵蓋子路徑，不需要另寫 Exact，所以也不會是 404。',
    },
    {
      id: 'kub07-q5', prompt: 'Ingress shop 已經設好 tls（Secret shop-tls），但執行 `curl https://10.0.0.200/` 得到 `curl: (60) SSL certificate problem: self-signed certificate`。原因是什麼？',
      options: ['Secret shop-tls 裡的私鑰和憑證不相符，controller 改用自簽憑證', '工作站的系統時鐘比憑證的生效時間還早，curl 不信任它', '用 IP 連線沒有 SNI，只能出示內建的 Fake Certificate', 'controller 不支援 TLS 1.3，所以退回自簽憑證'],
      answer: 2,
      explanation: 'controller 依 SNI 選憑證，用 IP 位址連線沒有 SNI，只能拿出自簽的 Fake Certificate；改用名稱（或 `--resolve`）連線就會拿到 Secret 的憑證。私鑰不相符時 `kubectl create secret tls` 根本建立不了；時間錯誤的訊息是 not yet valid 而不是 self-signed；這和 TLS 版本無關。',
    },
    {
      id: 'kub07-q6', prompt: 'shop.example.test 出現在 Ingress 的 tls.hosts。顧客用 `http://shop.example.test/cart` 連線，ingress-nginx 預設會怎麼回應？',
      options: ['`308`，轉到 `https://shop.example.test/cart`', '直接以 HTTP 回傳 frontend 的頁面，TLS 只影響 443 埠的連線', '`400 Bad Request`，因為 HTTP 送到了 HTTPS 的埠', '`404 Not Found`，因為 tls 只設定了 443 埠'],
      answer: 0,
      explanation: '有 TLS 的 host，ingress-nginx 預設開啟 ssl-redirect，HTTP 請求一律得到 308 並轉到同一個路徑的 https 網址，308 保證重送時不改方法。它不會以明文回傳內容；400 是把 HTTP 送到 443 埠時才會發生；80 埠仍然有這個 host 的伺服器，所以不是 404。',
    },
    {
      id: 'kub07-q7', prompt: '採用 Gateway API 時，「把 api.example.test 的流量依 90/10 分給 catalog 與 catalog-v2」通常寫在哪個物件、由誰維護？',
      options: ['GatewayClass，由基礎設施提供者維護', 'Gateway，由平台團隊維護', 'IngressClass，由叢集管理員維護', 'HTTPRoute，由應用團隊在自己的命名空間維護'],
      answer: 3,
      explanation: '路由規則與後端權重寫在 HTTPRoute，由應用團隊維護，再用 parentRefs 掛到平台的 Gateway。GatewayClass 只說明由哪個實作負責；Gateway 定義位址、listener 與憑證、允許哪些命名空間掛上來；IngressClass 屬於 Ingress API，不是 Gateway API 的物件。',
    },
    {
      id: 'kub07-q8', prompt: 'HTTPRoute 的 backendRefs 是 catalog（weight 90）與 catalog-v2（weight 10）。金絲雀版本出現錯誤，最快讓流量全部回到舊版的做法是什麼？',
      options: ['刪除 Gateway shop-gw，讓所有 route 失效', '把 catalog-v2 的 weight 改成 0 並套用，權重為 0 的後端不會被選到', '把 Gateway 的 listener 改成 443 埠', '把 catalog 的 replicas 改成 90、catalog-v2 改成 10'],
      answer: 1,
      explanation: 'weight 是後端之間的比例，0 表示不再選它，套用後流量立刻全部給 catalog，之後再調查新版。刪除 Gateway 會讓所有服務一起中斷；改 listener 的埠與分流無關；副本數改變的是容量，Gateway 依權重而不是依 Pod 數分配流量。',
    },
  ],
  terminal: {
    machines: [WS, ROUTE, TLS, OPS, CANARY],
    examples: [
      {
        id: 'kub07-controller', title: '入口已經在了：ingress-nginx、它的位址與預設後端', machine: 'kub07-ws',
        description: 'frontend 與 catalog 只有 ClusterIP。ingress-nginx 的 controller Pod 在 node-01，前面的 LoadBalancer Service 拿到 10.0.0.200；shop.example.test 已經指向這個位址，但還沒有 Ingress 規則，請求得到預設後端的 404。',
        steps: [
          { command: 'kubectl get svc', output: "NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE\ncatalog      ClusterIP   10.105.249.101   <none>        80/TCP    15m\nfrontend     ClusterIP   10.109.232.112   <none>        80/TCP    20m\nkubernetes   ClusterIP   10.96.0.1        <none>        443/TCP   30d" },
          { command: 'kubectl get pods -n ingress-nginx -o wide', output: "NAME                                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ningress-nginx-controller-pfbkkfnfbv-xvrp5   1/1       Running   0          30d       10.244.1.2   node-01   <none>           <none>" },
          { command: 'kubectl get svc -n ingress-nginx', output: "NAME                                 TYPE           CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE\ningress-nginx-controller             LoadBalancer   10.102.97.149   10.0.0.200    80:32016/TCP,443:30160/TCP   30d\ningress-nginx-controller-admission   ClusterIP      10.97.97.167    <none>        443/TCP                      30d" },
          { command: 'kubectl get ingressclass', output: "NAME      CONTROLLER             PARAMETERS   AGE\nnginx     k8s.io/ingress-nginx   <none>       30d" },
          { command: 'getent hosts shop.example.test', output: "10.0.0.200      shop.example.test ops.example.test" },
          { command: 'curl -s http://shop.example.test/', output: "<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>" },
        ],
      },
      {
        id: 'kub07-class', title: '沒有 class 的 Ingress 沒有人服務', machine: 'kub07-ws',
        description: '用 `kubectl create ingress` 建立 promo 而沒有 `--class`：CLASS 是 `<none>`、ADDRESS 空白、沒有事件，請求得到 404。刪掉重建並指定 `--class=nginx` 之後，controller 接手，寫入位址，請求送到 frontend。',
        steps: [
          { command: "kubectl create ingress promo --rule='promo.example.test/*=frontend:80'", output: "ingress.networking.k8s.io/promo created" },
          { command: 'kubectl get ing', output: "NAME      CLASS     HOSTS                ADDRESS   PORTS     AGE\npromo     <none>    promo.example.test             80        0s" },
          { command: "curl -s -H 'Host: promo.example.test' http://10.0.0.200/", output: "<html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx</center>\n</body>\n</html>" },
          { command: 'kubectl describe ing promo', output: "Name:             promo\nLabels:           <none>\nNamespace:        default\nAddress:          \nIngress Class:    <none>\nDefault backend:  <default>\nRules:\n  Host                Path  Backends\n  ----                ----  --------\n  promo.example.test  \n                      /   frontend:80 (10.244.1.3:3000,10.244.2.2:3000)\nAnnotations:          <none>\nEvents:               <none>" },
          { command: 'kubectl delete ing promo', output: "ingress.networking.k8s.io \"promo\" deleted" },
          { command: "kubectl create ingress promo --class=nginx --rule='promo.example.test/*=frontend:80'", output: "ingress.networking.k8s.io/promo created" },
          { command: 'kubectl get ing', output: "NAME      CLASS     HOSTS                ADDRESS      PORTS     AGE\npromo     nginx     promo.example.test   10.0.0.200   80        0s" },
          { command: "curl -s -H 'Host: promo.example.test' http://10.0.0.200/", output: "shop frontend 1.6 served by frontend-jgwzfx6sgv-v52sx" },
        ],
      },
      {
        id: 'kub07-routing', title: '一個網域、兩個 Service：/ 給 frontend，/api 給 catalog', machine: 'kub07-ws',
        description: 'Ingress shop 的兩條 Prefix 規則：`/api/items` 交給 catalog（最長比對），`/` 與 `/apix` 交給 frontend。兩次 `/api/items` 由 catalog 的兩個 Pod 輪流回答；`describe` 列出每個後端目前的端點。',
        steps: [
          { command: 'cat shop/shop-ing.yaml', output: "apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: shop\nspec:\n  ingressClassName: nginx\n  rules:\n  - host: shop.example.test\n    http:\n      paths:\n      - path: /\n        pathType: Prefix\n        backend:\n          service:\n            name: frontend\n            port:\n              number: 80\n      - path: /api\n        pathType: Prefix\n        backend:\n          service:\n            name: catalog\n            port:\n              number: 80" },
          { command: 'kubectl apply -f shop/shop-ing.yaml', output: "ingress.networking.k8s.io/shop created" },
          { command: 'kubectl get ing shop', output: "NAME      CLASS     HOSTS               ADDRESS      PORTS     AGE\nshop      nginx     shop.example.test   10.0.0.200   80        0s" },
          { command: 'curl -s http://shop.example.test/', output: "shop frontend 1.6 served by frontend-jgwzfx6sgv-v52sx" },
          { command: 'curl -s http://shop.example.test/api/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-rt257" },
          { command: 'curl -s http://shop.example.test/api/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-8gvmp" },
          { command: 'curl -s http://shop.example.test/apix', output: "shop frontend 1.6 served by frontend-jgwzfx6sgv-99mjg" },
          { command: 'kubectl describe ing shop', output: "Name:             shop\nLabels:           <none>\nNamespace:        default\nAddress:          10.0.0.200\nIngress Class:    nginx\nDefault backend:  <default>\nRules:\n  Host               Path  Backends\n  ----               ----  --------\n  shop.example.test  \n                     /      frontend:80 (10.244.1.3:3000,10.244.2.2:3000)\n                     /api   catalog:80 (10.244.1.4:8080,10.244.2.3:8080)\nAnnotations:         <none>\nEvents:\n  Type    Reason  Age   From                      Message\n  ----    ------  ----  ----                      -------\n  Normal  Sync    0s    nginx-ingress-controller  Scheduled for sync" },
        ],
      },
      {
        id: 'kub07-tls', title: 'TLS 終止：tls Secret、308 轉址與 Fake Certificate', machine: 'kub07-ws',
        description: '用平台組發下來的憑證與私鑰建立 tls Secret，套用有 tls 區段的 Ingress：PORTS 變成 `80, 443`，HTTPS 由公司 CA 簽的憑證驗證通過，HTTP 得到 308；用 IP 位址連線沒有 SNI，拿到的是 Fake Certificate。',
        steps: [
          { command: 'ls shop/tls', output: "ca.crt  shop.crt  shop.key" },
          { command: 'kubectl create secret tls shop-tls --cert=shop/tls/shop.crt --key=shop/tls/shop.key', output: "secret/shop-tls created" },
          { command: 'kubectl get secret shop-tls', output: "NAME       TYPE                DATA      AGE\nshop-tls   kubernetes.io/tls   2         0s" },
          { command: 'kubectl apply -f shop/shop-tls-ing.yaml', output: "ingress.networking.k8s.io/shop created" },
          { command: 'kubectl get ing shop', output: "NAME      CLASS     HOSTS               ADDRESS      PORTS     AGE\nshop      nginx     shop.example.test   10.0.0.200   80, 443   0s" },
          { command: 'curl -s https://shop.example.test/api/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-rt257" },
          { command: "curl -sv https://shop.example.test/ 2>&1 | grep -E 'subject:|issuer:'", output: "*  subject: CN=shop.example.test\n*  issuer: O=Shop Example; CN=Shop Internal CA" },
          { command: 'curl -sI http://shop.example.test/cart | head -1', output: "HTTP/1.1 308 Permanent Redirect" },
          { command: 'curl -sI http://shop.example.test/cart | grep Location', output: "Location: https://shop.example.test/cart" },
          { command: 'curl https://10.0.0.200/', output: "curl: (60) SSL certificate problem: self-signed certificate\nMore details here: https://curl.se/docs/sslcerts.html\n\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above." },
          { command: "curl -svk https://10.0.0.200/ 2>&1 | grep -E 'subject:|issuer:'", output: "*  subject: O=Acme Co; CN=Kubernetes Ingress Controller Fake Certificate\n*  issuer: O=Acme Co; CN=Kubernetes Ingress Controller Fake Certificate" },
          { command: 'curl -s --resolve shop.example.test:443:10.0.0.200 https://shop.example.test/', output: "shop frontend 1.6 served by frontend-jgwzfx6sgv-99mjg" },
        ],
      },
      {
        id: 'kub07-gateway', title: 'Gateway API：平台的 Gateway、應用的 HTTPRoute 與 3:1 加權', machine: 'kub07-ws',
        description: '平台組的 gateway.yaml 建立 GatewayClass edge、命名空間 infra 與 Gateway shop-gw（拿到位址池的下一個位址 10.0.0.201）。應用團隊部署 catalog 2.2，再以 HTTPRoute 把 api.example.test 的流量以 3:1 分給 catalog 與 catalog-v2：四個請求中第三個給新版；conditions 說明 route 已被接受、後端都找得到。',
        steps: [
          { command: 'kubectl apply -f shop/gateway.yaml', output: "gatewayclass.gateway.networking.k8s.io/edge created\nnamespace/infra created\ngateway.gateway.networking.k8s.io/shop-gw created" },
          { command: 'kubectl get gatewayclass', output: "NAME      CONTROLLER                       ACCEPTED   AGE\nedge      example.com/gateway-controller   True       0s" },
          { command: 'kubectl get gateway -n infra', output: "NAME      CLASS     ADDRESS      PROGRAMMED   AGE\nshop-gw   edge      10.0.0.201   True         0s" },
          { command: 'kubectl apply -f shop/catalog-v2.yaml', output: "deployment.apps/catalog-v2 created\nservice/catalog-v2 created" },
          { command: 'kubectl rollout status deploy/catalog-v2', output: "deployment \"catalog-v2\" successfully rolled out" },
          { command: 'cat shop/canary-route.yaml', output: "apiVersion: gateway.networking.k8s.io/v1\nkind: HTTPRoute\nmetadata:\n  name: catalog-canary\nspec:\n  parentRefs:\n  - name: shop-gw\n    namespace: infra\n  hostnames:\n  - api.example.test\n  rules:\n  - backendRefs:\n    - name: catalog\n      port: 80\n      weight: 3\n    - name: catalog-v2\n      port: 80\n      weight: 1" },
          { command: 'kubectl apply -f shop/canary-route.yaml', output: "httproute.gateway.networking.k8s.io/catalog-canary created" },
          { command: 'kubectl get httproute', output: "NAME             HOSTNAMES              AGE\ncatalog-canary   [\"api.example.test\"]   0s" },
          { command: 'curl -s http://api.example.test/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-rt257" },
          { command: 'curl -s http://api.example.test/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-8gvmp" },
          { command: 'curl -s http://api.example.test/items', output: "catalog 2.2 (canary) served by catalog-v2-btffgrl4hx-mlq7d" },
          { command: 'curl -s http://api.example.test/items', output: "catalog 2.1 served by catalog-bblt4rfsn5-rt257" },
          { command: `kubectl get httproute catalog-canary ${CONDITIONS}`, output: "Accepted=True Accepted\nResolvedRefs=True ResolvedRefs" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub07-x-route', title: '讓 shop.example.test 依路徑分給兩個 Service', machine: 'kub07-route',
        statement: 'frontend 與 catalog 目前只有 ClusterIP。請建立名為 shop 的 Ingress，交給 IngressClass nginx 的 controller：shop.example.test 的 `/api`（含底下所有路徑）送到 Service catalog 的 80 埠，其他路徑送到 Service frontend 的 80 埠。完成後 `curl http://shop.example.test/api/items` 應該由 catalog 回答、`/cart` 由 frontend 回答。寫成 YAML 用 `kubectl apply`，或用 `kubectl create ingress` 都可以。',
        checks: [
          { kind: 'kube-object', resource: 'Ingress', name: 'shop', fields: [{ path: '.spec.ingressClassName', equals: 'nginx' }, { path: '.status.loadBalancer.ingress[0].ip', equals: LB }] },
          { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.1' },
          { kind: 'http', url: `http://${HOST}/cart`, status: 200, body: 'shop frontend 1.6' },
          { kind: 'http', url: `http://${HOST}/apidocs`, status: 200, body: 'shop frontend 1.6' },
        ],
        solution: [`kubectl create ingress shop --class=nginx --rule='${HOST}/*=frontend:80' --rule='${HOST}/api*=catalog:80'`, 'kubectl get ing shop'],
        mistakes: [
          { commands: [`kubectl create ingress shop --rule='${HOST}/*=frontend:80' --rule='${HOST}/api*=catalog:80'`], why: '沒有 `--class=nginx`，這個叢集也沒有預設 class：Ingress 建立了，但沒有 controller 認領，ADDRESS 是空的，請求都得到 404。' },
          { commands: [`kubectl create ingress shop --class=nginx --rule='${HOST}/*=frontend:80' --rule='${HOST}/api=catalog:80'`], why: '`/api` 結尾沒有 `*`，pathType 是 Exact，只比對 /api 本身；/api/items 不符合，落到 / 的 frontend。' },
          { commands: [`kubectl create ingress shop --class=nginx --rule='${HOST}/*=frontend:80' --rule='${HOST}/api*=catalog:8080'`], why: 'Ingress 的後端要寫 Service 的埠（80），8080 是容器的埠；Service catalog 沒有 8080 這個埠，/api 的請求得到 503。' },
          { commands: [`kubectl create ingress shop --class=nginx --rule='${HOST}/api*=catalog:80'`], why: '只寫了 /api 的規則，其他路徑（/cart）沒有符合的規則，落到預設後端的 404。' },
        ],
        hints: ['`kubectl create ingress 名稱 --class=nginx --rule=\'host/path*=service:port\'` 可以重複 `--rule`；路徑結尾的 `*` 代表 Prefix。', '後端的埠是 Service 的埠：`kubectl get svc` 看 PORT(S)。完成後 `kubectl get ing shop` 應該有 ADDRESS。'],
        explanation: '`--class=nginx` 讓 ingress-nginx 認領這個 Ingress 並寫入 ADDRESS 10.0.0.200；`/*` 與 `/api*` 產生兩條 Prefix 規則，/api/items 依最長比對交給 catalog:80，/cart 與 /apidocs（路徑元素不是 api）交給 frontend:80。後端寫的是 Service 的埠，controller 再從 Service 的端點找到容器的 8080 或 3000。用 YAML 寫的話，就是 ingressClassName: nginx 加上兩個 pathType: Prefix 的 path。',
      },
      {
        id: 'kub07-x-tls', title: '為 shop.example.test 加上 HTTPS', machine: 'kub07-tls',
        statement: 'Ingress shop 目前只有 HTTP。平台組把 shop.example.test 的憑證與私鑰放在 `~/shop/tls/shop.crt`、`~/shop/tls/shop.key`。請用它們在 default 命名空間建立 TLS 類型的 Secret shop-tls，並讓 Ingress shop 用這個 Secret 終止 shop.example.test 的 TLS（路由規則不變）。完成後 `curl https://shop.example.test/api/items` 要能通過憑證驗證，HTTP 的請求要被轉到 HTTPS。',
        checks: [
          { kind: 'kube-object', resource: 'Secret', name: 'shop-tls', fields: [{ path: '.type', equals: 'kubernetes.io/tls' }] },
          { kind: 'http', url: `https://${HOST}/api/items`, status: 200, body: 'catalog 2.1' },
          { kind: 'http', url: `http://${HOST}/api/items`, status: 308, header: ['Location', `https://${HOST}/api/items`] },
        ],
        solution: ['kubectl create secret tls shop-tls --cert=shop/tls/shop.crt --key=shop/tls/shop.key', TLS_INGRESS],
        mistakes: [
          { commands: ['kubectl create secret generic shop-tls --from-file=tls.crt=shop/tls/shop.crt --from-file=tls.key=shop/tls/shop.key', TLS_INGRESS],
            why: '`secret generic` 建立的是 Opaque 類型；Ingress 要的是 kubernetes.io/tls 的 Secret，controller 不採用它，出示 Fake Certificate，HTTPS 驗證失敗。' },
          { commands: ['kubectl create secret tls shop-cert --cert=shop/tls/shop.crt --key=shop/tls/shop.key', TLS_INGRESS],
            why: 'Secret 叫 shop-cert，Ingress 的 tls 卻指向 shop-tls：找不到 Secret，controller 用 Fake Certificate，HTTPS 驗證失敗。' },
          { commands: ['kubectl create secret tls shop-tls --cert=shop/tls/shop.crt --key=shop/tls/shop.key'], why: '只建立了 Secret，Ingress 沒有 tls 區段：controller 不知道 shop.example.test 要用它，443 埠出示的是 Fake Certificate，HTTP 也不會轉址。' },
          { commands: ['kubectl create secret tls shop-tls --cert=shop/tls/ca.crt --key=shop/tls/shop.key', TLS_INGRESS],
            why: 'ca.crt 是簽發者 CA 的憑證，不是 shop.example.test 的憑證，私鑰和它不相符：`kubectl create secret tls` 拒絕建立，Ingress 指向不存在的 Secret。' },
        ],
        hints: ['TLS 的 Secret 用 `kubectl create secret tls 名稱 --cert=憑證檔 --key=私鑰檔` 建立，類型就是 kubernetes.io/tls。', 'Ingress 要有 `tls:` 區段列出 hosts 與 secretName；`kubectl create ingress` 的規則加上 `,tls=shop-tls` 會產生它，加上 `--dry-run=client -o yaml | kubectl apply -f -` 就能更新既有的 Ingress。'],
        explanation: '`kubectl create secret tls` 先確認私鑰與憑證相符，建立 kubernetes.io/tls 類型的 Secret。Ingress 的 tls 列出 shop.example.test 與 secretName shop-tls 之後，controller 在 443 埠依 SNI 出示這張由公司 CA 簽發的憑證（工作站信任這個 CA，所以驗證通過），解密後照原本的規則轉送；同時這個 host 的 HTTP 請求改回 308，Location 指向同一路徑的 https 網址。也可以直接把 tls 區段加進 shop-ing.yaml 再 `kubectl apply -f`。',
      },
      {
        id: 'kub07-x-ops', title: '修好打不開的 ops.example.test', machine: 'kub07-ops',
        statement: '同事為營運儀表板 ops-ui 寫了 `~/shop/ops-ing.yaml` 並套用成 Ingress ops，可是 http://ops.example.test/ 一直打不開。請找出原因並修正 Ingress ops（名稱不變），讓 ops.example.test 的所有路徑都由 ops-ui 回答。',
        checks: [
          { kind: 'kube-object', resource: 'Ingress', name: 'ops', fields: [{ path: '.spec.ingressClassName', equals: 'nginx' }, { path: '.status.loadBalancer.ingress[0].ip', equals: LB }] },
          { kind: 'http', url: `http://${OPS_HOST}/`, status: 200, body: 'shop ops dashboard' },
          { kind: 'http', url: `http://${OPS_HOST}/alerts`, status: 200, body: 'shop ops dashboard' },
        ],
        solution: ['kubectl get ing ops', 'kubectl describe ing ops', 'kubectl get svc ops-ui', heredoc('shop/ops-ing.yaml', OPS_FIXED), 'kubectl apply -f shop/ops-ing.yaml'],
        mistakes: [
          { commands: [heredoc('shop/ops-ing.yaml', ingress('ops', OPS_HOST, pathRule('/', 'Prefix', 'ops-ui', 9090), CLASS)), 'kubectl apply -f shop/ops-ing.yaml'], why: '加上 class 之後 controller 接手了，但後端的埠還是 9090：那是容器的埠，Service ops-ui 只有 80 埠，請求得到 503。' },
          { commands: [heredoc('shop/ops-ing.yaml', ingress('ops', OPS_HOST, pathRule('/', 'Prefix', 'ops-ui'), [])), 'kubectl apply -f shop/ops-ing.yaml'], why: '埠改對了，但還是沒有 ingressClassName：沒有 controller 認領，ADDRESS 是空的，請求落到 404。' },
          { commands: [heredoc('shop/ops-ing.yaml', ingress('ops', OPS_HOST, pathRule('/', 'Prefix', 'ops-ui'), ['ingressClassName: ingress-nginx'])), 'kubectl apply -f shop/ops-ing.yaml'], why: 'class 的名稱要寫 IngressClass 物件的名稱（`kubectl get ingressclass` 看到的 nginx），不是 controller 的專案名稱；ingress-nginx 這個 class 不存在，沒有人服務。' },
          { commands: ['kubectl apply -f shop/ops-ing.yaml'], why: '檔案沒有改，重新套用得到 unchanged，兩個問題都還在。' },
        ],
        hints: ['先看 `kubectl get ing ops` 的 CLASS 與 ADDRESS，再看 `kubectl describe ing ops` 的後端與括號裡的端點。', '後端的埠要對上 `kubectl get svc ops-ui` 的 PORT(S)；修正之後用 `cat > shop/ops-ing.yaml <<\'EOF\'` 重寫檔案並 `kubectl apply -f`。'],
        explanation: '這個 Ingress 有兩個問題。第一，沒有 ingressClassName，叢集也沒有預設 class，所以 ingress-nginx 不服務它：CLASS 是 <none>、ADDRESS 空白，請求得到預設後端的 404。第二，後端寫的是容器埠 9090，但 Service ops-ui 的埠是 80（targetPort 才是 9090），describe 的後端顯示沒有端點，即使被服務也會是 503。寫上 ingressClassName: nginx、把 port.number 改成 80 再 apply，controller 寫入 10.0.0.200，所有路徑交給 ops-ui。',
      },
      {
        id: 'kub07-x-canary', title: '用 HTTPRoute 把一成流量給 catalog 2.2', machine: 'kub07-canary',
        statement: '平台組已經在 infra 命名空間準備好 Gateway shop-gw（listener 接受 `*.example.test`、允許所有命名空間的 route），catalog 2.2 也以 Service catalog-v2 部署好了。請在 default 命名空間建立 HTTPRoute catalog-split，掛到 infra 的 shop-gw，負責 api.example.test 的所有路徑：90% 的流量給 Service catalog、10% 給 Service catalog-v2（都是 80 埠），並確認它被 Gateway 接受、後端都解析成功。',
        checks: [
          { kind: 'kube-object', resource: 'HTTPRoute', name: 'catalog-split', conditions: [{ type: 'Accepted', status: 'True' }, { type: 'ResolvedRefs', status: 'True' }],
            fields: [{ path: '.spec.rules[0].backendRefs[0].name', equals: 'catalog' }, { path: '.spec.rules[0].backendRefs[0].weight', equals: '90' },
              { path: '.spec.rules[0].backendRefs[1].name', equals: 'catalog-v2' }, { path: '.spec.rules[0].backendRefs[1].weight', equals: '10' }] },
          { kind: 'http', url: `http://${API_HOST}/items`, status: 200, body: 'served by catalog' },
        ],
        solution: [heredoc('shop/split-route.yaml', SPLIT()), 'kubectl apply -f shop/split-route.yaml', `kubectl get httproute catalog-split ${CONDITIONS}`],
        mistakes: [
          { commands: [heredoc('shop/split-route.yaml', SPLIT(undefined, ['  - name: shop-gw'])), 'kubectl apply -f shop/split-route.yaml'], why: 'parentRefs 沒有寫 namespace: infra，預設是 route 自己的命名空間 default，那裡沒有 shop-gw：沒有 Gateway 接受這個 route，api.example.test 沒有任何規則。' },
          { commands: [heredoc('shop/split-route.yaml', SPLIT(undefined, undefined, 'api.example.com')), 'kubectl apply -f shop/split-route.yaml'], why: 'hostnames 寫成 api.example.com，和 listener 的 *.example.test 沒有交集：Accepted 是 False（NoMatchingListenerHostname）。' },
          { commands: [heredoc('shop/split-route.yaml', SPLIT([['catalog', 90], ['catalog-canary', 10]])), 'kubectl apply -f shop/split-route.yaml'], why: 'Service 的名稱是 catalog-v2，catalog-canary 不存在：ResolvedRefs 是 False（BackendNotFound），那一成的請求會得到 500。' },
          { commands: [heredoc('shop/split-route.yaml', SPLIT([['catalog', 10], ['catalog-v2', 90]])), 'kubectl apply -f shop/split-route.yaml'], why: '權重放反了：九成流量會給還在試驗的 catalog 2.2，金絲雀應該只拿一小部分。' },
        ],
        hints: ['HTTPRoute 的 `parentRefs` 要寫 Gateway 的 name 與 namespace；`hostnames` 要落在 listener 的 *.example.test 裡。', '同一條規則的 `backendRefs` 列出兩個 Service，各自寫 `port: 80` 與 `weight`；套用後用 jsonpath 讀 `.status.parents[0].conditions`。'],
        explanation: 'parentRefs 指向 infra/shop-gw，listener 允許所有命名空間，hostname api.example.test 落在 *.example.test 之內，所以 Accepted 為 True；兩個 backendRefs 的 Service 都存在，ResolvedRefs 為 True。weight 90 與 10 是比例：平均每十個請求一個給 catalog-v2。確認新版沒問題再逐步調高；出問題時把 catalog-v2 的 weight 改成 0，流量立刻回到 catalog。',
      },
    ],
  },
};
