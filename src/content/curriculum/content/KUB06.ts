/*
 * KUB06 ConfigMaps and Secrets (KUB-2, terminal-sim; the blueprint's cluster-sim activity as terminal content). A terminal
 * lesson on the kube-config profile (engine stages E32–E36): the made-up tix ticketing team's workstation tix-ws (user mei)
 * with kubectl and the admin kubeconfig of the fictional three-node cluster (cp-01, node-01, node-02). ticket-api starts
 * with APP_MODE, LOG_LEVEL and its database password hard-coded in the Deployment; the Secret api-db was applied with
 * stringData last week (so its last-applied-configuration annotation holds the plain text). Covered: why configuration and
 * secrets leave the image (twelve-factor config, one image for every environment, CICD08's secrets), kubectl create
 * configmap from literals, files, a folder and an env file, and as YAML; env valueFrom, envFrom with a prefix, configMap
 * volumes (defaultMode, the atomic writer's ..data, items) and subPath; a missing source (FailedMount,
 * CreateContainerConfigError) during a rolling update; what a change reaches (a mounted volume after the 60 s sync; env and
 * subPath never) and kubectl rollout restart; Secret types, base64 as encoding (jsonpath + base64 -d, echo vs echo -n),
 * stringData and its annotation trap; the limits of Secrets (RBAC, pod creation and exec, etcd encryption at rest and
 * external secret managers as prose); imagePullSecrets for a private registry (docker-registry Secret, never declared on
 * the nodes so the pull really fails); immutable. Every secret and token value is an obviously fake lesson value. Pod and
 * ReplicaSet names are hashes and the atomic writer's folder carries a timestamp: commands read them, never hard-code them.
 * Hosts, users, images, the registry and the cluster are made up. Every transcript output was produced by replaying it on
 * the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'mei', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'mei', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const TOOLS = ['ls', 'cat', 'echo', 'env', 'printenv', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'];
// The tix team's services: each keeps running, logs one line and handles SIGTERM in a second.
const service = (name: string, port: number, log: string, more: Partial<TerminalImage> = {}): TerminalImage => ({
  name, size: 42_000_000, created: '2026-11-20 09:00:00', cmd: ['./server'], workdir: '/app', expose: [port], service: true, layers: 4, osRelease: DEBIAN, commands: TOOLS,
  logs: [log], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } }, ...more,
});
const REGISTRY = 'registry.example.com:5000';
const BILLING = `${REGISTRY}/tix/billing:1.4`;
const IMAGES: TerminalImage[] = [
  // ticket-api refuses to start without its database password.
  service('tix/api:2.0', 8080, 'ticket-api 2.0 listening on :8080', { needsEnv: ['DB_PASSWORD'], missingEnv: { output: 'Error: DB_PASSWORD is not set', exit: 1 } }),
  service('tix/seatmap:1.3', 8090, 'seat-map 1.3 listening on :8090'),
  service('tix/report:1.0', 9000, 'report 1.0 waiting for jobs'),
  service(BILLING, 8070, 'billing 1.4 listening on :8070'),
];
const WORKERS = ['node-01', 'node-02'];
const REGISTRIES = [{ host: REGISTRY, users: [{ name: 'tix-ci', token: 'lesson-fake-registry-token-1' }] }];

const deployment = (name: string, image: string, replicas: number, container: string[], spec: string[] = []) => yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:',
  `  replicas: ${replicas}`, '  selector:', '    matchLabels:', `      app: ${name}`, '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`,
  `        image: ${image}`, ...container.map(x => `        ${x}`), ...spec.map(x => `      ${x}`));
const envValue = (name: string, value: string) => [`- name: ${name}`, `  value: ${value}`];

// ticket-api before this lesson: everything hard-coded, the database password too.
const API_V1_YAML = deployment('ticket-api', 'tix/api:2.0', 2, ['env:', ...envValue('APP_MODE', 'staging'), ...envValue('LOG_LEVEL', 'info'), ...envValue('DB_PASSWORD', 'lesson-demo-db-pass')]);
// The database credentials were applied with stringData by a teammate last week.
const API_DB_YAML = yaml('apiVersion: v1', 'kind: Secret', 'metadata:', '  name: api-db', 'type: Opaque', 'stringData:', '  username: tix_app', '  password: lesson-demo-db-pass');
const API_CONFIG_YAML = yaml('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: api-config', 'data:', '  APP_MODE: staging', '  LOG_LEVEL: info');
// ticket-api after: settings from ConfigMaps (envFrom, a prefix, a volume with defaultMode and a subPath file), the password from the Secret.
const API_YAML = deployment('ticket-api', 'tix/api:2.0', 2, ['envFrom:', '- configMapRef:', '    name: api-config', '- prefix: FLAG_', '  configMapRef:', '    name: api-flags',
  'env:', '- name: DB_PASSWORD', '  valueFrom:', '    secretKeyRef:', '      name: api-db', '      key: password', 'volumeMounts:', '- name: files', '  mountPath: /etc/tix', '- name: files', '  mountPath: /app/banner.txt',
  '  subPath: banner.txt'], ['volumes:', '- name: files', '  configMap:', '    name: api-files', '    defaultMode: 0440']);
const SETTINGS = yaml('queue: enabled', 'max_seats_per_order: 4', 'hold_minutes: 10');
const BANNER = 'Welcome to tix (staging)\n';
const STAGING_ENV = yaml('# ticket-api on staging', 'APP_MODE=staging', 'LOG_LEVEL=info', 'CACHE_TTL=30');
const BILLING_YAML = deployment('billing', BILLING, 1, ['ports:', '- containerPort: 8070'], ['imagePullSecrets:', '- name: regcred']);
const LIMITS_YAML = yaml('apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: sale-limits', 'immutable: true', 'data:', '  MAX_SEATS: "4"');

// The services' images are on the workers already, report's takes 3 s to pull; billing's (private) is on no node, so its pull really asks the registry.
const kubeOf = (manifests: TerminalKube['manifests']): TerminalKube => ({
  images: [{ name: 'tix/api:2.0', nodes: WORKERS }, { name: 'tix/seatmap:1.3', nodes: WORKERS }, { name: 'tix/report:1.0', seconds: 3 }],
  manifests,
});
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'mei', host: 'tix-ws', cwd: '/home/mei', profile: 'kube-config', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/mei'), dir('/home/mei/tix'), ...files],
  docker: { images: IMAGES, registries: REGISTRIES },
  kube,
});
const API_DB_AT_BOOT = { text: API_DB_YAML, at: '2026-11-17 14:00:00', file: 'api-db.yaml' };

const WS = workstation('kub06-ws', 'tix-ws（tix 團隊的工作站：ticket-api 的設定還寫死在 Deployment 裡）', [
  file('/home/mei/tix/api-v1.yaml', API_V1_YAML), file('/home/mei/tix/api.yaml', API_YAML), file('/home/mei/tix/api-config.yaml', API_CONFIG_YAML),
  dir('/home/mei/tix/config'), file('/home/mei/tix/config/settings.yaml', SETTINGS), file('/home/mei/tix/config/banner.txt', BANNER),
  file('/home/mei/tix/staging.env', STAGING_ENV), file('/home/mei/tix/billing.yaml', BILLING_YAML), file('/home/mei/tix/limits.yaml', LIMITS_YAML),
], kubeOf([API_DB_AT_BOOT, { text: API_V1_YAML, at: '2026-11-24 09:30:00', file: 'api-v1.yaml' }]));

// Exercise 1: seat-map with its settings hard-coded; the on-call sheet's production values are in ~/tix/prod.env.
const SEATMAP_V1_YAML = deployment('seat-map', 'tix/seatmap:1.3', 2, ['env:', ...envValue('APP_MODE', 'staging'), ...envValue('LOG_LEVEL', 'debug'), ...envValue('CACHE_TTL', '"30"')]);
const SEATMAP_YAML = deployment('seat-map', 'tix/seatmap:1.3', 2, ['envFrom:', '- configMapRef:', '    name: seatmap-config']);
const PROD_ENV = yaml('# seat-map on production (approved 2026-11-23)', 'APP_MODE=production', 'LOG_LEVEL=warn', 'CACHE_TTL=300');
const MOVE = workstation('kub06-move', 'tix-ws（seat-map 的設定還寫死在 Deployment 裡）', [file('/home/mei/tix/seatmap.yaml', SEATMAP_V1_YAML), file('/home/mei/tix/prod.env', PROD_ENV)],
  kubeOf([{ text: SEATMAP_V1_YAML, at: '2026-11-24 09:20:00', file: 'seatmap.yaml' }]));

// Exercise 2: a teammate changed ~/tix/api-config.yaml to LOG_LEVEL=debug but has not applied it; the pods run with info.
const API_ENV_YAML = deployment('ticket-api', 'tix/api:2.0', 3, ['envFrom:', '- configMapRef:', '    name: api-config', 'env:', '- name: DB_PASSWORD', '  valueFrom:', '    secretKeyRef:', '      name: api-db', '      key: password']);
const API_CONFIG_DEBUG_YAML = API_CONFIG_YAML.replace('LOG_LEVEL: info', 'LOG_LEVEL: debug');
const RESTART = workstation('kub06-restart', 'tix-ws（api-config.yaml 改成了 debug，還沒有套用）', [file('/home/mei/tix/api.yaml', API_ENV_YAML), file('/home/mei/tix/api-config.yaml', API_CONFIG_DEBUG_YAML)],
  kubeOf([API_DB_AT_BOOT, { text: API_CONFIG_YAML, at: '2026-11-24 09:00:00', file: 'api-config.yaml' }, { text: API_ENV_YAML, at: '2026-11-24 09:10:00', file: 'api.yaml' }]));

// Exercise 3: the platform team left report's API token in ~/inbox (mode 600); ~/tix is the Git working tree.
const REPORT_TOKEN = 'lesson-demo-report-token-41';
const REPORT_POD_YAML = yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: report', 'spec:', '  containers:', '  - name: report', '    image: tix/report:1.0', '    volumeMounts:', '    - name: cred', '      mountPath: /etc/report',
  '      readOnly: true', '  volumes:', '  - name: cred', '    secret:', '      secretName: report-cred', '      defaultMode: 0400');
const REPORT_SECRET_YAML = yaml('apiVersion: v1', 'kind: Secret', 'metadata:', '  name: report-cred', 'stringData:', `  api-token: ${REPORT_TOKEN}`);
const REPORT = workstation('kub06-report', 'tix-ws（平台組交來 report 的 API Token）', [dir('/home/mei/inbox', 'mei', 0o700), file('/home/mei/inbox/report-token', REPORT_TOKEN, 'mei', 0o600)], kubeOf([]));

// Exercise 4: an old reporting job's database Secret, written with data: (base64) long ago; the variants hold other values.
// Base64 of the values (Secret data is base64): host db-legacy.tix.internal; users report_ro, report_rw, batch_ro.
const HOST_B64 = 'ZGItbGVnYWN5LnRpeC5pbnRlcm5hbA==';
const legacyYaml = (user: string, password: string) => yaml('apiVersion: v1', 'kind: Secret', 'metadata:', '  name: legacy-db', 'type: Opaque', 'data:', `  host: ${HOST_B64}`, `  password: ${password}`, `  user: ${user}`);
const legacyKube = (user: string, password: string): TerminalKube => ({ ...kubeOf([{ text: legacyYaml(user, password), at: '2026-03-02 11:00:00', file: 'legacy-db.yaml' }]), created: '2026-01-12 08:00:00' });
const LEGACY = workstation('kub06-legacy', 'tix-ws（舊報表工作的資料庫 Secret）', [], legacyKube('cmVwb3J0X3Jv', 'bGVzc29uLWxlZ2FjeS1wYXNzLTIwMjY=') /* report_ro, lesson-legacy-pass-2026 */);

const SEATMAP_POD = "$(kubectl get pods -l app=seat-map -o jsonpath='{.items[0].metadata.name}')";
const API_POD = "$(kubectl get pods -l app=ticket-api -o jsonpath='{.items[0].metadata.name}')";
const EXERCISES: NonNullable<LessonContent['terminal']>['exercises'] = [
  {
    id: 'kub06-ex-envfrom', title: '把 seat-map 寫死的設定搬進 ConfigMap', machine: 'kub06-move',
    statement: 'seat-map 的 Deployment（`~/tix/seatmap.yaml`）把 APP_MODE、LOG_LEVEL、CACHE_TTL 直接寫在 `env` 裡，而且還是 staging 的值。值班表核定的正式環境設定在 `~/tix/prod.env`。請完成：(1) 用這個檔案建立名為 `seatmap-config` 的 ConfigMap，每一行是一個鍵；(2) 修改 `~/tix/seatmap.yaml`，拿掉寫死的 `env`，改用 `envFrom` 讀取 `seatmap-config`（其他內容不變）；(3) 套用並等到新的 Pod 都在執行、拿到正式環境的值。',
    checks: [
      { kind: 'kube-config', resource: 'ConfigMap', name: 'seatmap-config', values: [{ key: 'APP_MODE', equals: 'production' }, { key: 'LOG_LEVEL', equals: 'warn' }, { key: 'CACHE_TTL', equals: '300' }] },
      { kind: 'kube-object', resource: 'Deployment', name: 'seat-map', fields: [{ path: '.spec.template.spec.containers[0].envFrom[0].configMapRef.name', equals: 'seatmap-config' }] },
      { kind: 'kube-pod', selector: 'app=seat-map', count: 2, status: 'Running', ready: true, env: ['APP_MODE', 'production'] },
      { kind: 'kube-pod', selector: 'app=seat-map', count: 2, env: ['LOG_LEVEL', 'warn'] },
      { kind: 'kube-pod', selector: 'app=seat-map', count: 2, env: ['CACHE_TTL', '300'] },
    ],
    solution: ['cat tix/prod.env', 'kubectl create configmap seatmap-config --from-env-file=tix/prod.env', heredoc('tix/seatmap.yaml', SEATMAP_YAML), 'kubectl apply -f tix/seatmap.yaml', 'kubectl rollout status deploy/seat-map', 'sleep 3',
      `kubectl exec ${SEATMAP_POD} -- printenv APP_MODE LOG_LEVEL CACHE_TTL`],
    mistakes: [
      { commands: ['kubectl create configmap seatmap-config --from-file=tix/prod.env', heredoc('tix/seatmap.yaml', SEATMAP_YAML), 'kubectl apply -f tix/seatmap.yaml', 'kubectl rollout status deploy/seat-map', 'sleep 3'],
        why: '--from-file 把整個檔案放進一個名為 prod.env 的鍵，ConfigMap 裡沒有 APP_MODE、LOG_LEVEL、CACHE_TTL 三個鍵' },
      { commands: ['kubectl create configmap seatmap-config --from-env-file=tix/prod.env', heredoc('tix/seatmap.yaml', `${SEATMAP_YAML}        env:\n        - name: APP_MODE\n          value: staging\n`),
        'kubectl apply -f tix/seatmap.yaml', 'kubectl rollout status deploy/seat-map', 'sleep 3'], why: '加了 envFrom 卻漏刪寫死的 APP_MODE：同名的變數以 env 為準，Pod 的 APP_MODE 仍然是 staging' },
      { commands: ['kubectl create configmap seatmap-config --from-env-file=tix/prod.env', 'sleep 60'], why: '只建立了 ConfigMap，Deployment 沒有引用它；環境變數也不會因為等待而改變' },
      { commands: ['kubectl create configmap seatmap-config --from-env-file=tix/prod.env', heredoc('tix/seatmap.yaml', SEATMAP_YAML), 'kubectl apply -f tix/seatmap.yaml'], why: '套用之後沒有等待：新的 Pod 還在建立，舊的 Pod 仍在執行' },
    ],
    hints: [
      '`--from-env-file` 把 `KEY=VALUE` 的每一行變成一個鍵（`#` 開頭的註解略過）；`--from-file` 則是整個檔案一個鍵。',
      '容器底下寫 `envFrom:`、`- configMapRef:`、`name: seatmap-config`，並刪掉整段 `env:`。可以用 `cat > tix/seatmap.yaml <<\'EOF\'` 重寫整個檔案，最後一行單獨打 `EOF`。',
      '`kubectl apply -f tix/seatmap.yaml` 之後用 `kubectl rollout status deploy/seat-map` 等新的 Pod，再用 `kubectl exec 名稱 -- printenv APP_MODE` 確認。',
    ],
    explanation: '`kubectl create configmap seatmap-config --from-env-file=tix/prod.env` 把每一行 `KEY=VALUE` 變成一個鍵，ConfigMap 的值一律是字串（`CACHE_TTL` 是 `"300"`）。Deployment 的容器改成 `envFrom: [{configMapRef: {name: seatmap-config}}]`，kubelet 建立容器時把每個鍵變成一個環境變數。修改 Pod 範本會產生新的 ReplicaSet，`kubectl rollout status` 等新 Pod 就緒，舊 Pod 優雅終止後只剩兩個帶著正式環境值的 Pod。留著寫死的 `env` 時，同名的變數以 `env` 為準，搬家等於沒搬；`--from-file` 只會產生一個叫 prod.env 的鍵；只建 ConfigMap 不改 Deployment，或改了不等待，Pod 都還是舊的值。',
  },
  {
    id: 'kub06-ex-restart', title: '讓 ticket-api 拿到新的 LOG_LEVEL', machine: 'kub06-restart',
    statement: '為了追查一個偶發的錯誤，同事已經把 `~/tix/api-config.yaml` 的 LOG_LEVEL 改成 `debug`，但還沒有套用。ticket-api（3 個副本）用 `envFrom` 讀取 ConfigMap `api-config`。請把這個改動套用到叢集，並讓 ticket-api 的每一個 Pod 都以 `LOG_LEVEL=debug` 執行，最後等到 3 個副本都就緒。不要修改 `~/tix` 裡的檔案。',
    checks: [
      { kind: 'kube-config', resource: 'ConfigMap', name: 'api-config', values: [{ key: 'LOG_LEVEL', equals: 'debug' }, { key: 'APP_MODE', equals: 'staging' }] },
      { kind: 'kube-pod', selector: 'app=ticket-api', count: 3, status: 'Running', ready: true, env: ['LOG_LEVEL', 'debug'] },
      { kind: 'kube-workload', resource: 'Deployment', name: 'ticket-api', replicas: 3, readyReplicas: 3 },
    ],
    solution: ['kubectl apply -f tix/api-config.yaml', `kubectl exec ${API_POD} -- printenv LOG_LEVEL`, 'kubectl rollout restart deploy/ticket-api', 'kubectl rollout status deploy/ticket-api', 'sleep 3',
      `kubectl exec ${API_POD} -- printenv LOG_LEVEL`],
    mistakes: [
      { commands: ['kubectl apply -f tix/api-config.yaml', 'sleep 60'], why: 'ConfigMap 改了，但環境變數只在容器建立時解析，等多久執行中的 Pod 都還是 info' },
      { commands: ['kubectl rollout restart deploy/ticket-api', 'kubectl rollout status deploy/ticket-api', 'kubectl apply -f tix/api-config.yaml', 'sleep 3'], why: '順序反了：重新啟動時 ConfigMap 還是 info，新的 Pod 讀到的仍是舊值，之後才套用的改動不會進入它們' },
      { commands: ['kubectl apply -f tix/api-config.yaml', `kubectl delete pod ${API_POD}`, 'sleep 5'], why: '只刪掉一個 Pod：補上的新 Pod 是 debug，另外兩個仍然是 info' },
      { commands: ['kubectl apply -f tix/api-config.yaml', 'kubectl rollout restart deploy/ticket-api'], why: '重新啟動之後沒有等待：新的 Pod 還在建立，舊的 Pod 仍以 info 執行' },
    ],
    hints: [
      '`kubectl apply -f tix/api-config.yaml` 更新 ConfigMap；之後比較 `kubectl get cm api-config -o jsonpath=\'{.data.LOG_LEVEL}\'` 與 Pod 裡 `printenv LOG_LEVEL` 的結果。',
      '環境變數只在容器建立時解析一次，要讓每個 Pod 都換成新的容器，而且是在 ConfigMap 更新之後。',
      '`kubectl rollout restart deploy/ticket-api` 依滾動更新換掉所有 Pod，`kubectl rollout status deploy/ticket-api` 等它完成。',
    ],
    explanation: '`kubectl apply -f tix/api-config.yaml` 把 ConfigMap 改成 debug，但 kubelet 只在建立容器的那一刻解析 `envFrom` 與 `valueFrom`，執行中的容器的環境變數永遠不變（掛載成 Volume 的檔案才會在約一分鐘後更新）。`kubectl rollout restart` 在 Pod 範本加上 `kubectl.kubernetes.io/restartedAt` 註解，範本改變就產生新的 ReplicaSet，逐一建立新 Pod、終止舊 Pod，新容器建立時讀到 debug；`kubectl rollout status` 等 3 個新副本就緒。先重新啟動再套用 ConfigMap，新 Pod 讀到的還是 info；只刪一個 Pod 只換掉那一個；不等待則檢查時舊 Pod 還在。',
  },
  {
    id: 'kub06-ex-secret', title: '把 report 的 Token 掛成唯讀檔案，manifest 裡不留明文', machine: 'kub06-report',
    statement: '平台組把 report 服務的 API Token 放在 `~/inbox/report-token`（權限 600）。`~/tix` 是要推進 Git 的資料夾。請完成：(1) 建立名為 `report-cred` 的 Opaque Secret，鍵是 `api-token`，值就是這個檔案的內容；(2) 在 `~/tix/report.yaml` 寫一個名為 `report` 的 Pod（容器名稱 `report`、Image `tix/report:1.0`），把這個 Secret 掛在 `/etc/report`，檔案權限 `0400`；(3) 套用並等到 Pod 在執行。Token 的值不能出現在 `~/tix/report.yaml` 裡。',
    checks: [
      { kind: 'kube-config', resource: 'Secret', name: 'report-cred', type: 'Opaque', values: [{ key: 'api-token', equals: REPORT_TOKEN }], notPlainIn: { file: '/home/mei/tix/report.yaml' } },
      { kind: 'kube-pod', name: 'report', status: 'Running', ready: true, file: { path: '/etc/report/api-token', content: REPORT_TOKEN } },
      { kind: 'kube-object', resource: 'Pod', name: 'report', fields: [{ path: '.spec.volumes[0].secret.defaultMode', equals: '256' }] },
    ],
    solution: ['ls -l inbox', 'kubectl create secret generic report-cred --from-file=api-token=inbox/report-token', heredoc('tix/report.yaml', REPORT_POD_YAML), 'kubectl apply -f tix/report.yaml', 'sleep 5',
      'kubectl exec report -- ls -l /etc/report/..data/'],
    mistakes: [
      { commands: ['kubectl create secret generic report-cred --from-file=inbox/report-token', heredoc('tix/report.yaml', REPORT_POD_YAML), 'kubectl apply -f tix/report.yaml', 'sleep 5'],
        why: '沒有指定鍵名，--from-file 用檔名 report-token 當鍵，Secret 裡沒有 api-token，容器裡也沒有 /etc/report/api-token' },
      { commands: [heredoc('tix/report.yaml', `${REPORT_SECRET_YAML}---\n${REPORT_POD_YAML}`), 'kubectl apply -f tix/report.yaml', 'sleep 5'], why: '把 Secret 用 stringData 寫進同一份 manifest：Token 以明文留在要推進 Git 的 tix/report.yaml 裡' },
      { commands: ['kubectl create secret generic report-cred --from-file=api-token=inbox/report-token', heredoc('tix/report.yaml', REPORT_POD_YAML.replace('defaultMode: 0400', 'defaultMode: 400')), 'kubectl apply -f tix/report.yaml', 'sleep 5'],
        why: '少了前導的 0，YAML 把 400 讀成十進位，也就是八進位的 0620，不是 0400' },
      { commands: ['kubectl create secret generic report-cred --from-file=api-token=inbox/report-token', heredoc('tix/report.yaml', REPORT_POD_YAML), 'kubectl apply -f tix/report.yaml'], why: '套用之後沒有等待：節點還在拉取 tix/report:1.0，Pod 還沒有執行' },
    ],
    hints: [
      '`kubectl create secret generic report-cred --from-file=api-token=inbox/report-token`：`鍵=路徑` 指定鍵名，值是檔案的內容，不會經過任何 manifest 檔。',
      'Pod 的 `spec.volumes` 寫 `secret: {secretName: report-cred, defaultMode: 0400}`，容器的 `volumeMounts` 把它掛在 `/etc/report`。',
      '`kubectl apply -f tix/report.yaml` 之後 `sleep 5` 等 Image 拉完，再用 `kubectl exec report -- ls -l /etc/report/..data/` 看權限。',
    ],
    explanation: '`--from-file=api-token=inbox/report-token` 直接從平台組給的檔案建立 Secret，值只存在 API server 與原本的檔案，tix 裡的任何 manifest 都不含它。Pod 的 `secret` Volume 把每個鍵變成一個檔案，`defaultMode: 0400` 讓檔案只有擁有者（root）能讀；在 kube-config 的 manifest 裡 `0400` 依 YAML 1.1 是八進位，存到 API 是十進位的 256，寫成 `400` 則是十進位 400（八進位 0620）。Image 要拉取 3 秒，所以要等 Pod 進入 Running 才能看到 `/etc/report/api-token`。把 Secret 寫成 stringData 和 Pod 放在一起雖然方便，Token 卻以明文進了 Git；不指定鍵名時鍵會變成檔名 report-token。',
  },
  {
    id: 'kub06-ex-decode', title: '讀出舊報表工作實際拿到的資料庫密碼', machine: 'kub06-legacy',
    statement: '舊的報表工作一直登入資料庫失敗，DBA 想確認叢集交給它的密碼是什麼。請印出 Secret `legacy-db` 裡 `password` 解碼之後的值：最後一個指令只印出密碼本身，不要有其他文字。請從叢集讀取並解碼，不要寫死：同一串指令會在另外兩個叢集上重播，那裡的密碼不同。',
    checks: [{ kind: 'output', fromCommand: 'base64 (-d|--decode)' }],
    solution: ['kubectl describe secret legacy-db', "kubectl get secret legacy-db -o jsonpath='{.data.password}'", "kubectl get secret legacy-db -o jsonpath='{.data.password}' | base64 -d"],
    mistakes: [
      { commands: ["kubectl get secret legacy-db -o jsonpath='{.data.password}'"], why: '印出的是 base64 編碼後的文字，不是密碼本身' },
      { commands: ['kubectl describe secret legacy-db'], why: 'describe 只印出每個鍵的位元組數，不印值' },
      { commands: ["kubectl get secret legacy-db -o jsonpath='{.data.user}' | base64 -d"], why: '解碼的是 user 這個鍵，不是 password' },
      { commands: ['echo lesson-legacy-pass-2026'], why: '直接打出答案，沒有從叢集讀取；換一個叢集答案就不同' },
    ],
    variants: [
      { label: '密碼已經換過的叢集', files: [], kube: legacyKube('cmVwb3J0X3J3', 'ZmFrZS1sZWdhY3ktcGFzcy1iNw==') },
      { label: '批次工作的叢集', files: [], kube: legacyKube('YmF0Y2hfcm8=', 'ZGVtby1sZWdhY3ktcGFzcy1jOQ==') },
    ],
    hints: [
      '`kubectl describe secret legacy-db` 只告訴你有哪些鍵與它們的長度。',
      '`kubectl get secret legacy-db -o jsonpath=\'{.data.password}\'` 印出 base64 編碼的值。',
      '把它用管線接到 `base64 -d` 解碼：`… | base64 -d`。',
    ],
    explanation: 'Secret 的 `data` 是 base64 編碼（API 的 `[]byte` 以 base64 寫成 JSON 與 YAML），不是加密。`-o jsonpath=\'{.data.password}\'` 取出那一個鍵，`base64 -d` 還原成原本的文字。在這個叢集答案是 lesson-legacy-pass-2026，另外兩個叢集分別是 fake-legacy-pass-b7 與 demo-legacy-pass-c9。`describe secret` 刻意不印值；只用 jsonpath 得到的是編碼過的字串。這也說明了為什麼「能讀 Secret」的權限等同於「知道密碼」：任何能執行這兩個指令的人都看得到明文。',
  },
];

export const KUB06: LessonContent = {
  lessonId: 'KUB06',
  motivation: 'tix 團隊的售票服務 ticket-api 已經在叢集上跑了一陣子，它的 Deployment 裡寫著 `APP_MODE: staging`、`LOG_LEVEL: info`，還有一行資料庫密碼。要上正式環境時，問題一個接一個冒出來：正式環境要另外一份 manifest，還是另外建一個 Image？只是想把日誌調成 debug，也要改 manifest、重新部署？那行密碼又被多少人看過——每個能讀 Deployment 的同事、每一份 Git 歷史、每一次 `kubectl get -o yaml`。CICD08 把 Token 從儲存庫搬進 CI 的 secret，這一課在 Kubernetes 裡做同一件事：一般設定放進 ConfigMap，機密放進 Secret，同一個 Image 在每個環境讀不同的值。你會在 tix 的工作站 tix-ws 上用四種方式建立 ConfigMap，以環境變數與掛載檔案交給 Pod，親眼看到改了設定之後哪些地方會更新、哪些永遠不會；接著拆穿「Secret 是加密的」這個誤會——它預設只是 base64 編碼，一個管線就能還原——並了解 Secret 真正的保護從哪裡來、私有 Registry 的登入怎麼交給 kubelet。學完之後，你能在 Kubernetes 裡安全地管理設定與機密，也知道它的限制在哪裡。',
  sections: [
    {
      id: 'kub06-s-why', title: '為什麼設定與機密要離開 Image',
      blocks: [
        { type: 'p', text: 'The Twelve-Factor App 的第三條「設定」說：把設定存在環境裡，而不是程式碼裡。這裡的設定指的是每個部署之間會不同的東西：資料庫的位址與帳密、外部服務的 Token、功能開關、日誌等級。程式碼在每個環境都一樣，設定則不同。判斷方法很簡單：如果現在把整個專案公開，會不會洩漏任何機密？會的話，設定就還沒有和程式分開。' },
        { type: 'p', text: '對容器來說，這條原則有一個更具體的理由：一個 Image 跑在每一個環境。CI 建置一次 Image、測試它，然後把同一個 Image（同一個 digest）依序推到 staging 與 production，這樣上線的就是測過的那一個。如果把設定烤進 Image，每個環境都要各自建置，正式環境跑的就不是測試過的東西；改一個日誌等級要重新建置與部署；更糟的是，烤進 Image 的密碼會留在它的層裡，任何能拉取 Image 的人都讀得到（DKR 島看過 `docker history` 與層的內容）。這和 CICD08 的教訓一致：機密不放在程式碼與建置產物裡，而是在執行時由平台交給程式。' },
        { type: 'table', head: ['內容', '例子', '放在哪裡'], rows: [
          ['程式與相依套件', '編譯好的程式、函式庫、預設設定檔', 'Image（每個環境都一樣）'],
          ['不敏感、會因環境而不同的設定', '`APP_MODE`、`LOG_LEVEL`、功能開關、settings.yaml', 'ConfigMap'],
          ['機密', '資料庫密碼、API Token、TLS 私鑰、Registry 帳密', 'Secret（或外部機密管理服務，再同步成 Secret）'],
          ['寫死在 Deployment 的 `env: value:`', '真的不會因環境而變的少數值', '只適合不敏感、不會變的值；機密絕對不行'],
        ] },
        { type: 'p', text: '把密碼寫在 Deployment 的 `env` 裡為什麼不行？下一節的範例一開始就示範：ticket-api 的密碼在 manifest 檔裡，`kubectl exec … -- printenv` 看得到（這在任何作法下都一樣），而 `kubectl get deploy -o jsonpath` 也直接印出它。Deployment 是許多人都能讀的物件：Kubernetes 內建的 `view` 角色可以讀 Deployment，卻刻意不包含 Secret。把密碼放進 Secret，才能用權限把「能看設定的人」和「能看機密的人」分開。' },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'ConfigMap、Secret、Pod 的 `env`、`envFrom`、configMap 與 secret Volume、`imagePullSecrets` 與私有 Registry 都依 Kubernetes v1.32 的規則模擬。為了讓答案可以重複驗證：掛載的檔案固定在 ConfigMap 最後一次改變的 60 秒後更新（真實的延遲依 kubelet 的同步週期與快取，從幾秒到一兩分鐘）；缺少來源時的重試間隔是固定的；掛載的檔案在模擬環境裡寫得進去（真實的是唯讀）。etcd 的靜態加密、RBAC、外部機密管理服務只在課文說明。團隊、主機、Registry 與叢集都是虛構的，每個密碼與 Token 都含有 lesson、fake 或 demo，不是任何真實服務的格式。' },
      ],
    },
    {
      id: 'kub06-s-create', title: '建立 ConfigMap：literal、檔案、env 檔與 YAML',
      blocks: [
        { type: 'p', text: 'ConfigMap 是 `v1` 的 API 物件，核心是 `data`：一組「鍵 → 字串」。鍵只能用英數字、`-`、`_`、`.`；值一律是字串，所以 YAML 裡的數字要加引號（`CACHE_TTL: "30"`），否則 API server 拒絕。一個 ConfigMap 最多 1 MiB，放的是設定，不是資料；二進位內容另有 `binaryData`（這裡只在課文提到）。建立的方式有四種：' },
        { type: 'table', head: ['寫法', '產生的鍵', '適合'], rows: [
          ['`kubectl create configmap 名稱 --from-literal=KEY=VALUE`', '每個參數一個鍵', '少量的值、快速試驗'],
          ['`--from-file=路徑`', '檔名當鍵、檔案內容當值；路徑是資料夾時，裡面每個一般檔案一個鍵', '整份設定檔（settings.yaml、nginx.conf）'],
          ['`--from-file=鍵=路徑`', '自己指定鍵名', '程式要的檔名和手上的檔名不同時'],
          ['`--from-env-file=路徑`', '每一行 `KEY=VALUE` 一個鍵，`#` 註解與空行略過', '現成的 .env 檔；不能和前兩種同時用'],
          ['YAML manifest，再 `kubectl apply -f`', '`data` 裡寫的鍵', '放進版本控制的正式作法'],
        ] },
        { type: 'p', text: '範例先看 ticket-api 現在的樣子：設定與密碼都寫死在 Deployment 裡。接著用每一種方式建立 ConfigMap，比較產生的鍵。' },
        { type: 'example', id: 'kub06-create' },
        { type: 'p', text: '幾個細節：`--from-file=tix/config/` 把資料夾裡的 banner.txt、settings.yaml 各變成一個鍵，`--from-file=motd=…` 則把同一個檔案改名為 motd；`--from-env-file` 略過註解行，產生三個鍵，`-o yaml` 裡的 `CACHE_TTL: "30"` 有引號，因為值是字串。`describe cm` 會印出所有的值——ConfigMap 沒有任何保密的設計，所以機密不能放在這裡。每個命名空間都有一個 `kube-root-ca.crt`，那是控制平面自動發布的叢集 CA 憑證，讓 Pod 驗證 API server 用的，不要刪除它。' },
        { type: 'p', text: '`kubectl create` 是命令式的：名稱已經存在就失敗（already exists）。要讓「從檔案產生的 ConfigMap」也能放進版本控制或重複套用，加上 `--dry-run=client -o yaml`：它只在本機產生 YAML、不送到叢集，可以存成檔案，也可以直接接到 `kubectl apply -f -`，下一節更新設定時就會用到這個組合。' },
      ],
    },
    {
      id: 'kub06-s-consume', title: '在 Pod 裡使用：環境變數與掛載檔案',
      blocks: [
        { type: 'p', text: 'ConfigMap 與 Secret 本身什麼都不做，要在 Pod 的範本裡引用，kubelet 才會在建立容器時把值交給程式。交付的形式有兩種：環境變數，適合簡短的值；檔案，適合整份設定檔、憑證，以及需要在執行中更新的內容。' },
        { type: 'table', head: ['寫法', '例子', '結果'], rows: [
          ['`env[].valueFrom.configMapKeyRef`', '`name: api-config`、`key: LOG_LEVEL`', '一個變數，名稱可以自己取'],
          ['`env[].valueFrom.secretKeyRef`', '`name: api-db`、`key: password`', '一個變數，值是 Secret 解碼後的文字'],
          ['`envFrom[].configMapRef`／`secretRef`', '`name: api-config`', '每個鍵一個變數；不是合法變數名稱的鍵會被略過，並記一則 InvalidEnvironmentVariableNames 事件'],
          ['`envFrom[].prefix`', '`prefix: FLAG_`', '這個來源的每個變數都加上前綴，避免和其他來源撞名'],
          ['`volumes[].configMap`／`secret` 加上 `volumeMounts`', '`mountPath: /etc/tix`', '每個鍵是掛載點底下的一個檔案'],
          ['`items`', '`key: settings.yaml`、`path: app/settings.yaml`', '只放列出的鍵，可以改檔名或放進子資料夾'],
          ['`defaultMode`、`items[].mode`', '`defaultMode: 0440`', '檔案權限（預設 0644）'],
          ['`subPath`', '`mountPath: /app/banner.txt`、`subPath: banner.txt`', '只把一個檔案放在指定的路徑，不蓋掉整個資料夾'],
        ] },
        { type: 'p', text: '變數的組成順序是：先依序展開每個 `envFrom`，再處理 `env`；同一個名稱出現兩次時，後面的值為準，所以 `env` 裡寫死的值會蓋掉 `envFrom` 帶進來的同名變數——第一題練習的陷阱就是這個。引用的 ConfigMap、Secret 或鍵不存在時，Pod 不會啟動：Volume 的來源不存在，Pod 停在 ContainerCreating，事件是 FailedMount；環境變數的來源不存在，容器停在 CreateContainerConfigError。kubelet 會持續重試，來源一建立就啟動。真的可以沒有的來源，在引用處加上 `optional: true`。' },
        { type: 'example', id: 'kub06-consume' },
        { type: 'p', text: '先套用 api.yaml 時只有 api-config 存在。Deployment 的滾動更新先建立一個新 Pod，舊的兩個繼續服務：新 Pod 先卡在掛載（api-files 不存在，kubelet 在拉取 Image 之前先掛載 Volume），建立 api-files 之後換成 CreateContainerConfigError（api-flags 不存在），兩個都補上後才完成換版。缺設定的新版本不會把服務整個打掛，這是滾動更新加上「啟動前先解析設定」的好處。' },
        { type: 'p', text: '在 Pod 裡看到的結果：`env` 先列出 api-config 的鍵，再是加了前綴的 `FLAG_MAX_SEATS`、`FLAG_QUEUE`，然後是從 Secret 來的 `DB_PASSWORD`（還有 Kubernetes 自動加上的 `KUBERNETES_*`）；沒有前綴的 `QUEUE` 不存在，`printenv` 結束碼是 1。`/etc/tix` 底下的檔案其實是連結：kubelet 把內容寫進一個帶時間戳記的資料夾，`..data` 指向它，每個鍵是連到 `..data/鍵` 的連結。更新時 kubelet 寫好新的資料夾再一次切換 `..data`，程式永遠不會讀到寫了一半的檔案。檔案權限 `-r--r-----` 來自 `defaultMode: 0440`；`describe pod` 列出變數的來源，但不印出 Secret 的值。' },
        { type: 'callout', tone: 'warning', title: '「把設定檔掛進 /app 就好」', text: 'Volume 掛在一個資料夾上，會整個蓋住 Image 在那個路徑原本的內容。把 ConfigMap 直接掛在 `/app`，程式本身也跟著「消失」，容器啟動就失敗。要把單一檔案放進已經有其他檔案的資料夾，用 `subPath`（像範例的 `/app/banner.txt`），或者讓程式從一個專用的資料夾（例如 `/etc/tix`）讀取設定。另外，`defaultMode` 在 YAML 裡要寫成 `0440` 這種有前導 0 的八進位；寫成 `440` 會被當成十進位，得到完全不同的權限。`-o json` 裡看到的 `288` 就是八進位 0440 的十進位寫法。' },
      ],
    },
    {
      id: 'kub06-s-update', title: '更新設定：什麼會跟著變，什麼不會',
      blocks: [
        { type: 'p', text: '改了 ConfigMap 之後，正在執行的 Pod 會不會拿到新值？答案取決於它是怎麼被使用的。這是 ConfigMap 最常見的誤會：很多人改了 ConfigMap、apply 成功，就以為服務已經換上新設定。' },
        { type: 'table', head: ['使用方式', '改了 ConfigMap 或 Secret 之後', '怎麼讓程式用到新值'], rows: [
          ['掛載的 Volume（沒有 subPath）', 'kubelet 週期性同步，過一段時間換成新內容（模擬環境固定是最後一次改變的 60 秒後）', '程式要自己重新讀檔（監看檔案或定期讀取）；只在啟動時讀一次的程式仍用舊值'],
          ['`subPath` 掛載的檔案', '永遠不變', '建立新的容器'],
          ['環境變數（`env`、`envFrom`）', '永遠不變：只在建立容器時解析一次', '建立新的容器，例如 `kubectl rollout restart`'],
        ] },
        { type: 'example', id: 'kub06-update' },
        { type: 'p', text: '範例裡，用 `kubectl create configmap … --dry-run=client -o yaml | kubectl apply -f -` 從改好的資料夾更新 api-files；kubectl 警告這個物件沒有 last-applied-configuration 註解（它當初是用 `create` 建立的），並自動補上，之後就能正常 apply。30 秒時掛載的 banner.txt 還是舊的，60 秒後換成新內容，時間戳記資料夾也換了一個，所以指令裡永遠不要寫死那個資料夾的名稱。同一個 Pod 裡，subPath 的 `/app/banner.txt` 和環境變數 `LOG_LEVEL` 都沒有變。' },
        { type: 'p', text: '`kubectl rollout restart deploy/ticket-api` 在 Pod 範本加上 `kubectl.kubernetes.io/restartedAt` 註解：範本改變，Deployment 就建立新的 ReplicaSet，依 KUB04 看過的方式逐一換掉 Pod，新容器建立時讀到新的 LOG_LEVEL 與 banner。另一種常見的作法是讓設定的名稱帶版本（`api-config-v2`），改設定等於建立新的 ConfigMap 並修改 Deployment 的引用，範本一變就自動滾動更新，想退回也只要改回舊名稱；有些部署工具會自動在名稱後面加上內容的雜湊，做的就是這件事。' },
        { type: 'callout', tone: 'tip', title: '改了設定，記得確認服務真的用上了', text: '`configmap/api-config configured` 只代表 API server 存下了新值。要確認服務用上了，看服務本身：`kubectl exec 名稱 -- printenv LOG_LEVEL`、`kubectl exec 名稱 -- cat /etc/tix/settings.yaml`，或服務的日誌。用環境變數的設定，改完要安排 `kubectl rollout restart`；用掛載檔案的設定，要確認程式會重新讀檔。' },
      ],
    },
    {
      id: 'kub06-s-secret', title: 'Secret：類型、base64 與 stringData',
      blocks: [
        { type: 'p', text: 'Secret 的用法和 ConfigMap 幾乎一樣（`secretKeyRef`、`secretRef`、`secret` Volume），差別在 Kubernetes 對它多做的事：`describe` 不印值；只會送到有 Pod 用到它的節點；kubelet 把 secret Volume 放在記憶體（tmpfs）裡，不寫進節點的磁碟；權限可以和其他物件分開控管。它的 `data` 是 base64 編碼的，因為這個欄位在 API 裡是位元組，可以放二進位內容（例如憑證）；為了方便手寫，還有只寫的 `stringData`：寫進去的明文由 API server 編碼後合併進 `data`，讀回來時不會再看到 `stringData`。' },
        { type: 'table', head: ['type', '用途', '必要的鍵', '建立方式'], rows: [
          ['`Opaque`（預設）', '任意的鍵值', '無', '`kubectl create secret generic 名稱 --from-literal=…`／`--from-file=…`'],
          ['`kubernetes.io/tls`', 'TLS 憑證與私鑰，例如給 Ingress', '`tls.crt`、`tls.key`', '`kubectl create secret tls 名稱 --cert=檔案 --key=檔案`'],
          ['`kubernetes.io/dockerconfigjson`', '私有 Registry 的登入資料，給 `imagePullSecrets`', '`.dockerconfigjson`', '`kubectl create secret docker-registry 名稱 --docker-server=… --docker-username=… --docker-password=…`'],
        ] },
        { type: 'p', text: '還有 `kubernetes.io/basic-auth`、`kubernetes.io/ssh-auth` 與服務帳號的 token 等類型，它們規定了必要的鍵，方便工具辨認用途。type 建立後就不能修改。下面的範例讀出上週建立的 api-db，再建立一個新的 Secret。' },
        { type: 'example', id: 'kub06-secret' },
        { type: 'p', text: '`describe secret` 只印出 `password:  19 bytes`，看起來很安全；可是 `-o jsonpath=\'{.data.password}\'` 拿到 base64 的文字，接上 `base64 -d` 就是明文。base64 是編碼，不是加密：沒有金鑰、任何人都能還原，它只是讓位元組能放進 JSON 與 YAML。自己編碼時要注意 `echo` 會在最後加上換行：`echo lesson-demo | base64` 結尾的 `K` 就是那個換行，把這個結果貼進 `data`，密碼就多了一個看不見的換行，程式登入失敗卻很難查。要用 `echo -n`（或 `printf`），更好的作法是讓 `kubectl create secret` 自己編碼。' },
        { type: 'p', text: '最後一步是一個真實的陷阱：api-db 是用 `stringData` 的 manifest 以 `kubectl apply` 建立的，而 apply 會把整份 manifest 的原文存進 `kubectl.kubernetes.io/last-applied-configuration` 註解，於是明文密碼就留在註解裡，任何能讀這個 Secret 的人用 `-o yaml` 都看得到，連 base64 都不用解。用 `kubectl create secret` 從檔案建立就沒有這個註解；如果一定要用 manifest 管理 Secret，請交給外部機密管理或加密後才提交的工具（下一節）。另外，`--from-literal=password=…` 會把值留在 Shell 的歷史紀錄裡，從權限受控的檔案以 `--from-file` 建立比較好。' },
        { type: 'callout', tone: 'warning', title: '「Secret 的值看起來是亂碼，所以有加密」', text: '`bGVzc29uLWRlbW8tZGItcGFzcw==` 看起來像密文，其實只是 base64，`base64 -d` 一秒就還原，不需要任何金鑰。Secret 預設在 API 裡、在 etcd 裡都只是編碼；它的保護來自權限控管與（需要另外開啟的）靜態加密，而不是 base64。把 Secret 的 YAML 當成「已經加密」貼在聊天室、工單或 Git 裡，就等於公開了明文。' },
      ],
    },
    {
      id: 'kub06-s-limits', title: 'Secret 的限制、私有 Registry 與 immutable',
      blocks: [
        { type: 'p', text: 'Secret 比寫死在 manifest 好很多，但它不是保險箱。誰看得到一個 Secret 的值？能在那個命名空間 `get` 或 `list` Secret 的人（`list` 也會回傳所有的值）；能在那個命名空間建立 Pod 的人（他可以寫一個掛載任何 Secret 的 Pod，再讀出來）；能對用到它的 Pod 執行 `kubectl exec` 的人（`printenv` 或 `cat` 就看到了）；節點上的 kubelet 與有節點 root 權限的人；以及能讀 etcd 或它的備份的人。' },
        { type: 'table', head: ['風險', '說明', '常見的對策（課文）'], rows: [
          ['etcd 與備份', '預設 Secret 在 etcd 裡只是 base64；拿到 etcd 的資料或快照就能還原', '開啟 API server 的靜態加密（EncryptionConfiguration，例如 aescbc、aesgcm、secretbox，或交給外部金鑰服務的 KMS 外掛），並保護備份'],
          ['API 權限', '`get`、`list`、`watch` Secret 等於知道所有的值', 'RBAC 只給需要的人與 ServiceAccount，盡量限定 `resourceNames`；內建的 `view` 角色刻意不含 Secret'],
          ['建立 Pod 與 exec', '能建立 Pod 就能掛載同命名空間的任何 Secret；能 exec 就能讀環境變數與檔案', '限制建立 Pod 與 `pods/exec` 的權限，用命名空間隔離團隊與環境'],
          ['manifest 與 Git', 'Secret 的 manifest（`data` 或 `stringData`）一進 Git 就跟著每一份 clone 與備份外流', '不提交含有真實值的 Secret manifest；從檔案建立，或改用下面兩種作法'],
          ['集中管理與輪替', '幾十個服務各自建立 Secret，難以稽核、難以輪替', '外部機密管理服務（集中保存、稽核、自動輪替），由叢集裡的控制器同步成 Secret；或先用叢集的公鑰加密、只有叢集能解開的 manifest 才提交'],
        ] },
        { type: 'callout', tone: 'warning', title: '永遠不要提交含有真實值的 Secret manifest', text: '`kubectl create secret … --dry-run=client -o yaml > secret.yaml` 產生的檔案裡是 base64，不是密文；推進 Git 就和推進明文一樣，而且會永遠留在歷史裡（CICD08 的 INC-2026-031 就是這樣）。放進版本控制的只能是「引用」Secret 的東西：Deployment 裡的 `secretKeyRef`、外部機密管理的設定，或加密後的 manifest。萬一已經提交了，刪檔案不夠，必須輪替那個值。' },
        { type: 'p', text: '私有 Registry 的登入也是一種 Secret。Pod 的 `spec.imagePullSecrets` 列出同一個命名空間裡 `kubernetes.io/dockerconfigjson` 類型的 Secret，kubelet 拉取 Image 時用它登入。找不到那個 Secret 時，kubelet 記一則 FailedToRetrieveImagePullSecret 的警告，照樣嘗試沒有登入的拉取，被 Registry 拒絕後進入 ErrImagePull、ImagePullBackOff 的退避；Secret 建好之後，下一次重試就成功，不必重建 Pod。也可以把 imagePullSecrets 設在 ServiceAccount 上，讓使用它的每個 Pod 自動帶上。要注意的是，節點上已經有的 Image 在 `IfNotPresent` 的拉取策略下不會再登入，同一個節點上別的 Pod 也能直接使用它。' },
        { type: 'p', text: '最後是 `immutable: true`。設定之後 ConfigMap 或 Secret 的內容不能再改，`immutable` 也不能拿掉，只能刪除再重建。好處有兩個：避免有人不小心改到正在使用的設定，讓服務在下次重新啟動時才突然出錯；kubelet 也不必再監看它的變化，大型叢集裡能減輕 API server 的負擔。它很適合搭配上一節「名稱帶版本」的作法：每個版本是一個不可變更的 ConfigMap，改設定就是建立新版本。' },
        { type: 'example', id: 'kub06-pull' },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['建立 ConfigMap', '`kubectl create configmap 名稱 --from-literal=…`、`--from-file=…`、`--from-env-file=…`，或 YAML 再 `kubectl apply -f`'],
          ['從檔案更新', '`kubectl create configmap 名稱 --from-file=… --dry-run=client -o yaml | kubectl apply -f -`'],
          ['建立 Secret', '`kubectl create secret generic 名稱 --from-file=鍵=檔案`、`secret tls`、`secret docker-registry`'],
          ['讀出 Secret 的值', '`kubectl get secret 名稱 -o jsonpath=\'{.data.鍵}\' | base64 -d`'],
          ['確認 Pod 拿到的值', '`kubectl exec 名稱 -- printenv 變數`、`kubectl exec 名稱 -- cat 檔案`'],
          ['讓環境變數換成新值', '`kubectl rollout restart deploy/名稱`，再 `kubectl rollout status`'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, MOVE, RESTART, REPORT, LEGACY],
    examples: [
      {
        id: 'kub06-create', title: '把寫死的設定找出來，建立 ConfigMap', machine: 'kub06-ws',
        description: 'ticket-api 目前的 Deployment 把模式、日誌等級連同資料庫密碼都寫在 env 裡，任何能讀 Deployment 的人都看得到密碼。接著用 --from-literal、--from-file（檔案與資料夾）、--from-env-file 與 YAML 四種方式建立 ConfigMap，比較它們產生的鍵。',
        steps: [
          { command: "grep -A 7 'env:' tix/api-v1.yaml", output: "        env:\n        - name: APP_MODE\n          value: staging\n        - name: LOG_LEVEL\n          value: info\n        - name: DB_PASSWORD\n          value: lesson-demo-db-pass" },
          { command: "POD=$(kubectl get pods -l app=ticket-api -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- printenv APP_MODE LOG_LEVEL DB_PASSWORD", output: "staging\ninfo\nlesson-demo-db-pass" },
          { command: "kubectl get deploy ticket-api -o jsonpath='{.spec.template.spec.containers[0].env[2].value}'", output: "lesson-demo-db-pass" },
          { command: "kubectl create configmap api-flags --from-literal=QUEUE=on --from-literal=GREETING='hello tix'", output: "configmap/api-flags created" },
          { command: "ls tix/config", output: "banner.txt  settings.yaml" },
          { command: "kubectl create configmap api-files --from-file=tix/config/", output: "configmap/api-files created" },
          { command: "kubectl create configmap api-motd --from-file=motd=tix/config/banner.txt", output: "configmap/api-motd created" },
          { command: "cat tix/staging.env", output: "# ticket-api on staging\nAPP_MODE=staging\nLOG_LEVEL=info\nCACHE_TTL=30" },
          { command: "kubectl create configmap api-env --from-env-file=tix/staging.env", output: "configmap/api-env created" },
          { command: "kubectl get cm", output: "NAME               DATA      AGE\napi-env            3         0s\napi-files          2         0s\napi-flags          2         0s\napi-motd           1         0s\nkube-root-ca.crt   1         30d" },
          { command: "kubectl describe cm api-files", output: "Name:         api-files\nNamespace:    default\nLabels:       <none>\nAnnotations:  <none>\n\nData\n====\nbanner.txt:\n----\nWelcome to tix (staging)\n\n\nsettings.yaml:\n----\nqueue: enabled\nmax_seats_per_order: 4\nhold_minutes: 10\n\n\n\nBinaryData\n====\n\nEvents:  <none>" },
          { command: "kubectl get cm api-env -o yaml", output: "apiVersion: v1\ndata:\n  APP_MODE: staging\n  CACHE_TTL: \"30\"\n  LOG_LEVEL: info\nkind: ConfigMap\nmetadata:\n  creationTimestamp: \"2026-11-24T10:00:00Z\"\n  name: api-env\n  namespace: default\n  resourceVersion: \"1040\"\n  uid: 28d07da5-4ec9-445c-b6fc-c552cfa044c8" },
          { command: "kubectl create configmap api-flags --from-literal=QUEUE=off", output: "error: failed to create configmap: configmaps \"api-flags\" already exists" },
          { command: "kubectl create configmap api-flags --from-literal=QUEUE=off --dry-run=client -o yaml", output: "apiVersion: v1\ndata:\n  QUEUE: \"off\"\nkind: ConfigMap\nmetadata:\n  creationTimestamp: null\n  name: api-flags" },
          { command: "cat tix/api-config.yaml", output: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: api-config\ndata:\n  APP_MODE: staging\n  LOG_LEVEL: info" },
          { command: "kubectl apply -f tix/api-config.yaml", output: "configmap/api-config created" },
        ],
      },
      {
        id: 'kub06-consume', title: '以 envFrom、valueFrom 與 Volume 交給 Pod', machine: 'kub06-ws',
        description: '新版的 api.yaml 用 envFrom 讀取 api-config 與加上 FLAG_ 前綴的 api-flags，用 secretKeyRef 讀取資料庫密碼，並把 api-files 掛成 /etc/tix 底下的檔案（defaultMode 0440），banner.txt 另外以 subPath 放在 /app。先只建立 api-config 就套用：新 Pod 卡在掛載與設定，舊 Pod 繼續服務；補上缺的 ConfigMap 之後才完成換版。',
        steps: [
          { command: "tail -n 22 tix/api.yaml", output: "        - configMapRef:\n            name: api-config\n        - prefix: FLAG_\n          configMapRef:\n            name: api-flags\n        env:\n        - name: DB_PASSWORD\n          valueFrom:\n            secretKeyRef:\n              name: api-db\n              key: password\n        volumeMounts:\n        - name: files\n          mountPath: /etc/tix\n        - name: files\n          mountPath: /app/banner.txt\n          subPath: banner.txt\n      volumes:\n      - name: files\n        configMap:\n          name: api-files\n          defaultMode: 0440" },
          { command: "kubectl apply -f tix/api-config.yaml", output: "configmap/api-config created" },
          { command: "kubectl apply -f tix/api.yaml", output: "deployment.apps/ticket-api configured" },
          { command: "sleep 5", output: "" },
          { command: "kubectl get pods -l app=ticket-api", output: "NAME                          READY     STATUS              RESTARTS   AGE\nticket-api-bmf6m4fs6t-hzh4m   1/1       Running             0          30m\nticket-api-bmf6m4fs6t-whl4d   1/1       Running             0          30m\nticket-api-t886ck45pr-zdp8w   0/1       ContainerCreating   0          5s" },
          { command: "kubectl events --types=Warning", output: "LAST SEEN         TYPE      REASON        OBJECT                            MESSAGE\n2s (x3 over 5s)   Warning   FailedMount   Pod/ticket-api-t886ck45pr-zdp8w   MountVolume.SetUp failed for volume \"files\" : configmap \"api-files\" not found" },
          { command: "kubectl create configmap api-files --from-file=tix/config/", output: "configmap/api-files created" },
          { command: "sleep 10", output: "" },
          { command: "kubectl get pods -l app=ticket-api", output: "NAME                          READY     STATUS                       RESTARTS   AGE\nticket-api-bmf6m4fs6t-hzh4m   1/1       Running                      0          30m\nticket-api-bmf6m4fs6t-whl4d   1/1       Running                      0          30m\nticket-api-t886ck45pr-zdp8w   0/1       CreateContainerConfigError   0          15s" },
          { command: "kubectl events --types=Warning", output: "LAST SEEN           TYPE      REASON        OBJECT                            MESSAGE\n12s (x3 over 15s)   Warning   FailedMount   Pod/ticket-api-t886ck45pr-zdp8w   MountVolume.SetUp failed for volume \"files\" : configmap \"api-files\" not found\n8s                  Warning   Failed        Pod/ticket-api-t886ck45pr-zdp8w   Error: configmap \"api-flags\" not found" },
          { command: "kubectl create configmap api-flags --from-literal=QUEUE=on --from-literal=MAX_SEATS=4", output: "configmap/api-flags created" },
          { command: "kubectl rollout status deploy/ticket-api", output: "Waiting for deployment \"ticket-api\" rollout to finish: 1 out of 2 new replicas have been updated...\ndeployment \"ticket-api\" successfully rolled out" },
          { command: "sleep 2", output: "" },
          { command: "POD=$(kubectl get pods -l app=ticket-api -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- env", output: "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOSTNAME=ticket-api-t886ck45pr-gnfmv\nAPP_MODE=staging\nLOG_LEVEL=info\nFLAG_MAX_SEATS=4\nFLAG_QUEUE=on\nDB_PASSWORD=lesson-demo-db-pass\nKUBERNETES_SERVICE_HOST=10.96.0.1\nKUBERNETES_SERVICE_PORT=443\nKUBERNETES_SERVICE_PORT_HTTPS=443\nKUBERNETES_PORT=tcp://10.96.0.1:443\nKUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443\nKUBERNETES_PORT_443_TCP_PROTO=tcp\nKUBERNETES_PORT_443_TCP_PORT=443\nKUBERNETES_PORT_443_TCP_ADDR=10.96.0.1\nHOME=/root" },
          { command: "kubectl exec $POD -- printenv FLAG_QUEUE QUEUE", output: "on\ncommand terminated with exit code 1" },
          { command: "kubectl exec $POD -- ls -la /etc/tix", output: "drwxrwxrwx root    root     4096 .\ndrwxr-xr-x root    root     4096 ..\ndrwxr-xr-x root    root     4096 ..2026_11_24_10_00_17.484490512\nlrwxrwxrwx root    root       31 ..data -> ..2026_11_24_10_00_17.484490512\nlrwxrwxrwx root    root       17 banner.txt -> ..data/banner.txt\nlrwxrwxrwx root    root       20 settings.yaml -> ..data/settings.yaml" },
          { command: "kubectl exec $POD -- ls -l /etc/tix/..data/", output: "-r--r----- root    root       25 banner.txt\n-r--r----- root    root       55 settings.yaml" },
          { command: "kubectl exec $POD -- cat /etc/tix/settings.yaml /app/banner.txt", output: "queue: enabled\nmax_seats_per_order: 4\nhold_minutes: 10\nWelcome to tix (staging)" },
          { command: "kubectl describe pod $POD | grep -A 8 'Environment Variables from'", output: "    Environment Variables from:\n      api-config  ConfigMap                      Optional: false\n      api-flags   ConfigMap with prefix 'FLAG_'  Optional: false\n    Environment:\n      DB_PASSWORD:  <set to the key 'password' in secret 'api-db'>  Optional: false\n    Mounts:\n      /etc/tix from files (rw)\n      /app/banner.txt from files (rw,path=\"banner.txt\")\n      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-8dttd (ro)" },
        ],
      },
      {
        id: 'kub06-update', title: '改設定之後：Volume 會更新，環境變數與 subPath 不會', machine: 'kub06-ws',
        description: '部署好之後同時改兩個地方：api-config 的 LOG_LEVEL 改成 debug，banner.txt 換成特賣的文字。60 秒後掛載的 /etc/tix/banner.txt 換成新內容，但 subPath 的 /app/banner.txt 與環境變數 LOG_LEVEL 都不變；kubectl rollout restart 換上新的 Pod 之後才全部是新值。',
        steps: [
          { command: "kubectl apply -f tix/api-config.yaml", output: "configmap/api-config created" },
          { command: "kubectl create configmap api-flags --from-literal=QUEUE=on --from-literal=MAX_SEATS=4", output: "configmap/api-flags created" },
          { command: "kubectl create configmap api-files --from-file=tix/config/", output: "configmap/api-files created" },
          { command: "kubectl apply -f tix/api.yaml", output: "deployment.apps/ticket-api configured" },
          { command: "kubectl rollout status deploy/ticket-api", output: "deployment \"ticket-api\" successfully rolled out" },
          { command: "sleep 5", output: "" },
          { command: "POD=$(kubectl get pods -l app=ticket-api -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "sed -i 's/LOG_LEVEL: info/LOG_LEVEL: debug/' tix/api-config.yaml", output: "" },
          { command: "kubectl apply -f tix/api-config.yaml", output: "configmap/api-config configured" },
          { command: "echo 'Welcome to tix (spring sale)' > tix/config/banner.txt", output: "" },
          { command: "kubectl create configmap api-files --from-file=tix/config/ --dry-run=client -o yaml | kubectl apply -f -", output: "Warning: resource configmaps/api-files is missing the kubectl.kubernetes.io/last-applied-configuration annotation which is required by kubectl apply. kubectl apply should only be used on resources created declaratively by either kubectl create --save-config or kubectl apply. The missing annotation will be patched automatically.\nconfigmap/api-files configured" },
          { command: "sleep 30", output: "" },
          { command: "kubectl exec $POD -- cat /etc/tix/banner.txt", output: "Welcome to tix (staging)" },
          { command: "sleep 30", output: "" },
          { command: "kubectl exec $POD -- cat /etc/tix/banner.txt /app/banner.txt", output: "Welcome to tix (spring sale)\nWelcome to tix (staging)" },
          { command: "kubectl exec $POD -- printenv LOG_LEVEL", output: "info" },
          { command: "kubectl rollout restart deploy/ticket-api", output: "deployment.apps/ticket-api restarted" },
          { command: "kubectl rollout status deploy/ticket-api", output: "deployment \"ticket-api\" successfully rolled out" },
          { command: "sleep 2", output: "" },
          { command: "POD=$(kubectl get pods -l app=ticket-api -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- printenv LOG_LEVEL", output: "debug" },
          { command: "kubectl exec $POD -- cat /app/banner.txt", output: "Welcome to tix (spring sale)" },
        ],
      },
      {
        id: 'kub06-secret', title: 'Secret 只是 base64：讀出、編碼與 stringData 的陷阱', machine: 'kub06-ws',
        description: 'describe 只印出位元組數，但 -o jsonpath 加上 base64 -d 就還原出密碼；echo 與 echo -n 編碼的結果差一個換行。用 kubectl create secret generic 建立 Secret，看它的 data；最後發現上週用 stringData apply 的 api-db，明文還留在 last-applied-configuration 註解裡。',
        steps: [
          { command: "kubectl get secrets", output: "NAME      TYPE      DATA      AGE\napi-db    Opaque    2         6d20h" },
          { command: "kubectl describe secret api-db", output: "Name:         api-db\nNamespace:    default\nLabels:       <none>\nAnnotations:  <none>\n\nType:  Opaque\n\nData\n====\npassword:  19 bytes\nusername:  7 bytes" },
          { command: "kubectl get secret api-db -o jsonpath='{.data.password}'", output: "bGVzc29uLWRlbW8tZGItcGFzcw==" },
          { command: "kubectl get secret api-db -o jsonpath='{.data.password}' | base64 -d", output: "lesson-demo-db-pass" },
          { command: "echo lesson-demo | base64", output: "bGVzc29uLWRlbW8K" },
          { command: "echo -n lesson-demo | base64", output: "bGVzc29uLWRlbW8=" },
          { command: "echo bGVzc29uLWRlbW8K | base64 -d", output: "lesson-demo" },
          { command: "kubectl create secret generic api-smtp --from-literal=user=demo-mailer --from-literal=password=lesson-fake-smtp-pass", output: "secret/api-smtp created" },
          { command: "kubectl get secret api-smtp -o yaml", output: "apiVersion: v1\ndata:\n  password: bGVzc29uLWZha2Utc210cC1wYXNz\n  user: ZGVtby1tYWlsZXI=\nkind: Secret\nmetadata:\n  creationTimestamp: \"2026-11-24T10:00:00Z\"\n  name: api-smtp\n  namespace: default\n  resourceVersion: \"1037\"\n  uid: cfeaad98-32b4-4fea-aa2d-74f96d98e7c6\ntype: Opaque" },
          { command: "kubectl create secret generic api-tls --from-literal=tls.crt=x --type=kubernetes.io/tls", output: "error: failed to create secret Secret \"api-tls\" is invalid: data[tls.key]: Required value" },
          { command: "kubectl get secret api-db -o yaml", output: "apiVersion: v1\ndata:\n  password: bGVzc29uLWRlbW8tZGItcGFzcw==\n  username: dGl4X2FwcA==\nkind: Secret\nmetadata:\n  annotations:\n    kubectl.kubernetes.io/last-applied-configuration: |\n      {\"apiVersion\":\"v1\",\"kind\":\"Secret\",\"metadata\":{\"annotations\":{},\"name\":\"api-db\",\"namespace\":\"default\"},\"stringData\":{\"password\":\"lesson-demo-db-pass\",\"username\":\"tix_app\"},\"type\":\"Opaque\"}\n  creationTimestamp: \"2026-11-17T14:00:00Z\"\n  name: api-db\n  namespace: default\n  resourceVersion: \"1007\"\n  uid: ca22fd7b-c699-4553-92e4-37155aa5045b\ntype: Opaque" },
        ],
      },
      {
        id: 'kub06-pull', title: '私有 Registry 的 imagePullSecrets，以及不可變更的 ConfigMap', machine: 'kub06-ws',
        description: 'billing 的 Image 在私有 Registry，manifest 寫了 imagePullSecrets: regcred，但 regcred 還不存在：kubelet 警告找不到 Secret，沒有登入的拉取被拒絕，Pod 進入 ImagePullBackOff。建立 docker-registry 類型的 regcred 之後，下一次退避重試就拉下來了。最後把 sale-limits 設成 immutable，改值的 apply 被拒絕，只能刪除再建立。',
        steps: [
          { command: "grep -A 4 'image:' tix/billing.yaml", output: "        image: registry.example.com:5000/tix/billing:1.4\n        ports:\n        - containerPort: 8070\n      imagePullSecrets:\n      - name: regcred" },
          { command: "kubectl apply -f tix/billing.yaml", output: "deployment.apps/billing created" },
          { command: "sleep 3", output: "" },
          { command: "kubectl get pods -l app=billing", output: "NAME                       READY     STATUS             RESTARTS   AGE\nbilling-f5ftrkgpbw-drnh7   0/1       ImagePullBackOff   0          3s" },
          { command: "kubectl describe pods -l app=billing | tail -n 7", output: "  Normal   Scheduled                        3s    default-scheduler  Successfully assigned default/billing-f5ftrkgpbw-drnh7 to node-01\n  Warning  FailedToRetrieveImagePullSecret  3s    kubelet            Unable to retrieve some image pull secrets (regcred); attempting to pull the image may not succeed.\n  Normal   Pulling                          3s    kubelet            Pulling image \"registry.example.com:5000/tix/billing:1.4\"\n  Warning  Failed                           3s    kubelet            Failed to pull image \"registry.example.com:5000/tix/billing:1.4\": rpc error: code = Unknown desc = failed to pull and unpack image \"registry.example.com:5000/tix/billing:1.4\": failed to resolve reference \"registry.example.com:5000/tix/billing:1.4\": pull access denied, repository does not exist or may require authorization: authorization failed: no basic auth credentials\n  Warning  Failed                           3s    kubelet            Error: ErrImagePull\n  Normal   BackOff                          2s    kubelet            Back-off pulling image \"registry.example.com:5000/tix/billing:1.4\"\n  Warning  Failed                           2s    kubelet            Error: ImagePullBackOff" },
          { command: "kubectl create secret docker-registry regcred --docker-server=registry.example.com:5000 --docker-username=tix-ci --docker-password=lesson-fake-registry-token-1", output: "secret/regcred created" },
          { command: "kubectl get secret regcred", output: "NAME      TYPE                             DATA      AGE\nregcred   kubernetes.io/dockerconfigjson   1         0s" },
          { command: "kubectl get secret regcred -o jsonpath='{.data.\\.dockerconfigjson}' | base64 -d", output: "{\"auths\":{\"registry.example.com:5000\":{\"username\":\"tix-ci\",\"password\":\"lesson-fake-registry-token-1\",\"auth\":\"dGl4LWNpOmxlc3Nvbi1mYWtlLXJlZ2lzdHJ5LXRva2VuLTE=\"}}}" },
          { command: "sleep 20", output: "" },
          { command: "kubectl get pods -l app=billing", output: "NAME                       READY     STATUS    RESTARTS   AGE\nbilling-f5ftrkgpbw-drnh7   1/1       Running   0          23s" },
          { command: "cat tix/limits.yaml", output: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: sale-limits\nimmutable: true\ndata:\n  MAX_SEATS: \"4\"" },
          { command: "kubectl apply -f tix/limits.yaml", output: "configmap/sale-limits created" },
          { command: "sed -i 's/\"4\"/\"6\"/' tix/limits.yaml", output: "" },
          { command: "kubectl apply -f tix/limits.yaml", output: "The ConfigMap \"sale-limits\" is invalid: data: Forbidden: field is immutable when `immutable` is set" },
          { command: "kubectl delete cm sale-limits", output: "configmap \"sale-limits\" deleted" },
          { command: "kubectl apply -f tix/limits.yaml", output: "configmap/sale-limits created" },
        ],
      },
    ],
    exercises: EXERCISES,
  },
  quiz: [
    {
      id: 'kub06-q1', prompt: 'tix 團隊想把 staging 與 production 的設定差異直接烤進 Image（建置兩個 tag）。和「一個 Image 加上每個環境的 ConfigMap」相比，最主要的問題是什麼？',
      options: ['Kubernetes 不允許同一個 Deployment 使用兩個不同的 Image tag', 'Image 會變大，節點拉取時間變長，部署會比較慢', '正式環境跑的不是測試過的那個 Image，改一個設定也要重新建置', 'ConfigMap 讀取的速度比 Image 裡的檔案快，效能會比較好'],
      answer: 2,
      explanation: '同一個 Image 一路從測試推到正式環境，上線的才是測過的東西；每個環境各自建置，正式環境的 Image 就沒有被測試過，改日誌等級也要重新建置與部署，烤進去的密碼還留在層裡。Kubernetes 不限制 Image 的 tag；設定檔只有幾 KB，大小與拉取時間不是重點；ConfigMap 的目的也不是讀取效能。',
    },
    {
      id: 'kub06-q2', prompt: '同事用 `echo lesson-pass | base64` 的結果填進 Secret 的 `data.password`，程式卻一直登入失敗，手動輸入同一個密碼卻成功。最可能的原因是？',
      options: ['`echo` 在最後加了換行，存進去的密碼多了一個看不見的換行字元', 'Secret 的 `data` 要放明文，Kubernetes 會再編碼一次', 'base64 會把密碼加密，程式必須拿到金鑰才能解開', '`data` 的值不能超過 8 個字元，超過的部分被截掉'],
      answer: 0,
      explanation: '`echo` 會輸出結尾的換行，base64 把它一起編碼（結果以 K 結尾），解碼後的密碼是「lesson-pass 加上換行」，和資料庫的密碼不同。要用 `echo -n` 或 `printf`，或讓 `kubectl create secret` 自己編碼。`data` 本來就要放 base64（明文是 `stringData`）；base64 只是編碼，不需要金鑰；值的長度上限是整個物件 1 MiB，不是 8 個字元。',
    },
    {
      id: 'kub06-q3', prompt: 'ticket-api 以 `envFrom` 讀 api-config，並把 api-files 掛在 `/etc/tix`（沒有 subPath）。兩個 ConfigMap 都改了值並 apply 成功。兩分鐘後，執行中的 Pod 看到的是？',
      options: ['環境變數與檔案都已經是新值', '`/etc/tix` 的檔案是新值，環境變數仍是舊值', '環境變數是新值，`/etc/tix` 的檔案仍是舊值', '兩者都是舊值，直到 Pod 被刪除重建'],
      answer: 1,
      explanation: 'kubelet 會週期性同步掛載的 configMap Volume，大約一分鐘內換成新內容（原子地切換 ..data）；環境變數只在建立容器時解析一次，執行中永遠不變，要 `kubectl rollout restart` 換上新容器才會拿到。所以不是兩者都更新，也不是環境變數先更新；沒有 subPath 的 Volume 也不必等到 Pod 重建。',
    },
    {
      id: 'kub06-q4', prompt: '團隊只把 Secret 的 `get` 權限給了少數人。下列哪一種人「仍然」能讀到 payments 命名空間裡 Secret 的值？',
      options: ['只有內建 `view` 角色、能讀 payments 的 Deployment 與 Pod 的人', '能在其他命名空間建立 Pod，但對 payments 沒有任何權限的人', '能執行 `kubectl describe secret` 的人，因為 describe 會印出所有的值', '能在 payments 命名空間建立 Pod（再掛載那個 Secret）的人'],
      answer: 3,
      explanation: '能在命名空間建立 Pod，就能寫一個掛載該命名空間任何 Secret 的 Pod，再從容器裡讀出值，所以建立 Pod 的權限也要當成讀取 Secret 的權限。內建的 `view` 角色刻意不含 Secret；Pod 只能掛載同一個命名空間的 Secret，其他命名空間的權限沒有用；`describe secret` 只印出位元組數，不印值。',
    },
    {
      id: 'kub06-q5', prompt: '容器同時有 `envFrom: [{configMapRef: {name: api-config}}]`（裡面 `LOG_LEVEL: warn`）與 `env: [{name: LOG_LEVEL, value: debug}]`。容器裡的 LOG_LEVEL 是？',
      options: ['`debug`：`env` 在 `envFrom` 之後處理，同名的以 `env` 為準', '`warn`：ConfigMap 的值優先於寫死在 manifest 的值', '兩個值依處理順序以逗號連接，變成 `warn,debug`', 'API server 拒絕這個 Pod，因為同一個變數有兩個來源'],
      answer: 0,
      explanation: '變數先由每個 `envFrom` 展開，再處理 `env`，同名時後面的值為準，所以寫死的 `debug` 蓋掉 ConfigMap 的 `warn`。把設定搬進 ConfigMap 時忘了刪掉舊的 `env`，搬家就等於沒搬。ConfigMap 沒有比較高的優先順序；值不會被連接起來；這樣的寫法是合法的，API server 不會拒絕。',
    },
    {
      id: 'kub06-q6', prompt: '新的 Pod 停在 `CreateContainerConfigError`，事件寫著 `Error: configmap "api-flags" not found`。下列敘述何者正確？',
      options: ['必須刪掉這個 Pod 重新建立，kubelet 不會再嘗試', 'Image 拉取失敗，要先檢查 imagePullSecrets', '建立 api-flags 之後，kubelet 下一次重試就會啟動容器', '要在 Volume 加上 `defaultMode` 才能修正'],
      answer: 2,
      explanation: '環境變數引用的 ConfigMap 不存在時，容器停在 CreateContainerConfigError，kubelet 會持續重試，來源一建立就啟動，不需要刪除 Pod（不能沒有的話也可以設 `optional: true`）。Image 拉取失敗是 ErrImagePull 或 ImagePullBackOff；`defaultMode` 只管檔案權限，和缺少來源無關。',
    },
    {
      id: 'kub06-q7', prompt: '上週有人用一份含有 `stringData: {password: …}` 的 manifest 以 `kubectl apply` 建立 Secret。今天 `kubectl get secret api-db -o yaml` 的輸出裡，哪裡可以直接看到明文密碼？',
      options: ['`stringData` 欄位，API server 會把它原樣保存在物件裡', '`data` 欄位，因為用 stringData 建立的值不會經過 base64 編碼', '哪裡都看不到，stringData 在寫入之後就被 API server 完全丟掉了', '`kubectl.kubernetes.io/last-applied-configuration` 註解'],
      answer: 3,
      explanation: '`kubectl apply` 把整份 manifest 的原文存進 last-applied-configuration 註解，所以 stringData 的明文留在註解裡。API server 把 stringData 編碼後合併進 `data`（base64），不會保存 stringData 欄位本身；說「哪裡都看不到」忽略了 apply 的註解。用 `kubectl create secret` 從檔案建立就沒有這個註解。',
    },
    {
      id: 'kub06-q8', prompt: 'ConfigMap sale-limits 設了 `immutable: true`。現在要把 MAX_SEATS 從 4 改成 6，正確的作法是？',
      options: ['修改 manifest 再 `kubectl apply`，API server 會建立新版本', '刪除 sale-limits 再建立新的（或建立新名稱的 ConfigMap 並修改引用）', '先 apply 一份 `immutable: false` 的 manifest，再修改值', '加上 `--force-conflicts` 再 apply'],
      answer: 1,
      explanation: '設成不可變更之後，`data` 不能修改，`immutable` 也不能改回 false（apply 會得到 Forbidden），只能刪除再建立；更好的作法是建立帶版本的新名稱並修改 Deployment 的引用，讓滾動更新換上新設定。apply 不會自動建立新版本；`--force-conflicts` 處理的是 server-side apply 的欄位擁有權衝突，不能繞過不可變更的規則。',
    },
  ],
};
