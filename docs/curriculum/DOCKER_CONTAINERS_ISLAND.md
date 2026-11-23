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
| DKR05 | 撰寫 Dockerfile<br>`writing-dockerfiles` | 中級 | 55 分 | DKR04、LNX09 | 3 台（images：沒有 Dockerfile、壞掉的 Dockerfile、可用的專案） | 6 段、5 段終端機紀錄、5 個終端機練習（寫出 Dockerfile 並以 -p 執行、修好壞掉的 Dockerfile、用 .dockerignore 擋住 .env、改以非 root 執行、ENTRYPOINT 與 CMD 的組合）、7 題 | **完整 v1.0.0** |
| DKR06 | Image 分層與建置快取<br>`image-layers-and-build-cache` | 中級 | 55 分 | DKR05 | 1 台（images：五個專案與數個基底 Image） | 6 段、5 段終端機紀錄、4 個終端機練習（調整指令順序讓安裝維持 CACHED、在同一個 RUN 清理縮小 Image、從 docker history 找出最大的層、修正讓快取每次失效的 .dockerignore）、7 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 容器與 Docker 入門 | DKR01–DKR04 |
| Dockerfile 與建置快取 | DKR05–DKR06 |

## 模擬器的已知差異（課文已說明或避開）

- 主機的 `ps` 不列出容器裡的行程（真實主機會以主機的 PID 列出）：**E21 起修正，只在 `images` profile 以上**（DKR05 起的課；主機的 `ps` 有 `containerd-shim-runc-v2` 與容器的主程式，見 [DKR0_CONTAINER_CAPABILITY](DKR0_CONTAINER_CAPABILITY.md) §11.6）。`containers` profile（DKR01–DKR04）維持原樣，因為打開它會改變 DKR02（`pgrep -a containerd`）與 DKR04（docker-proxy 的 PID）的範例輸出；DKR01 的說明框（模擬環境的主機 ps 看不到容器的行程）對它的 profile 仍然正確，未修改。
- alpine 裡的 `ps` 用 procps 的格式而不是 BusyBox（維持原樣）。
- `docker logs -t` 的時間是容器啟動時間；Image 的 digest 只由名稱與標籤決定。
- `/var/run` 與 socket 的檔案類型：socket 顯示成一般檔案（`-rw-rw----`），課文已說明。
- E21（`docker build`）：進度一律是 BuildKit 的 plain 格式（不模擬終端機的 TTY 畫面），時間是決定論的；RUN 沒有網路，apt、pip、npm 只用課程宣告的套件表；層的大小只算檔案內容；`transferring context` 每次報告全部用到的檔案（真實的 BuildKit 第二次只傳送改變的檔案）。其餘見 §11.9、§11.10。
- 時鐘不會自己前進，所以 `--no-cache` 重新建置得到的 Image ID 和使用快取的建置相同（真實的 Docker 會是新的 ID）；DKR06 的範例避開了這一點。
- E22（`storage-net`，DKR07 起，見 [DKR0_CONTAINER_CAPABILITY](DKR0_CONTAINER_CAPABILITY.md) §12）：Volume 的內容就是主機的 `/var/lib/docker/volumes/名稱/_data`；iptables／NAT、veth 與 `docker0` 等 bridge 介面、overlay 網路、local 以外的 Volume 驅動程式只在課文說明。容器之間只看得到共同網路上的容器（自訂網路解析名稱，預設 bridge 只有位址），容器經由閘道連到主機自己的服務、內建 DNS 轉送外部名稱都不模擬。Alpine 的 `ping`、`tar`、`nc` 用 iputils、GNU tar、OpenBSD nc 的版面（真實是 BusyBox），要逐字展示時請用 Debian 系的 Image；tar 封存檔的大小不是真實的大小。`--network host` 的容器埠被占用時，日誌是說明文字而不是 nginx 的 `bind() failed`。
- E22 起 `docker run` 的 `-v`、`--mount`、`--tmpfs`、`--network` 在較低的 profile 說明是 E22（原本是 `unknown flag`；DKR01–DKR06 沒有用到，輸出不變）。

## 引擎修正後的課文更正

- 2026-11-23（E20 的修正，見 [DKR0_CONTAINER_CAPABILITY](DKR0_CONTAINER_CAPABILITY.md) §10）：DKR03 原本說 `docker rmi -f` 在有容器使用時只移除標籤。真實的 Docker 只有在執行中的容器使用時才只移除標籤；只有停止（或 created）的容器使用時，`-f` 照樣刪除 Image，留下指向不存在 Image 的容器。DKR03 的清理段落（表格與說明）、測驗 q4 的解說與「清理容器與 Image」練習的典型錯誤已更正；五段終端機紀錄的輸出不變。

## 後續批次

DKR-2（DKR05–06，E21 Dockerfile 建置、分層與快取；引擎階段已完成，見 DKR0 §11）、DKR-3（DKR07–08，E22 Volume 與網路；引擎階段已完成，見 DKR0 §12）、DKR-4（DKR09–11，E23 Compose、多階段建置與 Registry）、DKR-5（DKR12–14，E24 inspect、健康檢查、資源限制與 OOM）、DKR-6（DKR15 綜合專題）。

課程狀態與 3D 地景分離：Docker 容器島的 `mapState` 仍是 `'planned'`。
