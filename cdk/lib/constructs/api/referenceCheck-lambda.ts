import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';


export interface BedrockModelsConfig {
  /** 会話生成用モデル */
  conversation: string;
  /** リアルタイムスコアリング用モデル */
  scoring: string;
  /** フィードバック生成用モデル */
  feedback: string;
  /** Guardrail評価用モデル */
  guardrail: string;
  /** video評価用モデル */
  video: string;
  /** referenceCheck用モデル */
  referenceCheck: string;
}

/**
 * リファレンスチェック管理Lambda関数のConstructプロパティ
 */
export interface ReferenceCheckLambdaConstructProps {
  /**
   * DynamoDBのフィードバックテーブル名
   */
  feedbackTable: dynamodb.ITable;

  /** DynamoDBのセッションテーブル */
  sessionTable: dynamodb.ITable;

  /** DynamoDBのメッセージテーブル */
  messagesTable: dynamodb.ITable;

  /** DynamoDBのシナリオテーブル */
  scenariosTable: dynamodb.ITable

  /** Bedrockモデル設定 */
  bedrockModels: BedrockModelsConfig;

  /**
   * knowledgeBaseId ID
   */
  knowledgeBaseId: string
}

/**
 * リファレンスチェック管理Lambda関数のConstruct
 */
export class ReferenceCheckLambdaConstruct extends Construct {
  /**
   * Lambda関数
   */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: ReferenceCheckLambdaConstructProps) {
    super(scope, id);

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Reference Check API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Python Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/referenceCheck'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Python Lambda function for reference check API with Bedrock',
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        SESSION_FEEDBACK_TABLE: props.feedbackTable.tableName,
        SESSION_TABLE: props.sessionTable.tableName,
        MESSAGES_TABLE: props.messagesTable.tableName,
        SCENARIO_TABLE: props.scenariosTable.tableName,
        // Knowledge Base ID
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        BEDROCK_MODEL_REFERENCE_CHECK: props.bedrockModels.referenceCheck,
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        STRANDS_KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        AWS_MAX_ATTEMPTS: "10",
      },
    });

    props.feedbackTable.grantReadWriteData(this.function)
    props.sessionTable.grantReadData(this.function)
    props.messagesTable.grantReadData(this.function)
    props.scenariosTable.grantReadData(this.function)

    // Amazon Bedrock（リファレンスチェック用）へのアクセス許可
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:Retrieve',
          'bedrock:RetrieveAndGenerate',
          'bedrock:GetInferenceProfile',
          'bedrock:ListInferenceProfiles',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}`,
          `arn:aws:bedrock:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}/*`
        ]
      })
    );
    // Knowledge Baseのリランク用のアクセス許可
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:Rerank'
        ],
        resources: [
          "*"
        ]
      })
    );

    // STS（アカウントID取得用）へのアクセス許可
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:GetCallerIdentity',
        ],
        resources: ['*']
      })
    );
  }
}