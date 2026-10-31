// @ts-check
/**
 * D.3-4B manual checks on the phone, one list for the checklist page of perf/device/server.mjs and the acceptance
 * table in docs/handoff/DEVICE_ACCEPTANCE.md (a unit test keeps the IDs in step). Only /islands/candidate: the old page
 * is compared by the automatic measurement. Every item starts as Not Tested and only the tester changes it. `mode` is
 * the fault the tool injects first; `optional` marks what needs hardware or settings the tester may not have.
 */

/** @typedef {{ id: string, area: string, check: string, expect: string, mode?: 'webgl-fail' | 'glb-fail' | 'context-loss', optional?: boolean }} Item */

/** @type {Item[]} */
export const ITEMS = [
  { id: 'C-01', area: '相機', check: '單指在地圖上左右拖曳', expect: '地圖跟著水平旋轉，放開後停住；不會聚焦島嶼' },
  { id: 'C-02', area: '相機', check: '單指在地圖上上下滑動', expect: '整頁往上下捲動，地圖不旋轉' },
  { id: 'C-03', area: '相機', check: '雙指在地圖上放大、縮小各數次', expect: '地圖平順縮放；整頁不跟著放大' },
  { id: 'C-04', area: '相機', check: '全景時點島嶼名牌，再點另一座島的地形', expect: '鏡頭飛到該島，地圖上方標題顯示該島；名牌不需點第二次' },
  { id: 'C-05', area: '相機', check: '聚焦後按「返回全景」', expect: '回到載入時的全景，三座島名牌都出現' },
  { id: 'C-06', area: '相機', check: '旋轉後聚焦一座島，再單指旋轉，最後返回全景', expect: '聚焦保留旋轉後的方位、聚焦後仍可旋轉；返回全景回到預設方位' },
  { id: 'O-01', area: '自動旋轉', check: '按「自動旋轉」，再按一次', expect: '開始緩慢旋轉、按鈕呈按下狀態；再按停止' },
  { id: 'O-02', area: '自動旋轉', check: '旋轉中分別：單指拖曳、雙指縮放、點名牌', expect: '每一種都會停止自動旋轉' },
  { id: 'O-03', area: '自動旋轉', check: '旋轉中切到其他分頁或 App，再回來', expect: '已停止，不會自行恢復' },
  { id: 'O-04', area: '自動旋轉', check: '系統開啟「減少動態效果」後重新載入（測完關閉）', expect: '預設不旋轉、聚焦時直接到位；按鈕仍可手動開啟', optional: true },
  { id: 'E-01', area: '時間情境', check: '時間選「清晨」', expect: '低角度暖光；無破圖、閃爍或黑塊' },
  { id: 'E-02', area: '時間情境', check: '載入後的預設', expect: '時間選單是「中午」，畫面與以往相同' },
  { id: 'E-03', area: '時間情境', check: '時間選「黃昏」', expect: '低角度橘色陽光、長影子；無破圖或閃爍' },
  { id: 'E-04', area: '時間情境', check: '時間選「傍晚」', expect: '月光夜色；地圖上方標題清楚可讀' },
  { id: 'E-05', area: '時間情境', check: '四個情境下放大看陰影（全景與聚焦）', expect: '陰影無明顯鋸齒、斷裂、閃爍或錯位' },
  { id: 'E-06', area: '時間情境', check: '傍晚時看燈塔燈室、窗戶與路燈', expect: '呈暖黃光（只有燈本身亮，不照亮周圍是預期）' },
  { id: 'E-07', area: '時間情境', check: '從傍晚切回「中午」', expect: '畫面回到載入時的樣子' },
  { id: 'U-01', area: '版面', check: '直向看報告上的 CSS 寬度，並左右滑動整頁', expect: '記錄寬度（約 360／390／430）；整頁沒有水平捲動' },
  { id: 'U-02', area: '版面', check: '看地圖下方的提示與「時間情境／自動旋轉／返回全景」', expect: '一列完整可見、不截字、不溢出；按鈕好按、不會誤觸' },
  { id: 'U-03', area: '版面', check: '旋轉、縮放、聚焦後看地圖上方的標題', expect: '標題在地圖外，不遮住島嶼或名牌' },
  { id: 'U-04', area: '互動', check: '點三座島；聚焦基礎程式島後用地點清單開燈塔說明、點工坊', expect: '都能聚焦；說明可開關；工坊進入 /learn' },
  { id: 'U-05', area: '互動', check: '點「航行指南」的三張島嶼卡片；切到「清單」進入一份教材再返回；點頁尾「原有教材頁」', expect: '卡片讓地圖聚焦該島；清單可進入教材、切回 3D 正常；進入 /learn/bfs，返回後地圖正常' },
  { id: 'U-06', area: '無障礙', check: '接上外接鍵盤後重新載入，按 Tab，再按 Enter', expect: '第一個焦點是「跳至主要內容」且清楚可見；Enter 跳到主要內容', optional: true },
  { id: 'U-07', area: '無障礙', check: '開 VoiceOver（iPhone）或 TalkBack（Android），瀏覽地圖區與清單', expect: '按鈕與時間選單都讀出可辨識的名稱；可用清單選島並進入教材', optional: true },
  { id: 'U-08', area: '互動', check: '轉橫向再轉回直向；長按名牌；在地圖上快速點兩下', expect: '重新取景、名牌位置正確；不跳系統選單、不選取文字、頁面不放大' },
  { id: 'F-01', area: '故障', mode: 'webgl-fail', check: '用工具的「WebGL 無法建立」開啟頁面', expect: '顯示「此裝置的 3D 場景無法使用」、自動切到清單、沒有 3D 控制、三座島與教材可進入' },
  { id: 'F-02', area: '故障', mode: 'glb-fail', check: '用工具的「GLB 載入失敗」開啟頁面，聚焦基礎程式島', expect: '基礎程式島改用暫代建築，頁面可正常操作；地點清單仍可進入教材' },
  { id: 'F-03', area: '故障', mode: 'context-loss', check: '用工具的「WebGL context 遺失」開啟頁面，等 GLB 載入後約 2 秒', expect: '改為清單導航並顯示提示，教材可進入' },
];

/** What the tester sees but the tool cannot measure: kept apart from the measured numbers in the report. */
export const OBSERVATIONS = [
  { id: 'smooth', label: '整體流暢度（鏡頭飛行、旋轉、縮放）' },
  { id: 'shadows', label: '陰影品質' },
  { id: 'glow', label: '傍晚暖光' },
  { id: 'heat', label: '發熱或耗電（測試約 15 分鐘後）' },
];
/** The answers an observation can take; '' is not observed. */
export const RATINGS = { good: '良好', ok: '可接受', poor: '不佳' };
/** A checklist answer; anything else (or nothing) is Not Tested. */
export const RESULTS = { pass: 'Pass', fail: 'Fail' };
