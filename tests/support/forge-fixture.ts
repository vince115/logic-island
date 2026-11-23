import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';

/*
 * A synthetic machine for engine stage E26 (docs/curriculum/CICD0_E26_FORGE.md), only for tests — a CICD02-like team
 * workflow on dev-03 (the forge profile, Asia/Taipei, now 2026-11-23 10:00 local). gh is logged in as mei-lin (Mei Lin).
 * - island/shop: main at c3 (Chen Wei changed config.yml after the learner's clone at c2), a teammate's branch search (s1)
 *   with an open pull request #7 by hua; protected main (1 approval, stale approvals dismissed, required check test);
 *   hua approves 300 s after a head appears unless app.py still prints 'hi' (then requests changes); the check test passes
 *   unless app.py prints 'TODO'. The learner has write permission; next pull request is #8.
 * - island/tools: no protection, the learner is admin (changes settings with gh api).
 * - ~/shop is a clone at c2 (origin/main c2); ~/tools a clone of tools.
 */
const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
export const SHOP = 'https://github.example/island/shop.git';
export const TOOLS = 'https://github.example/island/tools.git';
const WEI = { name: 'Chen Wei', email: 'wei@example.com' }, HUA = { name: 'Lin Hua', email: 'hua@example.com' }, MEI = { name: 'Mei Lin', email: 'mei@example.com' };

export const FORGE_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n', 'app.py': "print('hi')\n", 'config.yml': 'port: 80\n' }, author: WEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add docs', files: { 'docs.md': 'Run app.py.\n' }, author: WEI, time: '2026-11-20 02:00:00' },
  { id: 'c3', message: 'Use port 8080', files: { 'config.yml': 'port: 8080\n' }, author: WEI, time: '2026-11-22 01:00:00' },
  { id: 's1', parents: ['c2'], message: 'Add search', files: { 'search.py': 'def search(q):\n    return []\n' }, author: HUA, time: '2026-11-22 02:00:00' },
  { id: 't1', parents: [], message: 'Start tools', files: { 'tool.sh': 'echo tool\n' }, author: MEI, time: '2026-11-21 01:00:00' },
];

export const forgeLab: TerminalMachine = {
  id: 'dev-03', title: 'dev-03（團隊協作）', user: 'learner', cwd: '/home/learner', host: 'dev-03', profile: 'forge', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: MEI,
    commits: FORGE_COMMITS,
    remotes: [{ url: SHOP, branches: { main: 'c3', search: 's1' } }, { url: TOOLS, branches: { main: 't1' } }],
    repos: [
      { path: '/home/learner/shop', origin: SHOP, branches: { main: 'c2' }, tracking: { main: 'c2' } },
      { path: '/home/learner/tools', origin: TOOLS },
    ],
  },
  forge: {
    login: 'mei-lin',
    repos: [
      {
        url: SHOP, description: 'The island shop',
        protection: [{ branch: 'main', approvals: 1, dismissStale: true, checks: ['test'] }],
        personas: [{ login: 'hua', name: 'Lin Hua', after: 300, review: 'approve', body: 'Looks good.', when: { path: 'app.py', includes: 'hello' }, otherwise: { review: 'request-changes', body: 'Please greet in full.' } }],
        checks: [{ context: 'test', conclusion: 'failure', when: { path: 'app.py', includes: 'TODO' }, description: 'Tests failed', seconds: 42 }, { context: 'test', conclusion: 'success', description: 'Tests passed', seconds: 62 }],
        pulls: [{ number: 7, head: 'search', title: 'Add search', body: 'A first search.', author: 'hua', created: '2026-11-22 03:00:00' }],
      },
      { url: TOOLS, permission: 'admin' },
    ],
  },
};

const branchWork = ['cd shop', 'git switch -c greet', "printf \"print('hello')\\n\" > app.py", "git commit -qam 'Greet in full'", 'git push -q -u origin greet'];

/** CICD02-like: a pull request from a feature branch, a reviewer's approval, a squash merge that deletes the branch. */
export const prExercise: TerminalExercise = {
  id: 'pr', title: '用 Pull Request 合併', machine: 'dev-03',
  statement: '在 ~/shop 開分支 greet，把 app.py 改成 print(\'hello\') 並推送，開 Pull Request，等 hua 核准後以 squash 合併並刪除分支。',
  checks: [
    { kind: 'pull-request', repo: SHOP, head: 'greet', state: 'merged', method: 'squash', approvals: 1 },
    { kind: 'branch', repo: SHOP, name: 'greet', absent: true },
    { kind: 'branch', repo: SHOP, name: 'main', linear: true, file: { path: 'app.py', content: "print('hello')\n" }, message: '^Greet in full \\(#8\\)\\n$' },
  ],
  solution: [...branchWork, "gh pr create --title 'Greet in full' --body 'Say hello.'", 'sleep 300', 'gh pr merge --squash --delete-branch'],
  mistakes: [
    { commands: [...branchWork, "gh pr create --title 'Greet in full' --body 'Say hello.'", 'gh pr merge --squash --delete-branch'], why: '還沒有核准：受保護的 main 拒絕合併' },
    { commands: [...branchWork, "gh pr create --title 'Greet in full' --body 'Say hello.'", 'sleep 300', 'gh pr merge --merge --delete-branch'], why: '用了合併 commit，不是 squash' },
    { commands: ['cd shop', "printf \"print('hello')\\n\" > app.py", "git commit -qam 'Greet in full'", 'git pull -q --rebase', 'git push'], why: '直接推送到受保護的 main 被拒絕' },
  ],
  hints: ['git push -u origin greet', 'gh pr create --title … --body …', 'gh pr merge --squash --delete-branch'], explanation: '受保護的分支只接受通過審查與檢查的 Pull Request；squash 把分支的 commit 壓成一個。',
};

/** Read main's protection from the API (the answer is gh's JSON). */
export const readExercise: TerminalExercise = {
  id: 'read', title: '讀分支保護', machine: 'dev-03',
  statement: '在 ~/shop 用 gh api 讀出 main 的分支保護設定。',
  checks: [{ kind: 'output', fromCommand: '^gh api ' }],
  solution: ['cd shop', 'gh api repos/{owner}/{repo}/branches/main/protection'],
  mistakes: [{ commands: ['cd shop', 'gh api repos/{owner}/{repo}/branches/search/protection'], why: 'search 沒有分支保護（404）' }],
  variants: [{ label: '兩個核准', files: [], forge: { ...forgeLab.forge!, repos: [{ ...forgeLab.forge!.repos![0], protection: [{ branch: 'main', approvals: 2, checks: ['test'], linear: true }] }, forgeLab.forge!.repos![1]] } }],
  hints: ['gh api repos/{owner}/{repo}/branches/main/protection'], explanation: '{owner} 與 {repo} 由目前儲存庫的 origin 決定。',
};

export const PROTECT_JSON = '{\n  "required_status_checks": null,\n  "enforce_admins": true,\n  "required_pull_request_reviews": { "required_approving_review_count": 1 },\n  "restrictions": null,\n  "required_linear_history": true\n}\n';
/** An admin protects tools' main with gh api -X PUT and a JSON file. */
export const protectExercise: TerminalExercise = {
  id: 'protect', title: '設定分支保護', machine: 'dev-03',
  statement: '在 ~/tools 用 gh api 保護 main：需要 1 個核准、線性歷史，管理員也不例外。',
  checks: [{ kind: 'protection', repo: TOOLS, branch: 'main', approvals: 1, linear: true, forcePush: false }],
  solution: ['cd tools', `printf '${PROTECT_JSON.replace(/\n/g, '\\n')}' > protect.json`, 'gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input protect.json --silent'],
  mistakes: [{ commands: ['cd tools', 'gh api repos/{owner}/{repo}/branches/main/protection'], why: '只讀了設定，沒有修改' }],
  hints: ['gh api -X PUT … --input protect.json'], explanation: 'PUT 要給完整的四個必要欄位（required_status_checks、enforce_admins、required_pull_request_reviews、restrictions）。',
};

export const forgeContent: TerminalLessonContent = {
  machines: [forgeLab],
  examples: [{
    id: 'list', title: '團隊的 Pull Request', description: 'gh 依 origin 找到 github.example 上的 island/shop。', machine: 'dev-03',
    steps: [
      { command: 'cd shop', output: '' },
      { command: 'gh pr list', output: '\nShowing 1 of 1 open pull request in island/shop\n\nID  TITLE       BRANCH  CREATED AT\n#7  Add search  search  about 23 hours ago' },
    ],
  }],
  exercises: [prExercise, readExercise, protectExercise],
};
