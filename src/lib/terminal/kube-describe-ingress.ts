import type { Seconds } from './clock';
import { eventLines, mapLines, multi } from './kube-describe';
import { formatEndpoints } from './kube-endpoints';
import { portsOf } from './kube-service-spec';
import { addressText, backendText } from './kube-ingress-spec';
import { arr, goTab, kindOf, nameOf, nsOf, obj, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E37 (docs/curriculum/KUB0_E37_INGRESS.md §8): kubectl describe ingress as describeIngressV1 writes it —
 * Address, Ingress Class, Default backend, TLS ("SECRET terminates HOSTS"), the Rules table (each host, "*" for none; each
 * path with its backend and the backend's ready endpoints, or the error of a missing Service), Annotations and the
 * Events (Sync); IngressClass (Controller); and the Gateway API's objects through kubectl's generic describer of custom
 * resources (every field of the object under its "smart label", maps and lists indented two spaces per level).
 */

/** A backend with its endpoints: web:80 (10.244.1.3:8080,…), or the error of a missing Service. */
export function backendLine(k: KubeState, ns: string, b: J | undefined): string {
  const s = obj(obj(b).service), p = obj(s.port), name = str(s.name) ?? '', text = backendText(b);
  const svc = k.objects.find(o => kindOf(o) === 'Service' && nsOf(o) === ns && nameOf(o) === name);
  if (!svc) return `${text} (<error: services "${name}" not found>)`;
  const sp = portsOf(svc).find(x => typeof p.number === 'number' && p.number !== 0 ? x.port === p.number : str(x.name) === str(p.name));
  const ep = k.objects.find(o => kindOf(o) === 'Endpoints' && nsOf(o) === ns && nameOf(o) === name);
  return `${text} (${ep && sp ? formatEndpoints(ep, str(sp.name) ?? '') : '<none>'})`;
}

export function describeIngress(k: KubeState, ing: JObj, now: Seconds): string[] {
  const m = obj(ing.metadata), spec = obj(ing.spec), ns = nsOf(ing) ?? 'default';
  const def = spec.defaultBackend === undefined ? '<default>' : backendLine(k, ns, spec.defaultBackend);
  const lines = [`Name:\t${nameOf(ing)}`, ...multi('Labels:', mapLines(m.labels, '=')), `Namespace:\t${ns}`, `Address:\t${addressText(ing, true)}`, `Ingress Class:\t${str(spec.ingressClassName) ?? '<none>'}`, `Default backend:\t${def}`];
  const tls = arr(spec.tls).map(obj);
  if (tls.length) lines.push('TLS:', ...tls.map(t => str(t.secretName) ? `  ${str(t.secretName)} terminates ${arr(t.hosts).map(String).join(',')}` : `  SNI routes ${arr(t.hosts).map(String).join(',')}`));
  lines.push('Rules:', '  Host\tPath\tBackends', '  ----\t----\t--------');
  const rules = arr(spec.rules).map(obj).filter(r => r.http !== undefined);
  for (const r of rules) {
    lines.push(`  ${str(r.host) || '*'}\t`);
    for (const p of arr(obj(r.http).paths).map(obj)) lines.push(`    \t${str(p.path) ?? ''} \t${backendLine(k, ns, p.backend)}`);
  }
  if (!rules.length) lines.push(`  *\t*\t${def}`);
  lines.push(...multi('Annotations:', mapLines(m.annotations, ': ')), ...eventLines(k, uidOf(ing), now));
  return goTab(lines, 0, 2);
}

/** kubectl's smart label of a field (camelCase words capitalized; API, URL, UID, OSB, GUID upper-case). */
export function smartLabel(field: string): string {
  if (/[^A-Za-z-]/.test(field)) return field;
  const parts = field.match(/[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[A-Z]+|-/g) ?? [field];
  return parts.map(p => ['API', 'URL', 'UID', 'OSB', 'GUID'].includes(p.toUpperCase()) ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)).join(' ');
}
function content(v: J, level: number, out: string[], skip: (path: string) => boolean, path: string): void {
  const pad = '  '.repeat(level);
  for (const key of Object.keys(obj(v)).sort()) {
    const x = obj(v)[key], at = `${path}.${key}`;
    if (skip(at)) continue;
    if (x && typeof x === 'object' && !Array.isArray(x)) { out.push(`${pad}${smartLabel(key)}:`); content(x, level + 1, out, skip, at); continue; }
    if (Array.isArray(x)) {
      out.push(`${pad}${smartLabel(key)}:`);
      for (const item of x) {
        if (item && typeof item === 'object' && !Array.isArray(item)) content(item, level + 1, out, skip, at);
        else out.push(`${pad}  ${item === null ? '<nil>' : String(item)}`);
      }
      continue;
    }
    out.push(`${pad}${smartLabel(key)}:\t${x === null ? '<nil>' : String(x)}`);
  }
}
/** kubectl's generic describer (custom resources and IngressClass): Name, Namespace, Labels, Annotations, every other field, Events. */
export function describeGeneric(k: KubeState, o: JObj, now: Seconds): string[] {
  const m = obj(o.metadata), lines = [`Name:\t${nameOf(o)}`, ...nsOf(o) ? [`Namespace:\t${nsOf(o)}`] : [], ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': '))];
  if (kindOf(o) === 'IngressClass') lines.push(`Controller:\t${str(obj(o.spec).controller) ?? ''}`);
  else content(o, 0, lines, p => ['.metadata.name', '.metadata.namespace', '.metadata.labels', '.metadata.annotations', '.metadata.managedFields'].includes(p), '');
  lines.push(...eventLines(k, uidOf(o), now));
  return goTab(lines, 0, 2);
}
