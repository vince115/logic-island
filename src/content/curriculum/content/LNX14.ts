import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX14 Scheduling with cron and systemd timers (LNX-4). A terminal lesson on the scheduling profile (engine stage E9):
 * the five crontab fields with ranges, lists, steps, names and the @ shortcuts, the day-of-month / day-of-week OR rule of
 * Vixie cron, users' crontabs (crontab file, -l, -r; the file replaces the whole crontab) versus /etc/crontab and
 * /etc/cron.d with their user field, cron's minimal environment (SHELL=/bin/sh, PATH=/usr/bin:/bin, the home folder, %
 * as newline and standard input), where a job's output goes (mail, or nowhere without an MTA) and redirecting it to a
 * log, the machine's time zone and daylight saving (text only: the simulation skips a missing local time, Debian's cron
 * catches it up), systemd timers as a .timer + .service pair with OnCalendar=, Persistent=, list-timers and the journal,
 * systemd-analyze calendar, when to prefer which, and flock -n against overlapping runs. cron-next and cron-run are the
 * simulator's teaching helpers (the clock never moves) and the text says so. One batch server in Asia/Taipei with a
 * fixed clock (Sun 2026-11-22 18:00 CST) for the transcripts and two small machines for exercises; host names, users,
 * scripts and files are made up. Every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...group ? { group } : {} });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...group ? { group } : {} });
const script = (path: string, ...rows: string[]) => file(path, `${rows.join('\n')}\n`, 'root', 0o755);
const lines = (...rows: string[]) => rows.map(r => `${r}\n`).join('');
/** A unit file written with echo -e and sudo tee (the simulated machines have no editor). */
const teeUnit = (path: string, rows: string[]) => `echo -e "${rows.join('\\n')}" | sudo tee ${path}`;
const HOME = '/home/learner';
const UNITS = '/etc/systemd/system';
/** Every machine's clock: Sunday 2026-11-22 10:00 UTC, which is 18:00 in Asia/Taipei (CST, +0800, no daylight saving). */
const NOW = '2026-11-22 10:00:00';
const SPOOL = [dir('/var/spool'), dir('/var/spool/cron'), dir('/var/spool/cron/crontabs', 'root', 0o730, 'crontab')];
const ACCOUNTS = { groups: [{ name: 'sudo', members: ['learner'] }, { name: 'adm', members: ['learner'] }, { name: 'crontab', gid: 107 }] };
const INIT = { pid: 1, ppid: 0, user: 'root', command: '/usr/lib/systemd/systemd --switched-root --system --deserialize=31', stat: 'Ss', rss: 13100, vsz: 168500 };

const SYSTEM_CRONTAB = lines(
  '# /etc/crontab: system-wide crontab',
  '# Unlike a user\'s crontab, this file and the files in /etc/cron.d',
  '# have a user name field between the time and the command.',
  '',
  'SHELL=/bin/sh',
  'PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin',
  '',
  '# m h dom mon dow user  command',
  '25 6    * * *   root    cd / && run-parts --report /etc/cron.daily',
  '47 6    * * 7   root    cd / && run-parts --report /etc/cron.weekly',
  '52 6    1 * *   root    cd / && run-parts --report /etc/cron.monthly',
);
const REPORT_SERVICE = lines('[Unit]', 'Description=Daily sales report', '', '[Service]', 'Type=oneshot', 'User=learner', 'ExecStart=/usr/local/bin/report.sh');
const REPORT_TIMER = lines('[Unit]', 'Description=Sales report on weekday mornings', '', '[Timer]', 'OnCalendar=Mon..Fri 07:00', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target');
/** The crontab of the cron-run transcript: a bare script name, the same job with a full path and a log, and a % pitfall. */
const JOBS_CRON = lines(
  '# night jobs: install with  crontab jobs.cron',
  '30 2 * * * report.sh',
  '30 2 * * * /usr/local/bin/report.sh >> /home/learner/logs/report.log 2>&1',
  '30 2 * * * cp data/app.db backups/app-$(date +%F).db',
);

/**
 * The transcripts' machine (also exercises 1 and 3): a batch server in Asia/Taipei. /etc/crontab and /etc/cron.d hold
 * root's jobs (none before 03:40, so the learner's 02:30 jobs are the next due ones); report.timer was stopped on
 * Thursday for maintenance and never enabled, so Friday's 07:00 run was missed; a long archive sync started at 16:00 is
 * still running and holds /var/lock/archive.lock.
 */
const batchHost: TerminalMachine = {
  id: 'batch', title: '批次主機 batch-01', user: 'learner', host: 'batch-01', cwd: HOME, profile: 'scheduling',
  now: NOW, boot: '2026-11-16 01:00:00', timezone: 'Asia/Taipei', accounts: ACCOUNTS,
  files: [
    dir('/etc'), file('/etc/crontab', SYSTEM_CRONTAB), dir('/etc/cron.d'),
    file('/etc/cron.d/export-cleanup', lines('# remove old CSV exports every night', 'MAILTO=""', '40 3 * * * root /usr/local/sbin/clean-exports.sh')),
    dir('/etc/systemd'), dir(UNITS), file(`${UNITS}/report.service`, REPORT_SERVICE), file(`${UNITS}/report.timer`, REPORT_TIMER),
    dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/archive`, 'learner'), dir(`${HOME}/backups`, 'learner'), dir(`${HOME}/data`, 'learner'),
    file(`${HOME}/data/app.db`, 'orders=1284\n', 'learner'), file(`${HOME}/jobs.cron`, JOBS_CRON, 'learner'), dir(`${HOME}/logs`, 'learner'), dir(`${HOME}/reports`, 'learner'),
    dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'),
    script('/usr/local/bin/backup.sh', '#!/bin/bash', '# Copy the application database into ~/backups with the date in the name.', 'set -euo pipefail',
      'stamp=$(date +%F)', 'cp /home/learner/data/app.db "/home/learner/backups/app-$stamp.db"', 'echo "backup app-$stamp.db ok"'),
    script('/usr/local/bin/report.sh', '#!/bin/bash', '# Write the day\'s sales report into ~/reports.', 'set -euo pipefail',
      'day=$(date +%F)', 'echo "sales report for $day" > "/home/learner/reports/sales-$day.txt"', 'echo "report sales-$day.txt written"'),
    script('/usr/local/bin/sync-archive.sh', '#!/bin/bash', '# Copy the reports to the archive folder; on a busy day this takes hours.', 'set -euo pipefail',
      'echo "archive sync started"', 'cp /home/learner/reports/*.txt /home/learner/archive/', 'echo "archive sync finished"'),
    dir('/usr/local/sbin'), script('/usr/local/sbin/clean-exports.sh', '#!/bin/bash', 'set -euo pipefail', 'echo "nothing to clean"'),
    dir('/var'), dir('/var/lock', 'root', 0o777), file('/var/lock/archive.lock', '', 'learner'), ...SPOOL,
  ],
  processes: [
    INIT,
    { pid: 2210, user: 'learner', command: '/bin/bash /usr/local/bin/sync-archive.sh', stat: 'S', rss: 3600, vsz: 9800, start: '2026-11-22 08:00:00', locks: ['/var/lock/archive.lock'] },
    { pid: 2301, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, vsz: 8900, start: '2026-11-22 09:50:00' },
  ],
  services: [{ unit: 'report.timer', active: 'inactive', last: '2026-11-18 23:00:00' }],
};

/** Exercise 2: an upload server where partial uploads pile up in /srv/uploads/tmp; the cleanup script exists, no units yet. */
const uploadHost: TerminalMachine = {
  id: 'upload', title: '上傳主機 upload-01', user: 'learner', host: 'upload-01', cwd: HOME, profile: 'scheduling',
  now: NOW, boot: '2026-11-20 03:00:00', timezone: 'Asia/Taipei', accounts: ACCOUNTS,
  files: [
    dir('/etc'), dir('/etc/systemd'), dir(UNITS), dir('/home'), dir(HOME, 'learner', 0o750),
    dir('/srv'), dir('/srv/uploads', 'www-data'), dir('/srv/uploads/tmp', 'www-data'),
    file('/srv/uploads/tmp/a91f.part', 'partial\n', 'www-data'), file('/srv/uploads/tmp/c07e.part', 'partial\n', 'www-data'),
    dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'),
    script('/usr/local/bin/cleanup-uploads.sh', '#!/bin/bash', '# Remove uploads that were never finished.', 'set -euo pipefail', 'count=0',
      'for f in /srv/uploads/tmp/*.part; do', '  [ -e "$f" ] || continue', '  rm "$f"', '  count=$((count + 1))', 'done', 'echo "removed $count partial uploads"'),
    dir('/var'), ...SPOOL,
  ],
  processes: [INIT, { pid: 1840, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5100, vsz: 8900, start: '2026-11-22 09:52:00' }],
};

/** Exercise 4: a media server whose learner already has a weekly job; a photo sync started at 17:30 is still running and holds its lock. */
const mediaHost: TerminalMachine = {
  id: 'media', title: '媒體主機 media-02', user: 'learner', host: 'media-02', cwd: HOME, profile: 'scheduling',
  now: NOW, boot: '2026-11-20 03:00:00', timezone: 'Asia/Taipei', accounts: ACCOUNTS,
  files: [
    dir('/etc'), dir('/home'), dir(HOME, 'learner', 0o750), dir(`${HOME}/logs`, 'learner'),
    dir('/srv'), dir('/srv/photos', 'learner'), dir('/srv/photos/incoming', 'learner'), dir('/srv/photos/library', 'learner'),
    dir('/usr'), dir('/usr/local'), dir('/usr/local/bin'),
    script('/usr/local/bin/sync-photos.sh', '#!/bin/bash', '# Move new photos into the library; a big upload can take more than 30 minutes.', 'set -euo pipefail',
      'echo "photo sync started"', 'mv /srv/photos/incoming/* /srv/photos/library/ 2>/dev/null || true', 'echo "photo sync finished"'),
    script('/usr/local/bin/weekly-summary.sh', '#!/bin/bash', 'set -euo pipefail', 'echo "weekly summary sent"'),
    dir('/var'), dir('/var/lock', 'root', 0o777), file('/var/lock/photos.lock', '', 'learner'), ...SPOOL,
    file('/var/spool/cron/crontabs/learner', lines(
      '# DO NOT EDIT THIS FILE - edit the master and reinstall.',
      '# (summary.cron installed on Mon Nov 16 09:12:40 2026)',
      '# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)',
      '0 8 * * 1 /usr/local/bin/weekly-summary.sh >> /home/learner/logs/summary.log 2>&1',
    ), 'learner', 0o600, 'crontab'),
  ],
  processes: [
    INIT,
    { pid: 3105, user: 'learner', command: '/bin/bash /usr/local/bin/sync-photos.sh', stat: 'S', rss: 3500, vsz: 9700, start: '2026-11-22 09:30:00', locks: ['/var/lock/photos.lock'] },
    { pid: 3188, user: 'learner', command: '-bash', stat: 'Ss', tty: 'pts/0', rss: 5200, vsz: 8900, start: '2026-11-22 09:55:00' },
  ],
};

const CLEANUP_SERVICE_PATH = `${UNITS}/cleanup-uploads.service`;
const CLEANUP_TIMER_PATH = `${UNITS}/cleanup-uploads.timer`;
const CLEANUP_SERVICE = ['[Unit]', 'Description=Remove partial uploads', '', '[Service]', 'Type=oneshot', 'User=www-data', 'ExecStart=/usr/local/bin/cleanup-uploads.sh'];
const CLEANUP_TIMER = ['[Unit]', 'Description=Remove partial uploads every day', '', '[Timer]', 'OnCalendar=daily', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target'];
const BACKUP_LINE = '15 2 * * 1-5 /usr/local/bin/backup.sh >> /home/learner/logs/backup.log 2>&1';
const PHOTOS_LINE = '*/30 * * * * flock -n /var/lock/photos.lock /usr/local/bin/sync-photos.sh >> /home/learner/logs/photos.log 2>&1';

export const LNX14: LessonContent = {
  lessonId: 'LNX14',
  motivation: '凌晨 02:15 的資料庫備份、平日早上 07:00 產生的營業報表、每晚清掉一次沒傳完的上傳檔：伺服器上有許多工作不需要人守著，但必須準時執行、每一次都留下紀錄，而且不能因為上一次還沒跑完就疊在一起。Linux 有兩套排程工具：歷史悠久、一行設定就能用的 cron，以及和服務管理整合在一起的 systemd timer。本課在一台時區設為 Asia/Taipei 的批次主機上，讀寫 crontab 的五個時間欄位，看清楚 cron 執行工作時那個精簡的環境與輸出的去向，認識時區與夏令時間的陷阱，再把工作寫成 timer 與 service 的組合，比較兩者的取捨，最後用 flock 讓同一個工作不會重疊執行。',
  sections: [
    {
      id: 'lnx14-s-fields', title: 'crontab 語法：五個時間欄位',
      blocks: [
        { type: 'p', text: 'cron 是一個常駐的 daemon（Debian／Ubuntu 的套件與服務都叫 cron，RHEL 系是 cronie 的 crond），每分鐘醒來一次，檢查所有 crontab 裡有沒有「這一分鐘」該執行的工作。crontab 的每一行是一個工作：前五個欄位是時間，剩下的整段是交給 Shell 執行的指令，欄位之間以空白或 Tab 分隔，`#` 開頭的行是註解。' },
        { type: 'table', head: ['順序', '欄位', '允許的值', '例子'], rows: [
          ['1', '分（minute）', '0–59', '`15`：第 15 分'],
          ['2', '時（hour）', '0–23（24 小時制）', '`2`：凌晨 2 點'],
          ['3', '日（day of month）', '1–31', '`1`：每月 1 日'],
          ['4', '月（month）', '1–12，或 `jan`–`dec`', '`*`：每個月'],
          ['5', '週（day of week）', '0–7（0 與 7 都是星期日），或 `sun`–`sat`', '`1-5`：星期一到星期五'],
        ] },
        { type: 'p', text: '所以 `15 2 * * 1-5 指令` 是「星期一到星期五的 02:15」。每個欄位除了單一的數字，還有這些寫法：' },
        { type: 'table', head: ['寫法', '意義', '例子（寫在哪一欄）'], rows: [
          ['`*`', '這一欄的每一個值', '`* * * * *`：每分鐘'],
          ['`a-b`', '範圍，包含兩端', '`1-5`（週）：星期一到星期五'],
          ['`a,b,c`', '清單', '`0,30`（分）：整點與半點'],
          ['`*/n`', '從最小值開始，每隔 n', '`*/15`（分）：0、15、30、45 分'],
          ['`a-b/n`', '範圍內每隔 n', '`9-17/4`（時）：9、13、17 點'],
          ['名稱', '月與週可以用英文的前三個字母，不分大小寫', '`mon`（週）、`jan`（月）'],
          ['`@daily` 等簡寫', '一個字取代整組五個欄位', '見下表'],
        ] },
        { type: 'p', text: '名稱最好只當作單一的值，範圍與清單用數字寫（`1-5` 而不是 `mon-fri`）：不同 cron 實作的說明文件對名稱能不能用在範圍裡寫法不一，數字則到處通用。簡寫取代整組時間欄位：' },
        { type: 'table', head: ['簡寫', '等於', '意義'], rows: [
          ['`@reboot`', '—', 'cron 啟動時（通常就是開機時）執行一次'],
          ['`@hourly`', '`0 * * * *`', '每小時的整點'],
          ['`@daily`、`@midnight`', '`0 0 * * *`', '每天 00:00'],
          ['`@weekly`', '`0 0 * * 0`', '每個星期日 00:00'],
          ['`@monthly`', '`0 0 1 * *`', '每月 1 日 00:00'],
          ['`@yearly`、`@annually`', '`0 0 1 1 *`', '每年 1 月 1 日 00:00'],
        ] },
        { type: 'p', text: '最容易誤會的是「日」與「週」兩欄的關係。其他欄位都是每一欄都符合才執行（AND），但日與週兩欄都有限制時，Debian／Ubuntu 的 cron（Vixie cron）是任一個符合就執行（OR）：`0 9 1 * mon` 是「每月 1 日的 09:00，以及每個星期一的 09:00」，不是「剛好落在星期一的 1 日」。只要其中一欄以 `*` 開頭（包括 `*/2` 這種步進），它就被當成沒有限制，規則又回到 AND：`0 9 */2 * mon` 是「奇數日而且是星期一」。' },
        { type: 'p', text: '模擬環境提供一個教學輔助指令 `cron-next`，列出一個 cron 運算式接下來的執行時間（依機器的時區）。它不是真實 Linux 上的指令：在真實系統上要靠讀懂欄位、查看 cron 的日誌，或用本課後面介紹的 `systemd-analyze calendar` 驗算 timer 的時間。下面的紀錄先用 `timedatectl` 確認這台主機在 Asia/Taipei，現在是星期日 18:00，再逐一驗證上面的寫法；最後一個小時寫成 26，cron-next 回報 bad hour。' },
        { type: 'example', id: 'lnx14-fields' },
        { type: 'callout', tone: 'warning', title: '`*/15 2` 不是「2 點 15 分」，`2 15` 也不是', text: '時間欄位的順序是「分 時」，和平常說的「2 點 15 分」相反：`2 15 * * *` 是每天 15:02。步進也常被看錯：`*/15 2 * * *` 是 2 點這一個小時裡每 15 分鐘一次，每天 02:00、02:15、02:30、02:45 共執行四次。要表達 02:15，分欄寫 15、時欄寫 2，也就是 `15 2 * * *`。寫完一行後先算出接下來幾次的時間再安裝，比上線後才發現備份一晚跑了四次好得多。' },
      ],
    },
    {
      id: 'lnx14-s-install', title: '安裝 crontab：使用者的 crontab、/etc/crontab 與 /etc/cron.d',
      blocks: [
        { type: 'p', text: '每個使用者都有自己的 crontab，以那個使用者的身分執行，不需要 root。它存放在 `/var/spool/cron/crontabs/使用者`（Debian／Ubuntu；RHEL 系是 `/var/spool/cron/使用者`），但不要直接編輯這個檔案，而是透過 `crontab` 指令：它先檢查每一行的語法，有任何一行錯誤就拒絕安裝整個檔案，全部正確才寫進去並讓 cron 知道。' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`crontab -e`', '用編輯器（`$EDITOR`）開啟自己的 crontab，存檔離開時檢查並安裝（模擬環境沒有編輯器，改用下一列的寫法）'],
          ['`crontab 檔案`', '把檔案的內容安裝成自己的 crontab，整份取代原本的內容'],
          ['`crontab -l`', '列出自己目前的 crontab；沒有時印出 `no crontab for 使用者`'],
          ['`crontab -r`', '刪除自己整份 crontab，不會再詢問'],
          ['`sudo crontab -u 使用者 -l`', 'root 查看別人的 crontab；一般使用者用 `-u` 會得到 `must be privileged to use -u`'],
        ] },
        { type: 'p', text: '系統層級的排程放在另外兩個地方，由 root 管理：`/etc/crontab` 與 `/etc/cron.d/` 裡的檔案。它們的格式多一個欄位：在五個時間欄位與指令之間，要寫「以哪個使用者執行」。套件常在 `/etc/cron.d/` 放自己的排程檔，管理員也可以照做；cron 會自己注意到這些檔案的變更，不需要 `crontab` 指令。`/etc/cron.d/` 裡的檔名只能有英文字母、數字、底線與連字號（Debian 沿用 run-parts 的規則），所以 `backup.cron` 這類帶點的名稱會被略過。' },
        { type: 'table', head: ['位置', '誰管理', '格式', '以誰的身分執行'], rows: [
          ['`/var/spool/cron/crontabs/使用者`', '使用者自己，透過 `crontab` 指令', '分 時 日 月 週 指令', 'crontab 的擁有者'],
          ['`/etc/crontab`', 'root，直接編輯', '分 時 日 月 週 使用者 指令', '每一行指定的使用者'],
          ['`/etc/cron.d/檔案`', 'root 或套件', '分 時 日 月 週 使用者 指令', '每一行指定的使用者'],
        ] },
        { type: 'p', text: 'crontab 裡除了工作，也可以寫 `變數=值` 的行，例如 `MAILTO=""`、`PATH=…`、`SHELL=/bin/bash`，套用到它後面的工作（下一節）。Ubuntu 的 `/etc/crontab` 每天早上執行 `/etc/cron.daily`、`cron.weekly`、`cron.monthly` 資料夾裡的程式（裝了 anacron 的機器改由 anacron 負責，錯過的會補執行）；模擬環境不執行這些資料夾。' },
        { type: 'p', text: '紀錄裡先故意寫一行錯誤的小時，`crontab` 拒絕安裝整個檔案，連正確的第一行也沒有裝上；修正後安裝成功。`crontab -l` 只印出內容，spool 裡的檔案多了三行「不要直接編輯」的標頭，屬於 learner、群組 crontab、權限 0600。最後的 `cron-next -l` 也是模擬環境的教學輔助，把使用者的 crontab、`/etc/crontab` 與 `/etc/cron.d` 的工作依下一次執行的時間排在一起，USER 欄就是系統排程檔多出來的那一欄。' },
        { type: 'example', id: 'lnx14-install' },
        { type: 'callout', tone: 'warning', title: '`crontab 檔案` 會取代整份 crontab', text: '`crontab 檔案` 不是「加入一行」，而是用檔案的內容覆蓋整份 crontab。只把新的一行寫進檔案再安裝，原本的每一個工作都會無聲無息地消失。要新增工作，先 `crontab -l > 檔案` 取出目前的內容，在後面加上新的一行，再 `crontab 檔案`；或直接用 `crontab -e`。另外 `-r` 和 `-e` 在鍵盤上相鄰，`crontab -r` 不詢問就刪掉整份 crontab，定期用 `crontab -l > ~/crontab.bak` 備份是好習慣。' },
      ],
    },
    {
      id: 'lnx14-s-env', title: 'cron 的環境、% 與排程輸出與通知',
      blocks: [
        { type: 'p', text: '在終端機裡跑得好好的指令稿，放進 crontab 卻失敗，最常見的原因是 cron 執行工作的環境和你的登入 Shell 不一樣。cron 不讀 `~/.bashrc` 或 `~/.profile`，只給工作一組很小的環境：' },
        { type: 'table', head: ['項目', 'cron 的工作', '你的登入 Shell'], rows: [
          ['Shell', '`/bin/sh`（Debian／Ubuntu 是 dash），可以用 `SHELL=` 改', '通常是 bash'],
          ['`PATH`', '只有 `/usr/bin:/bin`', '還包含 `/usr/local/bin`、`/usr/sbin` 等'],
          ['目前位置', '使用者的家目錄', '你 cd 到哪裡就在哪裡'],
          ['其他變數', '`HOME`、`LOGNAME` 等少數幾個，加上 crontab 裡寫的變數', '登入時設定的一切'],
          ['終端機', '沒有：不能互動輸入，輸出不會出現在任何畫面上', '有'],
        ] },
        { type: 'p', text: '所以 crontab 裡的指令稿與檔案一律寫絕對路徑：放在 `/usr/local/bin` 的 `report.sh`，在你的 Shell 找得到，在 cron 裡是 `not found`（結束碼 127）。也可以在 crontab 開頭寫一行 `PATH=/usr/local/bin:/usr/bin:/bin`。Debian／Ubuntu 的 cron 雖然透過 PAM 讀取 `/etc/environment`，但不會因此改掉上面的 `PATH`，要別的 `PATH` 只能寫在 crontab 裡。相對路徑從家目錄算起，例如 `cp data/app.db backups/` 指的是 `~/data/app.db`。' },
        { type: 'p', text: '第二個陷阱是 `%`。在 crontab 的指令欄裡，沒有用反斜線跳脫的 `%` 有特殊意義：第一個 `%` 結束指令，後面的文字成為指令的標準輸入，其餘每個 `%` 變成換行。指令稿裡常見的 `$(date +%F)` 寫進 crontab 就被切斷，Shell 只拿到 `… $(date +`，結果是語法錯誤。直接寫在 crontab 裡的 `%` 要寫成 `\\%`；或者把指令搬進指令稿，指令稿裡的 `%` 不受影響。' },
        { type: 'p', text: '第三個問題是輸出到哪裡去了。cron 收集工作的標準輸出與標準錯誤，用郵件寄給 crontab 的擁有者，或寄給 `MAILTO=` 指定的對象；`MAILTO=""` 表示不寄。但 Ubuntu 伺服器預設沒有安裝郵件伺服器（MTA），cron 只能把輸出丟掉，在日誌記一行 `(CRON) info (No MTA installed, discarding output)`。錯誤訊息就這樣消失，工作失敗了好幾個禮拜也沒有人知道。可靠的作法是替每個工作自己把輸出接到日誌檔：' },
        { type: 'list', items: [
          '`>> /home/learner/logs/report.log`：附加到日誌檔。用 `>>`，因為 `>` 每次都會清掉上一次的紀錄。',
          '`2>&1`：標準錯誤也進同一個檔案，而且要寫在 `>>` 之後（重新導向由左到右處理）。',
          'cron 自己會記錄每一次執行：`journalctl -u cron`（Ubuntu 的 `/var/log/syslog` 裡也有 `CRON[PID]: (使用者) CMD (指令)`），可以確認工作到底有沒有被執行。',
        ] },
        { type: 'p', text: '模擬環境的時鐘不會前進，排程永遠不會「自己到時間」執行。另一個教學輔助指令 `cron-run` 找出最早到期的一批工作，用 cron 的方式執行一次：工作的使用者、家目錄、`/usr/bin:/bin` 的 PATH、`%` 的處理、沒有 MTA 時丟掉輸出，並印出每個工作的結束碼與輸出的去向。它同樣不是真實的指令：真實系統上可以先把工作排在幾分鐘後，再看日誌與 `journalctl -u cron` 確認。紀錄中的三個工作同時在 02:30 到期：第一個找不到 `report.sh`，第二個寫進了日誌，第三個被 `%` 切斷，cron 的日誌也只記到 `$(date +` 為止；改成 `\\%` 之後備份才出現（`date` 印出的仍是固定時鐘的日期）。' },
        { type: 'example', id: 'lnx14-cron-env' },
        { type: 'callout', tone: 'tip', title: '讓失敗留下痕跡', text: '日誌檔只是第一步。指令稿開頭的 `set -euo pipefail` 讓任何一步失敗就以非零的結束碼結束，而不是帶著錯誤繼續往下做；在指令稿裡替每一行輸出加上 `$(date)` 的時間戳記（指令稿裡的 `%` 不受 crontab 影響），事後才對得上時間；需要有人收到通知時，安裝郵件程式並設定 `MAILTO=`，或讓指令稿在失敗時呼叫團隊的通知服務。' },
      ],
    },
    {
      id: 'lnx14-s-timezone', title: '時區與夏令時間',
      blocks: [
        { type: 'p', text: 'cron 與 systemd timer 都以機器的當地時間計算排程。`timedatectl` 的 `Time zone` 列說明機器設在哪個時區：這台批次主機是 Asia/Taipei（CST，UTC+8），所以 `30 2 * * *` 是台北時間 02:30，也就是 UTC 前一天的 18:30。同一行 crontab 搬到時區設為 UTC 的雲端主機上，就變成台北時間 10:30 執行。雲端的映像檔常預設為 UTC，接手一台機器時先確認時區，排程的時間才有意義。' },
        { type: 'p', text: 'cron 只看系統的時區。cronie（RHEL 系）支援在 crontab 裡寫 `CRON_TZ=Asia/Tokyo`，讓後面的工作改用另一個時區計算，但 Debian／Ubuntu 的 cron 不支援，寫了也照系統的時區計算。systemd timer 則可以在運算式的最後直接寫上時區，例如 `OnCalendar=*-*-* 02:30:00 UTC`。' },
        { type: 'p', text: '台灣目前沒有夏令時間，但歐洲、北美等地每年撥動兩次時鐘。以歐洲中部（Europe/Berlin）為例，三月最後一個星期日當地 02:00 直接跳到 03:00，十月最後一個星期日 03:00 撥回 02:00。凌晨兩、三點正好是最常排備份的時段：' },
        { type: 'table', head: ['那一天', '當地時間的變化', '`30 2 * * *` 的工作'], rows: [
          ['春天撥快', '02:00 直接變成 03:00，這天沒有 02:30', '原本的時刻不存在。Debian／Ubuntu 的 cron 對三小時以內的時間跳動有特別處理，會在調整之後盡快補執行；其他實作可能整天都不執行'],
          ['秋天撥慢', '03:00 變回 02:00，02:00–02:59 出現兩次', 'Debian／Ubuntu 的 cron 不會在重複的那一小時再執行一次；其他實作可能執行兩次'],
          ['任何一天', '—', '`*/10 * * * *` 這類在時或分欄用 `*` 的工作，依調整後的新時間照常執行'],
        ] },
        { type: 'p', text: '不同的 cron 實作與版本處理方式不同，最穩當的作法是不依賴它：伺服器使用 UTC（日誌與排程都不受夏令時間影響），或在有夏令時間的時區避開 01:00–03:00 這段可能被跳過或重複的時間；timer 則可以在 `OnCalendar=` 寫明 `UTC`。模擬環境的 `cron-next` 遇到被跳過的時刻直接略過，不模擬 Debian 的補執行，所以本課的機器都放在沒有夏令時間的 Asia/Taipei。' },
        { type: 'callout', tone: 'warning', title: '「伺服器的時間」不一定是你的時間', text: '常見的事故：管理員在台北寫下 `0 3 * * *`，以為備份在凌晨三點、流量最低的時候執行；但雲端主機的時區是 UTC，備份其實在台北時間上午 11 點的尖峰時段開始，拖慢了整個網站。排程之前先用 `timedatectl` 看時區，再用 `systemd-analyze calendar`（它同時列出當地時間與 UTC）或模擬環境的 `cron-next` 印出時間確認，再上線。' },
      ],
    },
    {
      id: 'lnx14-s-timer', title: 'systemd timer：.timer 與 .service 一組',
      blocks: [
        { type: 'p', text: 'systemd 的排程由兩個 unit 組成：`.service` 描述要做什麼（LNX10 的 service unit，執行完就結束的工作用 `Type=oneshot`），`.timer` 描述什麼時候做。timer 預設啟動同名的 service（`report.timer` → `report.service`），也可以用 `Unit=` 指定別的。service 通常沒有 `[Install]` 段，`is-enabled` 是 static；要 enable 的是 timer，它的 `[Install]` 寫 `WantedBy=timers.target`，開機時隨 timers.target 一起啟動。' },
        { type: 'table', head: ['檔案', '段落與鍵', '意義'], rows: [
          ['`report.service`', '`[Service]` 的 `Type=oneshot`', '執行一次就結束的工作；結束碼決定成功或失敗'],
          ['`report.service`', '`User=learner`、`ExecStart=/usr/local/bin/report.sh`', '以哪個帳號執行哪個程式（絕對路徑）'],
          ['`report.timer`', '`[Timer]` 的 `OnCalendar=Mon..Fri 07:00`', '依日曆時間觸發；可以寫好幾行'],
          ['`report.timer`', '`Persistent=true`', '把上次觸發的時間記在磁碟上；timer 啟動時（例如開機），如果停止期間錯過了應該觸發的時間，立刻補執行一次'],
          ['`report.timer`', '`[Install]` 的 `WantedBy=timers.target`', '`systemctl enable` 把它掛在 timers.target 底下'],
        ] },
        { type: 'p', text: '`OnCalendar=` 的完整格式是 `星期 年-月-日 時:分:秒`：省略星期表示每一天，省略日期等於 `*-*-*`，省略秒等於 `:00`。每一部分可以用 `*`、清單（`,`）、範圍（`..`，不是 cron 的 `-`，因為 `-` 已經用來分隔年月日）與重複（`/`）。和 cron 對照：' },
        { type: 'table', head: ['需求', 'cron', 'OnCalendar='], rows: [
          ['每天 00:00', '`0 0 * * *` 或 `@daily`', '`daily`（等於 `*-*-* 00:00:00`）'],
          ['平日 07:00', '`0 7 * * 1-5`', '`Mon..Fri 07:00`'],
          ['每月 1 日 03:00', '`0 3 1 * *`', '`*-*-01 03:00`'],
          ['每 15 分鐘', '`*/15 * * * *`', '`*:0/15`'],
          ['每個星期一 00:00', '`0 0 * * 1`', '`weekly`（等於 `Mon *-*-* 00:00:00`）'],
        ] },
        { type: 'p', text: '寫好之後用 `systemd-analyze calendar 運算式` 檢查：它印出原本的寫法、systemd 正規化後的完整形式、下一次觸發的當地時間與 UTC 時間，以及距離現在多久；寫錯時回報 `Failed to parse calendar specification`，`--iterations=N` 則列出接下來的 N 次。這是真實的 systemd 指令，不是模擬環境的輔助，修改 timer 之前先驗算是好習慣。' },
        { type: 'p', text: '管理 timer 仍然用 systemctl：`systemctl list-timers` 列出每個 timer 的下一次（NEXT、LEFT）與上一次（LAST、PASSED）觸發時間，沒有啟動的 timer 要加 `--all` 才會出現；`systemctl status x.timer` 的 `Trigger:` 列是下一次觸發。工作的輸出自動進入 journal：`journalctl -u report.service` 看得到每次執行的開始、指令稿印出的每一行與結束，`systemctl status report.service` 看得到上一次的結果，不需要自己導向日誌檔，也不會因為沒有 MTA 而消失。要立刻手動執行一次，用 `sudo systemctl start report.service`，帳號與環境和 timer 觸發時完全相同。' },
        { type: 'p', text: '紀錄裡的 report.timer 在星期四 07:00 觸發過後被停掉做維護，一直沒有重新啟動，也從來沒有 enable，所以星期五早上那一次被錯過了。`enable --now` 啟動它時，`Persistent=true` 發現停止期間有一次該觸發卻沒有觸發，立刻補執行一次服務：journal 與 reports 資料夾都看得到結果，LAST 變成現在，下一次是星期一 07:00。' },
        { type: 'example', id: 'lnx14-timer' },
        { type: 'callout', tone: 'warning', title: 'enable 的是 timer，不是 service', text: '`sudo systemctl enable report.service` 對沒有 `[Install]` 的 service 不會建立任何東西，`systemctl start report.service` 只會立刻執行一次，兩者都沒有建立排程；反過來，只 `start` timer 而沒有 `enable`，重新開機之後排程就不見了。正確的組合是 service 只寫要做的事、不加 `[Install]`，timer 寫 `WantedBy=timers.target`，然後 `sudo systemctl enable --now 名稱.timer`，再用 `systemctl list-timers` 確認 NEXT 欄有時間。' },
      ],
    },
    {
      id: 'lnx14-s-choose', title: 'cron 還是 timer？避免重疊執行',
      blocks: [
        { type: 'p', text: '兩套工具都能完成大部分的排程，差別在周邊的能力：' },
        { type: 'table', head: ['考量', 'cron', 'systemd timer'], rows: [
          ['設定', '一行就好，一般使用者也能用自己的 crontab', '兩個 unit 檔；系統層級的 timer 需要 root（另有 `systemctl --user` 的使用者 timer）'],
          ['輸出與日誌', '寄信或丟掉，要自己導向日誌檔', '自動進 journal，`journalctl -u` 與 `systemctl status` 看得到輸出與結果'],
          ['錯過的執行', '關機時錯過就錯過（anacron 只補 cron.daily 等資料夾）', '`Persistent=true` 在開機或啟動時補執行'],
          ['重疊執行', '上一次還沒結束，下一次照樣啟動，要自己用 flock 擋', '同一個 service 還在執行時，timer 不會再啟動第二個'],
          ['執行環境', '精簡的環境，容易和手動測試時不同', '和 `systemctl start` 手動執行完全相同；可以使用 unit 的相依、資源限制與 `OnFailure=` 通知'],
          ['可攜性', '幾乎每個 Unix 系統都有', '只在使用 systemd 的系統上'],
        ] },
        { type: 'p', text: '經驗法則：個人的小工作、需要在各種系統上通用的工作，用 cron 就好；伺服器上重要的維運工作（備份、清理、報表），特別是需要可靠的日誌、補執行或避免重疊的，用 timer。不論選哪一個，真正做事的都應該是一支可以單獨手動執行、失敗時回傳非零結束碼的指令稿，排程只負責「什麼時候」。' },
        { type: 'p', text: '還有一個問題兩邊都要考慮：工作比間隔還長時會重疊。每 30 分鐘一次的同步，遇到大量資料跑了 45 分鐘，下一次啟動時上一次還在執行，兩個行程同時搬同一批檔案，結果可能是重複、遺失或損毀的資料。cron 不會替你擋，標準的解法是 util-linux 的 `flock`：' },
        { type: 'table', head: ['寫法', '鎖被別的行程持有時'], rows: [
          ['`flock -n 鎖檔 指令`', '不等待，立刻放棄，不執行指令，結束碼 1（可以用 `-E` 改成別的值）'],
          ['`flock -w 秒數 鎖檔 指令`', '最多等待指定的秒數，還拿不到就放棄'],
          ['`flock 鎖檔 指令`', '一直等到鎖被釋放才執行，排隊的行程可能越積越多'],
        ] },
        { type: 'p', text: 'flock 先打開鎖檔（不存在就建立）並加上鎖，再執行指令，指令結束時鎖就釋放；即使指令被 kill 或當掉，行程結束時核心也會釋放鎖，不會像自己寫的 PID 檔那樣留下過期的狀態。鎖檔本身留在磁碟上是正常的，它存在不代表被鎖住。放進 crontab 的寫法是 `*/30 * * * * flock -n /var/lock/sync.lock /usr/local/bin/sync.sh >> 日誌檔 2>&1`。紀錄中 PID 2210 的封存同步從 16:00 跑到現在，還持有 `/var/lock/archive.lock`：`flock -n` 立刻以結束碼 1 放棄，不加 `-n` 的 flock 則會一直等下去；換成沒有人持有的鎖，指令照常執行，鎖檔也被建立了。' },
        { type: 'example', id: 'lnx14-flock' },
        { type: 'callout', tone: 'tip', title: 'timer 已經避免了同一個服務重疊', text: 'timer 到期時，如果它的 service 還在執行，systemd 不會再啟動第二個，所以只由一個 timer 觸發的工作不需要 flock。但同一支指令稿如果也會被手動執行、被 cron 呼叫，或兩個不同的服務會處理同一批資料，仍然要用 flock 讓它們彼此排除。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx14-q1', prompt: 'Debian／Ubuntu 的 cron 中，`0 3 1 * 1` 這一行什麼時候執行？',
      options: ['只在剛好是星期一的每月 1 日 03:00', '每月 1 日的 01:03，以及每個星期一的 01:03', '每月 1 日的 03:00，以及每個星期一的 03:00', '每個星期一的 01:00 到 03:00 之間每小時一次'],
      answer: 2,
      explanation: '日與週兩欄都有限制（都不是以 `*` 開頭）時，Vixie cron 採 OR，任一個符合就執行，所以是每月 1 日加上每個星期一，時間都是 03:00（分 0、時 3）。「剛好是星期一的 1 日」是把規則誤當成 AND；01:03 把分與時的順序弄反了；這一行沒有任何範圍或步進，不會每小時執行。',
    },
    {
      id: 'lnx14-q2', prompt: '`backup.sh` 放在 `/usr/local/bin`，在終端機輸入 `backup.sh` 可以執行；crontab 裡寫 `15 2 * * * backup.sh`，cron 的日誌顯示工作有執行，但結束碼是 127。最可能的原因是？',
      options: ['cron 的 PATH 只有 `/usr/bin:/bin`，找不到放在 `/usr/local/bin` 的 `backup.sh`', '指令稿沒有執行權限', 'crontab 的時間欄位寫錯，工作根本沒有被執行', '使用者的 crontab 一律以 root 執行，root 不能執行 `/usr/local/bin` 的程式'],
      answer: 0,
      explanation: '127 是「找不到指令」：cron 給工作的 PATH 只有 /usr/bin:/bin，不包含登入 Shell 有的 /usr/local/bin，所以 crontab 要寫絕對路徑，或在 crontab 開頭設定 PATH=。沒有執行權限是 126，不是 127；日誌已經記錄了執行，表示時間欄位沒有錯；使用者的 crontab 以擁有者的身分執行，不是 root，而 root 也能執行 /usr/local/bin 的程式。',
    },
    {
      id: 'lnx14-q3', prompt: 'crontab 裡寫 `0 1 * * * tar -czf /srv/backup/home-$(date +%F).tar.gz /home`，這個工作每天都失敗。原因是？',
      options: ['cron 用的 `/bin/sh` 不支援 `$( )` 命令替換', '`date` 不在 cron 的 PATH 裡', 'crontab 裡的路徑必須用相對路徑', '沒有跳脫的 `%` 結束了指令，後面的文字變成標準輸入，Shell 拿到的指令被切斷了'],
      answer: 3,
      explanation: 'crontab 的指令欄裡，第一個沒有跳脫的 % 結束指令，後面的文字成為標準輸入，所以 Shell 只拿到 `tar -czf /srv/backup/home-$(date +`，是語法錯誤；要寫成 `\\%F`，或把指令搬進指令稿。/bin/sh 是 POSIX Shell，$( ) 可以正常使用；date 在 /usr/bin，cron 的 PATH 找得到；crontab 反而建議一律寫絕對路徑。',
    },
    {
      id: 'lnx14-q4', prompt: '一台沒有安裝郵件伺服器（MTA）的 Ubuntu 伺服器上，crontab 的工作 `30 2 * * * /usr/local/bin/sync.sh` 印出了錯誤訊息。這些訊息會到哪裡？',
      options: ['顯示在下一次登入的終端機上', '被丟掉，cron 只在日誌記一行 No MTA installed, discarding output', '自動寫進 `/var/log/cron-output.log`', '寫進使用者家目錄的 `nohup.out`'],
      answer: 1,
      explanation: 'cron 把工作的標準輸出與錯誤寄給 crontab 的擁有者或 MAILTO 指定的對象，沒有 MTA 時只能丟掉，並在日誌記錄 No MTA installed, discarding output，所以要在指令後面加上 `>> 日誌檔 2>&1` 自己保留。工作沒有終端機，輸出不會出現在任何畫面上；cron 不會自動建立輸出的日誌檔；nohup.out 是 nohup 指令的行為，和 cron 無關。',
    },
    {
      id: 'lnx14-q5', prompt: '你寫好了 `cleanup.service`（`Type=oneshot`，沒有 `[Install]`）與 `cleanup.timer`（`OnCalendar=daily`、`WantedBy=timers.target`）。要讓清理每天執行，而且重新開機後仍然有效，應該執行？',
      options: ['`sudo systemctl enable --now cleanup.timer`', '`sudo systemctl enable --now cleanup.service`', '`sudo systemctl start cleanup.timer`', '`sudo systemctl start cleanup.service`'],
      answer: 0,
      explanation: 'enable --now 把 timer 掛到 timers.target（開機時啟動），並且現在就開始等待觸發，到時間再啟動同名的 service。enable service 沒有作用：它沒有 [Install]，是 static，排程也不會因此建立；只 start timer，重新開機後排程就消失；start service 只立刻執行一次清理，沒有任何排程。',
    },
    {
      id: 'lnx14-q6', prompt: 'timer 設定了 `OnCalendar=*-*-* 02:00:00` 與 `Persistent=true`，而且已經 enable。機器在 01:30 關機，08:00 才重新開機。會發生什麼事？',
      options: ['什麼都不做，等到明天 02:00 才執行', '開機後每分鐘重試一次，直到成功為止', '從 02:00 到 08:00 錯過的每一分鐘各補執行一次', 'timer 在開機啟動時發現錯過了 02:00 那一次，立刻補執行一次服務'],
      answer: 3,
      explanation: 'Persistent=true 讓 systemd 把上次觸發的時間記在磁碟上；timer 啟動時若發現停止期間有應該觸發卻沒觸發的時間，就立刻觸發一次服務，錯過幾次都只補一次。沒有 Persistent=（預設 false）才會等到明天 02:00；timer 沒有失敗重試的行為；OnCalendar= 是 02:00 一個時刻，不是每分鐘，也不會逐分鐘補。',
    },
    {
      id: 'lnx14-q7', prompt: 'crontab 中有 `*/30 * * * * flock -n /var/lock/sync.lock /usr/local/bin/sync.sh`。某次同步跑了 45 分鐘，30 分鐘後下一次到期時會怎樣？',
      options: ['第二個 sync.sh 照常啟動，兩個一起執行', '第二次排隊等待，第一次結束後立刻執行', 'flock 拿不到鎖，立刻放棄，不執行 sync.sh，結束碼 1', 'flock 刪掉鎖檔後重新執行 sync.sh'],
      answer: 2,
      explanation: '第一次執行仍持有鎖；-n 表示不等待，拿不到鎖就立刻以結束碼 1 放棄，所以第二次不會執行，等下一個 30 分鐘再試。沒有 flock 才會兩個一起執行；不加 -n 的 flock 才會排隊等待；flock 從不刪除鎖檔，鎖跟著持有它的行程，鎖檔存在本身不代表被鎖住。',
    },
    {
      id: 'lnx14-q8', prompt: '一台時區為 Europe/Berlin 的 Ubuntu 伺服器，crontab 有 `30 2 * * * /usr/local/bin/backup.sh`。關於三月最後一個星期日（當地 02:00 直接跳到 03:00），下列敘述何者正確？',
      options: ['cron 一律以 UTC 計算，所以完全不受影響', '那天當地沒有 02:30；Debian／Ubuntu 的 cron 會在時間調整後盡快補執行，其他實作不一定如此', '那天的 02:30 會出現兩次，備份會執行兩次', 'cron 會自動把工作提前到 01:30 執行'],
      answer: 1,
      explanation: '春天撥快時 02:00–02:59 被跳過，02:30 不存在；Debian／Ubuntu 的 cron 對三小時以內的跳動會補執行，但這是實作的細節，最穩當的是讓伺服器使用 UTC，或避開 01:00–03:00。cron 依系統的當地時區計算，不是 UTC；時間重複、可能執行兩次的是秋天撥慢的那一天；cron 不會把工作提前。',
    },
  ],
  terminal: {
    machines: [batchHost, uploadHost, mediaHost],
    examples: [
      {
        id: 'lnx14-fields', title: '五個欄位與下一次執行', machine: 'batch',
        description: '`timedatectl` 確認時區是 Asia/Taipei、現在是星期日 18:00；教學輔助 `cron-next` 列出平日 02:15、`*/15` 在 2 點的四次、`9-17/4` 的步進、日與週的 OR（每月 1 日加上每個星期一）、以 `*/2` 開頭時改回 AND、`@daily`，以及不合法的小時。',
        steps: [
          { command: 'timedatectl', output: '               Local time: Sun 2026-11-22 18:00:00 CST\n           Universal time: Sun 2026-11-22 10:00:00 UTC\n                 RTC time: Sun 2026-11-22 10:00:00\n                Time zone: Asia/Taipei (CST, +0800)\nSystem clock synchronized: yes\n              NTP service: active\n          RTC in local TZ: no' },
          { command: 'cron-next -n 3 "15 2 * * 1-5"', output: 'Mon 2026-11-23 02:15:00 CST\nTue 2026-11-24 02:15:00 CST\nWed 2026-11-25 02:15:00 CST' },
          { command: 'cron-next -n 5 "*/15 2 * * *"', output: 'Mon 2026-11-23 02:00:00 CST\nMon 2026-11-23 02:15:00 CST\nMon 2026-11-23 02:30:00 CST\nMon 2026-11-23 02:45:00 CST\nTue 2026-11-24 02:00:00 CST' },
          { command: 'cron-next -n 3 "0 9-17/4 * * *"', output: 'Mon 2026-11-23 09:00:00 CST\nMon 2026-11-23 13:00:00 CST\nMon 2026-11-23 17:00:00 CST' },
          { command: 'cron-next -n 4 "0 9 1 * mon"', output: 'Mon 2026-11-23 09:00:00 CST\nMon 2026-11-30 09:00:00 CST\nTue 2026-12-01 09:00:00 CST\nMon 2026-12-07 09:00:00 CST' },
          { command: 'cron-next -n 3 "0 9 */2 * mon"', output: 'Mon 2026-11-23 09:00:00 CST\nMon 2026-12-07 09:00:00 CST\nMon 2026-12-21 09:00:00 CST' },
          { command: 'cron-next -n 2 @daily', output: 'Mon 2026-11-23 00:00:00 CST\nTue 2026-11-24 00:00:00 CST' },
          { command: 'cron-next "15 26 * * *"', output: 'cron-next: bad hour' },
        ],
      },
      {
        id: 'lnx14-install', title: '安裝 crontab 與系統的排程檔', machine: 'batch',
        description: '檔案的第二行寫了 `0 25`，crontab 拒絕安裝整個檔案；修正後安裝，spool 裡的檔案屬於 learner、群組 crontab、權限 0600；`/etc/crontab` 與 `/etc/cron.d` 多一個使用者欄位；教學輔助 `cron-next -l` 把所有工作依下一次執行排列。',
        steps: [
          { command: 'crontab -l', output: 'no crontab for learner' },
          { command: 'echo "0 7 * * 1-5 /usr/local/bin/report.sh" > report.cron', output: '' },
          { command: 'echo "0 25 * * 1-5 /usr/local/bin/backup.sh" >> report.cron', output: '' },
          { command: 'crontab report.cron', output: '"report.cron":2: bad hour\nerrors in crontab file, can\'t install.' },
          { command: 'crontab -l', output: 'no crontab for learner' },
          { command: 'echo "0 7 * * 1-5 /usr/local/bin/report.sh" > report.cron', output: '' },
          { command: 'crontab report.cron', output: '' },
          { command: 'crontab -l', output: '0 7 * * 1-5 /usr/local/bin/report.sh' },
          { command: 'sudo ls -l /var/spool/cron/crontabs', output: '-rw------- learner crontab   222 learner' },
          { command: 'cat /etc/crontab', output: '# /etc/crontab: system-wide crontab\n# Unlike a user\'s crontab, this file and the files in /etc/cron.d\n# have a user name field between the time and the command.\n\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n# m h dom mon dow user  command\n25 6    * * *   root    cd / && run-parts --report /etc/cron.daily\n47 6    * * 7   root    cd / && run-parts --report /etc/cron.weekly\n52 6    1 * *   root    cd / && run-parts --report /etc/cron.monthly' },
          { command: 'cat /etc/cron.d/export-cleanup', output: '# remove old CSV exports every night\nMAILTO=""\n40 3 * * * root /usr/local/sbin/clean-exports.sh' },
          { command: 'cron-next -l', output: 'NEXT                         USER     SOURCE                      SCHEDULE     COMMAND\nMon 2026-11-23 03:40:00 CST  root     /etc/cron.d/export-cleanup  40 3 * * *   /usr/local/sbin/clean-exports.sh\nMon 2026-11-23 06:25:00 CST  root     /etc/crontab                25 6 * * *   cd / && run-parts --report /etc/cron.daily\nMon 2026-11-23 07:00:00 CST  learner  crontab (learner)           0 7 * * 1-5  /usr/local/bin/report.sh\nSun 2026-11-29 06:47:00 CST  root     /etc/crontab                47 6 * * 7   cd / && run-parts --report /etc/cron.weekly\nTue 2026-12-01 06:52:00 CST  root     /etc/crontab                52 6 1 * *   cd / && run-parts --report /etc/cron.monthly' },
        ],
      },
      {
        id: 'lnx14-cron-env', title: 'cron 的環境、% 與輸出的去向', machine: 'batch',
        description: '三個在 02:30 到期的工作：只寫檔名的找不到指令（127），寫絕對路徑並導向日誌的成功，含 `%` 的被切斷（2），沒有 MTA 時錯誤訊息被丟掉；cron 的日誌記錄了被切斷的指令；改成 `\\%` 之後備份才出現。`cron-run` 是教學輔助，時鐘不前進。',
        steps: [
          { command: 'cat jobs.cron', output: '# night jobs: install with  crontab jobs.cron\n30 2 * * * report.sh\n30 2 * * * /usr/local/bin/report.sh >> /home/learner/logs/report.log 2>&1\n30 2 * * * cp data/app.db backups/app-$(date +%F).db' },
          { command: 'crontab jobs.cron', output: '' },
          { command: 'cron-run', output: 'cron-run（教學輔助）：模擬 Mon 2026-11-23 02:30:00 CST 到期的 3 個工作；機器的時鐘不前進\n[learner] report.sh\n  結束碼 127；輸出 1 行：沒有安裝郵件伺服器（MTA），cron 捨棄了輸出\n[learner] /usr/local/bin/report.sh >> /home/learner/logs/report.log 2>&1\n  結束碼 0；沒有輸出\n[learner] cp data/app.db backups/app-$(date +%F).db\n  結束碼 2；輸出 1 行：沒有安裝郵件伺服器（MTA），cron 捨棄了輸出' },
          { command: 'cat logs/report.log', output: 'report sales-2026-11-22.txt written' },
          { command: 'ls backups', output: '' },
          { command: 'journalctl -u cron -o cat', output: '(learner) CMD (report.sh)\n(CRON) info (No MTA installed, discarding output)\n(learner) CMD (/usr/local/bin/report.sh >> /home/learner/logs/report.log 2>&1)\n(learner) CMD (cp data/app.db backups/app-$(date +)\n(CRON) info (No MTA installed, discarding output)' },
          { command: 'echo \'30 2 * * * cp data/app.db backups/app-$(date +\\%F).db\' > fixed.cron', output: '' },
          { command: 'crontab fixed.cron', output: '' },
          { command: 'cron-run', output: 'cron-run（教學輔助）：模擬 Mon 2026-11-23 02:30:00 CST 到期的 1 個工作；機器的時鐘不前進\n[learner] cp data/app.db backups/app-$(date +\\%F).db\n  結束碼 0；沒有輸出' },
          { command: 'ls backups', output: 'app-2026-11-22.db' },
        ],
      },
      {
        id: 'lnx14-timer', title: 'timer 與 service：OnCalendar、Persistent 與 journal', machine: 'batch',
        description: 'report.timer 與 report.service 是一組；`systemd-analyze calendar` 驗算 OnCalendar=；timer 停了幾天也沒有 enable，`enable --now` 時 Persistent=true 補執行錯過的那一次，結果在 journal 與 reports 資料夾裡；service 是 static，enable 的是 timer。',
        steps: [
          { command: 'systemctl cat report.timer report.service', output: '# /etc/systemd/system/report.timer\n[Unit]\nDescription=Sales report on weekday mornings\n\n[Timer]\nOnCalendar=Mon..Fri 07:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n\n# /etc/systemd/system/report.service\n[Unit]\nDescription=Daily sales report\n\n[Service]\nType=oneshot\nUser=learner\nExecStart=/usr/local/bin/report.sh' },
          { command: 'systemd-analyze calendar "Mon..Fri 07:00" daily', output: '  Original form: Mon..Fri 07:00\nNormalized form: Mon..Fri *-*-* 07:00:00\n    Next elapse: Mon 2026-11-23 07:00:00 CST\n       (in UTC): Sun 2026-11-22 23:00:00 UTC\n       From now: 13h left\n\n  Original form: daily\nNormalized form: *-*-* 00:00:00\n    Next elapse: Mon 2026-11-23 00:00:00 CST\n       (in UTC): Sun 2026-11-22 16:00:00 UTC\n       From now: 6h left' },
          { command: 'systemctl list-timers --all', output: 'NEXT LEFT LAST                        PASSED     UNIT         ACTIVATES\n-    -    Thu 2026-11-19 07:00:00 CST 3 days ago report.timer report.service\n\n1 timers listed.' },
          { command: 'sudo systemctl enable --now report.timer', output: 'Created symlink /etc/systemd/system/timers.target.wants/report.timer → /etc/systemd/system/report.timer.' },
          { command: 'systemctl list-timers', output: 'NEXT                        LEFT LAST                        PASSED UNIT         ACTIVATES\nMon 2026-11-23 07:00:00 CST 13h  Sun 2026-11-22 18:00:00 CST now    report.timer report.service\n\n1 timers listed.\nPass --all to see loaded but inactive timers, too.' },
          { command: 'journalctl -u report.service -o cat', output: 'Starting report.service - Daily sales report...\nreport sales-2026-11-22.txt written\nreport.service: Deactivated successfully.\nFinished report.service - Daily sales report.' },
          { command: 'ls reports', output: 'sales-2026-11-22.txt' },
          { command: 'systemctl status report.timer', output: '● report.timer - Sales report on weekday mornings\n     Loaded: loaded (/etc/systemd/system/report.timer; enabled; preset: enabled)\n     Active: active (waiting) since Sun 2026-11-22 18:00:00 CST; now\n    Trigger: Mon 2026-11-23 07:00:00 CST; 13h left\n   Triggers: ● report.service\n\nNov 22 18:00:00 batch-01 systemd[1]: Started report.timer - Sales report on weekday mornings.' },
          { command: 'systemctl is-enabled report.timer report.service', output: 'enabled\nstatic' },
        ],
      },
      {
        id: 'lnx14-flock', title: '用 flock -n 避免重疊執行', machine: 'batch',
        description: 'PID 2210 的封存同步還持有鎖：`flock -n` 立刻以結束碼 1 放棄，不加 `-n` 會一直等下去；沒有人持有的鎖則照常執行指令並建立鎖檔。',
        steps: [
          { command: 'pgrep -af sync-archive', output: '2210 /bin/bash /usr/local/bin/sync-archive.sh' },
          { command: 'flock -n /var/lock/archive.lock /usr/local/bin/sync-archive.sh', output: '' },
          { command: 'echo $?', output: '1' },
          { command: 'flock /var/lock/archive.lock /usr/local/bin/sync-archive.sh', output: 'flock: 模擬環境：/var/lock/archive.lock 的鎖被 PID 2210（bash）持有，flock 會一直等下去；請用 -n（拿不到鎖就放棄）或 -w 秒數' },
          { command: 'flock -n /var/lock/report.lock /usr/local/bin/report.sh', output: 'report sales-2026-11-22.txt written' },
          { command: 'echo $?', output: '0' },
          { command: 'ls -l /var/lock', output: '-rw-r--r-- learner learner     0 archive.lock\n-rw-r--r-- learner learner     0 report.lock' },
        ],
      },
    ],
    exercises: [
      {
        id: 'lnx14-weekday-backup', title: '平日 02:15 的備份', machine: 'batch',
        statement: 'batch-01 上的 `/usr/local/bin/backup.sh` 會把 `~/data/app.db` 複製到 `~/backups`，並印出一行結果。請用 learner 自己的 crontab 排程它：星期一到星期五的 02:15 執行，指令寫絕對路徑，並把標準輸出與標準錯誤都附加到 `/home/learner/logs/backup.log`。安裝之後，用教學輔助指令 `cron-run` 模擬下一次到期的執行，確認日誌檔裡出現備份的訊息（模擬的時鐘不前進，訊息中的日期仍是今天）。',
        checks: [
          { kind: 'cron', user: 'learner', source: 'crontab', schedule: '15 2 * * 1-5', command: '/usr/local/bin/backup.sh' },
          { kind: 'cron', user: 'learner', source: 'crontab', schedule: '15 2 * * 1-5', command: 'backup.log' },
          { kind: 'content', path: `${HOME}/logs/backup.log`, content: 'backup app-2026-11-22.db ok\n' },
        ],
        solution: [`echo "${BACKUP_LINE}" > backup.cron`, 'crontab backup.cron', 'crontab -l', 'cron-next -n 3 "15 2 * * 1-5"', 'cron-run', 'cat logs/backup.log'],
        mistakes: [
          { commands: ['echo "2 15 * * 1-5 /usr/local/bin/backup.sh >> /home/learner/logs/backup.log 2>&1" > backup.cron', 'crontab backup.cron', 'cron-run'], why: '分與時寫反了：`2 15 * * 1-5` 是平日的 15:02，在白天流量最高的時候備份，而且下一次到期的不是 02:15。' },
          { commands: ['echo "*/15 2 * * 1-5 /usr/local/bin/backup.sh >> /home/learner/logs/backup.log 2>&1" > backup.cron', 'crontab backup.cron', 'cron-run'], why: '`*/15` 在分欄是「每 15 分鐘」：平日的 02:00、02:15、02:30、02:45 各備份一次，不是只在 02:15 執行。' },
          { commands: ['echo "15 2 1-5 * * /usr/local/bin/backup.sh >> /home/learner/logs/backup.log 2>&1" > backup.cron', 'crontab backup.cron', 'cron-run'], why: '`1-5` 放在第三欄（日），變成每月 1 到 5 日的 02:15，和星期幾無關，週末也會執行。' },
          { commands: ['echo "15 2 * * 1-5 /usr/local/bin/backup.sh" > backup.cron', 'crontab backup.cron', 'cron-run'], why: '沒有導向日誌：這台主機沒有 MTA，cron 把備份的輸出與任何錯誤訊息都丟掉了，日誌檔根本沒有被建立。' },
          { commands: [`echo "${BACKUP_LINE}" > backup.cron`, 'cron-run'], why: '只寫了檔案，沒有用 `crontab backup.cron` 安裝，cron 不知道有這個工作，`cron-run` 執行的是別的工作。' },
        ],
        hints: [
          '時間欄位依序是「分 時 日 月 週」，星期一到星期五是第五欄的 `1-5`。',
          '先用 `echo "…" > backup.cron` 寫好一行，再 `crontab backup.cron` 安裝；安裝前可以用 `cron-next -n 3 "…"` 驗算時間。',
          '`>> 日誌檔 2>&1` 同時保存輸出與錯誤；沒有導向時，這台沒有 MTA 的主機會把輸出丟掉。',
        ],
        explanation: '`15 2 * * 1-5 /usr/local/bin/backup.sh >> /home/learner/logs/backup.log 2>&1` 的分是 15、時是 2、日與月不限、週是 1-5；`crontab backup.cron` 檢查並安裝它，`cron-next` 列出星期一、二、三的 02:15。`cron-run` 以 cron 的環境在星期一 02:15 執行它，`backup app-2026-11-22.db ok` 寫進了日誌檔，而不是被丟掉。真實系統上沒有 cron-run，可以在第一次執行之後檢查日誌檔，並用 `journalctl -u cron` 找 CMD 的紀錄確認工作有被執行。',
      },
      {
        id: 'lnx14-timer-pair', title: '每天清理一次的 timer', machine: 'upload',
        statement: 'upload-01 上沒傳完的上傳檔會堆在 `/srv/uploads/tmp`，清理用的指令稿 `/usr/local/bin/cleanup-uploads.sh` 已經寫好。請建立一組 systemd timer。`/etc/systemd/system/cleanup-uploads.service` 依序是這 7 行：`[Unit]`、`Description=Remove partial uploads`、空行、`[Service]`、`Type=oneshot`、`User=www-data`、`ExecStart=/usr/local/bin/cleanup-uploads.sh`。`/etc/systemd/system/cleanup-uploads.timer` 依序是這 9 行：`[Unit]`、`Description=Remove partial uploads every day`、空行、`[Timer]`、`OnCalendar=daily`、`Persistent=true`、空行、`[Install]`、`WantedBy=timers.target`。然後讓排程現在就開始等待、以後開機也自動生效（enable 的是 timer，不是 service）。機器沒有編輯器，可以用 `echo -e "…" | sudo tee 檔案` 寫檔。',
        checks: [
          { kind: 'content', path: CLEANUP_SERVICE_PATH, content: lines(...CLEANUP_SERVICE) },
          { kind: 'content', path: CLEANUP_TIMER_PATH, content: lines(...CLEANUP_TIMER) },
          { kind: 'timer', unit: 'cleanup-uploads.timer', active: true, enabled: true, next: '2026-11-23 00:00:00' },
        ],
        solution: [teeUnit(CLEANUP_SERVICE_PATH, CLEANUP_SERVICE), teeUnit(CLEANUP_TIMER_PATH, CLEANUP_TIMER), 'sudo systemctl daemon-reload', 'systemd-analyze calendar daily',
          'sudo systemctl enable --now cleanup-uploads.timer', 'systemctl list-timers'],
        mistakes: [
          { commands: [teeUnit(CLEANUP_SERVICE_PATH, CLEANUP_SERVICE), teeUnit(CLEANUP_TIMER_PATH, CLEANUP_TIMER), 'sudo systemctl daemon-reload', 'sudo systemctl enable --now cleanup-uploads.service'], why: 'enable 的是 service：它沒有 `[Install]`，systemctl 只印出「沒有安裝設定」的說明，timer 從來沒有啟動，排程沒有建立。' },
          { commands: [teeUnit(CLEANUP_SERVICE_PATH, CLEANUP_SERVICE), teeUnit(CLEANUP_TIMER_PATH, CLEANUP_TIMER), 'sudo systemctl daemon-reload', 'sudo systemctl start cleanup-uploads.timer'], why: 'timer 現在在等待，但沒有 enable：`timers.target.wants` 裡沒有它的連結，下次重新開機之後排程就不見了。' },
          { commands: [teeUnit(CLEANUP_SERVICE_PATH, CLEANUP_SERVICE), teeUnit(CLEANUP_TIMER_PATH, CLEANUP_TIMER.filter(r => !r.startsWith('Persistent='))), 'sudo systemctl daemon-reload', 'sudo systemctl enable --now cleanup-uploads.timer'], why: 'timer 少了 `Persistent=true`：午夜剛好在關機或重新開機時，那一天的清理就被跳過，不會補執行。' },
          { commands: [teeUnit(CLEANUP_TIMER_PATH, CLEANUP_TIMER), 'sudo systemctl enable --now cleanup-uploads.timer'], why: '只寫了 timer，沒有寫 service：timer 要觸發的 cleanup-uploads.service 不存在，systemd 拒絕啟動這個 timer，排程沒有生效。' },
        ],
        hints: [
          '`echo -e` 會把 `\\n` 變成換行；`| sudo tee 路徑` 以 root 寫入 /etc 底下的檔案。',
          'service 沒有 `[Install]`，是 static；要 enable 的是 `cleanup-uploads.timer`。',
          '`enable --now` 同時處理開機與現在；最後用 `systemctl list-timers` 確認 NEXT 是明天的 00:00。',
        ],
        explanation: '兩個檔案寫好之後，`sudo systemctl daemon-reload` 讓 systemd 讀入新的設定（修改既有的 unit 之後一定要做，新建時做也無妨），`systemd-analyze calendar daily` 確認 daily 是每天 00:00，`sudo systemctl enable --now cleanup-uploads.timer` 在 `timers.target.wants` 建立連結並開始等待；`list-timers` 的 NEXT 是 Mon 2026-11-23 00:00:00 CST。到時間時 timer 啟動 cleanup-uploads.service，以 www-data 執行指令稿，輸出進入 `journalctl -u cleanup-uploads.service`；機器在午夜關機時，Persistent=true 讓下次開機補執行一次。',
      },
      {
        id: 'lnx14-next-elapse', title: '算出 OnCalendar 的下三次', machine: 'batch',
        statement: '同事打算把報表改到平日的 06:30，寫成 `OnCalendar=Mon..Fri *-*-* 06:30:00`。請在 batch-01 上用 `systemd-analyze calendar` 列出這個運算式接下來 3 次觸發的時間（加上 `--iterations=3`，運算式照原樣寫在雙引號裡），讓同事確認週末不會執行。檢查時會換成另外兩個時刻的時鐘（星期五晚上、星期二早上）重新執行你的指令，所以要真的執行指令，而不是把時間打出來。',
        checks: [{ kind: 'output' }],
        solution: ['systemd-analyze calendar --iterations=3 "Mon..Fri *-*-* 06:30:00"'],
        mistakes: [
          { commands: ['systemd-analyze calendar "Mon..Fri *-*-* 06:30:00"'], why: '少了 `--iterations=3`：只印出下一次觸發，看不出接下來幾天的時間，也就無法確認週末有沒有被跳過。' },
          { commands: ['cron-next -n 3 "30 6 * * 1-5"'], why: '`cron-next` 是模擬環境的教學輔助，算的是 cron 運算式，輸出也沒有 systemd 的正規化形式與 UTC 時間；題目要的是 systemd 自己對 OnCalendar= 的計算。' },
          { commands: ['systemd-analyze calendar --iterations=3 "*-*-* 06:30:00"'], why: '運算式少了 `Mon..Fri`：`*-*-* 06:30:00` 是每天，在星期五晚上的時鐘下，下一次會是星期六。' },
        ],
        variants: [{ label: '星期五晚上的時鐘', files: [], now: '2026-11-27 12:00:00' }, { label: '星期二早上的時鐘', files: [], now: '2026-11-23 23:00:00' }],
        hints: [
          '寫法是 `systemd-analyze calendar --iterations=N "運算式"`。',
          '輸出同時列出當地時間（CST）與 UTC，From now 是距離現在多久。',
          '`cron-next` 只算 cron 的運算式；這題要的是 systemd 的計算。',
        ],
        explanation: '`systemd-analyze calendar --iterations=3 "Mon..Fri *-*-* 06:30:00"` 在星期日 18:00 印出星期一、二、三的 06:30；換成星期五晚上的時鐘，下一次直接跳到下星期一，證明週末不會觸發。每一次都附上 UTC 時間（前一天的 22:30），方便和其他時區的同事對時間。這是真實系統上檢查 OnCalendar= 的標準作法：修改 timer 之前先驗算，比上線後等著看可靠。',
      },
      {
        id: 'lnx14-flock-photos', title: '照片同步不要疊在一起', machine: 'media',
        statement: 'media-02 上的 `/usr/local/bin/sync-photos.sh` 把新上傳的照片搬進圖庫，大量上傳時一次可能超過 30 分鐘。請在 learner 的 crontab 加上一個每 30 分鐘（每小時的 00 分與 30 分）執行的工作：用 `flock -n /var/lock/photos.lock` 包住 `/usr/local/bin/sync-photos.sh`，讓上一次還沒結束時新的一次直接放棄，並把輸出與錯誤附加到 `/home/learner/logs/photos.log`。learner 原本的每週摘要工作必須保留。現在正好有一次同步（PID 3105）還在執行，不要結束它；安裝之後可以用教學輔助 `cron-run` 看看下一次到期時會發生什麼事。',
        checks: [
          { kind: 'cron', user: 'learner', source: 'crontab', schedule: '*/30 * * * *', command: 'flock -n /var/lock/photos.lock /usr/local/bin/sync-photos.sh' },
          { kind: 'cron', user: 'learner', source: 'crontab', schedule: '*/30 * * * *', command: 'photos.log' },
          { kind: 'cron', user: 'learner', source: 'crontab', schedule: '0 8 * * 1', command: '/usr/local/bin/weekly-summary.sh' },
          { kind: 'process', pid: 3105, name: 'bash' },
        ],
        solution: ['crontab -l', 'pgrep -af sync-photos', 'crontab -l > photos.cron', `echo "${PHOTOS_LINE}" >> photos.cron`, 'crontab photos.cron', 'crontab -l', 'cron-run'],
        mistakes: [
          { commands: [`echo "${PHOTOS_LINE}" > photos.cron`, 'crontab photos.cron'], why: '新的一行用 `>` 寫進檔案再安裝：`crontab 檔案` 取代了整份 crontab，原本每週一 08:00 的摘要工作消失了。' },
          { commands: ['crontab -l > photos.cron', 'echo "*/30 * * * * /usr/local/bin/sync-photos.sh >> /home/learner/logs/photos.log 2>&1" >> photos.cron', 'crontab photos.cron'], why: '沒有 flock：上一次同步還在執行時，下一次照樣啟動，兩個行程同時搬同一批照片。' },
          { commands: ['crontab -l > photos.cron', 'echo "*/30 * * * * flock /var/lock/photos.lock /usr/local/bin/sync-photos.sh >> /home/learner/logs/photos.log 2>&1" >> photos.cron', 'crontab photos.cron'], why: '少了 `-n`：flock 會一直等到鎖被釋放，排隊的同步越積越多，上一次結束後再一個接一個地執行。' },
          { commands: ['crontab -l > photos.cron', `echo "${PHOTOS_LINE}" >> photos.cron`, 'crontab photos.cron', 'kill 3105', 'cron-run'], why: '工作安裝對了，卻結束了正在執行的同步（PID 3105）：搬到一半的照片可能遺失或不完整。flock 的目的是讓新的一次讓路，不是中斷舊的一次。' },
          { commands: ['crontab -l > photos.cron', 'echo "30 * * * * flock -n /var/lock/photos.lock /usr/local/bin/sync-photos.sh >> /home/learner/logs/photos.log 2>&1" >> photos.cron', 'crontab photos.cron'], why: '`30 * * * *` 是每小時的 30 分執行，一小時只有一次；每 30 分鐘是 `*/30`（或 `0,30`）。' },
        ],
        hints: [
          '先 `crontab -l` 看看現有的工作：`crontab 檔案` 會取代整份 crontab。',
          '`crontab -l > photos.cron` 取出原本的內容，再用 `echo "…" >> photos.cron` 加上新的一行。',
          'flock 的寫法是 `flock -n 鎖檔 指令`；每 30 分鐘是分欄的 `*/30`。',
        ],
        explanation: '`crontab -l > photos.cron` 保留原本的每週摘要，`>>` 加上 `*/30 * * * * flock -n /var/lock/photos.lock /usr/local/bin/sync-photos.sh >> /home/learner/logs/photos.log 2>&1`，再 `crontab photos.cron` 安裝。`cron-run` 模擬 18:30 那一次：PID 3105 仍持有鎖，flock 立刻以結束碼 1 放棄，沒有第二個同步和它搶同一批檔案。等 3105 結束，鎖自動釋放，下一個半點的同步就會正常執行。',
      },
    ],
  },
};
