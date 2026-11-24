# KUB-1 引擎階段 E33：`probes` profile（`kube-probe-spec.ts`、`kube-health.ts`、`kube-probes.ts`、`kube-stop.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E32 的叢集（[KUB0_E32_CLUSTER](KUB0_E32_CLUSTER.md)）上加上 liveness、readiness、startup 探針，課程宣告的隨時間變化的健康狀態，preStop hook、SIGTERM 與寬限期，以及 Terminating。E1–E32 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`cluster` profile 的輸出不變，探針、`lifecycle` 在它之下仍是「要到引擎階段 E33 才模擬」。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `PROBES_PROFILE`（RANK 33） | `cluster` 的一切加上 feature `probes`，**沒有新指令**。課程機器寫 `profile: 'probes'` |
| profile 以下 | 探針與 `lifecycle` 欄位：`（模擬環境：spec.containers[0].livenessProbe 要到引擎階段 E33 才模擬）`（E32 原文）；課程資料的 `kube.health`：`kube: health needs the probes profile (engine stage E33)`；`kubectl delete` 仍是立即刪除 |
| 開關 | `KubeState.probes`（`buildKube` 在 probes profile 設定）。kubectl 與 settle 以它判斷，因此 `cluster` 的叢集完全走 E32 的路徑 |

程式的分工（每個檔案都不到 210 行）：`kube-probe-spec.ts`（探針與 hook 的讀取、預設值、驗證、describe 的一行）、`kube-health.ts`（課程的 `health` 與探針、hook 碰到的服務）、`kube-probes.ts`（kubelet 的探針 worker）、`kube-stop.ts`（killContainer 與 Pod 的優雅刪除）。既有檔案只多了 probes 才走到的分支：`kube-model.ts`（`CSim.probe`、`stopping`、`plan.restart`、`KubeState.probes`／`health`）、`kube-manifest.ts`（E33 的嚴格解碼 schema、`intstr`）、`kube-write.ts`、`kube-api.ts`（預設值）、`kube-kubelet.ts`、`kube-image.ts`、`kube-settle.ts`、`kube-status.ts`、`kube-describe.ts`、`kubectl.ts`（`Flags.off`）、`kubectl-apply.ts`、`kube-lesson.ts`、`server-lesson.ts`、`lesson.ts`、`shell.ts`。

## 2. 探針與 hook 的欄位（`kube-probe-spec.ts`、`kube-manifest.ts`）

- **嚴格解碼**：probes profile 的 Container 有 `Probe`（`exec`、`httpGet`、`tcpSocket`、`grpc`、`initialDelaySeconds`、`timeoutSeconds`、`periodSeconds`、`successThreshold`、`failureThreshold`、`terminationGracePeriodSeconds`）、`HTTPGetAction`（`path`、`port`、`host`、`scheme`、`httpHeaders`）、`TCPSocketAction`、`ExecAction`、`Lifecycle`（`preStop`、`postStart`）、`LifecycleHandler`（`exec`、`httpGet`、`tcpSocket`、`sleep`）。拼錯是 `strict decoding error: unknown field "spec.containers[0].livenessProbe.httpGet.pth"`；`port` 是 int 或字串（`intstr.IntOrString`）。`cluster` profile 仍用 E32 的 schema（探針是 `any`），所以 E32 的訊息不變。
- **預設值**（API server 的 SetDefaults）：`timeoutSeconds: 1`、`periodSeconds: 10`、`successThreshold: 1`、`failureThreshold: 3`；`httpGet` 補 `path: /`、`scheme: HTTP`（探針與 hook 都是）；`initialDelaySeconds` 不補（0）。`terminationGracePeriodSeconds: 30` 是 E32 已有的。
- **驗證**（接在 E32 的欄位錯誤之後）：處理方式要剛好一種（`Required value: must specify a handler type`、`Forbidden: may not specify more than 1 handler type`）；數字不可為負（`must be greater than or equal to 0`）；liveness 與 startup 的 `successThreshold` 只能是 1（`Invalid value: 2: must be 1`）；埠 1–65535 或 IANA 名稱；`exec.command` 必填；`scheme` 是 HTTP 或 HTTPS；init container 不能有探針或 `lifecycle`（`Forbidden: may not be set for init containers without restartPolicy=Always`）；`spec.terminationGracePeriodSeconds` 不可為負；`sleep.seconds` 不可為負。
- **只在課文說明**（`（模擬環境：… 要到引擎階段 （課文說明） 才模擬）`，同 E32 的 `affinity`）：`grpc`、探針的 `host`、`scheme: HTTPS`、探針自己的 `terminationGracePeriodSeconds`、`postStart`、preStop 的 `tcpSocket` 與帶 `host`／HTTPS 的 `httpGet`。
- Pod 的 spec 仍不可變：已經建立的 Pod 改探針是 E32 的 Forbidden。

## 3. 探針碰到什麼（`kube-health.ts`）

| 動作 | 內容 |
|---|---|
| 服務 | 容器的主程式是 Image 自己的（沒有 `command`／`args`）時用 Image 的 E12 `http`（埠與 responder）；否則用 `docker.programs` 裡那個程式的 `http`。會聽的埠：`http` 的埠，加上 service Image 的 `expose`。容器這一次啟動之後 `listenAfter`（課程的 `health`）或 E23 的 `ready` 秒之前，所有埠都拒絕連線 |
| `httpGet` | `GET path`，標頭 `Host: IP:埠`、`User-Agent: kube-probe/1.32`、`Accept: */*`、`Connection: close` 與 `httpHeaders`；200–399 成功，其他是 `HTTP probe failed with statuscode: 500`；沒在聽是 `Get "http://10.244.2.2:8080/healthz": dial tcp 10.244.2.2:8080: connect: connection refused`；route 的 `delay`（或 health 的 `delay`）≥ `timeoutSeconds` 是 `Get "…": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`；在聽但不是 HTTP 的埠是 `Get "…": EOF` |
| `tcpSocket` | 有在聽就成功，否則 `dial tcp IP:埠: connect: connection refused` |
| `exec` | 先找 `health.exec`（同樣的字、在時間窗內）：它的 `exit` 與 `output`、`seconds`；否則在容器的檔案（Image 加上寫入層）以 docker.ts 的 `runIn` 執行，非 0 失敗，輸出就是訊息（例：`cat: /tmp/healthy: No such file or directory`）。找不到執行檔是「errored」（見 §4）。`seconds` ≥ timeout 是 `command "…" timed out` |
| 具名的埠 | 依容器的 `ports[].name` 找；找不到是 errored：`unable to find port "web" in container p` |
| 寫入層 | probes profile 上，主程式的 `sh -c "touch /tmp/healthy; sleep 3600"` 寫的檔案留在容器的寫入層（E32 只保留 `kubectl exec` 寫的），所以 `kubectl exec … -- rm /tmp/healthy` 會讓 exec 探針失敗 |

## 4. 探針 worker（`kube-probes.ts`）

- 容器每一次開始執行（新的 container ID），每個探針有一個 worker：第一次在 **啟動 + `initialDelaySeconds`**，之後每 `periodSeconds` 一次。
- 結果連續 `successThreshold` 次成功或 `failureThreshold` 次失敗才改變狀態（prober/worker.go 的 resultRun）。每一次失敗都是一則 `Warning Unhealthy`（kubelet）：`Liveness probe failed: …`、`Readiness probe failed: …`、`Startup probe failed: …`，相同訊息計數（`x3 over 10s`）。errored 是 `… probe errored: …`，結果丟棄、狀態不變。
- **startup**：還沒通過時 liveness、readiness 都不探測，容器 `started: false`、不就緒；通過後 worker 停止。失敗到門檻：`Killing`「Container web failed startup probe, will be restarted」。
- **liveness**：初始為成功；失敗到門檻：`Killing`「Container web failed liveness probe, will be restarted」（`restartPolicy: Never` 時沒有「, will be restarted」，也不重啟），worker 暫停到下一次啟動。之後是 §5 的停止流程；停止後重啟沿用 E32 的退避（第一次立刻，之後 Terminated 1 秒、CrashLoopBackOff，10、20、40…300 秒，跑滿 10 分鐘重置）。
- **readiness**：初始為不就緒；決定容器的 `ready`。READY 欄、`containerStatuses[].ready`、Ready／ContainersReady 條件（`ContainersNotReady`、`containers with unready status: [web]`）都由它決定；條件的 lastTransitionTime 包含就緒改變的時間。沒有任何探針的容器照 E32：執行中就是 started 與 ready。
- 刪除中：liveness 與 startup 停止；容器停止中（Killing 之後）所有探針都停止（見 §9）。
- 同一秒：容器自己的步驟先，探針後；探針依 startup、liveness、readiness。
- **長時間的穩定期**：容器的每個 worker 都穩定（liveness 成功、readiness 與 ready 一致）時，直到課程 health 的下一個時間點、容器自己的下一步或時鐘為止的探測結果都一樣，一次算完（失敗的 Unhealthy 直接加上次數）。所以一個被探測一週的 Pod（120961 次失敗）也只要幾步，`SETTLE_STEPS` 不會用完。

## 5. 停止與刪除（`kube-stop.ts`、`kubectl-apply.ts`）

- **killContainer**：先記 `Normal Killing`（刪除時是「Stopping container web」）；有 `preStop` 就先執行（`exec`、`httpGet` 或 `sleep`），它用掉寬限期的時間（`sleep N`、`sh -c "…; sleep N"`、`sleep: {seconds}`、health.exec 的 `seconds`、httpGet 的 delay）；失敗記 `Warning FailedPreStopHook`「PreStopHook failed」。剩下的時間至少 2 秒（kubelet 的 minimumGracePeriodInSeconds），再送停止訊號（Image 的 STOPSIGNAL，否則 SIGTERM）給 PID 1。
- **訊號**：Image（或程式）的 E24 `signals` 有處理而且秒數在剩下的時間內：那時以它的 exit 結束，日誌加上它的行；否則（沒有處理、`sh -c` 形式的 PID 1、太慢）寬限期結束時 SIGKILL，137（Error）。沒有 `signals` 時照 E24 的舊規則：Image 自己的 service 處理 SIGTERM（exit 0），其他（`sleep`、程式）沒有處理。已經排定更早結束的（`exitAfter`、OOM）照舊先發生。
- **kubectl delete pod**（probes profile，非 kube-system，非 `--force`）：API server 設 `deletionTimestamp`（現在 + 寬限期）與 `deletionGracePeriodSeconds`，STATUS 是 `Terminating`，`describe` 是 `Status: Terminating (lasts 30s)` 與 `Termination Grace Period: 30s`；kubelet 停止每個執行中的容器（等待中的不再拉取、不再退避）；最後一個容器停止時 Pod 消失（排程器重試）。沒有綁定或沒有容器在執行的 Pod 立刻消失。
- **等待**：kubectl 印出 `pod "web" deleted` 之後等到 Pod 消失，時鐘前進那段時間（同 `sleep`）；`--wait=false` 不等；`--timeout=10s` 太短時 `error: timed out waiting for the condition`，時鐘前進 10 秒，Pod 繼續終止。
- **寬限期**：`--grace-period=N`；負數或沒寫是 Pod 的 `terminationGracePeriodSeconds`；`--grace-period=0` 沒有 `--force` 是 1（kubectl 的規則），加上 kubelet 的 2 秒下限。`--grace-period=0 --force` 是 E32 的立即刪除與 Warning。
- kube-system 的 Pod、命名空間的刪除維持 E32 的立即刪除。

## 6. `kubectl wait` 與 describe

- `kubectl wait --for=condition=Ready pod/x --timeout=60s` 是 E32 已有的：逐秒前進，`pod/x condition met`，或 `error: timed out waiting for the condition on pods/x`。E33 讓 Ready 依探針成立。
- `describe pod` 的容器段落在 Limits／Requests 之後、Environment 之前印 `Liveness:`、`Readiness:`、`Startup:`（describeContainerProbe 的順序）：`http-get http://:8080/healthz delay=0s timeout=1s period=10s #success=1 #failure=3`、`tcp-socket :8080 …`、`exec [cat /tmp/healthy] …`；具名的埠印名稱（`http://:http/`）。`Ready:` 與 Conditions 依探針。

## 7. 課程資料（`kube-lesson.ts`、`kube-health.ts`）

```ts
kube: {
  …E32 的欄位,
  health?: [{
    image: 'team/web:1.0',                // 機器 docker.images 裡的 Image（以完整名稱比對）
    listenAfter?: 20,                     // 啟動後幾秒才接受連線（預設 Image 的 E23 ready，否則 0）
    paths?: [{ path: '/healthz', status: 500, after: 60 }, { path: '/ready', status: 503, until: 20 }, { path: '/slow', delay: 2 }],
    exec?: [{ command: ['check'], exit: 1, output: 'not yet', until: 15, seconds: 0 }],
  }],
}
```

時間都是「這一次啟動之後的秒數」，所以重啟後從頭算（liveness 重啟的課就是這樣出現週期）。驗證：最多 12 個 Image，每個是機器的 docker Image、不重複；`listenAfter` 0–3600；最多 8 個 path（`/` 開頭、status 100–599、delay 0–600、`after` 0–86400、`until` > `after`）；最多 8 個 exec（1–20 個字、exit 0–255、一行的 output、seconds 0–600、同樣的時間窗）。`status` 預設 500，`exit` 預設 1。

## 8. 檢查

`kube-pod` 的 `ready`（全部容器就緒與否）與 `restartsAtLeast`（RESTARTS 至少）在 E32 已經存在、語意不變；E33 讓 `ready` 取得探針的意義（READY 的 `0/1`），`restartsAtLeast` 可以檢查 liveness 造成的重啟。訊息例：`never 就緒的容器是 0/1`、`live 重新啟動了 1 次`。檢查前 settle 到時鐘，檢查本身不移動時鐘。

## 9. 偏差（刻意的模型）

- 探針時間以容器啟動為基準：第一次在 `initialDelaySeconds`，之後每 period。真實的 worker 從 Pod 加入時開始、kubelet 重啟時有隨機延遲，第一次在 delay 之後的下一個 tick。
- 容器停止中（liveness 失敗或刪除之後）所有探針停止，READY 保持最後的值；真實的 readiness 在刪除期間仍會探測。
- preStop 失敗的事件記在開始停止的那一秒；signal handler 的日誌記在容器結束時（`--timestamps` 才看得出）。
- 主程式 `sh -c` 的每一段立刻執行（E32 的規則），所以 Kubernetes 文件的 `touch /tmp/healthy; sleep 30; rm -f /tmp/healthy; sleep 600` 會立刻刪掉檔案；隨時間變化的 exec 探針請用 `health.exec`，或讓學習者以 `kubectl exec … -- rm` 觸發。
- `--force` 不加 `--grace-period=0` 仍走優雅刪除（沿用 E32 判斷強制刪除的方式）。
- kube-system 的 static pod 沒有探針（真實的 etcd、apiserver 等有）。
- HTTP 3xx 一律成功（真實的 kubelet 會跟隨同主機的轉址，跨主機的回傳 Warning）。

## 10. 修正（E32）

- `kubectl get … -o custom-columns=… --no-headers` 不再印標題列，欄寬只依資料列（同表格的 `--no-headers`）。所有 profile 都適用；已發布的課沒有用到，重播不變。

## 11. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e33.test.ts` | profile 與分界（以下的訊息、health 被拒、立即刪除）；探針與 hook 的驗證、嚴格解碼、型別錯誤、課文說明的欄位、init container；health 的驗證；預設值與 describe 的三行；liveness 剛好到門檻（39 秒仍是 0 次、40 秒 Killing）、SIGTERM 處理 3 秒、`logs --previous`、與退避交錯的 RESTARTS 與 BackOff、`restartPolicy: Never`；exec 探針與寫入層；永遠不就緒（READY、Ready 條件、事件次數、`kubectl wait` 逾時）；startup 擋住其他探針、`started`、wait 成立的時間；startup 用完失敗次數；逾時、找不到具名的埠、拒絕連線的訊息；Terminating、describe、preStop 用掉寬限期、SIGKILL；delete 的等待、`--grace-period`、0 變 1 與 2 秒下限、等待中的 Pod、`--timeout`、`--force`；preStop 失敗的事件；kube-system 仍立即；一週的探測一次算完與確定性；`--no-headers` 與 custom-columns；`kube-pod` 的 `ready`、`restartsAtLeast` 與說明 |
| `tests/support/probes-fixture.ts` | 只供測試：kub-33（probes profile，E32 的機器加上 `team/web:1.0`、`team/slow:1.0`、`team/stubborn:1.0` 與 responder `web`）、`health()`、`withFiles()`、`pod()` |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `probes`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', 'E33']`，KUB03 現在可以建立，KUB01 只缺 E34。

## 12. 只在課文說明、或不模擬的部分

gRPC 探針；`postStart`；探針自己的 `terminationGracePeriodSeconds`；`host` 與 HTTPS 探針；sidecar（init container 的 `restartPolicy: Always`）；Pod readiness gates；探針對 Endpoints 的影響（E35）；`kubectl delete --now`、`--cascade`；命名空間的 Terminating。

## 13. 沒有把握的地方（依記得的格式寫，並在此註明）

- **事件文字**：`Liveness probe failed: HTTP probe failed with statuscode: 500`、`Readiness probe failed: Get "http://IP:埠/路徑": dial tcp IP:埠: connect: connection refused`、`… context deadline exceeded (Client.Timeout exceeded while awaiting headers)`、tcp 的 `dial tcp IP:埠: connect: connection refused`、exec 失敗時訊息是否保留結尾換行、`… probe errored: …` 與具名埠找不到的文字（真實的會印整個容器結構）、exec 找不到執行檔的 OCI 訊息、exec 逾時的 `command "…" timed out`、在聽但不是 HTTP 的 `EOF`。
- **Killing**：`Container web failed liveness probe, will be restarted`、`Container web failed startup probe, will be restarted`、`Stopping container web`；`FailedPreStopHook` 的「PreStopHook failed」。
- **describe**：`Status: Terminating (lasts 30s)`、`Termination Grace Period:  30s`；`http-get http://:8080/healthz delay=0s …` 的格式與具名埠的寫法；exec 的 `[cat /tmp/healthy]`。
- **驗證文字**：handler 的 Required／Forbidden、`must be 1`、IANA 埠名的訊息、init container 的 Forbidden、`sleep.seconds` 與寬限期的關係（真實可能要求不大於寬限期）、`intstr.IntOrString` 的 unmarshal 文字、Probe 的 Go 結構名稱。
- **時間模型**：第一次探測的時間（§9）；liveness 失敗到 Killing 在同一秒；kubelet 的 2 秒下限是否也用在 liveness 的停止；`--grace-period=0` 轉成 1；delete 的 `--timeout` 逾時訊息（真實可能是 `error: timed out waiting for the condition on pods/web`）；刪除時 kubectl 印 `pod "web" deleted` 的時機。
- **其他**：探針請求的標頭（`User-Agent: kube-probe/1.32`）；service Image 的 `expose` 埠都在聽的假設。
