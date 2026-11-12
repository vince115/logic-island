# GitHub Actions 固定版本（T.3I Phase 3）

`.github/workflows/trials-ci.yml` 的每個第三方 Action 都固定到完整的 commit SHA，行尾註解寫原本的版本標籤。`tests/trials-ci-workflow.test.ts` 會比對 workflow 和本表，任何浮動標籤（`@v4`、`@main`）或與本表不符的 SHA 都會讓測試失敗。

## 1. 固定清單

| Action repository | 原本寫法 | 固定的版本標籤 | Commit SHA |
|---|---|---|---|
| `actions/checkout` | `@v4` | `v4.4.0` | `11d5960a326750d5838078e36cf38b85af677262` |
| `pnpm/action-setup` | `@v4` | `v4.3.0` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` |
| `actions/setup-node` | `@v4` | `v4.4.0` | `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| `actions/setup-java` | `@v4` | `v4.9.1` | `cf277c60eb25467037889841efdb72551f06f6c3` |
| `actions/upload-artifact` | `@v4` | `v4.6.2` | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

## 2. SHA 的來源

- 查詢時間：2026-11-10（UTC 11:33）。
- 來源一：`git ls-remote --tags https://github.com/<repository>.git`。annotated tag 取 `^{}`（peeled）那一行，也就是 tag 指向的 commit。
- 來源二：GitHub REST API `GET /repos/<repository>/commits/<tag>`（`Accept: application/vnd.github.sha`）。
- 兩個來源對每個 Action 的結果都相同。
- 選版原則：當天 `v4` 浮動標籤指向哪個 commit，就固定到那個 commit，再寫出指向同一 commit 的完整版本標籤。也就是**行為和 T.3H 的 `@v4` 完全相同**，只是不再浮動。沒有升級主版本，也沒有猜測任何 SHA。

## 3. 更新方式

1. 用上面兩個來源查新版本標籤指向的 commit，兩者一致才採用。
2. 同時更新 workflow 和本表，並在 PR 說明標籤、SHA 與查詢時間。
3. 只改 `uses:` 行；不要順便改權限或步驟。

## 4. 仍需人工確認

- 這五個 Action 的原始碼沒有逐行審查；固定 SHA 只確保它不會被悄悄替換。
- `actions/setup-node`、`actions/setup-java`、`pnpm/action-setup` 預設會用唯讀的 `github.token` 下載工具版本，這是 Action 的預設行為，workflow 沒有另外傳入 token 或 secret。
- 是否改用 Dependabot（`package-ecosystem: github-actions`）提醒更新，由維護者決定。
