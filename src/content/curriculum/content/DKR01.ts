import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalContainer, TerminalImage } from '@/lib/terminal/docker-lesson';
import type { TerminalFile, TerminalMachine, TerminalVariant } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * DKR01 Containers vs Virtual Machines (DKR-1, network-sequence; the blueprint's architecture-diagram activity drawn as a
 * network scene, not the database island's content.ops). A terminal lesson on the containers profile (engine stage E20)
 * beside one network-protocol scene. The terminal part observes one Docker host, rent-01 (Ubuntu 24.04, kernel
 * 6.8.0-49-generic), running the team's booking API in a container: docker version (the client and the daemon,
 * containerd, runc, docker-init), dockerd and containerd as ordinary host processes, the container's own process list
 * (uvicorn as PID 1) against the host's ps aux (/sbin/init as PID 1), a second container whose PID 1 is sleep, the UTS,
 * mount and network namespaces seen through hostname, /etc/os-release and the container's bridge address, the shared
 * kernel through uname -r and docker info (Kernel Version, Cgroup Driver, Cgroup Version), and image sizes. The network
 * part: the same request to the old deployment on a virtual machine (its own Debian kernel behind KVM) and to the new
 * one in a container (Docker's NAT rule in the host kernel, the docker0 bridge and a veth pair into the container's
 * network namespace), with each side's software stack as a node table.
 *
 * Text only (the engine does not model them, and no output is invented for them): namespaces, cgroups, overlay2, runc
 * and the hypervisor. Engine limits met and worked around: the simulated host's ps does not list the containers'
 * processes (a real host does, with host PIDs; the lesson says so); the simulated containers have no uname (the kernel
 * is read on the host and from docker info, and the lesson says a real container prints the host's release);
 * `docker run IMAGE ps` prints two ps lines in the engine, so PID 1 is shown with docker exec instead; docker info
 * ignores --format, so it is not suggested. Start-up times are described qualitatively. The bike shop, host names,
 * users, images and the private 192.168.10.0/24 addresses are made up. Every transcript output was produced by
 * replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });

const HOST_IP = '192.168.10.30', VM_IP = '192.168.10.21', LAPTOP_IP = '192.168.10.5', CTR_IP = '172.17.0.2';
const KERNEL = '6.8.0-49-generic', VM_KERNEL = '6.1.0-28-amd64';

const PATH_ENV = 'PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin';
const DEBIAN = 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nID=debian\n';
const ALPINE = 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.21.0\nPRETTY_NAME="Alpine Linux v3.21"\n';
const UBUNTU_2204 = 'PRETTY_NAME="Ubuntu 22.04.5 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION="22.04.5 LTS (Jammy Jellyfish)"\nID=ubuntu\nID_LIKE=debian\n';
const HOST_OS = 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nID=ubuntu\nID_LIKE=debian\n';
const UVICORN_LOGS = [
  { text: 'INFO:     Started server process [1]', stream: 2 as const },
  { text: 'INFO:     Waiting for application startup.', stream: 2 as const },
  { text: 'INFO:     Application startup complete.', stream: 2 as const },
  { text: 'INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)', stream: 2 as const },
];
/** The team's API image (built on another machine, only local here): Debian 12, Python 3.12.7, procps installed. */
const api = (name: string, osRelease: string): TerminalImage => ({
  name, size: 163274240, created: '2026-11-20 08:30:00', cmd: ['uvicorn', 'booking.main:app', '--host', '0.0.0.0', '--port', '8000'],
  env: [PATH_ENV, 'LANG=C.UTF-8', 'PYTHON_VERSION=3.12.7'], workdir: '/app', expose: [8000], http: { port: 8000, responder: 'booking-api' }, service: true,
  logs: UVICORN_LOGS, commands: ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'],
  files: [{ path: '/app/requirements.txt', content: 'fastapi==0.115.5\nuvicorn==0.32.1\n' }], osRelease, layers: 6, pulled: true, registry: false,
});
const ALPINE_IMAGE: TerminalImage = {
  name: 'alpine:3.21', size: 7834520, created: '2026-10-08 12:00:00', cmd: ['/bin/sh'], pulled: true, layers: 1, osRelease: ALPINE,
  commands: ['ls', 'cat', 'echo', 'env', 'ps', 'sh', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'],
};
/** The official ubuntu image has no procps (no ps), like the real one. */
const UBUNTU_IMAGE: TerminalImage = {
  name: 'ubuntu:24.04', size: 78118263, created: '2026-10-15 08:00:00', cmd: ['/bin/bash'], pulled: true, layers: 1,
  osRelease: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n',
  commands: ['ls', 'cat', 'echo', 'env', 'sh', 'bash', 'sleep', 'true', 'false', 'pwd', 'cd', 'head', 'tail', 'grep', 'wc', 'hostname'],
};
const apiContainer = (image: string): TerminalContainer => ({
  name: 'api', image, state: 'running', created: '2026-11-22 09:40:00', started: '2026-11-22 09:40:01', ports: ['8080:8000'],
});

const host: TerminalMachine = {
  id: 'dkr01-host', title: '山嵐單車的 Docker 主機 rent-01', user: 'learner', cwd: '/home/learner', host: 'rent-01', profile: 'containers', cpus: 2,
  system: { release: KERNEL, version: '#49-Ubuntu SMP PREEMPT_DYNAMIC' },
  interfaces: [{ name: 'eth0', address: `${HOST_IP}/24` }], address: HOST_IP,
  files: [dir('/etc'), file('/etc/os-release', HOST_OS), dir('/home'), dir('/home/learner', 'learner')],
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'docker', gid: 988, members: ['learner'] }] },
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 13100 },
    { pid: 640, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', rss: 9100, listen: [{ port: 22, fd: 3, backlog: 128 }] },
  ],
  responders: [{ id: 'booking-api', server: 'uvicorn', routes: [{ path: '/health', type: 'application/json', body: '{"status":"ok"}' }] }],
  docker: { images: [api('rentbike/api:2.3', DEBIAN), ALPINE_IMAGE, UBUNTU_IMAGE], containers: [apiContainer('rentbike/api:2.3')] },
};

/** The same host where api was rebuilt on another base image (its userland changes; the host stays Ubuntu 24.04). */
const rebuilt = (label: string, name: string, osRelease: string): TerminalVariant => ({
  label, files: [], docker: { images: [api(name, osRelease), ALPINE_IMAGE, UBUNTU_IMAGE], containers: [apiContainer(name)] },
});
const ON_ALPINE = rebuilt('api 改用 Alpine 3.21 為基底重新建置（rentbike/api:2.4-alpine）', 'rentbike/api:2.4-alpine', ALPINE);
const ON_JAMMY = rebuilt('api 改用 Ubuntu 22.04 為基底重新建置（rentbike/api:2.4-jammy）', 'rentbike/api:2.4-jammy', UBUNTU_2204);
const NEWER_KERNEL: TerminalVariant = { label: '核心更新後重新開機的 rent-01（6.8.0-51-generic）', files: [], system: { release: '6.8.0-51-generic' } };
const HWE_HOST: TerminalVariant = { label: '另一台使用較新核心的 Docker 主機 rent-02（6.11.0-21-generic）', files: [], host: 'rent-02', system: { release: '6.11.0-21-generic' } };

// ---- network scene -----------------------------------------------------------------------------------------------
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: 'PSH, ACK' }] });
const get = (hostHeader: string): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '方法', value: 'GET' }, { name: '路徑', value: '/health' }, { name: '版本', value: 'HTTP/1.1' }, { name: 'Host', value: hostHeader }, { name: 'User-Agent', value: 'curl/8.5.0' }] });
const ok: ProtocolHeader = { layer: 'application', protocol: 'HTTP/1.1', fields: [
  { name: '版本', value: 'HTTP/1.1' }, { name: '狀態碼', value: '200' }, { name: '原因片語', value: 'OK' }, { name: 'Server', value: 'uvicorn' },
  { name: 'Content-Type', value: 'application/json' }, { name: 'Content-Length', value: '15' }] };
const VM_PORT = '52344', CTR_PORT = '52346';

const STACK_HEAD = ['層', '版本或內容', '由誰提供'];
const VM_STACK: NodeTable = { node: 'vm', name: '軟體堆疊', head: STACK_HEAD, rows: [
  ['應用程式', 'uvicorn（Python 3.11）', 'VM 的虛擬磁碟'],
  ['函式庫與工具', 'Debian 12', 'VM 的虛擬磁碟'],
  ['核心', VM_KERNEL, 'booking-vm 自己（客體核心）'],
  ['虛擬硬體', 'virtio 網卡、2 個 vCPU、4 GiB 記憶體', 'hv-01 的 Hypervisor（KVM）'],
  ['實體硬體', 'hv-01 的 CPU、記憶體與網卡', 'hv-01'],
] };
const CTR_STACK: NodeTable = { node: 'ctr', name: '軟體堆疊', head: STACK_HEAD, rows: [
  ['應用程式', 'uvicorn（Python 3.12.7）', 'Image rentbike/api:2.3'],
  ['函式庫與工具', 'Debian 12', 'Image rentbike/api:2.3'],
  ['隔離', 'namespace（pid、net、mnt、uts、ipc）與 cgroup', 'rent-01 的核心'],
  ['核心', KERNEL, 'rent-01 主機（共用）'],
  ['實體硬體', 'rent-01 的 CPU、記憶體與網卡', 'rent-01'],
] };
const NAT_HEAD = ['規則', '原本的目的地', '改寫成'];
const NAT_ROW = ['api 的 -p 8080:8000', `${HOST_IP}:8080`, `${CTR_IP}:8000`];
const nat = (changed?: number[]): NodeTable => ({ node: 'host', name: 'NAT 轉換', head: NAT_HEAD, rows: [NAT_ROW], ...changed ? { changed } : {} });

/** Section 6: the same health check to the old VM deployment and to the new container deployment. */
const stacks: NetworkScene = {
  id: 'dkr01-stacks', title: '同一個請求：送進虛擬機與送進容器', model: 'tcp-ip',
  description: `山嵐單車的訂車 API 正在搬家。舊的部署在 hv-01 這台實體伺服器上的虛擬機 booking-vm（Debian 12，用橋接網路取得 ${VM_IP}）；新的部署是 rent-01（Ubuntu 24.04，${HOST_IP}）上的 api 容器，啟動時加了 -p 8080:8000，容器在 Docker 的預設橋接網路上是 ${CTR_IP}。工程師在筆電上對兩邊各送一次 GET /health。兩個回應一模一樣，但請求在伺服器裡經過的層完全不同：看每一步是誰的核心在處理封包，以及兩邊的「軟體堆疊」表。`,
  nodes: [
    { id: 'laptop', label: '工程師的筆電', kind: 'host', addresses: [`IP ${LAPTOP_IP}`] },
    { id: 'vm', label: 'booking-vm（hv-01 上的虛擬機）', kind: 'server', addresses: [`IP ${VM_IP}`, 'TCP 8000'] },
    { id: 'host', label: 'rent-01 的主機核心（Docker 主機）', kind: 'host', addresses: [`IP ${HOST_IP}`, 'TCP 8080（-p 對應）'] },
    { id: 'ctr', label: 'api 容器（rent-01 上）', kind: 'server', addresses: [`IP ${CTR_IP}`, 'TCP 8000'] },
  ],
  messages: [
    { id: 'vm-req', from: 'laptop', to: 'vm', label: `GET /health → ${VM_IP}:8000`,
      headers: [get(`${VM_IP}:8000`), tcp(VM_PORT, '8000'), ipv4(LAPTOP_IP, VM_IP)],
      payload: `GET /health HTTP/1.1\nHost: ${VM_IP}:8000\n…`,
      note: `訊框先到 hv-01 的實體網卡。hv-01 執行 Linux 的 KVM（核心內建的 Hypervisor，搭配 QEMU 提供虛擬硬體），booking-vm 的虛擬網卡接在 hv-01 的橋接器上，所以這台 VM 像一台獨立的電腦，在辦公室網路上有自己的 ${VM_IP}。封包交給 VM 的虛擬網卡之後，由 booking-vm 自己的核心（Debian 12 的 ${VM_KERNEL}）處理 IP 與 TCP，再喚醒等在 8000 埠的 uvicorn。一個請求經過了兩個核心：hv-01 的與 VM 的。（TCP 交握省略）`,
      tables: [VM_STACK] },
    { id: 'vm-resp', from: 'vm', to: 'laptop', label: '200 OK（來自 VM）',
      headers: [ok, tcp('8000', VM_PORT), ipv4(VM_IP, LAPTOP_IP)],
      payload: 'HTTP/1.1 200 OK\nserver: uvicorn\ncontent-type: application/json\n\n{"status":"ok"}',
      note: 'VM 裡的 uvicorn 回應，經由 VM 的核心、虛擬網卡、hv-01 的橋接器與實體網卡回到筆電。為了這個 15 位元組的回應，hv-01 一直替 booking-vm 保留著 4 GiB 記憶體與兩個 vCPU，VM 裡還跑著它自己的 systemd、日誌、排程等整套作業系統的服務。這就是虛擬機的成本：隔離得很徹底，代價是每台 VM 都要開機、維護一整套作業系統。',
      tables: [VM_STACK] },
    { id: 'host-req', from: 'laptop', to: 'host', label: `GET /health → ${HOST_IP}:8080`,
      headers: [get(`${HOST_IP}:8080`), tcp(CTR_PORT, '8080'), ipv4(LAPTOP_IP, HOST_IP)],
      payload: `GET /health HTTP/1.1\nHost: ${HOST_IP}:8080\n…`,
      note: `同一個請求送到新的部署。rent-01 上沒有 Hypervisor，也沒有第二個核心：封包由 rent-01 自己的核心（${KERNEL}）收下。api 容器啟動時，Docker 依 -p 8080:8000 在核心裡加了一條 NAT 規則：送到這台主機 8080 埠的封包，目的地改寫成容器的 ${CTR_IP}:8000。（從 rent-01 自己連 localhost:8080 時，連線則是交給 ps aux 裡看得到的 docker-proxy 轉送。）`,
      tables: [nat([0])] },
    { id: 'ctr-req', from: 'host', to: 'ctr', label: `轉進容器的 network namespace：${CTR_IP}:8000`,
      headers: [get(`${HOST_IP}:8080`), tcp(CTR_PORT, '8000'), ipv4(LAPTOP_IP, CTR_IP)],
      payload: `GET /health HTTP/1.1\nHost: ${HOST_IP}:8080\n…`,
      note: `改寫之後，核心把封包經由 docker0 橋接器與一對 veth 虛擬網卡送進 api 容器的 network namespace。注意三件事：目的地變成 ${CTR_IP}:8000；來源仍是筆電的 ${LAPTOP_IP}，所以 uvicorn 的日誌看得到真正的用戶端；HTTP 的 Host 標頭沒有被改，還是筆電當初寫的 ${HOST_IP}:8080，因為 NAT 只改 IP 與 TCP 標頭。處理這個封包的仍是同一個 rent-01 核心：容器裡的 uvicorn 只是 rent-01 上一個被 namespace 隔離、被 cgroup 限制的行程。`,
      tables: [nat(), CTR_STACK] },
    { id: 'ctr-resp', from: 'ctr', to: 'host', label: '200 OK（來自容器）',
      headers: [ok, tcp('8000', CTR_PORT), ipv4(CTR_IP, LAPTOP_IP)],
      payload: 'HTTP/1.1 200 OK\nserver: uvicorn\ncontent-type: application/json\n\n{"status":"ok"}',
      note: '容器裡的 uvicorn 回應，來源是容器自己的位址與埠。容器沒有自己的作業系統服務要跑：沒有 systemd、沒有開機流程，只有 PID 1 的 uvicorn。它用的記憶體就是 uvicorn 這個行程用的記憶體，加上 cgroup 設下的上限（如果有設）。',
      tables: [nat(), CTR_STACK] },
    { id: 'host-resp', from: 'host', to: 'laptop', label: '200 OK（來源改回 rent-01:8080）',
      headers: [ok, tcp('8080', CTR_PORT), ipv4(HOST_IP, LAPTOP_IP)],
      payload: 'HTTP/1.1 200 OK\n…\n\n{"status":"ok"}',
      note: `rent-01 的核心記得這條連線做過的轉換（連線追蹤），把回應的來源改回 ${HOST_IP}:8080，筆電才認得這是它送出的那條連線的回應。從筆電看，兩次回應完全相同；差別全在伺服器裡：VM 那邊有兩個核心與一整套客體作業系統，容器這邊只有一個核心與一個被隔離的行程。`,
      tables: [nat([0])] },
  ],
};

export const DKR01: LessonContent = {
  lessonId: 'DKR01',
  motivation: '山嵐單車的訂車 API 在新同事小林的筆電上跑得好好的，部署到伺服器卻一啟動就出錯：筆電是 Python 3.12，伺服器是 Python 3.11，有個套件版本也不一樣。這就是工程師最常說的一句話：「在我電腦可以跑啊。」團隊過去的做法是替每個服務開一台虛擬機，把環境一台一台裝好；現在有人提議改用容器。容器到底是什麼？它和虛擬機一樣是「一台小電腦」嗎？為什麼容器啟動只要一眨眼、Image 只有幾十 MB，虛擬機卻要開機、要好幾 GB？它的隔離靠什麼，又隔離到什麼程度？這一課在一台真實樣貌的 Docker 主機上，從行程、主機名稱、檔案系統與核心版本觀察容器，再拿同一個請求比較虛擬機與容器的堆疊，最後學會判斷一個情境該用哪一種。',
  sections: [
    {
      id: 'dkr01-s-problem', title: '「在我電腦可以跑」：環境差異從哪裡來',
      blocks: [
        { type: 'p', text: '一支程式能不能正確執行，不只取決於程式碼本身，還取決於它周圍的一切：語言的執行環境、第三方套件、作業系統提供的函式庫與工具、設定檔與環境變數。開發者的筆電、同事的筆電、測試機與正式伺服器，各自是不同時間、不同人、用不同方式裝起來的，這些東西幾乎不可能完全一樣。' },
        { type: 'table', head: ['差異來源', '山嵐單車的例子', '出問題時的樣子'], rows: [
          ['語言執行環境', '筆電 Python 3.12，伺服器 Python 3.11', '用了新版才有的語法或標準函式庫，伺服器上一啟動就 SyntaxError 或 ImportError'],
          ['第三方套件', '筆電裝了 fastapi 0.115，伺服器是兩年前裝的舊版', '函式的參數或行為改了，某些 API 回 500'],
          ['系統函式庫與工具', '影像處理套件需要系統的某個 C 函式庫，伺服器沒有裝', '安裝套件時編譯失敗，或執行到一半才找不到 .so 檔'],
          ['設定與環境變數', '筆電的時區、語系、資料庫位址都不同', '時間差了 8 小時、中文變亂碼、連錯資料庫'],
          ['作業系統', '筆電是 macOS，伺服器是 Linux', '檔名大小寫、路徑分隔符號、檔案權限的行為不同'],
        ] },
        { type: 'p', text: '要讓程式「到哪裡都一樣」，目標是可重現的環境：同一份描述，在任何一台機器上都能得到相同的執行環境。傳統的做法是寫安裝文件或安裝腳本，但文件會過時、腳本在不同的作業系統上行為不同，而且機器上原本裝了什麼也會干擾結果。另外兩種做法是把「整台電腦」或「整個使用者空間」打包起來：虛擬機打包整套作業系統，包含它自己的核心；容器只打包程式需要的檔案（Python、套件、函式庫、設定），執行時直接使用主機的核心。' },
        { type: 'p', text: '在容器的做法中，打包好的內容叫做 Image（映像檔）：一份唯讀、帶版本的檔案集合，裡面是 Python 3.12.7、指定版本的套件和程式碼本身。從 Image 啟動的執行個體叫做 Container（容器）。小林的筆電與 rent-01 伺服器執行的是同一個 Image，裡面的 Python 和套件就是同一份檔案，不再依賴每台機器各自裝了什麼。Image 怎麼建置、怎麼分層，是後面幾課的主題；這一課先弄清楚容器在執行時到底是什麼。' },
        { type: 'callout', tone: 'note', title: '可重現的是使用者空間，不是整台機器', text: 'Image 固定的是程式看得到的檔案：執行環境、函式庫、工具與程式碼。它不包含核心，也不包含主機的硬體：同一個 Image 在核心較舊的主機上，可能用不到新核心才有的功能；為 x86_64 建置的 Image 不能直接在 ARM 的機器上執行。資料庫裡的資料、環境變數、外部服務的位址也不在 Image 裡，部署時仍要各自提供。' },
      ],
    },
    {
      id: 'dkr01-s-vm', title: '虛擬機：Hypervisor 模擬出一整台電腦',
      blocks: [
        { type: 'p', text: '虛擬機（Virtual Machine，VM）是由軟體模擬出來的一整台電腦：它有自己的 CPU、記憶體、磁碟與網卡，只是這些都是虛擬的。負責模擬與分配的軟體叫做 Hypervisor（也叫 Virtual Machine Monitor）。現代 CPU 有硬體虛擬化的支援（Intel VT-x、AMD-V），讓 VM 裡的程式大部分時候能直接在實體 CPU 上執行，只有存取硬體等特權操作才交給 Hypervisor 處理。' },
        { type: 'table', head: ['類型', '執行在哪裡', '常見例子', '典型用途'], rows: [
          ['第一型（bare-metal）', '直接安裝在實體硬體上，本身就是一個精簡的作業系統', 'Xen，以及資料中心常見的商用虛擬化平台', '資料中心、雲端業者用來切分實體伺服器'],
          ['第二型（hosted）', '以一般應用程式的形式，執行在既有的作業系統上', 'VirtualBox，以及桌面版的虛擬化軟體', '在筆電上跑另一個作業系統做測試'],
          ['Linux 的 KVM', 'Linux 核心內建的模組，讓核心本身成為 Hypervisor，通常搭配 QEMU 提供虛擬硬體', 'hv-01 這台伺服器的做法', '許多雲端與自建機房的 Linux 虛擬化'],
        ] },
        { type: 'p', text: '關鍵在於：每台 VM 裡都要安裝並開機一整套作業系統，包含它自己的核心。booking-vm 裡執行著 Debian 12 的核心，這個核心以為自己管理著一台真正的電腦：它開機、掛載磁碟、啟動 systemd 與各種系統服務，最後才輪到 uvicorn。VM 之間、VM 與主機之間的界線是硬體層級的：一台 VM 的核心當掉，不會影響其他 VM；VM 甚至可以跑和主機完全不同的作業系統，例如在 Linux 伺服器上跑 Windows。' },
        { type: 'p', text: '這種徹底的隔離是有代價的。每台 VM 都要預留記憶體給自己的核心與系統服務、要一個裝著完整作業系統的虛擬磁碟（通常是好幾 GB）、啟動時要走完整個開機流程（通常是數十秒到數分鐘），而且每一台都是一套要打補丁、要監控的作業系統。十個小服務開十台 VM，就是十套作業系統要養。' },
      ],
    },
    {
      id: 'dkr01-s-container', title: '容器：共用主機核心的隔離行程',
      blocks: [
        { type: 'p', text: '容器走的是另一條路：不模擬硬體、不開機第二個核心。一個 Linux 容器其實就是主機上的一個（或一組）普通行程，只是核心替它做了兩件事：用 namespace 讓它看到自己的一個小世界（自己的行程編號、主機名稱、檔案系統、網路），用 cgroup 限制它能用多少資源。所有容器與主機共用核心：這就是容器啟動快、體積小的原因，也是它隔離程度比 VM 弱的原因。' },
        { type: 'p', text: 'Docker 是建立與管理容器最常見的工具。它分成兩半：你輸入的 `docker` 指令是 Client（用戶端），真正建立容器的是在背景執行的 daemon `dockerd`（Server）。dockerd 再透過 containerd 管理容器，最後由 runc 這個小程式呼叫核心的功能，建立 namespace、設定 cgroup，然後在裡面啟動容器的程式。`docker version` 把這兩半分開列出來：' },
        { type: 'example', id: 'dkr01-version' },
        { type: 'p', text: '`Client:` 是 docker 指令本身，`Server:` 底下的 Engine 是 dockerd，containerd 與 runc 是它用來建立容器的元件，docker-init 是一個可以選擇放進容器當 PID 1 的小程式（`docker run --init` 時使用）。注意 OS/Arch 都是 linux/amd64：Linux 容器需要 Linux 核心。dockerd 與 containerd 在主機上就是兩個以 root 執行的普通行程，沒有任何 Hypervisor。Client 與 daemon 之間怎麼溝通、Image 從哪裡來，是下一課（DKR02）的主題。' },
        { type: 'p', text: 'rent-01 上已經有一個名為 api 的容器在執行訂車 API。從容器裡面看，它的世界只有自己：`docker exec api ps` 在容器裡執行 ps，只列出兩個行程，PID 1 是 uvicorn，另一個是 ps 自己。主機的 `ps aux` 卻是另一番景象：PID 1 是開機時啟動的 `/sbin/init`（systemd），還有 sshd、containerd、dockerd 等系統服務。再用同一個 Image 啟動第二個容器 probe，把主程式換成 `sleep infinity`，它的 PID 1 就是 sleep：每個容器都有自己從 1 開始的行程編號。' },
        { type: 'example', id: 'dkr01-pid' },
        { type: 'callout', tone: 'note', title: '模擬環境的限制：主機的 ps 看不到容器裡的行程', text: '在真實的主機上，`ps aux` 會多出每個容器的 `containerd-shim-runc-v2` 行程，以及容器裡的 uvicorn 與 sleep：它們本來就是主機上的行程，只是用的是主機的 PID 編號（例如 2417），而不是 1。核心為每個行程記住它在各層 PID namespace 裡的編號：容器裡看到 1，主機看到 2417，是同一個行程。模擬環境沒有模擬這一層，所以上面主機的 ps aux 只列出主機自己的服務與 docker-proxy；這一點請以真實主機的行為為準。' },
        { type: 'p', text: 'PID 1 在容器裡很特別：它是這個 PID namespace 裡的第一個行程，它一結束，核心就結束這個 namespace 裡的所有行程，容器也就停止了。所以「容器的生命就是 PID 1 的生命」：uvicorn 一直執行，api 就一直在；如果主程式是一個做完就結束的指令，容器也就跟著結束。PID 1 還要負責收養孤兒行程、處理 SIGTERM 之類的訊號，有些程式不擅長這些工作，這時可以用 `--init` 讓 docker-init 當 PID 1。' },
      ],
    },
    {
      id: 'dkr01-s-namespaces', title: 'namespace：讓行程看到自己的世界',
      blocks: [
        { type: 'p', text: 'namespace（命名空間）是 Linux 核心的功能：把某一類系統資源包起來，在同一個 namespace 裡的行程看到同一份資源，在不同 namespace 裡的行程各看各的。容器的隔離就是把一個行程同時放進好幾種新的 namespace。Docker 建立容器時用到的主要是下面六種（Linux 還有 cgroup 與 time 兩種 namespace，概念相同）：' },
        { type: 'table', head: ['namespace', '隔離什麼', '在容器裡的效果', '在 rent-01 上怎麼觀察'], rows: [
          ['pid', '行程編號', '容器的第一個行程是 PID 1，看不到容器外的行程', '`docker exec api ps` 只有兩列；主機的 PID 1 是 /sbin/init'],
          ['net', '網路介面、IP 位址、路由表、連接埠', '容器有自己的 eth0 與 IP，兩個容器可以同時監聽各自的 8000 埠', '`docker inspect` 的 IPAddress：api 是 172.17.0.2，probe 是 172.17.0.3'],
          ['mnt', '掛載點與檔案系統的樣子', '容器的 / 是 Image 的檔案加上一層可寫層，看不到主機的檔案', '主機的 /etc/os-release 是 Ubuntu，容器裡的是 Debian'],
          ['uts', '主機名稱（hostname）與 NIS 網域名稱', '容器有自己的主機名稱，Docker 預設用容器 ID 的前 12 個字', '`hostname` 是 rent-01，`docker exec api hostname` 是 008553deb590'],
          ['ipc', 'System V IPC 與 POSIX 訊息佇列（共享記憶體等）', '容器裡的行程不能和其他容器的行程共用這些 IPC 物件', '本課的指令看不到，只能從概念理解'],
          ['user', 'UID 與 GID 的對應', '可以讓容器裡的 root 對應到主機上的一般使用者；Docker 預設沒有開啟（要另外設定 userns-remap 或使用 rootless 模式）', '本課的指令看不到；預設下容器裡的 root 就是主機的 UID 0'],
        ] },
        { type: 'p', text: '同一個 api 容器，從四個角度觀察：主機名稱（uts）、作業系統的檔案（mnt）、IP 位址（net）都和主機不同。特別注意 /etc/os-release：rent-01 是 Ubuntu 24.04，容器裡卻是 Debian 12。這不代表容器裡跑著一個 Debian 作業系統，只代表容器的 mount namespace 裡，/ 是 rentbike/api 這個 Image 的檔案，而建置這個 Image 時選了 Debian 12 當基底（裡面有 Debian 的函式庫、工具和 /etc/os-release 這個檔案）。' },
        { type: 'example', id: 'dkr01-namespaces' },
        { type: 'callout', tone: 'warning', title: '常見誤解：容器裡是 Debian，所以它跑的是 Debian 的作業系統', text: '容器裡的 /etc/os-release 寫著 Debian 12，只說明 Image 的使用者空間（函式庫、套件管理工具、各種指令）來自 Debian。容器裡沒有 Debian 的核心，也沒有開機流程：所有系統呼叫都由主機 rent-01 的 Ubuntu 核心處理。所以 Ubuntu 主機上可以同時跑 Debian、Alpine、Ubuntu 22.04 為基底的容器；但在 Linux 主機上跑不了需要 Windows 核心的程式，那需要虛擬機。' },
      ],
    },
    {
      id: 'dkr01-s-cgroups', title: 'cgroup 與共用核心',
      blocks: [
        { type: 'p', text: 'namespace 決定行程「看得到什麼」，cgroup（control group，控制群組）決定行程「能用多少」。核心把行程分組，對每一組計量並限制資源的使用。Docker 為每個容器建立一個 cgroup，容器裡的所有行程都在裡面，所以限制的是整個容器，而不是單一行程。namespace 與 cgroup 合起來，才是一個容器：只有 namespace，一個失控的容器可以吃光主機的記憶體；只有 cgroup，行程之間仍然看得到彼此。' },
        { type: 'table', head: ['cgroup 控制器', '限制或計量什麼', '超過時', 'docker run 的選項（之後的課）'], rows: [
          ['memory', '記憶體用量', '核心的 OOM killer 結束群組裡的行程，Docker 顯示 OOMKilled、結束碼 137', '`--memory`'],
          ['cpu', 'CPU 時間的比例或上限', '不會被結束，只是被限速、執行得比較慢', '`--cpus`'],
          ['pids', '群組裡最多幾個行程', '再 fork 會失敗，可以擋下 fork bomb', '`--pids-limit`'],
          ['io', '區塊裝置的讀寫頻寬與次數', '讀寫被限速', '`--device-read-bps` 等'],
        ] },
        { type: 'p', text: '`docker info` 的 Cgroup Driver 與 Cgroup Version 說明這台主機怎麼管理 cgroup：Cgroup Version 2 是目前主流的單一階層（cgroup v2），Cgroup Driver systemd 表示 Docker 透過 systemd 建立與管理容器的 cgroup，和主機上其他服務用同一套機制。同一份輸出的 Kernel Version 是 daemon 回報的核心版本，它和主機的 `uname -r` 完全相同：這台主機上的每一個容器，用的都是這一個核心。' },
        { type: 'example', id: 'dkr01-kernel' },
        { type: 'p', text: '在真實的主機上，在任何一個容器裡執行 `uname -r`，印出的也是 6.8.0-49-generic，不管容器的 Image 是 Debian、Alpine 還是 Ubuntu 22.04：uname 讀的是正在執行的核心，而容器只有主機這一個核心可讀。（模擬環境的容器裡沒有 uname 這個執行檔，所以這裡在主機上與從 docker info 讀取同一個答案。）共用核心帶來兩個直接的結果：容器能用的核心功能，取決於主機的核心版本；核心有安全漏洞時，所有容器一起暴露，修補的方法是更新主機的核心並重新開機，而不是重建 Image。' },
        { type: 'callout', tone: 'tip', title: '為什麼 Mac 與 Windows 上也能跑 Linux 容器', text: 'Linux 容器需要 Linux 核心，macOS 與 Windows 的核心不是 Linux。Docker Desktop 的做法是先啟動一台輕量的 Linux 虛擬機，容器跑在那台 VM 的核心上。所以在筆電上看起來是「直接跑容器」，底下其實是「VM 裡面跑容器」：這也是容器與虛擬機常常一起出現、而不是二選一的例子。' },
      ],
    },
    {
      id: 'dkr01-s-compare', title: '容器還是虛擬機：隔離、成本與怎麼選',
      blocks: [
        { type: 'p', text: '把同一個健康檢查請求，分別送給舊的 VM 部署與新的容器部署。從筆電看，兩個回應一模一樣；差別在伺服器裡面：VM 這邊封包經過 hv-01 與 booking-vm 兩個核心，容器這邊從頭到尾只有 rent-01 一個核心，容器只是那個核心上被隔離的一個行程。一步一步看兩邊的軟體堆疊：' },
        { type: 'example', id: 'dkr01-stacks' },
        { type: 'table', head: ['', '虛擬機', '容器'], rows: [
          ['隔離的方式', 'Hypervisor 模擬硬體，每台 VM 有自己的核心；界線在硬體虛擬化層', '同一個核心裡的 namespace 與 cgroup；界線在核心的系統呼叫介面'],
          ['核心', '每台 VM 各有一個，可以和主機不同（甚至是 Windows）', '共用主機的核心，只能執行這個核心能執行的程式'],
          ['啟動時間', '要開機一整套作業系統，通常數十秒到數分鐘', '只是啟動一個行程，通常不到一秒到數秒'],
          ['大小', '虛擬磁碟含完整作業系統，通常是好幾 GB', 'Image 只含程式需要的檔案，從幾 MB 到幾百 MB，相同的基底層在主機上只存一份'],
          ['每個執行個體的額外成本', '預留的記憶體、整套系統服務、各自要打補丁的作業系統', '幾乎只有程式本身的記憶體與 CPU'],
          ['隔離強度', '強：一台 VM 的核心出問題，不影響其他 VM', '較弱：核心的漏洞可能讓行程逃出容器，影響所有容器與主機'],
        ] },
        { type: 'p', text: '大小的差距在 `docker images` 裡就看得到：整個 Ubuntu 24.04 的使用者空間只有 78.1MB，Alpine 只有 7.83MB，連同 Python 執行環境與套件的訂車 API 是 163MB。它們都不需要核心、開機程式和系統服務，因為那些由主機提供。' },
        { type: 'example', id: 'dkr01-images' },
        { type: 'callout', tone: 'warning', title: '常見誤解：容器就是比較輕的虛擬機，隔離程度一樣', text: '容器和 VM 的隔離界線在不同的地方。VM 之間隔著 Hypervisor 與各自的核心；容器之間只隔著同一個核心的 namespace 與 cgroup。Docker 預設還會移除一部分 Linux capability、套用 seccomp 設定檔過濾系統呼叫，但容器裡的 root 預設就是主機的 UID 0，一個核心漏洞或一個設定錯誤（例如把主機的根目錄掛進容器）就可能讓行程逃出容器。要執行陌生人的程式碼、或不同客戶要嚴格分開時，通常用 VM（或以輕量 VM 包住每個容器的執行環境）來加一道硬體層級的界線。' },
        { type: 'p', text: '實務上兩者經常一起用：雲端上租的伺服器本身就是一台 VM，在 VM 裡再用容器部署許多服務；VM 提供硬體層級的隔離，容器提供可重現的環境與快速部署。判斷一個情境時，可以問三個問題：需要不同的核心或作業系統嗎？要隔離的對象可信嗎？需要多快、多密集地啟動與部署？' },
        { type: 'table', head: ['情境', '比較適合', '理由'], rows: [
          ['同一個團隊的十個 Python／Node.js 服務，部署在 Linux 伺服器', '容器', '都需要 Linux 核心；每個服務的環境各自打包、互不干擾，啟動快、密度高'],
          ['在 Linux 伺服器上執行只支援 Windows 的軟體', '虛擬機', '程式需要 Windows 核心，容器無法提供另一種核心'],
          ['CI 每次測試都要一個乾淨、版本固定的環境', '容器', '從同一個 Image 幾秒內就能得到一模一樣的環境，用完即丟'],
          ['線上程式評測，要執行陌生人上傳的程式碼', '虛擬機（或以 VM 隔離的容器）', '對象不可信，需要比共用核心更強的界線'],
          ['測試新的核心版本或核心模組', '虛擬機', '容器沒有自己的核心，換核心只能換主機或用 VM'],
          ['在筆電上跑和正式環境同版本的 PostgreSQL', '容器', '拉下同一個版本的 Image 就能啟動，不必在筆電上安裝'],
        ] },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [stacks],
    exercises: [
      { id: 'dkr01-net-kernel', task: 'table', scene: 'dkr01-stacks', message: 'ctr-req', node: 'ctr', table: '軟體堆疊', row: '核心', column: '版本或內容', title: '容器裡的請求由哪個核心處理',
        statement: '在「同一個請求：送進虛擬機與送進容器」情境中，請求轉進 api 容器之後，容器的「軟體堆疊」表裡，「核心」那一列的「版本或內容」是什麼？（填版本字串，例如 1.2.3-4-generic）',
        hints: ['容器的 Image 以 Debian 12 為基底，但 Image 裡有沒有核心？', '這一步的封包是誰收下、誰轉送的？容器有沒有自己開機？'],
        explanation: `容器沒有自己的核心，處理這個封包、執行 uvicorn 的系統呼叫的，都是 rent-01 主機的核心 ${KERNEL}。Image 的 Debian 12 只提供使用者空間（函式庫與工具），所以 Debian 的核心版本不會出現在容器裡。${VM_KERNEL} 是 booking-vm 自己開機的客體核心，只有虛擬機才有自己的核心。`,
        mistakes: [
          { answer: { cell: VM_KERNEL }, why: `${VM_KERNEL} 是 booking-vm 這台虛擬機自己的 Debian 核心；容器的 Image 雖然以 Debian 12 為基底，卻不帶核心，執行時用的是 rent-01 的核心。` },
          { answer: { cell: 'Debian 12' }, why: 'Debian 12 是「函式庫與工具」那一列：Image 提供的使用者空間。核心那一列要填正在處理請求的核心版本。' },
        ] },
      { id: 'dkr01-net-dst', task: 'field', scene: 'dkr01-stacks', message: 'ctr-req', layer: 'network', field: '目的 IP', title: '封包進入容器時的目的地',
        statement: '同一個情境裡，rent-01 的核心把請求轉進 api 容器的那則訊息，IPv4 標頭的「目的 IP」是什麼？',
        hints: ['筆電送出時寫的是 rent-01 的位址；看 rent-01 的「NAT 轉換」表把目的地改寫成什麼。', '容器在自己的 network namespace 裡有自己的 IP。'],
        explanation: `筆電送出的封包目的地是 ${HOST_IP}:8080；rent-01 的核心依照 Docker 為 -p 8080:8000 加上的 NAT 規則，把目的地改寫成容器的 ${CTR_IP}:8000，再經由 docker0 與 veth 送進容器的 network namespace。來源 IP 沒有被改，仍是筆電的 ${LAPTOP_IP}。${VM_IP} 是另一條路徑上的虛擬機，和容器無關。`,
        mistakes: [
          { answer: { value: HOST_IP }, why: `${HOST_IP} 是改寫之前的目的地（rent-01 對外的位址）；進入容器前，核心已經依 NAT 規則把它換成容器自己的位址。` },
          { answer: { value: LAPTOP_IP }, why: `${LAPTOP_IP} 是筆電，也就是這個封包的來源 IP；NAT 只改寫了目的地，來源保持不變。` },
          { answer: { value: VM_IP }, why: `${VM_IP} 是 hv-01 上的虛擬機 booking-vm，是前一組訊息的目的地，不是容器。` },
        ] },
    ],
  },
  quiz: [
    {
      id: 'dkr01-q1', prompt: '小林的筆電是 Python 3.12，伺服器是 Python 3.11，同一份程式在伺服器上出錯。把應用程式做成容器 Image 部署之後，為什麼這類問題會大幅減少？',
      options: ['Docker 會把程式碼自動轉換成相容所有 Python 版本的寫法', 'Image 裡包含程式需要的 Python 版本與套件，筆電和伺服器執行的是同一份使用者空間', '容器會模擬一顆和筆電相同的 CPU', '容器讓伺服器改用筆電的核心'],
      answer: 1,
      explanation: 'Image 打包了 Python 執行環境、套件與程式碼，任何主機從同一個 Image 啟動的容器看到的都是同一份檔案，所以環境可重現。Docker 不會改寫程式碼；容器不模擬 CPU，它直接在主機的 CPU 上執行；容器也不會換核心，它用的永遠是所在主機的核心。',
    },
    {
      id: 'dkr01-q2', prompt: '在核心版本 6.8.0-49-generic 的 Ubuntu 主機上，用以 Debian 12 為基底的 Image 啟動容器，在容器裡執行 `uname -r` 會印出什麼？',
      options: ['Debian 12 預設的核心版本', '錯誤訊息，因為容器沒有核心可讀', '每次啟動容器時隨機選出的版本', '6.8.0-49-generic'],
      answer: 3,
      explanation: '容器共用主機的核心，uname 讀的是正在執行的核心，所以印出主機的 6.8.0-49-generic。Image 只有 Debian 的使用者空間，不帶 Debian 的核心；容器雖然沒有自己的核心，但它的系統呼叫由主機核心回答，所以不會出錯；版本也不是隨機的。',
    },
    {
      id: 'dkr01-q3', prompt: '容器裡執行 `hostname` 印出 008553deb590，主機上執行卻是 rent-01。讓兩邊看到不同主機名稱的是哪一種機制？',
      options: ['UTS namespace', 'PID namespace', 'cgroup', 'mount namespace'],
      answer: 0,
      explanation: 'UTS namespace 隔離主機名稱與 NIS 網域名稱，Docker 預設把容器的主機名稱設為容器 ID 的前 12 個字。PID namespace 隔離的是行程編號；cgroup 限制資源用量，不改變看到的名稱；mount namespace 隔離的是掛載點與檔案系統。',
    },
    {
      id: 'dkr01-q4', prompt: '想限制一個容器最多只能使用 512 MiB 記憶體，超過時由核心處理。這靠的是哪一種核心機制？',
      options: ['net namespace', 'user namespace', 'cgroup 的 memory 控制器', 'Hypervisor 預留的記憶體'],
      answer: 2,
      explanation: 'cgroup 負責計量與限制一組行程的資源，memory 控制器設下上限，超過時核心的 OOM killer 會結束群組裡的行程。net namespace 隔離網路，user namespace 隔離 UID 對應，兩者都不限制用量；容器沒有 Hypervisor，預留記憶體是虛擬機的做法。',
    },
    {
      id: 'dkr01-q5', prompt: '下列哪一個情境最需要虛擬機，而不是容器？',
      options: ['同一個團隊的十個 Python 服務部署在同一台 Linux 主機', '在 Linux 伺服器上執行只支援 Windows 的會計軟體', 'CI 每次測試都需要一個乾淨的 Node.js 環境', '在筆電上快速啟動和正式環境同版本的 PostgreSQL'],
      answer: 1,
      explanation: '只支援 Windows 的軟體需要 Windows 核心，Linux 主機上的容器只能共用 Linux 核心，所以要用虛擬機。其他三個情境都需要 Linux 核心，而重點是環境一致、啟動快、用完即丟，正是容器的強項。',
    },
    {
      id: 'dkr01-q6', prompt: '容器裡的 `ps` 顯示 uvicorn 是 PID 1。在真實的主機上用 `ps aux` 看同一個行程，會看到什麼？',
      options: ['同一個行程，但顯示主機的 PID 編號（例如 2417），而不是 1', '完全看不到：容器裡的行程對主機是隱形的', '也是 PID 1，和主機的 systemd 共用同一個編號', '一個名為 hypervisor 的行程，容器的行程都在它裡面'],
      answer: 0,
      explanation: '容器裡的行程就是主機上的普通行程，核心替它在每一層 PID namespace 各記一個編號：容器裡是 1，主機上是另一個號碼。主機在外層 namespace，看得到所有容器的行程（只是本課的模擬環境沒有列出）；同一個 namespace 裡的 PID 不會重複，主機的 PID 1 是 systemd；容器沒有 Hypervisor。',
    },
    {
      id: 'dkr01-q7', prompt: '為什麼容器通常不到一秒到幾秒就能啟動，虛擬機卻常常要數十秒以上？',
      options: ['容器的 Image 預先壓縮過，所以讀取比較快', '容器使用了虛擬機不能用的特殊 CPU 指令', '虛擬機每次啟動都要重新下載整套作業系統', '容器只是在已經執行中的主機核心上，啟動一個被隔離的行程，不必開機核心與整套系統服務'],
      answer: 3,
      explanation: '虛擬機要模擬硬體、載入自己的核心、走完開機流程並啟動系統服務；容器只需要核心建立 namespace、設定 cgroup，再啟動一個行程。快的原因不在壓縮或特殊指令（容器的程式就在一般 CPU 上執行），虛擬機也不會每次重新下載作業系統，它的虛擬磁碟已經裝好了。',
    },
    {
      id: 'dkr01-q8', prompt: '關於容器的隔離，哪一個說法正確？',
      options: ['每個容器有自己的核心，所以核心漏洞只會影響單一容器', 'Docker 預設會把容器裡的 root 對應到主機上的一般使用者', '所有容器共用主機核心，核心漏洞可能讓行程逃出容器；需要強隔離時常改用虛擬機', '用了容器之後，主機的核心就不需要再更新'],
      answer: 2,
      explanation: '容器之間只隔著同一個核心的 namespace 與 cgroup，核心的漏洞會影響所有容器，所以不可信的工作常放進虛擬機。容器沒有自己的核心；user namespace 的對應（userns-remap）在 Docker 預設是關閉的，容器裡的 root 就是主機的 UID 0；正因為共用核心，主機的核心更需要及時更新。',
    },
  ],
  terminal: {
    machines: [host],
    examples: [
      {
        id: 'dkr01-version', title: 'Client 與 Server：docker version', machine: 'dkr01-host',
        description: '`docker version` 分成兩段：Client 是 docker 指令，Server 是 daemon（Engine，也就是 dockerd）以及它用來建立容器的 containerd、runc 與 docker-init。兩邊的 OS/Arch 都是 linux/amd64。再用 ps 看 dockerd 與 containerd：它們只是主機上以 root 執行的普通行程。',
        steps: [
          { command: 'docker version', output: 'Client: Docker Engine - Community\n Version:           27.5.1\n API version:       1.47\n Go version:        go1.22.11\n OS/Arch:           linux/amd64\n Context:           default\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.5.1\n  API version:      1.47 (minimum version 1.24)\n  Go version:       go1.22.11\n  OS/Arch:          linux/amd64\n  Experimental:     false\n containerd:\n  Version:          1.7.25\n runc:\n  Version:          1.2.4\n docker-init:\n  Version:          0.19.0' },
          { command: 'ps -o pid,user,args -C dockerd,containerd', output: '    PID USER     COMMAND\n    850 root     /usr/bin/containerd\n    900 root     /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock' },
        ],
      },
      {
        id: 'dkr01-pid', title: '每個容器有自己的 PID 1', machine: 'dkr01-host',
        description: '容器 api 裡的 ps 只看到兩個行程：PID 1 的 uvicorn 與 ps 自己。主機的 ps aux 的 PID 1 是 /sbin/init，還有 sshd、containerd、dockerd，以及為 -p 8080:8000 轉送連線的 docker-proxy。用同一個 Image 啟動 probe、主程式改成 sleep infinity，它的 PID 1 就是 sleep。（真實主機的 ps aux 也會列出容器裡的行程，用的是主機的 PID；模擬環境沒有列出。）',
        steps: [
          { command: 'docker exec api ps', output: '    PID TTY          TIME CMD\n      1 ?        00:00:00 uvicorn\n      7 ?        00:00:00 ps' },
          { command: 'ps aux', output: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nroot           1  0.0  0.6  13100 13100 ?        Ss   Nov21   0:00 /sbin/init\nsystemd+     600  0.0  0.6  21600 12800 ?        Ss   Nov21   0:00 /usr/lib/systemd/systemd-resolved\nroot         640  0.0  0.4   9100  9100 ?        Ss   Nov21   0:00 sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups\nroot         850  0.0  2.2 1873408 47104 ?        Ssl  Nov21   0:00 /usr/bin/containerd\nroot         900  0.0  3.9 2412544 81920 ?        Ssl  Nov21   0:00 /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock\nroot         901  0.0  0.2 1745920  3840 ?        Sl   10:00   0:00 /usr/bin/docker-proxy -proto tcp -host-ip 0.0.0.0 -host-port 8080 -container-ip 172.17.0.2 -container-port 8000\nlearner      902  0.0  0.2   9120  3840 pts/0    R+   10:00   0:00 ps aux' },
          { command: 'docker run -d --name probe rentbike/api:2.3 sleep infinity', output: '099df3f641f1754e178d961be912c9b0a3fe3e05fd2b94a3e32d3496768d8ec9' },
          { command: 'docker exec probe ps', output: '    PID TTY          TIME CMD\n      1 ?        00:00:00 sleep\n      7 ?        00:00:00 ps' },
        ],
      },
      {
        id: 'dkr01-namespaces', title: '主機名稱、檔案系統與 IP：namespace 的效果', machine: 'dkr01-host',
        description: '主機名稱：主機是 rent-01，容器是自己的容器 ID（uts）。作業系統的檔案：主機的 /etc/os-release 是 Ubuntu 24.04.1，容器裡的是 Image 帶來的 Debian 12（mnt）。網路：容器在 Docker 的預設橋接網路上有自己的位址 172.17.0.2（net）。',
        steps: [
          { command: 'hostname', output: 'rent-01' },
          { command: 'docker exec api hostname', output: '008553deb590' },
          { command: 'grep PRETTY_NAME /etc/os-release', output: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"' },
          { command: 'docker exec api grep PRETTY_NAME /etc/os-release', output: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"' },
          { command: "docker inspect -f '{{.NetworkSettings.IPAddress}}' api", output: '172.17.0.2' },
        ],
      },
      {
        id: 'dkr01-kernel', title: '只有一個核心：uname -r 與 docker info', machine: 'dkr01-host',
        description: '主機的 `uname -r` 與 docker info 回報的 Kernel Version 相同：這台主機上所有容器都使用這個核心。Cgroup Driver systemd 與 Cgroup Version 2 說明容器的 cgroup 怎麼管理；Operating System 是主機的作業系統，不是任何一個容器的。',
        steps: [
          { command: 'uname -r', output: '6.8.0-49-generic' },
          { command: "docker info | grep -E 'Kernel Version|Operating System|Cgroup'", output: ' Cgroup Driver: systemd\n Cgroup Version: 2\n Kernel Version: 6.8.0-49-generic\n Operating System: Ubuntu 24.04.1 LTS' },
        ],
      },
      {
        id: 'dkr01-images', title: 'Image 有多大', machine: 'dkr01-host',
        description: '`docker images` 列出本機的 Image 與大小：整個 Ubuntu 24.04 的使用者空間 78.1MB、Alpine 7.83MB、訂車 API（Debian 12、Python 3.12.7 與套件）163MB。沒有一個包含核心。',
        steps: [
          { command: 'docker images', output: 'REPOSITORY     TAG       IMAGE ID       CREATED       SIZE\nrentbike/api   2.3       1ac0f73b042a   2 days ago    163MB\nubuntu         24.04     1ab7d251cec8   5 weeks ago   78.1MB\nalpine         3.21      62550e7b9f25   6 weeks ago   7.83MB' },
        ],
      },
    ],
    exercises: [
      {
        id: 'dkr01-userland', title: '容器裡的作業系統從哪裡來', machine: 'dkr01-host',
        statement: 'rent-01 這台主機是 Ubuntu 24.04。請印出 api 容器自己看到的作業系統名稱：容器裡 /etc/os-release 的 PRETTY_NAME 那一行（整行，不要其他行）。檢查時，你的指令也會在 api 改用其他基底 Image 重新建置的主機上重新執行，直接打出答案無法通過。',
        checks: [{ kind: 'output' }],
        solution: ['docker exec api grep PRETTY_NAME /etc/os-release'],
        variants: [ON_ALPINE, ON_JAMMY],
        mistakes: [
          { commands: ['grep PRETTY_NAME /etc/os-release'], why: '沒有 docker exec，grep 在主機上執行，讀到的是 rent-01 自己的 /etc/os-release（Ubuntu 24.04.1 LTS）。容器的檔案在它自己的 mount namespace 裡，要在容器裡讀。' },
          { commands: ["docker info | grep 'Operating System'"], why: 'docker info 回報的是 daemon 所在主機的作業系統（Ubuntu 24.04.1 LTS），不是任何一個容器的 Image；格式也不是 PRETTY_NAME 那一行。' },
          { commands: ['docker exec api cat /etc/os-release'], why: '方向對了，但印出整個檔案；題目只要 PRETTY_NAME 那一行。' },
          { commands: ['echo \'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\''], why: '直接打出這台的答案：api 改用 Alpine 或 Ubuntu 22.04 為基底重新建置之後，容器裡的檔案就不同了。' },
        ],
        hints: ['`docker exec 容器 指令…` 在執行中的容器裡執行指令，看到的是容器的檔案。', '`grep PRETTY_NAME /etc/os-release` 只留下那一行。'],
        explanation: '`docker exec api grep PRETTY_NAME /etc/os-release` 在容器的 mount namespace 裡讀檔：原本是 Debian 12，改用 Alpine 3.21 建置後是 Alpine Linux v3.21，改用 Ubuntu 22.04 時是 Ubuntu 22.04.5 LTS，而主機一直是 Ubuntu 24.04.1 LTS。容器的使用者空間來自 Image，選哪一個基底就是哪一套函式庫與工具；但三種情況用的都是主機的同一個核心。',
      },
      {
        id: 'dkr01-kernel-version', title: '容器用的是誰的核心', machine: 'dkr01-host',
        statement: '同事說：「api 容器是 Debian 12，所以它跑的是 Debian 的核心。」請印出 api 容器實際使用的 Linux 核心版本來回答他：只印版本字串，格式和 `uname -r` 相同。模擬環境的容器裡沒有 uname 這個執行檔，想想在哪裡能讀到同一個答案。檢查時，你的指令也會在核心版本不同的主機上重新執行，答案必須由查詢核心的指令（uname 或 docker）印出。',
        checks: [{ kind: 'output', fromCommand: '^(sudo )?(uname|docker) ' }],
        solution: ['uname -r'],
        variants: [NEWER_KERNEL, HWE_HOST],
        mistakes: [
          { commands: ['docker exec api cat /etc/os-release'], why: 'Debian 12 是 Image 的使用者空間，不是核心：Image 裡沒有核心，容器的系統呼叫都由主機的核心處理。' },
          { commands: ['uname -a'], why: '找對了地方，但 `-a` 印出整行（系統名稱、主機名稱、版本、架構…），題目只要 `-r` 的版本字串。' },
          { commands: ["docker info | grep 'Kernel Version'"], why: '找對了地方，但輸出還帶著欄位名稱「Kernel Version:」；要只留下版本字串（例如再接上 `cut`），或直接在主機上用 `uname -r`。' },
          { commands: ['echo 6.8.0-49-generic'], why: '直接打出這台的答案：核心更新或換一台主機之後版本就不同了，而且答案不是由查詢核心的指令印出的。' },
        ],
        hints: ['容器沒有自己的核心。那它用的是誰的？', '主機上的 `uname -r` 印出正在執行的核心版本；`docker info` 的 Kernel Version 也是同一個值。'],
        explanation: '容器共用主機的核心，所以答案就是主機的 `uname -r`：rent-01 是 6.8.0-49-generic，核心更新後是 6.8.0-51-generic，rent-02 是 6.11.0-21-generic。`docker info | grep \'Kernel Version\' | cut -d\' \' -f4` 也印出同一個字串，因為 daemon 回報的就是它所在主機的核心。在真實的主機上，在容器裡執行 `uname -r` 一樣會印出主機的版本；不管 Image 是 Debian、Alpine 還是 Ubuntu，答案都不會是那個發行版自己的核心。',
      },
      {
        id: 'dkr01-sandbox', title: '讓容器一直活著', machine: 'dkr01-host',
        statement: '請在 rent-01 上啟動一個名為 sandbox 的容器：以 ubuntu:24.04 建立、在背景執行，而且要一直保持執行，讓它的主程式（PID 1）是 `sleep infinity`。原本的 api 容器要繼續執行。',
        checks: [{ kind: 'container', name: 'sandbox', state: 'running', image: 'ubuntu:24.04' }, { kind: 'container', name: 'api', state: 'running' }],
        solution: ['docker run -d --name sandbox ubuntu:24.04 sleep infinity', "docker ps --format '{{.Names}} {{.Status}}'"],
        mistakes: [
          { commands: ['docker run -d --name sandbox ubuntu:24.04'], why: '沒有指定指令時，PID 1 是 Image 預設的 /bin/bash；沒有 -i，bash 讀不到任何輸入就結束，PID 1 一結束容器就停了（Exited (0)）。' },
          { commands: ['docker run --rm --name sandbox ubuntu:24.04 echo ready'], why: 'PID 1 是 echo，印出 ready 就結束，容器跟著停止，又因為 --rm 被刪除了。' },
          { commands: ['docker run -d --name sandbox alpine:3.21 sleep infinity'], why: '容器確實一直在執行，但用的是 alpine:3.21，題目要的是 ubuntu:24.04。' },
        ],
        hints: ['`docker run -d --name 名稱 IMAGE 指令…`：Image 後面寫的指令會取代 Image 預設的指令，成為容器的 PID 1。', '容器的生命就是 PID 1 的生命：要讓它一直執行，PID 1 就得一直執行。'],
        explanation: '`docker run -d --name sandbox ubuntu:24.04 sleep infinity` 在背景建立並啟動容器，`sleep infinity` 成為它的 PID 1，永遠不會自己結束，所以容器一直是 Up。只寫 Image 時 PID 1 是 bash，沒有輸入就結束；echo 這類做完就結束的指令也一樣。容器不是一台要開機、會一直待在那裡的電腦，而是一個被隔離的行程：行程在，容器就在。',
      },
    ],
  },
};
