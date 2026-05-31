import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * 動画管理Lambda関数のConstructプロパティ
 */
export interface VideosLambdaConstructProps {
  /**
   * DynamoDBのフィードバックテーブル名
   */
  feedbackTableName: string;

  /**
   * 動画保存用のS3バケット
   */
  videoBucket: s3.Bucket;

  /**
   * 動画分析モデルID（Amazon Bedrock Nova）
   */
  videoAnalysisModelId?: string;
}

/**
 * 動画管理Lambda関数のConstruct
 */
export class VideosLambdaConstruct extends Construct {
  /**
   * Lambda関数
   */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: VideosLambdaConstructProps) {
    super(scope, id);

    // Lambda実行ロールの作成
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Videos API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Python Lambda関数の作成
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambda/videos'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Python Lambda function for videos API with Bedrock',
      timeout: cdk.Duration.minutes(15), // 動画分析のため15分に延長
      memorySize: 1024, // 動画処理のためメモリを増加
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        SESSION_FEEDBACK_TABLE: props.feedbackTableName,
        VIDEO_BUCKET: props.videoBucket.bucketName,
        MULTIPART_PRESIGNED_URL_EXPIRY: '3600', // 1時間（長時間セッションのマルチパートアップロード用）
        // マルチパートの最大パート数。録画は1.5Mbps映像+音声≈1.6Mbpsで、
        // 10MB/パート換算だと60分≈68パート・2時間≈150パート程度。
        // 余裕を見て500（=10MB×500=5GB相当）に制限し、過大なpartCount要求による
        // 署名付きURL大量生成（Lambdaのブロッキング/DoS）を防ぐ。
        MAX_MULTIPART_PARTS: '500',
        VIDEO_ANALYSIS_MODEL_ID: props.videoAnalysisModelId || 'global.amazon.nova-2-lite-v1:0',
        POWERTOOLS_LOG_LEVEL: "DEBUG",
        AWS_MAX_ATTEMPTS: "10",
      },
    });

    // S3バケットへのアクセス許可
    // grantReadWriteには PutObject / GetObject / DeleteObject / AbortMultipartUpload /
    // ListBucketMultipartUploads / ListMultipartUploadParts が含まれ、
    // マルチパートアップロードに必要な権限を満たす
    props.videoBucket.grantReadWrite(this.function);

    // DynamoDBテーブルへのアクセス許可
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [
          `arn:aws:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.feedbackTableName}`
        ]
      })
    );

    // Amazon Bedrock（動画分析用）へのアクセス許可
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
        ],
        resources: [
          // Nova モデルのinference-profile形式
          `arn:aws:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
          `arn:aws:bedrock:*::foundation-model/*`,
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