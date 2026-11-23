/**
 * CICD-3 (2026-11-24): typing a here-document in the lesson terminal. The terminal's input is one line, so a line that
 * opens here-documents (`cat > f <<'EOF'`) starts a continuation: the following lines are collected (shown after a `> `
 * prompt, as Bash does) until each delimiter line, and the whole text runs as one command. Only machines whose profile
 * has the scripting feature (engine stage E8, where the interpreter reads here-documents) continue; on the others the
 * line runs as it is, as before.
 */
export interface OpenHeredoc { delimiter: string; strip: boolean }

/** The here-documents a line opens, in order (`<<` and `<<-`, quoted or not; `<<<` here-strings and quoted text skipped). */
export function openHeredocs(line: string): OpenHeredoc[] {
  const out: OpenHeredoc[] = [];
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; else if (c === '\\' && quote === '"') i++; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    if (c !== '<' || line[i + 1] !== '<' || line[i + 2] === '<' || line[i - 1] === '<') continue;
    const m = /^<<(-?)[ \t]*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/.exec(line.slice(i));
    if (!m) continue;
    out.push({ delimiter: m[2] ?? m[3] ?? m[4], strip: m[1] === '-' });
    i += m[0].length - 1;
  }
  return out;
}

/** Whether a collected line ends the here-document (`<<-` also strips leading tabs before comparing). */
export const closesHeredoc = (line: string, open: OpenHeredoc) => (open.strip ? line.replace(/^\t+/, '') : line) === open.delimiter;
