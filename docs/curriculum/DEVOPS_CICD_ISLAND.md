# DevOps 與 CI/CD 島（DevOps & CI/CD Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、難度、先修）取自藍圖，由 `lessons.ts` 的 `cicdFromBlueprint` 讀入；每一課的活動與能力由逐課的 `CICD_SHAPES` 決定（[CICD0_DEVOPS_CAPABILITY](CICD0_DEVOPS_CAPABILITY.md) §2）。

教學方式有兩種：部署紀錄與部署模擬用新能力 `devops-explorer`（D1 部署紀錄與 DORA 指標、D2 逐分鐘的部署模擬 `deployment-simulator`），所有數字是課程撰寫的示意資料，指標與練習的答案由模擬器算出、不寫在課程資料裡；git、Pull Request 與 workflow 的課沿用 `terminal` 能力（引擎階段 E25–E31，尚未建置）。文化、團隊結構與 DORA 的效能分級只在課文中以文字說明。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 探索器 | 內容 | 狀態 |
|---|---|---|---|---|---|---|---|
| CICD01 | DevOps 概念與文化<br>`devops-culture-and-practices` | 入門 | 45 分 | —（建議 SA02） | 4 份部署紀錄（D1，示意資料）：同一週八個變更的一次上線（1 次部署、前置時間中位數 3765 分、失敗率 100%、復原 240 分）與分開上線（8 次、58 分、13%、20 分）；A 團隊 84 天（5 次、每週 0.4 次、19140 分、40%、720 分）與 B 團隊 84 天（60 次、每週 5.0 次、65 分、5%、25 分） | 6 段、4 個探索器、6 個 devops 練習（一次與分開上線的比較表、哪一種恢復得快、A 團隊的部署頻率、A 團隊的穩定、B 團隊的四個指標、誰的變更等得比較久）、8 題 | **完整 v1.0.0** |
| CICD02 | 團隊 Git 工作流程<br>`git-workflows-for-teams` | 入門 | 55 分 | CICD01 | 1 台（forge：tidepool 團隊在 github.example 上的 library 與 events 儲存庫、兩位審查者） | 7 段、5 段終端機紀錄、4 個終端機練習（分支到合併的 PR、把落後且衝突的 PR rebase 後再合併、讀出 main 的分支保護、以 gh api 設定分支保護）、8 題 | **完整 v1.0.0** |

（指標的數字由 `doraMetrics` 算出，依 CICD0 §5.3 的四捨五入與中位數規則；表中只為說明而列出，課程資料裡沒有寫這些數字。）

## 單元

| 單元 | 課程 |
|---|---|
| DevOps 與交付的基本觀念 | CICD01 |
| 團隊協作與 Git | CICD02 |

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
- 之後依 CICD0 §4：CICD03–05（E27 `workflows`、E28 `actions`）、CICD06–08（E29 `artifacts`）、CICD09–11（E30 `environments`、E31 `deploy-hosts`、D3，登錄 `monitoring-dashboard`）、CICD12–14（D4）、CICD15 綜合專題（單獨一批）。每一批先完成它需要的階段，再寫課；課程編號即位置，依序連續發布。

課程狀態與 3D 地景分離：DevOps 與 CI/CD 島的 `mapState` 仍是 `'planned'`。
