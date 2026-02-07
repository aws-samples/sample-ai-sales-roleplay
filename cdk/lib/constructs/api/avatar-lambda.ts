import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * アバター管理Lambda関数のConstructプロパティ
 */
export interface AvatarLambdaConstructProps {
  /** アバターVRMファイル用S3バケット */
  avatarBucket: s3.Bucket;
  /** アバターメタデータ用DynamoDBテーブル */
  avatarTable: dynamodb.Table;
}

/**
 * アバター管理Lambda関数のConstruct
 * CRUD操作 + 署名付きURL生成
 */
export class AvatarLambdaConstruct extends Construct {
  /** Lambda関数 */
  public readonly function: PythonFunction;

  constructor(scope: Construct, id: string, props: AvatarLambdaConstructProps) {
    super(scope, id);

    // Lambda実行ロール
    const lambdaExecutionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Avatar API Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Python Lambda関数
    this.function = new PythonFunction(this, 'Function', {
      runtime: lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambda/avatars'),
      index: 'index.py',
      handler: 'lambda_handler',
      role: lambdaExecutionRole,
      description: 'Avatar CRUD API Lambda function',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        AVATAR_BUCKET: props.avatarBucket.bucketName,
        AVATAR_TABLE: props.avatarTable.tableName,
        MAX_AVATAR_SIZE_MB: '50',
        DEFAULT_PRESIGNED_URL_EXPIRY: '600',
        POWERTOOLS_LOG_LEVEL: 'DEBUG',
      },
    });

    // S3バケットへのアクセス許可
    props.avatarBucket.grantReadWrite(this.function);

    // DynamoDBテーブルへのアクセス許可
    props.avatarTable.grantReadWriteData(this.function);
  }
}
