import { isAncestor, reachable, stripspace, subjectOf, type Sha } from './git';
import { shortRef, validRefName, type Git, type Repo } from './git-core';
import { has, parseOpts, value } from './git-cli';
import { trackingShort } from './git-cli-status';
import { createBranch } from './git-cli-switch';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): git branch (list, -a, -r, -v, -vv, create, -d/-D, -m/-M, -u,
 * --show-current), git tag (lightweight and annotated, -l, -n, -d) and git describe [--tags].
 */

const globRe = (p: string) => new RegExp(`^${p.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

function headName(g: Git, r: Repo): string {
  if (r.op?.kind === 'rebase') return r.op.branch ? `(no branch, rebasing ${r.op.branch})` : `(no branch, rebasing detached HEAD ${g.abbrev(r.op.orig)})`;
  const d = r.detached, head = g.head(r)!;
  return d && d.at === head ? `(HEAD detached at ${d.name})` : d ? `(HEAD detached from ${d.name})` : `(HEAD detached at ${g.abbrev(head)})`;
}

function listBranches(g: Git, r: Repo, o: { all: boolean; remotes: boolean; verbose: number; pattern?: string }): void {
  type Row = { mark: string; name: string; id?: Sha; target?: string; branch?: string };
  const rows: Row[] = [];
  if (!g.attached(r) && g.head(r)) rows.push({ mark: '*', name: headName(g, r), id: g.head(r) });
  const keep = (short: string) => !o.pattern || globRe(o.pattern).test(short);
  if (!o.remotes) for (const [ref, id] of [...r.refs].filter(([k]) => k.startsWith('refs/heads/')).sort(([a], [b]) => a < b ? -1 : 1)) {
    const name = ref.slice('refs/heads/'.length);
    if (keep(name)) rows.push({ mark: r.head === ref ? '*' : ' ', name, id, branch: name });
  }
  if (o.all || o.remotes) {
    const remote = [...new Set([...r.refs.keys(), ...r.symrefs.keys()])].filter(k => k.startsWith('refs/remotes/')).sort();
    for (const ref of remote) {
      const name = o.all ? ref.slice('refs/'.length) : shortRef(ref);
      if (!keep(shortRef(ref))) continue;
      const target = r.symrefs.get(ref);
      rows.push(target ? { mark: ' ', name, target: shortRef(target) } : { mark: ' ', name, id: r.refs.get(ref) });
    }
  }
  const width = Math.max(0, ...rows.filter(x => !x.target).map(x => x.name.length));
  for (const x of rows) {
    if (x.target) { g.out(`${x.mark} ${x.name} -> ${x.target}`); continue; }
    if (!o.verbose) { g.out(`${x.mark} ${x.name}`); continue; }
    let track = '';
    if (x.branch) {
      const t = trackingShort(g, r, x.branch);
      if (t.up) track = o.verbose > 1 ? `[${shortRef(t.up)}${t.text ? `: ${t.text}` : ''}] ` : t.text ? `[${t.text}] ` : '';
    }
    g.out(`${x.mark} ${x.name.padEnd(width)} ${g.abbrev(x.id!)} ${track}${subjectOf(g.commit(x.id!).message)}`);
  }
}

/** git branch [-a|-r] [-v] | 名稱 [起點] | -d|-D 名稱… | -m|-M [舊] 新 | -u 上游 [分支] | --unset-upstream | --show-current */
export function branchCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'branch', args, ['a|all', 'r|remotes', 'v|verbose', 'd|delete', 'D', 'm|move', 'M', 'f|force', 'u|set-upstream-to=', 'unset-upstream', 'show-current', 'l|list', 't|track', 'no-track', 'q|quiet'],
    '[<options>] [-r | -a] [--merged] [--no-merged]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const words = o.rest;
  if (has(o, 'show-current')) { const b = g.branch(r); if (b) g.out(b); return 0; }
  if (has(o, 'd') || has(o, 'D')) {
    if (!words.length) { g.err('fatal: branch name required'); return 128; }
    let code = 0;
    for (const name of words) {
      const ref = has(o, 'r') ? `refs/remotes/${name}` : `refs/heads/${name}`, id = r.refs.get(ref);
      if (!id) { g.err(has(o, 'r') ? `error: remote-tracking branch '${name}' not found` : `error: branch '${name}' not found`); code = 1; continue; }
      if (!has(o, 'r') && r.head === ref) { g.err(`error: cannot delete branch '${name}' used by worktree at '${r.path}'`); code = 1; continue; }
      if (!has(o, 'r') && !has(o, 'D') && !has(o, 'f')) {
        const up = g.upstream(r, name), reference = (up && r.refs.get(up)) || g.head(r);
        if (!reference || !isAncestor(g.store, id, reference)) { g.err(`error: the branch '${name}' is not fully merged`, `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`); code = 1; continue; }
      }
      r.refs.delete(ref);
      for (const k of [...r.config.keys()]) if (!has(o, 'r') && k.startsWith(`branch.${name}.`)) r.config.delete(k);
      g.out(has(o, 'r') ? `Deleted remote-tracking branch ${name} (was ${g.abbrev(id)}).` : `Deleted branch ${name} (was ${g.abbrev(id)}).`);
    }
    return code;
  }
  if (has(o, 'm') || has(o, 'M')) {
    if (!words.length || words.length > 2) { g.err('fatal: branch name required'); return 128; }
    const [from, to] = words.length === 2 ? words : [g.branch(r), words[0]];
    if (!from) { g.err('fatal: cannot rename the current branch while not on any'); return 128; }
    if (!validRefName(to)) { g.err(`fatal: '${to}' is not a valid branch name`); return 128; }
    const id = r.refs.get(`refs/heads/${from}`), current = r.head === `refs/heads/${from}`;
    if (!id && !current) { g.err(`error: refname refs/heads/${from} not found`, 'fatal: branch rename failed'); return 128; }
    if (r.refs.has(`refs/heads/${to}`) && !has(o, 'M') && from !== to) { g.err(`fatal: a branch named '${to}' already exists`); return 128; }
    if (id) { r.refs.delete(`refs/heads/${from}`); r.refs.set(`refs/heads/${to}`, id); }
    for (const [k, v] of [...r.config]) if (k.startsWith(`branch.${from}.`)) { r.config.delete(k); r.config.set(`branch.${to}.${k.slice(`branch.${from}.`.length)}`, v); }
    if (current) r.head = `refs/heads/${to}`;
    return 0;
  }
  const upstream = value(o, 'u');
  if (upstream !== undefined || has(o, 'unset-upstream')) {
    const name = words[0] ?? g.branch(r);
    if (!name || !r.refs.has(`refs/heads/${name}`)) { g.err(`fatal: branch '${name ?? 'HEAD'}' does not exist`); return 128; }
    if (has(o, 'unset-upstream')) {
      if (!r.config.has(`branch.${name}.merge`)) { g.err(`fatal: branch '${name}' has no upstream information`); return 128; }
      r.config.delete(`branch.${name}.remote`); r.config.delete(`branch.${name}.merge`);
      return 0;
    }
    const full = g.dwim(r, upstream!);
    if (!full || !(full.startsWith('refs/remotes/') || full.startsWith('refs/heads/')) || full.endsWith('/HEAD')) { g.err(`fatal: the requested upstream branch '${upstream}' does not exist`); return 128; }
    const [, kind, remote, ...rest] = full.split('/');
    r.config.set(`branch.${name}.remote`, kind === 'heads' ? '.' : remote);
    r.config.set(`branch.${name}.merge`, `refs/heads/${kind === 'heads' ? [remote, ...rest].join('/') : rest.join('/')}`);
    g.out(`branch '${name}' set up to track '${shortRef(full)}'.`);
    return 0;
  }
  if (words.length && !has(o, 'l')) {
    const [name, start = 'HEAD'] = words;
    if (!validRefName(name)) { g.err(`fatal: '${name}' is not a valid branch name`); return 128; }
    if (r.refs.has(`refs/heads/${name}`) && !has(o, 'f')) { g.err(`fatal: a branch named '${name}' already exists`); return 128; }
    if (r.head === `refs/heads/${name}`) { g.err(`fatal: cannot force update the branch '${name}' used by worktree at '${r.path}'`); return 128; }
    const at = g.commitOf(r, start);
    if (!at) { g.err(`fatal: not a valid object name: '${start === 'HEAD' ? g.branch(r) ?? 'HEAD' : start}'`); return 128; }
    createBranch(g, r, name, start, at, has(o, 'no-track') ? false : undefined);
    return 0;
  }
  listBranches(g, r, { all: has(o, 'a'), remotes: has(o, 'r'), verbose: o.flags.get('v')?.length ?? 0, pattern: has(o, 'l') ? words[0] : undefined });
  return 0;
}

/** git tag [-l [樣式]] [-n] | 名稱 [修訂] | -a 名稱 -m 訊息 [修訂] | -d 名稱… */
export function tagCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'tag', args, ['a|annotate', 'm|message=', 'd|delete', 'l|list', 'n', 'f|force'], '[-a | -s | -u <key-id>] [-f] [-m <msg> | -F <file>] <tagname> [<commit> | <object>]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const tags = [...r.refs.keys()].filter(k => k.startsWith('refs/tags/')).map(k => k.slice('refs/tags/'.length)).sort();
  if (has(o, 'd')) {
    let code = 0;
    for (const name of o.rest) {
      const id = r.refs.get(`refs/tags/${name}`);
      if (!id) { g.err(`error: tag '${name}' not found.`); code = 1; continue; }
      r.refs.delete(`refs/tags/${name}`);
      g.out(`Deleted tag '${name}' (was ${g.abbrev(id)})`);
    }
    return code;
  }
  if (!o.rest.length || has(o, 'l')) {
    const pattern = has(o, 'l') ? o.rest[0] : undefined;
    for (const t of tags.filter(t => !pattern || globRe(pattern).test(t))) {
      if (!has(o, 'n')) { g.out(t); continue; }
      const obj = g.store.get(r.refs.get(`refs/tags/${t}`)!);
      g.out(`${t.padEnd(15)} ${obj?.type === 'tag' ? subjectOf(obj.message) : subjectOf(g.commit(g.peel(r.refs.get(`refs/tags/${t}`))!).message)}`);
    }
    return 0;
  }
  const [name, target = 'HEAD'] = o.rest;
  if (!validRefName(name)) { g.err(`fatal: '${name}' is not a valid tag name.`); return 128; }
  if (r.refs.has(`refs/tags/${name}`) && !has(o, 'f')) { g.err(`fatal: tag '${name}' already exists`); return 128; }
  const id = g.rev(r, target);
  if (!id) { g.err(`fatal: Failed to resolve '${target}' as a valid ref.`); return 128; }
  const messages = o.flags.get('m');
  if (has(o, 'a') || messages) {
    if (!messages) { g.err('git tag -a：模擬環境沒有文字編輯器，請用 -m 寫標籤的說明（例如 git tag -a v1.0 -m "第一版"）'); return 1; }
    const tagger = g.ident(r, 'Committer');
    if (!tagger) return 128;
    const object = g.peel(id)!;
    const tag = g.store.put({ type: 'tag', object, objectType: 'commit', tag: name, tagger, message: stripspace(messages.join('\n\n')) });
    r.known.add(tag);
    r.refs.set(`refs/tags/${name}`, tag);
  } else r.refs.set(`refs/tags/${name}`, id);
  return 0;
}

/** git describe [--tags] [--always] [--abbrev=N] [修訂]: the nearest tag, commits since it and the commit (v1.0-2-g1a2b3c4). */
export function describeCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'describe', args, ['tags', 'always', 'abbrev=', 'long', 'all'], '[<options>] [<commit-ish>...]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const spec = o.rest[0] ?? 'HEAD', target = g.commitOf(r, spec);
  if (!target) { g.err(spec === 'HEAD' ? "fatal: cannot describe 'HEAD'" : `fatal: Not a valid object name ${spec}`); return 128; }
  const abbrevN = value(o, 'abbrev') === undefined ? 7 : Number(value(o, 'abbrev'));
  const all = [...r.refs].filter(([k]) => k.startsWith('refs/tags/')).map(([k, id]) => ({ name: k.slice('refs/tags/'.length), id, annotated: g.store.get(id)?.type === 'tag', commit: g.peel(id)! }));
  const usable = all.filter(t => has(o, 'tags') || t.annotated);
  const mine = reachable(g.store, [target]);
  const scored = usable.filter(t => mine.has(t.commit)).map(t => {
    const theirs = reachable(g.store, [t.commit]);
    return { ...t, depth: [...mine].filter(x => !theirs.has(x)).length, time: g.commit(t.commit).committer.time };
  }).sort((a, b) => a.depth - b.depth || Number(b.annotated) - Number(a.annotated) || b.time - a.time || (a.name < b.name ? -1 : 1));
  const best = scored[0];
  const short = abbrevN ? g.abbrev(target, Math.max(abbrevN, 4)) : '';
  if (!best) {
    if (has(o, 'always')) { g.out(g.abbrev(target, Math.max(abbrevN, 4))); return 0; }
    if (!all.length) g.err('fatal: No names found, cannot describe anything.');
    else if (!usable.length) g.err(`fatal: No annotated tags can describe '${target}'.`, 'However, there were unannotated tags: try --tags.');
    else g.err(`fatal: No tags can describe '${target}'.`, 'Try --always, or create some tags.');
    return 128;
  }
  g.out(best.depth || has(o, 'long') ? (abbrevN ? `${best.name}-${best.depth}-g${short}` : best.name) : best.name);
  return 0;
}
