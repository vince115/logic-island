# CICD-0 引擎階段 E31：`deploy-hosts` profile（`deploy-lesson.ts`、`deploy-hosts.ts`、`deploy-checks.ts`）

> 2026-11-24。給 DevOps 與 CI/CD 島 CICD09「部署管線」（持續交付與持續部署、環境的晉升、人工核准、上線後的檢查、部署紀錄）、CICD13「回滾與發布安全」、CICD14「事故應變」與 CICD15 總結專案。在 E25 `git`、E26 `forge`／`gh`、E27 workflow 模型、E28 的執行、E29 的產出物與 secret、E30 的部署環境之上，加上**真的會被部署的主機**：課程的遠端機器可以有 Docker daemon，學習者的機器與 Actions 的 runner 都能用 ssh 連過去部署，runner 也能用 `curl` 對主機做上線後的冒煙測試。E1–E30 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `DEPLOY_HOSTS_PROFILE`（RANK 31） | `environments` 的一切，沒有新指令，feature `deploy-hosts`。課程機器寫 `profile: 'deploy-hosts'` |
| 新的行為 | 遠端機器的 Docker daemon（E20–E24 的模型，狀態存在那台機器的 `FsState`）；ssh 到主機執行 `docker` 時，主機看到的是課程 Registry 目前的內容；runner 可以連到課程允許的主機（ssh、`curl`）；runner 對主機做的事是 run 的**效果**，時鐘到了才發生；Actions secret 可以是模擬環境由種子產生的 SSH 私鑰（`sshKey`）；檢查 `container`、`image` 多了 `host`，`container` 的 `image` 可以寫 digest |
| profile 以下 | 行為與 E30 相同：遠端機器沒有 Docker（`Command 'docker' not found…`）；課程資料報 `remote …: docker needs the deploy-hosts profile (engine stage E31)`（`runners`、`sshKey` 同樣）；有 `host` 的 `container`／`image` 檢查報需要 deploy-hosts 機器 |
| 說明頁與 help | 不變（沒有新指令） |

程式的分工：`deploy-lesson.ts`（課程資料、驗證、遠端的 Docker 資料、runner 的網路）、`deploy-hosts.ts`（Registry 的共用、runner 看到的主機、步驟對主機的效果與套用）、`deploy-checks.ts`（`container`、`image` 的 `host` 與 digest）。`shell.ts`、`ssh.ts`、`lesson.ts`、`server-lesson.ts`、`docker-lesson.ts`、`actions.ts`、`actions-job.ts`、`actions-lesson.ts`、`actions-events.ts`、`actions-model.ts`、`artifacts-job.ts`、`artifacts-lesson.ts`、`artifacts-model.ts`、`artifacts-run.ts`、`gh-environments.ts`、`gh-workflow.ts`、`gh-run.ts` 只多了 deploy-hosts 機器才走到的分支。每個新檔案都不到 120 行。

## 2. 遠端的 Docker（`deploy-lesson.ts`、`lesson.ts` 的 `remoteMachine`）

| 項目 | 內容 |
|---|---|
| daemon 的資料 | `TerminalRemote.docker` 是 E20–E24 的 `TerminalDocker`（Image、容器、程式、Volume、網路、執行期的行為），**不能寫 `registries`**。主機的 daemon 另外有：本機 `docker.images` 裡可以拉取的 Image（Docker Hub 與 Registry 的，都還沒拉，同 E29 的 runner）、本機的 `docker.registries`、本機的 `programs`。主機自己寫的同名 Image 取代本機的（例如 `pulled: true` 的 v1） |
| responder | 主機的 Image 與程式指名的 responder 先找主機自己的 `responders`，再找本機的；容器公開的連接埠由主機的 docker-proxy 監聽，回應來自那個 responder（E20 的程式模型），所以「部署了哪個 Image」決定 `curl` 看到什麼 |
| 帳號 | 用 ssh 執行 docker 的使用者要在主機的 docker 群組（課程寫 `groups: [{ name: 'docker', gid: 988, members: ['deploy'] }]`）；`docker login` 的憑證存在那個使用者的 `~/.docker/config.json`，跟著主機 |
| Registry | Registry 是**課程的**（以主機名稱區分，例如 `ghcr.example`）。ssh 到主機執行一行之前，主機的 daemon 換成連過去那台機器（學習者的機器，或 runner）目前的 Registry 內容；那一行之後，主機推送的內容合併回那台機器（`shareRegistries`、`collectRegistries`）。所以學習者 `docker push` 之後，主機馬上拉得到 |
| 互動的工作階段 | `ssh deploy@staging-01` 之後的每一行同樣共用 Registry；指令照 E7 在遠端的 shell 執行（引號照 ssh 的規則：參數以空白接起來，在遠端重新拆字） |

## 3. runner 連到主機（`deploy-lesson.ts`、`actions.ts`、`artifacts-job.ts`）

| 項目 | 內容 |
|---|---|
| 網路範圍 | 遠端寫 `runners: true` 的主機 runner 才連得到（課程資料決定的網路範圍）。runner 的位址是 `10.1.0.4`（主機的 sshd 記錄與防火牆看到這個來源），`/etc/hosts` 有這些主機。沒有 `runners` 的主機，runner 查不到名稱（`ssh: Could not resolve hostname …`） |
| runner 的 shell | `RUNNER_DEPLOY_PROFILE`：E29 runner 的指令（含 ssh、ssh-keyscan、curl、docker、gh），加上 feature `deploy-hosts`（Registry 的共用） |
| 主機的狀態 | job 開始時（排隊時間加 runner 的 2 秒）的主機：學習者機器上主機現在的狀態，加上還沒到時間的 run 效果、以及同一個 attempt 裡較早的 job 的效果中，在那個時刻之前的（`hostsAt`）。Registry 同樣（`registriesAt`），所以 build job 推送的 Image，之後的 deploy job 在主機上拉得到 |
| 時鐘 | 每個 run 步驟開始時，主機的時鐘設成 runner 的時間（`docker run` 的建立時間、日誌的時間是那一刻） |
| 金鑰與 known_hosts | 照 E7：runner 的 `~/.ssh` 一開始不存在；私鑰由 step 從 secret 寫進檔案（`printf '%s\n' "$KEY" > ~/.ssh/id_ed25519; chmod 600`，權限太寬照 E7 被忽略）；known_hosts 從 secret 寫入，或 `ssh-keyscan 主機 >> ~/.ssh/known_hosts`。沒有 known_hosts 時，沒有終端機的 ssh 是 `Host key verification failed.`；沒有可用的金鑰是 `deploy@staging-01: Permission denied (publickey,password).` |
| 遮蔽 | secret 照 E29 在記錄的每一行換成 `***`（多行的私鑰每一行各自遮蔽） |

## 4. 效果與時間（`deploy-hosts.ts`、`artifacts-run.ts`）

run 步驟結束時，和開始前相比有變動的主機（時鐘以外的任何欄位：檔案、Docker、程式、journal…）記為 E29 的效果 `ActionsEffect.hosts`（主機名稱與步驟後的整個狀態），時間是步驟結束的那一刻。`settleArt` 在時鐘到了的時候把主機換成那個狀態，保留學習者這邊的時鐘。學習者的 ssh、scp、`curl` 等網路指令、互動工作階段的每一行、以及檢查之前，deploy-hosts 機器都會先套用到期的效果。`gh run cancel`、concurrency 的取消、E30 的重算照 E29／E30 丟掉之後的效果。

## 5. 部署流程（測試裡的形狀）

| 步驟 | 寫法 |
|---|---|
| 登入 Registry（在主機上） | `echo "${{ secrets.REGISTRY_TOKEN }}" \| ssh deploy@prod-01 docker login ghcr.example -u deploy --password-stdin` |
| 換掉舊的容器 | `ssh deploy@prod-01 "docker pull $IMAGE && docker rm -f web && docker run -d --name web -p 8000:8000 $IMAGE"` |
| 冒煙測試 | `curl -fsS http://prod-01:8000/healthz`（500 時 curl 結束碼 22，step 與 job 失敗，依賴它的 production job 是 skipped） |
| 晉升 | staging job 之後 `needs: staging` 的 production job，`environment: production` 照 E30 等待審核 |
| 回滾 | `gh workflow run deploy.yml -f image=ghcr.example/island/shop@sha256:…`：以 digest 拉取與執行先前的版本；主機上 `docker ps`、`docker inspect -f '{{.Config.Image}}' web` 顯示那個 digest |

## 6. 課程資料（`deploy-lesson.ts`）

```ts
remotes: [{ host: 'prod-01', address: '10.0.0.22', hostKey: 'prod-01-2026', runners: true,
  accounts: { users: [{ name: 'deploy', uid: 1001 }], groups: [{ name: 'docker', gid: 988, members: ['deploy'] }] },
  files: [/* /home/deploy/.ssh/authorized_keys 放 keyPair(seed, comment).publicLine */],
  docker: { images: [{ name: 'ghcr.example/island/shop:v1', …, pulled: true }], containers: [{ name: 'web', image: 'ghcr.example/island/shop:v1', state: 'running', ports: ['8000:8000'], … }] } }],
forge: { repos: [{ …, secrets: [{ name: 'DEPLOY_KEY', sshKey: { seed: 'dev31-deploy', comment: 'deploy@ci' } }, …] }] },
docker: { images: [/* Registry 的各版本，http 指向本機的 responders */], registries: [{ host: 'ghcr.example', users: [{ name: 'ci', token: … }, { name: 'deploy', token: …, push: false }] }] },
```

| 規則 | 內容 |
|---|---|
| profile | 遠端的 `docker`、`runners` 與 secret 的 `sshKey` 都需要 deploy-hosts profile：`remote prod-01: docker needs the deploy-hosts profile (engine stage E31)`、`… runners needs …`、`forge repo …: secret DEPLOY_KEY: sshKey needs …` |
| 遠端的 Docker | 照 E20–E24 驗證（以合併後的 daemon 資料）；不能寫 `registries`；`runners` 是布林值，不能和 `reachableFrom` 一起用（E17 的私有網路名單），而且機器要有 `actions` |
| `sshKey` | 取代 `value`（兩者只能有一個）；`seed` 與 `comment` 各 1–64 個字、一行。值是 `keyPair(seed, comment).privateText`（E7 的模擬金鑰，不是真的私鑰），所以課程檔案裡沒有任何金鑰內容，也不經過 E29 的假 Token 規則；課程自己用同一個 `keyPair` 取得公鑰行放進主機的 `authorized_keys` |
| known_hosts 的 secret | 一般的多行 secret：要含 lesson／fake／example／demo（例如第一行 `# lesson deploy hosts`，known_hosts 會略過 `#` 開頭的行） |

## 7. 檢查（`deploy-checks.ts`）

| 檢查 | 意義 |
|---|---|
| `{ kind: 'container', host?, name, …E20–E24 的欄位 }` | 有 `host`：讀那台遠端機器的 daemon（套用到期的效果之後）。說明例：`prod-01 上應該有名為 web 的容器（狀態是 running，由 ghcr.example/island/shop:v2 建立）`；訊息例：`它是由 ghcr.example/island/shop:v1 建立的`、`沒有 db-01 這台主機` |
| `container` 的 `image: 'NAME@sha256:…'` | deploy-hosts 機器才可以寫（有沒有 `host` 都可以）：容器的 Image 有這個 repository digest（不論當初用標籤還是 digest 執行）；不能和 `absent` 一起 |
| `{ kind: 'image', host?, name, … }` | 有 `host`：那台主機有這個 Image；訊息的「本機」換成「這台主機」 |
| `http` | **沒有新欄位**：`url` 本來就可以指向主機（`http://prod-01:8000/`），既有的 `host` 是「從哪台機器發出請求」（E12／E16）。deploy-hosts 機器在檢查前先套用到期的效果，所以 runner 部署的內容看得到 |
| 其他 | `deployment`、`run` 等照 E30；檢查一律在套用到期的效果之後判斷 |

## 8. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e31.test.ts` | profile 與分界（environments profile 的資料錯誤、遠端沒有 Docker、有 `host` 的檢查要 deploy-hosts 機器）；資料驗證（遠端的 registries、`runners` 與 `reachableFrom`、`sshKey` 與 `value`、digest 的寫法）；學習者 ssh 到主機執行 docker、推送到課程 Registry 之後主機拉得到、互動工作階段；push 觸發 staging → production（kai 600 秒後核准），用 secret 的金鑰與 known_hosts、主機上的 `docker login`、`curl` 冒煙測試，記錄裡沒有私鑰與 Token、主機的 sshd 記錄 runner 的位址與 CI 金鑰的指紋；冒煙測試失敗讓 job 失敗、production 不部署；以 `workflow_dispatch` 的 digest 回滾、`docker inspect` 看得到；沒有 `runners` 的主機 runner 連不到；runner 的主機金鑰檢查與 `ssh-keyscan`；`container`／`image` 的 `host` 與 digest、`http` 的通過與失敗訊息；重播的確定性 |
| `tests/support/deploy-hosts-fixture.ts` | 只供測試：dev-31（deploy-hosts profile）；staging-01、prod-01（deploy 使用者、docker 群組、CI 與學習者的公鑰、執行 v1 的 web）；ghcr.example 的 island/shop v1、v2、v3（v3 的 `/healthz` 回 500）；deploy.yml（push 與 dispatch，staging 再 production，每個 job：寫入金鑰、登入、部署、冒煙測試）；production 由 approver kai 核准 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `deploy-hosts`。

## 9. 只在課文說明、或不模擬的部分

- 藍綠與金絲雀部署、負載平衡器切換流量、多台主機的滾動更新（D2 的部署模擬處理這些概念）；Docker Compose 在主機上的部署照 E23 可以用，但沒有專門的測試。
- ssh-agent 與 `webfactory/ssh-agent` 這類 action、`appleboy/ssh-action`、OIDC 與雲端的部署服務、Kubernetes。
- runner 的 Docker 經由 `DOCKER_HOST=ssh://…` 操作遠端 daemon、Docker context。
- 主機之間互相 ssh（E7 不支援從遠端再連出）；runner 以外的 self-hosted runner。

## 10. 沒有把握的地方（依記得的格式寫，並在此註明）

- **runner 的網路**：runner 的位址 `10.1.0.4`、由課程宣告哪些主機可以連（真實的 GitHub-hosted runner 在網際網路上，主機通常要開放 22 埠或經過跳板機）；runner 的 `/etc/hosts` 有主機名稱（真實情況靠 DNS）。
- **主機的快照**：runner 看到的是 run（或 E30 重算）計算時的主機加上到期的效果；效果套用時以步驟後的整個主機狀態取代，這段期間學習者在同一台主機上做的變更會被蓋掉（簡化）。同一個 attempt 裡平行的 job 依 workflow 的順序看到彼此的效果。
- **時間**：ssh、`docker pull`、`docker run` 不花時間（E28 的時間只來自 CI 工具與 `sleep`），所以部署與冒煙測試在同一秒；真實的 pull 會花數秒到數分鐘。
- **`docker rm -f` 沒有這個容器**：模擬環境照 E20 回 `Error response from daemon: No such container: web`（結束碼 1），部署指令稿的 `&&` 會停下；Docker 27 的 CLI 對 `-f` 可能忽略不存在的容器而回 0（未核對）。
- **記錄**：多行 secret 放在 `env:` 時，`##[group]` 裡 `KEY: ***` 之後各行的顯示；`ssh-keyscan` 的註解行（`# staging-01:22 SSH-2.0-…`）在標準錯誤、會出現在記錄裡。
- **sshKey**：以種子產生的金鑰當 secret 的值是模擬環境的設計；`printf '%s\n'` 寫入後檔案結尾多一個空行，E7 照樣讀得懂（OpenSSH 實際上也接受）。
