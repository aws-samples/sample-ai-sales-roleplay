import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as path from 'path';

/**
 * セッション分析Lambda関数のConstructプロパティ
 */
export interface SessionAnalysisLambdaConstructProps {
  /** セッションフィードバックテーブル */
  sessionFeedbackTable: dynamodb.Table;
  /** セッションテーブル */
  sessionsTable: dynamodb.Table;
  /** メッセージテーブル */
  messagesTable: dynamodb.Table;
  /** シナリオテーブル */
  scenariosTable: dynamodb.Table;
  /** 動画保存用S3バケット */
  videoBucket: s3.Bucket;
  /** Knowledge Base ID */
  knowledgeBaseId: string;
  /** Bedrockモデル設定 */
  bedrockModels: {
    feedback: string;
    video: string;
    reference: string;
  };
  /** AgentCore Memory ID */
  agentCoreMemoryId?: string;
}

/**
 * セッション分析Lambda関数のConstruct
 */
export class SessionAnalysisLambdaConstruct extends Construct {
  /** 分析開始Lambda関数 */
  public readonly startFunction: PythonFunction;
  /** フィードバック生成Lambda関数 */
  public readonly feedbackFunction: PythonFunction;
  /** 動画分析Lambda関数 */
  public readonly videoFunction: PythonFunction;
  /** 参照資料評価Lambda関数 */
  public readonly referenceFunction: PythonFunction;
  /** 結果保存Lambda関数 */
  public readonly saveFunction: PythonFunction;
  /** API用Lambda関数 */
  public readonly apiFunction: PythonFunction;

  constructor(scope: Construct, id: string, props: SessionAnalysisLambdaConstructProps) {
    super(scope, id);

    // 共通環境変数
    // Cross-region inference profileを使用するため、MODEL_REGIONは不要
    const commonEnvironment = {
      SESSION_FEEDBACK_TABLE: props.sessionFeedbackTable.tableName,
      SESSIONS_TABLE: props.sessionsTable.tableName,
      MESSAGES_TABLE: props.messagesTable.tableName,
      SCENARIOS_TABLE: props.scenariosTable.tableName,
      VIDEO_BUCKET: props.videoBucket.bucketName,
      KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
      BEDROCK_MODEL_FEEDBACK: props.bedrockModels.feedback,
      VIDEO_ANALYSIS_MODEL_ID: props.bedrockModels.video,
      BEDROCK_MODEL_REFERENCE: props.bedrockModels.reference,
      POWERTOOLS_LOG_LEVEL: 'DEBUG',
      AWS_MAX_ATTEMPTS: '10',
      AGENTCORE_MEMORY_ID: props.agentCoreMemoryId || '',
    };

    // 1. 分析開始Lambda関数
    this.startFunction = this.createFunction('Start', {
      indexFile: 'start_handler.py',
      description: 'セッション分析開始・データ収集',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // 2. フィードバック生成Lambda関数
    this.feedbackFunction = this.createFunction('Feedback', {
      indexFile: 'feedback_handler.py',
      description: 'Bedrockによるフィードバック生成',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: commonEnvironment,
    });

    // 3. 動画分析Lambda関数
    this.videoFunction = this.createFunction('Video', {
      indexFile: 'video_handler.py',
      description: 'Nova Premiereによる動画分析',
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      environment: commonEnvironment,
    });

    // 4. 参照資料評価Lambda関数
    this.referenceFunction = this.createFunction('Reference', {
      indexFile: 'reference_handler.py',
      description: 'Knowledge Baseによる参照資料評価',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: commonEnvironment,
    });

    // 5. 結果保存Lambda関数
    this.saveFunction = this.createFunction('Save', {
      indexFile: 'save_handler.py',
      description: '分析結果の統合・保存',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // 6. API用Lambda関数
    this.apiFunction = this.createFunction('API', {
      indexFile: 'index.py',
      description: 'セッション分析API（開始・ステータス確認）',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // IAM権限を設定
    this.setupIamPermissions(props);
  }

  private createFunction(suffix: string, options: {
    indexFile: string;
    description: string;
    timeout: cdk.Duration;
    memorySize: number;
    environment: Record<string, string>;
  }): PythonFunction {
    const lambdaExecutionRole = new iam.Role(this, `${suffix}ExecutionRole`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for Session Analysis ${suffix} Lambda function`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    return new PythonFunction(this, `${suffix}Function`, {
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambda/sessionAnalysis'),
      index: options.indexFile,
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: options.description,
      timeout: options.timeout,
      memorySize: options.memorySize,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: options.environment,
    });
  }

  private setupIamPermissions(props: SessionAnalysisLambdaConstructProps) {
    const allFunctions = [
      this.startFunction,
      this.feedbackFunction,
      this.videoFunction,
      this.referenceFunction,
      this.saveFunction,
      this.apiFunction,
    ];

    // 全ての関数にDynamoDB権限を付与
    allFunctions.forEach(func => {
      props.sessionFeedbackTable.grantReadWriteData(func);
      props.sessionsTable.grantReadData(func);
      props.messagesTable.grantReadData(func);
      props.scenariosTable.grantReadData(func);
    });

    // AgentCore Memory権限（start_handlerで会話履歴を取得するため）
    if (props.agentCoreMemoryId) {
      this.startFunction.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock-agentcore:ListEvents',
          'bedrock-agentcore:GetEvent',
        ],
        resources: [
          `arn:aws:bedrock-agentcore:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:memory/${props.agentCoreMemoryId}`,
        ],
      }));
    }

    // S3権限（動画ファイル用）
    [this.startFunction, this.videoFunction].forEach(func => {
      props.videoBucket.grantRead(func);
    });

    // Bedrock権限（フィードバック生成用）
    this.feedbackFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
        'arn:aws:bedrock:*::foundation-model/*',
      ],
    }));

    // Bedrock権限（動画分析用 - Cross-region inference profile対応）
    this.videoFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
        'arn:aws:bedrock:*::foundation-model/*',
      ],
    }));

    // Bedrock権限（参照資料評価用 - InvokeModel）
    this.referenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
        'arn:aws:bedrock:*::foundation-model/*',
      ],
    }));

    // Bedrock Agent Runtime権限（Knowledge Base検索用）
    // bedrock-agent-runtime:Retrieve と bedrock:Retrieve の両方が必要
    this.referenceFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock-agent-runtime:Retrieve',
        'bedrock-agent-runtime:RetrieveAndGenerate',
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}`,
      ],
    }));
  }

  /**
   * Step Functions実行用のIAM権限を設定する
   */
  public grantStepFunctionsInvoke(stateMachine: stepfunctions.StateMachine) {
    // API関数にStep Functions実行権限を付与
    this.apiFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution',
        'states:DescribeExecution',
        'states:StopExecution',
      ],
      resources: [stateMachine.stateMachineArn],
    }));
  }
}
