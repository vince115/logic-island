import type { LessonContent, Mark, TraceStep } from '../schema';

const code = String.raw;

/**
 * The trace program: a bounded buffer guarded by one threading.Condition (Python). Its steps are generated below by
 * running the same rules (take the lock, re-check the condition in a while loop, wait releases the lock, notify_all
 * wakes every waiter, a woken thread must take the lock again) on a fixed schedule of turns.
 */
const TRACE_CODE = code`import threading
from collections import deque
buf = deque()
CAP = 2
cond = threading.Condition()

def put(x):
    with cond:
        while len(buf) == CAP:
            cond.wait()
        buf.append(x)
        cond.notify_all()

def take():
    with cond:
        while not buf:
            cond.wait()
        x = buf.popleft()
        cond.notify_all()
        return x`;

type SimThread = 'P' | 'C';
type SimStatus = 'ready' | 'waiting' | 'woken' | 'done';

/**
 * Simulates the trace program on a schedule. One turn runs a thread until it either waits on the condition or finishes
 * one put/take; a thread that waits and was not notified cannot be scheduled (the simulator throws, so a wrong schedule
 * cannot produce a trace). Every step is a snapshot of the buffer, the lock holder and both threads.
 */
function boundedBufferSteps(capacity: number, puts: number[], schedule: SimThread[]): TraceStep[] {
  const lines = { P: { with: 8, check: 9, wait: 10, act: 11, notify: 12, leave: 12 }, C: { with: 15, check: 16, wait: 17, act: 18, notify: 19, leave: 20 } };
  const name = { P: '生產者 P', C: '消費者 C' };
  const buf: string[] = [];
  const taken: string[] = [];
  const next = { P: 0, C: 0 };
  const status: Record<SimThread, SimStatus> = { P: 'ready', C: 'ready' };
  let holder: SimThread | null = null;
  const steps: TraceStep[] = [];
  const op = (t: SimThread) => t === 'P' ? `put(${puts[next.P]})` : 'take()';
  const describe = (t: SimThread) => {
    if (holder === t) return `持有鎖，執行 ${op(t)}`;
    switch (status[t]) {
      case 'ready': return `下一步 ${op(t)}`;
      case 'waiting': return '在 cond.wait() 中等待（不佔鎖）';
      case 'woken': return '已被喚醒，等著重新取得鎖';
      case 'done': return '完成';
    }
  };
  const snap = (line: number, note: string, marks: { at: number; kind: Mark }[] = []) => steps.push({
    line, note,
    vars: { 鎖的持有者: holder ? name[holder] : '（沒有）', 'P': describe('P'), 'C': describe('C'), 'len(buf)': String(buf.length), 'C 已取得': `[${taken.join(', ')}]` },
    containers: [{ name: 'buf', kind: 'queue', items: [...buf], marks }],
  });

  snap(5, `建立容量 ${capacity} 的緩衝區 buf 與條件變數 cond（它內含一把鎖）。生產者 P 依序放入 ${puts.join('、')}，消費者 C 取出同樣多次。以下是一種固定的排程；真實的排程每次可能不同，但每一步遵守的規則相同。`);
  for (const t of schedule) {
    if (status[t] === 'waiting' || status[t] === 'done') throw new Error(`${t} cannot run: ${status[t]}`);
    const L = lines[t], resumed = status[t] === 'woken';
    holder = t;
    if (resumed) snap(L.wait, `輪到${name[t]}：它先前被 notify_all 喚醒，wait() 返回之前要先重新取得鎖，現在拿到了。`);
    else snap(L.with, `輪到${name[t]}呼叫 ${op(t)}：進入 with cond，取得鎖。其他執行緒要取得這把鎖都必須等待。`);
    const full = t === 'P' ? buf.length === capacity : buf.length === 0;
    const condition = t === 'P' ? `len(buf) == CAP（${buf.length} == ${capacity}）` : `not buf（緩衝區${buf.length ? '有' : '沒有'}資料）`;
    snap(L.check, full
      ? `檢查 ${condition}：成立，${t === 'P' ? '緩衝區滿了，不能放' : '緩衝區是空的，沒東西可取'}，必須等待。`
      : `${resumed ? '醒來後重新檢查' : '檢查'} ${condition}：不成立，可以繼續。${resumed ? '醒來不代表條件一定成立（可能是虛假喚醒，或別人先搶走了），所以要用 while 再檢查一次，不能用 if。' : ''}`);
    if (full) {
      status[t] = 'waiting';
      holder = null;
      snap(L.wait, `cond.wait()：釋放鎖並進入等待，兩件事一次完成，中間不會漏掉別人的通知。鎖被釋放後，其他執行緒才能進來改變緩衝區。`);
      continue;
    }
    if (t === 'P') {
      buf.push(String(puts[next.P]));
      snap(L.act, `buf.append(${puts[next.P]})：放到佇列尾端，緩衝區有 ${buf.length} 個元素。`, [{ at: buf.length - 1, kind: 'write' }]);
    } else {
      const x = buf.shift()!;
      taken.push(x);
      snap(L.act, `x = buf.popleft()：從前端取出最早放入的 ${x}（先進先出）。`);
    }
    const other: SimThread = t === 'P' ? 'C' : 'P';
    const woke = status[other] === 'waiting';
    if (woke) status[other] = 'woken';
    snap(L.notify, woke
      ? `cond.notify_all()：${name[other]} 正在等待，把它喚醒。它要等${name[t]}釋放鎖之後才能真正繼續。`
      : 'cond.notify_all()：沒有執行緒在等待，這次通知什麼也不做（通知不會被保留）。');
    holder = null;
    next[t] += 1;
    status[t] = next[t] === puts.length ? 'done' : 'ready';
    snap(L.leave, t === 'P'
      ? '離開 with 區塊，自動釋放鎖。put 完成。'
      : `return ${taken.at(-1)}：離開 with 區塊時自動釋放鎖。C 拿到的順序與 P 放入的順序相同。`);
  }
  return steps;
}

/**
 * PL14 執行緒與同步 (programming-languages island, course production batch 3). Every example and the reference
 * solutions run in tests/curriculum-code.test.ts in C++17, Java 17, Python 3 and JavaScript (Node.js). Determinism: the
 * programs print only results fixed by correct synchronization (a locked or atomic counter after join, balances after
 * join, the items a single consumer takes from a FIFO buffer); no program can deadlock or race, and deadlock is taught
 * with a simulation (the exercise) and a table. The JavaScript versions show the same idea in the event loop, except
 * the atomic example, which runs real worker_threads on a SharedArrayBuffer and waits for every worker to exit. The
 * quiz claims were checked when the lesson was written: q5 with node, q7 with Lock.acquire(timeout=...) (it does not
 * hang); the others by tracing.
 */
export const PL14: LessonContent = {
  lessonId: 'PL14',
  motivation: '多執行緒程式最麻煩的 bug 不會每次出現：計數器偶爾少算幾次、兩筆轉帳偶爾互相卡死、消費者偶爾讀到空的佇列，測試通過一千次，上線後才出事。PL13 看到了原因：共享資料被交錯地讀寫。這一課學會修好它：用互斥鎖與原子操作保護共享資料，認出死結的四個條件並用固定的鎖順序避開它，用條件變數或阻塞佇列讓生產者與消費者安全地交接資料，並比較 C++、Java、Python 與 JavaScript 各自提供的工具。學完後能修好有競爭條件的計數器，寫出不會死結的生產者—消費者程式。',
  sections: [
    {
      id: 'mutex', title: '互斥鎖：讓臨界區一次只有一個執行緒',
      blocks: [
        { type: 'p', text: 'PL13 看過 `count++` 其實是「讀出、加 1、寫回」三步：兩個執行緒都讀到 5、各自加 1、都寫回 6，就少算了一次。存取共享資料、而且不能被其他執行緒插進來的那一段程式，叫臨界區（critical section）。互斥鎖（mutex，mutual exclusion）就是用來守住臨界區的：進入前呼叫 `lock()`，如果鎖已經被別的執行緒持有，就在這裡停下來等；離開時呼叫 `unlock()`，讓等待的執行緒之一取得鎖。只要每個存取這筆資料的地方都先取得同一把鎖，臨界區裡的步驟對其他執行緒來說就是一個不可分割的整體。鎖還有第二個作用：一個執行緒在釋放鎖之前寫入的值，下一個取得同一把鎖的執行緒一定看得到。' },
        { type: 'p', text: '不要手動成對呼叫 `lock()` 與 `unlock()`：中間如果 `return` 或丟出例外，鎖就永遠不會被釋放，其他執行緒全部卡住。各語言都有「離開區塊就自動釋放」的寫法，這正是 PL09 的 RAII 與 `with`：C++ 用 `std::lock_guard`（建構時上鎖、解構時解鎖），Java 用 `synchronized` 方法或區塊，Python 用 `with lock:`。Java 的 `ReentrantLock` 功能較多（可以設定等待逾時、可以中斷），但必須自己寫 `lock.lock(); try { … } finally { lock.unlock(); }`。下例讓 4 個執行緒各把共享的計數器加 1000 次，每次都在鎖裡面加。' },
        { type: 'example', id: 'mutex-counter' },
        { type: 'p', text: '輸出一定是 4000：每次加 1 都在鎖裡完成，不會互相覆蓋，而且是在所有執行緒 `join`（等它結束）之後才讀取。四個執行緒實際上怎麼交錯每次都不一樣，但正確加鎖之後結果不受交錯影響，這正是同步的目的。JavaScript 版本的模型不同：同一段 JavaScript 程式只在一條執行緒上執行，`counter++` 一旦開始就會做完，其他工作只能在 `await` 讓出執行權時才插進來，所以事件迴圈裡的共享計數器不需要鎖。但如果把「讀出」和「寫回」用 `await` 隔開，一樣會遺失更新（測驗第 5 題）。' },
        { type: 'table', head: ['語言', '互斥鎖', '自動釋放的寫法', '同一個執行緒能否重複取得（可重入）'], rows: [
          ['C++', '`std::mutex`', '`std::lock_guard`、`std::unique_lock`、`std::scoped_lock`（C++17）', '不行，重複 `lock()` 是未定義行為；需要時用 `std::recursive_mutex`'],
          ['Java', '每個物件內建的監視器鎖、`ReentrantLock`', '`synchronized` 區塊結束時；`ReentrantLock` 要在 `finally` 呼叫 `unlock()`', '可以，兩者都可重入'],
          ['Python', '`threading.Lock`、`threading.RLock`', '`with lock:`', '`Lock` 不行（會卡住自己），`RLock` 可以'],
          ['JavaScript', '一般程式不需要；worker 之間沒有內建的鎖類別', '—', '—'],
        ] },
        { type: 'callout', tone: 'warning', title: '每次都建立新的鎖，等於沒有鎖', text: '把 `std::mutex m;` 宣告在函式裡、在 Python 寫 `with threading.Lock():`、或在 Java 用 `synchronized (new Object())`，每次呼叫都拿到一把全新的鎖，永遠不會有人在等，臨界區完全沒有被保護。所有存取同一筆資料的程式碼必須使用同一個鎖物件。另一個常見錯誤是只在寫入時加鎖、讀取時不加：讀取的一方可能看到寫到一半的狀態，或一直看不到新值。' },
      ],
    },
    {
      id: 'atomic', title: '原子操作：不用鎖的單一變數更新',
      blocks: [
        { type: 'p', text: '原子操作（atomic operation）在其他執行緒看來只有兩種狀態：還沒發生，或已經完全做完，沒有「做到一半」。CPU 提供這類指令（例如「讀出並加上」、比較後交換 compare-and-swap），語言把它們包成型別：C++ 的 `std::atomic<int>`（`++x`、`x.fetch_add(1)`、`compare_exchange_weak`），Java 的 `AtomicInteger`（`incrementAndGet`、`getAndIncrement`、`compareAndSet`；競爭激烈的計數用 `LongAdder`），JavaScript 的 `Atomics.add`、`Atomics.load`、`Atomics.compareExchange`（作用在 `SharedArrayBuffer` 上，給 worker 之間共用）。Python 標準函式庫沒有原子整數：`x += 1` 會編譯成好幾個位元組碼指令，GIL 可能在它們之間切換執行緒，所以不是原子的，要用 `Lock`。' },
        { type: 'p', text: '下例像抽號碼牌：4 個執行緒各抽 500 張，每次用「取得舊值並加 1」拿到一張號碼。因為這個操作不可分割，兩個執行緒不可能拿到同一個號碼。每個執行緒把自己的號碼存在自己的串列裡（不共享，所以不需要同步），全部 `join` 之後再檢查有沒有重複。JavaScript 版本用的是真正的執行緒：`worker_threads` 開 4 個 worker，各自有自己的事件迴圈，只有 `SharedArrayBuffer` 這塊記憶體是共用的；主執行緒等到每個 worker 都觸發 `exit` 事件（相當於 join）才讀結果。Python 版本自己用一把鎖寫出 `get_and_increment()`，效果與原子操作相同。' },
        { type: 'example', id: 'atomic-tickets' },
        { type: 'p', text: '原子操作比鎖輕巧，但只保護「一個變數的一個操作」。不變條件牽涉好幾個變數時（兩個帳戶的總額、佇列的陣列與長度），或要「先檢查再修改」時，就需要鎖：`if (stock.load() > 0) stock.fetch_sub(1);` 是兩個各自原子的操作，兩個執行緒可能都看到 1、都減掉，庫存變成 −1。這種情況要嘛整段放進同一把鎖，要嘛用 compare-and-swap 迴圈：讀出舊值、算出新值，只有在值仍是舊值時才寫入，否則重來。' },
        { type: 'callout', tone: 'warning', title: 'volatile 不是原子操作', text: 'Java 的 `volatile int count;` 只保證每次讀寫都直接看到最新的值（可見性）與不被重新排序，`count++` 仍然是讀、加、寫三步，兩個執行緒照樣會遺失更新；要用 `AtomicInteger` 或 `synchronized`。C++ 的 `volatile` 與執行緒完全無關（它是給記憶體映射的硬體暫存器用的），共享變數要用 `std::atomic`。Python 的 GIL 也不會讓 `count += 1` 變成原子操作。' },
      ],
    },
    {
      id: 'deadlock', title: '死結：四個條件與固定鎖順序',
      blocks: [
        { type: 'p', text: '一組執行緒中，每一個都在等另一個持有的資源，結果誰都無法前進，這就是死結（deadlock）。程式不會當掉、不會印出錯誤訊息，只是永遠停在那裡。最經典的例子是兩個方向相反的轉帳：T1 執行 A 轉給 B，先鎖 A 再鎖 B；T2 同時執行 B 轉給 A，先鎖 B 再鎖 A。如果兩個執行緒都剛好拿到第一把鎖，就會各自等對方手上的第二把。' },
        { type: 'table', head: ['時間', 'T1（A 轉給 B）', 'T2（B 轉給 A）', 'A 的持有者', 'B 的持有者', '等待圖的邊'], rows: [
          ['1', '鎖 A：成功', '—', 'T1', '沒有', '沒有'],
          ['2', '—', '鎖 B：成功', 'T1', 'T2', '沒有'],
          ['3', '鎖 B：等待', '—', 'T1', 'T2', 'T1 → T2'],
          ['4', '（仍在等待）', '鎖 A：等待', 'T1', 'T2', 'T1 → T2、T2 → T1：形成環，死結'],
        ] },
        { type: 'p', text: '等待圖（wait-for graph）把每個執行緒畫成一個節點，T 在等 U 持有的鎖時畫一條 T → U 的邊。每把鎖只有一個持有者時，圖上出現環就代表死結。Coffman 等人在 1971 年指出，死結必須同時滿足四個條件：' },
        { type: 'list', ordered: true, items: [
          '互斥（mutual exclusion）：資源一次只能由一個執行緒持有。',
          '持有並等待（hold and wait）：執行緒拿著已取得的鎖，同時等待另一把鎖。',
          '不可搶佔（no preemption）：鎖不能被強制拿走，只能由持有者自己釋放。',
          '循環等待（circular wait）：等待關係形成環，T1 等 T2、T2 等 T1（或更長的環）。',
        ] },
        { type: 'p', text: '破壞任何一個條件，死結就不可能發生。最實用的是破壞循環等待：為所有鎖規定一個全域的順序（例如帳戶編號），每個執行緒都依這個順序上鎖。這樣持有小編號鎖的人只會去等大編號的鎖，等待的方向永遠往編號大的走，不可能繞回來形成環。C++17 的 `std::scoped_lock lock(m1, m2);` 一次取得多把鎖，內建避免死結的演算法，參數順序隨便寫都安全。Java 的 `ReentrantLock.tryLock(時間, 單位)` 則換一個條件下手：等不到就放棄、放開已持有的鎖、稍後重試，執行緒不再「拿著一把等另一把」。' },
        { type: 'example', id: 'fixed-order' },
        { type: 'p', text: 'T1 把 A 的錢以每次 1 元轉給 B 共 30 次，T2 把 B 的錢以每次 2 元轉給 A 共 10 次，方向相反，正是會死結的組合。C++ 用 `std::scoped_lock`，Java 與 Python 都先鎖編號小的帳戶，所以一定能完成；全部 `join` 之後 A 是 100 − 30 + 20 = 90，B 是 110，總額 200 不變。JavaScript 在單一執行緒上執行，`transfer` 是同步函式，執行到結束前不會有別的程式插進來，所以不需要鎖，也不會死結。這一課從不執行可能死結的程式；練習題用模擬的方式偵測等待圖上的環。' },
        { type: 'callout', tone: 'warning', title: '依參數順序上鎖', text: '`transfer(from, to)` 寫成「先鎖 from、再鎖 to」看起來對稱又合理，但 `transfer(a, b)` 與 `transfer(b, a)` 同時執行時，上鎖順序正好相反，形成循環等待。這種死結可能測試一千次都沒出現，上線後在某個剛好的時間點卡住整個服務。上鎖順序要依資源本身的固定屬性（編號），而不是呼叫時參數的位置。另一種隱藏的順序反轉是持有鎖時呼叫外部程式碼（回呼函式、另一個加鎖的方法），它可能以相反的順序取得別的鎖。' },
      ],
    },
    {
      id: 'condition-variables', title: '條件變數與生產者—消費者',
      blocks: [
        { type: 'p', text: '生產者—消費者（producer–consumer）是最常見的多執行緒結構：生產者產生工作（下載好的檔案、收到的請求），放進一個有容量上限的緩衝區；消費者從緩衝區取出來處理。緩衝區空的時候消費者要等，滿的時候生產者要等。用迴圈不停檢查（忙碌等待）會白白浪費 CPU，而且檢查時一直拿著鎖，對方反而進不來。條件變數（condition variable）解決這件事：`wait(lock)` 一次完成「釋放鎖並睡著」，被通知之後先重新取得鎖才返回；改變狀態的一方呼叫 `notify_one()`（喚醒一個）或 `notify_all()`（喚醒全部）。C++ 是 `std::condition_variable`，搭配 `std::unique_lock`；Java 是 `synchronized` 裡的 `wait()`／`notifyAll()`，或 `ReentrantLock` 的 `Condition`（`await`／`signal`）；Python 是 `threading.Condition`。' },
        { type: 'p', text: '等待一定要寫在 `while` 迴圈裡，醒來後重新檢查條件，原因有兩個。第一，虛假喚醒（spurious wakeup）：C++、Java 與 POSIX 的規格都允許 `wait` 在沒有人通知時返回。第二，就算真的被通知，從被喚醒到重新取得鎖之間，另一個消費者可能已經把資料取走了。C++ 的 `cv.wait(lock, 條件)` 與 Python 的 `cond.wait_for(條件)` 會替你寫好這個迴圈。' },
        { type: 'p', text: '實務上多半不必自己寫條件變數：Java 的 `BlockingQueue`（`ArrayBlockingQueue`、`LinkedBlockingQueue`）與 Python 的 `queue.Queue(maxsize=…)` 就是現成的有界緩衝區，`put` 在滿時阻塞、`take`／`get` 在空時阻塞，內部就是鎖加上條件變數。C++ 標準函式庫沒有阻塞佇列，下例自己用 `std::mutex` 與兩個條件變數寫出來；JavaScript 版本用 Promise 寫出同樣結構的緩衝區，`await` 代替 `wait`，同樣用 `while` 重新檢查。生產者放入 1～5，最後放入 −1 當作「結束」的記號（俗稱毒藥丸，poison pill）。' },
        { type: 'example', id: 'producer-consumer' },
        { type: 'p', text: '輸出之所以確定，是因為只有一個生產者與一個消費者，而緩衝區是先進先出：不論兩個執行緒怎麼交錯、生產者等了幾次，消費者拿到的順序一定是放入的順序。若有多個消費者，「哪個消費者拿到哪一筆」每次都不同，這時只能印出彙總的結果（例如總和）。下方的逐步追蹤用 Python 的 `threading.Condition` 模擬容量 2 的緩衝區，依一種固定的排程顯示鎖的持有者、等待中的執行緒與佇列內容；它由模擬程式依同樣的規則實際執行產生，不是真實排程的錄影。' },
        { type: 'callout', tone: 'warning', title: '用 if 包住 wait', text: '`if (q.empty()) cv.wait(lock);` 平常看起來都對，但遇到虛假喚醒，或兩個消費者同時被 `notify_all` 喚醒時，後拿到鎖的那個醒來時佇列已經空了，`if` 不會再檢查，直接執行 `q.front()`：C++ 是未定義行為，Java 的 `remove()` 丟出例外，Python 的 `popleft()` 丟出 IndexError。永遠寫成 `while (q.empty()) cv.wait(lock);`。另一個錯誤是在沒持有鎖的情況下改變條件再通知，等待的一方可能在「檢查條件」與「開始等待」之間錯過通知，永遠睡下去。' },
      ],
    },
    {
      id: 'languages', title: '執行緒安全與四種語言的比較',
      blocks: [
        { type: 'p', text: '一個函式或類別是執行緒安全（thread-safe）的，意思是多個執行緒同時呼叫它，而且呼叫端不另外加鎖，它仍然維持自己的不變條件、得到正確的結果。做到執行緒安全有三種方式，依推薦順序是：不共享（每個執行緒用自己的資料，最後在 `join` 之後合併，像原子操作範例裡每個執行緒自己的號碼串列）；只共享不可變的資料；共享可變資料時用鎖、原子操作或執行緒安全的容器同步。要注意執行緒安全的元件組合起來不一定安全：Java 的 `ConcurrentHashMap` 每個方法都安全，但 `if (!map.containsKey(k)) map.put(k, v);` 是兩次呼叫，中間仍可能被插隊，要改用一次完成的 `putIfAbsent` 或 `computeIfAbsent`。' },
        { type: 'table', head: ['項目', 'C++17', 'Java', 'Python', 'JavaScript（Node.js）'], rows: [
          ['建立執行緒', '`std::thread t(f, 參數)`', '`new Thread(r).start()`；Java 21 起可用 `Thread.ofVirtual().start(r)`', '`threading.Thread(target=f).start()`', '`new Worker(…)`（`worker_threads`），每個 worker 有自己的事件迴圈'],
          ['等待結束', '`t.join()`；既沒有 join 也沒有 detach 就被解構，會呼叫 `std::terminate`', '`t.join()`', '`t.join()`', '監聽 worker 的 `exit` 事件'],
          ['互斥鎖', '`std::mutex` 搭配 `std::lock_guard`／`std::scoped_lock`', '`synchronized`、`ReentrantLock`', '`threading.Lock`、`with`', '事件迴圈裡的程式不需要'],
          ['原子操作', '`std::atomic<T>`', '`AtomicInteger`、`AtomicLong`、`LongAdder`', '標準函式庫沒有，用 `Lock`', '`Atomics` 搭配 `SharedArrayBuffer`'],
          ['等待條件', '`std::condition_variable` 搭配 `std::unique_lock`', '`wait`／`notifyAll`、`Condition`', '`threading.Condition`', '`await` 一個 Promise'],
          ['阻塞佇列', '標準函式庫沒有，用 mutex 與條件變數自己寫', '`BlockingQueue`', '`queue.Queue`', '不需要阻塞，用 Promise 寫非同步佇列'],
          ['多核心同時執行計算', '可以', '可以', '一般的 CPython 有 GIL，同一時間只有一個執行緒執行 Python 位元組碼；3.13 起另有可選的 free-threaded（無 GIL）版本', '多個 worker 可以'],
        ] },
        { type: 'p', text: 'Java 21 的虛擬執行緒（virtual thread）是由 JVM 排程的輕量執行緒：成千上萬個虛擬執行緒輪流掛在少數幾個平台執行緒（載體）上，碰到阻塞的 I/O 就讓出載體，所以很適合「每個請求一個執行緒」的伺服器。它只改變執行緒的成本，不改變同步規則：虛擬執行緒一樣會在多個核心上同時執行，共享資料照樣需要鎖、原子操作或 `BlockingQueue`。Java 21 到 23 中，虛擬執行緒在 `synchronized` 區塊裡阻塞時會釘住（pin）載體，長時間阻塞的臨界區建議改用 `ReentrantLock`；Java 24（JEP 491）起 `synchronized` 不再造成這種釘住。本課的 Java 範例以 Java 17 編譯，所以不使用虛擬執行緒。C++20 新增會自動 join 的 `std::jthread`、`std::latch` 與 `std::counting_semaphore`，本課的 C++17 程式則都明確呼叫 `join`。' },
        { type: 'p', text: 'Python 的 `threading` 適合 I/O 密集的工作（等網路、等檔案時 GIL 會被釋放），CPU 密集的計算要平行加速則用 `multiprocessing` 或 `concurrent.futures.ProcessPoolExecutor`。GIL 只保證直譯器本身的資料不壞掉，不保證你的程式正確，所以第一個範例的鎖不能省。JavaScript 每個執行環境（主執行緒或一個 worker）只有一條執行緒，事件迴圈裡的程式不需要為共享計數器加鎖；要注意的是不要把「檢查」與「更新」用 `await` 隔開，否則別的工作會在中間插進來。' },
        { type: 'callout', tone: 'tip', title: '設計順序：先想辦法不共享', text: '遇到多執行緒問題，先問「能不能不共享」：讓每個執行緒處理自己的那一份資料，最後再合併；需要傳遞資料時，用阻塞佇列交給下一個執行緒（生產者—消費者），而不是共用一個物件。真的必須共享時，用一把鎖保護一組相關的資料，臨界區越短越好，持有鎖時不要做 I/O 或呼叫外部程式碼；需要多把鎖時，規定一個固定的上鎖順序並寫在註解裡。' },
      ],
    },
  ],
  examples: [
    {
      id: 'mutex-counter', title: '用互斥鎖保護共享計數器', description: '4 個執行緒各把同一個計數器加 1000 次，每次都在鎖裡加：C++ 的 std::lock_guard、Java 的 synchronized 方法、Python 的 with lock。JavaScript 用 4 個 async 工作在同一條執行緒上輪流執行，說明事件迴圈為什麼不需要鎖。',
      output: 'counter = 4000',
      code: {
        'C++': code`#include <iostream>
#include <mutex>
#include <thread>
#include <vector>

int counter = 0;
std::mutex m;  // 所有執行緒共用同一把鎖

void work(int times) {
    for (int i = 0; i < times; ++i) {
        std::lock_guard<std::mutex> guard(m);  // 上鎖；離開這一輪迴圈時自動解鎖
        ++counter;                             // 臨界區
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int t = 0; t < 4; ++t) threads.emplace_back(work, 1000);
    for (auto& th : threads) th.join();  // 等全部結束才讀取
    std::cout << "counter = " << counter << "\n";
    return 0;
}`,
        Java: code`public class Main {
    private static int counter = 0;

    // synchronized 靜態方法：同一時間只有一個執行緒能進入（鎖是 Main.class）
    private static synchronized void increment() {
        counter++;
    }

    public static void main(String[] args) throws InterruptedException {
        Thread[] threads = new Thread[4];
        for (int t = 0; t < threads.length; t++) {
            threads[t] = new Thread(() -> {
                for (int i = 0; i < 1000; i++) increment();
            });
            threads[t].start();
        }
        for (Thread th : threads) th.join();  // 等全部結束才讀取
        System.out.println("counter = " + counter);
    }
}`,
        Python: code`import threading

counter = 0
lock = threading.Lock()  # 所有執行緒共用同一把鎖


def work(times):
    global counter
    for _ in range(times):
        with lock:  # 取得鎖；離開 with 區塊時一定會釋放
            counter += 1


threads = [threading.Thread(target=work, args=(1000,)) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()  # 等全部結束才讀取
print(f"counter = {counter}")`,
        JavaScript: code`// 這段程式只在一條執行緒上執行：4 個 async 工作由事件迴圈輪流執行
let counter = 0;

async function work(times) {
    for (let i = 0; i < times; i++) {
        counter++;    // 一次做完，中間不會被別的工作插進來，所以不需要鎖
        await null;   // 在這裡讓出執行權，其他工作才會執行
    }
}

Promise.all([work(1000), work(1000), work(1000), work(1000)]).then(() => {
    console.log("counter = " + counter);
});`,
      },
    },
    {
      id: 'atomic-tickets', title: '原子操作發號碼牌：不會有兩人拿到同一號', description: '4 個執行緒各抽 500 張號碼牌，每次「取得舊值並加 1」：C++ 的 std::atomic<int>::fetch_add、Java 的 AtomicInteger.getAndIncrement、JavaScript 在 worker_threads 中對 SharedArrayBuffer 用 Atomics.add；Python 沒有原子整數，用一把鎖寫出同樣的操作。',
      output: 'tickets = 2000\nduplicates = 0',
      code: {
        'C++': code`#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

constexpr int T = 4, N = 500;
std::atomic<int> ticket{0};

int main() {
    std::vector<std::vector<int>> got(T);  // 每個執行緒只寫自己的那一格，不共享
    std::vector<std::thread> threads;
    for (int t = 0; t < T; ++t)
        threads.emplace_back([&got, t] {
            for (int i = 0; i < N; ++i) got[t].push_back(ticket.fetch_add(1));  // 回傳舊值並加 1，不可分割
        });
    for (auto& th : threads) th.join();
    std::vector<int> seen(T * N, 0);
    int duplicates = 0;
    for (const auto& list : got)
        for (int id : list)
            if (++seen[id] == 2) ++duplicates;  // 某個號碼第二次出現
    std::cout << "tickets = " << ticket.load() << "\n";
    std::cout << "duplicates = " << duplicates << "\n";
    return 0;
}`,
        Java: code`import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        final int T = 4, N = 500;
        AtomicInteger ticket = new AtomicInteger();
        int[][] got = new int[T][N];  // 每個執行緒只寫自己的那一列，不共享
        Thread[] threads = new Thread[T];
        for (int t = 0; t < T; t++) {
            final int me = t;
            threads[t] = new Thread(() -> {
                for (int i = 0; i < N; i++) got[me][i] = ticket.getAndIncrement();  // 回傳舊值並加 1，不可分割
            });
            threads[t].start();
        }
        for (Thread th : threads) th.join();
        int[] seen = new int[T * N];
        int duplicates = 0;
        for (int[] list : got)
            for (int id : list)
                if (++seen[id] == 2) duplicates++;  // 某個號碼第二次出現
        System.out.println("tickets = " + ticket.get());
        System.out.println("duplicates = " + duplicates);
    }
}`,
        Python: code`import threading
from collections import Counter

T, N = 4, 500
next_ticket = 0
lock = threading.Lock()
got = [[] for _ in range(T)]  # 每個執行緒只寫自己的串列，不共享


def get_and_increment():
    """標準函式庫沒有原子整數：用一把鎖讓「取得舊值並加 1」不可分割。"""
    global next_ticket
    with lock:
        old = next_ticket
        next_ticket += 1
        return old


def work(me):
    for _ in range(N):
        got[me].append(get_and_increment())


threads = [threading.Thread(target=work, args=(t,)) for t in range(T)]
for th in threads:
    th.start()
for th in threads:
    th.join()
counts = Counter(x for lst in got for x in lst)
print(f"tickets = {next_ticket}")
print(f"duplicates = {sum(1 for c in counts.values() if c > 1)}")`,
        JavaScript: code`const { Worker } = require("worker_threads");

const T = 4, N = 500;
// [0] 是下一個號碼；[1 + id] 記錄號碼 id 被拿到幾次。SharedArrayBuffer 是所有 worker 共用的記憶體
const shared = new Int32Array(new SharedArrayBuffer(4 * (1 + T * N)));

function take() {  // 在 worker 執行緒中執行
    const { workerData } = require("worker_threads");
    const view = new Int32Array(workerData.buffer);
    for (let i = 0; i < workerData.n; i++) {
        const id = Atomics.add(view, 0, 1);  // 回傳舊值並加 1，不可分割
        Atomics.add(view, 1 + id, 1);
    }
}

let finished = 0;
for (let t = 0; t < T; t++) {
    const worker = new Worker("(" + take.toString() + ")()", { eval: true, workerData: { buffer: shared.buffer, n: N } });
    worker.on("exit", () => {  // 相當於 join：等每個 worker 都結束才讀結果
        if (++finished < T) return;
        let duplicates = 0;
        for (let id = 0; id < T * N; id++) if (shared[1 + id] > 1) duplicates++;
        console.log("tickets = " + Atomics.load(shared, 0));
        console.log("duplicates = " + duplicates);
    });
}`,
      },
    },
    {
      id: 'fixed-order', title: '方向相反的轉帳：固定鎖順序避免死結', description: 'T1 把 A 的錢轉給 B、T2 同時把 B 的錢轉給 A。C++17 用 std::scoped_lock 一次取得兩把鎖；Java（ReentrantLock）與 Python 一律先鎖編號小的帳戶。JavaScript 在單一執行緒上執行，轉帳是同步函式，不需要鎖。',
      output: 'A = 90, B = 110\ntotal = 200',
      code: {
        'C++': code`#include <iostream>
#include <mutex>
#include <thread>

struct Account {
    int balance = 100;
    std::mutex m;
};

void transfer(Account& from, Account& to, int amount) {
    std::scoped_lock lock(from.m, to.m);  // C++17：一次取得兩把鎖，內建避免死結的演算法
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a, b;
    std::thread t1([&] { for (int i = 0; i < 30; ++i) transfer(a, b, 1); });
    std::thread t2([&] { for (int i = 0; i < 10; ++i) transfer(b, a, 2); });  // 方向相反
    t1.join();
    t2.join();
    std::cout << "A = " << a.balance << ", B = " << b.balance << "\n";
    std::cout << "total = " << a.balance + b.balance << "\n";
    return 0;
}`,
        Java: code`import java.util.concurrent.locks.ReentrantLock;

public class Main {
    static class Account {
        final int id;
        int balance = 100;
        final ReentrantLock lock = new ReentrantLock();
        Account(int id) { this.id = id; }
    }

    // 固定鎖順序：一律先鎖 id 小的帳戶，再鎖 id 大的
    static void transfer(Account from, Account to, int amount) {
        Account first = from.id < to.id ? from : to, second = first == from ? to : from;
        first.lock.lock();
        try {
            second.lock.lock();
            try {
                from.balance -= amount;
                to.balance += amount;
            } finally { second.lock.unlock(); }
        } finally { first.lock.unlock(); }  // 不論是否丟出例外都會解鎖
    }

    public static void main(String[] args) throws InterruptedException {
        Account a = new Account(1), b = new Account(2);
        Thread t1 = new Thread(() -> { for (int i = 0; i < 30; i++) transfer(a, b, 1); });
        Thread t2 = new Thread(() -> { for (int i = 0; i < 10; i++) transfer(b, a, 2); });  // 方向相反
        t1.start(); t2.start();
        t1.join(); t2.join();
        System.out.println("A = " + a.balance + ", B = " + b.balance);
        System.out.println("total = " + (a.balance + b.balance));
    }
}`,
        Python: code`import threading


class Account:
    def __init__(self, id_, balance):
        self.id = id_
        self.balance = balance
        self.lock = threading.Lock()


def transfer(src, dst, amount):
    first, second = sorted((src, dst), key=lambda acc: acc.id)  # 固定鎖順序：先鎖 id 小的
    with first.lock, second.lock:
        src.balance -= amount
        dst.balance += amount


def repeat(times, src, dst, amount):
    for _ in range(times):
        transfer(src, dst, amount)


a, b = Account(1, 100), Account(2, 100)
t1 = threading.Thread(target=repeat, args=(30, a, b, 1))
t2 = threading.Thread(target=repeat, args=(10, b, a, 2))  # 方向相反
for t in (t1, t2):
    t.start()
for t in (t1, t2):
    t.join()
print(f"A = {a.balance}, B = {b.balance}")
print(f"total = {a.balance + b.balance}")`,
        JavaScript: code`// 單一執行緒：transfer 是同步函式，執行完之前不會有別的程式插進來，所以不需要鎖，也不會死結
const a = { balance: 100 };
const b = { balance: 100 };

function transfer(from, to, amount) {
    from.balance -= amount;
    to.balance += amount;
}

async function repeat(times, from, to, amount) {
    for (let i = 0; i < times; i++) {
        transfer(from, to, amount);
        await null;  // 只有在這裡讓出時，另一個方向的轉帳才會執行
    }
}

Promise.all([repeat(30, a, b, 1), repeat(10, b, a, 2)]).then(() => {
    console.log("A = " + a.balance + ", B = " + b.balance);
    console.log("total = " + (a.balance + b.balance));
});`,
      },
    },
    {
      id: 'producer-consumer', title: '有界緩衝區：一個生產者、一個消費者', description: '容量 2 的緩衝區：生產者放入 1～5 與結束記號 −1，消費者依序取出。C++ 用 std::mutex 與兩個條件變數（while 迴圈等待），Java 用 ArrayBlockingQueue，Python 用 queue.Queue，JavaScript 用 Promise 寫出同樣結構的非同步緩衝區。',
      output: 'got 1\ngot 2\ngot 3\ngot 4\ngot 5\ndone',
      code: {
        'C++': code`#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <thread>

const std::size_t CAPACITY = 2;
std::queue<int> buffer;
std::mutex m;
std::condition_variable notFull, notEmpty;

void put(int x) {
    std::unique_lock<std::mutex> lock(m);
    while (buffer.size() == CAPACITY) notFull.wait(lock);  // 滿了就等；醒來後重新檢查
    buffer.push(x);
    notEmpty.notify_one();
}

int take() {
    std::unique_lock<std::mutex> lock(m);
    notEmpty.wait(lock, [] { return !buffer.empty(); });  // 帶條件的 wait，內部就是同樣的 while 迴圈
    int x = buffer.front();
    buffer.pop();
    notFull.notify_one();
    return x;
}

int main() {
    std::thread producer([] { for (int i = 1; i <= 5; ++i) put(i); put(-1); });  // -1 表示結束
    for (int x = take(); x != -1; x = take()) std::cout << "got " << x << "\n";
    producer.join();
    std::cout << "done\n";
}`,
        Java: code`import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<Integer> buffer = new ArrayBlockingQueue<>(2);  // 容量 2 的有界緩衝區
        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 5; i++) buffer.put(i);  // 滿了就阻塞，等消費者取走
                buffer.put(-1);  // -1 表示結束
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        producer.start();
        for (int x = buffer.take(); x != -1; x = buffer.take()) System.out.println("got " + x);  // 空了就阻塞
        producer.join();
        System.out.println("done");
    }
}`,
        Python: code`import queue
import threading

buffer = queue.Queue(maxsize=2)  # 容量 2 的有界緩衝區，內部是鎖加上條件變數
DONE = None  # 結束記號


def producer():
    for i in range(1, 6):
        buffer.put(i)  # 滿了就阻塞，等消費者取走
    buffer.put(DONE)


t = threading.Thread(target=producer)
t.start()
while (x := buffer.get()) is not DONE:  # 空了就阻塞
    print(f"got {x}")
t.join()
print("done")`,
        JavaScript: code`// 事件迴圈版的有界緩衝區：條件不成立時 await 一個 Promise，狀態改變時把等待者全部喚醒
class BoundedBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.items = [];
        this.waiters = [];  // 相當於條件變數的等待集合
    }
    wakeAll() {
        for (const resolve of this.waiters.splice(0)) resolve();  // 取出並清空等待集合，逐一喚醒
    }
    async put(x) {
        while (this.items.length === this.capacity) await new Promise(r => this.waiters.push(r));  // 醒來後重新檢查
        this.items.push(x);
        this.wakeAll();
    }
    async take() {
        while (this.items.length === 0) await new Promise(r => this.waiters.push(r));
        const x = this.items.shift();
        this.wakeAll();
        return x;
    }
}

const buffer = new BoundedBuffer(2);
async function producer() {
    for (let i = 1; i <= 5; i++) await buffer.put(i);
    await buffer.put(-1);  // -1 表示結束
}
async function consumer() {
    for (let x = await buffer.take(); x !== -1; x = await buffer.take()) console.log("got " + x);
    console.log("done");
}
Promise.all([producer(), consumer()]);`,
      },
    },
  ],
  visualization: {
    kind: 'stack-queue', title: '有界緩衝區：條件變數的等待與喚醒（Python 模擬）', language: 'Python',
    code: TRACE_CODE,
    steps: boundedBufferSteps(2, [1, 2, 3], ['C', 'P', 'P', 'P', 'C', 'P', 'C', 'C']),
  },
  quiz: [
    {
      id: 'q1', prompt: '兩個執行緒各呼叫同一個 Counter 物件的 `increment()` 1000 次，兩個都 `join` 之後印出 `get()`。下列敘述何者正確？',
      code: { language: 'Java', text: code`class Counter {
    private volatile int count = 0;
    void increment() { count++; }
    int get() { return count; }
}` },
      options: [
        '一定是 2000：volatile 讓每個執行緒都讀到最新的值',
        '可能小於 2000：volatile 只保證可見性，count++ 仍是讀、加、寫三步，兩個執行緒可能讀到同一個舊值',
        '可能大於 2000：兩個執行緒同時寫入時，同一次加 1 可能被算兩次',
        '編譯錯誤：volatile 欄位不能使用 ++',
      ],
      answer: 1, explanation: '`volatile` 保證寫入的值馬上被其他執行緒看到、不被重新排序，但不會把 `count++` 的讀、加、寫變成一個不可分割的操作：兩個執行緒都讀到 7、都寫回 8，就少算一次，所以結果可能小於 2000（不一定每次都發生）。「一定是 2000」把可見性誤當成原子性；每次寫回的都是「自己讀到的值加 1」，總共只寫 2000 次，不可能多算；`volatile int` 可以使用 `++`，能編譯。修正方式是改用 `AtomicInteger` 的 `incrementAndGet()` 或把方法宣告成 `synchronized`。',
    },
    {
      id: 'q2', prompt: '把轉帳改成「不論方向，一律先鎖編號小的帳戶、再鎖編號大的帳戶」之後，就不會死結。這個做法破壞了死結四個條件中的哪一個？',
      options: ['互斥', '持有並等待', '不可搶佔', '循環等待'],
      answer: 3, explanation: '依固定順序上鎖後，正在等鎖 L 的執行緒手上只有比 L 編號小的鎖；沿著「誰在等誰」走下去，被等待的鎖編號只會越來越大，不可能繞回起點，所以循環等待被破壞。其他三個條件都還在：鎖仍然一次只給一個執行緒（互斥）；執行緒仍然拿著第一把鎖等第二把（持有並等待）；鎖仍然只能由持有者自己釋放（不可搶佔）。只要四個條件少一個，死結就不會發生。',
    },
    {
      id: 'q3', prompt: '兩個消費者執行緒都呼叫下面的 `take()`；生產者每放入一個元素就呼叫 `cv.notify_all()`。這段程式有什麼問題？',
      code: { language: 'C++', text: code`int take() {
    std::unique_lock<std::mutex> lock(m);
    if (q.empty()) cv.wait(lock);
    int x = q.front();
    q.pop();
    return x;
}` },
      options: [
        '沒有問題：被喚醒就代表佇列裡有元素，用 if 和用 while 一樣',
        '`wait` 返回時佇列可能仍是空的（虛假喚醒，或另一個消費者先取走了），接著的 `q.front()` 是未定義行為；應改成 while',
        '`wait` 不會釋放鎖，生產者永遠拿不到鎖，一定死結',
        '`std::condition_variable::wait` 只接受 `std::lock_guard`，這段程式無法編譯',
      ],
      answer: 1, explanation: '放入一個元素後 `notify_all` 會把兩個消費者都叫醒，但只有一個能先拿到鎖並取走元素；另一個拿到鎖時佇列已經空了，`if` 不會再檢查，對空的 `std::queue` 呼叫 `front()` 是未定義行為。規格也允許沒有通知就返回的虛假喚醒。改成 `while (q.empty()) cv.wait(lock);` 或 `cv.wait(lock, [] { return !q.empty(); });` 就會在醒來後重新檢查。`wait` 會在等待期間釋放鎖，所以不會因此死結；它需要的正是 `std::unique_lock`，`std::lock_guard` 不能解鎖，反而不能傳給 `wait`。',
    },
    {
      id: 'q4', prompt: '`a` 與 `b` 都是 `std::atomic<int>`，初值都是 50。執行緒 1 反覆執行 `a -= 10; b += 10;`（把 10 從 a 搬到 b），執行緒 2 同時印出 `a + b`。下列敘述何者正確？',
      options: [
        '一定印出 100：每個變數都是原子的，所以兩個變數的總和也受到保護',
        '可能印出 100 以外的值（例如 90 或 110）：每個操作各自是原子的，但「a 減、b 加」整體不是，讀取可能落在兩步之間',
        '可能印出 95：沒有加鎖時可能讀到只寫了一半的 int',
        '無法編譯：std::atomic<int> 不支援 -= 與 +=',
      ],
      answer: 1, explanation: '原子操作只保證單一變數的單一操作不可分割。執行緒 2 若在 `a -= 10` 之後、`b += 10` 之前讀取，得到 40 + 50 = 90；若先讀了 a（50），接著執行緒 1 做完一整次搬移，再讀到 b（60），得到 110。要維持「a + b 是 100」這種牽涉兩個變數的不變條件，必須把搬移與讀取都放進同一把鎖。atomic 的每次讀寫都完整，不會讀到寫一半的值（95 不可能）；`std::atomic<int>` 支援 `+=`、`-=`，可以編譯。',
    },
    {
      id: 'q5', prompt: 'JavaScript（Node.js）：`let count = 0; async function add() { const v = count; await null; count = v + 1; }`，接著執行 `Promise.all([add(), add(), add()]).then(() => console.log(count));`。印出什麼？',
      options: ['3', '1', '0', '每次執行可能不同，介於 1 到 3 之間'],
      answer: 1, explanation: '三次 `add()` 依序同步執行到 `await` 為止：三個都讀到 `count` 是 0、各自記在 v 裡，然後暫停。之後事件迴圈依序恢復它們，每一個都寫入 0 + 1，所以印出 1，三次更新遺失了兩次。JavaScript 只有一條執行緒，微任務的順序由規格決定，所以每次都是 1，不會在 1 到 3 之間變動；「3」是以為單執行緒就不會遺失更新，但 `await` 把讀與寫拆開，別的工作就能在中間插進來。所有寫入都是 v + 1，不會是 0。把 `count++` 放在 `await` 之後、讀寫不要被 await 隔開，就會印出 3。',
    },
    {
      id: 'q6', prompt: '兩個執行緒分別執行 `worker1` 與 `worker2`，`lock_a`、`lock_b` 都是 `threading.Lock()`。下列敘述何者正確？',
      code: { language: 'Python', text: code`def worker1():
    with lock_a:
        with lock_b:
            print("worker1")


def worker2():
    with lock_b:
        with lock_a:
            print("worker2")` },
      options: [
        '一定會死結：兩個函式的上鎖順序相反',
        '可能死結：如果 worker1 拿到 lock_a、worker2 拿到 lock_b，兩者會互相等待；排程沒有這樣交錯時則能順利完成',
        '不會死結：等待內層的鎖時，with 會自動釋放外層的鎖',
        '不會死結：GIL 讓兩個執行緒不會同時執行',
      ],
      answer: 1, explanation: '上鎖順序相反讓循環等待有機會出現，但死結只在特定的交錯下發生：worker1 取得 lock_a 後、取得 lock_b 前，worker2 剛好取得 lock_b，兩者就各自等對方手上的鎖。如果 worker1 一口氣拿到兩把鎖，worker2 只是等一下，程式正常結束，所以不是「一定」。`with` 等待時不會釋放外層已持有的鎖（這正是持有並等待）；GIL 只讓同一時間只有一個執行緒執行 Python 位元組碼，等待鎖的執行緒會釋放 GIL，另一個照樣能執行，無法避免死結。修正：兩個函式都先鎖 lock_a 再鎖 lock_b。',
    },
    {
      id: 'q7', prompt: '下面的 Python 程式在單一執行緒中執行 `add_twice("x")`，會發生什麼事？',
      code: { language: 'Python', text: code`import threading

lock = threading.Lock()
items = []


def add(item):
    with lock:
        items.append(item)


def add_twice(item):
    with lock:
        add(item)
        add(item)` },
      options: [
        'items 變成兩個 "x"',
        '程式永遠卡住：持有 lock 的執行緒在 add 裡又要取得同一把 lock，而 Lock 不可重入，它在等自己釋放',
        '丟出 RuntimeError：同一個執行緒不能取得同一把鎖兩次',
        'items 只有一個 "x"：第二次取得鎖失敗，那次 append 被略過',
      ],
      answer: 1, explanation: '`threading.Lock` 不記得是誰持有它：`add_twice` 已經持有 lock，`add` 的 `with lock:` 再要求同一把鎖，只能等它被釋放，但釋放它的正是正在等待的自己，所以永遠卡住，這是只有一個執行緒的死結。`Lock` 不會丟出例外，也不會略過；取得失敗只有在指定 `blocking=False` 或 `timeout` 時才會回傳 False。改用 `threading.RLock`（可重入鎖，同一個執行緒可以重複取得），或讓內部函式假設呼叫端已經持有鎖。Java 的 `synchronized` 與 `ReentrantLock` 都可重入；C++ 對同一個 `std::mutex` 重複上鎖是未定義行為。',
    },
  ],
  exercises: [
    {
      id: 'e1', title: '模擬上鎖並偵測死結',
      statement: '寫一個鎖的模擬器，依序處理 n 個事件，找出第一次發生的死結。每個事件是一行 `執行緒 acquire 鎖` 或 `執行緒 release 鎖`（名稱不含空白）。規則：取得（acquire）沒有人持有的鎖，就成為持有者，輸出 `T acquires L`；鎖被別的執行緒持有時，T 被阻塞並排進這把鎖的等待佇列，輸出 `T waits for L (held by U)`；釋放（release）時輸出 `T releases L`，若有執行緒在等這把鎖，等最久的那個立刻取得它，再輸出 `W acquires L`。每次有執行緒被阻塞後，沿著等待圖檢查：T 等 U 持有的鎖；若 U 也被阻塞，再看 U 等的鎖由誰持有……一路走到沒有被阻塞的執行緒為止，或回到 T。回到 T 就是死結：輸出 `deadlock: ` 加上這條路徑（從 T 開始、以 T 結束，用 ` -> ` 連接），然後停止，不再處理後面的事件。錯誤的事件輸出一行錯誤並略過（狀態不變）：格式不對（不是三個字，或第二個字不是 acquire／release）是 `error: bad event`；被阻塞的執行緒不能再發出事件，是 `error: T is blocked`；釋放自己沒持有的鎖是 `error: T does not hold L`；取得自己已經持有的鎖是 `error: T already holds L`（鎖不可重入）。依序檢查這四種錯誤。全部處理完都沒有死結時，最後輸出 `no deadlock`。',
      inputFormat: '第一行是事件數 n；接著 n 行，每行一個事件。',
      outputFormat: '依規則逐行輸出；以 `deadlock: …` 或 `no deadlock` 結束。',
      constraints: ['0 ≤ n ≤ 100', '執行緒與鎖的名稱長度 1～10，只含英文字母與數字', '輸入一定有 n 行事件，但事件本身可能格式錯誤（包含空行）'],
      samples: [{ kind: 'normal', input: '4\nT1 acquire A\nT2 acquire B\nT1 acquire B\nT2 acquire A', output: 'T1 acquires A\nT2 acquires B\nT1 waits for B (held by T2)\nT2 waits for A (held by T1)\ndeadlock: T2 -> T1 -> T2', note: '經典的上鎖順序相反：T2 等 T1 持有的 A，T1 又在等 T2 持有的 B，回到 T2，形成環' }],
      tests: [
        { kind: 'normal', input: '8\nT1 acquire A\nT2 acquire A\nT1 acquire B\nT1 release B\nT1 release A\nT2 acquire B\nT2 release B\nT2 release A', output: 'T1 acquires A\nT2 waits for A (held by T1)\nT1 acquires B\nT1 releases B\nT1 releases A\nT2 acquires A\nT2 acquires B\nT2 releases B\nT2 releases A\nno deadlock', note: '兩個執行緒都依 A、B 的固定順序上鎖：T2 只是等一下，A 被釋放時直接交給 T2' },
        { kind: 'normal', input: '8\nT1 acquire A\nT2 acquire B\nT3 acquire C\nT1 acquire B\nT2 acquire C\nT3 acquire A\nT1 release A\nT4 acquire D', output: 'T1 acquires A\nT2 acquires B\nT3 acquires C\nT1 waits for B (held by T2)\nT2 waits for C (held by T3)\nT3 waits for A (held by T1)\ndeadlock: T3 -> T1 -> T2 -> T3', note: '三個執行緒的環；偵測到死結後停止，後面兩個事件不處理' },
        { kind: 'edge', input: '0', output: 'no deadlock', note: '沒有任何事件' },
        { kind: 'edge', input: '7\nT1 acquire A\nT2 acquire A\nT3 acquire A\nT1 release A\nT2 release A\nT3 release A\nT2 acquire A', output: 'T1 acquires A\nT2 waits for A (held by T1)\nT3 waits for A (held by T1)\nT1 releases A\nT2 acquires A\nT2 releases A\nT3 acquires A\nT3 releases A\nT2 acquires A\nno deadlock', note: '等待佇列先來先得：A 被釋放時交給等最久的 T2，不是 T3' },
        { kind: 'edge', input: '6\nT1 acquire A\nT2 acquire B\nT2 acquire A\nT3 acquire B\nT1 acquire C\nT1 acquire B', output: 'T1 acquires A\nT2 acquires B\nT2 waits for A (held by T1)\nT3 waits for B (held by T2)\nT1 acquires C\nT1 waits for B (held by T2)\ndeadlock: T1 -> T2 -> T1', note: 'T3 → T2 → T1 是一條鏈，走到沒被阻塞的 T1 就停，不是死結；直到 T1 也去等 B 才形成環（T3 不在環上）' },
        { kind: 'error', input: '7\nT1 acquire A\nT1 acquire A\nT2 release A\nT2 lock A\nT2 acquire A\nT2 release A\nT1', output: 'T1 acquires A\nerror: T1 already holds A\nerror: T2 does not hold A\nerror: bad event\nT2 waits for A (held by T1)\nerror: T2 is blocked\nerror: bad event\nno deadlock', note: '重複取得、釋放別人的鎖、不認得的動作、被阻塞的執行緒再發出事件、缺少欄位' },
        { kind: 'error', input: '5\nT1 release Z\n\nT1 acquire A B\nT1 acquire A\nT1 release A', output: 'error: T1 does not hold Z\nerror: bad event\nerror: bad event\nT1 acquires A\nT1 releases A\nno deadlock', note: '釋放沒有人持有的鎖、空行、多一個欄位；錯誤的事件不改變狀態' },
      ],
      hints: [
        '用三個對照表：鎖 → 持有者、被阻塞的執行緒 → 它在等的鎖、鎖 → 等待者的佇列（先進先出）。',
        '每個執行緒最多等一把鎖、每把鎖最多一個持有者，所以從 T 出發的路只有一條：T 等的鎖的持有者、那個人等的鎖的持有者……不需要一般的圖搜尋。',
        '在這之前沒有死結，而新加上的只有從 T 出發的邊，所以新的環一定經過 T：走到沒被阻塞的執行緒就可以停下來。',
      ],
      solution: {
        'C++': code`#include <deque>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

int main() {
    int n;
    std::string line;
    std::cin >> n;
    std::getline(std::cin, line);  // 讀掉第一行剩下的換行
    std::map<std::string, std::string> holder;   // 鎖 -> 持有它的執行緒
    std::map<std::string, std::string> waiting;  // 被阻塞的執行緒 -> 它在等的鎖
    std::map<std::string, std::deque<std::string>> queues;  // 鎖 -> 等待者（先來先得）
    for (int i = 0; i < n && std::getline(std::cin, line); ++i) {
        std::istringstream in(line);
        std::vector<std::string> parts;
        for (std::string word; in >> word;) parts.push_back(word);
        if (parts.size() != 3 || (parts[1] != "acquire" && parts[1] != "release")) {
            std::cout << "error: bad event\n";
            continue;
        }
        const std::string& t = parts[0];
        const std::string& lock = parts[2];
        auto owner = holder.find(lock);
        if (waiting.count(t)) {
            std::cout << "error: " << t << " is blocked\n";
        } else if (parts[1] == "release") {
            if (owner == holder.end() || owner->second != t) {
                std::cout << "error: " << t << " does not hold " << lock << "\n";
                continue;
            }
            std::cout << t << " releases " << lock << "\n";
            holder.erase(owner);
            std::deque<std::string>& q = queues[lock];
            if (!q.empty()) {  // 等最久的執行緒接手這把鎖
                std::string w = q.front();
                q.pop_front();
                waiting.erase(w);
                holder[lock] = w;
                std::cout << w << " acquires " << lock << "\n";
            }
        } else if (owner == holder.end()) {
            holder[lock] = t;
            std::cout << t << " acquires " << lock << "\n";
        } else if (owner->second == t) {
            std::cout << "error: " << t << " already holds " << lock << "\n";
        } else {
            std::cout << t << " waits for " << lock << " (held by " << owner->second << ")\n";
            waiting[t] = lock;
            queues[lock].push_back(t);
            std::vector<std::string> path = {t, owner->second};  // 沿著等待圖走
            while (path.back() != t && waiting.count(path.back())) path.push_back(holder[waiting[path.back()]]);
            if (path.back() == t) {
                std::cout << "deadlock: " << path[0];
                for (std::size_t k = 1; k < path.size(); ++k) std::cout << " -> " << path[k];
                std::cout << "\n";
                return 0;
            }
        }
    }
    std::cout << "no deadlock\n";
    return 0;
}`,
        Java: code`import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        int n = Integer.parseInt(in.readLine().trim());
        Map<String, String> holder = new HashMap<>();   // 鎖 -> 持有它的執行緒
        Map<String, String> waiting = new HashMap<>();  // 被阻塞的執行緒 -> 它在等的鎖
        Map<String, ArrayDeque<String>> queues = new HashMap<>();  // 鎖 -> 等待者（先來先得）
        for (int i = 0; i < n; i++) {
            String line = in.readLine();
            String[] parts = line == null ? new String[0] : line.trim().split("\\s+");
            if (parts.length != 3 || !(parts[1].equals("acquire") || parts[1].equals("release"))) {
                System.out.println("error: bad event");
                continue;
            }
            String t = parts[0], lock = parts[2], owner = holder.get(lock);
            if (waiting.containsKey(t)) {
                System.out.println("error: " + t + " is blocked");
            } else if (parts[1].equals("release")) {
                if (!t.equals(owner)) {
                    System.out.println("error: " + t + " does not hold " + lock);
                    continue;
                }
                System.out.println(t + " releases " + lock);
                holder.remove(lock);
                ArrayDeque<String> q = queues.get(lock);
                if (q != null && !q.isEmpty()) {  // 等最久的執行緒接手這把鎖
                    String w = q.poll();
                    waiting.remove(w);
                    holder.put(lock, w);
                    System.out.println(w + " acquires " + lock);
                }
            } else if (owner == null) {
                holder.put(lock, t);
                System.out.println(t + " acquires " + lock);
            } else if (owner.equals(t)) {
                System.out.println("error: " + t + " already holds " + lock);
            } else {
                System.out.println(t + " waits for " + lock + " (held by " + owner + ")");
                waiting.put(t, lock);
                queues.computeIfAbsent(lock, k -> new ArrayDeque<>()).add(t);
                List<String> path = new ArrayList<>(List.of(t, owner));  // 沿著等待圖走
                String last = owner;
                while (!last.equals(t) && waiting.containsKey(last)) {
                    last = holder.get(waiting.get(last));
                    path.add(last);
                }
                if (last.equals(t)) {
                    System.out.println("deadlock: " + String.join(" -> ", path));
                    return;
                }
            }
        }
        System.out.println("no deadlock");
    }
}`,
        Python: code`import sys


def main():
    lines = sys.stdin.read().split("\n")
    n = int(lines[0])
    holder = {}   # 鎖 -> 持有它的執行緒
    waiting = {}  # 被阻塞的執行緒 -> 它在等的鎖
    queues = {}   # 鎖 -> 等待它的執行緒（先來先得）
    for line in lines[1:n + 1]:
        parts = line.split()
        if len(parts) != 3 or parts[1] not in ("acquire", "release"):
            print("error: bad event")
            continue
        t, action, lock = parts
        owner = holder.get(lock)
        if t in waiting:
            print(f"error: {t} is blocked")
        elif action == "release":
            if owner != t:
                print(f"error: {t} does not hold {lock}")
                continue
            print(f"{t} releases {lock}")
            del holder[lock]
            if queues.get(lock):
                w = queues[lock].pop(0)  # 等最久的執行緒接手這把鎖
                del waiting[w]
                holder[lock] = w
                print(f"{w} acquires {lock}")
        elif owner is None:
            holder[lock] = t
            print(f"{t} acquires {lock}")
        elif owner == t:
            print(f"error: {t} already holds {lock}")
        else:
            print(f"{t} waits for {lock} (held by {owner})")
            waiting[t] = lock
            queues.setdefault(lock, []).append(t)
            path = [t, owner]  # 沿著等待圖走：誰持有我在等的鎖、他又在等誰
            while path[-1] != t and path[-1] in waiting:
                path.append(holder[waiting[path[-1]]])
            if path[-1] == t:
                print("deadlock: " + " -> ".join(path))
                return
    print("no deadlock")


main()`,
        JavaScript: code`const lines = require("fs").readFileSync(0, "utf8").split("\n");
const n = Number(lines[0]);
const holder = new Map();   // 鎖 -> 持有它的執行緒
const waiting = new Map();  // 被阻塞的執行緒 -> 它在等的鎖
const queues = new Map();   // 鎖 -> 等待者（先來先得）

function run() {
    for (let i = 1; i <= n; i++) {
        const parts = (lines[i] ?? "").trim().split(/\s+/);
        if (parts.length !== 3 || (parts[1] !== "acquire" && parts[1] !== "release")) {
            console.log("error: bad event");
            continue;
        }
        const [t, action, lock] = parts;
        const owner = holder.get(lock);
        if (waiting.has(t)) {
            console.log("error: " + t + " is blocked");
        } else if (action === "release") {
            if (owner !== t) {
                console.log("error: " + t + " does not hold " + lock);
                continue;
            }
            console.log(t + " releases " + lock);
            holder.delete(lock);
            const q = queues.get(lock) ?? [];
            if (q.length > 0) {  // 等最久的執行緒接手這把鎖
                const w = q.shift();
                waiting.delete(w);
                holder.set(lock, w);
                console.log(w + " acquires " + lock);
            }
        } else if (owner === undefined) {
            holder.set(lock, t);
            console.log(t + " acquires " + lock);
        } else if (owner === t) {
            console.log("error: " + t + " already holds " + lock);
        } else {
            console.log(t + " waits for " + lock + " (held by " + owner + ")");
            waiting.set(t, lock);
            if (!queues.has(lock)) queues.set(lock, []);
            queues.get(lock).push(t);
            const path = [t, owner];  // 沿著等待圖走
            while (path.at(-1) !== t && waiting.has(path.at(-1))) path.push(holder.get(waiting.get(path.at(-1))));
            if (path.at(-1) === t) {
                console.log("deadlock: " + path.join(" -> "));
                return;
            }
        }
    }
    console.log("no deadlock");
}

run();`,
      },
      judge: 'none',
    },
  ],
};
