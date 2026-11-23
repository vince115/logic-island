import { labelsOf, obj, str, type JObj } from './kube-model';

/*
 * Engine stage E32 (docs/curriculum/KUB0_E32_CLUSTER.md §10): label selectors (-l, --selector) — equality (a=b, a==b,
 * a!=b), set-based (a in (x,y), a notin (x), a, !a), comma-separated requirements that must all hold — and the field
 * selectors kubectl get pods takes (metadata.name, metadata.namespace, spec.nodeName, spec.restartPolicy, status.phase).
 */

export type Req = { key: string; op: '=' | '!=' | 'in' | 'notin' | 'exists' | '!'; values: string[] };
const KEY = /^([a-z0-9A-Z]([-a-z0-9A-Z_.]*[a-z0-9A-Z])?\/)?[a-zA-Z0-9]([-a-zA-Z0-9_.]*[a-zA-Z0-9])?$/;
const VALUE = /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/;

/** The requirements of a selector, or the error kubectl prints. */
export function parseSelector(text: string): Req[] | { error: string } {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of text) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  const reqs: Req[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) return { error: `unable to parse requirement: found '', expected: identifier` };
    let m: RegExpExecArray | null;
    if ((m = /^(\S+?)\s*(==|!=|=)\s*(\S*)$/.exec(p))) reqs.push({ key: m[1], op: m[2] === '!=' ? '!=' : '=', values: [m[3]] });
    else if ((m = /^(\S+)\s+(in|notin)\s*\(([^)]*)\)$/.exec(p))) reqs.push({ key: m[1], op: m[2] as 'in' | 'notin', values: m[3].split(',').map(v => v.trim()).filter(Boolean) });
    else if ((m = /^!\s*(\S+)$/.exec(p))) reqs.push({ key: m[1], op: '!', values: [] });
    else if (KEY.test(p)) reqs.push({ key: p, op: 'exists', values: [] });
    else return { error: `unable to parse requirement: ${p}` };
    const r = reqs[reqs.length - 1];
    if (!KEY.test(r.key)) return { error: `unable to parse requirement: key: Invalid value: "${r.key}": name part must consist of alphanumeric characters, '-', '_' or '.', and must start and end with an alphanumeric character (e.g. 'MyName',  or 'my.name',  or '123-abc', regex used for validation is '([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]')` };
    const bad = r.values.find(v => !VALUE.test(v) || v.length > 63);
    if (bad !== undefined) return { error: `unable to parse requirement: values[0][${r.key}]: Invalid value: "${bad}": a valid label must be an empty string or consist of alphanumeric characters, '-', '_' or '.', and must start and end with an alphanumeric character (e.g. 'MyValue',  or 'my_value',  or '12345', regex used for validation is '(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?')` };
  }
  return reqs;
}
export function matches(reqs: readonly Req[], labels: Readonly<Record<string, string>>): boolean {
  return reqs.every(r => {
    const has = Object.prototype.hasOwnProperty.call(labels, r.key), v = labels[r.key];
    switch (r.op) {
      case '=': return has && v === r.values[0];
      case '!=': return !has || v !== r.values[0];
      case 'in': return has && r.values.includes(v);
      case 'notin': return !has || !r.values.includes(v);
      case 'exists': return has;
      case '!': return !has;
    }
  });
}
export const selects = (reqs: readonly Req[], o: JObj) => matches(reqs, labelsOf(o));
/** A label map (matchLabels, a Service's selector) as requirements. */
export const fromMap = (m: Readonly<Record<string, string>>): Req[] => Object.entries(m).map(([key, v]) => ({ key, op: '=' as const, values: [v] }));

const FIELDS: Record<string, (o: JObj) => string> = {
  'metadata.name': o => str(obj(o.metadata).name) ?? '', 'metadata.namespace': o => str(obj(o.metadata).namespace) ?? '',
  'spec.nodeName': o => str(obj(o.spec).nodeName) ?? '', 'spec.restartPolicy': o => str(obj(o.spec).restartPolicy) ?? '', 'status.phase': o => str(obj(o.status).phase) ?? '',
};
/** --field-selector: field=value, field==value, field!=value, comma-separated. */
export function fieldSelector(text: string, kind: string): ((o: JObj) => boolean) | { error: string } {
  const tests: ((o: JObj) => boolean)[] = [];
  for (const part of text.split(',')) {
    const m = /^([a-zA-Z.]+)(==|!=|=)(.*)$/.exec(part.trim());
    if (!m) return { error: `error: invalid selector: '${text}'; can't understand '${part}'` };
    const get = FIELDS[m[1]];
    if (!get || (kind !== 'Pod' && !m[1].startsWith('metadata.'))) return { error: `Error from server (BadRequest): Unable to find "/v1, Resource=${kind.toLowerCase()}s" that match label selector "", field selector "${text}": "${m[1]}" is not a known field selector: only "metadata.name", "metadata.namespace"` };
    tests.push(o => (get(o) === m[3]) === (m[2] !== '!='));
  }
  return o => tests.every(t => t(o));
}
