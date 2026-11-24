# KUB-3 引擎階段 E38：`kube-storage` profile（`kube-storage*.ts`、`kube-statefulset*.ts`、`kubectl-storage.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E37 的叢集（[KUB0_E37_INGRESS](KUB0_E37_INGRESS.md)）上加上 StorageClass（storage.k8s.io/v1）、PersistentVolume 與 PersistentVolumeClaim（v1）、PV controller 的綁定、動態佈建與回收、課程宣告的 provisioner、排程器的 Volume 外掛與 attach/detach controller（Multi-Attach）、Pod 裡 PVC 與 `emptyDir` 的檔案樹、StatefulSet（apps/v1）controller、`kubectl exec … -- tar` 的串流備份與還原、`kubectl cp` 子集，以及檢查 `kube-volume` 與 `kube-workload` 的 StatefulSet。E1–E37 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`ingress` 以下的 profile 輸出不變：這四種 manifest、`get pvc|pv|sc|sts`、`kubectl cp`、Pod 的 PVC／emptyDir Volume 仍是「要到引擎階段 E38 才模擬」。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `KUBE_STORAGE_PROFILE`（RANK 38） | `ingress` 的一切加上 feature `kube-storage`，**沒有新指令**。課程機器寫 `profile: 'kube-storage'` |
| profile 以下 | `（模擬環境：PersistentVolumeClaim 要到引擎階段 E38 才模擬）`、`（模擬環境：pvc 要到引擎階段 E38 才模擬）`、`（模擬環境：kubectl cp 要到引擎階段 E38 才模擬）`、`（模擬環境：spec.volumes[0] 要到引擎階段 E38 才模擬）`（E32、E36 原文）；`--retries`、`--no-preserve` 是 `error: unknown flag`；課程資料 `kube.storage`：`kube: storage needs the kube-storage profile (engine stage E38)`；檢查 `kube-volume` 與 StatefulSet 的 `kube-workload`：`needs a kube-storage machine (engine stage E38)` |
| 開關 | `KubeState.storage`（`buildKube` 在 kube-storage profile 設定）：課程的 provisioner、Volume 的內容、StatefulSet 的 revision、排程器看過的 PVC／PV 簽章。kubectl、manifest 的解碼、controller、排程器、kubelet 的掛載都以它判斷 |

程式的分工（每個新檔案都不到 170 行）：`kube-storage-model.ts`（狀態、名稱、存取模式、來源的鍵、node affinity、刪除時的 finalizer、PVC spec 的驗證）、`kube-storage-spec.ts`（預設值、admission、驗證、更新規則、課文欄位）、`kube-storage-ctl.ts`（PV controller）、`kube-storage-sched.ts`（排程器的 Volume 外掛、WaitForFirstConsumer 的選點、attach/detach）、`kube-storage-mount.ts`（容器看到的檔案、寫回 Volume、E24 的 `writes`）、`kube-storage-lesson.ts`、`kube-storage-print.ts`（`get` 的欄與 describe）、`kube-statefulset-spec.ts`、`kube-statefulset.ts`、`kubectl-storage.ts`（tar 串流、`cp`、exec 之後的提交）、`kube-volume-checks.ts`。既有檔案只多了 kube-storage 才走到的分支：`kube-model.ts`（`storage`）、`kube-manifest.ts`（E38 的嚴格解碼 schema、`laterField` 的 storage）、`kube-api.ts`（`NAMESPACED`）、`kube-write.ts`、`kube-workload-spec.ts`、`kube-controllers.ts`（StatefulSet 與 PV controller 加入 controller 迴圈、建立時間）、`kube-replicaset.ts`（GC 經 finalizer 刪 PVC）、`kube-settle.ts`（排程）、`kube-sched.ts`（Volume 的節點篩選）、`kube-volumes.ts`（掛載與 attach）、`kube-image.ts`（掛載點遮住 Image、主程式的重新導向）、`kube-kubelet.ts`、`kube-dns.ts`、`kube-pod-net.ts`、`kube-describe-config.ts`、`kube-print.ts`、`kube-output.ts`、`kube-checks.ts`、`kube-health.ts`、`kube-workload-checks.ts`、`kubectl.ts`、`kubectl-get.ts`、`kubectl-pod.ts`、`kubectl-apply.ts`、`kubectl-workload.ts`、`kubectl-rollout.ts`、`kube-lesson.ts`、`shell.ts`、`lesson.ts`、`server-lesson.ts`。

## 2. 物件、預設值與驗證（`kube-storage-spec.ts`、`kube-statefulset-spec.ts`、`kube-manifest.ts`）

- **嚴格解碼**：StorageClass（`provisioner`、`parameters`、`reclaimPolicy`、`volumeBindingMode`、`allowVolumeExpansion`、`mountOptions`、`allowedTopologies`）、PV（`capacity`、`accessModes`、`persistentVolumeReclaimPolicy`、`storageClassName`、`volumeMode`、`mountOptions`、`claimRef`、`nodeAffinity`，來源 `hostPath`、`local`、`nfs`、`csi`）、PVC（`accessModes`、`resources.requests`、`storageClassName`、`volumeName`、`volumeMode`、`selector`）、StatefulSet（`replicas`、`selector`、`template`、`serviceName`、`volumeClaimTemplates`、`podManagementPolicy`、`updateStrategy`、`revisionHistoryLimit`、`minReadySeconds`、`persistentVolumeClaimRetentionPolicy`），Pod 與 template 的 `persistentVolumeClaim`（`claimName`、`readOnly`）與 `emptyDir`（`medium`、`sizeLimit`）。Pod 的其他 Volume（`hostPath`、`nfs`…）是 `（模擬環境：spec.volumes[0] 要到引擎階段 （課文說明） 才模擬）`。
- **預設值**：StorageClass `reclaimPolicy: Delete`、`volumeBindingMode: Immediate`；PV `persistentVolumeReclaimPolicy: Retain`、`volumeMode: Filesystem`、`hostPath.type: ""`、建立時 `status.phase: Pending` 與 finalizer `kubernetes.io/pv-protection`；PVC `volumeMode: Filesystem`、建立時 `Pending` 與 `kubernetes.io/pvc-protection`；StatefulSet 見 §6。
- **DefaultStorageClass admission**：**建立時**沒有 `storageClassName` 這個欄位的 PVC 拿到註解 `storageclass.kubernetes.io/is-default-class: "true"` 的 class（多個時取最新的）；寫 `storageClassName: ""` 是明確不要 class（只綁定靜態 PV）。之後出現預設 class 時，PV controller 也把它補給還在 Pending、沒有這個欄位的 PVC（1.28 起的 retroactive 行為）。
- **驗證**（一次全部列出）：StorageClass `provisioner: Required value`、`reclaimPolicy: Unsupported value: "Keep": supported values: "Delete", "Retain"`、`volumeBindingMode` 同理；PV `spec.capacity: Required value`、存取模式（`Unsupported value … supported values: "ReadOnlyMany", "ReadWriteMany", "ReadWriteOnce", "ReadWriteOncePod"`、`may not use ReadWriteOncePod with other access modes`）、回收策略、`spec: Required value: must specify a volume type`、`may not specify more than 1 volume type`、來源的必填欄位、local 要有 `nodeAffinity`；PVC `spec.accessModes: Required value: at least 1 access mode is required`、`spec.resources[storage]: Required value`、數量的 regex 句；StatefulSet 另見 §6。
- **更新**：StorageClass 的 `parameters`、`provisioner`、`reclaimPolicy`（`Forbidden: updates to … are forbidden.`）與 `volumeBindingMode`（`field is immutable`）不能改；PV 的來源（`spec.persistentvolumesource: Forbidden: …`）與 `volumeMode` 不能改；PVC 除了 `resources.requests` 以外不能改（`spec: Forbidden: spec is immutable after creation except resources.requests and volumeAttributesClassName for bound claims`），縮小到容量以下是 `field can not be less than status.capacity`，放大要已 Bound 而且 class 有 `allowVolumeExpansion: true`，否則 `Error from server (Forbidden): error when patching "…": persistentvolumeclaims "x" is forbidden: only dynamically provisioned pvc can be resized and the storageclass that provisions the pvc must support resize`。
- **課文欄位**：`volumeMode: Block`、`dataSource`／`dataSourceRef`（快照與複製）、`allowedTopologies`、`ordinals`：`（模擬環境：PersistentVolumeClaim 的 spec.volumeMode Block 只在課文說明）`。
- 上限：40 個 StorageClass、PV、PVC 與 StatefulSet。輸出帶 API group：`storageclass.storage.k8s.io/fast created`、`statefulset.apps/web created`。

## 3. PV controller（`kube-storage-ctl.ts`）

和其他 controller 一起跑（命令改了叢集、Pod 的就緒或存在改變、開機 manifest 出現時），每次跑到沒有變化為止：

- **綁定**：Pending 的 PVC 先找寫了它名字的 PV（`spec.volumeName`，或 PV 的 `claimRef` 預先綁定），否則找**最小的** Available PV：同一個 class（PV 沒有 class 等於 `""`）、包含要的存取模式、容量足夠、`volumeMode` 相同、符合 `selector`（同容量依名稱）。綁定時 PV 寫入 `claimRef`（apiVersion、kind、name、namespace、resourceVersion、uid）與 `Bound`，PVC 寫入 `volumeName`、`pv.kubernetes.io/bind-completed: yes`、`pv.kubernetes.io/bound-by-controller: yes`（controller 選的時候）與 `status`（`accessModes`、`capacity`、`Bound`）；controller 設定 `claimRef` 的 PV 也拿到 `bound-by-controller`。
- **動態佈建**：沒有可綁定的 PV、而且 class 存在時：PVC 註解 `volume.beta.kubernetes.io/storage-provisioner` 與 `volume.kubernetes.io/storage-provisioner`，事件 `Normal ExternalProvisioning`「Waiting for a volume to be created either by the external provisioner 'X' or manually by the system administrator. If volume creation is delayed, please verify that the provisioner is running and correctly registered.」；**課程宣告了這個 provisioner** 時同一秒 `Normal Provisioning`「External provisioner is provisioning volume for claim "default/data"」、建立 PV `pvc-<PVC 的 uid>`（容量是要求的值、class 的 `reclaimPolicy`、註解 `pv.kubernetes.io/provisioned-by`、`claimRef`）、`Normal ProvisioningSucceeded`「Successfully provisioned volume pvc-…」（來源 `<provisioner>_<名稱第一段>-provisioner-0`）。node-local 的 provisioner 給 `hostPath`（`/opt/local-path-provisioner/<pv>_<ns>_<pvc>`、`DirectoryOrCreate`）與指向選定節點的 `nodeAffinity`，沒有選定節點時 `Warning ProvisioningFailed`「failed to provision volume with StorageClass "x": configuration error, no node was specified」；其他給 CSI（`driver` 是 provisioner、`fsType: ext4`、`volumeHandle` 是 PV 名稱）。
- **等待的事件**（每種訊息記一次）：WaitForFirstConsumer 還沒有 Pod：`Normal WaitForFirstConsumer`「waiting for first consumer to be created before binding」，有 Pod 還沒排程：`Normal WaitForPodScheduled`「waiting for pod w to be scheduled」；沒有 class：`Normal FailedBinding`「no persistent volumes available for this claim and no storage class is set」；class 不存在：`Warning ProvisioningFailed`「storageclass.storage.k8s.io "gold" not found」；`kubernetes.io/no-provisioner`：`Warning ProvisioningFailed`「no volume plugin matched name: kubernetes.io/no-provisioner」；provisioner 沒有在跑：只有 ExternalProvisioning，一直 Pending。
- **刪除與回收**：刪除的 PVC 在沒有 Pod（未結束、包括 Terminating）使用時才消失；它的 PV 成為 `Released`（`claimRef` 保留），再依回收策略：`Retain` 停在 Released（`kubectl apply` 加上 `claimRef: null`，或刪掉 PV 再建立，才回到 Available）；`Delete` 由宣告的 provisioner 刪除 PV 與資料（provisioner 沒在跑：停在 Released），靜態 PV 是 `Failed`、`Message` 與 `Warning VolumeFailedDelete`「error getting deleter volume plugin for volume "pv-del": no deletable volume plugin matched」；`Recycle`（已棄用）清空資料、拿掉 `claimRef`、Available。刪除的 PV 在沒有 PVC 綁著它時才消失。PV 的 `status.lastPhaseTransitionTime` 在 phase 改變時更新。
- **Lost**：綁定的 PV 不見時 PVC 是 `Lost`，`Warning ClaimLost`「Bound claim has lost its PersistentVolume. Data on the volume is lost!」。
- **擴充**：已綁定的 PVC 要求比容量大（class 允許）時，PV 的 `capacity` 與 PVC 的 `status.capacity` 立刻變成要求的值（沒有 resize 的事件與 `FileSystemResizePending`）。
- PVC 或 PV 有變化時排程器重試還沒排上的 Pod。

## 4. 排程與 attach（`kube-storage-sched.ts`、`kube-sched.ts`、`kube-settle.ts`）

- **試節點之前**（任何節點都不行）：PVC 不存在：`0/3 nodes are available: persistentvolumeclaim "nope" not found. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.`；PVC 正在刪除：`persistentvolumeclaim "x" is being deleted`；Immediate 的 PVC 還沒綁定：`pod has unbound immediate PersistentVolumeClaims`。PVC 綁定或出現後排程器重試。
- **節點篩選**（在 NodeResourcesFit 之後）：PV 的 `nodeAffinity` 不允許：`node(s) had volume node affinity conflict`；ReadWriteOncePod 的 PVC 已有別的 Pod 使用：`node has pod using PersistentVolumeClaim with the same name and ReadWriteOncePod access mode`（preemption 是 `No preemption victims found for incoming pod`）；WaitForFirstConsumer、`no-provisioner` 而且那個節點沒有可綁定的 PV：`node(s) didn't find available persistent volumes to bind`。
- **選定節點之後**：延遲綁定的 PVC 在那個節點上綁定靜態 PV，或加上 `volume.kubernetes.io/selected-node` 後佈建；佈建不了（provisioner 沒在跑）時 Pod 不綁定、沒有 FailedScheduling 事件，留在 Pending。`spec.nodeName` 的 Pod 不經過這些檢查。
- **attach/detach**：CSI 的 PV（網路磁碟）一次只能 attach 到一個節點（存取模式有 RWX 或 ROX 時例外）。別的節點上的 Pod 已經用它時，新 Pod 在 kubelet 掛載前停住（`ContainerCreating`），事件 `Warning FailedAttachVolume`（來源 `attachdetach-controller`）「Multi-Attach error for volume "pvc-…" Volume is already used by pod(s) a」（別的命名空間只說 `N pod(s) in different namespaces`）。舊 Pod 消失時（controller 在那一刻重跑）新 Pod 掛上、開始拉取。第一次 attach 到節點時 `Normal SuccessfulAttachVolume`「AttachVolume.Attach succeeded for volume "pvc-…"」。hostPath、local、NFS 不經 attach（RWO 不強制，同真實的行為）。

## 5. Volume 的內容（`kube-storage-mount.ts`、`kube-volumes.ts`、`kube-image.ts`）

- **檔案樹**：Volume 的內容存在 `KubeState.storage.data`，鍵是**後端的身分**：hostPath 是 `節點 + 路徑`（每個節點各一份，Pod 換節點就看不到——真實的陷阱）、local 是 affinity 的節點與路徑、NFS 是 server 與 path、CSI 是 driver 與 volumeHandle；emptyDir 是 `Pod 的 uid + Volume 名稱`。所以資料比 Pod 長命，刪掉 PV 再用同一個來源建立也看得到原本的檔案；emptyDir 隨 Pod 刪除（容器重新啟動時還在）。
- **掛載**：掛載點遮住 Image 在那個路徑的檔案；PVC 的根目錄 0755、emptyDir 0777，擁有者 root；`subPath` 掛那個子資料夾（沒有時建立）。`kubectl exec`、探針、檢查 `kube-pod` 的 `file`、主程式都看得到。
- **寫入**：`kubectl exec`、`kubectl cp` 與主程式的 shell 行改到掛載點以下的東西寫回 Volume，不進容器的 writable layer。`readOnly: true`（volumeMount 或 `persistentVolumeClaim.readOnly`）時拒絕：E22 `readOnlyError` 的文字（`sh: 1: cannot create /data/y: Read-only file system`、`touch: cannot touch '/data/z': Read-only file system`），結束碼 1。kube-storage 上主程式的 `sh -c "echo … > /data/x; sleep 3600"` 每一段可以重新導向與管線（較低的 profile 不變）。
- **E24 的 `writes`**：程式啟動時在掛載的 Volume 上建立那些檔案（空的）；Volume 是唯讀時程式印出 `readOnlyError`（或模擬環境的說明）並結束，進入 CrashLoopBackOff。

## 6. StatefulSet（`kube-statefulset.ts`、`kube-statefulset-spec.ts`）

- **預設值**：`replicas: 1`、`podManagementPolicy: OrderedReady`、`revisionHistoryLimit: 10`、`updateStrategy: {type: RollingUpdate, rollingUpdate: {partition: 0}}`、`persistentVolumeClaimRetentionPolicy: {whenDeleted: Retain, whenScaled: Retain}`、template 同 Deployment，`volumeClaimTemplates` 每一筆加上 `apiVersion: v1`、`kind: PersistentVolumeClaim`、`volumeMode: Filesystem`、`status: {phase: Pending}`；建立時 `generation: 1`、`status: {availableReplicas: 0, replicas: 0}`。
- **驗證**：Deployment 的選擇器與 template 檢查，加上 `spec.podManagementPolicy: Invalid value: "Fast": must be 'OrderedReady' or 'Parallel'`、`spec.updateStrategy: Invalid value: apps.StatefulSetUpdateStrategy{…}: must be 'RollingUpdate' or 'OnDelete'`、`partition` 不能是負數、保留策略的 `Unsupported value`、`serviceName` 是 label、claim template 的名稱與 spec；template 可以用 claim template 的名稱掛載。更新只能改 replicas、ordinals、template、updateStrategy、revisionHistoryLimit、保留策略與 minReadySeconds（`spec: Forbidden: updates to statefulset spec for fields other than …`）。
- **Pod**：`<set>-<i>`，標籤 = template 的標籤加上 `controller-revision-hash`、`statefulset.kubernetes.io/pod-name`、`apps.kubernetes.io/pod-index`；`hostname` 是 Pod 名稱，`subdomain` 是 `serviceName`；每個 claim template 一個 Volume（`<template>-<set>-<i>`，排在 template 的 Volume 之前）。建立 Pod 前先建立缺少的 PVC（標籤是 template 的加上 selector 的 matchLabels；`whenDeleted: Delete` 時 owner 是 StatefulSet）。事件（`statefulset-controller`）：`create Claim data-web-0 Pod web-0 in StatefulSet web success`、`create Pod web-0 in StatefulSet web successful`、`delete Pod web-2 in StatefulSet web successful`。
- **順序**：OrderedReady 一次一個，前一個 Running 而且 Ready 才建立下一個；縮減從最大的序號開始，一次一個，其他 Pod 都健康時才刪；Parallel 一次全部。結束（Failed／Succeeded）的 Pod 刪掉重建。被刪除的 Pod 消失後以**同一個名稱**重建，拿回同一個 PVC（local 的 PV 有 node affinity，所以回到同一個節點）。
- **PVC 的保留**：縮減與刪除都保留 PVC（再擴張時同一個序號拿回資料）；`whenScaled: Delete` 時被縮掉的序號的 PVC 改由那個 Pod 擁有、隨它刪除；`whenDeleted: Delete` 時刪除 StatefulSet 後 GC 經 finalizer 刪除 PVC（PV 再依回收策略）。
- **更新**：revision 是 `<set>-<template 的 SHA-256 取 10 字>`（相同的 template 回到同一個 revision；樣板存在 `storage.revisions`）。RollingUpdate：所有 Pod 健康時，從最大的序號往下到 `partition`，一次刪一個舊 revision 的 Pod，重建時序號 < partition 用 currentRevision 的樣板，其他用 updateRevision 的。OnDelete：只有學習者刪掉的 Pod 以新樣板重建。`status`：`replicas`（含 Terminating）、`readyReplicas`、`availableReplicas`、`currentReplicas`、`updatedReplicas`、`currentRevision`、`updateRevision`、`observedGeneration`、`collisionCount: 0`（0 的 ready／current／updated 省略）；RollingUpdate 時所有 Pod 都是新 revision 而且就緒，`currentRevision` 才變成 `updateRevision`。
- **kubectl**：`get sts`（NAME READY AGE，`-o wide` 加 CONTAINERS IMAGES）、`get all` 包含 StatefulSet、`scale sts`、`set image sts/web`、`rollout status`（`Waiting for statefulset spec update to be observed...`、`Waiting for N pods to be ready...`、`Waiting for partitioned roll out to finish: X out of Y new pods have been updated...`、`partitioned roll out complete: N new pods have been updated...`；OnDelete：`error: rollout status is only available for RollingUpdate strategy type`）、`rollout restart`；history、undo、pause、resume 是 `（模擬環境：kubectl rollout history 只模擬 Deployment；StatefulSet 只模擬 status 與 restart）`。
- **DNS**：Pod 有 `hostname` 與 `subdomain` 而且就緒時，CoreDNS 回答 `<hostname>.<service>.<ns>.svc.cluster.local`（headless Service），Pod 的 `/etc/hosts` 最後一行是 `IP\t<fqdn>\t<名稱>`。

## 7. 備份：`kubectl exec … -- tar` 與 `kubectl cp`（`kubectl-storage.ts`）

- **串流**：exec 的指令是 `tar` 而且 `-f -`（`czf -`、`-czf -`、`-f -`、`--file=-`、`--file -`）時，容器裡的 E22 tar 讀寫一個暫存檔：建立（c）時封存檔是 kubectl 的標準輸出（`> backup.tgz` 在工作站上），清單與 `tar: Removing leading `/' from member names` 走標準錯誤；解開（x）時封存檔是 kubectl 的標準輸入，要加 `-i`（`kubectl exec -i db-0 -- tar xzf - -C / < backup.tgz`；沒有 `-i` 是 `tar: This does not look like a tar archive`）。工作站的 `tar tzvf backup.tgz` 讀得懂（E22 的格式）。只支援 `tar` 直接寫在 `--` 後面（不經 `sh -c`）。
- **`kubectl cp`**：`kubectl cp [ns/]pod:路徑 本機路徑` 在容器裡跑 `tar cf`（Image 要有 tar），成員寫到本機名稱（檔案或資料夾，缺的上層資料夾建立，擁有者是使用者）；`kubectl cp 本機路徑 pod:路徑` 如 `tar -xmf -`：寫到容器（擁有者 root），經 §5 寫回 Volume 或 writable layer。`-c` 選容器。錯誤：`error: source and destination are required`、`error: one of src or dest must be a local file specification`、`… must be a remote file specification`、`error: nope.txt doesn't exist in local filesystem`、`Error from server (NotFound): pods "ghost" not found`、遠端路徑不存在時 tar 的三行、上層資料夾不存在時 `tar: /nowhere: Cannot open: No such file or directory`、唯讀時 `tar: hi.txt: Cannot open: Read-only file system`（後兩者加 `command terminated with exit code 2`）、Image 沒有 tar 時 exec 的 `executable file not found in $PATH`。

## 8. get 與 describe（`kube-storage-print.ts`、`kube-describe-config.ts`）

| 指令 | 內容 |
|---|---|
| `get sc` | NAME PROVISIONER RECLAIMPOLICY VOLUMEBINDINGMODE ALLOWVOLUMEEXPANSION AGE；預設 class 的名稱後加 ` (default)`；ALLOWVOLUMEEXPANSION 沒寫是 `false` |
| `get pv` | NAME CAPACITY ACCESS MODES RECLAIM POLICY STATUS CLAIM STORAGECLASS VOLUMEATTRIBUTESCLASS REASON AGE（`-o wide` 加 VOLUMEMODE）；存取模式是 `RWO,ROX,RWX,RWOP`；VOLUMEATTRIBUTESCLASS 沒有是 `<unset>`；刪除中是 `Terminating` |
| `get pvc` | NAME STATUS VOLUME CAPACITY ACCESS MODES STORAGECLASS VOLUMEATTRIBUTESCLASS AGE；有 `volumeName` 才印容量與存取模式 |
| `describe pvc` | Name、Namespace、StorageClass、Status（刪除中 `Terminating (lasts 0s)`）、Volume、Labels、Annotations、Finalizers（`[kubernetes.io/pvc-protection]`）、Capacity、Access Modes、VolumeMode、Used By、Events |
| `describe pv` | Name、Labels、Annotations、Finalizers、StorageClass、Status、Claim、Reclaim Policy、Access Modes、VolumeMode、Capacity、Node Affinity（`Required Terms:`、`Term 0:  kubernetes.io/hostname in [node-01]`）、Message、Source（HostPath、LocalVolume、NFS、CSI 各自的欄位，縮排四格）、Events |
| `describe sc` | Name、IsDefaultClass、Annotations（`labels.FormatLabels`：`k=v,…`，last-applied 也在裡面）、Provisioner、Parameters、AllowVolumeExpansion（沒寫是 `<unset>`）、MountOptions、ReclaimPolicy、VolumeBindingMode、Events |
| `describe sts` | Name、Namespace、CreationTimestamp、Selector、Labels、Annotations、`Replicas: 3 desired | 3 total`、Update Strategy（與 `Partition`）、Pods Status、Pod Template、Volume Claims（Name、StorageClass、Labels、Annotations、Capacity、`Access Modes: [ReadWriteOnce]`）、Events |
| `describe pod` | Volumes 的 `PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)`、`ClaimName`、`ReadOnly`；`EmptyDir (a temporary directory that shares a pod's lifetime)`、`Medium`、`SizeLimit: <unset>` |

## 9. 沒有新增的指令與旗標

`kubectl cp` 在 kube-storage 上成為動詞（`-c`、`-n`、`--retries`、`--no-preserve` 可以寫，後兩者沒有作用）；`kubectl scale`、`set image`、`rollout status|restart` 接受 StatefulSet；`kubectl exec -i` 傳遞標準輸入給 tar。`api-resources` 本來就列出這四種資源。

## 10. 課程資料與檢查（`kube-storage-lesson.ts`、`kube-volume-checks.ts`、`kube-workload-checks.ts`）

```ts
kube: {
  …E32–E37 的欄位,
  manifests: [{ text: 'local-path 的 StorageClass（預設、WaitForFirstConsumer）、靜態 PV…' }],
  storage?: {
    provisioners?: [{ name: 'local.example.com/local-path', local: true }, { name: 'disk.csi.example.com' }],
    files?: { 'pv-db': { 'init.sql': '…' } },
  },
}
```

驗證：`storage.provisioners are at most 4 of { name: a provisioner such as local.example.com/local-path, local?: boolean }, each name once`、`storage.files maps at most 8 PersistentVolume names to at most 20 files each (…)`、`storage.files: no PersistentVolume pv-x among the boot manifests`。StorageClass 與靜態 PV 用 `kube.manifests` 在開機時建立（例如真實叢集裝好的 local-path）；`files` 放在那些 PV 上（沒有 node affinity 的 hostPath 每個節點各放一份）。

| 檢查 | 意義 |
|---|---|
| `kube-volume`：`resource: 'PersistentVolumeClaim' \| 'PersistentVolume'`、`name`、`namespace?`（只給 PVC）、`absent?`、`phase?`（Pending、Bound、Lost、Available、Released、Failed、Terminating）、`storageClass?`（`""` 是沒有）、`capacity?`（以數量比較：5120Mi 等於 5Gi）、`accessModes?`（全名）、`boundTo?`（PVC：PV 名稱；PV：`ns/claim`）、`reclaimPolicy?`（PVC：它的 PV 的） | 說明例：`default 命名空間應該有名為 shared 的 PersistentVolumeClaim（狀態 Bound、StorageClass ""（不使用 StorageClass）、容量 5120Mi、存取模式 ReadWriteMany、綁定到 pv-nfs、回收策略 Retain）`；訊息例：`它的狀態是 Available`、`它還沒有容量（還沒有綁定）` |
| `kube-workload` 加上 `resource: 'StatefulSet'` | replicas、readyReplicas、updatedReplicas、availableReplicas、image、container，加上 `currentRevision?`、`updateRevision?`（名稱）與 `rolledOut?`（currentRevision 等於 updateRevision）；StatefulSet 沒有 revision 編號、paused、condition |
| `kube-pod` 的 `file` | 不變；已經看得到 PVC 與 emptyDir 的檔案（`/data/x.txt`） |

都在檢查前 settle 到時鐘、不移動時鐘。

## 11. 偏差（刻意的模型）

- **時間**：綁定、佈建、attach、detach、刪除 PVC 與回收都在 controller 跑的同一秒完成（真實的 external provisioner 與 attach 需要數秒）；事件每種訊息只記一次（真實的 PV controller 每 15 秒重新同步，FailedBinding 等會累計）。
- **Volume**：沒有真實的大小、配額與 `lost+found`；容量只是數字（不換算成標準形式，`1024Mi` 照樣顯示）；`fsGroup`、擁有者與 SELinux 不模擬，`kubectl cp` 到 Pod 的檔案擁有者一律 root；`volumeMode: Block`、快照、複製、`VolumeAttributesClass` 只在課文。
- **Multi-Attach**：只看 CSI 的 PV（attachable）與存取模式；沒有 kubelet 兩分鐘後的 `FailedMount`（`Unable to attach or mount volumes…`）、6 分鐘的強制 detach 與 VolumeAttachment 物件；節點故障時 Volume 留在原節點。
- **排程**：provisioner 沒在跑的 WaitForFirstConsumer：Pod 不綁定、沒有事件（真實的 PreBind 會在逾時後失敗）；PV 的 `nodeAffinity` 只認 `In`、`NotIn`、`Exists`、`DoesNotExist`；沒有 CSIStorageCapacity 與 NodeVolumeLimits。
- **StatefulSet**：沒有 ControllerRevision 物件（`get controllerrevisions` 不支援，rollout history／undo 只在課文）；revision 名稱用 SHA-256（真實的是 FNV）；`minReadySeconds` 只算在欄位裡，availableReplicas 等於 readyReplicas；不收養沒有 owner 的 Pod；改變保留策略不回頭改既有 PVC 的 owner；`maxUnavailable`（alpha）與 `ordinals` 只在課文。
- **刪除**：使用中的 PVC 與綁定中的 PV 停在 Terminating 時，kubectl 印出說明就返回（真實的 `kubectl delete` 會一直等）。
- **tar 串流**：只支援直接寫在 `--` 後的 `tar`；沒有 `-i` 的解開是 E22 tar 的錯誤（真實的是 gzip 的 `unexpected end of file`）；主程式的 shell 行寫到唯讀 Volume 時寫入被丟棄、沒有錯誤行。

## 12. 課程作者要知道的事

- 機器寫 `profile: 'kube-storage'` 與 `kube.storage.provisioners`；要有預設 class 就在 `kube.manifests` 放一個帶 `storageclass.kubernetes.io/is-default-class: "true"` 的 StorageClass（建議 local-path 式：`local.example.com/local-path`、`local: true`、`WaitForFirstConsumer`）。要示範 Multi-Attach 用非 local 的 provisioner（CSI 網路磁碟）與 RWO；local 的 PV 有 node affinity，Pod 會跟著 PV 回到同一個節點（cordon 那個節點就能示範 `volume node affinity conflict`）。
- 一個 RWO 的網路磁碟同時只給一個節點：同一課裡兩個 Pod 用同一個 PVC，要嘛同一個節點，要嘛等前一個刪掉（否則第二個停在 ContainerCreating——這正是可以教的狀態）。
- OrderedReady 的節奏來自拉取與就緒：Image 不在節點上時每個 Pod 等拉取秒數；節點已經有 Image 時下一個 Pod 同一秒就就緒（`rollout status` 會少印一行）。要示範慢慢一個一個起來，用拉取秒數或 readiness 探針的 `initialDelaySeconds`。
- 寫資料用 `kubectl exec web-0 -- sh -c 'echo … > /data/x'`；主程式可以 `sh -c "echo … > /data/x; sleep 3600"`；E24 程式用 `writes`。驗證資料留下用刪 Pod、等重建、再 `cat`，或檢查 `kube-pod` 的 `file`。
- 備份：`kubectl exec db-0 -- tar czf - /data > backup.tgz`，還原：`kubectl exec -i db-0 -- tar xzf - -C / < backup.tgz`（Image 的 `commands` 要有 `tar`）；`kubectl cp db-0:/data ./backup`。
- PV 與 revision 的名稱含 uid 或雜湊，課文不要寫死，用 `kubectl get pvc data -o jsonpath='{.spec.volumeName}'`；檢查用 `kube-volume` 的 `boundTo` 綁 PVC 名稱、`rolledOut` 代替 revision 名稱。
- 縮減後的 PVC 預設留著（課文可以讓學習者 `kubectl get pvc` 看到）；要示範自動刪除用 `persistentVolumeClaimRetentionPolicy`。

## 13. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e38.test.ts` | profile 與分界（以下的訊息、課程資料被拒）、課程資料的驗證；`get sc` 與預設 class、Immediate 的動態佈建（`get pvc,pv`、describe pvc／pv／sc 的全文與事件）、沒有 class／class 不存在／provisioner 沒在跑／no-provisioner 的事件、DefaultStorageClass admission 與 retroactive、WaitForFirstConsumer 的選點與 local PV 的 node affinity；靜態綁定（最小的、太大、selector）、Retain／Released 與 `claimRef: null`、靜態 Delete 的 Failed、Recycle、佈建的 Delete 與 Retain、PVC 與 PV 的 Terminating；驗證與更新的全文、擴充、縮小、不允許的擴充、課文欄位、嚴格解碼、Pod 的其他 Volume；檢查 `kube-volume`（說明、訊息、檢查的檢查） |
| `tests/terminal-e38-data.test.ts` | 資料在刪 Pod 後留下、emptyDir 隨 Pod 消失；主程式的寫入、E24 `writes`、唯讀掛載的拒絕與 CrashLoopBackOff、describe 的 `(ro)`；`kube-pod` 的 `file`；PVC 不存在／未綁定的 FailedScheduling 與之後排上、node affinity 與 cordon、ReadWriteOncePod、provisioner 沒在跑的 WaitForFirstConsumer；Multi-Attach 與舊 Pod 刪除後 attach；tar 串流備份、`tar tzvf`、`-i` 還原、沒有 `-i`；`kubectl cp` 兩個方向、資料夾與錯誤 |
| `tests/terminal-e38-sts.test.ts` | OrderedReady 的順序與 `rollout status`、`get sts`、事件；Parallel；標籤、hostname／subdomain、DNS、`/etc/hosts`；刪 Pod 後同名重建與資料；縮減的順序與保留的 PVC、再擴張；保留策略 Delete；partition 的滾動更新、status、OnDelete、restart、history 的說明；驗證與不可變；describe sts、`get all`；確定性；`kube-workload` 的 StatefulSet |
| `tests/support/storage-fixture.ts` | 只供測試：kub-38（kube-storage profile，E37 的機器加上兩個 provisioner、開機的 local-path class、team/db:1.0 與 team/pg:1.0、k8s/ 的 manifest） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `kube-storage`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', …, 'E38']`，KUB08 可以建立。

## 14. 沒有把握的地方（依記得的格式寫，並在此註明）

- **kubectl 1.32 的欄位**：`get pv`／`get pvc` 是否印 VOLUMEATTRIBUTESCLASS（這裡印，值 `<unset>`；1.29 起加入）、`-o wide` 的 VOLUMEMODE、PV 的 REASON 欄、`describe pv` 的 `VolumeAttributes:` 行與 Source 的縮排、`describe sc` 的 Annotations 用 `FormatLabels`（last-applied 的換行）、`describe sts` 的 `MaxUnavailable` 行與 Volume Claims 的排版、`describe pvc` 在 1.32 是否另有 `DataSource`／`VolumeAttributesClass` 行。
- **控制器的文字**：ExternalProvisioning 的長句、Provisioning／ProvisioningSucceeded 的來源（`<provisioner>_<名稱>-provisioner-0` 是模擬的 identity）、local-path 的 `configuration error, no node was specified`、`no volume plugin matched name: kubernetes.io/no-provisioner`、VolumeFailedDelete 的訊息、ClaimLost、Recycle 沒有事件、WaitForPodScheduled 的時機、`pv.kubernetes.io/bound-by-controller` 在 PV 與 PVC 上的時機。
- **排程器**：PreFilter 失敗的訊息格式（`0/3 nodes are available: <原因>. preemption: …`）、ReadWriteOncePod 的原因句與它的 preemption、`didn't find available persistent volumes to bind` 的用法、各原因的排序。
- **attach**：Multi-Attach 訊息的寫法（`Volume is already used by pod(s) …`）、SuccessfulAttachVolume 只在第一次 attach 到節點時。
- **API server 的文字**：PVC 的不可變句（1.29 起提到 volumeAttributesClassName）、`field can not be less than status.capacity`、擴充被拒時的 Forbidden 全文（真實的含 patch 內容）、StatefulSet 可以更新的欄位清單（是否含 revisionHistoryLimit）、`updateStrategy` 的 Go 結構文字、`serviceName` 是否必填（1.32 這裡不必填）、PV 來源不可變的句子。
- **StatefulSet**：`whenDeleted: Delete` 的 ownerReference 是否 `controller: true`、`whenScaled: Delete` 的 owner 改寫、Pod 標籤 `apps.kubernetes.io/pod-index`（1.28 起）、事件文字（`success` 與 `successful`）、rollout status 的 `partitioned roll out` 句在 partition 0 時也出現。
- **tar 與 cp**：kubectl cp 從 Pod 複製時是否顯示 tar 的 `Removing leading` 警告、遠端路徑不存在時 kubectl 的最後一行、目的地是既有資料夾時的錯誤（`open …: is a directory`）、`tar -xmf` 的擁有者。
- 版本見 [KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §8。
