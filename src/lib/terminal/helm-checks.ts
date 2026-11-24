import type { FsState } from './fs';
import { settleKube } from './kube-settle';
import { str } from './kube-model';
import { historyOf, type Status } from './helm-release';
import { coalesce, valueAt } from './helm-values';
import { fromJ, strval, type VMap } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §12): the check helm-release — a release (its latest revision, in a
 * namespace) exists or not, with its status, revision, chart name and version, appVersion, at least so many revisions in
 * its history, and values of the computed values (the chart's values.yaml with the user's over it) at dotted paths,
 * compared as text (3 is "3", true is "true", a missing value is null). It reads the release Secrets of the cluster
 * settled to the clock, as kubectl get secrets would.
 */

export type HelmCheck = { kind: 'helm-release'; name: string; namespace?: string; absent?: true; status?: Status; revision?: number; revisionsAtLeast?: number;
  chart?: string; chartVersion?: string; appVersion?: string; values?: Record<string, string | number | boolean | null> };
const STATUSES: readonly Status[] = ['deployed', 'failed', 'superseded', 'uninstalled', 'pending-install', 'pending-upgrade', 'pending-rollback', 'uninstalling'];
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const whole = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;

export function helmCheckProblems(c: HelmCheck, helm: boolean): string | null {
  if (!helm) return 'a helm-release check needs a helm machine (engine stage E39)';
  if (!LINE(c.name, 53) || (c.namespace !== undefined && !LINE(c.namespace, 63))) return 'a helm-release check needs a release name (and maybe a namespace)';
  const more = [c.status, c.revision, c.revisionsAtLeast, c.chart, c.chartVersion, c.appVersion, c.values].some(v => v !== undefined);
  if (c.absent && more) return 'a helm-release check with absent checks nothing else';
  if (c.status !== undefined && !STATUSES.includes(c.status)) return `a helm-release check's status is one of ${STATUSES.join(', ')}`;
  if ((c.revision !== undefined && !whole(c.revision)) || (c.revisionsAtLeast !== undefined && !whole(c.revisionsAtLeast))) return 'a helm-release check\'s revision and revisionsAtLeast are whole numbers from 1';
  if ([c.chart, c.chartVersion, c.appVersion].some(v => v !== undefined && !LINE(v, 100))) return 'a helm-release check\'s chart, chartVersion and appVersion are texts';
  if (c.values !== undefined && (typeof c.values !== 'object' || c.values === null || !Object.keys(c.values).length || Object.entries(c.values).some(([p, v]) => !/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+|\[\d+\])*$/.test(p) || (v !== null && !['string', 'number', 'boolean'].includes(typeof v)))))
    return 'a helm-release check\'s values map dotted paths (image.tag, hosts[0]) to a text, number, boolean or null';
  return null;
}

export function describeHelmCheck(c: HelmCheck): string {
  const where = `${c.namespace ?? 'default'} 命名空間`;
  if (c.absent) return `${where}應該沒有名為 ${c.name} 的 Helm release`;
  const more = [c.status ? `狀態 ${c.status}` : '', c.revision !== undefined ? `revision ${c.revision}` : '', c.chart ? `chart ${c.chart}${c.chartVersion ? ` ${c.chartVersion}` : ''}` : c.chartVersion ? `chart 版本 ${c.chartVersion}` : '',
    c.appVersion ? `appVersion ${c.appVersion}` : '', ...Object.entries(c.values ?? {}).map(([p, v]) => `值 ${p}=${String(v)}`), c.revisionsAtLeast !== undefined ? `至少 ${c.revisionsAtLeast} 個 revision` : ''].filter(Boolean);
  return `${where}應該有名為 ${c.name} 的 Helm release${more.length ? `（${more.join('、')}）` : ''}`;
}

export function helmCheckFailure(c: HelmCheck, end: FsState): string | null {
  const k = settleKube(end).kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const h = historyOf(k, c.name, c.namespace ?? 'default'), r = h.at(-1);
  if (c.absent) return r ? `仍然有名為 ${c.name} 的 Helm release` : null;
  if (!r) return `沒有名為 ${c.name} 的 Helm release`;
  if (c.status !== undefined && r.info.status !== c.status) return `它的狀態是 ${r.info.status}`;
  if (c.revision !== undefined && r.version !== c.revision) return `它的 revision 是 ${r.version}`;
  if (c.revisionsAtLeast !== undefined && h.length < c.revisionsAtLeast) return `它只有 ${h.length} 個 revision`;
  const meta = r.chart.metadata, text = (v: unknown) => typeof v === 'number' ? String(v) : str(v as never) ?? '';
  if (c.chart !== undefined && text(meta.name) !== c.chart) return `它的 chart 是 ${text(meta.name)}`;
  if (c.chartVersion !== undefined && text(meta.version) !== c.chartVersion) return `它的 chart 版本是 ${text(meta.version)}`;
  if (c.appVersion !== undefined && text(meta.appVersion) !== c.appVersion) return `它的 appVersion 是 ${text(meta.appVersion) || '（沒有）'}`;
  const values = coalesce(fromJ(r.chart.values) as VMap, fromJ(r.config ?? {}) as VMap);
  for (const [path, want] of Object.entries(c.values ?? {})) {
    const got = valueAt(values, path), shown = got === undefined || got === null ? null : strval(got);
    if (want === null ? shown !== null : shown !== String(want)) return shown === null ? `它的值 ${path} 沒有設定` : `它的值 ${path} 是 ${shown}`;
  }
  return null;
}
