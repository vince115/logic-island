import { compilePattern, ERROR_TEXT, splitLines, type ReadResult } from './text';

/*
 * Engine stage E19 (docs/curriculum/SRV0_SERVER_CAPABILITY.md §25): a documented subset of GNU sed 4.9, only in the
 * diagnostics profile and above (a new command in a lower profile would change its `command not found` list, which
 * published lessons print). Scripts are one or more commands separated by ; or newlines (or several -e): an optional
 * address (N, $, /regex/, or a range of two of them, optionally negated with !) and one of p (print), d (delete),
 * s/regex/replacement/[g][p][N][I] (& and \1–\9 in the replacement), q (quit) and = (line number). -n prints only what
 * p asks for; -i edits the files in place (GNU's rules: a temporary file in the same folder, so the folder must be
 * writable; -iSUFFIX keeps a backup); -E/-r use extended regular expressions. Regular expressions are grep's subset
 * (compilePattern). Branches, hold space, y, a/i/c, w and multi-line commands are not modelled (a clear message says so).
 */

type Addr = { kind: 'line'; n: number } | { kind: 'last' } | { kind: 're'; re: RegExp };
interface Cmd { a1?: Addr; a2?: Addr; negate: boolean; op: 'p' | 'd' | 's' | 'q' | '='; re?: RegExp; repl?: string; global?: boolean; nth?: number; print?: boolean; active?: boolean; done?: boolean }

class SedError extends Error {}

export interface SedIo {
  out(data: string): void;
  err(line: string): void;
  read(name: string): ReadResult;
  /** -i: replaces the file's content (null when it worked, else sed's message); backup: the suffix of -iSUFFIX. */
  write(name: string, content: string, backup?: string): string | null;
}

const USAGE = ['Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...', '',
  '  -n, --quiet, --silent', '                 suppress automatic printing of pattern space', '  -e script, --expression=script', '                 add the script to the commands to be executed',
  '  -i[SUFFIX], --in-place[=SUFFIX]', '                 edit files in place (makes backup if SUFFIX supplied)', '  -E, -r, --regexp-extended', '                 use extended regular expressions in the script'];

/** Parses one -e expression (its number for GNU's messages) into commands. */
function parseScript(text: string, expr: number, extended: boolean): Cmd[] {
  const cmds: Cmd[] = [];
  let i = 0;
  const at = (msg: string, pos = i) => new SedError(`sed: -e expression #${expr}, char ${pos}: ${msg}`);
  const regexOf = (src: string, flags: string): RegExp => {
    const c = compilePattern(src, extended, true);
    if ('error' in c) throw at(c.error);
    try { return new RegExp(c.source, flags); } catch { throw at('Invalid regular expression'); }
  };
  /** Reads up to the unescaped delimiter (\delim is the delimiter itself, \n a newline). */
  const delimited = (delim: string, what: string): string => {
    let out = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\' && i + 1 < text.length) { const n = text[i + 1]; out += n === delim ? delim : n === 'n' ? '\n' : `\\${n}`; i += 2; continue; }
      if (ch === delim) { i++; return out; }
      if (ch === '\n') break;
      out += ch; i++;
    }
    throw at(what, text.length);
  };
  const address = (): Addr | undefined => {
    if (/\d/.test(text[i] ?? '')) { let n = ''; while (/\d/.test(text[i] ?? '')) n += text[i++]; return { kind: 'line', n: Number(n) }; }
    if (text[i] === '$') { i++; return { kind: 'last' }; }
    if (text[i] === '/') { i++; const src = delimited('/', 'unterminated address regex'); let flags = 'u'; if (text[i] === 'I') { flags = 'iu'; i++; } return { kind: 're', re: regexOf(src, flags) }; }
    return undefined;
  };
  while (i < text.length) {
    while (i < text.length && /[\s;]/.test(text[i])) i++;
    if (i >= text.length) break;
    const cmd: Cmd = { negate: false, op: 'p' };
    const a1 = address();
    if (a1) {
      cmd.a1 = a1;
      if (text[i] === ',') { i++; const a2 = address(); if (!a2) throw at('unexpected `,\'', i); cmd.a2 = a2; }
    }
    while (text[i] === ' ') i++;
    if (text[i] === '!') { cmd.negate = true; i++; while (text[i] === ' ') i++; }
    const op = text[i++];
    if (op === undefined) throw at('missing command', text.length);
    if (op === 'p' || op === 'd' || op === 'q' || op === '=') cmd.op = op;
    else if (op === 's') {
      const delim = text[i++];
      if (delim === undefined || delim === '\n' || delim === '\\') throw at('unterminated `s\' command', text.length);
      const src = delimited(delim, 'unterminated `s\' command'), repl = delimited(delim, 'unterminated `s\' command');
      let flags = 'u';
      cmd.op = 's'; cmd.repl = repl;
      while (i < text.length && !/[\s;}]/.test(text[i])) {
        const f = text[i++];
        if (f === 'g') cmd.global = true;
        else if (f === 'p') cmd.print = true;
        else if (f === 'I' || f === 'i') flags = 'iu';
        else if (/\d/.test(f)) { let n = f; while (/\d/.test(text[i] ?? '')) n += text[i++]; cmd.nth = Number(n); }
        else throw at('unknown option to `s\'');
      }
      cmd.re = regexOf(src, cmd.global ? `g${flags}` : flags);
    } else if ('aicybBtTnNhHgGxlwrRWzFeQvD:{}#'.includes(op)) throw new SedError(`sed：模擬環境的 sed 只支援 p、d、s、q 與 = 指令（${op} 不支援）`);
    else throw at(`unknown command: \`${op}'`);
    while (text[i] === ' ') i++;
    if (i < text.length && !/[;\n}]/.test(text[i])) throw at(`extra characters after command`, i + 1);
    cmds.push(cmd);
  }
  return cmds;
}

/** s's replacement: & is the match, \1–\9 the groups, \& a literal &, \n a newline. */
function replacement(repl: string, m: RegExpExecArray): string {
  let out = '';
  for (let k = 0; k < repl.length; k++) {
    const ch = repl[k];
    if (ch === '\\' && k + 1 < repl.length) { const n = repl[++k]; out += /\d/.test(n) ? m[Number(n)] ?? '' : n === 'n' ? '\n' : n === 't' ? '\t' : n; continue; }
    out += ch === '&' ? m[0] : ch;
  }
  return out;
}

const matchAddr = (a: Addr, line: string, n: number, last: boolean) => a.kind === 'line' ? n === a.n : a.kind === 'last' ? last : a.re.test(line);

/** sed's options, script and files; returns the exit status (0, 1 for a usage or script error, 2 when an input could not be read). */
export function sed(args: readonly string[], io: SedIo): number {
  let quiet = false, extended = false, inPlace: string | undefined;
  const scripts: string[] = [], files: string[] = [];
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === '--') { files.push(...args.slice(k + 1)); break; }
    if (a === '-n' || a === '--quiet' || a === '--silent') quiet = true;
    else if (a === '-E' || a === '-r' || a === '--regexp-extended') extended = true;
    else if (a === '-e' || a === '--expression') { const v = args[++k]; if (v === undefined) { io.err("sed: option requires an argument -- 'e'"); USAGE.forEach(l => io.err(l)); return 1; } scripts.push(v); }
    else if (a.startsWith('--expression=')) scripts.push(a.slice(13));
    else if (a === '-i' || a === '--in-place') inPlace = '';
    else if (a.startsWith('--in-place=')) inPlace = a.slice(11);
    else if (/^-[nErs]+$/.test(a) || /^-[nErs]*i/.test(a)) {
      // Combined short options (-ni, -Ei.bak): i takes the rest of the word as its suffix.
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (f === 'n') quiet = true;
        else if (f === 'E' || f === 'r') extended = true;
        else if (f === 's') continue;
        else if (f === 'i') { inPlace = a.slice(j + 1); break; }
      }
    }
    else if (a.startsWith('-') && a.length > 1) {
      io.err(a.startsWith('--') ? `sed: unrecognized option '${a}'` : `sed: invalid option -- '${a[1]}'`);
      USAGE.forEach(l => io.err(l));
      return 1;
    } else files.push(a);
  }
  if (!scripts.length) {
    if (!files.length) { USAGE.forEach(l => io.err(l)); return 1; }
    scripts.push(files.shift()!);
  }
  let cmds: Cmd[];
  try { cmds = scripts.flatMap((t, i) => parseScript(t, i + 1, extended)); } catch (e) { if (e instanceof SedError) { io.err(e.message); return 1; } throw e; }
  if (inPlace !== undefined && !files.length) { io.err('sed: no input files'); return 1; }
  let status = 0;
  // Without -i every file is one stream (line numbers and $ go across them); with -i each file is its own.
  const groups = inPlace !== undefined ? files.map(f => [f]) : [files.length ? files : ['-']];
  let quit = false;
  for (const group of groups) {
    if (quit) break;
    const lines: string[] = [];
    let readable: string | undefined;
    for (const name of group) {
      const r = io.read(name);
      if ('error' in r) { io.err(name === '-' ? `sed: ${ERROR_TEXT.NOINPUT}` : `sed: can't read ${name}: ${ERROR_TEXT[r.error]}`); status = 2; continue; }
      readable = name;
      lines.push(...splitLines(r.text).map(l => l.replace(/\n$/, '')));
    }
    if (readable === undefined) continue;
    for (const c of cmds) { c.active = false; c.done = false; }
    let out = '';
    for (let n = 1; n <= lines.length; n++) {
      let line = lines[n - 1], deleted = false;
      const last = n === lines.length;
      for (const c of cmds) {
        let hit: boolean;
        if (!c.a1) hit = true;
        else if (!c.a2) hit = matchAddr(c.a1, line, n, last);
        else if (c.active) {
          hit = true;
          if (c.a2.kind === 'line' ? n >= c.a2.n : matchAddr(c.a2, line, n, last)) c.active = false;
        } else if (!c.done && matchAddr(c.a1, line, n, last)) {
          hit = true;
          // A range whose end is a line number at or before its start covers just one line (GNU).
          c.active = !(c.a2.kind === 'line' && c.a2.n <= n) && !(c.a2.kind === 'last' && last);
          if (c.a1.kind === 'line') c.done = true;
        } else hit = false;
        if (hit === c.negate) continue;
        if (c.op === 'p') out += `${line}\n`;
        else if (c.op === '=') out += `${n}\n`;
        else if (c.op === 'd') { deleted = true; break; }
        else if (c.op === 'q') { quit = true; break; }
        else if (c.op === 's') {
          const re = c.re!;
          let count = 0, changed = false;
          re.lastIndex = 0;
          if (c.global || c.nth) {
            const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `g${re.flags}`);
            line = line.replace(g, (...m) => {
              count++;
              const groups = m.slice(0, -2) as string[], exec = Object.assign([...groups], { index: m.at(-2) as number, input: line }) as unknown as RegExpExecArray;
              if (c.nth ? count < c.nth || (!c.global && count > c.nth) : false) return groups[0];
              changed = true;
              return replacement(c.repl!, exec);
            });
          } else {
            const m = re.exec(line);
            if (m) { line = line.slice(0, m.index) + replacement(c.repl!, m) + line.slice(m.index + m[0].length); changed = true; }
          }
          if (changed && c.print) out += `${line}\n`;
        }
      }
      if (!deleted && !quiet) out += `${line}\n`;
      if (quit) break;
    }
    if (inPlace !== undefined) {
      const why = io.write(group[0], out, inPlace || undefined);
      if (why) { io.err(why); status = 4; }
    } else io.out(out);
  }
  return status;
}
