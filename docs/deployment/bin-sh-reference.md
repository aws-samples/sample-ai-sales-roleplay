# bin.sh デプロイスクリプト リファレンス

## 概要

`bin.sh`は、AI営業ロールプレイアプリケーションを AWS CloudShell から簡単にデプロイするためのスクリプトです。このスクリプトは、CloudFormation スタックの作成、CodeBuild プロジェクトの実行、アプリケーションのデプロイ（CDK）を自動化します。

## 基本使用方法

```bash
chmod +x bin.sh
./bin.sh
```

### リージョン指定（重要）

デプロイ先リージョンは `AWS_DEFAULT_REGION` 環境変数で指定します：

```bash
export AWS_DEFAULT_REGION=ap-northeast-1
./bin.sh
```

環境変数が未設定の場合は `us-east-1` が使用されます。

## 全パラメータ一覧

### 一般オプション

| パラメータ | 説明 | デフォルト値 | 必須 |
|-----------|------|--------------|------|
| `--disable-self-register` | セルフサインアップ機能を無効化 | `true`（有効） | いいえ |
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

### Global Cross Region Inference

本アプリケーションは、Amazon Bedrock の Global Cross Region Inference (CRIS) を使用しています。`global.*` プレフィックスのモデルIDを使用することで、リージョンに依存せず全商用リージョンで利用可能です。

### デフォルトモデル設定

| 用途 | モデル ID |
|------|----------|
| 対話・スコアリング・ガードレール | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |
| フィードバック・リファレンスチェック | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| 動画分析 | `global.amazon.nova-2-lite-v1:0` |

## 使用例

### 基本デプロイ

最もシンプルなデプロイ（US East 1 リージョン、すべてデフォルト設定）：

```bash
./bin.sh
```

### リージョン指定デプロイ

アジア太平洋リージョンでデプロイ：

```bash
export AWS_DEFAULT_REGION=ap-northeast-1
./bin.sh
```

### セルフサインアップ無効化

企業内利用でユーザー登録を管理者のみに制限：

```bash
./bin.sh --disable-self-register
```

### 個別モデル指定

特定の機能に高性能モデルを指定：

```bash
export AWS_DEFAULT_REGION=us-east-1
./bin.sh --conversation-model "global.anthropic.claude-sonnet-4-5-20250929-v1:0" \
         --feedback-model "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
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

### 複数リージョンでのデプロイ

異なるリージョンに同時にデプロイする場合：

```bash
# US East リージョンにデプロイ
export AWS_DEFAULT_REGION=us-east-1
./bin.sh

# Asia Pacific リージョンにデプロイ（別のターミナルで）
export AWS_DEFAULT_REGION=ap-northeast-1  
./bin.sh
```

## 利用可能なモデル

### Anthropic Claude モデル

| モデル ID | 特徴 | 推奨用途 | 対応リージョン |
|----------|------|----------|----------------|
| `global.anthropic.claude-haiku-4-5-20251001-v1:0` | 高速・低コスト（4.5世代） | 対話、スコアリング、ガードレール | Global |
| `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | 最新最高性能（4.5世代） | フィードバック、リファレンスチェック | Global |

### Amazon Nova モデル

| モデル ID | 特徴 | 推奨用途 | 対応リージョン |
|----------|------|----------|----------------|
| `global.amazon.nova-2-lite-v1:0` | 軽量・マルチモーダル（第2世代） | 動画分析 | Global |

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
