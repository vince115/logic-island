import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine, TerminalRemote, TerminalVariant } from '@/lib/terminal/lesson';
import { DEFAULT_SSHD_CONFIG, hostKey, keyPair } from '@/lib/terminal/ssh';
import type { LessonContent } from '../schema';

/*
 * LNX12 SSH Remote Access and Keys (LNX-4, network-sequence). A terminal lesson on the remote profile (engine stage E7)
 * beside two network-protocol scenes. The terminal part: ssh and sshd on port 22, `ssh user@host` (an interactive
 * session) and `ssh user@host command` (the remote exit status, 255 for ssh's own failures), ed25519 key pairs made with
 * ssh-keygen (private key 600 that never leaves the client, public key 644, ~/.ssh 700), ssh-copy-id and authorized_keys,
 * the client's refusal of a readable private key and the server's StrictModes, known_hosts and host key verification
 * (the first-contact question, ssh-keyscan with ssh-keygen -l, accept-new, a changed key after a reinstall and
 * ssh-keygen -R), and key-only login: PasswordAuthentication no and PermitRootLogin no/prohibit-password in a drop-in
 * that sorts before Ubuntu's 50-cloud-init.conf (the first value wins), sshd -t, sshd -T and systemctl reload ssh, with a
 * second session kept open as advice. The network part: one SSH connection step by step (TCP to port 22, version
 * strings, KEXINIT, the hybrid key exchange carrying the host key and its signature, NEWKEYS, publickey authentication,
 * a session channel running hostname) and a man-in-the-middle whose host key does not match known_hosts. Message names
 * and numbers follow RFC 4250–4254; the algorithms are OpenSSH 9.6's defaults; nothing cryptographic is computed in the
 * scenes. Host names, users, addresses (a private 10.20.0.0/24) and files are made up. Every transcript output was
 * produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const HOME = '/home/learner';
const CLOCK = { now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00' };

/** The learner's key: exactly what ssh-keygen makes on ops-pc (keySeed lnx12-ops), so every machine agrees. */
const LEARNER_KEY = keyPair(`lnx12-ops:learner:${HOME}/.ssh/id_ed25519`, 'learner@ops-pc');
const APP_SEED = 'lnx12-app-01', DB_OLD_SEED = 'lnx12-db-01-2025', DB_NEW_SEED = 'lnx12-db-01-2026', DB_OTHER_SEED = 'lnx12-db-01-2026-b';
const APP_KEY = hostKey(APP_SEED, 'app-01'), DB_OLD = hostKey(DB_OLD_SEED, 'db-01'), DB_NEW = hostKey(DB_NEW_SEED, 'db-01'), DB_OTHER = hostKey(DB_OTHER_SEED, 'db-01');
/** The key a man-in-the-middle shows in the second scene (never on a machine). */
const MALLORY_KEY = hostKey('lnx12-mallory', 'app-01');
/** A known_hosts line as ssh writes it (name, key type, key; no comment). */
const known = (host: string, key: { publicLine: string }) => `${host} ${key.publicLine.split(' ').slice(0, 2).join(' ')}\n`;

const DEPLOY = { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'sudo', members: ['deploy'] }] };
/** What Ubuntu's cloud images write when the provider turns password login on. */
const CLOUD_INIT = file('/etc/ssh/sshd_config.d/50-cloud-init.conf', 'PasswordAuthentication yes\n');
const appRemote = (extra: TerminalFile[]): TerminalRemote => ({
  host: 'app-01', title: '應用伺服器 app-01', address: '10.20.0.21', hostKey: APP_SEED, passwords: ['deploy'], accounts: DEPLOY,
  files: [dir('/etc'), dir('/etc/ssh'), dir('/etc/ssh/sshd_config.d'), CLOUD_INIT, file('/etc/motd', 'app-01: order API (production)\n'),
    dir('/home'), dir('/home/deploy', 'deploy', 0o750), ...extra],
});
const deployKeys = [dir('/home/deploy/.ssh', 'deploy', 0o700), file('/home/deploy/.ssh/authorized_keys', `${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600)];
/** db-01 after yesterday's reinstall: a new host key (seed), deploy's key restored from the configuration repository. */
const dbRemote = (seed: string): TerminalRemote => ({
  host: 'db-01', title: '資料庫伺服器 db-01', address: '10.20.0.31', hostKey: seed, accounts: DEPLOY,
  files: [dir('/etc'), dir('/etc/ssh'), dir('/etc/ssh/sshd_config.d'), file('/etc/motd', 'db-01: PostgreSQL (reinstalled 2026-11-21)\n'),
    dir('/home'), dir('/home/deploy', 'deploy', 0o750), ...deployKeys],
});
const localBase = [dir('/etc'), dir('/home'), dir(HOME, 'learner', 0o750)];
const localKeys = [dir(`${HOME}/.ssh`, 'learner', 0o700), file(`${HOME}/.ssh/id_ed25519`, LEARNER_KEY.privateText, 'learner', 0o600),
  file(`${HOME}/.ssh/id_ed25519.pub`, `${LEARNER_KEY.publicLine}\n`, 'learner')];
const ops = { user: 'learner', host: 'ops-pc', cwd: HOME, profile: 'remote' as const, ...CLOCK, address: '10.20.0.5', keySeed: 'lnx12-ops' };

/** ops-pc before anything: no key, no known_hosts; app-01 accepts deploy's password (the lesson gives it). */
const fresh: TerminalMachine = { id: 'lnx12-fresh', title: '管理工作站 ops-pc（還沒有金鑰）', ...ops, files: localBase, remotes: [appRemote([])] };

const ticket = (fingerprint: string) => file(`${HOME}/ticket-1842.txt`, `工單 #1842（2026-11-21，資料庫組 Lin）
db-01 已重灌為 Ubuntu 24.04，主機金鑰重新產生。
新的 ED25519 指紋：${fingerprint}
連線前請先核對指紋，再更新你的 known_hosts。
`, 'learner');
/** ops-pc after the keys are set up; db-01 was reinstalled yesterday, so its key no longer matches known_hosts. */
const keys: TerminalMachine = {
  id: 'lnx12-keys', title: '管理工作站 ops-pc（金鑰已設定）', ...ops,
  files: [...localBase, ...localKeys, file(`${HOME}/.ssh/known_hosts`, known('app-01', APP_KEY) + known('db-01', DB_OLD), 'learner'), ticket(DB_NEW.fingerprint)],
  remotes: [appRemote(deployKeys), dbRemote(DB_NEW_SEED)],
};
/** The exercise's variant: db-01 came back with another key, and the ticket announces that one. */
const OTHER_REINSTALL: TerminalVariant = { label: 'db-01 換成另一把新金鑰', files: [ticket(DB_OTHER.fingerprint)], remotes: [dbRemote(DB_OTHER_SEED)] };

/** A provider's image: root's key installed at creation, PermitRootLogin yes in sshd_config, deploy has only a password. */
const ROOT_CONFIG = DEFAULT_SSHD_CONFIG.replace('#PermitRootLogin prohibit-password', 'PermitRootLogin yes');
const rented: TerminalMachine = {
  id: 'lnx12-rented', title: '管理工作站 ops-pc（新租的 app-01）', ...ops,
  files: [...localBase, ...localKeys, file(`${HOME}/.ssh/known_hosts`, known('app-01', APP_KEY), 'learner')],
  remotes: [appRemote([file('/etc/ssh/sshd_config', ROOT_CONFIG), dir('/root', 'root', 0o700), dir('/root/.ssh', 'root', 0o700),
    file('/root/.ssh/authorized_keys', `${LEARNER_KEY.publicLine}\n`, 'root', 0o600)])],
};
const HARDENING = '/etc/ssh/sshd_config.d/10-hardening.conf';

// ---- network scenes ----------------------------------------------------------------------------------------------
const PC = '10.20.0.5', APP = '10.20.0.21', MALLORY = '10.20.0.66';
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
/** An SSH packet: its message, whether it travels encrypted, and what it carries. */
const ssh = (message: string, encrypted: boolean, fields: { name: string; value: string }[] = []): ProtocolHeader => ({ layer: 'application', protocol: 'SSH-2.0', fields: [
  { name: '訊息', value: message }, { name: '加密', value: encrypted ? '是' : '否' }, ...fields] });
const up = (h: ProtocolHeader, flags = 'PSH, ACK') => [h, tcp('50122', '22', flags), ipv4(PC, APP)];
const down = (h: ProtocolHeader, flags = 'PSH, ACK') => [h, tcp('22', '50122', flags), ipv4(APP, PC)];

const STAGES = ['TCP 連線（埠 22）', '版本交換', '金鑰交換', '主機金鑰驗證', '使用者認證', '開啟 channel 執行指令'];
/** The client's progress table: the first `done` stages are complete, the next one (if `busy`) is under way. */
const progress = (done: number, changed: number[], busy?: string): NodeTable => ({
  node: 'client', name: '連線進度', head: ['階段', '順序', '狀態'], changed,
  rows: STAGES.map((s, i) => [s, String(i + 1), i < done ? '完成' : i === done && busy ? busy : '尚未開始']) });

/** Section 2: `ssh deploy@app-01 hostname` from ops-pc, every step of the protocol. */
const connect: NetworkScene = {
  id: 'lnx12-ssh-connect', title: '一次 SSH 連線：從 TCP 到執行 hostname', model: 'tcp-ip',
  description: 'learner 在 ops-pc（10.20.0.5）執行 `ssh deploy@app-01 hostname`。兩邊都是 Ubuntu 24.04 的 OpenSSH 9.6，ops-pc 的 known_hosts 已經記錄了 app-01 的主機金鑰，deploy 的 authorized_keys 裡有 learner 的公鑰。逐步看 SSH 標頭的「加密」欄從什麼時候變成「是」，以及用戶端的連線進度表：主機金鑰驗證一定在使用者認證之前完成。',
  nodes: [
    { id: 'client', label: 'ops-pc（ssh 用戶端）', kind: 'host', addresses: [`IP ${PC}`, 'TCP 50122', '私鑰 ~/.ssh/id_ed25519'] },
    { id: 'server', label: 'app-01（sshd）', kind: 'server', addresses: [`IP ${APP}`, 'TCP 22', '主機金鑰 /etc/ssh/ssh_host_ed25519_key'] },
  ],
  messages: [
    { id: 'tcp', from: 'client', to: 'server', label: 'TCP 三向交握（摘要）', headers: [tcp('50122', '22', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(PC, APP)],
      payload: '三個區段都沒有資料',
      note: 'ssh 先把 app-01 解析成 10.20.0.21，再和連接埠 22 完成 TCP 三向交握（CN09）。sshd 在 22 埠等待連線；如果那裡沒有程式在聽，這一步就會得到 Connection refused，後面的步驟都不會發生。',
      tables: [progress(1, [0])] },
    { id: 'server-version', from: 'server', to: 'client', label: '版本字串（伺服器）', headers: down(ssh('識別字串（一行文字，不是封包格式）', false, [{ name: '內容', value: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' }])),
      payload: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5（以 CR LF 結尾）',
      note: 'TCP 連上後，雙方各送出一行以 SSH-2.0- 開頭的識別字串：協定版本 2.0，加上軟體名稱與版本。這一行是明文，所以任何人都看得到伺服器跑的是哪一版 OpenSSH；ssh-keyscan 在標準錯誤印出的 # app-01:22 SSH-2.0-… 就是它。',
      tables: [progress(1, [1], '進行中')] },
    { id: 'client-version', from: 'client', to: 'server', label: '版本字串（用戶端）', headers: up(ssh('識別字串（一行文字，不是封包格式）', false, [{ name: '內容', value: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' }])),
      payload: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5（以 CR LF 結尾）',
      note: '用戶端也送出自己的識別字串。雙方都說 2.0，協定就確定了；之後的資料都改用 SSH 的二進位封包格式。兩行識別字串會被記下來，稍後放進「交換雜湊」裡，路上有人竄改它們的話，簽章就對不上。',
      tables: [progress(2, [1])] },
    { id: 'kexinit', from: 'client', to: 'server', label: 'KEXINIT（雙方互送演算法清單）',
      headers: up(ssh('SSH_MSG_KEXINIT（20）', false, [
        { name: '金鑰交換演算法（優先順序）', value: 'sntrup761x25519-sha512@openssh.com, curve25519-sha256, …' },
        { name: '主機金鑰類型', value: 'ssh-ed25519, ecdsa-sha2-nistp256, rsa-sha2-512, …' },
        { name: '加密演算法', value: 'chacha20-poly1305@openssh.com, aes128-ctr, aes256-gcm@openssh.com, …' },
        { name: '協商結果', value: 'sntrup761x25519-sha512@openssh.com、ssh-ed25519、chacha20-poly1305@openssh.com' }])),
      payload: '明文：兩邊支援的演算法清單',
      note: '雙方各送一個 KEXINIT（伺服器的那一個同時往反方向送），列出自己支援的金鑰交換、主機金鑰、加密、訊息驗證與壓縮演算法，依偏好排序。每一類都選「用戶端清單中第一個伺服器也支援的」。兩邊都是 OpenSSH 9.6，所以選中混合了 X25519 與後量子演算法 sntrup761 的金鑰交換、ssh-ed25519 主機金鑰與 chacha20-poly1305 加密（它本身就附帶防竄改的驗證）。',
      tables: [progress(2, [2], '進行中：協商演算法')] },
    { id: 'kex-init', from: 'client', to: 'server', label: 'KEX_ECDH_INIT（用戶端的臨時公鑰）',
      headers: up(ssh('SSH_MSG_KEX_ECDH_INIT（30）', false, [{ name: '用戶端的臨時公鑰', value: 'X25519 公鑰＋sntrup761 公鑰（這次連線才產生）' }])),
      payload: '明文：只有公鑰，沒有任何秘密',
      note: '用戶端為這一次連線產生臨時的金鑰對，只把公鑰送出去。臨時私鑰留在用戶端，連線結束就丟掉。這和使用者的金鑰、伺服器的主機金鑰都無關：它只用來和伺服器算出這次連線專用的共享秘密。',
      tables: [progress(2, [2], '進行中：交換臨時公鑰')] },
    { id: 'kex-reply', from: 'server', to: 'client', label: 'KEX_ECDH_REPLY（主機金鑰與簽章）',
      headers: down(ssh('SSH_MSG_KEX_ECDH_REPLY（31）', false, [
        { name: '主機公鑰', value: `ssh-ed25519（指紋 ${APP_KEY.fingerprint}）` },
        { name: '伺服器的臨時資料', value: 'X25519 公鑰＋sntrup761 密文' },
        { name: '簽章', value: '用主機私鑰對交換雜湊 H 簽章' }])),
      payload: '明文：公鑰與簽章都可以公開',
      note: '伺服器送回自己的臨時資料，兩邊各自算出同一個共享秘密，秘密本身從來不在網路上傳送。同一則訊息還帶著伺服器長期使用的主機公鑰，以及用主機私鑰對「交換雜湊 H」的簽章；H 涵蓋兩行識別字串、兩個 KEXINIT、主機公鑰與雙方的臨時資料。用戶端做兩個檢查：主機公鑰是不是 known_hosts 裡 app-01 的那一把，簽章用這把公鑰驗證是不是正確。兩者都通過，才證明對面握有 app-01 的主機私鑰。',
      tables: [progress(4, [2, 3]),
        { node: 'client', name: '主機金鑰檢查', head: ['項目', '結果'], changed: [0, 1, 2, 3], rows: [
          ['伺服器出示的主機金鑰', `ssh-ed25519 ${APP_KEY.fingerprint}`],
          ['~/.ssh/known_hosts 的紀錄', 'app-01 第 1 行：同一把金鑰'],
          ['對交換雜湊的簽章', '用這把主機公鑰驗證：正確'],
          ['結論', '確實是 app-01，繼續'],
        ] }] },
    { id: 'newkeys', from: 'client', to: 'server', label: 'NEWKEYS（雙方各送一個）', headers: up(ssh('SSH_MSG_NEWKEYS（21）', false)),
      payload: '這是最後一個明文的封包',
      note: '雙方從共享秘密與 H 導出這次連線的加密與驗證金鑰，各送一個 NEWKEYS 表示「從下一個封包起改用新金鑰」。第一次金鑰交換的 H 也成為這條連線的工作階段識別碼（session identifier），等一下的使用者認證會用到它。從這裡開始，路上的人只看得到 IP 與 TCP 標頭和封包長度。' },
    { id: 'userauth', from: 'client', to: 'server', label: 'USERAUTH_REQUEST publickey（含簽章）',
      headers: up(ssh('SSH_MSG_USERAUTH_REQUEST（50）', true, [
        { name: '使用者', value: 'deploy' }, { name: '服務', value: 'ssh-connection' }, { name: '方法', value: 'publickey' },
        { name: '公鑰', value: `ssh-ed25519（指紋 ${LEARNER_KEY.fingerprint}）` },
        { name: '簽章', value: '用 learner 的私鑰對「工作階段識別碼＋使用者＋公鑰」簽章' }])),
      payload: '密文；私鑰本身從不送出',
      note: '用戶端先以 SERVICE_REQUEST 要求 ssh-userauth 服務（伺服器回 SERVICE_ACCEPT），OpenSSH 還會先送一個 method none 的請求，問到伺服器允許的方法是 publickey,password。接著用私鑰對包含工作階段識別碼的資料簽章，連同公鑰送出（實際上通常先只送公鑰問一聲，伺服器回 USERAUTH_PK_OK 才簽章）。私鑰從不離開 ops-pc；簽章綁定這條連線的識別碼，被錄下來也不能拿到別的連線重用。',
      tables: [progress(4, [4], '進行中')] },
    { id: 'userauth-success', from: 'server', to: 'client', label: 'USERAUTH_SUCCESS', headers: down(ssh('SSH_MSG_USERAUTH_SUCCESS（52）', true)),
      payload: '密文',
      note: 'sshd 依設定找到 /home/deploy/.ssh/authorized_keys，確認裡面有這把公鑰、檔案與目錄的權限符合 StrictModes，再用公鑰驗證簽章正確，於是接受，並在 journal 記錄 Accepted publickey for deploy from 10.20.0.5 port 50122 ssh2: ED25519 SHA256:…。如果公鑰不在檔案裡，伺服器回 USERAUTH_FAILURE，用戶端就改試下一種方法（例如密碼）。',
      tables: [progress(5, [4])] },
    { id: 'channel-open', from: 'client', to: 'server', label: 'CHANNEL_OPEN session',
      headers: up(ssh('SSH_MSG_CHANNEL_OPEN（90）', true, [{ name: 'channel 類型', value: 'session' }, { name: '用戶端的 channel 編號', value: '0' }])),
      payload: '密文',
      note: '一條 SSH 連線裡可以開好幾個 channel（終端機工作階段、scp 的檔案傳輸、連接埠轉送），彼此獨立。這次只開一個 session channel，伺服器以 CHANNEL_OPEN_CONFIRMATION（91）同意。',
      tables: [progress(5, [5], '進行中')] },
    { id: 'channel-exec', from: 'client', to: 'server', label: 'CHANNEL_REQUEST exec "hostname"',
      headers: up(ssh('SSH_MSG_CHANNEL_REQUEST（98）', true, [{ name: '請求', value: 'exec' }, { name: '指令', value: 'hostname' }])),
      payload: '密文',
      note: '`ssh deploy@app-01 hostname` 有寫指令，所以請求是 exec：sshd 用 deploy 的登入 Shell 執行 hostname。沒有寫指令時（互動式登入），用戶端改送 pty-req 要一個終端機，再送 shell 要一個登入 Shell。',
      tables: [progress(5, [5], '進行中')] },
    { id: 'channel-data', from: 'server', to: 'client', label: 'CHANNEL_DATA 與 exit-status',
      headers: down(ssh('SSH_MSG_CHANNEL_DATA（94）', true, [{ name: '資料', value: 'app-01' }, { name: '之後的訊息', value: 'CHANNEL_REQUEST exit-status 0、CHANNEL_EOF、CHANNEL_CLOSE' }])),
      payload: '解密後：app-01',
      note: 'hostname 的輸出放在 CHANNEL_DATA 裡送回，ssh 把它印在你的終端機上。指令結束後伺服器送出 exit-status（0），再關閉 channel；ssh 以這個值當作自己的結束碼，所以本機的 $? 是 0。沒有其他 channel 了，ssh 結束連線。',
      tables: [progress(6, [5])] },
  ],
};

/** Section 4: on the same LAN a machine forges ARP replies for 10.20.0.21; its host key is not the one in known_hosts. */
const mitm: NetworkScene = {
  id: 'lnx12-ssh-mitm', title: '中間人攻擊：主機金鑰對不上 known_hosts', model: 'tcp-ip',
  description: '同一個網段上的一台機器（10.20.0.66）偽造 ARP 回應，讓 ops-pc 送給 10.20.0.21 的封包都先到它那裡。它想當中間人：對 ops-pc 假裝是 app-01，同時自己連到真正的 app-01，把兩邊的資料轉來轉去。看 ops-pc 在哪一步發現不對、在那之前送出了什麼。',
  nodes: [
    { id: 'client', label: 'ops-pc（ssh 用戶端）', kind: 'host', addresses: [`IP ${PC}`, 'known_hosts：app-01 的金鑰'] },
    { id: 'mallory', label: '攻擊者的機器', kind: 'host', addresses: [`IP ${MALLORY}`, '偽造 ARP：冒充 10.20.0.21'] },
    { id: 'server', label: '真正的 app-01', kind: 'server', addresses: [`IP ${APP}`, 'TCP 22'] },
  ],
  messages: [
    { id: 'tcp-hijack', from: 'client', to: 'mallory', label: 'TCP 三向交握（被攔截）', headers: [tcp('50140', '22', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(PC, APP)],
      payload: '目的 IP 仍是 10.20.0.21',
      note: 'ops-pc 照常連 10.20.0.21:22，IP 標頭完全正常；但攻擊者偽造了 ARP 回應，ops-pc 的 ARP 快取把 10.20.0.21 對應到攻擊者的 MAC 位址（CN06），所以這些封包其實送到了攻擊者手上，由它回應 SYN, ACK。從 TCP 與 IP 看不出任何異狀；公共 Wi-Fi、被入侵的路由器或偽造的 DNS 回應都能造成同樣的局面。',
      tables: [{ node: 'client', name: 'ARP 快取', head: ['IP 位址', 'MAC 位址'], changed: [0], rows: [['10.20.0.21', '02:00:0a:14:00:42（其實是攻擊者的）']] }] },
    { id: 'relay', from: 'mallory', to: 'server', label: '攻擊者自己連到 app-01', headers: [ssh('版本交換與金鑰交換（摘要）', false, [{ name: '連線', value: '攻擊者 ↔ app-01，一條正常的 SSH 連線' }]), tcp('41022', '22', 'PSH, ACK'), ipv4(MALLORY, APP)],
      payload: '攻擊者打算把兩條連線接起來',
      note: '中間人要做的是建立兩條各自加密的連線：ops-pc ↔ 攻擊者、攻擊者 ↔ app-01，再把資料從一條轉到另一條。每一條都「有加密」，但加密的另一端是攻擊者，所以它能讀到、也能改掉經過的一切。加密本身擋不住這種攻擊，要靠確認對方的身分。' },
    { id: 'fake-reply', from: 'mallory', to: 'client', label: 'KEX_ECDH_REPLY（攻擊者的主機金鑰）',
      headers: [ssh('SSH_MSG_KEX_ECDH_REPLY（31）', false, [
        { name: '主機公鑰', value: `ssh-ed25519（指紋 ${MALLORY_KEY.fingerprint}）` },
        { name: '簽章', value: '用攻擊者自己的主機私鑰簽：數學上正確' }]), tcp('22', '50140', 'PSH, ACK'), ipv4(APP, PC)],
      payload: '攻擊者沒有 app-01 的主機私鑰，只能出示自己的金鑰',
      note: '攻擊者拿不到 app-01 的主機私鑰，所以只能送出自己的主機公鑰，並用自己的私鑰簽章。簽章本身是正確的，但它只證明「對方握有這把金鑰的私鑰」，不證明這把金鑰屬於 app-01。決定性的檢查是 known_hosts：紀錄裡 app-01 的金鑰不是這一把。',
      tables: [{ node: 'client', name: '主機金鑰檢查', head: ['項目', '結果'], changed: [0, 1, 2, 3], rows: [
        ['伺服器出示的主機金鑰', `ssh-ed25519 ${MALLORY_KEY.fingerprint}`],
        ['~/.ssh/known_hosts 的紀錄', `app-01 第 1 行：${APP_KEY.fingerprint}`],
        ['對交換雜湊的簽章', '用出示的公鑰驗證：正確（但金鑰不對）'],
        ['結論', '不相符：WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!，中止'],
      ] }] },
    { id: 'abort', from: 'client', to: 'mallory', label: '中止連線（TCP FIN）', headers: [tcp('50140', '22', 'FIN, ACK'), ipv4(PC, APP)],
      payload: '沒有送出任何使用者名稱、密碼或簽章',
      note: 'ssh 印出整段 REMOTE HOST IDENTIFICATION HAS CHANGED 的警告與 Host key verification failed.，以結束碼 255 結束，TCP 連線關閉。使用者認證排在主機金鑰驗證之後，所以攻擊者什麼都沒拿到。反過來說，如果這是第一次連線、你沒核對就回答 yes，或看到警告就刪掉 known_hosts 那一行再連，認證就會照常進行：用密碼登入時，密碼會直接交到攻擊者手上；即使用金鑰登入，攻擊者無法拿你的簽章去登入真正的伺服器（簽章綁定它自己那條連線的識別碼），但它能給你一個假的 Shell，記下你接著輸入的一切（例如 sudo 的密碼）。' },
  ],
};

export const LNX12: LessonContent = {
  lessonId: 'LNX12',
  motivation: '你剛租了一台雲端主機 app-01，供應商給了 IP 位址和一組密碼。第二天打開 journal，已經有上千筆 Failed password：全世界的機器人都在猜 root 與常見帳號的密碼（LNX11）。這一課學會專業的遠端管理方式：用 SSH 金鑰登入，私鑰永遠留在自己的電腦；第一次連線時核對主機指紋，知道 known_hosts 在防範什麼樣的中間人攻擊，看到「主機金鑰改變」的警告時做出正確的判斷；最後停用密碼登入、限制 root，只允許金鑰登入，而且全程不把自己鎖在門外。',
  sections: [
    {
      id: 'lnx12-s-basics', title: 'SSH 是什麼：用戶端、伺服器與連接埠 22',
      blocks: [
        { type: 'p', text: 'SSH（Secure Shell）讓你在不可信任的網路上，安全地登入另一台主機下指令、傳送檔案。它分成兩端：你電腦上的用戶端程式 `ssh`，以及伺服器上常駐的 `sshd`（Ubuntu 的 systemd unit 叫 `ssh.service`，別名 `sshd.service`，LNX10），預設在 TCP 連接埠 22 等待連線。SSH 取代了早年的 telnet 與 rlogin：那些協定把密碼和每一個按鍵都以明文送出，同一段網路上的人都看得到。SSH 從連線一開始就協商加密，並且雙向驗證身分：用戶端確認伺服器是真的（主機金鑰），伺服器確認使用者是誰（密碼或金鑰）。' },
        { type: 'table', head: ['寫法', '做什麼', '例子'], rows: [
          ['`ssh 使用者@主機`', '開啟互動式工作階段：登入遠端的 Shell，提示字元換成遠端的，`exit` 回到本機', '`ssh deploy@app-01`'],
          ['`ssh 使用者@主機 指令`', '只在遠端執行這個指令，印出輸出後就結束連線；結束碼是遠端指令的', '`ssh deploy@app-01 hostname`'],
          ['`ssh 主機`', '沒寫使用者時，用本機目前的使用者名稱登入', '`ssh app-01`（以 learner 登入）'],
          ['`ssh -p 埠 使用者@主機`', '伺服器的 `Port` 不是 22 時指定連接埠', '`ssh -p 2222 deploy@app-01`'],
          ['`ssh -i 私鑰 使用者@主機`', '指定用哪一把私鑰；沒寫時依序嘗試 `~/.ssh/id_ed25519` 等預設檔名', '`ssh -i ~/.ssh/work deploy@app-01`'],
          ['`ssh -o 選項=值 …`', '這次連線的用戶端設定，例如 `BatchMode=yes`：不問任何問題、不用密碼，適合指令稿', '`ssh -o BatchMode=yes deploy@app-01 true`'],
        ] },
        { type: 'p', text: '遠端指令要注意引號：`ssh deploy@app-01 \'ls /var/log | wc -l\'` 把整段（包括管線）交給遠端的 Shell；不加引號時，`| wc -l` 由本機的 Shell 處理，數的是 ssh 傳回來的那些行。ssh 的結束碼就是遠端指令的結束碼，所以 `ssh deploy@app-01 ls /nope` 之後 `$?` 是 ls 的 2；ssh 自己失敗時（找不到主機、連線被拒、主機驗證失敗、認證失敗）則是 255，指令稿可以用它分辨「指令失敗」和「根本沒連上」。' },
        { type: 'p', text: '下面的紀錄是 learner 第一次從 ops-pc 連到 app-01。ssh 先停下來問主機的指紋（第四節會詳細說明為什麼），這裡先用 `ssh-keyscan` 取得 app-01 出示的金鑰、以 `ssh-keygen -l` 算出指紋，和雲端主控台顯示的指紋比對相符後，再用 `-o StrictHostKeyChecking=accept-new` 讓 ssh 記住它。接著示範執行單一指令、遠端指令的結束碼，以及互動式工作階段的進出。' },
        { type: 'example', id: 'lnx12-first' },
        { type: 'callout', tone: 'note', title: '模擬環境裡的密碼與鍵盤', text: '課程提供了 deploy 的密碼，模擬環境在 `password:` 提示後代為輸入（真實的 ssh 輸入密碼時螢幕上不會顯示任何字元）。模擬環境沒有鍵盤可以回答 yes/no，所以第一次連線一定要先用 `ssh-keyscan` 或 `accept-new` 處理主機金鑰；金鑰也只能用空的密語（`-N \'\'`）產生。' },
      ],
    },
    {
      id: 'lnx12-s-protocol', title: '一次連線的幕後：SSH 協定的順序',
      blocks: [
        { type: 'p', text: '在你按下 Enter 到看見 `app-01` 之間，ssh 與 sshd 依固定的順序完成六件事。順序是 SSH 安全性的核心：先建立加密、再確認伺服器的身分，最後才交出使用者的身分證明。' },
        { type: 'list', ordered: true, items: [
          'TCP 連線：和伺服器的連接埠 22 完成三向交握。',
          '版本交換：雙方各送一行 `SSH-2.0-…` 的識別字串（明文），確定都說 SSH 協定 2.0。',
          '金鑰交換：以 KEXINIT 協商演算法，雙方各自產生這次連線專用的臨時金鑰，交換公開的部分後各自算出同一個共享秘密，秘密從不在網路上傳送，再由它導出加密金鑰。',
          '主機金鑰驗證：伺服器在同一個回覆裡附上長期的主機公鑰，以及用主機私鑰對整段交換內容的簽章；用戶端檢查這把公鑰是不是 known_hosts 記錄的那一把、簽章是否正確。',
          '使用者認證：NEWKEYS 之後一切加密，用戶端才送出使用者名稱與證明（金鑰的簽章或密碼）。',
          '開啟 channel：認證成功後開一個 session channel，執行指令（exec）或開啟互動式 Shell，輸出與結束碼經由 channel 送回。',
        ] },
        { type: 'p', text: '有兩個重點。第一，使用者認證排在主機金鑰驗證之後：用戶端先確定對面真的是 app-01，才把密碼或簽章交出去，這正是 known_hosts 能擋下中間人的原因。第二，每次連線的臨時金鑰在連線結束後就丟棄，日後就算有人偷到伺服器的主機私鑰，也解不開以前錄下的連線（前向保密，CN13 的 TLS 1.3 也是同樣的設計）。主機私鑰只用來簽章、證明身分。' },
        { type: 'example', id: 'lnx12-ssh-connect' },
        { type: 'callout', tone: 'tip', title: '在真實系統上看到這些步驟', text: '真實的 `ssh -v deploy@app-01` 會把每一步印成 `debug1:` 開頭的行，例如 `debug1: Remote protocol version 2.0, remote software version OpenSSH_9.6p1 …`、`debug1: Server host key: ssh-ed25519 SHA256:…`、`debug1: Authentications that can continue: publickey,password`。連不上時，最後幾行通常就指出卡在哪一步。模擬環境不支援 `-v`。' },
      ],
    },
    {
      id: 'lnx12-s-keys', title: '公私鑰：ssh-keygen、authorized_keys 與 ssh-copy-id',
      blocks: [
        { type: 'p', text: '金鑰登入用的是一對公私鑰：公鑰可以交給任何人，私鑰只存在你的電腦上。登入時伺服器不需要知道任何秘密：用戶端用私鑰對「這條連線的識別碼＋使用者名稱＋公鑰」簽章，伺服器用 authorized_keys 裡的公鑰驗證簽章。所以私鑰從不離開用戶端；伺服器被入侵、或有人錄下整條連線，都拿不到你的私鑰，錄到的簽章也只對那一條連線有效。相較之下，密碼每次都要整個送到伺服器，而且人想出來的密碼可以被猜。' },
        { type: 'p', text: '`ssh-keygen -t ed25519` 產生一對 Ed25519 金鑰：金鑰短、運算快，是 OpenSSH 9.5 起的預設類型；RSA 仍很常見，建議 3072 位元以上（ssh-keygen 產生 RSA 時的預設長度）。`-f` 指定檔名（預設 `~/.ssh/id_ed25519`），`-C` 寫上說明（預設 `使用者@主機`），`-N` 指定密語。密語會加密私鑰檔，筆電遺失時多一道保護；真實環境建議設定密語，再用 `ssh-agent` 記住解開的私鑰，就不必每次輸入。模擬環境沒有鍵盤也沒有 ssh-agent，所以練習一律用 `-N \'\'`。' },
        { type: 'table', head: ['檔案', '在哪一台', '權限', '說明'], rows: [
          ['`~/.ssh/`', '用戶端與伺服器', '700（`drwx------`）', '只有自己能進入與列出'],
          ['`~/.ssh/id_ed25519`（私鑰）', '用戶端', '600（`-rw-------`）', '群組或其他人有任何權限時，ssh 印出 UNPROTECTED PRIVATE KEY FILE 並忽略它'],
          ['`~/.ssh/id_ed25519.pub`（公鑰）', '用戶端', '644', '可以公開；內容是一行 `ssh-ed25519 AAAA… 說明`'],
          ['`~/.ssh/authorized_keys`', '伺服器上「要登入的那個帳號」的家目錄', '600', '每行一把允許登入這個帳號的公鑰；刪掉一行就撤銷那把金鑰'],
          ['`~/.ssh/known_hosts`', '用戶端', '644 或 600', '記錄你信任的伺服器主機金鑰（第四節）'],
        ] },
        { type: 'p', text: '`ssh-copy-id deploy@app-01` 把公鑰安裝到伺服器：它先只用新金鑰試著登入，已經裝過就跳過；否則用密碼登入一次，以 `umask 077` 把公鑰附加到 deploy 的 `~/.ssh/authorized_keys`（需要時建立 700 的 `.ssh` 與 600 的檔案）。送過去的是 `.pub` 的內容，私鑰留在原地。裝好之後用 `ssh -o BatchMode=yes deploy@app-01 hostname` 驗證：BatchMode 不會退回密碼，能印出主機名稱就代表金鑰登入真的成功了。' },
        { type: 'example', id: 'lnx12-keygen' },
        { type: 'p', text: '權限在兩端都會被檢查。用戶端的 ssh 拒絕使用別人讀得到的私鑰。伺服器的 sshd 預設 `StrictModes yes`：`authorized_keys` 與它上面直到家目錄的每一層，擁有者必須是該使用者或 root，而且群組與其他人不能寫入；否則它不接受這把金鑰，只回答 Permission denied，原因只寫在伺服器的 journal（`Authentication refused: bad ownership or modes …`）。這是為了防止別人改寫你的 authorized_keys、偷偷放進他的公鑰。' },
        { type: 'example', id: 'lnx12-perms' },
        { type: 'callout', tone: 'warning', title: '常見誤解：伺服器上要放私鑰才能登入', text: '有人把 `id_ed25519` 複製到伺服器、貼進 authorized_keys，或把同一把私鑰用聊天軟體傳給整個團隊。伺服器只需要公鑰；私鑰一旦離開你的電腦，就不能再證明「這是你」。正確的做法是每個人、每台裝置各自產生金鑰，把公鑰各放一行到 authorized_keys：有人離職或筆電遺失時，只要刪掉那一行。' },
      ],
    },
    {
      id: 'lnx12-s-hostkeys', title: '主機金鑰與 known_hosts：為什麼要核對指紋',
      blocks: [
        { type: 'p', text: '中間人攻擊（man-in-the-middle）是指攻擊者站到你和伺服器之間：例如在公共 Wi-Fi、被入侵的路由器、偽造的 ARP 或 DNS 回應。它對你假裝是伺服器，對伺服器假裝是你，把資料轉來轉去，途中讀取或竄改一切。光有加密擋不住它，因為你是在和攻擊者建立加密。SSH 的對策是主機金鑰：每台伺服器安裝 OpenSSH 時產生自己的主機金鑰對（例如 `/etc/ssh/ssh_host_ed25519_key`），每次連線都用主機私鑰簽章證明身分；用戶端則在 `~/.ssh/known_hosts` 記住「哪個名稱對應哪一把主機金鑰」。' },
        { type: 'p', text: '第一次連線時 known_hosts 沒有紀錄，ssh 只能把指紋（`SHA256:…`）印出來問你。這叫「第一次使用時信任」（TOFU）：沒有核對就回答 yes，等於相信此刻回應你的任何一台機器。之後每次連線，ssh 都會比對紀錄，所以只有第一次是空窗。處理第一次連線的方法：' },
        { type: 'table', head: ['做法', '什麼時候用', '注意'], rows: [
          ['從其他管道取得指紋，比對後再接受', '最穩當，任何時候都適用', '指紋來源：雲端主控台的開機紀錄、管理員的公告，或在伺服器主控台執行 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`'],
          ['`ssh-keyscan 主機 > 檔案`，`ssh-keygen -l -f 檔案` 比對後 `cat 檔案 >> ~/.ssh/known_hosts`', '事先準備、或在指令稿裡加入多台主機', 'ssh-keyscan 只是把對方出示的金鑰抓下來，本身不驗證任何事；一定要比對指紋'],
          ['`ssh -o StrictHostKeyChecking=accept-new`', '自動化、可信任的內部網路', '沒有紀錄時直接加入，紀錄不符時仍然拒絕；第一次同樣沒有驗證'],
          ['`ssh -o StrictHostKeyChecking=no`', '不要用', '沒有紀錄時直接加入，金鑰改變時也照樣連線（只停用密碼等幾種認證方式），警告形同虛設'],
        ] },
        { type: 'p', text: '下面的情境是一次中間人攻擊：TCP 與 IP 看起來完全正常，攻擊者的簽章在數學上也正確，唯一露出破綻的是主機金鑰和 known_hosts 不符。' },
        { type: 'example', id: 'lnx12-ssh-mitm' },
        { type: 'p', text: '紀錄和這次收到的金鑰不同時，ssh 印出 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`，列出新金鑰的指紋、known_hosts 裡衝突的行號（`Offending ED25519 key in …:2`）與移除舊紀錄的指令，然後拒絕連線。原因只有兩種：伺服器重灌或換了主機金鑰（正常的維運），或者有人在中間（攻擊）。光看警告分不出來，所以正確的反應是：先不要連線；從其他管道確認新的指紋；相符才用 `ssh-keygen -R 主機` 移除舊紀錄（原檔會留成 `known_hosts.old`），再加入你核對過的那一把；不相符就停下來，通報資安或管理員。' },
        { type: 'example', id: 'lnx12-changed' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：看到警告就照著提示刪掉那一行', text: '警告裡貼心地附上了 `ssh-keygen -f … -R \'db-01\'`，很多人複製貼上、重新連線、回答 yes，三秒鐘解決「問題」。這正好是中間人希望你做的事：刪掉的是唯一能揭穿它的紀錄。更糟的是 `rm ~/.ssh/known_hosts`，連其他所有主機的紀錄也一起丟掉，下次連到每一台都變成沒有保護的第一次。移除紀錄之前，一定先用其他管道核對新指紋。' },
      ],
    },
    {
      id: 'lnx12-s-harden', title: '停用密碼登入：sshd_config 與安全的套用步驟',
      blocks: [
        { type: 'p', text: '金鑰設定好之後，密碼登入就只剩下風險：任何人都能對它暴力猜測。伺服器的設定在 `/etc/ssh/sshd_config` 與 `/etc/ssh/sshd_config.d/*.conf`，和登入方式有關的是這幾個：' },
        { type: 'table', head: ['設定', '值', '效果'], rows: [
          ['`PasswordAuthentication`', '`no`', '不接受密碼登入（Ubuntu 的預設是 yes）'],
          ['`KbdInteractiveAuthentication`', '`no`', '另一種透過 PAM 問密碼的方式；Ubuntu 的 sshd_config 已經寫了 no，要確認沒有被打開'],
          ['`PubkeyAuthentication`', '`yes`（預設）', '允許金鑰登入'],
          ['`PermitRootLogin`', '`no`', 'root 完全不能用 SSH 登入；管理員用自己的帳號登入再 `sudo`（LNX06），journal 也記得是誰做的'],
          ['`PermitRootLogin`', '`prohibit-password`（預設，舊名 `without-password`）', 'root 只能用金鑰登入，不能用密碼'],
          ['`PermitRootLogin`', '`yes`', 'root 也能用密碼登入：暴力破解最常嘗試的帳號'],
        ] },
        { type: 'p', text: 'sshd 讀設定的規則和多數程式相反：同一個設定以第一次出現的值為準，後面重複的會被忽略。Ubuntu 的 sshd_config 在開頭附近就有一行 `Include /etc/ssh/sshd_config.d/*.conf`（模擬機器上是第 4 行），Include 的檔案在那個位置依檔名順序展開；雲端映像常有 `50-cloud-init.conf`，裡面寫著 `PasswordAuthentication yes`。所以在 sshd_config 最後加一行 `PasswordAuthentication no` 完全沒有作用。正確的做法是寫一個檔名排在前面的 drop-in，例如 `10-hardening.conf`；`sudo sshd -T` 會印出 sshd 實際採用的值，用來確認。' },
        { type: 'p', text: '改設定的安全步驟：' },
        { type: 'list', ordered: true, items: [
          '先安裝公鑰，並用新的連線 `ssh -o BatchMode=yes 帳號@主機` 確認金鑰登入成功、這個帳號能用 sudo。',
          '把設定寫進 `/etc/ssh/sshd_config.d/10-hardening.conf`（模擬環境沒有編輯器，用 `echo … | sudo tee` 與 `sudo tee -a`）。',
          '`sudo sshd -t` 檢查設定：沒有任何輸出、結束碼 0 才繼續；拼錯的設定會印出 `Bad configuration option`。',
          '`sudo systemctl reload ssh` 讓 sshd 重新讀取設定；已經建立的連線不受影響。',
          '保持原本的連線開著，另開一個終端機測試：金鑰登入成功，`ssh -o PubkeyAuthentication=no` 被拒絕。都確認了，才關掉舊的連線。',
        ] },
        { type: 'p', text: '只修改檔案不會生效，sshd 要在啟動或 reload 時才讀設定。Ubuntu 的 ssh.service 在 reload 前也會先執行 `sshd -t`，設定有錯時 reload 失敗、舊設定繼續運作；但不是每個系統、每種重新啟動方式都這麼保險，自己先跑 `sshd -t` 才是好習慣。另外的建議：改 SSH 設定時，永遠留一個已登入的工作階段不要關，用另一個終端機測試新連線；新連線失敗時，還能從舊的連線改回來。雲端主機的網頁主控台（serial console）是最後的退路，先確認你知道它在哪裡。' },
        { type: 'example', id: 'lnx12-config' },
        { type: 'callout', tone: 'warning', title: '先關密碼、後裝金鑰，就把自己鎖在門外', text: '最常見的事故順序是：用 root 的金鑰或密碼登入，關掉密碼登入、設定 `PermitRootLogin no`、reload，再執行 `ssh-copy-id deploy@app-01`——這時 ssh-copy-id 需要密碼，伺服器已經不接受了，root 也進不去，所有人都被擋在外面，只能靠主控台救援。順序永遠是：裝好金鑰並用新連線確認可以登入，再關密碼。' },
      ],
    },
    {
      id: 'lnx12-s-trouble', title: '連不上時，從訊息判斷卡在哪一步',
      blocks: [
        { type: 'p', text: '第二節的六個步驟也是除錯的地圖：每一種錯誤訊息都對應連線卡住的那一步。伺服器刻意不告訴用戶端拒絕的原因（以免把資訊送給攻擊者），所以認證的問題要到伺服器的 `sudo journalctl -u ssh`（LNX11）找原因。' },
        { type: 'table', head: ['訊息', '卡在哪一步', '怎麼處理'], rows: [
          ['`ssh: Could not resolve hostname x: Name or service not known`', '連線之前：名稱查不到位址', '檢查拼字、DNS 或 `/etc/hosts`（CN12）'],
          ['`ssh: connect to host x port 22: Connection refused`', 'TCP：主機回應了，但這個埠沒有程式在聽', 'sshd 沒有執行（`systemctl status ssh`），或 Port 改了（`ssh -p`）'],
          ['`Connection timed out`', 'TCP：完全沒有回應', '防火牆擋住、位址錯誤或網路不通'],
          ['`Host key verification failed.`', '主機金鑰驗證', '第一次連線沒有確認指紋，或金鑰改變了（看上面的警告）'],
          ['`WARNING: UNPROTECTED PRIVATE KEY FILE!`', '用戶端在認證前就拒絕使用這把私鑰', '`chmod 600 ~/.ssh/id_ed25519`'],
          ['`Permission denied (publickey).`', '使用者認證；括號裡是伺服器允許的方法', '金鑰沒裝、裝錯帳號、伺服器的 StrictModes 不接受；看伺服器的 journal'],
          ['`Permission denied (publickey,password).`', '使用者認證，伺服器還接受密碼', '同上；BatchMode 或沒有密碼可用時也會看到'],
        ] },
        { type: 'p', text: '伺服器的 journal 對應的紀錄有：`Accepted publickey for deploy from …`（金鑰登入成功）、`Accepted password for …`（密碼登入成功，關閉密碼後不該再出現）、`Failed password for root from …`、`Invalid user admin from …`（暴力破解的典型痕跡）、`Authentication refused: bad ownership or modes for directory /home/deploy/.ssh`（StrictModes）。看到大量的 Failed password，就是該關閉密碼登入的時候。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [connect, mitm],
    exercises: [
      { id: 'lnx12-auth-order', task: 'table', scene: 'lnx12-ssh-connect', message: 'channel-data', node: 'client', table: '連線進度', row: '使用者認證', column: '順序', title: '使用者認證排在第幾步',
        statement: '在「一次 SSH 連線」情境的最後一步，用戶端的「連線進度」表依發生的先後替六個階段編號。「使用者認證」是第幾個階段？（只填數字）',
        hints: ['先確定通道是加密的，才能安全地送出身分證明。', '用戶端要先確認對面真的是 app-01，才把簽章或密碼交出去。'],
        explanation: '順序是 TCP 連線、版本交換、金鑰交換、主機金鑰驗證，然後才是使用者認證（第 5 個），最後開啟 channel 執行指令。認證排在金鑰交換之後，所以簽章或密碼都在加密的通道裡傳送；排在主機金鑰驗證之後，所以只會交給確認過身分的伺服器，中間人在認證之前就被擋下。',
        mistakes: [
          { answer: { cell: '3' }, why: '以為先認證再交換金鑰：那樣密碼或簽章會以明文送出；金鑰交換（第 3 個）一定在認證之前。' },
          { answer: { cell: '4' }, why: '把使用者認證排在主機金鑰驗證之前：用戶端要先確認伺服器的身分（第 4 個），否則等於把身分證明交給任何冒充者。' },
          { answer: { cell: '2' }, why: '以為連上之後就先輸入帳號密碼：版本交換之後還要先協商加密、驗證主機。' },
        ] },
      { id: 'lnx12-auth-encrypted', task: 'field', scene: 'lnx12-ssh-connect', message: 'userauth', layer: 'application', field: '加密', title: '認證的訊息有沒有加密',
        statement: '同一個情境裡，用戶端送出 USERAUTH_REQUEST（publickey）。這個 SSH 封包的「加密」欄是什麼？（填「是」或「否」）',
        hints: ['找到 NEWKEYS 那一步：它之後的封包用什麼金鑰送出？', 'USERAUTH_REQUEST 排在 NEWKEYS 的前面還是後面？'],
        explanation: 'NEWKEYS 之後雙方改用金鑰交換導出的金鑰，USERAUTH_REQUEST 在它之後送出，所以加密欄是「是」：路上的人看不到使用者名稱、公鑰與簽章。只有版本字串、KEXINIT、兩則金鑰交換訊息與 NEWKEYS 是明文，而它們只帶公開的資訊（演算法清單、公鑰、簽章）。',
        mistakes: [
          { answer: { value: '否' }, why: '把認證當成連線的第一步：認證在 NEWKEYS 之後，整個請求（包括簽章）都已經加密。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'lnx12-q1', prompt: '執行 `ssh deploy@app-01 ls /nope` 之後，`echo $?` 印出 `2`。這代表什麼？',
      options: ['ssh 連不上 app-01', '遠端的 `ls` 以結束碼 2 結束，ssh 把它傳了回來', 'deploy 的密碼錯誤', 'app-01 的主機金鑰和 known_hosts 不符'],
      answer: 1,
      explanation: 'ssh 以遠端指令的結束碼當作自己的結束碼，`ls` 找不到檔案時是 2，所以連線本身是成功的。ssh 自己失敗時，不論是連不上、密碼或金鑰被拒，還是主機金鑰不符，結束碼都是 255，不會是 2。',
    },
    {
      id: 'lnx12-q2', prompt: '要讓 learner 能用金鑰登入 app-01 的 deploy 帳號，下面哪一個做法正確？',
      options: ['把私鑰 `id_ed25519` 複製到 app-01 的 `/home/deploy/.ssh/authorized_keys`', '把公鑰加進 ops-pc 自己的 `~/.ssh/known_hosts`', '把私鑰與公鑰都放到 app-01 的 `/etc/ssh/`', '把公鑰 `id_ed25519.pub` 的內容附加到 app-01 上 `/home/deploy/.ssh/authorized_keys`，例如用 `ssh-copy-id deploy@app-01`'],
      answer: 3,
      explanation: '伺服器只需要公鑰，放在要登入的帳號（deploy）的 authorized_keys 裡；ssh-copy-id 正是做這件事。私鑰永遠留在用戶端，複製到伺服器就失去了保護；known_hosts 記錄的是伺服器的主機金鑰，不是使用者的公鑰；`/etc/ssh/` 放的是伺服器自己的主機金鑰與設定。',
    },
    {
      id: 'lnx12-q3', prompt: '`known_hosts` 和 `authorized_keys` 的差別是什麼？',
      options: ['known_hosts 在用戶端，記錄信任的伺服器主機金鑰；authorized_keys 在伺服器的帳號家目錄，記錄允許登入的使用者公鑰', '兩者都在伺服器上，一個給 root、一個給一般使用者', 'known_hosts 存私鑰，authorized_keys 存公鑰', 'known_hosts 記錄登入失敗的來源位址，authorized_keys 記錄成功的'],
      answer: 0,
      explanation: '兩個檔案方向相反：known_hosts 讓用戶端驗證伺服器（防中間人），authorized_keys 讓伺服器驗證使用者（金鑰登入）。known_hosts 在用戶端，不是兩者都在伺服器上，也不分 root 與一般使用者；兩者存的都是公開的金鑰，沒有私鑰；登入成功與失敗的紀錄在伺服器的 journal，不在這兩個檔案裡。',
    },
    {
      id: 'lnx12-q4', prompt: '連到 db-01 時出現 `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!`。最正確的反應是什麼？',
      options: ['照警告的提示執行 `ssh-keygen -R db-01`，再連線回答 yes', '用 `-o StrictHostKeyChecking=no` 先連進去看看發生什麼事', '先不連線，透過其他管道（主控台、管理員的公告）核對新指紋；相符才移除舊紀錄並加入新金鑰，不符就通報', '刪除整個 `~/.ssh/known_hosts`，重新建立'],
      answer: 2,
      explanation: '金鑰改變可能是重灌，也可能是中間人，光看警告分不出來，所以要用獨立的管道核對指紋。直接 `-R` 再回答 yes，就是接受了未經驗證的金鑰；`StrictHostKeyChecking=no` 照樣連到可能是攻擊者的機器；刪掉整個 known_hosts 還會讓所有主機都失去保護。',
    },
    {
      id: 'lnx12-q5', prompt: 'app-01 的 `/etc/ssh/sshd_config.d/50-cloud-init.conf` 寫著 `PasswordAuthentication yes`。管理員在 `/etc/ssh/sshd_config` 的最後加上 `PasswordAuthentication no` 並 reload，密碼仍然能登入。為什麼？',
      options: ['sshd 以第一次出現的值為準，sshd_config 開頭的 Include 先讀到了 50-cloud-init.conf 的 yes', 'reload 不會重新讀取設定，一定要重新開機', '`PasswordAuthentication` 只能寫在 `.d` 目錄裡', '要等已經登入的使用者都登出才會生效'],
      answer: 0,
      explanation: 'sshd 的同一個設定以第一個值為準；Ubuntu 在 sshd_config 的開頭就 Include 了 `sshd_config.d/*.conf`，所以 yes 比檔案最後的 no 先出現。要寫成檔名排在前面的 drop-in（例如 10-hardening.conf），再用 `sudo sshd -T` 確認。reload 確實會重新讀取設定；這個設定寫在哪個檔案都合法；新的連線立刻套用新設定，不必等別人登出。',
    },
    {
      id: 'lnx12-q6', prompt: '`PermitRootLogin prohibit-password` 的效果是什麼？',
      options: ['root 完全不能用 SSH 登入', 'root 只能用密碼登入', '所有帳號都不能用密碼登入', 'root 可以用金鑰登入，但不能用密碼登入'],
      answer: 3,
      explanation: 'prohibit-password（舊名 without-password）只禁止 root 使用密碼，root 的 authorized_keys 裡的金鑰仍可登入；這也是 OpenSSH 的預設值。要 root 完全不能登入要寫 `PermitRootLogin no`；它不影響其他帳號，其他帳號的密碼登入由 PasswordAuthentication 控制；選項名稱說的正好是「禁止密碼」，不是只允許密碼。',
    },
    {
      id: 'lnx12-q7', prompt: '要在 app-01 關閉密碼登入，下面哪一個順序最安全？',
      options: ['先寫入 `PasswordAuthentication no` 並 reload，再用 `ssh-copy-id` 安裝公鑰', '安裝公鑰並用新連線確認金鑰登入成功 → 寫入 drop-in → `sudo sshd -t` → `sudo systemctl reload ssh` → 保留原連線，另開終端機測試', '寫入設定後直接 `sudo systemctl restart ssh`，不需要檢查', '寫入設定後登出，再用金鑰登入看看'],
      answer: 1,
      explanation: '關閉密碼之前必須確定金鑰已經可以登入；`sshd -t` 先抓出拼字錯誤；reload 不會中斷已建立的連線；留著原本的連線，測試失敗時才能改回來。先關密碼再裝金鑰，ssh-copy-id 會因為需要密碼而失敗；不檢查就重新啟動，設定有錯時可能讓 sshd 起不來；先登出再測試，萬一失敗就沒有任何連線可以修正。',
    },
    {
      id: 'lnx12-q8', prompt: 'learner 執行 `chmod 644 ~/.ssh/id_ed25519` 之後，金鑰登入失敗並出現 `UNPROTECTED PRIVATE KEY FILE!`。原因與修正是什麼？',
      options: ['伺服器的 StrictModes 拒絕了這把公鑰，要在伺服器上 `chmod 600 authorized_keys`', '644 讓公鑰無法被讀取，要改成 777', '私鑰讓群組與其他人都能讀，ssh 拒絕使用它；用 `chmod 600 ~/.ssh/id_ed25519` 修正', '金鑰檔被改壞了，要重新產生金鑰'],
      answer: 2,
      explanation: '這個警告來自用戶端：私鑰只要群組或其他人有任何權限，ssh 就印出 Permissions 0644 … are too open 並忽略它，改回 600 就好。StrictModes 是伺服器檢查 authorized_keys 與目錄，訊息只在伺服器的 journal；777 只會更糟；檔案內容沒有被改壞（那是 `invalid format`），不需要重新產生。',
    },
  ],
  terminal: {
    machines: [fresh, keys, rented],
    examples: [
      {
        id: 'lnx12-first', title: '第一次連線、遠端指令與互動式工作階段', machine: 'lnx12-fresh',
        description: '第一次連線時 ssh 要求確認主機指紋（模擬環境沒有鍵盤，結束碼 255）；用 `ssh-keyscan` 與 `ssh-keygen -l` 取得並比對指紋後以 `accept-new` 接受，ssh 建立 700 的 `~/.ssh` 與 known_hosts；之後以密碼登入，執行單一指令、看遠端的結束碼，最後開一個互動式工作階段再 `exit` 回來。',
        steps: [
          { command: 'ssh deploy@app-01 hostname', output: 'The authenticity of host \'app-01 (10.20.0.21)\' can\'t be established.\nED25519 key fingerprint is SHA256:6BLcsaLivYPLgnqYrKCe72dKNVNieCCEZm7CJ1VbNe8.\nThis key is not known by any other names.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? （模擬環境沒有鍵盤輸入：先確認指紋，再用 ssh -o StrictHostKeyChecking=accept-new 或 ssh-keyscan 加入 known_hosts）\nHost key verification failed.' },
          { command: 'echo $?', output: '255' },
          { command: 'ssh-keyscan app-01 > app-01.key', output: '# app-01:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' },
          { command: 'ssh-keygen -l -f app-01.key', output: '256 SHA256:6BLcsaLivYPLgnqYrKCe72dKNVNieCCEZm7CJ1VbNe8 app-01 (ED25519)' },
          { command: 'ssh -o StrictHostKeyChecking=accept-new deploy@app-01 hostname', output: 'Warning: Permanently added \'app-01\' (ED25519) to the list of known hosts.\ndeploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\napp-01' },
          { command: 'ls -ld ~/.ssh', output: 'drwx------ learner learner  4096 /home/learner/.ssh/' },
          { command: 'cat ~/.ssh/known_hosts', output: 'app-01 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINFij2PnaZFO7yGGZAsYS9/gOlNdHknqPlUq88/C+aTU' },
          { command: 'ssh deploy@app-01 whoami', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\ndeploy' },
          { command: 'ssh deploy@app-01 ls /nope', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\nls: cannot access \'/nope\': No such file or directory' },
          { command: 'echo $?', output: '2' },
          { command: 'ssh deploy@app-01', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\napp-01: order API (production)' },
          { command: 'pwd', output: '/home/deploy' },
          { command: 'hostname', output: 'app-01' },
          { command: 'exit', output: 'logout\nConnection to app-01 closed.' },
          { command: 'hostname', output: 'ops-pc' },
        ],
      },
      {
        id: 'lnx12-keygen', title: '產生金鑰並安裝到伺服器', machine: 'lnx12-fresh',
        description: '`ssh-keygen` 建立 700 的 `~/.ssh`、600 的私鑰與 644 的公鑰，並印出指紋與 randomart；把核對過的主機金鑰加入 known_hosts 後，`ssh-copy-id` 用密碼登入一次、把公鑰附加到 deploy 的 authorized_keys；`BatchMode=yes` 證明金鑰登入成功；再執行一次 ssh-copy-id 會跳過已經裝過的金鑰。',
        steps: [
          { command: 'ssh-keygen -t ed25519 -N \'\'', output: 'Generating public/private ed25519 key pair.\nEnter file in which to save the key (/home/learner/.ssh/id_ed25519): \nCreated directory \'/home/learner/.ssh\'.\nYour identification has been saved in /home/learner/.ssh/id_ed25519\nYour public key has been saved in /home/learner/.ssh/id_ed25519.pub\nThe key fingerprint is:\nSHA256:l8x3BgRDey3/qRqHj7bfd57pfCfp3pO9QgZB8GhWUhE learner@ops-pc\nThe key\'s randomart image is:\n+--[ED25519 256]--+\n|         +BE+    |\n|          == .   |\n|         +..= .  |\n|        oo + +   |\n|        S = o +  |\n|         . ..= ..|\n|           oo. o+|\n|           .=.*+O|\n|          .++*=XX|\n+----[SHA256]-----+' },
          { command: 'ls -l ~/.ssh', output: '-rw------- learner learner   411 id_ed25519\n-rw-r--r-- learner learner    96 id_ed25519.pub' },
          { command: 'cat ~/.ssh/id_ed25519.pub', output: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPKdYx8tJmIbiNywidJT6NPmsuc15OKQfG/rUZX/V/BP learner@ops-pc' },
          { command: 'ssh-keyscan app-01 >> ~/.ssh/known_hosts', output: '# app-01:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' },
          { command: 'ssh-keygen -l -f ~/.ssh/known_hosts', output: '256 SHA256:6BLcsaLivYPLgnqYrKCe72dKNVNieCCEZm7CJ1VbNe8 app-01 (ED25519)' },
          { command: 'ssh-copy-id deploy@app-01', output: '/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "/home/learner/.ssh/id_ed25519.pub"\n/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed\n/usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys\ndeploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\n\nNumber of key(s) added: 1\n\nNow try logging into the machine, with: "ssh \'deploy@app-01\'"\nand check to make sure that only the key(s) you wanted were added.\n' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: 'app-01' },
          { command: 'ssh deploy@app-01 ls -la .ssh', output: 'drwx------ deploy  deploy   4096 .\ndrwxr-x--- deploy  deploy   4096 ..\n-rw------- deploy  deploy     96 authorized_keys' },
          { command: 'ssh deploy@app-01 cat .ssh/authorized_keys', output: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPKdYx8tJmIbiNywidJT6NPmsuc15OKQfG/rUZX/V/BP learner@ops-pc' },
          { command: 'ssh-copy-id deploy@app-01', output: '/usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "/home/learner/.ssh/id_ed25519.pub"\n/usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed\n/usr/bin/ssh-copy-id: WARNING: All keys were skipped because they already exist on the remote system.\n\t\t(if you think this is a mistake, you may want to use -f option)\n' },
        ],
      },
      {
        id: 'lnx12-perms', title: '權限太寬時兩端都會拒絕', machine: 'lnx12-keys',
        description: '私鑰改成 644，用戶端印出 UNPROTECTED PRIVATE KEY FILE 並忽略它；改回 600 就恢復。伺服器上的 `.ssh` 改成群組可寫（775）後，sshd 的 StrictModes 不接受金鑰，用戶端只看到 Permission denied，原因在伺服器的 journal；這時還能用密碼登入把權限改回 700。',
        steps: [
          { command: 'chmod 644 ~/.ssh/id_ed25519', output: '' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nPermissions 0644 for \'/home/learner/.ssh/id_ed25519\' are too open.\nIt is required that your private key files are NOT accessible by others.\nThis private key will be ignored.\nLoad key "/home/learner/.ssh/id_ed25519": bad permissions\ndeploy@app-01: Permission denied (publickey,password).' },
          { command: 'chmod 600 ~/.ssh/id_ed25519', output: '' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: 'app-01' },
          { command: 'ssh deploy@app-01 chmod 775 .ssh', output: '' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: 'deploy@app-01: Permission denied (publickey,password).' },
          { command: 'ssh deploy@app-01 sudo journalctl -u ssh -o cat -n 2', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\nAuthentication refused: bad ownership or modes for directory /home/deploy/.ssh\nAccepted password for deploy from 10.20.0.5 port 50005 ssh2' },
          { command: 'ssh deploy@app-01 chmod 700 .ssh', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: 'app-01' },
        ],
      },
      {
        id: 'lnx12-changed', title: '主機金鑰改變了：先核對，不要急著刪', machine: 'lnx12-keys',
        description: 'db-01 昨天重灌，連線時出現 REMOTE HOST IDENTIFICATION HAS CHANGED（結束碼 255）。先讀工單公告的新指紋，再把 db-01 現在出示的金鑰存成檔案、算出指紋比對，並看 known_hosts 裡舊的那一行；比對相符之後怎麼更新 known_hosts，留給練習。',
        steps: [
          { command: 'ssh deploy@db-01 hostname', output: '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@\nIT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!\nSomeone could be eavesdropping on you right now (man-in-the-middle attack)!\nIt is also possible that a host key has just been changed.\nThe fingerprint for the ED25519 key sent by the remote host is\nSHA256:939p6hgwShuKc6DbVJmsQr0m6XMWDnUeEyh+OpciAHQ.\nPlease contact your system administrator.\nAdd correct host key in /home/learner/.ssh/known_hosts to get rid of this message.\nOffending ED25519 key in /home/learner/.ssh/known_hosts:2\n  remove with:\n  ssh-keygen -f \'/home/learner/.ssh/known_hosts\' -R \'db-01\'\nHost key for db-01 has changed and you have requested strict checking.\nHost key verification failed.' },
          { command: 'echo $?', output: '255' },
          { command: 'cat ticket-1842.txt', output: '工單 #1842（2026-11-21，資料庫組 Lin）\ndb-01 已重灌為 Ubuntu 24.04，主機金鑰重新產生。\n新的 ED25519 指紋：SHA256:939p6hgwShuKc6DbVJmsQr0m6XMWDnUeEyh+OpciAHQ\n連線前請先核對指紋，再更新你的 known_hosts。' },
          { command: 'ssh-keyscan db-01 > db-01.key', output: '# db-01:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' },
          { command: 'ssh-keygen -l -f db-01.key', output: '256 SHA256:939p6hgwShuKc6DbVJmsQr0m6XMWDnUeEyh+OpciAHQ db-01 (ED25519)' },
          { command: 'ssh-keygen -F db-01', output: '# Host db-01 found: line 2 \ndb-01 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ8H1hegY5HqTCOb1NdSgJ+b3StNSWtcFDZZCbF+KwZv' },
        ],
      },
      {
        id: 'lnx12-config', title: '關閉密碼登入：第一個值生效、sshd -t 與 reload', machine: 'lnx12-keys',
        description: '雲端映像的 50-cloud-init.conf 打開了密碼登入；寫在 sshd_config 最後的 no 被忽略（`sshd -T` 仍是 yes）；drop-in 拼錯時 `sshd -t` 印出錯誤與結束碼 255；改正並檢查後 `sshd -T` 是 no，但 reload 之前密碼仍可登入；reload 之後密碼被拒、金鑰照常登入。',
        steps: [
          { command: 'ssh deploy@app-01 ls /etc/ssh/sshd_config.d', output: '50-cloud-init.conf' },
          { command: 'ssh deploy@app-01 cat /etc/ssh/sshd_config.d/50-cloud-init.conf', output: 'PasswordAuthentication yes' },
          { command: 'ssh deploy@app-01 grep -n -i -e Include -e PasswordAuthentication /etc/ssh/sshd_config', output: '4:Include /etc/ssh/sshd_config.d/*.conf\n18:#PasswordAuthentication yes' },
          { command: 'ssh deploy@app-01 \'echo PasswordAuthentication no | sudo tee -a /etc/ssh/sshd_config\'', output: 'PasswordAuthentication no' },
          { command: 'ssh deploy@app-01 sudo sshd -T | grep passwordauthentication', output: 'passwordauthentication yes' },
          { command: 'ssh deploy@app-01 \'echo PasswordAuthentcation no | sudo tee /etc/ssh/sshd_config.d/10-hardening.conf\'', output: 'PasswordAuthentcation no' },
          { command: 'ssh deploy@app-01 sudo sshd -t', output: '/etc/ssh/sshd_config.d/10-hardening.conf: line 1: Bad configuration option: PasswordAuthentcation\n/etc/ssh/sshd_config: terminating, 1 bad configuration options' },
          { command: 'echo $?', output: '255' },
          { command: 'ssh deploy@app-01 \'echo PasswordAuthentication no | sudo tee /etc/ssh/sshd_config.d/10-hardening.conf\'', output: 'PasswordAuthentication no' },
          { command: 'ssh deploy@app-01 sudo sshd -t', output: '' },
          { command: 'ssh deploy@app-01 sudo sshd -T | grep authentication', output: 'pubkeyauthentication yes\npasswordauthentication no\nkbdinteractiveauthentication no' },
          { command: 'ssh -o PubkeyAuthentication=no deploy@app-01 hostname', output: 'deploy@app-01\'s password: （模擬環境代為輸入課程提供的密碼）\napp-01' },
          { command: 'ssh deploy@app-01 sudo systemctl reload ssh', output: '' },
          { command: 'ssh -o PubkeyAuthentication=no deploy@app-01 hostname', output: 'deploy@app-01: Permission denied (publickey).' },
          { command: 'ssh -o BatchMode=yes deploy@app-01 hostname', output: 'app-01' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx12-setup-key', title: '設定金鑰登入', machine: 'lnx12-fresh',
        statement: `ops-pc 還沒有任何金鑰，也沒有連過 app-01。雲端主控台顯示 app-01 的 ED25519 主機金鑰指紋是 ${APP_KEY.fingerprint}。請：產生一把沒有密語的 ed25519 金鑰（預設檔名 ~/.ssh/id_ed25519）；核對 app-01 的指紋並把它加入 known_hosts；把公鑰安裝到 app-01 的 deploy 帳號（課程提供 deploy 的密碼），讓 learner 之後可以不用密碼、以金鑰登入 deploy@app-01。`,
        checks: [
          { kind: 'ssh', host: 'app-01', user: 'deploy', method: 'publickey', allowed: true },
          { kind: 'known-host', host: 'app-01' },
          { kind: 'mode', path: `${HOME}/.ssh/id_ed25519`, mode: 0o600 },
          { kind: 'mode', host: 'app-01', path: '/home/deploy/.ssh/authorized_keys', mode: 0o600 },
        ],
        solution: [
          "ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519",
          'ssh-keyscan app-01 > app-01.key',
          'ssh-keygen -l -f app-01.key',
          'cat app-01.key >> ~/.ssh/known_hosts',
          'ssh-copy-id deploy@app-01',
          'ssh -o BatchMode=yes deploy@app-01 hostname',
        ],
        mistakes: [
          { commands: ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519"], why: '只產生了金鑰：公鑰還在 ops-pc 上，app-01 的 deploy 沒有 authorized_keys，伺服器不認得這把金鑰；known_hosts 也還沒有 app-01。' },
          { commands: ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519", 'ssh-copy-id deploy@app-01'], why: '沒有先處理主機金鑰：ssh-copy-id 也要經過主機金鑰驗證，第一次連線時沒有人回答指紋的問題，連線在認證之前就停止，公鑰沒有裝上去。' },
          { commands: ["ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519", 'ssh-keyscan app-01 >> ~/.ssh/known_hosts', 'ssh deploy@app-01 mkdir .ssh', "cat ~/.ssh/id_ed25519 | ssh deploy@app-01 'cat >> .ssh/authorized_keys'"],
            why: '把私鑰送到了伺服器：authorized_keys 要的是一行公鑰（`.pub` 的內容），私鑰的內容 sshd 不認得，金鑰登入失敗；而且私鑰已經離開了 ops-pc，這把金鑰應該作廢重做。' },
        ],
        hints: [
          '`ssh-keygen -t ed25519 -N \'\' -f ~/.ssh/id_ed25519` 產生金鑰，並建立 700 的 `~/.ssh`。',
          '`ssh-keyscan app-01 > app-01.key` 抓下金鑰，`ssh-keygen -l -f app-01.key` 算出指紋和題目比對，相符再 `cat app-01.key >> ~/.ssh/known_hosts`。',
          '`ssh-copy-id deploy@app-01` 會用密碼登入一次並安裝公鑰；最後用 `ssh -o BatchMode=yes deploy@app-01 hostname` 確認不需要密碼。',
        ],
        explanation: `ssh-keygen 產生 600 的私鑰與 644 的公鑰；ssh-keyscan 抓下 app-01 出示的金鑰，ssh-keygen -l 算出的指紋 ${APP_KEY.fingerprint} 和主控台相同，才把它加進 known_hosts（也可以比對後用 ssh -o StrictHostKeyChecking=accept-new）。ssh-copy-id 用密碼登入一次，把公鑰附加到 /home/deploy/.ssh/authorized_keys（目錄 700、檔案 600、屬於 deploy）。BatchMode=yes 不會退回密碼，所以它印出 app-01 就證明金鑰登入成功。整個過程私鑰都沒有離開 ops-pc。`,
      },
      {
        id: 'lnx12-rekey-db', title: '核對並更新 db-01 的主機金鑰', machine: 'lnx12-keys',
        statement: 'db-01 昨天重灌，連線時出現 REMOTE HOST IDENTIFICATION HAS CHANGED。工單 ~/ticket-1842.txt 公告了新的指紋。請：把 db-01 現在出示的金鑰存成 ~/db-01.key，算出它的指紋和工單比對；確認相符後，移除 known_hosts 裡 db-01 的舊紀錄並加入這把新金鑰（app-01 的紀錄要保留）；最後用 `ssh-keygen -l -f ~/.ssh/known_hosts` 列出你現在信任的每一把主機金鑰的指紋。檢查時，你的指令也會在另一種情況（db-01 換成另一把金鑰、工單也公告那一把）重新執行一次。',
        checks: [{ kind: 'known-host', host: 'db-01' }, { kind: 'known-host', host: 'app-01' }, { kind: 'output' }],
        solution: [
          'ssh-keyscan db-01 > db-01.key',
          'ssh-keygen -l -f db-01.key',
          'ssh-keygen -R db-01',
          'cat db-01.key >> ~/.ssh/known_hosts',
          'ssh-keygen -l -f ~/.ssh/known_hosts',
        ],
        variants: [OTHER_REINSTALL],
        mistakes: [
          { commands: ['ssh-keygen -R db-01', 'ssh -o StrictHostKeyChecking=accept-new deploy@db-01 hostname'],
            why: '照著警告盲目刪除舊紀錄再重新連線：從頭到尾沒有算出新指紋和工單比對，如果這次真的是中間人，你已經接受了它的金鑰並登入了它的機器。' },
          { commands: ['rm ~/.ssh/known_hosts', 'ssh-keyscan db-01 > db-01.key', 'ssh-keygen -l -f db-01.key', 'cat db-01.key >> ~/.ssh/known_hosts', 'ssh-keygen -l -f ~/.ssh/known_hosts'],
            why: '刪掉了整個 known_hosts：app-01 的紀錄也一起消失，下次連 app-01 又變成沒有保護的第一次連線。只移除 db-01 那一行要用 `ssh-keygen -R db-01`。' },
          { commands: ['ssh -o StrictHostKeyChecking=no deploy@db-01 hostname', 'ssh-keygen -l -f ~/.ssh/known_hosts'],
            why: '用 StrictHostKeyChecking=no 硬闖：ssh 照樣連到了出示新金鑰的那一台（只停用了密碼），known_hosts 裡仍是舊的金鑰，什麼都沒有核對也沒有更新。' },
        ],
        hints: [
          '`ssh-keyscan db-01 > db-01.key` 把對方出示的金鑰存起來，`ssh-keygen -l -f db-01.key` 算出指紋，和 `cat ticket-1842.txt` 的那一行比對。',
          '`ssh-keygen -R db-01` 只移除 db-01 的紀錄（原檔留成 known_hosts.old）。',
          '加入的是你核對過的那個檔案：`cat db-01.key >> ~/.ssh/known_hosts`。',
        ],
        explanation: `db-01 出示的指紋 ${DB_NEW.fingerprint} 和工單公告的相同，才代表這次的金鑰改變是重灌造成的。ssh-keygen -R db-01 只移除第 2 行並留下 known_hosts.old，加入的是剛才核對過的 db-01.key（而不是再抓一次，以免中間又被換掉），所以最後的清單是 app-01 原本的指紋加上 db-01 的新指紋。另一種情況下 db-01 是另一把金鑰，指紋清單也不同，直接打出答案無法通過。如果比對不符，就停在第二步：不要移除舊紀錄、不要連線，通報管理員。`,
      },
      {
        id: 'lnx12-key-only', title: '安全地改成只允許金鑰登入', machine: 'lnx12-rented',
        statement: '新租的 app-01：供應商在建立主機時把 learner 的公鑰裝給了 root，sshd_config 裡寫著 `PermitRootLogin yes`，50-cloud-init.conf 打開了密碼登入；deploy 帳號（在 sudo 群組，課程提供密碼）還沒有安裝金鑰。團隊的規定是：所有人以 deploy 用金鑰登入再 sudo。請讓 app-01 最後變成：deploy 可以用金鑰登入、任何帳號都不能用密碼登入、root 完全不能用 SSH 登入（連金鑰也不行）。設定請寫在 `/etc/ssh/sshd_config.d/10-hardening.conf`。',
        checks: [
          { kind: 'ssh', host: 'app-01', user: 'deploy', method: 'publickey', allowed: true },
          { kind: 'ssh', host: 'app-01', user: 'deploy', method: 'password', allowed: false },
          { kind: 'ssh', host: 'app-01', user: 'root', method: 'publickey', allowed: false },
        ],
        solution: [
          'ssh-copy-id deploy@app-01',
          'ssh -o BatchMode=yes deploy@app-01 hostname',
          `ssh deploy@app-01 'echo PasswordAuthentication no | sudo tee ${HARDENING}'`,
          `ssh deploy@app-01 'echo PermitRootLogin no | sudo tee -a ${HARDENING}'`,
          'ssh deploy@app-01 sudo sshd -t',
          'ssh deploy@app-01 sudo systemctl reload ssh',
          'ssh -o BatchMode=yes deploy@app-01 hostname',
        ],
        mistakes: [
          { commands: [`ssh root@app-01 'echo PasswordAuthentication no > ${HARDENING}'`, `ssh root@app-01 'echo PermitRootLogin no >> ${HARDENING}'`, 'ssh root@app-01 systemctl reload ssh', 'ssh-copy-id deploy@app-01'],
            why: '先關密碼、後裝金鑰：reload 之後 ssh-copy-id 需要用密碼登入 deploy，伺服器已經不接受（Permission denied (publickey)）；root 也被 PermitRootLogin no 擋住，所有人都被鎖在門外。' },
          { commands: ['ssh-copy-id deploy@app-01', `ssh deploy@app-01 'echo PasswordAuthentcation no | sudo tee ${HARDENING}'`, `ssh deploy@app-01 'echo PermitRootLogin no | sudo tee -a ${HARDENING}'`, 'ssh deploy@app-01 sudo systemctl reload ssh'],
            why: '沒有先用 sshd -t 檢查：PasswordAuthentication 拼錯了，reload 時的檢查失敗（Job for ssh.service failed），sshd 繼續用舊的設定，密碼登入與 root 登入都還開著，而你可能根本沒注意到那一行錯誤訊息。' },
          { commands: ['ssh-copy-id deploy@app-01', `ssh deploy@app-01 'echo PasswordAuthentication no | sudo tee ${HARDENING}'`, `ssh deploy@app-01 'echo PermitRootLogin without-password | sudo tee -a ${HARDENING}'`, 'ssh deploy@app-01 sudo sshd -t', 'ssh deploy@app-01 sudo systemctl reload ssh'],
            why: '把 root 限制錯了：without-password 是 prohibit-password 的舊名，意思是「root 不能用密碼」，root 的金鑰照樣能登入；要 root 完全不能登入要寫 `PermitRootLogin no`。' },
          { commands: ['ssh-copy-id deploy@app-01', "ssh deploy@app-01 'echo PasswordAuthentication no | sudo tee -a /etc/ssh/sshd_config'", "ssh deploy@app-01 'echo PermitRootLogin no | sudo tee -a /etc/ssh/sshd_config'", 'ssh deploy@app-01 sudo sshd -t', 'ssh deploy@app-01 sudo systemctl reload ssh'],
            why: '寫在 sshd_config 的最後：開頭 Include 的 50-cloud-init.conf 已經是 PasswordAuthentication yes，檔案前面也已經有 PermitRootLogin yes，sshd 以第一個值為準，兩行 no 都被忽略。' },
          { commands: ['ssh-copy-id deploy@app-01', `ssh deploy@app-01 'echo PasswordAuthentication no | sudo tee ${HARDENING}'`, `ssh deploy@app-01 'echo PermitRootLogin no | sudo tee -a ${HARDENING}'`, 'ssh deploy@app-01 sudo sshd -t'],
            why: '改了設定也檢查了，卻沒有 reload：sshd 只在啟動或 reload 時讀設定，執行中的 sshd 仍然接受密碼與 root 登入。' },
        ],
        hints: [
          '第一步一定是讓 deploy 的金鑰登入可用：`ssh-copy-id deploy@app-01`，再用 `ssh -o BatchMode=yes deploy@app-01 hostname` 確認。',
          '用 `ssh deploy@app-01 \'echo 設定 | sudo tee 檔案\'` 寫第一行、`sudo tee -a` 附加第二行；10- 開頭的檔名排在 50-cloud-init.conf 前面。',
          '`ssh deploy@app-01 sudo sshd -t` 沒有輸出才 `sudo systemctl reload ssh`；root 完全不能登入是 `PermitRootLogin no`。',
        ],
        explanation: '先以密碼執行 ssh-copy-id 安裝 deploy 的公鑰，並用 BatchMode 確認金鑰登入可行，之後就算關掉密碼也不會被鎖在外面。10-hardening.conf 經由 sshd_config 開頭的 Include 最先被讀到，所以 PasswordAuthentication no 蓋過了 50-cloud-init.conf 的 yes，PermitRootLogin no 也蓋過了 sshd_config 後面的 yes。sshd -t 沒有輸出代表設定正確，reload 後才生效：deploy 的密碼被拒、root 的金鑰也被拒、deploy 的金鑰照常登入。真實環境裡，做這些事時還要保持一個已登入的工作階段，直到新連線測試成功。',
      },
    ],
  },
};
