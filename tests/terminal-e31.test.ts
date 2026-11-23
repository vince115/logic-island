import { describe, expect, it } from 'vitest';
import { DEPLOY_HOSTS_PROFILE, ENVIRONMENTS_PROFILE } from '@/lib/terminal/shell';
import { checkTerminalExercise, machineProblems, machineState, profileOf, replay, terminalContentProblems, type TerminalCheck, type TerminalMachine } from '@/lib/terminal/lesson';
import { lastAttempt } from '@/lib/terminal/actions-model';
import { session } from './support/environments-fixture';
import { CI_KEY, deployLab, prodHost, SHOP, stagingHost } from './support/deploy-hosts-fixture';

/*
 * Engine stage E31 (docs/curriculum/CICD0_E31_DEPLOY_HOSTS.md): the deploy-hosts profile — Docker hosts reached with ssh
 * from the learner's machine and from runners (a key from a secret, known_hosts from a secret), staging then production
 * (kai approves after 600 s), a failing smoke test, rollback to an earlier digest through workflow_dispatch, the checks
 * container and image with host (and a container's image by digest), the lesson data and the boundary.
 */
const lab = (...commands: string[]) => session(deployLab, DEPLOY_HOSTS_PROFILE, ...commands);
const PUSH = ['cd shop', "git commit -q --allow-empty -m 'Release'", 'git push -q'];
const LOGIN = 'echo lesson-token-ci-0001 | docker login ghcr.example -u ci --password-stdin 2>/dev/null';
const digestOf = (tag: string) => machineState(deployLab).docker!.registries![0].tags['island/shop'][tag];
const V1 = `ghcr.example/island/shop@sha256:${digestOf('v1')}`;
const exercise = (checks: TerminalCheck[], solution: string[], machine: TerminalMachine = deployLab) =>
  checkTerminalExercise({ id: 'x', title: 'x', machine: 'dev-31', statement: '', checks, solution: [], mistakes: [], hints: [], explanation: '' }, [machine], solution);
const content = (checks: TerminalCheck[], machine: TerminalMachine = deployLab) => terminalContentProblems({ machines: [machine], examples: [], exercises: [
  { id: 'ship', title: 'x', machine: 'dev-31', statement: 'x', checks, solution: [...PUSH, 'sleep 700'], mistakes: [{ commands: ['cd shop'], why: 'x' }], hints: [], explanation: 'x' }] });
const logOf = (s: ReturnType<typeof lab>, job: string, step: string) =>
  lastAttempt(s.state.git!.forge.find(f => f.url === SHOP)!.site!.runs!.at(-1)!).jobs.find(j => j.key === job)!.steps.find(x => x.name === step)!.lines.map(l => l.text);

describe('the deploy-hosts profile', () => {
  it('is the environments profile with the deploy-hosts feature and no new commands', () => {
    expect(DEPLOY_HOSTS_PROFILE.commands).toEqual(ENVIRONMENTS_PROFILE.commands);
    expect(DEPLOY_HOSTS_PROFILE.features).toEqual([...ENVIRONMENTS_PROFILE.features!, 'deploy-hosts']);
    expect(profileOf(deployLab)).toBe(DEPLOY_HOSTS_PROFILE);
    expect(machineProblems(deployLab)).toEqual([]);
    expect(machineState(deployLab).ci!.deploy).toEqual({ hosts: ['staging-01', 'prod-01'] });
  });
  it('below it remote Docker, runners and SSH-key secrets are refused, and remotes have no daemon', () => {
    const low = { ...deployLab, profile: 'environments' as const };
    expect(machineProblems(low)).toEqual(expect.arrayContaining([
      'machine dev-31: remote staging-01: docker needs the deploy-hosts profile (engine stage E31)', 'machine dev-31: remote prod-01: runners needs the deploy-hosts profile (engine stage E31)',
      `machine dev-31: forge repo ${SHOP}: secret DEPLOY_KEY: sshKey needs the deploy-hosts profile (engine stage E31)`]));
    const plain = { ...low, remotes: [{ ...stagingHost, docker: undefined, runners: undefined }], forge: { login: 'mei-lin' } };
    expect(machineProblems(plain)).toEqual([]);
    expect(session(plain, ENVIRONMENTS_PROFILE, 'ssh deploy@staging-01 docker ps').last.err[0]).toBe("Command 'docker' not found, but can be installed with:");
    expect(content([{ kind: 'container', host: 'prod-01', name: 'web' }], plain)).toContain(
      'exercise ship: a container check with host (or a container\'s image by digest) needs a deploy-hosts machine (engine stage E31) and a remote machine of the lesson');
  });
  it('validates the data', () => {
    const bad = { ...deployLab, remotes: [{ ...stagingHost, docker: { registries: [{ host: 'x.example' }] }, reachableFrom: ['dev-31'] }, prodHost],
      forge: { ...deployLab.forge!, repos: [{ ...deployLab.forge!.repos![0], secrets: [{ name: 'K', value: 'lesson-fake-0001', sshKey: { seed: '' } }] }] } };
    expect(machineProblems(bad)).toEqual(expect.arrayContaining([
      "machine dev-31: remote staging-01: docker.registries are the lesson's (the local machine's docker.registries), not a host's", 'machine dev-31: remote staging-01: runners and reachableFrom cannot be combined',
      `machine dev-31: forge repo ${SHOP}: secret K: give either value or sshKey`, `machine dev-31: forge repo ${SHOP}: secret K: sshKey needs a seed (and a comment) of 1..64 characters on one line`]));
    expect(content([{ kind: 'image', host: 'db-01', name: 'x' }])).toContain(
      'exercise ship: a image check with host (or a container\'s image by digest) needs a deploy-hosts machine (engine stage E31) and a remote machine of the lesson');
    expect(content([{ kind: 'container', name: 'web', image: 'ghcr.example/island/shop@sha256:12' }])[0]).toMatch(/image by digest is NAME@sha256:<64 hex digits>/);
  });
});

describe('Docker hosts from the learner\'s machine', () => {
  it('ssh runs docker on a host, and its daemon pulls what the learner pushed to the lesson registry', () => {
    const s = lab('ssh deploy@staging-01 \'docker ps --format "{{.Image}} {{.Names}}"\'', 'curl -s http://staging-01:8000/', LOGIN, 'docker pull -q ghcr.example/island/shop:v2',
      'docker tag ghcr.example/island/shop:v2 ghcr.example/island/shop:v4', 'docker push -q ghcr.example/island/shop:v4',
      'echo lesson-token-deploy-0001 | ssh deploy@staging-01 docker login ghcr.example -u deploy --password-stdin 2>/dev/null',
      "ssh deploy@staging-01 'docker pull -q ghcr.example/island/shop:v4 && docker rm -f web && docker run -d --name web -p 8000:8000 ghcr.example/island/shop:v4'",
      'ssh deploy@staging-01', 'docker ps --format "{{.Image}}"', 'exit', 'curl -s http://staging-01:8000/');
    expect(s.log[0].out).toEqual(['ghcr.example/island/shop:v1 web']);
    expect(s.log[1].out).toEqual(['shop v1']);
    expect(s.log[6].out).toEqual(['Login Succeeded']);
    expect(s.log[7].out.slice(0, 2)).toEqual(['ghcr.example/island/shop:v4', 'web']);
    expect(s.log[9].out).toEqual(['ghcr.example/island/shop:v4']);
    expect(s.last.out).toEqual(['shop v2']);
    expect(s.state.docker!.registries).toEqual(s.state.net!.hosts[0].state.docker!.registries);
  });
});

describe('a deployment pipeline on runners', () => {
  it('deploys staging, then production after the approval, over ssh with the key from a secret, with a smoke test', () => {
    const early = lab(...PUSH, 'sleep 60', 'curl -s http://staging-01:8000/', 'curl -s http://prod-01:8000/');
    expect(early.log.slice(-2).map(l => l.out)).toEqual([['shop v2'], ['shop v1']]);
    const s = lab(...PUSH, 'gh run watch 4100000001 > /dev/null', 'curl -s http://prod-01:8000/', 'ssh deploy@prod-01 \'docker ps --format "{{.Image}} {{.Status}}"\'', 'date');
    expect(s.log.slice(-3).map(l => l.out)).toEqual([['shop v2'], ['ghcr.example/island/shop:v2 Up Less than a second'], ['Mon Nov 23 10:10:06 CST 2026']]);
    expect(logOf(s, 'production', 'Login').slice(-1)).toEqual(['Login Succeeded']);
    expect(logOf(s, 'production', 'Deploy').filter(l => !l.startsWith(' ') && !/^(##|ssh |shell:|env:)/.test(l))).toEqual(['v2: Pulling from island/shop', expect.stringMatching(/Pull complete$/),
      expect.stringMatching(/Pull complete$/), expect.stringMatching(/Pull complete$/), `Digest: sha256:${digestOf('v2')}`, 'Status: Downloaded newer image for ghcr.example/island/shop:v2', 'ghcr.example/island/shop:v2', 'web', expect.stringMatching(/^[0-9a-f]{64}$/)]);
    expect(logOf(s, 'production', 'Smoke test').at(-1)).toBe('ok');
    const all = lastAttempt(s.state.git!.forge[0].site!.runs![0]).jobs.flatMap(j => j.steps.flatMap(x => x.lines.map(l => l.text))).join('\n');
    expect(all).not.toContain('PRIVATE KEY');
    expect(all).not.toContain('lesson-token-deploy-0001');
    expect(s.state.net!.hosts[1].state.journal!.map(e => e.message).filter(m => m.startsWith('Accepted publickey for deploy from 10.1.0.4'))).toEqual(
      [`Accepted publickey for deploy from 10.1.0.4 port 50001 ssh2: ED25519 ${CI_KEY.fingerprint}`, `Accepted publickey for deploy from 10.1.0.4 port 50002 ssh2: ED25519 ${CI_KEY.fingerprint}`]);
  });
  it('a failing smoke test fails the job, and production is not deployed', () => {
    const s = lab('cd shop', 'gh variable set IMAGE --body ghcr.example/island/shop:v3', "git commit -q --allow-empty -m 'Broken'", 'git push -q', 'gh run watch 4100000001', 'curl -s http://prod-01:8000/');
    expect(s.log[4].out).toEqual(expect.arrayContaining(['X staging in 1s (ID 11300000001)', '  X Smoke test', '- production in 0s (ID 11300000002)', 'X Process completed with exit code 22.']));
    expect(logOf(s, 'staging', 'Smoke test').slice(-2)).toEqual(['curl: (22) The requested URL returned error: 500', '##[error]Process completed with exit code 22.']);
    expect(s.last.out).toEqual(['shop v1']);
  });
  it('rolls back to an earlier digest with workflow_dispatch; docker inspect on the host shows it', () => {
    const s = lab('cd shop', `gh workflow run deploy.yml -f image=${V1}`, 'gh run watch 4100000001 > /dev/null', 'ssh deploy@prod-01 \'docker ps --format "{{.Image}}"\'',
      'ssh deploy@prod-01 "docker inspect -f \'{{.Config.Image}}\' web"', 'curl -s http://prod-01:8000/');
    expect(s.log.slice(-3).map(l => l.out)).toEqual([[V1], [V1], ['shop v1']]);
  });
  it('a runner reaches only the hosts the lesson lets it reach', () => {
    const closed = { ...deployLab, remotes: [stagingHost, { ...prodHost, runners: false }] };
    const s = session(closed, DEPLOY_HOSTS_PROFILE, ...PUSH, 'gh run watch 4100000001 > /dev/null');
    expect(logOf(s, 'production', 'Login').at(-2)).toMatch(/^ssh: Could not resolve hostname prod-01: /);
  });
  it('a runner checks host keys (E7): unknown without known_hosts, trusted after ssh-keyscan, then the key decides', () => {
    const scan = "printf 'name: Scan\\non: workflow_dispatch\\njobs:\\n  scan:\\n    runs-on: ubuntu-latest\\n    steps:\\n      - run: ssh -o BatchMode=yes deploy@staging-01 true || echo unknown\\n"
      + "      - run: mkdir -p ~/.ssh && ssh-keyscan staging-01 >> ~/.ssh/known_hosts\\n      - run: ssh -o BatchMode=yes deploy@staging-01 true\\n' > .github/workflows/scan.yml";
    const s = lab('cd shop', scan, 'git add . && git commit -q -m Scan && git push -q', 'gh workflow run scan.yml', 'gh run watch 4100000002 > /dev/null');
    const steps = lastAttempt(s.state.git!.forge[0].site!.runs!.at(-1)!).jobs[0].steps.map(x => [x.conclusion, x.lines.at(-1)!.text]);
    expect(steps.slice(1, 4)).toEqual([['success', 'unknown'], ['success', '# staging-01:22 SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'], ['failure', '##[error]Process completed with exit code 255.']]);
    expect(lastAttempt(s.state.git!.forge[0].site!.runs!.at(-1)!).jobs[0].steps[1].lines.map(l => l.text)).toContain('Host key verification failed.');
    expect(lastAttempt(s.state.git!.forge[0].site!.runs!.at(-1)!).jobs[0].steps[3].lines.map(l => l.text)).toContain('deploy@staging-01: Permission denied (publickey,password).');
  });
  it('is deterministic', () => {
    const cmds = [...PUSH, 'gh run watch 4100000001', 'ssh deploy@prod-01 docker ps'];
    expect(replay(deployLab, cmds).steps).toEqual(replay(deployLab, cmds).steps);
  });
});

describe('checks with host', () => {
  const prodV2: TerminalCheck = { kind: 'container', host: 'prod-01', name: 'web', state: 'running', image: 'ghcr.example/island/shop:v2' };
  const page: TerminalCheck = { kind: 'http', url: 'http://prod-01:8000/', status: 200, body: 'shop v2' };
  it('pass after the pipeline and fail before it, with the host in the words', () => {
    expect(exercise([prodV2, page, { kind: 'image', host: 'prod-01', name: 'ghcr.example/island/shop:v2' }], [...PUSH, 'sleep 700']).ok).toBe(true);
    const r = exercise([prodV2, page, { kind: 'image', host: 'prod-01', name: 'ghcr.example/island/shop:v2' }], [...PUSH, 'sleep 60']).results.map(x => x.message);
    expect(r).toEqual(['prod-01 上應該有名為 web 的容器（狀態是 running，由 ghcr.example/island/shop:v2 建立），但它是由 ghcr.example/island/shop:v1 建立的',
      'GET http://prod-01:8000/ 應該回應狀態碼 200、內容包含「shop v2」，但內容不包含題目要的文字',
      'prod-01 上應該有 Image ghcr.example/island/shop:v2，但這台主機沒有 ghcr.example/island/shop:v2（先 docker pull 或 docker build -t ghcr.example/island/shop:v2）']);
  });
  it('a container\'s image by digest matches whatever name it was run by', () => {
    const byDigest: TerminalCheck = { kind: 'container', host: 'prod-01', name: 'web', image: V1 };
    expect(exercise([byDigest], []).ok).toBe(true);
    const r = exercise([byDigest], ['cd shop', `gh workflow run deploy.yml -f image=ghcr.example/island/shop@sha256:${digestOf('v2')}`, 'sleep 700']).results[0];
    expect(r.message).toBe(`prod-01 上應該有名為 web 的容器（由 ${V1} 建立），但它是由 ghcr.example/island/shop@sha256:${digestOf('v2')} 建立的`);
    expect(exercise([{ kind: 'container', host: 'db-01', name: 'web' }], []).results[0].message).toBe('db-01 上應該有名為 web 的容器，但沒有 db-01 這台主機');
    expect(content([prodV2, page])).toEqual([]);
  });
});
