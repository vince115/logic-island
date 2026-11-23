import type { FsState } from './fs';
import { prettyObject } from './git';
import { Git, type GitIo } from './git-core';
import { diffCommand, statusCommand } from './git-cli-status';
import { logCommand, showCommand } from './git-cli-log';
import { addCommand, commitCommand, configCommand, initCommand, mvCommand, rmCommand } from './git-cli-commit';
import { branchCommand, describeCommand, tagCommand } from './git-cli-branch';
import { checkoutCommand, resetCommand, restoreCommand, switchCommand } from './git-cli-switch';
import { mergeCommand } from './git-cli-merge';
import { rebaseCommand, revertCommand } from './git-cli-rebase';
import { cloneCommand, fetchCommand, pullCommand, pushCommand, remoteCommand } from './git-cli-remote';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): the git command line (git 2.43.0 as Ubuntu 24.04 ships it, no
 * colour, no pager, no editor). This file reads the options before the subcommand (-C, --version), dispatches, and holds the
 * option parser every subcommand uses; the subcommands are in git-cli-*.ts. Messages follow git's first line (fatal:,
 * error:, hint:); git's longer advice paragraphs are shortened to one line (the document lists them).
 */

export type Handler = (g: Git, args: string[], name: string) => number;

/** The parsed options of a subcommand: flags and values by their first name, the other words, and what follows --. */
export interface Opts { flags: Map<string, string[]>; rest: string[]; paths?: string[] }
export const has = (o: Opts, name: string) => o.flags.has(name);
export const value = (o: Opts, name: string) => o.flags.get(name)?.at(-1);

/**
 * git's parse-options, the part the simulation needs. spec: 'a|all' is a flag (first name canonical), 'm|message=' takes a
 * value; short flags can be grouped (-am msg, -mmsg), long values written --message=x or --message x. Unknown options
 * print git's error and a usage line (status 129).
 */
export function parseOpts(g: Git, cmd: string, args: readonly string[], spec: readonly string[], usage: string): Opts | undefined {
  const names = new Map<string, { canon: string; value: boolean }>();
  for (const s of spec) {
    const takes = s.endsWith('='), list = (takes ? s.slice(0, -1) : s).split('|');
    for (const n of list) names.set(n, { canon: list[0], value: takes });
  }
  const o: Opts = { flags: new Map(), rest: [] };
  const set = (canon: string, v = '') => o.flags.set(canon, [...o.flags.get(canon) ?? [], v]);
  const bad = (line: string) => { g.err(line, `usage: git ${cmd} ${usage}`); return undefined; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { o.paths = args.slice(i + 1); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('='), name = eq < 0 ? a.slice(2) : a.slice(2, eq), n = names.get(name);
      if (!n) return bad(`error: unknown option \`${name}'`);
      if (!n.value) { if (eq >= 0) return bad(`error: option \`${name}' takes no value`); set(n.canon); continue; }
      const v = eq >= 0 ? a.slice(eq + 1) : args[++i];
      if (v === undefined) return bad(`error: option \`${name}' requires a value`);
      set(n.canon, v);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        const n = names.get(a[k]);
        if (!n) return bad(`error: unknown switch \`${a[k]}'`);
        if (!n.value) { set(n.canon); continue; }
        const v = k + 1 < a.length ? a.slice(k + 1) : args[++i];
        if (v === undefined) return bad(`error: switch \`${a[k]}' requires a value`);
        set(n.canon, v);
        break;
      }
      continue;
    }
    o.rest.push(a);
  }
  return o;
}

const COMMANDS: Record<string, Handler> = {
  init: initCommand, clone: cloneCommand, config: configCommand, status: statusCommand, add: addCommand, restore: restoreCommand, rm: rmCommand, mv: mvCommand,
  commit: commitCommand, log: logCommand, show: showCommand, diff: diffCommand, branch: branchCommand, switch: switchCommand, checkout: checkoutCommand,
  merge: mergeCommand, rebase: rebaseCommand, revert: revertCommand, reset: resetCommand, tag: tagCommand, describe: describeCommand,
  remote: remoteCommand, push: pushCommand, fetch: fetchCommand, pull: pullCommand, 'rev-parse': revParse, 'cat-file': catFile, help: helpCommand,
};
/** git commands the simulation does not have (they say so instead of git's "not a git command"). */
const UNSUPPORTED = ['am', 'apply', 'archive', 'bisect', 'blame', 'bundle', 'cherry-pick', 'clean', 'gc', 'grep', 'gui', 'hash-object', 'ls-files', 'ls-remote', 'ls-tree', 'notes', 'reflog',
  'shortlog', 'show-branch', 'sparse-checkout', 'stash', 'submodule', 'worktree', 'format-patch', 'request-pull', 'range-diff', 'citool', 'fsck', 'prune', 'maintenance'];
export const SUPPORTED = Object.keys(COMMANDS).filter(c => c !== 'help');

function usageLines(g: Git) {
  g.out('usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]', '           <command> [<args>]', '',
    `模擬環境支援的指令：${SUPPORTED.join(' ')}`);
}
function helpCommand(g: Git, args: string[]): number {
  if (args.length && !COMMANDS[args[0]]) { g.err(`git help ${args[0]}：模擬環境沒有這個指令的說明頁（可以用 man git）`); return 1; }
  usageLines(g);
  return 0;
}

/** git rev-parse [--short] [--abbrev-ref] [--show-toplevel] [--verify] 修訂…: IDs, the branch name, the worktree's top. */
function revParse(g: Git, args: string[]): number {
  const o = parseOpts(g, 'rev-parse', args, ['short', 'abbrev-ref', 'show-toplevel', 'verify', 'git-dir', 'is-inside-work-tree'], '[<options>] <args>...');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  if (has(o, 'show-toplevel')) g.out(r.path);
  if (has(o, 'git-dir')) g.out(g.cwd === r.path ? '.git' : `${r.path === '/' ? '' : r.path}/.git`);
  if (has(o, 'is-inside-work-tree')) g.out('true');
  for (const spec of o.rest) {
    if (has(o, 'abbrev-ref')) {
      const full = spec === 'HEAD' || spec === '@' ? (g.attached(r) ? r.head : undefined) : /@\{(u|upstream)\}$/.test(spec) ? g.upstream(r, spec.startsWith('@') ? g.branch(r) : spec.replace(/@\{.*$/, '')) : g.dwim(r, spec);
      if (/@\{(u|upstream)\}$/.test(spec) && !full) { g.err(`fatal: no upstream configured for branch '${g.branch(r) ?? 'HEAD'}'`); return 128; }
      const id = g.rev(r, spec);
      if (!id) { g.err(`fatal: ambiguous argument '${spec}': unknown revision or path not in the working tree.`); return 128; }
      g.out(full ? full.replace(/^refs\/(heads|tags|remotes)\//, '') : 'HEAD');
      continue;
    }
    const id = g.rev(r, spec);
    if (!id) {
      if (has(o, 'verify')) g.err('fatal: Needed a single revision');
      else g.err(g.badRev(r, spec));
      return 128;
    }
    g.out(has(o, 'short') ? g.abbrev(id) : id);
  }
  return 0;
}

/** git cat-file -t|-s|-p 物件: an object's type, size or content (trees as git ls-tree prints them). */
function catFile(g: Git, args: string[]): number {
  const o = parseOpts(g, 'cat-file', args, ['t', 's', 'p', 'e'], '<type> | (-e | -p | -t | -s) <object>');
  if (!o) return 129;
  const r = g.repo();
  if (!r) return 128;
  const mode = ['t', 's', 'p', 'e'].filter(k => has(o, k));
  if (mode.length !== 1 || o.rest.length !== 1) { g.err('fatal: only one batch option may be specified'); return 129; }
  const spec = o.rest[0], colon = spec.indexOf(':');
  let id: string | undefined;
  if (colon >= 0) { const c = g.commitOf(r, spec.slice(0, colon) || 'HEAD'); id = c ? g.files(c).get(spec.slice(colon + 1))?.id : undefined; }
  else id = g.rev(r, spec) ?? (/^[0-9a-f]{40}$/.test(spec) && g.store.has(spec) ? spec : undefined);
  const obj = id ? g.store.get(id) : undefined;
  if (!obj) { if (mode[0] === 'e') return 1; g.err(`fatal: Not a valid object name ${spec}`); return 128; }
  if (mode[0] === 't') g.out(obj.type);
  else if (mode[0] === 's') g.out(String(new TextEncoder().encode(prettyObject(obj)).length));
  else if (mode[0] === 'p') { const text = prettyObject(obj); if (text) g.out(...text.replace(/\n$/, '').split('\n')); }
  return 0;
}

/** git [-C 路徑] [--version] [--no-pager] 子指令 …: runs one git command on the machine. */
export function git(state: FsState, args: readonly string[], io: GitIo): { state: FsState; status: number } {
  const g = new Git(state, io);
  let k = 0;
  for (; k < args.length && args[k].startsWith('-'); k++) {
    const a = args[k];
    if (a === '-C') {
      const dir = args[++k];
      if (dir === undefined) { g.err("error: no directory given for '-C' option"); return { state, status: 129 }; }
      if (dir === '') continue;
      const to = g.abs(dir);
      if (g.nodes.get(to)?.kind !== 'dir') { g.err(`fatal: cannot change to '${dir}': ${g.nodes.has(to) ? 'Not a directory' : 'No such file or directory'}`); return { state, status: 128 }; }
      g.cwd = to;
    } else if (a === '--version' || a === '-v') { g.out('git version 2.43.0'); return { state, status: 0 }; }
    else if (a === '--no-pager' || a === '-P' || a === '-p' || a === '--paginate') continue;
    else if (a === '-h') { usageLines(g); return { state, status: 129 }; }
    else { g.err(`unknown option: ${a}`); usageLines(g); return { state, status: 129 }; }
  }
  const name = args[k];
  if (name === undefined) { usageLines(g); return { state, status: 1 }; }
  const handler = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!handler) {
    if (UNSUPPORTED.includes(name)) { g.err(`git ${name}：模擬環境不支援這個指令（支援的指令：${SUPPORTED.join(' ')}）`); return { state, status: 1 }; }
    g.err(`git: '${name}' is not a git command. See 'git --help'.`);
    return { state, status: 1 };
  }
  const status = handler(g, args.slice(k + 1), name);
  return { state: g.result(), status };
}
