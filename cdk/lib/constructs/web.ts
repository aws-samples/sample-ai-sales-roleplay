import { Stack, RemovalPolicy, Duration } from 'aws-cdk-lib';
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

    // #98: index.html（および errorResponses 経由で index.html に書き換えられる
    // SPA ディープリンク応答）に Cache-Control: no-cache を付与するためのポリシー。
    // deploy-time-build の NodejsBuild は S3 へ `aws s3 sync` する際に Cache-Control を
    // 付けられない（NodejsBuildProps に cacheControl が存在しない）ため、オリジンではなく
    // CloudFront のレスポンスヘッダーポリシーで注入する。これにより、アップデートのデプロイ後に
    // 古い index.html が最大 1 日（CACHING_OPTIMIZED の defaultTtl）配信され続ける問題を防ぐ。
    // no-cache = 毎回オリジンへ再検証（ETag/Last-Modified）。not-store ではないため 304 で軽量。
    const htmlResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'HtmlNoCachePolicy', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'no-cache', override: true },
        ],
      },
    });

    // #98: ファイル名にコンテンツハッシュを含む assets/* は long-term immutable キャッシュにする。
    // Vite は assets/ 配下へハッシュ付きファイル名で出力するため、内容が変われば URL も変わり、
    // 古いキャッシュが参照されることはない。
    const assetsResponseHeadersPolicy = new ResponseHeadersPolicy(this, 'AssetsImmutablePolicy', {
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'public, max-age=31536000, immutable', override: true },
        ],
      },
    });

    const { cloudFrontWebDistribution, s3BucketInterface } = new CloudFrontToS3(
      this,
      'Web',
      {
        insertHttpSecurityHeaders: false,
        loggingBucketProps: commonBucketProps,
        bucketProps: commonBucketProps,
        cloudFrontLoggingBucketProps: commonBucketProps,
        cloudFrontDistributionProps: {
          // デフォルトビヘイビア（/*）に no-cache を適用。index.html 本体に加え、
          // errorResponses(403/404 -> /index.html) 経由の SPA ディープリンク応答もここを通る。
          defaultBehavior: {
            responseHeadersPolicy: htmlResponseHeadersPolicy,
          },
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

    // #98: assets/* だけは immutable な長期キャッシュにする専用ビヘイビアを追加。
    // オリジンはデフォルトビヘイビアと同じ Web バケット（OAC 経由）。
    cloudFrontWebDistribution.addBehavior(
      '/assets/*',
      S3BucketOrigin.withOriginAccessControl(s3BucketInterface),
      {
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        responseHeadersPolicy: assetsResponseHeadersPolicy,
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
        corsBehavior: {
          accessControlAllowCredentials: false,
          accessControlAllowOrigins: ['*'],
          accessControlAllowMethods: ['GET', 'HEAD'],
          accessControlAllowHeaders: ['*'],
          accessControlMaxAge: Duration.seconds(3600),
          originOverride: true,
        },
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
            '.claude',
            '.vscode',
            'coverage',
            'playwright-report',
            'test-results',
            'tmp'
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
        // アバターCDN URL（CloudFront経由でアバターVRMファイルを配信）
        VITE_AVATAR_CDN_URL: `https://${cloudFrontWebDistribution.domainName}/avatars`,
        // AgentCore Runtime設定
        VITE_AGENTCORE_ENABLED: (props.agentCoreEnabled ?? false).toString(),
        VITE_AGENTCORE_NPC_CONVERSATION_ARN: props.npcConversationAgentArn ?? '',
        VITE_AGENTCORE_REALTIME_SCORING_ARN: props.realtimeScoringAgentArn ?? '',
      },
    });

    this.distribution = cloudFrontWebDistribution;
  }
}
