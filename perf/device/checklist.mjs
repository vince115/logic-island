// @ts-check
/**
 * D.3-4 manual checks on the phone, one list for the checklist page of perf/device/server.mjs and the acceptance
 * table in docs/handoff/DEVICE_ACCEPTANCE.md (a unit test keeps the IDs in step). `mode` is the fault the tool
 * injects first; `legacy` says what the old page does where it differs.
 */

/** @typedef {{ id: string, area: string, check: string, expect: string, mode?: 'webgl-fail' | 'glb-fail' | 'context-loss', legacy?: string }} Item */

/** @type {Item[]} */
export const ITEMS = [
  { id: 'T-01', area: '3D 點擊', check: '全景時點島嶼地形（不點名牌）', expect: '鏡頭飛到該島，工具列與地圖顯示該島' },
  { id: 'T-02', area: '3D 點擊', check: '全景時點島嶼名牌', expect: '同 T-01；名牌不需點第二次' },
  { id: 'T-03', area: '3D 點擊', check: '聚焦基礎程式島後點 3D 工坊建築', expect: '進入 /learn' },
  { id: 'T-04', area: 'HTML 地點入口', check: '聚焦基礎程式島後用地點清單：開燈塔說明再關閉、點工坊', expect: '說明可開關；工坊進入 /learn', legacy: '舊版沒有地點清單（記「不適用」）' },
  { id: 'T-05', area: '觸控', check: '在地圖上雙指縮放（放大、縮小各數次）', expect: '地圖平順縮放；整頁不跟著放大' },
  { id: 'T-06', area: '觸控', check: '單指在地圖上上下滑動', expect: '記錄現況：兩版地圖都設 touch-action: none，預期頁面不捲動；請註明是否造成困擾' },
  { id: 'T-07', area: '觸控', check: '聚焦後按「返回全景」', expect: '鏡頭回到全景，三座島名牌都出現' },
  { id: 'T-08', area: '清單模式', check: '切到「清單」：選三座島、點一個教材連結；返回後切回「3D 群島」', expect: '不用 3D 也能進入教材；切回後場景重新載入' },
  { id: 'T-09', area: 'BFS 導航', check: '點頁面附註的「原有教材頁」，再按瀏覽器返回', expect: '進入 /learn/bfs；返回後地圖正常顯示' },
  { id: 'T-10', area: '版面', check: '直向檢查地圖上方工具列', expect: '工具列一行、島名不截字、不遮住地圖', legacy: '舊版在 360／390 px 會換成兩行（記錄現況）' },
  { id: 'T-11', area: '版面', check: '轉橫向再轉回直向', expect: '場景重新取景，名牌位置正確，沒有空白或錯位' },
  { id: 'T-12', area: '觸控', check: '長按島嶼名牌；在地圖上快速點兩下', expect: '不跳出系統選單或選取文字；頁面不放大' },
  { id: 'F-01', area: 'WebGL 失效', mode: 'webgl-fail', check: '用工具的「WebGL 無法建立」開啟頁面', expect: '顯示「此裝置的 3D 場景無法使用」、自動切到清單、3D 按鈕停用、三座島與教材可進入' },
  { id: 'F-02', area: 'GLB 失效', mode: 'glb-fail', check: '用工具的「GLB 載入失敗」開啟頁面，聚焦基礎程式島', expect: '基礎程式島改用暫代建築，頁面可正常操作；地點清單仍可進入教材', legacy: '舊版沒有地點清單；確認暫代建築可點' },
  { id: 'F-03', area: 'WebGL 失效', mode: 'context-loss', check: '用工具的「WebGL context 遺失」開啟頁面，等 GLB 載入後約 2 秒', expect: '改為清單導航並顯示提示，教材可進入' },
  { id: 'K-01', area: '鍵盤（桌機 Safari／Chrome）', check: '載入後按 Tab', expect: '第一個焦點是「跳至主要內容」且只在聚焦時出現；Enter 跳到主要內容' },
  { id: 'K-02', area: '鍵盤（桌機 Safari／Chrome）', check: 'Tab 到島嶼名牌按 Enter；再 Tab 到「返回全景」按 Enter', expect: '可聚焦與返回，焦點框清楚可見' },
  { id: 'K-03', area: '鍵盤（桌機 Safari／Chrome）', check: '只用鍵盤切到清單模式、選島、進入教材', expect: '全程不需滑鼠' },
];
