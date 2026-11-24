import { resolveRolling, type InstanceAmount } from '../devops/rollout';
import { defaultContainer } from './kube-api';
import { fieldErrors, laterField } from './kube-manifest';
import { matches, type Req } from './kube-select';
import { arr, kindOf, obj, sameJ, sortJ, str, suffix, type J, type JObj } from './kube-model';

/*
 * Engine stage E34 (docs/curriculum/KUB0_E34_WORKLOADS.md §2): Deployment and ReplicaSet as the API server keeps them —
 * the defaults (replicas 1, RollingUpdate 25%/25%, progressDeadlineSeconds 600, revisionHistoryLimit 10, the template's
 * container defaults), the validation of apps/v1 (a selector that must match the template's labels, restartPolicy Always,
 * the strategy's int-or-percent fields, the immutable selector), label selectors as requirements and as text, the
 * pod-template-hash (SHA-256 of the template, a documented deviation from FNV-32a) and the rolling fenceposts, which
 * reuse resolveRolling of the CICD rollout explorer.
 */

export const WORKLOAD_KINDS: readonly string[] = ['Deployment', 'ReplicaSet'];
export const REVISION = 'deployment.kubernetes.io/revision', HISTORY = 'deployment.kubernetes.io/revision-history';
export const DESIRED = 'deployment.kubernetes.io/desired-replicas', MAX_REPLICAS = 'deployment.kubernetes.io/max-replicas';
export const CHANGE_CAUSE = 'kubernetes.io/change-cause', RESTARTED = 'kubectl.kubernetes.io/restartedAt', HASH = 'pod-template-hash';
const num = (v: J | undefined, d: number) => typeof v === 'number' ? v : d;
export const replicasOf = (o: JObj) => num(obj(o.spec).replicas, 1);

/** A pod template with the API server's defaults (the container defaults and the pod spec's, without a Pod's admission ones). */
export function defaultTemplate(t0: J | undefined): JObj {
  const t = obj(t0), spec = { ...obj(t.spec) };
  spec.containers = arr(spec.containers).map(defaultContainer);
  if (spec.initContainers) spec.initContainers = arr(spec.initContainers).map(defaultContainer);
  spec.dnsPolicy ??= 'ClusterFirst';
  spec.restartPolicy ??= 'Always';
  spec.schedulerName ??= 'default-scheduler';
  spec.securityContext ??= {};
  spec.terminationGracePeriodSeconds ??= 30;
  return { metadata: { creationTimestamp: null, ...obj(t.metadata) }, spec };
}
/** A Deployment's or ReplicaSet's defaults (idempotent). */
export function defaultWorkload(o: JObj): JObj {
  const spec = { ...obj(o.spec) };
  spec.replicas ??= 1;
  spec.template = defaultTemplate(spec.template);
  if (kindOf(o) === 'Deployment') {
    spec.progressDeadlineSeconds ??= 600;
    spec.revisionHistoryLimit ??= 10;
    const st = { ...obj(spec.strategy) };
    st.type ??= 'RollingUpdate';
    if (st.rollingUpdate === null) delete st.rollingUpdate;
    if (st.type === 'RollingUpdate') st.rollingUpdate = { maxSurge: '25%', maxUnavailable: '25%', ...obj(st.rollingUpdate) };
    spec.strategy = st;
  }
  return { ...o, spec };
}

const OPS: Record<string, Req['op']> = { In: 'in', NotIn: 'notin', Exists: 'exists', DoesNotExist: '!' };
/** A LabelSelector as requirements (matchLabels, then matchExpressions). */
export function selectorReqs(sel0: J | undefined): Req[] {
  const sel = obj(sel0);
  return [...Object.entries(obj(sel.matchLabels)).map(([key, v]) => ({ key, op: '=' as const, values: [String(v)] })),
    ...arr(sel.matchExpressions).map(obj).map(e => ({ key: str(e.key) ?? '', op: OPS[str(e.operator) ?? ''] ?? 'exists', values: arr(e.values).map(String) }))];
}
export const selectorMatches = (sel: J | undefined, labels: Readonly<Record<string, string>>) => { const r = selectorReqs(sel); return r.length > 0 && matches(r, labels); };
/** The selector as kubectl prints it (requirements sorted by key: app=web,tier in (a,b),!x). */
export function selectorText(sel: J | undefined): string {
  const r = selectorReqs(sel).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!r.length) return '<none>';
  return r.map(q => q.op === '=' ? `${q.key}=${q.values[0]}` : q.op === 'exists' ? q.key : q.op === '!' ? `!${q.key}` : `${q.key} ${q.op} (${[...q.values].sort().join(',')})`).join(',');
}
/** Go's %#v of a map[string]string (field errors print values this way). */
export const goMap = (m: J | undefined) => m === undefined || m === null ? 'map[string]string(nil)' : `map[string]string{${Object.keys(obj(m)).sort().map(k => `"${k}":"${String(obj(m)[k])}"`).join(', ')}}`;
function goSelector(sel0: J | undefined): string {
  const sel = obj(sel0), ex = arr(sel.matchExpressions).map(obj);
  const exprs = sel.matchExpressions === undefined ? '[]v1.LabelSelectorRequirement(nil)'
    : `[]v1.LabelSelectorRequirement{${ex.map(e => `v1.LabelSelectorRequirement{Key:"${str(e.key) ?? ''}", Operator:"${str(e.operator) ?? ''}", Values:${e.values === undefined ? '[]string(nil)' : `[]string{${arr(e.values).map(v => `"${String(v)}"`).join(', ')}}`}}`).join(', ')}}`;
  return `v1.LabelSelector{MatchLabels:${goMap(sel.matchLabels)}, MatchExpressions:${exprs}}`;
}
const goIntStr = (v: J | undefined) => typeof v === 'string' ? `intstr.IntOrString{Type:1, IntVal:0, StrVal:"${v}"}` : `intstr.IntOrString{Type:0, IntVal:${String(v ?? 0)}, StrVal:""}`;

function selectorErrors(sel0: J | undefined, labels: J | undefined, kind: string): string[] {
  const out: string[] = [];
  if (sel0 === undefined || sel0 === null) out.push('spec.selector: Required value');
  else {
    const sel = obj(sel0);
    arr(sel.matchExpressions).map(obj).forEach((e, i) => {
      const at = `spec.selector.matchExpressions[${i}]`, op = str(e.operator) ?? '', values = arr(e.values);
      if (!OPS[op]) out.push(`${at}.operator: Invalid value: "${op}": not a valid selector operator`);
      else if ((op === 'In' || op === 'NotIn') && !values.length) out.push(`${at}.values: Required value: must be specified when \`operator\` is 'In' or 'NotIn'`);
      else if ((op === 'Exists' || op === 'DoesNotExist') && values.length) out.push(`${at}.values: Forbidden: may not be specified when \`operator\` is 'Exists' or 'DoesNotExist'`);
    });
    if (!Object.keys(obj(sel.matchLabels)).length && !arr(sel.matchExpressions).length) out.push(`spec.selector: Invalid value: ${goSelector(sel)}: empty selector is invalid for ${kind.toLowerCase()}`);
  }
  const l = Object.fromEntries(Object.entries(obj(labels)).map(([a, b]) => [a, String(b)]));
  if (!selectorMatches(sel0, l)) out.push(`spec.template.metadata.labels: Invalid value: ${goMap(labels)}: \`selector\` does not match template \`labels\``);
  return out;
}
const PERCENT = /^[0-9]+%$/;
function amountErrors(v: J | undefined, at: string, cap100: boolean): string[] {
  if (typeof v === 'number') return v < 0 ? [`${at}: Invalid value: ${v}: must be greater than or equal to 0`] : [];
  if (typeof v !== 'string') return [];
  if (!PERCENT.test(v)) return [`${at}: Invalid value: "${v}": a valid percent string must be a numeric string followed by an ending '%' (e.g. '1%',  or '93%', regex used for validation is '[0-9]+%')`];
  return cap100 && Number(v.slice(0, -1)) > 100 ? [`${at}: Invalid value: "${v}": must not be greater than 100%`] : [];
}
const zero = (v: J | undefined) => v === 0 || v === '0%';
const nonNegative = (spec: JObj, key: string) => typeof spec[key] === 'number' && (spec[key] as number) < 0 ? [`spec.${key}: Invalid value: ${String(spec[key])}: must be greater than or equal to 0`] : [];

/** The field errors of a (defaulted) Deployment or ReplicaSet: its name, the selector, the template's pod spec, the strategy. */
export function workloadErrors(doc: JObj): string[] {
  const kind = kindOf(doc), spec = obj(doc.spec), t = obj(spec.template), out = fieldErrors(doc);
  out.push(...nonNegative(spec, 'replicas'), ...selectorErrors(spec.selector, obj(t.metadata).labels, kind));
  const pod: JObj = { kind: 'Pod', metadata: { name: 'template' }, spec: obj(t.spec) };
  out.push(...fieldErrors(pod, true).filter(e => !e.startsWith('spec.restartPolicy')).map(e => e.replace(/^spec\./, 'spec.template.spec.')));
  const restart = str(obj(t.spec).restartPolicy) ?? 'Always';
  if (restart !== 'Always') out.push(`spec.template.spec.restartPolicy: Unsupported value: "${restart}": supported values: "Always"`);
  if (obj(t.spec).activeDeadlineSeconds !== undefined) out.push('spec.template.spec.activeDeadlineSeconds: Forbidden: activeDeadlineSeconds in ReplicaSet is not Supported');
  if (kind === 'Deployment') {
    const st = obj(spec.strategy), type = str(st.type) ?? 'RollingUpdate', ru = obj(st.rollingUpdate);
    if (type !== 'RollingUpdate' && type !== 'Recreate') out.push(`spec.strategy.type: Unsupported value: "${type}": supported values: "Recreate", "RollingUpdate"`);
    if (type === 'Recreate' && st.rollingUpdate !== undefined) out.push("spec.strategy.rollingUpdate: Forbidden: may not be specified when strategy `type` is 'Recreate'");
    if (type === 'RollingUpdate') {
      out.push(...amountErrors(ru.maxUnavailable, 'spec.strategy.rollingUpdate.maxUnavailable', true), ...amountErrors(ru.maxSurge, 'spec.strategy.rollingUpdate.maxSurge', false));
      if (zero(ru.maxSurge) && zero(ru.maxUnavailable)) out.push(`spec.strategy.rollingUpdate.maxUnavailable: Invalid value: ${goIntStr(ru.maxUnavailable)}: may not be 0 when \`maxSurge\` is 0`);
    }
  }
  out.push(...nonNegative(spec, 'minReadySeconds'));
  if (kind === 'Deployment') {
    out.push(...nonNegative(spec, 'revisionHistoryLimit'), ...nonNegative(spec, 'progressDeadlineSeconds'));
    const d = num(spec.progressDeadlineSeconds, 600);
    if (d >= 0 && d <= num(spec.minReadySeconds, 0)) out.push(`spec.progressDeadlineSeconds: Invalid value: ${d}: must be greater than minReadySeconds`);
  }
  return out;
}
/** spec.selector cannot change (apps/v1). */
export function immutableSelector(live: JObj, next: JObj): string[] {
  const a = obj(live.spec).selector, b = obj(next.spec).selector;
  return sameJ(a, b) ? [] : [`spec.selector: Invalid value: ${goSelector(b)}: field is immutable`];
}
/** The first field of a later stage the template uses (its path under spec.template, and the stage). */
export function workloadLater(doc: JObj, config = false, storage = false): { path: string; stage: string } | null {
  const t = obj(obj(doc.spec).template), r = laterField({ kind: 'Pod', metadata: obj(t.metadata), spec: obj(t.spec) }, true, config, storage);
  return r ? { ...r, path: r.path.replace(/^spec\./, 'spec.template.spec.') } : null;
}

/** A template without its pod-template-hash label (how the Deployment controller compares templates). */
// KUB-4: kept per template object (templates are never changed in place; the controllers ask for it every step).
const unhashed = new WeakMap<object, JObj>();
export function withoutHash(t0: J | undefined): JObj {
  if (t0 && typeof t0 === 'object') { const hit = unhashed.get(t0); if (hit) return hit; const out = withoutHashOnce(t0); unhashed.set(t0, out); return out; }
  return withoutHashOnce(t0);
}
function withoutHashOnce(t0: J | undefined): JObj {
  const t = obj(t0), m: JObj = { ...obj(t.metadata) }, labels = { ...obj(m.labels) };
  delete labels[HASH];
  if (Object.keys(labels).length) m.labels = labels; else delete m.labels;
  return { ...t, metadata: m };
}
/** The pod-template-hash: 10 characters from the SHA-256 of the template (real Kubernetes: FNV-32a of its Go dump). */
export const templateHash = (t: J | undefined, collisions = 0) => suffix(`template/${JSON.stringify(sortJ(withoutHash(t)))}/${collisions}`, 10);

/** maxSurge and maxUnavailable in pods (resolveRolling's rounding; Recreate and 0 replicas: none). */
export function fenceposts(d: JObj): { surge: number; unavailable: number } {
  const spec = obj(d.spec), st = obj(spec.strategy), ru = obj(st.rollingUpdate), n = replicasOf(d);
  if ((str(st.type) ?? 'RollingUpdate') !== 'RollingUpdate') return { surge: 0, unavailable: 0 };
  const amount = (v: J | undefined): InstanceAmount => typeof v === 'number' ? v : (str(v) ?? '25%') as InstanceAmount;
  const r = resolveRolling(n, amount(ru.maxSurge), amount(ru.maxUnavailable));
  return n === 0 ? { surge: r.surge, unavailable: 0 } : r;
}
/** RollingUpdateStrategy as describe prints it: 25% max unavailable, 25% max surge. */
export function rollingText(d: JObj): string {
  const ru = obj(obj(obj(d.spec).strategy).rollingUpdate);
  return `${String(ru.maxUnavailable ?? '25%')} max unavailable, ${String(ru.maxSurge ?? '25%')} max surge`;
}
