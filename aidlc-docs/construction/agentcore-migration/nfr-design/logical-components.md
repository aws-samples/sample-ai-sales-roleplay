# 論理コンポーネント設計: AgentCore Runtime Migration

## 1. 概要

本ドキュメントは、AgentCore Runtime移行における論理コンポーネントの設計を定義します。
システム全体のコンポーネント構成、データフロー、認証フロー、エラーハンドリングを設計します。

---

## 2. システムアーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              フロントエンド                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         React Application                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │  │ 会話画面     │  │ 評価画面     │  │ シナリオ選択 │                 │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                    │                    │                                   │
│                    │ JWT               │ JWT                               │
│                    ▼                    ▼                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                     │                    │
                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AgentCore Identity                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Custom JWT Authorizer (Cognito User Pool)                          │   │
│  │  - JWT検証                                                          │   │
│  │  - ユーザーID抽出                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                     │                    │
                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AgentCore Runtime                                   │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │  NPC会話エージェント  │  │ スコアリングエージェント│                          │
│  │  (npc-conversation) │  │ (realtime-scoring)  │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│            │                        │                                       │
│            ▼                        ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      AgentCore Memory                               │   │
│  │  - 会話履歴                                                         │   │
│  │  - メトリクス履歴                                                    │   │
│  │  - ゴール状態                                                        │   │
│  │  - セッションメタデータ                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Bedrock Claude 4.5 Haiku                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. AgentCore Runtime コンポーネント

### 3.1 NPC会話エージェント

**名前**: `npc-conversation-agent`

**責務**:
- NPC（顧客役）との会話応答生成
- 会話履歴の管理
- 感情状態の管理

**入力**:
```json
{
  "sessionId": "string",
  "scenarioId": "string",
  "userMessage": "string",
  "npcConfig": {
    "name": "string",
    "personality": "string",
    "role": "string"
  }
}
```

**出力**:
```json
{
  "npcResponse": "string",
  "emotionState": {
    "anger": 0-100,
    "trust": 0-100,
    "progress": 0-100
  }
}
```

**依存関係**:
- Bedrock Claude 4.5 Haiku
- AgentCore Memory

**認証**: AgentCore Identity (JWT)

### 3.2 スコアリングエージェント

**名前**: `realtime-scoring-agent`

**責務**:
- リアルタイムスコアリング
- ゴール達成状況の評価
- コンプライアンスチェック

**入力**:
```json
{
  "sessionId": "string",
  "userMessage": "string",
  "conversationHistory": [],
  "goals": []
}
```

**出力**:
```json
{
  "scores": {
    "angerLevel": 0-100,
    "trustLevel": 0-100,
    "progressLevel": 0-100
  },
  "goalStatuses": [],
  "compliance": {
    "passed": true,
    "violations": []
  }
}
```

**依存関係**:
- Bedrock Claude 4.5 Haiku
- AgentCore Memory
- Bedrock Guardrails

**認証**: AgentCore Identity (JWT)

### 3.3 フィードバック分析エージェント

**名前**: `feedback-analysis-agent`

**責務**:
- セッション終了後のフィードバック生成
- 強み・改善点の分析
- 総合評価の算出

**入力**:
```json
{
  "sessionId": "string"
}
```

**出力**:
```json
{
  "feedback": {
    "strengths": [],
    "improvements": [],
    "overallScore": 0-100,
    "summary": "string"
  }
}
```

**依存関係**:
- Bedrock Claude 4.5 Haiku
- AgentCore Memory (ListEvents)
- S3 (結果保存)

**認証**: IAMロール（Step Functions経由）

### 3.4 動画分析エージェント

**名前**: `video-analysis-agent`

**責務**:
- セッション録画の分析
- 視線・表情・身振りの評価
- Nova Premiere連携

**入力**:
```json
{
  "sessionId": "string",
  "videoS3Key": "string"
}
```

**出力**:
```json
{
  "videoAnalysis": {
    "eyeContact": 0-100,
    "facialExpression": 0-100,
    "bodyLanguage": 0-100,
    "overallPresentation": 0-100
  }
}
```

**依存関係**:
- Amazon Nova Premiere
- S3 (動画取得・結果保存)

**認証**: IAMロール（Step Functions経由）

### 3.5 音声分析エージェント

**名前**: `audio-analysis-agent`

**責務**:
- 音声コンプライアンスチェック
- 発話パターン分析

**入力**:
```json
{
  "sessionId": "string",
  "audioS3Key": "string"
}
```

**出力**:
```json
{
  "audioAnalysis": {
    "compliance": {
      "passed": true,
      "violations": []
    },
    "speechPatterns": {}
  }
}
```

**依存関係**:
- Amazon Transcribe
- Bedrock Claude 4.5 Haiku
- S3 (音声取得・結果保存)

**認証**: IAMロール（Step Functions経由）

---

## 4. 認証フロー設計

### 4.1 フロントエンド直接呼び出し（AgentCore Identity）

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ フロントエンド │────▶│   Cognito   │────▶│ AgentCore Identity│────▶│ AgentCore Runtime│
│             │     │ User Pool   │     │ (JWT Authorizer) │     │                 │
└─────────────┘     └─────────────┘     └──────────────────┘     └─────────────────┘
      │                   │                      │                        │
      │ 1. ログイン        │                      │                        │
      │──────────────────▶│                      │                        │
      │                   │                      │                        │
      │ 2. JWT取得         │                      │                        │
      │◀──────────────────│                      │                        │
      │                   │                      │                        │
      │ 3. エージェント呼び出し (JWT)              │                        │
      │─────────────────────────────────────────▶│                        │
      │                   │                      │                        │
      │                   │ 4. JWT検証            │                        │
      │                   │◀─────────────────────│                        │
      │                   │                      │                        │
      │                   │ 5. 検証結果           │                        │
      │                   │─────────────────────▶│                        │
      │                   │                      │                        │
      │                   │                      │ 6. エージェント実行     │
      │                   │                      │───────────────────────▶│
      │                   │                      │                        │
      │ 7. レスポンス                              │                        │
      │◀─────────────────────────────────────────────────────────────────│
```

**CDK実装**:
```typescript
const cfnRuntime = new bedrockagentcore.CfnRuntime(this, 'NpcAgentRuntime', {
  // ...
  authorizerConfiguration: {
    customJwtAuthorizer: {
      discoveryUrl: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/openid-configuration`,
      allowedClients: [clientId],
    },
  },
});
```

### 4.2 Step Functions経由呼び出し（IAMロール）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Step Functions │────▶│ AgentCore Runtime │────▶│    処理実行      │
│  (IAM Role)     │     │ (IAM認証)        │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │ 1. IAMロール認証        │
        │───────────────────────▶│
        │                        │
        │ 2. エージェント実行     │
        │◀───────────────────────│
```

**CDK実装**:
```typescript
const cfnRuntime = new bedrockagentcore.CfnRuntime(this, 'AnalysisAgentRuntime', {
  // ...
  // authorizerConfiguration なし（IAMロール認証）
});

// Step Functions タスク
const invokeAgent = new tasks.CallAwsService(this, 'InvokeAgent', {
  service: 'bedrockagentcore',
  action: 'invokeAgent',
  parameters: {
    AgentRuntimeArn: cfnRuntime.attrArn,
    // ...
  },
  iamResources: [cfnRuntime.attrArn],
});
```

---

## 5. データフロー設計

### 5.1 会話フロー

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐
│ フロントエンド │────▶│ NPC会話エージェント│────▶│ AgentCore Memory │────▶│ Bedrock     │
│             │     │                 │     │                 │     │ Claude      │
└─────────────┘     └─────────────────┘     └─────────────────┘     └─────────────┘
      │                     │                       │                      │
      │ 1. ユーザーメッセージ │                       │                      │
      │────────────────────▶│                       │                      │
      │                     │                       │                      │
      │                     │ 2. 会話履歴取得        │                      │
      │                     │──────────────────────▶│                      │
      │                     │                       │                      │
      │                     │ 3. 履歴返却           │                      │
      │                     │◀──────────────────────│                      │
      │                     │                       │                      │
      │                     │ 4. LLM呼び出し                               │
      │                     │─────────────────────────────────────────────▶│
      │                     │                       │                      │
      │                     │ 5. NPC応答                                   │
      │                     │◀─────────────────────────────────────────────│
      │                     │                       │                      │
      │                     │ 6. 会話履歴保存        │                      │
      │                     │──────────────────────▶│                      │
      │                     │                       │                      │
      │ 7. NPC応答          │                       │                      │
      │◀────────────────────│                       │                      │
```

### 5.2 評価画面データ取得フロー

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐
│ フロントエンド │────▶│   API Gateway   │────▶│  Lambda (新規)  │────▶│ データソース │
│ (評価画面)   │     │                 │     │                 │     │             │
└─────────────┘     └─────────────────┘     └─────────────────┘     └─────────────┘
      │                     │                       │                      │
      │ 1. 会話履歴取得      │                       │                      │
      │────────────────────▶│                       │                      │
      │                     │                       │                      │
      │                     │ 2. Lambda呼び出し     │                      │
      │                     │──────────────────────▶│                      │
      │                     │                       │                      │
      │                     │                       │ 3. ListEvents API    │
      │                     │                       │─────────────────────▶│
      │                     │                       │   (AgentCore Memory) │
      │                     │                       │                      │
      │                     │                       │ 4. 履歴データ        │
      │                     │                       │◀─────────────────────│
      │                     │                       │                      │
      │                     │ 5. レスポンス         │                      │
      │                     │◀──────────────────────│                      │
      │                     │                       │                      │
      │ 6. 会話履歴          │                       │                      │
      │◀────────────────────│                       │                      │
```

### 5.3 セッション分析フロー

```
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│  セッション終了  │────▶│                  Step Functions                     │
│  トリガー       │     │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
└─────────────────┘     │  │ フィードバック │  │  動画分析   │  │  音声分析   │ │
                        │  │   分析       │  │             │  │             │ │
                        │  └─────────────┘  └─────────────┘  └─────────────┘ │
                        │         │                │                │        │
                        │         ▼                ▼                ▼        │
                        │  ┌─────────────────────────────────────────────┐  │
                        │  │              S3 (結果保存)                   │  │
                        │  │  sessions/{session-id}/                     │  │
                        │  │  ├── feedback.json                          │  │
                        │  │  ├── video-analysis.json                    │  │
                        │  │  └── audio-analysis.json                    │  │
                        │  └─────────────────────────────────────────────┘  │
                        └─────────────────────────────────────────────────────┘
```

---

## 6. エラーハンドリング設計

### 6.1 フロントエンドエラーハンドリング

```typescript
// エラー種別
enum AgentErrorType {
  TIMEOUT = 'TIMEOUT',           // 120秒タイムアウト
  AUTH_ERROR = 'AUTH_ERROR',     // 認証エラー
  AGENT_ERROR = 'AGENT_ERROR',   // エージェント内部エラー
  NETWORK_ERROR = 'NETWORK_ERROR' // ネットワークエラー
}

// エラーハンドリング
const handleAgentError = (error: AgentError) => {
  switch (error.type) {
    case AgentErrorType.TIMEOUT:
      showError('応答に時間がかかっています。再試行してください。');
      break;
    case AgentErrorType.AUTH_ERROR:
      // 再ログインを促す
      redirectToLogin();
      break;
    case AgentErrorType.AGENT_ERROR:
      showError('エラーが発生しました。再試行してください。');
      break;
    case AgentErrorType.NETWORK_ERROR:
      showError('ネットワークエラーが発生しました。');
      break;
  }
  // 手動リトライボタンを表示
  setCanRetry(true);
};
```

### 6.2 エージェント内エラーハンドリング

```python
from bedrock_agentcore.runtime import BedrockAgentCoreApp

app = BedrockAgentCoreApp()

@app.entrypoint
async def agent_invocation(payload, context):
    try:
        # メイン処理
        response = await process_conversation(payload, context)
        yield {"success": True, "data": response}
    except BedrockError as e:
        # Bedrock呼び出しエラー
        logger.error(f"Bedrock error: {e}")
        yield {"success": False, "error": "LLM_ERROR", "message": str(e)}
    except MemoryError as e:
        # Memory操作エラー
        logger.error(f"Memory error: {e}")
        yield {"success": False, "error": "MEMORY_ERROR", "message": str(e)}
    except Exception as e:
        # その他のエラー
        logger.error(f"Unexpected error: {e}")
        yield {"success": False, "error": "INTERNAL_ERROR", "message": "内部エラーが発生しました"}
```

---

## 7. コンポーネント一覧

### 7.1 AgentCore Runtime コンポーネント

| コンポーネント名 | 種別 | 認証方式 | 依存関係 |
|----------------|------|---------|---------|
| npc-conversation-agent | AgentCore Runtime | AgentCore Identity (JWT) | Bedrock, Memory |
| realtime-scoring-agent | AgentCore Runtime | AgentCore Identity (JWT) | Bedrock, Memory, Guardrails |
| feedback-analysis-agent | AgentCore Runtime | IAMロール | Bedrock, Memory, S3 |
| video-analysis-agent | AgentCore Runtime | IAMロール | Nova Premiere, S3 |
| audio-analysis-agent | AgentCore Runtime | IAMロール | Transcribe, Bedrock, S3 |

### 7.2 新規API コンポーネント

| エンドポイント | メソッド | 機能 | データソース |
|---------------|---------|------|-------------|
| /sessions/{id}/history | GET | 会話履歴取得 | AgentCore Memory |
| /sessions/{id}/metrics | GET | メトリクス履歴取得 | AgentCore Memory |
| /sessions/{id}/feedback | GET | フィードバック取得 | S3 |
| /sessions/{id}/video-analysis | GET | 動画分析結果取得 | S3 |

### 7.3 継続使用コンポーネント

| コンポーネント | 変更 |
|--------------|------|
| Cognito User Pool | 変更なし |
| DynamoDB (シナリオ/NPC) | 変更なし |
| S3 (動画/音声) | 変更なし |
| Step Functions | エージェント呼び出し先変更 |
| API Gateway (その他) | 変更なし |

---

## 8. 移行影響範囲

### 8.1 削除対象

| コンポーネント | 理由 |
|--------------|------|
| Lambda (bedrock/index.py) | AgentCore Runtimeに移行 |
| Lambda (scoring/realtime_scoring.py) | AgentCore Runtimeに移行 |
| Lambda (sessionAnalysis/*) | AgentCore Runtimeに移行 |
| Lambda (audioAnalysis/*) | AgentCore Runtimeに移行 |
| API Gateway /bedrock/* | AgentCore Runtime直接呼び出し |
| API Gateway /scoring/* | AgentCore Runtime直接呼び出し |
| DynamoDB (会話履歴テーブル) | AgentCore Memoryに移行 |
| DynamoDB (メトリクステーブル) | AgentCore Memoryに移行 |

### 8.2 新規作成

| コンポーネント | 目的 |
|--------------|------|
| AgentCore Runtime (5エージェント) | エージェントホスティング |
| AgentCore Identity設定 | JWT認証 |
| Lambda (評価画面API) | Memory/S3データ取得 |
| API Gateway (評価画面) | 新規エンドポイント |

---

**作成日**: 2026-01-08
**バージョン**: 1.0
