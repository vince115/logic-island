import type { BackupPlan, ReplicationScenario } from '@/lib/ops/sim';
import type { LessonContent } from '../schema';

const sql = String.raw;

/**
 * The backup plan of sections 2 and 3: a full backup every day at 0:00 (minutes 0 and 1440) and an incremental one
 * every six hours; restoring a full backup takes 40 minutes, an incremental one 10, an hour of archived log 6.
 */
const dailyPlan: BackupPlan = { fullAt: [0, 1440], incrementalAt: [360, 720, 1080, 1800, 2160], restore: { full: 40, incremental: 10, logPerHour: 6 } };

/** Section 4: a member's points change on the primary; the application reads from an asynchronous replica. */
const pointsScenario: ReplicationScenario = {
  mode: 'async', lag: 2, initial: { points: 100 },
  writes: [{ at: 10, key: 'points', value: 150 }],
  reads: [
    { at: 10, key: 'points', from: 'replica', label: '兌換後立刻顯示點數（複本）' },
    { at: 10, key: 'points', from: 'primary', label: '同一秒讀主機' },
    { at: 11, key: 'points', from: 'replica', label: '1 秒後重新整理（複本）' },
    { at: 12, key: 'points', from: 'replica', label: '2 秒後重新整理（複本）' },
  ],
};

/** Section 5: the primary fails at second 22; two writes have not reached the replica yet. */
const failoverScenario: ReplicationScenario = {
  mode: 'async', lag: 3, initial: { A: 100, B: 100 },
  writes: [{ at: 5, key: 'A', value: 80 }, { at: 18, key: 'B', value: 130 }, { at: 20, key: 'A', value: 60 }, { at: 21, key: 'B', value: 150 }],
  reads: [
    { at: 21, key: 'A', from: 'primary', label: '第 21 秒讀 A（主機）' },
    { at: 21, key: 'A', from: 'replica', label: '第 21 秒讀 A（複本）' },
  ],
  failoverAt: 22,
};

/** DB19 Backup, Replication, and Scaling. SQL + architecture-diagram lesson (Phase F.1d): SQL runs in tests/curriculum-sql.test.ts, backups, replication and exercises in tests/curriculum-db.test.ts. */
export const DB19: LessonContent = {
  lessonId: 'DB19',
  motivation: 'DB14 的交易保證「提交了就不會消失」，前提是存放資料的那顆硬碟還在。硬碟會壞、機房會停電，更常見的是人為錯誤：一個忘了 `WHERE` 的 `DELETE` 正確地提交，持久性忠實地把它保存下來。另一方面，服務成長之後，一台資料庫主機會先在讀取上撐不住，接著是寫入與容量。本課處理這兩件事。先用 RPO（最多可以遺失多少資料）與 RTO（最多可以停多久）兩個目標，在備份模擬器裡比較完整備份、增量備份與日誌封存的時間點復原，拖動故障時間，看還原步驟、遺失的資料與還原時間怎麼變；再用複寫模擬器看主從複寫的延遲如何讓使用者讀不到自己剛寫入的資料，以及非同步複寫在切換主機時怎麼遺失已提交的寫入；最後在 SQL 練習場用 30,000 筆訂單計算範圍分割與雜湊分片的資料分布，親眼看到一個壞的分片鍵造成的熱點，以及增加分片時要搬多少資料。學完之後，給你一個服務情境，你能寫出它的備份、複寫與擴展計畫，並說明故障時要怎麼還原、會遺失什麼。',
  sections: [
    {
      id: 'failures-and-objectives', title: '會出什麼事：故障種類與 RPO、RTO',
      blocks: [
        { type: 'p', text: '規劃之前，先列出要防的是什麼。資料庫會遇到的故障大致有下面幾類，每一類需要的保護不一樣：' },
        { type: 'table', head: ['故障', '例子', '複本（第 4、5 節）有沒有用', '備份（第 2、3 節）有沒有用'], rows: [
          ['硬體故障', '硬碟損毀、主機當機', '有：切換到複本，幾乎不停機', '有：但要花時間還原'],
          ['人為或程式錯誤', '`DELETE` 忘了 `WHERE`、錯誤的部署把資料改壞', '沒有：錯誤的修改也會複寫過去', '有：還原到出錯之前的時間點'],
          ['整個機房或地區停擺', '停電、火災、網路中斷', '只有複本放在另一個地點時才有', '只有備份存放在另一個地點時才有'],
          ['惡意破壞', '勒索軟體加密或刪除資料', '沒有：破壞同樣會複寫過去', '有：前提是備份本身沒有被一起破壞（離線或不可修改的副本）'],
        ] },
        { type: 'p', text: '評估一個備份或高可用方案，業界用兩個目標：' },
        { type: 'table', head: ['目標', '問的問題', '由什麼決定', '例子'], rows: [
          ['RPO（Recovery Point Objective，復原點目標）', '故障時，最多可以遺失多久的資料？以時間計算', '能還原到的最後一刻，和故障時間的差距：備份的間隔、日誌封存的間隔、複寫的延遲', 'RPO 15 分鐘：故障前 15 分鐘以內的寫入可以接受遺失'],
          ['RTO（Recovery Time Objective，復原時間目標）', '故障後，最多可以停機多久才恢復服務？', '發現故障、決定處置、還原或切換、驗證並重新導向流量的總時間', 'RTO 1 小時：故障後 1 小時內服務要恢復'],
        ] },
        { type: 'p', text: 'RPO 與 RTO 是事先訂下的目標，由業務決定：一個每秒都有付款的服務，和一個每天更新一次的部落格，可以接受的遺失與停機完全不同。方案「實際」能做到的遺失與停機時間，要拿去和目標比較；本課的模擬器算的就是實際值。兩個目標越接近 0，成本越高：RPO 接近 0 需要同步複寫或極頻繁的日誌封存，RTO 接近 0 需要隨時待命的複本與自動切換。' },
        { type: 'callout', tone: 'note', title: '本課的模擬器是教學模型', text: '備份與複寫模擬器只用整數的分鐘與秒，還原每一步的時間由範例給定，不代表任何產品的實際速度。它示範的是推理方式：從哪一份備份開始、接上哪些、最後能回到哪一刻。真實系統還要考慮備份檔是否完好、網路頻寬、資料量等等。' },
      ],
    },
    {
      id: 'backup-strategies', title: '完整、增量與差異備份',
      blocks: [
        { type: 'p', text: '完整備份（full backup）複製當下的全部資料，自己就能還原；但每次都複製全部，耗時又佔空間，通常一天或一週才做一次。在兩次完整備份之間，用比較小的備份補上變更：' },
        { type: 'table', head: ['種類', '這一份備份包含', '備份的時間與空間', '還原到這一份時需要'], rows: [
          ['完整備份', '當下的全部資料', '最多', '只要它自己'],
          ['增量備份（incremental）', '自上一次任何備份（完整或增量）以來的變更', '最少：只有這段期間的變更', '最近的完整備份，加上之後依序的每一份增量備份，一份都不能少'],
          ['差異備份（differential）', '自上一次完整備份以來的所有變更', '越接近下一次完整備份越大', '最近的完整備份，加上最新的一份差異備份'],
        ] },
        { type: 'p', text: '本課的模擬器只有完整與增量兩種，增量的定義就是上表：自上一次任何備份以來的變更。所以還原時是一條鏈：完整備份 → 第一份增量 → 第二份增量 → …，中間任何一份壞了，之後的都接不上。差異備份用較大的備份換較短的鏈。注意各家工具對「增量」「差異」的用詞不完全一致，使用時要看它的說明。' },
        { type: 'p', text: '另一個分法是備份的形式。邏輯備份（logical backup）把資料匯出成 SQL 敘述或其他格式，例如 PostgreSQL 的 `pg_dump`、MySQL 的 `mysqldump`，可以跨版本還原、只還原一張表，但大型資料庫匯出與重新匯入（含重建索引）都很慢。實體備份（physical backup）直接複製資料檔，還原快，但通常要相同的 DBMS 版本與平台。' },
        { type: 'p', text: '下面的範例：每天 0:00 完整備份（第 0、1440 分鐘），每 6 小時一份增量備份；沒有封存日誌。故障發生在第 1437 分鐘（23:57），也就是下一次完整備份的前 3 分鐘。拖動故障時間，看還原步驟怎麼變：' },
        { type: 'example', id: 'bk-before-full' },
        { type: 'p', text: '還原要從 0:00 的完整備份開始，依序接上 6:00、12:00、18:00 三份增量備份，最多回到 18:00：遺失 357 分鐘、將近 6 小時的資料，還原約需 70 分鐘（40 + 3 × 10）。故障就在下一次備份之前，正是最壞的情況：沒有日誌封存時，實際遺失的資料最多可達兩次備份之間的整段間隔。把故障時間拖到 1440 之後，只需要新的完整備份一份，還原時間也縮短成 40 分鐘。' },
        { type: 'callout', tone: 'tip', title: '沒有試過還原的備份不算備份', text: '備份檔可能損壞、缺了一份增量、少了加密金鑰，或還原步驟根本沒人會做；這些都要在真的故障之前發現。定期把備份還原到另一台機器，量一次實際花的時間（這才是 RTO 的依據），並確認資料完整。常見的經驗法則是 3-2-1：至少 3 份資料副本、存在 2 種不同的媒體、其中 1 份放在另一個地點。' },
      ],
    },
    {
      id: 'pitr', title: '日誌封存與時間點復原',
      blocks: [
        { type: 'p', text: 'DB14 說過，每次提交之前，修改都先寫進 write-ahead log。這份日誌本身就是一份連續的變更紀錄：如果把它一段一段複製到別的地方保存（持續封存，continuous archiving），還原時就能先還原一份完整備份（以及之後的增量），再重播封存的日誌，一路重做到日誌裡的任何一刻。這就是時間點復原（point-in-time recovery，PITR）。' },
        { type: 'p', text: '下面的範例用同一份備份計畫，再加上每 5 分鐘封存一段日誌。故障發生在第 1443 分鐘（隔天 0:03，頁面顯示 24:03），新的完整備份才做完 3 分鐘：' },
        { type: 'example', id: 'bk-after-full' },
        { type: 'p', text: '只需要 24:00 的完整備份，遺失 3 分鐘：最後一段日誌（0:00 到 0:05）還沒封存，就跟著主機一起消失。取消勾選「持續封存日誌」，結果一樣，因為封存的日誌還沒有比完整備份新。把兩個範例的故障時間拉到相同的位置比較，差別就出來了（下表由模擬器計算）：' },
        { type: 'table', head: ['故障時間', '只有完整＋增量', '另外每 5 分鐘封存日誌'], rows: [
          ['第 1437 分鐘（23:57）', '還原到 18:00，遺失 357 分鐘，還原約 70 分鐘', '還原到 23:55，遺失 2 分鐘，還原約 106 分鐘'],
          ['第 1443 分鐘（24:03）', '還原到 24:00，遺失 3 分鐘，還原約 40 分鐘', '還原到 24:00，遺失 3 分鐘，還原約 40 分鐘'],
          ['第 1502 分鐘（25:02）', '還原到 24:00，遺失 62 分鐘，還原約 40 分鐘', '還原到 25:00，遺失 2 分鐘，還原約 46 分鐘'],
        ] },
        { type: 'p', text: '有了日誌封存，實際遺失的資料不再取決於備份的間隔，而是封存的間隔（這裡最多 5 分鐘）。代價是還原時間：23:57 的故障要重播將近 6 小時的日誌，還原從 70 分鐘變成 106 分鐘。想同時縮短 RTO，就要更常做完整或增量備份，讓需要重播的日誌變短。' },
        { type: 'p', text: '時間點復原真正的威力，在於可以停在任何一刻，而不只是「最新」。第 1 節的人為錯誤：10:02 有人執行了沒有 `WHERE` 的 `DELETE`，複本早就跟著刪了；這時把備份還原到另一台機器，重播日誌到 10:01:59 停下，就得到誤刪之前的資料，再把需要的資料搬回正式環境。' },
        { type: 'table', head: ['系統', '完整備份', '時間點復原（PITR）'], rows: [
          ['PostgreSQL', '`pg_dump`（邏輯備份）；`pg_basebackup`（實體的基礎備份）', '開啟 WAL 封存（`archive_mode`、`archive_command`），還原基礎備份後重播封存的 WAL，可用 `recovery_target_time` 指定停下的時間'],
          ['MySQL', '`mysqldump`（邏輯備份）或實體備份工具', '保留二進位日誌（binlog），還原備份後用 `mysqlbinlog` 重播到指定的時間或位置'],
          ['SQLite', '整個資料庫就是一個檔案：用命令列的 `.backup` 或 SQL 的 `VACUUM INTO` 產生一致的副本', '沒有內建的日誌封存與時間點復原'],
        ] },
        { type: 'callout', tone: 'note', title: 'SQLite：備份一個檔案（示意，網站未執行）', text: 'SQLite 是嵌入在應用程式裡的函式庫，沒有伺服器，整個資料庫是一個檔案。命令列工具的 `sqlite3 shop.db ".backup shop-backup.db"` 使用 SQLite 的線上備份 API，在資料庫使用中也能得到一致的副本；`VACUUM INTO \'shop-backup.db\';` 是一般的 SQL 敘述（SQLite 3.27 起），任何驅動程式都能執行，產生一份重新整理過的副本。不要在程式寫入時直接複製資料庫檔：可能複製到寫到一半的內容，WAL 模式下還有尚未寫回的 `-wal` 檔。練習場的資料庫放在這個頁面的記憶體裡，備份出來的檔案也一樣在記憶體裡、重新整理就消失，所以這裡只列出指令，不在練習場示範。' },
        { type: 'callout', tone: 'note', title: '雲端的託管資料庫', text: '雲端平台的託管資料庫服務，通常把自動備份、時間點復原、唯讀複本與自動切換做成可以勾選的選項。原理和本課相同：你仍然要決定 RPO、RTO，知道備份保留多久、存放在哪裡，並實際演練還原。本課不介紹特定平台的操作。' },
      ],
    },
    {
      id: 'replication', title: '主從複寫與讀寫分離',
      blocks: [
        { type: 'p', text: '複寫（replication）讓另一台主機持續保有一份幾乎相同的資料。最常見的是主從（primary-replica）架構：所有寫入都送到主資料庫（primary），主資料庫把日誌串流給一台或多台複本（replica），複本依序重做，並且只接受讀取。複本的用途有兩個：主機故障時接手（第 5 節），以及分擔讀取。' },
        { type: 'table', head: ['', '非同步複寫（asynchronous）', '同步複寫（synchronous）'], rows: [
          ['`COMMIT` 什麼時候回報成功', '主機寫好自己的日誌就回報，不等複本', '要等複本確認收到（依設定，可能還要等它套用）才回報'],
          ['複本落後主機', '會：落後的時間叫複寫延遲（replication lag），平常很短，主機忙碌或網路變慢時會變長', '已回報成功的提交都已經在複本上；是否已經能在複本上讀到，依產品與設定而定（本課模擬器的同步模式假設讀得到）'],
          ['主機突然故障', '還沒傳到複本的已提交寫入會遺失', '已回報成功的寫入都在複本上'],
          ['代價', '幾乎沒有額外的提交延遲', '每次提交多等一趟到複本的往返；複本故障或網路中斷時，提交可能一直等待，除非設定允許退回非同步'],
        ] },
        { type: 'p', text: '讀寫分離（read/write splitting）：應用程式把寫入與需要最新資料的讀取送到主機，其他讀取（商品列表、報表）送到複本。讀取多半遠多於寫入，所以加複本是擴展讀取最簡單的方法；但每一台複本都要重做全部的寫入，複本再多，也分擔不了寫入。' },
        { type: 'p', text: '代價是複本上的資料可能是舊的。下面的範例：會員在第 10 秒兌換點數，主機上的點數從 100 變成 150；複本延遲 2 秒。應用程式從複本讀點數來顯示：' },
        { type: 'example', id: 'rep-read-your-writes' },
        { type: 'p', text: '模擬器的結果：第 10 秒從複本讀到 100（過時），同一秒讀主機是 150；1 秒後重新整理，複本仍是 100；到第 12 秒，寫入到達複本，才讀到 150。這裡有兩個常見的問題：' },
        { type: 'list', items: [
          '讀不到自己的寫入（違反 read-your-writes）：使用者剛兌換完，頁面卻顯示舊的點數，以為兌換失敗而重按一次。',
          '時光倒流（違反單調讀取，monotonic reads）：同一個使用者先讀到主機的 150，下一次請求被分到複本讀到 100；有好幾台延遲不同的複本時更容易發生。',
        ] },
        { type: 'p', text: '常見的處理方式：使用者自己剛寫入的資料（例如寫入後幾秒內，或「我的帳戶」這類頁面）一律從主機讀；或記下這次寫入在日誌中的位置，等複本追到那個位置再從它讀；同一個使用者固定讀同一台複本，至少不會時光倒流。把複寫方式切到「同步」，四次讀取都是 150，代價就是上表最後一列。' },
        { type: 'p', text: '非同步複本「暫時是舊的、沒有新的寫入時終究會追上」，這種保證叫最終一致性（eventual consistency）；DB18 介紹 NoSQL 資料模型與 CAP 取捨時，會從分散式系統的角度再談它。' },
        { type: 'callout', tone: 'note', title: 'PostgreSQL 與 MySQL 的複寫', text: 'PostgreSQL 的串流複寫（streaming replication）把 WAL 傳給備用伺服器（standby），開啟 hot standby 後可在上面執行唯讀查詢；預設是非同步，設定 `synchronous_standby_names` 後提交會等待指定的備用伺服器，而 `synchronous_commit` 決定等到哪一步（例如 `remote_apply` 要等備用伺服器套用、讀得到才回報）。MySQL 的複寫以 binlog 為基礎，預設非同步，另有半同步（semi-synchronous）選項：提交要等至少一台複本確認收到。SQLite 沒有伺服器，也沒有內建的網路複寫。' },
      ],
    },
    {
      id: 'failover', title: '故障切換與高可用',
      blocks: [
        { type: 'p', text: '高可用（high availability）的目標是故障時服務很快恢復。主機故障時，把一台複本升級成新的主機（故障切換，failover），再讓應用程式改連它。切換通常比從備份還原快得多：資料已經在複本上，只要偵測故障、升級、改變連線的去向。但非同步複寫有一個代價：' },
        { type: 'example', id: 'rep-failover' },
        { type: 'p', text: '複寫延遲 3 秒。第 20 秒的 A = 60 與第 21 秒的 B = 150 都已經在主機上提交，使用者也收到成功的回應，但要到第 23、24 秒才會到達複本。主機在第 22 秒故障，複本升級後是 A = 80、B = 130：這兩筆已提交的寫入遺失了。切換到「同步」，它們在提交時就已經在複本上，切換後是 A = 60、B = 150，沒有遺失。非同步複寫的實際 RPO 大約就是切換那一刻的複寫延遲。' },
        { type: 'p', text: '切換的步驟，以及每一步會吃掉多少 RTO：' },
        { type: 'list', ordered: true, items: [
          '偵測故障：監控發現主機一段時間沒有回應。等太久，停機變長；判斷太快，網路短暫抖動也會誤判。',
          '選出最新的複本：有好幾台複本時，選落後最少的那台，遺失最少。',
          '升級複本：讓它開始接受寫入。',
          '重新導向：應用程式改連新的主機，例如更新連線位址或由中介的代理程式轉送。',
          '隔離舊主機：確保舊主機就算恢復，也不會再接受寫入。',
        ] },
        { type: 'callout', tone: 'warning', title: '腦分裂（split brain）', text: '如果舊主機其實沒有壞，只是和監控之間的網路斷了，切換後就會有兩台主機同時接受寫入，各自的資料分岔，事後很難合併。所以自動切換的系統會先確認舊主機已經停止寫入（隔離，fencing），或要多數節點同意才切換。' },
        { type: 'callout', tone: 'warning', title: '複寫不是備份', text: '複本忠實地重做主機上的每一個修改，包括誤刪與被改壞的資料，而且通常在幾秒內就完成。複本保護的是硬體故障與停機時間（RTO），不能把資料帶回錯誤發生之前（第 3 節的時間點復原才能）。一個完整的方案兩者都要。' },
      ],
    },
    {
      id: 'scaling', title: '垂直擴展、分割與分片',
      blocks: [
        { type: 'p', text: '服務成長時，按照代價由低到高，有這幾種做法：' },
        { type: 'table', head: ['做法', '怎麼做', '擴展了什麼', '代價與限制'], rows: [
          ['垂直擴展（scale up）', '換一台更大的主機：更多 CPU、記憶體、更快的磁碟', '全部，而且應用程式不用改', '有上限，越大越貴；仍然只有一台'],
          ['唯讀複本（第 4 節）', '加複本，讀取分到複本', '讀取', '寫入與容量沒有擴展；要處理複寫延遲'],
          ['分割（partitioning）', '同一個資料庫裡，把一張大表依某個欄位切成幾個部分', '單一大表的管理與查詢：查詢只掃需要的部分，舊資料整個部分直接卸下', '仍然在同一台主機上'],
          ['分片（sharding）', '依分片鍵（shard key）把資料分散到好幾台主機，每台只存一部分', '寫入、容量與讀取都能隨主機數增加', '跨分片的查詢、JOIN 與交易變得困難；分片鍵很難事後更改'],
        ] },
        { type: 'p', text: '本課的 SQL 練習場用 `sales` 資料：30,000 筆訂單，日期從 2025-01-01 到 2026-10-02。SQLite 沒有分割或分片的功能，但「每一列會被放到哪裡」只是一個由欄位算出來的值，用 SQL 就能算出分布。先看範圍分割：依 `ordered_on` 每半年一個分割。' },
        { type: 'example', id: 'sql-range-partition' },
        { type: 'p', text: '前三個分割各約 8,500 筆；`2026H2` 只有 4,404 筆，因為資料只到 10 月 2 日，它是還在增加的「目前分割」。範圍分割的好處是依時間查詢時只需要讀相關的分割（分割修剪，partition pruning），而過期的資料可以整個分割直接卸下，不必一列一列刪除。' },
        { type: 'callout', tone: 'note', title: 'PostgreSQL 的宣告式分割（示意，網站未執行）', text: '在 PostgreSQL 裡，同樣的分割可以寫成 `CREATE TABLE orders (…) PARTITION BY RANGE (ordered_on);`，再為每半年建立一個分割，例如 `CREATE TABLE orders_2025h1 PARTITION OF orders FOR VALUES FROM (\'2025-01-01\') TO (\'2025-07-01\');`（下限包含、上限不包含）。查詢仍然寫 `orders`，由資料庫決定要讀哪些分割。MySQL 也支援分割，語法不同。SQLite 沒有這個功能。' },
        { type: 'p', text: '分片把資料分到不同的主機。最常見的是雜湊分片：對分片鍵算一個雜湊值，再對分片數取餘數。下面直接用 `customer_id % 4` 當成分片編號（真實系統會先算雜湊，讓連續的 id 也打散）：' },
        { type: 'example', id: 'sql-hash-shard' },
        { type: 'p', text: '四個分片各 7,500 筆訂單、500 位顧客，非常平均；而且同一位顧客的訂單全部在同一個分片上，「查某位顧客的訂單」只要問一台主機。' },
      ],
    },
    {
      id: 'shard-key', title: '分片鍵的選擇：熱點與重新分片',
      blocks: [
        { type: 'p', text: '分片鍵決定了每一列放在哪裡，也決定了哪些查詢只要問一個分片。好的分片鍵：' },
        { type: 'list', items: [
          '值很多（高基數）：分片數不能超過分片鍵不同值的個數。',
          '資料與流量都平均：不只是資料量平均，「正在被寫入、被讀取」的資料也要平均。',
          '符合最常見的查詢：大部分查詢的條件裡都有分片鍵，才能只問一個分片。',
        ] },
        { type: 'p', text: '依日期做範圍分片，資料總量看起來不差（上一節的四個範圍），流量卻完全不平均：新的訂單永遠落在最新的範圍。下面比較最近一個月（2026-09-01 以後）的 1,500 筆訂單，在「依日期的四個範圍」與「`customer_id % 4`」下各落在哪個分片：' },
        { type: 'example', id: 'sql-hot-spot' },
        { type: 'p', text: '依日期分片時，最近一個月的 1,500 筆全部落在分片 3，另外三台主機完全沒有新的寫入：這就是熱點（hot spot）。依 `customer_id` 分片，分別是 375、376、375、374 筆。同樣的問題也出現在任何只會增加的鍵，例如自動遞增的訂單 id 做範圍分片。若只是在同一台主機上依日期分割，就沒有這個問題：寫入本來就都由這台主機處理，分割只是為了方便管理與查詢。' },
        { type: 'p', text: '另一種壞的分片鍵是值太少，或分布本來就不平均。例如用訂單狀態 `status`：' },
        { type: 'example', id: 'sql-low-cardinality' },
        { type: 'p', text: '只有三個值，最多只能分成三片，而且 `shipped` 一片就佔了 81.4%。另外也要小心少數特別大的鍵值（例如一位下了大量訂單的企業客戶）：雜湊再平均，同一個鍵值的資料仍然全部在同一個分片上。' },
        { type: 'p', text: '查詢的條件沒有分片鍵時，例如「台北市顧客上個月的訂單」，就要問每一個分片再合併結果（scatter-gather），比單一主機慢、也更容易受最慢的那台拖累。跨分片的 JOIN 要在應用程式或中介層組合，跨分片的交易需要分散式交易的協定（例如兩階段提交），成本高得多。所以設計分片時，會盡量讓一起查詢、一起修改的資料（一位顧客和他的訂單）放在同一個分片。' },
        { type: 'p', text: '最後，分片數會變。用 `customer_id % n` 時，n 一改，大部分資料的分片編號都跟著變：' },
        { type: 'example', id: 'sql-reshard' },
        { type: 'p', text: '從 4 片變成 8 片，有 15,000 筆（一半）要搬家；從 4 片變成 5 片，竟然有 24,000 筆（80%）要搬，雖然新的那一片只需要分到五分之一的資料。實務上常用兩種方法減少搬動：一致性雜湊（consistent hashing），加一台主機時只有約 1/n 的資料要移動；或一開始就切成很多個邏輯分片（例如 256 個），再把邏輯分片分配給主機，擴充時整個邏輯分片搬到新主機，分片鍵到邏輯分片的對應永遠不變。' },
        { type: 'callout', tone: 'note', title: '誰負責把查詢送到對的分片', text: '可以由應用程式自己計算，也可以由一個中介的路由層負責；有些資料庫內建分片，例如 MongoDB 依 shard key 分配資料。關聯式資料庫常靠擴充套件或中介層做到分片。不論哪一種，分片鍵的選擇都一樣重要。' },
      ],
    },
    {
      id: 'plan', title: '為成長中的服務規劃備份與擴展',
      blocks: [
        { type: 'p', text: '把前面的工具組合起來。以一家線上商店為例，每個階段先問「最怕什麼」，再選最便宜、足夠的做法；不要一開始就分片，複雜度本身就是故障的來源。' },
        { type: 'table', head: ['階段', '狀況', '備份', '複寫與高可用', '擴展'], rows: [
          ['起步', '一台資料庫主機，每天幾百筆訂單', '每天完整備份，存放在另一個地點；開啟日誌封存，RPO 幾分鐘', '暫時沒有；RTO 等於還原時間，先演練一次量出來', '垂直擴展就夠了'],
          ['成長', '讀取變多，停機一小時就有大量客訴', '同上，再加上定期的還原演練', '加一台非同步複本，可自動切換：RTO 降到幾分鐘', '商品列表、報表改讀複本；「我的訂單」讀主機'],
          ['大型', '訂單表大到維護困難，寫入接近一台主機的上限', '同上；備份與還原的時間要重新量', '每一個分片各自有複本與切換', '訂單表依日期分割；接著依 `customer_id` 分片'],
        ] },
        { type: 'p', text: '寫一份計畫時，依序回答這幾個問題：' },
        { type: 'list', ordered: true, items: [
          '目標：這個服務的 RPO 與 RTO 各是多少？哪些資料一筆都不能少（付款），哪些可以重建（快取、搜尋索引）？',
          '備份：完整與增量（或差異）備份多久一次、保留多久、存在哪裡？要不要日誌封存（RPO 低於備份間隔時一定要）？誰、多久演練一次還原？',
          '複寫：要不要複本？非同步或同步？哪些讀取可以接受舊資料、哪些必須讀主機？切換是自動還是手動，怎麼避免腦分裂？',
          '擴展：瓶頸是讀取、寫入還是容量？依序考慮垂直擴展、唯讀複本、分割，最後才是分片；分片鍵是否高基數、流量平均、符合主要查詢？',
          '故障處置手冊：每一種故障各寫下步驟，例如下面這份。',
        ] },
        { type: 'p', text: '「主機硬碟損毀、複本也無法使用」的還原步驟，正是備份模擬器裡的那一串：' },
        { type: 'list', ordered: true, items: [
          '停止寫入，避免應用程式把資料寫到不該寫的地方，並記下故障時間。',
          '在新主機上還原最近的完整備份，依序套用之後的每一份增量備份。',
          '重播封存的日誌：到最後一段封存的日誌（最新），或停在錯誤發生之前（人為錯誤時）。',
          '驗證資料：筆數、最後一筆訂單的時間、關鍵的總額，與預期比對。',
          '把應用程式指向新主機，恢復服務；告知相關的人遺失了哪段時間的資料，必要時從其他來源（金流紀錄、日誌）補回。',
        ] },
        { type: 'callout', tone: 'tip', title: '先在模擬器裡演練', text: '在第 2、3 節的備份範例拖動故障時間，對每一個時間點先在紙上寫出還原步驟、能回到哪一刻、遺失多少，再看模擬器的答案；下面的練習也用同一個模擬器檢查。' },
      ],
    },
  ],
  examples: [],
  exercises: [],
  quiz: [
    {
      id: 'q-rpo-rto', prompt: '一個服務每天 0:00 做一次完整備份，沒有其他備份，也沒有封存日誌；還原一次完整備份要 2 小時。某天 23:30，資料庫主機的硬碟損毀，沒有複本。最可能的結果是？',
      options: [
        '遺失約 30 分鐘的資料：下一次備份就在 30 分鐘後',
        '遺失約 23.5 小時的資料，服務至少停擺 2 小時',
        '不會遺失資料：每天都有備份',
        '遺失約 2 小時的資料，服務停擺約 23.5 小時',
      ],
      answer: 1, explanation: '能還原到的最後一刻是當天 0:00 的完整備份，故障在 23:30，之間的寫入全部遺失：實際遺失約 23.5 小時（和 RPO 比較的是這個數字）。還原要 2 小時，再加上發現故障、準備新主機的時間，停機至少 2 小時（和 RTO 比較）。「30 分鐘」是把下一次備份當成能救回資料，但它還沒做；「不會遺失」忽略了備份之後的寫入；最後一個選項把資料遺失與停機時間對調了。',
    },
    {
      id: 'q-incremental-chain', prompt: '週日 0:00 做完整備份，週一到週六每天 0:00 做增量備份（本課的定義：自上一次任何備份以來的變更）。週四 15:00 主機故障，沒有封存日誌。要還原到能回到的最新時刻，需要哪些備份？',
      options: [
        '只要週日的完整備份',
        '週日的完整備份，加上週四的增量備份',
        '只要週四的增量備份',
        '週日的完整備份，依序加上週一、週二、週三、週四的增量備份',
      ],
      answer: 3, explanation: '每一份增量備份只包含自上一次備份以來的變更，週四的那一份只有週三 0:00 到週四 0:00 的變更，所以要從週日的完整備份開始，依序接上週一到週四的每一份，能回到週四 0:00，遺失 15 小時。「完整加週四」是差異備份的還原方式（差異備份包含自完整備份以來的所有變更）；「只要週日」會多遺失四天；增量備份自己不包含完整的資料，無法單獨還原。',
    },
    {
      id: 'q-delete-recovery', prompt: '10:02 有人在正式環境執行了下面的敘述（自動提交）。架構：一台主機、一台同步複寫的複本；每天 0:00 完整備份，並持續封存 WAL。要找回訂單，最好的做法是？',
      code: { language: 'SQL', text: 'DELETE FROM orders;' },
      options: [
        '把複本升級成主機：複本上的訂單還在',
        '在另一台主機還原 0:00 的完整備份，重播封存的 WAL 到 10:02 誤刪之前停下，再把訂單搬回',
        '執行 `ROLLBACK;` 撤銷這個 `DELETE`',
        '只還原 0:00 的完整備份，覆蓋正式環境',
      ],
      answer: 1, explanation: '時間點復原可以停在任何一刻：還原完整備份後重播日誌到誤刪之前，就得到 10:02 之前的完整訂單，再把它們搬回正式環境。同步複本在 `DELETE` 提交時就已經刪了，複寫不是備份。這個敘述是自動提交的，執行完就已經提交，`ROLLBACK` 沒有可以撤銷的交易（SQLite 會回報 `cannot rollback - no transaction is active`）。只還原 0:00 的完整備份並覆蓋正式環境，會丟掉當天 0:00 到 10:02 的所有寫入，以及誤刪之後的新訂單。',
    },
    {
      id: 'q-replica-read', prompt: '非同步複寫，延遲 3 秒（寫入在提交後 3 秒到達複本）。商品庫存 `stock` 一開始是 5；第 10 秒有人下單，主機上變成 4；第 12 秒又一筆，變成 3。第 14 秒從複本讀 `stock`，讀到多少？',
      options: ['4', '5', '3', '讀取被拒絕，因為複本落後'],
      answer: 0, explanation: '第 10 秒的寫入在第 13 秒到達複本，第 12 秒的寫入要到第 15 秒才到。第 14 秒時，複本上最新的是第一筆：4。主機此時是 3，所以這次讀到的是過時的值。5 是忘了第一筆已經到達；3 是主機上的值，忽略了延遲；複本落後時照樣可以讀取，只是讀到舊資料，這正是讀寫分離要處理的問題。',
    },
    {
      id: 'q-read-your-writes', prompt: '應用程式採用讀寫分離：寫入送主機，讀取都送到非同步的複本。使用者改了暱稱，頁面重新整理後卻顯示舊暱稱。下面哪個做法能讓使用者一定看到自己剛改的暱稱？',
      options: [
        '再加兩台複本，分散讀取的負擔',
        '讀取失敗時立刻改讀另一台複本',
        '使用者寫入後的一段時間內，他自己的資料改從主機讀',
        '把每天的完整備份改成每小時一次',
      ],
      answer: 2, explanation: '問題出在複寫延遲：寫入還沒到達複本。讓剛寫入的使用者從主機讀（或等複本追上這次寫入在日誌中的位置再讀），就保證讀得到自己的寫入。多加複本不會讓任何一台更快追上，反而可能讓不同請求讀到延遲不同的複本；這裡的讀取沒有失敗，只是讀到舊值，改讀另一台複本一樣可能是舊的；備份的頻率和複寫延遲無關。',
    },
    {
      id: 'q-sync-cost', prompt: '一個團隊把主機到複本的複寫從非同步改成同步（提交要等複本確認）。下面哪個描述正確？',
      options: [
        '每次提交要多等一趟到複本的往返；複本故障或連不上時，提交可能一直等待，除非設定允許退回非同步',
        '提交與查詢都會變快，因為複本分擔了工作',
        '從此不需要備份：每筆提交都已經在兩台主機上',
        '複本也可以接受寫入，寫入的能力加倍',
      ],
      answer: 0, explanation: '同步複寫用提交延遲與可用性換取「已提交的寫入不會在切換時遺失」：每次 `COMMIT` 都要等複本確認，複本出問題時主機的提交也會被卡住（有些系統可以設定在這時退回非同步，代價是又可能遺失寫入）。提交只會變慢；誤刪、改壞的資料一樣會同步過去，所以仍然需要備份；主從架構的複本只接受讀取。',
    },
    {
      id: 'q-shard-key', prompt: '一個訂單系統要分片到 8 台主機。最常見的查詢是「某位顧客的訂單」，寫入是全天持續的新訂單。哪一個分片鍵最合適？',
      options: [
        '`ordered_on`，每個月的訂單放在一台主機',
        '`status`（shipped、pending、cancelled）',
        '`customer_id` 的雜湊值',
        '訂單 `id` 的範圍，每 100 萬筆放在一台主機',
      ],
      answer: 2, explanation: '`customer_id` 的值很多、雜湊後分布平均，新訂單分散到所有主機，而且同一位顧客的訂單都在同一個分片，最常見的查詢只要問一台。依月份分片時，所有新訂單都寫到同一台（練習場的範例裡，最近一個月的 1,500 筆全部落在同一個分片），是寫入熱點；訂單 `id` 只會增加，範圍分片有同樣的熱點；`status` 只有三個值，分不成 8 片，`shipped` 一片就佔了八成以上。',
    },
  ],
  sql: {
    dataset: 'sales',
    presets: [
      { label: '雜湊分片：customer_id % 4 的分布', sql: sql`SELECT customer_id % 4 AS shard,
  COUNT(*) AS orders,
  COUNT(DISTINCT customer_id) AS customers
FROM orders
GROUP BY shard
ORDER BY shard;` },
      { label: '範圍分割：每半年一個分割', sql: sql`SELECT
  CASE
    WHEN ordered_on < '2025-07-01' THEN '2025H1'
    WHEN ordered_on < '2026-01-01' THEN '2025H2'
    WHEN ordered_on < '2026-07-01' THEN '2026H1'
    ELSE '2026H2'
  END AS part,
  COUNT(*) AS orders
FROM orders
GROUP BY part
ORDER BY part;` },
      { label: '熱點：最近一個月的訂單落在哪個分片', sql: sql`SELECT customer_id % 4 AS shard, COUNT(*) AS recent_orders
FROM orders
WHERE ordered_on >= '2026-09-01'
GROUP BY shard
ORDER BY shard;` },
      { label: '查一位顧客只要問一個分片', sql: sql`SELECT customer_id % 4 AS shard, COUNT(*) AS orders
FROM orders
WHERE customer_id = 42
GROUP BY shard;` },
      { label: '增加分片時要搬多少資料', sql: sql`SELECT COUNT(*) AS orders,
  SUM(customer_id % 4 <> customer_id % 8) AS moved_4_to_8,
  SUM(customer_id % 4 <> customer_id % 5) AS moved_4_to_5
FROM orders;` },
    ],
    examples: [
      {
        id: 'sql-range-partition', title: '範圍分割：每半年一個分割', dataset: 'sales',
        description: '`sales` 資料。依 `ordered_on` 算出每筆訂單所屬的分割，計算每個分割的筆數與日期範圍。',
        sql: sql`SELECT
  CASE
    WHEN ordered_on < '2025-07-01' THEN '2025H1'
    WHEN ordered_on < '2026-01-01' THEN '2025H2'
    WHEN ordered_on < '2026-07-01' THEN '2026H1'
    ELSE '2026H2'
  END AS part,
  COUNT(*) AS orders,
  MIN(ordered_on) AS first_day,
  MAX(ordered_on) AS last_day
FROM orders
GROUP BY part
ORDER BY part;`,
        result: { columns: ['part', 'orders', 'first_day', 'last_day'], rows: [
          ['2025H1', 8492, '2025-01-01', '2025-06-30'],
          ['2025H2', 8625, '2025-07-01', '2025-12-31'],
          ['2026H1', 8479, '2026-01-01', '2026-06-30'],
          ['2026H2', 4404, '2026-07-01', '2026-10-02'],
        ] },
      },
      {
        id: 'sql-hash-shard', title: '雜湊分片：customer_id % 4', dataset: 'sales',
        description: '`sales` 資料。分片編號是 `customer_id % 4`；計算每個分片的訂單數與顧客數。',
        sql: sql`SELECT customer_id % 4 AS shard,
  COUNT(*) AS orders,
  COUNT(DISTINCT customer_id) AS customers
FROM orders
GROUP BY shard
ORDER BY shard;`,
        result: { columns: ['shard', 'orders', 'customers'], rows: [[0, 7500, 500], [1, 7500, 500], [2, 7500, 500], [3, 7500, 500]] },
      },
      {
        id: 'sql-hot-spot', title: '熱點：最近一個月的訂單落在哪個分片', dataset: 'sales',
        description: '`sales` 資料。2026-09-01 以後的訂單，`by_date` 是依日期的四個範圍分片（同上一節的四個半年），`by_customer` 是依 `customer_id % 4`。',
        sql: sql`WITH recent AS (
  SELECT customer_id, ordered_on FROM orders WHERE ordered_on >= '2026-09-01'
),
shards(shard) AS (VALUES (0), (1), (2), (3))
SELECT s.shard,
  (SELECT COUNT(*) FROM recent
   WHERE CASE
     WHEN ordered_on < '2025-07-01' THEN 0
     WHEN ordered_on < '2026-01-01' THEN 1
     WHEN ordered_on < '2026-07-01' THEN 2
     ELSE 3
   END = s.shard) AS by_date,
  (SELECT COUNT(*) FROM recent WHERE customer_id % 4 = s.shard) AS by_customer
FROM shards AS s
ORDER BY s.shard;`,
        result: { columns: ['shard', 'by_date', 'by_customer'], rows: [[0, 0, 375], [1, 0, 376], [2, 0, 375], [3, 1500, 374]] },
      },
      {
        id: 'sql-low-cardinality', title: '值太少的分片鍵：status', dataset: 'sales',
        description: '`sales` 資料。如果用訂單狀態當分片鍵，每個分片有幾筆、佔全部的百分之幾。',
        sql: sql`SELECT status AS shard,
  COUNT(*) AS orders,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM orders), 1) AS pct
FROM orders
GROUP BY status
ORDER BY orders DESC;`,
        result: { columns: ['shard', 'orders', 'pct'], rows: [['shipped', 24429, 81.4], ['pending', 4071, 13.6], ['cancelled', 1500, 5]] },
      },
      {
        id: 'sql-reshard', title: '增加分片時要搬多少資料', dataset: 'sales',
        description: '`sales` 資料。分片編號原本是 `customer_id % 4`；改成 8 片或 5 片之後，編號改變（要搬到別台主機）的訂單有幾筆。SQLite 的比較運算結果是 1 或 0，所以 `SUM(條件)` 就是符合條件的筆數。',
        sql: sql`SELECT COUNT(*) AS orders,
  SUM(customer_id % 4 <> customer_id % 8) AS moved_4_to_8,
  SUM(customer_id % 4 <> customer_id % 5) AS moved_4_to_5
FROM orders;`,
        result: { columns: ['orders', 'moved_4_to_8', 'moved_4_to_5'], rows: [[30000, 15000, 24000]] },
      },
    ],
    exercises: [
      {
        id: 'ex-reshard-3-to-4', title: '從 3 個分片擴充到 4 個：每片要搬進多少資料',
        statement: '`sales` 的訂單目前依 `customer_id % 3` 分到 3 台主機（分片 0、1、2）。現在要加第 4 台，改成依 `customer_id % 4` 分片：原有的主機保留原來的編號，新主機是分片 3。一筆訂單如果新的編號 `customer_id % 4` 和舊的編號 `customer_id % 3` 不同，就要從別台搬過去。請列出新配置下的每個分片：`shard`（新的分片編號）、`orders`（這個分片的訂單數）、`moved`（其中要從別的分片搬進來的訂單數），依 `shard` 由小到大排列。',
        dataset: 'sales', hidden: ['sales-b'], ordered: true, columnNames: true,
        starter: sql`SELECT customer_id % 4 AS shard,
  COUNT(*) AS orders
  -- 再加上 moved
FROM orders
GROUP BY shard
ORDER BY shard;`,
        hints: [
          '每筆訂單有兩個編號：舊的 `customer_id % 3` 與新的 `customer_id % 4`；依新的編號分組。',
          '要搬的筆數可以寫成 `SUM(條件)`（SQLite 的比較結果是 1 或 0），或 `SUM(CASE WHEN … THEN 1 ELSE 0 END)`、`COUNT(*) FILTER (WHERE …)`。',
          '分片 3 是新主機，舊的編號 `customer_id % 3` 永遠不會是 3：它的每一筆都是搬進來的。',
        ],
        solution: sql`SELECT customer_id % 4 AS shard,
  COUNT(*) AS orders,
  SUM(customer_id % 3 <> customer_id % 4) AS moved
FROM orders
GROUP BY shard
ORDER BY shard;`,
        alternatives: [
          sql`WITH placed AS (
  SELECT customer_id % 3 AS old_shard, customer_id % 4 AS new_shard
  FROM orders
)
SELECT new_shard AS shard,
  COUNT(*) AS orders,
  COUNT(*) FILTER (WHERE old_shard <> new_shard) AS moved
FROM placed
GROUP BY new_shard
ORDER BY new_shard;`,
          sql`SELECT c.id % 4 AS shard,
  COUNT(*) AS orders,
  SUM(CASE WHEN c.id % 3 = c.id % 4 THEN 0 ELSE 1 END) AS moved
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.id % 4
ORDER BY 1;`,
        ],
        mistakes: [
          { sql: sql`SELECT id % 4 AS shard,
  COUNT(*) AS orders,
  SUM(id % 3 <> id % 4) AS moved
FROM orders
GROUP BY shard
ORDER BY shard;`, why: '用了訂單的 `id`，不是分片鍵 `customer_id`：每個分片的訂單數碰巧一樣，但要搬的筆數不同；而且依訂單 id 分片，同一位顧客的訂單會散在各台主機上。' },
          { sql: sql`SELECT customer_id % 4 AS shard,
  COUNT(*) AS orders,
  SUM(customer_id % 3 = customer_id % 4) AS moved
FROM orders
GROUP BY shard
ORDER BY shard;`, why: '條件寫反了：`=` 算的是留在原地、不用搬的筆數。新主機分片 3 因此變成 0，但它的資料其實全部是搬進來的。' },
          { sql: sql`SELECT customer_id % 3 AS shard,
  COUNT(*) AS orders,
  SUM(customer_id % 3 <> customer_id % 4) AS moved
FROM orders
GROUP BY shard
ORDER BY shard;`, why: '依舊的編號分組，算的是每台舊主機要「搬出去」多少，而且少了新的分片 3。題目要的是新配置下每個分片的訂單數與搬進來的筆數。' },
        ],
      },
    ],
  },
  ops: {
    backups: [
      {
        id: 'bk-before-full', title: '完整＋增量備份：故障就在下一次備份之前',
        description: '每天 0:00 完整備份（第 0、1440 分鐘），每 6 小時增量備份（6:00、12:00、18:00 …），沒有封存日誌。還原完整備份約 40 分鐘、每份增量約 10 分鐘。故障在第 1437 分鐘（23:57）。拖動故障時間，或勾選「持續封存日誌」比較。',
        plan: dailyPlan, failureAt: 1437,
      },
      {
        id: 'bk-after-full', title: '加上日誌封存：故障在完整備份之後 3 分鐘',
        description: '同一份備份計畫，另外每 5 分鐘封存一段日誌；重播一小時的日誌約 6 分鐘。故障在第 1443 分鐘（隔天 0:03，頁面顯示 24:03）。把故障時間拖到 23:57（第 1437 分鐘），和上一個範例比較遺失的資料與還原時間。',
        plan: { ...dailyPlan, logEvery: 5 }, failureAt: 1443,
      },
    ],
    replication: [
      {
        id: 'rep-read-your-writes', title: '讀不到自己剛寫入的資料',
        description: '非同步複寫，延遲 2 秒。會員在第 10 秒兌換，主機上的點數 `points` 從 100 變成 150；應用程式從複本讀點數來顯示。試著把延遲調大，或切換成同步複寫。',
        scenario: pointsScenario,
      },
      {
        id: 'rep-failover', title: '非同步複寫的故障切換：遺失已提交的寫入',
        description: '非同步複寫，延遲 3 秒。A、B 一開始都是 100；四筆寫入都已在主機上提交。主機在第 22 秒故障，複本升級為新主機。切換成同步複寫，比較切換後的值與遺失的寫入。',
        scenario: failoverScenario,
      },
    ],
    exercises: [
      {
        id: 'ex-restore-pitr', title: '硬碟故障之後：能還原到哪一刻',
        task: 'restore', failureAt: 1910,
        plan: { fullAt: [0, 1440], incrementalAt: [240, 480, 720, 960, 1200, 1680, 1920, 2160], logEvery: 15, restore: { full: 40, incremental: 10, logPerHour: 6 } },
        statement: '一家網路商店的備份計畫（時間以分鐘計，第 0 分鐘是第一天 0:00）：每天 0:00 完整備份（第 0、1440 分鐘）；每 4 小時增量備份，增量的定義是自上一次任何備份以來的變更（第 240、480、720、960、1200 分鐘，隔天的第 1680、1920、2160 分鐘）；WAL 每 15 分鐘封存一段（第 15、30、45 … 分鐘各封存到那一刻為止的日誌）。第 1910 分鐘（隔天 7:50），資料庫主機的硬碟損毀，沒有複本。還原到能回到的最新時刻：最多能還原到第幾分鐘？會遺失幾分鐘的資料？',
        hints: [
          '從故障前最後一次完整備份開始：第 1440 分鐘那一份，第一天的備份都用不到。',
          '第 1920 分鐘的增量備份在故障之後，還沒做。',
          '日誌封存到哪一刻？找出故障前最後一個 15 的倍數。',
        ],
        explanation: '還原步驟：第 1440 分鐘（隔天 0:00）的完整備份 → 第 1680 分鐘（4:00）的增量備份 → 重播封存的日誌，從第 1680 分鐘到最後一段封存的第 1905 分鐘（7:45）。最多還原到第 1905 分鐘，遺失 1910 − 1905 = 5 分鐘（最後一段還沒封存的日誌）。模擬器估計的還原時間是 40 + 10 + 23（225 分鐘的日誌，每小時 6 分鐘）= 73 分鐘，RTO 還要加上發現故障與準備新主機的時間。',
        mistakes: [
          { answer: { recoveryPoint: 1680, dataLoss: 230 }, why: '只用了備份，忘了封存的日誌：日誌可以把資料從最後一份增量（4:00）一路推到最後一段封存的時刻。' },
          { answer: { recoveryPoint: 1910, dataLoss: 0 }, why: '以為日誌能重播到故障的那一刻：日誌每 15 分鐘才封存一段，第 1905 分鐘之後的那一段還在壞掉的主機上，跟著遺失。' },
          { answer: { recoveryPoint: 1440, dataLoss: 470 }, why: '只還原了完整備份：之後的增量備份與封存的日誌都還在，可以繼續往後接。' },
        ],
      },
      {
        id: 'ex-failover-lost', title: '故障切換：遺失了幾筆已提交的寫入',
        task: 'failover',
        scenario: {
          mode: 'async', lag: 2, initial: { A: 0, B: 0, C: 0 },
          writes: [{ at: 50, key: 'A', value: 1 }, { at: 57, key: 'B', value: 1 }, { at: 58, key: 'C', value: 1 }, { at: 59, key: 'A', value: 2 }, { at: 60, key: 'B', value: 2 }],
          reads: [], failoverAt: 60,
        },
        statement: '一台主機、一台非同步複本，複寫延遲 2 秒：在第 t 秒提交的寫入，第 t + 2 秒到達複本（到達的那一秒起就在複本上）。主機上依序提交了五筆寫入：第 50 秒 A = 1、第 57 秒 B = 1、第 58 秒 C = 1、第 59 秒 A = 2、第 60 秒 B = 2，每一筆都已回報成功。主機在第 60 秒處理完當秒的寫入後故障，複本立刻升級為新主機。新主機上少了幾筆已提交的寫入？',
        hints: [
          '逐筆算出到達複本的時間：提交時間加 2 秒。',
          '到達時間不晚於第 60 秒的寫入，切換時已經在複本上；晚於第 60 秒的，在新主機上不存在。',
        ],
        explanation: '五筆寫入到達複本的時間分別是第 52、59、60、61、62 秒。第 58 秒的 C = 1 剛好在第 60 秒到達，切換時已在複本上；第 59 秒的 A = 2 與第 60 秒的 B = 2 還沒到，遺失 2 筆。新主機上是 A = 1、B = 1、C = 1。如果是同步複寫，每一筆在回報成功時就已經在複本上，一筆都不會遺失，代價是每次提交多等一趟到複本的往返。',
        mistakes: [
          { answer: { lost: 0 }, why: '以為回報成功的寫入一定不會遺失：非同步複寫回報成功時，寫入只在主機上，還沒到達複本的都會隨著主機一起消失。' },
          { answer: { lost: 3 }, why: '把第 58 秒的寫入也算進去了：它在第 60 秒到達，切換的那一刻已經在複本上。' },
          { answer: { lost: 1 }, why: '只算了故障那一秒的寫入：第 59 秒的寫入要到第 61 秒才到達，同樣來不及。' },
        ],
      },
    ],
  },
};
