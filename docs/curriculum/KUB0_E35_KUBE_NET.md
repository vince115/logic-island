# KUB-2 引擎階段 E35：`kube-net` profile（`kube-service-spec.ts`、`kube-endpoints.ts`、`kube-net.ts`、`kube-dns.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E34 的叢集（[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md)）上加上 Service v1（ClusterIP、NodePort、LoadBalancer、headless）、Endpoints 與 EndpointSlice 控制器、kube-proxy 的輪替、CoreDNS 與 Pod 的解析器、Pod 裡的 `curl`／`getent`／`nc`／`nslookup`／`wget`、從學習者機器連到 NodePort 與 LoadBalancer、`kubectl expose`、`create service`、`port-forward`，以及檢查 `kube-service` 與 `http`／`reach` 的 `pod`。E1–E34 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`workloads` 以下的 profile 輸出不變：Service 的 manifest、`expose`、`port-forward`、`create service`、`ep`、`endpointslices` 仍是「要到引擎階段 E35 才模擬」，新的旗標仍是 `unknown flag`。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `KUBE_NET_PROFILE`（RANK 35） | `workloads` 的一切加上 feature `kube-net`，**沒有新指令**。課程機器寫 `profile: 'kube-net'` |
| profile 以下 | `（模擬環境：Service 要到引擎階段 E35 才模擬）`、`（模擬環境：kubectl expose 要到引擎階段 E35 才模擬）`、`（模擬環境：ep 要到引擎階段 E35 才模擬）`（E32 原文）；`--tcp`、`--type`、`--target-port`、`--name`、`--protocol`、`--clusterip`、`--node-port` 是 `error: unknown flag`；課程資料的 `kube.lbPool`：`kube: lbPool needs the kube-net profile (engine stage E35)`；Image 的 `commands` 不能有 `nslookup`、`wget`；檢查 `kube-service`、`http`／`reach` 的 `pod`：`needs a kube-net machine (engine stage E35)` |
| 開關 | `KubeState.net`（`buildKube` 在 kube-net profile 設定）。kubectl、settle、manifest 的解碼與 describe 都以它判斷，所以 `workloads` 的叢集完全走 E34 的路徑 |

程式的分工（每個檔案都不到 190 行）：`kube-service-spec.ts`（預設值、驗證、ClusterIP 與 NodePort 的分配）、`kube-endpoints.ts`（Endpoints 與 EndpointSlice 控制器、LoadBalancer 位址池、ENDPOINTS 欄的格式）、`kube-dns.ts`（CoreDNS 的記錄、搜尋清單、`resolv.conf`、`/etc/hosts`、`nslookup`）、`kube-net.ts`（Pod 與 kube-proxy 的網路視角、輪替、學習者機器看到的叢集外部）、`kube-pod-net.ts`（`kubectl exec` 的網路、`wget`）、`kube-describe-service.ts`、`kube-service-checks.ts`；指令在 `kubectl-service.ts`、`kubectl-forward.ts`。既有檔案只多了 kube-net 才走到的分支：`kube-model.ts`（`net`、`lb`、`turns`、`forwards`、`netAt`、`netDirty`、`KUBE_LIMITS.services`）、`kube-manifest.ts`（Service 的嚴格解碼 schema）、`kube-write.ts`、`kube-settle.ts`、`kube-api.ts`、`kube-output.ts`、`kube-print.ts`、`kube-lesson.ts`、`kubectl.ts`、`kubectl-get.ts`、`kubectl-pod.ts`、`fs.ts`（`FsState.kubeNet`）、`sockets.ts`（`NetIo.connect`、`Lookup.addresses`）、`http.ts`（curl 的新連線呼叫 `connect`）、`docker.ts`（`RunOptions.view`）、`docker-lesson.ts`、`script.ts`、`shell.ts`、`lesson.ts`、`server-lesson.ts`、`net-lesson.ts`。

## 2. Service 物件（`kube-service-spec.ts`、`kube-manifest.ts`、`kube-write.ts`）

- **嚴格解碼**：`ServiceSpec`（`type`、`selector`、`ports`、`clusterIP`、`clusterIPs`、`sessionAffinity`、`externalTrafficPolicy`、`internalTrafficPolicy`、`loadBalancerIP`、`publishNotReadyAddresses`、`ipFamilies`、`ipFamilyPolicy`、`allocateLoadBalancerNodePorts` 與只在課文的欄位）、`ServicePort`（`name`、`protocol`、`appProtocol`、`port`、`targetPort`（intstr）、`nodePort`）。例：`Service in version "v1" cannot be handled as a Service: strict decoding error: unknown field "spec.port"`。
- **預設值**：`type: ClusterIP`、`sessionAffinity: None`、`internalTrafficPolicy: Cluster`、`ipFamilies: [IPv4]`、`ipFamilyPolicy: SingleStack`、埠的 `protocol: TCP` 與 `targetPort` 等於 `port`；NodePort 與 LoadBalancer 另有 `externalTrafficPolicy: Cluster`，LoadBalancer 有 `allocateLoadBalancerNodePorts: true`；`status: {loadBalancer: {}}`。換成別的類型時，那個類型的欄位被拿掉。
- **驗證**（API server 的訊息）：名稱是 DNS-1035 label；`spec.type: Unsupported value`；沒有 ports（headless 除外）是 `spec.ports: Required value`；多個埠時每個都要有 `name`（`Required value`、`Duplicate value`）；`port`、數字的 `targetPort` 在 1–65535（`must be between 1 and 65535, inclusive`）；具名的 `targetPort` 照 IANA service name 的規則（最多 15 字、只有小寫英數與連字號、至少一個字母、不能連續或頭尾連字號）；`protocol` 是 TCP、UDP、SCTP；ClusterIP 不能有 `nodePort`（`Forbidden: may not be used when \`type\` is 'ClusterIP'`）；headless 不能是 NodePort 或 LoadBalancer；`sessionAffinity` 是 ClientIP 或 None。
- **分配**：ClusterIP 在 10.96.0.0/12，NodePort 在 30000–32767；沒有指定時以「命名空間/名稱」（NodePort 加上埠的序號）的 SHA-256 雜湊到範圍的動態區段（ClusterIP 跳過前 256 個、NodePort 跳過前 86 個，同真實分配器保留的靜態區段），撞到就取下一個空位。指定的位址或埠：`failed to allocate IP 10.0.0.5: provided IP is not in the valid range. The range of valid IPs is 10.96.0.0/12`、`provided IP is already allocated`、`provided port is not in the valid range. The range of valid ports is 30000-32767`、`provided port is already allocated`。系統的 `kubernetes`（10.96.0.1）與 `kube-dns`（10.96.0.10）照 E32。
- **更新**：apply 時 ClusterIP 不變（manifest 寫了別的是 `spec.clusterIPs[0]: Invalid value: []string{"…"}: may not change once set`）；清單整個取代（E32），所以 manifest 沒寫 `nodePort` 時沿用同一個 port 與 protocol 原本的 NodePort；改成 NodePort 時才分配新的。
- 上限：30 個 Service（含系統的）。手動 apply Endpoints 或 EndpointSlice：`（模擬環境：Endpoints 由控制器依 Service 的 selector 維護；手動建立的 Endpoints 只在課文說明）`。

## 3. Endpoints 與 EndpointSlice 控制器（`kube-endpoints.ts`）

- **選到的 Pod**：同命名空間、標籤符合 `selector`、有 Pod IP、phase 不是 Succeeded／Failed。每個 Service 埠的 `targetPort` 在每個 Pod 各自解析：數字就是那個數字，名稱就找那個 Pod 容器 `ports` 中同名、同 protocol 的 `containerPort`；找不到的 Pod 在那個埠被略過（所以同一個 Service 可以對應到不同 Pod 的不同埠）。依 IP 排序。
- **Endpoints v1**：就緒（E33 的 readiness、E34 的節點 NotReady 都會讓它不就緒）的在 `addresses`，不就緒的在 `notReadyAddresses`，Terminating 的不列（`publishNotReadyAddresses: true` 時都列在 `addresses`）；位址帶 `nodeName` 與 `targetRef`；相同埠集合的位址合成一個 subset。標籤是 Service 的標籤（headless 另加 `service.kubernetes.io/headless: ""`），註解 `endpoints.kubernetes.io/last-change-trigger-time` 是內容改變的時間。`kubernetes` 的 Endpoints 是 API server 的 10.0.0.50:6443（標籤 `endpointslice.kubernetes.io/skip-mirror: "true"`）。
- **EndpointSlice**（discovery.k8s.io/v1）：名稱 `<service>-<5 字元>`（`generateName`），標籤 `kubernetes.io/service-name`、`endpointslice.kubernetes.io/managed-by: endpointslice-controller.k8s.io`，ownerReference 指向 Service；每個端點有 `conditions: {ready, serving, terminating}`，Terminating 的 Pod 也列（`ready: false`、`terminating: true`）；`ports[].name` 沒有名稱時是 `""`；沒有端點時是 `endpoints: null`、`ports: null`。每次內容改變 `generation` 加一。
- **何時執行**：settle 的每一步之後，只要 Pod 的位址、就緒、刪除中或 phase 改變（同 E34 的控制器時機）；Service 建立的時間；改變叢集的 kubectl 指令（`netDirty`）；以及每次 settle 結束時（標籤、selector 的改變）。內容沒變就不寫入（resourceVersion 不動）。Service 刪除後它的 Endpoints 與 EndpointSlice 一起刪除。
- **LoadBalancer 位址池**：課程的 `kube.lbPool`（MetalLB 式的提供者）依 Service 建立的順序給位址（`spec.loadBalancerIP` 指定池中的一個），`status.loadBalancer.ingress: [{ip, ipMode: VIP}]` 與事件 `Normal IPAllocated`「Assigned IP ["10.0.0.200"]」（metallb-controller）；用完時一則 `Warning AllocationFailed`「Failed to allocate IP for "default/c": no available IPs」並維持 `<pending>`；不再是 LoadBalancer 或刪除時位址還給池。沒有池時永遠是 `<pending>`（雲端的負載平衡器只在課文）。

## 4. get 與 describe（`kube-print.ts`、`kube-describe-service.ts`）

| 指令 | 內容 |
|---|---|
| `get svc` | NAME TYPE CLUSTER-IP EXTERNAL-IP PORT(S) AGE；PORT(S) 是 `80/TCP` 或 `80:30080/TCP`，以逗號連接；EXTERNAL-IP 是 `<none>`、`<pending>` 或位址；headless 的 CLUSTER-IP 是 `None`；`-o wide` 加 SELECTOR |
| `get ep` | NAME ENDPOINTS AGE；ENDPOINTS 是每個 subset、每個埠、每個就緒位址的 `ip:port`，最多 3 個，其餘寫 ` + N more...`；沒有 subset 是 `<none>`，只有不就緒的位址時是空的（kubectl 的 formatEndpoints） |
| `get endpointslices` | NAME ADDRESSTYPE PORTS ENDPOINTS AGE；ENDPOINTS 列出所有位址（含不就緒的），沒有時 `<unset>` |
| `describe svc` | Name、Namespace、Labels、Annotations、Selector、Type、IP Family Policy、IP Families、IP、IPs、（Desired LoadBalancer IP）、（LoadBalancer Ingress: `10.0.0.200 (VIP)`），每個埠的 Port（沒有名稱是 `<unset>`）、TargetPort、NodePort、Endpoints（那個埠的就緒位址），Session Affinity、External Traffic Policy、Internal Traffic Policy、Events |
| `describe ep` | Subsets：每個 subset 的 Addresses、NotReadyAddresses、Ports 表（Name Port Protocol），之後空一行，再是 Events |

`-o yaml|json|jsonpath|name` 照 E32（`endpoints/who`、`endpointslice.discovery.k8s.io/who-bfcfp`）。`get all` 本來就有 services。

## 5. 叢集 DNS（`kube-dns.ts`）

- **記錄**：每個 Service 有 `<name>.<namespace>.svc.cluster.local`：ClusterIP；headless 是它就緒 Pod 的位址（依 IP 排序；`publishNotReadyAddresses` 時包括不就緒的），沒有就緒 Pod 時查不到。Pod 有 `<a-b-c-d>.<namespace>.pod.cluster.local`（kubeadm 的 Corefile 是 `pods insecure`）。cluster.local 以外的名稱查不到（模擬的叢集沒有上游 DNS）。
- **Pod 的檔案**（kubelet 寫的，不算容器的寫入層）：`/etc/resolv.conf` 是 `search <ns>.svc.cluster.local svc.cluster.local cluster.local`、`nameserver 10.96.0.10`、`options ndots:5`；`/etc/hosts` 是 `# Kubernetes-managed hosts file.`、localhost 與 IPv6 的五行，最後 `<Pod IP>\t<Pod 名稱>`。
- **解析器**（`getent`、`curl`、`nc`、`wget`）：先 `/etc/hosts`，再 DNS：少於 5 個點的名稱先依序加上搜尋網域，最後才是名稱本身；5 個點以上先試名稱本身；結尾有點只試名稱本身。所以 `who`、`who.default`、`who.default.svc` 都找到 `who.default.svc.cluster.local`，另一個命名空間的 Pod 用 `who` 找不到、用 `who.default` 找得到。`getent hosts` 印出找到的完整名稱，headless 每個位址一行（glibc 的 print_hosts）。
- **`nslookup 名稱 [伺服器]`**（Image 的 `commands` 要有它）：依 Ubuntu bind9-dnsutils 的格式：`Server:\t\t10.96.0.10`、`Address:\t10.96.0.10#53`、空行、每筆 A 記錄一組 `Name:\t…`／`Address: …`、空行；找不到是 `** server can't find nope: NXDOMAIN`（結束碼 1）。只查 DNS，不看 `/etc/hosts`；指定 10.96.0.10 以外的伺服器是 `;; connection timed out; no servers could be reached`。

## 6. 叢集的網路與 kube-proxy（`kube-net.ts`、`kube-pod-net.ts`）

- **Pod 是網路上的機器**：位址在 eth0（/24，閘道 `.1`），執行中的容器在開始聆聽之後（E33 的 `listenAfter`／E23 的 `ready`）聽 Image（或課程程式）的 E12 `http` 埠與 `expose` 的埠；responder 的 route 內容可以寫 `{{hostname}}` 與 `{{ip}}`，由回應的 Pod 名稱與位址取代（課程用來顯示是哪一個端點回答）。課程的 `kube.health` 的 `paths` 在它的時間窗內也套用在 curl 上。
- **kube-proxy**：Service 位址的表——ClusterIP:port、每個節點位址:nodePort、LoadBalancer 位址:port，只模擬 TCP。每一個**新的連線**（curl 的每個新連線、nc 的每個埠、wget；`NetIo.connect`）把那個位址綁到該 Service 埠**下一個就緒端點**，依端點的 IP 順序輪替，輪到誰記在 `KubeState.turns`（鍵是 `命名空間/名稱/埠名或埠號`，ClusterIP、NodePort 與 LoadBalancer 各自的鍵相同，所以共用輪替），每個指令之後保留。沒有就緒端點時改用 serving 的 Terminating 端點（ProxyTerminatingEndpoints）；都沒有，或那個端點沒在聽 targetPort，連線被拒絕（kube-proxy 的 REJECT：`curl: (7) … after 0 ms`、`nc: … Connection refused`）。curl 在同一個指令裡重用連線時，同一個端點回答。
- **`kubectl exec POD -- 指令`**：容器的檔案加上 kubelet 的兩個檔案，指令看到 Pod 的網路：其他 Pod（直接連 Pod IP）、ClusterIP、NodePort、LoadBalancer 與 cluster DNS。`curl`、`getent`、`nc` 走 docker.ts 的容器 shell（E22 的指令，`sh -c` 與 for 迴圈都可以，迴圈裡每次 curl 都輪到下一個端點）；`nslookup`、`wget` 只能直接寫在 `--` 後面。Image 要在 `commands` 列出它們（列出的才有）。
- **`wget`（BusyBox）**：`-q`、`-O -`（`-qO-`）、`-T`；URL 可以沒有 `http://`；跟著轉址。沒有 `-q` 時 stderr 印 `Connecting to who (10.99.237.60:80)`、`writing to stdout`、`written to stdout`；`wget: bad address 'nope'`、`wget: can't connect to remote host (10.…): Connection refused`（逾時是 `Connection timed out`）、`wget: server returned error: HTTP/1.1 404 Not Found`、`wget: error getting response: Connection reset by peer`，結束碼 1。`-O 檔案` 與其他選項說明不模擬。
- **學習者的機器**（kube-net profile 的網路指令 `curl`、`nc`、`ss`… 與 `http`／`reach` 檢查）：看到每個節點位址上的 NodePort 與 LoadBalancer 位址（從外面連，同樣輪替）；**ClusterIP 與 Pod IP 連不到**（沒有路由：逾時，curl 沒有 `--connect-timeout` 時是既有的 `(7) … after 127000 ms`）；節點上沒有的埠被拒絕。指令結束後學習者的 `net` 與行程表恢復原狀，只留下輪替。

## 7. `kubectl expose` 與 `kubectl create service`（`kubectl-service.ts`）

| 指令 | 內容 |
|---|---|
| `expose deploy|rs|pod|svc NAME [--port] [--target-port] [--type] [--name] [--protocol] [--selector] [--dry-run=client -o yaml]` | selector：Deployment／ReplicaSet 的 `matchLabels`、Pod 的標籤、Service 的 selector（`matchExpressions`、沒有標籤時是 kubectl 的 `couldn't retrieve selectors …`）；沒有 `--port` 時用容器的 ports（多個時名為 `port-1`、`port-2`），都沒有是 `couldn't find port via --port flag or introspection`；`targetPort` 預設等於 port；標籤複製物件的 metadata 標籤；`type` 有給才寫。`service/who exposed`；其他 kind：`error: cannot expose a Node` |
| `create service clusterip|nodeport|loadbalancer NAME --tcp=port[:targetPort] [--clusterip=None] [--node-port=N]` | 標籤與 selector `app=NAME`、埠名 `80-8080`、`type` 明寫；沒有 `--tcp`（且不是 headless）：`error: at least one tcp port specifier must be provided`；已存在：`error: failed to create ClusterIP service: services "db" already exists`；`externalname` 只在課文 |

## 8. `kubectl port-forward`（`kubectl-forward.ts`）

- 目標：`pod/NAME`（或 NAME）、`svc/NAME`、`deploy/NAME`、`rs/NAME`；Service 等由選擇器挑一個 Pod（執行中且就緒的優先，再依名稱）。Service 的埠換成那個 Pod 的 targetPort（具名的經由容器 ports），kubectl 印的是 Pod 的埠：`Forwarding from 127.0.0.1:8080 -> 8080`、`Forwarding from [::1]:8080 -> 8080`。埠可以寫 `8080:80`、`80`（本機同號）、`8080:http`；`:80`（系統挑埠）不模擬。
- **加上 `&`**（E4 背景工作）：bash 印 `[1] 901`，接著兩行 Forwarding；工作的行程（`kubectl port-forward svc/who 8080:80`，`Sl`）在 127.0.0.1:8080 聆聽（`ss -tlnp` 看得到 `users:(("kubectl",pid=901,fd=8))`），連線經由 E17 的 forward 到那個 Pod 的埠；每個連線 kubectl 印 `Handling connection for 8080`（印在 stderr，見 §10）。`jobs` 列出它，`kill %1` 結束它，之後 `curl localhost:8080` 被拒絕。Pod 不見了（刪除、不再執行）就不再聆聽；Pod 沒在聽那個埠時 curl 得到 `(52) Empty reply from server`。
- **沒有 `&`**：印出兩行 Forwarding，再在 stderr 印模擬環境的說明（同 `-w`），不聆聽、結束碼 0。
- 錯誤：`error: TYPE/NAME and list of ports are required for port-forward`、NotFound、`error: Service who does not have a service port 81`、`error: Pod 'client' does not have a named port 'web'`、`error: unable to forward port because pod is not running. Current status=Pending`、沒有 Pod 時 `error: timed out waiting for the condition`、本機埠被占用或非 root 的 1024 以下：`Unable to listen on port 8080: Listeners failed to create with the following errors: [… bind: address already in use …]` 與 `error: unable to listen on any of the requested ports: [{8080 80}]`。背景執行時的錯誤直接印出、不建立工作。

## 9. 課程資料與檢查（`kube-lesson.ts`、`kube-service-checks.ts`）

```ts
kube: {
  …E32–E34 的欄位,
  lbPool?: ['10.0.0.200-10.0.0.209'],   // 位址、範圍或 /27–/32 的 CIDR，最多 32 個，不能和節點位址重疊
}
```

| 檢查 | 意義 |
|---|---|
| `{ kind: 'kube-service', name, namespace?, type?, clusterIP?: boolean, ports?: [{ port, targetPort?, nodePort?, protocol? }], selector?, readyEndpoints?, addresses?, externalIP? }` | `clusterIP: false` 是 headless；`ports` 每一項要有同號（同 protocol）的埠，`targetPort` 依文字比對（`http`、`8080`）；`selector` 完全相同；`readyEndpoints` 與 `addresses` 是 Endpoints 的就緒位址（個數、集合）；`externalIP` 是 `get svc` 的 EXTERNAL-IP（`<pending>` 也可以）。說明例：`default 命名空間應該有名為 web 的 Service（類型 NodePort、80 埠轉到 8080（NodePort 30080）、3 個就緒的端點）`；訊息例：`who 有 0 個就緒的端點`、`who 的 80 埠轉到 http`、`who 的 EXTERNAL-IP 是 <none>` |
| `http`、`reach` 加上 `pod?: 'client' \| 'dev/client'` | 從那個 Pod 發出（cluster DNS、ClusterIP、Pod IP）；`reach` 的 `to` 依 Pod 的解析器查；和 `host`／`from` 不能同時寫。沒有 `pod` 時語意不變，只是在 kube-net 的機器上從學習者機器看得到叢集外部（NodePort、LoadBalancer）。說明例：`從 Pod client GET http://web/ 應該回應狀態碼 200`；訊息例：`沒有名為 client 的 Pod`、`client 沒有在執行` |

都在檢查前 settle 到時鐘、不移動時鐘；檢查的連線不推進輪替（綁在目前輪到的端點）。`TERMINAL_CHECK_KINDS` 加上 `kube-service`。

## 10. 偏差（刻意的模型）

- **輪替**：真實的 kube-proxy（iptables 模式）以機率隨機選端點；這裡依端點 IP 的順序輪流，只在新連線時前進，所以結果固定、可以寫進課文與檢查。IPVS 的 rr 才是真的輪替。`sessionAffinity: ClientIP` 接受但不改變輪替。
- ClusterIP、NodePort、LoadBalancer 位址都是同一個 Service 埠的輪替；從外面連 NodePort 時，Pod 看到的來源是學習者機器的位址（真實的 `externalTrafficPolicy: Cluster` 會 SNAT 成節點位址）。
- ClusterIP 上沒有的埠在這裡是被拒絕；iptables 模式的真實叢集通常是逾時（封包沒有規則可走）。
- ClusterIP 與 NodePort 以雜湊加上「下一個空位」分配，真實的分配器在動態區段隨機挑；EndpointSlice 的名稱後綴以 Service 的 UID 為種子。
- 端點控制器在事件的同一秒更新（沒有批次與 `--endpoint-updates-batch-period`）；一個埠集合一個 EndpointSlice（沒有每片 100 個端點的上限與重新打包）；Endpoints 的 subset 依埠集合出現的順序，位址依 IP 排序。
- `nslookup` 一律是 bind9-dnsutils 的格式（BusyBox 的 nslookup 格式不同，也有搜尋清單的已知問題）；`nslookup`、`wget` 只能直接在 `--` 後面執行，不能在 `sh -c` 或迴圈裡；`wget` 不印進度列、只支援印到標準輸出。
- port-forward 的 `Handling connection for 8080` 印在發出連線的指令的 stderr（真實的是背景 kubectl 的 stdout，直接出現在終端機）；它只聽 IPv4 的 127.0.0.1（真實的也聽 [::1]）；背景執行的錯誤不先印 `[1] pid`；Pod 不見時 kubectl 不印錯誤、只是不再聆聽。
- `externalTrafficPolicy`／`internalTrafficPolicy: Local`、`externalIPs`、ExternalName、`loadBalancerSourceRanges`、IPv6 與雙堆疊、UDP 與 SCTP 的轉送都只在課文（UDP 的 Service 物件可以建立，kube-proxy 只模擬 TCP）。
- API server（`kubernetes` Service、10.0.0.50:6443）在 Pod 裡連不到（被拒絕）。kube-dns 的 CoreDNS Pod 沒有模擬聆聽，DNS 由解析器直接回答。
- `api-resources` 的清單不變（E32 的子集，沒有 endpointslices）。

## 11. 課程作者要知道的事

- 機器寫 `profile: 'kube-net'`；LoadBalancer 要有位址時寫 `kube.lbPool`，否則 EXTERNAL-IP 一直是 `<pending>`（這本身就是可以教的真實行為）。
- 要讓學習者看到「是哪一個 Pod 回答」，responder 的 route 寫 `body: 'Hostname: {{hostname}}\n'`；Image 要有 `http: { port, responder }` 才會回 HTTP（只有 `expose` 的 nginx 測試 Image 會得到 `Empty reply from server`）。
- 用戶端 Pod 的 Image 要 `service: true`（否則主程式結束、CrashLoopBackOff），並在 `commands` 列出 `curl`、`getent`、`nc`、`nslookup`、`wget` 中需要的。迴圈示範輪替請用 `curl`（`sh -c 'for i in 1 2 3; do curl -s web; done'`）。
- 輪替依端點 IP 順序、每個新連線前進，在同一個 Service 埠的所有位址共用；同一課前面的連線（包括 `nc -z`）會影響之後輪到誰，參考解答與檢查要考慮。檢查本身不推進輪替。
- Pod IP 由節點 CIDR 的最小空位決定，名稱後綴固定；課文可以引用 `kubectl get pods -o wide` 的實際值，但變體換了叢集資料時會不同（同 E32 的規則：答案不要直接寫死 Pod IP，檢查用 `kube-service` 的 `readyEndpoints`）。
- 就緒才進 Endpoints：readiness 探針（E33）失敗、節點 NotReady（E34）的 Pod 移到 `notReadyAddresses`；滾動更新與縮減時 Terminating 的 Pod 立刻離開 Endpoints（EndpointSlice 仍列出，`terminating: true`）。
- 從學習者機器 `curl` ClusterIP 會逾時，課文要說明這是叢集內部位址；請加 `--connect-timeout 2` 讓輸出短。
- port-forward 要寫 `&`，結束時 `kill %1`；它挑的 Pod 是固定的（就緒且名稱最小的）。

## 12. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e35.test.ts` | profile 與分界（以下的訊息、未知旗標、lbPool 與 Image commands 被拒）；lbPool 的驗證與展開；Service 的預設值、`get svc`、`-o wide`；嚴格解碼與驗證的全文；分配（範圍、已分配、雜湊與下一個空位、ClusterIP 不可變、NodePort 沿用）；Endpoints 與 EndpointSlice（具名 targetPort 每個 Pod 解析、缺少的 Pod 被略過、readiness 改變時移動與 trigger time、縮減時 Terminating 的條件、節點故障後移到 notReadyAddresses）；describe svc／ep 的全文、刪除 Service；expose 與 create service 的 dry-run YAML、錯誤；LoadBalancer 的 `<pending>`、位址池順序、AllocationFailed、IPAllocated 事件、位址歸還 |
| `tests/terminal-e35-net.test.ts` | Pod 的 `resolv.conf`、`/etc/hosts`、搜尋清單與 ndots（短名、`.default`、`.svc`、結尾的點、kube-system、Pod 的 DNS 名稱、NXDOMAIN、另一個命名空間）；headless 的 getent 與 nslookup；輪替的順序（跨 exec、迴圈、wget、重用連線）與 `turns`；被拒絕的 Service、沒在聽的端點、直接連 Pod IP、nc；學習者機器的 NodePort（三個節點）、LoadBalancer、ClusterIP 與 Pod IP 逾時；port-forward 工作的生命週期（通知、Forwarding、Handling、ss、jobs、kill、Empty reply）、前景的說明、各種錯誤、Pod 不見時；wget 的訊息與錯誤；`kube-service`、`http`／`reach` 加 `pod` 的通過、訊息、說明與驗證；變體自己的位址池與確定性 |
| `tests/support/net-fixture.ts` | 只供測試：kub-35（kube-net profile，E34 的機器加上 `team/whoami:1.0` 與 `team/toolbox:1.0`、responder whoami）、`~/k8s` 的 who.yaml、svc.yaml、np.yaml、client.yaml，`lbLab`（位址池 10.0.0.200–201）、`UP` |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `kube-net`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', 'E33', 'E34', 'E35']`，KUB05 與 KUB11（含可選的 devops-explorer）可以建立，KUB07 只缺 E37。

## 13. 只在課文說明、或不模擬的部分

雲端負載平衡器與 cloud-controller-manager；MetalLB 的 L2／BGP 宣告與 speaker；kube-proxy 的 iptables／IPVS／nftables 規則與 conntrack；`externalTrafficPolicy: Local` 的來源 IP 保留與健康檢查 NodePort；Topology Aware Routing 與 `trafficDistribution`；ExternalName、`externalIPs`；手動的 Endpoints（沒有 selector 的 Service）與 EndpointSlice 鏡像；雙堆疊；CoreDNS 的 Corefile、上游 DNS、`stubDomains`、`dnsPolicy`／`dnsConfig` 的其他值、Pod 的 `hostname`／`subdomain` 記錄；NetworkPolicy；`kubectl proxy` 與 API server 的服務代理 URL；`kubectl port-forward --address`。

## 14. 沒有把握的地方（依記得的格式寫，並在此註明）

- **驗證文字**：IANA 埠名的各句、headless 的 `may not be set to 'None' for NodePort services`、`spec.clusterIPs: Invalid value: []string{…}: failed to allocate IP …` 與 `may not change once set` 的欄位路徑、NodePort 的兩句、多個埠時的 `name: Required value`、錯誤的先後順序。
- **分配器**：動態區段的大小（ClusterIP 256、NodePort 86）。
- **表格與 describe**：`get ep` 只有不就緒位址時是空欄還是 `<none>`；EndpointSlice 的 `<unset>`；1.32 的 `describe svc` 是否已改讀 EndpointSlice（Endpoints 行的計數）、`LoadBalancer Ingress: 10.0.0.200 (VIP)` 的寫法、`Internal Traffic Policy` 行；`describe ep` 的版面。
- **物件**：Endpoints 的 `last-change-trigger-time` 註解（EndpointSlice 也有）、沒有端點時的 `endpoints: null` 與 `ports: null`、`kubernetes` 的 Endpoints 標籤與 EndpointSlice 的標籤、slice 的 `generation` 何時增加。
- **kubectl**：`expose` 的各種錯誤句、dry-run YAML 是否寫 `targetPort`、多埠的 `port-1` 名稱；`create service` 沒有子指令與 `--tcp` 時的訊息、AlreadyExists 的句子；port-forward 印出的遠端埠（targetPort 還是 Service 埠）、它挑 Pod 的規則、沒有 Pod 時的訊息、`Unable to listen on port …` 的全文。
- **DNS 與指令**：kubelet 的 `/etc/hosts` 內容（`fe00::0` 等行）、headless 沒有就緒 Pod 時是 NXDOMAIN 還是 NODATA、`nslookup` 的 `Address:\t…#53` 與結尾空行、BusyBox `wget` 的訊息（`bad address`、`can't connect to remote host`、`server returned error`、`error getting response`）。
- **MetalLB**：事件 `IPAllocated`「Assigned IP ["…"]」與 `AllocationFailed` 的文字、`ipMode: VIP`。
