/*
 * Engine stage E23 (docs/curriculum/DKR0_CONTAINER_CAPABILITY.md §13.2): the YAML subset compose files are written in.
 * No dependency: block mappings and sequences by indentation (spaces only; a sequence may sit at its key's indentation),
 * `- key: value` items, plain, 'single' and "double" quoted scalars, single-line flow collections ([a, b] and {a: b}),
 * comments, literal and folded block scalars (| |- |+ > >- >+), `---` at the top, null (empty, ~, null). Anchors,
 * aliases, merge keys, tags, multi-line plain scalars, complex keys and several documents are refused with a sentence
 * saying so. Errors are yaml.v3's texts (yaml: line N: …) where the subset knows them.
 *
 * E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §2): every node also has the column it starts at (1-based), a mapping where
 * each key is written, and YamlError carries a code, line and column besides yaml.v3's message, so a caller such as the
 * workflow parser can render its own tool's message. Compose keeps the messages exactly.
 */

/** Where a node or key is written (1-based). */
export interface YamlPos { line: number; col: number }
export type Y =
  | { t: 'map'; m: [string, Y][]; line: number; col: number; /** E27: where each key of m is written. */ keys: YamlPos[] }
  | { t: 'seq'; a: Y[]; line: number; col: number }
  | { t: 'str'; v: string; q: boolean; line: number; col: number }
  | { t: 'null'; line: number; col: number };
/** E27: syntax (yaml.v3's message), unsupported (the subset's sentence) or duplicate-key (detail is the key). */
export type YamlErrorCode = 'syntax' | 'unsupported' | 'duplicate-key';
export class YamlError extends Error {
  /** detail: the message without "yaml: line N: " (the key for duplicate-key). */
  constructor(message: string, readonly code: YamlErrorCode = 'syntax', readonly line = 0, readonly column = 0, readonly detail = message) { super(message); }
}
/** yaml.v3's "yaml: line N: text" as a structured error. */
const syntax = (no: number, col: number, text: string) => new YamlError(`yaml: line ${no}: ${text}`, 'syntax', no, col, text);

interface Line { no: number; indent: number; body: string; raw: number }
const UNSUPPORTED = (no: number, what: string, col = 1) => new YamlError(`yaml: line ${no}: 模擬環境的 YAML 子集不支援${what}`, 'unsupported', no, col, `模擬環境的 YAML 子集不支援${what}`);

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

function unescape(text: string, no: number, col: number): string {
  return text.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, e: string) => {
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', '/': '/', ' ': ' ', e: '\x1b', b: '\b', a: '\x07' };
    if (e in map) return map[e];
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
    throw syntax(no, col, 'found unknown escape character while parsing a quoted scalar');
  });
}
/** A scalar written on one line (quoted or plain) starting at column col0; flow collections too. */
function inline(text: string, no: number, col0: number): Y {
  const t = text.trim(), col = col0 + text.length - text.trimStart().length;
  if (t.startsWith('&') || t.startsWith('*')) throw UNSUPPORTED(no, '錨點與別名（&、*）', col);
  if (t.startsWith('!')) throw UNSUPPORTED(no, '標記（!!str 這類）', col);
  if (t.startsWith('[') || t.startsWith('{')) { const r = flow(t, 0, no, col); if (t.slice(r.end).trim()) throw syntax(no, col + r.end, 'did not find expected <document start>'); return r.v; }
  if (t.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"$/.exec(t);
    if (!m) throw syntax(no, col, 'found unexpected end of stream');
    return { t: 'str', v: unescape(m[1], no, col), q: true, line: no, col };
  }
  if (t.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(t);
    if (!m) throw syntax(no, col, 'found unexpected end of stream');
    return { t: 'str', v: m[1].replace(/''/g, "'"), q: true, line: no, col };
  }
  if (/^[|>]/.test(t)) throw syntax(no, col, 'found a block scalar where a value was expected');
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return { t: 'null', line: no, col };
  if (/^[%@`]/.test(t)) throw syntax(no, col, 'found character that cannot start any token');
  return { t: 'str', v: t, q: false, line: no, col };
}
/** A flow collection ([a, "b"], {k: v}) from position i of s, whose first character is at column base; one line only. */
function flow(s: string, i0: number, no: number, base: number): { v: Y; end: number } {
  let i = i0;
  const ws = () => { while (s[i] === ' ') i++; };
  const scalar = (stops: string): Y => {
    ws();
    if (s[i] === '[' || s[i] === '{') { const r = flow(s, i, no, base); i = r.end; return r.v; }
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i], start = i;
      for (i++; i < s.length; i++) { if (s[i] === '\\' && q === '"') { i++; continue; } if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } break; } }
      if (i >= s.length) throw syntax(no, base + start, 'found unexpected end of stream');
      i++;
      return inline(s.slice(start, i), no, base + start);
    }
    const start = i;
    while (i < s.length && !stops.includes(s[i]) && !(s[i] === ':' && (s[i + 1] === ' ' || stops.includes(s[i + 1] ?? '')))) i++;
    return inline(s.slice(start, i), no, base + start);
  };
  const open = i;
  if (s[i] === '[') {
    i++;
    const a: Y[] = [];
    for (;;) {
      ws();
      if (s[i] === ']') { i++; break; }
      if (i >= s.length) throw syntax(no, base + i, "did not find expected ',' or ']'");
      a.push(scalar(',]'));
      ws();
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ']') { i++; break; }
      throw syntax(no, base + i, "did not find expected ',' or ']'");
    }
    return { v: { t: 'seq', a, line: no, col: base + open }, end: i };
  }
  i++;
  const m: [string, Y][] = [], keys: YamlPos[] = [];
  for (;;) {
    ws();
    if (s[i] === '}') { i++; break; }
    if (i >= s.length) throw syntax(no, base + i, "did not find expected ',' or '}'");
    const k = scalar(',}:');
    ws();
    let v: Y = { t: 'null', line: no, col: base + i };
    if (s[i] === ':') { i++; v = scalar(',}'); ws(); }
    m.push([k.t === 'str' ? k.v : 'null', v]);
    keys.push({ line: no, col: k.col });
    if (s[i] === ',') { i++; continue; }
    if (s[i] === '}') { i++; break; }
    throw syntax(no, base + i, "did not find expected ',' or '}'");
  }
  return { v: { t: 'map', m, line: no, col: base + open, keys }, end: i };
}

/** Parses the subset; throws YamlError with yaml.v3's message (or the subset's own sentence). */
export function parseYaml(text: string): Y {
  const raw = text.split('\n').map(l => l.replace(/\r$/, ''));
  const lines: Line[] = [];
  let started = false;
  raw.forEach((r, k) => {
    const no = k + 1;
    if (/^\t/.test(r) || /^ +\t/.test(r)) { if (stripComment(r).trim()) throw syntax(no, r.length - r.replace(/^[ \t]+/, '').length || 1, 'found character that cannot start any token'); return; }
    const body = stripComment(r), indent = body.length - body.trimStart().length;
    if (!body.trim()) return;
    if (body === '---' && !started) { started = true; return; }
    if (body === '---' || body === '...') throw UNSUPPORTED(no, '多個文件（---）');
    started = true;
    lines.push({ no, indent, body: body.trim(), raw: k });
  });
  let p = 0;
  const cur = () => lines[p];
  const at = (l: Line) => l.indent + 1;
  function block(): Y {
    const l = cur();
    return isDash(l.body) ? seq(l.indent) : map(l.indent);
  }
  /** The value after "key:" (rest, starting at column col). */
  function value(rest: string, l: Line, ind: number, col: number): Y {
    p++;
    const next = cur();
    if (rest === '') {
      if (next && next.indent > ind) return block();
      if (next && next.indent === ind && isDash(next.body) && !isDash(l.body)) return seq(ind);
      return { t: 'null', line: l.no, col };
    }
    if (/^[|>][-+]?$/.test(rest)) return blockScalar(rest, l, ind, col);
    if (next && next.indent > ind) {
      if (colonAt(next.body) >= 0) throw syntax(next.no, at(next), 'mapping values are not allowed in this context');
      throw UNSUPPORTED(next.no, '跨行的純量（請寫在同一行，或改用 | 與 >）', at(next));
    }
    return inline(rest, l.no, col);
  }
  function blockScalar(head: string, l: Line, ind: number, col: number): Y {
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
    return { t: 'str', v: chomp === '-' ? folded : `${folded}\n`, q: true, line: l.no, col };
  }
  function map(ind: number): Y {
    const m: [string, Y][] = [], keys: YamlPos[] = [], first = cur().no, seen = new Map<string, number>();
    while (p < lines.length && cur().indent === ind && !isDash(cur().body)) {
      const l = cur(), c = colonAt(l.body);
      if (c < 0) throw syntax(l.no, at(l), "could not find expected ':'");
      const k0 = l.body.slice(0, c).trim();
      if (k0 === '<<') throw UNSUPPORTED(l.no, '合併鍵（<<）', at(l));
      if (k0.startsWith('?')) throw UNSUPPORTED(l.no, '複雜的鍵（?）', at(l));
      const key = inline(k0, l.no, at(l));
      const name = key.t === 'str' ? key.v : 'null';
      if (seen.has(name)) throw new YamlError(`yaml: line ${l.no}: mapping key "${name}" already defined at line ${seen.get(name)}`, 'duplicate-key', l.no, at(l), name);
      seen.set(name, l.no);
      keys.push({ line: l.no, col: at(l) });
      const after = l.body.slice(c + 1);
      m.push([name, value(after.trim(), l, ind, at(l) + c + 1 + after.length - after.trimStart().length)]);
    }
    if (p < lines.length && cur().indent > ind) throw syntax(cur().no, at(cur()), 'did not find expected key');
    return { t: 'map', m, line: first, col: ind + 1, keys };
  }
  function seq(ind: number): Y {
    const a: Y[] = [], first = cur().no;
    while (p < lines.length && cur().indent === ind && isDash(cur().body)) {
      const l = cur(), rest = l.body.slice(1), gap = rest.length - rest.trimStart().length, item = rest.trim(), col = ind + 2 + gap;
      if (item === '') { p++; const next = cur(); a.push(next && next.indent > ind ? block() : { t: 'null', line: l.no, col: ind + 2 }); continue; }
      if (isDash(item)) throw UNSUPPORTED(l.no, '同一行的巢狀序列（- - x）', col);
      if (!/^["'[{]/.test(item) && colonAt(item) >= 0) {
        // "- key: value" starts a mapping whose keys line up with this one.
        lines[p] = { ...l, indent: ind + 1 + gap, body: item };
        a.push(map(ind + 1 + gap));
        continue;
      }
      if (/^[|>][-+]?$/.test(item)) { a.push(blockScalar(item, l, ind, col)); continue; }
      p++;
      const next = cur();
      if (next && next.indent > ind) throw UNSUPPORTED(next.no, '跨行的純量（請寫在同一行，或改用 | 與 >）', at(next));
      a.push(inline(item, l.no, col));
    }
    if (p < lines.length && cur().indent > ind) throw syntax(cur().no, at(cur()), "did not find expected '-' indicator");
    return { t: 'seq', a, line: first, col: ind + 1 };
  }
  if (!lines.length) return { t: 'null', line: 1, col: 1 };
  if (lines[0].indent !== 0) throw syntax(lines[0].no, at(lines[0]), 'did not find expected <document start>');
  const root = block();
  if (p < lines.length) throw syntax(cur().no, at(cur()), 'did not find expected key');
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
