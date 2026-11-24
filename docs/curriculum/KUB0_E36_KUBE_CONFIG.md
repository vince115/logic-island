# KUB-2 引擎階段 E36：`kube-config` profile（`kube-config-spec.ts`、`kube-env.ts`、`kube-volumes.ts`、`base64.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E35 的叢集（[KUB0_E35_KUBE_NET](KUB0_E35_KUBE_NET.md)）上加上 ConfigMap 與 Secret（`data`、`stringData`、類型、`immutable`）、Pod 的 `env[].valueFrom`、`envFrom`、`configMap`／`secret` Volume（`items`、`defaultMode`、`subPath`）、掛載內容的更新延遲、`imagePullSecrets` 對 E23 私有 Registry、`kubectl create configmap|secret generic|tls|docker-registry`、新的 `base64` 指令，以及檢查 `kube-config` 與 `kube-pod`／`kube-object` 的延伸。E1–E35 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`kube-net` 以下的 profile 輸出不變：ConfigMap、Secret 的 manifest、`get cm`、`create configmap|secret` 仍是「要到引擎階段 E36 才模擬」，Pod 的 `envFrom`、`valueFrom`、Volume 仍指名 E36（`E36/E38`），新的旗標仍是 `unknown flag`，`base64` 仍是 `command not found`。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `KUBE_CONFIG_PROFILE`（RANK 36） | `kube-net` 的一切加上 `E36_COMMANDS = ['base64']` 與 feature `kube-config`。課程機器寫 `profile: 'kube-config'` |
| profile 以下 | `（模擬環境：ConfigMap 要到引擎階段 E36 才模擬）`、`（模擬環境：cm 要到引擎階段 E36 才模擬）`、`（模擬環境：kubectl create secret 要到引擎階段 E36 才模擬）`、`（模擬環境：spec.containers[0].envFrom 要到引擎階段 E36 才模擬）`（E32 原文）；`--from-literal` 等是 `error: unknown flag`；`base64` 是 `command not found`；Image 的 `commands` 不能有 `printenv`；檢查 `kube-config` 與 ConfigMap／Secret 的 `kube-object`：`needs a kube-config machine (engine stage E36)` |
| 開關 | `KubeState.config`（`buildKube` 在 kube-config profile 設定）。kubectl、kubelet、settle、manifest 的解碼與 describe 都以它判斷 |

程式的分工（每個新檔案都不到 170 行）：`kube-config-spec.ts`（ConfigMap 與 Secret 的預設值、驗證、Go 的 base64 解碼、`immutable`、`kube-root-ca.crt`、`cfgAt`）、`kube-pod-config.ts`（Pod 設定欄位的驗證與 Volume 的預設值）、`kube-env.ts`（kubelet 解析環境變數與 imagePullSecrets）、`kube-volumes.ts`（掛載、FailedMount、同步、atomic writer 的檔案）、`kube-describe-config.ts`、`kube-config-checks.ts`、`kubectl-create-config.ts`、`base64.ts`。既有檔案只多了 kube-config 才走到的分支：`kube-model.ts`（`config`、`cfgAt`、`CSim.env`／`subs`、`PodSim.vols`／`mount`、`CONFIG_SYNC_SECONDS`）、`kube-manifest.ts`（E36 的嚴格解碼 schema；kube-config manifest 的八進位整數）、`kube-api.ts`（`Secret` 是命名空間的；Volume 的 `defaultMode`）、`kube-write.ts`、`kube-workload-spec.ts`、`kube-image.ts`（`resolveImage` 的登入、`podEnv` 的解析結果、`podContainer` 的掛載）、`kube-kubelet.ts`、`kube-settle.ts`、`kube-stop.ts`、`kube-health.ts`、`kube-net.ts`、`kube-checks.ts`、`kube-describe.ts`、`kube-print.ts`、`kube-lesson.ts`、`kubectl.ts`、`kubectl-get.ts`、`kubectl-pod.ts`、`shell.ts`、`manual.ts`、`lesson.ts`、`server-lesson.ts`、`docker-lesson.ts`。

## 2. ConfigMap 與 Secret（`kube-config-spec.ts`、`kube-manifest.ts`、`kube-write.ts`）

- **嚴格解碼**：ConfigMap（`data`、`binaryData`、`immutable`）、Secret（`data`、`stringData`、`type`、`immutable`）。`data` 的值要是字串：`json: cannot unmarshal number into Go struct field ConfigMap.data of type string`（Secret 是 `of type []uint8`）。Secret 的 `data` 是 base64（API 的 `[]byte`），依 Go 的 `base64.StdEncoding`：略過換行，錯誤是 `Secret in version "v1" cannot be handled as a Secret: illegal base64 data at input byte 3`（位置照 Go 的 CorruptInputError：不合法的字元、不完整的最後一組、錯誤的 `=`）。
- **預設值**：`stringData` 是只寫的——API server 把它編碼後合併進 `data`（同一個鍵以 `stringData` 為準），不儲存 `stringData`；`type` 預設 `Opaque`。`kubectl apply` 的三方合併照 E32：`stringData` 改了值會更新 `data`，但上一次 apply 只寫在 `stringData` 的鍵拿掉後仍留在 `data`（同真實的行為）。`last-applied-configuration` 註解保存的是 manifest 原文，**所以用 `stringData` apply 的值會以明文留在註解裡**（真實的陷阱，課文可以教）。
- **類型**：`Opaque`、`kubernetes.io/tls`（要有 `tls.crt` 與 `tls.key`：`data[tls.key]: Required value`）、`kubernetes.io/dockerconfigjson`（要有 `.dockerconfigjson`，內容是 JSON：`data[.dockerconfigjson]: Invalid value: "<secret contents redacted>": invalid character in JSON`）。其他類型：`（模擬環境：Secret 的 type kubernetes.io/basic-auth 只在課文說明；…）`。`binaryData`：`（模擬環境：ConfigMap 的 binaryData 只在課文說明；請把文字放在 data）`。
- **驗證**：名稱是 RFC 1123 subdomain（E32 的訊息）；鍵：`data[bad key]: Invalid value: "bad key": a valid config key must consist of alphanumeric characters, '-', '_' or '.' (…)`。
- **更新**：Secret 的 `type` 不能改（`type: Invalid value: "kubernetes.io/tls": field is immutable`）；`immutable: true` 之後 `data` 不能改、`immutable` 不能拿掉（`data: Forbidden: field is immutable when \`immutable\` is set`、`immutable: Forbidden: …`），只能刪除再建立。
- **kube-root-ca.crt**：每個命名空間（含新建的）都有根 CA 發布者的 ConfigMap `kube-root-ca.crt`（`ca.crt` 是叢集 CA 的模擬 PEM，E13 的格式；註解 `kubernetes.io/description`）。`kubectl get secrets` 在新叢集是空的（1.24 起不再自動建立服務帳號的 token Secret）。
- 上限：40 個 ConfigMap 與 Secret（不含 `kube-root-ca.crt`）。`cfgAt` 記錄每個 ConfigMap、Secret 內容最後改變（建立、apply、刪除）的時間，給 §5 的同步。

## 3. Pod 的設定欄位（`kube-pod-config.ts`）

kube-config 的 Pod 與 Deployment／ReplicaSet 的 template 嚴格解碼 `env[].valueFrom`（`configMapKeyRef`、`secretKeyRef`，`name`、`key`、`optional`）、`envFrom`（`prefix`、`configMapRef`、`secretRef`）、`volumeMounts`（`name`、`mountPath`、`subPath`、`readOnly`）、`volumes[].configMap`（`name`、`items`、`defaultMode`、`optional`）、`volumes[].secret`（`secretName`、…）與 `imagePullSecrets`。其他 Volume（`emptyDir`、PVC…）是 `（模擬環境：spec.volumes[0] 要到引擎階段 E38 才模擬）`，`fieldRef`／`resourceFieldRef` 是課文。API server 的驗證（一次全部列出）：Volume 名稱（label、重複）、`configMap.name`／`secret.secretName: Required value`、`items[].key`／`path`（相對路徑、不含 `..`）、`defaultMode`／`mode` 在 0–0777（`must be a number between 0 and 0777 (octal), both inclusive`）；掛載的 Volume 要存在（`volumeMounts[0].name: Not found: "nope"`）、`mountPath` 唯一、`subPath` 是相對路徑；`valueFrom` 只能一個來源、不能同時有 `value`；`envFrom` 只能一個來源、`prefix` 要是合法的環境變數名稱。`configMap`／`secret` Volume 的預設 `defaultMode: 420`（0644）。kube-config 的 Kubernetes manifest（`kubectl apply|create -f` 與 `kube.manifests`）裡的 `0644` 依 YAML 1.1 讀成八進位（420，同 sigs.k8s.io/yaml）；這只在 manifest 轉成 JSON 的地方（`readManifests` 的 `octal`）做，共用的 `yaml.ts` 不變，Compose、GitHub Actions 工作流程、kubeconfig 與 kube-net 以下的 manifest 都照舊（`0644` 仍是 644 或字串）。

## 4. 環境變數與 imagePullSecrets（`kube-env.ts`、`kube-kubelet.ts`）

- **何時解析**：kubelet **建立容器的那一刻**（拉取或確認 Image 之後、啟動之前）。順序：每個 `envFrom` 依序（鍵依字母排序、加上 `prefix`），再來是 `env`（`value`，或 `configMapKeyRef`／`secretKeyRef` 的值，Secret 是解碼後的文字）；同名的以後面的為準。E24 程式的 `needsEnv` 看到的就是這些變數，所以缺 Secret 的程式照 E24 的 `missingEnv` 結束。
- **缺少來源**：沒有 `optional: true` 時，容器停在 `CreateContainerConfigError`（STATUS 欄、describe 的 Reason），事件 `Warning Failed`「Error: configmap "app-config" not found」、「Error: secret "db-secret" not found」、「Error: couldn't find key nope in Secret default/db-secret」；**每 10 秒再試一次**（每次都有一則 `Pulled`「already present」或拉取），來源出現後的下一次就啟動。`optional: true` 時那個變數（或整個來源）略過。
- **不合法的名稱**：`envFrom` 的鍵（加上 prefix 後）不是合法的環境變數名稱（`[-._a-zA-Z][-._a-zA-Z0-9]*`）時略過，並記一則 `Warning InvalidEnvironmentVariableNames`「Keys [1st] from the EnvFrom configMap default/nums were skipped since they are considered invalid environment variable names.」。
- **不會更新**：執行中的容器的環境變數永遠不變；容器重新啟動（當掉、liveness、`kubectl rollout restart` 產生的新 Pod）時重新解析，所以拿到新的值。
- **在 Pod 裡看**：`kubectl exec POD -- env` 與 `printenv [名稱…]`（Image 的 `commands` 要有 `printenv`；沒有的名稱結束碼 1）印出這次執行解析的變數。
- **imagePullSecrets**：每次拉取時讀 Pod 的 `imagePullSecrets`（同命名空間、`kubernetes.io/dockerconfigjson` 類型的 Secret 的 `auths`，鍵可以是 `registry.example.com:5000` 或 `https://…`；`auth` 或 `username`／`password`）。找不到的 Secret：`Warning FailedToRetrieveImagePullSecret`「Unable to retrieve some image pull secrets (regcred); attempting to pull the image may not succeed.」，照樣嘗試拉取。E23 私有 Registry 的結果（containerd 的文字，見 §14）：沒有登入是 E32 的 `… pull access denied, repository does not exist or may require authorization: authorization failed: no basic auth credentials`；錯的 token 是 `unexpected status from HEAD request to https://registry.example.com:5000/v2/team/private/manifests/1.0: 401 Unauthorized`；使用者沒有那個 repository 是 `… server message: insufficient_scope: authorization failed`；正確的登入就拉下來。之後照 E32 的 ErrImagePull → ImagePullBackOff 退避，建好 Secret 後的下一次嘗試成功。**節點已經有的 Image（IfNotPresent）不需要登入**（真實的安全提醒）。預設 ServiceAccount 的 `imagePullSecrets` 只在課文。

## 5. configMap 與 secret Volume，以及更新（`kube-volumes.ts`）

- **掛載**：Pod 排到節點後，kubelet 先掛載 Volume，之後才拉取 Image。來源（或 `items` 的鍵）不存在且不是 optional：Pod 停在 `ContainerCreating`，每一個失敗的 Volume 一則 `Warning FailedMount`「MountVolume.SetUp failed for volume "config" : configmap "app-config" not found」（secret：`secret "db-secret" not found`；鍵：`configmap references non-existent config key: nope`、`references non-existent secret key: nope`），**1 秒後再試，每次加倍，最多 122 秒**（事件的計數加一）；來源出現後的下一次嘗試掛上，容器從那時開始拉取與啟動。`optional: true` 的 Volume 掛上空的資料夾（缺的鍵略過）。
- **檔案**：照 kubelet 的 atomic writer：`<mountPath>/..2026_11_24_10_00_00.<數字>/` 裡是檔案（`items[].path` 可以有子資料夾），`..data` 連結到它，每個最上層的名稱 `X` 是連到 `..data/X` 的連結；所以 `ls` 只看到鍵，`ls -a` 看到 `..data` 與時間戳記資料夾。檔案的權限是 `items[].mode`、`defaultMode`（預設 0644），擁有者 root；掛載點的資料夾是 0777（secret 是 1777）。Volume 蓋住 Image 在那個路徑原有的檔案。
- **subPath**：`subPath: config.yaml` 把 Volume 裡的那一個檔案放在 `mountPath`（一個普通檔案）；內容是**容器啟動時**的內容。
- **更新延遲（同步模型）**：ConfigMap 或 Secret 改變後（建立、apply、刪除），掛載它的 Volume 在**最後一次改變的 60 秒後**（`CONFIG_SYNC_SECONDS`）換成新內容：新的時間戳記資料夾、`..data` 指向它。內容一樣時不換資料夾。刪除來源時 Volume 保留原本的檔案。`subPath` 的檔案與環境變數不更新，要等新的容器（`kubectl rollout restart`）。
- **在 Pod 裡看**：`kubectl exec … -- cat /etc/app/config.yaml`、`ls -la`、E33 的 exec 探針與檢查 `kube-pod` 的 `file` 都看得到 Volume（連結會被跟隨）。

## 6. `kubectl create configmap` 與 `kubectl create secret`（`kubectl-create-config.ts`）

| 指令 | 內容 |
|---|---|
| `create configmap|cm NAME [--from-literal=k=v] [--from-file=[k=]路徑] [--from-env-file=路徑]` | `--from-literal` 在第一個 `=` 分開，值頭尾的 `"`、`'` 去掉（kubectl 的 ParseLiteralSource）；`--from-file` 的鍵預設是檔名，資料夾是裡面每個一般檔案；`--from-env-file` 是 `KEY=VALUE` 行（`#` 註解與空行略過、開頭空白去掉、值的引號保留、沒有 `=` 的行是空值），不能和另外兩種同時用。輸出 `configmap/NAME created` |
| `create secret generic NAME …` | 同上（值以 base64 存入 `data`），`--type` 指定類型 |
| `create secret tls NAME --cert=檔案 --key=檔案` | 讀 E13 的模擬 PEM，照 Go 的 `tls.X509KeyPair` 檢查：`error: tls: private key does not match public key`、`tls: failed to find any PEM data in certificate input`、`tls: failed to find certificate PEM data in certificate input, but did find a private key; PEM inputs may have been switched`、`tls: found a certificate rather than a key in the PEM for the private key` 等；`tls.crt`、`tls.key` 是檔案原文 |
| `create secret docker-registry NAME --docker-server --docker-username --docker-password [--docker-email]` | `.dockerconfigjson` 是 `{"auths":{"<server>":{"username","password","email","auth"}}}`（`auth` 是 `user:password` 的 base64）；server 預設 `https://index.docker.io/v1/` |

`--dry-run=client -o yaml|json` 印出物件（`creationTimestamp: null`；`-n` 有寫時才有 `namespace`）。錯誤：`error: exactly one NAME is required, got 0`、`error: invalid literal source novalue, expected key=value`、`error: "bad key" is not a valid key name for a ConfigMap: …`、`error: cannot add key "a", another key by that name already exists in Data for ConfigMap "x"`（Secret：`error: cannot add key a, another key by that name already exists`）、`error: error reading k8s/nope.txt: no such file or directory`、`error: from-env-file cannot be combined with from-file or from-literal`、`error: env file k8s/bad.env, line 2: "1BAD" is not a valid key name: …`、`error: key and cert must be specified`、`error: either --from-file or the combination of --docker-username, --docker-password and --docker-server is required`、`error: failed to create configmap: configmaps "app" already exists`、`error: failed to create secret secrets "db" already exists`。

## 7. get 與 describe（`kube-print.ts`、`kube-describe-config.ts`、`kube-describe.ts`）

| 指令 | 內容 |
|---|---|
| `get cm` | NAME DATA AGE（DATA 是 `data` 與 `binaryData` 的鍵數） |
| `get secret` | NAME TYPE DATA AGE |
| `-o yaml|json|jsonpath|name` | E32 的格式；Secret 的 `data` 是 base64：`kubectl get secret db -o jsonpath='{.data.password}' \| base64 -d` 還原。鍵有點時寫 `{.data.\.dockerconfigjson}` |
| `describe cm` | Name、Namespace、Labels、Annotations、空行、`Data`、`====`，每個鍵是 `鍵:`、`----`、值、空行；再空一行、`BinaryData`、`====`、空行、Events |
| `describe secret` | Name、Namespace、Labels、Annotations、空行、`Type:  Opaque`、空行、`Data`、`====`，每個鍵只有 `鍵:  15 bytes`——**永遠不印值**；沒有 Events |
| `describe pod` | 容器多了 `Environment Variables from:`（`app-config  ConfigMap  Optional: false`，有 prefix 時 `ConfigMap with prefix 'APP_'`）；`Environment:` 的 valueFrom 寫 `<set to the key 'DB_PASSWORD' in secret 'db-secret'>  Optional: false`（ConfigMap 是 `of config map '…'`），不印值；`Mounts` 的 subPath 是 `(rw,path="config.yaml")`；Volumes 的 `Type: ConfigMap (a volume populated by a ConfigMap)`、`Name:`、`Optional:`，secret 是 `Type: Secret (a volume populated by a Secret)`、`SecretName:` |

`get all` 不含 ConfigMap 與 Secret（同 kubectl）。`delete cm|secret` 照 E32。

## 8. `base64`（`base64.ts`，GNU coreutils 9.4）

- `base64 [-d] [-i] [-w 欄數] [檔案]`，`--decode`、`--ignore-garbage`、`--wrap=欄數`、`--help`、`--version`；沒有檔案或 `-` 讀標準輸入（沒有管線時是模擬環境的「沒有鍵盤輸入」）。
- 編碼：輸入的 UTF-8 位元組，每 76 個字元換行，最後也換行（空的輸入什麼都不印）；`-w 0` 一行而且**沒有換行**。`echo lesson-pass | base64` 包含 echo 的換行（`…MK`），`echo -n` 才是值本身——課文的重點。
- 解碼：略過換行，印出解得出的部分，遇到不合法的字元、`=` 之後還有資料、或不完整的最後一組時 stderr 印 `base64: invalid input`，結束碼 1（`echo aGk | base64 -d` 印出 `hi` 再報錯）；`-i` 略過字母表以外的字元。解碼的位元組以 UTF-8 顯示。
- 錯誤：`base64: invalid wrap size: 'x'`、`base64: option requires an argument -- 'w'`、`base64: extra operand 'b'`、`base64: invalid option -- 'q'`、`base64: unrecognized option '--nope'`（後兩者與 extra operand 另有 `Try 'base64 --help' for more information.`）、`base64: nope: No such file or directory`。
- 只列在 kube-config 與之上的 profile；`help`、`man base64`、`base64 --help` 有說明。容器裡沒有 base64。

## 9. 課程資料與檢查（`kube-config-checks.ts`、`kube-checks.ts`）

沒有新的 `kube` 欄位：ConfigMap 與 Secret 用 `kube.manifests` 在開機時建立，或由學習者建立。私有 Registry 是 E23 的 `docker.registries`（token 要是明顯假的課程值）。

| 檢查 | 意義 |
|---|---|
| `{ kind: 'kube-config', resource: 'ConfigMap' \| 'Secret', name, namespace?, absent?, type?, keys?, values?: [{ key, equals }], immutable?, notPlainIn?: { file, keys? } }` | `type` 只給 Secret（三種類型）；`keys` 都要有；`values` 比對值（Secret 是解碼後的文字）；`immutable` 是不是 `true`；`notPlainIn` 是學習者機器上的檔案（絕對路徑，例如寫好的 manifest）裡**沒有**這些鍵（預設全部）非空值的明文。說明例：`default 命名空間應該有名為 db 的 Secret（類型 Opaque、有 pw、user 的值是「demo」、不可變更（immutable）、/home/learner/k8s/secret.yaml 裡沒有它的明文值）`；訊息例：`沒有名為 db-secret 的 Secret`、`app-config 的 LOG_LEVEL 是「info」`、`db-secret 的 DB_PASSWORD 不是題目要的值`（**Secret 的值永遠不出現在訊息裡**）、`/home/learner/k8s/secret.yaml 裡有 DB_PASSWORD 的明文值` |
| `kube-object` 加上 `resource: 'ConfigMap' \| 'Secret'` | 只在 kube-config 機器（以下：`a kube-object check of a Secret needs a kube-config machine (engine stage E36)`）；`fields` 的 `.data.KEY` 是儲存的文字（Secret 是 base64） |
| `kube-pod` 的 `env` 與 `file` | kube-config 上 `env` 比對 kubelet 為這次執行解析的變數（valueFrom、envFrom；容器還沒建立時沒有），`file` 看得到 configMap／secret Volume 與 subPath（跟隨連結） |

都在檢查前 settle 到時鐘、不移動時鐘。`TERMINAL_CHECK_KINDS` 加上 `kube-config`。

## 10. 偏差（刻意的模型）

- **同步延遲**：真實的 kubelet 以週期性同步（預設 1 分鐘）加上快取的 TTL 決定，延遲在幾秒到一兩分鐘之間；這裡固定是最後一次改變的 60 秒後，可以寫進課文與檢查。60 秒內改了兩次只會看到最後的內容。
- **FailedMount 的退避**：真實的是 500 毫秒起加倍到 2 分 2 秒，並在 2 分 3 秒後另有一則「Unable to attach or mount volumes: … timed out waiting for the condition」；這裡是 1、2、4…最多 122 秒，沒有那則逾時事件。
- **CreateContainerConfigError 的重試**：真實的 pod worker 有抖動（jitter）；這裡固定 10 秒。
- **環境變數的順序**：kubelet 以 map 組合，`env` 的輸出順序真實是不固定的；這裡是 `envFrom`（每個來源鍵依字母）再 `env`，同名的保留第一次出現的位置、後面的值。`$(VAR)` 的展開不模擬。
- **環境變數名稱**：用嚴格的規則（`[-._a-zA-Z][-._a-zA-Z0-9]*`）；1.32 的 `RelaxedEnvironmentVariableValidation`（見 §14）若預設開啟，數字開頭的鍵不會被略過。
- **掛載的檔案不是唯讀的**：在 Pod 裡寫入 Volume 的檔案會進入容器的寫入層（真實的是 `Read-only file system`）；刪除來源後 Volume 保留檔案，但沒有之後的 FailedMount 事件。
- `binaryData`、其他 Secret 類型（basic-auth、ssh-auth、service-account-token）、`fieldRef`／`resourceFieldRef`（downward API）、`subPathExpr`、`projected` Volume 的組合、預設 ServiceAccount 的 `imagePullSecrets`、`kubectl create … --append-hash`、`kubectl set env` 只在課文。
- 映像的拉取只在真正拉取時讀 imagePullSecrets（真實的 kubelet 每次同步都讀，所以 FailedToRetrieveImagePullSecret 會更頻繁）。
- `create secret tls` 不檢查憑證的有效期限與用途；`docker-registry` 的 `--from-file`（現成的 `config.json`）不模擬。
- 一個 ConfigMap 或 Secret 的大小上限（1 MiB）不檢查；改用 40 個物件的上限。

## 11. 課程作者要知道的事

- 機器寫 `profile: 'kube-config'`；要用 `printenv` 的 Image 在 `commands` 列出它（`env` 已經在 E20 的清單）。
- **Secret 的值一律用明顯假的課程值**（含 lesson、fake、example 或 demo，不像任何真實 token 的格式），Registry 的 token 也一樣（E23 的規則會檢查）。
- 教「Secret 只是 base64」：`kubectl get secret db -o jsonpath='{.data.password}' | base64 -d`；教 `echo` 的換行：`echo -n`。`describe secret` 只印位元組數。
- `stringData` apply 會在 `last-applied-configuration` 留下明文；要教「manifest 裡不要放明文」時，用 `notPlainIn` 檢查學習者寫的檔案，參考解答用 `kubectl create secret generic … --dry-run=client -o yaml > secret.yaml`。
- 時間：缺來源的 Pod 每 10 秒（環境變數）或依 1、2、4…秒（Volume）再試，參考解答在建立來源後要 `sleep` 足夠（例如 Volume 等 10 秒以上、環境變數等 10 秒）。Volume 的更新要 `sleep 60`；同一課前面的改變會影響之後的時間戳記資料夾名稱，答案不要寫死資料夾名稱。
- 環境變數與 subPath 不更新是重點：示範時先改 ConfigMap、`sleep 60`，比較 Volume 的檔案、subPath 的檔案與 `printenv`，再 `kubectl rollout restart`（E34）。
- imagePullSecrets：Image 名稱要寫 Registry 的主機（`registry.example.com:5000/team/app:1.0`）；`kube.images[].nodes` 宣告節點已經有的私有 Image 會不需要登入就啟動，示範拉取失敗時不要宣告。
- 檢查用 `kube-config`（值、鍵、類型、immutable、`notPlainIn`）與 `kube-pod` 的 `env`／`file`；`kube-object` 的 `.data.X` 對 Secret 是 base64。

## 12. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e36.test.ts` | profile 與分界（以下的訊息、未知旗標、`base64` 不存在、Image 的 `printenv` 被拒）；`stringData` 合併、`-o yaml`、jsonpath 加 `base64 -d`、`get cm`／`get secret`、`describe` 的全文、`-o name`；apply 再合併與 `type` 不可變；`immutable`；嚴格解碼（Go 的 base64 位置、型別錯誤）、鍵、名稱、tls／dockerconfigjson、binaryData 與其他類型；`kube-root-ca.crt` 與新的命名空間；`create configmap` 的 literal（引號）、檔案、資料夾、env 檔；各種錯誤；generic／tls／docker-registry 與 `.dockerconfigjson`；`X509KeyPair` 的錯誤；`base64` 的換行、`-w 0`、`--wrap`、`echo` 的換行、空的輸入、UTF-8、解碼錯誤、`-i`、選項錯誤、`--version` |
| `tests/terminal-e36-pods.test.ts` | envFrom 與 secretKeyRef（`needsEnv` 的程式啟動、`printenv`、`env`）；CreateContainerConfigError 的事件與 10 秒重試、缺鍵；prefix、不合法的名稱事件、optional；atomic writer 的檔案、items、mode、defaultMode、subPath、optional 的空 Volume；FailedMount 的退避與掛上的時間、缺鍵；60 秒的更新與 subPath／環境變數不變、`rollout restart` 的新值；imagePullSecrets（沒有 Secret、錯的 token、沒有權限的使用者、正確、之後建立 Secret）；Pod 欄位的驗證、E38 與課文的欄位；檢查 `kube-config`、`kube-pod`、`kube-object` 的通過、訊息、說明與驗證；確定性 |
| `tests/support/config-fixture.ts` | 只供測試：kub-36（kube-config profile，E35 的機器的六個 Image 加上 `team/app:1.0`（需要 DB_PASSWORD）與私有 Registry 的 `registry.example.com:5000/team/private:1.0`），`~/k8s` 的 cm.yaml、secret.yaml、env.yaml、vol.yaml、web.crt、web.key、other.key |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `kube-config`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', 'E33', 'E34', 'E35', 'E36']`，KUB06 可以建立。

## 13. 只在課文說明、或不模擬的部分

Secret 的靜態加密、KMS 與外部 Secret（External Secrets、Sealed Secrets、Vault）；RBAC 對 Secret 的讀取權限；ServiceAccount token 與 `serviceAccountToken` 投射；downward API；`binaryData`；其他 Secret 類型；`kubectl create configmap --append-hash` 與 kustomize 的 configMapGenerator；`kubectl set env`、`kubectl edit`；immutable 對 API server 負載的好處；Reloader 之類自動重啟的工具。

## 14. 沒有把握的地方（依記得的格式寫，並在此註明）

- **API 的文字**：`illegal base64 data at input byte N` 的位置規則、`Secret.data of type []uint8`、`data[tls.key]: Required value`、`data[.dockerconfigjson]: Invalid value: "<secret contents redacted>": …` 之後的 JSON 錯誤句（這裡簡化成 `invalid character in JSON`）、`type: Invalid value: …: field is immutable`、`immutable` 的兩句與它們的順序、Pod 欄位驗證的各句（`must be a number between 0 and 0777 (octal), both inclusive`、`Not found`、`must be a relative path`、`may not be specified when \`value\` is not empty`、`must specify one of: \`configMapRef\` or \`secretRef\``）與欄位路徑。
- **kubelet**：`CreateContainerConfigError` 的事件文字與重試的間隔、`couldn't find key … in Secret ns/name`、InvalidEnvironmentVariableNames 的句子（鍵是否含 prefix）、`RelaxedEnvironmentVariableValidation` 在 1.32 是否已預設開啟（開啟時數字開頭的鍵不被略過，API 也接受更寬的名稱）、FailedMount 的句子（`configmap references non-existent config key`、`references non-existent secret key`）、FailedToRetrieveImagePullSecret 的句子、atomic writer 資料夾名稱的格式與掛載點的權限（0777／1777）。
- **containerd**：錯的密碼（`unexpected status from HEAD request … 401 Unauthorized`）與沒有權限（`server message: insufficient_scope: authorization failed`）的文字；真實的私有 Registry 回應依實作而不同。
- **kubectl**：`create configmap|secret` 的各種錯誤句（尤其 Secret 的 `failed to create secret secrets "db" already exists` 沒有冒號、`is not valid key name for a Secret`、沒有子指令時的訊息）、env 檔沒有 `=` 的行（真實的是取 kubectl 自己的環境變數）、`--dry-run=client -o yaml` 是否還有 `creationTimestamp: null`、`describe cm` 的空行數與 `BinaryData` 段、`describe secret` 沒有 Events、`describe pod` 的 `Environment Variables from:` 與 `<set to the key …>` 的寫法。
- **base64**：GNU 9.4 對沒有 `=` 的最後一組（這裡印出解得出的位元組再報 invalid input）、`=` 之後接著另一段 base64 的處理、`--version` 的版權年份。
- **kube-root-ca.crt**：註解 `kubernetes.io/description` 的全文；kubeadm 叢集的 kube-system 其實還有 coredns、kube-proxy、kubeadm-config、kubelet-config 等 ConfigMap 與 kube-public 的 cluster-info（這裡只有 kube-root-ca.crt）。
