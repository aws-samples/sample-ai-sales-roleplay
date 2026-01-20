# AI営業ロールプレイの環境構築

AI営業ロールプレイプロジェクトのAWSインフラストラクチャを構築するためのCDKプロジェクトです。このプロジェクトは、同一AWSアカウント内に複数の環境（開発、ステージング、本番）を並行してデプロイできるように設計されています。

## アーキテクチャ

このプロジェクトでは、以下のAWSサービスを活用したインフラストラクチャを構築しています。

### 認証基盤
- **Amazon Cognito User Pool**: ユーザー登録、サインイン、アカウント管理
- **Amazon Cognito Identity Pool**: 認証されたユーザーにAWSリソースへのアクセス権を付与
- **IAM Roles**: 認証済みユーザーと未認証ユーザー向けの適切な権限設定

### AI/ML基盤
- **Amazon Bedrock AgentCore Runtime**: Strands Agentsを使用したエージェント実行基盤
- **Amazon Bedrock AgentCore Memory**: 会話履歴とメトリクスの永続化管理
- **Amazon Bedrock**: Claude 4.5 Sonnet、Nova Premiere等のモデル利用
- **Amazon Bedrock Guardrails**: コンプライアンスチェック
- **Amazon Bedrock Knowledge Base**: PDF参照評価

### コンピューティング
- **AWS Lambda**: API処理、音声分析、動画分析等のサーバーレス処理
- **AWS Step Functions**: 非同期分析ワークフローのオーケストレーション

### データストア
- **Amazon DynamoDB**: セッション、シナリオ、フィードバック等のNoSQLデータ
- **Amazon S3**: PDF資料、音声ファイル、動画録画等のオブジェクトストレージ
- **Amazon RDS PostgreSQL**: 関係データの永続化

### API
- **Amazon API Gateway (REST)**: メインAPIエンドポイント
- **Amazon API Gateway (WebSocket)**: リアルタイム音声認識用WebSocket接続

## プロジェクト構造

```
cdk/
├── agents/                           # AgentCore Runtimeエージェント
│   ├── npc-conversation/             # NPC会話エージェント
│   │   ├── agent.py                  # BedrockAgentCoreAppエントリーポイント
│   │   └── requirements.txt
│   ├── realtime-scoring/             # リアルタイムスコアリングエージェント
│   │   ├── agent.py
│   │   └── requirements.txt
│   └── feedback-analysis/            # フィードバック分析エージェント
│       ├── agent.py
│       └── requirements.txt
├── lambda/                           # Lambda関数
│   ├── sessions/                     # セッション管理
│   ├── scenarios/                    # シナリオ管理
│   ├── audioAnalysis/                # 音声分析（Step Functions統合）
│   ├── videos/                       # 動画分析（Nova Premiere連携）
│   ├── textToSpeech/                 # 音声合成（Amazon Polly SSML対応）
│   ├── guardrails/                   # Guardrails管理
│   ├── referenceCheck/               # Knowledge Base参照評価
│   └── ...
├── lib/
│   ├── constructs/                   # 再利用可能なCDKコンストラクト
│   │   ├── api/                      # API Gateway関連コンストラクト
│   │   ├── storage/                  # S3、DynamoDB関連コンストラクト
│   │   └── compute/                  # Lambda関連コンストラクト
│   └── stacks/                       # デプロイ可能なスタック
│       └── auth-stack.ts             # 認証関連スタック統合
├── bin/
│   └── cdk.ts                        # CDKアプリエントリーポイント
├── data/                             # 初期データ（シナリオ、Guardrails設定）
├── .env.dev                          # 開発環境設定ファイル
├── .env.staging                      # ステージング環境設定ファイル
├── .env.prod                         # 本番環境設定ファイル
├── package.json
├── cdk.json
└── tsconfig.json
```

## セットアップ

### 前提条件

- Node.js 22+
- AWS CLI 2+
- AWS CDK 2+
- Python 3.9+
- AWS アカウント

### インストール手順

1. AWS CLI設定

```bash
aws configure
```

2. 依存関係のインストール

```bash
npm install
```

3. CDK Bootstrapの実行（初回のみ）

```bash
npx cdk bootstrap
```

### 環境設定ファイルの準備

環境ごとに.envファイルを用意します。

```bash
# 開発環境用
cp .env.dev.sample .env.dev

# ステージング環境用
cp .env.staging.sample .env.staging

# 本番環境用
cp .env.prod.sample .env.prod
```

## デプロイ方法

### マルチ環境デプロイ

このプロジェクトは、同一AWSアカウント内に複数の環境（開発、ステージング、本番）を並行してデプロイできるように設計されています。各環境は環境識別子（dev、staging、prod）によって区別され、リソース名には環境識別子のプレフィックスが付加されます。

```bash
# 開発環境へのデプロイ
npm run deploy:dev

# ステージング環境へのデプロイ
npm run deploy:staging

# 本番環境へのデプロイ
npm run deploy:prod
```

### CloudFormationテンプレートの生成

各環境のCloudFormationテンプレートを確認するには：

```bash
# 開発環境のテンプレート確認
npm run synth:dev

# ステージング環境のテンプレート確認
npm run synth:staging

# 本番環境のテンプレート確認
npm run synth:prod
```

> **注意**: `npm run build`コマンドは使用せず、`npm run test`と`cdk synth`でTypeScriptエラーを確認することを推奨します。

## AgentCore Runtime

Amazon Bedrock AgentCore Runtimeを使用したエージェント実行基盤を採用しています。

### エージェント一覧

| エージェント | 機能 | 認証方式 |
|-------------|------|----------|
| **npc-conversation** | NPC会話応答生成 | AgentCore Identity (JWT) |
| **realtime-scoring** | リアルタイムスコアリング | AgentCore Identity (JWT) |
| **feedback-analysis** | フィードバック分析 | IAMロール |

### AgentCore Memory

AgentCore Memoryを使用して会話履歴とメトリクスを管理します：

- **保持期間**: 365日間（Short-Term Memory）
- **イベントタイプ**: conversation, metrics
- **actor_id**: ユーザーID（フォールバック: `default_user`）

## 環境別設定

環境ごとの設定は `cdk.json` の `context` セクションで管理されています。

### 主要な設定項目

| 設定項目 | 説明 |
|---------|------|
| **selfSignUpEnabled** | セルフサインアップの有効化 |
| **allowedSignUpEmailDomains** | サインアップ許可メールドメイン |
| **allowedIpV4AddressRanges** | 許可IPv4アドレス範囲 |
| **allowedIpV6AddressRanges** | 許可IPv6アドレス範囲 |
| **allowedCountryCodes** | 許可国コード（参照: [AWS CloudFront GeoRestriction](https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_GeoRestriction.html)）|
| **bedrockModels** | 各用途別のBedrockモデル設定 |

### Bedrockモデル設定

各環境で以下の用途別にBedrockモデルが設定されています：

| 用途 | 説明 |
|------|------|
| **conversation** | 会話生成用モデル |
| **scoring** | スコアリング用モデル |
| **feedback** | フィードバック生成用モデル |
| **guardrail** | ガードレール用モデル |
| **video** | 動画解析用モデル（Nova Premiere） |
| **referenceCheck** | 参考資料チェック用モデル |

### 設定の変更方法

環境固有の設定を変更する場合は、`cdk.json`の該当する環境セクションを編集してください：

```json
{
  "context": {
    "env:dev": {
      "allowedSignUpEmailDomains": [
        "amazon.co.jp",
        "your-domain.com"  // 新しいドメインを追加
      ]
    }
  }
}
```


