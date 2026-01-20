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
 * 音声分析Lambda関数のConstructプロパティ
 */
export interface AudioAnalysisLambdaConstructProps {
  /**
   * DynamoDBのフィードバックテーブル
   */
  sessionFeedbackTable: dynamodb.Table;

  /**
   * DynamoDBのシナリオテーブル
   */
  scenariosTable: dynamodb.Table;

  /**
   * 音声ファイル保存用S3バケット
   */
  audioBucket: s3.Bucket;

  /**
   * knowledgeBaseId ID
   */
  knowledgeBaseId: string;

  /**
   * Bedrockモデル設定
   */
  bedrockModels: {
    /** 音声分析用モデル */
    analysis: string;
  };
}

/**
 * 音声分析Lambda関数のConstruct
 */
export class AudioAnalysisLambdaConstruct extends Construct {
  /**
   * 音声分析開始Lambda関数
   */
  public readonly startAnalysisFunction: PythonFunction;

  /**
   * Transcribe開始Lambda関数
   */
  public readonly startTranscribeFunction: PythonFunction;

  /**
   * Transcribe状況確認Lambda関数
   */
  public readonly checkTranscribeFunction: PythonFunction;

  /**
   * AI分析処理Lambda関数
   */
  public readonly processAnalysisFunction: PythonFunction;

  /**
   * 結果保存Lambda関数
   */
  public readonly saveResultsFunction: PythonFunction;

  /**
   * 音声分析API用Lambda関数（API Gateway統合用）
   */
  public readonly apiFunction: PythonFunction;

  constructor(scope: Construct, id: string, props: AudioAnalysisLambdaConstructProps) {
    super(scope, id);

    // 共通環境変数
    const commonEnvironment = {
      SESSION_FEEDBACK_TABLE: props.sessionFeedbackTable.tableName,
      SCENARIOS_TABLE: props.scenariosTable.tableName,
      AUDIO_STORAGE_BUCKET: props.audioBucket.bucketName,
      KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
      BEDROCK_MODEL_ANALYSIS: props.bedrockModels.analysis,
      POWERTOOLS_LOG_LEVEL: "DEBUG",
      AWS_MAX_ATTEMPTS: "10",
    };

    // 1. 音声分析開始Lambda関数
    this.startAnalysisFunction = this.createFunction('StartAnalysis', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'start_handler.py',
      description: '音声分析開始・音声ファイル検証',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnvironment,
    });

    // 2. Transcribe開始Lambda関数
    this.startTranscribeFunction = this.createFunction('StartTranscribe', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'transcribe_handler.py',
      description: 'Amazon Transcribe転写ジョブ開始',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnvironment,
    });

    // 3. Transcribe状況確認Lambda関数
    this.checkTranscribeFunction = this.createFunction('CheckTranscribe', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'check_handler.py',
      description: 'Transcribe転写ジョブ状況確認',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: commonEnvironment,
    });

    // 4. AI分析処理Lambda関数
    this.processAnalysisFunction = this.createFunction('ProcessAnalysis', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'process_handler.py',
      description: '音声転写結果のAI分析処理',
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: commonEnvironment,
    });

    // 5. 結果保存Lambda関数（フィードバック生成を含むため、タイムアウトとメモリを増加）
    this.saveResultsFunction = this.createFunction('SaveResults', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'save_handler.py',
      description: '音声分析結果の保存・フィードバック生成・状態更新',
      timeout: cdk.Duration.minutes(5), // フィードバック生成のため5分に延長
      memorySize: 1024, // フィードバック生成のため1024MBに増加
      environment: {
        ...commonEnvironment,
        BEDROCK_MODEL_FEEDBACK: props.bedrockModels.analysis, // フィードバック生成用モデル
      },
    });

    // 6. 音声分析API用Lambda関数（API Gateway統合用）
    this.apiFunction = this.createFunction('API', {
      entry: path.join(__dirname, '../../../lambda/audioAnalysis'),
      handler: 'lambda_handler',
      indexFile: 'index.py',
      description: '音声分析API（署名付きURL生成、状況確認、結果取得）',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: commonEnvironment,
    });

    // IAM権限を設定
    this.setupIamPermissions(props);
  }

  private createFunction(suffix: string, options: {
    entry: string;
    handler: string;
    indexFile: string;
    description: string;
    timeout: cdk.Duration;
    memorySize: number;
    environment: Record<string, string>;
  }): PythonFunction {
    const lambdaExecutionRole = new iam.Role(this, `${suffix}ExecutionRole`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for Audio Analysis ${suffix} Lambda function`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    return new PythonFunction(this, `${suffix}Function`, {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: options.entry,
      index: options.indexFile,
      handler: options.handler,
      role: lambdaExecutionRole,
      description: options.description,
      timeout: options.timeout,
      memorySize: options.memorySize,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: options.environment,
    });
  }

  private setupIamPermissions(props: AudioAnalysisLambdaConstructProps) {
    const functions = [
      this.startAnalysisFunction,
      this.startTranscribeFunction,
      this.checkTranscribeFunction,
      this.processAnalysisFunction,
      this.saveResultsFunction,
      this.apiFunction,
    ];

    // 全ての関数に共通の権限を付与
    functions.forEach(func => {
      // DynamoDB権限
      props.sessionFeedbackTable.grantReadWriteData(func);
      props.scenariosTable.grantReadData(func);

      // S3権限（音声ファイル用）
      props.audioBucket.grantRead(func);

      // S3署名付きURL生成権限（API関数のみ）
      if (func === this.apiFunction) {
        props.audioBucket.grantWrite(func);
      }
    });

    // Transcribe関連権限
    const transcribeFunctions = [
      this.startTranscribeFunction,
      this.checkTranscribeFunction,
      this.processAnalysisFunction,
    ];

    transcribeFunctions.forEach(func => {
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'transcribe:StartTranscriptionJob',
          'transcribe:GetTranscriptionJob',
          'transcribe:DeleteTranscriptionJob',
        ],
        resources: ['*'],
      }));

      // Transcribe結果保存用のS3書き込み権限
      props.audioBucket.grantWrite(func);
    });

    // Bedrock権限（AI分析処理とフィードバック生成用）
    const bedrockFunctions = [
      this.processAnalysisFunction,
      this.saveResultsFunction, // フィードバック生成用
    ];

    bedrockFunctions.forEach(func => {
      func.addToRolePolicy(new iam.PolicyStatement({
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
    });

    // Knowledge Base権限
    this.processAnalysisFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:Retrieve',
        'bedrock:RetrieveAndGenerate',
      ],
      resources: [`arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}`],
    }));

    // STS権限（アカウントID取得用）
    this.processAnalysisFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:GetCallerIdentity'],
      resources: ['*'],
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
