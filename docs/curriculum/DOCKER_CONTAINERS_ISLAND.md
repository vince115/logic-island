# Docker 容器島（Docker Containers Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `dockerFromBlueprint` 讀入。

教學方式沿用 `terminal` 能力：範例是模擬機器上重新執行後輸出完全一致的終端機紀錄，練習以重新執行學習者的指令檢查結果（[DKR0_CONTAINER_CAPABILITY](DKR0_CONTAINER_CAPABILITY.md)）。Docker 指令從引擎階段 E20（`containers`）起可用，輸出格式依 Docker CE 27.5.1；namespace、cgroup、overlay2 與 runc 等核心機制只在課文中以文字與表格說明，不假裝成指令輸出。藍圖為 architecture-diagram 的課另有一段網路情境。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 機器與情境 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| DKR01 | 容器概念：與虛擬機的差異<br>`containers-vs-virtual-machines` | 入門 | 45 分 | LNX08 | 1 台（containers）＋ 1 個網路情境（同一個請求到虛擬機與到容器） | 6 段、5 段終端機紀錄、3 個終端機練習（容器的使用者空間、共用的核心版本、讓容器持續執行）與 2 個網路練習、8 題 | **完整 v1.0.0** |
| DKR02 | Docker 架構：Client、Daemon 與 Registry<br>`docker-architecture` | 入門 | 45 分 | DKR01 | 2 台（containers）＋ 1 個網路情境（`docker run nginx` 從 Client 到核心） | 6 段、5 段終端機紀錄、2 個終端機練習（docker 群組與 socket 權限、拉取指定標籤）與 3 個網路練習、8 題 | **完整 v1.0.0** |
| DKR03 | Image 與 Container 的生命週期<br>`images-and-containers` | 入門 | 50 分 | DKR02 | 3 台（containers） | 6 段、5 段終端機紀錄、4 個終端機練習（同一個 Image 的兩個容器、可寫層撐過 stop 與 start、清理容器與 Image、讀出結束碼）、7 題 | **完整 v1.0.0** |
| DKR04 | Docker CLI 常用指令<br>`docker-cli-essentials` | 入門 | 55 分 | DKR03 | 2 台（containers） | 6 段、5 段終端機紀錄、5 個終端機練習（以連接埠對應發布 nginx、修正連接埠被占用、找出發布某個埠的容器、從日誌讀出狀態碼、用 exec 讀設定）、7 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 容器與 Docker 入門 | DKR01–DKR04 |

## 模擬器的已知差異（課文已說明或避開，列為引擎階段 E21 的修正）

- 主機的 `ps` 不列出容器裡的行程（真實主機會以主機的 PID 列出）。
- alpine 裡的 `ps` 用 procps 的格式而不是 BusyBox。
- `docker logs -t` 的時間是容器啟動時間；Image 的 digest 只由名稱與標籤決定。
- `/var/run` 與 socket 的檔案類型：socket 顯示成一般檔案（`-rw-rw----`），課文已說明。

## 引擎修正後的課文更正

- 2026-11-23（E20 的修正，見 [DKR0_CONTAINER_CAPABILITY](DKR0_CONTAINER_CAPABILITY.md) §10）：DKR03 原本說 `docker rmi -f` 在有容器使用時只移除標籤。真實的 Docker 只有在執行中的容器使用時才只移除標籤；只有停止（或 created）的容器使用時，`-f` 照樣刪除 Image，留下指向不存在 Image 的容器。DKR03 的清理段落（表格與說明）、測驗 q4 的解說與「清理容器與 Image」練習的典型錯誤已更正；五段終端機紀錄的輸出不變。

## 後續批次

DKR-2（DKR05–06，E21 Dockerfile 建置、分層與快取）、DKR-3（DKR07–08，E22 Volume 與網路）、DKR-4（DKR09–11，E23 Compose、多階段建置與 Registry）、DKR-5（DKR12–14，E24 inspect、健康檢查、資源限制與 OOM）、DKR-6（DKR15 綜合專題）。

課程狀態與 3D 地景分離：Docker 容器島的 `mapState` 仍是 `'planned'`。
