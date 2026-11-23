import type { FsState } from './fs';
import { clockOf } from './processes';
import { settleKube } from './kube-settle';
import { configCommand, readConfig, type KubeConfig } from './kubectl-config';
import { describeCommand, getCommand } from './kubectl-get';
import { applyCommand, deleteCommand, runCommand } from './kubectl-apply';
import { metaCommand } from './kubectl-meta';
import { eventsCommand, execCommand, logsCommand, waitCommand } from './kubectl-pod';
import { API_SERVER, goTab, KUBE_VERSION, KUSTOMIZE_VERSION, type KubeState } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §11): the kubectl command. The cluster is settled to the clock
 * first (kube-settle.ts); the kubeconfig is the user's ~/.kube/config (its current context and namespace); flags are
 * parsed as kubectl's cobra does (--flag=value, --flag value, -n value, -nvalue, combined short booleans, -- ends them).
 * Verbs of later stages, and the ones the simulation cannot do (an editor, a keyboard), say so.
 */

export interface KubeIo { out(line: string): void; raw(data: string): void; err(line: string): void; stdin: string | null; read(path: string): { text: string } | { error: string } }
export type KubeResult = { state: FsState; status: number; advance?: number };
/** E33: off holds the booleans given as --flag=false (delete's --wait=false). */
export interface Flags { values: Record<string, string[]>; bools: Set<string>; off?: Set<string> }
export interface Kx { state: FsState; k: KubeState; ns: string; nsGiven: boolean; all: boolean; flags: Flags; pos: string[]; io: KubeIo; now: number; verb: string; cfg: KubeConfig; rest: string[] }

const VALUE = ['namespace', 'output', 'selector', 'filename', 'container', 'field-selector', 'image', 'port', 'labels', 'env', 'restart', 'grace-period', 'tail', 'since', 'for', 'types',
  'dry-run', 'label-columns', 'context', 'cluster', 'user', 'timeout', 'sort-by', 'requests', 'limits', 'overrides'];
const BOOL = ['all-namespaces', 'show-labels', 'overwrite', 'all', 'force', 'previous', 'timestamps', 'follow', 'watch', 'stdin', 'tty', 'command', 'rm', 'minify', 'raw', 'current', 'wait', 'client', 'ignore-not-found', 'no-headers', 'help', 'quiet', 'show-kind', 'list'];
const SHORT_VALUE: Record<string, string> = { n: 'namespace', o: 'output', l: 'selector', f: 'filename', c: 'container', L: 'label-columns' };
const SHORT_BOOL: Record<string, string> = { A: 'all-namespaces', w: 'watch', i: 'stdin', t: 'tty', p: 'previous', h: 'help', q: 'quiet' };

/** Flags and positional words (after -- everything is positional and kept apart). */
export function parseFlags(verb: string, args: readonly string[]): { flags: Flags; pos: string[]; rest: string[] } | { error: string } {
  const values: Record<string, string[]> = {}, bools = new Set<string>(), off = new Set<string>(), pos: string[] = [];
  const short = { ...SHORT_VALUE, ...verb === 'logs' ? { f: '' } : {}, ...verb === 'run' ? { l: 'labels' } : {} }, shortBool = { ...SHORT_BOOL, ...verb === 'logs' ? { f: 'follow' } : {} };
  const setV = (name: string, v: string) => { (values[name] ??= []).push(v); };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return { flags: { values, bools, off }, pos, rest: args.slice(i + 1) };
    const long = /^--([a-z][a-z-]*)(?:=(.*))?$/s.exec(a);
    if (long) {
      const [, name, eq] = long;
      if (VALUE.includes(name)) { if (eq !== undefined) setV(name, eq); else if (i + 1 < args.length) setV(name, args[++i]); else return { error: `error: flag needs an argument: --${name}` }; }
      else if (BOOL.includes(name)) { if (eq === 'false') { bools.delete(name); off.add(name); } else { bools.add(name); off.delete(name); } }
      else return { error: `error: unknown flag: --${name}` };
      continue;
    }
    if (/^-[A-Za-z]/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (short[ch as keyof typeof short]) { const v = a.slice(j + 1).replace(/^=/, ''); if (v) setV(short[ch as keyof typeof short]!, v); else if (i + 1 < args.length) setV(short[ch as keyof typeof short]!, args[++i]); else return { error: `error: flag needs an argument: '${ch}' in -${ch}` }; break; }
        if (shortBool[ch as keyof typeof shortBool]) { bools.add(shortBool[ch as keyof typeof shortBool]!); continue; }
        return { error: `error: unknown shorthand flag: '${ch}' in ${a}` };
      }
      continue;
    }
    pos.push(a);
  }
  return { flags: { values, bools, off }, pos, rest: [] };
}
export const flag = (x: Pick<Kx, 'flags'>, name: string) => x.flags.values[name]?.at(-1);

const LATER: Record<string, string> = { rollout: 'E34', scale: 'E34', set: 'E34', cordon: 'E34', uncordon: 'E34', drain: 'E34', expose: 'E35', 'port-forward': 'E35', top: 'E40', autoscale: 'E40', cp: 'E38' };
const PROSE = ['edit', 'attach', 'proxy', 'debug', 'explain', 'auth', 'patch', 'replace', 'kustomize', 'diff', 'certificate', 'plugin', 'completion', 'alpha'];
const VERBS = ['version', 'cluster-info', 'api-resources', 'config', 'get', 'describe', 'apply', 'create', 'delete', 'label', 'annotate', 'taint', 'run', 'logs', 'exec', 'events', 'wait'];
const REFUSED = 'The connection to the server localhost:8080 was refused - did you specify the right host or port?';

export function kubectl(state0: FsState, args: readonly string[], io: KubeIo): KubeResult {
  const [verb, ...more] = args;
  if (!verb) { io.out('kubectl controls the Kubernetes cluster manager.'); io.out(''); io.out(' Find more information at: https://kubernetes.io/docs/reference/kubectl/'); return { state: state0, status: 0 }; }
  if (LATER[verb]) { io.err(`（模擬環境：kubectl ${verb} 要到引擎階段 ${LATER[verb]} 才模擬）`); return { state: state0, status: 1 }; }
  if (verb === 'edit') { io.err('（模擬環境沒有文字編輯器：請修改 YAML 檔案後執行 kubectl apply -f 檔案）'); return { state: state0, status: 1 }; }
  if (PROSE.includes(verb)) { io.err(`（模擬環境不模擬 kubectl ${verb}，課文會說明它）`); return { state: state0, status: 1 }; }
  if (!VERBS.includes(verb)) { io.err(`error: unknown command "${verb}" for "kubectl"`); io.err("Run 'kubectl --help' for usage."); return { state: state0, status: 1 }; }
  const p = parseFlags(verb, more);
  if ('error' in p) { io.err(p.error); io.err(`See 'kubectl ${verb} --help' for usage.`); return { state: state0, status: 1 }; }
  const state = settleKube(state0), now = clockOf(state).now, cfg = readConfig(state);
  if (verb === 'version' && p.flags.bools.has('client')) { io.out(`Client Version: ${KUBE_VERSION}`); io.out(`Kustomize Version: ${KUSTOMIZE_VERSION}`); return { state, status: 0 }; }
  if (verb === 'config') return configCommand(state, cfg, p.pos, p.flags, io);
  if (!cfg.ok && cfg.error) { io.err(cfg.error); return { state, status: 1 }; }
  const ctx = cfg.ok ? cfg.contexts.find(c => c.name === (p.flags.values.context?.at(-1) ?? cfg.current)) : undefined;
  if (!state.kube || !cfg.ok || !ctx) {
    if (verb === 'version') { io.out(`Client Version: ${KUBE_VERSION}`); io.out(`Kustomize Version: ${KUSTOMIZE_VERSION}`); }
    if (cfg.ok && p.flags.values.context) { io.err(`error: context "${p.flags.values.context.at(-1)}" does not exist`); return { state, status: 1 }; }
    io.err(REFUSED);
    return { state, status: 1 };
  }
  const nsFlag = p.flags.values.namespace?.at(-1);
  const x: Kx = { state, k: state.kube, ns: nsFlag ?? ctx.namespace ?? 'default', nsGiven: nsFlag !== undefined, all: p.flags.bools.has('all-namespaces'), flags: p.flags, pos: p.pos, io, now, verb, cfg, rest: p.rest };
  switch (verb) {
    case 'version': io.out(`Client Version: ${KUBE_VERSION}`); io.out(`Kustomize Version: ${KUSTOMIZE_VERSION}`); io.out(`Server Version: ${KUBE_VERSION}`); return { state, status: 0 };
    case 'cluster-info':
      io.out(`Kubernetes control plane is running at ${API_SERVER}`); io.out(`CoreDNS is running at ${API_SERVER}/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy`);
      io.out(''); io.out("To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.");
      return { state, status: 0 };
    case 'api-resources': apiResources(x); return { state, status: 0 };
    case 'get': return getCommand(x);
    case 'describe': return describeCommand(x);
    case 'apply': case 'create': return applyCommand(x);
    case 'delete': return deleteCommand(x);
    case 'run': return runCommand(x);
    case 'label': case 'annotate': case 'taint': return metaCommand(x);
    case 'logs': return logsCommand(x);
    case 'exec': return execCommand(x);
    case 'events': return eventsCommand(x);
    default: return waitCommand(x);
  }
}

/** The resource types kubectl api-resources lists (the simulation's subset: what the stages E32–E40 use). */
export const API_RESOURCES: [string, string, string, boolean, string][] = [
  ['configmaps', 'cm', 'v1', true, 'ConfigMap'], ['endpoints', 'ep', 'v1', true, 'Endpoints'], ['events', 'ev', 'v1', true, 'Event'], ['namespaces', 'ns', 'v1', false, 'Namespace'],
  ['nodes', 'no', 'v1', false, 'Node'], ['persistentvolumeclaims', 'pvc', 'v1', true, 'PersistentVolumeClaim'], ['persistentvolumes', 'pv', 'v1', false, 'PersistentVolume'],
  ['pods', 'po', 'v1', true, 'Pod'], ['secrets', '', 'v1', true, 'Secret'], ['serviceaccounts', 'sa', 'v1', true, 'ServiceAccount'], ['services', 'svc', 'v1', true, 'Service'],
  ['daemonsets', 'ds', 'apps/v1', true, 'DaemonSet'], ['deployments', 'deploy', 'apps/v1', true, 'Deployment'], ['replicasets', 'rs', 'apps/v1', true, 'ReplicaSet'], ['statefulsets', 'sts', 'apps/v1', true, 'StatefulSet'],
  ['horizontalpodautoscalers', 'hpa', 'autoscaling/v2', true, 'HorizontalPodAutoscaler'], ['ingressclasses', '', 'networking.k8s.io/v1', false, 'IngressClass'], ['ingresses', 'ing', 'networking.k8s.io/v1', true, 'Ingress'],
  ['storageclasses', 'sc', 'storage.k8s.io/v1', false, 'StorageClass'],
];
function apiResources(x: Kx) {
  const rows = API_RESOURCES.map(([n, s, v, nsd, kind]) => [n, s, v, String(nsd), kind].join('\t'));
  for (const l of goTab(['NAME\tSHORTNAMES\tAPIVERSION\tNAMESPACED\tKIND', ...rows])) x.io.out(l);
}
