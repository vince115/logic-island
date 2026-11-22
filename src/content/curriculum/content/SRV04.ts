import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * SRV04 TLS Certificates in Practice (SRV-2, network-sequence). A terminal lesson on the nginx profile (engine stages
 * E13 tls and E14 nginx) beside two network-protocol scenes. The terminal part: what a certificate holds (subject, SAN,
 * issuer, validity) read with openssl x509; the chain leaf → intermediate (R11) → root (ISRG Root X1) and the trust
 * store; certbot certonly --webroot (ACME HTTP-01 through public DNS and port 80) and the files under
 * /etc/letsencrypt/live; Let's Encrypt's problems when DNS points elsewhere, when the webroot is wrong and when port 80
 * already redirects to an https that does not exist yet; installing in nginx with fullchain.pem, and a server that
 * sends only the leaf (curl's 60, s_client's 21 "unable to verify the first certificate"); certbot certificates, renew,
 * --dry-run, certbot.timer and a deploy hook that reloads nginx; HSTS; expiry monitoring with -checkend. The network
 * part: a TLS 1.3 handshake at a high level (ClientHello with SNI, ServerHello, the encrypted certificate chain,
 * verification against the trust store, then encrypted HTTP), and the same connection to a server that sends only its
 * leaf certificate. Names are reserved for documentation (example.org); addresses are RFC 5737; host names, users and
 * files are made up. Let's Encrypt R11 and ISRG Root X1 are the engine's built-in CAs (real names and dates, simulated
 * keys). Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const HOME = '/home/learner';
const SUDO = { groups: [{ name: 'sudo', members: ['learner'] }] };
const LIVE = '/etc/letsencrypt/live/shop.example.org';

/** example.org on the internet: the company's main site is hosted elsewhere; the shop runs on web-01. */
const ZONE = `$ORIGIN example.org.
$TTL 300
@        IN  SOA ns1.example.org. hostmaster.example.org. 2026112201 3600 900 1209600 300
         IN  NS  ns1.example.org.
         IN  A   198.51.100.80
ns1      IN  A   198.51.100.53
shop     IN  A   203.0.113.20
www.shop IN  CNAME shop.example.org.
`;
const internet = [{ zone: 'example.org', text: ZONE }];

/** web-01 before HTTPS: one site on port 80. */
const HTTP_SITE = `server {
    listen 80;
    server_name shop.example.org www.shop.example.org;
    root /var/www/shop;
    index index.html;
}
`;
/** web-01 with HTTPS: port 80 redirects; the certificate files come from a snippet. */
const tlsSite = (extra = '') => `server {
    listen 80;
    server_name shop.example.org www.shop.example.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name shop.example.org www.shop.example.org;
    root /var/www/shop;
    index index.html;
    include snippets/shop-tls.conf;${extra}
}
`;
const HSTS = '\n    add_header Strict-Transport-Security "max-age=31536000" always;';
const snippet = (certificate: string) => `ssl_certificate ${LIVE}/${certificate};\nssl_certificate_key ${LIVE}/privkey.pem;\n`;

const home = [dir('/home'), dir(HOME, 'learner', 0o750)];
const shopFiles = (site: string, tls?: string): TerminalFile[] => [
  ...home, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/shop', site),
  dir('/etc/nginx/sites-enabled'), link('/etc/nginx/sites-enabled/shop', '/etc/nginx/sites-available/shop'),
  ...tls ? [dir('/etc/nginx/snippets'), file('/etc/nginx/snippets/shop-tls.conf', tls)] : [],
  dir('/var'), dir('/var/www'), dir('/var/www/shop'), file('/var/www/shop/index.html', '<h1>Island Shop</h1>\n'),
];
const web01 = { user: 'learner', cwd: HOME, host: 'web-01', profile: 'nginx' as const, nginx: true as const, timezone: 'UTC', accounts: SUDO,
  interfaces: [{ name: 'eth0', address: '203.0.113.20/24' }], internet };
/** The certificate certbot issued on 2026-11-10 (expires 2027-02-08). */
const issued = (hook?: string) => [{ domains: ['shop.example.org', 'www.shop.example.org'], webroot: '/var/www/shop', issued: '2026-11-10 08:00:00', ...hook ? { hook } : {} }];

/** web-01 before HTTPS: certbot installed (account registered), no certificate yet. */
const web: TerminalMachine = {
  ...web01, id: 'srv04-web', title: 'web-01（網路商店，還只有 http）', files: shopFiles(HTTP_SITE), certbot: { account: true },
};
/** web-01 after a colleague installed the certificate with cert.pem: the server sends only the leaf. */
const leaf: TerminalMachine = {
  ...web01, id: 'srv04-leaf', title: 'web-01（HTTPS 已上線，但只送出葉憑證）', files: shopFiles(tlsSite(), snippet('cert.pem')),
  certbot: { account: true, certificates: issued() },
};
/** 2027-01-20: 18 days left; the timer is on and a deploy hook reloads nginx. */
const hooked: TerminalMachine = {
  ...web01, id: 'srv04-hooked', title: 'web-01（2027-01-20，設好 deploy hook）', now: '2027-01-20 10:00:00', files: shopFiles(tlsSite(HSTS), snippet('fullchain.pem')),
  certbot: { account: true, certificates: issued('systemctl reload nginx') },
};
/** 2027-01-20: 18 days left; someone disabled certbot.timer and there is no hook. */
const noTimer: TerminalMachine = {
  ...web01, id: 'srv04-notimer', title: 'web-01（2027-01-20，certbot.timer 被停用）', now: '2027-01-20 10:00:00', files: shopFiles(tlsSite(HSTS), snippet('fullchain.pem')),
  certbot: { account: true, timer: false, certificates: issued() },
};
/** An intranet server whose certificates are not managed by certbot (an internal CA and one bought elsewhere). */
const intra: TerminalMachine = {
  id: 'srv04-intra', title: 'intra-01（內部服務的憑證，手動更換）', user: 'learner', cwd: HOME, host: 'intra-01', profile: 'nginx', timezone: 'UTC', accounts: SUDO,
  files: [...home, dir('/etc'), dir('/etc/ssl'), dir('/etc/ssl/sites')],
  certificates: [
    { id: 'srv04-corp-ca', cn: 'Example Corp Internal CA', org: 'Example Corp', ca: true, notBefore: '2025-01-01 00:00:00', path: '/etc/ssl/sites/corp-ca.pem' },
    { id: 'srv04-wiki', cn: 'wiki.corp.example.org', issuer: 'srv04-corp-ca', notBefore: '2025-12-06 00:00:00', days: 365, path: '/etc/ssl/sites/wiki.pem', key: '/etc/ssl/private/wiki.key' },
    { id: 'srv04-git', cn: 'git.corp.example.org', issuer: 'srv04-corp-ca', notBefore: '2026-01-10 00:00:00', days: 365, path: '/etc/ssl/sites/git.pem', key: '/etc/ssl/private/git.key' },
    { id: 'srv04-pay', cn: 'pay.example.org', issuer: 'lets-encrypt-r11', notBefore: '2026-09-21 12:00:00', path: '/etc/ssl/sites/pay.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/private/pay.key' },
    { id: 'srv04-vpn', cn: 'vpn.corp.example.org', issuer: 'srv04-corp-ca', notBefore: '2026-06-01 00:00:00', days: 365, path: '/etc/ssl/sites/vpn.pem', key: '/etc/ssl/private/vpn.key' },
  ],
};

// ---- network scenes ----------------------------------------------------------------------------------------------
const CLIENT = '192.0.2.30', SERVER = '203.0.113.20', PORT = '51344';
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const up = (tls: ProtocolHeader): ProtocolHeader[] => [tls, tcp(PORT, '443', 'PSH, ACK'), ipv4(CLIENT, SERVER)];
const down = (tls: ProtocolHeader): ProtocolHeader[] => [tls, tcp('443', PORT, 'PSH, ACK'), ipv4(SERVER, CLIENT)];
/** A plaintext handshake record (ClientHello, ServerHello). */
const plain = (message: string, fields: { name: string; value: string }[]): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [
  { name: '紀錄類型', value: '22（handshake，明文）' }, { name: '握手訊息', value: message }, ...fields] });
/** An encrypted record: from ServerHello on, everything travels as application_data on the outside. */
const sealed = (inside: string, fields: { name: string; value: string }[] = []): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [
  { name: '紀錄類型', value: '23（application_data，加密）' }, { name: '加密的內容', value: inside }, ...fields] });
const CHAIN_HEAD = ['層級', '憑證', '從哪裡來', '檢查'];
const ROOT_ROW = ['2', 'ISRG Root X1（根憑證，自簽）', '用戶端的信任庫 /etc/ssl/certs/ca-certificates.crt', '信任錨：簽了 R11'];

/** Section 2: curl on ops-pc opens https://www.shop.example.org/ on web-01, which sends fullchain.pem. */
const handshake: NetworkScene = {
  id: 'srv04-handshake', title: 'HTTPS 連線的交握：SNI、憑證鏈與信任庫', model: 'tcp-ip',
  description: '辦公室的 ops-pc（192.0.2.30）用 curl 開 https://www.shop.example.org/。名稱已經解析成 web-01 的 203.0.113.20（SRV02），web-01 上的 nginx 在 443 埠用 fullchain.pem 提供 HTTPS。逐步看用戶端在 ClientHello 裡說出的名稱（SNI）、nginx 依它選出的 server 區塊與憑證、伺服器送來的憑證鏈，以及 curl 怎麼把這條鏈接到自己信任庫裡的根憑證；交握完成之後，HTTP 請求才在加密的通道裡送出。這裡只看 TLS 1.3 的大致順序，金鑰交換的細節在 CN13。',
  nodes: [
    { id: 'client', label: 'curl（ops-pc）', kind: 'host', addresses: [`IP ${CLIENT}`, '信任庫：/etc/ssl/certs/ca-certificates.crt'] },
    { id: 'server', label: 'web-01（nginx）', kind: 'server', addresses: [`IP ${SERVER}`, 'TCP 443', 'server_name shop.example.org www.shop.example.org'] },
  ],
  messages: [
    { id: 'tcp', from: 'client', to: 'server', label: 'TCP 三向交握（合成一步）', headers: [tcp(PORT, '443', 'SYN → SYN, ACK → ACK'), ipv4(CLIENT, SERVER)],
      note: 'TLS 跑在 TCP 之上，所以先建立 TCP 連線（SYN、SYN-ACK、ACK，這裡合成一步）。443 是 HTTPS 慣用的埠；到這裡為止沒有任何加密，也還沒有交換任何名稱。' },
    { id: 'client-hello', from: 'client', to: 'server', label: 'ClientHello（SNI：www.shop.example.org）',
      headers: up(plain('ClientHello', [{ name: 'server_name（SNI）', value: 'www.shop.example.org' }, { name: 'supported_versions', value: 'TLS 1.3、TLS 1.2' },
        { name: 'ALPN', value: 'h2、http/1.1' }, { name: 'key_share', value: 'x25519 的臨時公鑰' }])),
      note: '用戶端先開口：它支援的 TLS 版本與演算法、一把臨時公鑰（用來算出共同的金鑰），以及 server_name 擴充，也就是 SNI（Server Name Indication）：「我要連的是 www.shop.example.org」。同一個 IP 上可能有好幾個 HTTPS 網站，伺服器要靠 SNI 才知道該拿哪一張憑證出來。SNI 是明文，路上的人看得到你要連哪個網站。',
      tables: [{ node: 'server', name: 'nginx 的選擇', head: ['項目', '值'], changed: [0, 1, 2], rows: [
        ['收到的 SNI', 'www.shop.example.org'], ['符合的 server 區塊', 'server_name shop.example.org www.shop.example.org（443 ssl）'], ['要送出的憑證檔', '/etc/letsencrypt/live/shop.example.org/fullchain.pem']] }] },
    { id: 'server-hello', from: 'server', to: 'client', label: 'ServerHello（TLS 1.3）',
      headers: down(plain('ServerHello', [{ name: 'supported_versions', value: 'TLS 1.3' }, { name: 'cipher_suite', value: 'TLS_AES_256_GCM_SHA384' }, { name: 'key_share', value: 'x25519 的臨時公鑰' }])),
      note: '伺服器選定 TLS 1.3 與加密演算法，送回自己的臨時公鑰。兩邊各用自己的臨時私鑰與對方的公鑰算出同一把共享秘密，再導出加密金鑰；路上的人看得到兩把公鑰，卻算不出秘密。從下一個訊息開始，所有交握訊息都加密。' },
    { id: 'server-flight', from: 'server', to: 'client', label: '加密的 Certificate、CertificateVerify、Finished',
      headers: down(sealed('EncryptedExtensions、Certificate、CertificateVerify、Finished', [{ name: '憑證數量', value: '2' },
        { name: '憑證鏈', value: '0：CN=shop.example.org（簽發者 R11）；1：CN=R11（簽發者 ISRG Root X1）' }])),
      payload: '密文：TLS 1.3 的憑證也在加密的紀錄裡',
      note: 'nginx 送出 fullchain.pem 裡的兩張憑證：自己的葉憑證，加上簽發它的中繼憑證 R11。根憑證不必送：用戶端只信任自己信任庫裡的根憑證，伺服器送來的根沒有意義。CertificateVerify 是伺服器用 privkey.pem 對整段交握做的簽章，證明它真的擁有憑證裡公鑰對應的私鑰；Finished 確認雙方看到的交握內容一致。curl 收到後開始驗證：從葉憑證往上找簽發者，接到信任庫裡的 ISRG Root X1，檢查每一張都在有效期間內，再確認葉憑證的 SAN 含有 www.shop.example.org。',
      tables: [{ node: 'client', name: 'curl 建立的憑證鏈', head: CHAIN_HEAD, changed: [0, 1, 2], rows: [
        ['0', 'shop.example.org（葉憑證）', '伺服器送來', 'SAN 含 www.shop.example.org；在有效期間內'],
        ['1', 'R11（中繼憑證）', '伺服器送來', '簽了葉憑證；在有效期間內'], ROOT_ROW] }] },
    { id: 'client-finished', from: 'client', to: 'server', label: '驗證通過，送出 Finished', headers: up(sealed('Finished')),
      note: '鏈的每一環都對上了、名稱相符、沒有過期，curl 印出 SSL certificate verify ok 並送出自己的 Finished。交握完成：之後的資料都用剛導出的金鑰加密，路上只看得到紀錄類型 23 與長度。' },
    { id: 'http-request', from: 'client', to: 'server', label: 'GET / （加密）', headers: up(sealed('HTTP 請求')),
      payload: 'GET / HTTP/1.1\nHost: www.shop.example.org（全部在 TLS 紀錄裡加密）',
      note: 'HTTP 請求和 SRV03 完全一樣，只是整段包在 TLS 紀錄裡：路徑、標頭、Cookie 都看不到。TLS 交握選憑證用的是 SNI，nginx 選 server 區塊時再看 Host 標頭；兩者通常是同一個名稱。' },
    { id: 'http-response', from: 'server', to: 'client', label: '200 OK（加密）', headers: down(sealed('HTTP 回應')),
      payload: 'HTTP/1.1 200 OK\nContent-Type: text/html（加密）',
      note: '回應同樣加密送回。同一條 TCP 與 TLS 連線可以繼續送下一個請求（keep-alive），不必重新交握。' },
  ],
};

/** Section 4: the same request to a server whose ssl_certificate is cert.pem (only the leaf). */
const leafOnly: NetworkScene = {
  id: 'srv04-leaf-only', title: '設定錯誤的伺服器：只送出葉憑證', model: 'tcp-ip',
  description: '同一台 web-01，但同事把 ssl_certificate 指到 cert.pem（只有葉憑證），而不是 fullchain.pem。ops-pc 的 curl 連 https://shop.example.org/：TCP 與 ClientHello、ServerHello 都和上一個情境相同（省略 TCP），差別出在伺服器送來的憑證數量，以及用戶端怎麼建鏈。',
  nodes: [
    { id: 'client', label: 'curl（ops-pc）', kind: 'host', addresses: [`IP ${CLIENT}`, '信任庫：/etc/ssl/certs/ca-certificates.crt'] },
    { id: 'server', label: 'web-01（nginx，ssl_certificate 是 cert.pem）', kind: 'server', addresses: [`IP ${SERVER}`, 'TCP 443'] },
  ],
  messages: [
    { id: 'client-hello', from: 'client', to: 'server', label: 'ClientHello（SNI：shop.example.org）',
      headers: up(plain('ClientHello', [{ name: 'server_name（SNI）', value: 'shop.example.org' }, { name: 'supported_versions', value: 'TLS 1.3、TLS 1.2' }])),
      note: '和上一個情境相同：用戶端說出要連的名稱，nginx 依 SNI 選出 shop.example.org 的 server 區塊。' },
    { id: 'server-hello', from: 'server', to: 'client', label: 'ServerHello（TLS 1.3）',
      headers: down(plain('ServerHello', [{ name: 'supported_versions', value: 'TLS 1.3' }, { name: 'cipher_suite', value: 'TLS_AES_256_GCM_SHA384' }])),
      note: '協商成功，之後的交握訊息加密。到這裡為止一切正常，問題要等憑證送出才出現。' },
    { id: 'server-flight', from: 'server', to: 'client', label: '加密的 Certificate（只有一張）',
      headers: down(sealed('EncryptedExtensions、Certificate、CertificateVerify、Finished', [{ name: '憑證數量', value: '1' },
        { name: '憑證鏈', value: '0：CN=shop.example.org（簽發者 R11）' }])),
      payload: '密文：只有葉憑證',
      note: 'cert.pem 裡只有葉憑證，nginx 就只送這一張。葉憑證本身完全正確：名稱對、沒有過期、確實由 R11 簽發。但 curl 要找出「誰是 R11」：伺服器沒有送，信任庫裡也只有根憑證，沒有中繼憑證。鏈斷在第一層，OpenSSL 回報錯誤 20（unable to get local issuer certificate），s_client 最後的判定是 21（unable to verify the first certificate）。',
      tables: [{ node: 'client', name: 'curl 建立的憑證鏈', head: CHAIN_HEAD, changed: [0, 1], rows: [
        ['0', 'shop.example.org（葉憑證）', '伺服器送來', '簽發者是 R11，要找到 R11 才能驗證'],
        ['1', 'R11（中繼憑證）', '沒有收到；信任庫裡也沒有', '找不到簽發者：錯誤 20'], ROOT_ROW] }] },
    { id: 'alert', from: 'client', to: 'server', label: 'TLS 警示 unknown_ca，中止連線',
      headers: up(sealed('alert', [{ name: '警示', value: 'unknown_ca（48），fatal' }])),
      note: 'curl 送出 unknown_ca 警示並關閉連線（curl -v 印出 TLS alert, unknown CA (560)，560 是 OpenSSL 對 fatal 等級加上代碼 48 的編號），結束碼 60：SSL certificate problem: unable to get local issuer certificate。HTTP 請求根本沒有送出。有些瀏覽器記得以前看過的中繼憑證，或依憑證裡的 AIA 網址自己下載，所以打得開；curl、手機 App、其他伺服器的 API 用戶端通常不會，這就是「我的瀏覽器明明可以」的由來。' },
  ],
};

export const SRV04: LessonContent = {
  lessonId: 'SRV04',
  motivation: '網路商店要上線 HTTPS：你申請了憑證、改了 nginx，自己的瀏覽器看到鎖頭，合作廠商的程式卻回報 unable to get local issuer certificate；三個月後的星期一早上，網站突然出現「您的連線不是私人連線」，因為憑證過期了，而自動更新其實一直沒有生效。憑證本身不難，難的是整條路徑：CA 怎麼確認網域是你的、伺服器要送出哪些憑證、更新之後誰負責讓網頁伺服器換上新的、誰在它過期之前發現。這一課用 certbot 向 Let\'s Encrypt 申請憑證、安裝到 nginx、設定自動更新，並學會用 openssl 與 curl 找出鏈不完整與快要過期的憑證。',
  sections: [
    {
      id: 'srv04-s-cert', title: '憑證裡有什麼：名稱、簽發者與有效期間',
      blocks: [
        { type: 'p', text: 'TLS 憑證（X.509 憑證）是一份由憑證機構（CA）簽章的文件，內容是「這把公鑰屬於這些名稱，在這段期間內有效」。伺服器把憑證交給每個連進來的用戶端，再用只有自己持有的私鑰證明它真的是憑證的主人。憑證是公開的，任何人都能拿到；真正要保護的是私鑰，Let\'s Encrypt 的私鑰檔是 root 才能讀的 0600。' },
        { type: 'table', head: ['欄位', '例子（openssl x509 的寫法）', '意思'], rows: [
          ['subject', '`subject=CN = shop.example.org`', '憑證的主體；CN（Common Name）是傳統上放網域名稱的地方'],
          ['Subject Alternative Name（SAN）', '`DNS:shop.example.org, DNS:www.shop.example.org`', '這張憑證涵蓋的所有名稱。瀏覽器與 curl 比對的是 SAN，CA/Browser Forum 的規範要求公開憑證一定要有 SAN，CN 只是為了相容而保留'],
          ['issuer', '`issuer=C = US, O = Let\'s Encrypt, CN = R11`', '簽發這張憑證的 CA；它必須等於上一層憑證的 subject'],
          ['有效期間', '`notBefore=…`、`notAfter=…`', '以 UTC（GMT）表示；現在的時間不在這段期間內，驗證就失敗'],
          ['公鑰與序號', '`a:PKEY: id-ecPublicKey, 256 (bit)`、`serial=…`', '公鑰配對的私鑰留在伺服器上；序號由 CA 指定，撤銷時用它識別'],
        ] },
        { type: 'p', text: '名稱比對有兩個規則要記得。第一，萬用字元只代表一層：`*.example.org` 涵蓋 `www.example.org` 與 `shop.example.org`，但不涵蓋 `example.org` 本身，也不涵蓋 `a.shop.example.org`。第二，一張憑證可以涵蓋好幾個不相干的名稱，所以 `shop.example.org` 與 `www.shop.example.org` 通常放在同一張。`openssl x509` 讀 PEM 格式的憑證檔，`-noout` 不印出檔案本身，其他選項依序印出你要的欄位：' },
        { type: 'example', id: 'srv04-fields' },
        { type: 'p', text: '注意根憑證的 subject 和 issuer 完全相同：它是自己簽自己的（自簽）。自簽本身證明不了任何事，根憑證之所以可信，是因為作業系統、瀏覽器把它預先放進了信任庫，這是下一節的主題。' },
      ],
    },
    {
      id: 'srv04-s-chain', title: '憑證鏈與信任庫：伺服器要送出哪些憑證',
      blocks: [
        { type: 'p', text: 'CA 不會直接用根憑證的私鑰簽網站的憑證：根憑證的私鑰平常離線保存，CA 用它簽出幾張中繼憑證（intermediate），日常的簽發都用中繼憑證。所以一張網站憑證要驗證到底，需要一條鏈：' },
        { type: 'table', head: ['層級', '本課的例子', '誰保管、怎麼取得'], rows: [
          ['0：葉憑證（leaf）', 'CN = shop.example.org，issuer 是 R11', '你的伺服器；在 TLS 交握時送出'],
          ['1：中繼憑證', 'CN = R11，issuer 是 ISRG Root X1', '也由你的伺服器送出（和葉憑證放在同一個檔案）'],
          ['2：根憑證', 'CN = ISRG Root X1，自簽', '用戶端的信任庫；伺服器不必送'],
        ] },
        { type: 'p', text: '信任庫（trust store）是用戶端事先相信的根憑證清單。Ubuntu 的 ca-certificates 套件把它們合併成 `/etc/ssl/certs/ca-certificates.crt`，curl、wget 與照 OpenSSL 預設設定找信任庫的程式都用它；瀏覽器與手機作業系統各有自己的清單，內容大致相同但不完全一樣。驗證時用戶端從葉憑證開始，一層一層找簽發者（subject 等於 issuer，而且簽章對得上），直到接上信任庫裡的根憑證；中間少了任何一張，鏈就斷了。' },
        { type: 'example', id: 'srv04-handshake' },
        { type: 'p', text: '這就是伺服器一定要送出中繼憑證的原因：信任庫只有根憑證，中繼憑證只能從伺服器那裡拿到。certbot 替你準備了三種組合，安裝時選錯是最常見的錯誤：' },
        { type: 'table', head: ['檔案', '內容', '用途'], rows: [
          ['`cert.pem`', '只有葉憑證', '少數需要分開設定的軟體；給 nginx 用就是只送葉憑證'],
          ['`chain.pem`', '只有中繼憑證', '舊版 Apache 的 `SSLCertificateChainFile`、OCSP stapling 的設定'],
          ['`fullchain.pem`', '葉憑證在前，接著中繼憑證', 'nginx 的 `ssl_certificate` 要用這個'],
          ['`privkey.pem`', '私鑰（0600）', 'nginx 的 `ssl_certificate_key`'],
        ] },
        { type: 'example', id: 'srv04-leaf-only' },
        { type: 'callout', tone: 'warning', title: '誤解：瀏覽器打得開，憑證就裝對了', text: '只送葉憑證的網站，在某些瀏覽器上看起來完全正常：瀏覽器可能記得以前從別的網站拿到的同一張中繼憑證，或依憑證裡的 AIA 欄位自己去下載。curl、伺服器之間的 API 呼叫、手機 App 與很多程式語言的 HTTP 函式庫不會這樣補，於是回報 unable to get local issuer certificate（Node.js 的訊息是 unable to verify the first certificate）。檢查要用不會自己補鏈的工具：`openssl s_client` 的 Certificate chain 應該列出 0 與 1 兩張，Verify return code 是 0。' },
      ],
    },
    {
      id: 'srv04-s-acme', title: 'ACME 與 Let\'s Encrypt：證明網域是你的',
      blocks: [
        { type: 'p', text: 'CA 簽發網域驗證（DV）憑證之前，要確認申請者確實控制這個網域。Let\'s Encrypt 是免費、全自動的 CA，用的協定是 ACME（RFC 8555）：用戶端（例如 certbot）建立訂單，CA 對每個名稱出一道「挑戰」，用戶端完成挑戰，CA 自己去驗證，全部通過後才簽發。最常用的是 HTTP-01 挑戰：' },
        { type: 'list', ordered: true, items: [
          'certbot 向 CA 建立訂單（shop.example.org、www.shop.example.org），CA 對每個名稱給一個 token。',
          'certbot 在網站根目錄寫入 `.well-known/acme-challenge/TOKEN`，內容是 token 加上帳號金鑰的指紋（webroot 方式：`-w` 指定 nginx 服務的那個目錄）。',
          'CA 從網際網路查名稱的公開 DNS 記錄，連到那個位址的 80 埠，取回 `http://名稱/.well-known/acme-challenge/TOKEN`。可以跟隨重新導向（也可以轉到 https，這一步不檢查憑證），但起點一定是 80 埠。',
          '內容正確就通過；所有名稱都通過，CA 簽發憑證，certbot 把它存進 /etc/letsencrypt 並刪掉 token。',
        ] },
        { type: 'p', text: '所以 HTTP-01 有三個前提：每個名稱的公開 DNS 指向這台伺服器（CA 用自己的解析器，你機器上的 `/etc/hosts` 沒有用）、80 埠從網際網路連得到、而且 80 埠上的網站真的從 `-w` 那個目錄提供 `/.well-known/acme-challenge/`。萬用字元憑證（`*.example.org`）不能用 HTTP-01，要用 DNS-01：在 DNS 加一筆 TXT 記錄證明你控制整個網域（模擬環境不支援）。帳號第一次使用時要加 `--agree-tos -m 信箱` 註冊，本課的機器已經註冊過。' },
        { type: 'example', id: 'srv04-issue' },
        { type: 'p', text: 'Let\'s Encrypt 的憑證只有 90 天。這是刻意的：私鑰外洩或憑證被誤發時，撤銷機制在實務上並不可靠（很多用戶端不檢查撤銷狀態），效期短才能限制損害；效期短也逼大家把更新自動化，因為手動每三個月換一次一定會忘。業界也正朝更短的最長效期前進，所以一開始就要把更新做成自動的。失敗時，certbot 會轉述 CA 的判斷，Detail 那一行最重要：' },
        { type: 'table', head: ['Type 與 Detail', '意思', '怎麼查'], rows: [
          ['`dns`：`DNS problem: NXDOMAIN looking up A for …`', '這個名稱沒有 DNS 記錄', '`dig +short 名稱`；先建立 A 記錄（SRV02）'],
          ['`connection`：`Timeout during connect (likely firewall problem)`', 'CA 連那個位址的 80 埠沒有回應', '看 Detail 開頭的位址是不是你的伺服器；是的話查防火牆'],
          ['`connection`：`… Connection refused`', '那個位址與埠沒有程式在聽（也可能是被轉到 https 而 443 還沒有服務）', '`ss -tln`、`curl -sI http://名稱/`'],
          ['`unauthorized`：`Invalid response from … 404`', '連到了，但網站沒有從 `-w` 的目錄提供 token', '確認 nginx 的 `root` 和 `-w` 是同一個目錄'],
        ] },
        { type: 'example', id: 'srv04-acme-errors' },
        { type: 'callout', tone: 'tip', title: '除錯時用 --dry-run', text: 'Let\'s Encrypt 對失敗的驗證與重複的申請有頻率限制，在正式環境反覆嘗試可能被暫時擋下。`certbot renew --dry-run`（`certonly` 也接受 `--dry-run`）向 Let\'s Encrypt 的測試環境走完整個流程，不寫入任何憑證，適合確認 DNS、80 埠與 webroot 都沒問題。' },
      ],
    },
    {
      id: 'srv04-s-install', title: '安裝到 nginx：fullchain、私鑰與 reload',
      blocks: [
        { type: 'p', text: 'certbot 的 `certonly` 只取得憑證，不改網頁伺服器的設定。nginx 要提供 HTTPS，需要一個在 443 埠聽、標記 `ssl` 的 server 區塊，並指出憑證與私鑰（nginx 的設定細節在 SRV06）：' },
        { type: 'table', head: ['指令', '寫法', '說明'], rows: [
          ['`listen`', '`listen 443 ssl;`', '這個 server 區塊在 443 埠以 TLS 服務；少了 `ssl` 就是在 443 埠提供明文的 HTTP'],
          ['`server_name`', '`server_name shop.example.org www.shop.example.org;`', 'TLS 交握時依 SNI、HTTP 請求時依 Host 選到這個區塊'],
          ['`ssl_certificate`', '`/etc/letsencrypt/live/shop.example.org/fullchain.pem`', '要送出的憑證鏈：葉憑證加中繼憑證'],
          ['`ssl_certificate_key`', '`/etc/letsencrypt/live/shop.example.org/privkey.pem`', '和葉憑證配對的私鑰；不配對時 `nginx -t` 回報 key values mismatch'],
        ] },
        { type: 'p', text: '一律指向 `live/` 底下的路徑：那些是符號連結，certbot 每次更新都把新檔案寫進 `archive/`（cert2.pem、cert3.pem…）並改連結，設定檔不必跟著改；把檔案複製到別處，更新後就會繼續用舊的。nginx 只在啟動與 reload 時讀取憑證檔，所以安裝完要 `sudo nginx -t` 檢查、`sudo systemctl reload nginx` 套用，之後用 `curl -sI https://…` 與 `openssl s_client` 從外面確認。' },
        { type: 'p', text: '`sudo certbot --nginx -d 名稱` 把取得與安裝一次做完：它找到 `server_name` 含有這個名稱的 server 區塊，加上 `listen 443 ssl`、`ssl_certificate`（fullchain.pem）與 `ssl_certificate_key`，並（預設）另外產生一個把 80 埠轉到 https 的區塊，然後 reload nginx；之後每次更新也會自己 reload。webroot 方式則讓你完全掌握設定檔，代價是安裝與 reload 要自己負責。下面是同事用 webroot 取得憑證後手動安裝、卻選錯檔案的 web-01：' },
        { type: 'example', id: 'srv04-chain' },
        { type: 'p', text: '`openssl verify` 只驗證檔案中的第一張憑證，信任庫是系統的根憑證；中繼憑證要用 `-untrusted` 提供，這正好重現了「只送葉憑證」與「送出完整鏈」的差別。修正的方法是把 `ssl_certificate` 改成 fullchain.pem 並 reload，這是本課的第二個練習。' },
        { type: 'callout', tone: 'warning', title: '先有 HTTPS，再把 80 埠轉過去', text: '還沒有憑證就先把 80 埠全部 `return 301 https://…`，HTTP-01 驗證會被轉到 https，而 443 還沒有任何服務，CA 回報 Connection refused。順序是：80 埠照常服務並取得憑證、裝好 443、確認 https 正常，最後才加轉址。轉址加上之後，更新仍然可以通過：CA 從 80 埠開始，跟著轉址到 https 取回 token，而 443 的 server 區塊用同一個 root 提供它。' },
      ],
    },
    {
      id: 'srv04-s-renew', title: '自動更新：certbot renew、timer 與 deploy hook',
      blocks: [
        { type: 'p', text: '每取得一張憑證，certbot 就在 `/etc/letsencrypt/renewal/名稱.conf` 記下當初的方式（authenticator、webroot、hook）。`certbot renew` 依序檢查這些設定，只更新 30 天內就要到期的憑證，其他印出 Certificate not yet due for renewal；所以它可以放心地每天執行很多次。Ubuntu 的 certbot 套件附了 `certbot.timer`，每天 00:00 與 12:00 加上最多 12 小時的隨機延遲（RandomizedDelaySec，避免全世界同時湧向 CA）觸發 `certbot.service`，執行 `certbot -q renew`。' },
        { type: 'table', head: ['指令', '用途'], rows: [
          ['`sudo certbot certificates`', '列出每張憑證的名稱、網域、到期日與剩下的天數（VALID: 18 days）'],
          ['`sudo certbot renew --dry-run`', '模擬更新每一張（即使還沒到期），確認驗證會成功；不寫入、不執行 deploy hook'],
          ['`sudo certbot renew`', '更新 30 天內到期的憑證；`--force-renewal` 不管期限一律更新（小心頻率限制）'],
          ['`systemctl list-timers certbot.timer`', 'timer 下次什麼時候觸發；`systemctl is-enabled certbot.timer` 看開機時會不會啟動'],
          ['`--deploy-hook \'systemctl reload nginx\'`', '取得或更新成功之後執行的指令，存成 renewal 設定的 `renew_hook`，之後每次更新都會執行'],
        ] },
        { type: 'p', text: '自動更新最常壞在最後一步：用 webroot 方式取得的憑證，certbot 只負責換掉 /etc/letsencrypt 裡的檔案，nginx 仍然送出啟動或上次 reload 時讀進記憶體的舊憑證。檔案是新的、網站送的是舊的，直到某天舊憑證過期才爆發。解法是在取得憑證時加上 `--deploy-hook \'systemctl reload nginx\'`（只在真的更新成功後執行，所以不會每天重新載入），或改用 `--nginx` 方式（它更新後自己 reload）。certbot 也會在每次更新成功後執行 `/etc/letsencrypt/renewal-hooks/deploy/` 裡的可執行檔，效果相同（模擬環境用 `--deploy-hook` 示範）。' },
        { type: 'example', id: 'srv04-renew' },
        { type: 'callout', tone: 'warning', title: '誤解：有 timer 就不會過期', text: 'timer 只證明 certbot 定期執行，不證明更新成功，更不證明網站送出的是新憑證。DNS 改了、80 埠被防火牆擋住、webroot 換了目錄，`certbot -q renew` 都只會在 journal 留下錯誤；沒有 deploy hook，新憑證也不會被 nginx 載入。定期跑 `certbot renew --dry-run`，並從外面檢查網站實際送出的憑證到期日（下一節）。' },
      ],
    },
    {
      id: 'srv04-s-hsts', title: 'HSTS 與到期監控',
      blocks: [
        { type: 'p', text: '把 80 埠轉到 https 之後還有一個缺口：使用者第一次輸入 `shop.example.org` 時，瀏覽器先用明文 HTTP 連線，這一次請求可能被攔截或竄改。HSTS（HTTP Strict Transport Security，RFC 6797）讓網站透過 HTTPS 回應加上標頭 `Strict-Transport-Security: max-age=31536000`，告訴瀏覽器：「接下來 max-age 秒內，這個主機一律用 https 連，連 http 的網址也先改成 https 再送出。」瀏覽器只接受從 HTTPS 收到的這個標頭（從 HTTP 回應收到會被忽略），而且對 HSTS 網站的憑證錯誤不再提供「仍要繼續」的選項。' },
        { type: 'table', head: ['參數', '意思', '風險'], rows: [
          ['`max-age=秒`', '瀏覽器記住多久；每次收到標頭都重新計算', '設成一年後若想退回 http，已經來過的使用者在一年內都只會走 https'],
          ['`includeSubDomains`', '所有子網域也一律 https', '只支援 http 的子網域（內部工具、舊系統）會連不上'],
          ['`preload`', '表示同意被收進瀏覽器內建的 HSTS 預載清單（要另外提交，條件包括 max-age 至少一年與 includeSubDomains）', '清單隨瀏覽器版本發布，要移除得等好幾個月，期間所有子網域都被強制 https'],
        ] },
        { type: 'p', text: '安全的做法是循序漸進：先確定 https 穩定（完整的鏈、自動更新、所有子網域），用很短的 `max-age=300` 開始，觀察一段時間再逐步加長；`includeSubDomains` 與 `preload` 要等確認每個子網域都能用 HTTPS 才加。nginx 用 `add_header Strict-Transport-Security "max-age=31536000" always;` 加在 443 的 server 區塊（`always` 讓錯誤頁也帶著它）。注意 curl 預設不記 HSTS：它只是一個回應標頭，curl 不會因此改用 https。' },
        { type: 'p', text: '到期監控要回答兩個問題：檔案裡的憑證什麼時候到期？網站實際送出的又是哪一張？兩者在「更新了卻沒有 reload」時就不一樣。`openssl x509 -checkend 秒數` 在憑證會在這段時間內到期（或已經過期）時印出 Certificate will expire 並以結束碼 1 結束，否則印出 Certificate will not expire、結束碼 0，很適合寫進監控指令稿；檢查網站實際送出的憑證，就把 `openssl s_client` 的輸出接給它：' },
        { type: 'table', head: ['要檢查的', '指令'], rows: [
          ['檔案裡的憑證 30 天內會不會到期', '`openssl x509 -in 檔案 -noout -enddate -checkend 2592000`'],
          ['網站實際送出的憑證', '`echo | openssl s_client -connect shop.example.org:443 -servername shop.example.org 2>/dev/null | openssl x509 -noout -enddate -checkend 2592000`'],
          ['certbot 管理的所有憑證', '`sudo certbot certificates`（VALID: N days）'],
          ['一個目錄裡快到期的檔案', '`for f in /etc/ssl/sites/*.pem; do …; done`（本課的練習）'],
        ] },
        { type: 'p', text: '30 天是 2592000 秒、14 天是 1209600 秒。Let\'s Encrypt 的憑證正常會在剩 30 天時更新，所以「剩不到 20 天」就代表自動更新已經失敗了好幾次，應該發出警報。不是 certbot 管理的憑證（內部 CA、向其他 CA 購買的）沒有人替你更新，更需要列進監控。不要依賴 CA 寄來的提醒信：信箱會換人、信會被過濾，Let\'s Encrypt 也已經停止寄送到期通知信。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [handshake, leafOnly],
    exercises: [
      { id: 'srv04-ex-sni', task: 'field', scene: 'srv04-handshake', message: 'client-hello', layer: 'application', field: 'server_name（SNI）', title: 'nginx 依什麼選憑證',
        statement: '在「HTTPS 連線的交握」情境裡，web-01 上有好幾個 HTTPS 網站共用 203.0.113.20。nginx 在送出憑證之前，依 ClientHello 裡的哪個值決定要用哪一個 server 區塊的憑證？請填入這一步中那個欄位的值。',
        hints: ['伺服器要在交握的第一個訊息就知道用戶端想連哪個網站，那時 HTTP 的 Host 標頭還沒送出（它在加密之後才送）。', '看 ClientHello 的 TLS 標頭：哪個擴充寫著一個主機名稱？'],
        explanation: 'SNI（server_name 擴充）是 ClientHello 裡的明文欄位，值是用戶端要連的名稱 www.shop.example.org。nginx 依它找出 server_name 相符的 443 server 區塊，送出那個區塊的 ssl_certificate。IP 位址對同一台機器上的每個網站都相同，無法區分；憑證的 CN 是 shop.example.org，但那是伺服器送出的答案，不是用戶端的問題；Host 標頭要等交握完成、在加密的通道裡才送出。',
        mistakes: [
          { answer: { value: '203.0.113.20' }, why: '填了目的 IP：同一台伺服器上的所有 HTTPS 網站共用這個位址，nginx 要靠名稱才能區分它們。' },
          { answer: { value: 'shop.example.org' }, why: '填了憑證的 CN：用戶端在 SNI 寫的是它要連的名稱 www.shop.example.org，憑證是伺服器依這個名稱選出來的。' },
        ] },
      { id: 'srv04-ex-count', task: 'field', scene: 'srv04-leaf-only', message: 'server-flight', layer: 'application', field: '憑證數量', title: '設定錯誤的伺服器送了幾張憑證',
        statement: '在「設定錯誤的伺服器：只送出葉憑證」情境裡，ssl_certificate 指向 cert.pem。伺服器的加密 Certificate 訊息裡有幾張憑證？（只填數字）',
        hints: ['cert.pem、chain.pem、fullchain.pem 各裝了哪些憑證？', '根憑證本來就不需要由伺服器送出。'],
        explanation: 'cert.pem 只有葉憑證，所以 nginx 只送出 1 張。正確的設定（fullchain.pem）會送出 2 張：葉憑證與中繼憑證 R11。不論哪種設定，根憑證都不由伺服器送出，用戶端只用自己信任庫裡的根憑證。少了 R11，用戶端從葉憑證找不到簽發者，curl 以錯誤 60（unable to get local issuer certificate）中止。',
        mistakes: [
          { answer: { value: '2' }, why: '2 是正確設定（fullchain.pem）送出的數量；這台伺服器用的是只有葉憑證的 cert.pem。' },
          { answer: { value: '3' }, why: '以為伺服器會連根憑證一起送：根憑證來自用戶端的信任庫，伺服器即使送了，用戶端也不會因此信任它。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'srv04-q1', prompt: '用 certbot 的 webroot 方式取得憑證後，nginx 的 `ssl_certificate` 應該指向哪個檔案？',
      options: ['`/etc/letsencrypt/live/名稱/cert.pem`', '`/etc/letsencrypt/live/名稱/fullchain.pem`', '`/etc/letsencrypt/live/名稱/chain.pem`', '`/etc/letsencrypt/archive/名稱/fullchain1.pem`'],
      answer: 1,
      explanation: 'fullchain.pem 是葉憑證加上中繼憑證，nginx 會把整條鏈送給用戶端。cert.pem 只有葉憑證，用戶端建不起鏈；chain.pem 只有中繼憑證，和 privkey.pem 不配對，nginx -t 回報 key values mismatch；archive 裡的 fullchain1.pem 是第一版的實際檔案，更新後 live 的連結會指向 fullchain2.pem，設定卻還停在舊檔。',
    },
    {
      id: 'srv04-q2', prompt: '網站在你的瀏覽器顯示正常，但合作廠商的程式回報 `SSL certificate problem: unable to get local issuer certificate`。最可能的原因是什麼？',
      options: ['憑證已經過期', '合作廠商的程式不支援 TLS 1.3', '伺服器的私鑰外洩，CA 撤銷了憑證', '伺服器只送出葉憑證，沒有送中繼憑證；瀏覽器可能用快取或 AIA 自己補上，程式不會'],
      answer: 3,
      explanation: 'unable to get local issuer certificate 表示從葉憑證找不到簽發者，典型原因就是 ssl_certificate 用了 cert.pem。瀏覽器可能記得或下載中繼憑證所以看起來正常。過期的錯誤是 certificate has expired，而且瀏覽器也會警告；版本不相容是交握失敗，不是簽發者的錯誤；私鑰外洩與撤銷不會讓鏈少一張，curl 預設也不檢查撤銷狀態，所以不會出現找不到簽發者的錯誤。',
    },
    {
      id: 'srv04-q3', prompt: '`sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org` 要成功，下列哪一項是必要的？',
      options: ['shop.example.org 的公開 DNS 指向這台伺服器，而且 CA 能從網際網路連到 80 埠，取回 /var/www/shop 底下的 token 檔', '這台伺服器的 /etc/hosts 有 shop.example.org 這一行', '443 埠已經有可用的 HTTPS', 'nginx 已經設定好 ssl_certificate'],
      answer: 0,
      explanation: 'HTTP-01 由 CA 從網際網路驗證：用公開 DNS 查名稱、連到那個位址的 80 埠、取回 webroot 裡的 token。CA 不會讀你機器上的 /etc/hosts；HTTPS 與 ssl_certificate 是取得憑證之後才能設定的東西，驗證從 80 埠開始，不需要 443 已經可用。',
    },
    {
      id: 'srv04-q4', prompt: '`sudo certbot renew` 印出 `Congratulations, all renewals succeeded`，但 `openssl s_client` 看到網站送出的仍是舊憑證。原因與解法是什麼？',
      options: ['CA 還沒有把新憑證發布出去，要等幾小時', 'certbot 把新憑證寫到了錯的目錄，要手動複製到 live', 'nginx 只在啟動與 reload 時讀取憑證檔；要 reload nginx，並用 --deploy-hook 讓以後每次更新後自動 reload', '瀏覽器快取了舊憑證，要清除快取'],
      answer: 2,
      explanation: 'webroot 方式只換掉 /etc/letsencrypt 的檔案，nginx 記憶體裡仍是舊憑證，reload 之後才送出新的；deploy hook 讓這件事自動發生。CA 簽發後憑證立即可用，沒有發布延遲；certbot 會自己更新 live 的連結，不需要複製；s_client 不是瀏覽器，沒有快取，看到的就是伺服器現在送出的。',
    },
    {
      id: 'srv04-q5', prompt: 'Let\'s Encrypt 的憑證只有 90 天效期，主要的理由是什麼？',
      options: ['短效期的憑證加密強度比較高', '私鑰外洩或誤發時能限制損害時間（撤銷在實務上不可靠），並促使大家把更新自動化', '免費的 CA 被規定只能簽發短效期的憑證', 'TLS 1.3 不接受超過 90 天的憑證'],
      answer: 1,
      explanation: '效期越短，外洩或誤發的憑證能被濫用的時間就越短，而且不依賴很多用戶端並不檢查的撤銷機制；三個月一次也讓手動更新不可行，逼使自動化。加密強度取決於金鑰與演算法，和效期無關；沒有規定免費 CA 只能簽短效期；TLS 協定本身不限制憑證效期。',
    },
    {
      id: 'srv04-q6', prompt: '網站剛裝好 HTTPS，同事想立刻加上 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` 並提交預載清單。最大的風險是什麼？',
      options: ['HSTS 標頭會讓 curl 自動改用 https，破壞監控', 'HSTS 會讓伺服器拒絕所有 HTTP 請求', 'max-age 太長會讓憑證提早到期', '還只支援 http 的子網域會在兩年內對已經來過的使用者都連不上，預載清單也很難撤回；HTTPS 出問題時使用者無法略過憑證錯誤'],
      answer: 3,
      explanation: 'includeSubDomains 把所有子網域一起強制 https，max-age 兩年、加上要好幾個月才能移除的預載清單，錯了很難收回；HSTS 網站的憑證錯誤也不提供繼續的選項，鏈不完整或過期時網站完全打不開。curl 預設不記 HSTS；HSTS 是瀏覽器端的行為，伺服器照樣接受 HTTP；max-age 和憑證效期無關。',
    },
    {
      id: 'srv04-q7', prompt: '`openssl x509 -in pay.pem -noout -checkend 1209600` 印出 `Certificate will expire`，結束碼是 1。這代表什麼？',
      options: ['pay.pem 會在 14 天（1209600 秒）內到期，或已經過期', 'pay.pem 已經在 1209600 秒前過期', 'pay.pem 的鏈不完整，無法驗證', 'pay.pem 還有 1209600 天才到期'],
      answer: 0,
      explanation: '-checkend N 判斷憑證在現在加 N 秒時是否已經過了 notAfter：是就印 Certificate will expire、結束碼 1，所以已經過期的憑證也是這個結果。它不說明過期了多久；-checkend 只看日期，不驗證鏈；N 的單位是秒，1209600 秒是 14 天。',
    },
    {
      id: 'srv04-q8', prompt: '一台主機用同一個 IP 提供 shop.example.org 與 blog.example.org 兩個 HTTPS 網站。nginx 在 TLS 交握時怎麼知道該送出哪一張憑證？',
      options: ['看 HTTP 請求的 Host 標頭', '依用戶端的 IP 位址決定', '看 ClientHello 裡的 SNI（server_name），它以明文寫出用戶端要連的名稱', '把兩張憑證都送出，讓用戶端自己挑'],
      answer: 2,
      explanation: '憑證在交握中就要送出，那時 HTTP 請求還沒開始，所以 nginx 依 ClientHello 的 SNI 選出 server 區塊與它的憑證。Host 標頭要等加密通道建好才送出；用戶端的 IP 和它想連哪個網站無關；伺服器只送一條鏈，若沒有任何名稱相符，送出的是預設 server 的憑證，用戶端會回報名稱不符。',
    },
  ],
  terminal: {
    machines: [web, leaf, hooked, noTimer, intra],
    examples: [
      {
        id: 'srv04-fields', title: '讀憑證的欄位', machine: 'srv04-leaf',
        description: '在 web-01 上用 `openssl x509` 讀 certbot 取得的葉憑證：subject、涵蓋的名稱（SAN）、簽發者 R11 與有效期間；私鑰只有 root 能讀。信任庫裡的根憑證 ISRG Root X1 的 subject 與 issuer 相同（自簽），效期長得多。',
        steps: [
          { command: `sudo openssl x509 -in ${LIVE}/cert.pem -noout -subject -ext subjectAltName -issuer -dates`, output: "subject=CN = shop.example.org\nX509v3 Subject Alternative Name:\n    DNS:shop.example.org, DNS:www.shop.example.org\nissuer=C = US, O = Let's Encrypt, CN = R11\nnotBefore=Nov 10 07:00:00 2026 GMT\nnotAfter=Feb  8 06:59:59 2027 GMT" },
          { command: 'sudo ls -l /etc/letsencrypt/archive/shop.example.org', output: "-rw-r--r-- root    root      570 cert1.pem\n-rw-r--r-- root    root      574 chain1.pem\n-rw-r--r-- root    root     1144 fullchain1.pem\n-rw------- root    root      152 privkey1.pem" },
          { command: 'openssl x509 -in /etc/ssl/certs/ca-certificates.crt -noout -subject -issuer -dates', output: "subject=C = US, O = Internet Security Research Group, CN = ISRG Root X1\nissuer=C = US, O = Internet Security Research Group, CN = ISRG Root X1\nnotBefore=Jun  4 11:04:38 2015 GMT\nnotAfter=Jun  4 11:04:38 2035 GMT" },
        ],
      },
      {
        id: 'srv04-issue', title: '用 webroot 方式取得憑證', machine: 'srv04-web',
        description: 'certbot 在 /var/www/shop 放入 token，Let\'s Encrypt 經由公開 DNS 與 80 埠取回，兩個名稱都通過後簽發。live 底下是指向 archive 的符號連結；cert.pem 與 chain.pem 各有一張憑證，fullchain.pem 有兩張。',
        steps: [
          { command: 'dig +short shop.example.org', output: "203.0.113.20" },
          { command: 'dig +short www.shop.example.org', output: "shop.example.org.\n203.0.113.20" },
          { command: 'sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for shop.example.org and www.shop.example.org\n\nSuccessfully received certificate.\nCertificate is saved at: /etc/letsencrypt/live/shop.example.org/fullchain.pem\nKey is saved at:         /etc/letsencrypt/live/shop.example.org/privkey.pem\nThis certificate expires on 2027-02-20.\nThese files will be updated when the certificate renews.\nCertbot has set up a scheduled task to automatically renew this certificate in the background.\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nIf you like Certbot, please consider supporting our work by:\n * Donating to ISRG / Let's Encrypt:   https://letsencrypt.org/donate\n * Donating to EFF:                    https://eff.org/donate-le\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" },
          { command: `sudo ls -l ${LIVE}`, output: "-rw-r--r-- root    root      692 README\nlrwxrwxrwx root    root       40 cert.pem -> ../../archive/shop.example.org/cert1.pem\nlrwxrwxrwx root    root       41 chain.pem -> ../../archive/shop.example.org/chain1.pem\nlrwxrwxrwx root    root       45 fullchain.pem -> ../../archive/shop.example.org/fullchain1.pem\nlrwxrwxrwx root    root       43 privkey.pem -> ../../archive/shop.example.org/privkey1.pem" },
          { command: `sudo grep -c BEGIN ${LIVE}/cert.pem ${LIVE}/chain.pem ${LIVE}/fullchain.pem`, output: "/etc/letsencrypt/live/shop.example.org/cert.pem:1\n/etc/letsencrypt/live/shop.example.org/chain.pem:1\n/etc/letsencrypt/live/shop.example.org/fullchain.pem:2" },
          { command: 'sudo certbot certificates', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nFound the following certs:\n  Certificate Name: shop.example.org\n    Serial Number: 4776972b3a722c55cbc59ab33434e8ddbd2\n    Key Type: ECDSA\n    Domains: shop.example.org www.shop.example.org\n    Expiry Date: 2027-02-20 08:59:59+00:00 (VALID: 89 days)\n    Certificate Path: /etc/letsencrypt/live/shop.example.org/fullchain.pem\n    Private Key Path: /etc/letsencrypt/live/shop.example.org/privkey.pem\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" },
        ],
      },
      {
        id: 'srv04-acme-errors', title: 'Let\'s Encrypt 的驗證失敗', machine: 'srv04-web',
        description: 'example.org 本身指向公司官網的主機（198.51.100.80），不是 web-01：CA 連到別的位址，逾時，整張憑證都不簽發。換成正確的名稱、但 `-w` 寫成 nginx 預設網站的 /var/www/html：CA 連到了 web-01，卻拿到 404。',
        steps: [
          { command: 'ip -4 -br address show dev eth0', output: "eth0             UP             203.0.113.20/24" },
          { command: 'dig +short example.org', output: "198.51.100.80" },
          { command: 'sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d example.org', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for shop.example.org and example.org\n\nCertbot failed to authenticate some domains (authenticator: webroot). The Certificate Authority reported these problems:\n  Domain: example.org\n  Type:   connection\n  Detail: 198.51.100.80: Fetching http://example.org/.well-known/acme-challenge/Pv1hI-cvzF9NbxASVdWeC7KtTxjeTP-n_fC42MCEnkw: Timeout during connect (likely firewall problem)\n\nHint: The Certificate Authority failed to download the temporary challenge files created by Certbot. Ensure that the listed domains serve their content from the provided --webroot-path/-w and that files created there can be downloaded from the internet.\n\nSome challenges have failed.\nAsk for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details." },
          { command: 'echo $?', output: "1" },
          { command: 'sudo certbot certonly --webroot -w /var/www/html -d shop.example.org', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\nRequesting a certificate for shop.example.org\n\nCertbot failed to authenticate some domains (authenticator: webroot). The Certificate Authority reported these problems:\n  Domain: shop.example.org\n  Type:   unauthorized\n  Detail: 203.0.113.20: Invalid response from http://shop.example.org/.well-known/acme-challenge/xqAfXKpaBoBk71cSSoi-9gl6ONj5QOokZy2xXt3lEEk: 404\n\nHint: The Certificate Authority failed to download the temporary challenge files created by Certbot. Ensure that the listed domains serve their content from the provided --webroot-path/-w and that files created there can be downloaded from the internet.\n\nSome challenges have failed.\nAsk for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details." },
        ],
      },
      {
        id: 'srv04-chain', title: '只送出葉憑證的伺服器', machine: 'srv04-leaf',
        description: 'curl 以錯誤 60 拒絕連線；`openssl s_client` 的 Certificate chain 只有第 0 張，判定是 21（unable to verify the first certificate）。原因在 snippet：ssl_certificate 用了只有葉憑證的 cert.pem。`openssl verify` 加上 `-untrusted chain.pem` 補上中繼憑證之後就驗證成功。',
        steps: [
          { command: 'curl -sS https://shop.example.org/', output: "curl: (60) SSL certificate problem: unable to get local issuer certificate\nMore details here: https://curl.se/docs/sslcerts.html\n\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above." },
          { command: 'openssl s_client -connect shop.example.org:443 -servername shop.example.org 2>&1 | grep -E "^verify error|^ [0-9] s:|^   i:|^Verify return"', output: "verify error:num=20:unable to get local issuer certificate\nverify error:num=21:unable to verify the first certificate\n 0 s:CN = shop.example.org\n   i:C = US, O = Let's Encrypt, CN = R11\nVerify return code: 21 (unable to verify the first certificate)" },
          { command: 'cat /etc/nginx/snippets/shop-tls.conf', output: "ssl_certificate /etc/letsencrypt/live/shop.example.org/cert.pem;\nssl_certificate_key /etc/letsencrypt/live/shop.example.org/privkey.pem;" },
          { command: `sudo openssl verify ${LIVE}/cert.pem`, output: "CN = shop.example.org\nerror 20 at 0 depth lookup: unable to get local issuer certificate\nerror /etc/letsencrypt/live/shop.example.org/cert.pem: verification failed" },
          { command: `sudo openssl verify -untrusted ${LIVE}/chain.pem ${LIVE}/cert.pem`, output: "/etc/letsencrypt/live/shop.example.org/cert.pem: OK" },
        ],
      },
      {
        id: 'srv04-renew', title: '更新、deploy hook 與 HSTS', machine: 'srv04-hooked',
        description: '2027-01-20，憑證剩 18 天。certbot.timer 每天觸發兩次；renewal 設定裡有 deploy hook。`--dry-run` 模擬更新但跳過 hook；真正的 `renew` 換上新憑證並執行 hook，nginx reload 之後，網站送出的憑證立刻是新的（30 天內不會到期）。HTTPS 的回應帶著 HSTS 標頭；http 的 301 沒有（瀏覽器只接受從 HTTPS 收到的 HSTS）。',
        steps: [
          { command: 'sudo certbot certificates', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nFound the following certs:\n  Certificate Name: shop.example.org\n    Serial Number: 681947d4bfb55f28ecb18bb863f883f0bf6\n    Key Type: ECDSA\n    Domains: shop.example.org www.shop.example.org\n    Expiry Date: 2027-02-08 06:59:59+00:00 (VALID: 18 days)\n    Certificate Path: /etc/letsencrypt/live/shop.example.org/fullchain.pem\n    Private Key Path: /etc/letsencrypt/live/shop.example.org/privkey.pem\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" },
          { command: 'systemctl list-timers certbot.timer', output: "NEXT                        LEFT    LAST PASSED UNIT          ACTIVATES\nWed 2027-01-20 12:00:00 UTC 2h 0min -    -      certbot.timer certbot.service\n\n1 timers listed.\nPass --all to see loaded but inactive timers, too." },
          { command: 'sudo grep renew_hook /etc/letsencrypt/renewal/shop.example.org.conf', output: "renew_hook = systemctl reload nginx" },
          { command: 'sudo certbot renew --dry-run', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nProcessing /etc/letsencrypt/renewal/shop.example.org.conf\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nSimulating renewal of an existing certificate for shop.example.org and www.shop.example.org\nDry run: skipping deploy hook command: systemctl reload nginx\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nCongratulations, all simulated renewals succeeded:\n  /etc/letsencrypt/live/shop.example.org/fullchain.pem (success)\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" },
          { command: 'sudo certbot renew', output: "Saving debug log to /var/log/letsencrypt/letsencrypt.log\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nProcessing /etc/letsencrypt/renewal/shop.example.org.conf\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nRenewing an existing certificate for shop.example.org and www.shop.example.org\nRunning deploy-hook command: systemctl reload nginx\n\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -\nCongratulations, all renewals succeeded:\n  /etc/letsencrypt/live/shop.example.org/fullchain.pem (success)\n- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -" },
          { command: 'echo | openssl s_client -connect shop.example.org:443 -servername shop.example.org 2>/dev/null | openssl x509 -noout -enddate -checkend 2592000', output: "notAfter=Apr 20 08:59:59 2027 GMT\nCertificate will not expire" },
          { command: 'curl -sI https://shop.example.org/', output: "HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nDate: Wed, 20 Jan 2027 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 21\nConnection: keep-alive\nStrict-Transport-Security: max-age=31536000\n" },
          { command: 'curl -sI http://shop.example.org/', output: "HTTP/1.1 301 Moved Permanently\nServer: nginx/1.24.0 (Ubuntu)\nDate: Wed, 20 Jan 2027 10:00:00 GMT\nContent-Type: text/html\nContent-Length: 171\nConnection: keep-alive\nLocation: https://shop.example.org/\n" },
        ],
      },
    ],
    exercises: [
      {
        id: 'srv04-get-cert', title: '為網路商店取得並安裝憑證', machine: 'srv04-web',
        statement: 'web-01 上的網路商店 shop.example.org 與 www.shop.example.org 目前只有 http（nginx 的網站根目錄是 /var/www/shop）。請用 certbot 的 webroot 方式取得一張同時涵蓋這兩個名稱的憑證，再替 nginx 加上 443 埠的 server 區塊：`listen 443 ssl`、同樣的 server_name 與 root，ssl_certificate 與 ssl_certificate_key 指向 /etc/letsencrypt/live/shop.example.org/ 底下正確的檔案。檢查設定並套用，讓 https://www.shop.example.org/ 能通過 curl 的憑證驗證。example.org 本身是公司官網，在別的主機上，不在這次的範圍；80 埠先維持原樣。模擬環境沒有編輯器：可以用 `echo \'server { … }\' | sudo tee -a /etc/nginx/sites-available/shop` 附加一行寫完的 server 區塊（這個檔案已經由 sites-enabled 啟用）。',
        checks: [
          { kind: 'cert', path: `${LIVE}/fullchain.pem`, name: 'www.shop.example.org', issuer: 'R11', valid: 'shop.example.org' },
          { kind: 'nginx', test: true, server: 'www.shop.example.org', port: 443, ssl: true, root: '/var/www/shop' },
          { kind: 'http', url: 'https://www.shop.example.org/', status: 200 },
        ],
        solution: [
          'sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org',
          `echo 'server { listen 443 ssl; server_name shop.example.org www.shop.example.org; root /var/www/shop; index index.html; ssl_certificate ${LIVE}/fullchain.pem; ssl_certificate_key ${LIVE}/privkey.pem; }' | sudo tee -a /etc/nginx/sites-available/shop`,
          'sudo nginx -t',
          'sudo systemctl reload nginx',
          'curl -sI https://www.shop.example.org/',
        ],
        mistakes: [
          { commands: ['sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org -d example.org',
            `echo 'server { listen 443 ssl; server_name shop.example.org www.shop.example.org; root /var/www/shop; ssl_certificate ${LIVE}/fullchain.pem; ssl_certificate_key ${LIVE}/privkey.pem; }' | sudo tee -a /etc/nginx/sites-available/shop`,
            'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '多申請了 example.org：它的 DNS 指向公司官網的主機（198.51.100.80），不是 web-01，CA 的驗證逾時。只要有一個名稱失敗，整張憑證都不會簽發，nginx 也找不到憑證檔而無法通過 nginx -t。' },
          { commands: ['sudo certbot certonly --webroot -w /var/www/html -d shop.example.org -d www.shop.example.org'],
            why: 'webroot 寫成 /var/www/html：token 放在 nginx 沒有服務的目錄，CA 取回時得到 404（unauthorized），沒有取得憑證。-w 要和網站的 root 相同。' },
          { commands: ["echo 'server { listen 80; server_name shop.example.org www.shop.example.org; return 301 https://$host$request_uri; }' | sudo tee /etc/nginx/sites-available/shop",
            'sudo systemctl reload nginx', 'sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org'],
            why: '還沒有憑證就先把 80 埠全部轉到 https：CA 跟著轉址去連 443，那裡還沒有任何服務（Connection refused），驗證失敗。要先取得並裝好憑證，最後才加轉址。' },
          { commands: ['sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org'],
            why: '只取得憑證：certonly 不會改 nginx 的設定，443 埠沒有任何 server 區塊，網站仍然只有 http。' },
          { commands: ['sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org',
            `echo 'server { listen 443 ssl; server_name shop.example.org www.shop.example.org; root /var/www/shop; ssl_certificate ${LIVE}/fullchain.pem; ssl_certificate_key ${LIVE}/privkey.pem; }' | sudo tee -a /etc/nginx/sites-available/shop`,
            'sudo nginx -t'],
            why: '設定寫好、測試也通過，卻沒有 reload：執行中的 nginx 仍是舊設定，沒有在 443 埠服務。' },
        ],
        hints: [
          '`sudo certbot certonly --webroot -w /var/www/shop -d shop.example.org -d www.shop.example.org`：每個名稱一個 -d，-w 是 nginx 的 root。',
          'nginx 要送出完整的鏈：ssl_certificate 用 fullchain.pem，ssl_certificate_key 用 privkey.pem。',
          '`echo \'server { listen 443 ssl; server_name shop.example.org www.shop.example.org; root /var/www/shop; ssl_certificate …/fullchain.pem; ssl_certificate_key …/privkey.pem; }\' | sudo tee -a /etc/nginx/sites-available/shop`，接著 `sudo nginx -t` 與 `sudo systemctl reload nginx`。',
        ],
        explanation: 'certbot 在 /var/www/shop/.well-known/acme-challenge/ 放入 token，Let\'s Encrypt 經由公開 DNS 找到 203.0.113.20、從 80 埠取回，兩個名稱都通過後簽發一張 SAN 含兩個名稱的憑證，存在 /etc/letsencrypt/live/shop.example.org/。certonly 不碰網頁伺服器，所以要自己加上 443 的 server 區塊：ssl_certificate 用 fullchain.pem（葉憑證加中繼憑證），ssl_certificate_key 用 privkey.pem，都寫 live 底下的路徑，更新時才會自動換到新檔。nginx -t 確認設定與憑證、私鑰都讀得到而且配對，reload 之後 443 才開始服務。最後用 curl -sI https://www.shop.example.org/ 確認 200：curl 驗證了整條鏈與名稱。之後可以把 80 埠改成轉址到 https；取得憑證時若加上 --deploy-hook \'systemctl reload nginx\'（這個練習沒有要求），自動更新後 nginx 也會換上新憑證。',
      },
      {
        id: 'srv04-fix-chain', title: '讓伺服器送出完整的憑證鏈', machine: 'srv04-leaf',
        statement: 'web-01 的 HTTPS 已經上線，但監控用的 curl 回報 `SSL certificate problem: unable to get local issuer certificate`，有些瀏覽器卻打得開。請找出原因並修正 nginx 的設定，讓 `curl https://shop.example.org/` 通過憑證驗證。憑證與私鑰本身沒有問題，不要改動 /etc/letsencrypt 裡的任何檔案。模擬環境沒有編輯器：可以用 `printf \'第一行\\n第二行\\n\' | sudo tee 檔案` 整個重寫一個小檔案。',
        checks: [
          { kind: 'http', url: 'https://shop.example.org/', status: 200 },
          { kind: 'nginx', test: true, server: 'shop.example.org', port: 443, ssl: true },
          { kind: 'unchanged', path: '/etc/letsencrypt' },
        ],
        solution: [
          'cat /etc/nginx/snippets/shop-tls.conf',
          `printf 'ssl_certificate ${LIVE}/fullchain.pem;\\nssl_certificate_key ${LIVE}/privkey.pem;\\n' | sudo tee /etc/nginx/snippets/shop-tls.conf`,
          'sudo nginx -t',
          'sudo systemctl reload nginx',
          'curl -sI https://shop.example.org/',
        ],
        mistakes: [
          { commands: [`printf 'ssl_certificate ${LIVE}/fullchain.pem;\\nssl_certificate_key ${LIVE}/privkey.pem;\\n' | sudo tee /etc/nginx/snippets/shop-tls.conf`, 'sudo nginx -t'],
            why: '設定改對了卻沒有 reload：nginx 只在啟動與 reload 時讀取憑證檔，執行中的仍然只送葉憑證。' },
          { commands: [`printf 'ssl_certificate ${LIVE}/chain.pem;\\nssl_certificate_key ${LIVE}/privkey.pem;\\n' | sudo tee /etc/nginx/snippets/shop-tls.conf`, 'sudo nginx -t', 'sudo systemctl reload nginx'],
            why: '改成 chain.pem：它只有中繼憑證，和 privkey.pem 不配對（key values mismatch），nginx -t 失敗，reload 也失敗，舊設定繼續送出葉憑證。' },
          { commands: ['curl -k https://shop.example.org/'],
            why: '-k 只是讓這一次的 curl 不驗證憑證，伺服器送出的仍是不完整的鏈，其他用戶端照樣失敗。' },
          { commands: [`sudo cp ${LIVE}/fullchain.pem ${LIVE}/cert.pem`, 'sudo systemctl reload nginx'],
            why: '把 fullchain 複製蓋過 cert.pem：網站暫時能用，但改動了 certbot 管理的檔案（cert.pem 應該只有葉憑證，其他程式依賴它），下次更新時 certbot 換上新的 cert.pem，鏈又會斷掉。要改的是 nginx 的設定。' },
        ],
        hints: [
          '先用 `openssl s_client -connect shop.example.org:443 -servername shop.example.org` 看 Certificate chain 有幾張，再看 nginx 的設定用了哪個檔案（`cat /etc/nginx/snippets/shop-tls.conf`）。',
          'nginx 的 ssl_certificate 要用 fullchain.pem（葉憑證加中繼憑證），私鑰不變。',
          '`printf \'ssl_certificate …/fullchain.pem;\\nssl_certificate_key …/privkey.pem;\\n\' | sudo tee /etc/nginx/snippets/shop-tls.conf`，再 `sudo nginx -t` 與 `sudo systemctl reload nginx`。',
        ],
        explanation: 'snippet 把 ssl_certificate 指到 cert.pem，那個檔案只有葉憑證，所以伺服器只送一張；curl 的信任庫只有根憑證，找不到 R11 而回報錯誤 60（s_client 的判定是 21 unable to verify the first certificate）。瀏覽器可能用快取或 AIA 補上中繼憑證，所以「有些打得開」。改成 fullchain.pem 之後，nginx -t 確認憑證與私鑰配對，reload 讓 nginx 重新讀檔，curl -sI https://shop.example.org/ 回應 200；再用 s_client 看，Certificate chain 會有 0 與 1 兩張，Verify return code 是 0。/etc/letsencrypt 完全沒有改動，之後的更新照常運作。',
      },
      {
        id: 'srv04-expiring', title: '找出 30 天內到期的憑證', machine: 'srv04-intra',
        statement: 'intra-01 的 /etc/ssl/sites/ 放著幾個內部服務的憑證，它們不是由 certbot 管理，要手動更換。請寫一個指令（可以是一行的 for 迴圈），用 `openssl x509` 的 `-checkend` 判斷每個 .pem 檔，只印出 30 天內（2592000 秒）會到期或已經過期的檔案路徑，每行一個，依 `/etc/ssl/sites/*.pem` 展開的順序，不要印出其他文字。檢查時，你的指令也會在另外兩個日期（2026-12-15 與 2027-05-10）重新執行一次，所以直接打出檔名無法通過。',
        checks: [{ kind: 'output' }],
        solution: ['for f in /etc/ssl/sites/*.pem; do openssl x509 -in "$f" -noout -checkend 2592000 > /dev/null || echo "$f"; done'],
        variants: [
          { label: '2026-12-15 執行', files: [], now: '2026-12-15 10:00:00' },
          { label: '2027-05-10 執行', files: [], now: '2027-05-10 10:00:00' },
        ],
        mistakes: [
          { commands: ['for f in /etc/ssl/sites/*.pem; do openssl x509 -in "$f" -noout -checkend 30 > /dev/null || echo "$f"; done'],
            why: '-checkend 的單位是秒，不是天：30 秒內到期的只有已經過期的憑證，快到期的都漏掉了。30 天是 2592000 秒。' },
          { commands: ['for f in /etc/ssl/sites/*.pem; do openssl x509 -in "$f" -noout -checkend 2592000 || echo "$f"; done'],
            why: '沒有把 -checkend 自己的輸出丟掉：每個檔案都多印一行 Certificate will expire 或 will not expire，結果混在一起。' },
          { commands: ['for f in /etc/ssl/sites/*.pem; do openssl x509 -in "$f" -noout -checkend 2592000 > /dev/null && echo "$f"; done'],
            why: '把邏輯寫反了：-checkend 在「會到期」時結束碼是 1，&& 只在結束碼 0（不會到期）時執行，印出的是安全的那些。' },
          { commands: ['for f in /etc/ssl/sites/*.pem; do echo "$f $(openssl x509 -in $f -noout -enddate)"; done'],
            why: '只列出每張的到期日，還要人自己比對日期；題目要的是讓 -checkend 判斷，只印出需要處理的檔案。' },
        ],
        hints: [
          '`openssl x509 -in 檔案 -noout -checkend 2592000`：30 天內到期時結束碼是 1，否則是 0。',
          '`> /dev/null` 丟掉它印出的那一行，`|| echo "$f"` 只在結束碼不是 0 時印出檔名。',
          '`for f in /etc/ssl/sites/*.pem; do …; done` 依名稱順序處理每個檔案。',
        ],
        explanation: '迴圈對每個檔案執行 openssl x509 -checkend 2592000：憑證會在 30 天內到期（或已經過期）時結束碼是 1，|| echo "$f" 印出它的路徑；> /dev/null 丟掉 Certificate will expire 之類的文字，只留下檔名。2026-11-22 的結果是 pay.pem 與 wiki.pem；2026-12-15 多了 git.pem，wiki.pem 已經過期也照樣列出；2027-05-10 則是 git、pay、vpn 與 wiki。內部 CA 的 corp-ca.pem 效期十年，不會出現。把這一行放進每天執行的排程、有輸出就發警報，就是最基本的到期監控；網站實際送出的憑證則要用 s_client 從外面檢查。',
      },
      {
        id: 'srv04-auto-renew', title: '恢復自動更新並換上新憑證', machine: 'srv04-notimer',
        statement: '2027-01-20，web-01 的憑證只剩 18 天（2027-02-08 到期），原因是有人停用了 certbot.timer，這張憑證也沒有設定 deploy hook。請現在更新憑證，讓 nginx 實際送出新的憑證，並恢復自動更新：certbot.timer 要立刻開始執行，而且開機時會自動啟動。檢查也會在另一個時鐘（2027-02-10，舊憑證已經過期兩天）重播你的指令。',
        checks: [
          { kind: 'timer', unit: 'certbot.timer', active: true, enabled: true },
          { kind: 'http', url: 'https://shop.example.org/', status: 200 },
        ],
        solution: [
          'sudo certbot renew --dry-run',
          'sudo certbot renew',
          'sudo systemctl reload nginx',
          'sudo systemctl enable --now certbot.timer',
          'systemctl list-timers certbot.timer',
        ],
        variants: [{ label: '2027-02-10 才處理（舊憑證已過期）', files: [], now: '2027-02-10 10:00:00' }],
        mistakes: [
          { commands: ['sudo systemctl enable --now certbot.timer', 'sudo certbot renew'],
            why: '更新了檔案卻沒有 reload nginx：沒有 deploy hook，nginx 仍送出記憶體裡的舊憑證；等到舊憑證過期（另一個時鐘），網站就驗證失敗。' },
          { commands: ['sudo certbot renew', 'sudo systemctl reload nginx', 'sudo systemctl start certbot.timer'],
            why: 'start 只讓 timer 現在執行，沒有 enable，下次開機它又不會啟動，自動更新還是會再次停擺。' },
          { commands: ['sudo certbot renew --dry-run', 'sudo systemctl reload nginx', 'sudo systemctl enable --now certbot.timer'],
            why: '--dry-run 只是模擬，不寫入新的憑證；nginx reload 之後送出的仍是舊憑證。' },
          { commands: ['sudo certbot renew', 'sudo systemctl reload nginx', 'sudo systemctl enable certbot.timer'],
            why: 'enable 只建立開機時的連結，timer 現在並沒有在執行；要 `enable --now`（或再 start）。' },
        ],
        hints: [
          '`sudo certbot renew` 只更新 30 天內到期的憑證；這張剩 18 天，會被更新。可以先 `--dry-run` 確認驗證會成功。',
          'webroot 方式取得的憑證，更新後要 `sudo systemctl reload nginx`，nginx 才會讀新的檔案。',
          '`sudo systemctl enable --now certbot.timer` 同時設定開機啟動並立刻啟動；`systemctl list-timers certbot.timer` 確認下次觸發的時間。',
        ],
        explanation: 'certbot renew 發現憑證剩不到 30 天，經由 webroot 重新驗證並寫入新的 cert2.pem、fullchain2.pem，改好 live 的連結；但 nginx 只在 reload 時讀憑證，所以要 reload 之後網站才送出新憑證（效期到 2027-04-20）。在另一個時鐘裡舊憑證已經過期，reload 之前網站對所有用戶端都是錯誤 60，這正是「有 timer 卻沒有 reload」的後果。enable --now 讓 certbot.timer 立刻啟動並在開機時自動啟動，之後每天兩次檢查。為了讓下次更新也能自動生效，還應該加上 deploy hook：例如在 /etc/letsencrypt/renewal-hooks/deploy/ 放一個執行 systemctl reload nginx 的可執行檔，或之後取得憑證時加上 --deploy-hook \'systemctl reload nginx\'，也可以改用 --nginx 方式。',
      },
    ],
  },
};
