import { describe, expect, it } from 'vitest';
import { checkTerminalExercise, type TerminalCheck } from '@/lib/terminal/lesson';
import { lastAttempt } from '@/lib/terminal/actions-model';
import { envLab, json, lab, labWith, PRODUCTION, PUSH, runsOf, session, SHOP, siteOf, wf } from './support/environments-fixture';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md §4, §6): concurrency groups (a pending run waits for the
 * running one and only one may wait; cancel-in-progress; a run held behind a deployment waiting for review; job-level
 * groups), and the REST endpoints for environments, branch policies, users and deployment records.
 */
const POST = (id: number) => `gh api -X POST repos/{owner}/{repo}/actions/runs/${id}/pending_deployments -F 'environment_ids[]=${PRODUCTION}' -f state=approved -f comment='ok'`;
const SHIP = wf('name: Ship', 'on: workflow_dispatch', 'concurrency: production', 'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    environment: production', '    steps:', '      - run: echo ship');
const JOB = wf('name: Job', 'on: workflow_dispatch', 'jobs:', '  build:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo build', '  deploy:', '    needs: build', '    runs-on: ubuntu-latest',
  '    concurrency:', '      group: prod-deploy', '    steps:', '      - run: sleep 100', '  after:', '    needs: deploy', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo done');
const statuses = (s: ReturnType<typeof lab>) => runsOf(s.state).map(r => [r.id, lastAttempt(r).cancelledAt === undefined ? 'live' : 'cancelled', lastAttempt(r).startedAt - r.createdAt]);
const check = (c: TerminalCheck, commands: string[]) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: 'dev-09', statement: '', checks: [c], solution: [], mistakes: [], hints: [], explanation: '' }, [envLab], commands).results[0];

describe('workflow concurrency groups', () => {
  it('a newer run waits for the running one (pending); a third replaces the pending one', () => {
    const s = lab('cd shop', 'gh workflow run queue.yml', 'sleep 10', 'gh workflow run queue.yml', 'sleep 10', 'gh run list --json databaseId,status', 'gh run view 4100000002',
      'gh workflow run queue.yml', 'gh run view 4100000002', 'sleep 300', 'gh run list');
    expect(json(s.log[5].out)).toEqual([{ databaseId: 4100000002, status: 'pending' }, { databaseId: 4100000001, status: 'in_progress' }]);
    expect(s.log[6].out).toContain("Waiting for a run in the concurrency group 'queue-refs/heads/main' to complete");
    expect(s.log[8].out).toEqual(expect.arrayContaining(['- main Queue · 4100000002', "X Canceling since a higher priority waiting request for 'queue-refs/heads/main' exists"]));
    const [first, , third] = runsOf(s.state);
    expect(lastAttempt(third).startedAt).toBe(lastAttempt(first).jobs[0].completedAt);
    expect(s.last.out.slice(1).map(l => l.split(/\s{2,}/)[0])).toEqual(['✓', '-', '✓']);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'queue.yml', status: 'pending' }, ['cd shop', 'gh workflow run queue.yml', 'gh workflow run queue.yml']).ok).toBe(true);
  });
  it('cancel-in-progress cancels the running run', () => {
    const s = lab('cd shop', 'gh workflow run rush.yml', 'sleep 10', 'gh workflow run rush.yml', 'gh run view 4100000001', 'sleep 200');
    expect(s.log[4].out).toEqual(expect.arrayContaining(['- slow in 8s (ID 11300000001)', "X Canceling since a higher priority waiting request for 'rush' exists"]));
    expect(statuses(s)).toEqual([[4100000001, 'cancelled', 0], [4100000002, 'live', 0]]);
  });
  it('a run held behind a deployment waiting for review starts when that run ends (or is cancelled)', () => {
    const m = labWith({ production: { reviewers: ['mei-lin'] }, files: { '.github/workflows/ship.yml': SHIP } });
    const s = session(m, undefined, 'cd shop', 'gh workflow run ship.yml', 'sleep 10', 'gh workflow run ship.yml', 'sleep 10', 'gh run watch 4100000002', POST(4100000001), 'sleep 20', 'gh run view 4100000002');
    expect(lastAttempt(runsOf(s.state)[1]).jobs).toHaveLength(1);
    expect(s.log[5].err).toEqual(['gh run watch：run 4100000002 在等待 concurrency group 裡的另一個 run（或 job）結束，真實的 gh 會一直等下去']);
    expect(s.last.out).toContain('deploy: Waiting for review: production needs approval to start deploying changes.');
    expect(lastAttempt(runsOf(s.state)[1]).startedAt).toBe(lastAttempt(runsOf(s.state)[0]).jobs[0].completedAt);
    const c = session(m, undefined, 'cd shop', 'gh workflow run ship.yml', 'sleep 10', 'gh workflow run ship.yml', 'sleep 10', 'gh run cancel 4100000001', 'sleep 5', 'gh run list --json databaseId,status,conclusion');
    expect(json(c.last.out)).toEqual([{ conclusion: '', databaseId: 4100000002, status: 'waiting' }, { conclusion: 'cancelled', databaseId: 4100000001, status: 'completed' }]);
    const blocked = session(m, undefined, 'cd shop', 'gh workflow run ship.yml', 'gh workflow run ship.yml', 'gh run cancel 4100000002', `gh run view 4100000002`);
    expect(blocked.last.out.slice(0, 1)).toEqual(['- main Ship · 4100000002']);
  });
  it('a job-level group holds a job of a newer run; a third run\'s job replaces the held one', () => {
    const m = labWith({ files: { '.github/workflows/job.yml': JOB } });
    const s = session(m, undefined, 'cd shop', 'gh workflow run job.yml', 'sleep 20', 'gh workflow run job.yml', 'sleep 10', 'gh run view 4100000002', 'gh workflow run job.yml', 'sleep 5', 'gh run view 4100000002', 'sleep 400');
    expect(s.log[5].out).toContain("deploy: Waiting for a job in the concurrency group 'prod-deploy' to complete");
    expect(s.log[8].out).toEqual(expect.arrayContaining(['- deploy (ID 11300000005)', '- after in 0s (ID 11300000006)', "X Canceling since a higher priority waiting request for 'prod-deploy' exists"]));
    const [one, , three] = runsOf(s.state).map(r => lastAttempt(r).jobs.find(j => j.key === 'deploy')!);
    expect(three.startedAt).toBe(one.completedAt! + 2);
  });
});

describe('the REST endpoints', () => {
  it('reads and changes environments, branch policies and users (admin only, with GitHub\'s validation)', () => {
    const put = (body: string) => [`echo '${body}' > env.json`, 'gh api -X PUT repos/{owner}/{repo}/environments/production --input env.json'];
    const s = lab('cd shop', 'gh api repos/{owner}/{repo}/environments', ...put('{"wait_timer":50000}'), ...put('{"reviewers":[{"type":"Team","id":1}]}'), ...put('{"reviewers":[{"type":"User","id":9}]}'),
      ...put('{"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":true}}'),
      ...put('{"wait_timer":3,"prevent_self_review":true,"reviewers":[{"type":"User","id":2001}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'),
      'gh api -X POST repos/{owner}/{repo}/environments/production/deployment-branch-policies -f name=release/*', 'gh api repos/{owner}/{repo}/environments/production/deployment-branch-policies',
      'gh api -X DELETE repos/{owner}/{repo}/environments/production/deployment-branch-policies/3100003', 'gh api users/kai', 'gh api users/nobody', 'gh api -X PUT repos/{owner}/{repo}/environments/qa --silent', 'gh secret set TOKEN -e qa --body lesson-token-qa-01');
    const list = json(s.log[1].out);
    expect([list.total_count, list.environments.map((e: { name: string }) => e.name)]).toEqual([2, ['staging', 'production']]);
    expect(list.environments[0].deployment_branch_policy).toEqual({ protected_branches: false, custom_branch_policies: true });
    expect(s.log[3].err.at(-1)).toBe("For 'properties/wait_timer', 50000 is greater than the maximum of 43200. (HTTP 422)");
    expect(s.log[5].err).toEqual(['gh: Teams are only available to organization repositories (HTTP 422)']);
    expect(s.log[7].err).toEqual(['gh: Reviewers must be a User or Team that has access to the repository (HTTP 422)']);
    expect(s.log[9].err).toEqual(['gh: Exactly one of protected_branches or custom_branch_policies must be true (HTTP 422)']);
    const env = json(s.log[11].out);
    expect(env.protection_rules.map((r: { type: string }) => r.type)).toEqual(['wait_timer', 'required_reviewers', 'branch_policy']);
    expect(env.protection_rules[1]).toEqual(expect.objectContaining({ prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { login: 'kai', id: 2001, type: 'User', html_url: 'https://github.example/kai' } }] }));
    expect(json(s.log[12].out)).toEqual({ id: 3100003, name: 'release/*', type: 'branch' });
    expect(json(s.log[13].out)).toEqual({ total_count: 1, branch_policies: [{ id: 3100003, name: 'release/*', type: 'branch' }] });
    expect(json(s.log[15].out)).toEqual({ login: 'kai', id: 2001, type: 'User', html_url: 'https://github.example/kai', name: 'Kai Chen' });
    expect(s.log[16].err).toEqual(['gh: Not Found (HTTP 404)']);
    expect(s.last.out).toEqual(['✓ Set Actions secret TOKEN for island/shop']);
    expect(siteOf(s.state).envRules!.find(e => e.name === 'production')).toEqual(expect.objectContaining({ waitTimer: 3, reviewers: ['kai'], policy: { protectedBranches: false, patterns: [] } }));
    const write = session({ ...envLab, forge: { ...envLab.forge!, repos: [{ ...envLab.forge!.repos![0], permission: 'write' }] } }, undefined, 'cd shop', ...put('{"wait_timer":1}'));
    expect(write.last.err).toEqual(['gh: Must have admin rights to Repository. (HTTP 403)']);
  });
  it('lists deployments (filtered), their statuses, and an older success becomes inactive', () => {
    const s = lab(...PUSH, 'sleep 30', POST(4100000001), 'sleep 60', "git commit -q --allow-empty -m 'Again'", 'git push -q', 'sleep 30', POST(4100000002), 'sleep 60',
      'gh api repos/{owner}/{repo}/deployments?environment=production', 'gh api repos/{owner}/{repo}/deployments/1900000002/statuses', 'gh api repos/{owner}/{repo}/deployments/1900000099');
    expect(json(s.log[11].out).map((d: { id: number; environment: string }) => [d.id, d.environment])).toEqual([[1900000004, 'production'], [1900000002, 'production']]);
    expect(json(s.log[12].out).map((x: { state: string; environment_url: string }) => [x.state, x.environment_url])).toEqual([['inactive', ''], ['success', 'https://shop.example'], ['in_progress', ''], ['waiting', '']]);
    expect(s.last.err).toEqual(['gh: Not Found (HTTP 404)']);
  });
  it('a job naming an environment the repository does not have creates it', () => {
    const PREVIEW = wf('name: Preview', 'on: workflow_dispatch', 'jobs:', '  up:', '    runs-on: ubuntu-latest', '    environment: preview-${{ github.ref_name }}', '    steps:', '      - run: echo up');
    const s = session(labWith({ files: { '.github/workflows/preview.yml': PREVIEW } }), undefined, 'cd shop', 'gh workflow run preview.yml', 'sleep 10', 'gh api repos/{owner}/{repo}/environments/preview-main');
    expect(json(s.last.out)).toEqual(expect.objectContaining({ id: 161088003, name: 'preview-main', protection_rules: [], deployment_branch_policy: null }));
    expect(siteOf(s.state).environments).toEqual(['staging', 'production', 'preview-main']);
  });
});
