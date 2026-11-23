import { find, NAMESPACED } from './kube-api';
import { readManifests } from './kube-manifest';
import { kubeYaml, goJson } from './kube-output';
import { applyDoc, createDoc, deleteObject, type Written } from './kube-write';
import { noneText, pick, targets } from './kubectl-get';
import { kindOf, nameOf, obj, str, type J, type JObj, type KubeState } from './kube-model';
import { flag, type KubeResult, type Kx } from './kubectl';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §12): kubectl apply -f, create -f (and create namespace), delete
 * (names, -f, -l, --all; --grace-period=0 --force) and run. Files are read as the user (-f - is standard input); every
 * document is applied in order, the successes printed as they happen and the errors after them.
 */

type Doc = { doc: JObj; file: string } | { error: string };
function documents(x: Kx): Doc[] | { error: string } {
  const files = x.flags.values.filename ?? [];
  if (!files.length) return { error: x.verb === 'delete' ? 'error: resource(s) were provided, but no name was specified' : 'error: must specify one of -f and -k' };
  const out: Doc[] = [];
  for (const f of files) {
    if (/^https?:\/\//.test(f)) return { error: `（模擬環境沒有網際網路：請把 ${f} 的內容存成檔案再用 -f 讀取）` };
    const r = f === '-' ? x.io.stdin === null ? { error: 'NOINPUT' } : { text: x.io.stdin } : x.io.read(f);
    if ('error' in r) return { error: r.error === 'EISDIR' ? `（模擬環境：-f 只讀檔案，不讀整個資料夾：${f}）` : `error: the path "${f}" does not exist` };
    if (/\.json$/.test(f) || /^\s*\{/.test(r.text)) {
      try { const doc = JSON.parse(r.text) as J; out.push(doc && typeof doc === 'object' && !Array.isArray(doc) ? { doc, file: f } : { error: `error: error validating "${f}": error validating data: invalid object to validate` }); }
      catch { out.push({ error: `error: error parsing ${f}: invalid character in JSON` }); }
      continue;
    }
    const docs = readManifests(r.text, f);
    if ('error' in docs) return docs;
    out.push(...docs.map(d => 'error' in d ? d : { doc: d.doc, file: f }));
  }
  return out;
}
/** The namespace of a document: its own, unless -n names another (kubectl refuses the mismatch). */
function nsFor(x: Kx, doc: JObj): string | { error: string } {
  const own = str(obj(doc.metadata).namespace);
  if (own && x.nsGiven && own !== x.ns) return { error: `error: the namespace from the provided object "${own}" does not match the namespace "${x.ns}". You must pass '--namespace=${own}' to perform this operation.` };
  return own ?? x.ns;
}
const finish = (x: Kx, k: KubeState, errors: string[]): KubeResult => { errors.forEach(e => x.io.err(e)); return { state: { ...x.state, kube: k }, status: errors.length ? 1 : 0 }; };

export function applyCommand(x: Kx): KubeResult {
  if (x.verb === 'create' && x.pos.length) return createNamed(x);
  const docs = documents(x);
  if ('error' in docs) { x.io.err(docs.error); return { state: x.state, status: 1 }; }
  const dry = flag(x, 'dry-run'), errors: string[] = [];
  let k = x.k;
  for (const d of docs) {
    if ('error' in d) { errors.push(d.error); continue; }
    const ns = nsFor(x, d.doc);
    if (typeof ns !== 'string') { errors.push(ns.error); continue; }
    const r: Written = x.verb === 'apply' ? applyDoc(k, d.doc, ns, x.now, d.file) : createDoc(k, d.doc, ns, x.now, d.file);
    if ('error' in r) { errors.push(r.error); continue; }
    if (r.warn) x.io.err(r.warn);
    if (dry === 'client' || dry === 'server') { x.io.out(`${r.line} (${dry === 'client' ? 'dry run' : 'server dry run'})`); continue; }
    x.io.out(r.line);
    k = r.k;
  }
  return finish(x, k, errors);
}
function createNamed(x: Kx): KubeResult {
  const [what, name] = x.pos;
  if (what === 'namespace' || what === 'ns') {
    if (!name) { x.io.err('error: exactly one NAME is required, got 0'); return { state: x.state, status: 1 }; }
    const r = createDoc(x.k, { apiVersion: 'v1', kind: 'Namespace', metadata: { name } }, x.ns, x.now, 'STDIN');
    if ('error' in r) { x.io.err(r.error.replace('error when creating "STDIN": ', '')); return { state: x.state, status: 1 }; }
    x.io.out(r.line);
    return { state: { ...x.state, kube: r.k }, status: 0 };
  }
  const stage: Record<string, string> = { deployment: 'E34', deploy: 'E34', service: 'E35', svc: 'E35', configmap: 'E36', cm: 'E36', secret: 'E36', ingress: 'E37' };
  x.io.err(stage[what] ? `（模擬環境：kubectl create ${what} 要到引擎階段 ${stage[what]} 才模擬）` : `error: unknown command "${what}" for "kubectl create"`);
  return { state: x.state, status: 1 };
}

export function deleteCommand(x: Kx): KubeResult {
  const force = x.flags.bools.has('force') && flag(x, 'grace-period') === '0', errors: string[] = [];
  let k = x.k;
  if (force) x.io.err('Warning: Immediate deletion does not wait for confirmation that the running resource has been terminated. The resource may continue to run on the cluster indefinitely.');
  const one = (o: JObj) => {
    if (kindOf(o) === 'Node' || kindOf(o) === 'Event') { errors.push(`（模擬環境：${kindOf(o) === 'Node' ? '節點是課程的資料' : '事件由叢集記錄'}，不能刪除）`); return; }
    if (kindOf(o) === 'Namespace' && ['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(nameOf(o))) { errors.push(`Error from server (Forbidden): namespaces "${nameOf(o)}" is forbidden: this namespace may not be deleted`); return; }
    k = deleteObject(k, o, x.now);
    x.io.out(`${kindOf(o).toLowerCase()} "${nameOf(o)}" ${force ? 'force deleted' : 'deleted'}`);
  };
  if (x.flags.values.filename) {
    const docs = documents(x);
    if ('error' in docs) { x.io.err(docs.error); return { state: x.state, status: 1 }; }
    for (const d of docs) {
      if ('error' in d) { errors.push(d.error); continue; }
      const ns = nsFor(x, d.doc);
      if (typeof ns !== 'string') { errors.push(ns.error); continue; }
      const o = find(k, kindOf(d.doc), NAMESPACED[kindOf(d.doc)] ? ns : undefined, nameOf(d.doc));
      if (o) one(o); else if (!x.flags.bools.has('ignore-not-found')) errors.push(`Error from server (NotFound): error when deleting "${d.file}": ${kindOf(d.doc).toLowerCase()}s "${nameOf(d.doc)}" not found`);
    }
    return finish(x, k, errors);
  }
  const ts = targets(x, x.pos);
  if ('error' in ts) { x.io.err(ts.error); return { state: x.state, status: 1 }; }
  for (const t of ts) {
    if (!t.names.length && !x.flags.bools.has('all') && !x.flags.values.selector && !x.flags.values['field-selector']) { x.io.err('error: resource(s) were provided, but no name was specified'); return { state: x.state, status: 1 }; }
    const r = pick({ ...x, k }, t);
    if ('error' in r) { x.io.err(r.error); return { state: x.state, status: 1 }; }
    r.items.forEach(one);
    if (!x.flags.bools.has('ignore-not-found')) errors.push(...r.errors);
    if (!t.names.length && !r.items.length) x.io.err(noneText(x, t.kind));
  }
  return finish(x, k, errors);
}

export function runCommand(x: Kx): KubeResult {
  const [name] = x.pos, image = flag(x, 'image'), fail = (line: string) => { x.io.err(line); return { state: x.state, status: 1 }; };
  if (!name) return fail('error: NAME is required for run');
  if (!image) return fail('error: required flag(s) "image" not set');
  if (x.flags.bools.has('rm') || (x.flags.bools.has('stdin') && x.flags.bools.has('tty'))) return fail('（模擬環境沒有鍵盤：kubectl run -it 與 --rm 無法互動；請用 kubectl run 建立 Pod，再用 kubectl logs 與 kubectl exec 查看）');
  const labels: JObj = {};
  for (const pair of (flag(x, 'labels') ?? `run=${name}`).split(',')) { const [a, b] = pair.split('='); if (!a || b === undefined) return fail(`error: invalid label spec: ${pair}`); labels[a] = b; }
  const env = (x.flags.values.env ?? []).map(e => { const at = e.indexOf('='); return { name: e.slice(0, at), value: e.slice(at + 1) }; });
  const port = flag(x, 'port'), restart = flag(x, 'restart') ?? 'Always';
  if (!['Always', 'OnFailure', 'Never'].includes(restart)) return fail(`error: invalid restart policy: ${restart}`);
  const container: JObj = { ...x.rest.length ? x.flags.bools.has('command') ? { command: x.rest } : { args: x.rest } : {}, ...env.length ? { env } : {}, image, name, ...port ? { ports: [{ containerPort: Number(port) }] } : {}, resources: {} };
  const doc: JObj = { apiVersion: 'v1', kind: 'Pod', metadata: { creationTimestamp: null, labels, name }, spec: { containers: [container], dnsPolicy: 'ClusterFirst', restartPolicy: restart }, status: {} };
  const dry = flag(x, 'dry-run'), out = flag(x, 'output');
  if (dry === 'client') {
    if (out === 'yaml') kubeYaml(doc).forEach(l => x.io.out(l));
    else if (out === 'json') goJson(doc).split('\n').forEach(l => x.io.out(l));
    else x.io.out(`pod/${name} created (dry run)`);
    return { state: x.state, status: 0 };
  }
  const r = createDoc(x.k, doc, x.ns, x.now, 'STDIN');
  if ('error' in r) return fail(r.error.replace(/error when creating "STDIN": /, '').replace(/^Error from server \(AlreadyExists\): pods/, 'Error from server (AlreadyExists): pods'));
  x.io.out(`pod/${name} created`);
  return { state: { ...x.state, kube: r.k }, status: 0 };
}
