import type { Seconds } from './clock';
import { created, put, remove } from './kube-api';
import { b64, secretText, touched } from './kube-config-spec';
import { kindOf, meta, nsOf, obj, parseStamp, str, type JObj, type KubeState } from './kube-model';
import { fields, MONTHS, WEEKDAYS } from './clock';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §6): releases as Helm v3's secrets driver stores them — one Secret
 * per revision, sh.helm.release.v1.NAME.vN, type helm.sh/release.v1, labels name, owner=helm, status, version (and
 * createdAt, modifiedAt). Real Helm puts base64 of gzip of the release's JSON in data.release; here it is base64 of the
 * JSON itself (a documented simplification: it looks like base64 data and is never what an exercise is about). The
 * status block, list and history tables are Helm's (uitable cells padded and joined by tabs).
 */

export type Status = 'deployed' | 'failed' | 'superseded' | 'uninstalled' | 'uninstalling' | 'pending-install' | 'pending-upgrade' | 'pending-rollback';
export interface Release {
  name: string; namespace: string; version: number;
  info: { first_deployed: string; last_deployed: string; deleted: string; description: string; status: Status; notes: string };
  /** The chart's Chart.yaml fields and its own values (defaults). */
  chart: { metadata: JObj; values: JObj };
  /** The user-supplied values. */
  config: JObj;
  manifest: string;
}
export const RELEASE_TYPE = 'helm.sh/release.v1';
export const HISTORY_MAX = 10;
export const secretName = (name: string, version: number) => `sh.helm.release.v1.${name}.v${version}`;
const isRelease = (o: JObj) => kindOf(o) === 'Secret' && str(o.type) === RELEASE_TYPE && str(obj(meta(o).labels).owner) === 'helm';

/** A release Secret's release (null when its data is not one). */
export function decodeRelease(o: JObj): Release | null {
  try {
    const r = JSON.parse(secretText(secretText(obj(o.data).release))) as Release;
    return r && typeof r.name === 'string' && typeof r.version === 'number' ? r : null;
  } catch { return null; }
}
/** Every release record in the cluster (of a namespace), oldest revision first. */
export function releasesIn(k: KubeState, ns?: string): Release[] {
  return k.objects.filter(o => isRelease(o) && (ns === undefined || nsOf(o) === ns)).map(decodeRelease).filter((r): r is Release => !!r)
    .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name) || a.version - b.version);
}
export const historyOf = (k: KubeState, name: string, ns: string) => releasesIn(k, ns).filter(r => r.name === name);
export const lastOf = (k: KubeState, name: string, ns: string): Release | undefined => historyOf(k, name, ns).at(-1);

/** Writes the release's Secret (created at t, or updated keeping its creation). */
export function storeRelease(k0: KubeState, r: Release, t: Seconds): KubeState {
  const name = secretName(r.name, r.version), live = k0.objects.find(o => kindOf(o) === 'Secret' && nsOf(o) === r.namespace && str(meta(o).name) === name);
  const labels: JObj = { ...live ? obj(meta(live).labels) : { createdAt: String(t) }, ...live ? { modifiedAt: String(t) } : {}, name: r.name, owner: 'helm', status: r.info.status, version: String(r.version) };
  const data = { release: b64(b64(JSON.stringify(r))) };
  if (live) { const o = { ...live, metadata: { ...meta(live), labels }, data }; return touched(put(k0, o), o, t); }
  const c = created(k0, { apiVersion: 'v1', kind: 'Secret', metadata: { labels, name }, type: RELEASE_TYPE, data }, r.namespace, t);
  return touched(put(c.k, c.o), c.o, t);
}
export function dropRelease(k0: KubeState, r: Pick<Release, 'name' | 'namespace' | 'version'>, t: Seconds): KubeState {
  const o = k0.objects.find(x => kindOf(x) === 'Secret' && nsOf(x) === r.namespace && str(meta(x).name) === secretName(r.name, r.version));
  return o ? touched(remove(k0, o), o, t) : k0;
}
/** --history-max: the oldest revisions beyond the limit go (never the deployed one). */
export function prune(k0: KubeState, name: string, ns: string, t: Seconds, max = HISTORY_MAX): KubeState {
  let k = k0;
  const h = historyOf(k, name, ns), extra = h.length - max;
  for (const r of h.filter(x => x.info.status !== 'deployed').slice(0, Math.max(0, extra))) k = dropRelease(k, r, t);
  return k;
}

const two = (n: number) => String(n).padStart(2, '0');
/** Go's time.ANSIC in UTC: Tue Nov 24 10:00:00 2026 (the day padded with a space). */
export function ansic(text: string): string {
  const t = parseStamp(text) ?? 0, f = fields(t);
  return `${WEEKDAYS[f.weekday]} ${MONTHS[f.month]} ${String(f.day).padStart(2)} ${two(f.hour)}:${two(f.minute)}:${two(f.second)} ${f.year}`;
}
/** The UPDATED column of helm list: Go's time.Time String() (whole seconds here). */
export const goTimeText = (text: string) => `${text.replace('T', ' ').replace('Z', '')} +0000 UTC`;
export const chartLabel = (r: Release) => `${str(r.chart.metadata.name) ?? ''}-${str(r.chart.metadata.version) ?? ''}`;
export const appVersionOf = (r: Release) => { const v = r.chart.metadata.appVersion; return typeof v === 'number' ? String(v) : str(v) ?? ''; };

/** gosuri/uitable: every cell padded to its column's width (cut to max with ...), joined by tabs. */
export function uiTable(rows: readonly (readonly string[])[], max = 0): string[] {
  const width = (s: string) => [...s].length, cut = (s: string) => max && width(s) > max ? `${[...s].slice(0, max - 3).join('')}...` : s;
  const cells = rows.map(r => r.map(cut)), widths: number[] = [];
  for (const r of cells) r.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, width(c)); });
  return cells.map(r => r.map((c, i) => c + ' '.repeat(widths[i] - width(c))).join('\t'));
}

/** printRelease's block (install, upgrade, status, rollback output). */
export function statusLines(r: Release, opts: { dryRun?: boolean } = {}): string[] {
  const out = [`NAME: ${r.name}`, `LAST DEPLOYED: ${ansic(r.info.last_deployed)}`, `NAMESPACE: ${r.namespace}`, `STATUS: ${r.info.status}`, `REVISION: ${r.version}`, 'TEST SUITE: None'];
  if (opts.dryRun) out.push('HOOKS:', 'MANIFEST:', ...r.manifest.split('\n'));
  if (r.info.notes.trim()) out.push('NOTES:', ...r.info.notes.trim().split('\n'));
  return out;
}
