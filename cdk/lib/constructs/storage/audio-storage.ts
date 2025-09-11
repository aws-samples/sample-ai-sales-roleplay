import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * 音声ファイル用ストレージを作成するConstruct
 */
export interface AudioStorageConstructProps {
  resourceNamePrefix?: string;
}

export class AudioStorageConstruct extends Construct {
  /** S3バケット */
  public readonly bucket: s3.Bucket;
  /** アクセスログ用S3バケット */
  public readonly accessLogsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AudioStorageConstructProps = {}) {
    super(scope, id);
    
    // アクセスログ用S3バケット
    this.accessLogsBucket = new s3.Bucket(this, 'AudioStorageAccessLogsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    
    // 音声ファイル用S3バケット
    this.bucket = new s3.Bucket(this, 'AudioStorageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // パブリックアクセスを禁止
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境のため、削除可能に設定
      autoDeleteObjects: true, // スタック削除時にオブジェクトも削除
      enforceSSL: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST],
          allowedOrigins: ['*'], // クロスオリジンリクエストを許可（署名付きURLで安全に制御）
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          // 未使用の音声ファイルは30日後に削除
          expiration: cdk.Duration.days(30),
          prefix: 'speech/',
        }
      ],
      // サーバーサイド暗号化を有効化
      encryption: s3.BucketEncryption.S3_MANAGED,
      // アクセスログを有効化
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: 'access-logs/',
    });

    // SSL必須のバケットポリシーを追加
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyInsecureConnections',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false'
          }
        }
      })
    );

    // アクセスログバケットにもSSL必須ポリシーを追加
    this.accessLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyInsecureConnections',
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [this.accessLogsBucket.bucketArn, `${this.accessLogsBucket.bucketArn}/*`],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false'
          }
        }
      })
    );
    
    // 出力の定義
    new cdk.CfnOutput(this, 'AudioStorageBucketName', {
      value: this.bucket.bucketName,
      description: '音声ファイル用S3バケット名',
      exportName: `${props.resourceNamePrefix || ''}AudioStorageBucketName`
    });
  }
}
