# CICD-0 引擎階段 E29：`artifacts` profile（`artifacts*.ts`、`actions-cache.ts`、`actions-artifact.ts`、`gh-secret.ts`、`gh-artifacts.ts`、`gh-token.ts`）

> 2026-11-24。給 DevOps 與 CI/CD 島 CICD06「建置管線與產出物」（可重現的建置、artifact、快取、Image 的建置與推送、版本號；先修 DKR11 Registry）、CICD07「環境變數與設定管理」（設定與程式碼分開、環境變數、dev／test／prod、預設值、設定驗證）、CICD08「機密管理」（secret 與設定、secret 的存放、輪替、最小權限、外洩的處理，以及 E27／E28 已經真實發生的 script injection）。在 E25 `git`、E26 `forge`／`gh`、E27 workflow 模型與 E28 的執行之上，加上 `actions/cache`、artifact、runner 上的 Docker、Actions 的 secret 與 variable（含遮蔽）與 GITHUB_TOKEN 的實際效果。E1–E28 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `ARTIFACTS_PROFILE`（RANK 29） | `actions` 的一切，沒有新指令，feature `artifacts`。課程機器寫 `profile: 'artifacts'` |
| 新的行為 | `actions/cache@v4`、`actions/upload-artifact@v4`、`actions/download-artifact@v4`；runner 上有 Docker（E20–E24）與 gh；`secrets`、`vars` context 與遮蔽；`gh secret set|list|delete`、`gh variable set|list|get|delete`、`gh cache list|delete`、`gh run download`、`gh run view` 的 ARTIFACTS；GITHUB_TOKEN 決定 runner 上的 `git push` 與 gh；檢查 `secret`、`variable`，`run` 多了 `cacheHit`、`artifact`，`registry` 多了 `commit` |
| profile 以下 | 行為與 E28 相同：`actions/cache` 等仍是 E28 的「模擬環境不支援…（cache 與 artifact 在 E29）」，`gh secret|variable|cache` 仍是「模擬環境不支援這個指令」，`gh run download` 仍是 E28 的說明；課程資料報 `… need the artifacts profile (engine stage E29)`；新的檢查與欄位報需要 artifacts 機器 |
| 說明頁與 help | `man gh`、`gh --help` 不變（**決定**，同 E27、E28）；沒有參數的 `gh` 列出 `GH_SUPPORTED_ARTIFACTS` |

程式的分工：`artifacts-model.ts`（secret、variable、cache、artifact、效果的資料型別與遮蔽）、`artifacts-lesson.ts`（課程資料、驗證、runner 的 Docker）、`artifacts-job.ts`（一個 job 的計畫：看得到的 secret、variable、cache、artifact，forge 的副本與 GITHUB_TOKEN，每個 step 的效果）、`actions-cache.ts`、`actions-artifact.ts`（兩種 action）、`artifacts-run.ts`（attempt 算完之後寫到 site、到時間才套用的效果、取消）、`artifacts-checks.ts`（檢查）、`gh-secret.ts`、`gh-artifacts.ts`、`gh-token.ts`（gh 的指令與 runner 上的權限）。`actions.ts`、`actions-job.ts`、`actions-events.ts`、`actions-checks.ts`、`runner.ts`、`ci-tools.ts`、`gh.ts`、`gh-run*.ts`、`git-cli-remote.ts`、`server-lesson.ts`、`shell.ts`、`yaml.ts` 只多了 artifacts profile 才走到的分支（以及 §9 的兩個修正）。每個檔案都不到 300 行。

## 2. `actions/cache@v4`（`actions-cache.ts`）

| 項目 | 內容 |
|---|---|
| 輸入 | `path`（多行；`~/` 是 runner 的家目錄，相對路徑在工作目錄下；不支援萬用字元）、`key`、`restore-keys`（多行）、`fail-on-cache-miss`、`lookup-only`。缺 `path` 或 `key`：`Input required and not supplied: …`，step 失敗 |
| 找快取 | 依序在 job 自己的 ref（`refs/heads/x`、PR 是 `refs/pull/N/merge`）、PR 的 base 分支、預設分支裡找：先找 key 完全相同的，再依序以 key 與每個 restore key 當前綴找最新的。只看相同 `path`（GitHub 的 cache version）、而且在 step 那時已經存好的快取 |
| 結果 | 命中：檔案寫回 runner，`Cache restored from key: …`，output `cache-hit` 是 `true`（完全相同）或 `false`（前綴）；沒有：`Cache not found for input keys: k, rk…`，`cache-hit` 是空字串。step 花 1 秒 |
| 儲存（post step） | 只在 job 成功時執行（post-if: success()，否則 skipped）：完全命中時 `Cache hit occurred on the primary key …, not saving cache.`；路徑都不存在時是 warning；同一個 ref 已經有這個 key（**不覆寫**）時 `##[warning]Failed to save: Unable to reserve cache with key …`；否則存檔（`Cache saved with key: …`，1 秒），時間是 job 結束時 |
| CI 工具 | 工具可以宣告 `cache`（它填滿的資料夾，例如 `~/.npm`），情況可以宣告 `cachedSeconds`：資料夾已經存在時用這個秒數。工具成功時建立資料夾（內有 `.lesson-cache`），所以下次的 run 存得到、還原後就變快 |
| `hashFiles` | E27 的函式，key 裡可以用（`npm-${{ hashFiles('package-lock.json') }}`） |
| `gh cache list [-k 前綴] [-r ref] [-L N]` | `Showing 1 of 1 cache in island/shop`、空行、`ID  KEY  SIZE  CREATED  ACCESSED`（新的在前；ACCESSED 用建立時間）；沒有：標準錯誤 `No caches found in …`。`gh cache delete <ID|key>|--all`：`✓ Deleted 1 cache from …` |

## 3. Artifact（`actions-artifact.ts`）

| 項目 | 內容 |
|---|---|
| `upload-artifact@v4` | `name`（預設 `artifact`，不能有 `" : < > | * ? \ /` 與換行）、`path`（多行；資料夾整個，片段裡可以用 `*`、`?`）、`if-no-files-found`（warn、error、ignore）、`retention-days`（1–90，預設 90）、`overwrite`。檔案相對於各路徑最近的共同資料夾（`dist/` 上傳的是 `index.html`）。記錄：`With the provided path, there will be N files uploaded` … `Artifact dist has been successfully uploaded! Final size is N bytes. Artifact ID is …`、下載網址；outputs `artifact-id`、`artifact-url`；1 秒 |
| 名稱唯一 | 同一個 run 裡已經有這個名稱（v4 的 artifact 不可變）：`##[error]Failed to CreateArtifact: … (409) Conflict: an artifact with this name already exists on the workflow run`；`overwrite: true` 時刪掉舊的再上傳 |
| `download-artifact@v4` | 同一個 run、在那個時刻已經上傳而且沒有過期的 artifact。有 `name`：檔案直接寫到 `path`（預設工作目錄）；沒有：每個 artifact 寫到 `path/名稱/`（`pattern` 篩選、`merge-multiple` 合併）。找不到：`##[error]Unable to download artifact(s): Artifact not found for name: …`。`run-id`、`github-token`（跨 run）不支援 |
| 重新執行 | 新的 attempt 保留它沿用的 job 的 artifact，重新執行的 job 的 artifact 由新的取代（**決定**） |
| `gh run view` | run 有 artifact 時，在 JOBS（與 ANNOTATIONS）之後列 `ARTIFACTS` 與名稱，過期的加 ` (expired)` |
| `gh run download <run-id> [-n 名稱]… [-p 樣式]… [-D 資料夾]` | 只指定一個名稱時直接寫到資料夾（預設目前的資料夾），否則每個寫到 `資料夾/名稱/`；成功不印東西。錯誤：`no artifact matches any of the names or patterns provided`、全部過期 `no valid artifacts found to download`、檔案已經存在 `error downloading dist: error extracting zip archive: open …: file exists`；沒有 run ID 時說明模擬環境要寫 ID |

## 4. runner 上的 Docker 與 gh（`artifacts-lesson.ts`、`artifacts-job.ts`）

| 項目 | 內容 |
|---|---|
| Docker | runner image 有 E20–E24 的 Docker：機器的 Docker Hub Image（都還沒拉）、課程的 Registry（使用者與假 Token）、建置工具與程式；每個 job 都是全新的 daemon，沒有本機 Image，**建置快取是空的**。`runner` 在 docker 群組。job 開始時 Registry 是機器現在的狀態（之前推送的看得到） |
| 推送 | `echo "${{ secrets.TOKEN }}" \| docker login 位址 -u ci --password-stdin` 與 `docker push` 照 DKR0 §13.6；Image 標籤可以用 `${{ github.sha }}`。推送的結果在那個 step 結束時寫回機器的 Registry（§5） |
| gh | runner 的 shell 有 gh，帳號是 `github-actions[bot]`。要有環境變數 `GH_TOKEN`（或 `GITHUB_TOKEN`）等於這個 job 的 GITHUB_TOKEN（`${{ github.token }}`；模擬環境的值就是 `***`），否則印 GitHub CLI 的提示（結束碼 4）；其他值是 `HTTP 401: Bad credentials`。每個指令需要 token 的權限：`gh pr` 要 `pull-requests`、`gh run`／`workflow`／`cache` 要 `actions`、`gh repo view`／`gh api` 要 `contents`；不夠時 `HTTP 403: Resource not accessible by integration (…)`。runner 看到的是 run 開始時的儲存庫副本，所以**寫入的指令一律說明不支援**（即使權限是 write）；`gh secret`／`gh variable` 一律 403 |

## 5. 效果與時間（`artifacts-run.ts`）

attempt 照 E28 在建立時就算完；它留下的東西記在 job 的結果上（`JobResult.art`），所以記住的 attempt 也會帶回來。算完之後：快取與 artifact 寫到 site（時間是它們存好的那一刻，之前的 step、`gh cache list`、`gh run download` 看不到）；`git push` 與 `docker push` 是**效果**，放在 `CiState.art.pending`，時鐘到了那個 step 結束的時刻才套用（下一個 `git`、`gh`、`docker` 指令之前，與檢查之前）。GITHUB_TOKEN 推送的 commit 不會觸發新的 run（GitHub 的規則），PR 的 head 照樣前進。`gh run cancel` 在取消的時刻之後的快取、artifact 與效果都不會發生；fail-fast 截斷的 job 也一樣。

## 6. Secret 與 variable

| 項目 | 內容 |
|---|---|
| 層級 | 儲存庫的，或某個 environment 的（`environments` 宣告名稱）。job 寫了 `environment:`（可以是運算式）時，那個 environment 的值蓋過儲存庫的；E29 的 environment **只選擇範圍**，保護規則在 E30 |
| context | `secrets.X`：沒有設定時是空字串；`secrets.GITHUB_TOKEN` 與 `github.token` 仍是 `***`。`vars.X`：儲存庫與 environment 的 variable（job 的 `if` 看得到儲存庫的） |
| 遮蔽 | job 看得到的每個 secret 的值、以及 `::add-mask::` 的值，在**每一行**記錄（含 `##[group]Run …`、指令稿、`env:` 與輸出）換成 `***`；多行的 secret 每一行各自遮蔽；長的先換。含 secret 的 job output 不傳下去：Complete job 記 `##[warning]Skip output 't' since it may contain secret.` |
| fork 的 PR | 不傳 secret（GitHub 的規則）：只在課文說明 |
| `gh secret set 名稱 (--body 值 \| < 檔案) [-e environment]` | 名稱轉成大寫；值從 `--body` 或標準輸入（去掉結尾的換行）；`✓ Set Actions secret 名稱 for island/shop`。需要 admin：`failed to fetch public key: HTTP 403: Must have admin rights to Repository. (…)`；未知的 environment 是 404；名稱錯誤與 `GITHUB_` 開頭各有 GitHub 的句子；空值 422 |
| `gh secret list [-e env]`、`delete` | `NAME  UPDATED`（只有名稱與時間，**從不顯示值**）；沒有：標準錯誤 `no secrets found`；`✓ Deleted Actions secret X from island/shop`，沒有這個 secret 是 404 |
| `gh variable set|list|get|delete` | `✓ Created variable X for …`／`✓ Updated variable X for …`；`NAME  VALUE  UPDATED`；`get` 印值，沒有：`variable X was not found`；`✓ Deleted variable X from …` |

## 7. 課程資料與檢查（`artifacts-lesson.ts`、`artifacts-checks.ts`、`actions-checks.ts`）

```ts
forge: { repos: [{ url, …E26–E27 的欄位,
  environments?: ['production'],
  secrets?: [{ name: 'DOCKER_TOKEN', value: 'lesson-token-ci-0001', env?: 'production', updated?: '2026-11-22 01:00:00' }],
  variables?: [{ name: 'APP_ENV', value: 'dev', env?, updated? }] }] },
actions: { tools: [{ command: 'npm ci', cache?: '~/.npm', cases: [{ …E28, cachedSeconds?: 2 }] }] },
docker: { …E20–E24（runner 用其中的 Docker Hub Image、registries、tools、programs） },
```

| 規則 | 內容 |
|---|---|
| 驗證 | 需要 artifacts profile；secret、variable 各最多 20 個，名稱是英數與 `_`（不以數字或 `GITHUB_` 開頭），同一層級不重複；`env` 要在 `environments` 裡（最多 6 個）；**secret 的值必須明顯是假的**：一行時是 E23 的 `FAKE_TOKEN`（8–80 個字、含 lesson／fake／example／demo、不像 ghp_、glpat-、sk- 這類真實格式），多行時要含那些字而且沒有一行像真實的 Token 或私鑰開頭；variable 的值最多 4000 字；`cache` 是相對、`~/` 或絕對的資料夾，`cachedSeconds` 0–3600 |

| 檢查 | 意義 |
|---|---|
| `{ kind: 'secret', repo, name, env?, absent? }` | 儲存庫（或 environment）有這個 secret（`absent`：沒有）；**只看名稱，不能寫值** |
| `{ kind: 'variable', repo, name, env?, absent?, value? }` | 有這個 variable、值是 `value` |
| `run` 的 `cacheHit?`、`artifact?` | 那個 step（或 job、整個 run）的 actions/cache 是否完全命中；run 有這個名稱的 artifact。`logExcludes` 可以確認 secret 沒有出現在記錄裡 |
| `registry` 的 `commit?: { repo, ref?, length? }` | 標籤是 `tag` 接上那個分支（預設的預設分支）目前的 commit（前 `length` 字），例如 `tag: 'sha-'`，檢查 workflow 為學習者自己的 commit 推送的 Image |

說明例：`https://github.example/island/shop.git 的 environment production 應該有 Actions secret STAGING_KEY`、`Registry 上應該有 ghcr.example/island/shop:sha-<預設分支目前的 commit>`。訊息例：`沒有這個 secret`、`它的值是「qa」`、`最新的 run #1（4100000001）的 cache 沒有命中 key（cache-hit 不是 true）`、`…沒有 artifact coverage`。

## 8. GITHUB_TOKEN 的效果

| 項目 | 內容 |
|---|---|
| `git push` | runner 的 git 帶著 job 的 token：`contents` 不是 write 時 `remote: Permission to island/shop.git denied to github-actions[bot].` 與 `fatal: unable to access '…': The requested URL returned error: 403`（128）；是 write 時照 E25／E26 推送（分支保護照樣適用，bot 不是 admin），commit 在 step 結束時出現在 forge 上，**不觸發新的 run** |
| checkout | `actions/checkout` 以 `-B main refs/remotes/origin/main` 建立分支時設定 upstream（git 的 autoSetupMerge），所以 step 裡直接 `git push` 就可以 |
| gh | §4 |

## 9. 一併修正（只影響還沒發布的課）

- **YAML 的區塊純量**：E23 的 YAML 子集原本就支援 `|`、`|-`、`|+`、`>`、`>-`、`>+`（縮排以第一個非空行為準），workflow 檔案也一直可以寫多行的 `run: |`（多行指令稿交給 Bash，每行一個指令，`bash -e` 時第一個失敗的指令就結束 step）。E29 修正 workflow 檔案的 keep（`|+`、`>+`）：保留結尾的空行（檔案最後的換行不算）；Compose 仍是 E23 的行為（一個換行）、錯誤訊息不變。明確的縮排指示（`|2`）仍不支援。
- **`gh run rerun --failed` 以 matrix 的每一條為單位**：只重新執行失敗與被取消的那幾條（以 job 的鍵加 matrix 的值辨認），成功的那條沿用（`reused`）；因為需要的 job 重新執行而重新執行的 job，每一條都重新執行。已發布的課沒有用到。

## 10. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e29.test.ts` | profile 與分界（actions profile 的訊息與資料錯誤）；快取：第一次沒有、存檔、第二次命中而且 `npm ci` 變快（24 秒對 5 秒）、`gh cache list`、`cacheHit` 檢查；restore key 的前綴；分支範圍與預設分支的後備；不覆寫已有的 key；artifact 的上傳、下載、`gh run view` 的 ARTIFACTS、`gh run download`（`-n`、全部、檔案已存在）、過期、409、`overwrite`、找不到；runner 上的 Docker 建置、以 secret 經 `--password-stdin` 登入、推送 `sha-<commit>`、`registry` 檢查的 `commit`、每個 job 的建置快取是空的；兩個練習；重播的確定性 |
| `tests/terminal-e29-runner.test.ts` | 遮蔽（環境變數、多行的 secret、`::add-mask::`、記錄裡找不到 secret）、沒有設定的 secret 是空字串、environment 的 variable、含 secret 的 job output；`gh secret`／`gh variable` 的指令與錯誤；`secret`、`variable` 檢查；假 secret 的驗證；GITHUB_TOKEN：`contents: read` 推送被拒、`write` 在 step 結束時推送而且沒有新的 run、gh 需要 GH_TOKEN 與權限；取消之後效果不發生；YAML 的 keep 與多行的 `run:`；`rerun --failed` 的 matrix（沒有 fail-fast 只重跑失敗的那條；有 fail-fast 重跑失敗與被取消的，已經成功的沿用） |
| `tests/support/artifacts-fixture.ts`、`artifacts-session.ts` | 只供測試：dev-06（artifacts profile）；island/shop 的 cache.yml、art.yml、secret.yml、image.yml，secret DOCKER_TOKEN 與 production 的 DEPLOY_KEY（三行），variable APP_ENV；Docker Hub 的 node:22-slim 與 ghcr.example；兩個練習（取回 artifact、從檔案設定 secret） |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `artifacts`。

## 11. 只在課文說明、或不模擬的部分

- fork 的 PR 不給 secret、`pull_request_target`、OIDC（`id-token`）、組織層級的 secret 與 variable、Dependabot 的 secret、Vault 與雲端的 secret 存放、從 git 歷史清除外洩的 secret。
- 快取的 10 GB 上限與 7 天沒用就刪除、`actions/cache/restore` 與 `save` 分開的 action、萬用字元的快取路徑、跨作業系統的快取；BuildKit 的快取匯出（`cache-from`）、`docker/*` 系列的 action。
- 跨 run 下載 artifact、artifact 的壓縮等級與 digest、儲存庫層級的保留天數設定。
- environment 的保護規則、部署紀錄與 concurrency（E30）。
- runner 上 gh 的寫入指令（runner 看的是副本）；以個人 Token（PAT）當 GH_TOKEN。

## 12. 沒有把握的地方（依記得的格式寫，並在此註明）

- **actions/cache 的記錄**：`Cache not found for input keys: …`、`Cache restored from key: …`、`Cache Size: ~0 MB (N B)` 與 tar 指令行的寫法、`Cache hit occurred on the primary key …, not saving cache.`、`Unable to reserve cache …`（真實的還有 More details）、Path Validation 的 warning、`lookup-only` 的句子；主 key 也以前綴比對（依推測）；miss 時 `cache-hit` 是空字串；同時儲存同一個 key 時以 job 計算的順序決定誰成功；post step 在 job 失敗時顯示為 skipped。
- **artifact 的記錄與 gh**：upload 的各行（真實的還有 SHA256 與 blob storage 的細節）、名稱錯誤的句子、409 的完整訊息、download 的各行；`gh run view` 的 `ARTIFACTS` 區段與 `(expired)`；`gh run download` 的錯誤句子與「檔案已存在」的行為；重新執行時 artifact 的取代規則。
- **gh secret／variable／cache**：`✓ Set Actions secret … for …`（environment 時的寫法）、`Created`／`Updated variable`、`Deleted …`、`no secrets found`、`variable X was not found`、名稱錯誤與 `GITHUB_` 的句子、422 空值、admin 的 403 句子、未知 environment 的 404 網址；`gh cache list` 的 `Showing …`、欄位與大小的寫法、`No caches found`、`gh cache delete` 的訊息。
- **GITHUB_TOKEN**：推送被拒的兩行（`remote: Permission to … denied to github-actions[bot].` 與 403）；gh 在 Actions 裡沒有 GH_TOKEN 時的提示；`Resource not accessible by integration` 的網址（gh pr 實際走 GraphQL，訊息可能不同）；401 的寫法；job output 含 secret 時的 warning 與它出現的 step。
- **時間**：cache 還原與儲存各 1 秒、artifact 上傳與下載各 1 秒、效果在 step 結束時發生、runner 上 Docker 指令的時間照 E21–E24。
