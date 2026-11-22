/*
 * Engine stage E2 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §10): the text commands of the streams profile — cat,
 * less, head, tail, grep, sort, uniq, wc, cut and tr — as pure functions over text. The shell gives each command a TextIo:
 * where to write (stdout as raw text, stderr as lines), its standard input (null when it is the keyboard, which the
 * simulation does not have) and how to read a file operand ('-' is standard input). Messages follow GNU coreutils and
 * GNU grep; the documented simplifications are: the C.UTF-8 locale (sort compares code points), characters rather than
 * bytes for cut -c and tr, and a subset of regular expressions for grep (see compilePattern).
 */

export type ReadError = 'ENOENT' | 'ENOTDIR' | 'EACCES' | 'ELOOP' | 'EISDIR' | 'NOINPUT';
export type ReadResult = { text: string; regular: boolean } | { error: ReadError };
/** grep -r: what a path is (links are followed only when asked). */
export type TreeEntry = { kind: 'file'; text: string } | { kind: 'dir'; names: string[] | null } | { kind: 'link' } | { error: ReadError };

export interface TextIo {
  out(data: string): void;
  err(line: string): void;
  /** An error that GNU follows with "Try 'cmd --help' for more information." */
  usage(line: string): void;
  /** Reads an operand; '-' is standard input. */
  read(name: string): ReadResult;
  /** grep -r: a path's entry, following a final link only when `follow`. */
  entry(name: string, follow: boolean): TreeEntry;
  /** Whether standard input is a regular file (< file), for wc's column width. */
  stdinRegular: boolean;
}

export const ERROR_TEXT: Record<ReadError, string> = {
  ENOENT: 'No such file or directory', ENOTDIR: 'Not a directory', EACCES: 'Permission denied', ELOOP: 'Too many levels of symbolic links',
  EISDIR: 'Is a directory', NOINPUT: '模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入',
};
/** The message for a command that needs input but has only the keyboard. */
export const noInput = (cmd: string) => `${cmd}: ${ERROR_TEXT.NOINPUT}`;

export type Parsed = { flags: Map<string, string[]>; operands: string[] };
export type OptionError = { error: string };

/**
 * GNU getopt_long with permutation: options may come anywhere before `--`; `-abc` combines flags; a flag followed by
 * ':' in `spec` takes a value (attached, -n5 / -k2,2n, or the next word); a long option maps to a short one
 * (--lines=5 or --lines 5 for one that takes a value). A lone - is an operand.
 */
export function getopt(args: readonly string[], spec: string, longs: Readonly<Record<string, string>> = {}): Parsed | OptionError {
  const flags = new Map<string, string[]>(), operands: string[] = [];
  const add = (f: string, v = '') => flags.set(f, [...flags.get(f) ?? [], v]);
  const takes = (f: string) => spec[spec.indexOf(f) + 1] === ':';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { operands.push(...args.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const [name, value] = arg.slice(2).split(/=(.*)/su, 2);
      const short = longs[name];
      if (short === undefined) return { error: `unrecognized option '${arg}'` };
      if (!takes(short)) { if (value !== undefined) return { error: `option '--${name}' doesn't allow an argument` }; add(short); continue; }
      if (value !== undefined) { add(short, value); continue; }
      if (i + 1 >= args.length) return { error: `option '--${name}' requires an argument` };
      add(short, args[++i]);
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const f = arg[j];
        if (f === ':' || !spec.includes(f)) return { error: `invalid option -- '${f}'` };
        if (!takes(f)) { add(f); continue; }
        if (j + 1 < arg.length) { add(f, arg.slice(j + 1)); break; }
        if (i + 1 >= args.length) return { error: `option requires an argument -- '${f}'` };
        add(f, args[++i]);
        break;
      }
      continue;
    }
    operands.push(arg);
  }
  return { flags, operands };
}

/** The lines of a text with their newlines ('' has none; a last line without a newline is still a line). */
export const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
const bare = (line: string) => line.endsWith('\n') ? line.slice(0, -1) : line;
const bytesOf = (text: string) => new TextEncoder().encode(text);
const fromBytes = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
/** Compares by code point (the C.UTF-8 order). */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

/** Reads each operand (none: standard input), printing the error in `format` for the ones that fail. */
function inputs(io: TextIo, cmd: string, operands: readonly string[], format = (name: string, e: ReadError) => `${cmd}: ${name}: ${ERROR_TEXT[e]}`) {
  const result: { name: string; text: string }[] = [];
  for (const name of operands.length ? operands : ['-']) {
    const r = io.read(name);
    if ('error' in r) io.err(r.error === 'NOINPUT' ? noInput(cmd) : format(name, r.error));
    else result.push({ name, text: r.text });
  }
  return result;
}

/** cat [-n] [file…]: the files (or standard input) as they are; -n numbers every line like GNU (%6d and a tab). */
export function cat(io: TextIo, o: Parsed) {
  let n = 0;
  for (const name of o.operands.length ? o.operands : ['-']) {
    const r = io.read(name);
    if ('error' in r) { io.err(r.error === 'NOINPUT' ? noInput('cat') : `cat: ${name}: ${ERROR_TEXT[r.error]}`); continue; }
    io.out(o.flags.has('n') ? splitLines(r.text).map(l => `${String(++n).padStart(6)}\t${l}`).join('') : r.text);
  }
}

/** less, non-interactively: the files one after another, like cat (there is no screen to page). */
export function less(io: TextIo, o: Parsed) {
  if (!o.operands.length) {
    const r = io.read('-');
    if ('error' in r) io.err('Missing filename ("less --help" for help)');
    else io.out(r.text);
    return;
  }
  for (const name of o.operands) {
    const r = io.read(name);
    if ('error' in r) io.err(r.error === 'EISDIR' ? `${name} is a directory` : `${name}: ${ERROR_TEXT[r.error]}`);
    else io.out(r.text);
  }
}

/** -N, the obsolete form of -n N, as the first argument of head and tail (only there, as in GNU). */
export const countShorthand = (args: readonly string[]) => args.map((a, i) => !i && /^-\d+$/.test(a) ? `-n${a.slice(1)}` : a);

/** head and tail: -n N (tail: +N from line N; head: -N all but the last N), -c N for bytes; headers for several files. */
export function headTail(io: TextIo, cmd: 'head' | 'tail', o: Parsed) {
  if (o.flags.has('f')) { io.err(`${cmd}: 模擬環境不支援 -f：檔案不會繼續增加內容`); return; }
  const bytes = o.flags.has('c'), raw = (bytes ? o.flags.get('c') : o.flags.get('n'))?.at(-1) ?? '10';
  const m = /^([+-]?)(\d+)$/.exec(raw);
  if (!m) { io.err(`${cmd}: invalid number of ${bytes ? 'bytes' : 'lines'}: '${raw}'`); return; }
  const count = Number(m[2]), from = cmd === 'tail' && m[1] === '+', allBut = cmd === 'head' && m[1] === '-';
  const pick = <T>(items: T[]): T[] => cmd === 'head'
    ? allBut ? items.slice(0, Math.max(0, items.length - count)) : items.slice(0, count)
    : from ? items.slice(Math.max(0, count - 1)) : count ? items.slice(-count) : [];
  const names = o.operands.length ? o.operands : ['-'];
  const headers = names.length > 1 || o.flags.has('v');
  let first = true;
  for (const name of names) {
    const r = io.read(name);
    if ('error' in r) {
      io.err(r.error === 'NOINPUT' ? noInput(cmd) : r.error === 'EISDIR' ? `${cmd}: error reading '${name}': Is a directory` : `${cmd}: cannot open '${name}' for reading: ${ERROR_TEXT[r.error]}`);
      continue;
    }
    if (headers) { io.out(`${first ? '' : '\n'}==> ${name === '-' ? 'standard input' : name} <==\n`); first = false; }
    io.out(bytes ? fromBytes(Uint8Array.from(pick(Array.from(bytesOf(r.text))))) : pick(splitLines(r.text)).join(''));
  }
}

const POSIX_CLASS: Record<string, string> = {
  alpha: '\\p{L}', digit: '0-9', alnum: '\\p{L}\\p{N}', upper: '\\p{Lu}', lower: '\\p{Ll}', space: '\\s', blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f',
};
/** Escapes a character outside a bracket expression (the u flag allows only syntax characters to be escaped). */
const escapeRe = (ch: string) => /[\\^$.*+?()[\]{}|/]/u.test(ch) ? `\\${ch}` : ch;
/** Escapes a character inside a bracket expression. */
const escapeIn = (ch: string) => /[\\\]\[^-]/u.test(ch) ? `\\${ch}` : ch;

/**
 * grep's patterns as a JavaScript RegExp source. Supported: literal text, `.`, `*`, `^` and `$` (anchors where POSIX
 * makes them anchors), bracket expressions ([abc], [a-z], [^…], ] first, the POSIX classes [:alpha:] [:digit:] [:alnum:]
 * [:upper:] [:lower:] [:space:] [:blank:] [:punct:] [:xdigit:]), `\` before a special character, \w \W \s \S; with -E
 * (and GNU's \+ \? \| \( \) \{ \} in basic patterns) also `+ ? | ( ) {n,m}`. Not supported: back-references (\1) and
 * \< \>. Errors use GNU's words.
 */
export function compilePattern(pattern: string, extended: boolean): { source: string } | { error: string } {
  const cs = Array.from(pattern);
  let out = '', i = 0, depth = 0, canRepeat = false, lastQuant = false;
  const atom = (src: string) => { out += src; canRepeat = true; lastQuant = false; };
  const quant = (src: string) => {
    if (lastQuant) return; // a** is a*
    if (!canRepeat) { atom(escapeRe(src[0]) + src.slice(1).split('').map(escapeRe).join('')); return; }
    out += src; lastQuant = true;
  };
  const anchorStart = () => out === '' || /(\(\?:|\|)$/u.test(out);
  while (i < cs.length) {
    let c = cs[i], op = false;
    if (c === '\\') {
      const n = cs[i + 1];
      if (n === undefined) return { error: 'Trailing backslash' };
      i += 2;
      if (!extended && '(){}|+?'.includes(n)) { c = n; op = true; }
      else if (/[1-9]/u.test(n)) return { error: '模擬環境不支援反向參照（\\1）' };
      else if (n === 'w') { atom('[\\p{L}\\p{N}_]'); continue; }
      else if (n === 'W') { atom('[^\\p{L}\\p{N}_]'); continue; }
      else if (n === 's') { atom('\\s'); continue; }
      else if (n === 'S') { atom('\\S'); continue; }
      else if (n === '<' || n === '>' || n === 'b' || n === 'B') return { error: `模擬環境不支援 \\${n}` };
      else { atom(escapeRe(n)); continue; }
    } else {
      i++;
      op = extended && '(){}|+?'.includes(c);
    }
    if (op) {
      if (c === '(') { out += '(?:'; depth++; canRepeat = false; lastQuant = false; continue; }
      if (c === ')') {
        if (!depth) { if (extended) { atom('\\)'); continue; } return { error: 'Unmatched ) or \\)' }; }
        out += ')'; depth--; canRepeat = true; lastQuant = false; continue;
      }
      if (c === '|') { out += '|'; canRepeat = false; lastQuant = false; continue; }
      if (c === '+' || c === '?') { quant(c); continue; }
      if (c === '{') {
        const rest = cs.slice(i).join(''), m = extended ? /^(\d+)(,(\d*))?\}/u.exec(rest) : /^(\d+)(,(\d*))?\\\}/u.exec(rest);
        if (!m) { if (extended) { atom('\\{'); continue; } return { error: 'Unmatched \\{' }; }
        if (m[3] && Number(m[3]) < Number(m[1])) return { error: 'Invalid content of \\{\\}' };
        i += Array.from(m[0]).length;
        quant(`{${m[1]}${m[2] ?? ''}}`);
        continue;
      }
      if (c === '}') { atom('\\}'); continue; }
    }
    if (c === '.') { atom('.'); continue; }
    if (c === '*') { quant('*'); continue; }
    if (c === '^') {
      if (extended || anchorStart()) { out += '^'; canRepeat = false; lastQuant = false; } else atom('\\^');
      continue;
    }
    if (c === '$') {
      const rest = cs.slice(i).join('');
      if (extended || i === cs.length || rest.startsWith('\\)') || rest.startsWith('\\|')) { out += '$'; canRepeat = false; lastQuant = false; } else atom('\\$');
      continue;
    }
    if (c === '[') {
      let j = i, negate = false, body = '';
      if (cs[j] === '^') { negate = true; j++; }
      let first = true, closed = false;
      while (j < cs.length) {
        const ch = cs[j];
        if (ch === ']' && !first) { closed = true; j++; break; }
        first = false;
        if (ch === '[' && cs[j + 1] === ':') {
          const end = cs.slice(j + 2).join('').indexOf(':]');
          if (end < 0) return { error: 'Unmatched [, [^, [:, [., or [=' };
          const name = cs.slice(j + 2).join('').slice(0, end);
          if (!(name in POSIX_CLASS)) return { error: 'Invalid character class name' };
          body += POSIX_CLASS[name];
          j += 2 + Array.from(name).length + 2;
          continue;
        }
        if (cs[j + 1] === '-' && cs[j + 2] !== undefined && cs[j + 2] !== ']') {
          if (ch.codePointAt(0)! > cs[j + 2].codePointAt(0)!) return { error: 'Invalid range end' };
          body += `${escapeIn(ch)}-${escapeIn(cs[j + 2])}`;
          j += 3;
          continue;
        }
        body += escapeIn(ch);
        j++;
      }
      if (!closed) return { error: 'Unmatched [, [^, [:, [., or [=' };
      i = j;
      atom(negate ? `[^${body}]` : body ? `[${body}]` : '(?!)');
      continue;
    }
    atom(escapeRe(c));
  }
  if (depth) return { error: 'Unmatched ( or \\(' };
  return { source: out };
}

const WORD = '[\\p{L}\\p{N}_]';

/** grep [-i -v -n -c -l -w -x -r -E -F -H -h] [-e PATTERN] PATTERN [file…]; returns whether a line was selected (E4: the exit status). */
export function grep(io: TextIo, o: Parsed): boolean {
  const operands = [...o.operands];
  const patterns = o.flags.get('e') ?? (operands.length ? [operands.shift()!] : null);
  if (!patterns) { io.usage('Usage: grep [OPTION]... PATTERNS [FILE]...'); return false; }
  const sources: string[] = [];
  for (const p of patterns) {
    if (o.flags.has('F')) { sources.push(Array.from(p).map(escapeRe).join('')); continue; }
    const c = compilePattern(p, o.flags.has('E'));
    if ('error' in c) { io.err(`grep: ${c.error}`); return false; }
    sources.push(c.source);
  }
  let source = sources.map(s => `(?:${s})`).join('|');
  if (o.flags.has('x')) source = `^(?:${source})$`;
  // -w: the match is neither preceded nor followed by a word character (the preceding one is consumed: only whether a
  // line matches is used, and lookbehind is missing from older Safari).
  else if (o.flags.has('w')) source = `(?:^|[^${WORD.slice(1, -1)}])(?:${source})(?!${WORD})`;
  let re: RegExp;
  try { re = new RegExp(source, o.flags.has('i') ? 'iu' : 'u'); } catch { io.err('grep: 無效的正規表示式'); return false; }
  const recursive = o.flags.has('r') || o.flags.has('R'), invert = o.flags.has('v');
  const names = operands.length ? operands : [recursive ? '.' : '-'];
  const files: { name: string; text: string }[] = [];
  let viaFolder = false;
  const visit = (name: string, top: boolean) => {
    if (name === '-') {
      const r = io.read('-');
      if ('error' in r) io.err(noInput('grep'));
      else files.push({ name: '(standard input)', text: r.text });
      return;
    }
    const e = io.entry(name, top || o.flags.has('R'));
    if ('error' in e) { io.err(`grep: ${name}: ${ERROR_TEXT[e.error]}`); return; }
    if (e.kind === 'link') return;
    if (e.kind === 'file') { files.push({ name, text: e.text }); return; }
    if (!recursive) { io.err(`grep: ${name}: Is a directory`); return; }
    if (!e.names) { io.err(`grep: ${name}: Permission denied`); return; }
    viaFolder = true;
    for (const child of e.names) visit(top && !operands.length && name === '.' ? child : name.endsWith('/') ? name + child : `${name}/${child}`, false);
  };
  for (const name of names) visit(name, true);
  const prefix = !o.flags.has('h') && (o.flags.has('H') || names.length > 1 || viaFolder);
  let selected = false;
  for (const f of files) {
    const hits = splitLines(f.text).map((l, n) => [bare(l), n + 1] as const).filter(([l]) => re.test(l) !== invert);
    if (hits.length) selected = true;
    if (o.flags.has('l')) { if (hits.length) io.out(`${f.name}\n`); continue; }
    if (o.flags.has('c')) { io.out(`${prefix ? `${f.name}:` : ''}${hits.length}\n`); continue; }
    for (const [line, n] of hits) io.out(`${prefix ? `${f.name}:` : ''}${o.flags.has('n') ? `${n}:` : ''}${line}\n`);
  }
  return selected;
}

interface SortKey { start: number; end?: number; flags: string }
/** One -k value: N[flags][,M[flags]] (fields from 1; flags n r f). */
export function parseKey(spec: string): SortKey | { error: string } {
  const m = /^(\d+)([fnr]*)(?:,(\d+)([fnr]*))?$/u.exec(spec);
  if (!m) return { error: `sort: invalid number at field start: invalid count at start of '${spec}'` };
  if (Number(m[1]) === 0) return { error: `sort: field number is zero: invalid field specification '${spec}'` };
  if (m[3] !== undefined && Number(m[3]) === 0) return { error: `sort: field number is zero: invalid field specification '${spec}'` };
  return { start: Number(m[1]), ...m[3] !== undefined ? { end: Number(m[3]) } : {}, flags: m[2] + (m[4] ?? '') };
}

/** The text of a key: fields split at the separator, or (GNU's default) each field is its leading blanks and a word. */
function keyText(line: string, key: SortKey, tab: string | undefined): string {
  if (tab !== undefined) {
    const fields = line.split(tab);
    if (key.start > fields.length) return '';
    return fields.slice(key.start - 1, key.end ?? fields.length).join(tab);
  }
  const cs = Array.from(line);
  const skip = (from: number, n: number) => {
    let at = from;
    for (let f = 0; f < n; f++) { while (at < cs.length && /[ \t]/u.test(cs[at])) at++; while (at < cs.length && !/[ \t]/u.test(cs[at])) at++; }
    return at;
  };
  const start = skip(0, key.start - 1), end = key.end === undefined ? cs.length : skip(0, key.end);
  return start < end ? cs.slice(start, end).join('') : '';
}
const numberOf = (text: string) => { const m = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/u.exec(text); return m ? Number(m[1]) : 0; };

/** sort [-n -r -u -f] [-t C] [-k N[,M][nrf]]… [file…]: GNU's comparison with the last-resort whole-line compare. */
export function sort(io: TextIo, o: Parsed) {
  const tabs = o.flags.get('t');
  const tab = tabs?.at(-1);
  if (tab !== undefined && Array.from(tab).length !== 1) { io.err(tab ? `sort: multi-character tab '${tab}'` : 'sort: empty tab'); return; }
  const keys: SortKey[] = [];
  for (const spec of o.flags.get('k') ?? []) {
    const k = parseKey(spec);
    if ('error' in k) { io.err(k.error); return; }
    keys.push(k);
  }
  const global = ['n', 'r', 'f'].filter(f => o.flags.has(f)).join('');
  const lines: string[] = [];
  for (const name of o.operands.length ? o.operands : ['-']) {
    const r = io.read(name);
    // GNU sort reads every input before it prints anything, and stops at the first one it cannot read.
    if ('error' in r) { io.err(r.error === 'NOINPUT' ? noInput('sort') : r.error === 'EISDIR' ? `sort: read failed: ${name}: Is a directory` : `sort: open failed: ${name}: ${ERROR_TEXT[r.error]}`); return; }
    lines.push(...splitLines(r.text).map(bare));
  }
  const used = keys.length ? keys.map(k => ({ ...k, flags: k.flags || global })) : [{ start: 1, flags: global }];
  const compareKey = (a: string, b: string) => {
    for (const k of used) {
      let x = keys.length ? keyText(a, k, tab) : a, y = keys.length ? keyText(b, k, tab) : b;
      if (k.flags.includes('f')) { x = x.toUpperCase(); y = y.toUpperCase(); }
      const d = k.flags.includes('n') ? Math.sign(numberOf(x) - numberOf(y)) : compareCodePoints(x, y);
      if (d) return k.flags.includes('r') ? -d : d;
    }
    return 0;
  };
  const unique = o.flags.has('u'), reverse = o.flags.has('r');
  const sorted = [...lines].sort((a, b) => compareKey(a, b) || (unique ? 0 : (reverse ? -1 : 1) * compareCodePoints(a, b)));
  const kept = unique ? sorted.filter((l, i) => !i || compareKey(sorted[i - 1], l) !== 0) : sorted;
  io.out(kept.map(l => `${l}\n`).join(''));
}

/** uniq [-c -d -u -i] [input]: adjacent equal lines only, like GNU (sort first to group them all). */
export function uniq(io: TextIo, o: Parsed) {
  if (o.operands.length > 2) { io.usage(`uniq: extra operand '${o.operands[2]}'`); return; }
  if (o.operands.length === 2) { io.err('uniq: 模擬環境不支援輸出檔案參數，請改用 > 重新導向'); return; }
  const [input] = inputs(io, 'uniq', o.operands.slice(0, 1));
  if (!input) return;
  const fold = (l: string) => o.flags.has('i') ? l.toLowerCase() : l;
  const runs: [string, number][] = [];
  for (const line of splitLines(input.text).map(bare)) {
    const last = runs.at(-1);
    if (last && fold(last[0]) === fold(line)) last[1]++;
    else runs.push([line, 1]);
  }
  const shown = runs.filter(([, n]) => o.flags.has('d') ? n > 1 : o.flags.has('u') ? n === 1 : true);
  io.out(shown.map(([l, n]) => `${o.flags.has('c') ? `${String(n).padStart(7)} ` : ''}${l}\n`).join(''));
}

/** wc [-l -w -m -c] [file…]: GNU's columns (width from the regular files' total size; at least 7 for other inputs; 1 for one count of one input). */
export function wc(io: TextIo, o: Parsed) {
  const chosen = ['l', 'w', 'm', 'c'].filter(f => o.flags.has(f));
  const shown = chosen.length ? chosen : ['l', 'w', 'c'];
  const names = o.operands.length ? o.operands : ['-'];
  type Row = { name: string | null; counts: number[] | null; error?: string; regular: boolean; size: number; failed: boolean };
  const rows: Row[] = names.map(name => {
    const r = io.read(name);
    const label = o.operands.length ? name : null;
    if ('error' in r) {
      if (r.error === 'NOINPUT') return { name: label, counts: null, error: noInput('wc'), regular: false, size: 0, failed: true };
      if (r.error === 'EISDIR') return { name: label, counts: [0, 0, 0, 0], error: `wc: ${name}: Is a directory`, regular: false, size: 0, failed: false };
      return { name: label, counts: null, error: `wc: ${name}: ${ERROR_TEXT[r.error]}`, regular: false, size: 0, failed: true };
    }
    const counts = [splitLines(r.text).filter(l => l.endsWith('\n')).length, (r.text.match(/\S+/gu) ?? []).length, Array.from(r.text).length, bytesOf(r.text).length];
    return { name: label, counts, regular: name === '-' ? io.stdinRegular : r.regular, size: bytesOf(r.text).length, failed: false };
  });
  let width = 1;
  if (!(names.length === 1 && shown.length === 1) && !rows[0].failed) {
    let total = 0, minimum = 1;
    for (const r of rows) if (!r.failed) { if (r.regular) total += r.size; else minimum = 7; }
    width = Math.max(String(total).length, minimum);
  }
  const index = { l: 0, w: 1, m: 2, c: 3 } as const;
  const line = (counts: number[], name: string | null) => shown.map(f => String(counts[index[f as keyof typeof index]]).padStart(width)).join(' ') + (name !== null ? ` ${name}` : '') + '\n';
  const sum = [0, 0, 0, 0];
  for (const r of rows) {
    if (r.error) io.err(r.error);
    if (!r.counts) continue;
    r.counts.forEach((n, i) => { sum[i] += n; });
    io.out(line(r.counts, r.name));
  }
  if (names.length > 1) io.out(line(sum, 'total'));
}

/** A cut list: N, N-M, N-, -M, joined by commas; null with GNU's message when invalid. */
export function parseList(spec: string, what: 'fields' | 'positions'): { ranges: [number, number][] } | { error: string } {
  const ranges: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d*)(-?)(\d*)$/u.exec(part);
    if (!m || (!m[1] && !m[3])) return { error: what === 'fields' ? `cut: invalid field value '${part}'` : `cut: invalid byte or character range` };
    const lo = m[1] ? Number(m[1]) : 1, hi = m[2] ? (m[3] ? Number(m[3]) : Infinity) : lo;
    if (lo === 0 || hi === 0) return { error: what === 'fields' ? 'cut: fields are numbered from 1' : 'cut: byte/character positions are numbered from 1' };
    if (hi < lo) return { error: 'cut: invalid decreasing range' };
    ranges.push([lo, hi]);
  }
  return { ranges };
}

/** cut -f LIST [-d C] [-s] | -c LIST | -b LIST [file…]. -c counts characters (GNU counts bytes, like -b). */
export function cut(io: TextIo, o: Parsed) {
  const modes = ['f', 'c', 'b'].filter(f => o.flags.has(f));
  if (!modes.length) { io.usage('cut: you must specify a list of bytes, characters, or fields'); return; }
  if (modes.length > 1) { io.usage('cut: only one list may be specified'); return; }
  const mode = modes[0], delims = o.flags.get('d');
  if (delims && mode !== 'f') { io.usage('cut: an input delimiter may be specified only when operating on fields'); return; }
  const delim = delims?.at(-1) ?? '\t';
  if (Array.from(delim).length !== 1) { io.usage('cut: the delimiter must be a single character'); return; }
  const list = parseList(o.flags.get(mode)!.at(-1)!, mode === 'f' ? 'fields' : 'positions');
  if ('error' in list) { io.usage(list.error); return; }
  const inRange = (n: number) => list.ranges.some(([lo, hi]) => n >= lo && n <= hi);
  for (const input of inputs(io, 'cut', o.operands)) {
    let result = '';
    for (const raw of splitLines(input.text)) {
      const line = bare(raw);
      if (mode === 'f') {
        if (!line.includes(delim)) { if (!o.flags.has('s')) result += `${line}\n`; continue; }
        result += `${line.split(delim).filter((_, i) => inRange(i + 1)).join(delim)}\n`;
      } else if (mode === 'c') result += `${Array.from(line).filter((_, i) => inRange(i + 1)).join('')}\n`;
      else result += `${fromBytes(Uint8Array.from(Array.from(bytesOf(line)).filter((_, i) => inRange(i + 1))))}\n`;
    }
    io.out(result);
  }
}

const TR_CLASS: Record<string, string> = {
  lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789',
  alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', alnum: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  space: '\t\n\v\f\r ', blank: '\t ', punct: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
};

/** A tr set: characters, \n \t \\ \r, ranges a-z and the classes [:lower:] [:upper:] [:digit:] [:alpha:] [:alnum:] [:space:] [:blank:] [:punct:]. */
export function expandSet(spec: string): { chars: string[] } | { error: string } {
  const cs = Array.from(spec), chars: string[] = [];
  const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\' };
  const one = (i: number): [string, number] => cs[i] === '\\' && i + 1 < cs.length ? [ESC[cs[i + 1]] ?? cs[i + 1], i + 2] : [cs[i], i + 1];
  for (let i = 0; i < cs.length;) {
    if (cs[i] === '[' && cs[i + 1] === ':') {
      const end = cs.slice(i).join('').indexOf(':]');
      const name = end > 0 ? cs.slice(i + 2).join('').slice(0, end - 2) : '';
      if (end > 0 && name in TR_CLASS) { chars.push(...TR_CLASS[name]); i += end + 2; continue; }
      if (end > 0) return { error: `tr: invalid character class '${name}'` };
    }
    const [lo, next] = one(i);
    if (cs[next] === '-' && next + 1 < cs.length) {
      const [hi, after] = one(next + 1);
      if (hi.codePointAt(0)! < lo.codePointAt(0)!) return { error: `tr: range-endpoints of '${lo}-${hi}' are in reverse collating sequence order` };
      for (let c = lo.codePointAt(0)!; c <= hi.codePointAt(0)!; c++) chars.push(String.fromCodePoint(c));
      i = after;
      continue;
    }
    chars.push(lo);
    i = next;
  }
  return { chars };
}

/** tr [-d] [-s] SET1 [SET2]: standard input only, character by character. */
export function tr(io: TextIo, o: Parsed) {
  const del = o.flags.has('d'), squeeze = o.flags.has('s'), n = o.operands.length;
  const want = del ? (squeeze ? 2 : 1) : squeeze ? (n >= 2 ? 2 : 1) : 2;
  if (!n) { io.usage('tr: missing operand'); return; }
  if (n < want) {
    io.err(`tr: missing operand after '${o.operands[n - 1]}'`);
    io.usage(del ? 'Two strings must be given when both deleting and squeezing repeats.' : 'Two strings must be given when translating.');
    return;
  }
  if (n > want) { io.usage(`tr: extra operand '${o.operands[want]}'`); return; }
  const sets: string[][] = [];
  for (const spec of o.operands) {
    const s = expandSet(spec);
    if ('error' in s) { io.err(s.error); return; }
    sets.push(s.chars);
  }
  const r = io.read('-');
  if ('error' in r) { io.err(noInput('tr')); return; }
  let chars = Array.from(r.text);
  if (del) chars = chars.filter(c => !sets[0].includes(c));
  else if (sets.length === 2) {
    const to = sets[1];
    if (!to.length) { io.err('tr: when not truncating set1, string2 must be non-empty'); return; }
    const map = new Map<string, string>();
    sets[0].forEach((c, i) => map.set(c, to[Math.min(i, to.length - 1)]));
    chars = chars.map(c => map.get(c) ?? c);
  }
  if (squeeze) {
    const set = sets[sets.length - 1];
    chars = chars.filter((c, i) => !(i && c === chars[i - 1] && set.includes(c)));
  }
  io.out(chars.join(''));
}
