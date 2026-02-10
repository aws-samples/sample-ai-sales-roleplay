import { Stack, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';
import { CfnDistribution, Distribution, ViewerProtocolPolicy, CachePolicy, AllowedMethods, ResponseHeadersPolicy, HeadersFrameOption, HeadersReferrerPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsBuild } from 'deploy-time-build';
import * as s3 from 'aws-cdk-lib/aws-s3';

export interface WebProps {
  apiEndpointUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  idPoolId: string;
  selfSignUpEnabled: boolean;
  webAclId?: string;
  resourceNamePrefix?: string; // リソース名のプレフィックス
  transcribeWebSocketEndpoint: string; // Transcribe WebSocketエンドポイント
  avatarBucket?: s3.IBucket; // アバターVRMファイル用S3バケット
  // AgentCore Runtime設定
  agentCoreEnabled?: boolean;
  npcConversationAgentArn?: string;
  realtimeScoringAgentArn?: string;
}

export class Web extends Construct {
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    const commonBucketProps: s3.BucketProps = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      enforceSSL: true,
      versioned: false,
    };

    const { cloudFrontWebDistribution, s3BucketInterface } = new CloudFrontToS3(
      this,
      'Web',
      {
        insertHttpSecurityHeaders: false,
        loggingBucketProps: commonBucketProps,
        bucketProps: commonBucketProps,
        cloudFrontLoggingBucketProps: commonBucketProps,
        cloudFrontDistributionProps: {
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: '/index.html',
            },
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: '/index.html',
            },
          ],
        },
      }
    );

    if (props.webAclId) {
      const existingCloudFrontWebDistribution = cloudFrontWebDistribution.node
        .defaultChild as CfnDistribution;
      existingCloudFrontWebDistribution.addPropertyOverride(
        'DistributionConfig.WebACLId',
        props.webAclId
      );
    }

    // アバターS3バケットをCloudFrontの追加オリジンとして設定
    // 注意: アバター置き換え時は毎回新しいavatarIdが生成されるため、
    // 同一S3キーへの上書きは発生しない設計。CACHING_OPTIMIZEDで問題なし。
    // 将来的にavatarIdの再利用が必要になった場合は、キャッシュ無効化戦略の導入を検討すること。
    if (props.avatarBucket) {
      const avatarOrigin = S3BucketOrigin.withOriginAccessControl(props.avatarBucket);

      // WR-004: アバターオリジンにレスポンスヘッダーポリシーを設定（XSS防止）
      const avatarResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'AvatarResponseHeadersPolicy', {
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
          referrerPolicy: { referrerPolicy: HeadersReferrerPolicy.SAME_ORIGIN, override: true },
        },
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Content-Disposition', value: 'attachment', override: true },
          ],
        },
      });

      cloudFrontWebDistribution.addBehavior('/avatars/*', avatarOrigin, {
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        responseHeadersPolicy: avatarResponseHeadersPolicy,
      });
    }

    new NodejsBuild(this, 'BuildWeb', {
      assets: [
        {
          path: '../frontend',
          exclude: [
            'node_modules',
            'dist',
            '.git',
            '.gitignore',
            '*.md',
            'README.md',
          ],
        },
      ],
      destinationBucket: s3BucketInterface,
      distribution: cloudFrontWebDistribution,
      outputSourceDirectory: './dist',
      buildCommands: ['npm install', 'npm run build'],
      nodejsVersion: 22,
      buildEnvironment: {
        VITE_API_GATEWAY_ENDPOINT: props.apiEndpointUrl,
        VITE_API_REGION: Stack.of(this).region,
        VITE_AWS_REGION: Stack.of(this).region,
        VITE_COGNITO_REGION: Stack.of(this).region,
        VITE_COGNITO_USER_POOL_ID: props.userPoolId,
        VITE_COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
        VITE_COGNITO_IDENTITY_POOL_ID: props.idPoolId,
        VITE_APP_SELF_SIGN_UP_ENABLED: props.selfSignUpEnabled.toString(),
        VITE_TRANSCRIBE_WEBSOCKET_URL: props.transcribeWebSocketEndpoint,
        // アバターCDN URL（CloudFront経由でアバターVRMファイルを配信）
        VITE_AVATAR_CDN_URL: `https://${cloudFrontWebDistribution.domainName}/avatars`,
        // AgentCore Runtime設定
        VITE_AGENTCORE_ENABLED: (props.agentCoreEnabled ?? false).toString(),
        VITE_AGENTCORE_NPC_CONVERSATION_ARN: props.npcConversationAgentArn ?? '',
        VITE_AGENTCORE_REALTIME_SCORING_ARN: props.realtimeScoringAgentArn ?? '',
      },
    });

    new CfnOutput(this, 'WebUrl', {
      value: `https://${cloudFrontWebDistribution.domainName}`,
    });

    new CfnOutput(this, 'AvatarCdnUrl', {
      value: `https://${cloudFrontWebDistribution.domainName}/avatars`,
      description: 'Avatar CDN URL (VITE_AVATAR_CDN_URL)',
    });

    this.distribution = cloudFrontWebDistribution;
  }
}
