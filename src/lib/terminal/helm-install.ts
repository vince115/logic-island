import type { FsState } from './fs';
import { clockOf } from './processes';
import { createDoc } from './kube-write';
import { namespaceExists } from './kube-api';
import { stamp, type KubeState } from './kube-model';
import { readDoc, renderChart } from './helm-render';
import { coalesce } from './helm-values';
import { fromJ, toJ, type VMap } from './helm-value';
import type { Chart } from './helm-chart';
import { buildError, createAll, deleteAll, dirty, ownershipError, resKey, resources, updateAll, waitReady, type Res } from './helm-apply';
import { dropRelease, historyOf, prune, statusLines, storeRelease, type Release } from './helm-release';
import { API_VERSIONS, durationOf, fail, flag, givenValues, kubeVersionOf, locateChart, UNREACHABLE, userValues, type HelmResult, type Hx } from './helm';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §7, §8): helm install, upgrade, rollback and uninstall. A release
 * revision is written as pending, the cluster changed, and with --wait (or --atomic) the clock moves until the objects
 * are ready; failing, the revision is failed with Helm's description ("Release \"web\" failed: …", "Upgrade \"web\"
 * failed: …") and --atomic uninstalls the install or rolls the upgrade back to the last successful revision. Success
 * makes it deployed (and an upgrade's or rollback's previous revision superseded); history keeps 10 revisions.
 */

const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const usage = (x: Hx, cmd: string, use: string, want: string) => { x.io.err(`Error: "helm ${cmd}" requires ${want}`); x.io.err(''); x.io.err(`Usage:  helm ${cmd} ${use} [flags]`); return { state: x.state, status: 1 }; };
const k0 = (s: FsState) => s.kube!;
const nowOf = (s: FsState) => clockOf(s).now;
/** --timeout (default 5m0s), or the flag's error. */
function timeoutOf(x: Hx): number | string {
  const t = flag(x, 'timeout');
  if (t === undefined) return 300;
  const d = durationOf(t);
  return d === null ? `invalid argument "${t}" for "--timeout" flag: time: invalid duration "${t}"` : d;
}
const docsOf = (manifest: string): Res['doc'][] => manifest.split(/^---\n# Source: [^\n]*\n/m).map(d => d.trim()).filter(Boolean).map(d => { const r = readDoc(d, ''); return 'doc' in r ? r.doc : {}; });
const resOf = (r: Release) => resources(docsOf(r.manifest), r.name, r.namespace);

interface Plan { name: string; ns: string; chart: Chart; config: VMap; values: VMap; revision: number; install: boolean }
type Prepared = { rel: Release; res: Res[] } | { error: string };
/** Renders and builds a revision (pending), checking the objects it would take over. */
function prepare(x: Hx, p: Plan, current: readonly Res[]): Prepared {
  const r = renderChart(p.chart, p.values, { name: p.name, namespace: p.ns, revision: p.revision, install: p.install, kubeVersion: kubeVersionOf(x), apiVersions: API_VERSIONS });
  if ('error' in r) return r;
  const res = resources(r.manifests.map(m => m.doc), p.name, p.ns), k = k0(x.state);
  const e = buildError(k, res, p.ns) ?? ownershipError(k, res, p.name, p.ns, p.install ? 'install' : 'update', new Set(current.map(resKey)));
  if (e) return { error: e };
  const t = stamp(x.now), rel: Release = { name: p.name, namespace: p.ns, version: p.revision, manifest: r.text, config: toJ(p.config) as Release['config'],
    chart: { metadata: toJ(p.chart.meta) as Release['config'], values: toJ(p.chart.values) as Release['config'] },
    info: { first_deployed: t, last_deployed: t, deleted: '', description: '', status: p.install ? 'pending-install' : 'pending-upgrade', notes: r.notes } };
  return { rel, res };
}
/** --wait: the state after waiting (clock moved) and whether everything became ready. */
function settle(x: Hx, state: FsState, res: readonly Res[], timeout: number): { state: FsState; error?: string } {
  if (!x.flags.bools.has('wait') && !x.flags.bools.has('atomic')) return { state };
  const w = waitReady(state, res, timeout);
  return w.ok ? { state: w.state } : { state: w.state, error: 'context deadline exceeded' };
}
const store = (s: FsState, r: Release) => ({ ...s, kube: storeRelease(k0(s), r, nowOf(s)) });

/** Installs a release (also helm upgrade --install and the lesson's boot releases); prints its status. */
export function install(x: Hx, name: string, chart: Chart, config: VMap, quiet = false): HelmResult {
  const F = (m: string, s = x.state) => fail(x, `INSTALLATION FAILED: ${m}`, s);
  if (chart.type === 'library') return F('library charts are not installable');
  if (!x.cluster) return F(UNREACHABLE);
  if (!NAME.test(name) || name.length > 53) return F(`release name "${name}": invalid release name, must match regex ^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$ and the length must not be longer than 53`);
  if (historyOf(k0(x.state), name, x.ns).length) return F('cannot re-use a name that is still in use');
  const timeout = timeoutOf(x);
  if (typeof timeout === 'string') return fail(x, timeout);
  const p = prepare(x, { name, ns: x.ns, chart, config, values: coalesce(chart.values, config), revision: 1, install: true }, []);
  if ('error' in p) return F(p.error);
  if (flag(x, 'dry-run') && flag(x, 'dry-run') !== 'none') { statusLines({ ...p.rel, info: { ...p.rel.info, description: 'Dry run complete' } }, { dryRun: true }).forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; }
  let k = k0(x.state);
  if (!namespaceExists(k, x.ns)) {
    if (!x.flags.bools.has('create-namespace')) return F(`create: failed to create: namespaces "${x.ns}" not found`);
    const c = createDoc(k, { apiVersion: 'v1', kind: 'Namespace', metadata: { labels: { name: x.ns }, name: x.ns } }, x.ns, x.now, '');
    if ('k' in c) k = c.k;
  }
  k = storeRelease(k, p.rel, x.now);
  const made = createAll(k, p.res, x.ns, x.now);
  let state: FsState = { ...x.state, kube: dirty(made.k, x.now) }, error = made.error;
  if (!error) { const w = settle(x, state, p.res, timeout as number); state = w.state; error = w.error; }
  if (error) {
    state = store(state, { ...p.rel, info: { ...p.rel.info, status: 'failed', description: `Release "${name}" failed: ${error}` } });
    if (!x.flags.bools.has('atomic')) return F(error, state);
    const gone = uninstallRelease(state, { ...p.rel, info: { ...p.rel.info, status: 'failed' } }, false);
    return F(`release ${name} failed, and has been uninstalled due to atomic being set: ${error}`, gone);
  }
  const done: Release = { ...p.rel, info: { ...p.rel.info, status: 'deployed', description: 'Install complete' } };
  if (!quiet) statusLines(done).forEach(l => x.io.out(l));
  return { state: store(state, done), status: 0 };
}

export function installCommand(x: Hx): HelmResult {
  const gen = x.flags.bools.has('generate-name');
  if (!x.pos.length) return usage(x, 'install', '[NAME] [CHART]', 'at least 1 argument');
  if (!gen && x.pos.length < 2) return fail(x, 'INSTALLATION FAILED: must either provide a name or specify --generate-name');
  const [name0, ref] = gen ? ['', x.pos[0]] : x.pos;
  if (x.pos.length > (gen ? 1 : 2)) return fail(x, `INSTALLATION FAILED: expected at most two arguments, unexpected arguments: ${x.pos.slice(gen ? 1 : 2).join(', ')}`);
  const base = ref.split('/').filter(Boolean).pop() ?? 'chart', name = gen ? `${base.split('.')[0] || 'chart'}-${x.now}` : name0;
  const c = locateChart(x, ref);
  if ('error' in c) return fail(x, `INSTALLATION FAILED: ${c.error}`);
  const v = userValues(x);
  if ('error' in v) return fail(x, `INSTALLATION FAILED: ${v.error}`);
  return install(x, name, c.chart, v as VMap);
}

export function upgradeCommand(x: Hx): HelmResult {
  if (x.pos.length !== 2) return usage(x, 'upgrade', '[RELEASE] [CHART]', '2 arguments');
  const [name, ref] = x.pos, F = (m: string, s = x.state) => fail(x, `UPGRADE FAILED: ${m}`, s);
  if (!x.cluster) return F(UNREACHABLE);
  const hist = historyOf(k0(x.state), name, x.ns), last = hist.at(-1);
  if (x.flags.bools.has('install') && (!last || last.info.status === 'uninstalled')) {
    x.io.out(`Release "${name}" does not exist. Installing it now.`);
    const c = locateChart(x, ref), v = userValues(x);
    if ('error' in c) return fail(x, `INSTALLATION FAILED: ${c.error}`);
    return 'error' in v ? fail(x, `INSTALLATION FAILED: ${v.error}`) : install(x, name, c.chart, v as VMap);
  }
  const c = locateChart(x, ref);
  if ('error' in c) return F(c.error);
  const v = userValues(x);
  if ('error' in v) return F(v.error as string);
  return upgrade(x, name, c.chart, v as VMap, givenValues(x));
}
/** Upgrades a release to the chart with the user's values (given: -f or --set were used); prints its status. */
export function upgrade(x: Hx, name: string, chart: Chart, user: VMap, given: boolean, quiet = false): HelmResult {
  const F = (m: string, s = x.state) => fail(x, `UPGRADE FAILED: ${m}`, s), hist = historyOf(k0(x.state), name, x.ns), last = hist.at(-1);
  if (!last) return F(`"${name}" has no deployed releases`);
  if (last.info.status.startsWith('pending')) return F('another operation (install/upgrade/rollback) is in progress');
  const current = [...hist].reverse().find(r => r.info.status === 'deployed') ?? (['failed', 'superseded'].includes(last.info.status) ? last : undefined);
  if (!current) return F(`"${name}" has no deployed releases`);
  const prevConfig = fromJ(current.config ?? {}) as VMap;
  let config = user, values = coalesce(chart.values, user);
  if (x.flags.bools.has('reuse-values')) { config = coalesce(prevConfig, user); values = coalesce(coalesce(fromJ(current.chart.values) as VMap, prevConfig), config); }
  else if (!x.flags.bools.has('reset-values') && !given && Object.keys(prevConfig).length) { config = prevConfig; values = coalesce(chart.values, config); }
  const timeout = timeoutOf(x);
  if (typeof timeout === 'string') return fail(x, timeout);
  const curRes = resOf(current), p = prepare(x, { name, ns: x.ns, chart, config, values, revision: last.version + 1, install: false }, curRes);
  if ('error' in p) return F(p.error);
  const rel: Release = { ...p.rel, info: { ...p.rel.info, first_deployed: current.info.first_deployed } };
  if (flag(x, 'dry-run') && flag(x, 'dry-run') !== 'none') { x.io.out(`Release "${name}" has been upgraded. Happy Helming!`); statusLines({ ...rel, info: { ...rel.info, description: 'Dry run complete' } }, { dryRun: true }).forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; }
  const r = transition(x, x.state, curRes, rel, p.res, timeout, 'Upgrade complete', `Upgrade "${name}" failed: `);
  if (!r.error) { if (!quiet) [`Release "${name}" has been upgraded. Happy Helming!`, ...statusLines(r.rel)].forEach(l => x.io.out(l)); return { state: r.state, status: 0 }; }
  if (!x.flags.bools.has('atomic')) return F(r.error, r.state);
  const good = historyOf(k0(r.state), name, x.ns).filter(h => h.info.status === 'superseded' || h.info.status === 'deployed').at(-1);
  if (!good) return F(`unable to find a previously successful release when attempting to rollback: ${r.error}`, r.state);
  const back = rollbackTo(x, r.state, name, good.version, timeout, true);
  return back.error ? F(`an error occurred while rolling back the release. original upgrade error: ${r.error}: ${back.error}`, back.state) : F(`release ${name} failed, and has been rolled back due to atomic being set: ${r.error}`, back.state);
}

/** One revision replacing another in the cluster (upgrade, rollback): update, wait, record. */
function transition(x: Hx, s0: FsState, curRes: Res[], rel: Release, res: Res[], timeout: number, okText: string, failText: string, wait = false): { state: FsState; rel: Release; error?: string } {
  const t = nowOf(s0), up = updateAll(s0.docker, storeRelease(k0(s0), rel, t), curRes, res, rel.namespace, t);
  let state: FsState = { ...s0, kube: dirty(up.k, t) }, error = up.error;
  if (!error && (wait || x.flags.bools.has('wait') || x.flags.bools.has('atomic'))) { const w = waitReady(state, res, timeout); state = w.state; if (!w.ok) error = 'context deadline exceeded'; }
  if (error) return { state: store(state, { ...rel, info: { ...rel.info, status: 'failed', description: `${failText}${error}` } }), rel, error };
  let k = k0(state);
  for (const h of historyOf(k, rel.name, rel.namespace)) if (h.info.status === 'deployed' && h.version !== rel.version) k = storeRelease(k, { ...h, info: { ...h.info, status: 'superseded' } }, nowOf(state));
  const done: Release = { ...rel, info: { ...rel.info, status: 'deployed', description: okText } };
  return { state: { ...state, kube: prune(storeRelease(k, done, nowOf(state)), rel.name, rel.namespace, nowOf(state)) }, rel: done };
}
function rollbackTo(x: Hx, s: FsState, name: string, version: number, timeout: number, wait: boolean): { state: FsState; error?: string } {
  const hist = historyOf(k0(s), name, x.ns), current = hist.at(-1)!, target = hist.find(r => r.version === version)!;
  const rel: Release = { ...target, version: current.version + 1, info: { ...target.info, first_deployed: current.info.first_deployed, last_deployed: stamp(nowOf(s)), deleted: '', status: 'pending-rollback', description: '' } };
  const r = transition(x, s, resOf(current), rel, resOf(target), timeout, `Rollback to ${version}`, `Rollback "${name}" failed: `, wait);
  return r.error ? { state: r.state, error: r.error } : { state: r.state };
}

export function rollbackCommand(x: Hx): HelmResult {
  if (!x.pos.length) return usage(x, 'rollback', '<RELEASE> [REVISION]', 'at least 1 argument');
  const [name, rev] = x.pos;
  if (rev !== undefined && !/^-?\d+$/.test(rev)) return fail(x, `could not convert revision to a number: strconv.Atoi: parsing "${rev}": invalid syntax`);
  if (!x.cluster) return fail(x, UNREACHABLE);
  const hist = historyOf(k0(x.state), name, x.ns), current = hist.at(-1);
  if (!current) return fail(x, 'release: not found');
  const want = rev === undefined || Number(rev) === 0 ? current.version - 1 : Number(rev), timeout = timeoutOf(x);
  if (Number(rev) < 0) return fail(x, 'invalid release revision number');
  if (!hist.some(r => r.version === want)) return fail(x, `release has no ${want} version`);
  if (typeof timeout === 'string') return fail(x, timeout);
  const r = rollbackTo(x, x.state, name, want, timeout, x.flags.bools.has('wait'));
  if (r.error) return fail(x, r.error, r.state);
  x.io.out('Rollback was a success! Happy Helming!');
  return { state: r.state, status: 0 };
}

/** Deletes a release's objects and records it uninstalled (keep) or removes its history. */
function uninstallRelease(s: FsState, rel: Release, keep: boolean): FsState {
  const t = nowOf(s);
  let k: KubeState = deleteAll(s.docker, k0(s), resOf(rel), t);
  if (keep) k = storeRelease(k, { ...rel, info: { ...rel.info, status: 'uninstalled', deleted: stamp(t), description: 'Uninstallation complete' } }, t);
  else for (const h of historyOf(k, rel.name, rel.namespace)) k = dropRelease(k, h, t);
  return { ...s, kube: dirty(k, t) };
}
export function uninstallCommand(x: Hx): HelmResult {
  if (!x.pos.length) return usage(x, 'uninstall', 'RELEASE_NAME [...]', 'at least 1 argument');
  if (!x.cluster) return fail(x, UNREACHABLE);
  let state = x.state;
  for (const name of x.pos) {
    const last = historyOf(k0(state), name, x.ns).at(-1), keep = x.flags.bools.has('keep-history');
    if (!last) return fail(x, `uninstall: Release not loaded: ${name}: release: not found`, state);
    if (last.info.status === 'uninstalled' && keep) return fail(x, `the release named "${name}" is already deleted`, state);
    state = last.info.status === 'uninstalled' ? uninstallRelease(state, { ...last, manifest: '' }, false) : uninstallRelease(state, last, keep);
    x.io.out(`release "${name}" uninstalled`);
  }
  return { state, status: 0 };
}
