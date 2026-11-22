/*
 * Engine stage E15 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §16): nginx's upstream peer selection, as pure functions over
 * a peer table kept in the running nginx's state. The algorithms are nginx 1.24's own: the smooth weighted round robin of
 * ngx_http_upstream_round_robin.c (current_weight += effective_weight, the largest wins, it gives back the total), the
 * least_conn comparison conns × weight with round robin among the ties, and ip_hash's hash over the first three octets of
 * the client's IPv4 address (89, then hash × 113 + octet mod 6271, rehashing up to 20 times before falling back to round
 * robin). Passive health checks follow the round-robin module too: a failure adds to fails and lowers effective_weight by
 * weight / max_fails; at max_fails the peer is unavailable for fail_timeout — and since the simulation's clock does not
 * move, until the next reload (which starts with fresh peers, as nginx does). A single server is never marked down.
 */

export type Balance = 'round-robin' | 'least_conn' | 'ip_hash';
/** A server of an upstream block (or the implicit one of proxy_pass http://host:port). */
export interface UpServer { text: string; address: string; port: number; weight: number; maxFails: number; failTimeout: number; backup: boolean; down: boolean }
export interface Upstream { name: string; servers: UpServer[]; method: Balance; keepalive?: number; implicit?: true; file: string; line: number }
/** One peer's run-time state: current_weight, effective_weight and the failures counted since its last success. */
export interface PeerState { cw: number; ew: number; fails: number }

/** A fresh peer table for an upstream's primary (or backup) servers. */
export const freshPeers = (servers: readonly UpServer[]): PeerState[] => servers.map(s => ({ cw: 0, ew: s.weight, fails: 0 }));
/** Whether a peer may be chosen: not down, not tried for this request, not failed max_fails times (unless it is the only one). */
function usable(s: UpServer, p: PeerState, single: boolean): boolean {
  if (s.down) return false;
  return single || !s.maxFails || p.fails < s.maxFails;
}

/** Smooth weighted round robin over the usable, untried peers (ngx_http_upstream_get_peer). */
function roundRobin(servers: readonly UpServer[], peers: PeerState[], tried: ReadonlySet<number>, only?: readonly number[]): number | undefined {
  let best: number | undefined, total = 0;
  const single = servers.length === 1;
  for (let i = 0; i < servers.length; i++) {
    if (tried.has(i) || (only && !only.includes(i)) || !usable(servers[i], peers[i], single)) continue;
    const p = peers[i];
    p.cw += p.ew;
    total += p.ew;
    if (p.ew < servers[i].weight) p.ew++;
    if (best === undefined || p.cw > peers[best].cw) best = i;
  }
  if (best === undefined) return undefined;
  peers[best].cw -= total;
  return best;
}

/** least_conn: the fewest active connections per weight; ties share the round robin (ngx_http_upstream_get_least_conn_peer). */
function leastConn(servers: readonly UpServer[], peers: PeerState[], tried: ReadonlySet<number>, conns: (i: number) => number): number | undefined {
  let best: number | undefined, many = false;
  const single = servers.length === 1;
  for (let i = 0; i < servers.length; i++) {
    if (tried.has(i) || !usable(servers[i], peers[i], single)) continue;
    if (best === undefined || conns(i) * servers[best].weight < conns(best) * servers[i].weight) { best = i; many = false; }
    else if (conns(i) * servers[best].weight === conns(best) * servers[i].weight) many = true;
  }
  if (best === undefined || !many) return best;
  const ties = servers.map((_, i) => i).filter(i => !tried.has(i) && usable(servers[i], peers[i], single) && conns(i) * servers[best!].weight === conns(best!) * servers[i].weight);
  return roundRobin(servers, peers, tried, ties);
}

/** ip_hash: nginx's hash of the first three octets, weighted, rehashed while the peer cannot be used (ngx_http_upstream_get_ip_hash_peer). */
export function ipHashPeer(servers: readonly UpServer[], peers: PeerState[], tried: ReadonlySet<number>, client: string): number | undefined {
  if (servers.length === 1) return roundRobin(servers, peers, tried);
  const octets = client.split('.').slice(0, 3).map(Number), total = servers.reduce((n, s) => n + s.weight, 0);
  let hash = 89;
  for (let tries = 0; tries <= 20; tries++) {
    for (const o of octets) hash = (hash * 113 + o) % 6271;
    let w = hash % total, p = 0;
    while (w >= servers[p].weight) { w -= servers[p].weight; p++; }
    if (!tried.has(p) && usable(servers[p], peers[p], false)) return p;
  }
  return roundRobin(servers, peers, tried);
}

/** The next peer for a request: the primary servers by the upstream's method, then (round robin) the backup servers. */
export function pickPeer(up: Upstream, peers: { primary: PeerState[]; backup: PeerState[] }, tried: ReadonlySet<number>, client: string, conns: (server: UpServer) => number): number | undefined {
  const primary = up.servers.filter(s => !s.backup), backup = up.servers.filter(s => s.backup);
  const triedPrimary = new Set([...tried].filter(i => !up.servers[i].backup).map(i => primary.indexOf(up.servers[i])));
  const chosen = up.method === 'ip_hash' ? ipHashPeer(primary, peers.primary, triedPrimary, client)
    : up.method === 'least_conn' ? leastConn(primary, peers.primary, triedPrimary, i => conns(primary[i]))
      : roundRobin(primary, peers.primary, triedPrimary);
  if (chosen !== undefined) return up.servers.indexOf(primary[chosen]);
  if (!backup.length) return undefined;
  const triedBackup = new Set([...tried].filter(i => up.servers[i].backup).map(i => backup.indexOf(up.servers[i])));
  const b = up.method === 'least_conn' ? leastConn(backup, peers.backup, triedBackup, i => conns(backup[i])) : roundRobin(backup, peers.backup, triedBackup);
  return b === undefined ? undefined : up.servers.indexOf(backup[b]);
}

/** A failed attempt (ngx_http_upstream_free_round_robin_peer): fails + 1, effective_weight lowered; true when it just reached max_fails. */
export function peerFailed(s: UpServer, p: PeerState, single: boolean): boolean {
  if (single) return false;
  p.fails++;
  if (s.maxFails) p.ew = Math.max(0, p.ew - Math.floor(s.weight / s.maxFails));
  return !!s.maxFails && p.fails === s.maxFails;
}
/** A successful attempt clears the failures. */
export function peerSucceeded(p: PeerState): void { p.fails = 0; }

/** An nginx time value (60, 60s, 1m, 500ms, 1h) in seconds, or undefined. */
export function timeValue(text: string): number | undefined {
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === 'ms' ? n / 1000 : m[2] === 'm' ? n * 60 : m[2] === 'h' ? n * 3600 : m[2] === 'd' ? n * 86400 : n;
}
