# Escape 之後焦點落在清單而不是地圖名牌：重現與修正

> 2026-11-16，Asia/Taipei。隔離副本，旗標建置（`LOGIC_ISLAND_REGIONAL_WORLD=1`），headless Chromium，桌機 1440×1000。
> 只存在於 `/world/<region>`；預設建置沒有這個路由。Trace 沒有放進 repo（旗標建置含 `/trials`）。

## 1. 發現

合併 PR #10 之前，對當時的 HEAD（`affc8d0`）重跑全套 E2E（旗標開啟）：**494 通過／95 略過／1 失敗**。失敗的是 `e2e/regional-world.spec.ts`「P8.2 keyboard map controls … Escape gives the focus back level by level」，不是 V3：

```
Error: expect(locator).toBeFocused() failed
Locator:  getByRole('button', { name: '聚焦資料庫應用島', exact: true })
Received: inactive
> 234 |     await expect(label(page, '資料庫應用島')).toBeFocused();
```

失敗截圖：畫面已回到區域全景，名牌都在；焦點框在右側清單的「資料庫應用島」。同一份產品程式在前一次全套（`be7671c`）是 495／95／0。

## 2. 重現

| 條件 | 結果 |
|---|---|
| 全套 E2E（旗標開啟，590 個） | 1 次失敗 |
| 只跑這個測試，`--repeat-each 120 --workers 6`（負載約 34） | **120 次失敗 45 次**，全部在第 234 行 |

## 3. 每一幀的狀態

探針（不在 repo）：聚焦資料庫應用島後按 Escape，之後每個 animation frame 記錄「網址是否還有 `?island=`」「地圖名牌是否存在」「`document.activeElement`」。`--repeat-each 60 --workers 6`：

| 次數 | 島被釋放後，名牌出現在 | 焦點 |
|---|---|---|
| 58 | 同一幀 | 下一幀到名牌 |
| 2 | **第 3 幀** | 下一幀到**清單項目**，之後沒有再移動 |

## 4. 根因

產品的時序競態，不是測試的問題。`regional-world-explorer.tsx` 在島被釋放後只等一個 animation frame 就找地圖名牌，找不到就退回清單項目：

```ts
const frame = requestAnimationFrame(() => {
  const target = document.querySelector(`button[aria-label^="聚焦${name}"]`) ?? document.querySelector(`[data-island-choice="${id}"]`);
  target?.focus({ preventScroll: true });
});
```

名牌是場景（drei 的 `<Html>`，自己的 React root）畫出來的，不保證在頁面 commit 的下一幀就存在；機器忙的時候會晚幾幀。那時焦點就到了清單項目——那是為「沒有地圖」準備的退路，不是有地圖時該去的地方。

對使用者的影響：鍵盤焦點沒有遺失，仍在同一座島的入口上，但從地圖跳到了清單；再按 Tab 的順序會和預期不同。只發生在旗標建置的 `/world/<region>`。

## 5. 修正（產品，最小）

有地圖（頁面上有 canvas）時，名牌最多有 30 個 frame（約半秒）可以出現；沒有地圖時立刻用清單項目，與原本相同：

```ts
let frames = 30;
const seek = () => {
  const label = document.querySelector<HTMLElement>(`button[aria-label^="聚焦${name}"]`);
  if (!label && --frames > 0 && document.querySelector('canvas')) { frame = requestAnimationFrame(seek); return; }
  (label ?? document.querySelector<HTMLElement>(`[data-island-choice="${id}"]`))?.focus({ preventScroll: true });
};
let frame = requestAnimationFrame(seek);
```

測試沒有放寬：原本失敗的斷言不變；另外在「without WebGL」測試補上一個斷言——沒有地圖時 Escape 之後焦點在清單項目——保護這次改到的退路。沒有固定等待、沒有 skip、沒有 retries。

## 6. 修正後

| 條件 | 修正前 | 修正後 |
|---|---|---|
| 這個測試 `--repeat-each 120 --workers 6` | 45 失敗（負載約 34） | **0 失敗**（負載約 41） |
| 探針 60 次 | 2 次焦點在清單 | 60 次焦點都在名牌 |

修正後的全套驗收（Typecheck、ESLint、Vitest、兩種建置、兩套全套 E2E、Flag-off 比對、洩漏掃描）見 [P8.6](../../P8_6_HOTFIX_AND_P8_INTEGRATION.md) §3。

限制：探針在修正後的 60 次裡沒有再遇到「名牌晚出現」的情況，所以「晚出現時焦點仍到名牌」的直接觀察來自 120 次測試全部通過，不是探針。加壓是平行 worker 製造的，不是真機。
