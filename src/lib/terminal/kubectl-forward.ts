import type { FsState } from './fs';
import { find } from './kube-api';
import { namedPort } from './kube-endpoints';
import { podHostName } from './kube-net';
import { podFacts } from './kube-replicaset';
import { portsOf, selectorOf } from './kube-service-spec';
import { clockOf, nextPid, SESSION_TTY, shellPid, tableOf, type Proc } from './processes';
import { listenersOf, type Listen } from './sockets';
import { kindOf, labelsOf, nameOf, nsOf, obj, str, type JObj, type KubeForward } from './kube-model';
import { kindOfWord } from './kubectl-get';
import { kubectl, type KubeIo, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E35 (docs/curriculum/KUB0_E35_KUBE_NET.md §8): kubectl port-forward TYPE/NAME [LOCAL:]REMOTE…. The target
 * is a pod, or the pod kubectl picks for a Service, Deployment or ReplicaSet (running and ready first, then by name); a
 * Service port is translated to its targetPort in that pod (a named one through the pod's container ports), and kubectl
 * prints the pod's port. Run with & it is an E4 background job whose process listens on 127.0.0.1:LOCAL (an E10 listener
 * whose connections go to the pod's REMOTE port, through E17's forward), so curl localhost:LOCAL reaches the pod and
 * kubectl prints "Handling connection for LOCAL"; kill %1 closes it. Without & it would block: the simulation prints the
 * Forwarding lines and a note (like -w) and listens on nothing.
 */

const fail = (x: Kx, line: string): KubeResult => { x.io.err(line); return { state: x.state, status: 1 }; };
const WORKLOAD: Record<string, true> = { Service: true, Deployment: true, ReplicaSet: true };

/** The pod kubectl forwards to for the object (a pod itself; else running and ready first, then running, by name). */
function podFor(x: Kx, o: JObj): JObj | undefined {
  if (kindOf(o) === 'Pod') return o;
  const sel = kindOf(o) === 'Service' ? selectorOf(o) ?? {} : Object.fromEntries(Object.entries(obj(obj(o.spec).selector).matchLabels ?? {}).map(([a, b]) => [a, String(b)]));
  if (!Object.keys(sel).length) return undefined;
  const pods = x.k.objects.filter(p => kindOf(p) === 'Pod' && nsOf(p) === nsOf(o) && Object.entries(sel).every(([a, b]) => labelsOf(p)[a] === b)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const facts = pods.map(p => podFacts(x.k, p, Infinity));
  return (facts.find(f => f.phase === 'Running' && f.ready && !f.deleting) ?? facts.find(f => f.phase === 'Running' && !f.deleting) ?? facts[0])?.pod;
}

export function portForwardCommand(x: Kx): KubeResult {
  const [word, ...specs] = x.pos;
  if (!word || !specs.length) return fail(x, 'error: TYPE/NAME and list of ports are required for port-forward');
  const [tw, name] = word.includes('/') ? word.split('/') : ['pod', word], kind = kindOfWord(tw, x.k);
  if (!kind) return fail(x, `error: the server doesn't have a resource type "${tw}"`);
  if (kind !== 'Pod' && !WORKLOAD[kind]) return fail(x, `error: cannot attach to *v1.${kind}: selector for *v1.${kind} not implemented`);
  const o = find(x.k, kind, x.ns, name);
  if (!o) return fail(x, `Error from server (NotFound): ${kind === 'Pod' ? 'pods' : kind === 'Service' ? 'services' : `${kind.toLowerCase()}s.apps`} "${name}" not found`);
  const pod = podFor(x, o);
  if (!pod) return fail(x, 'error: timed out waiting for the condition');
  const phase = str(obj(pod.status).phase) ?? 'Pending';
  if (phase !== 'Running') return fail(x, `error: unable to forward port because pod is not running. Current status=${phase}`);
  const pairs: { local: number; remote: number }[] = [];
  for (const sp of specs) {
    const m = /^(\d*)(?::([\w-]+))?$/.exec(sp);
    if (!m || (m[1] === '' && m[2] === undefined)) return fail(x, `error: Error parsing local port '${sp.split(':')[0]}': strconv.ParseUint: parsing "${sp.split(':')[0]}": invalid syntax`);
    if (m[1] === '') return fail(x, '（模擬環境：port-forward 需要寫出本機的埠，例如 8080:80，不能讓系統挑一個隨機的埠）');
    const remoteText = m[2] ?? m[1];
    let remote: number | undefined, local = m[1] ? Number(m[1]) : undefined;
    if (kindOf(o) === 'Service') {
      const p = portsOf(o).find(q => String(q.port) === remoteText || str(q.name) === remoteText);
      if (!p) return fail(x, `error: Service ${name} does not have a service port ${remoteText}`);
      const tp = p.targetPort ?? p.port;
      remote = typeof tp === 'number' ? tp : namedPort(pod, String(tp), str(p.protocol) ?? 'TCP');
      if (remote === undefined) return fail(x, `error: Pod ${nameOf(pod)} does not have a named port '${String(tp)}'`);
      local ??= Number(p.port);
    } else {
      remote = /^\d+$/.test(remoteText) ? Number(remoteText) : namedPort(pod, remoteText, 'TCP');
      if (remote === undefined) return fail(x, `error: Pod '${nameOf(pod)}' does not have a named port '${remoteText}'`);
    }
    pairs.push({ local: local ?? remote, remote });
  }
  const taken = pairs.filter(p => listenersOf(x.state).some(l => l.proto === 'tcp' && l.local.port === p.local && (l.local.address === '0.0.0.0' || l.local.address === '127.0.0.1')) || (p.local < 1024 && x.state.user !== 'root'));
  if (taken.length === pairs.length) {
    for (const p of taken) {
      const why = p.local < 1024 && x.state.user !== 'root' ? 'permission denied' : 'address already in use';
      x.io.err(`Unable to listen on port ${p.local}: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:${p.local}: bind: ${why} unable to create listener: Error listen tcp6 [::1]:${p.local}: bind: ${why}]`);
    }
    return fail(x, `error: unable to listen on any of the requested ports: [${pairs.map(p => `{${p.local} ${p.remote}}`).join(' ')}]`);
  }
  const open = pairs.filter(p => !taken.includes(p));
  if (!x.io.job) {
    open.forEach(p => { x.io.out(`Forwarding from 127.0.0.1:${p.local} -> ${p.remote}`); x.io.out(`Forwarding from [::1]:${p.local} -> ${p.remote}`); });
    x.io.err('（模擬環境：kubectl port-forward 會一直執行到按 Ctrl+C，這裡不會停住也不會留下監聽；請在指令最後加上 &，讓它在背景執行，例如 kubectl port-forward svc/web 8080:80 &）');
    return { state: x.state, status: 0 };
  }
  // The job: kubectl's process holds the listeners until it ends (kill %1).
  const s = x.state, pid = nextPid(s), jobs = s.jobs ?? [], id = Math.max(0, ...jobs.map(j => j.id)) + 1, ns = nsOf(pod) ?? 'default', now = clockOf(s).now;
  const listen: Listen[] = open.map((p, i) => ({ port: p.local, address: '127.0.0.1', fd: 8 + i, backlog: 4096, forward: { via: podHostName(ns, nameOf(pod)), host: '127.0.0.1', port: p.remote } }));
  const proc: Proc = { pid, ppid: shellPid(s), user: s.user, command: x.io.job, stat: 'Sl', cpu: 0, rss: 51200, vsz: 1290240, shr: 30720, tty: SESSION_TTY, start: now, time: 0, nice: 0, listen };
  const forwards: KubeForward[] = [...x.k.forwards ?? [], ...open.map(p => ({ pid, local: p.local, ns, pod: nameOf(pod), port: p.remote }))];
  x.io.out(`[${id}] ${pid}`);
  open.forEach(p => { x.io.out(`Forwarding from 127.0.0.1:${p.local} -> ${p.remote}`); x.io.out(`Forwarding from [::1]:${p.local} -> ${p.remote}`); });
  return { state: { ...s, processes: [...tableOf(s), proc], lastPid: pid, jobs: [...jobs, { id, pid, command: x.io.job }], kube: { ...x.k, forwards } }, status: 0 };
}

/** `kubectl port-forward … &` (shell.ts's background): the job, its notice and kubectl's lines. */
export function portForwardJob(state: FsState, args: readonly string[]): { state: FsState; status: number; lines: { text: string; kind: 'out' | 'err' }[] } {
  const lines: { text: string; kind: 'out' | 'err' }[] = [];
  const io: KubeIo = { out: text => lines.push({ text, kind: 'out' }), raw: text => lines.push({ text, kind: 'out' }), err: text => lines.push({ text, kind: 'err' }), stdin: null,
    read: () => ({ error: 'ENOENT' }), job: `kubectl port-forward ${args.join(' ')}` };
  const r = kubectl(state, ['port-forward', ...args], io);
  return { state: r.state, status: r.status, lines };
}
