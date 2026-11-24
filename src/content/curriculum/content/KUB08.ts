/*
 * KUB08 Persistent Volumes and Stateful Apps (KUB-3, terminal-sim; the blueprint's cluster-sim activity as terminal
 * content). A terminal lesson on the kube-storage profile (engine stages E32–E38): the made-up shop team's workstation
 * ops-ws (user yuki, as in KUB04, KUB05 and KUB07) with kubectl and the admin kubeconfig of the fictional three-node
 * cluster (cp-01, node-01, node-02). The cluster runs two made-up provisioners: local.example.com/local-path (node-local, the default
 * class local-path: WaitForFirstConsumer, Delete) and disk.csi.example.com (attachable network disks, the class fast:
 * Immediate, expansion); an administrator's NFS PersistentVolume pv-media (5Gi RWX Retain, no class) is there for static
 * binding. Images: shop/uploads:1.0 (keeps uploaded files in /srv/uploads; on both workers) and shop/stockdb:1.2 (a
 * made-up inventory database: its data directory /data, writes STOCKDB_VERSION when it starts, pulled in 3 s; a tcpSocket
 * readiness probe passes 3 s after a start, so OrderedReady visibly paces its pods). Covered: container layers and emptyDir
 * losing data (tied to DKR07's volumes); PV, PVC and StorageClass, static and dynamic provisioning, the default class,
 * Immediate and WaitForFirstConsumer, the Pending events and the immutable PVC spec; access modes and the RWO Multi-Attach
 * trap, local volumes' node affinity; reclaim Delete (the data goes) and Retain (Released, claimRef: null); StatefulSet
 * against Deployment (stable names, OrderedReady, volumeClaimTemplates, headless Service DNS, claims kept on scale-down,
 * the retention policy); backups with kubectl exec … tar and kubectl cp, restore with -i into a fresh claim, a PV is not a
 * backup; and an honest table for a database in the cluster against a managed service (no brands). Volume snapshots,
 * operators and kubectl patch are prose only. PV and pod names carry uids and hashes: commands read them with jsonpath,
 * checks use kube-volume and names that do not change. Hosts, users, images and the cluster are made up. Every transcript
 * output was produced by replaying it on the engine.
 */
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalKube } from '@/lib/terminal/kube-lesson';
import type { LessonContent } from '../schema';

const dir = (path: string, owner = 'yuki', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'yuki', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const yaml = (...lines: string[]) => [...lines, ''].join('\n');
/** A file written at the prompt with a quoted here-document (one input, under the terminal's 500 characters). */
const heredoc = (path: string, text: string) => `cat > ${path} <<'EOF'\n${text}EOF`;

const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nID=debian\n';
const TOOLS = ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'mkdir', 'touch', 'rm', 'head', 'tail', 'grep', 'wc', 'hostname', 'getent', 'tar'];
const IMAGES: TerminalImage[] = [
  { name: 'shop/uploads:1.0', size: 52_000_000, created: '2026-11-19 09:00:00', cmd: ['./uploads'], workdir: '/app', expose: [8080], service: true, layers: 4, osRelease: DEBIAN, commands: TOOLS,
    logs: ['uploads 1.0 listening on :8080, storing files in /srv/uploads'], signals: { TERM: { seconds: 1, logs: ['shutting down'], exit: 0 } } },
  { name: 'shop/stockdb:1.2', size: 61_000_000, created: '2026-11-18 09:00:00', cmd: ['./stockdb', '--data', '/data'], workdir: '/app', expose: [7000], service: true, layers: 4, osRelease: DEBIAN, commands: TOOLS,
    logs: ['stockdb 1.2 ready, data directory /data'], writes: ['/data/STOCKDB_VERSION'], signals: { TERM: { seconds: 1, logs: ['stockdb: flushed, bye'], exit: 0 } } },
];
const WORKERS = ['node-01', 'node-02'];

/** A StorageClass (name, provisioner, more lines; the default class carries the is-default-class annotation). */
const storageClass = (name: string, provisioner: string, more: string[], isDefault = false) => yaml('apiVersion: storage.k8s.io/v1', 'kind: StorageClass', 'metadata:', `  name: ${name}`,
  ...isDefault ? ['  annotations:', '    storageclass.kubernetes.io/is-default-class: "true"'] : [], `provisioner: ${provisioner}`, ...more);
const LOCAL_PATH = storageClass('local-path', 'local.example.com/local-path', ['reclaimPolicy: Delete', 'volumeBindingMode: WaitForFirstConsumer'], true);
const FAST = storageClass('fast', 'disk.csi.example.com', ['reclaimPolicy: Delete', 'volumeBindingMode: Immediate', 'allowVolumeExpansion: true']);
const PV_MEDIA = yaml('apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-media', 'spec:', '  capacity:', '    storage: 5Gi', '  accessModes:', '  - ReadWriteMany', '  persistentVolumeReclaimPolicy: Retain',
  '  storageClassName: ""', '  nfs:', '    server: 10.0.0.60', '    path: /exports/media');

const pvc = (name: string, cls: string | null, size = '1Gi', modes = ['ReadWriteOnce']) => yaml('apiVersion: v1', 'kind: PersistentVolumeClaim', 'metadata:', `  name: ${name}`, 'spec:', '  accessModes:', ...modes.map(m => `  - ${m}`),
  ...cls === null ? [] : [`  storageClassName: ${cls === '' ? '""' : cls}`], '  resources:', '    requests:', `      storage: ${size}`);
/** A Deployment of shop/uploads:1.0 (replicas, the volume at /srv/uploads: an emptyDir or a claim, more spec lines). */
const uploads = (name: string, replicas: number, volume: string, spec: string[] = []) => yaml('apiVersion: apps/v1', 'kind: Deployment', 'metadata:', `  name: ${name}`, 'spec:', `  replicas: ${replicas}`, ...spec.map(l => `  ${l}`),
  '  selector:', '    matchLabels:', `      app: ${name}`, '  template:', '    metadata:', '      labels:', `        app: ${name}`, '    spec:', '      containers:', `      - name: ${name}`, '        image: shop/uploads:1.0',
  '        volumeMounts:', '        - name: files', '          mountPath: /srv/uploads', '      volumes:', '      - name: files', `        ${volume}`);
/** The headless Service and the StatefulSet stockdb (replicas; its claim template data: 1Gi RWO of the default class, or of cls). */
const stockdb = (replicas: number, cls?: string) => yaml('apiVersion: v1', 'kind: Service', 'metadata:', '  name: stockdb', 'spec:', '  clusterIP: None', '  selector:', '    app: stockdb', '  ports:', '  - port: 7000', '---',
  'apiVersion: apps/v1', 'kind: StatefulSet', 'metadata:', '  name: stockdb', '  labels:', '    app: stockdb', 'spec:', '  serviceName: stockdb', `  replicas: ${replicas}`, '  selector:', '    matchLabels:', '      app: stockdb', '  template:', '    metadata:', '      labels:', '        app: stockdb',
  '    spec:', '      containers:', '      - name: stockdb', '        image: shop/stockdb:1.2', '        ports:', '        - containerPort: 7000', '        readinessProbe:', '          tcpSocket:', '            port: 7000', '          initialDelaySeconds: 3', '          periodSeconds: 2',
  '        volumeMounts:', '        - name: data', '          mountPath: /data', '  volumeClaimTemplates:', '  - metadata:', '      name: data', '    spec:', '      accessModes: ["ReadWriteOnce"]', ...cls ? [`      storageClassName: ${cls}`] : [], '      resources:', '        requests:', '          storage: 1Gi');

const PROVISIONERS: TerminalKube['storage'] = { provisioners: [{ name: 'local.example.com/local-path', local: true }, { name: 'disk.csi.example.com' }] };
const CLASSES_AT_BOOT = [{ text: LOCAL_PATH, at: '2026-10-25 10:30:00', file: 'local-path.yaml' }, { text: FAST, at: '2026-10-25 10:31:00', file: 'fast.yaml' }];
const kubeOf = (manifests: TerminalKube['manifests'], storage: TerminalKube['storage'] = PROVISIONERS): TerminalKube => ({
  images: [{ name: 'shop/uploads:1.0', nodes: WORKERS }, { name: 'shop/stockdb:1.2', seconds: 3 }],
  manifests,
  storage,
});
const workstation = (id: string, title: string, files: TerminalFile[], kube: TerminalKube): TerminalMachine => ({
  id, title, user: 'yuki', host: 'ops-ws', cwd: '/home/yuki', profile: 'kube-storage', now: '2026-11-24 10:00:00',
  files: [dir('/home', 'root'), dir('/home/yuki'), dir('/home/yuki/shop'), ...files],
  docker: { images: IMAGES },
  kube,
});

const WS = workstation('kub08-ws', 'ops-ws（shop 團隊的工作站：叢集有 local-path 與 fast 兩種儲存）', [
  file('/home/yuki/shop/scratch.yaml', uploads('scratch', 1, 'emptyDir: {}')),
  file('/home/yuki/shop/uploads-pvc.yaml', pvc('uploads-data', null)),
  file('/home/yuki/shop/uploads.yaml', uploads('uploads', 1, 'persistentVolumeClaim: {claimName: uploads-data}')),
  file('/home/yuki/shop/typo-pvc.yaml', pvc('typo-data', 'standard')),
  file('/home/yuki/shop/media-pvc.yaml', pvc('media', '', '2Gi', ['ReadWriteMany'])),
  file('/home/yuki/shop/cache.yaml', pvc('cache-data', 'fast') + '---\n' + uploads('cache', 2, 'persistentVolumeClaim: {claimName: cache-data}')),
  file('/home/yuki/shop/stockdb.yaml', stockdb(3)),
  file('/home/yuki/shop/pv-media.yaml', PV_MEDIA.replace('  storageClassName', '  claimRef: null\n  storageClassName')),
], kubeOf([...CLASSES_AT_BOOT, { text: PV_MEDIA, at: '2026-11-02 14:00:00', file: 'pv-media.yaml' }]));

// Exercise 1: uploads keeps its files in an emptyDir.
const UPLOADS_EMPTY = uploads('uploads', 1, 'emptyDir: {}');
const UPLOADS = workstation('kub08-uploads', 'ops-ws（uploads 把上傳的檔案放在 emptyDir）', [file('/home/yuki/shop/uploads.yaml', UPLOADS_EMPTY)],
  kubeOf([...CLASSES_AT_BOOT, { text: UPLOADS_EMPTY, at: '2026-11-20 15:00:00', file: 'uploads.yaml' }]));

// Exercise 2: the reports claim asks for a class the cluster does not have (the variants: other classes, another default).
const reportsYaml = (cls: string) => pvc('reports-data', cls) + '---\n' + uploads('reports', 1, 'persistentVolumeClaim: {claimName: reports-data}');
const reportsKube = (classes: TerminalKube['manifests'], cls: string) => kubeOf([...classes ?? [], { text: reportsYaml(cls), at: '2026-11-24 09:30:00', file: 'reports.yaml' }]);
const NODE_DISK = storageClass('node-disk', 'local.example.com/local-path', ['volumeBindingMode: WaitForFirstConsumer'], true);
const FAST_DEFAULT = storageClass('fast', 'disk.csi.example.com', ['reclaimPolicy: Delete', 'volumeBindingMode: Immediate', 'allowVolumeExpansion: true'], true);
const REPORTS = workstation('kub08-reports', 'ops-ws（reports 的 PVC 一直是 Pending）', [file('/home/yuki/shop/reports.yaml', reportsYaml('standard'))], reportsKube(CLASSES_AT_BOOT, 'standard'));

// Exercise 3: stockdb runs one replica.
const DB = workstation('kub08-db', 'ops-ws（stockdb 目前只有 1 個副本）', [file('/home/yuki/shop/stockdb.yaml', stockdb(1))],
  kubeOf([...CLASSES_AT_BOOT, { text: stockdb(1), at: '2026-11-20 11:00:00', file: 'stockdb.yaml' }]));

// Exercise 4: stockdb-0's claim is bound to a local disk prepared by the administrator (local-disk, no provisioner) that holds the data.
const LOCAL_DISK = storageClass('local-disk', 'kubernetes.io/no-provisioner', ['volumeBindingMode: WaitForFirstConsumer']);
const PV_STOCK = yaml('apiVersion: v1', 'kind: PersistentVolume', 'metadata:', '  name: pv-stockdb-0', 'spec:', '  capacity:', '    storage: 2Gi', '  accessModes:', '  - ReadWriteOnce', '  persistentVolumeReclaimPolicy: Retain',
  '  storageClassName: local-disk', '  local:', '    path: /mnt/disks/ssd1', '  nodeAffinity:', '    required:', '      nodeSelectorTerms:', '      - matchExpressions:', '        - key: kubernetes.io/hostname', '          operator: In', '          values:', '          - node-02');
const STOCK_CSV = 'sku,warehouse,qty\ntea-oolong-150g,taipei,42\ntea-black-100g,taipei,17\ncup-glass-300ml,taichung,8\n';
const RESTORE_YAML = pvc('restore-data', null) + '---\n' + yaml('apiVersion: v1', 'kind: Pod', 'metadata:', '  name: stockdb-restore', 'spec:', '  containers:', '  - name: stockdb', '    image: shop/stockdb:1.2', '    volumeMounts:', '    - name: data', '      mountPath: /data',
  '  volumes:', '  - name: data', '    persistentVolumeClaim:', '      claimName: restore-data');
const BACKUP = workstation('kub08-backup', 'ops-ws（stockdb-0 的資料在 node-02 的本機磁碟上）', [file('/home/yuki/shop/restore.yaml', RESTORE_YAML)],
  kubeOf([...CLASSES_AT_BOOT, { text: LOCAL_DISK, at: '2026-11-01 09:00:00', file: 'local-disk.yaml' }, { text: PV_STOCK, at: '2026-11-01 09:05:00', file: 'pv-stockdb-0.yaml' },
    { text: stockdb(1, 'local-disk'), at: '2026-11-20 11:00:00', file: 'stockdb.yaml' }], { ...PROVISIONERS, files: { 'pv-stockdb-0': { 'stock.csv': STOCK_CSV, 'wal/000001.log': 'put tea-oolong-150g 42\nput tea-black-100g 17\nput cup-glass-300ml 8\n' } } }));

const LOCAL_PATH_PLAIN = storageClass('local-path', 'local.example.com/local-path', ['reclaimPolicy: Delete', 'volumeBindingMode: WaitForFirstConsumer']);
const reportsVariant = (label: string, classes: TerminalKube['manifests'], cls: string) => ({ label, files: [file('/home/yuki/shop/reports.yaml', reportsYaml(cls))], kube: reportsKube(classes, cls) });

const podOf = (app: string) => `$(kubectl get pods -l app=${app} -o jsonpath='{.items[0].metadata.name}')`;
const PVC_UPLOADS = pvc('uploads-data', null);
const TO_CLAIM = "sed -i 's/emptyDir: {}/persistentVolumeClaim: {claimName: uploads-data}/' shop/uploads.yaml";

export const KUB08: LessonContent = {
  lessonId: 'KUB08',
  motivation: 'shop 團隊的上傳服務 uploads 已經在叢集上跑了一陣子，商家上傳的商品照片都存在 Pod 裡的 `/srv/uploads`。某個晚上維運同事為了換核心排空了一個節點，uploads 的 Pod 被移到另一個節點重建——服務很快恢復，但這幾天上傳的照片全部不見了。原因和 DKR07 一樣：資料寫在跟著容器（或 Pod）一起消失的地方。只是在 Kubernetes 裡問題更大，因為 Pod 本來就會被刪除、被驅逐、被排到別的節點，Docker 那種「在這台主機上建一個 Volume」的做法不夠用：儲存必須是叢集層級、排程器也看得懂的資源。這一課在 shop 團隊的工作站 ops-ws 上，先親眼看 emptyDir 的資料隨 Pod 消失，再用 PersistentVolumeClaim 向叢集申請持久儲存，弄懂 PersistentVolume、PVC 與 StorageClass 怎麼綁在一起、為什麼 PVC 會卡在 Pending、存取模式與回收策略的陷阱；接著把庫存資料庫 stockdb 改用 StatefulSet 執行，讓每個副本有固定的名稱、自己的資料與 DNS 名稱；最後學會把 Volume 裡的資料備份到叢集外、還原到新的 PVC，並誠實地比較資料庫該放在叢集裡還是交給託管服務。學完之後，你能在 Kubernetes 中執行需要保存資料的應用，也知道它的界線在哪裡。',
  sections: [
    {
      id: 'kub08-s-why', title: 'Pod 換掉，資料就跟著消失',
      blocks: [
        { type: 'p', text: '容器的檔案系統是 Image 的唯讀層加上一層可寫層（DKR07）。在 Kubernetes 裡這一層更短命：kubelet 重新啟動當掉的容器時，新的容器從 Image 重新開始，之前寫進可寫層的檔案全部消失。Pod 可以宣告 Volume 來放資料，最簡單的是 `emptyDir`：Pod 被排到節點上時建立一個空資料夾，同一個 Pod 裡的容器都能掛載它，容器重新啟動時它還在；但 Pod 從節點上移除（被刪除、被驅逐、因為換版被取代）時，emptyDir 跟著刪除。' },
        { type: 'table', head: ['資料放在哪裡', '容器重新啟動', 'Pod 被刪除後重建', 'Pod 換到別的節點'], rows: [
          ['容器的可寫層（例如 `/tmp`）', '消失', '消失', '消失'],
          ['`emptyDir`', '還在', '消失', '消失'],
          ['`hostPath`（節點上的資料夾）', '還在', '回到同一個節點才看得到', '看不到：新節點上是另一個資料夾'],
          ['PVC 綁定的網路磁碟', '還在', '還在', '跟著走：從舊節點 detach，再 attach 到新節點'],
          ['PVC 綁定的本機磁碟（local PV）', '還在', '還在', '不能換：Pod 只能回到磁碟所在的節點'],
        ] },
        { type: 'p', text: '下面的 scratch 是 uploads 的試驗版，`/srv/uploads` 掛的是 emptyDir。在 Pod 裡寫一張「照片」到 Volume、一份草稿到 `/tmp`，然後刪掉 Pod：Deployment 補上的新 Pod 有一個全新的 emptyDir 與全新的可寫層，兩個檔案都不見了。' },
        { type: 'example', id: 'kub08-lose' },
        { type: 'p', text: '`kubectl describe pod` 的 Volumes 段落把 emptyDir 說得很直白：a temporary directory that shares a pod\'s lifetime。emptyDir 適合快取、暫存檔、同一個 Pod 裡 sidecar 與主容器交換檔案；加上 `medium: Memory` 會改用記憶體（tmpfs），速度快，但寫進去的資料算在容器的記憶體用量裡。它從來不是放「要留下來的資料」的地方。' },
        { type: 'p', text: 'DKR07 的工具在 Kubernetes 都有對應，但有一個根本的差別：Docker 只有一台主機，Volume 就在那台主機的 `/var/lib/docker/volumes`；叢集有很多節點，Pod 隨時可能被排到另一個節點，所以「資料在哪裡」必須寫成叢集認得的物件，讓排程器知道這個 Pod 需要哪一份儲存、那份儲存能在哪些節點上使用。' },
        { type: 'table', head: ['DKR07（Docker）', 'Kubernetes', '差別'], rows: [
          ['具名 Volume（`docker volume create`）', 'PersistentVolumeClaim + PersistentVolume', '不綁在一台主機上；由 StorageClass 依需求建立，排程器會考慮它'],
          ['匿名 Volume（跟著容器）', '`emptyDir`（跟著 Pod）', '壽命是 Pod，不是容器'],
          ['Bind mount（主機上的資料夾）', '`hostPath`', '應用程式很少該用：Pod 換節點就看到另一份，也有安全風險'],
          ['tmpfs', '`emptyDir` 的 `medium: Memory`', '算在記憶體用量'],
          ['用暫時的容器跑 `tar` 備份', '`kubectl exec … -- tar` 或 `kubectl cp`', '封存檔經由 kubectl 傳到工作站'],
        ] },
      ],
    },
    {
      id: 'kub08-s-pvc', title: 'PV、PVC 與 StorageClass：誰申請、誰供應',
      blocks: [
        { type: 'p', text: 'Kubernetes 把「一份儲存」與「要用儲存的人」拆成兩個物件。PersistentVolume（PV）是叢集裡的一份實際儲存：一顆網路磁碟、一個 NFS 匯出的路徑、某個節點上的一個資料夾，它像節點一樣屬於整個叢集，沒有命名空間。PersistentVolumeClaim（PVC）是應用程式提出的申請：我要多大、要什麼存取模式、要哪一種儲存，它屬於某個命名空間。Pod 不直接指定 PV，只在 `volumes` 裡寫 `persistentVolumeClaim.claimName`。PVC 之於 PV，就像 Pod 之於節點：一個是需求，一個是資源，由控制器把它們配對。' },
        { type: 'table', head: ['物件', '範圍', '通常由誰建立', '重要欄位'], rows: [
          ['StorageClass', '叢集', '叢集管理者（安裝儲存外掛時）', '`provisioner`、`parameters`、`reclaimPolicy`、`volumeBindingMode`、`allowVolumeExpansion`'],
          ['PersistentVolume', '叢集', '管理者手動建立（靜態），或 provisioner 依 PVC 建立（動態）', '`capacity`、`accessModes`、`persistentVolumeReclaimPolicy`、`storageClassName`、來源（`nfs`、`local`、`csi`…）'],
          ['PersistentVolumeClaim', '命名空間', '應用程式的 manifest', '`accessModes`、`resources.requests.storage`、`storageClassName`'],
        ] },
        { type: 'p', text: '供應的方式有兩種。靜態（static）：管理者事先建立好一批 PV，PVC 出現時，PV controller 找一個條件相符的 PV 綁定：StorageClass 相同（`storageClassName: ""` 表示「不要 class」，只會綁定沒有 class 的 PV）、存取模式包含 PVC 要的、容量不小於要求，符合的有好幾個時挑最小的。綁定是一對一而且排他的：要 2Gi 的 PVC 綁上 5Gi 的 PV，就拿到整整 5Gi，其他 PVC 不能再用它。動態（dynamic）：PVC 指定的 StorageClass 有 provisioner，provisioner 依要求當場建立一個 PV（名稱是 `pvc-` 加上 PVC 的 uid），現代叢集大多用這種。' },
        { type: 'p', text: 'PVC 沒寫 `storageClassName` 這個欄位時，API server 在建立的那一刻替它填上預設的 StorageClass（帶著註解 `storageclass.kubernetes.io/is-default-class: "true"` 的那一個，`kubectl get sc` 在名稱後面標 `(default)`）。所以「不寫」和「寫 `\"\"`」意思完全不同：前者是「用預設的」，後者是「不要動態佈建」。`volumeBindingMode` 決定什麼時候綁定：`Immediate` 是 PVC 一建立就佈建；`WaitForFirstConsumer` 是等到第一個使用它的 Pod 被排程之後，在 Pod 所在的節點（或區域）佈建。節點本機的儲存一定要用後者，否則磁碟可能建在一個 Pod 根本排不上去的節點。' },
        { type: 'example', id: 'kub08-claim' },
        { type: 'p', text: '這個叢集的預設 class 是 local-path：一個節點本機的 provisioner，把 PV 做成節點上 `/opt/local-path-provisioner` 底下的資料夾。uploads-data 一開始是 Pending，事件 WaitForFirstConsumer 說明它在等使用者，這是正常的；uploads 的 Pod 被排到 node-01 之後，provisioner 才在 node-01 上建立 PV。`describe pv` 的 Node Affinity 寫著 `kubernetes.io/hostname in [node-01]`：這份資料只存在 node-01，所以刪掉 Pod 之後，新的 Pod 也被排回 node-01，照片還在。PV 的名稱帶著 uid，每次都不同，指令裡要用 `-o jsonpath=\'{.spec.volumeName}\'` 讀出來，不要寫死。最後 typo-data 寫錯了 class 名稱，事件直接說 `storageclass.storage.k8s.io "standard" not found`。' },
        { type: 'table', head: ['PVC 的事件（`kubectl describe pvc`）', '意思', '怎麼處理'], rows: [
          ['`WaitForFirstConsumer`', 'class 是延遲綁定，還沒有 Pod 使用它', '正常；套用使用它的工作負載就會綁定'],
          ['`ProvisioningFailed`：storageclass … not found', '`storageClassName` 寫了不存在的 class', '刪掉 PVC，改成正確的 class（或拿掉這一行用預設的）再建立'],
          ['`FailedBinding`：no persistent volumes available for this claim and no storage class is set', '沒有 class 可以佈建（寫了 `""`，或叢集沒有預設 class），也沒有相符的靜態 PV', '指定 class、請管理者設定預設 class，或建立相符的 PV'],
          ['只有 `ExternalProvisioning`，一直 Pending', 'class 的 provisioner 沒有在執行', '請管理者檢查儲存外掛的 Pod'],
          ['Pod 的 `FailedScheduling`：pod has unbound immediate PersistentVolumeClaims', 'Pod 在等它的 PVC 綁定', '先修好 PVC，排程器會自動重試'],
        ] },
        { type: 'callout', tone: 'warning', title: '改了 manifest 再 apply，修不好 Pending 的 PVC', text: '直覺的修法是把 `storageClassName` 改對再 `kubectl apply`，結果只會得到 `spec is immutable after creation except resources.requests…`：PVC 建立之後，除了容量（而且只能放大，class 要允許擴充）以外都不能改。要換 class 只能刪掉 PVC 再建立；還沒綁定的 PVC 沒有資料，刪掉沒有損失。另外 PVC 有 `kubernetes.io/pvc-protection` 這個 finalizer：還有執行中的 Pod 使用它時，刪除只會讓它停在 Terminating，要等那些 Pod 消失才真的刪掉。所以實務上常把整份 manifest 一起處理：`kubectl delete -f` 刪掉 PVC 與使用它的工作負載，改好之後再 `kubectl apply -f`。' },
      ],
    },
    {
      id: 'kub08-s-modes', title: '存取模式與回收策略',
      blocks: [
        { type: 'p', text: '`accessModes` 說的是「這份儲存能以什麼方式被掛載」，而它的單位是節點，不是 Pod。這是最常被誤解的地方。' },
        { type: 'table', head: ['存取模式', '縮寫', '意思', '典型的儲存'], rows: [
          ['ReadWriteOnce', 'RWO', '一次只能被一個節點以讀寫掛載；同一個節點上的多個 Pod 可以一起用', '雲端或機房的區塊磁碟、本機磁碟'],
          ['ReadOnlyMany', 'ROX', '多個節點唯讀掛載', '共用的唯讀資料'],
          ['ReadWriteMany', 'RWX', '多個節點同時讀寫', 'NFS 這類檔案儲存'],
          ['ReadWriteOncePod', 'RWOP', '整個叢集只有一個 Pod 能使用（只支援 CSI Volume）', '要保證只有一個寫入者的資料'],
        ] },
        { type: 'p', text: '網路磁碟的 RWO 有一個經典陷阱：Deployment 有兩個副本、共用同一個 RWO 的 PVC。兩個 Pod 被排到不同節點時，磁碟已經 attach 在第一個節點上，第二個 Pod 永遠停在 ContainerCreating，事件是 `FailedAttachVolume`：Multi-Attach error。只有一個副本的 Deployment 也會中招：滾動更新先建立新 Pod、再刪舊 Pod，新 Pod 若排到別的節點，就卡在同一個錯誤，更新永遠完成不了。解法依需求而定：每個副本要有自己的資料，用 StatefulSet（下一節）；真的要多個 Pod 共用檔案，用支援 RWX 的儲存；單一副本的服務用 `strategy: {type: Recreate}`，先刪舊 Pod 再建新的。' },
        { type: 'p', text: '本機磁碟（local-path、local PV）沒有 attach 的問題，因為它根本離不開節點：PV 的 node affinity 讓 Pod 只能排到那個節點。代價是那個節點壞了，Pod 就排不上去（事件是 `volume node affinity conflict`），資料也只能等節點修好；本機磁碟換到的是速度與簡單，丟掉的是可攜性，通常只給自己會複製資料的系統用。' },
        { type: 'p', text: 'PVC 被刪除之後，PV 怎麼處理由回收策略（`persistentVolumeReclaimPolicy`）決定。動態佈建的 PV 採用 StorageClass 的 `reclaimPolicy`（沒寫時是 Delete）；手動建立的 PV 預設是 Retain。' },
        { type: 'table', head: ['回收策略', 'PVC 刪除之後', '適合'], rows: [
          ['`Delete`', 'provisioner 刪掉 PV，也刪掉後端的磁碟與上面的資料', '可以重建的資料、測試環境'],
          ['`Retain`', 'PV 變成 `Released`，資料留著；它記得原本的 claim（`claimRef`），不會自動給別的 PVC', '重要資料：由管理者確認後再清掉 `claimRef` 重新使用，或手動清除'],
          ['`Recycle`', '清空資料後重新變成 Available（已棄用）', '不要再用'],
        ] },
        { type: 'example', id: 'kub08-modes' },
        { type: 'p', text: '範例的前半是靜態綁定：media 要 2Gi、RWX、`storageClassName: ""`，唯一相符的是管理者建立的 NFS PV pv-media，綁上之後容量顯示 5Gi。cache 的兩個副本共用一顆 fast 的網路磁碟（RWO），node-02 上的那個卡在 ContainerCreating。後半刪掉 uploads 與它的 PVC：local-path 的 PV 是 Delete，PV 與照片一起消失，重新建立的 PVC 拿到一個全新的空 Volume；pv-media 是 Retain，變成 Released，新的 media PVC 綁不上它，直到 manifest 寫上 `claimRef: null` 再套用（常見的寫法是 `kubectl patch pv pv-media -p \'{"spec":{"claimRef":null}}\'`），它才回到可以綁定的狀態，舊資料原封不動地交給新的 PVC。' },
        { type: 'callout', tone: 'warning', title: '刪掉 PVC，資料就沒了', text: '很多人以為 PVC 只是「申請單」，刪掉它不會影響磁碟。事實上大多數動態佈建的 StorageClass 預設 `reclaimPolicy: Delete`：刪除 PVC（或刪掉一個命名空間，裡面所有的 PVC 跟著刪除）時，provisioner 會把 PV 與底層的磁碟一起刪掉，沒有資源回收筒。存放重要資料的 PV 請改成 Retain（為這類資料另建一個 `reclaimPolicy: Retain` 的 class），清理資源前先 `kubectl get pv` 看清楚回收策略，而且無論如何都要有叢集外的備份。' },
      ],
    },
    {
      id: 'kub08-s-sts', title: 'StatefulSet：有固定身分的副本',
      blocks: [
        { type: 'p', text: 'Deployment 的副本是可以互換的：名稱是隨機的雜湊，刪掉一個就補一個新名字的，範本裡寫的 PVC 是同一個，所有副本都指向它。這對網頁服務很好，對資料庫卻是災難：三個副本要嘛搶同一顆 RWO 磁碟（Multi-Attach），要嘛同時寫同一份資料檔。資料庫、訊息佇列這類有狀態應用需要的是「副本 0 永遠是副本 0，而且永遠拿回自己那一份資料」，這就是 StatefulSet。' },
        { type: 'table', head: ['', 'Deployment', 'StatefulSet'], rows: [
          ['Pod 名稱', '`catalog-9zpmhnrl4t-6ltfc`（隨機）', '`stockdb-0`、`stockdb-1`、`stockdb-2`（固定序號）'],
          ['刪掉一個 Pod', '補一個新名稱的', '以同一個名稱重建，拿回同一個 PVC'],
          ['儲存', '範本裡的 PVC 是所有副本共用的同一個', '`volumeClaimTemplates`：每個 Pod 一個 PVC（`data-stockdb-0`…）'],
          ['網路身分', '只透過 Service，個別 Pod 沒有固定名稱', '搭配 headless Service：`stockdb-0.stockdb.default.svc.cluster.local`'],
          ['建立與刪除的順序', '同時建立；縮減時挑「最不值得留」的', '預設 OrderedReady：0、1、2 依序建立，前一個就緒才建下一個；縮減從最大的序號開始'],
          ['縮減或刪除之後的 PVC', '（PVC 不歸它管）', '預設保留，再擴充時同一個序號拿回原本的資料'],
        ] },
        { type: 'p', text: 'StatefulSet 的 `serviceName` 指向一個 headless Service（KUB05：`clusterIP: None`）。Pod 的 hostname 是自己的名稱、subdomain 是這個 Service，就緒之後叢集 DNS 就有 `<pod>.<service>.<namespace>.svc.cluster.local` 這筆紀錄。資料庫的副本靠它找到彼此，例如「主節點永遠是 stockdb-0」。`volumeClaimTemplates` 的每一筆在建立 Pod 之前先建立 PVC，名稱是 `<範本名稱>-<StatefulSet 名稱>-<序號>`，用的是範本指定（或預設）的 StorageClass。' },
        { type: 'example', id: 'kub08-sts' },
        { type: 'p', text: '`rollout status` 一行一行倒數：stockdb-0 拉完 Image、readiness 探針 3 秒後通過，stockdb-1 才建立，以此類推，三個 PVC 的 AGE 也透露了這個順序。刪掉 stockdb-1 之後，回來的 Pod 還叫 stockdb-1，掛的還是 data-stockdb-1，所以剛寫的 stock.csv 還在（local-path 的 PV 讓它回到 node-02）。縮減成 1 個時先刪 stockdb-2、再刪 stockdb-1，三個 PVC 都留著：這是刻意的保護，資料不會因為縮減而消失，代價是你要記得自己清理。想要縮減時自動刪除，設定 `persistentVolumeClaimRetentionPolicy` 的 `whenScaled: Delete`（刪除整個 StatefulSet 時是 `whenDeleted`），預設兩者都是 Retain。' },
        { type: 'p', text: '其他值得知道的設定：`podManagementPolicy: Parallel` 讓 Pod 同時建立與刪除（副本之間不需要順序時能加快速度）；`updateStrategy` 的 RollingUpdate 從最大的序號往回一個一個換，`partition` 可以只更新序號大於等於它的 Pod 來做分段發布，OnDelete 則只在你刪掉 Pod 時才換新版。要刪除 StatefulSet 時，官方文件建議先縮減到 0，因為刪除 StatefulSet 本身不保證 Pod 的終止順序。' },
        { type: 'callout', tone: 'note', title: 'StatefulSet 不會替你做資料庫的複製', text: 'StatefulSet 給的是固定的名稱、順序與每個副本自己的儲存。三個 stockdb Pod 各自有一份資料，但它們之間要不要同步、誰是主節點、主節點壞了誰接手，全都是資料庫軟體自己的事（或由專門管理那種資料庫的 Operator 處理）。把一個單機資料庫的 replicas 改成 3，得到的是三個互不相干的資料庫。' },
      ],
    },
    {
      id: 'kub08-s-backup', title: '資料備份與還原：PV 不是備份',
      blocks: [
        { type: 'callout', tone: 'warning', title: '有了 PersistentVolume，不等於有了備份', text: 'PV 讓資料撐過 Pod 的刪除與重建，但它只有一份。有人執行了錯誤的刪除指令、程式寫壞了資料、PVC 被刪掉而回收策略是 Delete、本機磁碟隨節點一起壞掉——這些情況 PV 都救不了。就算儲存系統在背後做了複製，複製的也是「已經被刪掉或寫壞的」資料。備份必須是另一份、放在叢集之外、而且還原過確定能用的副本。' },
        { type: 'p', text: '最基本的工具和 DKR07 一樣是 tar，只是改成透過 kubectl 傳輸。`kubectl exec stockdb-0 -- tar czf - /data > backup.tgz`：`-f -` 讓容器裡的 tar 把封存檔寫到標準輸出，kubectl 把它傳回工作站，由工作站的 Shell 重新導向到檔案。還原方向相反：`kubectl exec -i stockdb-0 -- tar xzf - -C / < backup.tgz`，`-i` 讓 kubectl 把工作站的標準輸入送進容器，少了它 tar 讀不到任何東西；`-C /` 讓封存檔裡的 `data/…`（tar 拿掉了開頭的 `/`）解到 `/data`。`kubectl cp` 是同一件事的捷徑，它在容器裡執行 tar，所以 Image 裡必須有 tar。' },
        { type: 'example', id: 'kub08-backup' },
        { type: 'p', text: '`tar: Removing leading `/\' from member names` 是 tar 的正常提醒，走標準錯誤，所以沒有混進封存檔；`tar tzvf` 在工作站上列出內容，是確認備份可用的第一步。沒有 `-i` 的還原失敗得很明顯（This does not look like a tar archive），但更危險的是那些「看起來成功」的錯誤，例如少了 `-C /`，檔案被解到容器的工作目錄底下。' },
        { type: 'table', head: ['方法', '怎麼做', '注意'], rows: [
          ['串流 tar', '`kubectl exec POD -- tar czf - /data > x.tgz`；還原加 `-i`', 'Image 要有 tar；執行中的資料庫直接複製檔案可能不一致'],
          ['`kubectl cp`', '`kubectl cp POD:/data ./backup`、`kubectl cp ./file POD:/data/file`', '一樣依賴容器裡的 tar；適合少量檔案'],
          ['資料庫自己的備份工具', '在 Pod 裡執行邏輯匯出（SQL dump 之類），輸出到叢集外', '在一致的快照上匯出；大部分資料庫的首選'],
          ['Volume 快照', 'CSI 驅動程式支援時，用 VolumeSnapshot 物件對 PV 做快照（課文說明）', '快照通常和原磁碟在同一個儲存系統，仍要複製到別處'],
          ['叢集層級的備份工具', '定期備份 manifest 與 Volume 到物件儲存（課文說明）', '還原整個命名空間時最方便'],
        ] },
        { type: 'p', text: '一致性是備份資料庫時最大的問題：資料庫寫到一半時複製它的檔案，得到的可能是一份打不開的資料。可以先停止寫入（例如把工作負載縮減到 0，再用一個掛著同一個 PVC 的臨時 Pod 做備份），或使用資料庫自己的匯出工具。還原也一樣，不要對正在執行的資料庫覆蓋它的資料檔，先停掉它，或像最後一題練習那樣還原到一個全新的 PVC，驗證之後再切換。最後，備份放在叢集之外（另一個儲存系統、另一個地點），並且定期實際還原一次：沒還原過的備份，只能算是希望。' },
      ],
    },
    {
      id: 'kub08-s-decide', title: '資料庫：放在叢集裡，還是用託管服務？',
      blocks: [
        { type: 'p', text: 'PV、StatefulSet、headless Service 讓 Kubernetes 能夠執行資料庫，但「能」不等於「該」。資料庫的難處不在啟動它，而在之後的每一天：備份、還原演練、版本升級、主從切換、磁碟快滿了、效能突然變差。託管的資料庫服務（雲端或機房平台提供的）把這些工作包下來，你付錢、換到的是別人的維運能力。誠實的比較如下：' },
        { type: 'table', head: ['面向', '在叢集裡自己執行', '託管的資料庫服務'], rows: [
          ['維運技能', '團隊要懂這種資料庫的調校、複製與故障處理，也要懂 Kubernetes 的儲存', '大部分由服務供應者處理，團隊專注在結構描述與查詢'],
          ['備份與時間點還原（PITR）', '自己設計、排程、存到叢集外並演練還原', '通常內建自動備份與還原到某個時間點'],
          ['版本升級', '自己規劃，常要搭配資料庫的升級程序與停機時間', '多半提供維護時段與較平順的升級流程'],
          ['故障轉移與高可用', '靠資料庫本身的複製或 Operator；節點、磁碟、網路故障都要自己測過', '多半提供跨區域的備援與自動切換'],
          ['儲存與效能', '取決於叢集的 StorageClass；本機磁碟快但綁節點，網路磁碟有延遲', '依方案提供，調整空間較少'],
          ['成本', '沒有服務費，但要算上人力與值班', '服務費較高，人力需求較低'],
          ['環境一致與可攜性', '開發、測試、正式環境同一套 manifest，容易在任何叢集重建', '各家服務不同，開發環境常要另外模擬'],
        ] },
        { type: 'p', text: '一個實用的判斷：開發、測試、預覽環境，或是可以重建的資料（快取、搜尋索引、能從別處重新匯入的資料），放在叢集裡很合理，快速、便宜、和正式環境一致。正式環境的關鍵資料，如果團隊沒有人能在半夜處理資料庫的故障、也沒有演練過還原，就交給託管服務；應用程式照樣跑在 Kubernetes，用 Secret（KUB06）存放連線資訊，透過網路連到資料庫。反過來，團隊有資料庫維運的經驗、有成熟的 Operator、或是在沒有託管服務可用的機房裡，在叢集裡執行資料庫也完全可行，只是要把上面表格裡的每一項都當成自己的責任。' },
        { type: 'table', head: ['想做的事', '指令'], rows: [
          ['看有哪些儲存可用', '`kubectl get sc`'],
          ['看申請與綁定', '`kubectl get pvc,pv`、`kubectl describe pvc 名稱`（Events）'],
          ['讀出 PVC 綁定的 PV', '`kubectl get pvc 名稱 -o jsonpath=\'{.spec.volumeName}\'`'],
          ['看 StatefulSet', '`kubectl get sts,pods,pvc -l app=stockdb`、`kubectl rollout status sts/stockdb`'],
          ['擴縮 StatefulSet', '改 manifest 的 `replicas` 再 apply，或 `kubectl scale sts stockdb --replicas=3`'],
          ['備份與還原', '`kubectl exec POD -- tar czf - /data > x.tgz`、`kubectl exec -i POD -- tar xzf - -C / < x.tgz`、`kubectl cp`'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  terminal: {
    machines: [WS, UPLOADS, REPORTS, DB, BACKUP],
    examples: [
      {
        id: 'kub08-lose', title: 'emptyDir 與可寫層：Pod 一刪，資料就沒了', machine: 'kub08-ws',
        description: 'scratch 把 /srv/uploads 掛成 emptyDir。在 Pod 裡寫一個檔案到 Volume、一個到 /tmp，刪掉 Pod 之後，Deployment 補上的新 Pod 兩邊都是空的。',
        steps: [
          { command: "tail -n 7 shop/scratch.yaml", output: "        image: shop/uploads:1.0\n        volumeMounts:\n        - name: files\n          mountPath: /srv/uploads\n      volumes:\n      - name: files\n        emptyDir: {}" },
          { command: "kubectl apply -f shop/scratch.yaml", output: "deployment.apps/scratch created" },
          { command: "kubectl rollout status deploy/scratch", output: "deployment \"scratch\" successfully rolled out" },
          { command: "POD=$(kubectl get pods -l app=scratch -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- sh -c 'echo photo-1 > /srv/uploads/p1.jpg; echo draft > /tmp/draft.txt'", output: "" },
          { command: "kubectl exec $POD -- ls /srv/uploads /tmp", output: "/srv/uploads:\np1.jpg\n\n/tmp:\ndraft.txt" },
          { command: "kubectl describe pod $POD | grep -A 4 '^Volumes'", output: "Volumes:\n  files:\n    Type:       EmptyDir (a temporary directory that shares a pod's lifetime)\n    Medium:     \n    SizeLimit:  <unset>" },
          { command: "kubectl delete pod $POD", output: "pod \"scratch-vb7l59pxht-8rcq8\" deleted" },
          { command: "kubectl rollout status deploy/scratch", output: "deployment \"scratch\" successfully rolled out" },
          { command: "POD=$(kubectl get pods -l app=scratch -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- ls /srv/uploads /tmp", output: "/srv/uploads:\n\n/tmp:" },
          { command: "kubectl get pods -l app=scratch", output: "NAME                       READY     STATUS    RESTARTS   AGE\nscratch-vb7l59pxht-bfm8d   1/1       Running   0          1s" },
        ],
      },
      {
        id: 'kub08-claim', title: '用 PVC 申請儲存，看它怎麼綁定', machine: 'kub08-ws',
        description: '預設 class local-path 是 WaitForFirstConsumer：PVC 先是 Pending，uploads 的 Pod 排到 node-01 之後才佈建 PV。PV 有 node-01 的 node affinity，刪掉 Pod 後新 Pod 回到 node-01，照片還在。最後一個 PVC 寫錯了 class 名稱。',
        steps: [
          { command: "kubectl get sc", output: "NAME                   PROVISIONER                    RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE\nfast                   disk.csi.example.com           Delete          Immediate              true                   29d\nlocal-path (default)   local.example.com/local-path   Delete          WaitForFirstConsumer   false                  29d" },
          { command: "cat shop/uploads-pvc.yaml", output: "apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: uploads-data\nspec:\n  accessModes:\n  - ReadWriteOnce\n  resources:\n    requests:\n      storage: 1Gi" },
          { command: "kubectl apply -f shop/uploads-pvc.yaml", output: "persistentvolumeclaim/uploads-data created" },
          { command: "kubectl get pvc", output: "NAME           STATUS    VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\nuploads-data   Pending                                       local-path     <unset>                 0s" },
          { command: "kubectl describe pvc uploads-data | tail -n 4", output: "Events:\n  Type    Reason                Age   From                         Message\n  ----    ------                ----  ----                         -------\n  Normal  WaitForFirstConsumer  0s    persistentvolume-controller  waiting for first consumer to be created before binding" },
          { command: "tail -n 3 shop/uploads.yaml", output: "      volumes:\n      - name: files\n        persistentVolumeClaim: {claimName: uploads-data}" },
          { command: "kubectl apply -f shop/uploads.yaml", output: "deployment.apps/uploads created" },
          { command: "kubectl rollout status deploy/uploads", output: "deployment \"uploads\" successfully rolled out" },
          { command: "kubectl get pvc,pv", output: "NAME                                 STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\npersistentvolumeclaim/uploads-data   Bound     pvc-d3b488c4-b54e-4900-bcb5-0d117d9b4393   1Gi        RWO            local-path     <unset>                 0s\n\nNAME                                                        CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS      CLAIM                  STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON    AGE\npersistentvolume/pv-media                                   5Gi        RWX            Retain           Available                                         <unset>                           21d\npersistentvolume/pvc-d3b488c4-b54e-4900-bcb5-0d117d9b4393   1Gi        RWO            Delete           Bound       default/uploads-data   local-path     <unset>                           0s" },
          { command: "kubectl describe pv $(kubectl get pvc uploads-data -o jsonpath='{.spec.volumeName}')", output: "Name:              pvc-d3b488c4-b54e-4900-bcb5-0d117d9b4393\nLabels:            <none>\nAnnotations:       pv.kubernetes.io/provisioned-by: local.example.com/local-path\nFinalizers:        [kubernetes.io/pv-protection]\nStorageClass:      local-path\nStatus:            Bound\nClaim:             default/uploads-data\nReclaim Policy:    Delete\nAccess Modes:      RWO\nVolumeMode:        Filesystem\nCapacity:          1Gi\nNode Affinity:     \n  Required Terms:  \n    Term 0:        kubernetes.io/hostname in [node-01]\nMessage:           \nSource:\n    Type:          HostPath (bare host directory volume)\n    Path:          /opt/local-path-provisioner/pvc-d3b488c4-b54e-4900-bcb5-0d117d9b4393_default_uploads-data\n    HostPathType:  DirectoryOrCreate\nEvents:            <none>" },
          { command: "POD=$(kubectl get pods -l app=uploads -o jsonpath='{.items[0].metadata.name}')", output: "" },
          { command: "kubectl exec $POD -- sh -c 'echo photo-1 > /srv/uploads/p1.jpg'", output: "" },
          { command: "kubectl delete pod $POD", output: "pod \"uploads-qfjpjh5fcz-tbgfr\" deleted" },
          { command: "kubectl rollout status deploy/uploads", output: "deployment \"uploads\" successfully rolled out" },
          { command: "kubectl get pods -l app=uploads -o wide", output: "NAME                       READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nuploads-qfjpjh5fcz-zbcbj   1/1       Running   0          1s        10.244.1.3   node-01   <none>           <none>" },
          { command: "kubectl exec $(kubectl get pods -l app=uploads -o jsonpath='{.items[0].metadata.name}') -- cat /srv/uploads/p1.jpg", output: "photo-1" },
          { command: "kubectl apply -f shop/typo-pvc.yaml", output: "persistentvolumeclaim/typo-data created" },
          { command: "kubectl get pvc typo-data", output: "NAME        STATUS    VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\ntypo-data   Pending                                       standard       <unset>                 0s" },
          { command: "kubectl describe pvc typo-data | tail -n 3", output: "  Type     Reason              Age   From                         Message\n  ----     ------              ----  ----                         -------\n  Warning  ProvisioningFailed  0s    persistentvolume-controller  storageclass.storage.k8s.io \"standard\" not found" },
        ],
      },
      {
        id: 'kub08-modes', title: '靜態綁定、Multi-Attach，以及 Delete 與 Retain', machine: 'kub08-ws',
        description: 'media 綁上管理者建立的 NFS PV；兩個 cache 副本共用一顆 RWO 網路磁碟，第二個節點掛不上。刪掉 PVC 之後，Delete 的 PV 連同照片消失，Retain 的 pv-media 變成 Released，清掉 claimRef 才能再綁定。',
        steps: [
          { command: "cat shop/media-pvc.yaml", output: "apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: media\nspec:\n  accessModes:\n  - ReadWriteMany\n  storageClassName: \"\"\n  resources:\n    requests:\n      storage: 2Gi" },
          { command: "kubectl apply -f shop/media-pvc.yaml", output: "persistentvolumeclaim/media created" },
          { command: "kubectl get pvc media", output: "NAME      STATUS    VOLUME     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\nmedia     Bound     pv-media   5Gi        RWX                           <unset>                 0s" },
          { command: "kubectl apply -f shop/cache.yaml", output: "persistentvolumeclaim/cache-data created\ndeployment.apps/cache created" },
          { command: "sleep 5", output: "" },
          { command: "kubectl get pods -l app=cache -o wide", output: "NAME                     READY     STATUS              RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\ncache-m8vdpmvdhm-64twd   0/1       ContainerCreating   0          5s        10.244.2.2   node-02   <none>           <none>\ncache-m8vdpmvdhm-nh7r2   1/1       Running             0          5s        10.244.1.2   node-01   <none>           <none>" },
          { command: "kubectl events --types=Warning", output: "LAST SEEN   TYPE      REASON               OBJECT                       MESSAGE\n5s          Warning   FailedAttachVolume   Pod/cache-m8vdpmvdhm-64twd   Multi-Attach error for volume \"pvc-658c874f-e053-4a71-a2b3-43a4ad21e9d8\" Volume is already used by pod(s) cache-m8vdpmvdhm-nh7r2" },
          { command: "kubectl apply -f shop/uploads-pvc.yaml -f shop/uploads.yaml", output: "persistentvolumeclaim/uploads-data created\ndeployment.apps/uploads created" },
          { command: "kubectl rollout status deploy/uploads", output: "deployment \"uploads\" successfully rolled out" },
          { command: "kubectl exec $(kubectl get pods -l app=uploads -o jsonpath='{.items[0].metadata.name}') -- sh -c 'echo photo-1 > /srv/uploads/p1.jpg'", output: "" },
          { command: "kubectl delete deploy uploads", output: "deployment.apps \"uploads\" deleted" },
          { command: "kubectl delete pvc uploads-data media", output: "persistentvolumeclaim \"uploads-data\" deleted\n（模擬環境：Pod uploads-qfjpjh5fcz-fjwhc 還在使用 uploads-data，它會停在 Terminating 直到這些 Pod 刪除；真實的 kubectl delete 會一直等待）\npersistentvolumeclaim \"media\" deleted" },
          { command: "sleep 2", output: "" },
          { command: "kubectl get pv", output: "NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS     CLAIM                STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON    AGE\npv-media                                   5Gi        RWX            Retain           Released   default/media                       <unset>                           21d\npvc-658c874f-e053-4a71-a2b3-43a4ad21e9d8   1Gi        RWO            Delete           Bound      default/cache-data   fast           <unset>                           7s" },
          { command: "kubectl apply -f shop/uploads-pvc.yaml -f shop/uploads.yaml", output: "persistentvolumeclaim/uploads-data created\ndeployment.apps/uploads created" },
          { command: "kubectl rollout status deploy/uploads", output: "deployment \"uploads\" successfully rolled out" },
          { command: "kubectl exec $(kubectl get pods -l app=uploads -o jsonpath='{.items[0].metadata.name}') -- ls /srv/uploads", output: "" },
          { command: "kubectl apply -f shop/media-pvc.yaml", output: "persistentvolumeclaim/media created" },
          { command: "kubectl get pvc media", output: "NAME      STATUS    VOLUME    CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\nmedia     Pending                                                      <unset>                 0s" },
          { command: "grep -n claimRef shop/pv-media.yaml", output: "11:  claimRef: null" },
          { command: "kubectl apply -f shop/pv-media.yaml", output: "persistentvolume/pv-media configured" },
          { command: "kubectl get pvc media", output: "NAME      STATUS    VOLUME     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\nmedia     Bound     pv-media   5Gi        RWX                           <unset>                 0s" },
        ],
      },
      {
        id: 'kub08-sts', title: 'StatefulSet：依序建立、固定名稱、每個 Pod 一個 PVC', machine: 'kub08-ws',
        description: 'stockdb 有 3 個副本與一個 headless Service。Pod 依序就緒，各自拿到 data-stockdb-N；刪掉 stockdb-1 後以同一個名稱回來，資料還在；縮減到 1 時從最大的序號刪起，PVC 全部保留。',
        steps: [
          { command: "tail -n 9 shop/stockdb.yaml", output: "          mountPath: /data\n  volumeClaimTemplates:\n  - metadata:\n      name: data\n    spec:\n      accessModes: [\"ReadWriteOnce\"]\n      resources:\n        requests:\n          storage: 1Gi" },
          { command: "kubectl apply -f shop/stockdb.yaml", output: "service/stockdb created\nstatefulset.apps/stockdb created" },
          { command: "sleep 4", output: "" },
          { command: "kubectl get pods -l app=stockdb", output: "NAME        READY     STATUS    RESTARTS   AGE\nstockdb-0   0/1       Running   0          4s" },
          { command: "kubectl rollout status sts/stockdb", output: "Waiting for 3 pods to be ready...\nWaiting for 2 pods to be ready...\nWaiting for 1 pods to be ready...\npartitioned roll out complete: 3 new pods have been updated..." },
          { command: "kubectl get sts,pods,pvc -l app=stockdb", output: "NAME                       READY     AGE\nstatefulset.apps/stockdb   3/3       15s\n\nNAME            READY     STATUS    RESTARTS   AGE\npod/stockdb-0   1/1       Running   0          15s\npod/stockdb-1   1/1       Running   0          9s\npod/stockdb-2   1/1       Running   0          3s\n\nNAME                                   STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\npersistentvolumeclaim/data-stockdb-0   Bound     pvc-18825f76-fa19-4169-b2f6-5e0adc7bc5c8   1Gi        RWO            local-path     <unset>                 15s\npersistentvolumeclaim/data-stockdb-1   Bound     pvc-b380607a-fff9-450c-bf42-0378e3464d27   1Gi        RWO            local-path     <unset>                 9s\npersistentvolumeclaim/data-stockdb-2   Bound     pvc-999ec3c9-176f-42d8-8558-6a479bc849a9   1Gi        RWO            local-path     <unset>                 3s" },
          { command: "kubectl get pods -l app=stockdb -o wide", output: "NAME        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nstockdb-0   1/1       Running   0          15s       10.244.1.2   node-01   <none>           <none>\nstockdb-1   1/1       Running   0          9s        10.244.2.2   node-02   <none>           <none>\nstockdb-2   1/1       Running   0          3s        10.244.1.3   node-01   <none>           <none>" },
          { command: "kubectl exec stockdb-0 -- getent hosts stockdb-2.stockdb", output: "10.244.1.3      stockdb-2.stockdb.default.svc.cluster.local" },
          { command: "kubectl exec stockdb-1 -- sh -c 'echo tea-oolong-150g,42 > /data/stock.csv'", output: "" },
          { command: "kubectl delete pod stockdb-1", output: "pod \"stockdb-1\" deleted" },
          { command: "kubectl get pods -l app=stockdb", output: "NAME        READY     STATUS    RESTARTS   AGE\nstockdb-0   1/1       Running   0          16s\nstockdb-1   0/1       Running   0          0s\nstockdb-2   1/1       Running   0          4s" },
          { command: "sleep 4", output: "" },
          { command: "kubectl get pods -l app=stockdb -o wide", output: "NAME        READY     STATUS    RESTARTS   AGE       IP           NODE      NOMINATED NODE   READINESS GATES\nstockdb-0   1/1       Running   0          20s       10.244.1.2   node-01   <none>           <none>\nstockdb-1   1/1       Running   0          4s        10.244.2.2   node-02   <none>           <none>\nstockdb-2   1/1       Running   0          8s        10.244.1.3   node-01   <none>           <none>" },
          { command: "kubectl exec stockdb-1 -- cat /data/stock.csv", output: "tea-oolong-150g,42" },
          { command: "kubectl scale sts stockdb --replicas=1", output: "statefulset.apps/stockdb scaled" },
          { command: "sleep 3", output: "" },
          { command: "kubectl get pods,pvc -l app=stockdb", output: "NAME            READY     STATUS    RESTARTS   AGE\npod/stockdb-0   1/1       Running   0          23s\n\nNAME                                   STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE\npersistentvolumeclaim/data-stockdb-0   Bound     pvc-18825f76-fa19-4169-b2f6-5e0adc7bc5c8   1Gi        RWO            local-path     <unset>                 23s\npersistentvolumeclaim/data-stockdb-1   Bound     pvc-b380607a-fff9-450c-bf42-0378e3464d27   1Gi        RWO            local-path     <unset>                 17s\npersistentvolumeclaim/data-stockdb-2   Bound     pvc-999ec3c9-176f-42d8-8558-6a479bc849a9   1Gi        RWO            local-path     <unset>                 11s" },
          { command: "kubectl events --for sts/stockdb | tail -n 2", output: "3s                 Normal    SuccessfulDelete   StatefulSet/stockdb   delete Pod stockdb-2 in StatefulSet stockdb successful\n2s                 Normal    SuccessfulDelete   StatefulSet/stockdb   delete Pod stockdb-1 in StatefulSet stockdb successful" },
        ],
      },
      {
        id: 'kub08-backup', title: '把 Volume 備份到工作站，再還原回去', machine: 'kub08-ws',
        description: '用 kubectl exec 串流 tar 把 stockdb-0 的 /data 存成工作站上的 backup/stockdb-0.tgz，再用 kubectl cp 複製單一檔案。資料被誤刪之後，沒有 -i 的還原失敗，加上 -i 才把封存檔送進容器。',
        steps: [
          { command: "kubectl apply -f shop/stockdb.yaml", output: "service/stockdb created\nstatefulset.apps/stockdb created" },
          { command: "kubectl rollout status sts/stockdb", output: "Waiting for 3 pods to be ready...\nWaiting for 2 pods to be ready...\nWaiting for 1 pods to be ready...\npartitioned roll out complete: 3 new pods have been updated..." },
          { command: "kubectl exec stockdb-0 -- sh -c 'echo tea-oolong-150g,42 > /data/stock.csv'", output: "" },
          { command: "mkdir backup", output: "" },
          { command: "kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz", output: "tar: Removing leading `/' from member names" },
          { command: "tar tzvf backup/stockdb-0.tgz", output: "drwxr-xr-x root/root         0 2026-11-24 10:00 data/\n-rw-r--r-- root/root         0 2026-11-24 10:00 data/STOCKDB_VERSION\n-rw-r--r-- root/root        19 2026-11-24 10:00 data/stock.csv" },
          { command: "kubectl cp stockdb-0:/data/stock.csv backup/stock.csv", output: "tar: Removing leading `/' from member names" },
          { command: "cat backup/stock.csv", output: "tea-oolong-150g,42" },
          { command: "kubectl exec stockdb-0 -- rm /data/stock.csv", output: "" },
          { command: "kubectl exec stockdb-0 -- tar xzf - -C / < backup/stockdb-0.tgz", output: "tar: This does not look like a tar archive\ntar: Exiting with failure status due to previous errors\ncommand terminated with exit code 2" },
          { command: "kubectl exec -i stockdb-0 -- tar xzvf - -C / < backup/stockdb-0.tgz", output: "data/\ndata/STOCKDB_VERSION\ndata/stock.csv" },
          { command: "kubectl exec stockdb-0 -- cat /data/stock.csv", output: "tea-oolong-150g,42" },
        ],
      },
    ],
    exercises: [
      {
        id: 'kub08-ex-persist', title: '讓 uploads 的檔案撐過 Pod 的刪除', machine: 'kub08-uploads',
        statement: 'uploads 的 Deployment 把上傳的檔案放在 emptyDir。改用持久儲存：在 `~/shop/uploads-pvc.yaml` 寫一個 PVC 並套用，名稱 `uploads-data`、1Gi、`ReadWriteOnce`、使用叢集的預設 StorageClass；把 `~/shop/uploads.yaml` 裡名為 files 的 Volume 從 `emptyDir: {}` 改成這個 PVC（例如 `persistentVolumeClaim: {claimName: uploads-data}`）再套用，等新的 Pod 就緒。接著證明資料留得住：在新 Pod 裡寫入 `/srv/uploads/check.txt`（內容 `kept`），刪掉這個 Pod，等 Deployment 補上的 Pod 就緒，它也要看得到這個檔案。Pod 名稱帶有雜湊，請從 `kubectl get` 讀取。',
        checks: [
          { kind: 'exists', path: '/home/yuki/shop/uploads-pvc.yaml', type: 'file' },
          { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'uploads-data', phase: 'Bound', storageClass: 'local-path', capacity: '1Gi', accessModes: ['ReadWriteOnce'] },
          { kind: 'kube-object', resource: 'Deployment', name: 'uploads', fields: [{ path: '.spec.template.spec.volumes[0].persistentVolumeClaim.claimName', equals: 'uploads-data' }] },
          { kind: 'kube-pod', selector: 'app=uploads', count: 1, status: 'Running', ready: true, file: { path: '/srv/uploads/check.txt', content: 'kept' } },
        ],
        solution: ['kubectl get sc', heredoc('shop/uploads-pvc.yaml', PVC_UPLOADS), 'kubectl apply -f shop/uploads-pvc.yaml', TO_CLAIM, 'kubectl apply -f shop/uploads.yaml', 'kubectl rollout status deploy/uploads', 'sleep 2',
          `kubectl exec ${podOf('uploads')} -- sh -c 'echo kept > /srv/uploads/check.txt'`, `kubectl delete pod ${podOf('uploads')}`, 'kubectl rollout status deploy/uploads', `kubectl exec ${podOf('uploads')} -- cat /srv/uploads/check.txt`],
        mistakes: [
          { commands: [`kubectl exec ${podOf('uploads')} -- sh -c 'echo kept > /srv/uploads/check.txt'`, `kubectl delete pod ${podOf('uploads')}`, 'kubectl rollout status deploy/uploads'], why: '還是 emptyDir：新的 Pod 拿到一個全新的空資料夾，check.txt 不見了，也沒有建立 PVC' },
          { commands: [heredoc('shop/uploads-pvc.yaml', PVC_UPLOADS), 'kubectl apply -f shop/uploads-pvc.yaml', 'sleep 5'], why: '只建立了 PVC，Deployment 還在用 emptyDir；local-path 是 WaitForFirstConsumer，沒有 Pod 使用時 PVC 一直是 Pending' },
          { commands: [heredoc('shop/uploads-pvc.yaml', PVC_UPLOADS.replace('spec:\n', 'spec:\n  storageClassName: standard\n')), 'kubectl apply -f shop/uploads-pvc.yaml', TO_CLAIM, 'kubectl apply -f shop/uploads.yaml', 'sleep 5'], why: '叢集沒有名為 standard 的 StorageClass，PVC 卡在 Pending，新的 Pod 也排不上去' },
          { commands: [TO_CLAIM, 'kubectl apply -f shop/uploads.yaml', 'sleep 5'], why: 'Deployment 指向一個不存在的 PVC：新的 Pod 停在 Pending（persistentvolumeclaim "uploads-data" not found），舊的 Pod 也還在' },
        ],
        hints: [
          'PVC 的骨架是 `apiVersion: v1`、`kind: PersistentVolumeClaim`、`metadata.name`，`spec` 底下有 `accessModes`（清單）與 `resources.requests.storage`；不寫 `storageClassName` 就會用預設的 class。',
          '`sed -i \'s/emptyDir: {}/persistentVolumeClaim: {claimName: uploads-data}/\' shop/uploads.yaml` 只改那一行；改完 `kubectl apply -f`，再 `kubectl rollout status deploy/uploads`。',
          '換版時舊 Pod 會短暫停在 Terminating，等一兩秒再用 `kubectl get pods -l app=uploads -o jsonpath=\'{.items[0].metadata.name}\'` 取名稱；寫入用 `kubectl exec 名稱 -- sh -c \'echo kept > /srv/uploads/check.txt\'`。',
        ],
        explanation: 'emptyDir 的壽命就是 Pod，所以要改用 PVC。PVC uploads-data 沒有寫 `storageClassName`，建立時拿到預設的 local-path；它是 WaitForFirstConsumer，要等 Deployment 改用它、新的 Pod 被排到某個節點之後，provisioner 才在那個節點建立 PV，PVC 變成 Bound。`sed` 把 Volume 換成 `persistentVolumeClaim: {claimName: uploads-data}`，`kubectl apply` 觸發一次換版，`rollout status` 等新 Pod 就緒。之後寫入的 check.txt 存在 PV 上，刪掉 Pod，ReplicaSet 補上的新 Pod 掛上同一個 PVC（local-path 的 node affinity 讓它回到同一個節點），檔案還在。只建立 PVC 而不改 Deployment，PVC 會一直等第一個使用者；只改 Deployment 而不建立 PVC，新的 Pod 排不上去；寫錯 class 名稱則 PVC 永遠佈建不出來。',
      },
      {
        id: 'kub08-ex-pending', title: '修好卡在 Pending 的 PVC', machine: 'kub08-reports',
        statement: 'reports 半小時前上線，它的 Pod 到現在還是 Pending。找出原因並修好：PVC `reports-data` 要改用叢集的預設 StorageClass，`~/shop/reports.yaml` 也要一起改好（拿掉寫錯的 `storageClassName` 這一行，讓預設 class 生效），最後 reports-data 是 Bound、reports 的 Pod 是 Running。最後一個指令只印出 reports-data 現在使用的 StorageClass 名稱（例如 `local-path`），不要有其他文字。請從叢集讀取，不要寫死：同一串指令會在另外兩個叢集重播，那裡的預設 class 與 PVC 寫錯的名稱都不同。',
        checks: [
          { kind: 'content', path: '/home/yuki/shop/reports.yaml', content: pvc('reports-data', null) + '---\n' + uploads('reports', 1, 'persistentVolumeClaim: {claimName: reports-data}') },
          { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'reports-data', phase: 'Bound' },
          { kind: 'kube-pod', selector: 'app=reports', count: 1, status: 'Running', ready: true },
          { kind: 'output', fromCommand: '^kubectl get ' },
        ],
        solution: ['kubectl describe pvc reports-data | tail -n 3', 'kubectl get sc', "sed -i '/storageClassName/d' shop/reports.yaml", 'kubectl delete -f shop/reports.yaml', 'kubectl apply -f shop/reports.yaml', 'kubectl rollout status deploy/reports',
          "kubectl get pvc reports-data -o jsonpath='{.spec.storageClassName}'"],
        mistakes: [
          { commands: ["sed -i '/storageClassName/d' shop/reports.yaml", 'kubectl apply -f shop/reports.yaml', "kubectl get pvc reports-data -o jsonpath='{.spec.storageClassName}'"], why: 'PVC 的 spec 建立後不能修改，apply 被拒絕（spec is immutable），PVC 仍然要那個不存在的 class' },
          { commands: ['kubectl delete pod -l app=reports', 'sleep 10', "kubectl get pvc reports-data -o jsonpath='{.spec.storageClassName}'"], why: '問題在 PVC 而不是 Pod：補上的新 Pod 一樣等不到 PVC 綁定' },
          { commands: ["sed -i 's/standard/local-path/' shop/reports.yaml", 'kubectl delete -f shop/reports.yaml', 'kubectl apply -f shop/reports.yaml', 'kubectl rollout status deploy/reports', "kubectl get pvc reports-data -o jsonpath='{.spec.storageClassName}'"], why: '把錯的名稱寫死成 standard→local-path：在另外兩個叢集，PVC 寫錯的名稱與預設 class 都不同，這行 sed 什麼也沒改' },
          { commands: ["sed -i '/storageClassName/d' shop/reports.yaml", 'kubectl delete -f shop/reports.yaml', 'kubectl apply -f shop/reports.yaml', 'kubectl rollout status deploy/reports', 'echo local-path'], why: '修好了，但最後直接打出答案而不是從叢集讀取；在預設 class 不是 local-path 的叢集就錯了' },
        ],
        variants: [
          reportsVariant('預設 class 是 node-disk、PVC 寫成 ssd 的叢集', [{ text: NODE_DISK, at: '2026-10-25 10:30:00', file: 'node-disk.yaml' }, { text: FAST, at: '2026-10-25 10:31:00', file: 'fast.yaml' }], 'ssd'),
          reportsVariant('預設 class 是 fast、PVC 寫成 premium 的叢集', [{ text: LOCAL_PATH_PLAIN, at: '2026-10-25 10:30:00', file: 'local-path.yaml' }, { text: FAST_DEFAULT, at: '2026-10-25 10:31:00', file: 'fast.yaml' }], 'premium'),
        ],
        hints: [
          '`kubectl describe pvc reports-data` 的 Events 說明為什麼佈建不出來；`kubectl get sc` 列出叢集有哪些 class，預設的那個標著 `(default)`。',
          'PVC 的 spec 不能修改，只能刪掉再建立；它還沒有綁定，裡面沒有資料。`kubectl delete -f shop/reports.yaml` 會連同使用它的 Deployment 一起刪除，改好檔案再 `kubectl apply -f`。',
          '`kubectl get pvc reports-data -o jsonpath=\'{.spec.storageClassName}\'` 只印出 class 名稱。',
        ],
        explanation: 'reports-data 的 `storageClassName` 寫了叢集沒有的 class，事件是 ProvisioningFailed：storageclass … not found；Pod 因為 PVC 沒有綁定而排不上去。PVC 的 spec 建立之後不能修改，所以改檔案再 apply 只會被拒絕；要刪掉 PVC 再建立，而還沒綁定的 PVC 沒有資料，刪掉沒有損失。`sed -i \'/storageClassName/d\'` 拿掉那一行，PVC 建立時就會由 DefaultStorageClass admission 填上預設的 class，不論那個叢集的預設叫 local-path、node-disk 還是 fast 都適用。`kubectl delete -f` 刪掉 PVC 與 Deployment，`kubectl apply -f` 重新建立，`rollout status` 等 Pod 就緒，最後用 jsonpath 讀出 PVC 實際拿到的 class。把錯的名稱寫死替換，在別的叢集就對不上；直接 echo 答案也一樣。',
      },
      {
        id: 'kub08-ex-scale', title: '把 stockdb 擴充成 3 個副本', machine: 'kub08-db',
        statement: '庫存資料庫 stockdb 是 StatefulSet，目前 1 個副本。用宣告式的方式擴充成 3 個：把 `~/shop/stockdb.yaml` 的 `replicas` 改成 3（檔案的其他內容不變）並套用，等到 3 個 Pod 都就緒。StatefulSet 是 OrderedReady：前一個 Pod 就緒之後才會建立下一個，新節點還要先拉取 Image。完成後 stockdb-1 與 stockdb-2 都要有自己的 PVC（`data-stockdb-1`、`data-stockdb-2`）並且是 Bound。',
        checks: [
          { kind: 'content', path: '/home/yuki/shop/stockdb.yaml', content: stockdb(3) },
          { kind: 'kube-workload', resource: 'StatefulSet', name: 'stockdb', replicas: 3, readyReplicas: 3 },
          { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'data-stockdb-1', phase: 'Bound', storageClass: 'local-path' },
          { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'data-stockdb-2', phase: 'Bound', storageClass: 'local-path' },
          { kind: 'kube-pod', name: 'stockdb-2', status: 'Running', ready: true },
        ],
        solution: ['kubectl get sts,pods,pvc -l app=stockdb', "sed -i 's/replicas: 1/replicas: 3/' shop/stockdb.yaml", 'kubectl apply -f shop/stockdb.yaml', 'kubectl rollout status sts/stockdb', 'kubectl get pods,pvc -l app=stockdb'],
        mistakes: [
          { commands: ['kubectl scale sts stockdb --replicas=3', 'kubectl rollout status sts/stockdb'], why: '叢集變成 3 個，但 manifest 還寫著 1：下次照 manifest apply 就會縮回 1 個' },
          { commands: ["sed -i 's/replicas: 1/replicas: 3/' shop/stockdb.yaml", 'kubectl apply -f shop/stockdb.yaml'], why: '套用之後沒有等待：OrderedReady 一次只建立一個 Pod，檢查時 stockdb-1 還在拉取 Image，stockdb-2 與它的 PVC 還沒出現' },
          { commands: ["sed -i 's/replicas: 1/replicas: 3/' shop/stockdb.yaml", 'kubectl apply -f shop/stockdb.yaml', 'sleep 3'], why: '等得不夠久：stockdb-1 拉完 Image 之後，readiness 探針還要 3 秒才通過，stockdb-2 才會建立' },
          { commands: ["sed -i 's/replicas: 1/replicas: 3/' shop/stockdb.yaml", 'kubectl scale deploy/stockdb --replicas=3', 'sleep 20'], why: 'stockdb 不是 Deployment，`kubectl scale deploy/stockdb` 找不到它；改好的 manifest 也沒有套用' },
        ],
        hints: [
          '`grep -n replicas shop/stockdb.yaml` 看目前的數字，`sed -i \'s/replicas: 1/replicas: 3/\' shop/stockdb.yaml` 修改它。',
          '`kubectl apply -f shop/stockdb.yaml` 之後，`kubectl rollout status sts/stockdb` 會等到所有 Pod 都就緒。',
          '`kubectl get pods,pvc -l app=stockdb` 看每個 Pod 與它的 PVC。',
        ],
        explanation: 'StatefulSet 的 `spec.replicas` 改成 3 並套用之後，controller 依序工作：先替序號 1 建立 PVC data-stockdb-1、再建立 Pod stockdb-1；stockdb-1 被排到還沒有 Image 的節點，拉取 3 秒，readiness 探針再 3 秒通過，controller 才建立 data-stockdb-2 與 stockdb-2。local-path 是 WaitForFirstConsumer，每個 PVC 在自己的 Pod 排程之後才綁定到那個節點的 PV。`kubectl rollout status sts/stockdb` 等到 3 個 Pod 都就緒。只用 `kubectl scale` 會讓 manifest 與叢集不一致；套用之後不等待，或只等幾秒，檢查時後面的 Pod 還沒建立；把它當成 Deployment 操作則找不到物件。',
      },
      {
        id: 'kub08-ex-backup', title: '把 stockdb-0 備份到工作站，再還原到新的 PVC', machine: 'kub08-backup',
        statement: 'stockdb-0 的資料在 node-02 的一顆本機磁碟上（local PV），節點要汰換，團隊想先確認備份真的能用。完成兩件事：第一，把 stockdb-0 的整個 `/data` 備份到工作站的 `~/backup/stockdb-0.tgz`（tar + gzip，透過 `kubectl exec` 串流到工作站，不要把備份檔留在 Pod 裡）；第二，套用 `~/shop/restore.yaml`（新的 PVC `restore-data` 與 Pod `stockdb-restore`，`/data` 掛著這個 PVC），等它執行之後把備份還原進去，讓 stockdb-restore 的 `/data/stock.csv` 與 `/data/wal/000001.log` 和 stockdb-0 的一樣。',
        checks: [
          { kind: 'exists', path: '/home/yuki/backup/stockdb-0.tgz', type: 'file' },
          { kind: 'kube-volume', resource: 'PersistentVolumeClaim', name: 'restore-data', phase: 'Bound' },
          { kind: 'kube-pod', name: 'stockdb-restore', status: 'Running', file: { path: '/data/stock.csv', content: 'tea-black-100g,taipei,17' } },
          { kind: 'kube-pod', name: 'stockdb-restore', file: { path: '/data/wal/000001.log', content: 'put cup-glass-300ml 8' } },
        ],
        solution: ['mkdir -p backup', 'kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz', 'tar tzvf backup/stockdb-0.tgz', 'kubectl apply -f shop/restore.yaml', 'kubectl wait --for=condition=Ready pod/stockdb-restore --timeout=60s',
          'kubectl exec -i stockdb-restore -- tar xzf - -C / < backup/stockdb-0.tgz', 'kubectl exec stockdb-restore -- cat /data/stock.csv'],
        mistakes: [
          { commands: ['kubectl exec stockdb-0 -- tar czf /data/stockdb-0.tgz /data', 'kubectl apply -f shop/restore.yaml', 'sleep 5'], why: '備份檔寫在 stockdb-0 自己的 Volume 裡，和資料在同一顆磁碟上，工作站沒有備份，新的 PVC 也是空的' },
          { commands: ['mkdir -p backup', 'kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz', 'kubectl apply -f shop/restore.yaml', 'sleep 5', 'kubectl exec stockdb-restore -- tar xzf - -C / < backup/stockdb-0.tgz'], why: '還原時少了 -i：kubectl 沒有把工作站的標準輸入送進容器，tar 讀不到封存檔' },
          { commands: ['mkdir -p backup', 'kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz', 'kubectl apply -f shop/restore.yaml', 'sleep 5', 'kubectl exec -i stockdb-restore -- tar xzf - < backup/stockdb-0.tgz'], why: '少了 -C /：封存檔裡的 data/… 被解到容器的工作目錄 /app 底下，/data 裡沒有 stock.csv' },
          { commands: ['mkdir -p backup', 'kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz', 'kubectl apply -f shop/restore.yaml', 'kubectl exec -i stockdb-restore -- tar xzf - -C / < backup/stockdb-0.tgz'], why: '套用之後立刻還原：新 Pod 還在拉取 Image，容器還不存在（container not found），什麼都沒有還原' },
        ],
        hints: [
          '`kubectl exec stockdb-0 -- tar czf - /data > backup/stockdb-0.tgz`：`-f -` 把封存檔寫到標準輸出，`>` 是工作站的重新導向；先 `mkdir -p backup`。`tar tzvf backup/stockdb-0.tgz` 可以確認內容。',
          '`kubectl apply -f shop/restore.yaml` 之後，用 `kubectl wait --for=condition=Ready pod/stockdb-restore --timeout=60s` 等它執行。',
          '還原：`kubectl exec -i stockdb-restore -- tar xzf - -C / < backup/stockdb-0.tgz`。`-i` 傳送標準輸入，`-C /` 讓 data/… 解到 /data。',
        ],
        explanation: '`kubectl exec stockdb-0 -- tar czf - /data` 讓容器裡的 tar 把 /data 打包成 gzip 封存檔、寫到標準輸出，kubectl 把它傳回工作站，`> backup/stockdb-0.tgz` 存成檔案；tar 拿掉開頭的 `/`，成員是 `data/stock.csv`、`data/wal/000001.log` 這樣的相對路徑。restore.yaml 建立新的 PVC restore-data（預設的 local-path，Pod 排程後綁定）與掛著它的 stockdb-restore；`kubectl wait` 等到 Pod 就緒，`kubectl exec -i … -- tar xzf - -C /` 把工作站的封存檔從標準輸入送進容器，解到 `/` 底下，也就是 PVC 掛載的 /data。這樣不只有了叢集外的備份，也證明了它還原得回來。把備份檔放在同一個 Volume 不算備份；少了 `-i` 容器收不到資料；少了 `-C /` 檔案解到錯的地方；Pod 還沒執行就 exec 會找不到容器。',
      },
    ],
  },
  quiz: [
    {
      id: 'kub08-q1', prompt: '一個 Pod 把快取寫在 `emptyDir`。下列哪一件事發生後，快取裡的檔案還在？',
      options: ['Pod 被 `kubectl delete` 之後，Deployment 補上的新 Pod', '容器當掉、被 kubelet 在同一個 Pod 裡重新啟動', '節點被排空，Pod 在另一個節點重建', 'Deployment 換了新版的 Image，完成滾動更新'],
      answer: 1,
      explanation: 'emptyDir 的壽命是 Pod：容器在同一個 Pod 裡重新啟動時它還在，所以第二個選項正確。刪除 Pod、排空節點後在別處重建、滾動更新換掉 Pod，都是建立新的 Pod，新的 Pod 會拿到一個全新的空 emptyDir，原本的檔案隨舊 Pod 一起刪除。',
    },
    {
      id: 'kub08-q2', prompt: '套用一個只有 PVC 的 manifest 之後，`kubectl describe pvc` 顯示 Pending，事件是 `WaitForFirstConsumer`。該怎麼解讀？',
      options: ['provisioner 壞了，要請管理者重新安裝儲存外掛', 'PVC 寫錯了 StorageClass 名稱，要刪掉重建', '叢集沒有足夠的磁碟空間，要先擴充節點', '這是正常的：class 採延遲綁定，等使用它的 Pod 排程後才佈建'],
      answer: 3,
      explanation: 'WaitForFirstConsumer 的 class 會等第一個使用它的 Pod 被排程，再到那個節點（或區域）佈建，所以只有 PVC 時停在 Pending 是預期的行為。provisioner 沒在執行時只會看到 ExternalProvisioning；寫錯 class 名稱的事件是 ProvisioningFailed 的 not found；容量不足不會以這個事件表示。',
    },
    {
      id: 'kub08-q3', prompt: '一個 PVC 的存取模式是 `ReadWriteOnce`，綁定的是網路磁碟。下列敘述何者正確？',
      options: ['它一次只能被一個節點以讀寫掛載，排在同一個節點上的多個 Pod 可以一起使用', '整個叢集一次只能有一個 Pod 使用它，第二個 Pod 一定會被拒絕', '只能寫入一次，之後就變成唯讀', '任何節點上的多個 Pod 都能同時讀寫，Once 指的是只能建立一次'],
      answer: 0,
      explanation: 'RWO 的單位是節點：磁碟一次只能 attach 到一個節點，那個節點上的 Pod 都能用，另一個節點上的 Pod 會遇到 Multi-Attach error。「只給一個 Pod」是 ReadWriteOncePod（RWOP）；RWO 和寫入次數無關；多個節點同時讀寫是 ReadWriteMany。',
    },
    {
      id: 'kub08-q4', prompt: 'StorageClass 的 `reclaimPolicy` 是 Delete。同事為了清理資源執行 `kubectl delete pvc orders-data`，接下來會發生什麼？',
      options: ['PVC 刪除了，但 PV 與資料都留著，之後可以再綁定', 'PV 變成 Released，資料保留到管理者手動清除', 'PV 與底層磁碟一起被刪除，資料無法復原', 'API server 拒絕刪除，因為 PVC 上還有資料'],
      answer: 2,
      explanation: 'Delete 策略下，PVC 一旦真的刪除（pvc-protection 會等使用它的 Pod 消失），provisioner 就刪掉 PV 與底層磁碟，資料無法復原，所以第三個選項正確。PV 變成 Released、資料留著的是 Retain；API server 不會因為裡面有資料而拒絕刪除。重要資料要用 Retain，並且另有叢集外的備份。',
    },
    {
      id: 'kub08-q5', prompt: 'StatefulSet web 有 3 個副本，`persistentVolumeClaimRetentionPolicy` 用預設值。`kubectl scale sts web --replicas=1` 之後再擴充回 3 個，結果是？',
      options: ['縮減時 data-web-1 與 data-web-2 被刪除，再擴充時建立兩個新的空 PVC', '縮減被拒絕，因為 StatefulSet 的 Pod 都有 PVC', '縮減時刪掉 web-0 與 web-1，留下最新的 web-2', 'web-2、web-1 依序被刪，但它們的 PVC 保留；再擴充時同一個序號拿回原本的 PVC 與資料'],
      answer: 3,
      explanation: '縮減從最大的序號開始一個一個刪，所以先刪 web-2 再刪 web-1，留下 web-0。預設的保留策略是 whenScaled: Retain，PVC 不會被刪，再擴充時 web-1、web-2 以同樣的名稱掛回 data-web-1、data-web-2。要自動刪除 PVC 必須設定 Delete；有 PVC 不會讓縮減被拒絕。',
    },
    {
      id: 'kub08-q6', prompt: '團隊把一個資料庫寫成 3 個副本的 Deployment，三個 Pod 共用同一個 RWO 網路磁碟的 PVC。最可能的結果與正確的改法是？',
      options: ['三個 Pod 會由 Kubernetes 自動分工成一個寫入、兩個唯讀，所以什麼都不必改', 'Pod 卡在 Multi-Attach；改用 StatefulSet，每個 Pod 一個 PVC', '把 PVC 的存取模式改成 ReadWriteMany 再 apply，三個副本就能安全地共用它', '把 replicas 改成 3 以上的奇數，讓三個副本以多數決的方式避免寫入衝突'],
      answer: 1,
      explanation: 'RWO 的網路磁碟一次只能 attach 到一個節點，別的節點上的副本會卡在 Multi-Attach；就算都在同一個節點，三個資料庫程序同時使用同一份資料檔也會互相衝突，輕則啟動失敗，重則損毀資料。StatefulSet 讓每個副本有自己的 PVC，副本之間的同步則是資料庫的工作。Kubernetes 不會替 Pod 分工；PVC 的存取模式建立後不能修改，而且多數區塊磁碟不支援 RWX；副本數是奇數和這個問題無關。',
    },
    {
      id: 'kub08-q7', prompt: '下列哪一個做法，才算是 stockdb 的資料「有備份」？',
      options: ['定期把 tar 封存檔存到叢集外的儲存，並實際還原測試過', '把 StorageClass 改成 Retain', '每天在同一個 Volume 裡打包 `/data/backup.tgz`', '把 StatefulSet 擴充成 3 個副本'],
      answer: 0,
      explanation: '備份是另一份、放在別處、而且還原過的副本，第一個選項三者都符合。Retain 只防止刪除 PVC 時順便刪掉磁碟，擋不住寫壞或誤刪資料；同一個 Volume 裡的封存檔會和資料一起損毀；三個 StatefulSet 副本各自是獨立的資料，也沒有替彼此保存歷史版本。',
    },
    {
      id: 'kub08-q8', prompt: '一個三人的小團隊要上線訂單系統的正式資料庫，沒有人做過資料庫的故障處理，需求包括每日備份與還原到任意時間點。比較合理的選擇是？',
      options: ['在叢集裡用 StatefulSet 執行，因為 Kubernetes 會自動處理備份與故障轉移', '直接用 Deployment 加上一個 emptyDir，最簡單', '應用程式放在 Kubernetes，資料庫使用託管服務，連線資訊放在 Secret', '把資料庫放在一個節點的 hostPath，故障時手動處理'],
      answer: 2,
      explanation: '團隊缺乏資料庫維運經驗，又需要時間點還原，託管服務能把備份、PITR、升級與故障轉移交給供應者，應用程式照樣在 Kubernetes 執行。StatefulSet 只提供身分與儲存，備份與故障轉移仍要自己做；emptyDir 隨 Pod 消失；hostPath 綁死在一個節點，故障時資料可能整個失去。',
    },
  ],
};
