# KUB-3 引擎階段 E39：`helm` profile（`helm*.ts`）

> 2026-11-24。給 Kubernetes 與可靠性工程島（[KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md)）：在 E38 的叢集（[KUB0_E38_KUBE_STORAGE](KUB0_E38_KUBE_STORAGE.md)）上加上 `helm` 指令（Helm v3.16.4 的子集）：工作站上的 chart 檔案、一個新的 Go `text/template` 引擎與 sprig 子集、values 的優先順序、存成 Secret 的 release、install／upgrade／rollback／uninstall 與 `--wait`／`--atomic`、`list`／`status`／`history`／`get`、`template`／`lint`／`create`／`package`、虛構的儲存庫 `https://charts.example.test`（`repo`、`search`、`pull`、`show`），以及檢查 `helm-release`。E1–E38 的行為與所有已發布的課逐字不變（全部終端機課的重播測試照舊通過）；`kube-storage` 以下的 profile 沒有 `helm`（`bash: helm: command not found`，清單不變）。`storage-net-cli.ts` 的 `goTemplate`（docker inspect `--format`）沒有改動。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `HELM_PROFILE`（RANK 39） | `kube-storage` 的一切加上 feature `helm` 與 `E39_COMMANDS = ['helm']`。課程機器寫 `profile: 'helm'` |
| profile 以下 | `helm` 不是指令；課程資料 `kube.helm`：`kube: helm needs the helm profile (engine stage E39)`；檢查 `helm-release`：`a helm-release check needs a helm machine (engine stage E39)` |
| 開關 | `KubeState.helm`（`buildKube` 在 helm profile 設定）：儲存庫的 chart 與發布時間。release 本身是叢集裡的 Secret，不另存狀態 |

程式的分工（每個新檔案都不到 230 行）：`helm-value.ts`（值的模型：float64、`GoInt`、`GoStruct`、fmt 的 `%v`、`printf`、`toYaml`）、`helm-tpl-lex.ts`、`helm-tpl-node.ts`、`helm-tpl-parse.ts`、`helm-tpl-exec.ts`、`helm-tpl-funcs.ts`（Go template 引擎）、`helm-values.ts`（`--set`、合併、coalesce）、`helm-chart.ts`（載入 chart、資料夾與封存檔、semver）、`helm-render.ts`（算繪、排序、錯誤文字）、`helm-release.ts`（Secret 的編碼、表格、狀態區塊）、`helm-apply.ts`（建置、擁有權、建立／更新／刪除、`--wait`）、`helm.ts`（指令與旗標）、`helm-install.ts`、`helm-info.ts`、`helm-repo.ts`、`helm-tools.ts`、`helm-scaffold.ts`、`helm-lesson.ts`、`helm-checks.ts`。既有檔案只多了 helm 才走到的分支：`shell.ts`（profile、指令、說明）、`manual.ts`（`HELM_MANUAL`）、`kube-model.ts`（`helm`）、`kube-lesson.ts`（`kube.helm`、開機的 release、`~/.config/helm`）、`kube-write.ts`（`applyDoc` 的可選參數 `helm`：以上一版 manifest 做三方合併、不寫 last-applied）、`yaml.ts`（可選的 `flowNext`，只有 Helm 傳）、`lesson.ts`、`server-lesson.ts`、`lessons.ts`（`KUBE_STAGES_BUILT` 加上 `E39`）。

## 2. Go template 引擎（`helm-tpl-*.ts`、`helm-value.ts`）

依 Go 1.22（Helm v3.16 的建置版本）的 `text/template` 寫成：

- **語法**：`{{ }}`、`{{- `／` -}}` 修剪空白（減號旁要有空白，`{{-3}}` 是數字）、`{{/* 註解 */}}`、管線 `|`、括號、變數 `$x :=`、`$x =`、`$`、`if`／`else if`／`else`、`with`／`else`、`range`（清單、map 依鍵排序、`$i, $v :=`、`else`、`break`、`continue`）、`define`、`template`、`block`、字串（`"…"` 的 Go 跳脫、`` `…` ``）、字元常數、整數（十六、八、二進位）與浮點數、`nil`、`true`／`false`。
- **檔案的組合**：templates/ 底下的每個檔案解析進同一組；深的路徑先、同深度依反向字母順序解析，所以同名的 `define` 由字母順序最前的檔案勝出；同一個檔案裡同名兩次是 `multiple definition of template "x"`。
- **值與型別**：values 的數字是 float64（`{{ .Values.n }}` 的 1000000 印成 `1e+06`、`printf "%d"` 印成 `%!d(float64=3)`），`--set` 的整數是 int64，常數與 `len` 是 int。map 與清單裡的值是 `interface {}`，所以錯誤文字依 Go：`nil pointer evaluating interface {}.tag`、`can't evaluate field x in type interface {}`、`wrong type for value; expected string; got interface {}`（直接的參數）、`invalid value; expected string`（管線傳來的 nil）、`wrong type for value; expected int; got float64`、`expected string; found 5`、`wrong number of args for default: want at least 1 got 0`、`error calling eq: incompatible types for comparison`（float64 與 int 常數比較）、`range can't iterate over 5`、`template "x" not defined`。
- **缺少的值**：Helm 的 `missingkey=zero`：不存在的鍵是 nil，印出 `<no value>` 後由 Helm 刪掉，所以是空字串；`quote` 略過 nil（`quote .Values.none` 是空的）。
- **錯誤的位置**：`template: web/templates/x.yaml:行:欄: executing "名稱" at <內容>: 訊息`，欄是該行的位元組偏移（0 起算）；欄位鏈（`.Values.image.tag`）的位置是第二段 `.image` 的位置（parse.go 建 chain 的位置）。`include` 包住內層的錯誤（`error calling include: template: …`）；`required` 與 `fail` 成為 `execution error at (最外層的位置): 訊息`。解析錯誤是 `parse error at (web/templates/x.yaml:行): 訊息`（`function "foo" not defined`、`unexpected EOF`、`unexpected {{end}}`、`unexpected "}" in operand`、`unclosed action`、`unterminated quoted string`、`undefined variable "$y"`）。
- **函式**：內建的 `and`、`or`（短路、回傳值本身）、`not`、`len`、`index`、`print`、`printf`、`println`、`eq`、`ne`、`lt`、`le`、`gt`、`ge`；sprig 子集 `default`、`empty`、`required`、`toYaml`、`toJson`、`nindent`、`indent`、`trunc`、`trimSuffix`、`trimPrefix`、`trim`、`upper`、`lower`、`replace`、`contains`、`b64enc`、`sha256sum`、`toString`、`int`、`quote`、`list`、`dict`、`hasKey`、`ternary`、`join`、`fail`；Helm 的 `include`（遞迴 1000 層上限）、`tpl`。各自依 Go 的簽章轉換與檢查參數。其他函式是解析錯誤 `function "x" not defined`。
- **物件**：`.Values`、`.Release`（Name、Namespace、Revision、IsInstall、IsUpgrade、Service）、`.Chart`（`*chart.Metadata`：Name、Version、AppVersion、Description、Type、APIVersion、Icon…）、`.Capabilities`（KubeVersion 的 Version／Major／Minor 與印出時的 `v1.32.3`、`APIVersions.Has`、HelmVersion）、`.Template`（Name、BasePath）、`.Files.Get`（templates/、Chart.yaml、values.yaml 以外的檔案）。
- 上限：一次算繪最多 200000 步（超過時是模擬環境的說明）。

## 3. values（`helm-values.ts`）

values.yaml 與 `-f` 檔案依 sigs.k8s.io/yaml 讀（數字是 float64；只有 `true`／`false` 是布林，同 kubectl 的 YAML 子集）。使用者的值：`-f` 檔案依序深度合併（後面的勝出），再套上 `--set`、`--set-string`（strvals：`a.b=c`、`a[0]=x`、`a[0].b=c`、`{x,y}` 清單、`\,`、`\.` 跳脫；`--set` 的 `true`／`false`／`null`／不以 0 開頭的整數有型別，其他（包括 `1.5`、`007`）是字串；錯誤：`key "b" has no value`）。計算後的值是 chart 的 values.yaml 被使用者的值覆蓋（map 逐鍵合併，使用者的 `null` 刪掉預設值）。

`helm upgrade` 的值：`--reuse-values` 是上一版的使用者值加上這次的（這次勝出），預設值用上一版算好的值（Helm 的行為：新 chart 的預設值被忽略）；`--reset-values` 只用這次的；兩者都沒寫時，**沒有給任何 `-f`／`--set` 就沿用上一版的使用者值**，有給就只用這次的。

## 4. chart（`helm-chart.ts`）

chart 是工作站上的資料夾（`./web`、`web`）、`helm package`／`helm pull` 的封存檔（E22 的 tar 格式，gzip，一個頂層資料夾），或儲存庫的 `REPO/NAME`。載入時依 Helm 的 `Metadata.Validate`：`Chart.yaml file is missing`、`validation: chart.metadata.apiVersion is required`、`… name is required`、`… version is required`、`chart.metadata.version "x" is invalid`、`chart.metadata.type must be application or library`；library chart 是 `library charts are not installable`。路徑找不到：`path "./nope" not found`；不是封存檔：`file './x' does not appear to be a gzipped archive; got 'text/plain; charset=utf-8'`；chart 最多 30 個檔案。`dependencies` 與 `charts/` 裡的子 chart 只在課文說明。

## 5. 算繪（`helm-render.ts`）

每個不以 `_` 開頭的檔案以 `.Template.Name` 執行、刪掉 `<no value>`；`NOTES.txt` 成為 notes；其他依 SplitManifests 在 `---` 切開（修剪、略過空的），每份以 YAML 讀出 kind（錯誤：`YAML parse error on web/templates/x.yaml: error converting YAML to JSON: yaml: line 7: …`），再依 Helm 的 InstallOrder 排序（Namespace、NetworkPolicy、ResourceQuota、LimitRange、…、ServiceAccount、Secret、ConfigMap、StorageClass、PV、PVC、…、Service、DaemonSet、Pod、ReplicaSet、Deployment、HPA、StatefulSet、Job、CronJob、IngressClass、Ingress…；不認得的 kind 排在後面、依 kind 的字母），同 kind 依檔案路徑與檔內順序。release 的 manifest 是 `---\n# Source: web/templates/x.yaml\n內容\n` 的串接。YAML 子集多讀一種寫法：鍵的下一行單獨寫一個 `{}` 或 `[]`（`resources:\n  {}`，`toYaml | nindent` 常見的結果）。帶 `helm.sh/hook` 註解的文件是模擬環境的說明（hook 只在課文）。

## 6. release 與 Secret（`helm-release.ts`）

每個 revision 一個 Secret `sh.helm.release.v1.NAME.vN`（release 的命名空間），type `helm.sh/release.v1`，標籤 `name`、`owner=helm`、`status`、`version`、`createdAt`（與更新時的 `modifiedAt`，Unix 秒數）；`kubectl get secrets` 看得到。`data.release` 在真實的 Helm 是 release JSON 經 gzip 再 base64；這裡是 **release JSON 直接 base64**（文件化的簡化：看起來是 base64、解兩次得到 JSON 而不是 gzip，練習不會用到它）。JSON 的欄位：`name`、`namespace`、`version`、`info`（`first_deployed`、`last_deployed`、`deleted`、`description`、`status`、`notes`）、`chart`（`metadata`、`values`）、`config`（使用者的值）、`manifest`。刪掉 Secret 等於刪掉歷史（同真實）。歷史最多保留 10 個 revision（`--history-max` 的預設，不刪 deployed 的那個）。

STATUS：`deployed`、`failed`、`superseded`、`uninstalled`，以及只在指令執行中存在的 `pending-install`、`pending-upgrade`、`pending-rollback`（`--dry-run` 印出 pending 的狀態）。DESCRIPTION：`Install complete`、`Upgrade complete`、`Rollback to N`、`Uninstallation complete`、`Release "web" failed: …`、`Upgrade "web" failed: …`、`Rollback "web" failed: …`、`Dry run complete`。

## 7. 對叢集做的事（`helm-apply.ts`、`helm-install.ts`）

- **建置**：每份 manifest 先經 kubectl 的解碼與 schema（`kube-write.ts` 的 `checkDoc`）；這一步的錯誤（未知的欄位、還沒模擬的 kind 或欄位、`no matches for kind`）是 `unable to build kubernetes objects from release manifest: …`，不留下 release。API server 的驗證錯誤（`The Deployment "web" is invalid: …`）與命名空間不存在在建立時才出現，release 成為 failed。
- **擁有權**：已經存在、但沒有這個 release 的標籤與註解的物件，install 停在 `Unable to continue with install: ConfigMap "web-config" in namespace "default" exists and cannot be imported into the current release: invalid ownership metadata; label validation error: missing key "app.kubernetes.io/managed-by": must be set to "Helm"; annotation validation error: …`（upgrade 是 `Unable to continue with update`）；有正確中繼資料的物件被接手（adopt）。
- **建立**：依排好的順序，每個物件加上標籤 `app.kubernetes.io/managed-by: Helm` 與註解 `meta.helm.sh/release-name`、`meta.helm.sh/release-namespace`，經 kube-write.ts 建立（沒有 kubectl 的 last-applied 註解）；控制器在同一秒開始工作（同 kubectl apply）。命名空間不存在：`create: failed to create: namespaces "prod" not found`；`--create-namespace` 建立它（標籤 `name: prod`）。
- **upgrade 與 rollback**：新 manifest 裡的物件以「上一版 manifest、線上物件、新 manifest」三方合併更新（map 逐鍵、清單整個取代，同 E32 的 apply），不存在的就建立，上一版有、新版沒有的物件刪除（Helm 的 uninstall 順序）。rollback 以舊 revision 的 chart、值與 manifest 建立**新的** revision（`Rollback to 1`），之前 deployed 的成為 superseded。
- **`--wait`**（`--atomic` 也會等）：每 2 秒檢查一次（時鐘直接跳到叢集的下一個步驟，再對齊 2 秒），直到 Helm 的就緒條件成立或 `--timeout`（預設 `5m0s`，Go 的 duration）。條件：Deployment 的新 ReplicaSet `readyReplicas ≥ replicas − maxUnavailable`（暫停的 Deployment 視為就緒）；StatefulSet 的 observedGeneration、updatedReplicas、readyReplicas 與 revision；Pod 的 Ready；Service 有 ClusterIP，LoadBalancer 要有位址（沒有位址池的 LB 會一直等到逾時）；PVC 是 Bound；其他物件存在即可。逾時：`context deadline exceeded`，revision 成為 failed（install：`INSTALLATION FAILED: context deadline exceeded`；upgrade：`UPGRADE FAILED: …`，上一個 deployed 的 revision 不變）。
- **`--atomic`**：install 失敗時解除安裝（刪掉物件與歷史）：`INSTALLATION FAILED: release web failed, and has been uninstalled due to atomic being set: context deadline exceeded`；upgrade 失敗時以 `--wait` 回到最後一個 superseded 或 deployed 的 revision：`UPGRADE FAILED: release web failed, and has been rolled back due to atomic being set: …`（歷史：failed 的 revision 之後多一個 `Rollback to N`）。
- **uninstall**：依 Helm 的 UninstallOrder 刪除 manifest 的物件（Pod 在 probes profile 優雅結束，其他經 GC），再刪掉全部 revision；`--keep-history` 則把最後一個 revision 記成 uninstalled（`helm list -a`、`helm status`、`helm history` 看得到，`helm rollback` 可以復原）。

## 8. 指令（`helm.ts`、`helm-install.ts`、`helm-info.ts`）

旗標依 pflag（`--x=v`、`--x v`、`-n v`、`-nv`、可重複的 `-f`、`--set`）；叢集與命名空間是 kubectl 的（`~/.kube/config` 的 context 與它的 namespace，`-n` 覆蓋，`--kube-context`）；沒有叢集：`Error: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp 127.0.0.1:8080: connect: connection refused`。錯誤一律 `Error: …`、結束碼 1。

| 指令 | 輸出 |
|---|---|
| `helm version [--short]` | `version.BuildInfo{Version:"v3.16.4", GitCommit:"7877b45b63f95635153b29a42c0c2f4273ec45ca", GitTreeState:"clean", GoVersion:"go1.22.7"}`；`v3.16.4+g7877b45` |
| `install NAME CHART`／`install CHART --generate-name` | 狀態區塊：`NAME:`、`LAST DEPLOYED: Tue Nov 24 10:00:00 2026`（Go 的 ANSIC，UTC）、`NAMESPACE:`、`STATUS:`、`REVISION:`、`TEST SUITE: None`、`NOTES:` 與修剪過的 notes。`--generate-name` 是 `chart 名稱-Unix 秒數`。`--dry-run` 另印 `HOOKS:`、`MANIFEST:` 與 manifest，不改變叢集。錯誤：`cannot re-use a name that is still in use`、release 名稱的 regex 句、`must either provide a name or specify --generate-name`、`"helm install" requires at least 1 argument` 加 Usage |
| `upgrade NAME CHART [--install]` | `Release "web" has been upgraded. Happy Helming!` 加狀態區塊；`--install` 而 release 不存在：`Release "web" does not exist. Installing it now.` 再安裝；`"web" has no deployed releases` |
| `rollback NAME [REV] [--wait]` | `Rollback was a success! Happy Helming!`；`release has no 9 version`、`could not convert revision to a number: …` |
| `uninstall NAME… [--keep-history]` | `release "web" uninstalled`；`uninstall: Release not loaded: web: release: not found`、`the release named "web" is already deleted` |
| `list [-A] [-a] [-q] [--deployed --failed --pending --superseded --uninstalled]` | `NAME NAMESPACE REVISION UPDATED STATUS CHART APP VERSION`：gosuri/uitable 的格式（每格補空白到欄寬、以 tab 連接，最後一欄也補空白）；UPDATED 是 Go 的 `Time.String()`（`2026-11-24 10:00:00 +0000 UTC`）；預設只列 deployed 與 failed，每個 release 最新的 revision，依名稱排序 |
| `status NAME [--revision N]` | 狀態區塊；`release: not found` |
| `history NAME [--max N]` | `REVISION UPDATED STATUS CHART APP VERSION DESCRIPTION`（uitable，欄寬上限 60，超過以 `...` 截斷） |
| `get values NAME [--all] [-o yaml\|json]`、`get manifest`、`get notes` | `USER-SUPPLIED VALUES:` 加 YAML（沒有時是 `null`）、`--all` 是 `COMPUTED VALUES:`；manifest 原文（最後一行空白）；`NOTES:` 加 notes |
| `template [NAME] CHART [-s templates/x.yaml]` | manifest（名稱預設 `release-name`，`.Capabilities.KubeVersion` 是 helm template 的預設 `v1.31.0`，不連叢集）；`could not find template templates/x.yaml in chart` |

不模擬（模擬環境的說明）：`dependency`、`plugin`、`registry`、`push`、`test`、`verify`、`completion`、`env`、`get all|hooks|metadata`、`show crds`、`search hub`、`-o json|yaml` 的 list／status／history。

## 9. 儲存庫（`helm-repo.ts`）

唯一的儲存庫主機是虛構的 `https://charts.example.test`，提供課程宣告的 chart（各有發布時間）。`helm repo add NAME URL` 寫入 `~/.config/helm/repositories.yaml`（0600，sigs.k8s.io/yaml 的格式）並快取當時的索引 `~/.cache/helm/repository/NAME-index.yaml`（`entries` 依版本新到舊、`created`、`digest`、`urls`）；`search`、`pull`、`show`、`install REPO/NAME` 讀快取，所以之後才發布的版本要 `helm repo update` 才看得到。其他主機：`looks like "URL" is not a valid chart repository or cannot be reached: Get "URL/index.yaml": dial tcp: lookup HOST on 127.0.0.53:53: no such host`。

`repo add`（同名同 URL：`"example" already exists with the same configuration, skipping`；同名不同 URL：`repository name (example) already exists, please specify a different name`）、`repo list`（`no repositories to show`）、`repo update`（`Hang tight while we grab the latest from your chart repositories...`、`...Successfully got an update from the "example" chart repository`、`Update Complete. ⎈Happy Helming!⎈`；`no repositories found. You must add one before updating`）、`repo remove`；`search repo [關鍵字] [--versions] [--version]`（`NAME CHART VERSION APP VERSION DESCRIPTION`，欄寬上限 50，預設每個 chart 最新的非 prerelease 版本；`No results found`；`no repositories configured`）；`pull REPO/NAME [--version] [-d 資料夾]` 寫 `NAME-VERSION.tgz`，`--untar [--untardir]` 寫 chart 資料夾（已存在：`failed to untar: a file or directory with the name web already exists`）；`show values|chart|readme|all CHART`（values 是 values.yaml 原文，chart 是 Chart.yaml 欄位的 YAML）。找不到：`repo nope not found`、`chart "web" matching 9.9.9 not found in example index. (try 'helm repo update'): no chart version found for web-9.9.9`、`chart "nope" matching  not found in example index. (try 'helm repo update'): no chart name found`。

## 10. create、package、template、lint（`helm-tools.ts`、`helm-scaffold.ts`）

- **`helm create NAME`**：`Creating NAME`；寫入縮減版的範本：Chart.yaml（`version: 0.1.0`、`appVersion: "1.16.0"`）、values.yaml（replicaCount、image `nginx`、tag `""`、nameOverride、fullnameOverride、podAnnotations、podLabels、service ClusterIP 80、resources、nodeSelector、tolerations、affinity）、`.helmignore`、`charts/`、templates/ 的 `_helpers.tpl`（`NAME.name`、`NAME.fullname`、`NAME.chart`、`NAME.labels`、`NAME.selectorLabels`，同 Helm）、`deployment.yaml`、`service.yaml`、`NOTES.txt`（NodePort 與 ClusterIP 兩種說明）。省略 ingress.yaml、hpa.yaml、serviceaccount.yaml、tests/、探針、Volume 與 securityContext（模擬環境的範本，文件化的縮減）。已存在的檔案：`WARNING: File "web/values.yaml" already exists. Overwriting.`。
- **`helm package DIR [-d]`**：`Successfully packaged chart and saved it to: /home/learner/web-0.1.0.tgz`（E22 的 tar 格式，`tar tzf` 讀得懂，`helm install x ./web-0.1.0.tgz` 可以安裝）。
- **`helm lint [PATH…]`**：`==> Linting ./web`，訊息，空行，`1 chart(s) linted, 0 chart(s) failed`；有 ERROR 時最後一行是 `Error: 1 chart(s) linted, 1 chart(s) failed`、結束碼 1。規則：`[ERROR] Chart.yaml: name is required`、`apiVersion is required. The value must be either "v1" or "v2"`、`version is required`、`version 'x' is not a valid SemVer`、`[INFO] Chart.yaml: icon is recommended`、`[ERROR] values.yaml: unable to parse YAML: …`、`[INFO] values.yaml: file does not exist`、`[WARNING] templates/: directory does not exist`、`[ERROR] templates/: <算繪錯誤>`、`[ERROR] templates/x.yaml: unable to parse YAML: …`、`object name does not conform to Kubernetes naming requirements`。lint 以 release 名稱 `test-release` 算繪，`required` 與 `fail` 不會失敗（Helm 的 lint 模式）。

## 11. 課程資料（`helm-lesson.ts`）

```ts
kube: {
  …E32–E38 的欄位,
  helm?: {
    charts?: [{ files: { 'Chart.yaml': '…', 'values.yaml': '…', 'templates/deployment.yaml': '…' }, published?: '2026-11-24 10:01:00' }],
    repos?: [{ name: 'example', url: 'https://charts.example.test' }],
    releases?: [{ name: 'shop', chart: 'web', version?: '0.1.0', values?: 'replicaCount: 3\n', namespace?: 'default', at?: '2026-11-24 09:00:00' }],
  },
}
```

- `charts`：儲存庫提供的 chart（最多 6 個，每個最多 30 個檔案、每個檔案最多 4000 字；名稱與版本不重複；`published` 預設是叢集建立的時間，可以晚於 now 一天以內——用 `sleep` 之後的 `helm repo update` 才看得到）。工作站上的 chart 資料夾照一般的 `files` 寫。
- `repos`：開機時已加入的儲存庫（寫入 `repositories.yaml` 與當時的索引）。
- `releases`：開機時依 `at` 的順序安裝；同一個名稱再出現是 upgrade（沒有 values 時沿用上一版，同 §3），可以做出有歷史的 release 讓學習者 upgrade、rollback。命名空間不存在時自動建立。不支援 `--wait`（開機的物件依時間由控制器推進，同開機的 manifest）。
- 驗證：`kube: helm.charts[0]: validation: chart.metadata.version is required`、`kube: helm.repos are at most 4 of { name, url: https://charts.example.test }, each name once`、`kube: helm.releases[0]: no chart nope among helm.charts`、安裝失敗時是 Helm 的錯誤（`kube: helm.releases[0]: INSTALLATION FAILED: template: …`）。

## 12. 檢查 `helm-release`（`helm-checks.ts`）

| 欄位 | 意義 |
|---|---|
| `name`、`namespace?`（預設 default） | release；看最新的 revision |
| `absent?` | 沒有任何 revision（`--keep-history` 的 uninstalled 仍算存在） |
| `status?` | deployed、failed、superseded、uninstalled、pending-* |
| `revision?`、`revisionsAtLeast?` | 最新的 revision 編號；歷史至少幾個 revision |
| `chart?`、`chartVersion?`、`appVersion?` | Chart.yaml 的 name、version、appVersion |
| `values?` | `{ 'image.tag': '1.28', replicaCount: 3, 'hosts[0]': 'a' }`：**計算後的值**（chart 預設加上使用者的值）在點路徑的值，以文字比較（3 等於 "3"，`null` 是沒有設定） |

說明例：`default 命名空間應該有名為 web 的 Helm release（狀態 deployed、revision 2、chart web 0.1.0、appVersion 1.27、值 image.tag=1.28、值 replicaCount=3、至少 2 個 revision）`；訊息例：`它的 revision 是 1`、`它的值 replicaCount 是 2`、`它的狀態是 failed`、`沒有名為 web 的 Helm release`。檢查在 settle 之後讀 release Secret，不移動時鐘。Helm 建立的物件照舊用 `kube-object`、`kube-workload`、`kube-service` 等檢查（帶著 Helm 的標籤與註解）。

## 13. 偏差（刻意的模型）

- **release 的資料**：base64 的 JSON，不是 gzip；沒有 hooks、`labels` 欄位與 chart 的 templates 內容（rollback 用存下的 manifest，同真實）。
- **Go template**：只有 §2 的函式；Go 1.22 的 range 整數、`else with`、`html`／`js`／`urlquery`／`slice`／`call` 沒有；方法只有 `.Files.Get`、`.Capabilities.APIVersions.Has`、`KubeVersion.GitVersion`；`trunc`、`len` 以字元或位元組（ASCII 相同）；`printf` 只有 `%s %v %d %q %t %f %x %%` 與寬度、精度；Go 的 panic（例如對 invalid 值呼叫 `len`）以 Go 的錯誤字串回報。YAML 子集（E23）的限制照舊：錨點、多行純量等被拒絕；`yes`／`no` 不是布林。
- **values 的警告**：Helm 合併表格與非表格時的 `coalesce.go: warning: …` 不印出。
- **套用**：建置錯誤的文字沿用 kubectl 的解碼訊息（真實的 Helm 用 OpenAPI 驗證，文字不同）；三方合併是 E32 的 map 合併（清單整個取代），不是 strategic merge patch；`--force`、`--cleanup-on-fail`、`--wait-for-jobs`、`--history-max`（固定 10）、`--replace` 不模擬。
- **時間**：`--wait` 以 2 秒的輪詢對齊叢集的步驟；`LAST DEPLOYED` 用指令開始的時間；時間只有整秒（UPDATED 沒有奈秒）、一律 UTC。
- **儲存庫**：只有 charts.example.test；沒有 TLS、帳號、OCI（`oci://`）、`--devel` 與版本範圍；`curl https://charts.example.test/index.yaml` 不通（儲存庫是 helm 內建的模擬，不是 E12 的 responder）。
- **範本**：`helm create` 是縮減版（§10）；它的 Image `nginx:1.16.0` 要在課程的 `docker.images` 與 `kube.images` 才拉得到，否則 Pod 是 ErrImagePull、`--wait` 逾時。

- KUB-3 整合時修正：開機時的 release（`kube.helm.releases`）依時間逐一在各自的時刻安裝——時鐘先移到那個時刻再 install／upgrade，最後放回，所以各 revision 的 Secret 與 LAST DEPLOYED 帶著各自的時間（原本 Secret 的 AGE 都是 0s）。叢集不在兩個 release 之間 settle（那會讓每台機器建立時都從叢集建立時重播一次，KUB09 的驗證從 0.6 秒變成 42 秒），所以開機的升級只留下最後一個 revision 的 ReplicaSet，中間 revision 的 rollout 不會重現；課程不要以開機歷史中間 revision 的 ReplicaSet 出題。

## 14. 課程作者要知道的事

- 機器寫 `profile: 'helm'`；chart 放在工作站（`files`）或 `kube.helm.charts`（儲存庫）。chart 用到的 Image 要宣告在 `docker.images` 與 `kube.images`（拉取秒數決定 `--wait` 的時間）。
- 只用 §2 的函式；寫 `{{ .Values.x | default "y" }}` 之類的管線時注意 values 的數字是 float64：`eq .Values.replicas 1` 是錯誤（`incompatible types for comparison`），改用 `eq (int .Values.replicas) 1` 或字串；`printf "%d"` 對 values 的數字印出 `%!d(float64=…)`。
- `helm upgrade` 沒有 `-f`／`--set` 時沿用上一版的值；要回到 chart 的預設值用 `--reset-values`。這是常見的陷阱，課文可以教。
- 練習要等物件就緒時用 `--wait`（或 `kubectl rollout status`）；檢查不移動時鐘。`--atomic` 失敗時會花掉 `--timeout` 的時間，課文用短的 `--timeout 30s`。
- 名稱：`helm install web ./web` 的物件名稱取決於 chart 的 `fullname` 範本（release 名稱含 chart 名稱時就是 release 名稱）；檢查用 `helm-release` 的 `values` 與 `kube-workload` 的名稱時要算對。
- `kubectl get secrets` 會看到 `sh.helm.release.v1.*`；用 `kubectl delete secret` 刪掉它們等於刪掉 release 的歷史（物件留著），可以拿來說明 release 存在哪裡。
- 之後才發布的版本（`published`）配合 `sleep` 與 `helm repo update` 示範索引快取；`helm search repo --versions` 列出全部。

## 15. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e39-template.test.ts` | 修剪、管線、變數與範圍、if／else if、with、range（清單、map 依鍵排序、break、continue、else）、define／include／template 與 nindent、同名 define、sprig 子集、`.Chart`／`.Capabilities`／`.Template`／`.Files`、float64 與 int64、缺少的值、Go 的執行與解析錯誤、required／fail 的位置、tpl、manifest 的切分與排序；values 的優先順序與 `--set` 的語法 |
| `tests/terminal-e39.test.ts` | profile 與分界、`helm version`、課程資料的驗證、開機的 release 與儲存庫；install 的輸出、list、status、Secret 與標籤、擁有權、錯誤；upgrade 的值（`-f`、`--set`、沿用、reset、reuse）、刪除不再有的物件、rollback、history、uninstall 與 `--keep-history`、get、dry-run |
| `tests/terminal-e39-wait.test.ts` | `--wait` 的時間（2 秒的輪詢）、逾時與 failed、失敗後的 upgrade、LoadBalancer 的位址；`--atomic` 的 install 與 upgrade |
| `tests/terminal-e39-tools.test.ts` | `helm create` 的範本（lint、template、安裝）、lint 的訊息、template `-s`、package；儲存庫（add、list、update、remove、search、pull、`--untar`、show、依版本安裝）；檢查 `helm-release`（說明、訊息、檢查的檢查）與 Helm 建立的物件上的 `kube-workload`、`kube-object` |
| `tests/support/helm-fixture.ts` | 只供測試：kub-39（helm profile，E38 的機器加上 ~/web chart、~/prod.yaml、儲存庫的 web 0.1.0 與 10:01 發布的 0.2.0） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 加上 `helm`；`tests/kube-capability.test.ts` 的 `KUBE_STAGES_BUILT` 成為 `['E32', …, 'E39']`，KUB09 可以建立。

## 16. 沒有把握的地方（依記得的格式寫，並在此註明）

- **版本**：Helm v3.16.4 的 GitCommit（`7877b45b…`）與 GoVersion（`go1.22.7`）；`helm template` 的預設 KubeVersion `v1.31.0`（client-go v0.31）。
- **Go template**：欄位鏈的錯誤位置是第二段（`.image`）的位置；range 的錯誤內容是整個 `{{range …}}…{{end}}`；`required`／`fail` 的 `execution error at (…)` 取最外層的位置（Helm 3.16 是否改成多層的 trace）；`fail` 是否也被改寫；`tpl` 解析錯誤的包裝文字；`len` 對 invalid 值的 panic 文字。
- **Helm 的文字**：`helm list` 是否限制欄寬、時間的奈秒；`history` 的欄寬 60 與 `search` 的 50；release Secret 的 `createdAt`／`modifiedAt` 標籤；`get values` 沒有值時印 `null`；upgrade 的 dry-run 是否印 `has been upgraded`；`upgrade --install` 遇到 uninstalled（保留歷史）的 release；rollback 失敗時的錯誤包裝；`uninstall` 已刪除時的訊息；`lint` 對不存在的路徑、缺少 templates/ 與 values.yaml 的訊息與順序；`create` 遇到已存在的資料夾；`package` 找不到路徑；`repo add` 連不到主機的整句與 `repositories.yaml` 的權限；`pull` 找不到版本的句子（兩個空白）。
- **就緒條件**：Helm 3.16 ReadyChecker 的細節（Deployment 的 observedGeneration、DaemonSet、Job 不等待）；逾時的錯誤是否附上未就緒的資源（3.17 之後才有）。
- **建置與擁有權**：建置錯誤的整句（OpenAPI 的 `ValidationError(...)` 寫法）、建立失敗時是否加 `failed to create resource` 前綴、擁有權錯誤對叢集範圍物件的 `in namespace ""`。
- 版本見 [KUB0_KUBERNETES_CAPABILITY](KUB0_KUBERNETES_CAPABILITY.md) §8。
