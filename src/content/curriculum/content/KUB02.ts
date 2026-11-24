import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

/*
 * KUB02 Kubernetes architecture (KUB-1, network-sequence; the blueprint's architecture-diagram activity drawn as a
 * network scene, as DKR01, DKR02 and SRV05 do). A terminal lesson on the cluster profile (engine stage E32) beside one
 * network-protocol scene. The terminal part explores a fictional kubeadm cluster read-only from an admin workstation:
 * kubectl version and cluster-info, the kubeconfig's server and context, api-resources, the three nodes (cp-01 with
 * the control-plane NoSchedule taint), the node conditions the kubelet reports, kube-system's static pods (owned by the
 * Node), the coredns Deployment and the kube-proxy DaemonSet; then one Pod applied and followed from ContainerCreating
 * to Running with kubectl wait and its events (Scheduled from the scheduler, Pulling/Pulled/Created/Started from the
 * kubelet). The network part traces that kubectl apply: kubectl's GET (404) and POST to the API server
 * (authentication, authorization, admission, validation), the write to etcd, the watch events to the scheduler and the
 * controller manager, the binding, the kubelet's watch on its own node, the CRI calls to containerd (RunPodSandbox,
 * PullImage, CreateContainer, StartContainer), the status patch and the watch event that ends kubectl wait. Facts
 * follow the Kubernetes documentation (components, static pods, the API's binding and status subresources, watches,
 * leases and node heartbeats, etcd's role and its quorum) and the CRI's v1 service names, described generally.
 * etcd's Raft, the scheduler's scoring, CRI, CNI and the registry pull are text only (never fake command output);
 * etcd snapshots are only named. In the scene TLS handshakes, the watch connections' setup, events written by the
 * scheduler and kubelet, the image pull from the registry and the CNI plugin are left out; addresses (the cluster's
 * 10.0.0.0/24 network, the workstation 10.0.0.20) and ephemeral ports are made up, as are host names, images and
 * users. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const file = (path: string, content: string): TerminalFile => ({ path, kind: 'file', mode: 0o644, owner: 'learner', content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
const BASIC = ['pwd', 'ls', 'cat', 'echo', 'sleep', 'sh', 'env', 'hostname'];
const IMAGES: TerminalImage[] = [
  { name: 'busybox:1.36', size: 4_270_000, created: '2026-10-01 00:00:00', cmd: ['sh'], layers: 1, osRelease: DEBIAN, commands: BASIC },
  { name: 'shop/catalog:2.4', size: 48_300_000, created: '2026-11-20 10:00:00', cmd: ['./catalog'], expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
    logs: ['catalog 2.4 listening on :8080'] },
  { name: 'shop/search:1.8', size: 96_500_000, created: '2026-11-21 08:00:00', cmd: ['./search'], expose: [9200], service: true, layers: 5, osRelease: DEBIAN, commands: BASIC,
    logs: ['search 1.8: index loaded, listening on :9200'] },
];

const CATALOG = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: catalog', '  labels:', '    app: catalog', 'spec:', '  containers:', '  - name: catalog', '    image: shop/catalog:2.4',
  '    ports:', '    - containerPort: 8080');
const SEARCH = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: search', '  labels:', '    app: search', 'spec:', '  containers:', '  - name: search', '    image: shop/search:1.8',
  '    ports:', '    - containerPort: 9200');
const busyPod = (name: string, line: string) => yaml('apiVersion: v1', 'kind: Pod', 'metadata:', `  name: ${name}`, '  labels:', `    app: ${name}`, 'spec:', '  containers:', `  - name: ${name}`,
  '    image: busybox:1.36', `    command: ["sh", "-c", "echo ${line}; sleep 86400"]`);
const REPORT = busyPod('report', 'report worker ready');
const CACHE = busyPod('cache', 'cache warmed');

type Kube = NonNullable<TerminalMachine['kube']>;
/** The cluster: kubeadm's three nodes, pulls of 4 s (search 10 s), and the Pod report applied at 09:20. */
const CLUSTER: Kube = {
  pullSeconds: 4, images: [{ name: 'shop/search:1.8', seconds: 10 }],
  manifests: [{ text: REPORT, at: '2026-11-24 09:20:00', file: 'report.yaml' }],
};

const ws: TerminalMachine = {
  id: 'kub02-ws', title: 'ops-ws（叢集的管理工作站）', user: 'learner', cwd: '/home/learner', host: 'ops-ws', profile: 'cluster', now: '2026-11-24 10:00:00',
  files: [dir('/home'), dir('/home/learner', 'learner'), dir('/home/learner/k8s', 'learner'), file('/home/learner/k8s/catalog.yaml', CATALOG), file('/home/learner/k8s/search.yaml', SEARCH)],
  docker: { images: IMAGES },
  kube: CLUSTER,
};

/** Another morning: cache was applied first and took node-01, so report landed on node-02. */
const EARLIER_CACHE: TerminalVariant = { label: '另一個早上：cache 先建立，佔了 node-01', files: [], kube: {
  ...CLUSTER, manifests: [{ text: CACHE, at: '2026-11-24 09:10:00', file: 'cache.yaml' }, ...CLUSTER.manifests!] } };
/** Another cluster whose workers have other names. */
const OTHER_NAMES: TerminalVariant = { label: '另一個叢集：工作節點叫 worker-a、worker-b、worker-c', files: [], kube: {
  ...CLUSTER, nodes: [{ name: 'cp-01', control: true }, { name: 'worker-a' }, { name: 'worker-b' }, { name: 'worker-c' }] } };
/** search's image is not cached anywhere and the registry is slow today: the pull takes 40 s. */
const SLOW_PULL: TerminalVariant = { label: '今天 Registry 比較慢：shop/search:1.8 要拉 40 秒', files: [], kube: { ...CLUSTER, images: [{ name: 'shop/search:1.8', seconds: 40 }] } };

// ---- network scene -----------------------------------------------------------------------------------------------
const WS_IP = '10.0.0.20', CP_IP = '10.0.0.50', NODE_IP = '10.0.0.52', POD_IP = '10.244.2.2';
const CRI_SOCK = '/run/containerd/containerd.sock';
const k8s = (method: string, path: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（Kubernetes API）', fields: [
  { name: '方法', value: method }, { name: '路徑', value: path }, ...extra.map(([name, value]) => ({ name, value }))] });
const k8sResp = (code: string, reason: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（Kubernetes API）', fields: [
  { name: '狀態碼', value: code }, { name: '原因片語', value: reason }, ...extra.map(([name, value]) => ({ name, value }))] });
const watch = (path: string, type: string, extra: [string, string][] = []): ProtocolHeader => ({ layer: 'application', protocol: 'HTTPS（Kubernetes API 的 watch 串流）', fields: [
  { name: 'watch 的請求', value: `GET ${path}` }, { name: '事件類型', value: type }, ...extra.map(([name, value]) => ({ name, value }))] });
const etcdTxn = (key: string, what: string): ProtocolHeader => ({ layer: 'application', protocol: 'gRPC（etcd v3 API）', fields: [
  { name: '方法', value: '/etcdserverpb.KV/Txn' }, { name: '鍵', value: key }, { name: '內容', value: what }] });
const cri = (method: string, extra: [string, string][]): ProtocolHeader => ({ layer: 'application', protocol: 'gRPC（CRI v1）', fields: [
  { name: '方法', value: method }, ...extra.map(([name, value]) => ({ name, value }))] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const unix = (path: string): ProtocolHeader => ({ layer: 'transport', protocol: 'Unix socket', fields: [{ name: 'socket 路徑', value: path }] });

const KEY = '/registry/pods/default/catalog';
const STORE_HEAD = ['鍵', 'spec.nodeName', 'status.phase'];
const REPORT_ROW = ['/registry/pods/default/report', 'node-01', 'Running'];
const store = (row: string[] | undefined, changed?: boolean): NodeTable => ({ node: 'etcd', name: '儲存的 Pod', head: STORE_HEAD,
  rows: row ? [REPORT_ROW, row] : [REPORT_ROW], ...changed ? { changed: [1] } : {} });
const KUBELET_HEAD = ['Pod', '節點上的狀態'];
const kubelet = (state: string, changed = true): NodeTable => ({ node: 'kubelet', name: 'node-02 上的 Pod', head: KUBELET_HEAD, rows: [['catalog', state]], ...changed ? { changed: [0] } : {} });

const applyTrace: NetworkScene = {
  id: 'kub02-apply-trace', title: 'kubectl apply 之後：API server、etcd、scheduler、kubelet 與 containerd', model: 'tcp-ip',
  description: `learner 在管理工作站 ops-ws（${WS_IP}）執行 \`kubectl apply -f k8s/catalog.yaml\`，接著 \`kubectl wait --for=condition=Ready pod/catalog\`。kubectl 只和 API server（https://${CP_IP}:6443）說話；API server 是唯一讀寫 etcd 的元件；scheduler、controller manager 與每個節點的 kubelet 都是事先對 API server 開好 watch，從串流得知變化，再把結果寫回 API server，彼此從不直接連線。叢集裡已經有 Pod report 在 node-01 上。每段 HTTPS 都有雙向的 TLS 憑證驗證，這裡省略交握；scheduler、kubelet 寫的事件（Event）與 Image 從 Registry 下載的過程也省略。位址與連接埠是虛構的。`,
  nodes: [
    { id: 'kubectl', label: 'kubectl（learner 的工作站）', kind: 'host', addresses: [`ops-ws ${WS_IP}`] },
    { id: 'apiserver', label: 'kube-apiserver（cp-01）', kind: 'server', addresses: [`https://${CP_IP}:6443`] },
    { id: 'etcd', label: 'etcd（cp-01，叢集唯一的資料庫）', kind: 'server', addresses: ['https://127.0.0.1:2379'] },
    { id: 'controller', label: 'kube-controller-manager（cp-01）', kind: 'server', addresses: [`${CP_IP}（host network）`] },
    { id: 'scheduler', label: 'kube-scheduler（cp-01）', kind: 'server', addresses: [`${CP_IP}（host network）`] },
    { id: 'kubelet', label: 'kubelet（node-02 的節點代理）', kind: 'host', addresses: [`node-02 ${NODE_IP}`, 'TCP 10250（給 logs、exec）'] },
    { id: 'containerd', label: 'containerd（node-02 的容器執行環境）', kind: 'server', addresses: [`unix://${CRI_SOCK}`] },
  ],
  messages: [
    { id: 'get', from: 'kubectl', to: 'apiserver', label: 'GET pods/catalog：叢集裡已經有它嗎？',
      headers: [k8s('GET', '/api/v1/namespaces/default/pods/catalog', [['Accept', 'application/json']]), tcp('51734', '6443'), ipv4(WS_IP, CP_IP)],
      note: 'kubectl 先讀 ~/.kube/config：伺服器是 https://10.0.0.50:6443，身分是設定檔裡的用戶端憑證（kubernetes-admin）。kubectl apply 是宣告式的：它先問 API server 這個物件現在存不存在，不存在就建立，存在就只送出差異。kubectl 自己不連任何節點，也不碰容器。',
      tables: [store(undefined)] },
    { id: 'not-found', from: 'apiserver', to: 'kubectl', label: '404 NotFound',
      headers: [k8sResp('404', 'Not Found', [['Content-Type', 'application/json']]), tcp('6443', '51734'), ipv4(CP_IP, WS_IP)],
      payload: '{"kind":"Status","apiVersion":"v1","status":"Failure","message":"pods \\"catalog\\" not found","reason":"NotFound","code":404}',
      note: 'API server 在 etcd 裡查不到 /registry/pods/default/catalog，回答 404。對 apply 來說這不是錯誤，而是「要建立」的訊號。' },
    { id: 'create', from: 'kubectl', to: 'apiserver', label: 'POST pods：建立 catalog',
      headers: [k8s('POST', '/api/v1/namespaces/default/pods', [['Content-Type', 'application/json']]), tcp('51734', '6443'), ipv4(WS_IP, CP_IP)],
      payload: '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"catalog","labels":{"app":"catalog"},"annotations":{"kubectl.kubernetes.io/last-applied-configuration":"…"}},"spec":{"containers":[{"name":"catalog","image":"shop/catalog:2.4",…}]}}',
      note: '請求進入 API server 的處理鏈：認證（authentication，這張用戶端憑證是誰）→ 授權（authorization，RBAC：這個身分可以在 default 建立 pods 嗎）→ mutating admission（例如加上 ServiceAccount 的 token Volume、兩個 300 秒的 NoExecute toleration）→ 欄位驗證與 validating admission。任何一關不通過，請求就以 401、403、422 等錯誤結束，什麼都不會寫入。last-applied-configuration 是 kubectl 記下的「上次 apply 的內容」，下次 apply 用來算差異。' },
    { id: 'persist', from: 'apiserver', to: 'etcd', label: 'Txn：鍵不存在才寫入',
      headers: [etcdTxn(KEY, 'Pod（protobuf 編碼），spec.nodeName 空白，status.phase Pending'), tcp('48212', '2379'), ipv4('127.0.0.1', '127.0.0.1')],
      note: 'API server 把通過檢查的 Pod 寫進 etcd：一筆以「鍵不存在」為條件的交易，所以兩個人同時建立同名的 Pod 只有一個會成功。etcd 以 Raft 把這筆寫入複製到過半數的成員之後才回報成功（這個 kubeadm 叢集只有一個 etcd 成員）。這時 Pod 還沒有節點，phase 是 Pending。',
      tables: [store([KEY, '（空）', 'Pending'], true)] },
    { id: 'created', from: 'apiserver', to: 'kubectl', label: '201 Created',
      headers: [k8sResp('201', 'Created', [['Content-Type', 'application/json']]), tcp('6443', '51734'), ipv4(CP_IP, WS_IP)],
      payload: '{"kind":"Pod","metadata":{"name":"catalog","uid":"…","resourceVersion":"…"},"spec":{…},"status":{"phase":"Pending","qosClass":"BestEffort"}}',
      note: 'kubectl 印出 pod/catalog created 並結束。注意這一刻叢集裡只有 etcd 的一筆紀錄：還沒有選節點、沒有下載 Image、沒有任何容器。之後的每一步都由其他元件各自從 watch 得知、各自完成。',
      tables: [store([KEY, '（空）', 'Pending'])] },
    { id: 'watch-controller', from: 'apiserver', to: 'controller', label: 'watch 事件 ADDED：controller manager 看到新的 Pod',
      headers: [watch('/api/v1/pods?watch=true（controller manager 早已開好的串流）', 'ADDED', [['物件', 'Pod default/catalog']]), tcp('6443', '39518'), ipv4(CP_IP, CP_IP)],
      note: 'controller manager 裡的許多控制器（ReplicaSet、Job、EndpointSlice…）都 watch Pod。它們各自比對「期望狀態」與「實際狀態」：catalog 沒有 ownerReferences，不屬於任何 ReplicaSet 或 Job，所以沒有控制器需要做事。如果這是 Deployment，Deployment 控制器會建立 ReplicaSet，ReplicaSet 控制器再建立 Pod，之後的路徑和這裡相同（KUB04）。' },
    { id: 'watch-scheduler', from: 'apiserver', to: 'scheduler', label: 'watch 事件 ADDED：一個還沒有節點的 Pod',
      headers: [watch('/api/v1/pods?watch=true（scheduler 早已開好的串流）', 'ADDED', [['物件', 'Pod default/catalog'], ['spec.nodeName', '（空）']]), tcp('6443', '39602'), ipv4(CP_IP, CP_IP)],
      note: 'scheduler 的工作只有一件：替 spec.nodeName 空白、schedulerName 是 default-scheduler 的 Pod 選節點。它不是被 API server 呼叫的，而是透過自己開的 watch 串流得知新的 Pod，放進排程佇列。' },
    { id: 'bind', from: 'scheduler', to: 'apiserver', label: 'POST binding：catalog → node-02',
      headers: [k8s('POST', '/api/v1/namespaces/default/pods/catalog/binding', [['Content-Type', 'application/json'], ['目標節點', 'node-02']]), tcp('39604', '6443'), ipv4(CP_IP, CP_IP)],
      payload: '{"apiVersion":"v1","kind":"Binding","metadata":{"name":"catalog"},"target":{"apiVersion":"v1","kind":"Node","name":"node-02"}}',
      note: '過濾：cp-01 有 node-role.kubernetes.io/control-plane:NoSchedule 的 taint，而 catalog 沒有對應的 toleration，被淘汰；node-01、node-02 都放得下。評分：node-01 已經有 report，node-02 比較空，分數較高。scheduler 不聯絡 node-02，也不啟動任何東西：它只是向 API server 送出一個 Binding（pods 的 binding 子資源），並記下 Scheduled 事件。' },
    { id: 'persist-bind', from: 'apiserver', to: 'etcd', label: 'Txn：寫入 spec.nodeName',
      headers: [etcdTxn(KEY, 'spec.nodeName = node-02；PodScheduled 條件 True'), tcp('48212', '2379'), ipv4('127.0.0.1', '127.0.0.1')],
      note: '綁定也只是一次寫入：API server 把 node-02 寫進這個 Pod 的 spec.nodeName（resourceVersion 隨之增加）。從現在起，catalog 屬於 node-02。',
      tables: [store([KEY, 'node-02', 'Pending'], true)] },
    { id: 'watch-kubelet', from: 'apiserver', to: 'kubelet', label: 'watch 事件：有一個 Pod 被派到 node-02',
      headers: [watch('/api/v1/pods?fieldSelector=spec.nodeName%3Dnode-02&watch=true', 'MODIFIED', [['篩選條件', 'spec.nodeName=node-02'], ['物件', 'Pod default/catalog']]), tcp('6443', '44120'), ipv4(CP_IP, NODE_IP)],
      note: '每個節點的 kubelet 只 watch spec.nodeName 是自己的 Pod。這條串流是 node-02 的 kubelet 連到 6443 開的，所以事件沿著它從 API server 流向 kubelet：API server 從不主動連到 kubelet 去「派工」（它只在 kubectl logs、exec、port-forward 時連到 kubelet 的 10250 埠）。node-01 的 kubelet 根本看不到這個事件。',
      tables: [store([KEY, 'node-02', 'Pending']), kubelet('收到，準備啟動')] },
    { id: 'sandbox', from: 'kubelet', to: 'containerd', label: 'CRI RunPodSandbox：先建立 Pod 的沙箱',
      headers: [cri('/runtime.v1.RuntimeService/RunPodSandbox', [['Pod', 'default/catalog'], ['結果', `沙箱（pause 容器）與網路命名空間，Pod IP ${POD_IP}`]]), unix(CRI_SOCK)],
      note: 'kubelet 透過 CRI（Container Runtime Interface）這個 gRPC 介面指揮 containerd，經由節點上的 Unix socket，不經過網路。第一步是 Pod 的沙箱：一個 pause 容器持有 Pod 共用的網路命名空間，CNI 外掛替它接上 Pod 網路並配出 10.244.2.2（node-02 的 Pod CIDR 是 10.244.2.0/24；CNI 的細節只在課文說明）。',
      tables: [kubelet('ContainerCreating（沙箱已建立）')] },
    { id: 'pull', from: 'kubelet', to: 'containerd', label: 'CRI PullImage：shop/catalog:2.4',
      headers: [cri('/runtime.v1.ImageService/PullImage', [['Image', 'docker.io/shop/catalog:2.4'], ['原因', 'imagePullPolicy IfNotPresent，節點上還沒有']]), unix(CRI_SOCK)],
      note: '節點上沒有這個 Image，kubelet 請 containerd 拉取（kubelet 記下 Pulling 事件）。下載是 node-02 的 containerd 向 Registry 做的，和 learner 的工作站無關；拉取的 HTTPS 往返在這裡省略（DKR02 畫過 Registry 的 manifest 與層）。這段時間 kubectl 看到的 STATUS 是 ContainerCreating。',
      tables: [kubelet('ContainerCreating（拉取 Image）')] },
    { id: 'start', from: 'kubelet', to: 'containerd', label: 'CRI CreateContainer、StartContainer',
      headers: [cri('/runtime.v1.RuntimeService/StartContainer', [['之前', 'CreateContainer（在沙箱 catalog 裡建立容器 catalog）'], ['程式', './catalog']]), unix(CRI_SOCK)],
      note: 'Image 到了之後（Pulled），kubelet 依 Pod 的 spec 要求 containerd 在沙箱裡建立容器（Created），再啟動它（Started）。containerd 之下和 docker run 一樣：shim 與 runc 依 OCI 規格請核心建立 namespace 與 cgroup（DKR02）。',
      tables: [kubelet('Running')] },
    { id: 'status', from: 'kubelet', to: 'apiserver', label: 'PATCH pods/catalog/status：Running',
      headers: [k8s('PATCH', '/api/v1/namespaces/default/pods/catalog/status', [['Content-Type', 'application/strategic-merge-patch+json']]), tcp('44120', '6443'), ipv4(NODE_IP, CP_IP)],
      payload: `{"status":{"phase":"Running","podIP":"${POD_IP}","conditions":[{"type":"Ready","status":"True"},…],"containerStatuses":[{"name":"catalog","ready":true,"started":true,…}]}}`,
      note: 'kubelet 把節點上的實際情況回報給 API server，寫的是 status 子資源：spec 是「想要什麼」，由使用者與控制器寫；status 是「現在怎樣」，由負責的元件（這裡是 kubelet）寫。kubelet 之後也持續回報，容器結束、重新啟動時都會更新。',
      tables: [kubelet('Running', false)] },
    { id: 'persist-status', from: 'apiserver', to: 'etcd', label: 'Txn：寫入 status',
      headers: [etcdTxn(KEY, `status.phase = Running；podIP ${POD_IP}；Ready True`), tcp('48212', '2379'), ipv4('127.0.0.1', '127.0.0.1')],
      note: 'status 一樣存在 etcd。現在任何人 kubectl get pod catalog 都會讀到 Running、node-02 與 10.244.2.2，而這些資訊是 kubelet 寫進來的，不是 kubectl 自己去節點上看的。',
      tables: [store([KEY, 'node-02', 'Running'], true)] },
    { id: 'wait-done', from: 'apiserver', to: 'kubectl', label: 'watch 事件 MODIFIED：Ready 條件成立',
      headers: [watch('/api/v1/namespaces/default/pods?fieldSelector=metadata.name%3Dcatalog&watch=true', 'MODIFIED', [['物件', 'Pod default/catalog'], ['Ready', 'True']]), tcp('6443', '51790'), ipv4(CP_IP, WS_IP)],
      note: 'kubectl wait 也是一個 watch：它對 catalog 開串流，等到 Ready 條件變成 True 就印出 pod/catalog condition met 並結束。從 apply 到這裡，沒有任何元件直接呼叫另一個元件：每個人都只和 API server 說話，靠 watch 得知變化，再把自己負責的那一半寫回去。' },
  ],
};

export const KUB02: LessonContent = {
  lessonId: 'KUB02',
  motivation: '上一課說 Kubernetes 是一個不斷把實際狀態拉回期望狀態的系統。可是「系統」是由誰組成的？你打的 kubectl apply 送到哪裡、存在哪裡？是誰決定 Pod 跑在哪一台機器、又是誰真的把容器啟動？哪一個元件壞了會讓整個叢集無法變更，哪一個壞了只影響一台節點？這一課從管理工作站 ops-ws 讀一個 kubeadm 叢集的節點與 kube-system，認識控制平面與工作節點上的每個元件，再把一次 kubectl apply 從頭追到容器開始執行，最後說明為什麼 etcd 是整個叢集最需要保護的東西。',
  sections: [
    {
      id: 'kub02-s-overview', title: '控制平面與工作節點：一張全景圖',
      blocks: [
        { type: 'p', text: 'Kubernetes 叢集分成兩種角色。控制平面（control plane）是叢集的大腦：保存所有物件、做決定、對外提供 API；工作節點（worker node）是手腳：真正執行容器。小叢集可以只有一台控制平面節點，正式環境通常有三台控制平面（或由託管的 Kubernetes 服務代管，你看不到它們），工作節點則從幾台到上千台都有。' },
        { type: 'table', head: ['元件', '在哪裡', '職責'], rows: [
          ['kube-apiserver（API Server）', '控制平面', '叢集唯一的入口：提供 REST API，做認證、授權、admission 與驗證，是唯一直接讀寫 etcd 的元件，並把變化以 watch 推給訂閱者'],
          ['etcd', '控制平面（或獨立的機器）', '分散式的鍵值資料庫，存放叢集裡的每一個物件：Pod、節點、Service、Secret…，是叢集唯一的真實來源'],
          ['kube-scheduler（Scheduler）', '控制平面', '替還沒有節點的 Pod 選擇節點：先過濾不合格的，再為剩下的評分，最後寫回 binding'],
          ['kube-controller-manager（Controller）', '控制平面', '執行許多控制器（Deployment、ReplicaSet、Node、Job、ServiceAccount、EndpointSlice…），每個控制器把實際狀態調和成期望狀態'],
          ['cloud-controller-manager', '控制平面（雲端環境才有）', '和雲端平台互動：建立負載平衡器、得知機器被刪除；kubeadm 自建的叢集沒有它'],
          ['kubelet', '每一台節點（Node）', '節點的代理：向 API server 註冊節點、定期回報心跳，watch 派給自己的 Pod，透過 CRI 請容器執行環境啟動容器，回報 Pod 的狀態'],
          ['kube-proxy', '每一台節點', '依 Service 設定節點上的封包轉送規則（KUB05 介紹 Service）'],
          ['容器執行環境（containerd）', '每一台節點', '拉取 Image、建立與執行容器；kubelet 透過 CRI 指揮它，之下是 shim 與 runc（DKR02）'],
        ] },
        { type: 'p', text: '`kubectl get nodes -o wide` 列出叢集的節點：cp-01 的 ROLES 是 control-plane，node-01、node-02 是工作節點。CONTAINER-RUNTIME 欄顯示每個節點的 kubelet 使用 containerd，VERSION 是 kubelet 的版本。控制平面節點預設帶著 `node-role.kubernetes.io/control-plane:NoSchedule` 的 taint，所以一般的 Pod 不會被排到它上面，讓控制平面的資源留給控制平面的元件。' },
        { type: 'example', id: 'kub02-nodes' },
        { type: 'p', text: '節點的 Conditions 是 kubelet 回報的：Ready 為 True 表示 kubelet 正常而且能執行 Pod，MemoryPressure、DiskPressure、PIDPressure 是資源吃緊的警訊。kubelet 定期更新 kube-node-lease 命名空間裡自己的 Lease 物件當作心跳；控制平面的 Node 控制器一段時間（預設數十秒）收不到心跳，就把節點標成 NotReady（Unknown），再過 300 秒，依 Pod 預設的 toleration，把上面的 Pod 驅逐到別的節點重建。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '這一課的叢集是模擬的 kubeadm 叢集，節點只是資料，不能 ssh 進去。etcd 的 Raft、scheduler 的評分、CRI 與 CNI 的內部只在課文與下面的情境裡說明，不會以假的指令輸出呈現；叢集也沒有 CNI 的 Pod。' },
      ],
    },
    {
      id: 'kub02-s-kubectl', title: 'kubectl 只是 API 的客戶端',
      blocks: [
        { type: 'p', text: 'kubectl 和 DKR02 的 docker CLI 是同一種角色：它本身不管理任何東西，只把指令翻譯成對 API server 的 HTTPS 請求，再把回應排成表格。要連到哪個叢集、用什麼身分，寫在 kubeconfig（預設是 `~/.kube/config`）：clusters 記錄 API server 的位址與 CA，users 記錄身分（這裡是用戶端憑證與金鑰），contexts 把叢集、使用者與預設命名空間組成一組，current-context 指定目前用哪一組。kubeadm 安裝時產生的 admin.conf 就是這種檔案，複製到自己的家目錄後權限應是 0600，因為擁有它就擁有整個叢集的管理權。' },
        { type: 'example', id: 'kub02-client' },
        { type: 'p', text: '`kubectl version` 的 Client Version 是 kubectl 自己，Server Version 是 API server 回答的；`cluster-info` 印出控制平面的位址 https://10.0.0.50:6443（6443 是 kubeadm 的 API server 預設埠）。`kubectl api-resources` 列出 API server 提供的資源類型、它們的 API 群組（`v1` 是核心群組，`apps/v1` 等是具名群組）以及是否屬於命名空間：節點與命名空間本身是叢集層級的，Pod、Service 屬於某個命名空間。kubectl 能操作的東西，就是 API server 公開的這些資源。' },
        { type: 'table', head: ['你下的指令', 'kubectl 送出的請求（概略）'], rows: [
          ['`kubectl get nodes`', '`GET /api/v1/nodes`'],
          ['`kubectl get pods -n kube-system`', '`GET /api/v1/namespaces/kube-system/pods`'],
          ['`kubectl apply -f catalog.yaml`（第一次）', '`GET …/pods/catalog`（404），再 `POST /api/v1/namespaces/default/pods`'],
          ['`kubectl apply -f catalog.yaml`（之後）', '`GET …/pods/catalog`，有差異時 `PATCH`，沒有差異就什麼都不送'],
          ['`kubectl wait --for=condition=Ready pod/catalog`', '對 catalog 開一個 watch，等到 Ready 條件為 True'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：kubectl 會連到節點上執行容器', text: 'kubectl 從頭到尾只連 API server。它不知道節點的 SSH 帳號，也不呼叫 containerd；即使工作站完全連不到 node-02，只要連得到 6443，apply 一樣成功。反過來說，API server 掛了，kubectl 對任何節點都無能為力，但節點上已經在跑的容器不會因此停止。kubectl logs 與 exec 看起來像是直接進到容器，其實也是 API server 代你連到那台節點的 kubelet。' },
      ],
    },
    {
      id: 'kub02-s-system', title: '控制平面也是 Pod：kube-system 與 static pod',
      blocks: [
        { type: 'p', text: '在 kubeadm 建立的叢集裡，控制平面的元件本身就以容器執行。`kubectl get pods -n kube-system -o wide` 可以看到 etcd-cp-01、kube-apiserver-cp-01、kube-controller-manager-cp-01、kube-scheduler-cp-01：名稱是元件加上節點名稱，IP 是節點自己的位址 10.0.0.50，因為它們使用 host network，直接聽在節點的網路介面上。' },
        { type: 'example', id: 'kub02-system' },
        { type: 'p', text: '這裡有一個雞生蛋的問題：Pod 要靠 scheduler 排程、靠 API server 存放，那 API server 與 scheduler 自己的 Pod 是誰啟動的？答案是 static pod：cp-01 的 kubelet 直接讀本機目錄 /etc/kubernetes/manifests 裡的四份 manifest（etcd.yaml、kube-apiserver.yaml、kube-controller-manager.yaml、kube-scheduler.yaml）並執行它們，完全不經過 scheduler 與 API server。API server 起來之後，kubelet 再為每個 static pod 建立一個鏡像 Pod（mirror pod）讓大家看得到，它的 owner 是 Node，所以用 kubectl 刪掉它，kubelet 會立刻再建一個；要真正停止，得修改或移走節點上的檔案。' },
        { type: 'table', head: ['kube-system 裡的', '由誰管理', '為什麼'], rows: [
          ['etcd、kube-apiserver、kube-controller-manager、kube-scheduler', 'cp-01 的 kubelet（static pod）', '控制平面要在 API server 存在之前就能啟動'],
          ['coredns（Deployment，2 個 Pod）', 'Deployment 與 ReplicaSet 控制器', '叢集內的 DNS，一般的無狀態服務，維持 2 份即可'],
          ['kube-proxy（DaemonSet）', 'DaemonSet 控制器', '每一台節點都要一份，新節點加入就自動多一個'],
        ] },
        { type: 'callout', tone: 'tip', title: '託管的 Kubernetes', text: '雲端供應商提供的託管 Kubernetes 服務通常把控制平面藏起來：你在 kube-system 看不到 etcd 與 kube-apiserver 的 Pod，它們由供應商在另外的機器上維運、備份與升級；你只拿到 API server 的位址與一份 kubeconfig。架構與元件的分工不變，只是控制平面那一半不歸你管。' },
      ],
    },
    {
      id: 'kub02-s-etcd', title: 'API Server 與 etcd：叢集唯一的真實來源',
      blocks: [
        { type: 'p', text: 'API server 本身沒有狀態：它收到請求、檢查、寫進 etcd，再把 etcd 的變化轉成 watch 事件送出去。所以 API server 可以同時跑好幾份、放在負載平衡器後面，壞一份換一份就好。真正的狀態全部在 etcd：每個物件是一個鍵，例如 `/registry/pods/default/catalog`，值是物件的內容。叢集「現在應該是什麼樣子」（spec）以及各元件回報的「現在是什麼樣子」（status）都只存在這裡；節點上的 containerd 雖然知道自己執行了哪些容器，但那只是執行的結果，不是叢集的紀錄。' },
        { type: 'p', text: '每個請求進入 API server 後依序經過：認證（authentication，你是誰：用戶端憑證、ServiceAccount 的 token 等）、授權（authorization，你可以做這件事嗎：通常是 RBAC，可以用 `kubectl auth can-i` 詢問）、mutating admission（補上預設值，例如 ServiceAccount 的 token Volume、300 秒的 toleration）、驗證與 validating admission（例如 Pod Security、ResourceQuota），全部通過才寫進 etcd。所有元件，包括 scheduler、controller manager 與 kubelet，都走同一條路，沒有任何元件可以繞過 API server 直接改 etcd。' },
        { type: 'p', text: 'etcd 用 Raft 共識演算法在多個成員之間複製資料：一筆寫入要被過半數（quorum）的成員確認才算成功。過半數的意思是 n 個成員需要 ⌊n/2⌋ + 1 個同意，所以能容忍的故障數是 n 減去它：' },
        { type: 'table', head: ['etcd 成員數', 'quorum（過半數）', '最多可以同時壞幾台', '說明'], rows: [
          ['1', '1', '0', '單一成員，壞了就沒有 etcd（本課的 kubeadm 叢集就是這樣，只適合學習與測試）'],
          ['3', '2', '1', '最常見的正式環境配置'],
          ['4', '3', '1', '比 3 台多一台機器，容錯卻一樣，還多了一台可能出問題的成員'],
          ['5', '3', '2', '容錯更高，但每次寫入要等更多成員確認，延遲略增'],
        ] },
        { type: 'p', text: 'etcd 失去 quorum 時無法接受寫入：API server 不能建立、修改或刪除任何物件，scheduler 不能綁定、kubelet 不能回報狀態，叢集等於凍結。已經在跑的容器通常會繼續跑（kubelet 與 containerd 還在），但任何變化、重新排程與自我修復都停止了。所以 etcd 的備份是叢集最重要的備份：定期以 etcd 提供的工具做快照（snapshot），連同控制平面的憑證（kubeadm 放在 /etc/kubernetes/pki）存到叢集之外，並且真的演練過還原。etcd 的快照包含每一個 Secret，必須和憑證一樣小心保管。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：etcd 成員越多越安全、偶數也可以', text: '容錯取決於過半數，不是成員總數：4 台和 3 台一樣只能壞 1 台，6 台和 5 台一樣只能壞 2 台，所以 etcd 一律用奇數。成員更多也代表每次寫入要等更多台確認、跨機房時延遲更明顯。更重要的是，quorum 保護的是「機器壞掉」，不保護「資料被誤刪」：有人刪掉一個命名空間，這個刪除會被忠實地複製到每個成員。能救回資料的只有備份。' },
      ],
    },
    {
      id: 'kub02-s-watch', title: 'Scheduler 與 Controller：watch 與調和',
      blocks: [
        { type: 'p', text: 'Kubernetes 的元件之間有一條鐵則：大家都只和 API server 說話，彼此從不直接連線。scheduler 不會打電話給 kubelet，controller manager 不會通知 scheduler。它們各自對 API server 開一個 watch：一個長時間不關閉的 HTTP 請求，API server 每當有相關物件新增（ADDED）、修改（MODIFIED）或刪除（DELETED）就沿著它送出事件。元件收到事件後做自己負責的那一件事，再把結果寫回 API server，下一個元件又從自己的 watch 得知。唯一的例外方向是 API server 為了 kubectl logs、exec、port-forward 主動連到 kubelet 的 10250 埠。' },
        { type: 'table', head: ['元件', 'watch 什麼', '看到後做什麼', '寫回什麼'], rows: [
          ['kube-scheduler', 'spec.nodeName 空白的 Pod，以及節點', '過濾（taint、nodeSelector、資源夠不夠）、評分，選出一個節點', 'Pod 的 binding（spec.nodeName）'],
          ['ReplicaSet 控制器（controller manager）', 'ReplicaSet 與它擁有的 Pod', '比較期望的副本數與實際的 Pod 數', '建立或刪除 Pod'],
          ['Node 控制器（controller manager）', '節點與它們的 Lease', '心跳逾時就判定節點不健康', '節點的 condition 與 taint'],
          ['kubelet（每個節點）', 'spec.nodeName 是自己的 Pod', '透過 CRI 讓 containerd 建立沙箱、拉 Image、啟動容器', 'Pod 的 status'],
        ] },
        { type: 'p', text: '每個控制器都是同一個調和迴圈（reconcile loop）：讀取期望狀態、觀察實際狀態、算出差距、做一個動作縮小差距，然後重來。它不在乎差距是怎麼產生的（有人刪了 Pod、節點故障、使用者改了副本數），也不記得上一次做了什麼，只看現在。所以重複執行也安全，元件重新啟動之後重新讀一次就能接著做；這就是 KUB01 說的期望狀態與自我修復在程式裡的樣子。scheduler 與 controller manager 有多份時，只有透過 Lease 選出的 leader 在工作，其他份待命。' },
        { type: 'callout', tone: 'note', title: '事件也是 API 物件', text: '`kubectl get events` 看到的 Scheduled 是 scheduler 寫的，Pulling、Pulled、Created、Started 是那台節點的 kubelet 寫的：事件同樣經過 API server 存進 etcd（預設只保留一小時左右）。`kubectl describe pod` 的 Events 段落還有 From 欄（default-scheduler、kubelet），讀事件的來源與 REASON，就能知道 Pod 卡在哪一個元件。' },
      ],
    },
    {
      id: 'kub02-s-trace', title: '追蹤 kubectl apply 之後發生的事',
      blocks: [
        { type: 'p', text: '把前面的元件串起來，看一個沒有任何控制器管理的 Pod 從 YAML 檔變成執行中的容器。在終端機上，apply 立刻印出 created，Pod 已經有節點與 IP，STATUS 卻是 ContainerCreating；`kubectl wait` 等到 Ready 條件成立；事件依序記錄 scheduler 的 Scheduled 與 kubelet 的 Pulling、Pulled、Created、Started。同一個檔案再 apply 一次是 unchanged：期望狀態沒有變，就什麼也不做。' },
        { type: 'example', id: 'kub02-apply' },
        { type: 'p', text: '下面的情境把同一次 apply 拆成訊息，右邊的表是 etcd 裡的紀錄與 node-02 的 kubelet 所知道的 Pod。逐步看每一則訊息是誰送給誰，以及每一步之後 etcd 改了什麼。' },
        { type: 'example', id: 'kub02-apply-trace' },
        { type: 'list', ordered: true, items: [
          'kubectl → API server：GET（404），再 POST；經過認證、授權、admission 與驗證後寫進 etcd，phase Pending、沒有節點，kubectl 印出 created 就結束。',
          'API server → controller manager、scheduler：watch 事件 ADDED。沒有控制器擁有這個 Pod；scheduler 過濾、評分後選出 node-02。',
          'scheduler → API server：POST binding；API server 把 spec.nodeName 寫進 etcd。',
          'API server → node-02 的 kubelet：watch 事件，Pod 派到了 node-02。',
          'kubelet → containerd（CRI）：RunPodSandbox、PullImage、CreateContainer、StartContainer。',
          'kubelet → API server：PATCH status（Running、Pod IP、Ready）；寫進 etcd 之後，kubectl wait 的 watch 收到事件而結束。',
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：apply 印出 created，程式就已經在跑了', text: 'created 只代表 API server 接受了這個 Pod 並寫進 etcd。之後的排程、拉取 Image、啟動容器都是其他元件非同步完成的，任何一步都可能失敗：沒有節點放得下（Pending）、Image 名稱打錯（ImagePullBackOff）、程式一啟動就結束（CrashLoopBackOff）。腳本與 CI 在 apply 之後要用 `kubectl wait`（或之後的 `kubectl rollout status`）確認真的就緒，而不是 sleep 一個猜的秒數。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [applyTrace],
    exercises: [
      { id: 'kub02-net-bind', task: 'field', scene: 'kub02-apply-trace', message: 'bind', layer: 'application', field: '目標節點', title: 'scheduler 把 Pod 綁到哪一台節點',
        statement: '在「kubectl apply 之後」情境中，scheduler 送給 API server 的 binding 請求，應用層標頭的「目標節點」是什麼？',
        hints: ['scheduler 先過濾：哪一台節點有 Pod 不能容忍的 taint？', '剩下的節點裡，哪一台已經有 report、哪一台比較空？'],
        explanation: 'cp-01 帶著 control-plane 的 NoSchedule taint，catalog 沒有對應的 toleration，在過濾階段就被淘汰；node-01 與 node-02 都放得下，但 node-01 已經有 report，node-02 比較空，評分較高，所以 binding 的 target 是 node-02。scheduler 只是把這個決定寫回 API server，之後由 node-02 的 kubelet 從自己的 watch 得知。',
        mistakes: [
          { answer: { value: 'cp-01' }, why: 'cp-01 是控制平面節點，有 node-role.kubernetes.io/control-plane:NoSchedule 的 taint，一般的 Pod 在過濾階段就被排除。' },
          { answer: { value: 'node-01' }, why: 'node-01 放得下，但它已經執行 report，node-02 比較空，評分較高。' },
          { answer: { value: 'kube-scheduler' }, why: 'kube-scheduler 是做決定的元件，不是 Pod 要去的地方；binding 的 target 是一個 Node。' },
        ] },
      { id: 'kub02-net-etcd', task: 'table', scene: 'kub02-apply-trace', message: 'created', node: 'etcd', table: '儲存的 Pod', row: '/registry/pods/default/catalog', column: 'spec.nodeName',
        title: 'kubectl 印出 created 時，Pod 有節點了嗎',
        statement: '同一個情境裡，API server 回覆 201 Created（kubectl 印出 pod/catalog created）的時候，etcd「儲存的 Pod」表中 catalog 那一列的 spec.nodeName 是什麼？',
        hints: ['201 Created 是在 scheduler 收到 watch 事件之前還是之後？', '寫入 spec.nodeName 的是哪一則訊息？'],
        explanation: 'API server 把通過檢查的 Pod 寫進 etcd 之後就回覆 201，這時還沒有任何元件替它選節點，所以 spec.nodeName 是空的、phase 是 Pending。scheduler 要等之後的 watch 事件才看到它，送出 binding 後 spec.nodeName 才變成 node-02。這正是「created 不等於正在執行」的證據。',
        mistakes: [
          { answer: { cell: 'node-02' }, why: 'node-02 是 scheduler 之後才寫入的（persist-bind）；回覆 201 的當下 scheduler 還沒看到這個 Pod。' },
          { answer: { cell: 'cp-01' }, why: 'API server 跑在 cp-01，不代表 Pod 被放在 cp-01；而且回覆 201 時 Pod 還沒有任何節點。' },
        ] },
      { id: 'kub02-net-kubelet', task: 'field', scene: 'kub02-apply-trace', message: 'watch-kubelet', layer: 'application', field: '篩選條件', title: 'kubelet 怎麼知道有工作',
        statement: '同一個情境裡，node-02 的 kubelet 從自己的 watch 收到 catalog 的事件。這個 watch 的「篩選條件」是什麼？（寫成 欄位=值）',
        hints: ['API server 會主動連到 kubelet 派工嗎？', '每台節點的 kubelet 只關心哪些 Pod？'],
        explanation: 'kubelet 對 API server 開的 watch 只訂閱 spec.nodeName 等於自己節點名稱的 Pod，也就是 spec.nodeName=node-02。scheduler 寫入 binding 之後，這個 Pod 就符合條件，事件沿著 kubelet 自己開的連線送來；API server 不會主動連到 kubelet 派工，node-01 的 kubelet 也看不到它。',
        mistakes: [
          { answer: { value: 'spec.nodeName=node-01' }, why: 'node-01 的 kubelet 才用這個條件；catalog 被綁到 node-02，這則事件是送給 node-02 的 kubelet。' },
          { answer: { value: 'metadata.name=catalog' }, why: '這是 kubectl wait 為了等 catalog 開的 watch；kubelet 不知道會有哪些 Pod，它依節點篩選。' },
          { answer: { value: 'status.phase=Pending' }, why: 'kubelet 不是看 phase 找工作，而是看 Pod 有沒有被派到自己這台節點（spec.nodeName）。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'kub02-q1', prompt: '叢集裡哪一個元件是唯一直接讀寫 etcd 的？',
      options: ['kube-scheduler', 'kubelet', 'kube-apiserver', 'kubectl'],
      answer: 2,
      explanation: 'kube-apiserver 是 etcd 唯一的客戶端，所有元件都經過它的認證、授權與 admission 才能改變狀態。scheduler 把 binding 送給 API server，不直接寫 etcd；kubelet 透過 API server watch Pod 與回報 status；kubectl 只連 API server 的 6443 埠，碰不到 etcd。',
    },
    {
      id: 'kub02-q2', prompt: '`kubectl apply -f catalog.yaml` 印出 `pod/catalog created` 的那一刻，哪一個敘述正確？',
      options: ['API server 已驗證並把 Pod 寫進 etcd，排程、拉 Image 與啟動都還沒發生', 'Pod 已經排到某個節點，容器也已經在那個節點上啟動並開始執行', 'kubectl 已經以 SSH 登入選好的節點，並在那裡啟動容器', 'scheduler 已經選好節點，並把節點名稱與 Pod IP 直接回覆給 kubectl'],
      answer: 0,
      explanation: '201 Created 只表示請求通過檢查、Pod 已存進 etcd，這時 spec.nodeName 還是空的。容器要等 scheduler 綁定、kubelet 經由 CRI 啟動之後才執行；kubectl 從不登入節點；scheduler 也不和 kubectl 說話，它的決定寫回 API server。',
    },
    {
      id: 'kub02-q3', prompt: '一個有 5 個成員的 etcd 叢集，最多可以同時壞幾台而仍然能寫入？',
      options: ['1 台', '2 台', '3 台', '4 台'],
      answer: 1,
      explanation: '寫入需要過半數 ⌊5/2⌋ + 1 = 3 個成員確認，所以最多壞 2 台。只壞 1 台太保守（那是 3 個成員的容錯）；壞 3 台只剩 2 台，不到過半數，etcd 無法寫入；壞 4 台更不可能。',
    },
    {
      id: 'kub02-q4', prompt: 'scheduler 決定讓 Pod catalog 跑在 node-02 之後，它實際做了什麼？',
      options: ['以 SSH 連到 node-02，在那台機器上直接執行 containerd 拉 Image 並啟動容器', '送出 binding 把 spec.nodeName 設為 node-02，由 node-02 的 kubelet 經 watch 得知', '直接呼叫 node-02 上 kubelet 的 10250 埠，要求它立刻建立並啟動這個 Pod 的容器', '跳過 API server，自己把 nodeName 寫進 etcd 的 /registry 下的 Pod 物件，再通知 kubelet'],
      answer: 1,
      explanation: '元件之間不直接連線：scheduler 只對 API server 送出 Binding，寫入 spec.nodeName，kubelet 依 spec.nodeName=node-02 watch 而收到事件。scheduler 不會 SSH 或呼叫 containerd；10250 是 API server 為 logs、exec 連 kubelet 用的；只有 API server 能寫 etcd。',
    },
    {
      id: 'kub02-q5', prompt: 'kubeadm 叢集裡的 kube-apiserver、etcd 等以 Pod 的形式出現在 kube-system。在 scheduler 與 API server 都還不存在時，它們是怎麼啟動的？',
      options: ['kube-scheduler 先把它們排到 cp-01，再由 cp-01 的 kubelet 依序啟動它們', 'controller manager 的 Deployment 控制器依照 kube-system 的設定建立', '安裝時由管理員對 kube-system 執行 kubectl apply 建立', 'cp-01 的 kubelet 直接執行 /etc/kubernetes/manifests 的 static pod'],
      answer: 3,
      explanation: 'static pod 由 kubelet 讀本機目錄的 manifest 直接執行，不需要 scheduler 與 API server，所以能用來啟動控制平面本身；它們的 owner 是 Node。scheduler 自己都還沒啟動，無法排程；它們不屬於 Deployment；kubectl apply 需要一個已經在運作的 API server。',
    },
    {
      id: 'kub02-q6', prompt: '哪一個說法最能描述 Kubernetes 控制器（controller）的運作方式？',
      options: ['watch 物件、比較期望與實際狀態，把縮小差距的變更寫回 API server', '直接連到各節點的 kubelet，下指令啟動或停止容器，再把結果寫進 etcd', '只在使用者執行 kubectl 時被呼叫一次，完成那次要求後就結束', '把自己負責的物件存在自己的資料庫裡，定期再同步回 API server'],
      answer: 0,
      explanation: '控制器是調和迴圈：從 watch 得知變化，只看現在的期望與實際狀態，寫回 API server，所以重複執行也安全。控制器不聯絡 kubelet，kubelet 自己 watch；它一直在跑，不靠 kubectl 觸發；叢集的狀態只存在 etcd，控制器沒有自己的資料庫。',
    },
    {
      id: 'kub02-q7', prompt: 'node-02 上的 kubelet 程式停止了（機器本身還開著）。最直接的結果是什麼？',
      options: ['node-02 上的所有容器隨 kubelet 一起立刻停止，Pod 狀態變成 Failed', 'etcd 失去 quorum，整個叢集從此無法寫入任何物件', 'Lease 心跳停止，一段時間後 node-02 被標成 NotReady，容器可能仍在跑', 'scheduler 也跟著停止，叢集裡所有新建的 Pod 都停在 Pending'],
      answer: 2,
      explanation: '心跳是 kubelet 寫的，停止後 Node 控制器在逾時後把節點標成 NotReady，之後依 toleration 驅逐 Pod。容器由 containerd 與 shim 持有，不會因 kubelet 停止而立刻結束；etcd 在控制平面，和工作節點的 kubelet 無關；scheduler 也在控制平面，只會避開這台節點。',
    },
    {
      id: 'kub02-q8', prompt: '控制平面的機器全部毀損，要把叢集的所有物件救回來，最關鍵的備份是什麼？',
      options: ['每個工作節點的 /var/lib/containerd', '管理員的 `~/.kube/config`', '每個 Pod 的日誌', 'etcd 的快照，連同控制平面的憑證，存放在叢集之外'],
      answer: 3,
      explanation: '所有物件（Deployment、Service、Secret…）只存在 etcd，有了快照與憑證才能重建同一個叢集。containerd 的目錄只有 Image 與容器的執行資料，沒有叢集的紀錄；kubeconfig 只是連線設定；日誌記錄發生過的事，不是物件本身。',
    },
  ],
  terminal: {
    machines: [ws],
    examples: [
      {
        id: 'kub02-client', title: 'kubectl 連到哪裡、以誰的身分', machine: 'kub02-ws',
        description: '`kubectl version` 的 Server Version 來自 API server；`config get-contexts` 與 `config view` 顯示 kubeconfig 裡唯一的 context：叢集 kubernetes（API server https://10.0.0.50:6443）與使用者 kubernetes-admin（憑證欄位以 DATA+OMITTED 隱藏）。`cluster-info` 印出控制平面的位址，`api-resources` 的前幾列是核心群組（v1）的資源。',
        steps: [
          { command: 'kubectl version', output: 'Client Version: v1.32.3\nKustomize Version: v5.5.0\nServer Version: v1.32.3' },
          { command: 'kubectl config get-contexts', output: 'CURRENT   NAME                          CLUSTER      AUTHINFO           NAMESPACE\n*         kubernetes-admin@kubernetes   kubernetes   kubernetes-admin   ' },
          { command: 'kubectl config view', output: 'apiVersion: v1\nclusters:\n- cluster:\n    certificate-authority-data: DATA+OMITTED\n    server: https://10.0.0.50:6443\n  name: kubernetes\ncontexts:\n- context:\n    cluster: kubernetes\n    user: kubernetes-admin\n  name: kubernetes-admin@kubernetes\ncurrent-context: kubernetes-admin@kubernetes\nkind: Config\npreferences: {}\nusers:\n- name: kubernetes-admin\n  user:\n    client-certificate-data: DATA+OMITTED\n    client-key-data: DATA+OMITTED' },
          { command: 'kubectl cluster-info', output: 'Kubernetes control plane is running at https://10.0.0.50:6443\nCoreDNS is running at https://10.0.0.50:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy\n\nTo further debug and diagnose cluster problems, use \'kubectl cluster-info dump\'.' },
          { command: 'kubectl api-resources | head -7', output: 'NAME                       SHORTNAMES   APIVERSION             NAMESPACED   KIND\nconfigmaps                 cm           v1                     true         ConfigMap\nendpoints                  ep           v1                     true         Endpoints\nevents                     ev           v1                     true         Event\nnamespaces                 ns           v1                     false        Namespace\nnodes                      no           v1                     false        Node\npersistentvolumeclaims     pvc          v1                     true         PersistentVolumeClaim' },
        ],
      },
      {
        id: 'kub02-nodes', title: '三台節點、控制平面的 taint 與 kubelet 回報的 Conditions', machine: 'kub02-ws',
        description: '`get nodes -o wide` 顯示 cp-01 是控制平面，三台都是 Ready、以 containerd 執行容器；cp-01 的 taint 讓一般的 Pod 不會排到它上面。`describe node` 的 Conditions 是 node-02 的 kubelet 回報的心跳與資源狀態。',
        steps: [
          { command: 'kubectl get nodes -o wide', output: 'NAME      STATUS    ROLES           AGE       VERSION   INTERNAL-IP   EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION     CONTAINER-RUNTIME\ncp-01     Ready     control-plane   30d       v1.32.3   10.0.0.50     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24\nnode-01   Ready     <none>          30d       v1.32.3   10.0.0.51     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24\nnode-02   Ready     <none>          30d       v1.32.3   10.0.0.52     <none>        Ubuntu 24.04.1 LTS   6.8.0-48-generic   containerd://1.7.24' },
          { command: 'kubectl get node cp-01 -o jsonpath={.spec.taints}', output: '[{"effect":"NoSchedule","key":"node-role.kubernetes.io/control-plane"}]' },
          { command: 'kubectl describe node node-02 | grep -A6 Conditions', output: 'Conditions:\n  Type             Status  LastHeartbeatTime                 LastTransitionTime                Reason                       Message\n  ----             ------  -----------------                 ------------------                ------                       -------\n  MemoryPressure   False   Tue, 24 Nov 2026 10:00:00 +0000   Sun, 25 Oct 2026 10:00:00 +0000   KubeletHasSufficientMemory   kubelet has sufficient memory available\n  DiskPressure     False   Tue, 24 Nov 2026 10:00:00 +0000   Sun, 25 Oct 2026 10:00:00 +0000   KubeletHasNoDiskPressure     kubelet has no disk pressure\n  PIDPressure      False   Tue, 24 Nov 2026 10:00:00 +0000   Sun, 25 Oct 2026 10:00:00 +0000   KubeletHasSufficientPID      kubelet has sufficient PID available\n  Ready            True    Tue, 24 Nov 2026 10:00:00 +0000   Sun, 25 Oct 2026 10:00:00 +0000   KubeletReady                 kubelet is posting ready status' },
        ],
      },
      {
        id: 'kub02-system', title: 'kube-system：static pod、Deployment 與 DaemonSet', machine: 'kub02-ws',
        description: '控制平面的四個元件都在 cp-01、使用節點的 IP（host network）；etcd-cp-01 的 owner 是 Node，表示它是 kubelet 管的 static pod。coredns 是 2 份的 Deployment，kube-proxy 是每台節點一份的 DaemonSet。API server 的 Image 版本和 `kubectl version` 的 Server Version 相同。',
        steps: [
          { command: 'kubectl get pods -n kube-system -o wide', output: 'NAME                            READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncoredns-7hd6wmc4rw-f2mnz        1/1       Running   0          30d       10.244.0.2   cp-01     <none>           <none>\ncoredns-7hd6wmc4rw-jbj7l        1/1       Running   0          30d       10.244.0.3   cp-01     <none>           <none>\netcd-cp-01                      1/1       Running   0          30d       10.0.0.50    cp-01     <none>           <none>\nkube-apiserver-cp-01            1/1       Running   0          30d       10.0.0.50    cp-01     <none>           <none>\nkube-controller-manager-cp-01   1/1       Running   0          30d       10.0.0.50    cp-01     <none>           <none>\nkube-proxy-cclcd                1/1       Running   0          30d       10.0.0.50    cp-01     <none>           <none>\nkube-proxy-f7kh4                1/1       Running   0          30d       10.0.0.51    node-01   <none>           <none>\nkube-proxy-q6g8s                1/1       Running   0          30d       10.0.0.52    node-02   <none>           <none>\nkube-scheduler-cp-01            1/1       Running   0          30d       10.0.0.50    cp-01     <none>           <none>' },
          { command: 'kubectl get pod etcd-cp-01 -n kube-system -o jsonpath={.metadata.ownerReferences[0].kind}', output: 'Node' },
          { command: 'kubectl get ds,deploy -n kube-system', output: 'NAME                        DESIRED   CURRENT   READY     UP-TO-DATE   AVAILABLE   NODE SELECTOR            AGE\ndaemonset.apps/kube-proxy   3         3         3         3            3           kubernetes.io/os=linux   30d\n\nNAME                      READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/coredns   2/2       2            2           30d' },
          { command: 'kubectl get pod kube-apiserver-cp-01 -n kube-system -o jsonpath={.spec.containers[0].image}', output: 'registry.k8s.io/kube-apiserver:v1.32.3' },
        ],
      },
      {
        id: 'kub02-apply', title: 'apply 之後：ContainerCreating、wait 與事件', machine: 'kub02-ws',
        description: 'default 命名空間只有 report（在 node-01）。apply catalog.yaml 後立刻查看，Pod 已經被排到 node-02、有了 IP，但 Image 還在拉取（4 秒），所以是 ContainerCreating。`kubectl wait` 等到 Ready；`kubectl events` 依序列出 scheduler 與 kubelet 寫下的事件。再 apply 一次，期望狀態沒有變，結果是 unchanged。',
        steps: [
          { command: 'kubectl get pods -o wide', output: 'NAME      READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nreport    1/1       Running   0          40m       10.244.1.2   node-01   <none>           <none>' },
          { command: 'cat k8s/catalog.yaml', output: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: catalog\n  labels:\n    app: catalog\nspec:\n  containers:\n  - name: catalog\n    image: shop/catalog:2.4\n    ports:\n    - containerPort: 8080' },
          { command: 'kubectl apply -f k8s/catalog.yaml', output: 'pod/catalog created' },
          { command: 'kubectl get pod catalog -o wide', output: 'NAME      READY     STATUS              RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog   0/1       ContainerCreating   0          0s        10.244.2.2   node-02   <none>           <none>' },
          { command: 'kubectl wait --for=condition=Ready pod/catalog --timeout=60s', output: 'pod/catalog condition met' },
          { command: 'kubectl get pod catalog -o wide', output: 'NAME      READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog   1/1       Running   0          4s        10.244.2.2   node-02   <none>           <none>' },
          { command: 'kubectl events --for pod/catalog', output: 'LAST SEEN   TYPE      REASON      OBJECT        MESSAGE\n4s          Normal    Scheduled   Pod/catalog   Successfully assigned default/catalog to node-02\n4s          Normal    Pulling     Pod/catalog   Pulling image "shop/catalog:2.4"\n0s          Normal    Pulled      Pod/catalog   Successfully pulled image "shop/catalog:2.4" in 4s (4s including waiting). Image size: 48300000 bytes.\n0s          Normal    Created     Pod/catalog   Created container: catalog\n0s          Normal    Started     Pod/catalog   Started container catalog' },
          { command: 'kubectl apply -f k8s/catalog.yaml', output: 'pod/catalog unchanged' },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub02-x-node', title: '找出 Pod 被排到哪一台節點', machine: 'kub02-ws',
        statement: '同事說 report 這個 Pod 跑得很慢，想先檢查它所在的那台機器。請用 kubectl 查出 default 命名空間的 Pod report 被 scheduler 排到哪一台節點，最後一個指令只印出節點的名稱（一行，例如 `node-09`）。',
        checks: [{ kind: 'output', fromCommand: '^kubectl get\\b' }],
        solution: ['kubectl get pods -o wide', 'kubectl get pod report -o jsonpath={.spec.nodeName}'],
        variants: [EARLIER_CACHE, OTHER_NAMES],
        mistakes: [
          { commands: ['kubectl get pods -o wide'], why: '表格的 NODE 欄看得到答案，但印出的是整張表；題目要最後一個指令只印出節點名稱，可以用 `-o jsonpath={.spec.nodeName}`。' },
          { commands: ['kubectl get pod report -o jsonpath={.status.hostIP}'], why: 'hostIP 是節點的 IP 位址（10.0.0.51 之類），不是節點的名稱。' },
          { commands: ['kubectl get nodes -o name'], why: '這列出叢集的所有節點，看不出 report 在哪一台；Pod 被派到哪裡記在 Pod 自己的 spec.nodeName。' },
          { commands: ['kubectl get pods -o wide', 'echo node-01'], why: '直接打出這次看到的名稱：在另一個叢集或另一次排程中 report 可能在別台，答案必須由查詢的指令印出。' },
        ],
        hints: ['`kubectl get pods -o wide` 多了 IP 與 NODE 兩欄。', 'scheduler 的決定寫在 Pod 的 `spec.nodeName`；`-o jsonpath={.spec.nodeName}` 只印出它。'],
        explanation: 'scheduler 選好節點之後，把節點名稱寫進 Pod 的 spec.nodeName（binding），`kubectl get pods -o wide` 的 NODE 欄與 `-o jsonpath={.spec.nodeName}` 讀的都是它。答案取決於當時叢集的狀態：cp-01 有 NoSchedule 的 taint 被排除，其他節點中較空的那台得分較高，例如 cache 先建立、佔了 node-01 的那個早上，report 就被排到 node-02。要找的是名稱，不是 hostIP。',
      },
      {
        id: 'kub02-x-apply', title: '建立 search 並等它真的就緒', machine: 'kub02-ws',
        statement: '`~/k8s/search.yaml` 描述了搜尋服務的 Pod search（標籤 app=search）。請用 kubectl 依這個檔案建立它，並等到它真的就緒（Running、容器 Ready）才結束；不要用猜的秒數 sleep，讓 kubectl 替你等，最長等 60 秒。',
        checks: [
          { kind: 'kube-pod', name: 'search', status: 'Running', ready: true },
          { kind: 'kube-object', resource: 'Pod', name: 'search', labels: { app: 'search' }, fields: [{ path: '.spec.containers[0].image', equals: 'shop/search:1.8' }] },
        ],
        solution: ['kubectl apply -f k8s/search.yaml', 'kubectl wait --for=condition=Ready pod/search --timeout=60s'],
        variants: [SLOW_PULL],
        mistakes: [
          { commands: ['kubectl apply -f k8s/search.yaml'], why: 'apply 只把 Pod 寫進 etcd 就結束了；這時 Image 還在拉取，Pod 是 ContainerCreating，還沒有就緒。' },
          { commands: ['kubectl apply -f k8s/search.yaml', 'sleep 5'], why: 'shop/search:1.8 要拉 10 秒（Registry 慢時更久），猜的秒數不夠就還是 ContainerCreating；用 `kubectl wait` 等到條件成立。' },
          { commands: ['kubectl apply -f k8s/search.yaml --dry-run=client', 'kubectl wait --for=condition=Ready pod/search --timeout=60s'], why: '`--dry-run=client` 只在 kubectl 這邊檢查，不會送給 API server，叢集裡根本沒有 search，wait 也只會說找不到。' },
          { commands: ['kubectl run search --image=shop/search:1.8', 'kubectl wait --for=condition=Ready pod/search --timeout=60s'], why: '`kubectl run` 自己產生一份 Pod，標籤是 run=search 而不是檔案裡的 app=search，也沒有宣告連接埠；題目要的是依 search.yaml 建立。' },
        ],
        hints: ['先 `cat k8s/search.yaml` 看看它描述了什麼，再用 `kubectl apply -f` 交給 API server。', '`kubectl wait --for=condition=Ready pod/名稱 --timeout=60s` 會等到 Ready 條件成立才結束。'],
        explanation: '`kubectl apply -f k8s/search.yaml` 讓 API server 驗證並把 Pod 存進 etcd，接著 scheduler 綁定節點、那台節點的 kubelet 經由 containerd 拉取 shop/search:1.8 並啟動容器，這些都在 apply 結束之後才發生。`kubectl wait --for=condition=Ready pod/search --timeout=60s` 以 watch 等到 kubelet 回報 Ready 才結束，拉取要 10 秒或 40 秒都一樣正確；sleep 固定秒數則可能太短。',
      },
    ],
  },
};
