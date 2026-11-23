import { isAncestor, type Sha } from './git';
import { shortRef, validRefName, type Forge, type Git, type Repo } from './git-core';
import { FORGE_HOST } from './git-state';
import { has, parseOpts } from './git-cli';
import { INIT_CONFIG } from './git-cli-commit';
import { checkoutFiles } from './git-cli-switch';
import { fastForward, mergeInto } from './git-cli-merge';
import { rebaseOnto } from './git-cli-rebase';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): remotes on the simulated forge https://github.example/<owner>/<repo>.git
 * (HTTPS with credentials already configured; E26 adds gh) — git clone, remote, fetch (ref-update lines, tags that follow,
 * --prune), push (new branch, fast-forward, rejected fetch first / non-fast-forward, --force, --force-with-lease, --delete,
 * --tags, -u) and pull (fast-forward, merge, --rebase, --ff-only, the divergent-branches error). No progress lines.
 */

const noGit = (url: string) => url.replace(/\/+$/, '').replace(/\.git$/, '');
/** The forge repository a URL names, or git's error (printed) for another host, SSH or a repository that is not there. */
export function forgeOf(g: Git, url: string): Forge | undefined {
  const m = /^https:\/\/([^/]+)\/(.*)$/.exec(url);
  if (!m) { g.err(`fatal: '${url}' does not appear to be a git repository`, 'fatal: Could not read from remote repository.'); return undefined; }
  if (m[1] !== FORGE_HOST) { g.err(`fatal: unable to access '${url.replace(/\/?$/, '/')}': Could not resolve host: ${m[1]}`); return undefined; }
  const f = g.forge.find(x => noGit(x.url) === noGit(url));
  if (!f) { g.err('remote: Repository not found.', `fatal: repository '${url.replace(/\/?$/, '/')}' not found`); return undefined; }
  return f;
}
const remotesOf = (r: Repo) => [...r.config.keys()].filter(k => /^remote\..+\.url$/.test(k)).map(k => k.slice('remote.'.length, -'.url'.length));
/** A remote's forge repository (by name), with git's errors. */
function remoteForge(g: Git, r: Repo, name: string): { url: string; forge: Forge } | undefined {
  const url = r.config.get(`remote.${name}.url`) ?? (/^https?:\/\//.test(name) ? name : undefined);
  if (!url) { g.err(`fatal: '${name}' does not appear to be a git repository`, 'fatal: Could not read from remote repository.'); return undefined; }
  const forge = forgeOf(g, url);
  return forge ? { url, forge } : undefined;
}
const pad = (s: string, w: number) => s.padEnd(w);

/** Fetches a remote's branches into refs/remotes/<name>/ and the tags that point into them; prints git fetch's lines. */
export function fetchRemote(g: Git, r: Repo, name: string, opt: { prune?: boolean; tags?: boolean } = {}): boolean {
  const remote = remoteForge(g, r, name);
  if (!remote) return false;
  const f = remote.forge, rows: [string, string, string, string][] = [], fresh: typeof rows = [], pruned: typeof rows = [];
  for (const [ref, id] of [...f.refs].filter(([k]) => k.startsWith('refs/heads/')).sort(([a], [b]) => a < b ? -1 : 1)) {
    const b = ref.slice('refs/heads/'.length), track = `refs/remotes/${name}/${b}`, old = r.refs.get(track);
    if (old === id) continue;
    g.learn(r.known, [id]);
    if (!old) fresh.push([' * [new branch]     ', b, `${name}/${b}`, '']);
    else if (isAncestor(g.store, old, id)) rows.push([`   ${g.abbrev(old)}..${g.abbrev(id)} `, b, `${name}/${b}`, '']);
    else rows.push([` + ${g.abbrev(old)}...${g.abbrev(id)}`, b, `${name}/${b}`, '  (forced update)']);
    r.refs.set(track, id);
  }
  if (opt.prune || r.config.get('fetch.prune') === 'true' || g.config(r, 'fetch.prune') === 'true') {
    for (const k of [...r.refs.keys()].filter(k => k.startsWith(`refs/remotes/${name}/`))) {
      if (f.refs.has(`refs/heads/${k.slice(`refs/remotes/${name}/`.length)}`)) continue;
      r.refs.delete(k);
      pruned.push([' - [deleted]        ', '(none)', shortRef(k), '']);
    }
  }
  rows.unshift(...pruned); rows.push(...fresh);
  g.learn(r.known, [...f.refs.values()].filter(id => r.known.has(g.peel(id)!) || opt.tags));
  for (const [ref, id] of [...f.refs].filter(([k]) => k.startsWith('refs/tags/')).sort(([a], [b]) => a < b ? -1 : 1)) {
    if (r.refs.has(ref) || !(opt.tags || r.known.has(g.peel(id)!))) continue;
    r.refs.set(ref, id); r.known.add(id);
    rows.push([' * [new tag]        ', shortRef(ref), shortRef(ref), '']);
  }
  if (rows.length) {
    const w = Math.max(10, ...rows.map(x => x[1].length));
    g.err(`From ${noGit(remote.url)}`, ...rows.map(([s, from, to, tail]) => `${s} ${pad(from, w)} -> ${to}${tail}`));
  }
  return true;
}

/** git fetch [遠端] [--prune] [--tags] [--all] */
export function fetchCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'fetch', args, ['p|prune', 'tags', 'all', 'q|quiet', 'v|verbose'], '[<options>] [<repository> [<refspec>...]]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const names = has(o, 'all') ? remotesOf(r) : [o.rest[0] ?? r.config.get(`branch.${g.branch(r)}.remote`) ?? 'origin'];
  for (const n of names) if (!fetchRemote(g, r, n, { prune: has(o, 'p'), tags: has(o, 'tags') })) return 128;
  return 0;
}

/** git clone [-b 分支] 網址 [資料夾] */
export function cloneCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'clone', args, ['b|branch=', 'q|quiet', 'depth=', 'o|origin='], '[<options>] [--] <repo> [<dir>]');
  if (!o) return 129;
  const [url, dirArg] = o.rest;
  if (!url) { g.err('fatal: You must specify a repository to clone.'); return 129; }
  const dirName = dirArg ?? noGit(url).slice(noGit(url).lastIndexOf('/') + 1);
  const dir = g.abs(dirName), existing = g.nodes.get(dir);
  if (existing && (existing.kind !== 'dir' || [...g.nodes.keys()].some(p => p.startsWith(`${dir === '/' ? '' : dir}/`)))) { g.err(`fatal: destination path '${dirName}' already exists and is not an empty directory.`); return 128; }
  if (!has(o, 'q')) g.err(`Cloning into '${dirName}'...`);
  const f = forgeOf(g, url);
  if (!f) return 128;
  const want = o.flags.get('b')?.at(-1), branch = want ?? f.head.slice('refs/heads/'.length);
  if (want && !f.refs.has(`refs/heads/${want}`)) { g.err(`warning: Could not find remote branch ${want} to clone.`, `fatal: Remote branch ${want} not found in upstream origin`); return 128; }
  const umask = g.state.umask ?? 0o022, owner = g.state.user, parts = dir.split('/').filter(Boolean);
  for (let k = 1; k <= parts.length; k++) { const p = `/${parts.slice(0, k).join('/')}`; if (!g.nodes.has(p)) g.nodes.set(p, { kind: 'dir', mode: 0o777 & ~umask, owner }); }
  g.nodes.set(`${dir === '/' ? '' : dir}/.git`, { kind: 'dir', mode: 0o777 & ~umask, owner });
  const at = g.repos.findIndex(x => x.path === dir);
  if (at >= 0) g.repos.splice(at, 1);
  const r: Repo = { path: dir, head: `refs/heads/${branch}`, refs: new Map(), symrefs: new Map(), index: new Map(), unmerged: new Map(),
    config: new Map([...INIT_CONFIG, ['remote.origin.url', url], ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']]), known: new Set(), stash: [] };
  g.repos.push(r);
  for (const [ref, id] of f.refs) r.refs.set(ref.startsWith('refs/heads/') ? `refs/remotes/origin/${ref.slice('refs/heads/'.length)}` : ref, id);
  g.learn(r.known, f.refs.values());
  const tip = f.refs.get(`refs/heads/${branch}`);
  if (!tip) { g.err('warning: You appear to have cloned an empty repository.'); return 0; }
  r.symrefs.set('refs/remotes/origin/HEAD', `refs/remotes/origin/${f.head.slice('refs/heads/'.length)}`);
  r.refs.set(`refs/heads/${branch}`, tip);
  r.config.set(`branch.${branch}.remote`, 'origin'); r.config.set(`branch.${branch}.merge`, `refs/heads/${branch}`);
  const cwd = g.cwd;
  checkoutFiles(g, r, g.files(tip), 'checkout', true);
  g.cwd = cwd;
  return 0;
}

/** git remote [-v] | add 名稱 網址 | remove 名稱 | rename 舊 新 | set-url 名稱 網址 | get-url 名稱 */
export function remoteCommand(g: Git, args: string[]): number {
  const r = g.repo();
  if (!r) return 128;
  const [sub, ...rest] = args;
  const names = remotesOf(r);
  if (sub === undefined || sub === '-v' || sub === '--verbose') {
    for (const n of names) g.out(...sub ? [`${n}\t${r.config.get(`remote.${n}.url`)} (fetch)`, `${n}\t${r.config.get(`remote.${n}.url`)} (push)`] : [n]);
    return 0;
  }
  const [name, url] = rest;
  switch (sub) {
    case 'add':
      if (rest.length !== 2) { g.err('usage: git remote add [<options>] <name> <url>'); return 129; }
      if (!validRefName(name) || name.includes('/')) { g.err(`fatal: '${name}' is not a valid remote name`); return 128; }
      if (names.includes(name)) { g.err(`error: remote ${name} already exists.`); return 3; }
      r.config.set(`remote.${name}.url`, url); r.config.set(`remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`);
      return 0;
    case 'remove': case 'rm':
      if (!names.includes(name)) { g.err(`error: No such remote: '${name}'`); return 2; }
      for (const k of [...r.config.keys()]) if (k.startsWith(`remote.${name}.`)) r.config.delete(k);
      for (const [k, v] of [...r.config]) if (/^branch\..+\.remote$/.test(k) && v === name) { r.config.delete(k); r.config.delete(k.replace(/\.remote$/, '.merge')); }
      for (const k of [...r.refs.keys()]) if (k.startsWith(`refs/remotes/${name}/`)) r.refs.delete(k);
      for (const k of [...r.symrefs.keys()]) if (k.startsWith(`refs/remotes/${name}/`)) r.symrefs.delete(k);
      return 0;
    case 'rename': {
      if (!names.includes(name)) { g.err(`error: No such remote: '${name}'`); return 2; }
      if (names.includes(url)) { g.err(`error: remote ${url} already exists.`); return 3; }
      for (const [k, v] of [...r.config]) {
        if (k.startsWith(`remote.${name}.`)) { r.config.delete(k); r.config.set(`remote.${url}.${k.slice(`remote.${name}.`.length)}`, v.replace(`refs/remotes/${name}/`, `refs/remotes/${url}/`)); }
        else if (/^branch\..+\.remote$/.test(k) && v === name) r.config.set(k, url);
      }
      for (const [k, v] of [...r.refs]) if (k.startsWith(`refs/remotes/${name}/`)) { r.refs.delete(k); r.refs.set(`refs/remotes/${url}/${k.slice(`refs/remotes/${name}/`.length)}`, v); }
      for (const [k, v] of [...r.symrefs]) if (k.startsWith(`refs/remotes/${name}/`)) { r.symrefs.delete(k); r.symrefs.set(`refs/remotes/${url}/HEAD`, v.replace(`refs/remotes/${name}/`, `refs/remotes/${url}/`)); }
      return 0;
    }
    case 'set-url':
      if (!names.includes(name)) { g.err(`error: No such remote '${name}'`); return 2; }
      r.config.set(`remote.${name}.url`, url);
      return 0;
    case 'get-url':
      if (!names.includes(name)) { g.err(`error: No such remote '${name}'`); return 2; }
      g.out(r.config.get(`remote.${name}.url`)!);
      return 0;
    default:
      g.err(`error: unknown subcommand: \`${sub}'`, 'usage: git remote [-v | --verbose]');
      return 129;
  }
}

type Update = { src: string; dst: string; id?: Sha; force: boolean };

/** git push [-u] [-f] [--force-with-lease] [--tags] [-d|--delete] [遠端 [來源[:目的地]…]] */
export function pushCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'push', args, ['u|set-upstream', 'f|force', 'force-with-lease', 'tags', 'd|delete', 'q|quiet', 'v|verbose', 'all'], '[<options>] [<repository> [<refspec>...]]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const branch = g.branch(r), names = remotesOf(r);
  const remoteName = o.rest[0] ?? (branch && r.config.get(`branch.${branch}.remote`)) ?? (names.includes('origin') ? 'origin' : names[0]);
  if (!remoteName) { g.err('fatal: No configured push destination.'); return 128; }
  const specs = o.rest.slice(1), updates: Update[] = [];
  if (!specs.length && !has(o, 'tags') && !has(o, 'all')) {
    if (!branch) { g.err('fatal: You are not currently on a branch.'); return 128; }
    const up = g.upstream(r, branch);
    if (!up && !has(o, 'u')) {
      g.err(`fatal: The current branch ${branch} has no upstream branch.`, `    git push --set-upstream ${remoteName} ${branch}`);
      return 128;
    }
    specs.push(branch);
  }
  if (has(o, 'all')) specs.push(...[...r.refs.keys()].filter(k => k.startsWith('refs/heads/')).map(k => k.slice('refs/heads/'.length)));
  for (const spec of specs) {
    const force = spec.startsWith('+') || has(o, 'f');
    const body = spec.replace(/^\+/, ''), colon = body.indexOf(':');
    const src = has(o, 'd') ? '' : colon < 0 ? body : body.slice(0, colon), dstName = has(o, 'd') ? body : colon < 0 ? body : body.slice(colon + 1);
    if (src) {
      const full = src === 'HEAD' ? r.head : g.dwim(r, src), id = full ? g.refValue(r, full) : g.commitOf(r, src);
      if (!id) { g.err(`error: src refspec ${src} does not match any`, `error: failed to push some refs to '${r.config.get(`remote.${remoteName}.url`) ?? remoteName}'`); return 1; }
      const dstFull = dstName.startsWith('refs/') ? dstName : full?.startsWith('refs/tags/') ? `refs/tags/${dstName === src ? shortRef(full) : dstName}` : `refs/heads/${dstName === 'HEAD' || dstName === src ? shortRef(full ?? `refs/heads/${src}`) : dstName}`;
      updates.push({ src: src === 'HEAD' ? 'HEAD' : shortRef(full ?? src), dst: dstFull, id, force });
    } else updates.push({ src: '', dst: dstName.startsWith('refs/') ? dstName : r.refs.has(`refs/tags/${dstName}`) && !has(o, 'd') ? `refs/tags/${dstName}` : `refs/heads/${dstName}`, force });
  }
  if (has(o, 'tags')) for (const [k, id] of r.refs) if (k.startsWith('refs/tags/') && !updates.some(u => u.dst === k)) updates.push({ src: shortRef(k), dst: k, id, force: has(o, 'f') });
  const remote = remoteForge(g, r, remoteName);
  if (!remote) return 128;
  const f = remote.forge, lines: string[] = [], reasons = new Set<string>();
  const lease = has(o, 'force-with-lease');
  for (const u of updates) {
    const old = f.refs.get(u.dst), to = shortRef(u.dst), tag = u.dst.startsWith('refs/tags/');
    if (!u.id) {
      if (!old) { g.err(`error: unable to delete '${to}': remote ref does not exist`); reasons.add('delete'); continue; }
      f.refs.delete(u.dst); lines.push(` - [deleted]         ${to}`);
      if (u.dst.startsWith('refs/heads/')) r.refs.delete(`refs/remotes/${remoteName}/${to}`);
      continue;
    }
    if (old === u.id) continue;
    let line: string;
    if (!old) line = ` * [new ${tag ? 'tag' : 'branch'}]${tag ? '         ' : '      '}${u.src} -> ${to}`;
    else if (tag && !u.force) { lines.push(` ! [rejected]        ${u.src} -> ${to} (already exists)`); reasons.add('tag'); continue; }
    else if (!tag && isAncestor(g.store, old, g.peel(u.id)!)) line = `   ${g.abbrev(old)}..${g.abbrev(u.id)}  ${u.src} -> ${to}`;
    else if (lease && !u.force && r.refs.get(`refs/remotes/${remoteName}/${to}`) !== old) { lines.push(` ! [rejected]        ${u.src} -> ${to} (stale info)`); reasons.add('stale'); continue; }
    else if (u.force || lease) line = ` + ${g.abbrev(old)}...${g.abbrev(u.id)} ${u.src} -> ${to} (forced update)`;
    else {
      const known = r.known.has(old);
      lines.push(` ! [rejected]        ${u.src} -> ${to} (${known ? 'non-fast-forward' : 'fetch first'})`);
      reasons.add(known ? 'behind' : 'fetch');
      continue;
    }
    f.refs.set(u.dst, u.id);
    g.learn(f.known, [u.id]);
    if (!tag) r.refs.set(`refs/remotes/${remoteName}/${to}`, u.id);
    lines.push(line);
  }
  const url = remote.url;
  if (lines.length) g.err(`To ${url}`, ...lines);
  if (reasons.size) {
    g.err(`error: failed to push some refs to '${url}'`);
    if (reasons.has('fetch')) g.err('hint: Updates were rejected because the remote contains work that you do not have locally; integrate it first (git pull) and push again.');
    else if (reasons.has('behind')) g.err('hint: Updates were rejected because the tip of your current branch is behind its remote counterpart; integrate the remote changes (git pull) first.');
    else if (reasons.has('tag')) g.err('hint: Updates were rejected because the tag already exists in the remote.');
    return 1;
  }
  if (!lines.length) g.err('Everything up-to-date');
  if (has(o, 'u')) for (const u of updates.filter(x => x.id && x.dst.startsWith('refs/heads/') && r.refs.has(`refs/heads/${x.src}`))) {
    r.config.set(`branch.${u.src}.remote`, remoteName); r.config.set(`branch.${u.src}.merge`, u.dst);
    g.out(`branch '${u.src}' set up to track '${remoteName}/${shortRef(u.dst)}'.`);
  }
  return 0;
}

/** git pull [--rebase|--no-rebase] [--ff-only] [遠端 [分支]] */
export function pullCommand(g: Git, args: string[]): number {
  const o = parseOpts(g, 'pull', args, ['r|rebase', 'no-rebase', 'ff-only', 'ff', 'no-ff', 'q|quiet', 'no-edit'], '[<options>] [<repository> [<refspec>...]]');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const branch = g.branch(r);
  if (!branch) { g.err('You are not currently on a branch.', 'Please specify which branch you want to merge with.'); return 1; }
  const remoteName = o.rest[0] ?? r.config.get(`branch.${branch}.remote`);
  const merge = o.rest[1] ?? r.config.get(`branch.${branch}.merge`)?.replace(/^refs\/heads\//, '');
  if (!remoteName || !merge) {
    g.err('There is no tracking information for the current branch.', 'Please specify which branch you want to merge with.', `    git branch --set-upstream-to=origin/<branch> ${branch}`);
    return 1;
  }
  if (r.unmerged.size || r.op) { g.err(r.unmerged.size ? "error: Pulling is not possible because you have unmerged files." : 'fatal: You have not concluded your merge (MERGE_HEAD exists).'); return 128; }
  if (!fetchRemote(g, r, remoteName)) return 1;
  const theirs = r.refs.get(`refs/remotes/${remoteName}/${merge}`);
  if (!theirs) { g.err(`fatal: couldn't find remote ref ${merge}`); return 1; }
  const head = g.head(r);
  if (!head) { if (!checkoutFiles(g, r, g.files(theirs), 'merge')) return 1; g.setHead(r, theirs); return 0; }
  if (isAncestor(g.store, theirs, head)) { g.out('Already up to date.'); return 0; }
  if (isAncestor(g.store, head, theirs) && !has(o, 'no-ff')) return fastForward(g, r, theirs) ? 0 : 1;
  const rebaseConf = g.config(r, `branch.${branch}.rebase`) ?? g.config(r, 'pull.rebase'), ffConf = g.config(r, 'pull.ff');
  const rebase = has(o, 'r') || (!has(o, 'no-rebase') && rebaseConf === 'true');
  if (has(o, 'ff-only') || (!has(o, 'r') && !has(o, 'no-rebase') && !has(o, 'ff') && !has(o, 'no-ff') && ffConf === 'only' && rebaseConf !== 'true')) { g.err('fatal: Not possible to fast-forward, aborting.'); return 128; }
  if (!rebase && !has(o, 'no-rebase') && !has(o, 'ff') && !has(o, 'no-ff') && rebaseConf === undefined && ffConf === undefined) {
    g.err('hint: You have divergent branches and need to specify how to reconcile them.', 'fatal: Need to specify how to reconcile divergent branches.');
    return 128;
  }
  if (rebase) return rebaseOnto(g, r, `${remoteName}/${merge}`);
  const url = r.config.get(`remote.${remoteName}.url`) ?? remoteName;
  const message = `Merge branch '${merge}' of ${noGit(url)}${branch !== 'main' && branch !== 'master' ? ` into ${branch}` : ''}\n`;
  return mergeInto(g, r, theirs, { label: theirs, message, ff: has(o, 'no-ff') ? 'no' : 'default' });
}
