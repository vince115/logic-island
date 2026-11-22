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
| `tests/support/terminal-fixture.ts` | 合成的機器（web-01、devs 群組可寫的團隊目錄、只有 adm 能讀的日誌）、三段紀錄、兩個練習；E1 另有 `files` profile 的 srv-01（系統資訊、兩個掛載點、符號連結、日誌檔）、三段紀錄、三個練習；只供測試 |

## 7. 島嶼登錄

- `PREPARED_ISLAND_IDS = ['linux-systems']`、`ISLAND_PREFIX['linux-systems'] = 'LNX'`、`UNITS['linux-systems'] = []`。
- `terminalFromBlueprint(id, summary, minutes)`（`lessons.ts`）：標題、目標、概念、難度、先修取自藍圖。活動對應：`terminal-sim` 與 `case-study-board`（LNX01，分析板尚未建置）→ `terminal-sim`（`['terminal']`）；`protocol-sequence`（LNX12 SSH）→ `network-sequence`（`['terminal', 'network-protocol']`）；`challenge-stages`（LNX15）→ `challenge-stages`（`['terminal', 'visualization']`）。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 LNX 課；15 堂仍是規劃中，沒有頁面，島嶼狀態仍是 `planned`。已發布的課、旗標、3D 世界、GLB 與島嶼座標都沒有改。

## 8. LNX 的批次與引擎階段

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。

| 批次 | 課程 | 需要的引擎階段 |
|---|---|---|
| LNX-1 | LNX01–LNX04 | **E1**（已完成，見 §9）：`uname`、`hostname`、`man`／`--help`、`df`／`du`、萬用字元（glob）、`ln -s`（啟用 `link`）、多來源的 `cp`／`mv` |
| LNX-2 | LNX05–LNX07 | **E2** 資料流：管線、`<`、`2>&1`、`head`／`tail`／`grep`／`sort`／`uniq`／`wc`／`cut`；**E3** 使用者與群組（例如 `id`、`groups`、`chown`、`chgrp`、`sudo` 的模擬、`/etc/passwd`／`/etc/group`） |
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

管線、`<`、`2>&1`、`head`／`tail`／`grep` 等（E2）；`id`、`chown`、`sudo`（E3）；`ls -R`、`ls` 的 `total` 列、時間戳記（`ls -l` 沒有日期欄，`touch` 不改時間）、`mount` 指令、`df -i`、`du --max-depth`、`ln -n`／`-T`、硬連結、反斜線跳脫、大括號展開 `{a,b}`、`**`、`man -k`。
