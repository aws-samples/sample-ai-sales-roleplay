import * as cdk from 'aws-cdk-lib';
import { CfnWebACLAssociation } from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { Auth } from './constructs/auth';
import { Api } from './constructs/api';
import { CommonWebAcl } from './constructs/common-web-acl';
import { Web } from './constructs/web';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { DatabaseTables } from './constructs/storage/database-tables';
import { GuardrailsConstruct } from './constructs/guardrails';
import { PdfStorageConstruct } from './constructs/storage/pdf-storage';
import { Polly } from './constructs/polly';
import { VectorKB } from './constructs/knowledgebase';
import { BedrockModelsConfig } from './types/bedrock-models';
import { AgentCoreRuntime } from './constructs/agentcore';
import { AgentCoreMemory } from './constructs/agentcore/agentcore-memory';
import * as path from 'path';

/**
 * メインインフラストラクチャスタック
 * 
 * Cognitoなどの各種AWSリソースを統合的に管理する
 */
export interface InfrastructureStackProps extends cdk.StackProps {
  webAclId?: string;
  allowedIpV4AddressRanges: string[] | null;
  allowedIpV6AddressRanges: string[] | null;
  allowedCountryCodes: string[] | null;
  envName?: string;
  envId?: string; // 環境識別子
  bedrockModels: BedrockModelsConfig; // フラット化済みBedrockモデル設定
}

export class InfrastructureStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  // AgentCore Runtimes
  public readonly npcConversationAgent: AgentCoreRuntime;
  public readonly realtimeScoringAgent: AgentCoreRuntime;
  public readonly feedbackAnalysisAgent: AgentCoreRuntime;
  public readonly videoAnalysisAgent: AgentCoreRuntime;
  public readonly audioAnalysisAgent: AgentCoreRuntime;

  // AgentCore Memory
  public readonly sessionMemory: AgentCoreMemory;

  constructor(scope: Construct, id: string, props?: InfrastructureStackProps) {
    super(scope, id, {
      description: "AI Sales Roleplay Stack (uksb-s467hwtl8y)",
      ...props,
    });

    // 環境識別子を使ってリソース名を構築
    const resourcePrefix = props?.envId ? `${props.envId}-` : '';

    // 環境に応じたコンテキスト設定の取得
    const envId = props?.envId || 'dev';
    const envContextKey = `env:${envId}`;
    const envConfig = this.node.tryGetContext(envContextKey) || {};
    const defaultConfig = this.node.tryGetContext('default') || {};

    // 環境設定とデフォルト設定をマージ
    const config = {
      ...defaultConfig,
      ...envConfig
    };

    const selfSignUpEnabled: boolean = config.selfSignUpEnabled ?? true;
    const allowedSignUpEmailDomains: string[] | null | undefined = config.allowedSignUpEmailDomains;

    const polly = new Polly(this, 'Polly', {
      envId: envId
    })

    const auth = new Auth(this, 'Auth', {
      selfSignUpEnabled,
      allowedIpV4AddressRanges: props?.allowedIpV4AddressRanges || null,
      allowedIpV6AddressRanges: props?.allowedIpV6AddressRanges || null,
      allowedSignUpEmailDomains,
      resourceNamePrefix: resourcePrefix // 環境識別子をリソース名に含める
    });

    // データベーステーブルを作成
    const databaseTables = new DatabaseTables(this, 'DatabaseTables', {
      resourceNamePrefix: resourcePrefix
    });

    // Guardrailsをデプロイ
    const guardrails = new GuardrailsConstruct(this, 'Guardrails', {
      resourceNamePrefix: resourcePrefix
    });

    // PDF資料保存用S3バケット
    const pdfStorage = new PdfStorageConstruct(this, 'PdfStorage', {
      resourceNamePrefix: resourcePrefix
    });

    // knowledge baseをデプロイ
    const kb = new VectorKB(this, "VectorKB", {
      resourceNamePrefix: resourcePrefix,
      dataSourceBucket: pdfStorage.bucket,
    })

    // ========================================
    // AgentCore Memory - セッション状態管理
    // ========================================
    this.sessionMemory = new AgentCoreMemory(this, 'SessionMemory', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      memoryName: 'session_memory',
      description: '会話履歴、メトリクス、セッション状態を統合管理するAgentCore Memory',
      expirationDays: 90, // 90日間保持
    });

    // ========================================
    // AgentCore Runtime - Strands Agent移行
    // ========================================

    // NPC会話エージェント（フロントエンド直接呼び出し - JWT認証）
    this.npcConversationAgent = new AgentCoreRuntime(this, 'NpcConversationAgent', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.client.userPoolClientId,
      agentCodePath: path.join(__dirname, '../agents/npc-conversation'),
      agentName: 'npc-conversation',
      description: `NPC会話応答生成エージェント - ${props!.bedrockModels.conversation}使用`,
      enableJwtAuth: true,
      sessionBucket: undefined,
      memoryId: this.sessionMemory.memoryId,
    });

    // リアルタイムスコアリングエージェント（フロントエンド直接呼び出し - JWT認証）
    this.realtimeScoringAgent = new AgentCoreRuntime(this, 'RealtimeScoringAgent', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.client.userPoolClientId,
      agentCodePath: path.join(__dirname, '../agents/realtime-scoring'),
      agentName: 'realtime-scoring',
      description: `リアルタイムスコアリングエージェント - ${props!.bedrockModels.scoring}使用`,
      enableJwtAuth: true,
      sessionBucket: undefined,
      memoryId: this.sessionMemory.memoryId,
      additionalEnvironmentVariables: {
        SESSION_FEEDBACK_TABLE: databaseTables.sessionFeedbackTable.tableName,
      },
      additionalPolicies: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'DynamoDBSessionFeedbackAccess',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
          resources: [databaseTables.sessionFeedbackTable.tableArn],
        }),
      ],
    });

    // フィードバック分析エージェント（Step Functions呼び出し - IAMロール認証）
    this.feedbackAnalysisAgent = new AgentCoreRuntime(this, 'FeedbackAnalysisAgent', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.client.userPoolClientId,
      agentCodePath: path.join(__dirname, '../agents/feedback-analysis'),
      agentName: 'feedback-analysis',
      description: `フィードバック分析エージェント - ${props!.bedrockModels.feedback}使用`,
      enableJwtAuth: false,
      sessionBucket: undefined,
      memoryId: this.sessionMemory.memoryId,
    });

    // 動画分析エージェント（Step Functions呼び出し - IAMロール認証）
    this.videoAnalysisAgent = new AgentCoreRuntime(this, 'VideoAnalysisAgent', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.client.userPoolClientId,
      agentCodePath: path.join(__dirname, '../agents/video-analysis'),
      agentName: 'video-analysis',
      description: `動画分析エージェント - ${props!.bedrockModels.video}使用`,
      enableJwtAuth: false,
      sessionBucket: undefined,
    });

    // 音声分析エージェント（Step Functions呼び出し - IAMロール認証）
    this.audioAnalysisAgent = new AgentCoreRuntime(this, 'AudioAnalysisAgent', {
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      cognitoUserPoolId: auth.userPool.userPoolId,
      cognitoClientId: auth.client.userPoolClientId,
      agentCodePath: path.join(__dirname, '../agents/audio-analysis'),
      agentName: 'audio-analysis',
      description: `音声分析エージェント - ${props!.bedrockModels.guardrail}使用（コンプライアンスチェック）`,
      enableJwtAuth: false,
      sessionBucket: undefined,
    });

    const api = new Api(this, 'API', {
      userPool: auth.userPool,
      userPoolClient: auth.client,
      envId: envId,
      resourceNamePrefix: resourcePrefix,
      databaseTables: databaseTables,
      guardrails: guardrails,
      pdfStorageBucket: pdfStorage.bucket,
      knowledgeBaseId: kb.knowledgeBaseId,
      bedrockModels: props!.bedrockModels,
      agentCoreMemoryId: this.sessionMemory.memoryId,
    });

    if (
      props?.allowedIpV4AddressRanges ||
      props?.allowedIpV6AddressRanges ||
      props?.allowedCountryCodes
    ) {
      const regionalWaf = new CommonWebAcl(this, 'RegionalWaf', {
        scope: 'REGIONAL',
        allowedIpV4AddressRanges: props.allowedIpV4AddressRanges,
        allowedIpV6AddressRanges: props.allowedIpV6AddressRanges,
        allowedCountryCodes: props.allowedCountryCodes,
        resourceNamePrefix: resourcePrefix // 環境識別子をリソース名に含める
      });
      new CfnWebACLAssociation(this, 'ApiWafAssociation', {
        resourceArn: api.api.api.deploymentStage.stageArn,
        webAclArn: regionalWaf.webAclArn,
      });
      new CfnWebACLAssociation(this, 'UserPoolWafAssociation', {
        resourceArn: auth.userPool.userPoolArn,
        webAclArn: regionalWaf.webAclArn,
      });
    }

    const web = new Web(this, 'Web', {
      apiEndpointUrl: api.api.api.url,
      userPoolId: auth.userPool.userPoolId,
      userPoolClientId: auth.client.userPoolClientId,
      idPoolId: auth.idPool.identityPoolId,
      selfSignUpEnabled,
      webAclId: props?.webAclId,
      resourceNamePrefix: resourcePrefix,
      transcribeWebSocketEndpoint: api.transcribeWebSocket.webSocketApiEndpoint,
      avatarBucket: api.avatarStorage.bucket,
      agentCoreEnabled: true,
      npcConversationAgentArn: this.npcConversationAgent.runtimeArn,
      realtimeScoringAgentArn: this.realtimeScoringAgent.runtimeArn,
    });

    const prefix = props?.envId ? `${props.envId}-` : '';

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      exportName: `${prefix}UserPoolId`
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: auth.client.userPoolClientId,
      exportName: `${prefix}UserPoolClientId`
    });
    new cdk.CfnOutput(this, 'IdPoolId', {
      value: auth.idPool.identityPoolId,
      exportName: `${prefix}IdPoolId`
    });

    new cdk.CfnOutput(this, 'ApiEndpointOutput', {
      value: api.api.api.url,
      description: 'API Gateway Endpoint URL',
      exportName: `${prefix}ApiEndpoint`
    });

    new cdk.CfnOutput(this, 'TranscribeWebSocketEndpoint', {
      value: api.transcribeWebSocket.webSocketApiEndpoint,
      description: 'WebSocket API Endpoint for Transcribe integration',
      exportName: `${prefix}TranscribeWebSocketEndpoint`
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${web.distribution.domainName}`,
      description: 'CloudFront URL for accessing the application',
      exportName: `${prefix}CloudFrontURL`
    });

    // Lexicon名をエクスポート
    new cdk.CfnOutput(this, 'JapaneseLexiconName', {
      value: `${resourcePrefix}JapaneseLexicon`,
      description: 'Japanese Lexicon Name for Amazon Polly',
      exportName: `${prefix}JapaneseLexiconName`
    });

    new cdk.CfnOutput(this, 'EnglishLexiconName', {
      value: `${resourcePrefix}EnglishLexicon`,
      description: 'English Lexicon Name for Amazon Polly',
      exportName: `${prefix}EnglishLexiconName`
    });

    // AgentCore Runtime ARNs
    new cdk.CfnOutput(this, 'NpcConversationAgentArn', {
      value: this.npcConversationAgent.runtimeArn,
      description: 'NPC Conversation AgentCore Runtime ARN',
      exportName: `${prefix}NpcConversationAgentArn`
    });

    new cdk.CfnOutput(this, 'RealtimeScoringAgentArn', {
      value: this.realtimeScoringAgent.runtimeArn,
      description: 'Realtime Scoring AgentCore Runtime ARN',
      exportName: `${prefix}RealtimeScoringAgentArn`
    });

    new cdk.CfnOutput(this, 'FeedbackAnalysisAgentArn', {
      value: this.feedbackAnalysisAgent.runtimeArn,
      description: 'Feedback Analysis AgentCore Runtime ARN',
      exportName: `${prefix}FeedbackAnalysisAgentArn`
    });

    new cdk.CfnOutput(this, 'VideoAnalysisAgentArn', {
      value: this.videoAnalysisAgent.runtimeArn,
      description: 'Video Analysis AgentCore Runtime ARN',
      exportName: `${prefix}VideoAnalysisAgentArn`
    });

    new cdk.CfnOutput(this, 'AudioAnalysisAgentArn', {
      value: this.audioAnalysisAgent.runtimeArn,
      description: 'Audio Analysis AgentCore Runtime ARN',
      exportName: `${prefix}AudioAnalysisAgentArn`
    });

    new cdk.CfnOutput(this, 'SessionMemoryId', {
      value: this.sessionMemory.memoryId,
      description: 'AgentCore Memory ID for session management',
      exportName: `${prefix}SessionMemoryId`
    });

    this.userPool = auth.userPool;
    this.userPoolClient = auth.client;
  }
}
