import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';

/*
 * Synthetic machines for engine stages E15–E17 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §16–§19), only for tests: a
 * reverse proxy in front of a local application and two upstream servers (proxy); a server with ufw and nftables and a
 * client that tests it from outside (firewall); a laptop, a bastion and a database server only the bastion reaches
 * (tunnels).
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });
const home = [dir('/home'), dir('/home/learner', 'learner')];
const sudo = { groups: [{ name: 'sudo', members: ['learner'] }] };

// -------------------------------------------------------------------------------------------------------- E15 proxy

export const PROXY_SITE = `upstream backend {
    server 10.0.0.21:8080;
    server 10.0.0.22:8080;
}

server {
    listen 80 default_server;
    server_name app.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /plain/ {
        proxy_pass http://127.0.0.1:3000;
    }
    location /api/ {
        proxy_pass http://backend/;
        add_header X-Upstream $upstream_addr;
    }
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /ws-bare {
        proxy_pass http://127.0.0.1:3000/ws;
    }
    location /slow {
        proxy_pass http://127.0.0.1:3000;
        proxy_read_timeout 5s;
    }
    location /down/ {
        proxy_pass http://127.0.0.1:3999/;
    }
}
`;
const appServer = (host: string, address: string, extra: Partial<TerminalRemote> = {}): TerminalRemote => ({
  host, address, hostKey: `${host}-key`, files: [],
  processes: [{ pid: 900, user: 'root', command: '/usr/local/bin/appd', stat: 'Ss', listen: [{ port: 8080, fd: 5, http: 'app' }] }],
  responders: [{ id: 'app', server: 'appd/1.0', routes: [{ path: '/whoami', echo: true }, { path: '/*', body: `${host}\n`, type: 'text/plain' }] }],
  ...extra,
});
export const app01 = appServer('app-01', '10.0.0.21');
export const app02 = appServer('app-02', '10.0.0.22');
export const app03 = appServer('app-03', '10.0.0.23');
export const proxyMachine: TerminalMachine = {
  id: 'web-06', title: 'web-06（反向代理）', user: 'learner', cwd: '/home/learner', host: 'web-06', profile: 'proxy', nginx: true, accounts: sudo,
  files: [...home, dir('/etc'), dir('/etc/nginx'), dir('/etc/nginx/sites-available'), file('/etc/nginx/sites-available/app', PROXY_SITE), dir('/etc/nginx/sites-enabled'),
    link('/etc/nginx/sites-enabled/app', '/etc/nginx/sites-available/app')],
  processes: [{ pid: 950, user: 'learner', command: 'node /srv/app/server.js', stat: 'Sl', listen: [{ address: '127.0.0.1', port: 3000, fd: 18, http: 'node' }] }],
  responders: [{ id: 'node', routes: [{ path: '/ws', websocket: true }, { path: '/slow', delay: 30, body: 'slow\n' }, { path: '/login', status: 302, redirect: 'http://127.0.0.1:3000/account' }, { path: '/*', echo: true }] }],
  remotes: [app01, app02, app03],
};

// ----------------------------------------------------------------------------------------------------- E16 firewall

export const fwServer: TerminalRemote = {
  host: 'srv-01', address: '10.0.0.30', hostKey: 'srv-01-key', passwords: ['admin'], nginx: true,
  files: [dir('/home'), dir('/home/admin', 'admin')],
  processes: [{ pid: 960, user: 'postgres', command: '/usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main', stat: 'Ss', listen: [{ port: 5432, fd: 7 }] }],
  accounts: { users: [{ name: 'postgres', uid: 113, home: '/var/lib/postgresql', shell: '/bin/bash' }, { name: 'admin', uid: 1000 }], groups: [{ name: 'sudo', members: ['admin'] }] },
};
export const fwOffice: TerminalRemote = {
  host: 'office', address: '10.0.0.50', hostKey: 'office-key', passwords: ['learner'], files: [dir('/home'), dir('/home/learner', 'learner')], accounts: { users: [{ name: 'learner', uid: 1000 }] },
};
export const fwLaptop: TerminalMachine = {
  id: 'laptop', title: 'laptop（管理員的電腦）', user: 'learner', cwd: '/home/learner', host: 'laptop', profile: 'firewall', accounts: sudo,
  files: home, remotes: [fwServer, fwOffice],
};
/** The server itself as the local machine (ufw run directly, checks from the other hosts). */
export const fwLocal: TerminalMachine = {
  id: 'srv-local', title: 'srv-01（本機）', user: 'learner', cwd: '/home/learner', host: 'srv-01', address: '10.0.0.30', profile: 'firewall', nginx: true, accounts: sudo,
  files: home,
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { pid: 700, user: 'root', command: 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', stat: 'Ss', listen: [{ port: 22, fd: 3, backlog: 128 }] },
    { pid: 960, user: 'root', command: '/usr/local/bin/dbd', stat: 'Ss', listen: [{ port: 5432, fd: 7 }] }],
  remotes: [{ host: 'office', address: '10.0.0.50', hostKey: 'office-key', files: [] }, { host: 'cafe', address: '10.0.0.77', hostKey: 'cafe-key', files: [] }],
};

// ------------------------------------------------------------------------------------------------------ E17 tunnels

export const bastion: TerminalRemote = {
  host: 'bastion', address: '10.0.0.40', hostKey: 'bastion-key', passwords: ['learner'],
  interfaces: [{ name: 'eth0', address: '10.0.0.40/24' }, { name: 'eth1', address: '10.0.1.40/24' }],
  accounts: { users: [{ name: 'learner', uid: 1000 }] }, files: [dir('/home'), dir('/home/learner', 'learner')],
};
export const dbServer: TerminalRemote = {
  host: 'db-01', address: '10.0.1.20', hostKey: 'db-01-key', passwords: ['learner'], reachableFrom: ['bastion'],
  interfaces: [{ name: 'eth0', address: '10.0.1.20/24' }],
  accounts: { users: [{ name: 'learner', uid: 1000 }] }, files: [dir('/home'), dir('/home/learner', 'learner')],
  processes: [{ pid: 970, user: 'root', command: '/usr/local/bin/admin-ui', stat: 'Ss', listen: [{ address: '127.0.0.1', port: 8080, fd: 5, http: 'admin' }, { port: 5432, fd: 6 }] }],
  responders: [{ id: 'admin', server: 'admin-ui/1.0', routes: [{ path: '/*', body: 'db-01 admin\n', type: 'text/plain' }] }],
};
export const tunnelLaptop: TerminalMachine = {
  id: 'laptop-2', title: 'laptop（透過跳板機管理）', user: 'learner', cwd: '/home/learner', host: 'laptop', profile: 'tunnels', accounts: sudo,
  files: home,
  processes: [{ pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' }, { pid: 980, user: 'learner', command: 'python3 -m http.server 8000', stat: 'S', listen: [{ port: 8000, address: '127.0.0.1', fd: 3, http: 'dev' }] }],
  responders: [{ id: 'dev', server: 'SimpleHTTP/0.6 Python/3.12.3', routes: [{ path: '/*', body: 'laptop dev server\n', type: 'text/plain' }] }],
  remotes: [bastion, dbServer],
};
