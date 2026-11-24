import { parseYaml, YamlError } from './yaml';
import { toJson } from './kube-manifest';
import type { JObj } from './kube-model';
import type { Chart } from './helm-chart';
import { parseInto, ParseError } from './helm-tpl-parse';
import { execute, ExecError, FuncError, type Engine, type TV } from './helm-tpl-exec';
import { FUNC_NAMES, FUNCS } from './helm-tpl-funcs';
import type { Tree } from './helm-tpl-node';
import { GoInt, GoStruct, type V, type VMap } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §5): rendering a chart as Helm's engine does. Every file under
 * templates/ is parsed into one set (deeper paths first, then in reverse order, so the alphabetically first definition
 * of a name wins); every file but the _partials is executed with .Values, .Release, .Chart, .Capabilities, .Template and
 * .Files, "<no value>" removed; NOTES.txt becomes the notes; the rest is split at --- into manifests (trimmed, empty ones
 * dropped) sorted by Helm's install order of kinds (then file path, then their order in the file). Errors are Helm's:
 * "parse error at (web/templates/x.yaml:5): …", Go's exec errors, required's "execution error at (…): …",
 * "YAML parse error on web/templates/x.yaml: …".
 */

export interface RenderOpts { name: string; namespace: string; revision: number; install: boolean; kubeVersion: string; apiVersions: readonly string[]; lint?: boolean }
export interface Manifest { source: string; text: string; doc: JObj }
export const INSTALL_ORDER = ['PriorityClass', 'Namespace', 'NetworkPolicy', 'ResourceQuota', 'LimitRange', 'PodSecurityPolicy', 'PodDisruptionBudget', 'ServiceAccount', 'Secret', 'SecretList',
  'ConfigMap', 'StorageClass', 'PersistentVolume', 'PersistentVolumeClaim', 'CustomResourceDefinition', 'ClusterRole', 'ClusterRoleList', 'ClusterRoleBinding', 'ClusterRoleBindingList', 'Role',
  'RoleList', 'RoleBinding', 'RoleBindingList', 'Service', 'DaemonSet', 'Pod', 'ReplicationController', 'ReplicaSet', 'Deployment', 'HorizontalPodAutoscaler', 'StatefulSet', 'Job', 'CronJob',
  'IngressClass', 'Ingress', 'APIService', 'MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration'];
export const UNINSTALL_ORDER = ['MutatingWebhookConfiguration', 'ValidatingWebhookConfiguration', 'APIService', 'Ingress', 'IngressClass', 'Service', 'CronJob', 'Job', 'StatefulSet',
  'HorizontalPodAutoscaler', 'Deployment', 'ReplicaSet', 'ReplicationController', 'Pod', 'DaemonSet', 'RoleBindingList', 'RoleBinding', 'RoleList', 'Role', 'ClusterRoleBindingList',
  'ClusterRoleBinding', 'ClusterRoleList', 'ClusterRole', 'CustomResourceDefinition', 'PersistentVolumeClaim', 'PersistentVolume', 'StorageClass', 'ConfigMap', 'SecretList', 'Secret',
  'ServiceAccount', 'PodDisruptionBudget', 'PodSecurityPolicy', 'LimitRange', 'ResourceQuota', 'NetworkPolicy', 'Namespace', 'PriorityClass'];
/** sortManifestsByKind: known kinds in the order, unknown ones after them by kind; stable otherwise. */
export function byKind<T>(items: readonly T[], kind: (x: T) => string, order = INSTALL_ORDER): T[] {
  const rank = (k: string) => { const i = order.indexOf(k); return i < 0 ? Infinity : i; };
  return items.map((x, i) => ({ x, i })).sort((a, b) => {
    const ka = kind(a.x), kb = kind(b.x), ra = rank(ka), rb = rank(kb);
    if (ra === Infinity && rb === Infinity && ka !== kb) return ka < kb ? -1 : 1;
    return ra - rb || a.i - b.i;
  }).map(e => e.x);
}
/** sortTemplates: more path parts first, then reverse lexical order. */
const templateOrder = (names: string[]) => [...names].sort((a, b) => b.split('/').length - a.split('/').length || (a < b ? 1 : a > b ? -1 : 0));

/** The chart's structs and maps the templates see. */
function topValues(chart: Chart, values: VMap, o: RenderOpts): VMap {
  const kube = o.kubeVersion, [major, minor] = kube.replace(/^v/, '').split('.');
  const metaField = (k: string) => chart.meta[k] ?? null;
  const metadata = new GoStruct('*chart.Metadata', { Name: chart.name, Home: metaField('home') ?? '', Sources: metaField('sources') ?? [], Version: chart.version, Description: chart.description,
    Keywords: metaField('keywords') ?? [], Maintainers: metaField('maintainers') ?? [], Icon: chart.icon, APIVersion: chart.apiVersion, Condition: '', Tags: '', AppVersion: chart.appVersion,
    Deprecated: metaField('deprecated') === true, Annotations: metaField('annotations') ?? {}, KubeVersion: metaField('kubeVersion') ?? '', Dependencies: metaField('dependencies') ?? [], Type: chart.type });
  const kv = new GoStruct('chartutil.KubeVersion', { Version: kube, Major: major, Minor: minor }, { GitVersion: () => kube }, kube);
  const caps = new GoStruct('*chartutil.Capabilities', { KubeVersion: kv, APIVersions: new GoStruct('chartutil.VersionSet', {}, { Has: ([v]) => o.apiVersions.includes(String(v)) }, `[${o.apiVersions.join(' ')}]`),
    HelmVersion: new GoStruct('helmversion.BuildInfo', { Version: 'v3.16.4', GitCommit: HELM_COMMIT, GitTreeState: 'clean', GoVersion: 'go1.22.7' }) });
  const other = Object.fromEntries(Object.entries(chart.files).filter(([p]) => !p.startsWith('templates/') && !['Chart.yaml', 'values.yaml'].includes(p)));
  return {
    Values: values, Chart: metadata, Capabilities: caps, Subcharts: {},
    Release: { Name: o.name, Namespace: o.namespace, IsUpgrade: !o.install, IsInstall: o.install, Revision: new GoInt(o.revision), Service: 'Helm' },
    Files: new GoStruct('engine.files', {}, { Get: ([n]) => other[String(n)] ?? '' }),
  };
}
export const HELM_COMMIT = '7877b45b63f95635153b29a42c0c2f4273ec45ca';

/** cleanupParseError: "template: NAME:LINE: … msg" → "parse error at (NAME:LINE): msg". */
const parseErrorText = (m: string) => { const t = m.split(': '); return t.length === 1 ? `parse error in: ${m}` : `parse error at (${t[1]}): ${t[t.length - 1]}`; };
/** required's and fail's errors are reported at the outermost location. */
const execErrorText = (e: ExecError) => e.warn !== undefined && e.at ? `execution error at (${e.at}): ${e.warn}` : e.message;

/** Every template rendered (path → text; NOTES.txt among them), or the first error. */
export function renderTemplates(chart: Chart, values: VMap, o: RenderOpts): { out: Record<string, string> } | { error: string } {
  const names = templateOrder(Object.keys(chart.files).filter(p => p.startsWith('templates/')).map(p => `${chart.name}/${p}`));
  const set = new Map<string, Tree>();
  try { for (const n of names) parseInto(set, n, chart.files[n.slice(chart.name.length + 1)], FUNC_NAMES); } catch (e) {
    if (e instanceof ParseError) return { error: parseErrorText(e.message) };
    throw e;
  }
  const top = topValues(chart, values, o), budget = { left: 200_000 }, depth = new Map<string, number>();
  const engine = (s: Map<string, Tree>): Engine => ({ set: s, funcs: FUNCS, budget, env: cur => ({ lint: !!o.lint, template: cur,
    include: (name, data) => run(s, name, data, `rendering template has a nested reference name: ${name}: unable to execute template`, `template: no template ${JSON.stringify(name)} associated with template "gotpl"`),
    tpl: (text, data) => {
      const clone = new Map(s);
      try { parseInto(clone, cur, text, FUNC_NAMES); } catch (e) { if (e instanceof ParseError) throw new FuncError(`cannot parse template ${JSON.stringify(text)}: ${e.message}`); throw e; }
      return run(clone, cur, data, '', '').replaceAll('<no value>', '');
    } }) });
  const run = (s: Map<string, Tree>, name: string, data: TV, deep: string, missing: string): string => {
    const n = (depth.get(name) ?? 0) + 1, t = s.get(name);
    if (n > 1000) throw new FuncError(deep);
    if (!t) throw new FuncError(missing);
    depth.set(name, n);
    try { const out: string[] = []; execute(engine(s), t, name, data, out); return out.join(''); } catch (e) {
      if (e instanceof ExecError) throw new FuncError(e.message, e.warn);
      throw e;
    } finally { depth.set(name, n - 1); }
  };
  const out: Record<string, string> = {};
  for (const n of names) {
    if (n.split('/').pop()!.startsWith('_')) continue;
    const data: VMap = { ...top, Template: { Name: n, BasePath: `${chart.name}/templates` } }, buf: string[] = [];
    try { execute(engine(set), set.get(n)!, n, { v: data as V, t: 'chartutil.Values' }, buf); } catch (e) {
      if (e instanceof ExecError) return { error: execErrorText(e) };
      throw e;
    }
    out[n] = buf.join('').replaceAll('<no value>', '');
  }
  return { out };
}

/** SplitManifests: the documents of a rendered file, trimmed, empty ones dropped. */
export const splitDocs = (text: string) => text.split(/(?:^|\s*\n)---\s*/).map(d => d.trim()).filter(Boolean);
/** One rendered document as an object, or the YAML error Helm reports for it. */
export function readDoc(text: string, source: string): { doc: JObj } | { error: string } {
  try {
    const j = toJson(parseYaml(text, { flowNext: true }), true);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { error: `YAML parse error on ${source}: error unmarshaling JSON: json: cannot unmarshal ${Array.isArray(j) ? 'array' : 'string'} into Go value of type releaseutil.SimpleHead` };
    return { doc: j };
  } catch (e) {
    if (e instanceof YamlError) return { error: `YAML parse error on ${source}: error converting YAML to JSON: ${e.message}` };
    throw e;
  }
}

/** The chart rendered into its notes and its sorted manifests (and the release's manifest text). */
export function renderChart(chart: Chart, values: VMap, o: RenderOpts): { manifests: Manifest[]; notes: string; text: string } | { error: string } {
  if (chart.type === 'library') return { error: 'library charts are not installable' };
  const r = renderTemplates(chart, values, o);
  if ('error' in r) return r;
  const notesName = `${chart.name}/templates/NOTES.txt`, list: Manifest[] = [];
  for (const source of Object.keys(r.out).filter(n => n !== notesName && !n.endsWith('/NOTES.txt')).sort()) {
    for (const text of splitDocs(r.out[source])) {
      const r1 = readDoc(text, source);
      if ('error' in r1) return r1;
      const doc = r1.doc;
      if (doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata) && doc.metadata.annotations && typeof doc.metadata.annotations === 'object' && 'helm.sh/hook' in doc.metadata.annotations)
        return { error: `（模擬環境：${source} 是 Helm 的 hook（helm.sh/hook），hook 只在課文說明）` };
      list.push({ source, text, doc });
    }
  }
  const manifests = byKind(list, m => typeof m.doc.kind === 'string' ? m.doc.kind : '');
  return { manifests, notes: r.out[notesName] ?? '', text: manifestText(manifests) };
}
export const manifestText = (ms: readonly Pick<Manifest, 'source' | 'text'>[]) => ms.map(m => `---\n# Source: ${m.source}\n${m.text}\n`).join('');
