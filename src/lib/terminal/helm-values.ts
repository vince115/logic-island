import { parseYaml, YamlError } from './yaml';
import { toJson } from './kube-manifest';
import { fromJ, GoInt, isMap, type V, type VMap } from './helm-value';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §3): values. A values file is YAML read as sigs.k8s.io/yaml reads
 * it (numbers float64). The user's values are the -f files merged in order (maps deeply, the later file winning), then
 * --set and --set-string (strvals: a.b=c, a[0]=x, {a,b} lists, \, escapes; --set types true/false/null/integers, other
 * text stays a string); the computed values are the chart's values.yaml coalesced with them (the user wins; a user null
 * deletes the default).
 */

/** A values file (null: empty is {}), or the error with the file's name. */
export function parseValues(text: string, what: string): VMap | { error: string } {
  try {
    const y = parseYaml(text, { flowNext: true }), j = toJson(y);
    if (j === null) return {};
    if (typeof j !== 'object' || Array.isArray(j)) return { error: `${what}: error unmarshaling JSON: json: cannot unmarshal ${Array.isArray(j) ? 'array' : typeof j === 'string' ? 'string' : 'number'} into Go value of type map[string]interface {}` };
    return fromJ(j) as VMap;
  } catch (e) {
    if (e instanceof YamlError) return { error: `${what}: error converting YAML to JSON: ${e.message}` };
    throw e;
  }
}

/** Helm's mergeMaps: b over a, maps merged key by key. */
export function mergeMaps(a: VMap, b: VMap): VMap {
  const out: VMap = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const old = out[k];
    out[k] = isMap(v) && isMap(old) ? mergeMaps(old, v) : v;
  }
  return out;
}
/** chartutil.CoalesceTables(user, defaults): the user's values win, a user null removes the default, tables merge. */
export function coalesce(defaults: VMap, user: VMap): VMap {
  const out: VMap = { ...user };
  for (const [k, dv] of Object.entries(defaults)) {
    if (Object.hasOwn(user, k)) {
      const uv = user[k];
      if (uv === null) delete out[k];
      else if (isMap(uv) && isMap(dv)) out[k] = coalesce(dv, uv);
    } else out[k] = dv;
  }
  return out;
}

/** strvals' typedVal (--set): true, false, null, 0 and integers not starting with 0; everything else a string. */
function typed(s: string, asString: boolean): V {
  if (asString) return s;
  const l = s.toLowerCase();
  if (l === 'true') return true;
  if (l === 'false') return false;
  if (l === 'null') return null;
  if (s === '0') return new GoInt(0, 'int64');
  if (s && s[0] !== '0' && /^[+-]?\d+$/.test(s) && Math.abs(Number(s)) <= Number.MAX_SAFE_INTEGER) return new GoInt(Number(s), 'int64');
  return s;
}

/** strvals.ParseInto: one --set argument into the map (errors as strvals words them). */
export function parseSet(text: string, into: VMap, asString = false): VMap | { error: string } {
  const out = structuredCopy(into);
  let i = 0;
  const readUntil = (stops: string): { s: string; stop: string } => {
    let s = '';
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '\\' && i + 1 < text.length) { s += text[++i]; continue; }
      if (stops.includes(c)) { i++; return { s, stop: c }; }
      s += c;
    }
    return { s, stop: '' };
  };
  const value = (): V => {
    if (text[i] !== '{') return typed(readUntil(',').s, asString);
    i++;
    const items: V[] = [];
    for (;;) {
      const r = readUntil(',}');
      if (!(r.s === '' && r.stop === '}' && !items.length)) items.push(typed(r.s, asString));
      if (r.stop !== ',') break;
    }
    if (text[i] === ',') i++;
    return items;
  };
  const setIn = (m: VMap): string | null => {
    const r = readUntil('=.[,');
    if (r.stop === '' || r.stop === ',') return `key "${r.s}" has no value${r.stop === ',' ? ' (cannot end with ,)' : ''}`;
    if (r.stop === '=') { m[r.s] = value(); return null; }
    if (r.stop === '.') { const next = isMap(m[r.s]) ? m[r.s] as VMap : {}; m[r.s] = next; return setIn(next); }
    return setList(m, r.s);
  };
  const setList = (m: VMap, key: string): string | null => {
    const r = readUntil(']');
    if (!/^\d+$/.test(r.s)) return `failed to parse index: strconv.Atoi: parsing ${JSON.stringify(r.s)}: invalid syntax`;
    const at = Number(r.s);
    if (at > 65536) return `index of ${at} is greater than maximum supported index value of 65536`;
    const list = Array.isArray(m[key]) ? [...m[key] as V[]] : [];
    while (list.length <= at) list.push(null);
    m[key] = list;
    const c = text[i++];
    if (c === '=') { list[at] = value(); return null; }
    if (c === '.') { const next = isMap(list[at]) ? list[at] as VMap : {}; list[at] = next; return setIn(next); }
    return `key "${key}[${at}]" has no value`;
  };
  while (i < text.length) { const e = setIn(out); if (e) return { error: e }; }
  return out;
}
/** A copy of a values map (GoInts kept). */
export function structuredCopy(m: VMap): VMap {
  const c = (v: V): V => Array.isArray(v) ? v.map(c) : isMap(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, c(x)])) : v;
  return c(m) as VMap;
}
/** A dotted path's value in values (a.b, a[0].b). */
export function valueAt(m: VMap, path: string): V | undefined {
  let cur: V | undefined = m;
  for (const part of path.match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (part.startsWith('[')) { cur = Array.isArray(cur) ? cur[Number(part.slice(1, -1))] : undefined; continue; }
    cur = isMap(cur ?? null) ? (cur as VMap)[part] : undefined;
  }
  return cur;
}
