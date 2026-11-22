# Linux 系統島（Linux Systems Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `terminalFromBlueprint` 讀入。

教學方式是 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄，練習在內嵌主控台裡做，依執行後的檔案系統狀態與輸出判定（原機器與每個變體都要成立）。模擬器不執行真實的 Shell；每台機器選擇一個指令集（profile），LNX-1 使用引擎階段 E1 的 `files`，LNX-2 使用 E2 的 `streams`（管線與重新導向）與 E3 的 `users`（帳號與群組），LNX-3 使用 E4–E6 的 `processes`、`packages` 與 `services`（行程、apt、systemd 與 journal，時間固定在機器宣告的「現在」），LNX-4 使用 E7–E9 的 `remote`、`scripting` 與 `scheduling`（SSH 與遠端主機、Bash 指令稿直譯器、cron 與 systemd timer）。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| LNX01 | Linux 概論與發行版<br>`linux-overview-and-distributions` | 入門 | 40 分 | — | 3 台（Ubuntu 伺服器、Rocky Linux 資料庫、Fedora 筆電） | 6 段、4 個範例（以 uname、hostname、/etc/os-release、df 辨認系統）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX02 | 終端機與 Shell 基礎<br>`terminal-and-shell-basics` | 入門 | 45 分 | LNX01 | 2 台（一般使用者與 root） | 6 段、5 個範例（提示字元、選項與參數、man 與 --help、讀懂錯誤訊息）、4 個練習、8 題 | **完整 v1.0.0** |
| LNX03 | Linux 檔案系統階層<br>`linux-filesystem-hierarchy` | 入門 | 50 分 | LNX02 | 1 台（6 個掛載點的伺服器） | 5 段、5 個範例（FHS 導覽、相對路徑、ls 選項、df、du）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX04 | 檔案與目錄操作<br>`files-and-directories` | 入門 | 55 分 | LNX03 | 4 台 | 6 段、5 個範例（建立、複製與搬移、萬用字元、刪除、符號連結）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX05 | 文字處理、管線與重新導向<br>`text-processing-and-pipes` | 中級 | 55 分 | LNX04 | 2 台（streams：網站伺服器、批次主機） | 5 段、5 個範例（查看日誌、grep、管線與 cut、sort 與 uniq 次數排行、標準輸出與標準錯誤的重新導向）、3 個練習（變體日誌的錯誤計數與熱門路徑、>> 與 2> 分開保存）、8 題 | **完整 v1.0.0** |
| LNX06 | 使用者與群組<br>`users-and-groups` | 入門 | 50 分 | LNX04 | 5 台（users） | 6 段、5 個範例（id 與 login.defs、passwd／group／shadow、useradd 與 groupadd、-aG 與 -G、sudo 與服務帳號）、4 個練習（部署帳號、加入第二個群組、不能登入的系統帳號、上傳檔案的擁有者）、8 題 | **完整 v1.0.0** |
| LNX07 | Linux 權限與 chmod<br>`linux-file-permissions` | 中級 | 55 分 | LNX06 | 5 台（users：共用的團隊機器與 4 台練習機） | 6 段、5 個範例（讀懂 ls -l、目錄的 r／w／x、擁有者→群組→其他人的順序、chmod、chown／chgrp／umask）、4 個練習（只給擁有者執行、群組共用目錄、修正 Permission denied、umask 027）、8 題；setuid、setgid 與 sticky 只以文字說明 | **完整 v1.0.0** |
| LNX08 | Process 管理與訊號<br>`processes-and-signals` | 中級 | 55 分 | LNX05 | 1 台（processes：nginx、PostgreSQL、失控的報表工作、忽略 SIGTERM 的程式） | 6 段、5 個範例（行程樹、找出耗資源的行程、前景與背景工作、訊號、結束碼）、4 個練習（以 SIGTERM 停止報表、SIGTERM 無效時升級為 SIGKILL、記憶體用量最大的 PID、讀懂 `$?`）、8 題 | **完整 v1.0.0** |
| LNX09 | 套件管理<br>`package-management` | 中級 | 55 分 | LNX06 | 3 台（packages，Ubuntu 24.04） | 6 段、5 個範例（套件索引、安裝與相依、移除與 purge、hold、核心更新）、4 個練習（在過期的主機安裝 jq、完整移除 apache2、列出可升級套件、鎖定 nodejs 後升級其他套件）、8 題；dnf 以對照表說明 | **完整 v1.0.0** |
| LNX10 | systemd 與服務管理<br>`systemd-services` | 中級 | 60 分 | LNX08 | 5 台（services） | 6 段、5 個範例（unit 檔位置、status、enable 與 start、撰寫 unit、重新啟動與相依）、4 個練習（enable --now、撰寫並 daemon-reload 一個 unit、從 status 診斷失敗原因、找出 Main PID）、8 題 | **完整 v1.0.0** |
| LNX11 | 日誌與 journalctl<br>`logs-and-journald` | 中級 | 50 分 | LNX05、LNX10 | 1 台（services，固定的現在時間） | 6 段、5 個範例（/var/log 與 journal、讀取權限、-u／-p／-n／-r、時間範圍、與管線組合）、4 個練習（今天第一次失敗的時間、最近一小時的 SSH 失敗登入、某服務的錯誤訊息、存成事件報告）、8 題 | **完整 v1.0.0** |
| LNX12 | SSH 遠端連線與金鑰<br>`ssh-remote-access` | 中級 | 55 分 | LNX07 | 3 台（remote，含遠端主機）＋ 2 個 network-protocol 情境 | 6 段、7 個範例（5 段終端機紀錄、SSH 連線 12 步驟與中間人攻擊兩個情境）、5 個練習（設定金鑰登入、主機金鑰改變時先核對再更新、安全地改成只允許金鑰登入，以及兩個協定步驟題）、8 題 | **完整 v1.0.0** |
| LNX13 | Bash Script 撰寫<br>`bash-scripting` | 中級 | 60 分 | LNX05、LNX07 | 5 台（scripting） | 6 段、5 個範例（第一支指令稿、變數與參數、test 與條件、迴圈與 case、set -euo pipefail）、4 個練習（帶日期的備份指令稿、統計日誌等級、修正含空白檔名的錯誤、遇到錯誤就停止的匯出）、7 題 | **完整 v1.0.0** |
| LNX14 | 排程：cron 與 systemd timer<br>`cron-and-systemd-timers` | 中級 | 55 分 | LNX10、LNX13 | 3 台（scheduling，Asia/Taipei，固定的現在時間） | 6 段、5 個範例（cron 欄位、安裝 crontab、cron 的環境與輸出、timer 與 Persistent 補執行、flock）、4 個練習（平日 02:15 的備份、timer 與 service 一組、systemd-analyze calendar 的下次執行時間、以 flock -n 避免重疊）、8 題；cron-next、cron-run 是模擬器的教學輔助指令；夏令時間以文字說明 | **完整 v1.0.0** |
| LNX15 | Linux 系統島綜合專題：維護一台伺服器<br>`linux-systems-capstone` | 進階 | 120 分 | LNX09、LNX11、LNX12、LNX14 | 6 台（scheduling，Asia/Taipei；每個關卡一份機器快照，SSH 關卡含遠端主機） | 7 段、5 個範例、六個關卡（challenge-stages）各一個練習：帳號與權限、SSH 金鑰與只允許金鑰登入、部署 systemd 服務、從 status 與 journal 追查並修復停擺、set -euo pipefail 的備份指令稿＋cron.d＋flock、鎖定套件後套用更新並寫變更紀錄；8 題（每題結合兩堂以上） | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| Linux 與 Shell 入門 | LNX01–LNX02 |
| 檔案系統與檔案操作 | LNX03–LNX04 |
| 文字處理與管線 | LNX05 |
| 使用者、群組與權限 | LNX06–LNX07 |
| 行程與套件 | LNX08–LNX09 |
| 服務與日誌 | LNX10–LNX11 |
| 遠端連線、指令稿與排程 | LNX12–LNX14 |
| 綜合專題 | LNX15 |

## 模擬器的已知差異（課文已說明）

- LNX-1 時期的差異（長選項、`Try --help` 第二行、`du ~`、`mv a dir/`）已在 LNX-2 的引擎修正。
- 變體只能改變檔案、主機名稱與系統資訊，不能改變帳號資料；以帳號資料做輸出檢查的練習改用檔案擁有者等可以變化的資料。
- 變體不能替換套件資料；`journalctl -g` 一律區分大小寫（真實的 journalctl 在樣式全為小寫時不分大小寫）；輸出檢查只要求某一個指令印出相同文字，答案只有兩種值的練習可以被猜中（列為之後的能力改進）。
- `cut -c` 與 `tr` 以字元計算（GNU 以位元組計算，非 ASCII 文字會不同）；setuid、setgid 與 sticky 位元只以文字說明；腳本不能真正執行。
- `ls -l` 沒有連結數與時間欄位；硬連結只以文字說明。

## 後續批次

LNX-2 發布 LNX05–LNX07（E2、E3，並修正長選項、`Try --help` 第二行、`~` 展開與 `mv a dir/` 的訊息，使 LNX02 的錯誤範例更接近 GNU）。LNX-3 發布 LNX08–LNX11（E4–E6），LNX-4 發布 LNX12–LNX14（E7–E9）。LNX-5 發布 LNX15 綜合專題：Linux 系統島 15/15 完成，各批需要的引擎階段見 [LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)：LNX-3（LNX08–11）、LNX-4（LNX12–14）、LNX-5（LNX15 綜合專題）。

課程狀態與 3D 地景分離：Linux 系統島的 `mapState` 仍是 `'planned'`。系統與雲端工程群島因此第一次有已開放的課（區域狀態 available），Linux 系統島全部開放後，其他三座島仍是大綱。
