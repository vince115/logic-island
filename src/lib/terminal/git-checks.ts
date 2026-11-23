import { resolvePath, type FsState } from './fs';
import { isAncestor, reachable, subjectOf, type Sha } from './git';
import { FORGE_URL } from './git-state';
import { Git, validRefName, type Forge, type Repo } from './git-core';
import { statusOf } from './git-format';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md §4): the checks branch, worktree and tag, read from the machine after
 * the learner's commands. repo is a worktree's path (absolute) or a forge URL; remote: true reads the forge repository the
 * worktree's origin points at. A ref in includes or at is a commit label of the lesson, or a name resolved in that repository.
 */

export type GitCheck =
  | {
    kind: 'branch'; repo: string; name: string; remote?: boolean; absent?: true;
    /** A file of the tip: its whole content, or text it must include. */
    file?: { path: string; content?: string; includes?: string };
    /** A regular expression the tip's whole message must match. */
    message?: string;
    /** How many parents the tip has (2: a merge commit). */
    parents?: number;
    /** true: no merge commit in the branch's history; false: at least one. */
    linear?: boolean;
    /** The branch contains this commit (label or ref). */
    includes?: string;
  }
  | { kind: 'worktree'; repo: string; /** git status says working tree clean (no staged, unstaged, unmerged or untracked files, no merge or rebase in progress). */ clean?: boolean; /** HEAD is on this branch. */ branch?: string }
  | { kind: 'tag'; repo: string; name: string; /** The commit it points at (label or ref). */ at?: string; remote?: boolean; annotated?: boolean; absent?: true };
export const GIT_CHECK_KINDS = ['branch', 'worktree', 'tag'] as const;

const silent = { out: () => {}, err: () => {}, user: 'root' };
const normalized = (p: string) => p.startsWith('/') && resolvePath({ cwd: '/', home: '/' }, p) === p;

/** Where a check looks: a local repository or a forge repository (null: why it is not there). */
function locate(g: Git, repo: string, remote?: boolean): { repo?: Repo; forge?: Forge } | string {
  if (FORGE_URL.test(repo)) { const f = g.forge.find(x => x.url === repo); return f ? { forge: f } : `github.example 上沒有 ${repo}`; }
  const r = g.repos.find(x => x.path === repo && g.hasGitDir(x.path));
  if (!r) return `${repo} 不是 Git 儲存庫`;
  if (!remote) return { repo: r };
  const url = r.config.get('remote.origin.url'), f = url ? g.forge.find(x => x.url.replace(/\.git$/, '') === url.replace(/\/+$/, '').replace(/\.git$/, '')) : undefined;
  return f ? { forge: f, repo: r } : `${repo} 沒有指向 github.example 的 origin`;
}
/** A label of the lesson (its ID on the machine at the start) or a ref resolved in the repository at the end. */
function resolveRef(g: Git, labels: ReadonlyMap<string, Sha>, where: { repo?: Repo; forge?: Forge }, ref: string): Sha | undefined {
  if (labels.has(ref)) return labels.get(ref);
  if (where.forge && !where.repo) return g.peel(where.forge.refs.get(`refs/heads/${ref}`) ?? where.forge.refs.get(`refs/tags/${ref}`));
  return where.repo ? g.commitOf(where.repo, ref) : undefined;
}
export function describeGitCheck(c: GitCheck): string {
  const where = FORGE_URL.test(c.repo) ? `${c.repo} ` : 'remote' in c && c.remote ? `${c.repo} 的 origin（github.example）上` : `${c.repo} `;
  switch (c.kind) {
    case 'branch': {
      if (c.absent) return `${where}應該沒有分支 ${c.name}`;
      const parts = [c.file ? `${c.file.path} ${c.file.content !== undefined ? '的內容符合題目' : `包含「${c.file.includes}」`}` : '', c.message !== undefined ? '最新 commit 的訊息符合題目' : '',
        c.parents !== undefined ? `最新 commit 有 ${c.parents} 個父 commit` : '', c.linear === true ? '歷史是一直線（沒有合併 commit）' : c.linear === false ? '歷史有合併 commit' : '', c.includes ? `包含 ${c.includes}` : ''].filter(Boolean);
      return `${where}應該有分支 ${c.name}${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
    case 'worktree': return `${c.repo} ${[c.clean === true ? '應該沒有未提交的變更' : c.clean === false ? '應該有未提交的變更' : '', c.branch ? `應該在分支 ${c.branch} 上` : ''].filter(Boolean).join('，') || '應該是 Git 儲存庫'}`;
    case 'tag': {
      if (c.absent) return `${where}應該沒有標籤 ${c.name}`;
      const parts = [c.at ? `指向 ${c.at}` : '', c.annotated === true ? '是附註標籤（-a）' : c.annotated === false ? '是輕量標籤' : ''].filter(Boolean);
      return `${where}應該有標籤 ${c.name}${parts.length ? `（${parts.join('，')}）` : ''}`;
    }
  }
}

const safeTest = (pattern: string, text: string) => { try { return new RegExp(pattern).test(text); } catch { return false; } };

/** Why a check fails on the machine after the commands (null: it holds). */
export function gitFailure(c: GitCheck, end: FsState): string | null {
  const labels = end.git?.labels ?? new Map<string, Sha>(), g = new Git(end, silent), w = locate(g, c.repo, 'remote' in c ? c.remote : undefined);
  if (typeof w === 'string') return w;
  if (c.kind === 'worktree') {
    const r = w.repo;
    if (!r) return `${c.repo} 不是本機的儲存庫`;
    if (c.branch !== undefined && g.branch(r) !== c.branch) return g.branch(r) ? `目前在分支 ${g.branch(r)}` : 'HEAD 是分離的（detached HEAD）';
    if (c.clean !== undefined) {
      const s = statusOf(g, r), dirty = s.staged.length + s.unstaged.length + s.unmerged.length + s.untracked.length > 0 || !!r.op;
      if (c.clean && dirty) return r.op ? `${r.op.kind === 'rebase' ? 'rebase' : r.op.kind === 'merge' ? '合併' : 'revert'}還沒有完成` : s.unmerged.length ? '還有沒解決的衝突' : s.staged.length || s.unstaged.length ? '還有沒提交的變更' : '還有沒追蹤的檔案';
      if (!c.clean && !dirty) return '工作目錄是乾淨的';
    }
    return null;
  }
  const refs = w.forge && (!w.repo || ('remote' in c && c.remote) || FORGE_URL.test(c.repo)) ? w.forge.refs : w.repo!.refs;
  if (c.kind === 'tag') {
    const id = refs.get(`refs/tags/${c.name}`);
    if (c.absent) return id ? `標籤 ${c.name} 還在` : null;
    if (!id) return `沒有標籤 ${c.name}`;
    if (c.annotated !== undefined && (g.store.get(id)?.type === 'tag') !== c.annotated) return c.annotated ? '它是輕量標籤' : '它是附註標籤';
    if (c.at !== undefined) { const want = resolveRef(g, labels, w, c.at); if (!want) return `找不到 ${c.at}`; if (g.peel(id) !== want) return `它指向 ${g.abbrev(g.peel(id)!)} ${subjectOf(g.commit(g.peel(id)!).message)}`; }
    return null;
  }
  const tip = refs.get(`refs/heads/${c.name}`);
  if (c.absent) return tip ? `分支 ${c.name} 還在` : null;
  if (!tip) return `沒有分支 ${c.name}`;
  const commit = g.commit(tip);
  if (c.file) {
    const e = g.files(tip).get(c.file.path);
    if (!e) return `它的最新 commit 沒有 ${c.file.path}`;
    const text = g.store.blobText(e.id);
    if (c.file.content !== undefined && text !== c.file.content) return `它的最新 commit 裡 ${c.file.path} 的內容不同`;
    if (c.file.includes !== undefined && !text.includes(c.file.includes)) return `它的最新 commit 裡 ${c.file.path} 沒有「${c.file.includes}」`;
  }
  if (c.message !== undefined && !safeTest(c.message, commit.message)) return `它最新的 commit 是「${subjectOf(commit.message)}」`;
  if (c.parents !== undefined && commit.parents.length !== c.parents) return `它最新的 commit 有 ${commit.parents.length} 個父 commit`;
  if (c.linear !== undefined) {
    const merges = [...reachable(g.store, [tip])].some(id => g.commit(id).parents.length > 1);
    if (c.linear && merges) return '它的歷史有合併 commit';
    if (!c.linear && !merges) return '它的歷史沒有合併 commit';
  }
  if (c.includes !== undefined) { const want = resolveRef(g, labels, w, c.includes); if (!want) return `找不到 ${c.includes}`; if (!isAncestor(g.store, want, tip)) return `它沒有包含 ${c.includes}`; }
  return null;
}

/** The problems of a check's data (it needs a git machine). */
export function gitCheckProblems(c: GitCheck, git: boolean): string | null {
  const repoOk = typeof c.repo === 'string' && (normalized(c.repo) || FORGE_URL.test(c.repo));
  if (!git || !repoOk) return `a ${c.kind} check needs a git machine (engine stage E25) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)`;
  if (c.kind === 'worktree') return FORGE_URL.test(c.repo) || (c.branch !== undefined && !validRefName(c.branch)) || (c.clean === undefined && c.branch === undefined) ? 'a worktree check needs a local repo and clean or a valid branch' : null;
  if (!validRefName(c.name ?? '')) return `a ${c.kind} check needs a valid name`;
  if (c.absent && Object.keys(c).some(k => !['kind', 'repo', 'name', 'remote', 'absent'].includes(k))) return `an absent ${c.kind} check takes only repo, name and remote`;
  if (c.kind === 'branch') {
    if (c.message !== undefined) { try { new RegExp(c.message); } catch { return 'a branch check\'s message is not a regular expression'; } }
    if (c.file && (typeof c.file.path !== 'string' || !c.file.path || c.file.path.startsWith('/') || (c.file.content === undefined) === (c.file.includes === undefined))) return 'a branch check\'s file needs a relative path and content or includes';
    if (c.parents !== undefined && (!Number.isInteger(c.parents) || c.parents < 0 || c.parents > 2)) return 'a branch check\'s parents must be 0, 1 or 2';
  }
  return null;
}
