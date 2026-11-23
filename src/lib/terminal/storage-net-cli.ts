import { type FsNode, type FsState } from './fs';
import { isoText, type Seconds } from './clock';
import { hex } from './build';
import { ipNumber, ipText, isIPv4, networkOf, parseCidr } from './sockets';
import { findContainer, formatted, humanSize, syncDocker, type DockerContainer, type DockerState } from './docker';
import {
  assignAddresses, ensureVolumeDir, findNetwork, hostsText, isVolumeName, modeOf, NETWORK_NAME, networkJson, networksOf, nextSubnet, overlaps, removeVolumeDir, resolvText,
  volumeBytes, volumeDir, volumeJson, volumeUsers, type DockerNetwork,
} from './storage-net';

/*
 * Engine stage E22 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §12): docker volume and docker network with Docker CE
 * 27.5.1's texts, and the Go template subset docker inspect -f takes on the storage-net profile (fields, json, range and
 * index; a map of pointers such as .NetworkSettings.Networks prints its pointers, as the typed value does).
 */

export interface E22Cli {
  state: FsState; d: DockerState; args: readonly string[]; now: Seconds; stdin?: string | null;
  out(line: string): void; raw(data: string): void; err(line: string): void;
}
export type E22Result = { state: FsState; status: number };
const short = (id: string) => id.slice(0, 12);

/** The answer to a [y/N] question read from standard input (undefined: no keyboard). */
function confirm(x: E22Cli, warning: string): boolean | undefined {
  x.out(warning);
  const answer = x.stdin === null || x.stdin === undefined ? undefined : x.stdin.split('\n')[0].trim().toLowerCase();
  if (answer === undefined) { x.out('Are you sure you want to continue? [y/N] '); return undefined; }
  x.raw('Are you sure you want to continue? [y/N] ');
  if (answer !== 'y' && answer !== 'yes') { x.out(''); return false; }
  return true;
}
const help = (x: E22Cli, group: 'volume' | 'network', title: string, rows: [string, string][]) => {
  ['', `Usage:  docker ${group} COMMAND`, '', title, '', 'Commands:', ...rows.map(([c, t]) => `  ${c.padEnd(12)}${t}`), '', `Run 'docker ${group} COMMAND --help' for more information on a command.`].forEach(l => x.out(l));
  return { state: x.state, status: 0 };
};
/** docker/cli's usage error of a subcommand. */
function usage(x: E22Cli, path: string, line: string, use: string, what: string): E22Result {
  x.err(line); x.err(`See '${path} --help'.`); x.err(''); x.err(`Usage:  ${path} ${use}`); x.err(''); x.err(what);
  return { state: x.state, status: 1 };
}
const flagError = (x: E22Cli, path: string, flag: string): E22Result => { x.err(flag.startsWith('--') ? `unknown flag: ${flag}` : `unknown shorthand flag: '${flag[1]}' in ${flag}`); x.err(`See '${path} --help'.`); return { state: x.state, status: 125 }; };
/** Options with a value (--format x, --format=x, -f x) and the other words. */
function options(args: readonly string[], valued: readonly string[], flags: readonly string[]): { values: Record<string, string[]>; set: Set<string>; words: string[] } | { bad: string } {
  const values: Record<string, string[]> = {}, set = new Set<string>(), words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i], eq = a.startsWith('--') ? a.indexOf('=') : -1, name = eq < 0 ? a : a.slice(0, eq);
    if (valued.includes(name)) { (values[name] ??= []).push(eq < 0 ? args[++i] ?? '' : a.slice(eq + 1)); continue; }
    if (flags.includes(a)) { set.add(a); continue; }
    if (/^-[a-zA-Z]{2,}$/.test(a) && [...a.slice(1)].every(ch => flags.includes(`-${ch}`))) { [...a.slice(1)].forEach(ch => set.add(`-${ch}`)); continue; }
    if (a.startsWith('-') && a !== '-') return { bad: a };
    words.push(a);
  }
  return { values, set, words };
}

// ------------------------------------------------------------------------------------------------- docker volume

/** docker volume create | ls | inspect | rm | prune. */
export function volumeCli(x: E22Cli): E22Result {
  const [cmd, ...rest] = x.args, d = x.d;
  const path = `docker volume ${cmd}`;
  const commit = (next: DockerState, nodes?: ReadonlyMap<string, FsNode>): FsState => syncDocker({ ...x.state, ...nodes ? { nodes } : {}, docker: next });
  if (!cmd) return help(x, 'volume', 'Manage volumes', [['create', 'Create a volume'], ['inspect', 'Display detailed information on one or more volumes'], ['ls', 'List volumes'], ['prune', 'Remove unused local volumes'], ['rm', 'Remove one or more volumes']]);
  const volumes = d.volumes ?? [];
  switch (cmd) {
    case 'create': {
      const o = options(rest, ['-d', '--driver', '--name', '--label', '-o', '--opt'], []);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (o.values['--label'] || o.values['-o'] || o.values['--opt']) { x.err('docker volume create：模擬環境不支援 --label 與 -o（只有 local 驅動程式的預設值）'); return { state: x.state, status: 1 }; }
      const names = [...o.values['--name'] ?? [], ...o.words];
      if (names.length > 1) return usage(x, path, `"${path}" requires at most 1 argument.`, '[OPTIONS] [VOLUME]', 'Create a volume');
      const name = names[0] ?? hex(`volume/create/${x.now}/${volumes.length}`);
      const driver = [...o.values['-d'] ?? [], ...o.values['--driver'] ?? []].at(-1) ?? 'local';
      if (driver !== 'local') { x.err(`Error response from daemon: create ${name}: error looking up volume plugin ${driver}: plugin "${driver}" not found`); return { state: x.state, status: 1 }; }
      if (!isVolumeName(name)) { x.err(`Error response from daemon: create ${name}: "${name}" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path`); return { state: x.state, status: 1 }; }
      x.out(name);
      if (volumes.some(v => v.name === name)) return { state: x.state, status: 0 };
      const nodes = new Map(x.state.nodes);
      ensureVolumeDir(nodes, name);
      return { state: commit({ ...d, volumes: [...volumes, { name, created: x.now }] }, nodes), status: 0 };
    }
    case 'ls': case 'list': {
      const o = options(rest, ['--format', '-f', '--filter'], ['-q', '--quiet']);
      if ('bad' in o) return flagError(x, `docker volume ${cmd}`, o.bad);
      let list = [...volumes].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const f of [...o.values['-f'] ?? [], ...o.values['--filter'] ?? []]) {
        const eq = f.indexOf('='), k = f.slice(0, eq), v = f.slice(eq + 1);
        if (eq < 0) { x.err(`invalid argument "${f}" for "-f, --filter" flag: bad format of filter (expected name=value)`); x.err(`See '${path} --help'.`); return { state: x.state, status: 125 }; }
        if (k === 'dangling') { const yes = ['true', '1'].includes(v); if (!yes && !['false', '0'].includes(v)) { x.err(`Error response from daemon: invalid filter 'dangling=${v}'`); return { state: x.state, status: 1 }; } list = list.filter(vol => !volumeUsers(d, vol.name).length === yes); }
        else if (k === 'name') list = list.filter(vol => vol.name.includes(v));
        else if (k === 'driver') list = list.filter(() => v === 'local');
        else { x.err('docker volume ls：模擬環境的 --filter 只支援 dangling=、name= 與 driver='); return { state: x.state, status: 1 }; }
      }
      if (o.set.has('-q') || o.set.has('--quiet')) { list.forEach(v => x.out(v.name)); return { state: x.state, status: 0 }; }
      const rows = list.map(v => ({ Driver: 'local', Name: v.name, Scope: 'local', Mountpoint: volumeDir(v.name), Labels: v.anonymous ? 'com.docker.volume.anonymous=' : '' }));
      const r = formatted(o.values['--format']?.at(-1) ?? 'table {{.Driver}}\t{{.Name}}', rows, { Driver: 'DRIVER', Name: 'VOLUME NAME', Scope: 'SCOPE', Mountpoint: 'MOUNTPOINT', Labels: 'LABELS' });
      if ('error' in r) { x.err(r.error); return { state: x.state, status: 1 }; }
      r.lines.forEach(l => x.out(l));
      return { state: x.state, status: 0 };
    }
    case 'inspect': {
      const o = options(rest, ['-f', '--format'], []);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (!o.words.length) return usage(x, path, `"${path}" requires at least 1 argument.`, '[OPTIONS] VOLUME [VOLUME...]', 'Display detailed information on one or more volumes');
      const found: Record<string, unknown>[] = [], missing: string[] = [];
      for (const n of o.words) { const v = volumes.find(vol => vol.name === n); if (v) found.push(volumeJson(v)); else missing.push(n); }
      const format = [...o.values['-f'] ?? [], ...o.values['--format'] ?? []].at(-1);
      const status = printObjects(x, found, format);
      missing.forEach(n => x.err(`Error response from daemon: get ${n}: no such volume`));
      return { state: x.state, status: missing.length ? 1 : status };
    }
    case 'rm': case 'remove': {
      const o = options(rest, [], ['-f', '--force']);
      if ('bad' in o) return flagError(x, `docker volume ${cmd}`, o.bad);
      if (!o.words.length) return usage(x, `docker volume ${cmd}`, `"docker volume ${cmd}" requires at least 1 argument.`, '[OPTIONS] VOLUME [VOLUME...]', 'Remove one or more volumes. You cannot remove a volume that is in use by a container.');
      const force = o.set.has('-f') || o.set.has('--force');
      let next = d, status = 0;
      const nodes = new Map(x.state.nodes);
      for (const n of o.words) {
        const v = (next.volumes ?? []).find(vol => vol.name === n);
        if (!v) { if (!force) { x.err(`Error response from daemon: get ${n}: no such volume`); status = 1; } continue; }
        const users = volumeUsers(next, n);
        if (users.length) { x.err(`Error response from daemon: remove ${n}: volume is in use - [${users.map(c => c.id).join(', ')}]`); status = 1; continue; }
        removeVolumeDir(nodes, n);
        next = { ...next, volumes: (next.volumes ?? []).filter(vol => vol.name !== n) };
        x.out(n);
      }
      return { state: commit(next, nodes), status };
    }
    case 'prune': {
      const o = options(rest, ['--filter'], ['-f', '--force', '-a', '--all']);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (o.values['--filter']) { x.err('docker volume prune：模擬環境不支援 --filter'); return { state: x.state, status: 1 }; }
      const all = o.set.has('-a') || o.set.has('--all');
      if (!o.set.has('-f') && !o.set.has('--force')) {
        const ok = confirm(x, all ? 'WARNING! This will remove all local volumes not used by at least one container.' : 'WARNING! This will remove anonymous local volumes not used by at least one container.');
        if (ok === undefined) { x.err('（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker volume prune）'); return { state: x.state, status: 1 }; }
        if (!ok) return { state: x.state, status: 0 };
      }
      // Since Docker 23, prune removes only anonymous volumes unless -a (--all) is given.
      const gone = volumes.filter(v => (all || v.anonymous) && !volumeUsers(d, v.name).length).sort((a, b) => a.name < b.name ? -1 : 1);
      const nodes = new Map(x.state.nodes), freed = gone.reduce((t, v) => t + volumeBytes(x.state, v.name), 0);
      gone.forEach(v => removeVolumeDir(nodes, v.name));
      if (gone.length) { x.out('Deleted Volumes:'); gone.forEach(v => x.out(v.name)); x.out(''); }
      x.out(`Total reclaimed space: ${humanSize(freed)}`);
      return { state: commit({ ...d, volumes: volumes.filter(v => !gone.includes(v)) }, nodes), status: 0 };
    }
  }
  x.err(`docker: 'volume ${cmd}' is not a docker command.`); x.err("See 'docker --help'");
  return { state: x.state, status: 1 };
}

// ------------------------------------------------------------------------------------------------- docker network

const BRIDGE_ONLY = 'docker network create：模擬環境只支援 bridge 驅動程式（macvlan、ipvlan 等不模擬）';
/** docker network create | ls | inspect | connect | disconnect | rm | prune. */
export function networkCli(x: E22Cli): E22Result {
  const [cmd, ...rest] = x.args, d = x.d, nets = networksOf(d);
  const path = `docker network ${cmd}`;
  const fail = (line: string, status = 1): E22Result => { x.err(line); return { state: x.state, status }; };
  const commit = (next: DockerState): FsState => syncDocker({ ...x.state, docker: next });
  if (!cmd) return help(x, 'network', 'Manage networks', [['connect', 'Connect a container to a network'], ['create', 'Create a network'], ['disconnect', 'Disconnect a container from a network'], ['inspect', 'Display detailed information on one or more networks'], ['ls', 'List networks'], ['prune', 'Remove all unused networks'], ['rm', 'Remove one or more networks']]);
  switch (cmd) {
    case 'create': {
      const o = options(rest, ['-d', '--driver', '--subnet', '--gateway', '--ip-range', '--label', '-o', '--opt'], ['--internal', '--attachable', '--ipv6']);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (o.words.length !== 1) return usage(x, path, `"${path}" requires exactly 1 argument.`, '[OPTIONS] NETWORK', 'Create a network');
      if (o.set.has('--internal') || o.set.has('--ipv6') || o.values['--ip-range'] || o.values['--label'] || o.values['-o'] || o.values['--opt']) return fail('docker network create：模擬環境只支援 --driver bridge、--subnet 與 --gateway');
      const name = o.words[0], driver = [...o.values['-d'] ?? [], ...o.values['--driver'] ?? []].at(-1) ?? 'bridge';
      if (driver === 'overlay') return fail('Error response from daemon: This node is not a swarm manager. Use "docker swarm init" or "docker swarm join" to connect this node to swarm and try again.');
      if (driver === 'host' || driver === 'null') return fail(`Error response from daemon: only one instance of "${driver}" network is allowed`);
      if (driver !== 'bridge') return fail(BRIDGE_ONLY);
      if (!NETWORK_NAME.test(name)) return fail(`Error response from daemon: invalid network name "${name}"（模擬環境：名稱是 [a-zA-Z0-9][a-zA-Z0-9_.-]）`);
      if (nets.some(n => n.name === name)) return fail(`Error response from daemon: network with name ${name} already exists`);
      let subnet: string, gateway: string;
      const given = o.values['--subnet']?.at(-1), gw = o.values['--gateway']?.at(-1);
      if (given !== undefined) {
        const c = parseCidr(given);
        if (!c) return fail(`Error response from daemon: invalid CIDR address: ${given}`);
        subnet = `${networkOf(c.address, c.prefix)}/${c.prefix}`;
        if (nets.some(n => { const t = parseCidr(n.subnet ?? ''); return t && overlaps(c.address, c.prefix, t.address, t.prefix); })) return fail('Error response from daemon: invalid pool request: Pool overlaps with other one on this address space');
        if (gw !== undefined && (!isIPv4(gw) || networkOf(gw, c.prefix) !== networkOf(c.address, c.prefix))) return fail(`Error response from daemon: no matching subnet for gateway ${gw}`);
        gateway = gw ?? ipText(ipNumber(networkOf(c.address, c.prefix)) + 1);
      } else {
        if (gw !== undefined) return fail('Error response from daemon: invalid pool request: gateway without a subnet（模擬環境：--gateway 要和 --subnet 一起使用）');
        const next = nextSubnet(d);
        if (!next) return fail('Error response from daemon: could not find an available, non-overlapping IPv4 address pool among the defaults to assign to the network');
        ({ subnet, gateway } = next);
      }
      const net: DockerNetwork = { name, id: hex(`network/${name}/${x.now}/${nets.length}`), driver: 'bridge', subnet, gateway, created: x.now };
      x.out(net.id);
      return { state: commit({ ...d, networks: [...nets, net] }), status: 0 };
    }
    case 'ls': case 'list': {
      const o = options(rest, ['--format', '-f', '--filter'], ['-q', '--quiet', '--no-trunc']);
      if ('bad' in o) return flagError(x, `docker network ${cmd}`, o.bad);
      let list = [...nets].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const f of [...o.values['-f'] ?? [], ...o.values['--filter'] ?? []]) {
        const eq = f.indexOf('='), k = f.slice(0, eq), v = f.slice(eq + 1);
        if (k === 'name') list = list.filter(n => n.name.includes(v));
        else if (k === 'driver') list = list.filter(n => n.driver === v);
        else if (k === 'type') { if (v !== 'custom' && v !== 'builtin') return fail(`Error response from daemon: invalid filter: 'type'='${v}'`); list = list.filter(n => !!n.builtin === (v === 'builtin')); }
        else return fail('docker network ls：模擬環境的 --filter 只支援 name=、driver= 與 type=custom|builtin');
      }
      const full = o.set.has('--no-trunc');
      if (o.set.has('-q') || o.set.has('--quiet')) { list.forEach(n => x.out(full ? n.id : short(n.id))); return { state: x.state, status: 0 }; }
      const rows = list.map(n => ({ ID: full ? n.id : short(n.id), Name: n.name, Driver: n.driver, Scope: 'local', IPv6: 'false', Internal: 'false', CreatedAt: `${isoText(n.created)} +0000 UTC` }));
      const r = formatted(o.values['--format']?.at(-1) ?? 'table {{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}', rows, { ID: 'NETWORK ID', Name: 'NAME', Driver: 'DRIVER', Scope: 'SCOPE', IPv6: 'IPV6', Internal: 'INTERNAL', CreatedAt: 'CREATED' });
      if ('error' in r) return fail(r.error);
      r.lines.forEach(l => x.out(l));
      return { state: x.state, status: 0 };
    }
    case 'inspect': {
      const o = options(rest, ['-f', '--format'], []);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (!o.words.length) return usage(x, path, `"${path}" requires at least 1 argument.`, '[OPTIONS] NETWORK [NETWORK...]', 'Display detailed information on one or more networks');
      const found: Record<string, unknown>[] = [], missing: string[] = [];
      for (const n of o.words) { const net = findNetwork(d, n); if (net) found.push(networkJson(d, net)); else missing.push(n); }
      const status = printObjects(x, found, [...o.values['-f'] ?? [], ...o.values['--format'] ?? []].at(-1));
      missing.forEach(n => x.err(`Error response from daemon: network ${n} not found`));
      return { state: x.state, status: missing.length ? 1 : status };
    }
    case 'connect': case 'disconnect': {
      const o = options(rest, cmd === 'connect' ? ['--alias', '--ip'] : [], cmd === 'disconnect' ? ['-f', '--force'] : []);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (o.words.length !== 2) return usage(x, path, `"${path}" requires exactly 2 arguments.`, '[OPTIONS] NETWORK CONTAINER', cmd === 'connect' ? 'Connect a container to a network' : 'Disconnect a container from a network');
      if (o.values['--ip']) return fail('docker network connect：模擬環境由 Docker 分配位址（不支援 --ip）');
      const net = findNetwork(d, o.words[0]);
      if (!net) return fail(`Error response from daemon: network ${o.words[0]} not found`);
      const c = findContainer(d, o.words[1]);
      if (!c) return fail(`Error response from daemon: No such container: ${o.words[1]}`);
      const attached = (c.networks ?? {})[net.name] !== undefined;
      if (net.driver === 'host' || modeOf(c) === 'host') return fail('Error response from daemon: container cannot be disconnected from host network or connected to host network');
      if (cmd === 'disconnect') {
        if (!attached) return fail(`Error response from daemon: container ${c.id} is not connected to network ${net.name}`);
        const networks = Object.fromEntries(Object.entries(c.networks ?? {}).filter(([k]) => k !== net.name));
        return { state: commit(put(d, refresh(x.state, d, { ...c, networks, ...net.name === 'bridge' ? { ip: undefined } : {} }))), status: 0 };
      }
      if (net.driver === 'null' || modeOf(c) === 'none') return fail('Error response from daemon: container cannot be connected to multiple networks with one of the networks in private (none) mode');
      if (attached) return fail(`Error response from daemon: endpoint with name ${c.name} already exists in network ${net.name}`);
      const aliases = o.values['--alias'] ?? [];
      if (aliases.length && net.builtin) return fail('Error response from daemon: network-scoped alias is supported only for containers in user defined networks');
      let next: DockerContainer = { ...c, networks: { ...c.networks ?? {}, [net.name]: { aliases } } };
      if (c.status === 'running') { const a = assignAddresses(d, next); if (!('missing' in a)) next = a; }
      return { state: commit(put(d, refresh(x.state, d, next))), status: 0 };
    }
    case 'rm': case 'remove': {
      const o = options(rest, [], ['-f', '--force']);
      if ('bad' in o) return flagError(x, `docker network ${cmd}`, o.bad);
      if (!o.words.length) return usage(x, `docker network ${cmd}`, `"docker network ${cmd}" requires at least 1 argument.`, 'NETWORK [NETWORK...]', 'Remove one or more networks');
      let next = d, status = 0;
      for (const n of o.words) {
        const net = findNetwork(next, n);
        if (!net) { if (!o.set.has('-f') && !o.set.has('--force')) { x.err(`Error response from daemon: network ${n} not found`); status = 1; } continue; }
        if (net.builtin) { x.err(`Error response from daemon: ${net.name} is a pre-defined network and cannot be removed`); status = 1; continue; }
        const active = next.containers.filter(c => c.status === 'running' && c.networks?.[net.name] !== undefined);
        if (active.length) { x.err(`Error response from daemon: error while removing network: network ${net.name} has active endpoints (${active.map(c => `name:"${c.name}" id:"${short(c.id)}"`).join(', ')})`); status = 1; continue; }
        next = { ...next, networks: networksOf(next).filter(k => k !== net) };
        x.out(n);
      }
      return { state: commit(next), status };
    }
    case 'prune': {
      const o = options(rest, ['--filter'], ['-f', '--force']);
      if ('bad' in o) return flagError(x, path, o.bad);
      if (o.values['--filter']) return fail('docker network prune：模擬環境不支援 --filter');
      if (!o.set.has('-f') && !o.set.has('--force')) {
        const ok = confirm(x, 'WARNING! This will remove all custom networks not used by at least one container.');
        if (ok === undefined) { x.err('（模擬環境沒有鍵盤可以回答；請加 -f，或寫成 echo y | docker network prune）'); return { state: x.state, status: 1 }; }
        if (!ok) return { state: x.state, status: 0 };
      }
      const gone = nets.filter(n => !n.builtin && !d.containers.some(c => c.status === 'running' && c.networks?.[n.name] !== undefined)).sort((a, b) => a.name < b.name ? -1 : 1);
      if (gone.length) { x.out('Deleted Networks:'); gone.forEach(n => x.out(n.name)); }
      return { state: commit({ ...d, networks: nets.filter(n => !gone.includes(n)) }), status: 0 };
    }
  }
  x.err(`docker: 'network ${cmd}' is not a docker command.`); x.err("See 'docker --help'");
  return { state: x.state, status: 1 };
}
const put = (d: DockerState, c: DockerContainer): DockerState => ({ ...d, containers: d.containers.map(o => o.id === c.id ? c : o) });
/** A running container's /etc/hosts and /etc/resolv.conf after its networks changed. */
function refresh(host: FsState, d: DockerState, c: DockerContainer): DockerContainer {
  if (c.status !== 'running') return c;
  const bridge = c.networks?.bridge?.ip;
  const next = { ...c, ip: bridge }, nodes = new Map(next.nodes);
  nodes.set('/etc/hosts', { kind: 'file', mode: 0o644, owner: 'root', content: hostsText(d, next) });
  nodes.set('/etc/resolv.conf', { kind: 'file', mode: 0o644, owner: 'root', content: resolvText(host, d, next) });
  return { ...next, nodes };
}

// ------------------------------------------------------------------------------------------------- Go templates (E22)

/** Values the typed object holds as pointers (a map of *EndpointSettings) or structs (MountPoint): printed as Go prints them. */
export const POINTERS = new WeakSet<object>(), STRUCTS = new WeakSet<object>();
/** How Go's text/template prints a value: maps sorted by key, pointers as addresses, structs as {v1 v2 …}, nil as <nil> or <no value>. */
export function goValue(v: unknown, top = true): string {
  if (v === null || v === undefined) return top ? '<no value>' : '<nil>';
  if (Array.isArray(v)) return `[${v.map(x => goValue(x, false)).join(' ')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (STRUCTS.has(o)) return `{${Object.values(o).map(x => goValue(x, false)).join(' ')}}`;
    if (POINTERS.has(o)) return `map[${Object.keys(o).sort().map(k => `${k}:0xc000${hex(`ptr/${k}/${JSON.stringify(o[k])}`).slice(0, 5)}0`).join(' ')}]`;
    return `map[${Object.keys(o).sort().map(k => `${k}:${goValue(o[k], false)}`).join(' ')}]`;
  }
  return String(v);
}
type Scope = { dot: unknown; vars: Record<string, unknown> };
/**
 * docker inspect -f on the storage-net profile: text, {{.A.B}}, {{json .A}}, {{range .A}}…{{end}} (also {{range $k, $v := .A}}),
 * {{index .A "key"}} and {{(index .A "key").B}}, $variables. Anything else is said, not faked.
 */
export function goTemplate(format: string, data: unknown): { text: string } | { error: string } {
  const src = format.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const tokens: ({ t: 'text'; v: string } | { t: 'act'; v: string })[] = [];
  let at = 0;
  for (const m of src.matchAll(/\{\{-?\s*([\s\S]*?)\s*-?\}\}/g)) { if (m.index > at) tokens.push({ t: 'text', v: src.slice(at, m.index) }); tokens.push({ t: 'act', v: m[1] }); at = m.index + m[0].length; }
  if (at < src.length) tokens.push({ t: 'text', v: src.slice(at) });
  let i = 0;
  const unsupported = (a: string) => ({ error: `docker inspect：模擬環境的 --format 只支援 {{.欄位}}、{{json .欄位}}、{{range .欄位}}…{{end}} 與 {{index .欄位 "鍵"}}（不支援 {{${a}}}）` });
  const field = (base: unknown, parts: readonly string[], shown: string): { v: unknown } | { error: string } => {
    let v = base;
    for (const p of parts) {
      if (v && typeof v === 'object' && !Array.isArray(v) && p in (v as object)) v = (v as Record<string, unknown>)[p];
      else return { error: `template: :1: executing "" at <${shown}>: 模擬環境沒有 ${shown} 這個欄位（或它不是物件）` };
    }
    return { v };
  };
  const evalExpr = (expr: string, s: Scope): { v: unknown } | { error: string } => {
    const e = expr.trim();
    if (/-/.test(e.replace(/"[^"]*"/g, '')) && /\.[A-Za-z0-9_]*-/.test(e)) return { error: `template parsing error: template: :1: bad character U+002D '-'` };
    let m = /^\(index\s+(\S+)\s+"([^"]*)"\)((?:\.[A-Za-z_]\w*)*)$/.exec(e);
    if (m) { const b = evalExpr(m[1], s); if ('error' in b) return b; const o = b.v as Record<string, unknown> | undefined; const v = o && typeof o === 'object' ? o[m[2]] : undefined; return m[3] ? field(v, m[3].split('.').filter(Boolean), e) : { v }; }
    m = /^index\s+(\S+)\s+"([^"]*)"$/.exec(e);
    if (m) { const b = evalExpr(m[1], s); if ('error' in b) return b; const o = b.v as Record<string, unknown> | undefined; return { v: o && typeof o === 'object' ? o[m[2]] : undefined }; }
    if (e === '.') return { v: s.dot };
    m = /^\$([A-Za-z_]\w*)?((?:\.[A-Za-z_]\w*)*)$/.exec(e);
    if (m) { const name = m[1] ?? ''; if (!(name in s.vars)) return { error: `template: :1: undefined variable "$${name}"` }; return field(s.vars[name], m[2].split('.').filter(Boolean), e); }
    m = /^((?:\.[A-Za-z_]\w*)+)$/.exec(e);
    if (m) return field(s.dot, m[1].split('.').filter(Boolean), e);
    return unsupported(e);
  };
  const block = (s: Scope, stop: boolean): { text: string } | { error: string } => {
    let out = '';
    while (i < tokens.length) {
      const tk = tokens[i++];
      if (tk.t === 'text') { out += tk.v; continue; }
      const a = tk.v;
      if (a === 'end') { if (stop) return { text: out }; return { error: 'template: :1: unexpected {{end}}' }; }
      const r = /^range\s+(?:(\$\w+)\s*(?:,\s*(\$\w+))?\s*:=\s*)?(.+)$/.exec(a);
      if (r) {
        const over = evalExpr(r[3], s);
        if ('error' in over) return over;
        const start = i, items: [unknown, unknown][] = Array.isArray(over.v) ? over.v.map((v, k) => [k, v]) : over.v && typeof over.v === 'object' ? Object.keys(over.v as object).sort().map(k => [k, (over.v as Record<string, unknown>)[k]]) : [];
        // An empty range still has to find its {{end}}.
        if (!items.length) { const skip = block({ dot: undefined, vars: s.vars }, true); if ('error' in skip) return skip; }
        for (const [k, v] of items) {
          i = start;
          const vars = { ...s.vars, ...r[1] && r[2] ? { [r[1].slice(1)]: k, [r[2].slice(1)]: v } : r[1] ? { [r[1].slice(1)]: v } : {} };
          const b = block({ dot: v, vars }, true);
          if ('error' in b) return b;
          out += b.text;
        }
        continue;
      }
      const j = /^json\s+(.+)$/.exec(a);
      const v = evalExpr(j ? j[1] : a, s);
      if ('error' in v) return v;
      out += j ? JSON.stringify(v.v ?? null) : goValue(v.v);
    }
    return stop ? { error: 'template: :1: unexpected EOF' } : { text: out };
  };
  return block({ dot: data, vars: { '': data } }, false);
}
/** Prints inspect objects: JSON (four spaces), or each one through the template; the status. */
export function printObjects(x: Pick<E22Cli, 'out' | 'err'>, objects: readonly Record<string, unknown>[], format: string | undefined): number {
  if (format === undefined) { x.out(JSON.stringify(objects, null, 4)); return 0; }
  for (const o of objects) {
    const r = goTemplate(format, o);
    if ('error' in r) { x.err(r.error); return 1; }
    x.out(r.text);
  }
  return 0;
}
