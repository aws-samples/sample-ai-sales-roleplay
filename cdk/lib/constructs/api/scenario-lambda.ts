import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as path from 'path';

/**
 * シナリオ管理Lambda関数を作成するConstructのプロパティ
 */
export interface ScenarioLambdaConstructProps {
  /**
   * シナリオテーブル名
   */
  scenariosTable: dynamodb.ITable;

  /**
   * PDF保存用S3バケット名
   */
  pdfBucket: s3.IBucket;

  /**
   * knowledgeBaseId ID
   */
  knowledgeBaseId: string
}

/**
 * シナリオ管理Lambda関数を作成するConstruct
 */
export class ScenarioLambdaConstruct extends Construct {
  /**
   * シナリオ管理Lambda関数
   */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: ScenarioLambdaConstructProps) {
    super(scope, id);

    // シナリオ管理Lambda関数の作成
    // PythonFunctionを使用して依存関係を自動的にインストール
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      entry: path.join(__dirname, '../../../lambda/scenarios'),
      index: 'index.py',
      handler: 'lambda_handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        SCENARIOS_TABLE: props.scenariosTable.tableName,
        // PDF保存用S3バケット名
        PDF_BUCKET: props.pdfBucket.bucketName,
        // ログレベル
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        // Knowledge Base ID
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
      },
      description: 'シナリオ管理API実装Lambda関数',
    });

    props.scenariosTable.grantReadWriteData(this.function)
    props.pdfBucket.grantReadWrite(this.function)

    // Bedrockアクセス権限を付与（フィードバック生成用）
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:StopIngestionJob",
          "bedrock:StartIngestionJob",
          "bedrock:GetIngestionJob",
          "bedrock:ListIngestionJobs",
          "bedrock:ListDataSources",
          "bedrock:GetDataSource"
        ],
        resources: [
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}`,
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:knowledge-base/${props.knowledgeBaseId}/*`,
        ],
      })
    );
  }
}