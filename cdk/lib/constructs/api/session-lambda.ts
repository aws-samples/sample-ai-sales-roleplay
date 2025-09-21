import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as path from 'path';
import { BedrockModelsConfig } from '../../types/bedrock-models';

/**
 * セッション管理Lambda関数を作成するConstructのプロパティ
 */
export interface SessionLambdaConstructProps {
  /**
   * シナリオテーブル名
   */
  scenariosTableName: string;

  /**
   * セッションテーブル名
   */
  sessionsTableName: string;

  /**
   * メッセージテーブル名
   */
  messagesTableName: string;

  /**
   * ビデオファイル保存用S3バケット名
   */
  videoBucketName?: string;

  /**
   * セッションフィードバックテーブル名
   */
  sessionFeedbackTableName?: string;

  /** Bedrockモデル設定 */
  bedrockModels: BedrockModelsConfig;

  /**
   * knowledgeBaseId ID
   */
  knowledgeBaseId: string
}

/**
 * セッション管理Lambda関数を作成するConstruct
 */
export class SessionLambdaConstruct extends Construct {
  /**
   * セッション管理Lambda関数
   */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: SessionLambdaConstructProps) {
    super(scope, id);

    // セッション管理Lambda関数の作成
    // PythonFunctionを使用して依存関係を自動的にインストール
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/sessions'),
      index: 'index.py',
      handler: 'lambda_handler',
      timeout: cdk.Duration.minutes(15), // ビデオ分析処理時間を考慮（Bedrock APIの応答時間含む）
      memorySize: 1024, // Base64エンコード処理とBedrock API呼び出しのため（512MBから増加）
      reservedConcurrentExecutions: 10, // Bedrock APIの制限を考慮した同時実行数制限（過負荷防止）
      environment: {
        SCENARIOS_TABLE: props.scenariosTableName,
        SESSIONS_TABLE: props.sessionsTableName,
        MESSAGES_TABLE: props.messagesTableName,
        // ログレベル
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        // フィードバック生成用モデル
        BEDROCK_MODEL_FEEDBACK: props.bedrockModels.feedback,
        // リアルタイムスコアリング用モデル
        BEDROCK_MODEL_SCORING: props.bedrockModels.scoring,
        // 発言内容検証用モデル
        BEDROCK_MODEL_GUARDRAIL: props.bedrockModels.guardrail,
        // ビデオ分析用モデル（デフォルト値を設定）
        VIDEO_ANALYSIS_MODEL_ID: props.bedrockModels.video,
        // ビデオファイル保存用S3バケット（必須）
        VIDEO_BUCKET: props.videoBucketName || '',
        // Knowledge Base ID
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        AWS_MAX_ATTEMPTS: "10",
        // セッションフィードバックテーブル
        ...(props.sessionFeedbackTableName && { SESSION_FEEDBACK_TABLE: props.sessionFeedbackTableName })
      },
      description: 'セッション履歴管理API実装Lambda関数',
    });

    // Lambda関数にDynamoDBテーブルへのアクセス権限を付与
    const dynamodbResources = [
      `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.scenariosTableName}`,
      `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.sessionsTableName}`,
      `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.messagesTableName}`,
    ];

    // SessionFeedbackテーブルがある場合は追加
    if (props.sessionFeedbackTableName) {
      dynamodbResources.push(
        `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.sessionFeedbackTableName}`
      );
    }

    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:PutItem', // ビデオ分析結果保存のため
          'dynamodb:UpdateItem', // ビデオ分析結果更新・Knowledge Base評価結果保存のため
        ],
        resources: dynamodbResources,
      })
    );

    // インデックスへのアクセス権限も付与
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.scenariosTableName}/index/CategoryIndex`,
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.sessionsTableName}/index/CreatedAtIndex`,
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.sessionsTableName}/index/ScenarioSessionsIndex`,
        ],
      })
    );

    // S3バケットへのアクセス権限を付与（ビデオファイル検索用）
    if (props.videoBucketName) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:ListBucket',
            's3:GetObject',
            's3:GetBucketLocation',
            's3:HeadObject', // ファイル情報取得用
          ],
          resources: [
            `arn:aws:s3:::${props.videoBucketName}`,
            `arn:aws:s3:::${props.videoBucketName}/*`,
          ],
        })
      );
    }

    // Bedrockアクセス権限を付与（フィードバック生成用）
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:Retrieve',
        ],
        resources: [
          // Nova モデルのinference-profile形式
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
          // 従来のfoundation-model形式も含める（互換性のため）
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}`
        ],
      })
    );

    // STSアクセス権限を付与（アカウントID取得用）
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'sts:GetCallerIdentity',
        ],
        resources: ['*'],
      })
    );

    // Lambda自己呼び出し権限を付与（Knowledge Base評価の非同期処理用）
    // 循環依存を避けるため、スタック内のLambda関数パターンで権限を付与
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'lambda:InvokeFunction',
        ],
        resources: [
          `arn:aws:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:*SessionLambdaFunction*`,
        ],
      })
    );
  }
}
