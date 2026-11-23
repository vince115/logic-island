import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { type FsState } from '@/lib/terminal/fs';
import { GIT_PROFILE, run, RUNTIME_PROFILE } from '@/lib/terminal/shell';
import { GIT_MANUAL } from '@/lib/terminal/manual';
import { EMPTY_BLOB, EMPTY_TREE, objectBody, objectId, writeTree, Store } from '@/lib/terminal/git';
import { canonicalKey, editConfig, parseConfig } from '@/lib/terminal/git-core';
import { checkTerminalExercise, machineProblems, machineState, profileOf, terminalContentProblems, type TerminalCheck, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { anonymousLab, EMPTY, gitContent, gitLab, mergeExercise, pushExercise, REAL_IDS, SHOP, tagExercise } from './support/git-fixture';
import { runtimeLab } from './support/runtime-fixture';

/*
 * Engine stage E25 (docs/curriculum/CICD0_E25_GIT.md): the git profile — Git's objects with the IDs real Git computes,
 * repositories in the machine's folders, git status / add / commit / log / diff / show, branches, switch and checkout,
 * merges (fast-forward, three-way, conflicts), rebase, revert, reset, restore, tags and describe, the forge github.example
 * (clone, fetch, push and its rejections, pull), configuration and identity, the lesson data and the checks branch,
 * worktree and tag. Below the profile git stays "command not found". Expected texts were compared with real Git.
 */
function session(from: FsState | TerminalMachine, profile = GIT_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; all: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), all: r.lines.map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(gitLab, GIT_PROFILE, ...commands);
/** A machine with an identity and nothing else (for git init). */
const blank: TerminalMachine = { ...gitLab, id: 'blank', git: { user: { name: 'Mei Lin', email: 'mei@example.com' } }, timezone: undefined, now: undefined };
const fresh = (...commands: string[]) => session(blank, GIT_PROFILE, ...commands);
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

describe('the git profile', () => {
  it('is the runtime profile with git and the git feature', () => {
    expect([...GIT_PROFILE.commands].filter(c => c !== 'git').sort()).toEqual([...RUNTIME_PROFILE.commands].sort());
    expect(GIT_PROFILE.commands).toContain('git');
    expect(RUNTIME_PROFILE.commands).not.toContain('git');
    expect(GIT_PROFILE.features).toEqual([...RUNTIME_PROFILE.features!, 'git']);
    expect(profileOf(gitLab)).toBe(GIT_PROFILE);
    expect(machineProblems(gitLab)).toEqual([]);
  });
  it('below it git is not found, as before, and the git data needs the profile', () => {
    const low = session(runtimeLab, RUNTIME_PROFILE, 'git status', 'git --version').log;
    expect(low[0].err).toEqual(session(runtimeLab, RUNTIME_PROFILE, 'nosuchcommand status').last.err.map(l => l.replace('nosuchcommand', 'git')));
    expect(low[0].status).toBe(127);
    expect(machineProblems({ ...gitLab, profile: 'runtime' })).toContain('machine dev-01: git needs the git profile (engine stage E25)');
    const content = { ...gitContent, machines: [{ ...gitLab, profile: 'runtime' as const, git: undefined }] };
    const p = terminalContentProblems(content);
    expect(p).toContain('example status: git is not in the runtime profile of machine dev-01');
    expect(p).toContain('exercise tag: a tag check needs a git machine (engine stage E25) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
  });
  it('has its manual page, help line and version', () => {
    expect(lab('git --help').last.out[0]).toBe(`用法：${GIT_MANUAL.git.usage}`);
    expect(lab('man git').last.out[3]).toMatch(/^ {7}git - 分散式版本控制/);
    expect(lab('help').last.out.find(l => l.startsWith('  git '))).toMatch(/^ {2}git init\|clone\|status/);
    expect(lab('git --version').last.out).toEqual(['git version 2.43.0']);
    expect(lab('git').last.out[0]).toBe('usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]');
    expect(lab('git nope').last.err).toEqual(["git: 'nope' is not a git command. See 'git --help'."]);
    expect(lab('git stash').last.err[0]).toMatch(/^git stash：模擬環境不支援這個指令/);
    expect(lab('git status').last.err).toEqual(['fatal: not a git repository (or any of the parent directories): .git']);
    expect(lab('git status').last.status).toBe(128);
  });
});

describe('objects with the IDs real Git computes', () => {
  it('blobs, the empty tree and a commit computed by hand from the object format', () => {
    expect(objectId({ type: 'blob', data: '' })).toBe(EMPTY_BLOB);
    expect(EMPTY_BLOB).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(objectId({ type: 'blob', data: 'hello\n' })).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(objectId({ type: 'tree', entries: [] })).toBe(EMPTY_TREE);
    expect(EMPTY_TREE).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
    const who = { name: 'Mei Lin', email: 'mei@example.com', time: 1795341600, tz: '+0800' };
    const body = `tree ${EMPTY_TREE}\nauthor Mei Lin <mei@example.com> 1795341600 +0800\ncommitter Mei Lin <mei@example.com> 1795341600 +0800\n\nEmpty start\n`;
    const commit = { type: 'commit' as const, tree: EMPTY_TREE, parents: [], author: who, committer: who, message: 'Empty start\n' };
    expect(new TextDecoder().decode(objectBody(commit))).toBe(body);
    expect(sha1(`commit ${body.length}\0${body}`)).toBe('5294b1c7253508c0bf20744b1e8cab795e3d97bc');
    expect(objectId(commit)).toBe('5294b1c7253508c0bf20744b1e8cab795e3d97bc');
  });
  it('trees sort folders as if they ended in /, and executables are 100755', () => {
    const store = new Store(new Map());
    const id = writeTree(store, new Map([['a.txt', { id: EMPTY_BLOB, mode: '100644' }], ['a/b', { id: EMPTY_BLOB, mode: '100755' }], ['a-c', { id: EMPTY_BLOB, mode: '100644' }]]));
    const root = store.get(id);
    expect(root?.type === 'tree' && root.entries.map(e => `${e.mode} ${e.name}`)).toEqual(['100644 a-c', '100644 a.txt', '40000 a']);
  });
  it('the lesson commits have real Git IDs (authors, times, +0800 from Asia/Taipei, an executable, an annotated tag)', () => {
    const g = machineState(gitLab).git!;
    for (const [label, id] of Object.entries(REAL_IDS)) if (label !== 'v0.1') expect(g.labels!.get(label)).toBe(id);
    expect(g.forge.find(f => f.url === SHOP)!.refs.get('refs/tags/v0.1')).toBe(REAL_IDS['v0.1']);
    expect(lab('cd notes', 'git log --format="%H %an %ad"').last.out).toEqual([`${REAL_IDS.n2} Mei Lin Sun Nov 22 10:00:00 2026 +0800`, `${REAL_IDS.n1} Mei Lin Sun Nov 22 09:00:00 2026 +0800`]);
  });
});

describe('a repository from git init: status, add, commit, log, diff, show', () => {
  const start = ['git init -b main app', "printf 'hello\\n' > app/README.md", "mkdir -p app/src && printf 'a\\nb\\nc\\n' > app/src/x.txt"];
  it('init makes the .git folder; status lists untracked files and folders', () => {
    const s = fresh(...start, 'git -C app status', 'git -C app status -s');
    expect(s.log[0].out).toEqual(['Initialized empty Git repository in /home/learner/app/.git/']);
    expect(s.state.nodes.get('/home/learner/app/.git')?.kind).toBe('dir');
    expect(s.log[3].out).toEqual(['On branch main', '', 'No commits yet', '', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '\tREADME.md', '\tsrc/', '',
      'nothing added to commit but untracked files present (use "git add" to track)']);
    expect(s.last.out).toEqual(['?? README.md', '?? src/']);
    expect(fresh('git init', 'git init').log.map(l => l.all)).toEqual([["hint: Using 'master' as the name for the initial branch.", 'Initialized empty Git repository in /home/learner/.git/'], ['Reinitialized existing Git repository in /home/learner/.git/']]);
  });
  it('add and commit print git’s summary; the IDs are real Git’s', () => {
    const s = fresh(...start, 'git -C app add README.md', 'git -C app status', "git -C app commit -m 'Initial commit'", 'git -C app add .', "git -C app commit -m 'Add x'", 'git -C app log');
    expect(s.log[4].out).toEqual(['On branch main', '', 'No commits yet', '', 'Changes to be committed:', '  (use "git rm --cached <file>..." to unstage)', '\tnew file:   README.md', '',
      'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '\tsrc/', '']);
    expect(s.log[5].out).toEqual(['[main (root-commit) 4317218] Initial commit', ' 1 file changed, 1 insertion(+)', ' create mode 100644 README.md']);
    expect(s.log[7].out).toEqual(['[main 219a2af] Add x', ' 1 file changed, 3 insertions(+)', ' create mode 100644 src/x.txt']);
    expect(s.last.out).toEqual(['commit 219a2af24149a756dbced39c5a9fffcde924ac31 (HEAD -> main)', 'Author: Mei Lin <mei@example.com>', 'Date:   Sun Nov 22 10:00:00 2026 +0000', '', '    Add x', '',
      'commit 431721821c7ab0af3e8f0adcde9024a14c946ae8', 'Author: Mei Lin <mei@example.com>', 'Date:   Sun Nov 22 10:00:00 2026 +0000', '', '    Initial commit']);
  });
  it('diff, diff --stat, commit -a, log --oneline, show --stat, nothing to commit', () => {
    const s = fresh(...start, 'cd app', 'git add .', "git commit -qm 'Initial commit'", "printf 'a\\nB\\nc\\nd\\n' > src/x.txt", 'git diff', 'git diff --stat', 'git status', "git commit -am 'Change x'", 'git log --oneline', 'git show --stat HEAD~1', "git commit -m 'nothing'");
    expect(s.log[7].out).toEqual(['diff --git a/src/x.txt b/src/x.txt', 'index de98044..a7bc997 100644', '--- a/src/x.txt', '+++ b/src/x.txt', '@@ -1,3 +1,4 @@', ' a', '-b', '+B', ' c', '+d']);
    expect(s.log[8].out).toEqual([' src/x.txt | 3 ++-', ' 1 file changed, 2 insertions(+), 1 deletion(-)']);
    expect(s.log[9].out).toEqual(['On branch main', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)',
      '\tmodified:   src/x.txt', '', 'no changes added to commit (use "git add" and/or "git commit -a")']);
    expect(s.log[10].out[0]).toMatch(/^\[main [0-9a-f]{7}\] Change x$/);
    expect(s.log[11].out).toHaveLength(2);
    expect(s.log[12].out).toEqual(expect.arrayContaining(['    Initial commit', '', ' README.md | 1 +', ' src/x.txt | 3 +++', ' 2 files changed, 4 insertions(+)']));
    expect(s.last.out).toEqual(['On branch main', 'nothing to commit, working tree clean']);
    expect(s.last.status).toBe(1);
  });
  it('git diff of a new file, a deleted file, an empty file, a rename and a mode change', () => {
    const s = fresh('git init -q -b main app', 'cd app', "printf 'x\\n' > a && printf 'y\\n' > b && git add . && git commit -qm one", 'git mv a c', 'git rm -q b', 'touch empty', "printf '#!/bin/sh\\n' > run.sh && chmod +x run.sh",
      'git add .', 'git diff --cached', 'git status -s', 'git commit -q -m two', 'git show --stat --format=%s');
    expect(s.log[8].out).toEqual(['diff --git a/b b/b', 'deleted file mode 100644', 'index 975fbec..0000000', '--- a/b', '+++ /dev/null', '@@ -1 +0,0 @@', '-y',
      'diff --git a/a b/c', 'similarity index 100%', 'rename from a', 'rename to c', 'diff --git a/empty b/empty', 'new file mode 100644', 'index 0000000..e69de29',
      'diff --git a/run.sh b/run.sh', 'new file mode 100755', 'index 0000000..1a24852', '--- /dev/null', '+++ b/run.sh', '@@ -0,0 +1 @@', '+#!/bin/sh']);
    expect(s.log[9].out).toEqual(['D  b', 'R  a -> c', 'A  empty', 'A  run.sh']);
    expect(s.last.out).toEqual(['two', '', ' b      | 1 -', ' a => c | 0', ' empty  | 0', ' run.sh | 1 +', ' 4 files changed, 1 insertion(+), 1 deletion(-)']);
  });
  it('commit errors: no message (no editor), an empty message, nothing staged, unknown options', () => {
    const s = fresh('git init -q app', 'cd app', 'touch f', 'git add f', 'git commit', "git commit -m ''", 'git commit --bogus', 'git commit -x');
    expect(s.log[4].err).toEqual(['git commit：模擬環境沒有文字編輯器，請用 -m 寫提交訊息（例如 git commit -m "說明"）']);
    expect(s.log[5].err).toEqual(['Aborting commit due to empty commit message.']);
    expect(s.log[6].err).toEqual(["error: unknown option `bogus'", 'usage: git commit [<options>] [--] <pathspec>...']);
    expect(s.log[6].status).toBe(129);
    expect(s.last.err[0]).toBe("error: unknown switch `x'");
  });
  it('an amended commit keeps its author and date (" Date:" line); another committer shows " Author:"', () => {
    const s = fresh('git init -q -b main app', 'cd app', 'touch f && git add f', "git commit -qm one", "git commit --amend -m two", 'git config user.name "Lin Hua"', "git commit --amend -m three");
    expect(s.log[4].out).toEqual(['[main 670bd89] two', ' Date: Sun Nov 22 10:00:00 2026 +0000', ' 1 file changed, 0 insertions(+), 0 deletions(-)', ' create mode 100644 f']);
    expect(s.last.out.slice(0, 3)).toEqual([expect.stringMatching(/^\[main [0-9a-f]{7}\] three$/), ' Author: Mei Lin <mei@example.com>', ' Date: Sun Nov 22 10:00:00 2026 +0000']);
  });
});

describe('branches, merges and conflicts', () => {
  const base = ['git init -q -b main app', 'cd app', "printf 'line1\\nline2\\nline3\\nline4\\nline5\\nline6\\nline7\\nline8\\n' > f.txt && printf 'keep\\n' > k.txt", 'git add . && git commit -q -m base',
    'git switch -c feature', "printf 'line1\\nLINE2 feature\\nline3\\nline4\\nline5\\nline6\\nline7\\nline8 feature\\n' > f.txt", "git commit -q -am 'feature edits'", 'git rm -q k.txt && git commit -q -m "remove k"',
    'git switch main', "printf 'line1\\nline2 main\\nline3\\nline4\\nline5\\nline6\\nline7\\nline8\\n' > f.txt && printf 'kept\\n' > k.txt", "git commit -q -am 'main edits'"];
  it('switch -c and switch print git’s lines; a fast-forward merge prints the diffstat', () => {
    const s = fresh('git init -q -b main app', 'cd app', 'touch a && git add a && git commit -qm one', 'git switch -c feature', "printf 'new\\n' > n.txt && git add n.txt && git commit -q -m 'Add n'", 'git switch main', 'git branch -v', 'git merge feature', 'git branch -d feature', 'git switch feature', 'git switch -');
    expect(s.log[3].err).toEqual(["Switched to a new branch 'feature'"]);
    expect(s.log[5].err).toEqual(["Switched to branch 'main'"]);
    expect(s.log[6].out).toEqual([expect.stringMatching(/^ {2}feature [0-9a-f]{7} Add n$/), expect.stringMatching(/^\* main {4}[0-9a-f]{7} one$/)]);
    expect(s.log[7].out).toEqual([expect.stringMatching(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}$/), 'Fast-forward', ' n.txt | 1 +', ' 1 file changed, 1 insertion(+)', ' create mode 100644 n.txt']);
    expect(s.log[8].out).toEqual([expect.stringMatching(/^Deleted branch feature \(was [0-9a-f]{7}\)\.$/)]);
    expect(s.log[9].err).toEqual(['fatal: invalid reference: feature']);
    expect(s.last.err).toEqual(['fatal: invalid reference: @{-1}']);
    expect(fresh('git init -q a', 'cd a', 'git switch -', 'git checkout -').log.slice(2).map(l => l.err)).toEqual([['fatal: invalid reference: @{-1}'], ["error: pathspec '-' did not match any file(s) known to git"]]);
  });
  it('a content conflict and a modify/delete conflict: markers, status, -s, the commit refused, --abort', () => {
    const s = fresh(...base, 'git merge feature', 'cat f.txt', 'git status', 'git status -s', 'git diff --cached', 'git commit -m x', 'git merge --abort', 'git status');
    expect(s.log[11].out).toEqual(['Auto-merging f.txt', 'CONFLICT (content): Merge conflict in f.txt', 'CONFLICT (modify/delete): k.txt deleted in feature and modified in HEAD.  Version HEAD of k.txt left in tree.',
      'Automatic merge failed; fix conflicts and then commit the result.']);
    expect(s.log[11].status).toBe(1);
    expect(s.log[12].out).toEqual(['line1', '<<<<<<< HEAD', 'line2 main', '=======', 'LINE2 feature', '>>>>>>> feature', 'line3', 'line4', 'line5', 'line6', 'line7', 'line8 feature']);
    expect(s.log[13].out).toEqual(['On branch main', 'You have unmerged paths.', '  (fix conflicts and run "git commit")', '  (use "git merge --abort" to abort the merge)', '',
      'Unmerged paths:', '  (use "git add/rm <file>..." as appropriate to mark resolution)', '\tboth modified:   f.txt', '\tdeleted by them: k.txt', '', 'no changes added to commit (use "git add" and/or "git commit -a")']);
    expect(s.log[14].out).toEqual(['UU f.txt', 'UD k.txt']);
    expect(s.log[15].out).toEqual(['* Unmerged path f.txt', '* Unmerged path k.txt']);
    expect(s.log[16].all).toEqual(['U\tf.txt', 'U\tk.txt', 'error: Committing is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.']);
    expect(s.log[16].status).toBe(128);
    expect(s.last.out).toEqual(['On branch main', 'nothing to commit, working tree clean']);
    expect(s.state.nodes.get('/home/learner/app/k.txt')?.content).toBe('kept\n');
  });
  it('resolving: add and rm, "All conflicts fixed", the merge commit (git’s ID), log --graph', () => {
    const s = fresh(...base, 'git merge feature', "printf 'line1\\nline2 both\\nline3\\nline4\\nline5\\nline6\\nline7\\nline8 feature\\n' > f.txt", 'git add f.txt', 'git rm -q k.txt', 'git status', 'git commit --no-edit', 'git log --graph --oneline', 'git merge feature');
    expect(s.log[15].out).toEqual(['On branch main', 'All conflicts fixed but you are still merging.', '  (use "git commit" to conclude merge)', '', 'Changes to be committed:', '\tmodified:   f.txt', '\tdeleted:    k.txt', '']);
    expect(s.log[16].out).toEqual(["[main e5d026c] Merge branch 'feature'"]);
    expect(s.log[17].out).toEqual(["*   e5d026c (HEAD -> main) Merge branch 'feature'", '|\\  ', '| * 31f5c8c (feature) remove k', '| * ccfefbe feature edits', '* | 2e5c88b main edits', '|/  ', '* af7fcdf base']);
    expect(s.last.out).toEqual(['Already up to date.']);
  });
  it('a clean three-way merge of changes to different lines (xdiff’s merge) and --no-ff / --ff-only', () => {
    const s = fresh('git init -q -b main app', 'cd app', "printf 'a\\nb\\nc\\nd\\ne\\nf\\ng\\n' > m.txt && git add . && git commit -qm base", 'git switch -q -c t', "printf 'A\\nb\\nc\\nd\\ne\\nf\\ng\\n' > m.txt && git commit -qam t",
      'git switch -q main', "printf 'a\\nb\\nc\\nd\\ne\\nf\\nG\\n' > m.txt && git commit -qam m", 'git merge --ff-only t', 'git merge t', 'cat m.txt', 'git log -1 --format=%P%n%s', 'git switch -q -c u HEAD~1', 'git merge --no-ff -m "Merge main" main');
    expect(s.log[7].err).toEqual(['fatal: Not possible to fast-forward, aborting.']);
    expect(s.log[8].out).toEqual(['Auto-merging m.txt', "Merge made by the 'ort' strategy.", ' m.txt | 2 +-', ' 1 file changed, 1 insertion(+), 1 deletion(-)']);
    expect(s.log[9].out).toEqual(['A', 'b', 'c', 'd', 'e', 'f', 'G']);
    expect(s.log[10].out[1]).toBe("Merge branch 't'");
    expect(s.last.out[0]).toBe("Merge made by the 'ort' strategy.");
  });
  it('merge refuses: unknown names, local changes in the way, unrelated histories, a second merge', () => {
    const s = fresh(...base, 'git merge nope', "printf 'dirty\\n' > f.txt", 'git merge feature', 'git checkout -- f.txt', 'git merge feature', 'git merge feature', 'git switch feature');
    expect(s.log[11].err).toEqual(['merge: nope - not something we can merge']);
    expect(s.log[13].err).toEqual(['error: Your local changes to the following files would be overwritten by merge:', '\tf.txt', 'Please commit your changes or stash them before you merge.', 'Aborting']);
    expect(s.log[14].err).toEqual(['Updated 1 path from the index']);
    expect(s.log[16].err).toEqual(['error: Merging is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: Exiting because of an unresolved conflict.']);
    expect(s.last.err).toEqual(['f.txt: needs merge', 'k.txt: needs merge', 'error: you need to resolve your current index first']);
    const u = fresh('git init -q -b main a', 'cd a', 'touch x && git add x && git commit -qm x', 'git switch -q --orphan o', 'git init -q ../b', 'cd ../b', 'touch y && git add y && git commit -qm y', 'git fetch ../a');
    expect(u.log[3].err[0]).toBe("error: unknown option `orphan'");
  });
  it('switching carries local changes, refuses to overwrite them, and detaches HEAD at a commit', () => {
    const s = fresh(...base, "printf 'x\\n' > new.txt && printf 'notes\\n' >> k.txt", 'git switch feature', 'git checkout -q -- k.txt', 'git switch feature', 'git status -s', 'git checkout HEAD~1', 'git status', 'git branch', 'git switch main', 'git switch --detach HEAD~1', 'git switch -c fix', 'git switch v1');
    expect(s.log[12].err).toEqual(['error: Your local changes to the following files would be overwritten by checkout:', '\tk.txt', 'Please commit your changes or stash them before you switch branches.', 'Aborting']);
    expect(s.log[14].err).toEqual(["Switched to branch 'feature'"]);
    expect(s.log[15].out).toEqual(['?? new.txt']);
    expect(s.log[16].err).toEqual(["Note: switching to 'HEAD~1'.", '', "You are in 'detached HEAD' state.", '', 'HEAD is now at ccfefbe feature edits']);
    expect(s.log[17].out).toEqual(['HEAD detached at ccfefbe', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)', '\tnew.txt', '', 'nothing added to commit but untracked files present (use "git add" to track)']);
    expect(s.log[18].out).toEqual(['* (HEAD detached at ccfefbe)', '  feature', '  main']);
    expect(s.log[19].err).toEqual(['Previous HEAD position was ccfefbe feature edits', "Switched to branch 'main'"]);
    expect(s.log[20].err).toEqual(['HEAD is now at af7fcdf base']);
    expect(s.log[21].err).toEqual(["Switched to a new branch 'fix'"]);
    expect(s.last.err).toEqual(['fatal: invalid reference: v1']);
  });
});

describe('rebase, revert, reset and restore', () => {
  const base = ['git init -q -b main app', 'cd app', "printf 'a\\nb\\nc\\n' > f.txt && git add . && git commit -q -m base", 'git switch -q -c feature', "printf 'a\\nB\\nc\\n' > f.txt && git commit -q -am 'feature B'",
    "printf 'x\\n' > x.txt && git add x.txt && git commit -q -m 'add x'", 'git switch -q main', "printf 'a\\nb2\\nc\\n' > f.txt && git commit -q -am 'main b2'", 'git switch -q feature'];
  it('a rebase stops on a conflict (markers name the commit), --continue replays the rest; IDs as in Git', () => {
    const s = fresh(...base, 'git rebase main', 'cat f.txt', 'git status', 'git branch', 'git rebase --continue', "printf 'a\\nB2\\nc\\n' > f.txt && git add f.txt", 'git rebase --continue', 'git log --oneline --graph --all');
    expect(s.log[9].out).toEqual(['Auto-merging f.txt', 'CONFLICT (content): Merge conflict in f.txt']);
    expect(s.log[9].err).toEqual(['error: could not apply 8376fe3... feature B', 'hint: Resolve the conflicts, mark them resolved with "git add/rm <conflicted_files>", then run "git rebase --continue".', 'Could not apply 8376fe3... feature B']);
    expect(s.log[9].status).toBe(1);
    expect(s.log[10].out).toEqual(['a', '<<<<<<< HEAD', 'b2', '=======', 'B', '>>>>>>> 8376fe3 (feature B)', 'c']);
    expect(s.log[11].out.slice(0, 3)).toEqual(['interactive rebase in progress; onto 8680f68', "You are currently rebasing branch 'feature' on '8680f68'.", '  (fix conflicts and then run "git rebase --continue")']);
    expect(s.log[12].out).toEqual(['* (no branch, rebasing feature)', '  feature', '  main']);
    expect(s.log[13].err).toEqual(['f.txt: needs merge', 'You must edit all merge conflicts and then', 'mark them as resolved using git add']);
    expect(s.log[15].out).toEqual(['[detached HEAD 4093044] feature B', ' 1 file changed, 1 insertion(+), 1 deletion(-)']);
    expect(s.log[15].err).toEqual(['Successfully rebased and updated refs/heads/feature.']);
    expect(s.last.out).toEqual(['* b312686 (HEAD -> feature) add x', '* 4093044 feature B', '* 8680f68 (main) main b2', '* 1577028 base']);
  });
  it('rebase --abort goes back; --skip drops the commit; up to date; a dirty worktree refuses', () => {
    const s = fresh(...base, 'git rebase main', 'git rebase --abort', 'git log --oneline -1', 'git rebase main', 'git rebase --skip', 'git log --oneline', 'git rebase main', "printf 'z\\n' >> x.txt", 'git rebase main', 'git rebase --abort');
    expect(s.log[11].out).toEqual(['47a6c6a (HEAD -> feature) add x']);
    expect(s.log[13].err).toEqual(['Successfully rebased and updated refs/heads/feature.']);
    expect(s.log[14].out).toEqual(['ea32c12 (HEAD -> feature) add x', '8680f68 (main) main b2', '1577028 base']);
    expect(s.log[15].out).toEqual(['Current branch feature is up to date.']);
    expect(s.log[17].err).toEqual(['error: cannot rebase: You have unstaged changes.', 'error: Please commit or stash them.']);
    expect(s.last.err).toEqual(['fatal: no rebase in progress']);
  });
  it('revert makes the reverse commit with git’s message; a conflict stops it; a merge needs -m', () => {
    const s = fresh(...base, 'git revert --no-edit HEAD', 'git log -1 --format=%B', 'git switch -q main', 'git merge -q --no-ff -m merged feature', 'git revert HEAD', 'git merge --abort');
    expect(s.log[9].out).toEqual(['[feature 74886b7] Revert "add x"', ' Date: Sun Nov 22 10:00:00 2026 +0000', ' 1 file changed, 1 deletion(-)', ' delete mode 100644 x.txt']);
    expect(s.log[10].out).toEqual(['Revert "add x"', '', 'This reverts commit 47a6c6a932fca8f886f4f2013563c9d5ebb6f17b.', '']);
    expect(s.log[12].out).toEqual(['Auto-merging f.txt', 'CONFLICT (content): Merge conflict in f.txt', 'Automatic merge failed; fix conflicts and then commit the result.']);
    expect(s.log[13].err).toEqual(['error: Reverting is not possible because you have unmerged files.', "hint: Fix them up in the work tree, and then use 'git add/rm <file>'", 'fatal: revert failed']);
    const m = fresh('git init -q -b main app', 'cd app', "printf 'a\\nb\\nc\\n' > f.txt && git add . && git commit -q -m base", 'git switch -q -c t', "printf 'x\\n' > x.txt && git add . && git commit -q -m 'add x'",
      'git switch -q main', "printf 'a\\nb\\nC\\n' > f.txt && git commit -q -am 'C'", 'git merge -q --no-ff -m merged t', 'git revert HEAD', 'git revert --no-edit -m 1 HEAD', 'git log -1 --format=%B', "printf 'a\\nb\\nCC\\n' > f.txt && git commit -qam CC", 'git revert --no-edit HEAD~3', 'cat f.txt', 'git status -s', 'git revert --abort', 'git status -s');
    expect(m.log[8].err).toEqual([expect.stringMatching(/^error: commit [0-9a-f]{40} is a merge but no -m option was given\.$/), 'fatal: revert failed']);
    expect(m.log[9].out.slice(0, 1)).toEqual([expect.stringMatching(/^\[main [0-9a-f]{7}\] Revert "merged"$/)]);
    expect(m.log[10].out[2]).toMatch(/^This reverts commit [0-9a-f]{40}, reversing$/);
    expect(m.log[10].out[3]).toMatch(/^changes made to [0-9a-f]{40}\.$/);
    expect(m.log[12].out).toEqual(['Auto-merging f.txt', 'CONFLICT (content): Merge conflict in f.txt']);
    expect(m.log[12].err).toEqual([expect.stringMatching(/^error: could not revert [0-9a-f]{7}\.\.\. C$/), 'hint: After resolving the conflicts, mark them with "git add/rm <pathspec>", then run "git revert --continue".']);
    expect(m.log[13].out).toEqual(['a', 'b', '<<<<<<< HEAD', 'CC', '=======', 'c', expect.stringMatching(/^>>>>>>> parent of [0-9a-f]{7} \(C\)$/)]);
    expect(m.log[14].out).toEqual(['UU f.txt']);
    expect(m.last.out).toEqual([]);
  });
  it('reset --soft, --mixed (Unstaged changes after reset) and --hard (HEAD is now at); restore and checkout -- paths', () => {
    const s = fresh(...base, 'git reset --soft HEAD~1', 'git status -s', 'git reset', 'git status -s', 'git reset --hard', 'git status -s', 'git reset --hard ORIG_HEAD',
      "printf 'q\\n' > f.txt", 'git add f.txt', 'git restore --staged f.txt', 'git status -s', 'git restore f.txt', 'git status -s', 'git restore nope', 'git reset HEAD@{u}');
    expect(s.log[10].out).toEqual(['A  x.txt']);
    expect(s.log[12].out).toEqual(['?? x.txt']);
    expect(s.log[13].out).toEqual(['HEAD is now at 8376fe3 feature B']);
    expect(s.log[14].out).toEqual(['?? x.txt']);
    expect(s.log[15].out).toEqual(['HEAD is now at 8376fe3 feature B']);
    expect(s.log[19].out).toEqual([' M f.txt', '?? x.txt']);
    expect(s.log[21].out).toEqual(['?? x.txt']);
    expect(s.log[22].err).toEqual(["error: pathspec 'nope' did not match any file(s) known to git"]);
    expect(s.last.err).toEqual(["fatal: no upstream configured for branch 'feature'"]);
  });
});

describe('the forge github.example: clone, fetch, push, pull', () => {
  const edit = ['cd shop', "printf 'port: 8080\\n' > config.yml", "git commit -q -am 'Use port 8080'"];
  it('the example: status before fetch, git fetch’s lines, status -sb after', () => {
    expect(terminalContentProblems(gitContent)).toEqual([]);
    expect(lab('cd shop', 'git fetch', 'git fetch').last.all).toEqual([]);
  });
  it('a push the forge has moved past is rejected (fetch first, then non-fast-forward)', () => {
    const s = lab(...edit, 'git push', 'git fetch -q', 'git push', 'git status');
    expect(s.log[3].err).toEqual([`To ${SHOP}`, ' ! [rejected]        main -> main (fetch first)', `error: failed to push some refs to '${SHOP}'`,
      'hint: Updates were rejected because the remote contains work that you do not have locally; integrate it first (git pull) and push again.']);
    expect(s.log[3].status).toBe(1);
    expect(s.log[5].err[1]).toBe(' ! [rejected]        main -> main (non-fast-forward)');
    expect(s.last.out.slice(0, 4)).toEqual(['On branch main', "Your branch and 'origin/main' have diverged,", 'and have 1 and 1 different commits each, respectively.', '  (use "git pull" if you want to integrate the remote branch with yours)']);
  });
  it('git pull: the divergent-branches error, --ff-only, --rebase, pull.rebase, a fast-forward', () => {
    const s = lab(...edit, 'git pull', 'git pull --ff-only', 'git config pull.rebase true', 'git pull', 'git log --oneline --graph', 'git push');
    expect(s.log[3].err.slice(-2)).toEqual(['hint: You have divergent branches and need to specify how to reconcile them.', 'fatal: Need to specify how to reconcile divergent branches.']);
    expect(s.log[3].err[0]).toBe('From https://github.example/island/shop');
    expect(s.log[3].status).toBe(128);
    expect(s.log[4].err).toEqual(['fatal: Not possible to fast-forward, aborting.']);
    expect(s.log[6].err).toEqual(['Successfully rebased and updated refs/heads/main.']);
    expect(s.log[7].out).toEqual([expect.stringMatching(/^\* [0-9a-f]{7} \(HEAD -> main\) Use port 8080$/), '* c314c03 (origin/main, origin/HEAD) Greet in full', '* 73207f3 Add config', '* 6a0389d (tag: v0.1) Initial commit']);
    expect(s.last.err).toEqual([`To ${SHOP}`, expect.stringMatching(/^ {3}c314c03\.\.[0-9a-f]{7} {2}main -> main$/)]);
    const ff = lab('cd shop', 'git pull', 'git pull');
    expect(ff.log[1].out).toEqual(['Updating 73207f3..c314c03', 'Fast-forward', ' app.py | 2 +-', ' 1 file changed, 1 insertion(+), 1 deletion(-)']);
    expect(ff.last.out).toEqual(['Already up to date.']);
  });
  it('a merging pull names the remote; a conflict marks the other side with its ID', () => {
    const s = lab('cd shop', "printf \"print('hey')\\n\" > app.py", "git commit -q -am 'Say hey'", 'git pull --no-rebase', 'cat app.py');
    expect(s.log[3].out).toEqual(['Auto-merging app.py', 'CONFLICT (content): Merge conflict in app.py', 'Automatic merge failed; fix conflicts and then commit the result.']);
    expect(s.last.out).toEqual(['<<<<<<< HEAD', "print('hey')", '=======', "print('hello')", `>>>>>>> ${REAL_IDS.c3}`]);
    expect(lab(...edit, 'git pull --no-rebase', 'git log -1 --format=%s').last.out).toEqual(["Merge branch 'main' of https://github.example/island/shop"]);
  });
  it('a new branch: no upstream, push -u, --tags, --delete, --force-with-lease', () => {
    const s = lab('cd shop', 'git switch -q -c search', 'git push', 'git push -u origin search', 'git status -sb', 'git tag -a v1.0 -m v1', 'git push --tags', 'git push origin --delete search', 'git push origin nope', 'git branch -vv');
    expect(s.log[2].err).toEqual(['fatal: The current branch search has no upstream branch.', '    git push --set-upstream origin search']);
    expect(s.log[2].status).toBe(128);
    expect(s.log[3].err).toEqual([`To ${SHOP}`, ' * [new branch]      search -> search']);
    expect(s.log[3].out).toEqual(["branch 'search' set up to track 'origin/search'."]);
    expect(s.log[4].out).toEqual(['## search...origin/search']);
    expect(s.log[6].err).toEqual([`To ${SHOP}`, ' * [new tag]         v1.0 -> v1.0']);
    expect(s.log[7].err).toEqual([`To ${SHOP}`, ' - [deleted]         search']);
    expect(s.log[8].err).toEqual(['error: src refspec nope does not match any', `error: failed to push some refs to '${SHOP}'`]);
    expect(s.last.out).toEqual(['  main   73207f3 [origin/main] Add config', '* search 73207f3 [origin/search: gone] Add config']);
    const lease = lab(...edit, 'git push --force-with-lease', 'git fetch -q', 'git push --force-with-lease');
    expect(lease.log[3].err[1]).toBe(' ! [rejected]        main -> main (stale info)');
    expect(lease.last.err[1]).toMatch(/^ \+ c314c03\.\.\.[0-9a-f]{7} main -> main \(forced update\)$/);
  });
  it('clone: Cloning into, the files, origin/HEAD, the tracking branch; errors', () => {
    const s = lab(`git clone ${SHOP} copy`, 'cd copy', 'git branch -a', 'cat app.py', 'git log --oneline -2', 'cd ..', `git clone ${SHOP} copy`, 'git clone https://github.example/island/nope.git', 'git clone https://gitlab.example/x/y.git', `git clone ${EMPTY}`, `git clone -b feature ${SHOP} f`, 'git -C f status -sb', 'git clone git@github.example:island/shop.git s');
    expect(s.log[0].err).toEqual(["Cloning into 'copy'..."]);
    expect(s.log[2].out).toEqual(['* main', '  remotes/origin/HEAD -> origin/main', '  remotes/origin/feature', '  remotes/origin/main']);
    expect(s.log[3].out).toEqual(["print('hello')"]);
    expect(s.log[4].out).toEqual(['c314c03 (HEAD -> main, origin/main, origin/HEAD) Greet in full', '73207f3 Add config']);
    expect(s.log[6].err).toEqual(["fatal: destination path 'copy' already exists and is not an empty directory."]);
    expect(s.log[7].err).toEqual(["Cloning into 'nope'...", 'remote: Repository not found.', "fatal: repository 'https://github.example/island/nope.git/' not found"]);
    expect(s.log[8].err).toEqual(["Cloning into 'y'...", "fatal: unable to access 'https://gitlab.example/x/y.git/': Could not resolve host: gitlab.example"]);
    expect(s.log[9].err).toEqual(["Cloning into 'empty'...", 'warning: You appear to have cloned an empty repository.']);
    expect(s.log[11].out).toEqual(['## feature...origin/feature']);
    expect(s.last.err[1]).toBe("fatal: 'git@github.example:island/shop.git' does not appear to be a git repository");
    expect(s.state.nodes.get('/home/learner/copy/.git')?.kind).toBe('dir');
    expect(s.state.nodes.has('/home/learner/nope')).toBe(false);
  });
  it('remote add, -v, rename, remove; push to a new empty repository; fetch --prune', () => {
    const s = lab('git init -q -b main site', 'cd site', 'touch index.html && git add . && git commit -q -m site', 'git push', `git remote add origin ${EMPTY}`, `git remote add origin ${EMPTY}`, 'git remote -v', 'git push -u origin main', 'git remote rename origin up', 'git remote', 'git remote remove nope');
    expect(s.log[3].err).toEqual(['fatal: No configured push destination.']);
    expect(s.log[5].err).toEqual(['error: remote origin already exists.']);
    expect(s.log[5].status).toBe(3);
    expect(s.log[6].out).toEqual([`origin\t${EMPTY} (fetch)`, `origin\t${EMPTY} (push)`]);
    expect(s.log[7].err).toEqual([`To ${EMPTY}`, ' * [new branch]      main -> main']);
    expect(s.log[9].out).toEqual(['up']);
    expect(s.last.err).toEqual(["error: No such remote: 'nope'"]);
    const p = lab('git clone -q https://github.example/island/shop.git a', 'git clone -q https://github.example/island/shop.git b', 'git -C a push -q origin --delete feature', 'git -C b fetch --prune', 'git -C b branch -r');
    expect(p.log[3].err).toEqual(['From https://github.example/island/shop', ' - [deleted]         (none)     -> origin/feature']);
    expect(p.last.out).toEqual(['  origin/HEAD -> origin/main', '  origin/main']);
  });
});

describe('configuration and identity', () => {
  it('without user.name and user.email a commit fails with git’s first line and the auto-detect line', () => {
    const s = session(anonymousLab, GIT_PROFILE, 'cd notes', "printf 'x\\n' >> notes.txt", 'git commit -qam x', 'git config --global user.email mei@example.com', 'git commit -qam x', 'git config --global user.name "Mei Lin"', 'git commit -qam x', 'cat ~/.gitconfig', 'git config --list');
    expect(s.log[2].err).toEqual(['Author identity unknown', "fatal: unable to auto-detect email address (got 'learner@dev-01.(none)')"]);
    expect(s.log[2].status).toBe(128);
    expect(s.log[4].err).toEqual(['Author identity unknown', 'fatal: empty ident name (for <mei@example.com>) not allowed']);
    expect(s.log[6].status).toBe(0);
    expect(s.log[7].out).toEqual(['[user]', '\temail = mei@example.com', '\tname = Mei Lin']);
    expect(s.last.out).toEqual(['user.email=mei@example.com', 'user.name=Mei Lin', 'core.repositoryformatversion=0', 'core.filemode=true', 'core.bare=false', 'core.logallrefupdates=true']);
  });
  it('repository settings win over ~/.gitconfig; get, unset, errors', () => {
    const s = lab('cd notes', 'git config user.name "Notes Bot"', 'git config user.name', 'git config --global user.name', 'git config --unset user.name', 'git config user.name', 'git config core.nothing', 'git config nosection', 'cd ..', 'git config user.name x', 'git config --global init.defaultBranch main', 'git init -q z', 'git -C z status');
    expect(s.log[2].out).toEqual(['Notes Bot']);
    expect(s.log[3].out).toEqual(['Mei Lin']);
    expect(s.log[5].out).toEqual(['Mei Lin']);
    expect(s.log[6].status).toBe(1);
    expect(s.log[7].err).toEqual(['error: key does not contain a section: nosection']);
    expect(s.log[9].err).toEqual(['fatal: not in a git directory']);
    expect(s.last.out[0]).toBe('On branch main');
  });
  it('config files: git’s format, sections with subsections, quoting', () => {
    expect(parseConfig('[user]\n\tname = Mei Lin\n[remote "origin"]\n\turl = https://x ; comment\n[core]\n\tbare\n')).toEqual([['user.name', 'Mei Lin'], ['remote.origin.url', 'https://x'], ['core.bare', 'true']]);
    expect(editConfig('', 'user.name', 'Mei Lin')).toBe('[user]\n\tname = Mei Lin\n');
    expect(editConfig('[user]\n\tname = A\n', 'user.name', ' B ')).toBe('[user]\n\tname = " B "\n');
    expect(editConfig('[user]\n\tname = A\n', 'branch.main.remote', 'origin')).toBe('[user]\n\tname = A\n[branch "main"]\n\tremote = origin\n');
    expect(canonicalKey('Branch.Main.Remote')).toBe('branch.Main.remote');
  });
});

describe('the checks branch, worktree and tag', () => {
  const verdict = (x: TerminalExercise, commands: string[]) => checkTerminalExercise(x, [gitLab], commands).results.map(r => r.message);
  it('the exercises: the solutions pass, the typical mistakes fail with these messages', () => {
    expect(checkTerminalExercise(pushExercise, [gitLab], pushExercise.solution).ok).toBe(true);
    expect(verdict(pushExercise, pushExercise.mistakes[0].commands)[0]).toBe(`${SHOP} 應該有分支 main（config.yml 的內容符合題目，歷史是一直線（沒有合併 commit），包含 c3），但它的最新 commit 裡 config.yml 的內容不同`);
    expect(verdict(pushExercise, pushExercise.mistakes[1].commands)[0]).toMatch(/，但它沒有包含 c3$/);
    expect(verdict(pushExercise, pushExercise.mistakes[2].commands)[0]).toMatch(/，但它的歷史有合併 commit$/);
    expect(verdict(mergeExercise, mergeExercise.mistakes[0].commands)[0]).toMatch(/，但它的最新 commit 裡 notes\.txt 的內容不同$/);
    expect(verdict(mergeExercise, ['cd notes', 'git merge topic || true'])[1]).toBe('/home/learner/notes 應該沒有未提交的變更，但合併還沒有完成');
    expect(verdict(tagExercise, tagExercise.mistakes[0].commands)).toEqual([`${SHOP} 應該有標籤 v1.0（指向 c2，是附註標籤（-a）），但它是輕量標籤`]);
    expect(verdict(tagExercise, tagExercise.mistakes[1].commands)).toEqual([`${SHOP} 應該有標籤 v1.0（指向 c2，是附註標籤（-a）），但沒有標籤 v1.0`]);
  });
  it('local and remote branches, absent, message, parents, includes; worktree branch and untracked files; tags', () => {
    const ex = (checks: TerminalCheck[]): TerminalExercise => ({ ...tagExercise, checks });
    const after = ['cd notes', 'git switch -q topic', "git commit -q --allow-empty -m 'Fix: typo'", 'touch scratch.txt', 'git tag old HEAD~2', 'git branch -D main'];
    const run = (checks: TerminalCheck[]) => verdict(ex(checks), after);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'topic', message: '^Fix:', parents: 1, includes: 'n1' }])).toEqual(['/home/learner/notes 應該有分支 topic（最新 commit 的訊息符合題目，最新 commit 有 1 個父 commit，包含 n1）']);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'topic', message: '^Add' }])[0]).toMatch(/，但它最新的 commit 是「Fix: typo」$/);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'topic', includes: 'n2' }])[0]).toMatch(/，但它沒有包含 n2$/);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'main', absent: true }])).toEqual(['/home/learner/notes 應該沒有分支 main']);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'topic', absent: true }])[0]).toMatch(/，但分支 topic 還在$/);
    expect(run([{ kind: 'branch', repo: '/home/learner/shop', name: 'feature', remote: true, file: { path: 'search.py', includes: 'def search' } }])).toEqual(['/home/learner/shop 的 origin（github.example）上應該有分支 feature（search.py 包含「def search」）']);
    expect(run([{ kind: 'branch', repo: '/home/learner/shop', name: 'feature' }])[0]).toMatch(/，但沒有分支 feature$/);
    expect(run([{ kind: 'branch', repo: '/home/learner/notes', name: 'topic', remote: true }])[0]).toMatch(/，但\/home\/learner\/notes 沒有指向 github\.example 的 origin$/);
    expect(run([{ kind: 'worktree', repo: '/home/learner/notes', branch: 'main' }])[0]).toMatch(/，但目前在分支 topic$/);
    expect(run([{ kind: 'worktree', repo: '/home/learner/notes', clean: true }])[0]).toMatch(/，但還有沒追蹤的檔案$/);
    expect(run([{ kind: 'worktree', repo: '/home/learner/nowhere', clean: true }])[0]).toMatch(/，但\/home\/learner\/nowhere 不是 Git 儲存庫$/);
    expect(run([{ kind: 'tag', repo: '/home/learner/notes', name: 'old', at: 'n1', annotated: false }])).toEqual(['/home/learner/notes 應該有標籤 old（指向 n1，是輕量標籤）']);
    expect(run([{ kind: 'tag', repo: '/home/learner/notes', name: 'old', at: 'topic' }])[0]).toMatch(/，但它指向 ccbd218 Start notes$/);
    expect(run([{ kind: 'tag', repo: SHOP, name: 'v0.1', at: 'c1', annotated: true }])).toEqual([`${SHOP} 應該有標籤 v0.1（指向 c1，是附註標籤（-a））`]);
    expect(run([{ kind: 'tag', repo: '/home/learner/notes', name: 'old', absent: true }])[0]).toMatch(/，但標籤 old 還在$/);
    expect(verdict(ex([{ kind: 'worktree', repo: '/home/learner/notes', clean: true }]), ['cd notes', 'git switch -q --detach HEAD'])).toEqual(['/home/learner/notes 應該沒有未提交的變更']);
    expect(verdict(ex([{ kind: 'worktree', repo: '/home/learner/notes', branch: 'main' }]), ['cd notes', 'git switch -q --detach HEAD'])[0]).toMatch(/，但HEAD 是分離的（detached HEAD）$/);
  });
  it('check data: a git machine, a repo path or forge URL, valid names, patterns and fields', () => {
    const problems = (checks: TerminalCheck[], machine = gitLab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [{ ...tagExercise, checks }] }).filter(p => !p.includes('solution fails') && !p.includes('passes'));
    expect(problems([{ kind: 'branch', repo: 'notes', name: 'main' }])).toEqual(['exercise tag: a branch check needs a git machine (engine stage E25) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)']);
    expect(problems([{ kind: 'branch', repo: '/home/learner/notes', name: 'bad name' }])).toEqual(['exercise tag: a branch check needs a valid name']);
    expect(problems([{ kind: 'branch', repo: '/home/learner/notes', name: 'main', message: '(' }])).toEqual(["exercise tag: a branch check's message is not a regular expression"]);
    expect(problems([{ kind: 'branch', repo: '/home/learner/notes', name: 'main', file: { path: 'notes.txt' } }])).toEqual(["exercise tag: a branch check's file needs a relative path and content or includes"]);
    expect(problems([{ kind: 'branch', repo: '/home/learner/notes', name: 'main', parents: 3 }])).toEqual(["exercise tag: a branch check's parents must be 0, 1 or 2"]);
    expect(problems([{ kind: 'branch', repo: '/home/learner/notes', name: 'main', absent: true, parents: 1 }])).toEqual(['exercise tag: an absent branch check takes only repo, name and remote']);
    expect(problems([{ kind: 'worktree', repo: SHOP, clean: true }])).toEqual(['exercise tag: a worktree check needs a local repo and clean or a valid branch']);
    expect(problems([{ kind: 'worktree', repo: '/home/learner/notes' }])).toEqual(['exercise tag: a worktree check needs a local repo and clean or a valid branch']);
    expect(problems([{ kind: 'tag', repo: SHOP, name: 'v1.0' }], { ...gitLab, profile: 'runtime', git: undefined })).toContain('exercise tag: a tag check needs a git machine (engine stage E25) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
  });
});

describe('lesson data', () => {
  const bad = (git: TerminalMachine['git']) => machineProblems({ ...gitLab, git }).map(p => p.replace('machine dev-01: ', ''));
  const commits = gitLab.git!.commits!;
  it('commits: labels, parents, messages, times, zones, paths, contents, executables, authors', () => {
    expect(bad({ commits: [...commits, { ...commits[0] }] })).toContain('git commit c1: needs a unique label of letters, digits, . _ -');
    expect(bad({ commits: [{ id: 'a', parents: ['zz'], message: 'x', time: '2026-11-20 01:00:00' }] })).toEqual(['git commit a: parent zz is not a commit listed before it']);
    expect(bad({ commits: [{ id: 'a', message: ' ', time: 'yesterday', tz: '8' }] })).toEqual(['git commit a: needs a message of 1..2000 characters', 'git commit a: needs a time YYYY-MM-DD HH:MM:SS (UTC)', 'git commit a: tz must look like +0800']);
    expect(bad({ commits: [{ id: 'a', message: 'x', time: '2026-11-20 01:00:00', files: { '/abs': 'x', 'a/../b': 'x', '.git/config': 'x', d: 'x', 'd/e': 'x' }, executable: ['nope'] }] })).toEqual([
      'git commit a: file /abs must be a relative, normalized path without .git', 'git commit a: file a/../b must be a relative, normalized path without .git', 'git commit a: file .git/config must be a relative, normalized path without .git',
      'git commit a: executable nope is not a file it writes', 'git commit a: d is both a file and a folder']);
    expect(bad({ commits: [{ id: 'a', message: 'x', time: '2026-11-20 01:00:00', author: { name: 'x', email: 'nope' } }] })).toEqual(['git commit a: needs a name and an email like mei@example.com']);
  });
  it('remotes and repos: URLs, branches, heads, origins, paths, upstreams, tags, staged files, config', () => {
    expect(bad({ commits, remotes: [{ url: 'https://github.com/a/b.git', branches: { main: 'c1' } }] })).toEqual(['git remote https://github.com/a/b.git: needs a unique URL https://github.example/<owner>/<repo>.git']);
    expect(bad({ commits, remotes: [{ url: SHOP, branches: { 'a b': 'c1', main: 'zz' }, head: 'dev', tags: [{ name: 'v1', at: 'zz' }] }] })).toEqual([
      `git remote ${SHOP}: invalid branch name a b`, `git remote ${SHOP} branch main: zz is not a commit label`, `git remote ${SHOP}: head dev is not one of its branches`, `git remote ${SHOP} tag v1: zz is not a commit label`]);
    expect(bad({ commits, repos: [{ path: 'shop' }, { path: '/home/learner/a', origin: SHOP }, { path: '/home/learner/a/b' }] })).toEqual([
      'git repo shop: needs an absolute, normalized path (not /, not inside another repo)', `git repo /home/learner/a: origin ${SHOP} is not one of git.remotes`, 'git repo /home/learner/a/b: needs an absolute, normalized path (not /, not inside another repo)']);
    expect(bad({ commits, repos: [{ path: '/home/learner/a', branches: { main: 'c1' }, head: 'dev', upstream: ['main'], staged: { '../x': 'y' }, config: { nokey: 'x' } }] })).toEqual([
      'git repo /home/learner/a: head dev is neither a branch nor a commit label', 'git repo /home/learner/a: upstream main needs a local branch and an origin',
      'git repo /home/learner/a: staged ../x needs a relative path and content (or null)', 'git repo /home/learner/a: config nokey needs a key section.name and a one-line value']);
    expect(bad({ commits: Array.from({ length: 61 }, (_, i) => ({ id: `k${i}`, message: 'x', time: '2026-11-20 01:00:00' })) })).toContain('git: at most 60 commits, 4 remotes and 4 repos');
    expect(bad({ user: { name: '', email: 'a@b' } })).toEqual(['git user: needs a name and an email like mei@example.com']);
  });
  it('a repository: the worktree is HEAD’s files (the lesson’s own file is a local change), staged changes, a detached HEAD', () => {
    const m: TerminalMachine = { ...gitLab, files: [...gitLab.files, { path: '/home/learner/notes', kind: 'dir', mode: 0o755, owner: 'learner' }, { path: '/home/learner/notes/notes.txt', kind: 'file', mode: 0o644, owner: 'learner', content: 'mine\n' }],
      git: { ...gitLab.git, repos: [{ path: '/home/learner/notes', branches: { main: 'n2', topic: 'n3' }, staged: { 'todo.txt': 'staged\n' } }, { path: '/home/learner/old', head: 'n1', branches: { main: 'n2' } }] } };
    expect(machineProblems(m)).toEqual([]);
    const s = session(m, GIT_PROFILE, 'cd notes', 'git status -s', 'ls -l run.sh', 'cd ../old', 'git status', 'cat notes.txt');
    expect(s.log[1].out).toEqual([' M notes.txt', 'A  todo.txt']);
    expect(s.log[2].out[0]).toMatch(/^-rwxr-xr-x learner learner /);
    expect(s.log[4].out).toEqual(['HEAD detached at ccbd218', 'nothing to commit, working tree clean']);
    expect(s.last.out).toEqual(['title', 'first draft', 'end']);
  });
  it('does not change the state it is given, and replays the same way twice', () => {
    const start = machineState(gitLab), before = JSON.stringify([...start.nodes], null, 0), objects = start.git!.objects.size;
    const a = session(start, GIT_PROFILE, ...pushExercise.solution), b = session(start, GIT_PROFILE, ...pushExercise.solution);
    expect(JSON.stringify([...start.nodes], null, 0)).toBe(before);
    expect(start.git!.objects.size).toBe(objects);
    expect(start.git!.forge[0].refs.get('refs/heads/main')).toBe(REAL_IDS.c3);
    expect(a.log.map(l => l.all)).toEqual(b.log.map(l => l.all));
  });
});

describe('variants', () => {
  it('a variant replaces the git data, so an ID read from git log differs; it needs the git profile', () => {
    const other = { ...gitLab.git!, commits: gitLab.git!.commits!.map(c => c.id === 'n2' ? { ...c, message: 'Polish the draft again' } : c) };
    const exercise: TerminalExercise = { ...tagExercise, id: 'id', checks: [{ kind: 'output', fromCommand: '^git ' }], solution: ['git -C notes log --format=%h -1'], mistakes: [{ commands: ['echo bff6c17'], why: '直接打出答案' }], variants: [{ label: '另一個訊息', files: [], git: other }] };
    expect(terminalContentProblems({ machines: [gitLab], examples: [], exercises: [exercise] })).toEqual([]);
    expect(checkTerminalExercise(exercise, [gitLab], ['echo bff6c17']).ok).toBe(false);
    const low = terminalContentProblems({ machines: [runtimeLab], examples: [], exercises: [{ ...exercise, machine: 'rt-01', solution: ['echo x'], mistakes: [{ commands: ['echo y'], why: 'x' }] }] });
    expect(low).toContain('exercise id: variant 另一個訊息: git needs the git profile (engine stage E25)');
  });
});

describe('log --graph with two merges (graph.c, compared with real Git)', () => {
  it('the medium format with Merge: lines and the separators drawn with the next commit’s columns; --format with --all', () => {
    const s = fresh('git init -q -b main app', 'cd app', 'touch a && git add a && git commit -qm a', 'git switch -q -c f1', 'touch b && git add b && git commit -qm b', 'touch c && git add c && git commit -qm c',
      'git switch -q main', 'touch d && git add d && git commit -qm d', 'git switch -q -c f2', 'touch e && git add e && git commit -qm e', 'git switch -q main',
      'git merge -q --no-ff -m m1 f1', 'git merge -q --no-ff -m m2 f2', 'touch g && git add g && git commit -qm g', 'git log --graph', "git log --graph --format='%h %s' --all");
    expect(s.log[11].all).toEqual([]);
    expect(s.log[14].out).toEqual(["* commit a57c5d94384da0c6191d773f72ad27bdfbea8bbf (HEAD -> main)", "| Author: Mei Lin <mei@example.com>", "| Date:   Sun Nov 22 10:00:00 2026 +0000", "| ", "|     g", "|   ", "*   commit f5f3544a1862160958d17a033ac77c3913907ef6", "|\\  Merge: 2ea06f4 49c1258", "| | Author: Mei Lin <mei@example.com>", "| | Date:   Sun Nov 22 10:00:00 2026 +0000", "| | ", "| |     m2", "| | ", "| * commit 49c1258905373049f5ade5eec9239a1b2975338c (f2)", "| | Author: Mei Lin <mei@example.com>", "| | Date:   Sun Nov 22 10:00:00 2026 +0000", "| | ", "| |     e", "| |   ", "* |   commit 2ea06f46b55f22e3263ee098be7338142ae36a40", "|\\ \\  Merge: 419929f 1357368", "| |/  Author: Mei Lin <mei@example.com>", "|/|   Date:   Sun Nov 22 10:00:00 2026 +0000", "| |   ", "| |       m1", "| | ", "| * commit 135736862548c3445d62fce8860f3305d3eb2f25 (f1)", "| | Author: Mei Lin <mei@example.com>", "| | Date:   Sun Nov 22 10:00:00 2026 +0000", "| | ", "| |     c", "| | ", "| * commit 225c840b09170f4165b69062b877a68bb61f0c9b", "| | Author: Mei Lin <mei@example.com>", "| | Date:   Sun Nov 22 10:00:00 2026 +0000", "| | ", "| |     b", "| | ", "* | commit 419929f0497bfa27604bf053d3bb79a465d4e831", "|/  Author: Mei Lin <mei@example.com>", "|   Date:   Sun Nov 22 10:00:00 2026 +0000", "|   ", "|       d", "| ", "* commit 783785387cd95420b4bd055b38ab173187efc31d", "  Author: Mei Lin <mei@example.com>", "  Date:   Sun Nov 22 10:00:00 2026 +0000", "  ", "      a"]);
    expect(s.last.out).toEqual(["* a57c5d9 g", "*   f5f3544 m2", "|\\  ", "| * 49c1258 e", "* |   2ea06f4 m1", "|\\ \\  ", "| |/  ", "|/|   ", "| * 1357368 c", "| * 225c840 b", "* | 419929f d", "|/  ", "* 7837853 a"]);
  });
});

describe('fix (CICD-2): a declared repository knows its own commits', () => {
  it('rewriting a branch that matches the remote and pushing is non-fast-forward, not fetch first', () => {
    const synced: TerminalMachine = { ...gitLab, git: { ...gitLab.git!, repos: [{ path: '/home/learner/shop', origin: SHOP, branches: { main: 'c3' }, tracking: { main: 'c3' } }] } };
    const r = session(synced, GIT_PROFILE, 'cd shop', 'git commit --amend -m "Rewrite the last commit"', 'git push');
    const out = r.last.all.join('\n');
    expect(out).toContain('(non-fast-forward)');
    expect(out).not.toContain('(fetch first)');
  });
});
