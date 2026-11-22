import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * SRV10 SSH tunnels and bastion hosts (SRV-3, network-sequence; the blueprint's protocol-sequence activity). A terminal
 * lesson on the tunnels profile (engine stage E17) beside two network-protocol scenes. The terminal part: a private
 * network that only the bastion reaches (minimal exposure: the bastion's ufw lets in OpenSSH only, the internal hosts
 * time out from outside), ssh -J and the source address the internal host logs, ~/.ssh/config Host blocks (HostName,
 * User, IdentityFile, ProxyJump; the first value wins; the file's permissions; command-line -i and -o do not reach a jump
 * host), local forwarding (-L, resolved on the server's side, 127.0.0.1 unless -g; a service bound to the internal host's
 * own loopback needs the tunnel to end on that host), remote forwarding (-R, held by sshd on the server, GatewayPorts),
 * -f -N background tunnels found with ss -tlnp, pgrep -af and ps -f and stopped with kill or pkill -f, and sshd's
 * AllowTcpForwarding local, GatewayPorts no and AllowAgentForwarding no on the bastion. The network part: a local
 * forward from psql through the bastion to PostgreSQL (which hop SSH encrypts, the direct-tcpip channel, the source
 * address db-01 records) and ProxyJump (the inner SSH connection the bastion relays but cannot read). Message names and
 * numbers follow RFC 4252 and RFC 4254 (user authentication; channels, direct-tcpip); agent forwarding is text only (the
 * engine accepts AllowAgentForwarding without simulating it), as are ExitOnForwardFailure, PermitOpen, DisableForwarding
 * and Match (the engine's sshd does not know PermitOpen and DisableForwarding). The company, host names, users and addresses (RFC 5737 and a private
 * 10.30.0.0/24) are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00' };
const LAPTOP = '198.51.100.23', NB02 = '198.51.100.24', GUEST = '198.51.100.77';
const BASTION_PUB = '203.0.113.10', BASTION_PRIV = '10.30.0.10', DB = '10.30.0.21', MON = '10.30.0.31';

/** The old laptop's key (default file name), the new laptop's work key and its personal key (which no server knows). */
const LAPTOP_KEY = keyPair(`srv10-laptop:learner:${HOME}/.ssh/id_ed25519`, 'learner@laptop');
const WORK_KEY = keyPair(`srv10-nb02:learner:${HOME}/.ssh/id_work`, 'learner@nb-02 work');
const PERSONAL_KEY = keyPair(`srv10-nb02:learner:${HOME}/.ssh/id_ed25519`, 'learner@nb-02');
const BASTION_SEED = 'srv10-bastion', DB_SEED = 'srv10-db-01', MON_SEED = 'srv10-mon-01';
/** A known_hosts line (names, key type, key), as the IT team hands them out. */
const known = (names: string, seed: string, host: string) => `${names} ${hostKey(seed, host).publicLine.split(' ').slice(0, 2).join(' ')}\n`;
const KNOWN_HOSTS = known(`bastion,${BASTION_PUB}`, BASTION_SEED, 'bastion') + known('db-01', DB_SEED, 'db-01') + known('mon-01', MON_SEED, 'mon-01');

// ---- the servers: a bastion with a public and a private interface, two internal hosts only it reaches ---------------
const OPS = { users: [{ name: 'ops', uid: 1000 }], groups: [{ name: 'sudo', members: ['ops'] }] };
/** Every server: key-only login (LNX12), ops's authorized_keys with both laptops' keys. */
const HARDENED = [dir('/etc'), dir('/etc/ssh'), dir('/etc/ssh/sshd_config.d'), file('/etc/ssh/sshd_config.d/10-hardening.conf', 'PasswordAuthentication no\nPermitRootLogin no\n')];
const opsHome = [dir('/home'), dir('/home/ops', 'ops', 0o750), dir('/home/ops/.ssh', 'ops', 0o700),
  file('/home/ops/.ssh/authorized_keys', `${LAPTOP_KEY.publicLine}\n${WORK_KEY.publicLine}\n`, 'ops', 0o600)];

const bastion: TerminalRemote = {
  host: 'bastion', title: '跳板機 bastion', address: BASTION_PUB, hostKey: BASTION_SEED, accounts: OPS,
  interfaces: [{ name: 'eth0', address: `${BASTION_PUB}/24` }, { name: 'eth1', address: `${BASTION_PRIV}/24` }],
  firewall: { enabled: true, incoming: 'deny', outgoing: 'allow', rules: ['allow OpenSSH'] },
  files: [...HARDENED, ...opsHome],
};
const backups = (days: string[]) => [dir('/var'), dir('/var/backups'), dir('/var/backups/pg', 'postgres'),
  ...days.map(d => file(`/var/backups/pg/shipdb-${d}.sql.gz`, `shipdb ${d}\n`, 'postgres', 0o640))];
/** db-01: PostgreSQL on every address (only the bastion reaches them) and its admin console on its own loopback only. */
const dbRemote = (status: string, days: string[]): TerminalRemote => ({
  host: 'db-01', title: '資料庫 db-01（內網）', address: DB, hostKey: DB_SEED, reachableFrom: ['bastion'],
  interfaces: [{ name: 'eth0', address: `${DB}/24` }],
  accounts: { users: [{ name: 'ops', uid: 1000 }, { name: 'postgres', uid: 113, home: '/var/lib/postgresql', shell: '/bin/bash' }], groups: [{ name: 'sudo', members: ['ops'] }] },
  files: [...HARDENED, ...opsHome, ...backups(days)],
  processes: [
    { pid: 910, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', stat: 'Ss', listen: [{ port: 5432, fd: 6 }] },
    { pid: 940, user: 'root', command: '/usr/local/bin/db-console --listen 127.0.0.1:8080', stat: 'Ss', listen: [{ address: '127.0.0.1', port: 8080, fd: 5, http: 'console' }] },
  ],
  responders: [{ id: 'console', server: 'db-console/2.3', routes: [
    { path: '/status', body: status, type: 'text/plain' },
    { path: '/*', body: 'db-console：db-01 的管理頁面（只開放 127.0.0.1）\n', type: 'text/plain' }] }],
});
const db01 = dbRemote('db-01 status\nreplication: streaming, lag 0 s\nconnections: 37 / 200\n', ['2026-11-20', '2026-11-21', '2026-11-22']);
/** The exercises' variant: another day on db-01 (a missing backup, another replication lag). */
const OTHER_DAY: TerminalVariant = { label: 'db-01 換成另一天的狀態（備份與複寫延遲不同）', files: [],
  remotes: [dbRemote('db-01 status\nreplication: streaming, lag 3 s\nconnections: 152 / 200\n', ['2026-11-19', '2026-11-20', '2026-11-22'])] };
const mon01: TerminalRemote = {
  host: 'mon-01', title: '監控 mon-01（內網）', address: MON, hostKey: MON_SEED, reachableFrom: ['bastion'],
  interfaces: [{ name: 'eth0', address: `${MON}/24` }], accounts: OPS, files: [...HARDENED, ...opsHome],
  processes: [{ pid: 930, user: 'root', command: '/usr/local/bin/statusboard', stat: 'Ssl', listen: [{ port: 3000, fd: 7, http: 'board' }] }],
  responders: [{ id: 'board', server: 'statusboard/5.1', routes: [{ path: '/*', body: 'statusboard：db-01 ok, mon-01 ok\n', type: 'text/plain' }] }],
};
/** A stranger on the same café Wi-Fi (exercise 3). */
const guest: TerminalRemote = { host: 'guest-pc', title: '同一個 Wi-Fi 上的陌生電腦', address: GUEST, hostKey: 'srv10-guest', files: [dir('/home')], interfaces: [{ name: 'wlan0', address: `${GUEST}/24` }] };

// ---- the laptops ------------------------------------------------------------------------------------------------
const laptopBase = [dir('/etc'), dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/.ssh`, 'learner', 0o700)];
const SUDO = { groups: [{ name: 'sudo', members: ['learner'] }] };
const devServer = { pid: 1500, user: 'learner', command: 'python3 -m http.server --bind 127.0.0.1 8000', stat: 'S', listen: [{ address: '127.0.0.1', port: 8000, fd: 3, http: 'dev' }] };
const laptopCommon = {
  user: 'learner', host: 'laptop', cwd: HOME, profile: 'tunnels' as const, ...CLOCK, accounts: SUDO,
  address: LAPTOP, interfaces: [{ name: 'eth0', address: `${LAPTOP}/24` }],
  files: [...laptopBase, file(`${HOME}/.ssh/id_ed25519`, LAPTOP_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${LAPTOP_KEY.publicLine}\n`, 'learner'),
    file(`${HOME}/.ssh/known_hosts`, KNOWN_HOSTS, 'learner')],
  responders: [{ id: 'dev', server: 'SimpleHTTP/0.6 Python/3.12.3', routes: [{ path: '/*', body: '出貨報表預覽（laptop 上的開發伺服器）\n', type: 'text/plain' }] }],
};
/** The learner's laptop: its key on every server, known_hosts from IT, a development server on 127.0.0.1:8000. */
const laptop: TerminalMachine = {
  id: 'srv10-laptop', title: '筆電 laptop（金鑰與 known_hosts 已設定）', ...laptopCommon,
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, devServer],
  remotes: [bastion, db01, mon01],
};
/** The new laptop: the work key has a name of its own (id_work); id_ed25519 is the personal key no server knows. */
const nb02: TerminalMachine = {
  id: 'srv10-nb02', title: '新筆電 nb-02（工作金鑰 id_work）', user: 'learner', host: 'nb-02', cwd: HOME, profile: 'tunnels', ...CLOCK,
  address: NB02, interfaces: [{ name: 'eth0', address: `${NB02}/24` }],
  files: [...laptopBase, file(`${HOME}/.ssh/id_ed25519`, PERSONAL_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_ed25519.pub`, `${PERSONAL_KEY.publicLine}\n`, 'learner'),
    file(`${HOME}/.ssh/id_work`, WORK_KEY.privateText, 'learner', 0o600), file(`${HOME}/.ssh/id_work.pub`, `${WORK_KEY.publicLine}\n`, 'learner'),
    file(`${HOME}/.ssh/known_hosts`, KNOWN_HOSTS, 'learner')],
  remotes: [bastion, db01, mon01],
};
/** The laptop on a café's Wi-Fi three days after a debugging session: two background tunnels were never stopped. */
const forgotten: TerminalMachine = {
  id: 'srv10-forgotten', title: '筆電 laptop（在咖啡店的 Wi-Fi 上）', ...laptopCommon, boot: '2026-11-18 09:00:00',
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { ...devServer, start: '2026-11-22 09:05:00' },
    { pid: 2140, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/1', start: '2026-11-22 09:12:00' },
    { pid: 2163, ppid: 2140, user: 'learner', command: 'ssh ops@bastion', stat: 'S+', tty: 'pts/1', start: '2026-11-22 09:12:00' },
    { pid: 2388, user: 'learner', command: 'ssh -f -N -g -L 5433:db-01:5432 ops@bastion', stat: 'Ss', start: '2026-11-19 16:42:00', listen: [{ port: 5433, fd: 4, backlog: 128 }] },
    { pid: 2391, user: 'learner', command: 'ssh -f -N -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01', stat: 'Ss', start: '2026-11-19 16:45:00', listen: [{ address: '127.0.0.1', port: 9090, fd: 4, backlog: 128 }] }],
  remotes: [bastion, db01, mon01, guest],
};

// ---- network scenes ----------------------------------------------------------------------------------------------
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
/** An SSH packet: its message, whether SSH encrypts it, and what it carries. */
const ssh = (message: string, encrypted: boolean, fields: { name: string; value: string }[] = []): ProtocolHeader => ({ layer: 'application', protocol: 'SSH-2.0', fields: [
  { name: '訊息', value: message }, { name: 'SSH 加密', value: encrypted ? '是' : '否' }, ...fields] });
/** A PostgreSQL message as it travels outside SSH (db-01 has no TLS here). */
const pg = (message: string, fields: { name: string; value: string }[] = []): ProtocolHeader => ({ layer: 'application', protocol: 'PostgreSQL', fields: [
  { name: '訊息', value: message }, { name: 'SSH 加密', value: '否' }, ...fields] });
const LO = '127.0.0.1';
const PG_ACTIVITY = '連線紀錄（pg_stat_activity）';
const forwardTable = (changed: number[]): NodeTable => ({ node: 'ssh', name: 'ssh 的轉送', head: ['項目', '值'], changed, rows: [
  ['監聽', `${LO}:5433（-L 5433:db-01:5432）`], ['SSH 連線', `${LAPTOP}:50022 → ${BASTION_PUB}:22`], ['轉送到', 'db-01:5432（名稱由 bastion 解析）']] });
const channelTable = (changed: number[], state: string): NodeTable => ({ node: 'bastion', name: 'sshd 的 channel', head: ['channel', '類型', '目的', '發起者', '狀態'], changed, rows: [
  ['2', 'direct-tcpip', 'db-01:5432', `${LO}:51544`, state]] });

/** Section 4: psql on the laptop reaches PostgreSQL on db-01 through ssh -L 5433:db-01:5432 ops@bastion. */
const localForward: NetworkScene = {
  id: 'srv10-local-forward', title: '本機轉送：psql 經由 bastion 連到 db-01 的 PostgreSQL', model: 'tcp-ip',
  description: `learner 先在筆電執行 \`ssh -f -N -L 5433:db-01:5432 ops@bastion\`：ssh 登入 bastion 之後留在背景，在筆電的 ${LO}:5433 監聽。接著執行 \`psql -h ${LO} -p 5433 -U report shipdb\`（db-01 的 PostgreSQL 沒有開 TLS）。逐步看資料在三段路上的樣子：哪一段有 SSH 加密、每一段的來源位址是誰，以及 db-01 最後記錄的連線來源。`,
  nodes: [
    { id: 'psql', label: '筆電上的 psql', kind: 'host', addresses: [`IP ${LO}（lo）`, 'TCP 51544'] },
    { id: 'ssh', label: '筆電上的 ssh（-L 監聽）', kind: 'host', addresses: [`監聽 ${LO}:5433`, `對外 IP ${LAPTOP}`] },
    { id: 'bastion', label: 'bastion（sshd）', kind: 'server', addresses: [`公開 IP ${BASTION_PUB}`, `內網 IP ${BASTION_PRIV}`] },
    { id: 'db', label: 'db-01（PostgreSQL）', kind: 'server', addresses: [`IP ${DB}`, 'TCP 5432'] },
  ],
  messages: [
    { id: 'lo-connect', from: 'psql', to: 'ssh', label: `TCP 連到 ${LO}:5433（lo）`, headers: [tcp('51544', '5433', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(LO, LO)],
      payload: '三個區段都沒有資料',
      note: `psql 以為自己在連一台本機的 PostgreSQL。接受這條連線的是 ssh：它在 -L 指定的 ${LO}:5433 監聽（\`ss -tlnp\` 看得到 users:(("ssh",…))）。這段封包走迴路介面 lo，從來不離開筆電，所以同一個 Wi-Fi 上的人看不到它；但筆電上的任何程式、任何使用者也都能連這個埠。`,
      tables: [forwardTable([0])] },
    { id: 'channel-open', from: 'ssh', to: 'bastion', label: 'CHANNEL_OPEN direct-tcpip（在 SSH 連線裡）',
      headers: [ssh('SSH_MSG_CHANNEL_OPEN（90）', true, [{ name: 'channel 類型', value: 'direct-tcpip' }, { name: '要連的主機與埠', value: 'db-01:5432' }, { name: '發起者', value: `${LO}:51544` }]),
        tcp('50022', '22', 'PSH, ACK'), ipv4(LAPTOP, BASTION_PUB)],
      payload: '密文',
      note: 'ssh 收到新連線，就在早已建立、加密的 SSH 連線裡開一個新的 channel，類型是 direct-tcpip（RFC 4254），內容是「請替我連到 db-01:5432」。網路上的人只看得到筆電與 bastion 的 22 埠之間有加密的資料，連目的地 db-01 這個名稱都在密文裡。注意 ssh 不會自己解析 db-01：名稱原封不動交給伺服器那一端。',
      tables: [forwardTable([1, 2]), channelTable([0], '連線中')] },
    { id: 'bastion-connect', from: 'bastion', to: 'db', label: 'bastion 連到 db-01:5432', headers: [tcp('41870', '5432', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(BASTION_PRIV, DB)],
      payload: '三個區段都沒有資料',
      note: `bastion 的 sshd 先確認 AllowTcpForwarding 允許本機轉送，再自己解析 db-01（用它的 /etc/hosts 或 DNS），從內網介面 ${BASTION_PRIV} 開一條全新的 TCP 連線。對 db-01 來說，這只是 bastion 連過來的一般連線，它的防火牆與 pg_hba.conf 看到的來源都是 ${BASTION_PRIV}。如果 db-01:5432 沒有程式在聽，這一步失敗，筆電上背景的 ssh 印出 channel 2: open failed: connect failed: Connection refused。` },
    { id: 'channel-confirm', from: 'bastion', to: 'ssh', label: 'CHANNEL_OPEN_CONFIRMATION', headers: [ssh('SSH_MSG_CHANNEL_OPEN_CONFIRMATION（91）', true), tcp('22', '50022', 'PSH, ACK'), ipv4(BASTION_PUB, LAPTOP)],
      payload: '密文',
      note: '連上之後 sshd 回覆確認，channel 2 開始雙向傳送資料。之後 psql 與 PostgreSQL 之間的每一個位元組，在筆電與 bastion 之間都包在這個 channel 裡；同一條 SSH 連線可以同時有很多個 channel（每一個被轉送的 TCP 連線一個）。',
      tables: [channelTable([0], '已開啟')] },
    { id: 'pg-startup-lo', from: 'psql', to: 'ssh', label: 'StartupMessage（lo）',
      headers: [pg('StartupMessage', [{ name: '使用者', value: 'report' }, { name: '資料庫', value: 'shipdb' }]), tcp('51544', '5433', 'PSH, ACK'), ipv4(LO, LO)],
      payload: 'user=report、database=shipdb（明文，但只在筆電裡）',
      note: 'psql 預設會先送 SSLRequest 問伺服器要不要用 TLS；db-01 沒有開 TLS，回答 N，於是 psql 送出明文的 StartupMessage。它先交給本機的 ssh，仍然沒有離開筆電。' },
    { id: 'pg-startup-tunnel', from: 'ssh', to: 'bastion', label: 'CHANNEL_DATA（裝著 StartupMessage）',
      headers: [ssh('SSH_MSG_CHANNEL_DATA（94）', true, [{ name: 'channel', value: '2' }, { name: '內容', value: 'PostgreSQL 的 StartupMessage' }]), tcp('50022', '22', 'PSH, ACK'), ipv4(LAPTOP, BASTION_PUB)],
      payload: '密文',
      note: 'ssh 把 psql 送來的位元組放進 channel 2 的 CHANNEL_DATA，用 SSH 連線的金鑰加密後送到 bastion。這是唯一經過網際網路的一段，也是 SSH 保護的那一段：路上的人看不到帳號、資料庫名稱與查詢內容。' },
    { id: 'db-startup', from: 'bastion', to: 'db', label: 'StartupMessage（內網）',
      headers: [pg('StartupMessage', [{ name: '使用者', value: 'report' }, { name: '資料庫', value: 'shipdb' }]), tcp('41870', '5432', 'PSH, ACK'), ipv4(BASTION_PRIV, DB)],
      payload: 'user=report、database=shipdb（明文）',
      note: `bastion 解開 SSH 的加密，把原本的位元組送進它和 db-01 之間的那條 TCP 連線。內網這一段沒有 SSH 的保護，PostgreSQL 的協定照原樣傳送。db-01 記錄的 client_addr 是 bastion 的內網位址 ${BASTION_PRIV}，不是筆電的 ${LAPTOP}，也不是 ${LO}。要保護這一段，就讓 PostgreSQL 自己開 TLS，或讓通道的終點就在 db-01 上（\`ssh -L 5433:127.0.0.1:5432 -J ops@bastion ops@db-01\`）。`,
      tables: [{ node: 'db', name: PG_ACTIVITY, head: ['欄位', '值'], changed: [0, 1, 2, 3], rows: [
        ['client_addr', BASTION_PRIV], ['client_port', '41870'], ['usename', 'report'], ['datname', 'shipdb']] }] },
    { id: 'db-reply', from: 'db', to: 'bastion', label: '認證與查詢結果（摘要）',
      headers: [pg('伺服器的回應（摘要）', [{ name: '內容', value: '認證要求、伺服器參數、查詢結果' }]), tcp('5432', '41870', 'PSH, ACK'), ipv4(DB, BASTION_PRIV)],
      payload: '明文',
      note: 'PostgreSQL 依 pg_hba.conf 檢查來源 10.30.0.10 與帳號 report，要求認證，再回傳查詢結果。這些回應走同一條路回去：內網這段是明文。' },
    { id: 'reply-tunnel', from: 'bastion', to: 'ssh', label: 'CHANNEL_DATA（裝著回應）',
      headers: [ssh('SSH_MSG_CHANNEL_DATA（94）', true, [{ name: 'channel', value: '2' }, { name: '內容', value: 'PostgreSQL 的回應' }]), tcp('22', '50022', 'PSH, ACK'), ipv4(BASTION_PUB, LAPTOP)],
      payload: '密文',
      note: 'sshd 把收到的回應放進 channel 2，加密後送回筆電。' },
    { id: 'reply-lo', from: 'ssh', to: 'psql', label: '回應交給 psql（lo）',
      headers: [pg('伺服器的回應（摘要）', [{ name: '內容', value: '認證要求、伺服器參數、查詢結果' }]), tcp('5433', '51544', 'PSH, ACK'), ipv4(LO, LO)],
      payload: '明文，只在筆電裡',
      note: 'ssh 解密後交給 psql，psql 完全不知道中間經過了兩台機器。關掉 psql 只會關閉 channel 2；SSH 連線與 5433 的監聽還在，直到 ssh 行程結束（kill 或 pkill）。',
      tables: [forwardTable([])] },
  ],
};

const SEEN = 'bastion 看得到的內容';
const seen = (n: number, changed: number[]): NodeTable => ({ node: 'bastion', name: SEEN, head: ['項目', 'bastion 看得到嗎'], changed, rows: [
  ['laptop 的位址與登入的帳號 ops', '看得到'], ['要轉送的目的地 db-01:22', '看得到'], ['內層的主機金鑰驗證', '看不到'], ['內層的使用者認證', '看不到'],
  ['在 db-01 執行的指令與輸出', '看不到'], ['laptop 的私鑰', '看不到']].slice(0, n) });

/** Section 2: ssh -J ops@bastion ops@db-01 hostname — an SSH connection inside an SSH connection. */
const proxyJump: NetworkScene = {
  id: 'srv10-proxyjump', title: 'ProxyJump：bastion 轉送的是加密過的 SSH', model: 'tcp-ip',
  description: 'learner 在筆電執行 `ssh -J ops@bastion ops@db-01 hostname`。ssh 先登入 bastion（外層連線），再請 bastion 開一條到 db-01:22 的通道，然後經由這條通道和 db-01 自己做一次完整的 SSH 交握與認證（內層連線）。逐步看 bastion 的「看得到的內容」表：它知道誰要連到哪裡，卻讀不到內層的任何東西。',
  nodes: [
    { id: 'laptop', label: 'laptop（ssh 用戶端）', kind: 'host', addresses: [`IP ${LAPTOP}`, '私鑰 ~/.ssh/id_ed25519', 'known_hosts：bastion、db-01'] },
    { id: 'bastion', label: 'bastion（sshd）', kind: 'server', addresses: [`公開 IP ${BASTION_PUB}`, `內網 IP ${BASTION_PRIV}`] },
    { id: 'db', label: 'db-01（sshd）', kind: 'server', addresses: [`IP ${DB}`, 'TCP 22'] },
  ],
  messages: [
    { id: 'outer-login', from: 'laptop', to: 'bastion', label: '外層連線：登入 bastion（摘要）',
      headers: [ssh('版本交換、金鑰交換與 publickey 認證（摘要）', true, [{ name: '帳號', value: 'ops' }]), tcp('50031', '22', 'SYN、…、PSH, ACK'), ipv4(LAPTOP, BASTION_PUB)],
      payload: '金鑰交換之後都是密文',
      note: '和 LNX12 看過的步驟相同：laptop 用 known_hosts 驗證 bastion 的主機金鑰，再以 ops 的金鑰登入。這是外層連線。bastion 當然知道是誰、從哪個位址登入。',
      tables: [seen(1, [0])] },
    { id: 'jump-channel', from: 'laptop', to: 'bastion', label: 'CHANNEL_OPEN direct-tcpip db-01:22',
      headers: [ssh('SSH_MSG_CHANNEL_OPEN（90）', true, [{ name: 'channel 類型', value: 'direct-tcpip' }, { name: '要連的主機與埠', value: 'db-01:22' }]), tcp('50031', '22', 'PSH, ACK'), ipv4(LAPTOP, BASTION_PUB)],
      payload: '密文（外層的金鑰）',
      note: '-J 用的是和 -L 相同的 direct-tcpip channel，只是轉送的目的地是 db-01 的 22 埠，而且接在 ssh 自己身上，不在本機開監聽的埠。舊的寫法是 `ProxyCommand ssh -W %h:%p bastion`，ProxyJump 是它的簡寫。因為是 TCP 轉送，bastion 的 AllowTcpForwarding 是 no 時，-J 會得到 administratively prohibited。',
      tables: [seen(2, [1])] },
    { id: 'jump-connect', from: 'bastion', to: 'db', label: 'bastion 連到 db-01:22', headers: [tcp('41902', '22', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(BASTION_PRIV, DB)],
      payload: '三個區段都沒有資料',
      note: `bastion 解析 db-01，從內網位址 ${BASTION_PRIV} 連到 db-01 的 22 埠。db-01 只接受來自 bastion 的連線，這一步才可能成功；從筆電直接連會逾時。` },
    { id: 'inner-kex', from: 'db', to: 'bastion', label: '內層：版本字串與金鑰交換（摘要）',
      headers: [ssh('版本字串、KEXINIT、KEX_ECDH_REPLY（內層）', false, [{ name: '主機金鑰', value: 'db-01 的 ssh-ed25519 主機金鑰與簽章' }]), tcp('22', '41902', 'PSH, ACK'), ipv4(DB, BASTION_PRIV)],
      payload: '公開的資料：版本字串、演算法清單、公鑰與簽章',
      note: 'db-01 的 sshd 送出版本字串與金鑰交換的訊息，bastion 把它們原封不動放進外層的 channel 轉給 laptop。金鑰交換發生在 laptop 與 db-01 之間，bastion 只轉送公開的部分，算不出內層的金鑰。laptop 用自己的 known_hosts 驗證 db-01 的主機金鑰，所以 bastion 也無法冒充 db-01。',
      tables: [seen(3, [2])] },
    { id: 'inner-auth', from: 'bastion', to: 'db', label: '內層：USERAUTH_REQUEST publickey',
      headers: [ssh('SSH_MSG_USERAUTH_REQUEST（50），內層', true, [{ name: '加密的金鑰', value: 'laptop 與 db-01 之間的內層金鑰' }]), tcp('41902', '22', 'PSH, ACK'), ipv4(BASTION_PRIV, DB)],
      payload: '內層的密文',
      note: `laptop 用內層的金鑰加密認證請求（帳號、公鑰、用私鑰做的簽章），經外層的 channel 交給 bastion，bastion 只能把看不懂的位元組轉給 db-01。私鑰從未離開 laptop。db-01 的 journal 記錄 Accepted publickey for ops from ${BASTION_PRIV}：它看到的來源是 bastion。`,
      tables: [seen(4, [3]), { node: 'db', name: 'sshd 的 journal', head: ['訊息'], changed: [0], rows: [[`Accepted publickey for ops from ${BASTION_PRIV} port 41902 ssh2`]] }] },
    { id: 'inner-exec', from: 'db', to: 'bastion', label: '內層：hostname 的輸出',
      headers: [ssh('SSH_MSG_CHANNEL_DATA（94），內層', true, [{ name: '內容', value: 'db-01（解密後才看得到）' }]), tcp('22', '41902', 'PSH, ACK'), ipv4(DB, BASTION_PRIV)],
      payload: '內層的密文',
      note: '指令與輸出也都在內層加密裡，bastion 只看得到封包的大小與時間。這就是 ProxyJump 的安全性：跳板機只負責轉送，即使它被入侵，攻擊者也讀不到內層的內容、拿不到你的私鑰。對照 agent 轉送（ssh -A）：那時 bastion 上的程式可以拿你的 agent 去登入別台主機。',
      tables: [seen(6, [4, 5])] },
  ],
};

export const SRV10: LessonContent = {
  lessonId: 'SRV10',
  motivation: '物流公司 shipdb 的正式資料庫在內網，報表組今天要你查一筆異常的出貨紀錄。最快的方法好像是把 db-01 的 5432 開到網際網路上，再設一個強密碼——但每一個開在網際網路上的埠，都會在幾分鐘內被全世界的掃描器找到。這一課學會專業的做法：整個內網只有一台跳板機（bastion）的 SSH 對外，其他主機只有 bastion 連得到；用 `ssh -J` 與 `~/.ssh/config` 的 ProxyJump 經由它管理內網主機；用 SSH 的本機轉送把內網的資料庫與管理頁面安全地「拉」到自己筆電的 127.0.0.1，用遠端轉送把筆電上的服務暫時借給伺服器；最後學會找出並關掉被遺忘的背景通道，以及在 sshd 上限制轉送，讓跳板機真正縮小攻擊面。',
  sections: [
    {
      id: 'srv10-s-bastion', title: '跳板機與最小暴露：只開一扇門',
      blocks: [
        { type: 'p', text: '攻擊面（attack surface）是攻擊者能接觸到的所有入口：每一個對網際網路開放的埠、每一個跑在上面的服務版本、每一個能登入的帳號。最小暴露（minimal exposure）的原則是只開放真正必要的入口，其他的一律讓外面連不到。資料庫、監控頁面、管理介面這類內部服務，從來不需要讓網際網路上的人直接連線。' },
        { type: 'p', text: '跳板機（bastion host，也叫 jump host）是這個原則的標準做法：它是內網唯一有公開位址的主機，通常有兩張網路卡，一張接網際網路、一張接內網；它只開放 SSH，只允許金鑰登入，上面不跑其他服務。內網的主機沒有公開位址，或者防火牆、雲端的安全群組只允許來自 bastion 的連線。要管理內網時，先登入 bastion，再由它連進去。' },
        { type: 'table', head: ['做法', '從網際網路看得到的入口', '風險'], rows: [
          ['每台主機都有公開位址，各自開 SSH 與服務', 'db-01:22、db-01:5432、mon-01:22、mon-01:3000……', '每一個服務的漏洞、弱密碼、錯誤設定都直接面對全世界的掃描'],
          ['只有 bastion 對外，而且只開 22', 'bastion:22', '只要守好一台主機的 SSH：金鑰登入、即時更新、限制轉送、看它的日誌'],
          ['VPN 進內網', 'VPN 伺服器的埠', '同樣只有一個入口；連上之後通常能看到整個網段，權限要另外切分'],
        ] },
        { type: 'p', text: '本課的網路：bastion 的公開位址是 203.0.113.10，內網位址是 10.30.0.10；資料庫 db-01（10.30.0.21）跑 PostgreSQL，以及一個只綁在它自己 127.0.0.1:8080 的管理頁面 db-console；監控主機 mon-01（10.30.0.31）的 statusboard 在 3000 埠。db-01 與 mon-01 只有 bastion 連得到，從筆電連過去會逾時（模擬環境以「只有這些主機連得到」表示私有網段，真實環境靠路由、防火牆或安全群組做到同樣的事）。bastion 的 ufw 預設拒絕連入，只允許 OpenSSH。' },
        { type: 'p', text: '下面的紀錄先確認這道門的形狀：從筆電只連得到 bastion 的 22 埠，db-01 的 5432 與 22 都逾時；從 bastion 上則連得到 db-01。接著用 `ssh -J`（ProxyJump，下一節）經由 bastion 登入 db-01，最後看 db-01 的 sshd 記錄了什麼來源位址。' },
        { type: 'example', id: 'srv10-jump' },
        { type: 'p', text: '最後一行值得注意：db-01 記錄的來源是 bastion 的內網位址 10.30.0.10，不是筆電的位址。對內網主機來說，所有管理連線都來自 bastion，所以它們的防火牆只要允許 10.30.0.10；但也因此，要追查「是誰」登入，要對照 bastion 自己的日誌（誰在什麼時間登入 bastion、開了哪些轉送）。跳板機的日誌是整個內網的稽核起點。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：服務有密碼，開在網際網路上也沒關係', text: '密碼只擋住「猜不到密碼的人」，擋不住服務本身的漏洞、預設帳號、設定錯誤或撞庫。資料庫的 5432、Redis 的 6379、各種管理頁面一旦對外，掃描器很快就會找到，而它們的協定通常沒有為了面對整個網際網路而設計。正確的做法是讓它們根本連不到：內部服務綁在內網位址或 127.0.0.1，對外只留 bastion 的 SSH，需要時用 SSH 通道進去。' },
      ],
    },
    {
      id: 'srv10-s-jump', title: 'ssh -J：經由跳板機登入內網主機',
      blocks: [
        { type: 'p', text: '`ssh -J 使用者@跳板機 使用者@目的主機` 讓 ssh 先登入跳板機，再請跳板機開一條 TCP 通道到目的主機的 22 埠，然後經由這條通道和目的主機「直接」做 SSH 交握與認證。這個功能叫 ProxyJump（OpenSSH 7.3 起提供；更早的寫法是 `ProxyCommand ssh -W %h:%p 跳板機`）。可以串接多個跳板機：`-J a,b` 依序經過 a 與 b。' },
        { type: 'table', head: ['重點', '說明'], rows: [
          ['誰解析目的主機的名稱', '跳板機：db-01 只要在 bastion 的 `/etc/hosts` 或內網 DNS 查得到即可，筆電不需要知道它的位址'],
          ['用哪一台的金鑰與 known_hosts', '筆電的：兩段登入都用筆電上的私鑰，db-01 的主機金鑰也記在筆電的 `~/.ssh/known_hosts`（名稱是 db-01）'],
          ['跳板機需要什麼', '它的 sshd 允許本機轉送（`AllowTcpForwarding` 是 yes 或 local），你在跳板機上有帳號'],
          ['命令列的選項給誰', '只給目的主機：`-i`、`-o StrictHostKeyChecking=…` 等不會套用到跳板機。跳板機的設定要寫在 `~/.ssh/config`，或事先把它加進 known_hosts'],
          ['失敗時的訊息', '跳板機連不到目的主機：`channel 0: open failed: connect failed: Connection timed out`（或 Name or service not known、Connection refused）、`stdio forwarding failed`；跳板機不允許轉送：`administratively prohibited: open failed`'],
        ] },
        { type: 'p', text: '下面的情境拆開 `ssh -J ops@bastion ops@db-01 hostname` 的封包，看 bastion 在每一步看得到什麼。外層是筆電到 bastion 的 SSH 連線；內層是筆電到 db-01 的另一條完整的 SSH 連線，它的封包裝在外層的 channel 裡經過 bastion。' },
        { type: 'example', id: 'srv10-proxyjump' },
        { type: 'p', text: '另一種常見的做法是 agent 轉送：`ssh -A ops@bastion` 登入跳板機，再在 bastion 上執行 `ssh db-01`。私鑰雖然還在筆電的 ssh-agent 裡，但 bastion 上會出現一個代表你 agent 的 socket（環境變數 `SSH_AUTH_SOCK`）。在你連線的期間，bastion 的 root 或入侵 bastion 的人都能用這個 socket 要你的 agent 替他簽章，以你的身分登入任何接受這把金鑰的主機；他拿不走私鑰，卻能使用它。ProxyJump 完全不需要在 bastion 上做認證，內層的加密與認證都在筆電與目的主機之間完成，所以應該優先使用 ProxyJump，並在跳板機上關閉 agent 轉送（第六節）。' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：用 ssh -A 登入跳板機，再從跳板機 ssh 進內網', text: '這個習慣很普遍，因為「方便」：不用在跳板機放私鑰，也能從那裡繼續連。但 agent 轉送把你的簽章能力借給了跳板機，而跳板機正是整個架構中最常被攻擊的主機。也有人乾脆把私鑰複製到跳板機上，那更糟：私鑰離開了你的電腦（LNX12）。用 `ssh -J` 或 `~/.ssh/config` 的 ProxyJump，跳板機上什麼秘密都不需要。' },
      ],
    },
    {
      id: 'srv10-s-config', title: '~/.ssh/config：Host 區塊與 ProxyJump',
      blocks: [
        { type: 'p', text: '每次都打 `ssh -J ops@bastion ops@db-01` 很累，也容易打錯。用戶端的設定檔 `~/.ssh/config` 可以替每台主機記住連線方式：檔案由 `Host 樣式` 開始一個區塊，下面縮排的每一行是一個設定。之後只要打 `ssh db-01`，ssh 就會套用符合的區塊。' },
        { type: 'table', head: ['設定', '作用', '例子'], rows: [
          ['`Host 樣式…`', '開始一個區塊；樣式比對你在命令列打的名稱，可以寫多個、用 `*` 與 `?`，`!` 表示排除', '`Host db-01 mon-01`、`Host 10.30.0.*`'],
          ['`HostName`', '實際要連的名稱或位址；known_hosts 也用它記錄主機金鑰', '`HostName 203.0.113.10`'],
          ['`User`', '登入的帳號，取代 `使用者@` 的寫法', '`User ops`'],
          ['`IdentityFile`', '用哪一把私鑰；可以寫多行，依序嘗試', '`IdentityFile ~/.ssh/id_work`'],
          ['`ProxyJump`', '經由哪一台跳板機（就是 `-J`）；寫 `none` 取消', '`ProxyJump bastion`'],
          ['`Port`', 'sshd 的埠不是 22 時', '`Port 2222`'],
          ['`LocalForward`／`RemoteForward`', '連線時順便建立的 -L／-R（第四、五節）', '`LocalForward 9090 127.0.0.1:8080`'],
        ] },
        { type: 'p', text: '三條規則決定實際採用的值。第一，同一個設定以第一次取得的值為準，所以具體的 Host 區塊放前面，`Host *` 這種通用的預設放在檔案最後；命令列的選項最優先（`IdentityFile`、`LocalForward` 等則會累加）。第二，ProxyJump 指到的跳板機名稱也會套用設定檔：`ProxyJump bastion` 會用 `Host bastion` 區塊的 HostName、User 與 IdentityFile，這正是設定跳板機選項的地方。第三，檔案必須屬於你自己，而且群組與其他人不能寫入，否則 ssh 印出 `Bad owner or permissions on …/.ssh/config` 並拒絕執行；習慣上設成 600。' },
        { type: 'example', id: 'srv10-config' },
        { type: 'callout', tone: 'tip', title: '設定檔裡的跳板機一樣要驗證主機金鑰', text: '`HostName 203.0.113.10` 之後，ssh 在 known_hosts 裡找的名稱是 203.0.113.10，不是 bastion。本課的 known_hosts 由 IT 發放，bastion 那一行寫成 `bastion,203.0.113.10 ssh-ed25519 …`，兩個名稱都找得到。自己設定時，第一次連線前先用 `ssh-keyscan` 與 `ssh-keygen -l` 核對指紋（LNX12）；不要在 `Host *` 寫 `StrictHostKeyChecking no`。' },
      ],
    },
    {
      id: 'srv10-s-local', title: '本機轉送 -L：把內網的服務拉到 127.0.0.1',
      blocks: [
        { type: 'p', text: '本機轉送（local forwarding）讓筆電上的程式連到只有伺服器那一端才連得到的服務。`ssh -L [綁定位址:]本機埠:目的主機:目的埠 使用者@SSH伺服器` 讓 ssh 在筆電上監聽「本機埠」；每有一個程式連進來，ssh 就在 SSH 連線裡開一個 direct-tcpip channel，由 SSH 伺服器那一端連到「目的主機:目的埠」。' },
        { type: 'table', head: ['寫法', '筆電上監聽', '誰連到哪裡'], rows: [
          ['`ssh -L 3000:mon-01:3000 ops@bastion`', '127.0.0.1:3000', 'bastion 連到 mon-01:3000'],
          ['`ssh -L 5433:db-01:5432 ops@bastion`', '127.0.0.1:5433', 'bastion 連到 db-01:5432（本機埠和目的埠不必相同）'],
          ['`ssh -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01`', '127.0.0.1:9090', 'db-01 連到它自己的 127.0.0.1:8080'],
          ['`ssh -g -L 5433:db-01:5432 ops@bastion`（或 `0.0.0.0:5433:…`）', '0.0.0.0:5433', '同一個網路上任何人都能經由你的筆電連到 db-01：幾乎不該這樣做'],
        ] },
        { type: 'p', text: '最容易弄錯的是目的主機寫的名稱由誰解析：答案是 SSH 伺服器那一端。`127.0.0.1` 寫在 -L 裡，指的是 SSH 伺服器自己的迴路位址，不是筆電的。所以 db-01 上只綁 127.0.0.1:8080 的 db-console，經由 bastion 轉送（`-L 9090:db-01:8080 ops@bastion`）會被拒絕：bastion 連的是 db-01 的 10.30.0.21:8080，那裡沒有程式在聽。要讓通道的另一端就是 db-01 自己，SSH 伺服器就得是 db-01，也就是經由 -J 登入 db-01 再寫 127.0.0.1。' },
        { type: 'p', text: '通道常用 `-f -N` 在背景執行：`-N` 表示不在遠端執行任何指令（只要通道），`-f` 表示認證完成後轉到背景，把終端機還給你。下面的情境逐步看一個本機轉送：資料在三段路上各是什麼樣子，以及 db-01 看到的來源是誰。' },
        { type: 'example', id: 'srv10-local-forward' },
        { type: 'example', id: 'srv10-local' },
        { type: 'callout', tone: 'warning', title: '常見誤解：走了 SSH 通道，整條路就都加密了', text: 'SSH 只保護 SSH 用戶端與 SSH 伺服器之間的那一段。`-L 5433:db-01:5432 ops@bastion` 時，bastion 到 db-01 這段是 PostgreSQL 原本的協定，沒有 SSH 的加密；在筆電這一端，127.0.0.1:5433 對筆電上的每個程式與使用者都開放。如果內網那一段也需要保護，讓服務自己開 TLS，或讓通道的終點就在目的主機上（-J 加上 127.0.0.1）。' },
      ],
    },
    {
      id: 'srv10-s-remote', title: '遠端轉送 -R、背景通道與怎麼關掉它們',
      blocks: [
        { type: 'p', text: '遠端轉送（remote forwarding）方向相反：`ssh -R [綁定位址:]遠端埠:目的主機:目的埠 使用者@SSH伺服器` 讓 SSH 伺服器那一端監聽「遠端埠」（由 sshd 的行程持有），連進來的連線經由 SSH 送回用戶端，再由用戶端這一端連到「目的主機:目的埠」。典型用途是暫時讓伺服器使用你筆電上的服務，例如讓同事在 bastion 上預覽你正在開發的報表頁面，或讓沒有對外連線的主機經由你的筆電取得資料。' },
        { type: 'p', text: '遠端埠綁在哪個位址由伺服器的 `GatewayPorts` 決定：預設 `no`，一律只綁伺服器的 127.0.0.1，只有伺服器上的程式能連；`yes` 綁所有位址，任何連得到伺服器的人都能經由它連進你的筆電；`clientspecified` 讓用戶端在 -R 裡指定位址。在跳板機上把 GatewayPorts 打開，等於讓任何人都能在跳板機上開一個公開的埠，直通某個人的筆電，所以幾乎永遠應該維持 no。' },
        { type: 'example', id: 'srv10-remote' },
        { type: 'p', text: '`-f` 的通道是一個沒有終端機的 ssh 行程，關掉終端機視窗也不會結束，很容易被遺忘：三天後它還在監聽，還連著正式環境。找出與關閉的方法：' },
        { type: 'table', head: ['指令', '用途'], rows: [
          ['`ss -tlnp`', '列出監聽中的埠與持有者，通道顯示成 `users:(("ssh",pid=…,fd=4))`；注意位址是 127.0.0.1 還是 0.0.0.0'],
          ['`pgrep -af ssh`、`ps -f -C ssh`', '列出 ssh 行程與完整的指令，從 -L／-R 與目的地認出是哪一個通道；`ps -f` 的 STIME 看得出它開了多久、TTY 是 `?` 表示在背景'],
          ['`kill PID`', '結束指定的通道（送 SIGTERM），它的監聽跟著關閉；它在伺服器上的 -R 監聽也一起消失'],
          ['`pkill -f \'L 9090\'`', '依完整的指令比對來結束。樣式要夠精確：`pkill ssh` 會連你正在使用的 SSH 工作階段一起結束'],
        ] },
        { type: 'callout', tone: 'tip', title: '讓失敗的通道不要默默留在背景', text: '轉送設定失敗（埠被占用、伺服器不允許）時，ssh 預設只印一行 Warning 就繼續執行，於是背景留下一個沒有任何作用的 ssh。真實環境建議加上 `-o ExitOnForwardFailure=yes`（或寫在 config），轉送失敗時 ssh 直接結束、結束碼不是 0。長期使用的通道則交給有人看管的機制，例如 systemd 的服務（LNX10）或 autossh，而不是某個人筆電上的 `-f`。模擬環境不模擬 ExitOnForwardFailure 的效果。' },
      ],
    },
    {
      id: 'srv10-s-sshd', title: 'sshd 的轉送設定：AllowTcpForwarding 與 GatewayPorts',
      blocks: [
        { type: 'p', text: '前面的通道都是用戶端想開就能開的，伺服器的 sshd 決定允許多少。跳板機的帳號只用來「經過」，不需要讓每個人都能開任何方向的轉送：' },
        { type: 'table', head: ['sshd 設定', '值', '效果'], rows: [
          ['`AllowTcpForwarding`', '`yes`（預設，同 `all`）', '本機轉送（含 -J）與遠端轉送都允許'],
          ['`AllowTcpForwarding`', '`local`', '只允許本機轉送：-J 與 -L 可以用，-R 被拒絕（`Warning: remote port forwarding failed for listen port …`）。跳板機常用的設定'],
          ['`AllowTcpForwarding`', '`remote`', '只允許遠端轉送：-L 與 -J 被拒絕（`administratively prohibited`）'],
          ['`AllowTcpForwarding`', '`no`', '都不允許；這台主機不能當跳板機'],
          ['`GatewayPorts`', '`no`（預設）', '-R 的監聽只綁伺服器的 127.0.0.1'],
          ['`GatewayPorts`', '`yes`／`clientspecified`', '-R 可以綁在伺服器的所有位址（或由用戶端指定），把用戶端的服務公開出去'],
          ['`AllowAgentForwarding`', '`no`', '不提供 agent 轉送（`ssh -A` 無效），配合上一節的建議'],
        ] },
        { type: 'p', text: '為什麼要限制：遠端轉送讓任何能登入 bastion 的人，把自己電腦上的東西接到 bastion 上；如果再加上 GatewayPorts yes，就是一個繞過防火牆、公開在網際網路上的後門。只允許 local，跳板機仍然能做它唯一的工作（轉送到內網），卻不能被反過來利用。更細的控制還有：`PermitOpen 主機:埠` 限制本機轉送能連到哪些目的地，`Match User`／`Match Group` 區塊讓不同的人有不同的權限，`DisableForwarding yes` 一次關閉所有轉送。注意：AllowTcpForwarding 是安全設定，不是安全邊界，能在主機上執行指令的使用者仍然可以自己架轉送程式，所以跳板機的帳號也要盡量少、權限盡量小。模擬環境的 sshd 不認得 PermitOpen 與 DisableForwarding，Match 區塊與 AllowAgentForwarding 只接受、不模擬效果。' },
        { type: 'p', text: '改 sshd 設定的步驟和 LNX12 相同：寫成 `sshd_config.d` 裡的 drop-in，`sudo sshd -t` 檢查，`sudo systemctl reload ssh` 套用，並保持一個已登入的工作階段直到新連線測試成功。' },
        { type: 'example', id: 'srv10-sshd' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [proxyJump, localForward],
    exercises: [
      { id: 'srv10-net-source', task: 'table', scene: 'srv10-local-forward', message: 'db-startup', node: 'db', table: PG_ACTIVITY, row: 'client_addr', column: '值', title: 'db-01 看到的來源位址',
        statement: `在「本機轉送」情境中，psql 在筆電（對外 IP ${LAPTOP}）連到 ${LO}:5433，經由 \`ssh -L 5433:db-01:5432 ops@bastion\` 到達 db-01。StartupMessage 送到 db-01 之後，db-01 的「連線紀錄（pg_stat_activity）」表中 client_addr 的值是什麼？`,
        hints: ['db-01 收到的封包是哪一台機器、從哪一張網路卡送出的？', '-L 的目的主機由 SSH 伺服器那一端連線：連到 db-01 的是 bastion 的 sshd，走的是內網。'],
        explanation: `bastion 的 sshd 自己開了一條 TCP 連線到 db-01:5432，從內網介面送出，所以 db-01 看到的來源是 ${BASTION_PRIV}。筆電的 ${LAPTOP} 只出現在筆電與 bastion 之間（db-01 根本看不到這一段）；${LO} 是筆電內部 psql 到 ssh 那一段；bastion 的公開位址 ${BASTION_PUB} 只用在面對網際網路的那一側。db-01 的防火牆與 pg_hba.conf 因此只需要允許 ${BASTION_PRIV}。`,
        mistakes: [
          { answer: { cell: LAPTOP }, why: '以為 SSH 通道會把筆電的位址一路帶到 db-01：通道在 bastion 結束，連到 db-01 的是 bastion 自己開的新連線。' },
          { answer: { cell: LO }, why: `${LO} 是 psql 連到筆電上 ssh 監聽的那一段；它從未離開筆電，db-01 看不到。` },
          { answer: { cell: BASTION_PUB }, why: 'bastion 有兩個位址：公開位址面對網際網路，連到內網的 db-01 時用的是內網介面的位址。' },
        ] },
      { id: 'srv10-net-plain', task: 'field', scene: 'srv10-local-forward', message: 'db-startup', layer: 'application', field: 'SSH 加密', title: '內網這一段有沒有 SSH 加密',
        statement: '同一個情境中，bastion 把 StartupMessage 送到 db-01（第 7 步）。這個 PostgreSQL 訊息的「SSH 加密」欄是什麼？（填「是」或「否」）',
        hints: ['SSH 保護的是 SSH 用戶端到 SSH 伺服器之間。這次的 SSH 伺服器是哪一台？', 'db-01 的 PostgreSQL 在這個情境裡沒有開 TLS。'],
        explanation: 'SSH 連線的兩端是筆電的 ssh 與 bastion 的 sshd，只有它們之間的那一段（第 6 步）有 SSH 加密。bastion 解開加密後，把原本的 PostgreSQL 位元組送到 db-01，所以第 7 步是「否」：內網上的人看得到帳號與查詢。要保護這一段，讓 PostgreSQL 開 TLS，或讓通道的終點在 db-01 自己身上（-J 加上 127.0.0.1）。',
        mistakes: [
          { answer: { value: '是' }, why: '以為走了 SSH 通道整條路都加密：加密在 bastion 就結束了，bastion 到 db-01 是 PostgreSQL 原本的協定。' },
        ] },
      { id: 'srv10-net-inner', task: 'table', scene: 'srv10-proxyjump', message: 'inner-auth', node: 'bastion', table: SEEN, row: '內層的使用者認證', column: 'bastion 看得到嗎', title: 'ProxyJump 時跳板機看得到認證嗎',
        statement: '在「ProxyJump」情境中，laptop 經由 bastion 對 db-01 送出內層的 USERAUTH_REQUEST。之後 bastion 的「bastion 看得到的內容」表中，「內層的使用者認證」這一列是什麼？（填「看得到」或「看不到」）',
        hints: ['內層連線的金鑰交換是誰和誰做的？', 'bastion 只轉送外層 channel 裡的位元組。'],
        explanation: '內層的金鑰交換在 laptop 與 db-01 之間完成，bastion 只轉送公開的部分，算不出內層的金鑰，所以內層的使用者認證、指令與輸出它都看不到；它只知道 laptop 以 ops 登入、要轉送到 db-01:22。這就是 ProxyJump 比 agent 轉送安全的原因：跳板機上不需要任何秘密，也不參與認證。',
        mistakes: [
          { answer: { cell: '看得到' }, why: '以為封包經過 bastion，bastion 就能讀到內容：內層用 laptop 與 db-01 協商的金鑰加密，bastion 只是轉送密文。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv10-q1', prompt: '公司的內網有 db-01（PostgreSQL）與 mon-01（監控頁面），要讓工程師從家裡管理它們。哪一種做法最符合最小暴露？',
      options: ['給 db-01 與 mon-01 公開位址，各自設定強密碼', '把 PostgreSQL 的 5432 改成不常見的 15432 再對外開放', '只有 bastion 對外開放 22（只允許金鑰登入），db-01 與 mon-01 只允許來自 bastion 的連線，經由 SSH 進去', '把 db-01 的 sshd 改成接受任何來源的密碼登入，方便緊急時使用'],
      answer: 2,
      explanation: '跳板機讓整個內網只剩一個入口（bastion 的 SSH），只要守好它就好；內部服務根本連不到，漏洞與設定錯誤也就碰不到。各自公開再加密碼，入口數量不變，服務本身的漏洞照樣暴露；換埠只能躲過最粗糙的掃描，不是存取控制；對任何來源開密碼登入正好是暴力破解的目標。',
    },
    {
      id: 'srv10-q2', prompt: '在筆電執行 `ssh -f -N -L 5433:db-01:5432 ops@bastion` 之後，筆電上的 psql 連到 127.0.0.1:5433。實際連到 db-01:5432 的是誰？',
      options: ['bastion 的 sshd：它解析 db-01，從自己的內網位址連過去', '筆電上的 ssh：它直接連到 db-01 的 10.30.0.21', 'db-01 自己：它主動連回筆電的 5433', 'psql：ssh 只是幫它查出 db-01 的位址'],
      answer: 0,
      explanation: '-L 的目的主機由 SSH 伺服器那一端解析與連線，這裡的 SSH 伺服器是 bastion，所以 db-01 看到的來源是 bastion 的內網位址。筆電連不到 db-01（只有 bastion 連得到），ssh 也不會自己解析目的主機；db-01 不會主動連回筆電；psql 只連到本機的 127.0.0.1:5433，完全不知道 db-01 的位址。',
    },
    {
      id: 'srv10-q3', prompt: 'db-01 的管理頁面 db-console 只綁在 db-01 自己的 127.0.0.1:8080。要讓筆電的 127.0.0.1:9090 連到它，下面哪一個指令正確？',
      options: ['`ssh -f -N -L 9090:db-01:8080 ops@bastion`', '`ssh -f -N -L 9090:127.0.0.1:8080 ops@bastion`', '`ssh -f -N -g -L 9090:db-01:8080 ops@bastion`', '`ssh -f -N -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01`'],
      answer: 3,
      explanation: '-L 裡的 127.0.0.1 指的是 SSH 伺服器自己，所以 SSH 伺服器必須是 db-01：經由 -J 登入 db-01，再轉送到它的 127.0.0.1:8080。經由 bastion 轉送到 db-01:8080，連的是 db-01 的 10.30.0.21:8080，那裡沒有程式在聽（Connection refused）；`-L 9090:127.0.0.1:8080 ops@bastion` 連的是 bastion 自己的 8080；加上 -g 不會改變目的地，只會把筆電的 9090 開給整個網路。',
    },
    {
      id: 'srv10-q4', prompt: 'bastion 的 sshd 是預設的 `GatewayPorts no`。你在筆電執行 `ssh -f -N -R 9000:127.0.0.1:8000 ops@bastion`。誰能連到 bastion 的 9000 埠？',
      options: ['網際網路上的任何人', '只有 bastion 上的程式（經由 bastion 的 127.0.0.1:9000）', '內網的所有主機', '只有你的筆電'],
      answer: 1,
      explanation: 'GatewayPorts no 時，-R 的監聽一律綁伺服器的 127.0.0.1，只有 bastion 自己的程式能連，連線再經由 SSH 送回筆電的 127.0.0.1:8000。要讓網際網路或內網的其他主機連得到，必須把 GatewayPorts 設成 yes 或 clientspecified（跳板機不該這樣做）；9000 埠在 bastion 上，不在筆電上，筆電的程式要連的是自己的 8000。',
    },
    {
      id: 'srv10-q5', prompt: '你懷疑筆電上還留著幾天前開的背景通道。哪一組做法最適合找出並只關掉它？',
      options: ['重新開機，所有通道都會消失', '用 `ss -tlnp` 找出 ssh 持有的監聽埠與 PID，用 `pgrep -af ssh` 確認它的 -L／-R 指令，再 `kill PID` 或用精確的樣式 `pkill -f`', '`pkill ssh`', '在筆電的防火牆加一條規則擋住那個埠'],
      answer: 1,
      explanation: '`ss -tlnp` 列出 ssh 持有的監聽埠，`pgrep -af ssh` 顯示完整的指令，確認是哪一個通道後只結束它。重新開機會中斷其他工作，也沒弄清楚是什麼通道；`pkill ssh` 連正在使用的 SSH 工作階段一起結束；防火牆規則只擋住一部分來源，ssh 仍然連著正式環境、隨時可能被再用到，也沒有解決問題本身。',
    },
    {
      id: 'srv10-q6', prompt: '要從筆電管理內網的 db-01，為什麼建議用 `ssh -J`（ProxyJump），而不是 `ssh -A` 登入 bastion 再從那裡 `ssh db-01`？',
      options: ['ProxyJump 不需要 db-01 的主機金鑰', 'ProxyJump 讓 bastion 替你保管私鑰', 'agent 轉送比較慢，ProxyJump 比較快', 'ProxyJump 時 bastion 只轉送內層的密文，不參與認證；agent 轉送讓 bastion 上的人在你連線期間能用你的 agent 登入別台主機'],
      answer: 3,
      explanation: 'ProxyJump 的內層 SSH 在筆電與 db-01 之間加密與認證，bastion 看不到內容，也不需要任何秘密；agent 轉送在 bastion 上留下一個能替你簽章的 socket，bastion 被入侵時就能被冒用。ProxyJump 仍然要在筆電的 known_hosts 驗證 db-01 的主機金鑰；它不會把私鑰交給 bastion（私鑰從不離開筆電）；兩者的差別在安全性，不在速度。',
    },
    {
      id: 'srv10-q7', prompt: '`~/.ssh/config` 的開頭是 `Host *` 區塊，裡面寫 `User learner`；後面才是 `Host db-01` 區塊，寫著 `User ops` 與 `ProxyJump bastion`。執行 `ssh db-01 hostname` 時，用哪個帳號登入 db-01？',
      options: ['learner：同一個設定以第一次取得的值為準，`Host *` 在前面，所以要把它移到最後', 'ops：比較具體的 Host 區塊一定優先', 'ops：後面的區塊會覆蓋前面的', '兩個帳號都會試'],
      answer: 0,
      explanation: 'ssh_config 依序讀取所有符合的區塊，每個設定只採用第一次取得的值；`Host *` 符合任何名稱，又排在前面，所以 User 是 learner，db-01 上沒有這個帳號而登入失敗。ssh 不會依「具體程度」排序，後面的值也不會覆蓋前面的；User 只有一個值，不會兩個都試。正確的寫法是把 `Host *` 放在檔案最後。',
    },
    {
      id: 'srv10-q8', prompt: '在 bastion 的 sshd 設定 `AllowTcpForwarding local` 並 reload 之後，下面哪一個敘述正確？',
      options: ['所有轉送都被禁止，連 `ssh -J` 都不能用', '只允許 `-R`，`-L` 被拒絕', '`ssh -J` 與 `-L` 照常可用，`-R` 被拒絕', '只影響 root，一般使用者不受限制'],
      answer: 2,
      explanation: 'local 只允許本機轉送；-J 用的 direct-tcpip channel 也是本機轉送，所以 -J 與 -L 都能用，而 -R（遠端轉送）會得到 Warning: remote port forwarding failed。全部禁止是 `no`；只允許遠端轉送是 `remote`；這個設定適用於所有使用者，要分別設定時才用 Match 區塊。',
    },
  ],
  terminal: {
    machines: [laptop, nb02, forgotten],
    examples: [
      {
        id: 'srv10-jump', title: '只有一扇門：連不到的內網與 ssh -J', machine: 'srv10-laptop',
        description: '從筆電只連得到 bastion 的 22 埠，db-01 的 5432 與 22 都逾時；bastion 的 ufw 只允許 OpenSSH，它有公開與內網兩個介面，從它那裡連得到 db-01。`ssh -J` 經由 bastion 登入 db-01，db-01 的 journal 記錄的來源是 bastion 的內網位址。',
        steps: [
          { command: 'nc -zv bastion 22', output: 'Connection to bastion (203.0.113.10) 22 port [tcp/ssh] succeeded!' },
          { command: 'nc -zv -w 3 db-01 5432', output: 'nc: connect to db-01 (10.30.0.21) port 5432 (tcp) timed out: Operation now in progress' },
          { command: 'ssh ops@db-01 hostname', output: 'ssh: connect to host db-01 port 22: Connection timed out' },
          { command: 'ssh ops@bastion sudo ufw status', output: 'Status: active\n\nTo                         Action      From\n--                         ------      ----\nOpenSSH                    ALLOW       Anywhere\nOpenSSH (v6)               ALLOW       Anywhere (v6)\n' },
          { command: 'ssh ops@bastion ip -br -4 addr', output: 'lo               UNKNOWN        127.0.0.1/8\neth0             UP             203.0.113.10/24\neth1             UP             10.30.0.10/24' },
          { command: 'ssh ops@bastion nc -zv db-01 5432', output: 'Connection to db-01 (10.30.0.21) 5432 port [tcp/postgresql] succeeded!' },
          { command: 'ssh -J ops@bastion ops@db-01 hostname', output: 'db-01' },
          { command: 'ssh -J ops@bastion ops@db-01 sudo journalctl -u ssh -o cat -n 1', output: 'Accepted publickey for ops from 10.30.0.10 port 50007 ssh2: ED25519 SHA256:zxtMUgl6A3CERbq9CY9Vry3p0SlS9lx6fltU+BDRXh4' },
        ],
      },
      {
        id: 'srv10-config', title: '把連線方式寫進 ~/.ssh/config', machine: 'srv10-laptop',
        description: '用 printf 寫出兩個 Host 區塊：bastion（HostName、User）與 db-01、mon-01（User、ProxyJump），設成 600；之後 `ssh db-01`、`ssh mon-01` 直接經由 bastion 登入。設定檔讓群組可寫時 ssh 拒絕執行，改回 600 就恢復。',
        steps: [
          { command: 'printf \'Host bastion\\n  HostName 203.0.113.10\\n  User ops\\n\\nHost db-01 mon-01\\n  User ops\\n  ProxyJump bastion\\n\' > ~/.ssh/config', output: '' },
          { command: 'chmod 600 ~/.ssh/config', output: '' },
          { command: 'cat ~/.ssh/config', output: 'Host bastion\n  HostName 203.0.113.10\n  User ops\n\nHost db-01 mon-01\n  User ops\n  ProxyJump bastion' },
          { command: 'ssh db-01 hostname', output: 'db-01' },
          { command: 'ssh mon-01 \'hostname; whoami\'', output: 'mon-01\nops' },
          { command: 'ssh bastion hostname', output: 'bastion' },
          { command: 'chmod 664 ~/.ssh/config', output: '' },
          { command: 'ssh db-01 hostname', output: 'Bad owner or permissions on /home/learner/.ssh/config' },
          { command: 'chmod 600 ~/.ssh/config', output: '' },
          { command: 'ssh db-01 hostname', output: 'db-01' },
        ],
      },
      {
        id: 'srv10-local', title: '本機轉送：監控頁面、資料庫，以及一個連不到的管理頁面', machine: 'srv10-laptop',
        description: '經由 bastion 把 mon-01 的 3000 轉到筆電的 127.0.0.1:3000，ss 顯示 ssh 持有這個監聽；db-01 的 5432 轉到 5433；`-N` 沒有 `-f` 時模擬環境拒絕。db-01 的 db-console 只綁它自己的 127.0.0.1:8080，經由 bastion 轉送時背景的 ssh 印出 channel 錯誤、curl 得到空的回應；從 bastion 與 db-01 自己看就知道原因。怎麼修正留給練習。',
        steps: [
          { command: 'ssh -f -N -L 3000:mon-01:3000 ops@bastion', output: '' },
          { command: 'ss -tlnp sport = :3000', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128        127.0.0.1:3000      0.0.0.0:*    users:(("ssh",pid=1501,fd=4))' },
          { command: 'curl -s http://127.0.0.1:3000/', output: 'statusboard：db-01 ok, mon-01 ok' },
          { command: 'ssh -f -N -L 5433:db-01:5432 ops@bastion', output: '' },
          { command: 'nc -zv 127.0.0.1 5433', output: 'Connection to 127.0.0.1 5433 port [tcp/*] succeeded!' },
          { command: 'ssh -N -L 3001:mon-01:3000 ops@bastion', output: 'ssh：模擬環境的 ssh -N 會一直佔住這個終端機（要按 Ctrl-C 才結束）；請加 -f 讓它在背景執行：ssh -f -N …' },
          { command: 'ssh -f -N -L 9090:db-01:8080 ops@bastion', output: '' },
          { command: 'curl -sS http://127.0.0.1:9090/status', output: 'channel 2: open failed: connect failed: Connection refused\ncurl: (52) Empty reply from server' },
          { command: 'ssh ops@bastion nc -zv db-01 8080', output: 'nc: connect to db-01 (10.30.0.21) port 8080 (tcp) failed: Connection refused' },
          { command: 'ssh -J ops@bastion ops@db-01 ss -tln sport = :8080', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      4096       127.0.0.1:8080      0.0.0.0:*' },
          { command: 'pkill -f \'L 9090\'', output: '' },
          { command: 'ss -tlnp sport = :9090', output: 'State Recv-Q Send-Q Local Address:Port Peer Address:Port Process' },
        ],
      },
      {
        id: 'srv10-remote', title: '遠端轉送：把筆電的開發伺服器借給 bastion', machine: 'srv10-laptop',
        description: '筆電的開發伺服器只綁 127.0.0.1:8000；`-R 9000:127.0.0.1:8000` 讓 bastion 的 127.0.0.1:9000 由 sshd 持有（GatewayPorts no），bastion 上的 curl 拿到筆電的頁面。用 `pgrep -af ssh` 找出背景的 ssh，`pkill -f` 結束它，bastion 上的監聽也跟著消失。',
        steps: [
          { command: 'curl -s http://127.0.0.1:8000/', output: '出貨報表預覽（laptop 上的開發伺服器）' },
          { command: 'ssh -f -N -R 9000:127.0.0.1:8000 ops@bastion', output: '' },
          { command: 'ssh ops@bastion sudo ss -tlnp sport = :9000', output: 'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\nLISTEN 0      128        127.0.0.1:9000      0.0.0.0:*    users:(("sshd",pid=702,fd=9))' },
          { command: 'ssh ops@bastion curl -s http://127.0.0.1:9000/', output: '出貨報表預覽（laptop 上的開發伺服器）' },
          { command: 'pgrep -af ssh', output: '1501 ssh -f -N -R 9000:127.0.0.1:8000 ops@bastion' },
          { command: 'pkill -f \'R 9000\'', output: '' },
          { command: 'ssh ops@bastion ss -tln sport = :9000', output: 'State Recv-Q Send-Q Local Address:Port Peer Address:Port Process' },
        ],
      },
      {
        id: 'srv10-sshd', title: '在跳板機上限制轉送', machine: 'srv10-laptop',
        description: '在 bastion 寫入 `AllowTcpForwarding local`、`GatewayPorts no`、`AllowAgentForwarding no` 的 drop-in，`sshd -t` 檢查後 reload。之後 `-R` 被拒絕，但背景的 ssh 仍然留著（沒有 ExitOnForwardFailure），要自己結束；-J 與 -L 照常可用。',
        steps: [
          { command: 'ssh ops@bastion ls /etc/ssh/sshd_config.d', output: '10-hardening.conf' },
          { command: 'ssh ops@bastion \'printf "AllowTcpForwarding local\\nGatewayPorts no\\nAllowAgentForwarding no\\n" | sudo tee /etc/ssh/sshd_config.d/20-forwarding.conf\'', output: 'AllowTcpForwarding local\nGatewayPorts no\nAllowAgentForwarding no' },
          { command: 'ssh ops@bastion sudo sshd -t', output: '' },
          { command: 'ssh ops@bastion sudo systemctl reload ssh', output: '' },
          { command: 'ssh -f -N -R 9000:127.0.0.1:8000 ops@bastion', output: 'Warning: remote port forwarding failed for listen port 9000' },
          { command: 'pgrep -af ssh', output: '1501 ssh -f -N -R 9000:127.0.0.1:8000 ops@bastion' },
          { command: 'pkill -f \'R 9000\'', output: '' },
          { command: 'ssh -J ops@bastion ops@db-01 hostname', output: 'db-01' },
          { command: 'ssh -f -N -L 5433:db-01:5432 ops@bastion', output: '' },
          { command: 'nc -zv 127.0.0.1 5433', output: 'Connection to 127.0.0.1 5433 port [tcp/*] succeeded!' },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv10-work-config', title: '用工作金鑰經由跳板機登入，並寫進 ~/.ssh/config', machine: 'srv10-nb02',
        statement: '新筆電 nb-02 上有兩把金鑰：`~/.ssh/id_ed25519` 是你的個人金鑰，伺服器都不認得；`~/.ssh/id_work` 是工作金鑰，已經裝在 bastion、db-01、mon-01 的 ops 帳號。known_hosts 已由 IT 發放（bastion 也記為 203.0.113.10）。請：先寫 `~/.ssh/config` 的 `Host bastion` 區塊（HostName 203.0.113.10、User ops、IdentityFile ~/.ssh/id_work），用 `ssh -i ~/.ssh/id_work -J bastion ops@db-01 hostname` 確認經由跳板機連得到；再加入 db-01 與 mon-01 的區塊（User ops、同一把工作金鑰、ProxyJump bastion），把設定檔設成 600；最後只用 `ssh db-01 …` 列出 db-01 上 `/var/backups/pg` 的備份檔，確認昨晚的備份在不在。檢查時，你的指令也會在另一天的 db-01（備份檔不同）重新執行一次。',
        checks: [{ kind: 'exists', path: `${HOME}/.ssh/config`, type: 'file' }, { kind: 'mode', path: `${HOME}/.ssh/config`, mode: 0o600 }, { kind: 'output' }],
        solution: [
          "printf 'Host bastion\\n  HostName 203.0.113.10\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n' > ~/.ssh/config",
          'ssh -i ~/.ssh/id_work -J bastion ops@db-01 hostname',
          "printf '\\nHost db-01 mon-01\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n  ProxyJump bastion\\n' >> ~/.ssh/config",
          'chmod 600 ~/.ssh/config',
          'ssh db-01 ls /var/backups/pg',
        ],
        variants: [OTHER_DAY],
        mistakes: [
          { commands: ['ssh -i ~/.ssh/id_work -J ops@bastion ops@db-01 ls /var/backups/pg'],
            why: '以為命令列的 -i 也會用在跳板機：-i 只給目的主機，登入 bastion 時用的是預設的 id_ed25519（個人金鑰），bastion 不認得，Permission denied (publickey)；而且沒有寫任何設定檔。' },
          { commands: ["printf 'Host bastion\\n  HostName 203.0.113.10\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n\\nHost db-01 mon-01\\n  User ops\\n  ProxyJump bastion\\n' > ~/.ssh/config", 'chmod 600 ~/.ssh/config', 'ssh db-01 ls /var/backups/pg'],
            why: 'IdentityFile 只寫在 bastion 的區塊：經過 bastion 沒問題，但登入 db-01 時又回到預設的個人金鑰，db-01 拒絕（ops@db-01: Permission denied (publickey)）。每一段登入都要找得到工作金鑰。' },
          { commands: ["printf 'Host bastion\\n  HostName 203.0.113.10\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n\\nHost db-01 mon-01\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n' > ~/.ssh/config", 'chmod 600 ~/.ssh/config', 'ssh db-01 ls /var/backups/pg'],
            why: '少了 ProxyJump：ssh 直接連 db-01 的 10.30.0.21，只有 bastion 連得到它，所以 Connection timed out。' },
          { commands: ["printf 'Host *\\n  User learner\\n\\nHost bastion\\n  HostName 203.0.113.10\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n\\nHost db-01 mon-01\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n  ProxyJump bastion\\n' > ~/.ssh/config", 'chmod 600 ~/.ssh/config', 'ssh db-01 ls /var/backups/pg'],
            why: '把 `Host *` 放在最前面：同一個設定以第一次取得的值為準，所以每台主機的 User 都變成 learner，伺服器上沒有這個帳號而拒絕登入。通用的 `Host *` 要放在檔案最後。' },
        ],
        hints: [
          "多行的設定可以用 printf 寫：`printf 'Host bastion\\n  HostName 203.0.113.10\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n' > ~/.ssh/config`。",
          '跳板機不吃命令列的 `-i` 與 `-o`；寫好 bastion 區塊之後，`-J bastion` 就會用那個區塊的設定。',
          "`printf '\\nHost db-01 mon-01\\n  User ops\\n  IdentityFile ~/.ssh/id_work\\n  ProxyJump bastion\\n' >> ~/.ssh/config` 附加第二個區塊，再 `chmod 600 ~/.ssh/config`。",
        ],
        explanation: 'OpenSSH 的 -J 只把命令列的選項套用到目的主機，跳板機要從 ~/.ssh/config 取得 HostName、User 與 IdentityFile，所以先寫 bastion 區塊，`-J bastion` 才能用工作金鑰登入它；-i 則讓 db-01 那一段也用工作金鑰。db-01、mon-01 的區塊再寫上 User、IdentityFile 與 ProxyJump bastion，之後只要 `ssh db-01`，ssh 就以 ops 與工作金鑰登入 db-01，而 ProxyJump bastion 也會套用 bastion 區塊的 HostName、User 與 IdentityFile。設定檔 600 只有自己能讀寫（群組或其他人可寫時 ssh 拒絕使用）。另一天的 db-01 少了 11 月 21 日的備份，輸出不同，所以必須真的連進去看。',
      },
      {
        id: 'srv10-admin-tunnel', title: '把 db-01 的管理頁面轉到筆電', machine: 'srv10-laptop',
        statement: 'db-01 的管理頁面 db-console 只綁在 db-01 自己的 127.0.0.1:8080，從 bastion 也連不到。請在筆電建立一個在背景執行的 SSH 通道，讓筆電的 127.0.0.1:9090（只綁 127.0.0.1，不要開給同一個網路的其他人）連到 db-console，然後用 `curl -s http://127.0.0.1:9090/status` 讀出 db-01 目前的狀態。檢查時，你的指令也會在另一天的 db-01（狀態不同）重新執行一次。',
        checks: [
          { kind: 'tunnel', port: 9090, target: '127.0.0.1:8080', address: '127.0.0.1', works: true },
          { kind: 'http', url: 'http://127.0.0.1:9090/status', status: 200 },
          { kind: 'output' },
        ],
        solution: ['ssh -f -N -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01', 'curl -s http://127.0.0.1:9090/status'],
        variants: [OTHER_DAY],
        mistakes: [
          { commands: ['ssh -f -N -L 9090:db-01:8080 ops@bastion', 'curl -s http://127.0.0.1:9090/status'],
            why: '經由 bastion 轉送到 db-01:8080：bastion 連的是 db-01 的 10.30.0.21:8080，db-console 只綁 127.0.0.1，連線被拒絕（channel 2: open failed: connect failed: Connection refused），curl 拿不到頁面。' },
          { commands: ['ssh -f -N -L 9090:127.0.0.1:8080 ops@bastion', 'curl -s http://127.0.0.1:9090/status'],
            why: '-L 裡的 127.0.0.1 是 SSH 伺服器自己：這裡的 SSH 伺服器是 bastion，連到的是 bastion 的 8080，那裡沒有程式。' },
          { commands: ['ssh -f -N -g -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01', 'curl -s http://127.0.0.1:9090/status'],
            why: '加了 -g：通道綁在 0.0.0.0:9090，同一個 Wi-Fi 上的任何人都能經由你的筆電打開正式資料庫的管理頁面。題目要求只綁 127.0.0.1。' },
          { commands: ['ssh -J ops@bastion ops@db-01 curl -s http://127.0.0.1:8080/status'],
            why: '在 db-01 上直接執行 curl 確實看得到狀態，但筆電上沒有任何通道，瀏覽器或其他工具仍然打不開 127.0.0.1:9090。' },
        ],
        hints: [
          '先想清楚：哪一台機器連得到 db-console 的 127.0.0.1:8080？SSH 伺服器那一端必須就是它。',
          '經由跳板機登入 db-01 用 `-J ops@bastion ops@db-01`；-L 的目的寫 `127.0.0.1:8080`，就是 db-01 自己的迴路位址。',
          '`ssh -f -N -L 9090:127.0.0.1:8080 -J ops@bastion ops@db-01`，再 `curl -s http://127.0.0.1:9090/status`。',
        ],
        explanation: '-L 的目的主機由 SSH 伺服器那一端連線，所以要讓 SSH 伺服器就是 db-01：-J 經由 bastion 登入 db-01，再把筆電的 9090 轉到 db-01 的 127.0.0.1:8080。沒有 -g，通道只綁筆電的 127.0.0.1，-f -N 讓它在背景執行。這樣一來，SSH 的加密一直延伸到 db-01 本身，內網這一段也在通道裡。另一天的 db-01 有不同的複寫延遲與連線數，輸出也不同，所以必須真的讀到頁面。用完之後記得結束這個背景的 ssh。',
      },
      {
        id: 'srv10-forgotten', title: '找出並關掉被遺忘的背景通道', machine: 'srv10-forgotten',
        statement: '你在咖啡店的 Wi-Fi 上打開筆電，發現三天前除錯時開的背景 SSH 通道還在執行，而且其中一個用了 -g。請找出所有在背景執行的 SSH 通道並結束它們（兩個都不再需要）；另一個終端機裡正在使用的 `ssh ops@bastion` 工作階段，以及開發伺服器（python3，127.0.0.1:8000）都要保留。完成後，同一個 Wi-Fi 上的陌生電腦 guest-pc 不應該再連得到筆電的 5433 埠。',
        checks: [
          { kind: 'listen', port: 5433, absent: true },
          { kind: 'listen', port: 9090, absent: true },
          { kind: 'process', pid: 2163, name: 'ssh' },
          { kind: 'listen', port: 8000, process: 'python3' },
          { kind: 'reach', from: 'guest-pc', to: LAPTOP, port: 5433, result: 'refused' },
        ],
        solution: ['ss -tlnp', 'pgrep -af ssh', 'kill 2388 2391', 'ss -tlnp'],
        mistakes: [
          { commands: ['pkill ssh'], why: '`pkill ssh` 比對所有名稱含 ssh 的行程，連另一個終端機裡正在使用的 ssh ops@bastion 工作階段也一起結束了。' },
          { commands: ['ss -tlnp', 'kill 2388'], why: '只結束了 0.0.0.0:5433 那一個；127.0.0.1:9090 的通道仍然連著 db-01 的管理頁面，題目要求兩個都結束。' },
          { commands: ['sudo ufw deny 5433', 'kill 2391'], why: '用防火牆擋而不是關掉通道：筆電的 ufw 根本沒有啟用，規則不會生效，guest-pc 仍然連得到 5433；就算啟用了，通道本身還連著正式資料庫。' },
        ],
        hints: [
          '`ss -tlnp` 列出監聽中的埠，找出 users 欄是 ssh 的那幾列與它們的 PID；注意哪一個綁在 0.0.0.0。',
          '`pgrep -af ssh`（或 `ps -f -C ssh`）顯示完整的指令：有 -f -N 的是背景通道，TTY 是 pts/1 的那一個是你正在用的工作階段。',
          '用 `kill PID` 結束兩個通道（可以一次寫兩個 PID），或用夠精確的 `pkill -f \'ssh -f -N\'`，最後再 `ss -tlnp` 確認。',
        ],
        explanation: '`ss -tlnp` 顯示 ssh 持有 0.0.0.0:5433 與 127.0.0.1:9090；`pgrep -af ssh` 列出三個 ssh 行程，其中 2388 與 2391 有 -f -N（背景通道，ps -f 的 STIME 是 Nov19、TTY 是 ?），2163 是另一個終端機裡的互動式工作階段。2388 用了 -g，把正式資料庫的 5432 經由你的筆電開放給整個咖啡店的 Wi-Fi，這是最嚴重的；kill 2388 2391 只結束兩個通道，監聽隨之關閉，guest-pc 再連 5433 就被拒絕。`pkill -f \'ssh -f -N\'` 也可以，但 `pkill ssh` 太寬。真實環境加上 ExitOnForwardFailure、用完就關，長期的通道交給 systemd 管理。',
      },
    ],
  },
};
