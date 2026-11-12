# D.3-4B 真機驗收：操作指南、驗收表與量測方法

> **狀態（2026-10-31）：D.3-4B Preparation Complete — Real Device Not Measured**
>
> | 狀態用語 | 意義 | 誰可以標 |
> |---|---|---|
> | Preparation Complete | 工具、驗收表、操作指南與自動化預檢完成（本輪） | 本輪 |
> | Real Device Not Measured | 還沒有任何一台標準測試機的實測結果（目前） | 本輪 |
> | Real Device Passed | 標準測試機實測後，審核判定通過 | **只有審核者**，依實測報告 |
> | Real Device Failed | 標準測試機實測後，審核判定不通過（列出阻擋項目） | **只有審核者**，依實測報告 |
>
> D.3-4A（自動化，Chromium）：Automated Acceptance Passed（限已執行項目，§3.5）。iOS Safari／Screen Reader：Not Verified。工具只量測與整理資料，**不會**標 Passed；模擬或桌機結果一律標「不可靠」，不能當成真機結果。正式 `/islands` 切換需另行批准。
>
> 範圍：`/islands/candidate`（D.3-5 自由相機、D.3-6 時間情境、D.3-7a 手機 UI 已整合）。效能另與 `/islands/legacy`（就是現行 `/islands`）同機比較。不切換正式路由；不改地形、GLB、教材或資產庫；量測工具不修改應用程式。
>
> 本文件前身是 D.3-4 準備（2026-10-30，`logs/2026-10-30-d3-4-prep.md`）的驗收表；D.3-4B 準備（`logs/2026-10-31-d3-4b-device-prep.md`）把人工項目改為候選頁目前的功能（舊的 T-／K- 編號不再使用）。

## 0. 驗收結構、標準測試機與標準

### 0.1 兩部分

| 部分 | 內容 | 證明什麼 | 不能證明什麼 | 狀態 |
|---|---|---|---|---|
| **A 自動化驗收** | Playwright：Chromium 桌機與手機 viewport（iPhone 13 模擬、360／390／430 px）；互動、fallback、鍵盤、無障礙名稱、版面、像素 A/B | 功能、版面、fallback、鍵盤操作在瀏覽器引擎上正確 | 真實 GPU 效能、真實觸控手感、iOS Safari（WebKit）上的行為 | Automated Acceptance Passed（限已執行項目） |
| **B 真機驗收** | 標準測試機以 `perf/device/` 實測（§1～§3） | 標準測試機上的 FPS、首幀、觸控、陰影與顯示 | — | **Preparation Complete — Real Device Not Measured** |

瀏覽器模擬（手機 viewport、CPU 降速、SwiftShader）**不能**代替真機 GPU 數據。

### 0.2 標準測試機（2026-10-30 決定）

| 基準 | 代表機型 | 瀏覽器 | 目的 |
|---|---|---|---|
| 最低效能基準 | iPhone SE（第 3 代，2022） | Safari | 小螢幕（375 pt）、較舊硬體；P-01～P-03 **以此機判定** |
| 標準效能基準 | iPhone 16 | Safari | 主流使用體驗、畫面品質與流暢度 |
| Android 相容性 | 中階 Android（型號實測時記錄） | Chrome | 不同 GPU、瀏覽器與觸控行為 |

### 0.3 標準

| 標準 | 對應 |
|---|---|
| 鏡頭飛行 FPS ≥ 45，且達舊版的 90% 以上（暫定） | P-01、P-02 |
| 首幀 ≤ 2.5 秒（暫定） | P-03 |
| 其他效能數字（自動旋轉 FPS、時間切換、draw call、三角形、shader、閒置重畫、context 遺失、雙指縮放） | 只記錄，不設門檻；與 §3.1 的預期值不同時寫入問題 |
| 人工檢查（§3.2） | 每項 Pass／Fail／Not Tested；Fail 是否阻擋上線由審核決定 |

## 1. 連線：Mac 與手機

### 1.1 Mac 啟動（三個終端機）

手機連到 Mac 上的量測 proxy（`perf/device/server.mjs`），它轉送到 Next.js 的 production server（`next start`）。**不用 `next dev`**：開發模式較慢且有熱更新，效能數字沒有意義。不需要新套件、雲端服務、Tunnel 或 API Key。

```bash
node node_modules/next/dist/bin/next build
```

```bash
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3118
```

```bash
node perf/device/server.mjs --upstream http://127.0.0.1:3118 --port 3119
```

- 第一個指令會寫入 `.next/`（建置輸出，已在 `.gitignore`）；程式碼有變動時要重新建置。也可以用 `pnpm build`、`pnpm start --hostname 127.0.0.1 --port 3118`；若 pnpm 嘗試自動安裝依賴，改用上面的 node 指令。
- `next start` 只聽 `127.0.0.1`，手機連不到它；手機只會連到 proxy（3119）。不要用 3100（其他專案使用）。
- 第三個指令會印出 `on the phone (same Wi-Fi): http://<Mac 的區網 IP>:3119/__probe/`。結果寫到 `test-results/device/`（已在 `.gitignore`）。

### 1.2 取得 Mac 的區網 IP

proxy 啟動時會印出來。也可以：

```bash
ipconfig getifaddr en0
```

（Wi-Fi 通常是 `en0`；沒有結果時試 `en1`，或「系統設定 → Wi-Fi → 詳細資訊」看 IP 位址。）

### 1.3 手機開啟

1. 手機與 Mac 連同一個 Wi-Fi（不是訪客網路；手機關閉行動數據優先與 VPN）。
2. 開控制頁：`http://<Mac IP>:3119/__probe/`（例：`http://192.168.1.20:3119/__probe/`）。網址要以 `http://` 開頭。
3. 候選頁（一般操作，不量測）：`http://<Mac IP>:3119/islands/candidate`；控制頁的「開啟候選頁」按鈕也會先關掉故障注入再開。
4. 未開啟量測或故障注入時，proxy 原樣轉送頁面（E2E 比對逐位元組相同），所以手機看到的就是候選頁本身，沒有任何測試控制。

### 1.4 網路暴露與資料

proxy 預設聽 `0.0.0.0`（手機要連得到），**沒有登入或權杖**，同一區網的任何裝置都能開控制頁、看報告、送出結果。因此：

- 只在量測期間開啟，量完立即在終端機按 `Ctrl+C` 關掉 proxy 與 `next start`；不要在公共、公司或訪客 Wi-Fi 使用。只在 Mac 本機自測時加 `--host 127.0.0.1`。
- 只轉送到 `--upstream`，不能當任意 proxy；`/__probe/mode` 只接受本機路徑；錯誤只回訊息（堆疊只印在 Mac）；請求超過 16 MB 拒絕；格式不對的量測結果回 400、不寫入磁碟。
- 不把服務暴露到公開網路：不做 port forwarding、不開 Tunnel；路由器若有「把裝置放到 DMZ」之類設定，不要對這台 Mac 開。
- 報告只收裝置型號、系統與瀏覽器版本、User-Agent、畫面尺寸與 GPU 名稱、檢查結果與備註；**不收姓名**。`test-results/` 不提交、不上傳，驗收後只把數字摘錄到本文件。

### 1.5 連不上時的排查

| 現象 | 檢查 |
|---|---|
| 手機一直轉圈或「無法連線到伺服器」 | Mac 上 `curl -I http://<Mac IP>:3119/__probe/` 是否 200；proxy 終端機是否還在跑；IP 是否變了（重新 `ipconfig getifaddr en0`） |
| Mac 自己可以、手機不行 | macOS 防火牆：「系統設定 → 網路 → 防火牆」，允許 `node` 接受連入連線（第一次啟動時系統會詢問，需按允許）；手機與 Mac 是否同一個網段（訪客網路或「AP／用戶端隔離」會擋住裝置互連）；手機或 Mac 是否開了 VPN |
| iPhone 上的 Chrome／Edge 打不開，但 Safari 可以 | iOS「設定 → Chrome（或 Edge）→ 區域網路」要開啟 |
| 瀏覽器自動改成 `https://` 或顯示安全性錯誤 | 本流程只用 `http://`（區網內的 WebGL 不需要 HTTPS）。手動輸入 `http://` 開頭的網址；瀏覽器若開了「僅限 HTTPS」模式（如 Firefox、Edge 的自動 HTTPS），對這個位址暫時關閉。不要為此安裝憑證或改用公開 Tunnel |
| 頁面打開但顯示「production server unreachable」 | `next start` 沒有在 3118 執行，或 `--upstream` 寫錯 |
| `EADDRINUSE` | 埠被占用：關掉舊的 proxy／server，或改用其他埠（`--port 3129`，並同步手機網址） |
| 量測一直沒有結束 | 頁面被切到背景或螢幕鎖定（自動鎖定設為「永不」）；在控制頁按「取消量測」後重跑 |

## 2. 驗收操作順序（每台手機）

| 步驟 | 在哪裡 | 做什麼 | 時間 |
|---|---|---|---|
| 0. 準備 | 手機設定 | 關閉低耗電／省電模式與「減少動態效果」；自動鎖定「永不」；電量 > 50%；關閉其他 App；閒置 2 分鐘降溫；記錄是否接電源與螢幕更新率設定（ProMotion、90／120 Hz） | 3 分鐘 |
| 1. 裝置資訊 | 控制頁 §0 | 填裝置型號；確認依 User-Agent 預填的系統與瀏覽器版本（不對就改）；儲存。之後的結果都歸到這台裝置 | 1 分鐘 |
| 2. 自動量測 | 控制頁 §1 | 勾選低耗電已關閉，按「開始自動量測」，**不要觸碰螢幕**。頁面自動輪流載入候選頁與舊版（各暖身 1 次，再交錯 3 輪）：首幀、GLB、閒置、鏡頭飛行；候選頁另切換四種時間並自動旋轉 5 秒。結束時顯示報告 | 約 4 分鐘 |
| 3. 雙指縮放 | 控制頁 §2 | 候選頁、舊版各開一次，在地圖上雙指縮放 3 次以上（每次 1 秒以上），按右下角「送出」 | 2 分鐘 |
| 4. 人工檢查 | 控制頁 §4 →「開啟候選頁」，另開分頁「填寫檢查表」 | 依 §3.2 順序（相機 → 自動旋轉 → 時間情境 → 版面與互動 → 無障礙 → 故障）逐項操作，填 Pass／Fail，沒做的保持 Not Tested；有問題寫備註 | 15～25 分鐘 |
| 5. 主觀觀察與問題 | 檢查表下方 | 流暢度、陰影、傍晚暖光、發熱；問題描述；截圖檔名（截圖本身另外傳給審核者）；是否有阻擋上線的問題 | 3 分鐘 |
| 6. 匯出 | 控制頁 §5 或報告頁 | 「匯出 JSON」或「文字版（可複製）」；或在 Mac 上用下方網址取得 | 1 分鐘 |

- 報告有「不可靠」時：依原因修正環境（例如關低耗電、不要切換 App）後重跑該台的自動量測。**不要挑選結果**：所有 run 都保留在報告與匯出裡。
- 換下一台手機：在控制頁 §0 重新填裝置資訊（每台手機的瀏覽器各自記住自己的裝置）。
- 鍵盤與螢幕閱讀器（U-06、U-07）只在有外接鍵盤或可開 VoiceOver／TalkBack 時做；做不到就保持 Not Tested。

## 3. 驗收表

方式：**D** 真機自動（按開始，量測不需觸碰）・**S** 真機半自動（使用者做手勢，工具計時）・**M** 真機人工（使用者操作並判斷）・**O** 使用者主觀觀察（不是量測）。

### 3.1 效能與裝置資訊（每台手機；候選頁與舊版同一次 run）

| ID | 項目 | 方式 | 門檻／預期（桌機 Chromium 自測值） | iPhone SE 3 | iPhone 16 | Android |
|---|---|---|---|---|---|---|
| P-01 | 鏡頭飛行 FPS（候選頁，中位數） | D | ≥ 45 | Not Measured | Not Measured | Not Measured |
| P-02 | 候選頁／舊版 飛行 FPS | D | ≥ 90% | Not Measured | Not Measured | Not Measured |
| P-03 | 首幀（候選頁，熱快取中位數） | D | ≤ 2.5 秒 | Not Measured | Not Measured | Not Measured |
| P-04 | 飛行幀間隔中位數／p95、長幀（> 50 ms） | D | 只記錄 | Not Measured | Not Measured | Not Measured |
| P-05 | GLB 就緒時間；冷快取首幀（暖身那一次） | D | 只記錄 | Not Measured | Not Measured | Not Measured |
| P-06 | 閒置重畫（停止後 2 秒內） | D | 只記錄；預期 0 | Not Measured | Not Measured | Not Measured |
| P-07 | 雙指縮放 FPS（候選頁與舊版） | S | 只記錄 | Not Measured | Not Measured | Not Measured |
| P-08 | 每幀 draw call（全景／聚焦／全景的陰影） | D | 預期與桌機相同：候選頁 43／26／0，舊版 146／82／112 | Not Measured | Not Measured | Not Measured |
| P-09 | 全景每幀三角形 | D | 預期：候選頁 28,569、舊版 12,086 | Not Measured | Not Measured | Not Measured |
| P-10 | Shader program（載入後 linkProgram 次數） | D | 預期：候選頁 17、舊版 5 | Not Measured | Not Measured | Not Measured |
| P-11 | 自動旋轉 FPS（候選頁，5 秒） | D | 只記錄；舊版 Not Available | Not Measured | Not Measured | Not Measured |
| P-12 | 時間切換：到第一個重畫的時間、重畫幀數、新編譯的 program（候選頁） | D | 只記錄；預期每次 1 幀、0 個新 program；舊版 Not Available | Not Measured | Not Measured | Not Measured |
| P-13 | WebGL context 遺失（量測期間） | D | 預期 0；發生時該次全部數字標不可靠 | Not Measured | Not Measured | Not Measured |
| P-14 | 裝置資訊：CSS viewport、DPR、WebGL renderer、User-Agent | D | 記錄；瀏覽器不提供時為 Not Available（例：iOS Safari 只回報「Apple GPU」） | Not Measured | Not Measured | Not Measured |

### 3.2 人工檢查（候選頁；每項 Pass／Fail／Not Tested＋備註）

相機：

| ID | 操作 | 預期 | 已自動（E2E，模擬） |
|---|---|---|---|
| C-01 | 單指在地圖上左右拖曳 | 地圖跟著水平旋轉，放開後停住；不會聚焦島嶼 | 有（CDP 觸控） |
| C-02 | 單指在地圖上上下滑動 | 整頁往上下捲動，地圖不旋轉 | 有 |
| C-03 | 雙指放大、縮小各數次 | 地圖平順縮放；整頁不跟著放大 | 有（模擬，不證明手感） |
| C-04 | 全景時點島嶼名牌，再點另一座島的地形 | 鏡頭飛到該島，地圖上方標題顯示該島；名牌不需點第二次 | 名牌有；地形點擊沒有 |
| C-05 | 聚焦後按「返回全景」 | 回到載入時的全景，三座島名牌都出現 | 有 |
| C-06 | 旋轉後聚焦，再單指旋轉，最後返回全景 | 聚焦保留旋轉後的方位、聚焦後仍可旋轉；返回全景回到預設方位 | 有 |

自動旋轉：

| ID | 操作 | 預期 | 已自動（E2E，模擬） |
|---|---|---|---|
| O-01 | 按「自動旋轉」，再按一次 | 開始緩慢旋轉、按鈕呈按下狀態；再按停止 | 有 |
| O-02 | 旋轉中分別：單指拖曳、雙指縮放、點名牌 | 每一種都會停止 | 有 |
| O-03 | 旋轉中切到其他分頁或 App，再回來 | 已停止，不會自行恢復 | 有（模擬 visibilitychange） |
| O-04 | 系統開「減少動態效果」後重新載入（可測時；測完關閉） | 預設不旋轉、聚焦直接到位；按鈕仍可手動開啟 | 有（Chromium 的 reduced motion） |

時間情境：

| ID | 操作 | 預期 | 已自動（E2E，模擬） |
|---|---|---|---|
| E-01 | 選「清晨」 | 低角度暖光；無破圖、閃爍或黑塊 | 畫面不同、不編譯 shader |
| E-02 | 載入後的預設 | 時間選單是「中午」，畫面與以往相同 | 有（逐像素） |
| E-03 | 選「黃昏」 | 低角度橘色陽光、長影子；無破圖或閃爍 | 畫面不同 |
| E-04 | 選「傍晚」 | 月光夜色；地圖上方標題清楚可讀 | 對比 ≥ 4.5:1 |
| E-05 | 四個情境下放大看陰影（全景與聚焦） | 陰影無明顯鋸齒、斷裂、閃爍或錯位 | 無（只能真機看） |
| E-06 | 傍晚看燈塔燈室、窗戶與路燈 | 呈暖黃光（只有燈本身亮，不照亮周圍是預期） | 材質數值有；觀感沒有 |
| E-07 | 從傍晚切回「中午」 | 畫面回到載入時的樣子 | 有（逐像素） |

版面、互動與無障礙：

| ID | 操作 | 預期 | 已自動（E2E，模擬） |
|---|---|---|---|
| U-01 | 直向看報告上的 CSS 寬度，並左右滑動整頁 | 記錄寬度（約 360／390／430）；整頁沒有水平捲動 | 360／390／430 px 有 |
| U-02 | 看地圖下方的提示與「時間情境／自動旋轉／返回全景」 | 一列完整可見、不截字、不溢出；按鈕好按、不會誤觸 | 44 px、不截字有 |
| U-03 | 旋轉、縮放、聚焦後看地圖上方的標題 | 標題在地圖外，不遮住島嶼或名牌 | 有 |
| U-04 | 點三座島；聚焦基礎程式島後用地點清單開燈塔說明、點工坊 | 都能聚焦；說明可開關；工坊進入 `/learn` | 有 |
| U-05 | 點「航行指南」三張島嶼卡片；切「清單」進入一份教材再返回；點頁尾「原有教材頁」 | 卡片讓地圖聚焦；清單可進入教材、切回 3D 正常；進入 `/learn/bfs`，返回後地圖正常 | 有（不含瀏覽器返回） |
| U-06 | 接外接鍵盤後重新載入，按 Tab、Enter（可測時） | 第一個焦點是「跳至主要內容」且清楚可見；Enter 跳到主要內容 | Chromium 有 |
| U-07 | VoiceOver（iPhone）或 TalkBack（Android）瀏覽地圖區與清單（可測時） | 按鈕與時間選單讀出可辨識的名稱；可用清單選島並進入教材 | 無障礙名稱有；螢幕閱讀器沒有 |
| U-08 | 轉橫向再轉回；長按名牌；地圖上快速點兩下 | 重新取景、名牌位置正確；不跳系統選單、不選取文字、頁面不放大 | 無 |

故障（工具在頁內注入；與 E2E 的差異見 §4.2）：

| ID | 操作 | 預期 | 已自動（E2E，模擬） |
|---|---|---|---|
| F-01 | 用工具的「WebGL 無法建立」開啟頁面 | 顯示「此裝置的 3D 場景無法使用」、自動切到清單、沒有 3D 控制、三座島與教材可進入 | 有 |
| F-02 | 用工具的「GLB 載入失敗」開啟頁面，聚焦基礎程式島 | 基礎程式島改用暫代建築，頁面可正常操作；地點清單仍可進入教材 | 有 |
| F-03 | 用工具的「WebGL context 遺失」開啟頁面，等 GLB 載入後約 2 秒 | 改為清單導航並顯示提示，教材可進入 | 有 |

### 3.3 主觀觀察（O；不是量測，與 §3.1 分開記錄）

整體流暢度（鏡頭飛行、旋轉、縮放）、陰影品質、傍晚暖光、發熱或耗電（約 15 分鐘後）。每項選「良好／可接受／不佳」或保持「未觀察」，可加說明。

### 3.4 問題、截圖與上線判斷

檢查表最後有問題描述、截圖檔名（截圖本身另外傳給審核者，工具不收檔案）與「是否有阻擋上線的問題：是／否／未判斷」。這是測試者的意見；最終由審核決定。

### 3.5 A 自動化驗收（Playwright，Chromium；不是真機證據）

候選頁的自由相機、觸控（CDP 模擬）、鏡頭飛行、自動旋轉與停止條件、四種時間情境（像素、shader、draw、陰影 pass、閒置）、對比、手機 360／390／430 px 版面與標題、跳至主要內容、按鈕列（44 px）、WebGL fallback：`e2e/candidate-integration.spec.ts`、`islands-candidate`、`islands-acceptance`、`hex-camera`、`hex-environment`；量測工具本身：`e2e/device-tool.spec.ts`（在模擬上必須把自己的數字標為不可靠）。

## 4. 量測方法

### 4.1 定義

| 指標 | 定義 | 精度 |
|---|---|---|
| 首幀 | 導航開始到第一個有主畫面 draw call 的 rAF 時間戳 | 約 1 幀 |
| GLB 就緒 | 基礎程式島名牌出現 `data-model-source="glb"` 的時間 | 每 100 ms 檢查 |
| 鏡頭飛行 | 從按下清單的「基礎程式島」或「返回全景」到 700 ms 沒有新畫面為止；每頁 6 次 | — |
| FPS | 每次飛行（畫面數 − 1）÷ 時間，取中位數；路由的值是各輪的中位數 | — |
| 幀間隔 | 飛行中相鄰畫面的間隔；中位數、p95、> 50 ms 次數 | rAF 時間戳 |
| 閒置更新率／閒置重畫 | 靜止時 60 個 rAF 間隔的中位數；停止後 2 秒內畫的畫面數 | — |
| draw call／三角形 | 停止後最後一幀，主畫面與離屏（陰影貼圖）分開，逐呼叫計數（包裝 WebGL2 draw 函式） | 精確 |
| Shader program | 載入並靜止後 `linkProgram` 的累計次數（與 E2E 相同的計法） | 精確 |
| 時間切換 | 選單改變到之後第一個被記錄畫面的時間（記錄在下一個 rAF，所以含最多約 1 幀）、到靜止為止的畫面數、期間新的 `linkProgram` 次數；清晨→黃昏→傍晚→中午，取中位數／最大值 | 約 1 幀 |
| 自動旋轉 FPS | 按下「自動旋轉」0.5 秒後的 5 秒內，畫面數 − 1 ÷ 時間；之後按「返回全景」 | — |
| context 遺失 | 量測期間 `webglcontextlost` 事件數（window capture） | 精確 |
| 雙指縮放 | 第二根手指放下到最後一根手指離開之間的畫面，算法同飛行；少於 10 幀不計 | — |

順序：暖身（冷快取）候選頁、舊版各 1 次，不列入門檻；之後 3 輪交替先後。

### 4.2 已知偏差與限制

- **FPS 不等於螢幕更新率，也不是完整的 GPU profiling**：它是瀏覽器交給頁面的 rAF 頻率。iPhone Safari 預設把 rAF 限制在 60 Hz（即使是 ProMotion），低耗電模式 30 Hz；Android 高更新率螢幕可達 90／120 Hz（報告會提示，P-02 要連同原始 FPS 判讀）。看不到合成器層的掉幀、GPU 時間或耗電。
- 量測包裝每個 draw call：舊版每幀呼叫次數多，包裝開銷對舊版略多，P-02 比例會稍微偏向候選頁（估計每幀遠小於 1 ms，未實測）。
- 自動量測用程式按下按鈕觸發飛行、切換時間與自動旋轉，不是手指觸控；觸控由人工項目檢查。
- WebGL renderer 字串由瀏覽器決定：iOS Safari 通常只回報「Apple GPU」，有些瀏覽器隱藏；取不到時為 Not Available。`navigator.deviceMemory` 在 `http://` 下不提供。
- 故障注入是在頁內模擬失效：WebGL 無法建立、context 遺失與 `e2e/fallbacks.ts` 相同做法（複製，不是 import，修改時要同步）；GLB 失敗改用覆寫 `window.fetch` 回 404（E2E 用 `page.route`）。

### 4.3 可靠性旗標（有任一相關旗標就「不可靠，不判定」）

| 旗標 | 影響 |
|---|---|
| 量測失敗（逾時、找不到元素） | 全部 |
| 頁面被切到背景 | 全部 |
| 減少動態效果 | 鏡頭飛行 FPS、比例（自動旋轉照常量） |
| 閒置更新率 < 50 Hz | FPS、比例、自動旋轉 |
| 飛行少於 10 幀 | 鏡頭飛行 FPS、比例 |
| 軟體算圖（SwiftShader 等） | 全部 |
| 不是手機瀏覽器（User-Agent 沒有 Mobile／Android） | 全部 |
| 各輪差距 > 20% | 鏡頭飛行 FPS、比例 |
| 少於 3 輪 | FPS、首幀 |
| WebGL context 遺失 | 全部 |

## 5. 報告與匯出

| 位置 | 內容 |
|---|---|
| `/__probe/report` | 所有裝置，每台：裝置（使用者確認＋偵測）、實際量測（每次 run 全部保留）、雙指縮放、主觀觀察、檢查表（Pass／Fail／Not Tested 計數）、問題與截圖、是否阻擋上線 |
| `/__probe/export.json?device=<id>` | 一台裝置的報告（schema `logic-island/d3-4b-device-report@1`），可下載或複製 |
| `/__probe/export.txt?device=<id>` | 同一份報告的純文字版，可直接貼到訊息或 issue |
| `/__probe/report.json` | 所有原始資料（量測的幀資料、檢查表原始欄位） |
| Mac 的 `test-results/device/*.json` | 原始檔（`device-*`、`run-*`、`pinch-*`、`checklist-*`） |

匯出 JSON 的主要欄位：`testDate`、`testUrl`、`device`（型號、系統、瀏覽器，使用者確認）、`detected`（User-Agent、CSS viewport、DPR、WebGL renderer）、`measured`（每次 run 的門檻判定，候選頁與舊版每個數字的 `value`／`unit`／`status: measured | not-available | unreliable`／原因；雙指縮放）、`observed`（主觀觀察）、`checklist`（每項 `Pass`／`Fail`／`Not Tested` 與備註）、`issues`、`screenshots`、`blocking`（`yes`／`no`／`undecided`）、`notMeasured`、`decision: null`（工具不判定）。

## 6. 結果紀錄（待真機）

| 裝置 | 系統／瀏覽器 | CSS／DPR | 閒置更新率 | 候選頁 FPS | 舊版 FPS | 比例 | 首幀 | 自動旋轉 FPS | 人工檢查 | 審核 |
|---|---|---|---|---|---|---|---|---|---|---|
| iPhone SE（第 3 代） | Safari | — | — | Not Measured | Not Measured | — | Not Measured | Not Measured | Not Tested | Real Device Not Measured |
| iPhone 16 | Safari | — | — | Not Measured | Not Measured | — | Not Measured | Not Measured | Not Tested | Real Device Not Measured |
| 中階 Android（型號待記錄） | Chrome | — | — | Not Measured | Not Measured | — | Not Measured | Not Measured | Not Tested | Real Device Not Measured |

## 7. 尚未完成與待決

- **真機實測：Not Measured**（三台標準測試機）。這台 Mac 沒有實體手機、adb、Xcode 或 iOS 模擬器；工具只在 Chromium 模擬自測過（`e2e/device-tool.spec.ts`），那些數字一律標不可靠。
- 仍待決：Android 的具體型號；高更新率 Android 上 P-02 的判讀方式；自動旋轉 FPS、時間切換延遲是否需要門檻（目前只記錄）。
- 實測後由審核依匯出報告標 Real Device Passed 或 Real Device Failed，再決定是否修正候選頁、是否授權正式 `/islands` 切換。
