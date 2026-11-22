/*
 * Engine stage E1 (docs/curriculum/LNX0_TERMINAL_CAPABILITY.md §9): pathname expansion the way bash does it by default.
 * A word's pattern marks every quoted character (and every character that could be special) with a backslash, so only
 * unquoted * ? and [...] match. Matches are sorted (C locale), names starting with . match only a pattern part that starts
 * with a literal ., . and .. are never matched (bash 5.2 globskipdots), and a pattern that matches nothing stays as the
 * literal word (no nullglob, no failglob). Pure: the caller says what each folder holds and what exists.
 */

/** Escapes a character for a pattern so that it only matches itself. */
export const escapeGlob = (ch: string) => '\\*?[]'.includes(ch) ? `\\${ch}` : ch;

/** Whether the pattern has an unescaped * ? or [ (a [ without its ] matches itself, as in bash). */
export function hasMagic(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') { i++; continue; }
    if ('*?['.includes(pattern[i])) return true;
  }
  return false;
}

const literal = (pattern: string) => pattern.replace(/\\(.)/gsu, '$1');
const escOut = (ch: string) => /[\\^$.*+?()[\]{}|/]/.test(ch) ? `\\${ch}` : ch;
const escIn = (ch: string) => /[\\\]\[^-]/.test(ch) ? `\\${ch}` : ch;

/** A bracket expression starting at cs[start] ('['): [abc], [a-z], [!a] or [^a]; ] first is literal. Null when it never closes. */
function bracket(cs: string[], start: number): { re: string; end: number } | null {
  let i = start + 1, negate = false, first = true;
  if (cs[i] === '!' || cs[i] === '^') { negate = true; i++; }
  const items: string[] = [];
  while (i < cs.length) {
    let ch = cs[i];
    if (ch === ']' && !first) {
      const body = items.join('');
      return { re: negate ? `[^${body}]` : body ? `[${body}]` : '(?!)', end: i };
    }
    first = false;
    if (ch === '\\' && i + 1 < cs.length) ch = cs[++i];
    if (cs[i + 1] === '-' && i + 2 < cs.length && cs[i + 2] !== ']') {
      let j = i + 2, hi = cs[j];
      if (hi === '\\' && j + 1 < cs.length) hi = cs[++j];
      // A reversed range (z-a) matches nothing, as in bash.
      if (ch.codePointAt(0)! <= hi.codePointAt(0)!) items.push(`${escIn(ch)}-${escIn(hi)}`);
      i = j + 1;
      continue;
    }
    items.push(escIn(ch));
    i++;
  }
  return null;
}

/** The regular expression for one part of a pattern (between slashes). */
export function segmentRegExp(segment: string): RegExp {
  const cs = Array.from(segment);
  let re = '';
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i];
    if (ch === '\\' && i + 1 < cs.length) { re += escOut(cs[++i]); continue; }
    if (ch === '*') { re += '.*'; continue; }
    if (ch === '?') { re += '.'; continue; }
    if (ch === '[') {
      const b = bracket(cs, i);
      if (b) { re += b.re; i = b.end; continue; }
    }
    re += escOut(ch);
  }
  return new RegExp(`^${re}$`, 'su');
}

/** One name against one pattern part, with the leading-dot rule. */
export function matchName(segment: string, name: string): boolean {
  if (name === '.' || name === '..') return false;
  if (name.startsWith('.') && !segment.startsWith('.') && !segment.startsWith('\\.')) return false;
  return segmentRegExp(segment).test(name);
}

export interface GlobIo {
  /** The names in a folder (a path as the learner would type it; '' is the working directory), or null when it is not a readable folder. */
  list(path: string): string[] | null;
  /** Whether the path exists (a dangling link exists). */
  exists(path: string): boolean;
  /** Whether the path is a folder (following links). */
  isDir(path: string): boolean;
}

const join = (at: string, name: string) => !at ? name : at.endsWith('/') ? at + name : `${at}/${name}`;

/**
 * Every path the pattern matches, sorted; [] when nothing matches (the caller then keeps the word). ~ and ~/ at the start
 * become the home folder first, as in bash; a trailing / keeps only folders and stays in the result.
 */
export function expandGlob(pattern: string, home: string, io: GlobIo): string[] {
  let rest = pattern, candidates = [''];
  if (rest === '~' || rest.startsWith('~/')) { candidates = [home]; rest = rest.slice(1); }
  else if (rest.startsWith('/')) candidates = ['/'];
  const parts = rest.split('/');
  const dirOnly = parts.length > 1 && parts.at(-1) === '';
  for (const part of parts) {
    if (!part) continue;
    if (!hasMagic(part)) { candidates = candidates.map(c => join(c, literal(part))); continue; }
    const next: string[] = [];
    for (const c of candidates) for (const name of io.list(c) ?? []) if (matchName(part, name)) next.push(join(c, name));
    candidates = next;
    if (!candidates.length) return [];
  }
  const found = candidates.filter(c => c && io.exists(c));
  return (dirOnly ? found.filter(c => io.isDir(c)).map(c => `${c}/`) : found).sort();
}
