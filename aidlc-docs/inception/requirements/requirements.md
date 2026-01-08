# 要件定義書: Strands Agent → Bedrock AgentCore Runtime 移行

## 1. 概要

### 1.1 プロジェクト目的
現在AWS Lambda上で動作しているStrands Agentを、Amazon Bedrock AgentCore Runtimeに移行する。併せて、API Gateway + Cognito Authorizerによる認証を、Bedrock AgentCore Identity Inbound Authに置き換える。

### 1.2 移行の背景
- AgentCore Runtimeによるサーバーレスエージェントホスティングの活用
- マイクロVM分離によるセキュリティ強化
- AgentCore Memory/Observabilityによる運用性向上
- コスト最適化

### 1.3 制約事項
- **CDKデプロイ必須**: CLI（`agentcore launch`等）やAWSコンソールでの環境更新は禁止
- **既存Cognito User Pool継続使用**: 新規IdP作成は行わない
- **Strands Agents SDK継続使用**: エージェントロジックは維持

---

## 2. 機能要件

### 2.1 移行対象Lambda関数

| Lambda関数 | 現在の役割 | 移行優先度 |
|-----------|-----------|-----------|
| Bedrock Lambda | NPC会話処理（Strands Agent） | 高 |
| Scoring Lambda | リアルタイムスコアリング（Strands Agent） | 高 |
| AudioAnalysis Lambda | 音声分析処理 | 高 |

**根拠**: Q1回答「D. audioAnalysisも対象」

### 2.2 認証方式

#### 2.2.1 AgentCore Identity Inbound Auth
- **適用範囲**: AgentCore Runtimeに移行するエージェントのみ
- **他のAPI**: 現状のAPI Gateway + Cognito Authorizer維持
- **JWT認証設定**:
  - discoveryUrl: `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/openid-configuration`
  - allowedClients: 既存Cognito App Client ID

**根拠**: Q2回答「A」、Q3回答「A」

#### 2.2.2 フロントエンド認証フロー
```
1. ユーザーログイン（Cognito）
2. fetchAuthSession()でIDトークン取得
3. AgentCore Runtime呼び出し時にBearer認証ヘッダー設定
4. AgentCore IdentityがJWT検証
```

### 2.3 AgentCore Runtime機能活用

| 機能 | 活用 | 詳細 |
|-----|-----|-----|
| Runtime（ホスティング） | ✅ | Strands Agentのホスティング |
| Inbound Auth | ✅ | Cognito JWT認証 |
| Memory | ✅ | セッション状態の永続化 |
| Observability | ✅ | トレーシング、メトリクス |
| Gateway | ❌ | 使用しない |

**根拠**: Q6回答「B,C」

### 2.4 フロントエンド変更

#### 2.4.1 変更範囲
- **最小限の変更**のみ実施
- エンドポイントURL変更
- Authorizationヘッダー形式変更（`Bearer {token}`）

**根拠**: Q4回答「A」

#### 2.4.2 変更対象ファイル（想定）
- `frontend/src/services/ApiClient.ts` - AgentCore Runtime用メソッド追加
- `frontend/src/services/BedrockService.ts` - エンドポイント変更
- `frontend/src/services/ScoringService.ts` - エンドポイント変更

---

## 3. 非機能要件

### 3.1 優先度
1. **コスト最適化**（最優先）
2. パフォーマンス
3. 可用性
4. セキュリティ
5. 運用性

**根拠**: Q10回答「D」

### 3.2 パフォーマンス要件
- 会話応答レイテンシー: 現状維持（AgentCore Runtimeのコールドスタート考慮）
- ストリーミングレスポンス対応

### 3.3 可用性要件
- AgentCore Runtimeの可用性に依存
- フォールバック機構なし

**根拠**: Q9回答「A」

### 3.4 セキュリティ要件
- Cognito JWT認証によるアクセス制御
- AgentCore IdentityによるJWT検証
- マイクロVM分離によるセッション隔離

---

## 4. 移行戦略

### 4.1 移行方式
- **ビッグバン移行**: 一度に全て切り替え
- 新旧並行稼働期間なし

**根拠**: Q5回答「A」

### 4.2 既存リソースの扱い
- **API Gatewayエンドポイント**: 移行完了後に即座に削除
  - `/bedrock/conversation`
  - `/scoring/realtime`
  - `/audio/analysis`（該当する場合）

**根拠**: Q7回答「A」

### 4.3 移行手順（概要）
1. AgentCore Runtime用CDKコンストラクト作成
2. エージェントコードをAgentCore Runtime形式に変換
3. フロントエンドAPI呼び出し変更
4. CDKデプロイ（AgentCore Runtime作成）
5. 動作確認
6. 旧Lambda/API Gatewayリソース削除

---

## 5. CDK実装方針

### 5.1 実装アプローチ
- **既存InfrastructureStackに追加**
- 新規Stackは作成しない

**根拠**: Q8回答「A」

### 5.2 実装コンポーネント

#### 5.2.1 AgentCore Runtime Construct
```typescript
// cdk/lib/constructs/agentcore/agentcore-runtime.ts
export class AgentCoreRuntimeConstruct extends Construct {
  // AgentCore Runtime作成（Custom Resource経由）
  // Inbound Auth設定（Cognito JWT）
  // Memory設定
  // Observability設定
}
```

#### 5.2.2 Custom Resource
AgentCore RuntimeはCDK L1/L2コンストラクトが未提供のため、Custom Resource（Lambda + boto3）で実装

```typescript
// Custom Resource Lambda
// - create_runtime()
// - update_runtime()
// - delete_runtime()
```

### 5.3 依存関係
```
InfrastructureStack
├── AuthConstruct (既存Cognito)
├── ApiConstruct (既存API Gateway - 一部エンドポイント削除)
└── AgentCoreRuntimeConstruct (新規)
    ├── NPC会話エージェント
    ├── スコアリングエージェント
    └── 音声分析エージェント
```

---

## 6. エージェントコード変換

### 6.1 現在のLambda形式
```python
# cdk/lambda/bedrock/index.py
from strands import Agent
from strands.models import BedrockModel

def handler(event, context):
    agent = Agent(model=BedrockModel(...))
    response = agent(user_message)
    return {"statusCode": 200, "body": response}
```

### 6.2 AgentCore Runtime形式
```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel

app = BedrockAgentCoreApp()

@app.entrypoint
async def agent_invocation(payload, context):
    # context.user_id: JWT認証されたユーザーID
    # context.session_id: セッションID
    agent = Agent(model=BedrockModel(...))
    response = agent(payload.get("message"))
    yield {"message": response, "sessionId": context.session_id}
```

---

## 7. フロントエンド変更詳細

### 7.1 AgentCore Runtime呼び出し
```typescript
// 新規メソッド追加
async invokeAgentCoreRuntime(
  runtimeArn: string,
  payload: object
): Promise<Response> {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  
  const url = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodeURIComponent(runtimeArn)}/invocations`;
  
  return fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}
```

### 7.2 環境変数追加
```typescript
// frontend/src/config/environment.ts
AGENTCORE_NPC_RUNTIME_ARN: string;
AGENTCORE_SCORING_RUNTIME_ARN: string;
AGENTCORE_AUDIO_RUNTIME_ARN: string;
```

---

## 8. 成果物一覧

### 8.1 CDK成果物
| ファイル | 説明 |
|---------|------|
| `cdk/lib/constructs/agentcore/agentcore-runtime.ts` | AgentCore Runtime Construct |
| `cdk/lambda/agentcore-custom-resource/index.py` | Custom Resource Lambda |
| `cdk/lambda/agentcore/npc/index.py` | NPC会話エージェント（AgentCore形式） |
| `cdk/lambda/agentcore/scoring/index.py` | スコアリングエージェント（AgentCore形式） |
| `cdk/lambda/agentcore/audio/index.py` | 音声分析エージェント（AgentCore形式） |

### 8.2 フロントエンド成果物
| ファイル | 説明 |
|---------|------|
| `frontend/src/services/AgentCoreService.ts` | AgentCore Runtime呼び出しサービス |
| `frontend/src/services/BedrockService.ts` | 変更（AgentCore呼び出しに切り替え） |
| `frontend/src/services/ScoringService.ts` | 変更（AgentCore呼び出しに切り替え） |

### 8.3 削除対象
| リソース | 説明 |
|---------|------|
| `cdk/lambda/bedrock/` | 旧Bedrock Lambda |
| `cdk/lambda/scoring/` | 旧Scoring Lambda |
| API Gateway `/bedrock/*` | 旧エンドポイント |
| API Gateway `/scoring/*` | 旧エンドポイント |

---

## 9. リスクと対策

### 9.1 技術リスク
| リスク | 影響度 | 対策 |
|-------|-------|------|
| AgentCore Runtime CDK未サポート | 高 | Custom Resourceで実装 |
| コールドスタート遅延 | 中 | Provisioned Concurrency検討 |
| AgentCore Memory互換性 | 中 | 既存DynamoDBセッション管理との整合性確認 |

### 9.2 運用リスク
| リスク | 影響度 | 対策 |
|-------|-------|------|
| ビッグバン移行による障害 | 高 | 十分なテスト、ロールバック手順準備 |
| フォールバックなし | 中 | AgentCore Runtime SLA確認 |

---

## 10. 承認

| 項目 | 状態 |
|-----|------|
| 要件定義完了 | ✅ |
| ユーザー承認 | 待機中 |

---

**作成日**: 2026-01-08
**最終更新**: 2026-01-08
**バージョン**: 1.0
