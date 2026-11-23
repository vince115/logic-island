import { describe, expect, it } from 'vitest';
import { type FsState } from '@/lib/terminal/fs';
import { ACTIONS_PROFILE, WORKFLOWS_PROFILE, run } from '@/lib/terminal/shell';
import { GH_SUPPORTED_ACTIONS, GH_SUPPORTED_WORKFLOWS } from '@/lib/terminal/gh';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { lastAttempt, type WorkflowRun } from '@/lib/terminal/actions-model';
import { fileCommand, workflowCommands } from '@/lib/terminal/runner';
import {
  ACTIONS_COMMITS, actionsContent, actionsLab, BUGGY, dispatchExercise, fixExercise, FIXED, flakyExercise, SHOP, TOOLS,
} from './support/actions-fixture';

/*
 * Engine stage E28 (docs/curriculum/CICD0_E28_ACTIONS.md): the actions profile — GitHub Actions runs on simulated
 * GitHub-hosted runners. Pushes, pull requests, gh workflow run and the schedule start runs; jobs run in needs order with
 * matrices, fail-fast, outputs and timeouts; run: steps really run in the Bash interpreter; CI tools follow the files;
 * gh run list/view/watch/rerun/cancel and gh pr checks show the results as the clock moves; the check run. Below the
 * profile everything behaves as in E27.
 */
function session(from: FsState | TerminalMachine, profile = ACTIONS_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(actionsLab, ACTIONS_PROFILE, ...commands);
const runsOf = (s: FsState): readonly WorkflowRun[] => s.git!.forge.find(f => f.url === SHOP)!.site!.runs ?? [];
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };
/** The lab with main's workflows replaced by these files (a third commit; ~/shop is its clone). */
function labWith(files: Record<string, string>, extra: Partial<TerminalMachine> = {}): TerminalMachine {
  const gone = Object.fromEntries(['ci', 'e2e', 'matrix', 'build'].map(n => [`.github/workflows/${n}.yml`, null]));
  return {
    ...actionsLab, ...extra,
    git: { ...actionsLab.git!, commits: [...ACTIONS_COMMITS, { id: 'c3', message: 'Try workflows', files: { ...gone, ...files }, author: MEI, time: '2026-11-22 01:00:00' }], remotes: [{ url: SHOP, branches: { main: 'c3' } }] },
  };
}
const wf = (...lines: string[]) => [...lines, ''].join('\n');
/** A push workflow with one job (its keys indented four spaces). */
const pushJob = (...job: string[]) => wf('name: T', 'on: push', 'jobs:', '  t:', '    runs-on: ubuntu-latest', ...job);
const PUSH = ["git commit -q --allow-empty -m 'Go'", 'git push -q'];
/** Pushes from ~/shop on a lab with this workflow, waits, and returns the session and the first run's --log. */
function pushed(files: Record<string, string>, ...after: string[]) {
  const s = session(labWith(files), ACTIONS_PROFILE, 'cd shop', ...PUSH, 'sleep 120', ...after);
  const id = runsOf(s.state)[0]?.id;
  const log = session(s.state, ACTIONS_PROFILE, `gh run view ${id} --log`).last.out.map(l => l.split('\t').slice(1).join('\t').replace(/\S+Z /, ''));
  return { ...s, log, run: runsOf(s.state)[0] };
}

describe('the actions profile', () => {
  it('is the workflows profile with the actions feature and no new commands', () => {
    expect(ACTIONS_PROFILE.commands).toEqual(WORKFLOWS_PROFILE.commands);
    expect(ACTIONS_PROFILE.features).toEqual([...WORKFLOWS_PROFILE.features!, 'actions']);
    expect(profileOf(actionsLab)).toBe(ACTIONS_PROFILE);
    expect(machineProblems(actionsLab)).toEqual([]);
    expect(terminalContentProblems(actionsContent)).toEqual([]);
    expect(lab('gh').last.out.at(-1)).toBe(`模擬環境支援的指令：${GH_SUPPORTED_ACTIONS}`);
  });
  it('below it pushes start no runs, gh run and CI tools do not exist, and the data and checks need the profile', () => {
    const low = session({ ...actionsLab, profile: 'workflows', actions: undefined }, WORKFLOWS_PROFILE, 'cd shop', ...PUSH, 'gh run list', 'gh workflow run build.yml', 'npm test');
    expect(runsOf(low.state)).toEqual([]);
    expect(low.state.ci).toBeUndefined();
    expect(low.log[3].err).toEqual([`gh run：模擬環境不支援這個指令（支援的指令：${GH_SUPPORTED_WORKFLOWS}）`]);
    expect(low.log[4].err).toEqual(['gh workflow run：模擬環境還不支援（Actions 的執行在 E28），這裡只有 gh workflow list 與 view']);
    expect(low.log[5].err[0]).toMatch(/^bash: npm: command not found（模擬環境支援：/);
    expect(machineProblems({ ...actionsLab, profile: 'workflows' })).toContain('machine dev-05: actions needs the actions profile (engine stage E28)');
    const p = terminalContentProblems({ ...actionsContent, machines: [{ ...actionsLab, profile: 'workflows', actions: undefined }] });
    expect(p).toContain('exercise fix: a run check needs an actions machine (engine stage E28) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    // gh pr checks still shows the lesson's declared results below the profile.
    const declared = session({ ...actionsLab, profile: 'workflows', actions: undefined, forge: { login: 'mei-lin', repos: [{ url: SHOP, checks: [{ context: 'test', conclusion: 'failure' }] }] } }, WORKFLOWS_PROFILE,
      'cd shop', 'git switch -q -c x', ...PUSH.map(c => c.replace('git push -q', 'git push -q -u origin x')), "gh pr create -t X -b Y", 'gh pr checks');
    expect(declared.last.out).toEqual(['Some checks were not successful', '0 cancelled, 1 failing, 0 successful, 0 skipped, and 0 pending checks', '', '   NAME  DESCRIPTION  ELAPSED  URL', 'X  test']);
  });
});

describe('a push runs CI: red, fix, green', () => {
  it('queues the runs, shows them in progress, then completed as the clock moves', () => {
    const s = lab('cd shop', ...PUSH, 'gh run list', 'sleep 5', 'gh run view 4100000001', 'sleep 60', 'gh run list');
    expect(s.log[3].out).toEqual(['STATUS  TITLE  WORKFLOW  BRANCH  EVENT  ID          ELAPSED  AGE', '*       Go     E2E       main    push   4100000002  0s       less than a minute ago',
      '*       Go     CI        main    push   4100000001  0s       less than a minute ago']);
    expect(s.log[5].out.slice(0, 5)).toEqual(['* main CI · 4100000001', 'Triggered via push less than a minute ago', '', 'JOBS', '* test (ID 11300000001)']);
    expect(s.log[7].out.slice(1)).toEqual(['X       Go     E2E       main    push   4100000002  12s      about 1 minute ago', 'X       Go     CI        main    push   4100000001  12s      about 1 minute ago']);
  });
  it('shows the failed job with its steps, annotations and the hint, and the failed step\'s log', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 60', 'gh run view 4100000001', 'gh run view 4100000001 --log-failed');
    expect(s.log[4].out).toEqual(['X main CI · 4100000001', 'Triggered via push about 1 minute ago', '', 'JOBS', 'X test in 10s (ID 11300000001)', '  ✓ Set up job', '  ✓ Run actions/checkout@v4',
      '  ✓ Run actions/setup-node@v4', '  ✓ Run npm ci', '  X Run npm test', '  ✓ Post Run actions/checkout@v4', '  ✓ Complete job', '', 'ANNOTATIONS', 'X Process completed with exit code 1.', 'test: .github#5', '',
      'To see what failed, try: gh run view 4100000001 --log-failed', 'View this run on GitHub: https://github.example/island/shop/actions/runs/4100000001']);
    expect(s.log[5].out).toEqual([
      'test\tRun npm test\t2026-11-23T02:00:07.0000000Z ##[group]Run npm test', 'test\tRun npm test\t2026-11-23T02:00:07.0000000Z npm test',
      'test\tRun npm test\t2026-11-23T02:00:07.0000000Z shell: /usr/bin/bash -e {0}', 'test\tRun npm test\t2026-11-23T02:00:07.0000000Z ##[endgroup]',
      'test\tRun npm test\t2026-11-23T02:00:12.0000000Z FAIL test/add.test.js', 'test\tRun npm test\t2026-11-23T02:00:12.0000000Z   ● add › adds two numbers',
      'test\tRun npm test\t2026-11-23T02:00:12.0000000Z Tests: 1 failed, 2 passed, 3 total', 'test\tRun npm test\t2026-11-23T02:00:12.0000000Z ##[error]Process completed with exit code 1.']);
  });
  it('logs Set up job with the GITHUB_TOKEN Permissions group and checkout from the pushed commit', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 60', 'gh run view 4100000001 --log');
    const lines = s.last.out.map(l => l.split('\t').slice(1).join('\t').replace(/\S+Z /, ''));
    expect(lines.slice(0, 3)).toEqual(["Set up job\tCurrent runner version: '2.321.0'", 'Set up job\t##[group]Operating System', 'Set up job\tUbuntu']);
    expect(lines).toContain('Set up job\t##[group]GITHUB_TOKEN Permissions');
    const perms = lines.indexOf('Set up job\t##[group]GITHUB_TOKEN Permissions');
    expect(lines.slice(perms + 1, perms + 4)).toEqual(['Set up job\tContents: read', 'Set up job\tMetadata: read', 'Set up job\t##[endgroup]']);
    expect(lines).toContain("Set up job\tDownload action repository 'actions/checkout@v4'");
    expect(lines).toContain('Run actions/checkout@v4\t/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main');
    expect(lines).toContain(`Run actions/checkout@v4\t${runsOf(s.state)[0].sha}`);
    expect(lines.at(-1)).toBe('Complete job\tCleaning up orphan processes');
  });
  it('turns green after the fix, and the run check follows', () => {
    const check: TerminalCheck = { kind: 'run', repo: SHOP, workflow: 'ci.yml', ref: 'main', tip: true, conclusion: 'success' };
    const red = lab('cd shop', ...PUSH, 'sleep 60');
    const green = session(red.state, ACTIONS_PROFILE, `printf '${FIXED.replace('\n', '\\n')}' > app.js`, "git commit -qam 'Fix add'", 'git push -q', 'gh run watch 4100000003');
    expect(green.last.out.at(-1)).toBe("✓ Run CI (4100000003) completed with 'success'");
    expect(green.last.out[0]).toBe('Refreshing run status every 3 seconds. Press Ctrl+C to quit.');
    const ex = { ...fixExercise, checks: [check] };
    expect(checkTerminalExercise(ex, [actionsLab], ['cd shop', ...PUSH, 'sleep 60']).results[0].message).toBe(
      'https://github.example/island/shop.git 的 main 目前的 commit 最新的 ci.yml run 應該：結論是 success，但最新的 run #1（4100000001）的結論是 failure');
  });
});

describe('a pull request with a required check', () => {
  const open = ['cd shop', 'git switch -q -c fix', `printf '${FIXED.replace('\n', '\\n')}' > app.js`, "git commit -qam 'Fix add'", 'git push -q -u origin fix', "gh pr create -t 'Fix add' -b 'Adds'"];
  it('runs on the test merge commit, feeds gh pr checks and blocks the merge until the check succeeds', () => {
    const s = lab(...open, 'gh pr checks', 'gh pr merge --squash', 'sleep 30', 'gh pr checks', 'gh pr view', 'gh pr merge --squash --delete-branch', 'gh run list');
    const pr = runsOf(s.state)[0];
    expect(pr).toMatchObject({ event: 'pull_request', headBranch: 'fix', ref: 'refs/pull/1/merge', title: 'Fix add', pr: { number: 1, head: 'fix', base: 'main' } });
    const merge = s.state.git!.objects.get(pr.sha);
    expect(merge?.type === 'commit' && merge.parents).toEqual([pr.pr!.baseSha, pr.headSha]);
    expect(s.log[6].out).toEqual(['Some checks are still pending', '0 cancelled, 0 failing, 0 successful, 0 skipped, and 1 pending checks', '', '   NAME                    DESCRIPTION  ELAPSED  URL',
      '*  CI/test (pull_request)                        https://github.example/island/shop/actions/runs/4100000001/job/11300000001']);
    expect(s.log[6].status).toBe(8);
    expect(s.log[7].err[0]).toBe('X Pull request island/shop#1 is not mergeable: the base branch policy prohibits the merge.');
    expect(s.log[9].out.at(-1)).toBe('✓  CI/test (pull_request)               10s      https://github.example/island/shop/actions/runs/4100000001/job/11300000001');
    expect(s.log[10].out[2]).toBe('+1 -1 • ✓ Checks passing');
    expect(s.log[11].err[0]).toBe('✓ Squashed and merged pull request island/shop#1 (Fix add)');
    // The merge moved main: a push run of CI and E2E on the squashed commit.
    expect(s.last.out.slice(1, 3).map(l => l.split(/\s{2,}/).slice(1, 5))).toEqual([['Fix add (#1)', 'E2E', 'main', 'push'], ['Fix add (#1)', 'CI', 'main', 'push']]);
  });
  it('checkout of a pull request run is detached at refs/pull/N/merge, and a new push to the head runs it again (synchronize)', () => {
    const s = lab(...open, 'sleep 30', "git commit -q --allow-empty -m 'More'", 'git push -q', 'gh run list -e pull_request', 'sleep 30', 'gh run view 4100000002 --log');
    expect(s.log[9].out.slice(1).map(l => l.split(/\s{2,}/)[1])).toEqual(['Fix add', 'Fix add']);
    expect(s.last.out.some(l => l.endsWith('/usr/bin/git checkout --progress --force refs/remotes/pull/1/merge'))).toBe(true);
  });
  it('gh pr checks --watch waits for the head\'s runs; a write-permission push to main needs the check on that commit', () => {
    const s = lab(...open, 'gh pr checks --watch', 'date -u +%T');
    expect(s.log[6].out[0]).toBe('All checks were successful');
    expect(s.last.out).toEqual(['02:00:12']);
    const writer = { ...actionsLab, forge: { login: 'mei-lin', repos: [{ url: SHOP, protection: [{ branch: 'main', checks: ['test'] }] }] } };
    const early = session(writer, ACTIONS_PROFILE, ...open, 'git push -q origin fix:main');
    expect(early.last.err.slice(0, 2)).toEqual(['remote: error: GH006: Protected branch update failed for refs/heads/main.', 'remote: error: Required status check "test" is expected.']);
    const later = session(early.state, ACTIONS_PROFILE, 'sleep 30', 'git push -q origin fix:main');
    expect(later.last.err).toEqual(['To https://github.example/island/shop.git', `   ${later.last.err[1].trim().split(' ')[0]}  fix -> main`]);
  });
  it('a pull request that conflicts starts no run', () => {
    const s = lab('cd shop', 'git switch -q -c other', "printf 'x\\n' > app.js", "git commit -qam 'Other'", 'git push -q -u origin other', 'git switch -q main', "printf 'y\\n' > app.js",
      "git commit -qam 'Main'", 'git push -q', 'git switch -q other', "gh pr create -t 'Other' -b 'x'");
    expect(runsOf(s.state).filter(r => r.event === 'pull_request')).toEqual([]);
  });
});

describe('matrix, fail-fast, needs and outputs', () => {
  it('cancels the unfinished siblings when one matrix job fails', () => {
    const s = lab('cd shop', 'gh workflow run matrix.yml', 'sleep 30', 'gh run view 4100000001 -v');
    expect(s.log[1].out).toEqual(['✓ Created workflow_dispatch event for matrix.yml at main', '', 'To see runs for this workflow, try: gh run list --workflow="matrix.yml"']);
    expect(s.last.out.filter(l => /^\S/.test(l)).slice(0, 7)).toEqual(['X main Matrix · 4100000001', 'Triggered via workflow_dispatch less than a minute ago', 'JOBS',
      '✓ test (18) in 4s (ID 11300000001)', 'X test (20) in 6s (ID 11300000002)', '- test (22) in 6s (ID 11300000003)', 'ANNOTATIONS']);
    const jobs = lastAttempt(runsOf(s.state)[0]).jobs;
    expect(jobs.map(j => [j.name, j.conclusion])).toEqual([['test (18)', 'success'], ['test (20)', 'failure'], ['test (22)', 'cancelled']]);
    expect(jobs[2].steps.map(x => [x.name, x.conclusion])).toEqual([['Set up job', 'success'], ['Run sleep $(( ${{ matrix.node }} - 15 ))', 'cancelled'], ['Complete job', 'success']]);
    expect(jobs[2].steps[1].lines.at(-1)!.text).toBe('##[error]The operation was canceled.');
  });
  it('without fail-fast and with max-parallel the jobs share slots and all finish', () => {
    const m = wf('name: M', 'on: workflow_dispatch', 'jobs:', '  t:', '    runs-on: ubuntu-latest', '    strategy:', '      fail-fast: false', '      max-parallel: 1', '      matrix:',
      '        n: [1, 2]', '    steps:', '      - run: sleep ${{ matrix.n }}; test ${{ matrix.n }} = 2');
    const s = session(labWith({ '.github/workflows/m.yml': m }), ACTIONS_PROFILE, 'cd shop', 'gh workflow run m.yml', 'sleep 60');
    const [a, b] = lastAttempt(runsOf(s.state)[0]).jobs;
    expect([a.conclusion, b.conclusion]).toEqual(['failure', 'success']);
    expect(b.queuedAt).toBe(a.completedAt);
  });
  it('passes a step output to a job output and a dependent job, with the dispatch input', () => {
    const s = lab('cd shop', 'gh workflow run build.yml -f level=minor', 'sleep 30', 'gh run view 4100000001 --log');
    const jobs = lastAttempt(runsOf(s.state)[0]).jobs;
    expect(jobs.map(j => [j.key, j.conclusion, j.outputs])).toEqual([['version', 'success', { tag: 'v1.1.0' }], ['publish', 'success', {}]]);
    expect(jobs[1].queuedAt).toBe(jobs[0].completedAt);
    expect(s.last.out.at(-6)).toMatch(/^publish\tRun echo "Publishing \$\{\{ needs\.version\.outputs\.tag \}\}"\t\S+ ##\[group\]Run echo "Publishing v1\.1\.0"$/);
    expect(runsOf(s.state)[0]).toMatchObject({ event: 'workflow_dispatch', inputs: { level: 'minor' }, title: 'Build', ref: 'refs/heads/main' });
  });
  it('skips a job whose need failed, runs if: failure() and always()', () => {
    const y = wf('name: N', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: exit 3', '  b:', '    needs: a', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo b',
      '  c:', '    needs: a', '    if: failure()', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo c', '  d:', '    needs: b', '    if: always()', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo "${{ needs.b.result }}"');
    const { run: r, log } = pushed({ '.github/workflows/n.yml': y });
    expect(lastAttempt(r).jobs.map(j => [j.key, j.conclusion])).toEqual([['a', 'failure'], ['b', 'skipped'], ['c', 'success'], ['d', 'success']]);
    expect(log).toContain('Run echo "${{ needs.b.result }}"\tskipped');
    expect(log).toContain('Run exit 3\t##[error]Process completed with exit code 3.');
  });
});

describe('reruns, cancel, waiting jobs, schedule and invalid files', () => {
  it('a flaky job fails on attempt 1; gh run rerun --failed makes attempt 2 pass', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 60', 'gh run rerun 4100000002 --failed', 'gh run rerun 4100000002', 'gh run watch 4100000002', 'gh run view 4100000002', 'gh run rerun 4100000002 --failed');
    expect(s.log[4].out).toEqual(['✓ Requested rerun (failed jobs) of run 4100000002']);
    expect(s.log[5].err).toEqual(['failed to rerun: HTTP 403: This workflow is already running (https://github.example/api/v3/repos/island/shop/actions/runs/4100000002/rerun)']);
    expect(s.log[6].out.at(-1)).toBe("✓ Run E2E (4100000002) completed with 'success'");
    expect(s.log[7].out[0]).toBe('✓ main E2E · 4100000002 (Attempt #2)');
    expect(s.last.err[0]).toBe('failed to rerun: HTTP 403: This workflow run cannot be retried (https://github.example/api/v3/repos/island/shop/actions/runs/4100000002/rerun-failed-jobs)');
    const r = runsOf(s.state).find(x => x.id === 4100000002)!;
    expect(r.attempts.map(a => [a.attempt, a.jobs.map(j => j.conclusion)])).toEqual([[1, ['failure']], [2, ['success']]]);
  });
  it('rerun --failed keeps the jobs that passed', () => {
    const y = wf('name: R', 'on: push', 'jobs:', '  ok:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo ok', '  e2e:', '    runs-on: ubuntu-latest', '    steps:', '      - run: npm run e2e');
    const s = pushed({ '.github/workflows/r.yml': y }, 'gh run rerun 4100000001 --failed', 'sleep 60');
    const a = runsOf(s.state)[0].attempts[1];
    expect(a.jobs.map(j => [j.key, j.conclusion, !!j.reused])).toEqual([['ok', 'success', true], ['e2e', 'success', false]]);
  });
  it('gh run cancel cuts a running run; a completed one cannot be cancelled', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 8', 'gh run cancel 4100000001', 'gh run view 4100000001 -v', 'sleep 60', 'gh run cancel 4100000001', 'gh run list -L 2');
    expect(s.log[4].out).toEqual(['✓ Request to cancel workflow 4100000001 submitted.']);
    expect(s.log[5].out.slice(0, 6)).toEqual(['- main CI · 4100000001', 'Triggered via push less than a minute ago', '', 'JOBS', '- test in 6s (ID 11300000001)', '  ✓ Set up job']);
    expect(s.log[7].err).toEqual(['Cannot cancel a workflow run that is completed']);
    expect(s.last.out[2]).toMatch(/^-\s+Go\s+CI\s+main\s+push\s+4100000001\s+8s\s/);
  });
  it('a job whose runs-on no runner has waits; gh run watch says so; cancel ends it', () => {
    const { state } = pushed({ '.github/workflows/w.yml': pushJob('    runs-on: windows-2025', '    steps:', '      - run: echo hi').replace('    runs-on: ubuntu-latest\n', '') });
    const s = session(state, ACTIONS_PROFILE, 'cd shop', 'gh run view 4100000001', 'gh run watch 4100000001', 'gh run cancel 4100000001', 'gh run list');
    expect(s.log[1].out.slice(0, 5)).toEqual(['* main T · 4100000001', 'Triggered via push about 2 minutes ago', '', 'JOBS', '* t (ID 11300000001)']);
    expect(s.log[2].err[0]).toMatch(/^gh run watch：run 4100000001 有 job 一直在等 runner/);
    expect(s.last.out[1]).toMatch(/^-\s+Go\s+T\s+main\s+push/);
  });
  it('schedule starts runs on the default branch when the clock passes the cron time', () => {
    const y = wf('name: Nightly', 'on:', '  schedule:', '    - cron: "30 2 * * *"', 'jobs:', '  n:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo "$GITHUB_EVENT_NAME at $(date -u +%H:%M)"');
    const s = session(labWith({ '.github/workflows/nightly.yml': y }), ACTIONS_PROFILE, 'cd shop', 'gh run list', 'sleep 1900', 'gh run list', 'sleep 86400', 'gh run list -w Nightly');
    expect(s.log[1].err).toEqual(['no runs found']);
    expect(s.log[3].out[1]).toMatch(/^✓\s+Nightly\s+Nightly\s+main\s+schedule\s+4100000001\s+\d+s\s+about 1 minute ago$/);
    expect(s.last.out.length).toBe(3);
    expect(runsOf(s.state)[0]).toMatchObject({ cron: '30 2 * * *', createdAt: Date.UTC(2026, 10, 23, 2, 30) / 1000 });
  });
  it('an invalid workflow file fails its push run with GitHub\'s errors and no jobs', () => {
    const { state } = pushed({ '.github/workflows/bad.yml': wf('on: push', 'jobs:', '  b:', '    runs-on: ubuntu-latest', '    stepz: []') });
    const s = session(state, ACTIONS_PROFILE, 'cd shop', 'gh run list', 'gh run view 4100000001');
    expect(s.log[1].out[1]).toMatch(/^X\s+Go\s+\.github\/workflows\/bad\.yml\s+main\s+push\s+4100000001\s+0s/);
    expect(s.last.out).toEqual(['X main .github/workflows/bad.yml · 4100000001', 'Triggered via push about 2 minutes ago', '', 'X This run likely failed because of a workflow file issue.', '',
      '  Invalid workflow file: .github/workflows/bad.yml#L5', "  The workflow is not valid. .github/workflows/bad.yml (Line: 5, Col: 5): Unexpected value 'stepz'", '',
      'For more information, see: https://github.example/island/shop/actions/runs/4100000001']);
  });
  it('gh workflow disable stops a workflow from starting runs; enable brings it back', () => {
    const s = lab('cd shop', 'gh workflow disable E2E', 'gh workflow list', 'gh workflow list -a', ...PUSH, 'gh workflow enable e2e.yml', 'gh workflow run e2e.yml');
    expect(s.log[1].out).toEqual(['✓ Disabled E2E']);
    expect(s.log[2].out.map(l => l.split(/\s{2,}/)[0])).toEqual(['NAME', 'Build', 'CI', 'Matrix']);
    expect(s.log[3].out[3]).toMatch(/^E2E\s+disabled_manually\s+\d+$/);
    expect(runsOf(s.state).map(r => r.workflowName)).toEqual(['CI']);
    expect(s.log[6].out).toEqual(['✓ Enabled E2E']);
    expect(s.last.err[0]).toBe("could not create workflow dispatch event: HTTP 422: Workflow does not have 'workflow_dispatch' trigger (https://github.example/api/v3/repos/island/shop/actions/workflows/" + s.last.err[0].match(/workflows\/(\d+)/)![1] + '/dispatches)');
  });
});

describe('gh run and gh workflow run', () => {
  it('lists with filters and --json, views a job and its log', () => {
    const s = lab('cd shop', ...PUSH, 'gh workflow run build.yml -f level=patch', 'sleep 60', 'gh run list -w ci.yml', 'gh run list -e workflow_dispatch -b main -L 1', 'gh run list -s failure',
      'gh run list --json databaseId,conclusion,number,workflowName -L 1', 'gh run view --job 11300000001', 'gh run view --log --job 11300000003', 'gh run list --json', 'gh run list --jq .', 'gh run list -w nope');
    expect(s.log[5].out.slice(1)).toEqual([expect.stringMatching(/^X\s+Go\s+CI\s+main\s+push\s+4100000001\s/)]);
    expect(s.log[6].out[1]).toMatch(/^✓\s+Build\s+Build\s+main\s+workflow_dispatch\s+4100000003\s/);
    expect(s.log[7].out.length).toBe(3);
    expect(s.log[8].out).toEqual(['[', '  {', '    "conclusion": "success",', '    "databaseId": 4100000003,', '    "number": 1,', '    "workflowName": "Build"', '  }', ']']);
    expect(s.log[9].out.slice(3, 6)).toEqual(['JOBS', 'X test in 10s (ID 11300000001)', '  ✓ Set up job']);
    expect(s.log[9].out.slice(-2)).toEqual(['To see the full job log, try: gh run view --log --job=11300000001', 'View this run on GitHub: https://github.example/island/shop/actions/runs/4100000001']);
    expect(s.log[10].out.every(l => l.startsWith('version\t'))).toBe(true);
    expect(s.log[11].err[0]).toBe('Specify one or more comma-separated fields for `--json`:');
    expect(s.log[12].err).toEqual(['gh run list --jq／--template：模擬環境不支援，請用 --json 欄位']);
    expect(s.last.err).toEqual(['could not find any workflows named nope']);
  });
  it('explains logs of a run in progress, unknown runs and missing arguments', () => {
    const s = lab('cd shop', ...PUSH, 'gh run view 4100000001 --log', 'gh run view 42', 'gh run view', 'gh run watch', 'gh run delete 1', 'gh run nope');
    expect(s.log[3].err).toEqual(['run 4100000001 is still in progress; logs will be available when it is complete']);
    expect(s.log[4].err).toEqual(['failed to get run: HTTP 404: Not Found (https://github.example/api/v3/repos/island/shop/actions/runs/42)']);
    expect(s.log[5].err).toEqual(['run or job ID required when not running interactively']);
    expect(s.log[6].err).toEqual(['run ID required when not running interactively']);
    expect(s.log[7].err).toEqual(['gh run delete：模擬環境不支援（artifact 在引擎階段 E29）']);
    expect(s.last.err).toEqual(['unknown command "nope" for "gh run"']);
  });
  it('gh workflow run checks the inputs and the ref with GitHub\'s 422 messages', () => {
    const s = lab('cd shop', 'gh workflow run build.yml -f level=major', 'gh workflow run build.yml -f size=1', 'gh workflow run build.yml --ref nope', 'gh workflow run build.yml -f level', 'gh workflow run');
    const api = (id: string) => `(https://github.example/api/v3/repos/island/shop/actions/workflows/${id}/dispatches)`;
    const id = s.log[1].err[0].match(/workflows\/(\d+)/)![1];
    expect(s.log[1].err).toEqual([`could not create workflow dispatch event: HTTP 422: Provided value 'major' for input 'level' not in the list of allowed values ${api(id)}`]);
    expect(s.log[2].err).toEqual([`could not create workflow dispatch event: HTTP 422: Unexpected inputs provided: ["size"] ${api(id)}`]);
    expect(s.log[3].err).toEqual([`could not create workflow dispatch event: HTTP 422: No ref found for: nope ${api(id)}`]);
    expect(s.log[4].err).toEqual(['field "level" requires a value separated by an \'=\' sign']);
    expect(s.last.err).toEqual(['workflow ID, name, or filename required when not running interactively']);
    expect(runsOf(s.state)).toEqual([]);
  });
  it('gh workflow view lists the recent runs', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 60', 'gh workflow view ci.yml');
    expect(s.last.out.slice(3, 7)).toEqual(['Total runs 1', 'Recent runs', 'STATUS  TITLE  WORKFLOW  BRANCH  EVENT  ID', 'X       Go     CI        main    push   4100000001']);
  });
});

describe('steps on the runner', () => {
  it('runs bash -e with the default environment; shell: bash adds pipefail', () => {
    const { log, run: r } = pushed({ '.github/workflows/t.yml': pushJob('    steps:', '      - uses: actions/checkout@v4',
      '      - run: echo "$CI $GITHUB_REF $GITHUB_REF_NAME $GITHUB_EVENT_NAME $GITHUB_REPOSITORY $GITHUB_RUN_NUMBER $GITHUB_RUN_ATTEMPT $RUNNER_OS $(whoami) $(pwd)"',
      '      - run: false | true; echo piped', '      - shell: bash', '        run: false | true; echo never') });
    expect(log).toContain('Run echo "$CI $GITHUB_REF $GITHUB_REF_NAME $GITHUB_EVENT_NAME $GITHUB_REPOSITORY $GITHUB_RUN_NUMBER $GITHUB_RUN_ATTEMPT $RUNNER_OS $(whoami) $(pwd)"\ttrue refs/heads/main main push island/shop 1 1 Linux runner /home/runner/work/shop/shop');
    expect(log).toContain('Run false | true; echo piped\tpiped');
    expect(log).toContain('Run false | true; echo never\tshell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}');
    expect(log).not.toContain('Run false | true; echo never\tnever');
    expect(lastAttempt(r).jobs[0].conclusion).toBe('failure');
  });
  it('checkout fills the workspace from the commit, hashFiles reads it, and git works there', () => {
    const { log } = pushed({ '.github/workflows/t.yml': pushJob('    steps:', '      - uses: actions/checkout@v4', '      - run: cat app.js; ls reports || echo no-reports; git log --oneline -1',
      "      - run: echo \"${{ hashFiles('package-lock.json') }}\"") });
    expect(log).toContain(`Run cat app.js; ls reports || echo no-reports; git log --oneline -1\t${BUGGY.trim()}`);
    expect(log).toContain('Run cat app.js; ls reports || echo no-reports; git log --oneline -1\tno-reports');
    expect(log.some(l => /^Run cat .*\t[0-9a-f]{7} Go$/.test(l))).toBe(true);
    expect(log.some(l => /^Run echo "\$\{\{ hashFiles\('package-lock\.json'\) \}\}"\t[0-9a-f]{64}$/.test(l))).toBe(true);
  });
  it('GITHUB_ENV, GITHUB_PATH, step outputs and workflow commands', () => {
    const { log, run: r } = pushed({ '.github/workflows/t.yml': pushJob('    env:', '      STAGE: ci', '    steps:',
      '      - id: a', '        run: |', '          echo "GREETING=hello" >> "$GITHUB_ENV"', '          echo "/opt/tools" >> "$GITHUB_PATH"', '          echo "n=7" >> "$GITHUB_OUTPUT"',
      '          echo "::group::Details"', '          echo "::add-mask::s3cret"', '          echo "token s3cret"', '          echo "::endgroup::"', '          echo "::warning::Careful"', '          echo "::debug::hidden"',
      '      - run: echo "$GREETING ${{ steps.a.outputs.n }} $STAGE ${{ env.STAGE }} $PATH"', '      - run: echo "::error file=app.js,line=1::Bad add"') });
    expect(log).toContain('Run echo "GREETING=hello" >> "$GITHUB_ENV"\t##[group]Details');
    expect(log).toContain('Run echo "GREETING=hello" >> "$GITHUB_ENV"\ttoken ***');
    expect(log).toContain('Run echo "GREETING=hello" >> "$GITHUB_ENV"\t##[warning]Careful');
    expect(log).toContain('Run echo "GREETING=hello" >> "$GITHUB_ENV"\techo "::add-mask::s3cret"');
    expect(log.filter(l => /\t(::add-mask::|::debug::|hidden$)/.test(l))).toEqual([]);
    expect(log.some(l => l.startsWith('Run echo "$GREETING') && l.includes('\thello 7 ci ci /opt/tools:'))).toBe(true);
    expect(log).toContain('Run echo "$GREETING ${{ steps.a.outputs.n }} $STAGE ${{ env.STAGE }} $PATH"\t  GREETING: hello');
    expect(log).toContain('Run echo "::error file=app.js,line=1::Bad add"\t##[error]Bad add');
    expect(lastAttempt(r).jobs[0].annotations.map(a => [a.level, a.message])).toEqual([['warning', 'Careful'], ['failure', 'Bad add']]);
    expect(lastAttempt(r).jobs[0].conclusion).toBe('success');
    expect(fileCommand('a=1\nb<<EOF\nx\ny\nEOF\n')).toEqual({ values: [['a', '1'], ['b', 'x\ny']] });
    expect(fileCommand('oops')).toEqual({ error: "Invalid format 'oops'" });
    expect(workflowCommands('::notice::n\n::stop::x', [], 2).lines).toEqual(['##[notice]n', '::stop::x']);
  });
  it('if:, continue-on-error, working-directory, unsupported actions and shells, timeout-minutes', () => {
    const { run: r, log } = pushed({ '.github/workflows/t.yml': pushJob('    timeout-minutes: 1', '    steps:', '      - run: exit 2', '        continue-on-error: true', '      - if: always()', '        run: echo always',
      '      - working-directory: nope', '        run: pwd', '      - if: failure()', '        uses: actions/cache@v4', '      - if: failure()', '        shell: python', '        run: print(1)',
      '      - if: always()', '        run: sleep 90; echo late', '      - if: always()', '        run: echo never') });
    const steps = lastAttempt(r).jobs[0].steps.map(s => [s.name, s.outcome, s.conclusion]);
    expect(steps).toEqual([['Set up job', 'success', 'success'], ['Run exit 2', 'failure', 'success'], ['Run echo always', 'success', 'success'], ['Run pwd', 'failure', 'failure'],
      ['Run actions/cache@v4', 'failure', 'failure'], ['Run print(1)', 'failure', 'failure'], ['Run sleep 90; echo late', 'cancelled', 'cancelled'], ['Complete job', 'success', 'success']]);
    expect(log).toContain("Run pwd\t##[error]An error occurred trying to start process '/usr/bin/bash' with working directory '/home/runner/work/shop/shop/nope'. No such file or directory");
    expect(log).toContain('Run actions/cache@v4\t##[error]模擬環境不支援 actions/cache@v4（E28 支援 actions/checkout、actions/setup-node、actions/setup-python；cache 與 artifact 在 E29）');
    expect(log).toContain('Run print(1)\t##[error]模擬環境的 run 只支援 bash 與 sh（shell: python）');
    expect(lastAttempt(r).jobs[0].annotations.at(-1)!.message).toBe('The job running on runner GitHub Actions 1 has exceeded the maximum execution time of 1 minutes.');
    expect(lastAttempt(r).jobs[0].completedAt! - lastAttempt(r).jobs[0].startedAt!).toBe(60);
  });
  it('expressions are interpolated before bash parses the script (script injection)', () => {
    const y = pushJob('    steps:', '      - run: echo "Title: ${{ github.event.head_commit.message }}"');
    const s = session(labWith({ '.github/workflows/t.yml': y }), ACTIONS_PROFILE, 'cd shop', "git commit -q --allow-empty -m 'x\"; echo INJECTED; echo \"'", 'git push -q', 'sleep 60', 'gh run view 4100000001 --log');
    expect(s.last.out.some(l => l.endsWith(' INJECTED'))).toBe(true);
  });
});

describe('CI tools', () => {
  it('follow the files on the learner\'s machine too, and only exist where declared', () => {
    const s = lab('cd shop', 'npm test', `printf '${FIXED.replace('\n', '\\n')}' > app.js`, 'npm test', 'cat reports/junit.xml', 'npm run lint', 'npm run e2e', 'npm run e2e', 'npm start');
    expect(s.log[1]).toMatchObject({ out: ['FAIL test/add.test.js', '  ● add › adds two numbers', 'Tests: 1 failed, 2 passed, 3 total'], status: 1 });
    expect(s.log[3]).toMatchObject({ out: ['PASS test/add.test.js', 'Tests: 3 passed, 3 total'], status: 0 });
    expect(s.log[4].out).toEqual(['<testsuites tests="3" failures="0"/>']);
    expect(s.log[5].out).toEqual(['lint: no problems']);
    expect(s.log[6]).toMatchObject({ err: ['Error: page did not load within 5000ms'], status: 1 });
    expect(s.log[7]).toMatchObject({ out: ['e2e: 4 passed'], status: 0 });
    expect(s.last.err[0]).toMatch(/^bash: npm: command not found（/);
    const r = pushed({ '.github/workflows/t.yml': pushJob('    steps:', '      - run: npm run lint') });
    expect(r.log).toContain('Run npm run lint\t/home/runner/work/_temp/0002.sh: line 1: npm: command not found');
    expect(r.log).toContain('Run npm run lint\t##[error]Process completed with exit code 127.');
  });
  it('works on my machine: a file that was never committed', () => {
    const tools = [...TOOLS.filter(t => t.command !== 'npm test'), { command: 'npm test', cases: [{ when: [{ path: 'test/fixtures.json' }], stdout: 'ok' }, { stderr: 'Cannot find test/fixtures.json', exit: 1 }] }];
    const s = session({ ...actionsLab, actions: { tools } }, ACTIONS_PROFILE, 'cd shop', "printf '{}' > test/fixtures.json", 'npm test', ...PUSH, 'sleep 60', 'gh run view 4100000001 --log-failed');
    expect(s.log[2].out).toEqual(['ok']);
    expect(s.last.out.some(l => l.endsWith('Cannot find test/fixtures.json'))).toBe(true);
  });
});

describe('the check run, the lesson data and replays', () => {
  it('the exercises: the solutions pass, the mistakes fail with the expected messages', () => {
    for (const ex of [fixExercise, flakyExercise, dispatchExercise]) {
      expect(checkTerminalExercise(ex, [actionsLab], ex.solution).ok, ex.id).toBe(true);
      for (const m of ex.mistakes) expect(checkTerminalExercise(ex, [actionsLab], m.commands).ok, `${ex.id}: ${m.why}`).toBe(false);
    }
    const msg = (ex: typeof fixExercise, i: number) => checkTerminalExercise(ex, [actionsLab], ex.mistakes[i].commands).results[0].message;
    expect(msg(fixExercise, 1)).toBe('https://github.example/island/shop.git 的 main 目前的 commit 最新的 ci.yml run 應該：結論是 success，但最新的 run #1（4100000001）還在執行（queued），先用 gh run watch 4100000001 等它完成');
    expect(msg(flakyExercise, 0)).toBe('https://github.example/island/shop.git 最新的 push E2E run 應該：job e2e 的結論是 success、至少執行了 2 次（attempt），但最新的 run #1（4100000002）只執行了 1 次（attempt 1）');
    expect(msg(dispatchExercise, 0)).toBe('https://github.example/island/shop.git 最新的 workflow_dispatch Build run 應該：job publish 的結論是 success、日誌包含「Publishing v1.1.0」，但最新的 run #1（4100000001）的日誌沒有「Publishing v1.1.0」');
  });
  it('checks status, steps, log text, a local repository and missing runs', () => {
    const s = lab('cd shop', ...PUSH, 'sleep 60');
    const why = (c: Partial<Extract<TerminalCheck, { kind: 'run' }>>) => {
      const ex = { ...fixExercise, checks: [{ kind: 'run' as const, repo: SHOP, workflow: 'ci.yml', ...c }] };
      const r = checkTerminalExercise(ex, [actionsLab], ['cd shop', ...PUSH, 'sleep 60']).results[0];
      return r.ok ? 'ok' : r.message.slice(r.message.indexOf('但') + 1);
    };
    void s;
    expect(why({ status: 'completed' })).toBe('ok');
    expect(why({ job: 'test', step: 'Run npm test', conclusion: 'failure', logIncludes: 'Tests: 1 failed' })).toBe('ok');
    expect(why({ job: 'test', step: 'Run npm ci', conclusion: 'failure' })).toBe('最新的 run #1（4100000001）的 step「Run npm ci」的結論是 success');
    expect(why({ logExcludes: 'FAIL' })).toBe('最新的 run #1（4100000001）的日誌有「FAIL」');
    expect(why({ job: 'lint' })).toBe('最新的 run #1（4100000001）沒有 job lint');
    expect(why({ event: 'pull_request' })).toBe('沒有 pull_request 觸發的 ci.yml run');
    expect(why({ repo: '/home/learner/shop', workflow: 'CI', conclusion: 'failure' })).toBe('ok');
    expect(why({ repo: '/home/learner', workflow: 'CI' })).toBe('/home/learner 不是 Git 儲存庫');
  });
  it('validates the check and the actions data', () => {
    const problems = (c: object) => terminalContentProblems({ ...actionsContent, exercises: [{ ...fixExercise, checks: [{ kind: 'run', repo: SHOP, workflow: 'ci.yml', ...c } as TerminalCheck] }] });
    expect(problems({ event: 'release' })).toContain('exercise fix: a run check\'s event is one of push, pull_request, workflow_dispatch, schedule');
    expect(problems({ status: 'queued', conclusion: 'success' })).toContain('exercise fix: a run check with a conclusion expects status completed');
    expect(problems({ step: 'Run npm test' })).toContain('exercise fix: a run check\'s step needs a job and is a step name');
    expect(problems({ attempt: 0 })).toContain('exercise fix: a run check\'s attempt is 1..10');
    expect(problems({ workflow: '' })).toContain('exercise fix: a run check needs a workflow (a file name like ci.yml, its path or its name)');
    const data = (actions: TerminalMachine['actions']) => machineProblems({ ...actionsLab, actions });
    expect(data({ labels: [] })).toEqual(['machine dev-05: actions: labels are 1..8 runner labels']);
    expect(data({ tools: [{ command: 'npm  test', cases: [{}] }] })).toEqual(['machine dev-05: actions: tool npm  test: command is 1..8 words']);
    expect(data({ tools: [{ command: 'npm test', cases: [] }] })).toEqual(['machine dev-05: actions: tool npm test: 1..8 cases']);
    expect(data({ tools: [{ command: 'npm test', cases: [{ exit: 300 }] }] })).toEqual(['machine dev-05: actions: tool npm test case 1: exit is 0..255']);
    expect(data({ tools: [{ command: 'npm test', cases: [{ when: [{ path: '/abs' }] }] }] })).toEqual(['machine dev-05: actions: tool npm test case 1: a condition is { path (relative), includes | excludes | absent } or { env, set? }']);
    expect(data({ tools: [{ command: 'npm test', cases: [{}], flaky: { failOnAttempts: [] } }] })).toEqual(['machine dev-05: actions: tool npm test: flaky needs failOnAttempts (attempts 1..10) and a case\'s output, exit and seconds']);
    expect(data({ ids: { run: 0 } })).toEqual(['machine dev-05: actions: ids are positive integers']);
    expect(data({ tools: [{ command: 'git status', cases: [{}] }] })).toEqual(['machine dev-05: actions: tool git status: git is a command of the simulation']);
    expect(data({ ids: { run: 7, job: 70 }, labels: ['self-hosted'] })).toEqual([]);
  });
  it('replays are deterministic and do not change the state they start from', () => {
    const start = machineState(actionsLab), before = JSON.stringify([...start.git!.forge.map(f => [...f.refs]), start.ci!.next]);
    const cmds = ['cd shop', ...PUSH, 'gh workflow run matrix.yml', 'sleep 60', 'gh run list', 'gh run view 4100000003 --log'];
    const a = replay(start, cmds, ACTIONS_PROFILE), b = replay(start, cmds, ACTIONS_PROFILE);
    expect(a.steps.map(x => x.output)).toEqual(b.steps.map(x => x.output));
    expect(JSON.stringify([...start.git!.forge.map(f => [...f.refs]), start.ci!.next])).toBe(before);
    expect(start.git!.forge[0].site!.runs).toBeUndefined();
    expect(a.state.ci!.next).toEqual({ run: 4100000004, job: 11300000006 });
  });
  it('declared IDs and labels', () => {
    const s = session({ ...actionsLab, actions: { tools: TOOLS, ids: { run: 900, job: 9000 }, labels: ['ubuntu-latest'] } }, ACTIONS_PROFILE, 'cd shop', ...PUSH, 'gh run list');
    expect(s.last.out.slice(1).map(l => l.split(/\s{2,}/)[5])).toEqual(['901', '900']);
  });
});
