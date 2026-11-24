import type { FsState } from './fs';
import { find } from './kube-api';
import { settleKube } from './kube-settle';
import { configValues, SECRET_TYPES } from './kube-config-spec';
import { str } from './kube-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §9): the check kube-config — a ConfigMap or Secret (or that
 * it is gone): its type, the keys it has, a key's value (a Secret's decoded), whether it is immutable, and that a file on
 * the learner's machine (the manifest they wrote) does not hold its values in plain text. It reads the cluster settled
 * to the clock and never moves it; a failure never prints a Secret's value.
 */

export type ConfigCheck = { kind: 'kube-config'; resource: 'ConfigMap' | 'Secret'; name: string; namespace?: string; absent?: true; type?: string; keys?: string[];
  values?: { key: string; equals: string }[]; immutable?: boolean; notPlainIn?: { file: string; keys?: string[] } };
export const CONFIG_CHECK_KINDS = ['kube-config'] as const;
const LINE = (t: unknown, max = 253) => typeof t === 'string' && t.length >= 1 && t.length <= max && !t.includes('\n');
const KEY = (t: unknown) => LINE(t) && /^[-._a-zA-Z0-9]+$/.test(t as string);

export function configCheckProblems(c: ConfigCheck, config: boolean): string | null {
  if (!config) return 'a kube-config check needs a kube-config machine (engine stage E36)';
  if ((c.resource !== 'ConfigMap' && c.resource !== 'Secret') || !LINE(c.name) || (c.namespace !== undefined && !LINE(c.namespace, 63))) return 'a kube-config check needs a resource (ConfigMap or Secret), a name (and a namespace name)';
  if (c.absent !== undefined && (c.absent !== true || [c.type, c.keys, c.values, c.immutable, c.notPlainIn].some(v => v !== undefined))) return 'a kube-config check with absent checks nothing else';
  if (c.type !== undefined && (c.resource !== 'Secret' || !SECRET_TYPES.includes(c.type))) return `a kube-config check's type is a Secret's: ${SECRET_TYPES.join(', ')}`;
  if (c.keys !== undefined && (!Array.isArray(c.keys) || !c.keys.length || !c.keys.every(KEY))) return 'a kube-config check\'s keys are config keys';
  if (c.values !== undefined && (!Array.isArray(c.values) || !c.values.length || c.values.some(v => !KEY(v.key) || typeof v.equals !== 'string'))) return 'a kube-config check\'s values are { key, equals }';
  if (c.immutable !== undefined && typeof c.immutable !== 'boolean') return 'a kube-config check\'s immutable is true or false';
  if (c.notPlainIn !== undefined && (c.resource !== 'Secret' || !LINE(c.notPlainIn.file) || !c.notPlainIn.file.startsWith('/') || (c.notPlainIn.keys !== undefined && (!Array.isArray(c.notPlainIn.keys) || !c.notPlainIn.keys.every(KEY)))))
    return 'a kube-config check\'s notPlainIn is a Secret\'s { file: an absolute path, keys? }';
  return null;
}

export function describeConfigCheck(c: ConfigCheck): string {
  const where = `${c.namespace ?? 'default'} 命名空間`;
  if (c.absent) return `${where}應該沒有名為 ${c.name} 的 ${c.resource}`;
  const more = [c.type ? `類型 ${c.type}` : '', c.keys ? `有 ${c.keys.join('、')}` : '', ...(c.values ?? []).map(v => `${v.key} 的值是「${v.equals}」`),
    c.immutable !== undefined ? (c.immutable ? '不可變更（immutable）' : '可以變更') : '', c.notPlainIn ? `${c.notPlainIn.file} 裡沒有它的明文值` : ''].filter(Boolean);
  return `${where}應該有名為 ${c.name} 的 ${c.resource}${more.length ? `（${more.join('、')}）` : ''}`;
}

export function configCheckFailure(c: ConfigCheck, end0: FsState): string | null {
  const end = settleKube(end0), k = end.kube;
  if (!k) return '這台機器沒有 Kubernetes 叢集';
  const o = find(k, c.resource, c.namespace ?? 'default', c.name), secret = c.resource === 'Secret';
  if (c.absent) return o ? `仍然有名為 ${c.name} 的 ${c.resource}` : null;
  if (!o) return `沒有名為 ${c.name} 的 ${c.resource}`;
  const values = configValues(o);
  if (c.type !== undefined && str(o.type) !== c.type) return `${c.name} 的類型是 ${str(o.type) ?? 'Opaque'}`;
  for (const key of c.keys ?? []) if (!(key in values)) return `${c.name} 沒有 ${key}`;
  for (const v of c.values ?? []) {
    if (!(v.key in values)) return `${c.name} 沒有 ${v.key}`;
    if (values[v.key] !== v.equals) return secret ? `${c.name} 的 ${v.key} 不是題目要的值` : `${c.name} 的 ${v.key} 是「${values[v.key]}」`;
  }
  if (c.immutable !== undefined && (o.immutable === true) !== c.immutable) return c.immutable ? `${c.name} 不是不可變更的（沒有 immutable: true）` : `${c.name} 是不可變更的`;
  if (c.notPlainIn) {
    const text = end.nodes.get(c.notPlainIn.file)?.content;
    if (text === undefined) return `沒有 ${c.notPlainIn.file}`;
    const leaked = (c.notPlainIn.keys ?? Object.keys(values)).find(key => (values[key] ?? '') !== '' && text.includes(values[key]));
    if (leaked) return `${c.notPlainIn.file} 裡有 ${leaked} 的明文值`;
  }
  return null;
}
