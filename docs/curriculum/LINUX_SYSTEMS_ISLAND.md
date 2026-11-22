# Linux 系統島（Linux Systems Island）

> 2026-11-22 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `terminalFromBlueprint` 讀入。

教學方式是 `terminal` 能力（[LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)）：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄，練習在內嵌主控台裡做，依執行後的檔案系統狀態與輸出判定（原機器與每個變體都要成立）。模擬器不執行真實的 Shell；每台機器選擇一個指令集（profile），LNX-1 使用引擎階段 E1 的 `files` profile。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| LNX01 | Linux 概論與發行版<br>`linux-overview-and-distributions` | 入門 | 40 分 | — | 3 台（Ubuntu 伺服器、Rocky Linux 資料庫、Fedora 筆電） | 6 段、4 個範例（以 uname、hostname、/etc/os-release、df 辨認系統）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX02 | 終端機與 Shell 基礎<br>`terminal-and-shell-basics` | 入門 | 45 分 | LNX01 | 2 台（一般使用者與 root） | 6 段、5 個範例（提示字元、選項與參數、man 與 --help、讀懂錯誤訊息）、4 個練習、8 題 | **完整 v1.0.0** |
| LNX03 | Linux 檔案系統階層<br>`linux-filesystem-hierarchy` | 入門 | 50 分 | LNX02 | 1 台（6 個掛載點的伺服器） | 5 段、5 個範例（FHS 導覽、相對路徑、ls 選項、df、du）、3 個練習、8 題 | **完整 v1.0.0** |
| LNX04 | 檔案與目錄操作<br>`files-and-directories` | 入門 | 55 分 | LNX03 | 4 台 | 6 段、5 個範例（建立、複製與搬移、萬用字元、刪除、符號連結）、3 個練習、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| Linux 與 Shell 入門 | LNX01–LNX02 |
| 檔案系統與檔案操作 | LNX03–LNX04 |

## 模擬器的已知差異（課文已說明）

- 長選項只支援 `--help`；`>`、`>>` 只有 `echo` 支援（管線與一般重導向是引擎階段 E2）。
- `du ~` 印出的路徑是 `~`（真實的 bash 會先展開成家目錄）；`mv a dir/` 在 `dir` 不存在時會改名，GNU 會回報 Not a directory。課程範例與練習都避開這些寫法，列為之後引擎階段的修正。
- `ls -l` 沒有連結數與時間欄位；硬連結只以文字說明。

## 後續批次

其餘 11 堂依編號連續發布，各批需要的引擎階段見 [LNX0_TERMINAL_CAPABILITY](LNX0_TERMINAL_CAPABILITY.md)：LNX-2（LNX05–07，E2 管線與重導向、E3 使用者與群組）、LNX-3（LNX08–11）、LNX-4（LNX12–14）、LNX-5（LNX15 綜合專題）。

課程狀態與 3D 地景分離：Linux 系統島的 `mapState` 仍是 `'planned'`。系統與雲端工程群島因此第一次有已開放的課（區域狀態 available），其他三座島仍是大綱。
