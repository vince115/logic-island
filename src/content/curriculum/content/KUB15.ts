/*
 * KUB15 Kubernetes 與可靠性工程島綜合專題：SRE 實務演練 (KUB-5, challenge-stages: the terminal on the autoscaling profile —
 * engine stages E32–E40 — with the devops-explorer's D6 SLO, D3 dashboard and D5 traces, and the challenge-stages
 * visualization). The made-up shop team's workstation ops-ws (user yuki) and the fictional three-node cluster (cp-01,
 * node-01, node-02) with ingress-nginx (LoadBalancer 10.0.0.200, /etc/hosts maps shop.example.test to it) and
 * metrics-server. catalog moves from hand-applied manifests to the team's chart ~/shop/catalog (1.0.0, appVersion 2.2: a
 * Deployment with an httpGet readiness probe on /healthz, a Service, an Ingress and an autoscaling/v2 HPA gated by values,
 * resources, strategy and tolerations from values). shop/catalog:2.3 needs a search index the cluster does not have: its
 * /healthz always answers 503. Six stages, each machine in the state the earlier stages leave: (1) write values-prod.yaml
 * (3 replicas, requests 200m/128Mi, a 256Mi memory limit, the Ingress) and helm install --create-namespace --wait, then curl
 * through the entrance; (2) under 600 requests a second (1m of CPU each) enable the HPA (3–10, CPU 60%) and maxSurge 1 /
 * maxUnavailable 0 with helm upgrade -f, and watch it scale to 5; (3) ship 2.3 with --atomic --timeout 30s: the new pod never
 * becomes ready, the old three keep serving, and Helm rolls back to revision 1 (revision 3); (4) D6: catalog's SLO (99.9% over
 * 30 days, the window's first two days in 5-minute buckets, windowTotal 86,400,000): the budget, what one release without a
 * readiness probe used, and a burn-rate page that replaces the old 5-minute 0.1% rule; (5) the game day: node-02 loses power
 * at 10:02 (kube.failures), NotReady 50 s later, two of the three pods stay for their 300 s toleration, and the runbook's manual
 * step deletes them (--wait=false) so the ReplicaSet replaces them on node-01; D3/D5 show what users saw (the entrance's 1 s
 * connect timeout and retry); (6) the postmortem's times and severity (D3's incident timeline), then the action item: a 30 s
 * toleration for unreachable and not-ready, and the drill run again with no manual step. Pod and ReplicaSet names are
 * hashes: commands use labels and field selectors. PodDisruptionBudgets, topology spread and chaos tools are prose only.
 * Hosts, users, images and the cluster are made up; every transcript output was produced by replaying it on the engine and
 * every explorer answer is computed by src/lib/devops.
 */
import type { TerminalExample, TerminalExercise, TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { TerminalKubeLoad } from '@/lib/terminal/kube-metrics-lesson';
import type { Dashboard } from '@/lib/devops/dashboard';
import type { SeverityMatrix } from '@/lib/devops/incident';
import type { SloScenario } from '@/lib/devops/slo';
import type { SpanInput, TraceSet } from '@/lib/devops/traces';
import type { DevopsExercise } from '@/lib/devops/types';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string, append = false) => `cat ${append ? '>>' : '>'} ${path} <<'EOF'\n${text}EOF`;

// ---- images and what they answer ---------------------------------------------------------------------------------------
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const BASIC = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
const catalogImage = (version: string, created: string): TerminalImage => ({
  name: `shop/catalog:${version}`, size: 48_000_000, created, cmd: ['./server'], workdir: '/app', expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: BASIC,
  http: { port: 8080, responder: `catalog-${version.replace('.', '')}` }, logs: [`catalog ${version} listening on :8080`], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } },
});
const IMAGES = [catalogImage('2.2', '2026-11-20 09:00:00'), catalogImage('2.3', '2026-11-24 08:30:00')];
// Behind the Ingress a backend gets the whole path: /healthz first, then every other path.
const page = (version: string, health: { status?: number; body: string }) => ({
  id: `catalog-${version.replace('.', '')}`, server: `catalog/${version}`,
  routes: [{ path: '/healthz', ...health, type: 'text/plain' }, { path: '/*', body: `catalog ${version} served by {{hostname}}\n`, type: 'text/plain' }],
});
// catalog 2.3 needs a search index the cluster does not have yet: its /healthz always answers 503, so it never becomes ready.
const RESPONDERS = [page('2.2', { body: 'ok\n' }), page('2.3', { status: 503, body: 'search index not built\n' })];
const WORKERS = ['node-01', 'node-02'];

// ---- the team's chart ~/shop/catalog --------------------------------------------------------------------------------------
const CHART_YAML = yaml('apiVersion: v2', 'name: catalog', 'description: The shop product catalog service', 'type: application', 'version: 1.0.0', 'appVersion: "2.2"');
const VALUES = yaml('# Defaults; values-prod.yaml overrides them for production.', 'replicaCount: 2', 'image:', '  repository: shop/catalog', '  # Empty: the chart\'s appVersion.', '  tag: ""',
  'service:', '  port: 80', 'resources: {}', 'strategy: {}', 'tolerations: []', 'ingress:', '  enabled: false', '  host: ""', 'autoscaling:', '  enabled: false', '  minReplicas: 3', '  maxReplicas: 10', '  cpu: 60');
const HELPERS = yaml('{{- define "catalog.fullname" -}}', '{{- if contains .Chart.Name .Release.Name }}', '{{- .Release.Name | trunc 63 | trimSuffix "-" }}', '{{- else }}',
  '{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}', '{{- end }}', '{{- end }}',
  '{{- define "catalog.selectorLabels" -}}', 'app.kubernetes.io/name: {{ .Chart.Name }}', 'app.kubernetes.io/instance: {{ .Release.Name }}', '{{- end }}',
  '{{- define "catalog.labels" -}}', '{{ include "catalog.selectorLabels" . }}', 'app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}', 'helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}', '{{- end }}');
const META = ['metadata:', '  name: {{ include "catalog.fullname" . }}', '  labels:', '    {{- include "catalog.labels" . | nindent 4 }}'];
const DEPLOY = yaml('apiVersion: apps/v1', 'kind: Deployment', ...META, 'spec:',
  '  {{- if not .Values.autoscaling.enabled }}', '  replicas: {{ .Values.replicaCount }}', '  {{- end }}',
  '  {{- with .Values.strategy }}', '  strategy:', '    {{- toYaml . | nindent 4 }}', '  {{- end }}',
  '  selector:', '    matchLabels:', '      {{- include "catalog.selectorLabels" . | nindent 6 }}', '  template:', '    metadata:', '      labels:', '        {{- include "catalog.selectorLabels" . | nindent 8 }}',
  '    spec:', '      containers:', '        - name: catalog', '          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"', '          ports:', '            - name: http',
  '              containerPort: 8080', '          readinessProbe:', '            httpGet:', '              path: /healthz', '              port: http', '            periodSeconds: 5',
  '          {{- with .Values.resources }}', '          resources:', '            {{- toYaml . | nindent 12 }}', '          {{- end }}',
  '      {{- with .Values.tolerations }}', '      tolerations:', '        {{- toYaml . | nindent 8 }}', '      {{- end }}');
const SERVICE = yaml('apiVersion: v1', 'kind: Service', ...META, 'spec:', '  selector:', '    {{- include "catalog.selectorLabels" . | nindent 4 }}', '  ports:', '    - name: http',
  '      port: {{ .Values.service.port }}', '      targetPort: http');
const INGRESS = yaml('{{- if .Values.ingress.enabled }}', 'apiVersion: networking.k8s.io/v1', 'kind: Ingress', ...META, 'spec:', '  ingressClassName: nginx', '  rules:', '    - host: {{ .Values.ingress.host | quote }}',
  '      http:', '        paths:', '          - path: /api', '            pathType: Prefix', '            backend:', '              service:', '                name: {{ include "catalog.fullname" . }}',
  '                port:', '                  name: http', '{{- end }}');
const HPA = yaml('{{- if .Values.autoscaling.enabled }}', 'apiVersion: autoscaling/v2', 'kind: HorizontalPodAutoscaler', ...META, 'spec:', '  scaleTargetRef:', '    apiVersion: apps/v1', '    kind: Deployment',
  '    name: {{ include "catalog.fullname" . }}', '  minReplicas: {{ .Values.autoscaling.minReplicas }}', '  maxReplicas: {{ .Values.autoscaling.maxReplicas }}', '  metrics:', '    - type: Resource', '      resource:',
  '        name: cpu', '        target:', '          type: Utilization', '          averageUtilization: {{ .Values.autoscaling.cpu }}', '{{- end }}');
const NOTES = yaml('catalog {{ .Values.image.tag | default .Chart.AppVersion }} runs as {{ include "catalog.fullname" . }} in {{ .Release.Namespace }}.',
  '{{- if .Values.ingress.enabled }}', 'From outside: http://{{ .Values.ingress.host }}/api/', '{{- end }}');
const CHART: Record<string, string> = { 'Chart.yaml': CHART_YAML, 'values.yaml': VALUES, 'templates/_helpers.tpl': HELPERS, 'templates/deployment.yaml': DEPLOY, 'templates/service.yaml': SERVICE,
  'templates/ingress.yaml': INGRESS, 'templates/hpa.yaml': HPA, 'templates/NOTES.txt': NOTES };
const CHART_FILES = [dir('/home/yuki/shop/catalog'), dir('/home/yuki/shop/catalog/templates'), ...Object.entries(CHART).map(([p, c]) => file(`/home/yuki/shop/catalog/${p}`, c))];

// ---- production's values, as each stage leaves them ---------------------------------------------------------------------
const HOST = 'shop.example.test', LB = '10.0.0.200';
const PROD_BASE = yaml('# catalog on production', 'replicaCount: 3', 'resources:', '  requests:', '    cpu: 200m', '    memory: 128Mi', '  limits:', '    memory: 256Mi', 'ingress:', '  enabled: true', `  host: ${HOST}`);
const PROD_SCALE = yaml('autoscaling:', '  enabled: true', '  minReplicas: 3', '  maxReplicas: 10', '  cpu: 60', 'strategy:', '  type: RollingUpdate', '  rollingUpdate:', '    maxSurge: 1', '    maxUnavailable: 0');
const PROD_SCALED = PROD_BASE + PROD_SCALE;
const PROD_TOLERATE = yaml('tolerations:', '  - key: node.kubernetes.io/unreachable', '    operator: Exists', '    effect: NoExecute', '    tolerationSeconds: 30',
  '  - key: node.kubernetes.io/not-ready', '    operator: Exists', '    effect: NoExecute', '    tolerationSeconds: 30');

// ---- the workstation and the cluster --------------------------------------------------------------------------------------
// /etc/hosts stands in for the company's DNS record of the shop's entrance (ingress-nginx's LoadBalancer address).
const HOSTS = `127.0.0.1 localhost\n127.0.1.1 ops-ws\n${LB} ${HOST}\n`;
type Release = NonNullable<NonNullable<TerminalKube['helm']>['releases']>[number];
const release = (values: string, at: string): Release => ({ name: 'catalog', chart: 'catalog', version: '1.0.0', values, namespace: 'shop', at: `2026-11-24 ${at}` });
const kubeOf = (more: Partial<TerminalKube> = {}): TerminalKube => ({
  created: '2026-11-01 00:00:00',
  images: [{ name: 'shop/catalog:2.2', seconds: 3 }, { name: 'shop/catalog:2.3', seconds: 2 }],
  lbPool: ['10.0.0.200-10.0.0.209'], ingressController: { service: 'LoadBalancer' }, metricsServer: true,
  helm: { charts: [{ files: CHART }] },
  ...more,
});
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki/shop', profile: 'autoscaling', now: '2026-11-24 10:00:00',
  files: [dir('/etc', 'root'), file('/etc/hosts', HOSTS, 'root'), dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...CHART_FILES, ...files],
  responders: RESPONDERS,
  docker: { images: IMAGES },
  kube,
});
const withRelease = (values: string, more: Partial<TerminalKube> = {}) => kubeOf({ ...more, helm: { charts: [{ files: CHART }], releases: [release(values, '09:50:00')] } });
// Stage 1: nothing is installed yet.
const DEPLOY_WS = workstation('kub15-deploy', 'ops-ws（第一關：chart 寫好了，production 還沒有 catalog）', [], kubeOf());
// Stage 2: catalog runs with production's values; the afternoon's traffic is rising.
const SALE: TerminalKubeLoad = { service: 'catalog', namespace: 'shop', start: '2026-11-24 09:55:00', minutes: 30, rps: Array.from({ length: 30 }, () => 600), cpuPerRequest: '1m' };
const SCALE_WS = workstation('kub15-scale', 'ops-ws（第二關：catalog 固定 3 個副本，下午的流量正在上升）', [file('/home/yuki/shop/values-prod.yaml', PROD_BASE)], withRelease(PROD_BASE, { load: [SALE] }));
// Stage 3: autoscaling and maxUnavailable 0 are in; 2.3 is waiting to ship.
const RELEASE_WS = workstation('kub15-release', 'ops-ws（第三關：HPA 與 maxUnavailable 0 已經上線，2.3 等著發布）', [file('/home/yuki/shop/values-prod.yaml', PROD_SCALED)], withRelease(PROD_SCALED));
// Stages 5–6: the game day. node-02 loses power at 10:02 (UTC), as the drill plan says.
const CHAOS_WS = workstation('kub15-chaos', 'ops-ws（第五、六關：混沌演練，node-02 預定 10:02 斷電）', [file('/home/yuki/shop/values-prod.yaml', PROD_SCALED)],
  withRelease(PROD_SCALED, { failures: [{ node: 'node-02', at: '2026-11-24 10:02:00' }] }));


// ---- Stage 4 (D6): catalog's SLO over two days in 5-minute buckets, the start of a 30-day window. 示意資料.
const slo = (): SloScenario => ({
  service: 'catalog（shop 的商品目錄 API）', sli: '經由 shop.example.test 進來、回應碼不是 5xx 而且在 300 ms 內完成的 /api 請求',
  bucketMinutes: 5, buckets: 576,
  total: { shape: { seed: 1501, baseline: 10000, noise: 400 } },
  bad: { shape: { seed: 1502, baseline: 3, noise: 2, changes: [
    { kind: 'spike', at: 98, minutes: 1, delta: 300 },
    { kind: 'spike', at: 170, minutes: 5, delta: 3000 }] } },
  objective: { targetPermyriad: 9990, windowMinutes: 43200, windowTotal: 86_400_000 },
  incidents: [{ id: 'no-readiness', label: '沒有就緒探針的 2.3 測試版上線，三成的請求回 503', start: 170, end: 175 }],
  alerts: [{ id: 'old-page', label: '舊的呼叫規則：5 分鐘的錯誤率超過 0.1%（消耗率 ≥ 1）', longMinutes: 5, shortMinutes: 5, factorTenths: 10, severity: 'critical' }],
});

// ---- Stages 5–6 (D3): the game day, minute 0 = 10:00 UTC; node-02 loses power at 10:02. 示意資料.
const SEVERITY: SeverityMatrix = {
  rows: [{ label: '一半以上的使用者（50% 以上）', minUsersPercent: 50 }, { label: '部分使用者（10% 以上）', minUsersPercent: 10 }, { label: '少數使用者（10% 以下）', minUsersPercent: 0 }],
  columns: [{ label: '60 分鐘以上', minMinutes: 60 }, { label: '15–59 分鐘', minMinutes: 15 }, { label: '15 分鐘以內', minMinutes: 0 }],
  levels: [['SEV1', 'SEV1', 'SEV2'], ['SEV2', 'SEV2', 'SEV3'], ['SEV3', 'SEV3', 'SEV4']],
};
const drillBoard = (): Dashboard => ({
  service: 'catalog（混沌演練當天的 production）', minutes: 30,
  series: [
    { id: 'errors', label: '/api 請求的錯誤率', unit: '‰', signal: 'errors', shape: { seed: 1503, baseline: 2, noise: 1, changes: [
      { kind: 'spike', at: 2, minutes: 1, delta: 180 }, { kind: 'spike', at: 3, minutes: 2, delta: 40 }] } },
    { id: 'p95', label: '/api 請求的 p95 延遲', unit: 'ms', signal: 'latency', shape: { seed: 1504, baseline: 120, noise: 10, changes: [
      { kind: 'spike', at: 2, minutes: 1, delta: 1900 }, { kind: 'spike', at: 3, minutes: 2, delta: 480 }] } },
    { id: 'rpm', label: '每分鐘請求', unit: '個', signal: 'traffic', shape: { seed: 1505, baseline: 9000, noise: 300 } },
    { id: 'ready', label: '可用的 catalog 副本', unit: '個', signal: 'saturation', values: [3, 3, 3, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] },
  ],
  incidents: [{ id: 'node-02', label: '演練：node-02 斷電', start: 2, end: 5, usersPercent: 35, events: [
    { at: 2, kind: 'note', text: '10:02 依演練計畫切斷 node-02 的電源（catalog 有 2 個 Pod 在上面）' },
    { at: 3, kind: 'detected', text: '10:03 告警「錯誤率超過 10‰，持續 1 分鐘」觸發，呼叫值班的 yuki' },
    { at: 4, kind: 'acknowledged', text: '10:04 yuki 確認接手（交班紀錄沒寫今天有演練，先花了一分鐘確認不是真的停電）' },
    { at: 5, kind: 'mitigated', text: '10:05 照處理手冊刪除卡在 node-02 的兩個 Pod，ReplicaSet 在 node-01 補上，3 個副本可用' },
    { at: 20, kind: 'resolved', text: '10:20 演練結束，開始寫事後檢討' },
  ] }],
  rules: [{ id: 'errors-10', label: '錯誤率超過 10‰，持續 1 分鐘', series: 'errors', op: '>', threshold: 10, forMinutes: 1, severity: 'critical' }],
  severity: SEVERITY,
});

// ---- Stage 5 (D5): requests through ingress-nginx during the game day (the exemplars of the p95 series). 示意資料.
const T_OK = '3f1c9a7e52b04d18a6e7c2d90b5f1e64', T_RETRY = 'b72e0d4c9a1f4e3b8c5d6a7f1e2b9c30', T_BUSY = '5a9d2c7e1b3f40a8b6c4e2d9f7a1c053';
type Extra = Pick<SpanInput, 'status' | 'kind' | 'attributes'>;
const span = (prefix: string, n: number, parent: number | undefined, service: string, name: string, start: number, duration: number, extra: Extra = {}): SpanInput =>
  ({ id: `${prefix}${n.toString(16).padStart(12, '0')}`, ...parent === undefined ? {} : { parent: `${prefix}${parent.toString(16).padStart(12, '0')}` }, service, name, start, duration, ...extra });
const on = (node: string) => ({ 'k8s.node.name': node });
const drillTraces = (): TraceSet => ({
  traces: [
    { id: T_OK, spans: [
      span('a1a1', 1, undefined, 'ingress-nginx', 'GET /api/items', 0, 26, { kind: 'server', attributes: { 'http.host': HOST } }),
      span('a1a1', 2, 1, 'catalog', 'GET /api/items', 3, 20, { kind: 'server', attributes: on('node-02') }),
      span('a1a1', 3, 2, 'catalog', 'SELECT items', 6, 12, { kind: 'client' }),
    ] },
    { id: T_RETRY, spans: [
      span('b2b2', 1, undefined, 'ingress-nginx', 'GET /api/items', 0, 1031, { kind: 'server', attributes: { 'http.host': HOST } }),
      span('b2b2', 2, 1, 'ingress-nginx', 'connect 10.244.2.2:8080', 2, 1000, { kind: 'client', status: 'error', attributes: { 'k8s.node.name': 'node-02', error: 'upstream connect timed out' } }),
      span('b2b2', 3, 1, 'catalog', 'GET /api/items', 1005, 23, { kind: 'server', attributes: on('node-01') }),
      span('b2b2', 4, 3, 'catalog', 'SELECT items', 1008, 13, { kind: 'client' }),
    ] },
    { id: T_BUSY, spans: [
      span('c3c3', 1, undefined, 'ingress-nginx', 'GET /api/items', 0, 612, { kind: 'server', attributes: { 'http.host': HOST } }),
      span('c3c3', 2, 1, 'catalog', 'GET /api/items', 3, 606, { kind: 'server', attributes: on('node-01') }),
      span('c3c3', 3, 2, 'catalog', 'SELECT items', 588, 14, { kind: 'client' }),
    ] },
  ],
  exemplars: [{ series: 'p95', minute: 1, trace: T_OK }, { series: 'p95', minute: 2, trace: T_RETRY }, { series: 'p95', minute: 3, trace: T_BUSY }],
});

// ---- Examples (every output was produced by replaying the commands on the engine) ---------------------------------------
const CURL = `curl -s http://${HOST}/api/items`;
const WRITE_PROD = heredoc('values-prod.yaml', PROD_BASE);
const ADD_SCALE = heredoc('values-prod.yaml', PROD_SCALE, true);
const ADD_TOLERATE = heredoc('values-prod.yaml', PROD_TOLERATE, true);
const INSTALL = 'helm install catalog ./catalog -n shop --create-namespace -f values-prod.yaml --wait';
const UPGRADE = 'helm upgrade catalog ./catalog -n shop -f values-prod.yaml --wait';
const SHIP = 'helm upgrade catalog ./catalog -n shop -f values-prod.yaml --set image.tag=2.3';
const ON_NODE_02 = 'kubectl get pods -n shop --field-selector spec.nodeName=node-02';
const DELETE_STUCK = 'kubectl delete pod -n shop --field-selector spec.nodeName=node-02 --wait=false';
const NODE_READY = `.status.conditions[?(@.type=="Ready")].status`;

const EXAMPLES: TerminalExample[] = [
  {
    id: 'kub15-ex-chart', title: '團隊的 chart：一份樣板，四種物件', machine: 'kub15-deploy',
    description: '看 chart 的樣板與預設值：Ingress 與 HPA 預設關閉，開啟 HPA 時 Deployment 不再寫 replicas；再用 helm lint 與 helm template 在本機算繪 Ingress，確認它交給 ingress-nginx。',
    steps: [
      { command: 'ls catalog/templates', output: "NOTES.txt  _helpers.tpl  deployment.yaml  hpa.yaml  ingress.yaml  service.yaml" },
      { command: 'cat catalog/values.yaml', output: "# Defaults; values-prod.yaml overrides them for production.\nreplicaCount: 2\nimage:\n  repository: shop/catalog\n  # Empty: the chart's appVersion.\n  tag: \"\"\nservice:\n  port: 80\nresources: {}\nstrategy: {}\ntolerations: []\ningress:\n  enabled: false\n  host: \"\"\nautoscaling:\n  enabled: false\n  minReplicas: 3\n  maxReplicas: 10\n  cpu: 60" },
      { command: "grep -n -A3 -e 'if not' -e readinessProbe catalog/templates/deployment.yaml", output: "8:  {{- if not .Values.autoscaling.enabled }}\n9-  replicas: {{ .Values.replicaCount }}\n10-  {{- end }}\n11-  {{- with .Values.strategy }}\n--\n29:          readinessProbe:\n30-            httpGet:\n31-              path: /healthz\n32-              port: http" },
      { command: 'helm lint ./catalog', output: "==> Linting ./catalog\n[INFO] Chart.yaml: icon is recommended\n\n1 chart(s) linted, 0 chart(s) failed" },
      { command: `helm template catalog ./catalog -s templates/ingress.yaml --set ingress.enabled=true --set ingress.host=${HOST}`, output: "---\n# Source: catalog/templates/ingress.yaml\napiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: catalog\n  labels:\n    app.kubernetes.io/name: catalog\n    app.kubernetes.io/instance: catalog\n    app.kubernetes.io/version: \"2.2\"\n    helm.sh/chart: catalog-1.0.0\nspec:\n  ingressClassName: nginx\n  rules:\n    - host: \"shop.example.test\"\n      http:\n        paths:\n          - path: /api\n            pathType: Prefix\n            backend:\n              service:\n                name: catalog\n                port:\n                  name: http" },
    ],
  },
  {
    id: 'kub15-ex-traffic', title: '下午的流量：3 個副本都忙到 requests 的上限', machine: 'kub15-scale',
    description: 'production 的 catalog 是第一關裝好的 release（固定 3 個副本）。每秒約 600 個請求平均分給 3 個 Pod，每個 Pod 的 CPU 用量已經和它的 requests（200m）一樣多。',
    steps: [
      { command: 'helm list -n shop', output: "NAME   \tNAMESPACE\tREVISION\tUPDATED                      \tSTATUS  \tCHART        \tAPP VERSION\ncatalog\tshop     \t1       \t2026-11-24 09:50:00 +0000 UTC\tdeployed\tcatalog-1.0.0\t2.2        " },
      { command: 'kubectl get deploy,ing -n shop', output: "NAME                      READY     UP-TO-DATE   AVAILABLE   AGE\ndeployment.apps/catalog   3/3       3            3           10m\n\nNAME                                CLASS     HOSTS               ADDRESS      PORTS     AGE\ningress.networking.k8s.io/catalog   nginx     shop.example.test   10.0.0.200   80        10m" },
      { command: 'kubectl top pods -n shop', output: "NAME                       CPU(cores)   MEMORY(bytes)\ncatalog-tw4rzdmdc8-mtpdl   201m         8Mi\ncatalog-tw4rzdmdc8-qshnr   201m         8Mi\ncatalog-tw4rzdmdc8-x6848   201m         8Mi" },
      { command: CURL, output: "catalog 2.2 served by catalog-tw4rzdmdc8-x6848" },
    ],
  },
  {
    id: 'kub15-ex-stuck', title: '2.3 卡在第一個 Pod：使用者看不到它', machine: 'kub15-release',
    description: '不加 --wait 把 2.3 推上 production：Helm 立刻回報 deployed，新的 Pod 卻一直不就緒。maxUnavailable 0 讓舊的 3 個 Pod 全部留著，Endpoints 只有它們，使用者拿到的都是 2.2；最後以 helm rollback 退回。',
    steps: [
      { command: SHIP, output: "Release \"catalog\" has been upgraded. Happy Helming!\nNAME: catalog\nLAST DEPLOYED: Tue Nov 24 10:00:00 2026\nNAMESPACE: shop\nSTATUS: deployed\nREVISION: 2\nTEST SUITE: None\nNOTES:\ncatalog 2.3 runs as catalog in shop.\nFrom outside: http://shop.example.test/api/" },
      { command: 'sleep 20', output: "" },
      { command: 'kubectl get pods -n shop', output: "NAME                       READY     STATUS    RESTARTS   AGE\ncatalog-tw4rzdmdc8-kb29j   1/1       Running   0          10m\ncatalog-tw4rzdmdc8-mtpdl   1/1       Running   0          10m\ncatalog-tw4rzdmdc8-x6848   1/1       Running   0          10m\ncatalog-zft9zzgzjg-wvfs2   0/1       Running   0          20s" },
      { command: 'kubectl get endpoints catalog -n shop', output: "NAME      ENDPOINTS                                         AGE\ncatalog   10.244.1.4:8080,10.244.2.2:8080,10.244.2.3:8080   10m" },
      { command: CURL, output: "catalog 2.2 served by catalog-tw4rzdmdc8-kb29j" },
      { command: 'kubectl events -n shop --types=Warning | grep -e REASON -e Unhealthy', output: "LAST SEEN          TYPE      REASON                         OBJECT                            MESSAGE\n3s (x4 over 18s)   Warning   Unhealthy                      Pod/catalog-zft9zzgzjg-wvfs2      Readiness probe failed: HTTP probe failed with statuscode: 503" },
      { command: 'helm rollback catalog 1 -n shop --wait', output: "Rollback was a success! Happy Helming!" },
      { command: 'helm history catalog -n shop', output: "REVISION\tUPDATED                 \tSTATUS    \tCHART        \tAPP VERSION\tDESCRIPTION     \n1       \tTue Nov 24 09:50:00 2026\tsuperseded\tcatalog-1.0.0\t2.2        \tInstall complete\n2       \tTue Nov 24 10:00:00 2026\tsuperseded\tcatalog-1.0.0\t2.2        \tUpgrade complete\n3       \tTue Nov 24 10:00:20 2026\tdeployed  \tcatalog-1.0.0\t2.2        \tRollback to 1   " },
    ],
  },
  {
    id: 'kub15-ex-gameday', title: '演練第一輪：node-02 斷電之後', machine: 'kub15-chaos',
    description: '先記下穩態（3 個 Pod、兩個在 node-02、入口回應正常），等到 node-02 斷電並被標為 NotReady，再看 catalog 剩下多少可用的副本、Endpoints 與 node-02 的 taint，以及 Pod 預設對 unreachable 的容忍時間。',
    steps: [
      { command: 'kubectl get pods -n shop -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-tw4rzdmdc8-kb29j   1/1       Running   0          10m       10.244.1.4   node-01   <none>           <none>\ncatalog-tw4rzdmdc8-mtpdl   1/1       Running   0          10m       10.244.2.2   node-02   <none>           <none>\ncatalog-tw4rzdmdc8-x6848   1/1       Running   0          10m       10.244.2.3   node-02   <none>           <none>" },
      { command: CURL, output: "catalog 2.2 served by catalog-tw4rzdmdc8-kb29j" },
      { command: 'sleep 180', output: "" },
      { command: 'kubectl get nodes', output: "NAME      STATUS     ROLES           AGE       VERSION\ncp-01     Ready      control-plane   23d       v1.32.3\nnode-01   Ready      <none>          23d       v1.32.3\nnode-02   NotReady   <none>          23d       v1.32.3" },
      { command: 'kubectl get pods -n shop -o wide', output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncatalog-tw4rzdmdc8-kb29j   1/1       Running   0          13m       10.244.1.4   node-01   <none>           <none>\ncatalog-tw4rzdmdc8-mtpdl   1/1       Running   0          13m       10.244.2.2   node-02   <none>           <none>\ncatalog-tw4rzdmdc8-x6848   1/1       Running   0          13m       10.244.2.3   node-02   <none>           <none>" },
      { command: 'kubectl get deploy catalog -n shop', output: "NAME      READY     UP-TO-DATE   AVAILABLE   AGE\ncatalog   1/3       3            1           13m" },
      { command: 'kubectl get endpoints catalog -n shop', output: "NAME      ENDPOINTS         AGE\ncatalog   10.244.1.4:8080   13m" },
      { command: 'kubectl describe node node-02 | grep -A1 Taints', output: "Taints:             node.kubernetes.io/unreachable:NoSchedule\n                    node.kubernetes.io/unreachable:NoExecute" },
      { command: `${ON_NODE_02} -o jsonpath='{.items[0].spec.tolerations}'`, output: "[{\"effect\":\"NoExecute\",\"key\":\"node.kubernetes.io/not-ready\",\"operator\":\"Exists\",\"tolerationSeconds\":300},{\"effect\":\"NoExecute\",\"key\":\"node.kubernetes.io/unreachable\",\"operator\":\"Exists\",\"tolerationSeconds\":300}]" },
    ],
  },
];

// ---- Terminal exercises: each starts from its stage's machine as declared ------------------------------------------------
const EXERCISES: TerminalExercise[] = [
  {
    id: 'kub15-x-deploy', title: '第一關：用 chart 部署 catalog，從入口連得到', machine: 'kub15-deploy',
    statement: `團隊的 chart 在 \`~/shop/catalog\`（1.0.0，appVersion 2.2）。先把 production 的設定寫成 \`~/shop/values-prod.yaml\`：3 個副本；容器的 requests 是 CPU \`200m\`、記憶體 \`128Mi\`，記憶體上限 \`256Mi\`；開啟 Ingress，主機名稱 \`${HOST}\`。再以這個檔案安裝名為 \`catalog\` 的 release 到命名空間 \`shop\`（目前還不存在），等到所有 Pod 都就緒才結束，最後確認 \`curl http://${HOST}/api/items\` 由 catalog 回答。不要修改 chart。`,
    checks: [
      { kind: 'helm-release', name: 'catalog', namespace: 'shop', status: 'deployed', chart: 'catalog', chartVersion: '1.0.0',
        values: { replicaCount: 3, 'resources.requests.cpu': '200m', 'resources.requests.memory': '128Mi', 'resources.limits.memory': '256Mi', 'ingress.enabled': 'true', 'ingress.host': HOST } },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'shop', replicas: 3, readyReplicas: 3, image: 'shop/catalog:2.2' },
      { kind: 'kube-object', resource: 'Ingress', name: 'catalog', namespace: 'shop', fields: [{ path: '.status.loadBalancer.ingress[0].ip', equals: LB }] },
      { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.2' },
      { kind: 'unchanged', path: '/home/yuki/shop/catalog' },
    ],
    solution: ['helm lint ./catalog', WRITE_PROD, INSTALL, 'kubectl get deploy,ing -n shop', CURL],
    mistakes: [
      { commands: [WRITE_PROD, 'helm install catalog ./catalog -n shop -f values-prod.yaml --wait'], why: 'shop 命名空間還不存在，又沒有 --create-namespace：建立物件時就失敗，release 是 failed' },
      { commands: [WRITE_PROD, 'helm install catalog ./catalog -n shop --create-namespace -f values-prod.yaml', CURL], why: '沒有 --wait：節點還在拉取 shop/catalog:2.2，指令結束時沒有任何就緒的 Pod，入口回 503' },
      { commands: [heredoc('values-prod.yaml', yaml('replicaCount: 3', 'resources:', '  requests:', '    cpu: 200m', '    memory: 128Mi', '  limits:', '    memory: 256Mi')), INSTALL, CURL],
        why: '設定檔沒有開啟 Ingress：chart 預設不建立 Ingress，Pod 都就緒了，從叢集外面卻連不到，ingress-nginx 回 404' },
      { commands: [WRITE_PROD, 'helm install catalog ./catalog --create-namespace -f values-prod.yaml --wait'], why: '沒有 -n shop：release 與所有物件都裝進了 default 命名空間' },
    ],
    hints: [
      `用 \`cat > values-prod.yaml <<'EOF'\` 寫入設定，最後一行單獨打 \`EOF\`；鍵名照 \`catalog/values.yaml\`：\`replicaCount\`、\`resources.requests\`、\`resources.limits\`、\`ingress.enabled\`、\`ingress.host\`。`,
      '`helm install catalog ./catalog -n shop --create-namespace -f values-prod.yaml --wait`：命名空間不存在時要 `--create-namespace`，`--wait` 等到 Pod 就緒。',
      `\`kubectl get deploy,ing -n shop\` 看 READY 與 Ingress 的 ADDRESS；\`/etc/hosts\` 把 ${HOST} 指到入口的位址 ${LB}。`,
    ],
    explanation: `values-prod.yaml 只寫和預設值不同的部分，chart 的 values.yaml 是底。requests 讓排程器知道每個 Pod 要佔多少，也是第二關 HPA 計算使用率的分母；記憶體上限讓失控的 Pod 只會殺掉自己。開啟 Ingress 後，chart 建立 ingressClassName 為 nginx 的 Ingress，ingress-nginx 認領它並寫入位址 ${LB}，/api 底下的請求經由 Service catalog 交給就緒的 Pod。\`--wait\` 等到新的 ReplicaSet 就緒（要先拉 3 秒的 Image，再通過 /healthz 的就緒探針）才回報 deployed；沒有它，安裝「成功」時使用者拿到的是 503。`,
  },
  {
    id: 'kub15-x-scale', title: '第二關：讓 catalog 隨流量擴展，更新時不少任何一個', machine: 'kub15-scale',
    statement: '下午的流量正在上升。修改 `~/shop/values-prod.yaml`，保留原本的設定，再加上：開啟 chart 的 HPA（`autoscaling.enabled`），最少 3 個、最多 10 個副本，CPU 目標使用率 60%；滾動更新的策略是 `RollingUpdate`，`maxSurge` 1、`maxUnavailable` 0。以 `helm upgrade` 套用並等它完成，再讓時間過至少一分鐘，確認 HPA 已經依負載擴展到 5 個以上的副本，入口仍然正常回應。',
    checks: [
      { kind: 'helm-release', name: 'catalog', namespace: 'shop', status: 'deployed', revision: 2,
        values: { 'autoscaling.enabled': 'true', 'autoscaling.minReplicas': 3, 'autoscaling.maxReplicas': 10, 'autoscaling.cpu': 60, 'strategy.rollingUpdate.maxUnavailable': 0, 'resources.requests.cpu': '200m', 'ingress.enabled': 'true' } },
      { kind: 'kube-hpa', name: 'catalog', namespace: 'shop', target: 'Deployment/catalog', minReplicas: 3, maxReplicas: 10, metric: { resource: 'cpu', utilization: 60 }, scaledAtLeast: 5,
        condition: { type: 'ScalingActive', status: 'True' } },
      { kind: 'kube-object', resource: 'Deployment', name: 'catalog', namespace: 'shop', fields: [{ path: '.spec.strategy.rollingUpdate.maxUnavailable', equals: '0' }, { path: '.spec.strategy.rollingUpdate.maxSurge', equals: '1' }] },
      { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.2' },
    ],
    solution: ['cat values-prod.yaml', ADD_SCALE, UPGRADE, 'sleep 60', 'kubectl get hpa catalog -n shop', 'kubectl get deploy catalog -n shop'],
    mistakes: [
      { commands: ['helm upgrade catalog ./catalog -n shop --set autoscaling.enabled=true --wait', 'sleep 60'],
        why: '只用 --set 沒有 -f：這次的使用者值只剩 autoscaling.enabled，requests 與 Ingress 都回到預設值，HPA 因為沒有 CPU requests 而是 <unknown>，入口也消失了' },
      { commands: ['kubectl autoscale deploy/catalog -n shop --min=3 --max=10 --cpu-percent=60', 'sleep 60'],
        why: '在 chart 之外用 kubectl 建立 HPA：release 的值裡沒有它，Deployment 也仍然寫著 replicas: 3，下一次 helm upgrade 會把 HPA 擴出來的副本調回 3；滾動更新的策略也沒有改' },
      { commands: [ADD_SCALE, UPGRADE], why: '套用之後沒有讓時間前進：HPA 才剛建立，還沒依負載擴展（它每 15 秒同步一次，新 Pod 也要兩次刮取才有指標）' },
      { commands: [heredoc('values-prod.yaml', yaml('autoscaling:', '  enabled: true', '  minReplicas: 3', '  maxReplicas: 10', '  cpu: 60'), true), UPGRADE, 'sleep 60'],
        why: '沒有設定滾動更新的策略：仍是預設的 25%／25%，3 個副本時 maxUnavailable 向下取整是 0、maxSurge 向上取整是 1，結果碰巧相同，但副本數一變（例如擴展到 8 個）就允許同時少 2 個；題目要求明確寫出 0' },
    ],
    hints: [
      "`cat >> values-prod.yaml <<'EOF'` 把新的鍵接在檔案後面（`>>` 不會覆蓋原本的內容）。",
      '`autoscaling:` 底下寫 `enabled`、`minReplicas`、`maxReplicas`、`cpu`；`strategy:` 底下寫 `type: RollingUpdate` 與 `rollingUpdate:` 的 `maxSurge`、`maxUnavailable`。',
      '`helm upgrade catalog ./catalog -n shop -f values-prod.yaml --wait`，再 `sleep 60`，用 `kubectl get hpa -n shop` 看 TARGETS 與 REPLICAS。',
    ],
    explanation: '開啟 autoscaling 後，chart 建立 autoscaling/v2 的 HPA，Deployment 的樣板也不再寫 replicas，副本數交給 HPA 管理。每秒 600 個請求、每個請求 1m 的 CPU，3 個 Pod 各用約 201m，是 requests 的 100%；HPA 算出 ⌈3 × 100 ÷ 60⌉ = 5，擴展到 5 個之後每個約 121m（60%），落在 0.1 的容忍範圍內而停住。maxUnavailable 0 與 maxSurge 1 讓滾動更新一次只多建立一個新 Pod，它通過就緒探針之後才移除一個舊的，可用的副本永遠不少於目前的數量。一定要以 `-f values-prod.yaml` 給完整的設定：helm upgrade 只要有 `--set` 或 `-f`，就只用這次給的值。',
  },
  {
    id: 'kub15-x-release', title: '第三關：發布 2.3，失敗就自動退回', machine: 'kub15-release',
    statement: '發版單要把 production 的 catalog 換成 Image tag `2.3`：以 `values-prod.yaml` 為底、加上 `--set image.tag=2.3` 執行 `helm upgrade`。團隊的規定是：發布失敗時要自動退回上一個成功的 revision，等待不超過 30 秒，而且過程中使用者不能看到錯誤。請照規定執行。結束時 release 必須是 deployed，3 個副本都就緒而且跑的是 2.2，入口正常回應；之後再查出 2.3 為什麼失敗。',
    checks: [
      { kind: 'helm-release', name: 'catalog', namespace: 'shop', status: 'deployed', revision: 3, values: { 'autoscaling.enabled': 'true', 'ingress.enabled': 'true' } },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'shop', readyReplicas: 3, availableReplicas: 3, image: 'shop/catalog:2.2' },
      { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.2' },
    ],
    solution: ['helm history catalog -n shop', `${SHIP} --atomic --timeout 30s || true`, 'helm history catalog -n shop', 'kubectl events -n shop --types=Warning', CURL],
    mistakes: [
      { commands: [`${SHIP} --wait --timeout 30s`], why: '只有 --wait：逾時後 revision 2 成為 failed，Deployment 仍然要求不會就緒的 2.3，一直卡在第一個新 Pod' },
      { commands: [SHIP], why: '沒有等待也沒有自動退回：Helm 立刻回報 deployed，Deployment 的範本已經是 2.3，只是靠 maxUnavailable 0 撐著舊的 Pod' },
      { commands: [`${SHIP} --wait --timeout 30s`, 'kubectl rollout undo deploy/catalog -n shop', 'kubectl rollout status deploy/catalog -n shop'],
        why: '用 kubectl 退回 Deployment，Helm 不知道：release 最新的 revision 仍是 failed，紀錄寫著 2.3，下一次 helm upgrade 也以它為基準' },
    ],
    hints: [
      '`--atomic` 讓失敗的升級自動 rollback 到最後一個成功的 revision（它本身就會等待）；`--timeout 30s` 把等待上限設成 30 秒。',
      '`--atomic` 失敗時 helm 的結束碼不是 0；在指令後面加 `|| true` 讓這一步不算失敗，再用 `helm history catalog -n shop` 看結果。',
      '`kubectl events -n shop --types=Warning` 看新 Pod 的 Readiness probe failed：/healthz 回的是什麼狀態碼。',
    ],
    explanation: '`helm upgrade … --set image.tag=2.3 --atomic --timeout 30s` 建立 revision 2，Deployment 以 maxSurge 1 先建立一個 2.3 的 Pod。2.3 的 /healthz 一直回 503（搜尋索引還沒建好），就緒探針不通過，它不會進入 Endpoints；maxUnavailable 0 讓舊的 3 個 Pod 一個也不移除，使用者拿到的始終是 2.2。30 秒後 Helm 判定逾時，把 revision 2 記成 failed，並因為 `--atomic` 以 revision 1 的設定建立 revision 3（Rollback to 1），卡住的新 Pod 被移除。只有 `--wait` 會留下 failed 的 release 與卡住的 Deployment；沒有等待則讓壞的版本被記成 deployed；用 kubectl 退回讓 Helm 的紀錄和叢集不一致。',
  },
  {
    id: 'kub15-x-gameday', title: '第五關：混沌演練，依處理手冊恢復容量', machine: 'kub15-chaos',
    statement: '今天的演練計畫：node-02 在 10:02（UTC，叢集的時鐘）斷電。假設是「少了一個節點，catalog 在 1 分鐘內恢復 3 個可用的副本，入口一直正常回應」。現在 10:00：先記下穩態（每個 Pod 在哪個節點、入口的回應）；等到 node-02 被標為 NotReady（斷電後約 50 秒），看 catalog 剩下幾個可用的副本。如果少於 3 個，依處理手冊：刪除卡在 node-02 上的 catalog Pod（它們的 kubelet 已經無法確認刪除，所以不要等待），讓 ReplicaSet 在其他節點補上，等 Deployment 恢復 3 個可用的副本，最後確認入口正常回應。不要刪除健康節點上的 Pod。',
    checks: [
      { kind: 'kube-object', resource: 'Node', name: 'node-02', fields: [{ path: NODE_READY, equals: 'Unknown' }] },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'shop', readyReplicas: 3, availableReplicas: 3 },
      { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.2' },
    ],
    solution: ['kubectl get pods -n shop -o wide', CURL, 'sleep 180', 'kubectl get nodes', 'kubectl get deploy catalog -n shop', ON_NODE_02, DELETE_STUCK, 'kubectl rollout status deploy/catalog -n shop', 'kubectl get pods -n shop -o wide', CURL],
    mistakes: [
      { commands: ['sleep 130', DELETE_STUCK, 'sleep 60'], why: '斷電 10 秒就動手：node-02 還沒被標為 NotReady、也還沒有 taint，排程器把補上的 Pod 又放回 node-02，它永遠停在 ContainerCreating，可用的副本只有 2 個' },
      { commands: ['sleep 180', 'kubectl cordon node-02'], why: 'cordon 只讓新的 Pod 不再排到 node-02，已經在上面的 Pod 不會移走；catalog 仍然只有 1 個可用的副本' },
      { commands: ['kubectl delete pod -n shop -l app.kubernetes.io/name=catalog --wait=false', 'kubectl rollout status deploy/catalog -n shop', 'sleep 180'],
        why: '斷電之前就把所有 Pod 刪掉重建：新的 Pod 仍然有兩個落在 node-02，斷電之後同樣只剩 1 個可用；手冊的動作要在確認節點失聯之後、只對那個節點上的 Pod 做' },
      { commands: ['sleep 180', 'kubectl get deploy catalog -n shop'], why: '只觀察沒有處理：Pod 預設容忍 unreachable 300 秒，要到 10:07:50 才會被驅逐，這段時間 catalog 只有 1 個可用的副本' },
    ],
    hints: [
      '時鐘只在 `sleep` 時前進：`sleep 180` 到 10:03，node-02 已經是 NotReady。`kubectl get nodes` 與 `kubectl get deploy catalog -n shop` 看狀態。',
      '`kubectl get pods -n shop --field-selector spec.nodeName=node-02` 只列出 node-02 上的 Pod；刪除時用同一個選擇器，加上 `--wait=false`。',
      '`kubectl rollout status deploy/catalog -n shop` 會等到 Deployment 再次完全可用。',
    ],
    explanation: 'node-02 在 10:02 斷電，kubelet 不再回報；50 秒後節點控制器把它標成 NotReady、加上 unreachable 的 taint，上面兩個 catalog Pod 的 Ready 變成 False，離開 Endpoints，入口改由 node-01 上唯一的 Pod 回答。這兩個 Pod 預設容忍 unreachable 300 秒，要到 10:07:50 才會被驅逐，所以假設不成立：catalog 有將近五分鐘只剩 1 個可用的副本。手冊的做法是刪除它們：kubelet 已經無法確認，所以它們停在 Terminating，但 ReplicaSet 不再把正在刪除的 Pod 算進去，立刻建立替代的 Pod；node-02 有 NoSchedule 的 taint，新的 Pod 都排到 node-01。太早動手會讓替代的 Pod 排回還沒被標記的 node-02，cordon 不會移走已經在跑的 Pod，提前重建則不改變分布。這個「每次都要有人手動刪除」的步驟正是第六關要消除的 toil。',
  },
  {
    id: 'kub15-x-automate', title: '第六關：把手動步驟變成設定，再演練一次', machine: 'kub15-chaos',
    statement: '事後檢討的行動項目：「節點失聯時不再需要人手動刪除 Pod」。在 `~/shop/values-prod.yaml` 加上 chart 的 `tolerations`：對 `node.kubernetes.io/unreachable` 與 `node.kubernetes.io/not-ready` 兩個 taint（`operator: Exists`、`effect: NoExecute`）各容忍 30 秒，在 10:02 之前以 `helm upgrade` 套用並等它完成。然後重跑同一場演練：不要刪除任何 Pod，等 node-02 斷電、被標為 NotReady，確認 catalog 自動恢復成 3 個可用的副本，入口正常回應。',
    checks: [
      { kind: 'kube-object', resource: 'Deployment', name: 'catalog', namespace: 'shop', fields: [
        { path: '.spec.template.spec.tolerations[?(@.key=="node.kubernetes.io/unreachable")].tolerationSeconds', equals: '30' },
        { path: '.spec.template.spec.tolerations[?(@.key=="node.kubernetes.io/not-ready")].tolerationSeconds', equals: '30' }] },
      { kind: 'kube-object', resource: 'Node', name: 'node-02', fields: [{ path: NODE_READY, equals: 'Unknown' }] },
      { kind: 'kube-workload', resource: 'Deployment', name: 'catalog', namespace: 'shop', readyReplicas: 3, availableReplicas: 3 },
      { kind: 'http', url: `http://${HOST}/api/items`, status: 200, body: 'catalog 2.2' },
    ],
    solution: [ADD_TOLERATE, UPGRADE, 'sleep 180', 'kubectl get nodes', 'kubectl rollout status deploy/catalog -n shop', 'kubectl get pods -n shop -o wide', CURL],
    mistakes: [
      { commands: [heredoc('values-prod.yaml', yaml('tolerations:', '  - key: node.kubernetes.io/not-ready', '    operator: Exists', '    effect: NoExecute', '    tolerationSeconds: 30'), true), UPGRADE, 'sleep 180', 'kubectl rollout status deploy/catalog -n shop'],
        why: '只寫了 not-ready：斷電的節點加上的是 unreachable 的 taint，Pod 仍然用預設的 300 秒容忍它，要等將近五分鐘才被驅逐' },
      { commands: [ADD_TOLERATE, 'helm upgrade catalog ./catalog -n shop --wait', 'sleep 180'],
        why: 'helm upgrade 沒有 -f：沒有給任何值時沿用上一版的使用者值，檔案裡新加的 tolerations 根本沒有送出去' },
      { commands: [ADD_TOLERATE, UPGRADE, 'sleep 60'], why: '只等到 10:01：node-02 還沒斷電，演練根本還沒開始，看不出設定有沒有用' },
      { commands: ['sleep 180', DELETE_STUCK], why: '又照第五關手動刪除 Pod：服務恢復了，但行動項目要求的設定沒有改，下次節點失聯仍然要有人半夜動手' },
    ],
    hints: [
      "`cat >> values-prod.yaml <<'EOF'` 接上 `tolerations:`，每一項有 `key`、`operator: Exists`、`effect: NoExecute`、`tolerationSeconds: 30`。",
      '`helm upgrade catalog ./catalog -n shop -f values-prod.yaml --wait` 會滾動更新 Pod；之後 `sleep 180` 等到斷電與 NotReady。',
      '`kubectl rollout status deploy/catalog -n shop` 等到被驅逐的 Pod 補齊；`kubectl get pods -n shop -o wide` 看它們在哪個節點。',
    ],
    explanation: '沒有寫 tolerations 時，API server 替每個 Pod 加上對 not-ready 與 unreachable 各 300 秒的 NoExecute 容忍；Pod 自己寫了同樣的 key，就不再加上預設值。改成 30 秒之後，node-02 在 10:02:50 被標為 NotReady，10:03:20 上面的 Pod 就被 taint 管理員驅逐，ReplicaSet 立刻在 node-01 補上，整個過程不需要任何人。兩個 key 都要寫：斷電、網路中斷時節點是 unreachable，kubelet 自己回報不健康時才是 not-ready。30 秒是權衡：太短會讓一次短暫的網路抖動就搬走所有 Pod，太長則讓使用者承受較久的容量不足。這就是把 toil 換成工程：一次修改設定，取代每次事故都要重複的手動步驟。',
  },
];

// ---- devops-explorer exercises (answers are computed by src/lib/devops from the data above, never written here) --------
const DEVOPS_EXERCISES: DevopsExercise[] = [
  {
    id: 'kub15-x-budget', kind: 'table', title: '第四關之一：一次發布用掉多少預算',
    statement: '在「catalog 的 SLO：30 天視窗的頭兩天」中，算出 30 天的錯誤預算、那次沒有就緒探針的發布（第 850–874 分鐘，也就是第 170–174 個時段）的壞請求數、它結束時（第 174 個時段之後）已經用掉的預算比例，以及兩天結束時剩下的預算比例。',
    blanks: [
      { id: 'budget', label: '30 天的錯誤預算（個壞請求）', query: { task: 'slo', slo: 'kub15-slo', metric: 'budget-events' } },
      { id: 'incident', label: '第 170–174 個時段的壞請求（個）', query: { task: 'slo', slo: 'kub15-slo', metric: 'bad-events', from: 170, to: 175 } },
      { id: 'used', label: '第 174 個時段之後用掉的預算（%，一位小數）', query: { task: 'slo', slo: 'kub15-slo', metric: 'consumed-pct', at: 174 } },
      { id: 'left', label: '兩天結束時剩下的預算（%，一位小數）', query: { task: 'slo', slo: 'kub15-slo', metric: 'remaining-pct' } },
    ],
    hints: [
      '預算以整個 30 天視窗預計的請求數計算：探索器開頭的卡片寫出 86,400,000 個請求與 99.9% 的目標。',
      '事故的壞請求可以在每個時段的表格加總第 170–174 個時段；用掉的比例要從視窗開頭累計。',
      '剩下的預算 = 100% − 用掉的比例（一位小數）。',
    ],
    explanation: '預算是 ⌊86,400,000 × 0.1%⌋ = 86,400 個壞請求。那次發布讓三成的請求回 503，25 分鐘就有 15,007 個壞請求；加上之前累計的部分，到它結束時已經用掉 18.3%。兩天結束時共用掉 19.7%，剩下 80.3%。依團隊的錯誤預算政策仍在「照常發布」的區間，但一次 25 分鐘的事故就花掉將近五分之一的月預算，再來兩次就會進入「放慢發布」。',
    mistakes: [
      { answer: { budget: '8640', incident: '15007', used: '18.3', left: '80.3' }, why: '把 0.1% 算成 0.01%，預算少了十倍' },
      { answer: { budget: '86400', incident: '15007', used: '17.4', left: '80.3' }, why: '只算了事故本身的 15,007 個，忘了從視窗開頭累計的壞請求' },
      { answer: { budget: '86400', incident: '15007', used: '18.3', left: '81.7' }, why: '剩下的預算要算到兩天結束，不是事故結束的那一刻' },
    ],
  },
  {
    id: 'kub15-x-burn', kind: 'burn-alert', title: '第四關之二：只在預算真的燒起來時叫醒人',
    statement: '在「catalog 的 SLO」上設計一條會呼叫值班人員的消耗率告警，取代舊的「5 分鐘的錯誤率超過 0.1%」：那次沒有就緒探針的發布要在開始後 5 分鐘內觸發，而且不能有誤報（第 490 分鐘 node-01 更新核心、重新開機的那一個時段不能叫醒人）。填長視窗、短視窗（分鐘）與消耗率門檻。',
    burn: { slo: 'kub15-slo', constraints: { detectWithin: 5, maxFalseAlerts: 0 }, reference: { longMinutes: 60, shortMinutes: 5, factorTenths: 144 } },
    hints: [
      '重新開機的尖峰只有一個 5 分鐘的時段：用較長的長視窗把它攤平。',
      '長視窗太長時，事故的消耗率要累積一陣子才到門檻，偵測就慢了。',
      '從常見的起點開始：長視窗 1 小時、短視窗 5 分鐘、門檻 14.4。',
    ],
    explanation: '1 小時與 5 分鐘、門檻 14.4：事故的第一個時段 1 小時的消耗率已經是 25.6，5 分鐘的是 311.4，告警在第 850 分鐘觸發，延遲 0；事故結束後 5 分鐘的視窗馬上降下來，第 875 分鐘恢復。第 490 分鐘的尖峰 5 分鐘的消耗率有 29.7，但 1 小時只有 2.8，不觸發。舊規則等於只看 5 分鐘、門檻 1，那次重新開機也會叫醒人。6 小時與 30 分鐘、門檻 6 也符合條件（延遲 5 分鐘）；門檻 14.4 配 6 小時則要 15 分鐘才觸發。',
    mistakes: [
      { answer: { long: '5', short: '5', factor: '1' }, why: '這就是舊規則：重新開機那一個時段的消耗率有 29.7，也會呼叫值班的人，誤報一次' },
      { answer: { long: '5', short: '5', factor: '14.4' }, why: '只有一個 5 分鐘的視窗：門檻提高了，那次重新開機仍然超過 14.4，誤報一次' },
      { answer: { long: '360', short: '30', factor: '14.4' }, why: '6 小時的視窗把 25 分鐘的事故攤薄，第 865 分鐘才到 14.4，延遲 15 分鐘；長視窗要搭配較低的門檻' },
      { answer: { long: '1440', short: '60', factor: '1' }, why: '這是開待辦用的緩慢消耗組合：1 天的視窗要累積很久，事故結束前根本沒有觸發' },
    ],
  },
  {
    id: 'kub15-x-trace', kind: 'table', title: '第五關之二：使用者在斷電的那一分鐘看到什麼',
    statement: '打開「混沌演練」的儀表板與「演練期間經過入口的請求」：p95 延遲在第 2 分鐘（10:02）有一個範例追蹤。找出那個追蹤的 trace id（前 8 碼即可）、它的總時間，以及關鍵路徑上花最多時間的服務。',
    blanks: [
      { id: 'trace', label: '第 2 分鐘的範例追蹤（trace id 的前 8 碼）', query: { task: 'trace', traces: 'kub15-traces', metric: 'exemplar', series: 'p95', minute: 2 } },
      { id: 'duration', label: '它的總時間（毫秒）', query: { task: 'trace', traces: 'kub15-traces', metric: 'duration', trace: T_RETRY } },
      { id: 'bottleneck', label: '關鍵路徑上的瓶頸服務', query: { task: 'trace', traces: 'kub15-traces', metric: 'bottleneck', trace: T_RETRY } },
    ],
    hints: [
      '在追蹤探索器的「範例追蹤」列出每個範例的分鐘，按下第 2 分鐘的那一個就會打開它。',
      '瀑布圖裡紅色的 span 是失敗的連線；看它的時間占了整個請求的多少。',
      '瓶頸是關鍵路徑上自己的片段加總最多的服務，不一定是處理請求的那個應用程式。',
    ],
    explanation: '第 2 分鐘的範例是 b72e0d4c…：ingress-nginx 先把請求交給 node-02 上的 Pod（10.244.2.2），連線等了 1,000 ms 逾時（這個團隊的入口設定連線逾時 1 秒、逾時就改試下一個端點），再交給 node-01 上的 Pod，23 ms 就完成，整個請求 1,031 ms。關鍵路徑上 ingress-nginx 自己占了 1,008 ms，是瓶頸，catalog 本身沒有變慢。也就是說，在 node-02 被標為 NotReady 之前的 50 秒裡，大約三分之二的請求不是失敗就是慢了一秒：這是斷電本身的影響，只有更快的偵測（例如節點層級的健康檢查）才能縮短。',
    mistakes: [
      { answer: { trace: '3f1c9a7e', duration: '26', bottleneck: 'catalog' }, why: '那是第 1 分鐘、斷電之前的正常請求；題目問的是第 2 分鐘的範例' },
      { answer: { trace: 'b72e0d4c', duration: '1031', bottleneck: 'catalog' }, why: 'catalog 只花了 23 ms；時間花在入口等待 node-02 上那個 Pod 的連線逾時' },
      { answer: { trace: 'b72e0d4c', duration: '1000', bottleneck: 'ingress-nginx' }, why: '1,000 ms 只是逾時的那一次連線；整個請求還包括改試 node-01 的時間，共 1,031 ms' },
    ],
  },
  {
    id: 'kub15-x-times', kind: 'table', title: '第六關之一：演練的四個時間',
    statement: '打開「混沌演練：10:00–10:30」的事故時間線，依 CICD14 的定義算出這場演練的偵測時間、確認時間、止血時間與恢復時間（分鐘），寫進事後檢討的時間線。',
    blanks: [
      { id: 'ttd', label: '偵測時間（分鐘）', query: { task: 'incident', dashboard: 'kub15-drill-board', incident: 'node-02', metric: 'time-to-detect' } },
      { id: 'tta', label: '確認時間（分鐘）', query: { task: 'incident', dashboard: 'kub15-drill-board', incident: 'node-02', metric: 'time-to-acknowledge' } },
      { id: 'ttm', label: '止血時間（分鐘）', query: { task: 'incident', dashboard: 'kub15-drill-board', incident: 'node-02', metric: 'time-to-mitigate' } },
      { id: 'ttr', label: '恢復時間（分鐘）', query: { task: 'incident', dashboard: 'kub15-drill-board', incident: 'node-02', metric: 'time-to-recover' } },
    ],
    hints: [
      '事件表裡找出「偵測到」、「確認接手」、「止血」三個事件的分鐘；事故開始與結束的分鐘在事故的標題旁。',
      '確認時間從偵測到算起，其他三個從事故開始算起。',
      '恢復時間算到影響結束（事故期間的結束），不是演練結束。',
    ],
    explanation: '影響從第 2 分鐘（10:02 斷電）開始、第 5 分鐘結束。偵測：告警在第 3 分鐘觸發，3 − 2 = 1 分鐘。確認：第 4 分鐘 yuki 接手，4 − 3 = 1 分鐘；交班紀錄沒寫今天有演練，她先花時間確認不是真的停電。止血：第 5 分鐘刪除卡住的 Pod 之後恢復 3 個副本，5 − 2 = 3 分鐘。恢復：5 − 2 = 3 分鐘；第 20 分鐘是演練結束，不算在內。三分鐘裡有兩分鐘花在等人與人工操作上，所以行動項目先處理它們：把容忍時間設成 30 秒，讓止血不必等人。',
    mistakes: [
      { answer: { ttd: '1', tta: '2', ttm: '3', ttr: '3' }, why: '確認時間從事故開始算起；它衡量的是告警響了之後多久有人接手，要從偵測到算起' },
      { answer: { ttd: '1', tta: '1', ttm: '2', ttr: '3' }, why: '止血時間從偵測到算起；本課的止血與恢復時間都從事故開始算起' },
      { answer: { ttd: '1', tta: '1', ttm: '3', ttr: '18' }, why: '把演練結束當成恢復：第 20 分鐘是結束演練，使用者受到的影響在第 5 分鐘就結束了' },
    ],
  },
  {
    id: 'kub15-x-severity', kind: 'choice', title: '第六關之二：這場演練算幾級',
    statement: '團隊的嚴重等級矩陣依「受影響的使用者比例」與「恢復時間」分級。演練期間約 35% 的請求受到影響（失敗或慢了一秒以上），依儀表板上的矩陣，這場演練若是真實事故，屬於哪一級？',
    query: { task: 'incident', dashboard: 'kub15-drill-board', incident: 'node-02', metric: 'severity' },
    options: [
      { value: 'SEV1', label: 'SEV1：超過三分之一的使用者受到影響' },
      { value: 'SEV2', label: 'SEV2：部分使用者，而且持續超過 15 分鐘' },
      { value: 'SEV3', label: 'SEV3：部分使用者，15 分鐘內恢復' },
      { value: 'SEV4', label: 'SEV4：只是演練，不必分級' },
    ],
    hints: ['先找列：35% 落在「部分使用者（10% 以上）」。', '再找欄：恢復時間 3 分鐘落在「15 分鐘以內」。'],
    explanation: '35% 的使用者落在「部分使用者（10% 以上）」那一列，恢復時間 3 分鐘落在「15 分鐘以內」那一欄，交叉是 SEV3。等級決定通知的範圍與事後檢討的深度；演練也照真實事故分級與記錄，團隊才知道真的發生時會是多嚴重。如果沒有第五關的手動處理，容量要到第 7 分鐘多才恢復，仍是 SEV3，但只要再慢一點、或發生在尖峰，就可能升級。',
    mistakes: [
      { answer: { choice: '0' }, why: 'SEV1 要一半以上的使用者，或長時間影響；35% 落在「部分使用者」那一列' },
      { answer: { choice: '3' }, why: '演練也要照真實事故分級：它量的是「真的發生時」的影響，矩陣上 35% 與 3 分鐘是 SEV3' },
    ],
  },
];

const QUIZ: LessonContent['quiz'] = [
  {
    id: 'kub15-q-toil', prompt: '下列哪一項最符合 SRE 所說的 toil？',
    options: ['設計 catalog 的 SLO，並和產品經理談好錯誤預算政策', '把第一次事故的處理步驟整理成處理手冊與自動化腳本', '每次節點失聯，都由值班的人手動刪除卡住的 Pod', '為 chart 加上 tolerations，讓 Pod 自動被驅逐重建'],
    answer: 2,
    explanation: 'toil 是手動、重複、可以自動化、只解決眼前問題，而且會隨服務規模線性增加的工作：每次節點失聯都要有人刪 Pod 正是如此。設計 SLO 與政策、整理手冊與腳本、修改 tolerations 都是一次投入、之後持續有價值的工程工作，其中後兩項正是在消除 toil。',
  },
  {
    id: 'kub15-q-policy', prompt: '團隊的錯誤預算政策寫著「低於 25%：只發修正與可靠度改善」。catalog 這個月只剩 18% 的預算，產品經理想上線新的推薦區塊。比較合理的做法是？',
    options: ['先完成可靠度的行動項目，新功能延到預算回到 25% 以上', '照常上線，因為錯誤預算只是內部的數字', '上線，但先把告警靜音，避免值班的人被吵醒', '把 SLO 從 99.9% 改成 99%，讓剩下的預算變多'],
    answer: 0,
    explanation: '政策事先談好，就是為了在這個時候不必爭論：預算低於 25% 時只發修正與可靠度改善，新功能延後。錯誤預算是團隊對使用者的承諾；為了發布而靜音告警或臨時調低目標，只是把問題藏起來，下一次事故就會直接違反 SLO。',
  },
  {
    id: 'kub15-q-unavailable', prompt: 'catalog 有就緒探針，策略是 `maxSurge: 1`、`maxUnavailable: 0`。把它換成一個 /healthz 永遠回 503 的版本時，使用者會看到什麼？',
    options: ['約三分之一的請求回 503，直到有人手動把版本回滾', '沒有影響：新 Pod 不就緒、不進 Endpoints，舊的都留著', '所有請求失敗，因為 Deployment 先刪掉了舊的 Pod', '短暫的 404，因為 Ingress 在更新期間被重新建立'],
    answer: 1,
    explanation: 'maxUnavailable 0 不允許可用的 Pod 少於目標數，所以 Deployment 先建立一個新 Pod，等它就緒才移除舊的；新 Pod 永遠不就緒，也就不會進入 Endpoints，使用者拿到的全是舊版本。沒有就緒探針時，新 Pod 一啟動就收流量，才會有部分請求失敗；Ingress 不會因為 Deployment 更新而重建。',
  },
  {
    id: 'kub15-q-atomic', prompt: '`helm upgrade … --wait --timeout 30s` 與 `helm upgrade … --atomic --timeout 30s` 在新版本一直不就緒時有什麼差別？',
    options: ['兩者完全相同，--atomic 只是 --wait 較舊的名稱', '--wait 會自動回滾，--atomic 只會把 release 標成 failed', '--atomic 會在 30 秒前提早判斷失敗，--wait 一定等滿', '--wait 只留下 failed，--atomic 還會退回上一個成功的版本'],
    answer: 3,
    explanation: '兩者都等待最多 30 秒；逾時後 `--wait` 只把這個 revision 記成 failed，Deployment 仍然要求壞的版本，`--atomic` 則再以上一個成功的 revision 建立新的 revision（Rollback to N）。它們不是同一個旗標，也不會提早判斷失敗。',
  },
  {
    id: 'kub15-q-pdb', prompt: '有人說：「catalog 有 PodDisruptionBudget（最少 2 個可用），所以節點突然斷電時至少還有 2 個副本。」這句話的問題是？',
    options: ['PodDisruptionBudget 只能用在 StatefulSet，不能用在 Deployment', 'PodDisruptionBudget 只限制自願的中斷（例如 drain），擋不了斷電', 'PodDisruptionBudget 會讓斷電的節點延後 300 秒才被標為 NotReady', 'PodDisruptionBudget 要搭配 HPA 才會生效，單獨使用沒有作用'],
    answer: 1,
    explanation: 'PodDisruptionBudget 經由 eviction API 限制自願的中斷，例如 drain、叢集升級，讓它們不會一次移走太多 Pod；斷電、核心當機是非自願的中斷，它擋不了。要承受節點故障，靠的是把副本分散到多個節點與足夠的副本數。它可以用在 Deployment，也和 HPA、NotReady 的時間無關。',
  },
  {
    id: 'kub15-q-chaos', prompt: '團隊第一次做混沌演練，下列哪一個做法最符合混沌工程的原則？',
    options: ['不先通知任何人，在尖峰時段隨機關掉一個節點，最能看出真實反應', '一次關掉兩個節點，故障越大越能找出所有問題', '演練前先修好所有已知問題，確定系統不會出錯再開始', '先定義穩態與假設，從一個節點開始，並設好停止演練的條件'],
    answer: 3,
    explanation: '混沌演練是有控制的實驗：先用可量測的穩態（例如入口的錯誤率與可用副本數）寫出假設，從最小的影響範圍開始，並在開始前約定停止條件與回復方式。不通知、在尖峰隨機破壞或一次破壞太多，只是製造事故；等系統「確定不會出錯」才演練，就失去了找出未知弱點的目的。',
  },
  {
    id: 'kub15-q-blameless', prompt: '演練的事後檢討寫到「yuki 花了一分鐘才確認接手」。哪一種寫法最符合不究責的事後檢討？',
    options: ['交班紀錄沒有寫今天有演練；行動項目：演練寫進交班清單', 'yuki 反應太慢，下次值班之前要再受一次訓練', '值班的人不夠專心，以後改由資深的工程師負責值班', '這是個人的疏失，不寫進時間線，以免影響她的考核'],
    answer: 0,
    explanation: '不究責的事後檢討問的是「什麼條件讓這件事發生」：交班紀錄少了演練的資訊，所以接手的人要先確認，行動項目是改流程，而且有負責人。把原因歸給個人（反應慢、不專心）會讓大家不再誠實回報；把事件從時間線拿掉，則讓團隊錯過改進的機會。',
  },
  {
    id: 'kub15-q-page', prompt: '關於值班的呼叫（page），下列哪一個做法最好？',
    options: ['只要錯誤率超過 SLO 允許的 0.1% 就立刻呼叫，寧可多叫也不要漏', '每條告警都附上處理手冊，所有告警都用同樣的方式呼叫值班的人', '快速燃燒預算時才呼叫，緩慢燃燒開成待辦，每次呼叫都要能採取行動', 'CPU、記憶體與 Pod 重啟次數各設一條呼叫，症狀出現前就叫醒人'],
    answer: 2,
    explanation: '呼叫會打斷人的睡眠與工作，所以只留給「現在就要有人處理」的情況：依 SLO 的快速燃燒（例如 1 小時／5 分鐘 14.4 倍）呼叫，緩慢燃燒開成待辦。對 0.1% 一超過就叫，會被短暫的尖峰叫醒；所有告警一樣嚴重、或對 CPU 這類原因指標呼叫，都會讓值班的人疲於奔命，最後忽略真正的告警。',
  },
];

export const KUB15: LessonContent = {
  lessonId: 'KUB15',
  motivation: '「catalog 搬上 Kubernetes 三個月了，可是我們真的比較可靠了嗎？」shop 團隊的值班表上，這個月的第一天記著兩件事：早上八點多一台節點更新核心、重新開機，舊的告警規則立刻呼叫了 yuki，她查了十分鐘才確定使用者根本沒有感覺；下午兩點多，有人手動套用了一個沒有就緒探針的測試版，三成的商品頁回 503，二十五分鐘後才有人把它退回。這座島的每一課都只看一件事：Pod 與 Deployment、Service 與 Ingress、設定、儲存、Helm、資源與擴展、滾動更新、監控、追蹤與 SLO。這堂綜合專題把它們接成 SRE（Site Reliability Engineering，網站可靠性工程）的日常：用一份 chart 把 catalog 部署成可擴展、可回滾的服務，讓它隨流量擴展、更新時不少任何一個副本，發布失敗時自動退回；再訂出 SLO 與錯誤預算政策，把呼叫值班的告警改成依預算的消耗率；最後在 production 安排一場混沌演練，讓一個節點斷電，量出使用者看到什麼，寫成不究責的事後檢討，並把演練中的手動步驟（toil）換成設定。六個關卡都要在模擬的叢集上動手，或在 SLO、儀表板與追蹤的探索器中算出結果。',
  sections: [
    {
      id: 'kub15-s-overview', title: 'shop 的 catalog：從部署到事後檢討的六個關卡',
      blocks: [
        { type: 'p', text: '本課沿用整座島的虛構情境：shop 團隊在一個三節點的 kubeadm 叢集上跑線上商店，商品目錄服務 catalog 是其中最忙的一個。你是值班的平台工程師 yuki，在工作站 ops-ws 上有 kubectl、helm 與叢集的管理員 kubeconfig。catalog 原本是手寫的 manifest，由不同的人各自 `kubectl apply`；團隊已經把它寫成一份 Helm chart（`~/shop/catalog`），要用它把 catalog 重新部署到新的命名空間 shop。這堂課要回答的問題是：它是不是一個「可以放心交給值班的人」的服務。叢集、主機名稱、Image 與所有數字都是課程的虛構資料。' },
        { type: 'table', head: ['元件', '角色', '專題開始時'], rows: [
          ['ops-ws（使用者 yuki）', '有 kubectl、helm；`/etc/hosts` 把 shop.example.test 指到入口的位址', '`~/shop/catalog` 是團隊的 chart（1.0.0，appVersion 2.2）'],
          ['cp-01、node-01、node-02', '控制平面與兩個工作節點，各 2 CPU', 'node-01 上有 ingress-nginx 的 controller 與 metrics-server'],
          ['ingress-nginx（LoadBalancer 10.0.0.200）', 'shop.example.test 的入口，IngressClass 是 nginx', '已經安裝，還沒有任何 Ingress'],
          ['shop/catalog:2.2、2.3', '2.2 是目前的版本；2.3 需要一個還沒建好的搜尋索引，它的 /healthz 一直回 503', '兩個都已經推上 Registry'],
        ] },
        { type: 'p', text: '六個關卡依序把 SRE 的工作接起來。每一關的機器就是那個時刻的樣子：前面的關卡已經照課文完成（例如第三關開始時 HPA 已經上線），所以每一關都可以單獨練習。' },
        { type: 'table', head: ['關卡', '要做的事', '交出的成果', '對應的課'], rows: [
          ['1. 部署', '以 chart 與 production 的 values 安裝 catalog，從入口連得到', 'release deployed、3 個就緒的副本、Ingress 有位址', 'KUB07、KUB09、KUB10'],
          ['2. 擴展與存活', '開啟 HPA，滾動更新的 maxUnavailable 設成 0', 'HPA 隨負載擴展到 5 個，更新時可用的副本不減少', 'KUB10、KUB11'],
          ['3. 發布與回滾', '以 --atomic 發布會失敗的 2.3', '使用者沒看到錯誤，release 自動退回 2.2', 'KUB09、KUB11'],
          ['4. 定義可靠度', '算出錯誤預算，設計依消耗率呼叫值班的告警', '預算與政策；及時又沒有誤報的告警', 'KUB14、CICD12'],
          ['5. 混沌演練', '讓 node-02 斷電，驗證假設、依手冊恢復，找出使用者看到什麼', '3 個副本恢復；斷電那一分鐘的追蹤', 'KUB01、KUB13'],
          ['6. 事後檢討', '寫出時間線與分級，把手動步驟換成設定後再演練一次', '四個時間與等級；節點失聯時自動恢復', 'CICD14'],
        ] },
        { type: 'example', id: 'kub15-ex-chart' },
        { type: 'p', text: 'chart 的預設值很保守：2 個副本、沒有 requests、不建立 Ingress 與 HPA。開啟 `autoscaling.enabled` 時，Deployment 的樣板不再寫 `replicas`，因為副本數要交給 HPA 管；每個 Pod 都有檢查 /healthz 的就緒探針。helm template 只在本機算繪，不碰叢集，所以可以先確認 Ingress 交給 `nginx` 這個 IngressClass、後端是 Service catalog 的 http 埠。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: '叢集、Helm、HPA 與節點故障都在模擬的終端機裡依時間播放：時鐘只在 `sleep`、`helm --wait`、`kubectl rollout status` 這類會等待的指令時前進，檢查不會讓時間前進。負載是課程宣告的每秒請求數，metrics-server 每 15 秒刮取一次；節點故障在演練計畫的時間發生，50 秒後被標為 NotReady。SLO、儀表板與追蹤的探索器是示意資料，數字由固定種子的產生器算出，不對應任何真實的服務或監控產品。混沌工程的工具與 PodDisruptionBudget 只在課文說明。' },
      ],
    },
    {
      id: 'kub15-s-deploy', title: '第一關：部署一個「可以服務」的 catalog',
      blocks: [
        { type: 'p', text: '`helm install` 回報 deployed，不等於使用者連得到。一個可以交給值班的部署要同時回答四個問題：要幾個副本、每個 Pod 要佔多少資源、什麼時候可以接流量、外面的人從哪裡進來。chart 把它們都變成 values，production 的差異寫在 `values-prod.yaml`，和 chart 一起放進版本控制。' },
        { type: 'table', head: ['設定', '在 chart 裡', '少了它會怎樣'], rows: [
          ['`replicaCount: 3`', 'Deployment 的 replicas', '只有預設的 2 個；一個節點故障就只剩一半的容量'],
          ['`resources.requests`（CPU 200m、記憶體 128Mi）', '容器的 requests', '排程器不知道 Pod 要佔多少；第二關的 HPA 無法計算使用率（<unknown>）'],
          ['`resources.limits.memory: 256Mi`', '容器的記憶體上限', '記憶體洩漏的 Pod 可能拖垮整個節點，而不是只殺掉自己（OOMKilled）'],
          ['就緒探針（樣板固定）', '`readinessProbe` 檢查 /healthz', 'Pod 一啟動就收流量；還沒準備好的版本直接回錯給使用者'],
          ['`ingress.enabled`、`ingress.host`', 'Ingress（ingressClassName: nginx，/api 前綴）', '叢集外面連不到；只有 ClusterIP 的 Service'],
        ] },
        { type: 'p', text: '安裝時用 `--create-namespace` 建立 shop 命名空間，`--wait` 讓 Helm 等到新的 ReplicaSet 就緒才回報成功：Image 要先拉取，Pod 還要通過就緒探針。沒有 `--wait` 時，指令結束得比 Pod 就緒早，那一刻從入口進來的請求得到 503。安裝之後用 `kubectl get deploy,ing -n shop` 看 READY 與 Ingress 的 ADDRESS，再從工作站 curl 入口：這才是使用者會走的路。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：Helm 說 deployed，服務就上線了', text: 'deployed 只代表 Helm 把物件交給了 API server。沒有 `--wait` 時 Pod 可能還在拉 Image；Ingress 沒有 IngressClass 時沒有任何 controller 認領它，ADDRESS 是空的；Service 的選擇器打錯時沒有端點，入口回 503。部署的驗收要從使用者的角度做：從叢集外面發一個真的請求，看到正確的回應。' },
      ],
    },
    {
      id: 'kub15-s-scale', title: '第二關：擴展與存活：HPA 與 maxUnavailable 0',
      blocks: [
        { type: 'p', text: '下午的流量上來了。catalog 固定 3 個副本，每個 Pod 的 CPU 已經用到 requests 的上限，再多一點流量回應就會變慢。' },
        { type: 'example', id: 'kub15-ex-traffic' },
        { type: 'p', text: '每秒約 600 個請求、每個請求約 1m 的 CPU，平均分給 3 個 Pod 是每個約 201m，正好是 requests（200m）的 100%。HPA 以 ⌈目前副本數 × 目前使用率 ÷ 目標使用率⌉ 計算：目標 60% 時是 ⌈3 × 100 ÷ 60⌉ = 5；擴展到 5 個之後每個 Pod 約 121m（60%），落在 0.1 的容忍範圍內，就停在 5 個。最少 3 個副本是為了容錯：一個節點故障時，剩下的副本還能撐住，直到補上新的。' },
        { type: 'table', head: ['設定', '值', '理由'], rows: [
          ['`autoscaling.minReplicas`', '3', '低峰時也保留跨節點的餘裕；HPA 不會縮到比它少'],
          ['`autoscaling.maxReplicas`', '10', '上限保護叢集與下游的資料庫，不讓一次異常流量吃掉所有節點'],
          ['`autoscaling.cpu`', '60', '留 40% 的餘裕給 HPA 反應前的那幾十秒（同步 15 秒、新 Pod 兩次刮取）'],
          ['`strategy.rollingUpdate.maxSurge`', '1', '更新時一次只多建立一個新 Pod'],
          ['`strategy.rollingUpdate.maxUnavailable`', '0', '新 Pod 就緒之前，一個舊的都不移除：更新期間容量不減少'],
        ] },
        { type: 'p', text: '把這些值接到 `values-prod.yaml` 後面，以 `helm upgrade -f values-prod.yaml --wait` 套用，再讓時間過一分鐘，HPA 就會擴展。這一步有一個陷阱：chart 開啟 autoscaling 後，Deployment 的 manifest 不再有 `replicas`，Helm 的三方合併會把它從線上的物件刪掉，API server 補上預設的 1。在模擬環境裡，HPA 在建立的同一秒就依 minReplicas 調回 3；真實叢集上兩者之間可能有短暫的空檔，Pod 先被縮掉。常見的做法是在低峰時切換，或先以 kubectl 建立同樣設定的 HPA、讓它接手之後再升級 chart。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有 PodDisruptionBudget，節點斷電也有保障', text: 'PodDisruptionBudget（PDB）透過 eviction API 限制「自願的中斷」：drain 節點、叢集升級時，一次不能讓可用的 Pod 少於設定的數量。斷電、核心當機、網路中斷是非自願的中斷，PDB 擋不了。對付節點故障要靠副本數、把副本分散到不同節點（topology spread、反親和性）與第五、六關的驅逐時間；PDB 則確保例行維護不會一次拿走太多副本。兩者是不同的問題。' },
      ],
    },
    {
      id: 'kub15-s-release', title: '第三關：發布與回滾：讓壞版本停在第一個 Pod',
      blocks: [
        { type: 'p', text: '2.3 要上線了，可是它依賴的搜尋索引還沒建好，/healthz 一直回 503。發布流程的目標不是「永遠不會出錯」，而是出錯時傷害最小、恢復最快。先看沒有任何保護時，Helm 與叢集各自做了什麼：' },
        { type: 'example', id: 'kub15-ex-stuck' },
        { type: 'p', text: 'Helm 立刻說 deployed，Deployment 以 maxSurge 1 建立了一個 2.3 的 Pod，它的就緒探針一直失敗（Readiness probe failed: HTTP probe failed with statuscode: 503），所以不會進入 Endpoints；maxUnavailable 0 讓 3 個舊的 Pod 全部留著，入口回答的都是 2.2。使用者沒有受到影響，但發布卡在半路，紀錄卻寫著成功，要有人發現並手動 `helm rollback`。注意 history 的 APP VERSION 欄是 chart 的 appVersion，`--set image.tag` 不會改變它，所以要看 Deployment 的 Image 才知道實際跑的版本。' },
        { type: 'table', head: ['做法', 'Helm 的紀錄', '叢集', '誰要動手'], rows: [
          ['不等待', 'deployed（錯的）', 'Deployment 要求 2.3，卡在第一個 Pod', '有人發現之後手動回滾'],
          ['`--wait --timeout 30s`', '30 秒後 failed', '仍然要求 2.3，卡住', '有人手動 `helm rollback`'],
          ['`--atomic --timeout 30s`', 'failed，再加一個 Rollback to 1', '回到 2.2，卡住的 Pod 被移除', '沒有人；只要事後查原因'],
          ['`--wait` 之後 `kubectl rollout undo`', '仍是 failed', '回到 2.2', 'Helm 的紀錄和叢集不一致，下次 upgrade 以 failed 的版本為基準'],
        ] },
        { type: 'p', text: '`--atomic` 把「等待、判斷失敗、回滾」變成發布指令的一部分：失敗時 helm 以非 0 結束，CI 或發布腳本就知道要停下來。它能這麼安全，是因為第一、二關的就緒探針與 maxUnavailable 0：壞的 Pod 從來沒有收到流量，回滾只是把它移除。少了就緒探針，同一次發布就是上個月那二十五分鐘的 503。' },
        { type: 'callout', tone: 'tip', title: '回滾只恢復 Pod 的範本', text: 'helm rollback 與 kubectl rollout undo 都只把 Kubernetes 物件換回之前的版本；資料庫遷移、外部服務的設定、已經寄出的通知都不會跟著回去（CICD13）。所以會改變資料的發布要先做向後相容的遷移，回滾才真的安全。' },
      ],
    },
    {
      id: 'kub15-s-slo', title: '第四關：SLO、錯誤預算政策與值班',
      blocks: [
        { type: 'p', text: '前三關讓 catalog「應該」很可靠，第四關要量它。catalog 的 SLI 是「經由 shop.example.test 進來、回應碼不是 5xx 而且在 300 ms 內完成的 /api 請求」占全部請求的比例，SLO 是 30 天 99.9%。下面是 30 天視窗的頭兩天（示意資料，每個時段 5 分鐘）：第一天 08:10 node-01 更新核心重新開機，一個時段多了約 300 個錯誤；14:10 有人手動套用了沒有就緒探針的 2.3 測試版，三成的請求回 503，二十五分鐘後才退回。課程的告警是團隊原本的呼叫規則。' },
        { type: 'example', id: 'kub15-slo' },
        { type: 'p', text: '預算以整個 30 天視窗預計的 86,400,000 個請求計算，是 86,400 個壞請求。那二十五分鐘就用掉約 15,000 個，接近五分之一的月預算；如果當時有第三關的就緒探針與 `--atomic`，它幾乎不會花掉任何預算。錯誤預算政策把這些數字變成決定：' },
        { type: 'table', head: ['剩下的預算（30 天視窗）', '發布', '值班與可靠度工作'], rows: [
          ['50% 以上', '照常發布；可以做較大的變更與混沌演練', '依計畫處理待辦的可靠度項目'],
          ['25%–50%', '只發小變更，金絲雀的觀察時間加長，暫停混沌演練', '下一個衝刺優先排入事後檢討的行動項目'],
          ['低於 25%', '只發修正與可靠度改善，每次發布都要有人在場', '每週檢視預算，必要時加開值班支援'],
          ['用完（0% 以下）', '凍結功能發布，直到預算在滾動視窗中恢復', '事後檢討，並由工程主管與產品負責人共同決定例外'],
        ] },
        { type: 'p', text: '政策要在出事之前，由產品、開發與維運一起寫下並簽核，包括例外由誰決定；這張表是 shop 團隊的範例，沒有通用的標準。混沌演練也在政策裡：它本身會消耗一點預算，所以只在預算充裕時進行。' },
        { type: 'p', text: '值班（On-call）是 SRE 最直接的人力成本，告警的品質決定它是否可以長久。好的呼叫有三個條件：使用者正在受影響或預算正快速燃燒、值班的人現在就能做些什麼、它附有處理手冊（runbook）的連結。依 SLO 的多視窗消耗率告警正是為此設計：快速燃燒（例如 1 小時與 5 分鐘都 ≥ 14.4 倍）呼叫值班，緩慢燃燒（例如 3 天與 6 小時 ≥ 1 倍）開成待辦，在上班時間處理。交班時要交代進行中的事故、這週的變更與演練、還沒關閉的告警；每次呼叫之後都問「這個呼叫有用嗎」，沒用的就修改或刪除。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：告警越敏感越安全', text: '舊規則「5 分鐘的錯誤率超過 0.1%」看起來很負責，實際上它在核心更新的那一個時段就把人叫醒，而那約 300 個錯誤只用掉預算的 0.35%。太多沒有行動可做的呼叫會造成告警疲勞：值班的人開始習慣性地忽略，真正的事故反而被晚一步處理。呼叫要對著使用者的症狀與預算的燃燒速度，不是對著每一個波動。' },
      ],
    },
    {
      id: 'kub15-s-chaos', title: '第五關：混沌演練：讓一個節點斷電',
      blocks: [
        { type: 'p', text: '前四關的設計都建立在假設上：「少一個節點，catalog 撐得住」。混沌演練（chaos engineering 的 game day）用一個有控制的實驗驗證它，在真正的故障之前找出弱點。它不是隨意破壞，而是有方法的實驗：' },
        { type: 'table', head: ['原則', 'shop 團隊的演練計畫'], rows: [
          ['定義穩態', '入口 /api 的錯誤率低於 10‰、p95 低於 300 ms、catalog 3 個可用的副本'],
          ['寫出假設', '「node-02 斷電，catalog 在 1 分鐘內恢復 3 個可用的副本，入口一直正常回應」'],
          ['模擬真實的事件', '節點斷電（kubelet 停止回報），不是刪除 Pod 這種溫和的版本'],
          ['控制影響範圍', '在低峰（10:00 UTC）只動一個節點；事先通知客服與值班；預算在 50% 以上才進行'],
          ['設好停止條件', '錯誤率超過 50‰ 持續 2 分鐘，或任何人喊停，就恢復節點、結束演練'],
          ['記錄並改進', '量出實際的影響，寫成事後檢討，行動項目完成後再演練一次'],
        ] },
        { type: 'p', text: '演練在 production 進行，因為只有真實的流量、真實的節點分布才會暴露真實的問題；第一次也可以先在預備環境做。下面是第一輪：先記下穩態，再等到斷電。' },
        { type: 'example', id: 'kub15-ex-gameday' },
        { type: 'p', text: '斷電後 50 秒，節點控制器把 node-02 標為 NotReady 並加上 unreachable 的 taint，上面兩個 catalog Pod 的 Ready 變成 False、離開 Endpoints。`kubectl get pods` 仍顯示它們 1/1 Running，因為 kubelet 已經無法回報容器的狀態；要看 Deployment 的 AVAILABLE 與 Endpoints 才知道真相。假設不成立有兩個原因：3 個副本裡有 2 個在同一個節點上，以及 Pod 預設容忍 unreachable 300 秒，要等將近五分鐘才會被驅逐、在別處重建。處理手冊的做法是刪除卡住的 Pod，讓 ReplicaSet 立刻補上。' },
        { type: 'p', text: '終端機看到的是叢集的狀態；使用者看到什麼，要看入口的監控。下面是演練當天的儀表板與經過入口的追蹤（示意資料，第 0 分鐘是 10:00 UTC）：p95 在第 2 分鐘衝到兩秒，第 3、4 分鐘只剩一個 Pod 時維持在 600 ms 左右；打開每一分鐘的範例追蹤，看時間花在哪裡。' },
        { type: 'example', id: 'kub15-drill-board' },
        { type: 'example', id: 'kub15-traces' },
        { type: 'callout', tone: 'note', title: '斷電那一分鐘的請求', text: '在 node-02 被標為 NotReady 之前，Endpoints 仍然列出它上面的 Pod，入口照樣把請求交給它們。這個團隊的入口設定連線逾時 1 秒、逾時就改試下一個端點，所以這 50 秒裡大部分請求慢了一秒，運氣不好連試兩個失聯的 Pod 的就失敗了。這段影響由偵測節點失聯的速度決定，調整 Pod 的設定縮短不了；第六關的行動項目處理的是之後那幾分鐘的容量不足。' },
      ],
    },
    {
      id: 'kub15-s-postmortem', title: '第六關：事後檢討：從時間線到消除 toil',
      blocks: [
        { type: 'p', text: '演練結束之後，團隊照 CICD14 的範本寫不究責的事後檢討（blameless postmortem）。不究責不是不負責：它假設每個人在當下都依手上的資訊做了合理的決定，所以問的是「什麼條件讓事情這樣發展」，而不是「誰做錯了」；這樣大家才會誠實地寫下自己做了什麼，團隊才找得到系統的問題。' },
        { type: 'table', head: ['段落', 'catalog 演練的內容'], rows: [
          ['摘要與影響', 'node-02 斷電，約 35% 的請求失敗或慢了一秒以上，持續 3 分鐘；SEV3（若是真實事故）'],
          ['時間線', '10:02 斷電、10:03 告警、10:04 接手、10:05 手動刪除卡住的 Pod 後恢復；附上指令與儀表板的連結'],
          ['促成因素', '3 個副本裡有 2 個在 node-02；Pod 預設容忍 unreachable 300 秒；交班紀錄沒寫今天有演練'],
          ['做得好的', '節點被標為 NotReady 時，上面的 Pod 自動離開 Endpoints；入口改試下一個端點，大部分請求只是變慢'],
          ['運氣好的', '演練在低峰進行；若在下午的尖峰，只剩一個 Pod 時錯誤率會高得多'],
          ['行動項目', '每一項有負責人與期限，依「預防、縮短偵測、縮短恢復」分類（見下表）'],
        ] },
        { type: 'p', text: '行動項目最容易犯的錯，是寫成「大家要更小心」。好的行動項目會改變系統，讓同樣的條件不再造成同樣的結果，並且可以驗證：' },
        { type: 'table', head: ['行動項目', '類型', '負責人與期限', '怎麼驗證'], rows: [
          ['catalog 對 unreachable、not-ready 只容忍 30 秒', '縮短恢復；消除手動刪除 Pod 的 toil', 'yuki，本週', '再演練一次，不碰任何 Pod，看 Deployment 自動恢復'],
          ['以 topology spread 把副本平均分到各節點', '預防', '平台組，兩週內', '`kubectl get pods -o wide` 看每個節點最多一個副本'],
          ['演練與變更寫進交班清單', '縮短確認時間', '值班輪值的負責人，下次交班', '下一次演練的確認時間'],
          ['處理手冊加上「節點失聯」的判斷與指令', '縮短恢復', 'yuki，本週', '另一位值班的人照手冊走一次'],
        ] },
        { type: 'p', text: '第一個行動項目是典型的 toil 消除。Toil 是手動、重複、可以自動化、只處理眼前、沒有長期價值，而且會隨服務規模線性增加的工作：每一次節點失聯都要有人刪 Pod，節點越多就越常發生。工程工作則是一次投入、之後持續有價值的改變。SRE 團隊常見的做法是限制 toil 占工作時間的比例（例如不超過一半），把省下的時間投入自動化，讓服務成長時值班的負擔不跟著成長。' },
        { type: 'table', head: ['', 'Toil', '工程工作'], rows: [
          ['例子', '手動刪除卡住的 Pod、手動加副本、半夜手動回滾', '設定 tolerations、HPA、`--atomic`、依 SLO 的告警'],
          ['做完之後', '下次同樣的事還要再做一次', '同樣的事不再需要人'],
          ['隨服務成長', '線性增加', '大致不變'],
          ['值不值得自動化', '每週發生、每次十分鐘：一年近九小時', '寫一次、測一次、之後持續生效'],
        ] },
        { type: 'p', text: '寫好檢討後，把第一個行動項目做完並重跑演練：這就是第六關的練習。同一個節點在同一個時間斷電，Pod 在 NotReady 之後 30 秒被驅逐，ReplicaSet 在 node-01 補上，整個過程不需要任何人。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：容忍時間設成 0 最快', text: '把 tolerationSeconds 設成 0，節點一被標為 NotReady，上面的 Pod 就立刻被驅逐。聽起來最快，但一次短暫的網路抖動、控制平面的一次延遲，都會讓整個節點的 Pod 被搬走、重新拉取與暖機，甚至在節點恢復後造成另一波搬移。容忍時間是在「容量不足的時間」與「誤判的代價」之間的取捨，應該依演練量到的數字決定，再用下一次演練驗證。' },
      ],
    },
    {
      id: 'kub15-s-recap', title: '整條路：每一關守住什麼',
      blocks: [
        { type: 'p', text: '把六個關卡接起來，就是 SRE 維運一個服務的循環：先讓它可以被安全地部署與變更，再量它、為它訂目標，最後用演練與事後檢討找出下一個要改進的地方。每一關都是一個有紀錄、可以驗證的設定，而不是某個人記得要做的事：' },
        { type: 'table', head: ['關卡', '守住的事', '靠的設定或紀錄'], rows: [
          ['部署', '使用者連得到、資源可預期', 'chart 與 values-prod.yaml、requests 與 limits、就緒探針、Ingress'],
          ['擴展與存活', '流量變化時容量跟著變，更新時容量不減少', 'HPA（3–10，CPU 60%）、maxSurge 1、maxUnavailable 0'],
          ['發布與回滾', '壞版本不碰到使用者，失敗時自動退回', '`--atomic --timeout`、helm history'],
          ['定義可靠度', '可靠度是可以討論的數字，呼叫只在值得時發生', 'SLO 與錯誤預算、政策、多視窗消耗率告警'],
          ['混沌演練', '假設被驗證，而不是被相信', '穩態、假設、停止條件、儀表板與追蹤'],
          ['事後檢討', '弱點變成行動項目，toil 變成設定', '不究責的檢討、可驗證的行動項目、再演練'],
        ] },
        { type: 'callout', tone: 'tip', title: '可靠度是持續的工作', text: '這次演練修好了驅逐的時間，下一次可能發現的是資料庫的連線數、DNS 的快取或入口的逾時設定。保持固定的節奏：每次事故都寫檢討、每季至少一次演練、每月看一次錯誤預算與 toil 的比例，服務就會一點一點地變得更可靠，值班也會一點一點地變得更輕鬆。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  visualization: {
    kind: 'challenge-stages', title: 'shop 的 catalog：SRE 實務的六個關卡',
    stages: [
      { title: '部署可以服務的 catalog', concepts: ['KUB07', 'KUB09', 'KUB10'], goal: '以 chart 與 values-prod.yaml 安裝 catalog：3 個副本、requests 與記憶體上限、就緒探針、shop.example.test 的 Ingress，從入口連得到。', detail: 'values 的優先順序；--create-namespace 與 --wait；IngressClass nginx 與 ADDRESS；從叢集外面 curl 驗收，而不是只看 deployed。' },
      { title: '擴展與存活', concepts: ['KUB10', 'KUB11'], goal: '開啟 HPA（3–10，CPU 60%），滾動更新 maxSurge 1、maxUnavailable 0，讓 catalog 隨流量擴展到 5 個。', detail: '⌈3 × 100 ÷ 60⌉ = 5；HPA 接手後 Deployment 不寫 replicas；-f 加 --set 才保留設定；PDB 只管自願的中斷。' },
      { title: '發布與回滾', concepts: ['KUB09', 'KUB11'], goal: '以 --atomic --timeout 30s 發布 /healthz 回 503 的 2.3，使用者沒看到錯誤，release 自動退回 2.2。', detail: '就緒探針讓壞 Pod 不進 Endpoints；--wait 只留下 failed；kubectl rollout undo 讓 Helm 的紀錄不一致；回滾只恢復範本。' },
      { title: '定義可靠度', concepts: ['KUB14', 'CICD12'], goal: '算出 30 天的錯誤預算與一次事故用掉的比例，設計及時又沒有誤報的消耗率呼叫。', detail: '86,400 個壞請求；錯誤預算政策的四個區間；1 小時／5 分鐘 14.4 倍；好的呼叫要能採取行動、附處理手冊；交班。' },
      { title: '混沌演練', concepts: ['KUB01', 'KUB13'], goal: '讓 node-02 斷電，驗證「1 分鐘內恢復」的假設，依手冊刪除卡住的 Pod，並從追蹤看出使用者在那一分鐘的遭遇。', detail: '穩態、假設、影響範圍與停止條件；NotReady 50 秒、unreachable 300 秒；Terminating 的 Pod 不再計入；入口改試下一個端點。' },
      { title: '事後檢討與消除 toil', concepts: ['CICD14'], goal: '算出四個時間與等級，寫出不究責的檢討，把手動刪除 Pod 換成 30 秒的容忍時間後再演練一次。', detail: '時間線、促成因素、做得好與運氣好的、可驗證的行動項目；toil 與工程工作；兩個 key 都要寫；容忍時間的取捨。' },
    ],
  },
  quiz: QUIZ,
  terminal: { machines: [DEPLOY_WS, SCALE_WS, RELEASE_WS, CHAOS_WS], examples: EXAMPLES, exercises: EXERCISES },
  devops: {
    slos: [{ id: 'kub15-slo', title: 'catalog 的 SLO：30 天視窗的頭兩天',
      description: '示意資料：每 5 分鐘一個時段，共 576 個（兩天），SLO 是 30 天 99.9%，預算以整個視窗預計的 86,400,000 個請求計算。第 490 分鐘 node-01 重新開機，第 850–874 分鐘一個沒有就緒探針的版本讓三成請求回 503。課程的告警是團隊原本的呼叫規則。', slo: slo() }],
    dashboards: [{ id: 'kub15-drill-board', title: '混沌演練：10:00–10:30（UTC）',
      description: '示意資料：第 0 分鐘是 10:00（UTC），node-02 在第 2 分鐘斷電。錯誤率、p95 延遲、每分鐘請求與可用的 catalog 副本；底色是使用者受影響的期間，規則是演練當天的呼叫規則，事故時間線列出團隊記下的事件與嚴重等級矩陣。', dashboard: drillBoard() }],
    traces: [{ id: 'kub15-traces', title: '演練期間經過入口的請求',
      description: '示意資料：三個經過 ingress-nginx 的 GET /api/items，分別是儀表板 p95 在第 1、2、3 分鐘的範例追蹤（斷電前、斷電的那一分鐘、只剩一個 Pod 的時候）。span 的屬性寫出處理請求的 Pod 在哪個節點。', traces: drillTraces(), links: { dashboard: 'kub15-drill-board' } }],
    exercises: DEVOPS_EXERCISES,
  },
};
