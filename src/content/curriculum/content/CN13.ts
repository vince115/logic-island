import type { NetworkScene, NodeTable, ProtocolHeader } from '@/lib/network/model';
import type { LessonContent } from '../schema';

/*
 * CN13 HTTPS and TLS (CN-3, network-sequence). Three fixed scenes: a TLS 1.3 full handshake after a TCP handshake
 * summary (record content types 22 and 23, legacy_record_version 0x0303, supported_versions 0x0304, an x25519
 * key_share, TLS_AES_128_GCM_SHA256) with each side's key state; certificate chain verification (leaf → intermediate →
 * root in the trust store) followed by an expired certificate and a certificate_expired alert; and HSTS (an http://
 * first visit redirected to https, the Strict-Transport-Security header, and a second visit sent straight to 443).
 * Message names follow RFC 8446, alerts RFC 8446 §6.2, HSTS RFC 6797. Addresses are the RFC 5737 documentation ranges,
 * names are example.com / example.org and the CAs are invented ("Example …"), so nothing names a real host or CA.
 * Today in the scenes is 2026-11-22.
 */

const C = '192.0.2.10', S = '203.0.113.80', OLD = '203.0.113.81';
const tcp = (from: string, to: string, flags: string): ProtocolHeader => ({ layer: 'transport', protocol: 'TCP', fields: [
  { name: '來源連接埠', value: from }, { name: '目的連接埠', value: to }, { name: '旗標', value: flags }] });
const ipv4 = (from: string, to: string): ProtocolHeader => ({ layer: 'network', protocol: 'IPv4', fields: [{ name: '來源 IP', value: from }, { name: '目的 IP', value: to }] });
/** A plaintext handshake record (content type 22), as ClientHello and ServerHello travel. */
const plainRecord = (message: string, fields: { name: string; value: string }[]): ProtocolHeader => ({ layer: 'application', protocol: 'TLS 1.3', fields: [
  { name: '內容類型', value: '22' }, { name: '類型名稱', value: 'handshake' }, { name: '紀錄版本', value: '0x0303' }, { name: '握手訊息', value: message }, ...fields] });
/** An encrypted record: the outside always says 23 (application_data); the real type is inside the encryption. */
const sealedRecord = (inner: string, innerType: string, key: string, fields: { name: string; value: string }[] = []): ProtocolHeader => ({
  layer: 'application', protocol: 'TLS 1.3', fields: [
    { name: '內容類型', value: '23' }, { name: '類型名稱', value: 'application_data' }, { name: '紀錄版本', value: '0x0303' },
    { name: '加密的內容', value: inner }, { name: '內層內容類型（加密）', value: innerType }, { name: '使用的金鑰', value: key }, ...fields] });

// ---- Scene 1: the TLS 1.3 handshake ------------------------------------------------------------------------------
const KEY_ROWS = ['臨時私鑰（x25519）', '共享秘密（ECDHE）', '握手流量金鑰', '應用流量金鑰'];
const keys = (node: 'client' | 'server', states: string[], changed: number[]): NodeTable => ({
  node, name: node === 'client' ? '用戶端的金鑰狀態' : '伺服器的金鑰狀態', head: ['項目', '狀態'],
  rows: KEY_ROWS.map((r, i) => [r, states[i]]), ...changed.length ? { changed } : {} });
const up = (tls: ProtocolHeader) => [tls, tcp('51514', '443', 'PSH, ACK'), ipv4(C, S)];
const down = (tls: ProtocolHeader) => [tls, tcp('443', '51514', 'PSH, ACK'), ipv4(S, C)];
const KEPT = '已產生，只留在本機';

/** Section 2: one full 1-RTT handshake to www.example.com, then the first HTTP request. */
const handshake: NetworkScene = {
  id: 'cn13-tls13-handshake', title: 'TLS 1.3 完整交握：從 ClientHello 到第一個加密的請求', model: 'tcp-ip',
  description: '瀏覽器（192.0.2.10）要開啟 https://www.example.com/（203.0.113.80:443）。TCP 連線建立後，雙方用 TLS 1.3 完整交握：一個來回就協商好演算法、交換臨時公鑰、驗證伺服器身分並導出金鑰。每一步注意紀錄外層的內容類型（22 是明文的交握，23 是加密的紀錄），以及兩端的金鑰表：什麼時候有了握手流量金鑰、什麼時候有了應用流量金鑰。',
  nodes: [
    { id: 'client', label: '瀏覽器', kind: 'host', addresses: [`IP ${C}`, 'TCP 51514'] },
    { id: 'server', label: 'www.example.com', kind: 'server', addresses: [`IP ${S}`, 'TCP 443', '憑證：ECDSA P-256'] },
  ],
  messages: [
    { id: 'tcp', from: 'client', to: 'server', label: 'TCP 三向交握（摘要）', headers: [tcp('51514', '443', 'SYN → SYN, ACK → ACK（三個區段）'), ipv4(C, S)],
      payload: '三個區段都沒有資料',
      note: 'TLS 跑在 TCP 之上，所以先完成 CN09 的三向交握，這裡合成一步：SYN、SYN, ACK、ACK，花掉一個 RTT。到這裡還沒有任何加密，連接埠 443 只是慣例上給 HTTPS 用的號碼。' },
    { id: 'client-hello', from: 'client', to: 'server', label: 'ClientHello',
      headers: up(plainRecord('ClientHello', [
        { name: 'legacy_version', value: '0x0303' },
        { name: 'cipher_suites', value: 'TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256' },
        { name: 'supported_versions', value: '0x0304, 0x0303' },
        { name: 'supported_groups', value: 'x25519, secp256r1' },
        { name: 'key_share', value: 'x25519：瀏覽器的臨時公鑰（32 位元組）' },
        { name: 'signature_algorithms', value: 'ecdsa_secp256r1_sha256, rsa_pss_rsae_sha256' },
        { name: 'server_name（SNI）', value: 'www.example.com' },
        { name: 'ALPN', value: 'h2, http/1.1' }])),
      payload: '明文：任何看得到封包的人都能讀到這些欄位',
      note: '瀏覽器先產生一組臨時的 x25519 金鑰對，把公鑰放進 key_share 一起送出，猜伺服器也會選 x25519，省下一次來回。紀錄外層的內容類型是 22（handshake），紀錄版本與 legacy_version 都寫 0x0303（TLS 1.2 的號碼，為了相容舊的中間設備；許多瀏覽器在第一個 ClientHello 的紀錄版本寫 0x0301，標準也允許），真正想用的版本放在 supported_versions 擴充：0x0304 就是 TLS 1.3。server_name（SNI）告訴伺服器要哪個網站的憑證，它是明文。',
      tables: [keys('client', [KEPT, '尚未算出', '尚未導出', '尚未導出'], [0])] },
    { id: 'server-hello', from: 'server', to: 'client', label: 'ServerHello',
      headers: down(plainRecord('ServerHello', [
        { name: 'legacy_version', value: '0x0303' },
        { name: 'cipher_suite', value: 'TLS_AES_128_GCM_SHA256' },
        { name: 'supported_versions', value: '0x0304' },
        { name: 'key_share', value: 'x25519：伺服器的臨時公鑰（32 位元組）' }])),
      payload: '明文（這是最後一個不加密的交握訊息）',
      note: '伺服器從瀏覽器的清單中選定 cipher suite TLS_AES_128_GCM_SHA256（AES-128-GCM 加密資料，SHA-256 用來導出金鑰與計算交握紀錄的雜湊），在 supported_versions 回 0x0304 表示用 TLS 1.3，並送出自己的臨時公鑰。兩邊各用「自己的臨時私鑰＋對方的臨時公鑰」算出同一個共享秘密（ECDHE），再以 HKDF 導出握手流量金鑰。路上的人看得到兩把公鑰，卻算不出共享秘密。從下一個訊息起，所有交握訊息都加密。',
      tables: [keys('server', [KEPT, '已算出', '已導出', '尚未導出'], [0, 1, 2]), keys('client', [KEPT, '已算出', '已導出', '尚未導出'], [1, 2])] },
    { id: 'encrypted-extensions', from: 'server', to: 'client', label: 'EncryptedExtensions（加密）',
      headers: down(sealedRecord('EncryptedExtensions', '22（handshake）', '伺服器握手流量金鑰', [{ name: 'ALPN（解密後）', value: 'http/1.1' }])),
      payload: '密文：路上只看得到外層的 23 與長度',
      note: '伺服器用握手流量金鑰加密其餘的擴充，例如選定的應用協定（ALPN）：這台伺服器只支援 HTTP/1.1。外層紀錄的內容類型寫 23（application_data），真正的類型 22（handshake）在加密的內層，所以路上的觀察者分不出這是交握還是資料。這幾個加密的交握訊息通常一起放在同一批 TCP 區段送出。' },
    { id: 'certificate', from: 'server', to: 'client', label: 'Certificate（加密）',
      headers: down(sealedRecord('Certificate', '22（handshake）', '伺服器握手流量金鑰', [{ name: '憑證清單（解密後）', value: '葉憑證 www.example.com、中繼憑證 Example Issuing CA 1' }])),
      payload: '密文：憑證在 TLS 1.3 裡也是加密送出的',
      note: '伺服器送出憑證鏈：自己的葉憑證，加上簽發它的中繼憑證。根憑證不送，瀏覽器要用自己信任儲存區裡的根憑證來驗證。在 TLS 1.2，憑證是明文；TLS 1.3 把它放進加密的紀錄。瀏覽器怎麼一路驗證到根憑證，是第二個情境的內容。' },
    { id: 'certificate-verify', from: 'server', to: 'client', label: 'CertificateVerify（加密）',
      headers: down(sealedRecord('CertificateVerify', '22（handshake）', '伺服器握手流量金鑰', [{ name: '簽章演算法（解密後）', value: 'ecdsa_secp256r1_sha256' }])),
      payload: '密文：對交握紀錄雜湊的簽章',
      note: '憑證是公開的，誰都可以把它轉送出去，所以伺服器還要證明自己握有憑證公鑰對應的私鑰：用私鑰對「到目前為止所有交握訊息的雜湊」（transcript hash）簽章。瀏覽器用葉憑證裡的公鑰驗證簽章。這把長期私鑰只用來簽章，不用來加密任何金鑰。' },
    { id: 'server-finished', from: 'server', to: 'client', label: 'Finished（伺服器，加密）',
      headers: down(sealedRecord('Finished', '22（handshake）', '伺服器握手流量金鑰', [{ name: 'verify_data（解密後）', value: '以 HMAC 計算的整段交握紀錄摘要' }])),
      payload: '密文',
      note: 'Finished 用 HMAC 對整段交握紀錄的雜湊算出 verify_data；只要有任何一個交握訊息在路上被改過，兩邊的值就對不上，交握失敗。伺服器送出 Finished 後就能導出應用流量金鑰；瀏覽器驗證這個 Finished 正確之後，也導出應用流量金鑰。',
      tables: [keys('server', [KEPT, '已算出', '已導出', '已導出'], [3]), keys('client', [KEPT, '已算出', '已導出', '已導出（驗證伺服器的 Finished 後）'], [3])] },
    { id: 'client-finished', from: 'client', to: 'server', label: 'Finished（用戶端，加密）',
      headers: up(sealedRecord('Finished', '22（handshake）', '用戶端握手流量金鑰', [{ name: 'verify_data（解密後）', value: '以 HMAC 計算的整段交握紀錄摘要' }])),
      payload: '密文',
      note: '瀏覽器送出自己的 Finished，仍用握手流量金鑰加密。伺服器驗證通過，交握完成，之後只用應用流量金鑰。臨時私鑰在算出共享秘密後就用不到了，實作會把它刪除（最晚在這時）；刪掉之後，連雙方自己都無法再算出這次的金鑰，這就是前向保密的基礎。從 ClientHello 到這裡，TLS 只多花了一個 RTT。',
      tables: [keys('client', ['已刪除', '已用完', '交握完成，不再使用', '已導出'], [0, 1, 2]), keys('server', ['已刪除', '已用完', '交握完成，不再使用', '已導出'], [0, 1, 2])] },
    { id: 'http-request', from: 'client', to: 'server', label: '加密的 HTTP 請求',
      headers: up(sealedRecord('HTTP 請求', '23（application_data）', '用戶端應用流量金鑰')),
      payload: '加密前：GET / HTTP/1.1\nHost: www.example.com\nCookie: session=…',
      note: 'HTTP 請求（方法、路徑、所有標頭、Cookie）整個被 AES-128-GCM 加密，並附上驗證標籤：路上的人讀不到，也改不了（改一個位元，解密時就驗證失敗）。他看得到的只剩 IP 與 TCP 標頭、外層的內容類型 23、紀錄長度和送出的時間。' },
  ],
};

// ---- Scene 2: walking the certificate chain, then an expired certificate -----------------------------------------
const CHAIN_HEAD = ['憑證', '主體', '簽發者', '有效期間', '有效', '簽章與信任'];
const INTERMEDIATE = ['中繼憑證', 'Example Issuing CA 1', 'Example Root CA', '2024-03-01 至 2029-03-01', '是', '用根憑證的公鑰驗證簽章：正確'];
const ROOT = ['根憑證', 'Example Root CA', 'Example Root CA（自簽）', '2020-01-01 至 2040-01-01', '是', '在瀏覽器的信任儲存區裡（伺服器沒有送）'];
const toBrowser = (from: string, port: string, tls: ProtocolHeader) => [tls, tcp('443', port, 'PSH, ACK'), ipv4(from, C)];

/** Section 4: the chain of www.example.com, then old.example.com's expired leaf and the alert that ends it. */
const chain: NetworkScene = {
  id: 'cn13-cert-chain', title: '驗證憑證鏈：一次成功、一次過期', model: 'tcp-ip',
  description: '今天是 2026-11-22。瀏覽器先連 www.example.com，在加密的 Certificate 訊息裡收到葉憑證與中繼憑證，逐張檢查主體、簽發者、有效期間與簽章，一路走到信任儲存區裡的根憑證；接著用 CertificateVerify 確認對方握有私鑰。之後瀏覽器連 old.example.com，那台伺服器的憑證已經過期。看瀏覽器的檢查表在哪一列出問題，以及它怎麼中止連線。',
  nodes: [
    { id: 'browser', label: '瀏覽器', kind: 'host', addresses: [`IP ${C}`, '信任儲存區：Example Root CA 等根憑證'] },
    { id: 'www', label: 'www.example.com', kind: 'server', addresses: [`IP ${S}`, 'TCP 443'] },
    { id: 'old', label: 'old.example.com', kind: 'server', addresses: [`IP ${OLD}`, 'TCP 443'] },
  ],
  messages: [
    { id: 'cert-www', from: 'www', to: 'browser', label: 'Certificate（www.example.com）',
      headers: toBrowser(S, '51514', sealedRecord('Certificate', '22（handshake）', '伺服器握手流量金鑰', [{ name: '憑證數', value: '2（葉憑證、中繼憑證）' }])),
      payload: '葉憑證 CN=www.example.com；中繼憑證 CN=Example Issuing CA 1',
      note: '瀏覽器解密後拿到兩張憑證，從葉憑證往上走：葉憑證的 SAN 有 www.example.com，和要連的主機名稱相符；它的簽發者是 Example Issuing CA 1，就用中繼憑證裡的公鑰驗證葉憑證上的簽章。中繼憑證的簽發者是 Example Root CA，伺服器沒有送這張，瀏覽器在自己的信任儲存區找到它，用它的公鑰驗證中繼憑證的簽章。根憑證是自簽的，它可信不是因為簽章，而是因為作業系統或瀏覽器預先放進了信任儲存區。每一張都在有效期間內，整條鏈通過。',
      tables: [
        { node: 'browser', name: '憑證鏈檢查（www.example.com）', head: CHAIN_HEAD, changed: [0, 1, 2], rows: [
          ['葉憑證', 'www.example.com', 'Example Issuing CA 1', '2026-09-01 至 2026-11-30', '是', '用中繼憑證的公鑰驗證簽章：正確'], INTERMEDIATE, ROOT] },
        { node: 'browser', name: '葉憑證的欄位', head: ['欄位', '值'], changed: [0, 1, 2, 3, 4, 5], rows: [
          ['主體（Subject）', 'CN=www.example.com'], ['主體別名（SAN）', 'DNS:www.example.com, DNS:example.com'], ['簽發者（Issuer）', 'CN=Example Issuing CA 1'],
          ['有效期間', 'Not Before 2026-09-01，Not After 2026-11-30'], ['公鑰', 'ECDSA P-256'], ['主機名稱比對', 'www.example.com 在 SAN 裡：相符']] },
      ] },
    { id: 'cv-www', from: 'www', to: 'browser', label: 'CertificateVerify（www.example.com）',
      headers: toBrowser(S, '51514', sealedRecord('CertificateVerify', '22（handshake）', '伺服器握手流量金鑰', [{ name: '簽章演算法', value: 'ecdsa_secp256r1_sha256' }])),
      payload: '對交握紀錄雜湊的 ECDSA 簽章',
      note: '憑證鏈只證明「這把公鑰屬於 www.example.com」。伺服器接著用對應的私鑰簽署交握紀錄的雜湊，瀏覽器用葉憑證的公鑰驗證成功，才確定對面真的是 www.example.com，而不是一個轉送了別人憑證的中間人。之後伺服器送出 Finished，交握照第一個情境完成。',
      tables: [{ node: 'browser', name: '伺服器身分', head: ['主機', '憑證鏈', '持有私鑰', '結論'], changed: [0], rows: [['www.example.com', '通過', '已證明（CertificateVerify 正確）', '身分確認']] }] },
    { id: 'cert-old', from: 'old', to: 'browser', label: 'Certificate（old.example.com）',
      headers: toBrowser(OLD, '51530', sealedRecord('Certificate', '22（handshake）', '伺服器握手流量金鑰', [{ name: '憑證數', value: '2（葉憑證、中繼憑證）' }])),
      payload: '葉憑證 CN=old.example.com；中繼憑證 CN=Example Issuing CA 1',
      note: '另一條連線，連到 old.example.com。名稱相符、簽章也都正確，但葉憑證的有效期間到 2026-10-30 為止，今天 2026-11-22 已經過了。有效期間是 CA 簽進憑證裡的，過期後 CA 不再為它擔保，也不再更新它的撤銷狀態，所以瀏覽器把過期當成驗證失敗，不會因為「其他都對」就接受。',
      tables: [{ node: 'browser', name: '憑證鏈檢查（old.example.com）', head: CHAIN_HEAD, changed: [0], rows: [
        ['葉憑證', 'old.example.com', 'Example Issuing CA 1', '2026-08-01 至 2026-10-30', '否（2026-10-30 已過期）', '用中繼憑證的公鑰驗證簽章：正確'], INTERMEDIATE, ROOT] }] },
    { id: 'alert-old', from: 'browser', to: 'old', label: 'Alert：certificate_expired',
      headers: [sealedRecord('Alert', '21（alert）', '用戶端握手流量金鑰', [{ name: '警示等級', value: 'fatal' }, { name: '警示描述', value: 'certificate_expired' }, { name: '描述代碼', value: '45' }]), tcp('51530', '443', 'PSH, ACK'), ipv4(C, OLD)],
      payload: '密文：警示本身也在加密的紀錄裡',
      note: '依 RFC 8446，驗證失敗的一方以警示（alert）中止交握：描述 certificate_expired（代碼 45）表示憑證過期或還沒生效。這時雙方已經有握手流量金鑰，所以警示也加密，外層一樣是 23，內層類型是 21（alert）。連線就此結束，瀏覽器不會送出任何 HTTP 請求，畫面改為警告頁（Chrome 顯示 NET::ERR_CERT_DATE_INVALID）。',
      tables: [{ node: 'browser', name: '伺服器身分', head: ['主機', '憑證鏈', '持有私鑰', '結論'], changed: [1], rows: [
        ['www.example.com', '通過', '已證明（CertificateVerify 正確）', '身分確認'], ['old.example.com', '失敗：葉憑證已過期', '未檢查（交握已中止）', '中止連線，顯示警告頁']] }] },
  ],
};

// ---- Scene 3: HSTS ---------------------------------------------------------------------------------------------
const HSTS_HEAD = ['主機', 'max-age（秒）', 'includeSubDomains', '到期日'];
const EARLIER = ['accounts.example.org', '63072000', '是', '2028-05-03'];
const WWW_ENTRY = ['www.example.com', '31536000', '是', '2027-11-22'];
const http11 = (fields: { name: string; value: string }[]): ProtocolHeader => ({ layer: 'application', protocol: 'HTTP/1.1', fields });
const tlsRecord: ProtocolHeader = { layer: 'presentation', protocol: 'TLS 1.3', fields: [{ name: '內容類型', value: '23' }, { name: '類型名稱', value: 'application_data' }, { name: '紀錄版本', value: '0x0303' }] };
const hstsTable = (rows: string[][], changed?: number): NodeTable[] => [{ node: 'browser', name: '瀏覽器的 HSTS 清單', head: HSTS_HEAD, rows, ...changed === undefined ? {} : { changed: [changed] } }];

/** Section 6: the first visit over http:// is redirected, the HTTPS response sets HSTS, the second visit skips port 80. */
const hsts: NetworkScene = {
  id: 'cn13-hsts', title: 'HSTS：第一次被轉址，第二次直接走 HTTPS', model: 'osi',
  description: '2026-11-22，使用者點了一個舊連結 http://www.example.com/。瀏覽器的 HSTS 清單裡還沒有這個網站，只好先用明文 HTTP 連 80 連接埠，被 301 轉址到 https，HTTPS 回應帶著 Strict-Transport-Security 標頭。一週後使用者又點了 http://www.example.com/news，這次瀏覽器在送出前就改成 https。這個情境用 OSI 七層畫，HTTP 在應用層、TLS 在表現層（和 CN01 相同），才能同時看到 HTTP 標頭與外面的 TLS 紀錄；TCP 與 TLS 的交握省略。',
  nodes: [
    { id: 'browser', label: '瀏覽器', kind: 'host', addresses: [`IP ${C}`] },
    { id: 'server', label: 'www.example.com', kind: 'server', addresses: [`IP ${S}`, 'TCP 80（只做轉址）', 'TCP 443（HTTPS）'] },
  ],
  messages: [
    { id: 'http-first', from: 'browser', to: 'server', label: '第一次：GET http://（明文）',
      headers: [http11([{ name: '方法', value: 'GET' }, { name: '路徑', value: '/' }, { name: 'Host', value: 'www.example.com' }]), tcp('51600', '80', 'PSH, ACK'), ipv4(C, S)],
      payload: 'GET / HTTP/1.1\nHost: www.example.com',
      note: '網址是 http://，HSTS 清單裡也沒有 www.example.com，瀏覽器只能照網址用明文 HTTP 連 80 連接埠。沒有 TLS 紀錄：路徑、標頭與 Cookie 全部是明文，路上的人看得到，也改得了。',
      tables: hstsTable([EARLIER]) },
    { id: 'redirect', from: 'server', to: 'browser', label: '301 轉址到 https://（明文）',
      headers: [http11([{ name: '狀態碼', value: '301 Moved Permanently' }, { name: 'Location', value: 'https://www.example.com/' }]), tcp('80', '51600', 'PSH, ACK'), ipv4(S, C)],
      payload: 'HTTP/1.1 301 Moved Permanently\nLocation: https://www.example.com/',
      note: '伺服器在 80 連接埠只做一件事：叫瀏覽器改用 https。這個轉址本身是明文，攻擊者若在路上，可以把它拿掉，讓使用者一直留在 http（SSL stripping）。就算伺服器在這個明文回應裡加上 Strict-Transport-Security，瀏覽器也會忽略：只有透過 HTTPS 收到的 HSTS 標頭才算數。' },
    { id: 'https-first', from: 'browser', to: 'server', label: '第一次：GET https://（加密）',
      headers: [http11([{ name: '方法', value: 'GET' }, { name: '路徑', value: '/' }, { name: 'Host', value: 'www.example.com' }]), tlsRecord, tcp('51601', '443', 'PSH, ACK'), ipv4(C, S)],
      payload: 'GET / HTTP/1.1\nHost: www.example.com（在 TLS 紀錄裡加密）',
      note: '瀏覽器照 Location 改連 443，完成 TCP 與 TLS 交握（省略）後送出請求。應用層的 HTTP 請求現在包在表現層的 TLS 紀錄裡，路上只看得到外層的內容類型 23。' },
    { id: 'hsts-header', from: 'server', to: 'browser', label: '200 OK＋Strict-Transport-Security',
      headers: [http11([{ name: '狀態碼', value: '200 OK' }, { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]), tlsRecord, tcp('443', '51601', 'PSH, ACK'), ipv4(S, C)],
      payload: 'HTTP/1.1 200 OK\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nContent-Type: text/html',
      note: '這個回應是透過有效憑證的 HTTPS 收到的，瀏覽器記下 HSTS：max-age=31536000 秒（365 天），從 2026-11-22 起算到 2027-11-22；includeSubDomains 表示 www.example.com 底下的子網域也一樣。之後每次透過 HTTPS 收到這個標頭，期限都會重新起算。',
      tables: hstsTable([EARLIER, WWW_ENTRY], 1) },
    { id: 'second-visit', from: 'browser', to: 'server', label: '一週後：直接 GET https://（加密）',
      headers: [http11([{ name: '方法', value: 'GET' }, { name: '路徑', value: '/news' }, { name: 'Host', value: 'www.example.com' }]), tlsRecord, tcp('51702', '443', 'PSH, ACK'), ipv4(C, S)],
      payload: 'GET /news HTTP/1.1\nHost: www.example.com（在 TLS 紀錄裡加密）',
      note: '2026-11-29，使用者點了 http://www.example.com/news。瀏覽器查到 HSTS 清單裡有 www.example.com、還沒到期，在送出任何封包之前就把網址改成 https://，直接連 443；80 連接埠上沒有任何明文請求，攻擊者沒有機會攔截轉址（Chrome 的開發人員工具把這次改寫顯示成 307 Internal Redirect）。HSTS 生效期間如果憑證有問題，瀏覽器也不提供「繼續前往」的選項。',
      tables: hstsTable([EARLIER, WWW_ENTRY]) },
  ],
};

/** CN13 HTTPS and TLS (network-sequence): scenes and exercises checked by the network capability. */
export const CN13: LessonContent = {
  lessonId: 'CN13',
  motivation: '你在咖啡店連上公共 Wi-Fi 登入網路銀行，同一個網路上的任何人都收得到你的封包，Wi-Fi 的管理者還能把封包改掉再轉送。網址列的 https 承諾的是：他們讀不到你的密碼、改不了網頁內容，而且你連到的確實是那家銀行。這一課拆開這個承諾：對稱與非對稱加密怎麼分工、憑證與 CA 怎麼證明伺服器的身分、TLS 1.3 交握如何在一個來回內建立加密通道，以及 HSTS 怎麼防止你被悄悄降回 http。最後你會看懂瀏覽器的憑證資訊與警告，也能說清楚 HTTPS 保護了什麼、沒保護什麼。',
  sections: [
    {
      id: 'crypto-basics', title: '對稱加密、非對稱加密與雜湊：各做各的事',
      blocks: [
        { type: 'p', text: 'HTTPS 就是 HTTP 跑在 TLS（Transport Layer Security）之上。TLS 要同時做到三件事：機密性（別人讀不到）、完整性（別人改了會被發現）與身分驗證（確定對方是誰）。沒有一種密碼學工具能單獨完成這三件事，TLS 組合了三類工具：對稱加密、非對稱（公開金鑰）密碼學與雜湊函數。' },
        { type: 'table', head: ['比較項目', '對稱加密', '非對稱（公開金鑰）密碼學'], rows: [
          ['金鑰', '雙方共用同一把秘密金鑰，加密和解密用同一把', '一對金鑰：公鑰可以公開給任何人，私鑰只有擁有者知道'],
          ['速度', '很快，現代 CPU 多半有 AES 指令加速，適合加密大量資料', '慢得多，只用在少量資料上'],
          ['難題', '雙方事先要怎麼安全地拿到同一把金鑰', '拿到的公鑰真的是對方的嗎（要靠憑證）'],
          ['在 TLS 1.3 的用途', '加密交握的後半段與所有應用資料', '金鑰交換（ECDHE）與數位簽章（伺服器證明身分）'],
          ['常見演算法', 'AES-128-GCM、AES-256-GCM、ChaCha20-Poly1305', 'X25519 與 ECDH（金鑰交換）、ECDSA、RSA-PSS、Ed25519（簽章）'],
        ] },
        { type: 'p', text: '雜湊函數（例如 SHA-256）不用金鑰：任意長度的輸入都得到固定長度的摘要，同樣的輸入一定得到同樣的摘要，改一個位元摘要就完全不同，而且無法從摘要倒推出原文。雜湊不是加密，因為它根本解不回來。TLS 用雜湊做三件事：把整段交握訊息濃縮成一個摘要（transcript hash）讓雙方核對、搭配金鑰做 HMAC（Finished 訊息），以及透過 HKDF 從共享秘密導出各種金鑰。簽章也是先算雜湊，再對摘要簽章。' },
        { type: 'p', text: '所以 TLS 是混合加密：先用非對稱密碼學在不安全的網路上協商出一把只有兩端知道的秘密，並驗證伺服器的身分；再用這把秘密導出對稱金鑰，加密之後所有的資料。cipher suite 的名字就寫出了這個分工：TLS_AES_128_GCM_SHA256 表示資料用 AES-128-GCM 加密，SHA-256 是交握雜湊與金鑰導出用的雜湊函數；金鑰交換與簽章演算法在 TLS 1.3 另外協商，不寫在 cipher suite 裡。' },
        { type: 'callout', tone: 'note', title: 'AEAD：加密與防竄改一次完成', text: 'TLS 1.3 只允許 AEAD（附帶驗證的加密）演算法，例如 AES-GCM 與 ChaCha20-Poly1305。每筆紀錄加密時同時算出一個驗證標籤，接收端解密時一併檢查；密文被改了一個位元，驗證就失敗，紀錄直接被丟棄並中止連線。完整性不必再另外加一道檢查。' },
      ],
    },
    {
      id: 'tls13-handshake', title: 'TLS 1.3 交握：一個來回建立加密通道',
      blocks: [
        { type: 'p', text: 'TCP 連線建好之後（CN09），TLS 交握要讓兩端在不安全的網路上同意演算法、算出共同的秘密，並讓用戶端確認伺服器的身分。TLS 1.3 的完整交握只要一個來回（1-RTT），TLS 1.2 要兩個。順序如下：' },
        { type: 'list', ordered: true, items: [
          'ClientHello（明文）：用戶端列出支援的 cipher suites、在 supported_versions 表明支援 TLS 1.3（0x0304），並在 key_share 直接附上一把臨時公鑰（例如 x25519），在 server_name（SNI）寫上要連的主機名稱。',
          'ServerHello（明文）：伺服器選定 cipher suite，回 supported_versions 0x0304 與自己的臨時公鑰。到這裡雙方都能算出共享秘密，導出握手流量金鑰。',
          'EncryptedExtensions、Certificate、CertificateVerify、Finished（全部加密）：伺服器送出其餘設定、憑證鏈、用私鑰對交握紀錄的簽章，以及證明交握沒被竄改的 Finished。',
          'Finished（用戶端，加密）：用戶端驗證憑證與簽章後送出自己的 Finished，交握完成；雙方改用應用流量金鑰加密 HTTP。',
        ] },
        { type: 'p', text: 'TLS 的每個訊息都裝在「紀錄」（record）裡，紀錄標頭有 5 個位元組：內容類型 1 個位元組、紀錄版本 2 個位元組、長度 2 個位元組。內容類型 22 是 handshake、23 是 application_data、21 是 alert。ServerHello 之後的紀錄全部加密，外層一律寫 23，真正的類型藏在加密的內層，所以路上的觀察者看不出一筆紀錄是交握、資料還是警示。紀錄版本在 TLS 1.3 固定寫 0x0303（TLS 1.2 的號碼），真正的版本靠 supported_versions 擴充協商，因為許多舊的防火牆與中間設備看到陌生的版本號就會把連線擋掉。' },
        { type: 'example', id: 'cn13-tls13-handshake' },
        { type: 'callout', tone: 'note', title: '實際抓包時多出來的 change_cipher_spec', text: '用 Wireshark 看真實的 TLS 1.3 連線，常會在 ServerHello 後面看到一筆內容類型 20 的 change_cipher_spec 紀錄。TLS 1.3 本身不用它，那是「中間設備相容模式」：讓連線看起來像 TLS 1.2 的恢復連線，免得舊設備誤判。接收端收到後直接忽略。' },
        { type: 'p', text: '和 TLS 1.2 相比，TLS 1.3 也拿掉了很多舊東西：不再支援 RSA 金鑰傳輸、CBC 模式、RC4 與壓縮，交握的簽章也不能再用 SHA-1，cipher suite 只剩五個（常用的是 TLS_AES_128_GCM_SHA256、TLS_AES_256_GCM_SHA384、TLS_CHACHA20_POLY1305_SHA256）。可選的東西變少，設定錯誤的機會也變少。' },
      ],
    },
    {
      id: 'forward-secrecy', title: '(EC)DHE 與前向保密',
      blocks: [
        { type: 'p', text: 'ECDHE（Elliptic Curve Diffie-Hellman Ephemeral）讓兩端在公開的網路上算出同一個秘密：每一方產生一組臨時金鑰對，只把公鑰送出去；各自用「自己的私鑰＋對方的公鑰」計算，得到相同的共享秘密。路上的人看到兩把公鑰，卻無法算出共享秘密，因為那需要其中一把私鑰。DHE 是同樣的想法用在有限體上，括號寫成 (EC)DHE 表示兩種都算。Ephemeral（臨時）是關鍵：這組金鑰對每條連線重新產生，用完就刪除。' },
        { type: 'p', text: '前向保密（forward secrecy）指的是：就算伺服器的長期私鑰（憑證對應的那把）日後外洩，過去錄下來的連線也解不開。TLS 1.3 的完整交握一律使用 (EC)DHE，憑證私鑰只用來簽 CertificateVerify，從不參與加密金鑰；連線的金鑰來自早已刪除的臨時私鑰，事後沒有任何人能重算。偷到憑證私鑰的人可以冒充伺服器、攔截之後的新連線（直到憑證被撤銷），但讀不到以前的流量。' },
        { type: 'table', head: ['比較項目', 'TLS 1.2 的 RSA 金鑰傳輸', 'TLS 1.3 的 (EC)DHE'], rows: [
          ['秘密怎麼來', '用戶端產生秘密，用伺服器憑證的 RSA 公鑰加密後送過去', '兩端各出一組臨時金鑰對，各自算出共享秘密'],
          ['伺服器長期私鑰的角色', '用來解開每條連線的秘密', '只用來簽章，證明身分'],
          ['私鑰日後外洩', '錄下來的所有連線都能被解密', '過去的連線仍然安全（前向保密）'],
          ['TLS 1.3 是否支援', '已移除', '完整交握的唯一方式'],
        ] },
        { type: 'p', text: '0-RTT 只在這裡提一下：用戶端若之前連過這台伺服器，保存了伺服器在交握後送來的 NewSessionTicket，下次可以在 ClientHello 裡就附上加密的早期資料（early data），不用等任何來回。代價是早期資料可能被攻擊者錄下來重送（replay），而且它只用之前的恢復金鑰加密，沒有前向保密，所以通常只用在像 GET 這種重送也無害的請求。' },
      ],
    },
    {
      id: 'certificates', title: '數位憑證與 CA 信任鏈',
      blocks: [
        { type: 'p', text: 'ECDHE 解決了「怎麼在路上協商秘密」，卻沒有回答「跟我協商的是誰」。中間人可以分別和你、和真正的伺服器各做一次 ECDHE，在中間解密再轉送。數位憑證把一個名稱和一把公鑰綁在一起，並由憑證授權機構（CA，Certificate Authority）用自己的私鑰簽章擔保。網站用的是 X.509 v3 格式，瀏覽器會看這些欄位：' },
        { type: 'table', head: ['欄位', '內容', '瀏覽器怎麼用'], rows: [
          ['主體（Subject）', '憑證屬於誰，例如 CN=www.example.com', '顯示用；比對主機名稱時瀏覽器看的是 SAN'],
          ['主體別名（SAN）', '這張憑證適用的主機名稱清單，可含萬用字元 *.example.com', '要連的主機名稱必須在清單裡，否則是名稱不符'],
          ['簽發者（Issuer）', '簽這張憑證的 CA 的名稱', '依它找到上一層憑證，用那張憑證的公鑰驗證簽章'],
          ['有效期間（Not Before、Not After）', '從哪一天到哪一天有效', '今天不在期間內就是驗證失敗'],
          ['公鑰（Subject Public Key Info）', '演算法與公鑰本身，例如 ECDSA P-256', '驗證 CertificateVerify 的簽章'],
          ['序號、簽章演算法與簽章', 'CA 給的編號，以及 CA 對整張憑證內容的簽章', '序號用來查撤銷；簽章證明內容沒被改過'],
        ] },
        { type: 'p', text: '瀏覽器不可能認識每一家 CA 簽的每一張憑證，所以信任是一條鏈：網站的葉憑證由中繼 CA 簽發，中繼憑證由根 CA 簽發，根憑證是自簽的，預先放在作業系統或瀏覽器的信任儲存區（trust store）裡。伺服器送出葉憑證與中繼憑證，不送根憑證：就算送了也沒用，信任只能來自本機的儲存區。驗證時從葉憑證往上，每一張都用簽發者的公鑰檢查簽章、確認在有效期間內、確認中繼憑證被標明可以簽發憑證，最後一張必須接到信任儲存區裡的根憑證。另外葉憑證的 SAN 要有你要連的主機名稱，瀏覽器也會檢查憑證是否已被撤銷。' },
        { type: 'p', text: '下面的情境先走過 www.example.com 的整條鏈，再連到憑證過期的 old.example.com。注意根憑證那一列的「簽章與信任」：它可信不是因為簽章，而是因為它在儲存區裡。' },
        { type: 'example', id: 'cn13-cert-chain' },
        { type: 'callout', tone: 'tip', title: '在瀏覽器裡看憑證', text: '點網址列左側的網站資訊圖示，打開連線安全的資訊，再選擇查看憑證，就會出現憑證檢視器（各瀏覽器的用詞略有不同）。一般頁面列出主體、簽發者、有效期間與 SHA-256 指紋；詳細資料頁面可以看到 SAN、公鑰演算法，以及憑證階層：最上面是根憑證，中間是中繼憑證，最下面是網站的葉憑證。' },
      ],
    },
    {
      id: 'warnings', title: '憑證錯誤與混合內容警告',
      blocks: [
        { type: 'p', text: '憑證驗證只要有一項失敗，瀏覽器就中止交握，改顯示全頁的警告。警告的種類告訴你哪一項沒通過，也暗示了風險有多大。以 Chrome 的錯誤代碼為例：' },
        { type: 'table', head: ['警告', '哪一項檢查失敗', '可能的原因與風險'], rows: [
          ['NET::ERR_CERT_DATE_INVALID', '有效期間：已過期或還沒生效', '常見原因是管理者忘了更新憑證，或你的電腦時鐘不對；但過期的憑證 CA 已不再擔保，不能當成安全'],
          ['NET::ERR_CERT_COMMON_NAME_INVALID', '名稱比對：要連的主機名稱不在 SAN 裡', '可能只是設定錯誤，也可能有人攔截連線、拿別的網站的憑證冒充'],
          ['NET::ERR_CERT_AUTHORITY_INVALID', '信任鏈：接不到信任儲存區的根憑證（自簽或不認識的 CA）', '公共 Wi-Fi 的攔截設備或中間人常造成這種警告，登入或付款前看到要立刻停止'],
          ['NET::ERR_CERT_REVOKED', '撤銷狀態：CA 已撤銷這張憑證', '通常是私鑰外洩或憑證誤發，拿著它的人可能不是網站本人'],
        ] },
        { type: 'p', text: '混合內容（mixed content）是另一種警告：頁面本身用 HTTPS 載入，卻用 http:// 載入其中的資源。腳本、樣式表、iframe 與 fetch 這類「主動」內容能改變整個頁面，一份被竄改的明文腳本就能讀走頁面上的所有東西，所以瀏覽器直接封鎖，並在開發人員工具的主控台顯示 Mixed Content 警告。圖片、音訊、影片這類「被動」內容，新版瀏覽器會先自動改用 https 載入，載入失敗就不顯示。修正方法是把資源網址都改成 https，或在回應加上 Content-Security-Policy: upgrade-insecure-requests，讓瀏覽器自動升級。' },
        { type: 'callout', tone: 'warning', title: '常見誤解：有鎖頭就代表網站可信', text: '鎖頭（或通過驗證的連線標示）只表示：你和「持有這個網域憑證的人」之間的連線是加密的。CA 簽發網域驗證（DV）憑證時只確認申請人控制這個網域，不審查網站的內容或意圖，申請又免費又自動。把 example.com 的字母 l 換成數字 1 的仿冒網域，一樣可以有完全有效的憑證和鎖頭；它安全地把你的密碼送給了騙子。要看的是網址列的網域名稱是不是你要去的網站。Chrome 在 2023 年把鎖頭改成中性的設定圖示，正是因為太多人把鎖頭誤解成「這個網站值得信任」。' },
      ],
    },
    {
      id: 'hsts-and-scope', title: 'HSTS，以及 HTTPS 沒保護的東西',
      blocks: [
        { type: 'p', text: '就算網站把所有 http 請求都轉址到 https，第一個明文請求和那個轉址仍然暴露在外：攻擊者可以攔下轉址，自己和網站用 HTTPS 溝通，卻和你繼續用 http（SSL stripping），網址列只少了一個 s。HSTS（HTTP Strict Transport Security，RFC 6797）讓網站告訴瀏覽器「以後只准用 HTTPS 連我」：回應標頭 Strict-Transport-Security: max-age=31536000; includeSubDomains 表示在 31536000 秒（一年）內，這個主機與它的子網域都只能用 HTTPS。瀏覽器記住之後，遇到 http:// 的網址會在送出之前就改寫成 https://，憑證有錯時也不再讓使用者點「繼續前往」。這個標頭只有透過 HTTPS 收到才有效。' },
        { type: 'example', id: 'cn13-hsts' },
        { type: 'p', text: 'HSTS 有一個先天的漏洞：第一次造訪（或記錄過期之後）瀏覽器還不知道這個網站要求 HTTPS，那一次的明文請求仍然可以被攔截。解法是 HSTS 預載清單（preload list）：瀏覽器出廠就內建一份必須用 HTTPS 的網域清單。網站要申請加入，必須能用有效憑證提供 HTTPS、把 http 轉址到 https、所有子網域都支援 HTTPS，並送出 max-age 至少 31536000、帶 includeSubDomains 與 preload 的 HSTS 標頭。有些頂級網域（例如 .dev、.app）整個都在預載清單裡。' },
        { type: 'p', text: '最後要分清楚 HTTPS 保護的範圍。TLS 加密的是 TCP 之上的內容，所以 HTTP 的一切都被保護；但為了讓封包送得到、讓伺服器知道要拿哪個網站的憑證，有些資訊仍然在外面：' },
        { type: 'table', head: ['資訊', 'HTTPS 有保護嗎', '說明'], rows: [
          ['網址的路徑與查詢字串（/account?id=7）', '有，加密', '在 HTTP 請求行裡，整個被加密'],
          ['HTTP 標頭（Cookie、Authorization）與內容', '有，加密', '登入的密碼、表單、網頁內容都在加密的紀錄裡'],
          ['資料有沒有被竄改', '有，會被發現', 'AEAD 的驗證標籤讓任何修改都導致解密失敗'],
          ['對方是不是那個網域', '有，靠憑證驗證', '憑證鏈＋CertificateVerify 證明伺服器握有該網域的私鑰'],
          ['兩端的 IP 位址與連接埠', '沒有', '在 IP 與 TCP 標頭裡，路由器要靠它們轉送'],
          ['連到哪個主機名稱（SNI）', '沒有（一般情況）', 'ClientHello 的 server_name 是明文；ECH（Encrypted Client Hello）可以加密它，但需要兩端都支援，還不普遍'],
          ['DNS 查詢', '沒有（除非用 DoH 或 DoT）', '連線前的 DNS 查詢預設是明文，查了哪個名稱看得一清二楚'],
          ['流量的時間、次數與大小', '沒有', '加密不隱藏長度，觀察者能從大小與時間推測你在做什麼'],
          ['網站本身可不可信', '沒有', 'HTTPS 只保護傳輸過程，不檢查網站是否誠實、伺服器是否被入侵'],
        ] },
        { type: 'callout', tone: 'warning', title: '常見誤解：HTTPS 會隱藏你連到哪個網站', text: 'HTTPS 隱藏的是你在網站上看了哪一頁、送了什麼，不是你連到哪個網站。同一個網路上的人（公司網管、Wi-Fi 業者、網路服務供應商）仍看得到目的 IP 位址、ClientHello 裡明文的 SNI 主機名稱、通常還有你的 DNS 查詢，以及流量的大小與時間。他們知道你連了 www.example.com，只是不知道是 /news 還是 /account。要連網站名稱一起藏起來，需要 ECH、加密的 DNS 或 VPN 這類額外的機制。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  network: {
    scenes: [handshake, chain, hsts],
    exercises: [
      { id: 'cn13-cipher-suite', task: 'field', scene: 'cn13-tls13-handshake', message: 'server-hello', layer: 'application', field: 'cipher_suite', title: '伺服器選定的 cipher suite',
        statement: '在「TLS 1.3 完整交握」情境裡，瀏覽器在 ClientHello 列出三個 cipher suite。伺服器在 ServerHello 選定的是哪一個？（照標準名稱寫，以 TLS_ 開頭）',
        hints: ['ClientHello 只是候選清單，選定的結果在伺服器的回覆裡。', 'TLS 1.3 的 cipher suite 名稱只寫對稱加密與雜湊，沒有 ECDHE 或 RSA。'],
        explanation: 'ServerHello 的 cipher_suite 欄位是 TLS_AES_128_GCM_SHA256：資料用 AES-128-GCM 加密，SHA-256 用於交握雜湊與 HKDF 金鑰導出。TLS 1.3 的 cipher suite 不含金鑰交換與簽章演算法，那兩者分別由 key_share／supported_groups 與 signature_algorithms 協商。',
        mistakes: [
          { answer: { value: 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256' }, why: '寫成 TLS 1.2 的命名：TLS 1.2 把金鑰交換與簽章寫在 cipher suite 裡，TLS 1.3 的 cipher suite 只剩 AEAD 演算法與雜湊。' },
          { answer: { value: 'TLS_AES_256_GCM_SHA384' }, why: '以為伺服器一定挑金鑰最長的：它是 ClientHello 清單裡的另一個候選，伺服器實際選的是 TLS_AES_128_GCM_SHA256。' },
        ] },
      { id: 'cn13-certificate-record', task: 'field', scene: 'cn13-tls13-handshake', message: 'certificate', layer: 'application', field: '內容類型', title: '裝著 Certificate 的紀錄',
        statement: '同一個情境裡，伺服器送出 Certificate 訊息。路上的觀察者看到的 TLS 紀錄標頭，內容類型是多少？（只填數字）',
        hints: ['Certificate 在 ServerHello 之後送出。', 'ServerHello 之後的紀錄都加密了，真正的類型在哪裡？'],
        explanation: 'ServerHello 之後雙方已有握手流量金鑰，Certificate 被加密送出。加密的紀錄外層一律寫 23（application_data），真正的類型 22（handshake）藏在加密的內層。所以觀察者看到的是 23，分不出這是交握還是應用資料。',
        mistakes: [
          { answer: { value: '22' }, why: '22 是 Certificate 真正的類型，但它在加密的內層；TLS 1.3 加密後的紀錄外層一律寫 23。在 TLS 1.2，憑證才是以明文的 22 送出。' },
          { answer: { value: '21' }, why: '21 是 alert（警示）的類型，和憑證無關。' },
        ] },
      { id: 'cn13-chain-issuer', task: 'table', scene: 'cn13-cert-chain', message: 'cert-www', node: 'browser', table: '憑證鏈檢查（www.example.com）', row: '中繼憑證', column: '簽發者', title: '誰簽了中繼憑證',
        statement: '在「驗證憑證鏈」情境裡，瀏覽器收到 www.example.com 的憑證後填好檢查表。中繼憑證那一列的「簽發者」是什麼？（照表中名稱寫）',
        hints: ['鏈是由下往上的：葉憑證的簽發者是中繼 CA，中繼憑證的簽發者是誰？', '瀏覽器要在信任儲存區找到這個簽發者。'],
        explanation: '中繼憑證 Example Issuing CA 1 是由根 CA Example Root CA 簽發的，瀏覽器用信任儲存區裡 Example Root CA 的公鑰驗證中繼憑證的簽章。葉憑證的簽發者才是 Example Issuing CA 1；根憑證的簽發者是它自己。',
        mistakes: [
          { answer: { cell: 'Example Issuing CA 1' }, why: '把主體當成簽發者：Example Issuing CA 1 是中繼憑證自己的名稱，也是葉憑證的簽發者；簽它的是上一層的根 CA。' },
          { answer: { cell: 'www.example.com' }, why: '把鏈的方向弄反了：網站的葉憑證在最下層，它不能簽發任何憑證。' },
        ] },
      { id: 'cn13-expired-alert', task: 'field', scene: 'cn13-cert-chain', message: 'alert-old', layer: 'application', field: '警示描述', title: '過期憑證的警示',
        statement: '同一個情境裡，old.example.com 的葉憑證已經過期，瀏覽器以 TLS 警示中止交握。警示描述（alert description）是哪一個？（填英文名稱）',
        hints: ['檢查表裡哪一欄是「否」？', 'RFC 8446 為不同的憑證問題定義了不同的警示描述。'],
        explanation: '葉憑證的名稱與簽章都正確，信任鏈也接得到根憑證，失敗的是有效期間，所以警示是 certificate_expired（代碼 45），表示憑證過期或尚未生效。這個警示在加密的紀錄裡送出，外層內容類型仍是 23。',
        mistakes: [
          { answer: { value: 'unknown_ca' }, why: 'unknown_ca（48）用在信任鏈接不到信任的根 CA；這條鏈一直接到 Example Root CA，問題在有效期間。' },
          { answer: { value: 'bad_certificate' }, why: 'bad_certificate（42）表示憑證損壞或簽章驗證失敗；這張憑證的簽章正確，只是過期，有更精確的 certificate_expired。' },
        ] },
      { id: 'cn13-hsts-expiry', task: 'table', scene: 'cn13-hsts', message: 'hsts-header', node: 'browser', table: '瀏覽器的 HSTS 清單', row: 'www.example.com', column: '到期日', title: 'HSTS 記錄到哪一天',
        statement: '在「HSTS」情境裡，瀏覽器在 2026-11-22 透過 HTTPS 收到 Strict-Transport-Security: max-age=31536000; includeSubDomains。HSTS 清單裡 www.example.com 的到期日是哪一天？（寫成 YYYY-MM-DD）',
        hints: ['max-age 的單位是秒。', '31536000 ÷ 86400 是幾天？2027 年不是閏年。'],
        explanation: 'max-age=31536000 秒 = 31536000 ÷ 86400 = 365 天，從收到標頭的 2026-11-22 起算，到 2027-11-22 為止。在這之前，瀏覽器遇到 http://www.example.com 都會先改成 https 再送出；每次透過 HTTPS 再收到這個標頭，期限就重新起算。',
        mistakes: [
          { answer: { cell: '2026-12-22' }, why: '把 31536000 秒算成 30 天：一天是 86400 秒，31536000 秒是 365 天。' },
          { answer: { cell: '31536000' }, why: '填了 max-age 的秒數：題目問的是從收到標頭那天加上 365 天之後的日期。' },
        ] },
    ],
  },
  quiz: [
    {
      id: 'q-hybrid', prompt: 'TLS 為什麼同時使用非對稱密碼學與對稱加密，而不是全部用其中一種？',
      options: ['非對稱加密比較快，用來加密大量的網頁資料；對稱加密只用在交握', '非對稱密碼學能在不安全的網路上協商秘密並證明身分，但速度慢；對稱加密速度快，用協商出的金鑰加密大量資料', '對稱加密不能防止竄改，所以資料要用非對稱加密才能保證完整性', '兩者其實可以互換，TLS 1.3 同時使用只是為了相容舊版'],
      answer: 1, explanation: '非對稱密碼學解決「事先沒有共同秘密」與「確認對方身分」的問題（ECDHE 與簽章），但運算慢；對稱加密很快，適合加密所有應用資料，只是需要雙方先有同一把金鑰。TLS 用前者協商出秘密，再導出對稱金鑰。第一個選項把速度說反了；AEAD 的對稱加密本身就能偵測竄改，不需要非對稱加密來保證完整性；兩者的能力不同，不能互換。',
    },
    {
      id: 'q-encrypted', prompt: '在 TLS 1.3 的完整交握中，路上的觀察者可以讀到哪一個訊息的明文內容？',
      options: ['伺服器的 Certificate（憑證鏈）', '伺服器的 CertificateVerify', '雙方的 Finished', 'ServerHello（選定的 cipher suite 與伺服器的臨時公鑰）'],
      answer: 3, explanation: 'ClientHello 與 ServerHello 是明文，因為在它們交換完臨時公鑰之前還沒有任何金鑰。ServerHello 之後雙方導出握手流量金鑰，EncryptedExtensions、Certificate、CertificateVerify 與兩個 Finished 都在外層內容類型 23 的加密紀錄裡。TLS 1.2 的憑證是明文，TLS 1.3 改成加密，所以第一個選項是 TLS 1.2 的情況。',
    },
    {
      id: 'q-forward-secrecy', prompt: '攻擊者錄下了你一年來和 www.example.com 的所有 TLS 1.3 流量，今天又偷到了伺服器憑證的私鑰。他能做到什麼？',
      options: ['無法解密錄下的舊流量，因為每條連線的金鑰來自早已刪除的臨時 ECDHE 私鑰；但在憑證被撤銷前，他可以冒充伺服器攔截新的連線', '可以解密全部錄下的流量，因為所有連線的金鑰都由憑證私鑰加密', '只能解密最近 24 小時的流量，更早的連線金鑰已經過期', '什麼都做不了，因為憑證私鑰在 TLS 1.3 中完全沒有用途'],
      answer: 0, explanation: 'TLS 1.3 的完整交握用 (EC)DHE：連線金鑰來自每次重新產生、用完就刪的臨時私鑰，憑證私鑰只用來簽 CertificateVerify，所以舊流量仍然安全，這就是前向保密。但憑證私鑰能證明身分，偷到它就能冒充伺服器，直到憑證被撤銷或過期。第二個選項描述的是 TLS 1.2 的 RSA 金鑰傳輸；金鑰沒有「24 小時」的規則；憑證私鑰並非沒有用途，它用來簽章。',
    },
    {
      id: 'q-chain', prompt: '一台設定正確的 HTTPS 伺服器在 Certificate 訊息裡會送出哪些憑證？',
      options: ['只送根憑證，瀏覽器再向 CA 下載其餘的憑證', '葉憑證、中繼憑證與根憑證全部都送，瀏覽器才能驗證整條鏈', '葉憑證與中繼憑證；根憑證已經在瀏覽器的信任儲存區裡', '只送葉憑證，中繼憑證一定內建在每個瀏覽器裡'],
      answer: 2, explanation: '伺服器送出自己的葉憑證與簽發它的中繼憑證，瀏覽器從葉憑證往上驗證，最後接到本機信任儲存區裡的根憑證。根憑證就算送了也沒用，因為信任只能來自本機的儲存區，不能由伺服器提供。只送根憑證無法證明網站的身分；中繼憑證並沒有內建在每個瀏覽器裡，漏送中繼憑證是常見的設定錯誤，會讓部分用戶端驗證失敗。',
    },
    {
      id: 'q-name-mismatch', prompt: '你在公共 Wi-Fi 上打開 https://www.example.com/login，瀏覽器警告憑證的名稱不符：憑證的 SAN 只有 portal.example.net。最合理的判斷是什麼？',
      options: ['只是憑證過期，按「繼續前往」就好', '連線是加密的，所以登入沒有風險', '這是混合內容警告，頁面上有圖片用 http 載入', '你可能連到了別人的伺服器（例如 Wi-Fi 的攔截頁或中間人），不應該在這個頁面輸入密碼'],
      answer: 3, explanation: '名稱不符表示對方出示的憑證不是 www.example.com 的，瀏覽器無法確認你連到的是誰。在公共 Wi-Fi 上，常見原因是登入入口頁或惡意的中間人在攔截連線，加密對錯的人毫無幫助，所以不應輸入密碼。過期是有效期間的問題，與名稱無關；「有加密」不代表對方是對的人；混合內容是頁面載入 http 資源，不會讓憑證名稱不符。',
    },
    {
      id: 'q-mixed-content', prompt: 'https://www.example.com/ 的頁面裡有一行 <script src="http://cdn.example.com/app.js">。新版瀏覽器會怎麼處理？',
      options: ['封鎖這個腳本，因為明文載入的腳本可能被竄改，進而控制整個頁面', '正常載入，因為頁面本身已經是 HTTPS', '載入腳本，但把網址列的鎖頭改成紅色', '自動改用 FTP 下載這個腳本'],
      answer: 0, explanation: '腳本是主動的混合內容：路上的人可以竄改明文的腳本，而腳本能讀寫整個頁面，等於讓 HTTPS 頁面失去保護，所以瀏覽器直接封鎖它，並在主控台顯示 Mixed Content 警告。頁面是 HTTPS 不代表它載入的資源也安全；瀏覽器不會「載入後只換鎖頭顏色」，也不會改用其他協定。修正方法是把網址改成 https，或使用 upgrade-insecure-requests。',
    },
    {
      id: 'q-hsts-first-visit', prompt: '網站已經在所有 HTTPS 回應加上 Strict-Transport-Security: max-age=31536000。為什麼它還想申請加入 HSTS 預載清單？',
      options: ['預載清單能讓網站不需要憑證', '加入預載清單後，網站的流量會被瀏覽器額外加密一次', '沒有預載時，瀏覽器在第一次造訪（或記錄過期後）還不知道要用 HTTPS，那一次的明文請求和轉址仍可能被攔截', 'HSTS 標頭只對 Chrome 有效，預載清單才對其他瀏覽器有效'],
      answer: 2, explanation: 'HSTS 標頭要透過 HTTPS 收到一次之後才生效，第一次造訪的 http 請求與 301 轉址都是明文，攻擊者可以在這時把使用者留在 http（SSL stripping）。預載清單內建在瀏覽器裡，第一次就直接用 HTTPS。預載清單反而要求網站有有效的憑證；它不會額外加密；HSTS 是 RFC 6797 標準，主流瀏覽器都支援這個標頭。',
    },
    {
      id: 'q-what-hidden', prompt: '你在咖啡店的 Wi-Fi 上開啟 https://www.example.com/account/settings。Wi-Fi 的管理者在一般情況下看得到下列哪一項？',
      options: ['路徑 /account/settings', '主機名稱 www.example.com（ClientHello 的 SNI）與伺服器的 IP 位址', '你的 Cookie 與登入狀態', '網頁的 HTML 內容'],
      answer: 1, explanation: 'IP 位址在 IP 標頭裡，路由需要它；SNI 主機名稱在明文的 ClientHello 裡（除非兩端都支援 ECH），所以管理者知道你連到 www.example.com。路徑、Cookie 與網頁內容都在 HTTP 訊息裡，被 TLS 加密，他看不到。HTTPS 隱藏的是你在網站上做什麼，不是你連到哪個網站。',
    },
  ],
};
