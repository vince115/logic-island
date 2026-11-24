import { baseName, LIMITS, physicalPath, resolvePath, type FsState } from './fs';
import { accountsOf, findUser, loginGroups } from './accounts';
import { escapeGlob, segmentRegExp } from './glob';
import { compilePattern, ERROR_TEXT } from './text';
import { shellPid, tableOf } from './processes';
import {
  background, binaryTest, globFields, OPEN_TEXT, openWrite, readPath, render, runStages, sameShell, unaryTest,
  type Ev, type Exec, type Line, type RunResult, type ShellFeature, type ShellProfile, type Stage, type Word as ShellWord,
} from './shell';

/*
 * Engine stage E8 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §16): a bounded Bash interpreter. It parses a documented
 * subset of Bash (words with quoting and expansions, pipelines, lists with ; && || &, if/elif/else, for, C-style for,
 * while/until, case, functions, { } and ( ), [[ ]], (( )), redirections and here-documents) and runs it on the simulated
 * machine. Every command that is not the interpreter's own (variables, read, set, local, return, exit…) runs through the
 * shell of shell.ts with runStages, so permissions, pipes, redirection and error messages are exactly the prompt's.
 *
 * It runs script files (./script.sh with a bash or sh shebang, bash script.sh, bash -c), and in the scripting profile it
 * is the prompt itself (variables and functions persist between lines in FsState.shell). Hard limits stop runaway
 * scripts: steps (commands and loop rounds), function nesting, script nesting and output size, each with a clear message.
 * No clocks and no randomness ($RANDOM is unset; $$ is the shell's fixed pid).
 */

// ------------------------------------------------------------------------------------------------------------ syntax

export type Part =
  | { t: 'lit'; s: string; q: boolean }
  | { t: 'param'; name: string; op?: string; arg?: Word; arg2?: Word; q: boolean }
  | { t: 'cmd'; body: List; q: boolean }
  | { t: 'arith'; expr: Word; q: boolean };
export interface Word { parts: Part[] }
export interface Redir { fd?: number; op: string; target?: Word; body?: string; quoted?: boolean; strip?: boolean; delim?: string }
interface Assign { name: string; value: Word; append: boolean }
export type Command =
  | { t: 'simple'; line: number; assigns: Assign[]; words: Word[]; redirs: Redir[] }
  | { t: 'group' | 'subshell'; line: number; body: List; redirs: Redir[] }
  | { t: 'if'; line: number; arms: { cond: List; body: List }[]; orelse?: List; redirs: Redir[] }
  | { t: 'for'; line: number; name: string; words?: Word[]; body: List; redirs: Redir[] }
  | { t: 'cfor'; line: number; init: Word; cond: Word; step: Word; body: List; redirs: Redir[] }
  | { t: 'while'; line: number; until: boolean; cond: List; body: List; redirs: Redir[] }
  | { t: 'case'; line: number; word: Word; arms: { patterns: Word[]; body: List }[]; redirs: Redir[] }
  | { t: 'func'; line: number; name: string; body: Command }
  | { t: 'arith'; line: number; expr: Word; redirs: Redir[] }
  | { t: 'cond'; line: number; expr: Cond; redirs: Redir[] };
type Cond = { t: 'and' | 'or'; a: Cond; b: Cond } | { t: 'not'; a: Cond } | { t: 'unary'; op: string; a: Word } | { t: 'binary'; op: string; a: Word; b: Word } | { t: 'word'; a: Word };
interface Pipeline { bang: boolean; cmds: Command[]; line: number }
interface AndOr { first: Pipeline; rest: { op: '&&' | '||'; p: Pipeline }[] }
interface Item { ao: AndOr; bg: boolean }
export type List = Item[];

type Tok =
  | { t: 'word'; w: Word; raw: string; line: number }
  | { t: 'op'; v: string; line: number }
  | { t: 'redir'; v: string; fd?: number; line: number }
  | { t: 'nl'; line: number }
  | { t: 'eof'; line: number };

class ShellSyntax extends Error { constructor(message: string, readonly line: number) { super(message); } }
const unexpected = (t: Tok) => new ShellSyntax(t.t === 'eof' ? 'syntax error: unexpected end of file'
  : `syntax error near unexpected token \`${t.t === 'nl' ? 'newline' : t.t === 'word' ? t.raw : t.v}'`, t.line);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPS = ['&>>', '<<<', '<<-', '&&', '||', ';;', '<<', '>>', '&>', '>&', '<&', '>|', ';', '&', '|', '(', ')', '<', '>'];
const REDIRS = ['&>>', '<<<', '<<-', '<<', '>>', '&>', '>&', '<&', '>|', '<', '>'];
/** The literal text of a word that is one unquoted literal (a keyword or a name), else undefined. */
const plain = (w: Word) => w.parts.length === 1 && w.parts[0].t === 'lit' && !w.parts[0].q ? w.parts[0].s : undefined;
const isWord = (t: Tok, ...words: string[]) => t.t === 'word' && words.includes(plain(t.w) ?? '\0');

/** A parser over one source text (a script, a line, the body of $( ) or a here-document). */
class Parser {
  pos = 0;
  line: number;
  private peeked: Tok | null = null;
  private pending: Redir[] = [];
  readonly warnings: string[] = [];
  constructor(readonly src: string, line = 1) { this.line = line; }

  peek(): Tok { return this.peeked ??= this.lex(); }
  next(): Tok { const t = this.peek(); this.peeked = null; return t; }
  private skipBlanks() {
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === ' ' || ch === '\t') { this.pos++; continue; }
      if (ch === '\\' && this.src[this.pos + 1] === '\n') { this.pos += 2; this.line++; continue; }
      if (ch === '#') { while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++; continue; }
      return;
    }
  }
  private lex(): Tok {
    this.skipBlanks();
    const line = this.line, src = this.src;
    if (this.pos >= src.length) {
      for (const r of this.pending) { r.body = ''; this.warnings.push(`warning: here-document at line ${line} delimited by end-of-file (wanted \`${r.delim}')`); }
      this.pending = [];
      return { t: 'eof', line };
    }
    if (src[this.pos] === '\n') { this.pos++; this.line++; this.heredocs(); return { t: 'nl', line }; }
    const io = /^(\d+)(?=[<>])/.exec(src.slice(this.pos, this.pos + 5));
    if (io) {
      this.pos += io[1].length;
      const op = REDIRS.find(o => src.startsWith(o, this.pos))!;
      this.pos += op.length;
      return { t: 'redir', v: op, fd: Number(io[1]), line };
    }
    const op = OPS.find(o => src.startsWith(o, this.pos));
    if (op) { this.pos += op.length; return REDIRS.includes(op) ? { t: 'redir', v: op, line } : { t: 'op', v: op, line }; }
    return this.word();
  }
  private heredocs() {
    for (const r of this.pending) {
      let body = '';
      for (;;) {
        if (this.pos >= this.src.length) { this.warnings.push(`warning: here-document at line ${this.line} delimited by end-of-file (wanted \`${r.delim}')`); break; }
        const eol = this.src.indexOf('\n', this.pos), end = eol < 0 ? this.src.length : eol;
        const text = r.strip ? this.src.slice(this.pos, end).replace(/^\t+/, '') : this.src.slice(this.pos, end);
        this.pos = eol < 0 ? end : end + 1;
        this.line++;
        if (text === r.delim) break;
        body += `${text}\n`;
      }
      r.body = body;
    }
    this.pending = [];
  }

  /** A word: until an unquoted blank or operator character; quotes, escapes, $ and ` inside. */
  private word(stopAtBlank = true): Tok {
    const start = this.pos, line = this.line, parts: Part[] = [], src = this.src;
    while (this.pos < src.length) {
      const ch = src[this.pos];
      if (stopAtBlank && ' \t\n;&|<>()'.includes(ch)) break;
      if (ch === "'") {
        const end = src.indexOf("'", this.pos + 1);
        if (end < 0) throw new ShellSyntax("unexpected EOF while looking for matching `''", line);
        const s = src.slice(this.pos + 1, end);
        this.line += s.split('\n').length - 1;
        addLit(parts, s, true);
        this.pos = end + 1;
        continue;
      }
      if (ch === '"') { this.pos++; this.quoted(parts, '"'); continue; }
      if (ch === '\\') {
        if (src[this.pos + 1] === '\n') { this.pos += 2; this.line++; continue; }
        if (this.pos + 1 < src.length) { addLit(parts, src[this.pos + 1], true); this.pos += 2; } else { addLit(parts, '\\', false); this.pos++; }
        continue;
      }
      if (ch === '$') { this.dollar(parts, false); continue; }
      if (ch === '`') { this.backtick(parts, false); continue; }
      if (ch === '\n') this.line++;
      addLit(parts, ch, false);
      this.pos++;
    }
    return { t: 'word', w: { parts }, raw: src.slice(start, this.pos), line };
  }
  /** The inside of double quotes (or, with no terminator, a here-document's body): \ escapes only $ ` " \ and newline. */
  quoted(parts: Part[], end: '"' | null) {
    const src = this.src;
    let any = false;
    for (;;) {
      if (this.pos >= src.length) {
        if (end) throw new ShellSyntax('unexpected EOF while looking for matching `"\'', this.line);
        break;
      }
      const ch = src[this.pos];
      if (ch === end) { this.pos++; break; }
      any = true;
      if (ch === '\\' && (end ? '$`"\\\n' : '$`\\\n').includes(src[this.pos + 1] ?? '')) {
        if (src[this.pos + 1] === '\n') this.line++;
        else addLit(parts, src[this.pos + 1], true);
        this.pos += 2;
        continue;
      }
      if (ch === '$') { this.dollar(parts, true); continue; }
      if (ch === '`') { this.backtick(parts, true); continue; }
      if (ch === '\n') this.line++;
      addLit(parts, ch, true);
      this.pos++;
    }
    if (!any && end) parts.push({ t: 'lit', s: '', q: true });
  }
  private dollar(parts: Part[], q: boolean) {
    const src = this.src;
    this.pos++;
    const c = src[this.pos];
    if (c === '(' && src[this.pos + 1] === '(') {
      const start = this.pos + 2;
      let depth = 0, i = start;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { if (depth === 0 && src[i + 1] === ')') break; depth--; }
      }
      if (i >= src.length) throw new ShellSyntax('unexpected EOF while looking for matching `)\'', this.line);
      parts.push({ t: 'arith', expr: loose(src.slice(start, i), this.line, true), q });
      this.pos = i + 2;
      return;
    }
    if (c === '(') {
      this.pos++;
      const body = this.list([')'], []);
      const t = this.next();
      if (t.t !== 'op' || t.v !== ')') throw unexpected(t);
      parts.push({ t: 'cmd', body, q });
      return;
    }
    if (c === '{') { parts.push(this.braced(q)); return; }
    const name = /^([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!\-])/.exec(src.slice(this.pos));
    if (!name) { addLit(parts, '$', q); return; }
    this.pos += name[1].length;
    parts.push({ t: 'param', name: name[1], q });
  }
  private braced(q: boolean): Part {
    const src = this.src, start = this.pos + 1;
    let depth = 0, i = start, quote: string | null = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) { if (ch === quote) quote = null; else if (ch === '\\' && quote === '"') i++; continue; }
      if (ch === '\\') { i++; continue; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { if (!depth) break; depth--; }
    }
    if (i >= src.length) throw new ShellSyntax('unexpected EOF while looking for matching `}\'', this.line);
    const inner = src.slice(start, i);
    this.pos = i + 1;
    const len = /^#([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?])$/.exec(inner);
    if (len) return { t: 'param', name: len[1], op: '#len', q };
    const m = /^([A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-])([\s\S]*)$/.exec(inner);
    if (!m) return { t: 'param', name: inner, op: 'bad', q };
    const [, name, rest] = m;
    if (!rest) return { t: 'param', name, q };
    if (rest.startsWith('[')) return { t: 'param', name, op: 'array', q };
    const op = [':-', ':=', ':+', ':?', '##', '%%', '//', '-', '=', '+', '?', '#', '%', '/'].find(o => rest.startsWith(o));
    if (!op) return { t: 'param', name: inner, op: 'bad', q };
    const arg = rest.slice(op.length);
    if (op === '/' || op === '//') {
      let cut = -1;
      for (let j = 0; j < arg.length; j++) { if (arg[j] === '\\') { j++; continue; } if (arg[j] === '/') { cut = j; break; } }
      return { t: 'param', name, op, arg: loose(cut < 0 ? arg : arg.slice(0, cut), this.line), arg2: loose(cut < 0 ? '' : arg.slice(cut + 1), this.line), q };
    }
    return { t: 'param', name, op, arg: loose(arg, this.line), q };
  }
  private backtick(parts: Part[], q: boolean) {
    const src = this.src;
    let i = this.pos + 1, text = '';
    for (; i < src.length && src[i] !== '`'; i++) {
      if (src[i] === '\\' && '`$\\'.includes(src[i + 1] ?? '')) { text += src[++i]; continue; }
      text += src[i];
    }
    if (i >= src.length) throw new ShellSyntax('unexpected EOF while looking for matching ``\'', this.line);
    this.pos = i + 1;
    const p = new Parser(text, this.line), body = p.list([], []);
    if (p.peek().t !== 'eof') throw unexpected(p.peek());
    parts.push({ t: 'cmd', body, q });
  }

  skipNewlines() { while (this.peek().t === 'nl') this.next(); }
  /** A list of and-or lists separated by ; & or newlines, up to one of the terminators (left unread). */
  list(ops: readonly string[], words: readonly string[]): List {
    const items: List = [];
    for (let item = this.item(ops, words); item; item = this.item(ops, words)) items.push(item);
    return items;
  }
  /** One and-or list with its separator, or null at a terminator (or the end). */
  item(ops: readonly string[], words: readonly string[]): Item | null {
    this.skipNewlines();
    const t = this.peek();
    if (t.t === 'eof' || (t.t === 'op' && ops.includes(t.v)) || (words.length && isWord(t, ...words))) return null;
    const ao = this.andOr();
    const sep = this.peek();
    let bg = false;
    if (sep.t === 'op' && (sep.v === ';' || sep.v === '&')) { this.next(); bg = sep.v === '&'; }
    else if (sep.t === 'nl') this.next();
    else if (!(sep.t === 'eof' || (sep.t === 'op' && ops.includes(sep.v)) || (words.length && isWord(sep, ...words)))) throw unexpected(sep);
    return { ao, bg };
  }
  private andOr(): AndOr {
    const first = this.pipeline(), rest: AndOr['rest'] = [];
    for (let t = this.peek(); t.t === 'op' && (t.v === '&&' || t.v === '||'); t = this.peek()) {
      this.next();
      this.skipNewlines();
      rest.push({ op: t.v as '&&' | '||', p: this.pipeline() });
    }
    return { first, rest };
  }
  private pipeline(): Pipeline {
    const line = this.peek().line;
    let bang = false;
    if (isWord(this.peek(), '!')) { this.next(); bang = true; }
    const cmds = [this.command()];
    while (this.peek().t === 'op' && (this.peek() as { v: string }).v === '|') { this.next(); this.skipNewlines(); cmds.push(this.command()); }
    return { bang, cmds, line };
  }
  private expectWord(word: string) { const t = this.next(); if (!isWord(t, word)) throw unexpected(t); }
  private body(stop: readonly string[]): List {
    const list = this.list([], stop);
    if (!list.length) throw unexpected(this.peek());
    return list;
  }
  private command(): Command {
    const t = this.peek(), line = t.line;
    if (t.t === 'op' && t.v === '(') {
      this.next();
      if (this.src[this.pos] === '(' && !this.peeked) {
        this.pos++;
        return { t: 'arith', line, expr: this.arithmetic(), redirs: this.redirects() };
      }
      const body = this.list([')'], []);
      const end = this.next();
      if (end.t !== 'op' || end.v !== ')' || !body.length) throw unexpected(end);
      return { t: 'subshell', line, body, redirs: this.redirects() };
    }
    if (t.t !== 'word' && t.t !== 'redir') throw unexpected(t);
    const kw = t.t === 'word' ? plain(t.w) : undefined;
    switch (kw) {
      case 'if': {
        this.next();
        const arms: { cond: List; body: List }[] = [];
        let orelse: List | undefined;
        arms.push({ cond: this.body(['then']), body: (this.expectWord('then'), this.body(['elif', 'else', 'fi'])) });
        for (;;) {
          const k = this.next();
          if (isWord(k, 'fi')) break;
          if (isWord(k, 'elif')) { arms.push({ cond: this.body(['then']), body: (this.expectWord('then'), this.body(['elif', 'else', 'fi'])) }); continue; }
          if (isWord(k, 'else')) { orelse = this.body(['fi']); this.expectWord('fi'); break; }
          throw unexpected(k);
        }
        return { t: 'if', line, arms, ...orelse ? { orelse } : {}, redirs: this.redirects() };
      }
      case 'while': case 'until': {
        this.next();
        const cond = this.body(['do']);
        this.expectWord('do');
        const body = this.body(['done']);
        this.expectWord('done');
        return { t: 'while', line, until: kw === 'until', cond, body, redirs: this.redirects() };
      }
      case 'for': {
        this.next();
        this.skipBlanks();
        if (this.src.startsWith('((', this.pos) && !this.peeked) {
          this.pos += 2;
          const parts = splitTop(this.arithText(), ';');
          if (parts.length !== 3) throw new ShellSyntax('syntax error: arithmetic expression required', line);
          const [init, cond, step] = parts.map(p => loose(p, line, true));
          const sep = this.peek();
          if (sep.t === 'op' && sep.v === ';') this.next();
          this.skipNewlines();
          this.expectWord('do');
          const body = this.body(['done']);
          this.expectWord('done');
          return { t: 'cfor', line, init, cond, step, body, redirs: this.redirects() };
        }
        const n = this.next();
        const name = n.t === 'word' ? plain(n.w) : undefined;
        if (!name || !NAME.test(name)) throw new ShellSyntax(`\`${n.t === 'word' ? n.raw : ''}': not a valid identifier`, line);
        this.skipNewlines();
        let words: Word[] | undefined;
        if (isWord(this.peek(), 'in')) {
          this.next();
          words = [];
          for (let w = this.peek(); w.t === 'word'; w = this.peek()) { this.next(); words.push(w.w); }
        }
        const sep = this.peek();
        if (sep.t === 'op' && sep.v === ';') this.next();
        this.skipNewlines();
        this.expectWord('do');
        const body = this.body(['done']);
        this.expectWord('done');
        return { t: 'for', line, name, ...words ? { words } : {}, body, redirs: this.redirects() };
      }
      case 'case': {
        this.next();
        const subject = this.next();
        if (subject.t !== 'word') throw unexpected(subject);
        this.skipNewlines();
        this.expectWord('in');
        const arms: { patterns: Word[]; body: List }[] = [];
        for (;;) {
          this.skipNewlines();
          if (isWord(this.peek(), 'esac')) { this.next(); break; }
          if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '(') this.next();
          const patterns: Word[] = [];
          for (;;) {
            const p = this.next();
            if (p.t !== 'word') throw unexpected(p);
            patterns.push(p.w);
            const sep = this.next();
            if (sep.t === 'op' && sep.v === '|') continue;
            if (sep.t === 'op' && sep.v === ')') break;
            throw unexpected(sep);
          }
          const body = this.list([';;'], ['esac']);
          const end = this.peek();
          if (end.t === 'op' && end.v === ';;') this.next();
          else if (!isWord(end, 'esac')) throw unexpected(end);
          arms.push({ patterns, body });
        }
        return { t: 'case', line, word: subject.w, arms, redirs: this.redirects() };
      }
      case '{': {
        this.next();
        const body = this.body(['}']);
        this.expectWord('}');
        return { t: 'group', line, body, redirs: this.redirects() };
      }
      case '[[': {
        this.next();
        const expr = this.condOr();
        this.expectWord(']]');
        return { t: 'cond', line, expr, redirs: this.redirects() };
      }
      case 'function': {
        this.next();
        const n = this.next(), name = n.t === 'word' ? plain(n.w) : undefined;
        if (!name) throw unexpected(n);
        if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '(') { this.next(); const c = this.next(); if (c.t !== 'op' || c.v !== ')') throw unexpected(c); }
        this.skipNewlines();
        return { t: 'func', line, name, body: this.compound() };
      }
      case 'then': case 'elif': case 'else': case 'fi': case 'do': case 'done': case 'esac': case '}': case ']]':
        throw unexpected(t);
    }
    return this.simple();
  }
  private compound(): Command {
    const c = this.command();
    if (c.t === 'simple' || c.t === 'func') throw new ShellSyntax('syntax error near unexpected token: a function body must be a compound command such as { … }', c.line);
    return c;
  }
  private simple(): Command {
    const line = this.peek().line, assigns: Assign[] = [], words: Word[] = [], redirs: Redir[] = [];
    for (;;) {
      const t = this.peek();
      if (t.t === 'redir') { this.next(); redirs.push(this.redirect(t)); continue; }
      if (t.t !== 'word') break;
      this.next();
      const a = !words.length ? assignment(t.w) : undefined;
      if (a) {
        if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '(' && !a.value.parts.length) throw new ShellSyntax(`${a.name}=(…)：模擬環境的 Bash 不支援陣列`, t.line);
        assigns.push(a);
        continue;
      }
      words.push(t.w);
      const name = plain(t.w);
      if (words.length === 1 && !assigns.length && !redirs.length && this.peek().t === 'op' && (this.peek() as { v: string }).v === '(') {
        this.next();
        const c = this.next();
        if (c.t !== 'op' || c.v !== ')' || !name || !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name)) throw unexpected(c);
        this.skipNewlines();
        return { t: 'func', line, name, body: this.compound() };
      }
    }
    if (!assigns.length && !words.length && !redirs.length) throw unexpected(this.peek());
    return { t: 'simple', line, assigns, words, redirs };
  }
  private redirects(): Redir[] {
    const out: Redir[] = [];
    for (let t = this.peek(); t.t === 'redir'; t = this.peek()) { this.next(); out.push(this.redirect(t)); }
    return out;
  }
  private redirect(t: Extract<Tok, { t: 'redir' }>): Redir {
    const target = this.next();
    if (target.t !== 'word') throw unexpected(target);
    if (t.v === '<<' || t.v === '<<-') {
      const delim = target.w.parts.map(p => p.t === 'lit' ? p.s : '').join(''), quoted = target.w.parts.some(p => p.t === 'lit' && p.q);
      const r: Redir = { ...t.fd !== undefined ? { fd: t.fd } : {}, op: t.v, delim, quoted, strip: t.v === '<<-' };
      this.pending.push(r);
      return r;
    }
    return { ...t.fd !== undefined ? { fd: t.fd } : {}, op: t.v, target: target.w };
  }
  private arithText(): string {
    const src = this.src;
    let depth = 0, i = this.pos;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { if (depth === 0 && src[i + 1] === ')') break; depth--; }
      else if (src[i] === '\n') this.line++;
    }
    if (i >= src.length) throw new ShellSyntax('unexpected EOF while looking for matching `))\'', this.line);
    const text = src.slice(this.pos, i);
    this.pos = i + 2;
    return text;
  }
  private arithmetic(): Word { return loose(this.arithText(), this.line, true); }

  // [[ … ]]
  private condOr(): Cond {
    let a = this.condAnd();
    while (this.peek().t === 'op' && (this.peek() as { v: string }).v === '||') { this.next(); a = { t: 'or', a, b: this.condAnd() }; }
    return a;
  }
  private condAnd(): Cond {
    let a = this.condNot();
    while (this.peek().t === 'op' && (this.peek() as { v: string }).v === '&&') { this.next(); a = { t: 'and', a, b: this.condNot() }; }
    return a;
  }
  private condNot(): Cond {
    if (isWord(this.peek(), '!')) { this.next(); return { t: 'not', a: this.condNot() }; }
    const t = this.peek();
    if (t.t === 'op' && t.v === '(') { this.next(); const e = this.condOr(); const c = this.next(); if (c.t !== 'op' || c.v !== ')') throw unexpected(c); return e; }
    const first = this.next();
    if (first.t !== 'word' || isWord(first, ']]')) throw unexpected(first);
    const op = plain(first.w);
    const after = this.peek();
    if (op && /^-[efdrwxsLhznv]$/.test(op) && after.t === 'word' && !isWord(after, ']]')) { this.next(); return { t: 'unary', op, a: (after as { w: Word }).w }; }
    if (after.t === 'redir' && (after.v === '<' || after.v === '>')) { this.next(); const b = this.next(); if (b.t !== 'word') throw unexpected(b); return { t: 'binary', op: after.v, a: first.w, b: b.w }; }
    const bin = after.t === 'word' ? plain(after.w) : undefined;
    if (bin === '=~') {
      this.next();
      this.skipBlanks();
      return { t: 'binary', op: '=~', a: first.w, b: this.regexWord() };
    }
    if (bin && ['==', '=', '!=', '-eq', '-ne', '-lt', '-le', '-gt', '-ge', '-nt', '-ot', '-ef'].includes(bin)) {
      this.next();
      const b = this.next();
      if (b.t !== 'word') throw unexpected(b);
      return { t: 'binary', op: bin, a: first.w, b: b.w };
    }
    return { t: 'word', a: first.w };
  }
  /** The right side of =~: up to a blank outside parentheses (| ( ) are regular expression characters here). */
  private regexWord(): Word {
    const parts: Part[] = [], src = this.src;
    let depth = 0;
    while (this.pos < src.length) {
      const ch = src[this.pos];
      if ((ch === ' ' || ch === '\t' || ch === '\n') && depth === 0) break;
      if (ch === "'") { const end = src.indexOf("'", this.pos + 1); if (end < 0) throw new ShellSyntax("unexpected EOF while looking for matching `''", this.line); addLit(parts, src.slice(this.pos + 1, end), true); this.pos = end + 1; continue; }
      if (ch === '"') { this.pos++; this.quoted(parts, '"'); continue; }
      if (ch === '\\' && this.pos + 1 < src.length) { addLit(parts, src[this.pos + 1], true); this.pos += 2; continue; }
      if (ch === '$' && /[A-Za-z_{(0-9]/.test(src[this.pos + 1] ?? '')) { this.dollar(parts, false); continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      addLit(parts, ch, false);
      this.pos++;
    }
    return { parts };
  }
}
function addLit(parts: Part[], s: string, q: boolean) {
  const last = parts.at(-1);
  if (last?.t === 'lit' && last.q === q) last.s += s;
  else parts.push({ t: 'lit', s, q });
}
/** A word from a whole text (the argument of ${x:-…}, an arithmetic expression, a here-document): quotes and $ apply, blanks are literal. */
function loose(text: string, line: number, heredoc = false): Word {
  const p = new Parser(text, line), parts: Part[] = [];
  if (heredoc) { p.quoted(parts, null); return { parts }; }
  const w = (p as unknown as { word(stop: boolean): Tok }).word(false);
  return w.t === 'word' ? w.w : { parts };
}
/** Splits text at a character outside parentheses and quotes. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && !depth) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function assignment(w: Word): Assign | undefined {
  const first = w.parts[0];
  if (first?.t !== 'lit' || first.q) return undefined;
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(\+?)=/.exec(first.s);
  if (!m) return undefined;
  const rest = first.s.slice(m[0].length);
  return { name: m[1], append: m[2] === '+', value: { parts: [...rest ? [{ t: 'lit' as const, s: rest, q: false }] : [], ...w.parts.slice(1)] } };
}

/** Parses a whole program: the complete commands before a syntax error, and the error (bash runs the commands before it). */
export function parseProgram(source: string): { items: List; error?: { message: string; line: number }; warnings: string[] } {
  const p = new Parser(source), items: List = [];
  try {
    for (let item = p.item([], []); item; item = p.item([], [])) items.push(item);
    return { items, warnings: p.warnings };
  } catch (e) {
    if (e instanceof ShellSyntax) return { items, error: { message: e.message, line: e.line }, warnings: p.warnings };
    throw e;
  }
}
/** E8: every command name a script or line runs that is written literally (for the lesson validator). */
export function scriptCommandNames(source: string): string[] {
  const names: string[] = [];
  const word = (w: Word) => w.parts.forEach(p => { if (p.t === 'cmd') list(p.body); if (p.t === 'param' && p.arg) word(p.arg); });
  const cmd = (c: Command): void => {
    switch (c.t) {
      case 'simple': { const n = c.words[0] && plain(c.words[0]); if (n) names.push(n, ...(n === 'sudo' ? c.words.slice(1).map(plain).filter((x): x is string => !!x && !x.startsWith('-')).slice(0, 1) : [])); c.words.forEach(word); c.assigns.forEach(a => word(a.value)); return; }
      case 'group': case 'subshell': list(c.body); return;
      case 'if': c.arms.forEach(a => { list(a.cond); list(a.body); }); if (c.orelse) list(c.orelse); return;
      case 'for': case 'cfor': list(c.body); return;
      case 'while': list(c.cond); list(c.body); return;
      case 'case': c.arms.forEach(a => list(a.body)); return;
      case 'func': cmd(c.body); return;
      default: return;
    }
  };
  const list = (l: List) => l.forEach(i => [i.ao.first, ...i.ao.rest.map(r => r.p)].forEach(p => p.cmds.forEach(cmd)));
  const parsed = parseProgram(source);
  list(parsed.items);
  return names;
}

// ------------------------------------------------------------------------------------------------------- arithmetic

class ArithError extends Error {}
type Num = { t: 'n'; v: number } | { t: 'v'; name: string } | { t: 'u'; op: string; a: Num } | { t: 'b'; op: string; a: Num; b: Num; text: string }
  | { t: '?'; c: Num; a: Num; b: Num } | { t: '='; op: string; name: string; b: Num } | { t: 'inc'; name: string; d: number; post: boolean } | { t: ','; a: Num; b: Num };
/** Bash's $(( )): integers, + - * / % ** << >> & | ^ ~ ! comparisons && || ?: = += … ++ -- and names (their values are expressions too). */
function arith(src: string, get: (name: string) => string | undefined, set: (name: string, value: string) => void, depth = 0): number {
  if (depth > 8) throw new ArithError('expression recursion level exceeded');
  const tokens: string[] = [];
  const re = /\s*(0[xX][0-9a-fA-F]+|\d+|[A-Za-z_][A-Za-z0-9_]*|\*\*=?|<<=?|>>=?|&&|\|\||\+\+|--|[-+*/%&|^]=|[<>=!]=|[-+*/%<>=!~&|^?:(),])/y;
  let at = 0;
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) throw new ArithError(`syntax error: invalid arithmetic operator (error token is "${src.slice(at).trim()}")`);
    tokens.push(m[1]);
    at = re.lastIndex;
  }
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const rest = () => tokens.slice(i).join(' ');
  const BIN: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '**': 11 };
  const expr = (): Num => { let a = assign(); while (peek() === ',') { next(); a = { t: ',', a, b: assign() }; } return a; };
  const assign = (): Num => {
    const save = i, name = peek();
    if (name && NAME.test(name) && /^(=|[-+*/%&|^]=|<<=|>>=|\*\*=)$/.test(tokens[i + 1] ?? '')) { i += 2; return { t: '=', op: tokens[save + 1], name, b: assign() }; }
    return ternary();
  };
  const ternary = (): Num => {
    const c = binary(1);
    if (peek() !== '?') return c;
    next();
    const a = assign();
    if (next() !== ':') throw new ArithError(`syntax error in expression (error token is "${rest()}")`);
    return { t: '?', c, a, b: assign() };
  };
  const binary = (min: number): Num => {
    let a = unary();
    for (let op = peek(); op && BIN[op] >= min; op = peek()) {
      next();
      const before = rest();
      const b = op === '**' ? binary(BIN[op]) : binary(BIN[op] + 1);
      a = { t: 'b', op, a, b, text: before };
    }
    return a;
  };
  const unary = (): Num => {
    const op = peek();
    if (op === '++' || op === '--') { next(); const n = next(); if (!n || !NAME.test(n)) throw new ArithError(`syntax error: operand expected (error token is "${rest()}")`); return { t: 'inc', name: n, d: op === '++' ? 1 : -1, post: false }; }
    if (op === '-' || op === '+' || op === '!' || op === '~') { next(); return { t: 'u', op, a: unary() }; }
    return postfix();
  };
  const postfix = (): Num => {
    const t = next();
    if (t === undefined) throw new ArithError(`syntax error: operand expected (error token is "${src.trim().split(/\s+/).at(-1) ?? ''}")`);
    if (t === '(') { const e = expr(); if (next() !== ')') throw new ArithError(`syntax error: \`)' expected`); return e; }
    if (/^\d/.test(t)) return { t: 'n', v: literal(t) };
    if (NAME.test(t)) {
      if (peek() === '++' || peek() === '--') { const d = next() === '++' ? 1 : -1; return { t: 'inc', name: t, d, post: true }; }
      return { t: 'v', name: t };
    }
    throw new ArithError(`syntax error: operand expected (error token is "${[t, ...tokens.slice(i)].join(' ')}")`);
  };
  const literal = (t: string) => {
    if (/^0[xX]/.test(t)) return parseInt(t, 16);
    if (/^0\d+$/.test(t)) { if (/[89]/.test(t)) throw new ArithError(`${t}: value too great for base (error token is "${t}")`); return parseInt(t, 8); }
    return Number(t);
  };
  const value = (name: string): number => {
    const v = (get(name) ?? '').trim();
    if (!v) return 0;
    if (/^-?\d+$/.test(v) && !/^-?0\d/.test(v)) return Number(v);
    return arith(v, get, set, depth + 1);
  };
  const ev = (n: Num): number => {
    switch (n.t) {
      case 'n': return n.v;
      case 'v': return value(n.name);
      case ',': ev(n.a); return ev(n.b);
      case '?': return ev(n.c) ? ev(n.a) : ev(n.b);
      case 'inc': { const old = value(n.name), now = old + n.d; set(n.name, String(now)); return n.post ? old : now; }
      case '=': { const b = ev(n.b), v = n.op === '=' ? b : combine(n.op.slice(0, -1), value(n.name), b, ''); set(n.name, String(v)); return v; }
      case 'u': { const a = ev(n.a); return n.op === '-' ? -a : n.op === '+' ? a : n.op === '!' ? Number(!a) : ~a; }
      case 'b':
        if (n.op === '&&') return Number(!!ev(n.a) && !!ev(n.b));
        if (n.op === '||') return Number(!!ev(n.a) || !!ev(n.b));
        return combine(n.op, ev(n.a), ev(n.b), n.text);
    }
  };
  const combine = (op: string, a: number, b: number, text: string): number => {
    switch (op) {
      case '+': return a + b; case '-': return a - b; case '*': return a * b;
      case '/': case '%': if (b === 0) throw new ArithError(`division by 0 (error token is "${text || String(b)}")`); return op === '/' ? Math.trunc(a / b) : a % b;
      case '**': if (b < 0) throw new ArithError('exponent less than 0 (error token is "' + text + '")'); return a ** b;
      case '<<': return a << b; case '>>': return a >> b; case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
      case '==': return Number(a === b); case '!=': return Number(a !== b); case '<': return Number(a < b); case '<=': return Number(a <= b); case '>': return Number(a > b); case '>=': return Number(a >= b);
      default: throw new ArithError(`syntax error in expression (error token is "${op}")`);
    }
  };
  if (!tokens.length) return 0;
  const tree = expr();
  if (i < tokens.length) throw new ArithError(`syntax error in expression (error token is "${rest()}")`);
  return ev(tree);
}

// -------------------------------------------------------------------------------------------------------- execution

export const SCRIPT_LIMITS = { steps: 10000, depth: 100, scripts: 16 } as const;
export const DEFAULT_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
/** What the interpreter remembers between lines at the prompt. */
export interface ShellMemory { vars: Readonly<Record<string, string>>; exported: readonly string[]; funcs: Readonly<Record<string, Command>>; options: Options }
interface Options { errexit: boolean; nounset: boolean; pipefail: boolean; xtrace: boolean }
/** E8: a running script's shared step budget and how deeply scripts call scripts. */
export interface ScriptCtx { budget: { steps: number }; depth: number }

type Sink = { kind: 'out' } | { kind: 'err' } | { kind: 'null' } | { kind: 'buf'; data: string } | { kind: 'file'; path: string; shown: string; data: string };
interface Input { text: string; pos: number }
class Exit { constructor(readonly status: number) {} }
class Fatal { constructor(readonly status: number) {} }
class Return { constructor(readonly status: number) {} }
class Break { constructor(public n: number, readonly cont: boolean) {} }
class Expansion extends Error {}
interface Field { text: string; pattern: string }
const literalWord = (text: string): ShellWord => ({ text, pattern: Array.from(text).map(escapeGlob).join('') });
const BUILTINS = [':', 'read', 'set', 'shift', 'local', 'declare', 'typeset', 'export', 'unset', 'readonly', 'return', 'exit', 'break', 'continue', 'source', '.', 'eval', 'exec',
  'wait', 'command', 'type', 'trap', 'getopts', 'alias', 'unalias', 'shopt', 'let', 'mapfile', 'readarray', 'select', 'coproc'];
const UNSUPPORTED = ['trap', 'getopts', 'alias', 'unalias', 'shopt', 'let', 'mapfile', 'readarray', 'select', 'coproc'];
/** How xtrace (set -x) prints a word. */
const xquote = (w: string) => /^[A-Za-z0-9_@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, "'\\''")}'`;

class Interp {
  vars = new Map<string, string>();
  exported = new Set<string>();
  funcs = new Map<string, Command>();
  frames: Map<string, string | undefined>[] = [];
  opts: Options = { errexit: false, nounset: false, pipefail: false, xtrace: false };
  status = 0;
  lastSubst: number | undefined;
  fd1: Sink = { kind: 'out' };
  fd2: Sink = { kind: 'err' };
  events: Ev[] = [];
  private size = 0;
  private clipped = false;
  clear = false;
  line = 0;
  suppress = 0;
  funcDepth = 0;
  loopDepth = 0;
  sub = 0;
  sourceDepth = 0;
  xlevel = 1;
  logout: number | undefined;
  private kept: Extract<Sink, { kind: 'file' }>[] = [];
  private lastBg: string | undefined;
  readonly features: ReadonlySet<ShellFeature>;

  constructor(public state: FsState, readonly profile: ShellProfile, readonly interactive: boolean, readonly tty: boolean, readonly ctx: ScriptCtx,
    public name: string, public positional: string[], public stdin: Input | null) {
    this.features = new Set(profile.features ?? []);
  }

  /** The login environment, the memory of the prompt or a parent's exported variables. */
  init(memory?: ShellMemory, env?: Readonly<Record<string, string>>) {
    const base: Record<string, string> = { HOME: this.state.home, USER: this.state.user, LOGNAME: this.state.user, SHELL: '/bin/bash', PATH: DEFAULT_PATH, LANG: 'C.UTF-8' };
    for (const [k, v] of Object.entries(base)) { this.vars.set(k, v); this.exported.add(k); }
    if (memory) {
      this.vars = new Map(Object.entries(memory.vars));
      this.exported = new Set(memory.exported);
      this.funcs = new Map(Object.entries(memory.funcs));
      this.opts = { ...memory.options };
    }
    for (const [k, v] of Object.entries(env ?? {})) { this.vars.set(k, v); this.exported.add(k); }
  }
  memory(): ShellMemory {
    return { vars: Object.fromEntries(this.vars), exported: [...this.exported], funcs: Object.fromEntries(this.funcs), options: { ...this.opts } };
  }

  where(line = this.line) { return this.interactive && !this.sourceDepth ? 'bash: ' : `${this.name}: line ${line}: `; }
  write(sink: Sink, data: string) {
    if (!data) return;
    switch (sink.kind) {
      case 'null': return;
      case 'buf': case 'file': sink.data += data; return;
      default:
        if (this.clipped) return;
        if (this.size + data.length > LIMITS.output) { this.clipped = true; this.events.push({ fd: 2, data: `（模擬環境：輸出超過 ${LIMITS.output} 個字元，其餘省略）\n` }); return; }
        this.size += data.length;
        this.events.push({ fd: sink.kind === 'out' ? 1 : 2, data });
    }
  }
  err(message: string) { this.write(this.fd2, `${message}\n`); }
  tick() {
    if (--this.ctx.budget.steps < 0) {
      this.err(`${this.where()}模擬環境：執行超過 ${SCRIPT_LIMITS.steps} 步，已停止（可能是沒有結束的迴圈）`);
      throw new Fatal(124);
    }
  }

  // -------------------------------------------------------------------------------------------------- variables
  lookup(name: string): string | undefined {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].has(name)) return this.frames[i].get(name);
    if (/^\d+$/.test(name)) return name === '0' ? this.name : this.positional[Number(name) - 1];
    switch (name) {
      case '#': return String(this.positional.length);
      case '?': return String(this.status);
      case '$': return String(shellPid(this.state));
      case '!': return this.lastBg;
      case '-': return `${this.opts.errexit ? 'e' : ''}${this.opts.nounset ? 'u' : ''}${this.opts.xtrace ? 'x' : ''}hB`;
      case '@': case '*': return this.positional.join(' ');
      case 'PWD': return this.state.cwd;
      case 'LINENO': return String(this.line);
      case 'SECONDS': return '0';
      case 'HOSTNAME': return this.state.host ?? 'logic-island';
      case 'UID': case 'EUID': return String(findUser(accountsOf(this.state), this.state.user)?.uid ?? 1000);
    }
    return this.vars.get(name);
  }
  setVar(name: string, value: string) {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].has(name)) { this.frames[i].set(name, value); return; }
    this.vars.set(name, value);
  }
  unsetVar(name: string) {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].has(name)) { this.frames[i].set(name, undefined); return; }
    this.vars.delete(name);
    this.exported.delete(name);
  }
  ifs() { return this.lookup('IFS') ?? ' \t\n'; }
  environment(extra: readonly { name: string; value: string }[] = []): Record<string, string> {
    const env: Record<string, string> = {};
    for (const name of this.exported) { const v = this.lookup(name); if (v !== undefined) env[name] = v; }
    for (const a of extra) env[a.name] = a.value;
    return env;
  }

  // ------------------------------------------------------------------------------------------------- expansion
  unbound(name: string): never {
    this.err(`${this.where()}${name}: unbound variable`);
    throw new Fatal(1);
  }
  param(p: Extract<Part, { t: 'param' }>): string {
    const name = p.name;
    if (p.op === 'bad') { this.err(`${this.where()}\${${name}}: bad substitution`); throw new Fatal(1); }
    if (p.op === 'array') { this.err(`${this.where()}\${${name}[…]}：模擬環境的 Bash 不支援陣列`); throw new Fatal(1); }
    const value = this.lookup(name), set = value !== undefined, nonEmpty = set && value !== '';
    switch (p.op) {
      case undefined: if (!set && this.opts.nounset && name !== '@' && name !== '*') this.unbound(name); return value ?? '';
      case '#len': if (!set && this.opts.nounset && name !== '@' && name !== '*') this.unbound(name); return name === '@' || name === '*' ? String(this.positional.length) : String(Array.from(value ?? '').length);
      case ':-': return nonEmpty ? value! : this.text(p.arg!);
      case '-': return set ? value! : this.text(p.arg!);
      case ':+': return nonEmpty ? this.text(p.arg!) : '';
      case '+': return set ? this.text(p.arg!) : '';
      case ':=': case '=': {
        if (p.op === ':=' ? nonEmpty : set) return value!;
        if (!NAME.test(name)) { this.err(`${this.where()}$${name}: cannot assign in this way`); throw new Fatal(1); }
        const v = this.text(p.arg!);
        this.setVar(name, v);
        return v;
      }
      case ':?': case '?': {
        if (p.op === ':?' ? nonEmpty : set) return value!;
        const message = p.arg && p.arg.parts.length ? this.text(p.arg) : p.op === ':?' ? 'parameter null or not set' : 'parameter not set';
        this.err(`${this.where()}${name}: ${message}`);
        throw new Fatal(1);
      }
      default: {
        if (!set && this.opts.nounset) this.unbound(name);
        const v = value ?? '', chars = Array.from(v), re = segmentRegExp(this.pattern(p.arg!));
        const slice = (a: number, b?: number) => chars.slice(a, b).join('');
        if (p.op === '#') { for (let i = 0; i <= chars.length; i++) if (re.test(slice(0, i))) return slice(i); return v; }
        if (p.op === '##') { for (let i = chars.length; i >= 0; i--) if (re.test(slice(0, i))) return slice(i); return v; }
        if (p.op === '%') { for (let i = chars.length; i >= 0; i--) if (re.test(slice(i))) return slice(0, i); return v; }
        if (p.op === '%%') { for (let i = 0; i <= chars.length; i++) if (re.test(slice(i))) return slice(0, i); return v; }
        // ${x/pattern/replacement} and ${x//…}: the longest match at each position.
        const rep = this.text(p.arg2!);
        let out = '', i = 0, done = false;
        while (i < chars.length) {
          let hit = -1;
          if (!done) for (let e = chars.length; e > i; e--) if (re.test(slice(i, e))) { hit = e; break; }
          if (hit < 0) { out += chars[i++]; continue; }
          out += rep;
          i = hit;
          if (p.op === '/') done = true;
        }
        return out;
      }
    }
  }
  /** A word as one string: no field splitting, no pathname expansion (assignments, redirections, case, [[ ]]). */
  text(w: Word): string {
    let out = '';
    w.parts.forEach((p, i) => {
      if (p.t === 'lit') out += i === 0 && !p.q ? this.tilde(p.s) : p.s;
      else if (p.t === 'param') out += p.name === '@' || p.name === '*' ? (p.op ? this.param(p) : this.positional.join(p.name === '*' ? this.ifs().slice(0, 1) : ' ')) : this.param(p);
      else if (p.t === 'cmd') out += this.capture(p.body);
      else out += String(this.arithmetic(p.expr));
    });
    return out;
  }
  /** A word as a pattern (case, [[ == ]], ${x#…}): quoted characters only match themselves. */
  pattern(w: Word, regex = false): string {
    const esc = (s: string) => regex ? s.replace(/[.[\]()*+?{}|^$\\]/g, '\\$&') : Array.from(s).map(escapeGlob).join('');
    return w.parts.map(p => {
      if (p.t === 'lit') return p.q ? esc(p.s) : p.s;
      const v = p.t === 'param' ? this.param(p) : p.t === 'cmd' ? this.capture(p.body) : String(this.arithmetic(p.expr));
      return p.q ? esc(v) : v;
    }).join('');
  }
  tilde(s: string): string {
    if (!s.startsWith('~')) return s;
    const cut = s.indexOf('/') < 0 ? s.length : s.indexOf('/'), who = s.slice(1, cut);
    const home = !who ? this.lookup('HOME') : findUser(accountsOf(this.state), who)?.home;
    return home === undefined ? s : home + s.slice(cut);
  }
  /** A word as fields: expansions, field splitting of unquoted results (IFS), "$@" as one field per parameter. */
  fields(w: Word): Field[] {
    const out: Field[] = [];
    let cur: Field | null = null;
    const field = () => (cur ??= { text: '', pattern: '' });
    const quoted = (s: string) => { const f = field(); f.text += s; f.pattern += Array.from(s).map(escapeGlob).join(''); };
    const raw = (s: string) => { if (!s) return; const f = field(); f.text += s; f.pattern += s.replace(/\\/g, '\\\\'); };
    const close = () => { if (cur) { out.push(cur); cur = null; } };
    /** Field splitting of an unquoted expansion: IFS blanks separate (and are trimmed), other IFS characters each end a field. */
    const split = (s: string) => {
      const ifs = this.ifs();
      if (!ifs) { raw(s); return; }
      const blank = (c: string) => ifs.includes(c) && ' \t\n'.includes(c), hard = (c: string) => ifs.includes(c) && !' \t\n'.includes(c);
      const chars = Array.from(s);
      let i = 0, token = '';
      if (chars.length && blank(chars[0])) { close(); while (i < chars.length && blank(chars[i])) i++; }
      for (; i < chars.length; i++) {
        const ch = chars[i];
        if (hard(ch)) { raw(token); token = ''; field(); close(); while (i + 1 < chars.length && blank(chars[i + 1])) i++; continue; }
        if (blank(ch)) {
          let j = i;
          while (j < chars.length && blank(chars[j])) j++;
          if (j < chars.length && hard(chars[j])) { i = j - 1; continue; }
          raw(token); token = '';
          close();
          i = j - 1;
          continue;
        }
        token += ch;
      }
      raw(token);
    };
    w.parts.forEach((p, i) => {
      if (p.t === 'lit') { if (p.q) quoted(p.s); else raw(i === 0 ? this.tilde(p.s) : p.s); return; }
      if (p.t === 'param' && (p.name === '@' || p.name === '*') && !p.op) {
        const params = this.positional;
        if (p.q && p.name === '@') { params.forEach((v, j) => { if (j) close(); quoted(v); }); return; }
        if (p.q) { quoted(params.join(this.ifs().slice(0, 1))); return; }
        params.forEach((v, j) => { if (j) close(); split(v); });
        return;
      }
      const v = p.t === 'param' ? this.param(p) : p.t === 'cmd' ? this.capture(p.body) : String(this.arithmetic(p.expr));
      if (p.q) quoted(v); else split(v);
    });
    close();
    return out;
  }
  glob(fields: readonly Field[]): string[] { return globFields(this.state, fields, this.profile); }
  arithmetic(w: Word): number {
    const src = this.text(w);
    // Fix (E19 batch): set -u also covers a variable an arithmetic expression reads ($((n + 1)), (( count++ ))), as in bash.
    const get = (n: string) => { const v = this.lookup(n); if (v === undefined && this.opts.nounset) this.unbound(n); return v; };
    try { return arith(src, get, (n, v) => this.setVar(n, v)); }
    catch (e) { if (e instanceof ArithError) throw new Expansion(/: value too great for base/.test(e.message) ? e.message : `${src.trim()}: ${e.message}`); throw e; }
  }
  /** $( … ): the list in a subshell, its standard output without the trailing newlines; set -e does not reach inside. */
  capture(body: List): string {
    const buf: Sink = { kind: 'buf', data: '' }, saved = this.fd1;
    this.fd1 = buf;
    this.xlevel++;
    try {
      this.lastSubst = this.subshell(() => { this.opts.errexit = false; return this.list(body); });
    } finally { this.fd1 = saved; this.xlevel--; }
    return buf.data.replace(/\n+$/, '');
  }

  // ------------------------------------------------------------------------------------------------- execution
  subshell(fn: () => number): number {
    const saved = { vars: new Map(this.vars), exported: new Set(this.exported), funcs: new Map(this.funcs), frames: this.frames.map(f => new Map(f)), positional: this.positional,
      opts: { ...this.opts }, state: this.state, loopDepth: this.loopDepth, funcDepth: this.funcDepth, suppress: this.suppress };
    this.sub++;
    let status: number;
    try { status = fn(); }
    catch (e) {
      if (e instanceof Exit || e instanceof Fatal || e instanceof Return) status = e.status;
      else if (e instanceof Break) status = 0;
      else throw e;
    } finally {
      Object.assign(this, { vars: saved.vars, exported: saved.exported, funcs: saved.funcs, frames: saved.frames, positional: saved.positional, opts: saved.opts,
        loopDepth: saved.loopDepth, funcDepth: saved.funcDepth, suppress: saved.suppress });
      this.state = sameShell(this.state, saved.state);
      this.sub--;
    }
    return status;
  }
  quiet<T>(fn: () => T): T { this.suppress++; try { return fn(); } finally { this.suppress--; } }
  list(items: List): number {
    for (const item of items) this.item(item);
    return this.status;
  }
  item(item: Item) {
    if (item.bg) { this.background(item.ao); return; }
    const ao = item.ao, n = ao.rest.length;
    let status = n ? this.quiet(() => this.pipeline(ao.first)) : this.pipeline(ao.first), ranLast = n === 0, last = ao.first;
    ao.rest.forEach((r, i) => {
      if ((r.op === '&&') !== (status === 0)) return;
      status = i === n - 1 ? this.pipeline(r.p) : this.quiet(() => this.pipeline(r.p));
      ranLast = i === n - 1;
      last = r.p;
    });
    this.status = status;
    // set -e: a failing pipeline that is not tested (if, while, && / || except the last, !) ends a script.
    if (status !== 0 && ranLast && !last.bang && !this.suppress && this.opts.errexit && !(this.interactive && !this.sub)) throw new Exit(status);
  }
  private background(ao: AndOr) {
    const only = !ao.rest.length && ao.first.cmds.length === 1 && ao.first.cmds[0].t === 'simple' ? ao.first.cmds[0] : undefined;
    const argv = only ? this.glob(only.words.flatMap(w => this.fields(w))) : [];
    // E35: kubectl port-forward … & on the kube-net profile is a job too (shell.ts's background).
    const job = argv[0] === 'sleep' || (argv[0] === 'kubectl' && argv[1] === 'port-forward' && this.features.has('kube-net'));
    if (!only || !job || only.redirs.length) { this.err(`${this.where()}模擬環境的背景執行（&）只支援 sleep，例如 sleep 300 &`); this.status = 1; return; }
    const r = background(this.state, [{ argv: argv.map(literalWord), redirects: [] }], this.features);
    this.state = r.state;
    for (const l of r.lines) if (this.interactive || l.kind === 'err') this.write(l.kind === 'out' ? this.fd1 : this.fd2, `${l.text}\n`);
    if (!r.status) this.lastBg = String(r.state.lastPid);
    this.status = r.status;
  }
  pipeline(p: Pipeline): number {
    let status = p.cmds.length === 1 ? this.command(p.cmds[0]) : this.multi(p.cmds);
    if (p.bang) status = status === 0 ? 1 : 0;
    this.status = status;
    return status;
  }
  private multi(cmds: readonly Command[]): number {
    // Expand every simple stage first; when none is a function or builtin, the shell runs the whole pipeline at once.
    const prepared = cmds.map(c => c.t === 'simple' ? this.prepare(c) : null);
    if (prepared.some(p => p === 'failed')) return this.status;
    const ready = prepared as (Prepared | null)[];
    if (ready.every(p => p && p.argv.length && !this.funcs.has(p.argv[0]) && !BUILTINS.includes(p.argv[0]))) {
      const stages: Stage[] = [];
      for (const [i, p] of (ready as Prepared[]).entries()) {
        const s = this.stage(p, (cmds[i] as Extract<Command, { t: 'simple' }>).redirs);
        if (!s) return this.status = 1;
        stages.push(s);
      }
      return this.runShell(stages, this.environment());
    }
    const statuses: number[] = [];
    let input: Input | null = this.stdin;
    cmds.forEach((c, i) => {
      const last = i === cmds.length - 1, buf: Sink = { kind: 'buf', data: '' }, saved = { fd1: this.fd1, stdin: this.stdin };
      if (!last) this.fd1 = buf;
      this.stdin = input;
      try { statuses.push(this.subshell(() => ready[i] ? this.runPrepared(c as Extract<Command, { t: 'simple' }>, ready[i]!) : this.command(c))); }
      finally { this.fd1 = saved.fd1; this.stdin = saved.stdin; }
      input = { text: buf.data, pos: 0 };
    });
    return this.pipeStatus(statuses);
  }
  pipeStatus(statuses: readonly number[]): number {
    if (!this.opts.pipefail) return statuses.at(-1) ?? 0;
    for (let i = statuses.length - 1; i >= 0; i--) if (statuses[i]) return statuses[i];
    return 0;
  }
  command(c: Command): number {
    this.line = c.line;
    try {
      switch (c.t) {
        case 'simple': { const p = this.prepare(c); return p === 'failed' ? this.status : this.runPrepared(c, p); }
        case 'func': this.funcs.set(c.name, c.body); return this.status = 0;
        case 'group': return this.status = this.redirected(c.redirs, () => this.list(c.body));
        case 'subshell': return this.status = this.redirected(c.redirs, () => this.subshell(() => this.list(c.body)));
        case 'if': return this.status = this.redirected(c.redirs, () => {
          for (const arm of c.arms) if (this.quiet(() => this.list(arm.cond)) === 0) return this.list(arm.body);
          return c.orelse ? this.list(c.orelse) : 0;
        });
        case 'while': return this.status = this.redirected(c.redirs, () => this.loop(() => (this.quiet(() => this.list(c.cond)) === 0) !== c.until, () => this.list(c.body)));
        case 'for': return this.status = this.redirected(c.redirs, () => {
          const items = c.words ? this.glob(c.words.flatMap(w => this.fields(w))) : [...this.positional];
          let i = 0;
          return this.loop(() => i < items.length && (this.setVar(c.name, items[i++]), true), () => this.list(c.body));
        });
        case 'cfor': return this.status = this.redirected(c.redirs, () => {
          this.arithmetic(c.init);
          let first = true;
          return this.loop(() => { if (!first) this.arithmetic(c.step); first = false; return !c.cond.parts.length || this.arithmetic(c.cond) !== 0; }, () => this.list(c.body));
        });
        case 'case': return this.status = this.redirected(c.redirs, () => {
          const subject = this.text(c.word);
          for (const arm of c.arms) if (arm.patterns.some(p => segmentRegExp(this.pattern(p)).test(subject))) return this.list(arm.body);
          return 0;
        });
        case 'arith': return this.status = this.redirected(c.redirs, () => this.arithmetic(c.expr) !== 0 ? 0 : 1);
        case 'cond': return this.status = this.redirected(c.redirs, () => {
          try { return this.cond(c.expr) ? 0 : 1; }
          catch (e) { if (e instanceof CondError) { this.err(`${this.where()}${e.message}`); return 2; } throw e; }
        });
      }
    } catch (e) {
      if (e instanceof Expansion) { this.err(`${this.where()}${e.message}`); return this.status = 1; }
      throw e;
    }
  }
  private loop(more: () => boolean, body: () => number): number {
    let status = 0;
    this.loopDepth++;
    try {
      for (;;) {
        this.tick();
        if (!more()) break;
        try { status = body(); }
        catch (e) {
          if (!(e instanceof Break)) throw e;
          if (e.n > 1) { e.n--; throw e; }
          if (e.cont) continue;
          break;
        }
      }
    } finally { this.loopDepth--; }
    return status;
  }
  private cond(c: Cond): boolean {
    switch (c.t) {
      case 'and': return this.cond(c.a) && this.cond(c.b);
      case 'or': return this.cond(c.a) || this.cond(c.b);
      case 'not': return !this.cond(c.a);
      case 'word': return this.text(c.a) !== '';
      case 'unary': {
        const a = this.text(c.a);
        if (c.op === '-v') return this.lookup(a) !== undefined;
        return unaryTest(this.state, c.op, a);
      }
      case 'binary': {
        const a = this.text(c.a);
        if (c.op === '==' || c.op === '=' || c.op === '!=') return segmentRegExp(this.pattern(c.b)).test(a) === (c.op !== '!=');
        if (c.op === '=~') {
          const compiled = compilePattern(this.pattern(c.b, true), true);
          if ('error' in compiled) throw new CondError(`${compiled.error}`);
          return new RegExp(compiled.source, 'u').test(a);
        }
        const b = this.text(c.b);
        if (['-eq', '-ne', '-lt', '-le', '-gt', '-ge'].includes(c.op)) {
          const num = (s: string) => arith(s, n => this.lookup(n), (n, v) => this.setVar(n, v));
          try { return binaryTest(c.op, String(num(a)), String(num(b))); }
          catch (e) { if (e instanceof ArithError) throw new CondError(`${a}: ${e.message}`); throw e; }
        }
        try { return binaryTest(c.op, a, b); } catch (e) { throw new CondError((e as Error).message); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------- simple commands
  prepare(c: Extract<Command, { t: 'simple' }>): Prepared | 'failed' {
    this.line = c.line;
    this.tick();
    this.lastSubst = undefined;
    try {
      const assigns = c.assigns.map(a => ({ name: a.name, value: (a.append ? this.lookup(a.name) ?? '' : '') + this.text(a.value) }));
      const argv = this.glob(c.words.flatMap(w => this.fields(w)));
      return { argv, assigns };
    } catch (e) {
      if (e instanceof Expansion) { this.err(`${this.where()}${e.message}`); this.status = 1; return 'failed'; }
      throw e;
    }
  }
  runPrepared(c: Extract<Command, { t: 'simple' }>, p: Prepared): number {
    const { argv, assigns } = p;
    if (this.opts.xtrace) {
      const plus = '+'.repeat(this.xlevel);
      if (!argv.length) assigns.forEach(a => this.write(this.fd2, `${plus} ${a.name}=${xquote(a.value)}\n`));
      else this.write(this.fd2, `${plus} ${[...assigns.map(a => `${a.name}=${xquote(a.value)}`), ...argv.map(xquote)].join(' ')}\n`);
    }
    if (!argv.length) {
      assigns.forEach(a => this.setVar(a.name, a.value));
      const status = this.lastSubst ?? 0;
      return this.status = c.redirs.length ? this.redirected(c.redirs, () => status) : status;
    }
    const name = argv[0];
    if (name === 'exec' && argv.length === 1) return this.status = this.redirected(c.redirs, () => 0, true);
    if (this.funcs.has(name)) return this.status = this.temporary(assigns, () => this.redirected(c.redirs, () => this.call(name, argv.slice(1))));
    if (BUILTINS.includes(name)) return this.status = this.temporary(assigns, () => this.redirected(c.redirs, () => this.builtin(name, argv.slice(1), c)));
    const stage = this.stage({ argv, assigns }, c.redirs);
    if (!stage) return this.status = 1;
    return this.status = this.runShell([stage], this.environment(assigns));
  }
  /** A stage for the shell: literal words (already expanded) and its redirections (here-documents become standard input text). */
  private stage(p: Prepared, redirs: readonly Redir[] = []): Stage | null {
    const redirects: Stage['redirects'] = [];
    for (const r of redirs) {
      const fd = r.fd ?? (r.op.startsWith('<') ? 0 : 1);
      if (r.op === '<<' || r.op === '<<-' || r.op === '<<<') { redirects.push({ op: 'here', word: literalWord(this.hereText(r)) }); continue; }
      const target = this.text(r.target!);
      if (r.op === '>&' || r.op === '<&') {
        if (fd === 2 && target === '1') redirects.push({ op: '2>&1' });
        else if (fd === 1 && target === '2') redirects.push({ op: '>&2' });
        else if (!(fd === 1 && target === '1') && !(fd === 2 && target === '2')) { this.err(`${this.where()}${fd}>&${target}：模擬環境只支援 2>&1 與 >&2`); return null; }
        continue;
      }
      if (fd > 2 || (fd === 0 && r.op !== '<')) { this.err(`${this.where()}模擬環境的重新導向只支援描述子 0、1、2`); return null; }
      if (r.op === '&>' || r.op === '&>>') { redirects.push({ op: r.op === '&>' ? '>' : '>>', word: literalWord(target) }, { op: '2>&1' }); continue; }
      const op = r.op === '<' ? '<' : `${fd === 2 ? '2' : ''}${r.op === '>>' ? '>>' : '>'}`;
      redirects.push({ op, word: literalWord(target) });
    }
    return { argv: p.argv.map(literalWord), redirects };
  }
  hereText(r: Redir): string {
    if (r.op === '<<<') return `${this.text(r.target!)}\n`;
    return r.quoted ? r.body ?? '' : this.text(loose(r.body ?? '', this.line, true));
  }
  /** Runs stages in the shell of shell.ts with the interpreter's standard input, terminal and environment. */
  runShell(stages: Stage[], env: Record<string, string>): number {
    const r = runStages(this.state, stages, this.profile, { stdin: this.stdin ? this.stdin.text.slice(this.stdin.pos) : null, tty: this.fd1.kind === 'out' && this.tty, env, script: this.ctx });
    this.state = r.state;
    if (r.clear && this.fd1.kind === 'out') { this.events = []; this.clear = true; }
    for (const s of r.shown) {
      if (s.kind === 'out') this.write(this.fd1, s.data);
      else this.write(this.fd2, this.interactive && !this.sourceDepth ? s.data : s.data.replace(/^bash: /gm, this.where()));
    }
    return this.pipeStatus(r.statuses);
  }
  /** Prefix assignments of a builtin or function call: only for that call. */
  private temporary(assigns: readonly { name: string; value: string }[], fn: () => number): number {
    if (!assigns.length) return fn();
    const old = assigns.map(a => [a.name, this.lookup(a.name)] as const);
    assigns.forEach(a => this.setVar(a.name, a.value));
    try { return fn(); } finally { for (const [n, v] of old) if (v === undefined) this.unsetVar(n); else this.setVar(n, v); }
  }
  /** Redirections of a builtin, function or compound command (permanent: exec without a command). */
  redirected(redirs: readonly Redir[], fn: () => number, permanent = false): number {
    if (!redirs.length) return fn();
    const saved = { fd1: this.fd1, fd2: this.fd2, stdin: this.stdin }, files: Extract<Sink, { kind: 'file' }>[] = [];
    let result: number | undefined;
    try {
      for (const r of redirs) {
        const fd = r.fd ?? (r.op.startsWith('<') ? 0 : 1);
        if (r.op === '<<' || r.op === '<<-' || r.op === '<<<') { this.stdin = { text: this.hereText(r), pos: 0 }; continue; }
        const target = this.text(r.target!);
        if (r.op === '>&' || r.op === '<&') {
          if (fd === 2 && target === '1') this.fd2 = this.fd1;
          else if (fd === 1 && target === '2') this.fd1 = this.fd2;
          else if (String(fd) !== target) { this.err(`${this.where()}${fd}>&${target}：模擬環境只支援 2>&1 與 >&2`); return result = 1; }
          continue;
        }
        if (r.op === '<') {
          const read = readPath(this.state, target);
          if ('error' in read) { this.err(`${this.where()}${target}: ${ERROR_TEXT[read.error]}`); return result = 1; }
          this.stdin = { text: read.text, pos: 0 };
          continue;
        }
        if (fd > 2) { this.err(`${this.where()}模擬環境的重新導向只支援描述子 0、1、2`); return result = 1; }
        const nodes = new Map(this.state.nodes), opened = openWrite(nodes, this.state, target, r.op === '>>' || r.op === '&>>');
        if ('error' in opened) { this.err(`${this.where()}${target}: ${OPEN_TEXT[opened.error]}`); return result = 1; }
        this.state = { ...this.state, nodes };
        const sink: Sink = opened.path === null ? { kind: 'null' } : { kind: 'file', path: opened.path, shown: target, data: '' };
        if (sink.kind === 'file') files.push(sink);
        if (r.op === '&>' || r.op === '&>>') { this.fd1 = sink; this.fd2 = sink; } else if (fd === 2) this.fd2 = sink; else this.fd1 = sink;
      }
      return result = fn();
    } finally {
      if (permanent && result === 0) this.kept.push(...files);
      else {
        Object.assign(this, saved);
        this.flush(files);
      }
    }
  }
  flush(files: readonly Extract<Sink, { kind: 'file' }>[]) {
    if (!files.length) return;
    const nodes = new Map(this.state.nodes);
    for (const f of files) {
      const node = nodes.get(f.path);
      if (node?.kind !== 'file' || !f.data) continue;
      const content = (node.content ?? '') + f.data;
      if (content.length > LIMITS.fileLength) { this.err(`${this.where()}${f.shown}: File too large（模擬環境上限 ${LIMITS.fileLength} 字元）`); continue; }
      nodes.set(f.path, { ...node, content });
      f.data = '';
    }
    this.state = { ...this.state, nodes };
  }
  finish() { this.flush(this.kept); this.kept = []; }

  call(name: string, args: string[]): number {
    if (this.funcDepth >= SCRIPT_LIMITS.depth) { this.err(`${this.where()}${name}: maximum function nesting level exceeded (${SCRIPT_LIMITS.depth})`); throw new Fatal(1); }
    const saved = { positional: this.positional, loopDepth: this.loopDepth };
    this.positional = args;
    this.frames.push(new Map());
    this.funcDepth++;
    this.loopDepth = 0;
    try { this.command(this.funcs.get(name)!); return this.status; }
    catch (e) { if (e instanceof Return) return this.status = e.status; throw e; }
    finally { this.positional = saved.positional; this.loopDepth = saved.loopDepth; this.frames.pop(); this.funcDepth--; }
  }

  // ------------------------------------------------------------------------------------------------- builtins
  builtin(name: string, args: string[], c: Extract<Command, { t: 'simple' }>): number {
    const fail = (message: string, status = 1) => { this.err(`${this.where()}${message}`); return status; };
    const number = (text: string | undefined, fallback: number) => text === undefined ? fallback : /^[+-]?\d+$/.test(text) ? Number(text) : undefined;
    if (UNSUPPORTED.includes(name)) return fail(`${name}: 模擬環境的 Bash 不支援 ${name}`, 2);
    switch (name) {
      case ':': return 0;
      case 'read': return this.read(args);
      case 'set': return this.set(args);
      case 'shift': {
        const n = number(args[0], 1);
        if (n === undefined) return fail(`shift: ${args[0]}: numeric argument required`);
        if (n > this.positional.length || n < 0) return fail(`shift: ${n}: shift count out of range`);
        this.positional = this.positional.slice(n);
        return 0;
      }
      case 'local': case 'declare': case 'typeset': case 'export': case 'readonly': {
        const flags = args.filter(a => /^[-+][a-zA-Z]+$/.test(a)).join(''), names = args.filter(a => !/^[-+][a-zA-Z]+$/.test(a));
        if (/[aA]/.test(flags)) return fail(`${name}: 模擬環境的 Bash 不支援陣列`, 2);
        if (name === 'local' && !this.funcDepth) return fail('local: can only be used in a function');
        const local = name === 'local' || ((name === 'declare' || name === 'typeset') && this.funcDepth > 0);
        const exporting = name === 'export' || flags.includes('x');
        if (!names.length && (name === 'export' || flags.includes('p'))) {
          [...this.exported].sort().forEach(n => { const v = this.lookup(n); if (v !== undefined) this.write(this.fd1, `declare -x ${n}="${v.replace(/(["\\$`])/g, '\\$1')}"\n`); });
          return 0;
        }
        let status = 0;
        for (const a of names) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:(\+?)=([\s\S]*))?$/.exec(a);
          if (!m) { status = fail(`${name}: \`${a}': not a valid identifier`); continue; }
          const [, n, plus, value] = m;
          if (local && !this.frames.at(-1)!.has(n)) this.frames.at(-1)!.set(n, value === undefined ? undefined : '');
          if (value !== undefined) this.setVar(n, (plus ? this.lookup(n) ?? '' : '') + value);
          if (exporting) this.exported.add(n);
        }
        return status;
      }
      case 'unset': {
        const funcs = args[0] === '-f', names = args.filter(a => a !== '-f' && a !== '-v');
        for (const n of names) { if (funcs) this.funcs.delete(n); else this.unsetVar(n); }
        return 0;
      }
      case 'return': {
        if (!this.funcDepth && !this.sourceDepth) return fail("return: can only `return' from a function or sourced script", 2);
        const n = number(args[0], this.status);
        if (n === undefined) { fail(`return: ${args[0]}: numeric argument required`); throw new Return(2); }
        throw new Return(((n % 256) + 256) % 256);
      }
      case 'exit': {
        if (args.length > 1) return fail('exit: too many arguments');
        let n = number(args[0], this.status);
        if (n === undefined) { fail(`exit: ${args[0]}: numeric argument required`); n = 2; }
        n = ((n % 256) + 256) % 256;
        if (this.interactive && !this.sub && !this.sourceDepth) {
          // At the prompt: a remote session ends (E7); the local terminal stays.
          if (!this.state.login) return fail('exit：模擬環境不會關閉這個終端機（用 ssh 登入的遠端工作階段才用 exit 離開）');
          this.logout = n;
        }
        throw new Exit(n);
      }
      case 'break': case 'continue': {
        const n = number(args[0], 1);
        if (n === undefined || n < 1) return fail(`${name}: ${args[0]}: loop count out of range`);
        if (!this.loopDepth) return this.interactive ? 0 : (this.err(`${this.where()}${name}: only meaningful in a \`for', \`while', or \`until' loop`), 0);
        throw new Break(Math.min(n, this.loopDepth), name === 'continue');
      }
      case 'source': case '.': {
        if (!args.length) return fail(`${name}: filename argument required`, 2);
        const read = readPath(this.state, args[0]);
        if ('error' in read) return fail(`${args[0]}: ${ERROR_TEXT[read.error]}`);
        const parsed = parseProgram(read.text);
        const saved = { positional: this.positional, name: this.name, line: this.line };
        if (args.length > 1) this.positional = args.slice(1);
        this.sourceDepth++;
        if (this.sourceDepth > SCRIPT_LIMITS.scripts) { this.sourceDepth--; return fail(`${name}: 模擬環境最多巢狀 ${SCRIPT_LIMITS.scripts} 層`); }
        this.name = args[0];
        try {
          this.list(parsed.items);
          if (parsed.error) { this.err(`${args[0]}: line ${parsed.error.line}: ${parsed.error.message}`); this.status = 2; }
          return this.status;
        } catch (e) { if (e instanceof Return) return this.status = e.status; throw e; }
        finally { this.sourceDepth--; Object.assign(this, saved); }
      }
      case 'eval': {
        const parsed = parseProgram(args.join(' '));
        if (parsed.error) return fail(parsed.error.message, 2);
        return this.list(parsed.items);
      }
      case 'exec': {
        // exec command: the command replaces the shell (the script ends with its status).
        const stage = this.stage({ argv: args, assigns: [] }, c.redirs);
        const status = stage ? this.runShell([stage], this.environment()) : 1;
        throw new Exit(status);
      }
      case 'wait': {
        const jobs = this.state.jobs ?? [];
        this.state = { ...this.state, processes: tableOf(this.state).filter(p => !jobs.some(j => j.pid === p.pid)), jobs: [] };
        return 0;
      }
      case 'command': case 'type': {
        const v = name === 'type' || args[0] === '-v' || args[0] === '-V';
        const names = args[0] === '-v' || args[0] === '-V' ? args.slice(1) : args;
        if (!v) {
          if (!names.length) return 0;
          if (BUILTINS.includes(names[0])) return this.builtin(names[0], names.slice(1), c);
          const stage = this.stage({ argv: names, assigns: [] }, []);
          return stage ? this.runShell([stage], this.environment()) : 1;
        }
        let status = 0;
        for (const n of names) {
          const where = this.funcs.has(n) ? 'function' : BUILTINS.includes(n) || ['cd', 'echo', 'test', '[', 'printf', 'true', 'false', 'pwd', 'kill', 'umask', 'help', 'jobs', 'fg', 'bg'].includes(n) ? 'builtin'
            : (this.profile.commands as readonly string[]).includes(n) ? `/usr/bin/${n}` : scriptInPath(this.state, n, this.environment()) ?? (n.includes('/') && !('error' in readPath(this.state, n)) ? n : undefined);
          if (!where) { status = 1; if (name === 'type') this.err(`${this.where()}type: ${n}: not found`); continue; }
          if (name === 'type') this.write(this.fd1, `${n} is ${where === 'function' ? 'a function' : where === 'builtin' ? 'a shell builtin' : where}\n`);
          else this.write(this.fd1, `${where === 'function' || where === 'builtin' ? n : where}\n`);
        }
        return status;
      }
    }
    return 0;
  }
  private read(args: string[]): number {
    let raw = false, i = 0;
    for (; i < args.length && args[i].startsWith('-') && args[i] !== '-'; i++) {
      const a = args[i];
      if (a === '--') { i++; break; }
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (f === 'r' || f === 's') { raw ||= f === 'r'; continue; }
        if (f === 'p' || f === 't') { if (j + 1 >= a.length) i++; break; }
        if (f === 'a') { this.err(`${this.where()}read: 模擬環境的 Bash 不支援陣列（-a）`); return 2; }
        this.err(`${this.where()}read: -${f}: invalid option`);
        this.err('read: usage: read [-ers] [-a array] [-d delim] [-i text] [-n nchars] [-N nchars] [-p prompt] [-t timeout] [-u fd] [name ...]');
        return 2;
      }
    }
    const names = args.slice(i);
    if (!this.stdin) { this.err(`${this.where()}read: 模擬環境沒有鍵盤輸入：請用 < 檔案、管線（|）或 <<< 提供輸入`); return 1; }
    const input = this.stdin;
    let line = '', eof = false;
    for (;;) {
      const nl = input.text.indexOf('\n', input.pos);
      const piece = nl < 0 ? input.text.slice(input.pos) : input.text.slice(input.pos, nl);
      input.pos = nl < 0 ? input.text.length : nl + 1;
      if (nl < 0) eof = true;
      if (!raw && /(^|[^\\])(\\\\)*\\$/.test(piece) && !eof) { line += piece.slice(0, -1); continue; }
      line += piece;
      break;
    }
    if (eof && !line) { (names.length ? names : ['REPLY']).forEach(n => this.setVar(n, '')); return 1; }
    if (!raw) line = line.replace(/\\(.)/g, '$1');
    if (!names.length) { this.setVar('REPLY', line); return eof ? 1 : 0; }
    const ifs = this.ifs(), white = Array.from(ifs).filter(c => ' \t\n'.includes(c)).join(''), isWhite = (c: string) => white.includes(c), isSep = (c: string) => ifs.includes(c);
    let rest = Array.from(line);
    const trim = (cs: string[]) => { let a = 0, b = cs.length; while (a < b && isWhite(cs[a])) a++; while (b > a && isWhite(cs[b - 1])) b--; return cs.slice(a, b); };
    rest = trim(rest);
    names.forEach((n, k) => {
      if (k === names.length - 1) { this.setVar(n, rest.join('')); return; }
      let j = 0;
      while (j < rest.length && !isSep(rest[j])) j++;
      this.setVar(n, rest.slice(0, j).join(''));
      rest = rest.slice(j);
      if (rest.length && isSep(rest[0]) && !isWhite(rest[0])) rest = rest.slice(1);
      rest = trim(rest);
    });
    return eof ? 1 : 0;
  }
  private set(args: string[]): number {
    const NAMES: Record<string, keyof Options> = { errexit: 'errexit', nounset: 'nounset', pipefail: 'pipefail', xtrace: 'xtrace' };
    const LETTERS: Record<string, keyof Options> = { e: 'errexit', u: 'nounset', x: 'xtrace' };
    if (!args.length) {
      [...this.vars.keys()].sort().forEach(n => { const v = this.vars.get(n)!; this.write(this.fd1, `${n}=${/^[A-Za-z0-9_@%+=:,./-]*$/.test(v) ? v : xquote(v)}\n`); });
      return 0;
    }
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') { this.positional = args.slice(i + 1); return 0; }
      if (a === '-o' || a === '+o') {
        const opt = args[++i];
        if (opt === undefined) { (Object.keys(NAMES) as (keyof Options)[]).forEach(k => this.write(this.fd1, a === '-o' ? `${k.padEnd(15)}\t${this.opts[k] ? 'on' : 'off'}\n` : `set ${this.opts[k] ? '-o' : '+o'} ${k}\n`)); continue; }
        if (!NAMES[opt]) { this.err(`${this.where()}set: ${opt}: invalid option name`); return 2; }
        this.opts[NAMES[opt]] = a === '-o';
        continue;
      }
      if (/^[-+][a-zA-Z]+$/.test(a)) {
        for (const f of a.slice(1)) {
          if (f === 'o') { const opt = args[++i]; if (!opt || !NAMES[opt]) { this.err(`${this.where()}set: ${opt ?? ''}: invalid option name`); return 2; } this.opts[NAMES[opt]] = a[0] === '-'; continue; }
          if (!LETTERS[f]) { this.err(`${this.where()}set: ${a[0]}${f}: invalid option`); this.err('set: usage: set [-abefhkmnptuvxBCEHPT] [-o option-name] [--] [-] [arg ...]'); return 2; }
          this.opts[LETTERS[f]] = a[0] === '-';
        }
        continue;
      }
      this.positional = args.slice(i);
      return 0;
    }
    return 0;
  }
}
class CondError extends Error {}
interface Prepared { argv: string[]; assigns: { name: string; value: string }[] }

// ---------------------------------------------------------------------------------------------------- entry points

const toShown = (e: Ev) => ({ kind: e.fd === 1 ? 'out' as const : 'err' as const, data: e.data });

/** E8: a line at the prompt of the scripting profile: parsed whole (a syntax error runs nothing), variables kept in the state. */
export function runInteractive(state: FsState, input: string, profile: ShellProfile, stdin?: string | null, tty = true): RunResult {
  const parsed = parseProgram(input);
  if (parsed.error) return { state: { ...state, status: 2 }, lines: [{ text: `bash: ${parsed.error.message}`, kind: 'err' }] };
  if (!parsed.items.length) return { state, lines: [] };
  const it = new Interp(state, profile, true, tty, { budget: { steps: SCRIPT_LIMITS.steps }, depth: 0 }, 'bash', [], stdin != null ? { text: stdin, pos: 0 } : null);
  it.init(state.shell);
  it.status = state.status ?? 0;
  parsed.warnings.forEach(w => it.err(`bash: ${w}`));
  let status: number;
  try { it.list(parsed.items); status = it.status; }
  catch (e) {
    if (e instanceof Exit || e instanceof Fatal || e instanceof Return) status = e.status;
    else if (e instanceof Break) status = 0;
    else throw e;
  }
  it.finish();
  const next: FsState = { ...it.state, status, shell: it.memory(), ...it.logout !== undefined ? { logout: it.logout } : {} };
  return { state: next, lines: render(it.events.map(toShown)), ...it.clear ? { clear: true } : {} };
}

interface ScriptOptions {
  name: string; args: readonly string[]; tty: boolean; stdin: string | null; env?: Readonly<Record<string, string>>; parent?: ScriptCtx;
  options?: Partial<Options>; noexec?: boolean;
}
/** E8: runs a script's text as a child process: its own variables, the shared step budget; output as the events of a command. */
export function runScript(state: FsState, source: string, profile: ShellProfile, o: ScriptOptions): Exec {
  const depth = (o.parent?.depth ?? 0) + 1;
  if (depth > SCRIPT_LIMITS.scripts) return { state, events: [{ fd: 2, data: `${o.name}: 模擬環境的指令稿最多巢狀 ${SCRIPT_LIMITS.scripts} 層\n` }], status: 1 };
  const it = new Interp(state, profile, false, o.tty, { budget: o.parent?.budget ?? { steps: SCRIPT_LIMITS.steps }, depth }, o.name, [...o.args], o.stdin !== null ? { text: o.stdin, pos: 0 } : null);
  it.init(undefined, o.env);
  Object.assign(it.opts, o.options ?? {});
  const parsed = parseProgram(source);
  parsed.warnings.forEach(w => it.err(`${o.name}: ${w}`));
  let status = 0, exited = false;
  if (!o.noexec) {
    try { it.list(parsed.items); status = it.status; }
    catch (e) {
      if (e instanceof Exit || e instanceof Fatal) { status = e.status; exited = true; }
      else if (e instanceof Return || e instanceof Break) status = it.status;
      else throw e;
    }
  }
  // bash runs the commands before a syntax error, then reports it (unless the script already exited).
  if (parsed.error && !exited) { it.err(`${o.name}: line ${parsed.error.line}: ${parsed.error.message}`); status = 2; }
  it.finish();
  return { state: it.state, events: it.events, status };
}

/** The options of the shell context a command ran in (shell.ts's Ctx): standard input, terminal, environment, script. */
interface ParentCtx { stdin: string | null; tty: boolean; env?: Readonly<Record<string, string>>; script?: ScriptCtx }

/** E8: bash and sh: bash [-n] [-x] [-e] [-u] [-o pipefail] script [args…], bash -c 'commands' [name [args…]], or a script on standard input. */
export function runBash(state: FsState, cmd: string, args: readonly string[], ctx: ParentCtx & { profile: ShellProfile }): Exec {
  const fail = (data: string, status: number): Exec => ({ state, events: [{ fd: 2, data: `${data}\n` }], status });
  const options: Partial<Options> = {};
  let i = 0, command: string | undefined, noexec = false;
  for (; i < args.length && /^[-+]/.test(args[i]); i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (a === '-c') { command = args[++i]; if (command === undefined) return fail(`${cmd}: -c: option requires an argument`, 2); i++; break; }
    if (a === '-o' || a === '+o') { const n = args[++i]; if (n === 'pipefail' || n === 'errexit' || n === 'nounset' || n === 'xtrace') options[n] = a === '-o'; else return fail(`${cmd}: ${n ?? ''}: invalid option name`, 2); continue; }
    for (const f of a.slice(1)) {
      if (f === 'e') options.errexit = a[0] === '-';
      else if (f === 'u') options.nounset = a[0] === '-';
      else if (f === 'x') options.xtrace = a[0] === '-';
      else if (f === 'n') noexec = true;
      else return fail(`${cmd}: -${f}: invalid option`, 2);
    }
  }
  const rest = args.slice(i);
  const run = (source: string, name: string, positional: readonly string[], stdin: string | null) =>
    runScript(state, source, ctx.profile, { name, args: positional, tty: ctx.tty, stdin, env: ctx.env, parent: ctx.script, options, noexec });
  if (command !== undefined) return run(command, rest[0] ?? cmd, rest.slice(1), ctx.stdin);
  if (!rest.length) {
    if (ctx.stdin !== null) return run(ctx.stdin, cmd, [], null);
    return fail(`${cmd}: 模擬環境不能開新的互動式 Shell；請用 ${cmd} 指令稿 或 ${cmd} -c '指令'`, 1);
  }
  const read = readPath(state, rest[0]);
  if ('error' in read) return fail(`${cmd}: ${rest[0]}: ${ERROR_TEXT[read.error]}`, read.error === 'ENOENT' ? 127 : 126);
  return run(read.text, rest[0], rest.slice(1), ctx.stdin);
}

const BASHES = ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh', '/bin/dash', '/usr/bin/dash'];
/** E8: an executable file run by its path: a bash or sh shebang runs in the interpreter; anything else is explained. */
export function runExecutable(state: FsState, real: string, shown: string, args: readonly string[], ctx: ParentCtx & { profile: ShellProfile }): Exec {
  const fail = (data: string, status = 126): Exec => ({ state, events: [{ fd: 2, data: `bash: ${shown}: ${data}\n` }], status });
  const read = readPath(state, real);
  if ('error' in read) return fail(ERROR_TEXT[read.error]);
  const first = read.text.split('\n')[0];
  if (!first.startsWith('#!')) return fail('模擬環境只直譯以 #!/bin/bash 或 #!/bin/sh 開頭的指令稿（這個檔案沒有 #!，可能是程式檔）');
  const words = first.slice(2).trim().split(/\s+/);
  if (first.endsWith('\r')) return fail(`${words[0].replace(/\r$/, '')}^M: bad interpreter: No such file or directory`);
  const [prog, ...flags] = words, viaEnv = prog === '/usr/bin/env' || prog === '/bin/env';
  const interpreter = viaEnv ? flags.shift() ?? '' : prog;
  const bash = viaEnv ? ['bash', 'sh', 'dash'].includes(interpreter) : BASHES.includes(interpreter);
  if (!bash) {
    const exists = state.nodes.has(physicalPath(state.nodes, prog, true)) && !viaEnv;
    return exists || viaEnv ? fail(`模擬環境只直譯 Bash 指令稿（${first}）`) : fail(`${prog}: bad interpreter: No such file or directory`);
  }
  const options: Partial<Options> = {};
  for (const f of flags) if (/^-[eux]+$/.test(f)) for (const c of f.slice(1)) options[c === 'e' ? 'errexit' : c === 'u' ? 'nounset' : 'xtrace'] = true;
  return runScript(state, read.text, ctx.profile, { name: shown, args, tty: ctx.tty, stdin: ctx.stdin, env: ctx.env, parent: ctx.script, options });
}

/** E8: a script found by name in PATH (a file starting with #! in one of its folders), or undefined. */
export function scriptInPath(state: FsState, name: string, env?: Readonly<Record<string, string>>): string | undefined {
  if (!name || name.includes('/')) return undefined;
  for (const dir of (env?.PATH ?? DEFAULT_PATH).split(':')) {
    if (!dir.startsWith('/')) continue;
    const path = `${dir}/${name}`, node = state.nodes.get(physicalPath(state.nodes, path, true));
    if (node?.kind === 'file' && (node.mode & 0o111) && (node.content ?? '').startsWith('#!')) return path;
  }
  return undefined;
}

/** E8: a text run as `sh -c` would (flock -c, cron jobs): a child with its own variables. */
export function runText(state: FsState, source: string, profile: ShellProfile, o: { name?: string; env?: Readonly<Record<string, string>>; stdin?: string | null; parent?: ParentCtx }): Exec {
  return runScript(state, source, profile, { name: o.name ?? 'sh', args: [], tty: false, stdin: o.stdin ?? null, env: o.env ?? o.parent?.env, parent: o.parent?.script });
}

/** E8: runs `fn` as another user (that user's home, groups and a working directory), then restores the session's identity. */
export function asUser<T extends { state: FsState }>(state: FsState, user: string, cwd: string | undefined, fn: (s: FsState) => T): T {
  const acc = accountsOf(state), u = findUser(acc, user);
  const home = u?.home ?? (user === 'root' ? '/root' : `/home/${user}`);
  const at = cwd ?? (state.nodes.get(physicalPath(state.nodes, home, true))?.kind === 'dir' ? home : '/');
  const r = fn({ ...state, user, home, cwd: resolvePath({ cwd: '/', home }, at), groups: loginGroups(acc, user), umask: 0o022 });
  return { ...r, state: { ...r.state, user: state.user, home: state.home, cwd: state.cwd, ...state.groups ? { groups: state.groups } : {}, ...state.umask !== undefined ? { umask: state.umask } : {} } };
}

/**
 * E8 → E6: what systemd runs for a Type=oneshot service whose ExecStart= is a bash script (or bash/sh with a script): the
 * script runs as User= in / with systemd's PATH; its output lines go to the journal. Undefined when it is not a script.
 */
export function serviceScript(profile: ShellProfile, program?: (state: FsState, line: string, user: string) => { state: FsState; lines: string[]; status: number; id: string } | undefined) {
  return (state: FsState, line: string, user: string): { state: FsState; lines: string[]; status: number; id: string } | undefined => {
    // E13: a program the simulation runs itself (certbot.service's /usr/bin/certbot -q renew).
    const own = program?.(state, line, user);
    if (own) return own;
    const words = line.replace(/^[-@+!:]+/, '').split(/\s+/).filter(Boolean);
    if (!words.length) return undefined;
    let [prog, ...args] = words;
    if (BASHES.includes(prog) && args[0] && !args[0].startsWith('-')) [prog, ...args] = args;
    const node = state.nodes.get(physicalPath(state.nodes, prog, true));
    if (node?.kind !== 'file' || !(node.content ?? '').startsWith('#!')) return undefined;
    const r = asUser(state, user, '/', s => runExecutable(s, physicalPath(s.nodes, prog, true), prog, args, { profile, tty: false, stdin: null, env: { PATH: DEFAULT_PATH, LANG: 'C.UTF-8' } }));
    const text = r.events.map(e => e.data).join('');
    return { state: r.state, lines: text.split('\n').filter((l, i, all) => l || i < all.length - 1), status: r.status, id: baseName(prog) };
  };
}

/** E8 (lesson validation): the problems of a script's syntax (empty when it parses). */
export function scriptSyntax(source: string): string | null {
  const p = parseProgram(source);
  return p.error ? `line ${p.error.line}: ${p.error.message}` : null;
}

export type { Line };
