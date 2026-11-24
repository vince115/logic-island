import type { Seconds } from './clock';
import { eventLines, mapLines, multi } from './kube-describe';
import { secretText } from './kube-config-spec';
import { arr, goTab, kindOf, nameOf, nsOf, obj, str, uidOf, type J, type JObj, type KubeState } from './kube-model';

/*
 * Engine stage E36 (docs/curriculum/KUB0_E36_KUBE_CONFIG.md §7): kubectl describe configmap and secret, and the pod
 * describer's configuration lines. A ConfigMap shows each key and its value (key:, ----, the value, a blank line), then
 * BinaryData and its Events; a Secret shows its Type and only each key's size in bytes — never the values. In a pod:
 * "Environment Variables from:" (envFrom), env valueFrom as <set to the key …>, configMap and secret Volumes.
 */

const bytes = (text: string) => new TextEncoder().encode(text).length;
export function describeConfig(k: KubeState, o: JObj, now: Seconds): string[] {
  const m = obj(o.metadata), head = [`Name:\t${nameOf(o)}`, `Namespace:\t${nsOf(o) ?? 'default'}`, ...multi('Labels:', mapLines(m.labels, '=')), ...multi('Annotations:', mapLines(m.annotations, ': '))];
  const data = obj(o.data), keys = Object.keys(data).sort();
  if (kindOf(o) === 'Secret') return goTab([...head, '', `Type:\t${str(o.type) ?? 'Opaque'}`, '', 'Data', '====', ...keys.map(key => `${key}:\t${bytes(secretText(data[key]))} bytes`)], 0, 2);
  const lines = [...head, '', 'Data', '===='];
  for (const key of keys) lines.push(`${key}:`, '----', ...String(str(data[key]) ?? '').split('\n'), '');
  lines.push('', 'BinaryData', '====', '', ...eventLines(k, uidOf(o), now));
  return goTab(lines, 0, 2);
}

const optional = (v: J | undefined) => obj(v).optional === true;
/** describe pod: the container's envFrom lines (before Environment). */
export function envFromLines(c: JObj): string[] {
  const list = arr(c.envFrom).map(obj);
  if (!list.length) return [];
  return ['    Environment Variables from:', ...list.map(e => {
    const cm = e.configMapRef !== undefined && e.configMapRef !== null, ref = cm ? e.configMapRef : e.secretRef, from = cm ? 'ConfigMap' : 'Secret', prefix = str(e.prefix);
    return `      ${str(obj(ref).name) ?? ''}\t${from}${prefix ? ` with prefix '${prefix}'` : ''}\tOptional: ${optional(ref)}`;
  })];
}
/** describe pod: an env entry with valueFrom (the value it names, not the value). */
export function envLine(e: JObj): string {
  const from = obj(e.valueFrom), cm = from.configMapKeyRef, s = from.secretKeyRef;
  if (cm !== undefined && cm !== null) return `      ${str(e.name)}:\t<set to the key '${str(obj(cm).key) ?? ''}' of config map '${str(obj(cm).name) ?? ''}'>\tOptional: ${optional(cm)}`;
  if (s !== undefined && s !== null) return `      ${str(e.name)}:\t<set to the key '${str(obj(s).key) ?? ''}' in secret '${str(obj(s).name) ?? ''}'>\tOptional: ${optional(s)}`;
  return `      ${str(e.name)}:\t${str(e.value) ?? ''}`;
}
/** describe pod: a configMap or secret volume (null: another kind of volume). */
export function volumeLines(v: JObj): string[] | null {
  if (v.configMap !== undefined && v.configMap !== null) return [`  ${str(v.name)}:`, '    Type:\tConfigMap (a volume populated by a ConfigMap)', `    Name:\t${str(obj(v.configMap).name) ?? ''}`, `    Optional:\t${optional(v.configMap)}`];
  if (v.secret !== undefined && v.secret !== null) return [`  ${str(v.name)}:`, '    Type:\tSecret (a volume populated by a Secret)', `    SecretName:\t${str(obj(v.secret).secretName) ?? ''}`, `    Optional:\t${optional(v.secret)}`];
  return null;
}
