# KUB-1 引擎階段 E34：`workloads` profile（`kube-workload-spec.ts`、`kube-replicaset.ts`、`kube-deployment.ts`、`kube-controllers.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E33 的叢集（[KUB0_E33_PROBES](KUB0_E33_PROBES.md)）上加上 apps/v1 的 ReplicaSet 與 Deployment 控制器、滾動更新與 Recreate、`kubectl rollout`、`create deployment`、`scale`、`set image`，以及節點的 `cordon`、`uncordon`、`drain` 與課程宣告的節點故障。E1–E33 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`cluster` 與 `probes` profile 的輸出不變（例外見 §12 的修正），Deployment、`rs`、`rollout`、`scale`、`set`、`cordon`、`drain`、`create deployment`、`get all` 在它們之下仍是「要到引擎階段 E34 才模擬」，新的旗標仍是 `unknown flag`。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `WORKLOADS_PROFILE`（RANK 34） | `probes` 的一切加上 feature `workloads`，**沒有新指令**。課程機器寫 `profile: 'workloads'` |
| profile 以下 | `（模擬環境：Deployment 要到引擎階段 E34 才模擬）`、`（模擬環境：kubectl rollout 要到引擎階段 E34 才模擬）`（E32 原文）；`--replicas`、`--to-revision`、`--revision`、`--cascade`、`--ignore-daemonsets`、`--delete-emptydir-data` 是 `error: unknown flag`；課程資料的 `kube.failures`：`kube: failures needs the workloads profile (engine stage E34)`；檢查 `kube-workload`／`kube-rollout`：`needs a workloads machine (engine stage E34)` |
| 開關 | `KubeState.workloads`（`buildKube` 在 workloads profile 設定）。kubectl、settle、排程器、describe 都以它判斷，所以 `probes` 的叢集完全走 E33 的路徑 |

程式的分工（每個檔案都不到 210 行）：`kube-workload-spec.ts`（預設值、驗證、選擇器、pod-template-hash、fenceposts）、`kube-replicaset.ts`（ReplicaSet 控制器、刪除的排序、垃圾回收）、`kube-deployment.ts`（Deployment 控制器、status 與 conditions、rollout status 的文字、歷史）、`kube-controllers.ts`（控制器何時執行、節點生命週期、kube-system 的 ReplicaSet）、`kube-describe-workload.ts`、`kube-workload-checks.ts`；指令在 `kubectl-workload.ts`、`kubectl-rollout.ts`、`kubectl-node.ts`。既有檔案只多了 workloads 才走到的分支：`kube-model.ts`（`KubeState.workloads`／`failures`／`ctrl`／`dirty`／`down`、`KubeNode.unschedulable`、`KUBE_LIMITS.deployments`）、`kube-manifest.ts`（apps/v1 的嚴格解碼 schema、`served`）、`kube-api.ts`（`defaultContainer` 抽出）、`kube-write.ts`、`kube-settle.ts`、`kube-sched.ts`（NodeUnschedulable）、`kube-print.ts`、`kube-describe.ts`（Controlled By）、`kube-lesson.ts`、`kube-select.ts`（匯出 `Req`）、`kubectl.ts`、`kubectl-apply.ts`、`kubectl-get.ts`、`kubectl-meta.ts`、`kubectl-pod.ts`、`server-lesson.ts`、`lesson.ts`、`shell.ts`。

## 2. Deployment 與 ReplicaSet 物件（`kube-workload-spec.ts`、`kube-manifest.ts`、`kube-write.ts`）

- **嚴格解碼**：`DeploymentSpec`（`replicas`、`selector`、`template`、`strategy`、`minReadySeconds`、`revisionHistoryLimit`、`paused`、`progressDeadlineSeconds`）、`ReplicaSetSpec`、`LabelSelector`（`matchLabels`、`matchExpressions`）、`DeploymentStrategy`、`RollingUpdateDeployment`（`maxSurge`、`maxUnavailable` 是 `intstr`）、`PodTemplateSpec`（E33 的 Pod schema）。例：`Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "spec.template.spec.containers[0].imagee"`、`json: cannot unmarshal string into Go struct field DeploymentSpec.spec.replicas of type int32`。
- **預設值**：`replicas: 1`；Deployment 另有 `progressDeadlineSeconds: 600`、`revisionHistoryLimit: 10`、`strategy: {type: RollingUpdate, rollingUpdate: {maxSurge: 25%, maxUnavailable: 25%}}`（`rollingUpdate: null` 視為沒有）；範本的容器預設值同 Pod（`imagePullPolicy`、`resources: {}`、`terminationMessagePath`…、探針），pod spec 的 `dnsPolicy`、`restartPolicy: Always`、`schedulerName`、`securityContext: {}`、`terminationGracePeriodSeconds: 30`，範本 metadata 的 `creationTimestamp: null`；範本**沒有** Pod 的 admission 預設（服務帳號 Volume、toleration），那些在建立 Pod 時才加。`metadata.generation` 建立時 1，spec 改變（apply、scale、set image、pause、resume、restart、undo）加一。
- **驗證**（接在名稱錯誤之後）：`spec.replicas: Invalid value: -1: must be greater than or equal to 0`；沒有選擇器是 `spec.selector: Required value` 加上 `spec.template.metadata.labels: Invalid value: map[string]string{"app":"web"}: \`selector\` does not match template \`labels\``；空的選擇器 `empty selector is invalid for deployment`；`matchExpressions` 的 operator 與 values；範本的 pod spec 錯誤（路徑是 `spec.template.spec.…`）；`restartPolicy` 只能是 Always；策略的 type、Recreate 不能有 `rollingUpdate`、int-or-percent 的格式、百分比不超過 100%、兩者都 0 是 `may not be 0 when \`maxSurge\` is 0`；`minReadySeconds`、`revisionHistoryLimit` 不可為負，`progressDeadlineSeconds` 要大於 `minReadySeconds`。
- **選擇器不可變**（apply 更新時）：`The Deployment "web" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:map[string]string{"app":"web2"}, MatchExpressions:[]v1.LabelSelectorRequirement(nil)}: field is immutable`。apply 是 client-side 三方合併（E32），所以把策略改成 Recreate 而沒有寫 `rollingUpdate: null` 會得到真實的 Forbidden（真實的陷阱，照做）。
- 輸出名稱：`deployment.apps/web created`、`deployments.apps "web" already exists`。上限：20 個 Deployment（kube-system 以外）。
- **pod-template-hash**：範本（去掉 hash 標籤、鍵排序）的 SHA-256 取 10 個字元，字母表 `bcdfghjklmnpqrstvwxz2456789`（真實的是 FNV-32a，§11）。RS 名稱 `web-<hash>`，Pod 名稱 `web-<hash>-<5 字元>`（同 E32 的 suffix，以物件計數器為種子，重複就換下一個）。
- **選擇器文字**：kubectl 的格式，依鍵排序：`app=web,pod-template-hash=…`、`tier in (a,b)`、`!x`。`get deploy|rs|ds -o wide` 的 SELECTOR 改用它（單一鍵的輸出與 E32 相同）。

## 3. ReplicaSet 控制器與垃圾回收（`kube-replicaset.ts`）

- **claim**：同命名空間、當時已存在的 Pod，標籤符合選擇器且沒有 controller 的就收養（`ownerReferences` 加上 `{apiVersion: apps/v1, blockOwnerDeletion: true, controller: true, kind: ReplicaSet, …}`）；屬於它但標籤不再符合的就釋放（移除那一筆 ownerReference）。被刪除中的 Pod 不收養。Deployment 的 RS 選擇器含 `pod-template-hash`，所以只有 `app=web` 的 Pod 不會被它收養（真實如此）；自己建立的 ReplicaSet 會收養。
- **調整數量**：活躍的 Pod（沒有刪除中、不是 Succeeded／Failed）少於 `spec.replicas` 就建立（`Normal SuccessfulCreate`「Created pod: web-…」，replicaset-controller），多就刪除（`SuccessfulDelete`「Deleted pod: …」），刪除走 E33 的優雅終止。叢集滿 60 個 Pod 時記 `Warning FailedCreate`。
- **刪除的順序**（ActivePodsWithRanks 的子集）：沒排到節點的 < 已排到的；Pending < Unknown < Running；沒就緒 < 就緒；重新啟動次數（容器中最大的）多的先；比較新的先；最後依名稱。真實的「同節點上相關 Pod 較多者先」、`pod-deletion-cost`、就緒時間的對數分組不模擬（§11）。
- **status**：`replicas`（活躍的）、`fullyLabeledReplicas`、`readyReplicas`、`availableReplicas`（就緒滿 `minReadySeconds`）、`observedGeneration`；0 的欄位省略（`omitempty`），`replicas` 例外。
- **垃圾回收**：一個物件的 ownerReferences 指向的物件全都不在了，就刪除它（背景串連：RS 立刻刪除，Pod 優雅終止）。`kubectl delete deploy web` 之後 RS 消失、Pod 進入 Terminating；`--cascade=orphan`（或 `false`）先移除依附者指向它的 ownerReference，所以 RS 與 Pod 留下；`foreground` 當成 background（§11）。kube-system 的物件不回收（static pod 的 owner 是 Node）。

## 4. Deployment 控制器（`kube-deployment.ts`）

- **新的 RS**：範本（去掉 hash）等於 Deployment 範本的那一個；沒有就建立（從 0 開始，再由策略擴張，所以事件是 `Scaled up replica set web-xxx from 0 to 3`，deployment-controller）。revision 是舊 RS 最大的加一（`deployment.kubernetes.io/revision`），已經存在的舊範本被選回來時 revision 前進、舊的號碼記到 `revision-history`。Deployment 的註解（`last-applied`、revision 相關除外）每次同步都複製到新的 RS，所以之後才寫的 `kubernetes.io/change-cause` 會成為目前 revision 的 CHANGE-CAUSE，下一次更新也會沿用舊的文字（真實如此）。擴縮時寫 `desired-replicas` 與 `max-replicas`。
- **RollingUpdate**：maxSurge、maxUnavailable 以 `src/lib/devops/rollout.ts` 的 `resolveRolling` 換算（百分比 surge 向上、unavailable 向下取整，兩者都 0 時 unavailable 為 1；replicas 0 時 unavailable 0）。reconcileNewReplicaSet：新 RS 在 `replicas + maxSurge` 之內擴張；reconcileOldReplicaSets：`maxScaledDown = 全部 − (replicas − maxUnavailable) − 新 RS 不可用的`，先縮掉舊 RS 不健康的，再依可用數縮舊 RS（舊的先）。例：4 個、maxSurge 2、maxUnavailable 1，`set image` 的同一秒是新 0→2、舊 4→3、新 2→3。
- **Recreate**：舊 RS 縮到 0，等它們的 Pod 全部結束（包括 Terminating 的）才建立新的 RS 並擴張到 replicas。
- **paused**：不建立新 RS；只有一個活躍 RS（或沒有，取最新的）時把它調到 replicas；新 RS 已飽和時舊的縮到 0。多個活躍 RS 的比例縮放不模擬（§11）。
- **status**：`replicas`、`updatedReplicas`、`readyReplicas`、`availableReplicas`、`unavailableReplicas`（`spec.replicas` 總和減可用）、`observedGeneration`；conditions 依 SetDeploymentCondition（同 status 與 reason 不變；同 status 保留 lastTransitionTime；先移除再附加，所以順序會變）：
  - Available：可用 ≥ replicas − maxUnavailable 時 True `MinimumReplicasAvailable`「Deployment has minimum availability.」，否則 False `MinimumReplicasUnavailable`。
  - Progressing：`NewReplicaSetCreated`「Created new replica set "web-…"」、`FoundNewReplicaSet`、有進展時 `ReplicaSetUpdated`「ReplicaSet "web-…" is progressing.」（只更新 lastUpdateTime）、完成時 `NewReplicaSetAvailable`「… has successfully progressed.」、`lastUpdateTime + progressDeadlineSeconds` 到了而沒完成是 False `ProgressDeadlineExceeded`「… has timed out progressing.」；pause 是 Unknown `DeploymentPaused`，resume 是 Unknown `DeploymentResumed`（期限從 resume 起算）。進展＝updated 增加、舊 Pod 減少、ready 增加或 available 增加。
- **revisionHistoryLimit**：完成後（或 paused 時），舊 RS 超過上限的部分依 revision 由舊到新刪除，只刪空的。

## 5. 控制器何時執行（`kube-controllers.ts`、`kube-settle.ts`）

控制器的一次執行（垃圾回收、所有 RS、所有 Deployment，重複到沒有變化，最多 8 輪）在下列時間發生，與 E32、E33 的步驟一起依時間播放：

| 時機 | 內容 |
|---|---|
| 步驟之後 | 一個 kubelet、排程器或探針步驟改變了控制器看的東西（Pod 的就緒、phase、刪除中、存在），在那個步驟的時間 |
| 指令之後 | 任何改變叢集的 kubectl 指令設定 `dirty`（現在） |
| 開機的 manifest | Deployment、RS、Pod 的 `creationTimestamp`（控制器只看當時已存在的物件） |
| minReadySeconds | 就緒時間 + `minReadySeconds` |
| progressDeadlineSeconds | Progressing 的 lastUpdateTime + 期限 |
| 節點生命週期 | 故障時間 + 50 秒、各 Pod 的驅逐時間 |

同一秒：控制器先於 Pod 的步驟。`kubectl rollout status` 一秒一秒前進並增量 settle（不從頭重播）。

## 6. 指令（`kubectl-workload.ts`、`kubectl-rollout.ts`）

| 指令 | 內容 |
|---|---|
| `create deployment NAME --image=… [--image=…] [--replicas=N] [--port=P] [--dry-run=client -o yaml|json]` | kubectl 產生的物件：`labels: app=NAME`、選擇器、`strategy: {}`、`creationTimestamp: null`、`status: {}`；容器名稱是 Image 名稱最後一段去掉標籤與 digest（`_` 換成 `-`，重複時加後綴）；`--port` 只給第一個容器。已存在：`error: failed to create deployment: deployments.apps "web" already exists` |
| `scale deploy/web --replicas=N`（也可 `rs`） | `deployment.apps/web scaled`；沒有 `--replicas`：`error: required flag(s) "replicas" not set`；其他 kind 指名只模擬 Deployment 與 ReplicaSet。直接縮放 Deployment 的 RS 會被 Deployment 調回（真實如此） |
| `set image deploy/web web=nginx:1.28`（`*=` 全部） | `deployment.apps/web image updated`；沒有變化不印；`error: unable to find container named "x"` |
| `rollout status` | 依 kubectl 的 status viewer：`Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...`、`… 1 old replicas are pending termination...`、`… 2 of 3 updated replicas are available...`、`deployment "web" successfully rolled out`、`error: deployment "web" exceeded its progress deadline`、`Waiting for deployment spec update to be observed...`。時鐘逐秒前進，每個**新的**訊息印一次；`--timeout=` 到了是 `error: timed out waiting for the condition`；沒有 `--timeout` 時最多等 3600 秒（模擬環境的說明）；`--watch=false` 只印一次 |
| `rollout history [--revision=N]` | `deployment.apps/web `（尾端一個空白）、`REVISION  CHANGE-CAUSE` 的表格（tabwriter padding 2）、空行；`--revision` 印 `deployment.apps/web with revision #N` 與那個 RS 的 Pod Template；找不到：`error: unable to find the specified revision` |
| `rollout undo [--to-revision=N]` | 把那個 revision 的範本（去掉 hash）與註解（change-cause）放回 Deployment：`deployment.apps/web rolled back`；那個 RS 成為最新的 revision；已經相同：`skipped rollback (current template already matches revision N)`；`error: unable to find specified revision N in history`、`error: no rollout history found for deployment "web"`；paused 時拒絕 |
| `rollout pause|resume` | `deployment.apps/web paused`／`resumed`；`error: deployments.apps "web" is already paused`／`is not paused` |
| `rollout restart` | 範本加上 `kubectl.kubernetes.io/restartedAt`（RFC 3339，UTC）：`deployment.apps/web restarted`；paused 時拒絕 |
| `get rs`、`get all` | RS：NAME DESIRED CURRENT READY AGE，`-o wide` 加 CONTAINERS IMAGES SELECTOR；`all` 是 pods、services、daemonsets、deployments、replicasets（前綴名稱，空的類型不印） |
| `delete` | `--cascade=background|foreground|orphan`（`true`、`false` 也接受）；其他值：`error: invalid cascade value (x). Must be "background", "foreground", or "orphan".` |
| `wait --for=condition=Available deploy/web` | E32 的 wait 已能讀 Deployment 的 conditions：`deployment.apps/web condition met` |

## 7. describe（`kube-describe-workload.ts`）

- Deployment：Name、Namespace、CreationTimestamp、Labels、Annotations、Selector、`Replicas: 3 desired | 3 updated | 3 total | 3 available | 0 unavailable`、StrategyType、MinReadySeconds、`RollingUpdateStrategy: 25% max unavailable, 25% max surge`（RollingUpdate 才有）、Pod Template、Conditions（`Type`／`Status`／`Reason`，每列 type 後一個空白再 tab）、`OldReplicaSets`（spec.replicas 不為 0 的舊 RS）、`NewReplicaSet: web-… (3/3 replicas created)`、Events。
- ReplicaSet：Name、Namespace、Selector、Labels、Annotations、`Controlled By: Deployment/web`、`Replicas: 3 current / 3 desired`、`Pods Status: 3 Running / 0 Waiting / 0 Succeeded / 0 Failed`、Pod Template、Events。
- Pod Template（DescribePodTemplate）：Labels、Annotations（有才印）、Containers（容器名稱比 Pod 的多一個空白縮排）、Volumes、Node-Selectors、Tolerations。
- Pod（workloads profile）：IPs 之後印 `Controlled By:  ReplicaSet/web-…`（kube-system 的是 `DaemonSet/kube-proxy`、`Node/cp-01`）。
- kube-system：workloads profile 有 `coredns-<hash>` 這個 RS，Deployment coredns 有 revision 與兩個 condition；它們只是顯示，控制器不處理 kube-system。

## 8. 節點（`kubectl-node.ts`、`kube-controllers.ts`、`kube-sched.ts`、`kube-print.ts`）

- **cordon／uncordon**：`spec.unschedulable` 與 taint `node.kubernetes.io/unschedulable:NoSchedule`；`node/node-01 cordoned`、`already cordoned`、`uncordoned`、`already uncordoned`；`get nodes` 的 STATUS `Ready,SchedulingDisabled`；kubelet 的事件 `NodeNotSchedulable`／`NodeSchedulable`「Node node-01 status is now: …」。排程器先跑 NodeUnschedulable：`0/3 nodes are available: 1 node(s) had untolerated taint {…}, 2 node(s) were unschedulable. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.`；uncordon 之後 Pending 的 Pod 立刻重試。
- **drain NODE**：先 cordon，再依 kubectl 的過濾：static（mirror）Pod 略過；DaemonSet 的 Pod 沒有 `--ignore-daemonsets` 是錯誤，有則 `Warning: ignoring DaemonSet-managed Pods: kube-system/kube-proxy-…`；沒有 controller 的 Pod 沒有 `--force` 是錯誤，有則 `Warning: deleting Pods that declare no controller: default/hello`；Succeeded／Failed 的一律刪除。錯誤時：`error: unable to drain node "node-01" due to error: cannot delete cannot delete Pods that declare no controller (use --force to override): default/hello, continuing command...`、`There are pending nodes to be drained:`、` node-01`、`error: …`（多個錯誤是 `[a, b]`），狀態 1，節點維持 cordoned。成功時每個 Pod `evicting pod default/web-…`，以優雅刪除驅逐，等到它們消失（時鐘前進），依消失的時間印 `pod/web-… evicted`，最後 `node/node-01 drained`。`--delete-emptydir-data` 接受（模擬環境沒有 emptyDir），`--grace-period` 用於驅逐。kube-system 的 CoreDNS 被驅逐時照 E32 立刻回來。
- **課程宣告的節點故障**（`kube.failures`）：在 T 時 kubelet 停止（那個節點的容器、探針不再有步驟，狀態凍結）；T + 50 秒（`--node-monitor-grace-period`）節點 NotReady：四個條件都是 Unknown `NodeStatusUnknown`「Kubelet stopped posting node status.」（lastHeartbeatTime 是 T），加上 `node.kubernetes.io/unreachable` 的 NoSchedule 與 NoExecute taint，節點事件 `NodeNotReady`「Node node-02 status is now: NodeNotReady」，Pod 事件 `Warning NodeNotReady`「Node is not ready」，Pod 的 Ready 條件變 False（容器狀態不變，所以 `get pods` 仍是 `1/1 Running`，但 Deployment 的 READY 下降）；各 Pod 在 NotReady + 它對 unreachable 的 NoExecute toleration 秒數（預設 300）時被驅逐：`Normal TaintManagerEviction`「Marking for deletion Pod default/web-…」（taint-eviction-controller），之後一直 Terminating（沒有 kubelet 確認），RS 在其他節點建立替代的 Pod。沒有 toleration 的立刻驅逐，沒有秒數的不驅逐。kube-system 的 Pod 不驅逐。對故障節點上的 Pod 執行 `kubectl delete`（沒有 `--force`）也只會停在 Terminating。

## 9. 課程資料（`kube-lesson.ts`）

```ts
kube: {
  …E32、E33 的欄位,
  failures?: [{ node: 'node-02', at: '2026-11-24 10:05:00' }],   // UTC，可以晚於 now
}
```

驗證：最多 5 筆、每個節點一筆、節點存在、`at` 介於 `created` 與 now 之後一天。manifest 可以是 Deployment 與 ReplicaSet（在各自的時間建立，控制器在那個時間開始工作）。變體的 `kube` 也可以有自己的 `failures`。

## 10. 檢查（`kube-workload-checks.ts`）

| 檢查 | 意義 |
|---|---|
| `{ kind: 'kube-workload', resource?: 'Deployment' \| 'ReplicaSet', name, namespace?, replicas?, readyReplicas?, updatedReplicas?, availableReplicas?, image?, container?, revision?, paused?, condition?: { type, status, reason? } }` | `replicas` 是 `spec.replicas`，其他三個是 status；`image` 是範本第一個（或 `container` 指名的）容器；`revision` 是 `deployment.kubernetes.io/revision`；ReplicaSet 沒有 `updatedReplicas`、`paused`。說明例：`default 命名空間應該有名為 web 的 Deployment（spec.replicas 3、Image nginx:1.28、revision 2）`；訊息例：`web 的 就緒的 Pod 是 0`、`web 沒有名為 side 的容器`、`web 的 Progressing 是 True（NewReplicaSetAvailable）` |
| `{ kind: 'kube-rollout', name, namespace?, complete?, revision?, changeCause?, history? }` | `complete` 是 `kubectl rollout status` 會說成功；`changeCause` 是目前 revision 的 CHANGE-CAUSE（沒有是 `<none>`）；`history` 是 `rollout history` 的筆數。訊息例：`web 的滾動更新還沒完成：Waiting for deployment "web" rollout to finish: 0 of 3 updated replicas are available...` |

兩者都在檢查前 settle 到時鐘、不移動時鐘（解答要有 `kubectl rollout status` 或 `sleep`）。`TERMINAL_CHECK_KINDS` 加上這兩種。

## 11. 偏差（刻意的模型）

- **pod-template-hash** 是範本 JSON（鍵排序）的 SHA-256，不是 Go 結構傾印的 FNV-32a；長度固定 10 字元（真實常是 9–10）。名稱的後綴以物件計數器為種子。
- 控制器在事件發生的同一秒執行（沒有 informer 延遲、沒有工作佇列的速率限制）；availability 在「就緒 + minReadySeconds」那一秒成立（真實的比較是嚴格的 `Before`，會晚一點）；deadline 在「lastUpdateTime + 期限」那一秒到。
- 刪除排序沒有「同節點相關 Pod 數」、`controller.kubernetes.io/pod-deletion-cost` 與就緒時間的對數分組。
- RS 建立 Pod 沒有 slow-start 批次；同一次同步裡建立的 Pod 依序命名。
- 擴縮事件（`kubectl scale` 在滾動更新進行中）走滾動的演算法，不做真實的比例縮放；paused 時多個活躍 RS 不做比例縮放。
- Deployment 不收養沒有 owner 的 RS；`--cascade=foreground` 當成 background。
- `rollout status` 每個訊息只印一次（真實的 watch 每個事件都印，常重複）；沒有 `--timeout` 最多等 3600 秒。
- `rollout undo` 把 RS 的註解合併到 Deployment（保留 last-applied 與 revision 相關），真實的 JSON patch 會取代整個 annotations。
- drain 的錯誤與警告依字母順序（真實依 map 的迭代順序）；驅逐的 Pod 依消失時間印出。
- 節點故障：kube-system 的 Pod 不驅逐；故障節點上的 `kubectl logs`／`exec` 照常（真實會連不到 kubelet）；taint 沒有 `timeAdded`；節點不會恢復。
- `kubectl set image` 沒有變化時不印任何東西；不支援已棄用的 `--record`。

## 12. 修正（E32、E33）

這些在所有 profile 都生效；已發布的課沒有用到 kubectl，重播不變。
- `kubectl delete`、`label`、`annotate` 的物件名稱帶 API group：`deployment.apps "coredns" deleted`、`daemonset.apps/kube-proxy labeled`（原本是 `deployment "coredns" deleted`）。
- `kubectl events --for` 接受 kubectl 的類型名稱（`deploy/web`、`rs/…`、`no/node-01`），原本只認單複數的 kind。
- `get … -o wide` 的 SELECTOR 依鍵排序（kubectl 的 selector 字串）。
- KUB-1 整合時：類型名稱接受 apps 群組的限定寫法（`replicaset.apps/solo`、`deployment.apps/web`、`rs.apps`），也就是 `-o name` 印出的形式，所以 `kubectl scale $(kubectl get deploy web -o name) --replicas=1` 可以用；核心類型加群組（`pods.apps`）仍是 `doesn't have a resource type`。
- KUB-1 上線後（main 的 CI 有一個長時間測試逾時）：`sameJ` 改為直接比較結構（結果與排序後的 JSON 文字相同，有測試對照），時間戳的轉換有快取；`kubectl rollout status` 與 `kubectl wait` 不再一秒一秒前進，而是直接跳到叢集下一個步驟的時間（兩步之間叢集不會改變），輸出與前進的秒數都不變。一週的 CrashLoop 加上暫停的 rollout status 從約 1.8 秒降到約 0.7 秒。

## 13. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e34.test.ts` | profile 與分界（以下的訊息、未知旗標、failures 被拒）；failures 的驗證；嚴格解碼、apps/v1 驗證、選擇器不可變、Recreate 與 rollingUpdate 的 Forbidden；預設值、RS 與 Pod 的名稱與 ownerReference、`get rs -o wide`；`create deployment` 的 dry-run YAML、AlreadyExists、`scale`、`set image`；收養、釋放、替代；刪除排序（比較函式逐條與端到端）；fenceposts 的取整；maxSurge 2／maxUnavailable 1 的事件順序；`rollout status` 的訊息與時間；minReadySeconds 的邊界；ProgressDeadlineExceeded 的時間與 `--timeout`；Recreate；history 與 CHANGE-CAUSE、`--revision`；undo 到 revision、skipped、revisionHistoryLimit；pause、resume、restart；delete 的 cascade 與 `get all` |
| `tests/terminal-e34-nodes.test.ts` | cordon／uncordon 與排程器的訊息、重試；drain 的兩種錯誤、警告、驅逐與等待的時間；節點故障的 50 秒與 300 秒邊界、READY 下降、Ready 條件、事件、Terminating、替代 Pod、describe node；確定性與變體自己的 failures；一週的 crash loop Deployment 與 paused 時 `rollout status` 的 3600 秒上限、`wait --for=condition=Available`；`kube-workload`、`kube-rollout` 的通過、訊息、說明與驗證 |
| `tests/support/workloads-fixture.ts` | 只供測試：kub-34（workloads profile，E33 的機器加上 `nginx:1.28`）、`~/k8s/deploy.yaml`、`deployment()`、`withFiles()` |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `workloads`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', 'E33', 'E34']`，KUB01、KUB03、KUB04 可以建立，KUB11 只缺 E35。

## 14. 只在課文說明、或不模擬的部分

DaemonSet 控制器（只顯示 kube-proxy）、StatefulSet（E38）、Job、CronJob；HPA（E40）；PodDisruptionBudget 與 eviction API 的 429；`kubectl rollout` 對 DaemonSet、StatefulSet；`kubectl set resources|env|selector`；`--record`；比例縮放；Deployment 收養孤兒 RS；節點恢復、`node.kubernetes.io/not-ready` 的時序與 `--pod-eviction-timeout` 的歷史；`kubectl drain --disable-eviction`、`--pod-selector`、`--timeout`；Pod 的 `deletionTimestamp` 到期後的強制清除。

## 15. 沒有把握的地方（依記得的格式寫，並在此註明）

- **控制器的事件**：`Scaled up replica set web-… from 0 to 3`（1.28 之後的「from … to」格式）、`Created pod: …`、`Deleted pod: …`、FailedCreate 的文字；事件的來源名稱 `deployment-controller`、`replicaset-controller`、`node-controller`、`taint-eviction-controller`；`TaintManagerEviction`「Marking for deletion Pod default/web-…」；節點的 `NodeNotReady`、`NodeNotSchedulable` 的訊息與來源（kubelet）。
- **conditions**：各 reason 的 message 文字；Available／Progressing 的順序；ProgressDeadlineExceeded 是在期限那一秒還是下一秒。
- **驗證文字**：`map[string]string{…}` 與 `v1.LabelSelector{…}` 的 Go `%#v` 寫法、`intstr.IntOrString{Type:0, …}`、percent 的 regex 訊息、`empty selector is invalid for deployment`、activeDeadlineSeconds 的 Forbidden、錯誤的先後順序。
- **kubectl 的文字**：`rollout history` 標題尾端的空白與最後的空行、`--revision` 的範本格式；`rollout undo` 的各種錯誤（paused 的訊息內容、`skipped rollback` 的 revision 號碼在 `--to-revision=0` 時）；`restart` 對 paused 的訊息；`create deployment` 的 AlreadyExists 與容器名稱的規則；`set image` 沒有變化時的輸出；`scale` 對其他 kind 的錯誤。
- **drain**：`cannot delete cannot delete Pods that declare no controller …`（重複的 cannot delete 是記憶中的真實輸出）、多個錯誤的 `[a, b]`、警告以 `; ` 連接、`evicting pod` 印在 stdout、`There are pending nodes to be drained:` 的格式。
- **時間**：`--node-monitor-grace-period` 在 v1.32 是 50 秒（之前是 40 秒）；故障節點的 lastHeartbeatTime；cordon 的 taint 由誰加上、何時加上。
- **describe**：Deployment 的 Conditions 欄寬、Pod Template 的縮排、`OldReplicaSets` 只列非 0 的、ReplicaSet 的 `Pods Status` 與 `Replicas` 行、Pod 的 `Controlled By` 位置。
