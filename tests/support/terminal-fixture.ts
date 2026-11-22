import type { TerminalExample, TerminalExercise, TerminalLessonContent, TerminalMachine } from '@/lib/terminal/lesson';

/*
 * LNX-0: a small synthetic machine with three transcripts and two exercises, shared by the terminal capability tests. It is
 * test data only (no published lesson uses it): host web-01, the learner in the devs group, a team folder the group may
 * write to and a log only the adm group may read.
 */
export const webMachine: TerminalMachine = {
  id: 'web', title: '網站伺服器 web-01', user: 'learner', host: 'web-01', cwd: '/home/learner', groups: ['learner', 'devs'],
  files: [
    { path: '/etc', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/etc/hostname', kind: 'file', mode: 0o644, owner: 'root', content: 'web-01\n' },
    { path: '/home', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/notes.txt', kind: 'file', mode: 0o644, owner: 'learner', content: 'hello\n' },
    { path: '/home/learner/reports', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/reports/today.txt', kind: 'file', mode: 0o644, owner: 'learner', content: '3 errors\n' },
    { path: '/srv', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/srv/team', kind: 'dir', mode: 0o775, owner: 'root', group: 'devs' },
    { path: '/var', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/var/log', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/var/log/app.log', kind: 'file', mode: 0o640, owner: 'root', group: 'adm', content: 'started\n' },
  ],
};

export const tourExample: TerminalExample = {
  id: 'tour', title: '看看家目錄', description: '用 `pwd`、`ls` 與 `cat` 認識所在的位置與檔案。', machine: 'web',
  steps: [
    { command: 'pwd', output: '/home/learner' },
    { command: 'ls', output: 'notes.txt  reports/' },
    { command: 'cat notes.txt', output: 'hello' },
  ],
};
export const groupExample: TerminalExample = {
  id: 'groups', title: '群組權限', description: '同一個群組可以寫入團隊目錄，不在 adm 群組就讀不到日誌。', machine: 'web',
  steps: [
    { command: 'ls -l /srv', output: 'drwxrwxr-x root    devs     4096 team/' },
    { command: 'touch /srv/team/plan.txt', output: '' },
    { command: 'cat /var/log/app.log', output: 'cat: /var/log/app.log: Permission denied' },
  ],
};
export const modeExample: TerminalExample = {
  id: 'modes', title: '修改權限', description: '`chmod 600` 之後，只有擁有者能讀寫。', machine: 'web',
  steps: [
    { command: 'ls -l', output: '-rw-r--r-- learner learner     6 notes.txt\ndrwxr-xr-x learner learner  4096 reports/' },
    { command: 'chmod 600 notes.txt', output: '' },
    { command: 'ls -l notes.txt', output: '-rw------- learner learner     6 notes.txt' },
  ],
};

export const backupExercise: TerminalExercise = {
  id: 'backup', title: '備份筆記', machine: 'web',
  statement: '在家目錄建立 `backup` 目錄，把 `notes.txt` 複製進去，並讓備份只有自己能讀寫；原檔要保留。',
  checks: [
    { kind: 'exists', path: '/home/learner/backup', type: 'dir' },
    { kind: 'content', path: '/home/learner/backup/notes.txt', content: 'hello\n' },
    { kind: 'mode', path: '/home/learner/backup/notes.txt', mode: 0o600 },
    { kind: 'unchanged', path: '/home/learner/notes.txt' },
  ],
  solution: ['mkdir backup', 'cp notes.txt backup/', 'chmod 600 backup/notes.txt'],
  mistakes: [
    { commands: ['mkdir backup', 'cp notes.txt backup/'], why: '忘了修改備份的權限，其他人仍可讀取。' },
    { commands: ['mkdir backup', 'mv notes.txt backup/', 'chmod 600 backup/notes.txt'], why: '用 mv 搬走了原檔。' },
  ],
  hints: ['先用 `mkdir` 建立目錄。', '`chmod 600` 讓擁有者可讀寫，其他人沒有權限。'],
  explanation: '`cp` 會留下原檔；`chmod 600` 對應 `rw-------`。',
};

export const reportExercise: TerminalExercise = {
  id: 'report', title: '讀出今天的報告', machine: 'web',
  statement: '印出 `reports/today.txt` 的內容。',
  checks: [{ kind: 'output' }],
  solution: ['cat reports/today.txt'],
  variants: [{ label: '另一天的報告', files: [{ path: '/home/learner/reports/today.txt', kind: 'file', mode: 0o644, owner: 'learner', content: '0 errors\n' }] }],
  mistakes: [
    { commands: ['echo 3 errors'], why: '直接打出看到的答案：換一份報告就不對了。' },
    { commands: ['cat notes.txt'], why: '讀錯了檔案。' },
  ],
  hints: ['`cat` 會印出檔案的內容。'],
  explanation: '`cat reports/today.txt` 從目前位置找到報告並印出它的內容。',
};

export const terminalContent = (): TerminalLessonContent => structuredClone({
  machines: [webMachine], examples: [tourExample, groupExample, modeExample], exercises: [backupExercise, reportExercise],
});
