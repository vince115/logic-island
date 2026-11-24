import { itemText, lex, type Item } from './helm-tpl-lex';
import { argText, unquoteGo } from './helm-tpl-node';
import type { Arg, Cmd, Node, Pipe, Tree } from './helm-tpl-node';

/*
 * Engine stage E39 (docs/curriculum/KUB0_E39_HELM.md §2): the parser of Go's text/template, after parse.go: a file's
 * text becomes its tree and the trees of its {{define}}s (and {{block}}s) in the set; functions must exist and variables
 * be declared when parsed; errors are Go's "template: NAME:LINE: message" (a later file's define replaces an earlier one,
 * a second define of a name in one file is an error).
 */

export class ParseError extends Error {}

export function parseInto(set: Map<string, Tree>, name: string, text: string, funcs: ReadonlySet<string>): void {
  const items = lex(text), defs: Tree[] = [];
  let p = 0, last: Item = items[0], vars: string[] = ['$'], rangeDepth = 0, actionLine = 0;
  const next = () => { last = items[p] ?? last; if (p < items.length) p++; return last; };
  const peek = () => items[p] ?? items[items.length - 1];
  const nextNonSpace = () => { let t = next(); while (t.typ === 'space') t = next(); return t; };
  const peekNonSpace = () => { const t = nextNonSpace(); p--; return t; };
  const fail = (msg: string): never => { throw new ParseError(`template: ${name}:${last.line}: ${msg}`); };
  const unexpected = (t: Item, context: string): never => {
    if (t.typ === 'error') {
      let extra = actionLine && actionLine !== t.line ? ` in action started at ${name}:${actionLine}` : '';
      if (extra && t.val.endsWith(' action')) extra = extra.slice(' in action'.length);
      return fail(`${t.val}${extra}`);
    }
    return fail(`unexpected ${itemText(t)} in ${context}`);
  };
  const expect = (typ: Item['typ'], context: string) => { const t = nextNonSpace(); if (t.typ !== typ) unexpected(t, context); return t; };

  type Ctl = Node | { k: 'end'; pos: number } | { k: 'else'; pos: number };
  function itemList(): { list: Node[]; end: Ctl } {
    const list: Node[] = [];
    while (peekNonSpace().typ !== 'eof') {
      const n = textOrAction();
      if (n.k === 'end' || n.k === 'else') return { list, end: n };
      list.push(n as Node);
    }
    return fail('unexpected EOF');
  }
  function textOrAction(): Ctl {
    const t = nextNonSpace();
    if (t.typ === 'text') return { k: 'text', pos: t.pos, text: t.val };
    if (t.typ !== 'left') return unexpected(t, 'input');
    actionLine = t.line;
    try { return action(); } finally { actionLine = 0; }
  }
  function action(): Ctl {
    const t = nextNonSpace();
    switch (t.typ) {
      case 'block': return blockControl();
      case 'break': case 'continue': {
        const r = nextNonSpace();
        if (r.typ !== 'right') unexpected(r, `{{${t.typ}}}`);
        if (!rangeDepth) fail(`{{${t.typ}}} outside {{range}}`);
        return { k: t.typ, pos: t.pos, line: t.line };
      }
      case 'else': {
        if (peekNonSpace().typ === 'if') return { k: 'else', pos: peekNonSpace().pos };
        return { k: 'else', pos: expect('right', 'else').pos };
      }
      case 'end': return { k: 'end', pos: expect('right', 'end').pos };
      case 'if': case 'range': case 'with': return control(t.typ, t);
      case 'template': {
        const nameTok = nextNonSpace(), tname = templateName(nameTok, 'template clause');
        let pipe: Pipe | undefined;
        if (nextNonSpace().typ !== 'right') { p--; pipe = pipeline('template clause', 'right'); }
        return { k: 'template', pos: t.pos, line: t.line, name: tname, pipe };
      }
    }
    p--;
    const first = peek();
    return { k: 'action', pos: first.pos, line: first.line, pipe: pipeline('command', 'right') };
  }
  function templateName(t: Item, context: string): string {
    if (t.typ !== 'string' && t.typ !== 'raw') return unexpected(t, context);
    const s = unquoteGo(t.val);
    return s ?? fail(`invalid syntax`);
  }
  function blockControl(): Node {
    const t = last, nameTok = nextNonSpace(), bname = templateName(nameTok, 'block clause'), pipe = pipeline('block clause', 'right');
    const saved = vars;
    vars = ['$'];
    const { list, end } = itemList();
    vars = saved;
    if (end.k !== 'end') fail(`unexpected {{else}} in block clause`);
    defs.push({ name: bname, parseName: name, text, root: list });
    return { k: 'template', pos: t.pos, line: t.line, name: bname, pipe };
  }
  function control(kind: 'if' | 'range' | 'with', t: Item): Node {
    const mark = vars.length;
    try {
      const pipe = pipeline(kind, 'right');
      if (kind === 'range') rangeDepth++;
      const body = itemList();
      if (kind === 'range') rangeDepth--;
      let elseList: Node[] | undefined;
      if (body.end.k === 'else') {
        if (kind === 'if' && peekNonSpace().typ === 'if') { const i = nextNonSpace(); elseList = [control('if', i)]; }
        else {
          const e = itemList();
          if (e.end.k !== 'end') fail(`expected end; found {{else}}`);
          elseList = e.list;
        }
      }
      return { k: kind, pos: pipe.pos, line: pipe.line, pipe, list: body.list, ...elseList ? { elseList } : {} };
    } finally { vars = vars.slice(0, mark); }
  }
  function pipeline(context: string, end: 'right' | 'rparen'): Pipe {
    const first = peekNonSpace(), pipe: Pipe = { pos: first.pos, line: first.line, decl: [], assign: false, cmds: [] };
    for (;;) {
      const v = peekNonSpace();
      if (v.typ !== 'variable') break;
      const at = p;
      nextNonSpace();
      const n = peekNonSpace();
      if (n.typ === 'assign' || n.typ === 'declare') {
        pipe.assign = n.typ === 'assign';
        nextNonSpace();
        pipe.decl.push(v.val);
        vars.push(v.val);
        break;
      }
      if (n.typ === 'char' && n.val === ',') {
        nextNonSpace();
        pipe.decl.push(v.val); vars.push(v.val);
        if (context === 'range' && pipe.decl.length < 2 && ['variable', 'right', 'rparen'].includes(peekNonSpace().typ)) continue;
        if (context === 'range' && pipe.decl.length < 2) fail('range can only initialize variables');
        fail(`too many declarations in ${context}`);
      }
      p = at;
      break;
    }
    for (;;) {
      const t = nextNonSpace();
      if (t.typ === end) {
        if (!pipe.cmds.length) fail(`missing value for ${context}`);
        pipe.cmds.slice(1).forEach((c, i) => { if (['bool', 'dot', 'nil', 'num', 'str'].includes(c.args[0].k)) fail(`non executable command in pipeline stage ${i + 2}`); });
        return pipe;
      }
      if (['bool', 'charconst', 'dot', 'field', 'ident', 'number', 'nil', 'raw', 'string', 'variable', 'lparen'].includes(t.typ)) { p--; pipe.cmds.push(command()); continue; }
      unexpected(t, context);
    }
  }
  function command(): Cmd {
    const cmd: Cmd = { pos: peekNonSpace().pos, args: [] };
    for (;;) {
      peekNonSpace();
      const o = operand();
      if (o) cmd.args.push(o);
      const t = next();
      if (t.typ === 'space') continue;
      if (t.typ === 'right' || t.typ === 'rparen') p--;
      else if (t.typ !== 'pipe') unexpected(t, 'operand');
      break;
    }
    if (!cmd.args.length) fail('empty command');
    return cmd;
  }
  function operand(): Arg | null {
    const node = term();
    if (!node || peek().typ !== 'field') return node;
    const pos = peek().pos, fields: string[] = [];
    while (peek().typ === 'field') fields.push(next().val.slice(1));
    if (node.k === 'field' || node.k === 'var') return { ...node, pos, idents: [...node.idents, ...fields] };
    if (['bool', 'str', 'num', 'nil', 'dot'].includes(node.k)) fail(`unexpected . after term ${JSON.stringify(argText(node))}`);
    return { k: 'chain', pos, node, fields };
  }
  function term(): Arg | null {
    const t = nextNonSpace();
    switch (t.typ) {
      case 'ident': if (!funcs.has(t.val)) fail(`function "${t.val}" not defined`); return { k: 'ident', pos: t.pos, name: t.val };
      case 'dot': return { k: 'dot', pos: t.pos };
      case 'nil': return { k: 'nil', pos: t.pos };
      case 'variable': if (!vars.includes(t.val)) fail(`undefined variable "${t.val}"`); return { k: 'var', pos: t.pos, idents: [t.val] };
      case 'field': return { k: 'field', pos: t.pos, idents: [t.val.slice(1)] };
      case 'bool': return { k: 'bool', pos: t.pos, val: t.val === 'true' };
      case 'number': case 'charconst': return number(t);
      case 'lparen': return { k: 'pipe', pos: t.pos, pipe: pipeline('parenthesized pipeline', 'rparen') };
      case 'string': case 'raw': { const s = unquoteGo(t.val); if (s === null) fail('invalid syntax'); return { k: 'str', pos: t.pos, quoted: t.val, text: s! }; }
    }
    p--;
    return null;
  }
  function number(t: Item): Arg {
    if (t.typ === 'charconst') { const s = unquoteGo(`"${t.val.slice(1, -1).replace(/"/g, '\\"')}"`); if (!s || [...s].length !== 1) fail(`malformed character constant: ${t.val}`); return { k: 'num', pos: t.pos, text: t.val, v: s!.codePointAt(0)!, isInt: true }; }
    const text = t.val.replace(/_/g, ''), int = /^[+-]?(0[xX][0-9a-fA-F]+|0[oO]?[0-7]*|0[bB][01]+|[1-9][0-9]*|0)$/.test(text);
    if (int) { const neg = text.startsWith('-'), body = text.replace(/^[+-]/, ''), v = body.startsWith('0') && /^0[0-7]+$/.test(body) ? parseInt(body, 8) : body.startsWith('0o') || body.startsWith('0O') ? parseInt(body.slice(2), 8) : Number(body); return { k: 'num', pos: t.pos, text: t.val, v: neg ? -v : v, isInt: true }; }
    const f = Number(text);
    if (!Number.isFinite(f) || !/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)$/.test(text)) fail(`illegal number syntax: ${JSON.stringify(t.val)}`);
    return { k: 'num', pos: t.pos, text: t.val, v: f, isInt: false };
  }

  // The file: its own tree, and a define at the top level becomes a tree of its own.
  const root: Node[] = [];
  while (peek().typ !== 'eof') {
    if (peek().typ === 'left') {
      const save = p;
      next();
      if (nextNonSpace().typ === 'define') {
        const nameTok = nextNonSpace(), dname = templateName(nameTok, 'define clause');
        expect('right', 'define clause');
        const outer = vars;
        vars = ['$'];
        const { list, end } = itemList();
        vars = outer;
        if (end.k !== 'end') fail('unexpected {{else}} in define clause');
        if (defs.some(d => d.name === dname && !emptyTree(d.root)) && !emptyTree(list)) fail(`template: multiple definition of template "${dname}"`);
        defs.push({ name: dname, parseName: name, text, root: list });
        continue;
      }
      p = save;
    }
    const n = textOrAction();
    if (n.k === 'end' || n.k === 'else') fail(`unexpected {{${n.k}}}`);
    root.push(n as Node);
  }
  set.set(name, { name, parseName: name, text, root });
  for (const d of defs) if (!(set.has(d.name) && emptyTree(d.root))) set.set(d.name, d);
}
/** parse.IsEmptyTree: only text that is all whitespace. */
const emptyTree = (list: readonly Node[]) => list.every(n => n.k === 'text' && !n.text.trim());
