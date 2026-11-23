import { describe, expect, it } from 'vitest';
import { ARTIFACTS_PROFILE, ENVIRONMENTS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, profileOf, replay, terminalContentProblems, type TerminalCheck } from '@/lib/terminal/lesson';
import { lastAttempt, runStatus } from '@/lib/terminal/actions-model';
import { approveExercise, envContent, envLab, json, lab, labWith, PRODUCTION, protectExercise, PUSH, runsOf, session, SHOP } from './support/environments-fixture';

/*
 * Engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md): the environments profile — staging → production
 * promotion with a required reviewer (the learner through gh api, or an approver persona on the clock), the wait timer,
 * the deployment branch policy, rejection and self-review, rollback through workflow_dispatch with an input, the checks
 * environment and deployment, the lesson data and the boundary. Concurrency groups and the REST endpoints are in
 * terminal-e30-concurrency.test.ts. Below the profile everything behaves as in E29.
 */
const POST = (id: number, state = 'approved', env = PRODUCTION) => `gh api -X POST repos/{owner}/{repo}/actions/runs/${id}/pending_deployments -F 'environment_ids[]=${env}' -f state=${state} -f comment='ok'`;
const RUN = 4100000001;
const jobsOf = (s: ReturnType<typeof lab>) => lastAttempt(runsOf(s.state)[0]).jobs;
const check = (c: TerminalCheck, commands: string[], machine = envLab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: 'dev-09', statement: '', checks: [c], solution: [], mistakes: [], hints: [], explanation: '' }, [machine], commands).results[0];

describe('the environments profile', () => {
  it('is the artifacts profile with the environments feature and no new commands', () => {
    expect(ENVIRONMENTS_PROFILE.commands).toEqual(ARTIFACTS_PROFILE.commands);
    expect(ENVIRONMENTS_PROFILE.features).toEqual([...ARTIFACTS_PROFILE.features!, 'environments']);
    expect(profileOf(envLab)).toBe(ENVIRONMENTS_PROFILE);
    expect(machineProblems(envLab)).toEqual([]);
    expect(terminalContentProblems(envContent)).toEqual([]);
  });
  it('below it the rules, approvers, checks and endpoints are not there, and an environment job does not wait', () => {
    const low = { ...envLab, profile: 'artifacts' as const };
    expect(machineProblems(low)).toContain(`machine dev-09: forge repo ${SHOP}: environmentRules and approvers need the environments profile (engine stage E30)`);
    const plain = { ...low, forge: { login: 'mei-lin', repos: [{ url: SHOP, permission: 'admin' as const, environments: ['staging', 'production'] }] } };
    const p = terminalContentProblems({ ...envContent, machines: [plain] });
    expect(p).toContain('exercise approve: a deployment check needs an environments machine (engine stage E30) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(p).toContain('exercise protect: an environment check needs an environments machine (engine stage E30) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    const s = session(plain, ARTIFACTS_PROFILE, ...PUSH, 'sleep 30', `gh api repos/{owner}/{repo}/actions/runs/${RUN}/pending_deployments`, 'gh run view');
    expect(s.log[4].err[0]).toMatch(/^gh api：模擬環境只支援 user、repos\/\{owner\}\/\{repo\}（GET、PATCH）與 .*（GET、PUT、DELETE）$/);
    expect(runStatus(runsOf(s.state)[0], s.state.clock!.now)).toBe('completed');
    expect(jobsOf(s).map(j => [j.name, j.conclusion, j.env])).toEqual([['staging', 'success', undefined], ['production', 'success', undefined]]);
    expect(s.state.ci!.env).toBeUndefined();
  });
});

describe('promotion from staging to production', () => {
  it('staging deploys, production waits for review; the learner approves through the API', () => {
    const s = lab(...PUSH, 'sleep 30', 'gh run view', `gh api repos/{owner}/{repo}/actions/runs/${RUN}/pending_deployments`, POST(RUN), 'sleep 60', `gh run view ${RUN}`);
    expect(s.log[4].err).toEqual(['run or job ID required when not running interactively']);
    const view = session(lab(...PUSH, 'sleep 30').state, undefined, `gh run view ${RUN}`).last.out;
    expect(view.slice(0, 7)).toEqual(['* main Deploy · 4100000001', 'Triggered via push less than a minute ago', '', 'JOBS', '✓ staging in 1s (ID 11300000001)', '* production (ID 11300000002)', '']);
    expect(view[7]).toBe('production: Waiting for review: production needs approval to start deploying changes.');
    const pending = json(s.log[5].out);
    expect(pending).toEqual([expect.objectContaining({ environment: expect.objectContaining({ id: PRODUCTION, name: 'production' }), wait_timer: 0, wait_timer_started_at: '2026-11-23T02:00:03Z', current_user_can_approve: true })]);
    expect(pending[0].reviewers.map((r: { reviewer: { login: string; id: number } }) => [r.reviewer.login, r.reviewer.id])).toEqual([['mei-lin', 1001], ['kai', 2001]]);
    expect(json(s.log[6].out)).toEqual([expect.objectContaining({ id: 1900000002, environment: 'production', ref: 'main', creator: expect.objectContaining({ login: 'github-actions[bot]' }) })]);
    expect(s.last.out[0]).toBe('✓ main Deploy · 4100000001');
    const prod = jobsOf(s)[1];
    expect([prod.queuedAt, prod.startedAt! - prod.queuedAt, prod.env!.review]).toEqual([prod.env!.since, 29, { state: 'approved', by: 'mei-lin', at: prod.env!.since + 27, comment: 'ok' }]);
    expect(prod.env!.url).toBe('https://shop.example');
  });
  it('an approver persona approves on the clock (gh run watch waits for it)', () => {
    const s = lab(...PUSH, 'sleep 1700', 'gh run list -L 1 --json status', `gh run watch ${RUN}`);
    expect(json(s.log[4].out)).toEqual([{ status: 'waiting' }]);
    expect(s.last.out.at(-1)).toBe("✓ Run Deploy (4100000001) completed with 'success'");
    expect(jobsOf(s)[1].env!.review).toEqual({ state: 'approved', by: 'kai', at: jobsOf(s)[1].env!.since + 1800, comment: 'LGTM' });
    const reject = session(labWith({ production: { reviewers: ['kai'] }, approvers: [{ login: 'kai', after: 600, decision: 'reject', comment: 'Freeze week' }] }), undefined, ...PUSH, 'sleep 700', `gh run view ${RUN}`);
    expect(reject.last.out).toContain("X The deployment was rejected or didn't satisfy other protection rules.");
  });
  it('without a persona gh run watch explains that the run waits for a review', () => {
    const s = session(labWith({ production: { reviewers: ['mei-lin'] } }), undefined, ...PUSH, `gh run watch ${RUN}`);
    expect(s.last.err).toEqual([`gh run watch：run ${RUN} 的 production 在等待 environment production 的審核，真實的 gh 會一直等下去；用 gh api repos/{owner}/{repo}/actions/runs/${RUN}/pending_deployments 查看，再以 -X POST 核准或拒絕`]);
  });
  it('the wait timer delays the start; with reviewers an approval cannot start it earlier', () => {
    const s = session(labWith({ production: { waitTimer: 5 } }), undefined, ...PUSH, 'sleep 60', `gh run view ${RUN}`, `gh run watch ${RUN}`);
    expect(s.log[4].out).toContain('production: Waiting for the wait timer of production (4m3s left)');
    const prod = lastAttempt(runsOf(s.state)[0]).jobs[1];
    expect(prod.startedAt! - prod.env!.since).toBe(302);
    const both = session(labWith({ production: { waitTimer: 5, reviewers: ['mei-lin'] } }), undefined, ...PUSH, 'sleep 30', POST(RUN), 'sleep 600');
    const p2 = lastAttempt(runsOf(both.state)[0]).jobs[1];
    expect([p2.startedAt! - p2.env!.since, p2.conclusion]).toEqual([302, 'success']);
  });
  it('a branch the policy does not allow fails at once with GitHub\'s message', () => {
    const s = lab('cd shop', 'gh workflow run deploy.yml --ref feature', 'sleep 30', `gh run view ${RUN}`, 'gh workflow run deploy.yml --ref release/1.0', 'sleep 5');
    expect(s.log[3].out).toEqual(expect.arrayContaining(['X staging (ID 11300000001)', '- production in 0s (ID 11300000002)',
      'X Branch "feature" is not allowed to deploy to staging due to environment protection rules.', 'staging: .github#0']));
    const [refused, allowed] = runsOf(s.state);
    expect(lastAttempt(refused).jobs[0].env).toEqual(expect.objectContaining({ refused: true, waits: false }));
    expect(lastAttempt(refused).jobs[0].env!.deployment).toBeUndefined();
    expect(lastAttempt(allowed).jobs[0].conclusion).toBe('success');
    const prot = session(labWith({ production: { branches: 'protected' } }), undefined, 'cd shop', 'gh workflow run deploy.yml', 'sleep 30');
    expect(lastAttempt(runsOf(prot.state)[0]).jobs[1].annotations[0].message).toBe('Branch "main" is not allowed to deploy to production due to environment protection rules.');
  });
  it('a rejection fails the job; self-review and other people\'s gates are refused', () => {
    const s = lab(...PUSH, 'sleep 30', POST(RUN, 'rejected'), `gh run view ${RUN}`, 'sleep 3000', POST(RUN));
    expect(s.log[5].out).toEqual(expect.arrayContaining(['X production (ID 11300000002)', "X The deployment was rejected or didn't satisfy other protection rules."]));
    expect([jobsOf(s)[1].conclusion, jobsOf(s)[1].startedAt]).toEqual(['failure', undefined]);
    expect(s.last.err).toEqual(['gh: No pending deployment requests to approve or reject (HTTP 422)']);
    const self = session(labWith({ production: { reviewers: ['mei-lin'], preventSelfReview: true } }), undefined, ...PUSH, 'sleep 30', `gh api repos/{owner}/{repo}/actions/runs/${RUN}/pending_deployments`, POST(RUN));
    expect(json(self.log[4].out)[0].current_user_can_approve).toBe(false);
    expect(self.last.err).toEqual(['gh: There was a problem approving one of the gates (HTTP 422)']);
    const other = session(labWith({ production: { reviewers: ['kai'] } }), undefined, ...PUSH, 'sleep 30', POST(RUN), "gh api -X POST repos/{owner}/{repo}/actions/runs/4100000001/pending_deployments -f state=approved -f comment=x");
    expect(other.log[4].err).toEqual(['gh: There was a problem approving one of the gates (HTTP 422)']);
    expect(other.last.err).toEqual(['gh: Invalid request.', '', '"environment_ids" wasn\'t supplied. (HTTP 422)']);
  });
  it('rolls back by dispatching an earlier image to production (the same commit, the chosen digest)', () => {
    const s = lab('cd shop', 'gh workflow run deploy.yml -f image=sha256:0a1b2c', 'sleep 30', POST(RUN), 'sleep 30', `gh run view ${RUN} --log`);
    expect(s.last.out.filter(l => l.startsWith('production\t') && l.endsWith(' deploy sha256:0a1b2c to production'))).toHaveLength(1);
    const ok: TerminalCheck = { kind: 'run', repo: SHOP, workflow: 'deploy.yml', event: 'workflow_dispatch', job: 'production', conclusion: 'success', logIncludes: 'deploy sha256:0a1b2c to production' };
    expect(check(ok, ['cd shop', 'gh workflow run deploy.yml -f image=sha256:0a1b2c', 'sleep 30', POST(RUN), 'sleep 30']).ok).toBe(true);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'deploy.yml', status: 'waiting' }, ['cd shop', 'gh workflow run deploy.yml -f image=sha256:0a1b2c', 'sleep 30']).ok).toBe(true);
  });
});

describe('the checks environment and deployment', () => {
  it('passes the exercises\' solutions and explains the mistakes', () => {
    const ok = checkTerminalExercise(approveExercise, [envLab], approveExercise.solution);
    expect(ok.results.map(r => r.ok)).toEqual([true]);
    const waiting = checkTerminalExercise(approveExercise, [envLab], approveExercise.mistakes[0].commands).results[0];
    expect(waiting.message).toMatch(/^https:\/\/github\.example\/island\/shop\.git 最新的 production 部署應該是 預設分支 目前的 commit、狀態是 success，但最新的部署 1900000002（main 的 [0-9a-f]{7}）還沒有結束（waiting），先用 gh run watch 4100000001 等它完成$/);
    expect(checkTerminalExercise(protectExercise, [envLab], protectExercise.solution).results.map(r => r.ok)).toEqual([true]);
    expect(checkTerminalExercise(protectExercise, [envLab], protectExercise.mistakes[0].commands).results[0].message)
      .toBe(`${SHOP} 應該有 environment production（必要的審核者是 kai；等待 10 分鐘；只有符合 main 的分支可以部署），但部署分支的規則是：任何分支都可以部署`);
  });
  it('reads the latest deployment, a commit label, a ref and rejections', () => {
    const done = [...PUSH, 'sleep 30', POST(RUN), 'sleep 60'];
    expect(check({ kind: 'deployment', repo: SHOP, environment: 'staging', ref: 'main', status: 'success' }, done).ok).toBe(true);
    expect(check({ kind: 'deployment', repo: SHOP, environment: 'production', commit: 'c2', latest: true }, done).message).toMatch(/但最新的部署 1900000002（main 的 [0-9a-f]{7}）不是 commit c2$/);
    expect(check({ kind: 'deployment', repo: SHOP, environment: 'production', status: 'failure' }, [...PUSH, 'sleep 30', POST(RUN, 'rejected')]).ok).toBe(true);
    expect(check({ kind: 'deployment', repo: SHOP, environment: 'qa' }, done).message).toBe(`${SHOP} 有一個 qa 部署應該存在，但沒有部署到 qa 的紀錄`);
    expect(check({ kind: 'environment', repo: SHOP, name: 'production', reviewers: ['kai', 'mei-lin'], waitTimer: 0, branches: 'all' }, []).ok).toBe(true);
    expect(check({ kind: 'environment', repo: SHOP, name: 'staging', branches: 'protected' }, []).message).toBe(`${SHOP} 應該有 environment staging（只有受保護的分支可以部署），但部署分支的規則是：只有符合 main、release/* 的分支可以部署`);
    expect(check({ kind: 'environment', repo: SHOP, name: 'qa' }, []).message).toBe(`${SHOP} 應該有 environment qa，但沒有這個 environment`);
  });
  it('validates the check data and the lesson data', () => {
    const bad = (c: Record<string, unknown>) => terminalContentProblems({ ...envContent, exercises: [{ ...approveExercise, checks: [c as TerminalCheck] }] }).filter(x => x.startsWith('exercise approve: a'));
    expect(bad({ kind: 'deployment', repo: SHOP, environment: 'production', status: 'done' })).toEqual(['exercise approve: a deployment check\'s status is one of waiting, in_progress, success, failure, error, inactive']);
    expect(bad({ kind: 'deployment', repo: SHOP, environment: 'production', tip: true, commit: 'c1' })).toEqual(['exercise approve: a deployment check\'s commit is a commit label of the git data (not with tip)']);
    expect(bad({ kind: 'environment', repo: SHOP, name: 'production', waitTimer: 50000 })).toEqual(['exercise approve: an environment check\'s waitTimer is 0..43200 minutes']);
    const m = labWith({ production: { reviewers: ['nobody'], waitTimer: -1, branches: [] }, approvers: [{ login: 'mei-lin', after: -5 }] });
    expect(machineProblems(m)).toEqual([
      `machine dev-09: forge repo ${SHOP}: approver mei-lin: needs a unique GitHub login other than the learner's`,
      `machine dev-09: forge repo ${SHOP}: approver mei-lin: after must be 0..2592000 seconds`,
      `machine dev-09: forge repo ${SHOP}: environment production: reviewers are at most 6 distinct logins of the learner, personas or approvers`,
      `machine dev-09: forge repo ${SHOP}: environment production: waitTimer is 0..43200 minutes`,
      `machine dev-09: forge repo ${SHOP}: environment production: branches is 'protected' or 1..10 distinct branch name patterns`]);
    const unknown = { ...envLab, forge: { ...envLab.forge!, repos: [{ ...envLab.forge!.repos![0], environmentRules: [{ name: 'qa' }] }] } };
    expect(machineProblems(unknown)).toEqual([`machine dev-09: forge repo ${SHOP}: environment qa: must be one of environments (once)`]);
  });
  it('replays deterministically', () => {
    const a = replay(envLab, approveExercise.solution), b = replay(envLab, approveExercise.solution);
    expect(a.steps.map(x => x.output)).toEqual(b.steps.map(x => x.output));
  });
});
