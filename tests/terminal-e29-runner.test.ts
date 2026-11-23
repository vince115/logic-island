import { describe, expect, it } from 'vitest';
import { ACTIONS_PROFILE, ARTIFACTS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, type TerminalCheck } from '@/lib/terminal/lesson';
import { lastAttempt } from '@/lib/terminal/actions-model';
import { parseYaml } from '@/lib/terminal/yaml';
import { parseWorkflow } from '@/lib/terminal/workflow';
import { fakeSecret } from '@/lib/terminal/artifacts-lesson';
import { artifactsLab, CI_TOKEN, DEPLOY_KEY, SHOP } from './support/artifacts-fixture';
import { actionsLab, ACTIONS_COMMITS } from './support/actions-fixture';
import { lab, labWith, runsOf, session, siteOf, stepLog, wf } from './support/artifacts-session';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md): secrets and variables (contexts, environments, masking, gh
 * secret and gh variable, the checks), the GITHUB_TOKEN's effects (git push needs contents: write and starts no run; gh
 * on a runner needs GH_TOKEN and the scope), gh run cancel dropping what had not happened, YAML block scalars in workflow
 * files, and the E28 fix: gh run rerun --failed reruns only the failed matrix legs.
 */
const check = (c: TerminalCheck, commands: string[]) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: 'dev-06', statement: '', checks: [c], solution: [], mistakes: [], hints: [], explanation: '' }, [artifactsLab], commands).results[0];
const SECRETS = ['cd shop', 'gh workflow run secret.yml', 'sleep 60'];

describe('secrets and variables in a run', () => {
  it('masks every secret (a multi-line one line by line), leaves an unset one empty and takes the environment\'s variable', () => {
    const s = lab(...SECRETS), id = runsOf(s.state)[0].id;
    expect(stepLog(s.state, id, 'Run echo "token=$TOKEN"')).toEqual(['##[group]Run echo "token=$TOKEN"', 'echo "token=$TOKEN"', 'shell: /usr/bin/bash -e {0}', 'env:', '  TOKEN: ***', '##[endgroup]', 'token=***']);
    expect(stepLog(s.state, id, 'Run echo "${{ secrets.DEPLOY_KEY }}"').slice(-3)).toEqual(['***', '***', '***']);
    expect(stepLog(s.state, id, 'Run echo "missing=[${{ secrets.NOPE }}] env=${{ vars.APP_ENV }}"').at(-1)).toBe('missing=[] env=prod');
    const text = JSON.stringify(lastAttempt(runsOf(s.state)[0]));
    for (const secret of [CI_TOKEN, ...DEPLOY_KEY.split('\n')]) expect(text).not.toContain(secret);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'secret.yml', logExcludes: CI_TOKEN }, SECRETS).ok).toBe(true);
  });
  it('masks ::add-mask:: values, uses repository values without an environment, and skips a job output holding a secret', () => {
    const W = wf('name: M', 'on: workflow_dispatch', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    outputs:', '      t: ${{ steps.s.outputs.t }}', '    steps:',
      '      - run: echo "::add-mask::hunter-value" && echo "v=hunter-value vars=${{ vars.APP_ENV }} key=[${{ secrets.DEPLOY_KEY }}]"', '      - id: s', '        run: echo "t=${{ secrets.DOCKER_TOKEN }}" >> "$GITHUB_OUTPUT"');
    const s = session(labWith({ '.github/workflows/m.yml': W }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run m.yml', 'sleep 60');
    const job = lastAttempt(runsOf(s.state)[0]).jobs[0];
    expect(job.steps[1].lines.at(-1)!.text).toBe('v=*** vars=dev key=[]');
    expect(job.outputs).toEqual({});
    expect(job.steps.at(-1)!.lines.map(l => l.text)).toEqual(["##[warning]Skip output 't' since it may contain secret.", 'Cleaning up orphan processes']);
  });
});

describe('gh secret and gh variable', () => {
  it('set (--body, standard input, -e), list (names and dates, never values), get and delete', () => {
    const s = lab('cd shop', 'gh secret set api_key --body lesson-api-0001', 'gh secret set STAGING_KEY -e production < ~/deploy_key', 'printf "a\\nb\\n" | gh secret set MULTI',
      'gh secret list', 'gh secret list -e production', 'gh secret delete MULTI', 'gh secret delete MULTI', 'gh variable set REGION --body ap-east-1', 'gh variable set REGION --body us-east-1',
      'gh variable list', 'gh variable get APP_ENV -e production', 'gh variable delete REGION', 'gh variable get REGION');
    expect(s.log[1].out).toEqual(['✓ Set Actions secret API_KEY for island/shop']);
    expect(s.log[4].out).toEqual(['NAME          UPDATED', 'API_KEY       less than a minute ago', 'DOCKER_TOKEN  about 1 day ago', 'MULTI         less than a minute ago']);
    expect(s.log[5].out.map(l => l.split(/ +/)[0])).toEqual(['NAME', 'DEPLOY_KEY', 'STAGING_KEY']);
    expect(siteOf(s.state).secrets!.find(x => x.name === 'STAGING_KEY')!.value).toBe(DEPLOY_KEY);
    expect(s.log[6].out).toEqual(['✓ Deleted Actions secret MULTI from island/shop']);
    expect(s.log[7].err).toEqual(['failed to delete secret MULTI: HTTP 404: Not Found (https://github.example/api/v3/repos/island/shop/actions/secrets/MULTI)']);
    expect([s.log[8].out, s.log[9].out]).toEqual([['✓ Created variable REGION for island/shop'], ['✓ Updated variable REGION for island/shop']]);
    expect(s.log[10].out[0]).toMatch(/^NAME +VALUE +UPDATED$/);
    expect(s.log[11].out).toEqual(['prod']);
    expect(s.log[13].err).toEqual(['variable REGION was not found']);
    for (const t of [CI_TOKEN, DEPLOY_KEY]) expect(s.log.flatMap(l => [...l.out, ...l.err]).join('\n')).not.toContain(t);
  });
  it('refuses bad names, unknown environments and a learner without admin rights', () => {
    const s = lab('cd shop', 'gh secret set GITHUB_X --body lesson-x-0001', 'gh secret set 1X --body lesson-x-0001', 'gh secret set X -e nowhere --body lesson-x-0001', 'gh secret set X');
    expect(s.log[1].err).toEqual(['Secret names must not start with GITHUB_.']);
    expect(s.log[2].err[0]).toMatch(/^Secret names can only contain alphanumeric characters/);
    expect(s.log[3].err).toEqual(['failed to fetch public key: HTTP 404: Not Found (https://github.example/api/v3/repos/island/shop/environments/nowhere/secrets)']);
    expect(s.log[4].err[0]).toMatch(/^gh secret set：要用 --body 給值/);
    const writer = { ...artifactsLab, forge: { ...artifactsLab.forge!, repos: [{ ...artifactsLab.forge!.repos![0], permission: 'write' as const }] } };
    expect(session(writer, ARTIFACTS_PROFILE, 'cd shop', 'gh secret list').last.err).toEqual(['failed to fetch public key: HTTP 403: Must have admin rights to Repository. (https://github.example/api/v3/repos/island/shop/actions/secrets)']);
  });
  it('checks secrets by name only and variables by value', () => {
    expect(check({ kind: 'secret', repo: SHOP, name: 'DEPLOY_KEY', env: 'production' }, []).ok).toBe(true);
    expect(check({ kind: 'secret', repo: SHOP, name: 'DEPLOY_KEY' }, []).message).toBe(`${SHOP} 應該有 Actions secret DEPLOY_KEY，但沒有這個 secret`);
    expect(check({ kind: 'secret', repo: SHOP, name: 'DOCKER_TOKEN', absent: true }, ['cd shop', 'gh secret delete DOCKER_TOKEN']).ok).toBe(true);
    expect(check({ kind: 'variable', repo: SHOP, name: 'APP_ENV', value: 'stage' }, ['cd shop', 'gh variable set APP_ENV --body qa']).message).toBe(`${SHOP} 應該有 Actions variable APP_ENV（值是「stage」），但它的值是「qa」`);
    expect(check({ kind: 'variable', repo: '/home/learner/shop', name: 'APP_ENV', env: 'production', value: 'prod' }, []).ok).toBe(true);
  });
  it('accepts only obviously fake secret values in lesson data', () => {
    expect([fakeSecret(CI_TOKEN), fakeSecret(DEPLOY_KEY), fakeSecret('ghp_lessonAAAAAAAAAAAAAAAAAAAA'), fakeSecret('hunter2-password'), fakeSecret('fake\n-----BEGIN RSA PRIVATE KEY-----')]).toEqual([true, true, false, false, false]);
    const bad = { ...artifactsLab, forge: { ...artifactsLab.forge!, repos: [{ ...artifactsLab.forge!.repos![0], secrets: [{ name: 'GITHUB_T', value: 'sk-lesson-0001' }, { name: 'X', value: 'demo-0001', env: 'staging' }] }] } };
    expect(machineProblems(bad)).toEqual([
      `machine dev-06: forge repo ${SHOP}: secret GITHUB_T: names must not start with GITHUB_`,
      `machine dev-06: forge repo ${SHOP}: secret GITHUB_T: the value must be an obviously fake lesson value (E23's fake token rule: containing lesson, fake, example or demo, and not shaped like a real provider's token)`,
      `machine dev-06: forge repo ${SHOP}: secret X: env must be one of environments`]);
  });
});

const BUMP = (contents: string, pr = 'read') => wf('name: Bump', 'on: workflow_dispatch', 'permissions:', `  contents: ${contents}`, `  pull-requests: ${pr}`, 'jobs:', '  bump:', '    runs-on: ubuntu-latest', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: |', '          git config user.name bot', '          git config user.email bot@example.com', '          sleep 30', '          echo 2 > VERSION',
  '          git add VERSION', '          git commit -q -m "Bump version"', '          git push -q', '      - run: gh pr list', '        env:', '          GH_TOKEN: ${{ github.token }}', '        continue-on-error: true', '      - run: gh pr list');
describe('the GITHUB_TOKEN', () => {
  it('refuses git push with contents: read', () => {
    const s = session(labWith({ '.github/workflows/bump.yml': BUMP('read') }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run bump.yml', 'sleep 60', 'git fetch -q', 'git log --oneline -1 origin/main');
    const log = stepLog(s.state, runsOf(s.state)[0].id, 'Run git config user.name bot');
    expect(log.slice(-3)).toEqual(['remote: Permission to island/shop.git denied to github-actions[bot].', "fatal: unable to access 'https://github.example/island/shop/': The requested URL returned error: 403", '##[error]Process completed with exit code 128.']);
    expect(s.last.out[0]).toMatch(/More workflows$/);
  });
  it('pushes with contents: write when the step ends, starting no new run; gh needs GH_TOKEN and the scope', () => {
    const s = session(labWith({ '.github/workflows/bump.yml': BUMP('write') }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run bump.yml', 'sleep 10', 'git fetch -q', 'git log --oneline -1 origin/main',
      'sleep 60', 'git fetch -q', 'git log --oneline -1 origin/main', 'gh run list');
    expect(s.log[4].out[0]).toMatch(/More workflows$/);
    expect(s.log[7].out[0]).toMatch(/^[0-9a-f]{7} \(origin\/main, origin\/HEAD\) Bump version$/);
    expect(s.last.out).toHaveLength(2);
    const steps = lastAttempt(runsOf(s.state)[0]).jobs[0].steps, text = (n: number) => steps[n].lines.map(l => l.text);
    expect(text(2).slice(-2)).toEqual(['To https://github.example/island/shop', expect.stringMatching(/^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main$/)]);
    expect(text(3).slice(-3)).toEqual(['  GH_TOKEN: ***', '##[endgroup]', 'no open pull requests in island/shop']);
    expect(text(4).slice(-4)).toEqual(['gh: To use GitHub CLI in a GitHub Actions workflow, set the GH_TOKEN environment variable. Example:', '  env:', '    GH_TOKEN: ${{ github.token }}', '##[error]Process completed with exit code 4.']);
    const none = session(labWith({ '.github/workflows/bump.yml': BUMP('write', 'none') }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run bump.yml', 'sleep 60');
    expect(lastAttempt(runsOf(none.state)[0]).jobs[0].steps[3].lines.map(l => l.text)).toContain('HTTP 403: Resource not accessible by integration (https://github.example/api/v3/repos/island/shop/pulls)');
  });
  it('gh run cancel drops what had not happened yet (the push, the cache save)', () => {
    const s = session(labWith({ '.github/workflows/bump.yml': BUMP('write') }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run bump.yml', 'sleep 10', `gh run cancel ${4100000001}`, 'sleep 60', 'git fetch -q', 'git log --oneline -1 origin/main');
    expect(s.last.out[0]).toMatch(/More workflows$/);
    expect(s.state.ci!.art!.pending).toEqual([]);
  });
});

describe('YAML block scalars in workflow files', () => {
  it('keeps |+ trailing lines for workflows only; compose keeps E23\'s single newline', () => {
    const text = ['a: |+', '  x', '', '', 'b: >-', '  one', '  two', 'c: |', '  p', '  q', ''].join('\n');
    const get = (y: ReturnType<typeof parseYaml>, k: string) => (y.t === 'map' ? y.m.find(e => e[0] === k)![1] : undefined) as { v: string };
    expect([get(parseYaml(text, { keep: true }), 'a').v, get(parseYaml(text), 'a').v]).toEqual(['x\n\n\n', 'x\n']);
    expect([get(parseYaml(text), 'b').v, get(parseYaml(text), 'c').v]).toEqual(['one two', 'p\nq\n']);
  });
  it('runs a multi-line run: as a script with bash -e (the first failing line ends the step)', () => {
    const W = wf('name: Multi', 'on: workflow_dispatch', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: |', '          echo one', '          false', '          echo never');
    expect(parseWorkflow('.github/workflows/m.yml', W).ok).toBe(true);
    const s = session(labWith({ '.github/workflows/m.yml': W }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run m.yml', 'sleep 60');
    expect(stepLog(s.state, runsOf(s.state)[0].id, 'Run echo one')).toEqual(['##[group]Run echo one', 'echo one', 'false', 'echo never', 'shell: /usr/bin/bash -e {0}', '##[endgroup]', 'one', '##[error]Process completed with exit code 1.']);
  });
});

describe('fix: gh run rerun --failed reruns only the failed matrix legs', () => {
  const legs = (failFast: boolean) => {
    const W = wf('name: Legs', 'on: workflow_dispatch', 'jobs:', '  t:', '    runs-on: ubuntu-latest', '    strategy:', `      fail-fast: ${failFast}`, '      matrix:', '        n: [1, 2, 3]',
      '    steps:', '      - run: sleep ${{ matrix.n }}0 && test ${{ matrix.n }} != 2 || test ${{ github.run_attempt }} = 2');
    const m = { ...actionsLab, git: { ...actionsLab.git!, commits: [...ACTIONS_COMMITS, { id: 'c3', message: 'Legs', files: { '.github/workflows/legs.yml': W }, author: { name: 'Mei Lin', email: 'mei@example.com' }, time: '2026-11-22 01:00:00' }], remotes: [{ url: SHOP, branches: { main: 'c3' } }] } };
    const s = session(m, ACTIONS_PROFILE, 'cd shop', 'gh workflow run legs.yml', 'sleep 60', 'gh run rerun 4100000001 --failed', 'sleep 60');
    return lastAttempt(runsOf(s.state)[0]).jobs.map(j => [j.name, j.conclusion, !!j.reused]);
  };
  it('without fail-fast: only the failed leg', () => {
    expect(legs(false)).toEqual([['t (1)', 'success', true], ['t (2)', 'success', false], ['t (3)', 'success', true]]);
  });
  it('with fail-fast: the failed leg and the cancelled ones; the finished leg is kept', () => {
    expect(legs(true)).toEqual([['t (1)', 'success', true], ['t (2)', 'success', false], ['t (3)', 'success', false]]);
  });
});
