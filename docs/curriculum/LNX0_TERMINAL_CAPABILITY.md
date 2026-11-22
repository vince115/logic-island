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
  machines: [{ id, title, user, cwd, host?, home?, groups?, files: [{ path, kind, mode, owner, group?, content?, target? }] }],
  examples: [{ id, title, description, machine, steps: [{ command, output }] }],
  exercises: [{ id, title, machine, statement, checks, solution: string[], mistakes: [{ commands, why }], variants?: [{ label, files }], hints, explanation }],
}
```

- **機器**：`/` 隱含（root、0755），其餘每個檔案與目錄都要列出，父目錄先列；`home` 預設 `/home/<user>`（root 是 `/root`）。`kind: 'link'` 與 `target` 保留給 E1（`ln -s`），目前驗證器會拒絕。
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
| `tests/support/terminal-fixture.ts` | 合成的機器（web-01、devs 群組可寫的團隊目錄、只有 adm 能讀的日誌）、三段紀錄、兩個練習；只供測試 |

## 7. 島嶼登錄

- `PREPARED_ISLAND_IDS = ['linux-systems']`、`ISLAND_PREFIX['linux-systems'] = 'LNX'`、`UNITS['linux-systems'] = []`。
- `terminalFromBlueprint(id, summary, minutes)`（`lessons.ts`）：標題、目標、概念、難度、先修取自藍圖。活動對應：`terminal-sim` 與 `case-study-board`（LNX01，分析板尚未建置）→ `terminal-sim`（`['terminal']`）；`protocol-sequence`（LNX12 SSH）→ `network-sequence`（`['terminal', 'network-protocol']`）；`challenge-stages`（LNX15）→ `challenge-stages`（`['terminal', 'visualization']`）。
- 在第一堂課寫好、島嶼移入 `ISLAND_IDS` 之前，`validateCurriculum` 拒絕任何 LNX 課；15 堂仍是規劃中，沒有頁面，島嶼狀態仍是 `planned`。已發布的課、旗標、3D 世界、GLB 與島嶼座標都沒有改。

## 8. LNX 的批次與引擎階段

課程編號即位置，依序連續發布；每一批先完成它需要的引擎階段（各自的 profile 與測試），再寫課。

| 批次 | 課程 | 需要的引擎階段 |
|---|---|---|
| LNX-1 | LNX01–LNX04 | **E1**：`uname`、`hostname`、`man`／`--help`、`df`／`du`、萬用字元（glob）、`ln -s`（啟用 `link`）、多來源的 `cp`／`mv` |
| LNX-2 | LNX05–LNX07 | **E2** 資料流：管線、`<`、`2>&1`、`head`／`tail`／`grep`／`sort`／`uniq`／`wc`／`cut`；**E3** 使用者與群組（例如 `id`、`groups`、`chown`、`chgrp`、`sudo` 的模擬、`/etc/passwd`／`/etc/group`） |
| LNX-3 | LNX08–LNX11 | **E4** 行程與訊號、**E5** 套件管理、**E6** systemd 與 journal（固定的模擬資料，不執行真實程式） |
| LNX-4 | LNX12–LNX14 | **E7** SSH（金鑰與連線以網路情境與模擬機器呈現）、**E8** 有界的 Bash 直譯器（變數、條件、迴圈，有步數上限）、**E9** cron 與 systemd timer |
| LNX-5 | LNX15 | 綜合專題（`challenge-stages`），單獨一批 |

先修：LNX01 沒有先修；LNX02–LNX15 的同島先修都排在前面（`scripts/curriculum-queue.ts` 檢查）。島外的 DKR、SRV、CLD、CICD 有課以 LNX 為先修，都還沒有課程能力。
