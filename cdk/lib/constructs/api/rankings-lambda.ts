import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * ランキングAPI用のLambda関数を作成するConstructのプロパティ
 */
export interface RankingsLambdaConstructProps {
  /** セッションフィードバックテーブル */
  sessionFeedbackTable: dynamodb.Table;

  /** セッションテーブル */
  sessionsTable: dynamodb.Table;

  /** CognitoユーザープールID */
  userPoolId: string;
}

/**
 * ランキングAPI用のLambda関数を作成するConstruct
 */
export class RankingsLambdaConstruct extends Construct {
  /** Lambda関数 */
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: RankingsLambdaConstructProps) {
    super(scope, id);

    const { sessionFeedbackTable, sessionsTable, userPoolId } = props;

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Rankings API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // DynamoDBへのアクセス権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Scan',
          'dynamodb:Query',
          'dynamodb:GetItem',
        ],
        resources: [
          sessionFeedbackTable.tableArn,
          `${sessionFeedbackTable.tableArn}/index/*`,
          sessionsTable.tableArn,
          `${sessionsTable.tableArn}/index/*`
        ],
      })
    );

    // Cognitoへのアクセス権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminGetUser',
          'cognito-idp:GetUser'
        ],
        resources: [
          `arn:aws:cognito-idp:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:userpool/*`
        ],
      })
    );

    // Python Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/rankings'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Python Lambda function for Rankings API',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        SESSION_FEEDBACK_TABLE: sessionFeedbackTable.tableName,
        SESSIONS_TABLE: sessionsTable.tableName,
        USER_POOL_ID: userPoolId,
        POWERTOOLS_SERVICE_NAME: 'rankings-api',
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
      },
    });
  }
}
