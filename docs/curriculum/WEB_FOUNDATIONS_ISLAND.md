# 網頁基礎島（Web Foundations Island）

> 2026-11-23 起分批撰寫（自主課程生產，見 [AUTONOMOUS_CURRICULUM_PROGRESS](../planning/AUTONOMOUS_CURRICULUM_PROGRESS.md)）。大綱（標題、目標、概念、先修）取自藍圖，由 `lessons.ts` 的 `webFromBlueprint` 讀入。

教學方式是 `web-code` 能力（[WEB0_WEB_CODE_CAPABILITY](WEB0_WEB_CODE_CAPABILITY.md)）：範例是一個可以修改再執行的小頁面（HTML，選用 CSS 與 JavaScript），在瀏覽器的沙盒框架裡執行，旁邊是瀏覽器建立的 DOM 樹、主控台輸出與連結／表單的去向；每個範例列出的「在瀏覽器裡的事實」與每個練習的參考解答、起始內容、常見錯誤，都由測試在真實的 Chromium 裡執行過（`tests/curriculum-webcode.test.ts`）。練習只看瀏覽器實際建立的結果，不看寫法。

## 已撰寫的課

| ID | 課程 | 難度 | 時間 | 先修 | 內容 | 狀態 |
|---|---|---|---|---|---|---|
| WEB01 | 網頁如何運作：瀏覽器、HTML、CSS、JS<br>`how-the-web-works` | 入門 | 40 分 | — | 6 段、5 個範例（只有 HTML、加上 CSS、加上 JavaScript、程式改動 DOM、瀏覽器修補的 HTML）、4 個練習（改標題並加段落、替標題上色、補一行讓按鈕換文字、修好 DOM 結構）、8 題 | **完整 v1.0.0** |
| WEB02 | HTML 文件結構與語意元素<br>`html-structure-and-semantics` | 入門 | 45 分 | WEB01 | 6 段、5 個範例（文件骨架、巢狀規則、div 堆出來的頁面、語意元素版、標題大綱）、4 個練習（補齊骨架、把 div 換成地標、修好標題層級、做出一頁活動公告）、8 題 | **完整 v1.0.0** |
| WEB03 | 文字、連結、圖片與媒體<br>`text-links-and-media` | 入門 | 45 分 | WEB02 | 5 段、5 個範例（文字的語意、頁內錨點與連結、相對與絕對路徑、圖片與替代文字、影音與字幕）、4 個練習（修好錨點連結、替代文字與尺寸、安全地另開分頁、控制列與字幕軌）、8 題 | **完整 v1.0.0** |
| WEB04 | 表單元素與原生驗證<br>`forms-and-native-validation` | 入門 | 50 分 | WEB02 | 6 段、5 個範例（送出的資料、label 關聯、輸入類型、選擇類控制項、原生驗證）、4 個練習（把文字變成 label、類型與必填、選項按鈕與核取方塊、入會表單）、8 題 | **完整 v1.0.0** |

## 單元

| 單元 | 課程 |
|---|---|
| 網頁如何運作與 HTML 結構 | WEB01–WEB02 |
| 內容與表單 | WEB03–WEB04 |

## 預覽與真實瀏覽器的差異（課文已說明或避開）

- 預覽不能連網：圖片用 `data:` URI 的小型 SVG；影片、音訊與字幕檔載不進來，WEB03 只教標記並檢查屬性與結構。
- 連結不會離開頁面、表單不會真的送出：預覽下方顯示連結要去的 `href`（照原樣，不解析相對路徑）與表單送出的資料；相對路徑怎麼解析由課文的表格說明。
- `srcdoc` 框架一律是標準模式：沒有 doctype 的文件在預覽裡看不出相容模式的差別，WEB02 以文字說明，DOM 樹下方有提示。
- `style.css` 與 `script.js` 會成為 DOM 裡的 `style` 與 `script` 元素（不是 `<link>` 與外部檔案），WEB01 說明了這一點；沒有 Network 面板與「檢視原始碼」，課文請學習者開真正的開發者工具。
- 鍵盤操作是模擬的事件：Enter 送出表單與空白鍵切換核取方塊有模擬，Tab 移動焦點沒有；`minlength`／`maxlength` 只對使用者親手輸入的文字驗證，檢查無法重現，WEB04 只以文字說明。

## 後續批次

WEB-2 發布 WEB05–WEB07（CSS 選擇器與串接、盒模型、定位）。WEB-3 發布 WEB08–WEB10（DOM、事件、非同步；需要引擎階段 W1、W2）。WEB-4 發布 WEB11–WEB13（fetch、儲存、無障礙；W3–W5）。WEB-5 發布 WEB14–WEB15（效能與綜合專題；W6）。

課程狀態與 3D 地景分離：網頁基礎島的 `mapState` 仍是 `'planned'`。
