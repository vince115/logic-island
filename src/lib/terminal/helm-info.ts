import { coalesce } from './helm-values';
import { fromJ, toJsonText, toYamlText, type VMap } from './helm-value';
import { ansic, appVersionOf, chartLabel, goTimeText, historyOf, releasesIn, statusLines, uiTable, type Release } from './helm-release';
import { fail, flag, UNREACHABLE, type HelmResult, type Hx } from './helm';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §8): helm list (the latest revision of each release; deployed
 * and failed unless -a or a state flag; -A, -q), status, history (REVISION UPDATED STATUS CHART APP VERSION DESCRIPTION)
 * and get values|manifest|notes, read from the release Secrets of the namespace.
 */

const ok = (x: Hx, lines: readonly string[]): HelmResult => { lines.forEach(l => x.io.out(l)); return { state: x.state, status: 0 }; };
const exactly = (x: Hx, cmd: string, use: string): HelmResult => { x.io.err(`Error: "helm ${cmd}" requires 1 argument`); x.io.err(''); x.io.err(`Usage:  helm ${cmd} ${use} [flags]`); return { state: x.state, status: 1 }; };
const tableOnly = (x: Hx, cmd: string) => { const o = flag(x, 'output'); return o !== undefined && o !== 'table' ? `（模擬環境：helm ${cmd} 只模擬表格輸出，沒有 -o ${o}）` : null; };
/** The release at --revision (or the latest). */
function pick(x: Hx, name: string): Release | string {
  const h = historyOf(x.state.kube!, name, x.ns), rev = flag(x, 'revision');
  const r = rev === undefined ? h.at(-1) : h.find(v => String(v.version) === rev);
  return r ?? 'release: not found';
}

export function listCommand(x: Hx): HelmResult {
  if (!x.cluster) return fail(x, UNREACHABLE);
  const only = tableOnly(x, 'list');
  if (only) return fail(x, only);
  const states = ['deployed', 'failed', 'pending', 'uninstalled', 'superseded'].filter(s => x.flags.bools.has(s)), mask = x.flags.bools.has('all') ? null : states.length ? states : ['deployed', 'failed'];
  const latest = new Map<string, Release>();
  for (const r of releasesIn(x.state.kube!, x.flags.bools.has('all-namespaces') ? undefined : x.ns)) latest.set(`${r.namespace}/${r.name}`, r);
  const shown = [...latest.values()].filter(r => !mask || mask.includes(r.info.status.startsWith('pending') ? 'pending' : r.info.status)).sort((a, b) => a.name.localeCompare(b.name) || a.namespace.localeCompare(b.namespace));
  if (x.flags.bools.has('short')) return ok(x, shown.map(r => r.name));
  return ok(x, uiTable([['NAME', 'NAMESPACE', 'REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION'],
    ...shown.map(r => [r.name, r.namespace, String(r.version), goTimeText(r.info.last_deployed), r.info.status, chartLabel(r), appVersionOf(r)])]));
}

export function statusCommand(x: Hx): HelmResult {
  if (x.pos.length !== 1) return exactly(x, 'status', 'RELEASE_NAME');
  if (!x.cluster) return fail(x, UNREACHABLE);
  const only = tableOnly(x, 'status');
  if (only) return fail(x, only);
  const r = pick(x, x.pos[0]);
  return typeof r === 'string' ? fail(x, r) : ok(x, statusLines(r));
}

export function historyCommand(x: Hx): HelmResult {
  if (x.pos.length !== 1) return exactly(x, 'history', 'RELEASE_NAME');
  if (!x.cluster) return fail(x, UNREACHABLE);
  const only = tableOnly(x, 'history');
  if (only) return fail(x, only);
  const h = historyOf(x.state.kube!, x.pos[0], x.ns), max = Number(flag(x, 'max') ?? 256);
  if (!h.length) return fail(x, 'release: not found');
  return ok(x, uiTable([['REVISION', 'UPDATED', 'STATUS', 'CHART', 'APP VERSION', 'DESCRIPTION'],
    ...h.slice(-max).map(r => [String(r.version), ansic(r.info.last_deployed), r.info.status, chartLabel(r), appVersionOf(r), r.info.description])], 60));
}

export function getCommand(x: Hx): HelmResult {
  const [what, ...rest] = x.pos;
  if (!['values', 'manifest', 'notes'].includes(what ?? '')) {
    if (['all', 'hooks', 'metadata'].includes(what ?? '')) return fail(x, `（模擬環境：helm get ${what} 只在課文說明；請用 helm get values、manifest、notes）`);
    x.io.err(what ? `Error: unknown command "${what}" for "helm get"` : 'Error: "helm get" requires a subcommand'); return { state: x.state, status: 1 };
  }
  if (rest.length !== 1) return exactly(x, `get ${what}`, 'RELEASE_NAME');
  if (!x.cluster) return fail(x, UNREACHABLE);
  const r = pick({ ...x, pos: rest }, rest[0]);
  if (typeof r === 'string') return fail(x, r);
  if (what === 'manifest') return ok(x, r.manifest.split('\n'));
  if (what === 'notes') return ok(x, r.info.notes ? ['NOTES:', ...r.info.notes.split('\n')] : []);
  const all = x.flags.bools.has('all'), config = fromJ(r.config ?? {}) as VMap, vals = all ? coalesce(fromJ(r.chart.values) as VMap, config) : config, o = flag(x, 'output') ?? 'table';
  const yaml = !all && !Object.keys(config).length ? 'null' : toYamlText(vals);
  if (o === 'json') return ok(x, [!all && !Object.keys(config).length ? 'null' : toJsonText(vals)]);
  if (o === 'yaml') return ok(x, yaml.split('\n'));
  if (o !== 'table') return fail(x, `invalid argument "${o}" for "-o, --output" flag: invalid format type`);
  return ok(x, [all ? 'COMPUTED VALUES:' : 'USER-SUPPLIED VALUES:', ...yaml.split('\n')]);
}
