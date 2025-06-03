# リファクタリングと脆弱性に関するタスク

このドキュメントでは、リポジトリ内で確認されたコード品質の課題と脆弱性をまとめています。各項目は **影響度** と **緊急度** をそれぞれ `高`・`中`・`低` の 3 段階で評価し、優先度の高い順に並べています。

## メモ

- `apps/web/lib/csp.ts` ではリファクタリングが未完了のため、本番環境でも `'unsafe-inline'` を許可しています。
- `packages/prisma/.env` は存在しない `../../.env` を指す壊れたシンボリックリンクです。

## サマリ

| # | ファイル | 課題 | 影響度 | 緊急度 |
|---|---------|-----|------|-------|
|1|`packages/features/insights/server/events.ts` と `routing-events.ts`|`Prisma.raw` を用いて値を文字列結合しており、SQL インジェクションの危険|高|高|
|2|`packages/app-store-cli/src/utils/execSync.ts` & `core.ts`|ユーザー入力をそのまま `child_process.exec` に渡しており、コマンドインジェクションの恐れ|高|高|
|3|`scripts/vercel.sh`|`curl ... | bash` で外部スクリプトを実行しており、改ざん時に任意コード実行の可能性|高|高|
|4|`apps/web/pages/_document.tsx`|`dangerouslySetInnerHTML` に変数を埋め込んでおり、サニタイズ不足だと XSS を招く|中|高|
|5|`packages/prisma/auto-migrations.ts`|`exec("yarn prisma migrate deploy")` のエラー処理が不十分|中|中|
|6|`packages/prisma/.env` のシンボリックリンク|存在しないファイルを指しており、環境設定ミスを誘発|低|中|
|7|`apps/web/public/service-worker.js`|デバッグ用 `console.log` が残ったまま|低|中|
|8|`apps/web/lib/QueryCell.tsx` など|`@ts-expect-error` や `as any` の多用で型安全性が低下|低|中|
|9|`apps/web/lib/csp.ts`|CSP で `'unsafe-inline'`（開発環境では `'unsafe-eval'` も）を許可しておりスクリプトインジェクションに弱い|中|低|
|10|`git-setup.sh` と `git-init.sh`|サブモジュールを自動取得する際に整合性検証がない|中|低|
|11|リポジトリ全体の TODO/FIXME|多数の未完了タスクが残存|低|低|

以下に、各項目の詳細と推奨される解決策をまとめます。

### 1. 動的 SQL 連結の排除

**該当コード例**
```ts
const whereClause = buildSqlCondition(whereConditional);
const data = await prisma.$queryRaw`
  WHERE "createdAt" BETWEEN ${formattedStartDate}::timestamp AND ${formattedEndDate}::timestamp
    AND ${Prisma.raw(whereClause)}
`;
```
**解決策**: `Prisma.sql` のパラメータ化を利用し、ユーザー入力値を直接連結しない。

### 2. `exec` の安全な使用

**該当コード例**
```ts
child_process.exec(cmd, (err, stdout, stderr) => { ... });
```
**解決策**: `execFile` など引数配列を取る API に変更し、入力値を検証・サニタイズする。

### 3. 外部スクリプト取得の安全化

**該当コード例**
```sh
curl -sL https://app.snaplet.dev/get-cli/ | bash &>/dev/null
```
**解決策**: 事前に検証済みのバイナリを利用するか、取得後にチェックサムを確認する。

### 4. `dangerouslySetInnerHTML` 使用箇所の見直し

**該当コード例**
```tsx
<script
  nonce={nonce}
  id="newLocale"
  dangerouslySetInnerHTML={{
    __html: `window.calNewLocale = "${newLocale}";`
  }}
/>
```
**解決策**: 値を `JSON.stringify` でエスケープするか、外部スクリプトに分離して `nonce` を付与する。

### 5. マイグレーション実行時のエラーハンドリング

**該当コード例**
```ts
const { stdout, stderr } = await exec("yarn prisma migrate deploy", { env: { ...process.env } });
```
**解決策**: `exec` の戻り値と exit code を確認し、失敗時は処理を停止させる。

### 6. `.env` シンボリックリンクの修正

**解決策**: リンクを正しいパスに直すか、ルート `.env` を直接読み込む設定に統一する。

### 7. デバッグログの除去

**解決策**: 本番ビルドでは `console.log` を削除するか、環境変数で制御する。

### 8. `any` や `@ts-expect-error` の削減

**解決策**: 型定義を整備し、可能な限りジェネリック型で代替する。

### 9. CSP 設定の強化

**解決策**: 本番環境では `'unsafe-inline'` を許可せず、必要なスクリプトには `nonce` を使用する。

### 10. サブモジュール取得時の整合性検証

**解決策**: `git submodule` 追加後に署名やチェックサムを確認し、信頼できるソースのみ許可する。

### 11. TODO/FIXME の整理

**解決策**: コメントを Issue として管理し、不要なものは削除する。

