# CICD-0 引擎階段 E27：`workflows` profile（`src/lib/terminal/workflow*.ts`、`expr*.ts`）

> 2026-11-23。給 DevOps 與 CI/CD 島 CICD03「持續整合」、CICD04「GitHub Actions 入門」（workflow 與 job、觸發條件、step 與 action、runner、最小權限）、CICD05（pipeline 裡的測試）以及之後 CICD06–09 的 workflow 檔案模型：解析、驗證、觸發條件、運算式與 GITHUB_TOKEN 的權限。這是**純模型，不執行任何 job**（E28 `actions` 才執行 run）。建立在 E25 的 `git` 與 E26 的 `forge`／`gh` 之上：workflow 檔案只是儲存庫裡的檔案（`.github/workflows/*.yml|yaml`），由 git 提交、推送。E1–E26 的行為與所有已發布的課逐字不變：全部 44 堂終端機課的範例、參考解答、典型錯誤、變體、檢查的說明與訊息、`terminalContentProblems` 在改動前後逐一重播比對，輸出相同；Compose 的 YAML 錯誤訊息一字未改（E23 的測試與重播都相同）。

## 1. 選用方式

| 項目 | 內容 |
|---|---|
| `WORKFLOWS_PROFILE`（RANK 27） | `forge` 的一切，沒有新指令，feature `workflows`。課程機器寫 `profile: 'workflows'` |
| 新的行為 | `gh workflow list`、`gh workflow view`；`gh` 的用法與「不支援」訊息裡的支援清單多一項 `workflow list|view`；檢查 `workflow`；forge 儲存庫的 `workflowPermissions` |
| profile 以下 | `gh workflow` 仍是 E26 的「模擬環境不支援這個指令（支援的指令：…）」，清單不變；課程資料的 `workflowPermissions` 報 `forge repo 網址: workflowPermissions needs the workflows profile (engine stage E27)`；`workflow` 檢查報需要 workflows 機器 |
| 說明頁與 help | `man gh`、`gh --help`（`GH_MANUAL`）與 `help` 的 gh 那一行不變（**決定**：改了會使 forge profile 的課輸出不同）；沒有參數的 `gh` 在 workflows profile 列出 `workflow list|view` |
| 不支援的子指令 | `gh workflow run`、`enable`、`disable` 說明在 E28 加入；其他是 `unknown command "x" for "gh workflow"` |

程式的分工：`yaml.ts`（E23 的子集，加上欄位的 column、鍵的位置與結構化的錯誤）、`workflow.ts`（檔案層級的解析、錯誤的呈現、從 commit 找 workflow 檔、名稱與 ID）、`workflow-read.ts`（讀 YAML 節點的共用函式、GitHub 的驗證訊息、各位置允許的 context）、`workflow-job.ts`（job、step、matrix 與展開）、`workflow-on.ts`（`on` 的解析）、`workflow-filter.ts`（篩選樣式的比對）、`workflow-match.ts`（觸發的判斷、變更的檔案、排程、`workflow_dispatch` 的輸入）、`workflow-perms.ts`（GITHUB_TOKEN 的權限）、`expr.ts`（運算式的解析與求值）、`expr-value.ts`（值與型別轉換）、`expr-fn.ts`（函式與 `hashFiles`）、`expr-template.ts`（`${{ }}` 的代換與 `if:`）、`gh-workflow.ts`（`gh workflow`）、`workflow-lesson.ts`（課程資料）、`workflow-checks.ts`（檢查）。每個檔案都不到 300 行。

## 2. YAML 子集的擴充（`yaml.ts`）

| 項目 | 內容 |
|---|---|
| 位置 | 每個節點多了 `col`（從 1 起，和 `line` 一樣是起點）；mapping 多了 `keys`，是每個鍵寫在哪一行哪一欄。序列的 `col` 是 `-` 的位置，`- key: value` 的 mapping 從 key 起算，flow 集合（`[a, b]`、`{k: v}`）的元素各有自己的欄 |
| `YamlError` | 原本的 `message`（yaml.v3 的 `yaml: line N: …` 或子集自己的句子）完全不變，另外帶 `code`（`syntax`、`unsupported`、`duplicate-key`）、`line`、`column` 與 `detail`（去掉 `yaml: line N: ` 的文字；重複的鍵是鍵名）。呼叫的人可以自己決定怎麼呈現 |
| Compose | `compose.ts` 只多了佔位的 `col: 0, keys: []`；錯誤仍是 `e.message`，所以 `docker compose` 的所有訊息逐字相同 |
| 其他 | 錨點與別名仍以原來的句子拒絕；`on` 仍是字串鍵（純量一律保留文字，不會變成 YAML 1.1 的布林值） |

## 3. Workflow 檔案與驗證（`workflow.ts`、`workflow-read.ts`、`workflow-job.ts`）

| 層級 | 支援的鍵 |
|---|---|
| 最上層 | `name`、`run-name`、`on`、`permissions`、`env`、`defaults.run`（`shell`、`working-directory`）、`concurrency`（字串或 `group`／`cancel-in-progress`；這裡只解析，E30 才生效）、`jobs`。缺 `on` 或 `jobs`：`Required property is missing: on` |
| job | `name`、`runs-on`（字串、清單或 `group`／`labels`）、`needs`、`if`、`env`、`permissions`、`outputs`、`strategy`（`matrix`、`fail-fast`、`max-parallel`）、`timeout-minutes`（預設 360）、`continue-on-error`、`environment`（字串或 `name`／`url`）、`concurrency`、`defaults`、`steps`；`container`、`services`、`uses`、`with`、`secrets` 只接受不檢查（呼叫可重用 workflow 的 job 不需要 `runs-on` 與 `steps`）。job ID 的規則：英數字、`_`、`-`，以字母或 `_` 開頭，少於 100 字 |
| step | `id`、`name`、`uses`、`run`、`with`、`env`、`if`、`shell`、`working-directory`、`continue-on-error`、`timeout-minutes`。`uses` 要是 `擁有者/儲存庫[/路徑]@ref`、`./路徑` 或 `docker://映像` |
| 保留原文 | 可以寫運算式的值都保留寫的文字（例如 `continue-on-error: ${{ matrix.experimental }}`、`timeout-minutes: 10`），由 E28 執行時求值；這裡只檢查格式與運算式 |
| matrix | 每個向量是一串值（YAML 沒有引號的 `true`、`false`、數字保留型別）；`include`、`exclude` 是一串 mapping；整個 matrix 或某個向量可以是一個 `${{ }}`。`expandMatrix` 依 GitHub 的文件：向量的乘積（第一個向量變化最慢）、去掉 `exclude` 符合的組合（部分符合也算），再處理 `include`：對每個原始組合，不改寫原始值就把鍵加上去（加上去的值可以被後面的 include 改寫），一個都加不上時成為新的組合 |

**驗證訊息**（GitHub 的寫法，位置是節點的行與欄）：未知的鍵與不合的值 `Unexpected value 'stepz'`；`A sequence was not expected`、`A mapping was not expected`；`Required property is missing: runs-on`；`Expected format {org}/{repo}[/path]@ref. Actual 'actions/checkout'`；``Every step must define a `uses` or `run` key``；``A step cannot have both the `uses` and `run` keys``；`The identifier 'my job' is invalid. IDs may only contain …`；`The identifier 'a' may not be used more than once within the same scope.`；`Matrix vector 'node' does not contain any values`；`Matrix exclude key 'os' does not match any key within the matrix`；重複的鍵 `'runs-on' is already defined`。檔案本身沒有錯時才檢查 job 之間的關係（沒有位置）：`Job 'deploy' depends on unknown job 'buildd'.`、`Job 'b' depends on job 'a' which creates a cycle in the dependency graph.`、``No steps defined in `steps` and no workflow called in `uses` for the following jobs: build``。

**呈現**：錯誤依位置排序（沒有位置的在最後），第一行 `Invalid workflow file: .github/workflows/ci.yml#L12`（行號是第一個有位置的錯誤；都沒有時沒有 `#L`）。YAML 的語法錯誤（`code: syntax`）第二行是 `You have an error in your yaml syntax on line 12`；其他錯誤第二行是 `The workflow is not valid. .github/workflows/ci.yml (Line: 12, Col: 5): Unexpected value 'stepz'`，之後每個錯誤一行 `.github/workflows/ci.yml (Line: 14, Col: 9): …`（沒有位置時是 `.github/workflows/ci.yml: …`）。子集不支援的寫法以 `(Line, Col)` 的形式顯示子集的句子。

**運算式的位置**：每個值裡的 `${{ }}`（`if:` 整個是運算式）都依 GitHub 的「context availability」表檢查可用的 context，例如 job 的 `if` 只能用 `github`、`needs`、`vars`、`inputs`（不能用 `matrix`）；step 的 `if` 不能用 `secrets`；`hashFiles` 只在 step 裡可用；`run-name` 只能用 `github`、`inputs`、`vars`。錯誤是 runner 的文字（§5）。

## 4. 觸發條件（`workflow-on.ts`、`workflow-filter.ts`、`workflow-match.ts`）

| 項目 | 內容 |
|---|---|
| `on` 的寫法 | 字串（`on: push`）、清單（`on: [push, pull_request]`）或 mapping。認得 GitHub 的全部事件名稱（未知的是 `Unexpected value 'pushh'`）；`push`、`pull_request`、`pull_request_target`、`workflow_dispatch`、`schedule` 有模型，其他事件可以宣告但設定不檢查。空的 `on`：``No event triggers defined in `on` `` |
| 篩選樣式 | 自己的比對器，不是 shell 的 glob：`*` 是不含 `/` 的任意字元、`**` 是任意字元（`**/` 是零到多層資料夾）、`?` 讓**前一個字元**可有可無、`+` 讓前一個字元重複一次以上、`[abc]`、`[a-z]`、`[0-9]` 是一個字元、`\` 跳脫、開頭的 `!` 是排除。樣式依序套用，最後一個符合的決定結果（後面的 `!` 排除、再後面的又加回來）；只有 `!` 的清單什麼都不符合 |
| `push` | `branches`／`branches-ignore` 比對分支名稱，`tags`／`tags-ignore` 比對標籤名稱；只寫了分支篩選時推送標籤不觸發，只寫了標籤篩選時推送分支不觸發。`paths`（任一個變更的檔案符合）／`paths-ignore`（所有變更的檔案都被忽略時不觸發）比對變更的檔案，沒有變更的檔案時不觸發；推送標籤不看路徑。同一個事件寫了 `branches` 與 `branches-ignore`（或 `paths` 與 `paths-ignore`、`tags` 與 `tags-ignore`）：``you may only define one of `branches` and `branches-ignore` for a single event`` |
| `pull_request` | `types` 預設 `opened`、`synchronize`、`reopened`（未知的類型是 `Unexpected value`）；分支篩選比對 **base** 分支；路徑比對三點 diff（merge base 到 head，`pullChangedPaths`）；有衝突時不觸發（沒有測試合併 commit） |
| `workflow_dispatch` | `inputs` 的每個輸入：`type`（`string` 預設、`boolean`、`choice`、`number`、`environment`）、`required`、`default`、`description`、`options`（`choice` 一定要有：`Required property is missing: options`）。`dispatchInputs` 把給的文字轉成型別（布林、數字），補上預設值（沒有預設時字串是空字串、布林是 false），錯誤是 GitHub 422 的寫法：`Unexpected inputs provided: ["x"]`、`Required input 'x' not provided`、`Provided value 'major' for input 'level' not in the list of allowed values`、`… is not a valid boolean`、`… is not a valid number`。任何有這個 workflow 的 ref 都可以觸發 |
| `schedule` | 一串 `- cron: '…'`：五個欄位（可以用月份與星期的名稱），不支援 `@daily` 這類寫法（`Invalid cron expression '@daily'`）；沿用 E9 的 `parseCron` 與 `nextCron`，一律 UTC。只在**預設分支**觸發；`nextScheduled` 算出接下來的時間與是哪一行 cron |
| 純函式 | `triggers(on, event)`：給 workflow 的觸發條件與事件（`push` 的 ref 與變更的檔案、`pull_request` 的 base、動作、變更的檔案與是否衝突、`workflow_dispatch` 的 ref、`schedule` 的 ref 與預設分支），回答會不會觸發。`changedPaths(物件, from, to)` 是兩點 diff（from 不給時是 to 的所有檔案）；推送新分支時以哪個 commit 為 from 由 E28 決定 |

## 5. 運算式（`expr.ts`、`expr-value.ts`、`expr-fn.ts`、`expr-template.ts`）

| 項目 | 內容 |
|---|---|
| 語法 | 字面值 `null`、`true`、`false`、數字（含 `0x`、`0o`、指數）、`'字串'`（`''` 是單引號）；context（`github`、`env`、`vars`、`secrets`、`inputs`、`matrix`、`needs`、`steps`、`runner`、`job`、`strategy`，不分大小寫）；屬性 `.name`、`['name']`、索引 `[0]`、篩選 `.*`、`[*]`（之後的屬性套用到每個元素，沒有那個屬性的略過）；函式呼叫；運算子依 GitHub 的優先順序：`( )`、`[ ]`、`.`、`!`、`< <= > >=`、`== !=`、`&&`、`||` |
| 型別與比較 | 同型別直接比（字串不分大小寫，陣列與物件只有同一個才相等）；不同型別都轉成數字（null 是 0、布林是 1／0、字串依 JSON 數字格式，空字串是 0，其他是 NaN）。`&&`、`||` 回傳運算元本身；false、0、''、null、NaN 為假。轉成文字：null 是空字串、布林是 `true`／`false`、數字最多 15 位有效數字、陣列與物件是 `Array`、`Object` |
| 函式 | `contains`（字串不分大小寫的子字串；陣列是否有相等的元素）、`startsWith`、`endsWith`（不分大小寫）、`format`（`{0}`、`{{`、`}}`）、`join`（預設 `,`）、`toJSON`（兩格縮排）、`fromJSON`、`hashFiles`、`success`、`failure`、`always`、`cancelled`。函式名稱不分大小寫；參數數目不對時是 `Too few parameters supplied` 或 `Too many parameters supplied` |
| `hashFiles` | 樣式依 `@actions/glob`（`*` 不跨 `/`、`**` 任意層、`?` 一個字元、`[set]`、`!` 排除），相對於工作目錄；符合的檔案依路徑排序，每個檔案的內容做 SHA-256，再把所有摘要接起來做一次 SHA-256，印成十六進位；沒有符合的檔案時是空字串。檔案由呼叫的人給（E28 給 runner 的工作目錄） |
| 解析錯誤 | runner 的寫法：`Unrecognized named-value: 'secret'. Located at position 1 within expression: secret.TOKEN`、`Unrecognized function: 'foo'. …`、`Unexpected symbol: '='. …`、`Unexpected end of expression: '.'. …`、`An expression was expected`；沒有關閉的 `${{`：`The expression is not closed. An unescaped ${{ sequence was found, but the closing }} sequence was not found.` |
| 求值錯誤 | `The following format string is invalid: …`、`The following format string references more arguments than were supplied: …`、`Error parsing fromJson: …` |
| 代換 | 值裡的每個 `${{ }}` 先求值再以**文字**放回去（`interpolate`），之後才有別的東西讀這個值：`run:` 是在 Bash 解析腳本**之前**代換，所以 `echo "${{ github.event.issue.title }}"` 遇到標題 `x"; curl … \| sh; echo "` 時，腳本真的多了一個指令（script injection，CICD08 用）。整個值只有一個 `${{ }}` 時 `templateValue` 保留型別（matrix、`fromJSON`） |
| `if:` | 沒有 `${{ }}` 也是運算式；整個值是一個 `${{ }}` 時取裡面的運算式；`${{ }}` 前後還有文字時是字串模板，結果是非空字串所以一定成立（常見的陷阱）。沒有呼叫狀態函式時隱含 `success() &&`：前面有失敗或已取消就不執行。求值時由呼叫的人給 contexts、目前的狀態（failure、cancelled）與工作目錄的檔案 |

## 6. GITHUB_TOKEN 的權限（`workflow-perms.ts`）

| 項目 | 內容 |
|---|---|
| 範圍 | `actions`、`attestations`、`checks`、`contents`、`deployments`、`discussions`、`id-token`、`issues`、`packages`、`pages`、`pull-requests`、`repository-projects`、`security-events`、`statuses`，值是 `read`、`write`、`none`；`metadata` 一律 read。也可以寫 `read-all`、`write-all`、`{}` |
| 有效權限 | job 有 `permissions` 就用 job 的，否則用 workflow 的，都沒有時用儲存庫的預設（不合併）。寫出任何一個範圍，沒寫到的範圍都是 none；`read-all` 全部 read（`id-token` 是 none）；`write-all` 全部 write；`{}` 全部 none |
| 儲存庫的預設 | forge 儲存庫的 `workflowPermissions`：`read`（受限，預設）是 contents、packages read；`write`（寬鬆）是除了 `id-token` 以外全部 write |
| 給 E28 | `permissionLines` 是 runner 在 Set up job 的「GITHUB_TOKEN Permissions」群組（`Contents: read`、`Metadata: read`…，只列不是 none 的） |

## 7. 課程資料與檢查（`workflow-lesson.ts`、`workflow-checks.ts`）

workflow 檔案就是 E25 git 資料裡 commit 的檔案（`files: { '.github/workflows/ci.yml': '…' }`）或機器上的檔案。forge 儲存庫多一個欄位：

```ts
forge: { login: 'mei-lin', repos: [{ url: 'https://github.example/island/tools.git', workflowPermissions?: 'write' }] }   // read（預設）| write
```

低於 `workflows` profile 時是 `forge repo 網址: workflowPermissions needs the workflows profile (engine stage E27)`；值不對是 `… workflowPermissions must be read or write`。workflow 的 ID 由儲存庫網址與路徑的 SHA-256 算出（九位數），不隨 commit 改變，所以課文可以寫出 `gh workflow list` 的輸出。

| 檢查 | 意義 |
|---|---|
| `{ kind: 'workflow', repo, path, ref?, valid?, error?, on?, job?, permissions? }` | `repo` 是 forge 網址（讀 `ref` 上的檔案，預設預設分支）或本機的儲存庫（沒有 `ref` 時讀資料夾裡的檔案，學習者剛改的；有 `ref` 時讀那個 commit）。`path` 是 `.github/workflows/x.yml`。`valid: false` 要求無效；`error` 是 GitHub 訊息（§3 的各行以換行接起來）要符合的正規表示式（隱含無效）；其他欄位隱含有效。`on` 是宣告的事件（不計順序），或情境 `{ ref, paths?, events }`：推送到 `ref`、開 PR 到 `ref`（只有分支）、`workflow_dispatch`、`schedule`（只有預設分支）裡，改了 `paths` 時觸發的事件正好是 `events`（`paths` 不給時不套用路徑篩選）。`job` 要存在；`permissions` 是那個 job 有效權限中**不是 none 的範圍正好是這些**（所以 `{ contents: 'read' }` 就是最小權限） |

訊息例：`.github/workflows/ci.yml 不是有效的 workflow：The workflow is not valid. … (Line: 13, Col: 5): Unexpected value 'stepz'`、`.github/workflows/ci.yml 是有效的 workflow`、`GitHub 的訊息是「…」`、`.github/workflows/ci.yml 的觸發事件是 push、pull_request`、`推送或開 Pull Request 到 release/1.0（改了 docs/guide.md）時觸發的是 push`、`.github/workflows/ci.yml 沒有 job deploy`、`job lint 的 GITHUB_TOKEN 權限是 actions: write、…`、`https://github.example/island/shop.git 的 main 沒有 .github/workflows/nope.yml`、`/home/learner 不是 Git 儲存庫`。資料的錯誤：`a workflow check needs a workflows machine (engine stage E27) and a repo (…)`、`a workflow check needs a path like .github/workflows/ci.yml`、`… error must be a regular expression`、`… with error expects an invalid workflow (not valid: true)`、`… on, job and permissions need a valid workflow`、`… on lists GitHub event names`、`… on scenario needs a ref, relative paths and events among push, pull_request, pull_request_target, workflow_dispatch, schedule`、`… permissions need a job and map scopes to read or write`。檢查的 `path` 是相對路徑，所以通用的「check path … is not absolute」規則不套用在這個檢查。

**參考解答**：學習者用 `printf … > .github/workflows/ci.yml`（或課文教的編輯方式）寫檔案，`git commit` 與 `git push` 之後檢查 forge 上的檔案；只要看本機檔案的題目檢查本機的儲存庫。要從 gh 讀出的答案（例如 `gh workflow view ci.yml --ref broken` 的錯誤行）用 `output` 檢查加 `fromCommand`，並以 `TerminalVariant.git` 給另一份檔案，讓答案不能直接打出來。

## 8. `gh workflow`（`gh-workflow.ts`）

| 指令 | 行為與格式 |
|---|---|
| `gh workflow list [-a] [-L 數量] [-R 儲存庫]` | 預設分支上 `.github/workflows/` 裡（不含子資料夾）的 `.yml`、`.yaml`，依路徑排序。表格 `NAME  STATE  ID`（gh 的表格，最後一欄不補齊），名稱是 workflow 的 `name`，沒有或檔案無效時是路徑；狀態一律 `active`。沒有 workflow：標準錯誤 `no workflows found`，結束碼 0。`-L` 不是正整數：`invalid limit: 0` |
| `gh workflow view <ID\|名稱\|檔名> [-y] [-r ref] [-R 儲存庫]` | 依 ID、檔名（或路徑）、名稱、不分大小寫的名稱找。印 `CI - ci.yml`、`ID: 數字`、空行；`--yaml` 接著印檔案原文；否則印 `Total runs 0`、空行、`To see more runs for this workflow, try: gh run list --workflow ci.yml`、`To see the YAML for this workflow, try: gh workflow view ci.yml --yaml`（E27 還沒有 run）。檔案無效時在 `Total runs` 之前印 §3 的錯誤行與空行（**決定**：真實的 gh 不印，GitHub 的網頁才看得到；模擬環境讓學習者在終端機裡看到）。`--ref` 讀那個分支或標籤（不存在：`HTTP 404: Not Found (…/contents?ref=x)`）。沒有參數：`workflow argument required when not running interactively`；找不到：`could not find any workflows named x`；多個同名：`could not resolve to a unique workflow; found: …`；`--web` 說明沒有瀏覽器 |

## 9. 測試

| 檔案 | 內容 |
|---|---|
| `tests/terminal-e27.test.ts` | profile（forge 的指令、多一個 feature）與分界（forge profile 的 `gh workflow` 與用法清單和 E26 相同、資料與檢查要 workflows profile、forge profile 不建立 `workflowPermissions`）；YAML 的欄與鍵的位置、`YamlError` 的 code／line／column／detail 而訊息不變、Compose 的重複鍵訊息；workflow 的結構（各層的欄位、保留原文的值）、GitHub 的驗證訊息與位置（未知的鍵與事件、缺 `on`／`jobs`／`runs-on`、`uses` 的格式、step 的 `uses`／`run`、ID、重複的 step ID、matrix 的空向量與 exclude、權限的範圍與值、型別不合）、YAML 語法錯誤與重複的鍵、`needs` 與沒有 step、各位置可用的 context、沒關閉的 `${{`、參數數目、`run-name`；篩選樣式（官方速查表的例子、順序與排除）；`push`（分支、標籤、路徑、只有標籤篩選）、`pull_request`（類型、base、路徑、衝突、兩種篩選並用的錯誤）、`changedPaths` 與三點 diff、`workflow_dispatch` 的輸入與錯誤、`schedule` 的 UTC 時間與預設分支、無效的 cron；matrix 的展開（GitHub 文件的 include 例子、exclude、整個 matrix 是運算式）；運算式（運算子與優先順序、鬆散比較、context 不分大小寫、篩選與索引、各函式與錯誤、解析錯誤的文字、轉成文字、保留型別、script injection 的代換、`if:` 的隱含 `success()` 與狀態函式、`hashFiles` 的值與 Node 的 SHA-256 相同）；權限（預設、覆寫、`read-all`／`write-all`／`{}`、Set up job 的行）；`gh workflow list`／`view`（格式、`-L`、`-R`、刪除後沒有 workflow、新增的 `.yaml`、ID／名稱／檔名、`--yaml`、`--ref` 上無效的檔案、各種錯誤）；三個練習（參考解答通過、典型錯誤以預期的訊息失敗）、檢查的說明與訊息（forge 與本機、`ref`、`error`、`valid`、宣告的事件、情境、job 與權限）、檢查與課程資料的驗證、變體改變參考輸出、重播的確定性與不改動傳入的狀態 |
| `tests/support/workflow-fixture.ts` | 只供測試：dev-04（workflows profile、Asia/Taipei、gh 登入 mei-lin）；island/shop（main 有 ci.yml 與 release.yml，分支 broken 的 ci.yml 有 `stepz`）；island/tools（lint.yml 沒有寫權限、儲存庫是 write）；三個練習（最小權限、讀出無效的原因、調整觸發條件）與一個範例 |

`tests/terminal-e1.test.ts` 的 `PROFILES` 期望值加上 `workflows`。所有已發布的課的 `terminalContentProblems` 仍是 `[]`，全部 44 堂終端機課在 E27 前後逐一重播比對（範例、參考解答、典型錯誤、變體的重播與檢查的結果與訊息），輸出逐位元組相同；E23（YAML 與 Compose）、E25、E26 的測試不變。

## 10. 只在課文說明、或不模擬的部分

- **執行**：job 的執行、run 與日誌、runner、`gh workflow run`、`gh run …` 都在 E28；cache、artifact、secrets 與 variables 的設定在 E29；environment 的保護規則與 concurrency 的取消在 E30。這一層只提供 E28 會用到的純函式（觸發、展開 matrix、運算式、權限、輸入）。
- **YAML**：錨點與別名（GitHub 自 2025 年起支援）、多行的純量、多個文件；模擬環境以子集的句子拒絕。
- **其他事件與設定**：`push`、`pull_request`、`pull_request_target`、`workflow_dispatch`、`schedule` 以外的事件只能宣告；`workflow_call` 與可重用 workflow、複合 action、`container`／`services` 的內容、`runs-on` 的 runner group、`defaults` 的完整規則、`jobs.<id>.strategy` 以外的 matrix 用法不檢查。
- **GitHub 的其他規則**：一次推送超過三個標籤不觸發、diff 超過 300 個檔案時一律觸發、fork 的 Pull Request 的唯讀 token 與 secrets、`[skip ci]`、停用的 workflow（`gh workflow disable`）、排程在高負載時的延遲與 60 天沒有活動時停用、最短 5 分鐘的排程間隔。
- **網頁**：Actions 分頁、workflow 編輯器的即時驗證、`gh workflow view --web`。

## 11. 沒有把握的地方（依記得的格式寫，並在此註明）

- **錯誤的呈現**：`Invalid workflow file: 路徑#L12` 的寫法；YAML 語法錯誤的 `You have an error in your yaml syntax on line 12`；`The workflow is not valid. 路徑 (Line: 12, Col: 5): …` 之後多個錯誤怎麼接（模擬環境每個一行，前面重複路徑；真實的可能以逗號或空白接在同一行）；沒有位置的錯誤的寫法與沒有 `#L` 時的第一行；錯誤的排序與是否全部列出；重複的鍵的 `'x' is already defined`；子集不支援的寫法以 `(Line, Col)` 顯示。
- **驗證訊息**：`Unexpected value 'x'` 用在未知的事件、PR 類型、輸入類型、權限的值與型別不合的地方是否都一樣；`Required property is missing: on`（真實的可能是別的句子）、`… jobs`、`… runs-on`、`… options`、`… group`；``Every step must define a `uses` or `run` key``；``A step cannot have both the `uses` and `run` keys``（依推測）；job ID 的長句（真實的可能有重複的「and and」）；`may not be used more than once within the same scope.`；`Matrix vector '…' does not contain any values`；`Matrix exclude key '…' does not match any key within the matrix`（依推測）；``you may only define one of `branches` and `branches-ignore` for a single event``；`Invalid cron expression '…'`（依推測）；``No event triggers defined in `on` ``；`Job '…' depends on unknown job '…'.`、`… which creates a cycle in the dependency graph.`（依推測）與循環時報的是哪一對；``No steps defined in `steps` and no workflow called in `uses` for the following jobs: …``；這兩類錯誤只在檔案本身沒有錯時才出現。
- **context 的可用性**：依 GitHub 文件的表格記憶整理（`PLACES`），可能有遺漏；workflow 層的 `defaults` 借用 `env` 的規則；`id-token` 是否接受 `read`（模擬環境接受）。
- **運算式**：錯誤的位置（從 1 起、以去掉前後空白的運算式計）與 `Unexpected end of expression` 帶的是哪個 token；未關閉的引號的錯誤；`An expression was expected`；數字轉文字的規則（runner 的格式可能不同，例如小數位數）；字串轉數字接受的格式；陣列與物件轉文字是 `Array`、`Object`（依記憶）；篩選後略過沒有屬性的元素；`contains` 對陣列用鬆散相等；`format`、`fromJSON` 的錯誤句子；`join` 對非陣列的處理；`toJSON` 的縮排與數字格式。
- **hashFiles**：檔案的順序（runner 依檔案系統走訪的順序，模擬環境依路徑排序）、結合摘要的方式（每個檔案的 SHA-256 摘要接起來再做 SHA-256，依記憶中 runner 的 `hashFiles` 腳本）、樣式相對於 `GITHUB_WORKSPACE` 與 `!` 的處理；所以結果不保證與真實的 GitHub 逐字相同。
- **觸發條件**：篩選樣式的細節（`**/` 是否包含根目錄、`?` 與 `+` 接在 `]` 之後、`[]` 內允許的字元）；只有 `!` 的清單；新分支的路徑比對基準；路徑篩選遇到 0 個變更的檔案時不觸發；刪除分支不觸發 `push`；衝突的 PR 不觸發；`pull_request_target` 不看衝突；`workflow_dispatch` 輸入的錯誤句子（`Unexpected inputs provided`、`Required input … not provided`、`… not in the list of allowed values`、`… is not a valid boolean`、`… is not a valid number`）與沒有預設值時的值（字串空白、布林 false、數字空白）；`environment` 類型的輸入不檢查。
- **權限**：範圍的清單（是否包含 `attestations`、`models` 等較新的範圍）；`read-all` 時 `id-token` 是 none；寬鬆預設的內容（`id-token` 是 none）；受限預設是 contents、packages read；`permissions:` 空值當作 `{}`；runner 顯示的名稱（`IdToken`、`PullRequests`…）與排序。
- **gh workflow**：`NAME  STATE  ID` 的表頭與欄寬（較舊的 gh 沒有表頭）；ID 是模擬環境算的九位數（真實的是 GitHub 指派的流水號）；無效的檔案以路徑當名稱；只列預設分支的檔案（真實的 API 也會列在其他分支跑過的 workflow）；`no workflows found` 的結束碼；`view` 的 `Total runs 0` 與兩行提示在沒有 run 時是否都印；`--yaml` 在終端機上有語法上色與 Markdown 排版（模擬環境印原文）；找不到與多個同名的錯誤句子；`--ref` 不存在時的 404 網址；非互動模式的 `workflow argument required when not running interactively`；`accepts at most 1 arg(s), received 2`；`invalid limit: 0`；`unknown argument "x"; please quote all values that have spaces`。
