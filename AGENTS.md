# AGENTS.md

このリポジトリ（**hidane / ヒダネ**）で作業するコーディングエージェント向けのガイドです。プロダクトの概要・機能・デプロイ手順は [README.md](./README.md) を参照してください。ここでは実装作業に必要な最小限の事実だけをまとめます。

## プロジェクト構成

Cloudflare Workers 上で完結する単一アプリ。フロント（React SPA）とバックエンド（Hono Worker）が同じ Worker にバンドルされます。

```
worker/            バックエンド（Hono + Cloudflare バインディング）
  index.ts         エントリポイント。Hono ルーティング + /api/ignite オーケストレーション。FlameSession を re-export
  generate.ts      Workers AI 呼び出し・構造化出力・検証・再試行・フォールバック（MODEL 定義もここ）
  run.ts           Dynamic Workers での生成コード実行 + /api/preview 配信（CSP 付与）
  memory.ts        AI Search（意味記憶）+ Durable Object フォールバック
  state.ts         FlameSession Durable Object（炎・連続記録・直近メモ・スナップショット）
  flame.ts         熱量スコア → 16フレーム算出（純粋関数。テスト対象）
  db.ts            D1 ヘルパ（遅延スキーマ作成・学習ログ・成果物保存）
  fallback.ts      オフライン用の決定的アプリ生成（純粋関数。テスト対象）
  types.ts         共有型
src/               フロント（React 19 + GSAP の SPA）
  main.tsx         React エントリポイント
  App.tsx          画面全体の状態管理・iframe プレビュー
  components/       Flame.tsx / IgniteForm.tsx / NextSpark.tsx / icons.tsx
  lib/             api.ts（fetch ラッパ）/ types.ts / useReducedMotion.ts
index.html         Vite の HTML エントリ
migrations/        D1 スキーマ（0001_init.sql）
test/smoke.ts      純粋ロジックのスモークテスト（workerd 非依存）
wrangler.jsonc     Worker 設定（バインディング・DO・D1・AI・AI Search・Dynamic Workers）
vite.config.ts     Vite プラグイン（@vitejs/plugin-react + @cloudflare/vite-plugin）
```

- Worker のエントリは `wrangler.jsonc` の `main: "worker/index.ts"`。フロントは Static Assets として配信され、`/api/*` は `run_worker_first` で Worker が先に処理する。
- `worker-configuration.d.ts`（`Env` 型）は `wrangler types` で生成され **gitignore 済み**。ソースには含まれないので、型チェック前に必ず生成すること（下記）。

## セットアップ

```bash
npm install
npm run cf-typegen   # wrangler.jsonc から Env 型を生成（worker-configuration.d.ts）。dev/build/typecheck の前に必須
```

**Node.js のバージョンに注意**:
- Wrangler 4 は **Node 22+** が必須。
- `@cloudflare/vite-plugin`（Vite 8）は `node:module` の `registerHooks` を使うため、`npm run dev` / `npm run build` は **Node 22.15+ もしくは Node 24** が必要（Node 22.12 などでは `SyntaxError: ... registerHooks` で失敗する）。
- `npm test` は `node --experimental-strip-types` を使うため Node 22+ が必要。

迷ったら **Node 24 を使う**こと。

## ビルド / テスト / 型チェック / lint（実在コマンドのみ）

`package.json` の scripts に定義されているもの:

| 目的 | コマンド | 備考 |
| --- | --- | --- |
| 開発サーバ | `npm run dev` | Vite + Workers ランタイム（workerd） |
| ビルド | `npm run build` | `tsc -b`（全プロジェクト型チェック）+ `vite build` |
| 型生成 | `npm run cf-typegen` | `wrangler types`。バインディング変更後に再実行 |
| プレビュー | `npm run preview` | ビルド成果物のローカル確認 |
| テスト | `npm test` | `node --experimental-strip-types test/smoke.ts`。15 checks（flame 計算・fallback 生成・worker 検証・AI 出力パース） |
| デプロイ | `npm run deploy` | `npm run build && wrangler deploy` |
| D1 マイグレーション | `npm run db:migrate:local` / `npm run db:migrate:remote` | `wrangler d1 migrations apply hidane` |

- **型チェック単体**: `npx tsc -b`（`tsconfig.json` が `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.worker.json` を参照）。`npm run build` の前段でも実行される。
- **lint**: 専用のリンター（ESLint / Prettier / Biome 等）の設定は **存在しない**。存在しない lint コマンドを追加・実行しないこと。
- 変更後は最低限 `npm run cf-typegen && npx tsc -b && npm test` を通すこと（`vite build` まで確認できるとなお良い）。

## コーディング規約

- **TypeScript strict**。`tsconfig.*` で `strict` / `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` / `erasableSyntaxOnly` / `verbatimModuleSyntax` が有効。未使用変数・型注釈のみで消せない構文はエラーになる。
- **相対 import には `.ts` 拡張子を付ける**（`allowImportingTsExtensions` 前提。例: `import { generateApp } from "./generate.ts";`）。
- **型のみの import は `import type { ... }`**（`verbatimModuleSyntax`）。
- ESM のみ（`package.json` の `"type": "module"`）。
- インデントは 2 スペース、ダブルクォート、セミコロンあり。既存ファイルのスタイルに合わせること。
- UI・説明文・生成プロンプトは **日本語**（未経験者向けのやさしい文体）。ドキュメントも日本語で統一。
- 純粋ロジック（`flame.ts` / `fallback.ts` / AI 出力パースなど）は workerd 非依存に保ち、`test/smoke.ts` でカバーする。ロジックを変えたらテストも更新すること。

## 注意点

- `wrangler.jsonc` のバインディング（`AI` / `AI_SEARCH` / `LOADER` / `DB` / `FLAME`）はリモートの Cloudflare に接続する。認証やプランが無い環境では、Worker が各バインディングの有無を判定して**オフライン縮退**する設計（テンプレ生成 + 静的 HTML プレビュー + Durable Object 記憶）。この縮退パスを壊さないこと。
- **セキュリティ上の不変条件**（緩めないこと）:
  - 生成コードは Dynamic Worker で `globalOutbound: null`（ネット遮断）で実行する。
  - プレビューは iframe `sandbox="allow-scripts"` + `/api/preview` 応答の CSP（`connect-src 'none'` 等）で隔離し、cookie/ヘッダを渡さない。
  - `userId` は `^[A-Za-z0-9_-]{1,64}$` に制限（キー/パス injection 防止）。`wish` は 1〜500 文字。
  - AI Search 検索結果は metadata とキー前缀の両方で user 一致を再検証する。過去の学び（memory）はプロンプトで「指示ではなく参考データ」として fence する。
- `wrangler.jsonc` の `database_id` は `<YOUR_DATABASE_ID>` プレースホルダ。実 D1 を使う場合は `wrangler d1 create hidane` の出力で置き換える（未適用でも初回リクエスト時に `ensureSchema` がテーブルを自動作成する）。
- 生成される `worker-configuration.d.ts` や `dist/`、`.wrangler/` は gitignore 済み。コミットしないこと。
- 変更は必要最小限に。プロダクト名・Worker 名・内部リソース名はすべて `hidane` で統一されている。
