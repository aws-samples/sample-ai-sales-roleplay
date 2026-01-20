# Infrastructure Design Plan: AgentCore Runtime Migration

## 概要
NFR設計に基づき、AgentCore Runtime移行のインフラストラクチャ設計を行います。
論理コンポーネントを実際のAWSサービスにマッピングし、デプロイメントアーキテクチャを定義します。

---

## 設計計画チェックリスト

### Part 1: AgentCore Runtime インフラ設計
- [x] 1.1 AgentCore Runtime構成（5エージェント）
- [x] 1.2 AgentCore Identity設定
- [x] 1.3 AgentCore Memory設定
- [x] 1.4 AgentCore Observability設定

### Part 2: 新規API インフラ設計
- [x] 2.1 評価画面API（Lambda + API Gateway）
- [x] 2.2 IAMロール設計

### Part 3: 既存インフラ変更
- [x] 3.1 Step Functions更新
- [x] 3.2 DynamoDB変更（テーブル削除）
- [x] 3.3 API Gateway変更（エンドポイント削除）
- [x] 3.4 Lambda削除

### Part 4: フロントエンド変更
- [x] 4.1 AgentCore Runtime呼び出し設定
- [x] 4.2 評価画面API呼び出し設定

### Part 5: 成果物生成
- [x] 5.1 infrastructure-design.md作成
- [x] 5.2 deployment-architecture.md作成

---

## 確認質問

インフラストラクチャ設計を進めるにあたり、以下の点を確認させてください。

### Q1: AgentCore Runtimeネットワーク構成
AgentCore Runtimeのネットワーク構成はどうしますか？

A. PUBLIC（インターネット経由でアクセス）
B. VPC（既存VPC内に配置）

[Answer]: A

### Q2: AgentCore Runtimeコードのデプロイ方式
エージェントコードのデプロイ方式はどうしますか？

A. S3バケット経由（コードをS3にアップロード）
B. ECRイメージ経由（コンテナイメージとしてデプロイ）

[Answer]: CDKで行います。
https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_bedrockagentcore.CfnRuntime.html

### Q3: 評価画面API用Lambda実行環境
評価画面API用Lambdaの実行環境はどうしますか？

A. Python 3.9（既存Lambdaと同じ）
B. Python 3.12（最新LTS）
C. TypeScript/Node.js 20（フロントエンドと統一）

[Answer]: A

### Q4: CDKスタック構成
AgentCore関連リソースのCDKスタック構成はどうしますか？

A. 既存InfrastructureStackに追加
B. 新規AgentCoreStackを作成
C. 機能別に複数スタック（AgentCoreStack、EvaluationApiStack）

[Answer]: A

### Q5: 環境分離戦略
dev/staging/prod環境でのAgentCore Runtime分離はどうしますか？

A. 環境別に別々のAgentCore Runtime（推奨）
B. 単一AgentCore Runtimeを全環境で共有

[Answer]: A

---

## 回答サマリー

| 質問 | 回答 | 決定内容 |
|-----|------|---------|
| Q1 | A | PUBLIC（VPCなし） |
| Q2 | CDK | CfnRuntime L1コンストラクト使用 |
| Q3 | A | Python 3.9（既存Lambdaと同じ） |
| Q4 | A | 既存InfrastructureStackに追加 |
| Q5 | A | 環境別に別々のAgentCore Runtime |

---

**作成日**: 2026-01-08
**ステータス**: 回答完了 → インフラ設計ドキュメント生成中
