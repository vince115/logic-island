import type { TerminalFile, TerminalMachine, TerminalRemote } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalImage } from '@/lib/terminal/docker-lesson';
import { hostKey, keyPair } from '@/lib/terminal/ssh';

/*
 * A synthetic machine for engine stage E31 (docs/curriculum/CICD0_E31_DEPLOY_HOSTS.md), only for tests — CICD09/13/14-like
 * deployments to two Docker hosts on dev-31 (the deploy-hosts profile, Asia/Taipei). gh is logged in as mei-lin.
 * - staging-01 (10.0.0.21) and prod-01 (10.0.0.22): Docker, the user deploy (docker group) with the CI key and the
 *   learner's key in authorized_keys, container web from ghcr.example/island/shop:v1 on port 8000; runners reach both.
 * - ghcr.example/island/shop: v1 (body "shop v1"), v2 ("shop v2") and v3 (/healthz answers 500); ci may push, deploy pulls.
 * - island/shop main (c2): deploy.yml (Deploy: push to main and dispatch with an image input; staging, then production,
 *   each over ssh with the DEPLOY_KEY secret and a curl smoke test). The variable IMAGE is the tag a push deploys.
 * - production waits for kai, who approves 600 s after it starts waiting.
 */
const dir = (path: string, owner = 'root', mode = 0o755): TerminalFile => ({ path, kind: 'dir', mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644): TerminalFile => ({ path, kind: 'file', mode, owner, content });
export const SHOP = 'https://github.example/island/shop.git';
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };
export const CI_TOKEN = 'lesson-token-ci-0001';
export const PULL_TOKEN = 'lesson-token-deploy-0001';
export const CI_KEY = keyPair('dev31-deploy', 'deploy@ci');
export const LEARNER_KEY = keyPair('dev31:learner:/home/learner/.ssh/id_ed25519', 'learner@dev-31');
export const STAGING_KEY = hostKey('staging-01-2026', 'staging-01');
export const PROD_KEY = hostKey('prod-01-2026', 'prod-01');
export const KNOWN_HOSTS = `# lesson deploy hosts\nstaging-01 ${STAGING_KEY.publicLine.split(' ').slice(0, 2).join(' ')}\nprod-01 ${PROD_KEY.publicLine.split(' ').slice(0, 2).join(' ')}`;
const wf = (...lines: string[]) => [...lines, ''].join('\n');

const deployJob = (job: string, env: string, host: string, needs?: string) => [
  `  ${job}:`, ...needs ? [`    needs: ${needs}`] : [], '    runs-on: ubuntu-latest', `    environment: ${env}`, '    env:', '      IMAGE: ${{ inputs.image || vars.IMAGE }}', '    steps:',
  '      - name: SSH key', '        env:', '          KEY: ${{ secrets.DEPLOY_KEY }}', '          HOSTS: ${{ secrets.KNOWN_HOSTS }}', '        run: |', '          mkdir -p ~/.ssh',
  '          printf \'%s\\n\' "$KEY" > ~/.ssh/id_ed25519', '          chmod 600 ~/.ssh/id_ed25519', '          printf \'%s\\n\' "$HOSTS" > ~/.ssh/known_hosts',
  '      - name: Login', `        run: echo "\${{ secrets.REGISTRY_TOKEN }}" | ssh deploy@${host} docker login ghcr.example -u deploy --password-stdin`,
  '      - name: Deploy', `        run: ssh deploy@${host} "docker pull $IMAGE && docker rm -f web && docker run -d --name web -p 8000:8000 $IMAGE"`,
  '      - name: Smoke test', `        run: curl -fsS http://${host}:8000/healthz`,
];
export const DEPLOY_YML = wf('name: Deploy', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', '    inputs:', '      image:', '        description: Image (by digest) to deploy',
  "        default: ''", 'jobs:', ...deployJob('staging', 'staging', 'staging-01'), ...deployJob('production', 'production', 'prod-01', 'staging'));

export const DEPLOY_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n' }, author: MEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add the deployment pipeline', files: { '.github/workflows/deploy.yml': DEPLOY_YML }, author: MEI, time: '2026-11-21 01:00:00' },
];

const shopImage = (tag: string, responder: string, created: string): TerminalImage => ({
  name: `ghcr.example/island/shop:${tag}`, size: 52_000_000, created, cmd: ['node', 'server.js'], workdir: '/app', expose: [8000], service: true,
  http: { port: 8000, responder }, logs: [`shop ${tag} listening on :8000`],
});
export const SHOP_IMAGES = [shopImage('v1', 'shop-v1', '2026-11-10 01:00:00'), shopImage('v2', 'shop-v2', '2026-11-20 01:00:00'), shopImage('v3', 'shop-v3', '2026-11-22 01:00:00')];
const health = (id: string, body: string, status = 200) => ({ id, server: 'node', routes: [{ path: '/', body: `${body}\n` }, { path: '/healthz', status, body: status === 200 ? 'ok\n' : 'error\n' }] });

const host = (name: string, address: string, seed: string): TerminalRemote => ({
  host: name, address, hostKey: seed, runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [dir('/home'), dir('/home/deploy', 'deploy', 0o750), dir('/home/deploy/.ssh', 'deploy', 0o700),
    file('/home/deploy/.ssh/authorized_keys', `${CI_KEY.publicLine}\n${LEARNER_KEY.publicLine}\n`, 'deploy', 0o600)],
  docker: {
    images: [{ ...SHOP_IMAGES[0], pulled: true }],
    containers: [{ name: 'web', image: 'ghcr.example/island/shop:v1', state: 'running', created: '2026-11-22 01:00:00', started: '2026-11-22 01:00:00', ports: ['8000:8000'] }],
  },
});
export const stagingHost = host('staging-01', '10.0.0.21', 'staging-01-2026');
export const prodHost = host('prod-01', '10.0.0.22', 'prod-01-2026');

export const deployLab: TerminalMachine = {
  id: 'dev-31', title: 'dev-31（部署主機）', user: 'learner', cwd: '/home/learner', host: 'dev-31', profile: 'deploy-hosts', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  accounts: { groups: [{ name: 'docker', gid: 988, members: ['learner'] }] },
  files: [dir('/home'), dir('/home/learner', 'learner'), dir('/home/learner/.ssh', 'learner', 0o700), file('/home/learner/.ssh/id_ed25519', LEARNER_KEY.privateText, 'learner', 0o600),
    file('/home/learner/.ssh/known_hosts', `${KNOWN_HOSTS}\n`, 'learner')],
  git: { user: MEI, commits: DEPLOY_COMMITS, remotes: [{ url: SHOP, branches: { main: 'c2' } }], repos: [{ path: '/home/learner/shop', origin: SHOP }] },
  forge: {
    login: 'mei-lin', repos: [{
      url: SHOP, permission: 'admin', environments: ['staging', 'production'],
      environmentRules: [{ name: 'production', reviewers: ['kai'] }], approvers: [{ login: 'kai', name: 'Kai Chen', after: 600, comment: 'LGTM' }],
      secrets: [{ name: 'DEPLOY_KEY', sshKey: { seed: 'dev31-deploy', comment: 'deploy@ci' } }, { name: 'KNOWN_HOSTS', value: KNOWN_HOSTS }, { name: 'REGISTRY_TOKEN', value: PULL_TOKEN }],
      variables: [{ name: 'IMAGE', value: 'ghcr.example/island/shop:v2' }],
    }],
  },
  actions: {},
  responders: [health('shop-v1', 'shop v1'), health('shop-v2', 'shop v2'), health('shop-v3', 'shop v3', 500)],
  docker: {
    images: SHOP_IMAGES,
    registries: [{ host: 'ghcr.example', users: [{ name: 'ci', token: CI_TOKEN, repos: ['island/*'] }, { name: 'deploy', token: PULL_TOKEN, push: false }] }],
  },
  remotes: [stagingHost, prodHost],
};
