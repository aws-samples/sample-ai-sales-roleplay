# AI営業ロールプレイの環境構築

AI営業ロールプレイプロジェクトのAWS認証基盤を構築するためのCDKプロジェクトです。このプロジェクトは、同一AWSアカウント内に複数の環境（開発、ステージング、本番）を並行してデプロイできるように設計されています。

## アーキテクチャ

このプロジェクトでは、Amazon Cognitoを活用した認証基盤を構築しています。

- **Amazon Cognito User Pool**: ユーザー登録、サインイン、アカウント管理
- **Amazon Cognito Identity Pool**: 認証されたユーザーにAWSリソースへのアクセス権を付与
- **IAM Roles**: 認証済みユーザーと未認証ユーザー向けの適切な権限設定

## プロジェクト構造

```
cdk/
├── lib/
│   ├── constructs/
│   │   ├── cognito-user-pool.ts      # ユーザープール専用Construct
│   │   ├── cognito-app-client.ts     # アプリクライアント専用Construct
│   │   └── iam-roles.ts              # IAMロール専用Construct
│   ├── stacks/
│   │   └── auth-stack.ts             # 認証関連スタック統合
│   └── infrastructure-stack.ts       # メインスタック
├── bin/
│   └── cdk.ts                        # CDKアプリエントリーポイント
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

### デプロイ方法

#### マルチ環境デプロイ

このプロジェクトは、同一AWSアカウント内に複数の環境（開発、ステージング、本番）を並行してデプロイできるように設計されています。各環境は環境識別子（dev、staging、prod）によって区別され、リソース名には環境識別子のプレフィックスが付加されます。

環境ごとに.envファイルを用意します。
```bash
# 開発環境用
cp .env.dev.sample .env.dev
# ステージング環境用
cp .env.staging.sample .env.staging
# 本番環境用
cp .env.dev.prod .env.prod
```

```bash
# 開発環境へのデプロイ
npm run deploy:dev

# ステージング環境へのデプロイ
npm run deploy:staging

# 本番環境へのデプロイ
npm run deploy:prod
```

#### CloudFormationテンプレートの生成

各環境のCloudFormationテンプレートを確認するには：

```bash
# 開発環境のテンプレート確認
npm run synth:dev

# ステージング環境のテンプレート確認
npm run synth:staging

# 本番環境のテンプレート確認
npm run synth:prod
```

#### 手動でのデプロイ（従来方法）

従来の方法でデプロイすることもできます：

```bash
# 開発環境の変数設定
source .env.dev

# デプロイ前の構文チェック
npm run test

# 環境を指定してCloudFormationテンプレート確認
npx cdk synth --context env=dev

# 環境を指定してデプロイ
npx cdk deploy --all --context env=dev
```

> ※注意: `npm run build`コマンドは使用せず、`npm run test`と`cdk synth`でTypeScriptエラーを確認することを推奨します。



## 環境別設定

環境ごとの設定は `cdk.json` の `context` セクションで管理されています。

### 主要な設定項目

| 設定項目 | 説明 |
|---------|------|
| **selfSignUpEnabled** | セルフサインアップの有効化 |
| **allowedSignUpEmailDomains** | サインアップ許可メールドメイン |
| **allowedIpV4AddressRanges** | 許可IPv4アドレス範囲 |
| **allowedIpV6AddressRanges** | 許可IPv6アドレス範囲 |
| **allowedCountryCodes** | 許可国コード. (参照: https://docs.aws.amazon.com/cloudfront/latest/APIReference/API_GeoRestriction.html) |
| **bedrockModels** | 各用途別のBedrockモデル設定 |

### Bedrockモデル設定

各環境で以下の用途別にBedrockモデルが設定されています：

| 用途 | 説明 |
|------|------|
| **conversation** | 会話生成用モデル |
| **scoring** | スコアリング用モデル |
| **feedback** | フィードバック生成用モデル |
| **guardrail** | ガードレール用モデル |
| **video** | 動画解析用モデル |
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

## トラブルシューティング

### deploy-time-buildライブラリのNode.js 22対応問題

**問題**: Node.js 22環境でCDKデプロイ時に`deploy-time-build`ライブラリが正常に動作しない

**症状**:
- Lambda関数がサイレント失敗
- CodeBuildプロジェクトが実行されない
- フロントエンドアプリケーションのビルドが完了しない

**原因**: 
古いバージョンの`deploy-time-build`ライブラリがNode.js 22をサポートしていない

**解決方法**:

1. **npmキャッシュのクリア**
```bash
npm cache clean --force
```

2. **node_modulesの完全削除と再インストール**
```bash
rm -rf node_modules package-lock.json
npm install
```

3. **CDKアセットの強制再生成**
```bash
npx cdk synth --force
```

**確認方法**:
- `deploy-time-build`が最新版（v0.4.4以上）であること
- CodeBuildログでNode.js 22.x.xが正常にインストールされること
- Lambda関数が正常に実行されること

### Knowledge BaseのS3 Vectors移行

**概要**: 
コスト最適化のため、Knowledge BaseのベクトルストアをOpenSearch ServerlessからS3 Vectorsに移行

**変更内容**:
- `@cdklabs/generative-ai-cdk-constructs`から`aws-cdk-lib`のネイティブリソースに変更
- OpenSearch Serverlessコレクションの代わりにS3 Vector Bucketを使用
- より詳細な権限制御とコスト効率的な構成

**メリット**:
- **コスト削減**: OpenSearch Serverlessより大幅に安価
- **スケーラビリティ**: S3の無制限容量を活用
- **簡素化**: 管理が必要なリソース数の削減

**注意点**:
- 既存のKnowledge Baseデータは移行が必要
- クエリレイテンシーがわずかに増加する可能性
- セマンティック検索のみ対応（ハイブリッド検索は非対応）
