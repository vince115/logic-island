# Kubernetes 與可靠性工程島（Kubernetes and Reliability Engineering Island）

> 2026-11-24 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、難度、先修）取自藍圖，由 `lessons.ts` 的 `kubeFromBlueprint` 讀入；每一課的活動與能力由逐課的 `KUB_SHAPES` 決定（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §2）。

教學方式沿用 `terminal` 能力：工作站上以 `kubectl` 操作一個**虛構的 kubeadm 叢集**（終端機引擎階段 E32 `cluster`、E33 `probes`、E34 `workloads`，見 [KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)、[KUB0_E33_PROBES](KUB0_E33_PROBES.md)、[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md)）。範例是在模擬叢集上重新執行後輸出完全一致的終端機紀錄，練習以重新執行學習者的指令、再檢查叢集的物件與 Pod 狀態評分。輸出依 kubectl v1.32 的格式撰寫（版本見 KUB0 §8，標記「待核對」）；Pod 與 ReplicaSet 的名稱是引擎算出的雜湊，課文的指令以 `kubectl get` 讀出，不寫死。藍圖為 architecture-diagram 的 KUB02 另有一段網路情境（`network-protocol`，同 DKR01、DKR02、SRV05）。控制平面的內部（etcd 的 Raft、scheduler 的評分、CRI 與 CNI）只在課文中以文字說明，不假裝成指令輸出。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| KUB01 | 容器編排概念<br>`container-orchestration` | 中級 | 30 分 | DKR09 | 2 台（workloads：tidal 團隊的工作站與四個節點的叢集、三個副本的 shop-web Deployment 與它取代的 Compose 檔；同一台工作站在 10:01 遇到 node-02 故障） | 6 段、4 段終端機紀錄、3 個終端機練習（讓 node-02 上的 Pod 換一個新的、維護前排空 node-01、等 Kubernetes 自己修好節點故障）、8 題 | **完整 v1.0.0** |
| KUB02 | Kubernetes 架構<br>`kubernetes-architecture` | 中級 | 30 分 | KUB01 | 1 台（cluster：ops-ws 工作站，唯讀探索三個節點的 kubeadm 叢集，再套用一個 Pod）＋ 1 個網路情境（`kubectl apply` 之後：API server、etcd、scheduler、kubelet 與 containerd） | 6 段、4 段終端機紀錄、2 個終端機練習（找出 Pod 被排到哪一台節點、建立 search 並等它真的就緒）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| KUB03 | Pod<br>`kubernetes-pods` | 中級 | 35 分 | KUB02 | 1 台（probes：ops-21 工作站與三個節點的叢集，~/pods 的 manifest；開始時 orders 在 CrashLoopBackOff、catalog 卡在 Init:CrashLoopBackOff） | 6 段、5 段終端機紀錄、4 個終端機練習（寫一份帶就緒探針的 Pod manifest、哪一個容器在重新啟動、修好 orders 的存活探針、卡在初始化的 catalog）、8 題 | **完整 v1.0.0** |
| KUB04 | Deployment 與 ReplicaSet<br>`deployments-and-replicasets` | 中級 | 40 分 | KUB03 | 4 台（workloads：shop 團隊的工作站 ops-ws 與三個節點的叢集，catalog Deployment 與同標籤的 bare pod catalog-manual；另 3 台給練習：cart 上線、活動擴縮與除錯、收養的報告） | 6 段、5 段終端機紀錄、4 個終端機練習（寫一份 Deployment 讓 cart 上線、把活動的副本數寫進 manifest 並套用、把一個 catalog Pod 留下來除錯、手動建立的 Pod 被誰收養了）、8 題 | **完整 v1.0.0** |

（機器、叢集、映像檔、使用者與 IP 都是虛構的；練習的答案由引擎重播算出，不寫在課程資料裡。）

## 單元

| 單元 | 課程 |
|---|---|
| 編排的觀念與叢集架構 | KUB01–KUB02 |
| Pod 與工作負載 | KUB03–KUB04 |

## 模擬器的已知差異（課文已說明或避開）

- **`kubectl delete pod` 在故障的節點上立即返回**：真實叢集裡，節點的 kubelet 失聯時，`kubectl delete pod`（含 `--timeout`）會等到逾時，Pod 停在 Terminating；模擬環境立即返回。KUB01 的節點故障練習只等待與觀察，不依賴刪除的等待時間。
- **`kubectl get events --field-selector involvedObject.kind=…` 不支援**：E32–E34 的 `--field-selector` 只接受課程用到的欄位；課文改以 `kubectl get events` 加上 `kubectl describe` 的 Events 讀事件。
- **原生 sidecar、共用的 Volume 與 Pod 內以 localhost 互連都沒有模擬**：KUB03 的多容器 Pod 以 init container 與一般的 sidecar 容器呈現（`logs -c`、`exec -c`、同一個 IP 與 hostname）；`restartPolicy: Always` 的原生 sidecar、`emptyDir` 的共用檔案與容器之間的 localhost 流量只在課文中說明。
- **manifest 裡 `sh -c` 字串含有 `'` 會讓解析失敗**：E32 的 YAML 子集遇到 `command: ["sh", "-c", "…'…"]` 這類帶單引號的字串時無法解析；課程的 manifest 都避開單引號。
- 時間的模型是固定、文件化的（KUB0 §10）：節點失聯 50 秒後 NotReady（`--node-monitor-grace-period`，v1.32）、300 秒的 toleration 後驅逐；就緒探針、退避與優雅終止的秒數依 E33、E34 文件。真實叢集的 informer 延遲不會固定。
- 控制平面的內部、CNI 與排程的評分只在課文說明（KUB0 §9）。

## 批次

KUB-0（登錄、`KUB_SHAPES`、E32 `cluster`，沒有課）之後：

- **KUB-1**（本批，2026-11-24）：KUB01–KUB04，終端機引擎階段 E33 `probes` 與 E34 `workloads`（`KUBE_STAGES_BUILT = ['E32', 'E33', 'E34']`），島嶼移入 `ISLAND_IDS`（`devops-cicd` 之後），沒有預備中的島嶼。KUB01、KUB03、KUB04 是 `terminal-sim`，KUB02 是 `network-sequence`；活動登錄裡 `terminal-sim` 與 `network-sequence` 的島嶼清單加上本島，`architecture-diagram` 的島嶼清單少了本島（仍經由 DB19 維持已實作），`cluster-sim` 仍是規劃中（KUB05–KUB11 的藍圖活動）。
- 之後依 KUB0 §4：KUB05–07（E35、E36、E37）、KUB08–10（E38、E39、E40）、KUB11–14（D5、D6）、KUB15 綜合專題（單獨一批）。每一批先完成它需要的階段，再寫課；課程編號即位置，依序連續發布。

課程狀態與 3D 地景分離：Kubernetes 與可靠性工程島的 `mapState` 仍是 `'planned'`。
