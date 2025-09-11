import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

/**
 * Guardrails APIと連携するLambda関数を作成するConstruct
 */
export class GuardrailsLambdaConstruct extends Construct {
  /** Lambda関数 */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Guardrails API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Bedrockへのアクセス権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:ListGuardrails',
          'bedrock:ListTagsForResource',
          'bedrock:ListGuardrailVersions',
          'bedrock:GetGuardrail',
        ],
        resources: ['*'], // 特定のリソースに制限することが望ましい
      })
    );

    // Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/guardrails'),
      index: 'index.py',  // Lambda関数のエントリポイント
      handler: 'lambda_handler',  // ハンドラー関数名
      role: lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,  // CloudWatchログの保持期間
      environment: {
        // 環境変数の設定
        ENVIRONMENT_PREFIX: cdk.Stack.of(this).stackName.includes('Prod') ? 'prod' :
          cdk.Stack.of(this).stackName.includes('Staging') ? 'staging' : 'dev',
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        AWS_MAX_ATTEMPTS: "10",
      },
    });
  }
}