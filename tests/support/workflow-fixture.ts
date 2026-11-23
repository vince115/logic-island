import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import { workflowId } from '@/lib/terminal/workflow';

/*
 * A synthetic machine for engine stage E27 (docs/curriculum/CICD0_E27_WORKFLOWS.md), only for tests — CICD03/04-like
 * workflow files on dev-04 (the workflows profile, Asia/Taipei). gh is logged in as mei-lin.
 * - island/shop: main (c2) has .github/workflows/ci.yml (CI: push to main except docs, pull requests into main, contents:
 *   read) and release.yml (Release: tags v*, workflow_dispatch with a choice input; job publish has contents: write);
 *   branch broken (b1) has a ci.yml with an unknown key stepz. The repository's workflow permissions are the default (read).
 * - island/tools: lint.yml names no permissions and the repository is permissive (workflowPermissions: write).
 * - ~/shop and ~/tools are clones (the learner is admin on tools).
 */
const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
export const SHOP = 'https://github.example/island/shop.git';
export const TOOLS = 'https://github.example/island/tools.git';
const MEI = { name: 'Mei Lin', email: 'mei@example.com' };

export const CI_YML = [
  'name: CI', 'on:', '  push:', '    branches: [main]', '    paths-ignore: ["docs/**"]', '  pull_request:', '    branches: [main]',
  'permissions:', '  contents: read', 'jobs:', '  test:', '    runs-on: ubuntu-24.04', '    steps:', '      - uses: actions/checkout@v4',
  '      - run: python3 -m unittest', '',
].join('\n');
export const RELEASE_YML = [
  'name: Release', 'on:', '  push:', '    tags: ["v*"]', '  workflow_dispatch:', '    inputs:', '      level:', '        type: choice',
  '        options: [patch, minor]', 'jobs:', '  publish:', '    runs-on: ubuntu-24.04', '    permissions:', '      contents: write', '    steps:',
  '      - uses: actions/checkout@v4', '      - run: echo "release ${{ inputs.level }}"', '',
].join('\n');
/** The broken ci.yml of branch broken: stepz on line 13. */
export const BROKEN_YML = CI_YML.replace('    steps:', '    stepz:');
export const LINT_YML = ['name: Lint', 'on: [push, pull_request]', 'jobs:', '  lint:', '    runs-on: ubuntu-24.04', '    steps:', '      - uses: actions/checkout@v4',
  '      - run: shellcheck *.sh', ''].join('\n');

export const WORKFLOW_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n', 'app.py': "print('hi')\n", '.github/workflows/ci.yml': CI_YML }, author: MEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add release workflow', files: { '.github/workflows/release.yml': RELEASE_YML, 'docs/guide.md': 'Run app.py.\n' }, author: MEI, time: '2026-11-21 01:00:00' },
  { id: 'b1', parents: ['c2'], message: 'Try a new key', files: { '.github/workflows/ci.yml': BROKEN_YML }, author: MEI, time: '2026-11-22 01:00:00' },
  { id: 't1', parents: [], message: 'Start tools', files: { 'tool.sh': 'echo tool\n', '.github/workflows/lint.yml': LINT_YML }, author: MEI, time: '2026-11-21 02:00:00' },
];

export const workflowLab: TerminalMachine = {
  id: 'dev-04', title: 'dev-04（GitHub Actions）', user: 'learner', cwd: '/home/learner', host: 'dev-04', profile: 'workflows', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: MEI,
    commits: WORKFLOW_COMMITS,
    remotes: [{ url: SHOP, branches: { main: 'c2', broken: 'b1' } }, { url: TOOLS, branches: { main: 't1' } }],
    repos: [{ path: '/home/learner/shop', origin: SHOP }, { path: '/home/learner/tools', origin: TOOLS }],
  },
  forge: { login: 'mei-lin', repos: [{ url: SHOP, description: 'The island shop' }, { url: TOOLS, permission: 'admin', workflowPermissions: 'write' }] },
};

export const ID = { ci: workflowId(SHOP, '.github/workflows/ci.yml'), release: workflowId(SHOP, '.github/workflows/release.yml'), lint: workflowId(TOOLS, '.github/workflows/lint.yml') };
const LEAST = LINT_YML.replace('jobs:', 'permissions:\n  contents: read\njobs:');

/** CICD04-like: least privilege — lint only needs to read the code. */
export const leastExercise: TerminalExercise = {
  id: 'least', title: '最小權限', machine: 'dev-04',
  statement: '~/tools 的 lint.yml 沒有寫 permissions，而 island/tools 的預設是 write。讓 lint 的 GITHUB_TOKEN 只有 contents: read，提交並推送到 main。',
  checks: [{ kind: 'workflow', repo: TOOLS, path: '.github/workflows/lint.yml', job: 'lint', permissions: { contents: 'read' } }],
  solution: ['cd tools', `printf '${LEAST.replace(/\n/g, '\\n')}' > .github/workflows/lint.yml`, "git commit -qam 'Least privilege for lint'", 'git push -q'],
  mistakes: [
    { commands: ['cd tools', `printf '${LEAST.replace(/\n/g, '\\n')}' > .github/workflows/lint.yml`], why: '只改了本機的檔案，沒有提交與推送' },
    { commands: ['cd tools', `printf '${LINT_YML.replace('jobs:', 'permissions: read-all\\njobs:').replace(/\n/g, '\\n')}' > .github/workflows/lint.yml`, "git commit -qam 'Read all'", 'git push -q'], why: 'read-all 讓每個範圍都能讀，不只 contents' },
  ],
  hints: ['在 jobs: 之前加上 permissions: 與 contents: read'], explanation: '只要寫出任何一個範圍，沒寫到的範圍都變成 none。',
};

/** CICD04-like: read GitHub's message for the broken workflow (the answer is gh's output). */
export const brokenExercise: TerminalExercise = {
  id: 'broken', title: '找出無效的 workflow', machine: 'dev-04',
  statement: '在 ~/shop 用 gh 看 broken 分支上的 ci.yml 為什麼無效。',
  checks: [{ kind: 'output', fromCommand: '^gh workflow view ' }],
  solution: ['cd shop', 'gh workflow view ci.yml --ref broken'],
  mistakes: [{ commands: ['cd shop', 'gh workflow view ci.yml'], why: 'main 上的 ci.yml 是有效的' }],
  variants: [{ label: '另一個錯字', files: [], git: { ...workflowLab.git!, commits: WORKFLOW_COMMITS.map(c => c.id === 'b1' ? { ...c, files: { '.github/workflows/ci.yml': CI_YML.replace('runs-on', 'run-on') } } : c) } }],
  hints: ['gh workflow view ci.yml --ref broken'], explanation: 'GitHub 以行與欄指出第一個錯誤。',
};

/** CICD03-like: also run CI for pushes to release branches (but still not for documentation). */
export const triggerExercise: TerminalExercise = {
  id: 'trigger', title: '調整觸發條件', machine: 'dev-04',
  statement: '修改 ~/shop/.github/workflows/ci.yml：推送到 release/ 開頭的分支也要跑 CI（只改文件時仍然不跑）。',
  checks: [
    { kind: 'workflow', repo: '/home/learner/shop', path: '.github/workflows/ci.yml', on: { ref: 'release/1.0', paths: ['app.py'], events: ['push'] } },
    { kind: 'workflow', repo: '/home/learner/shop', path: '.github/workflows/ci.yml', on: { ref: 'release/1.0', paths: ['docs/guide.md'], events: [] } },
  ],
  solution: ['cd shop', `printf '${CI_YML.replace('branches: [main]', 'branches: [main, "release/**"]').replace(/\n/g, '\\n')}' > .github/workflows/ci.yml`],
  mistakes: [
    { commands: ['cd shop', `printf '${CI_YML.replace('branches: [main]', 'branches: [main, "release/*"]').replace('    paths-ignore: ["docs/**"]\n', '').replace(/\n/g, '\\n')}' > .github/workflows/ci.yml`], why: '拿掉了 paths-ignore，只改文件也會跑' },
    { commands: ['cd shop', `printf '${CI_YML.replace('branches: [main]', 'branches: [main, release]').replace(/\n/g, '\\n')}' > .github/workflows/ci.yml`], why: 'release 只符合名為 release 的分支' },
  ],
  hints: ['branches: [main, "release/**"]'], explanation: '分支篩選和路徑篩選要同時滿足。',
};

export const workflowContent: TerminalLessonContent = {
  machines: [workflowLab],
  examples: [{
    id: 'list', title: '儲存庫的 workflow', description: 'gh 列出預設分支上的 .github/workflows。', machine: 'dev-04',
    steps: [
      { command: 'cd shop', output: '' },
      { command: 'gh workflow list', output: `NAME     STATE   ID\nCI       active  ${ID.ci}\nRelease  active  ${ID.release}` },
    ],
  }],
  exercises: [leastExercise, brokenExercise, triggerExercise],
};
