/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): the lexer of Go's text/template (Go 1.22, which Helm v3.16 is
 * built with), written after text/template/parse/lex.go: text and actions between {{ and }}, the trim markers "{{- " and
 * " -}}" (a dash next to a space), comments {{/* … *\/}}, and inside actions spaces, | ( ) := = , strings, raw strings,
 * character constants, numbers, .fields, $variables, identifiers and keywords. Positions are offsets in the text, lines
 * count from 1; a lexical error is the last item (its value is Go's message).
 */

export type ItemType = 'text' | 'left' | 'right' | 'space' | 'pipe' | 'lparen' | 'rparen' | 'declare' | 'assign' | 'string' | 'raw' | 'charconst' | 'number'
  | 'field' | 'variable' | 'ident' | 'bool' | 'char' | 'eof' | 'error'
  | 'block' | 'break' | 'continue' | 'dot' | 'define' | 'else' | 'end' | 'if' | 'nil' | 'range' | 'template' | 'with';
export interface Item { typ: ItemType; val: string; pos: number; line: number }
const KEYWORDS: readonly ItemType[] = ['block', 'break', 'continue', 'define', 'else', 'end', 'if', 'nil', 'range', 'template', 'with'];
/** Items whose String() is <val> (Go: the keywords, . and nil). */
const ANGLED: readonly ItemType[] = [...KEYWORDS, 'dot'];
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r' || c === '\n';
const isAlnum = (c: string | undefined) => !!c && /[\p{L}\p{Nd}_]/u.test(c);

/** Go's %#U of a character (U+007D '}'). */
export const goRune = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} '${c}'`;
/** item.String() as parse errors print it. */
export function itemText(i: Item): string {
  if (i.typ === 'eof') return 'EOF';
  if (i.typ === 'error') return i.val;
  if (ANGLED.includes(i.typ)) return `<${i.val}>`;
  const q = (s: string) => JSON.stringify(s);
  return i.val.length > 10 ? `${q(i.val.slice(0, 10))}...` : q(i.val);
}

export function lex(input: string): Item[] {
  const items: Item[] = [];
  let pos = 0, start = 0, line = 1, startLine = 1, paren = 0;
  const emit = (typ: ItemType) => { items.push({ typ, val: input.slice(start, pos), pos: start, line: startLine }); start = pos; startLine = line; };
  const fail = (msg: string) => { items.push({ typ: 'error', val: msg, pos: start, line: startLine }); return items; };
  const advance = (n: number) => { for (let k = 0; k < n; k++) if (input[pos++] === '\n') line++; };
  const ignore = () => { start = pos; startLine = line; };
  /** At " -}}" (whitespace, a dash, the delimiter) or "}}": [is, trims]. */
  const atRight = (): [boolean, boolean] => isSpace(input[pos]) && input[pos + 1] === '-' && input.startsWith('}}', pos + 2) ? [true, true] : input.startsWith('}}', pos) ? [true, false] : [false, false];
  const skipSpace = () => { while (isSpace(input[pos])) advance(1); };
  for (;;) {
    // Text up to the next {{.
    const at = input.indexOf('{{', pos);
    if (at < 0) { advance(input.length - pos); if (pos > start) emit('text'); items.push({ typ: 'eof', val: '', pos, line }); return items; }
    const trimLeft = input[at + 2] === '-' && isSpace(input[at + 3]);
    let end = at;
    if (trimLeft) while (end > start && isSpace(input[end - 1])) end--;
    if (end > start) { advance(end - pos); emit('text'); }
    advance(at - pos); ignore();
    const after = at + 2 + (trimLeft ? 2 : 0);
    if (input.startsWith('/*', after)) {
      // A comment: /* … */ right after the delimiter (and its trim marker), then the closing delimiter.
      advance(after - pos); ignore();
      const close = input.indexOf('*/', pos + 2);
      if (close < 0) return fail('unclosed comment');
      advance(close + 2 - pos);
      const [is, trims] = atRight();
      if (!is) return fail('comment ends before closing delimiter');
      advance(trims ? 4 : 2);
      if (trims) skipSpace();
      ignore();
      continue;
    }
    advance(2); emit('left');
    if (trimLeft) { advance(2); ignore(); }
    // Inside the action.
    for (;;) {
      const [is, trims] = atRight();
      if (is) {
        if (paren > 0) return fail('unclosed left paren');
        if (trims) { advance(1); ignore(); }
        advance(trims ? 3 : 2);
        emit('right');
        if (trims) { skipSpace(); ignore(); }
        break;
      }
      const c = input[pos];
      if (c === undefined) { ignore(); return fail('unclosed action'); }
      if (isSpace(c)) {
        let n = 0;
        while (isSpace(input[pos]) && !(input[pos + 1] === '-' && input.startsWith('}}', pos + 2))) { advance(1); n++; }
        if (isSpace(input[pos]) && input[pos + 1] === '-' && input.startsWith('}}', pos + 2)) { if (n === 0) continue; }
        if (n > 0) emit('space');
        continue;
      }
      advance(1);
      if (c === '=') emit('assign');
      else if (c === ':') { if (input[pos] !== '=') return fail('expected :='); advance(1); emit('declare'); }
      else if (c === '|') emit('pipe');
      else if (c === '"') {
        for (;;) {
          const d = input[pos];
          if (d === '\\') { advance(1); if (input[pos] === undefined || input[pos] === '\n') return fail('unterminated quoted string'); advance(1); continue; }
          if (d === undefined || d === '\n') return fail('unterminated quoted string');
          advance(1);
          if (d === '"') break;
        }
        emit('string');
      } else if (c === '`') {
        const close = input.indexOf('`', pos);
        if (close < 0) return fail('unterminated raw quoted string');
        advance(close + 1 - pos);
        emit('raw');
      } else if (c === '$') {
        while (isAlnum(input[pos])) advance(1);
        if (!terminator()) return fail(`bad character ${goRune(input[pos])}`);
        emit('variable');
      } else if (c === "'") {
        for (;;) {
          const d = input[pos];
          if (d === '\\') { advance(2); continue; }
          if (d === undefined || d === '\n') return fail('unterminated character constant');
          advance(1);
          if (d === "'") break;
        }
        emit('charconst');
      } else if (c === '.' && !/[0-9]/.test(input[pos] ?? '')) {
        while (isAlnum(input[pos])) advance(1);
        if (!terminator()) return fail(`bad character ${goRune(input[pos])}`);
        emit(pos - start === 1 ? 'dot' : 'field');
      } else if (c === '.' || c === '+' || c === '-' || /[0-9]/.test(c)) {
        pos--; start = pos;
        if (!scanNumber()) return fail(`bad number syntax: ${JSON.stringify(input.slice(start, pos))}`);
        emit('number');
      } else if (isAlnum(c)) {
        while (isAlnum(input[pos])) advance(1);
        if (!terminator()) return fail(`bad character ${goRune(input[pos])}`);
        const word = input.slice(start, pos);
        emit(KEYWORDS.includes(word as ItemType) ? word as ItemType : word === 'true' || word === 'false' ? 'bool' : 'ident');
      } else if (c === '(') { emit('lparen'); paren++; }
      else if (c === ')') { emit('rparen'); paren--; if (paren < 0) return fail('unexpected right paren'); }
      else if (c.charCodeAt(0) < 0x7f && c >= ' ') emit('char');
      else return fail(`unrecognized character in action: ${goRune(c)}`);
    }
  }
  function terminator(): boolean {
    const c = input[pos];
    if (c === undefined || isSpace(c) || '.,|:)('.includes(c)) return true;
    return input.startsWith('}}', pos);
  }
  function scanNumber(): boolean {
    const accept = (set: string) => { if (input[pos] !== undefined && set.includes(input[pos])) { pos++; return true; } return false; };
    const run = (set: string) => { while (input[pos] !== undefined && set.includes(input[pos])) pos++; };
    accept('+-');
    let digits = '0123456789_';
    if (accept('0')) { if (accept('xX')) digits = '0123456789abcdefABCDEF_'; else if (accept('oO')) digits = '01234567_'; else if (accept('bB')) digits = '01_'; }
    run(digits);
    if (accept('.')) run(digits);
    if (digits.length === 11 && accept('eE')) { accept('+-'); run('0123456789_'); }
    accept('i');
    if (isAlnum(input[pos])) { pos++; return false; }
    return true;
  }
}
