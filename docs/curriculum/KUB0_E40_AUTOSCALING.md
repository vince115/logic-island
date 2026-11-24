# KUB-3 引擎階段 E40：`autoscaling` profile（`kube-metrics*.ts`、`kube-hpa*.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）的最後一個終端機階段：在 E39 的叢集（[KUB0_E39_HELM](KUB0_E39_HELM.md)）上加上課程宣告的 metrics-server v0.7.2 與 `kubectl top`、課程宣告的負載（沿用 D3 的 `generateSeries`）、HorizontalPodAutoscaler `autoscaling/v2` 與它的控制器、`kubectl autoscale`，以及檢查 `kube-hpa`。requests／limits、QoS、依 requests 排程（`Insufficient cpu` 的 Pending）、`describe node` 的 Allocated resources 與在 limit 被 OOMKilled 已在 E32 建好，E40 以測試確認並在本文件說明。E1–E39 的行為與所有已發布的課逐字不變（改動前後把每一堂終端機課的範例、參考解答、典型錯誤、變體與檢查結果全部重播、輸出相同）；`helm` 以下的 profile 沒有任何新行為。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `AUTOSCALING_PROFILE`（RANK 40） | `helm` 的一切加上 feature `autoscaling`，**沒有新指令**。課程機器寫 `profile: 'autoscaling'` |
| profile 以下 | `kubectl top`、`kubectl autoscale`：`（模擬環境：kubectl top 要到引擎階段 E40 才模擬）`；HPA 的 manifest：`（模擬環境：HorizontalPodAutoscaler 要到引擎階段 E40 才模擬）`；`kubectl get hpa`：`（模擬環境：hpa 要到引擎階段 E40 才模擬）`；課程資料 `kube.metricsServer`、`kube.load`：`kube: metricsServer needs the autoscaling profile (engine stage E40)`；檢查 `kube-hpa`：`a kube-hpa check needs an autoscaling machine (engine stage E40)` |
| 開關 | `KubeState.autoscale`（`buildKube` 在 autoscaling profile 設定）：metrics-server 是否安裝、解析後的負載、HPA 控制器的記憶（建議值、擴縮事件、最後一次同步） |

程式的分工（每個新檔案都不到 120 行）：`kube-metrics.ts`（用量模型、刮取時間、DecimalSI）、`kube-metrics-lesson.ts`（課程資料、安裝 metrics-server）、`kube-hpa-spec.ts`（預設值、驗證、只在課文的指標）、`kube-hpa-calc.ts`（ReplicaCalculator）、`kube-hpa-rate.ts`（穩定視窗與擴縮策略）、`kube-hpa.ts`（控制器）、`kube-hpa-print.ts`（`get hpa`、`describe hpa`）、`kube-hpa-checks.ts`、`kubectl-top.ts`、`kubectl-autoscale.ts`。既有檔案只多了 autoscaling 才走到的分支：`shell.ts`（profile）、`lesson.ts`（RANK、檢查種類）、`server-lesson.ts`、`kube-model.ts`（`autoscale`）、`kube-lesson.ts`（資料、安裝）、`kube-manifest.ts`（HPA 的嚴格解碼，可選參數 `autoscaling`）、`kube-write.ts`（建立與更新 HPA）、`kube-api.ts`（`NAMESPACED`）、`kube-output.ts`（`horizontalpodautoscaler.autoscaling`）、`kube-controllers.ts`（HPA 的同步時間）、`kube-image.ts`（`mainRuntime`）、`kube-print.ts`、`kubectl-get.ts`（類型、`get all`、describe）、`kubectl.ts`（旗標、動詞、`api-resources` 的 Metrics API）、`lessons.ts`（`KUBE_STAGES_BUILT` 加上 `E40`）。

## 2. requests、limits 與 QoS（E32 已建，E40 確認）

- **QoS class**（`kube-api.ts` 的 `qosOf`）：每個容器的 cpu 與 memory 都有 limits、requests 沒寫或等於 limits → Guaranteed；沒有任何 requests／limits → BestEffort；其他 Burstable。`describe pod` 的 `QoS Class:`、`status.qosClass`。
- **排程**：NodeResourcesFit 以 requests（只寫 limits 時以 limits 代替）加總，不夠時 `FailedScheduling` 的全文（`0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 Insufficient cpu. preemption: …`），Pod 留在 Pending；之後有 Pod 被刪掉時重試（E32 §5）。
- **Allocated resources**：`describe node` 的 Non-terminated Pods 與 Requests／Limits 的總和與百分比（無條件捨去），E40 的 metrics-server Pod 也算在它的節點上。
- **OOMKilled**：容器的程式（E24 `memory`：start＋growth × 秒數）到達 `resources.limits.memory` 的那一秒被殺：Last State `Terminated`、Reason `OOMKilled`、Exit Code 137，依 restartPolicy 重啟並 CrashLoopBackOff（E32 §6）。
- **CPU 節流**：只在課文說明 CFS quota；模擬裡 `kubectl top` 的 CPU 不會超過容器的 `limits.cpu`（§3）。

## 3. metrics-server 與 `kubectl top`（`kube-metrics.ts`、`kubectl-top.ts`）

**刮取**：metrics-server 每 15 秒刮取一次，對齊時鐘 15 的倍數；時間 t 讀到的是最後一次刮取 S = ⌊t ÷ 15⌋ × 15 的數字。一個 Pod 的每個容器都已執行到 S − 15 以前（看過兩次刮取）才有指標。

**容器的用量**（教學模型，確定性）：

- CPU = 基本用量（程式的 E24 `cpu`，一顆 CPU 的百分比 × 10 millicores；沒有宣告時服務是 1m、shell 是 0m）＋ Pod 的**第一個容器**承擔課程負載：每一筆 `kube.load` 的 `cpuPerRequest` × 那一分鐘每秒的請求數 × 這個 Pod 的份額；份額是 1 ÷ Service 就緒的端點數（E35 的 `endpointsOf`），或 1 ÷ Deployment 就緒且沒在刪除的 Pod 數；不在其中的 Pod 份額 0。最後不超過 `limits.cpu`（節流）。
- 記憶體 = 程式的 E24 `memory` 在 S 的值（沒有宣告時服務 8Mi、shell 512Ki）＋ `memoryPerRequest` × 同樣的請求數。
- kube-system 的 Pod 是固定數字（etcd 25m／45Mi、kube-apiserver 50m／260Mi、controller-manager 15m／55Mi、scheduler 4m／22Mi、CoreDNS 2m／14Mi、kube-proxy 1m／18Mi、metrics-server 4m／20Mi、ingress-nginx 的 controller 3m／90Mi）；節點另加自己的用量（控制平面 60m／700Mi、工作節點 30m／400Mi）。

**指令**：沒有 metrics-server 時 `error: Metrics API not available`。

| 指令 | 輸出 |
|---|---|
| `kubectl top node [NAME] [-l] [--sort-by=cpu\|memory] [--no-headers]` | `NAME CPU(cores) CPU% MEMORY(bytes) MEMORY%`：millicores 加 `m`、整數 Mi、對 allocatable 的百分比（無條件捨去）；依名稱排序；`Error from server (NotFound): nodemetrics.metrics.k8s.io "x" not found` |
| `kubectl top pod [NAME] [-n\|-A] [-l] [--containers] [--sort-by] [--no-headers]` | `NAME CPU(cores) MEMORY(bytes)`；`-A` 前面加 `NAMESPACE`；`--containers` 是 `POD NAME CPU(cores) MEMORY(bytes)`；只列出有指標的 Pod。命名的 Pod 還沒有指標：`error: Metrics not available for pod default/web, age: 12s`；有 Pod 但都沒有指標：`error: metrics not available yet`；沒有 Pod：`No resources found in default namespace.`；`Error from server (NotFound): pods "x" not found` |
| `kubectl top` | 說明文字（node、pod 兩個子指令） |
| `kubectl api-resources` | 有 metrics-server 時多列 `nodes`、`pods`（`metrics.k8s.io/v1beta1`，NodeMetrics、PodMetrics） |

`--no-headers` 時欄寬只由資料列決定（同 tabwriter）。`--sort-by` 只接受 cpu、memory（`error: --sort-by accepts only cpu or memory`），由大到小。

## 4. HorizontalPodAutoscaler 物件（`kube-hpa-spec.ts`、`kube-manifest.ts`、`kube-write.ts`）

- **API**：`autoscaling/v2`，命名空間物件，`horizontalpodautoscaler.autoscaling/web created`；`kubectl get hpa`／`horizontalpodautoscalers.autoscaling`。manifest 寫 `autoscaling/v1` 是模擬環境的說明（`kubectl autoscale` 產生的 v1 物件則被存成 v2，§6）。
- **嚴格解碼**：`scaleTargetRef`（apiVersion、kind、name）、`minReplicas`、`maxReplicas`、`metrics`（type、resource 的 name 與 target 的 type、averageUtilization、averageValue）、`behavior`（scaleUp、scaleDown 的 stabilizationWindowSeconds、selectPolicy、policies）；未知欄位照 E32 的 `strict decoding error`。
- **預設值**（SetDefaults_HorizontalPodAutoscaler）：`minReplicas: 1`；沒有 metrics 時是 cpu 的 Utilization 80%；**有** `behavior` 時，每個方向缺的欄位由預設補上（scaleUp：stabilizationWindowSeconds 0、selectPolicy Max、policies Pods 4／15s 與 Percent 100／15s；scaleDown：selectPolicy Max、policies Percent 100／15s，沒有 stabilizationWindowSeconds — 控制器用 300 秒）；沒有 behavior 就維持沒有（`-o yaml` 看不到）。新物件 generation 1、spec 改變時加一、status 一開始是 `currentMetrics: null`、`desiredReplicas: 0`（建立時就同步一次，所以看不到這個狀態）。
- **驗證**（一個是一句，多個是 `* ` 清單）：`spec.scaleTargetRef.kind: Required value`、`spec.minReplicas: Invalid value: 0: must be greater than or equal to 1`、`spec.maxReplicas: Invalid value: 0: must be greater than 0`、``spec.maxReplicas: Invalid value: 3: must be greater than or equal to `minReplicas` ``、`spec.metrics[0].type: Required value: must specify a metric source type`、`….resource.target.type: Invalid value: "Value": must be either Utilization or AverageValue`、`….averageUtilization: Invalid value: 0: must be greater than 0`、`….averageValue: Invalid value: "0": must be positive`、`spec.behavior.scaleUp.stabilizationWindowSeconds`（0–3600）、`selectPolicy: Unsupported value: "Fast": supported values: "Disabled", "Max", "Min"`、`policies: Required value: must specify at least one Policy`、`policies[0].type`（Pods、Percent）、`value`（> 0）、`periodSeconds`（1–1800）。
- **只在課文**：Pods、Object、External、ContainerResource 指標與 cpu、memory 以外的資源（`（模擬環境：spec.metrics[0] 的 Pods 指標只在課文說明；…）`）。上限 10 個 HPA。

## 5. HPA 控制器（`kube-hpa.ts`、`kube-hpa-calc.ts`、`kube-hpa-rate.ts`）

**何時同步**：建立的那一秒，之後每 15 秒（`--horizontal-pod-autoscaler-sync-period`），是 E34 的控制器時間（`controllerTimes`）；同一秒先同步 HPA、再跑 Deployment 與 ReplicaSet 控制器，所以新的副本數在同一秒開始建立 Pod。HPA 存在時叢集一直有下一步，`kubectl wait`、`rollout status` 照舊用 `waitStep` 一步一步前進；一小時的同步（240 次）在本機約 30 毫秒。

**每次同步**（reconcileAutoscaler）：

1. 讀目標的 scale（Deployment、ReplicaSet、StatefulSet 的 `spec.replicas`）。找不到：Warning `FailedGetScale`（`deployments.apps "web" not found`），AbleToScale False。找到：AbleToScale True `SucceededGetScale`；第一次同步把目前的副本數記成第一個建議值（recordInitialRecommendation）。
2. 目前副本數 0 而 minReplicas 不是 0：ScalingActive False `ScalingDisabled`。超過 max 或少於 min：直接改成 max／min（`Current number of replicas above Spec.MaxReplicas`）。
3. 否則每個指標算一個提案（ReplicaCalculator）：
   - 目標的選擇器選到的 Pod 分組：刪除中或 Failed 忽略；Pending 是 unready；沒有指標是 missing；cpu 指標時 Ready 條件不是 True 也是 unready（真實的控制器看 5 分鐘的初始化期間與指標時間戳，見 §10）。
   - 使用率 = ⌊Σ 用量 × 100 ÷ Σ requests⌋（就緒且有指標的 Pod；requests 以 milli 計，limits 代替沒寫的 requests），比例 = 使用率 ÷ 目標；AverageValue 是 ⌊Σ 用量 ÷ Pod 數⌋ ÷ 目標。
   - 沒有 missing、也沒有「unready 而且要擴張」時：|1 − 比例| ≤ 0.1 維持目前副本數，否則 ⌈比例 × 就緒 Pod 數⌉（浮點數同 Go，所以 55% 對 50% 的 1.1 也算超出）。
   - 有 missing：縮減時當作用了 max(100%, 目標) 的 requests，擴張時當作 0；擴張而有 unready 時 unready 當作 0；重算比例，落在容忍內或方向相反就維持，否則 ⌈新比例 × Pod 數⌉，但不會因此反方向改變。
   - 錯誤：沒有 metrics-server（`unable to fetch metrics from resource metrics API: the server could not find the requested resource (get pods.metrics.k8s.io)`）、沒有任何指標（`no metrics returned from resource metrics API`）、都 unready（`did not receive metrics for targeted pods (pods might be unready)`）、缺 requests（`missing request for cpu in container web of Pod web-…`），都包成 `failed to get cpu utilization: …`，事件 Warning `FailedGetResourceMetric` 與 `FailedComputeMetricsReplicas`（`invalid metrics (1 invalid out of 1), first error is: failed to get cpu resource metric value: …`），ScalingActive False，status 只更新 currentReplicas 與 currentMetrics（`type: ""`，TARGETS 是 `<unknown>`）。成功：ScalingActive True `ValidMetricFound`。
4. 取所有提案的最大值，再正規化：
   - **沒有 behavior**：過去 300 秒（含本次）的建議值取最大（向下穩定），再限制在 max(2 × 目前, 4) 與 min..max；AbleToScale 是 `ScaleDownStabilized` 或 `ReadyForNewScale`，ScalingLimited 是 `ScaleUpLimit`、`TooManyReplicas`、`TooFewReplicas`（True）或 `DesiredWithinRange`（False）。
   - **有 behavior**：建議值夾在 scaleUp 視窗內的最小與 scaleDown 視窗內的最大之間（視窗嚴格在之後），再依方向的策略：每個 policy 以「目前 − 該期間內擴張的 + 縮減的」為起點，Pods 加減 value、Percent 乘 (1 ± value%)（擴張無條件進位、縮減捨去），selectPolicy Max／Min 取其一、Disabled 不動，最後 min..max（`ScaleUpLimit`、`ScaleDownLimit`、`TooManyReplicas`、`TooFewReplicas`、`ScaleUpStabilized`）。擴縮事件保留 1800 秒。
5. 副本數改變：寫目標的 `spec.replicas`（generation 加一）、AbleToScale `SucceededRescale`、Normal `SuccessfulRescale` `New size: 4; reason: cpu resource utilization (percentage of request) above target`（縮減：`All metrics below target`；AverageValue：`cpu resource above target`）、status 的 lastScaleTime。原因依正規化**之前**的提案寫，所以穩定視窗把副本數拉高時原因是空的（`New size: 8; reason: `），同真實的程式碼。
6. status：conditions（AbleToScale、ScalingActive、ScalingLimited，狀態改變時才換 lastTransitionTime）、currentMetrics、currentReplicas、desiredReplicas、lastScaleTime、observedGeneration。

**預設值的效果**：擴張每 15 秒最多到 max(2 × 目前, 4)（有 behavior 的預設是 max(目前 + 4, 2 × 目前)），縮減要等最後一個較高的建議值滿 300 秒。來來去去的負載在預設下維持在高點；`behavior.scaleDown.stabilizationWindowSeconds: 0` 時每分鐘上下擺盪（flapping）——課程可以並排比較。

## 6. 指令（`kubectl-autoscale.ts`、`kube-hpa-print.ts`）

| 指令 | 輸出 |
|---|---|
| `kubectl autoscale (TYPE NAME \| TYPE/NAME) --max=N [--min=N] [--cpu-percent=N] [--name=…]` | `horizontalpodautoscaler.autoscaling/web autoscaled`。kubectl v1.32 送出 autoscaling/v1 的物件（`targetCPUUtilizationPercentage`），API server 存成 v2：cpu 的 Utilization 指標，沒有 `--cpu-percent` 是預設的 80%，沒有 `--min` 是 1；`--dry-run=client -o yaml\|json` 印出 v1 的物件（`creationTimestamp: null`、`status: {currentReplicas: 0, desiredReplicas: 0}`）。錯誤：`error: --max=MAXPODS is required and must be at least 1, max: -1`、`error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: 3, min: 5`、`error: invalid argument "x" for "--max" flag: strconv.ParseInt: parsing "x": invalid syntax`、`error: cannot autoscale a Pod: cannot autoscale a Pod`、`Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "web" already exists`、`--min=0` 是 API server 的驗證錯誤 |
| `kubectl get hpa` | `NAME REFERENCE TARGETS MINPODS MAXPODS REPLICAS AGE`；TARGETS 依 v1.30 之後的 formatHPAMetrics：`cpu: 45%/50%`、`memory: 60817408/40Mi`、`cpu: <unknown>/50%`，最多兩個，之後 `+ N more...`；REPLICAS 是 status.currentReplicas。`get all` 在 StatefulSet 之後列出 HPA |
| `kubectl describe hpa` | describeHorizontalPodAutoscalerV2：Name、Namespace、Labels、Annotations、CreationTimestamp、Reference、`Metrics: ( current / target )` 與每個指標（`resource cpu on pods  (as a percentage of request):  45% (45m) / 50%`、`resource memory on pods:  60817408 / 40Mi`）、Min／Max replicas、有 behavior 時的 `Behavior:`（`Scale Up:`、`Stabilization Window: 0 seconds`、`Select Policy: Max`、`Policies:`、`- Type=Pods  Value=4  Period=15 seconds`）、`Deployment pods:  3 current / 3 desired`、Conditions 表、Events（來源 `horizontal-pod-autoscaler`）。整個區塊經同一個 tabwriter，所以欄寬隨最長的指標行（同 kubectl） |
| `kubectl delete hpa web`、`kubectl events --for hpa/web` | 一般的刪除與事件；刪掉 HPA 後副本數停在最後的值 |

## 7. 課程資料（`kube-metrics-lesson.ts`）

```ts
kube: {
  …E32–E39 的欄位,
  metricsServer?: true,          // 叢集建立時安裝 metrics-server v0.7.2（kube-system 的 Deployment，一個 Pod 在第一個工作節點，requests 100m／200Mi）
  load?: [{
    service: 'web',               // 或 deployment: 'web'（二選一）；namespace?: 'default'
    start?: '2026-11-24 10:00:00', // 第 0 分鐘的開始（預設 now；介於 created 與 now 之後一天）
    minutes: 60,                  // 1–360
    rps: [100, 120, …] | { seed: 7, baseline: 100, noise: 10, changes: [{ kind: 'ramp', from: 5, to: 20, delta: 400 }] },  // 每分鐘每秒的請求數，D3 的 values 或 shape
    cpuPerRequest: '1m',          // 每秒一個請求的 CPU（100 req/s × 1m = 100m）
    memoryPerRequest?: '1Mi',
  }],
}
```

- 最多 6 筆負載；`start` 之前與最後一分鐘之後是 0；同一個 Pod 可以分到多筆負載。
- 驗證：`kube: load[0]: names a service or a deployment (one of them)`、`kube: load[0]: minutes is 1..360`、`kube: load[0]: rps has 1 values for 2 minutes`（以及 D3 的 shape 問題）、`kube: load[0]: cpuPerRequest is a cpu quantity such as 2m`、`kube: load[0]: memoryPerRequest is a memory quantity such as 1Mi`、`kube: load[0]: start is a UTC time between created and a day after now`、`kube: metricsServer is true or false`。
- Service 或 Deployment 不存在時負載沒有去處（每個 Pod 份額 0）；它們之後才建立也可以。
- 開機的 manifest 可以有 HPA（`autoscaling/v2`），從它的時間開始同步。

## 8. 節點自動擴展（決定：只在課文）

Cluster Autoscaler、Karpenter 與節點池**不模擬**（PLAN §5 的產品決定，預設採用課文）：叢集滿了時新 Pod 是 Pending（`Insufficient cpu`），HPA 把 Pending 的 Pod 當作 unready，仍然往 maxReplicas 擴張；課文說明這時 Cluster Autoscaler 會看到 Pending 的 Pod 而加節點、Karpenter 依 Pod 的 requests 選機型，以及縮減節點的條件。課程可以用 `kube.nodes` 宣告較小或較大的節點，或讓學習者 `kubectl scale`／刪除其他工作負載來釋出資源（E32 的重試），作為「加節點」的替代演練。

## 9. 檢查 `kube-hpa`（`kube-hpa-checks.ts`）

| 欄位 | 意義 |
|---|---|
| `name`、`namespace?`（預設 default）、`absent?` | HPA 存在或不存在 |
| `target?` | `Deployment/web`（ReplicaSet、StatefulSet 亦可） |
| `minReplicas?`、`maxReplicas?` | spec（minReplicas 沒寫是 1） |
| `metric?` | `{ resource: 'cpu' \| 'memory', utilization?: 50 }` 或 `{ …, averageValue: '200m' }`（以數量比較） |
| `currentReplicas?`、`desiredReplicas?` | status |
| `condition?` | `{ type: AbleToScale \| ScalingActive \| ScalingLimited, status, reason? }` |
| `scaledAtLeast?`、`scaledAtMost?` | 整段執行中控制器改過的副本數：最高至少 N；最高不超過 N（沒有改過時兩者都不通過） |

說明例：`default 命名空間應該有名為 web 的 HorizontalPodAutoscaler（目標 Deployment/web、minReplicas 2、maxReplicas 10、cpu 的目標使用率 50%、目前 7 個副本、期望 7 個副本、條件 ScalingActive=True（ValidMetricFound）、曾經擴展到至少 7 個副本、擴展時不曾超過 8 個副本）`；訊息例：`它目前有 2 個副本`、`它的 cpu 目標使用率是 80%`、`它最多只擴展到 7 個副本`、`它曾經擴展到 7 個副本`、`它沒有改變過副本數`。檢查在 settle 之後讀，不移動時鐘；被擴展的 Deployment 與 Pod 照舊用 `kube-workload`、`kube-pod`。

## 10. 偏差（刻意的模型）

- **用量**是 §3 的教學模型：沒有 cAdvisor 的取樣、CPU 速率的平均窗、GC 與快取記憶體；每個 Pod 的份額是平均分配（kube-proxy 的輪替見 E35）；負載只加在第一個容器；`memoryPerRequest` 不會造成 OOMKilled（只有程式的 E24 記憶體模型會）。
- **指標的時間**：兩次刮取的規則取代 metrics-server 的實際延遲；HPA 不看指標的時間戳與 window，cpu 的 unready 判斷簡化成「Ready 條件不是 True」（真實：啟動 5 分鐘內未就緒或指標早於就緒轉換、之後只有從未就緒過的才算），`--horizontal-pod-autoscaler-initial-readiness-delay` 不模擬。
- **控制器**：同步對齊 HPA 建立時間的 15 秒倍數（真實有工作佇列的延遲）；部分指標失敗時的行為照程式碼（全部失敗或要縮減時不動），但沒有 `--horizontal-pod-autoscaler-cpu-initialization-period` 等旗標；`spec.behavior` 的 `tolerance`（v1.33 alpha）不在 v1.32 的欄位裡；scale 子資源以直接改 `spec.replicas` 代替。
- **物件**：manifest 只有 v2；`kubectl autoscale` 寫的 v1 直接存成 v2（沒有 v1 的 `autoscaling.alpha.kubernetes.io/…` 註解）；`kubectl get hpa -o yaml` 只有 v2；`status.currentMetrics` 失敗時是 `type: ""` 的項目。
- **metrics-server 本身**：沒有它的 Service、APIService 與 ServiceAccount 物件；刪掉它的 Pod 會像其他 kube-system 的 Pod 一樣立刻回來，Metrics API 不中斷。
- **節點自動擴展**、VPA、KEDA、自訂與外部指標（Prometheus Adapter）只在課文（§8）。

## 11. 課程作者要知道的事

- 機器寫 `profile: 'autoscaling'` 與 `metricsServer: true`；負載用 `kube.load` 宣告在 Service（建議，份額跟著就緒的端點）或 Deployment 上，`cpuPerRequest` 與 requests 決定使用率：例如 requests 100m、`cpuPerRequest: '1m'`、兩個 Pod 時 100 req/s 是 51%（含 1m 的基本用量）。先算好目標使用率附近的數字，避免剛好落在 0.1 的容忍邊界。
- 時間要前進才會擴縮：解答寫 `sleep 60`（或 `kubectl wait`）；檢查不移動時鐘。擴張每 15 秒一步（2→4→8…），縮減在預設下要等 300 秒，練習若要看縮減，用 `behavior.scaleDown.stabilizationWindowSeconds` 或寫 `sleep 330`。
- 新 Pod 要過兩次刮取（最多 30 秒）才有指標；`kubectl top pod 新的` 會先說 `Metrics not available`，課文可以拿來說明。
- 一個 Pod 沒有 cpu requests 時 HPA 整個停擺（`missing request for cpu`），是常見的考題；`kubectl describe hpa` 的 Events 與 Conditions 會說原因。
- 再次 `kubectl apply` 寫了 `replicas:` 的 Deployment 會覆蓋 HPA 的副本數（下一次同步再改回來）——課文可以提醒「交給 HPA 的 Deployment 不要寫 replicas」。
- 叢集容量：預設三個節點各 2 CPU（cp-01 有 taint），metrics-server 在 node-01 佔 100m；要示範 Pending 就把 requests 設大或 `kube.nodes` 設小。
- `kubectl get hpa` 的 TARGETS 是 `cpu: 45%/50%`（v1.30 之後的寫法），課文的截圖或說明請用這個格式。

## 12. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e40.test.ts` | profile 與分界（以下的 top、autoscale、HPA、資料與檢查）、負載資料的驗證、kube-system 的 metrics-server 與 Metrics API；QoS 三種、requests 的加總與 Pending（Insufficient cpu）、在 limit 的 OOMKilled（137、重啟）；沒有 metrics-server、`top node`／`top pod`（`-A`、`--containers`、`--sort-by`、`--no-headers`、命名、NotFound）、兩次刮取、負載變成 CPU 與記憶體（15 秒的刮取、份額、CPU limit）、Deployment 的負載與 D3 shape |
| `tests/terminal-e40-hpa.test.ts` | 容忍與 ⌈Pod 數 × 比例⌉、max(2 × 目前, 4) 的擴張限制與 maxReplicas、300 秒的縮減穩定、有無 behavior 的擺盪、behavior 的策略（每分鐘一個 Pod、縮減 Disabled）、min..max 的修正、滿載叢集的 Pending、缺 requests／沒有 metrics-server／目標不存在、cpu 與 memory 的 AverageValue |
| `tests/terminal-e40-scale.test.ts` | `kubectl autoscale`（v1 的 dry-run、v2 的預設、錯誤）、HPA manifest 的嚴格解碼與驗證、只在課文的指標與 v1、`get all` 與刪除；檢查 `kube-hpa`（說明、訊息、檢查的檢查）與 `kube-workload`、`kube-pod`；一小時的負載與同步（確定、3 秒以內，本機約 30 毫秒） |
| `tests/support/autoscale-fixture.ts` | 只供測試：kub-40（autoscaling profile、metrics-server、開機的 Deployment web 與 Service web、team/busy:1.0）、`withLoad`、`hpa()`、`web()` |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `autoscaling`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', …, 'E40']`，KUB10（與需要 D3、D4、E40 的 KUB12）可以建立。

## 13. 沒有把握的地方（依記得的格式寫，並在此註明）

- **`kubectl get hpa` 的 TARGETS**：v1.32 是否已是 `cpu: 45%/50%`（加上資源名稱的寫法）、`<unknown>` 與 `+ N more...` 的寫法。
- **`kubectl top`**：v1.32 的標題是 `CPU%`／`MEMORY%` 還是 `CPU(%)`／`MEMORY(%)`、是否多了 swap 欄；`Metrics not available for pod default/web, age: 12s`（真實的 age 是 Go 的 Duration，帶小數）；`error: metrics not available yet`；`nodemetrics.metrics.k8s.io "x" not found`；`top pod NAME` 找不到時是 `pods` 或 `podmetrics.metrics.k8s.io`；tabwriter 的欄寬（同 get 的設定）。
- **`kubectl autoscale`**：v1.32 送出 v1 或 v2 的物件（dry-run 的輸出）、不能擴縮的種類的錯誤句、沒有參數時的整段說明。
- **describe hpa**：欄位順序、`(as a percentage of request)` 前面的兩個空白、Behavior 的縮排與 `Period=15 seconds`、Conditions 每格後是否有空白、`Deployment pods:` 的寫法。
- **控制器的文字**：`SuccessfulRescale` 的 `New size: N; reason: …`、穩定視窗拉高時的空原因、`FailedGetScale` 的訊息（`deployments.apps "x" not found` 或 `deployments/scale.apps`）、`FailedGetResourceMetric` 與 `FailedComputeMetricsReplicas` 的包裝層次、`missing request for cpu in container x of Pod y`、各 condition 的 reason 與 message、`currentMetrics` 失敗時的 `type: ""`、新 HPA 的初始 status。
- **預設與驗證**：behavior 的 API 預設（scaleDown 沒有 stabilizationWindowSeconds）、驗證訊息的整句（特別是 averageValue、selectPolicy、policies 的 type）。
- **數字**：metrics-server v0.7.2 的 requests（100m／200Mi）與參數、kube-system 元件與節點的用量、兩次刮取才有指標的延遲。
- 版本見 [KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §8。
