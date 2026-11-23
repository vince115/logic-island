import { gitDate, Graph, sameEntry, subjectOf, walk, type CommitObject, type Entry, type Sha } from './git';
import { type Git, type Repo } from './git-core';
import { fileChanges, patchLines, statLines } from './git-format';
import { has, parseOpts, value, type Opts } from './git-cli';
import { matches, pathspecs } from './git-cli-status';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): git log (the medium format, --oneline, --format, --graph with
 * graph.c's lines, --all, -n, -p, --stat, decorations, ranges, paths) and git show (commits, annotated tags, rev:path).
 * Decorations follow log.decorate=auto: shown when the output is the terminal.
 */

/** Ref names by commit: HEAD first (HEAD -> branch when attached), then every ref in descending order of its full name. */
export function decorations(g: Git, r: Repo): Map<Sha, string[]> {
  const out = new Map<Sha, string[]>();
  const add = (id: Sha | undefined, name: string) => { if (id) out.set(id, [...out.get(id) ?? [], name]); };
  const head = g.head(r), current = g.attached(r) ? r.head : undefined;
  add(head, current ? `HEAD -> ${current.slice('refs/heads/'.length)}` : 'HEAD');
  const names = [...new Set([...r.refs.keys(), ...r.symrefs.keys()])].filter(n => n !== current && n !== 'refs/stash').sort().reverse();
  for (const n of names) {
    const id = g.peel(g.refValue(r, n));
    if (n.startsWith('refs/tags/')) add(id, `tag: ${n.slice('refs/tags/'.length)}`);
    else add(id, n.replace(/^refs\/(heads|remotes)\//, ''));
  }
  return out;
}

const indent = (message: string) => message.replace(/\n$/, '').split('\n').map(l => l ? `    ${l}` : '    ');
const NAMED = ['oneline', 'short', 'medium', 'full', 'fuller', 'raw', 'reference', 'email'];
type Format = { kind: 'medium' } | { kind: 'oneline'; full: boolean } | { kind: 'format'; template: string };

function formatOf(g: Git, o: Opts): Format | undefined {
  if (has(o, 'oneline')) return { kind: 'oneline', full: false };
  const p = value(o, 'format') ?? value(o, 'pretty');
  if (p === undefined || p === 'medium') return { kind: 'medium' };
  if (p === 'oneline') return { kind: 'oneline', full: true };
  const m = /^(t?format):(.*)$/s.exec(p);
  if (m) return { kind: 'format', template: m[2] };
  if (!NAMED.includes(p) && p.includes('%')) return { kind: 'format', template: p };
  g.err(NAMED.includes(p) ? `git log --pretty=${p}：模擬環境只支援 oneline、medium 與 format:` : `fatal: invalid --pretty format: ${p}`);
  return undefined;
}

/** --format's placeholders (%H %h %T %t %P %p %an %ae %ad %cn %ce %cd %s %b %B %d %D %n %%). */
function expand(g: Git, id: Sha, c: CommitObject, template: string, decor: string[] | undefined): string {
  return template.replace(/%(an|ae|ad|cn|ce|cd|H|h|T|t|P|p|s|b|B|d|D|n|%)/g, (_, k: string) => {
    switch (k) {
      case 'H': return id;
      case 'h': return g.abbrev(id);
      case 'T': return c.tree;
      case 't': return g.abbrev(c.tree);
      case 'P': return c.parents.join(' ');
      case 'p': return c.parents.map(p => g.abbrev(p)).join(' ');
      case 'an': return c.author.name;
      case 'ae': return c.author.email;
      case 'ad': return gitDate(c.author.time, c.author.tz);
      case 'cn': return c.committer.name;
      case 'ce': return c.committer.email;
      case 'cd': return gitDate(c.committer.time, c.committer.tz);
      case 's': return subjectOf(c.message);
      case 'b': { const lines = c.message.split('\n'); const blank = lines.findIndex((l, i) => i > 0 && !l.trim()); return blank < 0 ? '' : lines.slice(blank + 1).join('\n'); }
      case 'B': return c.message;
      case 'd': return decor?.length ? ` (${decor.join(', ')})` : '';
      case 'D': return decor?.join(', ') ?? '';
      case 'n': return '\n';
      default: return '%';
    }
  });
}

/** The lines git log prints for one commit (before the graph's prefix). */
function commitLines(g: Git, id: Sha, fmt: Format, decor: string[] | undefined, diff: 'none' | 'patch' | 'stat', first: boolean): string[] {
  const c = g.commit(id), d = decor?.length ? ` (${decor.join(', ')})` : '';
  const out: string[] = [];
  if (fmt.kind === 'oneline') out.push(`${fmt.full ? id : g.abbrev(id)}${d} ${subjectOf(c.message)}`);
  else if (fmt.kind === 'format') out.push(...expand(g, id, c, fmt.template, decor).split('\n'));
  else {
    if (!first) out.push('');
    out.push(`commit ${id}${d}`);
    if (c.parents.length > 1) out.push(`Merge: ${c.parents.map(p => g.abbrev(p)).join(' ')}`);
    out.push(`Author: ${c.author.name} <${c.author.email}>`, `Date:   ${gitDate(c.author.time, c.author.tz)}`, '', ...indent(c.message));
  }
  if (diff !== 'none' && c.parents.length <= 1) {
    const changes = fileChanges(g.files(c.parents[0]), g.files(id));
    const body = diff === 'stat' ? statLines(g, changes) : patchLines(g, changes);
    if (body.length) out.push(...fmt.kind !== 'oneline' ? [''] : [], ...body);
  }
  return out;
}

/** Whether a commit changes one of the paths (a merge: compared with every parent, git's simplification in short). */
function touches(g: Git, id: Sha, specs: readonly string[]): boolean {
  const here = g.files(id), parents = g.commit(id).parents;
  return (parents.length ? parents : [undefined]).every(p => differs(g.files(p), here, specs));
}
function differs(a: Map<string, Entry>, b: Map<string, Entry>, specs: readonly string[]): boolean {
  for (const p of new Set([...a.keys(), ...b.keys()])) if (matches(specs, p) && !sameEntry(a.get(p), b.get(p))) return true;
  return false;
}

const LOG_OPTS = ['oneline', 'graph', 'all', 'decorate', 'no-decorate', 'n|max-count=', 'p|u|patch', 'stat', 'format=', 'pretty=', 'reverse', 'first-parent', 'no-patch|s'];

/** git log [--oneline] [--graph] [--all] [--decorate] [-n N] [-p] [--stat] [--format=…] [修訂… | A..B] [--] [路徑…] */
export function logCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'log', args.map(a => /^-\d+$/.test(a) ? `--max-count=${a.slice(1)}` : a), LOG_OPTS, '[<options>] [<revision-range>] [[--] <path>...]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const fmt = formatOf(g, o);
  if (!fmt) return 128;
  const include: Sha[] = [], exclude: Sha[] = [], paths = [...o.paths ?? []];
  for (const w of o.rest) {
    const range = /^(.*?)\.\.(.*)$/.exec(w);
    const want = range ? [`^${range[1] || 'HEAD'}`, range[2] || 'HEAD'] : [w];
    const ids = want.map(x => ({ neg: x.startsWith('^'), id: g.commitOf(r, x.replace(/^\^/, '')) }));
    if (ids.every(x => x.id) && !paths.length) { for (const x of ids) (x.neg ? exclude : include).push(x.id!); continue; }
    if (!o.paths && !g.nodes.has(g.abs(w))) { g.err(g.badRev(r, w)); return 128; }
    paths.push(w);
  }
  if (has(o, 'all')) include.push(...[...r.refs].filter(([n]) => n !== 'refs/stash').map(([, id]) => g.peel(id)!), ...g.head(r) ? [g.head(r)!] : []);
  if (!include.length) {
    const head = g.head(r);
    if (!head) { g.err(`fatal: your current branch '${g.branch(r) ?? 'HEAD'}' does not have any commits yet`); return 128; }
    include.push(head);
  }
  const specs = paths.length ? pathspecs(g, r, paths) : undefined;
  if (paths.length && !specs) return 128;
  let ids = walk(g.store, include, exclude, has(o, 'graph'));
  if (has(o, 'first-parent')) { const keep = new Set<Sha>(); for (const tip of include) for (let c: Sha | undefined = tip; c && !keep.has(c); c = g.commit(c).parents[0]) keep.add(c); ids = ids.filter(x => keep.has(x)); }
  if (specs) ids = ids.filter(id => touches(g, id, specs));
  const walked = new Set(ids);
  const n = value(o, 'n');
  if (n !== undefined) { if (!/^\d+$/.test(n)) { g.err(`fatal: '${n}': not an integer`); return 128; } ids = ids.slice(0, Number(n)); }
  if (has(o, 'reverse')) ids.reverse();
  const decor = (has(o, 'decorate') || (g.io.tty && !has(o, 'no-decorate'))) ? decorations(g, r) : new Map<Sha, string[]>();
  const diff = has(o, 'p') ? 'patch' : has(o, 'stat') ? 'stat' : 'none';
  if (!has(o, 'graph')) { ids.forEach((id, i) => g.out(...commitLines(g, id, fmt, decor.get(id), diff, i === 0))); return 0; }
  const graph = new Graph(id => g.commit(id).parents.filter(p => walked.has(p)));
  ids.forEach((id, i) => {
    const lines = commitLines(g, id, fmt, decor.get(id), diff, true);
    graph.update(id);
    // The blank line between two commits is drawn with the next commit's columns (graph_show_padding after graph_update).
    if (fmt.kind === 'medium' && i > 0) g.out(graph.paddingLine());
    for (;;) { const l = graph.nextLine(); if (l.commit) { g.out(l.text + lines[0]); break; } g.out(l.text); }
    for (const line of lines.slice(1)) g.out((graph.finished ? graph.paddingLine() : graph.nextLine().text) + line);
    while (!graph.finished) g.out(graph.nextLine().text);
  });
  return 0;
}

/** git show [--stat] [-s] [--oneline] [--format=…] [修訂… | 修訂:路徑] */
export function showCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'show', args, ['stat', 's|no-patch', 'oneline', 'format=', 'pretty=', 'decorate', 'no-decorate'], '[<options>] <object>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const fmt = formatOf(g, o);
  if (!fmt) return 128;
  const decor = (has(o, 'decorate') || (g.io.tty && !has(o, 'no-decorate'))) ? decorations(g, r) : new Map<Sha, string[]>();
  const specs = o.rest.length ? o.rest : ['HEAD'];
  let first = true;
  for (const spec of specs) {
    const colon = spec.indexOf(':');
    if (colon >= 0) {
      const c = g.commitOf(r, spec.slice(0, colon) || 'HEAD');
      let path = spec.slice(colon + 1);
      if (path.startsWith('./') || path.startsWith('../')) path = g.rel(r, g.abs(path)) ?? path;
      const e = c ? g.files(c).get(path) : undefined;
      if (!c) { g.err(`fatal: invalid object name '${spec.slice(0, colon)}'.`); return 128; }
      if (!e) { g.err(`fatal: path '${path}' does not exist in '${spec.slice(0, colon) || 'HEAD'}'`); return 128; }
      const text = g.store.blobText(e.id);
      if (text) g.out(...text.replace(/\n$/, '').split('\n'));
      continue;
    }
    const id = g.rev(r, spec);
    if (!id) {
      if (spec === 'HEAD' && g.head(r) === undefined) { g.err("fatal: your current branch appears to be broken"); return 128; }
      g.err(g.badRev(r, spec));
      return 128;
    }
    const obj = g.store.get(id);
    let commit = id;
    if (obj?.type === 'tag') {
      if (!first) g.out('');
      g.out(`tag ${obj.tag}`, `Tagger: ${obj.tagger.name} <${obj.tagger.email}>`, `Date:   ${gitDate(obj.tagger.time, obj.tagger.tz)}`, '', ...obj.message.replace(/\n$/, '').split('\n'), '');
      commit = g.peel(id)!;
      first = true;
    }
    const diff = has(o, 's') ? 'none' : has(o, 'stat') ? 'stat' : 'patch';
    g.out(...commitLines(g, commit, fmt, decor.get(commit), diff, first));
    first = false;
  }
  return 0;
}
