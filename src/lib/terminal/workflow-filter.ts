/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md §4): GitHub Actions' filter patterns for branches, tags and
 * paths — a matcher of its own, not the shell's glob. `*` is any run of characters except `/`; `**` is any run of
 * characters (and `**` before a slash any number of folders, none included); `?` makes the preceding character (or [set]) optional;
 * `+` repeats it one or more times; `[abc]`, `[a-z]`, `[0-9]` are one character of the set; `\` escapes the next
 * character; a leading `!` makes the pattern negative. Patterns apply in order: the last one that matches decides.
 */

const SPECIAL = /[.^$|(){}\\/+*?[\]]/;
const literal = (ch: string) => (SPECIAL.test(ch) ? `\\${ch}` : ch);
const cache = new Map<string, RegExp>();

/** The regular expression of one pattern (without its leading `!`). */
export function filterRegExp(pattern: string): RegExp {
  const hit = cache.get(pattern);
  if (hit) return hit;
  const atoms: { re: string; quantifiable: boolean }[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) { atoms.push({ re: literal(pattern[++i]), quantifiable: true }); continue; }
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        const slash = pattern[i + 2] === '/' && (i === 0 || pattern[i - 1] === '/');
        atoms.push({ re: slash ? '(?:.*/)?' : '.*', quantifiable: false });
        i += slash ? 2 : 1;
      } else atoms.push({ re: '[^/]*', quantifiable: false });
      continue;
    }
    if ((ch === '?' || ch === '+') && atoms.length && atoms[atoms.length - 1].quantifiable) {
      const last = atoms[atoms.length - 1];
      atoms[atoms.length - 1] = { re: `(?:${last.re})${ch}`, quantifiable: false };
      continue;
    }
    if (ch === '[') {
      const end = pattern.indexOf(']', i + 1), body = end > i + 1 ? pattern.slice(i + 1, end) : '';
      if (body && /^(?:[A-Za-z0-9](?:-[A-Za-z0-9])?)+$/.test(body)) { atoms.push({ re: `[${body}]`, quantifiable: true }); i = end; continue; }
    }
    atoms.push({ re: literal(ch), quantifiable: true });
  }
  const re = new RegExp(`^${atoms.map(a => a.re).join('')}$`);
  if (cache.size > 500) cache.clear();
  cache.set(pattern, re);
  return re;
}

/** Whether a value is included by an ordered list of patterns (a later `!pattern` excludes, a later pattern includes again). */
export function filterMatches(patterns: readonly string[], value: string): boolean {
  let included = false;
  for (const p of patterns) {
    const negative = p.startsWith('!'), body = negative ? p.slice(1) : p;
    if (filterRegExp(body).test(value)) included = !negative;
  }
  return included;
}

/** Whether every pattern of a list is negative (such a list never includes anything). */
export const onlyNegative = (patterns: readonly string[]) => patterns.length > 0 && patterns.every(p => p.startsWith('!'));
