import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalCacheEntry } from '@/lib/terminal/server-lesson';
import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV02 Domains and DNS Records (SRV-1, network-sequence). A terminal lesson on the dns profile (engine stage E11) beside
 * one network-protocol scene. The terminal part: the zone example.net served by BIND (named) on ns1 — named.conf.local,
 * the zone file ($ORIGIN, $TTL, SOA, NS, A, AAAA, MX with priorities, TXT with SPF, a CNAME with its own TTL), dig
 * (+short, @server, +noall +answer, reading the header, flags and ANSWER section) and host; names without a final dot
 * that become relative to the origin; named-checkzone before rndc reload, a failed reload that keeps the old zone, and a
 * CNAME at the zone apex ("CNAME and other data"); on a workstation, /etc/hosts before DNS for glibc and resolved (never
 * for dig), and the stub resolver's cache with the TTL left during a website move, flushed with resolvectl. The network
 * part: one lookup of www.example.net from a browser through the stub resolver and a recursive resolver to the
 * authoritative server (the delegation from the root and .net servers already cached; described in the text), then the
 * same question from a phone fifty minutes later answered from the resolver's cache with the old address. Domain names
 * are reserved for documentation (example.net, example.org); addresses are RFC 5737 and 2001:db8::/32. Host names, users
 * and files are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const HOME = '/home/learner';

/** The zone as ns1 serves it this morning (after the website moved from 192.0.2.10 to 203.0.113.10 at 09:50). */
const ZONE = `$ORIGIN example.net.
$TTL 3600
@       IN  SOA ns1.example.net. hostmaster.example.net. (
            2026112201 ; serial
            3600       ; refresh
            900        ; retry
            1209600    ; expire
            300 )      ; negative TTL
        IN  NS   ns1.example.net.
        IN  A    203.0.113.10
        IN  AAAA 2001:db8:10::10
        IN  MX   10 mail.example.net.
        IN  MX   20 mail2.example.net.
        IN  TXT  "v=spf1 mx -all"
ns1     IN  A    203.0.113.53
mail    IN  A    203.0.113.25
mail2   IN  A    198.51.100.25
www     86400 IN CNAME example.net.
`;
/** A colleague's draft: the website moves to a hosting provider, written as a CNAME at the apex (BIND refuses it). */
const DRAFT = `; draft 2026-11-22: move the website to the hosting provider, add news
${ZONE.replace('2026112201', '2026112202').replace('        IN  NS   ns1.example.net.\n        IN  A    203.0.113.10\n        IN  AAAA 2001:db8:10::10\n',
  '@       IN  CNAME site.hosting.example.org.\n        IN  NS   ns1.example.net.\n')}news    IN  A    203.0.113.60
`;
/** The hosting provider's zone (somewhere else on the internet). */
const HOSTING = `$ORIGIN hosting.example.org.
$TTL 300
@       IN  SOA ns.hosting.example.org. ops.hosting.example.org. 41 3600 600 86400 300
        IN  NS  ns.hosting.example.org.
ns      IN  A   192.0.2.53
site    IN  A   198.51.100.80
`;
const NAMED_LOCAL = 'zone "example.net" {\n\ttype master;\n\tfile "/etc/bind/db.example.net";\n};\n';
const bind = [dir('/etc'), dir('/etc/bind'), file('/etc/bind/named.conf.local', NAMED_LOCAL, 'root', 0o644, 'bind'), file('/etc/bind/db.example.net', ZONE, 'root', 0o644, 'bind')];
const home = [dir('/home'), dir(HOME, 'learner', 0o750)];
const SUDO = { groups: [{ name: 'sudo', members: ['learner'] }] };

/** ns1 itself: learner administers the zone with sudo. */
const ns: TerminalMachine = {
  id: 'srv02-ns', title: 'ns1（example.net 的權威 DNS 伺服器）', user: 'learner', cwd: HOME, host: 'ns1', profile: 'dns', address: '203.0.113.53', named: true,
  files: [...bind, ...home], accounts: SUDO,
};
/** ns1 again, with the colleague's draft in learner's home and the hosting provider's zone on the internet. */
const draft: TerminalMachine = {
  ...ns, id: 'srv02-draft', title: 'ns1（同事留下的區域檔草稿）',
  files: [...bind, ...home, file(`${HOME}/db.example.net.new`, DRAFT, 'learner')], internet: [{ zone: 'hosting.example.org', text: HOSTING }],
};
/** The stub resolver's cache on office-pc: both records were cached at 09:15, before the move (09:50). */
const cacheAt = (cachedAt: string): TerminalCacheEntry[] => [
  { name: 'www.example.net', type: 'CNAME', ttl: 86400, cachedAt, data: ['example.net.'] },
  { name: 'example.net', type: 'A', ttl: 3600, cachedAt, data: ['192.0.2.10'] },
];
const nsRemote: TerminalRemote = { host: 'ns1', title: 'ns1（權威 DNS 伺服器）', address: '203.0.113.53', hostKey: 'srv02-ns1', named: true, files: bind };
/** An office workstation whose resolver still remembers the old address. */
const ws: TerminalMachine = {
  id: 'srv02-ws', title: 'office-pc（辦公室的工作站，網站搬家中）', user: 'learner', cwd: HOME, host: 'office-pc', profile: 'dns', address: '192.0.2.25',
  files: home, accounts: SUDO, remotes: [nsRemote], dnsCache: cacheAt('2026-11-22 09:15:00'),
};

// ---- network scene -----------------------------------------------------------------------------------------------
const LAPTOP = '192.0.2.25', PHONE = '192.0.2.31', RESOLVER = '198.51.100.53', AUTH = '203.0.113.53';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [
  { name: '來源 IP', value: from }, { name: '目的 IP', value: to }, { name: '協定', value: '17（UDP）' }] });
const udp = (from: string, to: string): ProtocolHeader => ({ layer: 'transport', protocol: 'UDP', fields: [{ name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }] });
const QUESTION = 'www.example.net A';
const query = (id: string, rd: 0 | 1): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  { name: 'ID', value: id }, { name: 'QR', value: '0（查詢）' }, { name: 'RD', value: String(rd) }, { name: '問題', value: QUESTION }] });
const response = (id: string, aa: 0 | 1, rd: 0 | 1, ra: 0 | 1, answer: string): ProtocolHeader => ({ layer: 'application', protocol: 'DNS', fields: [
  { name: 'ID', value: id }, { name: 'QR', value: '1（回應）' }, { name: 'AA', value: String(aa) }, { name: 'RD', value: String(rd) }, { name: 'RA', value: String(ra) },
  { name: '問題', value: QUESTION }, { name: '答案', value: answer }] });
const fresh = 'www.example.net. 86400 IN CNAME example.net.；example.net. 3600 IN A 192.0.2.10';
const CACHE_HEAD = ['紀錄', '值', '剩餘 TTL（秒）'];
const resolverCache = (cname: string, a: string, changed?: number[]): NodeTable => ({
  node: 'resolver', name: '解析器快取', head: CACHE_HEAD, rows: [['www.example.net CNAME', 'example.net.', cname], ['example.net A', '192.0.2.10', a]], ...changed ? { changed } : {} });
const order = (result: string, changed: number[]): NodeTable => ({
  node: 'browser', name: '名稱查詢的順序', head: ['來源', '順序', '結果'], changed, rows: [['/etc/hosts', '1', '沒有這個名稱'], ['DNS（127.0.0.53）', '2', result]] });

/** Section 3: a browser on office-pc looks up www.example.net at 09:15; a phone asks the same resolver at 10:00. */
const lookup: NetworkScene = {
  id: 'srv02-lookup-path', title: '一次查詢的路徑：stub、遞迴解析器、權威伺服器與快取', model: 'tcp-ip',
  description: '09:15，office-pc（192.0.2.25）上的瀏覽器要開 www.example.net。它經由本機的 stub resolver（systemd-resolved，127.0.0.53）問公司網路設定的遞迴解析器（198.51.100.53），解析器再問 example.net 的權威伺服器 ns1（203.0.113.53）。09:50 網站搬家，管理員把 example.net 的 A 記錄從 192.0.2.10 改成 203.0.113.10 並 reload。10:00 一支手機問同一台解析器。逐步看每個回應的 AA 旗標、答案裡的 TTL，以及解析器快取的剩餘 TTL。',
  nodes: [
    { id: 'browser', label: '瀏覽器（office-pc）', kind: 'host', addresses: [`IP ${LAPTOP}`, '經由 glibc 的 getaddrinfo 查名稱'] },
    { id: 'stub', label: 'stub resolver（systemd-resolved）', kind: 'resolver', addresses: ['IP 127.0.0.53（office-pc 本機）', '/etc/resolv.conf 指向它'] },
    { id: 'resolver', label: '遞迴解析器', kind: 'resolver', addresses: [`IP ${RESOLVER}`, 'UDP 53', '替用戶端查到底並快取'] },
    { id: 'auth', label: 'ns1.example.net（權威伺服器，BIND）', kind: 'server', addresses: [`IP ${AUTH}`, 'UDP 53', '區域 example.net'] },
    { id: 'phone', label: '手機', kind: 'host', addresses: [`IP ${PHONE}`, 'DNS 伺服器設為 198.51.100.53'] },
  ],
  messages: [
    { id: 'browser-stub', from: 'browser', to: 'stub', label: 'DNS 查詢 www.example.net A（RD=1）', headers: [query('0x1f3a', 1), udp('41022', '53'), ipv4('127.0.0.1', '127.0.0.53')],
      note: '瀏覽器呼叫 getaddrinfo。glibc 先查 /etc/hosts，裡面沒有 www.example.net，才依 /etc/resolv.conf 把查詢送到 127.0.0.53，也就是同一台電腦上的 systemd-resolved。RD=1（Recursion Desired）表示「請替我查到最後的答案」。這一步沒有離開 office-pc。',
      tables: [order('查詢中', [0, 1])] },
    { id: 'stub-resolver', from: 'stub', to: 'resolver', label: '轉送給遞迴解析器（RD=1）', headers: [query('0x6c05', 1), udp('52814', '53'), ipv4(LAPTOP, RESOLVER)],
      note: 'stub resolver 自己不會一路查下去：它先看自己的快取（目前沒有這筆），沒有就把問題轉給設定好的上游 DNS 伺服器（通常由 DHCP 提供），也就是遞迴解析器。查詢的 ID 換成 stub 自己的，回應時以 ID 配對。' },
    { id: 'resolver-auth', from: 'resolver', to: 'auth', label: '問權威伺服器（RD=0）', headers: [query('0xa2e9', 0), udp('61530', '53'), ipv4(RESOLVER, AUTH)],
      note: '遞迴解析器要找出誰對 example.net 有權威。它的快取裡已經有先前查到的委派：根伺服器說 .net 由哪些 TLD 伺服器負責，.net 的 TLD 伺服器說 example.net 的 NS 是 ns1.example.net（附上它的位址）。快取裡沒有這些時，它會先問根伺服器、再問 .net 的伺服器，各得到一個「轉介」而不是答案（CN12）。這次直接問 ns1，RD=0：解析器自己做遞迴，不要求別人代勞。' },
    { id: 'auth-resolver', from: 'auth', to: 'resolver', label: '權威答案（AA=1）：CNAME 與 A', headers: [response('0xa2e9', 1, 0, 0, fresh), udp('53', '61530'), ipv4(AUTH, RESOLVER)],
      note: 'ns1 從自己載入的區域回答，所以 AA=1（Authoritative Answer）。www 是 example.net 的別名（CNAME），同一個區域裡的目標一起附上：example.net 的 A 是 192.0.2.10。每筆記錄帶著區域檔裡的 TTL：CNAME 86400 秒、A 3600 秒。解析器把兩筆分別存進快取，各自從自己的 TTL 開始倒數。',
      tables: [resolverCache('86400', '3600', [0, 1])] },
    { id: 'resolver-stub', from: 'resolver', to: 'stub', label: '回答 stub（AA=0、RA=1）', headers: [response('0x6c05', 0, 1, 1, fresh), udp('53', '52814'), ipv4(RESOLVER, LAPTOP)],
      note: '解析器把答案交給 stub：AA=0，因為解析器不是 example.net 的權威伺服器，只是轉述它查到的資料；RA=1 表示它提供遞迴服務。stub resolver 也會把這兩筆記錄快取起來，同樣依 TTL 倒數。' },
    { id: 'stub-browser', from: 'stub', to: 'browser', label: '位址 192.0.2.10', headers: [response('0x1f3a', 0, 1, 1, fresh), udp('53', '41022'), ipv4('127.0.0.53', '127.0.0.1')],
      note: 'getaddrinfo 得到 192.0.2.10，瀏覽器接著和這個位址建立 TCP 連線、送出 HTTP 請求（SRV03）。名稱解析到此結束；瀏覽器自己通常也會短暫記住結果。',
      tables: [order('192.0.2.10（TTL 3600）', [1])] },
    { id: 'phone-resolver', from: 'phone', to: 'resolver', label: '10:00 手機查詢 www.example.net A', headers: [query('0x33d1', 1), udp('50377', '53'), ipv4(PHONE, RESOLVER)],
      note: '09:50 管理員已經把 example.net 的 A 改成 203.0.113.10 並執行 rndc reload，ns1 現在回答的是新位址。但 DNS 沒有「通知所有快取」的機制：已經存了舊答案的解析器不會知道。10:00，手機向同一台遞迴解析器問同一個名稱。' },
    { id: 'resolver-phone', from: 'resolver', to: 'phone', label: '從快取回答（AA=0）：仍是 192.0.2.10', headers: [response('0x33d1', 0, 1, 1, 'www.example.net. 83700 IN CNAME example.net.；example.net. 900 IN A 192.0.2.10'), udp('53', '50377'), ipv4(RESOLVER, PHONE)],
      note: '兩筆記錄都還在快取裡（09:15 存入，已經過了 2700 秒），解析器直接回答，完全沒有問 ns1。答案裡的 TTL 是剩餘的秒數：A 還剩 3600 − 2700 = 900 秒，所以在 10:15 之前，用這台解析器的人都會拿到舊的 192.0.2.10。到期後的下一次查詢，解析器才會再問 ns1、拿到 203.0.113.10。如果搬家前一天先把 A 的 TTL 降到 300，舊答案最多只會再留 5 分鐘。',
      tables: [resolverCache('83700', '900')] },
  ],
};

export const SRV02: LessonContent = {
  lessonId: 'SRV02',
  motivation: '網站搬到新主機的那天早上，你把網域改指向新的 IP，自己用 dig 一查是新位址，同事的瀏覽器卻還連到舊主機；另一位同事加了一筆記錄，按下 reload，卻沒發現 named 拒絕了整個檔案。DNS 是每個網站的入口：網域名稱、區域檔裡的 A、AAAA、CNAME、MX、TXT 記錄，以及決定「改了之後多久才生效」的 TTL 與快取。這一課在自己的 BIND 伺服器上新增與修正記錄，學會用 dig 從權威伺服器與解析器兩邊驗證，並在搬家之前就把 TTL 安排好。',
  sections: [
    {
      id: 'srv02-s-zones', title: '網域名稱、區域與權威伺服器',
      blocks: [
        { type: 'p', text: '網域名稱是一棵樹，從右往左讀：最右邊是根（寫成一個點 `.`），接著是頂級網域（TLD，例如 `net`、`com`、`tw`），再來是你註冊的網域 `example.net`，往左的 `www.example.net`、`mail.example.net` 都是它的子名稱。完整寫出、以點結尾的名稱叫完整網域名稱（FQDN），例如 `www.example.net.`；平常省略的那個點就是根。' },
        { type: 'p', text: '「區域」（zone）是由同一組伺服器管理的一段名稱樹。你向註冊商（registrar）註冊 example.net 時，要填入負責它的名稱伺服器（NS），註冊商把它交給 .net 的管理者，.net 的 TLD 伺服器就會把「example.net 歸 ns1.example.net 管」這個委派告訴每個來問的人。被委派的伺服器稱為權威伺服器：它的資料就是正確答案。本課的 ns1 執行 BIND（程式名稱 `named`），在 `/etc/bind/named.conf.local` 宣告區域與它的區域檔：' },
        { type: 'table', head: ['區域檔的部分', '意思'], rows: [
          ['`$ORIGIN example.net.`', '原點：沒有結尾句點的名稱都接在它後面，`@` 代表原點本身'],
          ['`$TTL 3600`', '沒有寫 TTL 的記錄，快取最多保存 3600 秒'],
          ['`SOA`', '區域的起始記錄，每個區域恰好一筆：主要伺服器、管理者信箱（`hostmaster.example.net.` 代表 hostmaster@example.net）、serial（版本號）、refresh、retry、expire，以及最後的否定快取時間（查不到的答案可以快取多久）'],
          ['`NS`', '這個區域的權威伺服器；正式環境至少要兩台，放在不同的網路'],
          ['行首是空白', '沿用上一筆的名稱，所以 SOA 後面那幾行都屬於 `@`（example.net 本身）'],
          ['`;`', '註解，到行尾為止'],
        ] },
        { type: 'p', text: 'serial 的慣例是 `YYYYMMDDnn`（日期加當天第幾次修改），每次修改都要加大：次要伺服器依 refresh 的間隔比對主要伺服器的 serial，變大了才重新取得區域。主要伺服器自己則是看檔案有沒有改變，模擬環境只有一台伺服器，不模擬次要伺服器。改完區域檔先用 `named-checkzone 區域 檔案` 檢查：它像 named 一樣讀入檔案，印出 `loaded serial` 與 `OK`，有錯就指出檔名與行號。' },
        { type: 'example', id: 'srv02-zone' },
      ],
    },
    {
      id: 'srv02-s-records', title: '記錄類型：A／AAAA、CNAME、MX 與 TXT',
      blocks: [
        { type: 'p', text: '每一筆資源記錄（RR）有五個部分：名稱、TTL、類別（網際網路是 `IN`）、類型、資料。同名同類型的多筆記錄合成一組，一起回答、一起快取。網站管理最常用的類型：' },
        { type: 'table', head: ['類型', '資料', '例子', '用途與注意'], rows: [
          ['A', 'IPv4 位址', '`@ IN A 203.0.113.10`', '名稱對應的 IPv4 位址；同名可以有多筆'],
          ['AAAA', 'IPv6 位址', '`@ IN AAAA 2001:db8:10::10`', '名稱對應的 IPv6 位址；支援 IPv6 的用戶端通常優先使用。搬家時 A 與 AAAA 要一起改，只改一種，部分使用者會連到舊主機'],
          ['CNAME', '另一個名稱', '`www IN CNAME example.net.`', '別名：「去查那個名稱」。這個名稱不能再有任何其他記錄'],
          ['MX', '優先順序與郵件伺服器名稱', '`@ IN MX 10 mail.example.net.`', '寄給 @example.net 的信送去哪裡；數字小的優先，連不上才試下一台；目標要是有 A／AAAA 的名稱，不能是 CNAME'],
          ['TXT', '一或多段加引號的文字', '`@ IN TXT "v=spf1 mx -all"`', 'SPF（哪些主機可以替這個網域寄信）、DKIM、DMARC，以及服務商要你加一筆指定的文字來證明你控制這個網域；每段最多 255 位元組'],
          ['NS、SOA', '名稱伺服器、區域資訊', '`@ IN NS ns1.example.net.`', '上一節的區域管理記錄'],
        ] },
        { type: 'p', text: 'CNAME 的規則來自 RFC 1034：一個名稱有了 CNAME，就不能再有其他資料，因為解析器看到 CNAME 就改去查目標，同名的其他記錄永遠不會被用到。所以網域本身（區域的頂端，常叫 apex 或「根網域」）不能是 CNAME：那裡一定有 SOA 與 NS，通常還有 MX 和 TXT。代管商叫你「把網域 CNAME 到 site.hosting.example.org」時，`www` 這種子名稱可以照做，網域本身要改用代管商提供的 A／AAAA 位址；有些 DNS 服務商提供 ALIAS 或「CNAME flattening」，那是各家自己的功能，在伺服器端查好目標再以 A 記錄回答，不是標準的記錄類型。' },
        { type: 'p', text: 'MX 的數字是優先順序，不是權重：寄件的郵件伺服器先試 10 的 mail.example.net，連不上才試 20 的 mail2.example.net；數字相同的幾台隨機選一台，用來分散負載。SPF 的 `v=spf1 mx -all` 意思是「只有 MX 列出的主機可以替 example.net 寄信，其他來源一律不通過」，收件端用它判斷信件是否偽造。' },
        { type: 'example', id: 'srv02-records' },
        { type: 'callout', tone: 'warning', title: '常見錯誤：把網域本身設成 CNAME', text: '在區域檔寫 `@ IN CNAME site.hosting.example.org.`，`named-checkzone` 會回報 `example.net: CNAME and other data`，`rndc reload` 也會失敗，因為 @ 已經有 SOA、NS、MX 與 TXT。就算某些服務商的介面讓你存檔，信件（MX）與網域驗證（TXT）也會跟著壞掉。網域本身用 A／AAAA，CNAME 只用在沒有其他記錄的子名稱。' },
      ],
    },
    {
      id: 'srv02-s-path', title: '一次查詢的路徑：/etc/hosts、stub resolver、遞迴解析器與權威伺服器',
      blocks: [
        { type: 'p', text: '瀏覽器、curl、ssh 查名稱時都呼叫 glibc 的 getaddrinfo。它先看 `/etc/hosts`，找到就直接用、不問 DNS；找不到才依 `/etc/resolv.conf` 送出 DNS 查詢（順序由 `/etc/nsswitch.conf` 的 hosts 那一行決定，例如 `hosts: files dns`）。Ubuntu 的 resolv.conf 指向 `127.0.0.53`：本機的 systemd-resolved，它是一個 stub resolver，有自己的快取，但不會一路查下去，而是轉給上游的遞迴解析器（公司、ISP 或公共 DNS）。遞迴解析器才是真正跑完整趟的那一個：' },
        { type: 'list', ordered: true, items: [
          '問根伺服器（13 個名稱 a 到 m.root-servers.net，每個都以 anycast 部署在世界各地的許多機器上），得到「.net 請問這些 TLD 伺服器」的轉介。',
          '問 .net 的 TLD 伺服器，得到「example.net 請問 ns1.example.net」的轉介，附上 ns1 的位址（glue）。',
          '問權威伺服器 ns1，得到答案（AA=1），存進快取，再回答用戶端。',
        ] },
        { type: 'p', text: '前兩步的委派也會被快取，而且 TTL 通常很長（.net 給的 NS 記錄是兩天），所以多數查詢只需要第三步，甚至直接由快取回答。下面的情境從瀏覽器開始，委派已經在解析器的快取裡；注意 AA 只在權威伺服器的回應裡是 1，以及答案裡的 TTL 在快取回答時會變小。' },
        { type: 'example', id: 'srv02-lookup-path' },
        { type: 'p', text: '`/etc/hosts` 排在 DNS 前面，這讓它很適合在改 DNS 之前先測試新主機：在自己的電腦寫一行 `203.0.113.40 shop.example.net`，只有這台電腦會連到那裡。systemd-resolved 也讀 `/etc/hosts`，以 TTL 0 回答。但 `dig` 與 `host` 是 DNS 的診斷工具，它們直接送 DNS 查詢，從不讀 `/etc/hosts`：這正是「dig 查到的和瀏覽器連到的不一樣」最常見的原因之一。' },
        { type: 'example', id: 'srv02-hosts' },
        { type: 'callout', tone: 'tip', title: '測試完記得刪掉', text: '`/etc/hosts` 的那一行會一直有效，不像 DNS 的快取會過期。主機之後換了位址，這台電腦還會連到舊的地方，而且 `dig` 看起來一切正常，很難發現。測試結束就把它刪掉。' },
      ],
    },
    {
      id: 'srv02-s-dig', title: '用 dig 與 host 驗證',
      blocks: [
        { type: 'p', text: '`dig 名稱 [類型]` 送出一個 DNS 查詢，印出完整的回應。沒有指定伺服器時問 `/etc/resolv.conf` 的第一個 nameserver（本機的 127.0.0.53）；`dig @伺服器 名稱` 直接問那台伺服器，例如 `dig @ns1 www.example.net` 問權威伺服器、繞過所有快取。讀回應的順序：' },
        { type: 'table', head: ['部分', '看什麼'], rows: [
          ['`status:`', '`NOERROR` 成功（但可能沒有這個類型的記錄）；`NXDOMAIN` 名稱不存在；`SERVFAIL` 伺服器沒辦法回答（例如區域沒有載入）；`REFUSED` 伺服器拒絕（例如問權威伺服器它不負責的網域）'],
          ['`flags:`', '`qr` 這是回應；`aa` 權威答案；`rd` 查詢要求遞迴；`ra` 伺服器提供遞迴。直接問 ns1 會看到 `aa` 而沒有 `ra`'],
          ['`ANSWER SECTION`', '每行一筆記錄：名稱、TTL、類別、類型、資料。從快取來的答案，TTL 是剩下的秒數'],
          ['`AUTHORITY SECTION`', 'NXDOMAIN 或沒有資料時附上的 SOA，它的 TTL 就是這個否定答案可以快取多久'],
          ['`Query time`、`SERVER`', '花了多久、是哪一台伺服器回答的'],
        ] },
        { type: 'p', text: '常用的選項：`+short` 只印資料；`+noall +answer` 只印答案的記錄（保留 TTL）；`-t MX` 或直接寫類型指定要查的記錄。`host 名稱` 用一句話印出每筆記錄（不指定類型時查 A、AAAA 與 MX），`host -t TXT 名稱 伺服器` 指定類型與伺服器，適合快速確認。' },
        { type: 'example', id: 'srv02-cache' },
      ],
    },
    {
      id: 'srv02-s-ttl', title: 'TTL 與快取：為什麼改了還沒生效',
      blocks: [
        { type: 'p', text: 'TTL（Time To Live）是權威伺服器允許別人快取這筆記錄的秒數。解析器存入一筆記錄後就開始倒數，回答時給的是剩下的 TTL；倒數到 0 之前它都直接回答、不再問權威伺服器。剩餘 TTL ＝ TTL −（現在 − 存入的時間）。所以權威伺服器上的修改不會立刻被看到：每台解析器各自在快取到期之後才拿到新資料，最久要等一個完整的舊 TTL，再加上瀏覽器、作業系統等自己的快取。' },
        { type: 'p', text: '查不到的答案也會被快取（否定快取）：問 shop.example.net 得到 NXDOMAIN，解析器會記住「不存在」，時間是 SOA 的最後一個值與 SOA 本身 TTL 中較小的那個（本課是 300 秒）。所以新增記錄之前先查一次、之後又查不到，常常只是否定快取還沒過期。' },
        { type: 'table', head: ['搬家的步驟', '做什麼', '為什麼'], rows: [
          ['1. 提前降低 TTL', '至少在「舊 TTL」那麼久以前，把要改的記錄 TTL 降到 300 秒左右並 reload', '已經快取的人還拿著舊的 3600 秒，要等它們全部過期，新的短 TTL 才會到處生效'],
          ['2. 改位址', '把 A（與 AAAA）改成新主機、加大 serial、檢查、reload', '之後最多 5 分鐘，各解析器就會拿到新位址'],
          ['3. 驗證並保留舊主機', '`dig @ns1` 確認權威資料，`dig` 看本機解析器，舊主機先別關', '還有人帶著舊答案時，舊主機仍可能收到連線'],
          ['4. 調回 TTL', '穩定之後把 TTL 改回 3600 或更長', '長的 TTL 減少查詢量，權威伺服器短暫故障時影響也較小'],
        ] },
        { type: 'p', text: '`sudo resolvectl flush-caches` 只清除「這台電腦」的 stub resolver 快取。公司或 ISP 的遞迴解析器、別人的電腦，你都清不到，只能等 TTL 到期。下面的練習在 office-pc 上看見快取裡的舊位址還剩多久。' },
        { type: 'callout', tone: 'warning', title: '誤解：DNS 要「傳播」24 到 48 小時', text: 'DNS 沒有把修改推送到全世界的機制，也沒有固定的傳播時間。修改在 reload 之後立刻就在權威伺服器上生效，其他人看到的時間取決於他們的快取何時到期，也就是舊記錄的 TTL。「24 到 48 小時」通常來自很長的 TTL，例如更換名稱伺服器時，TLD 給 NS 記錄的 TTL 是兩天。事先降低 TTL，切換就能在幾分鐘內完成。' },
      ],
    },
    {
      id: 'srv02-s-change', title: '安全地修改區域：檢查、reload、驗證',
      blocks: [
        { type: 'p', text: 'named 只在啟動或 reload 時讀取區域檔，改了檔案、答案不會變。每次修改的步驟：' },
        { type: 'list', ordered: true, items: [
          '修改區域檔（模擬環境沒有編輯器，用 `echo … | sudo tee -a` 附加一行，或在家目錄整理好再 `sudo cp`），並加大 serial。',
          '`named-checkzone example.net /etc/bind/db.example.net`：看到 `OK` 才繼續。',
          '`sudo rndc reload example.net`：看到 `zone reload queued`；失敗時印出 `rndc: \'reload\' failed: …`，結束碼 1。',
          '`dig @127.0.0.1 名稱`（或從別台 `dig @ns1`）直接問 named，確認權威資料；再用 `dig 名稱` 看解析器的答案，記得它可能還是快取。',
        ] },
        { type: 'p', text: 'reload 失敗時，BIND 保留舊的區域繼續服務：網站不會因此斷線，但你的修改也完全沒有生效，而且只有 `rndc` 的那一行與 `journalctl -u named` 會告訴你。反過來，如果在區域檔有錯的情況下重新啟動 named（`systemctl restart`），這個區域就完全沒有載入，所有查詢都得到 SERVFAIL。這是先跑 `named-checkzone` 的理由。' },
        { type: 'p', text: '另一個經典錯誤是結尾的句點。區域檔裡沒有結尾句點的名稱都會接上原點：`blog IN CNAME example.net` 的目標變成 `example.net.example.net.`，語法完全正確，`named-checkzone` 也不會抱怨，只有實際查詢才會發現。寫完整的名稱一定要以 `.` 結尾，或者乾脆寫相對的名稱（`@`、`shop`）。' },
        { type: 'example', id: 'srv02-mistakes' },
        { type: 'callout', tone: 'warning', title: '只改檔案、沒有 reload', text: '最常見的「DNS 改了沒用」不是快取，而是根本沒有 reload，或 reload 失敗了沒看到。用 `dig @127.0.0.1` 直接問 named：它不經過任何快取，答案還是舊的，就表示 named 還沒有載入你的修改。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [lookup],
    exercises: [
      { id: 'srv02-ex-remaining-ttl', task: 'table', scene: 'srv02-lookup-path', message: 'resolver-phone', node: 'resolver', table: '解析器快取', row: 'example.net A', column: '剩餘 TTL（秒）', title: '手機拿到的 A 記錄還剩多久',
        statement: '在「一次查詢的路徑」情境的最後一步，遞迴解析器從快取回答手機。這時解析器快取裡 example.net A 的剩餘 TTL 是幾秒？（只填數字）',
        hints: ['記錄在 09:15 存入快取，TTL 是 3600 秒；手機在 10:00 查詢。', '剩餘 TTL ＝ TTL −（現在 − 存入的時間）。'],
        explanation: '09:15 到 10:00 經過 2700 秒，3600 − 2700 = 900，所以解析器回答 900 秒，並繼續給出舊的 192.0.2.10，直到 10:15 到期。09:50 在 ns1 上的修改與 reload 不會通知任何快取；CNAME 的 TTL 是 86400，所以它還剩 83700 秒，兩筆記錄各自倒數。',
        mistakes: [
          { answer: { cell: '3600' }, why: '以為每次回答都從完整的 TTL 重新開始：快取回答的是剩下的秒數，記錄在 09:15 存入後就一直倒數。' },
          { answer: { cell: '0' }, why: '以為 ns1 修改並 reload 之後，所有快取就會失效：DNS 沒有通知快取的機制，舊記錄要等 TTL 到期。' },
          { answer: { cell: '83700' }, why: '看成了 CNAME 那一列：www 的 CNAME 有自己的 TTL（86400）；題目問的是 example.net 的 A。' },
        ] },
      { id: 'srv02-ex-who-answers', task: 'field', scene: 'srv02-lookup-path', message: 'resolver-phone', layer: 'network', field: '來源 IP', title: '是誰回答了手機',
        statement: '同一個情境的最後一步，手機收到的回應是從哪個 IP 位址送出的？（填 IPv4 位址）',
        hints: ['手機把查詢送給了誰？', '這一次解析器有沒有去問 ns1？看看快取裡是否已經有答案。'],
        explanation: '手機的查詢送到遞迴解析器 198.51.100.53，兩筆記錄都還在它的快取裡，所以由它直接回答，回應的 AA 是 0。權威伺服器 ns1（203.0.113.53）這一次完全沒有被問到，這就是它的新位址還傳不到手機的原因。',
        mistakes: [
          { answer: { value: '203.0.113.53' }, why: '以為每次查詢都由權威伺服器回答：快取還有效時，遞迴解析器直接回答，不會去問 ns1。' },
          { answer: { value: '127.0.0.53' }, why: '127.0.0.53 是 office-pc 本機的 stub resolver，只服務那台電腦；手機問的是 198.51.100.53。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv02-q1', prompt: '區域檔的開頭是 `$ORIGIN example.net.`，有一行寫成 `blog IN CNAME example.net`（最後沒有句點）。查詢 blog.example.net 會得到什麼？',
      options: ['`example.net.`：BIND 會自動補上結尾的句點', '`example.net.example.net.`：沒有結尾句點的名稱會接上原點', '`named-checkzone` 回報語法錯誤，區域無法載入', '`blog.example.net.`：CNAME 指向自己'],
      answer: 1,
      explanation: '區域檔裡沒有結尾句點的名稱一律是相對名稱，會接上 $ORIGIN，所以目標變成 example.net.example.net.。BIND 不會猜你的意思自動補句點；這行的語法完全合法，named-checkzone 照樣印出 OK，只有實際查詢才發現；也不會變成指向自己。',
    },
    {
      id: 'srv02-q2', prompt: '為什麼不能在區域檔寫 `@ IN CNAME site.hosting.example.org.`？',
      options: ['CNAME 只能指向同一個區域內的名稱', '網域本身的 TTL 太長，不能使用 CNAME', '網域本身不能有任何記錄，記錄只能放在子名稱', '網域本身一定有 SOA 與 NS 記錄，而有 CNAME 的名稱不能再有其他記錄'],
      answer: 3,
      explanation: '一個名稱有了 CNAME 就不能有其他資料，而區域的頂端（@）一定有 SOA 與 NS，通常還有 MX 與 TXT，所以 BIND 回報 CNAME and other data。CNAME 可以指向任何網域的名稱；TTL 與能不能用 CNAME 無關；網域本身當然可以有記錄，A、MX、TXT 都常放在 @。',
    },
    {
      id: 'srv02-q3', prompt: 'example.net 有 `MX 10 mail.example.net.` 與 `MX 20 mail2.example.net.` 兩筆記錄。寄信給 user@example.net 的郵件伺服器會怎麼做？',
      options: ['先送到 mail.example.net（數字小的優先），連不上時才改送 mail2.example.net', '先送到 mail2.example.net，因為數字大的優先', '依 10 比 20 的比例分配到兩台', '同時送到兩台，以免信件遺失'],
      answer: 0,
      explanation: 'MX 的數字是優先順序，越小越優先，較大的是備援。數字大的並不優先；它也不是權重比例（數字相同的幾台才會隨機分散）；一封信只會成功送到其中一台，不會同時送兩台。',
    },
    {
      id: 'srv02-q4', prompt: 'example.net 的 A 記錄 TTL 是 3600 秒。某台解析器在 09:45 快取了舊位址，管理員在 10:00 改成新位址並成功 reload。這台解析器的使用者什麼時候才會拿到新位址？',
      options: ['立刻，因為 `rndc reload` 會通知所有解析器', '固定要 48 小時，DNS 需要時間傳播', '快取在 10:45 到期之後，下一次查詢時解析器才會再問權威伺服器', '要等次要伺服器依 serial 同步之後，解析器的快取才開始倒數'],
      answer: 2,
      explanation: '解析器在 09:45 存入、TTL 3600 秒，到 10:45 之前都直接用快取回答，到期後才重新查詢、拿到新位址。reload 只改變權威伺服器自己，不會通知任何快取；沒有固定的傳播時間，等多久由 TTL 決定；快取存入時就開始倒數，和 serial 或次要伺服器無關。',
    },
    {
      id: 'srv02-q5', prompt: '下週要把網站搬到新主機，A 記錄目前的 TTL 是 3600 秒。哪個做法能讓切換最快完成？',
      options: ['搬家當天先把 TTL 改成 300，接著馬上改位址', '至少提前 3600 秒（實務上常提前一天）把 TTL 降到 300 並 reload，搬家時再改位址，穩定後把 TTL 調回', '把 TTL 永久設成 0，讓記錄永遠不被快取', '搬家後請所有使用者清除瀏覽器的快取'],
      answer: 1,
      explanation: '已經快取的人手上是舊的 3600 秒，要等它們過期，新的 300 秒才會生效，所以必須至少提前一個舊 TTL 降低。當天才降低時，很多快取仍會保留舊位址最多 3600 秒；TTL 0 讓每次連線都要查詢，增加負擔又沒有必要；使用者清自己的快取，清不到公司與 ISP 解析器的快取。',
    },
    {
      id: 'srv02-q6', prompt: '`dig @ns1 www.example.net` 和 `dig www.example.net` 的差別是什麼？',
      options: ['前者直接問權威伺服器 ns1（flags 有 aa、TTL 是完整的值）；後者問 /etc/resolv.conf 的解析器，答案可能來自快取，TTL 是剩下的秒數', '兩者完全相同，@ns1 只是讓輸出比較短', '前者會先讀 /etc/hosts，後者不會', '後者只能印出 +short 的格式'],
      answer: 0,
      explanation: '@伺服器 指定要問哪一台：問權威伺服器得到它載入的資料，旗標有 aa；不指定時問本機的 127.0.0.53，可能從快取回答。兩者的結果在搬家期間正好不同，所以不是相同的；dig 不論哪一種都不讀 /etc/hosts；兩者都印完整的輸出，+short 是另外加的選項。',
    },
    {
      id: 'srv02-q7', prompt: '`dig @ns1 example.net +short` 已經是新位址，但 learner 的瀏覽器和 `curl` 還是連到舊主機。最可能的原因是什麼？',
      options: ['ns1 還沒有 reload', 'dig 會讀 /etc/hosts，但瀏覽器不會', 'DNS 快取的優先順序比 /etc/hosts 高', '/etc/hosts 裡還有一行舊位址：glibc 的查詢（瀏覽器、curl）先看 /etc/hosts，dig 從不讀它'],
      answer: 3,
      explanation: '瀏覽器與 curl 經由 getaddrinfo 先查 /etc/hosts，找到就不問 DNS；dig @ns1 直接問權威伺服器、不讀 /etc/hosts，所以它看起來正常（不加 @ 時，Ubuntu 的 dig 問的是 127.0.0.53 的 systemd-resolved，而 resolved 會回應 /etc/hosts 的名稱，那時就會看到同一個舊位址）。@ns1 已經回答新位址，表示 reload 成功了；dig 本身不讀 /etc/hosts，方向正好相反；順序是 /etc/hosts 在前、DNS（含快取）在後。',
    },
    {
      id: 'srv02-q8', prompt: '你在區域檔加了一筆記錄，`named-checkzone` 印出 `OK`，但 `dig @127.0.0.1 shop.example.net` 仍然是 NXDOMAIN。原因是什麼？',
      options: ['區域檔的權限不對，named 讀不到', 'dig 必須加 `+short` 才看得到新記錄', 'named 只在啟動或 reload 時讀區域檔；named-checkzone 只檢查檔案、不會讓 named 載入，要再執行 `sudo rndc reload example.net`', '本機解析器的否定快取還沒有過期'],
      answer: 2,
      explanation: 'named-checkzone 是獨立的檢查程式，named 仍在用上次載入的資料，reload 之後才會回答新記錄。權限的問題要等 reload 時才會出現，這裡根本還沒 reload；+short 只改變輸出格式；dig @127.0.0.1 直接問 named，不經過本機解析器的快取。',
    },
  ],
  terminal: {
    machines: [ns, draft, ws],
    examples: [
      {
        id: 'srv02-zone', title: '讀區域檔並檢查', machine: 'srv02-ns',
        description: '在 ns1 上看 named.conf.local 宣告的區域與它的區域檔，用 named-checkzone 檢查，再直接問 named：回應有 aa 旗標，www 的 CNAME 與 example.net 的 A 一起回答，各帶自己的 TTL。',
        steps: [
          { command: 'cat /etc/bind/named.conf.local', output: "zone \"example.net\" {\n\ttype master;\n\tfile \"/etc/bind/db.example.net\";\n};" },
          { command: 'cat /etc/bind/db.example.net', output: "$ORIGIN example.net.\n$TTL 3600\n@       IN  SOA ns1.example.net. hostmaster.example.net. (\n            2026112201 ; serial\n            3600       ; refresh\n            900        ; retry\n            1209600    ; expire\n            300 )      ; negative TTL\n        IN  NS   ns1.example.net.\n        IN  A    203.0.113.10\n        IN  AAAA 2001:db8:10::10\n        IN  MX   10 mail.example.net.\n        IN  MX   20 mail2.example.net.\n        IN  TXT  \"v=spf1 mx -all\"\nns1     IN  A    203.0.113.53\nmail    IN  A    203.0.113.25\nmail2   IN  A    198.51.100.25\nwww     86400 IN CNAME example.net." },
          { command: 'named-checkzone example.net /etc/bind/db.example.net', output: "zone example.net/IN: loaded serial 2026112201\nOK" },
          { command: 'dig @127.0.0.1 www.example.net', output: "\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> @127.0.0.1 www.example.net\n; (1 server found)\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 9698\n;; flags: qr aa rd; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1\n;; WARNING: recursion requested but not available\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 1232\n;; QUESTION SECTION:\n;www.example.net.\t\tIN\tA\n\n;; ANSWER SECTION:\nwww.example.net.\t86400\tIN\tCNAME\texample.net.\nexample.net.\t\t3600\tIN\tA\t203.0.113.10\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.1#53(127.0.0.1) (UDP)\n;; WHEN: Sun Nov 22 10:00:00 UTC 2026\n;; MSG SIZE  rcvd: 74\n" },
        ],
      },
      {
        id: 'srv02-records', title: '查詢各種記錄', machine: 'srv02-ns',
        description: '用 `dig +short` 與 `+noall +answer` 查 AAAA、MX、TXT、NS 與 SOA；`host` 用一句話印出每筆記錄，不指定類型時查 A、AAAA 與 MX。',
        steps: [
          { command: 'dig @127.0.0.1 example.net AAAA +short', output: "2001:db8:10::10" },
          { command: 'dig @127.0.0.1 example.net MX +short', output: "10 mail.example.net.\n20 mail2.example.net." },
          { command: 'dig @127.0.0.1 example.net TXT +noall +answer', output: "example.net.\t\t3600\tIN\tTXT\t\"v=spf1 mx -all\"" },
          { command: 'dig @127.0.0.1 example.net NS +short', output: "ns1.example.net." },
          { command: 'dig @127.0.0.1 example.net SOA +short', output: "ns1.example.net. hostmaster.example.net. 2026112201 3600 900 1209600 300" },
          { command: 'host example.net', output: "example.net has address 203.0.113.10\nexample.net has IPv6 address 2001:db8:10::10\nexample.net mail is handled by 10 mail.example.net.\nexample.net mail is handled by 20 mail2.example.net." },
          { command: 'host -t MX example.net', output: "example.net mail is handled by 10 mail.example.net.\nexample.net mail is handled by 20 mail2.example.net." },
        ],
      },
      {
        id: 'srv02-hosts', title: '/etc/hosts 排在 DNS 前面', machine: 'srv02-ws',
        description: '新主機 shop 還沒有 DNS 記錄。在 office-pc 的 /etc/hosts 加一行之後，getent（和瀏覽器、curl 一樣經由 glibc）與本機解析器（TTL 0）都用它；直接問 ns1 的 dig 仍然查不到。',
        steps: [
          { command: 'cat /etc/hosts', output: "127.0.0.1 localhost\n127.0.1.1 office-pc\n203.0.113.53 ns1\n\n# The following lines are desirable for IPv6 capable hosts\n::1 localhost ip6-localhost ip6-loopback\nff02::1 ip6-allnodes\nff02::2 ip6-allrouters" },
          { command: 'dig @ns1 shop.example.net +short', output: "" },
          { command: "echo '203.0.113.40 shop.example.net' | sudo tee -a /etc/hosts", output: "203.0.113.40 shop.example.net" },
          { command: 'getent hosts shop.example.net', output: "203.0.113.40    shop.example.net" },
          { command: 'dig shop.example.net +noall +answer', output: "shop.example.net.\t0\tIN\tA\t203.0.113.40" },
          { command: 'dig @ns1 shop.example.net +short', output: "" },
        ],
      },
      {
        id: 'srv02-cache', title: '搬家中：快取裡的舊位址與剩餘 TTL', machine: 'srv02-ws',
        description: 'office-pc 的解析器在 09:15 快取了 www 的 CNAME 與 example.net 的舊 A 記錄，網站 09:50 搬到 203.0.113.10。現在 10:00：本機解析器從快取回答（Query time 0、TTL 是剩下的秒數、沒有 aa），直接問 ns1 則是新位址與完整的 TTL；不存在的名稱得到 NXDOMAIN 與 SOA；清除本機快取後才拿到新位址。',
        steps: [
          { command: 'cat /etc/resolv.conf', output: "# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).\n# Do not edit.\n\nnameserver 127.0.0.53\noptions edns0 trust-ad\nsearch ." },
          { command: 'dig www.example.net', output: "\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> www.example.net\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 10006\n;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; QUESTION SECTION:\n;www.example.net.\t\tIN\tA\n\n;; ANSWER SECTION:\nwww.example.net.\t83700\tIN\tCNAME\texample.net.\nexample.net.\t\t900\tIN\tA\t192.0.2.10\n\n;; Query time: 0 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Sun Nov 22 10:00:00 UTC 2026\n;; MSG SIZE  rcvd: 74\n" },
          { command: 'dig @ns1 www.example.net +noall +answer', output: "www.example.net.\t86400\tIN\tCNAME\texample.net.\nexample.net.\t\t3600\tIN\tA\t203.0.113.10" },
          { command: 'host www.example.net ns1', output: "Using domain server:\nName: ns1\nAddress: 203.0.113.53#53\nAliases:\n\nwww.example.net is an alias for example.net.\nexample.net has address 203.0.113.10\nexample.net has IPv6 address 2001:db8:10::10\nexample.net mail is handled by 10 mail.example.net.\nexample.net mail is handled by 20 mail2.example.net." },
          { command: 'dig news.example.net', output: "\n; <<>> DiG 9.18.30-0ubuntu0.24.04.2-Ubuntu <<>> news.example.net\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN, id: 12226\n;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 1, ADDITIONAL: 1\n\n;; OPT PSEUDOSECTION:\n; EDNS: version: 0, flags:; udp: 65494\n;; QUESTION SECTION:\n;news.example.net.\t\tIN\tA\n\n;; AUTHORITY SECTION:\nexample.net.\t\t300\tIN\tSOA\tns1.example.net. hostmaster.example.net. 2026112201 3600 900 1209600 300\n\n;; Query time: 24 msec\n;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)\n;; WHEN: Sun Nov 22 10:00:00 UTC 2026\n;; MSG SIZE  rcvd: 96\n" },
          { command: 'sudo resolvectl flush-caches', output: "" },
          { command: 'dig www.example.net +noall +answer', output: "www.example.net.\t86400\tIN\tCNAME\texample.net.\nexample.net.\t\t3600\tIN\tA\t203.0.113.10" },
        ],
      },
      {
        id: 'srv02-mistakes', title: '少了句點、reload 失敗時保留舊資料', machine: 'srv02-ns',
        description: '`blog IN CNAME example.net` 少了結尾的句點，檢查與 reload 都通過，查詢才發現目標變成 example.net.example.net.。接著加入一筆位址打錯的記錄卻沒有先檢查：reload 失敗、結束碼 1，named 繼續用舊的區域回答（blog 仍是錯的那筆，api 不存在），原因在 journal 與 named-checkzone 的輸出裡。',
        steps: [
          { command: "echo 'blog    IN  CNAME example.net' | sudo tee -a /etc/bind/db.example.net", output: "blog    IN  CNAME example.net" },
          { command: 'named-checkzone example.net /etc/bind/db.example.net', output: "zone example.net/IN: loaded serial 2026112201\nOK" },
          { command: 'sudo rndc reload example.net', output: "zone reload queued" },
          { command: 'dig @127.0.0.1 blog.example.net +short', output: "example.net.example.net." },
          { command: "echo 'api     IN  A    203.0.113.300' | sudo tee -a /etc/bind/db.example.net", output: "api     IN  A    203.0.113.300" },
          { command: 'sudo rndc reload example.net', output: "rndc: 'reload' failed: bad dotted quad" },
          { command: 'echo $?', output: "1" },
          { command: 'dig @127.0.0.1 api.example.net +short', output: "" },
          { command: 'dig @127.0.0.1 blog.example.net +short', output: "example.net.example.net." },
          { command: 'sudo journalctl -u named -n 3 -o cat', output: "dns_rdata_fromtext: /etc/bind/db.example.net:20: near '203.0.113.300': bad dotted quad\nzone example.net/IN: loading from master file /etc/bind/db.example.net failed: bad dotted quad\nzone example.net/IN: not loaded due to errors." },
          { command: 'named-checkzone example.net /etc/bind/db.example.net', output: "dns_rdata_fromtext: /etc/bind/db.example.net:20: near '203.0.113.300': bad dotted quad\nzone example.net/IN: loading from master file /etc/bind/db.example.net failed: bad dotted quad\nzone example.net/IN: not loaded due to errors." },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv02-add-records', title: '為新的網路商店新增 A 與 CNAME 記錄', machine: 'srv02-ns',
        statement: '網路商店的新主機 203.0.113.40 已經上線。請在 example.net 的區域檔（/etc/bind/db.example.net）加上 shop.example.net 指向 203.0.113.40 的 A 記錄，並讓 store.example.net 成為 shop.example.net 的別名（CNAME）；先用 named-checkzone 檢查，再讓 named 載入，最後用 dig 直接問 named 驗證。檢查看的是本機解析器（127.0.0.53）的答案：如果你在記錄生效之前就透過解析器查過這兩個名稱，它會把「不存在」快取 300 秒，這時要先 `sudo resolvectl flush-caches`。',
        checks: [
          { kind: 'dns', name: 'shop.example.net', type: 'A', values: ['203.0.113.40'] },
          { kind: 'dns', name: 'store.example.net', type: 'CNAME', values: ['shop.example.net.'] },
          { kind: 'dns', name: 'store.example.net', type: 'A', values: ['203.0.113.40'] },
        ],
        solution: [
          "echo 'shop    IN  A    203.0.113.40' | sudo tee -a /etc/bind/db.example.net",
          "echo 'store   IN  CNAME shop.example.net.' | sudo tee -a /etc/bind/db.example.net",
          'named-checkzone example.net /etc/bind/db.example.net',
          'sudo rndc reload example.net',
          'dig @127.0.0.1 store.example.net +short',
        ],
        mistakes: [
          { commands: ["echo 'shop    IN  A    203.0.113.40' | sudo tee -a /etc/bind/db.example.net", "echo 'store   IN  CNAME shop.example.net' | sudo tee -a /etc/bind/db.example.net",
            'named-checkzone example.net /etc/bind/db.example.net', 'sudo rndc reload example.net'],
            why: 'CNAME 的目標少了結尾的句點：它接上原點變成 shop.example.net.example.net.，這個名稱不存在。named-checkzone 不會發現這種錯誤，要用 dig 實際查詢。' },
          { commands: ["echo 'shop    IN  A    203.0.113.40' | sudo tee -a /etc/bind/db.example.net", "echo 'store   IN  CNAME shop.example.net.' | sudo tee -a /etc/bind/db.example.net",
            'named-checkzone example.net /etc/bind/db.example.net'],
            why: '檢查通過就停下來：named-checkzone 只讀檔案，執行中的 named 仍然用舊的區域回答，要 `sudo rndc reload example.net` 才會載入。' },
          { commands: ["echo 'shop    IN  A    203.0.113.400' | sudo tee -a /etc/bind/db.example.net", "echo 'store   IN  CNAME shop.example.net.' | sudo tee -a /etc/bind/db.example.net",
            'sudo rndc reload example.net'],
            why: '沒有先檢查就 reload：203.0.113.400 不是合法的 IPv4 位址，reload 失敗，named 保留舊的區域，兩筆新記錄都沒有生效；先跑 named-checkzone 就會看到 bad dotted quad 與行號。' },
          { commands: ["echo 'shop    IN  A    203.0.113.40' | sudo tee -a /etc/bind/db.example.net", "echo 'store   IN  CNAME shop.example.net.' | sudo tee -a /etc/bind/db.example.net",
            "echo 'store   IN  A    203.0.113.40' | sudo tee -a /etc/bind/db.example.net", 'sudo rndc reload example.net'],
            why: '替 store 同時寫了 CNAME 與 A：有 CNAME 的名稱不能再有其他記錄（CNAME and other data），reload 失敗，整個修改都沒有生效。' },
        ],
        hints: [
          '`echo \'shop    IN  A    203.0.113.40\' | sudo tee -a /etc/bind/db.example.net` 在區域檔最後附加一行。',
          'CNAME 的目標寫完整名稱時要以句點結尾：`shop.example.net.`（或寫相對的 `shop`）。',
          '`named-checkzone example.net /etc/bind/db.example.net` 印出 OK 之後，`sudo rndc reload example.net`，再 `dig @127.0.0.1 store.example.net +short`。',
        ],
        explanation: '兩行附加在區域檔最後，名稱 shop、store 沒有結尾句點，所以接上原點成為 shop.example.net. 與 store.example.net.；CNAME 的目標寫成 shop.example.net.（有句點），才不會再被接上原點。named-checkzone 確認檔案能載入，rndc reload 讓 named 讀入新的區域，dig @127.0.0.1 store.example.net +short 印出 shop.example.net. 與 203.0.113.40：權威伺服器跟著 CNAME 找到同一個區域裡的 A 一起回答。真實環境裡還要把 SOA 的 serial 加大，讓次要伺服器知道區域變了。',
      },
      {
        id: 'srv02-fix-apex', title: '修正被拒絕的區域檔', machine: 'srv02-draft',
        statement: '網站要搬到代管商。同事把修改好的區域檔放在 ~/db.example.net.new（serial 已加大、新增了 news.example.net），但裝上去 reload 會被拒絕，named 會繼續用舊的區域。代管商的說明是：「子網域可以 CNAME 到 site.hosting.example.org；網域本身（apex）請設 A 記錄 198.51.100.80。」請找出草稿的錯誤並修正，讓 named 載入它：example.net 與 www.example.net 都要解析到 198.51.100.80，news.example.net 是 203.0.113.60，原本的兩筆 MX 要保留。模擬環境沒有編輯器：可以用 `grep -v` 去掉某一行、`echo … >>` 附加一行，在家目錄整理好再複製到 /etc/bind/db.example.net。檢查看的是本機解析器的答案；如果你在修正之前透過解析器查過，記得 `sudo resolvectl flush-caches`。',
        checks: [
          { kind: 'dns', name: 'example.net', type: 'A', values: ['198.51.100.80'] },
          { kind: 'dns', name: 'www.example.net', type: 'A', values: ['198.51.100.80'] },
          { kind: 'dns', name: 'news.example.net', type: 'A', values: ['203.0.113.60'] },
          { kind: 'dns', name: 'example.net', type: 'MX', values: ['10 mail.example.net.', '20 mail2.example.net.'] },
        ],
        solution: [
          "grep -v 'CNAME site' db.example.net.new > db.fixed",
          "echo '@       IN  A    198.51.100.80' >> db.fixed",
          'named-checkzone example.net db.fixed',
          'sudo cp db.fixed /etc/bind/db.example.net',
          'sudo rndc reload example.net',
          'dig @127.0.0.1 example.net +short',
        ],
        mistakes: [
          { commands: ['sudo cp db.example.net.new /etc/bind/db.example.net', 'sudo rndc reload example.net'],
            why: '直接裝上草稿：@ 有 SOA、NS、MX 與 TXT，又寫了 CNAME（CNAME and other data），reload 失敗，named 繼續用舊的區域，example.net 仍是 203.0.113.10，news 也不存在。' },
          { commands: ["grep -v 'CNAME site' db.example.net.new > db.fixed", "echo '@       IN  A    198.51.100.80' >> db.fixed", 'named-checkzone example.net db.fixed', 'sudo cp db.fixed /etc/bind/db.example.net'],
            why: '檔案已經修好也換上去了，卻沒有 reload：named 仍然用啟動時載入的舊區域回答。' },
          { commands: ["grep -v 'CNAME site' db.example.net.new > db.fixed", 'named-checkzone example.net db.fixed', 'sudo cp db.fixed /etc/bind/db.example.net', 'sudo rndc reload example.net'],
            why: '只刪掉了錯誤的 CNAME，沒有補上網域本身的 A 記錄：區域載入了，但 example.net 與 www.example.net 都查不到位址，網站連不上。' },
        ],
        hints: [
          '先 `named-checkzone example.net db.example.net.new`：錯誤訊息說明了是哪個名稱、什麼問題。',
          '網域本身已經有 SOA、NS、MX 與 TXT，不能再有 CNAME：`grep -v \'CNAME site\' db.example.net.new > db.fixed` 去掉那一行，再 `echo \'@ IN A 198.51.100.80\' >> db.fixed`。',
          '`named-checkzone example.net db.fixed` 印出 OK 後，`sudo cp db.fixed /etc/bind/db.example.net`，`sudo rndc reload example.net`，再 `dig @127.0.0.1 example.net +short`。',
        ],
        explanation: '草稿把網域本身寫成 CNAME，而 @ 同時有 SOA、NS、MX、TXT，BIND 回報 CNAME and other data 並拒絕整個檔案；reload 失敗時舊的區域繼續服務，所以網站還在舊主機，news 也不存在。修正的方法是照代管商的說明，在網域本身改用 A 記錄 198.51.100.80；www 是指向 example.net. 的 CNAME，自然也得到 198.51.100.80（也可以讓 www 直接 CNAME 到 site.hosting.example.org.）。檢查通過、複製、reload 之後，named 回答新的位址，MX 與 TXT 都沒有受影響。',
      },
      {
        id: 'srv02-cache-ttl', title: '舊位址還會留多久', machine: 'srv02-ws',
        statement: '網站在 09:50 從 192.0.2.10 搬到 203.0.113.10，ns1 已經改好，但 office-pc 上的瀏覽器還連到舊主機。請用一個 dig 指令，只印出本機解析器回答 www.example.net 時答案區段的記錄（每筆記錄一行，含剩下的 TTL），讓同事看出舊位址還會被使用多久。不要清除快取。檢查時，你的指令也會在另一種快取狀態（記錄在別的時間進入快取）重新執行一次。',
        checks: [{ kind: 'output' }],
        solution: ['dig www.example.net +noall +answer'],
        variants: [{ label: '記錄在 09:32:10 進入快取', files: [], dnsCache: cacheAt('2026-11-22 09:32:10') }],
        mistakes: [
          { commands: ['dig @ns1 www.example.net +noall +answer'], why: '問的是權威伺服器 ns1：它回答新位址與完整的 TTL，看不到 office-pc 的快取裡還留著什麼。' },
          { commands: ['dig www.example.net +short'], why: '+short 只印資料，沒有 TTL，看不出舊位址還會留多久。' },
          { commands: ['sudo resolvectl flush-caches', 'dig www.example.net +noall +answer'], why: '先清除了快取：之後的答案是剛從 ns1 取得的新資料，題目要看的是清除之前快取裡的舊記錄。' },
        ],
        hints: [
          '不加 @伺服器 時，dig 問的是 /etc/resolv.conf 的 127.0.0.53，也就是本機的解析器。',
          '`+noall +answer` 只印答案區段的記錄，保留 TTL 欄位。',
        ],
        explanation: 'dig www.example.net +noall +answer 問本機解析器，兩筆記錄都從快取回答：CNAME 剩 83700 秒，舊的 A 記錄 192.0.2.10 剩 900 秒，也就是 10:15 之後這台電腦才會拿到新位址（另一種快取狀態下是 84730 與 1930 秒）。剩餘 TTL ＝ TTL −（現在 − 存入的時間），所以直接打出數字無法通過。急著切換時，可以在這台電腦上 sudo resolvectl flush-caches，但其他電腦與解析器只能等 TTL 到期。',
      },
    ],
  },
};
