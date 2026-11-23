# DevOps 與 CI/CD 島（DevOps & CI/CD Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、難度、先修）取自藍圖，由 `lessons.ts` 的 `cicdFromBlueprint` 讀入；每一課的活動與能力由逐課的 `CICD_SHAPES` 決定（[CICD0_DEVOPS_CAPABILITY](CICD0_DEVOPS_CAPABILITY.md) §2）。

教學方式有兩種：部署紀錄與部署模擬用新能力 `devops-explorer`（D1 部署紀錄與 DORA 指標、D2 逐分鐘的部署模擬 `deployment-simulator`），所有數字是課程撰寫的示意資料，指標與練習的答案由模擬器算出、不寫在課程資料裡；git、Pull Request 與 workflow 的課沿用 `terminal` 能力（引擎階段 E25–E31，尚未建置）。文化、團隊結構與 DORA 的效能分級只在課文中以文字說明。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 探索器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| CICD01 | DevOps 概念與文化<br>`devops-culture-and-practices` | 入門 | 45 分 | —（建議 SA02） | 4 份部署紀錄（D1，示意資料）：同一週八個變更的一次上線（1 次部署、前置時間中位數 3765 分、失敗率 100%、復原 240 分）與分開上線（8 次、58 分、13%、20 分）；A 團隊 84 天（5 次、每週 0.4 次、19140 分、40%、720 分）與 B 團隊 84 天（60 次、每週 5.0 次、65 分、5%、25 分） | 6 段、4 個探索器、6 個 devops 練習（一次與分開上線的比較表、哪一種恢復得快、A 團隊的部署頻率、A 團隊的穩定、B 團隊的四個指標、誰的變更等得比較久）、8 題 | **完整 v1.0.0** |
| CICD02 | 團隊 Git 工作流程<br>`git-workflows-for-teams` | 入門 | 55 分 | CICD01 | 1 台（forge：tidepool 團隊在 github.example 上的 library 與 events 儲存庫、兩位審查者） | 7 段、5 段終端機紀錄、4 個終端機練習（分支到合併的 PR、把落後且衝突的 PR rebase 後再合併、讀出 main 的分支保護、以 gh api 設定分支保護）、8 題 | **完整 v1.0.0** |
| CICD03 | 持續整合<br>`continuous-integration` | 入門 | 50 分 | CICD02 | 1 台（actions：Harborline 的 timetable 與 fares 儲存庫，CI 會跑 lint、build 與 test） | 6 段、5 段終端機紀錄、4 個終端機練習（找出讓 main 變紅的 commit、修好主分支、修好紅燈的 PR 再合併、要求 build 檢查）、7 題 | **完整 v1.0.0** |
| CICD04 | GitHub Actions 入門<br>`github-actions-basics` | 中級 | 60 分 | CICD03、LNX13 | 1 台（actions：seabird 的 ferry-times 與 pier-tickets 儲存庫） | 7 段、5 段終端機紀錄、4 個終端機練習（第一個 CI workflow、最小權限、以 needs 與輸出串起 job、以路徑篩選略過文件變更）、7 題 | **完整 v1.0.0** |
| CICD05 | 管線中的自動化測試<br>`automated-testing-in-pipelines` | 中級 | 55 分 | CICD04 | 1 台（actions：ferrylane 的 tickets 儲存庫，單元、整合、端對端與跨瀏覽器的測試工具） | 6 段、4 段終端機紀錄、4 個終端機練習（以 needs 分層讓單元測試先失敗、以 matrix 分片平行執行、找出不穩定的測試、只重新執行失敗的 job）、8 題 | **完整 v1.0.0** |
| CICD06 | 建置管線與產出物<br>`build-pipelines-and-artifacts` | 中級 | 60 分 | CICD04、DKR11 | 1 台（artifacts：Lanternfish Kitchen 的 order-web 與 menu-api 儲存庫、私有 Registry） | 6 段、5 段終端機紀錄、3 個終端機練習（以 lockfile 的雜湊快取相依套件、以 artifact 讓後面的 job 用同一份產出物、以 secret 登入並推送 sha-<commit> 標籤的 Image）、7 題 | **完整 v1.0.0** |
| CICD07 | 環境變數與設定管理<br>`environment-variables-and-config` | 中級 | 50 分 | CICD04 | 1 台（artifacts：kestrel 的 dock-status 與 rider-api 儲存庫） | 6 段、5 段終端機紀錄、3 個終端機練習（以環境變數與預設值取代寫死的設定、以 environment 的 variable 區分 staging 與 production、在使用前驗證必要的設定）、8 題 | **完整 v1.0.0** |
| CICD08 | 機密管理<br>`secrets-management` | 中級 | 55 分 | CICD07 | 1 台（artifacts：tidewater 的 Token 外洩事故與 secret-lab 沙箱） | 6 段、4 段終端機紀錄、3 個終端機練習（找出 Token 進入儲存庫的 commit、修正 PR 標題造成的 script injection、以範圍更小的新 Token 輪替並收斂權限）、8 題 | **完整 v1.0.0** |
| CICD09 | 部署管線<br>`deployment-pipelines` | 中級 | 60 分 | CICD06、CICD07 | 2 台（deploy-hosts：借書服務的儲存庫、staging-01 與 prod-01 兩台 Docker 主機、production 的審核者） | 6 段、4 段終端機紀錄、3 個終端機練習（以同一個 digest 從 staging 晉升到 production、冒煙測試擋下壞掉的發布後修好再上線、從部署紀錄查出 production 的 commit）、8 題 | **完整 v1.0.0** |
| CICD10 | 部署策略：滾動、藍綠與金絲雀<br>`deployment-strategies` | 進階 | 55 分 | CICD09 | devops-explorer（D2）：渡輪訂票服務的 8 個部署模擬 | 6 段、9 個練習（丟棄的請求、額外的執行個體分鐘、金絲雀中止、資料庫相容性、滾動與金絲雀的部署計畫）、7 題 | **完整 v1.0.0** |
| CICD11 | 監控與告警<br>`monitoring-and-alerting` | 中級 | 50 分 | CICD09 | devops-explorer（D3）：外送訂單服務三小時的四大黃金訊號儀表板與告警規則 | 6 段、7 個練習（分類黃金訊號、等待中與觸發、視窗平均、通知與誤報、寫出符合條件的告警規則）、7 題 | **完整 v1.0.0** |
| CICD12 | 集中式日誌<br>`centralized-logging` | 中級 | 50 分 | CICD11 | devops-explorer（D4）：茶葉店結帳三個服務的日誌；1 台（scripting：以 ssh 登入的日誌主機） | 6 段、3 個日誌探索器、5 段終端機紀錄、7 個練習（篩選與分組、追蹤關聯 ID、遮蔽規則、保留容量、以 grep 追蹤與計數、讓指令稿帶上關聯 ID）、8 題 | **完整 v1.0.0** |
| CICD13 | 回滾與發布安全<br>`rollback-and-release-safety` | 進階 | 60 分 | CICD10、CICD11 | 1 台（deploy-hosts：球場預約服務的管線與兩台主機）＋devops-explorer（D2）的 5 個部署模擬 | 6 段、4 段終端機紀錄、3 個終端機練習與 3 個探索器練習（找出上一個 digest、以 rollback workflow 回滾、保留遷移的向前修復、旗標與回滾、資料庫相容性、快速部署計畫）、8 題 | **完整 v1.0.0** |
| CICD14 | 事故應變與事後檢討<br>`incident-response` | 進階 | 55 分 | CICD12、CICD13 | 1 台（deploy-hosts：單車共享的事故演練、正式主機與狀態頁）＋devops-explorer（D3）的 2 個儀表板與事故時間線 | 6 段、5 段終端機紀錄、5 個練習（以 Deploy 回滾止血並更新狀態頁、從日誌找出受影響的站點、提交事故紀錄、事故時間、嚴重等級）、8 題 | **完整 v1.0.0** |
| CICD15 | DevOps 與 CI/CD 島綜合專題：從 commit 到上線<br>`devops-cicd-capstone` | 進階 | 90 分 | CICD05、CICD08、CICD14 | 5 台（deploy-hosts：咖啡店點餐服務在各關的狀態）＋devops-explorer 的 2 個部署模擬與 2 個儀表板 | challenge-stages 六關、8 段課文、5 段終端機紀錄、5 個終端機練習與 3 個探索器練習（PR 與必要檢查、只建置一次的 Image、各環境的設定與機密、以 digest 晉升、金絲雀計畫與告警規則、回滾演練與事故時間）、8 題 | **完整 v1.0.0** |

（指標的數字由 `doraMetrics` 算出，依 CICD0 §5.3 的四捨五入與中位數規則；表中只為說明而列出，課程資料裡沒有寫這些數字。）

## 單元

| 單元 | 課程 |
|---|---|
| DevOps 與交付的基本觀念 | CICD01 |
| 團隊協作與 Git | CICD02 |
| 持續整合與 GitHub Actions | CICD03–CICD05 |
| 建置、設定與機密 | CICD06–CICD08 |
| 部署與監控 | CICD09–CICD11 |
| 日誌、回滾與事故 | CICD12–CICD14 |
| 綜合專題 | CICD15 |

## 探索器的已知簡化（課文已說明或避開）

- D1 的時間是整數分鐘，從期間的第 1 天 00:00 起算；部署頻率是「平均每週」並四捨五入到小數點後一位，前置時間與復原時間取中位數並四捨五入到整數分鐘。DORA 報告以問卷的區間回答，沒有規定這些算法；規則是本課程為了能手算而固定的（CICD0 §5.3、§13）。
- 前置時間以每個**變更**（不是每次部署）計算，從提交到上線；不分開「等待審查」「等待測試」等階段。
- 失敗部署的復原時間從故障開始（省略時就是上線時刻）算到恢復；偵測時間只顯示在旁邊，不是四個指標之一。修補或回滾的部署若寫進紀錄，也算一次部署（CICD01 的 A 團隊把兩次 hotfix 記為部署）。
- 效能分級（elite、high、medium、low）**不計算**，因為每年報告的群組與門檻都會調整；CICD01 只以文字說明，並說明指標用來看自己的趨勢、不用來排名團隊或個人。
- 四個指標用 2023–2024 年報告的名稱（deployment frequency、change lead time、change fail rate、failed deployment recovery time），中文譯名是本課程自訂的；之後的報告可能再增加或改名（CICD0 §13）。
- D2 部署模擬（CICD10 起）的簡化見 CICD0 §12：流量固定、沒有自動擴展、同時最多兩個版本、p95 是宣告的數字等；CICD01 沒有用到 D2。

## 批次

CICD-0（登錄、D1、D2，沒有課）之後：

- **CICD-1**（本批，2026-11-23）：CICD01，只用 D1，島嶼開放。CICD0 §4 原本把 CICD02 也排在 CICD-1；它需要終端機引擎階段 E25 `git` 與 E26 `forge`，所以和這兩個階段一起放到下一批。
- **CICD-2**（2026-11-23）：CICD02，終端機引擎階段 E25 `git` 與 E26 `forge`（見 [CICD0_E25_GIT](CICD0_E25_GIT.md)、[CICD0_E26_FORGE](CICD0_E26_FORGE.md)）。
- **CICD-3**（2026-11-24）：CICD03–CICD05，終端機引擎階段 E27 `workflows` 與 E28 `actions`（見 [CICD0_E27_WORKFLOWS](CICD0_E27_WORKFLOWS.md)、[CICD0_E28_ACTIONS](CICD0_E28_ACTIONS.md)）。模擬環境的差異：`gh run rerun --failed` 會重新執行整個 matrix job 的每一片（E29 修正為只重新執行失敗與被取消的那幾片；課程沒有依賴）。多行的 `run: |` 從 E23 的 YAML 子集起就支援，課程為了好輸入只寫一行的 `run:`。
- **CICD-4**（2026-11-24）：CICD06–CICD08，終端機引擎階段 E29 `artifacts`（見 [CICD0_E29_ARTIFACTS](CICD0_E29_ARTIFACTS.md)）。模擬環境的差異（課程沒有依賴）：Dockerfile 的 `FROM 名稱@sha256:…` 在模擬環境被當成不合法的參照（`docker pull` 以 digest 可以）；沒有 `git log -S`、`base64`、`${VAR:0:N}`、`env`／`printenv`。
- **CICD-5**（2026-11-24）：CICD09（E30 `environments`、E31 `deploy-hosts`，見 [CICD0_E30_ENVIRONMENTS](CICD0_E30_ENVIRONMENTS.md)、[CICD0_E31_DEPLOY_HOSTS](CICD0_E31_DEPLOY_HOSTS.md)）、CICD10（D2）、CICD11（D3，`monitoring-dashboard` 改為已實作）。模擬環境的差異：在 runner 上建置的 Image 的 digest 依建置時間而定，練習以部署紀錄、日誌與 http 檢查代替；冒煙測試的失敗以容器啟動後立即結束模擬；D2 的閘門指標在探索器只能開關；部署計畫可以要求金絲雀由閘門在足夠的樣本上判定失敗（`gateFailed`）。
- **CICD-6**（2026-11-24）：CICD12（D4）、CICD13（E30–E31、D2）、CICD14（E31、D3）。模擬環境的差異：課程資料不能預先宣告 run 與部署紀錄，所以 CICD13、CICD14 的練習先以幾個指令重現「早上的發布」或事故演練（課文說明）；回滾後最新部署紀錄的 sha 是執行 workflow 的 commit，不是重新部署的版本（與 GitHub 相同，課文說明）；沒有 `basename`、`git revert -n`、`grep -m`、`docker images --format` 與 `{{index …}}`。
- **CICD-7**（2026-11-24）：綜合專題 CICD15（用 E25–E31 與 D1–D4 已有的一切），全島 15／15 完成。
- 之後依 CICD0 §4：CICD03–05（E27 `workflows`、E28 `actions`）、CICD06–08（E29 `artifacts`）、CICD09–11（E30 `environments`、E31 `deploy-hosts`、D3，登錄 `monitoring-dashboard`）、CICD12–14（D4）、CICD15 綜合專題（單獨一批）。每一批先完成它需要的階段，再寫課；課程編號即位置，依序連續發布。

課程狀態與 3D 地景分離：DevOps 與 CI/CD 島的 `mapState` 仍是 `'planned'`。
