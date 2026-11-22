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

/*
 * Engine stage E2: a machine on the streams profile (an access log, a CSV file, notes and a root-only log), three
 * transcripts and two exercises. Test data only.
 */
const ACCESS_LOG = [
  '203.0.113.7 GET /index.html 200', '198.51.100.2 GET /login 401', '203.0.113.7 GET /about 200',
  '192.0.2.9 POST /login 500', '198.51.100.2 GET /login 401', '203.0.113.7 GET /missing 404',
].map(l => `${l}\n`).join('');
export const streamsMachine: TerminalMachine = {
  id: 'logs', title: '日誌伺服器 log-01', user: 'learner', host: 'log-01', cwd: '/home/learner', profile: 'streams',
  files: [
    { path: '/etc', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/etc/hostname', kind: 'file', mode: 0o644, owner: 'root', content: 'log-01\n' },
    { path: '/home', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/home/learner', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/home/learner/access.log', kind: 'file', mode: 0o644, owner: 'learner', content: ACCESS_LOG },
    { path: '/home/learner/staff.csv', kind: 'file', mode: 0o644, owner: 'learner', content: 'name,dept,age\nann,ops,34\nbo,dev,28\ncy,dev,41\ndee,ops,25\n' },
    { path: '/home/learner/notes.txt', kind: 'file', mode: 0o644, owner: 'learner', content: 'TODO: rotate logs\ndone: backup\nTODO: renew cert\n' },
    { path: '/home/learner/reports', kind: 'dir', mode: 0o755, owner: 'learner' },
    { path: '/var', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/var/log', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/var/log/auth.log', kind: 'file', mode: 0o600, owner: 'root', content: 'Failed password for root\n' },
  ],
};
export const pipelineExample: TerminalExample = {
  id: 'pipeline', title: '誰的請求最多', description: '取出第一欄、排序、計數、再依次數排序。', machine: 'logs',
  steps: [
    { command: "cut -d ' ' -f 1 access.log | sort | uniq -c | sort -rn", output: '      3 203.0.113.7\n      2 198.51.100.2\n      1 192.0.2.9' },
    { command: 'grep -c 401 access.log', output: '2' },
    { command: 'wc -l access.log staff.csv', output: '  6 access.log\n  5 staff.csv\n 11 total' },
  ],
};
export const redirectExample: TerminalExample = {
  id: 'redirect', title: '把錯誤另外存起來', description: '`2>` 只導向錯誤；`2>&1` 讓錯誤跟著輸出走。', machine: 'logs',
  steps: [
    { command: 'cat notes.txt /var/log/auth.log > all.txt 2> errors.txt', output: '' },
    { command: 'cat errors.txt', output: 'cat: /var/log/auth.log: Permission denied' },
    { command: 'cat /var/log/auth.log 2>&1 | wc -l', output: '1' },
  ],
};
export const sortExample: TerminalExample = {
  id: 'csv', title: '排序 CSV', description: '`tail -n +2` 略過標題，`sort -t , -k 3 -n` 依年齡排序。', machine: 'logs',
  steps: [
    { command: 'tail -n +2 staff.csv | sort -t , -k 3 -n', output: 'dee,ops,25\nbo,dev,28\nann,ops,34\ncy,dev,41' },
    { command: 'cut -d , -f 2 staff.csv | tail -n +2 | sort -u', output: 'dev\nops' },
  ],
};
export const topIpExercise: TerminalExercise = {
  id: 'top-ip', title: '找出最常出現的位址', machine: 'logs',
  statement: '用一行管線印出 `access.log` 裡請求最多的位址與它的次數（`uniq -c` 的格式，只要一行）。',
  checks: [{ kind: 'output' }],
  solution: ["cut -d ' ' -f 1 access.log | sort | uniq -c | sort -rn | head -n 1"],
  variants: [{ label: '另一天的日誌', files: [{ path: '/home/learner/access.log', kind: 'file', mode: 0o644, owner: 'learner', content: '192.0.2.9 GET / 200\n192.0.2.9 GET /a 200\n203.0.113.7 GET / 200\n' }] }],
  mistakes: [
    { commands: ['echo "      3 203.0.113.7"'], why: '直接打出答案：換一天的日誌就不對了。' },
    { commands: ["cut -d ' ' -f 1 access.log | uniq -c | sort -rn | head -n 1"], why: '沒有先排序：uniq 只合併相鄰的重複行。' },
  ],
  hints: ['`uniq -c` 只合併相鄰的行，所以先 `sort`。'],
  explanation: '`cut` 取出位址，`sort` 讓相同的位址相鄰，`uniq -c` 計數，`sort -rn` 由多到少，`head -n 1` 留下第一行。',
};
export const todoExercise: TerminalExercise = {
  id: 'todo', title: '把待辦事項存成檔案', machine: 'logs',
  statement: '把 `notes.txt` 裡含有 `TODO` 的行寫進 `reports/todo.txt`。',
  checks: [{ kind: 'content', path: '/home/learner/reports/todo.txt', content: 'TODO: rotate logs\nTODO: renew cert\n' }, { kind: 'unchanged', path: '/home/learner/notes.txt' }],
  solution: ['grep TODO notes.txt > reports/todo.txt'],
  mistakes: [
    { commands: ['grep TODO notes.txt'], why: '只印在畫面上，沒有寫進檔案。' },
    { commands: ['grep -v TODO notes.txt > reports/todo.txt'], why: '`-v` 選出的是不含 TODO 的行。' },
  ],
  hints: ['`>` 把指令的輸出寫進檔案。'],
  explanation: '`grep TODO notes.txt` 選出兩行，`>` 把它們寫進 `reports/todo.txt`。',
};
export const streamsContent = (): TerminalLessonContent => structuredClone({
  machines: [streamsMachine], examples: [pipelineExample, redirectExample, sortExample], exercises: [topIpExercise, todoExercise],
});

/*
 * Engine stage E3: a machine on the users profile — learner in sudo, alice in devs, a service account, a team folder for
 * devs — three transcripts and three exercises. Test data only.
 */
export const usersMachine: TerminalMachine = {
  id: 'team', title: '團隊伺服器 team-01', user: 'learner', host: 'team-01', cwd: '/home/learner', profile: 'users',
  accounts: {
    users: [{ name: 'alice', uid: 1001, comment: 'Alice Chen' }, { name: 'svc-web', uid: 998, group: 'www-data', home: '/srv/www', shell: '/usr/sbin/nologin' }],
    groups: [{ name: 'sudo', members: ['learner'] }, { name: 'devs', gid: 1100, members: ['alice'] }],
  },
  files: [
    { path: '/etc', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/etc/skel', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/etc/skel/.bashrc', kind: 'file', mode: 0o644, owner: 'root', content: 'alias ll="ls -l"\n' },
    { path: '/home', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/home/learner', kind: 'dir', mode: 0o750, owner: 'learner' },
    { path: '/home/learner/notes.txt', kind: 'file', mode: 0o644, owner: 'learner', content: 'hello\n' },
    { path: '/home/alice', kind: 'dir', mode: 0o750, owner: 'alice' },
    { path: '/srv', kind: 'dir', mode: 0o755, owner: 'root' },
    { path: '/srv/team', kind: 'dir', mode: 0o775, owner: 'root', group: 'devs' },
    { path: '/srv/team/plan.txt', kind: 'file', mode: 0o660, owner: 'alice', group: 'devs', content: 'ship v2\n' },
    { path: '/srv/www', kind: 'dir', mode: 0o755, owner: 'svc-web', group: 'www-data' },
  ],
};
export const whoExample: TerminalExample = {
  id: 'who', title: '我是誰', description: '`id` 看自己，`id alice` 看別人，`groups` 只看群組。', machine: 'team',
  steps: [
    { command: 'id', output: 'uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)' },
    { command: 'id alice', output: 'uid=1001(alice) gid=1001(alice) groups=1001(alice),1100(devs)' },
    { command: 'groups', output: 'learner sudo' },
  ],
};
export const passwdExample: TerminalExample = {
  id: 'passwd', title: '帳號存在哪裡', description: '`/etc/passwd` 每行七欄，以 `:` 分隔。', machine: 'team',
  steps: [
    { command: 'grep alice /etc/passwd', output: 'alice:x:1001:1001:Alice Chen:/home/alice:/bin/bash' },
    { command: 'cut -d : -f 1,3,7 /etc/passwd | tail -n 3', output: 'learner:1000:/bin/bash\nalice:1001:/bin/bash\nsvc-web:998:/usr/sbin/nologin' },
    { command: 'grep devs /etc/group', output: 'devs:x:1100:alice' },
  ],
};
export const sudoExample: TerminalExample = {
  id: 'sudo', title: 'sudo', description: '一般使用者讀不到 `/etc/shadow`；sudo 群組的成員可以用 sudo。', machine: 'team',
  steps: [
    { command: 'head -n 1 /etc/shadow', output: "head: cannot open '/etc/shadow' for reading: Permission denied" },
    { command: 'sudo head -n 1 /etc/shadow', output: 'root:*:20000:0:99999:7:::' },
    { command: 'sudo -u alice cat /srv/team/plan.txt', output: 'ship v2' },
  ],
};
export const joinExercise: TerminalExercise = {
  id: 'join-devs', title: '加入 devs 群組', machine: 'team',
  statement: '讓 learner 加入 `devs` 群組，而且仍然可以使用 sudo。',
  checks: [{ kind: 'user', name: 'learner', groups: ['devs', 'sudo'] }],
  solution: ['sudo usermod -aG devs learner'],
  mistakes: [
    { commands: ['sudo usermod -G devs learner'], why: '沒有 `-a` 的 `-G` 會把附加群組換成 devs，learner 就離開了 sudo。' },
    { commands: ['usermod -aG devs learner'], why: '修改帳號需要 root：沒有 sudo 只會印出 Permission denied。' },
  ],
  hints: ['`usermod -aG 群組 使用者`。'],
  explanation: '`-a` 表示附加；新的群組在下一次登入（或 `newgrp devs`）後才出現在 `id` 裡。',
};
export const serviceExercise: TerminalExercise = {
  id: 'service', title: '建立服務帳號', machine: 'team',
  statement: '為備份程式建立系統帳號 `backup-agent`：不能登入（shell 是 `/usr/sbin/nologin`），也不需要家目錄。',
  checks: [{ kind: 'user', name: 'backup-agent', shell: '/usr/sbin/nologin' }, { kind: 'absent', path: '/home/backup-agent' }],
  solution: ['sudo useradd -r -s /usr/sbin/nologin backup-agent'],
  mistakes: [
    { commands: ['sudo useradd backup-agent'], why: '預設的 shell 是 /bin/sh，這個帳號可以登入。' },
    { commands: ['sudo useradd -m -s /usr/sbin/nologin backup-agent'], why: '`-m` 建立了用不到的家目錄。' },
  ],
  hints: ['`-r` 建立系統帳號，`-s` 指定 shell。'],
  explanation: '`useradd -r -s /usr/sbin/nologin backup-agent` 建立 UID 小於 1000 的系統帳號，沒有家目錄、不能登入。',
};
export const umaskExercise: TerminalExercise = {
  id: 'umask', title: '預設不給其他人讀', machine: 'team',
  statement: '調整這個工作階段的 umask，讓新檔案是 `rw-r-----`，再建立 `report.txt`。',
  checks: [{ kind: 'umask', umask: 0o027 }, { kind: 'mode', path: '/home/learner/report.txt', mode: 0o640 }],
  solution: ['umask 027', 'touch report.txt'],
  mistakes: [
    { commands: ['touch report.txt', 'chmod 640 report.txt'], why: '這個檔案對了，但之後的新檔案仍然是 644。' },
    { commands: ['umask 077', 'touch report.txt'], why: '077 連群組的讀取權限也拿掉了，檔案是 600。' },
  ],
  hints: ['新檔案的權限是 666 去掉 umask。'],
  explanation: '666 去掉 027 是 640（rw-r-----）；目錄則是 777 去掉 027，也就是 750。',
};
export const usersContent = (): TerminalLessonContent => structuredClone({
  machines: [usersMachine], examples: [whoExample, passwdExample, sudoExample], exercises: [joinExercise, serviceExercise, umaskExercise],
});

/*
 * Engine stage E4: a machine on the processes profile — a fixed clock, a process table with a CPU hog of alice's, a
 * learner's server that exits on SIGTERM, a stuck script that ignores it, and the learner's shell with vim. Test data only.
 */
const dir = (path: string, owner = 'root', mode = 0o755) => ({ path, kind: 'dir' as const, mode, owner });
const file = (path: string, content: string, owner = 'root', mode = 0o644) => ({ path, kind: 'file' as const, mode, owner, content });
export const procMachine: TerminalMachine = {
  id: 'app', title: '應用程式伺服器 app-01', user: 'learner', host: 'app-01', cwd: '/home/learner', profile: 'processes',
  now: '2026-11-22 10:00:00', boot: '2026-11-20 08:30:00', load: [1.12, 0.85, 0.6], cpus: 2, memory: { total: 4096, cache: 1024 },
  accounts: { users: [{ name: 'alice', uid: 1001 }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [dir('/etc'), dir('/home'), dir('/home/learner', 'learner'), file('/home/learner/notes.txt', 'todo\n', 'learner'), dir('/home/alice', 'alice'),
    file('/home/learner/run.sh', '#!/bin/sh\n', 'learner', 0o644)],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 11904, vsz: 167744, time: 5 },
    { pid: 2, ppid: 0, user: 'root', command: '[kthreadd]', stat: 'S' },
    { pid: 512, user: 'root', command: '/usr/sbin/cron -f', stat: 'Ss', rss: 2816, vsz: 6696 },
    { pid: 701, user: 'alice', command: 'python3 report.py', stat: 'R', cpu: 97.5, rss: 524288, vsz: 612000, tty: 'pts/1', start: '2026-11-22 08:15:00', time: 6123.45 },
    { pid: 812, user: 'learner', command: '/usr/bin/node server.js', stat: 'Sl', cpu: 3.2, rss: 98304, vsz: 1032000, start: '2026-11-21 23:10:00', time: 754.5 },
    { pid: 900, user: 'learner', command: 'python3 stuck.py', stat: 'S', rss: 20480, vsz: 31000, start: '2026-11-22 09:40:00', term: 'ignore', time: 1 },
    { pid: 1001, user: 'learner', command: '-bash', stat: 'Ss', rss: 5120, vsz: 8960, tty: 'pts/0', start: '2026-11-22 09:55:00' },
    { pid: 1050, ppid: 1001, user: 'learner', command: 'vim notes.txt', stat: 'S+', rss: 9216, vsz: 21000, tty: 'pts/0', start: '2026-11-22 09:58:00' },
  ],
};
export const psExample: TerminalExample = {
  id: 'ps', title: '找出吃 CPU 的行程', description: '`ps aux --sort=-%cpu` 把最忙的行程排在最前面。', machine: 'app',
  steps: [
    { command: 'ps', output: '    PID TTY          TIME CMD\n   1001 pts/0    00:00:00 bash\n   1050 pts/0    00:00:00 vim\n   1051 pts/0    00:00:00 ps' },
    { command: 'ps aux --sort=-%cpu | head -n 3', output: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nalice        701 97.5 12.5 612000 524288 pts/1    R    08:15 102:03 python3 report.py\nlearner      812  3.2  2.3 1032000 98304 ?        Sl   23:10  12:34 /usr/bin/node server.js' },
    { command: 'pgrep -l python', output: '701 python3\n900 python3' },
  ],
};
export const killExample: TerminalExample = {
  id: 'kill', title: 'SIGTERM 與 SIGKILL', description: '忽略 SIGTERM 的程式只能用 SIGKILL 結束。', machine: 'app',
  steps: [
    { command: 'kill 900', output: '' },
    { command: 'pgrep -a stuck', output: '' },
    { command: 'pgrep -af stuck', output: '900 python3 stuck.py' },
    { command: 'kill -9 900', output: '' },
    { command: 'echo $?', output: '0' },
  ],
};
export const jobsExample: TerminalExample = {
  id: 'jobs', title: '背景工作', description: '`&` 把指令放到背景，`jobs` 列出，`kill %1` 結束。', machine: 'app',
  steps: [
    { command: 'sleep 300 &', output: '[1] 1051' },
    { command: 'jobs', output: '[1]+  Running                 sleep 300 &' },
    { command: 'kill %1', output: '[1]+  Terminated              sleep 300' },
  ],
};
export const hogExercise: TerminalExercise = {
  id: 'hog', title: '結束卡住的程式', machine: 'app',
  statement: '`stuck.py` 不理會一般的結束要求；讓它結束，但不要動到其他行程。',
  checks: [{ kind: 'process', pid: 900, absent: true }, { kind: 'process', name: 'node' }, { kind: 'process', pid: 701 }],
  solution: ['kill -9 900'],
  mistakes: [
    { commands: ['kill 900'], why: 'SIGTERM 被這個程式忽略了，它還在。' },
    { commands: ['pkill python3'], why: 'pkill 預設也是送 SIGTERM，stuck.py 一樣不理會。' },
    { commands: ['kill -9 812'], why: '結束了錯誤的行程。' },
  ],
  hints: ['先用 `ps` 或 `pgrep -f stuck` 找到 PID。', '`kill -9` 送出 SIGKILL。'],
  explanation: 'SIGTERM 可以被程式忽略；SIGKILL 由核心執行，一定會結束行程。',
};
export const topCpuExercise: TerminalExercise = {
  id: 'top-cpu', title: '誰最忙', machine: 'app',
  statement: '印出目前 %CPU 最高的行程的 PID（只印數字）。',
  checks: [{ kind: 'output' }],
  solution: ['ps -eo pid --sort=-%cpu | head -n 2 | tail -n 1'],
  variants: [{ label: '另一個時刻', files: [], processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss' },
    { pid: 640, user: 'learner', command: 'gzip -9 big.log', stat: 'R', cpu: 88.1, rss: 2048 },
    { pid: 701, user: 'alice', command: 'python3 report.py', stat: 'S', cpu: 1.5, rss: 524288 },
  ] }],
  mistakes: [
    { commands: ['echo "    701"'], why: '直接打出看到的答案：換一個時刻就不對了。' },
    { commands: ['ps -eo pid --sort=-%cpu | head -n 1'], why: '第一行是標題 PID，不是行程。' },
  ],
  hints: ['`--sort=-%cpu` 由大到小。', '`head -n 2` 留下標題與第一列，`tail -n 1` 再留下最後一行。'],
  explanation: '`ps -eo pid --sort=-%cpu` 只印 PID 一欄並依 %CPU 由大到小排序。',
};
export const procContent = (): TerminalLessonContent => structuredClone({ machines: [procMachine], examples: [psExample, killExample, jobsExample], exercises: [hogExercise, topCpuExercise] });

/*
 * Engine stage E5: a machine on the packages profile — three Ubuntu noble repositories, nginx (with nginx-common as a
 * dependency) in two versions, htop, a security update of openssl, a held curl and a package whose dependency does not
 * exist. Test data only.
 */
const ARCHIVE = 'http://archive.ubuntu.com/ubuntu', SECURITY = 'http://security.ubuntu.com/ubuntu';
const nginxFiles = (version: string) => [
  { path: '/usr/sbin/nginx', kind: 'file' as const, mode: 0o755, content: `nginx ${version}\n` },
];
const nginxCommonFiles = [
  { path: '/etc/nginx', kind: 'dir' as const, mode: 0o755 },
  { path: '/etc/nginx/nginx.conf', kind: 'file' as const, mode: 0o644, content: 'worker_processes auto;\n' },
  { path: '/usr/lib/systemd/system/nginx.service', kind: 'file' as const, mode: 0o644,
    content: '[Unit]\nDescription=A high performance web server and a reverse proxy server\nAfter=network.target\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\'\nExecReload=/usr/sbin/nginx -s reload\n\n[Install]\nWantedBy=multi-user.target\n' },
];
export const pkgPackages: NonNullable<TerminalMachine['packages']> = {
  repositories: [
    { name: 'noble', url: ARCHIVE, suite: 'noble', components: ['main', 'universe'] },
    { name: 'noble-updates', url: ARCHIVE, suite: 'noble-updates', components: ['main', 'universe'] },
    { name: 'noble-security', url: SECURITY, suite: 'noble-security', components: ['main', 'universe'] },
    { name: 'old-ppa', url: 'https://ppa.launchpadcontent.net/old/ppa/ubuntu', suite: 'noble', components: ['main'], enabled: false },
  ],
  available: [
    { name: 'nginx', version: '1.24.0-2ubuntu7', repo: 'noble', section: 'httpd', description: 'small, powerful, scalable web/proxy server', depends: ['nginx-common'], files: nginxFiles('1.24.0-2ubuntu7') },
    { name: 'nginx-common', version: '1.24.0-2ubuntu7', repo: 'noble', arch: 'all', section: 'httpd', description: 'small, powerful, scalable web/proxy server - common files', files: nginxCommonFiles },
    { name: 'nginx', version: '1.24.0-2ubuntu7.1', repo: 'noble-updates', section: 'httpd', description: 'small, powerful, scalable web/proxy server', depends: ['nginx-common'], files: nginxFiles('1.24.0-2ubuntu7.1') },
    { name: 'nginx', version: '1.24.0-2ubuntu7.1', repo: 'noble-security', section: 'httpd', description: 'small, powerful, scalable web/proxy server', depends: ['nginx-common'], files: nginxFiles('1.24.0-2ubuntu7.1'), security: true },
    { name: 'nginx-common', version: '1.24.0-2ubuntu7.1', repo: 'noble-updates', arch: 'all', section: 'httpd', description: 'small, powerful, scalable web/proxy server - common files', files: nginxCommonFiles },
    { name: 'htop', version: '3.3.0-4build1', repo: 'noble', component: 'main', section: 'utils', description: 'interactive processes viewer', files: [{ path: '/usr/bin/htop', kind: 'file', mode: 0o755, content: '' }] },
    { name: 'openssl', version: '3.0.13-0ubuntu3', repo: 'noble', description: 'Secure Sockets Layer toolkit - cryptographic utility' },
    { name: 'openssl', version: '3.0.13-0ubuntu3.4', repo: 'noble-security', description: 'Secure Sockets Layer toolkit - cryptographic utility', security: true },
    { name: 'curl', version: '8.5.0-2ubuntu10', repo: 'noble', description: 'command line tool for transferring data with URL syntax' },
    { name: 'curl', version: '8.5.0-2ubuntu10.6', repo: 'noble-updates', description: 'command line tool for transferring data with URL syntax' },
    { name: 'legacy-app', version: '2.0-1', repo: 'noble', component: 'universe', description: 'an application with a missing dependency', depends: ['libgone1'] },
    { name: 'libgone1', version: '1.0-1', repo: 'old-ppa', description: 'only in a disabled repository' },
  ],
  installed: [
    { name: 'curl', version: '8.5.0-2ubuntu10', held: true },
    { name: 'openssl', version: '3.0.13-0ubuntu3' },
  ],
};
export const pkgMachine: TerminalMachine = {
  id: 'pkg', title: '網站主機 web-02', user: 'learner', host: 'web-02', cwd: '/home/learner', profile: 'packages',
  accounts: { groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [dir('/etc'), dir('/home'), dir('/home/learner', 'learner'), dir('/usr'), dir('/usr/bin'), file('/usr/bin/curl', '', 'root', 0o755)],
  packages: pkgPackages,
};
export const updateExample: TerminalExample = {
  id: 'update', title: '先更新套件清單', description: '`apt update` 只更新清單；`apt list --upgradable` 看看有哪些可以升級。', machine: 'pkg',
  steps: [
    { command: 'sudo apt update', output: 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nHit:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease\nHit:3 http://security.ubuntu.com/ubuntu noble-security InRelease\nReading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\n2 packages can be upgraded. Run \'apt list --upgradable\' to see them.' },
    { command: 'apt list --upgradable', output: 'Listing... Done\ncurl/noble-updates 8.5.0-2ubuntu10.6 amd64 [upgradable from: 8.5.0-2ubuntu10]\nopenssl/noble-security 3.0.13-0ubuntu3.4 amd64 [upgradable from: 3.0.13-0ubuntu3]' },
  ],
};
export const installExample: TerminalExample = {
  id: 'install', title: '安裝與相依性', description: 'nginx 需要 nginx-common，apt 一起安裝。', machine: 'pkg',
  steps: [
    { command: 'sudo apt install -y nginx', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nThe following additional packages will be installed:\n  nginx-common\nThe following NEW packages will be installed:\n  nginx nginx-common\n0 upgraded, 2 newly installed, 0 to remove and 2 not upgraded.\nSelecting previously unselected package nginx-common.\nPreparing to unpack .../nginx-common_1.24.0-2ubuntu7.1_all.deb ...\nUnpacking nginx-common (1.24.0-2ubuntu7.1) ...\nSelecting previously unselected package nginx.\nPreparing to unpack .../nginx_1.24.0-2ubuntu7.1_amd64.deb ...\nUnpacking nginx (1.24.0-2ubuntu7.1) ...\nSetting up nginx-common (1.24.0-2ubuntu7.1) ...\nSetting up nginx (1.24.0-2ubuntu7.1) ...' },
    { command: 'dpkg -l nginx*', output: 'Desired=Unknown/Install/Remove/Purge/Hold\n| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n||/ Name           Version           Architecture Description\n+++-==============-=================-============-=========================================================\nii  nginx          1.24.0-2ubuntu7.1 amd64        small, powerful, scalable web/proxy server\nii  nginx-common   1.24.0-2ubuntu7.1 all          small, powerful, scalable web/proxy server - common files' },
  ],
};
export const holdExample: TerminalExample = {
  id: 'hold', title: '鎖定版本', description: '被 hold 的套件在升級時保留原來的版本。', machine: 'pkg',
  steps: [
    { command: 'apt-mark showhold', output: 'curl' },
    { command: 'sudo apt upgrade -y', output: 'Reading package lists... Done\nBuilding dependency tree... Done\nReading state information... Done\nCalculating upgrade... Done\nThe following packages have been kept back:\n  curl\nThe following packages will be upgraded:\n  openssl\n1 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.\nPreparing to unpack .../openssl_3.0.13-0ubuntu3.4_amd64.deb ...\nUnpacking openssl (3.0.13-0ubuntu3.4) over (3.0.13-0ubuntu3) ...\nSetting up openssl (3.0.13-0ubuntu3.4) ...' },
  ],
};
export const htopExercise: TerminalExercise = {
  id: 'htop', title: '安裝 htop', machine: 'pkg',
  statement: '安裝 `htop`。',
  checks: [{ kind: 'package', name: 'htop' }, { kind: 'exists', path: '/usr/bin/htop', type: 'file' }],
  solution: ['sudo apt install -y htop'],
  mistakes: [
    { commands: ['apt install htop'], why: '安裝需要 root：沒有 sudo 只會印出無法取得鎖定的錯誤。' },
    { commands: ['sudo apt install -y htp'], why: '套件名稱打錯了。' },
  ],
  hints: ['`sudo apt install -y 套件`。'],
  explanation: 'apt 從套件庫找到 htop，安裝它的檔案 /usr/bin/htop。',
};
export const securityExercise: TerminalExercise = {
  id: 'security', title: '套用安全更新但保留 curl', machine: 'pkg',
  statement: '把 openssl 升級到安全更新的版本；curl 被鎖定在目前的版本，不要動它。',
  checks: [{ kind: 'package', name: 'openssl', version: '3.0.13-0ubuntu3.4' }, { kind: 'package', name: 'curl', version: '8.5.0-2ubuntu10', held: true }],
  solution: ['sudo apt upgrade -y'],
  mistakes: [
    { commands: ['sudo apt upgrade -y --allow-change-held-packages', 'sudo apt-mark unhold curl', 'sudo apt upgrade -y'], why: '解除了 curl 的鎖定，curl 也被升級了。' },
    { commands: ['sudo apt upgrade'], why: '沒有 -y：apt 詢問是否繼續，模擬環境沒有鍵盤，所以中止了。' },
  ],
  hints: ['`apt upgrade` 會保留被 hold 的套件。'],
  explanation: '`apt upgrade` 升級所有可以升級的套件，被 `apt-mark hold` 的 curl 顯示在 kept back。',
};
export const pkgContent = (): TerminalLessonContent => structuredClone({ machines: [pkgMachine], examples: [updateExample, installExample, holdExample], exercises: [htopExercise, securityExercise] });

/*
 * Engine stage E6: a machine on the services profile — nginx running and enabled, report.service failed because its
 * configuration file is missing (Restart=on-failure), a worker with Restart=always, a program that ignores SIGTERM, api
 * that Requires= db, and a journal since boot. Test data only.
 */
const unit = (path: string, content: string) => file(path, content);
const link = (path: string, target: string) => ({ path, kind: 'link' as const, mode: 0o777, owner: 'root', target });
const exe = (path: string) => file(path, '', 'root', 0o755);
export const NGINX_UNIT = '[Unit]\nDescription=A high performance web server and a reverse proxy server\nAfter=network.target\n\n[Service]\nType=forking\nExecStart=/usr/sbin/nginx -g \'daemon on; master_process on;\'\nExecReload=/usr/sbin/nginx -s reload\n\n[Install]\nWantedBy=multi-user.target\n';
export const REPORT_UNIT = '[Unit]\nDescription=Nightly report\n\n[Service]\nExecStart=/usr/local/bin/report\nUser=report\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n';
export const svcMachine: TerminalMachine = {
  id: 'svc', title: '服務主機 svc-01', user: 'learner', host: 'svc-01', cwd: '/home/learner', profile: 'services',
  now: '2026-11-22 10:00:00', boot: '2026-11-22 08:00:00',
  accounts: { users: [{ name: 'report', uid: 998, home: '/nonexistent', shell: '/usr/sbin/nologin' }], groups: [{ name: 'sudo', members: ['learner'] }] },
  files: [
    dir('/etc'), dir('/etc/systemd'), dir('/etc/systemd/system'), dir('/etc/systemd/system/multi-user.target.wants'),
    link('/etc/systemd/system/multi-user.target.wants/nginx.service', '/usr/lib/systemd/system/nginx.service'),
    link('/etc/systemd/system/multi-user.target.wants/report.service', '/etc/systemd/system/report.service'),
    unit('/etc/systemd/system/report.service', REPORT_UNIT),
    unit('/etc/systemd/system/worker.service', '[Unit]\nDescription=Queue worker\n\n[Service]\nExecStart=/usr/local/bin/worker --queue jobs\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\n'),
    unit('/etc/systemd/system/stubborn.service', '[Unit]\nDescription=Legacy daemon\n\n[Service]\nExecStart=/usr/local/bin/stubborn\n'),
    unit('/etc/systemd/system/api.service', '[Unit]\nDescription=API server\nRequires=db.service\nAfter=db.service\n\n[Service]\nExecStart=/usr/local/bin/api\n\n[Install]\nWantedBy=multi-user.target\n'),
    unit('/etc/systemd/system/db.service', '[Unit]\nDescription=Database\n\n[Service]\nExecStart=/usr/local/bin/db\n'),
    dir('/home'), dir('/home/learner', 'learner'),
    dir('/usr'), dir('/usr/lib'), dir('/usr/lib/systemd'), dir('/usr/lib/systemd/system'), unit('/usr/lib/systemd/system/nginx.service', NGINX_UNIT),
    dir('/usr/sbin'), exe('/usr/sbin/nginx'), dir('/usr/local'), dir('/usr/local/bin'),
    exe('/usr/local/bin/report'), exe('/usr/local/bin/worker'), exe('/usr/local/bin/stubborn'), exe('/usr/local/bin/api'), exe('/usr/local/bin/db'), exe('/usr/local/bin/hello'),
    dir('/var'), dir('/var/log'),
    { ...file('/var/log/syslog', 'Nov 22 09:45:00 svc-01 kernel: TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.\n', 'root', 0o640), group: 'adm' },
    { ...file('/var/log/syslog.1', 'Nov 21 23:59:59 svc-01 CRON[4410]: (root) CMD (logrotate /etc/logrotate.conf)\n', 'root', 0o640), group: 'adm' },
    { ...file('/var/log/syslog.2.gz', '', 'root', 0o640), group: 'adm' },
  ],
  processes: [
    { pid: 1, ppid: 0, user: 'root', command: '/sbin/init', stat: 'Ss', rss: 12800, vsz: 168000 },
    { pid: 812, user: 'root', command: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', stat: 'Ss', rss: 2400, vsz: 55000, start: '2026-11-22 08:00:05', unit: 'nginx', hup: 'reload' },
    { pid: 813, ppid: 812, user: 'www-data', command: 'nginx: worker process', stat: 'S', rss: 5400, vsz: 55800, start: '2026-11-22 08:00:05', unit: 'nginx' },
    { pid: 901, user: 'root', command: '/usr/local/bin/stubborn', stat: 'Ss', rss: 3000, unit: 'stubborn', term: 'ignore' },
    { pid: 1001, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5120, start: '2026-11-22 09:55:00' },
  ],
  services: [
    { unit: 'nginx', active: 'active', since: '2026-11-22 08:00:05' },
    { unit: 'report', active: 'failed', since: '2026-11-22 09:00:00', pid: 950, status: 1 },
  ],
  programs: [
    { path: '/usr/local/bin/report', fail: { message: 'error: cannot open /etc/report.conf: No such file or directory', unless: '/etc/report.conf' }, log: ['report: config loaded, next run at 02:00'] },
    { path: '/usr/local/bin/worker', title: '/usr/local/bin/worker --queue jobs', cpu: 1.5, rss: 30720, log: ['worker: waiting for jobs'] },
    { path: '/usr/local/bin/stubborn', term: 'ignore' },
    { path: '/usr/local/bin/db', log: ['db: listening on port 5432'] },
    { path: '/usr/local/bin/api', log: ['api: connected to the database'] },
  ],
  journal: [
    { time: '2026-11-22 08:00:00', id: 'kernel', priority: 6, message: 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-075) #45-Ubuntu SMP' },
    { time: '2026-11-22 08:00:05', unit: 'nginx', id: 'systemd', pid: 1, priority: 6, message: 'Starting nginx.service - A high performance web server and a reverse proxy server...' },
    { time: '2026-11-22 08:00:05', unit: 'nginx', id: 'systemd', pid: 1, priority: 6, message: 'Started nginx.service - A high performance web server and a reverse proxy server.' },
    { time: '2026-11-22 09:00:00', unit: 'report', id: 'systemd', pid: 1, priority: 6, message: 'Started report.service - Nightly report.' },
    { time: '2026-11-22 09:00:00', unit: 'report', id: 'report', pid: 950, priority: 3, message: 'error: cannot open /etc/report.conf: No such file or directory' },
    { time: '2026-11-22 09:00:00', unit: 'report', id: 'systemd', pid: 1, priority: 5, message: 'report.service: Main process exited, code=exited, status=1/FAILURE' },
    { time: '2026-11-22 09:00:00', unit: 'report', id: 'systemd', pid: 1, priority: 4, message: "report.service: Failed with result 'exit-code'." },
    { time: '2026-11-22 09:30:12', id: 'sshd', pid: 1200, priority: 6, message: 'Accepted publickey for learner from 203.0.113.7 port 52110 ssh2' },
    { time: '2026-11-22 09:45:00', id: 'kernel', priority: 4, message: 'TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.' },
  ],
};
export const statusExample: TerminalExample = {
  id: 'status', title: '服務的狀態', description: '`systemctl status` 一次看到是否在執行、開機是否啟動與最近的日誌。', machine: 'svc',
  steps: [
    { command: 'systemctl status nginx', output: '● nginx.service - A high performance web server and a reverse proxy server\n     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)\n     Active: active (running) since Sun 2026-11-22 08:00:05 UTC; 1h 59min ago\n   Main PID: 812 (nginx)\n     CGroup: /system.slice/nginx.service\n             ├─812 nginx: master process /usr/sbin/nginx -g daemon on; master_process on;\n             └─813 nginx: worker process\n\nNov 22 08:00:05 svc-01 systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...\nNov 22 08:00:05 svc-01 systemd[1]: Started nginx.service - A high performance web server and a reverse proxy server.' },
    { command: 'systemctl is-active report', output: 'failed' },
    { command: 'echo $?', output: '3' },
  ],
};
export const journalExample: TerminalExample = {
  id: 'journal', title: '查日誌', description: '一般使用者看不到系統日誌；`sudo journalctl -u` 依服務過濾，`-p err` 只看錯誤。', machine: 'svc',
  steps: [
    { command: 'journalctl -u report', output: 'Hint: You are currently not seeing messages from other users and the system.\n      Users in groups \'adm\', \'systemd-journal\' can see all messages.\n      Pass -q to turn off this notice.\n-- No entries --' },
    { command: 'sudo journalctl -u report -p err', output: 'Nov 22 09:00:00 svc-01 report[950]: error: cannot open /etc/report.conf: No such file or directory' },
    { command: 'sudo journalctl --since "09:30" --until now', output: 'Nov 22 09:30:12 svc-01 sshd[1200]: Accepted publickey for learner from 203.0.113.7 port 52110 ssh2\nNov 22 09:45:00 svc-01 kernel: TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.' },
  ],
};
export const failExample: TerminalExample = {
  id: 'fail', title: 'Restart=on-failure', description: '設定檔不存在時，systemd 重新啟動五次後放棄。', machine: 'svc',
  steps: [
    { command: 'sudo systemctl start report', output: '' },
    { command: 'sudo journalctl -u report -n 4 -o cat', output: 'Stopped report.service - Nightly report.\nreport.service: Start request repeated too quickly.\nreport.service: Failed with result \'exit-code\'.\nFailed to start report.service - Nightly report.' },
  ],
};
export const fixReportExercise: TerminalExercise = {
  id: 'fix-report', title: '讓 report 服務恢復', machine: 'svc',
  statement: '`report.service` 失敗了。從日誌找出原因（設定檔內容寫 `interval=60` 即可），讓服務執行起來。',
  checks: [{ kind: 'service', unit: 'report', active: 'active' }, { kind: 'exists', path: '/etc/report.conf', type: 'file' }],
  solution: ['echo interval=60 | sudo tee /etc/report.conf', 'sudo systemctl restart report'],
  mistakes: [
    { commands: ['sudo systemctl restart report'], why: '設定檔還不存在，服務一樣失敗。' },
    { commands: ['echo interval=60 | sudo tee /etc/report.conf'], why: '建立了設定檔，但沒有重新啟動服務。' },
  ],
  hints: ['`sudo journalctl -u report -p err` 看錯誤訊息。', '`systemctl restart` 重新啟動服務。'],
  explanation: '日誌說找不到 /etc/report.conf；建立它之後重新啟動，程式就能啟動。',
};
export const helloUnitExercise: TerminalExercise = {
  id: 'hello-unit', title: '寫一個服務', machine: 'svc',
  statement: '為 `/usr/local/bin/hello` 寫 `/etc/systemd/system/hello.service`：失敗時自動重新啟動、開機時啟動，並且現在就啟動它。',
  checks: [{ kind: 'service', unit: 'hello', active: 'active', enabled: true }, { kind: 'content', path: '/etc/systemd/system/hello.service', content: '[Unit]\nDescription=Hello\n\n[Service]\nExecStart=/usr/local/bin/hello\nRestart=on-failure\n\n[Install]\nWantedBy=multi-user.target\n' }],
  solution: ['echo -e "[Unit]\\nDescription=Hello\\n\\n[Service]\\nExecStart=/usr/local/bin/hello\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target" | sudo tee /etc/systemd/system/hello.service', 'sudo systemctl enable --now hello'],
  mistakes: [
    { commands: ['echo -e "[Unit]\\nDescription=Hello\\n\\n[Service]\\nExecStart=/usr/local/bin/hello\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target" | sudo tee /etc/systemd/system/hello.service', 'sudo systemctl start hello'], why: '啟動了，但沒有 enable，重新開機後不會啟動。' },
    { commands: ['echo -e "[Unit]\\nDescription=Hello\\n\\n[Service]\\nExecStart=/usr/local/bin/hello\\nRestart=on-failure\\n\\n[Install]\\nWantedBy=multi-user.target" | sudo tee /etc/systemd/system/hello.service', 'sudo systemctl enable hello'], why: 'enable 只決定開機時啟動；現在還沒有啟動（加 --now）。' },
  ],
  hints: ['unit 檔有 [Unit]、[Service]、[Install] 三段。', '`systemctl enable --now` 同時 enable 與啟動。'],
  explanation: 'Restart=on-failure 在程式失敗時重新啟動；WantedBy=multi-user.target 讓 enable 在開機的目標裡建立連結。',
};
export const errorExercise: TerminalExercise = {
  id: 'error', title: '找出錯誤訊息', machine: 'svc',
  statement: '只印出 report.service 的錯誤等級（err）訊息內容，不要時間與主機名稱。',
  checks: [{ kind: 'output' }],
  solution: ['sudo journalctl -u report -p err -o cat'],
  variants: [{ label: '另一天的日誌', files: [], journal: [
    { time: '2026-11-22 09:10:00', unit: 'report', id: 'report', pid: 990, priority: 3, message: 'error: permission denied on /var/lib/report' },
    { time: '2026-11-22 09:10:00', unit: 'report', id: 'systemd', pid: 1, priority: 4, message: "report.service: Failed with result 'exit-code'." },
  ] }],
  mistakes: [
    { commands: ['echo "error: cannot open /etc/report.conf: No such file or directory"'], why: '直接打出看到的答案：換一天的日誌就不對了。' },
    { commands: ['journalctl -u report -p err -o cat'], why: '沒有 sudo：一般使用者看不到系統的日誌。' },
  ],
  hints: ['`-p err` 只看錯誤，`-o cat` 只印訊息。'],
  explanation: '`journalctl -u report -p err -o cat` 依服務與等級過濾，並只印出訊息本身。',
};
export const svcContent = (): TerminalLessonContent => structuredClone({ machines: [svcMachine], examples: [statusExample, journalExample, failExample], exercises: [fixReportExercise, helloUnitExercise, errorExercise] });
/** E5 + E6: the services machine with the package data of the packages machine (installing nginx starts its unit). */
export const svcPkgMachine: TerminalMachine = {
  ...svcMachine, id: 'svc-pkg', packages: pkgPackages,
  files: svcMachine.files.filter(f => !f.path.includes('nginx') && f.path !== '/usr/sbin'),
  processes: svcMachine.processes!.filter(p => !p.unit || p.unit !== 'nginx'), services: svcMachine.services!.filter(s => s.unit !== 'nginx'),
};
