import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * アバターストレージ用Constructのプロパティ
 */
export interface AvatarStorageConstructProps {
  resourceNamePrefix?: string;
}

/**
 * アバターVRMファイル用S3バケット + メタデータDynamoDBテーブル
 */
export class AvatarStorageConstruct extends Construct {
  /** VRMファイル用S3バケット */
  public readonly bucket: s3.Bucket;
  /** アバターメタデータ用DynamoDBテーブル */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AvatarStorageConstructProps = {}) {
    super(scope, id);

    // VRMファイル用S3バケット
    this.bucket = new s3.Bucket(this, 'AvatarStorageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          // 未使用のアバターファイルは90日後に削除
          expiration: cdk.Duration.days(90),
          prefix: 'temp/',
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // SSL必須のバケットポリシー
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyInsecureConnections',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
        conditions: {
          Bool: { 'aws:SecureTransport': 'false' },
        },
      })
    );

    // アバターメタデータ用DynamoDBテーブル
    this.table = new dynamodb.Table(this, 'AvatarMetadataTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'avatarId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    // 出力
    new cdk.CfnOutput(this, 'AvatarStorageBucketName', {
      value: this.bucket.bucketName,
      description: 'アバターVRMファイル用S3バケット名',
      exportName: `${props.resourceNamePrefix || ''}AvatarStorageBucketName`,
    });

    new cdk.CfnOutput(this, 'AvatarMetadataTableName', {
      value: this.table.tableName,
      description: 'アバターメタデータ用DynamoDBテーブル名',
      exportName: `${props.resourceNamePrefix || ''}AvatarMetadataTableName`,
    });
  }
}
