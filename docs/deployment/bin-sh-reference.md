# bin.sh デプロイスクリプト リファレンス

## 概要

`bin.sh`は、AI営業ロールプレイアプリケーションを AWS CloudShell から簡単にデプロイするためのスクリプトです。このスクリプトは、CloudFormation スタックの作成、CodeBuild プロジェクトの実行、アプリケーションのデプロイ（CDK）を自動化します。

## 基本使用方法

```bash
chmod +x bin.sh
./bin.sh
```

## 全パラメータ一覧

### 一般オプション

| パラメータ | 説明 | デフォルト値 | 必須 |
|-----------|------|--------------|------|
| `--disable-self-register` | セルフサインアップ機能を無効化 | `true`（有効） | いいえ |
| `--bedrock-region REGION` | Bedrock サービスを利用するリージョンを指定 | `us-east-1` | いいえ |
| `--repo-url URL` | GitHub リポジトリ URL を指定 | 公式リポジトリ | いいえ |
| `--version VERSION` | デプロイするブランチ/タグを指定 | `main` | いいえ |
| `--cdk-json-override JSON` | CDK 設定の JSON オーバーライド | `{}` | いいえ |
| `--help` | ヘルプメッセージを表示 | - | いいえ |

### 個別モデル指定オプション

| パラメータ | 説明 | 対象機能 | 必須 |
|-----------|------|----------|------|
| `--conversation-model MODEL` | 対話用モデルを指定 | AI との営業対話 | いいえ |
| `--scoring-model MODEL` | スコアリング用モデルを指定 | 営業スキル評価 | いいえ |
| `--feedback-model MODEL` | フィードバック用モデルを指定 | 改善提案生成 | いいえ |
| `--guardrail-model MODEL` | ガードレール用モデルを指定 | コンプライアンスチェック | いいえ |
| `--video-model MODEL` | 動画分析用モデルを指定 | 映像解析・フィードバック | いいえ |
| `--reference-check-model MODEL` | リファレンスチェック用モデルを指定 | 根拠資料準拠性確認 | いいえ |

## リージョン対応について

### 対応リージョンタイプ

本アプリケーションは、リージョンごとに利用可能な Bedrock モデルが異なることに対応しています：

- **US リージョン** (`us-*`): `us-east-1`, `us-west-2` など
- **AP リージョン** (`ap-*`): `ap-northeast-1`, `ap-southeast-1` など  
- **EU リージョン** (`eu-*`): `eu-west-1`, `eu-central-1` など

### 自動モデル選択機能

指定したリージョンに基づいて、以下のように適切なモデルが自動選択されます：

| リージョンタイプ | 対話用モデル | フィードバック用モデル | 動画分析用モデル |
|------------------|--------------|----------------------|------------------|
| US リージョン | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | `us.anthropic.claude-3-7-sonnet-20250219-v1:0` | `us.amazon.nova-lite-v1:0` |
| AP リージョン | `apac.anthropic.claude-3-haiku-20240307-v1:0` | `apac.anthropic.claude-3-7-sonnet-20250219-v1:0` | `apac.amazon.nova-lite-v1:0` |
| EU リージョン | `eu.anthropic.claude-3-haiku-20240307-v1:0` | `eu.anthropic.claude-3-7-sonnet-20250219-v1:0` | `eu.amazon.nova-lite-v1:0` |

## 使用例

### 基本デプロイ

最もシンプルなデプロイ（すべてデフォルト設定を使用）：

```bash
./bin.sh
```

### リージョン指定デプロイ

アジア太平洋リージョンでデプロイ：

```bash
./bin.sh --bedrock-region ap-northeast-1
```

### セルフサインアップ無効化

企業内利用でユーザー登録を管理者のみに制限：

```bash
./bin.sh --disable-self-register
```

### 個別モデル指定

特定の機能に高性能モデルを指定：

```bash
./bin.sh --bedrock-region us-east-1 \
         --conversation-model "us.anthropic.claude-3-5-sonnet-20241022-v2:0" \
         --feedback-model "us.anthropic.claude-3-7-sonnet-20250219-v1:0"
```

### 開発ブランチからのデプロイ

特定のブランチやタグからデプロイ：

```bash
./bin.sh --version feature/new-ui --repo-url https://github.com/your-org/ai-sales-roleplay.git
```

### 高度な設定オーバーライド

CDK 設定を直接オーバーライド：

```bash
./bin.sh --cdk-json-override '{
  "context": {
    "default": {
      "allowedSignUpEmailDomains": ["example.com"],
      "allowedIpV4AddressRanges": ["192.168.0.0/24"]
    }
  }
}'
```

## 利用可能なモデル

### Anthropic Claude モデル

| モデル ID | 特徴 | 推奨用途 |
|----------|------|----------|
| `us.anthropic.claude-3-5-haiku-20241022-v1:0` | 高速・低コスト | 対話、スコアリング、ガードレール |
| `us.anthropic.claude-3-5-sonnet-20241022-v2:0` | バランス型・高品質 | 対話（高品質が必要な場合） |
| `us.anthropic.claude-3-7-sonnet-20250219-v1:0` | 最高品質・高コスト | フィードバック、リファレンスチェック |

### Amazon Nova モデル

| モデル ID | 特徴 | 推奨用途 |
|----------|------|----------|
| `us.amazon.nova-lite-v1:0` | 軽量・マルチモーダル | 動画分析（基本） |
| `us.amazon.nova-pro-v1:0` | 高性能・マルチモーダル | 動画分析（高精度） |

**注意**: リージョンごとに利用可能なモデルが異なります。上記は US リージョンの例です。

## バリデーション機能

### モデル ID 形式チェック

スクリプトは、指定されたモデル ID が以下の形式に従っているかチェックします：

```
region.provider.model-name:version
```

例: `us.anthropic.claude-3-5-haiku-20241022-v1:0`

形式が正しくない場合は警告が表示され、続行するかユーザーに確認します。

## セキュリティ考慮事項

### 認証情報

- AWS CloudShell 内で実行することを前提としており、追加の認証設定は不要
- ローカル環境で実行する場合は、適切な AWS 認証情報の設定が必要

### ネットワーク制限

IP アドレス制限や地理的制限を設定する場合は、`--cdk-json-override` オプションを使用：

```bash
./bin.sh --cdk-json-override '{
  "context": {
    "default": {
      "allowedIpV4AddressRanges": ["203.0.113.0/24"],
      "allowedCountryCodes": ["JP", "US"]
    }
  }
}'
```
