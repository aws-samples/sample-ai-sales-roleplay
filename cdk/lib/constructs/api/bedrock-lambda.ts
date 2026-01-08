import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { BedrockModelsConfig } from '../../types/bedrock-models';

/**
 * BedrockLambdaConstructのプロパティ
 */

export interface BedrockLambdaConstructProps {
  /** セッションテーブル名 */
  sessionsTableName: string;
  /** メッセージテーブル名 */
  messagesTableName: string;
  /** Bedrockモデル設定 */
  bedrockModels: BedrockModelsConfig;
}

/**
 * Amazon Bedrockと連携するLambda関数を作成するためのConstruct
 */
export class BedrockLambdaConstruct extends Construct {
  /** Lambda関数 */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: BedrockLambdaConstructProps) {
    super(scope, id);

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Bedrock Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Bedrockへのアクセス権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream'
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          'arn:aws:bedrock:*:*:inference-profile/*'
        ],
      })
    );

    // Python Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/bedrock'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Python Lambda function for integrating with Amazon Bedrock',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
        MESSAGE_TTL_DAYS: '180', // メッセージのTTL（日数）
        AWS_MAX_ATTEMPTS: "10",
        ...(props.sessionsTableName ? { SESSIONS_TABLE: props.sessionsTableName } : {}),
        ...(props.messagesTableName ? { MESSAGES_TABLE: props.messagesTableName } : {}),
        // 各用途別モデルIDを設定
        BEDROCK_MODEL_CONVERSATION: props.bedrockModels.conversation,
        BEDROCK_MODEL_SCORING: props.bedrockModels.scoring,
        BEDROCK_MODEL_FEEDBACK: props.bedrockModels.feedback,
        BEDROCK_MODEL_GUARDRAIL: props.bedrockModels.guardrail
      },
    });
  }
}
