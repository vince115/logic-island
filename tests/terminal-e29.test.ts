import { describe, expect, it } from 'vitest';
import { ACTIONS_PROFILE, ARTIFACTS_PROFILE } from '@/lib/terminal/shell';
import { GH_SUPPORTED_ACTIONS, GH_SUPPORTED_ARTIFACTS } from '@/lib/terminal/gh';
import { checkTerminalExercise, machineProblems, profileOf, replay, terminalContentProblems, type TerminalCheck } from '@/lib/terminal/lesson';
import { lastAttempt } from '@/lib/terminal/actions-model';
import { artifactsContent, artifactsLab, CI_TOKEN, downloadExercise, secretExercise, SHOP } from './support/artifacts-fixture';
import { lab, labWith, logOf, runsOf, session, siteOf, stepLog, wf } from './support/artifacts-session';

/*
 * Engine stage E29 (docs/curriculum/CICD0_E29_ARTIFACTS.md): the artifacts profile — actions/cache (keys, restore keys,
 * branch scopes, keys never overwritten, faster CI tools), artifacts (upload, download, the v4 conflict, retention,
 * gh run download), Docker on runners (build, login from a secret through --password-stdin, push to a lesson registry,
 * the registry check with a commit tag), the checks and the lesson data. Secrets, the GITHUB_TOKEN and the other parts
 * are in terminal-e29-runner.test.ts. Below the profile everything behaves as in E28.
 */
const PUSH = ['cd shop', "git commit -q --allow-empty -m 'Go'", 'git push -q'];
const elapsed = (r: { attempts: readonly { jobs: readonly { startedAt?: number; completedAt?: number }[] }[] }) => { const j = r.attempts.at(-1)!.jobs[0]; return j.completedAt! - j.startedAt!; };
const check = (s: Parameters<typeof checkTerminalExercise>[0]['checks'][number], commands: string[]) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: 'dev-06', statement: '', checks: [s], solution: [], mistakes: [], hints: [], explanation: '' }, [artifactsLab], commands).results[0];

describe('the artifacts profile', () => {
  it('is the actions profile with the artifacts feature and no new commands', () => {
    expect(ARTIFACTS_PROFILE.commands).toEqual(ACTIONS_PROFILE.commands);
    expect(ARTIFACTS_PROFILE.features).toEqual([...ACTIONS_PROFILE.features!, 'artifacts']);
    expect(profileOf(artifactsLab)).toBe(ARTIFACTS_PROFILE);
    expect(machineProblems(artifactsLab)).toEqual([]);
    expect(terminalContentProblems(artifactsContent)).toEqual([]);
    expect(lab('gh').last.out.at(-1)).toBe(`模擬環境支援的指令：${GH_SUPPORTED_ARTIFACTS}`);
  });
  it('below it the data, the checks, gh secret and the new actions are not there', () => {
    const low = { ...artifactsLab, profile: 'actions' as const };
    expect(machineProblems(low)).toEqual(expect.arrayContaining([
      `machine dev-06: forge repo ${SHOP}: secrets, variables and environments need the artifacts profile (engine stage E29)`,
      'machine dev-06: actions: tool npm ci: cache and cachedSeconds need the artifacts profile (engine stage E29)']));
    const plain = { ...low, forge: { login: 'mei-lin', repos: [{ url: SHOP, permission: 'admin' as const }] }, actions: { tools: [] } };
    const p = terminalContentProblems({ ...artifactsContent, machines: [plain] });
    expect(p).toContain('exercise secret: a secret check needs an artifacts machine (engine stage E29) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(p).toContain('exercise download: a run check\'s cacheHit and artifact need an artifacts machine (engine stage E29)');
    const s = session(plain, ACTIONS_PROFILE, 'cd shop', 'gh secret list', 'gh cache list', 'gh run download 1', "git commit -q --allow-empty -m 'Go'", 'git push -q', 'sleep 60');
    expect(s.log[1].err).toEqual([`gh secret：模擬環境不支援這個指令（支援的指令：${GH_SUPPORTED_ACTIONS}）`]);
    expect(s.log[2].err).toEqual([`gh cache：模擬環境不支援這個指令（支援的指令：${GH_SUPPORTED_ACTIONS}）`]);
    expect(s.log[3].err).toEqual(['gh run download：模擬環境不支援（artifact 在引擎階段 E29）']);
    expect(stepLogOf(s.state, 'Run actions/cache@v4')).toEqual(['##[error]模擬環境不支援 actions/cache@v4（E28 支援 actions/checkout、actions/setup-node、actions/setup-python；cache 與 artifact 在 E29）']);
    expect(s.state.ci!.art).toBeUndefined();
  });
});
const stepLogOf = (state: Parameters<typeof runsOf>[0], step: string) => {
  const r = runsOf(state).find(x => x.workflowName === 'Cache')!;
  return lastAttempt(r).jobs[0].steps.find(x => x.name === step)!.lines.map(l => l.text).filter(t => !t.startsWith('##[group]') && t !== '##[endgroup]' && !/^ {2}|^with:/.test(t));
};

describe('actions/cache', () => {
  it('misses, saves after the job, then hits on the next run and npm ci is faster', () => {
    const s = lab(...PUSH, 'sleep 60', "git commit -q --allow-empty -m 'Again'", 'git push -q', 'sleep 60', 'gh cache list');
    const [first, second] = runsOf(s.state);
    expect(elapsed(first)).toBe(24);
    expect(elapsed(second)).toBe(5);
    expect(stepLog(s.state, first.id, 'Run actions/cache@v4').at(-1)).toMatch(/^Cache not found for input keys: npm-[0-9a-f]{64}, npm-$/);
    expect(stepLog(s.state, first.id, 'Post Run actions/cache@v4').slice(-2)).toEqual(['Cache saved successfully', expect.stringMatching(/^Cache saved with key: npm-/)]);
    expect(stepLog(s.state, second.id, 'Run actions/cache@v4').slice(-2)).toEqual(['Cache restored successfully', expect.stringMatching(/^Cache restored from key: npm-/)]);
    expect(stepLog(s.state, second.id, 'Post Run actions/cache@v4').at(-1)).toMatch(/^Cache hit occurred on the primary key npm-[0-9a-f]+, not saving cache\.$/);
    expect(s.last.out[0]).toBe('Showing 1 of 1 cache in island/shop');
    expect(s.last.out[2]).toMatch(/^ID +KEY +SIZE +CREATED +ACCESSED$/);
    expect(lastAttempt(second).jobs[0].steps.find(x => x.name === 'Run actions/cache@v4')!.cacheHit).toBe(true);
    // The check run: cacheHit.
    const hit: TerminalCheck = { kind: 'run', repo: SHOP, workflow: 'cache.yml', conclusion: 'success', cacheHit: true };
    expect(check(hit, [...PUSH, 'sleep 60']).message).toBe(`${SHOP} 最新的 cache.yml run 應該：結論是 success、cache 命中了 key（cache-hit 是 true），但最新的 run #1（4100000001）的 cache 沒有命中 key（cache-hit 不是 true）`);
    expect(check(hit, [...PUSH, 'sleep 60', "git commit -q --allow-empty -m 'Again'", 'git push -q', 'sleep 60']).ok).toBe(true);
  });
  it('falls back to a restore key (cache-hit false) and saves the new key', () => {
    const s = lab(...PUSH, 'sleep 60', 'echo "{ \\"lockfileVersion\\": 3, \\"x\\": 1 }" > package-lock.json', "git commit -qam 'Bump lock'", 'git push -q', 'sleep 60');
    const second = runsOf(s.state)[1], restore = stepLog(s.state, second.id, 'Run actions/cache@v4');
    expect(restore.at(-1)).toBe(`Cache restored from key: ${siteOf(s.state).caches![0].key}`);
    expect(lastAttempt(second).jobs[0].steps.find(x => x.name === 'Run actions/cache@v4')!.cacheHit).toBe(false);
    expect(stepLog(s.state, second.id, 'Post Run actions/cache@v4').at(-1)).toMatch(/^Cache saved with key: npm-/);
    expect(siteOf(s.state).caches!.map(c => c.ref)).toEqual(['refs/heads/main', 'refs/heads/main']);
    expect(elapsed(second)).toBe(6);
  });
  it('is scoped to the branch, with the default branch as fallback', () => {
    const CACHE_ANY = wf('name: Cache', 'on: push', 'jobs:', '  install:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4',
      '      - uses: actions/cache@v4', '        with:', '          path: ~/.npm', '          key: npm-${{ github.ref_name }}', '          restore-keys: npm-', '      - run: npm ci');
    const m = labWith({ '.github/workflows/cache.yml': CACHE_ANY });
    // A feature branch saves its own cache; main does not see it, but a feature branch sees main's.
    const s = session(m, ARTIFACTS_PROFILE, 'cd shop', 'git switch -q -c feat', "git commit -q --allow-empty -m 'F'", 'git push -q -u origin feat', 'sleep 60', 'git switch -q main',
      "git commit -q --allow-empty -m 'M'", 'git push -q', 'sleep 60', 'git switch -q -c feat2', "git commit -q --allow-empty -m 'F2'", 'git push -q -u origin feat2', 'sleep 60');
    const [feat, main, feat2] = runsOf(s.state);
    expect(siteOf(s.state).caches!.map(c => [c.key, c.ref])).toEqual([['npm-feat', 'refs/heads/feat'], ['npm-main', 'refs/heads/main'], ['npm-feat2', 'refs/heads/feat2']]);
    expect(stepLog(s.state, feat.id, 'Run actions/cache@v4').at(-1)).toBe('Cache not found for input keys: npm-feat, npm-');
    expect(stepLog(s.state, main.id, 'Run actions/cache@v4').at(-1)).toBe('Cache not found for input keys: npm-main, npm-');
    expect(stepLog(s.state, feat2.id, 'Run actions/cache@v4').at(-1)).toBe('Cache restored from key: npm-main');
  });
  it('never overwrites a key: a second job saving it is told the key is reserved', () => {
    const TWO = wf('name: Two', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/cache@v4', '        with:', '          path: out', '          key: same',
      '      - run: mkdir -p out && echo a > out/x', '  b:', '    needs: a', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/cache@v4', '        with:', '          path: out', '          key: other',
      '          restore-keys: same', '      - run: mkdir -p out && echo b > out/x', '  c:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/cache@v4', '        with:', '          path: out', '          key: same',
      '      - run: mkdir -p out && echo c > out/x');
    const s = session(labWith({ '.github/workflows/cache.yml': null, '.github/workflows/two.yml': TWO }), ARTIFACTS_PROFILE, ...PUSH, 'sleep 60');
    const r = runsOf(s.state)[0], post = (job: string) => lastAttempt(r).jobs.find(j => j.key === job)!.steps.find(x => x.name === 'Post Run actions/cache@v4')!.lines.at(-1)!.text;
    expect(post('a')).toBe('Cache saved with key: same');
    expect(post('c')).toBe('##[warning]Failed to save: Unable to reserve cache with key same, another job may be creating this cache.');
    expect(post('b')).toBe('Cache saved with key: other');
    expect(siteOf(s.state).caches!.map(c => c.key)).toEqual(['same', 'other']);
    expect(siteOf(s.state).caches![0].files.find(f => f.path.endsWith('/out/x'))!.content).toBe('a\n');
  });
});

describe('artifacts', () => {
  const ART = ['cd shop', 'gh workflow run art.yml', 'sleep 60'];
  it('uploads in one job and downloads in a later one; gh run view lists them; gh run download writes them', () => {
    const s = lab(...ART, 'gh run view 4100000001', 'gh run download 4100000001 -n dist -D ~/rel', 'cat ~/rel/index.html', 'gh run download 4100000001', 'ls dist', 'gh run download 4100000001 -n dist -D ~/rel');
    expect(s.log[3].out.slice(-6)).toEqual(['', 'ARTIFACTS', 'dist', '', 'For more information about a job, try: gh run view --job=<job-id>', 'View this run on GitHub: https://github.example/island/shop/actions/runs/4100000001']);
    expect(s.log[5].out).toEqual(['<h1>shop</h1>']);
    expect(s.log[7].out).toEqual(['VERSION  index.html']);
    expect(s.log[8].err).toEqual(['error downloading dist: error extracting zip archive: open /home/learner/rel/VERSION: file exists']);
    expect(stepLog(s.state, 4100000001, 'Run actions/upload-artifact@v4')).toEqual(expect.arrayContaining(['With the provided path, there will be 2 files uploaded',
      'Artifact dist has been successfully uploaded! Final size is 17 bytes. Artifact ID is 5100000001', 'Artifact download URL: https://github.example/island/shop/actions/runs/4100000001/artifacts/5100000001']));
    expect(stepLog(s.state, 4100000001, 'Run cat index.html VERSION').slice(-2)).toEqual(['<h1>shop</h1>', 'v1']);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'Art', artifact: 'dist' }, ART).ok).toBe(true);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'Art', artifact: 'coverage' }, ART).message).toMatch(/但最新的 run #1（4100000001）沒有 artifact coverage$/);
  });
  it('expires after retention-days', () => {
    const s = lab(...ART, 'sleep 518400', 'gh run view 4100000001', 'gh run download 4100000001 -n dist');
    expect(s.log[4].out).toContain('dist (expired)');
    expect(s.last.err).toEqual(['no valid artifacts found to download']);
    expect(lab(...ART, 'gh run download 4100000001 -n nope').last.err).toEqual(['no artifact matches any of the names or patterns provided']);
  });
  it('refuses the same name twice in a run (v4: 409 Conflict) unless overwrite, and a missing download', () => {
    const DUP = wf('name: Dup', 'on: workflow_dispatch', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo 1 > r.txt', '      - uses: actions/upload-artifact@v4',
      '        with:', '          name: report', '          path: r.txt', '      - uses: actions/upload-artifact@v4', '        with:', '          name: report', '          path: r.txt',
      '      - uses: actions/download-artifact@v4', '        with:', '          name: nothing');
    const s = session(labWith({ '.github/workflows/dup.yml': DUP }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run dup.yml', 'sleep 60');
    const steps = lastAttempt(runsOf(s.state)[0]).jobs[0].steps;
    expect(steps[3].lines.at(-1)!.text).toBe('##[error]Failed to CreateArtifact: Received non-retryable error: Failed request: (409) Conflict: an artifact with this name already exists on the workflow run');
    expect(steps[3].conclusion).toBe('failure');
    const OVER = DUP.replace(/( {10}path: r.txt\n)( {6}- uses: actions\/download)/, '$1          overwrite: true\n$2').replace(/ {6}- uses: actions\/download-artifact@v4\n.*\n.*name: nothing\n/, '');
    const o = session(labWith({ '.github/workflows/dup.yml': OVER }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run dup.yml', 'sleep 60');
    expect(lastAttempt(runsOf(o.state)[0]).jobs[0].conclusion).toBe('success');
    expect(siteOf(o.state).artifacts!.map(a => a.id)).toEqual([5100000002]);
    const MISS = wf('name: Miss', 'on: workflow_dispatch', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/download-artifact@v4', '        with:', '          name: nothing');
    const m = session(labWith({ '.github/workflows/miss.yml': MISS }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run miss.yml', 'sleep 60');
    expect(lastAttempt(runsOf(m.state)[0]).jobs[0].steps[1].lines.at(-1)!.text).toBe('##[error]Unable to download artifact(s): Artifact not found for name: nothing');
  });
});

describe('Docker on runners', () => {
  it('builds, logs in with a secret through --password-stdin and pushes sha-<commit> to the lesson registry', () => {
    const s = lab('cd shop', 'gh workflow run image.yml', 'sleep 60', 'git rev-parse HEAD');
    const r = runsOf(s.state)[0], sha = s.last.out[0];
    expect(lastAttempt(r).jobs[0].conclusion).toBe('success');
    const log = logOf(s.state, r.id).join('\n');
    expect(log).toContain('Login Succeeded');
    expect(log).toContain(`sha-${sha}: digest: sha256:`);
    expect(log).toContain('echo "***" | docker login ghcr.example -u ci --password-stdin');
    expect(log).not.toContain(CI_TOKEN);
    const tagged: TerminalCheck = { kind: 'registry', registry: 'ghcr.example', repository: 'island/shop', tag: 'sha-', commit: { repo: SHOP } };
    const ok = check(tagged, ['cd shop', 'gh workflow run image.yml', 'sleep 60']);
    expect(ok.ok).toBe(true);
    expect(ok.message).toBe('Registry 上應該有 ghcr.example/island/shop:sha-<預設分支目前的 commit>');
    expect(check(tagged, ['cd shop', 'gh workflow run image.yml']).message).toMatch(/^Registry 上應該有 .*，但ghcr\.example\/island\/shop 沒有標籤 sha-[0-9a-f]{40}$/);
    expect(check({ kind: 'run', repo: SHOP, workflow: 'image.yml', logExcludes: CI_TOKEN }, ['cd shop', 'gh workflow run image.yml', 'sleep 60']).ok).toBe(true);
  });
  it('starts each job with an empty build cache and no local images', () => {
    const TWICE = wf('name: Twice', 'on: workflow_dispatch', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - uses: actions/checkout@v4', '      - run: docker images -q | wc -l', '      - run: docker build -t x .');
    const s = session(labWith({ '.github/workflows/twice.yml': TWICE }), ARTIFACTS_PROFILE, 'cd shop', 'gh workflow run twice.yml', 'sleep 60', 'gh workflow run twice.yml', 'sleep 60');
    const [a, b] = runsOf(s.state);
    expect(stepLog(s.state, a.id, 'Run docker images -q | wc -l').at(-1)).toBe('0');
    const build = (id: number) => stepLog(s.state, id, 'Run docker build -t x .').join('\n').replace(/sha256:[0-9a-f]{64}/g, 'ID');
    expect(build(a.id)).toBe(build(b.id));
    expect(stepLog(s.state, b.id, 'Run docker build -t x .').join('\n')).not.toContain('CACHED');
  });
});

describe('lessons', () => {
  it('passes the reference solutions and fails the mistakes', () => {
    for (const x of [downloadExercise, secretExercise]) {
      expect(checkTerminalExercise(x, [artifactsLab], x.solution).ok).toBe(true);
      for (const m of x.mistakes) expect(checkTerminalExercise(x, [artifactsLab], m.commands).ok).toBe(false);
    }
  });
  it('replays deterministically and leaves the given machine alone', () => {
    const cmds = ['cd shop', 'gh workflow run art.yml', 'gh workflow run image.yml', ...PUSH.slice(1), 'sleep 120', 'gh run list'];
    const before = JSON.stringify(artifactsLab);
    expect(replay(artifactsLab, cmds).steps.map(s => s.output)).toEqual(replay(artifactsLab, cmds).steps.map(s => s.output));
    expect(JSON.stringify(artifactsLab)).toBe(before);
  });
});
