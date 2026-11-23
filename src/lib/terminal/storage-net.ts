import { groupOf, isInside, parentOf, resolvePath, type FsNode, type FsState } from './fs';
import { accountsOf as hostAccounts } from './accounts';
import { accountsOf as imageAccounts, hex } from './build';
import { isoText, type Seconds } from './clock';
import { clockOf, type Proc } from './processes';
import { inSubnet, ipNumber, ipText, isIPv4, networkOf, parseCidr, type Iface, type Listen } from './sockets';
import type { Responder } from './http';
import type { RemoteHost } from './ssh';
import type { DockerContainer, DockerImage, DockerState, LogLine } from './docker';

/*
 * Engine stage E22 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §12): storage and networks on the simulated daemon of
 * E20–E21, Docker CE 27.5.1. A named volume is a folder of the host, /var/lib/docker/volumes/NAME/_data (so `sudo ls` shows
 * it and the files survive docker rm); a bind mount is any folder (or file) of the host; tmpfs lives in the container's
 * record and is emptied when it stops. A container's processes see its own file system with the mounts laid over it, the
 * owners translated by number (the host's /etc/passwd ↔ the image's): a file of learner (uid 1000) is node's in a node
 * image, and a file a container's root writes is root's on the host. After each command what changed under a mount is
 * written back to its source (never through a read-only one: the change is refused with "Read-only file system").
 *
 * Networks: bridge (172.17.0.0/16), host and none exist; user-defined bridge networks get 172.18.0.0/16, 172.19.0.0/16…
 * A running container has an address on each of its networks. Its commands (getent, ping, curl, nc) see a network made
 * of itself and the running containers that share a network with it: on a user-defined network Docker's embedded DNS
 * (127.0.0.11) answers their names and aliases, on the default bridge only addresses work, and containers without a
 * common network cannot reach each other at all. Their services listen on the container ports (the published ports are
 * the host's). --network host shares the host's network (the service is a listener of the host), none has only lo.
 */

export interface DockerMount {
  type: 'volume' | 'bind' | 'tmpfs';
  /** The volume's name or the host path (bind); '' for tmpfs. */
  source: string;
  target: string;
  readonly: boolean;
  /** A volume Docker named itself (-v /path, or the image's VOLUME). */
  anonymous?: true;
  /** How it was given: -v (docker inspect's Mode is z for a volume) or --mount / --tmpfs. */
  via: 'v' | 'mount';
}
export interface DockerVolume { name: string; created: Seconds; anonymous?: true }
export interface DockerNetwork { name: string; id: string; driver: 'bridge' | 'host' | 'null'; subnet?: string; gateway?: string; created: Seconds; builtin?: true }
/** A container on a network: its aliases there and, while it runs, its address. */
export interface NetAttach { aliases: readonly string[]; ip?: string }

const short = (id: string) => id.slice(0, 12);
export const VOLUMES_DIR = '/var/lib/docker/volumes';
export const volumeDir = (name: string) => `${VOLUMES_DIR}/${name}/_data`;
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;
export const isVolumeName = (s: string) => VOLUME_NAME.test(s);
export const NETWORK_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const DEFAULT_GATEWAY = '172.17.0.1';

/** bridge, host and none, as a new daemon has them. */
export function builtinNetworks(created: Seconds): DockerNetwork[] {
  return [
    { name: 'bridge', id: hex(`network/bridge/${created}`), driver: 'bridge', subnet: '172.17.0.0/16', gateway: DEFAULT_GATEWAY, created, builtin: true },
    { name: 'host', id: hex(`network/host/${created}`), driver: 'host', created, builtin: true },
    { name: 'none', id: hex(`network/none/${created}`), driver: 'null', created, builtin: true },
  ];
}
export const networksOf = (d: DockerState) => d.networks ?? [];
export const findNetwork = (d: DockerState, text: string) => networksOf(d).find(n => n.name === text) ?? (/^[0-9a-f]{2,64}$/.test(text) ? networksOf(d).find(n => n.id.startsWith(text)) : undefined);
/** The network mode: host, none, or bridge (the default bridge and user-defined networks). */
export const modeOf = (c: DockerContainer): 'host' | 'none' | 'bridge' => c.networks?.host ? 'host' : c.networks?.none ? 'none' : 'bridge';
/** The networks a container is attached to with their records (in the order they were attached). */
export const attachments = (d: DockerState, c: DockerContainer) =>
  Object.entries(c.networks ?? {}).map(([name, a]) => ({ net: networksOf(d).find(n => n.name === name), name, a })).filter((x): x is { net: DockerNetwork; name: string; a: NetAttach } => !!x.net);
/** The address docker-proxy forwards to: the default bridge's, else the first network's. */
export const primaryIp = (d: DockerState, c: DockerContainer): string | undefined => c.ip ?? attachments(d, c).find(x => x.a.ip)?.a.ip;
const prefixOf = (subnet: string | undefined) => Number(subnet?.split('/')[1] ?? 16);
/** Docker's MAC address of an endpoint (02:42 and the IPv4 address). */
export const macOf = (ip: string) => `02:42:${ip.split('.').map(n => Number(n).toString(16).padStart(2, '0')).join(':')}`;

/** The lowest free address of a network (the gateway is .1) among its running containers. */
export function freeAddress(d: DockerState, net: DockerNetwork, except?: string): string | undefined {
  const cidr = parseCidr(net.subnet ?? '');
  if (!cidr) return undefined;
  const base = ipNumber(networkOf(cidr.address, cidr.prefix)), size = 2 ** (32 - cidr.prefix);
  const used = new Set(d.containers.filter(c => c.id !== except && c.status === 'running').map(c => c.networks?.[net.name]?.ip).filter(Boolean));
  if (net.name === 'bridge') d.containers.forEach(c => { if (c.id !== except && c.status === 'running' && c.ip) used.add(c.ip); });
  for (let n = 2; n < size - 1; n++) { const ip = ipText(base + n); if (ip !== net.gateway && !used.has(ip)) return ip; }
  return undefined;
}
/** A new user-defined network's subnet: 172.18.0.0/16 … 172.31.0.0/16, then 192.168.0.0/20 … */
export function nextSubnet(d: DockerState): { subnet: string; gateway: string } | undefined {
  const taken = networksOf(d).map(n => parseCidr(n.subnet ?? '')).filter((x): x is { address: string; prefix: number } => !!x);
  const free = (address: string, prefix: number) => !taken.some(t => overlaps(address, prefix, t.address, t.prefix));
  for (let b = 18; b <= 31; b++) if (free(`172.${b}.0.0`, 16)) return { subnet: `172.${b}.0.0/16`, gateway: `172.${b}.0.1` };
  for (let c = 0; c < 256; c += 16) if (free(`192.168.${c}.0`, 20)) return { subnet: `192.168.${c}.0/20`, gateway: `192.168.${c}.1` };
  return undefined;
}
export const overlaps = (a: string, ap: number, b: string, bp: number) => { const p = Math.min(ap, bp); return inSubnet(a, b, p); };
/** Gives the running container an address on each of its networks (the default bridge's is also E20's ip). */
export function assignAddresses(d: DockerState, c: DockerContainer): DockerContainer | { missing: string } {
  if (!c.networks) return c;
  const networks: Record<string, NetAttach> = {};
  let ip: string | undefined;
  for (const [name, a] of Object.entries(c.networks)) {
    const net = networksOf(d).find(n => n.name === name);
    if (!net) return { missing: name };
    if (net.driver !== 'bridge') { networks[name] = { aliases: a.aliases }; continue; }
    const addr = freeAddress(d, net, c.id);
    networks[name] = { aliases: a.aliases, ...addr ? { ip: addr } : {} };
    if (name === 'bridge') ip = addr;
  }
  return { ...c, networks, ip };
}
/** A stopped container has no addresses. */
export const releaseAddresses = (c: DockerContainer): DockerContainer =>
  c.networks ? { ...c, networks: Object.fromEntries(Object.entries(c.networks).map(([k, a]) => [k, { aliases: a.aliases }])) } : c;

/** /etc/hosts of a container on Docker's networks: localhost and its address on each network with its host name. */
export function hostsText(d: DockerState, c: DockerContainer): string {
  const ips = attachments(d, c).map(x => x.a.ip).filter((x): x is string => !!x);
  return `127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::\tip6-localnet\nff00::\tip6-mcastprefix\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters\n${ips.map(ip => `${ip}\t${c.hostname ?? short(c.id)}\n`).join('')}`;
}
/** /etc/resolv.conf: Docker's embedded DNS on a user-defined network; otherwise the host's name servers (8.8.8.8 and 8.8.4.4 when it has only local ones). */
export function resolvText(host: FsState, d: DockerState, c: DockerContainer): string {
  const head = '# Generated by Docker Engine.\n# This file can be edited; Docker Engine will not make further changes once it\n# has been modified.\n\n';
  if (attachments(d, c).some(x => !x.net.builtin)) return `${head}nameserver 127.0.0.11\noptions ndots:0\n\n# Based on host file: '/etc/resolv.conf' (internal resolver)\n# ExtServers: [host(127.0.0.53)]\n# Overrides: []\n# Option ndots from: internal\n`;
  const servers = (host.nodes.get('/etc/resolv.conf')?.content ?? '').split('\n').map(l => /^nameserver\s+(\S+)/.exec(l)?.[1]).filter((x): x is string => !!x && !x.startsWith('127.'));
  return `${head}${(servers.length ? servers : ['8.8.8.8', '8.8.4.4']).map(s => `nameserver ${s}\n`).join('')}\n# Based on host file: '/etc/resolv.conf' (legacy)\n# Overrides: []\n`;
}

// ------------------------------------------------------------------------------------------------- mounts

const byDepth = (ms: readonly DockerMount[]) => [...ms].sort((a, b) => a.target.split('/').length - b.target.split('/').length || (a.target < b.target ? -1 : 1));
/** The host path a volume or bind mount shows. */
export const hostPathOf = (m: DockerMount) => m.type === 'volume' ? volumeDir(m.source) : m.source;
const ROOT_TMPFS: FsNode = { kind: 'dir', mode: 0o1777, owner: 'root' };

/** Owners and groups by number: the host's database ↔ the image's /etc/passwd and /etc/group (an unknown number stays a number). */
export function idMaps(host: FsState, image: ReadonlyMap<string, FsNode>) {
  const h = hostAccounts(host), k = imageAccounts(image);
  type Acc = typeof k;
  const uidOf = (acc: Acc, name: string) => acc.users.find(u => u.name === name)?.uid ?? (/^\d+$/.test(name) ? Number(name) : undefined);
  const gidOf = (acc: Acc, name: string) => acc.groups.find(g => g.name === name)?.gid ?? (/^\d+$/.test(name) ? Number(name) : acc.users.find(u => u.name === name)?.gid);
  const map = (from: Acc, to: Acc) => (node: FsNode): FsNode => {
    const uid = uidOf(from, node.owner), gid = gidOf(from, groupOf(node));
    const owner = uid === undefined ? node.owner : to.users.find(u => u.uid === uid)?.name ?? String(uid);
    const group = gid === undefined ? groupOf(node) : to.groups.find(g => g.gid === gid)?.name ?? String(gid);
    const { group: _g, ...rest } = node;
    void _g;
    return { ...rest, owner, ...group !== owner ? { group } : {} };
  };
  return { toContainer: map(h as unknown as Acc, k), toHost: map(k, h as unknown as Acc), uidOf: (name: string) => uidOf(k, name) };
}
/** What a mount shows, relative to its target ('' is the target itself), as the host (or the tmpfs) has it. */
function sourceOf(host: FsState, c: DockerContainer, m: DockerMount): Map<string, FsNode> {
  if (m.type === 'tmpfs') return new Map(c.tmpfs?.[m.target] ?? [['', ROOT_TMPFS]]);
  const root = hostPathOf(m), out = new Map<string, FsNode>();
  for (const [p, n] of host.nodes) if (isInside(p, root)) out.set(p === root ? '' : p.slice(root === '/' ? 0 : root.length), n);
  return out;
}
const mkdirs = (nodes: Map<string, FsNode>, path: string) => { if (path === '/' || nodes.has(path)) return; mkdirs(nodes, parentOf(path)); nodes.set(path, { kind: 'dir', mode: 0o755, owner: 'root' }); };

/** The container's file system as its processes see it: its own files with each mount laid over its target. */
export function mountedNodes(host: FsState, c: DockerContainer): Map<string, FsNode> {
  const nodes = new Map(c.nodes);
  if (!c.mounts?.length) return nodes;
  const ids = idMaps(host, c.nodes);
  for (const m of byDepth(c.mounts)) {
    for (const p of [...nodes.keys()]) if (isInside(p, m.target)) nodes.delete(p);
    mkdirs(nodes, parentOf(m.target));
    const src = sourceOf(host, c, m);
    for (const [rel, node] of src) nodes.set(`${m.target}${rel}`, m.type === 'tmpfs' ? node : ids.toContainer(node));
    if (!src.has('')) nodes.set(m.target, { kind: 'dir', mode: 0o755, owner: 'root' });
  }
  return nodes;
}
const same = (a: FsNode | undefined, b: FsNode | undefined) => !!a && !!b && a.kind === b.kind && a.mode === b.mode && a.owner === b.owner && groupOf(a) === groupOf(b) && (a.content ?? '') === (b.content ?? '') && (a.target ?? '') === (b.target ?? '');

/**
 * After a command: the container's own files, the host's files with what changed under its volumes and bind mounts
 * written back, its tmpfs, and the first path a read-only mount refused (its change is dropped).
 */
export function unmount(host: FsState, c: DockerContainer, after: ReadonlyMap<string, FsNode>):
  { nodes: ReadonlyMap<string, FsNode>; hostNodes: ReadonlyMap<string, FsNode>; tmpfs?: Record<string, ReadonlyMap<string, FsNode>>; refused?: string } {
  if (!c.mounts?.length) return { nodes: after, hostNodes: host.nodes };
  const ms = byDepth(c.mounts), owner = (p: string) => [...ms].reverse().find(m => isInside(p, m.target));
  const bucket = (all: ReadonlyMap<string, FsNode>) => {
    const own = new Map<string, FsNode>(), parts = new Map<DockerMount, Map<string, FsNode>>(ms.map(m => [m, new Map()]));
    for (const [p, n] of all) { const m = owner(p); if (m) parts.get(m)!.set(p === m.target ? '' : p.slice(m.target.length), n); else own.set(p, n); }
    return { own, parts };
  };
  const before = bucket(mountedNodes(host, c)), now = bucket(after), ids = idMaps(host, c.nodes);
  // What lies under a mount point in the container's own layer stays there, hidden.
  const nodes = new Map(now.own);
  for (const [p, n] of c.nodes) if (owner(p)) nodes.set(p, n);
  const hostNodes = new Map(host.nodes), tmpfs: Record<string, ReadonlyMap<string, FsNode>> = { ...c.tmpfs };
  let refused: string | undefined;
  for (const m of ms) {
    const was = before.parts.get(m)!, is = now.parts.get(m)!;
    const changed = [...is].filter(([rel, n]) => !same(was.get(rel), n)).map(([rel]) => rel), gone = [...was.keys()].filter(rel => rel !== '' && !is.has(rel));
    if (!changed.length && !gone.length) continue;
    if (m.readonly) { refused ??= `${m.target}${[...changed, ...gone].sort()[0]}`; continue; }
    if (m.type === 'tmpfs') { const t = new Map(is); if (!t.has('')) t.set('', was.get('') ?? ROOT_TMPFS); tmpfs[m.target] = t; continue; }
    const root = hostPathOf(m), at = (rel: string) => `${root === '/' ? '' : root}${rel}` || '/';
    for (const rel of gone) hostNodes.delete(at(rel));
    for (const rel of changed) hostNodes.set(rel === '' ? root : at(rel), ids.toHost(is.get(rel)!));
  }
  return { nodes, hostNodes, ...Object.keys(tmpfs).length ? { tmpfs } : {}, ...refused ? { refused } : {} };
}

/** What a read-only mount makes a command print (coreutils' and dash's texts for the usual writers). */
export function readOnlyError(line: string, path: string, workdir: string): string {
  const words = line.split(/\s+/).filter(Boolean), cmd = words[0]?.slice(words[0].lastIndexOf('/') + 1) ?? '';
  const abs = (w: string) => resolvePath({ cwd: workdir, home: '/root' }, w);
  const word = [...words.slice(1)].reverse().find(w => !w.startsWith('-') && (abs(w) === path || isInside(path, abs(w)))) ?? path;
  const redirect = /(?:^|[^0-9&])>>?\s*(\S+)/.exec(line);
  if (redirect && (abs(redirect[1]) === path || isInside(path, abs(redirect[1])))) return `sh: 1: cannot create ${redirect[1]}: Read-only file system`;
  switch (cmd) {
    case 'touch': return `touch: cannot touch '${word}': Read-only file system`;
    case 'mkdir': return `mkdir: cannot create directory '${word}': Read-only file system`;
    case 'rm': return `rm: cannot remove '${word}': Read-only file system`;
    case 'cp': return `cp: cannot create regular file '${word}': Read-only file system`;
    case 'mv': return `mv: cannot move '${words[words.length - 2] ?? ''}' to '${word}': Read-only file system`;
    case 'chmod': return `chmod: changing permissions of '${word}': Read-only file system`;
    case 'chown': return `chown: changing ownership of '${word}': Read-only file system`;
    case 'tar': return `tar: ${word}: Cannot open: Read-only file system`;
  }
  return `${cmd || 'sh'}: ${word}: Read-only file system`;
}

/**
 * At creation: the volumes a container needs exist (a named one is created, an anonymous one named by Docker), a missing
 * -v bind source is created as a root folder, every mount point exists in the container, and a new empty volume is first
 * filled with what the image has at its mount point (Docker's copy-up; a bind mount never is).
 */
export function prepareMounts(host: FsState, d: DockerState, c: DockerContainer, now: Seconds): { host: FsState; d: DockerState; c: DockerContainer } {
  if (!c.mounts?.length) return { host, d, c };
  const hostNodes = new Map(host.nodes), nodes = new Map(c.nodes);
  let volumes = [...d.volumes ?? []];
  const ids = idMaps(host, c.nodes);
  for (const m of c.mounts) {
    if (m.type === 'volume') {
      const fresh = !volumes.some(v => v.name === m.source);
      if (fresh) { volumes = [...volumes, { name: m.source, created: now, ...m.anonymous ? { anonymous: true as const } : {} }]; ensureVolumeDir(hostNodes, m.source); }
      const root = volumeDir(m.source), empty = ![...hostNodes.keys()].some(p => p !== root && isInside(p, root));
      const image = c.nodes.get(m.target);
      if (empty && image?.kind === 'dir') {
        hostNodes.set(root, ids.toHost(image));
        for (const [p, n] of c.nodes) if (p !== m.target && isInside(p, m.target)) hostNodes.set(`${root}${p.slice(m.target.length)}`, ids.toHost(n));
      }
    } else if (m.type === 'bind' && !hostNodes.has(m.source)) mkdirs(hostNodes, m.source);
    if (!nodes.has(m.target)) { mkdirs(nodes, parentOf(m.target)); nodes.set(m.target, hostNodes.get(hostPathOf(m))?.kind === 'file' ? { kind: 'file', mode: 0o755, owner: 'root', content: '' } : { kind: 'dir', mode: 0o755, owner: 'root' }); }
  }
  return { host: { ...host, nodes: hostNodes }, d: { ...d, volumes }, c: { ...c, nodes } };
}
/** /var/lib/docker/volumes/NAME/_data (drwx-----x for the folders Docker keeps for itself). */
export function ensureVolumeDir(nodes: Map<string, FsNode>, name: string) {
  mkdirs(nodes, '/var/lib/docker');
  if (!nodes.has(VOLUMES_DIR)) nodes.set(VOLUMES_DIR, { kind: 'dir', mode: 0o701, owner: 'root' });
  if (!nodes.has(`${VOLUMES_DIR}/${name}`)) nodes.set(`${VOLUMES_DIR}/${name}`, { kind: 'dir', mode: 0o701, owner: 'root' });
  if (!nodes.has(volumeDir(name))) nodes.set(volumeDir(name), { kind: 'dir', mode: 0o755, owner: 'root' });
}
/** Bytes of a volume's files (docker volume prune adds them up). */
export const volumeBytes = (host: FsState, name: string) => [...host.nodes].filter(([p, n]) => n.kind === 'file' && isInside(p, volumeDir(name))).reduce((t, [, n]) => t + new TextEncoder().encode(n.content ?? '').length, 0);
export const removeVolumeDir = (nodes: Map<string, FsNode>, name: string) => { for (const p of [...nodes.keys()]) if (isInside(p, `${VOLUMES_DIR}/${name}`)) nodes.delete(p); };
/** The containers (any state) that use a volume. */
export const volumeUsers = (d: DockerState, name: string) => d.containers.filter(c => (c.mounts ?? []).some(m => m.type === 'volume' && m.source === name));

// ------------------------------------------------------------------------------------------------- -v, --mount, --tmpfs

/** docker run -v SOURCE:TARGET[:OPTIONS] or -v TARGET (an anonymous volume); ./relative and absolute sources are bind mounts. */
export function parseVolumeFlag(text: string, cwd: string, id: string): DockerMount | { error: string } {
  const parts = text.split(':');
  if (parts.length === 1) {
    if (!text.startsWith('/')) return { error: `Error response from daemon: invalid volume specification: '${text}': invalid mount config for type "volume": invalid mount path: '${text}' mount path must be absolute` };
    return { type: 'volume', source: anonymousName(id, text), target: normalize(text), readonly: false, anonymous: true, via: 'v' };
  }
  if (parts.length > 3) return { error: `invalid spec: ${text}: too many colons` };
  const [source, target, opts = ''] = parts;
  const options = opts ? opts.split(',') : [];
  if (options.some(o => !['ro', 'rw', 'z', 'Z'].includes(o))) return { error: `Error response from daemon: invalid mode: ${opts}` };
  if (!target.startsWith('/')) return { error: `Error response from daemon: invalid volume specification: '${text}': invalid mount config for type "${source.startsWith('/') || source.startsWith('.') ? 'bind' : 'volume'}": invalid mount path: '${target}' mount path must be absolute` };
  const readonly = options.includes('ro');
  if (source.startsWith('/') || source.startsWith('./') || source === '.' || source.startsWith('../')) return { type: 'bind', source: resolvePath({ cwd, home: '/' }, source), target: normalize(target), readonly, via: 'v' };
  if (!isVolumeName(source)) return { error: `Error response from daemon: create ${source}: "${source}" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path` };
  return { type: 'volume', source, target: normalize(target), readonly, via: 'v' };
}
/** docker run --mount type=volume|bind|tmpfs,source=…,target=…[,readonly] (docker/cli's MountOpt). */
export function parseMountFlag(text: string, cwd: string, id: string): DockerMount | { error: string } {
  let type = 'volume', source: string | undefined, target: string | undefined, readonly = false;
  for (const field of text.split(',')) {
    const eq = field.indexOf('='), key = (eq < 0 ? field : field.slice(0, eq)).toLowerCase(), value = eq < 0 ? undefined : field.slice(eq + 1);
    if (key === 'type') type = value ?? '';
    else if (key === 'source' || key === 'src') source = value;
    else if (key === 'target' || key === 'destination' || key === 'dst') target = value;
    else if (key === 'readonly' || key === 'ro') { if (value === undefined || ['true', '1'].includes(value)) readonly = true; else if (['false', '0'].includes(value)) readonly = false; else return { error: `invalid argument "${text}" for "--mount" flag: invalid value for ${key}: ${value}` }; }
    else if (['volume-nocopy', 'bind-propagation', 'consistency', 'tmpfs-size', 'tmpfs-mode', 'volume-driver'].includes(key)) continue;
    else return { error: `invalid argument "${text}" for "--mount" flag: unexpected key '${key}' in '${field}'` };
  }
  if (!['volume', 'bind', 'tmpfs'].includes(type)) return { error: `invalid argument "${text}" for "--mount" flag: invalid type '${type}'（模擬環境只支援 volume、bind 與 tmpfs）` };
  if (!target) return { error: `invalid argument "${text}" for "--mount" flag: target is required` };
  if (!target.startsWith('/')) return { error: `Error response from daemon: invalid mount config for type "${type}": invalid mount path: '${target}' mount path must be absolute` };
  if (type === 'tmpfs') {
    if (source) return { error: `Error response from daemon: invalid mount config for type "tmpfs": field Source must not be specified` };
    return { type: 'tmpfs', source: '', target: normalize(target), readonly, via: 'mount' };
  }
  if (type === 'bind') {
    if (!source) return { error: 'Error response from daemon: invalid mount config for type "bind": field Source must not be empty' };
    return { type: 'bind', source: resolvePath({ cwd, home: '/' }, source), target: normalize(target), readonly, via: 'mount' };
  }
  if (source !== undefined && !isVolumeName(source)) return { error: `Error response from daemon: create ${source}: "${source}" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path` };
  return source ? { type: 'volume', source, target: normalize(target), readonly, via: 'mount' } : { type: 'volume', source: anonymousName(id, target), target: normalize(target), readonly, anonymous: true, via: 'mount' };
}
const normalize = (p: string) => resolvePath({ cwd: '/', home: '/' }, p);
export const anonymousName = (id: string, target: string) => hex(`volume/${id}/${target}`);

// ------------------------------------------------------------------------------------------------- the container's network

const LATENCY = 0.03;
/** The ports a running container's main process listens on: its HTTP service (with its responder) and the image's EXPOSE. */
export function serviceListeners(d: DockerState, c: DockerContainer, now?: Seconds): { port: number; http?: { port: number; responder: Responder; accessLog?: 'nginx' } }[] {
  if (c.status !== 'running') return [];
  // E23: a service the lesson says takes `ready` seconds to start refuses connections until then (seen from containers).
  if (now !== undefined && c.readyAt !== undefined && now < c.readyAt) return [];
  const img = d.images.find(i => i.id === c.image);
  const own = !c.custom && !img?.ownMain;
  if (!c.http && !(own && img?.service)) return [];
  const http = c.http ?? (own ? img?.http : undefined), out: { port: number; http?: { port: number; responder: Responder; accessLog?: 'nginx' } }[] = [];
  if (http) out.push({ port: http.port, http });
  for (const p of img?.expose ?? []) if (!out.some(x => x.port === p)) out.push({ port: p });
  return out;
}
const procOf = (c: DockerContainer, listen: Listen[], now: Seconds): Proc => ({
  pid: 1, ppid: 0, user: (c.user ?? 'root').split(':')[0], command: (c.path.endsWith('.sh') && c.args.length ? c.args : [c.path, ...c.args]).join(' ') || c.path, stat: 'Ss', cpu: 0, rss: 4096, vsz: 8192, shr: 2048, tty: '?',
  start: c.started ?? now, time: 0, nice: 0, ...listen?.length ? { listen } : {},
});
/** A container's listeners and their responders (a request to another container goes straight to it: direct). */
function served(d: DockerState, c: DockerContainer, tag: string, direct: boolean, now?: Seconds): { listen: Listen[]; responders: Responder[] } {
  const listen: Listen[] = [], responders: Responder[] = [];
  for (const l of serviceListeners(d, c, now)) {
    const id = `docker-${short(c.id)}-${tag}${l.port}`;
    if (l.http) responders.push({ ...l.http.responder, id, ...direct ? { container: c.id, direct: true } : {} });
    listen.push({ port: l.port, fd: 3 + listen.length, ...l.http ? { http: id } : {} });
  }
  return { listen, responders };
}

/** E22: a --network host container's listeners on the host (its main process) and their responders. */
export const hostServed = (d: DockerState, c: DockerContainer) => served(d, c, 'h', true);

/**
 * The network a container's commands see: its interfaces, its own listeners, and the running containers it shares a
 * network with (their names when Docker's DNS knows them: a user-defined network). host: the host's network; none: lo.
 */
export function networkView(host: FsState, d: DockerState, c: DockerContainer): Pick<FsState, 'sockets' | 'processes' | 'http' | 'net' | 'links'> {
  const now = clockOf(host).now, mode = modeOf(c);
  if (mode === 'host') return { ...host.sockets ? { sockets: host.sockets } : {}, ...host.processes ? { processes: host.processes } : {}, ...host.http ? { http: host.http } : {}, ...host.net ? { net: host.net } : {}, ...host.links ? { links: host.links } : {} };
  const mine = mode === 'none' ? [] : attachments(d, c).filter(x => x.a.ip && x.net.driver === 'bridge');
  const iface = (ip: string, net: DockerNetwork, i: number): Iface => ({ name: `eth${i}`, address: ip, prefix: prefixOf(net.subnet), mac: macOf(ip) });
  const own = served(d, c, 'c', false, now);
  const peers: RemoteHost[] = [], paths: { hops: { address: string; name?: string; rtt: number }[] }[] = [];
  // Docker's DNS answers each name with an A record (getent hosts prints the name asked), so every name is an entry of its own.
  const named = (names: readonly string[], address: string, state: FsState): RemoteHost[] => names.map(host => ({ host, address, aliases: [], passwords: [], state }));
  const userNets = mine.filter(x => !x.net.builtin);
  if (userNets.length) peers.push(...named([c.name, ...userNets.flatMap(x => [...x.a.aliases, `${c.name}.${x.name}`])], userNets[0].a.ip!, { nodes: new Map(), cwd: '/', user: 'root', home: '/root' }));
  for (const o of d.containers) {
    if (o.id === c.id || o.status !== 'running' || modeOf(o) !== 'bridge') continue;
    const shared = mine.map(x => ({ x, ip: o.networks?.[x.name]?.ip ?? (x.name === 'bridge' ? o.ip : undefined) })).filter((s): s is { x: typeof mine[number]; ip: string } => !!s.ip);
    if (!shared.length) continue;
    const dns = shared.filter(s => !s.x.net.builtin), svc = served(d, o, 'c', true, now);
    const state: FsState = {
      nodes: host.nodes, cwd: '/', user: 'root', home: '/root', host: o.name, ...host.accounts ? { accounts: host.accounts } : {}, docker: d,
      sockets: { interfaces: shared.map((s, i) => iface(s.ip, s.x.net, i)), connections: [] }, processes: [procOf(o, svc.listen, now)], http: { responders: svc.responders }, links: { latency: LATENCY },
    };
    const address = (dns[0] ?? shared[0]).ip;
    // On the default bridge only the address leads there (no names).
    peers.push(...dns.length ? named([o.name, short(o.id), ...dns.flatMap(s => [...o.networks?.[s.x.name]?.aliases ?? [], `${o.name}.${s.x.name}`])], address, state) : named([address], address, state));
    for (const s of dns) paths.push({ hops: [{ address: s.ip, name: `${o.name}.${s.x.name}`, rtt: 2 * LATENCY }] });
  }
  return {
    sockets: { interfaces: mine.map((x, i) => iface(x.a.ip!, x.net, i)), ...mine[0]?.net.gateway ? { gateway: mine[0].net.gateway } : {}, connections: [] },
    processes: [procOf(c, own.listen, now)], http: { responders: own.responders },
    net: { address: mine[0]?.a.ip ?? '127.0.0.1', seed: c.id, hosts: peers, connections: 0 }, links: { latency: LATENCY, paths },
  };
}
/** The access lines the other containers' services wrote while a command of this view ran (docker logs of those containers). */
export function peerLogs(view: FsState, before: DockerState): Record<string, LogLine[]> {
  const out: Record<string, LogLine[]> = {};
  for (const h of view.net?.hosts ?? []) {
    const d = h.state.docker;
    if (!d || d === before) continue;
    for (const c of d.containers) { const old = before.containers.find(x => x.id === c.id); if (old && c.logs.length !== old.logs.length) out[c.id] = [...c.logs]; }
  }
  return out;
}

/** E22: reads a file of a running container's file system for its HTTP service (a folder serves its index.html, as nginx does). */
export function containerReader(host: FsState, id: string): (path: string) => string | undefined {
  const d = host.docker, c = d?.containers.find(x => x.id === id);
  if (!d || !c) return () => undefined;
  const nodes = mountedNodes(host, c);
  return path => {
    const p = resolvePath({ cwd: '/', home: '/' }, path), n = nodes.get(p);
    if (n?.kind === 'file') return n.content ?? '';
    const index = nodes.get(`${p === '/' ? '' : p}/index.html`);
    return n?.kind === 'dir' && index?.kind === 'file' ? index.content ?? '' : undefined;
  };
}

/** Where a name leads from a container (its /etc/hosts, its own names, the containers Docker's DNS knows), or null. */
export function containerLookup(view: FsState, name: string): string | null {
  if (isIPv4(name)) return name;
  const hostsLine = (view.nodes.get('/etc/hosts')?.content ?? '').split('\n').map(l => l.replace(/#.*/, '').trim().split(/\s+/)).find(f => f.length > 1 && isIPv4(f[0]) && f.slice(1).includes(name));
  if (hostsLine) return hostsLine[0];
  const h = view.net?.hosts.find(x => x.host === name || x.aliases.includes(name));
  return h ? h.address : null;
}

// ------------------------------------------------------------------------------------------------- inspect

/** docker inspect's Mounts (MountPoint: Type, Name, Source, Destination, Driver, Mode, RW, Propagation). */
export function mountsJson(c: DockerContainer): Record<string, unknown>[] {
  return (c.mounts ?? []).map(m => m.type === 'volume'
    ? { Type: 'volume', Name: m.source, Source: volumeDir(m.source), Destination: m.target, Driver: 'local', Mode: m.via === 'v' ? (m.readonly ? 'ro' : 'z') : '', RW: !m.readonly, Propagation: '' }
    : m.type === 'bind' ? { Type: 'bind', Source: m.source, Destination: m.target, Mode: m.via === 'v' && m.readonly ? 'ro' : '', RW: !m.readonly, Propagation: 'rprivate' }
      : { Type: 'tmpfs', Source: '', Destination: m.target, Mode: '', RW: !m.readonly, Propagation: '' });
}
/** docker inspect's NetworkSettings.Networks (EndpointSettings of each network). */
export function networksJson(d: DockerState, c: DockerContainer): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { net, name, a } of attachments(d, c)) {
    const running = c.status === 'running' && !!a.ip;
    out[name] = {
      IPAMConfig: null, Links: null, Aliases: a.aliases.length ? [...a.aliases] : null, MacAddress: running ? macOf(a.ip!) : '', DriverOpts: null, NetworkID: net.id,
      EndpointID: running ? hex(`endpoint/${net.id}/${c.id}/${c.started ?? 0}`) : '', Gateway: running ? net.gateway ?? '' : '', IPAddress: running ? a.ip : '', IPPrefixLen: running ? prefixOf(net.subnet) : 0,
      IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0, DNSNames: net.builtin ? null : [c.name, short(c.id), ...a.aliases],
    };
  }
  return out;
}
/** docker network inspect's object. */
export function networkJson(d: DockerState, n: DockerNetwork): Record<string, unknown> {
  const containers: Record<string, unknown> = {};
  for (const c of d.containers) {
    const a = c.networks?.[n.name] ?? (n.name === 'bridge' && !c.networks && c.ip ? { aliases: [], ip: c.ip } : undefined);
    if (!a || c.status !== 'running' || (n.driver === 'bridge' && !a.ip)) continue;
    containers[c.id] = { Name: c.name, EndpointID: hex(`endpoint/${n.id}/${c.id}/${c.started ?? 0}`), MacAddress: a.ip ? macOf(a.ip) : '', IPv4Address: a.ip ? `${a.ip}/${prefixOf(n.subnet)}` : '', IPv6Address: '' };
  }
  const bridgeOptions = { 'com.docker.network.bridge.default_bridge': 'true', 'com.docker.network.bridge.enable_icc': 'true', 'com.docker.network.bridge.enable_ip_masquerade': 'true', 'com.docker.network.bridge.host_binding_ipv4': '0.0.0.0', 'com.docker.network.bridge.name': 'docker0', 'com.docker.network.driver.mtu': '1500' };
  return {
    Name: n.name, Id: n.id, Created: `${isoText(n.created).replace(' ', 'T')}.000000000Z`, Scope: 'local', Driver: n.driver, EnableIPv6: false,
    IPAM: { Driver: 'default', Options: n.builtin ? null : {}, Config: n.subnet ? [{ Subnet: n.subnet, Gateway: n.gateway }] : [] },
    Internal: false, Attachable: false, Ingress: false, ConfigFrom: { Network: '' }, ConfigOnly: false, Containers: containers, Options: n.name === 'bridge' ? bridgeOptions : {}, Labels: {},
  };
}
export const volumeJson = (v: DockerVolume) => ({
  CreatedAt: `${isoText(v.created).replace(' ', 'T')}Z`, Driver: 'local', Labels: v.anonymous ? { 'com.docker.volume.anonymous': '' } : null, Mountpoint: volumeDir(v.name), Name: v.name, Options: null, Scope: 'local',
});

/** The image's VOLUME paths that no other mount covers become anonymous volumes. */
export function imageVolumes(img: DockerImage, mounts: readonly DockerMount[], id: string): DockerMount[] {
  return (img.volumes ?? []).filter(p => !mounts.some(m => m.target === p)).map(p => ({ type: 'volume' as const, source: anonymousName(id, p), target: p, readonly: false, anonymous: true as const, via: 'v' as const }));
}
