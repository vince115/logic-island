# KUB-0 引擎階段 E32：`cluster` profile（`kube-*.ts`、`kubectl*.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：學習者的工作站有 `kubectl` 與一個虛構 kubeadm 叢集的管理員 kubeconfig。E1–E31 的行為與所有已發布的課逐字不變：全部 56 堂終端機課（208 題）的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `CLUSTER_PROFILE`（RANK 32） | `deploy-hosts` 的一切加上 `E32_COMMANDS = ['kubectl']`，feature `cluster`。課程機器寫 `profile: 'cluster'` 與 `kube: {…}` |
| profile 以下 | `kubectl` 是 `command not found`（較低 profile 的指令清單不變）；課程資料的 `kube` 報 `kube needs the cluster profile (engine stage E32)`；變體的 `kube` 報 `variant …: kube needs the cluster profile (engine stage E32)`；`kube-object`／`kube-pod` 檢查報需要 cluster 機器 |
| 說明頁 | `kubectl --help`、`man kubectl`（`KUBE_MANUAL`）、`help` 多一行 |

程式的分工（每個檔案都不到 200 行）：`kube-model.ts`（型別、常數、HumanDuration、Go tabwriter、確定性的名稱與 UID、數量）、`kube-system.ts`（kubeadm 的叢集、kubeconfig）、`kube-manifest.ts`（manifest 的讀取、嚴格解碼、欄位驗證）、`kube-api.ts`（API 的儲存、Pod 的預設值、requests、QoS、事件）、`kube-write.ts`（create、client-side apply、delete）、`kube-sched.ts`（排程器）、`kube-image.ts`（Image、主程式的行為、環境變數）、`kube-kubelet.ts`（容器的步驟）、`kube-status.ts`（Pod 的 status 與 STATUS 欄）、`kube-settle.ts`（依時間播放）、`kube-print.ts`、`kube-output.ts`、`kube-jsonpath.ts`、`kube-select.ts`、`kube-describe.ts`、`kube-lesson.ts`、`kube-checks.ts`；指令在 `kubectl.ts`、`kubectl-config.ts`、`kubectl-get.ts`、`kubectl-apply.ts`、`kubectl-meta.ts`、`kubectl-pod.ts`。既有檔案只多了 cluster 機器才走到的分支：`shell.ts`、`lesson.ts`、`server-lesson.ts`、`fs.ts`（`FsState.kube`）、`manual.ts`、`yaml.ts`（新的進入點）。

## 2. 叢集與 kubeconfig（`kube-system.ts`）

| 項目 | 內容 |
|---|---|
| 節點 | 預設 `cp-01`（10.0.0.50，`node-role.kubernetes.io/control-plane:NoSchedule`）、`node-01`（.51）、`node-02`（.52）；各 2 CPU、`3911796Ki`、110 個 Pod；kubeadm 的標籤；Pod CIDR `10.244.N.0/24`。節點是資料，不能 ssh |
| 系統物件 | 命名空間 default、kube-node-lease、kube-public、kube-system；Service `kubernetes`（10.96.0.1，443）與 `kube-dns`（10.96.0.10，53/UDP、53/TCP、9153）；Deployment `coredns`（2/2）、DaemonSet `kube-proxy`；控制平面的 static pod（etcd、kube-apiserver、kube-controller-manager、kube-scheduler，host network）、兩個 CoreDNS（10.244.0.2、.3）、每個節點一個 kube-proxy。這些都已經在執行，建立時間是叢集的建立時間，不會拉取。沒有 CNI 的 Pod |
| kubeconfig | `~/.kube/config`（學習者的，0600）是 kubeadm 的 admin.conf：叢集 `kubernetes`（`https://10.0.0.50:6443`）、使用者 `kubernetes-admin`、context `kubernetes-admin@kubernetes`；憑證欄位是模擬環境的 base64 文字（不是憑證或金鑰）。每個 kubectl 指令都讀這個檔案：沒有它是 `The connection to the server localhost:8080 was refused…`（`sudo kubectl` 讀 root 的，所以也是這句） |
| `config` | `view`（`DATA+OMITTED`；`--minify`、`--raw`、`-o jsonpath`）、`current-context`、`get-contexts`、`get-clusters`、`get-users`、`use-context`、`set-context`（`--current` 或名稱；`--namespace`、`--cluster`、`--user`），寫回檔案時鍵排序（同 `-o yaml`） |
| 其他 | `version`（Client、Kustomize、Server；`--client`）、`cluster-info`、`api-resources`（E32–E40 用到的子集） |

## 3. manifest（`kube-manifest.ts`、`yaml.ts`）

- `parseYamlDocuments`：以第一欄的 `---` 分開文件，每份文件交給既有的 `parseYaml`（其他文件的行改成空行，所以錯誤的行號是檔案的）；只有註解的文件略過。`parseYaml` 本身不變：Compose 仍拒絕多個文件，訊息相同。
- YAML 轉成 JSON：`true`／`false`、整數與小數、`null`；引號裡的是字串。（`yes`／`no` 在 sigs.k8s.io/yaml 是布林值，這裡仍是字串：子集。）`.json` 檔或 `{` 開頭的內容用 JSON 讀。
- 沒有 `apiVersion`／`kind`：`error: error validating "f.yaml": error validating data: [apiVersion not set, kind not set]; …`。不認得的 kind：`resource mapping not found … no matches for kind …`。之後階段的 kind（Deployment E34、Service E35、ConfigMap／Secret E36、Ingress E37、PVC／StatefulSet E38、HPA E40）：`（模擬環境：Deployment 要到引擎階段 E34 才模擬）`。
- 嚴格解碼（Pod、Namespace 的欄位子集）：所有不認得的欄位一起報 `strict decoding error: unknown field "spec.containers[0].imagee"`；型別錯誤是 Go 的 `json: cannot unmarshal string into Go struct field ContainerPort.spec.containers.ports.containerPort of type int32`。真實但屬於之後階段的欄位（探針、`lifecycle` → E33；`valueFrom`、`envFrom`、`imagePullSecrets` → E36；`volumes`／`volumeMounts` → E36/E38，服務帳號的 `kube-api-access-*` 除外；`affinity` → 課文）指名階段。
- 欄位驗證：名稱（Pod 是 RFC 1123 subdomain、Namespace 是 label）、`spec.containers: Required value`、容器名稱（label、重複）、`image: Required value`、requests 大於 limits、`restartPolicy` 的值；一個錯誤是 `The Pod "web" is invalid: …`，多個是 `* …` 的清單。

## 4. API 的儲存（`kube-api.ts`、`kube-write.ts`）

- 物件以 kind、命名空間、名稱找；每次寫入 resourceVersion 加一；新物件的 UID 由物件計數器與名稱的 SHA-256 算出，`creationTimestamp` 是時鐘的時間。
- Pod 的預設值（每次寫入都重套，冪等）：`kube-api-access-xxxxx` 投射 Volume 與掛載、兩個 300 秒的 NoExecute toleration、`imagePullPolicy`（`:latest` 或沒有標籤是 Always，其他 IfNotPresent）、`resources: {}`、`terminationMessagePath`、`dnsPolicy: ClusterFirst`、`enableServiceLinks`、`preemptionPolicy`、`priority: 0`、`restartPolicy: Always`、`schedulerName`、`securityContext: {}`、`serviceAccount(Name): default`、`terminationGracePeriodSeconds: 30`、埠的 `protocol: TCP`；status 一開始是 Pending 與 QoS class。
- `create -f`：已存在是 `Error from server (AlreadyExists): error when creating "web.yaml": pods "web" already exists`。
- `apply -f`（client-side）：新物件加上 `kubectl.kubernetes.io/last-applied-configuration`（manifest 加上命名空間與空的 `annotations`，鍵排序的精簡 JSON 加換行）→ `pod/web created`；已存在時以「上次 apply、目前、這次」三方合併：map 逐鍵合併（上次有、這次沒有的鍵刪除），**清單整個取代**（strategic merge 是課文）；結果相同是 `unchanged`，否則 `configured`；沒有 annotation 時先印 kubectl 的 Warning。Pod 的 spec 除了 image、activeDeadlineSeconds、tolerations、terminationGracePeriodSeconds 之外不能改（`spec: Forbidden: pod updates may not change fields other than …`，不印 diff）；換了 image 的容器由 kubelet 重新啟動（`Killing`：`Container web definition changed, will be restarted`，RESTARTS 加一，接著拉取新的 Image）。
- `-f -` 讀標準輸入；`--dry-run=client` 不寫入；`-n` 與 manifest 的命名空間不同時照 kubectl 拒絕；命名空間不存在是 NotFound。
- `create namespace NAME`；`create deployment|service|configmap|secret|ingress` 指名階段。
- `delete`：名稱、`type/name`、`-f`、`-l`、`--all`、`--ignore-not-found`；`pod "web" deleted`；`--grace-period=0 --force` 先印 Warning，再 `force deleted`。**E32 立即刪除**（Terminating 與寬限期是 E33）。刪除命名空間連同其中的物件；四個系統命名空間是 Forbidden；節點與事件不能刪。kube-system 的 Pod 刪掉後立刻回來（static pod 同名，CoreDNS 與 kube-proxy 換新的後綴，像它們的控制器做的）。
- `run NAME --image=…`（`--port`、`--labels`／`-l`、`--env`、`--restart`、`--command`、`--` 之後的參數、`--dry-run=client -o yaml|json`）：標籤預設 `run=NAME`；`-it`、`--rm` 說明沒有鍵盤。
- `label`／`annotate`（`k=v`、`k-`、`--overwrite`；`not labeled`）與 `taint nodes N k=v:Effect`、`k:Effect-`、`k-`：節點的標籤與 taint 改變後，排程器馬上重試 Pending 的 Pod。
- 上限：最多 60 個（非 kube-system 的）Pod、5 個節點。

## 5. 排程器（`kube-sched.ts`）

- 建立時立刻排程（同一秒）；有 `spec.nodeName` 的 Pod 不經過排程器（沒有 `Scheduled` 事件）。
- 過濾依 kube-scheduler 的順序，節點在第一個不符合處淘汰：TaintToleration（NoSchedule／NoExecute）、NodeAffinity（`nodeSelector`）、NodeResourcesFit（`Too many pods`、`Insufficient cpu`、`Insufficient memory`；以 requests 計算，只寫 limits 時以 limits 代替，取 containers 的總和與 init container 最大值中較大者；已結束的 Pod 不算）。
- 剩下的節點取 LeastAllocated 分數最高者（requests 用排程器的非零預設 100m、200Mi），同分取名稱較小者（真實的排程器還有其他分數、同分時隨機）。
- 失敗：`Warning FailedScheduling`（default-scheduler）`0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.`（「數量 原因」字串排序後以逗號連接）；status 的 PodScheduled 是 False／Unschedulable。
- 重試：只在叢集變化時（刪除 Pod、節點的標籤或 taint），在那個時間重試；同一則事件的 count 加一。Pod 結束而釋出資源、以及每 5 分鐘的重試不模擬。
- Pod IP 是節點 CIDR 從 .2 起最小的空位；host network 的系統 Pod 用節點位址。

## 6. 容器與 kubelet（`kube-image.ts`、`kube-kubelet.ts`）

| 步驟 | 內容 |
|---|---|
| Image | 來自機器的 `docker.images`（模擬的 Docker Hub，pullable）與 `docker.registries`（public 的才拉得到；私有的需要 E36 的 imagePullSecrets）。節點的 containerd 另有自己的 Image（`kube.images[].nodes` 宣告已經有的；學習者本機 Docker 的 Image 不算） |
| pull | IfNotPresent 且節點有：`Pulled`「Container image "…" already present on machine」。否則 `Pulling`，經過 `kube.images[].seconds`（預設 `pullSeconds`，2 秒）後 `Pulled`「Successfully pulled image "…" in 3s (3s including waiting). Image size: N bytes.」；Always 而節點已有時是 1 秒。拉不到：`Failed`（containerd 的 NotFound 文字）、`Failed`「Error: ErrImagePull」，1 秒後 `BackOff`「Back-off pulling image "…"」與「Error: ImagePullBackOff」，10 秒後再試，每次加倍到 300 秒。`Never` 而沒有：ErrImageNeverPull；名稱不合法：InvalidImageName |
| start | `Created`「Created container: web」、`Started`「Started container web」。主程式：`command` 取代 ENTRYPOINT、`args` 取代 CMD（只有 `command` 時 CMD 不用）；沒有取代時是 Image 自己的行為（`service`、`logs`、`output`、`exit` 與 E24 的 `runtime`）；否則先找 `docker.programs`；再交給 docker.ts 的 `runIn`（`sleep`、`echo`、`sh -c` 等）。常見的 `sh -c "echo …; sleep 3600"`：以 `;`、`&&` 分開，每一段各自執行，最後的 `sleep` 讓容器持續執行。找不到執行檔：`Failed`「Error: failed to create containerd task: …」，狀態 StartError（128） |
| 行為 | E24 的 `needsEnv`（容器看到的環境變數：PATH、`HOSTNAME`＝Pod 名稱、`env`、kubernetes Service 的變數、Image 的 ENV、HOME）、`exitAfter`、`memory` 與 `resources.limits.memory`（超過時 OOMKilled，137） |
| exit | Completed（0）、Error、OOMKilled、StartError。`restartPolicy`：Always 都重啟、OnFailure 非 0 才重啟、Never 不重啟。第一次重啟立刻；之後先維持 Terminated 1 秒，再 CrashLoopBackOff（`BackOff`「Back-off restarting failed container web in pod web_default(uid)」），等 10 秒、20、40…最多 300 秒；跑滿 10 分鐘後結束則從頭算。重啟時 RESTARTS 加一，上一次的結束成為 lastState，日誌移到 `--previous`，寫入層清空 |
| init container | 依序執行，前一個成功（0）才下一個，全部完成後所有 app 容器同時開始；失敗時依 restartPolicy 重啟（Init:CrashLoopBackOff），Never 則 Pod Failed |
| 時間 | 時鐘只在 `sleep` 與 `kubectl wait` 時前進；`settleKube` 在每個 kubectl 指令與每個檢查之前依時間順序播放到目前的時鐘（同時刻：排程先，再依 Pod 建立順序、init 先於 app）。每次最多 20000 步（大約兩個月的 5 分鐘退避迴圈） |

## 7. status 與 STATUS 欄（`kube-status.ts`）

- phase 照 kubelet 的 getPhase：init 未完成是 Pending；有容器執行中是 Running；全部停止時依 restartPolicy（Always → Running；OnFailure 全部 0 → Succeeded；Never 全部 0 → Succeeded，否則 Failed）；都還在等待是 Pending。
- 條件：PodReadyToStartContainers、Initialized、Ready、ContainersReady、PodScheduled（原因 ContainersNotInitialized、ContainersNotReady、PodCompleted、Unschedulable）。E32 沒有探針：執行中就是 ready。
- containerStatuses／initContainerStatuses：`containerID`（`containerd://` 加 64 位十六進位）、`image`（完整名稱 `docker.io/library/nginx:1.27`）、`imageID`（`…@sha256:` 加 Hub 的 digest）、`state`、`lastState`、`ready`、`restartCount`、`started`；另有 hostIP(s)、podIP(s)、qosClass、startTime。
- STATUS、READY、RESTARTS 照 kubectl 的 printPod：`Init:0/1`、`Init:Error`、`Init:CrashLoopBackOff`、等待或結束的原因、`ExitCode:N`、Completed 但仍有執行中的容器時是 NotReady；RESTARTS 寫成 `2 (15s ago)`。

## 8. 時間與表格

- AGE、LAST SEEN 用 apimachinery 的 HumanDuration（`119s`、`2m5s`、`10m`、`7h2m`、`30d`、`3y`）。
- 表格是 Go 的 tabwriter（minwidth 10、padding 3，最後一欄不補空白）；describe 是 minwidth 0、padding 2，欄寬以「連續有這一欄的行」為一組，所以 describe 的對齊和 kubectl 一樣隨段落改變。
- 時間在 describe 是 RFC1123Z（`Tue, 24 Nov 2026 10:00:00 +0000`，一律 UTC），在 API 物件是 RFC 3339（`2026-11-24T10:00:00Z`）。

## 9. get 與輸出格式（`kubectl-get.ts`、`kube-print.ts`、`kube-output.ts`、`kube-jsonpath.ts`）

| 項目 | 內容 |
|---|---|
| 類型 | pods／pod／po、nodes／no、namespaces／ns、events／ev，以及唯讀的 services／svc、deployments／deploy、daemonsets／ds；`type/name`、類型加名稱、以逗號連接的多個類型（名稱前加 `pod/`，表格之間空一行）。之後階段的類型（rs、cm、secret、ep、ing、pvc、sts、hpa、`all`）指名階段；其他是 `error: the server doesn't have a resource type "foo"` |
| 欄位 | Pod：NAME READY STATUS RESTARTS AGE，`-o wide` 加 IP NODE NOMINATED NODE READINESS GATES；節點：NAME STATUS ROLES AGE VERSION，wide 加 INTERNAL-IP EXTERNAL-IP OS-IMAGE KERNEL-VERSION CONTAINER-RUNTIME；命名空間；事件 LAST SEEN TYPE REASON OBJECT MESSAGE；Service、Deployment、DaemonSet 的標準欄位。`-A` 加 NAMESPACE，`--show-labels` 加 LABELS，`-L` 加標籤欄，`--no-headers` |
| 順序 | 依名稱（`-A` 先依命名空間）；事件依發生順序（真實的 `get events` 依物件名稱排序，見 §18）；`--sort-by` |
| 篩選 | `-l`／`--selector`（`a=b`、`a==b`、`a!=b`、`a in (x,y)`、`a notin (x)`、`a`、`!a`）與 `--field-selector`（metadata.name、metadata.namespace、spec.nodeName、spec.restartPolicy、status.phase） |
| `-o` | `yaml`（go-yaml v2：鍵排序、清單與鍵同一個縮排、會被讀成其他型別的字串用雙引號、多行字串用 `|`）、`json`（四個空白縮排，`<>&` 跳脫）、`name`、`jsonpath=`（`.a.b`、`[N]`、`[*]`、`..key`、`[?(@.type=="Ready")]`、`{range}{end}`、`{"\n"}`；缺少的鍵不印；之後沒有換行）、`custom-columns=`（缺少時 `<none>`）；多個物件是 `kind: List` |
| 其他 | 沒有物件時 stderr 印 `No resources found in default namespace.`；`-w`、`logs -f` 不等待，印出目前的狀態並附一句說明；`edit`、互動的 `exec -it … sh` 說明沒有編輯器與鍵盤 |

## 10. describe（`kube-describe.ts`）

Pod（Name、Namespace、Priority、Service Account、Node、Start Time、Labels、Annotations（不含 last-applied）、Status、IP(s)、Init Containers、Containers（Container ID、Image、Image ID、Port、Host Port、Command、Args、State、Last State、Ready、Restart Count、Limits、Requests、Environment、Mounts）、Conditions、Volumes、QoS Class、Node-Selectors、Tolerations、Events）、節點（Roles、Labels、Annotations、CreationTimestamp、Taints、Unschedulable、Conditions、Addresses、Capacity、Allocatable、System Info、PodCIDR(s)、Non-terminated Pods 與 Allocated resources）、命名空間；其他 kind 只有中繼資料。事件的 Age 是 `3m (x4 over 5m)`。多個物件之間空兩行。沒有 Lease 段落。

## 11. logs、exec、events、wait（`kubectl-pod.ts`）

- `logs POD`（`pod/NAME`）`-c`、`--previous`／`-p`、`--tail`、`--since`（s、m、h）、`--timestamps`：多個容器時 stderr 印 `Defaulted container "web" out of: web, wait (init)`（或依 `kubectl.kubernetes.io/default-container`）；容器還沒開始是 `container "web" in pod "web" is waiting to start: ContainerCreating`（拉不到 Image 時是 `trying and failing to pull image`）；沒有上一次是 `previous terminated container … not found`。
- `exec POD [-c] -- 指令`：容器的檔案是 Image 的加上這個容器的寫入層（容器重新啟動就消失）；`env` 印出 Pod 的環境變數；非 0 時 stderr 印 `command terminated with exit code N`；沒有 `--` 是 kubectl 的錯誤；Pod 已結束、容器沒有在執行各有 kubectl 的訊息。
- `events`（`--for pod/web`、`--types=Warning`、`-A`）：依時間，LAST SEEN 寫成 `30s (x3 over 60s)`，OBJECT 是 `Pod/web`。
- `wait --for=condition=Ready|--for=delete|--for=jsonpath='{…}'=值 [--timeout=30s]`：時鐘逐秒前進直到成立（`pod/web condition met`）或逾時（`error: timed out waiting for the condition on pods/web`），等待的時間和 `sleep` 一樣讓時鐘前進。

## 12. 確定性

UID、Pod 的 5 字元後綴、pod-template-hash（10 字元）、容器 ID、kube-api-access 的後綴都由 SHA-256 算出，字母表是 `bcdfghjklmnpqrstvwxz2456789`（真實的 pod-template-hash 是範本的 FNV-32a，這是文件化的差異）。Pod IP 取最小的空位；排程器以名稱打破平手。同樣的狀態與時鐘得到同樣的叢集；指令不修改原本的狀態物件。

## 13. 變體

`TerminalVariant.kube` 取代機器的整個 `kube`（例如不同的節點、不同的 manifest），學習者的指令也在變體上重播。

## 14. 課程資料（`kube-lesson.ts`）

```ts
kube: {
  nodes?: [{ name: 'cp-01', control: true }, { name: 'node-01', cpu: '2', memory: '3911796Ki', pods: 110, labels: { disk: 'ssd' }, taints: ['dedicated=gpu:NoSchedule'] }],
  created?: '2026-10-25 10:00:00',        // 預設 now 之前 30 天
  pullSeconds?: 2,
  images?: [{ name: 'nginx:1.27', seconds: 3, nodes: ['node-01'] }],
  manifests?: [{ text: '…YAML…', at: '2026-11-24 09:58:00', file: 'hello.yaml' }],  // 依序在那個時間 apply
  namespace?: 'dev',                      // kubeconfig 的 context 命名空間
}
```

驗證：1–5 個節點，名稱是唯一的 RFC 1123 label，位址是唯一的 IPv4，cpu／memory 是數量，pods 1–250，標籤與 taint 合法；`created` 不晚於 now；`pullSeconds` 與每個 Image 的秒數 0–600；Image 名稱合法、節點存在；最多 12 份 manifest，每份最多 4000 字元，時間介於 created 與 now；manifest 依序 apply 時的錯誤（例：`kube: kube.manifests[0]: Error from server (BadRequest): …`）；最多 60 個 Pod。Image 由機器的 `docker`（E20–E24 的資料）提供。

## 15. 檢查（`kube-checks.ts`）

| 檢查 | 意義 |
|---|---|
| `{ kind: 'kube-object', resource, name, namespace?, absent?, labels?, fields?: [{ path, equals }] }` | resource 是 Pod、Namespace、Node、Service、Deployment、DaemonSet；`fields` 的 path 是 JSONPath（`.spec.nodeName`），多個結果以空白連接後比對。說明例：`default 命名空間應該有名為 web 的 Pod（標籤 app=web）`；訊息例：`沒有名為 web 的 Pod`、`它的 .spec.nodeName 是 node-01` |
| `{ kind: 'kube-pod', name? \| selector?, namespace?, count?, status?, ready?, restartsAtLeast?, node?, container?, env?: [名稱, 值], file?: { path, content? } }` | 名稱或選擇器（二選一；`count` 需要選擇器）；每個選到的 Pod 都要符合：kubectl 的 STATUS、READY 全部就緒與否（E33 給 ready 探針的意義）、重新啟動次數至少、節點、容器看到的環境變數、容器裡的檔案（含寫入層；`content` 是包含）。訊息例：`web 的狀態是 ContainerCreating`、`符合 app=web 的 Pod 有 0 個`、`hello 重新啟動了 0 次` |

檢查前先 `settleKube` 到時鐘，檢查本身不移動時鐘：需要時間的解答要寫 `sleep` 或 `kubectl wait`（E24 的規則）。

## 16. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e32.test.ts` | profile 與分界（以下沒有 kubectl、資料與檢查需要 cluster profile、沒有叢集時連不上）；資料驗證；kubeadm 的叢集（節點、命名空間、Service、kube-system、kubeconfig 的權限、context）；apply 到 Running 的時間與事件、`-o yaml`、describe；排程器（FailedScheduling 的全文、nodeSelector 與節點標籤、taint）；CrashLoopBackOff 的退避時間、Completed（Never、OnFailure）、缺少環境變數的 Error、OOMKilled、ErrImagePull／ImagePullBackOff、init container；logs 與 exec（寫入層、環境變數、結束碼）；錯誤的 manifest 與之後的 kind、AlreadyExists、image 更新與 Forbidden、delete（-l、-f、命名空間、force、kube-system）、label；run 的 dry-run 與 `-f -`；選擇器與各種輸出；HumanDuration 與 tabwriter；多文件 YAML（Compose 的拒絕不變）；檢查的通過、訊息、說明與驗證；變體、確定性與不變性 |
| `tests/kube-capability.test.ts` | `KUB_SHAPES` 逐列、`kubeFromBlueprint` 只建立階段已完成的課、其他島的拒絕、預備島嶼的登錄、課程驗證拒絕 KUB 課、沒有新的活動 |
| `tests/support/kube-fixture.ts` | 只供測試：kub-32（cluster profile）、六個 Image（nginx、busybox、會當掉的、一次性的、記憶體成長的、需要環境變數的）、`~/k8s` 的 manifest、開機時的 Pod hello |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `cluster`。

## 17. 只在課文說明、或不模擬的部分

見 [KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §9；此外 E32 的：Terminating 與寬限期（E33）、Pod 結束釋出資源時排程器的重試、namespace 刪除的 Terminating 期間、`get events` 的真實排序、Pod 內的網路（`curl` 到其他 Pod，E35）、`KUBECONFIG` 環境變數與多個 kubeconfig、`--context` 以外的使用者與叢集切換、`explain`、`patch`、`replace`、`diff`。

## 18. 沒有把握的地方（依記得的格式寫，並在此註明）

- **版本**：`kubectl version` 三行的格式與 Kustomize v5.5.0；節點的 `Ubuntu 24.04.1 LTS`、`6.8.0-48-generic`、`containerd://1.7.24`；kubeadm 1.32 的 etcd 3.5.16-0、CoreDNS v1.11.3、pause 3.10。
- **表格標題**：Pod 的 `-o wide`（NOMINATED NODE、READINESS GATES）、節點 `-o wide`、Service、Deployment、DaemonSet（NODE SELECTOR）、事件；`kubectl events` 的 OBJECT 用大寫的 `Pod/web`。
- **describe**：Pod 與節點的版面（欄位順序、Volumes 的 `Optional: false` 是 1.32 的寫法或仍是 `ConfigMapOptional: <nil>`、Kube-Proxy Version 是否還在、沒有 status 的容器少了哪些行、Lease 段落）；Conditions 每格後的空白；多個物件之間空兩行。
- **事件文字**：`Created container: web`（1.32 的新寫法）、`Successfully pulled image … in 3s (3s including waiting). Image size: N bytes.`、`Back-off restarting failed container web in pod web_default(uid)`、`Back-off pulling image`、`Container web definition changed, will be restarted`、FailedScheduling 的全文與 preemption 字尾的排序；containerd 找不到 Image、私有 Registry 拒絕（以 Docker Hub 的「pull access denied …」代替）、主機名稱查不到的訊息；StartError 的文字與結束碼 128。
- **錯誤文字**：strict decoding 與 unmarshal 的訊息（Go 結構名稱、int32／int64）、`error validating data`、`resource mapping not found`、Pod 更新的 Forbidden（不印 diff）、名稱不合法的 RFC 1123 說明、`--overwrite` 的兩種訊息、`label "x" not found.`、taint 的錯誤、`exec` 找不到執行檔的訊息與結束碼、`logs` 對未排程的 Pod（這裡是 `is not available`）、未知 flag 與子指令的兩行、`create namespace` 沒有名稱。
- **時間模型**：第一次重啟立刻、之後 Terminated 1 秒再 CrashLoopBackOff、10 秒加倍到 300 秒、跑滿 10 分鐘重置；ErrImagePull 1 秒後變 ImagePullBackOff；Always 而節點已有 Image 時拉取 1 秒；Ready 條件的時間；image 更新時上一次的結束記為 Completed、0。
- **`-o yaml`**：go-yaml v2 什麼時候用單引號、雙引號；`run --dry-run=client -o yaml` 在 1.32 是否還印 `creationTimestamp: null`；containerStatuses 是否還有 `volumeMounts`、`allocatedResources` 等新欄位（沒有輸出）。
- **kubeconfig**：admin.conf 的欄位順序與憑證資料（這裡是說明文字的 base64）；`config view` 對 `-data` 欄位印 `DATA+OMITTED`。
- **其他**：LeastAllocated 的分數與同分規則（真實是隨機）；`kubectl get events` 的排序；`wait` 的輸出名稱；`api-resources` 只列子集。
