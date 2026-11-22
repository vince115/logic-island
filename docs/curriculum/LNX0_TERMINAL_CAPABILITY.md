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

- **機器**：`/` 隱含（root、0755），其餘每個檔案與目錄都要列出，父目錄先列；`home` 預設 `/home/<user>`（root 是 `/root`）。`kind: 'link'` 與 `target`、`profile`、`system`、`mounts` 是 E1 的欄位，只有 `profile: 'files'` 的機器可以使用（見 §9）。
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
| LNX-3 | LNX08–LNX11 | **E4** 行程與訊號、**E5** 套件管理、**E6** systemd 與 journal（固定的模擬資料，不執行真實程式） |
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
