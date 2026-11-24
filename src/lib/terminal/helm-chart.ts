import { isInside, resolvePath, type FsState } from './fs';
import { decodeTar, encodeTar, type TarMember } from './tar';
import { parseYaml, YamlError } from './yaml';
import { toJson } from './kube-manifest';
import { parseValues } from './helm-values';
import { fromJ, type VMap } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §4): charts. A chart is a set of files — Chart.yaml (apiVersion
 * v2, name, version, appVersion, description, type; dependencies are prose), values.yaml, templates/ (manifests,
 * _helpers.tpl partials, NOTES.txt) and any other file (.Files.Get) — read from a folder on the workstation, from a chart
 * archive (helm package, helm pull: the E22 tar format, gzip, one top folder), or from the lesson's repository. Loading
 * checks Chart.yaml as Helm's Metadata.Validate does ("validation: chart.metadata.version is required").
 */

export interface Chart {
  name: string; version: string; appVersion: string; apiVersion: string; type: string; description: string; icon: string;
  /** Chart.yaml's fields (for .Chart and helm show chart). */
  meta: VMap;
  valuesText: string; values: VMap;
  /** Every file by its path in the chart (templates/deployment.yaml, values.yaml…). */
  files: Readonly<Record<string, string>>;
}
export const CHART_LIMITS = { files: 30 } as const;
const SEMVER = /^v?\d+(\.\d+)?(\.\d+)?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
export const validSemver = (v: string) => SEMVER.test(v);
const text = (v: unknown) => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';

/** A chart from its files (paths relative to the chart's folder). */
export function loadChart(files: Readonly<Record<string, string>>): Chart | { error: string } {
  if (files['Chart.yaml'] === undefined) return { error: 'Chart.yaml file is missing' };
  let meta: VMap;
  try {
    const j = toJson(parseYaml(files['Chart.yaml']));
    meta = j && typeof j === 'object' && !Array.isArray(j) ? fromJ(j) as VMap : {};
  } catch (e) {
    if (e instanceof YamlError) return { error: `cannot load Chart.yaml: error converting YAML to JSON: ${e.message}` };
    throw e;
  }
  const values = files['values.yaml'] === undefined ? {} : parseValues(files['values.yaml'], 'cannot load values.yaml');
  if ('error' in values) return { error: values.error as string };
  const name = text(meta.name), version = text(meta.version), apiVersion = text(meta.apiVersion), type = text(meta.type);
  const invalid = !apiVersion ? 'chart.metadata.apiVersion is required' : !name ? 'chart.metadata.name is required' : name.includes('/') ? `chart.metadata.name "${name}" is invalid`
    : !version ? 'chart.metadata.version is required' : !validSemver(version) ? `chart.metadata.version "${version}" is invalid` : !['', 'application', 'library'].includes(type) ? 'chart.metadata.type must be application or library' : null;
  if (invalid) return { error: `validation: ${invalid}` };
  return { name, version, apiVersion, type: type || 'application', appVersion: text(meta.appVersion), description: text(meta.description), icon: text(meta.icon), meta, valuesText: files['values.yaml'] ?? '', values, files };
}

/** The files of a chart folder on the workstation (paths relative to it), or null when it is not a folder. */
export function folderFiles(state: FsState, dir: string): Record<string, string> | null {
  if (state.nodes.get(dir)?.kind !== 'dir') return null;
  const out: Record<string, string> = {};
  for (const [p, n] of state.nodes) if (n.kind === 'file' && isInside(p, dir) && p !== dir) out[p.slice(dir === '/' ? 1 : dir.length + 1)] = n.content ?? '';
  return out;
}
/** A chart archive's files (its one top folder stripped), or why it is not one. */
export function archiveFiles(content: string, word: string): { files: Record<string, string> } | { error: string } {
  const tar = decodeTar(content);
  if (!tar || !tar.gzip) return { error: `file '${word}' does not appear to be a gzipped archive; got 'text/plain; charset=utf-8'` };
  const out: Record<string, string> = {};
  for (const m of tar.members) {
    const parts = m.name.replace(/^\.\//, '').split('/').filter(Boolean);
    if (m.kind === 'file' && parts.length > 1) out[parts.slice(1).join('/')] = m.content ?? '';
  }
  return Object.keys(out).length ? { files: out } : { error: 'Chart.yaml file is missing' };
}
/** A chart's archive (NAME-VERSION.tgz): its files under NAME/, gzip. */
export function chartArchive(name: string, files: Readonly<Record<string, string>>, owner: string, mtime: number): string {
  const members: TarMember[] = Object.keys(files).sort().map(p => ({ name: `${name}/${p}`, kind: 'file', mode: 0o644, user: owner, group: owner, uid: 1000, gid: 1000, mtime, content: files[p] }));
  return encodeTar(members, true);
}

/** Where a chart argument points on the workstation: a folder, an archive, or nothing there. */
export function localChart(state: FsState, word: string): { files: Record<string, string> } | { error: string } | null {
  const path = resolvePath(state, word), node = state.nodes.get(path);
  if (!node) return word.startsWith('.') || word.startsWith('/') || word.startsWith('~') ? { error: `path "${word}" not found` } : null;
  if (node.kind === 'dir') {
    const files = folderFiles(state, path)!;
    if (files['Chart.yaml'] === undefined) return { error: 'Chart.yaml file is missing' };
    if (Object.keys(files).length > CHART_LIMITS.files) return { error: `（模擬環境：chart 最多 ${CHART_LIMITS.files} 個檔案）` };
    return { files };
  }
  return archiveFiles(node.content ?? '', word);
}

/** Semantic versions compared (major.minor.patch, then a pre-release before the release). */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => { const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([^+]*))?/.exec(v); return m ? { n: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre: m[4] ?? '' } : { n: [0, 0, 0], pre: '' }; };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i];
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}
