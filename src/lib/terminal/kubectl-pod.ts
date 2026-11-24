import { find } from './kube-api';
import { imageNodes, runIn } from './docker';
import { podContainer, podEnv, resolveImage } from './kube-image';
import { cOf, specOf, type Ref } from './kube-kubelet';
import { settleKube, waitStep } from './kube-settle';
import { advanceClock } from './shell';
import { evalPath, parseTemplate, runTemplate } from './kube-jsonpath';
import { kindOfWord, pick, targets } from './kubectl-get';
import { arr, goTab, humanDuration, meta, nameOf, obj, stamp, str, uidOf, type JObj, type KubeEvent } from './kube-model';
import type { FsNode } from './fs';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §13): kubectl logs (-c, --previous, --tail, --since, --timestamps;
 * -f prints what there is), exec (-c, -- command: the container's files and the simulation's commands through docker.ts's
 * runIn; what it writes stays in the container's writable layer until it restarts), events (sorted by time, --for,
 * --types) and wait (--for=condition=…, --for=delete, --for=jsonpath=…; the clock moves while it waits, like sleep).
 */

const fail = (x: Kx, line: string, status = 1): KubeResult => { x.io.err(line); return { state: x.state, status }; };
/** The pod a command names (NAME or pod/NAME) and its container (-c, the default-container annotation, or the first). */
function podAndContainer(x: Kx, word: string | undefined): { pod: JObj; r: Ref } | { error: string } {
  if (!word) return { error: `error: expected 'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]'.\nPOD or TYPE/NAME is a required argument for the logs command` };
  const name = word.replace(/^(pods?|po)\//, ''), pod = find(x.k, 'Pod', x.ns, name);
  if (!pod) return { error: `Error from server (NotFound): pods "${name}" not found` };
  const spec = obj(pod.spec), mains = arr(spec.containers).map(c => str(obj(c).name) ?? ''), inits = arr(spec.initContainers).map(c => str(obj(c).name) ?? '');
  const want = flag(x, 'container');
  if (want !== undefined) {
    if (mains.includes(want)) return { pod, r: { init: false, i: mains.indexOf(want) } };
    if (inits.includes(want)) return { pod, r: { init: true, i: inits.indexOf(want) } };
    return { error: `error: container ${want} is not valid for pod ${name}` };
  }
  const chosen = str(obj(meta(pod).annotations)['kubectl.kubernetes.io/default-container']) ?? mains[0];
  if (mains.length + inits.length > 1) x.io.err(`Defaulted container "${chosen}" out of: ${[...mains, ...inits.map(i => `${i} (init)`)].join(', ')}`);
  return { pod, r: { init: false, i: Math.max(0, mains.indexOf(chosen)) } };
}

export function logsCommand(x: Kx): KubeResult {
  const p = podAndContainer(x, x.pos[0]);
  if ('error' in p) return fail(x, p.error);
  const sim = x.k.pods[uidOf(p.pod)], c = sim ? cOf(sim, p.r) : undefined, cname = str(obj(specOf(p.pod, p.r)).name) ?? '';
  const where = `container "${cname}" in pod "${nameOf(p.pod)}"`;
  if (!c) return fail(x, `Error from server (BadRequest): ${where} is not available`);
  if (x.flags.bools.has('previous')) { if (!c.last) return fail(x, `Error from server (BadRequest): previous terminated ${where} not found`); }
  else if (!c.cid) return fail(x, `Error from server (BadRequest): ${where} is waiting to start: ${/ImagePull|ErrImage/.test(c.reason ?? '') ? 'trying and failing to pull image' : c.reason ?? 'ContainerCreating'}`);
  let lines = x.flags.bools.has('previous') ? c.prev : c.logs;
  const since = flag(x, 'since'), tail = flag(x, 'tail');
  if (since !== undefined) { const m = /^(\d+)([smh])$/.exec(since); if (!m) return fail(x, `error: invalid argument "${since}" for "--since" flag: time: invalid duration "${since}"`); lines = lines.filter(l => l.t >= x.now - Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2] as 's']); }
  if (tail !== undefined && Number(tail) >= 0) lines = Number(tail) === 0 ? [] : lines.slice(-Number(tail));
  for (const l of lines) x.io.out(x.flags.bools.has('timestamps') ? `${stamp(l.t).replace('Z', '.000000000Z')} ${l.text}` : l.text);
  if (x.flags.bools.has('follow')) x.io.err('（模擬環境：沒有持續追蹤，-f 只印出到目前為止的日誌）');
  return { state: x.state, status: 0 };
}

export function execCommand(x: Kx): KubeResult {
  if (!x.rest.length) return fail(x, x.pos.length > 1 ? 'error: exec [POD] [COMMAND] is not supported anymore. Use exec [POD] -- [COMMAND] instead' : 'error: you must specify at least one command for the container');
  const p = podAndContainer(x, x.pos[0]);
  if ('error' in p) return fail(x, p.error);
  const phase = str(obj(p.pod.status).phase);
  if (phase === 'Succeeded' || phase === 'Failed') return fail(x, `error: cannot exec into a container in a completed pod; current phase is ${phase}`);
  const id = uidOf(p.pod), sim = x.k.pods[id], c = sim ? cOf(sim, p.r) : undefined, spec = specOf(p.pod, p.r);
  if (!sim || !c || c.state !== 'running') return fail(x, `error: unable to upgrade connection: container not found ("${str(obj(spec).name) ?? ''}")`);
  const argv = x.rest, interactive = x.flags.bools.has('stdin') && x.flags.bools.has('tty');
  if (interactive && ['sh', 'bash', '/bin/sh', '/bin/bash'].includes(argv[0]) && argv.length === 1) return fail(x, '（模擬環境沒有鍵盤：不能開互動的 shell；請在 -- 後面直接寫要執行的指令，例如 kubectl exec web -- ls /）');
  const res = resolveImage(x.state.docker, c.image);
  if ('error' in res) return fail(x, `error: unable to upgrade connection: container not found ("${c.name}")`);
  if (argv.length === 1 && argv[0] === 'env' && (res.img.commands ?? []).includes('env')) { podEnv(spec, res.img, nameOf(p.pod)).forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; }
  const box = podContainer(res.img, spec, nameOf(p.pod), c.cid ?? '', x.now, c.layer);
  const r = runIn(box, res.img, argv, { tty: x.flags.bools.has('tty'), env: [], now: x.now });
  if ('notFound' in r) return fail(x, `error: Internal error occurred: Internal error occurred: error executing command in container: failed to exec in container: failed to start exec "${(c.cid ?? '').slice(0, 64)}": OCI runtime exec failed: exec failed: unable to start container process: exec: "${r.notFound}": executable file not found in $PATH: unknown`);
  for (const l of r.lines) (l.stream === 1 ? x.io.out : x.io.err)(l.text);
  const base = imageNodes(res.img, c.cid ?? ''), layer = new Map<string, FsNode>();
  for (const [path, n] of r.nodes) if (base.get(path) !== n && JSON.stringify(base.get(path)) !== JSON.stringify(n)) layer.set(path, n);
  const k = { ...x.k, pods: { ...x.k.pods, [id]: { ...sim, [p.r.init ? 'init' : 'main']: (p.r.init ? sim.init : sim.main).map((y, i) => i === p.r.i ? { ...y, layer } : y) } } };
  if (r.status !== 0) x.io.err(`command terminated with exit code ${r.status}`);
  return { state: { ...x.state, kube: k }, status: r.status };
}

export function eventsCommand(x: Kx): KubeResult {
  const types = flag(x, 'types')?.split(',').map(t => t.trim().toLowerCase()), target = flag(x, 'for');
  let list: KubeEvent[] = x.k.events.filter(e => (x.all || e.ns === x.ns) && (!types || types.includes(e.type.toLowerCase())));
  // Fix (E34): --for takes kubectl's names of the type (deploy/web, rs/web-…, no/node-01), as the resource builder does.
  if (target) { const [word, name] = target.includes('/') ? target.split('/') : ['pod', target], kind = kindOfWord(word) ?? word; list = list.filter(e => e.name === name && e.kind.toLowerCase() === kind.toLowerCase()); }
  list = [...list].sort((a, b) => a.last - b.last || a.seq - b.seq);
  if (!list.length) return fail(x, x.all ? 'No events found.' : `No events found in ${x.ns} namespace.`, 0);
  const seen = (e: KubeEvent) => e.count > 1 ? `${humanDuration(x.now - e.last)} (x${e.count} over ${humanDuration(x.now - e.first)})` : humanDuration(x.now - e.last);
  const rows = list.map(e => [...x.all ? [e.ns] : [], seen(e), e.type, e.reason, `${e.kind}/${e.name}`, e.message].join('\t'));
  goTab([[...x.all ? ['NAMESPACE'] : [], 'LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'].join('\t'), ...rows]).forEach(l => x.io.out(l));
  return { state: x.state, status: 0 };
}

export function waitCommand(x: Kx): KubeResult {
  const cond = flag(x, 'for'), timeout = /^(\d+)(s|m)?$/.exec(flag(x, 'timeout') ?? '30s');
  if (!cond) return fail(x, 'error: --for must be set');
  if (!timeout) return fail(x, `error: invalid argument "${flag(x, 'timeout')}" for "--timeout" flag`);
  const limit = Math.min(3600, Number(timeout[1]) * (timeout[2] === 'm' ? 60 : 1)), ts = targets(x, x.pos);
  if ('error' in ts) return fail(x, ts.error);
  const c = /^condition=([A-Za-z]+)(?:=(\w+))?$/i.exec(cond), jp = /^jsonpath=(?:'(.*)'|(.*))=(.*)$/.exec(cond);
  if (!c && cond !== 'delete' && !jp) return fail(x, `error: unrecognized condition: "${cond}"`);
  const want = c ? (c[2] ?? 'true').toLowerCase() : '';
  const holds = (o: JObj | undefined) => {
    if (cond === 'delete') return !o;
    if (!o) return false;
    if (jp) { const t = parseTemplate(`{${(jp[1] ?? jp[2]).replace(/^\{|\}$/g, '')}}`); return !('error' in t) && runTemplate(t, o) === jp[3]; }
    return evalPath([o], [{ key: 'status' }, { key: 'conditions' }, { all: true }]).some(v => str(obj(v).type)?.toLowerCase() === c![1].toLowerCase() && str(obj(v).status)?.toLowerCase() === want);
  };
  const first = pick(x, ts[0]);
  if ('error' in first) return fail(x, first.error);
  if (first.errors.length && cond !== 'delete') return fail(x, first.errors[0]);
  const names = ts[0].names.length ? ts[0].names : first.items.map(nameOf), plural = ts[0].plural;
  // KUB-1: the clock moves from step to step of the cluster (nothing changes in between), never past the limit.
  for (let waited = 0; waited <= limit;) {
    const s = waited ? settleKube(advanceClock(x.state, waited)) : x.state, k = s.kube!;
    if (names.every(n => holds(find(k, ts[0].kind, x.ns, n)))) {
      names.forEach(n => x.io.out(`${plural.replace(/s(\.apps)?$/, '$1')}/${n} condition met`));
      return { state: x.state, status: 0, advance: waited };
    }
    if (waited >= limit) break;
    waited += waitStep(s, limit - waited);
  }
  const pending = names.find(n => !holds(find(settleKube(advanceClock(x.state, limit)).kube!, ts[0].kind, x.ns, n)));
  x.io.err(`error: timed out waiting for the condition on ${plural}/${pending}`);
  return { state: x.state, status: 1, advance: limit };
}
