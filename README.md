# 🔥 Hidane（ヒダネ）

> AI・プログラミング未経験者に「最初の火」を付ける Web アプリ。
> 「作りたい」を入力するだけで、**すぐ動くアプリ**が生成・実行され、学びが**焚き火**として育っていきます。

作って → 動いて → 記憶になり → 炎が育つ。この一本のループを、すべて Cloudflare 上で完結させています。

---

## コンセプト

対象ペルソナは「ミナト・22歳・文系・未経験」。最初の成功体験（＝着火）を最短で届けることに全振りしています。

1. **作って**: 願い（例：「サイコロを振るページ作って」）を Workers AI (`kimi-k2.7-code`) が、すぐ動く自己完結 HTML アプリに変換
2. **動いて**: 生成コードを **Dynamic Workers** のサンドボックス（ネット遮断）で実行し、iframe でライブプレビュー →「動いた！」
3. **記憶になり**: 学び（願い・作ったもの・触れた概念）を **AI Search** に蓄積。次のターンで前回の学びを踏まえた提案に
4. **炎が育つ**: ターン数・習得概念・連続日数から熱量を算出し、**16段階の焚き火スプライト**を GSAP で成長アニメーション

## 技術選定方針

| 観点 | 方針 |
| --- | --- |
| 体験 | 「自分の作ったものが動く」＋「学びが炎になる」の二段の感動 |
| インフラ | 単一 Cloudflare Worker に集約し、デプロイ・運用を最小化 |
| 安全性 | 生成コードは Dynamic Workers + iframe の二重隔離で実行 |
| 未経験者向け | 構造化出力で説明・次の一歩・概念を必ず返す |
| 実在感 | `wrangler deploy` で公開 URL からデモ完走可能 |

## アーキテクチャ

```
ユーザーの願い
   │  POST /api/ignite
   ▼
[Worker / Hono]
   ├─ ① readMemory   … AI Search 検索（無ければ DO の直近メモ）
   ├─ ② generateApp  … Workers AI (kimi) 構造化生成（失敗時はテンプレ生成）
   ├─ ③ storeArtifact… 生成コードを D1 に保存
   ├─ ④ writeMemory  … AI Search へ追記（waitUntil）＋ DO へ同期記録
   └─ ⑤ flame.ignite … Durable Object で炎レベル更新
   ▼
{ previewPath, explanation, next_spark, concepts, flame }
   │
   ▼  iframe src = /api/preview/:sessionId
[Worker] → env.LOADER.get(...) で生成コードをサンドボックス実行 → HTML
```

| 役割 | 使用サービス |
| --- | --- |
| フロント配信 | Cloudflare Workers Static Assets（React SPA, Vite） |
| API / オーケストレーション | Cloudflare Workers + Hono |
| コード生成 | Workers AI `@cf/moonshotai/kimi-k2.7-code`（JSON-schema 構造化出力） |
| コード実行（サンドボックス） | Dynamic Workers（`env.LOADER.get`, `globalOutbound: null`） |
| 意味記憶（RAG） | AI Search（built-in storage, `items.uploadAndPoll` / `search`） |
| 構造記憶 | D1（学習ログ・概念） |
| セッション状態 / 炎レベル | Durable Object `FlameSession`（SQLite） |

### 技術スタック

| レイヤ | 技術 | 用途 |
| --- | --- | --- |
| ビルド | Vite 8, @cloudflare/vite-plugin | SPA ビルド + Worker ランタイム開発 |
| フロント | React 19, TypeScript, GSAP, 素の CSS | SPA UI・炎アニメーション |
| バックエンド | Hono 4, Wrangler 4 | API ルーティング・デプロイ |
| AI | Workers AI (`AI` バインディング) | コード生成・構造化出力 |
| 実行 | Dynamic Workers (`LOADER` バインディング) | 生成コードのサンドボックス実行 |
| 記憶 | AI Search (`hidane-memory`), D1, Durable Object | RAG・学習ログ・炎状態 |

Worker 設定: `compatibility_date: "2026-06-18"`, `nodejs_compat`, Static Assets は `run_worker_first: ["/api/*"]`

### API

| メソッド | パス | 役割 |
| --- | --- | --- |
| POST | `/api/ignite` | 記憶取得 → 生成 → 実行 → 記憶追記 → 炎更新（`{ userId, wish }` を受け取る） |
| GET | `/api/preview/:sessionId` | 生成コードのサンドボックス実行結果（iframe 用） |
| GET | `/api/state/:userId` | ユーザーの炎状態・直近スナップショットを取得（リロード復元用） |
| GET | `/api/health` | ヘルスチェック（各バインディングの有無を返す） |

リクエストバリデーション: `userId` は `^[A-Za-z0-9_-]{1,64}$`、`wish` は 1〜500 文字。範囲外は `400`。

### コード生成

- **モデル**: `@cf/moonshotai/kimi-k2.7-code`（`worker/generate.ts` の `MODEL`）— `response_format: { type: "json_schema" }` で `code`, `explanation`, `next_spark`, `concepts[]` を取得
- **生成物**: 自己完結 Worker モジュール（HTML/CSS/JS インライン、外部依存・ネットアクセスなし）
- **バリデーション**: `export default` + `fetch` の簡易チェック（`isWorkerShaped`）
- **再試行**: JSON パース/検証に失敗した場合は補正メッセージと低い temperature で **もう一度だけ** 同じモデルを呼び出し、それでも失敗すれば `fallback.ts` の決定的テンプレートを返す（結果は必ず 1 つ返る）

## ディレクトリ構成

```
worker/
  index.ts      Hono ルーティング + /api/ignite オーケストレーション
  generate.ts   Workers AI 呼び出し・構造化出力・検証・再生成・フォールバック
  run.ts        Dynamic Workers 実行 + プレビュー配信
  memory.ts     AI Search（意味記憶）+ Durable Object フォールバック
  state.ts      FlameSession Durable Object（炎・連続記録・直近メモ）
  flame.ts      熱量スコア → 16フレーム算出（純粋関数）
  db.ts         D1 ヘルパ（遅延スキーマ作成・学習ログ・成果物保存）
  fallback.ts   オフライン用の決定的アプリ生成
  types.ts      共有型
src/            React + GSAP の SPA
  App.tsx, components/{Flame,IgniteForm,NextSpark}.tsx, lib/{api,types}.ts
public/flame-sprite.png   4x4=16フレームの焚き火スプライト
migrations/0001_init.sql  D1 スキーマ
test/smoke.ts             純粋ロジックのスモークテスト
```

## 要件

- **Node.js 22 以上**。Wrangler 4 は Node 22+ を必須とし、`@cloudflare/vite-plugin`（Vite 8）は `node:module` の `registerHooks` を使うため **Node 22.15+ / 24 を推奨**。`npm test` は `node --experimental-strip-types` を使うので Node 22+ が必要。
- Cloudflare アカウント（デプロイ/実バインディング利用時）。Dynamic Workers と Workers AI には **Workers Paid** プランが必要。

## セットアップ & 開発

```bash
npm install
npm run cf-typegen   # wrangler.jsonc から型を生成（worker-configuration.d.ts、dev/build 前に必須）
npx wrangler login   # 対話環境で一度だけ
npm run dev          # Vite + Workers ランタイム（workerd）
npm run build        # tsc -b（型チェック）+ vite build
npm test             # 15 checks（炎計算・生成物検証など、workerd 非依存）
```

型チェック単体は `npx tsc -b`（`tsconfig.json` が app / node / worker の 3 プロジェクトを参照）。専用のリンター設定は存在しない。

`AI` / `AI_SEARCH` / `LOADER` バインディングはリモート（実 Cloudflare）に接続するため、ローカル開発には認証が必要です。認証が無い環境でも、Worker は各バインディングの有無を判定し、**オフラインのテンプレ生成 + 静的 HTML プレビュー + Durable Object 記憶**で動作するよう実装しています（AI 部分のみ縮退）。

## デプロイ

```bash
npx wrangler login

# D1 を作成し、出力された database_id を wrangler.jsonc に貼り付け
npx wrangler d1 create hidane

# （任意）マイグレーション適用。未適用でも初回リクエスト時に自動作成されます
npx wrangler d1 migrations apply hidane --remote

npm run deploy   # tsc -b && vite build && wrangler deploy
```

- AI Search の **名前空間** `hidane-memory` がアカウントに存在することをダッシュボードで確認してください。インスタンス（id: `hidane`）は初回利用時に自動作成します
- Dynamic Workers と Workers AI の利用には **Workers Paid** プランが必要です
- プロダクト名・Worker 名・内部リソース（D1 / AI Search 名前空間等）はすべて `hidane` で統一

## 炎レベルの算出

```
score = turnCount*2 + uniqueConcepts*3 + min(streakDays, 7)*5
frame = clamp(floor(score / 5), 0, 15)   // 焚き火スプライト16フレーム
band  = floor(frame / 4)                  // 0:火種 1:小炎 2:中炎 3:聖火
```

初期値を低く設定しており、2〜3 ターンで確実に炎が育つようチューニングしています。

## デモシナリオ（審査向け）

1. 暗い画面に小さな火種（frame 0）。「サイコロを振るページ作って」と入力 →「🔥 火をつける」
2. 数秒で iframe に動くサイコロアプリ →「動いた！」→ 炎がフレーム前進（GSAP の pop 演出）
3. 「次の火花（履歴を残せるように…）」を押す → 前回の学びを踏まえて進化 → 炎がさらに育つ
4. 習得概念バッジ・連続日数・熱量メーターが伸びていく

## セキュリティ & フォールバック

**セキュリティ**

- 生成コードは Dynamic Worker で実行し、`globalOutbound: null` でネットワークを完全遮断
- プレビューは iframe（`sandbox="allow-scripts"`）に隔離。`/api/preview` 応答にも CSP（`connect-src 'none'`、`sandbox allow-scripts` など）と `x-content-type-options: nosniff` を付与し、サンドボックスへは cookie/ヘッダを渡さない
- 記憶はユーザー単位（AI Search は metadata + キー前缀、Durable Object は id 分離）
- 生成コードの Worker 形バリデーション

**フォールバック**

| 障害 | 代替 |
| --- | --- |
| `AI` バインディングなし / 生成失敗 | 同モデルを 1 回再試行し、それでもダメなら `fallback.ts` の決定的テンプレート |
| Dynamic Workers（`LOADER`）未提供・実行失敗 | D1 に保存した静的 HTML を `/api/preview` から直接配信 |
| AI Search 未提供 | Durable Object 内の直近メモ |

**採用しなかったもの**: 別途バックエンドサーバー、外部 DB（PostgreSQL 等）、フロント専用ホスティング、重い UI フレームワーク — すべて Cloudflare Workers 上で完結させるため。

## 参考リンク

- [Cloudflare Workers Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Static Assets SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
- [Workers AI — kimi-k2.7-code](https://developers.cloudflare.com/workers-ai/models/kimi-k2.7-code/)
- [Workers AI JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/)
- [AI Search](https://developers.cloudflare.com/ai-search/)

## ライセンス

非公開プロジェクト（`package.json` に `"private": true`）で、リポジトリに LICENSE ファイルは含まれていません。
