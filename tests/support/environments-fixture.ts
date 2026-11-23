import type { TerminalExercise, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { FsState } from '@/lib/terminal/fs';
import { ENVIRONMENTS_PROFILE, run, type ShellProfile } from '@/lib/terminal/shell';
import { machineState } from '@/lib/terminal/lesson';
import type { WorkflowRun } from '@/lib/terminal/actions-model';

/*
 * A synthetic machine for engine stage E30 (docs/curriculum/CICD0_E30_ENVIRONMENTS.md), only for tests — CICD09/13-like
 * deployments on dev-09 (the environments profile, Asia/Taipei). gh is logged in as mei-lin (admin of island/shop).
 * - island/shop main (c2): deploy.yml (Deploy: push to main and dispatch with an image input; staging, then production
 *   with environment.url from a step output), queue.yml (Queue: dispatch; concurrency group queue-<ref>, 100 s),
 *   rush.yml (Rush: the same with cancel-in-progress); a branch feature and a branch release/1.0 at c2.
 * - Environments: staging (161088001; branches main and release/*), production (161088002; reviewers mei-lin and the
 *   approver kai, who approves 1800 s after a deployment starts waiting).
 */
export const SHOP = 'https://github.example/island/shop.git';
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };
export const wf = (...lines: string[]) => [...lines, ''].join('\n');
export const STAGING = 161088001;
export const PRODUCTION = 161088002;

export const DEPLOY_YML = wf('name: Deploy', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:', '    inputs:', '      image:', '        description: Image digest', '        default: current',
  'jobs:', '  staging:', '    runs-on: ubuntu-latest', '    environment:', '      name: staging', '      url: https://staging.shop.example', '    steps:',
  '      - run: echo "deploy ${{ inputs.image || github.sha }} to staging"', '  production:', '    needs: staging', '    runs-on: ubuntu-latest', '    environment:', '      name: production',
  '      url: ${{ steps.out.outputs.url }}', '    steps:', '      - id: out', '        run: echo "url=https://shop.example" >> "$GITHUB_OUTPUT"',
  '      - run: echo "deploy ${{ inputs.image || github.sha }} to production"');
export const QUEUE_YML = wf('name: Queue', 'on: workflow_dispatch', 'concurrency:', '  group: queue-${{ github.ref }}', '  cancel-in-progress: false', 'jobs:', '  slow:', '    runs-on: ubuntu-latest',
  '    steps:', '      - run: sleep 100');
export const RUSH_YML = wf('name: Rush', 'on: workflow_dispatch', 'concurrency:', '  group: rush', '  cancel-in-progress: true', 'jobs:', '  slow:', '    runs-on: ubuntu-latest', '    steps:', '      - run: sleep 100');

export const ENV_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n' }, author: MEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add deployment workflows', files: { '.github/workflows/deploy.yml': DEPLOY_YML, '.github/workflows/queue.yml': QUEUE_YML, '.github/workflows/rush.yml': RUSH_YML }, author: MEI, time: '2026-11-21 01:00:00' },
];

export const envLab: TerminalMachine = {
  id: 'dev-09', title: 'dev-09（部署環境與核准）', user: 'learner', cwd: '/home/learner', host: 'dev-09', profile: 'environments', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [{ path: '/home', kind: 'dir', mode: 0o755, owner: 'root' }, { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' }],
  git: { user: MEI, commits: ENV_COMMITS, remotes: [{ url: SHOP, branches: { main: 'c2', feature: 'c2', 'release/1.0': 'c2' } }], repos: [{ path: '/home/learner/shop', origin: SHOP }] },
  forge: {
    login: 'mei-lin', repos: [{
      url: SHOP, permission: 'admin', environments: ['staging', 'production'],
      environmentRules: [{ name: 'staging', branches: ['main', 'release/*'] }, { name: 'production', reviewers: ['mei-lin', 'kai'] }],
      approvers: [{ login: 'kai', name: 'Kai Chen', after: 1800, comment: 'LGTM' }],
    }],
  },
  actions: {},
};

const runId = 'gh run list -w deploy.yml -L 1 --json databaseId | grep databaseId | tr -dc 0-9';
/** CICD09-like: release main, approve the production deployment through the API. */
export const approveExercise: TerminalExercise = {
  id: 'approve', title: '核准上線', machine: 'dev-09',
  statement: '把 main 推上去觸發 Deploy，等 staging 部署完成後，用 gh api 核准 production 的部署，讓 main 目前的 commit 成功上線。',
  checks: [{ kind: 'deployment', repo: SHOP, environment: 'production', tip: true, status: 'success', latest: true }],
  solution: ['cd shop', "git commit -q --allow-empty -m 'Release'", 'git push -q', 'sleep 30',
    `gh api -X POST repos/{owner}/{repo}/actions/runs/$(${runId})/pending_deployments -F 'environment_ids[]=${PRODUCTION}' -f state=approved -f comment='Ship it'`, 'sleep 60'],
  mistakes: [{ commands: ['cd shop', "git commit -q --allow-empty -m 'Release'", 'git push -q', 'sleep 60'], why: '沒有核准，production 還在等待' }],
  hints: ['gh api repos/{owner}/{repo}/actions/runs/編號/pending_deployments'], explanation: 'production 需要審核者核准後才會開始部署。',
};
/** CICD09-like: protect production with a reviewer, a wait timer and a branch policy. */
export const protectExercise: TerminalExercise = {
  id: 'protect', title: '保護 production', machine: 'dev-09',
  statement: '把 production 的審核者改成 kai，等待 10 分鐘，而且只有 main 可以部署。',
  checks: [{ kind: 'environment', repo: SHOP, name: 'production', reviewers: ['kai'], waitTimer: 10, branches: ['main'] }],
  solution: ['cd shop',
    `echo '{"wait_timer":10,"reviewers":[{"type":"User","id":2001}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' > env.json`,
    'gh api -X PUT repos/{owner}/{repo}/environments/production --input env.json --silent', 'gh api -X POST repos/{owner}/{repo}/environments/production/deployment-branch-policies -f name=main --silent'],
  mistakes: [{ commands: ['cd shop', `echo '{"wait_timer":10,"reviewers":[{"type":"User","id":2001}]}' > env.json`, 'gh api -X PUT repos/{owner}/{repo}/environments/production --input env.json --silent'], why: '沒有設定部署分支' }],
  hints: ['gh api -X PUT …/environments/production --input 檔案'], explanation: '保護規則寫在 environment 上。',
};
export const envContent: TerminalLessonContent = { machines: [envLab], examples: [], exercises: [approveExercise, protectExercise] };

export interface Logged { out: string[]; err: string[]; status?: number }
export function session(from: FsState | TerminalMachine, profile: ShellProfile = ENVIRONMENTS_PROFILE, ...commands: string[]) {
  let state = 'files' in from ? machineState(from) : from;
  const log: Logged[] = [];
  for (const cmd of commands) {
    const r = run(state, cmd, profile);
    state = r.state;
    log.push({ out: r.lines.filter(l => l.kind === 'out').map(l => l.text), err: r.lines.filter(l => l.kind === 'err').map(l => l.text), status: r.state.status });
  }
  return { state, log, last: log.at(-1)! };
}
export const lab = (...commands: string[]) => session(envLab, ENVIRONMENTS_PROFILE, ...commands);
export const runsOf = (s: FsState): readonly WorkflowRun[] => s.git!.forge.find(f => f.url === SHOP)!.site!.runs ?? [];
export const siteOf = (s: FsState) => s.git!.forge.find(f => f.url === SHOP)!.site!;
/** The lab with its production rules replaced, or a third commit on main adding files. */
export function labWith(o: { production?: Record<string, unknown>; files?: Record<string, string>; approvers?: unknown[] }): TerminalMachine {
  const repo = envLab.forge!.repos![0];
  return {
    ...envLab,
    forge: { ...envLab.forge!, repos: [{ ...repo, environmentRules: [repo.environmentRules![0], { name: 'production', ...o.production }], approvers: (o.approvers ?? repo.approvers) as typeof repo.approvers }] },
    ...o.files ? { git: { ...envLab.git!, commits: [...ENV_COMMITS, { id: 'c3', message: 'More workflows', files: o.files, author: MEI, time: '2026-11-22 01:00:00' }], remotes: [{ url: SHOP, branches: { main: 'c3', feature: 'c2', 'release/1.0': 'c2' } }] } } : {},
  };
}
export const PUSH = ['cd shop', "git commit -q --allow-empty -m 'Release'", 'git push -q'];
export const json = (lines: string[]) => JSON.parse(lines.join('\n'));
