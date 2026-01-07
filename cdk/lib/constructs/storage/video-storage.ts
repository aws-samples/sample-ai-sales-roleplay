import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * セッション録画用ストレージを作成するConstruct
 */
export interface VideoStorageConstructProps {
  resourceNamePrefix?: string;
}

export class VideoStorageConstruct extends Construct {
  /** S3バケット */
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: VideoStorageConstructProps = {}) {
    super(scope, id);

    // 動画ファイル用S3バケット
    this.bucket = new s3.Bucket(this, 'VideoStorageBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // パブリックアクセスを禁止
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 開発環境のため、削除可能に設定
      autoDeleteObjects: true, // スタック削除時にオブジェクトも削除
      enforceSSL: true,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
          allowedOrigins: ['*'], // クロスオリジンリクエストを許可（署名付きURLで安全に制御）
          exposedHeaders: ['ETag', 'x-amz-meta-custom-header'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          // 未使用の動画ファイルは14日後に削除（録画データは容量が大きいため短めの期間設定）
          expiration: cdk.Duration.days(14),
          prefix: 'videos/',
        }
      ],
      // サーバーサイド暗号化を有効化
      encryption: s3.BucketEncryption.S3_MANAGED,
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

    // 出力の定義
    new cdk.CfnOutput(this, 'VideoStorageBucketName', {
      value: this.bucket.bucketName,
      description: '録画動画ファイル用S3バケット名',
      exportName: `${props.resourceNamePrefix || ''}VideoStorageBucketName`
    });
  }
}
