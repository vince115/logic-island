# Kubernetes 與可靠性工程島（Kubernetes and Reliability Engineering Island）

> 2026-11-24 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、難度、先修）取自藍圖，由 `lessons.ts` 的 `kubeFromBlueprint` 讀入；每一課的活動與能力由逐課的 `KUB_SHAPES` 決定（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §2）。

教學方式沿用 `terminal` 能力：工作站上以 `kubectl`（KUB09 加上 `helm`）操作一個**虛構的 kubeadm 叢集**（終端機引擎階段 E32 `cluster`、E33 `probes`、E34 `workloads`、E35 `kube-net`、E36 `kube-config`、E37 `ingress`、E38 `kube-storage`、E39 `helm`、E40 `autoscaling`，見 [KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)、[KUB0_E33_PROBES](KUB0_E33_PROBES.md)、[KUB0_E34_WORKLOADS](KUB0_E34_WORKLOADS.md)、[KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md)、[KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md)、[KUB0_E37_INGRESS](KUB0_E37_INGRESS.md)、[KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md)、[KUB0_E39_HELM](KUB0_E39_HELM.md)、[KUB0_E40_AUTOSCALING](KUB0_E40_AUTOSCALING.md)）。範例是在模擬叢集上重新執行後輸出完全一致的終端機紀錄，練習以重新執行學習者的指令、再檢查叢集的物件與 Pod 狀態評分。輸出依 kubectl v1.32 的格式撰寫（版本見 KUB0 §8，標記「待核對」）；Pod 與 ReplicaSet 的名稱是引擎算出的雜湊，課文的指令以 `kubectl get` 讀出，不寫死。藍圖為 architecture-diagram 的 KUB02 與 request-path 的 KUB07 另有一段網路情境（`network-protocol`，同 DKR01、DKR02、SRV05、SRV07）。控制平面的內部（etcd 的 Raft、scheduler 的評分、CRI 與 CNI）只在課文中以文字說明，不假裝成指令輸出。KUB12–KUB14 是 `devops-explorer` 的 `monitoring-dashboard` 課（藍圖的 monitoring-dashboard 與 metric-explorer，見 [CICD0_DEVOPS_CAPABILITY](CICD0_DEVOPS_CAPABILITY.md) §10.3–§10.6）：儀表板與告警規則（D3）、日誌（D4）、分散式追蹤（D5）與 SLO（D6）的數字都是示意資料，練習的答案由 `src/lib/devops` 算出；KUB12 另有終端機的叢集（同 CICD12 的形狀），KUB13、KUB14 沒有終端機（同 CICD11）。這是 `devops-cicd` 以外第一批使用 `devops-explorer` 的課。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| KUB01 | 容器編排概念<br>`container-orchestration` | 中級 | 30 分 | DKR09 | 2 台（workloads：tidal 團隊的工作站與四個節點的叢集、三個副本的 shop-web Deployment 與它取代的 Compose 檔；同一台工作站在 10:01 遇到 node-02 故障） | 6 段、4 段終端機紀錄、3 個終端機練習（讓 node-02 上的 Pod 換一個新的、維護前排空 node-01、等 Kubernetes 自己修好節點故障）、8 題 | **完整 v1.0.0** |
| KUB02 | Kubernetes 架構<br>`kubernetes-architecture` | 中級 | 30 分 | KUB01 | 1 台（cluster：ops-ws 工作站，唯讀探索三個節點的 kubeadm 叢集，再套用一個 Pod）＋ 1 個網路情境（`kubectl apply` 之後：API server、etcd、scheduler、kubelet 與 containerd） | 6 段、4 段終端機紀錄、2 個終端機練習（找出 Pod 被排到哪一台節點、建立 search 並等它真的就緒）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| KUB03 | Pod<br>`kubernetes-pods` | 中級 | 35 分 | KUB02 | 1 台（probes：ops-21 工作站與三個節點的叢集，~/pods 的 manifest；開始時 orders 在 CrashLoopBackOff、catalog 卡在 Init:CrashLoopBackOff） | 6 段、5 段終端機紀錄、4 個終端機練習（寫一份帶就緒探針的 Pod manifest、哪一個容器在重新啟動、修好 orders 的存活探針、卡在初始化的 catalog）、8 題 | **完整 v1.0.0** |
| KUB04 | Deployment 與 ReplicaSet<br>`deployments-and-replicasets` | 中級 | 40 分 | KUB03 | 4 台（workloads：shop 團隊的工作站 ops-ws 與三個節點的叢集，catalog Deployment 與同標籤的 bare pod catalog-manual；另 3 台給練習：cart 上線、活動擴縮與除錯、收養的報告） | 6 段、5 段終端機紀錄、4 個終端機練習（寫一份 Deployment 讓 cart 上線、把活動的副本數寫進 manifest 並套用、把一個 catalog Pod 留下來除錯、手動建立的 Pod 被誰收養了）、8 題 | **完整 v1.0.0** |
| KUB05 | Service 與服務發現<br>`services-and-service-discovery` | 中級 | 40 分 | KUB04 | 5 台（kube-net：shop 團隊的工作站 ops-ws 與三個節點的叢集，catalog 與 frontend 兩個 Deployment、default 與 ops 命名空間的用戶端 Pod；另 1 台有 10.0.0.200–10.0.0.209 的負載平衡位址池，3 台給練習：還沒有 Service 的 cart、連線被拒絕的 catalog、以 NodePort 對外的 frontend） | 6 段、5 段終端機紀錄、4 個終端機練習（替 cart 建立 ClusterIP Service、修好沒有端點的 Service、用固定的 NodePort 讓叢集外連到 frontend、查出 frontend 在節點上開的埠）、8 題 | **完整 v1.0.0** |
| KUB06 | ConfigMap 與 Secret<br>`configmaps-and-secrets` | 中級 | 40 分 | KUB04、CICD08 | 5 台（kube-config：tix 團隊的工作站 tix-ws，ticket-api 的設定與資料庫密碼寫死在 Deployment 裡、上週以 stringData 套用的 Secret api-db；另 4 台給練習：seat-map、改成 debug 還沒套用的 api-config.yaml、report 的 API Token、舊報表工作的資料庫 Secret） | 6 段、5 段終端機紀錄、4 個終端機練習（把 seat-map 寫死的設定搬進 ConfigMap、讓 ticket-api 拿到新的 LOG_LEVEL、把 report 的 Token 掛成唯讀檔案且 manifest 不留明文、讀出舊報表工作實際拿到的資料庫密碼）、8 題 | **完整 v1.0.0** |
| KUB07 | Ingress 與 Gateway API<br>`ingress-and-gateway-api` | 進階 | 45 分 | KUB05、SRV07 | 5 台（ingress：shop 團隊的工作站 ops-ws，叢集裝了 ingress-nginx v1.12.0 與 Gateway API；另 4 台給練習：只有 ClusterIP 的 frontend 與 catalog、只有 HTTP 的 shop.example.test、打不開的 ops.example.test、已就緒的 Gateway shop-gw 與 catalog 2.2）＋ 1 個網路情境（一個 HTTPS 請求進入叢集：DNS、LoadBalancer 位址、ingress-nginx 與 catalog 的 Pod） | 6 段、5 段終端機紀錄、4 個終端機練習（依路徑分給兩個 Service、加上 HTTPS、修好打不開的 ops.example.test、用 HTTPRoute 把一成流量給 catalog 2.2）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| KUB08 | Persistent Volume 與有狀態應用<br>`persistent-volumes` | 進階 | 45 分 | KUB04、DKR07 | 5 台（kube-storage：shop 團隊的工作站 ops-ws 與三個節點的叢集，兩個虛構的 provisioner：節點本機的預設 class local-path（WaitForFirstConsumer、Delete）與可掛載網路磁碟的 fast（Immediate、可擴充），管理員建立的 NFS PV pv-media；另 4 台給練習：把上傳檔案放在 emptyDir 的 uploads、PVC 一直 Pending 的 reports、只有 1 個副本的 stockdb、資料在 node-02 本機磁碟上的 stockdb-0） | 6 段、5 段終端機紀錄、4 個終端機練習（讓 uploads 的檔案撐過 Pod 的刪除、修好卡在 Pending 的 PVC、把 stockdb 擴充成 3 個副本、把 stockdb-0 備份到工作站再還原到新的 PVC）、8 題 | **完整 v1.0.0** |
| KUB09 | Helm 套件管理<br>`helm-charts` | 中級 | 40 分 | KUB06 | 6 台（helm：shop 團隊的工作站 ops-ws，~/shop/catalog 是團隊的 chart（0.4.0、appVersion 2.2）與 staging、prod 的 values 檔，平台組虛構的 chart 儲存庫 https://charts.example.test；另 1 台的 prod 有上週以 chart 0.3.0 安裝的 release，4 台給練習：還沒部署到 staging 的 catalog、同事改過的 cart chart、要從 2.2 升到 2.3 的 prod、prod 與 staging 各有歷史的 catalog） | 7 段、5 段終端機紀錄、4 個終端機練習（用 values-staging.yaml 把 catalog 裝進 staging、修好 cart chart 的樣板再安裝、失敗就自動退回的正式環境升級、查出 prod 目前部署的 revision）、8 題 | **完整 v1.0.0** |
| KUB10 | 自動擴展<br>`kubernetes-autoscaling` | 進階 | 40 分 | KUB04 | 5 台（autoscaling：shop 團隊的工作站 ops-ws 與三個節點（各 2 個 CPU）的叢集與 metrics-server，特賣讓 catalog 的流量上升；另 4 台給練習：HPA 一直顯示 &lt;unknown&gt; 的 cart、仍固定 2 個副本的 catalog、副本數每分鐘上上下下的 catalog、值班時讀出 catalog 此刻的使用率） | 6 段、5 段終端機紀錄、4 個終端機練習（讓 cart 的 HPA 算得出使用率、特賣開始時替 catalog 建立 HPA、讓 catalog 的副本數不再忽大忽小、HPA 此刻算出的使用率）、8 題 | **完整 v1.0.0** |
| KUB11 | 滾動更新與回滾<br>`rolling-updates-and-rollbacks` | 中級 | 40 分 | KUB04、CICD10 | 4 台（kube-net：shop 團隊的工作站 ops-ws 與三個節點的叢集，catalog 2.2 有 4 個副本、以 /healthz 的就緒探針把關，report 用 Recreate；另 3 台給練習：要上線 2.3 而先調整滾動更新的 catalog、要更新到永遠不就緒的 2.4 的 catalog、回滾演練） | 6 段、5 段終端機紀錄、3 個終端機練習（把 catalog 調成不中斷的更新再上線 2.3、2.4 卡住了：判斷之後回滾到上一個 revision、回滾之後的 revision 用哪個 Image）、7 題 | **完整 v1.0.0** |
| KUB12 | 叢集監控<br>`cluster-monitoring` | 中級 | 40 分 | KUB05、CICD11 | 1 台（autoscaling：shop 團隊的工作站 ops-ws 與三個節點的叢集與 metrics-server，14:00 時 cart 因 OOMKilled 反覆重啟、mailer 缺少 SMTP_HOST 而 Error、recommend 因 Insufficient cpu 而 Pending，catalog 提供 Prometheus 的 /metrics）＋devops-explorer（D3）的 2 個儀表板（08:00–14:00 的節點 CPU、Pending 的 Pod、重啟次數與結帳） | 6 段、5 段終端機紀錄、3 個終端機練習（重啟最多的 Pod 與原因、先調整 requests 而不急著加節點、從 /metrics 找出錯誤的計數）與 3 個儀表板練習（節點 CPU 持續 10 分鐘的規則、重啟次數的兩條規則、寫一條容量警告）、8 題 | **完整 v1.0.0** |
| KUB13 | 可觀測性：指標、日誌與追蹤<br>`observability-metrics-logs-traces` | 進階 | 40 分 | KUB12、CICD12 | devops-explorer（D3、D4、D5）：shop 團隊在 Kubernetes 上的結帳服務一小時的儀表板（p95 附範例追蹤）、帶 trace_id 的 18 筆日誌、4 個課程寫的追蹤與 200 次產生的結帳、一天 500 次結帳的取樣與基數樣本 | 6 段、7 個練習（最慢的請求慢在哪裡、從儀表板的尖峰到瀑布圖、N+1 迴圈裡的自身時間、從客訴的日誌追到追蹤、只用頭部取樣 10%、留下該留的追蹤、修好一個高基數的指標）、7 題 | **完整 v1.0.0** |
| KUB14 | SLI、SLO 與 SLA<br>`sli-slo-sla` | 進階 | 40 分 | KUB13 | devops-explorer（D6）：虛構的市立圖書館線上借閱服務 loan-api 的 3 個 SLO 情境（這個月 30 天每小時、一天每 5 分鐘的消耗率告警、上個月的資料庫故障與 SLA 補償） | 6 段、6 個練習（壞版本用掉多少預算、消耗率與還能撐多久、快速與緩慢兩條告警、設計會呼叫人的消耗率告警、上個月的預算、SLA 的補償）、8 題 | **完整 v1.0.0** |
| KUB15 | Kubernetes 與可靠性工程島綜合專題：SRE 實務演練<br>`kubernetes-reliability-capstone` | 進階 | 90 分 | KUB07、KUB08、KUB09、KUB10、KUB11、KUB14、CICD14 | 4 台（autoscaling：shop 團隊的工作站 ops-ws 與三個節點的叢集、ingress-nginx 與 metrics-server，catalog 的 chart 在各關的狀態：production 還沒有 catalog、固定 3 個副本而流量上升、等著發布永遠不就緒的 2.3、node-02 預定 10:02 斷電的混沌演練）＋devops-explorer 的 1 個 SLO 情境（D6）、1 個演練儀表板與事故時間線（D3）與 1 組範例追蹤（D5） | challenge-stages 六關、8 段課文、4 段終端機紀錄、5 個終端機練習與 5 個探索器練習（以 chart 與 production 的 values 部署並從入口驗收、HPA 與 maxUnavailable 0、以 --atomic 自動退回、一次發布用掉的錯誤預算、依 SLO 的消耗率呼叫、斷電那一分鐘的追蹤、依手冊恢復容量、演練的四個時間與等級、把手動步驟換成 30 秒的容忍時間）、8 題 | **完整 v1.0.0** |

（機器、叢集、映像檔、使用者、IP 與儀表板、日誌、追蹤、SLO 的數字都是虛構的；練習的答案由引擎重播或 `src/lib/devops` 算出，不寫在課程資料裡。）

## 單元

| 單元 | 課程 |
|---|---|
| 編排的觀念與叢集架構 | KUB01–KUB02 |
| Pod 與工作負載 | KUB03–KUB04 |
| 服務、設定與入口 | KUB05–KUB07 |
| 儲存、套件與擴展 | KUB08–KUB10 |
| 發布、監控與可靠性 | KUB11–KUB14 |
| 綜合專題 | KUB15 |

## 模擬器的已知差異（課文已說明或避開）

- **`kubectl delete pod` 在故障的節點上立即返回**：真實叢集裡，節點的 kubelet 失聯時，`kubectl delete pod`（含 `--timeout`）會等到逾時，Pod 停在 Terminating；模擬環境立即返回。KUB01 的節點故障練習只等待與觀察，不依賴刪除的等待時間；KUB15 的處理手冊照真實叢集的做法加上 `--wait=false`（KUB-5）。
- **`kubectl get events --field-selector involvedObject.kind=…` 不支援**：E32–E34 的 `--field-selector` 只接受課程用到的欄位；課文改以 `kubectl get events` 加上 `kubectl describe` 的 Events 讀事件。
- **原生 sidecar、共用的 Volume 與 Pod 內以 localhost 互連都沒有模擬**：KUB03 的多容器 Pod 以 init container 與一般的 sidecar 容器呈現（`logs -c`、`exec -c`、同一個 IP 與 hostname）；`restartPolicy: Always` 的原生 sidecar、`emptyDir` 的共用檔案與容器之間的 localhost 流量只在課文中說明。
- **manifest 裡 `sh -c` 字串含有 `'` 會讓解析失敗**：E32 的 YAML 子集遇到 `command: ["sh", "-c", "…'…"]` 這類帶單引號的字串時無法解析；課程的 manifest 都避開單引號。
- 時間的模型是固定、文件化的（KUB0 §10）：節點失聯 50 秒後 NotReady（`--node-monitor-grace-period`，v1.32）、300 秒的 toleration 後驅逐；就緒探針、退避與優雅終止的秒數依 E33、E34 文件。真實叢集的 informer 延遲不會固定。
- 控制平面的內部、CNI 與排程的評分只在課文說明（KUB0 §9）。
- **後面的開機 manifest 改過的 ConfigMap，Pod 第一次啟動時就已經是新版本**（KUB-2，E36）：機器的開機 manifest 全部套用之後才解析環境變數，所以 Pod 在開機時拿不到 ConfigMap 的舊版本。需要「環境變數仍是舊值」的情境（KUB06），改由學習者在提示字元下修改並套用。
- **X-Real-IP 與 X-Forwarded-For 以 controller Pod 的位址到達後端**（KUB-2，E37）：真實的 ingress-nginx 在 `externalTrafficPolicy: Cluster` 下通常也看不到用戶端位址，但值會是節點經過 SNAT 之後的位址；模擬環境一律是 controller Pod 的位址，課文不依賴這兩個標頭的值。
- **`kubectl api-resources` 不列出 endpointslices**（KUB-2，E35）：`kubectl get endpointslices` 可以使用，只是不在 `api-resources` 的清單裡；課文不以 `api-resources` 找它。
- **kube-proxy 依端點 IP 的順序輪流**（KUB-2，E35）：真實的 iptables 模式是隨機挑選端點；KUB05 的課文說明了這一點，沒有練習依賴由哪一個 Pod 回應。`externalTrafficPolicy` 一律是 Cluster，`Local` 只在課文說明。
- **只被 Pending 的 Pod 使用的 PVC，刪除後停在 Terminating**（KUB-3，E38）：模擬環境的 `kubernetes.io/pvc-protection` 把每個還沒結束的 Pod（包括還沒排程的 Pending Pod）都算成使用者，所以 PVC 要等那個 Pod 消失才真的刪除（真實的行為待核對）。KUB08 的課文以 `kubectl delete -f` 同時刪掉 PVC 與使用它的工作負載，不依賴這一點。
- **`kubectl patch`、`kubectl exec deploy/x` 與 `ls -R` 沒有模擬**（KUB-3，E38）：課程的指令都不用它們；`kubectl patch` 只在課文說明，`exec` 先以 `kubectl get` 讀出 Pod 名稱。
- **控制器不在兩份開機 manifest 之間執行**（KUB-3，E38）：後面的開機 manifest 把 StatefulSet 縮小時，不會留下縮減前那些 Pod 的 PVC；需要「縮減後 PVC 仍保留」的情境，由學習者在提示字元下縮減。
- **開機時的 Helm 升級只留下最後一個 revision 的 ReplicaSet**（KUB-3，E39）：開機時安裝與升級的 release 在 `helm history` 與 release 的 Secret 裡每個 revision 都在，但叢集只有最後一個 revision 的 ReplicaSet；課文不從開機的歷史讀舊的 ReplicaSet。
- **加上 `--wait` 的升級只改了副本數或設定時，在同一秒返回**（KUB-3，E39）：沒有要等的新 Pod 時，模擬環境的就緒檢查立刻成立；課文與練習不依賴 `--wait` 花掉的秒數。
- **新的 Pod 一就緒就分到負載，即使它還沒有指標**（KUB-3，E40）：宣告在 Service 的負載依就緒的端點平均分配，而新 Pod 要過兩次刮取（最多 30 秒）才有指標，這段時間 HPA 的使用率只由已有指標的 Pod 算出。
- **節點的自動擴展只在課文說明**（KUB-3，E40）：Cluster Autoscaler、Karpenter 這類節點擴展與 VPA 沒有模擬；KUB10 在終端機只呈現 HPA 擴出、叢集放不下而 Pending（Insufficient cpu）的 Pod。
- **開機時 Deployment 沒有 revision 歷史**（KUB-4，E34）：機器的開機 manifest 在控制器執行之前套用，所以 Deployment 開機時只有一個 revision；KUB11 的 `rollout history`、`undo` 與 `--to-revision` 都由課文與練習在提示字元下的指令建立。
- **`kubectl get events --field-selector type=Warning` 與 `kubectl set resources` 沒有模擬**（KUB-4）：`get events` 的 `--field-selector` 只接受 `metadata.*` 欄位，KUB12 改以 `kubectl events --types=Warning` 篩選，`--field-selector type=Warning` 只在課文提到；調整 requests 以 `sed` 修改 YAML 再 `kubectl apply`。
- **事件在模擬環境裡不會過期**（KUB-4）：真實叢集的事件預設一小時後刪除（kube-apiserver 的 `--event-ttl`），KUB12 在課文說明這一點，沒有練習依賴事件消失。
- **一行輸入最多 500 個字元**（KUB-4）：長的 manifest 不以 heredoc 打進去，而是以 `sed` 修改工作站上已有的 YAML 檔。
- **D3 的儀表板最多 360 分鐘**（KUB-4，D3）：KUB12 的叢集儀表板是 08:00–14:00 的六個小時；更長的期間只在課文說明。
- **`kubectl wait` 等不到節點的狀態**（KUB-5）：`kubectl wait node/… --for=condition=Ready=false` 這類對節點條件的等待在模擬環境不成立；模擬的時鐘只在 `sleep` 時前進，KUB15 以 `sleep` 等到 NotReady 與驅逐的時間點，再以 `kubectl get nodes` 查看。
- **Helm 升級拿掉 `replicas`、把 Deployment 交給 HPA 時，副本數短暫變回 1**（KUB-5，E39–E40）：模擬引擎套用不再寫 `replicas` 的 Deployment 時，欄位被移除、先以預設值 1 計算，要等 HPA 的下一次同步才恢復它算出的副本數。這和 Helm 3 的三方合併 patch 一樣（真實叢集上同樣可能短暫掉到 1），不是模擬的偏差；KUB15 的練習在升級後先 `sleep` 再讀副本數，不依賴這一刻的數字。

## 批次

KUB-0（登錄、`KUB_SHAPES`、E32 `cluster`，沒有課）之後：

- **KUB-1**（2026-11-24）：KUB01–KUB04，終端機引擎階段 E33 `probes` 與 E34 `workloads`（`KUBE_STAGES_BUILT = ['E32', 'E33', 'E34']`），島嶼移入 `ISLAND_IDS`（`devops-cicd` 之後），沒有預備中的島嶼。KUB01、KUB03、KUB04 是 `terminal-sim`，KUB02 是 `network-sequence`；活動登錄裡 `terminal-sim` 與 `network-sequence` 的島嶼清單加上本島，`architecture-diagram` 的島嶼清單少了本島（仍經由 DB19 維持已實作），`cluster-sim` 仍是規劃中（KUB05–KUB11 的藍圖活動）。
- **KUB-2**（2026-11-24）：KUB05–KUB07，終端機引擎階段 E35 `kube-net`（Service、Endpoints 與 EndpointSlice、叢集 DNS、NodePort、LoadBalancer 與位址池、port-forward）、E36 `kube-config`（ConfigMap、Secret、env／envFrom／Volume 與 subPath、imagePullSecrets、immutable）與 E37 `ingress`（ingress-nginx、Ingress 的 TLS、Gateway API；`KUBE_STAGES_BUILT = ['E32', 'E33', 'E34', 'E35', 'E36', 'E37']`），單元「服務、設定與入口」。KUB05、KUB06 是 `terminal-sim`，KUB07 是 `network-sequence`（藍圖的 request-path）；活動登錄的島嶼清單不變（`terminal-sim`、`network-sequence` 已有本島，`cluster-sim` 仍是規劃中，KUB08–KUB11 的藍圖活動），`request-path` 仍是規劃中（規劃中的 `network-request` 實驗室保留它，DKR-5 的規則），已沒有目錄課程使用它，島嶼清單改由藍圖大綱列出：`network-servers` 與本島。
- **KUB-3**（2026-11-24）：KUB08–KUB10，終端機引擎階段 E38 `kube-storage`（PersistentVolume、PersistentVolumeClaim、StorageClass 與虛構的 provisioner、存取模式與回收策略、StatefulSet、以 `kubectl exec … tar` 與 `kubectl cp` 備份與還原）、E39 `helm`（Helm v3.16 的子集：Go 樣板引擎、chart 與 values、release 與 revision、install／upgrade／rollback 與 `--wait`、`--atomic`、虛構的 chart 儲存庫）與 E40 `autoscaling`（requests 與 limits、QoS、metrics-server 與 `kubectl top`、HorizontalPodAutoscaler 與宣告的負載；`KUBE_STAGES_BUILT = ['E32', 'E33', 'E34', 'E35', 'E36', 'E37', 'E38', 'E39', 'E40']`），單元「儲存、套件與擴展」。三課都是 `terminal-sim`；活動登錄的島嶼清單不變：`cluster-sim` 仍是規劃中，KUB11 是最後一堂還沒寫的 cluster-sim 課，KUB-4 寫好 KUB11 之後這個項目從活動登錄消失（KUB0 §3）。
- **KUB-4**（2026-11-24）：KUB11–KUB14，`devops-explorer` 階段 D5 `traces`（分散式追蹤：span 的樹與產生器、自身時間、關鍵路徑與瓶頸、日誌與範例追蹤的連結、頭部與尾端取樣、每天的 span、基數）與 D6 `slo`（SLI、錯誤預算、消耗率、預算用完的時刻、SLA 的補償表、長短兩個視窗的消耗率告警；`DEVOPS_STAGES_BUILT = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']`），單元「發布、監控與可靠性」。KUB11 是 `terminal-sim`（kube-net，不加可選的 devops-explorer），KUB12 是 `monitoring-dashboard` 加上終端機（autoscaling，同 CICD12），KUB13、KUB14 是只有 devops-explorer 的 `monitoring-dashboard`（同 CICD11）。活動登錄：KUB11 是最後一堂藍圖為 cluster-sim 的課，`cluster-sim` 沒有實驗室，因此從活動登錄消失（KUB0 §3，活動 89 → 88）；`metric-explorer` 仍是規劃中，只剩 `machine-learning`（ML19–ML22）；`monitoring-dashboard` 的島嶼清單不變（`ai-engineering`、`devops-cicd`、本島），已發布的課是 CICD11、CICD12 與 KUB12–KUB14。
- **KUB-5**（本批，2026-11-24）：綜合專題 KUB15（challenge-stages，用 E32–E40 與 devops-explorer 的 D3、D5、D6 已有的一切，不新增引擎階段），單元「綜合專題」，全島 15／15 完成。活動登錄的島嶼清單不變（`challenge-stages` 的清單已由藍圖大綱列出本島）。

課程狀態與 3D 地景分離：Kubernetes 與可靠性工程島的 `mapState` 仍是 `'planned'`。
