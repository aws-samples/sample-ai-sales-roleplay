import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import * as fs from 'fs';

/**
 * スコアリングAPIと連携するLambda関数を作成するConstruct
 */
/** スコアリングLambdaConstructのプロパティ */
export interface ScoringLambdaConstructProps {
  /** スコアリングに使用するBedrockモデルID */
  scoringModelId: string;
  /** Guardrail評価に使用するBedrockモデルID */
  guardrailModelId: string;
  /** 環境ごとのPrefix */
  environmentPrefix: string;
  /** シナリオ用テーブル */
  scenariosTable: dynamodb.ITable
  /** セッションフィードバックテーブル */
  sessionFeedbackTable: dynamodb.ITable
}

export class ScoringLambdaConstruct extends Construct {
  /** Lambda関数 */
  public readonly function: PythonFunction;
  /** Guardrail ID -> ARN マッピング */
  public readonly guardrailArns: Record<string, string>;
  /** Guardrail ID -> バージョン マッピング */
  public readonly guardrailVersions: Record<string, string>;

  constructor(scope: Construct, id: string, props: ScoringLambdaConstructProps) {
    super(scope, id);

    // Guardrailマッピングを初期化
    this.guardrailArns = {};
    this.guardrailVersions = {};

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Scoring API Lambda function',
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
          'bedrock:ApplyGuardrail'
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          'arn:aws:bedrock:*:*:inference-profile/*',
          'arn:aws:bedrock:*:*:guardrail/*',
          'arn:aws:bedrock:*:*:guardrail-profile/*'
        ],
      })
    );

    // Parameter Storeへのアクセス権限を追加（Guardrail情報取得のため）
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/aisalesroleplay/guardrails/*`
        ],
      })
    );

    // DynamoDBへのアクセス権限を追加
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:Query'
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/conversation-metrics`,
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/conversation-metrics/index/*`
        ],
      })
    );

    // Guardrailsデータを読み込む
    const guardrailsFilePath = path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'data', 'guardrails.json');
    const guardrailsData = JSON.parse(fs.readFileSync(guardrailsFilePath, 'utf8'));

    // Guardrailごとの環境変数を準備
    const guardrailsEnvVars: Record<string, string> = {};

    // Guardrail設定のために一時的なARNを設定（実際のARNはGuardrailsConstructで設定される）
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;

    // 各GuardrailのARN変数をセット
    guardrailsData.guardrails.forEach((guardrail: any) => {
      const name = guardrail.name;

      // 一時的なARN（実際のARNはGuardrailsConstructから取得される）
      this.guardrailArns[name] = `arn:aws:bedrock:${region}:${account}:guardrail/${name}`;
      this.guardrailVersions[name] = '1';

      // 環境変数に設定（ハイフンをアンダースコアに置換してLambda環境変数の命名規則に準拠）
      const normalizedName = name.replace(/-/g, '_').toUpperCase();
      guardrailsEnvVars[`GUARDRAIL_${normalizedName}_ARN`] = this.guardrailArns[name];
      guardrailsEnvVars[`GUARDRAIL_${normalizedName}_VERSION`] = this.guardrailVersions[name];
    });

    // Python Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/scoring'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Python Lambda function for scoring API with Bedrock',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        // ログレベル
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        AWS_MAX_ATTEMPTS: "10",
        // 各用途別モデル設定
        BEDROCK_MODEL_SCORING: props.scoringModelId,
        BEDROCK_MODEL_GUARDRAIL: props.guardrailModelId,
        ENVIRONMENT_PREFIX: props.environmentPrefix,
        SESSION_FEEDBACK_TABLE: props.sessionFeedbackTable.tableName,
        SCENARIOS_TABLE_NAME: props.scenariosTable.tableName,
        // Guardrail関連の環境変数を追加
        ...guardrailsEnvVars
      },
    });

    props.sessionFeedbackTable.grantReadWriteData(this.function)
    props.scenariosTable.grantReadData(this.function)
  }
}
