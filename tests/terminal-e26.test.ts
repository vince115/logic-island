import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { FORGE_PROFILE, GIT_PROFILE, run } from '@/lib/terminal/shell';
import { GH_MANUAL } from '@/lib/terminal/manual';
import { readTree } from '@/lib/terminal/git';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalExercise, type TerminalMachine } from '@/lib/terminal/lesson';
import { forgeContent, forgeLab, prExercise, protectExercise, readExercise, SHOP, TOOLS } from './support/forge-fixture';
import { gitLab } from './support/git-fixture';

/*
 * Engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md): the forge profile — gh (about 2.65) against github.example,
 * pull requests (create, list, view, diff, checkout, review, merge, checks, close), reviewer personas on the clock, branch
 * protection on pushes and merges, the three merge methods with GitHub's histories, gh api for repository settings and
 * branch protection (GET and PUT with the REST body), the checks pull-request and protection, and the lesson data. Below
 * the profile gh stays "command not found" and git behaves exactly as in E25.
 */
function session(from: FsState | TerminalMachine, profile = FORGE_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; all: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), all: r.lines.map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(forgeLab, FORGE_PROFILE, ...commands);
const forgeOf = (s: FsState, url = SHOP) => s.git!.forge.find(f => f.url === url)!;
const labels = machineState(forgeLab).git!.labels!;
/** The learner's branch greet (app.py greets in full) pushed and a pull request #8 opened from it. */
const OPEN = ['cd shop', 'git switch -q -c greet', "printf \"print('hello')\\n\" > app.py", "git commit -qam 'Greet in full'", 'git push -q -u origin greet', "gh pr create --title 'Greet in full' --body 'Say hello.'"];

describe('the forge profile', () => {
  it('is the git profile with gh and the forge feature', () => {
    expect([...FORGE_PROFILE.commands].filter(c => c !== 'gh').sort()).toEqual([...GIT_PROFILE.commands].sort());
    expect(GIT_PROFILE.commands).not.toContain('gh');
    expect(FORGE_PROFILE.features).toEqual([...GIT_PROFILE.features!, 'forge']);
    expect(profileOf(forgeLab)).toBe(FORGE_PROFILE);
    expect(machineProblems(forgeLab)).toEqual([]);
    expect(terminalContentProblems(forgeContent)).toEqual([]);
  });
  it('below it gh is not found, the forge data and checks need the profile, and git pushes print no GitHub lines', () => {
    const low = session(gitLab, GIT_PROFILE, 'gh pr list', 'nosuchcommand pr list');
    expect(low.log[0].err).toEqual(low.log[1].err.map(l => l.replace('nosuchcommand', 'gh')));
    expect(low.log[0].status).toBe(127);
    expect(machineProblems({ ...forgeLab, profile: 'git' })).toContain('machine dev-03: forge needs the forge profile (engine stage E26)');
    const p = terminalContentProblems({ ...forgeContent, machines: [{ ...forgeLab, profile: 'git', forge: undefined }] });
    expect(p).toContain('example list: gh is not in the git profile of machine dev-03');
    expect(p).toContain('exercise pr: a pull-request check needs a forge machine (engine stage E26) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(p).toContain('exercise protect: a protection check needs a forge machine (engine stage E26) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(p).toContain('exercise read: variant 兩個核准: forge needs the forge profile (engine stage E26)');
    // The same push at the git profile (E25) has no protection and no "Create a pull request" lines.
    const push = ['cd shop', 'git switch -q -c greet', 'git push -u origin greet'];
    expect(session({ ...forgeLab, profile: 'git', forge: undefined }, GIT_PROFILE, ...push).last.err).toEqual(['To https://github.example/island/shop.git', ' * [new branch]      greet -> greet']);
    expect(session({ ...forgeLab, profile: 'git', forge: undefined }, GIT_PROFILE, 'cd shop', "git commit -q --allow-empty -m x", 'git pull -q --rebase', 'git push').last.status).toBe(0);
  });
  it('has its manual page, help line, version and gh’s errors for unknown commands', () => {
    expect(lab('gh --help').last.out[0]).toBe(`用法：${GH_MANUAL.gh.usage}`);
    expect(lab('man gh').last.out[3]).toMatch(/^ {7}gh - GitHub CLI/);
    expect(lab('help').last.out.find(l => l.startsWith('  gh '))).toMatch(/^ {2}gh auth status \| repo view \| pr create/);
    expect(lab('gh --version').last.out).toEqual(['gh version 2.65.0 (2025-01-06)', 'https://github.com/cli/cli/releases/tag/v2.65.0']);
    expect(lab('gh').last.out.slice(0, 4)).toEqual(['Work seamlessly with GitHub from the command line.', '', 'USAGE', '  gh <command> <subcommand> [flags]']);
    expect(lab('gh nope').last.err).toEqual(['unknown command "nope" for "gh"', '', 'Usage:  gh <command> <subcommand> [flags]']);
    expect(lab('gh issue list').last.err[0]).toMatch(/^gh issue：模擬環境不支援這個指令/);
    expect(lab('gh pr status').last.err[0]).toMatch(/^gh pr status：模擬環境不支援這個指令/);
    expect(lab('cd shop', 'gh pr list --bogus').last.err).toEqual(['unknown flag: --bogus', '', 'Usage:  gh pr list [flags]']);
    expect(lab('cd shop', 'gh pr create -t').last.err[0]).toBe("flag needs an argument: 't' in -t");
  });
  it('gh auth status shows the account; the token is never printed', () => {
    expect(lab('gh auth status').last.out).toEqual(['github.example', '  ✓ Logged in to github.example account mei-lin (keyring)', '  - Active account: true', '  - Git operations protocol: https',
      `  - Token: gho_${'*'.repeat(36)}`, "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'"]);
    expect(lab('gh auth token').last.err[0]).toMatch(/^gh auth token：模擬環境的 gh 已經以 mei-lin 登入 github.example/);
    expect(machineState(forgeLab).git!.account).toEqual({ login: 'mei-lin', name: 'Mei Lin', email: 'mei@example.com' });
  });
  it('finds the repository from the git remotes, or -R; gh’s errors outside a repository or for another host', () => {
    expect(lab('gh pr list').last.err).toEqual(['failed to run git: fatal: not a git repository (or any of the parent directories): .git']);
    expect(lab('git init -q x', 'cd x', 'gh pr list').last.err).toEqual(['none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`']);
    expect(lab('gh pr list -R island/tools').last.err).toEqual(['no open pull requests in island/tools']);
    expect(lab('gh pr list -R island/tools').last.status).toBe(0);
    expect(lab('gh repo view island/nope').last.err).toEqual(["GraphQL: Could not resolve to a Repository with the name 'island/nope'. (repository)"]);
    expect(lab('gh repo view github.com/cli/cli').last.err[0]).toMatch(/^github.com：模擬環境的 gh 只登入了 github.example/);
    expect(lab('cd shop', 'gh repo view').last.out).toEqual(['island/shop', 'The island shop', '', '# shop', '', 'View this repository on GitHub: https://github.example/island/shop']);
    expect(lab('gh repo view https://github.example/island/tools.git').last.out).toEqual(['island/tools', 'No description provided', '', 'This repository does not have a README', '', 'View this repository on GitHub: https://github.example/island/tools']);
  });
});

describe('a CICD02 team workflow: branch, pull request, review, protected main, merge', () => {
  it('pushing a new branch prints GitHub’s hint; gh pr create, list and view in gh’s terminal format', () => {
    const s = lab(...OPEN.slice(0, 4), 'git push -u origin greet', OPEN[5], 'gh pr list', 'gh pr view', 'gh pr view 7', 'gh pr diff');
    expect(s.log[4].err).toEqual(['remote: ', "remote: Create a pull request for 'greet' on GitHub by visiting:", 'remote:      https://github.example/island/shop/pull/new/greet', 'remote: ',
      'To https://github.example/island/shop.git', ' * [new branch]      greet -> greet']);
    expect(s.log[5].err).toEqual(['', 'Creating pull request for greet into main in island/shop', '']);
    expect(s.log[5].out).toEqual(['https://github.example/island/shop/pull/8']);
    expect(s.log[6].out).toEqual(['', 'Showing 2 of 2 open pull requests in island/shop', '', 'ID  TITLE          BRANCH  CREATED AT', '#8  Greet in full  greet   less than a minute ago', '#7  Add search     search  about 23 hours ago']);
    expect(s.log[7].out).toEqual(['Greet in full island/shop#8', 'Open • mei-lin wants to merge 1 commit into main from greet • less than a minute ago', '+1 -1 • ✓ Checks passing', '', '  Say hello.', '',
      'View this pull request on GitHub: https://github.example/island/shop/pull/8']);
    expect(s.log[8].out.slice(0, 3)).toEqual(['Add search island/shop#7', 'Open • hua wants to merge 1 commit into main from search • about 23 hours ago', '+2 -0 • ✓ Checks passing']);
    // The three-dot diff: from the merge base (c2), so the teammate's config.yml change on main is not in it.
    expect(s.last.out).toEqual(['diff --git a/app.py b/app.py', 'index 9f1b437..b376c99 100644', '--- a/app.py', '+++ b/app.py', '@@ -1 +1 @@', "-print('hi')", "+print('hello')"]);
  });
  it('gh pr create’s errors: no title, an unpushed branch, an existing pull request, no commits, uncommitted changes', () => {
    expect(lab('cd shop', 'gh pr create').last.err).toEqual(['must provide `--title` and `--body` (or `--fill` or `fill-first` or `--fillverbose`) when not running interactively']);
    expect(lab('cd shop', 'git switch -q -c local', 'gh pr create --fill').last.err).toEqual(['aborted: you must first push the current branch to a remote, or use the --head flag']);
    expect(lab(...OPEN, OPEN[5]).last.err).toEqual(['a pull request for branch "greet" into branch "main" already exists:', 'https://github.example/island/shop/pull/8']);
    expect(lab('cd shop', 'git switch -q -c same', 'git push -q -u origin same', 'gh pr create --fill').last.err).toEqual(['pull request create failed: GraphQL: No commits between main and same (createPullRequest)']);
    const dirty = lab(...OPEN.slice(0, 5), 'touch notes.txt', 'gh pr create --fill', 'gh pr view');
    expect(dirty.log[6].err).toEqual(['Warning: 1 uncommitted change', '', 'Creating pull request for greet into main in island/shop', '']);
    expect(dirty.last.out.slice(0, 1)).toEqual(['Greet in full island/shop#8']);
    // --fill with several commits: the branch name as the title, the commits as a list.
    const many = lab(...OPEN.slice(0, 4), "printf 'x\\n' > b.txt && git add b.txt && git commit -qm 'Add b'", 'git push -q -u origin greet', 'gh pr create --fill', 'gh pr view');
    expect(many.last.out[0]).toBe('greet island/shop#8');
    expect(many.last.out.slice(4, 6)).toEqual(['  - Greet in full', '  - Add b']);
  });
  it('protected main: a direct push is rejected with GH006, a merge waits for the persona’s approval, squash merges and deletes the branch', () => {
    const direct = lab('cd shop', "printf \"print('hello')\\n\" > app.py", "git commit -qam 'Greet in full'", 'git pull -q --rebase', 'git push');
    expect(direct.last.err).toEqual(['remote: error: GH006: Protected branch update failed for refs/heads/main.', 'remote: error: At least 1 approving review is required by reviewers with write access.',
      'To https://github.example/island/shop.git', ' ! [remote rejected] main -> main (protected branch hook declined)', "error: failed to push some refs to 'https://github.example/island/shop.git'"]);
    expect(direct.last.status).toBe(1);
    expect(forgeOf(direct.state).refs.get('refs/heads/main')).toBe(labels.get('c3'));
    const s = lab(...OPEN, 'gh pr merge --squash', 'sleep 299', 'gh pr view', 'sleep 1', 'gh pr view', 'gh pr merge --squash --delete-branch', 'git log --oneline --graph', 'git branch -a', 'gh pr view 8');
    expect(s.log[6].err).toEqual(['X Pull request island/shop#8 is not mergeable: the base branch policy prohibits the merge.', 'To have the pull request merged after all the requirements have been met, add the `--auto` flag.',
      'To use administrator privileges to immediately merge the pull request, add the `--admin` flag.']);
    expect(s.log[6].status).toBe(1);
    expect(s.log[8].out[3]).toBe('');
    expect(s.log[10].out[3]).toBe('Reviewers: hua (Approved)');
    const squash = forgeOf(s.state).refs.get('refs/heads/main')!;
    expect(s.log[11].err).toEqual(['✓ Squashed and merged pull request island/shop#8 (Greet in full)', 'From https://github.example/island/shop', ' * branch            main       -> FETCH_HEAD',
      `   ${labels.get('c2')!.slice(0, 7)}..${squash.slice(0, 7)}  main       -> origin/main`, '✓ Deleted local branch greet and switched to branch main', '✓ Deleted remote branch greet']);
    expect(s.log[11].out).toEqual([`Updating ${labels.get('c2')!.slice(0, 7)}..${squash.slice(0, 7)}`, 'Fast-forward', ' app.py     | 2 +-', ' config.yml | 2 +-', ' 2 files changed, 2 insertions(+), 2 deletions(-)']);
    expect(s.log[12].out).toEqual([`* ${squash.slice(0, 7)} (HEAD -> main, origin/main, origin/HEAD) Greet in full (#8)`, `* ${labels.get('c3')!.slice(0, 7)} Use port 8080`, `* ${labels.get('c2')!.slice(0, 7)} Add docs`, `* ${labels.get('c1')!.slice(0, 7)} Initial commit`]);
    expect(s.log[13].out).toEqual(['* main', '  remotes/origin/HEAD -> origin/main', '  remotes/origin/greet', '  remotes/origin/main']);
    expect(s.last.out[1]).toBe('Merged • mei-lin wants to merge 1 commit into main from greet • about 5 minutes ago');
    expect(forgeOf(s.state).refs.has('refs/heads/greet')).toBe(false);
  });
  it('other protection rules on push: force pushes, deletions, required checks, linear history; an admin bypasses unless enforced', () => {
    const force = lab('cd shop', 'git fetch -q', 'git push --force origin main 2>&1 | tail -4', 'git push origin --delete main');
    expect(force.log[2].out).toEqual(['remote: error: Cannot force-push to this branch', 'To https://github.example/island/shop.git', ' ! [remote rejected] main -> main (protected branch hook declined)', "error: failed to push some refs to 'https://github.example/island/shop.git'"]);
    expect(force.last.err.slice(0, 4)).toEqual(['remote: error: GH006: Protected branch update failed for refs/heads/main.', 'remote: error: Cannot delete this protected branch', 'To https://github.example/island/shop.git', ' ! [remote rejected] main (protected branch hook declined)']);
    const put = (body: string) => [`printf '${body}' > p.json`, 'gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input p.json --silent'];
    const base = '"required_pull_request_reviews":null,"restrictions":null', commit = "printf 'x\\n' >> tool.sh && git commit -qam x";
    const checks = lab('cd tools', ...put(`{"required_status_checks":{"strict":false,"contexts":["build"]},"enforce_admins":true,${base}}`), commit, 'git push');
    expect(checks.last.err.slice(0, 2)).toEqual(['remote: error: GH006: Protected branch update failed for refs/heads/main.', 'remote: error: Required status check "build" is expected.']);
    const linear = lab('cd tools', ...put(`{"required_status_checks":null,"enforce_admins":true,${base},"required_linear_history":true}`), 'git switch -q -c side', commit, 'git switch -q main', "printf 'y\\n' > y && git add y && git commit -qm y", 'git merge -q --no-edit side', 'git push');
    expect(linear.last.err[1]).toBe('remote: error: This branch must not contain merge commits.');
    const bypass = lab('cd tools', ...put(`{"required_status_checks":{"strict":false,"contexts":["build"]},"enforce_admins":false,${base}}`), commit, 'git push');
    expect(bypass.last.err).toEqual(['To https://github.example/island/tools.git', expect.stringMatching(/^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main$/)]);
  });
});

describe('merge methods write the histories GitHub writes', () => {
  const at = Date.UTC(2026, 10, 23, 2, 5, 0) / 1000;
  const merged = (method: string, ...more: string[]) => {
    const s = lab(...OPEN.slice(0, 4), ...more, 'git push -q -u origin greet', OPEN[5], 'sleep 300', `gh pr merge --${method}`);
    const f = forgeOf(s.state), tip = f.refs.get('refs/heads/main')!, store = s.state.git!.objects, commit = (id: string) => { const c = store.get(id); if (c?.type !== 'commit') throw new Error(id); return c; };
    const head = s.state.git!.repos.find(r => r.path === '/home/learner/shop')!.refs.get('refs/heads/greet')!;
    const files = (id: string) => [...readTree(store, commit(id).tree).keys()];
    return { s, f, tip, commit, head, files, text: (id: string, p: string) => { const e = readTree(store, commit(id).tree).get(p)!, b = store.get(e.id); return b?.type === 'blob' ? b.data : ''; } };
  };
  const github = { name: 'GitHub', email: 'noreply@github.example', time: at, tz: '+0000' }, mei = { name: 'Mei Lin', email: 'mei@example.com', time: at, tz: '+0000' };
  it('--merge: a merge commit of the base tip and the head, "Merge pull request #8 from island/greet" and the title, by the merger, committed by GitHub', () => {
    const m = merged('merge');
    expect(m.s.last.err).toEqual(['✓ Merged pull request island/shop#8 (Greet in full)']);
    expect(m.commit(m.tip)).toMatchObject({ parents: [labels.get('c3'), m.head], message: 'Merge pull request #8 from island/greet\n\nGreet in full\n', author: mei, committer: github });
    expect([m.text(m.tip, 'app.py'), m.text(m.tip, 'config.yml')]).toEqual(["print('hello')\n", 'port: 8080\n']);
    expect(lab(...OPEN.slice(0, 5), OPEN[5], 'sleep 300', 'gh pr merge --merge', 'git switch -q main', 'git pull -q', 'git log --oneline --graph -3').last.out).toEqual([
      `*   ${m.tip.slice(0, 7)} (HEAD -> main, origin/main, origin/HEAD) Merge pull request #8 from island/greet`, '|\\  ', `| * ${m.head.slice(0, 7)} (origin/greet, greet) Greet in full`, `* | ${labels.get('c3')!.slice(0, 7)} Use port 8080`, '|/  ']);
  });
  it('--squash: one commit on the base tip with the merged tree; one commit keeps its subject, several take the title and list the commits', () => {
    const one = merged('squash');
    expect(one.commit(one.tip)).toMatchObject({ parents: [labels.get('c3')], message: 'Greet in full (#8)\n', author: mei, committer: github });
    expect(one.commit(one.tip).tree).toBe(merged('merge').commit(merged('merge').tip).tree);
    const two = merged('squash', "printf 'x\\n' > b.txt && git add b.txt && git commit -qm 'Add b' -m 'Because.'");
    expect(two.commit(two.tip).message).toBe('Greet in full (#8)\n\n* Greet in full\n\n* Add b\n\nBecause.\n');
    expect(two.files(two.tip)).toEqual(['README.md', 'app.py', 'b.txt', 'config.yml', 'docs.md']);
  });
  it('--rebase: the head’s commits replayed on the base tip, authors kept, committed by GitHub', () => {
    const r = merged('rebase', "printf 'x\\n' > b.txt && git add b.txt && git commit -qm 'Add b'");
    const top = r.commit(r.tip), first = r.commit(top.parents[0]), original = r.commit(r.head);
    expect(top).toMatchObject({ message: 'Add b\n', author: original.author, committer: github });
    expect(first).toMatchObject({ parents: [labels.get('c3')], message: 'Greet in full\n', committer: github });
    expect(r.tip).not.toBe(r.head);
    expect(r.s.last.err).toEqual(['✓ Rebased and merged pull request island/shop#8 (Greet in full)']);
    // Even when the base has not moved, GitHub writes new commits (the committer changes).
    const t = lab('cd tools', 'git switch -q -c t', "printf 'y\\n' > y && git add y && git commit -qm y", 'git push -q -u origin t', 'gh pr create --fill', 'gh pr merge --rebase');
    const tools = forgeOf(t.state, TOOLS), local = t.state.git!.repos.find(x => x.path === '/home/learner/tools')!.refs.get('refs/heads/t')!;
    expect(tools.refs.get('refs/heads/main')).not.toBe(local);
  });
  it('conflicts make the pull request unmergeable with gh’s advice', () => {
    const s = lab('cd shop', 'git switch -q -c ports', "printf 'port: 1\\n' > config.yml", "printf \"print('hello')\\n\" > app.py", 'git commit -qam ports', 'git push -q -u origin ports', 'gh pr create --fill', 'sleep 300', 'gh pr merge --squash');
    expect(s.last.err).toEqual(['X Pull request island/shop#8 is not mergeable: the merge commit cannot be cleanly created.', 'To have the pull request merged after all the requirements have been met, add the `--auto` flag.',
      'Run the following to resolve the merge conflicts locally:', '  gh pr checkout 8 && git fetch origin main && git merge origin/main']);
    // Merging main into the branch and pushing makes it mergeable again (after hua approves the new head).
    const fixed = session(s.state, FORGE_PROFILE, 'git fetch -q', 'git merge -q origin/main || true', "printf 'port: 1\\n' > config.yml", 'git add config.yml', 'git commit -q --no-edit', 'git push -q', 'sleep 300', 'gh pr merge --merge');
    expect(fixed.last.err).toEqual(['✓ Merged pull request island/shop#8 (ports)']);
  });
});

describe('reviews: personas on the clock, your own pull request, stale approvals', () => {
  it('you cannot approve or request changes on your own pull request; a comment is fine; gh’s flag rules', () => {
    const s = lab(...OPEN, 'gh pr review --approve', 'gh pr review 8 -r -b no', "gh pr review 8 --comment -b 'Ready.'", 'gh pr review 8', 'gh pr review 8 -c', 'gh pr review 9 --approve');
    expect(s.log[6].err).toEqual(['failed to create review: GraphQL: Review Can not approve your own pull request (addPullRequestReview)']);
    expect(s.log[7].err).toEqual(['failed to create review: GraphQL: Review Can not request changes on your own pull request (addPullRequestReview)']);
    expect(s.log[8].err).toEqual(['- Reviewed pull request island/shop#8']);
    expect(s.log[9].err).toEqual(['need exactly one of --approve, --request-changes, or --comment']);
    expect(s.log[10].err).toEqual(['body cannot be blank for comment review']);
    expect(s.last.err).toEqual(['GraphQL: Could not resolve to a PullRequest with the number of 9. (repository.pullRequest)']);
  });
  it('approving a teammate’s pull request lets it merge; --rebase replays it on main', () => {
    const s = lab('cd shop', 'gh pr review 7 --approve', 'gh pr view 7', 'gh pr merge 7 --rebase -d', 'git fetch -q', 'git log --format=%s:%an/%cn origin/main -2');
    expect(s.log[1].err).toEqual(['✓ Approved pull request island/shop#7']);
    expect(s.log[2].out[3]).toBe('Reviewers: mei-lin (Approved)');
    expect(s.log[3].err).toEqual(['✓ Rebased and merged pull request island/shop#7 (Add search)', '✓ Deleted remote branch search']);
    expect(s.last.out).toEqual(['Add search:Lin Hua/GitHub', 'Use port 8080:Chen Wei/Chen Wei']);
  });
  it('a persona requests changes until the head is fixed; the changes-requested review blocks the merge', () => {
    const s = lab('cd shop', 'git switch -q -c docs', "printf 'More.\\n' >> docs.md", "git commit -qam 'More docs'", 'git push -q -u origin docs', 'gh pr create --fill', 'sleep 300', 'gh pr view --comments', 'gh pr merge --merge',
      "printf \"print('hello')\\n\" > app.py", "git commit -qam 'Greet'", 'git push -q', 'gh pr view', 'sleep 300', 'gh pr view', 'gh pr merge --merge');
    expect(s.log[7].out.slice(3)).toEqual(['Reviewers: hua (Changes requested)', '', '  No description provided', '', 'hua requested changes • less than a minute ago', '  Please greet in full.', '',
      'View this pull request on GitHub: https://github.example/island/shop/pull/8']);
    expect(s.log[8].err[0]).toBe('X Pull request island/shop#8 is not mergeable: the base branch policy prohibits the merge.');
    expect(s.log[12].out[3]).toBe('Reviewers: hua (Changes requested)');
    expect(s.log[14].out[3]).toBe('Reviewers: hua (Approved)');
    expect(s.last.err).toEqual(['✓ Merged pull request island/shop#8 (More docs)']);
  });
  it('dismiss stale reviews: a new push dismisses the approval (shown as Commented) until the persona approves again', () => {
    const s = lab(...OPEN, 'sleep 300', "printf 'x\\n' > b.txt && git add b.txt && git commit -qm b", 'git push -q', 'gh pr view', 'gh pr merge --squash', 'sleep 300', 'gh pr view');
    expect(s.log[9].out[3]).toBe('Reviewers: hua (Commented)');
    expect(s.log[10].err[0]).toBe('X Pull request island/shop#8 is not mergeable: the base branch policy prohibits the merge.');
    expect(s.last.out[3]).toBe('Reviewers: hua (Approved)');
  });
});

describe('status checks, settings and the rest of gh pr', () => {
  const TODO = ['cd shop', 'git switch -q -c todo', "printf \"print('hello')  # TODO\\n\" > app.py", "git commit -qam 'Greet, TODO'", 'git push -q -u origin todo', 'gh pr create --fill', 'sleep 300'];
  it('a failing required check: gh pr checks (exit 1), gh pr view’s summary, a blocked merge', () => {
    const s = lab(...TODO, 'gh pr checks', 'gh pr view', 'gh pr merge --squash', 'gh pr checks 7', 'gh pr checks 7 --required', 'gh pr checks --watch');
    expect(s.log[7].out).toEqual(['Some checks were not successful', '0 cancelled, 1 failing, 0 successful, 0 skipped, and 0 pending checks', '', '   NAME  DESCRIPTION   ELAPSED  URL', 'X  test  Tests failed  42s']);
    expect(s.log[7].status).toBe(1);
    expect(s.log[8].out.slice(2, 4)).toEqual(['+1 -1 • × All checks failing', 'Reviewers: hua (Approved)']);
    expect(s.log[9].status).toBe(1);
    expect(s.log[10].out[0]).toBe('All checks were successful');
    expect(s.log[11].out.at(-1)).toBe('✓  test  Tests passed  1m2s');
    expect(s.last.err[0]).toMatch(/^gh pr checks --watch／--web：模擬環境不支援/);
    expect(lab('cd tools', 'git switch -q -c t', "printf 'y\\n' > y && git add y && git commit -qm y", 'git push -q -u origin t', 'gh pr create --fill', 'gh pr checks').last.err).toEqual(["no checks reported on the 't' branch"]);
  });
  it('repository settings with gh api: merge methods, delete-branch-on-merge, linear history and --admin', () => {
    const pr = ['cd tools', 'git switch -q -c t', "printf 'y\\n' > y && git add y && git commit -qm y", 'git push -q -u origin t', 'gh pr create --fill'];
    expect(lab(...pr, 'gh api -X PATCH repos/{owner}/{repo} -F allow_squash_merge=false --silent', 'gh pr merge --squash').last.err).toEqual(['GraphQL: Squash merges are not allowed on this repository. (mergePullRequest)']);
    const auto = lab(...pr, 'gh api -X PATCH repos/{owner}/{repo} -F delete_branch_on_merge=true --silent', 'gh pr merge --merge');
    expect(forgeOf(auto.state, TOOLS).refs.has('refs/heads/t')).toBe(false);
    const protect = (body: string) => [`printf '${body}' > p.json`, 'gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input p.json --silent'];
    const linear = lab(...pr, ...protect('{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null,"required_linear_history":true}'), 'gh pr merge --merge', 'gh pr merge --rebase');
    expect(linear.log.at(-2)!.err).toEqual(['GraphQL: Merge commits are not allowed on this protected branch. (mergePullRequest)']);
    expect(linear.last.err).toEqual(['✓ Rebased and merged pull request island/tools#1 (y)']);
    const admin = lab(...pr, ...protect('{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null}'), 'gh pr merge --merge', 'gh pr merge --merge --admin');
    expect(admin.log.at(-2)!.err.at(-1)).toBe('To use administrator privileges to immediately merge the pull request, add the `--admin` flag.');
    expect(admin.last.err).toEqual(['✓ Merged pull request island/tools#1 (y)']);
    expect(lab('cd shop', 'gh api -X PATCH repos/{owner}/{repo} -F allow_squash_merge=false').last.err).toEqual(['gh: Must have admin rights to Repository. (HTTP 403)']);
  });
  it('gh pr checkout, close, and a deleted head branch closing its pull request', () => {
    const co = lab('cd shop', 'gh pr checkout 7', 'gh pr checkout 7');
    expect(co.log[1].err).toEqual(['From https://github.example/island/shop', ' * [new branch]      search     -> origin/search', "Switched to a new branch 'search'"]);
    expect(co.log[1].out).toEqual(["branch 'search' set up to track 'origin/search'.", "Your branch is up to date with 'origin/search'."]);
    expect(co.last.all).toEqual(["Already on 'search'", "Your branch is up to date with 'origin/search'.", 'Already up to date.']);
    const close = lab(...OPEN, 'gh pr close 8 -d', 'gh pr close 8', 'gh pr list', 'git branch');
    expect(close.log[6].err).toEqual(['✓ Closed pull request island/shop#8 (Greet in full)', '✓ Deleted branch greet and switched to branch main']);
    expect(close.log[7].err).toEqual(['! Pull request island/shop#8 (Greet in full) is already closed']);
    expect(close.log[8].out[1]).toBe('Showing 1 of 1 open pull request in island/shop');
    expect(close.last.out).toEqual(['* main']);
    expect(lab(...OPEN, 'sleep 300', 'gh pr merge --merge', 'gh pr close 8').last.err).toEqual(["X Pull request island/shop#8 (Greet in full) can't be closed because it was already merged"]);
    const gone = lab(...OPEN, 'git push -q origin --delete greet', 'gh pr view 8');
    expect(gone.last.out[1]).toMatch(/^Closed • mei-lin wants to merge/);
  });
});

describe('gh api: branch protection and repository settings with the REST bodies', () => {
  const api = (...commands: string[]) => lab('cd tools', ...commands);
  const put = (body: string) => [`printf '${body}' > p.json`, 'gh api -X PUT repos/{owner}/{repo}/branches/{branch}/protection --input p.json'];
  it('GET returns GitHub’s protection object; 404 when absent or the branch does not exist', () => {
    const s = lab('cd shop', 'gh api repos/{owner}/{repo}/branches/main/protection', 'gh api repos/island/shop/branches/search/protection', 'gh api /repos/island/shop/branches/nope/protection');
    const json = JSON.parse(s.log[1].out.join('\n'));
    expect(Object.keys(json)).toEqual(['url', 'required_status_checks', 'required_pull_request_reviews', 'required_signatures', 'enforce_admins', 'required_linear_history', 'allow_force_pushes', 'allow_deletions',
      'block_creations', 'required_conversation_resolution', 'lock_branch', 'allow_fork_syncing']);
    expect(json).toMatchObject({ url: 'https://github.example/api/v3/repos/island/shop/branches/main/protection', required_status_checks: { strict: false, contexts: ['test'], checks: [{ context: 'test', app_id: null }] },
      required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 1 }, enforce_admins: { enabled: false }, required_linear_history: { enabled: false }, allow_force_pushes: { enabled: false } });
    expect(s.log[1].out.slice(0, 3)).toEqual(['{', '  "url": "https://github.example/api/v3/repos/island/shop/branches/main/protection",', '  "required_status_checks": {']);
    expect(s.log[2].out).toEqual(['{', '  "message": "Branch not protected",', '  "documentation_url": "https://docs.github.com/rest/branches/branch-protection#get-branch-protection",', '  "status": "404"', '}']);
    expect(s.log[2].err).toEqual(['gh: Branch not protected (HTTP 404)']);
    expect(s.log[2].status).toBe(1);
    expect(s.last.err).toEqual(['gh: Branch not found (HTTP 404)']);
  });
  it('PUT with --input or -F fields sets protection (admins only); GitHub’s validation errors; DELETE removes it', () => {
    const ok = api(...put('{"required_status_checks":{"strict":true,"contexts":["build"]},"enforce_admins":true,"required_pull_request_reviews":{"dismiss_stale_reviews":true,"required_approving_review_count":2},"restrictions":null,"required_linear_history":true,"allow_force_pushes":false,"allow_deletions":false}'),
      'gh api repos/{owner}/{repo}/branches/main/protection --silent', 'gh api -X DELETE repos/{owner}/{repo}/branches/main/protection', 'gh api repos/{owner}/{repo}/branches/main/protection');
    expect(JSON.parse(ok.log[2].out.join('\n'))).toMatchObject({ required_status_checks: { strict: true, contexts: ['build'] }, required_pull_request_reviews: { required_approving_review_count: 2 }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true } });
    expect(ok.log[3].all).toEqual([]);
    expect(ok.log[4].all).toEqual([]);
    expect(ok.last.err).toEqual(['gh: Branch not protected (HTTP 404)']);
    const fields = api("gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F 'required_status_checks[strict]=false' -F 'required_status_checks[contexts][]=lint' -F enforce_admins=null -F required_pull_request_reviews=null -F restrictions=null --silent");
    expect(forgeOf(fields.state, TOOLS).site!.protection.get('main')).toEqual({ checks: { strict: false, contexts: ['lint'] }, linear: false, forcePush: false, deletions: false, enforceAdmins: false });
    const err = (body: string) => api(...put(body)).last.err;
    expect(err('{"required_status_checks":null}')).toEqual(['gh: Invalid request.', '', '"enforce_admins" wasn\'t supplied. (HTTP 422)']);
    expect(err('{"required_status_checks":null,"enforce_admins":"yes","required_pull_request_reviews":null,"restrictions":null}')).toEqual(['gh: Invalid request.', '', 'For \'properties/enforce_admins\', "yes" is not a boolean. (HTTP 422)']);
    expect(err('{"required_status_checks":null,"enforce_admins":null,"required_pull_request_reviews":{"required_approving_review_count":7},"restrictions":null}')).toEqual(['gh: Invalid request.', '', 'For \'properties/required_approving_review_count\', 7 is greater than the maximum of 6. (HTTP 422)']);
    expect(err('{"required_status_checks":null,"enforce_admins":null,"required_pull_request_reviews":null,"restrictions":{"users":[]}}')).toEqual(['gh: Invalid request.', '', 'Only organization repositories can have users and team restrictions (HTTP 422)']);
    expect(err('{nope')).toEqual(['gh: Problems parsing JSON (HTTP 400)']);
    expect(lab('cd shop', ...put('{}')).last.err).toEqual(['gh: Must have admin rights to Repository. (HTTP 403)']);
  });
  it('placeholders, the repository object, the user, and what the simulation does not support', () => {
    const repo = JSON.parse(lab('cd shop', 'gh api repos/{owner}/{repo}').last.out.join('\n'));
    expect(repo).toMatchObject({ name: 'shop', full_name: 'island/shop', default_branch: 'main', permissions: { admin: false, push: true }, allow_squash_merge: true, allow_merge_commit: true, allow_rebase_merge: true, delete_branch_on_merge: false });
    expect(JSON.parse(lab('gh api user').last.out.join('\n'))).toMatchObject({ login: 'mei-lin', name: 'Mei Lin' });
    expect(lab('gh api repos/{owner}/{repo}').last.err).toEqual(['failed to run git: fatal: not a git repository (or any of the parent directories): .git']);
    expect(lab('cd shop', 'gh api repos/{owner}/{repo}/pulls').last.err[0]).toMatch(/^gh api：模擬環境只支援 user/);
    expect(lab('cd shop', "gh api repos/{owner}/{repo} --jq .name").last.err[0]).toMatch(/^gh api：模擬環境不支援 --jq/);
    expect(lab('gh api repos/island/nope').last.err).toEqual(['gh: Not Found (HTTP 404)']);
  });
});

describe('the checks pull-request and protection, the exercises and the lesson data', () => {
  const verdict = (x: TerminalExercise, commands: string[]) => checkTerminalExercise(x, [forgeLab], commands);
  it('each exercise passes with its solution; each mistake fails with the expected message', () => {
    for (const x of [prExercise, readExercise, protectExercise]) {
      expect(verdict(x, x.solution).ok).toBe(true);
      for (const m of x.mistakes) expect(verdict(x, m.commands).ok).toBe(false);
    }
    const msgs = (x: TerminalExercise, k: number) => verdict(x, x.mistakes[k].commands).results.filter(r => !r.ok).map(r => r.message.replace(/^.*，但/, ''));
    expect(msgs(prExercise, 0)).toEqual(['PR #8 是開著的（open）', '分支 greet 還在', '它的最新 commit 裡 app.py 的內容不同']);
    expect(msgs(prExercise, 1)).toEqual(['PR #8 是以 merge 合併的', '它最新的 commit 是「Merge pull request #8 from island/greet」']);
    expect(msgs(prExercise, 2)[0]).toBe('沒有從 greet 到 main 的 Pull Request');
    expect(msgs(protectExercise, 0)).toEqual(['main 沒有分支保護']);
  });
  it('describes the checks and reports failures on the forge', () => {
    const end = lab(...OPEN).state;
    const fail = (c: TerminalCheck) => { const r = checkTerminalExercise({ ...prExercise, checks: [c], solution: OPEN, mistakes: [] }, [forgeLab], OPEN).results[0]; return { ...r, message: r.message.replace(/^.*，但/, '') }; };
    expect(fail({ kind: 'pull-request', repo: '/home/learner/shop', head: 'greet', approvals: 1 })).toMatchObject({ ok: false, message: 'PR #8 只有 0 個核准' });
    expect(fail({ kind: 'pull-request', repo: SHOP, number: 7, checks: 'failure' })).toMatchObject({ ok: false, message: 'PR #7 的檢查結果是 success' });
    expect(fail({ kind: 'pull-request', repo: SHOP, number: 8, head: 'other' })).toMatchObject({ ok: false, message: 'PR #8 是從 greet 到 main' });
    expect(fail({ kind: 'protection', repo: SHOP, branch: 'main', approvals: 2, checks: ['test'] })).toMatchObject({ ok: false, message: 'main 的保護要求 1 個核准' });
    expect(fail({ kind: 'protection', repo: SHOP, branch: 'main', checks: ['lint'] })).toMatchObject({ ok: false, message: 'main 的保護沒有要求檢查 lint' });
    expect(fail({ kind: 'protection', repo: SHOP, branch: 'main', linear: true })).toMatchObject({ ok: false, message: 'main 的保護沒有要求線性歷史' });
    expect(fail({ kind: 'protection', repo: SHOP, branch: 'search', absent: true })).toMatchObject({ ok: true });
    expect(fail({ kind: 'pull-request', repo: SHOP, head: 'greet', state: 'open', approvals: 0 })).toMatchObject({ ok: true, message: 'https://github.example/island/shop.git 應該有從 greet 到 預設分支 的 Pull Request（狀態是 open，至少 0 個核准）' });
    expect(fail({ kind: 'protection', repo: '/home/learner/notes', branch: 'main' })).toMatchObject({ ok: false, message: '/home/learner/notes 不是 Git 儲存庫' });
    expect(end.git!.forge.find(f => f.url === SHOP)!.site!.pulls).toHaveLength(2);
  });
  it('validates check data', () => {
    const problems = (c: TerminalCheck) => terminalContentProblems({ ...forgeContent, exercises: [{ ...readExercise, checks: [c, { kind: 'output', fromCommand: '^gh api ' }] }] });
    expect(problems({ kind: 'pull-request', repo: SHOP })).toContain('exercise read: a pull-request check needs a head branch or a number');
    expect(problems({ kind: 'pull-request', repo: SHOP, head: 'greet', method: 'fast' as 'merge' })).toContain('exercise read: a pull-request check\'s state is open, closed or merged and its method merge, squash or rebase');
    expect(problems({ kind: 'protection', repo: SHOP, branch: 'main', absent: true, linear: true })).toContain('exercise read: an absent protection check takes only repo and branch');
    expect(problems({ kind: 'protection', repo: 'shop', branch: 'main' })).toContain('exercise read: a protection check needs a forge machine (engine stage E26) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
  });
  it('validates the lesson data; invalid data builds no forge state', () => {
    const bad = (forge: TerminalMachine['forge']) => machineProblems({ ...forgeLab, forge });
    const repo = forgeLab.forge!.repos![0];
    expect(bad({ login: '-x' })).toContain('machine dev-03: forge: login must be a GitHub login (letters, digits, single hyphens, at most 39)');
    expect(bad({ login: 'mei-lin', repos: [{ url: 'https://github.example/island/nope.git' }] })).toContain('machine dev-03: forge repo https://github.example/island/nope.git: must be one of git.remotes (once)');
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, protection: [{ branch: 'main', approvals: 7 }] }] })).toContain(`machine dev-03: forge repo ${SHOP}: protection main: approvals must be 0..6`);
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, personas: [{ login: 'mei-lin', after: 1, review: 'approve' }] }] })).toContain(`machine dev-03: forge repo ${SHOP} persona mei-lin: needs a unique GitHub login other than the learner's`);
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, personas: [{ login: 'wei', after: 1, review: 'request-changes' }] }] })).toContain(`machine dev-03: forge repo ${SHOP} persona wei: request-changes and comment need a body`);
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, checks: [{ context: 'test', conclusion: 'success', commit: 'zz' }] }] })).toContain(`machine dev-03: forge repo ${SHOP} check test: zz is not a commit label`);
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, pulls: [{ head: 'nope', title: 'x', author: 'hua', created: '2026-11-22 03:00:00' }] }] })).toContain(`machine dev-03: forge repo ${SHOP} pull #1: head and base must be two branches of the remote`);
    expect(bad({ login: 'mei-lin', repos: [{ ...repo, pulls: [{ head: 'search', title: 'x', author: 'ghost', created: '2026-11-22' }] }] })).toContain(`machine dev-03: forge repo ${SHOP} pull #1: author must be the learner's login or a persona`);
    expect(machineState({ ...forgeLab, forge: { login: '-x' } }).git!.account).toBeUndefined();
    expect(session({ ...forgeLab, forge: { login: '-x' } }, FORGE_PROFILE, 'gh pr list').last.err[0]).toBe('To get started with GitHub CLI, please run:  gh auth login');
  });
  it('a variant’s forge data changes the reference output; replays are deterministic and never change the given state', () => {
    const v = variantMachine(forgeLab, readExercise.variants![0]);
    expect(replay(v, readExercise.solution).steps.at(-1)!.output).not.toBe(replay(forgeLab, readExercise.solution).steps.at(-1)!.output);
    const start = machineState(forgeLab), before = JSON.stringify([...start.git!.forge.map(f => [...f.site!.pulls])]);
    const a = replay(start, [...OPEN, 'sleep 300', 'gh pr merge --rebase -d']), b = replay(start, [...OPEN, 'sleep 300', 'gh pr merge --rebase -d']);
    expect(a.steps.map(x => x.output)).toEqual(b.steps.map(x => x.output));
    expect(JSON.stringify([...start.git!.forge.map(f => [...f.site!.pulls])])).toBe(before);
    expect(start.git!.forge.find(f => f.url === SHOP)!.refs.get('refs/heads/main')).toBe(labels.get('c3'));
  });
});
