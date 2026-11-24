# KUB-2 引擎階段 E37：`ingress` profile（`kube-ingress*.ts`、`kube-gateway*.ts`、`kube-route*.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E36 的叢集（[KUB0_E36_KUBE_CONFIG](KUB0_E36_KUBE_CONFIG.md)）上加上 Ingress 與 IngressClass（networking.k8s.io/v1）、課程宣告的 ingress-nginx controller（v1.12.0）、它的路由（host、Exact／Prefix、最長比對、預設後端）、TLS 終結（E36 的 `kubernetes.io/tls` Secret、E13 的憑證驗證、Fake Certificate、ssl-redirect 308）、Gateway API v1 的 standard channel 子集（GatewayClass、Gateway、HTTPRoute 與 E15 的平滑加權輪替）、`kubectl create ingress`，以及檢查 `kube-object` 的條件與 `http` 的 Host 標頭。E1–E36 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`kube-config` 以下的 profile 輸出不變：Ingress 的 manifest、`get ing`、`create ingress` 仍是「要到引擎階段 E37 才模擬」，`--rule` 等仍是 `unknown flag`。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `INGRESS_PROFILE`（RANK 37） | `kube-config` 的一切加上 feature `ingress`，**沒有新指令**。課程機器寫 `profile: 'ingress'` |
| profile 以下 | `（模擬環境：Ingress 要到引擎階段 E37 才模擬）`、`（模擬環境：ing 要到引擎階段 E37 才模擬）`、`（模擬環境：kubectl create ingress 要到引擎階段 E37 才模擬）`（E32 原文）；`--rule`、`--class`、`--default-backend`、`--annotation` 是 `error: unknown flag`；課程資料的 `kube.ingressController`、`kube.gatewayApi`：`kube: ingressController needs the ingress profile (engine stage E37)`；檢查 `kube-object` 的 Ingress、IngressClass、GatewayClass、Gateway、HTTPRoute 與 `conditions`：`needs an ingress machine (engine stage E37)` |
| 開關 | `KubeState.ingress`（`buildKube` 在 ingress profile 設定；`nginx` 是 controller 的 Service 類型，`gateway` 表示 CRD 已安裝，`gateway.controller` 是 controllerName）。kubectl、manifest 的解碼、settle 的同步與網路視角都以它判斷 |

程式的分工（每個新檔案都不到 135 行）：`kube-ingress-spec.ts`（Ingress、IngressClass 的驗證、預設 class 的 admission、`get` 的欄）、`kube-ingress.ts`（安裝 ingress-nginx、它的狀態同步）、`kube-gateway-spec.ts`（CRD 的預設值、驗證、課文欄位、條件、`get` 的欄）、`kube-gateway.ts`（Gateway controller：class、位址、listener、route 的 parents）、`kube-route.ts`（資料平面的路由表與 TLS 表）、`kube-route-serve.ts`（一個請求的比對與回應、SNI）、`kube-describe-ingress.ts`、`kubectl-ingress.ts`。既有檔案只多了 ingress 才走到的分支：`kube-model.ts`（`ingress`、`systemNs`）、`kube-manifest.ts`（E37 的嚴格解碼 schema）、`kube-api.ts`（`NAMESPACED`）、`kube-write.ts`、`kube-endpoints.ts`（同步與位址池）、`kube-net.ts`（controller Pod 與 Gateway 的主機、VIP 帶上 `kubeTls`）、`sockets.ts`（`Listen.kubeTls`）、`http.ts`（`Responder.kube`、`Request.tls`、SNI、檢查的 Host）、`kube-output.ts`、`kube-print.ts`、`kube-checks.ts`、`kube-lesson.ts`、`kubectl.ts`、`kubectl-get.ts`、`kubectl-forward.ts`、`kubectl-pod.ts`、`shell.ts`、`lesson.ts`、`server-lesson.ts`；把 kube-system 視為系統的地方（控制器、垃圾回收、describe、drain、刪除）改用 `systemNs`（kube-system，以及課程安裝時的 ingress-nginx）。

## 2. Ingress 與 IngressClass（`kube-ingress-spec.ts`、`kube-manifest.ts`、`kube-write.ts`）

- **嚴格解碼**：`IngressSpec`（`ingressClassName`、`defaultBackend`、`tls[].hosts/secretName`、`rules[].host`、`http.paths[].path/pathType/backend`）、`IngressBackend`（`service.name`、`service.port.name|number`、`resource`）、`IngressClassSpec`（`controller`、`parameters`）。
- **驗證**（API server 的訊息，一次全部列出）：host 是 DNS 名稱（`*.example.test` 的萬用字元可以，IP 不行：`must be a DNS name, not an IP address`；萬用字元的 regex 句）；`pathType` 必填（`Required value: pathType must be specified`）、只能是 Exact、ImplementationSpecific、Prefix（`Unsupported value`）；Exact／Prefix 的 path 要以 `/` 開頭（`must be an absolute path`）；後端的 Service 名稱是 DNS-1035 label，port 的 name 與 number 只能一個（`cannot set both port name & port number`、`port name or number is required`、1–65535）；沒有 rules 也沒有 defaultBackend：`spec: Invalid value: []networking.IngressRule(nil): either \`defaultBackend\` or \`rules\` must be specified`；IngressClass 的 `spec.controller` 必填、是 domain-prefixed path，**不可變**（`field is immutable`）。`backend.resource`：`（模擬環境：… 只在課文說明；後端請用 Service）`。
- **預設 class**（DefaultIngressClass admission）：**建立時**沒有 `ingressClassName` 的 Ingress 拿到註解 `ingressclass.kubernetes.io/is-default-class: "true"` 的 class（多個時取最新的）；之後的 apply 不再補上。
- **generation**：Ingress、IngressClass 與 Gateway API 的物件建立時 `generation: 1`，spec 改變時加一；Ingress 建立時 `status: {loadBalancer: {}}`。上限：30 個 Ingress、IngressClass 與 Gateway API 物件。
- `-o name`、建立與刪除的輸出帶 API group：`ingress.networking.k8s.io/app created`、`ingressclass.networking.k8s.io/nginx`、`gateway.gateway.networking.k8s.io/gw`；同時 `get` 幾種類型時名稱欄也是這樣。

## 3. 課程宣告的 ingress-nginx（`kube-ingress.ts`）

- **安裝**：叢集建立時，照官方 static manifest 留下的樣子：命名空間 `ingress-nginx`（標籤 `app.kubernetes.io/name` 等）；Deployment `ingress-nginx-controller`（1 個 replica、ReplicaSet、revision 1）；一個在**第一個 worker** 上、已在執行、從未拉取的 Pod（Image `registry.k8s.io/ingress-nginx/controller:v1.12.0`，容器 `controller`，埠 http 80、https 443、webhook 8443，位址是那個節點 CIDR 的最小空位）；Service `ingress-nginx-controller`（LoadBalancer 或 NodePort，http 80→http、https 443→https，經 E35 的分配器）與 `ingress-nginx-controller-admission`（ClusterIP 443→webhook）；IngressClass `nginx`（controller `k8s.io/ingress-nginx`；`defaultClass` 時加上預設註解）。kube-config 上 ingress-nginx 也有 `kube-root-ca.crt`。
- **系統的**：和 kube-system 一樣，Deployment 與 ReplicaSet 不被控制器調和；刪掉 controller Pod 時立刻有一個新名稱的 Pod（同一個位址）；drain 時被驅逐後在同一節點重建；節點故障時不被驅逐。
- **位址**：LoadBalancer 從課程的 `lbPool` 拿位址（安裝最早，所以是池的第一個）；沒有池時 `<pending>`。NodePort 時發布 **controller Pod 所在節點的位址**（沒有 `--publish-service` 的 baremetal 做法）。
- **同步**（端點控制器每次執行之後）：class 存在且 controller 是 `k8s.io/ingress-nginx` 的 Ingress 由它服務——`status.loadBalancer.ingress: [{ip}]`（controller 沒有位址時是 `{}`），每個新的 generation 一則事件 `Normal Sync`「Scheduled for sync」（來源 `nginx-ingress-controller`，相同的事件依 E32 的 correlator 累計 `(x2 over 10s)`）。其他 class、沒有 class、class 不存在的 Ingress 不被服務，ADDRESS 一直是空的。**沒有宣告 controller 時**，Ingress 可以建立但沒有人服務它（可以教的真實狀態）。

## 4. ingress-nginx 的路由（`kube-route.ts`、`kube-route-serve.ts`）

- **伺服器**：每個 host 一個（沒有 host 的規則進預設伺服器 `_`）。依服務的 Ingress 的建立時間（再依命名空間、名稱）合併：同一個 host、同一個 path 與類型，先出現的勝出。
- **選伺服器**：Host 標頭（小寫、去掉埠）完全相同的 host；否則**單一標籤**的萬用字元（`*.example.test` 比對 `a.example.test`，不比對 `a.b.example.test` 與 `example.test`）；否則預設伺服器。
- **比對路徑**：Exact 是整個路徑相等；Prefix **依路徑元素**（`/foo` 比對 `/foo`、`/foo/`、`/foo/bar`，不比對 `/foobar`）；ImplementationSpecific 當成 Prefix。**最長的路徑勝出**，長度相同時 Exact 優先。
- **沒有比對到**：那個伺服器的 fallback——第一個帶來這個 host 的 Ingress 的 `defaultBackend`；預設伺服器的 fallback 只來自**沒有 rules** 的 Ingress 的 `defaultBackend`（catch-all）；都沒有時是 controller 的預設後端：`404 Not Found` 與 nginx 的錯誤頁（`<hr><center>nginx</center>`）。
- **後端**：Service 的就緒端點（E35 的 proxyTargets，依 IP 順序），每個後端自己的輪替（`kubeNet.turns` 的 `ingress/命名空間/名稱/埠`，和 kube-proxy 的鍵分開）。沒有端點、Service 或埠不存在：`503 Service Temporarily Unavailable`；端點沒在聽那個埠時試下一個（最多 3 個），都不行是 `502 Bad Gateway`。
- **轉送**：後端看到的用戶端是 controller Pod 的位址，請求帶 `Host`、`X-Real-IP`、`X-Forwarded-For`、`X-Forwarded-Host`、`X-Forwarded-Port`、`X-Forwarded-Proto`、`X-Forwarded-Scheme`、`X-Scheme`，再接原本的標頭；回應的 `Server: nginx`、`Date` 是 nginx 的，`Content-Type`、`Content-Length` 與其他標頭是後端的。
- **TLS 與轉址**：見 §5。

## 5. TLS（`kube-route.ts`、`kube-route-serve.ts`、`http.ts` 的 `tlsServer`）

- **憑證表**：443 埠依 **SNI** 選憑證：每個 `tls[].hosts` 的 host 用同命名空間 `secretName` 的 `kubernetes.io/tls` Secret（E36 的 `tls.crt`、`tls.key`，要能解析且金鑰相符）；Secret 不存在或不合用時那個 host 用 Fake Certificate；其他名稱與沒有 SNI（用 IP 連）都是 **Fake Certificate**——自簽、`O = Acme Co, CN = Kubernetes Ingress Controller Fake Certificate`、SAN `ingress.local`、RSA 2048、controller 啟動起一年。curl 由 E13 驗證：`curl: (60) SSL certificate problem: self-signed certificate`；`-k` 照樣連上；`--cacert` 加上課程的 CA 後驗證 Secret 的憑證，名稱不符是 E13 的 `no alternative certificate subject name matches`。
- **ssl-redirect**：伺服器有 TLS（某個 Ingress 的 `tls` 列出這個 host，不論 Secret 在不在）時，HTTP 的請求得到 `308 Permanent Redirect`，`Location: https://<host 不含埠><原本的路徑與查詢>`，body 是 nginx 的 308 頁；`curl -L` 跟過去。
- **HSTS**：HTTPS 回應加上 `Strict-Transport-Security: max-age=31536000; includeSubDomains`（有 TLS 的伺服器）。
- **HTTP 送到 443**：`400 Bad Request`，nginx 的「The plain HTTP request was sent to HTTPS port」頁，`Connection: close`。

## 6. Gateway API（`kube-gateway-spec.ts`、`kube-gateway.ts`）

- **CRD**：課程寫 `kube.gatewayApi` 才有（standard channel v1.2.1，沒有 CRD 的撰寫）。沒有時：`error: the server doesn't have a resource type "gateways"`、`no matches for kind "HTTPRoute" in version "gateway.networking.k8s.io/v1"`、`ensure CRDs are installed first`（真實的錯誤）。`api-resources` 加上 gatewayclasses（gc）、gateways（gtw）、httproutes。
- **預設值**（CRD schema 的 default）：GatewayClass 的 `status.conditions` 是 `Accepted Unknown Pending「Waiting for controller」`（lastTransitionTime 1970），Gateway 另有 `Programmed`；listener 的 `allowedRoutes.namespaces.from: Same`、`tls.mode: Terminate`、certificateRefs 的 `group: ""`、`kind: Secret`；HTTPRoute 的 `parentRefs` group／kind、沒有 rules 或 matches 時 `PathPrefix /`、backendRefs 的 `group: ""`、`kind: Service`、`weight: 1`。
- **驗證**（CRD 的規則，子集）：GatewayClass 的 `controllerName` 必填、格式、不可變（`Value is immutable`）；Gateway 的 `gatewayClassName`、listeners 的 name／port（1–65535）／protocol、名稱唯一、HTTPS／TLS 要有 `tls`、HTTP 不能有 `tls`、`from` 是 All、Selector、Same；HTTPRoute 的 hostnames、path type（Exact、PathPrefix、RegularExpression）與 `/` 開頭、Service 的 backendRef 要有 port、weight 0–1000000、parentRefs 最多 32 個。課文欄位：Gateway 的 `addresses`、`infrastructure`、`allowedRoutes` 的 selector 與 kinds；HTTPRoute 的 filters、timeouts、retry、sessionPersistence、headers／queryParams／method 比對、RegularExpression。
- **controller**（`kube.gatewayApi.controllerName`，預設 `example.com/gateway-controller`；`controller: false` 只有 CRD）：controllerName 相符的 GatewayClass `Accepted True Accepted`；這些 class 的 Gateway 依建立順序從 `lbPool` 拿一個位址（和 LoadBalancer Service 共用、互不重複；保留到 Gateway 刪除），`status.addresses: [{type: IPAddress, value}]`；條件 `Accepted`（有 listener 不合用時 reason 是 `ListenersNotValid`）、`Programmed`（沒有位址：`False AddressNotAssigned`）。每個 listener 的狀態：`attachedRoutes`、`supportedKinds`（HTTPRoute）、`Accepted`（HTTP／HTTPS 以外：`False UnsupportedProtocol`）、`Programmed`、`ResolvedRefs`（HTTPS 的 Secret 不存在、不是 tls 類型：`False InvalidCertificateRef`；別的命名空間：`RefNotPermitted`，ReferenceGrant 只在課文）。
- **HTTPRoute 的 parents**（每個指向這個 controller 的 Gateway 的 parentRef 一筆，`controllerName` 與原本的 `parentRef`）：依 `sectionName`、`port` 找 listener——沒有：`Accepted False NoMatchingParent`；listener 不允許這個命名空間：`NotAllowedByListeners`；hostnames 和 listener 的 hostname 沒有交集：`NoMatchingListenerHostname`；否則 `Accepted True Accepted`。`ResolvedRefs`：Service 不存在 `False BackendNotFound`（`Service "nope" not found`）、不是 Service：`InvalidKind`、別的命名空間：`RefNotPermitted`。lastTransitionTime 在狀態不變時保留。
- **`kubectl get`**：GatewayClass 是 NAME CONTROLLER ACCEPTED AGE，Gateway 是 NAME CLASS ADDRESS PROGRAMMED AGE，HTTPRoute 是 NAME HOSTNAMES AGE（JSON 陣列，例如 `["shop.example.test"]`）。

## 7. Gateway 的資料平面（`kube-route.ts`、`kube-route-serve.ts`）

- Programmed 的 Gateway 是網路上一台機器（`kube:gw/命名空間/名稱`），在它的位址聽 Programmed 的 listener 的埠；學習者機器與 Pod 都連得到（E12 的 curl、E35 的 Pod 網路）。
- **選 listener**：同一個埠上 hostname 和 Host 相符的 listener（完全相同優先，再來較長的萬用字元，沒有 hostname 的最後）。Gateway API 的萬用字元是**後綴比對**（`*.example.test` 比對 `a.b.example.test`）。
- **選 route**：附在那個 listener 的規則，hostname 最明確的優先（完全相同、較長的萬用字元、沒有 hostnames），再來 Exact、最長的 PathPrefix（依路徑元素），再來最舊的 route、規則與 match 的順序。
- **加權**：一個規則的 backendRefs 依 weight 以 E15 `proxy.ts` 的**平滑加權輪替**選（權重先除以最大公因數，第 n 次從週期的開頭重算，所以只存一個計數 `kubeNet.turns['gw/命名空間/route/規則']`）；3:1 是 web web api web，90:10 每十次第六次是第二個。選到的 Service 內再依端點輪替。weight 0 的不選。
- **錯誤**（模擬的 controller 自己的回應，Envoy 式）：沒有比對到：`404 Not Found`、空的 body；backendRef 不合用（不存在、不是 Service、全部 weight 0）：`500 Internal Server Error`（Gateway API 的規定）；沒有就緒端點：`503`、`no healthy upstream`；端點沒在聽：`503` 與 Envoy 的 `upstream connect error…`。成功的回應就是後端的回應（不換 Server 標頭）。
- **HTTPS listener**：依 SNI 選 listener 的憑證（有 hostname 的依名稱，沒有的給任何名稱）；沒有可用的憑證時交握失敗（curl 的 35）。

## 8. get 與 describe（`kube-print.ts`、`kube-describe-ingress.ts`）

| 指令 | 內容 |
|---|---|
| `get ing` | NAME CLASS HOSTS ADDRESS PORTS AGE；CLASS 沒有是 `<none>`；HOSTS 最多 3 個再 ` + N more...`，沒有 host 是 `*`；ADDRESS 是狀態的位址（排序、逗號，超過 16 字截成 13 字加 `...`）；PORTS 有 `tls` 時是 `80, 443` |
| `get ingressclass` | NAME CONTROLLER PARAMETERS AGE |
| `describe ing` | Name、Labels、Namespace、Address、Ingress Class、Default backend（`<default>` 或 `api:web (端點)`）、TLS（`app-tls terminates app.example.test`，沒有 Secret 是 `SNI routes …`）、Rules 表（每個 host 一行，沒有 host 是 `*`；每個 path 是 `\t路徑 \t後端 (就緒端點)`，Service 不存在是 `(<error: services "gone" not found>)`；沒有規則時 `*  *  預設後端`）、Annotations、Events |
| `describe ingressclass` 與 Gateway API | kubectl 的通用 describer：Name、Namespace、Labels、Annotations，其餘欄位以 smart label（`gatewayClassName` → `Gateway Class Name`、`apiVersion` → `API Version`、`uid` → `UID`）逐層縮排兩格；IngressClass 只有 Controller |

## 9. `kubectl create ingress`（`kubectl-ingress.ts`）

`create ingress|ing NAME --rule=host/path=service:port[,tls[=secret]]`（可重複）`[--class=] [--default-backend=service:port] [--annotation=key=value] [--dry-run=client -o yaml|json]`：同一個 host 的規則合併；path 結尾是 `*` 時是 Prefix（去掉 `*`），否則 Exact；數字的埠是 `port.number`，名稱是 `port.name`；TLS 依 Secret 分組，每個 host 只出現一次（沒有 secret 時 `- {}` 或只有 hosts）。輸出 `ingress.networking.k8s.io/web created`。錯誤：`error: exactly one NAME is required, got 0`、`error: not enough information provided: every ingress has to either specify a default-backend …`、`error: rule nope is invalid and should be in format host/path=svcname:svcport[,tls[=secret]]`、`error: default-backend should be in format servicename:serviceport`、`error: annotation bad is invalid and should be in format key=[value]`、`error: failed to create ingress: ingresses.networking.k8s.io "web" already exists`、`error: failed to create ingress: Ingress.networking.k8s.io "x" is invalid: …`。

## 10. 課程資料與檢查（`kube-lesson.ts`、`kube-checks.ts`、`http.ts` 的 `probe`）

```ts
kube: {
  …E32–E36 的欄位,
  lbPool?: ['10.0.0.200-10.0.0.209'],
  ingressController?: { service?: 'LoadBalancer' | 'NodePort', nodePorts?: { http?: 30080, https?: 30443 }, defaultClass?: boolean },
  gatewayApi?: { controllerName?: 'example.com/gateway-controller', controller?: boolean },
}
```

驗證：`ingressController.service is LoadBalancer or NodePort`、`nodePorts (http, https) are two different ports in 30000-32767 of a NodePort controller`、`gatewayApi is { controllerName?: a domain-prefixed path …, controller?: boolean }`。

| 檢查 | 意義 |
|---|---|
| `kube-object` 加上 `resource: 'Ingress' \| 'IngressClass' \| 'GatewayClass' \| 'Gateway' \| 'HTTPRoute'` 與 `conditions?: [{ type, status: 'True' \| 'False' \| 'Unknown', reason? }]` | 只在 ingress 機器；`conditions` 看 `status.conditions`，HTTPRoute 看**每一筆** `status.parents[].conditions`。說明例：`default 命名空間應該有名為 split 的 HTTPRoute（Accepted 條件是 False（NoMatchingParent））`；訊息例：`它還沒有 Programmed 條件`、`它的 ResolvedRefs 條件是 False（BackendNotFound）` |
| `http` 的 `requestHeaders` 有 `Host` | 取代 URL 的 Host（用 IP 檢查某個 host 的 Ingress 或 Gateway）；`https://` 時 SNI 仍是 URL 的名稱。沒有寫 Host 時語意不變 |

都在檢查前 settle 到時鐘、不移動時鐘；檢查的請求不推進輪替。沒有新增 `kube-route` 檢查（輪替與加權都固定，`http` 的 `body` 加上 `{{hostname}}` 已能指出後端）。

## 11. 偏差（刻意的模型）

- **狀態的時間**：ingress-nginx 在端點控制器的同一秒寫入位址與 Sync 事件（真實的 status 同步有週期，常要數秒到一分鐘）；Gateway controller 也一樣立即。
- **萬用字元**：Ingress 依 Kubernetes 文件只比對一個標籤（nginx 的 `server_name *.x` 會比對多個標籤）；Gateway API 依規格是後綴比對。
- **合併**：重複的 host／path 先到先贏，不做 ingress-nginx 的 admission webhook 拒絕（webhook 的 Service 與 Pod 埠在，但不驗證）。
- **輪替**：ingress-nginx 的 round_robin 從第一個端點開始（真實的 Lua balancer 起點不固定）；EWMA、sticky session、canary、rewrite 等註解只在課文。
- **轉送標頭**：沒有 `X-Request-ID`（真實的是亂數）與 `X-Original-*`；後端的 root route（讀檔）經 Ingress 時是 404。
- **controller**：沒有 ConfigMap、ServiceAccount、admission Job 的 Pod、leader election 與 controller 的日誌；IngressClass 的 `parameters` 只顯示；Pod 沒有探針；`--watch-ingress-without-class` 是 false。
- **Gateway 的資料平面**：沒有 Pod 或 Service（真實的實作通常為每個 Gateway 建立一個 LoadBalancer Service 與 Envoy 之類的 Pod）；錯誤回應與條件的 message 是模擬 controller 自己的文字。
- **TLS**：Secret 的憑證不涵蓋 host 時照樣使用（curl 名稱不符）；SNI 的萬用字元只比對一個標籤；沒有 OCSP、TLS 參數與 mTLS。
- **Gateway API**：只有 HTTPRoute（GRPCRoute、TLSRoute、TCPRoute、ReferenceGrant、BackendTLSPolicy 只在課文）、只有 HTTP／HTTPS listener、`Conflicted` 條件與 listener 衝突不模擬。

- 後端收到的 `X-Real-IP` 與 `X-Forwarded-For` 是 controller Pod 自己的位址，不是用戶端（真實的 ingress-nginx 會帶入它看到的來源位址；經過 externalTrafficPolicy: Cluster 的 SNAT 時通常是節點位址）。課程不要以這兩個標頭的值出題。
- KUB-2 整合時修正：經過 ingress-nginx 或 Gateway 的回應，`Date` 標頭原本用代表 controller 的主機的預設時鐘（固定在 2026-11-22 10:00:00），現在用學習者機器（叢集所在）的時鐘，會隨 `sleep` 前進。

## 12. 課程作者要知道的事

- 機器寫 `profile: 'ingress'`；要有 controller 寫 `kube.ingressController`，要有位址寫 `kube.lbPool`（controller 的 LoadBalancer 拿第一個位址，例如 10.0.0.200；Gateway 依建立順序拿後面的）。NodePort 版本固定 `nodePorts`，ADDRESS 是 controller Pod 的節點位址（第一個 worker，預設 node-01 的 10.0.0.51）。
- Ingress 要寫 `ingressClassName: nginx`（或宣告 `defaultClass: true` 讓沒寫的拿到），否則 ADDRESS 空白、路由不生效——這正是可以教的狀態。
- 從學習者機器測試：`curl -H 'Host: app.example.test' http://10.0.0.200/…` 或 `curl --resolve app.example.test:443:10.0.0.200 --cacert ca.crt https://app.example.test/`；Secret 用 `kubectl create secret tls`（E36）與 E13 的課程 CA 簽的憑證，私鑰與 CA 都是課程的假資料。
- 後端 responder 的 route 要用前綴（`/*`）才能回答 Ingress 轉來的路徑（後端收到完整路徑，沒有 rewrite）；用 `body: 'Hostname: {{hostname}}\n'` 讓學習者看到是哪一個 Pod 回答。
- 加權示範用小的整數比例（3:1、9:1），課文可以照 §7 寫出順序；同一課前面的請求會影響之後的位置，檢查不推進輪替。
- 有 `tls` 的 host 的 HTTP 一律 308；示範 HTTP 時用沒有 tls 的 Ingress。Fake Certificate 的錯誤要 `-v` 或去掉 `-s` 才看得到訊息。
- 狀態條件的檢查用 `kube-object` 的 `conditions`（HTTPRoute 的 reason 例如 `NoMatchingListenerHostname`、`BackendNotFound`）；位址用 `fields` 的 `.status.loadBalancer.ingress[0].ip` 或 `.status.addresses[0].value`。

## 13. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e37.test.ts` | profile 與分界（以下的訊息、未知旗標、課程資料被拒）、課程資料的驗證；沒有 controller 的 Ingress；ingress-nginx 的物件、LoadBalancer、NodePort、沒有池、預設 class、刪除 controller Pod；路由（Exact／Prefix／最長、`/foo` 與 `/foobar`、ImplementationSpecific、萬用字元、預設後端 404、catch-all defaultBackend、輪替、503、502、轉送標頭、從 Pod 連）；TLS（Secret 的憑證、HSTS、308 與 `-L`、Fake Certificate 的 60 與 `-k`、IP、其他名稱、HTTP 到 443 的 400）；describe 的全文、create ingress 的 YAML 與錯誤、驗證的全文、IngressClass 不可變、generation 與 Sync 事件；確定性 |
| `tests/terminal-e37-gateway.test.ts` | 沒有 CRD、只有 CRD；class、位址、listener 狀態、attachedRoutes、`get` 的欄、api-resources；NoMatchingListenerHostname、NoMatchingParent、NotAllowedByListeners、BackendNotFound；AddressNotAssigned；加權的順序與 `weightedPick`；listener／route hostname、Exact 與 PathPrefix、404、500（不存在、weight 0）、503；HTTPS listener 與 InvalidCertificateRef；從 Pod 連；檢查 `kube-object`（條件、Ingress 的位址）與 `http` 的 Host、訊息、說明與驗證 |
| `tests/support/ingress-fixture.ts` | 只供測試：kub-37（ingress profile，E36 的機器加上池 10.0.0.200–203、LoadBalancer 的 ingress-nginx、Gateway API）、`team/echo:1.0`、apps.yaml、ing.yaml、gw.yaml、課程 CA 與 app.example.test 的憑證 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `ingress`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', 'E33', 'E34', 'E35', 'E36', 'E37']`，KUB07（還需要 network-protocol 與 E13）可以建立。

## 14. 沒有把握的地方（依記得的格式寫，並在此註明）

- **API 的文字**：`[]networking.IngressRule(nil)` 的值、`one backend (\`service\` or \`resource\`) must be specified`、port 的兩句與它們顯示的值、IngressClass 的 controller 格式句與不可變句、CRD 的 CEL 訊息（`Listener name must be unique within the Gateway`、`tls must be specified for protocols ['HTTPS', 'TLS']`、`Must have port for Service reference`、`value must be an absolute path …`）、CRD 的嚴格解碼訊息（這裡和內建類型相同）、`spec.controllerName … Value is immutable`。
- **ingress-nginx**：controller 的 args、標籤、Service 的 `appProtocol`、NodePort 時發布節點位址的條件、Sync 事件的時機與累計、HSTS 的預設與只在有 TLS 的伺服器、308 的 Location 去掉埠、Fake Certificate 的欄位（O、CN、SAN、有效期、金鑰、是否 CA）、defaultBackend 與預設伺服器的合併規則、Secret 不涵蓋 host 時的行為、`server_tokens` 關閉時的 `Server: nginx`、轉送標頭的順序。
- **kubectl**：`describe ingress` 的空白與 1.32 是否改讀 EndpointSlice、`get ing` 的 ADDRESS 截斷、HOSTNAMES 欄沒有值時是空白還是 `<none>`、Gateway 的 ADDRESS 欄、通用 describer 的 smart label 與清單的排版、`create ingress` 的 regex 與錯誤句（`failed to create ingress:` 之後的寫法）、`api-resources` 裡 CRD 的位置。
- **Gateway API**：預設 status 的 reason（Pending）與 1970 的時間、v1.2.1 是否另有 `SupportedVersion` 條件、listener 的 `Conflicted` 條件、各條件的 message（模擬 controller 自己的）、`ListenersNotValid` 的用法、NoMatchingParent 與 NotAllowedByListeners 的判斷順序、backendRef 錯誤時 500 的回應內容、HTTPRoute 沒有 controller 時是否有 `status.parents: []`。
- 版本（ingress-nginx v1.12.0、Gateway API v1.2.1）見 [KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §8。
