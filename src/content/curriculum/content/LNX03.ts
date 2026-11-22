import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { LessonContent } from '../schema';

/*
 * LNX03 The Linux Filesystem Hierarchy (LNX-1). A terminal lesson on the files profile: one web-shop server, shop-01,
 * laid out after the FHS (/bin as a link to usr/bin, /etc, /var/log, /home, /root, /tmp, /opt, /srv, empty /dev and
 * /proc) with six mounts (/, udev on /dev, tmpfs on /tmp, /var, a separate PostgreSQL disk on /var/lib/postgresql and
 * /srv). Every transcript output was produced by replaying it on the engine. Host, users and files are made up.
 */

const dir = (path: string, owner = 'root', mode = 0o755, group?: string): TerminalFile => ({ path, kind: 'dir', mode, owner, ...(group ? { group } : {}) });
const file = (path: string, content: string, owner = 'root', mode = 0o644, group?: string): TerminalFile => ({ path, kind: 'file', mode, owner, content, ...(group ? { group } : {}) });
const link = (path: string, target: string): TerminalFile => ({ path, kind: 'link', mode: 0o777, owner: 'root', target });

const BANNER = '<svg xmlns="http://www.w3.org/2000/svg">\n' + '<text>小島商店新品上市</text>\n'.repeat(150) + '</svg>\n';

const server: TerminalMachine = {
  id: 'shop', title: '網路商店伺服器 shop-01', user: 'kai', host: 'shop-01', cwd: '/home/kai', profile: 'files',
  mounts: [
    { path: '/', device: '/dev/vda1', type: 'ext4', size: 30832548, used: 6012340 },
    { path: '/dev', device: 'udev', type: 'devtmpfs', size: 1985944, used: 0 },
    { path: '/tmp', device: 'tmpfs', type: 'tmpfs', size: 2013516, used: 48 },
    { path: '/var', device: '/dev/vdb1', type: 'xfs', size: 20961280, used: 3145728 },
    { path: '/var/lib/postgresql', device: '/dev/vdc1', type: 'ext4', size: 51290592, used: 18874368 },
    { path: '/srv', device: '/dev/vdd1', type: 'ext4', size: 102626232, used: 2097152 },
  ],
  files: [
    link('/bin', 'usr/bin'),
    dir('/dev'),
    dir('/etc'),
    file('/etc/hostname', 'shop-01\n'),
    file('/etc/hosts', '127.0.0.1 localhost\n127.0.1.1 shop-01\n'),
    file('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\n'),
    dir('/etc/nginx'),
    file('/etc/nginx/nginx.conf', 'user www-data;\nworker_processes auto;\nerror_log /var/log/nginx/error.log;\n'),
    dir('/home'),
    dir('/home/kai', 'kai', 0o750),
    file('/home/kai/.bashrc', 'alias ll="ls -l"\n', 'kai'),
    dir('/home/kai/.ssh', 'kai', 0o700),
    file('/home/kai/notes.txt', 'nginx 設定：/etc/nginx\n網站檔案：/srv/www/shop\n', 'kai'),
    dir('/home/mei', 'mei', 0o750),
    dir('/opt'),
    dir('/opt/monitor'),
    dir('/opt/monitor/bin'),
    file('/opt/monitor/bin/agent', '', 'root', 0o755),
    dir('/proc', 'root', 0o555),
    dir('/root', 'root', 0o700),
    link('/sbin', 'usr/sbin'),
    dir('/srv'),
    dir('/srv/www'),
    dir('/srv/www/shop', 'www-data'),
    file('/srv/www/shop/index.html', '<!doctype html>\n<title>小島商店</title>\n<h1>歡迎光臨</h1>\n', 'www-data'),
    dir('/srv/www/shop/css', 'www-data'),
    file('/srv/www/shop/css/site.css', 'body { font-family: sans-serif; }\n', 'www-data'),
    dir('/srv/www/shop/img', 'www-data'),
    file('/srv/www/shop/img/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><text>小島</text></svg>\n', 'www-data'),
    file('/srv/www/shop/img/banner.svg', BANNER, 'www-data'),
    dir('/tmp', 'root', 0o777),
    file('/tmp/upload-7f3a.part', 'partial upload\n', 'www-data'),
    dir('/usr'),
    dir('/usr/bin'),
    ...['bash', 'cp', 'df', 'du', 'ls', 'python3'].map(n => file(`/usr/bin/${n}`, '', 'root', 0o755)),
    dir('/usr/sbin'),
    file('/usr/sbin/nginx', '', 'root', 0o755),
    dir('/var'),
    dir('/var/lib'),
    dir('/var/lib/postgresql', 'postgres'),
    dir('/var/lib/postgresql/16', 'postgres'),
    dir('/var/lib/postgresql/16/main', 'postgres', 0o700),
    dir('/var/log'),
    file('/var/log/syslog', 'Nov 22 08:00:01 shop-01 systemd[1]: Started nginx.service.\n', 'syslog', 0o640, 'adm'),
    dir('/var/log/nginx'),
    file('/var/log/nginx/access.log', '203.0.113.7 - - "GET / HTTP/1.1" 200 512\n'.repeat(40), 'www-data', 0o640, 'adm'),
    file('/var/log/nginx/error.log', '', 'www-data', 0o640, 'adm'),
  ],
};


/** Exercise 3's variants: one more banner (40K in all) and a smaller banner (28K). */
const SALE = '<svg xmlns="http://www.w3.org/2000/svg">\n' + '<text>限時特價</text>\n'.repeat(200) + '</svg>\n';
const SMALL_BANNER = '<svg xmlns="http://www.w3.org/2000/svg"><text>新品</text></svg>\n';

const terminal: NonNullable<LessonContent['terminal']> = {
  machines: [server],
  examples: [
    {
      id: 'lnx03-tour', title: '從根目錄看起', machine: 'shop',
      description: '`ls /` 列出最上層的目錄；`/bin` 是指向 `usr/bin` 的連結；`/etc` 放設定、`/var/log` 放日誌；`/root` 只有 root 能進去。',
      steps: [
        { command: 'ls /', output: 'bin@  dev/  etc/  home/  opt/  proc/  root/  sbin@  srv/  tmp/  usr/  var/' },
        { command: 'ls -l /bin', output: 'lrwxrwxrwx root    root        7 /bin -> usr/bin' },
        { command: 'ls /etc', output: 'hostname  hosts  nginx/  os-release' },
        { command: 'ls /var/log', output: 'nginx/  syslog' },
        { command: 'ls /root', output: 'ls: cannot open directory \'/root\': Permission denied' },
      ],
    },
    {
      id: 'lnx03-paths', title: '用相對路徑移動', machine: 'shop',
      description: '從家目錄往上兩層到 `/`，再往下走到 nginx 的日誌；`..` 回到上一層；`~` 回家；沒有 `/` 開頭的 `var/log` 是從目前位置找起。',
      steps: [
        { command: 'pwd', output: '/home/kai' },
        { command: 'cd ../../var/log/nginx', output: '' },
        { command: 'pwd', output: '/var/log/nginx' },
        { command: 'cd ..', output: '' },
        { command: 'ls', output: 'nginx/  syslog' },
        { command: 'cd ../../srv/www/shop', output: '' },
        { command: 'pwd', output: '/srv/www/shop' },
        { command: 'cd ~', output: '' },
        { command: 'cd var/log', output: 'bash: cd: var/log: No such file or directory' },
        { command: 'pwd', output: '/home/kai' },
      ],
    },
    {
      id: 'lnx03-ls', title: 'ls 的四個選項', machine: 'shop',
      description: '`-a` 顯示隱藏項目，`-l` 顯示權限、擁有者、群組與大小，`-h` 把大小換成 K、M、G，`-d` 顯示目錄本身而不是它的內容。',
      steps: [
        { command: 'ls', output: 'notes.txt' },
        { command: 'ls -a', output: '.  ..  .bashrc  .ssh/  notes.txt' },
        { command: 'ls -la', output: 'drwxr-x--- kai     kai      4096 .\ndrwxr-xr-x root    root     4096 ..\n-rw-r--r-- kai     kai        17 .bashrc\ndrwx------ kai     kai      4096 .ssh/\n-rw-r--r-- kai     kai        55 notes.txt' },
        { command: 'ls -lh /var/log/nginx', output: '-rw-r----- www-data adm      1.7K access.log\n-rw-r----- www-data adm         0 error.log' },
        { command: 'ls -l /srv/www', output: 'drwxr-xr-x www-data www-data  4096 shop/' },
        { command: 'ls -ld /srv/www /tmp', output: 'drwxr-xr-x root    root     4096 /srv/www/\ndrwxrwxrwx root    root     4096 /tmp/' },
      ],
    },
    {
      id: 'lnx03-df', title: '這台機器掛了哪些檔案系統', machine: 'shop',
      description: '`df -h` 以易讀的單位列出每個掛載點，`-T` 加上檔案系統類型；指定路徑時，`df` 只列出那個路徑所在的檔案系統。',
      steps: [
        { command: 'df -h', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vda1        30G  5.8G   24G  20% /\nudev            1.9G     0  1.9G   0% /dev\ntmpfs           2.0G   48K  2.0G   1% /tmp\n/dev/vdb1        20G  3.0G   17G  16% /var\n/dev/vdc1        49G   18G   31G  37% /var/lib/postgresql\n/dev/vdd1        98G  2.0G   96G   3% /srv' },
        { command: 'df -T', output: 'Filesystem     Type     1K-blocks     Used Available Use% Mounted on\n/dev/vda1      ext4      30832548  6012340  24820208  20% /\nudev           devtmpfs   1985944        0   1985944   0% /dev\ntmpfs          tmpfs      2013516       48   2013468   1% /tmp\n/dev/vdb1      xfs       20961280  3145728  17815552  16% /var\n/dev/vdc1      ext4      51290592 18874368  32416224  37% /var/lib/postgresql\n/dev/vdd1      ext4     102626232  2097152 100529080   3% /srv' },
        { command: 'df -h /var/log/nginx', output: 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/vdb1        20G  3.0G   17G  16% /var' },
        { command: 'df /srv/www/shop/img', output: 'Filesystem     1K-blocks    Used Available Use% Mounted on\n/dev/vdd1      102626232 2097152 100529080   3% /srv' },
      ],
    },
    {
      id: 'lnx03-du', title: '一個目錄占了多少空間', machine: 'shop',
      description: '`du -sh` 只印出總和，`du -h` 也列出每個子目錄，`du -a` 連檔案也列出；和 `ls -l` 的位元組數比較，看出 du 算的是區塊。讀不了的目錄，du 會報錯並少算。',
      steps: [
        { command: 'du -sh /srv/www/shop', output: '32K\t/srv/www/shop' },
        { command: 'du -h /srv/www/shop', output: '8.0K\t/srv/www/shop/css\n16K\t/srv/www/shop/img\n32K\t/srv/www/shop' },
        { command: 'du -a /srv/www/shop', output: '4\t/srv/www/shop/css/site.css\n8\t/srv/www/shop/css\n8\t/srv/www/shop/img/banner.svg\n4\t/srv/www/shop/img/logo.svg\n16\t/srv/www/shop/img\n4\t/srv/www/shop/index.html\n32\t/srv/www/shop' },
        { command: 'ls -l /srv/www/shop/img', output: '-rw-r--r-- www-data www-data  5748 banner.svg\n-rw-r--r-- www-data www-data    66 logo.svg' },
        { command: 'du -sh /var/log', output: '16K\t/var/log' },
        { command: 'du -sh /var/lib/postgresql', output: 'du: cannot read directory \'/var/lib/postgresql/16/main\': Permission denied\n12K\t/var/lib/postgresql' },
      ],
    },
  ],
  exercises: [
    {
      id: 'lnx03-to-images', title: '用相對路徑走到圖片目錄', machine: 'shop',
      statement: '你登入後在家目錄 `/home/kai`。只用相對路徑（不以 `/` 或 `~` 開頭）切換到網站的圖片目錄 `/srv/www/shop/img`，可以一次走完，也可以分幾步走。',
      checks: [{ kind: 'cwd', path: '/srv/www/shop/img' }],
      solution: ['cd ../../srv/www/shop/img'],
      mistakes: [
        { commands: ['cd ../srv/www/shop/img'], why: '只往上一層到了 /home，/home 底下沒有 srv：從 /home/kai 要往上兩層才是 /。' },
        { commands: ['cd srv/www/shop/img'], why: '沒有 / 開頭的路徑從目前的目錄算起，家目錄裡沒有 srv。' },
        { commands: ['cd ../../srv/www/shop'], why: '少走了最後一層，停在網站目錄，不是圖片目錄。' },
      ],
      hints: ['先用 `pwd` 確認起點；數一數從 /home/kai 到 / 要往上幾層。', '`../..` 從 /home/kai 回到 /，接著往下寫 srv/www/shop/img。'],
      explanation: '/home/kai 的上一層是 /home，再上一層是 /，所以 `../../srv/www/shop/img` 正好是 /srv/www/shop/img；提示字元會變成 `kai@shop-01:/srv/www/shop/img$`。分兩步的 `cd ../..` 再 `cd srv/www/shop/img` 結果相同。絕對路徑 `cd /srv/www/shop/img` 也會到，但在相鄰的深層目錄之間（例如從 img 到 css 用 `cd ../css`），相對路徑短得多。',
    },
    {
      id: 'lnx03-which-mount', title: '資料庫的資料在哪個掛載點', machine: 'shop',
      statement: 'PostgreSQL 的資料放在 `/var/lib/postgresql/16/main`。查出這個目錄位在哪一個掛載點（df 的 `Mounted on` 欄），把掛載點的路徑寫進家目錄的 `mount.txt`，例如 `echo 路徑 > mount.txt`。',
      checks: [{ kind: 'content', path: '/home/kai/mount.txt', content: '/var/lib/postgresql\n' }],
      solution: ['df /var/lib/postgresql/16/main', 'echo /var/lib/postgresql > mount.txt'],
      mistakes: [
        { commands: ['echo /var > mount.txt'], why: '/var 也是掛載點，但 /var/lib/postgresql 是更深的掛載點：路徑屬於包含它的最長掛載點。' },
        { commands: ['echo /dev/vdc1 > mount.txt'], why: '/dev/vdc1 是 Filesystem 欄的裝置名稱，題目要的是 Mounted on 欄的掛載點。' },
        { commands: ['echo / > mount.txt'], why: '以為整棵樹都在根目錄的檔案系統上：/var/lib/postgresql 掛的是另一顆磁碟。' },
      ],
      hints: ['`df 路徑` 只列出那個路徑所在的檔案系統，看最後一欄。', '`df` 只需要能走到這個路徑，不需要讀得到 main 目錄的內容。'],
      explanation: '`df /var/lib/postgresql/16/main` 只印出一列：/dev/vdc1 掛在 /var/lib/postgresql。掛載表裡 /、/var、/var/lib/postgresql 都是這個路徑的開頭，df 選最長的那一個，所以資料庫的資料存在 /dev/vdc1 上；即使 /var 滿了，資料庫的磁碟也不受影響，反之亦然。',
    },
    {
      id: 'lnx03-shop-size', title: '網站目錄的總用量', machine: 'shop',
      statement: '用 `du` 印出網站目錄 `/srv/www/shop` 的總用量：只要一行總和，大小以 K、M、G 表示，路徑照 `/srv/www/shop` 寫（不加結尾的 `/`）。檢查時會換上另外兩組網站檔案重新執行，直接打出看到的數字不會通過。',
      checks: [{ kind: 'output' }],
      solution: ['du -sh /srv/www/shop'],
      variants: [
        { label: '多了一張特價橫幅', files: [{ path: '/srv/www/shop/img/sale.svg', kind: 'file', mode: 0o644, owner: 'www-data', content: SALE }] },
        { label: '橫幅換成較小的版本', files: [{ path: '/srv/www/shop/img/banner.svg', kind: 'file', mode: 0o644, owner: 'www-data', content: SMALL_BANNER }] },
      ],
      mistakes: [
        { commands: ['du -h /srv/www/shop'], why: '沒有 -s，每個子目錄各印一行，題目只要最後的總和。' },
        { commands: ['du -s /srv/www/shop'], why: '沒有 -h，大小是 1K 區塊的數字，不是 K、M、G。' },
        { commands: ['df -h /srv/www/shop'], why: 'df 回報的是整個 /srv 檔案系統的用量，不是這個目錄。' },
        { commands: ['du -sh /srv/www/shop/img'], why: '只算了圖片目錄，漏了 index.html 與 css。' },
      ],
      hints: ['`-s` 只印總和，`-h` 換成易讀的單位，兩個選項可以寫在一起。'],
      explanation: '`du -sh /srv/www/shop` 走過整個目錄，把每個目錄的 4K 與每個檔案進位後的區塊加起來：原本是 32K，多了 sale.svg 變成 40K，換成小橫幅則是 28K。`df` 看的是檔案系統，無論目錄裡多了什麼檔案，模擬機器的掛載表都不變，所以回答不了「這個目錄多大」。',
    },
  ],
};

export const LNX03: LessonContent = {
  lessonId: 'LNX03',
  motivation: '第一次登入公司的伺服器 shop-01，主管交代三件事：找到 nginx 的設定檔、看看網站的日誌、確認磁碟還夠不夠用。Linux 沒有 C 槽、D 槽，所有東西都在一棵從 / 開始的目錄樹上，而且幾乎每個發行版都照同一套 FHS 規則擺放：設定在 /etc、日誌在 /var/log、使用者的檔案在 /home。認得這張地圖，換到哪一台伺服器都能很快找到要的東西。本課先走一遍 FHS 的主要目錄，再用 pwd、cd、ls 以絕對與相對路徑在樹上移動，最後認識「掛載」：一棵樹其實由好幾個檔案系統拼成，用 df 看每個檔案系統的空間，用 du 看一個目錄占了多少。',
  sections: [
    {
      id: 'fhs', title: '一棵從 / 開始的樹：FHS',
      blocks: [
        { type: 'p', text: 'Linux 的檔案都放在同一棵目錄樹上，最上層是根目錄 /。不論資料在哪一顆磁碟、哪一個分割區，都會接在這棵樹的某個目錄底下，所以路徑永遠從 / 開始寫，沒有 Windows 的 C:、D: 這種磁碟代號。哪些東西該放在哪個目錄，由 FHS（Filesystem Hierarchy Standard，檔案系統階層標準）規範：它的前身是 1994 年的 FSSTND，目前的 3.0 版由 Linux Foundation 在 2015 年發布。各發行版大致遵循 FHS，只在細節上略有差異。' },
        { type: 'p', text: 'FHS 用兩個問題替資料分類：會不會變動（static／variable），以及能不能和其他機器共用（shareable／unshareable）。程式本身安裝後不會變，放在 /usr；本機的設定不常變但每台不同，放在 /etc；執行中不斷增加的日誌、快取與資料庫，放在 /var。下表是 shop-01 這台網路商店伺服器上的主要目錄：' },
        { type: 'table', head: ['目錄', '放什麼', 'shop-01 上的例子'], rows: [
          ['/', '根目錄，整棵樹的起點', '其他目錄都在它底下'],
          ['/bin、/usr/bin', '一般使用者也會用的指令', 'ls、cp、df、du、python3；/bin 是指向 usr/bin 的連結'],
          ['/sbin、/usr/sbin', '系統管理用的指令與服務程式', 'nginx'],
          ['/etc', '這台機器的設定檔，多半是純文字', '/etc/hostname、/etc/nginx/nginx.conf'],
          ['/var', '執行時會變動的資料', '/var/lib/postgresql（資料庫的資料）'],
          ['/var/log', '日誌', 'syslog、nginx/access.log、nginx/error.log'],
          ['/home', '一般使用者的家目錄，每人一個', '/home/kai、/home/mei'],
          ['/root', '系統管理員 root 的家目錄（不在 /home 底下）', '權限 700，只有 root 能進入'],
          ['/tmp', '暫存檔，所有人都能寫入，重新開機後可能被清空', 'upload-7f3a.part'],
          ['/opt', '額外安裝的套件，每個套件一個子目錄', '/opt/monitor（監控程式）'],
          ['/srv', '這台機器對外提供服務的資料', '/srv/www/shop（網站檔案）'],
          ['/usr', '安裝的程式、函式庫與文件，平時唯讀', '/usr/bin、/usr/sbin'],
          ['/dev', '裝置檔：磁碟、終端機等硬體或虛擬裝置', '/dev/vda1（第一顆磁碟的第一個分割區）、/dev/null'],
          ['/proc', '核心即時產生的虛擬檔案系統，呈現行程與核心的資訊', '/proc/cpuinfo、/proc/meminfo、每個行程一個 /proc/<PID>'],
        ] },
        { type: 'p', text: '下面的紀錄從根目錄看起。模擬器在目錄名稱後面加 /、在連結名稱後面加 @（和 ls -F 的慣例相同），所以 bin@ 是連結。早期的 Linux 把開機必需的指令放在 /bin、其他放在 /usr/bin；較新的 Fedora、Debian、Ubuntu、Arch 等發行版已把兩者合併，/bin 只是指向 usr/bin 的符號連結（LNX04 會介紹連結）。/root 的權限只允許 root 自己進入，一般使用者 kai 連列出內容都不行：' },
        { type: 'example', id: 'lnx03-tour' },
        { type: 'callout', tone: 'note', title: '/dev 與 /proc 不在磁碟上', text: '/dev 裡的檔案代表裝置，例如讀寫 /dev/vda1 就是直接讀寫那個分割區，寫進 /dev/null 的資料會被丟掉；/proc 的內容是核心在你讀取的那一刻產生的，cat /proc/meminfo 看到的是當下的記憶體用量，不占任何磁碟空間。這兩個目錄由核心在開機時建立，模擬機器裡是空的，只保留目錄本身。' },
        { type: 'p', text: '真實的伺服器還有幾個常見目錄：/boot 放核心與開機程式，/lib（多半也指向 /usr/lib）放函式庫，/run 放開機後才產生的執行狀態，/sys 是另一個核心產生的虛擬檔案系統，/mnt 與 /media 用來臨時掛載磁碟或隨身碟。本課的機器沒有列出它們。' },
      ],
    },
    {
      id: 'paths', title: '絕對路徑與相對路徑：pwd 與 cd',
      blocks: [
        { type: 'p', text: '每個 Shell 都有一個目前的工作目錄（working directory），pwd（print working directory）印出它的完整路徑，提示字元裡冒號後面的部分也是它，只是把家目錄縮寫成 ~。以 / 開頭的路徑是絕對路徑，從根目錄一路寫到目標，不管現在在哪裡都指向同一個地方；不以 / 開頭的是相對路徑，從目前的工作目錄算起。cd 切換工作目錄：cd 路徑 移到那裡，只打 cd 或 cd ~ 回到家目錄。' },
        { type: 'p', text: '相對路徑靠三個特別的名稱：. 是目前的目錄，.. 是上一層目錄（每個目錄都有這兩個項目，ls -a 看得到），~ 是你的家目錄。~ 由 Shell 在執行指令前換成家目錄的絕對路徑，所以 kai 的 ~ 是 /home/kai，root 的 ~ 是 /root。在 / 執行 cd .. 仍然停在 /，因為根目錄沒有上一層。假設目前在 /var/log：' },
        { type: 'table', head: ['寫法', '種類', '在 /var/log 時指向'], rows: [
          ['/etc/nginx', '絕對路徑', '/etc/nginx'],
          ['nginx', '相對路徑：目前目錄裡的 nginx', '/var/log/nginx'],
          ['./nginx', '相對路徑：. 是目前目錄', '/var/log/nginx'],
          ['..', '相對路徑：上一層', '/var'],
          ['../lib/postgresql', '相對路徑：上一層裡的 lib/postgresql', '/var/lib/postgresql'],
          ['../../etc', '相對路徑：上兩層裡的 etc', '/etc'],
          ['~/notes.txt', '從家目錄算起（Shell 先換成絕對路徑）', '/home/kai/notes.txt'],
        ] },
        { type: 'p', text: '下面的紀錄從家目錄出發：/home/kai 往上兩層是 /，所以 ../../var/log/nginx 就是 /var/log/nginx。每次 cd 之後提示字元都跟著改變，可以隨時確認自己在哪裡：' },
        { type: 'example', id: 'lnx03-paths' },
        { type: 'callout', tone: 'warning', title: 'var/log 不是 /var/log', text: '很多人以為路徑一定從根目錄算起，在家目錄打 cd var/log，得到 No such file or directory。少了開頭的 /，Shell 會在目前的目錄裡找 var，也就是 /home/kai/var/log。同樣地，在 /srv/www/shop 打 cd etc/nginx 找的是 /srv/www/shop/etc/nginx。看到「找不到」時，先用 pwd 確認自己在哪裡，再決定要寫絕對路徑，還是用 .. 往上走幾層。' },
        { type: 'p', text: '兩種寫法各有用處：寫進設定檔、排程或腳本的路徑用絕對路徑，不會因為從哪裡執行而改變意思；在終端機裡於相鄰的目錄之間移動，相對路徑比較短，例如在 /srv/www/shop/img 裡，cd ../css 就到了同一個網站的 css 目錄。' },
      ],
    },
    {
      id: 'ls', title: '用 ls 看清楚目錄：-l、-a、-h、-d',
      blocks: [
        { type: 'p', text: 'ls 列出目錄的內容，沒有參數時列出目前的目錄。名稱以 . 開頭的是隱藏項目，平常不顯示，家目錄裡的 .bashrc（Shell 的設定）與 .ssh（SSH 金鑰的目錄）都是。選項可以合併成一個，例如 -la、-lh、-ld：' },
        { type: 'table', head: ['選項', '作用', '常見用法'], rows: [
          ['-l', '每項一行：權限、擁有者、群組、大小（位元組）、名稱', '看誰能讀寫、檔案多大'],
          ['-a', '也列出以 . 開頭的隱藏項目，以及 . 與 ..', '找 .bashrc、.ssh 這類設定'],
          ['-h', '和 -l 一起用，大小以 K、M、G 表示', 'ls -lh /var/log/nginx 看日誌多大'],
          ['-d', '列出目錄本身，而不是目錄裡的東西', 'ls -ld /tmp 看 /tmp 自己的權限'],
        ] },
        { type: 'p', text: '在 -l 的輸出裡，第一欄的 d 表示目錄、- 表示一般檔案、l 表示連結，後面九個字元是擁有者、群組、其他人的讀寫執行權限（LNX07 會詳細說明）。真實的 ls -l 還有連結數與修改時間兩欄，模擬器省略了。下面的紀錄比較 ls -l /srv/www 與 ls -ld /srv/www：前者列出目錄裡的 shop（屬於 www-data），後者列出 /srv/www 本身（屬於 root）：' },
        { type: 'example', id: 'lnx03-ls' },
        { type: 'callout', tone: 'tip', title: '想看目錄的權限，要加 -d', text: 'ls -l /tmp 會列出 /tmp 裡的每個檔案，看不到 /tmp 自己的權限與擁有者；ls -ld /tmp 才是 /tmp 本身。真實系統上 /tmp 的權限是 drwxrwxrwt，最後的 t 是 sticky bit：大家都能在裡面建立檔案，但只能刪除自己的檔案。模擬器只顯示 rwx 三種權限，所以這裡是 drwxrwxrwx。' },
      ],
    },
    {
      id: 'mounts', title: '掛載：一棵樹由好幾個檔案系統組成',
      blocks: [
        { type: 'p', text: '磁碟或分割區要先格式化成檔案系統（例如 ext4、xfs），再掛載（mount）到樹上的某個目錄，這個目錄稱為掛載點。掛載之後，掛載點底下的每個檔案都存在那個檔案系統上。shop-01 有四顆虛擬磁碟：系統裝在掛載到 / 的 /dev/vda1，/var、/var/lib/postgresql 與 /srv 各自掛一顆。另外 /dev 是核心管理的 devtmpfs，/tmp 是放在記憶體裡的 tmpfs，重新開機就清空。' },
        { type: 'p', text: '把 /var 與 /srv 分開掛載是伺服器常見的規劃：日誌暴增塞滿 /var 時，/ 仍有空間，系統還能正常登入與執行；網站與資料庫的資料放在較大的資料碟，重灌系統時不受影響，也可以單獨擴充。df 讀取掛載表，每個檔案系統印一行：' },
        { type: 'table', head: ['欄位', '意義'], rows: [
          ['Filesystem', '裝置名稱，例如 /dev/vdb1；tmpfs、udev 這類沒有實體裝置'],
          ['Type（-T）', '檔案系統類型：ext4、xfs、tmpfs、devtmpfs'],
          ['1K-blocks 或 Size（-h）', '總容量；沒有 -h 時以 1K 區塊為單位'],
          ['Used、Available／Avail', '已用與剩下的空間'],
          ['Use%', '使用率，接近 100% 就要處理'],
          ['Mounted on', '掛載點：這個檔案系統接在樹上的哪個目錄'],
        ] },
        { type: 'p', text: '-h 以 1024 為底換成 K、M、G（例如 30832548 個 1K 區塊約 30G），方便閱讀；精確的數字用不加 -h 的 df。df 後面接路徑時，只列出那個路徑所在的檔案系統：/var/log/nginx 在 /var，網站的圖片在 /srv：' },
        { type: 'example', id: 'lnx03-df' },
        { type: 'p', text: '一個路徑屬於「包含它的最長掛載點」。/var/lib/postgresql/16/main 的開頭同時符合 /、/var 與 /var/lib/postgresql，最長的是 /var/lib/postgresql，所以資料庫的資料存在 /dev/vdc1，不是 /var 的 /dev/vdb1；/home/kai 只符合 /，所以家目錄在 /dev/vda1 上。df 只需要能走到這個路徑，不需要讀得到目錄的內容。' },
        { type: 'callout', tone: 'warning', title: '/var 是 / 的子目錄，空間卻不共用', text: '常見的誤解是「/var 在 / 底下，所以 / 還有空間，/var 就寫得進去」。/var 掛的是另一個檔案系統，有自己的容量：df 顯示 /var 的 Use% 到了 100% 時，寫日誌的程式就會失敗，即使 / 還剩 24G 也沒有幫助；刪除 /home 裡的檔案也只會釋放 / 的空間。判斷「這裡還有沒有空間」，要用 df 路徑 看那個路徑實際所在的檔案系統。' },
        { type: 'callout', tone: 'note', title: '真實的 df 還有更多', text: '真實伺服器的 df 通常還會列出 /run、/boot 等更多 tmpfs 與分割區；/proc 這類沒有容量的虛擬檔案系統預設不顯示。ext4 預設保留 5% 的空間給 root，所以真實的 Used 加 Avail 會比 Size 小；模擬機器沒有保留空間，Avail 就是 Size 減 Used。掛載表的數字是固定的，不會因為你在模擬器裡建立檔案而改變。' },
      ],
    },
    {
      id: 'du', title: 'du：一個目錄占了多少空間',
      blocks: [
        { type: 'p', text: 'df 回答「整個檔案系統用了多少」，du（disk usage）回答「這個目錄用了多少」：它走過目錄底下的每一層，把占用的空間加起來，先印子目錄，最後印目錄本身的總和。最常用的是 du -sh 目錄：-s 只印總和，-h 以 K、M、G 表示；-a 連檔案也逐一列出。' },
        { type: 'table', head: ['', 'df', 'du'], rows: [
          ['看的對象', '整個檔案系統（掛載點）', '一個目錄或檔案'],
          ['資料來源', '檔案系統自己記錄的用量', '逐一走過目錄裡的每個檔案'],
          ['需要的權限', '能走到路徑即可', '要能讀取並進入底下的每個目錄'],
          ['典型問題', '/var 還剩多少空間？', '網站目錄有多大？哪個子目錄最大？'],
        ] },
        { type: 'p', text: 'du 算的是磁碟區塊，不是檔案的位元組數。檔案系統以區塊為單位配置空間，常見的區塊大小是 4K：在模擬器裡，每個目錄占 4K，檔案的大小進位到 4K 的倍數。下面的紀錄裡，ls -l 顯示 banner.svg 有 5748 位元組，du -a 卻算 8K（兩個區塊）；只有 66 位元組的 logo.svg 也占一整個 4K。最後一步，kai 沒有權限讀取 /var/lib/postgresql/16/main，du 報錯，總和也少算了那個目錄裡的資料：' },
        { type: 'example', id: 'lnx03-du' },
        { type: 'callout', tone: 'tip', title: '磁碟快滿時，先 df 再 du', text: '先用 df -h 找出哪個檔案系統的 Use% 很高，再對它的掛載點底下的目錄逐一 du -sh，找出最大的那個，往下一層再 du -sh，一路縮小範圍。LNX05 學會管線之後，可以用 du 搭配 sort 一次排出最大的目錄；du 讀不到的目錄要用有權限的帳號再查一次，才不會漏算。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'lnx03-q1', prompt: '依照 FHS，nginx 這類服務的設定檔應該放在哪個目錄底下？',
      options: ['`/var/nginx`', '`/etc/nginx`', '`/opt/nginx/log`', '`/home/nginx`'],
      answer: 1,
      explanation: '/etc 放這台機器的設定檔，所以是 /etc/nginx（例如 nginx.conf）。/var 放執行時會變動的資料，例如日誌在 /var/log/nginx；/opt 放額外安裝的套件，log 子目錄更不是設定；/home 是使用者的家目錄，不放系統服務的設定。',
    },
    {
      id: 'lnx03-q2', prompt: '目前在 `/var/log/nginx`，而且 `/var/lib` 存在。執行 `cd ../../lib` 之後，`pwd` 會印出什麼？',
      options: ['`/var/lib`', '`/lib`', '`/var/log/lib`', '`bash: cd: ../../lib: No such file or directory`'],
      answer: 0,
      explanation: '從 /var/log/nginx 往上一層是 /var/log，再上一層是 /var，接著進入 lib，就是 /var/lib。/lib 需要往上三層才到；/var/log/lib 只往上了一層；/var/lib 存在，所以 cd 成功，不會出現 No such file or directory。',
    },
    {
      id: 'lnx03-q3', prompt: '下列哪一個是絕對路徑？',
      options: ['`../etc`', '`./nginx.conf`', '`etc/nginx`', '`/etc/nginx`'],
      answer: 3,
      explanation: '只有以 / 開頭的 /etc/nginx 是絕對路徑，不管目前在哪裡都指向同一個目錄。../etc 從上一層算起、./nginx.conf 從目前目錄算起、etc/nginx 沒有 / 開頭也是從目前目錄算起，三者都是相對路徑，結果取決於目前的工作目錄。',
    },
    {
      id: 'lnx03-q4', prompt: '`ls -ld /tmp` 和 `ls -l /tmp` 有什麼不同？',
      options: ['`-d` 會連以 . 開頭的隱藏檔一起列出', '`-d` 把大小改用 K、M、G 表示', '`-d` 列出 /tmp 目錄本身的權限與擁有者，而不是它裡面的檔案', '兩者的輸出完全一樣'],
      answer: 2,
      explanation: '-d 讓 ls 把目錄當成一個項目列出，所以 ls -ld /tmp 顯示 /tmp 自己的權限與擁有者；ls -l /tmp 則列出 /tmp 裡的每個檔案。列出隱藏檔的是 -a，易讀的大小是 -h；只要 /tmp 不是空的，兩個指令的輸出就不同。',
    },
    {
      id: 'lnx03-q5', prompt: '掛載表裡有 `/`（/dev/vda1）、`/var`（/dev/vdb1）與 `/var/lib/postgresql`（/dev/vdc1）。`/var/lib/postgresql/16/main` 裡的資料存在哪個裝置上？',
      options: ['/dev/vda1', '/dev/vdb1', '/dev/vdc1', '三個裝置各存一部分'],
      answer: 2,
      explanation: '路徑屬於包含它的最長掛載點：/、/var、/var/lib/postgresql 都是它的開頭，最長的是 /var/lib/postgresql，所以在 /dev/vdc1。/dev/vda1 只存不在其他掛載點底下的檔案；/dev/vdb1 存 /var 裡除了 /var/lib/postgresql 以外的部分；一個目錄的資料不會分散到好幾個掛載的檔案系統。',
    },
    {
      id: 'lnx03-q6', prompt: '`df -h` 顯示 `/var` 的 Use% 是 100%，而 `/` 還有 24G 可用（兩者是不同的檔案系統）。下列敘述何者正確？',
      options: ['寫入 /var/log 的程式會因為空間不足而失敗，/ 的空間幫不上忙', '系統會自動把 /var 的新資料寫到 / 的剩餘空間', '刪除 /home 裡的大檔案就能讓 /var 有空間', '/var 在 / 底下，所以兩者的 Use% 一定相同'],
      answer: 0,
      explanation: '/var 掛的是獨立的檔案系統，有自己的容量，滿了就寫不進去，跟 / 還剩多少無關。Linux 不會自動把資料挪到別的檔案系統；/home 在 / 上，刪除它的檔案只釋放 / 的空間；子目錄掛了別的檔案系統，df 就各自回報，Use% 不必相同。',
    },
    {
      id: 'lnx03-q7', prompt: '想知道網站目錄 `/srv/www/shop` 總共占了多少空間，應該用哪個指令？',
      options: ['`df -h /srv/www/shop`', '`du -sh /srv/www/shop`', '`ls -h /srv/www/shop`', '`du -a /srv/www`'],
      answer: 1,
      explanation: 'du -sh 走過整個目錄，只印出一行易讀的總和。df -h 回報的是整個 /srv 檔案系統的用量，不是這個目錄；ls -h 沒有 -l 時只列名稱，就算加上 -l 也只有每個項目自己的大小，不會加總子目錄；du -a /srv/www 會逐一列出每個檔案，而且對象是上一層目錄。',
    },
    {
      id: 'lnx03-q8', prompt: '以 root 身分登入後執行 `cd ~`，會切換到哪個目錄？',
      options: ['`/home/root`', '`/`', '`/home`', '`/root`'],
      answer: 3,
      explanation: '~ 代表目前使用者的家目錄，而 FHS 把 root 的家目錄放在 /root，不在 /home 底下，所以會到 /root。/home/root 通常不存在；/ 是根目錄，不是任何人的家目錄；/home 是一般使用者家目錄的上一層。',
    },
  ],
  terminal,
};
