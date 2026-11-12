# P7：系統與雲端工程互動實驗

> 2026-11-12，Five-Region Architecture Expansion 的 P7。分支 `archipelago/p6-sys`。互動實驗島仍是**跨區域共用的單一工具島**：沒有為 SYS 建立另一套實驗引擎或另一個 registry。
> 相關文件：[P6_SYSTEMS_CLOUD_REGION](P6_SYSTEMS_CLOUD_REGION.md)、[INTERACTIVE_ACTIVITY_ARCHITECTURE](INTERACTIVE_ACTIVITY_ARCHITECTURE.md)、[MULTI_ARCHIPELAGO_IA_V2 §4](MULTI_ARCHIPELAGO_IA_V2.md)。

## 1. Registry 與分類

| 層 | 變更 | 位置 |
|---|---|---|
| 學習領域 | 新增 `systems-cloud`（系統與雲端），排在既有 6 個領域之後 | `src/content/world/labs.ts` `LAB_DOMAINS` |
| 活動（課程端） | 5 個 T1 活動，全部在瀏覽器內以確定性模擬執行 | `src/content/world/activities.ts` `PLANNED` |
| 實驗（實驗島端） | 4 個工具實驗，每個是某個活動的獨立入口 | `src/content/world/labs.ts` `toolLabs` |

| 實驗 id | 名稱 | 活動 | 狀態 | 路由 | 使用的課程（由資料推導） |
|---|---|---|---|---|---|
| `linux-terminal` | Linux Terminal Simulator | `terminal-sim` | **implemented**（本次 MVP） | `/learn/linux-terminal` | LNX02–LNX11、LNX13、LNX14、SRV01、SRV09、SRV12 |
| `docker-playground` | Docker Container Playground | `container-playground` | planned | 無 | DKR03–DKR10、DKR13、DKR14 |
| `network-request` | Network Request Visualizer | `request-path` | planned | 無 | SRV02–SRV04、SRV06–SRV08、SRV11、KUB07 |
| `cicd-pipeline` | CI/CD Pipeline Simulator | `pipeline-sim` | planned | 無 | CICD03–CICD07、CICD09、CICD13 |
| — | （只作課程活動）`cluster-sim` | `cluster-sim` | planned | 無 | KUB01、KUB03–KUB06、KUB08–KUB11 |

規則沿用 P4：課程與實驗是多對多，關聯由 `lessonsUsingLab()` 推導、從不另外儲存；規劃中的實驗在側欄與 `/learn` 顯示「規劃中」、沒有連結、沒有路由（`dynamicParams = false`，打網址是 404）。

## 2. Linux Terminal Simulator 技術設計

### 2.1 結構

| 模組 | 職責 | 特性 |
|---|---|---|
| `src/lib/terminal/fs.ts` | 虛擬檔案系統：`Map<絕對路徑, 節點>`、路徑解析（`~`、`.`、`..`）、權限判斷、`ls -l` 字串 | 純資料、純函式；不 import 任何 Node／瀏覽器 API |
| `src/lib/terminal/shell.ts` | 指令直譯器：斷詞（引號、`>`／`>>`）、選項解析、14 個指令 | `run(state, input) → { state, lines }`，**永遠回傳新狀態**，不修改輸入 |
| `src/lib/terminal/tasks.ts` | 7 個練習任務 | 依**結果**判定（檔案系統狀態），不比對輸入文字 |
| `src/components/labs/terminal-lab.tsx` | 終端機畫面、輸入、歷史、檔案樹、任務 | 狀態只在元件記憶體；重新整理或「重設環境」即回到初始 |

支援的指令：`pwd`、`ls [-l] [-a]`、`cd`、`mkdir [-p]`、`touch`、`cat`、`echo [> | >>]`、`cp [-r]`、`mv`、`rm [-r] [-f]`、`chmod`（八進位與 `u+x`、`go-w`、`a=r`、`+x`、逗號串接）、`whoami`、`clear`、`help`。訊息格式仿 GNU coreutils／bash（例如 `cat: /etc/shadow: Permission denied`），讓學到的錯誤訊息能直接對應真實系統。

初始機器：root 擁有的 `/etc`（含 `hostname`、`os-release`、權限 600 的 `shadow`）、`/var/log/syslog`（640）、`/tmp`（777）、`/bin`；`learner` 的家目錄有 `README.txt`、`secret.txt`、`scripts/deploy.sh`、`tmp/` 兩個檔案。學習者是一般使用者 `learner`，所以權限錯誤是教學的一部分。

### 2.2 練習任務

| # | 任務 | 判定 |
|---|---|---|
| 1 | 建立 `~/projects` | 目錄存在 |
| 2 | 在 projects 寫入非空的 `notes.txt` | 檔案存在且有內容 |
| 3 | 備份到 `~/backup`，原檔保留 | backup 中有內容相同的檔案，原檔仍在（改名後仍算完成） |
| 4 | 備份改名為 `notes-2026.txt` | 新名存在、舊名不存在 |
| 5 | `deploy.sh` 對擁有者可執行，其他不變 | 模式恰為 744（`chmod +x` 會改到其他人，不算） |
| 6 | `secret.txt` 只有自己能讀寫 | 模式恰為 600 |
| 7 | 刪除 `~/tmp` | 目錄與內容都不存在 |

### 2.3 無障礙

- 終端機輸出是 `role="log"`（polite），輸入框有明確名稱「輸入指令（目前位置 ~/projects）」與說明（`aria-describedby`）。
- 家目錄以文字樹呈現（含權限與「← 目前位置」），是圖像化狀態的文字等效；完成任務以 `aria-live` 宣告；任務的完成與否有隱藏文字，不只靠圖示。
- 常用指令按鈕（`pwd`、`ls -l`…）讓觸控裝置不必打字；按鈕最小 44px；手機上提示字元換行，輸入框保持可用寬度；輸入字級 16px（iOS 不自動放大）。
- 終端機畫面在淺色與深色主題都使用深底：文字 14.48、錯誤 9.41、提示字元 12.71（對 `#0f172a`），都高於 AAA 7：1。

## 3. 安全模型

| 威脅 | 處理 | 驗證 |
|---|---|---|
| 執行真實指令 | 沒有 `eval`、`Function`、`child_process`、Worker 或網路；輸入只被斷詞並查表，表外一律 `command not found` | `tests/terminal.test.ts`「runs nothing but the table」 |
| Shell 語法注入 | 管線、指令串接、命令替換、變數、背景執行、輸入重新導向（`\| ; && \|\| & $ \` <`）在引號外一律拒絕且不改變狀態；引號內是普通文字 | 同上，7 種輸入逐一檢查狀態未變 |
| 存取主機檔案 | 檔案系統只是一個 `Map`；路徑解析永遠落在虛擬根目錄內（`/../../etc` → `/etc`，指的是虛擬的 `/etc`） | `resolvePath` 測試 |
| XSS | 所有輸出都以 React 文字節點呈現，沒有 `dangerouslySetInnerHTML` | 程式審查 |
| 資源耗盡 | 一行最多 500 字元、節點最多 400、名稱 64 字元、深度 16、檔案 4,000 字元、畫面保留 300 行、歷史 50 筆 | 「keeps every input, name, file and tree within the limits」 |
| 破壞性操作的教學風險 | `rm -rf /`、`rm -r .`、刪除自己所在的目錄都拒絕，並說明原因 | 「refuses the dangerous removals」 |
| 資料外洩 | 不寫 localStorage、不送出任何請求；不涉及題庫或使用者進度 | 程式審查；`.next` leak-scan |
| 伺服器端執行 | 完全不需要（T1，`runtime: browser`）；`validateActivities` 禁止 T4 | registry 測試 |

刻意**不支援**（並在頁面上說明）：管線、萬用字元展開、環境變數、程序與訊號、`sudo`。這些在 LNX05、LNX08 等課程以文字與預錄輸出教學，等有需要再評估擴充，且必須維持「查表、不執行」的原則。

## 4. 測試計畫與結果

| 層 | 內容 | 結果 |
|---|---|---|
| 單元（`tests/terminal.test.ts`，15 項） | 路徑、提示字元、斷詞、每個指令的成功與錯誤訊息、chmod 兩種寫法、一般使用者的權限、拒絕清單、上限、不修改輸入狀態、7 個任務可由一般指令完成、任務依結果判定 | 15 通過 |
| Registry | `linux-terminal` implemented、`terminal-sim` 由獨立實驗變為 implemented（1.0.0）、其他 3 個實驗 planned；側欄實驗樹多一個連結 | `tests/labs.test.ts`、`tests/world-paths.test.ts`、`tests/site-nav.test.ts` 通過 |
| 路由契約 | **刻意**新增 `/learn/linux-terminal`（預設與旗標建置各一筆），沒有其他路由變化 | snapshot 已更新，diff 只有這兩行 |
| E2E（桌機＋手機） | 指令改變檔案系統、可及名稱隨目錄更新、任務 0→2、`/etc/shadow` 拒絕、管線拒絕、↑ 叫回歷史、重設後回到 0／7 且檔案樹還原、使用它的課程（LNX02…）沒有連結；實驗島列出兩個開放的工具實驗；爬站包含新頁面 | `navigation.spec` 全部通過 |
| 瀏覽器 | 1280×900 與 375×812：無水平捲動、手機提示字元換行、輸入寬 210px | 通過 |

未執行：真機、螢幕閱讀器實機（只以可及名稱與 role 驗證）。

## 5. 其他三個實驗的設計要點（Planned）

| 實驗 | 模型 | 互動 | 不做的事 |
|---|---|---|---|
| Docker Container Playground | 有限狀態機：Image（built）→ Container（created → running → exited → removed），Volume 與 Network 是可連結的節點 | 按鈕與簡化指令（`docker build`、`run -v -p --network`、`stop`、`rm`）；視覺化連線與狀態；資料是否保留的判定 | 不啟動 Docker Daemon、不拉取真實 Image |
| Network Request Visualizer | 預先定義的情境（正常、DNS 錯誤、憑證過期、502、504、快取命中） | 逐步播放 Browser → DNS → TCP → TLS → Reverse Proxy → App → DB，每步顯示封包摘要與耗時 | 不發出真實網路請求 |
| CI/CD Pipeline Simulator | 管線定義（stages／jobs）＋情境（成功、測試失敗、部署後錯誤率升高→回滾） | 推進每個 stage、觀察產出物版本、觸發金絲雀與回滾 | 不連 GitHub Actions、不使用真實憑證 |

三者都沿用 `ToolLabPage`（Think → Visualize → Code）、`hasToolLabComponent` 與路由契約；實作時把狀態改為 implemented 並刻意更新 snapshot。

## 6. GPU／CUDA

AI Infrastructure 路線（L）以 OPS07（GPU 推論與批次處理）代表 GPU；CUDA 程式設計、GPU 叢集排程列為未來進階方向，本次不新增教材或實驗環境。
