import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';

/*
 * Synthetic machines for engine stages E13–E14 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §11–§13), only for tests: a
 * client and a TLS server whose responders present a good chain, a leaf without its intermediate, an expired certificate,
 * a certificate for another name and one from an internal CA (tls); a web server with certbot and a webroot responder
 * (tls); and an nginx server with a site, a static tree, permissions and certbot (nginx).
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const home = [dir('/home'), dir('/home/learner', 'learner')];
const sudo = { groups: [{ name: 'sudo', members: ['learner'] }] };

// ---------------------------------------------------------------------------------------------------------- E13 tls

export const EXAMPLE_ORG = '$ORIGIN example.org.\n$TTL 300\n@ IN SOA ns.example.org. admin.example.org. 1 3600 600 86400 300\n@ IN NS ns.example.org.\nns IN A 192.0.2.53\n'
  + 'shop IN A 10.0.0.12\nwww.shop IN CNAME shop.example.org.\nbare IN A 10.0.0.12\nold IN A 10.0.0.12\nintranet IN A 10.0.0.12\nplain IN A 10.0.0.12\n';
const tlsListen = (port: number, name: string, fd: number) => ({ port, fd, http: 'shop', tls: { certificate: `/etc/ssl/${name}/fullchain.pem`, key: `/etc/ssl/${name}/privkey.pem` } });
export const tlsServer: TerminalRemote = {
  host: 'web-03', address: '10.0.0.12', hostKey: 'web-03-key', files: [],
  certificates: [
    { id: 'shop', cn: 'shop.example.org', sans: ['shop.example.org', 'www.shop.example.org'], issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 09:00:00', keyType: 'ec256',
      path: '/etc/ssl/shop/fullchain.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/shop/privkey.pem' },
    { id: 'bare', cn: 'bare.example.org', issuer: 'lets-encrypt-r11', notBefore: '2026-11-01 09:00:00', path: '/etc/ssl/bare/fullchain.pem', key: '/etc/ssl/bare/privkey.pem' },
    { id: 'old', cn: 'old.example.org', issuer: 'lets-encrypt-r11', notBefore: '2026-08-01 00:00:00', path: '/etc/ssl/old/fullchain.pem', chain: ['lets-encrypt-r11'], key: '/etc/ssl/old/privkey.pem' },
    { id: 'internal-ca', cn: 'Island Internal CA', org: 'Logic Island', ca: true, notBefore: '2026-01-01 00:00:00', path: '/etc/ssl/internal/ca.pem' },
    { id: 'intranet', cn: 'intranet.example.org', issuer: 'internal-ca', notBefore: '2026-11-01 00:00:00', days: 365, path: '/etc/ssl/intranet/fullchain.pem', key: '/etc/ssl/intranet/privkey.pem' },
  ],
  processes: [{
    pid: 900, user: 'root', command: '/usr/local/bin/shopd', stat: 'Ss',
    listen: [{ port: 80, fd: 5, http: 'shop' }, tlsListen(443, 'shop', 6), tlsListen(8443, 'bare', 7), tlsListen(9443, 'old', 8), tlsListen(10443, 'intranet', 9)],
  }],
  responders: [{ id: 'shop', server: 'shopd/2.1', routes: [{ path: '/', body: 'shop\n', headers: [['Strict-Transport-Security', 'max-age=63072000']] }] }],
};
export const tlsClient: TerminalMachine = {
  id: 'cli-02', title: 'cli-02（用 curl 與 openssl 觀察的用戶端）', user: 'learner', cwd: '/home/learner', host: 'cli-02', profile: 'tls', files: home, accounts: sudo,
  remotes: [tlsServer], internet: [{ zone: 'example.org', text: EXAMPLE_ORG }],
};

// ACME: a web server with a webroot responder and certbot.
export const EXAMPLE_NET = '$ORIGIN example.net.\n$TTL 300\n@ IN SOA ns.example.net. admin.example.net. 1 3600 600 86400 300\n@ IN NS ns.example.net.\nns IN A 192.0.2.53\n'
  + 'blog IN A 203.0.113.10\nelsewhere IN A 203.0.113.99\ndown IN A 10.0.0.77\n';
export const acmeMachine: TerminalMachine = {
  id: 'web-04', title: 'web-04（用 certbot 申請憑證）', user: 'learner', cwd: '/home/learner', host: 'web-04', profile: 'tls', accounts: sudo,
  interfaces: [{ name: 'eth0', address: '203.0.113.10/24' }],
  files: [...home, dir('/var'), dir('/var/www'), dir('/var/www/blog'), file('/var/www/blog/index.html', '<h1>blog</h1>\n')],
  internet: [{ zone: 'example.net', text: EXAMPLE_NET }],
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { pid: 950, user: 'root', command: '/usr/local/bin/blogd', stat: 'Ss', listen: [{ port: 80, fd: 5, http: 'blog' }] }],
  responders: [{ id: 'blog', server: 'blogd/1.0', routes: [{ path: '/.well-known/acme-challenge/*', root: '/var/www/blog', type: 'text/plain' }, { path: '/', body: '<h1>blog</h1>\n' }] }],
  certbot: { lifetime: 90 }, timezone: 'UTC',
};

// ------------------------------------------------------------------------------------------------------- E14 nginx

export const SHOP_SITE = `server {
    listen 80;
    server_name shop.example.com www.shop.example.com;
    root /var/www/shop;
    index index.html;
    add_header X-Site shop;

    access_log /var/log/nginx/shop.access.log;
    error_log /var/log/nginx/shop.error.log;

    location / {
        try_files $uri $uri/ =404;
    }
    location = /healthz {
        add_header Cache-Control no-store;
        return 200 "ok\\n";
    }
    location ^~ /static/ {
        add_header Cache-Control "max-age=86400";
    }
    location ~* \\.(png|jpg)$ {
        add_header X-Image yes;
    }
    location /old/ {
        return 301 /new/;
    }
    location /private/ {
        deny all;
    }
    location /files/ {
        alias /srv/files/;
    }
}
`;
export const EXAMPLE_COM = '$ORIGIN example.com.\n$TTL 300\n@ IN SOA ns.example.com. admin.example.com. 1 3600 600 86400 300\n@ IN NS ns.example.com.\nns IN A 192.0.2.53\n'
  + 'shop IN A 10.0.0.10\nwww.shop IN A 10.0.0.10\nblog IN A 10.0.0.10\n';
export const nginxMachine: TerminalMachine = {
  id: 'web-05', title: 'web-05（nginx 網頁伺服器）', user: 'learner', cwd: '/home/learner', host: 'web-05', profile: 'nginx', nginx: true, accounts: sudo,
  files: [...home, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/shop', SHOP_SITE), dir('/etc/nginx/sites-enabled'),
    link('/etc/nginx/sites-enabled/shop', '/etc/nginx/sites-available/shop'),
    dir('/var'), dir('/var/www'), dir('/var/www/shop'), file('/var/www/shop/index.html', '<h1>Shop</h1>\n'), dir('/var/www/shop/about'), file('/var/www/shop/about/index.html', 'about\n'),
    dir('/var/www/shop/empty'), dir('/var/www/shop/static'), file('/var/www/shop/static/site.css', 'body{}\n'), file('/var/www/shop/static/pic.png', 'PNG'), file('/var/www/shop/logo.png', 'PNG'),
    dir('/var/www/shop/secret', 'root', 0o700), file('/var/www/shop/secret/index.html', 'top secret\n'), file('/var/www/shop/draft.html', 'draft\n', 'root', 0o600),
    dir('/srv'), dir('/srv/files'), file('/srv/files/report.txt', 'report\n')],
  internet: [{ zone: 'example.com', text: EXAMPLE_COM }],
  certbot: { account: true },
};
