# KUB-0：Kubernetes 與可靠性工程島的課程能力

> 2026-11-24。目標：讓 Kubernetes 與可靠性工程島（`kubernetes-reliability`，前綴 KUB，15 堂）可以撰寫、驗證、發布。本階段**不寫任何課程內容**，只把島嶼登錄為預備島嶼、建立逐課的活動對應（`KUB_SHAPES`），並建好終端機引擎階段 **E32 `cluster`**（以真實的 `kubectl` 操作模擬的 Kubernetes 叢集）。E32 的完整規格在 [KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)；本文件是 E32–E40 與 `devops-explorer` 階段 D5、D6 的總說明處，之後每個階段另有自己的 `KUB0_E3x_*.md`。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 範圍

| 部分 | 內容 |
|---|---|
| KUB-0（登錄） | `PREPARED_ISLAND_IDS = ['kubernetes-reliability']`、`LessonPrefixWritten` 與 `ISLAND_PREFIX` 加上 `KUB`、`UNITS['kubernetes-reliability'] = []`、`kubeFromBlueprint` 與逐課的 `KUB_SHAPES`；沒有課程、頁面、旗標、3D、GLB 或 `mapState` 的改動 |
| E32 `cluster`（已完成） | `CLUSTER_PROFILE`（RANK 32，`deploy-hosts` 之上，`E32_COMMANDS = ['kubectl']`）；叢集的共用模型（節點、API 物件、排程器、kubelet 的 Pod 生命週期、事件、kubeconfig）與 kubectl 的動詞、表格與輸出格式；檢查 `kube-object`、`kube-pod` |
| E33 `probes`（已完成） | `PROBES_PROFILE`（RANK 33，`cluster` 之上，沒有新指令）；探針、課程宣告的健康狀態、preStop、SIGTERM 與寬限期、Terminating、會等待的 `kubectl delete`（[KUB0_E33_PROBES](KUB0_E33_PROBES.md)） |
| E34 `workloads`（已完成） | `WORKLOADS_PROFILE`（RANK 34，`probes` 之上，沒有新指令）；ReplicaSet 與 Deployment 控制器、滾動更新與 Recreate、`kubectl rollout`、`create deployment`、`scale`、`set image`、`cordon`、`uncordon`、`drain`、課程宣告的節點故障；檢查 `kube-workload`、`kube-rollout`（[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md)） |
| E35 `kube-net`（已完成） | `KUBE_NET_PROFILE`（RANK 35，`workloads` 之上，沒有新指令）；Service（ClusterIP、NodePort、LoadBalancer、headless）、Endpoints 與 EndpointSlice 控制器、kube-proxy 的輪替、CoreDNS、Pod 裡的 `curl`／`getent`／`nc`／`nslookup`／`wget`、`expose`、`create service`、`port-forward`；檢查 `kube-service`，`http`、`reach` 加上 `pod`（[KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md)） |
| E36 `kube-config`（已完成） | `KUBE_CONFIG_PROFILE`（RANK 36，`kube-net` 之上，`E36_COMMANDS = ['base64']`）；ConfigMap 與 Secret（`stringData`、base64 的 `data`、三種類型、`immutable`、`kube-root-ca.crt`）、`create configmap|secret generic|tls|docker-registry`、`env`／`envFrom`／`valueFrom`／`optional`、CreateContainerConfigError、configMap／secret Volume（atomic writer、`items`、`defaultMode`、`subPath`、FailedMount）、60 秒的更新模型、`imagePullSecrets`（E23 Registry）、GNU 的 `base64`；檢查 `kube-config`，`kube-object` 加上 ConfigMap／Secret（[KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md)） |
| E37 `ingress`（已完成） | `INGRESS_PROFILE`（RANK 37，`kube-config` 之上，沒有新指令）；Ingress 與 IngressClass、課程宣告的 ingress-nginx（LoadBalancer 或 NodePort、預設 class）、host 與 Exact／Prefix／最長比對的路由、預設後端 404、503／502、TLS（E36 的 tls Secret、E13 驗證、Fake Certificate、ssl-redirect 308、HSTS）、Gateway API v1 子集（GatewayClass、Gateway、HTTPRoute、條件、E15 的平滑加權輪替）、`create ingress`；檢查 `kube-object` 加上這五種與 `conditions`，`http` 的 Host 標頭（[KUB0_E37_INGRESS](KUB0_E37_INGRESS.md)） |
| E38 `kube-storage`（已完成） | `KUBE_STORAGE_PROFILE`（RANK 38，`ingress` 之上，沒有新指令）；StorageClass、PV、PVC 與 PV controller（靜態與動態綁定、WaitForFirstConsumer、課程宣告的 provisioner、Retain／Delete／Recycle、protection finalizer、擴充）、排程器的 Volume 外掛與 Multi-Attach、Volume 的檔案樹與 `emptyDir`、StatefulSet controller、`kubectl exec … -- tar` 串流與 `kubectl cp`；檢查 `kube-volume`，`kube-workload` 加上 StatefulSet（[KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md)） |
| E39 `helm`（已完成） | `HELM_PROFILE`（RANK 39，`kube-storage` 之上，`E39_COMMANDS = ['helm']`）；新的 Go `text/template` 引擎與 sprig 子集（不改 `storage-net-cli.ts` 的 `goTemplate`）、chart 檔案、values 的優先順序、存成 Secret 的 release、install／upgrade／rollback／uninstall 與 `--wait`／`--atomic`、list／status／history／get、template／lint／create／package、虛構的儲存庫 `https://charts.example.test`（repo、search、pull、show）；檢查 `helm-release`（[KUB0_E39_HELM](KUB0_E39_HELM.md)） |
| E40、D5、D6 | 規劃中（§5、§6），範圍已定，細節在各自的批次寫入 |

不新增任何執行期套件；沒有亂數（UID、名稱的後綴、容器 ID 都由資料的 SHA-256 算出）；時鐘只在 `sleep` 與 `kubectl wait` 時前進。叢集是**虛構的 kubeadm 叢集**，輸出依真實 kubectl v1.32 的格式撰寫，但無法離線與真實叢集逐字比對，所以凡是憑記憶寫的文字都列在 §9。

## 2. 活動對應（`kubeFromBlueprint`，`src/content/curriculum/lessons.ts`）

和 CICD 島相同，用**逐課的表格** `KUB_SHAPES`（15 列，測試逐列斷言，`tests/kube-capability.test.ts`）。`stages` 是那一課需要的終端機引擎階段（E32–E40，加上它倚賴的較早階段）與 `devops-explorer` 階段；KUB 範圍（E32–E40）的引擎階段要在 `KUBE_STAGES_BUILT`、D 階段要在 `DEVOPS_STAGES_BUILT` 才能建立那一課，否則 `kubeFromBlueprint` 會說哪一個階段還沒做好。

| 課 | 藍圖活動 | 課程活動 | 能力 | 需要的階段 | 理由 |
|---|---|---|---|---|---|
| KUB01 | cluster-sim | `terminal-sim` | terminal | E32、E33、E34 | 和 Compose（E23，一台主機）比較叢集的期望狀態；刪除 Pod、排空節點時親眼看到調和 |
| KUB02 | architecture-diagram | `network-sequence` | terminal、network-protocol | E32 | 同 DKR01、DKR02、SRV05：場景描出 `kubectl apply` 之後 API server → etcd → controller → scheduler 綁定 → kubelet → containerd；旁邊以 `kubectl get nodes`、`get pods -n kube-system` 看 static pod |
| KUB03 | cluster-sim | `terminal-sim` | terminal | E32、E33 | Pod 的 manifest、多個容器與 init container、生命週期、探針 |
| KUB04 | cluster-sim | `terminal-sim` | terminal | E32–E34 | ReplicaSet、Deployment、擴縮、標籤與選擇器、自我修復 |
| KUB05 | cluster-sim | `terminal-sim` | terminal | E35 | Service、Endpoints、叢集 DNS、NodePort 與 LoadBalancer |
| KUB06 | cluster-sim | `terminal-sim` | terminal | E36 | ConfigMap 與 Secret，以 `base64 -d` 證明 Secret 只是編碼 |
| KUB07 | request-path | `network-sequence` | terminal、network-protocol | E35、E37（+E13） | 同 SRV 的請求路徑：client → LB → ingress controller → Service → Pod 與 TLS 終結，旁邊是真的 Ingress 與 HTTPRoute |
| KUB08 | cluster-sim | `terminal-sim` | terminal | E38 | PV、PVC、StorageClass、StatefulSet、備份 |
| KUB09 | cluster-sim | `terminal-sim` | terminal | E39 | Helm |
| KUB10 | cluster-sim | `terminal-sim` | terminal | E40 | requests 與 limits、HPA、metrics-server |
| KUB11 | cluster-sim | `terminal-sim` | terminal（`withOptional`：devops-explorer） | E34、E35 | readiness 決定誰收流量；rollout 的歷史與 undo；可選的 D2 對照同 CICD10 |
| KUB12 | monitoring-dashboard | `monitoring-dashboard` | devops-explorer、terminal | D3（+D4）、E40 | 同 CICD12：節點與 Pod 的序列，加上 `kubectl top`、`get events`、RESTARTS 與 `describe node` 的 Allocated resources；Prometheus 以 Pod 提供的 `/metrics` 文字頁（E12 responder）說明，PromQL 只在課文 |
| KUB13 | metric-explorer | `monitoring-dashboard` | devops-explorer | D3、D4、**D5** | 三本柱：序列、帶 `trace_id` 的日誌、追蹤的瀑布圖 |
| KUB14 | metric-explorer | `monitoring-dashboard` | devops-explorer | **D6** | SLI、SLO、SLA、錯誤預算、燃燒率告警 |
| KUB15 | challenge-stages | `challenge-stages` | terminal、devops-explorer、visualization | E32–E40、D3、D5、D6 | 同 CICD15、DKR15 的形狀 |

**`metric-explorer` 不登錄**：KUB13、KUB14 擴充 `devops-explorer` 的既有活動 `monitoring-dashboard`。`CAPABILITY_ACTIVITY` 每個活動只對應一種能力，而 `metric-explorer` 也是 ML19–ML22（模型評估指標）的藍圖活動；綁到 `devops-explorer` 會讓之後的 ML 課拿到錯的能力。這和 `architecture-diagram` 維持 `content.ops`、SRV 與 DKR 改對應 `network-sequence` 是同一個避免撞名的做法。WEB14、MOB10 的 `metric-explorer` 已對應 `dom-explorer`，不受影響。

## 3. 島嶼與活動的登錄

- `src/content/curriculum/schema.ts`：`PREPARED_ISLAND_IDS = ['kubernetes-reliability']`、`LessonPrefixWritten` 加上 `'KUB'`、`ISLAND_PREFIX['kubernetes-reliability'] = 'KUB'`。**不**移入 `ISLAND_IDS`（KUB-1 才移入，放在 `devops-cicd` 之後，系統區的順序）。
- `src/content/curriculum/units.ts`：`'kubernetes-reliability': []`。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 KUB 課（「kubernetes-reliability is prepared for authoring, not a curriculum island yet」）。15 堂仍是規劃中、沒有頁面；已發布的課與頁面不變。
- `LESSON_ACTIVITIES`、`LESSON_CAPABILITIES`、實驗室都**沒有**改動。
- `tests/devops-capability.test.ts` 與 `tests/llm-capability.test.ts` 的 `PREPARED_ISLAND_IDS` 斷言由 `[]` 改為 `['kubernetes-reliability']`（照實反映目前唯一的預備島嶼）。
- `docs/curriculum/data/island-capabilities.json`：`kubernetes-reliability` 由 `missing` 改為 `prepared`；`AUTONOMOUS_CURRICULUM_PROGRESS.md` 以 `scripts/curriculum-queue.ts` 重新產生（下一批成為 KUB01–KUB05），`COURSE_PRODUCTION_PROGRESS.md` 以 `scripts/course-progress.ts` 檢查（沒有變動），兩者的 `--check` 都通過。

**活動登錄的影響**（`src/content/world/activities.ts` 由目錄課程的藍圖活動產生 planned 項目）：
- `cluster-sim`：沒有實驗室（`P7_SYSTEMS_LABS` 說它只是課程活動），只有 KUB 用；隨著課寫好，它的島嶼清單會縮小，**KUB11 寫好後這個項目會從 `/learn` 的活動登錄消失**（已決定，不另加實驗室）。目前仍是 planned。
- `request-path`：仍列出（規劃中的 `network-request` 實驗室保留它，DKR-5 的規則）。
- `architecture-diagram`：經由 DB19 維持 implemented，島嶼清單之後少了 `kubernetes-reliability`。
- `metric-explorer`：只為 ML 維持 planned。
- `monitoring-dashboard`：已 implemented；D5、D6 的批次再把 `IMPLEMENTED_TEXT` 補上追蹤與 SLO 的說明。

## 4. 批次與階段

課程依編號發布。每一批先建好它的階段，再寫課。

| 批次 | 課 | 先建的階段 |
|---|---|---|
| KUB-0 | 無 | 登錄（§3）、`KUB_SHAPES`、本文件、**E32**（[KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)） |
| KUB-1 | KUB01–KUB04 | **E33**、**E34**；島嶼移入 `ISLAND_IDS`（`devops-cicd` 之後） |
| KUB-2 | KUB05–KUB07 | **E35**、**E36**、**E37** |
| KUB-3 | KUB08–KUB10 | **E38**、**E39**（Helm 在終端機裡模擬，已決定）、**E40** |
| KUB-4 | KUB11–KUB14 | **D5**、**D6**（KUB11、KUB12 不需要新階段） |
| KUB-5 | KUB15 | 無（只有總結專題） |

- **KUB-1 已發布（2026-11-24）**：KUB01–KUB04 依 §2 的對應發布（[KUBERNETES_RELIABILITY_ISLAND](KUBERNETES_RELIABILITY_ISLAND.md)），島嶼移入 `ISLAND_IDS`（`devops-cicd` 之後），`PREPARED_ISLAND_IDS` 成為空的；單元「編排的觀念與叢集架構」（KUB01–KUB02）與「Pod 與工作負載」（KUB03–KUB04）。活動登錄依 §3：`terminal-sim`、`network-sequence` 的島嶼清單加上本島，`architecture-diagram` 的少了本島，`cluster-sim` 仍是規劃中。課文避開的引擎差異（故障節點上的 `kubectl delete pod` 立即返回、`get events --field-selector involvedObject.kind` 不支援、原生 sidecar／共用 Volume／Pod 內 localhost 沒有模擬、manifest 的 `sh -c` 字串含 `'` 無法解析）記在島嶼文件。
- **KUB-2 已發布（2026-11-24）**：KUB05–KUB07 依 §2 的對應發布，階段 E35 `kube-net`、E36 `kube-config`、E37 `ingress` 建好；單元「服務、設定與入口」（KUB05–KUB07）。KUB05、KUB06 是 `terminal-sim`，KUB07 是 `network-sequence`（藍圖的 request-path，終端機旁加上一個 HTTPS 請求進入叢集的網路情境）。活動登錄依 §3：島嶼清單沒有變動；`request-path` 仍是規劃中，已沒有目錄課程使用它，島嶼清單改由藍圖大綱列出（`network-servers` 與本島）。課文避開的引擎差異（後面的開機 manifest 改過的 ConfigMap 在 Pod 第一次啟動時已是新版本、後端收到的 X-Real-IP／X-Forwarded-For 是 controller Pod 的位址、`api-resources` 不列出 endpointslices、kube-proxy 依端點順序輪流）記在島嶼文件。

D5、D6 只在 `src/lib/devops` 與 `src/components/curriculum`，可以和任何 E 階段平行。KUB-2 或 KUB-3 太大時，在階段的邊界分批（同 CICD-1 的調整）。

`KUBE_STAGES_BUILT = ['E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'E38', 'E39']`（E33、E34 在 KUB-1 建好，KUB01、KUB03、KUB04 可以建立；E35 在 KUB-2 建好，KUB05 與 KUB11 可以建立；E36 在 KUB-2 建好，KUB06 可以建立；E37 在 KUB-2 建好，KUB07 可以建立；E38 在 KUB-3 建好，KUB08 可以建立；E39 在 KUB-3 建好，KUB09 可以建立）；之後每個批次在建好階段時加上它。

## 5. 終端機引擎階段 E32–E40

profile 的鏈接在 `deploy-hosts`（RANK 31）之後，每個 profile 包含它之下的一切。`services` 已經是 E6 的 profile 名稱，所以新的 profile／feature 是：`cluster`、`probes`、`workloads`、`kube-net`、`kube-config`、`ingress`、`kube-storage`、`helm`、`autoscaling`。新的指令只列在自己的 profile 與之上：`E32_COMMANDS = ['kubectl']`、`E36_COMMANDS = ['base64']`、`E39_COMMANDS = ['helm']`，所以較低 profile 的 `command not found` 清單不變。

每個階段照 E2x、E3x 的做法：自己的 `tests/terminal-eNN.test.ts`；每一堂已發布的終端機課逐一重播、輸出相同；`tests/terminal-e1.test.ts` 的 `PROFILES` 加上新的 profile；檔案都不到 300 行；一個 `docs/curriculum/KUB0_E3x_*.md`。

| 階段 | 狀態 | 範圍 | 檢查 |
|---|---|---|---|
| **E32 `cluster`** | **已完成** | 共用模型、kubeconfig、`version`、`cluster-info`、`api-resources`（子集）、命名空間、節點、kube-system；`get`、`describe`、`apply -f`、`create -f`、`delete`、`label`、`annotate`、`taint`、`run`、`logs`、`exec`、`events`、`wait`；排程器與 kubelet 的生命週期（[KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)） | `kube-object`、`kube-pod` |
| **E33 `probes`** | **已完成** | liveness、readiness、startup（`httpGet` 對容器的 responder、`tcpSocket`、`exec`）；課程宣告的隨時間變化的健康狀態（`kube.health`）；READY 欄、Ready 條件、`Unhealthy`／`Killing` 事件與 liveness 重啟；`terminationGracePeriodSeconds`、`preStop`、E24 `signals` 處理 SIGTERM、Terminating、`kubectl delete` 等待（[KUB0_E33_PROBES](KUB0_E33_PROBES.md)） | `kube-pod` 的 `ready` 取得探針的意義 |
| **E34 `workloads`** | **已完成** | ReplicaSet、Deployment 的控制器、owner、收養與改標籤讓 Pod 脫離、選擇器不可變、背景串連刪除與 `--cascade=orphan`；`create deployment`、`scale`、`set image`；滾動更新（沿用 `src/lib/devops/rollout.ts` 的 `resolveRolling`）、Recreate、`minReadySeconds`、`progressDeadlineSeconds`、revisionHistoryLimit；`rollout status|history|undo|pause|resume|restart`；`cordon`、`uncordon`、`drain --ignore-daemonsets`、課程宣告的節點故障（50 秒後 NotReady，300 秒後驅逐）（[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md)） | `kube-workload`、`kube-rollout` |
| **E35 `kube-net`** | **已完成** | Service（ClusterIP、NodePort、LoadBalancer、headless；LB 沒有宣告位址池時是 `<pending>`，課程的 `lbPool` 是 MetalLB 式的提供者）、雜湊加下一個空位的 ClusterIP 與 NodePort、`expose`、`create service`、具名 targetPort、Endpoints 與 EndpointSlice 控制器（readiness、Terminating）、CoreDNS 與 `ndots:5`、Pod 內的 `curl`／`getent`／`nc`／`nslookup`／`wget`（E22 的容器網路）、kube-proxy 依端點 IP 順序輪替、從學習者機器以 E12 `curl` 到 NodePort 與 LB（ClusterIP 逾時）、`port-forward` 是 E4 背景工作與 E10 的聆聽（[KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md)） | `kube-service`；`http`、`reach` 加上 `pod?` |
| **E36 `kube-config`** | **已完成** | `create configmap|secret generic|tls|docker-registry`、`-o yaml` 的 base64 與 `base64` 指令（GNU coreutils 9.4，76 欄換行）、`env`／`envFrom`／`valueFrom`／`optional`、CreateContainerConfigError（每 10 秒重試）、configMap／secret Volume 與 FailedMount、掛載內容在最後一次改變的 60 秒後更新、`subPath` 與環境變數不更新、`immutable`、`imagePullSecrets`（E23 Registry）、tls Secret 讀 E13 的 PEM（[KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md)） | `kube-config`；`kube-object` 加上 ConfigMap、Secret；`kube-pod` 的 `env`／`file` 看得到解析的變數與 Volume |
| **E37 `ingress`** | **已完成** | 課程宣告的 ingress-nginx（`kube.ingressController`）、Ingress v1 的 host 與路徑規則（Exact、依路徑元素的 Prefix、最長比對、單一標籤的萬用字元）、預設後端 404、`defaultBackend`、503／502、TLS（E13 `tls.ts`；沒有 Secret 時是 Fake Certificate、ssl-redirect 308、HSTS）、`create ingress`；Gateway API v1 子集（`kube.gatewayApi`：GatewayClass、Gateway 的位址與 listener、HTTPRoute 的 parents 條件與 E15 `proxy.ts` 的平滑加權輪替）（[KUB0_E37_INGRESS](KUB0_E37_INGRESS.md)） | `http`（Host 標頭）、`kube-object`（加上 `conditions`） |
| **E38 `kube-storage`** | **已完成** | StorageClass（預設 class、課程宣告的 provisioner、Immediate／WaitForFirstConsumer、Delete／Retain、擴充）、PV／PVC 的綁定與存取模式（RWO 的網路磁碟跨節點是 Multi-Attach）、Pending 的真實事件、Released／Failed／Recycle、PV 的內容是依後端保存的檔案樹（hostPath 每節點一份）、`emptyDir`、唯讀掛載與 E24 `writes`；StatefulSet 的 OrderedReady／Parallel、穩定名稱與 DNS、`volumeClaimTemplates`、縮減與保留策略、partition 的滾動更新、OnDelete；`kubectl exec … -- tar czf -`／`-i … xzf -` 與 `kubectl cp`（[KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md)） | `kube-volume`；`kube-workload` 的 StatefulSet；`kube-pod` 的 `file` 看得到 Volume |
| **E39 `helm`** | **已完成** | chart 檔案（資料夾、封存檔、儲存庫）、新的 Go template 引擎（`helm-tpl-*.ts`，不改 `storage-net-cli.ts` 的 `goTemplate`）與 sprig 子集、Go 與 Helm 的錯誤文字、values 的優先順序（values.yaml < `-f` < `--set`）、`.Release`／`.Chart`／`.Capabilities`／`.Template`／`.Files`、install／upgrade／rollback／uninstall（`--wait`、`--atomic`、`--timeout`、`--create-namespace`、`--dry-run`）、list／status／history／get／template／lint／create／package、`https://charts.example.test` 的 repo／search／pull／show；release 存成 Secret `sh.helm.release.v1.NAME.vN`（[KUB0_E39_HELM](KUB0_E39_HELM.md)） | `helm-release` |
| E40 `autoscaling` | 規劃 | requests／limits、QoS、在 limit 被 OOMKilled（E24 的記憶體模型）、metrics-server 與 `kubectl top`、課程宣告的負載（沿用 D3 的 `generateSeries`）、HPA `autoscaling/v2`（容忍 0.1、15 秒同步、預設的擴張策略、300 秒縮減穩定視窗）、`autoscale`、Pending（Insufficient cpu）；節點自動擴展在 E40 決定 | `kube-hpa` |

**變體**：`TerminalVariant.kube` 取代整個叢集資料（節點、manifest），所以從 `kubectl get` 讀到的答案不能直接打進去（同 `docker`、`git` 的變體）。E32 已實作。

**資料**：`TerminalMachine.kube`（E32：`nodes`、`created`、`pullSeconds`、`images`、`manifests`、`namespace`）；之後的階段加上 `addons`（metricsServer、ingressNginx、gateway、lbPool、儲存的 provisioner、nodePool?）、`load[]`、`charts`／`repos`。每個階段的欄位在它的 profile 以下被拒絕：「needs the X profile (engine stage E3x)」。上限：5 個節點、60 個 Pod、20 個 Deployment，讓 settle 的迴圈保持便宜。

## 6. `devops-explorer` 階段 D5、D6（規劃）

| 階段 | 範圍 |
|---|---|
| D5 `traces` | `content.devops.traces`：span（16 位十六進位 ID、parent、service、name、整數毫秒的 start／duration、status、kind、attributes），加上以 `src/lib/llm/prng.ts` 的種子產生器；算出追蹤時間、self time（span 減去子 span 的聯集）、關鍵路徑、瓶頸服務、以 nearest rank 算的 p95；日誌（D4 的 `trace_id`）到追蹤的連結與 D3 分鐘的 exemplar；**head sampling** 用本課程文件化的 trace-id 門檻規則（不宣稱 OpenTelemetry 的位元）；**tail sampling** 規則；**基數**是各標籤不同值數的乘積。查詢 `trace`、`sampling`、`cardinality`；新練習 `sampling-plan` |
| D6 `slo` | 情境的 `bucketMinutes` 為 1、5 或 60，最多 720 格；good 與 total 事件的序列；以 permyriad 表示的目標與 `windowMinutes`；可選的 SLA 賠償表；燃燒率告警（長視窗、短視窗、以十分之一表示的倍數）。全部是整數運算（交叉相乘比較、顯示時四捨五入同 CICD0 §5.3），多視窗告警以 D3 的狀態機與事故比對評估。查詢 sli、預算事件、已用與剩餘百分比、某時的燃燒率、預算耗盡時間、SLA 賠償；練習 `burn-alert` |

`DEVOPS_STAGES_BUILT` 在各自的批次加上 D5、D6。

## 7. 新的檢查種類

E32 有 `kube-object`、`kube-pod`（[KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md) §15，`src/lib/terminal/kube-checks.ts`，接在 `TERMINAL_CHECK_KINDS`）；E34 有 `kube-workload`（resource、name、replicas／readyReplicas／updatedReplicas／availableReplicas、image、revision、paused、condition）、`kube-rollout`（complete、revision、change-cause、歷史的筆數）（[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md) §10，`kube-workload-checks.ts`）。E35 有 `kube-service`（type、clusterIP、ports 的 targetPort 與 nodePort、selector、readyEndpoints、addresses、externalIP）與 `http`、`reach` 的 `pod?`（從那個 Pod 發出請求）（[KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md) §9，`kube-service-checks.ts`）。E36 有 `kube-config`（ConfigMap／Secret 的類型、鍵、值、immutable、檔案裡沒有明文值），`kube-object` 加上 ConfigMap 與 Secret（[KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md) §9，`kube-config-checks.ts`）。E37 沒有新的檢查種類：`kube-object` 加上 Ingress、IngressClass、GatewayClass、Gateway、HTTPRoute 與 `conditions`（HTTPRoute 看每一筆 parent），`http` 的 `requestHeaders` 的 Host 取代 URL 的（[KUB0_E37_INGRESS](KUB0_E37_INGRESS.md) §10）。E38 有 `kube-volume`（PVC／PV 的 phase、storageClass、容量、存取模式、boundTo、reclaimPolicy），`kube-workload` 加上 StatefulSet（currentRevision、updateRevision、rolledOut），`kube-pod` 的 `file` 看得到 PVC 與 emptyDir（[KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md) §10，`kube-volume-checks.ts`）。E39 有 `helm-release`（status、revision、revisionsAtLeast、chart 名稱與版本、appVersion、計算後的值在點路徑的值）（[KUB0_E39_HELM](KUB0_E39_HELM.md) §12，`helm-checks.ts`）。之後：`kube-hpa`（min、max、target、replicas 的範圍）。

## 8. 要固定的版本（全部標記「待核對」）

Kubernetes、kubectl 與伺服器 v1.32.3；`kubectl version` 印出的 Kustomize v5.5.0；containerd 1.7.24、CoreDNS 1.11.3、etcd 3.5.16-0、pause 3.10；ingress-nginx controller v1.12.x、Gateway API v1.2.1（standard channel）、metrics-server v0.7.2；Helm v3.16.4；節點作業系統 Ubuntu 24.04（E32 印出 `Ubuntu 24.04.1 LTS`、核心 `6.8.0-48-generic`）。

## 9. 只在課文說明的部分

雲端的負載平衡器與 cloud-controller-manager；CNI 的內部（veth、iptables、IPVS、eBPF、Calico、Cilium）與 NetworkPolicy（E32 的叢集也沒有 CNI 的 Pod）；etcd 的內部（Raft、compaction、`etcdctl snapshot`）；admission 與 webhook、RBAC 的細節（最多提到 `auth can-i`）；CRD 與 operator；DaemonSet、Job、CronJob（只在 kube-system 裡看得到）；PodDisruptionBudget；VPA 與 cluster autoscaler 的內部；server-side apply、清單的 strategic merge（清單整個取代，已文件化）、kustomize `-k`；Secret 的靜態加密、KMS 與外部 Secret；託管的 Kubernetes 與 kubeadm 的安裝；`kubectl debug`、`attach`、`proxy`、`edit`；watch 模式；Prometheus server、PromQL 與 Grafana；OpenTelemetry Collector 與 SDK 的設定；混沌工程工具（演練改用刪除 Pod、排空節點與課程宣告的節點故障）；Helm 的 hook、測試、外掛、相依的 chart 與 OCI chart（`helm create` 是縮減的範本，見 [KUB0_E39_HELM](KUB0_E39_HELM.md) §10）。

## 10. 風險

- 這是目前最大的引擎範圍（九個階段）。對策：嚴格的階段切分、每次都重播所有已發布的課、§5 的上限。
- 輸出無法離線與真實叢集比對；每個階段的「沒有把握的地方」列出要核對的文字。
- 控制器的時間是固定、文件化的模型，不是真實的 informer 延遲。
- YAML 子集與 Helm template 子集可能慢慢擴大。
- 以固定的選擇取代真實的亂數（名稱、IP、端點），都已文件化。
- `cluster-sim` 從 `/learn` 的活動登錄消失可能讓人意外（已決定接受）。

## 11. 沒有把握的地方

- E32 的所有輸出文字見 [KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md) §18；E33 的見 [KUB0_E33_PROBES](KUB0_E33_PROBES.md) §13；E34 的見 [KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md) §15；E35 的見 [KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md) §14；E36 的見 [KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md) §14；E37 的見 [KUB0_E37_INGRESS](KUB0_E37_INGRESS.md) §14；E38 的見 [KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md) §14（包括 1.32 的 `get pv|pvc` 是否印 VOLUMEATTRIBUTESCLASS）；E39 的見 [KUB0_E39_HELM](KUB0_E39_HELM.md) §16（包括 Helm v3.16.4 的 GitCommit 與 Go template 錯誤的欄位）。
- §8 的版本號（包括 kubeadm 叢集裡 etcd、CoreDNS 的版本搭配）。
- KUB12 以 `monitoring-dashboard` 加上終端機是否足以呈現 Allocated resources 與 `kubectl top`（E40 之後再確認）。
