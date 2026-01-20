# 技術スタック決定書: AgentCore Runtime Migration

## 1. 概要

本ドキュメントは、Strands Agent → Bedrock AgentCore Runtime移行における技術スタック選定の決定事項を記録します。

---

## 2. インフラストラクチャ

### 2.1 コンピューティング

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| エージェントホスティング | AWS Lambda | Bedrock AgentCore Runtime | サーバーレスエージェント専用環境、マイクロVM分離 |
| Custom Resource | - | AWS Lambda (Python) | AgentCore Runtime CDK未サポートのため |

### 2.2 認証・認可

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| IdP | Amazon Cognito | Amazon Cognito（継続） | 既存ユーザーベース維持 |
| API認証 | API Gateway + Cognito Authorizer | AgentCore Identity Inbound Auth | AgentCore統合認証 |
| トークン形式 | Cognito ID Token | Cognito ID Token（継続） | JWT互換性維持 |

### 2.3 API

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| エージェントAPI | API Gateway REST | AgentCore Runtime直接呼び出し | AgentCore統合 |
| その他API | API Gateway REST | API Gateway REST（継続） | 変更不要 |

### 2.4 データストア

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| セッション履歴 | DynamoDB | AgentCore Memory + DynamoDB | Memory: 会話履歴、DynamoDB: 結果保存 |
| ユーザーデータ | DynamoDB | DynamoDB（継続） | 変更不要 |
| シナリオデータ | DynamoDB | DynamoDB（継続） | 変更不要 |

### 2.5 監視・ログ

| 項目 | 現状 | 移行後 | 理由 |
|-----|------|--------|------|
| メトリクス | CloudWatch | CloudWatch + AgentCore Observability | 基本メトリクス統合 |
| ログ | CloudWatch Logs | CloudWatch Logs（継続） | 30日保持 |
| トレーシング | X-Ray | X-Ray + AgentCore Observability | 基本レベル |

---

## 3. アプリケーション

### 3.1 バックエンド

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| エージェントフレームワーク | Strands Agents SDK | 1.11.0+ | 既存実装継続 |
| AgentCore SDK | bedrock-agentcore | 最新 | Runtime統合必須 |
| 言語 | Python | 3.9+ | 既存実装継続 |
| LLMモデル | Claude 4.5 Haiku | - | 既存実装継続 |

### 3.2 フロントエンド

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| フレームワーク | React | 19.1.1 | 既存実装継続 |
| 認証 | AWS Amplify | v6.15.5 | 既存実装継続 |
| HTTP通信 | fetch API | - | AgentCore Runtime直接呼び出し |

### 3.3 IaC

| 項目 | 技術 | バージョン | 理由 |
|-----|------|----------|------|
| IaCフレームワーク | AWS CDK | 2.1026.0 | 既存実装継続 |
| AgentCore作成 | CfnRuntime (L1) | aws-cdk-lib | CDK L1コンストラクト利用可能 |
| セキュリティチェック | cdk-nag | 2.37.9 | 既存実装継続 |

---

## 4. 新規導入技術

### 4.1 Bedrock AgentCore Runtime

**選定理由**:
- サーバーレスエージェントホスティング
- マイクロVM分離によるセキュリティ
- Strands Agents SDK互換
- 自動スケーリング

**CDK実装方法** (L1コンストラクト):
```typescript
import { aws_bedrockagentcore as bedrockagentcore } from 'aws-cdk-lib';

const cfnRuntime = new bedrockagentcore.CfnRuntime(this, 'NpcAgentRuntime', {
  agentRuntimeArtifact: {
    codeConfiguration: {
      code: {
        s3: {
          bucket: codeBucket.bucketName,
          prefix: 'agents/npc/',
        },
      },
      entryPoint: ['python', '-m', 'agent'],
      runtime: 'python3.9',
    },
  },
  agentRuntimeName: 'npc-conversation-agent',
  networkConfiguration: {
    networkMode: 'PUBLIC',
  },
  roleArn: agentRole.roleArn,
  authorizerConfiguration: {
    customJwtAuthorizer: {
      discoveryUrl: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/openid-configuration`,
      allowedClients: [clientId],
    },
  },
});
```

**エージェントコード形式**:
```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
async def agent_invocation(payload, context):
    # context.user_id: JWT認証ユーザー
    # context.session_id: セッションID
    yield {"message": response}
```

### 4.2 AgentCore Identity Inbound Auth

**選定理由**:
- Cognito JWT直接検証
- API Gateway不要
- 統合認証管理

**実装方法**:
```typescript
// CDK Custom Resource設定
authorizerConfiguration: {
  customJWTAuthorizer: {
    discoveryUrl: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/openid-configuration`,
    allowedClients: [clientId]
  }
}
```

### 4.3 AgentCore Memory

**選定理由**:
- セッション内会話履歴の自動管理
- エージェントコンテキスト維持
- 既存DynamoDBとの併用可能

**活用範囲**:
- セッション内会話履歴のみ
- セッション終了時に自動クリア

### 4.4 AgentCore Observability

**選定理由**:
- 基本メトリクス自動収集
- CloudWatch統合
- 追加コストなし（基本機能）

**活用範囲**:
- 呼び出し回数
- エラー率
- レイテンシー

---

## 5. 廃止技術

### 5.1 廃止対象

| 項目 | 理由 |
|-----|------|
| Lambda (bedrock) | AgentCore Runtimeに移行 |
| Lambda (scoring) | AgentCore Runtimeに移行 |
| Lambda (audioAnalysis) | AgentCore Runtimeに移行 |
| API Gateway /bedrock/* | AgentCore Runtime直接呼び出しに変更 |
| API Gateway /scoring/* | AgentCore Runtime直接呼び出しに変更 |

### 5.2 継続使用

| 項目 | 理由 |
|-----|------|
| Cognito User Pool | 既存ユーザーベース維持 |
| DynamoDB | セッション結果、ユーザーデータ保存 |
| S3 | 動画、音声ファイル保存 |
| その他Lambda | 変更不要 |
| その他API Gateway | 変更不要 |

---

## 6. 技術的リスクと対策

| リスク | 影響度 | 対策 |
|-------|-------|------|
| ~~AgentCore Runtime CDK未サポート~~ | ~~高~~ | ✅ CfnRuntime L1コンストラクト利用可能 |
| AgentCore Memory互換性 | 中 | 既存DynamoDBと併用 |
| コールドスタート遅延 | 低 | 許容（コスト優先） |
| Strands SDK互換性 | 低 | 公式サポート確認済み |

---

## 7. 決定履歴

| 日付 | 決定事項 | 理由 |
|-----|---------|------|
| 2026-01-08 | AgentCore Runtime採用 | サーバーレスエージェント専用環境 |
| 2026-01-08 | Inbound Auth採用 | Cognito JWT直接検証 |
| 2026-01-08 | Custom Resource実装 | CDK未サポート対応 |
| 2026-01-08 | Memory基本活用 | セッション内履歴のみ |
| 2026-01-08 | Observability基本活用 | コスト最適化 |

---

**作成日**: 2026-01-08
**バージョン**: 1.0
