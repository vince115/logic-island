import { DAY, parseTime, type Seconds } from './clock';
import type { FsState } from './fs';
import type { KubeState } from './kube-model';
import { loadChart, CHART_LIMITS } from './helm-chart';
import { parseValues } from './helm-values';
import type { VMap } from './helm-value';
import { REPO_URL, indexFile, indexYaml, repoFile, reposYaml } from './helm-repo';
import { historyOf } from './helm-release';
import { install, upgrade } from './helm-install';
import type { Hx } from './helm';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §11): the lesson's Helm data (kube.helm, the helm profile only).
 * charts: what https://charts.example.test serves — each chart's files and when it was published (default: when the
 * cluster was created; a later time makes helm repo update matter). repos: repositories already added (their index
 * cached as at the machine's start). releases: releases installed at boot, in order (the same name again is an upgrade),
 * from a repository chart by name and version, with values (YAML), a namespace and a time.
 */

export interface HelmLesson {
  charts?: { files: Record<string, string>; published?: string }[];
  repos?: { name: string; url: string }[];
  releases?: { name: string; chart: string; version?: string; values?: string; namespace?: string; at?: string }[];
}
export interface HelmState { charts: readonly { files: Readonly<Record<string, string>>; published: Seconds }[] }
const REL = (p: string) => /^[^/]/.test(p) && !p.split('/').includes('..') && !p.split('/').includes('') && p.length <= 200;
const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export function helmProblems(h: HelmLesson, created: Seconds, now: Seconds): string[] {
  const out: string[] = [], fail = (t: string) => out.push(`kube: helm.${t}`);
  if (typeof h !== 'object' || h === null) return ['kube: helm is { charts?, repos?, releases? }'];
  const charts = h.charts ?? [], seen = new Set<string>();
  if (!Array.isArray(charts) || charts.length > 6) fail('charts are at most 6 charts');
  for (const [i, c] of (Array.isArray(charts) ? charts : []).entries()) {
    const files = Object.entries(c?.files ?? {});
    if (!files.length || files.length > CHART_LIMITS.files || files.some(([p, t]) => !REL(p) || typeof t !== 'string' || t.length > 4000)) { fail(`charts[${i}]: files map at most ${CHART_LIMITS.files} relative paths to text of at most 4000 characters`); continue; }
    const ch = loadChart(c.files);
    if ('error' in ch) { fail(`charts[${i}]: ${ch.error}`); continue; }
    if (seen.has(`${ch.name}-${ch.version}`)) fail(`charts[${i}]: ${ch.name} ${ch.version} is listed twice`);
    seen.add(`${ch.name}-${ch.version}`);
    const at = c.published === undefined ? created : parseTime(c.published);
    if (at === undefined || at < created || at > now + DAY) fail(`charts[${i}]: published is a UTC time between the cluster's creation and a day after now`);
  }
  const repos = h.repos ?? [];
  if (!Array.isArray(repos) || repos.length > 4 || repos.some(r => !NAME.test(String(r?.name)) || r.url !== REPO_URL) || new Set(repos.map(r => r.name)).size !== repos.length) fail(`repos are at most 4 of { name, url: ${REPO_URL} }, each name once`);
  const rels = h.releases ?? [];
  if (!Array.isArray(rels) || rels.length > 6) fail('releases are at most 6');
  for (const [i, r] of (Array.isArray(rels) ? rels : []).entries()) {
    if (!NAME.test(String(r?.name)) || String(r.name).length > 53) fail(`releases[${i}]: name is a release name`);
    if (r.namespace !== undefined && !NAME.test(r.namespace)) fail(`releases[${i}]: namespace is a namespace name`);
    if (!chartFiles(h, r.chart, r.version)) fail(`releases[${i}]: no chart ${String(r.chart)}${r.version ? ` ${r.version}` : ''} among helm.charts`);
    if (r.values !== undefined && (typeof r.values !== 'string' || 'error' in parseValues(r.values, 'values'))) fail(`releases[${i}]: values is a YAML mapping`);
    const at = r.at === undefined ? now : parseTime(r.at);
    if (at === undefined || at < created || at > now) fail(`releases[${i}]: at is a UTC time between the cluster's creation and now`);
  }
  return out;
}
/** A lesson chart's files by name (and version; else the newest). */
function chartFiles(h: HelmLesson, name: string, version?: string): Record<string, string> | undefined {
  const all = (h.charts ?? []).map(c => ({ c, ch: loadChart(c.files ?? {}) })).filter(e => !('error' in e.ch) && e.ch.name === name && (!version || e.ch.version === version));
  return all.at(-1)?.c.files;
}
/** The cluster's repository charts (the helm profile). */
export const helmState = (h: HelmLesson | undefined, created: Seconds): HelmState =>
  ({ charts: (h?.charts ?? []).map(c => ({ files: { ...c.files }, published: c.published === undefined ? created : parseTime(c.published) ?? created })) });

/** The files repos add at the start: repositories.yaml and each repository's index as at now. */
export function helmFiles(h: HelmLesson | undefined, home: string, created: Seconds, now: Seconds): [string, string][] {
  if (!h?.repos?.length) return [];
  const charts = helmState(h, created).charts;
  return [[repoFile({ home }), reposYaml(h.repos)], ...h.repos.map(r => [indexFile({ home }, r.name), indexYaml(charts, now, r.url)] as [string, string])];
}

/** Installs (or upgrades) the boot releases in time order on the state; problems for the lesson's data. */
export function bootReleases(state0: FsState, h: HelmLesson | undefined, now: Seconds, problems: string[]): FsState {
  let state = state0;
  const errs: string[] = [], io = { out: () => undefined, err: (l: string) => { errs.push(l); } };
  for (const [i, r] of (h?.releases ?? []).map((r, i) => [i, r] as const).sort((a, b) => (parseTime(a[1].at ?? '') ?? now) - (parseTime(b[1].at ?? '') ?? now))) {
    const files = chartFiles(h!, r.chart, r.version), ch = files ? loadChart(files) : null, values = parseValues(r.values ?? '', 'values');
    if (!ch || 'error' in ch || 'error' in values) continue;
    const at = parseTime(r.at ?? '') ?? now, ns = r.namespace ?? 'default';
    const x: Hx = { state, flags: { values: {}, bools: new Set(['create-namespace']) }, pos: [], io, now: at, ns, nsGiven: true, cluster: true };
    errs.length = 0;
    const res = historyOf(state.kube as KubeState, r.name, ns).length ? upgrade(x, r.name, ch, values as VMap, true, true) : install(x, r.name, ch, values as VMap, true);
    if (res.status) problems.push(`helm.releases[${i}]: ${errs.join(' ').replace(/^Error: /, '')}`);
    else state = res.state;
  }
  return state;
}
