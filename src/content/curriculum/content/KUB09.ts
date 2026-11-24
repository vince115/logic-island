/*
 * KUB09 Helm charts (KUB-3, terminal-sim; the blueprint's cluster-sim activity as terminal content). A terminal lesson on
 * the helm profile (engine stages E32–E39): the made-up shop team's workstation ops-ws (user yuki) with kubectl, helm and
 * the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02). ~/shop/catalog is the team's chart
 * (0.4.0, appVersion 2.2: a ConfigMap from range over .Values.config, a Service, a Deployment with a checksum/config
 * annotation, include/nindent helpers and NOTES.txt); values-staging.yaml and values-prod.yaml hold each environment's
 * differences. The platform team's repository (the fictional https://charts.example.test) serves catalog 0.3.0 (2.1),
 * 0.4.0 (2.2) and, on the main workstation, 0.4.1 published at 10:05. shop/catalog:2.3 was never pushed, so a release that
 * asks for it never becomes ready. Covered: why a package manager (many manifests, per-environment differences, versioned
 * releases, rollback); a chart's anatomy (Chart.yaml version vs appVersion, values.yaml, templates/, _helpers.tpl,
 * NOTES.txt); template syntax (.Values, default, quote, toYaml | nindent, include, if/with/range, whitespace trimming,
 * float64 numbers) with helm template and helm lint; values per environment and their precedence; install, list, status,
 * history, get, uninstall and release Secrets; upgrade's values rules (reuse when none given, --reuse-values,
 * --reset-values); --wait, --atomic and helm rollback; repositories (repo add/update, search, show, pull, install
 * --version); secrets in values files; Helm vs plain manifests and Kustomize as prose. Dependencies, hooks, helm test and
 * OCI registries are prose only. Pod and ReplicaSet names are hashes: commands never hard-code them. Hosts, users, images,
 * the repository and the cluster are made up. Every transcript output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'printenv', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The shop's services: each keeps running, logs one line and handles SIGTERM in a second.
const service = (name: string, port: number, log: string, created: string): TerminalImage => ({
  name, size: 46_000_000, created, cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
  logs: [log], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } },
});
// shop/catalog:2.3 was never pushed: a release that asks for it never pulls its image. cart's image is on no node yet (a 2 s pull).
const IMAGES: TerminalImage[] = [
  service('shop/catalog:2.1', 8080, 'catalog 2.1 listening on :8080', '2026-11-10 09:00:00'),
  service('shop/catalog:2.2', 8080, 'catalog 2.2 listening on :8080', '2026-11-20 09:00:00'),
  service('shop/cart:1.0', 8081, 'cart 1.0 listening on :8081', '2026-11-12 09:00:00'),
];
const WORKERS = ['node-01', 'node-02'];
const KUBE_IMAGES: TerminalKube['images'] = [{ name: 'shop/catalog:2.1', nodes: WORKERS }, { name: 'shop/catalog:2.2', seconds: 3 }, { name: 'shop/cart:1.0', seconds: 2 }];

// The shop team's chart for catalog.
const chartYaml = (name: string, description: string, version: string, appVersion: string) =>
  yaml('apiVersion: v2', `name: ${name}`, `description: ${description}`, 'type: application', `version: ${version}`, `appVersion: "${appVersion}"`);
const CATALOG_CHART = (version: string, appVersion: string) => chartYaml('catalog', 'The shop product catalog service', version, appVersion);
const CATALOG_VALUES = yaml('# Defaults for every environment; values-<env>.yaml overrides them.', 'replicaCount: 1', 'image:', '  repository: shop/catalog', '  # Empty: the chart\'s appVersion.', '  tag: ""',
  'service:', '  port: 80', 'config:', '  LOG_LEVEL: info', '  FEATURED_LIMIT: 10', 'resources:', '  limits:', '    memory: 128Mi');
const HELPERS = (chart: string) => yaml(`{{/* ${chart}.fullname: the release name, or release-chart when it does not contain the chart name. */}}`, `{{- define "${chart}.fullname" -}}`,
  '{{- if contains .Chart.Name .Release.Name }}', '{{- .Release.Name | trunc 63 | trimSuffix "-" }}', '{{- else }}', '{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}', '{{- end }}', '{{- end }}',
  `{{- define "${chart}.selectorLabels" -}}`, 'app.kubernetes.io/name: {{ .Chart.Name }}', 'app.kubernetes.io/instance: {{ .Release.Name }}', '{{- end }}',
  `{{- define "${chart}.labels" -}}`, `{{ include "${chart}.selectorLabels" . }}`, 'app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}', 'helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}', '{{- end }}');
const CATALOG_DEPLOY = yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: {{ include "catalog.fullname" . }}', '  labels:', '    {{- include "catalog.labels" . | nindent 4 }}', 'spec:',
  '  replicas: {{ .Values.replicaCount }}', '  selector:', '    matchLabels:', '      {{- include "catalog.selectorLabels" . | nindent 6 }}', '  template:', '    metadata:', '      labels:',
  '        {{- include "catalog.selectorLabels" . | nindent 8 }}', '      annotations:', '        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}', '    spec:', '      containers:',
  '        - name: catalog', '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"', '          ports:', '            - name: http', '              containerPort: 8080',
  '          envFrom:', '            - configMapRef:', '                name: {{ include "catalog.fullname" . }}-config', '          {{- with .Values.resources }}', '          resources:', '            {{- toYaml . | nindent 12 }}', '          {{- end }}');
const CATALOG_CM = yaml('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: {{ include "catalog.fullname" . }}-config', '  labels:', '    {{- include "catalog.labels" . | nindent 4 }}', 'data:',
  '  {{- range $key, $value := .Values.config }}', '  {{ $key }}: {{ $value | quote }}', '  {{- end }}');
const CATALOG_SVC = yaml('apiVersion: v1', 'kind: Service', 'metadata:', '  name: {{ include "catalog.fullname" . }}', '  labels:', '    {{- include "catalog.labels" . | nindent 4 }}', 'spec:', '  selector:',
  '    {{- include "catalog.selectorLabels" . | nindent 4 }}', '  ports:', '    - name: http', '      port: {{ .Values.service.port }}', '      targetPort: http');
const CATALOG_NOTES = yaml('catalog {{ .Values.image.tag | default .Chart.AppVersion }} is running as {{ include "catalog.fullname" . }} in {{ .Release.Namespace }}.',
  'In the cluster: http://{{ include "catalog.fullname" . }}.{{ .Release.Namespace }}.svc.cluster.local:{{ .Values.service.port }}/');
const catalogChart = (version: string, appVersion: string): Record<string, string> => ({ 'Chart.yaml': CATALOG_CHART(version, appVersion), 'values.yaml': CATALOG_VALUES,
  'templates/_helpers.tpl': HELPERS('catalog'), 'templates/deployment.yaml': CATALOG_DEPLOY, 'templates/configmap.yaml': CATALOG_CM, 'templates/service.yaml': CATALOG_SVC, 'templates/NOTES.txt': CATALOG_NOTES });
const VALUES_STAGING = yaml('# catalog on staging', 'replicaCount: 2', 'image:', '  tag: "2.2"', 'config:', '  LOG_LEVEL: debug');
const VALUES_PROD = yaml('# catalog on production', 'replicaCount: 3', 'config:', '  LOG_LEVEL: warn', 'resources:', '  limits:', '    memory: 256Mi');

/** A chart folder under ~/shop. */
const chartFolder = (name: string, files: Record<string, string>): TerminalFile[] => [dir(`/home/yuki/shop/${name}`), dir(`/home/yuki/shop/${name}/templates`),
  ...Object.entries(files).map(([p, c]) => file(`/home/yuki/shop/${name}/${p}`, c))];
const SHOP_FILES = [...chartFolder('catalog', catalogChart('0.4.0', '2.2')), file('/home/yuki/shop/values-staging.yaml', VALUES_STAGING), file('/home/yuki/shop/values-prod.yaml', VALUES_PROD)];
// The platform team's chart repository (the fictional charts.example.test).
const REPO_CHARTS = [{ files: catalogChart('0.3.0', '2.1') }, { files: catalogChart('0.4.0', '2.2') }];

const workstation = (id: string, title: string, files: TerminalFile[], kube: Partial<TerminalKube> = {}): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki/shop', profile: 'helm', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  docker: { images: IMAGES },
  kube: { images: KUBE_IMAGES, ...kube },
});

// The cart chart: a teammate's edit put indent where the line needs nindent (the YAML breaks).
const CART_VALUES = yaml('replicaCount: 2', 'image:', '  repository: shop/cart', '  tag: "1.0"', 'resources:', '  limits:', '    memory: 64Mi');
const CART_DEPLOY = yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: {{ include "cart.fullname" . }}', '  labels:', '    {{- include "cart.labels" . | nindent 4 }}', 'spec:',
  '  replicas: {{ .Values.replicaCount }}', '  selector:', '    matchLabels:', '      {{- include "cart.selectorLabels" . | nindent 6 }}', '  template:', '    metadata:', '      labels:',
  '        {{- include "cart.selectorLabels" . | nindent 8 }}', '    spec:', '      containers:', '        - name: cart', '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"', '          ports:',
  '            - containerPort: 8081', '          resources:', '            {{- toYaml .Values.resources | indent 12 }}');
const CART_CHART = { 'Chart.yaml': chartYaml('cart', 'The shop shopping cart service', '0.2.0', '1.0'), 'values.yaml': CART_VALUES, 'templates/_helpers.tpl': HELPERS('cart'), 'templates/deployment.yaml': CART_DEPLOY };
const STAGING_NS = { text: yaml('apiVersion: v1', 'kind: Namespace', 'metadata:', '  name: staging'), at: '2026-11-20 09:00:00', file: 'staging.yaml' };
const CART = workstation('kub09-cart', 'ops-ws（同事改過的 cart chart）', chartFolder('cart', CART_CHART), { manifests: [STAGING_NS] });

// The platform team's chart repository serves 0.4.1 (a chart fix, appVersion still 2.2) from 10:05, after the workstation's start.
const WS = workstation('kub09-ws', 'ops-ws（shop 團隊的工作站：catalog 的 chart 在 ~/shop/catalog）', SHOP_FILES,
  { helm: { charts: [...REPO_CHARTS, { files: catalogChart('0.4.1', '2.2'), published: '2026-11-24 10:05:00' }] } });

// Production's catalog: installed from the repository's 0.3.0 (appVersion 2.1) last week with production's values.
const PROD_VALUES = 'replicaCount: 3\nconfig:\n  LOG_LEVEL: warn\nresources:\n  limits:\n    memory: 256Mi\n';
type Release = NonNullable<NonNullable<TerminalKube['helm']>['releases']>[number];
const rel = (name: string, version: string, namespace: string, at: string, values = PROD_VALUES): Release => ({ name, chart: 'catalog', version, values, namespace, at });
const helmKube = (releases: Release[]): Partial<TerminalKube> => ({ created: '2026-11-01 00:00:00', helm: { charts: REPO_CHARTS, releases } });
const PROD = workstation('kub09-prod', 'ops-ws（prod 的 catalog 是上週以 chart 0.3.0 安裝的 Helm release）', SHOP_FILES, helmKube([rel('catalog', '0.3.0', 'prod', '2026-11-17 14:00:00')]));

// Exercise 1: nothing is installed yet; staging does not exist.
const STAGE = workstation('kub09-stage', 'ops-ws（catalog 還沒有部署到 staging）', SHOP_FILES);
// Exercise 2: the cart chart a teammate edited.
// (CART above.)
// Exercise 3: production runs chart 0.4.0 (2.2), installed last week.
const TICKET = workstation('kub09-ticket', 'ops-ws（prod 的 catalog 跑著 2.2，發版單要升到 2.3）', SHOP_FILES, helmKube([rel('catalog', '0.4.0', 'prod', '2026-11-17 14:00:00')]));
// Exercise 4: catalog in prod and in staging, each with its own history (the variants have other histories).
const STAGING_VALUES = 'replicaCount: 2\nimage:\n  tag: "2.2"\nconfig:\n  LOG_LEVEL: debug\n';
const prodRel = (version: string, at: string, values?: string) => rel('catalog', version, 'prod', `2026-11-${at}`, values);
const stageRel = (version: string, at: string) => rel('catalog', version, 'staging', `2026-11-${at}`, STAGING_VALUES);
const SCALED = PROD_VALUES.replace('replicaCount: 3', 'replicaCount: 4');
const historyKube = (releases: Release[]): TerminalKube => ({ images: KUBE_IMAGES, ...helmKube(releases) });
const HISTORY = workstation('kub09-history', 'ops-ws（catalog 在 prod 與 staging 各有自己的歷史）', SHOP_FILES, historyKube([
  prodRel('0.3.0', '17 14:00:00'), stageRel('0.4.0', '20 11:00:00'), stageRel('0.4.0', '21 15:30:00'), prodRel('0.4.0', '24 08:00:00'), prodRel('0.4.0', '24 09:10:00', SCALED),
]));

const REVISION = 'helm status catalog -n prod | grep REVISION | cut -d\' \' -f2';
const EXERCISES: NonNullable<LessonContent['terminal']>['exercises'] = [
  {
    id: 'kub09-ex-staging', title: '用 values-staging.yaml 把 catalog 裝進 staging', machine: 'kub09-stage',
    statement: 'catalog 要第一次部署到 staging。chart 在 `~/shop/catalog`（0.4.0），staging 的設定在 `~/shop/values-staging.yaml`。請用 Helm 安裝一個名為 `catalog` 的 release：命名空間 `staging`（目前還不存在），套用 staging 的 values，並且等到所有 Pod 都就緒才結束。不要修改 chart 與 values 檔。',
    checks: [
      { kind: 'helm-release', name: 'catalog', namespace: 'staging', status: 'deployed', chart: 'catalog', chartVersion: '0.4.0', values: { 'image.tag': '2.2', replicaCount: 2, 'config.LOG_LEVEL': 'debug' } },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'staging', replicas: 2, readyReplicas: 2, image: 'shop/catalog:2.2' },
      { kind: 'unchanged', path: '/home/yuki/shop/values-staging.yaml' },
    ],
    solution: ['cat values-staging.yaml', 'helm lint ./catalog -f values-staging.yaml', 'helm install catalog ./catalog -n staging --create-namespace -f values-staging.yaml --wait', 'helm list -n staging', 'kubectl get deploy catalog -n staging'],
    mistakes: [
      { commands: ['helm install catalog ./catalog -n staging --create-namespace --wait'], why: '沒有 -f values-staging.yaml：用的是 chart 的預設值，只有 1 個副本、LOG_LEVEL 是 info' },
      { commands: ['helm install catalog ./catalog -n staging -f values-staging.yaml --wait'], why: 'staging 命名空間還不存在，又沒有 --create-namespace，建立物件時就失敗' },
      { commands: ['helm install catalog ./catalog -f values-staging.yaml --wait'], why: '沒有 -n staging：release 與所有物件都裝進了 default 命名空間' },
      { commands: ['helm install catalog ./catalog -n staging --create-namespace -f values-staging.yaml'], why: '沒有 --wait：節點還在拉取 shop/catalog:2.2，指令結束時 Pod 還沒有就緒' },
      { commands: ['helm install staging ./catalog -n staging --create-namespace -f values-staging.yaml --wait'], why: 'release 名稱寫成 staging：物件依 fullname 變成 staging-catalog，也沒有名為 catalog 的 release' },
    ],
    hints: [
      '`helm install 名稱 chart` 的第一個參數是 release 名稱，第二個是 chart 的路徑（`./catalog`）。',
      '`-n staging` 指定命名空間，命名空間不存在時加上 `--create-namespace`；`-f values-staging.yaml` 疊上 staging 的值。',
      '加上 `--wait`，Helm 會等到 Deployment 的 Pod 就緒才回報成功；之後用 `helm list -n staging` 與 `kubectl get deploy -n staging` 確認。',
    ],
    explanation: '`helm install catalog ./catalog -n staging --create-namespace -f values-staging.yaml --wait` 以 chart 的 values.yaml 為底、疊上 values-staging.yaml（2 個副本、tag 2.2、LOG_LEVEL debug），算繪樣板後建立 ConfigMap、Service 與 Deployment，並在 staging 存下 revision 1 的 Secret。release 名稱 catalog 含有 chart 名稱，所以 fullname 就是 catalog。`--wait` 等到新的 ReplicaSet 就緒（Image 要拉 3 秒）才回報 deployed。少了 `-f` 是 chart 的預設值；少了 `--create-namespace` 在建立時失敗；少了 `-n` 裝進 default；少了 `--wait` 時指令結束得比 Pod 就緒早。',
  },
  {
    id: 'kub09-ex-lint', title: '修好 cart chart 的樣板再安裝', machine: 'kub09-cart',
    statement: '同事修改了 `~/shop/cart` 這個 chart 的 `templates/deployment.yaml`，之後 `helm install` 就一直失敗。請用 `helm lint` 或 `helm template` 找出問題、修正樣板（不要改 values.yaml，也不要拿掉 resources 的設定），然後把它安裝成 staging 命名空間裡名為 `cart` 的 release，等到 Pod 都就緒。',
    checks: [
      { kind: 'helm-release', name: 'cart', namespace: 'staging', status: 'deployed', chart: 'cart', chartVersion: '0.2.0' },
      { kind: 'kube-workload', resource: 'Deployment', name: 'cart', namespace: 'staging', replicas: 2, readyReplicas: 2, image: 'shop/cart:1.0' },
      { kind: 'kube-object', resource: 'Deployment', name: 'cart', namespace: 'staging', fields: [{ path: '.spec.template.spec.containers[0].resources.limits.memory', equals: '64Mi' }] },
      { kind: 'unchanged', path: '/home/yuki/shop/cart/values.yaml' },
    ],
    solution: ['helm lint ./cart || true', 'grep -n toYaml cart/templates/deployment.yaml', "sed -i 's/| indent 12/| nindent 12/' cart/templates/deployment.yaml", 'helm lint ./cart',
      'helm template cart ./cart | tail -n 4', 'helm install cart ./cart -n staging --wait'],
    mistakes: [
      { commands: ['helm install cart ./cart -n staging --wait'], why: '沒有修正樣板：算繪出來的 YAML 不合法，安裝在建立任何物件之前就失敗' },
      { commands: ["sed -i '/resources/d' cart/templates/deployment.yaml", 'helm install cart ./cart -n staging --wait'], why: '把 resources 整段刪掉雖然能安裝，記憶體上限 64Mi 卻不見了' },
      { commands: ["sed -i 's/| indent 12/| indent 14/' cart/templates/deployment.yaml", 'helm install cart ./cart -n staging --wait'], why: '問題不是縮排的格數：indent 不會先換行，{{- 又吃掉了前面的換行，內容仍然接在 resources: 同一行' },
      { commands: ["sed -i 's/| indent 12/| nindent 12/' cart/templates/deployment.yaml", 'helm install cart ./cart -n staging'], why: '修好了但沒有 --wait：指令結束時 Pod 還沒有就緒' },
    ],
    hints: [
      '`helm lint ./cart` 指出是 templates/deployment.yaml 算繪後的 YAML 解析不了；錯誤的行號是算繪結果的行號，不是樣板的行號。',
      '`grep -n toYaml cart/templates/deployment.yaml` 找到把 resources 轉成 YAML 的那一行：`{{-` 把前面的換行吃掉了，接著用的是 `indent`。',
      '`nindent` 會先換行再縮排，`indent` 不會。用 `sed -i \'s/| indent 12/| nindent 12/\' cart/templates/deployment.yaml` 修正，再 `helm lint` 一次，最後 `helm install cart ./cart -n staging --wait`。',
    ],
    explanation: '樣板 `resources:` 的下一行是 `{{- toYaml .Values.resources | indent 12 }}`。`{{-` 刪掉它前面所有的空白與換行，`indent 12` 只在每一行前面加 12 個空白而不先換行，於是算繪結果變成 `resources:            limits:` 擠在同一行，接下來的 `memory: 64Mi` 讓 YAML 解析失敗（mapping values are not allowed in this context）。改成 `nindent 12` 先換行再縮排，就得到正確的巢狀結構。`helm lint` 與 `helm template` 都在本機算繪、不碰叢集，是安裝前找出這類錯誤最便宜的方法。刪掉 resources 雖然能裝，卻悄悄拿掉了記憶體上限；改縮排格數不解決換行的問題；沒有 `--wait` 時 Pod 還沒就緒。',
  },
  {
    id: 'kub09-ex-atomic', title: '失敗就自動退回的正式環境升級', machine: 'kub09-ticket',
    statement: '發版單要把 prod 的 catalog 升級到 Image tag `2.3`：`helm upgrade` 用 `~/shop/catalog` 的 chart，沿用 `values-prod.yaml` 的設定，再加上 `--set image.tag=2.3`。值班規定正式環境的升級要「失敗就自動退回上一個成功的版本」，而且等待時間不超過 30 秒。請照規定執行這次升級。結束時 prod 的 catalog 必須是健康的：release 狀態 deployed，3 個副本都就緒。',
    checks: [
      { kind: 'helm-release', name: 'catalog', namespace: 'prod', status: 'deployed', revisionsAtLeast: 3, chartVersion: '0.4.0', values: { replicaCount: 3, 'config.LOG_LEVEL': 'warn' } },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'prod', replicas: 3, readyReplicas: 3, image: 'shop/catalog:2.2' },
    ],
    solution: ['helm history catalog -n prod', 'helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --atomic --timeout 30s || true', 'helm history catalog -n prod',
      'kubectl get deploy catalog -n prod'],
    mistakes: [
      { commands: ['helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --wait --timeout 30s'], why: '只有 --wait：逾時之後 revision 2 成為 failed，Deployment 仍然要求不存在的 2.3' },
      { commands: ['helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3'], why: '沒有等待也沒有自動退回：Helm 立刻回報 deployed，Deployment 卻換成拉不到的 2.3' },
      { commands: ['helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --wait --timeout 30s', 'kubectl rollout undo deploy/catalog -n prod', 'kubectl rollout status deploy/catalog -n prod'],
        why: '用 kubectl 退回 Deployment，Helm 不知道：release 最新的 revision 仍是 failed，下一次 upgrade 也會以它為基準' },
      { commands: ['helm history catalog -n prod'], why: '只看了歷史，沒有執行升級' },
    ],
    hints: [
      '`helm upgrade` 加上 `--atomic`：失敗時 Helm 自動 rollback 到最後一個成功的 revision（`--atomic` 本身就會等待）。',
      '`--timeout 30s` 把等待上限設成 30 秒，預設是 5 分鐘。',
      '執行後用 `helm history catalog -n prod` 看：失敗的 revision 之後應該多一個 `Rollback to 1`。',
    ],
    explanation: '`helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --atomic --timeout 30s` 建立 revision 2，Deployment 開始滾動更新，但 shop/catalog:2.3 從來沒有推上 Registry，新的 Pod 一直拉不到 Image。30 秒後 Helm 判定逾時，把 revision 2 記成 failed，並因為 `--atomic` 立刻以 revision 1 的 chart、values 與 manifest 建立 revision 3（Rollback to 1）。滾動更新期間舊的 3 個 Pod 一直在服務，退回後新的 ReplicaSet 縮成 0。只有 `--wait` 會留下 failed 的 release，沒有等待則讓壞掉的版本被記成 deployed；用 `kubectl rollout undo` 修好 Deployment 卻讓 Helm 的紀錄和叢集不一致。手動的 `helm rollback catalog 1 -n prod --wait` 也能得到同樣的結果，`--atomic` 只是把它自動化。',
  },
  {
    id: 'kub09-ex-revision', title: '查出 prod 目前部署的 revision', machine: 'kub09-history',
    statement: '事故檢討要記下 prod 命名空間的 catalog release 目前部署（deployed）的是第幾個 revision。請從叢集查出來：最後一個指令只印出 revision 的數字，不要有其他文字。同一串指令會在另外兩個叢集上重播，那裡的歷史不同，所以不能寫死答案。',
    checks: [{ kind: 'output', fromCommand: '^(helm|kubectl) ' }],
    solution: ['helm list -A', 'helm history catalog -n prod', REVISION],
    mistakes: [
      { commands: ['helm status catalog | grep REVISION | cut -d\' \' -f2'], why: '沒有 -n prod：default 命名空間沒有這個 release' },
      { commands: ['helm status catalog -n staging | grep REVISION | cut -d\' \' -f2'], why: '查到的是 staging 的 catalog，那是另一個 release，有自己的歷史' },
      { commands: ['helm status catalog -n prod | grep REVISION'], why: '印出的是整行 REVISION: 3，題目只要數字' },
      { commands: ['echo 3'], why: '直接打出答案，沒有從叢集讀取；換一個叢集答案就不同' },
    ],
    variants: [
      { label: 'prod 只升級過一次的叢集', files: [], kube: historyKube([prodRel('0.3.0', '17 14:00:00'), stageRel('0.4.0', '20 11:00:00'), stageRel('0.4.0', '21 15:30:00'), stageRel('0.4.0', '22 10:00:00'), prodRel('0.4.0', '24 08:00:00')] ) },
      { label: 'prod 調整過多次的叢集', files: [], kube: historyKube([prodRel('0.3.0', '17 14:00:00'), stageRel('0.4.0', '20 11:00:00'), prodRel('0.4.0', '23 16:00:00'), prodRel('0.4.0', '24 08:00:00', SCALED), prodRel('0.4.0', '24 09:10:00')] ) },
    ],
    hints: [
      '`helm list -A` 列出每個命名空間的 release；同名的 catalog 在 prod 與 staging 是兩個不同的 release。',
      '`helm status catalog -n prod` 的狀態區塊有一行 `REVISION: N`。',
      '用管線取出數字：`… | grep REVISION | cut -d\' \' -f2`；也可以讀 release Secret 的標籤 `version`（`kubectl get secrets -n prod -l name=catalog,status=deployed`）。',
    ],
    explanation: 'release 屬於命名空間：prod 與 staging 各有一個叫 catalog 的 release，各自從 revision 1 數起。`helm status catalog -n prod` 讀出 prod 裡 deployed 的那個 revision，`grep REVISION | cut -d\' \' -f2` 只留下數字。這個叢集的答案是 3，另外兩個叢集分別是 2 與 4。同樣的資訊也存在 release Secret `sh.helm.release.v1.catalog.vN` 的標籤裡（`status=deployed`、`version=N`），`kubectl get secrets -n prod -l name=catalog,status=deployed -o jsonpath=\'{.items[0].metadata.labels.version}\'` 也能印出它。少了 `-n prod` 查的是 default；查 staging 是另一個 release；只 grep 會留下 `REVISION:` 字樣。',
  },
];

const EXAMPLES: NonNullable<LessonContent['terminal']>['examples'] = [
  {
    id: "kub09-chart", title: "拆開 catalog 的 chart：Chart.yaml、values 與樣板", machine: "kub09-ws",
    description: "看 chart 的檔案：Chart.yaml 的 version 與 appVersion、values.yaml 的預設值、_helpers.tpl 定義的具名樣板與 ConfigMap 樣板的 range。用 helm template 在本機算繪，看到 quote、toYaml | nindent 與 checksum 註解的結果；換一個 release 名稱，物件名稱跟著 fullname 的規則改變；最後 helm lint。",
    steps: [
      { command: "ls catalog catalog/templates", output: "catalog:\nChart.yaml  templates/  values.yaml\n\ncatalog/templates:\nNOTES.txt  _helpers.tpl  configmap.yaml  deployment.yaml  service.yaml" },
      { command: "cat catalog/Chart.yaml", output: "apiVersion: v2\nname: catalog\ndescription: The shop product catalog service\ntype: application\nversion: 0.4.0\nappVersion: \"2.2\"" },
      { command: "cat catalog/values.yaml", output: "# Defaults for every environment; values-<env>.yaml overrides them.\nreplicaCount: 1\nimage:\n  repository: shop/catalog\n  # Empty: the chart's appVersion.\n  tag: \"\"\nservice:\n  port: 80\nconfig:\n  LOG_LEVEL: info\n  FEATURED_LIMIT: 10\nresources:\n  limits:\n    memory: 128Mi" },
      { command: "cat catalog/templates/_helpers.tpl", output: "{{/* catalog.fullname: the release name, or release-chart when it does not contain the chart name. */}}\n{{- define \"catalog.fullname\" -}}\n{{- if contains .Chart.Name .Release.Name }}\n{{- .Release.Name | trunc 63 | trimSuffix \"-\" }}\n{{- else }}\n{{- printf \"%s-%s\" .Release.Name .Chart.Name | trunc 63 | trimSuffix \"-\" }}\n{{- end }}\n{{- end }}\n{{- define \"catalog.selectorLabels\" -}}\napp.kubernetes.io/name: {{ .Chart.Name }}\napp.kubernetes.io/instance: {{ .Release.Name }}\n{{- end }}\n{{- define \"catalog.labels\" -}}\n{{ include \"catalog.selectorLabels\" . }}\napp.kubernetes.io/version: {{ .Chart.AppVersion | quote }}\nhelm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}\n{{- end }}" },
      { command: "cat catalog/templates/configmap.yaml", output: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {{ include \"catalog.fullname\" . }}-config\n  labels:\n    {{- include \"catalog.labels\" . | nindent 4 }}\ndata:\n  {{- range $key, $value := .Values.config }}\n  {{ $key }}: {{ $value | quote }}\n  {{- end }}" },
      { command: "helm template catalog ./catalog -s templates/configmap.yaml", output: "---\n# Source: catalog/templates/configmap.yaml\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: catalog-config\n  labels:\n    app.kubernetes.io/name: catalog\n    app.kubernetes.io/instance: catalog\n    app.kubernetes.io/version: \"2.2\"\n    helm.sh/chart: catalog-0.4.0\ndata:\n  FEATURED_LIMIT: \"10\"\n  LOG_LEVEL: \"info\"" },
      { command: "tail -n 14 catalog/templates/deployment.yaml", output: "    spec:\n      containers:\n        - name: catalog\n          image: \"{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}\"\n          ports:\n            - name: http\n              containerPort: 8080\n          envFrom:\n            - configMapRef:\n                name: {{ include \"catalog.fullname\" . }}-config\n          {{- with .Values.resources }}\n          resources:\n            {{- toYaml . | nindent 12 }}\n          {{- end }}" },
      { command: "helm template catalog ./catalog -s templates/deployment.yaml | tail -n 18", output: "      labels:\n        app.kubernetes.io/name: catalog\n        app.kubernetes.io/instance: catalog\n      annotations:\n        checksum/config: f92e9c47d455c66c3df0caee0308d50553ad6ac5d2d643e4a8419aa9c1eb8c66\n    spec:\n      containers:\n        - name: catalog\n          image: \"shop/catalog:2.2\"\n          ports:\n            - name: http\n              containerPort: 8080\n          envFrom:\n            - configMapRef:\n                name: catalog-config\n          resources:\n            limits:\n              memory: 128Mi" },
      { command: "helm template shop ./catalog -s templates/service.yaml", output: "---\n# Source: catalog/templates/service.yaml\napiVersion: v1\nkind: Service\nmetadata:\n  name: shop-catalog\n  labels:\n    app.kubernetes.io/name: catalog\n    app.kubernetes.io/instance: shop\n    app.kubernetes.io/version: \"2.2\"\n    helm.sh/chart: catalog-0.4.0\nspec:\n  selector:\n    app.kubernetes.io/name: catalog\n    app.kubernetes.io/instance: shop\n  ports:\n    - name: http\n      port: 80\n      targetPort: http" },
      { command: "helm lint ./catalog", output: "==> Linting ./catalog\n[INFO] Chart.yaml: icon is recommended\n\n1 chart(s) linted, 0 chart(s) failed" },
    ],
  },
  {
    id: "kub09-values", title: "同一個 chart，不同環境的 values", machine: "kub09-ws",
    description: "values-staging.yaml 與 values-prod.yaml 只寫各自不同的部分。用 helm template 加 grep 比較四種組合：只有 staging、只有 prod、兩個檔案（後面的勝出）、再加上 --set。最後看 values 檔裡的大數字被印成 1e+06，同一個值用 --set 給卻是 1000000。",
    steps: [
      { command: "cat values-staging.yaml values-prod.yaml", output: "# catalog on staging\nreplicaCount: 2\nimage:\n  tag: \"2.2\"\nconfig:\n  LOG_LEVEL: debug\n# catalog on production\nreplicaCount: 3\nconfig:\n  LOG_LEVEL: warn\nresources:\n  limits:\n    memory: 256Mi" },
      { command: "helm template catalog ./catalog -f values-staging.yaml | grep -E 'replicas|image:|memory|LOG_LEVEL'", output: "  LOG_LEVEL: \"debug\"\n  replicas: 2\n          image: \"shop/catalog:2.2\"\n              memory: 128Mi" },
      { command: "helm template catalog ./catalog -f values-prod.yaml | grep -E 'replicas|image:|memory|LOG_LEVEL'", output: "  LOG_LEVEL: \"warn\"\n  replicas: 3\n          image: \"shop/catalog:2.2\"\n              memory: 256Mi" },
      { command: "helm template catalog ./catalog -f values-prod.yaml -f values-staging.yaml | grep -E 'replicas|image:|memory|LOG_LEVEL'", output: "  LOG_LEVEL: \"debug\"\n  replicas: 2\n          image: \"shop/catalog:2.2\"\n              memory: 256Mi" },
      { command: "helm template catalog ./catalog -f values-prod.yaml -f values-staging.yaml --set replicaCount=4 --set config.LOG_LEVEL=info | grep -E 'replicas|image:|memory|LOG_LEVEL'", output: "  LOG_LEVEL: \"info\"\n  replicas: 4\n          image: \"shop/catalog:2.2\"\n              memory: 256Mi" },
      { command: "printf 'config:\\n  FEATURED_LIMIT: 1000000\\n' > big.yaml", output: "" },
      { command: "helm template catalog ./catalog -f big.yaml -s templates/configmap.yaml | tail -n 2", output: "  FEATURED_LIMIT: \"1e+06\"\n  LOG_LEVEL: \"info\"" },
      { command: "helm template catalog ./catalog --set config.FEATURED_LIMIT=1000000 -s templates/configmap.yaml | tail -n 2", output: "  FEATURED_LIMIT: \"1000000\"\n  LOG_LEVEL: \"info\"" },
    ],
  },
  {
    id: "kub09-install", title: "安裝到 staging，看 release 存在哪裡", machine: "kub09-ws",
    description: "第一次安裝少了 --create-namespace 而失敗；加上之後以 --wait 等到 Pod 就緒。helm list 要 -A 才看得到其他命名空間；Helm 建立的物件帶著 managed-by 標籤，revision 存成 sh.helm.release.v1 的 Secret。helm get values 與 --all 的差別、同名再 install 被拒絕，最後 uninstall 連同紀錄一起刪除。",
    steps: [
      { command: "helm install catalog ./catalog -n staging -f values-staging.yaml --wait", output: "Error: INSTALLATION FAILED: create: failed to create: namespaces \"staging\" not found" },
      { command: "helm install catalog ./catalog -n staging --create-namespace -f values-staging.yaml --wait", output: "NAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:00:00 2026\nNAMESPACE: staging\nSTATUS: deployed\nREVISION: 1\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in staging.\nIn the cluster: http://catalog.staging.svc.cluster.local:80/" },
      { command: "date", output: "Tue Nov 24 10:00:04 UTC 2026" },
      { command: "helm list", output: "NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION" },
      { command: "helm list -A", output: "NAME   \tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS  \tCHART        \tAPP VERSION\ncatalog\tstaging  \t1       \t2026-11-24 10:00:00 +0000 UTC\tdeployed\tcatalog-0.4.0\t2.2        " },
      { command: "kubectl get deploy,svc,cm -n staging", output: "NAME                      READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/catalog   2/2       2            2           4s\n\nNAME              TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE\nservice/catalog   ClusterIP   10.96.132.16   <none>        80/TCP    4s\n\nNAME                         DATA      AGE\nconfigmap/catalog-config     2         4s\nconfigmap/kube-root-ca.crt   1         4s" },
      { command: "kubectl get deploy catalog -n staging --show-labels", output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE       LABELS\ncatalog   2/2       2            2           4s        app.kubernetes.io/instance=catalog,app.kubernetes.io/managed-by=Helm,app.kubernetes.io/name=catalog,app.kubernetes.io/version=2.2,helm.sh/chart=catalog-0.4.0" },
      { command: "kubectl get secrets -n staging --show-labels", output: "NAME                            TYPE                 DATA      AGE       LABELS\nsh.helm.release.v1.catalog.v1   helm.sh/release.v1   1         4s        createdAt=1795514400,modifiedAt=1795514404,name=catalog,owner=helm,status=deployed,version=1" },
      { command: "helm get values catalog -n staging", output: "USER-SUPPLIED VALUES:\nconfig:\n  LOG_LEVEL: debug\nimage:\n  tag: \"2.2\"\nreplicaCount: 2" },
      { command: "helm get values catalog -n staging --all", output: "COMPUTED VALUES:\nconfig:\n  FEATURED_LIMIT: 10\n  LOG_LEVEL: debug\nimage:\n  repository: shop/catalog\n  tag: \"2.2\"\nreplicaCount: 2\nresources:\n  limits:\n    memory: 128Mi\nservice:\n  port: 80" },
      { command: "helm install catalog ./catalog -n staging -f values-staging.yaml", output: "Error: INSTALLATION FAILED: cannot re-use a name that is still in use" },
      { command: "helm uninstall catalog -n staging", output: "release \"catalog\" uninstalled" },
      { command: "sleep 2", output: "" },
      { command: "kubectl get all,secrets -n staging", output: "No resources found in staging namespace." },
    ],
  },
  {
    id: "kub09-upgrade", title: "升級、失敗、回滾與 --atomic", machine: "kub09-prod",
    description: "prod 的 catalog 是上週以 chart 0.3.0（2.1）安裝的。升級到工作站上的 0.4.0 成功；要求不存在的 2.3 時 --wait 逾時、revision 成為 failed，舊的 Pod 繼續服務；helm rollback 2 建立新的 revision。--atomic 自動完成同樣的退回。最後比較只給 --set 與加上 --reuse-values 的 upgrade 留下的 values。",
    steps: [
      { command: "helm list -n prod", output: "NAME   \tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS  \tCHART        \tAPP VERSION\ncatalog\tprod     \t1       \t2026-11-17 14:00:00 +0000 UTC\tdeployed\tcatalog-0.3.0\t2.1        " },
      { command: "helm get values catalog -n prod", output: "USER-SUPPLIED VALUES:\nconfig:\n  LOG_LEVEL: warn\nreplicaCount: 3\nresources:\n  limits:\n    memory: 256Mi" },
      { command: "helm upgrade catalog ./catalog -n prod -f values-prod.yaml --wait", output: "Release \"catalog\" has been upgraded. Happy Helming!\nNAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:00:00 2026\nNAMESPACE: prod\nSTATUS: deployed\nREVISION: 2\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in prod.\nIn the cluster: http://catalog.prod.svc.cluster.local:80/" },
      { command: "date", output: "Tue Nov 24 10:00:06 UTC 2026" },
      { command: "helm history catalog -n prod", output: "REVISION\tUPDATED                 \tSTATUS    \tCHART        \tAPP VERSION\tDESCRIPTION     \n1       \tTue Nov 17 14:00:00 2026\tsuperseded\tcatalog-0.3.0\t2.1        \tInstall complete\n2       \tTue Nov 24 10:00:00 2026\tdeployed  \tcatalog-0.4.0\t2.2        \tUpgrade complete" },
      { command: "helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --wait --timeout 30s", output: "Error: UPGRADE FAILED: context deadline exceeded" },
      { command: "helm history catalog -n prod", output: "REVISION\tUPDATED                 \tSTATUS    \tCHART        \tAPP VERSION\tDESCRIPTION                                        \n1       \tTue Nov 17 14:00:00 2026\tsuperseded\tcatalog-0.3.0\t2.1        \tInstall complete                                   \n2       \tTue Nov 24 10:00:00 2026\tdeployed  \tcatalog-0.4.0\t2.2        \tUpgrade complete                                   \n3       \tTue Nov 24 10:00:06 2026\tfailed    \tcatalog-0.4.0\t2.2        \tUpgrade \"catalog\" failed: context deadline exceeded" },
      { command: "kubectl get pods -n prod", output: "NAME                       READY     STATUS         RESTARTS   AGE\ncatalog-fjcqldh4f6-964s7   1/1       Running        0          30s\ncatalog-fjcqldh4f6-c75zl   1/1       Running        0          33s\ncatalog-fjcqldh4f6-gmzjp   1/1       Running        0          36s\ncatalog-h5s69mnzqs-8xrq5   0/1       ErrImagePull   0          30s" },
      { command: "helm rollback catalog 2 -n prod --wait", output: "Rollback was a success! Happy Helming!" },
      { command: "kubectl get deploy catalog -n prod -o jsonpath='{.spec.template.spec.containers[0].image}'", output: "shop/catalog:2.2" },
      { command: "helm upgrade catalog ./catalog -n prod -f values-prod.yaml --set image.tag=2.3 --atomic --timeout 30s", output: "Error: UPGRADE FAILED: release catalog failed, and has been rolled back due to atomic being set: context deadline exceeded" },
      { command: "helm history catalog -n prod", output: "REVISION\tUPDATED                 \tSTATUS    \tCHART        \tAPP VERSION\tDESCRIPTION                                        \n1       \tTue Nov 17 14:00:00 2026\tsuperseded\tcatalog-0.3.0\t2.1        \tInstall complete                                   \n2       \tTue Nov 24 10:00:00 2026\tsuperseded\tcatalog-0.4.0\t2.2        \tUpgrade complete                                   \n3       \tTue Nov 24 10:00:06 2026\tfailed    \tcatalog-0.4.0\t2.2        \tUpgrade \"catalog\" failed: context deadline exceeded\n4       \tTue Nov 24 10:00:36 2026\tsuperseded\tcatalog-0.4.0\t2.2        \tRollback to 2                                      \n5       \tTue Nov 24 10:00:36 2026\tfailed    \tcatalog-0.4.0\t2.2        \tUpgrade \"catalog\" failed: context deadline exceeded\n6       \tTue Nov 24 10:01:06 2026\tdeployed  \tcatalog-0.4.0\t2.2        \tRollback to 4                                      " },
      { command: "helm upgrade catalog ./catalog -n prod --set replicaCount=4 --wait", output: "Release \"catalog\" has been upgraded. Happy Helming!\nNAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:01:06 2026\nNAMESPACE: prod\nSTATUS: deployed\nREVISION: 7\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in prod.\nIn the cluster: http://catalog.prod.svc.cluster.local:80/" },
      { command: "helm get values catalog -n prod", output: "USER-SUPPLIED VALUES:\nreplicaCount: 4" },
      { command: "helm upgrade catalog ./catalog -n prod -f values-prod.yaml --wait", output: "Release \"catalog\" has been upgraded. Happy Helming!\nNAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:01:06 2026\nNAMESPACE: prod\nSTATUS: deployed\nREVISION: 8\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in prod.\nIn the cluster: http://catalog.prod.svc.cluster.local:80/" },
      { command: "helm upgrade catalog ./catalog -n prod --reuse-values --set replicaCount=4 --wait", output: "Release \"catalog\" has been upgraded. Happy Helming!\nNAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:01:06 2026\nNAMESPACE: prod\nSTATUS: deployed\nREVISION: 9\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in prod.\nIn the cluster: http://catalog.prod.svc.cluster.local:80/" },
      { command: "helm get values catalog -n prod", output: "USER-SUPPLIED VALUES:\nconfig:\n  LOG_LEVEL: warn\nreplicaCount: 4\nresources:\n  limits:\n    memory: 256Mi" },
    ],
  },
  {
    id: "kub09-repo", title: "從 chart 儲存庫搜尋、更新索引與安裝", machine: "kub09-ws",
    description: "加入平台組的儲存庫 platform，搜尋 catalog 的版本並看 0.3.0 的 Chart.yaml。10:05 儲存庫發布了 0.4.1，但本機的索引是快取，要 helm repo update 才看得到。下載封存檔看裡面的檔案，以 --version 指定版本安裝；最後用 --keep-history 解除安裝，歷史仍然留著。",
    steps: [
      { command: "helm repo list", output: "Error: no repositories to show" },
      { command: "helm repo add platform https://charts.example.test", output: "\"platform\" has been added to your repositories" },
      { command: "helm search repo catalog --versions", output: "NAME            \tCHART VERSION\tAPP VERSION\tDESCRIPTION                     \nplatform/catalog\t0.4.0        \t2.2        \tThe shop product catalog service\nplatform/catalog\t0.3.0        \t2.1        \tThe shop product catalog service" },
      { command: "helm show chart platform/catalog --version 0.3.0", output: "apiVersion: v2\nappVersion: \"2.1\"\ndescription: The shop product catalog service\nname: catalog\ntype: application\nversion: 0.3.0" },
      { command: "sleep 300", output: "" },
      { command: "helm search repo catalog", output: "NAME            \tCHART VERSION\tAPP VERSION\tDESCRIPTION                     \nplatform/catalog\t0.4.0        \t2.2        \tThe shop product catalog service" },
      { command: "helm repo update", output: "Hang tight while we grab the latest from your chart repositories...\n...Successfully got an update from the \"platform\" chart repository\nUpdate Complete. ⎈Happy Helming!⎈" },
      { command: "helm search repo catalog --versions", output: "NAME            \tCHART VERSION\tAPP VERSION\tDESCRIPTION                     \nplatform/catalog\t0.4.1        \t2.2        \tThe shop product catalog service\nplatform/catalog\t0.4.0        \t2.2        \tThe shop product catalog service\nplatform/catalog\t0.3.0        \t2.1        \tThe shop product catalog service" },
      { command: "helm pull platform/catalog --version 0.4.1", output: "" },
      { command: "tar tzf catalog-0.4.1.tgz", output: "catalog/Chart.yaml\ncatalog/templates/NOTES.txt\ncatalog/templates/_helpers.tpl\ncatalog/templates/configmap.yaml\ncatalog/templates/deployment.yaml\ncatalog/templates/service.yaml\ncatalog/values.yaml" },
      { command: "helm install catalog platform/catalog --version 0.4.1 -n staging --create-namespace -f values-staging.yaml --wait", output: "NAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:05:00 2026\nNAMESPACE: staging\nSTATUS: deployed\nREVISION: 1\nTEST SUITE: None\nNOTES:\ncatalog 2.2 is running as catalog in staging.\nIn the cluster: http://catalog.staging.svc.cluster.local:80/" },
      { command: "helm list -n staging", output: "NAME   \tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS  \tCHART        \tAPP VERSION\ncatalog\tstaging  \t1       \t2026-11-24 10:05:00 +0000 UTC\tdeployed\tcatalog-0.4.1\t2.2        " },
      { command: "helm uninstall catalog -n staging --keep-history", output: "release \"catalog\" uninstalled" },
      { command: "helm list -n staging", output: "NAME\tNAMESPACE\tREVISION\tUPDATED\tSTATUS\tCHART\tAPP VERSION" },
      { command: "helm list -n staging -a", output: "NAME   \tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS     \tCHART        \tAPP VERSION\ncatalog\tstaging  \t1       \t2026-11-24 10:05:00 +0000 UTC\tuninstalled\tcatalog-0.4.1\t2.2        " },
      { command: "helm history catalog -n staging", output: "REVISION\tUPDATED                 \tSTATUS     \tCHART        \tAPP VERSION\tDESCRIPTION            \n1       \tTue Nov 24 10:05:00 2026\tuninstalled\tcatalog-0.4.1\t2.2        \tUninstallation complete" },
    ],
  },
];

export const KUB09: LessonContent = {
  lessonId: 'KUB09',
  motivation: '到 KUB06 為止，shop 團隊的 catalog 已經是一組 manifest：Deployment、Service、ConfigMap，再加上 KUB07 的 Ingress。現在它要同時跑在 staging 與 prod：staging 兩個副本、日誌開 debug、先試新版的 Image；prod 三個副本、日誌只留 warn、記憶體上限比較高。最直覺的作法是把資料夾複製一份再改，但幾個月後兩份 manifest 就會在沒人注意的地方分岔；每次發版要記得依序 apply 好幾個檔案；出事時想「退回昨天的版本」，`kubectl rollout undo` 只能退回 Deployment，退不回同時改掉的 ConfigMap。Helm 是 Kubernetes 的套件管理員：把一個應用的所有 manifest 寫成帶參數的樣板，打包成一個有版本的 chart；每個環境只寫自己不同的 values；每次安裝或升級都成為一個 release 的 revision，可以查歷史、一個指令就回滾。這堂課在 ops-ws 上拆開 catalog 的 chart，看懂 Chart.yaml、values.yaml 與樣板語法，用 `helm template` 與 `helm lint` 在安裝前看見算繪的結果；用 values 檔為 staging 與 prod 調整設定並弄清楚優先順序；接著 install、upgrade、看 history，親手讓一次升級失敗，再用 `helm rollback` 與 `--atomic` 回到上一個好的版本；最後從 chart 儲存庫搜尋、下載與安裝。學完之後，你能用 Helm 管理 Kubernetes 應用的安裝與版本。',
  sections: [
    {
      id: 'kub09-s-why', title: '為什麼 Kubernetes 需要套件管理員',
      blocks: [
        { type: 'p', text: '一個真實的應用很少只有一個 manifest。catalog 就有 Deployment、Service、ConfigMap，之後還會有 Ingress、Secret 的引用、HPA（KUB10）。只用 `kubectl apply -f` 管理它們時，會一再遇到同樣的幾個問題：同一組 manifest 要在好幾個環境各有一點不同；「發一版」其實是好幾個檔案一起改；出問題時要知道上一版是什麼、怎麼一起退回去；別的團隊寫好的元件（監控、資料庫、入口控制器）也想直接拿來裝，而不是複製幾十個 YAML。' },
        { type: 'table', head: ['需求', '只用 kubectl apply', '用 Helm'], rows: [
          ['一個應用的所有物件', '一個資料夾的 manifest，自己記得全部 apply', '一個 chart；`helm install` 依正確順序建立全部物件'],
          ['每個環境的差異', '複製資料夾再修改，久了就分岔', '同一份樣板，每個環境一個 values 檔'],
          ['版本', 'Git 的 commit；叢集裡不知道現在跑的是哪一版', 'chart 有 version；每次安裝或升級是 release 的一個 revision'],
          ['回滾', '`kubectl rollout undo` 只退回 Deployment', '`helm rollback` 以舊 revision 的 manifest 退回整組物件'],
          ['移除', '要記得刪掉每一個物件', '`helm uninstall` 刪除這個 release 建立的所有物件'],
          ['共用', '複製別人的 YAML', '從 chart 儲存庫搜尋、指定版本安裝'],
        ] },
        { type: 'p', text: 'Helm 3 只有一個用戶端程式 `helm`，沒有在叢集裡常駐的元件（Helm 2 的 Tiller 已經移除）。它讀取你的 kubeconfig，用和 kubectl 一樣的權限對 API server 建立物件，並把每個 release 的紀錄以 Secret 存在 release 所在的命名空間裡。這也表示：你能對哪些命名空間做什麼，Helm 就能做什麼，不多也不少。這堂課用到的詞：' },
        { type: 'table', head: ['名詞', '意思', 'catalog 的例子'], rows: [
          ['Chart', '一個應用的套件：中繼資料、預設值與樣板', '`~/shop/catalog`，版本 0.4.0'],
          ['values', '填進樣板的設定值；chart 有預設，安裝時可以覆蓋', '`values.yaml`、`values-staging.yaml`、`--set replicaCount=4`'],
          ['樣板（template）', '帶有 `{{ }}` 動作的 manifest，算繪後才是真正的 YAML', '`templates/deployment.yaml`'],
          ['release', '一個 chart 以某組 values 安裝在某個命名空間的一個實例，有自己的名稱', 'staging 的 catalog、prod 的 catalog 是兩個 release'],
          ['revision', 'release 的一個版本；每次 install、upgrade、rollback 都加一', 'prod 的 catalog 的 revision 3'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '這堂課的 `helm` 是 Helm v3.16 的子集：chart 資料夾與封存檔、Go 樣板引擎與常用的 sprig 函式、values 的合併、release 的 Secret、install／upgrade／rollback／uninstall 與 `--wait`、`--atomic`、`list`／`status`／`history`／`get`、`template`／`lint`／`create`／`package`，以及虛構的儲存庫 `https://charts.example.test`。chart 的相依（`dependencies` 與 `charts/`）、hooks、`helm test`、外掛與 OCI Registry 只在課文說明。release Secret 的內容在真實的 Helm 是壓縮後再編碼，模擬環境沒有壓縮。shop 團隊、Image 與叢集都是虛構的。' },
      ],
    },
    {
      id: 'kub09-s-chart', title: 'Chart 的結構：Chart.yaml、values.yaml 與 templates/',
      blocks: [
        { type: 'p', text: 'chart 就是一個有固定結構的資料夾（打包後是一個 `.tgz`）。Helm 只看幾個固定的名稱：' },
        { type: 'table', head: ['檔案', '內容', '注意'], rows: [
          ['`Chart.yaml`', 'chart 的中繼資料：`apiVersion: v2`、`name`、`version`、`appVersion`、`description`、`type`', '`name`、`version`、`apiVersion` 必填；Helm 3 的 chart 寫 `v2`'],
          ['`values.yaml`', '所有 values 的預設值', '這是使用者可以調整的「介面」，值得寫上註解'],
          ['`templates/`', '樣板；每個不以 `_` 開頭的檔案都會被算繪成 manifest', '算繪結果依 kind 排序後送出（Namespace、ConfigMap、Service 先於 Deployment）'],
          ['`templates/_helpers.tpl`', '以 `define` 定義、用 `include` 呼叫的具名樣板', '底線開頭的檔案不會產生 manifest'],
          ['`templates/NOTES.txt`', '安裝與升級後印給使用者看的說明，也是樣板', '不會送到叢集'],
          ['`charts/`、`dependencies`', '子 chart（相依的其他 chart）', '`helm dependency update` 下載它們；這裡只在課文說明'],
          ['`.helmignore`', '打包時要略過的檔案', '寫法類似 .gitignore'],
        ] },
        { type: 'p', text: '`Chart.yaml` 有兩個容易混淆的版本：`version` 是 chart 本身的版本，必須是 SemVer（0.4.0），樣板或預設值改了就要升；`appVersion` 是 chart 裡打包的應用版本（"2.2"），只是資訊，建議加引號。兩者各自前進：0.4.0 與 0.4.1 可能都包著 2.2，只是 0.4.1 修了樣板。catalog 的樣板用 `{{ .Values.image.tag | default .Chart.AppVersion }}`，tag 沒有指定時才以 appVersion 當作 Image 的 tag，這是很常見的慣例，但不是 Helm 的規定。' },
        { type: 'example', id: 'kub09-chart' },
        { type: 'p', text: '`helm template` 在本機算繪 chart，把結果印出來，不連線到叢集，也不建立任何東西；`-s templates/configmap.yaml` 只印一個檔案。每份輸出前的 `# Source:` 註解標出它來自哪個樣板。`_helpers.tpl` 的 `catalog.fullname` 是 `helm create` 產生的 chart 都有的命名規則：release 名稱已經包含 chart 名稱時直接用 release 名稱（catalog → catalog），否則接成 `release-chart`（shop → shop-catalog），並截到 63 個字元以內。物件的名稱因此取決於 release 名稱，這在之後寫檢查與 kubectl 指令時要算對。' },
        { type: 'p', text: '`helm lint` 檢查 Chart.yaml 的欄位、values.yaml 能否解析，並以預設值算繪所有樣板、確認每一份都是合法的 YAML。`[INFO] icon is recommended` 只是建議，不算失敗；有 `[ERROR]` 時結束碼是 1，適合放進 CI。要從零開始寫 chart，可以用 `helm create 名稱` 產生一份範本（Deployment、Service、helpers 與 NOTES），再依自己的應用修改。' },
      ],
    },
    {
      id: 'kub09-s-template', title: '樣板語法：.Values、管線與空白控制',
      blocks: [
        { type: 'p', text: 'Helm 的樣板是 Go 的 `text/template` 加上 sprig 函式庫與 Helm 自己的幾個函式。`{{ }}` 之外的文字原樣輸出，`{{ }}` 之內是動作：取值、呼叫函式、條件與迴圈。樣板裡能讀到的物件：`.Values`（計算後的 values）、`.Release`（`Name`、`Namespace`、`Revision`、`IsUpgrade`）、`.Chart`（Chart.yaml 的欄位，例如 `.Chart.AppVersion`）、`.Capabilities`（叢集的版本與 API）、`.Template`（目前樣板的名稱與路徑）。' },
        { type: 'table', head: ['寫法', '作用', '例子'], rows: [
          ['`{{ .Values.image.tag }}`', '取出 values 的值；不存在的鍵是空的', '`replicas: {{ .Values.replicaCount }}`'],
          ['`|` 管線', '把左邊的結果當成右邊函式的最後一個參數', '`{{ .Values.image.tag | default .Chart.AppVersion }}`'],
          ['`default`', '值是空的（空字串、0、false、nil）時用預設值', '`{{ .Values.port | default 80 }}`'],
          ['`quote`', '加上雙引號，讓 YAML 一定把它當字串', '`LOG_LEVEL: {{ $value | quote }}`'],
          ['`toYaml` 與 `nindent N`', '把 map 或清單轉成 YAML，再換行並縮排 N 格', '`{{- toYaml . | nindent 12 }}`'],
          ['`include "名稱" .`', '呼叫 `define` 定義的具名樣板，結果可以再接管線', '`{{- include "catalog.labels" . | nindent 4 }}`'],
          ['`if`／`else`、`with`', '條件；`with` 在值不是空的時候進入，並把 `.` 換成那個值', '`{{- with .Values.resources }}`'],
          ['`range`', '走過清單或 map（map 依鍵排序）', '`{{- range $key, $value := .Values.config }}`'],
          ['`{{-` 與 `-}}`', '刪掉動作左邊（或右邊）所有的空白與換行', '讓 `if`、`range` 不留下空行'],
          ['`required "訊息" .Values.x`', '值沒有設定就讓算繪失敗', '強迫安裝的人提供必要的值'],
        ] },
        { type: 'p', text: '空白控制是寫樣板最常出錯的地方。`{{- include … | nindent 4 }}` 的慣用寫法是：`{{-` 先把這一行前面的縮排與上一行的換行吃掉，`nindent 4` 再補回一個換行與 4 格縮排，結果剛好接在上一個鍵的下一層。`indent` 與 `nindent` 只差在「先不先換行」：把 `nindent` 寫成 `indent`，內容就會黏在上一行的後面，第二題練習就是這個錯誤。範例 kub09-chart 的 Deployment 還用了另一個常見的技巧：`checksum/config` 註解是 ConfigMap 樣板算繪結果的 `sha256sum`。KUB06 看過，ConfigMap 改了，以環境變數讀取它的 Pod 不會更新；把雜湊放進 Pod 範本，設定一變範本就跟著變，Deployment 自動滾動更新。' },
        { type: 'callout', tone: 'warning', title: 'values 裡的數字是 float64', text: 'Helm 把 values 檔讀成 JSON 的數字，在樣板裡是 float64：`1000000` 經 `{{ . }}` 或 `quote` 印出來是 `1e+06`，`printf "%d"` 印出 `%!d(float64=10)`，`eq .Values.replicaCount 1` 甚至會因為型別不同而算繪失敗（incompatible types for comparison）。`--set` 給的整數卻是 int64，同一個值換個方式給就印得不一樣（範例 kub09-values 的最後兩步）。數字要當字串用時，在 values 檔裡就寫成字串（`"1000000"`），或在樣板裡先 `int` 再比較與格式化。' },
      ],
    },
    {
      id: 'kub09-s-values', title: '每個環境的 values 與優先順序',
      blocks: [
        { type: 'p', text: 'chart 的 values.yaml 放所有環境共同的預設值，每個環境只寫自己不同的部分：values-staging.yaml 只有副本數、tag 與日誌等級三件事，values-prod.yaml 是副本數、日誌等級與記憶體上限。安裝時 Helm 由低到高疊上每一層，同一個鍵以優先順序高的為準：' },
        { type: 'table', head: ['優先順序', '來源', '寫法'], rows: [
          ['1（最低）', 'chart 的 values.yaml', 'chart 作者給的預設值'],
          ['2', '父 chart 的 values（用到子 chart 時）', '在父 chart 的 values.yaml 以子 chart 名稱為鍵（課文）'],
          ['3', '`-f`／`--values` 的檔案，依指令上出現的順序', '`-f values-prod.yaml -f values-staging.yaml`：後面的勝出'],
          ['4（最高）', '`--set`、`--set-string`、`--set-file`', '`--set replicaCount=4`、`--set config.LOG_LEVEL=info`'],
        ] },
        { type: 'p', text: '合併的規則：map 逐鍵深度合併，所以 values-staging.yaml 只寫 `image.tag`，`image.repository` 仍然來自預設值；清單整個取代，不會逐項合併；把某個鍵設成 `null` 會刪掉它的預設值。`--set` 用點表示巢狀的鍵（`config.LOG_LEVEL=info`），用 `[0]` 表示清單的元素，用逗號一次設好幾個；`true`、`false` 與整數會被轉成對應的型別，`--set-string` 則一律當成字串。' },
        { type: 'example', id: 'kub09-values' },
        { type: 'p', text: '範例裡同一個 chart 依 values 算繪出四種結果：staging 是 2 個副本、2.2、debug、128Mi；prod 是 3 個副本、chart 的 appVersion、warn、256Mi；`-f values-prod.yaml -f values-staging.yaml` 兩個檔案都有的鍵以 staging 為準，只有 prod 寫的記憶體上限保留下來；`--set` 再蓋過檔案。正式的作法是把每個環境的 values 檔放進版本控制，由 CI 或部署流程以 `-f` 套用；`--set` 適合 CI 帶入每次都不同的值（例如剛建好的 Image tag），臨時在終端機打的 `--set` 則容易在下一次升級時被遺忘。' },
        { type: 'callout', tone: 'warning', title: '不要把真的機密寫進提交到 Git 的 values 檔', text: '把資料庫密碼寫進 values-prod.yaml 再用樣板產生 Secret 很方便，但這個檔案一提交，密碼就跟著每一份 clone 與備份外流（CICD08 的教訓），而 Helm 還會把使用者給的 values 存進 release 的 Secret，`helm get values` 就讀得出來。KUB06 的作法在這裡一樣適用：values 裡只放「引用」——例如 Secret 的名稱，讓樣板寫 `secretKeyRef`——真正的值由 `kubectl create secret`、外部機密管理服務或加密後才提交的工具交給叢集；CI 必須用 `--set` 帶入時，值來自 CI 的 secret，不寫在任何檔案裡。' },
      ],
    },
    {
      id: 'kub09-s-release', title: 'release：install、history 與存在 Secret 裡的 revision',
      blocks: [
        { type: 'p', text: '`helm install 名稱 chart` 依序做幾件事：載入 chart、算出 values、算繪樣板、依 kind 排序，再把每個物件建立到叢集，並加上標籤 `app.kubernetes.io/managed-by: Helm` 與註解 `meta.helm.sh/release-name`、`meta.helm.sh/release-namespace`，最後把這一次的紀錄存成 revision 1。release 屬於一個命名空間（`-n`），同一個命名空間裡名稱不能重複；不同命名空間可以各有一個 catalog。' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`helm install 名稱 chart [-n ns] [--create-namespace] [-f 檔案] [--set …] [--wait]`', '建立 release 的 revision 1；名稱已存在就失敗'],
          ['`helm upgrade 名稱 chart …`（`--install`：不存在就安裝）', '以新的 chart 或 values 建立下一個 revision，只改變有差異的物件'],
          ['`helm list [-n ns | -A] [-a]`', '列出 release；預設只列 deployed 與 failed，`-a` 包括其他狀態'],
          ['`helm status 名稱`、`helm history 名稱`', '目前的狀態區塊；每個 revision 的時間、狀態、chart、appVersion 與說明'],
          ['`helm get values 名稱 [--all] [--revision N]`、`helm get manifest 名稱`', '使用者給的值（`--all` 是計算後的全部值）；送到叢集的 manifest'],
          ['`helm rollback 名稱 [N]`', '以 revision N（沒寫就是上一個）的內容建立新的 revision'],
          ['`helm uninstall 名稱 [--keep-history]`', '刪除 release 的物件與所有 revision 的紀錄'],
        ] },
        { type: 'p', text: 'revision 存在哪裡？每一個 revision 是 release 命名空間裡的一個 Secret，名稱是 `sh.helm.release.v1.名稱.v編號`，type 是 `helm.sh/release.v1`，標籤記著 `name`、`owner=helm`、`status` 與 `version`。內容是這個 revision 的完整紀錄：chart 的中繼資料與預設值、使用者給的 values、算繪出來的 manifest、NOTES 與狀態。`helm list`、`history`、`rollback` 都只是讀這些 Secret；刪掉它們等於刪掉 release 的歷史（物件還留在叢集裡，Helm 卻不再認得它們）。所以能讀 Secret 的權限，也就能讀到 release 用過的所有 values。' },
        { type: 'example', id: 'kub09-install' },
        { type: 'p', text: '範例一開始少了 `--create-namespace`，命名空間不存在，安裝在建立物件時失敗。加上之後，`--wait` 讓指令等到 Deployment 就緒（Image 拉了 3 秒，所以 `date` 是 10:00:04）。沒有 `-n` 的 `helm list` 只看 kubeconfig 的預設命名空間，`-A` 才看全部。Helm 建立的 Deployment 帶著 managed-by 標籤，release Secret 的標籤寫著 `status=deployed,version=1`。同名再 install 會被拒絕，改版要用 `helm upgrade`。`helm uninstall` 依相反的順序刪除物件，連同 release 的 Secret 一起刪除。' },
        { type: 'callout', tone: 'tip', title: '交給 Helm 管的物件，就只用 Helm 改', text: '用 `kubectl edit`、`kubectl scale` 或 `kubectl set image` 直接改 Helm 建立的物件，Helm 的紀錄不會知道。下一次 `helm upgrade` 會以「上一個 revision 的 manifest、叢集裡的現況、新的 manifest」做三方合併，你手改的欄位可能被保留、也可能被蓋掉，結果難以預測；`helm get manifest` 與 `helm get values` 也不再描述叢集的真實狀態。要調整，就改 values 再 upgrade。' },
      ],
    },
    {
      id: 'kub09-s-upgrade', title: '升級與回滾：--wait、--atomic 與 helm rollback',
      blocks: [
        { type: 'p', text: '`helm upgrade` 以新的 chart 與 values 算繪，和上一個 revision 比較：新出現的物件建立，改變的物件更新，上一版有而新版沒有的物件刪除。Deployment 的 Pod 範本改了，接下來就是 KUB04 看過的滾動更新。最容易踩到的是 values 的來源，四種寫法的結果不同：' },
        { type: 'table', head: ['寫法', '這一次的使用者 values', '常見的結果'], rows: [
          ['沒有任何 `-f`、`--set`', '沿用上一個 revision 的使用者 values', '只換 chart 版本時很方便'],
          ['有 `-f` 或 `--set`', '只有這一次給的值，上一版的不會自動帶過來', '只寫 `--set replicaCount=4`，prod 的 LOG_LEVEL 與記憶體上限就回到預設值'],
          ['`--reuse-values` 加上 `--set …`', '上一版的使用者 values，再疊上這一次的', '只改一個值時的安全寫法（但新 chart 增加的預設值不會進來）'],
          ['`--reset-values`', '只用 chart 的預設值與這一次給的值', '想清掉過去所有手動設定時'],
        ] },
        { type: 'p', text: '預設情況下，`helm upgrade` 把物件送給 API server 就回報成功，不管 Pod 起不起得來。`--wait` 讓 Helm 等到資源就緒（Deployment 的新 ReplicaSet 有足夠的就緒副本、Service 有 ClusterIP、PVC 已經 Bound 等），最多 `--timeout`（預設 5m0s）；逾時的 revision 被記成 failed，叢集裡的物件卻停在新版本，上一個成功的 revision 仍然標著 deployed，等你決定怎麼處理。`--atomic` 包含 `--wait`，並在失敗時自動回滾到最後一個成功的 revision；在 CI 或正式環境，它讓「升級失敗」不會留下半套的狀態。' },
        { type: 'example', id: 'kub09-upgrade' },
        { type: 'p', text: '範例從上週以 chart 0.3.0 安裝的 prod 開始：升級到工作站上的 0.4.0（appVersion 2.2）成功成為 revision 2；接著要求根本不存在的 tag 2.3，30 秒後逾時，revision 3 是 failed，`kubectl get pods` 看得到舊的 3 個 Pod 仍在服務、新的 Pod 卡在拉取 Image——滾動更新替你擋住了停機，但 release 處在失敗的狀態。`helm rollback catalog 2` 以 revision 2 存下的 chart、values 與 manifest 建立 revision 4（說明是 Rollback to 2），而不是把歷史倒回去。再用 `--atomic` 做同樣錯誤的升級，Helm 自己完成了 failed 與 Rollback to 4 這兩步。最後三次 upgrade 示範 values 的陷阱：只給 `--set replicaCount=4`，`helm get values` 只剩這一個值，prod 的 warn 與 256Mi 都不見了；以 `-f values-prod.yaml` 恢復之後，改用 `--reuse-values --set replicaCount=4` 才是「在原本的設定上只改副本數」。' },
        { type: 'callout', tone: 'warning', title: '「helm rollback 會把一切還原」', text: 'rollback 還原的是 Kubernetes 物件：它重新套用舊 revision 的 manifest。資料庫的 schema 變更、已經寫進 PersistentVolume（KUB08）的資料、外部系統收到的呼叫都不會回去；新版本在啟動時做過的資料移轉，舊版本也不一定讀得懂。另外，用 `kubectl rollout undo` 只退回 Deployment，Helm 的最新 revision 仍然記著失敗的版本，下一次 upgrade 會從錯的基準出發。需要回滾時用 `helm rollback`，並讓資料的變更保持向後相容。' },
      ],
    },
    {
      id: 'kub09-s-repo', title: 'chart 儲存庫，以及 Helm 和 Kustomize',
      blocks: [
        { type: 'p', text: 'chart 儲存庫是一個 HTTP 伺服器：根目錄的 `index.yaml` 列出每個 chart 的每個版本（appVersion、說明、下載網址與摘要），旁邊是打包好的 `.tgz`。`helm repo add 名稱 網址` 記下儲存庫並下載當時的索引；之後的 `helm search repo`、`helm show`、`helm pull` 與 `helm install 名稱/chart` 都讀本機的索引快取，所以儲存庫發布了新版本，要先 `helm repo update` 才看得到。較新的 Helm 也能把 chart 存在 OCI Registry（和 Image 放在一起），以 `oci://` 開頭的網址使用，這裡只在課文提到。' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`helm repo add 名稱 網址`、`helm repo list`、`helm repo remove 名稱`', '管理儲存庫（記在 `~/.config/helm/repositories.yaml`）'],
          ['`helm repo update`', '重新下載每個儲存庫的索引'],
          ['`helm search repo 關鍵字 [--versions]`', '搜尋本機索引；預設每個 chart 只列最新的版本'],
          ['`helm show chart|values|readme 名稱/chart [--version V]`', '不下載到資料夾就看 Chart.yaml 或預設的 values'],
          ['`helm pull 名稱/chart [--version V] [--untar]`', '下載 `.tgz`（或解開成資料夾）來閱讀或改寫'],
          ['`helm install 名稱 儲存庫/chart --version V`', '直接從儲存庫安裝；正式環境一定要指定版本'],
        ] },
        { type: 'example', id: 'kub09-repo' },
        { type: 'p', text: '範例裡平台組在 10:05 發布了 catalog 0.4.1，`sleep 300` 之後 `helm search repo` 仍然只看到 0.4.0，直到 `helm repo update` 才出現。0.4.1 與 0.4.0 的 appVersion 都是 2.2：chart 的版本與應用的版本各自前進。安裝時寫明 `--version 0.4.1`，部署的內容就不會因為儲存庫有了新版本而在下一次重裝時悄悄改變。`--keep-history` 的 uninstall 刪除物件、但把最後一個 revision 記成 uninstalled，`helm list -a` 與 `helm history` 仍看得到它。' },
        { type: 'p', text: 'Helm 不是唯一的作法。直接 `kubectl apply` 一個資料夾的 manifest 最透明，適合只有一個環境、物件不多的應用。Kustomize 內建在 kubectl（`kubectl apply -k`）：它不用樣板，而是在一份完整的 base manifest 上疊加各環境的 overlay（修補、改名稱前綴、改 Image tag），每一層都是合法的 YAML，容易閱讀與 diff，但沒有 release、revision 與回滾的概念。Helm 的樣板更有彈性，又有版本化的 release、儲存庫與生態系，代價是樣板語法與空白控制的學習成本，以及「算繪之後才看得到真正的 YAML」。不少團隊兩者並用：第三方元件用 Helm 安裝，自己的服務用 Kustomize 或 Helm，再交給 GitOps 工具依 Git 的內容同步到叢集。' },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['安裝前看算繪結果、檢查 chart', '`helm template 名稱 ./chart -f 檔案`、`helm lint ./chart`'],
          ['安裝到某個環境並等待就緒', '`helm install 名稱 ./chart -n ns --create-namespace -f values-環境.yaml --wait`'],
          ['升級，失敗就自動退回', '`helm upgrade 名稱 ./chart -n ns -f values-環境.yaml --atomic --timeout 2m`'],
          ['看歷史與某一版的值', '`helm history 名稱 -n ns`、`helm get values 名稱 -n ns --revision N`'],
          ['回到某一版', '`helm rollback 名稱 N -n ns --wait`'],
          ['從儲存庫安裝指定版本', '`helm repo update`，再 `helm install 名稱 儲存庫/chart --version V`'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, PROD, STAGE, CART, TICKET, HISTORY],
    examples: EXAMPLES,
    exercises: EXERCISES,
  },
  quiz: [
    {
      id: 'kub09-q1', prompt: 'catalog 的 chart 從 0.4.0 改成 0.4.1，只修正了一個樣板的縮排，裡面打包的程式仍然是 2.2。Chart.yaml 應該怎麼改？',
      options: ['`version` 與 `appVersion` 都改成 0.4.1，兩者必須相同', '`appVersion` 改成 "2.2.1"，`version` 不變', '`version` 改成 0.4.1，`appVersion` 維持 "2.2"', '兩者都不用改，Helm 依檔案內容的雜湊分辨版本'],
      answer: 2,
      explanation: '`version` 是 chart 本身的 SemVer 版本，樣板改了就要升；`appVersion` 描述裡面打包的應用版本，程式沒變就維持 "2.2"。兩者不需要相同，也各自前進；appVersion 不是用來記錄 chart 的修改；Helm 與儲存庫的索引都以 `version` 辨認 chart 的版本，不看檔案的雜湊。',
    },
    {
      id: 'kub09-q2', prompt: '樣板寫著 `resources:` 與下一行的 `{{- toYaml .Values.resources | indent 12 }}`，`helm lint` 回報 YAML 解析錯誤。最可能的修正是？',
      options: ['把 `indent 12` 改成 `nindent 12`', '把 `toYaml` 改成 `quote`，讓整段變成字串', '把 `indent 12` 改成 `indent 14`', '在 values.yaml 的 resources 外面加上引號'],
      answer: 0,
      explanation: '`{{-` 刪掉了前面的換行，`indent` 又不會先換行，toYaml 的內容就接在 `resources:` 的同一行；`nindent` 先換行再縮排，得到正確的巢狀結構。`quote` 會把整個 map 變成一個字串，Kubernetes 不接受；多縮兩格不解決換行的問題；values 裡加引號會讓 resources 變成字串而不是 map。',
    },
    {
      id: 'kub09-q3', prompt: '執行 `helm upgrade catalog ./catalog -f values-prod.yaml -f values-staging.yaml --set replicaCount=5`。三個來源都設定了 replicaCount（prod 3、staging 2），chart 的預設是 1。結果是？',
      options: ['3：values-prod.yaml 寫在前面，優先順序最高', '2：最後一個 `-f` 檔案勝出', '1：chart 的 values.yaml 永遠優先', '5：`--set` 的優先順序高於所有 `-f` 檔案'],
      answer: 3,
      explanation: '優先順序由低到高是 chart 的 values.yaml、依序出現的 `-f` 檔案（後面的勝出）、`--set`。所以 staging 蓋過 prod，`--set replicaCount=5` 又蓋過兩個檔案。寫在前面的檔案優先順序反而較低；chart 的預設值是最低的一層；若沒有 `--set`，答案才會是 staging 的 2。',
    },
    {
      id: 'kub09-q4', prompt: 'prod 的 catalog 是用 `-f values-prod.yaml` 安裝的（3 個副本、LOG_LEVEL warn）。值班的人執行 `helm upgrade catalog ./catalog -n prod --set replicaCount=4`。之後的使用者 values 是？',
      options: ['values-prod.yaml 的值加上 replicaCount 4，因為 Helm 一律沿用上一版', '只有 replicaCount 4，LOG_LEVEL 回到 chart 預設的 info', '升級被拒絕，因為沒有再次指定 `-f values-prod.yaml`', '所有值都回到 chart 的預設，replicaCount 也是預設的 1'],
      answer: 1,
      explanation: '`helm upgrade` 有給 `-f` 或 `--set` 時，只用這一次給的值，上一版的使用者 values 不會自動帶過來，所以 prod 的 warn 與記憶體上限都回到預設。只有完全沒給值時才沿用上一版；要在原本的設定上只改一個值，要加 `--reuse-values` 或再給一次 `-f values-prod.yaml`。升級不會被拒絕；`--set` 給的 4 仍然生效，不是全部回到預設。',
    },
    {
      id: 'kub09-q5', prompt: '`kubectl get secrets -n prod` 列出 `sh.helm.release.v1.catalog.v1` 到 `v4`。這些 Secret 是什麼？',
      options: ['release 紀錄：每個 revision 一個，存著 values 與 manifest', 'catalog 的 Pod 掛載的 TLS 憑證，Helm 每次升級時輪替一次', 'Helm 在叢集裡常駐元件的登入資料，刪掉之後 helm 指令會失效', 'chart 儲存庫的帳號密碼，在 helm repo add 時寫進叢集'],
      answer: 0,
      explanation: 'Helm 3 把 release 的每個 revision 存成 release 命名空間裡 type 為 `helm.sh/release.v1` 的 Secret，內容是那一版的 chart 中繼資料、values、manifest 與狀態，`helm history`、`rollback` 都讀它們。它們不是 Pod 用的憑證；Helm 3 沒有常駐在叢集裡的元件；儲存庫的設定存在工作站的 `~/.config/helm`，不在叢集裡。',
    },
    {
      id: 'kub09-q6', prompt: '`helm history catalog -n prod` 顯示 revision 2 deployed、revision 3 failed。執行 `helm rollback catalog 2 -n prod --wait` 之後，歷史會是？',
      options: ['revision 3 被刪除，revision 2 重新成為最新的 deployed', 'revision 2 與 3 的狀態互換，總數不變', '多一個 revision 4，說明是 Rollback to 2，狀態 deployed', '所有歷史被清空，從 revision 1 重新開始'],
      answer: 2,
      explanation: 'rollback 不改寫歷史，而是以 revision 2 存下的 chart、values 與 manifest 建立新的 revision 4（Rollback to 2）；failed 的 revision 3 留在歷史裡，之前 deployed 的成為 superseded。Helm 不會刪除或互換舊的 revision，也不會清空歷史；清空歷史的是不加 `--keep-history` 的 uninstall。',
    },
    {
      id: 'kub09-q7', prompt: '團隊在 CI 裡用 `helm upgrade --atomic --timeout 2m` 部署。新版本的 Pod 因為設定錯誤一直無法就緒，會發生什麼？',
      options: ['Helm 立刻回報成功，因為物件都被 API server 接受了', 'Helm 無限期等待，直到有人手動中止 CI', 'release 停在 failed，叢集維持新版本，等人手動回滾', '2 分鐘後判定失敗，自動回滾到最後一個成功的 revision，指令以錯誤結束'],
      answer: 3,
      explanation: '`--atomic` 包含 `--wait`：Helm 等資源就緒，最多 `--timeout` 的 2 分鐘；逾時後把這個 revision 記成 failed，並自動 rollback 到最後一個成功的 revision，指令以非零的結束碼讓 CI 失敗。沒有 `--wait` 才會立刻回報成功；等待有 `--timeout` 的上限；只有 `--wait` 而沒有 `--atomic` 時才會停在 failed 等人處理。',
    },
    {
      id: 'kub09-q8', prompt: '平台組昨天在 chart 儲存庫發布了 catalog 0.5.0，但你的 `helm search repo catalog` 仍然只看到 0.4.1。最可能的原因是？',
      options: ['`helm search repo` 預設隱藏最新發布的那個版本', '本機的索引是上次的快取，要先 `helm repo update`', '0.5.0 的 appVersion 和 0.4.1 相同，所以被合併成一筆', '新版本要等 Helm 在背景自動同步，每 24 小時一次'],
      answer: 1,
      explanation: '`helm search repo`、`show`、`pull` 與 `install` 都讀本機快取的 `index.yaml`，那是 `helm repo add` 或上一次 `helm repo update` 時下載的；儲存庫之後發布的版本要更新索引才看得到。search 預設列出每個 chart 最新的版本，不會隱藏它；appVersion 相同的 chart 版本各自是一筆；Helm 沒有背景自動同步的機制。',
    },
  ],
};
