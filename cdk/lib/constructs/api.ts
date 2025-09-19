import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { BedrockLambdaConstruct } from './api/bedrock-lambda';
import { ApiGatewayConstruct } from './api/api-gateway';
import { AudioStorageConstruct } from './storage/audio-storage';
import { VideoStorageConstruct } from './storage/video-storage';
import { VideosLambdaConstruct } from './api/videos-lambda';
import { ScoringLambdaConstruct } from './api/scoring-lambda';
import { SessionLambdaConstruct } from './api/session-lambda';
import { ScenarioLambdaConstruct } from './api/scenario-lambda';
import { RankingsLambdaConstruct } from './api/rankings-lambda';
import { GuardrailsLambdaConstruct } from './api/guardrails-lambda';
import { ReferenceCheckLambdaConstruct } from './api/referenceCheck-lambda'
import { AudioAnalysisLambdaConstruct } from './api/audio-analysis-lambda';
import { TranscribeWebSocketConstruct } from './api/transcribe-websocket';

// DatabaseTablesをインポート
import { DatabaseTables } from './storage/database-tables';

import { GuardrailsConstruct } from './guardrails';
import { AudioAnalysisStepFunctionsConstruct } from './audio-analysis-stepfunctions';

export interface BackendApiProps {
  userPool?: cognito.UserPool;
  userPoolClient?: cognito.UserPoolClient;
  envId: string; // 環境識別子
  guardrails?: GuardrailsConstruct;
  resourceNamePrefix: string; // リソース名のプレフィックス
  knowledgeBaseId: string; // Knowledge Base ID
  databaseTables: DatabaseTables; // 必須：DynamoDBテーブル
  pdfStorageBucket: s3.IBucket; // PDF資料保存用S3バケット
}

export class Api extends Construct {
  readonly api: ApiGatewayConstruct;
  
  /** WebSocket API for Transcribe */
  public readonly transcribeWebSocket: TranscribeWebSocketConstruct;

  /** Bedrock Lambda Construct */
  public readonly bedrockLambda: BedrockLambdaConstruct;

  /** 音声ストレージ */
  public readonly audioStorage: AudioStorageConstruct;

  /** 動画ストレージ */
  public readonly videoStorage: VideoStorageConstruct;

  /** 動画分析Lambda */
  public readonly videosLambda: VideosLambdaConstruct;

  /** テキスト→音声変換Lambda */
  public readonly textToSpeechFunction: NodejsFunction;

  /** データベーステーブル参照 */
  public readonly databaseTables: DatabaseTables;

  /** セッション管理Lambda */
  public readonly sessionLambda: SessionLambdaConstruct;

  /** シナリオ管理Lambda */
  public readonly scenarioLambda: ScenarioLambdaConstruct;

  /** ガードレール管理Lambda */
  public readonly guardrailsLambda: GuardrailsLambdaConstruct;

  /** ランキング管理Lambda */
  public readonly rankingsLambdaConstruct: RankingsLambdaConstruct;

  /** スコア管理Lambda */
  public readonly scoringLambdaConstruct: ScoringLambdaConstruct;

  /** リファレンスチェックLambda */
  public readonly referenceCheckLambda: ReferenceCheckLambdaConstruct;

  /** 音声分析Lambda */
  public readonly audioAnalysisLambda: AudioAnalysisLambdaConstruct;

  /** 音声分析Step Functions */
  public readonly audioAnalysisStepFunctions: AudioAnalysisStepFunctionsConstruct;

  constructor(scope: Construct, id: string, props: BackendApiProps) {
    super(scope, id);

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

    // セッション履歴用DynamoDBテーブル
    // データベーステーブルを保存
    this.databaseTables = props.databaseTables;

    // 音声ファイル用S3バケット
    this.audioStorage = new AudioStorageConstruct(this, 'AudioStorage', {
      resourceNamePrefix: props.resourceNamePrefix
    });

    // 動画ストレージの作成（受講生の録画用）
    this.videoStorage = new VideoStorageConstruct(this, 'VideoStorage', {
      resourceNamePrefix: props.resourceNamePrefix
    });
    // Amazon Bedrock 用モデル設定を取得
    const bedrockModels = config.bedrockModels

    // セッション管理Lambda関数
    this.sessionLambda = new SessionLambdaConstruct(this, 'SessionLambda', {
      sessionsTableName: this.databaseTables.sessionsTable.tableName,
      messagesTableName: this.databaseTables.messagesTable.tableName,
      scenariosTableName: this.databaseTables.scenariosTable.tableName, // シナリオテーブル名は必要 (完全データ取得時に使用)
      bedrockModels: bedrockModels,
      knowledgeBaseId: props.knowledgeBaseId,
      videoBucketName: this.videoStorage.bucket.bucketName, // ビデオファイル検索用
      sessionFeedbackTableName: this.databaseTables.sessionFeedbackTable.tableName // ビデオ分析結果保存用
    });

    // シナリオ管理Lambda関数
    this.scenarioLambda = new ScenarioLambdaConstruct(this, 'ScenarioLambda', {
      scenariosTable: this.databaseTables.scenariosTable,
      pdfBucket: props.pdfStorageBucket,
      knowledgeBaseId: props.knowledgeBaseId,
    });

    // SessionLambdaに各テーブル名を環境変数として設定
    this.sessionLambda.function.addEnvironment('SESSION_FEEDBACK_TABLE', this.databaseTables.sessionFeedbackTable.tableName);

    // SessionLambdaにDynamoDBテーブルへのアクセス権限を付与
    this.databaseTables.sessionFeedbackTable.grantReadWriteData(this.sessionLambda.function);

    // Amazon Bedrock Lambda関数
    this.bedrockLambda = new BedrockLambdaConstruct(this, 'BedrockLambda', {
      sessionsTableName: this.databaseTables.sessionsTable.tableName,
      messagesTableName: this.databaseTables.messagesTable.tableName,
      bedrockModels: bedrockModels
    });

    // テキスト→音声変換Lambda関数
    this.textToSpeechFunction = new NodejsFunction(this, 'TextToSpeechFunction', {
      entry: 'lambda/textToSpeech/app.ts',
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        STORAGE_BUCKET: this.audioStorage.bucket.bucketName,
        ENV_ID: props.envId
      },
      bundling: {
        externalModules: [
          '@aws-sdk/*'
        ]
      }
    });

    // Lambda実行ロールにPollyアクセス権限を付与
    this.textToSpeechFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'polly:SynthesizeSpeech',
          'polly:StartSpeechSynthesisTask',
          'polly:GetSpeechSynthesisTask',
          'polly:ListLexicons',
          'polly:GetLexicon'
        ],
        resources: ['*']
      })
    );

    // S3バケットへの書き込み権限を付与
    this.audioStorage.bucket.grantReadWrite(this.textToSpeechFunction);

    // スコアリングLambda関数
    this.scoringLambdaConstruct = new ScoringLambdaConstruct(this, 'ScoringLambda', {
      scoringModelId: bedrockModels.scoring,
      guardrailModelId: bedrockModels.guardrail,
      environmentPrefix: props.resourceNamePrefix,
      scenariosTable: this.databaseTables.scenariosTable,
      sessionFeedbackTable: this.databaseTables.sessionFeedbackTable,
    });

    // ランキングLambda関数を作成 (新しいRankingsLambdaConstructを使用)
    this.rankingsLambdaConstruct = new RankingsLambdaConstruct(this, 'RankingsLambda', {
      sessionFeedbackTable: this.databaseTables.sessionFeedbackTable,
      sessionsTable: this.databaseTables.sessionsTable,
      userPoolId: props.userPool!.userPoolId
    });

    // 動画管理Lambda関数
    this.videosLambda = new VideosLambdaConstruct(this, 'VideosLambda', {
      feedbackTableName: this.databaseTables.sessionFeedbackTable.tableName,
      videoBucket: this.videoStorage.bucket,
      videoAnalysisModelId: bedrockModels.video // 環境設定から動画分析モデルIDを取得
    });

    // ガードレールLambda関数を作成
    this.guardrailsLambda = new GuardrailsLambdaConstruct(this, 'GuardrailsLambda');

    // リファレンスチェックLambda関数を作成
    this.referenceCheckLambda = new ReferenceCheckLambdaConstruct(this, 'ReferenceCheckLambda', {
      feedbackTable: this.databaseTables.sessionFeedbackTable,
      sessionTable: this.databaseTables.sessionsTable,
      messagesTable: this.databaseTables.messagesTable,
      scenariosTable: this.databaseTables.scenariosTable,
      bedrockModels: bedrockModels,
      knowledgeBaseId: props.knowledgeBaseId
    });

    // 音声分析Lambda関数を作成
    this.audioAnalysisLambda = new AudioAnalysisLambdaConstruct(this, 'AudioAnalysisLambda', {
      sessionFeedbackTable: this.databaseTables.sessionFeedbackTable,
      scenariosTable: this.databaseTables.scenariosTable,
      audioBucket: this.audioStorage.bucket,
      knowledgeBaseId: props.knowledgeBaseId,
      bedrockModels: {
        analysis: bedrockModels.scoring // 分析用モデル
      }
    });

    // 音声分析Step Functionsを作成
    this.audioAnalysisStepFunctions = new AudioAnalysisStepFunctionsConstruct(this, 'AudioAnalysisStepFunctions', {
      resourceNamePrefix: props.resourceNamePrefix,
      audioAnalysisLambda: this.audioAnalysisLambda
    });

    // 音声分析API関数にStep Functions ARNを設定
    this.audioAnalysisLambda.apiFunction.addEnvironment(
      'AUDIO_ANALYSIS_STATE_MACHINE_ARN', 
      this.audioAnalysisStepFunctions.stateMachine.stateMachineArn
    );

    // WebSocket API for Transcribe
    this.transcribeWebSocket = new TranscribeWebSocketConstruct(this, 'TranscribeWebSocket', {
      stageName: 'prod',
      envId: props.envId,
      userPool: props.userPool!,
      userPoolClient: props.userPoolClient!
    });
    
    // API Gateway
    this.api = new ApiGatewayConstruct(this, 'ApiGateway', {
      userPool: props.userPool!,
      userPoolClient: props.userPoolClient!,
      bedrockFunction: this.bedrockLambda.function,
      textToSpeechFunction: this.textToSpeechFunction,
      scoringFunction: this.scoringLambdaConstruct.function,
      sessionFunction: this.sessionLambda.function,
      scenarioFunction: this.scenarioLambda.function,
      rankingFunction: this.rankingsLambdaConstruct.function, // 新しいランキングLambdaを使用
      videosFunction: this.videosLambda.function, // 動画管理Lambda関数を追加
      guardrailsFunction: this.guardrailsLambda.function, // 新しいガードレールLambdaを使用
      referenceCheckFunction: this.referenceCheckLambda.function,
      audioAnalysisFunction: this.audioAnalysisLambda.apiFunction, // 音声分析API関数を追加
    });

    // スコアリングAPIエンドポイントを設定
    const apiEndpoint = `https://${this.api.api.restApiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/api`;


    // BedrockLambdaに各テーブル名を環境変数として設定
    this.bedrockLambda.function.addEnvironment('SCENARIOS_TABLE', this.databaseTables.scenariosTable.tableName);
    this.bedrockLambda.function.addEnvironment('SESSIONS_TABLE', this.databaseTables.sessionsTable.tableName);
    this.bedrockLambda.function.addEnvironment('MESSAGES_TABLE', this.databaseTables.messagesTable.tableName);
    this.bedrockLambda.function.addEnvironment('SESSION_FEEDBACK_TABLE', this.databaseTables.sessionFeedbackTable.tableName);

    // BedrockLambdaにDynamoDBテーブルへのアクセス権限を付与
    this.databaseTables.scenariosTable.grantReadWriteData(this.bedrockLambda.function);
    this.databaseTables.sessionsTable.grantReadWriteData(this.bedrockLambda.function);
    this.databaseTables.messagesTable.grantReadWriteData(this.bedrockLambda.function);
    this.databaseTables.sessionFeedbackTable.grantReadWriteData(this.bedrockLambda.function);


    new cdk.CfnOutput(this, "WebSocketEndpoint", {
      value: this.transcribeWebSocket.webSocketApiEndpoint
    })
  }
}
