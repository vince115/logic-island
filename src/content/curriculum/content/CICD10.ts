import type { LessonContent } from '../schema';
import type { AppVersion, Fleet, Gate, RolloutScenario, Strategy } from '@/lib/devops/rollout';

/**
 * CICD10 部署策略：滾動、藍綠與金絲雀. A devops-explorer lesson (D2 deployment-simulator, no terminal). A fictional ferry
 * booking service (示意資料, not any real company): six instances of 250 requests a minute serve 1,300 requests a minute,
 * so the fleet has less than one instance of headroom; v2 takes 150 s (three minutes in the model) to be ready. The same
 * fleet is updated by recreate, rolling, blue-green and canary; a faulty v2 (30 ‰) meets a canary gate; a column rename
 * breaks v1 unless it is split into expand, deploy and contract; a feature flag is opened after the deployment. Every
 * number an exercise asks is computed by src/lib/devops (devopsContentProblems checks them); none is written here.
 */

const fleet: Fleet = { instances: 6, capacityRpm: 250, rpm: 1300 };
const v1: AppVersion = { id: 'v1', label: 'v1', errorPermille: 2, p95Ms: 180, startSeconds: 60 };
const v2: AppVersion = { id: 'v2', label: 'v2', errorPermille: 2, p95Ms: 190, startSeconds: 150 };
/** The faulty build: some routes' fares fail (30 ‰); it is just as fast. */
const v2Faulty: AppVersion = { ...v2, errorPermille: 30 };
/** The promotion gate of the blue-green and canary examples: the new version's error rate at most 5 ‰ over 300 requests or more. */
const gate: Gate = { metric: 'error-rate', max: 5, minRequests: 300 };
const MINUTES = 30;

const rolling10: Strategy = { kind: 'rolling', maxSurge: 1, maxUnavailable: 0 };
const blueGreen: Strategy = { kind: 'blue-green', verifyMinutes: 2, keepBlueMinutes: 5 };
const canary = (...steps: [weight: number, holdMinutes: number][]): Strategy => ({ kind: 'canary', steps: steps.map(([weight, holdMinutes]) => ({ weight, holdMinutes })) });

const recreate: RolloutScenario = { fleet, from: v1, to: v2, strategy: { kind: 'recreate' }, minutes: MINUTES };
const rolling: RolloutScenario = { fleet, from: v1, to: v2, strategy: rolling10, minutes: MINUTES };
const blueGreenScenario: RolloutScenario = { fleet, from: v1, to: v2, strategy: blueGreen, gate, minutes: MINUTES };
const canaryPass: RolloutScenario = { fleet, from: v1, to: v2, strategy: canary([10, 3], [50, 3], [100, 3]), gate, minutes: MINUTES };
const canaryAbort: RolloutScenario = { fleet, from: v1, to: v2Faulty, strategy: canary([25, 3], [100, 3]), gate, minutes: MINUTES };

/** v1 reads `phone`, v2 reads `contact_phone`. */
const schemaVersions = { from: { ...v1, requires: ['phone'] }, to: { ...v2, requires: ['contact_phone'] }, schema: ['id', 'name', 'phone'] };
/** The rename done in one step when the deployment starts (add the new column and drop the old one at minute 0). */
const schemaBreak: RolloutScenario = { fleet, ...schemaVersions, strategy: rolling10, minutes: MINUTES,
  migrations: [{ at: 0, kind: 'expand', columns: ['contact_phone'] }, { at: 0, kind: 'contract', columns: ['phone'] }] };
/** Expand at 0, deploy (v1 is gone at minute 18), contract at 24. */
const schemaSafe: RolloutScenario = { fleet, ...schemaVersions, strategy: rolling10, minutes: MINUTES,
  migrations: [{ at: 0, kind: 'expand', columns: ['contact_phone'] }, { at: 24, kind: 'contract', columns: ['phone'] }] };
/** v2 ships the new seat map switched off; 10 % of its requests take it from minute 21, and it is switched off at 25. */
const flagged: RolloutScenario = { fleet, from: v1, to: v2, strategy: rolling10, minutes: MINUTES,
  flags: [{ id: 'seat-map', label: '新版座位圖', version: 'v2', errorPermille: 40, exposure: [{ at: 0, percent: 0 }, { at: 21, percent: 10 }, { at: 25, percent: 0 }] }] };

export const CICD10: LessonContent = {
  lessonId: 'CICD10',
  motivation: '渡輪訂票服務要把 v2 上線：新版本多了選座位的功能，也可能藏著測試沒有發現的錯誤。最簡單的做法是停掉舊版、換上新版，但旅客在換版的幾分鐘裡會訂不到票；一次把所有執行個體換掉，新版本有錯時每個人都會碰到。部署策略要決定的是：換版期間由哪些執行個體、以多少比例承接流量，需要多少額外的機器，出了問題能多快、多安全地回到舊版本。本課在同一個機群上逐分鐘模擬重建、滾動更新、藍綠部署與金絲雀發布，比較丟棄的請求、額外的執行個體分鐘與錯誤影響的範圍，再看資料庫結構的變更為什麼要配合部署拆成擴充與收縮，最後用功能旗標把「部署」和「發布」分開。',
  sections: [
    {
      id: 'cicd10-s-setup', title: '換版的代價：從重建開始',
      blocks: [
        { type: 'p', text: '本課的例子是一個虛構的渡輪訂票服務（示意資料）。部署管線已經把 v2 建置、測試好，變成可以部署的版本；本課看的是最後一段：正式環境裡正在服務的執行個體，怎麼從 v1 換成 v2。' },
        { type: 'table', head: ['項目', 'v1（目前的版本）', 'v2（新版本）'], rows: [
          ['執行個體', '6 個，每個每分鐘最多承接 250 個請求', '部署完成後同樣是 6 個'],
          ['流量', '每分鐘 1,300 個請求（本模型固定不變）', '同左'],
          ['錯誤率', '2‰', '正常的 v2 是 2‰；第四節另有一個 30‰ 的有錯版本'],
          ['p95 延遲', '180 ms', '190 ms'],
          ['啟動到就緒', '60 秒', '150 秒（要先載入航班與座位的快取）'],
        ] },
        { type: 'p', text: '部署模擬器是本課自創的教學模型，不代表任何調度系統或負載平衡器的行為。時間以分鐘為單位：第 t 分鐘啟動的執行個體，要 ⌈啟動秒數 ÷ 60⌉ 分鐘後才就緒，v2 是 ⌈150 ÷ 60⌉ = 3 分鐘；只有就緒的執行個體承接請求，超過容量的請求被丟棄（沒有被服務，和錯誤分開計算）；錯誤依各版本的錯誤率逐分鐘累計。6 個執行個體的總容量是 1,500，只比流量 1,300 多 200，少一個就不夠。' },
        { type: 'p', text: '最直接的做法是重建（recreate）：先停掉全部的 v1，同時啟動 6 個 v2。新版本就緒之前，沒有任何執行個體能服務，這段時間就是停機。' },
        { type: 'example', id: 'cicd10-recreate' },
        { type: 'p', text: '重建不需要額外的機器，新舊版本也不會同時存在；代價是停機的長度等於新版本的啟動時間，而且出錯時要再重建一次舊版本，又是一段停機。當新舊版本不能同時執行（例如兩者會用不相容的格式寫同一份資料），又可以安排在維護時段停機時，重建仍然是合理的選擇。後面三種策略都在避免停機：讓新舊版本同時存在一段時間，並控制流量怎麼從舊版本移到新版本。' },
      ],
    },
    {
      id: 'cicd10-s-rolling', title: '滾動更新：一次換幾個',
      blocks: [
        { type: 'p', text: '滾動更新（rolling update）一次只換掉機群的一部分：啟動幾個新版本、等它們就緒、移除幾個舊版本，重複到全部換完。兩個參數決定節奏：`maxSurge` 是更新期間最多可以比原本多開幾個執行個體，`maxUnavailable` 是最多可以比原本少幾個可用的執行個體。兩者可以寫成個數或百分比；百分比怎麼換成個數，本模型照常見的 Kubernetes 式取整：`maxSurge` 無條件進位、`maxUnavailable` 無條件捨去。兩者算出來都是 0 時更新無法前進，模型把 `maxUnavailable` 改成 1。' },
        { type: 'table', head: ['maxSurge／maxUnavailable', '更新期間的執行個體', '在本例的影響'], rows: [
          ['1／0', '最多 7 個，可用的永遠是 6 個', '容量足夠、不丟請求；一次只換一個，每個 v2 都要等 3 分鐘就緒，最慢'],
          ['2／0', '最多 8 個，可用的永遠是 6 個', '不丟請求，一次換兩個比較快，但同時要多兩個執行個體的資源'],
          ['0／1', '最多 6 個，可用的可能只有 5 個', '不需要額外的機器，但 5 個的容量 1,250 低於流量 1,300，會丟棄請求'],
          ['1／1', '最多 7 個，可用的可能只有 5 個', '比 1／0 快，但每一輪都有容量不足的分鐘'],
          ['25%／25%', '6 × 25% = 1.5，取整後是 2／1', '和 2／1 一樣：快，但少一個可用時會丟棄請求'],
        ] },
        { type: 'p', text: '在探索器裡修改 `maxSurge` 與 `maxUnavailable`，看完成的分鐘、尖峰的執行個體與丟棄的請求怎麼變化；執行個體圖會分開畫出就緒與還在啟動中的執行個體，請求圖會畫出被丟棄的部分。' },
        { type: 'example', id: 'cicd10-rolling' },
        { type: 'p', text: '取捨很具體：`maxUnavailable` 大於 0 可以省下額外的機器，代價是更新期間的容量變小；本例的容量餘裕不到一個執行個體，所以只要少一個就丟請求。`maxSurge` 越大越快完成，代價是同時需要更多資源。容量有餘裕的服務可以用 `maxUnavailable` 加速，接近滿載的服務要靠 `maxSurge`。' },
        { type: 'p', text: '滾動更新還有兩個特性要記住。第一，更新期間 v1 與 v2 同時承接使用者的請求，所以兩個版本必須能同時存在：API 的格式、佇列裡的訊息、資料庫的結構都要彼此相容（第五節）。第二，它沒有內建「先看一下再決定」的步驟：模擬器的閘門只用於藍綠與金絲雀，v2 有錯時會隨著更新一路擴散到全部的執行個體，要靠監控發現，再滾動回 v1。' },
        { type: 'callout', tone: 'note', title: '控制迴圈的時間是本模型的簡化', text: '本模型每分鐘檢查一次、先移除舊的再啟動新的，就緒只看啟動時間。真實的調度系統依健康檢查（readiness probe）判斷就緒，檢查與替換的節奏也不同。只有百分比的取整方式依照 Kubernetes 的做法，其餘規則是本課為了能逐分鐘手算而固定的約定。' },
      ],
    },
    {
      id: 'cicd10-s-blue-green', title: '藍綠部署：準備好整套再切換',
      blocks: [
        { type: 'p', text: '藍綠部署（blue-green deployment）同時保有兩套完整的環境：目前承接流量的叫藍色（v1），新版本部署在綠色（v2）。綠色全部就緒後先做驗證（例如煙霧測試，這時還沒有使用者的流量），通過後把流量一次全部從藍色切到綠色。切換之後藍色不會馬上拆掉，而是保留一段時間：綠色出問題時，把流量切回藍色就能立即回滾，不必重新部署，也不必等新的執行個體啟動。' },
        { type: 'list', ordered: true, items: [
          '第 0 分鐘：啟動 6 個 v2（綠色），v1（藍色）照常承接全部流量。',
          '綠色就緒後驗證 `verifyMinutes` 分鐘，這段時間仍由藍色服務。',
          '切換：流量 100% 改到綠色。之後的 `keepBlueMinutes` 分鐘是觀察期，閘門在這段時間判斷綠色是否健康。',
          '觀察期結束：閘門通過就移除藍色，部署完成；未通過就把流量切回藍色並移除綠色，也就是回滾。',
        ] },
        { type: 'example', id: 'cicd10-blue-green' },
        { type: 'p', text: '藍綠部署的切換與回滾都只是改一次流量的去向，除了切換的那一刻，也沒有新舊版本一起承接使用者請求的時段，這是它最大的優點。代價是資源：從綠色開始啟動到藍色被移除，整段時間要準備兩倍的執行個體。探索器的總計卡片有「額外的執行個體分鐘」，也就是每分鐘超過原本 6 個的部分加總，可以拿來和滾動更新比較。另一個代價是風險集中：切換之後全部的使用者都在用新版本，v2 若有錯，在回滾之前每個人都會碰到。' },
      ],
    },
    {
      id: 'cicd10-s-canary', title: '金絲雀發布：先讓一小部分流量試用',
      blocks: [
        { type: 'p', text: '金絲雀發布（canary release）的名稱來自礦工帶進坑道、用來提早察覺有毒氣體的金絲雀：先讓一小部分流量走新版本，觀察它的錯誤率或延遲，沒問題再逐步擴大，有問題就在少數人受影響時停下來。本模型的每一步有兩個參數：流量比例（weight）與觀察時間（hold）。每一步先把新版本擴到足以承接這個比例的數量，也就是 ⌈6 × 比例 ÷ 100⌉ 個，新啟動的就緒後才把這個比例的流量導過去，再觀察 hold 分鐘；最後一步的比例是 100%，通過後移除舊版本。整個過程中舊版本保持 6 個，所以回滾只需要把流量切回去。' },
        { type: 'table', head: ['閘門的設定', '意思'], rows: [
          ['指標（metric）', '看新版本的錯誤率（error-rate，‰），或它宣告的 p95 延遲（ms）'],
          ['上限（max）', '錯誤率：觀察期間新版本的錯誤 × 1000 ≤ 上限 × 請求數才算通過'],
          ['最少請求數（minRequests）', '觀察期間新版本承接的請求少於它時是「樣本不足」，視同未通過'],
          ['判定的時間', '觀察期間最後一分鐘結束時判定，結果在下一分鐘開始時執行：未通過就把流量歸零、移除新版本'],
        ] },
        { type: 'p', text: '下面兩個探索器用同一個閘門：錯誤率最多 5‰、每一步至少 300 個請求。第一個是正常的 v2，分 10%、50%、100% 三步，每一步都通過；第二個是有錯的 v2（錯誤率 30‰，例如某些航線的票價計算出錯），分 25%、100% 兩步，第一步就被擋下。' },
        { type: 'example', id: 'cicd10-canary-pass' },
        { type: 'example', id: 'cicd10-canary-abort' },
        { type: 'p', text: '金絲雀發布限制的是「出錯時有多少人受影響」：有錯的 v2 只承接了第一步的比例，閘門一判定未通過，流量就回到 v1。和藍綠部署相比，它多了逐步觀察的時間，完成得比較慢；和滾動更新相比，它把流量比例和執行個體的數量分開控制，而且每一步都有明確的判斷條件。最少請求數同樣重要：只有幾十個請求時，一兩個錯誤就會讓錯誤率大幅跳動，所以樣本不足就不放行（fail closed），寧可回滾也不要在證據不足時擴大。反過來，比例太小、觀察太短的步驟，連健康的版本也會因為樣本不足而被擋下。' },
        { type: 'callout', tone: 'warning', title: '「有金絲雀發布，就能抓到所有錯誤」', text: '閘門只看它量測的東西。只檢查 p95 延遲的閘門，對「很快地回傳錯誤」完全沒有反應；只在某些時段、某些使用者或某些航線才發生的錯誤，在觀察期間的流量裡可能根本沒有出現；比例太小、觀察太短時樣本不夠，偶發的錯誤看不出來。資料被寫壞、記憶體慢慢洩漏這類問題，往往要在全部流量上跑一段時間才會浮現，那時金絲雀早已結束。金絲雀發布縮小的是出錯時的影響範圍，不能取代測試、監控與回滾的準備。' },
      ],
    },
    {
      id: 'cicd10-s-database', title: '資料庫相容性：擴充、部署、收縮',
      blocks: [
        { type: 'p', text: '前面三種避免停機的策略，都讓 v1 與 v2 在一段時間裡同時存在：滾動更新與金絲雀發布期間兩者一起承接請求，藍綠部署則要讓藍色隨時能接回流量。兩個版本通常共用同一個資料庫，所以資料庫的結構必須同時讓兩個版本都能運作，這就是部署時要顧及的資料庫相容性。' },
        { type: 'p', text: '例子：v2 把會員資料的 `phone` 欄位改名為 `contact_phone`。如果在部署開始時直接改名，等於同時新增 `contact_phone`、刪除 `phone`，還在執行的 v1 就再也讀不到 `phone`。模擬器把「版本需要的欄位不存在」當成它承接的請求全部失敗。' },
        { type: 'example', id: 'cicd10-schema-break' },
        { type: 'p', text: '安全的做法是把一次改名拆成三步，常稱為擴充與收縮（expand and contract，也稱 parallel change）：' },
        { type: 'table', head: ['步驟', '做什麼', '這時哪些版本能運作'], rows: [
          ['1. 擴充（expand）', '只新增 `contact_phone`，把既有資料複製過去；舊欄位 `phone` 保留', 'v1 讀 `phone`、v2 讀 `contact_phone`，兩者都能運作'],
          ['2. 部署', '用任何一種策略把 v1 換成 v2；過渡期間 v2 同時寫入兩個欄位，回滾到 v1 時資料仍然完整', '兩者都能運作，也隨時可以回滾'],
          ['3. 收縮（contract）', '確定 v1 已經全部下線、也不再需要回滾之後，才刪除 `phone`', '只剩 v2'],
        ] },
        { type: 'example', id: 'cicd10-schema-safe' },
        { type: 'p', text: '模擬器只模擬欄位存不存在：擴充視為立即可用，資料的複製（backfill）、雙寫與一致性的檢查都不在模型裡，它們在真實系統中需要時間，大的資料表還要分批進行。順序弄錯也會出事：忘了擴充，v2 一承接請求就失敗；太早收縮，還在執行的 v1 立刻失敗，而且這時回滾到 v1 也救不回來，因為 v1 需要的欄位已經不在了。' },
        { type: 'callout', tone: 'warning', title: '「藍綠部署有兩套環境，所以沒有資料庫的風險」', text: '藍綠部署複製的通常是執行應用程式的執行個體，不是資料庫；兩套環境多半連到同一個資料庫。在切換前就刪掉 v1 需要的欄位，正在承接全部流量的藍色會立刻失敗；切換後立刻收縮，就斷了「切回藍色」這條回滾的路。資料庫的結構變更一樣要先擴充、等不再需要藍色之後才收縮。若真的替兩套環境各準備一個資料庫，就要處理兩邊資料的同步，複雜度只是換了地方。' },
      ],
    },
    {
      id: 'cicd10-s-choose', title: '流量切換與功能旗標：怎麼選擇策略',
      blocks: [
        { type: 'p', text: '把幾種策略放在一起看，共同點都是流量切換：在新舊版本同時存在的期間，決定每個請求由哪個版本處理。滾動更新靠執行個體的數量間接切換（每個就緒的執行個體分到一份流量）；藍綠部署在入口一次把 100% 從藍色切到綠色；金絲雀發布在入口依比例逐步移動。能在入口控制流量（負載平衡器、閘道或服務之間的路由規則）時，回滾只是改一個設定；只能靠替換執行個體時，回滾就要再滾動一次。' },
        { type: 'table', head: ['比較', '重建', '滾動更新', '藍綠部署', '金絲雀發布'], rows: [
          ['停機', '有，直到新版本就緒', '沒有（容量足夠時）', '沒有', '沒有'],
          ['額外資源', '不需要', '最多 maxSurge 個，持續整個更新', '兩倍，從綠色啟動到藍色移除', '逐步增加，本模型的最後一步也是兩倍'],
          ['出錯時受影響的範圍', '全部', '隨更新擴大到全部', '切換後全部', '目前這一步的比例'],
          ['回滾', '再重建一次，又一次停機', '再滾動一次', '流量切回藍色，立即', '流量歸零，立即'],
          ['新舊版本同時服務', '不會', '會', '只在切換的瞬間', '會'],
        ] },
        { type: 'p', text: '選擇的方向：新舊版本無法共存、可以停機的內部工具，用重建最單純；一般的無狀態服務，用 `maxSurge` 撐住容量的滾動更新成本最低；資源足夠、最在意回滾速度時用藍綠部署；使用者多、出錯代價高、又有可靠的指標可以判斷時，用金絲雀發布限制影響範圍。不論選哪一種，資料庫的結構變更都要配合擴充與收縮。' },
        { type: 'p', text: '最後，部署（把程式放上正式環境）和發布（讓使用者用到新功能）可以分開。功能旗標（feature flag）讓新功能的程式隨著部署上線，但預設關閉；之後再逐步開放給一部分請求，有問題時關掉旗標即可，不需要重新部署。下面的例子中，v2 帶著「新版座位圖」的程式完成滾動更新，第 21 分鐘才開放 10% 的請求使用，發現錯誤偏高後在第 25 分鐘關回 0%。' },
        { type: 'example', id: 'cicd10-flag' },
        { type: 'p', text: '功能旗標和金絲雀發布都在控制「多少人用到新東西」，但層次不同：金絲雀發布控制由哪個版本的程式承接流量，旗標控制同一個版本裡走哪一條程式路徑。旗標也有代價：關閉的路徑一樣要測試，用完的旗標要記得移除，否則程式裡的分支會越來越多、越來越難懂。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'cicd10-q-recreate', prompt: '下列哪一種情況，重建（recreate）仍然是合理的部署策略？',
      options: ['服務隨時都有大量使用者，任何一分鐘的停機都會造成損失', '新版本的錯誤率可能偏高，需要先讓一小部分流量試用', '新舊版本不能同時執行，而且可以在維護時段短暫停機', '希望新版本出錯時，能在幾秒內切回舊版本'],
      answer: 2, explanation: '重建先停掉全部舊版本再啟動新版本，新舊版本不會同時存在，所以適合兩者無法共存、又能接受停機的情況。不能停機的服務會在新版本就緒前丟掉全部請求；讓一小部分流量先試用是金絲雀發布；重建出錯時要再重建一次舊版本，又是一段停機，做不到幾秒內回滾，那是藍綠部署的長處。',
    },
    {
      id: 'cicd10-q-rounding', prompt: '機群有 6 個執行個體，滾動更新設定 maxSurge 25%、maxUnavailable 25%。依本課採用的 Kubernetes 式取整，實際是多少？',
      options: ['最多多開 2 個、最多少 1 個', '最多多開 1 個、最多少 1 個', '最多多開 2 個、最多少 2 個', '最多多開 1 個、最多少 2 個'],
      answer: 0, explanation: '6 × 25% = 1.5。maxSurge 無條件進位成 2，maxUnavailable 無條件捨去成 1：多開的一方可以寬鬆，少開的一方要保守，可用的執行個體才不會比設定掉得更多。1／1 是兩者都捨去，2／2 是兩者都進位，1／2 則把兩個方向弄反了。',
    },
    {
      id: 'cicd10-q-blue-green', prompt: '藍綠部署切換到綠色後，發現錯誤率升高。為什麼可以很快回滾？',
      options: ['綠色只承接一部分流量，其他使用者本來就還在藍色', '切換時資料庫會自動備份，回滾時一併還原成切換前的狀態', '新版本在切換前驗證過，所以不會真的需要回滾', '藍色環境還保留著，只要把流量切回去'],
      answer: 3, explanation: '切換後藍色環境在保留期間仍在執行，回滾就是把流量切回藍色，不必重新部署或等執行個體啟動。藍綠部署切換的是全部流量，只讓一部分流量試用的是金絲雀發布；資料庫不會因為切換流量而自動備份或還原，結構與資料的變更要另外規劃；切換前的驗證沒有真實使用者的流量，抓不到所有問題，所以才要保留藍色。',
    },
    {
      id: 'cicd10-q-sample', prompt: '金絲雀的閘門要求「至少 300 個請求」。第一步只導 1% 的流量，觀察期間新版本只收到 40 個請求，會怎樣？',
      options: ['40 個請求裡沒有錯誤，所以閘門通過，進入下一步', '樣本不足，視同未通過，流量切回舊版本', '閘門會延長觀察時間，直到收滿 300 個請求', '閘門改用 p95 延遲判斷，因為錯誤率的樣本不夠'],
      answer: 1, explanation: '樣本太少時錯誤率不可靠，本模型和較安全的做法一樣，把樣本不足當成未通過（fail closed），所以回滾。沒有錯誤也不能放行，40 個請求太少，分不出 3‰ 和 30‰；本模型不會自動延長觀察時間，要由設計步驟的人讓比例與觀察時間足以收集到樣本；閘門也不會自己換指標，量測什麼是事先設定好的。',
    },
    {
      id: 'cicd10-q-gate', prompt: '某個金絲雀發布的閘門只檢查 p95 延遲。新版本的回應一樣快，但有 3% 的請求回傳錯誤。會發生什麼事？',
      options: ['閘門偵測到錯誤增加，在第一步就回滾', '金絲雀發布會自動比較兩個版本的全部指標，所以仍然會回滾', '每一步都通過，錯誤隨著比例擴大到全部使用者', '部署停在第一步，等待人工確認錯誤的原因'],
      answer: 2, explanation: '閘門只看它量測的指標：p95 沒有變差，每一步都判定通過，有錯的版本最後承接 100% 的流量。只檢查延遲的閘門看不到錯誤率，所以不會在第一步回滾；金絲雀發布不會自動比較沒有設定的指標；本模型也沒有人工確認的步驟，判定通過就前進。',
    },
    {
      id: 'cicd10-q-migration', prompt: '服務要把欄位 phone 改名為 contact_phone，並以滾動更新部署新版本。哪一個順序是正確的？',
      options: ['先新增欄位、再部署，舊版本下線後才刪舊欄位', '先刪除舊欄位、新增新欄位，再部署新版本', '先部署新版本，再新增新欄位，最後刪除舊欄位', '新增新欄位的同時刪除舊欄位，再用藍綠部署切換'],
      answer: 0, explanation: '這是擴充與收縮：擴充只新增欄位，讓新舊版本都能運作；部署完成、確定不再回滾到舊版本後，才收縮刪掉舊欄位。先刪舊欄位，還在執行的舊版本立刻失敗；先部署再新增，新版本一承接請求就找不到它需要的欄位；藍綠部署的兩套環境通常共用同一個資料庫，同時刪掉舊欄位，承接流量的藍色一樣會失敗。',
    },
    {
      id: 'cicd10-q-flag', prompt: '功能旗標（feature flag）在部署策略之外，多提供了什麼？',
      options: ['讓新版本的程式不需要部署，就能在正式環境執行', '取代金絲雀發布，讓部署不再需要任何閘門或監控', '讓資料庫的欄位可以直接改名，不必擴充與收縮', '程式先部署、功能之後才開放，有問題時關掉旗標'],
      answer: 3, explanation: '旗標把部署與發布分開：程式隨部署上線但先關閉，再逐步開放，出問題時關掉旗標就好，不必重新部署。旗標裡的程式仍然要部署，只是暫時不走那條路徑；它控制的是同一個版本裡的程式路徑，不能取代對整個版本的閘門與監控；資料庫結構變更還是要讓新舊程式都能運作，旗標不會改變這件事。',
    },
  ],
  devops: {
    rollouts: [
      {
        id: 'cicd10-recreate', title: '重建：先停舊版，再啟動新版',
        description: '第 0 分鐘停掉全部 6 個 v1，同時啟動 6 個 v2；v2 要 150 秒才就緒，這段時間沒有任何執行個體能服務。可以在策略選單換成其他策略比較。',
        scenario: recreate,
      },
      {
        id: 'cicd10-rolling', title: '滾動更新：maxSurge 1、maxUnavailable 0',
        description: '每次多開一個 v2，就緒後才移除一個 v1。修改 `maxSurge` 與 `maxUnavailable`，觀察完成的分鐘、同時執行的尖峰與丟棄的請求。',
        scenario: rolling,
      },
      {
        id: 'cicd10-blue-green', title: '藍綠部署：驗證 2 分鐘、保留藍色 5 分鐘',
        description: '綠色（v2）全部就緒後先驗證 2 分鐘，再把流量一次切過去；藍色（v1）保留 5 分鐘作為立即回滾的退路，閘門在這段時間判斷 v2 的錯誤率。',
        scenario: blueGreenScenario,
      },
      {
        id: 'cicd10-canary-pass', title: '金絲雀發布：正常的 v2（10% → 50% → 100%）',
        description: '每一步觀察 3 分鐘，閘門要求 v2 的錯誤率最多 5‰、至少 300 個請求。正常的 v2 三步都通過，最後移除 v1。',
        scenario: canaryPass,
      },
      {
        id: 'cicd10-canary-abort', title: '金絲雀發布：有錯的 v2（25% → 100%）',
        description: '同一個閘門，但這個 v2 的錯誤率是 30‰。第一步的觀察期間結束時閘門未通過，流量切回 v1。可以把策略換成藍綠部署或滾動更新，比較有多少錯誤到達使用者。',
        scenario: canaryAbort,
      },
      {
        id: 'cicd10-schema-break', title: '直接改名：部署開始時就刪掉舊欄位',
        description: 'v1 需要 `phone`、v2 需要 `contact_phone`。第 0 分鐘新增 `contact_phone` 的同時刪除 `phone`，接著以滾動更新（1／0）部署 v2。',
        scenario: schemaBreak,
      },
      {
        id: 'cicd10-schema-safe', title: '擴充、部署、收縮',
        description: '第 0 分鐘只新增 `contact_phone`（擴充），用同樣的滾動更新部署 v2；等 v1 全部下線、第 24 分鐘才刪除 `phone`（收縮）。',
        scenario: schemaSafe,
      },
      {
        id: 'cicd10-flag', title: '功能旗標：先部署、後開放',
        description: 'v2 帶著「新版座位圖」的程式以滾動更新上線，旗標一開始是 0%。第 21 分鐘開放 10% 的 v2 請求，這條路徑的錯誤率是 40‰；第 25 分鐘關回 0%，不需要重新部署。',
        scenario: flagged,
      },
    ],
    exercises: [
      {
        id: 'cicd10-x-dropped', kind: 'table', title: '誰丟了請求',
        statement: '同一個機群，比較三種做法在整個時間軸丟棄的請求：重建、`maxSurge` 0／`maxUnavailable` 1 的滾動更新，以及 `maxSurge` 1／`maxUnavailable` 0 的滾動更新。',
        blanks: [
          { id: 'recreate', label: '重建：丟棄的請求', query: { task: 'rollout', rollout: 'cicd10-recreate', metric: 'dropped' } },
          { id: 'r01', label: '滾動更新 0／1：丟棄的請求', query: { task: 'rollout', rollout: 'cicd10-rolling', metric: 'dropped', strategy: { kind: 'rolling', maxSurge: 0, maxUnavailable: 1 } } },
          { id: 'r10', label: '滾動更新 1／0：丟棄的請求', query: { task: 'rollout', rollout: 'cicd10-rolling', metric: 'dropped' } },
        ],
        hints: [
          '重建：新版本就緒前沒有執行個體服務。v2 從啟動到就緒是幾個整分鐘？',
          '滾動更新 0／1：同時只有 5 個可用，容量是多少？每分鐘差多少？',
          '數一數更新進行了幾分鐘：每換一個 v2 要等它就緒，可以在逐分鐘的表格裡核對。',
        ],
        explanation: '重建：v2 在第 3 分鐘才就緒，第 0–2 分鐘每分鐘 1,300 個請求全部丟棄，共 3,900 個。0／1：更新期間可用的只有 5 個，容量 1,250，每分鐘丟棄 50 個；一次換一個、每個要 3 分鐘就緒，6 個換完要 18 分鐘，共 900 個。1／0：先多開一個、就緒後才移除舊的，可用的永遠是 6 個，一個請求都沒有丟。',
        mistakes: [
          { answer: { recreate: '1300', r01: '900', r10: '0' }, why: '重建只算了一分鐘的停機：v2 要 ⌈150 ÷ 60⌉ = 3 分鐘才就緒' },
          { answer: { recreate: '3250', r01: '900', r10: '0' }, why: '把 150 秒當成 2.5 分鐘；模型以整分鐘計，第 3 分鐘才就緒' },
          { answer: { recreate: '3900', r01: '0', r10: '0' }, why: '以為少一個執行個體也夠：5 × 250 = 1,250，少於每分鐘 1,300 個請求' },
          { answer: { recreate: '3900', r01: '50', r10: '0' }, why: '只算了一分鐘的缺口；更新進行的每一分鐘都少 50 個' },
        ],
      },
      {
        id: 'cicd10-x-cost', kind: 'table', title: '藍綠部署的資源成本',
        statement: '比較藍綠部署（驗證 2 分鐘、保留藍色 5 分鐘）與滾動更新（1／0）各用了多少額外的執行個體分鐘，以及藍綠部署同時執行的尖峰是幾個執行個體。',
        blanks: [
          { id: 'bg', label: '藍綠部署：額外的執行個體分鐘', query: { task: 'rollout', rollout: 'cicd10-blue-green', metric: 'extra-instance-minutes' } },
          { id: 'rolling', label: '滾動更新 1／0：額外的執行個體分鐘', query: { task: 'rollout', rollout: 'cicd10-rolling', metric: 'extra-instance-minutes' } },
          { id: 'peak', label: '藍綠部署：同時執行的尖峰（個）', query: { task: 'rollout', rollout: 'cicd10-blue-green', metric: 'peak-instances' } },
        ],
        hints: [
          '額外的執行個體分鐘 = 每分鐘「執行中的數量 − 6」的正數部分加總；啟動中的也算執行中。',
          '藍綠：從第 0 分鐘啟動綠色，到藍色被移除的那一分鐘之前，每分鐘都多出 6 個。',
          '滾動 1／0：每分鐘多出 1 個，持續到最後一個 v1 被移除為止。',
        ],
        explanation: '藍綠部署在第 0 分鐘啟動 6 個綠色，第 3 分鐘就緒，驗證 2 分鐘後在第 5 分鐘切換，再保留藍色 5 分鐘，第 10 分鐘才移除藍色：第 0–9 分鐘每分鐘多 6 個，共 60 個執行個體分鐘，尖峰 12 個。滾動更新 1／0 在第 0–17 分鐘每分鐘多 1 個，共 18 個。藍綠部署用了三倍多的額外資源，換到的是一次切換與立即回滾。',
        mistakes: [
          { answer: { bg: '36', rolling: '18', peak: '12' }, why: '只算到切換為止；切換後藍色還保留 5 分鐘，這段時間一樣是兩倍' },
          { answer: { bg: '10', rolling: '18', peak: '12' }, why: '只數了有額外執行個體的分鐘數，沒有乘上每分鐘多出的 6 個' },
          { answer: { bg: '60', rolling: '1', peak: '12' }, why: '把「多開一個」當成總成本；它要乘上更新進行的分鐘數' },
          { answer: { bg: '60', rolling: '18', peak: '6' }, why: '尖峰要把藍色與綠色加起來；切換前後兩套環境同時在執行' },
        ],
      },
      {
        id: 'cicd10-x-abort', kind: 'table', title: '閘門擋下有錯的 v2',
        statement: '有錯的 v2 以 25% → 100% 的金絲雀發布，閘門要求錯誤率最多 5‰、至少 300 個請求。第 1 步的觀察期間，v2 承接了幾個請求、出現幾個錯誤？流量在第幾分鐘切回 v1？',
        blanks: [
          { id: 'requests', label: '第 1 步觀察期間 v2 的請求', query: { task: 'rollout', rollout: 'cicd10-canary-abort', metric: 'gate-requests', step: 1 } },
          { id: 'errors', label: '第 1 步觀察期間 v2 的錯誤', query: { task: 'rollout', rollout: 'cicd10-canary-abort', metric: 'gate-errors', step: 1 } },
          { id: 'at', label: '回滾的分鐘', query: { task: 'rollout', rollout: 'cicd10-canary-abort', metric: 'rolled-back-at' } },
        ],
        hints: [
          '25% 需要 ⌈6 × 25 ÷ 100⌉ = 2 個 v2；它們第幾分鐘就緒？就緒後才開始承接 25% 的流量。',
          '每分鐘 1,300 個請求的 25% 是多少？觀察 3 分鐘。',
          '判定在觀察期間最後一分鐘結束時，動作在下一分鐘開始時；可以看閘門判定表與逐分鐘表格的事件。',
        ],
        explanation: '第 0 分鐘啟動 2 個 v2，第 3 分鐘就緒，從這時起承接 25%，每分鐘 325 個；觀察第 3–5 分鐘，共 975 個請求。30‰ 的錯誤率累計出 29 個錯誤，29 × 1000 = 29,000 大於 5 × 975 = 4,875，未通過。第 5 分鐘結束時判定，第 6 分鐘流量歸零、移除 v2，回滾完成：有錯的版本只碰過 975 個請求。',
        mistakes: [
          { answer: { requests: '975', errors: '29', at: '5' }, why: '第 5 分鐘是觀察期間的最後一分鐘，它結束時才判定，動作在下一分鐘' },
          { answer: { requests: '975', errors: '29', at: '3' }, why: '以為 v2 一就緒就判定；要先觀察 3 分鐘' },
          { answer: { requests: '325', errors: '29', at: '6' }, why: '只算了一分鐘的請求；觀察期間是第 3–5 分鐘' },
          { answer: { requests: '3900', errors: '117', at: '6' }, why: '把每分鐘 1,300 個請求都算給 v2；第 1 步只承接 25%' },
        ],
      },
      {
        id: 'cicd10-x-p95', kind: 'number', title: '閘門看錯了指標',
        statement: '同樣是有錯的 v2（錯誤率 30‰、p95 190 ms）與 25% → 100% 的步驟，但閘門改成只檢查 p95 延遲：最多 250 ms、至少 300 個請求。整個時間軸裡，v2 承接的請求有幾個錯誤？（p95 閘門對這個 v2 每一步都通過，效果和取消「啟用閘門」相同，可以在探索器裡這樣模擬。）',
        blank: { id: 'errors-to', label: 'v2 的錯誤請求', query: { task: 'rollout', rollout: 'cicd10-canary-abort', metric: 'errors-to', gate: { metric: 'p95', max: 250, minRequests: 300 } } },
        hints: [
          '第 1 步通過後，第 2 步要再啟動 4 個 v2，它們就緒前 v2 仍然承接 25%。',
          '第 2 步通過後部署完成，之後的每一分鐘 v2 都承接全部 1,300 個請求，直到時間軸結束。',
          '把 v2 承接的請求加總，再乘上 30‰（錯誤是逐分鐘累計的，總數就是總請求 × 30 ÷ 1000 的整數部分）。',
        ],
        explanation: 'v2 在第 3–8 分鐘承接 25%（6 × 325 = 1,950 個），第 9 分鐘起承接 100%：第 9–11 分鐘觀察、第 12 分鐘完成，一直到第 29 分鐘共 21 × 1,300 = 27,300 個。總共 29,250 個請求，× 30‰ = 877.5，錯誤 877 個。同一個 v2 在錯誤率閘門下只造成 29 個錯誤：閘門沒有量測錯誤率，金絲雀的步驟就只是比較慢的全面上線。',
        mistakes: [
          { answer: { value: '29' }, why: '以為第 1 步之後就會停下；p95 閘門每一步都通過，部署會完成' },
          { answer: { value: '0' }, why: '以為有閘門就不會有錯誤到達使用者；閘門只看 p95，延遲沒有變差' },
          { answer: { value: '117' }, why: '只算了第 2 步觀察期間的錯誤；部署完成後 v2 仍繼續承接全部流量' },
        ],
      },
      {
        id: 'cicd10-x-exposure', kind: 'choice', title: '哪一種讓最少的錯誤到達使用者',
        statement: '同一個有錯的 v2（30‰）與同一個錯誤率閘門，分別用滾動更新（1／0）、藍綠部署（驗證 2 分鐘、保留藍色 5 分鐘）與金絲雀發布（25% → 100%，各 3 分鐘）部署。整個時間軸的錯誤請求（v1 與 v2 合計）哪一種最少？',
        query: { task: 'rollout-best', rollout: 'cicd10-canary-abort', metric: 'errors', candidates: [
          { id: 'rolling', strategy: rolling10 },
          { id: 'blue-green', strategy: blueGreen },
          { id: 'canary', strategy: canary([25, 3], [100, 3]) },
        ] },
        options: [
          { value: 'rolling', label: '滾動更新：一次只換一個，換得最慢最謹慎' },
          { value: 'blue-green', label: '藍綠部署：閘門一未通過就能立即切回藍色' },
          { value: 'canary', label: '金絲雀發布：先讓 25% 的流量試用' },
        ],
        hints: ['在有錯的 v2 探索器裡依序切換三種策略，比較總計卡片的「錯誤的請求」。', '模擬器的閘門不作用在滾動更新上。'],
        explanation: '金絲雀發布在第 6 分鐘回滾，v2 只承接了 975 個請求，合計 105 個錯誤。藍綠部署也會回滾，但回滾前的 5 分鐘裡全部流量都在 v2，合計 260 個。滾動更新沒有閘門，有錯的 v2 一路換完、承接到時間軸結束，合計 787 個。能立即回滾不等於影響小：關鍵是回滾之前有多少流量走過有錯的版本。',
        mistakes: [
          { answer: { choice: '1' }, why: '以為能立即回滾就影響最小；藍綠在觀察期間讓全部使用者都用 v2' },
          { answer: { choice: '0' }, why: '以為換得慢就安全；滾動更新沒有閘門，錯誤會擴散到全部執行個體' },
        ],
      },
      {
        id: 'cicd10-x-schema', kind: 'table', title: '改名的代價',
        statement: '比較「直接改名」與「擴充、部署、收縮」兩個情境：整個時間軸裡 v1 各有幾個錯誤請求？',
        blanks: [
          { id: 'break', label: '直接改名：v1 的錯誤', query: { task: 'rollout', rollout: 'cicd10-schema-break', metric: 'errors-from' } },
          { id: 'safe', label: '擴充、部署、收縮：v1 的錯誤', query: { task: 'rollout', rollout: 'cicd10-schema-safe', metric: 'errors-from' } },
        ],
        hints: [
          '直接改名時，v1 需要的 `phone` 從第 0 分鐘起就不存在：v1 承接的每個請求都失敗。',
          '在逐分鐘的表格裡，看 v1 每分鐘承接多少請求，一直加到最後一個 v1 下線。',
          '擴充與收縮的情境裡，`phone` 保留到 v1 下線之後，v1 只有它原本 2‰ 的錯誤。',
        ],
        explanation: '直接改名時，v1 從第 0 分鐘起每個請求都失敗，直到第 18 分鐘最後一個 v1 下線；滾動更新期間 v1 承接的 13,650 個請求全部是錯誤，超過這 18 分鐘流量的一半。擴充、部署、收縮的情境裡，v1 只有原本 2‰ 的 27 個錯誤；第 24 分鐘收縮時已經沒有 v1，所以不受影響。',
        mistakes: [
          { answer: { break: '0', safe: '27' }, why: '以為新增了 `contact_phone` 就沒事；同時刪掉的 `phone` 正是 v1 需要的' },
          { answer: { break: '23400', safe: '27' }, why: '把 18 分鐘的全部流量都算成 v1 的；v2 就緒後會分走越來越多請求' },
          { answer: { break: '13650', safe: '13650' }, why: '以為擴充與收縮也一樣會讓 v1 失敗；`phone` 一直保留到 v1 下線之後' },
        ],
      },
      {
        id: 'cicd10-x-bg-schema', kind: 'choice', title: '藍綠部署也躲不掉',
        statement: '「直接改名」的情境（第 0 分鐘新增 `contact_phone`、刪除 `phone`）改用藍綠部署（驗證 2 分鐘、保留藍色 5 分鐘）。整個時間軸裡，v1（藍色）有幾個錯誤請求？',
        query: { task: 'rollout', rollout: 'cicd10-schema-break', metric: 'errors-from', strategy: blueGreen },
        options: [
          { value: '0', label: '0 個' },
          { value: '6500', label: '6,500 個' },
          { value: '13650', label: '13,650 個' },
          { value: '1300', label: '1,300 個' },
        ],
        hints: ['藍色和綠色連到同一個資料庫。', '切換之前，誰承接全部流量？切換發生在第幾分鐘？'],
        explanation: '欄位在第 0 分鐘就被刪掉，而切換前（第 0–4 分鐘）承接全部流量的正是藍色的 v1，5 × 1,300 = 6,500 個請求全部失敗；第 5 分鐘切到綠色後，v1 不再承接流量。這時若綠色有問題，切回藍色也一樣全部失敗：兩套環境共用一個資料庫，藍綠部署沒有免除資料庫相容性的要求。',
        mistakes: [
          { answer: { choice: '0' }, why: '以為兩套環境互不影響；藍色與綠色共用同一個資料庫' },
          { answer: { choice: '2' }, why: '那是滾動更新的結果；藍綠部署在第 5 分鐘切換後，v1 就不再承接流量' },
          { answer: { choice: '3' }, why: '只算了第 0 分鐘；綠色要到第 5 分鐘才接手' },
        ],
      },
      {
        id: 'cicd10-x-plan-rolling', kind: 'rollout-plan', title: '不丟請求、又要快的滾動更新',
        statement: '替正常的 v2 設定滾動更新的 `maxSurge` 與 `maxUnavailable`：不能丟棄任何請求，同時執行的執行個體最多 8 個，並在第 10 分鐘以前完成。',
        plan: { rollout: 'cicd10-rolling', strategy: 'rolling', constraints: { maxDropped: 0, maxPeakInstances: 8, completeBy: 10 }, reference: { kind: 'rolling', maxSurge: 2, maxUnavailable: 0 } },
        hints: [
          '容量的餘裕不到一個執行個體：可用的少一個就會丟請求。',
          '要快，就要一次換多個；能多開幾個，由同時執行的上限決定。',
          '百分比會被取整：6 的 25% 對 maxSurge 是 2、對 maxUnavailable 是 1。',
        ],
        explanation: '`maxUnavailable` 必須是 0，可用的執行個體才永遠是 6 個、不丟請求；上限 8 個表示最多多開 2 個。`maxSurge` 2 讓每一輪換兩個，每輪等 3 分鐘就緒，三輪在第 9 分鐘完成。寫成 `33%`／`0%` 也一樣（6 × 33% = 1.98，進位為 2）。',
        mistakes: [
          { answer: { maxSurge: '1', maxUnavailable: '0' }, why: '一次只換一個，要到第 18 分鐘才完成' },
          { answer: { maxSurge: '1', maxUnavailable: '1' }, why: '可用的只剩 5 個時容量不足，會丟棄請求' },
          { answer: { maxSurge: '3', maxUnavailable: '0' }, why: '同時會有 9 個執行個體，超過上限 8 個' },
          { answer: { maxSurge: '25%', maxUnavailable: '25%' }, why: '取整後是 2／1，少一個可用時一樣會丟棄請求' },
        ],
      },
      {
        id: 'cicd10-x-plan-canary', kind: 'rollout-plan', title: '讓有錯的版本少傷到人',
        statement: '有錯的 v2（30‰）預設以 25% → 100% 發布，被閘門擋下時整個時間軸已經有 105 個錯誤請求（v1 本身的 2‰ 大約就占了 77 個）。閘門不變（錯誤率最多 5‰、每步至少 300 個請求），重新設定金絲雀的步驟，讓閘門在足夠的樣本上判定失敗而回滾，而且整個時間軸的錯誤請求最多 90 個。',
        plan: { rollout: 'cicd10-canary-abort', strategy: 'canary', constraints: { outcome: 'rolled-back', maxErrors: 90, gateFailed: true }, reference: canary([10, 3], [50, 3], [100, 3]) },
        hints: [
          '錯誤主要來自 v2 在回滾前承接的請求：第一步的比例越小，碰到 v2 的人越少。',
          '第一步的觀察期間要收集到至少 300 個請求，閘門才會真的依錯誤率判定，不是因為樣本不足才擋下。',
          '比例 × 1,300 × 觀察分鐘 ≥ 300；例如 10% 要觀察 3 分鐘。',
        ],
        explanation: '第一步改成 10%（1 個 v2）、觀察 3 分鐘：v2 承接 390 個請求、出現 11 個錯誤，閘門在第 6 分鐘回滾，合計 88 個錯誤。後面的步驟（50%、100%）在這次部署裡用不到，但對正常的 v2 是必要的，比例逐步擴大也比直接跳到 100% 安全。比例太小或觀察太短時會「樣本不足」，同樣會回滾、錯誤也更少，但那不是閘門依錯誤率判斷的結果，這樣的步驟連健康的 v2 也會擋下，所以這題要求回滾必須是閘門在足夠的樣本上判定失敗；可以在正常的 v2 探索器裡用同樣的步驟試試看。',
        mistakes: [
          { answer: { steps: '25/3, 100/3' }, why: '這是原本的設定：25% 讓 975 個請求碰到 v2，錯誤超過上限' },
          { answer: { steps: '50/3, 100/3' }, why: '第一步太大，回滾前已經有一半的流量走過有錯的版本' },
          { answer: { steps: '100/3' }, why: '一步就給 100%，等於沒有金絲雀，全部使用者都碰到錯誤' },
          { answer: { steps: '10/3, 50/3' }, why: '最後一步要把 100% 的流量交給新版本，步驟才合法' },
          { answer: { steps: '5/3, 100/3' }, why: '5% 觀察 3 分鐘只收到 195 個請求，樣本不足就回滾，閘門沒有真的依錯誤率判定' },
        ],
      },
    ],
  },
};
