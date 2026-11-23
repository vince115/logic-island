/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13.2): the YAML subset compose files are written in.
 * No dependency: block mappings and sequences by indentation (spaces only; a sequence may sit at its key's indentation),
 * `- key: value` items, plain, 'single' and "double" quoted scalars, single-line flow collections ([a, b] and {a: b}),
 * comments, literal and folded block scalars (| |- |+ > >- >+), `---` at the top, null (empty, ~, null). Anchors,
 * aliases, merge keys, tags, multi-line plain scalars, complex keys and several documents are refused with a sentence
 * saying so. Errors are yaml.v3's texts (yaml: line N: …) where the subset knows them.
 */

export type Y =
  | { t: 'map'; m: [string, Y][]; line: number }
  | { t: 'seq'; a: Y[]; line: number }
  | { t: 'str'; v: string; q: boolean; line: number }
  | { t: 'null'; line: number };
export class YamlError extends Error {}

interface Line { no: number; indent: number; body: string; raw: number }
const UNSUPPORTED = (no: number, what: string) => new YamlError(`yaml: line ${no}: 模擬環境的 YAML 子集不支援${what}`);

/** Removes a comment (# at the start or after a space, outside quotes) and trailing spaces. */
function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; } else if (ch === '\\' && q === '"') i++; continue; }
    if ((ch === '"' || ch === "'") && (i === 0 || /[\s[{,:-]/.test(s[i - 1]))) { q = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).replace(/\s+$/, '');
  }
  return s.replace(/\s+$/, '');
}
/** Where a "key: value" splits (a colon followed by a space or the end, outside quotes and brackets), or -1. */
function colonAt(s: string): number {
  let q: string | null = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; else if (ch === '\\' && q === '"') i++; continue; }
    if ((ch === '"' || ch === "'") && (i === 0 || /[\s[{,]/.test(s[i - 1]))) { q = ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ':' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ')) return i;
  }
  return -1;
}
const isDash = (body: string) => body === '-' || body.startsWith('- ');

function unescape(text: string, no: number): string {
  return text.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, e: string) => {
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', '/': '/', ' ': ' ', e: '\x1b', b: '\b', a: '\x07' };
    if (e in map) return map[e];
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
    throw new YamlError(`yaml: line ${no}: found unknown escape character while parsing a quoted scalar`);
  });
}
/** A scalar written on one line (quoted or plain); flow collections too. */
function inline(text: string, no: number): Y {
  const t = text.trim();
  if (t.startsWith('&') || t.startsWith('*')) throw UNSUPPORTED(no, '錨點與別名（&、*）');
  if (t.startsWith('!')) throw UNSUPPORTED(no, '標記（!!str 這類）');
  if (t.startsWith('[') || t.startsWith('{')) { const r = flow(t, 0, no); if (t.slice(r.end).trim()) throw new YamlError(`yaml: line ${no}: did not find expected <document start>`); return r.v; }
  if (t.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
    if (!m) throw new YamlError(`yaml: line ${no}: found unexpected end of stream`);
    return { t: 'str', v: unescape(m[1], no), q: true, line: no };
  }
  if (t.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(t);
    if (!m) throw new YamlError(`yaml: line ${no}: found unexpected end of stream`);
    return { t: 'str', v: m[1].replace(/''/g, "'"), q: true, line: no };
  }
  if (/^[|>]/.test(t)) throw new YamlError(`yaml: line ${no}: found a block scalar where a value was expected`);
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return { t: 'null', line: no };
  if (/^[%@`]/.test(t)) throw new YamlError(`yaml: line ${no}: found character that cannot start any token`);
  return { t: 'str', v: t, q: false, line: no };
}
/** A flow collection ([a, "b"], {k: v}) from position i; one line only. */
function flow(s: string, i0: number, no: number): { v: Y; end: number } {
  let i = i0;
  const ws = () => { while (s[i] === ' ') i++; };
  const scalar = (stops: string): Y => {
    ws();
    if (s[i] === '[' || s[i] === '{') { const r = flow(s, i, no); i = r.end; return r.v; }
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i], start = i;
      for (i++; i < s.length; i++) { if (s[i] === '\\' && q === '"') { i++; continue; } if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } break; } }
      if (i >= s.length) throw new YamlError(`yaml: line ${no}: found unexpected end of stream`);
      i++;
      return inline(s.slice(start, i), no);
    }
    const start = i;
    while (i < s.length && !stops.includes(s[i]) && !(s[i] === ':' && (s[i + 1] === ' ' || stops.includes(s[i + 1] ?? '')))) i++;
    return inline(s.slice(start, i), no);
  };
  if (s[i] === '[') {
    i++;
    const a: Y[] = [];
    for (;;) {
      ws();
      if (s[i] === ']') { i++; break; }
      if (i >= s.length) throw new YamlError(`yaml: line ${no}: did not find expected ',' or ']'`);
      a.push(scalar(',]'));
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; break; }
      throw new YamlError(`yaml: line ${no}: did not find expected ',' or ']'`);
    }
    return { v: { t: 'seq', a, line: no }, end: i };
  }
  i++;
  const m: [string, Y][] = [];
  for (;;) {
    ws();
    if (s[i] === '}') { i++; break; }
    if (i >= s.length) throw new YamlError(`yaml: line ${no}: did not find expected ',' or '}'`);
    const k = scalar(',}:');
    ws();
    let v: Y = { t: 'null', line: no };
    if (s[i] === ':') { i++; v = scalar(',}'); ws(); }
    m.push([k.t === 'str' ? k.v : 'null', v]);
    if (s[i] === ',') { i++; continue; }
    if (s[i] === '}') { i++; break; }
    throw new YamlError(`yaml: line ${no}: did not find expected ',' or '}'`);
  }
  return { v: { t: 'map', m, line: no }, end: i };
}

/** Parses the subset; throws YamlError with yaml.v3's message (or the subset's own sentence). */
export function parseYaml(text: string): Y {
  const raw = text.split('\n').map(l => l.replace(/\r$/, ''));
  const lines: Line[] = [];
  let started = false;
  raw.forEach((r, k) => {
    const no = k + 1;
    if (/^\t/.test(r) || /^ +\t/.test(r)) { if (stripComment(r).trim()) throw new YamlError(`yaml: line ${no}: found character that cannot start any token`); return; }
    const body = stripComment(r), indent = body.length - body.trimStart().length;
    if (!body.trim()) return;
    if (body === '---' && !started) { started = true; return; }
    if (body === '---' || body === '...') throw UNSUPPORTED(no, '多個文件（---）');
    started = true;
    lines.push({ no, indent, body: body.trim(), raw: k });
  });
  let p = 0;
  const cur = () => lines[p];
  function block(): Y {
    const l = cur();
    return isDash(l.body) ? seq(l.indent) : map(l.indent);
  }
  function value(rest: string, l: Line, ind: number): Y {
    p++;
    const next = cur();
    if (rest === '') {
      if (next && next.indent > ind) return block();
      if (next && next.indent === ind && isDash(next.body) && !isDash(l.body)) return seq(ind);
      return { t: 'null', line: l.no };
    }
    if (/^[|>][-+]?$/.test(rest)) return blockScalar(rest, l, ind);
    if (next && next.indent > ind) {
      if (colonAt(next.body) >= 0) throw new YamlError(`yaml: line ${next.no}: mapping values are not allowed in this context`);
      throw UNSUPPORTED(next.no, '跨行的純量（請寫在同一行，或改用 | 與 >）');
    }
    return inline(rest, l.no);
  }
  function blockScalar(head: string, l: Line, ind: number): Y {
    const out: string[] = [];
    let k = l.raw + 1, width: number | undefined;
    for (; k < raw.length; k++) {
      const r = raw[k];
      if (!r.trim()) { out.push(''); continue; }
      const w = r.length - r.trimStart().length;
      if (w <= ind) break;
      width ??= w;
      out.push(r.slice(Math.min(width, w)));
    }
    while (p < lines.length && lines[p].raw < k) p++;
    while (out.length && out.at(-1) === '') out.pop();
    const folded = head[0] === '>' ? out.reduce((acc, x, i) => i === 0 ? x : x === '' ? `${acc}\n` : acc.endsWith('\n') ? acc + x : `${acc} ${x}`, '') : out.join('\n');
    const chomp = head[1];
    return { t: 'str', v: chomp === '-' ? folded : `${folded}\n`, q: true, line: l.no };
  }
  function map(ind: number): Y {
    const m: [string, Y][] = [], first = cur().no, seen = new Map<string, number>();
    while (p < lines.length && cur().indent === ind && !isDash(cur().body)) {
      const l = cur(), at = colonAt(l.body);
      if (at < 0) throw new YamlError(`yaml: line ${l.no}: could not find expected ':'`);
      const k0 = l.body.slice(0, at).trim();
      if (k0 === '<<') throw UNSUPPORTED(l.no, '合併鍵（<<）');
      if (k0.startsWith('?')) throw UNSUPPORTED(l.no, '複雜的鍵（?）');
      const key = inline(k0, l.no);
      const name = key.t === 'str' ? key.v : 'null';
      if (seen.has(name)) throw new YamlError(`yaml: line ${l.no}: mapping key "${name}" already defined at line ${seen.get(name)}`);
      seen.set(name, l.no);
      m.push([name, value(l.body.slice(at + 1).trim(), l, ind)]);
    }
    if (p < lines.length && cur().indent > ind) throw new YamlError(`yaml: line ${cur().no}: did not find expected key`);
    return { t: 'map', m, line: first };
  }
  function seq(ind: number): Y {
    const a: Y[] = [], first = cur().no;
    while (p < lines.length && cur().indent === ind && isDash(cur().body)) {
      const l = cur(), rest = l.body.slice(1), gap = rest.length - rest.trimStart().length, item = rest.trim();
      if (item === '') { p++; const next = cur(); a.push(next && next.indent > ind ? block() : { t: 'null', line: l.no }); continue; }
      if (isDash(item)) throw UNSUPPORTED(l.no, '同一行的巢狀序列（- - x）');
      if (!/^["'[{]/.test(item) && colonAt(item) >= 0) {
        // "- key: value" starts a mapping whose keys line up with this one.
        lines[p] = { ...l, indent: ind + 1 + gap, body: item };
        a.push(map(ind + 1 + gap));
        continue;
      }
      if (/^[|>][-+]?$/.test(item)) { a.push(blockScalar(item, l, ind)); continue; }
      p++;
      const next = cur();
      if (next && next.indent > ind) throw UNSUPPORTED(next.no, '跨行的純量（請寫在同一行，或改用 | 與 >）');
      a.push(inline(item, l.no));
    }
    if (p < lines.length && cur().indent > ind) throw new YamlError(`yaml: line ${cur().no}: did not find expected '-' indicator`);
    return { t: 'seq', a, line: first };
  }
  if (!lines.length) return { t: 'null', line: 1 };
  if (lines[0].indent !== 0) throw new YamlError(`yaml: line ${lines[0].no}: did not find expected <document start>`);
  const root = block();
  if (p < lines.length) throw new YamlError(`yaml: line ${cur().no}: did not find expected key`);
  return root;
}

// ------------------------------------------------------------------------------------------------- output

/** An ordered mapping for the emitter (keys keep their order, numbers too). */
export class Pairs { constructor(readonly p: [string, Out][]) {} }
export type Out = string | number | boolean | null | Out[] | Pairs;

const RESERVED = /^(?:true|false|yes|no|on|off|y|n|null|~|)$/i;
const NUMBER = /^[-+]?(?:\d[\d_]*(?:\.\d*)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i;
/** How yaml.v3 writes a string: plain when it reads back as the same string, otherwise double-quoted. */
export function yamlString(s: string): string {
  const plain = !RESERVED.test(s) && !NUMBER.test(s) && !/^[?:,[\]{}#&*!|>'"%@`\s]/.test(s) && !/^-( |$)/.test(s) && !/\s$/.test(s) && !/: |:$| #|[\n\t\r\x00-\x08]/.test(s);
  return plain ? s : `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}
const scalarText = (v: Exclude<Out, Out[] | Pairs>) => v === null ? 'null' : typeof v === 'string' ? yamlString(v) : String(v);
/** YAML text with 2-space indentation and sequences indented under their key (compose's encoder). */
export function emitYaml(root: Pairs): string[] {
  const out: string[] = [];
  const emitMap = (m: Pairs, ind: number) => {
    for (const [k, v] of m.p) {
      const key = `${' '.repeat(ind)}${yamlString(k)}:`;
      if (v instanceof Pairs) { if (!v.p.length) out.push(`${key} {}`); else { out.push(key); emitMap(v, ind + 2); } }
      else if (Array.isArray(v)) { if (!v.length) out.push(`${key} []`); else { out.push(key); emitSeq(v, ind + 2); } }
      else out.push(`${key} ${scalarText(v)}`);
    }
  };
  const emitSeq = (a: Out[], ind: number) => {
    for (const v of a) {
      if (v instanceof Pairs && v.p.length) {
        const at = out.length;
        emitMap(v, ind + 2);
        out[at] = `${' '.repeat(ind)}- ${out[at].slice(ind + 2)}`;
      } else if (v instanceof Pairs) out.push(`${' '.repeat(ind)}- {}`);
      else if (Array.isArray(v)) { out.push(`${' '.repeat(ind)}-`); emitSeq(v, ind + 2); }
      else out.push(`${' '.repeat(ind)}- ${scalarText(v)}`);
    }
  };
  emitMap(root, 0);
  return out;
}
