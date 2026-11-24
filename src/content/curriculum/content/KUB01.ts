/*
 * KUB01 Container Orchestration (KUB-1, terminal-sim). The Kubernetes island's first lesson, conceptual first, on the
 * workloads profile (engine stages E32–E34): the limits of single-host Compose (DKR09: one host is one failure domain,
 * restart: always only restarts on that host, manual placement, --scale and fixed host ports, DNS only inside one host's
 * project network); imperative commands versus declared desired state (kubectl apply unchanged / configured); the
 * reconcile (control) loop and its controllers; self-healing seen with a deleted pod (a new name, node and IP, the
 * ReplicaSet's SuccessfulCreate event) versus a bare pod that nobody brings back; scheduling, cordon and drain
 * (--ignore-daemonsets, kube-proxy staying, uncordon not rebalancing); a lesson-declared node failure (NotReady after
 * 50 s, eviction after the 300 s toleration, the old pod left Terminating); service discovery as a concept only
 * (Services are KUB05); and when not to adopt orchestration (a decision table; one VM with Compose, managed platforms).
 * Machines: the workstation tidal-ops (user rin) with kubectl and the admin kubeconfig of a made-up four-node cluster
 * (cp-01, node-01..03), the Deployment shop-web (three replicas of tidal/shop-web:1.4 with a readinessProbe, applied at
 * 09:40) and the Compose file it replaced; the same machine with node-02 failing at 10:01. Control-plane internals
 * (etcd, the scheduler's scoring, the controller manager) are text only. Pod and ReplicaSet names are the engine's
 * hashes, read from kubectl get. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'rin', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'rin', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n';
const TOOLS = ['ls', 'cat', 'echo', 'env', 'sh', 'sleep', 'true', 'false', 'pwd', 'hostname', 'ps'];

const SHOP_WEB: TerminalImage = {
  name: 'tidal/shop-web:1.4', size: 58_400_000, created: '2026-11-20 09:00:00', cmd: ['./shop-web'], workdir: '/app', expose: [8000], service: true, layers: 4, osRelease: DEBIAN,
  env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'APP_VERSION=1.4'], commands: TOOLS,
  logs: ['shop-web 1.4 listening on :8000'], http: { port: 8000, responder: 'shop-web' },
  signals: { TERM: { seconds: 2, logs: ['SIGTERM received, finishing open orders'], exit: 0 } },
};
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
const DEPLOYMENT = yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: shop-web', '  labels:', '    app: shop-web', 'spec:', '  replicas: 3', '  selector:', '    matchLabels:', '      app: shop-web',
  '  template:', '    metadata:', '      labels:', '        app: shop-web', '    spec:', '      containers:', '      - name: web', '        image: tidal/shop-web:1.4', '        ports:', '        - containerPort: 8000',
  '        readinessProbe:', '          httpGet:', '            path: /healthz', '            port: 8000', '          initialDelaySeconds: 3', '          periodSeconds: 5');
const COMPOSE = yaml('services:', '  web:', '    image: tidal/shop-web:1.4', '    ports:', '      - "8000:8000"', '    restart: always');

const kubeOf = (created?: string, failures?: { node: string; at: string }[]): NonNullable<TerminalMachine['kube']> => ({
  nodes: [{ name: 'cp-01', control: true }, { name: 'node-01' }, { name: 'node-02' }, { name: 'node-03' }],
  ...created ? { created } : {},
  images: [{ name: 'tidal/shop-web:1.4', seconds: 4, nodes: ['node-01', 'node-02', 'node-03'] }],
  manifests: [{ text: DEPLOYMENT, at: '2026-11-24 09:40:00', file: 'shop-web.yaml' }],
  ...failures ? { failures } : {},
});
const machine = (id: string, title: string, failures?: { node: string; at: string }[]): TerminalMachine => ({
  id, title, user: 'rin', host: 'tidal-ops', cwd: '/home/rin', profile: 'workloads', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/rin'), dir('/home/rin/k8s'), file('/home/rin/k8s/shop-web.yaml', DEPLOYMENT), dir('/home/rin/shop'), file('/home/rin/shop/compose.yaml', COMPOSE)],
  responders: [{ id: 'shop-web', server: 'shop-web/1.4', routes: [{ path: '/', body: '潮汐咖啡線上點餐\n', type: 'text/html; charset=utf-8' }, { path: '/healthz', body: 'ok\n', type: 'text/plain' }] }],
  docker: { images: [SHOP_WEB] },
  kube: kubeOf(undefined, failures),
});
const MAIN = machine('kub01-tidal', 'tidal-ops（潮汐咖啡的叢集：shop-web 三個副本）');
const STORM = machine('kub01-storm', 'tidal-ops（node-02 將在 10:01 失聯）', [{ node: 'node-02', at: '2026-11-24 10:01:00' }]);

const PODS_START = "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-qbxr4   1/1       Running   0          20m       10.244.3.2   node-03   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>";
const ROLLED = "Waiting for deployment \"shop-web\" rollout to finish: 2 of 3 updated replicas are available...\ndeployment \"shop-web\" successfully rolled out";

export const KUB01: LessonContent = {
  lessonId: 'KUB01',
  motivation: '潮汐咖啡的線上點餐網站在 DKR09 用一個 compose.yaml 跑在 tidal-01 這一台主機上，`docker compose up -d` 一個指令就能把整個應用拉起來。生意變好之後問題接連出現：某個週五晚上 tidal-01 的電源供應器壞了，網站停了兩個小時，`restart: always` 一點忙也沒幫上，因為壞掉的正是負責重新啟動容器的那台機器；想加第二台主機分擔流量，就得自己決定哪個容器放哪台、一台一台 ssh 上去部署、再改負載平衡器的設定；每次換主機的核心或記憶體，都要挑半夜手動把服務搬走再搬回來。容器編排（container orchestration）系統把這些工作交給軟體：你把「我要三個 shop-web、每個長這樣」宣告成期望狀態，由控制平面持續比對實際狀態並自動修正，決定容器放在哪台機器、機器壞了就換到別台。這一課先說清楚單機 Compose 的極限，再介紹 Kubernetes 的核心想法：期望狀態、調和迴圈、排程、自我修復與服務發現；在 tidal-ops 這台工作站上用 `kubectl` 親眼看到刪掉的 Pod 被補回、排空的節點上的 Pod 被移走、失聯的節點上的 Pod 在幾分鐘後換到別的節點。最後也會誠實地討論何時不需要編排：Kubernetes 很強大，但它的學習與維運成本也很真實，很多專案用一台 VM 加 Compose 或託管的平台反而更好。',
  sections: [
    {
      id: 'kub01-s-limits', title: '單機 Compose 的極限',
      blocks: [
        { type: 'p', text: 'DKR09 的 compose.yaml 描述的是「一台 Docker 主機上要跑哪些容器」：Compose 讀檔、建立網路與 Volume、依相依順序啟動容器，然後它的工作就結束了。之後讓容器活著的只有 Docker daemon 的重新啟動策略（restart policy），例如 `restart: always` 讓 daemon 在容器結束時、或主機重開機 daemon 啟動時把它再啟動起來。這對一台機器上的小型應用非常夠用，但所有事情都發生在同一台主機上，這台主機就是唯一的故障域（failure domain）：它的電源、硬碟、核心或網路出問題，上面的每一個容器都跟著停擺，而且沒有任何東西會在別的地方把它們重新跑起來。' },
        { type: 'table', head: ['需求', '單機 Compose 的做法', '卡在哪裡'], rows: [
          ['主機故障時繼續服務', '`restart: always`：容器結束或 daemon 重新啟動後，由同一台主機的 daemon 再啟動它', '主機本身壞了、斷電或斷網，daemon 也跟著消失；只能等人修好主機或在另一台重新部署'],
          ['分散到多台機器', '每台主機各放一份 compose.yaml，各自執行 `docker compose up -d`', '哪個服務放哪台由人決定、由人記錄；某台滿了或壞了，要人重新分配（手動放置）'],
          ['增加副本', '`docker compose up -d --scale web=3`', '只能在同一台主機上多開容器，上限就是這台的 CPU 與記憶體；寫死的主機埠（`"8000:8000"`）只能被一個容器佔用，第二個副本會因為埠已被使用而啟動失敗'],
          ['找到其他服務', '專案網路的內建 DNS：app 用服務名稱 `db` 連到資料庫', '只在同一台主機、同一個專案網路裡有效；跨主機時要自己維護位址清單或負載平衡器的設定'],
          ['更新與主機維護', '`docker compose up -d` 重建容器；維護主機時先停服務', '重建期間服務中斷；要搬到別台得自己安排順序與切換流量'],
        ] },
        { type: 'p', text: '把這些問題歸納起來，缺的是四種能力：跨多台機器自動挑選位置（排程）、在容器或機器出事時自動補回（自我修復）、容器換了位置之後別人仍然找得到它（服務發現），以及把「要什麼」記錄成一份由系統負責維持的期望狀態，而不是只存在某個人執行過的指令裡。容器編排系統就是提供這些能力的軟體；Kubernetes 是目前最普遍的一個，本島從這一課開始學它。Docker 自己也有叢集模式（Swarm 模式），觀念相近，但本島以 Kubernetes 為主。' },
        { type: 'callout', tone: 'warning', title: '`restart: always` 不等於高可用', text: '常見的誤解是「compose.yaml 寫了 `restart: always`，服務就不會停」。重新啟動策略只處理「容器自己結束了」或「Docker daemon 重新啟動了」這兩種情況，而且永遠是同一台主機上的 daemon 在處理。主機的硬體故障、作業系統當機、網路中斷，或是你為了更新核心而關機，這段期間服務就是停的。真正的高可用需要至少兩台機器上各有副本，並且有東西負責在某台失聯時把工作換到別台，這正是編排系統的工作。' },
      ],
    },
    {
      id: 'kub01-s-desired', title: '期望狀態：宣告你要什麼，而不是一步步下指令',
      blocks: [
        { type: 'p', text: '操作系統的方式大致分成兩種。命令式（imperative）是一步步告訴系統「做什麼」：`docker run` 開一個容器、`docker stop` 停一個容器，系統照做，但不記得你想要的最終結果；指令執行完之後實際狀態再怎麼變，都不會有人把它改回來。宣告式（declarative）則是描述「最後要長什麼樣子」，例如「shop-web 要有 3 個副本、用 tidal/shop-web:1.4」，再由系統想辦法讓實際狀態符合它。這份描述就是期望狀態（desired state）。Compose 的檔案也是宣告式的，但只在你執行 `up` 的那一刻比對一次；Kubernetes 把期望狀態存起來，之後持續比對、持續修正。' },
        { type: 'table', head: ['', '命令式', '宣告式（Kubernetes 的期望狀態）'], rows: [
          ['你提供的', '一連串動作：建立、停止、再建立', '一份描述最終結果的 manifest（YAML）'],
          ['重複執行同一個操作', '`docker run` 再執行一次會多一個容器（或因名稱重複而失敗）', '`kubectl apply -f` 同一份檔案再執行一次：沒有變化，印出 `unchanged`'],
          ['實際狀態偏離時', '沒有人知道原本要什麼，要人發現並手動修', '控制器發現與期望狀態不同，自動修正'],
          ['記錄在哪裡', '執行過的指令、Shell 的歷史、某人的記憶', 'API server 儲存的物件（背後是 etcd），manifest 也能和程式碼一起進版本控制'],
        ] },
        { type: 'p', text: 'Kubernetes 叢集由兩部分組成：控制平面（control plane）負責保存期望狀態並做決定，主要元件是 API server、etcd（儲存所有物件的資料庫）、排程器（scheduler）與控制器管理員（controller manager）；工作節點（worker node）上的 kubelet 負責真正啟動容器並回報狀態。你在自己的電腦上用 `kubectl` 把物件送到 API server，從不直接登入節點去開容器。各元件之間的細節是 KUB02 的主題，這一課只需要知道誰負責什麼。' },
        { type: 'p', text: 'tidal-ops 是潮汐咖啡維運用的工作站，`kubectl` 已經設定好連到一個四台機器的叢集：cp-01 是控制平面，node-01、node-02、node-03 是工作節點。09:40 有人以 `kubectl apply -f k8s/shop-web.yaml` 建立了 Deployment shop-web，要求 3 個副本。下面先對照舊的 compose.yaml 與新的 manifest，看看叢集的實際狀態，再把期望的副本數從 3 改成 4：' },
        { type: 'example', id: 'kub01-desired' },
        { type: 'p', text: '幾個地方值得注意。第一，manifest 只寫了「3 個副本」，沒有說放在哪台機器，排程器把它們分散到三個工作節點，每個 Pod 拿到自己的 IP。Pod 是 Kubernetes 執行容器的最小單位（一個或多個容器加上共用的網路，KUB03 細看）；名稱 `shop-web-z626dpnqbg-7zcp7` 裡的兩段後綴分別來自 ReplicaSet 與 Pod 本身，由系統產生，所以操作時要從 `kubectl get` 讀出名稱，不要自己猜。第二，對同一份檔案再執行一次 `kubectl apply`，結果是 `unchanged`：宣告式的操作可以安全地重複執行。第三，把 `replicas` 改成 4 再 apply，結果是 `configured`，你沒有說「再開一個容器」，只是改了期望狀態，控制器發現實際只有 3 個，就補了第 4 個。新的 Pod 一開始是 `0/1`，因為 manifest 裡的 readinessProbe 要它啟動 3 秒後先通過 `/healthz` 的檢查才算就緒（探針是 KUB03 的主題）；`kubectl rollout status` 會等到所有副本都可用才結束。' },
        { type: 'table', head: ['面向', 'Docker Compose（DKR09）', 'Kubernetes'], rows: [
          ['描述檔', 'compose.yaml 的 `services:`', 'Deployment 等物件的 manifest（`apiVersion`、`kind`、`spec`）'],
          ['作用範圍', '一台 Docker 主機', '多個節點組成的叢集'],
          ['誰維持期望狀態', '只在 `docker compose up` 的那一刻比對；之後靠同一台主機的 restart policy', '控制器持續比對並修正，直到你改變或刪除期望狀態'],
          ['容器放在哪裡', '執行指令的那台主機', '排程器依資源與限制挑選節點'],
          ['副本', '`--scale` 在同一台主機上多開', '`replicas` 分散到多個節點'],
          ['找到其他服務', '專案網路上以服務名稱查 DNS', 'Service 提供穩定的名稱與虛擬 IP（KUB05）'],
          ['主機或節點故障', '上面的服務停止，等人處理', '節點被標成 NotReady，上面的 Pod 在其他節點重建'],
          ['學習與維運成本', '低：一個指令、一個檔案', '高：叢集本身也要安裝、升級、監控與保護'],
        ] },
      ],
    },
    {
      id: 'kub01-s-reconcile', title: '調和迴圈與自我修復',
      blocks: [
        { type: 'p', text: '期望狀態要有人負責兌現。Kubernetes 的做法是許多個控制器（controller），每個都跑著同樣形狀的調和迴圈（reconcile loop，也叫控制迴圈）：觀察實際狀態、和期望狀態比較、採取行動縮小差距，然後一直重複。這和冷氣的恆溫器一樣：你設定 26 度（期望狀態），恆溫器不斷量室溫（觀察），太熱就送冷氣（行動），不需要你每隔幾分鐘去按一次開關。' },
        { type: 'list', ordered: true, items: [
          '觀察：從 API server 讀出目前的物件與狀態，例如「標籤 app=shop-web 的 Pod 目前有 2 個在執行」。',
          '比較：和期望狀態比對，例如 ReplicaSet 的 `spec.replicas` 是 3。',
          '行動：送出縮小差距的變更，例如建立 1 個新的 Pod；新的 Pod 還沒有節點，排程器替它挑一台，那台的 kubelet 再把容器跑起來。',
          '重複：不論差距是怎麼產生的（有人刪了 Pod、節點壞了、容器結束），下一輪都會再比對一次。',
        ] },
        { type: 'p', text: '這種設計稱為以狀態為準（level-triggered）：控制器看的是「現在差多少」，不是「剛剛發生了什麼事件」，所以就算某個事件漏掉了、控制器重新啟動了，下一次比對仍然會把狀態修正回來。shop-web 牽涉到三層：Deployment 控制器維持一個符合範本的 ReplicaSet，ReplicaSet 控制器維持正確數量的 Pod，各節點的 kubelet 維持 Pod 裡的容器在執行（這些物件的關係是 KUB04 的主題）。下面刪掉 node-03 上的那個 Pod，模擬它意外消失，看控制器怎麼反應；最後再用 `kubectl run` 建一個沒有任何控制器管理的 Pod（bare pod）做對照：' },
        { type: 'example', id: 'kub01-heal' },
        { type: 'p', text: '刪除之後，ReplicaSet 控制器看到符合條件的 Pod 只剩 2 個，少於期望的 3 個，立刻建立了 `shop-web-z626dpnqbg-mcwnc`，`kubectl events` 的最後一行就是它記下的 `SuccessfulCreate`。這就是自我修復（self-healing）：沒有人下「重建」的指令，系統自己把實際狀態拉回期望狀態。注意替代品不是原來那個 Pod 被搬過去：它有新的名稱、被排到 node-01、拿到新的 IP 10.244.1.3，原本 10.244.3.2 的 Pod 已經不存在了。對照組 scratch 沒有任何控制器在乎它，刪掉就真的沒了。所以正式的應用永遠透過 Deployment 這類控制器來執行，而不是直接建立 Pod。' },
        { type: 'table', head: ['發生的事', '誰處理', '怎麼處理'], rows: [
          ['容器的主程式結束或當掉', '那個節點上的 kubelet', '依 `restartPolicy` 在同一個 Pod 裡重新啟動容器，次數多了會以 CrashLoopBackOff 拉長間隔'],
          ['Pod 被刪除或被驅逐', 'ReplicaSet 控制器', '建立新的 Pod 補足數量，由排程器挑節點'],
          ['節點失聯', '節點生命週期控制器加上 ReplicaSet 控制器', '先把節點標成 NotReady，等候一段時間後驅逐上面的 Pod，再在其他節點重建'],
          ['程式本身有錯（每個副本都當掉）', '沒有人能修', '自我修復只會一直重啟，Pod 停在 CrashLoopBackOff；要修程式或退回舊版'],
          ['叢集的資源不夠', '排程器', '找不到放得下的節點，新的 Pod 停在 Pending，直到有資源為止'],
        ] },
        { type: 'callout', tone: 'warning', title: '刪掉 Pod 不能讓應用停下來', text: '剛接觸 Kubernetes 的人想停掉一個應用時，常會 `kubectl delete pod`，結果發現 Pod 一直「刪不掉」：其實每次都刪掉了，只是控制器立刻補了一個新的。Pod 只是期望狀態的執行結果，要改變結果就要改期望狀態：暫停服務用 `kubectl scale deployment shop-web --replicas=0`，不要了才刪除 Deployment。反過來，誤刪 Deployment 才是真正的事故：期望狀態本身沒了，它的 ReplicaSet 與 Pod 會被一起回收，沒有任何東西會把它們補回來。' },
      ],
    },
    {
      id: 'kub01-s-schedule', title: '排程、節點維護與節點故障',
      blocks: [
        { type: 'p', text: '新的 Pod 剛建立時還沒有節點。排程（scheduling）是排程器替每個還沒指定節點的 Pod 挑一台機器：先過濾掉放不下的節點（剩下的 CPU、記憶體不夠，或節點有 Pod 不能容忍的 taint、不符合 nodeSelector），再替剩下的節點打分數（例如資源使用比較少的、能讓副本分散的分數比較高），選最高分的那台，把結果寫回 Pod 的 `spec.nodeName`。之後那台的 kubelet 看到有 Pod 指定給自己，才去拉 Image、啟動容器。排程只決定「新的 Pod 放哪裡」，不會移動已經在執行的 Pod。排程器的評分細節是課文說明的範圍，資源需求（requests）與限制在 KUB10 介紹。' },
        { type: 'p', text: '有了排程，維護一台機器就不必停掉整個服務。`kubectl cordon` 把節點標成不可排程（SchedulingDisabled），之後不會再有新的 Pod 放上去，但已經在上面的 Pod 照常執行。`kubectl drain` 先 cordon，再把節點上的 Pod 一個個驅逐（eviction），讓它們的控制器在其他節點建立替代品。drain 有兩類 Pod 不會自動處理：DaemonSet 的 Pod（例如每個節點各一個的 kube-proxy），它們本來就該留在每個節點上，要加 `--ignore-daemonsets` 表示略過它們；沒有控制器的 bare pod 驅逐了就不會回來，要加 `--force` 才肯刪除。正式環境還可以用 PodDisruptionBudget 規定「同時最多只能少幾個副本」，驅逐會遵守它（這一課的叢集沒有設定，僅在課文說明）。下面在 node-03 上示範：' },
        { type: 'example', id: 'kub01-drain' },
        { type: 'p', text: '第一次的 `kubectl drain node-03` 失敗了，原因是 kube-proxy 這個 DaemonSet 的 Pod；但輸出的第一行已經是 `node/node-03 cordoned`，節點維持不可排程，shop-web 的 Pod 卻一個也沒有被驅逐。加上 `--ignore-daemonsets` 之後，`qbxr4` 被驅逐，替代品出現在 node-01。用 `--field-selector spec.nodeName=node-03` 可以只列出某個節點上的 Pod：加 `-A` 看所有命名空間，只剩 kube-proxy；再加上 `-l app=shop-web` 就只看 shop-web，結果是 `No resources found`。最後 `kubectl uncordon node-03` 讓節點恢復可排程，但 Pod 不會自動搬回去：Kubernetes 只在建立新的 Pod 時排程，不會主動重新平衡已經在執行的 Pod。' },
        { type: 'p', text: '節點維護是計畫好的；節點故障則是突然發生的。節點上的 kubelet 定期向控制平面回報（心跳），控制平面在一段寬限期內收不到心跳，就把節點的 Ready 條件改成 Unknown，`kubectl get nodes` 顯示 NotReady，並替節點加上 `node.kubernetes.io/unreachable` 的 taint。Pod 預設對這個 taint 有 300 秒的容忍時間（tolerationSeconds），時間一到才被驅逐，由 ReplicaSet 在其他節點重建。下面的叢集預先安排 node-02 在 10:01:00 失聯，現在是 10:00:00：' },
        { type: 'example', id: 'kub01-failure' },
        { type: 'table', head: ['時間（UTC）', '叢集裡發生什麼', '你從 kubectl 看到什麼'], rows: [
          ['10:01:00', 'node-02 的 kubelet 停止回報', '什麼都還沒變：node-02 仍是 Ready'],
          ['10:01:50（50 秒後）', '控制平面判定節點失聯：Ready 變 Unknown，加上 unreachable 的 taint；上面 Pod 的 Ready 條件改為 False', '`get nodes` 是 NotReady；Deployment 的 READY 變 2/3；`get pods` 卻還是 `1/1 Running`，因為那是 kubelet 最後一次回報的內容'],
          ['10:06:50（再過 300 秒）', 'Pod 的容忍時間用完，被標記刪除（TaintManagerEviction）；ReplicaSet 在其他節點建立替代的 Pod', '舊的 Pod 顯示 Terminating，新的 Pod 出現在 node-01'],
          ['10:06:53 左右', '替代的 Pod 通過 readinessProbe', 'Deployment 回到 3/3；舊的 Pod 一直停在 Terminating'],
        ] },
        { type: 'p', text: '為什麼要等那麼久？網路短暫抖動也會讓心跳斷幾秒，如果一斷就把所有 Pod 搬走，反而會造成大量不必要的重建。等候時間是可以調整的：50 秒是控制器管理員 `--node-monitor-grace-period` 在這個模擬叢集的值（預設值隨版本調整過），300 秒則可以在 Pod 的 tolerations 裡逐一縮短。舊的 Pod 停在 Terminating，是因為失聯的 kubelet 無法確認容器真的停了，Kubernetes 不會假裝它已經消失；對無狀態的 shop-web 這無妨，對資料庫這類有狀態的應用就很重要（KUB08）。這一課的練習會讓你親自等完整個過程。' },
      ],
    },
    {
      id: 'kub01-s-discovery', title: '服務發現：Pod 會換，名字不能換',
      blocks: [
        { type: 'p', text: '前面的每個例子都看到同一件事：自我修復產生的是新的 Pod，名稱與 IP 都會改變。node-03 上 10.244.3.2 的 Pod 被刪掉，接手的是 node-01 上 10.244.1.3 的 Pod；滾動更新、擴縮、節點故障也都一樣。如果點餐網站的前端把 shop-web 的 Pod IP 寫在設定檔裡，每次自我修復之後就會連到一個已經不存在的位址。服務發現（service discovery）要解決的就是：用戶端如何用一個固定的名稱，找到「現在」正在執行而且就緒的那些副本。' },
        { type: 'table', head: ['做法', '在哪裡有效', '問題'], rows: [
          ['把 IP 寫死在設定裡', '任何地方', 'Pod 換掉就失效，副本增減也不會更新'],
          ['Compose 的服務名稱（DKR09）', '同一台主機的同一個專案網路', '跨主機無效；只對應到這台主機上的容器'],
          ['Kubernetes 的 Service（KUB05）', '整個叢集', '以標籤選擇器（例如 `app=shop-web`）選出 Pod，提供穩定的虛擬 IP 與叢集 DNS 名稱（例如 `shop-web.default.svc.cluster.local`），自動跟著就緒的 Pod 更新'],
          ['外部的負載平衡器', '叢集外的使用者', '需要有東西把它的後端清單跟著叢集更新，通常由 Service 或 Ingress（KUB07）接手'],
        ] },
        { type: 'p', text: '這裡的關鍵是標籤（label）：ReplicaSet 用 `app=shop-web` 認出哪些 Pod 屬於它，Service 也用同樣的標籤選出要把流量送給誰。名稱會變、IP 會變，標籤跟著範本走，所以新的 Pod 一出現就自動被納入。readinessProbe 在這裡也有角色：還沒就緒的 Pod（前面看到的 `0/1`）不會收到 Service 轉來的流量，這是 KUB11 談不停機更新的基礎。這一課的叢集還沒有建立 Service，`kubectl expose` 與叢集 DNS 要到 KUB05 才實際操作，現在只要記得：在編排系統裡，用戶端永遠透過名稱找服務，而不是透過某一個 Pod。' },
      ],
    },
    {
      id: 'kub01-s-when', title: '何時不需要編排',
      blocks: [
        { type: 'p', text: '前面的能力都不是免費的。採用 Kubernetes，等於多了一套需要照顧的分散式系統：控制平面要安裝、備份與升級（社群大約每年發布三個小版本，每個版本的修補支援只有一年多，落後太多就得連續升級好幾次）；YAML、網路、儲存、權限（RBAC）、監控與日誌都要有人懂；出事時要能分辨是程式、容器、節點還是叢集本身的問題。託管的 Kubernetes 服務可以代管控制平面，降低一部分負擔，但工作負載的設計、資源設定、升級相容性與排錯仍然是你的工作。所以判斷要不要採用，看的是你的問題是否真的需要這些能力，以及團隊是否有能力承擔，而不是它流不流行。' },
        { type: 'table', head: ['考量', '比較不需要編排', '比較需要編排'], rows: [
          ['團隊規模與維運人力', '1 到 5 人，沒有人專職維運', '有人或專門的團隊能負責平台，並排班處理事故'],
          ['流量與可用性要求', '流量穩定，可以接受維護時短暫停機', '流量起伏大、需要多個副本，更新與主機維護都不能停機'],
          ['服務數量', '一兩個服務加一個資料庫', '十幾個以上的服務，由多個團隊各自部署'],
          ['維運能力', '還沒有自動化部署、監控與告警', '已有 CI/CD 流程（CICD 島）、監控與事故處理的習慣'],
          ['基礎設施規模', '一兩台 VM 就放得下', '需要很多台機器，甚至跨多個可用區'],
        ] },
        { type: 'list', items: [
          '一台 VM 加上 Compose：配上定期備份、監控與一份寫好的重建步驟，對小型應用往往是最划算的選擇；需要時再準備第二台做備援。',
          '託管的容器平台（PaaS、無伺服器容器）：把 Image 交給平台，平台負責放置、擴縮與重新啟動；可調整的地方較少，但幾乎不用維運叢集。',
          '託管的 Kubernetes：需要 Kubernetes 的彈性與生態系，又不想自己維運控制平面時的折衷。',
          '自行架設的 Kubernetes：有法規、內部機房或特殊硬體的需求，而且有專職團隊時才考慮。',
        ] },
        { type: 'callout', tone: 'tip', title: '潮汐咖啡的判斷', text: '潮汐咖啡只有兩位工程師、一個網站加一個資料庫時，DKR09 的 Compose 加上一台備援主機其實就夠了；決定導入 Kubernetes，是因為業務擴展到外送與會員服務、服務數量增加、尖峰流量是平日的好幾倍，而且公司請了專人負責平台。如果你的專案還在第一種狀態，先把 Compose、備份、監控與 CI/CD 做好，比提早搬上 Kubernetes 更能提高可靠性。避免過早採用，和在需要時及時採用一樣重要。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [MAIN, STORM],
    examples: [
      {
        id: 'kub01-desired', title: '從 compose.yaml 到期望狀態', machine: 'kub01-tidal',
        description: '對照單機的 compose.yaml 與叢集的 Deployment；看節點、Deployment 與分散在三個節點上的 Pod；同一份檔案 apply 兩次是 unchanged，把 replicas 改成 4 之後 configured，控制器補上第 4 個 Pod。',
        steps: [
          { command: 'cat shop/compose.yaml', output: "services:\n  web:\n    image: tidal/shop-web:1.4\n    ports:\n      - \"8000:8000\"\n    restart: always" },
          { command: 'cat k8s/shop-web.yaml', output: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: shop-web\n  labels:\n    app: shop-web\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: shop-web\n  template:\n    metadata:\n      labels:\n        app: shop-web\n    spec:\n      containers:\n      - name: web\n        image: tidal/shop-web:1.4\n        ports:\n        - containerPort: 8000\n        readinessProbe:\n          httpGet:\n            path: /healthz\n            port: 8000\n          initialDelaySeconds: 3\n          periodSeconds: 5" },
          { command: 'kubectl get nodes', output: "NAME      STATUS    ROLES           AGE       VERSION\ncp-01     Ready     control-plane   30d       v1.32.3\nnode-01   Ready     <none>          30d       v1.32.3\nnode-02   Ready     <none>          30d       v1.32.3\nnode-03   Ready     <none>          30d       v1.32.3" },
          { command: 'kubectl get deployment shop-web', output: "NAME       READY     UP-TO-DATE   AVAILABLE   AGE\nshop-web   3/3       3            3           20m" },
          { command: 'kubectl get pods -o wide', output: PODS_START },
          { command: 'kubectl apply -f k8s/shop-web.yaml', output: "deployment.apps/shop-web unchanged" },
          { command: "sed -i 's/replicas: 3/replicas: 4/' k8s/shop-web.yaml", output: "" },
          { command: 'kubectl apply -f k8s/shop-web.yaml', output: "deployment.apps/shop-web configured" },
          { command: 'kubectl get pods -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-mcwnc   0/1       Running   0          0s        10.244.1.3   node-01   <none>           <none>\nshop-web-z626dpnqbg-qbxr4   1/1       Running   0          20m       10.244.3.2   node-03   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>" },
          { command: 'kubectl rollout status deployment/shop-web', output: "Waiting for deployment \"shop-web\" rollout to finish: 3 of 4 updated replicas are available...\ndeployment \"shop-web\" successfully rolled out" },
          { command: 'kubectl get deployment shop-web', output: "NAME       READY     UP-TO-DATE   AVAILABLE   AGE\nshop-web   4/4       4            4           20m" },
        ],
      },
      {
        id: 'kub01-heal', title: '刪掉一個 Pod，看控制器補回來', machine: 'kub01-tidal',
        description: '刪除 node-03 上的 Pod 之後，ReplicaSet 立刻建立新的 Pod（新名稱、新節點、新 IP），rollout status 等它就緒；沒有控制器的 bare pod scratch 刪掉就不會回來。',
        steps: [
          { command: 'kubectl get pods -o wide', output: PODS_START },
          { command: 'kubectl delete pod shop-web-z626dpnqbg-qbxr4', output: "pod \"shop-web-z626dpnqbg-qbxr4\" deleted" },
          { command: 'kubectl get pods -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-mcwnc   0/1       Running   0          2s        10.244.1.3   node-01   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>" },
          { command: 'kubectl get deployment shop-web', output: "NAME       READY     UP-TO-DATE   AVAILABLE   AGE\nshop-web   2/3       3            2           20m" },
          { command: 'kubectl rollout status deployment/shop-web', output: ROLLED },
          { command: 'kubectl events --for rs/shop-web-z626dpnqbg', output: "LAST SEEN   TYPE      REASON             OBJECT                           MESSAGE\n20m         Normal    SuccessfulCreate   ReplicaSet/shop-web-z626dpnqbg   Created pod: shop-web-z626dpnqbg-7zcp7\n20m         Normal    SuccessfulCreate   ReplicaSet/shop-web-z626dpnqbg   Created pod: shop-web-z626dpnqbg-snq6k\n20m         Normal    SuccessfulCreate   ReplicaSet/shop-web-z626dpnqbg   Created pod: shop-web-z626dpnqbg-qbxr4\n3s          Normal    SuccessfulCreate   ReplicaSet/shop-web-z626dpnqbg   Created pod: shop-web-z626dpnqbg-mcwnc" },
          { command: 'kubectl run scratch --image=tidal/shop-web:1.4', output: "pod/scratch created" },
          { command: 'kubectl delete pod scratch', output: "pod \"scratch\" deleted" },
          { command: 'kubectl get pods', output: "NAME                        READY     STATUS    RESTARTS   AGE\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m\nshop-web-z626dpnqbg-mcwnc   1/1       Running   0          5s\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m" },
        ],
      },
      {
        id: 'kub01-drain', title: '排空 node-03 再恢復', machine: 'kub01-tidal',
        description: '沒有 --ignore-daemonsets 的 drain 因 kube-proxy 失敗但節點已被 cordon；加上之後 shop-web 的 Pod 被驅逐並在 node-01 重建；node-03 只剩 kube-proxy；uncordon 不會把 Pod 搬回來。',
        steps: [
          { command: 'kubectl drain node-03', output: "node/node-03 cordoned\nerror: unable to drain node \"node-03\" due to error: cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore): kube-system/kube-proxy-hlkm6, continuing command...\nThere are pending nodes to be drained:\n node-03\nerror: cannot delete DaemonSet-managed Pods (use --ignore-daemonsets to ignore): kube-system/kube-proxy-hlkm6" },
          { command: 'kubectl get nodes', output: "NAME      STATUS                     ROLES           AGE       VERSION\ncp-01     Ready                      control-plane   30d       v1.32.3\nnode-01   Ready                      <none>          30d       v1.32.3\nnode-02   Ready                      <none>          30d       v1.32.3\nnode-03   Ready,SchedulingDisabled   <none>          30d       v1.32.3" },
          { command: 'kubectl drain node-03 --ignore-daemonsets', output: "node/node-03 already cordoned\nWarning: ignoring DaemonSet-managed Pods: kube-system/kube-proxy-hlkm6\nevicting pod default/shop-web-z626dpnqbg-qbxr4\npod/shop-web-z626dpnqbg-qbxr4 evicted\nnode/node-03 drained" },
          { command: 'kubectl get pods -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-mcwnc   0/1       Running   0          2s        10.244.1.3   node-01   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>" },
          { command: 'kubectl rollout status deployment/shop-web', output: ROLLED },
          { command: 'kubectl get pods -A -o wide --field-selector spec.nodeName=node-03', output: "NAMESPACE     NAME               READY     STATUS    RESTARTS   AGE       IP          NODE      NOMINATED NODE   READINESS GATES\nkube-system   kube-proxy-hlkm6   1/1       Running   0          30d       10.0.0.53   node-03   <none>           <none>" },
          { command: 'kubectl get pods -l app=shop-web --field-selector spec.nodeName=node-03', output: "No resources found in default namespace." },
          { command: 'kubectl uncordon node-03', output: "node/node-03 uncordoned" },
          { command: 'kubectl get pods -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          20m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-mcwnc   1/1       Running   0          3s        10.244.1.3   node-01   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          20m       10.244.2.2   node-02   <none>           <none>" },
        ],
      },
      {
        id: 'kub01-failure', title: '節點失聯的前兩分鐘', machine: 'kub01-storm',
        description: 'node-02 在 10:01:00 失聯；10:02 時它已是 NotReady，Deployment 只剩 2/3，但 get pods 仍顯示 node-02 上的 Pod 是 1/1 Running，事件記下 NodeNotReady。',
        steps: [
          { command: 'kubectl get pods -o wide', output: PODS_START },
          { command: 'sleep 120', output: "" },
          { command: 'date', output: "Tue Nov 24 10:02:00 UTC 2026" },
          { command: 'kubectl get nodes', output: "NAME      STATUS     ROLES           AGE       VERSION\ncp-01     Ready      control-plane   30d       v1.32.3\nnode-01   Ready      <none>          30d       v1.32.3\nnode-02   NotReady   <none>          30d       v1.32.3\nnode-03   Ready      <none>          30d       v1.32.3" },
          { command: 'kubectl get pods -o wide', output: "NAME                        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nshop-web-z626dpnqbg-7zcp7   1/1       Running   0          22m       10.244.1.2   node-01   <none>           <none>\nshop-web-z626dpnqbg-qbxr4   1/1       Running   0          22m       10.244.3.2   node-03   <none>           <none>\nshop-web-z626dpnqbg-snq6k   1/1       Running   0          22m       10.244.2.2   node-02   <none>           <none>" },
          { command: 'kubectl get deployment shop-web', output: "NAME       READY     UP-TO-DATE   AVAILABLE   AGE\nshop-web   2/3       3            2           22m" },
          { command: 'kubectl events --types=Warning', output: "LAST SEEN   TYPE      REASON         OBJECT                          MESSAGE\n10s         Warning   NodeNotReady   Pod/shop-web-z626dpnqbg-snq6k   Node is not ready" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub01-x-heal', title: '讓 node-02 上的 Pod 換一個新的', machine: 'kub01-tidal',
        statement: '值班的同事回報：node-02 上那個 shop-web 的 Pod 回應忽快忽慢，想先讓它換成一個全新的 Pod 觀察看看。請找出目前在 node-02 上的 shop-web Pod，只刪掉它（不要動 Deployment），然後等控制器補回，直到 shop-web 再次有 3 個就緒、可用的 Pod。Pod 的名稱請從 `kubectl get` 讀出來。',
        checks: [
          { kind: 'kube-object', resource: 'Pod', name: 'shop-web-z626dpnqbg-snq6k', absent: true },
          { kind: 'kube-workload', name: 'shop-web', replicas: 3, readyReplicas: 3, availableReplicas: 3 },
          { kind: 'kube-pod', selector: 'app=shop-web', count: 3, status: 'Running', ready: true },
        ],
        solution: ['kubectl get pods -o wide', 'kubectl delete pod shop-web-z626dpnqbg-snq6k', 'kubectl rollout status deployment/shop-web'],
        mistakes: [
          { commands: ['kubectl delete deployment shop-web', 'kubectl get pods'], why: '刪掉的是 Deployment，也就是期望狀態本身：它的 ReplicaSet 被回收、三個 Pod 都進入 Terminating，沒有任何控制器會再把 Pod 補回來。' },
          { commands: ['kubectl get pods -o wide', 'kubectl delete pod shop-web-z626dpnqbg-snq6k', 'kubectl get deployment shop-web'], why: '刪除後立刻檢查：替代的 Pod 已經建立，但 readinessProbe 要它啟動 3 秒後才檢查，這時只有 2 個就緒（READY 2/3）；要用 `kubectl rollout status` 等到全部可用。' },
          { commands: ['kubectl get pods -o wide', 'kubectl delete pod shop-web-z626dpnqbg-7zcp7', 'kubectl rollout status deployment/shop-web'], why: '刪錯了 Pod：`7zcp7` 在 node-01 上，node-02 上那個有問題的 Pod 還在。要看 `-o wide` 的 NODE 欄再決定刪哪一個。' },
        ],
        hints: ['`kubectl get pods -o wide` 的 NODE 欄告訴你每個 Pod 在哪個節點。', '`kubectl delete pod 名稱` 只刪一個 Pod；Deployment 不要動。', '刪除後用 `kubectl rollout status deployment/shop-web` 等到所有副本都可用。'],
        explanation: '`kubectl get pods -o wide` 顯示 node-02 上的是 `shop-web-z626dpnqbg-snq6k`。刪掉它之後，ReplicaSet 控制器看到只剩 2 個符合 `app=shop-web` 的 Pod，少於期望的 3 個，立刻建立替代品；新的 Pod 要通過 readinessProbe 才就緒，所以用 `kubectl rollout status` 等到 3 個都可用。這就是調和迴圈：你沒有下「建立 Pod」的指令，只是讓實際狀態偏離期望狀態，控制器就把它拉回來。替代品的名稱、節點與 IP 都和原來不同。',
      },
      {
        id: 'kub01-x-drain', title: '維護前排空 node-01', machine: 'kub01-tidal',
        statement: 'node-01 今晚要停機更換記憶體。請讓它不再接收新的 Pod，並以安全的方式把上面的 shop-web Pod 移到其他節點（kube-system 裡 DaemonSet 的 Pod 留在原地是正常的）。完成後等 shop-web 回到 3 個就緒、可用的 Pod，最後用 `kubectl get pods -A --field-selector spec.nodeName=node-01` 列出 node-01 上還剩哪些 Pod，確認只剩 kube-system 的 kube-proxy。',
        checks: [
          { kind: 'kube-object', resource: 'Node', name: 'node-01', fields: [{ path: '.spec.unschedulable', equals: 'true' }] },
          { kind: 'kube-object', resource: 'Pod', name: 'shop-web-z626dpnqbg-7zcp7', absent: true },
          { kind: 'kube-workload', name: 'shop-web', readyReplicas: 3, availableReplicas: 3 },
          { kind: 'output', fromCommand: '^kubectl get (pods|pod|po) .*node-01' },
        ],
        variants: [{ label: '另一個建立時間較早的叢集', files: [], kube: kubeOf('2026-09-15 08:00:00') }],
        solution: ['kubectl drain node-01 --ignore-daemonsets', 'kubectl rollout status deployment/shop-web', 'kubectl get pods -A --field-selector spec.nodeName=node-01'],
        mistakes: [
          { commands: ['kubectl drain node-01', 'kubectl rollout status deployment/shop-web', 'kubectl get pods -A --field-selector spec.nodeName=node-01'], why: '忘了 `--ignore-daemonsets`：node-01 上有 kube-proxy 這個 DaemonSet 的 Pod，drain 回報錯誤就停下來了。節點雖然已經被 cordon，shop-web 的 Pod 卻一個也沒有被驅逐，還在 node-01 上。' },
          { commands: ['kubectl cordon node-01', 'kubectl rollout status deployment/shop-web', 'kubectl get pods -A --field-selector spec.nodeName=node-01'], why: '`cordon` 只讓節點不再接新的 Pod，已經在上面執行的 Pod 不會被移走；停機時它還是會一起停掉。' },
          { commands: ['kubectl delete pod shop-web-z626dpnqbg-7zcp7', 'kubectl rollout status deployment/shop-web', 'kubectl get pods -A --field-selector spec.nodeName=node-01'], why: '只刪 Pod 沒有 cordon：節點仍然可以排程，排程器又把替代的 Pod 放回 node-01，問題一點也沒解決。' },
          { commands: ['kubectl drain node-01 --ignore-daemonsets', 'kubectl get pods -A --field-selector spec.nodeName=node-01'], why: '沒有等替代的 Pod 就緒：drain 只等被驅逐的 Pod 消失，不等新的 Pod 通過 readinessProbe，這時 shop-web 只有 2 個就緒。' },
        ],
        hints: ['`kubectl drain` 等於先 cordon、再驅逐節點上的 Pod。', 'kube-proxy 是 DaemonSet 的 Pod，要加 `--ignore-daemonsets` 才能繼續。', 'drain 結束後用 `kubectl rollout status deployment/shop-web` 等替代的 Pod 就緒，再用題目給的 `kubectl get pods -A --field-selector …` 確認。'],
        explanation: '`kubectl drain node-01 --ignore-daemonsets` 先把 node-01 標成不可排程（`spec.unschedulable: true`），略過 kube-proxy，再驅逐 shop-web 在 node-01 上的 Pod `7zcp7`；ReplicaSet 隨即在其他節點建立替代品，因為 node-01 已經不可排程，它不會被放回來。drain 只等被驅逐的 Pod 消失，所以還要用 `kubectl rollout status` 等新的 Pod 就緒，最後以欄位選擇器 `spec.nodeName=node-01` 列出所有命名空間在 node-01 上的 Pod，只剩 DaemonSet 的 kube-proxy。維護完成後執行 `kubectl uncordon node-01`，節點才會再接收新的 Pod。',
      },
      {
        id: 'kub01-x-outage', title: '等 Kubernetes 自己修好節點故障', machine: 'kub01-storm',
        statement: '這個叢集預先安排了一次故障：node-02 的 kubelet 會在 10:01:00（UTC）停止回報，就像機器突然斷電；現在是 10:00:00。節點不能 ssh，也不需要你修理。請不要刪除任何東西，只用 `sleep`、`kubectl get`、`kubectl wait` 這類指令等候並觀察，直到 Kubernetes 自己完成修復：node-02 被標為 NotReady、它上面的 shop-web Pod 被標記刪除（Terminating），shop-web 在其他節點補回 3 個就緒、可用的 Pod。',
        checks: [
          { kind: 'kube-object', resource: 'Node', name: 'node-02', fields: [{ path: '.status.conditions[?(@.type=="Ready")].status', equals: 'Unknown' }] },
          { kind: 'kube-pod', name: 'shop-web-z626dpnqbg-snq6k', status: 'Terminating' },
          { kind: 'kube-workload', name: 'shop-web', readyReplicas: 3, availableReplicas: 3 },
        ],
        solution: ['sleep 120', 'kubectl get nodes', 'kubectl get deployment shop-web', 'kubectl wait --for=condition=Available deployment/shop-web --timeout=600s', 'kubectl get pods -o wide'],
        mistakes: [
          { commands: ['kubectl rollout status deployment/shop-web', 'kubectl get pods -o wide'], why: '故障還沒發生（現在才 10:00:00），`rollout status` 立刻說成功，node-02 仍然 Ready；檢查本身不會讓時間前進，要用 `sleep` 或會等待的指令。' },
          { commands: ['sleep 60', 'kubectl get nodes'], why: '10:01:00 kubelet 才停止回報，控制平面還要再等 50 秒收不到心跳，才會把 node-02 標成 NotReady；這時它仍是 Ready。' },
          { commands: ['sleep 120', 'kubectl get nodes', 'kubectl get deployment shop-web'], why: 'node-02 已經 NotReady，但 Pod 對 unreachable taint 有 300 秒的容忍時間，還沒被驅逐；這時 shop-web 只有 2 個就緒，替代的 Pod 還沒出現。' },
        ],
        hints: ['kubelet 停止回報後約 50 秒，節點才會變成 NotReady。', 'NotReady 之後，Pod 預設要再等 300 秒才會被驅逐並在其他節點重建。', '`kubectl wait --for=condition=Available deployment/shop-web --timeout=600s` 會等到 Deployment 再次可用。'],
        explanation: '10:01:00 node-02 的 kubelet 停止回報，50 秒後（10:01:50）控制平面把它的 Ready 條件改成 Unknown，`kubectl get nodes` 顯示 NotReady，Deployment 只剩 2 個就緒；Pod 對 `node.kubernetes.io/unreachable` 的容忍時間是 300 秒，所以 10:06:50 時 `snq6k` 才被標記刪除，ReplicaSet 在其他節點建立替代品，幾秒後通過 readinessProbe，Deployment 的 Available 條件恢復為 True，`kubectl wait` 結束。舊的 Pod 一直是 Terminating，因為失聯的 kubelet 無法確認容器已經停止。整個過程沒有人介入，這就是節點層級的自我修復，也說明了它不是瞬間完成的：預設設定下，從斷電到恢復 3 個就緒副本大約要 6 分鐘。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub01-q1', prompt: '潮汐咖啡的 compose.yaml 替 web 服務寫了 `restart: always`，整個應用只跑在 tidal-01 一台主機上。某天 tidal-01 的電源供應器故障，主機整台關機。接下來會發生什麼事？',
      options: ['Docker daemon 會把 web 容器自動搬到同一個網路上另一台裝有 Docker 的主機重新啟動', 'web 停止服務，直到有人修好 tidal-01，或在另一台主機重新部署這個 Compose 專案', 'Compose 會改用之前以 `--scale` 開好的備份容器，繼續提供服務', 'web 容器繼續執行，因為 `restart: always` 讓容器不受主機狀態影響'],
      answer: 1,
      explanation: '重新啟動策略由同一台主機的 Docker daemon 執行，主機關機時 daemon 也一起停止，沒有任何東西會在別台接手，這台主機就是唯一的故障域。Docker 不會自己把容器搬到別的主機；`--scale` 的副本也在同一台主機上，一起停了；容器跑在主機上，不可能在主機關機時繼續執行。',
    },
    {
      id: 'kub01-q2', prompt: 'Deployment shop-web 是用 `kubectl apply -f k8s/shop-web.yaml` 建立的，檔案沒有任何修改。現在再執行一次同樣的 `kubectl apply -f k8s/shop-web.yaml`，結果是什麼？',
      options: ['多建立一組 3 個 Pod，叢集裡的 shop-web 變成 6 個副本', '因為名為 shop-web 的 Deployment 已經存在，回報 AlreadyExists 錯誤', '先刪除現有的 3 個 Pod，再依照檔案重新建立 3 個新的 Pod', '印出 `deployment.apps/shop-web unchanged`'],
      answer: 3,
      explanation: '`kubectl apply` 是宣告式的：它比較檔案描述的期望狀態與叢集裡的物件，沒有差異就是 unchanged，所以可以安全地重複執行。多建立一組是命令式指令重複執行的結果；AlreadyExists 是 `kubectl create` 遇到同名物件的行為；apply 不會在沒有變化時刪除重建 Pod。',
    },
    {
      id: 'kub01-q3', prompt: 'shop-web 的 Deployment 期望 3 個副本。你執行 `kubectl delete pod shop-web-z626dpnqbg-qbxr4`，幾秒後再看 `kubectl get pods -o wide`，最可能看到什麼？',
      options: ['仍有 3 個 Pod，其中一個是 ReplicaSet 以新名稱補上、可能在別的節點上的新 Pod', '只剩 2 個 Pod，要再執行一次 `kubectl apply -f k8s/shop-web.yaml` 才會補回第 3 個', '`qbxr4` 重新出現，名稱、所在節點與 IP 都和刪除前完全一樣', 'Deployment 偵測到它的 Pod 被刪除，整個 Deployment 也跟著被刪除'],
      answer: 0,
      explanation: 'ReplicaSet 控制器的調和迴圈發現只剩 2 個，少於期望的 3 個，就建立一個新的 Pod，名稱、節點與 IP 都是新的。自我修復不需要人再 apply；被刪除的 Pod 不會「復活」，替代品是全新的物件；刪除 Pod 不會影響 Deployment，期望狀態仍在。',
    },
    {
      id: 'kub01-q4', prompt: '同事用 `kubectl run debug --image=tidal/shop-web:1.4` 建立了一個 Pod 來測試，之後執行 `kubectl delete pod debug`。這個 Pod 會怎樣？',
      options: ['ReplicaSet 控制器會在幾秒內以新的名稱補回一個 debug Pod', '所在節點的 kubelet 會在同一個節點上把 debug 重新啟動起來', '直接消失：它沒有 ownerReferences，沒有任何控制器會把它補回來', '要等 300 秒的容忍時間過後，API server 才會真正把它刪除'],
      answer: 2,
      explanation: '`kubectl run` 建立的是 bare pod，沒有 ReplicaSet 或 Deployment 管理它，刪除後沒有人會補回。ReplicaSet 只補自己擁有的 Pod；kubelet 的重新啟動是針對執行中 Pod 裡結束的容器，不會重建被刪除的 Pod；300 秒是節點失聯時對 unreachable taint 的容忍時間，與手動刪除無關。',
    },
    {
      id: 'kub01-q5', prompt: '你執行 `kubectl drain node-03`（沒有其他參數），輸出以 `node/node-03 cordoned` 開頭，接著是 `cannot delete DaemonSet-managed Pods` 的錯誤。這時 node-03 的狀態是什麼？',
      options: ['drain 完全沒有作用：node-03 仍可排程，上面所有的 Pod 也都還在執行', 'node-03 上所有的 Pod，包括 kube-system 的 kube-proxy，都已經被驅逐', 'shop-web 的 Pod 已被驅逐並在別處重建，只有 kube-proxy 因為錯誤而留下', 'node-03 已被標成不可排程（cordoned），但上面的 Pod 都還沒有被驅逐'],
      answer: 3,
      explanation: 'drain 先 cordon 節點，再檢查能不能驅逐每個 Pod；遇到 DaemonSet 的 Pod 沒有 `--ignore-daemonsets` 就整個停下來，所以節點已是 SchedulingDisabled，但一個 Pod 也沒有被驅逐。cordon 已經生效，不是完全沒作用；kube-proxy 與 shop-web 都沒有被驅逐；錯誤發生在驅逐任何 Pod 之前，不是驅逐一半。',
    },
    {
      id: 'kub01-q6', prompt: 'node-02 突然斷電。依這一課叢集的設定，下列哪個敘述正確？',
      options: ['約 50 秒後 NotReady，Pod 再過 300 秒才在別的節點重建', 'kubelet 一停止回報，控制平面就在同一秒把上面的 Pod 全部搬到其他節點', 'Pod 仍顯示 `1/1 Running`，所以 Deployment 會一直認為副本都可用而不重建', 'Pod 會等 node-02 恢復供電後在原地重新啟動，在那之前其他節點不會接手'],
      answer: 0,
      explanation: '控制平面要寬限期內收不到心跳才把節點標成 NotReady，之後 Pod 對 unreachable taint 預設有 300 秒的容忍時間，到期才被驅逐，ReplicaSet 再到其他節點重建。不會在同一秒搬移，這是為了避免短暫斷線造成大量重建；`get pods` 的 1/1 Running 只是最後一次的回報，Pod 的 Ready 條件已改為 False，Deployment 的 READY 會下降；節點故障時重建發生在其他節點，不必等它恢復。',
    },
    {
      id: 'kub01-q7', prompt: '前端的設定檔裡寫死了 shop-web 某個 Pod 的 IP `10.244.3.2`。為什麼這在 Kubernetes 裡是錯誤的做法？',
      options: ['Pod 的 IP 只有控制平面的元件能連線，叢集裡其他的 Pod 都連不到它', '替代的 Pod 會有新的 IP，應透過 Service 的名稱找它', 'Kubernetes 每隔固定的一段時間就會自動替所有執行中的 Pod 更換 IP', '叢集的 Pod IP 一律是 IPv6，前端的設定檔只能寫 IPv4 位址，所以連不上'],
      answer: 1,
      explanation: '自我修復、擴縮與節點故障都會產生新的 Pod，新的 Pod 有新的 IP，所以用戶端要透過服務發現（KUB05 的 Service 與叢集 DNS）找到目前就緒的副本。叢集裡的 Pod 彼此可以用 IP 互連；Kubernetes 不會定期更換執行中 Pod 的 IP；這個叢集的 Pod IP 是 10.244.x.x 的 IPv4。',
    },
    {
      id: 'kub01-q8', prompt: '一個三人的新創團隊，只有一個 Web 應用加一個資料庫，流量穩定，沒有人專職維運，也還沒有監控。下列哪一個最合理？',
      options: ['立刻自行架設一套 Kubernetes 叢集，才能和大公司使用一樣的技術與流程', '先把應用拆成十幾個微服務，讓每個服務各自部署，再導入 Kubernetes', '一台 VM 加 Compose 或託管平台，先做好備份、監控與自動化部署', '不要使用容器，直接把程式複製到伺服器上，由工程師手動啟動與重新啟動'],
      answer: 2,
      explanation: '這個情境的團隊小、服務少、流量穩定，也沒有維運人力，Kubernetes 的學習與維運成本遠大於好處；一台 VM 加 Compose 或託管平台，加上備份、監控與 CI/CD，能更有效地提高可靠性。自行架設叢集需要專職團隊；為了採用 Kubernetes 而拆微服務是本末倒置；放棄容器會失去 DKR 島學到的可重現環境，也不是問題所在。',
    },
  ],
};
