import type { TerminalFile, TerminalMachine } from '@/lib/terminal/lesson';
import type { TerminalGitCommit } from '@/lib/terminal/git-lesson';
import type { TerminalForge, TerminalForgeRepo } from '@/lib/terminal/forge-lesson';
import type { LessonContent } from '../schema';

/*
 * CICD02 團隊 Git 工作流程 (the blueprint's decision-simulation, terminal-sim on the forge profile: engine stages E25 git and
 * E26 forge). A made-up community library team on the simulated github.example: Ann Wu (the learner, gh login ann-wu), Lin
 * Kai (kai) and Chen Yu (yu-chen). tidepool/library's main is protected (1 approval, stale approvals dismissed, no force
 * pushes); kai reviews every head about 5 minutes after it appears, yu-chen about 30 minutes after. The learner's clone
 * ~/library was made before this morning's commit "Allow 8 books per member" (max_books 5 -> 8), so main is one commit
 * behind; the learner's own pull request #11 (late-fee, late_fee 0 -> 5 on the next line) now conflicts with main. Three
 * teammate pull requests (#7 one commit, #8 five messy commits, #9 two commits) wait to be merged, and a branch
 * summer-list is shared with yu-chen, who pushed a commit the learner has not fetched. tidepool/events is a new repository
 * the learner administers (no protection yet). Branches, pull requests, review, branch protection read and set with
 * gh api, trunk-based development and Git Flow, merge and rebase, and the forge's three merge methods. Organisation,
 * people, files and addresses are made up; every transcript output was produced by replaying it on the engine.
 */

const dir = (path: string, owner = 'learner'): TerminalFile => ({ path, kind: 'dir', mode: 0o755, owner });
const LIBRARY = 'https://github.example/tidepool/library.git';
const EVENTS = 'https://github.example/tidepool/events.git';
const ANN = { name: 'Ann Wu', email: 'ann@example.com' }, KAI = { name: 'Lin Kai', email: 'kai@example.com' }, YU = { name: 'Chen Yu', email: 'yu@example.com' };
const GITHUB = { name: 'GitHub', email: 'noreply@github.example' };
const config = (books: number, fee: number) => `loan_days: 14\nmax_books: ${books}\nlate_fee: ${fee}\n`;
const HOURS = 'Mon-Fri 09:00-18:00\n';

const COMMITS: TerminalGitCommit[] = [
  { id: 'c1', message: 'Initial commit', author: YU, time: '2026-11-16 02:00:00', files: {
    'README.md': '# library\n\nLoans and catalog for the Tidepool community library.\n', 'config.yml': config(5, 0), 'hours.txt': HOURS,
    'due.py': 'def due_date(day):\n    return day + 14\n',
  } },
  { id: 'c2', message: 'Add catalog search', author: KAI, time: '2026-11-18 03:00:00', files: { 'search.py': 'def search(title):\n    return []\n' } },
  // This morning: kai's change, rebase-merged on the forge (GitHub is the committer); the learner has not pulled it yet.
  { id: 'c3', message: 'Allow 8 books per member', author: KAI, time: '2026-11-22 08:00:00', committer: { ...GITHUB, time: '2026-11-23 01:00:00' }, files: { 'config.yml': config(8, 0) } },
  // The learner's pull request #11, from c2: the line below kai's change.
  { id: 'l1', parents: ['c2'], message: 'Charge a late fee', author: ANN, time: '2026-11-22 05:30:00', files: { 'config.yml': config(5, 5) } },
  { id: 'b1', parents: ['c2'], message: 'Add barcode scanning', author: YU, time: '2026-11-21 02:00:00', files: { 'scan.py': 'def scan(code):\n    return code.strip()\n' } },
  { id: 'd1', parents: ['c2'], message: 'Skip weekends in due dates', author: KAI, time: '2026-11-21 03:00:00', files: { 'due.py': 'def due_date(day):\n    due = day + 14\n    return due\n' } },
  { id: 'd2', message: 'wip', author: KAI, time: '2026-11-21 03:20:00', files: { 'due.py': 'def due_date(day):\n    due = day + 14\n    while due % 7 in (5, 6):\n        due += 1\n    return due\n' } },
  { id: 'd3', message: 'fix typo', author: KAI, time: '2026-11-21 03:25:00', files: { 'test_due.py': 'from due import due_date\n' } },
  { id: 'd4', message: 'oops, forgot the test', author: KAI, time: '2026-11-21 03:40:00', files: { 'test_due.py': 'from due import due_date\n\nassert due_date(0) == 14\n' } },
  { id: 'd5', message: 'address review comments', author: KAI, time: '2026-11-21 04:10:00', files: { 'test_due.py': 'from due import due_date\n\nassert due_date(0) == 14\nassert due_date(1) == 16\n' } },
  { id: 'h1', parents: ['c2'], message: 'Add holiday list', author: YU, time: '2026-11-22 01:00:00', files: { 'holidays.txt': '12-25 Christmas\n' } },
  { id: 'h2', message: 'Add New Year holiday', author: YU, time: '2026-11-22 01:10:00', files: { 'holidays.txt': '12-25 Christmas\n01-01 New Year\n' } },
  // summer-list is shared: the learner started it, yu-chen pushed s2 last night (the learner has not fetched it).
  { id: 's1', parents: ['c1'], message: 'Start the summer reading list', author: ANN, time: '2026-11-19 06:00:00', files: { 'summer.txt': 'Moon Tides\n' } },
  { id: 's2', message: 'Add two picture books', author: YU, time: '2026-11-22 09:00:00', files: { 'summer.txt': 'Moon Tides\nThe Lantern Fish\nSand Castles\n' } },
  { id: 'e1', parents: [], message: 'Initial commit', author: ANN, time: '2026-11-20 06:00:00', files: { 'README.md': '# events\n\nStory hours and workshops.\n' } },
];

const LIBRARY_REPO: TerminalForgeRepo = {
  url: LIBRARY, description: 'Tidepool community library: loans and catalog',
  protection: [{ branch: 'main', approvals: 1, dismissStale: true }],
  personas: [
    { login: 'kai', name: 'Lin Kai', after: 300, review: 'approve', body: 'Looks good to me.' },
    { login: 'yu-chen', name: 'Chen Yu', after: 1800, review: 'approve', body: 'LGTM.' },
  ],
  pulls: [
    { number: 7, head: 'barcode', title: 'Add barcode scanning', body: 'Read the code on a library card.', author: 'yu-chen', created: '2026-11-21 02:30:00' },
    { number: 8, head: 'due-date', title: 'Skip weekends in due dates', body: 'Books are never due on a Saturday or Sunday.', author: 'kai', created: '2026-11-21 04:30:00' },
    { number: 9, head: 'holidays', title: 'Add holiday list', body: 'The library is closed on these days.', author: 'yu-chen', created: '2026-11-22 01:30:00' },
    { number: 11, head: 'late-fee', title: 'Charge a late fee', body: 'Five dollars a day after the due date.', author: 'ann-wu', created: '2026-11-22 06:00:00' },
  ],
  next: 12,
};
const EVENTS_REPO: TerminalForgeRepo = { url: EVENTS, description: 'Story hours and workshops', permission: 'admin' };
const FORGE: TerminalForge = { login: 'ann-wu', repos: [LIBRARY_REPO, EVENTS_REPO] };

const lab: TerminalMachine = {
  id: 'cicd02-lab', title: 'ann-laptop（圖書館團隊的工作筆電）', user: 'learner', cwd: '/home/learner', host: 'ann-laptop', profile: 'forge',
  timezone: 'Asia/Taipei', now: '2026-11-23 02:00:00',
  files: [dir('/home', 'root'), dir('/home/learner')],
  git: {
    user: ANN, commits: COMMITS,
    remotes: [
      { url: LIBRARY, branches: { main: 'c3', barcode: 'b1', 'due-date': 'd5', holidays: 'h2', 'late-fee': 'l1', 'summer-list': 's2' } },
      { url: EVENTS, branches: { main: 'e1' } },
    ],
    repos: [
      { path: '/home/learner/library', origin: LIBRARY, branches: { main: 'c2', 'late-fee': 'l1', 'summer-list': 's1' }, head: 'main',
        tracking: { main: 'c2', 'late-fee': 'l1', 'summer-list': 's1' }, upstream: ['main', 'late-fee', 'summer-list'] },
      { path: '/home/learner/events', origin: EVENTS },
    ],
  },
  forge: FORGE,
};

/** Exercise 3's variant: another protection (two approvals, no dismissal, linear history), so the JSON cannot be typed in. */
const STRICTER: TerminalForge = { ...FORGE, repos: [{ ...LIBRARY_REPO, protection: [{ branch: 'main', approvals: 2, linear: true }] }, EVENTS_REPO] };

const PR_TITLE = "--title 'Add Saturday hours' --body 'Open on Saturdays from 10 to 16.'";
const SAT_BRANCH = ['cd library', 'git pull', 'git switch -c sat-hours', "echo 'Sat 10:00-16:00' >> hours.txt", "git commit -am 'Add Saturday hours'"];
const RESOLVED = "printf 'loan_days: 14\\nmax_books: 8\\nlate_fee: 5\\n' > config.yml";
const UPDATE_MAIN = ['cd library', 'git switch main', 'git pull', 'git switch late-fee'];
const PROTECT = "gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F required_status_checks=null -F enforce_admins=true -F 'required_pull_request_reviews[required_approving_review_count]=1' -F restrictions=null -F required_linear_history=true";

export const CICD02: LessonContent = {
  lessonId: 'CICD02',
  motivation: '「我只改了一行設定，為什麼 git push 被拒絕了？」「同事說我的 Pull Request 跟 main 衝突，叫我 rebase；rebase 完卻推不上去，只好加 --force，結果把別人的 commit 蓋掉了。」「有人說要開 develop 與 release 分支，有人說直接合進 main 就好，到底該聽誰的？」CICD01 說過，小批量與快速回饋讓交付又快又穩；在程式碼這一層，把它變成日常的，就是團隊的 Git 工作流程：每個變更走自己的短分支，經過 Pull Request 與審查才進入 main，主機上的分支保護替團隊把關。這一課在一個小圖書館團隊的模擬終端機裡，真的用 git 與 gh 開分支、送審、合併、處理衝突、讀取與設定保護規則，並在幾個常見的情境裡先判斷該用 merge 還是 rebase、該選哪一種合併方式，再動手做，看結果留在歷史上的樣子。',
  sections: [
    {
      id: 'cicd02-s-setup', title: '本課的團隊與終端機',
      blocks: [
        { type: 'p', text: '本課的情境是虛構的潮池社區圖書館（Tidepool）的借閱系統，程式放在模擬的 GitHub 主機 `github.example` 上的儲存庫 tidepool/library。團隊有三個人：你是 Ann Wu（GitHub 帳號 ann-wu），另外兩位是 Lin Kai（kai）與 Chen Yu（yu-chen）。你的筆電 ann-laptop 上已經有一份 library 的複本（clone），放在家目錄的 library 資料夾；它是前幾天複製的，今天早上 kai 合併進 main 的變更還沒有拉下來。' },
        { type: 'p', text: '如果你沒有用過終端機：畫面上 `learner@ann-laptop:~$` 這樣的文字叫提示字元，表示可以輸入指令，`~` 是你目前所在的資料夾（家目錄）。輸入一行指令、按 Enter，結果就印在下面。本課只用到下面幾個一般指令，其餘都是 git 與 gh：' },
        { type: 'table', head: ['指令', '作用', '本課的例子'], rows: [
          ['`cd 資料夾`', '進入資料夾；`cd ..` 回到上一層', '`cd library`、`cd ../events`'],
          ['`ls`', '列出目前資料夾裡的檔案', '`ls`'],
          ['`cat 檔案`', '印出檔案的內容', '`cat config.yml`'],
          ["`echo '文字' >> 檔案`", '在檔案最後加上一行（`>>` 是附加）', "`echo 'Sat 10:00-16:00' >> hours.txt`"],
          ["`printf '第一行\\n第二行\\n' > 檔案`", '用這段文字取代整個檔案（`>` 是覆寫，`\\n` 代表換行）', "`printf 'loan_days: 14\\nmax_books: 8\\nlate_fee: 5\\n' > config.yml`"],
          ['`sleep 秒數`', '等待；模擬環境的時鐘會往前走', '`sleep 300`（等 5 分鐘）'],
        ] },
        { type: 'p', text: 'Git 的幾個基本名詞：一個儲存庫（repository）記錄專案的完整歷史；每一次 commit 是整個專案在某一刻的快照，有一段說明訊息與一個由內容算出的 ID（畫面上通常只顯示前 7 個字，例如 22f5d41）。分支（branch）只是一個會移動的名字，指向某一個 commit，在分支上提交時它就往前移到新的 commit。`origin` 是複製來源，也就是 github.example 上的那一份；`origin/main` 是「上次和主機同步時，主機上的 main 在哪裡」。`git fetch` 把主機上的新 commit 下載回來，`git pull` 是 fetch 之後再把它合進目前的分支，`git push` 把你的 commit 送上主機。' },
        { type: 'table', head: ['團隊成員', '帳號', '在本課的角色'], rows: [
          ['Ann Wu（你）', 'ann-wu', '有寫入權限的開發者；tidepool/events 這個新儲存庫的管理員（admin）'],
          ['Lin Kai', 'kai', '審查者：不是他開的 Pull Request 每出現新的 commit，他大約 5 分鐘後審查'],
          ['Chen Yu', 'yu-chen', '審查者：比較忙，大約 30 分鐘後才審查；和你一起維護 summer-list 分支'],
        ] },
        { type: 'callout', tone: 'note', title: '模擬環境的範圍', text: 'git 照 2.43、gh 照 2.65 的輸出格式模擬，沒有顏色、沒有編輯器，也不會互動式提問：`git commit` 一定要用 `-m` 寫訊息，`gh pr create` 一定要給 `--title` 與 `--body`，`gh pr merge` 一定要指定合併方式。kai 與 yu-chen 是課程設定的審查者，依時鐘自動審查，所以用 `sleep` 讓時間前進；真實的審查者是人，你在等待的時間會去做別的事。github.example 與團隊、檔案、網址都是虛構的。' },
      ],
    },
    {
      id: 'cicd02-s-branch', title: '分支：每個變更走自己的一條線',
      blocks: [
        { type: 'p', text: 'main 是全團隊共用、隨時要能上線的那條歷史。如果每個人都直接在 main 上提交，寫到一半的程式、還沒測試的修改，都會立刻變成別人的起點，也沒有機會在進入 main 之前讓同事看一眼。分支解決這件事：每個變更在自己的分支上開發，愛提交幾次就提交幾次，等它完成並通過審查，才合併進 main。幾個人同時做不同的事，各走各的分支，互不干擾。' },
        { type: 'p', text: '建立分支非常便宜：Git 只是多寫一個名字，指向目前的 commit，不會複製任何檔案。`HEAD` 表示你現在站在哪一個分支上，新的 commit 會讓那個分支往前移，其他分支不動。所以開分支前要先站在最新的 main 上：先 `git switch main`，再 `git pull` 取得同事合併進去的變更，然後才 `git switch -c` 開新分支。分支名稱寫成簡短、看得出用途的英文，例如 sat-hours、late-fee。' },
        { type: 'table', head: ['指令', '作用'], rows: [
          ['`git switch -c 名稱`', '從目前的 commit 建立新分支並切換過去'],
          ['`git switch 名稱`', '切換到已有的分支，工作資料夾的檔案會換成那個分支的版本'],
          ['`git branch`', '列出本機的分支，`*` 是目前所在的分支'],
          ['`git status -s`', '簡短列出哪些檔案改了（` M` 是已修改、還沒提交）'],
          ["`git commit -am '訊息'`", '把已追蹤檔案的修改提交成一個 commit（新檔案要先 `git add 檔案`）'],
          ['`git log --oneline --graph -3`', '每個 commit 印成一行並畫出分支的線，只看最近 3 個；加 `--all` 看所有分支'],
        ] },
        { type: 'p', text: '下面的例子先用 `git pull` 讓本機的 main 跟上主機（輸出裡 `22f5d41` 那一行就是今天早上 kai 的 commit），再開分支 readme-contact，在 README.md 加上服務台的聯絡方式並提交。切回 main 時，README.md 立刻變回沒有聯絡方式的版本；切回 readme-contact，修改又回來了。兩條線是分開的。' },
        { type: 'example', id: 'cicd02-branch' },
        { type: 'p', text: '`git log --oneline --graph` 最左邊的 `*` 是一個 commit，括號裡是指向它的名字：`HEAD -> readme-contact` 表示你在 readme-contact 上，它指向新的 commit；`main`、`origin/main` 還停在 kai 的 commit。這時候 main 完全沒有被改到，readme-contact 也還只在你的筆電上，要推送之後同事才看得到。' },
      ],
    },
    {
      id: 'cicd02-s-pr', title: 'Pull Request 與程式碼審查',
      blocks: [
        { type: 'p', text: 'Pull Request（PR）是「請把這個分支合併進 main」的請求，也是團隊討論這個變更的地方：審查者在這裡看差異、留意見、核准或要求修改，之後的課程還會在這裡自動跑測試。整個流程是：' },
        { type: 'list', ordered: true, items: [
          '推送分支：`git push -u origin 分支`。`-u` 讓本機分支記住對應的遠端分支，之後在這個分支上只要打 `git push`。主機回覆的 `remote: Create a pull request for …` 是 GitHub 的提示。',
          '開 PR：`gh pr create --title 標題 --body 說明`。預設把目前的分支合併進預設分支 main；成功時印出 PR 的網址，最後的數字就是 PR 編號。',
          '審查：審查者用 `gh pr diff` 或網頁看差異，然後核准（approve）、要求修改（request changes）或只留言（comment）。審查別人的 PR 用 `gh pr review 編號 --approve`、`--request-changes -b 說明` 或 `--comment -b 說明`；自己的 PR 不能核准。',
          '修改：被要求修改時，在同一個分支上提交並推送，PR 會自動更新成新的內容，再請審查者看一次。',
          '合併：核准數達到規則的要求後，用 `gh pr merge` 加上合併方式（`--squash`、`--merge` 或 `--rebase`，第六節比較）合併；加 `--delete-branch`（`-d`）會刪除用完的分支，並替你切回 main、拉下合併後的結果。',
        ] },
        { type: 'table', head: ['指令', '看到什麼'], rows: [
          ['`gh pr list`', '開著的 PR：編號、標題、分支、建立多久了'],
          ['`gh pr view [編號]`', '狀態（Open、Merged、Closed）、誰要把幾個 commit 合進哪裡、增刪行數、審查者與他們的決定（Approved、Changes requested、Commented）、說明；不給編號就是目前分支的 PR'],
          ['`gh pr diff [編號]`', 'PR 帶來的所有修改'],
          ['`gh pr merge [編號] --squash -d`', '合併並刪除分支；不能合併時說明原因'],
        ] },
        { type: 'p', text: '審查之所以有用，前提是 PR 夠小。一個改了 30 行、只做一件事的 PR，審查者幾分鐘就能真的看懂，問題也容易找；一個改了 2000 行、混了三件事的 PR，多半只會換來一句「看起來沒問題」。這和 CICD01 的小批量是同一個道理：變更越小，審查越快、出錯時越容易找到原因，前置時間也越短。標題寫做了什麼，說明寫為什麼要做、怎麼驗證，審查者看的是正確性、可讀性、有沒有測試，以及會不會影響別的功能。' },
        { type: 'p', text: '下面的例子是常見的失誤與補救：忘了開分支，直接在 main 上提交並推送，被主機的分支保護以 GH006 拒絕。補救的方法是用 `git branch readme-contact` 在目前的 commit 上留一個分支名字（commit 就安全地在那個分支上了），再用 `git reset --hard origin/main` 讓本機的 main 退回主機的位置，然後切到新分支、推送、開 PR。PR 剛開時沒有核准，合併被拒絕；等 kai 審查之後才合併成功。' },
        { type: 'example', id: 'cicd02-pull-request' },
        { type: 'p', text: '注意合併被拒絕時的最後一行提到 `--admin`：那是給儲存庫管理員繞過規則用的，你在 library 沒有這個權限，就算有也不該用它跳過審查。`git reset --hard` 會丟掉工作資料夾裡還沒提交的修改，只在像這裡一樣、要保留的東西都已經提交（並留了分支名字）時使用。' },
      ],
    },
    {
      id: 'cicd02-s-protect', title: '分支保護：讓規則由主機執行',
      blocks: [
        { type: 'p', text: '「main 一定要經過審查才能改」如果只寫在團隊文件裡，趕時間的時候就會有人跳過。分支保護（branch protection）把規則設定在主機上，每一次推送與合併都由主機檢查，不合規則就拒絕。直接推送到受保護的 main 時，你會看到 `remote: error: GH006: Protected branch update failed for refs/heads/main.`，下一行寫出違反了哪一條，例如 `At least 1 approving review is required by reviewers with write access.`（至少要 1 個有寫入權限的人核准）、`Cannot force-push to this branch`（不允許強制推送）或 `This branch must not contain merge commits.`（要求線性歷史）。' },
        { type: 'table', head: ['規則', '效果', 'tidepool/library 的 main', 'API 回應裡的欄位'], rows: [
          ['要求 Pull Request 審查', '不能直接推送，只能經由 PR 合併，並需要 N 個核准', '需要 1 個核准', '`required_pull_request_reviews.required_approving_review_count`'],
          ['撤銷過時的核准', 'PR 推送了新的 commit 之後，之前的核准不再算數，要重新核准', '開啟', '`required_pull_request_reviews.dismiss_stale_reviews`'],
          ['要求的狀態檢查', '指定的自動檢查（例如測試）要成功才能合併，CICD03 起會用到', '沒有', '`required_status_checks`'],
          ['要求線性歷史', 'main 上不能有合併 commit，只能用 squash 或 rebase 方式合併', '沒有', '`required_linear_history.enabled`'],
          ['允許強制推送', '能不能用 `--force` 改寫這個分支的歷史；保護規則預設不允許', '不允許', '`allow_force_pushes.enabled`'],
          ['管理員也適用', '沒有開啟時，管理員可以繞過上面的規則', '沒有', '`enforce_admins.enabled`'],
        ] },
        { type: 'p', text: '讀取規則不必打開網頁：在儲存庫的資料夾裡執行 `gh api repos/{owner}/{repo}/branches/main/protection`，gh 會依 origin 把 `{owner}`、`{repo}` 換成 tidepool 與 library，向主機的 REST API 要這個分支的保護設定，印出一段 JSON。JSON 是「欄位名稱: 值」的巢狀結構，對照上表找欄位即可，例如 `"required_approving_review_count": 1` 就是需要 1 個核准，`"allow_force_pushes": { "enabled": false }` 就是不允許強制推送。分支沒有保護時，回應是 `Branch not protected`（HTTP 404）。' },
        { type: 'p', text: '設定規則要有儲存庫的管理員權限。同一個端點用 `-X PUT` 送出整份設定，`-F 欄位=值` 一個一個給：`required_status_checks`、`enforce_admins`、`required_pull_request_reviews`、`restrictions` 這四個一定要有（不需要的寫 `null`），巢狀的欄位寫成 `required_pull_request_reviews[required_approving_review_count]=1`，因為含有方括號，整個參數用單引號括起來；`required_linear_history=true` 之類的欄位可以省略，省略就是 false。PUT 是「整份取代」，不是只改你給的欄位。少了必要欄位，主機回 HTTP 422 並說明少了哪一個；沒有管理員權限時是 HTTP 403 `Must have admin rights to Repository.`，設定都不會改變。' },
        { type: 'callout', tone: 'warning', title: '核准之後再推送，核准可能就不算了', text: '很多人以為 PR 只要被核准過一次，之後再推幾個 commit 都可以直接合併。開啟「撤銷過時的核准」時（tidepool/library 就是），每次推送新的 commit，先前的核准都會被撤銷，`gh pr view` 的審查者顯示成 Commented，合併會被拒絕，要等審查者看過新的內容重新核准。這是刻意的設計：被核准的是那一版程式碼，不是那個 PR 的名字。另外，沒有開啟「管理員也適用」時，管理員可以繞過所有規則，所以重要的分支通常連管理員也一起約束。' },
      ],
    },
    {
      id: 'cicd02-s-flow', title: 'Trunk-based 與 Git Flow',
      blocks: [
        { type: 'p', text: '分支與 PR 是工具，團隊還要約定怎麼用：分支要留多久、從哪裡開、合併到哪裡、怎麼發布。最常被拿來比較的兩種做法是 Trunk-based development 與 Git Flow。' },
        { type: 'p', text: 'Trunk-based development（主幹開發）：所有人都以一條主幹（main）為準，功能分支只活幾個小時到一兩天，每天至少合併一次。做到一半的大功能不靠長期的分支藏起來，而是拆成能安全合併的小步驟，或用功能旗標（feature flag）先關著。自動測試在每次合併時確認主幹仍然健康，所以主幹隨時可以發布。這正是 CICD01 的小批量：每個 PR 很小、等待很短，衝突也小，因為大家的程式碼不會分開太久。本課 library 團隊的「main 加上短的功能分支，經過 PR 合併」，常被稱為 GitHub flow，就是貼近主幹開發的簡單流程。' },
        { type: 'p', text: 'Git Flow 是 2010 年提出的分支模型，有兩條長期存在的分支：main 只放已發布的版本（每個版本打一個標籤），develop 是開發中的整合線。功能分支從 develop 開出、合併回 develop；要發布時從 develop 開 release 分支（例如 release/2.4），在上面只修錯誤、準備發布，完成後合併進 main 並打標籤，再合併回 develop；正式版出問題時從 main 開 hotfix 分支，修好後同樣合併回 main 與 develop。' },
        { type: 'table', head: ['', 'Trunk-based development', 'Git Flow'], rows: [
          ['長期存在的分支', '只有 main', 'main 與 develop，發布期間再加 release 分支'],
          ['功能分支', '幾小時到一兩天，從 main 開、合回 main', '可以很長，從 develop 開、合回 develop'],
          ['整合的頻率', '每天好幾次，衝突小而早', '功能完成才整合，分支越久衝突越大'],
          ['發布', '主幹隨時可以發布，常搭配持續部署', '依版本節奏，release 分支先穩定一段時間'],
          ['緊急修正', '在 main 上以一般的小 PR 修正並發布', 'hotfix 分支，要合併回兩條長期分支'],
          ['前提', '可靠的自動測試、小 PR、功能旗標', '有人管理分支與版本，願意承擔合併的成本'],
          ['適合', '持續部署的網站與服務', '有明確版本、要同時維護舊版的軟體'],
        ] },
        { type: 'p', text: 'Git Flow 並沒有過時，它適合「版本」本身有意義的產品：要送到客戶端安裝的軟體、要經過商店審核才能上架的手機 App、要同時維護 2.x 與 3.x 的函式庫，或發布前需要一段穩定期的情況。release 分支讓一部分人穩定即將發布的版本，其他人繼續在 develop 開發。代價是長期分支之間的合併與管理，以及變更從寫好到上線要等比較久。提出 Git Flow 的作者後來也補充說明，對持續交付的網頁服務，更簡單的流程通常更合適。像 library 這種隨時可以部署的服務，選主幹開發。' },
        { type: 'callout', tone: 'warning', title: 'Trunk-based 不等於大家直接推送 main', text: '「主幹開發」常被誤解成取消分支與審查、每個人直接推送 main。實際上多數團隊仍然用很短的分支與 PR，搭配分支保護與自動測試，只是分支在一兩天內就合併。重點是整合的頻率與變更的大小，而不是有沒有分支。反過來，用了 PR 但分支一開就是三週，也不算主幹開發。' },
      ],
    },
    {
      id: 'cicd02-s-merge', title: 'merge 與 rebase：歷史的形狀',
      blocks: [
        { type: 'p', text: '要把兩條線合在一起有兩種基本做法。假設你從 main 開出分支、提交了一個 commit：如果這段時間 main 沒有前進，合併時 Git 只要把 main 往前移到你的 commit，這叫快轉（fast-forward），不會多出任何 commit。如果 main 也前進了，兩條線分岔，就要選擇：' },
        { type: 'table', head: ['做法', '指令（在功能分支上）', '歷史的形狀', 'commit 的 ID'], rows: [
          ['merge', '`git merge main`', '多一個有兩個父 commit 的合併 commit，圖上是一個分岔再合起來的泡泡；忠實記錄「兩條線曾經各自發展」', '原有的 commit 不變'],
          ['rebase', '`git rebase main`', '把你的 commit 一個一個重新接到 main 的最新 commit 之後，歷史變成一直線，好像你是今天才從最新的 main 開始寫', '你的 commit 變成新的 commit，ID 全部改變'],
        ] },
        { type: 'p', text: '因為 rebase 換掉了 commit，已經推送過的分支 rebase 之後，主機上的舊 commit 不再是你的新 commit 的祖先，一般的 `git push` 會被拒絕，必須用強制推送改寫主機上的分支。`git push --force-with-lease` 比 `--force` 安全：它只在主機上的分支仍是你上次看到的位置（你的 `origin/分支`）時才覆蓋，如果有人在這段時間推送了你沒看過的 commit，就拒絕並顯示 `stale info`。' },
        { type: 'p', text: '在主機上合併 PR 時，GitHub 提供三種方式，對應 `gh pr merge` 的三個選項。三者都把 PR 的內容放進 main，差別在 main 的歷史長什麼樣子：' },
        { type: 'table', head: ['合併方式', 'main 上多了什麼', '適合'], rows: [
          ['`--merge`（merge commit）', '一個合併 commit `Merge pull request #7 from …`，PR 原本的 commit 原樣保留在旁邊那條線上；即使可以快轉也一定建立合併 commit', '想完整保留分支的每個 commit 與「這是一個 PR」的界線'],
          ['`--squash`（squash and merge）', '只有一個新的 commit，標題是 PR 標題加 `(#8)`，內文列出原本每個 commit 的訊息', 'PR 裡有 wip、fix typo 這類過程中的 commit，合併後只想留一個乾淨的變更'],
          ['`--rebase`（rebase and merge）', 'PR 的每個 commit 依序重新接在 main 之後（ID 改變，提交者變成 GitHub），沒有合併 commit', '每個 commit 都整理好、各自有意義，想保留它們又要一直線'],
        ] },
        { type: 'p', text: '下面的例子裡你是這週負責整合的人：把三位同事已經核准的 PR，依它們的情況用三種方式合併，再把 main 拉下來看歷史。#7 只有一個 commit，用 merge commit；#8 有五個凌亂的 commit，用 squash；#9 有兩個整理好的 commit，用 rebase。' },
        { type: 'example', id: 'cicd02-methods' },
        { type: 'p', text: '從圖上由下往上讀：`Merge pull request #7` 有兩個父 commit，所以畫出一個泡泡，旁邊那條線上是原本的 Add barcode scanning；`Skip weekends in due dates (#8)` 是 squash 出來的一個 commit，最後的 `git log -1 --format=%B HEAD~2` 印出它的完整訊息（`HEAD~2` 是目前位置往前數兩個），五個原本的 commit 只剩下內文裡的清單；最上面的兩個 commit 是 #9 用 rebase 方式重新接上的，訊息和原本相同，但已經是新的 commit。' },
        { type: 'p', text: '使用 rebase 有一條鐵則：不要 rebase 別人已經拿去用的 commit。main 與多人共用的分支上的 commit，同事的複本裡也有；你 rebase 之後強制推送，主機上的歷史被改寫，同事手上的歷史對不上，他們之後的推送與拉取都會出問題，而他們剛推送、你還沒拉下來的 commit，會被你的強制推送直接蓋掉。只有你一個人在用、還沒有人以它為基礎的分支，才適合 rebase。' },
        { type: 'p', text: '下面的例子示範這條規則：summer-list 是你和 yu-chen 共用的分支，她昨晚推送了一個 commit，你還沒拉下來。你想讓它跟上 main，對它 rebase，一般推送被拒絕，`--force-with-lease` 也因為主機上有你沒看過的 commit 而拒絕。正確的做法是退回 rebase 之前（`git reset --hard origin/summer-list`），用 `git pull` 拉下她的 commit，再用 `git merge origin/main` 把 main 合併進來，一般推送就成功，誰的 commit 都沒有遺失。' },
        { type: 'example', id: 'cicd02-shared' },
        { type: 'callout', tone: 'warning', title: '--force-with-lease 也擋不住先 fetch 再覆蓋', text: '`--force-with-lease` 比較的是你的 `origin/分支` 與主機。如果你先執行了 `git fetch`（或編輯器在背景替你 fetch），`origin/summer-list` 已經是 yu-chen 的新 commit，這時 rebase 再 `--force-with-lease` 會「通過」檢查，照樣把她的 commit 蓋掉，因為你的 rebase 是從舊的位置做的。真正的保護是不要 rebase 共用的分支；在自己的分支上 rebase 前，也先確認沒有別人推送過。' },
      ],
    },
    {
      id: 'cicd02-s-decide', title: '三個情境：先判斷，再動手',
      blocks: [
        { type: 'p', text: '把前面的內容整理成決定的方法。每次要「讓分支跟上 main」或「合併 PR」時，先回答兩個問題：這個分支有沒有別人在用？這些 commit 值不值得一個一個留在 main 的歷史上？' },
        { type: 'table', head: ['情境', '判斷', '做法', '歷史的結果'], rows: [
          ['你的 PR #11 落後 main，而且衝突；late-fee 只有你在用', '自己的分支可以改寫，rebase 讓它乾淨地接在最新的 main 之後', '`git rebase main`、解決衝突、`git push --force-with-lease`、等重新核准後合併', 'main 上多一個乾淨的 commit，歷史一直線；分支 ID 改變沒有關係，因為沒有人以它為基礎'],
          ['#8 有五個 commit：Skip weekends…、wip、fix typo、oops, forgot the test、address review comments', '過程中的 commit 對之後讀歷史的人沒有價值', '`gh pr merge 8 --squash`', 'main 上只有一個 `Skip weekends in due dates (#8)`，細節留在內文與 PR 頁面'],
          ['summer-list 你和 yu-chen 都會推送，需要 main 的新變更', '共用的分支不能改寫', '`git pull`、`git merge origin/main`、一般的 `git push`', '分支上多一個合併 commit，誰的 commit 都沒有遺失；之後合併 PR 時可以再選 squash'],
          ['#9 有兩個整理好、各自獨立的 commit', '每個 commit 都有意義，又想保持一直線', '`gh pr merge 9 --rebase`（或 `--merge` 保留 PR 的界線）', '兩個 commit 依序出現在 main 上'],
        ] },
        { type: 'p', text: '第一個情境會遇到衝突。kai 今天早上把 config.yml 的 max_books 改成 8，你的 late-fee 把下一行的 late_fee 改成 5；兩邊改到相鄰的行，Git 不敢替你決定，rebase 停在那個 commit 上，把兩個版本都寫進檔案，用衝突標記隔開。處理的步驟：' },
        { type: 'list', ordered: true, items: [
          '`git switch main`、`git pull`，讓本機的 main 是最新的；再 `git switch late-fee`。',
          '`git rebase main`：出現 `CONFLICT (content): Merge conflict in config.yml`，rebase 暫停。',
          '`cat config.yml` 看衝突：`<<<<<<< HEAD` 到 `=======` 之間是 main 的版本（rebase 時 HEAD 是正在接上去的 main），`=======` 到 `>>>>>>>` 之間是你的 commit 的版本。',
          '寫出最後應該有的內容：兩邊的修改都要保留（max_books: 8 與 late_fee: 5），並刪掉三行標記。這裡用 `printf` 覆寫整個檔案。',
          '`git add config.yml` 表示這個檔案已經解決，`git rebase --continue` 完成 rebase。想放棄就用 `git rebase --abort`，分支會回到 rebase 之前。',
          '`git push --force-with-lease` 更新 PR，等審查者重新核准（舊的核准已被撤銷），再合併。',
        ] },
        { type: 'p', text: '下面的例子只走到衝突出現，看清楚衝突標記與 `git status` 的說明，然後用 `git rebase --abort` 退回；真正解決它是第二個練習。' },
        { type: 'example', id: 'cicd02-conflict' },
        { type: 'callout', tone: 'warning', title: '衝突標記不會擋住你提交', text: 'Git 不檢查檔案裡還有沒有 `<<<<<<<`、`=======`、`>>>>>>>`：直接 `git add` 再 `git rebase --continue`，標記就跟著 commit 進了歷史，審查者如果沒看仔細也會被合併進 main，設定檔從此讀不出來。`git add` 之前一定先 `cat` 檔案確認。另一個常見的錯是只留自己的那一半，例如把 max_books 寫回 5：衝突是解決了，卻把 kai 早上的變更悄悄撤銷了。' },
        { type: 'callout', tone: 'note', title: '參考解答裡的 || true', text: '練習的參考解答必須每一步都成功（結束碼 0），所以會產生衝突的那一步寫成 `git rebase main || true`：`||` 的意思是「前一個指令失敗時才執行後面的指令」，`true` 什麼也不做、一定成功。你在終端機裡自己做的時候，直接輸入 `git rebase main` 就好。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd02-q-branch', prompt: '團隊規定每個變更都要在自己的分支上開發，再經由 Pull Request 合併進 main。下列哪一個是最主要的理由？',
      options: ['分支讓 Git 執行得比較快，提交與推送都不用等待', '分支會自動備份到另一台主機，就算筆電壞了，裡面的修改也不會遺失', '還沒完成或沒審查的修改不進 main，main 隨時能上線', '在分支上工作就不會和別人的修改發生衝突'],
      answer: 2,
      explanation: '分支把進行中的修改和共用的 main 隔開，變更要經過審查才合併，所以 main 一直保持可以上線的狀態。分支只是指向 commit 的名字，和速度無關；分支要推送才會到主機上，不會自動備份；分支也無法避免衝突，兩人改到同一處，合併時一樣會衝突，只是衝突發生在 PR 裡，而不是 main 上。',
    },
    {
      id: 'cicd02-q-stale', prompt: '你的 PR 已經被 kai 核准，你又推送了一個小修正。現在 `gh pr view` 顯示 `kai (Commented)`，`gh pr merge --squash` 說 the base branch policy prohibits the merge。原因是什麼？',
      options: ['分支保護撤銷了過時的核准，新的推送要等 kai 重新核准', 'kai 收回了他的核准，因為他不同意這個小修正', '推送新的 commit 會讓原本的 PR 自動關閉，必須重新開一個新的 PR 再送審', 'squash 不能用在推送過兩次的 PR，要改用 `--merge`'],
      answer: 0,
      explanation: '開啟撤銷過時的核准時，核准屬於被看過的那一版程式碼，新的推送讓它失效，gh 顯示成 Commented，核准數不足所以合併被擋。這不需要 kai 做任何事，也不代表他不同意；PR 不會因為推送而關閉，反而會更新成新內容；合併方式和推送次數無關，換成 `--merge` 一樣會被拒絕。',
    },
    {
      id: 'cicd02-q-gh006', prompt: '你忘了開分支，在 main 上提交後 `git push`，得到 `GH006: Protected branch update failed` 與 `At least 1 approving review is required`。下一步最恰當的是什麼？',
      options: ['改用 `git push --force`，強制推送可以略過審查的要求', '請管理員暫時關閉分支保護，推送完再打開', '用 `gh pr merge --admin` 直接把這個 commit 合併進 main，跳過等待審查的時間', '把 commit 留在新分支上推送並開 PR，本機 main 退回 `origin/main`'],
      answer: 3,
      explanation: '規則要求變更經過 PR 與核准，所以把 commit 留在一個新分支上送審，本機的 main 退回主機的位置，就符合流程又不會遺失工作。強制推送同樣會被保護規則拒絕；為了一個 commit 關掉保護，正是規則要防止的事；`--admin` 只有管理員能用，也是在繞過審查。',
    },
    {
      id: 'cicd02-q-flow', prompt: '下列哪一個團隊最適合採用 Git Flow（develop、release 與 hotfix 分支）？',
      options: ['一個每天部署十幾次的網頁服務，希望變更越快上線越好', '每季發布一版桌面軟體，還要替仍在用 2.x 的客戶修正問題的團隊', '一個三人的新創團隊，想要最短的回饋時間、最少的分支，以及最簡單的發布流程', '一個想取消程式碼審查、讓每個人直接推送的團隊'],
      answer: 1,
      explanation: 'Git Flow 的 release 與 hotfix 分支是為了有明確版本、發布前要穩定一段時間、還要維護舊版的產品，季度發布的桌面軟體正是這種情況。每天部署多次與追求最短回饋的團隊，適合短分支的主幹開發；Git Flow 也不是取消審查的方法，它的每條分支照樣經由 PR 合併。',
    },
    {
      id: 'cicd02-q-squash', prompt: '一個 PR 有五個 commit：`Skip weekends in due dates`、`wip`、`fix typo`、`oops, forgot the test`、`address review comments`。團隊希望 main 的歷史好讀，應該用哪一種方式合併？',
      options: ['`gh pr merge --rebase`，五個 commit 都接到 main 上，歷史仍是一直線', '`gh pr merge --merge`，保留五個 commit 並加一個合併 commit', '`gh pr merge --squash`，main 上只留一個以 PR 標題命名的 commit', '先把分支 `git push --force` 到 main，再關閉 PR'],
      answer: 2,
      explanation: 'squash 把整個 PR 壓成一個 commit，標題是 PR 標題加編號，過程中的訊息只留在內文，main 的每個 commit 都是一個完整的變更。rebase 方式會把 wip、fix typo 原樣搬到 main；merge commit 也保留它們，還多一個合併 commit；強制推送到受保護的 main 會被拒絕，而且跳過了合併的流程。',
    },
    {
      id: 'cicd02-q-shared', prompt: 'summer-list 是你和 yu-chen 都會推送的分支，現在需要 main 的新變更。哪一個做法最恰當？',
      options: ['`git rebase main` 之後 `git push --force`，讓分支保持一直線', '`git pull` 取得她的 commit，`git merge origin/main`，再一般地 `git push`', '先 `git fetch`，`git rebase main` 之後用 `git push --force-with-lease`，這樣一定不會蓋掉別人的 commit', '刪掉 summer-list，從最新的 main 重新開一個同名分支'],
      answer: 1,
      explanation: '共用的分支不能改寫歷史：拉下同事的 commit 再把 main 合併進來，只是新增一個合併 commit，一般推送就能成功，誰的工作都不會遺失。rebase 加 `--force` 會蓋掉她還沒被你拉下的 commit；先 fetch 再 `--force-with-lease`，租約檢查會通過，rebase 卻是從舊的位置做的，一樣會覆蓋她的 commit；刪掉重開則直接丟掉了分支上已有的工作。',
    },
    {
      id: 'cicd02-q-conflict', prompt: '`git rebase main` 停在衝突，config.yml 裡出現 `<<<<<<< HEAD`、`=======`、`>>>>>>>` 三行標記。正確的處理是什麼？',
      options: ['直接 `git add config.yml` 再 `git rebase --continue`，Git 會在提交時自動移除標記', '用 `git rebase --abort` 放棄，改用 `gh pr merge --admin` 讓主機處理衝突', '保留 `=======` 下面自己的版本，因為 rebase 是你發起的，你的版本優先', '把檔案改成最後應有的內容（保留兩邊的修改、刪掉標記），`git add` 後 `git rebase --continue`'],
      answer: 3,
      explanation: '衝突要由人決定最後的內容：兩邊各改了相鄰的設定，通常兩個修改都要留下，再移除標記、`git add` 標示已解決並繼續 rebase。Git 不會自動移除標記，直接 add 會把標記提交進歷史；`--admin` 不能解決衝突，有衝突的 PR 在主機上也無法合併；只留自己的版本，會悄悄撤銷同事已經合併的修改。',
    },
    {
      id: 'cicd02-q-linear', prompt: '團隊希望 main 的歷史上永遠沒有合併 commit。應該開啟哪一條分支保護規則？',
      options: ['要求線性歷史（required linear history）', '把需要的核准數提高到 2 個', '開啟撤銷過時的核准（dismiss stale reviews）', '不允許強制推送（allow force pushes 關閉）'],
      answer: 0,
      explanation: '要求線性歷史後，主機拒絕任何含有合併 commit 的推送，PR 也只能用 squash 或 rebase 方式合併，`--merge` 會被拒絕。核准數與撤銷過時的核准只管審查，不管歷史的形狀；不允許強制推送是防止改寫既有的歷史，合併 commit 仍然可以正常推送或由 PR 產生。',
    },
  ],
  terminal: {
    machines: [lab],
    examples: [
      {
        id: 'cicd02-branch', title: '在分支上修改，main 不受影響', machine: 'cicd02-lab',
        description: '先讓本機的 main 跟上主機，再開分支 readme-contact 提交一個修改；切回 main 時修改不見了，切回分支又回來。',
        steps: [
          { command: 'cd library', output: '' },
          { command: 'git pull', output: 'From https://github.example/tidepool/library\n   b6be30e..22f5d41  main        -> origin/main\n   ba19531..937af8f  summer-list -> origin/summer-list\n * [new branch]      barcode     -> origin/barcode\n * [new branch]      due-date    -> origin/due-date\n * [new branch]      holidays    -> origin/holidays\nUpdating b6be30e..22f5d41\nFast-forward\n config.yml | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)' },
          { command: 'git branch', output: '  late-fee\n* main\n  summer-list' },
          { command: 'git switch -c readme-contact', output: "Switched to a new branch 'readme-contact'" },
          { command: "echo 'Contact: desk@tidepool.example' >> README.md", output: '' },
          { command: 'git status -s', output: ' M README.md' },
          { command: "git commit -am 'Add the help desk address'", output: '[readme-contact 191441b] Add the help desk address\n 1 file changed, 1 insertion(+)' },
          { command: 'git log --oneline --graph -3', output: '* 191441b (HEAD -> readme-contact) Add the help desk address\n* 22f5d41 (origin/main, origin/HEAD, main) Allow 8 books per member\n* b6be30e Add catalog search' },
          { command: 'git switch main', output: "Switched to branch 'main'\nYour branch is up to date with 'origin/main'." },
          { command: 'cat README.md', output: '# library\n\nLoans and catalog for the Tidepool community library.' },
          { command: 'git switch readme-contact', output: "Switched to branch 'readme-contact'" },
          { command: 'cat README.md', output: '# library\n\nLoans and catalog for the Tidepool community library.\nContact: desk@tidepool.example' },
          { command: 'git branch', output: '  late-fee\n  main\n* readme-contact\n  summer-list' },
        ],
      },
      {
        id: 'cicd02-pull-request', title: '從被拒絕的推送到合併的 Pull Request', machine: 'cicd02-lab',
        description: '直接推送到受保護的 main 被 GH006 拒絕；把 commit 留在新分支上、讓 main 退回主機的位置，推送分支並開 PR。沒有核准時合併被拒絕，kai 審查之後以 squash 合併並刪除分支。',
        steps: [
          { command: 'cd library', output: '' },
          { command: 'git pull', output: 'From https://github.example/tidepool/library\n   b6be30e..22f5d41  main        -> origin/main\n   ba19531..937af8f  summer-list -> origin/summer-list\n * [new branch]      barcode     -> origin/barcode\n * [new branch]      due-date    -> origin/due-date\n * [new branch]      holidays    -> origin/holidays\nUpdating b6be30e..22f5d41\nFast-forward\n config.yml | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)' },
          { command: "echo 'Contact: desk@tidepool.example' >> README.md", output: '' },
          { command: "git commit -am 'Add the help desk address'", output: '[main 191441b] Add the help desk address\n 1 file changed, 1 insertion(+)' },
          { command: 'git push', output: "remote: error: GH006: Protected branch update failed for refs/heads/main.\nremote: error: At least 1 approving review is required by reviewers with write access.\nTo https://github.example/tidepool/library.git\n ! [remote rejected] main -> main (protected branch hook declined)\nerror: failed to push some refs to 'https://github.example/tidepool/library.git'" },
          { command: 'git branch readme-contact', output: '' },
          { command: 'git reset --hard origin/main', output: 'HEAD is now at 22f5d41 Allow 8 books per member' },
          { command: 'git switch readme-contact', output: "Switched to branch 'readme-contact'" },
          { command: 'git push -u origin readme-contact', output: "remote: \nremote: Create a pull request for 'readme-contact' on GitHub by visiting:\nremote:      https://github.example/tidepool/library/pull/new/readme-contact\nremote: \nTo https://github.example/tidepool/library.git\n * [new branch]      readme-contact -> readme-contact\nbranch 'readme-contact' set up to track 'origin/readme-contact'." },
          { command: "gh pr create --title 'Add the help desk address' --body 'Readers keep asking where to send questions.'", output: '\nCreating pull request for readme-contact into main in tidepool/library\n\nhttps://github.example/tidepool/library/pull/12' },
          { command: 'gh pr merge --squash', output: 'X Pull request tidepool/library#12 is not mergeable: the base branch policy prohibits the merge.\nTo have the pull request merged after all the requirements have been met, add the `--auto` flag.\nTo use administrator privileges to immediately merge the pull request, add the `--admin` flag.' },
          { command: 'sleep 300', output: '' },
          { command: 'gh pr view', output: 'Add the help desk address tidepool/library#12\nOpen • ann-wu wants to merge 1 commit into main from readme-contact • about 5 minutes ago\n+1 -0 • No checks\nReviewers: kai (Approved)\n\n  Readers keep asking where to send questions.\n\nView this pull request on GitHub: https://github.example/tidepool/library/pull/12' },
          { command: 'gh pr merge --squash --delete-branch', output: '✓ Squashed and merged pull request tidepool/library#12 (Add the help desk address)\nFrom https://github.example/tidepool/library\n * branch            main       -> FETCH_HEAD\n   22f5d41..aa19bb5  main       -> origin/main\nUpdating 22f5d41..aa19bb5\nFast-forward\n README.md | 1 +\n 1 file changed, 1 insertion(+)\n✓ Deleted local branch readme-contact and switched to branch main\n✓ Deleted remote branch readme-contact' },
          { command: 'git log --oneline -3', output: 'aa19bb5 (HEAD -> main, origin/main, origin/HEAD) Add the help desk address (#12)\n22f5d41 Allow 8 books per member\nb6be30e Add catalog search' },
        ],
      },
      {
        id: 'cicd02-methods', title: '三種合併方式留下的歷史', machine: 'cicd02-lab',
        description: '三個已經核准的 PR：#7 用 merge commit、#8 用 squash、#9 用 rebase 合併，拉下 main 之後看歷史的形狀與 squash 的訊息。',
        steps: [
          { command: 'cd library', output: '' },
          { command: 'gh pr list', output: '\nShowing 4 of 4 open pull requests in tidepool/library\n\nID   TITLE                       BRANCH    CREATED AT\n#11  Charge a late fee           late-fee  about 20 hours ago\n#9   Add holiday list            holidays  about 1 day ago\n#8   Skip weekends in due dates  due-date  about 1 day ago\n#7   Add barcode scanning        barcode   about 1 day ago' },
          { command: 'gh pr view 8', output: 'Skip weekends in due dates tidepool/library#8\nOpen • kai wants to merge 5 commits into main from due-date • about 1 day ago\n+8 -1 • No checks\nReviewers: yu-chen (Approved)\n\n  Books are never due on a Saturday or Sunday.\n\nView this pull request on GitHub: https://github.example/tidepool/library/pull/8' },
          { command: 'gh pr merge 7 --merge', output: '✓ Merged pull request tidepool/library#7 (Add barcode scanning)' },
          { command: 'gh pr merge 8 --squash', output: '✓ Squashed and merged pull request tidepool/library#8 (Skip weekends in due dates)' },
          { command: 'gh pr merge 9 --rebase', output: '✓ Rebased and merged pull request tidepool/library#9 (Add holiday list)' },
          { command: 'git pull', output: 'From https://github.example/tidepool/library\n   b6be30e..82880eb  main        -> origin/main\n   ba19531..937af8f  summer-list -> origin/summer-list\n * [new branch]      barcode     -> origin/barcode\n * [new branch]      due-date    -> origin/due-date\n * [new branch]      holidays    -> origin/holidays\nUpdating b6be30e..82880eb\nFast-forward\n config.yml   | 2 +-\n due.py       | 5 ++++-\n holidays.txt | 2 ++\n scan.py      | 2 ++\n test_due.py  | 4 ++++\n 5 files changed, 13 insertions(+), 2 deletions(-)\n create mode 100644 holidays.txt\n create mode 100644 scan.py\n create mode 100644 test_due.py' },
          { command: 'git log --oneline --graph -9', output: '* 82880eb (HEAD -> main, origin/main, origin/HEAD) Add New Year holiday\n* 23083f4 Add holiday list\n* 622d0d6 Skip weekends in due dates (#8)\n*   b38a25d Merge pull request #7 from tidepool/barcode\n|\\  \n| * b44785f (origin/barcode) Add barcode scanning\n* | 22f5d41 Allow 8 books per member\n|/  \n* b6be30e Add catalog search\n* e4bebd9 Initial commit' },
          { command: 'git log -1 --format=%B HEAD~2', output: 'Skip weekends in due dates (#8)\n\n* Skip weekends in due dates\n\n* wip\n\n* fix typo\n\n* oops, forgot the test\n\n* address review comments\n' },
        ],
      },
      {
        id: 'cicd02-shared', title: '共用分支：rebase 加強制推送被擋下', machine: 'cicd02-lab',
        description: 'summer-list 上有 yu-chen 剛推送、你還沒拉下的 commit。rebase 之後一般推送與 --force-with-lease 都被拒絕；退回 rebase 之前，pull 再 merge main，一般推送就成功。',
        steps: [
          { command: 'cd library', output: '' },
          { command: 'git switch summer-list', output: "Switched to branch 'summer-list'\nYour branch is up to date with 'origin/summer-list'." },
          { command: 'git log --oneline --graph -3', output: '* ba19531 (HEAD -> summer-list, origin/summer-list) Start the summer reading list\n* e4bebd9 Initial commit' },
          { command: 'git rebase main', output: 'Successfully rebased and updated refs/heads/summer-list.' },
          { command: 'git push', output: "To https://github.example/tidepool/library.git\n ! [rejected]        summer-list -> summer-list (fetch first)\nerror: failed to push some refs to 'https://github.example/tidepool/library.git'\nhint: Updates were rejected because the remote contains work that you do not have locally; integrate it first (git pull) and push again." },
          { command: 'git push --force-with-lease', output: "To https://github.example/tidepool/library.git\n ! [rejected]        summer-list -> summer-list (stale info)\nerror: failed to push some refs to 'https://github.example/tidepool/library.git'" },
          { command: 'git reset --hard origin/summer-list', output: 'HEAD is now at ba19531 Start the summer reading list' },
          { command: 'git pull', output: 'From https://github.example/tidepool/library\n   b6be30e..22f5d41  main        -> origin/main\n   ba19531..937af8f  summer-list -> origin/summer-list\n * [new branch]      barcode     -> origin/barcode\n * [new branch]      due-date    -> origin/due-date\n * [new branch]      holidays    -> origin/holidays\nUpdating ba19531..937af8f\nFast-forward\n summer.txt | 2 ++\n 1 file changed, 2 insertions(+)' },
          { command: 'cat summer.txt', output: 'Moon Tides\nThe Lantern Fish\nSand Castles' },
          { command: 'git merge origin/main', output: "Merge made by the 'ort' strategy.\n config.yml | 2 +-\n search.py  | 2 ++\n 2 files changed, 3 insertions(+), 1 deletion(-)\n create mode 100644 search.py" },
          { command: 'git push', output: 'To https://github.example/tidepool/library.git\n   937af8f..1afeed3  summer-list -> summer-list' },
          { command: 'git log --oneline --graph -5', output: "*   1afeed3 (HEAD -> summer-list, origin/summer-list) Merge remote-tracking branch 'origin/main' into summer-list\n|\\  \n| * 22f5d41 (origin/main, origin/HEAD) Allow 8 books per member\n| * b6be30e (main) Add catalog search\n* | 937af8f Add two picture books\n* | ba19531 Start the summer reading list\n|/  " },
        ],
      },
      {
        id: 'cicd02-conflict', title: '衝突長什麼樣子', machine: 'cicd02-lab',
        description: '讓 main 跟上主機後把 late-fee rebase 上去：kai 與你改了相鄰的兩行，rebase 停在衝突；看完衝突標記與 git status 的說明後，用 --abort 退回。',
        steps: [
          { command: 'cd library', output: '' },
          { command: 'git switch main', output: "Already on 'main'\nYour branch is up to date with 'origin/main'." },
          { command: 'git pull', output: 'From https://github.example/tidepool/library\n   b6be30e..22f5d41  main        -> origin/main\n   ba19531..937af8f  summer-list -> origin/summer-list\n * [new branch]      barcode     -> origin/barcode\n * [new branch]      due-date    -> origin/due-date\n * [new branch]      holidays    -> origin/holidays\nUpdating b6be30e..22f5d41\nFast-forward\n config.yml | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)' },
          { command: 'git switch late-fee', output: "Switched to branch 'late-fee'\nYour branch is up to date with 'origin/late-fee'." },
          { command: 'git rebase main', output: 'Auto-merging config.yml\nCONFLICT (content): Merge conflict in config.yml\nerror: could not apply f71f2d9... Charge a late fee\nhint: Resolve the conflicts, mark them resolved with "git add/rm <conflicted_files>", then run "git rebase --continue".\nCould not apply f71f2d9... Charge a late fee' },
          { command: 'cat config.yml', output: 'loan_days: 14\n<<<<<<< HEAD\nmax_books: 8\nlate_fee: 0\n=======\nmax_books: 5\nlate_fee: 5\n>>>>>>> f71f2d9 (Charge a late fee)' },
          { command: 'git status', output: 'interactive rebase in progress; onto 22f5d41\nYou are currently rebasing branch \'late-fee\' on \'22f5d41\'.\n  (fix conflicts and then run "git rebase --continue")\n\nUnmerged paths:\n  (use "git add <file>..." to mark resolution)\n	both modified:   config.yml\n\nno changes added to commit (use "git add" and/or "git commit -a")' },
          { command: 'git rebase --abort', output: '' },
          { command: 'git log --oneline -2', output: 'f71f2d9 (HEAD -> late-fee, origin/late-fee) Charge a late fee\nb6be30e Add catalog search' },
        ],
      },
    ],
    exercises: [
      {
        id: 'cicd02-ex-pr', title: '用 Pull Request 加上週六開館時間', machine: 'cicd02-lab',
        statement: '圖書館決定週六 10:00–16:00 也開館。在 ~/library 先讓 main 跟上主機（`git pull`），開分支 sat-hours，在 hours.txt 最後加上一行 `Sat 10:00-16:00`，提交（訊息 Add Saturday hours）並推送，開一個標題為 Add Saturday hours 的 Pull Request（說明自己寫）。等審查者核准後，依團隊慣例用 squash 合併，並刪除分支。',
        checks: [
          { kind: 'pull-request', repo: LIBRARY, head: 'sat-hours', state: 'merged', method: 'squash', approvals: 1 },
          { kind: 'branch', repo: LIBRARY, name: 'main', file: { path: 'hours.txt', content: `${HOURS}Sat 10:00-16:00\n` }, message: '^Add Saturday hours \\(#\\d+\\)\\n' },
          { kind: 'branch', repo: LIBRARY, name: 'sat-hours', absent: true },
        ],
        solution: [...SAT_BRANCH, 'git push -u origin sat-hours', `gh pr create ${PR_TITLE}`, 'sleep 300', 'gh pr merge --squash --delete-branch'],
        mistakes: [
          { commands: ['cd library', 'git pull', "echo 'Sat 10:00-16:00' >> hours.txt", "git commit -am 'Add Saturday hours'", 'git push'], why: '在 main 上提交並直接推送：受保護的 main 以 GH006 拒絕，主機上沒有任何改變，也沒有 Pull Request' },
          { commands: ['cd library', 'git pull', "echo 'Sat 10:00-16:00' >> hours.txt", "git commit -am 'Add Saturday hours'", `gh pr create ${PR_TITLE}`], why: '從 main 開 PR：main 不能合併進 main 自己，gh 回報兩者之間沒有 commit，PR 沒有建立' },
          { commands: [...SAT_BRANCH, 'git push -u origin sat-hours', `gh pr create ${PR_TITLE}`, 'gh pr merge --squash --delete-branch'], why: '沒有等審查就合併自己的 PR：還沒有任何核准，分支保護拒絕合併' },
          { commands: [...SAT_BRANCH, 'git push -u origin sat-hours', `gh pr create ${PR_TITLE}`, 'sleep 300', 'gh pr merge --merge --delete-branch'], why: '用了 merge commit，不是團隊慣例的 squash' },
          { commands: [...SAT_BRANCH, 'git push -u origin sat-hours', `gh pr create ${PR_TITLE}`, 'sleep 300', 'gh pr merge --squash'], why: '合併了但沒有刪除用完的分支 sat-hours' },
        ],
        hints: ['先 `git pull`，再 `git switch -c sat-hours`', "`echo 'Sat 10:00-16:00' >> hours.txt` 之後 `git commit -am 'Add Saturday hours'`", '`git push -u origin sat-hours`，再 `gh pr create --title … --body …`', 'kai 大約 5 分鐘後審查：`sleep 300`，然後 `gh pr merge --squash --delete-branch`'],
        explanation: '受保護的 main 只接受經過 PR 與核准的變更：在分支上提交、推送、開 PR，等審查者核准後合併。squash 讓 main 上只多一個 `Add Saturday hours (#12)`，`--delete-branch` 刪除主機與本機的分支，並把合併後的 main 拉回你的筆電。',
      },
      {
        id: 'cicd02-ex-update', title: '讓衝突的 PR #11 跟上 main', machine: 'cicd02-lab',
        statement: '你昨天開的 PR #11（分支 late-fee，把 late_fee 改成 5）已經被核准，但 kai 今天早上把 max_books 改成 8 合併進了 main，現在 #11 和 main 衝突、無法合併。late-fee 只有你在用，團隊對這種只有一個 commit 的 PR 用 rebase 方式合併。在 ~/library 讓 main 跟上主機，把 late-fee rebase 到最新的 main 上，解決 config.yml 的衝突（兩邊的修改都要保留：max_books: 8 與 late_fee: 5），用 `--force-with-lease` 推送，等重新核准後以 rebase 方式合併 #11 並刪除分支。',
        checks: [
          { kind: 'pull-request', repo: LIBRARY, number: 11, state: 'merged', method: 'rebase', approvals: 1 },
          { kind: 'branch', repo: LIBRARY, name: 'main', file: { path: 'config.yml', content: config(8, 5) }, message: '^Charge a late fee\\n$', linear: true },
        ],
        solution: [...UPDATE_MAIN, 'git rebase main || true', RESOLVED, 'git add config.yml', 'git rebase --continue', 'git push --force-with-lease', 'sleep 300', 'gh pr merge 11 --rebase --delete-branch'],
        mistakes: [
          { commands: [...UPDATE_MAIN, 'git rebase main || true', 'git add config.yml', 'git rebase --continue', 'git push --force-with-lease', 'sleep 300', 'gh pr merge 11 --rebase --delete-branch'], why: '沒有編輯就 git add：衝突標記被提交，連同標記一起合併進了 main' },
          { commands: [...UPDATE_MAIN, 'git rebase main || true', "printf 'loan_days: 14\\nmax_books: 5\\nlate_fee: 5\\n' > config.yml", 'git add config.yml', 'git rebase --continue', 'git push --force-with-lease', 'sleep 300', 'gh pr merge 11 --rebase --delete-branch'], why: '只留了自己的版本：max_books 被改回 5，kai 的變更被悄悄撤銷' },
          { commands: [...UPDATE_MAIN, 'git rebase main || true', RESOLVED, 'git add config.yml', 'git rebase --continue', 'git push', 'sleep 300', 'gh pr merge 11 --rebase --delete-branch'], why: 'rebase 之後用一般的 git push：主機拒絕改寫分支，PR 仍是舊的、衝突的版本，無法合併' },
          { commands: [...UPDATE_MAIN, 'git rebase main || true', RESOLVED, 'git add config.yml', 'git rebase --continue', 'git push --force-with-lease', 'gh pr merge 11 --rebase --delete-branch'], why: '推送後沒有等待：舊的核准已被撤銷，新的版本還沒有人核准，合併被拒絕' },
          { commands: [...UPDATE_MAIN, 'git merge main || true', RESOLVED, 'git add config.yml', 'git commit --no-edit', 'git push', 'sleep 300', 'gh pr merge 11 --rebase --delete-branch'], why: '把 main 合併進分支：分支多了合併 commit，GitHub 以 rebase 方式合併時要重放原本的 commit，又遇到同一個衝突而拒絕（This branch can\'t be rebased）' },
        ],
        hints: ['`git switch main`、`git pull`，再 `git switch late-fee`', '`git rebase main` 出現衝突後，用 `cat config.yml` 看兩邊的版本', "`printf 'loan_days: 14\\nmax_books: 8\\nlate_fee: 5\\n' > config.yml`，`git add config.yml`，`git rebase --continue`", '`git push --force-with-lease`，`sleep 300` 等 kai 重新核准，`gh pr merge 11 --rebase --delete-branch`'],
        explanation: '只有自己在用的分支可以 rebase：你的 commit 被重新接在 kai 的 commit 之後，衝突在你的筆電上解決，兩邊的修改都保留。改寫過的分支要用 `--force-with-lease` 推送；推送讓舊的核准失效，所以要等重新核准。最後以 rebase 方式合併，main 上多一個 `Charge a late fee`，歷史仍是一直線。',
      },
      {
        id: 'cicd02-ex-read', title: '讀出 main 的保護規則', machine: 'cicd02-lab',
        statement: '新來的志工工程師問你：library 的 main 合併前要幾個核准？推送新的 commit 之後，舊的核准還算不算？可不可以強制推送？要不要求線性歷史？在 ~/library 用 `gh api` 讀出 main 的分支保護設定，從輸出找到答案。',
        checks: [{ kind: 'output', fromCommand: '^gh api ' }],
        solution: ['cd library', 'gh api repos/{owner}/{repo}/branches/main/protection'],
        mistakes: [
          { commands: ['cd library', 'gh api repos/{owner}/{repo}/branches/late-fee/protection'], why: '讀成 late-fee 分支：它沒有保護，回應是 Branch not protected（HTTP 404）' },
          { commands: ['cd library', 'gh pr view 11'], why: 'PR 的頁面只有這個 PR 的審查狀態，看不到分支保護的規則' },
        ],
        variants: [{ label: '兩個核准與線性歷史', files: [], forge: STRICTER }],
        hints: ['端點是 `repos/{owner}/{repo}/branches/main/protection`，gh 會依 origin 代入 tidepool/library', '答案在 `required_approving_review_count`、`dismiss_stale_reviews`、`allow_force_pushes`、`required_linear_history`'],
        explanation: '`gh api` 直接讀主機的 REST API，比問人或看文件可靠：`required_approving_review_count` 是需要的核准數，`dismiss_stale_reviews` 為 true 表示推送新的 commit 會撤銷舊的核准，`allow_force_pushes` 與 `required_linear_history` 的 `enabled` 回答另外兩個問題。設定換了，同一個指令讀到的就是新的規則。',
      },
      {
        id: 'cicd02-ex-protect', title: '為新的儲存庫設定分支保護', machine: 'cicd02-lab',
        statement: '團隊新開了儲存庫 tidepool/events，你是它的管理員，main 目前沒有任何保護。在 ~/events 用 `gh api` 替 main 設定分支保護：合併前需要 1 個核准、要求線性歷史、不允許強制推送，管理員也要遵守（enforce_admins 為 true）；不要求狀態檢查（null），也沒有推送限制（restrictions 為 null）。',
        checks: [{ kind: 'protection', repo: EVENTS, branch: 'main', approvals: 1, linear: true, forcePush: false }],
        solution: ['cd events', PROTECT],
        mistakes: [
          { commands: ['cd events', 'gh api repos/{owner}/{repo}/branches/main/protection'], why: '只讀取了設定（目前沒有保護，HTTP 404），沒有用 -X PUT 修改' },
          { commands: ['cd events', "gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F required_status_checks=null -F enforce_admins=true -F 'required_pull_request_reviews[required_approving_review_count]=1' -F required_linear_history=true"], why: '少了必要的 restrictions 欄位：主機回 HTTP 422，設定沒有改變' },
          { commands: ['cd events', 'gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F required_status_checks=null -F enforce_admins=true -F required_pull_request_reviews=null -F restrictions=null -F required_linear_history=true'], why: 'required_pull_request_reviews 寫成 null：main 有了保護，卻不要求 Pull Request 審查' },
          { commands: ['cd events', "gh api -X PUT repos/{owner}/{repo}/branches/main/protection -F required_status_checks=null -F enforce_admins=true -F 'required_pull_request_reviews[required_approving_review_count]=1' -F restrictions=null"], why: '沒有要求線性歷史：省略的 required_linear_history 就是 false' },
          { commands: ['cd library', PROTECT], why: '在 library 執行：你在那裡只有寫入權限，主機回 HTTP 403，events 也沒有被設定' },
        ],
        hints: ['`gh api -X PUT repos/{owner}/{repo}/branches/main/protection`，後面用 `-F 欄位=值` 給設定', '四個必要欄位：required_status_checks、enforce_admins、required_pull_request_reviews、restrictions', "核准數寫成 `-F 'required_pull_request_reviews[required_approving_review_count]=1'`，再加 `-F required_linear_history=true`"],
        explanation: 'PUT 送出整份保護設定：`required_pull_request_reviews` 的核准數 1 讓 main 只能經由核准的 PR 修改，`required_linear_history` 讓 main 只接受 squash 或 rebase 方式的合併，強制推送在保護規則下預設不允許，`enforce_admins` 讓管理員也不能繞過。設定之後可以用同一個端點的 GET 確認。',
      },
    ],
  },
};
