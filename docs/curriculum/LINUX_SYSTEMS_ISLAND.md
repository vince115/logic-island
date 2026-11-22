# Linux 系統島（Linux Systems Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `terminalFromBlueprint` 讀入。

教學方式是 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄，練習在內嵌主控台裡做，依執行後的檔案系統狀態與輸出判定（原機器與每個變體都要成立）。模擬器不執行真實的 Shell；每台機器選擇一個指令集（profile），LNX-1 使用引擎階段 E1 的 `files`，LNX-2 使用 E2 的 `streams`（管線與重新導向）與 E3 的 `users`（帳號與群組）。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| LNX01 | Linux 概論與發行版<br>`linux-overview-and-distributions` | 入門 | 40 分 | — | 3 台（Ubuntu 伺服器、Rocky Linux 資料庫、Fedora 筆電） | 6 段、4 個範例（以 uname、hostname、/etc/os-release、df 辨認系統）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX02 | 終端機與 Shell 基礎<br>`terminal-and-shell-basics` | 入門 | 45 分 | LNX01 | 2 台（一般使用者與 root） | 6 段、5 個範例（提示字元、選項與參數、man 與 --help、讀懂錯誤訊息）、4 個練習、8 題 | **完整 v1.0.0** |
| LNX03 | Linux 檔案系統階層<br>`linux-filesystem-hierarchy` | 入門 | 50 分 | LNX02 | 1 台（6 個掛載點的伺服器） | 5 段、5 個範例（FHS 導覽、相對路徑、ls 選項、df、du）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX04 | 檔案與目錄操作<br>`files-and-directories` | 入門 | 55 分 | LNX03 | 4 台 | 6 段、5 個範例（建立、複製與搬移、萬用字元、刪除、符號連結）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX05 | 文字處理、管線與重新導向<br>`text-processing-and-pipes` | 入門 | 55 分 | LNX04 | 2 台（streams：網站伺服器、批次主機） | 5 段、5 個範例（查看日誌、grep、管線與 cut、sort 與 uniq 次數排行、標準輸出與標準錯誤的重新導向）、3 個練習（變體日誌的錯誤計數與熱門路徑、>> 與 2> 分開保存）、8 題 | **完整 v1.0.0** |
| LNX06 | 使用者與群組<br>`users-and-groups` | 入門 | 50 分 | LNX04 | 5 台（users） | 6 段、5 個範例（id 與 login.defs、passwd／group／shadow、useradd 與 groupadd、-aG 與 -G、sudo 與服務帳號）、4 個練習（部署帳號、加入第二個群組、不能登入的系統帳號、上傳檔案的擁有者）、8 題 | **完整 v1.0.0** |
| LNX07 | Linux 權限與 chmod<br>`linux-file-permissions` | 入門 | 55 分 | LNX06 | 5 台（users：共用的團隊機器與 4 台練習機） | 6 段、5 個範例（讀懂 ls -l、目錄的 r／w／x、擁有者→群組→其他人的順序、chmod、chown／chgrp／umask）、4 個練習（只給擁有者執行、群組共用目錄、修正 Permission denied、umask 027）、8 題；setuid、setgid 與 sticky 只以文字說明 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| Linux 與 Shell 入門 | LNX01–LNX02 |
| 檔案系統與檔案操作 | LNX03–LNX04 |
| 文字處理與管線 | LNX05 |
| 使用者、群組與權限 | LNX06–LNX07 |

## 模擬器的已知差異（課文已說明）

- LNX-1 時期的差異（長選項、`Try --help` 第二行、`du ~`、`mv a dir/`）已在 LNX-2 的引擎修正。
- 變體只能改變檔案、主機名稱與系統資訊，不能改變帳號資料；以帳號資料做輸出檢查的練習改用檔案擁有者等可以變化的資料。
- `cut -c` 與 `tr` 以字元計算（GNU 以位元組計算，非 ASCII 文字會不同）；setuid、setgid 與 sticky 位元只以文字說明；腳本不能真正執行。
- `ls -l` 沒有連結數與時間欄位；硬連結只以文字說明。

## 後續批次

LNX-2 發布 LNX05–LNX07（E2、E3，並修正長選項、`Try --help` 第二行、`~` 展開與 `mv a dir/` 的訊息，使 LNX02 的錯誤範例更接近 GNU）。其餘 8 堂依編號連續發布，各批需要的引擎階段見 [LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)：LNX-3（LNX08–11）、LNX-4（LNX12–14）、LNX-5（LNX15 綜合專題）。

課程狀態與 3D 地景分離：Linux 系統島的 `mapState` 仍是 `'planned'`。系統與雲端工程群島因此第一次有已開放的課（區域狀態 available），其他三座島仍是大綱。
