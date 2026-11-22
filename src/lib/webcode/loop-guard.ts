/*
 * WEB-0: loop protection for the JavaScript a learner writes. The page runs on the same thread as the lesson (a sandboxed
 * frame is not a separate process everywhere), so `while (true) {}` would freeze the whole tab. Before a script goes into
 * the frame, the condition of every `while`, `do … while` and classic `for` loop is wrapped: `while (cond)` becomes
 * `while (__liLoop()&&(cond))`, and `for (a; cond; c)` becomes `for (a; __liLoop()&&(cond); c)`. The harness's
 * `__liLoop` returns true until the loops of one task have run for too long, then throws, which ends the script with an
 * error the learner sees. Nothing else changes: no line is added or moved, so error positions stay where they were, and
 * `for…of`, `for…in` and `for await` are left alone (they end with their collection).
 *
 * This is a tokenizer, not a parser: it knows strings, template literals, comments and regular-expression literals well
 * enough to find loop headers. When it cannot make sense of the source (unterminated string, unbalanced brackets, which
 * is a syntax error anyway) it returns the source unchanged, and the browser reports the error as usual.
 */
export const LOOP_GUARD = '__liLoop';
export const LOOP_MESSAGE = '迴圈執行太久，已被停止（可能是不會結束的迴圈）';
/** How long the loops of one task may run before the guard stops them (milliseconds). */
export const LOOP_BUDGET_MS = 1500;

/** Keywords after which a `/` starts a regular expression, not a division. */
const BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'void', 'delete', 'throw', 'new', 'yield', 'await', 'instanceof']);
const IDENT_START = /[A-Za-z_$\u0080-￿]/, IDENT = /[\w$\u0080-￿]/;

interface Paren { open: number; kind: 'while' | 'for' | 'if' | null; level: number; semis: number[] }

export function guardLoops(source: string): string {
  const inserts: { at: number; text: string }[] = [];
  const parens: Paren[] = [];
  /** Open `{`, `[` and `${`: a template expression's brace returns to the template when it closes. */
  const braces: ('{' | '[' | '${')[] = [];
  const n = source.length;
  let i = 0;
  /** Whether the last token was a value (so a following `/` divides); the keyword waiting for its `(`. */
  let value = false, pending: Paren['kind'] = null, lastDot = false;

  /** Skips a template literal from just after its backtick (or after a `}` that resumes it); false when unterminated. */
  const template = (): boolean => {
    while (i < n) {
      const c = source[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; value = true; return true; }
      if (c === '$' && source[i + 1] === '{') { i += 2; braces.push('${'); value = false; return true; }
      i++;
    }
    return false;
  };

  while (i < n) {
    const c = source[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i); i = end < 0 ? n : end; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); if (end < 0) return source; i = end + 2; continue; }
    const keyword = pending;
    pending = null;
    if (c === '"' || c === "'") {
      i++;
      while (i < n && source[i] !== c) { if (source[i] === '\n') return source; i += source[i] === '\\' ? 2 : 1; }
      if (i >= n) return source;
      i++; value = true; lastDot = false; continue;
    }
    if (c === '`') { i++; if (!template()) return source; lastDot = false; continue; }
    if (c === '/' && !value) {
      // A regular-expression literal: to the unescaped `/` outside a character class, then its flags.
      let inClass = false;
      i++;
      for (;; i++) {
        if (i >= n || source[i] === '\n') return source;
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '[') inClass = true;
        else if (source[i] === ']') inClass = false;
        else if (source[i] === '/' && !inClass) break;
      }
      i++;
      while (i < n && IDENT.test(source[i])) i++;
      value = true; lastDot = false; continue;
    }
    if (IDENT_START.test(c)) {
      const start = i;
      while (i < n && IDENT.test(source[i])) i++;
      const word = source.slice(start, i);
      // A property name (`step.for`, `x.while`) is not a keyword.
      if (lastDot) { value = true; lastDot = false; continue; }
      if (word === 'while' || word === 'for' || word === 'if') { pending = word; value = false; }
      else if (word === 'await' && keyword === 'for') { pending = 'for'; value = false; }
      else value = !BEFORE_REGEX.has(word);
      lastDot = false; continue;
    }
    if (/[0-9]/.test(c)) { while (i < n && /[\w.]/.test(source[i])) i++; value = true; lastDot = false; continue; }
    lastDot = c === '.' && source[i + 1] !== '.' && source[i - 1] !== '.';
    if (c === '(') { parens.push({ open: i, kind: keyword, level: braces.length, semis: [] }); value = false; i++; continue; }
    if (c === ')') {
      const p = parens.pop();
      if (!p) return source;
      if (p.kind === 'while') inserts.push({ at: p.open + 1, text: `${LOOP_GUARD}()&&(` }, { at: i, text: ')' });
      else if (p.kind === 'for' && p.semis.length === 2) {
        const [a, b] = p.semis;
        if (source.slice(a + 1, b).trim() === '') inserts.push({ at: b, text: `${LOOP_GUARD}()` });
        else inserts.push({ at: a + 1, text: `${LOOP_GUARD}()&&(` }, { at: b, text: ')' });
      }
      // After a loop or condition header a statement starts (a `/` there is a regular expression); otherwise a value ended.
      value = p.kind === null;
      i++; continue;
    }
    if (c === '{' || c === '[') { braces.push(c); value = false; i++; continue; }
    if (c === ']') { if (braces.pop() !== '[') return source; value = true; i++; continue; }
    if (c === '}') {
      const open = braces.pop();
      if (open === '${') { i++; if (!template()) return source; continue; }
      if (open !== '{') return source;
      value = false; i++; continue;
    }
    if (c === ';') { const top = parens.at(-1); if (top?.kind === 'for' && top.level === braces.length) top.semis.push(i); }
    // `i++ / 2`: a postfix ++ or -- leaves the value before it a value (a prefix one follows none); `a => /re/` starts a statement.
    if ((c === '+' || c === '-') && source[i + 1] === c) { i += 2; continue; }
    value = false;
    i++;
  }
  if (parens.length || braces.length) return source;
  if (!inserts.length) return source;
  inserts.sort((x, y) => x.at - y.at);
  let out = '', from = 0;
  for (const ins of inserts) { out += source.slice(from, ins.at) + ins.text; from = ins.at; }
  return out + source.slice(from);
}

/** The same protection for the inline scripts of an HTML file (a `<script>` without `src`, classic or module). */
export function guardInlineScripts(html: string): string {
  return html.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi, (whole, open: string, attrs: string, body: string, close: string) => {
    if (/\bsrc\s*=/i.test(attrs)) return whole;
    const type = /\btype\s*=\s*(["']?)([^"'\s>]*)\1/i.exec(attrs)?.[2].toLowerCase();
    if (type && type !== 'module' && type !== 'text/javascript' && type !== 'application/javascript') return whole;
    return `${open}${guardLoops(body)}${close}`;
  });
}
