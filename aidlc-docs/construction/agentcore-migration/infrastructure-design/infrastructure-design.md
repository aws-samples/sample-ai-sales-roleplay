# インフラストラクチャ設計書: AgentCore Runtime Migration

## 1. 概要

本ドキュメントは、AgentCore Runtime移行におけるインフラストラクチャ設計を定義します。
論理コンポーネントを実際のAWSサービスにマッピングし、CDK実装の詳細を記述します。

---

## 2. 設計決定サマリー

| 項目 | 決定内容 |
|-----|---------|
| ネットワーク構成 | PUBLIC（VPCなし） |
| デプロイ方式 | CDK CfnRuntime L1コンストラクト |
| 評価画面API | Python 3.9 Lambda |
| CDKスタック | 既存InfrastructureStackに追加 |
| 環境分離 | 環境別AgentCore Runtime |

---

## 3. AgentCore Runtime インフラ設計

### 3.1 エージェント一覧

| エージェント名 | 機能 | 認証方式 | 呼び出し元 |
|--------------|------|---------|----------|
| npc-conversation-agent | NPC会話応答生成 | AgentCore Identity (JWT) | フロントエンド |
| realtime-scoring-agent | リアルタイムスコアリング | AgentCore Identity (JWT) | フロントエンド |
| feedback-analysis-agent | フィードバック分析 | IAMロール | Step Functions |
| video-analysis-agent | 動画分析 | IAMロール | Step Functions |
| audio-analysis-agent | 音声分析 | IAMロール | Step Functions |

### 3.2 CfnRuntime 構成

```typescript
// CDK実装例: NPC会話エージェント
import { aws_bedrockagentcore as bedrockagentcore } from 'aws-cdk-lib';

const npcConversationAgent = new bedrockagentcore.CfnRuntime(this, 'NpcConversationAgent', {
  agentRuntimeName: `${props.envName}-npc-conversation-agent`,
  
  agentRuntimeArtifact: {
    containerConfiguration: {
      containerUri: // ECRイメージまたはS3
    },
    // または
    codeConfiguration: {
      code: {
        s3: {
          bucket: agentCodeBucket.bucketName,
          prefix: 'agents/npc-conversation/',
        },
      },
      entryPoint: ['python', '-m', 'agent'],
      runtime: 'python3.9',
    },
  },
  
  networkConfiguration: {
    networkMode: 'PUBLIC',
  },
  
  roleArn: npcAgentRole.roleArn,
  
  // フロントエンド直接呼び出し用JWT認証
  authorizerConfiguration: {
    customJwtAuthorizer: {
      discoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${props.cognitoUserPoolId}/.well-known/openid-configuration`,
      allowedClients: [props.cognitoClientId],
    },
  },
});
```

### 3.3 IAMロール設計

#### 3.3.1 フロントエンド直接呼び出しエージェント用ロール

```typescript
const frontendAgentRole = new iam.Role(this, 'FrontendAgentRole', {
  assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
  inlinePolicies: {
    BedrockAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-haiku-*`,
          ],
        }),
      ],
    }),
    AgentCoreMemoryAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'bedrock-agentcore:CreateMemory',
            'bedrock-agentcore:GetMemory',
            'bedrock-agentcore:ListEvents',
            'bedrock-agentcore:CreateEvent',
          ],
          resources: ['*'],
        }),
      ],
    }),
  },
});
```

#### 3.3.2 Step Functions呼び出しエージェント用ロール

```typescript
const stepFunctionsAgentRole = new iam.Role(this, 'StepFunctionsAgentRole', {
  assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
  inlinePolicies: {
    BedrockAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: [
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-haiku-*`,
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-4-5-*`,
          ],
        }),
      ],
    }),
    AgentCoreMemoryAccess: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: [
            'bedrock-agentcore:ListEvents',
          ],
          resources: ['*'],
        }),
      ],
    }),
    S3Access: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['s3:GetObject', 's3:PutObject'],
          resources: [
            `${sessionBucket.bucketArn}/*`,
            `${videoBucket.bucketArn}/*`,
          ],
        }),
      ],
    }),
  },
});
```

### 3.4 AgentCore Identity 設定

```typescript
// JWT認証設定（フロントエンド直接呼び出しエージェントのみ）
authorizerConfiguration: {
  customJwtAuthorizer: {
    // Cognito User Pool OIDC Discovery URL
    discoveryUrl: `https://cognito-idp.${this.region}.amazonaws.com/${props.cognitoUserPoolId}/.well-known/openid-configuration`,
    // 許可するクライアントID
    allowedClients: [props.cognitoClientId],
  },
},
```

### 3.5 AgentCore Memory 設定

```typescript
// Memory設定（エージェントコード内で設定）
// 保持期間: 365日（Short-Term Memory）
const memoryConfig = {
  retentionPeriodDays: 365,
  memoryType: 'SHORT_TERM',
};
```

---

## 4. 新規API インフラ設計

### 4.1 評価画面API Lambda

```typescript
// 評価画面API用Lambda
const evaluationApiLambda = new lambda.Function(this, 'EvaluationApiLambda', {
  functionName: `${props.envName}-evaluation-api`,
  runtime: lambda.Runtime.PYTHON_3_9,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/evaluation-api'),
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,
  environment: {
    SESSION_BUCKET: sessionBucket.bucketName,
    AGENTCORE_MEMORY_REGION: this.region,
  },
});

// AgentCore Memory読み取り権限
evaluationApiLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['bedrock-agentcore:ListEvents'],
  resources: ['*'],
}));

// S3読み取り権限
sessionBucket.grantRead(evaluationApiLambda);
```

### 4.2 API Gateway エンドポイント

```typescript
// 既存API Gatewayに追加
const evaluationResource = api.root.addResource('evaluation');
const sessionResource = evaluationResource.addResource('{sessionId}');

// GET /evaluation/{sessionId}/history
sessionResource.addResource('history').addMethod('GET', 
  new apigateway.LambdaIntegration(evaluationApiLambda),
  { authorizer: cognitoAuthorizer }
);

// GET /evaluation/{sessionId}/metrics
sessionResource.addResource('metrics').addMethod('GET',
  new apigateway.LambdaIntegration(evaluationApiLambda),
  { authorizer: cognitoAuthorizer }
);

// GET /evaluation/{sessionId}/feedback
sessionResource.addResource('feedback').addMethod('GET',
  new apigateway.LambdaIntegration(evaluationApiLambda),
  { authorizer: cognitoAuthorizer }
);

// GET /evaluation/{sessionId}/video-analysis
sessionResource.addResource('video-analysis').addMethod('GET',
  new apigateway.LambdaIntegration(evaluationApiLambda),
  { authorizer: cognitoAuthorizer }
);
```

---

## 5. 既存インフラ変更

### 5.1 削除対象Lambda

| Lambda名 | 理由 |
|---------|------|
| bedrock/index.py | AgentCore Runtime (npc-conversation-agent) に移行 |
| scoring/realtime_scoring.py | AgentCore Runtime (realtime-scoring-agent) に移行 |
| sessionAnalysis/feedback_handler.py | AgentCore Runtime (feedback-analysis-agent) に移行 |
| sessionAnalysis/reference_handler.py | AgentCore Runtime (feedback-analysis-agent) に統合 |
| sessionAnalysis/video_handler.py | AgentCore Runtime (video-analysis-agent) に移行 |
| audioAnalysis/agent/agent.py | AgentCore Runtime (audio-analysis-agent) に移行 |

### 5.2 削除対象API Gatewayエンドポイント

| エンドポイント | 理由 |
|--------------|------|
| POST /bedrock/* | AgentCore Runtime直接呼び出しに変更 |
| POST /scoring/* | AgentCore Runtime直接呼び出しに変更 |

### 5.3 削除対象DynamoDBテーブル

| テーブル名 | 理由 |
|----------|------|
| ConversationHistoryTable | AgentCore Memoryに移行 |
| SessionMetricsTable | AgentCore Memoryに移行 |

### 5.4 継続使用DynamoDBテーブル

| テーブル名 | 理由 |
|----------|------|
| ScenariosTable | マスタデータ（変更なし） |
| NpcTable | マスタデータ（変更なし） |
| UsersTable | ユーザーデータ（変更なし） |

### 5.5 Step Functions更新

```typescript
// 既存Step Functionsの更新
// Lambda呼び出し → AgentCore Runtime呼び出しに変更

// Before: Lambda呼び出し
const feedbackTask = new tasks.LambdaInvoke(this, 'FeedbackAnalysis', {
  lambdaFunction: feedbackLambda,
  // ...
});

// After: AgentCore Runtime呼び出し
const feedbackTask = new tasks.CallAwsService(this, 'FeedbackAnalysis', {
  service: 'bedrockagentcore',
  action: 'invokeAgent',
  parameters: {
    AgentRuntimeArn: feedbackAnalysisAgent.attrArn,
    SessionId: sfn.JsonPath.stringAt('$.sessionId'),
    Payload: sfn.JsonPath.objectAt('$'),
  },
  iamResources: [feedbackAnalysisAgent.attrArn],
});
```

---

## 6. フロントエンド変更

### 6.1 AgentCore Runtime呼び出し

```typescript
// フロントエンドからAgentCore Runtime直接呼び出し
import { fetchAuthSession } from 'aws-amplify/auth';

const invokeAgent = async (agentArn: string, payload: any) => {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  
  const response = await fetch(
    `https://bedrock-agentcore.${region}.amazonaws.com/agents/${agentArn}/invoke`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    }
  );
  
  return response.json();
};
```

### 6.2 評価画面API呼び出し

```typescript
// 評価画面API呼び出し（既存API Gateway経由）
const getSessionHistory = async (sessionId: string) => {
  return apiService.apiGet(`/evaluation/${sessionId}/history`);
};

const getSessionMetrics = async (sessionId: string) => {
  return apiService.apiGet(`/evaluation/${sessionId}/metrics`);
};

const getSessionFeedback = async (sessionId: string) => {
  return apiService.apiGet(`/evaluation/${sessionId}/feedback`);
};
```

---

## 7. 環境別設定

### 7.1 環境変数

```typescript
// .env.dev
AGENTCORE_NPC_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/dev-npc-conversation-agent
AGENTCORE_SCORING_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/dev-realtime-scoring-agent

// .env.staging
AGENTCORE_NPC_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/staging-npc-conversation-agent
AGENTCORE_SCORING_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/staging-realtime-scoring-agent

// .env.prod
AGENTCORE_NPC_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/prod-npc-conversation-agent
AGENTCORE_SCORING_AGENT_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:xxx:agent-runtime/prod-realtime-scoring-agent
```

### 7.2 CDK環境別デプロイ

```typescript
// bin/cdk.ts
const devStack = new InfrastructureStack(app, 'DevStack', {
  envName: 'dev',
  cognitoUserPoolId: process.env.DEV_COGNITO_USER_POOL_ID!,
  cognitoClientId: process.env.DEV_COGNITO_CLIENT_ID!,
});

const stagingStack = new InfrastructureStack(app, 'StagingStack', {
  envName: 'staging',
  cognitoUserPoolId: process.env.STAGING_COGNITO_USER_POOL_ID!,
  cognitoClientId: process.env.STAGING_COGNITO_CLIENT_ID!,
});

const prodStack = new InfrastructureStack(app, 'ProdStack', {
  envName: 'prod',
  cognitoUserPoolId: process.env.PROD_COGNITO_USER_POOL_ID!,
  cognitoClientId: process.env.PROD_COGNITO_CLIENT_ID!,
});
```

---

## 8. セキュリティ設計

### 8.1 IAM最小権限

| ロール | 権限 |
|-------|------|
| FrontendAgentRole | Bedrock InvokeModel, AgentCore Memory CRUD |
| StepFunctionsAgentRole | Bedrock InvokeModel, AgentCore Memory Read, S3 Read/Write |
| EvaluationApiLambdaRole | AgentCore Memory Read, S3 Read |

### 8.2 データ暗号化

| データ | 暗号化方式 |
|-------|----------|
| AgentCore Memory | AWS管理キー（デフォルト） |
| S3 (分析結果) | SSE-S3 |
| 転送時 | TLS 1.2+ |

---

## 9. 監視設計

### 9.1 CloudWatch メトリクス

| メトリクス | 閾値 | アラーム |
|----------|-----|---------|
| AgentCore Invocations | - | 情報のみ |
| AgentCore Errors | 10% | SNS通知 |
| AgentCore Latency | 60秒 | SNS通知 |
| Evaluation API Errors | 5% | SNS通知 |

### 9.2 CloudWatch Logs

| ログ | 保持期間 |
|-----|---------|
| AgentCore Runtime | 30日 |
| Evaluation API Lambda | 30日 |

---

**作成日**: 2026-01-08
**バージョン**: 1.0
