# LNX-0：Linux 系統島的 `terminal` 課程能力

> 2026-11-22。目標：讓 Linux 系統島（LNX）的課可以撰寫、驗證、發布；本階段不寫 LNX 課程內容，也不加新指令。之後的進度與下一批由 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md) 計算。

## 1. 既有的基礎

P7 的 Linux Terminal Simulator（`/learn/linux-terminal`）已經有純函式的引擎：

| 檔案 | 內容 |
|---|---|
| `src/lib/terminal/fs.ts` | 記憶體中的檔案系統：路徑正規化、權限位元、每個操作回傳新狀態（重設就是回到初始狀態） |
| `src/lib/terminal/shell.ts` | 指令直譯器：`pwd`、`ls`、`cd`、`mkdir`、`touch`、`cat`、`cp`、`mv`、`rm`、`chmod`、`echo`（含 `>`、`>>`）、`whoami`、`clear`、`help`；拒絕管線、串接、變數與背景執行 |
| `src/lib/terminal/tasks.ts` | 實驗的 7 個練習任務，只看檔案系統的結果 |

LNX-0 把它變成課程能力，不改實驗的行為（`tests/terminal.test.ts` 與實驗元件不變）。

## 2. 引擎的擴充（向下相容）

| 變更 | 預設值 | 與之前相同的理由 |
|---|---|---|
| `run(state, input, profile = LAB_PROFILE)` | `LAB_PROFILE` 是原本的指令表 | 不給 profile 的呼叫行為不變；`help` 只列出 profile 的指令（實驗的輸出逐字相同）；不在 profile 的指令是 `command not found` |
| `FsNode.group?` | 擁有者的名字（使用者私人群組） | 群組權限位元只在使用者屬於節點的群組時才使用 |
| `FsState.groups?` | 只有和使用者同名的群組 | 預設狀態下只有擁有者自己在節點的群組裡，所以群組位元從不決定任何事，和 P7 一樣 |
| `FsState.host?` | `logic-island` | 提示字元 `learner@web-01:~$`；root 的提示字元以 `#` 結尾（實驗沒有 root 工作階段） |
| `ls -l` 的群組欄、`echo >` 覆寫、`cp` | — | 群組欄顯示節點的群組（預設＝擁有者，和之前一樣）；覆寫檔案保留模式、擁有者與群組；複製的檔案屬於使用者與使用者的群組 |

profile 是之後引擎階段的開關：每個階段把新指令放在自己的 profile，課程選用時才生效，舊課與實驗不受影響。

## 3. 課程資料（`src/lib/terminal/lesson.ts`，`LessonContent.terminal`）

```ts
terminal: {
  machines: [{ id, title, user, cwd, host?, home?, groups?, profile?, system?, mounts?, files: [{ path, kind, mode, owner, group?, content?, target? }] }],
  examples: [{ id, title, description, machine, steps: [{ command, output }] }],
  exercises: [{ id, title, machine, statement, checks, solution: string[], mistakes: [{ commands, why }], variants?: [{ label, files }], hints, explanation }],
}
```

- **機器**：`/` 隱含（root、0755），其餘每個檔案與目錄都要列出，父目錄先列；`home` 預設 `/home/<user>`（root 是 `/root`）。`kind: 'link'` 與 `target`、`profile`、`system`、`mounts` 是 E1 的欄位，只有 `profile: 'files'` 以上的機器可以使用（見 §9）；E3 的 `accounts`、`umask` 見 §11.3；E4–E6 的 `now`、`boot`、`load`、`cpus`、`memory`、`processes`、`packages`、`services`、`programs`、`journal` 見 §12.6、§13.3、§14.6。
- **範例**：在機器上依序重播指令；每一步的 `output` 必須**完全等於**引擎印出的文字（多行以 `\n` 連接，錯誤訊息也算，沒有輸出就是 `''`）。頁面以靜態紀錄呈現，提示字元由重播算出。
- **練習的檢查**（只看結果，不看寫法）：

| 種類 | 意義 |
|---|---|
| `exists`（可指定 `file`／`dir`）、`absent` | 路徑存在或不存在 |
| `mode`、`owner`（可含 `group`） | 權限位元、擁有者與群組 |
| `content` | 檔案內容完全相同 |
| `cwd` | 最後的目前位置 |
| `output` | 學習者的某一個指令印出的文字，完全等於參考解答最後一個指令在**同一台機器**上印出的文字 |
| `unchanged` | 該路徑與底下的一切和開始時相同（例如「原檔要保留」） |
| `link`（E1） | 該路徑是符號連結，指向 `target` 所指的位置（相對目標從連結所在的目錄算起，所以相對與絕對的寫法都通過） |

- **變體**（`variants`）：在原機器上替換或新增一些檔案。檢查時，學習者的指令會在原機器與每個變體上各重新執行一次，每個檢查都要在所有機器上成立。這讓 `output` 檢查無法靠直接打出答案通過（`echo 3 errors` 在另一份報告上就不對）。

## 4. 驗證（`terminalContentProblems`，接在非程式課的 `validateDatabaseContent`）

- 機器：id 不重複、使用者／群組／主機名稱合法；路徑是絕對且正規化、不重複、父目錄已列出；模式 0–0777、擁有者合法、只有檔案有內容；不超過引擎的 `LIMITS`（節點數、名稱長度、深度、檔案長度、指令長度）與 `TERMINAL_LIMITS`（機器數、步驟數、解答長度、變體數）；`cwd` 與家目錄是機器裡的目錄。
- 範例：機器存在；每一步重播後的輸出和寫下的完全相同。
- 練習：機器存在；至少一個檢查、一個常見錯誤；參考解答不印出任何錯誤、在原機器與每個變體上通過所有檢查；**還沒輸入任何指令時不通過**；**每個常見錯誤都不通過**；有 `output` 檢查時，參考解答最後一個指令要印出東西，而且至少一個變體的參考輸出和原機器不同。
- 範例計入課程的範例數（至少 3 個，都要在段落中以 `{ type: 'example', id }` 出現）、練習計入練習數，沿用非程式課的檢查。
- `validateContent` 的能力對照多了一項：`terminal` 能力 ⇔ 有 `content.terminal`，兩個方向都檢查；`terminal-sim` 活動需要 `terminal` 能力。其他能力的意義不變。

## 5. 課程頁面（`src/components/curriculum/terminal-lesson.tsx`）

經由 `DatabaseLessonBody` 呈現（和 CN-0 相同）：

- 範例：左邊是 `<pre>` 指令紀錄（提示字元、指令、輸出），右邊是執行前機器的文字樹（權限、擁有者:群組、目前位置）；文字一律經過 `shownText`。手機上改為單欄，長行在框內換行，樹在框內捲動，頁面不會橫向捲動。
- 練習：嵌入式終端機。輸出區 `role="log"`、`aria-live="polite"`；輸入框有標籤（提示字元）與 `aria-label`（含目前位置），關閉自動大寫、自動校正與拼字檢查，字級 16px（iOS 不會放大）；Enter 執行，↑／↓ 叫回之前的指令；「檢查」把重設後輸入的所有指令重新執行並宣告每個檢查的結果（通過／未通過與原因）；「重設」讓機器回到開始的樣子並把焦點放回輸入框；「目前的檔案」可展開看即時的檔案樹。一個練習最多 300 個指令（超過時請學習者重設）。
- 沒有動畫與平滑捲動，所以減少動態的設定不需要另外處理；不新增任何執行期套件。
- 參考解答以 `$ 指令` 列出，加上說明。

## 6. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-lesson.test.ts` | 群組位元、主機與 root 提示字元、profile（預設與實驗相同；較窄的 profile 拒絕其他指令）、覆寫保留群組；機器建立與重播；正解與其他正確寫法通過、初始機器與常見錯誤不通過並說明原因、`output` 在變體上重播；驗證器對每一種錯誤資料都回報 |
| `tests/terminal-capability.test.ts` | 以 `terminalFromBlueprint` 建立的合成 LNX 課（加上內容）通過 `validateContent`；在預備島嶼時被 `validateCurriculum` 拒絕；DB16 帶 `content.terminal` 被拒絕、LNX 課沒有內容也被拒絕；`terminal-sim` 需要 `terminal`；沒有已發布的課有 `terminal`；`validateCurriculum(curriculum)` 是 `[]`；一般的 `run` 仍拒絕管線 |
| `tests/terminal-lesson-dom.test.tsx` | 範例的紀錄與文字樹；終端機的標籤、`aria-live`、指令歷史；輸入正解後「檢查」全部通過，「重設」還原；直接打出答案在變體上不通過 |
| `tests/terminal-e1.test.ts` | E1：兩個 profile 的分界（實驗拒絕每個 E1 指令、萬用字元、選項與多來源）、`uname`／`hostname`、每個指令的 `man` 與 `--help`、`df`／`du` 的欄位與數字、萬用字元（無符合、隱藏檔、方括號、引號、跳脫）、符號連結（迴圈、懸空、跳數上限、`rm`／`mv`／`cp`）、多來源的錯誤、`ls -d`／`-h`、不改動輸入狀態與節點上限、機器新欄位的驗證 |
| `tests/terminal-e2.test.ts` | E2：`streams` profile 的分界（實驗與 `files` 仍拒絕管線與 E2 指令）、三段以上的管線、錯誤輸出的去向、每一種重新導向的排列（`2>&1` 的前後順序、`>&2`、`/dev/null`、目錄、權限、先截斷）、每個指令與選項、輸出與段數上限、子 Shell、不改動輸入狀態、`getopt`／`compilePattern`／`commandNames`、擬真度修正 1–5、`streams` 機器的課程資料 |
| `tests/terminal-e3.test.ts` | E3：`users` profile 的分界、產生的帳號檔（`/etc/shadow` 讀不到）、`id`／`groups`／`whoami`、`sudo`（允許、拒絕、`-u`、內建指令、重新導向仍是自己的、`sudo tee`）、`useradd`／`usermod`（`-G` 與 `-aG`）／`groupadd`／`newgrp`、非 root 的 `chown` 被拒、擁有者改成自己所屬的群組、`-R`、`umask` 對新檔案與目錄的影響、群組位元、`chmod -R`、帳號資料與帳號檢查的驗證 |
| `tests/terminal-e4.test.ts`、`terminal-e5.test.ts`、`terminal-e6.test.ts` | E4–E6，見 §14.7 |
| `tests/support/terminal-fixture.ts` | 合成的機器（web-01、devs 群組可寫的團隊目錄、只有 adm 能讀的日誌）、三段紀錄、兩個練習；E1 另有 `files` profile 的 srv-01（系統資訊、兩個掛載點、符號連結、日誌檔）、三段紀錄、三個練習；E2 有 `streams` 的 log-01（存取日誌、CSV、只有 root 能讀的日誌）、三段紀錄、兩個練習；E3 有 `users` 的 team-01（learner 在 sudo、alice 在 devs、服務帳號、devs 的團隊目錄）、三段紀錄、三個練習；只供測試 |

## 7. 島嶼登錄

- `PREPARED_ISLAND_IDS = ['linux-systems']`、`ISLAND_PREFIX['linux-systems'] = 'LNX'`、`UNITS['linux-systems'] = []`。
- `terminalFromBlueprint(id, summary, minutes)`（`lessons.ts`）：標題、目標、概念、難度、先修取自藍圖。活動對應：`terminal-sim` 與 `case-study-board`（LNX01，分析板尚未建置）→ `terminal-sim`（`['terminal']`）；`protocol-sequence`（LNX12 SSH）→ `network-sequence`（`['terminal', 'network-protocol']`）；`challenge-stages`（LNX15）→ `challenge-stages`（`['terminal', 'visualization']`）。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 LNX 課；15 堂仍是規劃中，沒有頁面，島嶼狀態仍是 `planned`。已發布的課、旗標、3D 世界、GLB 與島嶼座標都沒有改。

## 8. LNX 的批次與引擎階段

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。

| 批次 | 課程 | 需要的引擎階段 |
|---|---|---|
| LNX-1 | LNX01–LNX04 | **E1**（已完成，見 §9）：`uname`、`hostname`、`man`／`--help`、`df`／`du`、萬用字元（glob）、`ln -s`（啟用 `link`）、多來源的 `cp`／`mv` |
| LNX-2 | LNX05–LNX07 | **E2**（已完成，見 §10）`streams`：管線、重新導向（`>`、`>>`、`<`、`2>`、`2>>`、`2>&1`、`/dev/null`）、`less`／`head`／`tail`／`grep`／`sort`／`uniq`／`wc`／`cut`／`tr`／`tee`；**E3**（已完成，見 §11）`users`：使用者與群組資料、`/etc/passwd`／`/etc/group`、`id`、`groups`、`useradd`、`usermod`、`groupadd`、`newgrp`、`sudo`、`chown`、`chgrp`、`umask`；E2 同時修正 `files` 的五項擬真度（§10.6） |
| LNX-3 | LNX08–LNX11 | **E4**（已完成，見 §12）`processes`：固定時鐘、行程表、`ps`／`top`／`kill`（訊號與宣告的反應）／`pgrep`／`pidof`／`pkill`、`sleep &`／`jobs`／`fg`／`bg`、`$?` 與結束碼；**E5**（已完成，見 §13）`packages`：套件庫與套件資料、`apt`（update／install／remove／purge／autoremove／upgrade／list／show／policy）、`apt-mark`、`dpkg -l`／`-L`／`-s`，dnf 只在課文比較；**E6**（已完成，見 §14）`services`：unit 檔與 daemon-reload、`systemctl`、Restart= 與啟動上限、journal 與 `journalctl`、`/var/log` 與輪替（文字說明）。全部是固定的模擬資料，不執行真實程式 |
| LNX-4 | LNX12–LNX14 | **E7** SSH（金鑰與連線以網路情境與模擬機器呈現）、**E8** 有界的 Bash 直譯器（變數、條件、迴圈，有步數上限）、**E9** cron 與 systemd timer |
| LNX-5 | LNX15 | 綜合專題（`challenge-stages`），單獨一批 |

先修：LNX01 沒有先修；LNX02–LNX15 的同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。島外的 DKR、SRV、CLD、CICD 有課以 LNX 為先修，都還沒有課程能力。

## 9. 引擎階段 E1：`files` profile

> 2026-11-22。供 LNX01–LNX04 使用。實驗（`/learn/linux-terminal`）與不指定 profile 的 `run` 完全不變：`tests/terminal.test.ts` 沒有修改；在實驗輸入 E1 的指令仍是 `command not found`，萬用字元照字面處理，`ls -h`、`ls -d` 是無效選項，`cp a b dir` 仍是「一次只處理一個來源」。

### 9.1 選用方式

| 項目 | 內容 |
|---|---|
| `FILES_PROFILE`（`shell.ts`） | `id: 'files'`；指令是實驗的 14 個加上 `uname`、`hostname`、`man`、`df`、`du`、`ln`、`readlink`；`features: ['glob', 'help-option', 'multi-source', 'ls-extra']` |
| `ShellProfile.features?` | 指令以外的行為開關；`LAB_PROFILE` 沒有任何 feature |
| `TerminalMachine.profile?: 'lab' \| 'files'` | 預設 `lab`。範例的重播、練習的檢查與嵌入式終端機都用機器的 profile（`profileOf(machine)`）；`replay`、`checkTerminalExercise`、`terminalContentProblems` 仍可明確傳入 profile 覆寫 |
| 驗證 | 只有 `files` 機器可以有 `link`、`system`、`mounts`；範例、參考解答與常見錯誤若使用其他階段的指令（例如在 `lab` 機器上用 `uname`），回報「`uname is not in the lab profile of machine web`」。打錯的指令（例如 `sl`）仍可在範例中示範 `command not found` |

### 9.2 指令與格式

| 指令 | 輸出 |
|---|---|
| `uname [-asnrvmo]` | 沒有選項等於 `-s`；欄位固定依 s n r v m o 的順序，以空格連接：`Linux srv-01 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`。不支援 `-p`／`-i`（GNU 在 Linux 上通常印 `unknown`，`-a` 省略它們）。欄位來自機器的 `system`（`kernel`、`release`、`version`、`machine`、`os`），沒寫的用 `DEFAULT_SYSTEM`（`Linux`、`6.8.0-sim`、`#1 SMP PREEMPT_DYNAMIC`、`x86_64`、`GNU/Linux`）。`version` 是固定文字，不含日期 |
| `hostname` | 機器的 `host`（預設 `logic-island`）；非 root 修改時 `hostname: you must be root to change the host name`；root 可以改（只改這個工作階段，不改 `/etc/hostname`） |
| `man 指令…`、`指令 --help` | 每個 profile 內的指令都有固定的簡短說明（`manual.ts`）。`man` 的段落是 `NAME`、`SYNOPSIS`、`DESCRIPTION`、`OPTIONS`，內文是繁體中文；`--help` 以「用法：」開頭。`man` 不在 profile 的指令：`No manual entry for X`；`man` 沒有參數：`What manual page do you want?` 與 `For example, try 'man man'.`。`--help` 出現在 `--` 之前的任何位置都有效；`echo --help` 照 bash 印出 `--help` |
| `df [-h] [-T] [路徑…]` | 讀機器宣告的 `mounts`（掛載點、裝置、類型、`size`、`used`，單位是 1K 區塊）。欄位依 GNU df：`Filesystem`（至少 14 寬，靠左）、`Type`（`-T`，至少 4）、`1K-blocks`／`Size`、`Used`、`Available`／`Avail`（至少 5，靠右）、`Use%`（至少 4，靠右）、`Mounted on`；欄與欄之間一個空格。`Avail = size − used`（模擬環境沒有保留區塊）；`Use% = ⌈used × 100 ÷ size⌉`，`size` 為 0 時是 `-`。指定路徑時列出包含它的最長掛載點；不存在的路徑先印 `df: X: No such file or directory`；沒有掛載表時 `df: no file systems processed`。數字是宣告的固定值，不隨模擬的檔案變化 |
| `du [-s] [-h] [-a] [路徑…]` | **區塊規則**：目錄本身 4K；檔案以 UTF-8 位元組數進位到 4096 的倍數（0 位元組是 0，1–4096 是 4，4097 是 8）；符號連結 0。輸出 `大小<Tab>路徑`，大小以 1K 為單位；後序（先子目錄再自己），名稱排序；預設只列目錄，`-a` 也列檔案，`-s` 只列每個參數的總和（`-s` 與 `-a` 一起是 GNU 的錯誤訊息）。不跟隨連結（GNU 的 `-P`）。無法讀取或進入的目錄印 `du: cannot read directory 'X': Permission denied`，仍計入它自己的 4K |
| `-h`（`ls -lh`、`df -h`、`du -h`） | GNU 的易讀格式：1024 為底，無條件進位；小於 1024 位元組直接印數字，小於 10 時留一位小數：`0`、`32`、`4.0K`、`1.5K`、`12K`、`4.7G` |
| `ln -s [-f] 目標 [連結名稱]` | 建立 `{ kind: 'link', mode: 0o777, target }`；目標照寫的文字保存、不檢查是否存在。一個參數時在目前目錄以目標的檔名建立；連結名稱是目錄（含指向目錄的連結）時建在目錄裡；三個以上參數時最後一個必須是目錄。錯誤：`ln: failed to create symbolic link 'X': File exists`（`-f` 會先刪除）、`No such file or directory`、`Permission denied`、`ln: target 'X' is not a directory`、`ln: missing file operand`。沒有 `-s` 時說明模擬環境只支援符號連結 |
| `readlink [-f] 路徑…` | 印出連結的目標文字；不是連結時什麼都不印（和 GNU 一樣，不是錯誤訊息）；`-f` 跟隨所有連結，印出最後的完整路徑 |
| `ls`（E1） | `-l` 的連結列：`lrwxrwxrwx learner learner    17 latest -> reports/today.txt`（大小是目標文字的位元組數）；短格式的連結名稱後面加 `@`（和目錄加 `/` 一樣是 `ls -F` 的慣例，因為沒有顏色）。`-h` 與 `-l` 一起顯示易讀的大小；`-d` 列出目錄本身。參數的排列照 GNU：先印錯誤，再把非目錄的參數排序後印在一起（短格式同一行），最後依序列出每個目錄（多個參數時有 `目錄:` 標題與空行）。參數是指向目錄的連結時，不加 `-l`／`-d` 會列出目錄的內容，加了則顯示連結本身；結尾加 `/` 一律跟隨（指向檔案時是 `Not a directory`）。不支援 `-R` |
| `cp`／`mv`（多來源） | `cp a b dir/`、`mv a b dir`；最後一個參數不存在或不是目錄：`cp: target 'X' is not a directory`；無法存取：`cp: failed to access 'X': Permission denied`；沒有參數 `cp: missing file operand`，只有一個 `cp: missing destination file operand after 'a'`。某個來源失敗時印出錯誤並繼續處理其他來源 |

### 9.3 萬用字元（glob）

- 在 Shell 把參數交給指令之前展開：`*`、`?`、`[abc]`、`[a-z]`、`[!a]`／`[^a]`；`]` 放在方括號的第一個字元時是字面的 `]`；顛倒的範圍（`[z-a]`）不符合任何字元；沒有結束的 `[` 是字面的 `[`。
- 結果依 C locale（字碼順序）排序；以 `.` 開頭的名稱只有在該段樣式以 `.` 開頭時才符合；`.` 與 `..` 永遠不符合（bash 5.2 的 `globskipdots`）。
- 沒有符合時保留原來的字（bash 的預設，沒有 `nullglob`／`failglob`），所以 `ls *.zip` 是 `ls: cannot access '*.zip': No such file or directory`。
- 引號裡的字元不展開（`"*.txt"`）；`~/` 開頭先換成家目錄（結果是絕對路徑）；結尾是 `/` 時只保留目錄並保留 `/`；需要讀取權限才能列出目錄，否則該段沒有符合。
- 不展開指令名稱與 `>`／`>>` 的檔名（bash 對重新導向的檔名會展開，但只有恰好一個符合時才有效；這裡一律照字面）。
- 反斜線沒有跳脫的意義（和實驗的斷詞一樣），要字面的 `*` 請加引號。

### 9.4 符號連結

- 每個指令解析路徑時都跟隨途中的連結；最後一段：`cat`、`cd`、`echo >`、`touch`、`chmod`、`df`、`ln` 的目的地目錄、不加 `-r` 的 `cp` 會跟隨；`rm`、`mv`、`cp -r`、`du`、`ls -l`、`readlink` 作用在連結本身。
- 一個路徑最多跟隨 40 個連結（Linux 的 `MAXSYMLINKS`），超過是 `Too many levels of symbolic links`（自己指向自己的連結也是）。懸空的連結：`cat` 是 `No such file or directory`；`echo >`、`touch` 會建立它指向的檔案（和 Linux 相同）；`chmod` 是 `cannot operate on dangling symlink`。
- `rm 連結` 只刪除連結；`rm -r 目錄` 只刪除目錄裡的連結，不碰連結指向的東西。
- 目前位置照 bash 的 `cd -L`：`cd data`（指向 `/srv/data`）後 `pwd` 與提示字元顯示 `~/data`；但「目前位置在要刪除的目錄裡」這類判斷用實際的路徑。
- 簡化：路徑裡的 `..` 在跟隨連結之前就依文字處理（像 `cd -L`），所以在 `~/data` 裡 `ls ..` 列出的是 `~`，不是 `/srv`；`rm 連結/`（結尾加 `/`）不另外處理，仍刪除連結本身。
- **硬連結不支援**：模擬的檔案系統以路徑對應節點，兩個名稱共用同一個 inode 需要另外的資料結構；`ln` 沒有 `-s` 時印出說明。LNX04 在課文中以概念說明硬連結（同一個 inode、不能跨檔案系統、不能連到目錄、刪除一個名稱另一個仍在）。

### 9.5 課程資料的新欄位與驗證（`lesson.ts`）

| 欄位 | 規則 |
|---|---|
| `profile` | `'lab'`（預設）或 `'files'`；其他值是 `unknown profile` |
| `files[].kind: 'link'` | 需要 `files`；`target` 是 1–500 個字元的一行文字；`mode` 必須是 `0o777`；不能有 `content`；父目錄要先列出（不能放在連結底下） |
| `system` | 需要 `files`；只允許 `kernel`、`release`、`version`、`machine`、`os`，各是 1–64 個可列印 ASCII 字元、頭尾不是空白 |
| `mounts` | 需要 `files`；最多 8 個；必須有 `/`；掛載點是機器裡的目錄且不重複；`device` 1–64 個非空白字元；`type` 符合 `[a-z0-9._-]{1,16}`；`size`、`used` 是整數，`0 ≤ used ≤ size ≤ 2^36`（1K 區塊，約 64 TiB） |
| 檢查 `link` | `{ kind: 'link', path, target }`，`target` 不可為空 |

`/etc/os-release` 不另設欄位，課程直接把它寫成機器的檔案（`cat /etc/os-release`）。

### 9.6 仍不支援（之後的階段）

（管線與重新導向已由 E2 的 `streams` 提供，使用者與群組由 E3 的 `users` 提供，見 §10、§11。）`ls -R`、`ls` 的 `total` 列、時間戳記（`ls -l` 沒有日期欄，`touch` 不改時間）、`mount` 指令、`df -i`、`du --max-depth`、`ln -n`／`-T`、硬連結、反斜線跳脫、大括號展開 `{a,b}`、`**`、`man -k`。

## 10. 引擎階段 E2：`streams` profile

> 2026-11-22。供 LNX05（文字處理、管線與重新導向）使用。實驗與 `files` 仍拒絕管線與重新導向（`tests/terminal.test.ts`、`tests/terminal-capability.test.ts` 不變）；在 `files` 機器上輸入 E2 的指令仍是 `command not found`。

### 10.1 選用方式

| 項目 | 內容 |
|---|---|
| `STREAMS_PROFILE`（`shell.ts`） | `id: 'streams'`；`files` 的全部指令加上 `less`、`head`、`tail`、`grep`、`sort`、`uniq`、`wc`、`cut`、`tr`、`tee`（`E2_COMMANDS`）；features 是 `files` 的四個加上 `pipes` |
| `TerminalMachine.profile: 'streams'` | `streams` 包含 `files` 的一切：符號連結、`system`、`mounts` 都可以用（profile 的順序是 lab < files < streams < users） |
| 驗證 | 範例、參考解答與常見錯誤的**每一段管線**以及 `sudo` 執行的指令都要在機器的 profile 裡（`commandNames`）；例如 `files` 機器上的 `ls \| grep x` 回報「`grep is not in the files profile of machine srv`」 |
| 純文字指令 | `src/lib/terminal/text.ts`：`cat`、`less`、`head`／`tail`、`grep`、`sort`、`uniq`、`wc`、`cut`、`tr` 都是對文字的純函式，經由 `TextIo` 讀取檔案與標準輸入；`tee` 要寫檔，放在 `shell.ts` |

### 10.2 管線與重新導向

- **斷詞**：沒有引號的 `|`、`<`、`>`、`>>` 是運算子；緊接在 `>` 前、沒有引號的 `1` 或 `2` 指定檔案描述子（`2>`、`2>>`；`echo a2>f` 的 `a2` 仍是字）；`2>&1`、`>&2`（`1>&2`）複製描述子。仍拒絕 `;`、`&&`、`||`、`$`、反引號、背景的 `&`、`<<`（here-document）與 `>&檔案`，訊息說明管線與重新導向可以使用。
- **語法錯誤**照 bash：`| wc` 與 `ls | | wc` 是 ``bash: syntax error near unexpected token `|'``；`ls >` 是 ``…token `newline'``；結尾的 `ls |` 是 `bash: syntax error: unexpected end of file`（真正的互動式 bash 會等下一行；模擬環境沒有續行）。有語法錯誤時整行都不執行。
- **執行順序**：先由左至右處理**每一段**的重新導向（`>` 立刻截斷或建立檔案、`<` 讀入內容），再依序執行每一段，前一段的標準輸出是下一段的標準輸入。bash 是同時啟動每一段，所以 `cat f | sort > f` 在真實系統上「通常」會清空 f；模擬環境一律先截斷，結果固定是空檔案（`sort f > f` 也一樣）。
- **描述子**照 bash 由左至右：`> f 2>&1` 兩者都進 f（依寫出的順序交錯）；`2>&1 > f` 錯誤仍在終端機、輸出進 f；`>&2` 讓輸出變成錯誤。終端機上的行依「最後送到哪個串流」標示為輸出或錯誤（`2>&1` 之後的錯誤顯示為輸出）。
- **重新導向的錯誤**：`bash: X: No such file or directory`、`Permission denied`、`Is a directory`（寫入目錄或 `< 目錄`）、`File name too long`、`No space left on device`；印在那一刻的標準錯誤（`ls 2> /dev/null > /root/x` 什麼都不印），而且該段的指令不執行（已截斷的檔案維持截斷）。
- **權限**：寫入已存在的檔案要 w（保留模式、擁有者、群組）；新檔案要所在目錄的 w 與 x，模式是 `666 & ~umask`（`streams` 一律 644），屬於使用者。寫入的一律是輸入這行指令的人：`sudo echo x > /etc/f` 仍是 Permission denied，`echo x | sudo tee /etc/f` 才是 root 寫入（§11）。
- **`/dev/null`**：模擬環境沒有裝置檔；路徑是 `/dev/null`（機器沒有同名的節點時）的 `>`、`2>` 丟棄輸出，`<` 與 `cat /dev/null` 讀到空的內容。`ls /dev/null` 仍是 No such file or directory。
- **子 Shell**：兩段以上的管線，每一段都是子 Shell：`cd`、`umask`、`newgrp` 不影響工作階段（`mkdir x | cd x` 之後仍在原處）；檔案系統與帳號的變更保留。`clear` 只在單獨一段、輸出到終端機時清除畫面。
- **不是終端機時的 `ls`**：輸出到管線或檔案時一行一個名稱，而且不加 `/`、`@`（GNU `ls` 不是 tty 時就是 `-1`、沒有顏色）；`ls -l` 不變。
- **萬用字元與 `~`** 在每一段各自展開（指令名稱與重新導向的檔名不做萬用字元展開，但會展開 `~`）。
- **上限**：一行最多 `LIMITS.stages = 8` 段（超過時「此模擬器的管線最多 8 段」）；每個指令的輸出（標準輸出與錯誤合計）最多 `LIMITS.output = 20000` 個字元，超過的部分省略並加一行說明；重新導向寫入後超過 `LIMITS.fileLength` 時印 `bash: X: File too large（模擬環境上限 4000 字元）`，檔案維持截斷後的樣子。

### 10.3 指令

| 指令 | 行為與 GNU 的訊息 |
|---|---|
| `cat [-n] [檔案…]` | 原樣輸出（沒有換行結尾的檔案會和下一個檔案接在同一行，和 GNU 一樣）；沒有檔案或檔名是 `-` 時讀標準輸入；`-n` 是 `%6d` 加 Tab。沒有標準輸入（鍵盤）時：`cat: 模擬環境沒有鍵盤輸入：請指定檔案，或用管線（|）、< 提供輸入`（`head`、`grep` 等相同）。`files` 以下的 `cat` 不變 |
| `less [檔案…]` | 不分頁，等於 `cat`；`Missing filename ("less --help" for help)`、`X: No such file or directory`、`X is a directory`（less 自己的格式） |
| `head`／`tail` | `-n N`、`-N`（只在第一個參數，和 GNU 一樣）、`--lines=N`、`-c N`；`head -n -N` 是「除了最後 N 行」，`tail -n +N` 從第 N 行開始；多個檔案時加 `==> 名稱 <==`（標準輸入是 `standard input`），`-v` 一個也加；`head: invalid number of lines: 'x'`、`head: cannot open 'x' for reading: No such file or directory`、`head: error reading 'd': Is a directory`；`tail -f` 印出模擬環境不支援的說明 |
| `grep` | 選項 `-i -v -n -c -l -w -x -r -R -E -F -H -h -e 樣式`（可重複）；有多個檔案或經由 `-r` 進入目錄時，每行加 `檔名:`；標準輸入的名稱是 `(standard input)`；`-r` 沒有檔案時搜尋 `.` 但名稱不加 `./`（GNU 的行為），目錄依名稱排序、不跟隨途中的符號連結（`-R` 會）；錯誤：`Usage: grep [OPTION]... PATTERNS [FILE]...` 加 Try 行、`grep: X: No such file or directory`、`grep: d: Is a directory`、`grep: X: Permission denied` |
| `sort` | `-n -r -u -f`、`-t C`、`-k N[,M][nrf]`（可多個）；比較依碼位（C.UTF-8：大寫在小寫前、`10` 在 `9` 前）；鍵相同時以整行做最後的比較（GNU 的 last-resort，`-r` 也反轉它；`-u` 不做，留下輸入順序中的第一行）；沒有 `-t` 時欄位是「前導空白加一個字」；`-k` 有自己的 n/r/f 時不套用全域的選項；讀不到任何一個輸入就只印錯誤（GNU 先讀完全部輸入）：`sort: open failed: X: No such file or directory`、`sort: read failed: d: Is a directory`、`sort: multi-character tab 'ab'`、`sort: invalid number at field start: invalid count at start of 'x'`、`sort: field number is zero: …` |
| `uniq` | 只合併相鄰的行；`-c`（`%7d ` 的格式）、`-d`、`-u`、`-i`；第二個檔名（輸出檔）不支援，請用 `>` |
| `wc` | 依序為行數、字數、字元數（`-m`）、位元組數（`-c`），預設 `-l -w -c`；欄寬照 GNU：只有一個輸入而且只印一種數字時不補空白（`wc -l f` 是 `3 f`）；否則欄寬是一般檔案大小總和的位數，有非一般檔案（管線、目錄）時至少 7（`cat f \| wc` 是 `      3       8      48`，`wc < f` 是一般檔案）；第一個檔案讀不到時欄寬是 1；目錄印 `wc: d: Is a directory` 與一行 0；多個檔案加 `total` |
| `cut` | `-f 清單`（`-d C`，預設 Tab；沒有分隔字元的行整行印出，`-s` 略過）、`-c 清單`、`-b 清單`；清單是 `N`、`N-M`、`N-`、`-M` 以逗號連接，依輸入順序輸出；錯誤加 Try 行：`you must specify a list of bytes, characters, or fields`、`only one list may be specified`、`the delimiter must be a single character`、`an input delimiter may be specified only when operating on fields`、`fields are numbered from 1`、`invalid decreasing range`、`invalid field value 'x'` |
| `tr [-d] [-s] 集合1 [集合2]` | 只讀標準輸入（`tr a b 檔案` 是 `tr: extra operand '檔案'` 加 Try 行）；集合支援字元、`a-z`、`\n \t \r \\`、`[:lower:] [:upper:] [:digit:] [:alpha:] [:alnum:] [:space:] [:blank:] [:punct:]`（ASCII）；集合2 較短時以最後一個字元補齊；`-s` 壓縮最後一個集合的連續字元；`tr: missing operand after 'a'` 加 `Two strings must be given when translating.` |
| `tee [-a] 檔案…` | 把標準輸入印出並寫入每個檔案（以執行 `tee` 的人的權限開檔，失敗的檔案印 `tee: X: Permission denied` 後繼續）|
| `echo [-n] [-e] 文字…` | `streams` 起：`-n` 不換行、`-e` 解讀 `\n \t \\`；重新導向交給 Shell（不再是 `echo` 自己處理），所以引號裡的 `">"` 只是文字。`files` 以下的 `echo` 不變 |

### 10.4 `grep` 的樣式（自行設計的子集）

- **基本正規表示式**（預設）：一般字元、`.`、`*`（在開頭時是字面的 `*`）、`^`（只在開頭或 `\(`、`\|` 之後是錨點）、`$`（只在結尾或 `\)`、`\|` 之前是錨點）、方括號（`[abc]`、`[a-z]`、`[^…]`、開頭的 `]` 是字面、POSIX 類別 `[:alpha:] [:digit:] [:alnum:] [:upper:] [:lower:] [:space:] [:blank:] [:punct:] [:xdigit:]`）、`\` 讓特殊字元變字面、`\w \W \s \S`，以及 GNU 的延伸 `\+ \? \| \( \) \{n,m\}`。
- **`-E`**：再加上 `+ ? | ( ) {n,m}`（不合格式的 `{` 是字面）。**`-F`**：整個樣式是字面文字。
- **不支援**：反向參照（`\1`，回報「模擬環境不支援反向參照」）、`\<`、`\>`、`\b`、`\B`。錯誤用 GNU 的字：`Unmatched [, [^, [:, [., or [=`、`Unmatched ( or \(`、`Invalid range end`、`Invalid character class name`、`Trailing backslash`。
- 實作：轉成 JavaScript 的 `RegExp`（`u` 旗標；`-i` 加 `i`）；`-w` 以「前面是行首或非字元、後面不是字元」判斷（字元是字母、數字與 `_`；不使用舊版 Safari 不支援的 lookbehind），`-x` 是整行。

### 10.5 選項解析

E2 指令以 `text.getopt` 解析，照 GNU `getopt_long`：選項可以在參數之間（重排）、`-abc` 合寫、需要值的選項接在後面或下一個字（`-k2,2n`、`-t ,`、`-n5`）、`--` 結束選項、單獨的 `-` 是參數、長選項 `--lines=5`；錯誤是 `invalid option -- 'x'`、`unrecognized option '--x'`、`option requires an argument -- 'n'`，後面加 Try 行。

### 10.6 擬真度修正（`files` 以上，實驗不變）

五項修正都掛在 E1 既有的 feature 上，所以 `files`、`streams`、`users` 都有，實驗（沒有任何 feature）逐字不變：

| # | 修正 | 掛在 | 例子 |
|---|---|---|---|
| 1 | `--help` 以外的長選項：GNU 的名稱（`ls --all`／`--human-readable`／`--directory`、`mkdir --parents`、`rm --recursive`／`--force`、`cp --recursive`、`du --summarize`／`--human-readable`／`--all`、`df --human-readable`／`--print-type`、`uname --all` 等、`ln --symbolic`／`--force`、`readlink --canonicalize`）；不認得的是 `ls: unrecognized option '--color'` | `help-option` | 實驗的 `ls --all` 仍是 `ls: invalid option -- '-'` |
| 2 | invalid option、unrecognized option、missing operand、extra operand、`chmod: invalid mode`、`du` 的 `-s` 與 `-a` 之後加 `Try 'CMD --help' for more information.`；`man` 是 `Try 'man --help' or 'man --usage' for more information.`；`whoami` 多了參數時是 `whoami: extra operand 'x'` | `help-option` | `hostname` 不變（真實的 net-tools 印整份用法） |
| 3 | `~`、`~/路徑`、`~使用者`（自己、`root`；`users` 機器上是任何使用者）在指令執行前換成家目錄，所以 `du ~` 印 `/home/learner`、`cat ~/x` 的錯誤是 `cat: /home/learner/x: …`；引號裡的 `~` 與不認得的 `~名稱` 照字面 | `glob` | 實驗的 `echo ~` 仍印 `~` |
| 4 | 檔案（不是目錄）`mv a dir/`、`cp a dir/` 而 `dir` 不存在：`mv: cannot move 'a' to 'dir/': Not a directory`、`cp: cannot create regular file 'dir/': Not a directory`；`dir` 是檔案：`failed to access 'dir/': Not a directory`；目錄可以照常改名成 `dir/` | `multi-source` | 實驗仍會改名成 `dir` |
| 5 | 練習的變體可以改 `host` 與 `system`（uname 的欄位疊在機器的欄位上），所以 `output` 檢查可以用 `uname`／`hostname`；變體的 `system` 仍需要 `files` 以上 | `lesson.ts` | `{ label, files: [], host: 'srv-02', system: { release: '6.1.0-13-amd64' } }` |

已發布的 LNX01–LNX04 因此重新重播：只有 LNX02 的範例 `lnx02-errors` 三步的輸出多了 Try 行（`mkdir`、`ls -z`、`cp notes.txt`）；LNX02 另有兩句說明模擬環境「只認得 `--help` 一個長選項」與「只印第一行」的文字已不正確，改成現在的行為。`tests/terminal-e1.test.ts` 只更新了因修正 2 改變的錯誤訊息（uname、df、du、ln、cp、mv）與 `PROFILES` 的內容。

## 11. 引擎階段 E3：`users` profile

> 2026-11-22。供 LNX06（使用者與群組）與 LNX07（Linux 權限與 chmod）使用。`users` 包含 `streams` 的一切（LNX06、LNX07 也需要管線，例如 `cut -d : -f 1 /etc/passwd`）。

### 11.1 選用方式與資料模型

| 項目 | 內容 |
|---|---|
| `USERS_PROFILE` | `id: 'users'`；`streams` 的指令加上 `chown`、`chgrp`、`umask`、`id`、`groups`、`useradd`、`usermod`、`groupadd`、`newgrp`、`sudo`（`E3_COMMANDS`）；features 加 `accounts`（目前只用於 `chmod -R`） |
| `FsState.accounts` | 使用者（`name`、`uid`、`gid`、`comment`、`home`、`shell`）與群組（`name`、`gid`、`members`）的資料，依檔案順序；`accounts.ts` |
| `FsState.groups` | 在 `users` 機器上是**工作階段**的群組（登入時的主要群組加上附加群組）。和 Linux 一樣，`usermod -aG` 只改資料：`id` 不加名稱時看工作階段（還沒有新群組），`id 名稱` 與 `groups 名稱` 看資料；`newgrp 群組` 重新讀取資料並以該群組為主要群組（新檔案屬於它），所以「加入群組後重新登入或 `newgrp`」可以練習 |
| `FsState.umask` | `users` 機器預設 `0o022`；新檔案 `666 & ~umask`（`touch`、重新導向、`tee`、`cp` 的新檔案），新目錄 `777 & ~umask`，`mkdir -p` 的中間目錄另加 `u+wx`（GNU）；覆寫既有的檔案保留它的模式、擁有者與群組（`cp` 也一樣）。沒有 umask 的狀態（實驗、`files`、`streams`）新檔案仍是 644、目錄 755，`cp` 仍保留來源的模式 |
| 擁有者 | 名稱（不是數字）；新節點屬於使用者，有 `accounts` 時群組是工作階段的主要群組（和使用者同名時省略，與之前相同） |
| 帳號檔 | 每次帳號改變都重新產生 `/etc/passwd`（0644）、`/etc/group`（0644）、`/etc/shadow`（0640 root:shadow；沒有 shadow 群組時 0600 root）；`/etc` 不存在時建立。shadow 沒有密碼：系統帳號 `*`、其他 `!`，日期欄固定 `20000`。直接編輯這些檔案（例如 root 的 `echo >>`）不會改變資料，下一次帳號變更會覆寫 |
| 基本資料 | 像 Ubuntu 的小集合：使用者 root(0)、daemon(1)、bin(2)、sys(3)、www-data(33)、nobody(65534)；群組 root、daemon、bin、sys、adm(4)、sudo(27)、www-data(33)、shadow(42)、users(100)、nogroup(65534)；機器的使用者（不是 root 時）是 uid／gid 1000、同名的私人群組、`/bin/bash`，排在最後 |

### 11.2 指令

| 指令 | 行為與訊息 |
|---|---|
| `id [-u\|-g\|-G] [-n] [使用者]` | `uid=1000(learner) gid=1000(learner) groups=1000(learner),27(sudo)`；`id: 'bob': no such user`；`-n` 單獨使用、兩個以上的 `-u -g -G` 是 GNU 的錯誤加 Try 行 |
| `groups [使用者…]` | 工作階段的群組，或 `alice : alice devs` |
| `whoami` | 使用者（`sudo whoami` 是 root） |
| `useradd [-m] [-M] [-r] [-s shell] [-G 群組,…] [-g 群組] [-u UID] [-c 說明] [-d 家目錄] 名稱` | 只有 root；一般使用者印 `useradd: Permission denied.` 與 `useradd: cannot lock /etc/passwd; try again later.`（shadow-utils 的訊息）。UID：1000 以上目前最大的加一，`-r` 從 999 往下找第一個空號；沒有 `-g` 時建立同名群組（GID 盡量等於 UID）。預設 shell `/bin/sh`、家目錄 `/home/名稱` 但**不建立**；`-m` 建立 0750 的家目錄並複製 `/etc/skel`（Ubuntu 的 HOME_MODE）。錯誤：`user 'x' already exists`、`invalid user name 'X': use --badname to ignore`、`group 'x' does not exist`、`group x exists - if you want to add this user to that group, use -g.`、`UID 1001 is not unique`、家目錄已存在的警告、`Usage: useradd [options] LOGIN` |
| `usermod [-a] [-G 群組,…] [-g 群組] [-s shell] [-c 說明] [-d 家目錄] 使用者` | 只有 root。`-aG` 附加；**沒有 `-a` 的 `-G` 把附加群組換成清單**（使用者會離開 sudo 等群組，這是教學重點；工作階段在下一次登入前仍保有原來的群組，所以 sudo 暫時仍可用）。`-a` 沒有 `-G`：`usermod: -a flag is ONLY allowed with the -G flag`；`user 'x' does not exist`、`group 'x' does not exist`、沒有選項是 `usermod: no changes`。`-g` 不會改家目錄裡檔案的群組，`-d` 不搬移檔案 |
| `groupadd [-r] [-g GID] 名稱` | 只有 root（`cannot lock /etc/group`）；`group 'x' already exists`、`GID '27' already exists`、`'X' is not a valid group name` |
| `newgrp [群組]` | 見上；不是成員時印模擬環境的說明（沒有群組密碼）；不加群組回到登入時的主要群組 |
| `sudo [-u 使用者] 指令…` | root、或工作階段的群組有 `sudo`（Debian、Ubuntu）或 `wheel`（RHEL）時，以 root（或 `-u` 的使用者，帶該使用者的群組與家目錄）執行；不詢問密碼。其他人：`learner is not in the sudoers file.  This incident will be reported.`（sudo 1.9 原始碼的文字，句點後兩個空白）。`sudo cd`、`sudo umask` 等內建指令與 profile 外的指令：`sudo: cd: command not found`；`sudo: unknown user bob`。參數由學習者的 Shell 先展開（萬用字元用學習者的權限），重新導向也是學習者的；執行後使用者、群組、家目錄、目前位置都回到原樣。`su` 不支援 |
| `chown [-R] 使用者[:群組] 路徑…`、`chgrp [-R] 群組 路徑…` | 照 Linux：只有 root 能改擁有者；檔案的擁有者可以把群組改成工作階段所屬的群組（`chgrp devs f`、`chown :devs f`、`chown 自己 f`）。`使用者:` 表示該使用者的主要群組；數字的 UID／GID 可以用。錯誤：`chown: changing ownership of 'f': Operation not permitted`、`chgrp: changing group of 'f': Operation not permitted`、`chown: invalid user: 'bob'`、`chown: invalid group: 'alice:ops'`、`chgrp: invalid group: 'ops'`、`cannot access`、缺少參數加 Try 行。`-R` 不跟隨途中的連結 |
| `umask [-S] [模式]` | 顯示 `0022` 或 `u=rwx,g=rx,o=rx`；設定八進位或符號（描述要保留的權限，`u=rwx,g=rx,o=` 是 027）；`bash: umask: 999: octal number out of range`、``bash: umask: `u=z': invalid symbolic mode operator``；只影響這個工作階段（管線裡的 `umask` 是子 Shell） |
| `chmod -R`（`accounts`） | 目錄與底下的一切（不跟隨連結）；每個不屬於自己的項目各印一次 Operation not permitted。`files`／`streams` 的 `chmod` 不變（`-R` 仍被當成模式） |

權限檢查不變：擁有者用擁有者位元、工作階段群組含節點的群組時用群組位元、其他人用其他位元；建立與刪除需要目錄的 w 與 x；`ls -l` 顯示群組欄。

### 11.3 課程資料（`lesson.ts`）

```ts
machines: [{ ..., profile: 'users',
  accounts?: { users?: [{ name, uid?, group?, home?, shell?, comment? }], groups?: [{ name, gid?, members? }] },
  umask?: 0o027 }]
```

| 規則 | 內容 |
|---|---|
| 疊加 | 機器的 `accounts` 疊在基本資料上：同名的基本使用者／群組（含機器的使用者）只改有寫的欄位；新的名稱必須有 `uid`／`gid`。使用者沒有 `group` 時屬於同名的私人群組（不存在就以 UID 為 GID 建立） |
| 只在 `users` | `accounts`、`umask` 與 `user`／`group`／`umask` 檢查只能用在 `users` 機器（`accounts need the users profile (engine stage E3)`） |
| `users` 機器 | 不可寫 `groups`（工作階段的群組來自資料）；不可列出 `/etc/passwd`、`/etc/group`、`/etc/shadow`（自動產生）；`/etc` 若列出必須是目錄；每個檔案的擁有者必須是使用者、群組必須是群組；名稱符合 `[a-z_][a-z0-9_-]{0,31}`；UID／GID 0–65534 且不重複；root 的 UID 是 0；家目錄與 shell 是絕對路徑；說明最多 64 字、不含 `:` 與換行；成員必須是使用者；最多 `LIMITS.users = 64` 個使用者、`LIMITS.groups = 64` 個群組 |
| 檢查 `user` | `{ kind: 'user', name, absent?, uid?, group?, groups?, notGroups?, shell?, home? }`：讀資料（不必重新登入）；`groups` 是必須有的登入群組（主要群組也算），`notGroups` 是不可以有的 |
| 檢查 `group` | `{ kind: 'group', name, absent?, gid?, members?, notMembers? }`：成員以「該使用者的登入群組含這個群組」判斷 |
| 檢查 `umask` | `{ kind: 'umask', umask }`：最後的工作階段 umask |

### 11.4 仍不支援

`su`、`passwd`、`userdel`、`groupdel`、`gpasswd`、`visudo` 與 sudoers 檔、`sudo -i`／`-s`、密碼與群組密碼、setuid／setgid／sticky 位元（模式仍是 0–0777）、ACL、以數字顯示已刪除使用者的檔案、`usermod -l`／`-L`／`-m`、`adduser`（Debian 的互動式包裝）。

## 12. 引擎階段 E4：`processes` profile（行程、訊號、工作與結束碼）

> 2026-11-22。供 LNX08（Process 管理與訊號）使用。實驗、`files`、`streams`、`users` 不變：E4 的指令在這些 profile 仍是 `command not found`，`$?` 與 `&` 仍被拒絕，它們的狀態也不會多出 `status` 欄位。

### 12.1 profile 的設計（E4–E6 共用）

| profile | 內容 | 給哪些課 |
|---|---|---|
| `processes`（E4） | `users` 的一切，加上 `ps`、`top`、`kill`、`pgrep`、`pidof`、`pkill`、`sleep`、`jobs`、`fg`、`bg`、`date`、`uptime`（`E4_COMMANDS`）；feature `processes`（`$?`、行尾的 `&`、程式路徑的 126／127） | LNX08 |
| `packages`（E5） | `processes` 的一切，加上 `apt`、`apt-mark`、`dpkg`（`E5_COMMANDS`）；feature `packages` | LNX09 |
| `services`（E6） | `packages` 的一切，加上 `systemctl`、`journalctl`（`E6_COMMANDS`）；feature `services` | LNX10、LNX11 |

選擇**一條線性的鏈**（lab < files < streams < users < processes < packages < services），和 E1–E3 相同：驗證器只需要比較「機器的 profile 是否達到某個階段」，課程依編號順序使用，較高的 profile 永遠包含較低的一切（例如 LNX10 的 `sudo systemctl` 也能用 `ps` 找 Main PID）。`man`、`clear`、`help` 一律排在指令表最後。

### 12.2 固定的時鐘（所有 E4–E6 的時間都遵守）

- 機器宣告 `now`（`'YYYY-MM-DD HH:MM:SS'`，一律 UTC；預設 `2026-11-22 10:00:00`）與 `boot`（預設 `now` 前一天）。程式碼不讀 `Date.now()` 也不用主機的時區：`Date` 只以 UTC 函式處理固定的數字（`clock.ts`）。
- **時鐘永遠不前進**：學習者的每個指令都發生在 `now`。所以 `sleep N` 立刻結束（結束碼 0）、`fg` 讓背景的 sleep 立刻結束、`systemctl start` 之後 `status` 顯示 `since …; now`（systemd 對 0 秒的寫法）、新的日誌都標記為 `now`。
- 由時間算出的文字：`ps` 的 START／STIME（24 小時內 `HH:MM`，同一年 `Nov20`，否則年份；procps-ng 的規則）、`top`／`uptime` 的 `up 2 days,  1:30,`、`date` 的 `Sun Nov 22 10:00:00 UTC 2026`、systemd 的 `Sun 2026-11-22 08:00:05 UTC; 1h 59min ago`（`format_timestamp_relative` 的單位與門檻）、journal 的 `Nov 22 09:00:00`。

### 12.3 行程表

機器的 `processes`：`{ pid, ppid?=1, user, command, stat?='S', cpu?=0, rss?=0, vsz?=rss, shr?=0, tty?='?', start?=boot, time?=0, nice?=0, unit?, term?, hup?, int? }`。`command` 是 ps 的 COMMAND／args（核心執行緒寫成 `[kthreadd]`）；行程名稱（comm）是第一個字的檔名，去掉登入 Shell 的 `-` 與標題的 `:`，最多 15 字（`-bash` → `bash`、`nginx: worker process` → `nginx`）。`%MEM` 由 `rss ÷ memory.total` 算出（不另外宣告）。機器另有 `load`（三個平均負載）、`cpus`（預設 1）、`memory: { total, cache?, swap? }`（MiB，預設 2048／512／0）。新的行程（`sleep N &`、E6 啟動的服務）拿 `lastPid + 1`，PID 不重複使用。

### 12.4 指令與格式

| 指令 | 行為與格式 |
|---|---|
| `ps` | 不加選項：這個終端機（`pts/0`）上自己的行程，`PID TTY TIME CMD`（CMD 是 comm）。`aux`（a、u、x 任意順序，必須含 u）：procps-ng 的欄寬 `USER(8) PID(7) %CPU(4) %MEM(4) VSZ(6) RSS(5) TTY(8) STAT(4) START(5) TIME(6) COMMAND`，TIME 是「分:秒」；超過 8 個字的使用者名稱縮成 7 字加 `+`。`-e`／`-A`、`-f`（`UID PID PPID C STIME TTY TIME CMD`，TIME 是 `HH:MM:SS`）、`-u 使用者,…`、`-p PID,…`、`-o pid,ppid,user,%cpu,%mem,vsz,rss,tty,stat,ni,time,comm,args,cmd,c`、`--sort=[-]鍵,…`（pid、ppid、user、%cpu、%mem、rss、vsz、time、ni、comm、start；同值以 PID 排序）。靠右的欄位一律補空白，最後一個靠左的欄位不補。**同一行的指令也是行程**：`ps` 自己（`R+`）與管線的其他段（`S+`，例如 `ps aux \| grep nginx` 會看到 `grep nginx`）以接下來的 PID 列出，但不寫進行程表。錯誤照 procps：`error: unknown user-defined format specifier "x"`、`error: unsupported option (BSD syntax)`、`error: process ID list syntax error`、`error: user name does not exist`、`error: unsupported SysV option`，後面接 procps 的 Usage 段落；`-p` 找不到時只印標題、結束碼 1 |
| `top -b -n 1 [-o 欄] [-u 使用者] [-c]` | 一次的快照（批次模式）。`top - 10:00:00 up …,  1 user,  load average: 1.12, 0.85, 0.60`；`Tasks:` 依 STAT 的第一個字母計數（R 執行、S D I 睡眠、T 停止、Z 殭屍）；`%Cpu(s)` 的 us 是所有 %CPU 的和 ÷ cpus（上限 100），id 是 100 − us，其他是 0.0；`MiB Mem` 的 used 是 RSS 總和，free = total − used − cache；列表依 `%CPU` 由大到小（`-o %MEM`、`PID`、`RES`、`TIME+`、`VIRT`、`USER`），COMMAND 是 comm（`-c` 整行）。不加 `-b` 或 `-n` 不是 1 時說明模擬環境沒有會更新的畫面；top 自己不列在表中 |
| `kill [-s 訊號 \| -n N \| -訊號 \| -N] PID\|%工作…`、`kill -l [訊號]` | bash 的內建指令：預設 SIGTERM；訊號可寫 9、KILL、SIGKILL、sigkill。`kill -l` 印 1–31 號（bash 的五欄格式；34 以後的即時訊號省略），`kill -l 9` 印 `KILL`、`kill -l 137` 也是 `KILL`。只有擁有者與 root 能送：`bash: kill: (701) - Operation not permitted`；`bash: kill: (4242) - No such process`、`bash: kill: FOO: invalid signal specification`、`bash: kill: abc: arguments must be process or job IDs`、沒有參數是 bash 的 usage（結束碼 2）。`sudo kill` 執行的是 `/bin/kill`（procps），訊息是 `kill: (4242): No such process`。每個 PID 各自處理，失敗不影響其他 |
| 訊號的效果 | **SIGKILL** 一定結束行程；**SIGSTOP**／TSTP／TTIN／TTOU 讓 STAT 變成 `T`，**SIGCONT** 恢復；**SIGTERM、SIGHUP、SIGINT** 依行程宣告的 `term`（`exit`／`ignore`）、`hup`（`exit`／`reload`／`ignore`）、`int`（`exit`／`ignore`）決定，預設都是結束；CHLD、URG、WINCH 與 `kill -0` 沒有效果；其他訊號結束行程。停止中的行程收到會結束它的訊號時先記著，SIGCONT 之後才生效（bash 的 `kill %1` 會自動補送 SIGCONT）。PID 1、核心執行緒與殭屍不受影響；行程結束時，同一個服務（`unit`）的子行程一起結束，其他子行程交給 PID 1，殭屍子行程被回收 |
| `pgrep [-l] [-a] [-f] [-x] [-n] [-o] [-u 使用者] 樣式`、`pkill [-訊號] [-f] [-x] [-u 使用者] 樣式`、`pidof 名稱…` | 樣式是延伸正規表示式（`grep -E` 的子集），比對 comm（`-f` 比對整行）；找不到結束碼 1，沒有樣式是 procps 的訊息與 2。`pkill` 對別人的行程印 `pkill: killing pid 701 failed: Operation not permitted`。`pidof` 名稱必須相同，PID 由新到舊在同一行 |
| `sleep N[smhd]`、`sleep N &`、`jobs [-l]`、`fg [%N]`、`bg [%N]` | 背景執行**只支援 sleep**（它是唯一會持續執行的程式）：`sleep 300 &` 印 `[1] 1051` 並在行程表加入 `sleep 300`（使用者自己、`pts/0`、父行程是 Shell）。`jobs` 照 bash：`[1]+  Running                 sleep 300 &`（狀態欄寬 24，`+` 目前、`-` 前一個）。`kill %1` 之後印 bash 的通知 `[1]+  Terminated              sleep 300`（`Killed`、`Hangup`、`Interrupt` 依訊號）；`kill -STOP %1` 印 `Stopped`。`fg` 印出指令，因為時鐘不動，sleep 立刻結束；`bg` 讓停止的工作繼續（`[1]+ sleep 300 &`）。`ls &` 等其他背景執行印模擬環境的說明；`jobs`、`fg`、`bg` 是內建指令，`sudo fg` 是 `command not found`。bash 的工作通知印在終端機上（不經過重新導向）|
| `date`、`uptime` | 機器的 `now` 與 `uptime` 一行；`date` 不接受格式與設定 |

### 12.5 結束碼與 `$?`

- 斷詞時**只接受 `$?`**（雙引號裡也展開，單引號裡照字面）；其他 `$` 仍被拒絕（訊息改為「變數（$? 以外）」）。`$?` 在整行斷詞時換成上一行的結束碼，所以同一行的每個 `$?` 都是同一個值。空白的一行不改變 `$?`。
- 每一段的結束碼照 bash 與各指令：預設是「有錯誤訊息時 1，否則 0」；`ls` 有錯誤時 2；`grep` 選到行 0、沒有 1、錯誤 2；`sort` 錯誤 2；`man` 找不到 16；找不到指令 127；程式路徑（含 `/` 的指令）不存在 127、是目錄或不能執行 126，可以執行時印模擬環境不執行程式檔的說明（126）；重新導向失敗 1；語法錯誤與被拒絕的寫法 2；`kill` 的 usage 2；`sudo` 傳回它執行的指令的結束碼。管線的結束碼是最後一段的（沒有 `pipefail`）。
- **不模擬**：前景工作被訊號結束的 128+N（模擬環境的前景指令不會被訊號打斷；`kill -l 137` 可以示範換算）、`wait`、`set -o pipefail`、`${PIPESTATUS[@]}`。

### 12.6 課程資料與檢查

- 新的機器欄位 `now`、`boot`、`load`、`cpus`、`memory`、`processes` 只能用在 `processes` 以上的機器（「`processes need the processes profile (engine stage E4)`」）。驗證：時間可解析、`boot ≤ now`；PID 1–4194304 不重複；`ppid` 是 0 或表中的 PID；使用者存在；指令 1–200 字一行；`stat` 符合 `[RSDTZI][<NsLl+]*`；`cpu` 0–100×cpus；大小是整數 KiB；`tty` 是 `?`、`pts/N`、`ttyN`；`start` 在 `boot` 與 `now` 之間；`nice` −20–19；`unit` 需要 `services`；反應只能是規定的值；最多 200 個行程。
- 變體可以整個換掉 `processes`（例如另一個時刻最忙的行程不同），讓 `output` 檢查不能靠打出答案通過。
- 檢查 `process`：`{ kind: 'process', name?, pid?, absent?, user?, state? }`（至少要有 name 或 pid；`name` 比對 comm；`state` 比對 STAT 的開頭）。

## 13. 引擎階段 E5：`packages` profile（apt）

> 2026-11-22。供 LNX09（套件管理）使用。主要模型是 **Debian／Ubuntu 的 apt**（以 Ubuntu 24.04 noble、apt 2.7 的輸出為準）；dnf 只在課文中比較（§13.4）。

### 13.1 資料模型（`packages.ts`）

```ts
packages: {
  repositories: [{ name, url, suite, components: string[], enabled?: true }],
  available: [{ name, version, repo, component?, arch?, section?, description, depends?: string[], files?: [{ path, kind, mode, content?, target? }], security? }],
  installed?: [{ name, version, auto?, held?, config? }],
  stale?: boolean,
}
```

- **候選版本**是啟用的套件庫裡最新的版本，版本比較照 dpkg（epoch、上游版本、修訂；`~` 排在最前面：`1.0~rc1 < 1.0 < 1.0-1 < 1.0-1ubuntu1 < 1.0-1ubuntu1.1`）。同一個版本可以出現在多個套件庫（`noble-updates` 與 `noble-security`）。
- `stale: true` 表示機器從沒執行過 `apt update`：apt 看不到任何套件（新機器上 `apt install` 是 `E: Unable to locate package`），`apt update` 之後才看得到。
- **沒有下載**：安裝時把套件宣告的檔案寫到磁碟（root 擁有，途中的目錄 root 0755）；`/etc/` 下的檔案是設定檔：已存在時保留，`remove` 留下（套件變成 `rc`），`purge` 才刪除。之後的課可以找到這些檔案（例如 `/usr/sbin/nginx`、`/usr/lib/systemd/system/nginx.service`）。
- 相依性只用套件名稱（沒有版本條件）；`depends` 必須是資料中的套件。安裝時缺少的相依套件以候選版本一起安裝並標記為自動安裝（`auto`）。

### 13.2 指令與輸出

| 指令 | 行為 |
|---|---|
| 權限 | 會變更系統的子指令需要 root：`E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)` 與 `E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?`（`update` 是 `/var/lib/apt/lists/lock` 的兩行），結束碼 100。apt 的錯誤結束碼一律 100 |
| `apt update` | 每個啟用的套件庫一行 `Hit:N url suite InRelease`（清單過期時是 `Get:N`，不印大小），三行 `Reading…`，最後 `N packages can be upgraded. Run 'apt list --upgradable' to see them.`（1 個時是 `…to see it.`）或 `All packages are up to date.` |
| `apt install [-y] 套件[=版本]…` | 三行 `Reading…`；已是最新版：`X is already the newest version (V).`（自動安裝的再加 `X set to manually installed.`）；計畫依序列出 `The following additional packages will be installed:`、`The following held packages will be changed:`、`The following NEW packages will be installed:`、`The following packages will be upgraded:`、`The following packages will be DOWNGRADED:`（兩格縮排、80 欄換行），再印 `0 upgraded, 2 newly installed, 0 to remove and 2 not upgraded.`。**詢問**：安裝了沒有要求的套件、降版或變更被 hold 的套件時，apt 問 `Do you want to continue? [Y/n]`；模擬環境沒有鍵盤，沒有 `-y` 時印 `Do you want to continue? [Y/n] Abort.`，結束碼 1。`-y` 加上降版：`E: Packages were downgraded and -y was used without --allow-downgrades.`；加上 hold：`E: Held packages were changed and -y was used without --allow-change-held-packages.`。執行時依相依順序印 `Selecting previously unselected package X.`、`Preparing to unpack .../X_V_arch.deb ...`、`Unpacking X (V) ...`（升級是 `… over (舊版) ...`），再印 `Setting up X (V) ...`。找不到：`E: Unable to locate package X`；版本不存在：`E: Version 'V' for 'X' was not found`；相依套件無法安裝：apt 的 unmet dependencies 段落與 `E: Unable to correct problems, you have held broken packages.` |
| `apt remove`／`purge`／`autoremove [-y]` | 依賴被移除套件的套件一起移除；之後不再被手動套件需要的自動套件列在 `The following packages were automatically installed and are no longer required:` 與 `Use 'sudo apt autoremove' to remove it.`（them）；`The following packages will be REMOVED:`（purge 的名稱加 `*`）；移除一律詢問；`Removing X (V) ...`、`Purging configuration files for X (V) ...`。沒有安裝的：`Package 'X' is not installed, so not removed` |
| `apt upgrade [-y]`（`full-upgrade` 相同） | 多一行 `Calculating upgrade... Done`；被 hold 的列在 `The following packages have been kept back:`；升級需要的新相依套件會安裝；有任何變更就詢問 |
| `apt list [--installed \| --upgradable] [樣式…]` | `Listing... Done`，然後 `名稱/套件庫[,now] 版本 架構 [標記]`：`[installed]`、`[installed,automatic]`、`[installed,local]`、`[installed,upgradable to: V]`、`[upgradable from: V]`、`[residual-config]`；樣式是萬用字元（請加引號） |
| `apt show X`、`apt policy X` | show：Package、Version、Priority、Section、Depends、APT-Manual-Installed、APT-Sources、Description 與空行（省略 Maintainer、大小等）；policy：Installed、Candidate、Version table（套件庫 500、`/var/lib/dpkg/status` 100、`***` 標示已安裝的版本） |
| 輸出不是終端機 | apt 先在標準錯誤印空行、`WARNING: apt does not have a stable CLI interface. Use with caution in scripts.`、空行 |
| `apt-mark hold\|unhold\|showhold\|auto\|manual` | `X set on hold.`、`X was already set on hold.`、`Canceled hold on X.`、`X was already not on hold.`、`X set to manually installed.`；非 root：`dpkg: error: requested operation requires superuser privilege` 與 `E: Executing dpkg failed. Are you root?` |
| `dpkg -l [樣式…]`、`dpkg -L X`、`dpkg -s X` | `-l` 的三行說明與 `||/ Name … Version … Architecture Description`、`+++-===…`，每列 `ii`、`hi`（hold）或 `rc`；欄寬依內容（名稱至少 14、版本與架構至少 12）。`-L` 先印 `/.`，再印途中的目錄與檔案。`dpkg -i` 不支援 |

### 13.3 課程資料與檢查

- `packages` 只能用在 `packages` 以上的機器。驗證：最多 8 個套件庫與 120 個套件版本；套件庫名稱不重複、URL 是 http(s)、suite 與 components 合法；套件名稱符合 Debian 規則、版本合法、套件庫存在、說明一行、相依套件存在、檔案路徑絕對且正規化、模式 0–0777、只有檔案有內容、連結（且只有連結）有目標；已安裝的套件名稱不重複，`held` 與 `config` 不能同時成立。
- 檢查 `package`：`{ kind: 'package', name, version?, held?, absent?, purged? }`（`absent` 時 `rc` 也算沒有安裝；`purged` 連設定檔也不能留下）。

### 13.4 文字說明（不模擬）

| 項目 | apt（Debian／Ubuntu） | dnf（RHEL／Fedora） |
|---|---|---|
| 更新清單 | `apt update` | 自動（`dnf check-update` 列出可更新的） |
| 安裝／移除 | `apt install`、`apt remove`／`purge` | `dnf install`、`dnf remove` |
| 升級 | `apt upgrade` | `dnf upgrade` |
| 鎖定版本 | `apt-mark hold` | `dnf versionlock add`（外掛）或 `exclude=` |
| 只套用安全更新 | `unattended-upgrades` | `dnf upgrade --security` |
| 套件格式／底層工具 | `.deb`／`dpkg` | `.rpm`／`rpm` |

也不模擬：下載與大小（`Get:`、`Fetched`、`Need to get`）、`apt-get`、`apt search`、`/etc/apt/sources.list` 的讀回（套件庫是資料；課程可以另外放這個檔案作展示）、套件的版本條件與衝突、Recommends／Suggests、`unattended-upgrades` 的執行、phased updates、`.deb` 檔案。

## 14. 引擎階段 E6：`services` profile（systemd 與 journal）

> 2026-11-22。供 LNX10（systemd 與服務管理）與 LNX11（日誌與 journalctl）使用。輸出以 Ubuntu 24.04 的 systemd 255 為準。

### 14.1 unit 檔與已載入的設定（`services.ts`）

- unit 檔是機器上的普通檔案，依序在 `/etc/systemd/system`、`/run/systemd/system`、`/usr/lib/systemd/system`、`/lib/systemd/system` 尋找（跟隨符號連結）；只有 `.service`。`systemctl status nginx` 的 `nginx` 自動補成 `nginx.service`。
- 解析的鍵：`[Unit]` Description、After、Requires、Wants、StartLimitIntervalSec、StartLimitBurst（另接受 Documentation、Before、BindsTo、PartOf、Conflicts、ConditionPathExists，但不使用）；`[Service]` Type（simple、exec、forking、notify、oneshot）、ExecStart、ExecReload、User、Restart、RestartSec、RemainAfterExit（另接受 Group、WorkingDirectory、Environment 等常見鍵，不使用）；`[Install]` WantedBy（另接受 RequiredBy、Alias、Also）。其他鍵、段落與格式錯誤照 systemd 記在 journal（warning 等級、屬於該 unit）：`/etc/systemd/system/x.service:6: Unknown key name 'Restat' in section 'Service', ignoring.`、`Unknown section 'X'. Ignoring.`、`Missing '=', ignoring line.`、`Assignment outside of section. Ignoring.`、`Failed to parse service restart specifier, ignoring: x`。沒有 ExecStart 是 bad-setting（`Loaded: bad-setting (Reason: Unit x.service has a bad unit file setting.)`）。
- **已載入的設定與磁碟分開**：機器開始時載入所有 unit 檔；之後新建的 unit 檔在第一次使用時載入。修改已載入的 unit 檔後，`start`／`restart`／`status` 先印 `Warning: The unit file, source configuration file or drop-ins of x.service changed on disk. Run 'systemctl daemon-reload' to reload units.`，而且**仍用舊的設定**；`daemon-reload`（以及 `enable`／`disable`，systemctl 會自動重新載入）才讀入新內容並記錄解析警告。
- **開機時啟動**：`/etc/systemd/system/<target>.wants/<unit>` 的符號連結（機器資料可以直接放這些連結）；`[Install]` 沒有 WantedBy 的是 `static`。

### 14.2 程式、狀態與 Restart=

- ExecStart 的第一個字是程式（不是絕對路徑時在 `/usr/local/sbin`、`/usr/local/bin`、`/usr/sbin`、`/usr/bin` 尋找）。程式不存在或沒有執行權限：`status=203/EXEC`（`Failed to locate executable …`、`Failed at step EXEC spawning …`）；`User=` 不存在：`status=217/USER`。
- 機器的 `programs` 宣告程式的行為：`{ path, title?, cpu?, rss?, vsz?, term?, hup?, fail?: { message, status?=1, unless? }, log?: [] }`。`fail` 的程式啟動後立刻以該訊息（err 等級，識別為程式名稱與 PID）與結束碼結束，**除非** `unless` 的檔案存在（例如設定檔：學習者建立它後再啟動就成功）；成功時加入行程表（使用者是 `User=`，預設 root）並記錄 `log` 的訊息。沒有宣告的程式啟動成功。
- 狀態：`active (running)`、`active (exited)`（oneshot 加 `RemainAfterExit=yes`）、`inactive (dead)`、`failed (Result: exit-code | signal | timeout)`、`activating (auto-restart)`。機器資料的 `services: [{ unit, active, since?, result?, pid?, status? }]` 宣告開始時的狀態：`active` 的服務的行程是行程表中 `unit` 相同的行程（Main PID 是其中父行程不屬於同一服務的那個）；`failed` 的服務可以寫最後一個主行程的 PID 與結束碼；沒有列出、但行程表中有它的行程的服務是 active；其他都是 inactive。
- **Restart= 在同一個指令裡立刻處理**（時鐘不動）：程式失敗而 Restart= 適用（`always` 一律；`on-failure` 非零結束碼與不乾淨的訊號；`on-abnormal`、`on-abort`、`on-success` 照 systemd 的表）時，若 `RestartSec × StartLimitBurst < StartLimitIntervalSec`（預設 100ms × 5 < 10s），systemd 連續重新啟動，記錄 `Scheduled restart job, restart counter is at N.` 與 `Stopped …`，第 StartLimitBurst 次失敗後 `Start request repeated too quickly.`、`Failed with result 'exit-code'.`、`Failed to start …`，服務是 failed；否則（例如 `RestartSec=5`）第一次失敗後停在 `activating (auto-restart)`，因為等待的時間永遠不會過去。**學習者手動的 `start`／`restart` 重新計算啟動上限**（視為兩個指令之間已經超過 StartLimitIntervalSec；真實系統需要等待或 `systemctl reset-failed`）。
- `Type=simple`（預設）的 `systemctl start` 在程式啟動後就成功，**即使程式馬上失敗也不印任何東西、結束碼 0**（要看 `status`，這是教學重點）；`Type=exec` 遇到 203／217，以及 `Type=oneshot` 失敗時印 `Job for x.service failed because the control process exited with error code.` 與 `See "systemctl status x.service" and "journalctl -xeu x.service" for details.`，結束碼 1。
- `Requires=`／`Wants=` 的服務先啟動；Requires 的 unit 不存在：`Failed to start a.service: Unit b.service not found.`（結束碼 5）；它的啟動工作失敗：journal 記 `Dependency failed for …`，指令印 `A dependency job for a.service failed. See 'journalctl -xe' for details.`。停止一個服務時，先停止 Requires 它的 active 服務。`After=` 只解析不影響（模擬環境依序啟動）。
- 停止：`Stopping …`、`x.service: Deactivated successfully.`、`Stopped …`，服務的行程全部移除。主行程忽略 SIGTERM 時，systemd 在 TimeoutStopSec 後送 SIGKILL：`State 'stop-sigterm' timed out. Killing.`、`Killing process 901 (stubborn) with signal SIGKILL.`、`Main process exited, code=killed, status=9/KILL`、`Failed with result 'timeout'.`，服務是 failed（這是「為什麼需要 SIGKILL」的另一面）。
- **E4 的 kill 與 systemd**：學習者以訊號結束服務的主行程時，乾淨的訊號（HUP、INT、TERM、PIPE）讓服務 `Deactivated successfully.` 成為 inactive，其他（如 SIGKILL）記錄 `Main process exited, code=killed, status=9/KILL` 與 `Failed with result 'signal'.`；Restart= 適用時立刻以新的 PID 重新啟動（`Restart=always` 時 `kill -9` 之後 `pgrep` 看到新的 PID）。只結束 worker 子行程時 systemd 不反應。
- **E5 的套件與 systemd**：在 `services` 機器上安裝的套件若帶有 `/usr/lib/systemd/system/*.service`（或 `/lib/…`、`/etc/…`），Setting up 之後照 Debian 的維護腳本 enable（印 `Created symlink …`）並啟動；移除套件前先停止它的服務。升級不重新啟動服務。

### 14.3 systemctl

| 子指令 | 行為 |
|---|---|
| `status 服務…` | `● nginx.service - 說明`（running 與 activating 是 `●`，failed 是 `×`，其他 `○`）、`Loaded: loaded (路徑; enabled; preset: enabled)`（static 時是 `; static`）、`Active: …`、失敗後的 `Process: PID ExecStart=… (code=exited, status=1/FAILURE)` 與 `Main PID: PID (code=…)`、執行中的 `Main PID: 812 (nginx)` 與 `CGroup: /system.slice/x.service` 的樹（依 PID，`├─`／`└─`，指令照原樣、不加引號），空一行後是該服務最後 10 筆日誌。標籤靠右對齊到 12 欄。省略 Docs、Tasks、Memory、CPU 列。結束碼 0（執行中）、3（沒有執行）、4（`Unit x.service could not be found.`）。沒有指定服務時印模擬環境的說明 |
| `start`、`stop`、`restart`、`reload` | 需要 root：`Failed to start x.service: Interactive authentication required.` 與 `See system logs and 'systemctl status x.service' for details.`（模擬沒有 polkit 代理的情況）。找不到：`Failed to start x.service: Unit x.service not found.`（stop 是 `not loaded.`），結束碼 5。reload 需要 ExecReload=（`Failed to reload x.service: Job type reload is not applicable for unit x.service.`）且服務在執行（`x.service is not active, cannot reload.`）|
| `enable [--now]`、`disable [--now]` | `Created symlink /etc/systemd/system/multi-user.target.wants/x.service → /etc/systemd/system/x.service.`（需要時建立 `.wants` 目錄）、`Removed "/etc/systemd/system/multi-user.target.wants/x.service".`；已經是該狀態時不印東西；static 的 unit 印 systemd 說明「沒有安裝設定」的前三行；不存在：`Failed to enable unit: Unit file x.service does not exist.`。非 root：`Failed to enable unit: Interactive authentication required.` |
| `is-active`、`is-enabled` | 印狀態；is-active 至少一個 active 時結束碼 0，否則 3（`-q` 不印）；is-enabled：enabled／static 0、disabled 1，不存在印 `Failed to get unit file state for x.service: No such file or directory` |
| `daemon-reload`、`reset-failed [服務]`、`cat 服務` | daemon-reload 見 §14.1（非 root：`Failed to reload daemon: Interactive authentication required.`）；reset-failed 讓 failed 變回 inactive；cat 印 `# 路徑` 與檔案內容（`No files found for x.service.`）|
| `list-units [--type=service] [--all] [--failed \| --state=S] [--no-legend]`、`list-unit-files` | 欄寬依內容：`UNIT LOAD ACTIVE SUB DESCRIPTION`，failed 的列前面加 `●`；預設只列 active、failed、activating；Legend 三行與 `N loaded units listed. Pass --all to see loaded but inactive units, too.`、`To show all installed unit files use 'systemctl list-unit-files'.`。`list-unit-files`：`UNIT FILE STATE PRESET`（Ubuntu 的 preset 一律 enabled，static 是 `-`）與 `N unit files listed.`。`systemctl` 不加子指令等於 list-units；`--type` 只接受 service |

### 14.4 journal 與 journalctl

- 機器的 `journal: [{ time, unit?, id, pid?, priority, message }]`，依時間排列、不晚於 `now`，最多 300 筆；引擎新增的日誌（systemd 的訊息、程式的訊息、unit 檔的警告）時間都是 `now`，總數超過 400 筆時丟棄最舊的（像 journald 的大小上限）。systemd 自己的訊息是 `systemd[1]`，等級：Started／Stopped／Scheduled restart 是 info（6），`Main process exited` 是 notice（5），`Failed with result`、`Start request repeated too quickly`、解析警告是 warning（4），`Failed to start`、`Dependency failed`、`Failed at step …` 與程式的失敗訊息是 err（3）。
- 預設格式 `Nov 22 09:00:00 svc-01 report[950]: 訊息`（沒有 pid 時 `kernel: 訊息`）；`-o short-iso` 是 `2026-11-22T09:00:00+0000 …`，`-o cat` 只有訊息；沒有符合時 `-- No entries --`（systemd 247 之後不印 `-- Logs begin at` 標題）。
- 選項：`-u 服務`（可重複）、`-p 等級`（0–7、emerg alert crit err warning notice info debug，或 `FROM..TO`；單一值表示「這個等級以上」）、`-S`／`--since`、`-U`／`--until`（`2026-11-22 09:00:00`、`2026-11-22 09:00`、`2026-11-22`、`09:30`、`today`、`yesterday`、`now`、`tomorrow`、`-1h`、`-30min`、`+5min`、`1 hour ago`、`1h 30min ago`，相對於機器的 `now`）、`-n N`（最後 N 筆）、`-r`（新的在前，套用在 -n 之後）、`-k`（核心訊息）、`-b`（這次開機以來）、`-g 樣式`（延伸正規表示式）、`-o`、`-x`、`-e`、`-q`、`--no-pager`（接受、不影響）。錯誤：`Failed to parse timestamp: x`、`--since= must be before --until=.`、`Failed to parse priority value: x`、`Unknown output format 'x'.`、`Failed to parse lines 'x'`。
- **權限**：root、`adm` 或 `systemd-journal` 群組的成員才看得到系統日誌；其他人先在標準錯誤印 systemd 的三行 Hint（`-q` 不印），再印 `-- No entries --`（結束碼 0）。所以 LNX11 會用到 `sudo journalctl` 或 `usermod -aG adm`（E3）。
- **不支援**：`-f`（日誌不會再增加，印模擬環境的說明，結束碼 1）、比對條件（`_PID=1`、`_SYSTEMD_UNIT=…`）、`--list-boots` 與多次開機、`-o json`／`verbose`、日誌的磁碟用量（`--disk-usage`、`--vacuum-*`）。

### 14.5 `/var/log` 與日誌輪替（文字說明為主）

- `/var/log/syslog`、`syslog.1`、`syslog.2.gz` 等是機器資料裡的普通檔案（常見的權限是 `root:adm 0640`），可以用 `ls -l`、`sudo tail`、`grep` 讀；**不會**由 journal 自動產生（rsyslog 的轉寫不模擬）。
- 輪替只以檔名示範：`syslog` 是目前的檔案，`syslog.1` 是上一輪，`syslog.2.gz` 以後被壓縮；`.gz` 檔案請不要放文字內容（`cat` 會照樣印出，真實系統印出的是二進位資料），`zcat`／`zgrep` 不支援。`logrotate` 的設定（`/etc/logrotate.d/*`：`daily`、`rotate 7`、`compress`、`missingok`）可以放成檔案讓學習者閱讀，引擎不解析也不執行輪替；journald 的上限（`SystemMaxUse=`）在課文中說明。

### 14.6 課程資料與檢查

- `services`、`programs`、`journal` 只能用在 `services` 機器（行程的 `unit` 也是）。驗證：服務名稱合法、機器上有它的 unit 檔、`active` 是 active／failed／inactive、failed 與 inactive 的服務沒有行程、`pid` 只用在 failed、`since` 不晚於 `now`、結束碼 0–255；有 `unit` 的行程必須有 unit 檔；程式路徑絕對且不重複、訊息一行、`unless` 是絕對路徑；journal 的時間可解析、依序、不晚於 `now`，等級 0–7，id 符合 `[A-Za-z0-9_.@-]{1,32}`，訊息 1–500 字一行。
- 變體可以整個換掉 `journal`（`output` 檢查用：另一天的錯誤訊息不同）。
- 檢查 `service`：`{ kind: 'service', unit, active?, enabled? }`（`enabled` 讀磁碟上的連結，所以 `enable` 而沒有啟動、啟動而沒有 enable 都會被分辨）。
- 範例、參考解答與常見錯誤的**每一段管線與 `sudo` 執行的指令**都要在機器的 profile 裡（例如 `processes` 機器上的 `sudo systemctl …` 回報「`systemctl is not in the processes profile of machine app`」）。

### 14.7 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e4.test.ts` | `processes` 的分界（較低的 profile 拒絕 E4 指令、`$?`、`&`，狀態不多 `status`）、每個指令的 `man` 與 `--help`、固定時鐘的換算、`ps` 的每種格式與錯誤、管線中的 `grep` 行程、`top` 的整個快照、每種訊號與反應（忽略 SIGTERM、STOP 中的暫存訊號、HUP reload、PID 1、核心執行緒、殭屍、孤兒）、權限與 `sudo kill`、`pgrep`／`pidof`／`pkill`、背景工作與通知、結束碼表、不改動輸入狀態、機器欄位的驗證、`process` 檢查 |
| `tests/terminal-e5.test.ts` | `packages` 的分界、dpkg 的版本順序、非 root 的錯誤、`update` 與過期的清單、安裝與詢問、已是最新版與改成手動安裝、指定版本、降版、hold、unmet、移除／autoremove／purge 與 `rc`、`upgrade` 的 kept back、`list`／`show`／`policy`、非終端機的警告、`apt-mark`、`dpkg -l`／`-L`／`-s`、套件資料的驗證、`package` 檢查 |
| `tests/terminal-e6.test.ts` | `services` 的分界、unit 檔的解析與警告、enablement、`status` 的每種狀態與結束碼、非 root、啟動與 Main PID、Restart= 與啟動上限、慢的 RestartSec、203／217／oneshot／bad-setting、Requires=、停止與逾時、reload、kill 之後 systemd 的反應、enable／disable／--now、daemon-reload 的警告、list-units／list-unit-files／cat、套件安裝啟動服務、journalctl 的權限、過濾與錯誤、`/var/log`、資料驗證、`service` 檢查 |
| `tests/support/terminal-fixture.ts` | E4 的 `app`（固定時鐘、alice 的 CPU 大戶、忽略 SIGTERM 的 stuck.py、learner 的 Shell 與 vim）、E5 的 `pkg`（noble 三個套件庫加一個停用的 PPA、nginx 兩個版本、htop、openssl 的安全更新、被 hold 的 curl、缺少相依套件的 legacy-app）、E6 的 `svc`（執行中的 nginx、因缺少設定檔而失敗的 report、Restart=always 的 worker、忽略 SIGTERM 的 stubborn、api Requires db、journal）與 `svc-pkg`；每個階段三段紀錄與兩到三個練習；只供測試 |

`tests/terminal-e1.test.ts` 只把 `PROFILES` 的期望值加上三個新 profile（和 E2、E3 時相同的更新方式）；`text.grep` 改為回傳是否選到行（供結束碼使用），輸出不變。已發布的 LNX01–LNX07 沒有修改，`terminalContentProblems` 都是空的。
