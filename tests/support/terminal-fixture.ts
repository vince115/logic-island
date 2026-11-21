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

/*
 * Engine stage E1: a machine on the files profile (system information, two mounts, a symbolic link, log files for globs),
 * three transcripts and three exercises. Test data only, like the rest of this file.
 */
export const filesMachine: TerminalMachine = {
  id: 'srv', title: '檔案伺服器 srv-01', user: 'learner', host: 'srv-01', cwd: '/home/learner', profile: 'files',
  system: { release: '6.8.0-45-generic', version: '#45-Ubuntu SMP PREEMPT_DYNAMIC', machine: 'x86_64' },
  mounts: [
    { path: '/', device: '/dev/sda1', type: 'ext4', size: 20509264, used: 4823500 },
    { path: '/srv', device: '/dev/sdb1', type: 'xfs', size: 104806400, used: 1048576 },
  ],
  files: [
    { path: '/etc', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/etc/os-release', kind: 'file', mode: 0o644, owner: 'root', content: 'NAME="Ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\n' },
    { path: '/home', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/.bashrc', kind: 'file', mode: 0o644, owner: 'learner', content: 'alias ll="ls -l"\n' },
    { path: '/home/learner/logs', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/logs/app-1.log', kind: 'file', mode: 0o644, owner: 'learner', content: 'app started\n' },
    { path: '/home/learner/logs/app-2.log', kind: 'file', mode: 0o644, owner: 'learner', content: 'app stopped\n' },
    { path: '/home/learner/logs/web.log', kind: 'file', mode: 0o644, owner: 'learner', content: 'GET /首頁\n'.repeat(450) },
    { path: '/home/learner/reports', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/reports/today.txt', kind: 'file', mode: 0o644, owner: 'learner', content: '3 errors\n' },
    { path: '/home/learner/latest', kind: 'link', mode: 0o777, owner: 'learner', target: 'reports/today.txt' },
    { path: '/srv', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/srv/data', kind: 'dir', mode: 0o755, owner: 'learner' },
  ],
};

export const systemExample: TerminalExample = {
  id: 'system', title: '這是哪一台機器', description: '`uname` 看核心，`hostname` 看主機名稱，`/etc/os-release` 看發行版。', machine: 'srv',
  steps: [
    { command: 'uname -a', output: 'Linux srv-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' },
    { command: 'hostname', output: 'srv-01' },
    { command: 'cat /etc/os-release', output: 'NAME="Ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"' },
  ],
};
export const diskExample: TerminalExample = {
  id: 'disk', title: '空間用量', description: '`df -h` 看每個檔案系統，`du -sh` 看一個目錄。', machine: 'srv',
  steps: [
    { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G  4.7G   15G  24% /\n/dev/sdb1       100G  1.0G   99G   2% /srv' },
    { command: 'df /srv/data', output: 'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/sdb1      104806400 1048576 103757824   2% /srv' },
    { command: 'du -h logs', output: '20K\tlogs' },
  ],
};
export const linkExample: TerminalExample = {
  id: 'links', title: '符號連結', description: '`latest` 指向今天的報告；`cat` 會跟著連結走。', machine: 'srv',
  steps: [
    { command: 'ls -l latest', output: 'lrwxrwxrwx learner learner    17 latest -> reports/today.txt' },
    { command: 'cat latest', output: '3 errors' },
    { command: 'ls logs/*.log', output: 'logs/app-1.log  logs/app-2.log  logs/web.log' },
  ],
};

export const linkExercise: TerminalExercise = {
  id: 'current', title: '建立捷徑', machine: 'srv',
  statement: '在家目錄建立符號連結 `current`，指向 `reports/today.txt`。',
  checks: [{ kind: 'link', path: '/home/learner/current', target: 'reports/today.txt' }, { kind: 'unchanged', path: '/home/learner/reports' }],
  solution: ['ln -s reports/today.txt current'],
  mistakes: [
    { commands: ['cp reports/today.txt current'], why: '複製出來的是另一個檔案，不是連結。' },
    { commands: ['ln -s today.txt current'], why: '相對的目標從連結所在的目錄算起，家目錄裡沒有 today.txt。' },
  ],
  hints: ['`ln -s 目標 連結名稱`。'],
  explanation: '符號連結存的是目標的路徑；`ls -l` 會顯示 `current -> reports/today.txt`。',
};
export const archiveExercise: TerminalExercise = {
  id: 'archive', title: '封存應用程式的日誌', machine: 'srv',
  statement: '建立 `archive` 目錄，把 `logs` 裡所有以 `app` 開頭的 `.log` 檔搬進去；`web.log` 留在原處。',
  checks: [
    { kind: 'exists', path: '/home/learner/archive/app-1.log', type: 'file' },
    { kind: 'exists', path: '/home/learner/archive/app-2.log', type: 'file' },
    { kind: 'absent', path: '/home/learner/logs/app-1.log' },
    { kind: 'unchanged', path: '/home/learner/logs/web.log' },
  ],
  solution: ['mkdir archive', 'mv logs/app*.log archive/'],
  mistakes: [
    { commands: ['mkdir archive', 'mv logs/*.log archive/'], why: '`*.log` 連 web.log 也一起搬走了。' },
    { commands: ['mkdir archive', 'cp logs/app*.log archive/'], why: '複製會留下原檔。' },
  ],
  hints: ['`app*.log` 符合所有以 app 開頭、以 .log 結尾的名稱。'],
  explanation: 'Shell 先把 `logs/app*.log` 展開成兩個檔名，`mv` 收到多個來源時，最後一個參數必須是目錄。',
};
export const readAllExercise: TerminalExercise = {
  id: 'read-all', title: '一次讀完', machine: 'srv',
  statement: '用一個指令印出 `logs` 裡所有以 `app` 開頭的日誌。',
  checks: [{ kind: 'output' }],
  solution: ['cat logs/app*.log'],
  variants: [{ label: '另一組日誌', files: [{ path: '/home/learner/logs/app-2.log', kind: 'file', mode: 0o644, owner: 'learner', content: 'app crashed\n' }] }],
  mistakes: [
    { commands: ['cat logs/app-1.log'], why: '只讀了一個檔案。' },
    { commands: ['echo app started app stopped'], why: '直接打出看到的答案：換一組日誌就不對了。' },
  ],
  hints: ['萬用字元由 Shell 展開，`cat` 會收到每一個符合的檔名。'],
  explanation: '`cat logs/app*.log` 依名稱的順序印出 app-1.log 與 app-2.log。',
};

export const filesContent = (): TerminalLessonContent => structuredClone({
  machines: [filesMachine], examples: [systemExample, diskExample, linkExample], exercises: [linkExercise, archiveExercise, readAllExercise],
});
