# 技術架構與教材盤點

> 盤點日期：2026-10-29，Asia/Taipei。以當日檔案與隔離檢查為準；本輪僅新增交接文件，未修復功能、變更資產或部署。

## 模組與資料流

```text
src/content/courses.ts ── Course／三語固定範例／marker → highlights
          │
App Router page → getCourse(slug) → Lesson（Server）→ Lab（Client）
          │                                  │
          │             輸入草稿 → 套用／驗證 → generateSteps(slug, Input)
          │                                  │
          └── metadata／static params      Step[] 不可變快照
                                             │
                          cursor／timer／speed → Scene＋文字＋程式行標記

src/lib/islands/data.ts + getCourse（只取導航資料）
          → /islands → IslandsExplorer → dynamic IslandScene（ssr:false）
                          │                    │
                   LearningNavigation      Canvas／CameraController
                          │                    └→ Island → local geometry models
                     /learn/[slug]
```

`src/app/layout.tsx` 提供 Header、skip link、主題初始 script、footer。全站樣式在 globals.css；Button 使用 Radix Slot、CVA 與 tailwind utility；無完整外部 shadcn 元件庫依賴，`components.json` 為設定。

## 內容管理與引擎契約

`src/content/courses.ts` 的 Course 包含 slug、category、difficulty、prerequisites、learningObjectives、concept、useCase、note、complexities、visualizationType 及三語 codeExamples。`examples()` 依 marker 子字串產生行號；沒有 CMS、Markdown 教材檔或遠端資料 API。

`src/lib/engine.ts`：

- `AlgorithmId` 六值 union；`Input` 為所有教材共用的 values／target／index／value／operation／edges。
- `Step` 為 values、active、visited、frontier、edges、description、phase、codeKey、可選 result 的完整快照。
- `generateSteps` 純函式、不依賴 React；每步複製陣列與 edges，游標後退只是讀舊快照。
- Lab 的 timer 850/speed ms；切換語言不重建步驟，套用輸入／重置／時間軸會停止或重設播放。
- 預設為 Python，支援 C++、Java。程式碼是固定可執行示例，使用者輸入只影響動畫，網站沒有執行使用者程式碼。
- parseNumbers 預設最多 16 個 −999..999 整數；BFS 限 10 且 UI 強制連續 0..n−1 節點。Binary Search 拒絕未排序輸入。

## 六教材逐項盤點

所有資料／三語範例都在 `src/content/courses.ts`；所有演算法在 `src/lib/engine.ts`；互動都經 `src/components/lab.tsx`。每課均有兩條入口，未使用不同播放引擎。

| 教材／路由 | 互動與視圖 | 範例固定輸出 | 已執行測試／限制 |
|---|---|---|---|
| Array：`/learn/array`、`/visualize/array` | cells；讀取／更新索引、新值 | `6`、`9` 兩行 | access/update、越界、快照與 DOM 回放；空陣列索引無效 |
| Stack：`/learn/stack`、`/visualize/stack` | stack；Push／Pop、新值、空集合 | `9` | push/pop/空集合、快照、DOM；一次單一操作，不是持續累積互動歷史 |
| Queue：`/learn/queue`、`/visualize/queue` | queue；Enqueue／Dequeue | `8` | FIFO／空集合、快照、DOM；動畫 shift 為 O(n)，範例 deque／ArrayDeque 的複雜度不可混淆 |
| Binary Search：`/learn/binary-search`、`/visualize/binary-search` | cells；遞增陣列／target／範圍 frontier | `4` | 找到／找不到／空／重複值／未排序、快照、DOM；相同值不保證第一個索引 |
| Bubble Sort：`/learn/bubble-sort`、`/visualize/bubble-sort` | bars；相鄰比較交換、輸入陣列 | `2 3 4 6 7 8` | 負數／空／單值／重複／已排序／提前結束、快照、DOM；負數以絕對值畫高度，不是有正負軸的長條圖 |
| BFS：`/learn/bfs`、`/visualize/bfs` | SVG graph；無向邊／起點、frontier、visited | `0 1 2 3 4` | 環／不連通／自環／重複邊／孤立起點／錯誤起點、快照、DOM；只遍歷起點分量、不輸出最短路徑重建 |

本輪六課 Python、C++17 都實際執行通過；六課 Java 都因無 JDK skip（非失敗、非通過）。測試檔 `tests/examples.test.ts` 會將三語程式輸出比對固定預期；`tests/engine.test.ts` 有 21 項；`tests/player.test.tsx` 有 12 項。`e2e/player.spec.ts` 對六課與導覽有 22 個桌機／手機模擬案例，但本輪僅列出、沒有執行。沒有 code coverage 百分比，不宣稱完整覆蓋。

## 耦合與新增教材風險

引擎與內容沒有 runtime 互相 import，Course 只 type-import AlgorithmId；不是循環執行依賴。然而有下列**程式結構上的耦合**（靜態分析，不是已發生的 production bug）：

1. 新教材需同步改 `algorithmIds`、`generateSteps` 分支、Course、Lab 的 slug 特例／initial／表單、visualizationType，可能再改測試；不是只新增一筆 JSON。
2. `Step.codeKey: string` 與 marker/highlights 的 `Record<string,number[]>` 無 compile-time 對應，缺 marker 只會變成無高亮；init/done 本來就常無標記，不應誤判內容缺失。
3. 所有教材共用 Input／operation union，無依演算法收窄的 discriminated input；UI 選項會限制操作，但直接呼叫 engine 時能傳不合理的跨教材 operation。
4. `Lab.initial` 與固定範例分開寫預設值，長期可能漂移；說明已告知動畫輸入與固定範例不同，不要誤以為改輸入要生成新程式碼。
5. BFS 與 queue 的 Step 儲存也用在 Bubble Sort 的 visited/frontier 狀態色，型別語意較廣；引擎 complexity 不包含動畫快照。
6. Lesson 將 `<Lab key={course.slug}>` 以換課重掛方式重設，未來改路由或去 key 要補狀態隔離測試。現有 DOM 測試 BFS 回放主要看 description／progress，不能替代 SVG 視覺檢查。

## Logic Islands（邏輯群島）：既有原型與未來 GLB 的邊界

資料契約：`src/lib/islands/types.ts`（IslandDefinition、LearningIsland）、`data.ts`（座標／bounds／映射）、`asset-registry.ts`（原創 geometry 名稱）。目前三島清單已在程式中：

| id／模型 | 地圖角色 | 教材映射 |
|---|---|---|
| foundations／beacon-workshop | 基礎程式島，導覽用，無專屬教材 | catalogEntry → `/learn` |
| structures／data-harbor | 資料結構島 | array、stack、queue → `/learn/[slug]` |
| algorithms／algorithm-observatory | 演算法島 | binary-search、bubble-sort → `/learn/[slug]` |

BFS 不在三島 courseSlugs 中，但 `/islands` 頁註與原教材仍提供 `/learn/bfs`。沒有第四座正式規劃島或 BFS 專島證據，不自行添加。

現有互動：整島 group pointer-over/out 切換 hover，click 在 event.delta<6 選島；Drei Html 的 button 可鍵盤聚焦；側欄／list 導航使用 Next Link。CameraControls 共用 bounds 計算 fit，減少動作偏好會關閉平滑過渡；DPR 1–1.5、frameloop demand、low-power、1024 directional shadow。滑鼠 wheel／旋轉 disabled，觸控雙指 zoom 有設定。

WebGL contextlost／error boundary／Canvas fallback／清單切換已實作，但**建置未通過且沒有原型瀏覽器測試**，只能標 Implemented，不能說可存取性／手機已驗收。Canvas 並非 keyboard 可操作的所有 3D 物件，語意替代由清單／Html 按鈕提供。

GLB 正式載入策略：**Not Started**。沒有 useGLTF、GLTFLoader、模型 URL、preload、解碼器、GLB 錯誤重試、子節點 hover/click 或記憶體釋放測試；目前 dynamic import 只延後 R3F 場景 JS。不能把外部 viewer 的測試直接當成 `/islands` 的結果。

Phase D 的規劃方向應為：在人工批准後新增 GLB registry 來源型別、選定版本、只載入核准候選、維持 list fallback／reduced motion、由 interaction_id 對應真實路由；校對尺寸／bounds／相機／材質／光照，補 SSR、載入失敗、raycast、觸控與資源清理測試。不要拿 v2.1 工坊 route metadata `/learn` 自動推導出尚不存在的專屬課程。
