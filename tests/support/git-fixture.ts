import type { TerminalExercise, TerminalFile, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';

/*
 * A synthetic machine for engine stage E25 (docs/curriculum/CICD0_E25_GIT.md), only for tests: dev-01 (the git profile,
 * Asia/Taipei, now 2026-11-23 10:00 local), where learner's ~/.gitconfig names Mei Lin.
 * - The forge has island/shop (main at c3 "Greet in full" by Lin Hua, feature at f1, annotated tag v0.1 on c1) and an
 *   empty island/empty.
 * - ~/shop is a clone made before c3: main and origin/main at c2, so the learner is one commit behind without knowing it.
 * - ~/notes has no remote: main (n2 "Polish the draft") and topic (n3 "Rewrite the draft") both changed line 2 of
 *   notes.txt since n1, so merging or rebasing them conflicts; run.sh is executable.
 * The commit IDs are the ones real Git computes for the same content, authors, times and zones (REAL_IDS).
 */
const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
export const SHOP = 'https://github.example/island/shop.git';
export const EMPTY = 'https://github.example/island/empty.git';
const WEI = { name: 'Chen Wei', email: 'wei@example.com' }, HUA = { name: 'Lin Hua', email: 'hua@example.com' }, MEI = { name: 'Mei Lin', email: 'mei@example.com' };

export const GIT_COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', files: { 'README.md': '# shop\n', 'app.py': "print('hi')\n" }, author: WEI, time: '2026-11-20 01:00:00' },
  { id: 'c2', message: 'Add config', files: { 'config.yml': 'port: 80\n' }, author: WEI, time: '2026-11-20 02:00:00' },
  { id: 'c3', message: 'Greet in full', files: { 'app.py': "print('hello')\n" }, author: HUA, time: '2026-11-21 02:00:00' },
  { id: 'f1', parents: ['c2'], message: 'Add search', files: { 'search.py': 'def search(q):\n    return []\n' }, author: HUA, time: '2026-11-21 03:00:00' },
  { id: 'n1', parents: [], message: 'Start notes', files: { 'notes.txt': 'title\nfirst draft\nend\n', 'run.sh': '#!/bin/sh\necho notes\n' }, executable: ['run.sh'], author: MEI, time: '2026-11-22 01:00:00' },
  { id: 'n2', message: 'Polish the draft', files: { 'notes.txt': 'title\npolished draft\nend\n' }, author: MEI, time: '2026-11-22 02:00:00' },
  { id: 'n3', parents: ['n1'], message: 'Rewrite the draft', files: { 'notes.txt': 'title\nrewritten draft\nend\n', 'todo.txt': 'review\n' }, author: MEI, time: '2026-11-22 03:00:00' },
];
/** What real Git 2.43 (and later) computes for these commits (git commit-tree with the same author, dates and +0800). */
export const REAL_IDS = {
  c1: '6a0389dd43f97291595dee6cc7d2a822ea402c2b', c2: '73207f305dff33c1865b99454ddd313d20a3bfa8', c3: 'c314c03acad9db43d8e8ce999a879f5b04805d44',
  f1: 'a0379ca13be73a103f5fc612e42a7c6fd4647181', n1: 'ccbd218ff8f447d36fa6ee5f6d356bb55ac579dc', n2: 'bff6c17329f49b927aaed6fc687e6243af7c81a7',
  n3: 'f96229315b2f109890dcde124acfc12f58947b00', 'v0.1': '564b265907dadae25f7201e55580ae0867f00f8b',
} as const;

export const gitLab: TerminalMachine = {
  id: 'dev-01', title: 'dev-01（Git 工作站）', user: 'learner', cwd: '/home/learner', host: 'dev-01', profile: 'git', timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: MEI,
    commits: GIT_COMMITS,
    remotes: [{ url: SHOP, branches: { main: 'c3', feature: 'f1' }, tags: [{ name: 'v0.1', at: 'c1', message: 'First release' }] }, { url: EMPTY, branches: {} }],
    repos: [
      { path: '/home/learner/shop', origin: SHOP, branches: { main: 'c2' }, tracking: { main: 'c2' } },
      { path: '/home/learner/notes', branches: { main: 'n2', topic: 'n3' } },
    ],
  },
};
/** The same machine without an identity (no ~/.gitconfig). */
export const anonymousLab: TerminalMachine = { ...gitLab, id: 'dev-02', git: { ...gitLab.git, user: undefined } };

/** CICD02-like: change the config, integrate the teammate's commit without a merge commit, push. */
export const pushExercise: TerminalExercise = {
  id: 'push', title: '整合同事的變更後推送', machine: 'dev-01',
  statement: '在 ~/shop 把 config.yml 的 port 改成 8080 並提交，整合 origin 上同事新的 commit（歷史保持一直線），再推送到 origin 的 main。',
  checks: [
    { kind: 'branch', repo: SHOP, name: 'main', includes: 'c3', linear: true, file: { path: 'config.yml', content: 'port: 8080\n' } },
    { kind: 'worktree', repo: '/home/learner/shop', clean: true, branch: 'main' },
  ],
  solution: ['cd shop', "printf 'port: 8080\\n' > config.yml", "git commit -am 'Use port 8080'", 'git pull --rebase', 'git push'],
  mistakes: [
    { commands: ['cd shop', "printf 'port: 8080\\n' > config.yml", "git commit -am 'Use port 8080'", 'git push'], why: '沒有先整合：推送被拒絕（fetch first）' },
    { commands: ['cd shop', "printf 'port: 8080\\n' > config.yml", "git commit -am 'Use port 8080'", 'git push --force'], why: '強制推送蓋掉了同事的 commit' },
    { commands: ['cd shop', "printf 'port: 8080\\n' > config.yml", "git commit -am 'Use port 8080'", 'git pull --no-rebase', 'git push'], why: '合併 commit 讓歷史不是一直線' },
  ],
  hints: ['git push 被拒絕時先 git pull --rebase', 'git push'], explanation: 'pull --rebase 把自己的 commit 接到同事的 commit 之後，歷史一直線，推送就是快轉。',
};

/** Merge topic into main in ~/notes and resolve the conflict. */
export const mergeExercise: TerminalExercise = {
  id: 'merge', title: '解決合併衝突', machine: 'dev-01',
  statement: '在 ~/notes 把 topic 合併進 main；notes.txt 的第二行改成 final draft 來解決衝突，然後完成合併。',
  checks: [
    { kind: 'branch', repo: '/home/learner/notes', name: 'main', parents: 2, includes: 'n3', file: { path: 'notes.txt', content: 'title\nfinal draft\nend\n' } },
    { kind: 'worktree', repo: '/home/learner/notes', clean: true },
  ],
  solution: ['cd notes', 'git merge topic || true', "printf 'title\\nfinal draft\\nend\\n' > notes.txt", 'git add notes.txt', 'git commit --no-edit'],
  mistakes: [
    { commands: ['cd notes', 'git merge topic || true', 'git add notes.txt', 'git commit --no-edit'], why: '把衝突標記一起提交了' },
    { commands: ['cd notes', 'git merge topic || true', 'git merge --abort'], why: '放棄了合併' },
  ],
  hints: ['git merge topic', '編輯 notes.txt 後 git add、git commit'], explanation: '兩邊都改了同一行，Git 無法決定，衝突標記之間是兩邊的版本。',
};

/** An annotated tag on the current commit, pushed to origin. */
export const tagExercise: TerminalExercise = {
  id: 'tag', title: '發布版本標籤', machine: 'dev-01',
  statement: '在 ~/shop 為目前的 commit 建立附註標籤 v1.0（訊息 Release 1.0），並推送到 origin。',
  checks: [{ kind: 'tag', repo: SHOP, name: 'v1.0', annotated: true, at: 'c2' }],
  solution: ['cd shop', "git tag -a v1.0 -m 'Release 1.0'", 'git push origin v1.0'],
  mistakes: [
    { commands: ['cd shop', 'git tag v1.0', 'git push origin v1.0'], why: '輕量標籤沒有訊息與建立者' },
    { commands: ['cd shop', "git tag -a v1.0 -m 'Release 1.0'"], why: '標籤沒有推送' },
  ],
  hints: ['git tag -a', 'git push origin 標籤'], explanation: 'git push 不會自動推送標籤，要指定名稱或 --tags。',
};

export const gitContent: TerminalLessonContent = {
  machines: [gitLab],
  examples: [{
    id: 'status', title: '落後但不知道', description: 'fetch 之前，git status 只和上次知道的 origin/main 比較。', machine: 'dev-01',
    steps: [
      { command: 'cd shop', output: '' },
      { command: 'git status', output: "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean" },
      { command: 'git fetch', output: 'From https://github.example/island/shop\n   73207f3..c314c03  main       -> origin/main\n * [new branch]      feature    -> origin/feature\n * [new tag]         v0.1       -> v0.1' },
      { command: 'git status -sb', output: '## main...origin/main [behind 1]' },
    ],
  }],
  exercises: [pushExercise, mergeExercise, tagExercise],
};
