/*
 * KUB04 Deployments and ReplicaSets (KUB-1, terminal-sim; the blueprint's cluster-sim activity as terminal content). A
 * terminal lesson on the workloads profile (engine stages E32–E34): the made-up shop team's workstation ops-ws (user yuki)
 * with kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02). catalog runs as a
 * Deployment of three pods (a tcpSocket readiness probe makes new replicas 0/1 for five seconds), and a bare pod
 * catalog-manual with the same app=catalog label shows that a Deployment's ReplicaSet does not adopt it (its selector
 * includes pod-template-hash). Covered: the Deployment → ReplicaSet → Pod chain (ownerReferences, -o wide SELECTOR,
 * pod-template-hash, Controlled By), labels and selectors (-l with equality, set-based and existence requirements,
 * --show-labels, -L, kubectl label --overwrite, key-), the selector-must-match-template and immutable-selector errors,
 * scaling (kubectl scale, replicas in the manifest + apply, imperative drift, scaling the ReplicaSet directly), which pod
 * goes on scale-down, self-healing (delete a pod; relabel a pod out of the selector, then back in), cascading deletion, and
 * only a preview of set image (rolling updates, history and undo are KUB11). Pod and ReplicaSet names are hashes: commands
 * read them with kubectl get (jsonpath, -o name), never hard-code them. The control plane's internals are prose only.
 * Hosts, users, images and the cluster are made up. Every transcript output was produced by replaying it on the engine.
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
const TOOLS = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The shop's services: each keeps running, logs one line, and handles SIGTERM in a second (graceful deletion takes 1 s).
const service = (name: string, port: number, log: string, created: string): TerminalImage => ({
  name, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: TOOLS,
  logs: [log], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } },
});
const IMAGES: TerminalImage[] = [
  service('shop/catalog:2.1', 8080, 'catalog 2.1 listening on :8080', '2026-11-18 09:00:00'),
  service('shop/catalog:2.2', 8080, 'catalog 2.2 listening on :8080', '2026-11-23 09:00:00'),
  service('shop/frontend:1.6', 3000, 'frontend 1.6 listening on :3000', '2026-11-20 09:00:00'),
  service('shop/cart:1.0', 8081, 'cart 1.0 listening on :8081', '2026-11-21 09:00:00'),
  service('shop/report:3.0', 9000, 'report 3.0 waiting for jobs', '2026-11-19 09:00:00'),
];
const WORKERS = ['node-01', 'node-02'];

const deployment = (name: string, image: string, replicas: number, labels: Record<string, string>, port: number, container: string[] = []) => {
  const l = Object.entries(labels);
  return yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, '  labels:', ...l.map(([k, v]) => `    ${k}: ${v}`), 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`,
    '  template:', '    metadata:', '      labels:', ...l.map(([k, v]) => `        ${k}: ${v}`), '    spec:', '      containers:', `      - name: ${name}`, `        image: ${image}`, '        ports:', `        - containerPort: ${port}`,
    ...container.map(x => `        ${x}`));
};
// catalog is ready 5 s after a container starts (KUB03's readiness probe), so new replicas are 0/1 for a moment.
const READINESS = ['readinessProbe:', '  tcpSocket:', '    port: 8080', '  initialDelaySeconds: 5', '  periodSeconds: 5'];
const CATALOG_YAML = deployment('catalog', 'shop/catalog:2.1', 3, { app: 'catalog', tier: 'backend' }, 8080, READINESS);
const FRONTEND_YAML = deployment('frontend', 'shop/frontend:1.6', 2, { app: 'frontend', tier: 'web' }, 3000);
// Someone ran a pod by hand last week to test catalog: it has the label app=catalog but no controller.
const MANUAL_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: catalog-manual', '  labels:', '    app: catalog', '    tier: backend', 'spec:', '  containers:', '  - name: catalog', '    image: shop/catalog:2.1');
// A Deployment whose selector does not match its template labels (search vs searcher).
const MISMATCH_YAML = deployment('search', 'shop/catalog:2.1', 2, { app: 'search' }, 8080).replace('      labels:\n        app: search', '      labels:\n        app: searcher');
// catalog.yaml with a changed selector: apply is refused, the selector is immutable.
const RESELECT_YAML = CATALOG_YAML.replace('    matchLabels:\n      app: catalog', '    matchLabels:\n      app: catalog\n      tier: backend');

const kubeOf = (manifests: TerminalKube['manifests']): TerminalKube => ({
  images: [{ name: 'shop/catalog:2.1', nodes: WORKERS }, { name: 'shop/catalog:2.2', seconds: 3 }, { name: 'shop/frontend:1.6', seconds: 4 }, { name: 'shop/cart:1.0', seconds: 4 }, { name: 'shop/report:3.0', nodes: WORKERS }],
  manifests,
});
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'workloads', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  docker: { images: IMAGES },
  kube,
});
const CATALOG_AT_BOOT = { text: CATALOG_YAML, at: '2026-11-24 09:40:00', file: 'catalog.yaml' };

const WS = workstation('kub04-ws', 'ops-ws（shop 團隊的工作站：catalog 已經在叢集上執行）', [
  file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), file('/home/yuki/shop/frontend.yaml', FRONTEND_YAML), file('/home/yuki/shop/search.yaml', MISMATCH_YAML),
  file('/home/yuki/shop/catalog-reselect.yaml', RESELECT_YAML),
], kubeOf([{ text: MANUAL_YAML, at: '2026-11-17 15:20:00', file: 'manual.yaml' }, CATALOG_AT_BOOT]));

// Exercise 1: an empty shop folder; the cluster runs catalog only.
const CART = workstation('kub04-cart', 'ops-ws（要上線購物車服務 cart）', [], kubeOf([CATALOG_AT_BOOT]));
const CART_YAML = yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: cart', 'spec:', '  replicas: 3', '  selector:', '    matchLabels:', '      app: cart', '  template:', '    metadata:', '      labels:',
  '        app: cart', '        tier: backend', '    spec:', '      containers:', '      - name: cart', '        image: shop/cart:1.0', '        ports:', '        - containerPort: 8081');

// Exercises 2 and 3: catalog with three replicas, its manifest and the on-call sheet's replica count.
const capacity = (n: number) => file('/home/yuki/shop/capacity.txt', `${n}\n`);
const OPS = workstation('kub04-ops', 'ops-ws（活動前的 catalog：3 個副本）', [file('/home/yuki/shop/catalog.yaml', CATALOG_YAML), capacity(5)], kubeOf([CATALOG_AT_BOOT]));

// Exercise 4: a pod made by hand, later adopted by one of two hand-written ReplicaSets (the variants move it).
const reportPod = (track: string) => yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: report-manual', '  labels:', '    app: report', `    track: ${track}`, 'spec:', '  containers:', '  - name: report', '    image: shop/report:3.0');
const reportRs = (name: string, track: string, replicas: number) => yaml('apiVersion: apps/v1', 'kind: ReplicaSet', 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', '      app: report',
  `      track: ${track}`, '  template:', '    metadata:', '      labels:', '        app: report', `        track: ${track}`, '    spec:', '      containers:', '      - name: report', '        image: shop/report:3.0');
const reportKube = (track: string, stable: string, canary: string) => kubeOf([
  { text: reportPod(track), at: '2026-11-23 16:00:00', file: 'report-manual.yaml' },
  { text: reportRs(stable, 'stable', 2), at: '2026-11-24 08:30:00', file: `${stable}.yaml` },
  { text: reportRs(canary, 'canary', 1), at: '2026-11-24 08:30:00', file: `${canary}.yaml` },
]);
const REPORT = workstation('kub04-report', 'ops-ws（report 的 Pod 被哪一個 ReplicaSet 收養了？）', [], reportKube('stable', 'report-stable', 'report-canary'));

const CATALOG_PODS = "$(kubectl get pods -l app=catalog,pod-template-hash -o jsonpath='{.items[0].metadata.name}')";

export const KUB04: LessonContent = {
  lessonId: 'KUB04',
  motivation: '上一堂課，shop 團隊把商品目錄服務 catalog 寫成一個 Pod 放上叢集。它跑得很好，直到某個晚上有人清理測試資源時順手 `kubectl delete pod` 刪錯了一個——之後再也沒有任何東西把它建回來，商品頁整晚都是錯誤。單獨的 Pod 就是這樣：它被刪除、它所在的節點故障、它被驅逐，Kubernetes 都不會替你補一個新的。真正上線的服務需要的是另一種說法：「我要 catalog 隨時都有三個在執行」，然後由叢集自己去維持這個數字。這就是 Deployment：你宣告期望的副本數與 Pod 的範本，Deployment 建立 ReplicaSet，ReplicaSet 依照標籤選擇器數著自己的 Pod，少了就建、多了就刪。這堂課在 shop 團隊的工作站 ops-ws 上，看 Deployment、ReplicaSet 與 Pod 三層物件怎麼由 ownerReferences 串起來、Label 與 Selector 怎麼決定「哪些 Pod 算是我的」、怎麼用 `kubectl scale` 或修改 manifest 調整副本數，以及刪掉一個 Pod、改掉一個 Pod 的標籤之後，叢集如何自動補上。學完之後，你能用 Deployment 讓應用持續保持指定的副本數，也能看懂它在背後做了什麼。',
  sections: [
    {
      id: 'kub04-s-why', title: '從一個 Pod 到「永遠有三個」',
      blocks: [
        { type: 'p', text: 'KUB03 直接建立的 Pod 沒有任何東西照顧它。kubelet 會依 `restartPolicy` 重新啟動當掉的容器，但如果整個 Pod 被刪除、節點故障、或 Pod 被驅逐，那個 Pod 就消失了，不會有人建一個新的。另外，一個 Pod 只有一份：要分擔流量、要在更新或維護時不中斷，都需要好幾個一模一樣的 Pod。' },
        { type: 'p', text: 'Kubernetes 的做法是「期望狀態」加上「控制器」。你寫下期望（catalog 要有 3 個副本、每個長這樣），存進 API server；kube-controller-manager 裡的控制器持續觀察實際狀態，和期望比較，有差距就動手調整，這個不斷「觀察、比較、行動」的過程叫做調和（reconciliation）。管理無狀態服務的兩個控制器就是本課的主角：' },
        { type: 'table', head: ['物件', '負責什麼', '通常由誰建立'], rows: [
          ['Pod', '一個或多個容器實際執行的單位，有自己的 IP', 'ReplicaSet（也可以手動建立，但沒人照顧）'],
          ['ReplicaSet', '讓符合選擇器的 Pod 剛好有 `replicas` 個：少了就用範本建立，多了就刪除', 'Deployment（很少自己寫）'],
          ['Deployment', '管理 ReplicaSet：副本數、Pod 範本的版本、換版時的策略與歷史', '你：寫 manifest 再 `kubectl apply`'],
        ] },
        { type: 'p', text: 'Deployment 的 manifest 屬於 `apps/v1` 這個 API 群組。`spec` 裡最重要的三個欄位：`replicas` 是期望的副本數（沒寫時是 1）；`selector` 說哪些 Pod 屬於它；`template` 是 Pod 的範本，裡面的 `metadata.labels` 與 `spec` 就是 KUB03 寫過的 Pod 內容，只是少了名稱——名稱由控制器產生。' },
        { type: 'table', head: ['欄位', '例子', '說明'], rows: [
          ['`apiVersion`、`kind`', '`apps/v1`、`Deployment`', 'Pod 是 `v1`；Deployment 與 ReplicaSet 在 `apps/v1`'],
          ['`metadata.name`、`metadata.labels`', '`catalog`、`app: catalog`', 'Deployment 自己的名稱與標籤（方便用 `-l` 找到它）'],
          ['`spec.replicas`', '`3`', '期望的 Pod 數量'],
          ['`spec.selector.matchLabels`', '`app: catalog`', '哪些 Pod 算是這個 Deployment 的；必須符合範本的標籤'],
          ['`spec.template.metadata.labels`', '`app: catalog`、`tier: backend`', '每個新 Pod 都會帶著的標籤'],
          ['`spec.template.spec`', '`containers`、`image`、`ports`、探針', '和 Pod 的 `spec` 一樣'],
        ] },
        { type: 'p', text: '下面在 ops-ws 上套用前端服務 frontend 的 Deployment（2 個副本）。剛套用時 `READY` 是 `0/2`：Pod 已經建立，但節點還在拉取 Image（模擬環境裡要 4 秒），容器還沒啟動。`kubectl rollout status` 會一直等到 Deployment 的副本都更新、都可用，再印出 successfully rolled out；它是腳本裡「等部署完成」的標準寫法。' },
        { type: 'example', id: 'kub04-apply' },
        { type: 'p', text: '`kubectl get deploy` 的欄位：`READY` 是就緒的副本數／期望數，`UP-TO-DATE` 是已經使用目前範本的副本數，`AVAILABLE` 是就緒而且維持了 `minReadySeconds`（預設 0）的副本數。`get rs` 的 `DESIRED`、`CURRENT`、`READY` 則是 ReplicaSet 的期望數、現有數與就緒數。注意兩個 Pod 被排到不同節點：排程器會分散負載，但並不保證一定分散（強制分散要用 affinity 或拓撲分散限制，這裡只在課文提到）。' },
        { type: 'callout', tone: 'note', title: 'kubectl create deployment 與 manifest', text: '`kubectl create deployment frontend --image=shop/frontend:1.6 --replicas=2` 也能建立 Deployment，它會自動用 `app=frontend` 當標籤與選擇器。這適合快速試驗；正式的服務請寫成 manifest 檔、放進版本控制，再用 `kubectl apply -f` 套用。這樣每個欄位都看得到、改動有紀錄，也可以加上 create deployment 無法設定的標籤、探針與資源限制。' },
      ],
    },
    {
      id: 'kub04-s-chain', title: 'Deployment → ReplicaSet → Pod：誰管誰',
      blocks: [
        { type: 'p', text: 'Deployment 不直接建立 Pod。它先建立一個 ReplicaSet，把副本數交給它；ReplicaSet 再依範本建立 Pod。名稱就透露了這層關係：' },
        { type: 'table', head: ['物件', '名稱的組成', '例子（模擬環境）'], rows: [
          ['Deployment', '你取的名稱', '`catalog`'],
          ['ReplicaSet', 'Deployment 名稱 + `-` + pod-template-hash', '`catalog-9zpmhnrl4t`'],
          ['Pod', 'ReplicaSet 名稱 + `-` + 5 個隨機字元', '`catalog-9zpmhnrl4t-6ltfc`'],
        ] },
        { type: 'p', text: 'pod-template-hash 是由 Pod 範本算出來的雜湊值。Deployment 控制器把它同時放進三個地方：ReplicaSet 的名稱、ReplicaSet 的選擇器（`app=catalog,pod-template-hash=…`）、以及每個 Pod 的標籤。它的用途是區分「同一個 Deployment 的不同範本版本」：範本一改（例如換 Image），就會算出新的雜湊、建立新的 ReplicaSet，新舊兩個 ReplicaSet 的選擇器因為雜湊不同而不會搶到彼此的 Pod。這些名稱每次建立都不同（模擬環境的算法也和真實叢集不同），所以指令裡永遠不要寫死，要從 `kubectl get` 讀出來，例如 `-o jsonpath=\'{.items[0].metadata.name}\'`。' },
        { type: 'p', text: '物件之間的「誰管誰」記錄在 `metadata.ownerReferences`：每個 Pod 有一筆指向它的 ReplicaSet（`controller: true`），ReplicaSet 有一筆指向它的 Deployment。`kubectl describe` 把它印成 `Controlled By:` 這一行。Kubernetes 的垃圾回收器也依它運作：擁有者不在了，依附它的物件就跟著刪除，所以刪掉 Deployment 時，它的 ReplicaSet 與 Pod 都會被清掉（自我修復那一節的範例最後示範）。' },
        { type: 'example', id: 'kub04-chain' },
        { type: 'p', text: '`-o wide` 的 SELECTOR 欄最能說明這條鏈：Deployment 的選擇器是你寫的 `app=catalog`，ReplicaSet 的選擇器多了 `pod-template-hash=…`。`custom-columns` 列出每個 Pod 的擁有者，三個由 ReplicaSet 管理，catalog-manual 的擁有者是 `<none>`——它是上週有人為了測試而手動建立的 Pod。ReplicaSet 的 `Replicas: 3 current / 3 desired` 也證實它只管自己建立的三個；它的 Annotations 記著 Deployment 寫下的期望數與 revision。' },
        { type: 'callout', tone: 'warning', title: '有一樣的標籤，不代表被 Deployment 管理', text: '很多人以為「手動建立一個帶 `app=catalog` 標籤的 Pod，Deployment 就會把它算進去」。事實上 Deployment 的 ReplicaSet 選擇器還要求 `pod-template-hash` 標籤，手動的 Pod 沒有這個標籤，所以不會被收養，Deployment 的 `READY 3/3` 也不包含它。但它會出現在 `kubectl get pods -l app=catalog` 的結果裡（4 個），之後 KUB05 的 Service 若只用 `app=catalog` 選擇後端，流量也會送到這個沒人照顧的測試 Pod。要找出這種 Pod，用 `-l \'app=catalog,!pod-template-hash\'` 或檢查 ownerReferences。相反地，自己寫的 ReplicaSet（選擇器沒有雜湊）會收養當時符合選擇器、又沒有擁有者的 Pod——最後一題練習就是這種情況。' },
      ],
    },
    {
      id: 'kub04-s-labels', title: 'Label 與 Selector：把資源連起來的膠水',
      blocks: [
        { type: 'p', text: '標籤（Label）是寫在 `metadata.labels` 的鍵值對，例如 `app: catalog`、`tier: backend`。Kubernetes 本身不賦予標籤任何意義，它們的力量來自選擇器（Selector）：ReplicaSet 用選擇器數自己的 Pod，Deployment 用選擇器找到屬於自己的 ReplicaSet 與 Pod，KUB05 的 Service 用選擇器決定流量送給誰，你用 `kubectl get -l` 篩選資源。鍵可以有前綴（`app.kubernetes.io/name` 這種 DNS 子網域加上 `/`），名稱部分與值都最多 63 個字元，只能用英數字、`-`、`_`、`.`，而且頭尾必須是英數字。' },
        { type: 'table', head: ['寫法（`-l`）', 'manifest 的寫法', '選到哪些'], rows: [
          ['`app=catalog`（或 `==`）', '`matchLabels: {app: catalog}`', 'app 的值是 catalog'],
          ['`app!=catalog`', '`{key: app, operator: NotIn, values: [catalog]}`', 'app 不是 catalog，包括沒有 app 標籤的'],
          ['`tier in (backend,web)`', '`{key: tier, operator: In, values: [backend, web]}`', 'tier 是其中之一'],
          ['`tier notin (backend)`', '`operator: NotIn`', 'tier 不在清單裡，包括沒有 tier 標籤的'],
          ['`pod-template-hash`', '`operator: Exists`', '有這個鍵（值不限）'],
          ['`!pod-template-hash`', '`operator: DoesNotExist`', '沒有這個鍵'],
        ] },
        { type: 'p', text: '多個條件用逗號連接，意思是「而且」；選擇器沒有「或」，要「或」只能在同一個鍵上用 `in`。含有 `!`、空白或括號的選擇器要用單引號包起來，避免 Shell 解讀。檢視與修改標籤的工具：`--show-labels` 在表格後面加上所有標籤，`-L app,tier` 把指定的標籤各成一欄；`kubectl label pod 名稱 owner=yuki` 加上標籤，改掉已經存在的鍵必須加 `--overwrite`（防止不小心蓋掉），`kubectl label pod 名稱 owner-` 移除標籤。' },
        { type: 'example', id: 'kub04-labels' },
        { type: 'p', text: '範例最後兩個錯誤是 Deployment 的兩條規則。第一，`spec.selector` 必須選得到 `spec.template.metadata.labels`：search.yaml 的選擇器是 `app: search`，範本卻寫成 `app: searcher`，Deployment 建出來的 Pod 不符合自己的選擇器，API server 直接拒絕（`selector` does not match template `labels`）。第二，在 `apps/v1` 裡 Deployment 的選擇器建立之後就不能修改（field is immutable）：改了選擇器，現有的 ReplicaSet 與 Pod 會突然「不屬於」它。真的要換選擇器，只能建立新的 Deployment（換名稱，或刪掉舊的再建立），所以第一次就要想好；常見的作法是選擇器只放穩定、能識別應用的標籤（如 `app`），版本、環境這類會變的標籤放在範本裡就好。' },
      ],
    },
    {
      id: 'kub04-s-scale', title: '調整副本數：kubectl scale 與修改 manifest',
      blocks: [
        { type: 'p', text: '改變副本數有兩種方式。命令式（imperative）：`kubectl scale deploy/catalog --replicas=5`，馬上生效、一行搞定。宣告式（declarative）：把 manifest 的 `replicas: 3` 改成 `5`，再 `kubectl apply -f catalog.yaml`。兩者對叢集的效果一樣：Deployment 的 `spec.replicas` 變成 5，它把 ReplicaSet 的期望數調成 5，ReplicaSet 再建兩個 Pod。差別在「真相存在哪裡」。' },
        { type: 'table', head: ['方式', '指令', '真相在哪裡', '之後再 apply 舊的 manifest'], rows: [
          ['命令式', '`kubectl scale deploy/catalog --replicas=6`', '只在叢集裡；manifest 還寫著 3', '副本數被改回 manifest 的 3（configured）'],
          ['宣告式', '改 manifest 的 `replicas`，再 `kubectl apply -f`', 'manifest 與叢集一致，可以放進版本控制', '`unchanged`，不會變動'],
        ] },
        { type: 'p', text: '命令式的改動造成叢集與 manifest 不一致（drift）。值班時臨時用 `kubectl scale` 擴充很常見，但如果沒有同步改回 manifest，下一次有人照 manifest `kubectl apply`（例如 CI/CD 部署新版），apply 比較 manifest 與叢集上的物件，發現 `replicas` 不同，就把它改回 manifest 寫的數字——活動期間的擴充就這樣悄悄消失。所以臨時擴充之後，要記得把數字寫回 manifest；或者讓擴縮交給自動擴縮器（KUB10 的 HPA）負責，那時 manifest 就不該再寫死 `replicas`。' },
        { type: 'p', text: '縮減時 ReplicaSet 要挑出多出來的 Pod 刪除，它會優先刪掉「比較不值得留」的：還沒排到節點的先於已經排到的；Pending 先於 Running；還沒就緒的先於就緒的；重新啟動次數多的先；比較新的先於比較舊的。因為新 Pod 還沒證明自己穩定，而舊 Pod 可能已經暖好快取。真實的控制器還會考慮同一個節點上的副本數與 `controller.kubernetes.io/pod-deletion-cost` 註解，模擬環境只做上面這幾條。被選中的 Pod 走正常的優雅終止（先送 SIGTERM，再等程式結束），會短暫顯示 Terminating。' },
        { type: 'example', id: 'kub04-scale' },
        { type: 'callout', tone: 'warning', title: '不要直接調整 Deployment 底下的 ReplicaSet', text: 'ReplicaSet 也能 `kubectl scale`，但 Deployment 管理的 ReplicaSet 由 Deployment 控制器決定期望數。範例裡把它縮成 1，ReplicaSet 先刪掉三個 Pod，Deployment 立刻發現 ReplicaSet 和自己的 `replicas: 4` 不一致，又把它調回去（`Scaled up replica set … from 1 to 4`），白白多了一輪刪除與建立，短時間內可用的副本也變少。擴縮永遠對 Deployment 做，或改 Deployment 的 manifest。' },
      ],
    },
    {
      id: 'kub04-s-heal', title: '自我修復：刪掉 Pod、改掉標籤',
      blocks: [
        { type: 'p', text: 'ReplicaSet 不記得「我建過哪幾個 Pod」，它每次調和時只問一件事：現在符合我選擇器、而且屬於我的活躍 Pod 有幾個？少於 `replicas` 就建立，多於就刪除。所以不論 Pod 是被誰刪掉、因為什麼消失，結果都一樣：它會補一個新的。新 Pod 是全新的物件——新的名稱、新的 IP，可能在另一個節點，容器從頭啟動——不是把原本的 Pod「重新啟動」。' },
        { type: 'p', text: '改標籤也會觸發同樣的機制。把一個 Pod 的 `app` 改成 `catalog-debug`，它不再符合 ReplicaSet 的選擇器，ReplicaSet 就釋放它（移除那一筆 ownerReference），數一數只剩兩個，再補一個。被釋放的 Pod 繼續執行，只是沒有擁有者了：這是保留現場除錯的好方法——服務維持三個副本，你可以慢慢看那個 Pod 的日誌、`kubectl exec` 進去檢查，查完再自己刪掉它。反過來，把標籤改回 `app=catalog`，ReplicaSet 會收養它，發現有四個，再依縮減的順序刪掉一個（通常是剛補上的那個）。' },
        { type: 'example', id: 'kub04-heal' },
        { type: 'table', head: ['發生了什麼', '誰處理', '結果'], rows: [
          ['容器當掉或 liveness 探針失敗', 'kubelet，依 Pod 的 `restartPolicy`', '同一個 Pod 裡重新啟動容器，RESTARTS 加一'],
          ['Pod 被 `kubectl delete`、被驅逐', 'ReplicaSet 控制器', '建立一個新名稱的 Pod'],
          ['Pod 的標籤改得不符合選擇器', 'ReplicaSet 控制器', '釋放舊 Pod（繼續執行），另建一個新的'],
          ['節點故障', '節點控制器標記 NotReady，容忍時間（預設 300 秒）到了驅逐 Pod；ReplicaSet 在其他節點補上', '要等幾分鐘；排空節點（`kubectl drain`）時也是同樣的補位'],
          ['新版程式有 bug，每個副本一啟動就當掉', '沒有人能修', '副本數照樣維持，但每個都在 CrashLoopBackOff；要修程式或退回舊版（KUB11）'],
        ] },
        { type: 'p', text: '自我修復維持的是「數量」與「範本」，不是「正確」。它能在 Pod 意外消失時補位，但不會修好設定錯誤或程式的 bug；它也需要時間：新 Pod 要排程、拉 Image、通過就緒探針才算數。catalog 的 readiness 探針讓新副本 5 秒後才就緒，所以刪掉一個 Pod 之後 Deployment 會短暫顯示 `2/3`，`kubectl rollout status` 等它回到 `3/3`。' },
      ],
    },
    {
      id: 'kub04-s-cleanup', title: '刪除與串連，以及換 Image 的預告',
      blocks: [
        { type: 'p', text: '刪除 Deployment 時，垃圾回收器依 ownerReferences 往下清理：ReplicaSet 立刻被刪除，它的 Pod 進入 Terminating、優雅終止後消失（預設是背景串連刪除），上一節範例的最後幾步就是這個過程。加上 `--cascade=orphan` 則只刪 Deployment，ReplicaSet 與 Pod 留下來、變成沒有擁有者，這在要換掉 Deployment 但不想中斷 Pod 的特殊情況才會用到。沒有擁有者的 catalog-manual 不受任何影響，必須自己刪除。' },
        { type: 'p', text: '最後預告下一個主題。修改 Pod 範本（例如 `kubectl set image deploy/catalog catalog=shop/catalog:2.2`，或改 manifest 的 image 再 apply）會產生新的 pod-template-hash，Deployment 建立第二個 ReplicaSet，依滾動更新的策略一邊把新的擴大、一邊把舊的縮小；舊的 ReplicaSet 縮到 0 但保留下來（預設保留 10 個），作為退回舊版的歷史。只改 `replicas` 不會改變範本，所以擴縮時 ReplicaSet 不變。換版之後 `kubectl get rs -l app=catalog` 會列出兩個 ReplicaSet：新的 DESIRED 3，舊的 DESIRED 0，`-o wide` 的 IMAGES 與 SELECTOR 欄顯示它們的範本版本與不同的雜湊。滾動更新的速度、`rollout history` 與 `rollout undo` 是 KUB11 的內容，這一課只要知道「改範本會多一個 ReplicaSet，改副本數不會」。' },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['套用並等它完成', '`kubectl apply -f catalog.yaml`、`kubectl rollout status deploy/catalog`'],
          ['看整條鏈', '`kubectl get deploy,rs,pods -l app=catalog`、`kubectl get rs -o wide`'],
          ['看擁有者', '`kubectl describe pod 名稱`（Controlled By）、`-o jsonpath=\'{.metadata.ownerReferences[0].name}\'`'],
          ['篩選與看標籤', '`-l \'tier in (backend,web)\'`、`--show-labels`、`-L app`'],
          ['改標籤', '`kubectl label pod 名稱 鍵=值 --overwrite`、`kubectl label pod 名稱 鍵-`'],
          ['擴縮', '`kubectl scale deploy/catalog --replicas=5`，或改 manifest 再 apply'],
          ['刪除', '`kubectl delete deploy catalog`（串連刪除）、`--cascade=orphan`'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, CART, OPS, REPORT],
    examples: [
      {
        id: 'kub04-apply', title: '套用 Deployment，等它就緒', machine: 'kub04-ws',
        description: 'frontend.yaml 是 2 個副本的 Deployment。套用之後立刻看 deploy、rs、pods 三層物件，再用 rollout status 等到 Image 拉完、副本就緒。',
        steps: [
          { command: 'cat shop/frontend.yaml', output: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: frontend\n  labels:\n    app: frontend\n    tier: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: frontend\n  template:\n    metadata:\n      labels:\n        app: frontend\n        tier: web\n    spec:\n      containers:\n      - name: frontend\n        image: shop/frontend:1.6\n        ports:\n        - containerPort: 3000" },
          { command: 'kubectl apply -f shop/frontend.yaml', output: "deployment.apps/frontend created" },
          { command: 'kubectl get deploy,rs,pods -l app=frontend', output: "NAME                       READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/frontend   0/2       2            0           0s\n\nNAME                                  DESIRED   CURRENT   READY     AGE\nreplicaset.apps/frontend-vwrmfs5gvc   2         2         0         0s\n\nNAME                            READY     STATUS              RESTARTS   AGE\npod/frontend-vwrmfs5gvc-jkvmn   0/1       ContainerCreating   0          0s\npod/frontend-vwrmfs5gvc-ljnz4   0/1       ContainerCreating   0          0s" },
          { command: 'kubectl rollout status deploy/frontend', output: "Waiting for deployment \"frontend\" rollout to finish: 0 of 2 updated replicas are available...\ndeployment \"frontend\" successfully rolled out" },
          { command: 'kubectl get deploy frontend', output: "NAME       READY     UP-TO-DATE   AVAILABLE   AGE\nfrontend   2/2       2            2           4s" },
          { command: 'kubectl get pods -l app=frontend -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nfrontend-vwrmfs5gvc-jkvmn   1/1       Running   0          4s        10.244.2.4   node-02   <none>           <none>\nfrontend-vwrmfs5gvc-ljnz4   1/1       Running   0          4s        10.244.1.4   node-01   <none>           <none>" },
        ],
      },
      {
        id: 'kub04-chain', title: '沿著 ownerReferences 走一遍', machine: 'kub04-ws',
        description: 'Deployment 與 ReplicaSet 的選擇器差了一個 pod-template-hash；每個 Pod 的擁有者是 ReplicaSet，ReplicaSet 的擁有者是 Deployment；手動建立的 catalog-manual 沒有擁有者。',
        steps: [
          { command: 'kubectl get deploy catalog -o wide', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE       CONTAINERS   IMAGES             SELECTOR\ncatalog   3/3       3            3           20m       catalog      shop/catalog:2.1   app=catalog" },
          { command: 'kubectl get rs -l app=catalog -o wide', output: "NAME                 DESIRED   CURRENT   READY     AGE       CONTAINERS   IMAGES             SELECTOR\ncatalog-9zpmhnrl4t   3         3         3         20m       catalog      shop/catalog:2.1   app=catalog,pod-template-hash=9zpmhnrl4t" },
          { command: 'kubectl get pods -l app=catalog -o custom-columns=NAME:.metadata.name,OWNER-KIND:.metadata.ownerReferences[0].kind,OWNER:.metadata.ownerReferences[0].name', output: "NAME                       OWNER-KIND   OWNER\ncatalog-9zpmhnrl4t-6ltfc   ReplicaSet   catalog-9zpmhnrl4t\ncatalog-9zpmhnrl4t-6t8ks   ReplicaSet   catalog-9zpmhnrl4t\ncatalog-9zpmhnrl4t-974cn   ReplicaSet   catalog-9zpmhnrl4t\ncatalog-manual             <none>       <none>" },
          { command: "kubectl get rs -l app=catalog -o jsonpath='{.items[0].metadata.ownerReferences[0].kind}/{.items[0].metadata.ownerReferences[0].name}{\"\\n\"}'", output: "Deployment/catalog" },
          { command: 'kubectl describe rs -l app=catalog | head -n 12', output: "Name:           catalog-9zpmhnrl4t\nNamespace:      default\nSelector:       app=catalog,pod-template-hash=9zpmhnrl4t\nLabels:         app=catalog\n                pod-template-hash=9zpmhnrl4t\n                tier=backend\nAnnotations:    deployment.kubernetes.io/desired-replicas: 3\n                deployment.kubernetes.io/max-replicas: 4\n                deployment.kubernetes.io/revision: 1\nControlled By:  Deployment/catalog\nReplicas:       3 current / 3 desired\nPods Status:    3 Running / 0 Waiting / 0 Succeeded / 0 Failed" },
          { command: `kubectl describe pod ${CATALOG_PODS} | grep 'Controlled By'`, output: "Controlled By:  ReplicaSet/catalog-9zpmhnrl4t" },
        ],
      },
      {
        id: 'kub04-labels', title: '用選擇器篩選、修改標籤、兩個被拒絕的 Deployment', machine: 'kub04-ws',
        description: '--show-labels 與 -L 看標籤；等號、in、notin、存在與否的選擇器；改標籤要 --overwrite；選擇器不符合範本、修改選擇器都會被 API server 拒絕。',
        steps: [
          { command: 'kubectl apply -f shop/frontend.yaml', output: "deployment.apps/frontend created" },
          { command: 'kubectl get pods --show-labels', output: "NAME                        READY     STATUS              RESTARTS   AGE       LABELS\ncatalog-9zpmhnrl4t-6ltfc    1/1       Running             0          20m       app=catalog,pod-template-hash=9zpmhnrl4t,tier=backend\ncatalog-9zpmhnrl4t-6t8ks    1/1       Running             0          20m       app=catalog,pod-template-hash=9zpmhnrl4t,tier=backend\ncatalog-9zpmhnrl4t-974cn    1/1       Running             0          20m       app=catalog,pod-template-hash=9zpmhnrl4t,tier=backend\ncatalog-manual              1/1       Running             0          6d18h     app=catalog,tier=backend\nfrontend-vwrmfs5gvc-jkvmn   0/1       ContainerCreating   0          0s        app=frontend,pod-template-hash=vwrmfs5gvc,tier=web\nfrontend-vwrmfs5gvc-ljnz4   0/1       ContainerCreating   0          0s        app=frontend,pod-template-hash=vwrmfs5gvc,tier=web" },
          { command: "kubectl get pods -l 'app=catalog,!pod-template-hash'", output: "NAME             READY     STATUS    RESTARTS   AGE\ncatalog-manual   1/1       Running   0          6d18h" },
          { command: "kubectl get pods -l 'tier in (backend,web)' -L app,tier", output: "NAME                        READY     STATUS              RESTARTS   AGE       APP        TIER\ncatalog-9zpmhnrl4t-6ltfc    1/1       Running             0          20m       catalog    backend\ncatalog-9zpmhnrl4t-6t8ks    1/1       Running             0          20m       catalog    backend\ncatalog-9zpmhnrl4t-974cn    1/1       Running             0          20m       catalog    backend\ncatalog-manual              1/1       Running             0          6d18h     catalog    backend\nfrontend-vwrmfs5gvc-jkvmn   0/1       ContainerCreating   0          0s        frontend   web\nfrontend-vwrmfs5gvc-ljnz4   0/1       ContainerCreating   0          0s        frontend   web" },
          { command: "kubectl get pods -l 'tier notin (backend)'", output: "NAME                        READY     STATUS              RESTARTS   AGE\nfrontend-vwrmfs5gvc-jkvmn   0/1       ContainerCreating   0          0s\nfrontend-vwrmfs5gvc-ljnz4   0/1       ContainerCreating   0          0s" },
          { command: 'kubectl get pods -l app=catalog --no-headers | wc -l', output: "4" },
          { command: 'kubectl label pod catalog-manual owner=yuki', output: "pod/catalog-manual labeled" },
          { command: 'kubectl label pod catalog-manual app=catalog-old', output: "error: 'app' already has a value (catalog), and --overwrite is false" },
          { command: 'kubectl label pod catalog-manual app=catalog-old --overwrite', output: "pod/catalog-manual labeled" },
          { command: 'kubectl label pod catalog-manual owner-', output: "pod/catalog-manual unlabeled" },
          { command: 'kubectl get pod catalog-manual --show-labels', output: "NAME             READY     STATUS    RESTARTS   AGE       LABELS\ncatalog-manual   1/1       Running   0          6d18h     app=catalog-old,tier=backend" },
          { command: "grep -n 'app:' shop/search.yaml", output: "6:    app: search\n11:      app: search\n15:        app: searcher" },
          { command: 'kubectl apply -f shop/search.yaml', output: "The Deployment \"search\" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{\"app\":\"searcher\"}: `selector` does not match template `labels`" },
          { command: 'grep -A 3 matchLabels shop/catalog-reselect.yaml', output: "    matchLabels:\n      app: catalog\n      tier: backend\n  template:" },
          { command: 'kubectl apply -f shop/catalog-reselect.yaml', output: "The Deployment \"catalog\" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:map[string]string{\"app\":\"catalog\", \"tier\":\"backend\"}, MatchExpressions:[]v1.LabelSelectorRequirement(nil)}: field is immutable" },
        ],
      },
      {
        id: 'kub04-scale', title: '擴縮、誰被刪掉、apply 把數字改回去', machine: 'kub04-ws',
        description: '擴到 5 個、等新副本就緒，再縮回 3 個：被刪的是兩個新的。命令式擴到 6 個之後照 manifest apply，又回到 3 個；改 manifest 的 replicas 再 apply 才是持久的改動。直接縮 ReplicaSet 會被 Deployment 調回。',
        steps: [
          { command: 'kubectl scale deploy/catalog --replicas=5', output: "deployment.apps/catalog scaled" },
          { command: 'kubectl get deploy catalog', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   3/5       5            3           20m" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 3 of 5 updated replicas are available...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl get pods -l app=catalog,pod-template-hash', output: "NAME                       READY     STATUS    RESTARTS   AGE\ncatalog-9zpmhnrl4t-6ltfc   1/1       Running   0          20m\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running   0          20m\ncatalog-9zpmhnrl4t-974cn   1/1       Running   0          20m\ncatalog-9zpmhnrl4t-h5wsz   1/1       Running   0          5s\ncatalog-9zpmhnrl4t-zksdg   1/1       Running   0          5s" },
          { command: 'kubectl scale deploy/catalog --replicas=3', output: "deployment.apps/catalog scaled" },
          { command: 'kubectl get pods -l app=catalog,pod-template-hash', output: "NAME                       READY     STATUS        RESTARTS   AGE\ncatalog-9zpmhnrl4t-6ltfc   1/1       Running       0          20m\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running       0          20m\ncatalog-9zpmhnrl4t-974cn   1/1       Running       0          20m\ncatalog-9zpmhnrl4t-h5wsz   1/1       Terminating   0          5s\ncatalog-9zpmhnrl4t-zksdg   1/1       Terminating   0          5s" },
          { command: 'kubectl scale deploy/catalog --replicas=6', output: "deployment.apps/catalog scaled" },
          { command: 'kubectl apply -f shop/catalog.yaml', output: "deployment.apps/catalog configured" },
          { command: 'kubectl get deploy catalog', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   3/3       3            3           20m" },
          { command: "sed -i 's/replicas: 3/replicas: 4/' shop/catalog.yaml", output: "" },
          { command: 'kubectl apply -f shop/catalog.yaml', output: "deployment.apps/catalog configured" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 3 of 4 updated replicas are available...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl apply -f shop/catalog.yaml', output: "deployment.apps/catalog unchanged" },
          { command: 'kubectl scale rs -l app=catalog --replicas=1', output: "replicaset.apps/catalog-9zpmhnrl4t scaled" },
          { command: 'kubectl get rs -l app=catalog', output: "NAME                 DESIRED   CURRENT   READY     AGE\ncatalog-9zpmhnrl4t   4         4         1         20m" },
          { command: 'kubectl events --for deploy/catalog', output: "LAST SEEN   TYPE      REASON              OBJECT               MESSAGE\n20m         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-9zpmhnrl4t from 0 to 3\n10s         Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-9zpmhnrl4t from 3 to 5\n5s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-9zpmhnrl4t from 5 to 3\n5s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-9zpmhnrl4t from 3 to 6\n5s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled down replica set catalog-9zpmhnrl4t from 6 to 3\n5s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-9zpmhnrl4t from 3 to 4\n0s          Normal    ScalingReplicaSet   Deployment/catalog   Scaled up replica set catalog-9zpmhnrl4t from 1 to 4" },
        ],
      },
      {
        id: 'kub04-heal', title: '刪掉一個 Pod、把一個 Pod 移出選擇器，最後刪除 Deployment', machine: 'kub04-ws',
        description: '刪除的 Pod 由新名稱的 Pod 補上，就緒前 Deployment 是 2/3。把一個 Pod 的 app 改成 catalog-debug：它失去擁有者但繼續執行，ReplicaSet 補上一個新的；改回 app=catalog 後，ReplicaSet 收養它、刪掉最新的那一個。最後刪除 Deployment：ReplicaSet 立刻消失，Pod 優雅終止，沒有擁有者的 catalog-manual 不受影響。',
        steps: [
          { command: 'kubectl get pods -l app=catalog,pod-template-hash -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-9zpmhnrl4t-6ltfc   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-9zpmhnrl4t-974cn   1/1       Running   0          20m       10.244.2.3   node-02   <none>           <none>" },
          { command: `kubectl delete pod ${CATALOG_PODS}`, output: "pod \"catalog-9zpmhnrl4t-6ltfc\" deleted" },
          { command: 'kubectl get pods -l app=catalog,pod-template-hash -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running   0          20m       10.244.1.3   node-01   <none>           <none>\ncatalog-9zpmhnrl4t-974cn   1/1       Running   0          20m       10.244.2.3   node-02   <none>           <none>\ncatalog-9zpmhnrl4t-zksdg   0/1       Running   0          1s        10.244.1.4   node-01   <none>           <none>" },
          { command: 'kubectl get deploy catalog', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   2/3       3            2           20m" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 2 of 3 updated replicas are available...\ndeployment \"catalog\" successfully rolled out" },
          { command: `POD=${CATALOG_PODS}`, output: "" },
          { command: 'kubectl label pod $POD app=catalog-debug --overwrite', output: "pod/catalog-9zpmhnrl4t-6t8ks labeled" },
          { command: 'kubectl get pods -L app', output: "NAME                       READY     STATUS    RESTARTS   AGE       APP\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running   0          20m       catalog-debug\ncatalog-9zpmhnrl4t-974cn   1/1       Running   0          20m       catalog\ncatalog-9zpmhnrl4t-h5wsz   0/1       Running   0          0s        catalog\ncatalog-9zpmhnrl4t-zksdg   1/1       Running   0          5s        catalog\ncatalog-manual             1/1       Running   0          6d18h     catalog" },
          { command: 'kubectl get pods -l app=catalog-debug -o custom-columns=NAME:.metadata.name,OWNER:.metadata.ownerReferences[0].name', output: "NAME                       OWNER\ncatalog-9zpmhnrl4t-6t8ks   <none>" },
          { command: 'kubectl logs $POD', output: "catalog 2.1 listening on :8080" },
          { command: 'kubectl rollout status deploy/catalog', output: "Waiting for deployment \"catalog\" rollout to finish: 2 of 3 updated replicas are available...\ndeployment \"catalog\" successfully rolled out" },
          { command: 'kubectl label pod $POD app=catalog --overwrite', output: "pod/catalog-9zpmhnrl4t-6t8ks labeled" },
          { command: 'kubectl get pods -l app=catalog,pod-template-hash', output: "NAME                       READY     STATUS        RESTARTS   AGE\ncatalog-9zpmhnrl4t-6t8ks   1/1       Running       0          20m\ncatalog-9zpmhnrl4t-974cn   1/1       Running       0          20m\ncatalog-9zpmhnrl4t-h5wsz   1/1       Terminating   0          5s\ncatalog-9zpmhnrl4t-zksdg   1/1       Running       0          10s" },
          { command: 'kubectl describe rs -l app=catalog | tail -n 5', output: "  Normal  SuccessfulCreate  20m   replicaset-controller  Created pod: catalog-9zpmhnrl4t-6t8ks\n  Normal  SuccessfulCreate  20m   replicaset-controller  Created pod: catalog-9zpmhnrl4t-974cn\n  Normal  SuccessfulCreate  10s   replicaset-controller  Created pod: catalog-9zpmhnrl4t-zksdg\n  Normal  SuccessfulCreate  5s    replicaset-controller  Created pod: catalog-9zpmhnrl4t-h5wsz\n  Normal  SuccessfulDelete  0s    replicaset-controller  Deleted pod: catalog-9zpmhnrl4t-h5wsz" },
          { command: 'sleep 2', output: "" },
          { command: 'kubectl delete deploy catalog', output: "deployment.apps \"catalog\" deleted" },
          { command: 'kubectl get deploy,rs,pods', output: "NAME                           READY     STATUS        RESTARTS   AGE\npod/catalog-9zpmhnrl4t-6t8ks   1/1       Terminating   0          20m\npod/catalog-9zpmhnrl4t-974cn   1/1       Terminating   0          20m\npod/catalog-9zpmhnrl4t-zksdg   1/1       Terminating   0          12s\npod/catalog-manual             1/1       Running       0          6d18h" },
          { command: 'sleep 2', output: "" },
          { command: 'kubectl get deploy,rs,pods', output: "NAME                 READY     STATUS    RESTARTS   AGE\npod/catalog-manual   1/1       Running   0          6d18h" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub04-ex-cart', title: '寫一份 Deployment 讓 cart 上線', machine: 'kub04-cart',
        statement: 'shop 團隊要上線購物車服務 cart。在 `~/shop/cart.yaml` 寫一份 Deployment 並套用到叢集：名稱 `cart`、3 個副本、選擇器 `app: cart`，Pod 範本帶 `app: cart` 與 `tier: backend` 兩個標籤，容器名稱 `cart`、Image `shop/cart:1.0`、containerPort 8081。套用之後，等到 3 個副本都就緒再結束（節點要先拉取 Image）。檔案可以用 `cat > shop/cart.yaml <<\'EOF\'` 一次寫完，最後一行單獨打 `EOF`。',
        checks: [
          { kind: 'exists', path: '/home/yuki/shop/cart.yaml', type: 'file' },
          { kind: 'kube-workload', resource: 'Deployment', name: 'cart', replicas: 3, readyReplicas: 3, image: 'shop/cart:1.0' },
          { kind: 'kube-pod', selector: 'app=cart,tier=backend', count: 3, status: 'Running', ready: true },
        ],
        solution: [heredoc('shop/cart.yaml', CART_YAML), 'kubectl apply -f shop/cart.yaml', 'kubectl rollout status deploy/cart', 'kubectl get deploy cart'],
        mistakes: [
          { commands: [heredoc('shop/cart.yaml', CART_YAML), 'kubectl apply -f shop/cart.yaml'], why: '套用之後沒有等待：Image 要拉取幾秒，這時 Deployment 還是 0/3，檢查時沒有任何就緒的副本' },
          { commands: ['kubectl create deployment cart --image=shop/cart:1.0 --replicas=3 --port=8081', 'kubectl rollout status deploy/cart'], why: 'create deployment 只會加上 app=cart，Pod 沒有 tier: backend 標籤，也沒有寫出 ~/shop/cart.yaml' },
          { commands: [heredoc('shop/cart.yaml', CART_YAML.replace('  replicas: 3\n', '')), 'kubectl apply -f shop/cart.yaml', 'kubectl rollout status deploy/cart'], why: '少了 replicas，Deployment 用預設值 1，只會有一個副本' },
          { commands: [heredoc('shop/cart.yaml', CART_YAML.replace('        app: cart\n', '        app: carts\n')), 'kubectl apply -f shop/cart.yaml'], why: '範本的標籤寫成 app: carts，不符合選擇器 app: cart，API server 拒絕建立這個 Deployment' },
        ],
        hints: [
          '骨架是 `apiVersion: apps/v1`、`kind: Deployment`、`metadata.name`，`spec` 底下有 `replicas`、`selector.matchLabels`、`template`（`metadata.labels` 加上 KUB03 寫過的 Pod `spec`）。',
          '`selector.matchLabels` 的每一個標籤都要出現在 `template.metadata.labels` 裡；範本可以多帶 `tier: backend`。',
          '`kubectl apply -f shop/cart.yaml` 之後執行 `kubectl rollout status deploy/cart`，它會等到副本都可用才結束。',
        ],
        explanation: 'Deployment 的 manifest 是 `apps/v1` 的 `Deployment`：`spec.replicas: 3` 是期望數，`spec.selector.matchLabels: {app: cart}` 決定哪些 Pod 屬於它，`spec.template` 是每個 Pod 的範本，標籤 `app: cart`、`tier: backend` 必須包含選擇器的標籤。`kubectl apply -f` 建立 Deployment，Deployment 建立名為 `cart-<雜湊>` 的 ReplicaSet，ReplicaSet 依範本建立 3 個 Pod。剛建立時節點還在拉取 `shop/cart:1.0`，Pod 是 ContainerCreating、Deployment 是 `0/3`；`kubectl rollout status deploy/cart` 讓時間前進到副本都可用，最後是 `3/3`。少寫 `replicas` 會得到預設的 1 個；範本標籤和選擇器不一致會被拒絕；`kubectl create deployment` 沒辦法加上 tier 標籤，而且叢集裡的設定沒有對應的檔案可以放進版本控制。',
      },
      {
        id: 'kub04-ex-scale', title: '把活動的副本數寫進 manifest 並套用', machine: 'kub04-ops',
        statement: '活動期間 catalog 需要更多副本，值班表核定的數字寫在 `~/shop/capacity.txt`。用宣告式的方式完成：把 `~/shop/catalog.yaml` 的 `replicas` 改成這個數字（檔案的其他內容不變），套用到叢集，並等到所有副本都就緒（catalog 的 readiness 探針讓新副本 5 秒後才就緒）。完成後，manifest 與叢集上的 Deployment 要寫著同樣的副本數，之後任何人照 manifest 重新 apply 都不會把它改回去。',
        checks: [
          { kind: 'content', path: '/home/yuki/shop/catalog.yaml', content: CATALOG_YAML.replace('  replicas: 3\n', '  replicas: 5\n') },
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', replicas: 5, readyReplicas: 5 },
        ],
        solution: ['cat shop/capacity.txt', 'grep -n replicas shop/catalog.yaml', 'sed -i "s/replicas: 3/replicas: $(cat shop/capacity.txt)/" shop/catalog.yaml', 'kubectl apply -f shop/catalog.yaml', 'kubectl rollout status deploy/catalog'],
        mistakes: [
          { commands: ['kubectl scale deploy/catalog --replicas=5', 'kubectl rollout status deploy/catalog'], why: '叢集變成 5 個，但 manifest 還寫著 3：下次照 manifest apply 就會被改回 3（drift）' },
          { commands: ["sed -i 's/replicas: 3/replicas: 5/' shop/catalog.yaml", 'sleep 10'], why: '只改了檔案，沒有 kubectl apply，叢集裡的 Deployment 仍然是 3 個副本' },
          { commands: ["sed -i 's/replicas: 3/replicas: 5/' shop/catalog.yaml", 'kubectl apply -f shop/catalog.yaml'], why: '套用了但沒有等待：新副本的 readiness 探針 5 秒後才通過，檢查時只有 3 個就緒' },
          { commands: ["sed -i 's/replicas: 3/replicas: 5/' shop/catalog.yaml", 'kubectl scale rs -l app=catalog --replicas=5', 'sleep 10'], why: '直接調整 Deployment 底下的 ReplicaSet，Deployment 會把它調回自己的 replicas: 3；manifest 也沒有被套用' },
        ],
        hints: [
          '`cat shop/capacity.txt` 看核定的數字，`grep -n replicas shop/catalog.yaml` 看 manifest 目前寫的數字。',
          '`sed -i \'s/replicas: 3/replicas: 5/\' shop/catalog.yaml` 在檔案裡取代文字；也可以寫成 `"s/replicas: 3/replicas: $(cat shop/capacity.txt)/"` 直接用檔案裡的數字。',
          '`kubectl apply -f shop/catalog.yaml` 印出 configured 之後，用 `kubectl rollout status deploy/catalog` 等到所有副本都可用。',
        ],
        explanation: '副本數是 Deployment 的 `spec.replicas`。宣告式的作法是讓 manifest 成為真相：`sed -i` 把 `replicas: 3` 換成值班表的 5，`kubectl apply -f` 比較 manifest 與叢集上的物件，送出修改（configured），Deployment 把 ReplicaSet 調到 5，ReplicaSet 用範本建立兩個新 Pod；新 Pod 的 readiness 探針 5 秒後才通過，`kubectl rollout status` 等到 successfully rolled out。只用 `kubectl scale` 雖然讓叢集變成 5 個，manifest 卻還是 3，下次有人照 manifest apply 就會悄悄改回去；只改檔案不 apply 則什麼都沒發生；直接縮放 ReplicaSet 會被 Deployment 調回。',
      },
      {
        id: 'kub04-ex-debug', title: '把一個 catalog Pod 留下來除錯', machine: 'kub04-ops',
        statement: '開發者想研究一個執行中的 catalog Pod，但服務不能少一個副本。任選一個 catalog 的 Pod，把它的 `app` 標籤改成 `catalog-debug`，讓它脫離 Deployment 的管理但繼續執行；接著等到 Deployment 補上的新副本就緒，catalog 回到 3 個就緒的副本。Pod 的名稱帶有雜湊，請從 `kubectl get` 讀取，不要寫死。',
        checks: [
          { kind: 'kube-pod', selector: 'app=catalog-debug', count: 1, status: 'Running' },
          { kind: 'kube-pod', selector: 'app=catalog', count: 3, status: 'Running', ready: true },
          { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', replicas: 3, readyReplicas: 3 },
        ],
        solution: ['kubectl get pods -l app=catalog', `kubectl label pod ${CATALOG_PODS} app=catalog-debug --overwrite`, 'kubectl rollout status deploy/catalog', 'kubectl get pods -L app'],
        mistakes: [
          { commands: [`kubectl delete pod ${CATALOG_PODS}`, 'kubectl rollout status deploy/catalog'], why: '刪除 Pod 雖然會被補上，但開發者要研究的那個 Pod 也沒了' },
          { commands: [`kubectl label pod ${CATALOG_PODS} app=catalog-debug`, 'kubectl rollout status deploy/catalog'], why: 'app 已經有值，沒有 --overwrite 時 kubectl label 拒絕修改，Pod 還在 Deployment 底下' },
          { commands: [`kubectl label pod ${CATALOG_PODS} debug=true`, 'kubectl rollout status deploy/catalog'], why: '多加一個 debug 標籤不會讓它離開選擇器 app=catalog，它仍是三個副本之一' },
          { commands: [`kubectl label pod ${CATALOG_PODS} app=catalog-debug --overwrite`], why: '改了標籤但沒有等待：補上的新副本 5 秒後才就緒，檢查時只有 2 個就緒的副本' },
        ],
        hints: [
          '`kubectl get pods -l app=catalog -o jsonpath=\'{.items[0].metadata.name}\'` 取出第一個 Pod 的名稱，可以放進 `$( )`。',
          '`kubectl label pod 名稱 app=catalog-debug --overwrite`：改掉已經存在的標籤要加 `--overwrite`。',
          'ReplicaSet 會補一個新 Pod；用 `kubectl rollout status deploy/catalog` 等它就緒，再用 `kubectl get pods -L app` 確認。',
        ],
        explanation: 'ReplicaSet 只數「符合選擇器而且屬於自己」的 Pod。把一個 Pod 的 `app` 改成 `catalog-debug` 之後，它不再符合 `app=catalog,pod-template-hash=…`，ReplicaSet 移除它的 ownerReference 並補建一個新 Pod；被釋放的 Pod 沒有擁有者，但容器照常執行，可以 `kubectl logs`、`kubectl exec` 慢慢研究，研究完要自己 `kubectl delete`。新 Pod 的 readiness 探針 5 秒後才通過，`kubectl rollout status deploy/catalog` 等到 Deployment 回到 `3/3`。改既有的鍵一定要 `--overwrite`；加一個新標籤不會讓 Pod 離開選擇器；刪除 Pod 則讓要研究的現場消失。',
      },
      {
        id: 'kub04-ex-owner', title: '手動建立的 Pod 被誰收養了', machine: 'kub04-report',
        statement: 'report-manual 是昨天有人手動建立的 Pod；今天早上團隊建立了兩個 ReplicaSet，其中一個收養了它。印出現在擁有 report-manual 的 ReplicaSet 名稱：最後一個指令只印出名稱本身（例如 `report-xyz`），不要有標題或其他文字。請從叢集讀取，不要寫死：同一串指令會在另外兩個叢集上重播，那裡收養它的是別的 ReplicaSet。',
        checks: [{ kind: 'output', fromCommand: '^kubectl get ' }],
        solution: ['kubectl get rs -o wide', 'kubectl get pod report-manual --show-labels', "kubectl get pod report-manual -o jsonpath='{.metadata.ownerReferences[0].name}'"],
        mistakes: [
          { commands: ['kubectl get rs -o wide'], why: '列出了所有 ReplicaSet 與它們的選擇器，但沒有只印出擁有 report-manual 的那一個' },
          { commands: ["kubectl get pod report-manual -o jsonpath='{.metadata.labels.track}'"], why: '印出的是 track 標籤的值，不是 ReplicaSet 的名稱' },
          { commands: ['kubectl describe pod report-manual'], why: 'describe 的 Controlled By 有答案，但輸出是整份說明，而不是只有名稱' },
          { commands: ['echo report-stable'], why: '直接打出答案，沒有查詢叢集；換一個叢集答案就不同' },
        ],
        variants: [
          { label: 'report-manual 帶 track: canary 的叢集', files: [], kube: reportKube('canary', 'report-stable', 'report-canary') },
          { label: 'ReplicaSet 叫 report-v7 與 report-v8 的叢集', files: [], kube: reportKube('stable', 'report-v7', 'report-v8') },
        ],
        hints: [
          '`kubectl get rs -o wide` 的 SELECTOR 欄與 `kubectl get pod report-manual --show-labels` 可以推出答案，但題目要的是叢集記錄的事實。',
          '擁有者記錄在 Pod 的 `metadata.ownerReferences`；`kubectl describe pod report-manual` 的 `Controlled By:` 也是它。',
          '`kubectl get pod report-manual -o jsonpath=\'{.metadata.ownerReferences[0].name}\'` 只印出名稱；`-o custom-columns=OWNER:.metadata.ownerReferences[0].name --no-headers` 也可以。',
        ],
        explanation: '自己寫的 ReplicaSet 選擇器沒有 pod-template-hash，所以它建立時會收養當時符合選擇器、又沒有擁有者的 Pod：report-manual 帶著 `app: report`、`track: stable`，被選擇器 `app=report,track=stable` 的 report-stable 收養，report-stable 只需要再建立一個 Pod 就湊滿 2 個。收養的事實記錄在 Pod 的 `metadata.ownerReferences`，`-o jsonpath=\'{.metadata.ownerReferences[0].name}\'` 直接印出 `report-stable`。在另一個叢集 report-manual 的 track 是 canary，答案是 report-canary；第三個叢集的 ReplicaSet 換了名稱，答案是 report-v7。用標籤與 SELECTOR 推理也能得到答案，但 ownerReferences 是控制器實際寫下的結果，最可靠。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub04-q1', prompt: '`kubectl get pods` 列出 `catalog-9zpmhnrl4t-6ltfc`。中間的 `9zpmhnrl4t` 是什麼？',
      options: ['Pod 的 UID 前十個字元，每個 Pod 都各不相同', 'Pod 所在節點的代號，同一個節點上的 Pod 都一樣', 'pod-template-hash，也就是 ReplicaSet 名稱的後綴', 'Pod 建立時間的編碼，越晚建立的 Pod 數值越大'],
      answer: 2,
      explanation: 'Deployment 由 Pod 範本算出 pod-template-hash，用在 ReplicaSet 的名稱（`catalog-9zpmhnrl4t`）、它的選擇器與每個 Pod 的標籤，最後的 `6ltfc` 才是每個 Pod 各自的後綴。同一個 ReplicaSet 的 Pod 共用這段雜湊，所以它不是 UID（UID 在 metadata.uid），和節點無關，也不是時間；範本一改就會得到新的雜湊與新的 ReplicaSet。',
    },
    {
      id: 'kub04-q2', prompt: 'Deployment catalog 的選擇器是 `app: catalog`，有人另外手動建立一個帶 `app: catalog` 標籤的 Pod。會發生什麼事？',
      options: ['不會被收養：ReplicaSet 的選擇器還要求 pod-template-hash', 'ReplicaSet 收養它，並刪掉一個自己建立的 Pod，讓總數維持 3 個', 'ReplicaSet 收養它，Deployment 的 replicas 也跟著自動變成 4', 'API server 拒絕建立這個 Pod，因為標籤和既有的 Deployment 衝突'],
      answer: 0,
      explanation: 'Deployment 建立的 ReplicaSet 選擇器是 `app=catalog,pod-template-hash=…`，手動的 Pod 沒有雜湊標籤，所以不符合、不會被收養，也不算進 READY 3/3；但 `-l app=catalog` 會列出它，用 `app=catalog` 選擇後端的 Service 也會送流量給它。收養只發生在選擇器沒有雜湊的手寫 ReplicaSet；副本數只由 spec.replicas 決定；標籤不會互相衝突，API server 不會因此拒絕。',
    },
    {
      id: 'kub04-q3', prompt: '值班時用 `kubectl scale deploy/catalog --replicas=8` 應付流量。隔天同事照版本控制裡寫著 `replicas: 3` 的 manifest 執行 `kubectl apply -f catalog.yaml`。結果是？',
      options: ['印出 unchanged，副本數維持 8，因為 manifest 沒有改過', 'apply 失敗，因為叢集裡的值和 manifest 衝突，要加 --force', '副本數變成 11，apply 把 manifest 的 3 加上去', '印出 configured，副本數被改回 3'],
      answer: 3,
      explanation: 'apply 會把叢集上的物件改成 manifest 描述的樣子：叢集的 replicas 是 8、manifest 是 3，於是送出修改，印出 configured，多出的 5 個 Pod 被刪除。這就是命令式改動造成的 drift。apply 不會因為值不同而失敗，也不會相加；只有在叢集已經和 manifest 一致時才會是 unchanged。臨時擴充之後要把數字寫回 manifest。',
    },
    {
      id: 'kub04-q4', prompt: '執行 `kubectl label pod catalog-9zpmhnrl4t-6ltfc app=catalog-debug --overwrite` 之後，會發生什麼事？',
      options: ['ReplicaSet 發現 Pod 的標籤被改，把這個 Pod 刪除再建一個新的', 'ReplicaSet 釋放這個 Pod 並補建一個新的；被釋放的 Pod 繼續執行，沒有擁有者', 'Deployment 拒絕這次修改，因為 Pod 的標籤由範本決定', '沒有變化，ReplicaSet 只在 Pod 被刪除時才會補建'],
      answer: 1,
      explanation: 'ReplicaSet 只數符合選擇器的 Pod。改掉 app 之後這個 Pod 不再符合，ReplicaSet 移除它的 ownerReference（釋放），數到只剩兩個就補建一個；舊 Pod 不會被刪除，正好留下來除錯。標籤可以隨時用 kubectl label 修改，Deployment 不會阻止；ReplicaSet 也不是只對刪除有反應，任何讓數量改變的事都會觸發調和。',
    },
    {
      id: 'kub04-q5', prompt: '想把 Deployment 的選擇器從 `app: catalog` 改成 `app: catalog` 加上 `tier: backend`，`kubectl apply` 卻得到 `field is immutable`。正確的理解是？',
      options: ['改用 `kubectl replace -f` 送出整個物件就能修改', '先用 `kubectl label` 替現有的 Pod 加上 tier，再 apply 就會被接受', '`apps/v1` 的 Deployment 選擇器建立後不能修改，只能建立新的 Deployment', '等 Deployment 的 progressDeadlineSeconds 過了之後再 apply'],
      answer: 2,
      explanation: '在 apps/v1 裡 Deployment 的 spec.selector 建立後就不可變，否則既有的 ReplicaSet 與 Pod 會突然不屬於它。要換選擇器只能建立新的 Deployment（換名稱，或刪掉舊的再建立）。`kubectl replace` 一樣要通過 API server 的驗證，照樣被拒絕；替 Pod 加標籤不改變 API server 的規則；progressDeadlineSeconds 是滾動更新的期限，和選擇器能不能改無關。',
    },
    {
      id: 'kub04-q6', prompt: 'catalog 有 5 個 Pod：3 個已經跑了 20 分鐘，2 個剛建立還沒就緒（READY 0/1）。`kubectl scale deploy/catalog --replicas=3` 之後，ReplicaSet 優先刪掉哪些？',
      options: ['兩個剛建立、還沒就緒的 Pod', '三個舊 Pod 裡隨機挑兩個', '名稱依字母排序最前面的兩個', '同一個節點上的所有 Pod'],
      answer: 0,
      explanation: '縮減時 ReplicaSet 依序偏好刪掉：還沒排程的、Pending 的、還沒就緒的、重新啟動次數多的、比較新的。兩個新 Pod 既沒就緒又比較新，最先被刪；跑了 20 分鐘的就緒 Pod 會保留。挑選不是隨機的，名稱只在所有條件都相同時才用來打破平手，也不會整個節點一起刪除。',
    },
    {
      id: 'kub04-q7', prompt: '下列哪一件事，Deployment 與 ReplicaSet 的自我修復無法解決？',
      options: ['有人用 `kubectl delete pod` 刪掉了其中一個副本', '一個副本的標籤被改掉，不再符合選擇器', '一個節點故障，上面的副本被驅逐', '新版程式有 bug，每個副本一啟動就當掉'],
      answer: 3,
      explanation: '刪除、改標籤、節點故障後的驅逐，都讓符合選擇器的副本變少，ReplicaSet 會補建新的 Pod。程式本身有 bug 時，新 Pod 照樣一啟動就當掉，副本數雖然維持，每個都在 CrashLoopBackOff；自我修復只維持數量與範本，不會修好程式，要修正 Image 或退回舊版（KUB11）。',
    },
    {
      id: 'kub04-q8', prompt: '`kubectl get pods -l \'tier=backend,app notin (catalog)\'` 會列出哪些 Pod？',
      options: ['tier 是 backend，或者 app 不是 catalog 的 Pod', 'tier 是 backend，而且 app 不是 catalog 的 Pod（包括沒有 app 標籤的）', '只有同時帶著 tier 與 app 兩個標籤、而且 app 不是 catalog 的 Pod', '什麼都不會列出，`notin` 只能寫在 manifest 的 matchExpressions 裡'],
      answer: 1,
      explanation: '選擇器裡的逗號是「而且」，沒有「或」的寫法；`notin` 也會選到根本沒有那個鍵的資源，所以沒有 app 標籤、tier 是 backend 的 Pod 也會列出。`in`、`notin`、`!key` 這些集合式寫法在 `kubectl -l` 一樣可以用，不限於 manifest 的 matchExpressions。',
    },
  ],
};
