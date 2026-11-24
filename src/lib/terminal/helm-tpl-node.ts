/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): the nodes of a parsed Go template, their String() as error
 * contexts print them (<.Values.image.tag>, <include "web.fullname" .>), Go's strconv.Unquote, and ErrorContext's
 * location (NAME:LINE:COLUMN, the column a 0-based byte offset in its line).
 */

export interface Tree { name: string; parseName: string; text: string; root: Node[] }
export type Node =
  | { k: 'text'; pos: number; text: string }
  | { k: 'action'; pos: number; line: number; pipe: Pipe }
  | { k: 'if' | 'with' | 'range'; pos: number; line: number; pipe: Pipe; list: Node[]; elseList?: Node[] }
  | { k: 'template'; pos: number; line: number; name: string; pipe?: Pipe }
  | { k: 'break' | 'continue'; pos: number; line: number };
export interface Pipe { pos: number; line: number; decl: string[]; assign: boolean; cmds: Cmd[] }
export interface Cmd { pos: number; args: Arg[] }
export type Arg =
  | { k: 'field' | 'var'; pos: number; idents: string[] }
  | { k: 'dot' | 'nil'; pos: number }
  | { k: 'bool'; pos: number; val: boolean }
  | { k: 'num'; pos: number; text: string; v: number; isInt: boolean }
  | { k: 'str'; pos: number; quoted: string; text: string }
  | { k: 'ident'; pos: number; name: string }
  | { k: 'pipe'; pos: number; pipe: Pipe }
  | { k: 'chain'; pos: number; node: Arg; fields: string[] };

export function argText(a: Arg): string {
  switch (a.k) {
    case 'field': return `.${a.idents.join('.')}`;
    case 'var': return a.idents.join('.');
    case 'dot': return '.';
    case 'nil': return 'nil';
    case 'bool': return String(a.val);
    case 'num': return a.text;
    case 'str': return a.quoted;
    case 'ident': return a.name;
    case 'pipe': return `(${pipeText(a.pipe)})`;
    case 'chain': return `${argText(a.node)}.${a.fields.join('.')}`;
  }
}
export const cmdText = (c: Cmd) => c.args.map(argText).join(' ');
export function pipeText(p: Pipe): string {
  const decl = p.decl.length ? `${p.decl.join(', ')} ${p.assign ? '=' : ':='} ` : '';
  return decl + p.cmds.map(cmdText).join(' | ');
}
/** A list of nodes as Go's String() writes them (a range's error context is the whole {{range …}}…{{end}}). */
export function nodesText(list: readonly Node[]): string {
  return list.map(n => {
    switch (n.k) {
      case 'text': return n.text;
      case 'action': return `{{${pipeText(n.pipe)}}}`;
      case 'if': case 'with': case 'range': return `{{${n.k} ${pipeText(n.pipe)}}}${nodesText(n.list)}${n.elseList ? `{{else}}${nodesText(n.elseList)}` : ''}{{end}}`;
      case 'template': return templateText(n);
      default: return `{{${n.k}}}`;
    }
  }).join('');
}
export const templateText = (n: Node & { k: 'template' }) => `{{template ${JSON.stringify(n.name)}${n.pipe ? ` ${pipeText(n.pipe)}` : ''}}}`;

/** ErrorContext's location of an offset in a tree's text: NAME:LINE:COL (COL in bytes from the line's start). */
export function location(tree: Pick<Tree, 'parseName' | 'text'>, pos: number): string {
  const before = tree.text.slice(0, pos), nl = before.lastIndexOf('\n');
  const line = before.split('\n').length, col = new TextEncoder().encode(before.slice(nl + 1)).length;
  return `${tree.parseName}:${line}:${col}`;
}

/** strconv.Unquote of a "…" or `…` literal (null: invalid syntax). */
export function unquoteGo(lit: string): string | null {
  if (lit.startsWith('`')) return lit.endsWith('`') && lit.length >= 2 ? lit.slice(1, -1).replace(/\r/g, '') : null;
  if (!lit.startsWith('"') || !lit.endsWith('"') || lit.length < 2) return null;
  const body = lit.slice(1, -1), map: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" };
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === '\n') return null;
    if (c !== '\\') { out += c; continue; }
    const e = body[++i];
    if (e === undefined) return null;
    if (e in map) { out += map[e]; continue; }
    const hex = (n: number) => { const h = body.slice(i + 1, i + 1 + n); if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(h)) return null; i += n; return parseInt(h, 16); };
    let code: number | null = null;
    if (e === 'x') code = hex(2);
    else if (e === 'u') code = hex(4);
    else if (e === 'U') code = hex(8);
    else if (/[0-7]/.test(e)) { const o = body.slice(i, i + 3); if (!/^[0-7]{3}$/.test(o)) return null; code = parseInt(o, 8); i += 2; }
    if (code === null || code > 0x10ffff) return null;
    out += String.fromCodePoint(code);
  }
  return out;
}
