import type { FsState } from './fs';
import { clockOf } from './processes';
import { settleKube } from './kube-settle';
import { NAMESPACED } from './kube-api';
import { nodeJson } from './kube-print';
import { printPod } from './kube-status';
import { evalPath, parsePath, scalar } from './kube-jsonpath';
import { parseSelector, selects } from './kube-select';
import { podContainer, podEnv, resolveImage } from './kube-image';
import { mountNodes } from './kube-volumes';
import { physicalPath } from './fs';
import { arr, kindOf, labelsOf, nameOf, nsOf, obj, str, uidOf, type JObj } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §15): the checks kube-object and kube-pod read the cluster after
 * the learner's commands, settled to the clock (a check never moves it: a solution that needs time uses sleep or
 * kubectl wait). kube-object: an object exists (or not) with these labels and JSONPath fields. kube-pod: one pod by name,
 * or the pods a selector picks (and how many): kubectl's STATUS, READY, RESTARTS, its node, an environment variable its
 * container sees, a file in its container.
 */

export type KubeCheck =
  | { kind: 'kube-object'; resource: string; name: string; namespace?: string; absent?: true; labels?: Record<string, string>; fields?: { path: string; equals: string }[] }
  | { kind: 'kube-pod'; name?: string; selector?: string; namespace?: string; count?: number; status?: string; ready?: boolean; restartsAtLeast?: number; node?: string; container?: string;
    env?: [string, string]; file?: { path: string; content?: string } };
export const KUBE_CHECK_KINDS = ['kube-object', 'kube-pod'] as const;
const RESOURCES = ['Pod', 'Namespace', 'Node', 'Service', 'Deployment', 'DaemonSet'], CONFIG_RESOURCES = ['ConfigMap', 'Secret'];
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');

export function kubeCheckProblems(c: KubeCheck, cluster: boolean, config = false): string | null {
  if (!cluster) return `a ${c.kind} check needs a cluster machine (engine stage E32)`;
  // E36: ConfigMaps and Secrets exist on the kube-config profile.
  if (c.kind === 'kube-object' && CONFIG_RESOURCES.includes(c.resource) && !config) return `a kube-object check of a ${c.resource} needs a kube-config machine (engine stage E36)`;
  if (c.namespace !== undefined && !LINE(c.namespace, 63)) return `a ${c.kind} check's namespace is a name`;
  if (c.kind === 'kube-object') {
    const list = config ? [...RESOURCES, ...CONFIG_RESOURCES] : RESOURCES;
    if (!list.includes(c.resource) || !LINE(c.name)) return `a kube-object check needs a resource among ${list.join(', ')} and a name`;
    if (c.absent && (c.labels || c.fields)) return 'a kube-object check with absent has no labels or fields';
    if ((c.fields ?? []).some(f => !LINE(f.path, 200) || typeof f.equals !== 'string' || 'error' in parsePath(f.path))) return 'a kube-object check\'s fields are { path: a JSONPath such as .spec.nodeName, equals: text }';
    return null;
  }
  if ((c.name === undefined) === (c.selector === undefined)) return 'a kube-pod check names a pod or gives a selector (one of them)';
  if (c.selector !== undefined && (!LINE(c.selector, 200) || 'error' in parseSelector(c.selector))) return 'a kube-pod check\'s selector is a label selector such as app=web';
  if (c.count !== undefined && (c.selector === undefined || !Number.isInteger(c.count) || c.count < 0)) return 'a kube-pod check\'s count needs a selector and is a whole number';
  if (c.restartsAtLeast !== undefined && (!Number.isInteger(c.restartsAtLeast) || c.restartsAtLeast < 0)) return 'a kube-pod check\'s restartsAtLeast is a whole number';
  if (c.env !== undefined && (!Array.isArray(c.env) || c.env.length !== 2 || !LINE(c.env[0], 128) || typeof c.env[1] !== 'string')) return 'a kube-pod check\'s env is [name, value]';
  if (c.file !== undefined && (!LINE(c.file.path) || !c.file.path.startsWith('/'))) return 'a kube-pod check\'s file has an absolute path';
  return null;
}

export function describeKubeCheck(c: KubeCheck): string {
  const ns = c.namespace ?? 'default';
  if (c.kind === 'kube-object') {
    const where = NAMESPACED[c.resource] ? `${ns} 命名空間` : '叢集';
    if (c.absent) return `${where}應該沒有名為 ${c.name} 的 ${c.resource}`;
    const more = [...Object.entries(c.labels ?? {}).map(([a, b]) => `標籤 ${a}=${b}`), ...(c.fields ?? []).map(f => `${f.path} 是 ${f.equals}`)];
    return `${where}應該有名為 ${c.name} 的 ${c.resource}${more.length ? `（${more.join('、')}）` : ''}`;
  }
  const who = c.name !== undefined ? `名為 ${c.name} 的 Pod` : `符合 ${c.selector} 的 Pod${c.count !== undefined ? `（${c.count} 個）` : ''}`;
  const more = [c.status ? `狀態 ${c.status}` : '', c.ready !== undefined ? (c.ready ? '容器都就緒' : '容器沒有全部就緒') : '', c.restartsAtLeast !== undefined ? `至少重新啟動 ${c.restartsAtLeast} 次` : '',
    c.node ? `在 ${c.node} 上` : '', c.env ? `環境變數 ${c.env[0]}=${c.env[1]}` : '', c.file ? `容器裡有 ${c.file.path}${c.file.content !== undefined ? `（內容包含「${c.file.content}」）` : ''}` : ''].filter(Boolean);
  return `${ns} 命名空間應該有${who}${more.length ? `（${more.join('、')}）` : ''}`;
}

export function kubeFailure(c: KubeCheck, end0: FsState): string | null {
  const end = settleKube(end0), k = end.kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const now = clockOf(end).now, ns = c.namespace ?? 'default';
  if (c.kind === 'kube-object') {
    const all = c.resource === 'Node' ? k.nodes.map(n => nodeJson(k, n, now)) : k.objects.filter(o => kindOf(o) === c.resource);
    const o = all.find(x => nameOf(x) === c.name && (!NAMESPACED[c.resource] || nsOf(x) === ns));
    if (c.absent) return o ? `仍然有名為 ${c.name} 的 ${c.resource}` : null;
    if (!o) return `沒有名為 ${c.name} 的 ${c.resource}`;
    const labels = labelsOf(o);
    for (const [a, b] of Object.entries(c.labels ?? {})) if (labels[a] !== b) return labels[a] === undefined ? `它沒有標籤 ${a}` : `它的標籤 ${a} 是 ${labels[a]}`;
    for (const f of c.fields ?? []) {
      const p = parsePath(f.path), got = 'error' in p ? [] : evalPath([o], p).map(scalar).join(' ');
      if (got !== f.equals) return got === '' ? `它沒有 ${f.path}` : `它的 ${f.path} 是 ${got}`;
    }
    return null;
  }
  const pods = k.objects.filter(o => kindOf(o) === 'Pod' && nsOf(o) === ns);
  let picked: JObj[];
  if (c.name !== undefined) { const p = pods.find(o => nameOf(o) === c.name); if (!p) return `沒有名為 ${c.name} 的 Pod`; picked = [p]; }
  else {
    if (typeof c.selector !== 'string') return '這個檢查沒有指定 Pod 的名稱或選擇器';
    const sel = parseSelector(c.selector);
    picked = 'error' in sel ? [] : pods.filter(o => selects(sel, o));
    if (c.count !== undefined && picked.length !== c.count) return `符合 ${c.selector} 的 Pod 有 ${picked.length} 個`;
    if (!picked.length) return c.count === 0 ? null : `沒有符合 ${c.selector} 的 Pod`;
  }
  for (const p of picked) {
    const shown = printPod(p, now), [ready, total] = shown.ready.split('/').map(Number), restarts = Number(shown.restarts.split(' ')[0]), name = nameOf(p);
    if (c.status !== undefined && shown.status !== c.status) return `${name} 的狀態是 ${shown.status}`;
    if (c.ready !== undefined && (ready === total) !== c.ready) return `${name} 就緒的容器是 ${shown.ready}`;
    if (c.restartsAtLeast !== undefined && restarts < c.restartsAtLeast) return `${name} 重新啟動了 ${restarts} 次`;
    if (c.node !== undefined && str(obj(p.spec).nodeName) !== c.node) return str(obj(p.spec).nodeName) ? `${name} 在 ${str(obj(p.spec).nodeName)} 上` : `${name} 還沒有排到節點上`;
    if (c.env || c.file) {
      const specs = arr(obj(p.spec).containers), i = c.container ? specs.findIndex(s => str(obj(s).name) === c.container) : 0, sim = k.pods[uidOf(p)];
      if (i < 0) return `${name} 沒有名為 ${c.container} 的容器`;
      const res = resolveImage(end.docker, str(obj(specs[i]).image) ?? '', k.config ? 'pulled' : undefined);
      if ('error' in res) return `${name} 的 Image 拉不下來`;
      // E36: the variables the kubelet resolved for the container's run (valueFrom, envFrom), and its configMap and secret volumes.
      if (c.env) { const want = `${c.env[0]}=${c.env[1]}`, env = podEnv(specs[i], res.img, name, true, k.config ? sim?.main[i]?.env ?? [] : undefined), have = env.find(e => e.startsWith(`${c.env![0]}=`)); if (have !== want) return have ? `${name} 的環境變數 ${have}` : `${name} 沒有環境變數 ${c.env[0]}`; }
      if (c.file) {
        const cs = sim?.main[i];
        if (!cs || cs.state !== 'running') return `${name} 的容器沒有在執行`;
        const nodes = podContainer(res.img, specs[i], name, cs.cid ?? '', now, cs.layer, k.config ? mountNodes(p, sim, specs[i], cs) : undefined).nodes;
        const node = nodes.get(k.config ? physicalPath(nodes, c.file.path, true) : c.file.path);
        if (!node || node.kind !== 'file') return `${name} 的容器裡沒有 ${c.file.path}`;
        if (c.file.content !== undefined && !(node.content ?? '').includes(c.file.content)) return `${name} 的 ${c.file.path} 不包含題目要的文字`;
      }
    }
  }
  return null;
}
